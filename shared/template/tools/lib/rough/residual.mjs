// 初剪做完再掃一次（055 C20、C21）：只列出、不剪
//   residualScan({ words, lines, ngRows, v1, fps, mainWords }) → { repeats, fillers, head }（純計算）
//     words＝初剪的逐字稿（rough.mp4 秒數，work/transcript.json）；lines＝講稿的講解行（沒講稿 null）
//     ngRows＝cuts.md 的 NG 列（main.mp4 秒數）；v1＝cuts.v1.json（實際剪掉的範圍）；mainWords＝transcript-main.json（初剪逐字稿沒有字時拿來看那一截講了什麼）
//     1. NG 列沒剪乾淨：打勾的列裡，實際剪掉的範圍沒蓋到的部分 ≥ minSec、裡面有字＝重講還留著（ng-snap 對齊停頓時把起點往後、終點往前移了，
//        主宣傳片 10:29.85 那一列只從 10:30.70 剪起，「你只要決」留在初剪 0:59.8）。初剪的逐字稿是照 cuts.md 的時間丟 NG 的字（或 whisper 把兩次併成一次），光看字看不出來
//     2. 初剪的逐字稿再跑一次 ng-scan 的重講偵測（往回跳、緊接著重複）和贅字
//     3. 開頭（C21）：上面兩種有落在前 headSec 秒的，或前 headSec 秒裡講稿第一句之前還有 ≥ headChars 個多出來的字，
//        或初剪最前面是原始錄影裡單獨接在前面的一小段、逐字稿沒有字（kind 'orphan'）→ head
//     repeats／head：[{ start, end（rough 秒數）, text, kind: 'ng'（第 1 種）|'scan'（第 2 種）, row?, src?, did? }]；fillers：ng-scan 的贅字列
//   roughResidual(project)               → 讀 work/ 的檔、同上（沒有初剪的逐字稿回傳 null）
//   residualLines(r)                     → media.mjs rough 回報段的 ⚠（每一種一行）
//   residualWarnings(project, plan)      → build --check 的 ⚠：plan.json 的 edit.cuts 還沒蓋到的重講、開頭（贅字照預設不剪，不算）
import fs from 'node:fs';
import path from 'node:path';
import { clock2r as clock, r3 } from '../time.mjs';
import { readScript } from '../script-file.mjs';
import { probeMedia } from '../ff.mjs';
import { keptSegments, sourceToRough } from '../transcript-map.mjs';
import { alignSeq } from './align.mjs';
import { parseCutsMd, readV1 } from './cuts.mjs';
import { ngScanRows, scriptChapters, scriptAnchors } from './ngscan.mjs';

// minSec：NG 列沒剪到的部分短於這個不算（auto-editor 的 margin、時間碼取兩位小數的誤差）；headSec、headChars：C21 的開頭範圍與多出來的字數；
// handled：edit.cuts 蓋到一截的這個比例以上算處理過了；list：一行最多列幾處
// orphanGap：初剪最前面那一小段和下一段在原始錄影裡隔這麼久以上，才算「單獨接在前面的一小段」
export const RESIDUAL = { minSec: 0.3, headSec: 1.5, headChars: 2, orphanGap: 1.0, handled: 0.6, list: 5 };

const mid = (w) => (+w.start + +w.end) / 2;
// 中英文之間補半形空格（「把 AI」）
const spaced = (s) => s.replace(/(\p{Script=Han})([A-Za-z0-9])/gu, '$1 $2').replace(/([A-Za-z0-9])(\p{Script=Han})/gu, '$1 $2');
const textIn = (words, a, b) => spaced((words || []).filter((w) => mid(w) >= a - 1e-6 && mid(w) < b + 1e-6).map((w) => String(w.text ?? '').trim()).join(''));
const overlap = (a, b, ranges) => ranges.reduce((n, [x, y]) => n + Math.max(0, Math.min(b, y) - Math.max(a, x)), 0);
const short = (s, n = 12) => { const c = [...String(s)]; return c.length > n ? `${c.slice(0, n).join('')}…` : c.join(''); };

export function residualScan({ words = [], lines = null, ngRows = [], v1 = null, fps = 30, mainWords = null } = {}) {
  const out = { repeats: [], fillers: [], head: null };
  // 1. NG 列沒剪乾淨
  if (v1?.chunks && ngRows.length) {
    const cuts = v1.chunks.filter((c) => c[2] >= 99999).map(([s, e]) => [s / fps, e / fps]);
    const kept = keptSegments(v1, fps);
    for (const row of ngRows) {
      if (!row.cut || row.wait || !(row.end > row.start)) continue;
      let left = [[row.start, row.end]];
      for (const [a, b] of cuts) left = left.flatMap(([x, y]) => (b <= x || a >= y ? [[x, y]] : [[x, Math.min(y, a)], [Math.max(x, b), y]].filter(([u, v]) => v - u > 1e-6)));
      const hit = cuts.filter(([a, b]) => b > row.start && a < row.end);
      const did = hit.length ? [r3(Math.max(row.start, hit[0][0])), r3(Math.min(row.end, hit[hit.length - 1][1]))] : null;
      for (const [x, y] of left) {
        if (y - x < RESIDUAL.minSec) continue;
        const start = r3(sourceToRough(kept, x)), end = r3(sourceToRough(kept, y));
        if (end - start < RESIDUAL.minSec) continue;
        const text = textIn(words, start, end) || textIn(mainWords, x, y);
        if (!text) continue;   // 沒有字：只是停頓、換氣
        out.repeats.push({ start, end, text, kind: 'ng', row: row.row, src: [r3(x), r3(y)], did });
      }
    }
  }
  // 2. 初剪的逐字稿再跑一次 ng-scan（重講、贅字）
  if (words?.length) {
    const r = ngScanRows(words, { lines });
    const taken = (a, b) => out.repeats.some((x) => a < x.end && b > x.start);
    for (const g of r.ng) if (!taken(g.start, g.end)) out.repeats.push({ start: g.start, end: g.end, text: g.text, kind: 'scan', line: g.line });
    out.repeats.sort((a, b) => a.start - b.start);
    out.fillers = r.fillers.filter((f) => !out.repeats.some((x) => f.start >= x.start - 0.05 && f.end <= x.end + 0.05));
  }
  // 3. 開頭
  const early = out.repeats.find((x) => x.start < RESIDUAL.headSec);
  if (early) { out.head = early; out.repeats = out.repeats.filter((x) => x !== early); }
  else if (lines?.length && words?.length) out.head = headExtra(words, lines);
  // 初剪最前面是原始錄影裡單獨的一小段（後面接著剪掉一大段），兩份逐字稿都沒有字：whisper 沒聽到的試講或雜音（短影片5 的「把 AI」原始錄影的逐字稿就沒有）
  if (!out.head && v1?.chunks) {
    const [k0, k1] = keptSegments(v1, fps);
    const len = k0 ? k0.b - k0.a : 0;
    if (k1 && len >= RESIDUAL.minSec && len < RESIDUAL.headSec && k1.a - k0.b >= RESIDUAL.orphanGap && !textIn(words, 0, len) && !textIn(mainWords, k0.a, k0.b)) {
      out.head = { start: 0, end: r3(len), text: '', kind: 'orphan', src: [r3(k0.a), r3(k0.b)], next: r3(k1.a) };
    }
  }
  if (out.head) out.fillers = out.fillers.filter((f) => !(f.start >= out.head.start - 0.05 && f.end <= out.head.end + 0.05));
  return out;
}

// 前 headSec 秒裡、講稿第一句之前多出來的字：第一個錨點之前，逐字稿比講稿多 ≥ headChars 字，而且最前面那幾個字對不上講稿
function headExtra(words, lines) {
  const A = scriptAnchors(words, lines);
  const first = A.anchors[0];
  if (!first || !first.i || first.i - first.s < RESIDUAL.headChars) return null;
  const T = A.T.slice(0, first.i);
  if (T[0].t >= RESIDUAL.headSec) return null;
  const { map, same } = alignSeq([...A.S.slice(0, first.s)], T.map((x) => x.c));
  const hit = new Uint8Array(T.length);
  map.forEach((j, i) => { if (j >= 0 && same[i]) hit[j] = 1; });
  let k = 0;
  while (k < T.length && !hit[k]) k++;
  if (k < RESIDUAL.headChars) return null;
  return { start: 0, end: r3(A.T[k].t), text: T.slice(0, k).map((x) => x.o ?? x.c).join(''), kind: 'scan' };
}

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const wordsOf = (j) => (Array.isArray(j) ? j : Array.isArray(j?.words) ? j.words : null);

export function roughResidual(project) {
  if (!project) return null;
  const work = path.join(project, 'work');
  const words = wordsOf(readJson(path.join(work, 'transcript.json')));
  if (!words?.length || !fs.existsSync(path.join(work, 'rough.mp4'))) return null;
  const scriptFile = path.join(project, '講稿.md');
  let lines = null, ngRows = [], v1 = null;
  try { if (fs.existsSync(scriptFile)) lines = scriptChapters(readScript(scriptFile)).lines; } catch { lines = null; }
  try { ngRows = parseCutsMd(fs.readFileSync(path.join(work, 'cuts.md'), 'utf8')).ng; } catch { ngRows = []; }
  try { v1 = readV1(path.join(work, 'cuts.v1.json')); } catch { v1 = null; }
  let fps = 30;
  const tb = String(v1?.timebase ?? '').match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  if (tb) fps = Number(tb[1]) / Number(tb[2]);
  else if (v1) { try { fps = probeMedia(path.join(work, 'rough.mp4')).fps || 30; } catch { fps = 30; } }
  return residualScan({ words, lines, ngRows, v1, fps, mainWords: wordsOf(readJson(path.join(work, 'transcript-main.json'))) });
}

// 一處的說明：時間「字」（為什麼）
function itemText(x) {
  let why = '';
  if (x.kind === 'ng') {
    const [a, b] = x.src;
    why = !x.did ? `剪輯清單第 ${x.row} 列整列都沒剪到`
      : a < x.did[0] ? `剪輯清單第 ${x.row} 列對齊停頓後從原始錄影 ${clock(x.did[0])} 才開始剪，前面 ${(b - a).toFixed(2)} 秒沒剪到`
      : b > x.did[1] ? `剪輯清單第 ${x.row} 列對齊停頓後剪到原始錄影 ${clock(x.did[1])} 就停，後面 ${(b - a).toFixed(2)} 秒沒剪到`
      : `剪輯清單第 ${x.row} 列中間原始錄影 ${clock(a)}–${clock(b)} 沒剪到`;
  } else if (x.kind === 'orphan') {
    return `${clock(x.start)}–${clock(x.end)}（原始錄影 ${clock(x.src[0])}–${clock(x.src[1])} 單獨一小段，後面直接接原始錄影 ${clock(x.next)}；逐字稿沒有字，多半是沒聽清楚的試講或雜音，聽一下）`;
  } else if (x.line) why = `講稿第 ${x.line} 行講了兩次`;
  return `${clock(x.start)}–${clock(x.end)}「${short(x.text)}」${why ? `（${why}）` : ''}`;
}
const r2 = (n) => Math.round(n * 100) / 100;
const cutArg = (xs) => xs.slice(0, RESIDUAL.list).map((x) => `[${r2(x.start)}, ${r2(x.end)}]`).join('、');
const listOf = (xs, fmt) => `${xs.slice(0, RESIDUAL.list).map(fmt).join('、')}${xs.length > RESIDUAL.list ? `…還有 ${xs.length - RESIDUAL.list} 處` : ''}`;

export function residualLines(r) {
  if (!r) return [];
  const L = [];
  if (r.head) L.push(`⚠ 初剪開頭有講稿外的話：${itemText(r.head)} → 剪掉：剪輯台把片頭拖到 ${r2(r.head.end)} 秒（或 plan.json 第一層 edit.cuts 加 ${cutArg([r.head])}）`);
  if (r.repeats.length) L.push(`⚠ 初剪後還留著 ${r.repeats.length} 處重講：${listOf(r.repeats, itemText)} → 剪輯台把這幾段剪掉（或 plan.json 第一層 edit.cuts 加 ${cutArg(r.repeats)}）`);
  if (r.fillers.length) L.push(`⚠ 初剪後還有 ${r.fillers.length} 處贅字（照預設沒剪）：${listOf(r.fillers, (f) => `${clock(f.start)}「${f.filler}」`)} → 使用者試聽後要剪就在剪輯台剪掉，不剪不用管`);
  return L;
}

export function residualWarnings(project, plan) {
  const r = roughResidual(project);
  if (!r) return [];
  const cuts = (Array.isArray(plan?.edit?.cuts) ? plan.edit.cuts : []).filter((c) => Array.isArray(c) && c.length === 2 && c.every(Number.isFinite));
  const left = [r.head, ...r.repeats].filter(Boolean).filter((x) => overlap(x.start, x.end, cuts) < RESIDUAL.handled * (x.end - x.start));
  if (!left.length) return [];
  return [`初剪後還留著 ${left.length} 處重講或試講沒剪：${listOf(left, itemText)} → 剪輯台把這幾段剪掉（或 plan.json 第一層 edit.cuts 加 ${cutArg(left)}）${r.fillers.length ? `；另有 ${r.fillers.length} 處贅字照預設沒剪，不用管` : ''}`];
}
