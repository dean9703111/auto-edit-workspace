// 動畫文字（slots／vars）的共用小工具（純函式；剪輯頁面與 server 共用）
//
//   visibleLen(s)               字數：全形 1、半形 0.5，「**」與「//」不算（跟 build.mjs 一樣）
//   splitItem(s, nFields)       清單項目字串「文字 / 文字 ｜icon=x at=#3」→ { cols, tail }（tail 原樣保留，含前面的空白與｜）
//   joinItem(cols, tail)        反過來組回字串
//   parseAttrs(tail)            「｜icon=x at=#3」→ { icon: 'x', at: '#3' }
//   toggleEmph(s, a, b)         可強調欄位選了字按「重點」：沒標的包成 **詞**、已經標的拿掉（游標在 **…** 裡、沒選字也拿掉那一個）→ { value, a, b } 或 null（沒事可做）

export const richPlain = (s) => String(s).replace(/\*\*/g, '').replace(/(?<!:)\/\//g, '');
// 重點的範圍（不含 **）：[[內文起點, 內文終點]…]
const emphSpans = (s) => { const out = []; const re = /\*\*(.+?)\*\*/g; let m; while ((m = re.exec(s))) out.push([m.index + 2, m.index + 2 + m[1].length]); return out; };
export function toggleEmph(s, a, b) {
  const v = String(s ?? '');
  let x = Math.max(0, Math.min(a, b)), y = Math.min(v.length, Math.max(a, b));
  const spans = emphSpans(v);
  // 碰到已經標的那一個（游標在裡面、選到它的字、或連 ** 一起選）→ 拿掉
  const hit = spans.find(([p, q]) => (x === y ? x >= p && x <= q : x < q + 2 && y > p - 2));
  if (hit) {
    const [p, q] = hit;
    const value = v.slice(0, p - 2) + v.slice(p, q) + v.slice(q + 2);
    return { value, a: p - 2, b: q - 2 };
  }
  if (x === y) return null;
  // 選到的前後空白不包進去（「 Node.js 」→「 **Node.js** 」）
  while (x < y && /\s/.test(v[x])) x++;
  while (y > x && /\s/.test(v[y - 1])) y--;
  if (x === y || /\*\*|\/\//.test(v.slice(x, y))) return null;
  return { value: `${v.slice(0, x)}**${v.slice(x, y)}**${v.slice(y)}`, a: x + 2, b: y + 2 };
}
export function visibleLen(s) {
  let n = 0;
  for (const ch of richPlain(s)) n += ch.codePointAt(0) >= 0x20 && ch.codePointAt(0) <= 0x7e ? 0.5 : 1;
  return Math.round(n);
}
// 以下兩個和 lib/time.mjs 的 textWidth／findKw 同一份邏輯（"#N@詞" 用；頁面不能 import lib，所以放一份；timing.test.mjs 會比對兩邊結果一致）
export const textWidth = (str) => { let n = 0; for (const ch of String(str)) n += ch.codePointAt(0) >= 0x20 && ch.codePointAt(0) <= 0x7e ? 0.5 : 1; return n; };
export function findKw(text, kw) {
  const t = String(text), k = String(kw);
  if (!k) return null;
  let i = t.indexOf(k);
  if (i >= 0) return { i, len: k.length };
  i = t.toLowerCase().indexOf(k.toLowerCase());
  if (i >= 0 && t.toLowerCase().length === t.length) return { i, len: k.length };
  const keep = [];
  for (let p = 0; p < t.length; p++) if (!/\s/.test(t[p])) keep.push(p);
  const flat = keep.map((p) => t[p]).join('').toLowerCase(), fk = k.replace(/\s+/g, '').toLowerCase();
  const j = fk ? flat.indexOf(fk) : -1;
  return j >= 0 ? { i: keep[j], len: keep[j + fk.length - 1] - keep[j] + 1 } : null;
}
export function lineLens(s) { return String(s).split(/(?<!:)\/\//).map((x) => visibleLen(x)); }

const ATTRS_TAIL = /\s*[｜|]\s*((?:[\w.-]+=(?:"[^"]*"|\S+)\s*)+)$/;
export function splitItem(s, nFields = 1) {
  const str = String(s ?? '');
  const m = str.match(ATTRS_TAIL);
  const value = m ? str.slice(0, m.index) : str;
  const tail = m ? str.slice(m.index) : '';
  const cols = nFields >= 2 && / \/ /.test(value) ? value.split(/ \/ /).map((x) => x.trim()) : [value.trim()];
  return { cols, tail };
}
export function joinItem(cols, tail = '') {
  const list = cols.map((x) => String(x ?? '').trim());
  while (list.length > 1 && list[list.length - 1] === '') list.pop();
  return list.join(' / ') + (tail || '');
}
export function parseAttrs(tail) {
  const out = {};
  const m = String(tail || '').match(ATTRS_TAIL);
  if (!m) return out;
  const re = /([\w.-]+)=("([^"]*)"|\S+)/g;
  let x;
  while ((x = re.exec(m[1]))) out[x[1]] = x[3] !== undefined ? x[3] : x[2];
  return out;
}
// 新增清單項目時沿用上一項的非文字屬性（圖示），但不帶 at（新項目跟著模板的預設時間進場）
export function tailWithoutAt(tail) {
  const a = parseAttrs(tail);
  delete a.at;
  const keys = Object.keys(a);
  return keys.length ? ` ｜${keys.map((k) => `${k}=${/\s/.test(a[k]) ? `"${a[k]}"` : a[k]}`).join(' ')}` : '';
}

// --list --json 的情境定義：key、中文名、編號、別名都找得到（跟 build.mjs 的 findScene 一樣）
export function findSceneDef(scenes, ref) {
  const raw = String(ref ?? '').trim();
  const r = raw.toLowerCase();
  if (!r || !Array.isArray(scenes)) return null;
  return scenes.find((s) => s.key?.toLowerCase() === r || s.zh === raw || (s.aliases || []).some((a) => a === raw || String(a).toLowerCase() === r)
    || s.dirName?.toLowerCase() === r || String(s.num ?? '').toLowerCase() === r || String(s.no).toLowerCase() === r) || null;
}
export function findFxDef(fx, ref) {
  if (!Array.isArray(fx)) return null;
  return fx.find((f) => Number(f.no ?? f.id) === Number(ref)) || null;
}
