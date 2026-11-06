// 詞級逐字稿的時間換算（純函式、零依賴）。流程：main.mp4 先剪掉停頓才轉 whisper（whisper 碰到長停頓會把後面那句的時間攤進停頓，
// 差到好幾秒；停頓拿掉就準了）→ 詞的時間換回 main.mp4（找 NG 用）→ ① 通過後換到 rough.mp4（不用再轉一次）。
//
//   keptSegments(v1, fps)            → [{ a, b, at }]：cuts.v1.json 每個保留段在原片的起迄（秒）與接起來之後的起點
//   sourceToRough(kept, t)           → 原片秒數 → 接起來之後的秒數（落在剪掉的範圍就接到下一段的起點）
//   roughToSourceTime(kept, t)       → 接起來之後的秒數 → 原片秒數
//   wordsToSource(words, kept)       → 只留保留段轉的逐字稿 → 原片時間軸
//   mapWords(words, v1, fps, { ngRanges }) → { words, dropped, collapsed, kept }：原片時間軸 → 初剪時間軸
//     NG 裡的詞（ngRanges＝cuts.md 打勾的列）丟掉：NG 的字和講稿一樣，留著字幕會對到剪掉的那一次。
//     有落在保留段的詞照剪掉多少往前移，起迄夾在保留段裡。
//     整個落在剪掉範圍（不是 NG）的詞接到下一段起點，到下一個詞之間照字數平均排（參數改過才會有，例：--edit 比轉逐字稿時嚴）。
const r3 = (n) => +Number(n).toFixed(3);
const charsOf = (w) => Math.max(1, [...String(w.text ?? '').replace(/[\s\p{P}\p{S}]/gu, '')].length);
const CHAR_SEC = 0.16;

export function keptSegments(v1, fps) {
  const out = [];
  let acc = 0;
  for (const [s, e, sp] of v1.chunks) {
    if (sp >= 99999) continue;
    out.push({ a: s / fps, b: e / fps, at: acc });
    acc += (e - s) / fps;
  }
  return out;
}

export function sourceToRough(kept, t) {
  for (const k of kept) if (t <= k.b + 1e-9) return k.at + Math.max(0, t - k.a);
  const l = kept[kept.length - 1];
  return l ? l.at + (l.b - l.a) : 0;
}

export function roughToSourceTime(kept, t) {
  for (const k of kept) if (t <= k.at + (k.b - k.a) + 1e-9) return k.a + Math.max(0, t - k.at);
  const l = kept[kept.length - 1];
  return l ? l.b : 0;
}

export const wordsToSource = (words, kept) => words.map((w) => ({ ...w, start: r3(roughToSourceTime(kept, +w.start)), end: r3(roughToSourceTime(kept, +w.end)) }));

export function mapWords(words, v1, fps, { ngRanges = [] } = {}) {
  const kept = keptSegments(v1, fps);
  const inNg = (t) => ngRanges.some(([a, b]) => t >= a - 1e-9 && t < b - 1e-9);
  const out = [];
  let dropped = 0;
  for (const w of words) {
    const s = +w.start, e = Math.max(+w.end, s);
    if (inNg((s + e) / 2)) { dropped++; continue; }
    const over = kept.filter((k) => k.b > s + 1e-9 && k.a < e - 1e-9);
    if (!over.length) { const t = sourceToRough(kept, s); out.push({ ...w, start: t, end: t, collapsed: true }); continue; }
    out.push({ ...w, start: sourceToRough(kept, Math.max(s, over[0].a)), end: sourceToRough(kept, Math.min(e, over[over.length - 1].b)) });
  }
  // 擠在接點上的詞：到下一個詞之間照字數平均排（沒有空間就照語速往後排）
  let collapsed = 0;
  for (let i = 0; i < out.length; i++) {
    if (!out[i].collapsed) continue;
    let j = i;
    while (j + 1 < out.length && out[j + 1].collapsed) j++;
    const chars = out.slice(i, j + 1).reduce((n, w) => n + charsOf(w), 0);
    const from = Math.max(out[i].start, i > 0 ? out[i - 1].end : 0), to = j + 1 < out.length ? out[j + 1].start : from + chars * CHAR_SEC;
    const per = (to > from ? to - from : chars * CHAR_SEC) / chars;
    let t = from;
    for (let k = i; k <= j; k++) { const d = per * charsOf(out[k]); out[k].start = t; out[k].end = t + d; t += d; collapsed++; }
    i = j;
  }
  return { words: out.map(({ collapsed: _c, ...w }) => ({ ...w, start: r3(w.start), end: r3(w.end) })), dropped, collapsed, kept };
}
