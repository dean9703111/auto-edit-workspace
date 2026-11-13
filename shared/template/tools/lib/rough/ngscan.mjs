// ng-scan（找 NG）與 ng-snap（NG 對齊靜音、剪輯指令）
// 032 C9：從 media.mjs 搬過來（只搬移，輸出不變）；media.mjs 照舊匯出原本那些名稱
import path from 'node:path';
import fs from 'node:fs';
import { normText, plainText } from '../time.mjs';
import { readScript } from '../script-file.mjs';
import { next, cmdLine } from '../say.mjs';
import { probeMedia } from '../ff.mjs';
import { scriptLines, alignSeq } from './align.mjs';
import { r3, fmtC, posixRel, fmtT } from './util.mjs';
import { mainClips, CUT, parseMargin, parseCutsMd, mainSource, aeSilence, silencesOf, readV1, chapterKeep, snapNg, mergeRanges, subtractRanges, scriptOrder, suggestOrder, orderCommand, aeCommand } from './cuts.mjs';

// ---------- ng-scan ----------
// 詞級逐字稿（main.mp4 的 work/transcript.json）對講稿：講稿裡只出現一次的四字組當錨點，每個錨點＝那一刻講到講稿的哪個字。
// 講稿位置往回跳（從新位置一路講回前一次講到的地方或重講 ≥ 20 字、前一次在 90 秒內）＝重講：前一次講到這個位置起、到重講開口前，列成 NG 候選（留最後一次）。
// 錨點之間空 ≥ 3 秒又有字的列「講稿外」。沒講稿：相鄰 3 句兩兩相像（兩字組重疊 ≥ 50%）的前一句列 NG 候選。章節（講稿 ##）第一句的開口時間印成章節空檔表。
export const NGSCAN = { gap: 0.3, backChars: 3, tol: 2, minLen: 0.6, maxBack: 90, confirm: 3, step: 15, redo: 20, outsideGap: 3, charSec: 0.22, similar: 0.5, window: 3, stumble: 0.8, repeatMin: 3, repeatMinNoScript: 4, repeatMax: 40,
  offExtra: 6, offRatio: 0.5, offLong: 12 };   // 講稿外：逐字稿比講稿多 ≥ 6 字，而且講稿字數 ≤ 逐字稿一半（或多 ≥ 12 字）才算真的講稿外；字數接近＝whisper 聽錯
const pairsOf = (t) => { const cs = [...normText(t)], out = []; for (let i = 0; i + 1 < cs.length; i++) out.push(cs[i] + cs[i + 1]); return out; };

// 講稿 → { lines（講解行）, chapters: [{ title, line（第幾行，0 起）}] }（## 是章節；### 是段落標題，不算）
// 一段一段丟給 scriptLines 算行數：``` 區塊與 <!-- --> 註解的狀態要跟整份一起看，所以遇到 ## 才切段
export function scriptChapters(md) {
  const lines = scriptLines(md), chapters = [];
  let buf = [], n = 0, fence = false;
  for (const raw of String(md ?? '').split(/\r?\n/)) {
    const l = raw.trim();
    if (/^(```|~~~)/.test(l)) fence = !fence;
    const m = !fence && l.match(/^##\s+(.+)$/);
    if (m && !l.startsWith('###')) { n += scriptLines(buf.join('\n')).length; buf = []; chapters.push({ title: m[1].trim(), line: n }); continue; }
    buf.push(raw);
  }
  return { lines, chapters: chapters.filter((c) => c.line < lines.length) };
}

// words＝[{ text, start, end }]；bounds＝主軌換檔的秒數
export function utterances(words, bounds = []) {
  const out = [];
  let cur = null;
  for (const w of words) {
    const cross = cur && bounds.some((b) => cur.end <= b + 1e-6 && w.start >= b - 1e-6);
    if (!cur || w.start - cur.end >= NGSCAN.gap || cross || /[。！？!?]$/.test(cur.text)) { cur = { start: w.start, end: w.end, text: '' }; out.push(cur); }
    cur.text += w.text; cur.end = w.end;
  }
  return out.map((u) => ({ start: r3(u.start), end: r3(u.end), text: u.text }));
}

// 錨點：講稿裡只出現一次的四字組，在逐字稿裡出現＝那一刻講到講稿的那個位置（字元偏移）；前後 6 字內有另一個位置相符的錨點才算（擋掉巧合）
export function scriptAnchors(words, lines, n = 4) {
  const S = lines.map((l) => normText(l)).join(''), lineAt = [];
  lines.forEach((l, i) => { for (const _ of normText(l)) lineAt.push(i); });
  const count = new Map(), pos = new Map();
  for (let i = 0; i + n <= S.length; i++) { const g = S.slice(i, i + n); count.set(g, (count.get(g) || 0) + 1); pos.set(g, i); }
  const T = [];
  for (const w of words) { const cs = [...normText(w.text)], os = [...plainText(w.text)]; cs.forEach((c, k) => T.push({ c, o: os[k], t: r3(w.start + (k / Math.max(1, cs.length)) * (w.end - w.start)) })); }
  const raw = [];
  for (let i = 0; i + n <= T.length; i++) { const g = T.slice(i, i + n).map((x) => x.c).join(''); if (count.get(g) === 1) raw.push({ i, t: T[i].t, s: pos.get(g) }); }
  const ok = raw.filter((a, k) => raw.slice(Math.max(0, k - 4), k + 5).some((b) => b !== a && Math.abs(b.i - a.i) <= 6 && Math.abs((b.s - a.s) - (b.i - a.i)) <= 1));
  return { S, lineAt, T, anchors: ok.map((a) => ({ ...a, line: lineAt[a.s] })) };
}

// 贅字（025）：逐字稿裡的語助詞（嗯、呃…，連著講算一處）與口頭禪（就是說、那個那個…）。講稿裡有同一個字／詞就不列（那是講稿要講的）。
// 回傳 [{ start, end, filler, text（前後各 6 字，贅字用「」框起來）}]，照時間排；只列出來，剪不剪交給使用者（cuts.md 預設不勾）
export const FILLERS = { single: ['嗯', '呃', '欸', '痾', '蛤'], phrase: ['就是說', '那個那個', '然後然後', '怎麼說呢', '對對對'], minLen: 0.12 };
export function fillerRows(words, lines = null) {
  const S = lines ? lines.map((l) => normText(l)).join('') : '';
  const single = new Set(FILLERS.single.map((c) => normText(c)).filter((c) => !S.includes(c)));
  const phrase = FILLERS.phrase.map((p) => [...normText(p)]).filter((p) => !S.includes(p.join('')));
  const T = [];
  // c＝比對用（繁簡折疊、去標點），o＝顯示用的原字
  for (const w of words || []) { const cs = [...normText(w.text)], os = [...plainText(w.text)]; cs.forEach((c, k) => T.push({ c, o: os[k] ?? c, t0: w.start + (k / cs.length) * (w.end - w.start), t1: w.start + ((k + 1) / cs.length) * (w.end - w.start) })); }
  const show = (a, b) => T.slice(Math.max(0, a), b).map((x) => x.o).join('');
  const out = [];
  for (let i = 0; i < T.length;) {
    let n = 0;
    const p = phrase.find((ph) => ph.every((c, k) => T[i + k] && T[i + k].c === c));
    if (p) n = p.length;
    else while (T[i + n] && single.has(T[i + n].c)) n++;
    if (!n) { i++; continue; }
    const start = r3(T[i].t0), end = r3(T[i + n - 1].t1), filler = show(i, i + n);
    if (end - start >= FILLERS.minLen - 1e-9) out.push({ start, end, filler, text: `${show(i - 6, i)}「${filler}」${show(i + n, i + n + 6)}` });
    i += n;
  }
  return out;
}

export function ngScanRows(words, { lines = null, bounds = [] } = {}) {
  const ng = [], outside = [];
  if (lines && lines.length) {
    const A = scriptAnchors(words, lines);
    const live = [];
    let far = -1;
    const all = A.anchors;
    // 從錨點 k 起一路往下講（相鄰錨點只往前一點點）的那一串：n＝接了幾個、reach＝講到哪
    const run = (k) => {
      let reach = all[k].s, n = 0;
      for (let j = k + 1; j < all.length && n < 40; j++) {
        const d = all[j].s - all[j - 1].s;
        if (d < -NGSCAN.tol || d > NGSCAN.step) break;
        reach = Math.max(reach, all[j].s); n++;
      }
      return { reach, n };
    };
    for (let ai = 0; ai < all.length; ai++) {
      const a = all[ai];
      // 往前大跳（中間有講稿外的話、或巧合撞到後面相似的字）：後面要接著往下講才算，不然當雜訊
      if (far >= 0 && a.s > far + NGSCAN.step && run(ai).n < NGSCAN.confirm) continue;
      if (a.s < far - NGSCAN.backChars) {
        // 往回跳要站得住：從新位置一路往下講，講回到前一次講到的地方、或重講了 ≥ 20 字（巧合只會往回幾個字就跳走）
        const r = run(ai);
        if (r.n < NGSCAN.confirm || !(r.reach >= far - NGSCAN.backChars || r.reach - a.s >= NGSCAN.redo)) continue;
        // 前一次講到這個位置的那個錨點起（最後一串在重講位置之後的錨點），到重講開口前，都是 NG
        let k = live.length;
        while (k > 0 && live[k - 1].s >= a.s) k--;
        if (a.t - live[k].t > NGSCAN.maxBack) continue;   // 前一次在 90 秒以前：不是重講，是講稿裡相似的另一句
        const gone = live.splice(k);
        const t0 = gone[0].t, t1 = a.t;
        if (t1 - t0 >= NGSCAN.minLen) {
          const text = A.T.filter((x) => x.t >= t0 - 1e-6 && x.t < t1).map((x) => x.o).join('');
          ng.push({ start: r3(t0), end: r3(t1), text: text.slice(0, 40), line: a.line + 1, again: r3(t1) });
        }
        far = live.length ? Math.max(...live.map((x) => x.s)) : -1;
      }
      live.push(a);
      far = Math.max(far, a.s);
    }
    // 短的重講：前一次的錨點拿掉（不算講稿外、行的開口用後面那次）
    const again = scriptRepeats(A, live, ng);
    if (again.length) {
      ng.push(...again);
      ng.sort((x, y) => x.start - y.start);
      for (const g of again) for (let k = live.length - 1; k >= 0; k--) if (live[k].t >= g.start - 1e-6 && live[k].t < g.end - 1e-6) live.splice(k, 1);
    }
    outside.push(...outsideRows(A, live, ng));
    // 每一行第一次（還算數的）開口時間
    const lineTime = new Map();
    for (const a of live) if (!lineTime.has(a.line)) lineTime.set(a.line, r3(Math.max(0, a.t - (a.s - A.S.indexOf(normText(lines[a.line]))) * NGSCAN.charSec)));
    return { ng: markCross(ng, bounds), outside, lineTime, anchors: A.anchors.length, fillers: fillerRows(words, lines) };
  }
  // 沒講稿：相鄰幾句兩兩相像 → 前一句
  const U = utterances(words, bounds);
  for (let i = 0; i < U.length; i++) {
    const S = new Set(pairsOf(U[i].text));
    if (S.size < 3) continue;
    for (let j = i + 1; j <= Math.min(U.length - 1, i + NGSCAN.window); j++) {
      const B = pairsOf(U[j].text), hit = B.filter((g) => S.has(g)).length;
      // 很像，或講到一半卡住（前一句 ≥ 4 字、幾乎整句是後一句的開頭）
      const a = [...normText(U[i].text)], b = [...normText(U[j].text)];
      let lead = 0;
      while (lead < a.length && lead < b.length && a[lead] === b[lead]) lead++;
      const stumble = a.length >= 4 && b.length > a.length && lead / a.length >= NGSCAN.stumble;
      if (hit / Math.max(S.size, B.length) >= NGSCAN.similar || stumble) { ng.push({ start: U[i].start, end: U[j].start, text: U[i].text.slice(0, 40), line: null, again: U[j].start }); break; }
    }
  }
  // 句子切得不準（卡住那次和上一句黏在一起）時比不出來：字元層級再看一次「緊接著重複」
  const T = [];
  for (const w of words) { const cs = [...normText(w.text)], os = [...plainText(w.text)]; cs.forEach((c, k) => T.push({ c, o: os[k], t: r3(w.start + (k / Math.max(1, cs.length)) * (w.end - w.start)) })); }
  ng.push(...selfRepeats(T, ng, { min: NGSCAN.repeatMinNoScript }));
  ng.sort((a, b) => a.start - b.start);
  return { ng: markCross(ng, bounds), outside, lineTime: new Map(), anchors: 0, fillers: fillerRows(words, null) };
}

// 講到一半卡住重講：逐字稿連續兩段幾乎一樣（whisper 兩次會聽錯同樣的字，比講稿穩）。錨點是四字組，前一次不到 8 字時跳不回來、抓不到，靠這個補。
// T＝逐字稿的字；ok(k, L)：這一段算不算（有講稿時看講稿這裡是不是本來就重複）；rowOf(k, L)：這一列的講稿行號
function selfRepeats(T, ng, { min = NGSCAN.repeatMin, ok = () => true, lineOf = () => null } = {}) {
  const n = T.length, chars = T.map((x) => x.c), out = [];
  const taken = (a, b) => ng.some((g) => a < g.end - 1e-6 && b > g.start + 1e-6);
  for (let k = 0; k + 2 * min <= n;) {
    let L = 0;
    for (let l = Math.min(NGSCAN.repeatMax, Math.floor((n - k) / 2)); l >= min; l--) {
      let miss = 0;
      for (let i = 0; i < l && miss <= Math.floor(l / 6); i++) if (chars[k + i] !== chars[k + l + i]) miss++;
      if (miss <= Math.floor(l / 6) && chars[k] === chars[k + l]) { L = l; break; }
    }
    if (!L) { k++; continue; }
    const t0 = T[k].t, t1 = T[k + L].t;
    if (t1 - t0 >= NGSCAN.minLen && !taken(t0, t1) && ok(k, L)) {
      out.push({ start: r3(t0), end: r3(t1), text: T.slice(k, k + L).map((x) => x.o ?? x.c).join(''), line: lineOf(k, L), again: r3(t1), repeat: L });
      k += L;
    } else k++;
  }
  return out;
}

// 有講稿：講稿這裡本來就重複（兩個錨點之間逐字稿沒有比講稿多字）就不算
function scriptRepeats(A, live, ng) {
  const { T, lineAt, S } = A, n = T.length;
  const around = (k, L) => {
    let before = null, after = null;
    for (const a of live) { if (a.i < k) before = a; else if (a.i >= k + 2 * L) { after = a; break; } }
    return { before, after };
  };
  return selfRepeats(T, ng, {
    ok: (k, L) => { const { before, after } = around(k, L); return ((after ? after.i : n) - (before ? before.i : 0)) - ((after ? after.s : S.length) - (before ? before.s : 0)) >= Math.ceil(L * 0.6); },
    lineOf: (k, L) => { const { before, after } = around(k, L); return lineAt[Math.min(after ? after.s : before ? before.s : 0, S.length - 1)] + 1; },
  });
}

// 兩個錨點之間（含片頭、片尾）逐字稿的字數 vs 講稿的字數：字數接近＝同一段話被 whisper 聽錯；講稿字數遠少＝真的多講了（real）。
// real 的列再用對齊找出多講的是哪幾個字（兩邊的字對得上的不算），時間碼才不會連講稿的話一起剪
function outsideRows(A, live, ng) {
  const { T, S, lineAt } = A, n = 4;   // 錨點是四字組
  if (!live.length) return [];
  const inNg = (t) => ng.some((g) => t >= g.start - 1e-6 && t < g.end - 1e-6);
  const spans = [{ i0: 0, i1: live[0].i, s0: 0, s1: live[0].s, gap: T.length ? T[live[0].i].t - T[0].t : 0 }];
  for (let k = 1; k < live.length; k++) {
    const a = live[k - 1], b = live[k];
    if (b.i - a.i > n) spans.push({ i0: a.i + n, i1: b.i, s0: a.s + n, s1: b.s, gap: b.t - a.t });
  }
  const last = live[live.length - 1];
  spans.push({ i0: last.i + n, i1: T.length, s0: last.s + n, s1: S.length, gap: T.length ? T[T.length - 1].t - last.t : 0 });
  const rows = [];
  for (const sp of spans) {
    const chars = T.slice(sp.i0, sp.i1).filter((x) => !inNg(x.t));
    const tChars = chars.length, sChars = Math.max(0, sp.s1 - sp.s0);
    if (!tChars) continue;
    const extra = tChars - sChars;
    const real = extra >= NGSCAN.offExtra && (sChars <= tChars * NGSCAN.offRatio || extra >= NGSCAN.offLong);
    if (!real && !(sp.gap >= NGSCAN.outsideGap && tChars >= 6)) continue;
    let piece = chars;
    if (real && sChars) {
      const { map, same } = alignSeq([...S.slice(sp.s0, sp.s1)], chars.map((x) => x.c));
      const hit = new Uint8Array(chars.length);
      map.forEach((j, i) => { if (j >= 0 && same[i]) hit[j] = 1; });
      // 最長一段對不上的字（中間夾 1 個碰巧相同的字也算同一段）
      let best = null, st = -1, end = -1;
      for (let k = 0; k <= chars.length; k++) {
        if (k < chars.length && (!hit[k] || (st >= 0 && k + 1 < chars.length && !hit[k + 1]))) { if (st < 0) st = k; if (!hit[k]) end = k; continue; }
        if (st >= 0 && (!best || end - st > best[1] - best[0])) best = [st, end];
        st = -1; end = -1;
      }
      if (best) piece = chars.slice(best[0], best[1] + 1);
    }
    const after = T[T.indexOf(piece[piece.length - 1]) + 1];
    const lastT = piece[piece.length - 1].t;
    rows.push({ start: r3(piece[0].t), end: r3(after ? Math.min(after.t, lastT + 1) : lastT + NGSCAN.charSec), text: piece.map((x) => x.o).join(''), tChars, sChars, real, line: lineAt[Math.min(Math.max(sp.s0, 0), S.length - 1)] + 1 });
  }
  return rows;
}

// 章節空檔表：每一章第一句的開口。第一句對不到錨點時，用後面第一個對到的行往回估（字數 × charSec），ng-snap 會再找實際開口
export function chapterRows(sc, lineTime) {
  // 影片第一句就是章節開頭：不放章節轉場，也不留空檔（片頭不要靜音）
  return sc.chapters.filter((c) => c.line > 0).map((c) => {
    let i = c.line;
    while (i < sc.lines.length && !lineTime.has(i)) i++;
    const first = sc.lines[c.line].slice(0, 16);
    if (i >= sc.lines.length) return { title: c.title, first, t: null };
    if (i === c.line) return { title: c.title, first, t: lineTime.get(i) };
    const before = sc.lines.slice(c.line, i).reduce((n, l) => n + [...normText(l)].length, 0);
    return { title: c.title, first, t: r3(Math.max(0, lineTime.get(i) - before * NGSCAN.charSec)), est: true };
  });
}

// NG 跨過換檔點（前一支結尾＋下一支開頭）：換檔處的詞級時間常被拉長，下一支開頭的試講也常被併掉 → 標出換檔點，交使用者聽
function markCross(ng, bounds) {
  for (const g of ng) { const b = bounds.find((x) => x > g.start + 0.1 && x < g.end); if (b != null) g.cross = b; }
  return ng;
}

export function ngScan(P, { log = console.log, words = null } = {}) {
  const work = path.join(P.project, 'work');
  if (!words) {
    try { words = JSON.parse(fs.readFileSync(path.join(work, 'transcript.json'), 'utf8')); } catch { throw new Error(`找不到 work/transcript.json → 先轉 main.mp4 的逐字稿（剪乾淨步驟 2）`); }
    if (!Array.isArray(words)) words = words.words || [];
  }
  const clips = mainClips(P, path.join(work, 'main.mp4'));
  const total = clips.length ? clips[clips.length - 1].end : null, last = words.length ? words[words.length - 1].end : 0;
  if (total && last < total * 0.8) log(`⚠ work/transcript.json 只到 ${fmtC(last)}，main.mp4 長 ${fmtC(total)}：可能是 rough.mp4 的逐字稿（剪乾淨步驟 7 會覆蓋）→ 重轉 main.mp4 的逐字稿再跑`);
  const scriptFile = path.join(P.project, '講稿.md');
  const sc = fs.existsSync(scriptFile) ? scriptChapters(readScript(scriptFile)) : null;
  const r = ngScanRows(words, { lines: sc?.lines || null, bounds: clips.slice(1).map((c) => c.start) });
  if (sc) {
    const md = ['# ng-scan（media.mjs ng-scan 產生）：講稿每一行在 main.mp4 第一次（NG 以外）開口的秒數', '', '| 行 | 時間 | 講稿 |', '|---|---|---|',
      ...sc.lines.map((l, i) => `| ${i + 1} | ${r.lineTime.has(i) ? fmtC(r.lineTime.get(i)) : '—'} | ${l} |`)];
    if (r.outside.length) md.push('', '## 講稿外判定（兩個錨點之間的字數）', '', '字數接近＝whisper 聽錯，不用管；講稿字數遠少＝真的多講，media.mjs prep 列進 cuts.md（不勾、待確認）。', '', '| 時間 | 逐字稿 | 字數（逐字稿／講稿） | 判定 |', '|---|---|---|---|',
      ...r.outside.map((u) => `| ${fmtC(u.start)}–${fmtC(u.end)} | ${u.text.replace(/\|/g, '\\|')} | ${u.tChars}／${u.sChars} | ${u.real ? '講稿外' : 'whisper 聽錯'} |`));
    fs.writeFileSync(path.join(work, 'ng-scan.md'), md.join('\n') + '\n');
  }
  log(`逐字稿 ${words.length} 個詞${sc ? `；講稿 ${sc.lines.length} 行，對到 ${r.anchors} 個錨點（講稿裡只出現一次的四字組）；每一行的開口時間寫在 work/ng-scan.md` : '；沒有講稿：只比相鄰句'}`);
  log('');
  log(`NG 候選 ${r.ng.length} 列（${sc ? '講到講稿後面又跳回前面＝重講，留最後一次' : '相鄰句很像，留後面那句'}；照抄進 cuts.md 的 NG 表，「剪」欄一律 [x]，拿不準的在「待確認」寫原因）：`);
  log('| 剪 | 時間碼 | 內容 | 原因 | 待確認 |');
  log('|---|---|---|---|---|');
  for (const g of r.ng) log(`| [x] | ${fmtC(g.start)}–${fmtC(g.end)} | ${g.text} | ${g.line ? `講稿第 ${g.line} 行在 ${fmtC(g.again)} 又講一次，留後面那次` : `${fmtC(g.again)} 又講一次，留後面那次`} | ${g.cross != null ? `跨過換檔點 ${fmtC(g.cross)}：換檔處逐字稿時間常不準、下一支開頭可能還有試講 → 請聽 ${fmtC(g.cross)} 之後確認從哪裡重講（終點改到那裡）` : '—'} |`);
  if (r.outside.length) {
    log('');
    log(`講稿外 ${r.outside.length} 處（講稿找不到的話：口誤、自言自語、臨場加的話，或 whisper 聽錯；聽了再決定，不確定就不剪）：`);
    for (const u of r.outside.slice(0, 20)) log(`  ${fmtC(u.start)}–${fmtC(u.end)}  ${u.text.slice(0, 40)}（逐字稿 ${u.tChars} 字／講稿 ${u.sChars} 字：${u.real ? '講稿外' : '字數接近，多半是 whisper 聽錯'}）`);
    if (r.outside.length > 20) log(`  …還有 ${r.outside.length - 20} 處`);
  }
  if (r.fillers?.length) {
    log('');
    log(`贅字 ${r.fillers.length} 處（嗯、呃、就是說這類語助詞與口頭禪；media.mjs prep 列進 cuts.md、預設不勾，試聽後要剪再勾）：${r.fillers.slice(0, 8).map((f) => `${fmtC(f.start)}「${f.filler}」`).join('、')}${r.fillers.length > 8 ? '…' : ''}`);
  }
  if (sc?.chapters.length) {
    log('');
    log('章節空檔表（照抄進 cuts.md；時間碼是這一章第一句的開口秒數，ng-snap 會再往後找實際開口點）：');
    log('| 章節 | 第一句 | 時間碼 |');
    log('|---|---|---|');
    for (const c of chapterRows(sc, r.lineTime)) log(`| ${c.title} | ${c.first} | ${c.t != null ? fmtC(c.t) : '（找不到 → 聽 main.mp4 補）'} |`);
  }
  log('');
  for (const l of next('照抄進 work/cuts.md（NG 表、章節空檔表、需要你決定），再跑 ng-snap', cmdLine('media.mjs', ['ng-snap', '--project', posixRel(P.project)]))) log(l);
  return { ...r, script: sc, clips, words };
}

export function ngSnap(P, { edit = CUT.edit, margin = CUT.margin, src = null, v1 = null, log = console.log } = {}) {
  const mSec = parseMargin(margin);
  const work = path.join(P.project, 'work');
  const cutsFile = path.join(work, 'cuts.md');
  if (!fs.existsSync(cutsFile)) throw new Error(`找不到 ${posixRel(cutsFile)} → 先跑 node shared/template/tools/media.mjs prep --project <專案> 列剪輯清單（停點 ① 的格式）`);
  const cm = parseCutsMd(fs.readFileSync(cutsFile, 'utf8'));
  if (cm.errors.length) throw new Error(cm.errors[0]);
  if (!cm.hasNg && !cm.hasChapters) throw new Error('work/cuts.md 裡找不到 NG 表（表頭要有「時間碼」和「原因」）也找不到章節空檔表（表頭要有「章節」和「第一句」）→ 跑 media.mjs prep --again 重寫，或照 auto-edit-rough 的 references/ng-rules.md 補表再跑一次');
  const source = mainSource(P, src, { log });
  const info = probeMedia(source);
  const fps = info.fps || 30;
  let v1File = v1 ? path.resolve(v1) : null, cached = false;
  if (!v1File) ({ file: v1File, cached } = aeSilence(P, source, { edit, margin, log }));
  const sil = silencesOf(readV1(v1File), fps);
  const warnings = [], notes = [];
  const chs = chapterKeep(cm.chapters, sil, mSec);
  const snapped = snapNg(cm.ng, sil, CUT.ngWin, chs.filter((c) => !c.none).map((c) => [...c.sil, c.keep[0]]));
  let cutOut = mergeRanges(snapped.filter((r) => !r.skip).map((r) => [r.a, r.b]));
  for (const c of chs) {
    if (c.none || !c.keep) continue;
    for (const [a, b] of cutOut) {
      if (b <= c.keep[0] + 1e-6 || a >= c.keep[1] - 1e-6) continue;
      const ng = snapped.find((r) => !r.skip && r.a <= a + 1e-6 && r.b >= b - 1e-6) || snapped.find((r) => !r.skip && r.b >= c.keep[0]);
      if (a <= c.keep[0] + 1e-6 && b < c.keep[1] - CUT.minKeep) {
        c.keep = [r3(b), c.keep[1]];
        c.conflict = `⚠ NG 第 ${ng?.row ?? '?'} 列和章節 ${c.row} 的保留區重疊，保留區改從 ${fmtC(b)} 開始（剩 ${(c.keep[1] - c.keep[0]).toFixed(2)}s）→ 夠用就照下面的指令剪；想留滿 ${CUT.chKeep.toFixed(1)}s 就把 NG 第 ${ng?.row ?? '?'} 列的結尾往前移`;
      } else {
        c.dropped = true;
        c.conflict = `⚠ NG 第 ${ng?.row ?? '?'} 列吃掉章節 ${c.row} 的停頓，這章不保留 → 想留停頓就把 NG 第 ${ng?.row ?? '?'} 列的結尾往前移`;
      }
    }
  }
  // 邊錄邊講的螢幕錄影：整段保留（停頓時畫面常在操作），只剪 NG
  const clips = mainClips(P, source);
  const scrClips = clips.filter((c) => c.kind === 'screen');
  const scrKeep = scrClips.flatMap((c) => subtractRanges([c.start, c.end], cutOut));
  const addIn = mergeRanges([...chs.filter((c) => c.keep && !c.dropped).map((c) => c.keep), ...scrKeep]);
  const srcRel = posixRel(source), roughRel = posixRel(path.join(work, 'rough.mp4')), v1Rel = posixRel(path.join(work, 'cuts.v1.json'));

  log(`原片：${srcRel}（${fps}fps，${fmtC(info.duration ?? 0)}）；靜音判斷：${v1 ? `--v1 ${posixRel(v1File)}` : `auto-editor --edit "${edit}" --margin ${margin}（快取 work/.cache/ng-snap.v1.json）`}`);
  if (cm.hasNg) {
    const pend = snapped.filter((r) => r.skip).length;
    log(''); log(`NG：cuts.md ${snapped.length} 列 → 剪 ${cutOut.length} 段${pend ? `（${pend} 列${cm.hasCutCol ? '沒勾' : '待確認'}不剪）` : ''}`);
    log('  列  原始時間碼            對齊停頓後            內容');
    for (const r of snapped) {
      const orig = `${fmtC(r.start)}–${fmtC(r.end)}`;
      const after = r.skip ? '—' : `${fmtC(r.a)}–${fmtC(r.b)}`;
      const missWhat = r.missStart && r.missEnd ? '前後 1.0s 內沒有停頓，用原值' : r.missStart ? '起點前後 1.0s 內沒有停頓，起點用原值' : r.missEnd ? '終點前後 1.0s 內沒有停頓，終點用原值' : '';
      // 終點往後延到停頓末端：講清楚後一次（重講）從那裡才開口、不會被剪到（Sonnet 實測會把這種列誤標待確認）
      const later = !r.skip && !missWhat && !r.toChapter && r.b > r.end + 0.3 ? `；終點落在後一次開口（${fmtC(r.b)}）之前的停頓末端，後一次完整保留` : '';
      const note = r.skip ? (r.cutCol ? '沒勾，不剪' : '待確認，不剪') : missWhat ? `⚠ ${missWhat}` : r.toChapter ? '終點停在章節停頓前' : String(r.text).slice(0, 14) + later;
      log(`  ${String(r.row).padEnd(3)} ${orig.padEnd(20)} ${after.padEnd(21)} ${note}`);
      if (r.skip && !r.cutCol) warnings.push(`⚠ cuts.md NG 第 ${r.row} 列標了待確認（「${r.raw}」），不放進指令 → 使用者確認後把「待確認」欄清空再跑一次`);
      else if (missWhat) warnings.push(`⚠ NG 第 ${r.row} 列（${orig}）${missWhat} → 播 ${srcRel} 的 ${fmtT(Math.max(0, r.start - 1))}–${fmtT(r.end + 1)} 聽一下，切到字就把 cuts.md 的時間碼往停頓移`);
    }
  }
  if (cm.hasChapters) {
    log(''); log(`章節空檔：cuts.md ${chs.length} 章`);
    log('  章  第一句（表上 → 開口）   原始停頓   保留（原片）              剪完空檔');
    for (const c of chs) {
      if (c.none) {
        log(`  ${String(c.row).padEnd(3)} ${fmtC(c.t)} → —              —          —                        —`);
        warnings.push(`⚠ 章節 ${c.row}「${c.title}」第一句 ${fmtC(c.t)} 不在停頓裡、之後 ${CUT.ahead.toFixed(0)} 秒內也找不到停頓，不保留 → 播 ${srcRel} 的 ${fmtT(Math.max(0, c.t - 1))}–${fmtT(c.t + CUT.ahead)} 找那一句真正開口的時間，改 cuts.md 章節空檔表的時間碼再跑一次`);
        continue;
      }
      if (c.early) notes.push(`章節 ${c.row} 時間碼比開口早 ${c.early.toFixed(2)}s，已改用開口 ${fmtC(c.onset)}`);
      const keep = c.dropped ? '—' : `${fmtC(c.keep[0])}–${fmtC(c.keep[1])}${c.short ? '（整段）' : ''}`;
      log(`  ${String(c.row).padEnd(3)} ${`${fmtC(c.t)} → ${fmtC(c.onset)}`.padEnd(22)} ${`${c.pause.toFixed(2)}s`.padEnd(9)} ${keep.padEnd(24)} ${c.dropped ? '—' : `${c.gapAfter.toFixed(2)}s${c.short ? ' ⚠' : ''}`}`);
      if (c.short) warnings.push(`⚠ 章節 ${c.row}「${c.title}」原始停頓只有 ${c.pause.toFixed(2)}s（< ${CUT.chKeep.toFixed(1)}s），剪完只剩 ${c.pause.toFixed(2)}s，章節會壓到人聲 → 可以接受就照下面的指令剪（build 會從那一句起點蓋章節並提醒）；不行就請作者補錄停頓`);
      if (c.conflict) warnings.push(c.conflict);
    }
  }
  if (scrClips.length) {
    log(''); log(`邊錄邊講的螢幕錄影 ${scrClips.length} 支：只剪 NG、停頓保留（--add-in ${scrKeep.length} 段）`);
    for (const c of scrClips) log(`  ${fmtC(c.start)}–${fmtC(c.end)}  ${c.file}`);
  }
  // 主軌順序對講稿（還沒初剪、有講稿、transcript.json 是 main.mp4 轉的才比）
  const scriptFile = path.join(P.project, '講稿.md'), tjFile = path.join(work, 'transcript.json');
  if (clips.length > 1 && fs.existsSync(scriptFile) && fs.existsSync(tjFile) && !fs.existsSync(path.join(work, 'rough.mp4'))
    && fs.statSync(tjFile).mtimeMs >= fs.statSync(source).mtimeMs - 1000) {
    let words = null;
    try { words = JSON.parse(fs.readFileSync(tjFile, 'utf8')); } catch { words = null; }
    if (Array.isArray(words)) {
      const rows = scriptOrder(clips, words, scriptLines(readScript(scriptFile)));
      const sug = suggestOrder(rows);
      log(''); log('主軌順序對講稿：');
      log('  順序  講稿行      檔');
      for (const r of rows) log(`  ${String(r.k + 1).padEnd(5)} ${(r.lines.length ? `${r.lines[0]}–${r.lines[r.lines.length - 1]}` : '對不到').padEnd(10)} ${r.file}`);
      for (const r of rows.filter((x) => x.pos == null)) warnings.push(`⚠ ${r.file} 對不到講稿的任何一行（講稿沒寫到的內容，或不是這集的錄音）→ 停點 ① 問使用者要不要接進主軌、放在哪裡`);
      if (sug.some((r, i) => r.k !== i)) {
        warnings.push(`⚠ 主軌順序和講稿不同：照講稿應該是 ${sug.map((r) => r.name || path.basename(r.file)).join(' → ')} → 停點 ① 跟使用者確認；要照講稿就跑 ${orderCommand(P, sug)}（重接、重轉、重寫 cuts.md）`);
      }
    }
  }
  if (notes.length || warnings.length) { log(''); for (const w of [...notes, ...warnings]) log(w); }
  const base = { src: srcRel, edit, margin, cutOut, addIn };
  const commands = [
    aeCommand({ ...base, tail: ['--preview'] }),
    // --progress none：進度條每格一行，長片會灌爆 AI 的工具輸出（bench 實測 39KB 被截斷）
    aeCommand({ ...base, tail: ['-o', `"${roughRel}"`, '--no-open', '--progress', 'none'] }),
    aeCommand({ ...base, tail: ['--export', 'v1', '-o', `"${v1Rel}"`, '--progress', 'none'] }),
  ];
  for (const l of ['', '1. 先看會剪掉多少：', commands[0], '2. 沒問題就輸出初剪：', commands[1], '3. 再存剪接點（只寫 JSON，不轉檔）：', commands[2],
    `→ 然後跑 node shared/template/tools/media.mjs verify-rough --project ${posixRel(P.project)}（檢查初剪有沒有黑畫面），再跑 node shared/template/tools/media.mjs cutpoints --project ${posixRel(P.project)}`]) log(l);
  return { cutOut, addIn, rows: snapped, chapters: chs, commands, warnings, notes, fps, v1: v1File, src: source };
}
