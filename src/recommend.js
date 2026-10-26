// 사용자 문장 → 카카오톡 응답 JSON. 이 서비스의 핵심 흐름입니다.
//
// 1) 문장 해석 (여행지·출발지·날짜·인원). 출발지를 안 쓰면 지난번 출발지를 씀
// 2) 여행지 위치 → 가장 가까운 기차역
// 3) 기차 / 숙소·가볼 곳·먹거리를 동시에 조회
// 4) 50대 이상이 보기 쉬운 카드로 만들기
const { parse, formatDate, ymd, addDays } = require('./parser');
const { ORIGIN_ALIASES } = require('./data/stations');
const { DESTINATIONS } = require('./data/destinations');
const { nearestStation, nearestDepartureStation, stationByName } = require('./services/geo');
const { findTrains } = require('./services/train');
const { resolveDestination } = require('./services/tour');
const { findPlaces } = require('./services/places');
const store = require('./store');
const links = require('./links');
const K = require('./kakao');

const { CITIES, ORIGIN_GROUPS, ORIGIN_TOP } = require('./data/cities');

const POPULAR = ['경주', '부산', '강릉', '전주', '여수'];
const PER_PAGE = 8; // 2단계 한 쪽에 보여줄 시·군 수 (+ [다음 ▶] [◀ 지역 다시])
const INTENT_WORD = { all: '여행', sights: '관광지', foods: '맛집', hotels: '숙소', trains: '기차' };

const won = (n) => `${Number(n).toLocaleString('ko-KR')}원`;
const duration = (min) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return [h ? `${h}시간` : '', m ? `${m}분` : ''].filter(Boolean).join(' ');
};

function welcome() {
  return K.response(
    [
      K.simpleText(
        '안녕하세요! 여행 도우미예요 😊\n\n' +
          '가고 싶은 곳을 적어 보내 주세요.\n' +
          '기차표, 숙소, 가볼 곳을 골라 드려요.\n\n' +
          '✏️ 이렇게 적어 보세요\n' +
          '· 경주 여행\n' +
          '· 부산에서 둘이 강릉 다음주 토요일\n' +
          '· 대구 → 전주 1박2일 4명\n\n' +
          '※ 서비스를 고치는 데 쓰려고, 보내신 말을 이름 없이 기록해요.',
      ),
    ],
    POPULAR.map((p) => K.quickReply(`${p} 여행`)),
  );
}

function askAgain(text) {
  return K.response([K.simpleText(text)], [...POPULAR.map((p) => K.quickReply(`${p} 여행`)), K.quickReply('사용법', '도움말')]);
}

function originStationOf(originWord) {
  if (ORIGIN_ALIASES[originWord]) return stationByName(ORIGIN_ALIASES[originWord]);
  const c = CITIES[originWord] || DESTINATIONS[originWord];
  if (c) return nearestDepartureStation(c[0], c[1]).station;
  return stationByName('서울');
}

// 다음 대화에서 그대로 보낼 수 있는 "완전한 문장" (서버가 대화 상태를 기억하지 않아도 되도록)
function sentence(q, { date = q.date, intent = 'all', origin = q.origin } = {}) {
  const d = `${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일`;
  const from = origin ? `${origin}에서 ` : '';
  return `${q.destination} ${INTENT_WORD[intent]} ${from}${d} ${q.people}명 ${q.nights}박`.replace(/\s+/g, ' ');
}

// ---------- 출발지 고르기 (2단계) ----------
// 1단계: [서울][부산][대구][대전][광주][경기·인천][강원][충청][전라][경상]
// 2단계: 고른 지역의 시·군 8곳씩 + [다음 ▶] + [◀ 지역 다시]
// 버튼마다 "완전한 문장"을 보내므로 서버가 대화 상태를 기억하지 않아도 됩니다.
function chooseOrigin(q) {
  const rest = sentence(q, { intent: q.intent, origin: '' });
  const pickCity = (c) => K.quickReply(c, sentence(q, { origin: c, intent: q.intent }));
  const openGroup = (label, g, page = 1) => K.quickReply(label, `출발지 바꾸기 [${g}${page > 1 ? ` ${page}` : ''}] ${rest}`);

  if (!q.originGroup) {
    return K.response(
      [
        K.simpleText(
          '🚉 어디에서 출발하세요?\n\n' +
            '아래에서 사는 곳을 골라 주세요.\n' +
            '경기·강원·충청·전라·경상은 누르면 시·군이 나와요.\n\n' +
            '✏️ 직접 적어도 돼요. 예) 해남에서 출발\n\n' +
            '한 번 고르시면 다음부터 기억해 둘게요.',
        ),
      ],
      ORIGIN_TOP.filter((t) => t !== q.destination).map((t) => (ORIGIN_GROUPS[t] ? openGroup(t, t) : pickCity(t))),
    );
  }

  const g = q.originGroup;
  const all = Object.keys(ORIGIN_GROUPS[g]).filter((c) => c !== q.destination);
  const pages = Math.ceil(all.length / PER_PAGE);
  const page = Math.min(Math.max(1, q.originPage), pages);
  const list = all.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const replies = list.map(pickCity);
  if (page < pages) replies.push(openGroup('다음 ▶', g, page + 1));
  replies.push(K.quickReply('◀ 지역 다시', `출발지 바꾸기 ${rest}`));

  return K.response(
    [
      K.simpleText(
        `🚉 ${g} 어디에서 출발하세요? (${page}/${pages}쪽)\n\n` +
          (page < pages ? '목록에 없으면 [다음 ▶]을 눌러 주세요.\n' : '') +
          `✏️ 직접 적어도 돼요. 예) ${list[list.length - 1] || '해남'}에서 출발`,
      ),
    ],
    replies,
  );
}

function summaryText(q, dest, ctx) {
  const originTag = { said: '', remembered: ' (지난번 출발지)', default: ' (기본값)' }[q.originSource];
  const lines = [
    `🧳 ${dest.name} 여행 추천이에요`,
    '',
    `📍 출발  ${q.origin}${originTag}`,
    ...(ctx.from && !dest.island && ctx.from.name.replace(/\(.*\)/, '') !== q.origin ? [`🚉 기차는 ${ctx.from.name}역에서 타요`] : []),
    `📅 날짜  ${formatDate(q.date)}${q.nights ? ` · ${q.nights}박` : ' · 당일'}`,
    `👥 인원  ${q.people}명`,
  ];
  if (q.unknownOrigin) lines.push('', `※ '${q.unknownOrigin}' 출발역을 몰라서 ${q.origin} 기준으로 보여 드려요.`);
  if (q.originSource !== 'said') lines.push('', '👉 출발지가 다르면 아래 [출발지 바꾸기]를 눌러 주세요.');
  if (ctx.trainSource === 'mock') lines.push('', '※ 기차 시간·요금은 예시예요. 예매 화면에서 꼭 확인해 주세요.');
  if (q.assumed.date || q.assumed.people) {
    lines.push('', `날짜·인원이 다르면 이렇게 적어 주세요.\n예) ${dest.name} 여행 11월 8일 3명`);
  }
  return lines.join('\n');
}

// 기차는 옆으로 넘기는 카드 대신 "목록 한 장"으로: 시간표를 한눈에 비교할 수 있게.
function trainList(q, dest, from, to, result) {
  if (dest.island) {
    return K.listCard({
      header: `✈️ ${dest.name}는 비행기로 가요`,
      items: [{ title: '기차로는 갈 수 없는 곳이에요', description: '아래 버튼으로 항공권을 찾아보세요' }],
      buttons: [K.button.link('항공권 찾아보기', links.flightLink(q.origin, dest.name))],
    });
  }
  const items = result.trains.map((t) => ({
    title: `${t.grade} ${t.dep} 출발 → ${t.arr} 도착`,
    description: [duration(t.minutes), t.fare ? `${q.people}명 ${won(t.fare * q.people)}` : ''].filter(Boolean).join(' · '),
    url: links.korail(),
  }));
  if (!items.length) items.push({ title: result.note || '바로 가는 기차를 찾지 못했어요', url: links.korail() });
  if (result.srt) items.push({ title: `SRT: 수서역 → ${to.station.name}역도 있어요`, description: '강남·분당에서 가까워요', url: links.srt() });
  if (to.km > 15) items.push({ title: `🚌 ${to.station.name}역 → ${dest.name} 약 ${Math.round(to.km)}km`, description: '역에서 버스·택시로 가요' });

  const buttons = [K.button.link('코레일에서 예매', links.korail())];
  if (result.srt) buttons.push(K.button.link('SRT에서 예매', links.srt()));
  return K.listCard({ header: `🚆 ${from.name}역 → ${to.station.name}역`, items, buttons });
}

// 숙소·가볼 곳·먹거리 카드 (2줄: 왜 좋은지 / 가격·시간·걷기)
function placeCard(kind, p, q, dest, imageUrl) {
  const icon = { hotels: '🏨', sights: '📍', foods: '🍚' }[kind];
  const buttons = [];
  if (p.source === 'search') {
    buttons.push(K.button.link('카카오맵에서 보기', p.mapUrl));
  } else {
    if (kind === 'hotels') buttons.push(K.button.link('가격·예약 보기', links.hotelLink(p.name || p.title, dest.name, q.date, q.nights, q.people)));
    if (p.detailUrl) buttons.push(K.button.link('사진·후기 보기', p.detailUrl));
    buttons.push(K.button.link('지도에서 보기', p.mapUrl));
  }
  return K.basicCard({
    title: `${icon} ${p.title}`,
    description: `${p.line1}\n${p.line2}`,
    imageUrl: p.image || imageUrl,
    buttons,
  });
}

function moreReplies(q, current) {
  const r = [];
  const changeOrigin = K.quickReply('출발지 바꾸기', `출발지 바꾸기 ${sentence(q, { intent: current, origin: '' })}`);
  if (q.originSource !== 'said') r.push(changeOrigin);
  if (current !== 'all') r.push(K.quickReply('기차·숙소 보기', sentence(q)));
  if (current !== 'sights') r.push(K.quickReply('가볼 곳 더보기', sentence(q, { intent: 'sights' })));
  if (current !== 'foods') r.push(K.quickReply('먹거리 더보기', sentence(q, { intent: 'foods' })));
  if (current !== 'hotels') r.push(K.quickReply('숙소 더보기', sentence(q, { intent: 'hotels' })));
  r.push(K.quickReply('일주일 뒤로', sentence(q, { date: addDays(q.date, 7), intent: current })));
  if (q.originSource === 'said') r.push(changeOrigin);
  r.push(K.quickReply('처음으로'));
  return r;
}

/**
 * @param {string} utterance 사용자가 보낸 문장
 * @param {{imageUrl: string, now?: Date, userId?: string}} opts
 *   imageUrl: 사진 없는 카드에 넣을 기본 그림, userId: 카카오 사용자 키(출발지 기억용)
 */
async function recommend(utterance, { imageUrl, now, userId, meta = {} } = {}) {
  // meta: 대화 기록용 정보를 채워 돌려줍니다 (어떤 답을 했는지, 알아들었는지)
  const q = parse(utterance, now, { rememberedOrigin: store.getOrigin(userId) });
  if (q.command === 'welcome') return Object.assign(meta, { kind: 'welcome' }), welcome();

  // 출발지를 말했으면 기억 (출발지 고르기 화면을 여는 말은 제외)
  if (q.originSource === 'said' && q.command !== 'chooseOrigin') store.setOrigin(userId, q.origin);
  Object.assign(meta, { origin: q.origin, originSource: q.originSource, intent: q.intent });

  if (!q.destination) {
    if (q.originSource === 'said') {
      meta.kind = 'origin_only';
      return askAgain(`🚉 ${q.origin} 출발로 기억해 둘게요.\n\n어디로 가실까요?\n예) 경주 여행`);
    }
    meta.kind = 'no_destination'; // 알아듣지 못함
    return askAgain('어디로 가실지 알려 주세요 😊\n\n예) 경주 여행\n예) 부산에서 둘이 강릉');
  }

  const dest = await resolveDestination(q.destination);
  if (!dest) {
    Object.assign(meta, { kind: 'not_found', destination: q.destination }); // 지명을 못 찾음
    return askAgain(`'${q.destination}'을(를) 찾지 못했어요 😅\n시·군 이름으로 다시 적어 주세요.\n\n예) 경주 여행, 강릉 여행`);
  }
  q.destination = dest.name;
  meta.destination = dest.name;

  if (q.command === 'chooseOrigin') return Object.assign(meta, { kind: 'choose_origin' }), chooseOrigin(q);
  meta.kind = 'recommend';

  const from = originStationOf(q.origin);
  const to = dest.island ? null : nearestStation(dest.lat, dest.lng);
  const wantTrains = q.intent === 'all' || q.intent === 'trains';
  const kinds = q.intent === 'all' ? ['hotels', 'sights', 'foods'] : q.intent === 'trains' ? [] : [q.intent];
  const count = q.intent === 'all' ? 3 : 5;

  const [trainResult, places] = await Promise.all([
    wantTrains && to ? findTrains({ from, to: to.station, dateYmd: ymd(q.date) }) : { trains: [], source: 'none' },
    kinds.length ? findPlaces(dest, kinds, count) : {},
  ]);

  const ctx = { trainSource: trainResult.source, from };

  if (q.intent === 'trains') {
    return K.response(
      [K.simpleText(summaryText(q, dest, ctx)), trainList(q, dest, from, to, trainResult)],
      moreReplies(q, 'trains'),
    );
  }

  if (q.intent !== 'all') {
    const title = { sights: '가볼 만한 곳', foods: '먹거리', hotels: '숙소' }[q.intent];
    return K.response(
      [
        K.simpleText(`${dest.name} ${title}이에요 👇\n옆으로 넘기면 더 있어요.`),
        K.carousel('basicCard', places[q.intent].map((p) => placeCard(q.intent, p, q, dest, imageUrl))),
      ],
      moreReplies(q, q.intent),
    );
  }

  // 전체 추천: [요약] [기차 목록] [숙소2 + 가볼 곳2 + 먹거리2]
  const mixed = [
    ...places.hotels.slice(0, 2).map((p) => placeCard('hotels', p, q, dest, imageUrl)),
    ...places.sights.slice(0, 2).map((p) => placeCard('sights', p, q, dest, imageUrl)),
    ...places.foods.slice(0, 2).map((p) => placeCard('foods', p, q, dest, imageUrl)),
  ];
  return K.response(
    [K.simpleText(summaryText(q, dest, ctx)), trainList(q, dest, from, to, trainResult), K.carousel('basicCard', mixed)],
    moreReplies(q, 'all'),
  );
}

module.exports = { recommend, welcome };
