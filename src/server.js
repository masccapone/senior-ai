// 카카오 i 오픈빌더 스킬 서버.
//   POST /skill            ← 카카오가 사용자의 말을 보내는 주소 (스킬 URL로 등록)
//   GET  /                 ← 브라우저 미리보기 (카톡 없이 화면 확인)
//   GET  /health           ← 서버 상태 확인
//   GET  /static/noimage.png ← 사진 없는 카드용 기본 그림
//   GET  /admin/report?key=…  ← 테스트 결과 보고서 (ADMIN_TOKEN 이 있을 때만)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');
const logger = require('./logger');
const report = require('./report');
const { recommend, planData } = require('./recommend');
const { renderPlan, renderError } = require('./planPage');
const { isKnownPlace } = require('./parser');
const { warmUp } = require('./services/train');
const { NO_IMAGE } = require('./png');
const K = require('./kakao');

const PREVIEW_HTML = path.join(__dirname, '..', 'public', 'preview.html');

function baseUrl(req) {
  if (config.publicBaseUrl) return config.publicBaseUrl;
  const proto = req.headers['x-forwarded-proto'] || 'http';
  return `${proto}://${req.headers.host}`;
}

function readBody(req, limit = 100 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

const sorry = (msg) => K.response([K.simpleText(msg)], [K.quickReply('처음으로')]);

async function handleSkill(req, res) {
  let payload;
  try {
    payload = JSON.parse((await readBody(req)) || '{}');
  } catch {
    return sendJson(res, 400, sorry('요청을 읽지 못했어요.'));
  }
  const utterance = (payload.userRequest && payload.userRequest.utterance) || '';
  const userId = payload.userRequest && payload.userRequest.user && payload.userRequest.user.id;
  const imageUrl = `${baseUrl(req)}/static/noimage.png`;

  let timer;
  const started = Date.now();
  const meta = {};
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => {
      meta.kind = 'timeout';
      resolve(sorry('지금 정보를 불러오는 데 시간이 걸려요 🙏\n잠시 후 같은 말을 다시 보내 주세요.'));
    }, config.responseDeadlineMs);
  });
  try {
    const result = await Promise.race([recommend(utterance, { imageUrl, baseUrl: baseUrl(req), userId, meta }), deadline]);
    sendJson(res, 200, result);
    logger.record({ userId, utterance, meta, ms: Date.now() - started });
  } catch (e) {
    console.error('[skill] 오류:', e);
    sendJson(res, 200, sorry('죄송해요, 잠시 문제가 생겼어요 🙏\n조금 뒤에 다시 보내 주세요.'));
    logger.record({ userId, utterance, meta, ms: Date.now() - started, error: e.message });
  } finally {
    clearTimeout(timer);
  }
}

// 여행 계획표 페이지: 가족이 열어서 대신 예약·결제
// 주소에는 조건만 들어 있고, 열 때마다 최신 정보로 다시 만듭니다.
async function handlePlan(req, res, url) {
  const sendHtml = (status, html) => {
    res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
    res.end(html);
  };
  const q = url.searchParams;
  const d = String(q.get('d') || '').trim();
  const o = String(q.get('o') || '').trim();
  const t = String(q.get('t') || '');
  const n = Number(q.get('n'));
  const p = Number(q.get('p'));
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
  const valid =
    /^[가-힣A-Za-z0-9·\s]{1,20}$/.test(d) && date && !isNaN(date) && date.getUTCDate() === +m[3] &&
    Number.isInteger(n) && n >= 0 && n <= 9 && Number.isInteger(p) && p >= 1 && p <= 9;
  if (!valid) return sendHtml(400, renderError('주소가 올바르지 않아요.'));

  const origin = isKnownPlace(o) ? o : '서울';
  const started = Date.now();
  const data = await planData({ destination: d, origin, date, nights: n, people: p });
  if (!data) return sendHtml(404, renderError(`'${d}'을(를) 찾지 못했어요.`));
  logger.record({ userId: 'plan-page', utterance: `[계획표 열람] ${data.dest.name}`, meta: { kind: 'plan_view', destination: data.dest.name, origin }, ms: Date.now() - started });
  return sendHtml(200, renderPlan(data, `${baseUrl(req)}${url.pathname}${url.search}`));
}

// 결과 보고서: 열쇠(ADMIN_TOKEN)가 맞을 때만
function adminAllowed(url) {
  if (!config.adminToken) return false;
  const given = Buffer.from(String(url.searchParams.get('key') || ''));
  const want = Buffer.from(config.adminToken);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}

function handleAdmin(req, res, url) {
  if (!adminAllowed(url)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Not found');
  }
  const rows = logger.readAll();
  if (url.pathname === '/admin/logs.jsonl') {
    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Content-Disposition': 'attachment; filename="chatbot-logs.jsonl"',
      'Cache-Control': 'no-store',
    });
    return res.end(rows.map((r) => JSON.stringify(r)).join('\n'));
  }
  const logsUrl = `/admin/logs.jsonl?key=${encodeURIComponent(url.searchParams.get('key'))}`;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
  return res.end(report.toHtml(report.summarize(rows), { logsUrl }));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'POST' && url.pathname === '/skill') return await handleSkill(req, res);
    if (req.method === 'GET' && url.pathname === '/health') {
      return sendJson(res, 200, {
        ok: true,
        mode: config.dataGoKrKey ? 'live' : 'mock',
        trainApi: !!config.dataGoKrKey,
        kakaoPlaces: !!config.kakaoRestKey,
      });
    }
    if (req.method === 'GET' && url.pathname === '/p') return await handlePlan(req, res, url);
    if (req.method === 'GET' && (url.pathname === '/admin/report' || url.pathname === '/admin/logs.jsonl')) {
      return handleAdmin(req, res, url);
    }
    if (req.method === 'GET' && url.pathname === '/static/noimage.png') {
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' });
      return res.end(NO_IMAGE);
    }
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(fs.readFileSync(PREVIEW_HTML));
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  } catch (e) {
    console.error(e);
    if (!res.headersSent) sendJson(res, 500, { error: 'server error' });
  }
});

if (require.main === module) {
  server.listen(config.port, () => {
    console.log(`여행 추천 스킬 서버 실행 중: http://localhost:${config.port}`);
    console.log(`  미리보기: http://localhost:${config.port}/`);
    console.log(`  스킬 URL: http://localhost:${config.port}/skill`);
    console.log(`  모드: ${config.dataGoKrKey ? '실제 API (키 있음)' : '예시 데이터 (API 키 없음)'}`);
    warmUp();
  });
}

module.exports = { server };
