// 서버를 실제로 띄워 카카오와 같은 형식으로 요청을 보내 봅니다. (API 키 없이 예시 데이터)
process.env.DATA_GO_KR_KEY = '';
process.env.KAKAO_REST_API_KEY = '';
process.env.USER_STORE_FILE = 'off'; // 테스트에서는 파일에 저장하지 않음
process.env.LOG_CONVERSATIONS = 'off';
const test = require('node:test');
const assert = require('node:assert');
const { server } = require('../src/server');

let base;
test.before(async () => {
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

// userId를 안 주면 매번 새 사용자 (출발지 기억이 다른 테스트에 섞이지 않게)
const ask = async (utterance, userId = `u-${Math.random()}`) => {
  const res = await fetch(`${base}/skill`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userRequest: { utterance, user: { id: userId, type: 'botUserKey' } }, bot: { id: 'b' }, action: { params: {} } }),
  });
  assert.equal(res.status, 200);
  return res.json();
};

// 카카오 형식 규칙 검사
function checkKakao(json) {
  assert.equal(json.version, '2.0');
  const outs = json.template.outputs;
  assert.ok(outs.length >= 1 && outs.length <= 3, '말풍선 1~3개');
  assert.ok(json.template.quickReplies.length <= 10);
  for (const r of json.template.quickReplies) {
    assert.ok(r.label.length <= 14, `바로가기 글자 수: ${r.label}`);
    assert.ok(r.messageText);
  }
  for (const o of outs) {
    const btns = [];
    if (o.simpleText) assert.ok(o.simpleText.text.length <= 1000);
    if (o.listCard) {
      assert.ok(o.listCard.items.length >= 1 && o.listCard.items.length <= 5);
      btns.push(...o.listCard.buttons);
    }
    if (o.carousel) {
      assert.equal(o.carousel.type, 'basicCard');
      assert.ok(o.carousel.items.length >= 1 && o.carousel.items.length <= 10);
      for (const c of o.carousel.items) {
        assert.ok(c.thumbnail && c.thumbnail.imageUrl.startsWith('http'), '카드 그림 필수');
        assert.ok(c.title.length <= 50);
        assert.ok(c.buttons.length >= 1 && c.buttons.length <= 3);
        assert.ok(c.description.split('\n').length <= 2, `캐러셀 카드 설명은 2줄까지: ${c.description}`);
        btns.push(...c.buttons);
      }
    }
    for (const b of btns) {
      assert.ok(b.label.length <= 14, `버튼 글자 수: ${b.label}`);
      if (b.action === 'webLink') assert.ok(/^https:\/\//.test(b.webLinkUrl));
    }
  }
}

test('"경주 여행" → 요약 + 기차 목록 + 숙소·관광·맛집 카드', async () => {
  const json = await ask('경주 여행');
  checkKakao(json);
  const [summary, trains, places] = json.template.outputs;
  assert.match(summary.simpleText.text, /경주 여행 추천/);
  assert.match(trains.listCard.header.title, /신경주역/);
  assert.match(trains.listCard.items[0].title, /KTX/);
  assert.ok(trains.listCard.items.some((i) => /SRT/.test(i.title)), '서울 출발이면 SRT 안내');
  const titles = places.carousel.items.map((c) => c.title).join(' ');
  assert.match(titles, /🏨 힐튼 경주/);
  assert.match(titles, /📍 불국사/);
  assert.match(titles, /🍚 쌈밥/);
  // 직접 고른 추천에는 이유·가격·걷기 정보가 들어 있음
  const hotel = places.carousel.items[0];
  assert.match(hotel.title, /힐튼 경주 · 1박 15~25만원대/);
  assert.match(hotel.description, /보문호수/);
  assert.match(hotel.description, /👣/);
  assert.equal(hotel.buttons[0].label, '가격·예약 보기');
  assert.doesNotMatch(hotel.buttons[0].webLinkUrl, /%EB%A7%8C%EC%9B%90/, '예약 검색어에는 가격이 들어가면 안 됨');
  // 설명 한 줄은 카드 폭에 맞게 짧게
  for (const c of places.carousel.items) {
    for (const line of c.description.split('\n')) assert.ok(line.length <= 24, `너무 긴 줄: ${line}`);
  }
  // 출발지를 안 썼으니 기본값 안내와 [출발지 바꾸기]가 맨 앞
  assert.match(summary.simpleText.text, /서울 \(기본값\)/);
  assert.equal(json.template.quickReplies[0].label, '출발지 바꾸기');
});

test('출발지 바꾸기 → 도시 버튼 → 다음부터 기억', async () => {
  const user = 'senior-1';
  const first = await ask('경주 여행', user);
  const change = first.template.quickReplies.find((r) => r.label === '출발지 바꾸기');
  const menu = await ask(change.messageText, user);
  checkKakao(menu);
  assert.match(menu.template.outputs[0].simpleText.text, /어디에서 출발/);
  const labels = menu.template.quickReplies.map((r) => r.label);
  assert.ok(labels.includes('부산') && labels.includes('대구') && labels.includes('광주'));
  assert.ok(!labels.includes('경주'), '여행지는 출발지 후보에서 뺌');

  const busan = menu.template.quickReplies.find((r) => r.label === '부산');
  const res = await ask(busan.messageText, user);
  checkKakao(res);
  assert.match(res.template.outputs[1].listCard.header.title, /부산역 → 신경주역/);

  // 다른 여행지를 물어도 부산 출발로 기억
  const next = await ask('강릉 여행', user);
  assert.match(next.template.outputs[0].simpleText.text, /부산 \(지난번 출발지\)/);
  assert.match(next.template.outputs[1].listCard.header.title, /부산역 → 강릉역/);
});

test('출발지 2단계: 지역 → 시·군(여러 쪽) → 선택', async () => {
  const user = 'senior-3';
  const first = await ask('경주 여행', user);
  const menu = await ask(first.template.quickReplies.find((r) => r.label === '출발지 바꾸기').messageText, user);
  const top = menu.template.quickReplies.map((r) => r.label);
  assert.deepEqual(top, ['서울', '부산', '대구', '대전', '광주', '경기·인천', '강원', '충청', '전라', '경상']);

  // 전라 → 1쪽: 시·군 8곳 + [다음 ▶] + [◀ 지역 다시]
  const jeolla = await ask(menu.template.quickReplies.find((r) => r.label === '전라').messageText, user);
  checkKakao(jeolla);
  let labels = jeolla.template.quickReplies.map((r) => r.label);
  assert.equal(labels.length, 10);
  assert.equal(labels[8], '다음 ▶');
  assert.equal(labels[9], '◀ 지역 다시');
  assert.ok(labels.includes('전주') && labels.includes('목포'));
  assert.match(jeolla.template.outputs[0].simpleText.text, /전라 어디에서 출발하세요\? \(1\/5쪽\)/);

  // 다음 쪽을 넘겨 해남 고르기
  let page = jeolla;
  let haenam;
  for (let i = 0; i < 5 && !haenam; i++) {
    haenam = page.template.quickReplies.find((r) => r.label === '해남');
    if (!haenam) page = await ask(page.template.quickReplies.find((r) => r.label === '다음 ▶').messageText, user);
  }
  assert.ok(haenam, '해남을 찾을 수 있어야 함');
  const res = await ask(haenam.messageText, user);
  checkKakao(res);
  assert.match(res.template.outputs[0].simpleText.text, /출발 {2}해남/);
  assert.match(res.template.outputs[0].simpleText.text, /기차는 목포역에서 타요/);
  assert.match(res.template.outputs[1].listCard.header.title, /목포역 → 신경주역/);

  // 다음에도 해남 출발로 기억
  const next = await ask('전주 여행', user);
  assert.match(next.template.outputs[0].simpleText.text, /해남 \(지난번 출발지\)/);
});

test('모든 지역의 모든 시·군을 버튼으로 고를 수 있음', async () => {
  const { ORIGIN_GROUPS } = require('../src/data/cities');
  const first = await ask('제주 여행');
  const menu = await ask(first.template.quickReplies.find((r) => r.label === '출발지 바꾸기').messageText);
  for (const [g, cities] of Object.entries(ORIGIN_GROUPS)) {
    const seen = new Set();
    let page = await ask(menu.template.quickReplies.find((r) => r.label === g).messageText);
    for (let i = 0; i < 10; i++) {
      checkKakao(page);
      page.template.quickReplies.forEach((r) => seen.add(r.label));
      const next = page.template.quickReplies.find((r) => r.label === '다음 ▶');
      if (!next) break;
      page = await ask(next.messageText);
    }
    for (const c of Object.keys(cities)) assert.ok(seen.has(c), `${g} ${c} 버튼 없음`);
  }
});

test('출발지만 말하면 기억하고 여행지를 물어봄', async () => {
  const user = 'senior-2';
  const json = await ask('대전에서 출발해요', user);
  assert.match(json.template.outputs[0].simpleText.text, /대전 출발로 기억/);
  const next = await ask('여수 여행', user);
  assert.match(next.template.outputs[1].listCard.header.title, /대전역 → 여수엑스포역/);
});

test('화살표로 적은 출발지', async () => {
  const json = await ask('광주 → 경주 여행');
  checkKakao(json);
  assert.match(json.template.outputs[1].listCard.header.title, /광주송정역 → 신경주역/);
});

test('부산 출발 · 4명 → 요금이 4명분', async () => {
  const json = await ask('부산에서 4명 강릉 다음주 토요일');
  checkKakao(json);
  const trains = json.template.outputs[1].listCard;
  assert.match(trains.header.title, /부산역 → 강릉역/);
  assert.match(trains.items[0].description, /4명/);
});

test('제주 → 비행기 안내', async () => {
  const json = await ask('제주 여행');
  checkKakao(json);
  assert.match(json.template.outputs[1].listCard.header.title, /비행기/);
});

test('추천 데이터가 없는 지역(키도 없음)은 카카오맵 카드로 응답', async () => {
  const json = await ask('남원 여행');
  checkKakao(json);
  assert.match(json.template.outputs[1].listCard.header.title, /남원역/);
  const card = json.template.outputs[2].carousel.items[0];
  assert.equal(card.buttons[0].label, '카카오맵에서 보기');
});

test('관광지 더보기', async () => {
  const json = await ask('경주 관광지');
  checkKakao(json);
  assert.equal(json.template.outputs[1].carousel.items.length, 5);
});

test('바로가기 문장을 다시 보내도 같은 조건 유지', async () => {
  const first = await ask('부산에서 둘이 경주 11월 8일');
  const later = first.template.quickReplies.find((r) => r.label === '일주일 뒤로');
  assert.match(later.messageText, /11월 15일/);
  assert.match(later.messageText, /부산에서/);
  const json = await ask(later.messageText);
  checkKakao(json);
  assert.match(json.template.outputs[0].simpleText.text, /11월 15일/);
});

test('알 수 없는 말 → 다시 묻기', async () => {
  const json = await ask('여행 가고 싶어요');
  checkKakao(json);
  assert.match(json.template.outputs[0].simpleText.text, /어디로/);
});

test('처음으로 → 사용법', async () => {
  const json = await ask('처음으로');
  checkKakao(json);
  assert.match(json.template.outputs[0].simpleText.text, /이렇게 적어/);
});

test('기본 그림이 PNG로 나옴', async () => {
  const res = await fetch(`${base}/static/noimage.png`);
  assert.equal(res.headers.get('content-type'), 'image/png');
  const buf = Buffer.from(await res.arrayBuffer());
  assert.equal(buf.slice(1, 4).toString(), 'PNG');
});
