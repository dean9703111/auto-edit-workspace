#!/usr/bin/env node
// 產生 shared/sfx/ 的音效（作者維護用；剪片時不要跑）。只用 Node 22 內建模組＋ffmpeg／ffprobe。
// 規格：specs/005-sfx/spec.md FR-010～014、FR-034～036；指令與訊息原文：specs/contracts/cli-005.md §1。
//
//   node dev/tools/make-sfx.mjs --list
//   node dev/tools/make-sfx.mjs --candidates --only <名稱> --out <工作區外的資料夾> [--ref <參考.wav>] [--voice <人聲>]
//   node dev/tools/make-sfx.mjs --write --only <名稱,…>
//
// 路線：B＝CC0 素材下載後加工（Kenney 包）；C＝程式合成（固定亂數種子，同一台機器每次位元組相同）。
// 凍結的 8 顆（pop tick swipe whoosh flip type glitch riser）由舊的 make_sfx.py 產生，這裡沒有配方、不能重產。
// 試聽檔（--candidates）一定寫在工作區外：A/B 會混入剪映原音，不能進 repo（憲法 VII）。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WS = path.resolve(HERE, '..', '..');
const SFX_DIR = path.join(WS, 'shared', 'sfx');
const KIT = path.join(WS, 'shared', 'template', 'kit', 'sfx.json');
const SR = 48000;
const TP_CEIL = -1.2;    // true peak 上限（dBTP），比 −1 再留 0.2 dB 給量測差（沿用 make_sfx.py）
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const CC0 = { license: 'CC0 1.0', license_url: 'https://creativecommons.org/publicdomain/zero/1.0/' };
const FROZEN = ['pop', 'tick', 'swipe', 'whoosh', 'flip', 'type', 'glitch', 'riser'];

// 試聽後要換，就改這裡（值是 RECIPES 的候選 id）；A/B 紀錄在 specs/005-sfx/research.md
const CHOICE = {
  ding: 'ding-a', alert: 'alert-a', success: 'success-a', click: 'click-a',
  impact: 'impact-c', chapter: 'chapter-c',
  sparkle: 'sparkle-a', shine: 'shine-d', thunder: 'thunder-c', 'bgm-outro': 'bgm-d',
};

// Kenney 包（sha256 沿用 make_sfx.py 已核對的值；檔名在 specs/005-sfx/research.md「Kenney 檔名核對」）
const PACKS = {
  'kenney-ui': { slug: 'ui-audio', pack: 'Kenney UI Audio', file: 'ui-audio.zip', sha256: '946fc23a63d535d693eb31b2eabb80c8c28d6351e2186b344ceb71b2cb1d5eb6' },
  'kenney-interface': { slug: 'interface-sounds', pack: 'Kenney Interface Sounds 1.0', file: 'interface-sounds.zip', sha256: 'f2193d072726d6758a5f7871b2dcc54dcce0d5c35c6f0a62f92549b327c81232' },
  'kenney-impact': { slug: 'impact-sounds', pack: 'Kenney Impact Sounds 1.0', file: 'impact-sounds.zip', sha256: '029d734af1582474edf3a694d1b0cebc97c1c152f2f39fa34d4c2bafc5de77f8' },
  'kenney-scifi': { slug: 'sci-fi-sounds', pack: 'Kenney Sci-fi Sounds', file: 'sci-fi-sounds.zip', sha256: '119340f351a5098ad814f78719438c0da355a9ce8a4c8a3af6a8d48aa3d49e04' },
  'kenney-jingles': { slug: 'music-jingles', pack: 'Kenney Music Jingles', file: 'music-jingles.zip', sha256: 'b729ba57959bd58793d2c5cafa348aaf2655d354f3da35ec4729e03ec77197b8' },
};
const pageUrl = (k) => `https://kenney.nl/assets/${PACKS[k].slug}`;
const dlUrl = (k) => `https://kenney.nl/download-link/${Buffer.from(`assets/${PACKS[k].slug}`).toString('hex')}`;

// ───────────── 參數 ─────────────
const fail = (msg, code = 1) => { process.stderr.write(`✖ ${msg}\n`); process.exit(code); };
const HELP = `產生 shared/sfx/ 的音效（作者維護用；剪片時不要跑）。只用 Node 22＋ffmpeg。

  node dev/tools/make-sfx.mjs --list
  node dev/tools/make-sfx.mjs --candidates --only <名稱> --out <工作區外的資料夾> [--ref <參考.wav>] [--voice <人聲>]
  node dev/tools/make-sfx.mjs --write --only <名稱,…>

--candidates  產生候選與 A/B 試聽檔（參考→候選→參考，都調到成片大小）＋ index.html
--write       把程式裡 CHOICE 選的候選寫進 shared/sfx/、sources.json、kit/sfx.json（peak、volume）、README.md
--cache       原始下載檔的資料夾（預設系統暫存資料夾的 make-sfx-cache）
凍結的 8 顆（pop tick swipe whoosh flip type glitch riser）沒有配方，不能重產。`;

function parseArgs(argv) {
  const o = { only: null };
  const VAL = ['only', 'out', 'ref', 'voice', 'cache'];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { console.log(HELP); process.exit(0); }
    if (['--list', '--candidates', '--write'].includes(a)) { (o.mode ||= []).push(a.slice(2)); continue; }
    const k = a.startsWith('--') ? a.slice(2) : null;
    if (k && VAL.includes(k) && argv[i + 1] != null) { o[k] = argv[++i]; continue; }
    fail(`不認得的參數：${a} → 跑 node dev/tools/make-sfx.mjs --help 看可用的參數`, 2);
  }
  if (!o.mode || o.mode.length !== 1) fail('要選一個：--list、--candidates 或 --write → 例：node dev/tools/make-sfx.mjs --candidates --only ding --out <工作區外的資料夾>', 2);
  o.mode = o.mode[0];
  o.names = o.only ? o.only.split(',').map((s) => s.trim()).filter(Boolean) : Object.keys(RECIPES);
  for (const n of o.names) if (!RECIPES[n]) fail(`「${n}」沒有配方（可用：${Object.keys(RECIPES).join('、')}；凍結的 8 顆不能重產）→ --only 改成可用的名稱`, 2);
  if (o.mode === 'candidates') {
    if (!o.out) fail('--candidates 要給 --out <資料夾> → 放 scratchpad 或系統暫存資料夾，不要放進工作區', 2);
    o.out = path.resolve(o.out);
    const rel = path.relative(fs.realpathSync(WS), realish(o.out));
    if (!rel.startsWith('..') && !path.isAbsolute(rel)) fail(`試聽檔不能放進工作區（--out ${o.out}；A/B 會混入剪映原音，不能進 repo）→ 改放工作區外，例如系統暫存資料夾`, 2);
  }
  if (o.ref && o.names.length !== 1) fail(`--ref 一次只能配一個名稱（現在 --only 有 ${o.names.length} 個）→ 一個名稱跑一次`, 2);
  o.cache = path.resolve(o.cache || path.join(os.tmpdir(), 'make-sfx-cache'));
  return o;
}
// 還不存在的路徑：往上找到存在的那一層再 realpath（macOS 的 /tmp → /private/tmp）
function realish(p) {
  let cur = p, tail = [];
  while (!fs.existsSync(cur)) { tail.unshift(path.basename(cur)); cur = path.dirname(cur); }
  return path.join(fs.realpathSync(cur), ...tail);
}

// ───────────── 數學與緩衝 ─────────────
const dbl = (db) => 10 ** (db / 20);
const N = (sec) => Math.round(sec * SR);
const TAU = 2 * Math.PI;
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const stereo = (n) => ({ L: new Float64Array(n), R: new Float64Array(n) });
const len = (b) => b.L.length;
function addMono(out, x, at = 0, gainDb = 0, pan = 0) {
  const g = dbl(gainDb), gl = g * Math.sqrt(1 - pan), gr = g * Math.sqrt(1 + pan), i0 = N(at);
  for (let i = 0; i < x.length; i++) { const j = i0 + i; if (j < 0 || j >= len(out)) continue; out.L[j] += x[i] * gl; out.R[j] += x[i] * gr; }
  return out;
}
function addStereo(out, s, at = 0, gainDb = 0) {
  const g = dbl(gainDb), i0 = N(at);
  for (let i = 0; i < len(s); i++) { const j = i0 + i; if (j < 0 || j >= len(out)) continue; out.L[j] += s.L[i] * g; out.R[j] += s.R[i] * g; }
  return out;
}
const peakAbs = (b) => { let m = 0; for (let i = 0; i < len(b); i++) m = Math.max(m, Math.abs(b.L[i]), Math.abs(b.R[i])); return m; };
const scale = (b, g) => { for (let i = 0; i < len(b); i++) { b.L[i] *= g; b.R[i] *= g; } return b; };
const normPeak = (b) => { const m = peakAbs(b); return m > 0 ? scale(b, 1 / m) : b; };
function slice(b, a, z) { return { L: b.L.slice(a, z), R: b.R.slice(a, z) }; }
function onsetIdx(b, rel = -40) { const t = peakAbs(b) * dbl(rel); for (let i = 0; i < len(b); i++) if (Math.abs(b.L[i]) > t || Math.abs(b.R[i]) > t) return i; return 0; }
const trimLead = (b) => slice(b, onsetIdx(b), len(b));
const fadeW = (u) => Math.sin(u * Math.PI / 2) ** 2;
function fadeOut(b, sec) { const n = Math.min(len(b), N(sec)); for (let i = 0; i < n; i++) { const g = fadeW(1 - i / n); const j = len(b) - n + i; b.L[j] *= g; b.R[j] *= g; } return b; }
function fadeIn(b, sec) { const n = Math.min(len(b), N(sec)); for (let i = 0; i < n; i++) { const g = fadeW(i / n); b.L[i] *= g; b.R[i] *= g; } return b; }

// ───────────── DSP 基本件 ─────────────
// 帶限方波（奇次諧波到 maxHz）
function squareBL(f, t, maxHz = 8000) { let s = 0; for (let k = 1; k * f < maxHz; k += 2) s += Math.sin(TAU * k * f * t) / k; return s * 4 / Math.PI; }
function onePoleLP(x, fc) { const a = 1 - Math.exp(-TAU * fc / SR); let y = 0; const o = new Float64Array(x.length); for (let i = 0; i < x.length; i++) { y += a * (x[i] - y); o[i] = y; } return o; }
function onePoleHP(x, fc) { const lp = onePoleLP(x, fc); return x.map((v, i) => v - lp[i]); }
// RBJ biquad：bp（0 dB 峰值）、hp
function biquad(x, type, fc, q) {
  const w0 = TAU * fc / SR, al = Math.sin(w0) / (2 * q), c = Math.cos(w0);
  let b0, b1, b2; const a0 = 1 + al, a1 = -2 * c, a2 = 1 - al;
  if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; } else { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; }
  const o = new Float64Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const y = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = x[i]; y2 = y1; y1 = y; o[i] = y; }
  return o;
}
const softclip = (b, drive) => { const k = Math.tanh(drive); for (let i = 0; i < len(b); i++) { b.L[i] = Math.tanh(drive * b.L[i]) / k; b.R[i] = Math.tanh(drive * b.R[i]) / k; } return b; };
const npk = (x) => { let m = 0; for (const v of x) m = Math.max(m, Math.abs(v)); return m > 0 ? x.map((v) => v / m) : x; };   // 單聲道正規化到峰值 1
const white = (n, rnd) => Float64Array.from({ length: n }, () => rnd() * 2 - 1);
// 指數滑音正弦（f0→f1，T 秒內），回傳單聲道
function glideSine(n, f0, f1, T, env) { const o = new Float64Array(n); let ph = 0; for (let i = 0; i < n; i++) { const t = i / SR; const f = t < T ? f0 * (f1 / f0) ** (t / T) : f1; ph += TAU * f / SR; o[i] = Math.sin(ph) * env(t); } return o; }
// PolyBLEP 鋸齒波
function sawBlep(n, f, phase0 = 0) {
  const o = new Float64Array(n), dt = f / SR; let p = phase0;
  const blep = (t) => (t < dt ? (t /= dt, t + t - t * t - 1) : t > 1 - dt ? (t = (t - 1) / dt, t * t + t + t + 1) : 0);
  for (let i = 0; i < n; i++) { o[i] = 2 * p - 1 - blep(p); p += dt; if (p >= 1) p -= 1; }
  return o;
}
// Schroeder 殘響（4 梳狀＋2 全通），單聲道進、單聲道出
function schroeder(x, combsMs, fb = 0.84, apMs = [5.0, 1.7], g = 0.7) {
  const out = new Float64Array(x.length);
  for (const ms of combsMs) { const d = N(ms / 1000), buf = new Float64Array(d); let k = 0; for (let i = 0; i < x.length; i++) { const y = buf[k]; buf[k] = x[i] + y * fb; k = (k + 1) % d; out[i] += y / combsMs.length; } }
  let s = out;
  for (const ms of apMs) { const d = N(ms / 1000), buf = new Float64Array(d); let k = 0; const o = new Float64Array(s.length); for (let i = 0; i < s.length; i++) { const b = buf[k]; const v = s[i] + b * g; o[i] = b - v * g; buf[k] = v; k = (k + 1) % d; } s = o; }
  return s;
}
// 2048 點 FFT（頻譜重心用）
function fftMag(re) {
  const n = re.length, im = new Float64Array(n);
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; } }
  for (let size = 2; size <= n; size <<= 1) {
    const h = size >> 1, ang = -TAU / size;
    for (let i = 0; i < n; i += size) for (let k = 0; k < h; k++) {
      const wr = Math.cos(ang * k), wi = Math.sin(ang * k), a = i + k, b = a + h;
      const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
      re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
    }
  }
  return Float64Array.from({ length: n / 2 }, (_, k) => re[k] * re[k] + im[k] * im[k]);
}
function centroid(b, from = 0, to = Infinity) {
  const W = 2048, a = Math.max(0, N(from)), z = Math.min(len(b), to === Infinity ? len(b) : N(to));
  let num = 0, den = 0;
  for (let s = a; s + W <= z || (s === a && z - a > 0); s += W / 2) {
    const re = new Float64Array(W);
    for (let i = 0; i < W; i++) { const j = s + i; const v = j < z ? (b.L[j] + b.R[j]) / 2 : 0; re[i] = v * (0.5 - 0.5 * Math.cos(TAU * i / (W - 1))); }
    const p = fftMag(re);
    for (let k = 0; k < p.length; k++) { num += p[k] * k * SR / W; den += p[k]; }
    if (s + W > z) break;
  }
  return den > 0 ? Math.round(num / den) : 0;
}

// ───────────── 檔案：WAV、ffmpeg 解碼與量測 ─────────────
function toInt16(b) {
  const n = len(b), out = Buffer.alloc(44 + n * 4);
  out.write('RIFF', 0); out.writeUInt32LE(36 + n * 4, 4); out.write('WAVE', 8); out.write('fmt ', 12);
  out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22); out.writeUInt32LE(SR, 24);
  out.writeUInt32LE(SR * 4, 28); out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34); out.write('data', 36); out.writeUInt32LE(n * 4, 40);
  const q = (v) => Math.round(Math.max(-1, Math.min(1, v)) * 32767);
  for (let i = 0; i < n; i++) { out.writeInt16LE(q(b.L[i]), 44 + i * 4); out.writeInt16LE(q(b.R[i]), 46 + i * 4); }
  return out;
}
// 聲音一律寫成暫存檔再交給 ffmpeg，不從 stdin 餵：同時餵 stdin、讀 stdout 在機器很忙時偶爾會卡死（ffmpeg 一直等 stdin 結束）
const FF_TIMEOUT = 120000;
function ff(args) {
  const r = spawnSync('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 512 * 1024 * 1024, timeout: FF_TIMEOUT });
  if (r.error?.code === 'ENOENT') fail('找不到 ffmpeg → 照 setup/ 手冊安裝');
  return r;
}
const ffErr = (r) => String(r.stderr || '').trim().slice(-200) || (r.error ? `${r.error.code || r.error.message}（${FF_TIMEOUT / 1000} 秒沒結束會被停掉）` : `結束碼 ${r.status}`);
let tmpN = 0;
function withTmp(buf, ext, fn) {
  const p = path.join(os.tmpdir(), `make-sfx-${process.pid}-${tmpN++}${ext}`);
  fs.writeFileSync(p, buf);
  try { return fn(p); } finally { fs.unlinkSync(p); }
}
function decodePath(p) {
  const r = ff(['-v', 'error', '-i', p, '-f', 'f32le', '-ar', String(SR), '-ac', '2', 'pipe:1']);
  if (r.status !== 0) fail(`ffmpeg 解碼失敗：${ffErr(r)} → 確認來源是完整的音檔：Kenney 的刪掉 --cache 裡那個 zip 重新下載，--ref／--voice 的換一個檔`);
  const f = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length / 4);
  const b = stereo(f.length / 2);
  for (let i = 0; i < len(b); i++) { b.L[i] = f[i * 2]; b.R[i] = f[i * 2 + 1]; }
  return b;
}
const decode = (bytes) => withTmp(bytes, '.bin', decodePath);
const decodeFile = (p) => decodePath(path.resolve(p));
function rawF32(b) { const f = new Float32Array(len(b) * 2); for (let i = 0; i < len(b); i++) { f[i * 2] = b.L[i]; f[i * 2 + 1] = b.R[i]; } return Buffer.from(f.buffer); }
// M max（前後補 1 s 靜音）、true peak、整合響度；跟 sources.json、分析報告 03 同一種量法
function measure(b) {
  const r = withTmp(rawF32(b), '.f32', (p) => ff(['-hide_banner', '-nostats', '-f', 'f32le', '-ar', String(SR), '-ac', '2', '-i', p, '-af',
    'adelay=1000:all=1,apad=pad_dur=1,ebur128=peak=true:metadata=1,ametadata=print:key=lavfi.r128.M:file=-', '-f', 'null', '-']));
  if (r.status !== 0) fail(`ffmpeg 量測失敗：${ffErr(r)} → 跑 ffmpeg -version 確認 ffmpeg 能用，不能用就照 setup/ 手冊重裝`);
  let mmax = -Infinity;
  for (const m of String(r.stdout).matchAll(/lavfi\.r128\.M=(-?[\d.]+|-inf)/g)) { const v = Number(m[1]); if (Number.isFinite(v)) mmax = Math.max(mmax, v); }
  const err = String(r.stderr), sum = err.slice(err.lastIndexOf('Summary:'));
  const tp = Number((sum.match(/True peak:\s*Peak:\s*(-?[\d.]+|-inf)/) || [])[1]);
  const I = Number((sum.match(/Integrated loudness:\s*I:\s*(-?[\d.]+)/) || [])[1]);
  let pk = 0, pkI = 0; for (let i = 0; i < len(b); i++) { const v = Math.max(Math.abs(b.L[i]), Math.abs(b.R[i])); if (v > pk) { pk = v; pkI = i; } }
  return { mmax: +mmax.toFixed(1), tp: Number.isFinite(tp) ? tp : -Infinity, I: Number.isFinite(I) ? I : -Infinity, peakSec: +(pkI / SR).toFixed(3), dur: +(len(b) / SR).toFixed(3) };
}

// ───────────── 下載與 zip ─────────────
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
async function fetchPack(key, cacheDir) {
  const p = PACKS[key], file = path.join(cacheDir, p.file);
  let data = fs.existsSync(file) ? fs.readFileSync(file) : null;
  if (!data) {
    console.log(`  下載 ${pageUrl(key)} → ${p.file}`);
    try {
      const r1 = await fetch(pageUrl(key), { headers: { 'User-Agent': UA } });
      const cookie = (r1.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
      const r2 = await fetch(dlUrl(key), { headers: { 'User-Agent': UA, Referer: pageUrl(key), ...(cookie ? { Cookie: cookie } : {}) } });
      if (!r2.ok) throw new Error(`HTTP ${r2.status}`);
      const { url } = JSON.parse(await r2.text());
      const r3 = await fetch(url, { headers: { 'User-Agent': UA, Referer: pageUrl(key) } });
      if (!r3.ok) throw new Error(`HTTP ${r3.status}`);
      data = Buffer.from(await r3.arrayBuffer());
    } catch (e) { fail(`下載失敗：${dlUrl(key)}（${e.message}）→ 手動下載後放到 ${file}，再跑一次`); }
    fs.mkdirSync(cacheDir, { recursive: true });
    if (sha256(data) === p.sha256) fs.writeFileSync(file, data);
  }
  const got = sha256(data);
  if (got !== p.sha256) fail(`sha256 不符：${p.file}（預期 ${p.sha256}，實際 ${got}）→ 來源可能改版；重新挑選並更新配方的 sha256，不要直接改預期值`);
  return data;
}
function zipList(buf) {
  let e = buf.length - 22;
  while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('不是 zip');
  const count = buf.readUInt16LE(e + 10); let o = buf.readUInt32LE(e + 16);
  const m = new Map();
  for (let i = 0; i < count; i++) {
    const nl = buf.readUInt16LE(o + 28), xl = buf.readUInt16LE(o + 30), cl = buf.readUInt16LE(o + 32);
    m.set(buf.toString('utf8', o + 46, o + 46 + nl), { method: buf.readUInt16LE(o + 10), size: buf.readUInt32LE(o + 20), off: buf.readUInt32LE(o + 42) });
    o += 46 + nl + xl + cl;
  }
  return m;
}
function zipRead(buf, name, list = zipList(buf), label = 'zip') {
  const ent = list.get(name);
  if (!ent) {
    const base = path.basename(name).slice(0, 6);
    fail(`${label} 裡沒有 ${name}（相近的有：${[...list.keys()].filter((k) => k.includes(base)).slice(0, 5).join('、') || '無'}）→ 改配方的檔名`);
  }
  const o = ent.off, start = o + 30 + buf.readUInt16LE(o + 26) + buf.readUInt16LE(o + 28);
  const raw = buf.subarray(start, start + ent.size);
  return ent.method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw);
}

// ───────────── 配方 ─────────────
// B 素材：kenney(包, zip 內路徑)；build(ctx) 回傳 stereo 緩衝（處理鏈之前）。ctx.src(i) 取第 i 個素材（已解碼、去前導靜音）
const K = (pack, member) => ({ pack, member });
const env = { // 常用包絡
  rc: (t, a) => (t < a ? 0.5 - 0.5 * Math.cos(Math.PI * t / a) : 1),     // raised-cosine 起音
  ex: (t, tau) => Math.exp(-Math.max(0, t) / tau),
};
const burst = (n, rnd, tau) => { const w = white(n, rnd); return w.map((v, i) => v * Math.exp(-i / SR / tau)); };
// 顆粒（閃粉）：從 t0 到 t1，頻率 fLo→fHi，包絡 g(t)
function grains(out, rnd, { t0 = 0, t1, fLo, fHi, fRise = t1, g, step }) {
  let t = t0;
  while (t < t1) {
    const f = fLo * (fHi / fLo) ** Math.min(1, (t - t0) / (fRise - t0)) * (1 + 0.15 * (rnd() * 2 - 1));
    const d = 0.015 + rnd() * 0.025, n = N(d), x = new Float64Array(n), ph = rnd() * TAU;
    for (let i = 0; i < n; i++) x[i] = Math.sin(ph + TAU * f * i / SR) * Math.exp(-i / SR / (d / 3)) * (i < 48 ? i / 48 : 1);
    addMono(out, x, t, 20 * Math.log10(Math.max(1e-6, g(t) * (0.5 + 0.5 * rnd()))), (rnd() * 2 - 1) * 0.8);
    t += step(t);
  }
  return out;
}
function bell(n, f, { ratios = [1], amps = [1], tau = 0.6, at = 0, gainDb = 0 } = {}, out) {
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) { const t = i / SR; let s = 0; ratios.forEach((r, k) => { s += amps[k] * Math.sin(TAU * f * r * t) * Math.exp(-t / (tau / (1 + k))); }); x[i] = s * (i < 96 ? i / 96 : 1); }
  return addMono(out, x, at, gainDb);
}

const RECIPES = {
  ding: {
    limit: 1.0, target: -20, measure: 'M', targetDb: -12.6,
    candidates: [
      { id: 'ding-a', route: 'C', like: '平穩的電子提示音「滴——」', desc: '正弦 785 Hz、起音 15 ms、持平後慢慢收', build: () => synthDing(0.015, -40) },
      { id: 'ding-b', route: 'C', like: '較圓的電子提示音「滴——」', desc: '同 a，起音 25 ms、2 次諧波 −30 dB', build: () => synthDing(0.025, -30) },
      { id: 'ding-keep', route: 'keep', desc: '現在的 shared/sfx/ding.wav' },
    ],
  },
  alert: {
    limit: 0.4, target: -16, measure: 'M', targetDb: -6.9,
    candidates: [
      { id: 'alert-a', route: 'C', like: '低音電子蜂鳴「嗶-嗶—」', desc: '234 Hz 帶限方波＋117 Hz 正弦，兩聲 80＋160 ms', build: () => synthAlert(234, true) },
      { id: 'alert-b', route: 'C', like: '更低的電子蜂鳴「嗶-嗶—」', desc: '117 Hz 帶限方波，兩聲 80＋160 ms', build: () => synthAlert(117, false) },
      { id: 'alert-c', route: 'B', src: [K('kenney-interface', 'Audio/error_006.ogg')], like: '低沉的「咚」', desc: 'Kenney error_006', build: (c) => c.src(0) },
      { id: 'alert-keep', route: 'keep', desc: '現在的 shared/sfx/alert.wav' },
    ],
  },
  success: {
    limit: 2.0, target: -16, measure: 'M', targetDb: -5.2,   // 長度上限 2026-10-31 放寬（原 1.2 s；剪映參考 1.93 s）
    candidates: [
      { id: 'success-a', route: 'C', like: '鐘琴上行琶音「叮叮叮叮～」', desc: 'C6–D6–G6–C7 四音鐘聲、第一音最大聲', build: () => synthSuccess() },
      { id: 'success-keep', route: 'keep', desc: '現在的 shared/sfx/success.wav（Kenney confirmation_002）' },
    ],
  },
  click: {
    limit: 0.35, target: -24, measure: 'M', targetDb: -19.6,
    candidates: [
      { id: 'click-a', route: 'B', src: [K('kenney-ui', 'Audio/mouseclick1.ogg'), K('kenney-ui', 'Audio/mouserelease1.ogg')], like: '滑鼠按下＋放開「喀-喀」', desc: 'Kenney mouseclick1＋mouserelease1（+0.125 s、−6 dB）', build: (c) => pair(c, 0.125, -6) },
      { id: 'click-b', route: 'B', src: [K('kenney-interface', 'Audio/click_002.ogg'), K('kenney-interface', 'Audio/click_004.ogg')], like: 'UI 點兩下「喀-喀」', desc: 'Kenney click_002＋click_004（+0.125 s、−6 dB）', build: (c) => pair(c, 0.125, -6) },
      { id: 'click-c', route: 'C', like: '乾的點擊「喀-喀」', desc: '兩顆 3 ms 高通雜訊＋4 kHz 共振，相隔 125 ms', build: () => synthClick() },
    ],
  },
  impact: {
    limit: 0.8, target: -16, measure: 'M', targetDb: -6.2,
    candidates: [
      { id: 'impact-a', route: 'B', src: [K('kenney-impact', 'Audio/impactSoft_heavy_001.ogg'), K('kenney-impact', 'Audio/impactSoft_heavy_003.ogg'), K('kenney-impact', 'Audio/impactPunch_heavy_002.ogg')], like: '綜藝大鼓「咚、咚」', desc: 'Kenney 軟重擊兩下（+0.12 s、−1.5 dB）＋重拳補中頻（−8 dB）',
        build: (c) => { const o = stereo(N(0.8)); addStereo(o, normPeak(c.src(0)), 0); addStereo(o, normPeak(c.src(1)), 0.12, -1.5); addStereo(o, normPeak(c.src(2)), 0, -8); return o; } },
      { id: 'impact-b', route: 'B', src: [K('kenney-impact', 'Audio/impactPunch_heavy_000.ogg'), K('kenney-impact', 'Audio/impactPunch_heavy_004.ogg')], like: '兩下重拳「咚、咚」', desc: 'Kenney 重拳兩下（+0.12 s、−1.5 dB）', build: (c) => pair(c, 0.12, -1.5) },
      { id: 'impact-c', route: 'C', like: '合成大鼓「咚、咚」', desc: '130→90 Hz 滑音＋300 Hz 共鳴＋雜訊起音，兩下', build: () => synthImpact() },
      { id: 'impact-keep', route: 'keep', desc: '現在的 shared/sfx/impact.wav' },
    ],
  },
  chapter: {
    limit: 2.5, target: -16, measure: 'M', targetDb: -3,     // 長度上限 2026-10-31 放寬（原 1.3 s；大事件本來就長，CC0 候選 1.3–1.5 s）
    candidates: [
      { id: 'chapter-a', route: 'B+C', src: [K('kenney-scifi', 'Audio/lowFrequency_explosion_000.ogg')], like: '電影感重低音「嘭——」', desc: 'Kenney 低頻爆炸＋合成 60→35 Hz 次低頻', build: (c) => withSub(c.src(0)) },
      { id: 'chapter-b', route: 'B+C', src: [K('kenney-scifi', 'Audio/lowFrequency_explosion_001.ogg')], like: '電影感重低音「嘭——」', desc: 'Kenney 低頻爆炸 001＋合成次低頻', build: (c) => withSub(c.src(0)) },
      { id: 'chapter-c', route: 'C', like: '合成重低音「嘭——」', desc: '次低頻＋140／250 Hz＋2 kHz 爆裂＋7 Hz 顫動', build: () => synthChapter() },
    ],
  },
  sparkle: {
    limit: 2.8, target: -16, measure: 'M', targetDb: -5.9,   // 同上（原 2.0 s；參考 2.74 s）
    candidates: [
      { id: 'sparkle-a', route: 'C', like: '仙女棒閃粉「刷啦啦～」', desc: '6→14 kHz 正弦顆粒由疏到密、0.33 s 到頂、1.8 s 尾韻', build: () => synthSparkle() },
      { id: 'sparkle-b', route: 'B', src: [K('kenney-interface', 'Audio/glass_004.ogg'), K('kenney-interface', 'Audio/glass_001.ogg'), K('kenney-interface', 'Audio/glass_006.ogg')], like: '玻璃碎響', desc: 'Kenney glass_004＋001＋006 錯開', build: (c) => { const o = stereo(N(1.2)); addStereo(o, normPeak(c.src(0)), 0); addStereo(o, normPeak(c.src(1)), 0.1, -4); addStereo(o, normPeak(c.src(2)), 0.2, -6); return o; } },
      { id: 'sparkle-c', route: 'B+C', src: [K('kenney-interface', 'Audio/glass_004.ogg')], like: '閃粉＋玻璃亮點', desc: 'a 的顆粒＋glass_004 疊在 0.30 s', build: (c) => { const o = normPeak(synthSparkle()); addStereo(o, normPeak(c.src(0)), 0.3, -6); return o; } },
    ],
  },
  shine: {
    limit: 2.0, target: -16, measure: 'M', targetDb: -3,     // 同上（原 1.6 s；參考 1.94 s）
    candidates: [
      // a～c：Steel／Pizzicato／Sax 51 顆裡「後 0.3 s 重心 ÷ 前 0.3 s ≥ 1.3、長 ≤ 2 s」只有這 3 顆（research.md「shine 挑選」）
      { id: 'shine-a', route: 'B', src: [K('kenney-jingles', 'Audio/Sax jingles/jingles_SAX02.ogg')], like: '薩克斯風上行短樂句', desc: 'Kenney Music Jingles SAX02（上行 1.63 倍）', build: (c) => c.src(0) },
      { id: 'shine-b', route: 'B', src: [K('kenney-jingles', 'Audio/Pizzicato jingles/jingles_PIZZI16.ogg')], like: '撥弦上行短樂句', desc: 'Kenney Music Jingles PIZZI16（上行 1.50 倍）', build: (c) => c.src(0) },
      { id: 'shine-c', route: 'B', src: [K('kenney-jingles', 'Audio/Pizzicato jingles/jingles_PIZZI02.ogg')], like: '撥弦上行短樂句', desc: 'Kenney Music Jingles PIZZI02（上行 1.99 倍）', build: (c) => c.src(0) },
      { id: 'shine-d', route: 'C', like: '閃亮的上行鐘琴「登登登～」', desc: 'F6–C7–G7 鐘琴三音＋閃粉尾巴', build: () => synthShine() },
    ],
  },
  thunder: {
    limit: 2.5, target: -16, measure: 'M', targetDb: -3,     // 同上（原 1.4 s）
    pending: [
      { page: 'https://opengameart.org/content/rain-long-thunder', title: 'Rain + Long Thunder', author: 'WuxiaScrub', note: '搜尋結果標 CC0；作品頁授權欄與檔名未核對（2026-10-31 頁面回 HTTP 403）' },
      { page: 'https://opengameart.org/content/100-cc0-sfx-2', title: '100 CC0 SFX #2', author: 'rubberduck', note: '包內有 thunder 類；檔名未核對' },
    ],
    candidates: [
      { id: 'thunder-c', route: 'C', like: '低沉的雷聲「轟隆」', desc: '棕色雜訊＋6 次爆裂＋105／270 Hz 隆隆聲', build: () => synthThunder() },
    ],
  },
  'bgm-outro': {
    limit: 20, minLen: 10, target: -20, measure: 'I', targetDb: -11, bgm: true,
    pending: [
      { page: 'https://opengameart.org/content/pianosoft8', title: 'Pianosoft8', author: 'Tozan', note: '搜尋結果標 CC0；作品頁授權欄、長度未核對（2026-10-31 頁面回 HTTP 403）' },
      { page: 'https://opengameart.org/content/distant-jingle', title: 'Distant Jingle', author: 'Centurion_of_war', note: '同上' },
      { page: 'https://opengameart.org/content/title-screens-beginnings-collection', title: 'Title Screens Beginnings Collection', author: 'Holizna', note: '同上' },
    ],
    candidates: [
      { id: 'bgm-d', route: 'C', like: '溫暖的鋼琴琶音鋪底', desc: 'C–G–Am–F–C 和弦 pad＋電鋼琴琶音＋殘響，約 17 s', build: () => synthBgm() },
    ],
  },
};

function pair(c, gap, gainDb) { const a = c.src(0), b = c.src(1); const o = stereo(Math.max(len(a), N(gap) + len(b))); addStereo(o, normPeak(a), 0); addStereo(o, normPeak(b), gap, gainDb); return o; }

// FR-010 ding：正弦 785 Hz；起音 attack（raised-cosine）；到 0.4 s 線性降 1.5 dB；之後指數收尾 τ 0.08 s
function synthDing(attack, h2db) {
  const n = N(0.9), x = new Float64Array(n), h2 = dbl(h2db);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const sus = t <= attack ? 1 : t <= 0.4 ? dbl(-1.5 * (t - attack) / (0.4 - attack)) : dbl(-1.5) * env.ex(t - 0.4, 0.08);
    x[i] = (Math.sin(TAU * 785 * t) + h2 * Math.sin(TAU * 1570 * t)) * env.rc(t, attack) * sus;
  }
  return addMono(stereo(n), x);
}
// FR-010 alert：兩聲 0–80 ms、100–260 ms；2 ms 起落；每聲內降 1 dB；第二聲 −1 dB
function synthAlert(f, sub) {
  const n = N(0.3), x = new Float64Array(n);
  const beeps = [[0, 0.08, 0], [0.1, 0.26, -1]];
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    for (const [a, z, g] of beeps) {
      if (t < a || t >= z) continue;
      const u = t - a, d = z - a, ramp = Math.min(1, u / 0.002, (z - t) / 0.002);
      x[i] = (squareBL(f, t) + (sub ? 0.5 * Math.sin(TAU * 117 * t) : 0)) * ramp * dbl(g - 1 * u / d);
    }
  }
  return addMono(stereo(n), x);
}
// FR-010 success：作者 correct-3 的 synth_correct() 改 D6；長 1.0 s＋80 ms 淡出。
// 四音重疊，最大樣本落在第四音（約 0.23 s）；剪映「正确」也是後段最大聲（到頂 0.17 s），對齊點＝最高音到位
function synthSuccess() {
  const n = N(1.0), x = new Float64Array(n);
  const notes = [[0, 1046.5, 0.22, 0], [0.075, 1174.7, 0.22, -1.5], [0.15, 1568.0, 0.25, -2], [0.225, 2093.0, 0.45, -2.5]];
  const partials = [[1, 1, 1], [2, 0.32, 0.6], [3, 0.12, 0.45], [4.16, 0.07, 0.3]];
  for (let i = 0; i < n; i++) {
    const t = i / SR; let s = 0;
    for (const [t0, f0, tau, g] of notes) {
      const tt = t - t0; if (tt < 0) continue;
      const e = (1 - Math.exp(-tt / 0.002)) * Math.exp(-tt / tau);
      for (const [k, amp, dk] of partials) s += dbl(g) * amp * Math.sin(TAU * f0 * k * tt) * e ** (1 / dk);
    }
    x[i] = s;
  }
  return fadeOut(addMono(stereo(n), x), 0.08);
}
// FR-010 click-c：3 ms 白雜訊（二階高通 6 kHz、τ 0.8 ms）＋4 kHz 共振（帶通 Q 8、τ 2 ms、−12 dB）
function synthClick() {
  const rnd = mulberry32(20261031), o = stereo(N(0.2));
  for (const [at, g] of [[0, 0], [0.125, -6]]) {
    const b = npk(biquad(burst(N(0.003), rnd, 0.0008), 'hp', 6000, 0.707));
    const ring = npk(biquad(burst(N(0.012), rnd, 0.002), 'bp', 4000, 8));
    const m = new Float64Array(ring.length); for (let i = 0; i < m.length; i++) m[i] = (b[i] || 0) + ring[i] * dbl(-12);
    addMono(o, m, at, g);
  }
  return o;
}
// FR-011 impact-c：每下＝130→90 Hz 滑音＋300 Hz −8 dB＋4 ms 雜訊（低通 3 kHz）−12 dB；第二下 +0.12 s −1.5 dB；tanh drive 1.2
function synthImpact() {
  const rnd = mulberry32(20261031), o = stereo(N(0.6));
  for (const [at, g] of [[0, 0], [0.12, -1.5]]) {
    const n = N(0.45);
    const body = glideSine(n, 130, 90, 0.15, (t) => Math.min(1, t / 0.002) * env.ex(t, 0.12));
    const skin = Float64Array.from({ length: n }, (_, i) => Math.sin(TAU * 300 * i / SR) * Math.min(1, i / 96) * env.ex(i / SR, 0.05) * dbl(-8));
    const nz = npk(onePoleLP(burst(N(0.004), rnd, 0.0015), 3000));
    const m = body.map((v, i) => v + skin[i] + (nz[i] || 0) * dbl(-12));
    addMono(o, m, at, g);
  }
  return softclip(normPeak(o), 1.2);
}
// FR-011 chapter：次低頻 60→35 Hz（1.0 s、τ 0.35 s）
const subBass = () => glideSine(N(1.2), 60, 35, 1.0, (t) => Math.min(1, t / 0.005) * env.ex(t, 0.35));
function withSub(src) { const o = stereo(N(1.3)); addStereo(o, normPeak(src), 0); addMono(o, subBass(), 0, -3); return softclip(normPeak(o), 1.5); }
function synthChapter() {
  const rnd = mulberry32(20261031), n = N(1.3), o = stereo(n);
  addMono(o, subBass(), 0);
  addMono(o, Float64Array.from({ length: n }, (_, i) => Math.sin(TAU * 140 * i / SR) * Math.min(1, i / 240) * env.ex(i / SR, 0.25)), 0, -6);
  addMono(o, Float64Array.from({ length: n }, (_, i) => Math.sin(TAU * 250 * i / SR) * Math.min(1, i / 240) * env.ex(i / SR, 0.2)), 0, -10);
  addMono(o, npk(biquad(burst(N(0.02), rnd, 0.008), 'bp', 2000, 1)), 0, -6);
  for (let i = N(0.15); i < n; i++) { const g = 1 - 0.3 * (0.5 + 0.5 * Math.sin(TAU * 7 * (i / SR - 0.15))); o.L[i] *= g; o.R[i] *= g; }
  return softclip(normPeak(o), 1.5);
}
// FR-012 sparkle-a：顆粒 0–1.6 s；0.33 s 到頂、之後 τ 0.5 s；疊 6 kHz 高通「空氣」−24 dB
function synthSparkle() {
  const rnd = mulberry32(20261031), n = N(1.85), o = stereo(n);
  const g = (t) => (t < 0.33 ? (t / 0.33) ** 1.5 : env.ex(t - 0.33, 0.5));
  grains(o, rnd, { t0: 0, t1: 1.6, fLo: 6000, fHi: 14000, fRise: 0.9, g,
    step: (t) => (t < 0.33 ? 0.04 * (0.006 / 0.04) ** (t / 0.33) : 0.006 + 0.019 * Math.min(1, (t - 0.33) / 1.2)) });
  const air = onePoleHP(onePoleHP(white(n, rnd), 6000), 6000).map((v, i) => v * g(i / SR));
  const pk = peakAbs(o) || 1, ap = Math.max(...air.map(Math.abs)) || 1;
  addMono(o, air.map((v) => v / ap * pk), 0, -24);
  return o;
}
// FR-012 shine-d：鐘琴 F6、C7、G7（0、0.05、0.10 s）＋3–8 kHz 顆粒尾巴 −12 dB
function synthShine() {
  const rnd = mulberry32(20261032), n = N(1.55), o = stereo(n);
  const glock = { ratios: [1, 2.76, 5.4], amps: [1, 0.35, 0.12], tau: 0.6 };
  bell(n, 1396.9, { ...glock, at: 0, gainDb: -2 }, o);
  bell(n, 2093.0, { ...glock, at: 0.05, gainDb: -1 }, o);
  bell(n, 3136.0, { ...glock, at: 0.10, gainDb: 0 }, o);
  const t = stereo(n);
  grains(t, rnd, { t0: 0.1, t1: 1.4, fLo: 3000, fHi: 8000, g: (x) => env.ex(x - 0.1, 0.45), step: () => 0.012 + rnd() * 0.01 });
  addStereo(o, scale(t, peakAbs(o) / (peakAbs(t) || 1)), 0, -12);
  return o;
}
// FR-012 thunder-c：棕色雜訊低通 1 kHz；6 次爆裂；105／270 Hz 隆隆；左右兩組獨立雜訊
function synthThunder() {
  const n = N(1.35), o = stereo(n);
  const hits = [[0.04, 0.5], [0.10, 0.6], [0.17, 0.7], [0.26, 0.8], [0.37, 1.0], [0.50, 0.7]];
  const envAt = (t) => { let e = 0; for (const [a, g] of hits) if (t >= a) e += g * Math.min(1, (t - a) / 0.004) * env.ex(t - a, 0.12); return e * (t > 0.5 ? env.ex(t - 0.5, 0.35) : 1); };
  for (const [ch, seed] of [['L', 20261031], ['R', 20261032]]) {
    const rnd = mulberry32(seed);
    let b = 0; const br = Float64Array.from({ length: n }, () => (b = b * 0.995 + (rnd() * 2 - 1) * 0.1));
    const lp = onePoleLP(br, 1000);
    const lpm = Math.max(...lp.map(Math.abs)) || 1;
    for (let i = 0; i < n; i++) {
      const t = i / SR, e = envAt(t);
      const rumble = dbl(-6) * Math.sin(TAU * 105 * t) + dbl(-9) * Math.sin(TAU * 270 * t);
      o[ch][i] = (0.7 * lp[i] / lpm + 0.3 * rumble) * e;
    }
  }
  return o;
}
// FR-012 bgm-d：I–V–vi–IV–I，每和弦 3.2 s；pad（3 個鋸齒 ±7 cents、低通 1.5 kHz）＋電鋼琴琶音（FM 1:1，八分音符 0.4 s）＋殘響
function synthBgm() {
  const rnd = mulberry32(20261031);
  const CH = 3.2, chords = [[48, 52, 55, 60], [43, 50, 55, 59], [45, 52, 57, 60], [41, 48, 53, 57], [48, 52, 55, 60]];
  const total = CH * chords.length + 1.0, n = N(total), dry = stereo(n);
  const hz = (m) => 440 * 2 ** ((m - 69) / 12);
  chords.forEach((ch, ci) => {
    const t0 = ci * CH, last = ci === chords.length - 1, d = last ? CH + 1.0 : CH + 1.2;
    for (const m of ch) for (const c of [-7, 0, 7]) {
      const len1 = N(d), s = sawBlep(len1, hz(m) * 2 ** (c / 1200), rnd());
      const f = onePoleLP(onePoleLP(s, 1500), 1500);
      for (let i = 0; i < len1; i++) { const t = i / SR; f[i] *= Math.min(1, t / 0.8) * (t > CH ? Math.max(0, 1 - (t - CH) / 1.2) : 1) * 0.05; }
      addMono(dry, f, t0, 0, c / 10);
    }
    const pat = [0, 1, 2, 3, 1 + 4, 3, 2, 1].map((k) => (k < 4 ? ch[k] + 12 : ch[k - 4] + 24));
    pat.forEach((m, k) => {
      if (last && k > 4) return;
      const at = t0 + k * 0.4, nd = N(last && k === 4 ? 2.8 : 1.4), x = new Float64Array(nd), f = hz(m), vel = 0.9 + 0.2 * rnd();
      for (let i = 0; i < nd; i++) { const t = i / SR; const idx = 0.3 + 1.7 * env.ex(t, 0.8); x[i] = Math.sin(TAU * f * t + idx * Math.sin(TAU * f * t)) * Math.min(1, t / 0.002) * env.ex(t, 0.9) * vel * 0.22; }
      addMono(dry, x, at, 0, (rnd() * 2 - 1) * 0.3);
    });
  });
  const wl = schroeder(dry.L, [29.7, 37.1, 41.1, 43.7]), wr = schroeder(dry.R, [30.8, 38.2, 42.2, 44.8]);
  const o = stereo(n);
  for (let i = 0; i < n; i++) { o.L[i] = dry.L[i] + wl[i] * dbl(-10) * 3; o.R[i] = dry.R[i] + wr[i] * dbl(-10) * 3; }
  return fadeOut(o, 2.0);
}

// ───────────── 處理鏈（沿用 make_sfx.py finish()） ─────────────
function finish(x, R) {
  let m = measure(x);
  const gainFor = (mm) => Math.min(R.target - (R.measure === 'I' ? mm.I : mm.mmax), TP_CEIL - mm.tp);
  let g = dbl(gainFor(m));
  if (!R.bgm) {
    // 去前導靜音：最終檔第一個超過 −40 dBFS 的樣本前只留 2 ms，前段淡入
    const thr = dbl(-40) / g;
    let on = 0; for (; on < len(x); on++) if (Math.abs(x.L[on]) > thr || Math.abs(x.R[on]) > thr) break;
    const st = Math.max(0, on - N(0.002));
    x = slice(x, st, len(x));
    for (let i = 0; i < on - st; i++) { const w = fadeW(i / (on - st)); x.L[i] *= w; x.R[i] *= w; }
  }
  // 去尾端靜音：最後一個超過 −60 dBFS 的樣本後留 10 ms
  const thr2 = dbl(-60) / g;
  let last = len(x) - 1; for (; last > 0; last--) if (Math.abs(x.L[last]) > thr2 || Math.abs(x.R[last]) > thr2) break;
  x = slice(x, 0, Math.min(len(x), last + N(0.01)));
  if (len(x) > N(R.limit)) { x = slice(x, 0, N(R.limit)); fadeOut(x, R.bgm ? 2.0 : 0.08); } else if (!R.bgm) fadeOut(x, 0.005);
  for (let k = 0; k < 3; k++) {
    m = measure(x);
    const d = gainFor(m);
    if (Math.abs(d) < 0.05) break;
    scale(x, dbl(d));
  }
  // 16-bit 量化後再量一次（寫進 sources.json 的是最終檔的數字）
  const wav = toInt16(x);
  const q = decode(wav);
  return { wav, buf: q, m: measure(q) };
}

// ───────────── 執行 ─────────────
const readJson = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };
function targetDbOf(name) { const kit = readJson(KIT, {}); return Number.isFinite(kit[name]?.targetDb) ? kit[name].targetDb : RECIPES[name].targetDb; }

async function buildCandidate(name, cand, cacheDir) {
  const R = RECIPES[name];
  if (cand.route === 'keep') {
    const p = path.join(SFX_DIR, `${name}.wav`);
    if (!fs.existsSync(p)) return null;
    const buf = decodeFile(p);
    return { wav: fs.readFileSync(p), buf, m: measure(buf) };
  }
  const srcs = [];
  const zips = {};
  for (const s of cand.src || []) {
    zips[s.pack] ||= await fetchPack(s.pack, cacheDir);
    srcs.push(trimLead(decode(zipRead(zips[s.pack], s.member, undefined, PACKS[s.pack].file))));
  }
  const ctx = { src: (i) => ({ L: srcs[i].L.slice(), R: srcs[i].R.slice() }) };
  return finish(cand.build(ctx), R);
}

// 調到成片大小：M max（bgm 是 I）＝ −14 ＋ targetDb
function atPlayback(b, name) { const R = RECIPES[name], m = measure(b); const cur = R.measure === 'I' ? m.I : m.mmax; return scale({ L: b.L.slice(), R: b.R.slice() }, dbl(-14 + targetDbOf(name) - cur)); }
function concat(...parts) { const n = parts.reduce((s, p) => s + len(p), 0), o = stereo(n); let at = 0; for (const p of parts) { o.L.set(p.L, at); o.R.set(p.R, at); at += len(p); } return o; }

function row(name, id, m, cent, refCent) {
  const diff = refCent ? `（參考 ${refCent} Hz，差 ${Math.round(Math.abs(cent - refCent) / refCent * 100)} %）` : '';
  const f = (v) => String(v.toFixed(1)).replace('-', '−');
  return `${name.padEnd(9)} ${id.padEnd(11)} ${m.dur.toFixed(3)} s  峰值 ${m.peakSec.toFixed(3)} s  ${f(RECIPES[name].measure === 'I' ? m.I : m.mmax)} LUFS  ${f(m.tp)} dBTP  重心 ${cent} Hz${diff}`;
}

async function cmdCandidates(o) {
  fs.mkdirSync(o.out, { recursive: true });
  const sections = [];
  for (const name of o.names) {
    const R = RECIPES[name], dir = path.join(o.out, name);
    fs.mkdirSync(dir, { recursive: true });
    let ref = null, refInfo = null;
    if (o.ref) { ref = decodeFile(o.ref); refInfo = { m: measure(ref), cent: centroid(ref) }; }
    const voice = o.voice ? decodeFile(o.voice) : null;
    const rows = [];
    for (const cand of R.candidates) {
      const r = await buildCandidate(name, cand, o.cache);
      if (!r) continue;
      fs.writeFileSync(path.join(dir, `${cand.id}.wav`), r.wav);
      const cent = centroid(r.buf);
      if (ref) {
        const gap = stereo(N(0.5)), A = atPlayback(ref, name), B = atPlayback(r.buf, name);
        fs.writeFileSync(path.join(dir, `ab-${cand.id}.wav`), toInt16(concat(A, gap, B, gap, A)));
      }
      if (voice) {
        const v = slice(voice, 0, Math.min(len(voice), N(15))), vm = measure(v);
        const vv = scale(v, dbl(-14 - vm.I)), B = atPlayback(r.buf, name);
        for (const at of [2, 5, 8, 11]) addStereo(vv, B, at);
        fs.writeFileSync(path.join(dir, `voice-${cand.id}.wav`), toInt16(vv));
      }
      const line = row(name, cand.id, r.m, cent, refInfo?.cent);
      console.log(line);
      rows.push({ cand, m: r.m, cent, line });
    }
    const sec = { name, refInfo, ref: o.ref ? path.basename(o.ref) : null, rows: rows.map((r) => ({ id: r.cand.id, desc: r.cand.desc || '', line: r.line })) };
    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(sec, null, 1));
  }
  for (const d of fs.readdirSync(o.out).sort()) { const p = path.join(o.out, d, 'meta.json'); if (fs.existsSync(p)) sections.push(JSON.parse(fs.readFileSync(p, 'utf8'))); }
  sections.sort((a, b) => Object.keys(RECIPES).indexOf(a.name) - Object.keys(RECIPES).indexOf(b.name));
  fs.writeFileSync(path.join(o.out, 'index.html'), indexHtml(sections));
  const one = o.names.length === 1 ? `：${RECIPES[o.names[0]].measure === 'I' ? '整合響度' : 'M max'} ${String((-14 + targetDbOf(o.names[0])).toFixed(1)).replace('-', '−')} LUFS` : '';
  console.log(`試聽頁：${path.join(o.out, 'index.html')}（A/B 檔都是成片大小${one}）`);
}

function indexHtml(sections) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const css = `:root{--bg:#fafaf7;--fg:#1d1d1b;--mut:#6b6b66;--line:#e2e1db;--card:#fff;--acc:#c27c00}
@media (prefers-color-scheme:dark){:root{--bg:#141414;--fg:#ecebe6;--mut:#9a9993;--line:#2c2c2a;--card:#1d1d1c;--acc:#ffd400}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.6 -apple-system,"PingFang TC","Noto Sans TC",sans-serif;padding:24px 16px}
main{max-width:1100px;margin:0 auto}section{margin:0 0 28px}h2{font-size:17px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}
.c{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 12px}.c.on{border-color:var(--acc)}audio{width:100%;height:32px;margin:4px 0}
.m{font:12px/1.5 ui-monospace,Menlo,monospace;color:var(--mut)}`;
  const out = [`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>音效候選試聽</title><style>${css}</style></head><body><main>`,
    '<h1>音效候選試聽</h1><p class="m">ab-＊＝參考 → 候選 → 參考（都調到成片大小）；voice-＊＝墊在人聲底下。★＝make-sfx.mjs 的 CHOICE。</p>'];
  for (const s of sections) {
    out.push(`<section><h2>${esc(s.name)}${s.ref ? `｜參考 ${esc(s.ref)}（重心 ${s.refInfo.cent} Hz、${s.refInfo.m.dur} s）` : ''}</h2><div class="grid">`);
    for (const r of s.rows) {
      const on = CHOICE[s.name] === r.id;
      out.push(`<div class="c${on ? ' on' : ''}"><b>${on ? '★ ' : ''}${esc(r.id)}</b> ${esc(r.desc)}
<audio controls preload="none" src="${esc(s.name)}/${esc(r.id)}.wav"></audio>${s.ref ? `<audio controls preload="none" src="${esc(s.name)}/ab-${esc(r.id)}.wav"></audio>` : ''}
<div class="m">${esc(r.line)}</div></div>`);
    }
    out.push('</div></section>');
  }
  out.push('</main></body></html>');
  return out.join('\n');
}

function sourceEntry(name, cand, r, prev) {
  const R = RECIPES[name];
  const e = { file: `${name}.wav`, kind: R.bgm ? 'bgm' : 'sfx', zh: prev?.zh ?? readJson(KIT, {})[name]?.zh ?? name, candidate: cand.id, recipe: cand.id, route: cand.route, like: cand.like };
  if (cand.src?.length) {
    const packs = [...new Set(cand.src.map((s) => s.pack))];
    const one = (a) => (a.length === 1 ? a[0] : a);
    Object.assign(e, {
      source_pack: one(packs.map((k) => PACKS[k].pack)), source_author: 'Kenney',
      source_file: one(cand.src.map((s) => `${PACKS[s.pack].file}:${s.member}`)),
      source_url: one(packs.map(pageUrl)), download_url: one(packs.map(dlUrl)), zip_sha256: one(packs.map((k) => PACKS[k].sha256)), ...CC0,
    });
    if (cand.route === 'B+C') e.source = `另疊程式合成的部分（dev/tools/make-sfx.mjs 配方 ${cand.id}）`;
  } else {
    Object.assign(e, { source: `程式合成（dev/tools/make-sfx.mjs 配方 ${cand.id}）`, ...CC0, license_note: '作者合成，以 CC0 1.0 釋出（2026-10 定案）' });
  }
  if (R.pending) e.pending_author_check = R.pending;
  e.processing = cand.desc + (R.bgm ? ` → 檔尾 2 s 淡出 → 整合響度 ${R.target} LUFS` : ` → 去前導靜音（起音前留 2 ms）→ 長度上限 ${R.limit} s → 增益到 M max ${R.target} LUFS（true peak 上限 ${TP_CEIL} dBTP）`) + ' → 48 kHz、立體聲、pcm_s16le';
  Object.assign(e, { duration_sec: r.m.dur, peak_sec: R.bgm ? 0 : r.m.peakSec, max_m_lufs: r.m.mmax, true_peak_dbtp: +r.m.tp.toFixed(2), centroid_hz: centroid(r.buf), sha256: sha256(r.wav) });
  if (R.bgm) e.integrated_lufs = +r.m.I.toFixed(1);
  return e;
}

// kit/sfx.json：一項一行（跟原本的排法一樣）
function writeKit(kit) {
  const w = Math.max(...Object.keys(kit).map((k) => JSON.stringify(k).length)) + 1;
  const lines = Object.entries(kit).map(([k, v]) => `  ${(JSON.stringify(k) + ':').padEnd(w + 1)} ${JSON.stringify(v).replace(/,"/g, ', "').replace(/":/g, '": ').replace(/^\{/, '{ ').replace(/\}$/, ' }')}`);
  fs.writeFileSync(KIT, `{\n${lines.join(',\n')}\n}\n`);
}

function writeReadme(sources, kit) {
  const by = Object.fromEntries(sources.map((s) => [s.file, s]));
  const srcText = (s) => {
    if (!s) return '—';
    if (s.source_pack) {
      const files = [].concat(s.source_file).map((f) => `\`${path.basename(String(f).split(':').pop())}\``).join('、');
      const pk = [].concat(s.source_pack).join('＋');
      return `${pk}${s.source_author && s.source_author !== 'Kenney' ? `（${s.source_author}）` : ''} ${files}${s.route === 'B+C' ? '＋程式合成' : ''}`;
    }
    return `程式合成（\`dev/tools/make-sfx.mjs\` 配方 \`${s.recipe}\`）`;
  };
  const lic = (s) => (s?.license_note ? 'CC0 1.0（作者合成並釋出）' : s?.license || '—');
  const lines = ['# 音效清單', '',
    `${Object.keys(kit).length} 個音效：取自 CC0（公眾領域）素材，或作者合成並以 CC0 釋出；可以放進自己的影片、改編、商用，不用標示出處。`,
    '逐檔的下載網址、sha256、處理方式、峰值秒數與響度在 `sources.json`；每顆在成片裡的大小（相對人聲的 dB）與使用時機在 `shared/template/kit/sfx.json`。', '',
    '| 檔名 | 聽起來像 | 用在哪 | 來源 | 授權 |', '|---|---|---|---|---|'];
  for (const [k, v] of Object.entries(kit)) { const s = by[`${k}.wav`]; lines.push(`| \`${k}.wav\` | ${s?.like || '—'} | ${v.use} | ${srcText(s)} | ${lic(s)} |`); }
  const pend = sources.filter((s) => s.pending_author_check);
  lines.push('', 'Kenney 素材出自 https://kenney.nl ，OpenGameArt 素材的作品頁網址在 `sources.json` 的 `source_url`，', '`zip_sha256` 是當初下載的檔案（zip 或單一音檔）的 sha256，`sha256` 是 wav 檔本身。');
  if (pend.length) lines.push('', `${pend.map((s) => `\`${s.file}\``).join('、')} 目前是程式合成版；\`sources.json\` 的 \`pending_author_check\`（待作者瀏覽器確認）列了 OpenGameArt 的 CC0 候選，作者在瀏覽器確認授權欄並試聽後才會換檔。`);
  lines.push('', '作者端重新產生（只要 Node 與 ffmpeg；會重新下載 Kenney 素材並核對 sha256）：', '', '```',
    'node dev/tools/make-sfx.mjs --candidates --only <名稱> --out <工作區外的資料夾>   # 試聽候選',
    'node dev/tools/make-sfx.mjs --write --only <名稱>                                 # 寫進 shared/sfx/', '```', '',
    `${FROZEN.map((n) => `\`${n}\``).join(' ')} 是凍結的舊檔（由已退役的 \`dev/tools/make_sfx.py\` 產生），處理方式記在 \`sources.json\` 的 \`processing\`，不再重產。`, '');
  fs.writeFileSync(path.join(SFX_DIR, 'README.md'), lines.join('\n'));
}

async function cmdWrite(o) {
  const kit = readJson(KIT, {});
  const results = [];
  for (const name of o.names) {
    if (!kit[name]) fail(`kit/sfx.json 沒有「${name}」→ 先照 specs/contracts/sfx.md §2 手動加這一項（kind、zh、use、event、targetDb、additive、maxPerVideo），再跑 --write`);
    const R = RECIPES[name], cand = R.candidates.find((c) => c.id === CHOICE[name]);
    const r = await buildCandidate(name, cand, o.cache);
    const cur = R.measure === 'I' ? r.m.I : r.m.mmax;
    const vol = +dbl(-14 + kit[name].targetDb - cur).toFixed(3);
    if (vol > 1) fail(`${name} 算出來的 volume 是 ${vol}（> 1）：檔案只有 ${cur} LUFS（被 true peak −1.2 dBTP 壓住）→ 配方的檔案目標調低，或把聲音做得更密（降低峰值因數）`);
    if (R.bgm ? (r.m.dur > R.limit + 0.01 || r.m.dur < R.minLen) : r.m.dur > R.limit + 0.001) fail(`${name} 長 ${r.m.dur} s，上限 ${R.limit} s → 配方截短`);
    if (r.m.tp > -1.0) fail(`${name} true peak ${r.m.tp} dBTP，上限 −1.0 dBTP → 檢查配方的增益`);
    results.push({ name, cand, r, vol });
  }
  const sources = readJson(path.join(SFX_DIR, 'sources.json'), []);
  for (const { name, cand, r, vol } of results) {
    fs.writeFileSync(path.join(SFX_DIR, `${name}.wav`), r.wav);
    const i = sources.findIndex((s) => s.file === `${name}.wav`);
    const e = sourceEntry(name, cand, r, i >= 0 ? sources[i] : null);
    e.zh = kit[name].zh;
    if (i >= 0) sources[i] = e; else sources.push(e);
    kit[name] = { ...kit[name], peak: RECIPES[name].bgm ? 0 : r.m.peakSec, volume: vol };
    const f = (v) => String(v.toFixed(1)).replace('-', '−');
    console.log(`${name.padEnd(9)} ${cand.id.padEnd(11)} → shared/sfx/${name}.wav  ${r.m.dur.toFixed(3)} s  peak ${kit[name].peak}  ${RECIPES[name].measure === 'I' ? 'I' : 'M max'} ${f(RECIPES[name].measure === 'I' ? r.m.I : r.m.mmax)} LUFS  volume ${vol}（targetDb ${f(kit[name].targetDb)}）`);
  }
  // sources.json 照 kit 的順序排
  const order = Object.keys(kit);
  sources.sort((a, b) => order.indexOf(a.file.replace(/\.wav$/, '')) - order.indexOf(b.file.replace(/\.wav$/, '')));
  fs.writeFileSync(path.join(SFX_DIR, 'sources.json'), JSON.stringify(sources, null, 2) + '\n');
  writeKit(kit);
  writeReadme(sources, kit);
  console.log(`✔ 寫好 ${results.length} 個音效；也更新了 shared/sfx/sources.json、shared/template/kit/sfx.json（peak、volume）、shared/sfx/README.md`);
  console.log('→ 接著跑 node --test dev/tests/sfx.test.mjs');
}

function cmdList() {
  console.log(`音效配方（✓＝CHOICE 選的；凍結的 8 顆不在這裡：${FROZEN.join(' ')}）`);
  for (const [name, R] of Object.entries(RECIPES)) {
    R.candidates.forEach((c, i) => {
      const src = c.route === 'keep' ? `現在的 shared/sfx/${name}.wav` : c.src?.length ? `${PACKS[c.src[0].pack].pack} ${c.src.map((s) => path.basename(s.member)).join('＋')}` : c.desc;
      console.log(`  ${(i ? '' : name).padEnd(9)} ${CHOICE[name] === c.id ? '✓' : '·'} ${c.id.padEnd(11)} ${(c.route === 'keep' ? '—' : c.route).padEnd(4)} ${src}`);
    });
  }
}

// 匯出給測試／研究用（不改變 CLI 行為）
export { RECIPES, CHOICE, PACKS, measure, centroid, decode, decodeFile, zipList, zipRead, fetchPack };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const o = parseArgs(process.argv.slice(2));
  if (o.mode === 'list') cmdList();
  else if (o.mode === 'candidates') await cmdCandidates(o);
  else await cmdWrite(o);
}
