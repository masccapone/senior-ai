// 직접 고른 추천 데이터 점검: 빠진 칸·너무 긴 문구가 없는지
const test = require('node:test');
const assert = require('node:assert');
const { CURATED } = require('../src/data/curated');
const { DESTINATIONS } = require('../src/data/destinations');

const SHORT = 22; // 카드 한 줄에 들어가는 대략적인 글자 수

test('모든 추천 지역은 위치(좌표)가 등록돼 있음', () => {
  for (const name of Object.keys(CURATED)) assert.ok(DESTINATIONS[name], `${name} 좌표 없음`);
});

test('항목마다 필요한 칸이 다 있고 문구가 짧음', () => {
  for (const [region, d] of Object.entries(CURATED)) {
    assert.ok(d.hotels.length >= 1 && d.sights.length >= 3 && d.foods.length >= 2, `${region} 항목 수`);
    for (const h of d.hotels) {
      for (const k of ['name', 'price', 'why', 'tip']) assert.ok(h[k], `${region} 숙소 ${h.name} ${k}`);
      assert.ok(h.why.length <= SHORT, `${region} ${h.name} why 길이`);
    }
    for (const s of d.sights) {
      for (const k of ['name', 'time', 'why', 'tip']) assert.ok(s[k], `${region} 가볼곳 ${s.name} ${k}`);
      assert.ok(s.why.length <= SHORT, `${region} ${s.name} why 길이`);
    }
    for (const f of d.foods) {
      for (const k of ['dish', 'where', 'price', 'why', 'search']) assert.ok(f[k], `${region} 먹거리 ${f.dish} ${k}`);
      assert.ok(f.why.length <= SHORT, `${region} ${f.dish} why 길이`);
    }
  }
});
