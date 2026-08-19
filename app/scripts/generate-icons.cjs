// One-off placeholder PWA icon generator (solid color + simple fuel-drop mark).
// Replace public/icons/icon-*.png with real artwork whenever convenient.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let c;
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function inCircle(x, y, size) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.42;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function inDrop(x, y, size) {
  // simple fuel-drop silhouette in the icon's upper-middle area
  const cx = size / 2;
  const topY = size * 0.28;
  const bottomY = size * 0.72;
  if (y < topY || y > bottomY) return false;
  const t = (y - topY) / (bottomY - topY); // 0 at top point, 1 at bottom
  const maxRadius = size * 0.16;
  const radius = t < 0.35 ? maxRadius * (t / 0.35) : maxRadius;
  const dx = x - cx;
  return Math.abs(dx) <= radius;
}

function buildPng(size) {
  const bg = [0x2b, 0x6c, 0xff, 0xff];
  const fg = [0xff, 0xff, 0xff, 0xff];

  const raw = Buffer.alloc((1 + size * 4) * size);
  let offset = 0;
  for (let y = 0; y < size; y++) {
    raw[offset++] = 0; // no filter
    for (let x = 0; x < size; x++) {
      const color = inCircle(x, y, size) && inDrop(x, y, size) ? fg : bg;
      raw[offset++] = color[0];
      raw[offset++] = color[1];
      raw[offset++] = color[2];
      raw[offset++] = color[3];
    }
  }

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type RGBA
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdr = chunk('IHDR', ihdrData);

  const idatData = zlib.deflateSync(raw);
  const idat = chunk('IDAT', idatData);

  const iend = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

const outDir = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });

[192, 512].forEach((size) => {
  const png = buildPng(size);
  fs.writeFileSync(path.join(outDir, `icon-${size}.png`), png);
  console.log(`wrote icons/icon-${size}.png (${png.length} bytes)`);
});
