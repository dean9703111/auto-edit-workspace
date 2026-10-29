// SRT 解析與字幕句比對（零依賴；移植自 hyperframes-scenes scripts/lib/srt.mjs，只留 build 用得到的部分）
//
//   parseSrt(text)                       → [{ n, start, end, text }]（n＝SRT 句號，秒數到毫秒；CRLF／BOM 都可）
//   norm(s)                              → 比對用正規化：去空白標點、全形轉半形、英文小寫
//   similarity(a, b)                     → 0–1；max(Dice 係數, a 的 bigram 被 b 涵蓋的比例 × 0.95)
//   findCue(cues, anchor, { from, to })  → 句號範圍內第一個包含 anchor 的句子；沒有就取相似度最高且 ≥ 0.5 者；都沒有回 null
//   cueByN(cues, n)                      → 該句物件

const toSec = (stamp) => {
  const [h, m, rest] = stamp.trim().split(':');
  const [s, ms = '0'] = rest.split(/[,.]/);
  return +(Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms.padEnd(3, '0').slice(0, 3)) / 1000).toFixed(3);
};

export function parseSrt(text) {
  const cues = [];
  for (const block of String(text).replace(/^﻿/, '').trim().split(/\r?\n\s*\r?\n/)) {
    const lines = block.split(/\r?\n/).filter((l) => l.trim() !== '');
    if (lines.length < 2) continue;
    const n = Number(lines[0].trim());
    const m = lines[1].match(/([\d:,.]+)\s*-->\s*([\d:,.]+)/);
    if (!Number.isInteger(n) || !m) continue;
    cues.push({ n, start: toSec(m[1]), end: toSec(m[2]), text: lines.slice(2).join(' ').trim() });
  }
  return cues.sort((a, b) => a.n - b.n);
}

export function norm(s) {
  return String(s)
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))   // 全形英數標點 → 半形
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, '');
}

const grams = (s) => {
  const g = new Map();
  if (s.length === 1) g.set(s, 1);
  for (let i = 0; i < s.length - 1; i++) { const k = s.slice(i, i + 2); g.set(k, (g.get(k) || 0) + 1); }
  return g;
};
const overlap = (ga, gb) => { let c = 0; for (const [k, v] of ga) c += Math.min(v, gb.get(k) || 0); return c; };
const size = (g) => { let c = 0; for (const v of g.values()) c += v; return c; };

export function similarity(a, b) {
  const na = norm(a), nb = norm(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ga = grams(na), gb = grams(nb);
  const o = overlap(ga, gb), sa = size(ga), sb = size(gb);
  const dice = (2 * o) / (sa + sb), cover = sa ? o / sa : 0;
  return Math.max(dice, cover * 0.95);
}

export function findCue(cues, anchor, { from = -Infinity, to = Infinity } = {}) {
  const na = norm(anchor);
  if (!na) return null;
  const pool = cues.filter((c) => c.n >= from && c.n <= to);
  const hit = pool.find((c) => norm(c.text).includes(na));
  if (hit) return hit.n;
  let best = null, bs = 0;
  for (const c of pool) { const s = similarity(anchor, c.text); if (s > bs) { bs = s; best = c.n; } }
  return bs >= 0.5 ? best : null;
}

export const cueByN = (cues, n) => cues.find((c) => c.n === n) || null;
