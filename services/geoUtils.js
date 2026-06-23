/** Shared geo/time helpers for GPS cleaning (mirrors autoresearch metrics.py). */

function parseTimeSec(point) {
  const t = point.received_at;
  if (t instanceof Date) return t.getTime() / 1000;
  return new Date(t).getTime() / 1000;
}

function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dphi = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dphi / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function median(values) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Hampel filter — replaces outliers with window median. */
function hampel(values, k, nSig) {
  const out = values.slice();
  for (let i = 0; i < values.length; i++) {
    const w = values.slice(Math.max(0, i - k), Math.min(values.length, i + k + 1));
    const med = median(w);
    const deviations = w.map((x) => Math.abs(x - med));
    const mad = median(deviations) * 1.4826;
    if (mad > 0 && Math.abs(values[i] - med) > nSig * mad) {
      out[i] = med;
    }
  }
  return out;
}

function bboxOfPoints(points, padDeg = 0.005) {
  const lats = [];
  const lons = [];
  for (const p of points) {
    const lat = Number(p.latitude);
    const lon = Number(p.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lon) && !(lat === 0 && lon === 0)) {
      lats.push(lat);
      lons.push(lon);
    }
  }
  if (!lats.length) return null;
  return [
    Math.min(...lats) - padDeg,
    Math.min(...lons) - padDeg,
    Math.max(...lats) + padDeg,
    Math.max(...lons) + padDeg,
  ];
}

module.exports = {
  parseTimeSec,
  haversineM,
  median,
  hampel,
  bboxOfPoints,
  STATIONARY_MAX_KMH: 3,
};