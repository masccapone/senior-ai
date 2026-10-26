const test = require('node:test');
const assert = require('node:assert');
const { parse, ymd } = require('../src/parser');

// 기준일: 2026-10-26(월) 한국시간 오전 10시
const NOW = new Date('2026-10-26T01:00:00Z');

test('"경주 여행" → 기본값으로 채움', () => {
  const q = parse('경주 여행', NOW);
  assert.equal(q.destination, '경주');
  assert.equal(q.origin, '서울');
  assert.equal(q.people, 2);
  assert.equal(q.nights, 1);
  assert.equal(ymd(q.date), '20261031'); // 다가오는 토요일
  assert.deepEqual(q.assumed, { origin: true, date: true, people: true, nights: true });
  assert.equal(q.intent, 'all');
});

test('한 문장에 모두 적은 경우', () => {
  const q = parse('다음주 토요일 부산에서 둘이 경주 1박2일', NOW);
  assert.equal(q.destination, '경주');
  assert.equal(q.origin, '부산');
  assert.equal(q.people, 2);
  assert.equal(q.nights, 1);
  assert.equal(ymd(q.date), '20261107');
});

test('날짜·숫자 인원', () => {
  const q = parse('강릉 여행 11월 3일 4명', NOW);
  assert.equal(q.destination, '강릉');
  assert.equal(ymd(q.date), '20261103');
  assert.equal(q.people, 4);
});

test('지난 날짜는 내년으로', () => {
  const q = parse('전주 3월 1일', NOW);
  assert.equal(ymd(q.date), '20270301');
});

test('내일, 혼자, 당일치기', () => {
  const q = parse('내일 혼자 여수 당일치기', NOW);
  assert.equal(q.destination, '여수');
  assert.equal(ymd(q.date), '20261027');
  assert.equal(q.people, 1);
  assert.equal(q.nights, 0);
});

test('"서울역에서" 출발 · 조사 붙은 여행지', () => {
  const q = parse('서울역에서 안동으로 가고 싶어요', NOW);
  assert.equal(q.origin, '서울');
  assert.equal(q.destination, '안동');
});

test('목록에 없는 여행지도 단어로 뽑음', () => {
  const q = parse('고창 여행 추천해 주세요', NOW);
  assert.equal(q.destination, '고창');
});

test('관광지/맛집/숙소/기차만 보기', () => {
  assert.equal(parse('경주 관광지', NOW).intent, 'sights');
  assert.equal(parse('경주 맛집', NOW).intent, 'foods');
  assert.equal(parse('경주 숙소', NOW).intent, 'hotels');
  assert.equal(parse('경주 기차', NOW).intent, 'trains');
});

test('출발지를 여러 방식으로 적어도 알아들음', () => {
  const cases = [
    ['부산에서 경주 여행', '부산', '경주'],
    ['대구 출발 전주', '대구', '전주'],
    ['광주발 강릉 여행', '광주', '강릉'],
    ['대전 → 여수 1박2일', '대전', '여수'],
    ['울산-안동', '울산', '안동'],
    ['청주 경주 여행', '청주', '경주'],
    ['동대구역에서 순천', '동대구', '순천'],
  ];
  for (const [text, origin, dest] of cases) {
    const q = parse(text, NOW);
    assert.equal(q.origin, origin, text);
    assert.equal(q.destination, dest, text);
    assert.equal(q.originSource, 'said', text);
  }
});

test('전국 시·군 출발지', () => {
  const cases = [
    ['해남에서 경주 여행', '해남', '경주'],
    ['철원 → 강릉', '철원', '강릉'],
    ['김천 출발 여수 1박', '김천', '여수'],
    ['예산에서 경주', '예산', '경주'], // 일상어와 겹치는 지명도 "에서"가 붙으면 지명
    ['홍천 담양 여행', '홍천', '담양'],
  ];
  for (const [text, origin, dest] of cases) {
    const q = parse(text, NOW);
    assert.equal(q.origin, origin, text);
    assert.equal(q.destination, dest, text);
  }
});

test('헷갈리는 경우는 출발지로 짐작하지 않음', () => {
  // "예산"은 돈 이야기
  let q = parse('예산 10만원으로 경주 여행', NOW);
  assert.equal(q.originSource, 'default');
  assert.equal(q.destination, '경주');
  // 가까운 두 곳은 한 여행지
  q = parse('부산 해운대 여행', NOW);
  assert.equal(q.originSource, 'default');
  assert.equal(q.destination, '해운대');
});

test('목록에 없던 시·군도 여행지로 알아들음', () => {
  assert.equal(parse('고창 여행 가고 싶어요', NOW).destination, '고창');
  assert.equal(parse('해남으로 1박2일', NOW).destination, '해남');
});

test('출발지 고르기 2단계 명령', () => {
  const q = parse('출발지 바꾸기 [경기·인천 2] 경주 여행 11월 7일 2명 1박', NOW);
  assert.equal(q.command, 'chooseOrigin');
  assert.equal(q.originGroup, '경기·인천');
  assert.equal(q.originPage, 2);
  assert.equal(q.destination, '경주');
});

test('출발지를 안 쓰면 지난번 출발지 → 없으면 서울', () => {
  assert.equal(parse('경주 여행', NOW, { rememberedOrigin: '대구' }).origin, '대구');
  assert.equal(parse('경주 여행', NOW, { rememberedOrigin: '대구' }).originSource, 'remembered');
  assert.equal(parse('경주 여행', NOW).originSource, 'default');
  // 문장에 쓴 출발지가 기억보다 우선
  assert.equal(parse('부산에서 경주', NOW, { rememberedOrigin: '대구' }).origin, '부산');
});

test('출발지 바꾸기 명령', () => {
  const q = parse('출발지 바꾸기 경주 여행 11월 7일 2명 1박', NOW);
  assert.equal(q.command, 'chooseOrigin');
  assert.equal(q.destination, '경주');
  assert.equal(ymd(q.date), '20261107');
});

test('처음으로 → 안내 메시지', () => {
  assert.equal(parse('처음으로', NOW).command, 'welcome');
});

test('여행지 없음', () => {
  assert.equal(parse('여행 가고 싶어요', NOW).destination, null);
});
