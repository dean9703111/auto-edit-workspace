// 輸出完成影片的共用流程：剪輯台按鈕（editor/server/export.mjs）和 CLI（deliver.mjs）走同一份。零依賴。
//   重新產生 → 測試片段（4 秒，確認有畫面和聲音）→ 整支 render 到暫存檔 → 成功才換成 output/final.mp4 → qc.mjs final；失敗或取消不動舊檔。
//   只改了幾段（lib/incremental.mjs 判定是局部改動）：跳過測試片段和整支，只重畫改到的時間窗、接回上一支；不是局部就印一行原因、照常整支。
//   畫素與字幕（剪輯台的輸出選項、deliver.mjs --resolution 4k／--no-captions）：預設 1080p＋燒字幕；選了別的就不接手預先 render、不走增量，整支重新輸出。
//     4K：hyperframes render --resolution landscape-4k／portrait-4k（Chrome 用 2 倍 DPR 畫，不是放大）；不燒字幕：render 另外產生的 compositions/final-nocaps.html，
//     字幕另存 output/final.srt（build.mjs --nocaps 照畫面上實際顯示的時間寫）
//
//   runDeliver(P, job, deps)        跑上面的流程；進度寫在 job 上（newJob()），deps 可以注入假的 run／build／report 測流程
//   runPrerender(P, job, deps)      預先 render：低優先權 render 到 work/final-prerender.mp4，旁邊記指紋（work/final-prerender.json）
//   contentFingerprint(P, opts)     完成影片的內容由什麼決定（plan.json、rough.srt、合成、kit、assets、畫質）；同指紋＝render 出來一樣
//   prerenderInfo(P)／cancelPrerender(P)／prerenderBlocked(P)  預先 render 的狀態、取消（連 Chrome 一起收）、這台電腦該不該跑
//   finalIsCurrent(P, fp)           output/final.mp4 就是這個指紋 render 出來的（不用重做）
//   killTree(pid)                   收掉整棵行程樹。render 的 Chrome worker 各自開 process group（puppeteer 的 detached），只殺 group 會留孤兒
//   lockHolder(P)                   現在誰在輸出（剪輯台或 deliver.mjs；同時只能一個）
//   recordStopPassed(project, …)    停點紀錄記 ④ 通過（最後一列已經是通過就不重複）
//   cliDeps(P, job, opts)           CLI 用的 build、report（剪輯台用自己的 doBuild、getReport）
//
// 檔案：work/final-rendering.mp4（整支暫存）、work/final-prerender.part.mp4（預先 render 暫存）、work/final-fingerprint.json（final.mp4 的指紋）、
//       work/render.log（render 全文）、work/.jobs/deliver.lock（誰在輸出）、work/.jobs/render-<kind>.json（render 的 pid，收孤兒用）、
//       work/.jobs/final-content.json、prerender-content.json（那支影片當下的內容，增量比對用；沒有就整支）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { hfArgs, hfLocal } from './hf.mjs';
import { jobState, clearJob, STILL_RUNNING } from './job.mjs';
import { appendStop, progressFile } from './progress.mjs';
import { lookNeedsRun } from './look.mjs';
import { speakerGate } from './speaker.mjs';
import { designFileOf, isBlankDesign } from './custom-fill.mjs';
import { storyboardDirty } from './storyboard-state.mjs';
import { captureState, readState, writeState, diffStates, renderIncremental, NOT_IN_FINAL } from './incremental.mjs';
import { resolveFormat } from './canvas.mjs';

const TOOLS =path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOG_KEEP = 24000;
const RENDER_TAIL = 64 * 1024;   // render 的 stdout／stderr 只留尾巴（長片 log 有好幾 MB），全文在 work/render.log

export const STEPS = [['build', '更新預覽'], ['test', '測試片段（確認有聲音）'], ['render', '輸出整支影片'], ['qc', '驗收']];
export const TEST_SECONDS = 4;
export const QUALITY = 'looks';
export const FPS = 30;
// 輸出選項（剪輯台的選擇、deliver.mjs 的參數）：第一個是預設
export const RESOLUTIONS = ['1080p', '4k'];
export const CAPTIONS = ['burn', 'off'];
export const NOCAPS = { comp: 'compositions/final-nocaps.html', srt: 'final-nocaps.srt' };   // build.mjs --nocaps 產生在 work/hyperframes/
const FRAME_4K_BYTES = 1.2 * 1024 ** 2;   // 4K 一格的影格暫存（1080p 實測約 300 KB，4 倍像素）
export const isPlain = (o = {}) => (o.resolution || RESOLUTIONS[0]) === RESOLUTIONS[0] && (o.captions || CAPTIONS[0]) === CAPTIONS[0];
export const optionsLabel = (o = {}) => `${(o.resolution || RESOLUTIONS[0]) === '4k' ? '4K' : '1080p'}、${(o.captions || CAPTIONS[0]) === 'off' ? '不燒字幕，另存 output/final.srt' : '字幕燒進影片'}`;
export const PRERENDER = {
  workers: 2,                  // 2 個和 5 個差不多快、CPU 少一成多、成品的影音 md5 相同（deliver.mjs 檔頭有實測數字）
  nice: 10,                    // 低優先權：使用者在看預覽時讓路（Windows 略過）
  watchMs: 10_000,             // 每 10 秒看一次內容變了沒（使用者存檔就收掉，不白跑）
  stallMs: 15 * 60_000,        // 15 分鐘沒有進度＝卡住
  minCapMs: 30 * 60_000,       // 上限：片長 × 6，最少 30 分鐘
  capPerFilm: 6,
  minFreeBytes: 20 * 1024 ** 3,  // 磁碟剩不到 20 GB 不跑（render 中影格暫存在系統暫存資料夾，實測每格約 300 KB，30 分鐘約 16 GB，還要放成品）
  stopFreeBytes: 5 * 1024 ** 3,  // 跑到一半剩不到 5 GB 就收掉，不把磁碟塞爆
  minRamBytes: 8 * 1024 ** 3,    // 記憶體 8 GB 以下不跑（HyperFrames 在這種電腦已經只開單 worker）
};

const statOf = (f) => { try { return fs.statSync(f); } catch { return null; } };
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const rm = (f) => { try { fs.rmSync(f, { force: true }); } catch { /* 下次會覆寫 */ } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha1 = (b) => createHash('sha1').update(b).digest('hex');
const gb = (b) => (b / 1024 ** 3).toFixed(1);
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
function writeJson(f, o) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(`${f}.tmp`, `${JSON.stringify(o, null, 2)}\n`);
  fs.renameSync(`${f}.tmp`, f);
}

// YouTube 說明欄文字（025）：build --check --json 的 chapters（完成影片秒數 outStart）→ 章節時間戳；用了結尾配樂就附出處那一行。
// YouTube 的規則：第一行要從 0:00 開始、至少 3 個章節、每個至少 10 秒 → 不到 3 個就不寫章節（回傳 chapters: 0）；太近的（< 10 秒）併到前一個
export function youtubeText(j, { first = '開場' } = {}) {
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = (t) => { const s = Math.max(0, Math.floor(t)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`; };
  const list = [];
  for (const c of [...(j?.chapters || [])].filter((x) => x && x.title && Number.isFinite(x.outStart)).sort((a, b) => a.outStart - b.outStart)) {
    const last = list[list.length - 1];
    if (last && c.outStart - last.t < 10) continue;
    list.push({ t: c.outStart, title: String(c.title).trim() });
  }
  if (list.length && list[0].t >= 10) list.unshift({ t: 0, title: first });
  else if (list.length) list[0].t = 0;
  const lines = [];
  if (list.length >= 3) lines.push('章節（整段貼到 YouTube 說明欄）', ...list.map((c) => `${stamp(c.t)} ${c.title}`));
  const credit = j?.outro?.credit;
  if (credit) lines.push(...(lines.length ? [''] : []), '配樂出處（用了這首配樂，說明欄要保留這一行）', String(credit));
  return { text: lines.length ? `${lines.join('\n')}\n` : '', chapters: list.length >= 3 ? list.length : 0, credit: !!credit };
}

// build.mjs --check --json 的結果（章節、結尾配樂）；讀不到回傳 null
export function planCheckJson(P) {
  const r = spawnSync(process.execPath, [path.join(TOOLS, 'build.mjs'), '--project', P.project, '--check', '--json'], { cwd: P.root, encoding: 'utf8', maxBuffer: 1 << 28 });
  try { return JSON.parse(r.stdout); } catch { return null; }
}

export function deliverPaths(project) {
  const work = path.join(project, 'work'), output = path.join(project, 'output');
  return {
    final: path.join(output, 'final.mp4'), sheet: path.join(output, 'qc', 'qc-sheet.jpg'), clip: path.join(output, 'test-clips', 'test-clip.mp4'),
    srt: path.join(output, 'final.srt'), youtube: path.join(output, 'youtube.txt'), tmp: path.join(work, 'final-rendering.mp4'), log: path.join(work, 'render.log'), memo: path.join(work, 'final-fingerprint.json'),
    pre: path.join(work, 'final-prerender.mp4'), prePart: path.join(work, 'final-prerender.part.mp4'), preState: path.join(work, 'final-prerender.json'),
    lock: path.join(work, '.jobs', 'deliver.lock'), renderPid: (kind) => path.join(work, '.jobs', `render-${kind}.json`),
    finalContent: path.join(work, '.jobs', 'final-content.json'), preContent: path.join(work, '.jobs', 'prerender-content.json'),
  };
}

export const newJob = () => ({ running: true, step: 'build', percent: null, ok: null, canceled: false, message: '', fix: '', errors: [], warnings: [], log: '', startedAt: Date.now(), finishedAt: null, child: null, source: null, qc: null });

// ---------- 內容指紋 ----------

// 文字檔算內容（build 每次都會更新 index.html 的修改時間）；影片、圖片、音效算大小＋修改時間（長片 rough.mp4 好幾 GB，算內容太慢；重新編碼一定換時間，複製檔 build 不重寫）
const TEXT_EXT = new Set(['.html', '.css', '.js', '.mjs', '.json', '.srt', '.svg', '.txt', '.cube']);
const ROOT_FILES = ['index.html', 'hyperframes.json', 'meta.json', 'fx-kit.js'];
const RENDER_DIRS = ['compositions', 'kit', 'assets', 'illus-local'];

function listFiles(root, rel = '') {
  let names;
  try { names = fs.readdirSync(path.join(root, rel)).sort(); } catch { return []; }
  const out = [];
  for (const name of names) {
    if (name.startsWith('.')) continue;
    const r = rel ? `${rel}/${name}` : name;
    const st = statOf(path.join(root, r));
    if (st?.isDirectory()) out.push(...listFiles(root, r));
    else if (st) out.push(r);
  }
  return out;
}

export function contentFingerprint(P, { quality = QUALITY, fps = FPS, resolution = RESOLUTIONS[0], captions = CAPTIONS[0] } = {}) {
  const h = createHash('sha1');
  const add = (name, file) => {
    const st = statOf(file);
    if (!st) { h.update(`${name}:none\n`); return; }
    const text = TEXT_EXT.has(path.extname(file).toLowerCase()) && st.size < 16 * 1024 * 1024;
    h.update(`${name}:${text ? sha1(fs.readFileSync(file)) : `${st.size}:${Math.floor(st.mtimeMs)}`}\n`);
  };
  // 預設的畫素與字幕不寫進去：舊的 final.mp4、預先 render 的指紋照樣對得上
  h.update(`v1 quality=${quality} fps=${fps} hf=${hfLocal()?.version ?? '?'}${isPlain({ resolution, captions }) ? '' : ` res=${resolution} caps=${captions}`}\n`);
  add('plan.json', P.plan);
  add('rough.srt', P.srt);
  for (const f of ROOT_FILES) add(f, path.join(P.out, f));
  for (const d of RENDER_DIRS) for (const f of listFiles(P.out, d)) if (!NOT_IN_FINAL.test(f)) add(f, path.join(P.out, f));
  return h.digest('hex').slice(0, 16);
}

export function finalIsCurrent(P, fp) {
  const F = deliverPaths(P.project), memo = readJson(F.memo), st = statOf(F.final);
  return !!(memo && st && memo.fingerprint === fp && memo.size === st.size && memo.mtimeMs === Math.floor(st.mtimeMs));
}

// content：這支影片當下的內容（captureState）：下次改一段時拿來比，判斷能不能只重畫改到的地方
function writeMemo(P, fp, source, content = null) {
  const F = deliverPaths(P.project), st = statOf(F.final);
  if (!st) return;
  writeJson(F.memo, { fingerprint: fp, size: st.size, mtimeMs: Math.floor(st.mtimeMs), source, at: new Date().toISOString() });
  try { if (content) writeState(F.finalContent, { ...content, fingerprint: fp }); else rm(F.finalContent); } catch { /* 沒有紀錄就是下次整支 */ }
}

// ---------- 行程 ----------

function processTable() {
  const r = spawnSync('ps', ['-axo', 'pid=,ppid=,pgid=,stat='], { encoding: 'utf8', maxBuffer: 1 << 24 });
  if (r.status !== 0) return [];
  return r.stdout.split('\n').map((l) => l.trim().split(/\s+/)).filter((a) => a.length >= 4).map(([pid, ppid, pgid, stat]) => ({ pid: Number(pid), ppid: Number(ppid), pgid: Number(pgid), zombie: stat.startsWith('Z') }));
}

// root 的所有子孫（Chrome 自己一個 group，靠 ppid 找）＋同一個 process group 的（爸爸已經死了、被過繼的）
export function processTree(root, table = processTable()) {
  const out = new Set([root]);
  for (const p of table) if (p.pgid === root) out.add(p.pid);
  for (let grew = true; grew;) {
    grew = false;
    for (const p of table) if (out.has(p.ppid) && !out.has(p.pid)) { out.add(p.pid); grew = true; }
  }
  return out;
}

// HyperFrames 被取消時常常來不及刪影格暫存（系統暫存資料夾的 hf-render-*，owner.json 記著 pid；下一次 render 才會掃）。
// 長片有十幾 GB，取消的當下就刪；只刪主人是這次收掉、已經不在的行程的
function removeRenderTemp(pids, parents = [os.tmpdir()]) {
  for (const parent of parents) {
    let names;
    try { names = fs.readdirSync(parent); } catch { continue; }
    for (const name of names) {
      if (!/^(?:hf-render-|work-)/.test(name)) continue;
      const owner = readJson(path.join(parent, name, 'owner.json'));
      if (owner?.pid && pids.has(owner.pid) && !alive(owner.pid)) { try { fs.rmSync(path.join(parent, name), { recursive: true, force: true, maxRetries: 3 }); } catch { /* 下一次 render 會掃 */ } }
    }
  }
}

// 先 SIGTERM（Chrome、ffmpeg、render 都收得到）；graceMs 內沒走光才 SIGKILL。回傳 { pids, survivors }
export async function killTree(pid, { graceMs = 30_000, pollMs = 150 } = {}) {
  if (!pid) return { pids: [], survivors: [] };
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    return { pids: [pid], survivors: [] };
  }
  const seen = processTree(pid);
  seen.delete(process.pid);
  const send = (sig) => { for (const p of seen) { try { process.kill(p, sig); } catch { /* 已經走了 */ } } };
  const left = () => {
    const table = processTable();
    const live = new Set(table.filter((p) => !p.zombie).map((p) => p.pid));
    for (const p of [...seen]) if (live.has(p)) for (const q of processTree(p, table)) if (q !== process.pid && !seen.has(q)) { seen.add(q); try { process.kill(q, 'SIGTERM'); } catch { /* 已經走了 */ } }
    return [...seen].filter((p) => live.has(p));
  };
  const finish = () => { const survivors = left(); removeRenderTemp(seen); return { pids: [...seen], survivors }; };
  send('SIGTERM');
  const until = Date.now() + graceMs;
  while (Date.now() < until) {
    await sleep(pollMs);
    if (!left().length) return finish();
  }
  send('SIGKILL');
  for (let i = 0; i < 30; i++) {   // SIGKILL 一定會死，只是忙的時候要等一下
    await sleep(100);
    if (!left().length) return finish();
  }
  return finish();
}

// nice：低優先權（Chrome、ffmpeg 都繼承）；env 蓋過預設。stdout／stderr 留 tail 個字（0＝全留）
export function spawnRunner(job, { nice = 0 } = {}) {
  return (cmd, args, { cwd, onData, env, tail = 0, onSpawn } = {}) => new Promise((resolve) => {
    const low = nice && process.platform !== 'win32';
    const p = spawn(low ? 'nice' : cmd, low ? ['-n', String(nice), cmd, ...args] : args, { cwd, env: { ...process.env, AUTO_EDIT_JOB: undefined, FORCE_COLOR: '0', NO_COLOR: '1', ...env }, windowsHide: true });
    job.child = p;
    if (p.pid) onSpawn?.(p.pid);
    let stdout = '', stderr = '';
    const keep = (cur, d) => { const s = cur + d; return tail && s.length > tail ? s.slice(-tail) : s; };
    p.stdout.setEncoding('utf8');   // 中文切在兩塊之間才不會壞
    p.stderr.setEncoding('utf8');
    p.stdout.on('data', (d) => { stdout = keep(stdout, d); onData?.(d); });
    p.stderr.on('data', (d) => { stderr = keep(stderr, d); onData?.(d); });
    p.on('error', (e) => { job.child = null; resolve({ code: -1, stdout, stderr: stderr + e.message }); });
    p.on('close', (code) => { job.child = null; resolve({ code, stdout, stderr }); });
  });
}

// render 的 pid 記一份：工作行程被 SIGKILL 時 render 不會跟著走（背景模式不盯爸爸），下次開工前收掉
function rememberRender(P, kind, pid) { try { writeJson(deliverPaths(P.project).renderPid(kind), { pid }); } catch { /* 只是保險 */ } }
export async function reapRender(P, kind) {
  const f = deliverPaths(P.project).renderPid(kind), rec = readJson(f);
  rm(f);
  if (!rec?.pid || !alive(rec.pid) || process.platform === 'win32') return false;
  const cmd = spawnSync('ps', ['-o', 'command=', '-p', String(rec.pid)], { encoding: 'utf8' }).stdout || '';
  if (!/hyperframes/.test(cmd) || !/\brender\b/.test(cmd)) return false;   // pid 被別的程式重用了
  await killTree(rec.pid);
  return true;
}

// ---------- render 的輸出：只看進度，全文寫 log 檔 ----------

// HyperFrames 不是 TTY 時每一步印 `@hf-progress {"code":"capture","done":111,"total":120,"pct":67}`；沒有這一行就看進度條的「37%」。只往上走。
export function progressParser(onPercent) {
  let buf = '', best = -1, frames = null;
  return (chunk) => {
    buf += chunk;
    const lines = buf.split(/\r?\n/);
    buf = lines.pop();
    for (const l of lines) {
      let pct = null;
      const m = /^\s*@hf-progress\s+(\{.*\})/.exec(l);
      if (m) {
        try { const o = JSON.parse(m[1]); pct = o.pct ?? null; if (o.code === 'capture' && o.total) frames = o.total; } catch { /* 不是 JSON 就略過 */ }
      } else if (!/^\s*\[/.test(l)) {
        const hit = [...l.matchAll(/(\d{1,3})(?:\.\d+)?\s*%/g)].map((x) => Number(x[1])).filter((n) => n <= 100).pop();
        if (hit != null) pct = hit;
      }
      if (pct != null && pct > best) { best = pct; onPercent(pct, frames); }
    }
  };
}

const lastLine = (r) => `${r.stderr || ''}\n${r.stdout || ''}`.trim().split(/\r?\n/).filter(Boolean).pop()?.slice(0, 240) || `結束代碼 ${r.code}`;
function failLine(r) {
  const lines = `${r.stderr || ''}\n${r.stdout || ''}`.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('@hf-progress'));
  for (let i = lines.length - 1; i >= 0 && i >= lines.length - 40; i--) if (/error|fail|cancel|exception|✖/i.test(lines[i])) return lines[i].trim().slice(0, 240);
  return lastLine(r);
}

// render 讀不了底片：多半是底片檔壞了（以前中途被砍又重跑），重跑 render 沒有用，要重新編碼
function footageBroken(r, P) {
  if (!/VIDEO_SOURCE_UNRENDERABLE[\s\S]{0,200}assets\/rough\.mp4/.test(`${r.stderr || ''}\n${r.stdout || ''}`)) return null;
  return `底片（work/hyperframes/assets/rough.mp4）讀不了，多半是檔案壞了：跑 node shared/template/tools/build.mjs --project "${path.relative(P.root || process.cwd(), P.project)}" --reencode 重新編碼，再跑一次這條指令`;
}

// Mac：多個 worker 的截圖直接串給編碼器，不落地（長片每次少寫約 17 GB 暫存；實測成品 md5 相同、速度不變）。
// Linux 走 BeginFrame 時 HyperFrames 本來就會串流；Windows 沒實測，維持原樣
const CAPTURE_ENV = process.platform === 'darwin' ? { HF_CAPTURE_PARALLEL_STREAM: 'true' } : {};

// 一次 render：全文 append 到 logFile，stdout／stderr 只留尾巴
function hfRender(P, run, { args, logFile, title, env, kind, onChunk, cwd = P.out }) {
  try { fs.appendFileSync(logFile, `\n=== ${title}（${new Date().toISOString()}）===\n`); } catch { /* log 寫不進去不影響輸出 */ }
  return run(process.execPath, hfArgs(args), {
    cwd, env: { ...CAPTURE_ENV, ...env }, tail: RENDER_TAIL, onSpawn: kind ? (pid) => rememberRender(P, kind, pid) : undefined,
    onData: (s) => {
      try { fs.appendFileSync(logFile, s); } catch { /* 同上 */ }
      onChunk?.(s);
    },
  });
}

// ---------- 誰在輸出 ----------

// 鎖的主人還活著、而且真的是輸出的程式才算（當機、重開機後 pid 可能被別的程式重用）
const isOurs = (pid) => process.platform === 'win32' || pid === process.pid || /(?:deliver|editor)\.mjs/.test(spawnSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' }).stdout || '');
export function lockHolder(P) {
  const rec = readJson(deliverPaths(P.project).lock);
  return rec?.pid && alive(rec.pid) && isOurs(rec.pid) ? rec : null;
}
function takeLock(P, by) {
  const cur = lockHolder(P);
  if (cur && cur.pid !== process.pid) return cur;
  writeJson(deliverPaths(P.project).lock, { pid: process.pid, by, startedAt: Date.now() });
  return null;
}
function dropLock(P) {
  const f = deliverPaths(P.project).lock, rec = readJson(f);
  if (rec?.pid === process.pid) rm(f);
}

// ---------- 停點紀錄 ----------

function lastFourState(text) {
  const lines = String(text).split(/\r?\n/);
  const at = lines.findIndex((l) => /^##\s*停點紀錄\s*$/.test(l.trim()));
  if (at < 0) return null;
  const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  let head = null, iS = -1, iV = -1, state = null;
  for (let i = at + 1; i < lines.length && !/^##\s/.test(lines[i]); i++) {
    if (!lines[i].trim().startsWith('|')) continue;
    if (!head) { head = cells(lines[i]); iS = head.findIndex((c) => c.includes('停點')); iV = head.findIndex((c) => c.includes('狀態')); continue; }
    const c = cells(lines[i]);
    if (c[iS]?.includes('④') && c[iV]) state = c[iV];
  }
  return state;
}

// 沒有檔案或沒有表就不寫（回傳 false）；④ 最後一列已經是「通過」不重複
export function recordStopPassed(project, { said, when } = {}) {
  let text;
  try { text = fs.readFileSync(progressFile(project), 'utf8'); } catch { return false; }
  if (lastFourState(text) === '通過') return false;
  try { appendStop(project, { stop: '④ 完成影片預覽', state: '通過', said, back: 'output/final.mp4', when }); return true; } catch { return false; }
}

// ---------- 預先 render 的狀態 ----------

function readPreState(P) { return readJson(deliverPaths(P.project).preState); }

// { state: 'none'|'running'|'done'|'failed'|'stale'|'skipped', fingerprint, percent, … }：工作行程還活著才算 running
export function prerenderInfo(P) {
  const side = readPreState(P), js = jobState(P.project, 'prerender');
  if (js.state === 'running') return { fingerprint: null, percent: null, ...side, state: 'running', pid: js.pid };
  if (!side) return { state: 'none' };
  if (side.state === 'running') return { ...side, state: 'failed', reason: side.reason || '背景工作中途結束了' };
  if (side.state === 'done') {
    const st = statOf(deliverPaths(P.project).pre);
    if (!st || st.size !== side.size) return { ...side, state: 'failed', reason: '預先 render 的檔案不見了' };
  }
  return side;
}

function clearPrerenderFiles(P) {
  const F = deliverPaths(P.project);
  for (const f of [F.pre, F.prePart, F.preState, `${F.preState}.tmp`, F.preContent]) rm(f);
  clearJob(P.project, 'prerender');
}

export async function cancelPrerender(P, opts = {}) {
  const js = jobState(P.project, 'prerender');
  const res = js.state === 'running' ? await killTree(js.pid, opts) : { pids: [], survivors: [] };
  await reapRender(P, 'prerender');
  clearPrerenderFiles(P);
  return res;
}

// 專案和系統暫存資料夾（render 的影格放這裡）所在的磁碟，剩比較少的那個
function freeBytesOf(P) {
  const free = (d) => { try { const s = fs.statfsSync(d); return s.bavail * s.bsize; } catch { return Infinity; } };
  return Math.min(free(P.project), free(os.tmpdir()));
}

// 這台電腦不該跑預先 render 的原因；沒有就回 null
export function prerenderBlocked(P, { totalmem = os.totalmem(), freeBytes = freeBytesOf(P) } = {}) {
  if (totalmem <= PRERENDER.minRamBytes) return `記憶體 ${Math.round(totalmem / 1024 ** 3)} GB，背景 render 會讓預覽卡住`;
  if (freeBytes < PRERENDER.minFreeBytes) return `磁碟只剩 ${Math.round(freeBytes / 1024 ** 3)} GB（至少要 ${Math.round(PRERENDER.minFreeBytes / 1024 ** 3)} GB）`;
  return null;
}

async function probeStreams(run, file, cwd) {
  const probe = await run('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', file], { cwd });
  return (probe.stdout || '').split(/\r?\n/).map((s) => s.replace(/,/g, '').trim()).filter(Boolean);
}
const hasAv = (kinds) => kinds.includes('video') && kinds.includes('audio');

// ---------- 增量（lib/incremental.mjs）----------

const contentNow = (P, opts) => captureState(P, { quality: opts.quality, fps: opts.fps, hf: hfLocal()?.version ?? '?' });

// 上一支完成影片能不能當底：指紋紀錄對得上（手動蓋掉就不算）、也有當時的內容紀錄
function finalCandidate(P, now) {
  const F = deliverPaths(P.project), memo = readJson(F.memo), st = statOf(F.final), was = readState(F.finalContent);
  if (!memo || !st || !was || memo.size !== st.size || memo.mtimeMs !== Math.floor(st.mtimeMs) || was.fingerprint !== memo.fingerprint) return null;
  return { kind: 'final', file: F.final, diff: diffStates(was, now) };
}
function preCandidate(P, now, side) {
  const F = deliverPaths(P.project), st = statOf(F.pre), was = readState(F.preContent);
  if (side?.state !== 'done' || !st || st.size !== side.size || !was || was.fingerprint !== side.fingerprint) return null;
  return { kind: 'prerender', file: F.pre, diff: diffStates(was, now) };
}

// 拿哪一支舊檔來接：要重畫的最少的那支。回傳 { kind, file, diff }；有舊檔但都不是局部改動回 { reason }；沒有舊檔回 null
function pickBase(P, now, { preSide = readPreState(P) } = {}) {
  const all = [finalCandidate(P, now), preCandidate(P, now, preSide)].filter(Boolean);
  if (!all.length) return null;
  const ok = all.filter((c) => !c.diff.full);
  if (!ok.length) return { reason: all[0].diff.full };
  const size = (c) => c.diff.ranges.reduce((n, [a, b]) => n + b - a, 0);
  return ok.sort((x, y) => size(x) - size(y))[0];
}

// 還在跑（或做好了）的預先 render，和現在的內容只差局部改動：跑完補上就好，不用丟掉
export function prerenderCanPatch(P, opts = {}) {
  const was = readState(deliverPaths(P.project).preContent);
  if (!was) return false;
  return !diffStates(was, contentNow(P, { quality: opts.quality || QUALITY, fps: opts.fps || FPS })).full;
}

// 回傳 null（沒有舊檔、或要整支：原因已經印了）、{ same, pick }（畫面和聲音都沒變）、{ done }（dest 寫好了）
async function tryIncremental(P, job, { opts, run, say, percent, env, dest, kind, preSide, prefix = '' }) {
  const F = deliverPaths(P.project);
  const fp = contentFingerprint(P, opts), content = contentNow(P, opts);
  const pick = pickBase(P, content, { preSide });
  if (!pick) return null;
  if (pick.reason) { say(`${prefix}整支重新輸出：${pick.reason}`); return null; }
  if (!pick.diff.ranges.length && !pick.diff.audio) return { same: true, pick, fp, content };
  fs.mkdirSync(path.dirname(F.log), { recursive: true });
  fs.writeFileSync(F.log, '');
  job.step = 'render';
  percent(0);
  let r;
  try {
    r = await renderIncremental({
      hfDir: P.out, base: pick.file, diff: pick.diff, dest, run, env, quality: opts.quality, fps: opts.fps, onPercent: percent, isCanceled: () => job.canceled,
      say: (s) => say(`${prefix}${s}`),
      render: (args, o) => hfRender(P, run, { args, logFile: F.log, title: o.title, env: { ...env, ...o.env }, kind, cwd: o.cwd }),
    });
  } catch (e) { if (e.canceled) return null; throw e; }
  if (kind) rm(F.renderPid(kind));
  if (r.full) { rm(dest); say(`${prefix}整支重新輸出：${r.full}`); return null; }
  return { done: true, pick, fp, content };
}

// 接手預先 render：指紋相同且做完 → 回傳 { content }（已經搬成 final.mp4）；指紋相同還在跑 → 等；
// 指紋不同還在跑 → 局部改動而且沒有舊的完成影片可以接：等它跑完自己補上；其他取消舊的，回傳 false；做好了但指紋不同 → 留著當增量的底，回傳 false
async function takePrerender(P, job, { fp, opts, run, say, pollMs, onPercent }) {
  const F = deliverPaths(P.project);
  let waited = false;
  for (;;) {
    if (job.canceled) return false;
    const info = prerenderInfo(P);
    if (info.state === 'none') return false;
    if (info.state === 'running') {
      if (info.fingerprint && info.fingerprint !== fp) {
        const fromFinal = finalCandidate(P, contentNow(P, opts));
        if ((fromFinal && !fromFinal.diff.full) || !prerenderCanPatch(P, opts)) {
          say('內容和預先 render 開始時不一樣：取消舊的，重新輸出');
          await cancelPrerender(P);
          return false;
        }
        if (!waited) { say('預先 render 還在跑：跑完會自動補上這次的改動，接著等它'); waited = true; job.step = 'render'; job.percent = 0; }
        if (info.percent != null) onPercent(info.percent);
        await sleep(pollMs);
        continue;
      }
      if (!waited) { say('預先 render 還在跑、內容沒變：接著等它，不重新開始'); waited = true; job.step = 'render'; job.percent = 0; }
      if (info.percent != null) onPercent(info.percent);
      await sleep(pollMs);
      continue;
    }
    if (info.state === 'done' && info.fingerprint === fp) {
      const kinds = await probeStreams(run, F.pre, P.root);
      if (job.canceled) return false;
      if (hasAv(kinds)) {
        const content = readState(F.preContent);
        fs.mkdirSync(path.dirname(F.final), { recursive: true });
        fs.renameSync(F.pre, F.final);
        clearPrerenderFiles(P);
        return { content };
      }
      say(`預先 render 的檔案不完整（ffprobe 只看到：${kinds.join('、') || '沒有串流'}），重新輸出`);
    } else if (info.state === 'done') return false;   // 內容又改過：留著當增量的底（用不上的話，正式 render 前會清掉）
    else if (info.state === 'failed') say(`預先 render 沒有成功（${info.reason || '不明'}），重新輸出`);
    clearPrerenderFiles(P);
    return false;
  }
}

// ---------- 流程 ----------

// deps：build()、report()（必要）；run、say、said（停點紀錄的原話）、by（lock 名字）、quality、fps、force、renderEnv（render 的環境變數）、pollMs、onPercent
// 輸出了也是白做的情況（--review 也擋，這裡擋跳過 --review、或在剪輯台直接按輸出）：驗收只看影音，看不出這兩件事
//   內容設計動畫還是空白畫布：占位字會進成品；分鏡表有改動還沒套回：使用者改的字不會出現在成品
export function deliverBlocker(P) {
  const blanks = (readJson(P.plan)?.scenes || []).filter((s) => {
    if (!s?.design || !s.id) return false;
    let html = null;
    try { html = fs.readFileSync(path.join(P.out, designFileOf(s)), 'utf8'); } catch { /* 還沒有檔也算沒做 */ }
    return isBlankDesign(html);
  }).map((s) => s.id);
  if (blanks.length) return { message: `內容設計動畫還沒做：${blanks.join('、')}（畫面還是空白畫布，上面只有占位字）。`, fix: `一段派一個設計師，派工訊息只送 node shared/template/tools/status.mjs --project "${path.relative(P.root || process.cwd(), P.project)}" 印的那一行（先載入 hyperframes skill，再照 design-build.md 做），全部做完再輸出；這段不做動畫就在 plan.json 改用模板或拿掉` };
  if (storyboardDirty(P)) return { message: '分鏡表（work/storyboard.md）有改動還沒套回 plan.json，現在輸出會漏掉那些改動。', fix: `先跑 node shared/template/tools/build.mjs --project "${path.relative(P.root || process.cwd(), P.project)}" --apply-storyboard，再輸出；確定不要那些改動才用 --storyboard --force 重新產生分鏡表` };
  return null;
}

export async function runDeliver(P, job, deps) {
  const F = deliverPaths(P.project);
  const run = deps.run || spawnRunner(job);
  const say = deps.say || (() => {});
  const opts = { quality: deps.quality || QUALITY, fps: deps.fps || FPS, resolution: deps.resolution || RESOLUTIONS[0], captions: deps.captions || CAPTIONS[0] };
  const plain = isPlain(opts), nocaps = opts.captions === 'off', is4k = opts.resolution === '4k';
  job.options = { resolution: opts.resolution, captions: opts.captions };
  const addLog = (s) => { job.log = (job.log + s).slice(-LOG_KEEP); };
  const fail = (message, errors = [], fix = '') => { job.ok = false; job.message = message; job.errors = errors; job.fix = fix; };
  const nodeTool = (name, args) => run(process.execPath, [path.join(TOOLS, name), ...args], { cwd: P.root, onData: addLog });
  // pctStart：第一次有百分比的時間，頁面用它算剩餘時間（接手預先 render 時不是從 0 開始）
  const percent = (p) => { job.percent = p; job.pctStart ??= { t: Date.now(), p }; deps.onPercent?.(p); };
  let holder = null, locked = false;
  try {
    holder = takeLock(P, deps.by || 'cli');
    locked = !holder;
    if (holder) return fail(holder.by === 'editor' ? '剪輯台正在輸出完成影片。' : 'AI 正在背景輸出完成影片。', [], holder.by === 'editor' ? '等它跑完或在剪輯台按取消，再跑一次' : '等它跑完，或跑 deliver.mjs --cancel 再輸出');
    await reapRender(P, 'final');
    const blocked = deliverBlocker(P);
    if (blocked) return fail(blocked.message, [], blocked.fix);

    job.step = 'build';
    say(`1/4 ${STEPS[0][1]}…`);
    const [, built] = await deps.build();
    if (job.canceled) return;
    if (!built?.ok) return fail('預覽沒有更新成功：照下面的訊息修改（看不懂就整段貼給 AI）。', built?.issues?.errors?.length ? built.issues.errors : [built?.message || '預覽更新失敗'], '照 ✖ 後面的建議改 plan.json，再跑一次這條指令');
    addLog(built.log || '');
    deps.onBuilt?.(built.log || '');

    let fp = contentFingerprint(P, opts), content = null;
    if (!deps.force && finalIsCurrent(P, fp)) {
      job.source = 'same';
      say('output/final.mp4 就是現在的內容，不用重新輸出（要重做加 --force）');
    } else if (!deps.force && plain) {   // 預先 render 都是 1080p＋燒字幕
      const took = await takePrerender(P, job, { fp, opts, run, say, pollMs: deps.pollMs ?? 2000, onPercent: percent });
      if (took) {
        job.source = 'prerender';
        content = took.content;
        say('用預先 render 好的完成影片，不用再等一個片長');
      }
    }
    if (job.canceled) return;

    // 只改了幾段：重畫那幾段、接回上一支（畫面和聲音都沒變就不用動）；只接 1080p＋燒字幕的舊檔
    if (!job.source && !deps.force && plain) {
      const inc = await tryIncremental(P, job, { opts, run, say, percent, env: deps.renderEnv, dest: F.tmp, kind: 'final', prefix: '3/4 ' });
      if (job.canceled) return;
      if (inc?.same && inc.pick.kind === 'final') {
        job.source = 'same';
        writeMemo(P, inc.fp, readJson(F.memo)?.source || 'render', inc.content);
        say('改動不影響畫面和聲音，output/final.mp4 不用重新輸出（要重做加 --force）');
      } else if (inc?.same || inc?.done) {
        fp = inc.fp;
        content = inc.content;
        fs.mkdirSync(path.dirname(F.final), { recursive: true });
        fs.renameSync(inc.same ? inc.pick.file : F.tmp, F.final);
        if (prerenderInfo(P).state !== 'none') await cancelPrerender(P);
        job.source = inc.same ? 'prerender' : 'incremental';
      }
    }

    if (!job.source) {
      job.step = 'test';
      fs.mkdirSync(path.dirname(F.log), { recursive: true });
      fs.writeFileSync(F.log, '');
      const rep = (await deps.report())?.report || {};
      const items = rep.items || [];
      // 4K 的影格暫存是 1080p 的 4 倍：磁碟不夠就不開始（30 分鐘約 64 GB）
      const filmDur = rep.outputDur ?? rep.videoDur;
      if (is4k && Number.isFinite(filmDur)) {
        const need = filmDur * opts.fps * FRAME_4K_BYTES + PRERENDER.stopFreeBytes, free = freeBytesOf(P);
        if (free != null && free < need) return fail(`磁碟剩 ${gb(free)} GB，輸出 4K 大約要 ${gb(need)} GB 暫存空間。`, [], '清出磁碟空間，或改輸出 1080p');
      }
      const first = items.find((x) => x.type !== 'media');
      const start = first?.out?.start ?? first?.start ?? 0;   // out.start＝完成影片秒數（有 edit.cuts 時 start 是 rough.mp4 秒數）
      say(`2/4 ${STEPS[1][1]}：${start} 秒起 ${TEST_SECONDS} 秒`);
      let tested;
      do { tested = await nodeTool('build.mjs', ['--project', P.project, '--template', P.templateDir, '--test', `${start},${TEST_SECONDS}`, ...(nocaps ? ['--nocaps'] : [])]); } while (tested.code === STILL_RUNNING);
      if (job.canceled) return;
      if (tested.code !== 0) return fail('測試片段產生失敗：照下面的訊息修改（看不懂就整段貼給 AI）。', [lastLine(tested)], '照訊息改 plan.json，再跑一次這條指令');
      fs.mkdirSync(path.dirname(F.clip), { recursive: true });
      const clipRender = await hfRender(P, run, { args: ['render', '-c', 'compositions/test-clip.html', '--sdr', '--quality', 'draft', '-o', F.clip], logFile: F.log, title: '測試片段', env: deps.renderEnv, onChunk: addLog });
      if (job.canceled) return;
      if (clipRender.code !== 0) return fail('測試片段輸出失敗：把下面的訊息貼給 AI。', [failLine(clipRender)], footageBroken(clipRender, P) || `看 ${path.relative(P.root, F.log)} 最後幾行；照 USAGE-reference.md R13 處理後再跑一次`);
      const kinds = await probeStreams(run, F.clip, P.root);
      if (job.canceled) return;
      if (!hasAv(kinds)) return fail('測試片段沒有畫面或沒有聲音，所以沒有輸出整支：把下面的訊息貼給 AI。', [`ffprobe 只看到：${kinds.join('、') || '沒有串流'}`], '確認 work/rough.mp4 有音軌（ffprobe），修好後再跑一次這條指令');

      // --force 或接手失敗：這次會 render 正式的，預先 render 的就沒用了（在跑的也會搶 CPU）
      if (prerenderInfo(P).state !== 'none') await cancelPrerender(P);
      fp = contentFingerprint(P, opts);   // 等預先 render 的時候使用者可能又存檔了：記這次真正 render 的內容
      content = contentNow(P, opts);
      job.step = 'render';
      percent(0);
      say(`3/4 ${STEPS[2][1]}${plain ? '' : `：${optionsLabel(opts)}`}（全文 log：${path.relative(P.root, F.log)}）`);
      const parse = progressParser((p) => percent(p));
      const resArg = is4k ? ['--resolution', resolveFormat({ projectDir: P.project, plan: readJson(P.plan) }).format === 'portrait' ? 'portrait-4k' : 'landscape-4k'] : [];
      const rendered = await hfRender(P, run, { args: ['render', ...(nocaps ? ['-c', NOCAPS.comp] : []), '--sdr', '--fps', String(opts.fps), '--quality', opts.quality, ...resArg, '--output', F.tmp], logFile: F.log, title: '整支', env: deps.renderEnv, kind: 'final', onChunk: (s) => { addLog(s); parse(s); } });
      rm(F.renderPid('final'));
      if (job.canceled) return;
      if (rendered.code !== 0 || !statOf(F.tmp)) return fail('整支輸出失敗，上一支完成影片沒有被動到：把下面的訊息貼給 AI。', [failLine(rendered)], footageBroken(rendered, P) || `看 ${path.relative(P.root, F.log)} 最後 20 行；重跑一次這條指令，還是失敗就停下來回報`);
      fs.mkdirSync(path.dirname(F.final), { recursive: true });
      try { fs.renameSync(F.tmp, F.final); } catch (e) {
        // 舊檔被別的程式開著（Windows 的播放器）：這一支不能白做，留成預先 render 的成品，再跑一次直接接手
        fs.renameSync(F.tmp, F.pre);
        writeJson(F.preState, { state: 'done', fingerprint: fp, percent: 100, size: statOf(F.pre).size, finishedAt: Date.now() });
        return fail('整支輸出好了，但換不過去：output/final.mp4 可能被別的程式開著。', [e.message], '關掉正在播放 final.mp4 的程式，再跑一次這條指令（不用重新 render）');
      }
      job.source = 'render';
    }
    job.percent = 100;
    // 不是 1080p＋燒字幕的不留內容紀錄：下次改一段時不能拿它當增量的底（畫素、字幕對不上）
    if (job.source !== 'same') writeMemo(P, fp, job.source, plain ? content : null);
    if (nocaps) {
      try { fs.copyFileSync(path.join(P.out, NOCAPS.srt), F.srt); } catch (e) { return fail('影片輸出好了，但字幕檔沒有存成功。', [e.message], '再跑一次（內容沒變不會重新 render）'); }
    }

    job.step = 'qc';
    say(`4/4 ${STEPS[3][1]}（qc.mjs final）`);
    const qc = await nodeTool('qc.mjs', ['final', '--project', P.project, '--json', ...(is4k ? ['--scale', '2'] : []), ...(nocaps ? ['--no-captions'] : [])]);
    if (job.canceled) return;
    let report = null;
    try { report = JSON.parse(qc.stdout); } catch { /* 下面當成驗收沒有跑完 */ }
    if (!report) return fail('影片輸出好了，但驗收沒有跑完：把下面的訊息貼給 AI。', [lastLine(qc)], `單獨跑 node shared/template/tools/qc.mjs final --project "${path.relative(P.root, P.project)}" 看錯誤`);
    // qc.mjs final --json 的 errors、warnings 是數字；每一則的文字在 checks 裡
    const said = (level) => (report.checks || []).filter((c) => c.level === level).map((c) => c.text);
    job.qc = report;
    job.warnings = said('warn');
    // 驗收只看畫面和聲音，不知道名字對不對：畫面上還是示範人物就講清楚，不能只說「通過」
    const demo = deps.speakerGate ? deps.speakerGate() : P.templateDir ? speakerGate(P.templateDir, readJson(P.plan)) : null;
    if (demo?.needed) job.warnings.unshift(`講者介紹還是示範人物「${demo.demo}」（${demo.segments.join('、')}）→ 跟 AI 說姓名與頭銜，或在剪輯頁設定後再輸出一次`);
    if (report.ok === false) return fail('影片輸出好了，但驗收沒過：把下面的 ✖ 貼給 AI，或修改後再輸出一次。', said('error'), '照 ✖ 後面的 → 修好，再跑一次這條指令（內容沒變只會重跑驗收；要重新 render 加 --force）');
    recordStopPassed(P.project, { said: deps.said });
    // YouTube 說明欄文字：寫不出來不影響交件（章節不到 3 個、沒用配樂就不產生檔案）
    // deps.checkJson＝() → build --check --json 的結果（deliver.mjs、剪輯台傳 planCheckJson；沒傳就不寫）
    try {
      const cj = deps.checkJson ? await deps.checkJson() : null;
      if (cj) {
        const yt = youtubeText(cj);
        if (yt.text) { fs.writeFileSync(F.youtube, yt.text); job.youtube = { file: F.youtube, chapters: yt.chapters, credit: yt.credit }; }
        else rm(F.youtube);
      }
    } catch { /* 沒有章節資料就不寫 */ }
    job.ok = true;
    job.message = demo?.needed ? `完成影片輸出好了，但講者介紹還是示範人物「${demo.demo}」，上片前要改。` : '完成影片輸出好了，驗收也通過了。';
    if (!plain) job.message += `（${optionsLabel(opts)}）`;
  } catch (e) {
    if (!job.canceled) fail(`輸出中斷：${e.message}`, [], `看 ${path.relative(P.root, F.log)} 最後幾行；重跑一次這條指令`);
  } finally {
    if (job.canceled) { job.ok = false; job.message = '已取消輸出，上一支完成影片沒有被動到。'; }
    if (locked) { rm(F.tmp); dropLock(P); }   // 別人在輸出時不碰他的暫存和鎖
    job.running = false;
    job.finishedAt = Date.now();
  }
}

// 預先 render：失敗只記在 work/final-prerender.json，不影響正式輸出（deliver.mjs 看到不能用就照常 render）。回傳 exit code。
// deps：build()；run、say、quality、fps、workers、renderEnv、watchMs、stallMs、capMs（測試可以調短）
export async function runPrerender(P, job, deps) {
  const F = deliverPaths(P.project);
  const run = deps.run || spawnRunner(job, { nice: PRERENDER.nice });
  const say = deps.say || (() => {});
  const opts = { quality: deps.quality || QUALITY, fps: deps.fps || FPS };
  const prevSide = readPreState(P);   // 上一次做好的可以當增量的底（下面第一次 save 就會蓋掉）
  let side = { state: 'running', phase: 'build', pid: process.pid, fingerprint: null, percent: null, workers: deps.workers || PRERENDER.workers, startedAt: Date.now() };
  const save = (o) => { side = { ...side, ...o }; try { writeJson(F.preState, side); } catch { /* 下一次再寫 */ } };
  const end = (state, reason, code = 0) => { save({ state, reason, phase: null, finishedAt: Date.now() }); rm(F.prePart); rm(F.renderPid('prerender')); say(`預先 render ${state === 'done' ? '好了' : `沒有做完：${reason}`}`); return code; };
  save({});
  try {
    await reapRender(P, 'prerender');
    const blocked = deliverBlocker(P);
    if (blocked) return end('skipped', blocked.message);
    const [, built] = await deps.build();
    if (!built?.ok) return end('failed',`重新產生沒有成功：${built?.issues?.errors?.[0] || built?.message || '不明'}`, 1);
    let fp = contentFingerprint(P, opts);
    if (finalIsCurrent(P, fp)) return end('skipped', 'output/final.mp4 已經是現在的內容');
    let content = contentNow(P, opts);
    const t0 = Date.now();
    const incEnv = { ...deps.renderEnv, PRODUCER_MAX_WORKERS: String(side.workers) };   // --start/--end 不理 --workers
    const finishDone = () => {
      writeState(F.preContent, { ...content, fingerprint: fp });
      save({ state: 'done', fingerprint: fp, phase: null, percent: 100, size: statOf(F.pre).size, finishedAt: Date.now(), seconds: Math.round((Date.now() - t0) / 1000) });
      rm(F.renderPid('prerender'));
      say(`預先 render 好了（${side.seconds} 秒）`);
      return 0;
    };
    // 跑的時候使用者又存檔了（局部改動）：重新產生、把改到的補上；補不了就算了（stale），之後照常重來
    const catchUp = async () => {
      for (let round = 0; round < 5; round++) {
        if (contentFingerprint(P, opts) === fp) return null;
        const [, again] = await deps.build();
        if (!again?.ok) return '內容改過了';
        const fp2 = contentFingerprint(P, opts);
        if (fp2 === fp) return null;
        const c2 = contentNow(P, opts), d = diffStates(content, c2);
        if (d.full) return `內容改過了（${d.full}）`;
        if (d.ranges.length || d.audio) {
          save({ phase: 'patch' });
          const r = await renderIncremental({ hfDir: P.out, base: F.pre, diff: d, dest: F.prePart, run, env: incEnv, quality: opts.quality, fps: opts.fps, say, render: (args, o) => hfRender(P, run, { args, logFile: F.log, title: o.title, env: { ...incEnv, ...o.env }, kind: 'prerender', cwd: o.cwd }) });
          if (r.full) return `內容改過了（${r.full}）`;
          fs.renameSync(F.prePart, F.pre);
        }
        fp = fp2;
        content = c2;
      }
      return contentFingerprint(P, opts) === fp ? null : '內容一直在改';
    };
    save({ fingerprint: fp, phase: 'render', percent: 0 });
    // 上一支（完成影片或做好的預先 render）只差幾段：補上就好
    const inc = await tryIncremental(P, job, { opts, run, say, percent: (p) => save({ percent: p }), env: incEnv, dest: F.prePart, kind: 'prerender', preSide: prevSide });
    if (inc?.same && inc.pick.kind === 'final') {
      writeMemo(P, inc.fp, readJson(F.memo)?.source || 'render', inc.content);
      return end('skipped', 'output/final.mp4 已經是現在的內容');
    }
    if (inc?.same || inc?.done) {
      if (inc.done) fs.renameSync(F.prePart, F.pre);
      fp = inc.fp;
      content = inc.content;
      const why = await catchUp();
      if (why) { rm(F.pre); return end('stale', why); }
      return finishDone();
    }
    rm(F.pre);
    rm(F.prePart);
    writeState(F.preContent, { ...content, fingerprint: fp });
    save({ fingerprint: fp, phase: 'render', percent: 0 });
    fs.mkdirSync(path.dirname(F.log), { recursive: true });
    fs.writeFileSync(F.log, '');

    const stallMs = deps.stallMs ?? PRERENDER.stallMs, capFloor = deps.capMs ?? PRERENDER.minCapMs;
    const watchMs = deps.watchMs ?? PRERENDER.watchMs;
    let lastTick = t0, lastWatch = t0, slept = 0, capMs = capFloor, stopped = null;
    const stop = (why) => { if (stopped) return; stopped = why; if (job.child?.pid) killTree(job.child.pid).catch(() => {}); };
    const watch = setInterval(() => {
      // 電腦睡著的時間不算（闔上筆電再打開，計時器一次跳很多）
      const now = Date.now(), gap = now - lastWatch - watchMs;
      lastWatch = now;
      if (gap > 60_000) { lastTick += gap; slept += gap; }
      // 使用者存檔或重新產生後：局部改動就跑完再補上（已經 render 的不丟）；不是局部才立刻收掉，把 CPU 還給預覽
      try { if (contentFingerprint(P, opts) !== fp && diffStates(content, contentNow(P, opts)).full) stop('內容改過了'); } catch { /* 下一輪再看 */ }
      if (now - lastTick > stallMs) stop(`${Math.round(stallMs / 60000)} 分鐘沒有進度`);
      else if (now - t0 - slept > capMs) stop(`超過上限 ${Math.round(capMs / 60000)} 分鐘`);
      else if ((deps.freeBytes ?? freeBytesOf)(P) < PRERENDER.stopFreeBytes) stop(`磁碟只剩不到 ${Math.round(PRERENDER.stopFreeBytes / 1024 ** 3)} GB`);
    }, watchMs);
    const parse = progressParser((p, frames) => {
      if (frames) capMs = Math.max(capFloor, (frames / opts.fps) * 1000 * PRERENDER.capPerFilm);
      save({ percent: p });
    });
    let r;
    try {
      r = await hfRender(P, run, { args: ['render', '--sdr', '--fps', String(opts.fps), '--quality', opts.quality, '--workers', String(side.workers), '--output', F.prePart], logFile: F.log, title: '預先 render', env: deps.renderEnv, kind: 'prerender', onChunk: (c) => { lastTick = Date.now(); parse(c); } });
    } finally { clearInterval(watch); }
    if (stopped) return end(stopped === '內容改過了' ? 'stale' : 'failed', stopped);
    if (r.code !== 0 || !statOf(F.prePart)) return end('failed', failLine(r), 1);
    fs.renameSync(F.prePart, F.pre);
    const why = await catchUp();
    if (why) { rm(F.pre); return end('stale', why); }
    return finishDone();
  } catch (e) {
    return end('failed', e.message, 1);
  }
}

// ---------- CLI 用的 build、report ----------

const issuesOf = (text) => ({ errors: text.split(/\r?\n/).filter((l) => /^✖/.test(l)).map((l) => l.replace(/^✖\s*/, '')), warnings: text.split(/\r?\n/).filter((l) => /^⚠/.test(l)).map((l) => l.replace(/^⚠\s*/, '')) });

export function cliDeps(P, job, { nice = 0, say = () => {} } = {}) {
  const run = spawnRunner(job, { nice });
  const tool = (name, args) => run(process.execPath, [path.join(TOOLS, name), ...args], { cwd: P.root });
  const base = ['--project', P.project, '--template', P.templateDir];
  return {
    run,
    build: async () => {
      // 瘦臉底片過期：先跑 look.mjs run（和剪輯台「重新產生」一樣；build 自己只會停下來報錯）
      if (lookNeedsRun({ projectDir: P.project, plan: readJson(P.plan) || {}, templateDir: P.templateDir })) {
        say('講者瘦臉：先偵測臉部、套用瘦臉（look.mjs run，長片要幾分鐘）…');
        let lr;
        do { lr = await tool('look.mjs', ['run', ...base]); } while (lr.code === STILL_RUNNING);
        if (lr.code !== 0) { const text = `${lr.stdout}\n${lr.stderr}`; return [200, { ok: false, log: text, message: lastLine(lr), issues: issuesOf(text) }]; }
      }
      let r;
      do { r = await tool('build.mjs', base); } while (r.code === STILL_RUNNING);
      const text = `${r.stdout}\n${r.stderr}`;
      return [200, { ok: r.code === 0, log: text, message: lastLine(r), issues: issuesOf(text) }];
    },
    report: async () => {
      const r = await tool('build.mjs', [...base, '--check', '--json']);
      try { return { report: JSON.parse(r.stdout) }; } catch { return { report: null }; }
    },
  };
}
