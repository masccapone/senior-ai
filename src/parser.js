// 사용자가 쓴 문장 하나에서 여행지·출발지·날짜·인원을 알아냅니다.
// 예) "다음주 토요일 부산에서 둘이 경주 1박2일"
// 비어 있는 값은 기본값(서울 출발 · 다가오는 토요일 · 1박 · 2명)으로 채우고,
// 무엇을 기본값으로 채웠는지 assumed 에 표시합니다.
const { DESTINATIONS } = require('./data/destinations');
const { ORIGIN_ALIASES, STATIONS } = require('./data/stations');
const { CITIES, AMBIGUOUS, ORIGIN_GROUPS } = require('./data/cities');

// 여행지로 알아볼 이름: 여행지 목록 + 전국 시·군 (긴 이름 먼저, 일상어와 겹치는 지명 제외)
const DEST_NAMES = [...new Set([...Object.keys(DESTINATIONS), ...Object.keys(CITIES)])]
  .filter((n) => !AMBIGUOUS.has(n))
  .sort((a, b) => b.length - a.length);

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const DEFAULT_ORIGIN = '서울';
const DEFAULT_PEOPLE = 2;
const DEFAULT_NIGHTS = 1;

// 한국 시간 기준 "오늘" (서버가 해외 시간대여도 맞게)
function kstToday(now = new Date()) {
  const k = new Date(now.getTime() + 9 * 3600 * 1000);
  return new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()));
}

function addDays(d, n) {
  return new Date(d.getTime() + n * 86400000);
}

function parseDate(text, today) {
  const dow = today.getUTCDay();

  // 11월 3일 / 11/3 / 11.3
  let m = text.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/) || text.match(/(?:^|\s)(\d{1,2})[/.](\d{1,2})(?=\s|$|[가-힣])/);
  if (m) {
    const month = Number(m[1]);
    const day = Number(m[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      let d = new Date(Date.UTC(today.getUTCFullYear(), month - 1, day));
      if (d < today) d = new Date(Date.UTC(today.getUTCFullYear() + 1, month - 1, day));
      return { date: d, matched: m[0] };
    }
  }

  const rel = { 오늘: 0, 내일: 1, 모레: 2, 글피: 3 };
  m = text.match(/오늘|내일|모레|글피/);
  if (m) return { date: addDays(today, rel[m[0]]), matched: m[0] };

  // (이번주|다음주|다다음주)? (토요일|주말)
  m = text.match(/(이번\s*주|다음\s*주|담주|다다음\s*주)?\s*(?:([월화수목금토일])요일|(주말))/);
  if (m) {
    const target = m[3] ? 6 : DAYS.indexOf(m[2]);
    const prefix = (m[1] || '').replace(/\s/g, '');
    let d;
    if (prefix) {
      const monday = addDays(today, -((dow + 6) % 7));
      d = addDays(monday, (target + 6) % 7);
      if (prefix === '다음주' || prefix === '담주') d = addDays(d, 7);
      if (prefix === '다다음주') d = addDays(d, 14);
      if (d < today) d = addDays(d, 7);
    } else {
      d = addDays(today, (target - dow + 7) % 7 || 7);
    }
    return { date: d, matched: m[0] };
  }
  return null;
}

const WORD_PEOPLE = [
  [/혼자|나홀로|1인/, 1],
  [/둘이|두\s*명|두\s*사람|부부|커플|우리\s*둘|둘/, 2],
  [/셋이|세\s*명|세\s*사람|셋/, 3],
  [/넷이|네\s*명|네\s*사람|넷/, 4],
  [/다섯/, 5],
  [/여섯/, 6],
];

function parsePeople(text) {
  const m = text.match(/(\d{1,2})\s*(?:명|인|사람)/);
  if (m && Number(m[1]) > 0) return { people: Math.min(Number(m[1]), 9), matched: m[0] };
  for (const [re, n] of WORD_PEOPLE) {
    const w = text.match(re);
    if (w) return { people: n, matched: w[0] };
  }
  return null;
}

function parseNights(text) {
  const m = text.match(/(\d)\s*박\s*(?:\d\s*일)?/);
  if (m) return { nights: Number(m[1]), matched: m[0] };
  const d = text.match(/당일치기|당일/);
  if (d) return { nights: 0, matched: d[0] };
  return null;
}

// 알아들을 수 있는 지명: 출발지 별칭 + 여행지 + 전국 시·군 (긴 이름 먼저)
// 일상 단어와 겹치는 지명(예산·장수 등)은 "○○에서"처럼 분명할 때만 지명으로 봅니다.
const PLACE_NAMES = [...new Set([...Object.keys(ORIGIN_ALIASES), ...Object.keys(DESTINATIONS), ...Object.keys(CITIES)])]
  .filter((n) => !AMBIGUOUS.has(n))
  .sort((a, b) => b.length - a.length);
const isKnownPlace = (w) => !!(ORIGIN_ALIASES[w] || DESTINATIONS[w] || CITIES[w]);

function originResult(word, matched) {
  // 별칭에 없는 지명은 여행지 좌표로 가장 가까운 역을 나중에 찾음
  return isKnownPlace(word) ? { origin: word, matched } : { origin: word, matched, unknown: true };
}

function parseOrigin(text) {
  // 1) "부산에서", "부산역에서", "부산 출발", "부산발"
  let m = text.match(/([가-힣]{2,6}?)(?:역)?\s*(?:에서|출발|발(?=\s|$))/);
  if (m) return originResult(m[1], m[0]);
  // 2) "부산 → 경주", "부산->경주", "부산-경주", "부산~경주"
  m = text.match(/([가-힣]{2,6}?)(?:역)?\s*(?:→|->|➡|-|~)\s*(?=[가-힣])/);
  if (m) return originResult(m[1], m[0]);
  // 3) 아는 지명이 두 개면 앞이 출발지: "부산 경주 여행"
  const found = [];
  let masked = text;
  for (const name of PLACE_NAMES) {
    let i = masked.indexOf(name);
    while (i !== -1) {
      found.push({ name, i });
      masked = masked.slice(0, i) + ' '.repeat(name.length) + masked.slice(i + name.length);
      i = masked.indexOf(name);
    }
  }
  found.sort((a, b) => a.i - b.i);
  if (found.length >= 2 && found[0].name !== found[found.length - 1].name) {
    // "부산 해운대", "제주 서귀포"처럼 가까운 두 곳은 한 여행지를 자세히 말한 것 → 출발지로 보지 않음
    const a = coordOf(found[0].name);
    const b = coordOf(found[found.length - 1].name);
    if (a && b && distanceKm(a[0], a[1], b[0], b[1]) < 30) return null;
    return { origin: found[0].name, matched: found[0].name };
  }
  return null;
}

function coordOf(name) {
  if (DESTINATIONS[name]) return DESTINATIONS[name];
  if (CITIES[name]) return CITIES[name];
  const st = ORIGIN_ALIASES[name] && STATIONS.find((s) => s.name === ORIGIN_ALIASES[name]);
  return st ? [st.lat, st.lng] : null;
}

function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const r = (x) => (x * Math.PI) / 180;
  const h = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function parseIntent(text) {
  const found = [];
  if (/맛집|먹거리|식당|음식|먹을/.test(text)) found.push('foods');
  if (/관광지|볼거리|가볼|구경|명소/.test(text)) found.push('sights');
  if (/숙소|호텔|숙박|묵을|잘\s*곳/.test(text)) found.push('hotels');
  if (/기차|열차|ktx|srt|기차표/i.test(text)) found.push('trains');
  if (found.length === 1 && !/여행/.test(text)) return found[0];
  return 'all';
}

const STOP = new Set([
  '여행', '여행지', '추천', '좀', '부탁', '가요', '가자', '갈래', '가기', '가는', '가려고', '가려는데',
  '기차', '기차표', '열차', '호텔', '숙소', '숙박', '관광지', '관광', '맛집', '볼거리', '먹거리', '식당', '코스',
  '일정', '이번', '다음', '주말', '쯤', '정도', '나들이', '놀러', '구경', '보기', '알려', '보여',
  '어디', '뭐', '어때', '어때요', '해줘', '해주세요', '주세요', '줘', '싶어', '싶어요', '싶다', '가고', '하고',
  '처음으로', '다시', '명소', '가볼', '만한', '곳', '같이', '함께', '우리', '가족', '부모님', '친구',
]);
const PARTICLE = /(으로|에서|까지|하고|에|로|을|를|이|가|은|는|도|랑|의)$/;

function parseDestination(text, originWord) {
  // 1) 알려진 여행지·시·군 이름이 문장에 있으면 그것을 씀 (긴 이름 우선, 출발지는 제외)
  const names = DEST_NAMES;
  for (const name of names) {
    if (name === originWord) continue;
    if (text.includes(name)) return name;
  }
  // 2) 나머지 단어 중 의미 있는 첫 단어
  for (let tok of text.split(/\s+/)) {
    tok = tok.replace(/[^가-힣a-zA-Z]/g, '').replace(/여행$/, '');
    tok = tok.replace(PARTICLE, '');
    if (tok.length < 2 || STOP.has(tok) || tok === originWord) continue;
    if (/^(싶|가고|추천|알려|보여|해주|부탁|출발|바꿔|바꾸)/.test(tok)) continue;
    return tok;
  }
  return null;
}

function formatDate(d) {
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일(${DAYS[d.getUTCDay()]})`;
}

function ymd(d, sep = '') {
  const p = (n) => String(n).padStart(2, '0');
  return [d.getUTCFullYear(), p(d.getUTCMonth() + 1), p(d.getUTCDate())].join(sep);
}

/**
 * @param {string} utterance
 * @param {Date} now
 * @param {{rememberedOrigin?: string}} opts 이 사용자가 지난번에 쓴 출발지
 */
function parse(utterance, now = new Date(), { rememberedOrigin } = {}) {
  let raw = String(utterance || '').trim();
  const today = kstToday(now);

  if (/^(처음으로|처음|시작|도움말|안녕|메뉴|사용법)\s*$/.test(raw) || raw === '') {
    return { command: 'welcome', raw };
  }
  // "출발지 바꾸기 경주 여행 10월 31일 2명 1박"        → 출발지 고르기 1단계(지역)
  // "출발지 바꾸기 [강원 2] 경주 여행 10월 31일 2명 1박" → 2단계(강원 시·군 2쪽)
  let command;
  let originGroup = null;
  let originPage = 1;
  const co = raw.match(/^출발지\s*(?:바꾸기|변경|선택)\s*(?:\[([^\]\d]+?)\s*(\d*)\])?\s*/);
  if (co) {
    command = 'chooseOrigin';
    if (co[1] && ORIGIN_GROUPS[co[1].trim()]) {
      originGroup = co[1].trim();
      originPage = Number(co[2]) || 1;
    }
    raw = raw.slice(co[0].length);
  }
  let rest = raw;
  const cut = (s) => { if (s) rest = rest.replace(s, ' '); };

  const nights = parseNights(rest); if (nights) cut(nights.matched);
  const date = parseDate(rest, today); if (date) cut(date.matched);
  const people = parsePeople(rest); if (people) cut(people.matched);
  const origin = parseOrigin(rest); if (origin) cut(origin.matched);
  const intent = parseIntent(raw);
  const destination = parseDestination(rest, origin && origin.origin);

  const travelDate = date ? date.date : addDays(today, (6 - today.getUTCDay() + 7) % 7 || 7);
  const n = nights ? nights.nights : DEFAULT_NIGHTS;

  // 출발지: 문장에 있으면 그것 → 없으면 지난번 출발지 → 없으면 서울
  let originName = DEFAULT_ORIGIN;
  let originSource = 'default';
  if (origin && !origin.unknown) {
    originName = origin.origin;
    originSource = 'said';
  } else if (rememberedOrigin && isKnownPlace(rememberedOrigin)) {
    originName = rememberedOrigin;
    originSource = 'remembered';
  }

  return {
    raw,
    command,
    originGroup,
    originPage,
    destination,
    origin: originName,
    originSource,
    unknownOrigin: origin && origin.unknown ? origin.origin : null,
    date: travelDate,
    returnDate: addDays(travelDate, n),
    nights: n,
    people: people ? people.people : DEFAULT_PEOPLE,
    intent,
    assumed: { origin: originSource === 'default', date: !date, people: !people, nights: !nights },
  };
}

module.exports = { parse, formatDate, ymd, kstToday, addDays, DAYS, isKnownPlace };
