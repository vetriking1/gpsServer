/**
 * GPS route cleaning — data-validated approach.
 *
 * Real-data finding: the MOVING track is already ~98% on-road; the messy maps come from STOPPED
 * points — the parked truck's GPS jitters into a scattered cloud (and a depot/yard is legitimately
 * off-road, so snapping those to a road is WRONG). So:
 *
 *   1. drop invalid/low-satellite fixes
 *   2. reject implied-speed "teleport" outliers (vs the last good point)
 *   3. segment the day into moving / stopped runs by speed
 *   4. STOP runs  -> collapse the jitter cloud to its centroid (kept where it parked, NOT snapped)
 *   5. MOVING runs -> HMM map-match onto the road network via Valhalla (the "Google/Uber" snap)
 *
 * Returns points in the same shape the route endpoint already sends (lat/lon corrected).
 */

const { parseTimeSec, haversineM, median, STATIONARY_MAX_KMH } = require('./geoUtils');
const { matchGeometry } = require('./mapMatch');

const GPS_MAX_SPEED_KMH = 120;
const GPS_MIN_SAT = 4;
const GPS_MIN_JUMP_M = 30;
const GPS_MAX_CONSEC_REJECT = 5;

function isValidFix(p) {
  const lat = Number(p.latitude);
  const lon = Number(p.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat === 0 && lon === 0) return false;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return false;
  const sats = p.satellites;
  if (sats != null && Number(sats) < GPS_MIN_SAT) return false;
  return true;
}

/**
 * Turn matched road geometry into route points carrying the run's time span + average speed.
 * Timestamps are spread by cumulative DISTANCE (constant-speed assumption) so the implied speed
 * between geometry vertices stays sane and downstream filters don't reject the dense path.
 */
function geometryToPoints(geom, runPts) {
  const t0 = parseTimeSec(runPts[0]) * 1000;
  const t1 = parseTimeSec(runPts[runPts.length - 1]) * 1000;
  const span = Math.max(1, t1 - t0);
  const speeds = runPts.map((p) => Number(p.speed) || 0).filter((s) => s > 0);
  const avgSpeed = speeds.length ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length) : 0;
  const base = runPts[0];

  const cum = [0];
  for (let k = 1; k < geom.length; k++) {
    cum.push(cum[k - 1] + haversineM(geom[k - 1][0], geom[k - 1][1], geom[k][0], geom[k][1]));
  }
  const total = cum[cum.length - 1] || 1;

  return geom.map((g, k) => {
    const iso = new Date(t0 + (cum[k] / total) * span).toISOString();
    return {
      ...base,
      latitude: g[0],
      longitude: g[1],
      speed: avgSpeed,
      course: null,
      satellites: null,
      timestamp: iso,
      received_at: iso,
    };
  });
}

function rejectOutliers(pts) {
  if (pts.length <= 2) return pts;
  const accepted = [pts[0]];
  let rejects = 0;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    const ref = accepted[accepted.length - 1];
    const dt = parseTimeSec(p) - parseTimeSec(ref);
    const d = haversineM(Number(ref.latitude), Number(ref.longitude), Number(p.latitude), Number(p.longitude));
    const kmh = dt > 0 ? (d / dt) * 3.6 : d <= GPS_MIN_JUMP_M ? 0 : 1e9;
    if (d <= GPS_MIN_JUMP_M || kmh <= GPS_MAX_SPEED_KMH) {
      accepted.push(p);
      rejects = 0;
    } else if ((rejects += 1) >= GPS_MAX_CONSEC_REJECT) {
      accepted.push(p);
      rejects = 0;
    }
  }
  return accepted;
}

/**
 * @param {object[]} route Raw DB route rows (any order; sorted internally).
 * @returns {Promise<object[]>} Cleaned route (moving runs map-matched, stops collapsed).
 */
async function cleanGpsRoute(route) {
  let pts = route.filter(isValidFix).slice().sort((a, b) => parseTimeSec(a) - parseTimeSec(b));
  if (pts.length <= 2) return pts;
  pts = rejectOutliers(pts);

  // segment into consecutive moving / stopped runs
  const runs = [];
  let cur = [pts[0]];
  let curMoving = (Number(pts[0].speed) || 0) > STATIONARY_MAX_KMH;
  for (let i = 1; i < pts.length; i++) {
    const moving = (Number(pts[i].speed) || 0) > STATIONARY_MAX_KMH;
    if (moving === curMoving) {
      cur.push(pts[i]);
    } else {
      runs.push({ moving: curMoving, pts: cur });
      cur = [pts[i]];
      curMoving = moving;
    }
  }
  runs.push({ moving: curMoving, pts: cur });

  // Map-match all moving runs CONCURRENTLY (capped) instead of one-at-a-time — the per-run Valhalla
  // calls are network-bound, so this turns ~sum(latency) into ~max(latency) per batch.
  const CONCURRENCY = 6;
  const movingRuns = runs.filter((r) => r.moving);
  const geomByRun = new Map();
  for (let s = 0; s < movingRuns.length; s += CONCURRENCY) {
    const batch = movingRuns.slice(s, s + CONCURRENCY);
    // eslint-disable-next-line no-await-in-loop
    const results = await Promise.all(batch.map((r) => matchGeometry(r.pts)));
    batch.forEach((r, idx) => geomByRun.set(r, results[idx]));
  }

  const out = [];
  for (const run of runs) {
    if (!run.moving) {
      // collapse the stop's jitter cloud to its centroid (a parked truck stays where it parked)
      const cLat = median(run.pts.map((p) => Number(p.latitude)));
      const cLon = median(run.pts.map((p) => Number(p.longitude)));
      for (const p of run.pts) out.push({ ...p, latitude: cLat, longitude: cLon });
    } else {
      // matched ROAD GEOMETRY so the path follows roads even between sparsely-logged points
      const geom = geomByRun.get(run);
      if (geom && geom.length >= 2) {
        out.push(...geometryToPoints(geom, run.pts));
      } else {
        for (const p of run.pts) out.push({ ...p }); // matching failed → keep raw run
      }
    }
  }
  return out;
}

module.exports = {
  cleanGpsRoute,
  GPS_DEFAULTS: { GPS_MAX_SPEED_KMH, GPS_MIN_SAT, GPS_MIN_JUMP_M, GPS_MAX_CONSEC_REJECT },
};
