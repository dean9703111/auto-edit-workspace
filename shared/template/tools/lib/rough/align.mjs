// 字幕對講稿（srt-align）與每則字數上限（captionMax）
// 032 C9：從 media.mjs 搬過來（只搬移，輸出不變）；media.mjs 照舊匯出原本那些名稱
import path from 'node:path';
import fs from 'node:fs';
import { normText, textWidth as tw, clock2 } from '../time.mjs';
import { visibleLen } from '../scenes.mjs';
import { mapRefStr, remapScripts } from '../beat-remap.mjs';
import { transcriptFresh, noteTranscript } from '../ff.mjs';
import { parseSrt, formatSrt } from '../srt.mjs';
import { readScript } from '../script-file.mjs';
import { envelope, speechFromEnvelope, pickThreshold } from '../speech.mjs';
import { writeAtomic } from '../atomic.mjs';
import { markStep } from '../progress.mjs';
import { loadLib } from '../project.mjs';
import { resolveFormat, canvasOf, CANVAS } from '../canvas.mjs';
import { refTime, fmtRef, parseRef, mapPlanTimes } from '../../editor/subtitles.mjs';
import { r3, posixRel, backupPath, posix } from './util.mjs';
import { SNAP } from './snap.mjs';

// ---------- 剪乾淨第 6 步：字幕對講稿（srt-align，F8）----------
// 單位是完整語句：有講稿＝講稿每一行；沒講稿＝rough.srt 每則依「，。！？；」切成子句。時間用 work/transcript.json（詞級）做全域序列對齊。
// max＝每則字數上限的預設（橫式的 caption.maxChars；直式由 captionMax 照版式換）
export const ALIGN = { max: CANVAS.landscape.caption.maxChars, breath: 0.12, short: 4, closeGap: 1.0, minQ: 0.34, minDur: 0.6, maxCells: 4e8, pause: 1.5, edge: 0.5, blip: 0.25 };   // pause：聲音停這麼久以上，字幕不蓋（keepPauses）；edge：字幕起點到停頓（停頓到終點）之間說話不到這麼久＝攤進停頓的尾巴；blip：短於這個的聲響不打斷停頓
const CJK_PUNCT_DROP = /[，。；：]/;
const isCjk = (c) => !!c && c.codePointAt(0) >= 0x2e80;

// 講稿.md → 講解行：去掉 # 標題、> 引言、``` 區塊、<!-- --> 註解、含 ` 的說明行、整行括號的舞台指示、分隔線、空行
export function scriptLines(md) {
  const out = [];
  let fence = false, comment = false;
  for (const raw of String(md ?? '').replace(/^﻿/, '').split(/\r?\n/)) {
    const l = raw.trim();
    if (/^(```|~~~)/.test(l)) { fence = !fence; continue; }
    if (fence) continue;
    if (comment) { if (l.includes('-->')) comment = false; continue; }
    if (l.startsWith('<!--')) { if (!l.includes('-->')) comment = true; continue; }
    if (!l || l.startsWith('#') || l.startsWith('>') || l.includes('`') || /^[-*_]{3,}$/.test(l) || /^[（(].*[）)]$/.test(l)) continue;
    out.push(l);
  }
  return out;
}

// 顯示文字：去「，。；：」（半形 , ; : 不在數字中間時也去），保留「、！？」；拿掉標點後中英文之間補半形空格
export function displayText(s) {
  const ch = [...String(s ?? '').trim()];
  let out = '';
  for (let i = 0; i < ch.length; i++) {
    const c = ch[i];
    const drop = CJK_PUNCT_DROP.test(c) || (/[,;:]/.test(c) && !(/\d/.test(ch[i - 1] || '') && /\d/.test(ch[i + 1] || '')));
    if (!drop) { out += c; continue; }
    const prev = out.slice(-1), next = ch[i + 1] || '';
    if (prev && next && !/\s/.test(prev) && !/\s/.test(next) && (/[A-Za-z0-9]/.test(prev) || /[A-Za-z0-9]/.test(next))) out += ' ';
  }
  return out.replace(/\s+/g, ' ').replace(/\s+([、！？])/g, '$1').replace(/、+$/, '').trim();
}

// 一段文字的正規化字元（比對用）與它在原文的位置
function normChars(s) {
  const out = [];
  let pos = 0;
  for (const c of String(s)) {
    for (const n of normText(c)) out.push({ c: n, i: pos });
    pos += c.length;
  }
  return out;
}
// 逐字稿的字元：每個詞的時間平均分給它的字
function wordCharTimes(words) {
  const out = [];
  for (const w of words) {
    const cs = [...normText(w.text)];
    const d = (w.end - w.start) / (cs.length || 1);
    cs.forEach((c, k) => out.push({ c, a: w.start + k * d, b: w.start + (k + 1) * d }));
  }
  return out;
}
// 全域序列對齊（Needleman–Wunsch，字元層級；相同 0、替換 1、插入／刪除 1）→ A 每個字對到 B 的哪個字（-1＝沒對到）與是否相同
export function alignSeq(A, B) {
  const n = A.length, m = B.length;
  if ((n + 1) * (m + 1) > ALIGN.maxCells) throw new Error(`講稿 ${n} 字 × 逐字稿 ${m} 字太大，對齊會用掉太多記憶體 → 把講稿與影片分段處理`);
  const W = m + 1;
  const back = new Uint8Array((n + 1) * W);   // 0 對角、1 上（A 多出來）、2 左（B 多出來）
  let prev = new Int32Array(W), cur = new Int32Array(W);
  for (let j = 0; j <= m; j++) { prev[j] = j; back[j] = 2; }
  for (let i = 1; i <= n; i++) {
    cur[0] = i; back[i * W] = 1;
    const a = A[i - 1];
    for (let j = 1; j <= m; j++) {
      const d = prev[j - 1] + (a === B[j - 1] ? 0 : 1), u = prev[j] + 1, l = cur[j - 1] + 1;
      if (d <= u && d <= l) { cur[j] = d; back[i * W + j] = 0; } else if (u <= l) { cur[j] = u; back[i * W + j] = 1; } else { cur[j] = l; back[i * W + j] = 2; }
    }
    [prev, cur] = [cur, prev];
  }
  const map = new Int32Array(n).fill(-1), same = new Uint8Array(n);
  let i = n, j = m;
  while (i > 0 || j > 0) {
    const b = i > 0 && j > 0 ? back[i * W + j] : i > 0 ? 1 : 2;
    if (b === 0) { map[i - 1] = j - 1; same[i - 1] = A[i - 1] === B[j - 1] ? 1 : 0; i--; j--; } else if (b === 1) i--; else j--;
  }
  return { map, same, dist: prev[m] };
}

// 每一行的起迄：行裡對到的字的第一個起點、最後一個終點；相同字比例 < minQ 或沒有字對到＝對不上（之後內插）
export function alignLines(lines, words) {
  const L = lines.map((t) => normChars(t));
  const A = L.flatMap((cs) => cs.map((x) => x.c));
  const Bt = wordCharTimes(words);
  const { map, same } = alignSeq(A, Bt.map((x) => x.c));
  let k = 0;
  return lines.map((text, li) => {
    const cs = L[li].map((x) => { const j = map[k], s = same[k]; k++; return { i: x.i, t: j >= 0 ? Bt[j] : null, same: !!s }; });
    const hit = cs.filter((x) => x.t);
    const q = cs.length ? cs.filter((x) => x.same).length / cs.length : 0;
    const ok = hit.length > 0 && q >= ALIGN.minQ;
    return { text, chars: cs, q: r3(q), ok, start: ok ? r3(hit[0].t.a) : null, end: ok ? r3(hit[hit.length - 1].t.b) : null };
  });
}

// 換句的連接詞：下一行用這些開頭就是新的一句，不和上一行併
export const CONNECTIVE = /^(而|但|所以|因為|另外|如果|或者|然後|接著|最後|為了|現在|不過|可是|因此|於是|首先|其次|再來|那麼|當|雖然|只是|其實)/;
const SENT_END = /[。！？!?]$/;
const joinDisp = (a, b) => a + (/[A-Za-z0-9]$/.test(a) && /^[A-Za-z0-9]/.test(b) || (isCjk(a.slice(-1)) && /^[A-Za-z0-9]/.test(b)) || (/[A-Za-z0-9]$/.test(a) && isCjk(b[0])) ? ' ' : '') + b;

// 一行（或子句）原文第 r0–r1 個字（原文位置）的起迄：用對到的字；都沒對到就照字寬在整行時間內比例分
function spanTime(row, r0, r1) {
  const hit = row.chars.filter((x) => x.i >= r0 && x.i < r1 && x.t);
  if (hit.length) return [hit[0].t.a, hit[hit.length - 1].t.b];
  const total = tw(row.text) || 1, a = tw(row.text.slice(0, r0)) / total, b = tw(row.text.slice(0, r1)) / total;
  return [row.start + (row.end - row.start) * a, row.start + (row.end - row.start) * b];
}
// 沒有標點時可以斷的地方：詞的邊界（內建的中文斷詞，不切「動作」「剛剛」這種詞），不切英數字與 auto-edit 這種連字號，不切在開引號後面、收引號前面
const WORD_SEG = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('zh-Hant', { granularity: 'word' }) : null;
export function breakPoints(t) {
  const words = WORD_SEG ? [...WORD_SEG.segment(t)].map((x) => x.index) : [...t].map((_, i) => i);
  const ok = [];
  let depth = 0, at = 0;
  for (const pos of words) {
    for (; at < pos; at++) { if (/[「『（(]/.test(t[at])) depth++; else if (/[」』）)]/.test(t[at])) depth = Math.max(0, depth - 1); }
    if (pos <= 0 || pos >= t.length) continue;
    if (/[「『（(]/.test(t[pos - 1]) || /[」』）)、，。！？；：,;!?]/.test(t[pos])) continue;
    if (/[A-Za-z0-9.\-_/@+#]/.test(t[pos - 1]) && /[A-Za-z0-9.\-_/@+#]/.test(t[pos])) continue;
    ok.push({ pos, quoted: depth > 0, bad: breakBad(t, pos) });
  }
  return ok;
}

// 這個斷點唸起來順不順：2＝不要斷（「把每／一段」「9／支」「剪輯／的成本」「GitHub／上的」），1＝盡量不要（「剪輯的／成本」），
// −1＝天然的斷點（「剪掉了／六段」「我根據…」前面）。whisper 沒有明顯停頓時就靠這個
const ATTACH_RIGHT = /^(?:[的了著過們嗎呢吧啊喔嚕地得]|[上裡中下]的)/;
const ATTACH_LEFT = /(?:[把將被給跟和與及對向從在讓每這那該此各某其幾兩一二三四五六七八九十]|\d)$/;
const CLAUSE_START = /^(?:我|你|他|它|我們|把|讓|而|但|所以|因為|如果|然後|接著|就|才|再|也|還|都|可以|只要|不過|而且|另外)/;
export function breakBad(t, pos) {
  const l = t.slice(0, pos).trimEnd(), r = t.slice(pos).trimStart();
  if (ATTACH_RIGHT.test(r) || ATTACH_LEFT.test(l)) return 2;
  if (/的$/.test(l) || /[A-Za-z0-9]$/.test(l)) return 1;   // 「AI／工具」：英文和後面的中文通常是一個詞
  return CLAUSE_START.test(r) || /了$/.test(l) ? -1 : 0;
}

// 超過 max 字的行拆開：先斷在「、，。！？；：」（兩邊都放得下、最平均），都沒有才斷在中段停頓最長的詞邊界（forced）
export function splitRow(row, max) {
  const disp = displayText(row.text);
  if (visibleLen(disp) <= max) return [{ ...row, disp, r0: 0, r1: row.text.length }];
  const t = row.text;
  const cand = [];
  for (let k = 1; k < t.length; k++) if (/[、，。！？；：,;!?]/.test(t[k - 1])) cand.push(k);
  const fits = (k) => visibleLen(displayText(t.slice(0, k))) <= max && visibleLen(displayText(t.slice(k))) <= max;
  const bal = (k) => Math.abs(tw(t.slice(0, k)) - tw(t.slice(k)));
  let k = cand.filter(fits).sort((x, y) => bal(x) - bal(y))[0];
  if (k == null) {
    // 標點兩邊放不下：一邊夠長才用（「未來，我會分享更多…」斷在「未來」會多出一則兩個字的字幕，改找詞邊界）
    const c = [...cand].sort((x, y) => bal(x) - bal(y))[0];
    if (c != null && Math.min(visibleLen(displayText(t.slice(0, c))), visibleLen(displayText(t.slice(c)))) > 4) k = c;
  }
  let forced = false;
  if (k == null) {
    // 沒有標點：找詞邊界。先找引號外、中段（30–70%）的，再放寬範圍，最後才切引號裡面。
    // 排序：唸起來不順的（bad＝2）最後；明顯的停頓（≥ 0.15 秒）優先，越長越好；再比順不順、左右平均
    forced = true;
    let best = null;
    const byPos = new Map((row.chars || []).map((c, q) => [c.i, q]));
    const gapAt = (pos) => { const q = byPos.get(pos), c = q != null ? row.chars[q] : null, b = q ? row.chars[q - 1] : null; return c?.t && b?.t ? c.t.a - b.t.b : 0; };
    const points = breakPoints(t);
    const rank = (x) => [x.bad >= 2 ? 1 : 0, x.g >= 0.15 ? -x.g : 0, x.bad, bal(x.pos)];
    const better = (x, y) => { const a = rank(x), b = rank(y); for (let i = 0; i < a.length; i++) { if (Math.abs(a[i] - b[i]) > 1e-9) return a[i] < b[i]; } return false; };
    for (const [lo, hi, quoted] of [[0.3, 0.7, false], [0.15, 0.85, false], [0.3, 0.7, true], [0.1, 0.9, true]]) {
      for (const { pos, quoted: q, bad } of points) {
        if (pos < t.length * lo || pos > t.length * hi || (q && !quoted)) continue;
        const x = { pos, bad, g: gapAt(pos) };
        if (!best || better(x, best)) best = x;
      }
      if (best && best.bad < 2) break;   // 這個範圍只有不順的斷點：再放寬找一次
    }
    k = best ? best.pos : Math.round(t.length / 2);
  }
  const mk = (a, b) => { const sub = { ...row, text: t.slice(a, b) }; return sub; };
  const [la, lb] = spanTime(row, 0, k), [ra, rb] = spanTime(row, k, t.length);
  const left = { ...mk(0, k), start: r3(la), end: r3(lb), chars: row.chars.filter((x) => x.i < k), forced };
  const right = { ...mk(k, t.length), start: r3(ra), end: r3(rb), chars: row.chars.filter((x) => x.i >= k).map((x) => ({ ...x, i: x.i - k })), forced };
  return [...splitRow(left, max), ...splitRow(right, max)].map((p) => ({ ...p, split: true, forced: p.forced || forced }));
}

// 對不上的行：在前後對得上的行之間照字寬內插
function interpolate(rows) {
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].ok) continue;
    let j = i;
    while (j < rows.length && !rows[j].ok) j++;
    const lo = i > 0 ? rows[i - 1].end : 0;
    const run = rows.slice(i, j), total = run.reduce((s, r) => s + Math.max(tw(r.text), 1), 0);
    const hi = j < rows.length ? rows[j].start : lo + total * 0.25;
    let t = lo;
    for (const r of run) { const d = (hi - lo) * Math.max(tw(r.text), 1) / total; r.start = r3(t); r.end = r3(t + d); t += d; r.interp = true; }
    i = j - 1;
  }
  return rows;
}

// 字幕不蓋長停頓（純函式）：speech＝說話區間 [[起, 迄], …]，兩段之間空 ≥ ALIGN.pause 的是停頓。
// 起點落在停頓裡，或起點到停頓之間說話不到 ALIGN.edge 秒（上一句的尾巴、換氣）→ 挪到停頓終點（開口，往前留 SNAP.lead）；
// 終點落在停頓裡，或停頓到終點之間說話不到 ALIGN.edge 秒 → 收到停頓起點＋SNAP.tailPad。每則至少 ALIGN.minDur、不和下一則重疊。
export function keepPauses(cues, speech, { pause = ALIGN.pause, edge = ALIGN.edge } = {}) {
  const gaps = [];
  for (let i = 1; i < speech.length; i++) if (speech[i][0] - speech[i - 1][1] >= pause - 1e-9) gaps.push([speech[i - 1][1], speech[i][0]]);
  const talk = (x, y) => speech.reduce((t, [a, b]) => t + Math.max(0, Math.min(b, y) - Math.max(a, x)), 0);
  const out = cues.map((c) => ({ ...c }));
  let moved = 0;
  for (let i = 0; i < out.length; i++) {
    const c = out[i], next = out[i + 1];
    const gs = gaps.find(([a, b]) => c.start < b - 1e-6 && b < c.end && talk(c.start, a) < edge);
    const ge = gaps.find(([a, b]) => c.end > a + SNAP.tailPad + 1e-6 && a > c.start && talk(b, c.end) < edge);
    let s = c.start, e = c.end;
    if (gs) s = Math.max(gs[0], gs[1] - SNAP.lead);
    if (ge && ge[0] > s) e = ge[0] + SNAP.tailPad;
    if (e - s < ALIGN.minDur) e = s + ALIGN.minDur;
    if (next && e > next.start) e = Math.max(s + 0.01, next.start);
    if (Math.abs(s - c.start) > 1e-6 || Math.abs(e - c.end) > 1e-6) { c.start = r3(s); c.end = r3(e); moved++; }
  }
  return { cues: out, moved, pauses: gaps.length };
}

// 講稿行（或子句）＋逐字稿 → 字幕：對齊 → 內插 → 長行拆 → 同一口氣的短行併 → 相鄰空檔 < closeGap 補滿
// lines：[{ text, from?（講稿第幾行，1 起）, cue?（沒講稿時：原 rough.srt 第幾則）, start?, end?（沒有逐字稿時的比例時間）}]
export function alignCues(lines, words, { max = ALIGN.max } = {}) {
  let rows;
  if (words && words.length) {
    rows = alignLines(lines.map((l) => l.text), words).map((r, i) => {
      const l = lines[i];
      if (r.ok) return { ...l, ...r };
      // 沒講稿時子句本來就有 rough.srt 的比例時間：對不上就用它，不內插
      return l.start != null ? { ...l, chars: r.chars, q: r.q, ok: true, est: true } : { ...l, chars: r.chars, q: r.q, ok: false, start: null, end: null };
    });
  } else rows = lines.map((l) => ({ ...l, chars: [], q: 0, ok: l.start != null, est: l.start != null }));
  interpolate(rows);
  const parts = rows.flatMap((r) => splitRow(r, max).map((p) => ({ ...p, lines: [r.from ?? r.cue] })));
  const out = [];
  for (const p of parts) {
    const last = out[out.length - 1];
    let ok = false;
    if (last && !last.interp && !p.interp && !last.split && !p.split && !SENT_END.test(last.text) && !CONNECTIVE.test(p.text)) {
      const joined = joinDisp(last.disp, p.disp);
      const breath = p.start - last.end <= ALIGN.breath + 1e-9;
      const short = (visibleLen(last.dispLast ?? last.disp) <= ALIGN.short || visibleLen(p.disp) <= ALIGN.short) && p.start - last.end < ALIGN.closeGap;
      ok = visibleLen(joined) <= max && (breath || short);
      if (ok) { last.disp = joined; last.dispLast = p.disp; last.text = p.text; last.end = p.end; last.lines.push(...p.lines); last.merged = (last.merged || 1) + 1; }
    }
    if (!ok) out.push({ ...p, lines: [...p.lines] });
  }
  for (let i = 0; i < out.length - 1; i++) {
    const g = out[i + 1].start - out[i].end;
    if (g < ALIGN.closeGap) out[i].end = out[i + 1].start;
  }
  const cues = out.map((c, i) => ({ n: i + 1, start: r3(c.start), end: r3(Math.max(c.end, c.start)), text: c.disp }));
  const info = out.map((c, i) => ({ n: i + 1, lines: c.lines, merged: c.merged || 1, split: !!c.split, forced: !!c.forced, interp: !!c.interp, q: c.q }));
  return { cues, info, rows };
}

// 沒講稿：rough.srt 每則依「，。！？；」切成子句，時間先照字寬在那一則裡比例分
export function clausesFromSrt(cues) {
  const out = [];
  for (const c of cues) {
    const parts = String(c.text).split(/(?<=[，。！？；]|[,;!?](?!\d))/).map((s) => s.trim()).filter(Boolean);
    const total = parts.reduce((s, p) => s + Math.max(tw(p), 0.5), 0) || 1;
    let t = c.start;
    for (const p of parts) { const d = (c.end - c.start) * Math.max(tw(p), 0.5) / total; out.push({ text: p, cue: c.n, start: r3(t), end: r3(t + d) }); t += d; }
  }
  return out;
}

// plan.json（含 outro.from）與情境動畫 P.at('#N…') 的句號照時間換到新字幕（srt-align 會重新斷句，句數會變）：
//   #N@詞 → 新字幕裡有這個詞、離舊句最近的那一句（詞找不到就退成時間 ⚠）；#Ne → 結尾 ±0.15 秒有新句結尾就 #Me；
//   其他 → 同一個秒數：±0.3 秒內有新句開頭就綁那一句，否則落在的那一句＋差。
//   段落有 anchor、from 是句首（#N）時：from 改綁含 anchor 的新句開頭（±3 秒內），整段的其他時間跟著平移；別段寫同一個 "#N" 的（例前一段的 to）也一起換，0 秒相接不會斷。
export function refMapper(oldCues, newCues, { overrides = new Map(), segShift = new Map() } = {}) {
  const notes = [];
  const byN = new Map(oldCues.map((c) => [c.n, c]));
  const at = (T) => newCues.find((c) => T >= c.start - 1e-6 && T < c.end - 1e-6) ?? newCues.find((c) => c.start >= T) ?? newCues[newCues.length - 1];
  const asTime = (T) => {
    const s0 = newCues.map((c) => ({ c, d: Math.abs(c.start - T) })).sort((x, y) => x.d - y.d)[0];
    const c = s0 && s0.d <= 0.3 ? s0.c : at(T);
    const off = r3(T - c.start);
    return { n: c.n, end: false, off: Math.abs(off) <= 0.1 ? 0 : off };
  };
  const map = (r, id) => {
    const o = byN.get(r.n);
    if (!o) return null;
    if (r.kw == null && !r.end && !r.off && overrides.has(`#${r.n}`)) return overrides.get(`#${r.n}`);
    if (r.kw != null) {
      const k = normText(r.kw);
      const near = (c) => (c.end > o.start - 1e-6 && c.start < o.end + 1e-6 ? 0 : Math.min(Math.abs(c.start - o.start), Math.abs(c.end - o.end)));
      const hit = newCues.filter((c) => k && normText(c.text).includes(k)).sort((x, y) => near(x) - near(y))[0];
      if (hit && near(hit) < 15) return { ...r, n: hit.n };
      const T = refTime(fmtRef(r), oldCues) ?? o.start;
      notes.push(`${id}：${fmtRef(r)} 的「${r.kw}」在新字幕找不到 → 改成時間 ${fmtRef(asTime(T))}（到剪輯台或 plan.json 換成新字幕裡的詞）`);
      return asTime(T);
    }
    const T = (r.end ? o.end : o.start) + (r.off || 0) + (segShift.get(id) || 0);
    if (r.end) { const e = newCues.find((c) => Math.abs(c.end - T) < 0.15); if (e) return { n: e.n, end: true, off: 0 }; }
    return asTime(T);
  };
  return { map, notes, newCues };
}
export function remapPlanByTime(plan, oldCues, newCues) {
  const overrides = new Map(), segShift = new Map();
  for (const seg of Array.isArray(plan?.scenes) ? plan.scenes : []) {
    const r = seg && typeof seg.anchor === 'string' && typeof seg.from === 'string' ? parseRef(seg.from) : null;
    const o = r && r.kw == null && !r.end && !r.off ? oldCues.find((c) => c.n === r.n) : null;
    const k = o ? normText(seg.anchor) : '';
    if (!k) continue;
    const hit = newCues.filter((c) => normText(c.text).includes(k)).sort((x, y) => Math.abs(x.start - o.start) - Math.abs(y.start - o.start))[0];
    if (!hit || Math.abs(hit.start - o.start) > 3) continue;
    overrides.set(`#${r.n}`, { n: hit.n, end: false, off: 0 });
    segShift.set(seg.id, hit.start - o.start);
  }
  const mp = refMapper(oldCues, newCues, { overrides, segShift });
  let out = mapPlanTimes(plan, (r, id) => mp.map(r, id));
  // 章節轉場的 at 只能寫 "#N"（該章第一句）：照時間換成 "#282-2.99" 這種時（字幕避開了章節前的停頓），收回成那一句
  if (Array.isArray(out?.scenes) && out.scenes.some((sg, i) => sg && typeof sg.at === 'string' && sg.at !== plan.scenes[i]?.at)) {
    out = { ...out, scenes: out.scenes.map((sg) => {
      const r = sg && typeof sg.at === 'string' ? parseRef(sg.at) : null;
      if (!r || (!r.end && !r.off && r.kw == null)) return sg;
      return { ...sg, at: `#${r.end ? r.n + 1 : r.n}` };
    }) };
  }
  if (out.outro && typeof out.outro === 'object' && typeof out.outro.from === 'string') {
    const v = mapRefStr(out.outro.from, mp, 'outro');
    if (v !== out.outro.from) out = { ...out, outro: { ...out.outro, from: v } };
  }
  return { plan: out, notes: mp.notes, mapper: mp };
}
const hasRefs = (planText) => /"#\d+/.test(planText);
const fmtS = clock2;

// remapFrom：句號對應用的舊字幕（rough.srt 剛被逐字稿蓋掉時給備份的內容）
export const ALIGN_SHOW = 30;   // 不加 --verbose 時最多印幾列有標記的
// 逐字稿在某一段聽錯時，那幾句的時間會擠在一起：前面幾句拉長、後面一句只剩零點幾秒（16 個字 0.24 秒）。
// 整段的總長是對的（前後句都對得上），照字數重分就回到正常語速。只動語速明顯不對的那幾句，跨過停頓不動。
// speech＝rough.mp4 說話的區間：這幾句的詞級時間不能信，句與句的交界再貼到 0.5 秒內最近的真實停頓
export function evenOutCrushed(cues, { fast = 2, slow = 1, ok = 1.5, minLen = 5, gap = ALIGN.closeGap, speech = null, reach = 0.5, minPause = 0.12 } = {}) {
  const cps = (c) => visibleLen(c.text) / Math.max(0.01, c.end - c.start);
  const med = [...cues.map(cps)].sort((a, b) => a - b)[Math.floor(cues.length / 2)] || 0;
  const out = cues.map((c) => ({ ...c })), fixed = [];
  if (!med) return { cues: out, fixed };
  const off = (c) => cps(c) < med * slow || cps(c) > med * fast;
  for (let i = 0; i < out.length; i++) {
    if (visibleLen(out[i].text) < minLen || cps(out[i]) <= med * fast) continue;
    let a = i, z = i;
    while (a > 0 && out[a].start - out[a - 1].end <= gap && off(out[a - 1])) a--;
    while (z < out.length - 1 && out[z + 1].start - out[z].end <= gap && off(out[z + 1])) z++;
    const span = out[z].end - out[a].start;
    let chars = 0;
    for (let k = a; k <= z; k++) chars += visibleLen(out[k].text);
    if (a === z || chars / span > med * ok) continue;   // 整段都太快：不是擠壓，留給 ⚠
    let t = out[a].start;
    for (let k = a; k <= z; k++) {
      const d = span * visibleLen(out[k].text) / chars;
      out[k].start = r3(t);
      out[k].end = r3(t + d);
      t += d;
    }
    for (let k = a + 1; speech && k <= z; k++) {
      const at = out[k].start;
      let best = null, far = reach;
      for (let j = 1; j < speech.length; j++) {
        const x = speech[j - 1][1], y = speech[j][0];
        if (y - x < minPause) continue;
        const d = at < x ? x - at : at > y ? at - y : 0;
        if (d < far) { far = d; best = y; }
      }
      if (best == null || best - out[k - 1].start < ALIGN.minDur || out[k].end - best < ALIGN.minDur) continue;
      // 句子中間也有停頓，貼錯了語速會不對：貼完兩句都要在正常語速內才算
      const rate = (c, s, e) => visibleLen(c.text) / (e - s);
      const sane = (x) => x >= med * 0.6 && x <= med * 1.6;
      if (!sane(rate(out[k - 1], out[k - 1].start, best)) || !sane(rate(out[k], best, out[k].end))) continue;
      out[k - 1].end = r3(best);
      out[k].start = r3(best);
    }
    fixed.push([out[a].n, out[z].n]);
    i = z;
  }
  return { cues: out, fixed };
}

export function srtAlign(P, { dryRun = false, remapPlan = false, max = ALIGN.max, verbose = false, remapFrom = null, log = console.log, now = new Date() } = {}) {
  const work = path.join(P.project, 'work');
  const srtFile = path.join(work, 'rough.srt'), tjFile = path.join(work, 'transcript.json'), roughFile = path.join(work, 'rough.mp4');
  const scriptFile = path.join(P.project, '講稿.md');
  const pj = posixRel(P.project);
  const transcribe = `npx hyperframes transcribe ${pj}/work/rough.mp4 -d ${pj}/work --model small --language zh --json --to srt -o ${pj}/work/rough.srt`;
  // 逐字稿：transcript.json（詞級）優先；沒有就用 rough.srt 的整則時間（按字數比例，之後要跑 snap-srt）
  let words = null, why = null;
  if (fs.existsSync(tjFile)) {
    try { words = JSON.parse(fs.readFileSync(tjFile, 'utf8')); } catch (e) { throw new Error(`work/transcript.json 不是合法的 JSON（${e.message}）→ 重轉：${transcribe}`); }
    if (!Array.isArray(words) || !words.every((w) => w && typeof w.text === 'string' && Number.isFinite(w.start) && Number.isFinite(w.end))) throw new Error(`work/transcript.json 的格式不是 [{ text, start, end }] → 重轉：${transcribe}`);
    if (!transcriptFresh(tjFile, roughFile)) throw new Error(`work/transcript.json 比 work/rough.mp4 舊（不是這支初剪轉的）→ 重轉：${transcribe}`);
    if (fs.existsSync(roughFile)) noteTranscript(tjFile, roughFile);
  } else why = '沒有 work/transcript.json';
  const srtText = fs.existsSync(srtFile) ? fs.readFileSync(srtFile, 'utf8') : null;
  const oldCues = srtText ? parseSrt(srtText) : [];
  if (!words && !oldCues.length) throw new Error(`沒有 work/transcript.json，也沒有 work/rough.srt → 先轉逐字稿：${transcribe}`);
  if (!words) words = oldCues.map((c) => ({ text: c.text, start: c.start, end: c.end }));
  const hasScript = fs.existsSync(scriptFile);
  const lines = hasScript ? scriptLines(readScript(scriptFile)).map((text, i) => ({ text, from: i + 1 })) : clausesFromSrt(oldCues);
  if (!lines.length) throw new Error(hasScript ? '講稿.md 讀不到講解行（# 標題、> 引言、含 ` 的說明行都不算）→ 一句一行寫進講稿.md' : 'work/rough.srt 讀不到任何字幕');
  const res = alignCues(lines, words, { max });
  const { info, rows } = res;
  let { cues } = res, pauseNote = null, speech = null;
  // 字幕不蓋 rough.mp4 裡的長停頓（章節前的 3 秒）：用聲音的能量找停頓；整支有背景音樂分不出說話就跳過
  if (fs.existsSync(roughFile)) {
    try {
      const env = envelope(roughFile);
      speech = speechFromEnvelope(env, pickThreshold(env.db).threshold, { minSpeech: ALIGN.blip });
      const kp = keepPauses(cues, speech);
      if (kp.moved) { cues = kp.cues; res.cues = cues; }
      pauseNote = `rough.mp4 有 ${kp.pauses} 個 ≥ ${ALIGN.pause} 秒的停頓，${kp.moved} 則字幕的起迄避開停頓`;
    } catch (e) { pauseNote = `⚠ 量不到 rough.mp4 的停頓（${e.message.slice(0, 60)}），字幕可能蓋到章節前的停頓`; }
  }
  const crushed = evenOutCrushed(cues, { speech });
  if (crushed.fixed.length) {
    cues = crushed.cues; res.cues = cues;
    log(`${crushed.fixed.map((f) => `#${f[0]}–#${f[1]}`).join('、')} 語速不對（逐字稿在那裡聽錯，幾句擠在一起）：照字數重分時間`);
  }
  // 表
  log(`字幕對${hasScript ? '講稿' : '子句'}：${hasScript ? `講稿.md ${lines.length} 行` : `work/rough.srt ${oldCues.length} 則 → ${lines.length} 個子句`}，時間用 ${why ? `work/rough.srt 的整則時間按字數比例（${why}）` : `work/transcript.json（${words.length} 個詞）全域對齊`}`);
  const rowOf = (c) => {
    const f = info[c.n - 1];
    const tag = [f.merged > 1 ? `併 ${f.merged} 行` : '', f.split ? (f.forced ? '⚠ 拆（沒有標點）' : '拆') : '', f.interp ? '⚠ 內插' : ''].filter(Boolean).join('、');
    return { tag, warn: tag.includes('⚠'), line: `  ${String(c.n).padEnd(4)} ${`${fmtS(c.start)}–${fmtS(c.end)}`.padEnd(21)} ${(c.end - c.start).toFixed(2).padStart(5)}  ${String(visibleLen(c.text)).padStart(2)}   ${c.text}${tag ? `   （${tag}${hasScript ? `；講稿第 ${f.lines.join('、')} 行` : ''}）` : ''}` };
  };
  const table = cues.map(rowOf);
  // 預設只印有標記的列（併、拆、內插），長片最多 ALIGN_SHOW 列、⚠ 優先；--verbose 才印全表
  const marked = verbose ? table : table.filter((x) => x.tag);
  const shown = verbose || marked.length <= ALIGN_SHOW ? marked : [...marked.filter((x) => x.warn), ...marked.filter((x) => !x.warn)].slice(0, ALIGN_SHOW).sort((a, b) => table.indexOf(a) - table.indexOf(b));
  if (shown.length) {
    log('  則   起–迄                 長     字   字幕');
    for (const x of shown) log(x.line);
  }
  if (shown.length < marked.length) log(`  …還有 ${marked.length - shown.length} 列有標記（加 --verbose 看每一則）`);
  else if (!verbose && table.length > marked.length) log(`  （其他 ${table.length - marked.length} 則沒有標記；加 --verbose 看每一則）`);
  const lens = cues.map((c) => visibleLen(c.text)), durs = cues.map((c) => c.end - c.start).sort((a, b) => a - b);
  const gaps = cues.slice(1).map((c, i) => c.start - cues[i].end).sort((a, b) => a - b);
  const med = (a) => (a.length ? a[Math.floor((a.length - 1) / 2)] : 0);
  const summary = `共 ${cues.length} 則（併 ${info.filter((f) => f.merged > 1).length} 次、拆出 ${info.filter((f) => f.split).length} 則）；平均 ${(lens.reduce((s, x) => s + x, 0) / (lens.length || 1)).toFixed(1)} 字、最長 ${Math.max(0, ...lens)} 字；每則中位 ${med(durs).toFixed(2)} 秒；相鄰空檔中位 ${med(gaps).toFixed(2)} 秒`;
  log(summary);
  if (pauseNote) log(pauseNote);
  const warns = [];
  const bad = rows.filter((r) => !r.ok || r.interp);
  if (bad.length) warns.push(`⚠ ${bad.length} ${hasScript ? '行講稿' : '個子句'}在逐字稿裡對不上，時間用前後句內插：${bad.slice(0, 6).map((r) => `${hasScript ? `第 ${r.from} 行` : `#${r.cue}`}「${r.text}」`).join('、')}${bad.length > 6 ? '…' : ''} → 播 rough.mp4 那一段聽：沒講（剪掉了）就從字幕刪掉，有講就到剪輯台調起迄`);
  const forced = info.filter((f) => f.forced);
  if (forced.length) log(`${forced.length} 則超過 ${max} 字又沒有「、，」可以斷，斷在中段停頓最長的詞邊界（不切詞、不切英文和引號）`);
  const short = cues.filter((c) => c.end - c.start < ALIGN.minDur - 1e-9);
  if (short.length) warns.push(`⚠ ${short.length} 則不到 ${ALIGN.minDur} 秒：${short.slice(0, 8).map((c) => `#${c.n}「${c.text}」${(c.end - c.start).toFixed(2)}s`).join('、')} → 到剪輯台和前後句合併`);
  if (why) warns.push(`⚠ ${why}：時間是整則按字數比例估的 → 寫回後要跑 node shared/template/tools/media.mjs snap-srt --project ${pj}（有 transcript.json 就不用）`);
  for (const w of warns) log(w);
  // plan.json 已經用到 #N
  const planFile = path.join(work, 'hyperframes', 'plan.json');
  const planText = fs.existsSync(planFile) ? fs.readFileSync(planFile, 'utf8') : null;
  const needRemap = planText != null && hasRefs(planText);
  if (dryRun) {
    log(`--dry-run：只印不寫。${needRemap ? `work/hyperframes/plan.json 已經用到句號（#N）→ 寫回時要加 --remap-plan（照時間把 #N 換到新句號，先備份 plan.json）` : '去掉 --dry-run 就寫回 work/rough.srt（原檔先備份成 rough.srt.align-<時間戳>）'}`);
    return { ...res, written: false, warnings: warns, summary };
  }
  if (needRemap && !remapPlan) throw new Error(`work/hyperframes/plan.json 已經用到句號（#N），重新斷句後句號會全部位移 → 加 --remap-plan 再跑一次（照時間把 plan.json 的 #N 換到新句號，plan.json 先備份）`);
  let backup = null;
  if (srtText != null) { backup = backupPath(srtFile, now, 'align'); fs.copyFileSync(srtFile, backup); }
  const eol = srtText && srtText.includes('\r\n') ? '\r\n' : '\n';
  writeAtomic(srtFile, formatSrt(cues, { eol, bom: !!srtText && srtText.startsWith('﻿') }));
  log(`已寫回 work/rough.srt（${cues.length} 則）${backup ? `；原檔備份在 ${posix(path.relative(P.project, backup))}` : ''}`);
  let remap = null;
  if (needRemap) {
    const plan = JSON.parse(planText);
    remap = remapPlanByTime(plan, remapFrom ?? oldCues, cues);
    const pb = backupPath(planFile, now, 'align');
    fs.copyFileSync(planFile, pb);
    const indent = (planText.match(/\n([ \t]+)"/) || [, '  '])[1];
    let out = JSON.stringify(remap.plan, null, indent) + '\n';
    if (/\r\n/.test(planText)) out = out.replace(/\n/g, '\r\n');
    writeAtomic(planFile, out);
    log(`plan.json 的句號照時間換到新字幕；原檔備份在 ${posix(path.relative(P.project, pb))}`);
    // 032 B6：拍點正本在 work/designs/ 的段（內容設計動畫、手改的模板段、手寫 src）：動畫檔的 P.at('#N…') 和鏡位腳本「講到」欄一起換。
    // owner 照重對之前的 plan 判斷（模板段的動畫檔是照舊的 slots 產生的）；照 plan.json 產生的段下次 build 自己會跟上
    const hf = path.join(work, 'hyperframes');
    const BP = { project: P.project, out: hf, plan: planFile, templateDir: P.templateDir };
    let lib = null;
    try { lib = P.templateDir ? loadLib(P.templateDir, P.project) : null; } catch { lib = null; }
    const touched = remapScripts(BP, plan, remap.mapper, { lib, now, tag: 'align' });
    const inHf = (f) => posix(path.relative(hf, path.join(P.project, f)));
    if (touched.anims.length) log(`情境動畫的 P.at 句號一起換：${touched.anims.map(inHf).join('、')}（各自備份 .align-<時間戳>）`);
    if (touched.scripts.length) log(`鏡位腳本的「講到」句號一起換：${touched.scripts.join('、')}（各自備份 .align-<時間戳>）`);
    for (const n of remap.notes) log(`⚠ ${n}`);
  }
  markStep(P.project, 'srt-align');   // 032 C10：寫回 rough.srt（和 plan.json）之後記一筆，status 照它判斷
  log(hasScript
    ? `→ 字幕已經是講稿的字：只剩講稿本身的錯字要改（規則 4）；${why ? '接著跑 snap-srt' : '有 transcript.json，不用跑 snap-srt'}，再跑 media.mjs cutpoints`
    : `→ 照規則 4 校正錯字；${why ? '接著跑 snap-srt' : '有 transcript.json，不用跑 snap-srt'}，再跑 media.mjs cutpoints`);
  return { ...res, written: true, backup, remap, warnings: warns, summary };
}


// 每則字數上限照版式（009 FR-031：橫式 18、直式 10＝lib/canvas.mjs 的 caption.maxChars）；明寫 --max 時以參數為準
export function captionMax(P, max = null, log = console.log) {
  if (max != null) return max;
  let plan = null;
  try { plan = JSON.parse(fs.readFileSync(P.plan, 'utf8')); } catch { plan = null; }
  const f = resolveFormat({ projectDir: P.project, plan });
  const n = canvasOf(f.format).caption.maxChars;
  if (f.format === 'portrait') log(`版式：直式 → 每則最多 ${n} 字（來源：${f.detail}）`);
  return n;
}
