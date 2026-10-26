// 숙소·가볼 곳·먹거리 추천을 고르는 곳.
//
// 우선순위
//   1) 직접 고른 추천 (src/data/curated.js) — 왜 좋은지·걷기 난이도·가격대 포함
//      └ 카카오 키가 있으면 먹거리에 "실제 추천 가게"를 붙임
//   2) 카카오 장소 검색 (KAKAO_REST_API_KEY) — 실제 가게·숙소, 사진·후기 페이지
//   3) 관광공사 TourAPI (DATA_GO_KR_KEY)
//   4) 아무 키도 없으면 지도 검색 카드
const config = require('../config');
const { CURATED } = require('../data/curated');
const kakao = require('./kakaoLocal');
const tour = require('./tour');

const enc = encodeURIComponent;
const mapSearch = (q) => `https://map.kakao.com/link/search/${enc(q)}`;
const mapAt = (title, lat, lng) => `https://map.kakao.com/link/map/${enc(title)},${lat},${lng}`;
const withDest = (name, dest) => (name.includes(dest.name) ? name : `${dest.name} ${name}`);
const shortAddr = (a) => String(a || '').split(' ').slice(1, 4).join(' ');

// 공통 모양: { name, title, line1, line2, image, mapUrl, detailUrl, source }
// 캐러셀 카드는 제목 2줄·설명 2줄까지만 보이므로
//   제목 = 이름 + 가격/시간,  설명 1줄 = 왜 좋은지,  설명 2줄 = 걷기·가격

function fromCurated(kind, it, dest) {
  if (kind === 'hotels') {
    return { name: it.name, title: `${it.name} · ${it.price}`, line1: it.why, line2: `👣 ${it.tip}`, mapUrl: mapSearch(withDest(it.name, dest)), source: 'curated' };
  }
  if (kind === 'sights') {
    return { name: it.name, title: `${it.name} · ${it.time}`, line1: it.why, line2: `👣 ${it.tip}`, mapUrl: mapSearch(withDest(it.name, dest)), source: 'curated' };
  }
  return { name: it.dish, title: `${it.dish} · ${it.where}`, line1: it.why, line2: `💰 ${it.price}`, mapUrl: mapSearch(it.search), source: 'curated', search: it.search };
}

// 먹거리 추천에 실제 가게를 붙임: "추천 가게: OO식당" (전화·사진·후기는 [사진·후기 보기]에서)
async function attachShop(item, dest) {
  try {
    const shop = await kakao.bestMatch(item.search, dest);
    if (!shop) return item;
    return {
      ...item,
      line1: `추천 가게: ${shop.title}`,
      detailUrl: shop.placeUrl,
      mapUrl: shop.lat ? mapAt(shop.title, shop.lat, shop.lng) : item.mapUrl,
    };
  } catch (e) {
    console.warn('[places] 가게 검색 실패:', e.message);
    return item;
  }
}

function fromKakao(p) {
  return {
    title: p.title,
    line1: p.category,
    line2: `📍 ${shortAddr(p.addr)}`,
    mapUrl: p.lat ? mapAt(p.title, p.lat, p.lng) : mapSearch(p.title),
    detailUrl: p.placeUrl,
    source: 'kakao',
  };
}

function fromTour(kind, p, dest) {
  const what = { hotels: '숙소', sights: '관광지', foods: '음식점' }[kind];
  return {
    title: p.title,
    line1: what,
    line2: `📍 ${shortAddr(p.addr)}`,
    image: p.image,
    mapUrl: p.lat ? mapAt(p.title, p.lat, p.lng) : mapSearch(withDest(p.title, dest)),
    source: 'tour',
  };
}

function searchCard(kind, dest) {
  const label = { sights: '가볼 만한 곳', hotels: '숙소', foods: '맛집' }[kind];
  return {
    title: `${dest.name} ${label}`,
    line1: '추천을 준비 중인 지역이에요',
    line2: '카카오맵에서 사진·후기를 보세요',
    mapUrl: mapSearch(`${dest.name} ${label}`),
    source: 'search',
  };
}

async function forKind(dest, kind, count) {
  const cur = CURATED[dest.name] && CURATED[dest.name][kind];
  if (cur && cur.length) {
    const list = cur.slice(0, count).map((it) => fromCurated(kind, it, dest));
    if (kind === 'foods' && config.kakaoRestKey) return Promise.all(list.map((it) => attachShop(it, dest)));
    return list;
  }
  if (config.kakaoRestKey) {
    try {
      const list = await kakao.nearby(dest, kind, count);
      if (list.length) return list.map(fromKakao);
    } catch (e) {
      console.warn(`[places] 카카오 ${kind} 실패:`, e.message);
    }
  }
  if (config.dataGoKrKey) {
    try {
      const list = await tour.livePlaces(dest, kind, count);
      if (list.length) return list.map((p) => fromTour(kind, p, dest));
    } catch (e) {
      console.warn(`[places] 관광공사 ${kind} 실패:`, e.message);
    }
  }
  return [searchCard(kind, dest)];
}

/** kinds 예: ['hotels','sights','foods'] → { hotels:[...], sights:[...], foods:[...] } */
async function findPlaces(dest, kinds, count = 3) {
  const lists = await Promise.all(kinds.map((k) => forKind(dest, k, count)));
  const out = {};
  kinds.forEach((k, i) => (out[k] = lists[i]));
  return out;
}

const hasCurated = (name) => !!CURATED[name];

module.exports = { findPlaces, hasCurated };
