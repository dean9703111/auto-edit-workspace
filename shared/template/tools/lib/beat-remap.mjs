// 032 B6 §4.7：字幕重對（media.mjs srt-align --remap-plan、剪輯台的分割／插入／合併／刪除）時，plan.json 以外寫著句號的地方一起換：
// 情境動畫裡的 P.at('#N…')、P.sfx('名', '#N…')，以及拍點正本在 work/designs/ 的段（內容設計動畫、手改的模板段、手寫 src）的鏡位腳本「講到」欄。
// mapper＝{ map(ref, 段 id) → 新 ref｜null }（ref 是 editor/subtitles.mjs parseRef 的格式）：media.mjs 的 refMapper（照時間）或 opsMapper（照剪輯台的 op）。
//   remapCustomRefs(html, mapper, id)               → 新的 html（只換 <script> 裡、不在註解裡的；原本在 media.mjs）
//   remapBeatTable(md, mapper, id)                  → 新的 markdown（只換「#### 動畫分鏡」表的「講到」欄，比對規則同 audit-beats.mjs 的 REF_RE）
//   opsMapper(cues0, ops, { videoDur })             → mapper：一串字幕 op 依序重對（每一步用那一步之前的字幕，同 editor/subtitles.mjs replay）
//   remapScripts(P, plan, mapper, { lib, now, tag }) → { scripts, anims }：plan＝重對之前的 plan（owner 照它判斷），改到的檔（相對專案）各自先備份 <檔>.<tag>-<時間>
import fs from 'node:fs';
import path from 'node:path';
import { parseRef, fmtRef, remapRef, applyCueOp } from '../editor/subtitles.mjs';
import { BEAT_REF_SOURCE } from './audit-beats.mjs';
import { beatOwnerOf, scriptFileOf } from './beat-source.mjs';
import { designFileOf, fillFileOf } from './custom-fill.mjs';
import { writeAtomic } from './atomic.mjs';

export const mapRefStr = (v, mp, id) => { const r = parseRef(v); if (!r) return v; const o = mp.map(r, id); return o ? fmtRef(o) : v; };

// 情境動畫裡 P.at('#N…')、P.sfx('名', '#N…') 的字串字面值照同一個對應換掉：只換 <script> 裡、不在註解裡的（檔頭說明的範例不動，和 assemble.mjs scanCueRefs 同一個範圍）
export function remapCustomRefs(html, mapper, id) {
  const swap = (code) => code.replace(/(\bP\.at\(\s*)(['"])(#\d+[^'"\n]*)\2(?=\s*[,)])/g, (all, pre, q, ref) => `${pre}${q}${mapRefStr(ref, mapper, id)}${q}`)
    // P.sfx('名', '#N…'[, off]) 的 ref 也是句號（motion.md §5）
    .replace(/(\bP\.sfx\(\s*(['"])[a-z0-9-]+\2\s*,\s*)(['"])(#\d+[^'"\n]*)\3(?=\s*[,)])/g, (all, pre, q0, q, ref) => `${pre}${q}${mapRefStr(ref, mapper, id)}${q}`);
  const inScripts = (h) => h.replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi, (all, open, body, close) =>
    open + body.split(/(\/\*[\s\S]*?\*\/|(?:^|(?<=\s))\/\/[^\n]*)/m).map((part, i) => (i % 2 ? part : swap(part))).join('') + close);
  // HTML 註解（檔頭說明裡也會寫「<script>」）整段不動
  return String(html).split(/(<!--[\s\S]*?-->)/).map((part, i) => (i % 2 ? part : inScripts(part))).join('');
}

// 表格一列每一格的位置（兩個 | 之間；\| 不算分隔）
function cellSpans(line) {
  const pipes = [];
  for (let i = 0; i < line.length; i++) if (line[i] === '|' && line[i - 1] !== '\\') pipes.push(i);
  return pipes.slice(0, -1).map((p, k) => [p + 1, pipes[k + 1]]);
}

// 「#### 動畫分鏡」表的「講到」欄：每個 #N、#Ne、#N@詞 換成對應後的句號；後面寫的「＋0.3」、反引號、說明照留
export function remapBeatTable(md, mapper, id) {
  const lines = String(md).split('\n');
  let inBeat = false, col = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i], t = l.trim();
    if (/^#{1,6}\s/.test(l)) { inBeat = /^####\s*動畫分鏡\s/.test(l); col = null; continue; }
    if (!t.startsWith('|')) { col = null; continue; }
    if (!inBeat) continue;
    const spans = cellSpans(l);
    if (col === null) { col = spans.findIndex(([a, b]) => /^講到/.test(l.slice(a, b).trim())); continue; }   // 表頭
    if (col < 0 || /^\|[\s:|-]+$/.test(t)) continue;                                                       // 沒有「講到」欄、分隔列
    const sp = spans[col];
    if (!sp) continue;
    const cell = l.slice(sp[0], sp[1]);
    const next = cell.replace(new RegExp(BEAT_REF_SOURCE, 'g'), (m, n, e, kw) => {
      const head = `#${n}${e}${kw ? `@${kw}` : ''}`;
      return mapRefStr(head, mapper, id) + m.slice(head.length);
    });
    if (next !== cell) lines[i] = l.slice(0, sp[0]) + next + l.slice(sp[1]);
  }
  return lines.join('\n');
}

// 剪輯台送來的一串字幕 op → mapper（不在字幕裡的 op 會失敗的就停在那裡，和 replay 一樣）
export function opsMapper(cues0, ops, { videoDur = null } = {}) {
  const steps = [];
  let cues = cues0;
  for (const op of Array.isArray(ops) ? ops : []) {
    const r = applyCueOp(cues, op, { videoDur });
    if (r.error) break;
    steps.push([op, cues]);
    cues = r.cues;
  }
  return { structural: steps.some(([op]) => ['split', 'insert', 'merge', 'delete'].includes(op?.op)), map: (r) => steps.reduce((x, [op, c]) => remapRef(x, op, c), r) };
}

const stampOf = (d) => { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };
const backupOf = (file, now, tag) => { let b = `${file}.${tag}-${stampOf(now)}`; for (let k = 2; fs.existsSync(b); k++) b = `${file}.${tag}-${stampOf(now)}-${k}`; return b; };
const animOf = (seg) => (typeof seg.src === 'string' && seg.src ? seg.src : seg.design ? designFileOf(seg) : seg.template ? fillFileOf(seg) : null);

// 拍點正本在 work/designs/ 的段：鏡位腳本「講到」欄＋那支動畫檔一起照 mapper 換。owner plan 的段不用（動畫檔下次 build 照新的 slots 重產）
export function remapScripts(P, plan, mapper, { lib, now = new Date(), tag = 'align' } = {}) {
  const scripts = [], anims = [];
  const relOf = (f) => path.relative(P.project || path.dirname(path.dirname(P.out)), f).split(path.sep).join('/');
  for (const seg of Array.isArray(plan?.scenes) ? plan.scenes : []) {
    if (!seg?.id || beatOwnerOf(P, seg, { lib }).owner !== 'script') continue;
    const anim = animOf(seg);
    const jobs = [[scriptFileOf(P, seg.id), (t) => remapBeatTable(t, mapper, seg.id), scripts], ...(anim ? [[path.join(P.out, anim), (t) => remapCustomRefs(t, mapper, seg.id), anims]] : [])];
    for (const [file, fn, list] of jobs) {
      if (!fs.existsSync(file)) continue;
      const text = fs.readFileSync(file, 'utf8'), next = fn(text);
      if (next === text) continue;
      fs.copyFileSync(file, backupOf(file, now, tag));
      writeAtomic(file, next);
      list.push(relOf(file));
    }
  }
  return { scripts, anims };
}
