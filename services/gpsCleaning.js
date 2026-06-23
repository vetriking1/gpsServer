/**
 * GPS route cleaning — full port of autoresearch winner (commit 16faa68 / methods.py clean_gps).
 *
 * Pipeline: valid-fix filter → implied-speed outliers → Hampel lat/lon → OSM road snap →
 * post-repair speed clamp.
 */

const { parseTimeSec, haversineM, hampel, STATIONARY_MAX_KMH } = require('./geoUtils');
const { getRoadIndexForRoute } = require('./roadNetwork');

const GPS_MAX_SPEED_KMH = 120;
const GPS_MIN_SAT = 4;
const GPS_MIN_JUMP_M = 30;
const GPS_MAX_CONSEC_REJECT = 5;
const GPS_SNAP_OFFROAD_M = 7;
const GPS_SNAP_STOPPED_M = 25;
const GPS_HAMPEL_K = 5;
const GPS_HAMPEL_SIG = 2;
const GPS_POST_MAX_KMH = 120;

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

function clonePoint(p) {
  return { ...p };
}

/**
 * @param {object[]} route Raw DB route rows (ordered any way; sorted internally).
 * @returns {Promise<object[]>} Cleaned route (may move lat/lon; drops speed outliers).
 */
async function cleanGpsRoute(route) {
  const pts = route.filter(isValidFix).slice().sort((a, b) => parseTimeSec(a) - parseTimeSec(b));
  if (pts.length <= 2) return pts;

  const accepted = [pts[0]];
  let rejects = 0;

  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    const ref = accepted[accepted.length - 1];
    const dt = parseTimeSec(p) - parseTimeSec(ref);
    const d = haversineM(
      Number(ref.latitude),
      Number(ref.longitude),
      Number(p.latitude),
      Number(p.longitude)
    );
    const kmh = dt > 0 ? (d / dt) * 3.6 : d <= GPS_MIN_JUMP_M ? 0 : 1e9;

    if (d <= GPS_MIN_JUMP_M || kmh <= GPS_MAX_SPEED_KMH) {
      accepted.push(p);
      rejects = 0;
    } else {
      rejects += 1;
      if (rejects >= GPS_MAX_CONSEC_REJECT) {
        accepted.push(p);
        rejects = 0;
      }
    }
  }

  let repaired = accepted.map(clonePoint);

  if (repaired.length >= 3) {
    const lats = hampel(
      repaired.map((p) => Number(p.latitude)),
      GPS_HAMPEL_K,
      GPS_HAMPEL_SIG
    );
    const lons = hampel(
      repaired.map((p) => Number(p.longitude)),
      GPS_HAMPEL_K,
      GPS_HAMPEL_SIG
    );
    repaired = repaired.map((p, i) => ({
      ...p,
      latitude: lats[i],
      longitude: lons[i],
    }));
  }

  let roadIndex = null;
  try {
    roadIndex = await getRoadIndexForRoute(repaired);
  } catch (err) {
    console.warn('road index skipped:', err.message);
  }
  if (roadIndex && repaired.length >= 2) {
    repaired = repaired.map((p) => {
      const q = clonePoint(p);
      const lat = Number(q.latitude);
      const lon = Number(q.longitude);
      const dist = roadIndex.nearestDistM(lat, lon);
      if (dist != null) {
        const speed = Number(q.speed) || 0;
        const thresh = speed > STATIONARY_MAX_KMH ? GPS_SNAP_OFFROAD_M : GPS_SNAP_STOPPED_M;
        if (dist > thresh) {
          const snap = roadIndex.snapToRoad(lat, lon);
          q.latitude = snap.lat;
          q.longitude = snap.lon;
        }
      }
      return q;
    });
  }

  if (repaired.length >= 2) {
    const fixed = [repaired[0]];
    for (let i = 1; i < repaired.length; i++) {
      const p = repaired[i];
      const ref = fixed[fixed.length - 1];
      const dt = parseTimeSec(p) - parseTimeSec(ref);
      const d = haversineM(
        Number(ref.latitude),
        Number(ref.longitude),
        Number(p.latitude),
        Number(p.longitude)
      );
      const kmh = dt > 0 ? (d / dt) * 3.6 : 0;

      if (d > GPS_MIN_JUMP_M && kmh > GPS_POST_MAX_KMH) {
        const frac = Math.min(1, (GPS_POST_MAX_KMH * dt) / 3.6 / d);
        const q = clonePoint(p);
        q.latitude = Number(ref.latitude) + frac * (Number(p.latitude) - Number(ref.latitude));
        q.longitude = Number(ref.longitude) + frac * (Number(p.longitude) - Number(ref.longitude));

        if (roadIndex) {
          const dist = roadIndex.nearestDistM(q.latitude, q.longitude);
          if (dist != null && dist > GPS_SNAP_OFFROAD_M) {
            const snap = roadIndex.snapToRoad(q.latitude, q.longitude);
            q.latitude = snap.lat;
            q.longitude = snap.lon;
          }
        }
        fixed.push(q);
      } else {
        fixed.push(p);
      }
    }
    return fixed;
  }

  return repaired;
}

module.exports = {
  cleanGpsRoute,
  GPS_DEFAULTS: {
    GPS_MAX_SPEED_KMH,
    GPS_MIN_SAT,
    GPS_SNAP_OFFROAD_M,
    GPS_SNAP_STOPPED_M,
    GPS_HAMPEL_K,
    GPS_HAMPEL_SIG,
    GPS_POST_MAX_KMH,
  },
};