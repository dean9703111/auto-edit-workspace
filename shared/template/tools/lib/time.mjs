// 時間語法與換算（plan.json 的 from／to／at／beats）
//
//   #N        cue N 起點                 from／to／at／beats
//   #Ne       cue N 結尾                 同上
//   #N+0.3    cue N 起點再加 0.3 秒（也可 #Ne-0.2）
//   #N@詞     cue N 裡「詞」開頭的位置：有詞級逐字稿（cues.words，build 讀 work/transcript.json）時用那個詞的真實起點；
//             沒有、或那句附近找不到這個詞 → 起點 + 詞前面的字數 ÷ 全句字數 × 句長（全形 1、半形 0.5，同 visibleLen），並記在 cues.approx
//   #Ne@詞    同一個詞「結尾」的位置（to 用：卡片講完這個詞就收）
//   #N@詞+0.2 詞的位置再加 0.2 秒（也可 #N@詞-0.2；詞本身有 +／- 時先整串當詞找，找不到才拆出秒數）
//   12.5      絕對秒數                   只能用在 from／to
//   +1.2      本段起點後 1.2 秒          只能用在 at／beats
//
//   parseTime(v)              → { kind:'cue', n, end, off, kw?, kwFull? } | { kind:'abs', sec } | { kind:'rel', off } | { error }
//   cueSeconds(t, cues)       → { sec, word?, approx? } | { error }（kind 必須是 cue；有 kw 時用 cue.text 找詞，找不到回 error 並附原文；
//                              approx＝退回字數比例的原因）
//   wordTime(words, cue, kw, { end, guess })  → 秒數 | null（詞級逐字稿裡、這句前後 1.5 秒內，kw 第一個字的起點／最後一個字的結尾；去掉空白標點、不分大小寫逐字連續比對；
//                              整個詞找不到時找詞裡最長的一段（≥ 2 字）再推回詞頭；有幾個符合取最接近 guess 的）
//   normText(s)               → 去掉空白、標點、符號，轉小寫（NFKC）
//   findKw(text, kw)          → { i, len } | null（字元位置；先精確、再不分大小寫、再忽略空白）
//   textWidth(s)              → 字數（全形 1、半形 0.5，不四捨五入）
//   r3(x)                     → 四捨五入到毫秒
//   floorFrame(x, fps)        → 往下對齊到 1/fps 秒

import { foldZh } from './zh.mjs';
import { cueByN } from './srt.mjs';

export const FPS = 30;
export const r3 = (n) => +Number(n).toFixed(3);
export const floorFrame = (t, fps = FPS) => r3(Math.floor(t * fps + 1e-6) / fps);

export const TIME_HELP = '時間寫法：#12（第 12 句開頭）、#12e（第 12 句結尾）、#12+0.3、+1.2（本段起點後 1.2 秒，只用在 at／beats）、12.5（秒數，只用在 from／to）、#12@詞（第 12 句裡「詞」開口的位置，#12e@詞＝詞講完）';

export function parseTime(v) {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? { kind: 'abs', sec: v, raw: String(v) } : { error: `時間「${v}」不是有效秒數` };
  if (typeof v !== 'string') return { error: `時間要寫成字串或數字，現在是 ${JSON.stringify(v)}。${TIME_HELP}` };
  const s = v.trim();
  let m;
  if ((m = s.match(/^#(\d+)(e?)@(.+)$/))) {
    // 關鍵詞：@ 後面整串＝kwFull；尾巴若是 +／-秒數，拆開的詞＝kw、秒數＝off（詞本身有 +／- 時 cueSeconds 先試 kwFull）
    const tail = m[3].trim();
    const o = tail.match(/^(.+?)\s*([+-])\s*(\d+(?:\.\d+)?)$/);
    if (!tail) return { error: `「${s}」@ 後面要寫詞，例如 #12@剪輯清單。${TIME_HELP}` };
    return { kind: 'cue', n: Number(m[1]), end: m[2] === 'e', off: o ? (o[2] === '-' ? -1 : 1) * Number(o[3]) : 0, kw: o ? o[1] : tail, kwFull: tail, raw: s };
  }
  if ((m = s.match(/^#(\d+)(e?)\s*(?:([+-])\s*(\d+(?:\.\d+)?))?$/))) {
    return { kind: 'cue', n: Number(m[1]), end: m[2] === 'e', off: m[3] ? (m[3] === '-' ? -1 : 1) * Number(m[4]) : 0, raw: s };
  }
  if ((m = s.match(/^\+\s*(\d+(?:\.\d+)?)$/))) return { kind: 'rel', off: Number(m[1]), raw: s };
  if ((m = s.match(/^\d+(?:\.\d+)?$/))) return { kind: 'abs', sec: Number(s), raw: s };
  return { error: `看不懂的時間「${s}」。${TIME_HELP}` };
}

// 字數：全形 1、半形 0.5（同 scenes.mjs 的 visibleLen，但不四捨五入，算比例用）
export const textWidth = (str) => { let n = 0; for (const ch of String(str)) n += ch.codePointAt(0) >= 0x20 && ch.codePointAt(0) <= 0x7e ? 0.5 : 1; return n; };

// 在字幕原文裡找詞：精確 → 不分大小寫 → 忽略空白（srt-enhancer 會在中英之間加空格，AI 寫詞時常漏掉）；回傳原文的字元位置
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

// ---------- 詞級逐字稿（work/transcript.json：[{ text, start, end }]，rough.mp4 秒數）----------
// cues.words＝詞陣列（和 cues 同一個時間基準）；cues.wordsWhy＝沒有掛上去的原因；cues.approx＝Set，退回字數比例的 #N@詞
// 只去標點、不折繁簡：要印給人看的文字（和 normText 一個字對一個字）
export const plainText = (s) => String(s ?? '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
// 繁簡折成同一種：whisper 有時轉成簡體，「不滿意」和「不满意」要對得上（一個字換一個字，長度不變）
export const normText = (s) => foldZh(String(s ?? '').normalize('NFKC').toLowerCase()).replace(/[\s\p{P}\p{S}]/gu, '');
const charCache = new WeakMap();
function wordChars(words) {
  let out = charCache.get(words);
  if (out) return out;
  out = [];
  for (const w of words) {
    const chs = [...normText(w.text)];
    const d = (w.end - w.start) / Math.max(1, chs.length);
    chs.forEach((ch, i) => out.push({ ch, s: w.start + d * i, e: w.start + d * (i + 1) }));
  }
  charCache.set(words, out);
  return out;
}
export function wordTime(words, c, kw, { end = false, guess = null, pad = 1.5 } = {}) {
  const k = [...normText(kw)];
  if (!k.length || !Array.isArray(words) || !words.length || !c) return null;
  const win = wordChars(words).filter((x) => x.s >= c.start - pad && x.s <= c.end + pad);
  if (!win.length) return null;
  const durs = win.map((x) => x.e - x.s).sort((a, b) => a - b);
  const per = durs[Math.floor(durs.length / 2)] || 0.2;   // 一個字大約幾秒（這段的中位數）
  // 先找整個詞；找不到再找詞裡最長的一段（≥ 2 字，逐字稿聽成別的字時），起點往前推「前面少的字數 × 每字秒數」
  for (let len = k.length; len >= Math.min(2, k.length); len--) {
    let best = null;
    for (let o = 0; o + len <= k.length; o++) {
      for (let i = 0; i + len <= win.length; i++) {
        let ok = true;
        for (let j = 0; j < len && ok; j++) ok = win[i + j].ch === k[o + j];
        if (!ok) continue;
        // 逐字稿聽錯時，一整句可能擠在零點幾秒裡，這種時間不能信（一個字不到 0.04 秒，人講不了這麼快），當作找不到，退回字數比例
        if ((win[i + len - 1].e - win[i].s) / len < 0.04) continue;
        const t = end ? win[i + len - 1].e + (k.length - o - len) * per : win[i].s - o * per;
        const d = guess == null ? 0 : Math.abs(t - guess);
        if (!best || d < best.d - 1e-9) best = { t, d };
      }
    }
    if (best) return r3(Math.max(0, best.t));
  }
  return null;
}

export function cueSeconds(t, cues) {
  const c = cueByN(cues, t.n);
  if (!c) {
    const last = cues.length ? cues[cues.length - 1].n : 0;
    return { error: `字幕沒有第 ${t.n} 句（rough.srt 共 ${cues.length} 句，句號 1–${last}）` };
  }
  if (t.kw != null) {
    let hit = findKw(c.text, t.kwFull), off = 0, word = t.kwFull;
    if (!hit && t.kw !== t.kwFull) { hit = findKw(c.text, t.kw); off = t.off; word = t.kw; }
    if (!hit) return { error: `#${t.n} 找不到詞「${t.kwFull}」→ 第 ${t.n} 句原文是「${c.text}」；詞要跟字幕寫法一致（或改用 #${t.n} 不指定詞）` };
    const total = textWidth(c.text);
    const at = textWidth(c.text.slice(0, hit.i + (t.end ? hit.len : 0)));
    const prop = c.start + (total > 0 ? at / total : 0) * (c.end - c.start);
    let sec = prop, approx = null;
    if (cues.words?.length) {
      const real = wordTime(cues.words, c, word, { end: t.end, guess: prop });
      if (real != null) sec = real; else approx = '詞級逐字稿在這句附近找不到這個詞';
    } else if (cues.wordsWhy) approx = cues.wordsWhy;
    if (approx && cues.approx) cues.approx.add(`#${t.n}${t.end ? 'e' : ''}@${word}`);
    return { sec: r3(sec + off), word, ...(approx ? { approx } : {}) };
  }
  return { sec: r3((t.end ? c.end : c.start) + t.off) };
}
