const { STATIONS } = require('../data/stations');

// 두 좌표 사이 직선거리(km)
function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// 가장 가까운 역. SRT 전용역(수서·동탄·평택지제)은 도착역 후보에서 뺍니다.
function nearestStation(lat, lng, { includeSrtOnly = false } = {}) {
  let best = null;
  for (const s of STATIONS) {
    if (!includeSrtOnly && s.grade === 'SRT') continue;
    const km = distanceKm(lat, lng, s.lat, s.lng);
    if (!best || km < best.km) best = { station: s, km };
  }
  return best;
}

// 출발역: 가장 가까운 역보다 25km 이내로 조금 더 가면 KTX역이 있으면 KTX역을 고릅니다.
// (예: 완도 → 보성역(일반열차)보다 목포역(KTX))
function nearestDepartureStation(lat, lng) {
  const all = STATIONS.filter((s) => s.grade !== 'SRT').map((s) => ({ station: s, km: distanceKm(lat, lng, s.lat, s.lng) }));
  all.sort((a, b) => a.km - b.km);
  const best = all[0];
  if (best.station.grade !== 'ITX') return best;
  const fast = all.find((x) => x.station.grade !== 'ITX' && x.km <= best.km + 25);
  return fast || best;
}

function stationByName(name) {
  return STATIONS.find((s) => s.name === name) || null;
}

module.exports = { distanceKm, nearestStation, nearestDepartureStation, stationByName };
