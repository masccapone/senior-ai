// 서버 없이 한 문장을 넣어 카카오 응답 JSON을 확인합니다.
// 사용법: node scripts/try.js "부산에서 둘이 경주 다음주 토요일"
const { recommend } = require('../src/recommend');

const text = process.argv.slice(2).join(' ') || '경주 여행';
recommend(text, { imageUrl: 'http://localhost:3000/static/noimage.png' })
  .then((json) => console.log(JSON.stringify(json, null, 2)))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
