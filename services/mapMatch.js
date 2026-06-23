/**
 * mapMatch.js — HMM map matching via a public Valhalla server (free, OSM-based).
 *
 * Snaps a *moving* run of GPS points to the most probable connected road path (the "Google/Uber"
 * snap), instead of projecting each point to its nearest road independently (which zig-zags across
 * blocks). Results are cached in-memory; failures/timeouts fall back to the raw coordinates so the
 * route endpoint never breaks.
 */

const VALHALLA_URL =
  process.env.VALHALLA_URL || 'https://valhalla1.openstreetmap.de/trace_attributes';
const TIMEOUT_MS = Number(process.env.VALHALLA_TIMEOUT_MS || 8000);
const CHUNK = 400; // max points per request (continuity within a chunk)
const CACHE_MAX = 500;

const cache = new Map(); // key -> [[lat, lon], ...]

function keyOf(points) {
  return points.map((p) => `${Number(p.latitude).toFixed(5)},${Number(p.longitude).toFixed(5)}`).join(';');
}

function cacheGet(k) {
  if (!cache.has(k)) return null;
  const v = cache.get(k);
  cache.delete(k);
  cache.set(k, v); // LRU touch
  return v;
}

function cacheSet(k, v) {
  cache.set(k, v);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}

async function matchChunk(points) {
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
    const mp = json.matched_points || [];
    return points.map((p, i) => {
      const m = mp[i];
      if (m && (m.type === 'matched' || m.type === 'interpolated') && m.lat != null) {
        return [m.lat, m.lon];
      }
      return [Number(p.latitude), Number(p.longitude)]; // unmatched → keep raw
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Map-match a moving run of points. Returns [[lat, lon], ...] aligned 1:1 with the input.
 * On any failure returns the raw coordinates.
 */
async function matchPoints(points) {
  if (!points || points.length < 2) {
    return (points || []).map((p) => [Number(p.latitude), Number(p.longitude)]);
  }
  const k = keyOf(points);
  const hit = cacheGet(k);
  if (hit) return hit;

  let out = [];
  try {
    for (let s = 0; s < points.length; s += CHUNK) {
      // eslint-disable-next-line no-await-in-loop
      const part = await matchChunk(points.slice(s, s + CHUNK));
      out = out.concat(part);
    }
  } catch (err) {
    out = points.map((p) => [Number(p.latitude), Number(p.longitude)]);
  }
  cacheSet(k, out);
  return out;
}

module.exports = { matchPoints };
