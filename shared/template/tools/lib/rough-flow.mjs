// 「剪乾淨」併成指令（media.mjs prep／rough／transcribe）：長片的轉檔、whisper、初剪都在背景跑（lib/job.mjs），
// agent 的 shell 逾時也不會中斷；前景每步只印一行，細節在 work/.jobs/<prep|rough>-detail.log。
//
//   prepFlow(P, opt)    → 一條指令到停點 ①
//   roughFlow(P, opt)   → ① 通過後一條指令到字幕與剪接點
//   cutRows(scan)       → ng-scan 的結果 → cuts.md 的 NG 列
//   cutsMarkdown(...)   → cuts.md 全文
//   flowCli(cmd, P, flags) → media.mjs 的指令入口
//   cutsCli(P, flags)   → media.mjs cuts：停點 ① 使用者指名改哪幾列的「剪」欄
import { hasSimplified, toTrad } from './zh.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runJob, jobState, isJobChild, STILL_RUNNING } from './job.mjs';
import { STOP, stopLines } from './stops.mjs';
import { report, next, cmdLine } from './say.mjs';
import { saidOf } from './cli.mjs';
import { mainTry, stopLine } from './tries.mjs';
import { writeManifest } from './assets-manifest.mjs';
import { editorUrlsSync } from './editor-urls.mjs';
import { appendStop, progressFile } from './progress.mjs';
import { hfArgs } from './hf.mjs';
import { resolveFormat } from './canvas.mjs';
import { probeMedia, tmpFor, sweepTmp, VIDEO_EXT, IMAGE_EXT } from './ff.mjs';
import { formatSrt, parseSrt } from './srt.mjs';
import { spawnP } from './proc.mjs';
import { readScript } from './script-file.mjs';
import { writeAtomic } from './atomic.mjs';
import { mapWords, keptSegments, wordsToSource } from './transcript-map.mjs';
// 032 C9：剪乾淨用的函式在 lib/rough/（以前整包匯入 media.mjs，media.mjs 又動態匯入這支：循環）
import { scanFresh, scan as scanMedia, scanSummary, blackDetectBg, blackCacheOf, refreshVoiceOnly } from './rough/scan.mjs';
import { mainIsCurrent, joinMain, mainCandidates, screenJudge } from './rough/main-track.mjs';
import { readV1, aeSilenceAsync, WAIT_KEEP, WAIT_KEEP_MAX, waitKeep, scriptOrder, suggestOrder, editForLevel, CUT, parseCutsMd, setCutChecks, aeFailure, aeArgs } from './rough/cuts.mjs';
import { cutpoints, cutCheck } from './rough/cutpoints.mjs';
import { ngScan, chapterRows, ngSnap, utterances } from './rough/ngscan.mjs';
import { waitRows, screenSync } from './rough/screen-sync.mjs';
import { srtAlign, captionMax } from './rough/align.mjs';
import { clock2r } from './time.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MEDIA = path.join(HERE, '..', 'media.mjs');
const BUILD = path.join(HERE, '..', 'build.mjs');
const STOP1 = STOP.cuts;
const CUTS_DRAFT = '<!-- prep 草稿：ng-snap 預跑完才算數 -->';
export const ROUGH_WARN = { pause: 0.35, total: 0.6 };   // 停頓剪掉超過（扣掉 NG 後的）35%、或整支剪掉超過 60% → ⚠
const SPEECH_RATE = 16000;
const MIN_SPEECH = 0.2;   // 靜音判斷把超過 80% 都當靜音（錄得太小聲、門檻不對）：不要只拿剩下的去轉

const posix = (p) => p.split(path.sep).join('/');
const relPath = (p) => posix(path.relative(process.cwd(), p)) || '.';
const exists = (f) => fs.existsSync(f);
const mtime = (f) => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } };
const secs = (ms) => Math.round(ms / 100) / 10;
const clock = clock2r;
const cleanEnv = () => { const e = { ...process.env }; delete e.AUTO_EDIT_JOB; return e; };
const pad2 = (n) => String(n).padStart(2, '0');
const stamp = (d = new Date()) => `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
function backupName(file, tag) {
  const ts = stamp();
  let b = `${file}.${tag}-${ts}`;
  for (let k = 2; exists(b); k++) b = `${file}.${tag}-${ts}-${k}`;
  return b;
}

// 細節寫這裡（work/.jobs/<名稱>-detail.log），前景只印一行
function detailLog(project, name) {
  const file = path.join(project, 'work', '.jobs', `${name}-detail.log`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '');
  const fn = (...a) => { fs.appendFileSync(file, `${a.join(' ')}\n`); };
  fn.file = file;
  return fn;
}

// ---------- 逐字稿 ----------
const parseWords = (text, what) => {
  let w;
  try { w = JSON.parse(text); } catch (e) { throw new Error(`${what} 不是合法的 JSON（${e.message}）→ 要是 [{ text, start, end }]`); }
  if (!Array.isArray(w)) w = w?.words;
  if (!Array.isArray(w) || !w.every((x) => x && typeof x.text === 'string' && Number.isFinite(+x.start) && Number.isFinite(+x.end))) throw new Error(`${what} 的格式不是 [{ text, start, end }] → 重轉或換一份`);
  return w;
};

// whisper 的環境：Mac 預設帶 GGML_METAL_BF16_DISABLE=1（少了常先 SIGABRT 才重跑）；背景工作的標記不往下傳
export function whisperEnv(platform = process.platform, base = process.env) {
  const env = { ...base };
  delete env.AUTO_EDIT_JOB;
  if (platform === 'darwin' && env.GGML_METAL_BF16_DISABLE == null) env.GGML_METAL_BF16_DISABLE = '1';
  return env;
}

// hyperframes transcribe（工作區釘的版本）：dir 底下寫 transcript.json
export async function whisper(P, file, { srt = null, onSpawn = null, dir = path.join(P.project, 'work') } = {}) {
  const args = hfArgs(['transcribe', path.resolve(file), '-d', dir, '--model', 'small', '--language', 'zh', '--json', ...(srt ? ['--to', 'srt', '-o', srt] : [])]);
  const t0 = Date.now();
  const r = await spawnP(process.execPath, args, { env: whisperEnv(), tail: 4000, onSpawn });
  if (r.error) throw new Error(`轉逐字稿失敗：${r.error.message} → 跑 npx hyperframes doctor 檢查 whisper`);
  let j = null;
  try { j = JSON.parse(String(r.stdout).trim().split(/\r?\n/).pop()); } catch { j = null; }
  if (r.status !== 0 || !j?.ok) {
    if (r.signal === 'SIGTERM' || r.signal === 'SIGKILL') throw new Error('轉逐字稿被中止');
    const err = j?.error;
    const why = (typeof err === 'string' ? err : err?.message || (err ? JSON.stringify(err) : '')) || String(r.stderr).trim().split(/\r?\n/).filter((l) => !l.startsWith('{"type"')).pop() || `結束碼 ${r.status}`;
    throw new Error(`轉逐字稿失敗：${why.slice(0, 300)} → 跑 npx hyperframes doctor 檢查 whisper（第一次會下載模型，要網路）；修好後再跑一次同一條指令，第二次還失敗就停下來回報這段訊息`);
  }
  const wordsFile = path.join(dir, 'transcript.json');
  const words = parseWords(fs.readFileSync(wordsFile, 'utf8'), 'work/transcript.json');
  if (!words.length) throw new Error(`whisper 在 ${path.basename(file)} 裡聽不到任何字 → 確認素材有聲音、不是靜音檔`);
  // 同一個模型有時轉成簡體：這裡換回繁體，後面的清單、字幕、#N@詞 都不用再管（srt 也一樣）
  if (words.some((w) => hasSimplified(w.text))) {
    for (const w of words) w.text = toTrad(w.text);
    fs.writeFileSync(wordsFile, JSON.stringify(words, null, 2));
    if (srt && fs.existsSync(srt)) fs.writeFileSync(srt, toTrad(fs.readFileSync(srt, 'utf8')));
  }
  return { words, engine: j.engine || 'whisper', model: j.model || 'small', sec: secs(Date.now() - t0) };
}

// 先把停頓剪掉再轉（只轉這一次）：whisper 碰到長停頓會把後面那句的時間攤進停頓，差到好幾秒；停頓拿掉就和對 rough.mp4 轉一樣準。
// 詞的時間換回 main.mp4（找 NG 用），① 通過後再換到 rough.mp4，不用轉第二次
const v1FpsOf = (v1, fallback) => { const m = String(v1.timebase ?? '').match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/); return m ? Number(m[1]) / Number(m[2]) : fallback; };
export async function speechWhisper(P, mainFile, { edit, margin, v1: v1Given = null, detail = () => {} } = {}) {
  const info = probeMedia(mainFile);
  let silence;
  try {
    silence = v1Given ? readV1(path.resolve(v1Given)) : readV1((await aeSilenceAsync(P, mainFile, { edit, margin, log: detail })).file);
  } catch (e) {
    if (/找不到 auto-editor/.test(e.message)) throw e;
    detail(`判斷停頓失敗（${e.message}）：直接轉 main.mp4`);
    return { ...(await whisper(P, mainFile)), mappable: false, note: '判斷停頓失敗，直接轉整支' };
  }
  const kept = keptSegments(silence, v1FpsOf(silence, info.fps || 30));
  const keptSec = kept.reduce((n, k) => n + k.b - k.a, 0), dur = info.duration ?? keptSec;
  if (!kept.length || keptSec < dur * MIN_SPEECH) {
    detail(`靜音判斷只留 ${secs(keptSec * 1000)}s／${secs(dur * 1000)}s：直接轉 main.mp4`);
    return { ...(await whisper(P, mainFile)), mappable: false, note: '停頓判斷不可靠，直接轉整支' };
  }
  const dir = path.join(P.project, 'work', '.cache', 'whisper');
  fs.mkdirSync(dir, { recursive: true });
  const wav = path.join(dir, 'speech.wav');
  const pcm = await spawnP('ffmpeg', ['-v', 'error', '-i', mainFile, '-vn', '-ac', '1', '-ar', String(SPEECH_RATE), '-f', 's16le', 'pipe:1'], { binary: true });
  if (pcm.error || pcm.status !== 0) throw new Error(`解不出 work/main.mp4 的聲音：${String(pcm.stderr).trim().slice(-300)} → 確認主軌有聲音軌`);
  // 只留保留段：照實際切到的樣本數算時間，接再多段也不會累積誤差
  const parts = [];
  let bytes = 0;
  for (const k of kept) {
    const i = Math.round(k.a * SPEECH_RATE) * 2, j = Math.min(pcm.stdout.length, Math.round(k.b * SPEECH_RATE) * 2);
    if (j <= i) continue;
    parts.push({ a: k.a, b: k.a + (j - i) / 2 / SPEECH_RATE, at: bytes / 2 / SPEECH_RATE, i, j });
    bytes += j - i;
  }
  const head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + bytes, 4); head.write('WAVE', 8); head.write('fmt ', 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
  head.writeUInt32LE(SPEECH_RATE, 24); head.writeUInt32LE(SPEECH_RATE * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34); head.write('data', 36); head.writeUInt32LE(bytes, 40);
  const fd = fs.openSync(wav, 'w');
  fs.writeSync(fd, head);
  for (const p of parts) fs.writeSync(fd, pcm.stdout, p.i, p.j - p.i);
  fs.closeSync(fd);
  detail(`停頓先剪掉再轉：${secs(dur * 1000)}s → ${secs(bytes / 2 / SPEECH_RATE * 1000)}s，${parts.length} 段`);
  try {
    const r = await whisper(P, wav, { dir });
    return { ...r, words: wordsToSource(r.words, parts), mappable: true, note: `停頓先剪掉再轉：${clock(dur)} → ${clock(bytes / 2 / SPEECH_RATE)}` };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// transcript-main.json 能不能直接換算到 rough.mp4（whisper 是不是對剪掉停頓的聲音轉的；直接轉整支的時間不夠準）
const tjMarkFile = (work) => path.join(work, '.cache', 'transcript-main-of.json');
function writeTjMark(work, mark) {
  fs.mkdirSync(path.dirname(tjMarkFile(work)), { recursive: true });
  fs.writeFileSync(tjMarkFile(work), `${JSON.stringify(mark)}\n`);
}
const tjMappable = (work) => { try { return !!JSON.parse(fs.readFileSync(tjMarkFile(work), 'utf8')).mappable; } catch { return false; } };

function useTranscript(P, file) {
  const abs = [path.resolve(file), path.join(P.project, file)].find((f) => exists(f));
  if (!abs) throw new Error(`找不到 --transcript「${file}」→ 給詞級逐字稿 JSON 的路徑`);
  const words = parseWords(fs.readFileSync(abs, 'utf8'), `--transcript ${file}`);
  if (!words.length) throw new Error(`--transcript ${file} 是空的`);
  fs.writeFileSync(path.join(P.project, 'work', 'transcript.json'), JSON.stringify(words, null, 1) + '\n');
  return { words, engine: '現成的逐字稿', model: '--transcript', sec: 0, mappable: true };
}

const countFiles = (P, dir, exts) => { try { return fs.readdirSync(path.join(P.project, 'assets', dir)).filter((x) => !x.startsWith('.') && exts.includes(path.extname(x).toLowerCase())).length; } catch { return 0; } };
const hasMediaFiles = (P) => countFiles(P, 'screen', VIDEO_EXT) + countFiles(P, 'images', IMAGE_EXT) > 0;
const lineOfWhisper = (x) => `${x.words.length} 個詞，${x.engine}${x.model && x.model !== '--transcript' ? ` ${x.model}` : ''}${x.sec ? `，用 ${x.sec}s` : ''}${x.note ? `；${x.note}` : ''}`;

// media.mjs transcribe：一行結果
async function transcribeFlow(P, flags) {
  const work = path.join(P.project, 'work');
  fs.mkdirSync(work, { recursive: true });
  const main = path.join(work, 'main.mp4');
  let file = main;
  if (flags.file) {
    file = [path.resolve(flags.file), path.join(P.project, flags.file)].find((f) => exists(f) && fs.statSync(f).isFile());
    if (!file) throw new Error(`找不到 --file「${flags.file}」→ 寫影片的路徑（例 work/rough.mp4，相對專案資料夾）`);
  } else if (!exists(main)) throw new Error(`找不到 work/main.mp4 → 先跑 node shared/template/tools/media.mjs main --project ${relPath(P.project)}`);
  const isRough = path.resolve(file) === path.join(work, 'rough.mp4');
  const srt = path.join(work, 'rough.srt');
  if (isRough && exists(srt)) fs.copyFileSync(srt, backupName(srt, 'transcribe'));
  const r = await whisper(P, file, isRough ? { srt } : {});
  if (path.resolve(file) === main) { fs.copyFileSync(path.join(work, 'transcript.json'), path.join(work, 'transcript-main.json')); writeTjMark(work, { mappable: false }); }
  console.log(`✓ 逐字稿：work/transcript.json（${relPath(file)}；${lineOfWhisper(r)}）${path.resolve(file) === main ? '；另存 work/transcript-main.json' : ''}${isRough ? '；work/rough.srt' : ''}`);
  return 0;
}

// ---------- ng-scan → cuts.md ----------
const cell = (s) => String(s ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();

// NG 列（照時間排）：重講 [x]；真的講稿外 [ ]＋待確認；沒講稿的候選 [x]＋待確認（工具沒有講稿可以對，全部要人聽）；
// 贅字（025）[ ]、不寫待確認（預設不剪，不算「需要你決定」）；落在重講或講稿外那幾列裡面的不另外列
export function cutRows({ ng = [], outside = [], script = null, fillers = [] }) {
  const rows = ng.map((g) => ({
    cut: true, start: g.start, end: g.end, text: g.text,
    reason: g.line ? `同一句講兩次：講稿第 ${g.line} 行在 ${clock(g.again)} 又講一次，留後面那次` : `同一句講兩次：${clock(g.again)} 又講一次，留後面那次`,
    pending: g.cross != null ? `跨過換檔點 ${clock(g.cross)}：換檔處逐字稿時間常不準、下一支開頭可能還有試講 → 請聽 ${clock(g.cross)} 之後確認從哪裡重講（終點改到那裡）`
      : !script ? '沒有講稿，工具比對相鄰句找到的候選 → 請試聽，不是重講就取消勾選'
      : g.repeat != null && g.repeat < 5 ? '重複的字很少 → 請試聽：真的是卡住重講才剪，不是就取消勾選' : '',
  }));
  for (const u of outside.filter((x) => x.real)) {
    rows.push({ cut: false, start: u.start, end: u.end, text: u.text.slice(0, 40),
      reason: `講稿外：這一段逐字稿 ${u.tChars} 字、講稿只有 ${u.sChars} 字（講稿第 ${u.line} 行附近）`,
      pending: '講稿沒有這段話 → 請試聽：口誤、自言自語就勾起來剪；臨場加的話就不用動' });
  }
  const inRow = (f) => rows.some((r) => f.start >= r.start - 0.05 && f.end <= r.end + 0.05);
  for (const f of fillers.filter((x) => !inRow(x))) {
    rows.push({ cut: false, start: f.start, end: f.end, text: f.text, reason: `贅字「${f.filler}」：預設不剪，試聽後要剪再勾（剪完聽一次接點有沒有跳音）`, pending: '' });
  }
  return rows.sort((a, b) => a.start - b.start);
}

export function cutsMarkdown({ rows = [], chapters = [], order = null, decide = [], waits = [] }) {
  const L = ['# 剪輯清單', ''];
  if (order) {
    L.push('## 主軌順序', '', order.note, '', '| 順序 | 檔案 | 長度 | 講到講稿第幾行 | 照講稿建議的順序 |', '|---|---|---|---|---|');
    for (const r of order.rows) L.push(`| ${r.k + 1} | ${cell(r.src ? `${r.file}@${r.src[0]}-${r.src[1]}` : r.file)} | ${clock(r.end - r.start)} | ${r.lines?.length ? `${r.lines[0]}–${r.lines[r.lines.length - 1]}` : r.lines ? '對不到' : '—'} | ${r.sug ?? '—'} |`);
    if (order.judge?.length) L.push('', ...order.judge.map((x) => `- ${cell(x)}`));
    L.push('');
  }
  L.push('## NG', '', '| 剪 | 時間碼 | 內容 | 原因 | 待確認 |', '|---|---|---|---|---|');
  for (const r of rows) L.push(`| ${r.cut ? '[x]' : '[ ]'} | ${clock(r.start)}–${clock(r.end)} | ${cell(r.text) || '—'} | ${cell(r.reason)} | ${cell(r.pending) || '—'} |`);
  L.push('');
  if (waits.length) {
    L.push('## 等待（邊錄邊講）', '', `畫面在等、也沒人講話的地方。勾了就壓成 ${WAIT_KEEP}–${WAIT_KEEP_MAX} 秒的快轉（等待的五分之一），其他剪掉；等待 15 秒以上的，完成影片會自動放等待卡（計時圈＋在等什麼）、配秒針。預設不勾。`, '', '| 剪 | 時間碼 | 內容 | 原因 | 待確認 |', '|---|---|---|---|---|');
    for (const w of waits) L.push(`| [ ] | ${clock(w.start)}–${clock(w.end)} | ${cell(w.file)} ${w.kind === '畫面在轉' ? '畫面在轉' : w.kind === '靜止' ? '畫面沒動' : '只有小動作（可能在打字）'} | 等待：${(w.end - w.start).toFixed(1)} 秒沒人講話，勾了壓成 ${waitKeep(w.end - w.start)} 秒快轉${waitKeep(w.end - w.start) >= 3 ? '＋等待卡' : ''} | — |`);
    L.push('');
  }
  if (chapters.length) {
    L.push('## 章節空檔', '', '| 章節 | 第一句 | 時間碼 |', '|---|---|---|');
    for (const c of chapters) L.push(`| ${cell(c.title)} | ${cell(c.first)} | ${clock(c.t)} |`);
    L.push('');
  }
  L.push('## 需要你決定', '');
  L.push(...(decide.length ? decide.map((d) => `- ${String(d).replace(/\r?\n/g, ' ')}`) : ['- 無']));
  L.push('');
  return L.join('\n');
}

// 「需要你決定」：ng-snap 的 ⚠ 原文、待確認的列各一行、其他要問的
function decideList(rows, snapWarnings, extra) {
  const pend = rows.map((r, i) => (r.pending ? `第 ${i + 1} 列（${clock(r.start)}–${clock(r.end)}）待確認：${r.pending}` : null)).filter(Boolean);
  return [...extra, ...snapWarnings, ...pend];
}

// cuts.md 最後一節「需要你決定」的項目（「- 無」算沒有）
export function parseDecide(md) {
  const lines = String(md).split(/\r?\n/);
  const at = lines.findIndex((l) => /^##\s*需要你決定/.test(l.trim()));
  if (at < 0) return [];
  const out = [];
  for (let i = at + 1; i < lines.length && !/^##\s/.test(lines[i]); i++) {
    const m = lines[i].match(/^\s*[-*]\s+(.*)$/);
    if (m && m[1].trim() !== '無') out.push(m[1].trim());
  }
  return out;
}

// 主軌順序（多支、或有判斷過的螢幕錄影）：有講稿時用 scriptOrder 建議順序
function orderInfo(P, { clips, words, lines, explicit, judge }) {
  if (clips.length < 2 && !judge.length) return { order: null, extra: [] };
  const how = explicit ? '照 --order 接' : '照檔名接';
  const extra = [];
  let rows = clips.map((c, k) => ({ ...c, k }));
  let note = clips.length > 1 ? `現在${how}（${clips.length} 支）。` : '主軌只有 1 支；下面是螢幕錄影的判斷（判斷錯了就說，會改接進主軌的檔）。';
  if (clips.length > 1 && lines?.length) {
    const scored = scriptOrder(clips, words, lines);
    const sug = suggestOrder(scored);
    const same = sug.every((r, i) => r.k === i);
    const sugAt = new Map(sug.map((r, i) => [r.k, i + 1]));
    rows = scored.map((r) => ({ ...r, sug: sugAt.get(r.k) }));
    note += same ? '照講稿比對，順序一樣。' : `照講稿比對，建議順序：${sug.map((r) => path.basename(r.file)).join(' → ')}（要照建議就說「照講稿順序」）。`;
    if (same && !explicit) extra.push(`主軌 ${clips.length} 支${how}（${clips.map((c) => path.basename(c.file)).join(' → ')}），和講稿順序一樣 → 順序對就不用改；要改就說順序`);
    // 不一樣時 ng-snap 的 ⚠ 會寫進「需要你決定」（含要跑的指令）
  } else if (clips.length > 1 && !explicit) {
    extra.push(`主軌 ${clips.length} 支${how}（${clips.map((c) => path.basename(c.file)).join(' → ')}），沒有講稿可以比對 → 順序對嗎？要改就說新的順序（會重接、重轉）`);
  }
  return { order: { note, rows, judge }, extra };
}

// 主軌有純聲音、又沒有任何素材：① 就提醒（之後畫面只能全部靠情境動畫）
function voiceNotice(P, clips) {
  const voice = clips.filter((c) => c.kind === 'voice').reduce((n, c) => n + c.end - c.start, 0);
  if (!voice) return [];
  if (hasMediaFiles(P)) return [];
  return [`主軌有 ${clock(voice)} 只有聲音，assets/screen/、assets/images/ 都是空的 → 有截圖或螢幕錄影就先放進去；沒有的話那些區間全部用情境動畫`];
}

// ---------- 停點紀錄 ----------
// 停點 ① 最後一列的狀態（工作還沒寫過就是 null）
export function lastStop1(project) {
  let text;
  try { text = fs.readFileSync(progressFile(project), 'utf8'); } catch { return null; }
  const lines = text.split(/\r?\n/);
  const at = lines.findIndex((l) => /^##\s*停點紀錄\s*$/.test(l.trim()));
  if (at < 0) return null;
  let state = null;
  for (let i = at + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) break;
    const c = lines[i].trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((x) => x.trim());
    if (c.length >= 3 && c[1].startsWith('①')) state = c[2];
  }
  return state;
}

// 開工決策表：status.mjs 的 initProgress（另一支工具維護；還沒有就跳過，appendStop 會建空表）
async function initProgressSafe(project, detail, format = null) {
  try {
    const { initProgress } = await import('../status.mjs');
    if (typeof initProgress !== 'function') { detail('status.mjs 沒有 initProgress，跳過開工決策表'); return null; }
    const r = initProgress(project, { format });
    detail(`開工決策表：${r?.created ? '新建' : '已經有了'}`);
    return r;
  } catch (e) { detail(`開工決策表沒填（${e.message}）`); return null; }
}

// ---------- 剪輯台網址 ----------
// editor.mjs --json 直接回各頁網址（lib/editor-urls.mjs），不從人看的輸出比對「剪輯清單：」這類文字。
// 背景工作的標記（AUTO_EDIT_JOB）不往下傳：剪輯台是常駐的，帶著它之後開的工具會以為自己是 prep／rough 的子行程
function editorUrls(P, flags) {
  const job = process.env.AUTO_EDIT_JOB;
  delete process.env.AUTO_EDIT_JOB;
  try { return editorUrlsSync(P.project, { template: flags.template }); } finally { if (job !== undefined) process.env.AUTO_EDIT_JOB = job; }
}
// 開不成功時 editorUrlsSync 只回 null：原因在剪輯台的 log（ensureEditor 寫的），指過去
const editorWhy = (P) => {
  const log = path.join(P.project, 'work', 'hyperframes', '.editor', 'editor.log');
  return exists(log) ? `細節：${relPath(log)}` : `跑 node shared/template/tools/editor.mjs --project ${relPath(P.project)} 看錯誤`;
};

// ---------- 剪輯清單頁 ----------
function openCutsPage(P, flags, detail) {
  const u = editorUrls(P, flags);
  detail(u ? `剪輯清單：${u.cuts}` : '剪輯台沒開成功（editor.mjs --json 沒回網址）');
  if (u?.cuts) return { url: u.cuts };
  return { url: null, why: editorWhy(P) };
}

// 初剪完成就能在瀏覽器看字幕疊在畫面上（不用另外輸出）。
//   plan.json 先建起來，字幕才有地方存（構圖、--scaffold 本來也會建，這裡只是提早）
//   底片先在背景處理：auto-editor 的輸出在瀏覽器裡拖到中段常解碼失敗；後面的 build 會直接沿用，不算多做
function openRoughPreview(P, flags, detail) {
  const planFile = path.join(P.project, 'work', 'hyperframes', 'plan.json');
  if (!exists(planFile)) {
    // 直式要寫 format（和構圖台建 plan.json 時一樣）：開工決策表是直式、plan.json 沒寫，build 會擋
    const { format } = resolveFormat({ projectDir: P.project });
    fs.mkdirSync(path.dirname(planFile), { recursive: true });
    writeAtomic(planFile, `${JSON.stringify({ version: 1, ...(format === 'portrait' ? { format } : {}) }, null, 2)}\n`);
  }
  if (flags['no-editor']) return { url: null };
  const tpl = flags.template ? ['--template', flags.template] : [];
  const pre = spawnSync(process.execPath, [BUILD, '--project', P.project, '--prepare', ...tpl], { encoding: 'utf8', env: cleanEnv(), cwd: process.cwd(), timeout: 60000 });
  detail(String(pre.stdout || ''), String(pre.stderr || ''));
  // 正常流程剪輯台早就開著（① 的剪輯清單頁）：開著就直接回網址
  const u = editorUrls(P, flags);
  detail(u ? `剪輯：${u.main}` : '剪輯台沒開成功（editor.mjs --json 沒回網址）');
  return { url: u?.main ?? null };
}

// ---------- prep：一條指令到停點 ① ----------
export async function prepFlow(P, flags = {}) {
  const proj = P.project, work = path.join(proj, 'work'), pj = relPath(proj);
  const say = console.log;
  fs.mkdirSync(work, { recursive: true });
  const detail = detailLog(proj, 'prep');
  const cutsFile = path.join(work, 'cuts.md'), mainFile = path.join(work, 'main.mp4'), mainTj = path.join(work, 'transcript-main.json'), roughFile = path.join(work, 'rough.mp4');
  if (exists(path.join(proj, '講稿.md'))) readScript(path.join(proj, '講稿.md'));   // 編碼不對先擋下來，不要轉完檔、聽完逐字稿才發現
  if (jobState(proj, 'rough').state === 'running') throw new Error(`初剪（media.mjs rough）還在背景跑 → 等它跑完再說：node shared/template/tools/media.mjs rough --project ${pj}`);
  if (exists(roughFile)) {
    if (!flags.again) throw new Error(`work/rough.mp4 已經存在（初剪做過了）→ 先問使用者要不要重剪。只改勾選：改好 work/cuts.md 後跑 node shared/template/tools/media.mjs rough --project ${pj} --again；要重新找 NG 或改主軌順序：node shared/template/tools/media.mjs prep --project ${pj} --again（舊的 rough.mp4 改名留著）`);
    const b = backupName(roughFile, 'bak');
    fs.renameSync(roughFile, b);
    say(`（舊的初剪改名留著：${relPath(b)}）`);
  }
  await initProgressSafe(proj, detail, flags.format ?? null);

  // 主軌
  const order = flags.order ?? null;
  let joined = false, judge = [];
  const t0 = Date.now();
  if (mainIsCurrent(P, order)) {
    detail('work/main.mp4 是最新的，不重接');
  } else {
    const logged = [];
    joinMain(P, { order, log: (l) => { logged.push(l); detail(l); } });
    joined = true;
    judge = logged.filter((l) => /^assets\/screen\//.test(l));
  }
  const mainJson = JSON.parse(fs.readFileSync(path.join(work, 'main.json'), 'utf8'));
  const clips = mainJson.clips || [], mainWarn = mainJson.warnings || [];
  const info = probeMedia(mainFile);
  const kinds = { camera: 0, voice: 0, screen: 0 };
  for (const c of clips) kinds[c.kind] = (kinds[c.kind] || 0) + 1;
  say(`✓ 主軌：work/main.mp4（${[kinds.camera ? `真人 ${kinds.camera} 支` : '', kinds.voice ? `聲音 ${kinds.voice} 段` : '', kinds.screen ? `邊錄邊講 ${kinds.screen} 支` : ''].filter(Boolean).join('＋')}，${info.width}×${info.height}、${info.fps}fps、${clock(info.duration ?? 0)}${joined ? `，用 ${secs(Date.now() - t0)}s` : '，沿用現成的'}）`);

  // 逐字稿＋掃素材（同時跑）
  const tjFresh = exists(mainTj) && mtime(mainTj) >= mtime(mainFile) - 1000 && !flags.transcript;
  const haveMedia = hasMediaFiles(P);
  const scanTask = haveMedia && !scanFresh(P) ? (async () => {
    const t1 = Date.now();
    try { const j = await scanMedia(P, { log: detail }); return { line: scanSummary(j, secs(Date.now() - t1)) }; } catch (e) { return { warn: `⚠ 素材掃描失敗（${e.message}）→ 之後跑 node shared/template/tools/media.mjs scan --project ${pj}` }; }
  })() : Promise.resolve(haveMedia ? { line: `${scanSummary(JSON.parse(fs.readFileSync(path.join(work, 'media', 'index.json'), 'utf8')))}（沒換，沿用）` } : { line: '素材：assets/screen/、assets/images/ 都是空的' });
  for (const w of mainWarn) say(`⚠ ${w}`);
  // 全靜音：whisper 會幻聽出一堆字，auto-editor 也剪不出東西，在這裡就講清楚
  const measured = editForLevel(mainFile);
  if (measured.silent && !flags.transcript) throw new Error(`主軌是靜音（最大音量 ${measured.peak} dB）→ 這個流程靠講話的聲音剪：確認錄影時有收音、素材沒放錯；聲音在別的檔就放 assets/voice/`);
  const level = flags.edit ? { edit: flags.edit, note: null } : measured;
  if (level.note) say(`✓ ${level.note}`);
  const whisperTask = tjFresh ? null : flags.transcript ? Promise.resolve(useTranscript(P, flags.transcript)) : speechWhisper(P, mainFile, { edit: level.edit, margin: flags.margin ?? CUT.margin, v1: flags.v1 ?? null, detail });
  const [tr, sc] = await Promise.allSettled([whisperTask, scanTask]);
  if (tr.status === 'rejected') throw tr.reason;
  let words;
  if (tjFresh) {
    words = parseWords(fs.readFileSync(mainTj, 'utf8'), 'work/transcript-main.json');
    fs.copyFileSync(mainTj, path.join(work, 'transcript.json'));   // 重來時 transcript.json 可能還是上次 rough.mp4 的
    say(`✓ 逐字稿：work/transcript-main.json（${words.length} 個詞，沿用現成的）`);
  } else {
    words = tr.value.words;
    const json = `${JSON.stringify(words, null, 1)}\n`;
    fs.writeFileSync(path.join(work, 'transcript.json'), json);
    fs.writeFileSync(mainTj, json);
    writeTjMark(work, { mappable: !!tr.value.mappable });
    say(`✓ 逐字稿：work/transcript-main.json（${lineOfWhisper(tr.value)}）`);
  }
  const scanned = sc.status === 'fulfilled' ? sc.value : { warn: `⚠ 素材掃描失敗（${sc.reason?.message}）` };
  say(scanned.warn || `✓ ${scanned.line}`);

  // cuts.md：還是最新的就不重寫（使用者可能已經勾過）
  const cutsFresh = exists(cutsFile) && !joined && !flags.again && mtime(cutsFile) >= mtime(mainFile) - 1000 && !fs.readFileSync(cutsFile, 'utf8').includes(CUTS_DRAFT);
  let regenerated = false, cutsLine;
  if (cutsFresh) {
    cutsLine = '✓ 剪輯清單：work/cuts.md 還是最新的，不重寫（使用者勾過的都留著）';
  } else {
    if (exists(cutsFile)) { const b = backupName(cutsFile, 'bak'); fs.copyFileSync(cutsFile, b); say(`（舊清單備份：${relPath(b)}）`); regenerated = true; }
    if (!joined) judge = mainCandidates(proj).screens.map((x) => screenJudge(x));
    const scan = ngScan(P, { log: detail, words });
    const rows = cutRows(scan);
    const chapters = scan.script ? chapterRows(scan.script, scan.lineTime) : [];
    const missing = chapters.filter((c) => c.t == null);
    const chOk = chapters.filter((c) => c.t != null);
    const { order: orderTable, extra } = orderInfo(P, { clips, words, lines: scan.script?.lines, explicit: !!order, judge });
    const pre = [...mainWarn, ...extra, ...voiceNotice(P, clips), ...missing.map((c) => `章節「${c.title}」第一句「${c.first}」在逐字稿找不到 → 查 work/ng-scan.md 前後行的時間，補進章節空檔表`)];
    // 先寫表、預跑 ng-snap（它讀 cuts.md），把 ⚠ 寫進「需要你決定」
    const waits = waitRows(P, clips, words);
    fs.writeFileSync(cutsFile, `${cutsMarkdown({ rows, chapters: chOk, order: orderTable, decide: [], waits })}${CUTS_DRAFT}\n`);
    const snap = ngSnap(P, { edit: level.edit, margin: flags.margin ?? CUT.margin, v1: flags.v1 ?? null, log: detail });
    const decide = decideList(rows, snap.warnings, pre);
    writeAtomic(cutsFile, cutsMarkdown({ rows, chapters: chOk, order: orderTable, decide, waits }));
    const real = scan.outside.filter((u) => u.real).length, heard = scan.outside.length - real;
    const pending = rows.filter((r) => r.pending).length;
    const nFill = rows.filter((r) => /^贅字/.test(r.reason)).length;
    cutsLine = `✓ 剪輯清單：work/cuts.md（NG ${rows.length} 列，其中待確認 ${pending} 列${waits.length ? `；邊錄邊講的等待 ${waits.length} 處，預設不勾` : ''}${chOk.length ? `；章節 ${chOk.length} 章` : ''}${nFill ? `；贅字 ${nFill} 處，預設不勾` : ''}）${scan.script ? `；講稿外 ${real} 處列進清單${heard ? `、${heard} 處字數接近是 whisper 聽錯（沒列，明細 work/ng-scan.md）` : ''}` : '；沒有講稿：相鄰句相似度找的候選，全部待確認'}`;
  }

  // 要使用者決定的事（細節都在 cuts.md）：剪輯清單那一行和這幾行放進最後的回報段（A3），不在前面先印一次
  const need = parseDecide(fs.readFileSync(cutsFile, 'utf8'));
  const needLines = !need.length ? [] : [
    `需要你決定 ${need.length} 項（work/cuts.md 最後一節）：`,
    ...need.slice(0, 6).map((d) => `- ${d.length > 160 ? `${d.slice(0, 160)}…` : d}`),
    ...(need.length > 6 ? [`- …還有 ${need.length - 6} 項`] : []),
  ];

  // 素材清單（A10）：之後 status.mjs 比對，素材被換掉或搬走才提醒得到。只是提醒用，寫不成不擋流程
  try { writeManifest(proj); } catch (e) { detail(`素材清單沒寫成（${e.message}）`); }

  // 「不用停」：待確認的列不剪、紀錄略過
  if (flags['skip-stop']) {
    say(cutsLine);
    for (const l of needLines) say(l);
    const text = fs.readFileSync(cutsFile, 'utf8');
    const off = Object.fromEntries(parseCutsMd(text).ng.filter((r) => r.pending).map((r) => [r.row, false]));
    if (Object.keys(off).length) writeAtomic(cutsFile, setCutChecks(text, off));
    appendStop(proj, { stop: STOP1, state: '略過', said: saidOf(flags), back: 'work/cuts.md' });
    say(`⏭ 停點 ① 略過：cuts.md 打勾的列照剪，待確認的 ${Object.keys(off).length} 列不剪`);
    for (const l of next('輸出初剪、字幕、剪接點', cmdLine('media.mjs', ['rough', '--project', pj]))) say(l);
    return 0;
  }

  // 剪輯清單頁
  let url = 'work/cuts.md';
  if (!flags['no-editor']) {
    const page = openCutsPage(P, flags, detail);
    if (page.url) url = page.url;
    else say(`⚠ 剪輯清單頁沒開成功，網址改給 work/cuts.md（請使用者直接改「剪」欄）：\n${page.why}`);
  }
  const last = lastStop1(proj);
  if (regenerated && last === '待回覆') appendStop(proj, { stop: STOP1, state: '修改後重停', said: saidOf(flags), back: 'work/cuts.md' });
  if (regenerated || last !== '待回覆') appendStop(proj, { stop: STOP1, state: '待回覆' });
  for (const l of report([cutsLine, ...needLines], { stop: stopLines.cuts(url) })) say(l);
  return 0;
}

// ---------- rough：① 通過後一條指令到字幕與剪接點 ----------
const roughKeyFile = (work) => path.join(work, '.cache', 'rough-key.json');
const roughDoneFile = (work) => path.join(work, '.cache', 'rough-done.json');
function roughKey(snap, edit, margin) {
  const st = fs.statSync(snap.src);
  return JSON.stringify({ src: path.basename(snap.src), size: st.size, mtimeMs: Math.round(st.mtimeMs), edit, margin, cutOut: snap.cutOut, addIn: snap.addIn });
}

async function autoEditor(args, { onSpawn = null } = {}) {
  let r = await spawnP('auto-editor', args, { env: cleanEnv(), tail: 4000, onSpawn });
  // Windows：裝成 auto-editor.cmd 包裝檔時不帶 shell 會 ENOENT
  if (r.error?.code === 'ENOENT' && process.platform === 'win32') r = await spawnP('auto-editor', args.map((x) => `"${x}"`), { env: cleanEnv(), tail: 4000, shell: true });
  if (r.error?.code === 'ENOENT') throw new Error('找不到 auto-editor → 照 setup/ 的手冊安裝');
  if (r.status !== 0) {
    throw aeFailure(r, '；第二次還失敗就停下來回報這段訊息');
  }
  return r;
}

// 輸出 rough.mp4 和 --export v1 同時跑；都成功才換上正式檔名（中途被砍不會留下半支）
async function cutRough(P, snap, edit, margin, detail) {
  const work = path.join(P.project, 'work');
  const tmpMp4 = tmpFor(path.join(work, 'rough.mp4')), tmpV1 = tmpFor(path.join(work, 'cuts.v1.json'));   // 檔名帶 pid：上一次的 auto-editor 還在寫也不會寫到同一個檔
  sweepTmp(work);
  const base = aeArgs({ src: relPath(snap.src), edit, margin, cutOut: snap.cutOut, addIn: snap.addIn });
  detail(`auto-editor ${base.join(' ')}`);
  const kids = [], onSpawn = (c) => kids.push(c);
  const both = [
    autoEditor([...base, '-o', relPath(tmpMp4), '--no-open', '--progress', 'none'], { onSpawn }),
    autoEditor([...base, '--export', 'v1', '-o', relPath(tmpV1), '--progress', 'none'], { onSpawn }),
  ];
  try { await Promise.all(both); } catch (e) {
    // 一支失敗，另一支不能留著繼續跑
    for (const c of kids) { try { c.kill(); } catch { /* 已經走了 */ } }
    await Promise.allSettled(both);
    for (const f of [tmpMp4, tmpV1]) fs.rmSync(f, { force: true });
    throw e;
  }
  fs.renameSync(tmpV1, path.join(work, 'cuts.v1.json'));
  fs.renameSync(tmpMp4, path.join(work, 'rough.mp4'));
}

// 剪掉比例：拿掉 --preview 之後唯一的「剪太多」防線
export function cutStats(v1, fps, mainDur, roughDur, cutOut = []) {
  const removed = v1.chunks.filter((c) => c[2] >= 99999);
  const ngSec = cutOut.reduce((n, [a, b]) => n + (b - a), 0);
  const total = Math.max(0, mainDur - roughDur);
  const pauseSec = Math.max(0, total - ngSec);
  const pauseRatio = mainDur - ngSec > 0 ? pauseSec / (mainDur - ngSec) : 0;
  const ratio = mainDur > 0 ? total / mainDur : 0;
  return { segments: removed.length, ngSec, pauseSec, ratio, pauseRatio, high: pauseRatio > ROUGH_WARN.pause || ratio > ROUGH_WARN.total };
}

function verifyChild(P, flags) {
  const args = [MEDIA, 'verify-rough', '--project', P.project, ...(flags.template ? ['--template', flags.template] : [])];
  return spawnP(process.execPath, args, { env: cleanEnv(), cwd: process.cwd() });
}

export async function roughFlow(P, flags = {}) {
  const proj = P.project, work = path.join(proj, 'work'), pj = relPath(proj);
  const say = console.log, warns = [];
  fs.mkdirSync(work, { recursive: true });
  const detail = detailLog(proj, 'rough');
  const f = {
    cuts: path.join(work, 'cuts.md'), main: path.join(work, 'main.mp4'), rough: path.join(work, 'rough.mp4'), v1: path.join(work, 'cuts.v1.json'),
    srt: path.join(work, 'rough.srt'), points: path.join(work, 'cutpoints.json'), mainTj: path.join(work, 'transcript-main.json'), tj: path.join(work, 'transcript.json'), script: path.join(proj, '講稿.md'),
  };
  if (!exists(f.cuts)) throw new Error(`找不到 work/cuts.md → 先跑 node shared/template/tools/media.mjs prep --project ${pj}`);
  if (jobState(proj, 'prep').state === 'running') throw new Error(`media.mjs prep 還在背景跑 → 等它跑完到停點 ①：node shared/template/tools/media.mjs prep --project ${pj}`);
  // 做完了嗎：rough 走到底會留標記；舊流程做的看 cutpoints.json 有沒有比 rough.mp4 新
  const finished = exists(f.rough) && exists(f.srt) && exists(f.points) && (mtime(roughDoneFile(work)) >= mtime(f.rough) - 1000 || mtime(f.points) >= mtime(f.rough) - 1000);
  if (finished && !flags.again) throw new Error(`初剪已經做完了（work/rough.mp4、rough.srt、cutpoints.json 都在）→ 先問使用者要不要重剪（字幕會重排，在剪輯台改過的字幕會被蓋掉，舊檔有備份）；要重剪跑 node shared/template/tools/media.mjs rough --project ${pj} --again`);
  const edit = flags.edit ?? editForLevel(path.join(work, 'main.mp4')).edit, margin = flags.margin ?? CUT.margin;

  // NG 對齊停頓
  const cutsText = fs.readFileSync(f.cuts, 'utf8');
  const snap = ngSnap(P, { edit, margin, log: detail });
  for (const w of snap.warnings) if (!cutsText.includes(w.slice(0, 40))) warns.push(w);
  const cm = parseCutsMd(cutsText);
  // 輸出初剪：參數和清單都沒變就沿用（重跑只補後面沒做完的）
  const key = roughKey(snap, edit, margin);
  let keyWas = null;
  try { keyWas = fs.readFileSync(roughKeyFile(work), 'utf8').trim(); } catch { keyWas = null; }
  // 舊流程做的 rough.mp4 沒有紀錄：沒說要重剪就當是這份清單剪的，接著把後面做完
  const sameCut = exists(f.rough) && exists(f.v1) && (keyWas === key || (keyWas == null && !flags.again));
  if (exists(f.rough) && !sameCut && !flags.again) throw new Error(`work/rough.mp4 已經存在，但和現在的剪輯清單或參數不同 → 先問使用者要不要重剪（會蓋掉）；要重剪跑 node shared/template/tools/media.mjs rough --project ${pj} --again`);
  fs.rmSync(roughDoneFile(work), { force: true });
  // ① 通過（紀錄最後一列還是待回覆才記）
  if (['待回覆', '修改後重停'].includes(lastStop1(proj))) appendStop(proj, { stop: STOP1, state: '通過', said: saidOf(flags), back: 'work/cuts.md' });
  say(`✓ NG 對齊停頓：剪 ${snap.cutOut.length} 段${snap.addIn.length ? `、保留 ${snap.addIn.length} 段停頓` : ''}（cuts.md 打勾 ${cm.ng.filter((r) => r.cut).length} 列、不剪 ${cm.ng.filter((r) => !r.cut).length} 列）`);
  const t0 = Date.now();
  if (sameCut) say('✓ 初剪：work/rough.mp4 參數和清單都沒變，沿用');
  else {
    await cutRough(P, snap, edit, margin, detail);
    fs.mkdirSync(path.dirname(roughKeyFile(work)), { recursive: true });
    fs.writeFileSync(roughKeyFile(work), `${key}\n`);
    say(`✓ 初剪：work/rough.mp4、work/cuts.v1.json（用 ${secs(Date.now() - t0)}s）`);
  }
  const mainInfo = probeMedia(f.main), roughInfo = probeMedia(f.rough);
  const v1 = readV1(f.v1);
  const fps = roughInfo.fps || 30;
  const st = cutStats(v1, fps, mainInfo.duration ?? 0, roughInfo.duration ?? 0, snap.cutOut);
  if (st.high) warns.push(`⚠ 剪掉比例過高：${clock(mainInfo.duration ?? 0)} → ${clock(roughInfo.duration ?? 0)}（剪掉 ${Math.round(st.ratio * 100)}%：NG ${Math.round(st.ngSec)}s、停頓 ${Math.round(st.pauseSec)}s）→ 你聽不到聲音，不要自己分析音訊：把這行貼給使用者，請他在字幕預覽聽開頭 1 分鐘，照常往下做；他說尾音或小聲的字被切掉才重跑 node shared/template/tools/media.mjs rough --project ${pj} --edit "audio:-26dB" --again（還切到就 -30dB）；錄影裡本來就有很長的空檔就不用改`);

  // 檢查黑畫面、逐字稿（沒講稿或要重轉時）、只有聲音的區間：同時跑
  const hasScript = exists(f.script);
  const canMap = hasScript && !flags.retranscribe && !flags.transcript && exists(f.mainTj) && mtime(f.mainTj) >= mtime(f.main) - 1000 && tjMappable(work);
  let child = null;
  let oldCues = null;
  const srtBefore = exists(f.srt) ? fs.readFileSync(f.srt, 'utf8') : null;
  if (!canMap && exists(f.srt) && !flags.transcript) {
    fs.copyFileSync(f.srt, backupName(f.srt, 'transcribe'));
    oldCues = srtBefore;
  }
  const clips = (() => { try { return JSON.parse(fs.readFileSync(path.join(work, 'main.json'), 'utf8')).clips || []; } catch { return []; } })();
  const voiceClips = clips.some((c) => c.kind === 'voice' || c.kind === 'screen');
  const indexed = exists(path.join(work, 'media', 'index.json'));
  const whisperTask = canMap ? null : flags.transcript ? Promise.resolve(useTranscript(P, flags.transcript)) : whisper(P, f.rough, { srt: f.srt, onSpawn: (c) => { child = c; } });
  whisperTask?.catch(() => {});   // 等 verify 的時候 whisper 先失敗：後面 await 才處理，這裡不算沒接住
  const voiceTask = indexed ? (voiceClips ? blackDetectBg(f.rough, blackCacheOf(P)) : Promise.resolve([])).catch(() => null) : Promise.resolve(null);
  const verify = await verifyChild(P, flags);
  detail(verify.stdout, verify.stderr);
  if (verify.error) throw verify.error;
  const verifyOut = String(verify.stdout || '');
  if (verify.status !== 0) {
    child?.kill();
    if (whisperTask) await whisperTask.catch(() => null);
    const lines = verifyOut.split(/\r?\n/);
    const at = lines.findIndex((l) => l.startsWith('✖'));
    say(at >= 0 ? lines.slice(at).filter(Boolean).join('\n') : `✖ verify-rough 失敗：${String(verify.stderr).trim().slice(-300)}`);
    try { fs.rmSync(roughKeyFile(work), { force: true }); } catch { /* 下次重剪就好 */ }
    say(`細節：${relPath(detail.file)}`);
    for (const l of next(/解碼有錯/.test(verifyOut) ? '重新輸出初剪（紀錄已清掉，這次會真的重剪）' : '照上面第 1 步重接主軌後，第 2–4 步可以用這一條', cmdLine('media.mjs', ['rough', '--project', pj, '--again']))) say(l);
    return 1;
  }
  const verifyLine = verifyOut.split(/\r?\n/).find((l) => l.startsWith('✓')) || '✓';
  say(`✓ 檢查：${verifyLine.replace(/^✓\s*/, '')}`);

  // 逐字稿 → work/transcript.json（rough.mp4 的秒數）
  if (canMap) {
    const ngRanges = cm.ng.filter((r) => r.cut).map((r) => [r.start, r.end]);
    const mainWords = parseWords(fs.readFileSync(f.mainTj, 'utf8'), 'work/transcript-main.json');
    const m = mapWords(mainWords, v1, v1FpsOf(v1, fps), { ngRanges });
    fs.writeFileSync(f.tj, JSON.stringify(m.words, null, 1) + '\n');
    if (!exists(f.srt)) fs.writeFileSync(f.srt, formatSrt(utterances(m.words).map((u, i) => ({ n: i + 1, start: u.start, end: Math.max(u.end, u.start + 0.01), text: u.text })), {}));
    say(`✓ 逐字稿：main.mp4 那份換算成 rough.mp4 時間軸，不重轉（${m.words.length} 個詞；NG 裡的丟掉 ${m.dropped} 個${m.collapsed ? `、落在剪掉範圍的重排 ${m.collapsed} 個` : ''}）`);
  } else {
    const r = await whisperTask;
    if (flags.transcript && !exists(f.srt)) fs.writeFileSync(f.srt, formatSrt(utterances(r.words).map((u, i) => ({ n: i + 1, start: u.start, end: Math.max(u.end, u.start + 0.01), text: u.text })), {}));
    say(`✓ 逐字稿：對 rough.mp4 轉（${lineOfWhisper(r)}${hasScript ? '' : '；沒有講稿'}）`);
  }

  // 字幕
  const planFile = path.join(work, 'hyperframes', 'plan.json');
  const res = srtAlign(P, { remapPlan: !!flags['remap-plan'], max: captionMax(P, flags.max, detail), log: detail, remapFrom: oldCues && exists(planFile) ? parseSrt(oldCues) : null });
  for (const w of res.warnings || []) warns.push(w);
  say(`✓ 字幕：work/rough.srt（${res.cues.length} 則${hasScript ? '，照講稿' : ''}）`);

  // 剪接點
  const cp = cutpoints(P, { log: detail });
  // 剪接點有沒有把字切一半（聽兩側的音量）：只提醒，不擋流程
  try { const cc = cutCheck(P, { log: detail }); if (cc.bad?.length) say(`⚠ ${cc.bad.length} 個剪接點可能把字切一半（${cc.bad.slice(0, 3).map((x) => clock(x.at)).join('、')}${cc.bad.length > 3 ? '…' : ''}）→ 明細：node shared/template/tools/media.mjs cut-check --project ${path.relative(process.cwd(), P.project).split(path.sep).join('/')}`); } catch (e) { detail(`cut-check 略過：${e.message}`); }
  for (const w of cp.warnings || []) warns.push(w);
  const nNg = cp.cuts.filter((c) => c.kind === 'ng').length;
  say(`✓ 剪接點：work/cutpoints.json（${cp.cuts.length} 個）`);

  // 邊錄邊講的螢幕錄影
  let syncLine = null;
  if (clips.some((c) => c.kind === 'screen')) {
    const ss = screenSync(P, { log: detail });
    syncLine = `螢幕錄影同步 ${ss.segments.length} 段（work/screen-sync.json；寫好 plan.json 草稿後再跑 node shared/template/tools/media.mjs screen-sync --project ${pj} --write-plan）`;
    say(`✓ ${syncLine}`);
  }

  // 只有聲音的區間（已經掃過素材才更新 index.md）
  const voiceOnly = await voiceTask;
  if (indexed && voiceOnly) refreshVoiceOnly(P, voiceOnly);

  fs.mkdirSync(path.dirname(roughDoneFile(work)), { recursive: true });
  fs.writeFileSync(roughDoneFile(work), `${key}\n`);

  // 結尾：Skill 回報要的數字，整段是回報段（A3）；摘要要 AI 寫完才有，留一行提示
  const removed = st.segments;
  // 其他 ⚠（剪掉比例過高這類）照舊印在回報段前面：每則自己寫了要不要貼給使用者
  for (const w of warns.filter((x) => !(res.warnings || []).includes(x))) say(w);
  const preview = openRoughPreview(P, flags, detail);
  const lines = [
    `初剪完成：原始 ${(mainInfo.duration ?? 0).toFixed(2)}s → 初剪 ${(roughInfo.duration ?? 0).toFixed(2)}s，剪掉 ${removed} 段（NG ${snap.cutOut.length} 段；剪掉 ${Math.round(st.ratio * 100)}%）`,
    `srt-align：${res.summary}；⚠：${(res.warnings || []).length ? (res.warnings || []).join(' ') : '無'}`,
    `剪接點 ${cp.cuts.length} 個：ng ${nNg}、pause ${cp.cuts.length - nNg}（表在 work/.jobs/rough-detail.log、work/cutpoints.json）`,
    `驗證：work/rough.mp4 → ${(roughInfo.duration ?? 0).toFixed(2)}s、${roughInfo.width}×${roughInfo.height}；verify-rough → ${verifyLine}`,
    ...(preview.url ? [`字幕預覽：${preview.url}（字幕疊在畫面上，只有聲音的黑屏也看得到；錯字直接改，會自動存）`] : []),
    `摘要：（寫好 work/摘要.md、跑 node shared/template/tools/status.mjs --project ${pj} --summary 之後，把它印的 ✓ 那一行換到這裡）`,
  ];
  for (const l of report(lines, { assets: [f.rough] })) say(l);
  // 不用等使用者再說一次：status.mjs 會印下一條（有素材先盤點；主軌沒有真人畫面就跳過構圖）。使用者明說只要「剪乾淨」才停在這裡
  for (const l of next(`接著做（有素材先盤點，${clips.some((c) => c.kind === 'camera') ? '再到 ② 構圖' : '主軌沒有真人畫面，不用構圖'}；使用者明說只要「剪乾淨」才停在這裡）`, cmdLine('status.mjs', ['--project', pj]))) say(l);
  return 0;
}

// ---------- cuts：停點 ① 使用者指名改哪幾列（「第 3 列不要剪」） ----------
// 列號＝剪輯清單頁每列的號碼＝parseCutsMd 的 row（NG 表、等待表由上往下連號）；只改「剪」欄，和頁面勾選走同一個 setCutChecks
export function parseRowList(s, flag) {
  const out = [];
  for (const part of String(s ?? '').split(/[,，、\s]+/).map((x) => x.replace(/^#|^第|列$/g, '')).filter(Boolean)) {
    const m = part.match(/^(\d+)(?:[-–~](\d+))?$/);
    if (!m) throw new Error(`--${flag} 要寫列號（例 3,5 或 3-5），「${part}」看不懂`);
    const a = +m[1], b = m[2] != null ? +m[2] : a;
    for (let n = Math.min(a, b); n <= Math.max(a, b); n++) out.push(n);
  }
  return [...new Set(out)];
}

export function cutsCli(P, flags) {
  const proj = P.project, pj = relPath(proj), work = path.join(proj, 'work');
  const file = path.join(work, 'cuts.md');
  const keep = flags.keep != null ? parseRowList(flags.keep, 'keep') : [];
  const cut = flags.cut != null ? parseRowList(flags.cut, 'cut') : [];
  if (!keep.length && !cut.length) throw new Error(`要寫改哪幾列 → 不剪：--keep 3,5；要剪：--cut 7（列號是剪輯清單頁每列的號碼），例 node shared/template/tools/media.mjs cuts --project ${pj} --keep 3 --said "第 3 列不要剪"`);
  const both = keep.filter((n) => cut.includes(n));
  if (both.length) throw new Error(`第 ${both.join('、')} 列同時寫在 --keep 和 --cut → 一列只放一邊`);
  if (!exists(file)) throw new Error(`找不到 work/cuts.md → 先跑 node shared/template/tools/media.mjs prep --project ${pj}`);
  if (jobState(proj, 'prep').state === 'running') throw new Error(`media.mjs prep 還在背景跑（cuts.md 可能會重寫）→ 等它跑完到停點 ①：node shared/template/tools/media.mjs prep --project ${pj}`);
  // 剪輯清單頁在初剪之後也變成唯讀：這裡跟著擋，改勾選要連初剪一起重做
  if (exists(path.join(work, 'rough.mp4'))) throw new Error(`初剪已經輸出了（work/rough.mp4），這份清單現在只能看 → 先問使用者要不要重剪（字幕會重排）；要的話改好 work/cuts.md 那幾列的「剪」欄，再跑 node shared/template/tools/media.mjs rough --project ${pj} --again`);
  const text = fs.readFileSync(file, 'utf8');
  const cm = parseCutsMd(text);
  const rows = new Map(cm.ng.map((r) => [r.row, r]));
  const bad = [...keep, ...cut].filter((n) => !rows.has(n));
  if (bad.length) throw new Error(`剪輯清單沒有第 ${bad.join('、')} 列 → ${cm.ng.length ? `現在是第 1–${cm.ng.length} 列（剪輯清單頁每列的號碼）` : 'work/cuts.md 的 NG 表是空的，沒有能改的列'}`);
  const checks = Object.fromEntries([...keep.map((n) => [n, false]), ...cut.map((n) => [n, true])]);
  const next = setCutChecks(text, checks);
  if (next !== text) writeAtomic(file, next);
  const changed = Object.entries(checks).filter(([n, on]) => rows.get(+n).cut !== on).map(([n]) => +n);
  const fmt = (ns) => ns.map((n) => `第 ${n} 列（${clock(rows.get(n).start)}–${clock(rows.get(n).end)}）`).join('、');
  const parts = [keep.length ? `${fmt(keep)}不剪` : '', cut.length ? `${fmt(cut)}要剪` : ''].filter(Boolean);
  appendStop(proj, { stop: STOP1, state: '修改後重停', said: saidOf(flags), back: 'work/cuts.md' });
  const after = parseCutsMd(next).ng;
  let url = 'work/cuts.md';
  if (!flags['no-editor']) {
    const page = openCutsPage(P, flags, () => {});
    if (page.url) url = page.url;
    else console.log(`⚠ 剪輯清單頁沒開成功，網址改給 work/cuts.md（請使用者直接改「剪」欄）：\n${page.why}`);
  }
  const lines = [
    `✓ 剪輯清單：${parts.join('；')}${changed.length ? '' : '（本來就是這樣，cuts.md 沒有改）'}（work/cuts.md）`,
    `現在 ${after.length} 列：剪 ${after.filter((r) => r.cut).length} 列、不剪 ${after.filter((r) => !r.cut).length} 列`,
  ];
  for (const l of report(lines, { stop: stopLines.cuts(url) })) console.log(l);
  return 0;
}

// ---------- 指令入口 ----------
// 還在跑時印可以直接貼的同一條指令（「→ 下一步」的下一行）：flowCli 只從 media.mjs 進來，指令照 cmdLine 組（路徑有空白也能貼）
const sameCommand = () => cmdLine('media.mjs', process.argv.slice(2));

export async function flowCli(cmd, P, flags) {
  const wait = flags.wait != null ? Number(flags.wait) : undefined;
  if (flags.wait != null && !(wait >= 0)) throw new Error(`--wait 要是秒數（0 ＝開了就回），現在是「${flags.wait}」`);
  const scanFlow = async () => {
    const t0 = Date.now();
    const j = await scanMedia(P);
    console.log(scanSummary(j, secs(Date.now() - t0)));
    return j.files.length && j.files.every((x) => x.error) ? 1 : 0;
  };
  const flow = { prep: () => prepFlow(P, flags), rough: () => roughFlow(P, flags), transcribe: () => transcribeFlow(P, flags), scan: scanFlow }[cmd];
  const run = async () => {
    try { return await flow(); } catch (e) {
      console.log(`✖ ${e.message}`);
      if (cmd === 'prep' || cmd === 'rough') console.log(`細節：${relPath(path.join(P.project, 'work', '.jobs', `${cmd}-detail.log`))}`);
      return 1;
    }
  };
  // scan、transcribe 只印結果一行：「在背景跑」那行不印
  const log = cmd === 'scan' || cmd === 'transcribe' ? (l) => { if (!/在背景跑，log/.test(l)) console.log(l); } : console.log;
  const code = await runJob({ project: P.project, name: cmd, run, log, retryFailed: !!flags.again, ...(wait != null ? { waitSec: wait } : {}) });
  if (code === STILL_RUNNING) console.log(sameCommand());
  // 主代理同一條連續沒過幾次就停手（A4）：只在前景算一次（背景子行程也會走到這裡）；還在跑（75）不算
  else if ((cmd === 'prep' || cmd === 'rough') && !isJobChild(cmd)) {
    const t = mainTry(P.project, cmd, code === 0);
    if (t.stop) console.log(stopLine(t.n, `media.mjs ${cmd} `));
  }
  return code;
}
