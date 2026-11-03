// 講者調光＋瘦臉（零依賴；契約 specs/contracts/look.md，數字的單一真相是那份的 §8）
//
//   readKitLook(templateDir)             → { color, slim, lut, lutFile }（shared/template/kit/look.json）
//   validateLook(v)                      → string[]（plan.json 第一層 look 的 ✖ 訊息）
//   resolveLook({ plan, templateDir })   → { color, slim, lutFile, lutRel, source: 'kit'|'plan'|'off' }
//   ensureLook({ projectDir, plan, log, templateDir, strict }) → { footage, lut, key, report }（build 用；同步、不開 Chrome）
//   lookCheck({ projectDir, plan, templateDir })              → { errors, warnings }（build --check 用；不寫檔）
//   lookNeedsRun({ projectDir, plan, templateDir })           → 影片編輯器「重新產生」前要不要先跑 look.mjs run
//   parseCube／blendCube／cubeText／ensureBlendedLut          調光 LUT：強度＝和恆等混合（m ＝ color ÷ 0.8）
//   controlPoints／field／warpPlane／maxDisp                  瘦臉變形（analysis/scripts/warp.mjs 移植；YUV 平面與 RGB 共用）
//   loadTrack(file|data, { lookScale })                       讀 face-landmarks.json：平滑、權重、側臉減半、淡入淡出
//   statePaths／readState／writeState／landmarksFresh／footageFresh／staleReason／assetsStatus／estimateMinutes
//   renderLookFootage({ projectDir, track, slim, onProgress }) 解碼 YUV → 變形 → x264（音軌 copy）→ work/rough-look.mp4
//   lookPreview({ projectDir, templateDir, plan })             對照圖 work/look-preview.jpg ＋印的行
//   faceImage({ projectDir, t, slim, cache })                  影片編輯器「講者」面板的單格前後對照（JPEG）

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromeCandidates } from './audit-browser.mjs';
import { lut3dFilter, writeJpg } from './ff.mjs';
import { canvas, fillRect, blit, text } from './raster.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_TEMPLATE = path.resolve(HERE, '..', '..');

// ---------- 常數（contracts/look.md §8） ----------

export const LOOK_VER = 1;
export const LM_VER = 1;
export const LUT_REF = 0.8;
export const LOOK_LIMITS = { color: [0, 1], slim: [0, 1.2], beauty: [0, 1], step: 0.05 };
// 要做臉部底片（rough-look.mp4）：瘦臉或美顏任一個開
export const faceOn = (L) => L.slim > 0 || L.beauty > 0;
export const H_TAB = [-0.10, 0.10, 0.25, 0.40, 0.55, 0.65, 0.75, 0.85, 0.90, 0.95, 1.00, 1.10];
export const IN_TAB = [0.00, 0.75, 1.05, 1.15, 1.30, 1.65, 1.60, 1.45, 1.35, 1.20, 0.70, 0.70].map((v) => v / 100);
export const UP_TAB = [0.00, 0.00, 0.15, 0.50, 1.05, 1.30, 1.50, 1.85, 2.00, 2.05, 2.15, 2.15].map((v) => v / 100);
export const JY_REF = 0.6, SIGMA = 0.25;
export const MOVE = [234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288, 361, 323, 454];
export const LIFT_ONLY = [1, 4, 61, 291, 0, 17, 13, 14, 18, 200, 199, 175];
export const FIX = [33, 133, 362, 263, 168, 6, 70, 300, 105, 334, 127, 162, 21, 54, 103, 67, 109, 10, 338, 297, 332, 284, 251, 389, 356];
export const OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
export const POINTS = [...new Set([...MOVE, ...LIFT_ONLY, ...FIX, ...OVAL])].sort((a, b) => a - b);   // 58 點
export const FADE_FRAMES = 5;
export const MIN_FACE_PX = 60;
export const YAW_HALF = 0.35;
export const RATE_OFF = 0.80;
export const RATE_WARN = 0.95;
// 位移 ⚠：每格「最大位移 ÷ 該格臉寬」的 95 百分位 > 6.5 %。2026-10-31 重新校準（審查 C-03），校準用三個 slim 值：
// 0.6（預設）、0.8（USAGE「瘦一點」）不 ⚠，1.05（裁決的 ⚠ 起點）⚠；示範口播 2× 全片＋8 段 20 秒＋4K 20 秒的 p95：
// 0.6 → 3.36–3.99 %、0.8 → 4.71–5.65 %、1.05 → 6.62–8.04 %（契約 §8）
export const DISP_WARN = 0.065;
export const DETECT_W = 1280;
export const LOOK_MAX_SIDE = 2560;
export const ROI_SCALE = 3.25, ROI_SIZE = 384;
export const SEARCH_GAP = 15;
export const DETECT_CFG = { numFaces: 2, minFaceDetectionConfidence: 0.3, minFacePresenceConfidence: 0.3 };
// 偵測：04 §4.5 量到 tasks-vision 16.6 ms／次；2026-10-31 實測整條（傳 1280×720 RGBA＋ROI＋偵測）26 ms／格 → 用實測值
export const EST = { detectMs: 26, warpMs: 14.5 };

const r2 = (n) => Math.round(Number(n) * 100) / 100;
const r1 = (n) => Math.round(Number(n) * 10) / 10;
const posix = (p) => p.split(path.sep).join('/');
const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const fmtNum = (n) => String(r2(n));
const fmtInt = (n) => Math.round(n).toLocaleString('en-US');
export const pct = (r) => `${(Math.floor(r * 10000) / 100).toFixed(2)}%`;

// ---------- 設定 ----------

export function readKitLook(templateDir = DEFAULT_TEMPLATE) {
  const file = path.join(templateDir, 'kit', 'look.json');
  let j;
  try { j = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { throw new Error(`kit/look.json 讀不到：${e.message} → 從 git 還原 shared/template/kit/look.json`); }
  if (!isObj(j)) throw new Error('kit/look.json 要是物件 { "color", "slim", "lut" } → 從 git 還原 shared/template/kit/look.json');
  for (const k of Object.keys(j)) if (!['color', 'slim', 'beauty', 'lut'].includes(k)) throw new Error(`kit/look.json 不能有「${k}」→ 只能寫 color、slim、beauty、lut`);
  if ('beauty' in j && (!num(j.beauty) || j.beauty < 0 || j.beauty > 1)) throw new Error(`kit/look.json 的 beauty 要是 0–1 的數字，現在是 ${JSON.stringify(j.beauty)} → 改成 0–1（預設 0＝不美顏；要美顏建議 0.5），或刪掉這個欄位`);
  if (!num(j.color) || j.color < 0 || j.color > 1) throw new Error(`kit/look.json 的 color 要是 0–1 的數字，現在是 ${JSON.stringify(j.color)} → 改成 0–1（預設 0＝不調光；要調光建議 0.8），或從 git 還原 shared/template/kit/look.json`);
  if (!num(j.slim) || j.slim < 0 || j.slim > 1.2) throw new Error(`kit/look.json 的 slim 要是 0–1.2 的數字，現在是 ${JSON.stringify(j.slim)} → 改成 0–1.2（預設 0＝不瘦臉；要瘦臉建議 0.6），或從 git 還原 shared/template/kit/look.json`);
  if (typeof j.lut !== 'string' || !j.lut) throw new Error('kit/look.json 的 lut 要是 kit/ 底下的 .cube 路徑，例如 "look/jianying-smart.cube" → 從 git 還原 shared/template/kit/look.json');
  const lutFile = path.join(templateDir, 'kit', j.lut);
  return { color: r2(j.color), slim: r2(j.slim), beauty: r2(j.beauty ?? 0), lut: j.lut, lutFile };
}

export function validateLook(v) {
  if (v === undefined || v === false) return [];
  if (!isObj(v)) return ['plan.json 的 look 要是物件或 false → 例如 "look": { "color": 0.8, "slim": 0.6 }；要用預設就把 look 整個拿掉'];
  const out = [];
  for (const k of Object.keys(v)) if (!['color', 'slim', 'beauty'].includes(k)) out.push(`look 不能有「${k}」→ 只能寫 color、slim、beauty`);
  if ('color' in v && (!num(v.color) || v.color < 0 || v.color > 1)) out.push(`look.color 要是 0–1 的數字（0＝不調光），現在是 ${JSON.stringify(v.color)}`);
  if ('slim' in v && (!num(v.slim) || v.slim < 0 || v.slim > 1.2)) out.push(`look.slim 要是 0–1.2 的數字（0＝不瘦臉；超過 1.2 脖子與領口會被拉彎），現在是 ${JSON.stringify(v.slim)}`);
  if ('beauty' in v && (!num(v.beauty) || v.beauty < 0 || v.beauty > 1)) out.push(`look.beauty 要是 0–1 的數字（0＝不美顏；磨皮、提亮、淡化黑眼圈），現在是 ${JSON.stringify(v.beauty)}`);
  return out;
}

export function resolveLook({ plan, templateDir = DEFAULT_TEMPLATE } = {}) {
  const kit = readKitLook(templateDir);
  const v = plan?.look;
  const base = { lutFile: kit.lutFile, lutRel: kit.lut, kit: { color: kit.color, slim: kit.slim, beauty: kit.beauty } };
  if (v === false) return { ...base, color: 0, slim: 0, beauty: 0, source: 'off' };
  if (!isObj(v)) return { ...base, color: kit.color, slim: kit.slim, beauty: kit.beauty, source: 'kit' };
  const ok = (x, hi) => num(x) && x >= 0 && x <= hi;
  return { ...base, color: ok(v.color, 1) ? r2(v.color) : kit.color, slim: ok(v.slim, 1.2) ? r2(v.slim) : kit.slim, beauty: ok(v.beauty, 1) ? r2(v.beauty) : kit.beauty, source: 'plan' };
}
const srcLabel = (L) => (L.source === 'kit' ? 'kit/look.json' : 'plan.json 的 look');

// ---------- LUT ----------

export function parseCube(textStr) {
  let size = 0, title = '';
  const vals = [];
  for (const raw of String(textStr).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('TITLE')) { title = line.replace(/^TITLE\s*/, '').replace(/^"|"$/g, ''); continue; }
    if (line.startsWith('LUT_3D_SIZE')) { size = Number(line.split(/\s+/)[1]); continue; }
    if (line.startsWith('DOMAIN_MIN')) { if (line.split(/\s+/).slice(1).map(Number).some((x) => x !== 0)) throw new Error('只支援 DOMAIN_MIN 0 0 0'); continue; }
    if (line.startsWith('DOMAIN_MAX')) { if (line.split(/\s+/).slice(1).map(Number).some((x) => x !== 1)) throw new Error('只支援 DOMAIN_MAX 1 1 1'); continue; }
    if (/^[A-Z_]/.test(line)) throw new Error(`看不懂的 .cube 行：${line.slice(0, 40)}`);
    const p = line.split(/\s+/).map(Number);
    if (p.length !== 3 || p.some((x) => !Number.isFinite(x))) throw new Error(`.cube 的數值行要有 3 個數字：${line.slice(0, 40)}`);
    vals.push(...p);
  }
  if (!(size >= 2) || vals.length !== size ** 3 * 3) throw new Error(`.cube 的格點數不對（LUT_3D_SIZE ${size}，有 ${vals.length / 3} 個點）`);
  return { title, size, data: Float32Array.from(vals) };
}

// 每個格點 id ＋ m ×（lut − id），夾在 0–1；R 變化最快（.cube 的順序）
export function blendCube(cube, m) {
  const N = cube.size, out = new Float32Array(cube.data.length);
  for (let b = 0; b < N; b++) for (let g = 0; g < N; g++) for (let r = 0; r < N; r++) {
    const i = (r + N * g + N * N * b) * 3, id = [r / (N - 1), g / (N - 1), b / (N - 1)];
    for (let c = 0; c < 3; c++) out[i + c] = Math.min(1, Math.max(0, id[c] + m * (cube.data[i + c] - id[c])));
  }
  return { title: cube.title, size: N, data: out };
}

export function cubeText(cube, title = cube.title) {
  const lines = [`TITLE "${title}"`, `LUT_3D_SIZE ${cube.size}`, 'DOMAIN_MIN 0 0 0', 'DOMAIN_MAX 1 1 1'];
  for (let i = 0; i < cube.data.length; i += 3) lines.push(`${cube.data[i].toFixed(6)} ${cube.data[i + 1].toFixed(6)} ${cube.data[i + 2].toFixed(6)}`);
  return lines.join('\n') + '\n';
}

const shaCache = new Map();
export function fileSha256(file) {
  const st = fs.statSync(file), k = `${file}|${st.size}|${st.mtimeMs}`;
  if (!shaCache.has(k)) shaCache.set(k, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'));
  return shaCache.get(k);
}

export function ensureBlendedLut({ projectDir, lutFile, color, log = () => {} }) {
  if (!(color > 0)) return null;
  if (!fs.existsSync(lutFile)) throw new Error(`找不到調光 LUT：${lutFile} → 從 git 還原 shared/template/kit/look/`);
  const sha = fileSha256(lutFile);
  const file = path.join(projectDir, 'work', '.look', `lut-${color.toFixed(2)}-${sha.slice(0, 8)}.cube`);
  if (fs.existsSync(file)) return file;
  let cube;
  try { cube = parseCube(fs.readFileSync(lutFile, 'utf8')); } catch (e) { throw new Error(`調光 LUT ${path.basename(lutFile)} 讀不懂（${e.message}）→ 從 git 還原 shared/template/kit/look/`); }
  const blended = blendCube(cube, color / LUT_REF);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, cubeText(blended, `${path.basename(lutFile, '.cube')} x${(color / LUT_REF).toFixed(4)}`));
  renameRetry(tmp, file);
  log(`講者調光：寫好混合 LUT work/.look/${path.basename(file)}（強度 ${fmtNum(color)}）`);
  return file;
}

// ---------- 狀態與快取 ----------

const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
export function renameRetry(a, b) {
  for (let k = 0; ; k++) {
    try { fs.renameSync(a, b); return; } catch (e) {
      if (k >= 5 || !['EBUSY', 'EPERM', 'EACCES'].includes(e.code)) throw e;
      sleepSync(300);
    }
  }
}

export function statePaths(projectDir) {
  const work = path.join(projectDir, 'work'), dir = path.join(work, '.look');
  return {
    work, dir, state: path.join(dir, 'state.json'), log: path.join(dir, 'run.log'),
    rough: path.join(work, 'rough.mp4'), landmarks: path.join(work, 'face-landmarks.json'),
    footage: path.join(work, 'rough-look.mp4'), preview: path.join(work, 'look-preview.jpg'),
  };
}
export const statOf = (f) => { try { const s = fs.statSync(f); return { size: s.size, mtimeMs: Math.round(s.mtimeMs) }; } catch { return null; } };
const sameStat = (a, b) => !!a && !!b && a.size === b.size && Math.round(a.mtimeMs) === Math.round(b.mtimeMs);

export function readState(projectDir) {
  try { const j = JSON.parse(fs.readFileSync(statePaths(projectDir).state, 'utf8')); return isObj(j) ? j : {}; } catch { return {}; }
}
export function writeState(projectDir, patch) {
  const P = statePaths(projectDir);
  const cur = readState(projectDir);
  const next = { version: 1, ...cur, ...patch };
  for (const k of Object.keys(patch)) if (patch[k] === undefined) delete next[k];
  fs.mkdirSync(P.dir, { recursive: true });
  const tmp = `${P.state}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n');
  renameRetry(tmp, P.state);
  return next;
}

export function pidAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}
export const RUNNING = ['locate', 'detect', 'render', 'preview'];
export const isRunning = (st) => !!st.run && RUNNING.includes(st.run.phase) && pidAlive(st.run.pid);

export function readManifest(vendorDir) {
  try { return JSON.parse(fs.readFileSync(path.join(vendorDir, 'manifest.json'), 'utf8')); } catch { return null; }
}
export const vendorOf = (templateDir = DEFAULT_TEMPLATE) => path.join(templateDir, 'vendor', 'mediapipe');
export function modelSha(templateDir = DEFAULT_TEMPLATE) {
  return readManifest(vendorOf(templateDir))?.files?.find((f) => f.path === 'face_landmarker.task')?.sha256 || null;
}

// sha＝true 才算 sha256（run／status／ensure）；build 只看大小
export function assetsStatus(vendorDir, { sha = false } = {}) {
  const m = readManifest(vendorDir);
  if (!m || !Array.isArray(m.files)) return { ok: false, manifest: false, files: [], missing: ['manifest.json'], bad: [] };
  const files = m.files.map((f) => {
    const file = path.join(vendorDir, f.path), st = statOf(file);
    let state = 'ok';
    if (!st) state = 'missing';
    else if (st.size !== f.size) state = 'size';
    else if (sha && fileSha256(file) !== f.sha256) state = 'sha';
    return { ...f, file, state, actualSize: st?.size ?? null };
  });
  return { ok: files.every((f) => f.state === 'ok'), manifest: true, files, missing: files.filter((f) => f.state === 'missing').map((f) => f.path), bad: files.filter((f) => f.state === 'size' || f.state === 'sha').map((f) => f.path) };
}

export function landmarksFresh(st, P, mSha) {
  const L = st.landmarks;
  return !!L && sameStat(L, statOf(P.landmarks)) && sameStat(L.rough, statOf(P.rough)) && L.modelSha256 === mSha && L.lmVer === LM_VER;
}
export function footageFresh(st, P, mSha, slim, beauty = 0) {
  const F = st.footage;
  return landmarksFresh(st, P, mSha) && !!F && sameStat(F, statOf(P.footage)) && sameStat(F.rough, statOf(P.rough))
    && sameStat(F.landmarks, statOf(P.landmarks)) && r2(F.slim) === r2(slim) && r2(F.beauty ?? 0) === r2(beauty) && F.lookVer === LOOK_VER;
}
export function staleReason(st, P, mSha, slim, beauty = 0) {
  if (!st.landmarks && !st.footage) return '還沒跑過';
  const rough = statOf(P.rough);
  if ((st.landmarks && !sameStat(st.landmarks.rough, rough)) || (st.footage && !sameStat(st.footage.rough, rough))) return 'rough.mp4 換過（剪乾淨重做了）';
  if (!st.landmarks || !sameStat(st.landmarks, statOf(P.landmarks))) return 'work/face-landmarks.json 不見了或被改過';
  if (st.landmarks.lmVer !== LM_VER) return `偵測版本更新（LM_VER ${st.landmarks.lmVer} → ${LM_VER}）`;
  if (st.landmarks.modelSha256 !== mSha) return '臉部偵測模型換過';
  if (!st.footage) return '瘦臉底片還沒做';
  if (r2(st.footage.slim) !== r2(slim)) return `瘦臉強度 ${fmtNum(st.footage.slim)} → ${fmtNum(slim)}`;
  if (r2(st.footage.beauty ?? 0) !== r2(beauty)) return `美顏強度 ${fmtNum(st.footage.beauty ?? 0)} → ${fmtNum(beauty)}`;
  if (!sameStat(st.footage, statOf(P.footage)) || !sameStat(st.footage.landmarks, statOf(P.landmarks))) return 'work/rough-look.mp4 不見了或被改過';
  if (st.footage.lookVer !== LOOK_VER) return `look.mjs 版本更新（LOOK_VER ${st.footage.lookVer} → ${LOOK_VER}）`;
  return null;
}

export function lookSize(w, h) {
  const long = Math.max(w, h);
  if (long <= LOOK_MAX_SIDE) return { w, h, scaled: false };
  const k = LOOK_MAX_SIDE / long, even = (x) => Math.max(2, Math.round(x / 2) * 2);
  return { w: even(w * k), h: even(h * k), scaled: true };
}
export function estimateMinutes({ frames, width, height, every = 1, detect = true, warp = true }) {
  const L = lookSize(width, height);
  const ms = (detect ? EST.detectMs / every : 0) + (warp ? EST.warpMs * Math.max(1, (L.w * L.h) / (1920 * 1080)) : 0);
  return Math.max(1, Math.ceil((frames * ms) / 60000));
}

const fpsNumOf = (s) => { const [a, b] = String(s || '0/1').split('/').map(Number); return b ? a / b : a; };
const probeCache = new Map();
export function probeVideo(file) {
  const st = statOf(file), k = `${file}|${st?.size}|${st?.mtimeMs}`;
  if (probeCache.has(k)) return probeCache.get(k);
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
    'stream=width,height,pix_fmt,avg_frame_rate,r_frame_rate,nb_frames,color_space,color_primaries,color_transfer,color_range:format=duration', '-of', 'json', file], { encoding: 'utf8' });
  const base = path.basename(file), redo = `確認 ${base} 能播${base === 'rough.mp4' ? '；不能播就把剪乾淨的輸出重做一次' : ''}`;
  if (r.error) throw r.error.code === 'ENOENT' ? new Error('找不到 ffprobe → 先跑 npx -y hyperframes doctor，照 setup/ 的手冊裝 ffmpeg') : r.error;
  if (r.status !== 0) throw new Error(`ffprobe 讀不到 ${base}：${String(r.stderr).trim().slice(0, 200)} → ${redo}`);
  const j = JSON.parse(r.stdout), s = j.streams?.[0];
  if (!s) throw new Error(`${base} 沒有畫面 → ${redo}`);
  const fps = s.avg_frame_rate && fpsNumOf(s.avg_frame_rate) > 0 ? s.avg_frame_rate : s.r_frame_rate;
  const fpsNum = fpsNumOf(fps), duration = Number(j.format?.duration) || 0;
  const out = { width: s.width, height: s.height, pixFmt: s.pix_fmt, fps, fpsNum: Math.round(fpsNum * 1000) / 1000, fpsExact: fpsNum, duration,
    frames: Math.round(duration * fpsNum), color: { space: s.color_space, primaries: s.color_primaries, trc: s.color_transfer, range: s.color_range } };
  probeCache.set(k, out);
  return out;
}

export function projectLabel(projectDir, templateDir = DEFAULT_TEMPLATE) {
  const rel = path.relative(path.resolve(templateDir, '..', '..'), projectDir);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? posix(rel) : posix(projectDir);
}

// ---------- ensureLook／lookCheck（contracts/look.md §3） ----------

function decide({ projectDir, plan, templateDir, probe = {} }) {
  const L = resolveLook({ plan, templateDir });
  const P = statePaths(projectDir), st = readState(projectDir), proj = projectLabel(projectDir, templateDir);
  const base = { L, P, st, proj, footage: P.rough, slimApplied: 0, beautyApplied: 0 };
  if (L.color === 0 && !faceOn(L)) return { ...base, row: 1 };
  if (!faceOn(L)) return { ...base, row: 2 };
  const statusCmd = `node shared/template/tools/look.mjs status --project ${projArg(proj)}`;
  // 指令一律放在 → 後面、行尾，整段可以直接複製執行（審查 C-02）
  if (isRunning(st)) {
    const pid = st.run.pid;
    return { ...base, row: 3, warn: `⚠ 講者瘦臉還在跑（look.mjs run，pid ${pid}；status 顯示「完成」再 build）→ ${statusCmd}`,
      error: `瘦臉還在跑（pid ${pid}；status 顯示「完成」再 build）→ ${statusCmd}` };
  }
  const mSha = modelSha(templateDir);
  const sum = st.landmarks?.summary;
  if (landmarksFresh(st, P, mSha) && sum && sum.slimOk === false) {
    const warn = sum.reason === 'noface'
      ? `⚠ 講者瘦臉略過：抽樣 12 格都沒偵測到臉 → 這支只調光；確定有講者就跑 node shared/template/tools/look.mjs run --project ${projArg(proj)} --force`
      : sum.reason === 'small'
      ? `⚠ 講者瘦臉略過：臉寬中位數 ${Math.round(sum.lookFaceWidth ?? sum.medianFaceWidth)} px < ${MIN_FACE_PX} px（畫面太小，瘦臉效果不到 1 px），只調光`
      : `⚠ 講者瘦臉略過：偵測率 ${Math.round((sum.rate || 0) * 100)}%（< ${Math.round(RATE_OFF * 100)}%），只調光 → 看 work/look-preview.jpg；確定不要瘦臉就在 plan.json 寫 "look": { "slim": 0 }`;
    return { ...base, row: 4, warn };
  }
  if (footageFresh(st, P, mSha, L.slim, L.beauty)) return { ...base, row: 5, footage: P.footage, slimApplied: L.slim, beautyApplied: L.beauty };
  const assets = probe.assets ?? assetsStatus(vendorOf(templateDir));
  const chromeOk = probe.chrome ?? chromeCandidates().length > 0;
  if (!assets.ok) {
    const f = assets.missing[0] || assets.bad[0];
    return { ...base, row: 6, warn: `⚠ 講者瘦臉略過：找不到 shared/template/vendor/mediapipe/${f}，只調光 → node shared/template/tools/look.mjs ensure` };
  }
  if (!chromeOk) return { ...base, row: 6, warn: '⚠ 講者瘦臉略過：找不到 HyperFrames 的 Chrome，只調光 → npx hyperframes browser ensure' };
  const reason = staleReason(st, P, mSha, L.slim, L.beauty) || '還沒跑過';
  // 預估看 landmark 快取（只改 slim 時只重做變形）；超過 2 分鐘直接給 --background 的指令（審查 C-06、C-02）
  let est = null;
  try { const v = probeVideo(P.rough); est = estimateMinutes({ frames: v.frames, width: v.width, height: v.height, detect: !landmarksFresh(st, P, mSha) }); } catch { /* 沒有 rough.mp4 時不預估 */ }
  const bg = est != null && est > 2;
  const runCmd = `node shared/template/tools/look.mjs run --project ${projArg(proj)}${bg ? ' --background' : ''}`;
  const estNote = est == null ? '' : bg ? `；預估 ${est} 分，超過 2 分鐘就在背景跑，用 look.mjs status 看進度` : `；預估 ${est} 分`;
  return { ...base, row: 7, reason, est, bg, runCmd,
    error: `瘦臉底片不是最新的（${reason}${estNote}；不要瘦臉就在 plan.json 寫 "look": { "slim": 0 }）→ 先跑 ${runCmd}`,
    warn: `⚠ 瘦臉還沒套到底片（${reason}），這次先用 work/rough.mp4 → ${runCmd}` };
}

// 關的時候是 kit 預設（沒人決定過）→ 括號裡多一句怎麼開，停點回報貼這兩行，使用者才知道有這個功能
const offLabel = (L) => (L.source === 'kit' ? 'kit/look.json 預設；要開就在 plan.json 寫 "look"，USAGE.md 第 7 節' : srcLabel(L));
function colorLine(L) {
  return L.color > 0 ? `講者調光：${fmtNum(L.color)}（kit/${L.lutRel}，build 重新編碼底片時 bake）` : `講者調光：關（${offLabel(L)}）`;
}

export function ensureLook({ projectDir, plan = {}, log = () => {}, templateDir = DEFAULT_TEMPLATE, strict = true, probe } = {}) {
  const errs = validateLook(plan?.look);
  if (errs.length && strict) throw new Error(errs[0]);
  const d = decide({ projectDir, plan, templateDir, probe });
  const { L, P } = d;
  if (d.row === 1) return { footage: P.rough, lut: null, key: null, report: [colorLine(L), `講者瘦臉：關、美顏：關（${offLabel(L)}）`] };
  if (d.error && strict) throw new Error(d.error);
  const lut = ensureBlendedLut({ projectDir, lutFile: L.lutFile, color: L.color, log });
  const report = [colorLine(L)];
  if (d.row === 2) report.push(`講者瘦臉：關、美顏：關（${offLabel(L)}）`);
  else if (d.row === 5) {
    const s = d.st.landmarks?.summary || {};
    report.push(`講者瘦臉：${L.slim > 0 ? fmtNum(L.slim) : '關'}、美顏：${L.beauty > 0 ? fmtNum(L.beauty) : '關'}（work/rough-look.mp4；偵測率 ${pct(s.rate || 0)}、臉寬中位數 ${Math.round(s.medianFaceWidth || 0)} px）`);
  } else report.push(d.warn);
  const footage = d.footage, slim = d.slimApplied, beauty = d.beautyApplied;
  const key = L.color > 0 || slim > 0 || beauty > 0
    ? { v: LOOK_VER, color: L.color, ...(L.color > 0 ? { lut: fileSha256(L.lutFile).slice(0, 12) } : {}), slim, ...(beauty > 0 ? { beauty } : {}), footage: path.basename(footage) }
    : null;
  return { footage, lut, key, report };
}

// 影片編輯器「重新產生」前要不要先跑 look.mjs run（§3.1 第 7 列：過期而且能跑）
export function lookNeedsRun({ projectDir, plan = {}, templateDir = DEFAULT_TEMPLATE, probe } = {}) {
  if (validateLook(plan?.look).length) return false;
  try { return decide({ projectDir, plan, templateDir, probe }).row === 7; } catch { return false; }
}

export function lookCheck({ projectDir, plan = {}, templateDir = DEFAULT_TEMPLATE, probe } = {}) {
  const errors = validateLook(plan?.look);
  const warnings = [];
  let d;
  try { d = decide({ projectDir, plan, templateDir, probe }); } catch (e) { return { errors: [...errors, e.message], warnings }; }
  if ([3, 4, 6].includes(d.row)) warnings.push(d.warn.replace(/^⚠ /, ''));
  if (d.row === 7) warnings.push(`build 會停下來：${d.error}`);   // build 是 ✖（裁決 D4）；--check 仍只提醒，見 tasks.md C-14
  return { errors, warnings };
}

// ---------- look 階段的下一步（契約 §3.5；look.mjs status／run 的最後兩行，status.mjs 也呼叫它） ----------
//
// 回傳 { step, done, note, cmd }：
//   step  'fix'｜'wait'｜'retry'｜'run'｜'ensure'｜'chrome'（look 還沒好，done＝false）
//         'framing'｜'build'｜'next'（look 好了，done＝true）
//   note  說明（印在「→ 下一步：」後面）；cmd  可以整行複製執行的指令（單獨一行，後面不接任何字）
// 順序：look run（或 --background）→ 構圖分析（qc.mjs framing）→ 構圖台 → 停點 ②；plan.json 還沒有 scenes 時不會叫人 build。
export const FRAMING_PREVIEW = '構圖預覽.jpg';
export function lookNextStep({ projectDir, plan = {}, templateDir = DEFAULT_TEMPLATE, probe } = {}) {
  const proj = projectLabel(projectDir, templateDir);
  const statusCmd = `node shared/template/tools/look.mjs status --project ${projArg(proj)}`;
  const errs = validateLook(plan?.look);
  if (errs.length) return { step: 'fix', done: false, note: `plan.json 的 look 寫錯（${errs[0]}）；改好再看一次`, cmd: statusCmd };
  let d;
  try { d = decide({ projectDir, plan, templateDir, probe }); } catch (e) { return { step: 'fix', done: false, note: `${e.message}；改好再看一次`, cmd: statusCmd }; }
  if (d.row === 3) return { step: 'wait', done: false, note: '瘦臉還在跑；每 30 秒看一次，看到「執行：完成」再往下', cmd: statusCmd };
  if (d.row === 6) {
    return d.warn.includes('Chrome')
      ? { step: 'chrome', done: false, note: '找不到 HyperFrames 的 Chrome，裝好再跑瘦臉', cmd: 'npx hyperframes browser ensure' }
      : { step: 'ensure', done: false, note: '少臉部偵測的檔；照 AGENTS.md 規則 3 先告訴使用者要下載約 18 MB，同意再跑', cmd: 'node shared/template/tools/look.mjs ensure --download' };
  }
  if (d.row === 7) {
    const est = d.est == null ? '' : `，預估 ${d.est} 分（Windows 約 ×1.5–3）${d.bg ? '，超過 2 分鐘所以在背景跑，之後每 30 秒跑一次 look.mjs status' : ''}`;
    return d.st.run?.phase === 'failed'
      ? { step: 'retry', done: false, note: `上次失敗（原因在 work/.look/run.log 最後幾行）；重跑一次${est}，第二次失敗就停下來回報`, cmd: d.runCmd }
      : { step: 'run', done: false, note: `瘦臉底片要重做（${d.reason}）${est}`, cmd: d.runCmd };
  }
  // 1、2、4、5：look 好了
  if (Array.isArray(plan?.scenes) && plan.scenes.length) return { step: 'build', done: true, note: 'look 好了；plan.json 已經有段落，接著 build', cmd: `node shared/template/tools/build.mjs --project ${projArg(proj)}` };
  const cards = statOf(path.join(projectDir, 'work', FRAMING_PREVIEW)), look = d.row === 5 ? statOf(d.P.footage) : null;
  if (cards && (!look || cards.mtimeMs >= look.mtimeMs)) return { step: 'next', done: true, note: 'look 和構圖預覽都做好了；照專案進度往下', cmd: `node shared/template/tools/status.mjs --project ${projArg(proj)}` };
  return { step: 'framing', done: true, note: 'look 好了；接著跑構圖分析，再開影片編輯器，把構圖台網址和 work/look-preview.jpg 一起給使用者（停點 ②）', cmd: `node shared/template/tools/qc.mjs framing --project ${projArg(proj)}` };
}
export const nextLines = (ns) => [`→ 下一步：${ns.note}`, ns.cmd];
// 指令裡的專案路徑：有空白或 shell 特殊字元就加雙引號（zsh、PowerShell 都吃），整行複製才跑得動
export const projArg = (p) => (/[\s"'&|;()<>$`]/.test(p) ? `"${p}"` : p);

// ---------- 變形（analysis/scripts/warp.mjs 移植；contracts/look.md §6.4） ----------

const interp = (x, xs, ys) => { if (x <= xs[0]) return ys[0]; for (let i = 1; i < xs.length; i++) if (x <= xs[i]) { const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1]); return ys[i - 1] + t * (ys[i] - ys[i - 1]); } return ys[ys.length - 1]; };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], dot = (a, b) => a[0] * b[0] + a[1] * b[1], norm = (a) => Math.hypot(a[0], a[1]);
const mean = (pts) => pts.reduce((s, p) => [s[0] + p[0] / pts.length, s[1] + p[1] / pts.length], [0, 0]);

export const faceWidth = (lm) => norm(sub(lm[234], lm[454]));
export const faceCenter = (lm) => [(lm[1][0] + lm[168][0]) / 2, (lm[1][1] + lm[168][1]) / 2];
export function yawOf(lm) {
  const d = sub(lm[152], lm[168]), L = norm(d) || 1, u = [d[0] / L, d[1] / L], v = [-u[1], u[0]];
  const dL = Math.abs(dot(sub(lm[1], lm[234]), v)), dR = Math.abs(dot(sub(lm[454], lm[1]), v));
  return dL + dR > 0 ? (dL - dR) / (dL + dR) : 0;
}

export function controlPoints(lm, s) {
  const k = s / JY_REF;
  const eye = mean([33, 133, 362, 263].map((i) => lm[i]));
  const top = lm[168], chin = lm[152];
  const L = norm(sub(chin, top)), u = [(chin[0] - top[0]) / L, (chin[1] - top[1]) / L], v = [-u[1], u[0]];
  const ec = dot(sub(chin, eye), u), fw = faceWidth(lm);
  const src = [], dst = [], moved = new Map();
  for (const i of [...MOVE, ...LIFT_ONLY]) {
    const p = lm[i], t = dot(sub(p, top), u), a = [top[0] + t * u[0], top[1] + t * u[1]];
    const side = Math.sign(dot(sub(p, a), v)), h = dot(sub(p, eye), u) / ec;
    const inward = LIFT_ONLY.includes(i) ? 0 : k * interp(h, H_TAB, IN_TAB) * fw, up = k * interp(h, H_TAB, UP_TAB) * fw;
    const q = [p[0] - side * inward * v[0] - up * u[0], p[1] - side * inward * v[1] - up * u[1]];
    src.push(p); dst.push(q); moved.set(i, q);
  }
  for (const i of FIX) { src.push(lm[i]); dst.push(lm[i]); }
  const c = mean(OVAL.map((i) => lm[i]));
  for (const i of OVAL) { const q = [c[0] + 1.7 * (lm[i][0] - c[0]), c[1] + 1.7 * (lm[i][1] - c[1])]; src.push(q); dst.push(q); }
  const fh = norm(sub(chin, lm[10]));
  for (const t of [-0.35, 0, 0.35]) { const q = [chin[0] + 0.45 * fh * u[0] + t * fw * v[0], chin[1] + 0.45 * fh * u[1] + t * fw * v[1]]; src.push(q); dst.push(q); }
  return { src, dst, fw, moved };
}

function solve(A, B) {   // 高斯消去（部分選主元），A: n×n，B: n×2
  const n = A.length;
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [B[c], B[p]] = [B[p], B[c]];
    for (let r = c + 1; r < n; r++) { const f = A[r][c] / A[c][c]; if (!f) continue; for (let k = c; k < n; k++) A[r][k] -= f * A[c][k]; B[r][0] -= f * B[c][0]; B[r][1] -= f * B[c][1]; }
  }
  const X = Array.from({ length: n }, () => [0, 0]);
  for (let r = n - 1; r >= 0; r--) { let a = B[r][0], b = B[r][1]; for (let k = r + 1; k < n; k++) { a -= A[r][k] * X[k][0]; b -= A[r][k] * X[k][1]; } X[r] = [a / A[r][r], b / A[r][r]]; }
  return X;
}

export const gridStep = (fw) => Math.min(16, Math.max(4, Math.round(fw / 32)));

// 反向位移場：輸出 (x, y) 從來源 (x + dx, y + dy) 取樣；只算控制點外框 ±2 px 的 ROI
export function field(lm, s, W, H, step) {
  const { src, dst, fw } = controlPoints(lm, s), n = dst.length, sig2 = 2 * (SIGMA * fw) ** 2;
  step = step || gridStep(fw);
  const A = dst.map((a) => dst.map((b) => Math.exp(-((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) / sig2)));
  for (let i = 0; i < n; i++) A[i][i] += 1e-4;
  const w = solve(A, src.map((p, i) => [p[0] - dst[i][0], p[1] - dst[i][1]]));
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of src) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  x0 = Math.max(0, Math.floor(x0) - 2); y0 = Math.max(0, Math.floor(y0) - 2); x1 = Math.min(W, Math.ceil(x1) + 2); y1 = Math.min(H, Math.ceil(y1) + 2);
  if (x1 - x0 < 2 || y1 - y0 < 2) return null;
  const gw = Math.ceil((x1 - x0) / step) + 2, gh = Math.ceil((y1 - y0) / step) + 2, G = new Float32Array(gw * gh * 2);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    const X = x0 + gx * step, Y = y0 + gy * step; let dx = 0, dy = 0;
    for (let i = 0; i < n; i++) { const e = Math.exp(-((X - dst[i][0]) ** 2 + (Y - dst[i][1]) ** 2) / sig2); dx += e * w[i][0]; dy += e * w[i][1]; }
    G[(gy * gw + gx) * 2] = dx; G[(gy * gw + gx) * 2 + 1] = dy;
  }
  return { x0, y0, x1, y1, step, gw, gh, G, fw };
}

export function maxDisp(F) {
  if (!F) return 0;
  let m = 0;
  for (let i = 0; i < F.G.length; i += 2) m = Math.max(m, Math.hypot(F.G[i], F.G[i + 1]));
  return m;
}

// 位移統計（rough-look 與對照圖共用）：items＝[{ m: 這格最大位移 px, r: m ÷ 這格臉寬, t: 秒 }]
export function dispSummary(items) {
  if (!items.length) return { n: 0, med: 0, mx: 0, mxAt: 0, mxR: 0, p95: 0 };
  const ms = items.map((x) => x.m).sort((a, b) => a - b), rs = items.map((x) => x.r).sort((a, b) => a - b);
  const top = items.reduce((a, b) => (b.m > a.m ? b : a));
  return { n: items.length, med: ms[ms.length >> 1], mx: top.m, mxAt: top.t, mxR: top.r, p95: rs[Math.min(rs.length - 1, Math.floor(rs.length * 0.95))] };
}
export function dispStats({ track, slim, w, h, lookScale = 1, fps = 30, step = 1 }) {
  const items = [];
  for (let i = 0; i < track.n; i += step) {
    const s = slim * track.weight(i); if (!(s > 0)) continue;
    const F = field(track.lm(i, lookScale), s, w, h); if (!F) continue;
    const m = maxDisp(F); items.push({ m, r: m / F.fw, t: i / fps });
  }
  return dispSummary(items);
}
// ⚠ 看 95 百分位：短暫轉頭的少數格位移比正臉大（yaw 0.3 左右到 1.5–2 倍），不代表整支瘦太多
export const dispWarning = (p95) => (p95 > DISP_WARN
  ? `⚠ 位移 ＝ 臉寬 ${(p95 * 100).toFixed(2)}%（95% 的格；> ${r1(DISP_WARN * 100)}%）→ 瘦臉太強，脖子與領口可能被拉彎；把 slim 調低（plan.json 的 look.slim 或影片編輯器「講者」）`
  : null);

// 一個平面（Y、U、V 或 RGB 交錯）：geom＝{ w, h, ch, stride, offset }，scale＝平面對全解析度的比例（U／V 是 0.5）
// 只改 ROI；先把 ROI 上下的列複製到暫存再寫回
export function warpPlane(buf, geom, F, scale = 1) {
  if (!F) return;
  const { w, h, ch = 1, offset = 0 } = geom, stride = geom.stride || w * ch;
  const { x0, y0, x1, y1, step, gw, gh, G } = F;
  let md = 0;
  for (let i = 0; i < G.length; i++) md = Math.max(md, Math.abs(G[i]));
  const margin = Math.ceil(md * scale) + 2;
  const px0 = Math.max(0, Math.floor(x0 * scale)), px1 = Math.min(w, Math.ceil(x1 * scale));
  const py0 = Math.max(0, Math.floor(y0 * scale)), py1 = Math.min(h, Math.ceil(y1 * scale));
  if (px1 <= px0 || py1 <= py0) return;
  const by0 = Math.max(0, py0 - margin), by1 = Math.min(h, py1 + margin);
  const band = Buffer.from(buf.subarray(offset + by0 * stride, offset + by1 * stride));
  const gxMax = gw - 1.0001, gyMax = gh - 1.0001;
  for (let y = py0; y < py1; y++) {
    const Y = scale === 1 ? y : (y + 0.5) / scale - 0.5;
    const ey = Math.min(Y - y0, y1 - 1 - Y);
    if (ey <= 0) continue;
    const fy = Math.min(gyMax, Math.max(0, (Y - y0) / step)), gy = Math.floor(fy), ty = fy - gy;
    for (let x = px0; x < px1; x++) {
      const X = scale === 1 ? x : (x + 0.5) / scale - 0.5;
      const fe = Math.min(1, Math.min(X - x0, x1 - 1 - X, ey) / 6);
      if (fe <= 0) continue;
      const fx = Math.min(gxMax, Math.max(0, (X - x0) / step)), gx = Math.floor(fx), tx = fx - gx;
      const i00 = (gy * gw + gx) * 2, i10 = i00 + 2, i01 = i00 + gw * 2, i11 = i01 + 2;
      const dx = fe * scale * ((G[i00] * (1 - tx) + G[i10] * tx) * (1 - ty) + (G[i01] * (1 - tx) + G[i11] * tx) * ty);
      const dy = fe * scale * ((G[i00 + 1] * (1 - tx) + G[i10 + 1] * tx) * (1 - ty) + (G[i01 + 1] * (1 - tx) + G[i11 + 1] * tx) * ty);
      let sx = x + dx, sy = y + dy;
      sx = Math.min(w - 1.0001, Math.max(0, sx)); sy = Math.min(by1 - 1.0001, Math.max(by0, sy));
      const ix = Math.floor(sx), iy = Math.floor(sy), ax = sx - ix, ay = sy - iy;
      const ix1 = Math.min(w - 1, ix + 1), iy1 = Math.min(by1 - 1, iy + 1);
      const r0 = (iy - by0) * stride, r1 = (iy1 - by0) * stride, o = offset + y * stride + x * ch;
      for (let c = 0; c < ch; c++) {
        const p00 = band[r0 + ix * ch + c], p10 = band[r0 + ix1 * ch + c], p01 = band[r1 + ix * ch + c], p11 = band[r1 + ix1 * ch + c];
        buf[o + c] = (p00 * (1 - ax) + p10 * ax) * (1 - ay) + (p01 * (1 - ax) + p11 * ax) * ay + 0.5;
      }
    }
  }
}

// ---------- 美顏（磨皮、膚色提亮、淡化黑眼圈）----------
// 只動臉：臉型輪廓（OVAL）裡、扣掉眼睛、眉毛、嘴巴（橢圓），邊緣羽化；眼下另一組橢圓。瘦臉變形之前做（遮罩對原本的 landmark）。
// 磨皮＝保邊平滑：盒狀模糊兩次（≈ 高斯）後，和原值差越小（膚質起伏）權重越大、差大（五官、髮絲邊緣）幾乎不動。
// 數字是 2026-11-03 對 esim-ep2（臉寬 ≈ 254 px）看單格前後對照定的：b＝1 時磨皮 85%、提亮 +7、眼下 +9 並把色偏拉回中性 35%。
export const BEAUTY = { radius: 0.022, sigma: 9, feather: 0.05, mix: 0.85, lift: 7, under: 9, chroma: 0.35 };
const ellipses = (lm, fw) => {
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const eye = (a, b) => ({ c: mid(lm[a], lm[b]), w: norm(sub(lm[a], lm[b])) });
  const L = eye(33, 133), R = eye(362, 263);
  const brow = (o, m) => ({ c: [lm[m][0] + (lm[m][0] - lm[o][0]) * 0.3, lm[m][1] + (lm[m][1] - lm[o][1]) * 0.3], rx: fw * 0.15, ry: fw * 0.05 });
  const mouthC = mid(mid(lm[61], lm[291]), mid(lm[0], lm[17]));
  return {
    excl: [{ c: L.c, rx: L.w * 0.85, ry: L.w * 0.5 }, { c: R.c, rx: R.w * 0.85, ry: R.w * 0.5 }, brow(70, 105), brow(300, 334),
      { c: mouthC, rx: norm(sub(lm[61], lm[291])) * 0.68, ry: Math.max(norm(sub(lm[0], lm[17])) * 0.72, fw * 0.06) }],
    under: [{ c: [L.c[0], L.c[1] + L.w * 0.6], rx: L.w * 0.75, ry: L.w * 0.3 }, { c: [R.c[0], R.c[1] + R.w * 0.6], rx: R.w * 0.75, ry: R.w * 0.3 }],
  };
};
// 盒狀模糊（可分離、邊緣夾住），就地寫回 a；tmp 是同大小的暫存
function boxBlur(a, w, h, r, tmp) {
  if (r < 1) return;
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const o = y * w; let acc = 0;
    for (let k = -r; k <= r; k++) acc += a[o + Math.min(w - 1, Math.max(0, k))];
    for (let x = 0; x < w; x++) { tmp[o + x] = acc / n; acc += a[o + Math.min(w - 1, x + r + 1)] - a[o + Math.max(0, x - r)]; }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += tmp[Math.min(h - 1, Math.max(0, k)) * w + x];
    for (let y = 0; y < h; y++) { a[y * w + x] = acc / n; acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; }
  }
}
// 遮罩（給 w×h 的畫面；chroma 平面傳 scale 0.5 的 landmark）→ { x0, y0, bw, bh, m（臉）, u（眼下）, fw }
export function beautyMasks(lm, w, h) {
  const fw = faceWidth(lm);
  if (!(fw > 8)) return null;
  const oval = OVAL.map((i) => lm[i]), pad = Math.ceil(fw * (BEAUTY.feather + BEAUTY.radius) * 2) + 2;
  const xs = oval.map((p) => p[0]), ys = oval.map((p) => p[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)) - pad), x1 = Math.min(w, Math.ceil(Math.max(...xs)) + pad);
  const y0 = Math.max(0, Math.floor(Math.min(...ys)) - pad), y1 = Math.min(h, Math.ceil(Math.max(...ys)) + pad);
  const bw = x1 - x0, bh = y1 - y0;
  if (bw < 4 || bh < 4) return null;
  const m = new Float32Array(bw * bh), u = new Float32Array(bw * bh), tmp = new Float32Array(bw * bh);
  const { excl, under } = ellipses(lm, fw);
  const inE = (e, x, y) => ((x - e.c[0]) / e.rx) ** 2 + ((y - e.c[1]) / e.ry) ** 2 <= 1;
  for (let y = 0; y < bh; y++) {
    const Y = y0 + y + 0.5, xsct = [];
    for (let i = 0; i < oval.length; i++) {
      const a = oval[i], b = oval[(i + 1) % oval.length];
      if ((a[1] <= Y) !== (b[1] <= Y)) xsct.push(a[0] + ((Y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    }
    xsct.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xsct.length; k += 2) {
      for (let x = Math.max(0, Math.ceil(xsct[k] - x0 - 0.5)); x < Math.min(bw, Math.floor(xsct[k + 1] - x0 + 0.5)); x++) {
        const X = x0 + x + 0.5;
        if (!excl.some((e) => inE(e, X, Y))) m[y * bw + x] = 1;
        if (under.some((e) => inE(e, X, Y))) u[y * bw + x] = 1;
      }
    }
  }
  const rf = Math.max(1, Math.round(fw * BEAUTY.feather));
  boxBlur(m, bw, bh, rf, tmp); boxBlur(m, bw, bh, rf, tmp);
  boxBlur(u, bw, bh, rf, tmp); boxBlur(u, bw, bh, rf, tmp);
  return { x0, y0, bw, bh, m, u, fw };
}
// 亮度（或 RGB 的單一色版）：磨皮＋提亮＋眼下提亮。geom 同 warpPlane（w、h、ch、offset、stride）
export function beautyPlane(buf, geom, M, b, c = 0) {
  if (!M || !(b > 0)) return;
  const { w, ch = 1, offset = 0 } = geom, stride = geom.stride || w * ch;
  const { x0, y0, bw, bh, m, u, fw } = M;
  const v = new Float32Array(bw * bh), tmp = new Float32Array(bw * bh);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) v[y * bw + x] = buf[offset + (y0 + y) * stride + (x0 + x) * ch + c];
  const blur = Float32Array.from(v), r = Math.max(1, Math.round(fw * BEAUTY.radius));
  boxBlur(blur, bw, bh, r, tmp); boxBlur(blur, bw, bh, r, tmp);
  const k2 = 1 / (2 * BEAUTY.sigma * BEAUTY.sigma);
  for (let i = 0; i < v.length; i++) {
    if (m[i] <= 0.002 && u[i] <= 0.002) continue;
    const y = v[i], d = blur[i] - y, room = 1 - y / 255;
    const out = y + b * m[i] * (BEAUTY.mix * Math.exp(-d * d * k2) * d + BEAUTY.lift * room) + b * u[i] * m[i] * BEAUTY.under * room;
    buf[offset + (y0 + Math.floor(i / bw)) * stride + (x0 + (i % bw)) * ch + c] = Math.max(0, Math.min(255, out + 0.5));
  }
}
// 色度（U 或 V）：眼下的色偏往中性（128）拉
export function beautyChroma(buf, geom, M, b) {
  if (!M || !(b > 0)) return;
  const { w, offset = 0 } = geom, stride = geom.stride || w;
  const { x0, y0, bw, bh, m, u } = M;
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const k = b * u[y * bw + x] * m[y * bw + x] * BEAUTY.chroma;
    if (k <= 0.002) continue;
    const o = offset + (y0 + y) * stride + x0 + x;
    buf[o] = buf[o] + (128 - buf[o]) * k + 0.5;
  }
}
// 一格 YUV420（瘦臉之前呼叫）：lm＝這一格的 landmark（亮度平面座標）、lmHalf＝同一格縮一半（色度平面）
export function beautyFrame(cur, W, H, lm, lmHalf, b) {
  const cw = W >> 1, chh = H >> 1;
  beautyPlane(cur, { w: W, h: H }, beautyMasks(lm, W, H), b);
  const Mc = beautyMasks(lmHalf, cw, chh);
  beautyChroma(cur, { w: cw, offset: W * H }, Mc, b);
  beautyChroma(cur, { w: cw, offset: W * H + cw * chh }, Mc, b);
}

// ---------- 讀 landmark（contracts/look.md §6.3） ----------

export function rampWeights(raw, F = FADE_FRAMES) {
  const n = raw.length, w = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let m = raw[i];
    for (let j = Math.max(0, i - F); j <= Math.min(n - 1, i + F); j++) m = Math.min(m, raw[j] + (Math.abs(j - i) / F) * (1 - raw[j]));
    w[i] = m;
  }
  return w;
}

const KERNEL = (() => { const k = [-3, -2, -1, 0, 1, 2, 3].map((d) => Math.exp(-(d * d) / 2)); const s = k.reduce((a, b) => a + b, 0); return k.map((x) => x / s); })();
// frames：每格 Float32Array(116)（x、y 交錯）或 null；只在連續偵測到的段落裡平滑，邊緣用最近的值
export function smoothTrack(frames) {
  const n = frames.length, out = new Array(n).fill(null);
  let i = 0;
  while (i < n) {
    if (!frames[i]) { i++; continue; }
    let j = i; while (j + 1 < n && frames[j + 1]) j++;
    for (let t = i; t <= j; t++) {
      const o = new Float32Array(frames[t].length);
      for (let k = -3; k <= 3; k++) { const f = frames[Math.min(j, Math.max(i, t + k))], wk = KERNEL[k + 3]; for (let c = 0; c < o.length; c++) o[c] += wk * f[c]; }
      out[t] = o;
    }
    i = j + 1;
  }
  return out;
}

export function interpolateEvery2(frames, black = []) {
  const out = frames.slice();
  for (let i = 1; i < out.length; i += 2) {
    if (black[i]) { out[i] = 0; continue; }
    const a = frames[i - 1], b = frames[i + 1];
    if (isObj(a) && isObj(b)) out[i] = { p: a.p.map((v, k) => r1((v + b.p[k]) / 2)), b: a.b.map((v, k) => r1((v + b.b[k]) / 2)), n: Math.max(a.n, b.n), i: 1 };
    else out[i] = null;
  }
  return out;
}

const toSparse = (arr, scale = 1) => { const lm = []; for (let k = 0; k < POINTS.length; k++) lm[POINTS[k]] = [arr[2 * k] * scale, arr[2 * k + 1] * scale]; return lm; };
export const lmFromP = (p, scale = 1) => toSparse(p, scale);

export function loadTrack(src, { lookScale = 1 } = {}) {
  const data = typeof src === 'string' ? JSON.parse(fs.readFileSync(src, 'utf8')) : src;
  const fr = Array.isArray(data.frames) ? data.frames : [];
  const n = fr.length;
  const rawP = fr.map((f) => (isObj(f) && Array.isArray(f.p) ? Float32Array.from(f.p) : null));
  const sm = smoothTrack(rawP);
  const raw = new Float32Array(n), yaw = new Float32Array(n);
  let jit = 0, jn = 0;
  for (let i = 0; i < n; i++) {
    if (!sm[i]) continue;
    const lm = toSparse(sm[i], lookScale);
    const fw = faceWidth(lm);
    yaw[i] = yawOf(lm);
    raw[i] = fw < MIN_FACE_PX ? 0 : Math.abs(yaw[i]) > YAW_HALF ? 0.5 : 1;
    for (let k = 0; k < sm[i].length; k += 2) { jit += Math.hypot(sm[i][k] - rawP[i][k], sm[i][k + 1] - rawP[i][k + 1]); jn++; }
  }
  const w = rampWeights(raw, FADE_FRAMES);
  return {
    meta: data, n, raw, w, yaw, jitter: jn ? jit / jn : 0,
    has: (i) => i >= 0 && i < n && !!sm[i],
    lm: (i, scale = lookScale) => (i >= 0 && i < n && sm[i] ? toSparse(sm[i], scale) : null),
    rawLm: (i, scale = lookScale) => (i >= 0 && i < n && rawP[i] ? toSparse(rawP[i], scale) : null),
    weight: (i) => (i >= 0 && i < n ? w[i] : 0),
  };
}

// ---------- 瘦臉底片（contracts/look.md §5.4、§6.1） ----------

const tailStr = (s, n = 300) => String(s ?? '').trim().slice(-n);
export function renderLookFootage({ projectDir, track, slim, beauty = 0, onProgress = () => {}, signal } = {}) {
  const P = statePaths(projectDir), V = probeVideo(P.rough), S = lookSize(V.width, V.height);
  const pix = ['yuv420p', 'yuvj420p'].includes(V.pixFmt) ? V.pixFmt : 'yuv420p';
  const W = S.w, H = S.h, cw = W >> 1, chh = H >> 1, FS = W * H + 2 * cw * chh;
  const lookScale = W / V.width;
  const tmp = path.join(P.dir, 'rough-look.tmp.mp4');
  fs.mkdirSync(P.dir, { recursive: true });
  const vf = [`fps=${V.fps}`, ...(S.scaled ? [`scale=${W}:${H}:flags=lanczos`] : []), `format=${pix}`].join(',');
  const g = String(Math.max(1, Math.round(V.fpsExact)));
  const color = [];
  if (V.color.space && V.color.space !== 'unknown') color.push('-colorspace', V.color.space);
  if (V.color.primaries && V.color.primaries !== 'unknown') color.push('-color_primaries', V.color.primaries);
  if (V.color.trc && V.color.trc !== 'unknown') color.push('-color_trc', V.color.trc);
  if (V.color.range && V.color.range !== 'unknown') color.push('-color_range', V.color.range);
  return new Promise((resolve, reject) => {
    const dec = spawn('ffmpeg', ['-v', 'error', '-i', P.rough, '-an', '-sn', '-dn', '-vf', vf, '-f', 'rawvideo', 'pipe:1'], { windowsHide: true });
    const enc = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', pix, '-s', `${W}x${H}`, '-r', V.fps, '-i', 'pipe:0', '-i', P.rough,
      '-map', '0:v:0', '-map', '1:a:0?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-g', g, '-keyint_min', g, '-pix_fmt', pix, ...color,
      '-c:a', 'copy', '-movflags', '+faststart', tmp], { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
    let decErr = '', encErr = '', failed = null, n = 0, warped = 0;
    const disp = [];
    dec.stderr.on('data', (d) => { decErr += d; });
    enc.stderr.on('data', (d) => { encErr += d; });
    const fail = (msg) => { if (failed) return; failed = msg; try { dec.kill(); } catch { /* */ } try { enc.kill(); } catch { /* */ } };
    if (signal) signal.addEventListener('abort', () => fail('被中止'), { once: true });
    let cur = Buffer.allocUnsafe(FS), off = 0;
    const t0 = Date.now();
    dec.stdout.on('data', (chunk) => {
      let p = 0;
      while (p < chunk.length) {
        const k = Math.min(FS - off, chunk.length - p); chunk.copy(cur, off, p, p + k); off += k; p += k;
        if (off < FS) break;
        const s = slim * track.weight(n), bt = beauty * track.weight(n), lm = s > 0 || bt > 0 ? track.lm(n, lookScale) : null;
        if (lm && bt > 0) beautyFrame(cur, W, H, lm, track.lm(n, lookScale / 2), bt);   // 美顏在變形之前（遮罩對原本的臉）
        if (lm && s > 0) {
          const F = field(lm, s, W, H);
          if (F) {
            warpPlane(cur, { w: W, h: H, ch: 1, offset: 0 }, F, 1);
            warpPlane(cur, { w: cw, h: chh, ch: 1, offset: W * H }, F, 0.5);
            warpPlane(cur, { w: cw, h: chh, ch: 1, offset: W * H + cw * chh }, F, 0.5);
            const m = maxDisp(F); disp.push({ m, r: m / F.fw, t: n / V.fpsExact }); warped++;
          }
        }
        n++;
        if (!enc.stdin.write(cur)) { dec.stdout.pause(); enc.stdin.once('drain', () => dec.stdout.resume()); }
        cur = Buffer.allocUnsafe(FS); off = 0;
        onProgress({ done: n, total: V.frames, elapsed: (Date.now() - t0) / 1000 });
      }
    });
    enc.stdin.on('error', () => { /* 編碼端先結束時，錯誤由 close 處理 */ });
    dec.on('close', (code) => { if (code !== 0 && !failed) fail(`ffmpeg 解碼失敗：${tailStr(decErr)}`); enc.stdin.end(); });
    enc.on('close', (code) => {
      if (!failed && code !== 0) failed = `ffmpeg 編碼失敗：${tailStr(encErr)}`;
      if (failed) { try { fs.rmSync(tmp, { force: true }); } catch { /* */ } return reject(new Error(failed)); }
      // 驗：畫面軌的格數＝送進編碼器的格數（掉格）、畫面軌結束時間和 rough.mp4 的畫面軌差 ≤ 1 格（音軌是 copy，不看 format 長度；審查 C-11）
      const o = probeV0(tmp), a = o.duration, b = probeV0(P.rough).duration || V.duration;
      const redo = '→ 沒有換上去；重跑一次，第二次失敗就停下來回報（附 work/.look/run.log）';
      const bad = o.frames && o.frames !== n ? `rough-look.mp4 的畫面有 ${o.frames} 格，送進編碼器的是 ${n} 格（掉格）${redo}`
        : !(Math.abs(a - b) <= 1 / V.fpsExact + 0.05) ? `rough-look.mp4 長度 ${a.toFixed(2)} 秒，rough.mp4 ${b.toFixed(2)} 秒，差 ${Math.abs(a - b).toFixed(2)} 秒（> 1 格）${redo}` : null;
      if (bad) {
        try { fs.rmSync(tmp, { force: true }); } catch { /* */ }
        return reject(new Error(bad));
      }
      renameRetry(tmp, P.footage);
      const D = dispSummary(disp), r4 = (x) => Math.round(x * 10000) / 10000;
      resolve({ frames: n, warped, width: W, height: H, scaled: S.scaled, srcWidth: V.width, srcHeight: V.height, duration: a, diff: Math.abs(a - b),
        maxDisp: r1(D.mx), maxDispRatio: r4(D.mxR), maxDispAt: Math.round(D.mxAt * 1000) / 1000, medianDisp: r1(D.med), dispP95Ratio: r4(D.p95),
        elapsedSec: (Date.now() - t0) / 1000 });
    });
  });
}
// 畫面軌的格數與結束時間（start_time＋duration：auto-editor 的 rough.mp4 畫面軌可能從 1 格後開始，fps 濾鏡會從 0 補齊）
function probeV0(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=nb_frames,duration,start_time:format=duration', '-of', 'json', file], { encoding: 'utf8' });
  try {
    const j = JSON.parse(r.stdout), s = j.streams?.[0] || {};
    return { frames: Number(s.nb_frames) || 0, duration: s.duration != null ? (Number(s.start_time) || 0) + Number(s.duration) : Number(j.format?.duration) || 0 };
  } catch { return { frames: 0, duration: 0 }; }
}

// ---------- 畫面工具（preview 與影片編輯器） ----------

// 一格 rgb24：from rough.mp4 at t，可選裁切（來源像素）、縮放、套 LUT
export function grabRgb(file, { at = 0, crop = null, width, height, lut = null }) {
  const vf = [];
  if (crop) vf.push(`crop=${crop[2]}:${crop[3]}:${crop[0]}:${crop[1]}`);
  if (width && height) vf.push(`scale=${width}:${height}:flags=bicubic`);
  if (lut) vf.push(lut3dFilter(lut));
  vf.push('format=rgb24');
  const args = ['-v', 'error'];
  if (at > 0) args.push('-ss', at.toFixed(4));
  args.push('-i', file, '-frames:v', '1', '-vf', vf.join(','), '-f', 'rawvideo', 'pipe:1');
  const r = spawnSync('ffmpeg', args, { maxBuffer: 1 << 30 });
  if (r.error) throw r.error;
  if (r.status !== 0 || !r.stdout?.length) throw new Error(`抽不到 ${path.basename(file)} 第 ${at.toFixed(2)}s 的畫面：${tailStr(r.stderr?.toString())} → 確認 ${path.basename(file)} 能播；第二次失敗就停下來回報`);
  return r.stdout;
}

function resample(src, sw, sh, sx, sy, side, out) {   // 雙線性：從 src 的正方形 (sx, sy, side) 縮成 out
  const { w, h, data } = out;
  for (let y = 0; y < h; y++) {
    const fy = Math.min(sh - 1.001, Math.max(0, sy + ((y + 0.5) * side) / h - 0.5)), iy = Math.floor(fy), ay = fy - iy;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(sw - 1.001, Math.max(0, sx + ((x + 0.5) * side) / w - 0.5)), ix = Math.floor(fx), ax = fx - ix;
      const p = (iy * sw + ix) * 3, q = p + sw * 3, o = (y * w + x) * 3;
      for (let c = 0; c < 3; c++) data[o + c] = (src[p + c] * (1 - ax) + src[p + 3 + c] * ax) * (1 - ay) + (src[q + c] * (1 - ax) + src[q + 3 + c] * ax) * ay + 0.5;
    }
  }
  return out;
}

function line(c, x0, y0, x1, y1, rgb, wdt = 2) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  for (let k = 0; k <= n; k++) {
    const x = Math.round(x0 + ((x1 - x0) * k) / n), y = Math.round(y0 + ((y1 - y0) * k) / n);
    for (let dy = 0; dy < wdt; dy++) for (let dx = 0; dx < wdt; dx++) {
      const X = x + dx - (wdt >> 1), Y = y + dy - (wdt >> 1);
      if (X < 0 || Y < 0 || X >= c.w || Y >= c.h) continue;
      const o = (Y * c.w + X) * 3; c.data[o] = rgb[0]; c.data[o + 1] = rgb[1]; c.data[o + 2] = rgb[2];
    }
  }
}
function polyline(c, pts, rgb) { for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; line(c, a[0], a[1], b[0], b[1], rgb); } }

// 臉部特寫：from rgb 全圖（W×H），以臉中心、邊長 2.4 × 臉寬，縮成 size；slim > 0 先變形
export function faceCrop(rgb, W, H, lm, s, size = 360, { lines = false, beauty = 0 } = {}) {
  const fw = faceWidth(lm), [cx, cy] = faceCenter(lm), side = Math.max(8, 2.4 * fw);
  const m = Math.ceil(1.8 * fw);
  const rx = Math.max(0, Math.floor(cx - m)), ry = Math.max(0, Math.floor(cy - m)), rw = Math.min(W, Math.ceil(cx + m)) - rx, rh = Math.min(H, Math.ceil(cy + m)) - ry;
  const sub0 = Buffer.allocUnsafe(rw * rh * 3);
  for (let y = 0; y < rh; y++) rgb.copy(sub0, y * rw * 3, ((ry + y) * W + rx) * 3, ((ry + y) * W + rx + rw) * 3);
  const local = []; for (const i of POINTS) local[i] = [lm[i][0] - rx, lm[i][1] - ry];
  let cp = null;
  if (beauty > 0) { const M = beautyMasks(local, rw, rh); for (let c = 0; c < 3; c++) beautyPlane(sub0, { w: rw, h: rh, ch: 3 }, M, beauty, c); }   // 預覽用 RGB 三個色版各做一次（不拉色度）
  if (s > 0) { const F = field(local, s, rw, rh); warpPlane(sub0, { w: rw, h: rh, ch: 3 }, F, 1); cp = controlPoints(local, s); }
  const out = resample(sub0, rw, rh, cx - side / 2 - rx, cy - side / 2 - ry, side, { w: size, h: size, data: Buffer.alloc(size * size * 3) });
  if (lines) {
    const map = (p) => [((p[0] - (cx - side / 2 - rx)) * size) / side, ((p[1] - (cy - side / 2 - ry)) * size) / side];
    polyline(out, OVAL.map((i) => map(local[i])), [0, 255, 0]);
    if (cp) polyline(out, OVAL.map((i) => map(cp.moved.get(i) || local[i])), [255, 60, 60]);
  }
  return out;
}

export function jpgBuffer({ w, h, data }, quality = 3) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${w}x${h}`, '-i', 'pipe:0', '-frames:v', '1', '-q:v', String(quality), '-f', 'image2pipe', '-c:v', 'mjpeg', 'pipe:1'], { input: data, maxBuffer: 1 << 26 });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`轉不出 JPEG：${tailStr(r.stderr?.toString())} → 重跑一次；第二次失敗就停下來回報`);
  return r.stdout;
}

const mmss = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(1).padStart(4, '0')}`; };
export { mmss };

// ---------- 對照圖（cli-006 §3） ----------

export function lookPreview({ projectDir, templateDir = DEFAULT_TEMPLATE, plan = {} } = {}) {
  const P = statePaths(projectDir), L = resolveLook({ plan, templateDir }), V = probeVideo(P.rough);
  const st = readState(projectDir);
  const lut = ensureBlendedLut({ projectDir, lutFile: L.lutFile, color: L.color });
  const lms = fs.existsSync(P.landmarks) ? JSON.parse(fs.readFileSync(P.landmarks, 'utf8')) : null;
  const reason0 = lms?.summary?.reason ?? st.landmarks?.summary?.reason;
  const small = reason0 === 'small' || reason0 === 'noface';
  if (!lms && !small) throw new Error(`還沒偵測臉部 → 先跑 node shared/template/tools/look.mjs run --project ${projArg(projectLabel(projectDir, templateDir))}`);
  const S = lookSize(V.width, V.height), lookScale = S.w / V.width;
  const track = lms && lms.frames?.length ? loadTrack(lms, { lookScale }) : null;
  const slimOn = L.slim > 0 && lms?.summary?.slimOk !== false && !!track;
  const dur = V.duration, n = track ? track.n : V.frames, fps = V.fpsExact;
  const nearest = (i) => { if (!track) return { i, ok: false }; for (let d = 0; d <= Math.round(2 * fps); d++) for (const j of [i - d, i + d]) if (track.has(j)) return { i: j, ok: true }; return { i, ok: false }; };
  const picks = [0.05, 0.5, 0.95].map((f, k) => ({ label: ['頭', '中', '尾'][k], ...nearest(Math.min(n - 1, Math.round(f * dur * fps))) }));
  if (track && !small) {
    const cs = []; for (let i = 0; i < track.n; i++) if (track.has(i)) { const lm = track.lm(i, 1); cs.push({ i, c: faceCenter(lm), fw: faceWidth(lm) }); }
    if (cs.length) {
      const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
      const mc = [med(cs.map((q) => q.c[0])), med(cs.map((q) => q.c[1]))], mfw = med(cs.map((q) => q.fw));
      cs.sort((a, b) => Math.hypot(b.c[0] - mc[0], b.c[1] - mc[1]) - Math.hypot(a.c[0] - mc[0], a.c[1] - mc[1]));
      const gap = 2 * fps;
      for (const q of cs) {
        if (picks.length >= 6) break;
        if (picks.every((p) => Math.abs(p.i - q.i) >= gap)) picks.push({ label: '頭偏離最大', i: q.i, ok: true, dev: Math.hypot(q.c[0] - mc[0], q.c[1] - mc[1]) / mfw });
      }
    }
  }
  // 欄寬依來源比例（009 FR-101）：直拍 360×640，其他 640×360
  const tall = V.height > V.width, pw = tall ? 360 : 640, ph = tall ? 640 : 360, fz = 360, gap = 10, bar = 30;
  const Wc = gap + pw + gap + pw + gap + fz + gap, Hc = gap + picks.length * (bar + ph + gap);
  const c = canvas(Wc, Hc, [11, 16, 32]);
  const fit = (w, h) => { const k = Math.min(pw / w, ph / h); return [Math.max(2, Math.round((w * k) / 2) * 2), Math.max(2, Math.round((h * k) / 2) * 2)]; };
  const [tw, th] = fit(V.width, V.height);
  picks.forEach((pk, r) => {
    const y0 = gap + r * (bar + ph + gap), t = pk.i / fps;
    fillRect(c, gap, y0, Wc - 2 * gap, bar, [30, 39, 64]);
    text(c, mmss(t), gap + 8, y0 + 5, 3, [255, 212, 0]);
    const orig = grabRgb(P.rough, { at: t });
    const graded = lut ? grabRgb(P.rough, { at: t, lut }) : Buffer.from(orig);
    const lm = pk.ok && track ? track.lm(pk.i, 1) : null, s = slimOn && lm ? L.slim * track.weight(pk.i) : 0;
    const applied = Buffer.from(graded), bt = lm && L.beauty > 0 && lms?.summary?.slimOk !== false ? L.beauty * track.weight(pk.i) : 0;
    if (lm && bt > 0) { const M = beautyMasks(lm, V.width, V.height); for (let ch = 0; ch < 3; ch++) beautyPlane(applied, { w: V.width, h: V.height, ch: 3 }, M, bt, ch); }
    if (lm && s > 0) warpPlane(applied, { w: V.width, h: V.height, ch: 3 }, field(lm, s, V.width, V.height), 1);
    const panel = (buf) => { const o = { w: tw, h: th, data: Buffer.alloc(tw * th * 3) }; resampleRect(buf, V.width, V.height, o); return o; };
    blit(c, panel(orig), gap + (pw - tw) / 2 | 0, y0 + bar + ((ph - th) / 2 | 0));
    blit(c, panel(applied), gap * 2 + pw + ((pw - tw) / 2 | 0), y0 + bar + ((ph - th) / 2 | 0));
    if (lm) blit(c, faceCrop(graded, V.width, V.height, lm, s, fz, { lines: true, beauty: bt }), gap * 3 + pw * 2, y0 + bar);
    else fillRect(c, gap * 3 + pw * 2, y0 + bar, fz, ph, [40, 20, 20]);
  });
  writeJpg(c, P.preview, 2);
  // 印的行
  const lines = [], warnings = [];

  const desc = picks.map((p, k) => (k < 3 ? `${p.label} ${mmss(p.i / fps)}` : mmss(p.i / fps)));
  const head = desc.slice(0, 3).join('、') + (desc.length > 3 ? `、頭偏離最大 ${desc.slice(3).join('／')}` : '');
  if (small || !track) {
    const fwv = Math.round(lms?.summary?.lookFaceWidth ?? st.landmarks?.summary?.lookFaceWidth ?? 0);
    lines.push(`講者對照圖：work/look-preview.jpg（${picks.length} 列：只有調光 ${fmtNum(L.color)}；瘦臉略過：${reason0 === 'noface' ? '抽樣 12 格都沒偵測到臉' : `臉寬 ${fwv} px < ${MIN_FACE_PX} px`}）`);
    return { file: P.preview, lines, warnings };
  }
  lines.push(`講者對照圖：work/look-preview.jpg（${picks.length} 列：${head}）`);
  lines.push(`  欄：原圖｜套用後（調光 ${fmtNum(L.color)}＋瘦臉 ${slimOn ? fmtNum(L.slim) : '0'}＋美顏 ${L.beauty > 0 && lms?.summary?.slimOk !== false ? fmtNum(L.beauty) : '0'}）｜臉部放大＋輪廓（綠＝原本、紅＝套用後）`);
  const sum = lms.summary || {};
  lines.push(`偵測率：${pct(sum.rate || 0)}（${sum.detected}／${track.n - (sum.black || 0)} 格；全黑 ${sum.black || 0} 格不算）`);
  const gaps = []; let a = -1;
  for (let i = 0; i <= track.n; i++) {
    const miss = i < track.n && lms.frames[i] === null;
    if (miss && a < 0) a = i;
    if (!miss && a >= 0) { if (i - a >= 3) gaps.push([a, i]); a = -1; }
  }
  lines.push(`未偵測區間：${gaps.length} 段${gaps.length ? ' → ' + gaps.slice(0, 10).map(([x, y]) => `${mmss(x / fps)}–${mmss(y / fps)}`).join('、') + (gaps.length > 10 ? `、…還有 ${gaps.length - 10} 段` : '') : ''}`);
  if (slimOn) {
    // 瘦臉底片是最新的：用 renderLookFootage 逐格算好的數字（和 state.json 一致）；不是最新（例如改了 slim 還沒 run）才抽樣 600 格估（審查 C-05）
    const ft = st.footage, step = Math.max(1, Math.floor(track.n / 600));
    const D = footageFresh(st, P, modelSha(templateDir), L.slim) && num(ft?.dispP95Ratio)
      ? { all: true, n: ft.warped ?? track.n, med: ft.medianDisp, mx: ft.maxDisp, mxAt: ft.maxDispAt, mxR: ft.maxDispRatio, p95: ft.dispP95Ratio }
      : { all: step === 1, ...dispStats({ track, slim: L.slim, w: S.w, h: S.h, lookScale, fps, step }) };
    lines.push(`每格最大位移（${D.all ? '全部' : '抽樣'} ${D.n} 格）：中位數 ${r1(D.med)} px、最大 ${r1(D.mx)} px（${mmss(D.mxAt)}），＝臉寬 ${(D.mxR * 100).toFixed(2)}%（95% 的格 ≤ ${(D.p95 * 100).toFixed(2)}%）`);
    const w = dispWarning(D.p95);
    if (w) warnings.push(w);
  }
  const fwMed = sum.lookFaceWidth || sum.medianFaceWidth || 1;
  lines.push(`抖動（平滑去掉的量）：${track.jitter.toFixed(2)} px（臉寬 ${((track.jitter / (fwMed / lookScale)) * 100).toFixed(2)}%）`);
  if ((sum.rate || 0) < RATE_WARN) warnings.push(`⚠ 偵測率 ${pct(sum.rate || 0)}（< ${RATE_WARN * 100}%）→ 看對照圖的未偵測區間；這些地方瘦臉會自動淡掉，不會跳`);
  const multi = lms.frames.filter((f) => isObj(f) && f.n > 1).length;
  if (multi) warnings.push(`⚠ 有 ${multi} 格偵測到 2 張以上的臉（只瘦最大的那張）`);
  return { file: P.preview, lines, warnings };
}
function resampleRect(src, sw, sh, out) {
  const { w, h, data } = out;
  for (let y = 0; y < h; y++) {
    const fy = Math.min(sh - 1.001, Math.max(0, ((y + 0.5) * sh) / h - 0.5)), iy = Math.floor(fy), ay = fy - iy;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(sw - 1.001, Math.max(0, ((x + 0.5) * sw) / w - 0.5)), ix = Math.floor(fx), ax = fx - ix;
      const p = (iy * sw + ix) * 3, q = p + sw * 3, o = (y * w + x) * 3;
      for (let c = 0; c < 3; c++) data[o + c] = (src[p + c] * (1 - ax) + src[p + 3 + c] * ax) * (1 - ay) + (src[q + c] * (1 - ax) + src[q + 3 + c] * ax) * ay + 0.5;
    }
  }
}

// ---------- 影片編輯器：單格前後對照（contracts/look.md §7.3） ----------

// size：輸出邊長（'auto'＝照臉在原畫面的大小，240–720）；withBox：回傳 { jpg, box: [x, y, 邊長] }（原畫面像素，構圖台把它疊回影片上）
export function faceImage({ projectDir, t = 0, slim = 0, beauty = 0, cache = {}, size = 360, withBox = false }) {
  const P = statePaths(projectDir);
  const st = statOf(P.landmarks);
  const proj = projectLabel(projectDir);
  if (!st) return { error: 'nolandmarks', message: `還沒偵測臉部 → 請 AI 跑 node shared/template/tools/look.mjs run --project ${projArg(proj)}` };
  const key = `${st.size}|${st.mtimeMs}`;
  if (cache.trackKey !== key) {
    const data = JSON.parse(fs.readFileSync(P.landmarks, 'utf8'));
    cache.track = data.frames?.length ? loadTrack(data, { lookScale: 1 }) : null;
    cache.trackKey = key; cache.frames = new Map();
  }
  const track = cache.track;
  if (!track) return { error: 'nolandmarks', message: `還沒逐格偵測臉部（臉太小時只有抽樣）→ 請 AI 跑 node shared/template/tools/look.mjs run --project ${projArg(proj)}` };
  const V = probeVideo(P.rough), i = Math.min(track.n - 1, Math.max(0, Math.floor(t * V.fpsExact + 1e-3)));   // 和瀏覽器暫停在 t 時顯示的那一格一樣（t 落在哪一格的時間內）
  const lm = track.lm(i, 1);
  if (!lm) return { error: 'noface', message: '這一格沒偵測到臉（低頭、側身或只有聲音的畫面）→ 換一格再看' };
  if (!cache.frames.has(i)) {
    if (cache.frames.size >= 4) cache.frames.delete(cache.frames.keys().next().value);
    cache.frames.set(i, grabRgb(P.rough, { at: i / V.fpsExact }));
  }
  const s = Math.max(0, Math.min(1.2, Number(slim) || 0)) * track.weight(i), bt = Math.max(0, Math.min(1, Number(beauty) || 0)) * track.weight(i);
  const side = Math.max(8, 2.4 * faceWidth(lm)), [cx, cy] = faceCenter(lm);
  const px = size === 'auto' ? Math.round(Math.min(720, Math.max(240, side))) : size;
  const jpg = jpgBuffer(faceCrop(cache.frames.get(i), V.width, V.height, lm, s, px, { beauty: bt }), 3);
  return withBox ? { jpg, box: [cx - side / 2, cy - side / 2, side].map((v) => Math.round(v * 10) / 10) } : jpg;
}
