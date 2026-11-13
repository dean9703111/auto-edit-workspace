#!/usr/bin/env node
// 講者調光＋瘦臉的指令（契約：specs/contracts/cli-006.md；資料格式：specs/contracts/look.md）
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pathsFrom } from './lib/project.mjs';
import { findChrome } from './lib/audit-browser.mjs';
import { runJob, jobState, jobLog, isJobChild, DEFAULT_WAIT, STILL_RUNNING } from './lib/job.mjs';
import { writeAtomic } from './lib/atomic.mjs';
import { cmdLine, next } from './lib/say.mjs';
import { splitFlag, valueOf, isMain } from './lib/cli.mjs';
import { faceOn,
  resolveLook, validateLook, readState, writeState, statePaths, statOf, isRunning, assetsStatus, vendorOf, modelSha,
  landmarksFresh, footageFresh, staleReason, estimateMinutes, lookSize, probeVideo, projectLabel, loadTrack, interpolateEvery2,
  renderLookFootage, lookPreview, ensureLook, lookNextStep, nextLines, projArg, faceWidth, lmFromP, pct, mmss, POINTS, LM_VER, LOOK_VER, MIN_FACE_PX, RATE_OFF,
  DETECT_W, DETECT_CFG, ROI_SCALE, ROI_SIZE, readManifest, renameRetry, readKitLook, LOOK_LIMITS,
} from './lib/look.mjs';

const SELF = fileURLToPath(import.meta.url);
const JOB = 'look';   // 背景工作的名字（work/.jobs/look.json、look.log）
const HELP = `講者調光、瘦臉、美顏（零依賴：Node 22、ffmpeg、HyperFrames 的 chrome-headless-shell、shared/template/vendor/mediapipe）

  node shared/template/tools/look.mjs run --project projects/<專案>               偵測臉部 → 瘦臉底片 work/rough-look.mp4 → 對照圖 work/look-preview.jpg
                                                                                  在背景跑，前景最多等 ${DEFAULT_WAIT} 秒（--wait <秒> 可改）；印「⏳ 還在跑」（結束碼 ${STILL_RUNNING}）就再跑同一條，會接著等、不會重做
  node shared/template/tools/look.mjs run --project projects/<專案> --background  開了就回（剪輯台的「偵測臉部」用）；要等它做完就跑上面那條
  node shared/template/tools/look.mjs cancel --project projects/<專案>            取消背景的 look.mjs run（連 Chrome、ffmpeg 一起收；瘦臉底片不換上去）
  node shared/template/tools/look.mjs preview --project projects/<專案>           只重畫對照圖、重印偵測率與位移（不重新偵測）
  node shared/template/tools/look.mjs status --project projects/<專案>            設定、資產、快取、執行進度與下一步
  node shared/template/tools/look.mjs clear --project projects/<專案>             刪掉 landmark、瘦臉底片、對照圖與 work/.look/（下次重算）
  node shared/template/tools/look.mjs ensure [--download]                         檢查 shared/template/vendor/mediapipe 的 4 個檔（sha256）；--download 補下載缺的
  node shared/template/tools/look.mjs default [--color 0–1] [--slim 0–1.2] [--beauty 0–1]
                                                                                  改工作區的預設（shared/template/kit/look.json 只動這幾個鍵）；不帶值＝印目前的預設

run 的選項：--every 1|2（每幾格偵測一次；2＝偵測快一倍、中間內插；預設 1）、--force（不管快取全部重算）、--chrome <路徑>、--wait <秒>
設定：shared/template/kit/look.json（預設，用 default 改）＋ plan.json 第一層的 "look"（{ "color": 0–1, "slim": 0–1.2, "beauty": 0–1 } 或 false）
調光不用跑這支：build 重新編碼底片時直接 bake。瘦臉 > 0 時 build 要用最新的 work/rough-look.mp4，過期會停下來請你先跑 run。`;

const CMDS = ['run', 'preview', 'status', 'clear', 'ensure', 'default', 'cancel'];
const VALUE_FLAGS = ['project', 'template', 'every', 'chrome', 'wait', 'color', 'slim', 'beauty'];
const BOOL_FLAGS = ['force', 'background', 'download', 'help'];
const OPT = { run: ['project', 'template', 'every', 'chrome', 'force', 'background', 'wait'], preview: ['project', 'template'], status: ['project', 'template'],
  clear: ['project', 'template'], ensure: ['template', 'download'], default: ['template', 'color', 'slim', 'beauty'], cancel: ['project', 'template'] };

class Usage extends Error {}
// 參數錯誤原文照 cli-006 §1；→ 後面的指令放行尾，可以整段複製執行
const HELP_CMD = ' → 看用法：node shared/template/tools/look.mjs --help';
export function parseLookArgs(argv) {
  const flags = {};
  let cmd = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      if (cmd) throw new Usage(`看不懂的參數「${a}」${HELP_CMD}`);
      if (!CMDS.includes(a)) throw new Usage(`沒有 ${CMDS.join('／')} 以外的子指令「${a}」${HELP_CMD}`);
      cmd = a; continue;
    }
    const [k, inline] = splitFlag(a);
    if (VALUE_FLAGS.includes(k)) { try { [flags[k], i] = valueOf(argv, i, k, inline); } catch (e) { throw new Usage(`${e.message}${HELP_CMD}`); } }
    else if (BOOL_FLAGS.includes(k)) flags[k] = true;
    else throw new Usage(`沒有 --${k} 這個參數${HELP_CMD}`);
  }
  if (flags.help) return { cmd: 'help', flags };
  if (!cmd) throw new Usage(`要給子指令（${CMDS.join('／')}）${HELP_CMD}`);
  for (const k of Object.keys(flags)) if (!OPT[cmd].includes(k)) throw new Usage(`${cmd} 不能加 --${k}${HELP_CMD}`);
  if (flags.every != null) {
    if (!['1', '2'].includes(String(flags.every))) throw new Usage(`--every 只能是 1 或 2，現在是「${flags.every}」 → 改成 --every 1 或 --every 2`);
    flags.every = Number(flags.every);
  }
  if (flags.wait != null) {
    if (!/^\d+$/.test(String(flags.wait))) throw new Usage(`--wait 要寫秒數，現在是「${flags.wait}」 → 例：--wait 300`);
    flags.wait = Number(flags.wait);
  }
  return { cmd, flags };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmtB = (n) => `${Math.round(n).toLocaleString('en-US')} B`;
const fmtSec = (s) => (s >= 90 ? `${Math.floor(s / 60)} 分 ${Math.round(s % 60)} 秒` : `${Math.round(s)} 秒`);

function readPlan(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
}

// ---------- ensure ----------

async function cmdEnsure({ templateDir, flags, out }) {
  const vendorDir = vendorOf(templateDir), m = readManifest(vendorDir);
  if (!m) { out('✖ shared/template/vendor/mediapipe/manifest.json 不存在 → git checkout -- shared/template/vendor/mediapipe'); return 1; }
  const total = m.files.reduce((s, f) => s + f.size, 0);
  out(`資產檢查：shared/template/vendor/mediapipe（manifest.json，${m.files.length} 個檔，共 ${total.toLocaleString('en-US')} B）`);
  let st = assetsStatus(vendorDir, { sha: true });
  const pad = Math.max(...m.files.map((f) => f.path.length)) + 2;
  for (const f of st.files) out(`  ${f.state === 'ok' ? '✓' : '✖'} ${f.path.padEnd(pad)} ${f.state === 'ok' ? fmtB(f.size).padStart(12) : f.state === 'missing' ? '不存在' : f.state === 'size' ? `大小不對（${fmtB(f.actualSize)}）` : 'sha256 不對'}`);
  if (st.ok) { out(`✓ ${m.files.length} 個檔都對`); return 0; }
  const need = st.files.filter((f) => f.state !== 'ok');
  if (!flags.download) {
    out(`→ 加 --download 從固定網址下載缺的檔（約 ${(need.reduce((s, f) => s + f.size, 0) / 1e6).toFixed(1)} MB）：node shared/template/tools/look.mjs ensure --download`);
    return 1;
  }
  for (const f of need) {
    const tmp = `${f.file}.download`;
    try {
      const res = await fetch(f.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const sha = crypto.createHash('sha256').update(buf).digest('hex');
      if (sha !== f.sha256 || buf.length !== f.size) {
        out(`✖ 下載的 ${f.path} sha256 不對（${sha.slice(0, 12)}）→ 沒有換上去；來源可能被改過，停下來回報`);
        return 1;
      }
      fs.mkdirSync(path.dirname(f.file), { recursive: true });
      fs.writeFileSync(tmp, buf);
      renameRetry(tmp, f.file);
      out(`  ↓ ${f.path} ${fmtB(buf.length)} ✓`);
    } catch (e) {
      try { fs.rmSync(tmp, { force: true }); } catch { /* */ }
      out(`✖ 下載 ${f.path} 失敗（${e.message}）→ 確認網路能連 cdn.jsdelivr.net 與 storage.googleapis.com；公司網路擋住時請作者把 shared/template/vendor/mediapipe/ 整個複製過來`);
      return 1;
    }
  }
  st = assetsStatus(vendorDir, { sha: true });
  out(st.ok ? `✓ ${m.files.length} 個檔都對` : `✖ 還是有檔不對：${[...st.missing, ...st.bad].join('、')}（再跑一次；第二次失敗就停下來回報）→ node shared/template/tools/look.mjs ensure --download`);
  return st.ok ? 0 : 1;
}

// ---------- status ----------

function cmdStatus({ P, templateDir, out }) {
  const proj = projectLabel(P.project, templateDir), plan = readPlan(P.plan), S = statePaths(P.project), st = readState(P.project);
  const errs = validateLook(plan.look);
  const L = resolveLook({ plan, templateDir });
  out(`講者調光、瘦臉、美顏：${proj}`);
  const src = L.source === 'kit' ? 'kit/look.json' : 'plan.json 的 look';
  if (errs.length) out(`設定：✖ ${errs[0]}`);
  else if (L.source === 'off') out('設定：調光 關、瘦臉 關（plan.json 寫 "look": false）');
  else out(`設定：調光 ${L.color || '關'}、瘦臉 ${L.slim || '關'}、美顏 ${L.beauty || '關'}（來源：${src}）`);
  const as = assetsStatus(vendorOf(templateDir), { sha: true });
  if (as.ok) out(`資產：✓ shared/template/vendor/mediapipe（${as.files.length} 個檔，sha256 都對）`);
  else if (as.missing.length) out(`資產：✖ 少 ${as.missing.length} 個檔：${as.missing.join('、')} → node shared/template/tools/look.mjs ensure --download`);
  else out(`資產：✖ sha256 不對：${as.bad.join('、')} → node shared/template/tools/look.mjs ensure --download`);
  let chrome = null;
  try { chrome = findChrome({}); out(`Chrome：✓ ${chrome}`); } catch { out('Chrome：✖ 找不到 → npx hyperframes browser ensure'); }
  const mSha = modelSha(templateDir), sum = st.landmarks?.summary;
  const lmFresh = landmarksFresh(st, S, mSha);
  if (!st.landmarks) out('臉部 landmark：— 還沒跑');
  else if (!lmFresh) out(`臉部 landmark：✖ 過期（${staleReason(st, S, mSha, L.slim, L.beauty) || '檔案換過'}）`);
  else if (sum?.reason === 'small') out(`臉部 landmark：⚠ 略過瘦臉：臉寬 ${Math.round(sum.lookFaceWidth)} px < ${MIN_FACE_PX} px`);
  else if (sum?.reason === 'noface') out('臉部 landmark：⚠ 略過瘦臉：抽樣 12 格都沒偵測到臉（確定有講者就 run --force）');
  else if (sum?.reason === 'rate') out(`臉部 landmark：⚠ 略過瘦臉：偵測率 ${Math.round(sum.rate * 100)}%（< ${Math.round(RATE_OFF * 100)}%）`);
  else out(`臉部 landmark：✓ 最新（${sum.detected}/${sum.detected + sum.missing} 格，${pct(sum.rate)}；臉寬中位數 ${Math.round(sum.medianFaceWidth)} px）`);
  const ftFresh = footageFresh(st, S, mSha, L.slim, L.beauty);
  if (!faceOn(L)) out('瘦臉底片：— 不用（瘦臉、美顏都是 0）');
  else if (ftFresh) out(`瘦臉底片：✓ 最新（work/rough-look.mp4，瘦臉 ${L.slim}、美顏 ${L.beauty}，${st.footage.width}×${st.footage.height}）`);
  else if (!st.footage) out(sum?.slimOk === false && lmFresh ? '瘦臉底片：— 不用（略過瘦臉）' : '瘦臉底片：— 還沒做');
  else out(`瘦臉底片：✖ 過期（${staleReason(st, S, mSha, L.slim, L.beauty) || '檔案換過'}）`);
  const run = st.run, running = isRunning(st);
  const hhmm = (iso) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  if (running) {
    const name = { locate: '找臉', detect: '偵測', render: '套用瘦臉', preview: '畫對照圖' }[run.phase];
    const p = run.total ? Math.floor((run.done / run.total) * 100) : 0;
    out(`執行：執行中：${name} ${p}%${run.phase === 'detect' ? `（${run.done}/${run.total} 格` : '（'}，剩約 ${fmtSec(run.etaSec || 0)}）`.replace('（，', '（'));
  } else if (run?.phase === 'failed') out(`執行：上次失敗（${hhmm(run.updatedAt)}）：${run.error}`);
  else if (run?.phase === 'done') out(`執行：完成（${hhmm(run.updatedAt)}，花了 ${fmtSec((new Date(run.updatedAt) - new Date(run.startedAt)) / 1000)}）`);
  else if (run && RUNNING_PHASES.includes(run.phase)) out(`執行：上次沒有跑完（pid ${run.pid} 已經結束）`);
  else out('執行：沒有跑過');
  // status 只讀：不呼叫 ensureLook（它會寫混合 LUT）；底片照契約 §3.1 的順序判斷（還在跑 → 略過瘦臉 → 最新）
  const skipped = lmFresh && sum?.slimOk === false;
  const usesLook = faceOn(L) && !running && !skipped && ftFresh;
  const stale = faceOn(L) && !ftFresh && !skipped;
  const color = L.color > 0 ? `調光 ${L.color}` : '';
  if (usesLook) out(`build 會用：work/rough-look.mp4${color ? `＋${color}` : ''}`);
  else if (!color && !faceOn(L)) out('build 會用：work/rough.mp4（不調光、不瘦臉、不美顏）');
  else out(`build 會用：work/rough.mp4${color ? `＋${color}` : ''}${stale && as.ok && chrome ? '（瘦臉底片過期，build 會停下來）' : ''}`);
  // 最後兩行：「→ 下一步：說明」＋單獨一行的指令（lookNextStep，status.mjs 用同一個判斷；契約 look.md §3.5）
  for (const l of nextLines(lookNextStep({ projectDir: P.project, plan, templateDir, probe: { assets: as, chrome: !!chrome } }))) out(l);
  return 0;
}
const RUNNING_PHASES = ['locate', 'detect', 'render', 'preview'];

// ---------- clear ----------

function cmdClear({ P, templateDir, out }) {
  const S = statePaths(P.project), st = readState(P.project);
  if (isRunning(st)) { out(`✖ 正在跑（pid ${st.run.pid}）→ 等它跑完再 clear；要取消：node shared/template/tools/look.mjs cancel --project ${projArg(projectLabel(P.project, templateDir))}`); return 1; }
  const gone = [];
  for (const [f, name] of [[S.landmarks, 'work/face-landmarks.json'], [S.footage, 'work/rough-look.mp4'], [S.preview, 'work/look-preview.jpg']]) {
    if (fs.existsSync(f)) { fs.rmSync(f, { force: true }); gone.push(name); }
  }
  if (fs.existsSync(S.dir)) { fs.rmSync(S.dir, { recursive: true, force: true }); gone.push('work/.look/'); }
  out(gone.length ? `已刪除：${gone.join('、')}（下次 look.mjs run 會重新偵測與變形；瘦臉 > 0 時 build 會請你先跑 run）` : '沒有要刪的（work/ 裡沒有 look 的檔）');
  return 0;
}

// ---------- default（A9②：改工作區預設 kit/look.json，只動 color／slim／beauty，其他鍵與格式不動） ----------

const NAME = { color: '調光', slim: '瘦臉', beauty: '美顏' };
const EXAMPLE = { color: 0.8, slim: 0.6, beauty: 0.5 };
const settingLine = (K) => `設定：調光 ${K.color || '關'}、瘦臉 ${K.slim || '關'}、美顏 ${K.beauty || '關'}（來源：kit/look.json）`;   // 和 status 的「設定」同一個格式

function cmdDefault({ templateDir, flags, out }) {
  const file = path.join(templateDir, 'kit', 'look.json');
  let text, j;
  try { text = fs.readFileSync(file, 'utf8'); j = JSON.parse(text); } catch (e) { out(`✖ kit/look.json 讀不到：${e.message} → git checkout -- shared/template/kit/look.json`); return 1; }
  const want = [];
  for (const k of ['color', 'slim', 'beauty']) {
    if (flags[k] == null) continue;
    const [lo, hi] = LOOK_LIMITS[k], s = String(flags[k]).trim(), v = Number(s);
    if (!/^\d+(\.\d+)?$/.test(s) || v < lo || v > hi) { out(`✖ --${k} 要是 ${lo}–${hi} 的數字，現在是「${flags[k]}」 → 例：--${k} ${EXAMPLE[k]}（0＝關）`); return 1; }
    want.push([k, Math.round(v * 100) / 100]);
  }
  const changed = want.filter(([k, v]) => j[k] !== v);
  if (changed.length) {
    // 保留原本的縮排與換行；沒有的鍵（例 beauty）加在最後
    const next = { ...j };
    for (const [k, v] of changed) next[k] = v;
    const indent = /^\{\r?\n([ \t]+)"/.exec(text)?.[1] ?? '  ', eol = text.includes('\r\n') ? '\r\n' : '\n';
    writeAtomic(file, JSON.stringify(next, null, indent).replace(/\n/g, eol) + (/\n$/.test(text) ? eol : ''));
  }
  let K;
  try { K = readKitLook(templateDir); } catch (e) { out(`✖ ${e.message}`); return 1; }
  if (changed.length) out(`✓ kit/look.json：${changed.map(([k, v]) => `${NAME[k]} ${j[k] ?? 0} → ${v}`).join('、')}`);
  else if (want.length) out('✓ kit/look.json 本來就是這個值，沒有改');
  out(settingLine(K));
  return 0;
}

// ---------- cancel ----------

// 這個 pid 還是 look.mjs 嗎（當機、重開機後 pid 可能被別的程式重用；不能收錯）
const isLookPid = (pid) => process.platform === 'win32' || /look\.mjs/.test(spawnSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' }).stdout || '');

async function cmdCancel({ P, templateDir, out }) {
  const proj = projectLabel(P.project, templateDir), js = jobState(P.project, JOB), st = readState(P.project);
  const pid = js.state === 'running' ? js.pid : isRunning(st) && isLookPid(st.run.pid) ? st.run.pid : null;
  if (!pid) { out('現在沒有在背景跑 look.mjs run'); return 0; }
  const { killTree } = await import('./lib/deliver.mjs');   // 連 Chrome（自己一個 process group）一起收
  const { survivors } = await killTree(pid);
  try { writeState(P.project, { run: { ...(readState(P.project).run || {}), phase: 'failed', error: '已取消（look.mjs cancel）', updatedAt: new Date().toISOString() } }); } catch { /* 狀態寫不進去：status 會顯示「上次沒有跑完」 */ }
  if (survivors.length) { out(`✖ 這些行程收不掉：${survivors.join('、')} → 回報這一行`); return 1; }
  out(`已取消 look.mjs run（pid ${pid}）；work/rough-look.mp4 沒有換上去。要重來：node shared/template/tools/look.mjs run --project ${projArg(proj)}`);
  return 0;
}

// ---------- preview ----------

function cmdPreview({ P, templateDir, out }) {
  const S = statePaths(P.project);
  if (!fs.existsSync(S.rough)) { out('✖ 找不到 work/rough.mp4 → 先完成「剪乾淨」'); return 1; }
  try {
    const r = lookPreview({ projectDir: P.project, templateDir, plan: readPlan(P.plan) });
    for (const l of [...r.lines, ...r.warnings]) out(l);
    return 0;
  } catch (e) {
    const msg = String(e.message || e);
    out(`✖ ${msg.includes('→') ? msg : `${msg} → 確認 rough.mp4 能播；第二次失敗就停下來回報`}`);
    return 1;
  }
}

// ---------- run ----------

async function cmdRun({ P, templateDir, flags, out, argv, cwd }) {
  const proj = projectLabel(P.project, templateDir), S = statePaths(P.project), plan = readPlan(P.plan);
  if (!fs.existsSync(S.rough)) { out('✖ 找不到 work/rough.mp4 → 先完成「剪乾淨」'); return 1; }
  const errs = validateLook(plan.look);
  if (errs.length) { out(`✖ ${errs[0]}`); return 1; }
  const L = resolveLook({ plan, templateDir });
  let V = null;
  try { V = probeVideo(S.rough); } catch (e) { if (faceOn(L)) { out(`✖ ${e.message}`); return 1; } }
  const LS = V ? lookSize(V.width, V.height) : null, lookScale = V ? LS.w / V.width : 1;
  const src = L.source === 'kit' ? 'kit/look.json' : 'plan.json 的 look';
  const st0 = readState(P.project);
  // 偵測、變形一律在背景工作（lib/job.mjs）的子行程裡做：前景等不到就回 75，再跑同一條接著等
  const child = isJobChild(JOB);
  if (!child) {
    out(`講者調光、瘦臉、美顏：${proj}${V ? `（rough.mp4 ${V.width}×${V.height}、${V.fpsNum} fps、${V.frames} 格、${mmss(V.duration)}）` : ''}`);
    out(`設定：調光 ${L.color || '關'}、瘦臉 ${L.slim || '關'}、美顏 ${L.beauty || '關'}（${src}${L.source === 'kit' ? '；plan.json 沒有寫 look' : ''}）`);
  }
  if (!faceOn(L)) { out(`瘦臉、美顏都關閉（${src} slim = 0、beauty = 0）→ 不用跑；${L.color > 0 ? `調光 ${L.color} 在 build 時 bake` : '調光也關'}`); return 0; }
  // 不是這套背景工作開的（舊版、別的行程）還在跑：接不上，只能等它跑完
  if (isRunning(st0) && st0.run.pid !== process.pid && (child || jobState(P.project, JOB).state !== 'running')) {
    const d = new Date(st0.run.startedAt);
    out(`✖ 已經在跑了（pid ${st0.run.pid}，${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} 開始）→ 等它跑完再跑一次這條；要取消：node shared/template/tools/look.mjs cancel --project ${projArg(proj)}`);
    return 1;
  }
  if (!child) return startRun({ P, proj, S, V, flags, out, argv, cwd, templateDir });
  return runJob({ project: P.project, name: JOB, run: work });

  async function work() {
  fs.mkdirSync(S.dir, { recursive: true });
  const logFd = fs.openSync(S.log, 'w');   // stdout 進 work/.jobs/look.log；work/.look/run.log 照舊留一份（訊息裡叫人看它）
  const say = (l) => { out(l); if (logFd != null) fs.writeSync(logFd, l + '\n'); };
  const startedAt = new Date().toISOString();
  let lastW = 0;
  const setRun = (patch, force = false) => {
    const now = Date.now();
    if (!force && now - lastW < 2000) return;
    lastW = now;
    writeState(P.project, { run: { ...(readState(P.project).run || {}), pid: process.pid, startedAt, updatedAt: new Date().toISOString(), log: 'work/.look/run.log', error: null, ...patch } });
  };
  setRun({ phase: 'locate', done: 0, total: 12, etaSec: 0 }, true);
  let detector = null;
  try {
    const as = assetsStatus(vendorOf(templateDir), { sha: true });
    if (!as.ok) {
      const f = as.files.find((x) => x.state !== 'ok');
      throw new Error(`shared/template/vendor/mediapipe/${f.path} ${f.state === 'missing' ? '不存在' : 'sha256 不對'} → node shared/template/tools/look.mjs ensure --download（或 git checkout -- shared/template/vendor/mediapipe）`);
    }
    say(`資產：shared/template/vendor/mediapipe ✓（${as.files.length} 個檔，sha256 都對）`);
    const { openDetector, locateFaces, detectLandmarks } = await import('./lib/landmarks.mjs');
    let chrome;
    chrome = findChrome({ chrome: flags.chrome });
    say(`Chrome：✓ ${chrome}`);
    const vendorDir = vendorOf(templateDir), mSha = modelSha(templateDir);
    const lmFresh0 = landmarksFresh(readState(P.project), S, mSha);
    const ftFresh0 = footageFresh(readState(P.project), S, mSha, L.slim, L.beauty);
    const st1 = readState(P.project);
    const SKIP = ['small', 'noface'];   // 抽樣就決定略過：臉太小、或 12 格都沒有臉（沒有講者的片，不必逐格掃）
    const cachedSmall = lmFresh0 && SKIP.includes(st1.landmarks?.summary?.reason) && !flags.force;
    const needDetect = flags.force || !lmFresh0;
    const detW = Math.min(V.width, DETECT_W);
    const baseMeta = () => ({
      version: 1,
      source: { file: 'rough.mp4', ...statOf(S.rough), width: V.width, height: V.height, fps: V.fps, fpsNum: V.fpsNum, frames: V.frames, duration: Math.round(V.duration * 1000) / 1000 },
      detector: { name: 'mediapipe-face-landmarker', tasksVision: readManifest(vendorDir)?.version || '1.2.0', modelSha256: mSha, delegate: 'CPU', ...DETECT_CFG,
        detectWidth: detW, roiScale: ROI_SCALE, roiSize: ROI_SIZE, every: flags.every || 1, lmVer: LM_VER },
      points: POINTS,
    });
    const writeLandmarks = (obj) => {
      const tmp = path.join(S.dir, 'face-landmarks.json.tmp');
      fs.writeFileSync(tmp, JSON.stringify(obj));
      renameRetry(tmp, S.landmarks);
      const s = statOf(S.landmarks);
      writeState(P.project, { landmarks: { ...s, rough: statOf(S.rough), modelSha256: mSha, lmVer: LM_VER, every: flags.every || 1, summary: obj.summary } });
    };
    let summary = st1.landmarks?.summary;
    if (needDetect || cachedSmall) {
      if (cachedSmall) {
        say(summary.reason === 'noface' ? '[1/3] 找臉：用快取（抽樣 12 格都沒有臉）' : `[1/3] 找臉：用快取（臉寬中位數 ${Math.round(summary.medianFaceWidth)} px）`);
      } else {
        detector = await openDetector({ vendorDir, chrome });
        const times = Array.from({ length: 12 }, (_, k) => ((k + 0.5) / 12) * V.duration);
        const loc = await locateFaces({ video: S.rough, times, detector });
        const fws = loc.filter((x) => x && typeof x === 'object').map((x) => x.fw).sort((a, b) => a - b);
        const med = fws.length ? fws[fws.length >> 1] : 0, lookFw = med * lookScale;
        say(`[1/3] 找臉：抽 12 格 → ${fws.length ? `臉寬中位數 ${Math.round(med)} px（rough-look 畫面 ${Math.round(lookFw)} px）` : '12 格都沒找到臉'}`);
        if (!fws.length && !flags.force) {
          const blackN = loc.filter((x) => x === 0).length;
          summary = { detected: 0, black: blackN, missing: 12 - blackN, rate: 0, medianFaceWidth: 0, lookFaceWidth: 0, slimOk: false, reason: 'noface', sampled: 12, msPerFrame: 0, elapsedSec: 0 };
          writeLandmarks({ ...baseMeta(), frames: [], located: loc, summary });
          say('⚠ 抽樣 12 格都沒偵測到臉 → 這支只調光；確定有講者就加 --force');
        } else if (fws.length && lookFw < MIN_FACE_PX) {
          const blackN = loc.filter((x) => x === 0).length;
          summary = { detected: fws.length, black: blackN, missing: 12 - blackN - fws.length, rate: fws.length / Math.max(1, 12 - blackN), medianFaceWidth: Math.round(med * 10) / 10,
            lookFaceWidth: Math.round(lookFw * 10) / 10, slimOk: false, reason: 'small', sampled: 12, msPerFrame: 0, elapsedSec: 0 };
          writeLandmarks({ ...baseMeta(), frames: [], located: loc, summary });
          say(`⚠ 臉寬 ${Math.round(lookFw)} px < ${MIN_FACE_PX} px（rough-look 畫面）：瘦臉效果不到 1 px，略過瘦臉；build 只調光`);
        }
      }
    } else say(`[1/3] 找臉：用快取`);
    if (!SKIP.includes(summary?.reason)) {
      // [2/3] 偵測
      if (needDetect) {
        const every = flags.every || 1;
        const est = estimateMinutes({ frames: V.frames, width: V.width, height: V.height, every, warp: false });
        say(`[2/3] 偵測臉部 landmark（Chrome CPU，每 ${every} 格）：預估 ${est} 分（Windows 約 ×1.5–3）`);
        setRun({ phase: 'detect', done: 0, total: V.frames, etaSec: est * 60 }, true);
        if (!detector) detector = await openDetector({ vendorDir, chrome });
        let lastPct = 0, lastT = Date.now();
        const r = await detectLandmarks({ video: S.rough, every, detector, onProgress: ({ done, total, elapsed }) => {
          const p = done / total, eta = p > 0 ? (elapsed / p) * (1 - p) : 0;
          setRun({ phase: 'detect', done, total, etaSec: Math.round(eta) });
          if (p - lastPct >= 0.05 || Date.now() - lastT >= 10000) { lastPct = p; lastT = Date.now(); say(`  偵測 ${done}/${total} 格（${Math.floor(p * 100)}%），已 ${Math.round(elapsed)} 秒，剩約 ${Math.round(eta)} 秒`); }
        } });
        await detector.close(); detector = null;
        let frames = r.frames;
        if (every === 2) frames = interpolateEvery2(frames, r.black);
        const det = frames.filter((f) => f && typeof f === 'object');
        const black = frames.filter((f) => f === 0).length;
        const fwRaw = det.map((f) => faceWidth(lmFromP(f.p))).sort((a, b) => a - b);
        const med = fwRaw.length ? fwRaw[fwRaw.length >> 1] : 0;
        const rate = det.length / Math.max(1, frames.length - black);
        summary = { detected: det.length, black, missing: frames.length - black - det.length, rate: Math.round(rate * 10000) / 10000,
          medianFaceWidth: Math.round(med * 10) / 10, lookFaceWidth: Math.round(med * lookScale * 10) / 10,
          slimOk: rate >= RATE_OFF && med * lookScale >= MIN_FACE_PX, reason: rate < RATE_OFF ? 'rate' : med * lookScale < MIN_FACE_PX ? 'small' : null,
          msPerFrame: Math.round(r.msPerFrame * 10) / 10, elapsedSec: Math.round(r.elapsedSec) };
        if (summary.reason === null) delete summary.reason;
        writeLandmarks({ ...baseMeta(), frames, summary });
        say(`  偵測完成：${det.length}/${frames.length - black} 格（${pct(rate)}），全黑 ${black} 格，${(r.elapsedSec * 1000 / Math.max(1, frames.length)).toFixed(1)} ms/格 → work/face-landmarks.json`);
        if (summary.reason === 'rate') say(`⚠ 偵測率 ${Math.round(rate * 100)}%（< ${Math.round(RATE_OFF * 100)}%）：自動關掉瘦臉，build 只調光 → 看 work/look-preview.jpg；確定不要瘦臉就在 plan.json 寫 "look": { "slim": 0 }`);
        else if (summary.reason === 'small') say(`⚠ 臉寬 ${Math.round(summary.lookFaceWidth)} px < ${MIN_FACE_PX} px（rough-look 畫面）：瘦臉效果不到 1 px，略過瘦臉；build 只調光`);
      } else say(`[2/3] 偵測臉部 landmark：用快取（work/face-landmarks.json，${pct(summary?.rate || 0)}）`);
      // [3/3] 變形
      if (summary?.slimOk !== false) {
        if (!flags.force && footageFresh(readState(P.project), S, mSha, L.slim, L.beauty) && !needDetect) say(`[3/3] 套用瘦臉／美顏：用快取（work/rough-look.mp4，瘦臉 ${L.slim}、美顏 ${L.beauty}）`);
        else {
          const est = estimateMinutes({ frames: V.frames, width: V.width, height: V.height, detect: false });
          const res = LS.scaled ? `${LS.w}×${LS.h}，從 ${V.width}×${V.height} 縮小` : `${LS.w}×${LS.h}`;
          say(`[3/3] 套用瘦臉 ${L.slim}、美顏 ${L.beauty} → work/rough-look.mp4（${res}，只動臉部、音軌直接複製）：預估 ${est} 分`);
          setRun({ phase: 'render', done: 0, total: V.frames, etaSec: est * 60 }, true);
          const track = loadTrack(S.landmarks, { lookScale });
          let lastPct = 0, lastT = Date.now();
          const r = await renderLookFootage({ projectDir: P.project, track, slim: L.slim, beauty: L.beauty, onProgress: ({ done, total, elapsed }) => {
            const p = Math.min(1, done / total), eta = p > 0 ? (elapsed / p) * (1 - p) : 0;
            setRun({ phase: 'render', done, total, etaSec: Math.round(eta) });
            if (p - lastPct >= 0.05 || Date.now() - lastT >= 10000) { lastPct = p; lastT = Date.now(); say(`  變形 ${done}/${total} 格（${Math.floor(p * 100)}%），已 ${Math.round(elapsed)} 秒，剩約 ${Math.round(eta)} 秒`); }
          } });
          writeState(P.project, { footage: { ...statOf(S.footage), rough: statOf(S.rough), landmarks: statOf(S.landmarks), slim: L.slim, beauty: L.beauty, lookVer: LOOK_VER, width: r.width, height: r.height,
            warped: r.warped, medianDisp: r.medianDisp, maxDisp: r.maxDisp, maxDispRatio: r.maxDispRatio, maxDispAt: r.maxDispAt, dispP95Ratio: r.dispP95Ratio, elapsedSec: Math.round(r.elapsedSec) } });
          say(`  完成：work/rough-look.mp4（${mmss(r.duration)}，和 rough.mp4 差 ${r.diff.toFixed(3)} 秒）`);
        }
      }
    }
    setRun({ phase: 'preview', done: 0, total: 1, etaSec: 5 }, true);
    const pv = lookPreview({ projectDir: P.project, templateDir, plan });
    for (const l of [...pv.lines, ...pv.warnings]) say(l);
    setRun({ phase: 'done', done: 1, total: 1, etaSec: 0 }, true);
    const fin = ensureLook({ projectDir: P.project, plan, templateDir, strict: false });
    if (fin.footage === S.footage) say(`✓ 完成：build 會用 work/rough-look.mp4 當底片${L.color > 0 ? `，調光 ${L.color} 在 build 重新編碼時 bake` : ''}`);
    else say(`✓ 完成：瘦臉略過，build 用 work/rough.mp4${L.color > 0 ? `，調光 ${L.color} 在 build 重新編碼時 bake` : ''}`);
    for (const l of nextLines(lookNextStep({ projectDir: P.project, plan, templateDir }))) say(l);
    return 0;
  } catch (e) {
    try { await detector?.close(); } catch { /* */ }
    const msg = String(e.message || e);
    const line = /^(ffmpeg|Chrome|shared\/|找不到|rough-look)/.test(msg) && msg.includes('→') ? msg
      : /^(ffmpeg 解碼|ffmpeg 編碼)/.test(msg) ? `${msg} → 確認 rough.mp4 能播；第二次失敗就停下來回報（附 work/.look/run.log）`
        : /^Chrome 載不了/.test(msg) ? `${msg} → 確認 Chrome 是 npx hyperframes browser ensure 裝的那支；第二次失敗就停下來回報（附 work/.look/run.log）`
          : msg.includes('→') ? msg : `${msg} → 重跑一次；第二次失敗就停下來回報（附 work/.look/run.log）`;
    say(`✖ ${line}`);
    try { writeState(P.project, { run: { ...(readState(P.project).run || {}), pid: process.pid, phase: 'failed', error: line, updatedAt: new Date().toISOString() } }); } catch { /* */ }
    return 1;
  } finally {
    try { await detector?.close(); } catch { /* */ }
    if (logFd != null) fs.closeSync(logFd);
  }
  }
}

// 前景：交給背景工作（lib/job.mjs），前景最多等 --wait 秒；--background 開了就回（剪輯台的「偵測臉部」、舊文件）
async function startRun({ P, proj, S, V, flags, out, argv, cwd, templateDir }) {
  const jobArgv = [SELF, ...argv];
  const waitCmd = cmdLine('look.mjs', argv.filter((a) => a !== '--background'));
  if (flags.background) {
    await runJob({ project: P.project, name: JOB, argv: jobArgv, cwd, waitSec: 0, again: true, log: () => {} });
    // 等子行程寫好執行狀態再回：剪輯台接著查狀態時才看得到「執行中」
    const t0 = Date.now();
    let js = jobState(P.project, JOB);
    while (Date.now() - t0 < 10000 && readState(P.project).run?.pid !== js.pid && js.state === 'running') { await sleep(150); js = jobState(P.project, JOB); }
    if (js.pid && readState(P.project).run?.pid === js.pid) {
      const st = readState(P.project), lmFresh = landmarksFresh(st, S, modelSha(templateDir));
      const n = estimateMinutes({ frames: V.frames, width: V.width, height: V.height, every: flags.every || 1, detect: !!flags.force || !lmFresh });
      out(`已在背景跑（pid ${js.pid}；log：${proj}/work/.look/run.log）。預估 ${n} 分（Windows 約 ×1.5–3）`);
      for (const l of next(`要等它做完就跑這條（最多等 ${Math.round(DEFAULT_WAIT / 60)} 分鐘；印「⏳ 還在跑」就再跑同一條，會接著等）`, waitCmd)) out(l);
      return 0;
    }
    const tail = jobLog(P.project, JOB).trim().split('\n').slice(-8).join('\n');
    out(`✖ 背景處理程序沒有啟動成功（原因看下面 log 的最後幾行；第二次失敗就停下來回報）→ 改在前景跑：${waitCmd}`);
    out(tail || '（log 是空的）');
    return 1;
  }
  const code = await runJob({
    project: P.project, name: JOB, argv: jobArgv, cwd, waitSec: flags.wait ?? DEFAULT_WAIT, pollMs: 300,
    log: (s) => { for (const l of String(s).split('\n')) out(l); },   // 子行程的輸出一塊一塊來：拆成行，和以前前景跑時一樣一行一則
    cancel: cmdLine('look.mjs', ['cancel', '--project', proj]), activity: [S.log],
  });
  if (code === STILL_RUNNING) out(cmdLine('look.mjs', argv));
  return code;
}

// ---------- 入口 ----------

export async function main(argv = process.argv.slice(2), { out = (l) => console.log(l), cwd = process.cwd() } = {}) {
  let parsed;
  try { parsed = parseLookArgs(argv); } catch (e) { if (e instanceof Usage) { out(`✖ ${e.message}`); return 2; } throw e; }
  const { cmd, flags } = parsed;
  if (cmd === 'help') { out(HELP); return 0; }
  let P;
  try { P = pathsFrom(flags, cwd, { needProject: cmd !== 'ensure' && cmd !== 'default' }); } catch (e) { out(`✖ ${e.message}`); return 2; }
  const ctx = { P, templateDir: P.templateDir, flags, out, argv, cwd };
  if (cmd === 'ensure') return cmdEnsure(ctx);
  if (cmd === 'default') return cmdDefault(ctx);
  if (cmd === 'cancel') return cmdCancel(ctx);
  if (cmd === 'status') return cmdStatus(ctx);
  if (cmd === 'clear') return cmdClear(ctx);
  if (cmd === 'preview') return cmdPreview(ctx);
  return cmdRun(ctx);
}

if (isMain(import.meta.url)) main().then((code) => { process.exitCode = code; }, (e) => { console.error(`✖ ${e.message}`); process.exitCode = 1; });
