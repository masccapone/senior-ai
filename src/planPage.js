// 여행 계획표 페이지 (/p?d=경주&o=부산&t=2026-11-07&n=1&p=2)
// 부모님이 챗봇에서 [가족에게 보내기]로 공유하면, 자녀가 이 페이지를 열어 기차·숙소를 대신 예약·결제합니다.
// 예약·결제는 코레일·숙소 사이트에서 직접 합니다 (이 서비스는 결제를 받지 않습니다).
const { formatDate } = require('./parser');

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// <script> 안에 넣는 문자열: </script> 같은 글자로 빠져나가지 못하게
const jsStr = (v) => JSON.stringify(String(v)).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
const won = (n) => `${Number(n).toLocaleString('ko-KR')}원`;
const duration = (min) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return [h ? `${h}시간` : '', m ? `${m}분` : ''].filter(Boolean).join(' ');
};
const btn = (label, url, primary = false) =>
  url ? `<a class="btn${primary ? ' primary' : ''}" href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>` : '';

function trainSection(d) {
  if (d.dest.island) {
    return `<section><h2><span class="num">1</span> 비행기 예매</h2>
      <p>${esc(d.dest.name)}는 기차로 갈 수 없어요. 항공권을 찾아 예매해 주세요.</p>
      <p class="meta">가는 날 ${esc(formatDate(d.date))} · ${d.people}명</p>
      ${btn('항공권 찾아보기', d.flightUrl, true)}</section>`;
  }
  const rows = d.trains.length
    ? d.trains
        .map(
          (t) => `<li><b>${esc(t.grade)} ${esc(t.dep)} 출발 → ${esc(t.arr)} 도착</b>
            <span>${esc(duration(t.minutes))}${t.fare ? ` · ${d.people}명 약 ${esc(won(t.fare * d.people))} (1명 ${esc(won(t.fare))})` : ''}</span></li>`,
        )
        .join('')
    : `<li><span>${esc(d.trainNote || '바로 가는 기차를 찾지 못했어요. 코레일에서 갈아타는 표를 찾아 주세요.')}</span></li>`;
  const far = d.to && d.to.km > 15 ? `<p class="tip">🚌 ${esc(d.to.station.name)}역에서 ${esc(d.dest.name)}까지 약 ${Math.round(d.to.km)}km, 버스·택시로 가요.</p>` : '';
  const mock = d.trainSource === 'mock' ? '<p class="warn">※ 아래 시간·요금은 거리로 계산한 예시예요. 코레일 예매 화면에서 실제 시간표를 확인해 주세요.</p>' : '';
  return `<section><h2><span class="num">1</span> 기차표 예매</h2>
    <dl>
      <dt>가는 날</dt><dd>${esc(formatDate(d.date))}</dd>
      <dt>구간</dt><dd>${esc(d.from.name)}역 → ${esc(d.to.station.name)}역</dd>
      <dt>인원</dt><dd>어른 ${d.people}명</dd>
      ${d.nights ? `<dt>오는 날</dt><dd>${esc(formatDate(d.returnDate))} (돌아오는 표도 함께 예매하세요)</dd>` : ''}
    </dl>
    ${mock}
    <p class="label">추천 열차</p><ul class="list">${rows}</ul>
    ${far}
    ${btn('코레일에서 예매하기', d.korailUrl, true)}
    ${d.srt ? `<p class="tip">강남·분당에 사시면 수서역 SRT도 있어요.</p>${btn('SRT에서 예매하기', d.srtUrl)}` : ''}
  </section>`;
}

function placeItem(p, { book = false } = {}) {
  return `<li class="place">
    <b>${esc(p.title)}</b>
    <span>${esc(p.line1)}</span>
    <span class="muted">${esc(p.line2)}</span>
    <div class="row">
      ${book && p.bookUrl ? btn('가격·예약 보기', p.bookUrl, true) : ''}
      ${p.detailUrl ? btn('사진·후기', p.detailUrl) : ''}
      ${btn(p.source === 'search' ? '카카오맵에서 찾기' : '지도', p.mapUrl)}
    </div>
  </li>`;
}

function hotelSection(d) {
  if (!d.nights) {
    return `<section><h2><span class="num">2</span> 숙소</h2><p>당일 여행이라 숙소는 필요 없어요.</p></section>`;
  }
  return `<section><h2><span class="num">2</span> 숙소 예약</h2>
    <dl>
      <dt>체크인</dt><dd>${esc(formatDate(d.date))}</dd>
      <dt>체크아웃</dt><dd>${esc(formatDate(d.returnDate))} (${d.nights}박)</dd>
      <dt>인원</dt><dd>${d.people}명</dd>
    </dl>
    <p class="tip">가격은 날짜·객실마다 달라요. [가격·예약 보기]에서 여러 예약 사이트 가격을 비교해 보세요.</p>
    <ul class="places">${d.hotels.map((p) => placeItem(p, { book: true })).join('')}</ul>
  </section>`;
}

function renderPlan(d, pageUrl) {
  const title = `${d.dest.name} 여행 계획`;
  const sub = `${esc(d.origin)} 출발 · ${esc(formatDate(d.date))}${d.nights ? ` · ${d.nights}박` : ' · 당일'} · ${d.people}명`;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta property="og:title" content="🧳 ${esc(title)}">
<meta property="og:description" content="${sub} · 기차·숙소 예약 링크를 모아 뒀어요">
<title>${esc(title)}</title>
<style>
:root{--bg:#fffaf0;--card:#fff;--text:#1d1d1f;--muted:#666;--line:#eee3cc;--accent:#fee500;--accent-text:#191600;--primary:#1f6feb;--warn:#8a5a00;--warn-bg:#fff4d6}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#17150f;--card:#221f17;--text:#f2efe6;--muted:#b0a993;--line:#3a3526;--warn:#ffd27a;--warn-bg:#3a2f12;--primary:#5aa2ff}}
:root[data-theme="dark"]{--bg:#17150f;--card:#221f17;--text:#f2efe6;--muted:#b0a993;--line:#3a3526;--warn:#ffd27a;--warn-bg:#3a2f12;--primary:#5aa2ff}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:18px/1.6 -apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif}
main{max-width:640px;margin:0 auto;padding:20px 16px 48px}
header{padding:8px 0 4px}h1{font-size:28px;margin:0}.sub{color:var(--muted);margin:4px 0 0}
.notice{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin:16px 0}
section{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px 16px;margin:16px 0}
h2{font-size:22px;margin:0 0 12px;display:flex;align-items:center;gap:10px}
.num{display:inline-grid;place-items:center;width:32px;height:32px;border-radius:50%;background:var(--accent);color:var(--accent-text);font-size:18px;flex:none}
dl{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;margin:0 0 12px}dt{color:var(--muted)}dd{margin:0;font-weight:600}
.label{color:var(--muted);margin:12px 0 4px}
ul{list-style:none;padding:0;margin:0}
.list li{padding:10px 0;border-top:1px solid var(--line);display:flex;flex-direction:column}.list li:first-child{border-top:0}
.list span,.place span{color:var(--muted);font-size:16px}
.places .place{padding:14px 0;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:2px}.places .place:first-child{border-top:0}
.muted{color:var(--muted)}
.row{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.btn{display:flex;align-items:center;justify-content:center;min-height:52px;padding:10px 18px;border-radius:12px;border:1px solid var(--line);background:var(--card);color:var(--text);text-decoration:none;font-weight:600;font-size:17px;margin-top:10px}
.row .btn{margin-top:0;flex:1 1 auto}
.btn.primary{background:var(--primary);border-color:var(--primary);color:#fff}
section>.btn{width:100%}
.tip{color:var(--muted);font-size:16px;margin:10px 0 0}
.warn{background:var(--warn-bg);color:var(--warn);border-radius:10px;padding:10px 12px;font-size:16px;margin:0 0 8px}
.share{display:grid;gap:10px;margin-top:24px}
button.btn{width:100%;cursor:pointer;font-family:inherit}
footer{color:var(--muted);font-size:14px;margin-top:24px;text-align:center}
</style></head><body><main>
<header><h1>🧳 ${esc(title)}</h1><p class="sub">${sub}</p></header>
<div class="notice">부모님이 카카오톡 <b>여행 도우미</b>로 고른 여행이에요.<br>아래 순서대로 <b>기차표와 숙소</b>를 예약해 주세요. 예약·결제는 각 사이트에서 직접 해요.</div>
${trainSection(d)}
${hotelSection(d)}
<section><h2><span class="num">3</span> 가볼 곳 (참고)</h2><ul class="places">${d.sights.map((p) => placeItem(p)).join('')}</ul></section>
<section><h2><span class="num">4</span> 먹거리 (참고)</h2><ul class="places">${d.foods.map((p) => placeItem(p)).join('')}</ul></section>
<div class="share">
  <button class="btn primary" id="share" type="button">📤 이 계획표 다른 사람에게 보내기</button>
  <button class="btn" id="copy" type="button">🔗 링크 복사</button>
</div>
<footer>예약을 마치면 부모님께 알려 드리세요 😊<br>가격·운영 정보는 바뀔 수 있으니 예약 화면에서 꼭 확인해 주세요.</footer>
</main>
<script>
(function(){
  var url = ${jsStr(pageUrl)};
  var title = ${jsStr('🧳 ' + title)};
  var shareBtn = document.getElementById('share');
  var copyBtn = document.getElementById('copy');
  function copy(){
    var done = function(){ copyBtn.textContent = '✅ 복사했어요. 카톡 대화창에 붙여 넣으세요'; };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function(){ prompt('아래 주소를 복사하세요', url); });
    else prompt('아래 주소를 복사하세요', url);
  }
  shareBtn.addEventListener('click', function(){
    if (navigator.share) navigator.share({ title: title, text: title + ' — 기차·숙소 예약 링크를 모아 뒀어요', url: url }).catch(function(){});
    else copy();
  });
  copyBtn.addEventListener('click', copy);
})();
</script>
</body></html>`;
}

function renderError(message) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>여행 계획표</title>
<style>body{margin:0;font:18px/1.6 -apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;background:#fffaf0;color:#1d1d1f}main{max-width:560px;margin:0 auto;padding:40px 16px}@media (prefers-color-scheme:dark){body{background:#17150f;color:#f2efe6}}</style>
</head><body><main><h1>😅 계획표를 열 수 없어요</h1><p>${esc(message)}</p><p>카카오톡 여행 도우미에서 다시 추천을 받아 공유해 주세요.</p></main></body></html>`;
}

module.exports = { renderPlan, renderError };
