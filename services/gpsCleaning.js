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
const { matchPoints } = require('./mapMatch');

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

  const out = [];
  for (const run of runs) {
    if (!run.moving) {
      // collapse the stop's jitter cloud to its centroid (a parked truck stays where it parked)
      const cLat = median(run.pts.map((p) => Number(p.latitude)));
      const cLon = median(run.pts.map((p) => Number(p.longitude)));
      for (const p of run.pts) out.push({ ...p, latitude: cLat, longitude: cLon });
    } else {
      // map-match the moving run onto roads
      // eslint-disable-next-line no-await-in-loop
      const snapped = await matchPoints(run.pts);
      run.pts.forEach((p, i) => out.push({ ...p, latitude: snapped[i][0], longitude: snapped[i][1] }));
    }
  }
  return out;
}

module.exports = {
  cleanGpsRoute,
  GPS_DEFAULTS: { GPS_MAX_SPEED_KMH, GPS_MIN_SAT, GPS_MIN_JUMP_M, GPS_MAX_CONSEC_REJECT },
};
