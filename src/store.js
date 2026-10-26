// 사용자별로 "지난번 출발지"만 기억합니다. (카카오 사용자 키 → 도시 이름)
// 파일 하나(JSON)에 저장해서 서버를 다시 켜도 유지됩니다.
// 클라우드에서는 DATA_DIR 을 지워지지 않는 디스크(예: /var/data)로 지정하세요.
const fs = require('fs');
const path = require('path');
const config = require('./config');

const FILE = process.env.USER_STORE_FILE || path.join(config.dataDir, 'users.json');
const MAX_USERS = 100000;

let users = {};
let loaded = false;
let saveTimer = null;

function load() {
  if (loaded) return;
  loaded = true;
  try {
    users = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    users = {};
  }
}

function scheduleSave() {
  if (saveTimer || process.env.USER_STORE_FILE === 'off') return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      fs.writeFileSync(FILE, JSON.stringify(users));
    } catch (e) {
      console.warn('[store] 저장 실패:', e.message);
    }
  }, 1000);
  saveTimer.unref();
}

function getOrigin(userId) {
  if (!userId) return null;
  load();
  return (users[userId] && users[userId].origin) || null;
}

function setOrigin(userId, origin) {
  if (!userId || !origin) return;
  load();
  if (users[userId] && users[userId].origin === origin) return;
  if (!users[userId] && Object.keys(users).length >= MAX_USERS) return;
  users[userId] = { origin, at: Date.now() };
  scheduleSave();
}

module.exports = { getOrigin, setOrigin };
