// 대화 기록과 결과 보고서
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seniorai-'));
process.env.DATA_DIR = dir;
process.env.ADMIN_TOKEN = 'secret-test-key';
process.env.DATA_GO_KR_KEY = '';
process.env.KAKAO_REST_API_KEY = '';
process.env.USER_STORE_FILE = 'off';

const test = require('node:test');
const assert = require('node:assert');
const { server } = require('../src/server');

let base;
test.before(async () => {
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const ask = (utterance, id) =>
  fetch(`${base}/skill`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userRequest: { utterance, user: { id, type: 'botUserKey' } } }),
  }).then((r) => r.json());

test('대화가 이름 없이 기록되고 보고서에 나옴', async () => {
  await ask('처음으로', 'kakao-user-AAA');
  await ask('경주 여행', 'kakao-user-AAA');
  await ask('어디 바람 쐬러 가고 싶은데', 'kakao-user-BBB'); // 못 알아듣는 말
  await ask('경주 관광지 서울에서 11월 7일 2명 1박', 'kakao-user-BBB'); // 버튼이 보낸 문장
  await ask('미리보기에서 보낸 말', 'preview-user'); // 기록 안 함

  const files = fs.readdirSync(path.join(dir, 'logs'));
  assert.equal(files.length, 1);
  const raw = fs.readFileSync(path.join(dir, 'logs', files[0]), 'utf8');
  const rows = raw.trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(rows.length, 4);
  assert.ok(!raw.includes('kakao-user-AAA'), '카카오 사용자 키 원본은 남기지 않음');
  assert.equal(rows[0].u, rows[1].u, '같은 사람은 같은 코드');
  assert.notEqual(rows[1].u, rows[2].u);
  assert.equal(rows[1].kind, 'recommend');
  assert.equal(rows[1].dest, '경주');
  assert.ok(['no_destination', 'not_found'].includes(rows[2].kind), rows[2].kind);
  assert.equal(rows[2].button, false);
  assert.equal(rows[3].button, true);

  const res = await fetch(`${base}/admin/report?key=secret-test-key`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /테스트 보고서/);
  assert.match(html, /2명/); // 써 본 사람
  assert.match(html, /어디 바람 쐬러 가고 싶은데/); // 못 알아들은 말 목록
  assert.doesNotMatch(html, /미리보기에서 보낸 말/);

  const logs = await fetch(`${base}/admin/logs.jsonl?key=secret-test-key`);
  assert.equal(logs.status, 200);
  assert.equal((await logs.text()).trim().split('\n').length, 4);
});

test('열쇠가 틀리면 보고서가 안 보임', async () => {
  assert.equal((await fetch(`${base}/admin/report`)).status, 404);
  assert.equal((await fetch(`${base}/admin/report?key=wrong`)).status, 404);
  assert.equal((await fetch(`${base}/admin/logs.jsonl?key=secret-test-keyX`)).status, 404);
});

test('처음 인사에 기록 안내가 있음', async () => {
  const json = await ask('처음으로', 'kakao-user-CCC');
  assert.match(json.template.outputs[0].simpleText.text, /이름 없이 기록/);
});
