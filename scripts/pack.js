// GitHub 웹에 올릴 깨끗한 폴더를 만듭니다. (비밀 키·Node 실행 파일·기록은 빼고)
// 사용법: node scripts/pack.js   →  바탕화면\claud\senior-ai-업로드용 폴더가 생김
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..');
const OUT = path.join(SRC, '..', 'senior-ai-업로드용');

// 올리면 안 되는 것
const SKIP = new Set(['.env', '.node', '.data', 'node_modules', '.git', '.claude', '실행.bat', '테스트.bat', '업로드준비.bat']);

function copy(from, to) {
  for (const name of fs.readdirSync(from)) {
    if (SKIP.has(name)) continue;
    const a = path.join(from, name);
    const b = path.join(to, name);
    if (fs.statSync(a).isDirectory()) {
      fs.mkdirSync(b, { recursive: true });
      copy(a, b);
    } else {
      fs.copyFileSync(a, b);
    }
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
copy(SRC, OUT);

// 비밀 키가 섞여 들어가지 않았는지 마지막으로 확인
const env = fs.existsSync(path.join(SRC, '.env')) ? fs.readFileSync(path.join(SRC, '.env'), 'utf8') : '';
const secrets = [...env.matchAll(/^[A-Z_]+=(.{12,})$/gm)].map((m) => m[1].trim()).filter(Boolean);
let count = 0;
(function scan(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) scan(p);
    else {
      count++;
      const text = fs.readFileSync(p, 'utf8');
      for (const s of secrets) {
        if (text.includes(s)) {
          console.error(`⚠️ 비밀 키가 ${p} 에 들어 있습니다. 올리지 마세요!`);
          process.exit(1);
        }
      }
    }
  }
})(OUT);

console.log(`완료: ${OUT}`);
console.log(`파일 ${count}개 · 비밀 키·Node 실행 파일·기록은 뺐습니다.`);
console.log('이 폴더 "안의 파일과 폴더 전부"를 GitHub 업로드 화면에 끌어다 놓으세요.');
