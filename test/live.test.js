// 실제 API 모드: 인터넷 대신 "공식 명세와 같은 모양의 가짜 응답"을 넣어 처리 코드를 검사합니다.
process.env.DATA_GO_KR_KEY = 'test-key';
process.env.KAKAO_REST_API_KEY = 'kakao-test-key';
process.env.USER_STORE_FILE = 'off';
process.env.LOG_CONVERSATIONS = 'off';
const test = require('node:test');
const assert = require('node:assert');

// 첫 말풍선 글자 (일반 글 또는 계획 카드의 제목+설명)
const firstText = (j) => { const o = j.template.outputs[0]; return o.simpleText ? o.simpleText.text : `${o.textCard.title}\n${o.textCard.description}`; };

// 카카오 장소 검색의 가짜 응답 (공식 문서의 필드 이름 그대로)
const kakaoDoc = (name, cat, extra = {}) => ({
  id: '1', place_name: name, category_name: cat, category_group_code: 'FD6', phone: '054-000-0000',
  address_name: '경북 경주시 황남동 1', road_address_name: '경북 경주시 첨성로 1', x: '129.21', y: '35.83',
  place_url: `http://place.map.kakao.com/${encodeURIComponent(name)}`, ...extra,
});
function kakaoAnswer(u, init) {
  assert.equal(init.headers.Authorization, 'KakaoAK kakao-test-key');
  const q = u.searchParams.get('query');
  const cat = u.searchParams.get('category_group_code');
  let docs = [];
  if (q.includes('남원')) docs = []; // 결과 없음 → 관광공사로 넘어가는지 확인
  else if (q === '대릉원 쌈밥') docs = [kakaoDoc('도솔마을', '음식점 > 한식 > 쌈밥')];
  else if (cat === 'AD5') docs = [kakaoDoc('OO모텔', '여행 > 숙박 > 모텔'), kakaoDoc('보성 녹차호텔', '여행 > 숙박 > 호텔')];
  else if (cat === 'AT4') docs = [kakaoDoc('대한다원', '여행 > 관광,명소 > 녹차밭')];
  else if (cat === 'FD6') docs = [kakaoDoc('보성 꼬막집', '음식점 > 한식 > 해물,생선')];
  return new Response(JSON.stringify({ documents: docs, meta: { total_count: docs.length } }), { status: 200 });
}

const ok = (item) => ({ response: { header: { resultCode: '00', resultMsg: 'NORMAL SERVICE.' }, body: { items: item ? { item } : '', totalCount: 1 } } });
const calls = [];

global.fetch = async (url, init = {}) => {
  const u = new URL(url);
  if (u.hostname === 'dapi.kakao.com') return kakaoAnswer(u, init);
  const op = u.pathname.split('/').pop();
  calls.push(op);
  let body;
  if (op === 'GetCtyCodeList') body = ok([{ citycode: 11, cityname: '서울특별시' }, { citycode: 37, cityname: '경상북도' }]);
  else if (op === 'GetCtyAcctoTrainSttnList') {
    body = u.searchParams.get('cityCode') === '11'
      ? ok([{ nodeid: 'NAT010000', nodename: '서울' }, { nodeid: 'NAT130126', nodename: '수서' }])
      : ok({ nodeid: 'NAT750760', nodename: '신경주' }); // 한 개일 때는 객체로 옴
  } else if (op === 'GetStrtpntAlocFndTrainInfo') {
    assert.equal(u.searchParams.get('depPlaceId'), 'NAT010000');
    assert.equal(u.searchParams.get('arrPlaceId'), 'NAT750760');
    body = ok([
      { trainno: 1, traingradename: 'KTX', depplandtime: 20261031051500, arrplandtime: 20261031072000, adultcharge: 49300 },
      { trainno: 3, traingradename: 'KTX', depplandtime: 20261031073000, arrplandtime: 20261031093500, adultcharge: 49300 },
      { trainno: 5, traingradename: 'KTX', depplandtime: 20261031083000, arrplandtime: 20261031103100, adultcharge: 49300 },
      { trainno: 9, traingradename: 'KTX-산천', depplandtime: 20261031103000, arrplandtime: 20261031123000, adultcharge: 49300 },
      { trainno: 13, traingradename: 'KTX', depplandtime: 20261031140000, arrplandtime: 20261031160500, adultcharge: 49300 },
    ]);
  } else if (op === 'locationBasedList2') {
    const t = u.searchParams.get('contentTypeId');
    body = ok([
      { title: `장소${t}-1`, addr1: '경상북도 경주시', firstimage: 'https://tong.visitkorea.or.kr/a.jpg', mapx: '129.33', mapy: '35.79', contenttypeid: t },
      { title: `장소${t}-2`, addr1: '경상북도 경주시', firstimage: '', mapx: '129.22', mapy: '35.83', contenttypeid: t },
    ]);
  } else if (op === 'searchKeyword2') {
    body = ok({ title: '선운사', mapx: '126.59', mapy: '35.5', contenttypeid: '12' });
  } else throw new Error('unexpected ' + op);
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

const { warmUp, findTrains } = require('../src/services/train');
const { stationByName } = require('../src/services/geo');
const { recommend } = require('../src/recommend');

test('열차: 역 ID를 불러와 시간표를 아침·오전·오후로 3편 고름', async () => {
  await warmUp();
  const r = await findTrains({ from: stationByName('서울'), to: stationByName('신경주'), dateYmd: '20261031' });
  assert.equal(r.source, 'live');
  assert.deepEqual(r.trains.map((t) => t.dep), ['07:30', '10:30', '14:00']); // 05:15 새벽 열차는 제외
  assert.equal(r.trains[0].minutes, 125);
  assert.equal(r.trains[0].fare, 49300);
  assert.equal(r.trains[1].grade, 'KTX-산천');
});

test('인기 여행지: 실제 시간표 + 직접 고른 추천 + 먹거리에 실제 가게', async () => {
  const json = await recommend('경주 여행 10월 31일', { imageUrl: 'https://x/noimage.png', now: new Date('2026-10-26T01:00:00Z') });
  const [summary, trains, cards] = json.template.outputs;
  assert.doesNotMatch(firstText(json), /예시예요/);
  assert.match(trains.listCard.items[0].title, /KTX 07:30 출발 → 09:35 도착/);
  assert.match(trains.listCard.items[0].description, /2명 98,600원/);

  const food = cards.carousel.items.find((c) => c.title.startsWith('🍚 쌈밥'));
  assert.match(food.description, /추천 가게: 도솔마을/);
  assert.match(food.description, /💰 1인/);
  const review = food.buttons.find((b) => b.label === '사진·후기 보기');
  assert.match(review.webLinkUrl, /^https:\/\/place\.map\.kakao\.com\//, 'http 링크는 https로 바꿈');
});

test('추천 데이터 없는 지역: 카카오 장소 검색 결과 (모텔 제외)', async () => {
  const json = await recommend('보성 여행', { imageUrl: 'https://x/n.png' });
  const cards = json.template.outputs[2].carousel.items;
  const titles = cards.map((c) => c.title).join(' ');
  assert.match(titles, /🏨 보성 녹차호텔/);
  assert.doesNotMatch(titles, /모텔/);
  assert.match(titles, /📍 대한다원/);
  assert.ok(cards[0].buttons.some((b) => b.label === '사진·후기 보기'));
});

test('카카오 검색 결과가 없으면 관광공사 정보와 사진', async () => {
  const json = await recommend('남원 여행', { imageUrl: 'https://x/noimage.png' });
  const imgs = json.template.outputs[2].carousel.items.map((c) => c.thumbnail.imageUrl);
  assert.ok(imgs.includes('https://tong.visitkorea.or.kr/a.jpg'));
  assert.ok(imgs.includes('https://x/noimage.png'));
});

test('목록에 없는 지명은 관광공사 검색으로 위치를 찾음', async () => {
  // 고창 같은 시·군은 내장 목록에 있으니, 목록에 없는 관광지 이름으로 확인
  const json = await recommend('선운사 여행', { imageUrl: 'https://x/n.png' });
  assert.match(firstText(json), /선운사 여행 계획/);
  assert.ok(calls.includes('searchKeyword2'));
});
