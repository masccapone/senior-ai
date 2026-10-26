// 공공데이터포털 API 공통 호출 (JSON, 시간 제한 포함)
const config = require('../config');

async function getJson(base, op, params) {
  const qs = new URLSearchParams({ serviceKey: config.dataGoKrKey, _type: 'json', ...params });
  const url = `${base}/${op}?${qs}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(config.apiTimeoutMs) });
  const text = await res.text();
  if (!res.ok) throw new Error(`API HTTP ${res.status} (${op}) — 인증키·활용신청을 확인하세요: ${text.slice(0, 120)}`);
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    // 키 오류 등은 XML로 오는 경우가 있음
    throw new Error(`API 응답이 JSON이 아님 (${op}): ${text.slice(0, 200)}`);
  }
  const header = body.response && body.response.header;
  if (header && !['0000', '00'].includes(String(header.resultCode))) {
    throw new Error(`API 오류 (${op}): ${header.resultCode} ${header.resultMsg}`);
  }
  return body;
}

// 응답의 item 은 한 개일 때 객체, 여러 개일 때 배열로 옴 → 항상 배열로
function items(body) {
  const it = body && body.response && body.response.body && body.response.body.items;
  if (!it || !it.item) return [];
  return Array.isArray(it.item) ? it.item : [it.item];
}

module.exports = { getJson, items };
