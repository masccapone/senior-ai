// 버튼에 넣는 바깥 링크 (예약·지도)
const config = require('./config');
const { ymd } = require('./parser');

const enc = encodeURIComponent;

function hotelLink(hotelName, destName, date, nights, people) {
  const q = hotelName.includes(destName) ? hotelName : `${destName} ${hotelName}`;
  if (config.agodaCid) {
    // 아고다 제휴(파트너) ID가 있으면 아고다 검색으로 (예약 시 수수료 발생)
    const p = new URLSearchParams({
      textToSearch: q, checkIn: ymd(date, '-'), los: String(Math.max(1, nights)),
      adults: String(people), rooms: '1', cid: config.agodaCid,
    });
    return `https://www.agoda.com/ko-kr/search?${p}`;
  }
  // 기본: 네이버 검색 (여러 예약 사이트 가격을 한 번에 보여줌)
  return `https://search.naver.com/search.naver?query=${enc(q + ' 예약')}`;
}

function mapLink(place, destName) {
  if (place.lat && place.lng) return `https://map.kakao.com/link/map/${enc(place.title)},${place.lat},${place.lng}`;
  const q = place.title.includes(destName) ? place.title : `${destName} ${place.title}`;
  return `https://map.kakao.com/link/search/${enc(q)}`;
}

function flightLink(originName, destName) {
  return `https://search.naver.com/search.naver?query=${enc(`${originName} ${destName} 항공권`)}`;
}

module.exports = { hotelLink, mapLink, flightLink, korail: () => config.links.korail, srt: () => config.links.srt };
