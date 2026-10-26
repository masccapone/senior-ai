// 대화 기록 요약을 터미널에 보여 줍니다.
// 사용법: node scripts/report.js
//   클라우드 기록은 /admin/report?key=… 화면에서 보거나 logs.jsonl 을 내려받아
//   DATA_DIR 폴더의 logs/ 안에 넣고 실행하세요.
const { readAll } = require('../src/logger');
const { summarize, toText } = require('../src/report');

console.log(toText(summarize(readAll())));
