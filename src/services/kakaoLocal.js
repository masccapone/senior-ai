// 카카오 로컬(장소 검색) API — 실제 가게·숙소·명소 이름, 주소, 전화, 카카오맵 상세페이지(사진·후기).
// 키: https://developers.kakao.com → 내 애플리케이션 → 앱 키 → "REST API 키"
const config = require('../config');

const BASE = 'https://dapi.kakao.com/v2/local/search';
const CATEGORY = { hotels: 'AD5', foods: 'FD6', sights: 'AT4' };

async function keyword({ query, category, lat, lng, radius = 20000, size = 5 }) {
  const params = new URLSearchParams({ query, size: String(size), sort: 'accuracy' });
  if (category) params.set('category_group_code', category);
  if (lat && lng) {
    params.set('x', String(lng));
    params.set('y', String(lat));
    params.set('radius', String(radius));
  }
  const res = await fetch(`${BASE}/keyword.json?${params}`, {
    headers: { Authorization: `KakaoAK ${config.kakaoRestKey}` },
    signal: AbortSignal.timeout(config.apiTimeoutMs),
  });
  if (!res.ok) throw new Error(`카카오 장소 검색 HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`);
  const body = await res.json();
  return body.documents || [];
}

// 어르신 여행에 어울리지 않는 곳은 뺍니다 (모텔, 패스트푸드·편의점 등)
const EXCLUDE = {
  hotels: /모텔|여관|게스트하우스|캠핑/,
  foods: /패스트푸드|편의점|간식>.*아이스크림|술집|호프|바\(BAR\)/,
  sights: /노래방|PC방|당구/,
};

const QUERY = { hotels: '호텔', foods: '맛집', sights: '관광명소' };

function toPlace(d) {
  const cat = String(d.category_name || '').split('>').map((s) => s.trim());
  return {
    title: d.place_name,
    category: cat[cat.length - 1] || '',
    addr: d.road_address_name || d.address_name || '',
    phone: d.phone || '',
    lat: Number(d.y) || null,
    lng: Number(d.x) || null,
    placeUrl: String(d.place_url || '').replace(/^http:\/\//, 'https://'),
  };
}

// 여행지 주변 숙소/맛집/명소 n곳
async function nearby(dest, kind, n) {
  const docs = await keyword({
    query: `${dest.name} ${QUERY[kind]}`, category: CATEGORY[kind], lat: dest.lat, lng: dest.lng, size: 15,
  });
  const ok = docs.filter((d) => !EXCLUDE[kind].test(d.category_name || ''));
  // 먹거리는 식사 되는 곳을 먼저, 빵집·간식은 뒤로 (검색 순서는 유지)
  if (kind === 'foods') {
    const snack = (d) => (/제과|베이커리|간식|디저트|떡/.test(d.category_name || '') ? 1 : 0);
    ok.sort((a, b) => snack(a) - snack(b));
  }
  return ok.slice(0, n).map(toPlace);
}

// 추천 먹거리에 맞는 실제 가게 1곳 (예: "대릉원 쌈밥")
async function bestMatch(query, dest) {
  const docs = await keyword({ query, category: CATEGORY.foods, lat: dest.lat, lng: dest.lng, size: 3 });
  return docs.length ? toPlace(docs[0]) : null;
}

module.exports = { nearby, bestMatch, keyword };
