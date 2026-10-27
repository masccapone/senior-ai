// 테스트 결과 보고서: 대화 기록을 모아 "누가 얼마나 썼고, 어디서 막혔는지"를 보여 줍니다.
// - 브라우저: /admin/report?key=ADMIN_TOKEN
// - 내 PC:   node scripts/report.js  (.data/logs 기준)

const FAIL = new Set(['no_destination', 'not_found', 'error', 'timeout']);
const KIND_KO = {
  welcome: '처음 인사·사용법',
  recommend: '추천 성공',
  choose_origin: '출발지 고르기',
  origin_only: '출발지만 말함',
  no_destination: '여행지를 못 알아들음',
  not_found: '지명을 못 찾음',
  error: '오류',
  timeout: '시간 초과',
  unknown: '기타',
};
const INTENT_KO = { all: '전체 추천', sights: '가볼 곳', foods: '먹거리', hotels: '숙소', trains: '기차' };

const kstDay = (iso) => new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const kstTime = (iso) => new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(5, 16).replace('T', ' ');
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

function countBy(rows, key) {
  const m = new Map();
  for (const r of rows) {
    const k = typeof key === 'function' ? key(r) : r[key];
    if (k == null) continue;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function summarize(allRows) {
  // 계획표 페이지 열람(가족 공유)은 대화가 아니므로 따로 셉니다
  const planViews = allRows.filter((r) => r.kind === 'plan_view');
  const rows = allRows.filter((r) => r.kind !== 'plan_view');
  const users = new Map();
  for (const r of rows) {
    const u = users.get(r.u) || { u: r.u, n: 0, fails: 0, days: new Set(), first: r.t, last: r.t };
    u.n++;
    if (FAIL.has(r.kind)) u.fails++;
    u.days.add(kstDay(r.t));
    if (r.t < u.first) u.first = r.t;
    if (r.t > u.last) u.last = r.t;
    users.set(r.u, u);
  }
  const recs = rows.filter((r) => r.kind === 'recommend');
  const fails = rows.filter((r) => FAIL.has(r.kind));
  return {
    from: rows.length ? kstDay(rows[0].t) : null,
    to: rows.length ? kstDay(rows[rows.length - 1].t) : null,
    messages: rows.length,
    users: users.size,
    returning: [...users.values()].filter((u) => u.days.size >= 2).length,
    understood: rows.length - fails.length,
    failCount: fails.length,
    typed: rows.filter((r) => !r.button).length,
    slow: rows.filter((r) => r.ms > 3000).length,
    kinds: countBy(rows, 'kind'),
    destinations: countBy(recs, 'dest').slice(0, 10),
    origins: countBy(recs, 'origin').slice(0, 10),
    originDefault: recs.filter((r) => r.originSource === 'default').length,
    recCount: recs.length,
    intents: countBy(recs, 'intent'),
    perDay: countBy(rows, (r) => kstDay(r.t)).sort((a, b) => a[0].localeCompare(b[0])),
    failures: fails.slice(-50).reverse(),
    typedSamples: rows.filter((r) => !r.button).slice(-30).reverse(),
    userList: [...users.values()].sort((a, b) => b.n - a.n),
    planViews: planViews.length,
    planViewDest: countBy(planViews, 'dest').slice(0, 10),
  };
}

// ---------- 글자 보고서 (터미널용) ----------
function toText(s) {
  if (!s.messages) return '아직 기록이 없습니다.';
  const L = [];
  L.push(`기간: ${s.from} ~ ${s.to}`);
  L.push(`사용자 ${s.users}명 · 메시지 ${s.messages}개 · 이틀 이상 다시 온 사람 ${s.returning}명`);
  L.push(`알아들은 비율 ${pct(s.understood, s.messages)}% (못 알아들음 ${s.failCount}건)`);
  L.push(`직접 쓴 말 ${pct(s.typed, s.messages)}% · 버튼 ${100 - pct(s.typed, s.messages)}%`);
  L.push(`출발지를 안 바꾸고 서울 기본값으로 본 추천 ${pct(s.originDefault, s.recCount)}%`);
  L.push(`계획표 열람 ${s.planViews}번`);
  L.push('', '[인기 여행지] ' + s.destinations.map(([k, v]) => `${k} ${v}`).join(', '));
  L.push('[출발지] ' + s.origins.map(([k, v]) => `${k} ${v}`).join(', '));
  L.push('', '[못 알아들은 말 — 최근]');
  for (const r of s.failures.slice(0, 30)) L.push(`  ${kstTime(r.t)}  "${r.text}"  (${KIND_KO[r.kind] || r.kind})`);
  return L.join('\n');
}

// ---------- 웹 보고서 ----------
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function bars(list, label = (k) => k) {
  const max = Math.max(1, ...list.map(([, v]) => v));
  return list.length
    ? list
        .map(([k, v]) => `<div class="bar"><span class="k">${esc(label(k))}</span><span class="b" style="width:${Math.round((v / max) * 100)}%"></span><span class="v">${v}</span></div>`)
        .join('')
    : '<p class="muted">아직 없음</p>';
}

function toHtml(s, { logsUrl = '' } = {}) {
  const card = (title, value, note = '') => `<div class="stat"><div class="t">${title}</div><div class="n">${value}</div><div class="muted">${note}</div></div>`;
  const body = !s.messages && !s.planViews
    ? '<p>아직 기록이 없습니다. 카카오톡에서 챗봇에 말을 걸면 여기에 쌓입니다.</p>'
    : `
  <p class="muted">기간 ${esc(s.from)} ~ ${esc(s.to)} · 한국 시간 기준</p>
  <div class="stats">
    ${card('써 본 사람', `${s.users}명`, `이틀 이상 다시 온 사람 ${s.returning}명`)}
    ${card('보낸 메시지', `${s.messages}개`, `한 사람당 평균 ${s.users ? (s.messages / s.users).toFixed(1) : 0}개`)}
    ${card('알아들은 비율', `${pct(s.understood, s.messages)}%`, `못 알아들음 ${s.failCount}건`)}
    ${card('직접 쓴 말', `${pct(s.typed, s.messages)}%`, `나머지는 버튼으로`)}
    ${card('출발지 기본값(서울) 그대로', `${pct(s.originDefault, s.recCount)}%`, '높으면 출발지 안내가 잘 안 보인다는 뜻')}
    ${card('느린 응답(3초 넘음)', `${s.slow}건`, '카카오는 5초가 넘으면 실패')}
    ${card('계획표 열람', `${s.planViews}번`, '[가족에게 보내기]로 공유된 계획표를 연 횟수(본인 포함)')}
  </div>

  <h2>😥 못 알아들은 말 (최근 50개)</h2>
  <p class="muted">여기가 가장 중요합니다. 어르신들이 실제로 어떻게 말하는지 보여 줍니다.</p>
  <table><tr><th>시간</th><th>보낸 말</th><th>결과</th><th>사용자</th></tr>
  ${s.failures.map((r) => `<tr><td>${kstTime(r.t)}</td><td>${esc(r.text)}</td><td>${esc(KIND_KO[r.kind] || r.kind)}</td><td class="muted">${esc(r.u)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">없음 👍</td></tr>'}
  </table>

  <div class="two">
    <div><h2>📍 인기 여행지</h2>${bars(s.destinations)}</div>
    <div><h2>🚉 출발지</h2>${bars(s.origins)}</div>
  </div>
  <div class="two">
    <div><h2>무엇을 많이 봤나</h2>${bars(s.intents, (k) => INTENT_KO[k] || k)}</div>
    <div><h2>답한 종류</h2>${bars(s.kinds, (k) => KIND_KO[k] || k)}</div>
  </div>
  <h2>📅 날짜별 메시지</h2>${bars(s.perDay)}

  <h2>✏️ 직접 쓴 말 (최근 30개)</h2>
  <table><tr><th>시간</th><th>보낸 말</th><th>결과</th></tr>
  ${s.typedSamples.map((r) => `<tr><td>${kstTime(r.t)}</td><td>${esc(r.text)}</td><td>${esc(KIND_KO[r.kind] || r.kind)}</td></tr>`).join('')}
  </table>

  <h2>👥 사용자별 (이름 없이 코드로)</h2>
  <table><tr><th>코드</th><th>메시지</th><th>못 알아들음</th><th>쓴 날</th><th>처음</th><th>마지막</th></tr>
  ${s.userList.map((u) => `<tr><td>${esc(u.u)}</td><td>${u.n}</td><td>${u.fails}</td><td>${u.days.size}일</td><td>${kstTime(u.first)}</td><td>${kstTime(u.last)}</td></tr>`).join('')}
  </table>`;

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>챗봇 테스트 보고서</title><style>
:root{--bg:#f6f7f9;--card:#fff;--text:#1d2129;--muted:#6b7280;--accent:#f5b400;--line:#e5e7eb}
@media (prefers-color-scheme:dark){:root{--bg:#15171b;--card:#1f2228;--text:#e8eaed;--muted:#9aa0a6;--line:#2f333a}}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.6 -apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif}
main{max-width:960px;margin:0 auto;padding:24px 16px 64px}h1{margin:0 0 4px;font-size:24px}h2{font-size:18px;margin:32px 0 8px}
.muted{color:var(--muted);font-size:14px}.stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin-top:16px}
.stat{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px}.stat .t{color:var(--muted);font-size:14px}.stat .n{font-size:28px;font-weight:700}
table{width:100%;border-collapse:collapse;background:var(--card);border-radius:12px;overflow:hidden;font-size:15px}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line)}th{color:var(--muted);font-weight:600}
.two{display:grid;grid-template-columns:1fr 1fr;gap:24px}@media(max-width:640px){.two{grid-template-columns:1fr}table{font-size:14px}}
.bar{display:grid;grid-template-columns:110px 1fr 40px;align-items:center;gap:8px;margin:4px 0}.bar .b{height:14px;background:var(--accent);border-radius:7px;min-width:2px}.bar .v{text-align:right;color:var(--muted)}.bar .k{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
a{color:inherit}</style></head><body><main>
<h1>여행 도우미 챗봇 · 테스트 보고서</h1>
${logsUrl ? `<p class="muted">원본 기록 내려받기: <a href="${esc(logsUrl)}">logs.jsonl</a></p>` : ''}
${body}
</main></body></html>`;
}

module.exports = { summarize, toText, toHtml };
