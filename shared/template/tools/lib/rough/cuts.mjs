// 剪乾淨：work/cuts.md（停點 ① 的 NG 表與章節空檔表）、auto-editor 參數、主軌來源
// 032 C9：從 media.mjs 搬過來（只搬移，輸出不變）；media.mjs 照舊匯出原本那些名稱
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { VIDEO_EXT, AUDIO_EXT } from '../ff.mjs';
import { spawnP } from '../proc.mjs';
import { normText } from '../time.mjs';
import { SILENT_PEAK, mainCandidates, joinMain } from './main-track.mjs';
import { r3, posixRel, listFiles } from './util.mjs';

// ---------- 剪乾淨：work/cuts.md（停點 ① 的 NG 表與章節空檔表；specs/contracts/stop-points.md §1）----------
export const CUT = {
  ngWin: 1.0,        // NG 起訖往前後找停頓的範圍（逐字稿常比嘴巴早 1 秒左右，AGENTS.md 剪乾淨第 6 步）
  chKeep: 3.0,       // 章節第一句前保留的停頓（G01）
  early: 0.6, late: 1.5,   // 章節第一句的開口點：表上時間 −0.6 到 +1.5 秒內算「對得上」，不另外說明
  ahead: 6.0,        // 表上時間不在停頓裡時，往後找第一個停頓終點的範圍（逐字稿常把那一句的起點標在停頓裡、比開口早好幾秒）
  longPause: 1.5,    // 表上時間前 early 秒內結束、這麼長的停頓＝就是這一章前面的停頓
  minKeep: 0.5,      // 保留區被 NG 吃到剩不到 0.5 秒就不保留
  ngKind: 0.3,       // cutpoints：剪掉的段和 NG 重疊 ≥ min(0.3 秒, NG 長度一半) 才算 ng
  edit: 'audio:-20dB', margin: '0.15sec',   // 剪乾淨的預設參數（G16：作者的停頓保留 0.3 秒）
};
// 小聲的錄音（旁白、領夾麥常見）：預設 -20dB 會把整支當成靜音（auto-editor：Timeline is empty）。
// 最大音量不到 -14 dB 時門檻跟著降，和正常錄音同樣的比例；31 分鐘的檔量一次約 3 秒
export function editForLevel(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vn', '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const peak = Number((String(r.stderr).match(/max_volume:\s*(-?[\d.]+) dB/) || [])[1]);
  if (!Number.isFinite(peak) || peak > -14) return { edit: CUT.edit, note: null };
  const db = Math.max(-50, Math.round(peak - 14));
  return { edit: `audio:${db}dB`, note: `這支錄音很小聲（最大音量 ${peak} dB），靜音門檻自動用 ${db}dB`, peak, silent: peak <= SILENT_PEAK };
}
const secArg = (x) => `${+r3(x)}sec`;

export function parseClock(s) {
  const t = String(s ?? '').trim().replace(/`/g, '');
  let m = t.match(/^(\d+):(\d{1,2}):(\d{1,2}(?:[.,]\d+)?)$/);
  if (m) return r3(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3].replace(',', '.')));
  m = t.match(/^(\d+):(\d{1,2}(?:[.,]\d+)?)$/);
  if (m) return r3(Number(m[1]) * 60 + Number(m[2].replace(',', '.')));
  m = t.match(/^(\d+(?:\.\d+)?)\s*(?:s|sec)?$/);
  return m ? r3(Number(m[1])) : null;
}
export function parseRange(s) {
  const t = String(s ?? '').trim().replace(/`/g, '');
  for (const sep of ['-->', '–', '—', '~', '～', '-']) {
    const i = t.indexOf(sep);
    if (i <= 0) continue;
    const a = parseClock(t.slice(0, i)), b = parseClock(t.slice(i + sep.length));
    if (a != null && b != null) return [a, b];
  }
  return null;
}
const isRow = (l) => /^\s*\|.*\|\s*$/.test(l ?? '');
const isSepRow = (l) => /^\s*\|?(\s*:?-{3,}:?\s*\|)+\s*(:?-{3,}:?\s*)?\|?\s*$/.test(l ?? '');
const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, '|').trim());
const isPending = (v) => v != null && !['', '—', '–', '-', '否', '無'].includes(String(v).trim());
// NG 表的「剪」欄（剪輯清單頁的勾選）：[x] 剪、[ ] 不剪
const isChecked = (v) => /^(\[\s*[xX✓✔]\s*\]|[xX✓✔✅])$/.test(String(v ?? '').trim());

// 「等待」表的列（邊錄邊講：畫面在等、又沒人講話）：和 NG 列同一種格式，剪輯清單頁不用改就能勾；原因欄以「等待」開頭，勾了留 WAIT_KEEP 秒快轉，其他剪掉
export const WAIT_RE = /^等待/;
export const WAIT_KEEP = 1.5;
// 勾了的等待留幾秒：等待長度的五分之一（＝5 倍快轉），最少 WAIT_KEEP 秒、最多 WAIT_KEEP_MAX 秒。
// 留到 3 秒以上（等待 ≥ 15 秒）完成影片會自動放等待卡、配秒針（lib/media.mjs 的 WAIT：×5 以上、至少 3 秒、沒人講話）；比較短的等待只是快轉帶過。
// 上限 4.5 秒＝卡片約 3.5 秒＋結果停 1 秒（「滴」響完再過 0.1 秒人聲才回來）
export const WAIT_KEEP_MAX = 4.5;
export const waitKeep = (len) => r3(Math.min(WAIT_KEEP_MAX, Math.max(WAIT_KEEP, len / 5)));
// → { ng: [{ row, line, start, end, text, reason, pending, raw, cut, cutCol, wait? }], chapters: [{ row, title, first, t }], hasNg, hasChapters, hasCutCol, ngTables, errors }
// cut：有「剪」欄時看勾選；沒有「剪」欄（舊格式）時＝「待確認」欄沒寫字。ngTables：[{ head, iCut, lines }]（行號從 0 起，setCutChecks 用）
export function parseCutsMd(text) {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/);
  const out = { ng: [], chapters: [], hasNg: false, hasChapters: false, hasCutCol: false, ngTables: [], errors: [] };
  let fence = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) { fence = !fence; continue; }
    if (fence || !isRow(lines[i]) || !isSepRow(lines[i + 1])) continue;
    const at = i;
    const head = cells(lines[i]).map((h) => h.replace(/\s+/g, ''));
    const rows = [];
    let j = i + 2;
    for (; j < lines.length && isRow(lines[j]); j++) rows.push(cells(lines[j]));
    i = j - 1;
    const col = (name) => head.findIndex((h) => h.includes(name));
    const iT = col('時間碼'), iR = col('原因'), iCh = col('章節'), iF = col('第一句');
    if (iT >= 0 && iR >= 0) {
      out.hasNg = true;
      const iC = col('內容'), iP = col('待確認'), iCut = head.indexOf('剪');
      if (iCut >= 0) out.hasCutCol = true;
      out.ngTables.push({ head: at, iCut, lines: rows.map((_, k) => at + 2 + k) });
      rows.forEach((r, k) => {
        const n = out.ng.length + 1, line = at + 2 + k;
        const range = parseRange(r[iT]);
        if (!range || !(range[0] < range[1])) { out.errors.push(`cuts.md NG 第 ${n} 列的時間碼「${r[iT] ?? ''}」看不懂 → 寫成 1:03.00–1:05.80（原片的起–迄）`); out.ng.push({ row: n, line, bad: true }); return; }
        const pending = iP >= 0 && isPending(r[iP]);
        out.ng.push({ row: n, line, start: range[0], end: range[1], text: iC >= 0 ? r[iC] ?? '' : '', reason: r[iR] ?? '', pending, raw: iP >= 0 ? r[iP] ?? '' : '',
          cut: iCut >= 0 ? isChecked(r[iCut]) : !pending, cutCol: iCut >= 0, ...(WAIT_RE.test(r[iR] ?? '') ? { wait: true } : {}) });
      });
    } else if (iCh >= 0 && iF >= 0 && iT >= 0) {
      out.hasChapters = true;
      for (const r of rows) {
        const n = out.chapters.length + 1;
        const t = parseRange(r[iT])?.[0] ?? parseClock(r[iT]);
        if (t == null) { out.errors.push(`cuts.md 章節空檔第 ${n} 列的時間碼「${r[iT] ?? ''}」看不懂 → 寫那一章第一句在原片的起點，例如 0:41.20`); continue; }
        out.chapters.push({ row: n, title: String(r[iCh] ?? '').replace(/^\d+[.、\s]*/, '').trim() || String(r[iCh] ?? ''), first: r[iF] ?? '', t });
      }
    }
  }
  out.ng = out.ng.filter((r) => !r.bad);
  return out;
}

// 剪輯清單頁勾選後寫回 cuts.md：checks＝{ NG 列號: true／false }，只改那幾列的「剪」欄，其他字不動。
// 沒有「剪」欄（舊格式）就在最前面加一欄，沒指定的列照原本會不會剪填 [x]／[ ]。
export function setCutChecks(text, checks) {
  const src = String(text);
  const bom = src.startsWith('﻿') ? '﻿' : '';
  const eol = /\r\n/.test(src) ? '\r\n' : '\n';
  const lines = src.replace(/^﻿/, '').split(/\r?\n/);
  const cm = parseCutsMd(src);
  const byLine = new Map(cm.ng.map((r) => [r.line, r]));
  const fmt = (cs) => `| ${cs.map((c) => String(c).replace(/\|/g, '\\|')).join(' | ')} |`;
  const mark = (on) => (on ? '[x]' : '[ ]');
  const want = (r) => (r && Object.hasOwn(checks, r.row) ? !!checks[r.row] : r ? r.cut : true);
  for (const t of cm.ngTables) {
    if (t.iCut < 0) {
      lines[t.head] = fmt(['剪', ...cells(lines[t.head])]);
      lines[t.head + 1] = fmt(['---', ...cells(lines[t.head + 1])]);
      for (const li of t.lines) lines[li] = fmt([mark(want(byLine.get(li))), ...cells(lines[li])]);
      continue;
    }
    for (const li of t.lines) {
      const r = byLine.get(li);
      if (!r || !Object.hasOwn(checks, r.row)) continue;
      const cs = cells(lines[li]);
      while (cs.length <= t.iCut) cs.push('');
      cs[t.iCut] = mark(checks[r.row]);
      lines[li] = fmt(cs);
    }
  }
  return bom + lines.join(eol);
}

// auto-editor --export v1：{ "version": "1", "source", "chunks": [[起始格, 結束格, 速度]] }（沒有 timebase，fps 由呼叫端給）
export function readV1(file) {
  let j;
  try { j = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { j = null; }
  if (!j || String(j.version) !== '1' || !Array.isArray(j.chunks)) throw new Error(`${posixRel(file)} 不是 auto-editor 的 v1 格式（要有 "version": "1" 和 "chunks"）→ 確認是 --export v1 產生的`);
  return j;
}
export const silencesOf = (v1, fps) => v1.chunks.filter((c) => c[2] >= 99999).map(([a, b]) => [r3(a / fps), r3(b / fps)]);

export function parseMargin(m) {
  const x = String(m ?? '').trim().match(/^(\d+(?:\.\d+)?)(?:sec|s)$/);
  if (!x) throw new Error(`--margin 要寫成秒數加 sec，例如 0.15sec（auto-editor 的純數字是格數），現在是「${m}」`);
  return Number(x[1]);
}

// NG 起訖吸到前後的停頓：起點用「包含它或最近的靜音段起點」、終點用「包含它或最近的靜音段終點」（±win 秒內）
// chapterSil＝章節開口用的停頓（chapterKeep 的 sil，可帶第 3 個值＝保留區起點）：終點「落在」這種停頓裡時改吸到保留區起點
// （沒帶就吸停頓起點），不吃掉章節的保留區；保留區前那段停頓本來就會被剪，一起剪才不會在兩個剪點之間留下一兩格的殘片
// （終點在停頓後面、NG 連下一句開頭一起剪時照常吸到停頓終點，由 ngSnap 報「吃掉章節的停頓」）
export function snapNg(rows, sil, win = CUT.ngWin, chapterSil = []) {
  const near = (x, idx) => {
    const inside = sil.find(([a, b]) => x >= a - 1e-9 && x <= b + 1e-9);
    if (inside) return inside;
    let best = null;
    for (const s of sil) { const d = Math.abs(s[idx] - x); if (d <= win + 1e-9 && (!best || d < best.d)) best = { s, d }; }
    return best ? best.s : null;
  };
  const chOf = (s) => chapterSil.find((c) => c && c[0] === s[0] && c[1] === s[1]);
  return rows.map((r) => {
    if (r.cut != null ? !r.cut : r.pending) return { ...r, skip: true };
    // 等待：本來就沒人講話，不用對齊停頓；留開頭 waitKeep 秒給 screen-sync 放快轉
    if (r.wait) return { ...r, a: r3(Math.min(r.end, r.start + waitKeep(r.end - r.start))), b: r3(r.end), missStart: false, missEnd: false, miss: false, toChapter: false };
    const sa = near(r.start, 0), sb = near(r.end, 1);
    const ch = sb && chOf(sb);
    const toChapter = !!(ch && r.end >= sb[0] - 1e-9 && r.end <= sb[1] + 1e-9);
    let a = sa ? sa[0] : r.start, b = sb ? (toChapter ? (ch[2] ?? sb[0]) : sb[1]) : r.end;
    let missStart = !sa, missEnd = !sb;
    if (toChapter && !(a < b)) { a = r.start; missStart = true; }
    if (!(a < b)) { a = r.start; b = r.end; missStart = missEnd = true; }
    return { ...r, a: r3(a), b: r3(b), missStart, missEnd, miss: missStart || missEnd, toChapter };
  });
}

// 章節第一句前保留 chKeep 秒：剪完的空檔＝前一句尾巴的 margin＋保留區＋開口前的 margin
// 開口＝這個停頓的終點：先找包含表上時間的停頓；再看表上時間前 early 秒內結束的長停頓（≥ longPause 秒，時間碼比開口晚一點點，不要跳到句中的小停頓）；
// 沒有就往後 ahead 秒內第一個停頓終點；再沒有才找表上時間前 early 秒內的
export function chapterKeep(chs, sil, margin, opt = CUT) {
  return chs.map((c) => {
    const s = sil.find(([a, b]) => c.t >= a - 1e-9 && c.t <= b + 1e-9)
      || [...sil].reverse().find(([a, b]) => b >= c.t - opt.early - 1e-9 && b < c.t && b - a >= opt.longPause - 1e-9)
      || sil.find(([, b]) => b >= c.t - 1e-9 && b <= c.t + opt.ahead + 1e-9)
      || [...sil].reverse().find(([, b]) => b >= c.t - opt.early - 1e-9 && b < c.t);
    if (!s) return { ...c, none: true };
    const [a, b] = s;
    const pause = r3(b - a + 2 * margin);
    const enough = pause >= opt.chKeep - 1e-6;
    const keep = enough ? [r3(Math.max(0, b - (opt.chKeep - 2 * margin))), b] : [a, b];
    const early = r3(b + margin - c.t);
    return { ...c, sil: s, onset: r3(b + margin), early: early > opt.late + 1e-9 ? early : 0, pause, keep, short: !enough, gapAfter: r3(enough ? opt.chKeep : pause) };
  });
}

export function mergeRanges(list) {
  const s = [...list].sort((x, y) => x[0] - y[0]), out = [];
  for (const r of s) { const l = out[out.length - 1]; if (l && r[0] <= l[1] + 1e-6) l[1] = Math.max(l[1], r[1]); else out.push([...r]); }
  return out;
}

export function aeCommand({ src, edit, margin, cutOut = [], addIn = [], tail = [] }) {
  return ['auto-editor', `"${src}"`, '--edit', `"${edit}"`, '--margin', margin,
    ...cutOut.flatMap(([a, b]) => ['--cut-out', `"${secArg(a)},${secArg(b)}"`]),
    ...addIn.flatMap(([a, b]) => ['--add-in', `"${secArg(a)},${secArg(b)}"`]), ...tail].join(' ');
}

export function aeArgs({ src, edit, margin, cutOut = [], addIn = [] }) {
  return [src, '--edit', edit, '--margin', margin, ...cutOut.flatMap(([a, b]) => ['--cut-out', `${secArg(a)},${secArg(b)}`]), ...addIn.flatMap(([a, b]) => ['--add-in', `${secArg(a)},${secArg(b)}`])];
}

// 原片：--src ＞ work/main.mp4 ＞（只有一支真人錄影）先跑 main 轉成 work/main.mp4（normalize: false 時直接用原檔）
export function mainSource(P, src, { normalize = true, log = console.log } = {}) {
  if (src) {
    for (const p of [path.resolve(src), path.join(P.project, src)]) if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
    throw new Error(`找不到 --src「${src}」→ 寫原片的路徑（例 projects/example/work/main.mp4）`);
  }
  const work = path.join(P.project, 'work');
  if (fs.existsSync(path.join(work, 'main.json')) && fs.existsSync(path.join(work, 'main.mp4'))) return path.join(work, 'main.mp4');
  const cams = listFiles(path.join(P.project, 'assets', 'camera'), VIDEO_EXT), voices = listFiles(path.join(P.project, 'assets', 'voice'), AUDIO_EXT);
  const screens = mainCandidates(P.project).screens.filter((x) => x.narrated);
  if (cams.length === 1 && !voices.length && !screens.length) {
    if (!normalize) return path.join(P.project, 'assets', 'camera', cams[0]);
    log('還沒有 work/main.mp4：先把原片轉成固定 fps（auto-editor 直接剪手機原檔，--cut-out 之後的畫面可能全黑）');
    fs.mkdirSync(work, { recursive: true });
    return joinMain(P, { log }).file;
  }
  if (cams.length + voices.length + screens.length > 1 || screens.length) throw new Error(`assets/camera/ 有 ${cams.length} 支${voices.length ? `、assets/voice/ 有 ${voices.length} 個` : ''}${screens.length ? `、assets/screen/ 有 ${screens.length} 支邊錄邊講的錄影` : ''}、又沒有 work/main.mp4 → 先跑 node shared/template/tools/media.mjs main --project ${posixRel(P.project)}（剪乾淨第 1 步）`);
  throw new Error(`找不到原片：assets/camera/ 是空的 → 把講解影片放進 ${posixRel(path.join(P.project, 'assets', 'camera'))}/`);
}

// auto-editor 失敗的訊息：「剪完什麼都不剩」不是參數打錯，要叫人看素材和清單
export function aeFailure(r, more = '') {
  const text = String(r.stderr || r.stdout || '').replace(/\x1b\[[0-9;]*m/g, '').trim();
  const last = text.split(/\r?\n/).filter(Boolean).pop() || '（沒有訊息）';
  if (/Timeline is empty/.test(text)) return new Error(`auto-editor 剪完什麼都不剩（${last}）→ 看 work/cuts.md 有沒有勾到整段；沒有的話是素材太小聲或沒有聲音：聽聽 work/main.mp4，很小聲就加 --edit "audio:-30dB" 再跑一次`);
  return new Error(`auto-editor 失敗（結束碼 ${r.status}）：${last} → 用 auto-editor --help 對一下參數名稱（以安裝的版本為準）${more}`);
}

function aeSilenceCache(P, src, edit, margin) {
  const dir = path.join(P.project, 'work', '.cache');
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, 'ng-snap.v1.json'), keyFile = path.join(dir, 'ng-snap.key.json');
  const st = fs.statSync(src);
  const key = JSON.stringify({ src: path.basename(src), size: st.size, mtimeMs: Math.round(st.mtimeMs), edit, margin, v: 1 });
  let hit = false;
  try { hit = fs.existsSync(out) && fs.readFileSync(keyFile, 'utf8').trim() === key; } catch { hit = false; }
  return { out, keyFile, key, hit };
}

// 同一份快取的非同步版：prep 轉逐字稿前先判斷停頓，同時還在掃素材
export async function aeSilenceAsync(P, src, { edit, margin, log = () => {} }) {
  const { out, keyFile, key, hit } = aeSilenceCache(P, src, edit, margin);
  if (hit) return { file: out, cached: true };
  log('用 auto-editor 判斷原片的停頓（第一次會花一點時間，之後用快取）…');
  const args = [src, '--edit', edit, '--margin', margin, '--export', 'v1', '-o', out, '--no-open'];
  let r = await spawnP('auto-editor', args, { tail: 4000 });
  if (r.error?.code === 'ENOENT' && process.platform === 'win32') r = await spawnP('auto-editor', args.map((x) => `"${x}"`), { tail: 4000, shell: true });
  if (r.error?.code === 'ENOENT') throw new Error('找不到 auto-editor → 照 setup/ 的手冊安裝；或用 --v1 給現成的 auto-editor --export v1 結果');
  if (r.status !== 0) throw aeFailure(r);
  fs.writeFileSync(keyFile, key + '\n');
  return { file: out, cached: false };
}

export function aeSilence(P, src, { edit, margin, log }) {
  const { out, keyFile, key, hit } = aeSilenceCache(P, src, edit, margin);
  if (hit) return { file: out, cached: true };
  log('用 auto-editor 判斷原片的停頓（第一次會花一點時間，之後用快取）…');
  const args = [src, '--edit', edit, '--margin', margin, '--export', 'v1', '-o', out, '--no-open'];
  let r = spawnSync('auto-editor', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  // Windows：裝成 auto-editor.cmd 包裝檔時不帶 shell 會 ENOENT，再用 shell 試一次（參數加引號）
  if (r.error && r.error.code === 'ENOENT' && process.platform === 'win32') r = spawnSync('auto-editor', args.map((x) => `"${x}"`), { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: true });
  if (r.error && r.error.code === 'ENOENT') throw new Error('找不到 auto-editor → 照 setup/ 的手冊安裝；或用 --v1 給現成的 auto-editor --export v1 結果');
  if (r.status !== 0) throw aeFailure(r);
  fs.writeFileSync(keyFile, key + '\n');
  return { file: out, cached: false };
}

// [a, b] 扣掉 cuts（已排序、不重疊也可以）→ 剩下的區間
export function subtractRanges([a, b], cuts) {
  const out = [];
  let x = a;
  for (const [c, d] of mergeRanges(cuts)) {
    if (d <= x + 1e-6 || c >= b - 1e-6) continue;
    if (c > x + 1e-6) out.push([r3(x), r3(c)]);
    x = Math.max(x, d);
  }
  if (b > x + 1e-6) out.push([r3(x), r3(b)]);
  return out;
}

// work/main.json 的 clips（原片是 work/main.mp4 時才算數）
export function mainClips(P, source) {
  if (path.resolve(source) !== path.join(P.project, 'work', 'main.mp4')) return [];
  try { return JSON.parse(fs.readFileSync(path.join(P.project, 'work', 'main.json'), 'utf8')).clips || []; } catch { return []; }
}

// 主軌順序照講稿：每支的逐字稿（落在那支時間內的詞）和講稿每一行比「兩個字一組」，命中 ≥ minHit 的行算這支講到的行；
// 位置＝那些行號的中位數。不管原本的順序（不用全域對齊：檔案排錯時全域對齊會對不起來）
export function scriptOrder(clips, words, lines, minHit = 0.6) {
  const pairs = (t) => { const cs = [...normText(t)], set = new Set(); for (let i = 0; i + 1 < cs.length; i++) set.add(cs[i] + cs[i + 1]); return set; };
  const L = lines.map(pairs);
  return clips.map((c, k) => {
    const B = pairs(words.filter((w) => w.start >= c.start - 0.05 && w.start < c.end).map((w) => w.text).join(''));
    const hits = [];
    L.forEach((set, i) => { if (set.size < 2) return; let h = 0; for (const g of set) if (B.has(g)) h++; if (h / set.size >= minHit) hits.push(i + 1); });
    return { ...c, k, lines: hits, pos: hits.length ? hits[Math.floor((hits.length - 1) / 2)] : null };
  });
}

// 照這個順序重來一次的指令（@起-迄 帶回去）
export const orderArg = (rows) => rows.map((r) => (r.src ? `${r.file}@${r.src[0]}-${r.src[1]}` : r.file)).join(',');
export const orderCommand = (P, rows) => `node shared/template/tools/media.mjs prep --project ${posixRel(P.project)} --order "${orderArg(rows)}"`;

// 建議順序：有位置的照位置排；對不到講稿的維持原本的前後、放最後
export function suggestOrder(rows) {
  return [...rows.filter((r) => r.pos != null).sort((a, b) => a.pos - b.pos || a.k - b.k), ...rows.filter((r) => r.pos == null)];
}
