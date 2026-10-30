// 極簡點陣繪圖（rgb24 Buffer）：contact sheet、座標格線圖用。
// 不靠 ffmpeg 的 drawtext（要 freetype／fontconfig，Windows 與部分 Homebrew 版本沒有），數字用內建 5×7 點陣字。
//
//   canvas(w, h, rgb)                     → { w, h, data }
//   fillRect(c, x, y, w, h, rgb, alpha)   填色（alpha < 1 時和底色混合）
//   blit(c, src, x, y)                    貼上另一張 { w, h, data }
//   text(c, str, x, y, scale, rgb)        畫字（只有 0-9 : . # s x - , / 空白）
//   textWidth(str, scale)

const GLYPHS = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  '#': ['01010', '01010', '11111', '01010', '11111', '01010', '01010'],
  's': ['00000', '00000', '01111', '10000', '01110', '00001', '11110'],
  'x': ['00000', '00000', '10001', '01010', '00100', '01010', '10001'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  ',': ['00000', '00000', '00000', '00000', '01100', '00100', '01000'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

export function canvas(w, h, rgb = [0, 0, 0]) {
  const data = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) { data[i * 3] = rgb[0]; data[i * 3 + 1] = rgb[1]; data[i * 3 + 2] = rgb[2]; }
  return { w, h, data };
}

export function fillRect(c, x, y, w, h, rgb, alpha = 1) {
  const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(c.w, Math.round(x + w)), y1 = Math.min(c.h, Math.round(y + h));
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const i = (yy * c.w + xx) * 3;
      for (let k = 0; k < 3; k++) c.data[i + k] = alpha >= 1 ? rgb[k] : Math.round(c.data[i + k] * (1 - alpha) + rgb[k] * alpha);
    }
  }
}

export function blit(c, src, x, y) {
  for (let yy = 0; yy < src.h; yy++) {
    const ty = y + yy;
    if (ty < 0 || ty >= c.h) continue;
    const x0 = Math.max(0, -x), x1 = Math.min(src.w, c.w - x);
    if (x1 <= x0) continue;
    src.data.copy(c.data, (ty * c.w + x + x0) * 3, (yy * src.w + x0) * 3, (yy * src.w + x1) * 3);
  }
}

export const textWidth = (str, scale = 1) => String(str).length * 6 * scale - scale;

export function text(c, str, x, y, scale = 1, rgb = [255, 255, 255]) {
  let cx = x;
  for (const ch of String(str)) {
    const g = GLYPHS[ch] || GLYPHS[' '];
    for (let r = 0; r < 7; r++) for (let col = 0; col < 5; col++) if (g[r][col] === '1') fillRect(c, cx + col * scale, y + r * scale, scale, scale, rgb);
    cx += 6 * scale;
  }
}
