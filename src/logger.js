// 대화 기록: 어르신들이 어디서 막히는지 보려고, 보낸 말과 챗봇이 한 일을 한 줄씩 남깁니다.
// - 이름·전화번호는 받지도 남기지도 않습니다. 카카오 사용자 키는 알아볼 수 없는 짧은 코드로 바꿔 둡니다.
// - 하루에 파일 하나: DATA_DIR/logs/2026-10-26.jsonl
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');

const LOG_DIR = path.join(config.dataDir, 'logs');

function anonymize(userId) {
  if (!userId) return 'unknown';
  return crypto.createHash('sha256').update(`${config.hashSalt}:${userId}`).digest('hex').slice(0, 10);
}

function kstDay(d = new Date()) {
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

// 바로가기 버튼이 보낸 말인지 (서버가 만든 문장 모양) — 직접 쓴 말과 구분하려고
const BUTTON_SENTENCE = /^(출발지 바꾸기( \[.+?\])? )?\S+ (여행|관광지|맛집|숙소|기차) (\S+에서 )?\d+월 \d+일 \d+명 \d+박$/;
function viaButton(utterance) {
  return BUTTON_SENTENCE.test(utterance) || /^(처음으로|도움말|(경주|부산|강릉|전주|여수) 여행)$/.test(utterance);
}

function record({ userId, utterance, meta = {}, ms, error }) {
  if (!config.logConversations) return;
  if (userId === 'preview-user') return; // 브라우저 미리보기에서 보낸 말은 기록하지 않음
  const row = {
    t: new Date().toISOString(),
    u: anonymize(userId),
    text: String(utterance || '').slice(0, 200),
    button: viaButton(String(utterance || '')),
    kind: error ? 'error' : meta.kind || 'unknown',
    dest: meta.destination || null,
    origin: meta.origin || null,
    originSource: meta.originSource || null,
    intent: meta.intent || null,
    ms,
  };
  if (error) row.error = String(error).slice(0, 200);
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(path.join(LOG_DIR, `${kstDay()}.jsonl`), JSON.stringify(row) + '\n');
  } catch (e) {
    console.warn('[log] 기록 실패:', e.message);
  }
}

// 기록 전부 읽기 (보고서용). 테스트 기간 정도의 양을 가정합니다.
function readAll() {
  let files = [];
  try {
    files = fs.readdirSync(LOG_DIR).filter((f) => f.endsWith('.jsonl')).sort();
  } catch {
    return [];
  }
  const rows = [];
  for (const f of files) {
    for (const line of fs.readFileSync(path.join(LOG_DIR, f), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        rows.push(JSON.parse(line));
      } catch {
        /* 깨진 줄은 건너뜀 */
      }
    }
  }
  return rows;
}

module.exports = { record, readAll, anonymize, viaButton, LOG_DIR };
