// 跨集偏好（025）：shared/偏好.md 的讀取（status.mjs --prefs* 寫；scaffold 把「照做」那幾條放進分鏡素材的共用.md）。零依賴。
import fs from 'node:fs';
import path from 'node:path';

export const prefKey = (t) => String(t).replace(/[\s，。、；：「」『』（）()!！?？,.;:"']/g, '').toLowerCase();
export const prefsFile = (root) => path.join(root, 'shared', '偏好.md');
// → { keep: [{ text, from }], skip: [{ text, from }] }；每一條是「- 規則（來源）」，來源在最後一對全形括號裡
export function readPrefs(root) {
  const out = { keep: [], skip: [] };
  let md = '';
  try { md = fs.readFileSync(prefsFile(root), 'utf8'); } catch { return out; }
  let cur = null;
  for (const l of md.split(/\r?\n/)) {
    const h = /^##\s*(照做|不採用)\s*$/.exec(l);
    if (h) { cur = h[1] === '照做' ? out.keep : out.skip; continue; }
    const m = cur && /^-\s+(.+?)(?:（([^（）]*)）)?\s*$/.exec(l);
    if (m) cur.push({ text: m[1].trim(), from: m[2] || '' });
  }
  return out;
}
