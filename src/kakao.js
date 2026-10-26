// 카카오 i 오픈빌더 스킬 응답(JSON v2.0) 만들기 도우미.
// 글자 수 제한을 넘으면 카카오가 응답을 거부하므로 여기서 잘라 줍니다.
const cut = (s, n) => {
  const t = String(s || '');
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
};

const LIMIT = {
  simpleText: 1000,
  title: 50,
  basicDesc: 230,
  textDesc: 400,
  label: 14,
  carouselItems: 10,
  buttons: 3,
  quickReplies: 10,
  outputs: 3,
};

const button = {
  link: (label, url) => ({ action: 'webLink', label: cut(label, LIMIT.label), webLinkUrl: url }),
  message: (label, messageText) => ({ action: 'message', label: cut(label, LIMIT.label), messageText }),
};

const simpleText = (text) => ({ simpleText: { text: cut(text, LIMIT.simpleText) } });

// 목록형 카드: 머리글 1줄 + 항목 최대 5개 + 버튼. 기차 시간표처럼 한눈에 비교할 때 씁니다.
// items: [{ title, description, url }]
const listCard = ({ header, items, buttons = [] }) => ({
  listCard: {
    header: { title: cut(header, LIMIT.title) },
    items: items.slice(0, 5).map((it) => ({
      title: cut(it.title, LIMIT.title),
      ...(it.description ? { description: cut(it.description, LIMIT.title) } : {}),
      ...(it.url ? { link: { web: it.url } } : {}),
    })),
    buttons: buttons.slice(0, LIMIT.buttons),
    buttonLayout: 'vertical',
  },
});

const basicCard = ({ title, description, imageUrl, buttons = [] }) => ({
  title: cut(title, LIMIT.title),
  description: cut(description, LIMIT.basicDesc),
  thumbnail: { imageUrl },
  buttons: buttons.slice(0, LIMIT.buttons),
  buttonLayout: 'vertical',
});

const carousel = (type, cards) => ({ carousel: { type, items: cards.slice(0, LIMIT.carouselItems) } });

const quickReply = (label, messageText) => ({ action: 'message', label: cut(label, LIMIT.label), messageText: messageText || label });

function response(outputs, quickReplies = []) {
  return {
    version: '2.0',
    template: {
      outputs: outputs.filter(Boolean).slice(0, LIMIT.outputs),
      quickReplies: quickReplies.slice(0, LIMIT.quickReplies),
    },
  };
}

module.exports = { button, simpleText, listCard, basicCard, carousel, quickReply, response, LIMIT, cut };
