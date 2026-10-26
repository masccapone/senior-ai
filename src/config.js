// 설정값. 모두 환경변수로 바꿀 수 있고, 비어 있으면 예시(목업) 데이터로 동작합니다.
// .env 파일이 있으면 읽습니다 (별도 패키지 없이).
const fs = require('fs');
const path = require('path');

const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const env = process.env;

module.exports = {
  port: Number(env.PORT || 3000),
  // 공공데이터포털(data.go.kr) 인증키 — "Decoding" 키를 넣으세요.
  // 같은 키로 TourAPI와 TAGO 열차정보를 모두 쓸 수 있습니다(각각 활용신청 필요).
  dataGoKrKey: env.DATA_GO_KR_KEY || '',
  tourApiBase: env.TOUR_API_BASE || 'https://apis.data.go.kr/B551011/KorService2',
  trainApiBase: env.TRAIN_API_BASE || 'https://apis.data.go.kr/1613000/TrainInfo',
  appName: env.APP_NAME || 'SeniorAI',
  // 카카오 장소 검색(REST API 키). 있으면 실제 가게·숙소 이름·전화·후기 링크를 보여줍니다.
  kakaoRestKey: env.KAKAO_REST_API_KEY || '',
  // 숙소 예약 링크용 제휴 ID (없으면 네이버 검색 링크)
  agodaCid: env.AGODA_CID || '',
  // 카드 그림이 없을 때 쓸 이미지 주소. 비워두면 이 서버의 /static/noimage.png
  publicBaseUrl: (env.PUBLIC_BASE_URL || '').replace(/\/$/, ''),
  // 외부 API 하나를 기다리는 최대 시간(ms). 카카오는 5초 안에 답해야 하고,
  // 여행지 검색 → (기차·숙소 동시 조회) 로 최대 2번 차례로 기다리므로 2초로 둡니다.
  apiTimeoutMs: Number(env.API_TIMEOUT_MS || 2000),
  // 응답 전체 마감 시간(ms). 넘으면 "잠시 후 다시" 안내를 보냅니다.
  responseDeadlineMs: Number(env.RESPONSE_DEADLINE_MS || 4500),
  // 기억·기록 파일을 둘 폴더. 클라우드에서는 지워지지 않는 디스크 경로로 (예: /var/data)
  dataDir: env.DATA_DIR || path.join(__dirname, '..', '.data'),
  // 대화 기록 (off 로 끄기)
  logConversations: env.LOG_CONVERSATIONS !== 'off',
  // 사용자 키를 알아볼 수 없게 바꿀 때 섞는 값 (바꾸면 이전 기록과 사용자 구분이 끊김)
  hashSalt: env.HASH_SALT || 'senior-ai',
  // 결과 보고서(/admin) 열쇠. 비어 있으면 보고서 화면이 꺼집니다.
  adminToken: env.ADMIN_TOKEN || '',
  links: {
    korail: env.KORAIL_URL || 'https://www.korail.com',
    srt: env.SRT_URL || 'https://etk.srail.kr',
  },
};
