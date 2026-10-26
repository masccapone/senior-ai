// 한국관광공사 TourAPI 4.0 (KorService2)
// - 여행지 이름 → 위치 (내장 목록에 없을 때)
// - 여행지 주변 숙소·관광지·음식점 (직접 고른 추천·카카오 검색이 없을 때)
const config = require('../config');
const { getJson, items } = require('./http');
const { DESTINATIONS } = require('../data/destinations');
const { CITIES } = require('../data/cities');

const TYPE = { sights: 12, hotels: 32, foods: 39 };

function commonParams() {
  return { MobileOS: 'ETC', MobileApp: config.appName };
}

// 여행지 이름 → { name, lat, lng, island }
async function resolveDestination(name) {
  if (!name) return null;
  const known = DESTINATIONS[name] || CITIES[name];
  if (known) return { name, lat: known[0], lng: known[1], island: !!(known[2] && known[2].island), source: 'local' };

  if (config.dataGoKrKey) {
    try {
      const list = items(
        await getJson(config.tourApiBase, 'searchKeyword2', { ...commonParams(), keyword: name, numOfRows: 10, pageNo: 1, arrange: 'O' }),
      );
      const hit = list.find((x) => Number(x.mapy) && Number(x.mapx));
      if (hit) {
        const lat = Number(hit.mapy);
        const lng = Number(hit.mapx);
        return { name, lat, lng, island: lat < 34 || lng > 130.5, source: 'live' };
      }
    } catch (e) {
      console.warn('[tour] 여행지 검색 실패:', e.message);
    }
  }
  return null;
}

function toPlace(x) {
  return {
    title: x.title,
    addr: [x.addr1, x.addr2].filter(Boolean).join(' '),
    image: x.firstimage || x.firstimage2 || '',
    lat: Number(x.mapy) || null,
    lng: Number(x.mapx) || null,
    tel: x.tel || '',
  };
}

async function livePlaces(dest, kind, count) {
  const list = items(
    await getJson(config.tourApiBase, 'locationBasedList2', {
      ...commonParams(),
      mapX: dest.lng, mapY: dest.lat, radius: 15000, contentTypeId: TYPE[kind],
      numOfRows: count, pageNo: 1, arrange: 'Q', // Q: 대표사진이 있는 것 중 최근 수정순
    }),
  );
  return list.map(toPlace);
}

module.exports = { resolveDestination, livePlaces };
