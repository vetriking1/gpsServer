/**
 * mapMatch.js — HMM map matching via a public Valhalla server (free, OSM-based).
 *
 * Returns the matched ROAD GEOMETRY (the `shape` of the matched path), NOT just the snapped input
 * points. This matters: GPS logs sparsely while driving, so connecting snapped points still draws
 * straight chords across blocks. The road geometry follows the actual roads between sparse points
 * (turns at intersections, goes around blocks) — the "Google Timeline" path.
 *
 * Results are cached in-memory; failures/timeouts return null so the caller keeps the raw run.
 */

const VALHALLA_URL =
  process.env.VALHALLA_URL || 'https://valhalla1.openstreetmap.de/trace_attributes';
const TIMEOUT_MS = Number(process.env.VALHALLA_TIMEOUT_MS || 8000);
const CHUNK = 400;
const CACHE_MAX = 500;

const cache = new Map(); // key -> [[lat, lon], ...] | null

function keyOf(points) {
  return points.map((p) => `${Number(p.latitude).toFixed(5)},${Number(p.longitude).toFixed(5)}`).join(';');
}

function cacheGet(k) {
  if (!cache.has(k)) return undefined;
  const v = cache.get(k);
  cache.delete(k);
  cache.set(k, v); // LRU touch
  return v;
}

function cacheSet(k, v) {
  cache.set(k, v);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}

// Decode a Valhalla-encoded polyline (precision 1e6) to [[lat, lon], ...].
function decodePolyline6(str) {
  const coords = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < str.length) {
    let shift = 0;
    let result = 0;
    let byte;
    do {
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;
    do {
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    coords.push([lat / 1e6, lng / 1e6]);
  }
  return coords;
}

async function matchChunkGeometry(points) {
  const body = JSON.stringify({
    shape: points.map((p) => ({ lat: Number(p.latitude), lon: Number(p.longitude) })),
    costing: 'auto',
    shape_match: 'map_snap',
    trace_options: { search_radius: 50, gps_accuracy: 8 },
  });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(VALHALLA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'aarov-fleet/1.0' },
      body,
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`valhalla ${res.status}`);
    const json = await res.json();
    return json.shape ? decodePolyline6(json.shape) : null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Map-match a moving run of points to the road network.
 * @returns {Promise<[number,number][]|null>} road geometry, or null if matching failed.
 */
async function matchGeometry(points) {
  if (!points || points.length < 2) return null;
  const k = keyOf(points);
  const cached = cacheGet(k);
  if (cached !== undefined) return cached;

  let out = [];
  try {
    for (let s = 0; s < points.length; s += CHUNK) {
      // eslint-disable-next-line no-await-in-loop
      const part = await matchChunkGeometry(points.slice(s, s + CHUNK));
      if (part && part.length) out = out.concat(part);
    }
  } catch (err) {
    out = null;
  }
  const result = out && out.length >= 2 ? out : null;
  cacheSet(k, result);
  return result;
}

module.exports = { matchGeometry };
