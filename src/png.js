// 사진이 없는 카드에 쓸 단색 그림(PNG)을 만듭니다. 외부 이미지 파일이 필요 없게.
const zlib = require('zlib');

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

// 위에서 아래로 두 색이 부드럽게 바뀌는 그림
function gradientPng(width, height, top, bottom) {
  const row = 1 + width * 3;
  const raw = Buffer.alloc(row * height);
  for (let y = 0; y < height; y++) {
    const t = y / (height - 1);
    const rgb = top.map((c, i) => Math.round(c + (bottom[i] - c) * t));
    raw[y * row] = 0;
    for (let x = 0; x < width; x++) rgb.forEach((v, i) => (raw[y * row + 1 + x * 3 + i] = v));
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// 카카오 카드 권장 비율 2:1
const NO_IMAGE = gradientPng(800, 400, [255, 236, 179], [255, 204, 128]);

module.exports = { NO_IMAGE, gradientPng };
