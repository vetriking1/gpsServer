/**
 * OSM road network for map-snapping (port of autoresearch-data/roads.py).
 * Fetches highway ways via Overpass, caches by bbox, nearest-road query in local metres.
 */

const fs = require('fs');
const path = require('path');

const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const OVERPASS_HEADERS = {
  'User-Agent': 'aarov-fleet-gps-backend/1.0 (gps route cleaning)',
  'Content-Type': 'application/x-www-form-urlencoded',
};

const CACHE_DIR = path.join(__dirname, '..', 'data', 'roads-cache');
const memoryCache = new Map();
const MEMORY_CACHE_MAX = 24;

function cacheKey(bbox) {
  return bbox.map((v) => v.toFixed(4)).join('_');
}

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

async function overpassQuery(query) {
  for (const url of OVERPASS_MIRRORS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: OVERPASS_HEADERS,
        body: query,
        signal: AbortSignal.timeout(90000),
      });
      const text = await res.text();
      if (res.ok && text.trim().startsWith('{')) {
        return JSON.parse(text);
      }
      console.warn(`overpass ${url} -> ${res.status}`);
    } catch (err) {
      console.warn(`overpass ${url} ERR ${err.message}`);
    }
  }
  return null;
}

async function fetchRoadWays(bbox) {
  const [s, w, n, e] = bbox;
  const query = `[out:json][timeout:120];way(${s},${w},${n},${e})[highway];out geom;`;
  console.log(`fetching OSM roads for bbox [${bbox.join(', ')}]`);
  const json = await overpassQuery(query);
  if (!json) return null;

  const ways = [];
  for (const el of json.elements || []) {
    if (el.type === 'way' && el.geometry) {
      ways.push(el.geometry.map((g) => [g.lat, g.lon]));
    }
  }
  return ways;
}

function project(lat, lon, lat0, lon0, mlon, mlat) {
  return [(lon - lon0) * mlon, (lat - lat0) * mlat];
}

function unproject(x, y, lat0, lon0, mlon, mlat) {
  return [y / mlat + lat0, x / mlon + lon0];
}

/** Nearest point on segment + distance in metres (projected plane). */
function nearestOnSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) {
    const d = Math.hypot(px - x1, py - y1);
    return { dist: d, x: x1, y: y1 };
  }
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const x = x1 + t * dx;
  const y = y1 + t * dy;
  return { dist: Math.hypot(px - x, py - y), x, y };
}

class RoadIndex {
  constructor(ways, bbox) {
    this.bbox = bbox;
    this.lat0 = (bbox[0] + bbox[2]) / 2;
    this.lon0 = (bbox[1] + bbox[3]) / 2;
    this.mlon = 111320 * Math.cos((this.lat0 * Math.PI) / 180);
    this.mlat = 110540;
    this.segments = [];

    for (const way of ways) {
      const pts = way
        .map(([lat, lon]) => project(lat, lon, this.lat0, this.lon0, this.mlon, this.mlat))
        .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
      for (let i = 0; i < pts.length - 1; i++) {
        this.segments.push([pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]]);
      }
    }
  }

  nearestDistM(lat, lon) {
    if (!this.segments.length) return null;
    const [px, py] = project(lat, lon, this.lat0, this.lon0, this.mlon, this.mlat);
    let best = Infinity;
    for (const [x1, y1, x2, y2] of this.segments) {
      const { dist } = nearestOnSegment(px, py, x1, y1, x2, y2);
      if (dist < best) best = dist;
    }
    return best;
  }

  snapToRoad(lat, lon) {
    if (!this.segments.length) return { lat, lon };
    const [px, py] = project(lat, lon, this.lat0, this.lon0, this.mlon, this.mlat);
    let best = { dist: Infinity, x: px, y: py };
    for (const [x1, y1, x2, y2] of this.segments) {
      const hit = nearestOnSegment(px, py, x1, y1, x2, y2);
      if (hit.dist < best.dist) best = hit;
    }
    const [snapLat, snapLon] = unproject(best.x, best.y, this.lat0, this.lon0, this.mlon, this.mlat);
    return { lat: snapLat, lon: snapLon };
  }
}

async function loadRoadIndex(bbox) {
  const key = cacheKey(bbox);
  if (memoryCache.has(key)) return memoryCache.get(key);

  ensureCacheDir();
  const filePath = path.join(CACHE_DIR, `${key}.json`);

  let ways = null;
  if (fs.existsSync(filePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      ways = data.ways;
    } catch (err) {
      console.warn(`road cache read failed ${filePath}: ${err.message}`);
    }
  }

  if (!ways) {
    ways = await fetchRoadWays(bbox);
    if (!ways) return null;
    fs.writeFileSync(filePath, JSON.stringify({ bbox, ways }), 'utf8');
    console.log(`cached ${ways.length} road ways -> ${filePath}`);
  }

  const index = new RoadIndex(ways, bbox);
  memoryCache.set(key, index);
  if (memoryCache.size > MEMORY_CACHE_MAX) {
    const oldest = memoryCache.keys().next().value;
    memoryCache.delete(oldest);
  }
  return index;
}

/** Build (or load) a road index covering the given route points. */
async function getRoadIndexForRoute(points) {
  const { bboxOfPoints } = require('./geoUtils');
  const bbox = bboxOfPoints(points);
  if (!bbox) return null;
  return loadRoadIndex(bbox);
}

module.exports = {
  RoadIndex,
  getRoadIndexForRoute,
  loadRoadIndex,
};