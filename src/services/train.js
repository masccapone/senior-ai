// 기차 추천.
// - 키가 있으면: 국토교통부 TAGO 열차정보 API (코레일 열차 시간표·어른 요금)
// - 키가 없거나 실패하면: 거리로 계산한 "예시 시간표"
// SRT는 공개 API가 없어 예매 링크만 안내합니다.
const config = require('../config');
const { getJson, items } = require('./http');
const { distanceKm } = require('./geo');

const SEOUL_AREA = new Set(['서울', '용산', '수서', '광명', '청량리', '수원', '동탄', '평택지제']);

// ---------- 실제 API ----------
let stationIdCache = null; // { '서울': 'NAT010000', ... }
let stationIdLoading = null;

const norm = (name) => String(name).replace(/\(.*?\)/g, '').replace(/역$/, '').trim();

async function loadStationIds() {
  const base = config.trainApiBase;
  const cities = items(await getJson(base, 'GetCtyCodeList', {}));
  const map = {};
  await Promise.all(
    cities.map(async (c) => {
      try {
        const list = items(await getJson(base, 'GetCtyAcctoTrainSttnList', { cityCode: c.citycode, numOfRows: 200, pageNo: 1 }));
        for (const s of list) map[norm(s.nodename)] = s.nodeid;
      } catch (e) {
        console.warn('[train] 역 목록 일부 실패:', c.cityname, e.message);
      }
    }),
  );
  if (Object.keys(map).length === 0) throw new Error('역 목록이 비어 있음');
  stationIdCache = map;
  console.log(`[train] 역 ID ${Object.keys(map).length}개 불러옴`);
  return map;
}

// 서버 시작 때 미리 불러둡니다 (첫 요청이 5초를 넘지 않도록).
function warmUp() {
  if (!config.dataGoKrKey || stationIdLoading) return stationIdLoading;
  stationIdLoading = loadStationIds().catch((e) => {
    console.warn('[train] 역 ID 불러오기 실패 → 예시 시간표 사용:', e.message);
    stationIdLoading = null; // 다음 요청 때 다시 시도
  });
  return stationIdLoading;
}

const hhmm = (v) => {
  const s = String(v); // YYYYMMDDHHMMSS
  return `${s.slice(8, 10)}:${s.slice(10, 12)}`;
};
const minutesBetween = (a, b) => {
  const t = (v) => {
    const s = String(v);
    return Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +s.slice(10, 12)) / 60000;
  };
  return Math.round(t(b) - t(a));
};

async function liveTrains(from, to, dateYmd) {
  if (!stationIdCache) {
    warmUp();
    return null; // 아직 준비 안 됨 → 이번엔 예시로
  }
  const depId = stationIdCache[norm(from.name)];
  const arrId = stationIdCache[norm(to.name)];
  if (!depId || !arrId) return null;
  const list = items(
    await getJson(config.trainApiBase, 'GetStrtpntAlocFndTrainInfo', {
      depPlaceId: depId, arrPlaceId: arrId, depPlandTime: dateYmd, numOfRows: 100, pageNo: 1,
    }),
  );
  return list
    .filter((t) => Number(hhmm(t.depplandtime).slice(0, 2)) >= 7) // 너무 이른 새벽 열차 제외
    .sort((a, b) => String(a.depplandtime).localeCompare(String(b.depplandtime)))
    .map((t) => ({
      grade: t.traingradename,
      trainNo: t.trainno,
      dep: hhmm(t.depplandtime),
      arr: hhmm(t.arrplandtime),
      minutes: minutesBetween(t.depplandtime, t.arrplandtime),
      fare: Number(t.adultcharge) || null,
    }));
}

// 아침·점심·오후 고르게 3개
function pickSpread(list, n = 3) {
  if (list.length <= n) return list;
  const slots = ['07:00', '10:00', '13:00'];
  const picked = [];
  for (const s of slots) {
    const t = list.find((x) => x.dep >= s && !picked.includes(x));
    if (t) picked.push(t);
  }
  for (const t of list) if (picked.length < n && !picked.includes(t)) picked.push(t);
  return picked.slice(0, n).sort((a, b) => a.dep.localeCompare(b.dep));
}

// ---------- 예시 시간표 ----------
function mockTrains(from, to) {
  const km = distanceKm(from.lat, from.lng, to.lat, to.lng) * 1.3; // 선로는 직선보다 깁니다
  const fast = from.grade !== 'ITX' && to.grade !== 'ITX';
  const grade = fast ? (from.grade === 'SRT' ? 'SRT' : 'KTX') : '일반열차';
  const speed = fast ? 150 : 85; // 정차 포함 평균 km/h
  const perKm = fast ? 140 : 75; // 원/km
  const minutes = Math.max(30, Math.round((km / speed) * 60 / 5) * 5);
  const fare = Math.round((km * perKm) / 100) * 100;
  return ['07:30', '10:00', '13:30'].map((dep, i) => {
    const [h, m] = dep.split(':').map(Number);
    const end = h * 60 + m + minutes;
    const arr = `${String(Math.floor(end / 60) % 24).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
    return { grade, trainNo: `예시${i + 1}`, dep, arr, minutes, fare };
  });
}

/**
 * @returns {{trains: Array, source: 'live'|'mock'|'none', srt: boolean, note?: string}}
 */
async function findTrains({ from, to, dateYmd }) {
  if (!from || !to) return { trains: [], source: 'none', srt: false };
  if (from.name === to.name || distanceKm(from.lat, from.lng, to.lat, to.lng) < 25) {
    return { trains: [], source: 'none', srt: false, note: '출발지와 가까워서 기차보다 버스·자동차가 편해요.' };
  }
  const srt = !!to.srt && SEOUL_AREA.has(from.name);
  if (config.dataGoKrKey) {
    try {
      const live = await liveTrains(from, to, dateYmd);
      if (live && live.length) return { trains: pickSpread(live), source: 'live', srt };
      if (live) return { trains: [], source: 'live', srt, note: '이 날짜에 바로 가는 코레일 열차가 없어요. 갈아타는 표는 코레일에서 찾아보세요.' };
    } catch (e) {
      console.warn('[train] API 실패 → 예시 시간표:', e.message);
    }
  }
  return { trains: mockTrains(from, to), source: 'mock', srt };
}

module.exports = { findTrains, warmUp, mockTrains, pickSpread };
