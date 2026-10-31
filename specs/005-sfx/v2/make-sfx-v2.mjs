#!/usr/bin/env node
// 005 音效合成 v2（研究用；dev/tools/make-sfx.mjs 已凍結，要不要併、怎麼併由 005 決定）。
// 零相依：只用 Node 22 內建模組，不需要 ffmpeg。固定亂數種子：同一台機器每次位元組相同。
//
//   node specs/005-sfx/v2/make-sfx-v2.mjs --out <資料夾> [--only ding,alert]
//   node specs/005-sfx/v2/make-sfx-v2.mjs --list
//
// 產出：<資料夾>/<事件>-v2a.wav、-v2b.wav…（48 kHz、16-bit、立體聲）＋ v2-recipes.json（配方說明與量測）。
// 響度沿用 make-sfx.mjs 的 finish()：去前導靜音（留 2 ms）→ 長度上限（FR-010～012）→ M max 調到配方目標
// （bgm 用整合響度），true peak 上限 −1.2 dBTP。M max／整合響度／true peak 用 BS.1770 自己算
// （K 加權、400 ms 窗、100 ms 步、前後補 1 s 靜音，跟 ffmpeg ebur128 同一個格點；true peak 4 倍超取樣）。
//
// v1 的問題（剪映參考檔頻譜分析在作者本機 scratchpad w005b/synth/analysis，不進 repo）：正弦疊加、泛音一起衰減、
// 沒有起音瞬態、沒有空間。v2 用：
//   模態合成（每個泛音獨立頻率／振幅／衰減，加亂數微失諧）、雙段衰減、起音噪聲瞬態（濾波白噪＋極短包絡）、
//   FDN 殘響（8 條延遲線＋Hadamard 回授＋每條阻尼低通＋前置全通擴散）、輕微飽和、左右微失諧與 Haas 寬度、
//   時變低通（高頻先衰）、Karplus–Strong 撥弦、濾波噪聲分層（打雷、重低音）、鋼琴模態（弦剛性非諧波、三弦拍頻）。

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const SR = 48000, TAU = 2 * Math.PI;
const N = (s) => Math.round(s * SR);
const dbl = (db) => 10 ** (db / 20);
const TP_CEIL = -1.2;

// ───────────── 亂數、緩衝 ─────────────
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const seedOf = (s) => createHash('sha256').update(s).digest().readUInt32LE(0);
const rndOf = (s) => mulberry32(seedOf(s));
const pm = (rnd, x) => (rnd() * 2 - 1) * x;
const stereo = (sec) => ({ L: new Float64Array(N(sec)), R: new Float64Array(N(sec)) });
const len = (b) => b.L.length;
const panGains = (pan) => { const a = (Math.max(-1, Math.min(1, pan)) + 1) * Math.PI / 4; return [Math.cos(a) * Math.SQRT2, Math.sin(a) * Math.SQRT2]; };
function addMono(out, x, at = 0, db = 0, pan = 0) {
  const [gl, gr] = panGains(pan), g = dbl(db), i0 = N(at);
  for (let i = 0; i < x.length; i++) { const j = i0 + i; if (j < 0 || j >= len(out)) continue; out.L[j] += x[i] * g * gl; out.R[j] += x[i] * g * gr; }
  return out;
}
function addStereo(out, s, at = 0, db = 0) {
  const g = dbl(db), i0 = N(at);
  for (let i = 0; i < len(s); i++) { const j = i0 + i; if (j < 0 || j >= len(out)) continue; out.L[j] += s.L[i] * g; out.R[j] += s.R[i] * g; }
  return out;
}
const peakAbs = (b) => { let m = 0; for (let i = 0; i < len(b); i++) { const a = Math.abs(b.L[i]), c = Math.abs(b.R[i]); if (a > m) m = a; if (c > m) m = c; } return m; };
const peak1 = (x) => { let m = 0; for (const v of x) if (Math.abs(v) > m) m = Math.abs(v); return m; };
const scale = (b, g) => { for (let i = 0; i < len(b); i++) { b.L[i] *= g; b.R[i] *= g; } return b; };
const normPeak = (b) => { const m = peakAbs(b); return m > 0 ? scale(b, 1 / m) : b; };
const slice = (b, a, z) => ({ L: b.L.slice(a, z), R: b.R.slice(a, z) });
const fadeW = (u) => Math.sin(u * Math.PI / 2) ** 2;
function fadeOut(b, sec) { const n = Math.min(len(b), N(sec)); for (let i = 0; i < n; i++) { const g = fadeW(1 - i / n), j = len(b) - n + i; b.L[j] *= g; b.R[j] *= g; } return b; }
const energy = (b) => { let e = 0; for (let i = 0; i < len(b); i++) e += b.L[i] ** 2 + b.R[i] ** 2; return e; };
// 斷點包絡（dB，線性內插）
const bpEnv = (pts) => (t) => { if (t <= pts[0][0]) return dbl(pts[0][1]); for (let k = 1; k < pts.length; k++) if (t <= pts[k][0]) { const [t0, d0] = pts[k - 1], [t1, d1] = pts[k]; return dbl(d0 + (d1 - d0) * (t - t0) / (t1 - t0)); } return dbl(pts.at(-1)[1]); };

// ───────────── 濾波器 ─────────────
// RBJ biquad：lp、hp、bp（峰值 0 dB）、peak、ls、hs
function biquad(type, fc, q = 0.707, gainDb = 0) {
  const w0 = TAU * Math.min(fc, SR * 0.49) / SR, c = Math.cos(w0), s = Math.sin(w0), al = s / (2 * q), A = 10 ** (gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
  else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
  else if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
  else if (type === 'peak') { b0 = 1 + al * A; b1 = -2 * c; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * c; a2 = 1 - al / A; }
  else if (type === 'ls' || type === 'hs') {
    const sq = 2 * Math.sqrt(A) * al, sg = type === 'ls' ? 1 : -1;
    b0 = A * ((A + 1) - sg * (A - 1) * c + sq); b1 = 2 * sg * A * ((A - 1) - sg * (A + 1) * c); b2 = A * ((A + 1) - sg * (A - 1) * c - sq);
    a0 = (A + 1) + sg * (A - 1) * c + sq; a1 = -2 * sg * ((A - 1) + sg * (A + 1) * c); a2 = (A + 1) + sg * (A - 1) * c - sq;
  } else throw new Error(`biquad ${type}`);
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}
function runBq(x, [b0, b1, b2, a1, a2]) {
  const o = new Float64Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const y = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = y; o[i] = y; }
  return o;
}
const filt = (x, chain) => chain.reduce((y, [t, f, q, g]) => runBq(y, biquad(t, f, q ?? 0.707, g ?? 0)), x);
const filtS = (b, chain) => ({ L: filt(b.L, chain), R: filt(b.R, chain) });
function onePoleLP(x, fc) { const a = 1 - Math.exp(-TAU * fc / SR); let y = 0; const o = new Float64Array(x.length); for (let i = 0; i < x.length; i++) { y += a * (x[i] - y); o[i] = y; } return o; }
// 時變低通（TPT 狀態變數濾波器；每 16 樣本更新截止頻率）：高頻先衰
function sweepLP(x, fcAt, q = 0.707) {
  const o = new Float64Array(x.length), k = 1 / q; let s1 = 0, s2 = 0, g = 0, a1 = 0;
  for (let i = 0; i < x.length; i++) {
    if ((i & 15) === 0) { g = Math.tan(Math.PI * Math.min(fcAt(i / SR), SR * 0.45) / SR); a1 = 1 / (1 + g * (g + k)); }
    const v1 = a1 * (s1 + g * (x[i] - s2)), v2 = s2 + g * v1;
    s1 = 2 * v1 - s1; s2 = 2 * v2 - s2; o[i] = v2;
  }
  return o;
}

// ───────────── 噪聲 ─────────────
const white = (n, rnd) => { const o = new Float64Array(n); for (let i = 0; i < n; i++) o[i] = rnd() * 2 - 1; return o; };
function brown(n, rnd, leak = 0.997) { const o = new Float64Array(n); let b = 0; for (let i = 0; i < n; i++) { b = b * leak + (rnd() * 2 - 1) * 0.06; o[i] = b; } return o; }
// 平滑亂數（給振幅起伏）：白噪兩次一階低通後正規化到 ±1
function smoothRand(n, rnd, fc) { let x = onePoleLP(onePoleLP(white(n, rnd), fc), fc); const m = peak1(x) || 1; return x.map((v) => v / m); }
// 起音噪聲瞬態：濾波白噪 × 極短包絡；decor＝左右獨立程度（0 單聲道、1 完全獨立）；haas＝右聲道延遲秒數
function noiseHit(out, { at = 0, dur, rnd, tau = 0.005, attack = 0.0004, db = 0, pan = 0, chain = [], sweep = null, decor = 0, env = null, haas = 0 }) {
  const n = N(dur);
  const mk = () => { let x = filt(white(n, rnd), chain); if (sweep) x = sweepLP(x, (t) => sweep.to + (sweep.from - sweep.to) * Math.exp(-t / sweep.tau), sweep.q ?? 0.707); return x; };
  const a = mk(), b = decor > 0 ? mk() : a, na = Math.max(1, N(attack));
  const L = new Float64Array(n), R = new Float64Array(n), dh = N(haas);
  for (let i = 0; i < n; i++) {
    const t = i / SR, e = (env ? env(t) : Math.exp(-t / tau)) * (i < na ? i / na : 1);
    L[i] = a[i] * e;
    const j = i - dh; if (j >= 0) { const ej = (env ? env(j / SR) : Math.exp(-j / SR / tau)) * (j < na ? j / na : 1); R[i] = ((1 - decor) * a[j] + decor * b[j]) * ej; }
  }
  const m = Math.max(peak1(L), peak1(R)) || 1;
  const [gl, gr] = panGains(pan), g = dbl(db) / m, i0 = N(at);
  for (let i = 0; i < n; i++) { const j = i0 + i; if (j < 0 || j >= len(out)) continue; out.L[j] += L[i] * g * gl; out.R[j] += R[i] * g * gr; }
  return out;
}

// ───────────── 模態合成 ─────────────
// partials：[{ r 頻率比, db, decay（dB/s）, decay2（後段 dB/s）, w2（後段比例 0–1）, phase }]
// 每個泛音獨立衰減＋亂數微失諧（jitter cents）；左右差 spread cents（拍頻＋寬度）；glide(t)＝整體音高倍率（選用）
function modal(out, o) {
  const { f, at = 0, db = 0, pan = 0, rnd = null, jitter = 1, spread = 0.5, attack = 0.0008, dur = 2, glide = null, partials, release = null, maxHz = 17500, env = null } = o;
  const i0 = N(at), n = Math.min(N(dur), len(out) - i0);
  if (n <= 0) return out;
  const [gl, gr] = panGains(pan), na = Math.max(1, N(attack));
  const rr = release ? dbl(-release.decay / SR) : 1, nrel = release ? N(release.at) : Infinity;
  for (const p of partials) {
    const cents = (p.detune ?? 0) + (rnd ? pm(rnd, jitter) : 0);
    const fp = f * p.r * 2 ** (cents / 1200);
    if (fp > maxHz || fp > SR * 0.45) continue;
    const A = dbl(db + p.db), r1 = dbl(-p.decay / SR), r2 = dbl(-(p.decay2 ?? p.decay) / SR), w2 = p.w2 ?? 0, ph0 = p.phase ?? 0;
    for (const [ch, g, sc] of [['L', gl, -spread / 2], ['R', gr, spread / 2]]) {
      const y = out[ch], fc = fp * 2 ** (sc / 1200);
      let e1 = 1 - w2, e2 = w2, er = 1;
      if (!glide) {
        const w = TAU * fc / SR, cw = Math.cos(w), sw = Math.sin(w); let c = Math.cos(ph0), s = Math.sin(ph0);
        for (let i = 0; i < n; i++) {
          const a = i < na ? 0.5 - 0.5 * Math.cos(Math.PI * i / na) : 1;
          y[i0 + i] += A * g * s * (e1 + e2) * er * a * (env ? env(i / SR) : 1);
          const c2 = c * cw - s * sw; s = s * cw + c * sw; c = c2; e1 *= r1; e2 *= r2; if (i >= nrel) er *= rr;
        }
      } else {
        let ph = ph0;
        for (let i = 0; i < n; i++) {
          const t = i / SR, a = i < na ? 0.5 - 0.5 * Math.cos(Math.PI * i / na) : 1;
          y[i0 + i] += A * g * Math.sin(ph) * (e1 + e2) * er * a * (env ? env(t) : 1);
          ph += TAU * fc * glide(t) / SR; e1 *= r1; e2 *= r2; if (i >= nrel) er *= rr;
        }
      }
    }
  }
  return out;
}
// 持續音（電子音、pad）：partials [{ r, db }]＋外部包絡 env(t)
function tone(out, { f, at = 0, dur, partials, env, pan = 0, spread = 0, rnd = null, jitter = 0, vib = null }) {
  const i0 = N(at), n = Math.min(N(dur), len(out) - i0), [gl, gr] = panGains(pan);
  const E = new Float64Array(n); for (let i = 0; i < n; i++) E[i] = env(i / SR);
  for (const p of partials) {
    const fp = f * p.r * 2 ** ((rnd ? pm(rnd, jitter) : 0) / 1200), A = dbl(p.db);
    for (const [ch, g, sc] of [['L', gl, -spread / 2], ['R', gr, spread / 2]]) {
      const y = out[ch], fc = fp * 2 ** (sc / 1200); let ph = p.phase ?? 0;
      for (let i = 0; i < n; i++) { y[i0 + i] += A * g * Math.sin(ph) * E[i]; ph += TAU * fc * (vib ? vib(i / SR) : 1) / SR; }
    }
  }
  return out;
}
// Karplus–Strong 撥弦（迴圈平均濾波＝高頻先衰；全通分數延遲調音）
// 迴圈濾波 (1−S)·y[n−N]+S·y[n−N−1]：S 依音高解出來，讓基音衰減＝decay dB/s（S 上限 0.5＝原版 KS；不夠再用 rho 補）
function pluck(out, { f, at = 0, db = 0, pan = 0, rnd, decay = 30, bright = 5000, dur = 2 }) {
  const P = SR / f, w0 = TAU * f / SR, H2 = dbl(-decay / f) ** 2;
  const q = (1 - H2) / (2 * (1 - Math.cos(w0))), S = q >= 0.25 ? 0.5 : (1 - Math.sqrt(1 - 4 * q)) / 2;
  const Hs = Math.sqrt(1 - 2 * S * (1 - S) * (1 - Math.cos(w0))), rho = Math.min(1, dbl(-decay / f) / Hs);
  const Ni = Math.floor(P - S - 0.1), frac = P - S - Ni, C = (1 - frac) / (1 + frac);
  const n = N(dur), y = new Float64Array(n), exc = onePoleLP(onePoleLP(white(Ni, rnd), bright), bright);
  const em = peak1(exc) || 1;
  let apx = 0, apy = 0;
  for (let i = 0; i < n; i++) {
    const u = i >= Ni + 1 ? (1 - S) * y[i - Ni] + S * y[i - Ni - 1] : 0;
    const v = C * u + apx - C * apy; apx = u; apy = v;
    y[i] = rho * v + (i < Ni ? exc[i] / em : 0);
  }
  return addMono(out, y, at, db, pan);
}

// ───────────── 空間：FDN 殘響、飽和 ─────────────
function hadamard8(v) {
  for (let h = 1; h < 8; h <<= 1) for (let i = 0; i < 8; i += h << 1) for (let j = i; j < i + h; j++) { const a = v[j], b = v[j + h]; v[j] = a + b; v[j + h] = a - b; }
  for (let i = 0; i < 8; i++) v[i] *= 0.35355339059327373;
}
// 8 條延遲線 FDN；rt60 秒、size 延遲長度倍率、damp（0–1，迴圈內一階低通，越大高頻越快衰）、pre 前置延遲、
// wet＝殘響總能量相對乾聲（dB）；lowcut／highcut 只作用在殘響
function fdn(inp, { rt60 = 1, size = 1, damp = 0.35, pre = 0.01, wet = -18, lowcut = 120, highcut = 10000, width = 1 } = {}) {
  const n = len(inp), x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = (inp.L[i] + inp.R[i]) * 0.5;
  // 前置延遲＋4 級全通擴散（避免脈衝類聲音的金屬顫音）
  let d = new Float64Array(n); const dp = N(pre); for (let i = dp; i < n; i++) d[i] = x[i - dp];
  for (const [ms, g] of [[4.77, 0.7], [3.59, 0.7], [12.73, 0.6], [9.31, 0.6]]) {
    const D = Math.max(1, N(ms * (0.6 + 0.4 * size) / 1000)), buf = new Float64Array(D), o = new Float64Array(n); let k = 0;
    for (let i = 0; i < n; i++) { const b = buf[k], v = d[i] + b * g; o[i] = b - v * g; buf[k] = v; k = (k + 1) % D; }
    d = o;
  }
  const lens = [29.7, 37.1, 41.1, 43.7, 53.3, 59.9, 67.7, 73.1].map((ms) => Math.max(8, N(ms * size / 1000)));
  const bufs = lens.map((L) => new Float64Array(L)), idx = new Int32Array(8), lp = new Float64Array(8);
  const gains = lens.map((L) => 10 ** (-3 * L / (rt60 * SR)));
  const inS = [1, -1, 1, -1, 1, -1, 1, -1], oL = [1, 1, -1, -1, 1, 1, -1, -1], oR = [1, -1, 1, -1, -1, 1, -1, 1];
  const wl = new Float64Array(n), wr = new Float64Array(n), v = new Float64Array(8);
  for (let i = 0; i < n; i++) {
    let yl = 0, yr = 0;
    for (let j = 0; j < 8; j++) { const s = bufs[j][idx[j]]; yl += s * oL[j]; yr += s * oR[j]; lp[j] = (1 - damp) * s + damp * lp[j]; v[j] = lp[j] * gains[j]; }
    hadamard8(v);
    for (let j = 0; j < 8; j++) { bufs[j][idx[j]] = v[j] + d[i] * inS[j] * 0.35; idx[j] = (idx[j] + 1) % lens[j]; }
    wl[i] = yl; wr[i] = yr;
  }
  let w = { L: wl, R: wr };
  w = filtS(w, [['hp', lowcut, 0.707], ['lp', highcut, 0.707]]);
  if (width < 1) for (let i = 0; i < n; i++) { const m = (w.L[i] + w.R[i]) / 2, s = (w.L[i] - w.R[i]) / 2 * width; w.L[i] = m + s; w.R[i] = m - s; }
  const ed = energy(inp), ew = energy(w) || 1, g = Math.sqrt(ed / ew) * dbl(wet);
  return { L: inp.L.map((s, i) => s + w.L[i] * g), R: inp.R.map((s, i) => s + w.R[i] * g) };
}
// 輕微飽和：tanh，drive 越大越飽和；asym 加偶次諧波
function saturate(b, drive = 1.5, asym = 0) {
  const pk = peakAbs(b) || 1, k = Math.tanh(drive * (1 + asym)) - Math.tanh(drive * asym), o = Math.tanh(drive * asym);
  for (let i = 0; i < len(b); i++) { b.L[i] = (Math.tanh(drive * (b.L[i] / pk + asym)) - o) / k * pk; b.R[i] = (Math.tanh(drive * (b.R[i] / pk + asym)) - o) / k * pk; }
  return b;
}
const dcBlock = (b) => filtS(b, [['hp', 18, 0.707]]);

// ───────────── 響度（BS.1770，跟 ffmpeg ebur128 同格點）─────────────
const KW = [[1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585], [1, -2, 1, -1.99004745483398, 0.99007225036621]];
function kSquares(b) { // 前後補 1 s；回傳每樣本 (L²+R²) 的累積和
  const pad = SR, n = len(b) + 2 * pad, cum = new Float64Array(n + 1);
  const run = (x) => { const y = new Float64Array(n); for (let i = 0; i < len(b); i++) y[pad + i] = x[i]; return runBq(runBq(y, KW[0]), KW[1]); };
  const l = run(b.L), r = run(b.R);
  for (let i = 0; i < n; i++) cum[i + 1] = cum[i] + l[i] * l[i] + r[i] * r[i];
  return { cum, n };
}
function loudness(b) {
  const { cum, n } = kSquares(b), W = N(0.4), H = N(0.1), blocks = [];
  let mmax = -Infinity;
  for (let e = W; e <= n; e += H) { const ms = (cum[e] - cum[e - W]) / W; const l = -0.691 + 10 * Math.log10(ms + 1e-30); blocks.push([ms, l]); if (l > mmax) mmax = l; }
  const abs = blocks.filter(([, l]) => l > -70);
  const mean = (a) => a.reduce((s, [m]) => s + m, 0) / (a.length || 1);
  const rel = -0.691 + 10 * Math.log10(mean(abs) + 1e-30) - 10;
  const gated = abs.filter(([, l]) => l > rel);
  return { mmax, I: gated.length ? -0.691 + 10 * Math.log10(mean(gated)) : -Infinity };
}
// true peak：4 倍超取樣（Blackman 視窗 sinc，每相 16 階）
const TPF = (() => { const P = 4, T = 16, L = P * T, h = new Float64Array(L); for (let i = 0; i < L; i++) { const x = (i - (L - 1) / 2) / P; const w = 0.42 - 0.5 * Math.cos(TAU * i / (L - 1)) + 0.08 * Math.cos(2 * TAU * i / (L - 1)); h[i] = (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x)) * w; } return { P, T, h }; })();
function truePeak(b) {
  const { P, T, h } = TPF; let m = 0;
  for (const x of [b.L, b.R]) for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i]); if (a > m) m = a;
    for (let p = 1; p < P; p++) { let s = 0; for (let k = 0; k < T; k++) { const j = i - k + T / 2; if (j >= 0 && j < x.length) s += x[j] * h[p + k * P]; } if (Math.abs(s) > m) m = Math.abs(s); }
  }
  return 20 * Math.log10(m || 1e-12);
}
function measure(b) {
  const { mmax, I } = loudness(b);
  let pk = 0, at = 0; for (let i = 0; i < len(b); i++) { const v = Math.max(Math.abs(b.L[i]), Math.abs(b.R[i])); if (v > pk) { pk = v; at = i; } }
  return { dur: +(len(b) / SR).toFixed(3), mmax: +mmax.toFixed(2), I: +I.toFixed(2), tp: +truePeak(b).toFixed(2), peakSec: +(at / SR).toFixed(3), peakDb: +(20 * Math.log10(pk || 1e-12)).toFixed(2) };
}

// ───────────── 收尾（沿用 make-sfx.mjs finish()）＋16-bit TPDF 抖動 ─────────────
function toWav(b, rnd) {
  const n = len(b), out = Buffer.alloc(44 + n * 4);
  out.write('RIFF', 0); out.writeUInt32LE(36 + n * 4, 4); out.write('WAVE', 8); out.write('fmt ', 12);
  out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22); out.writeUInt32LE(SR, 24);
  out.writeUInt32LE(SR * 4, 28); out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34); out.write('data', 36); out.writeUInt32LE(n * 4, 40);
  const q = (v) => Math.max(-32768, Math.min(32767, Math.round(v * 32767 + (rnd() - rnd()))));
  for (let i = 0; i < n; i++) { out.writeInt16LE(q(b.L[i]), 44 + i * 4); out.writeInt16LE(q(b.R[i]), 46 + i * 4); }
  return out;
}
function fromWav(buf) { const n = (buf.length - 44) / 4, b = { L: new Float64Array(n), R: new Float64Array(n) }; for (let i = 0; i < n; i++) { b.L[i] = buf.readInt16LE(44 + i * 4) / 32767; b.R[i] = buf.readInt16LE(46 + i * 4) / 32767; } return b; }
function finish(x, R, id) {
  x = dcBlock(x); normPeak(x);
  const gainFor = (m, tp) => Math.min(R.target - (R.bgm ? m.I : m.mmax), TP_CEIL - tp);
  let { mmax, I } = loudness(x), g = dbl(gainFor({ mmax, I }, truePeak(x)));
  if (!R.bgm) { // 去前導靜音：第一個超過 −40 dBFS 的樣本前留 2 ms
    const thr = dbl(-40) / g; let on = 0; for (; on < len(x); on++) if (Math.abs(x.L[on]) > thr || Math.abs(x.R[on]) > thr) break;
    const st = Math.max(0, on - N(0.002)); x = slice(x, st, len(x));
    for (let i = 0; i < on - st; i++) { const w = fadeW(i / (on - st)); x.L[i] *= w; x.R[i] *= w; }
  }
  // 去尾端靜音：最後一個超過 −66 dBFS 的樣本後留 20 ms，再 30 ms 淡出（殘響尾巴自然收掉）
  const thr2 = dbl(-66) / g; let last = len(x) - 1; for (; last > 0; last--) if (Math.abs(x.L[last]) > thr2 || Math.abs(x.R[last]) > thr2) break;
  x = slice(x, 0, Math.min(len(x), last + N(0.02))); fadeOut(x, 0.03);
  if (len(x) > N(R.limit)) { x = slice(x, 0, N(R.limit)); fadeOut(x, R.bgm ? 2.0 : R.tailFade ?? 0.15); }
  for (let k = 0; k < 4; k++) { const m = loudness(x), d = gainFor(m, truePeak(x)); if (Math.abs(d) < 0.03) break; scale(x, dbl(d)); }
  const wav = toWav(x, rndOf(`dither:${id}`));
  return { wav, m: measure(fromWav(wav)) };
}

// ───────────── 配方 ─────────────
// 每個事件：target（M max 或 bgm 的整合響度）、limit（長度上限，spec FR-010～012）、ref（分析報告的剪映參考特徵）
const REF = {
  ding: '滴，提示音：787.5 Hz 近純正弦＋4.03 倍泛音 −20 dB，起音 20 ms，平撐 0.36 s 後兩段收尾，有慢拍頻、側聲 −10 dB，0.9 s',
  alert: '错误警告-滴滴：117.1 Hz 諧波豐富的蜂鳴（第 2 諧波最強、7–8、12、17、21、24 次有共振峰），兩聲 0–92／116–312 ms，平、乾、單聲道',
  success: '正确：C6–D6–G6–C7 每 60 ms 一音，每音＝基音（−37～−52 dB/s）＋4.415 倍（−65～−83 dB/s）＋5.30 倍（−113～−130 dB/s）非諧波泛音，敲擊瞬態，尾韻 1.1 s',
  impact: '综艺-咚咚：兩下相隔 135 ms（第二下大 2 dB），鼓膜模態 100／159／230／290 Hz（音高 105→96 Hz 下滑）＋790 Hz 鼓框＋2–3 kHz 鼓棒，−78 dB/s，0.6 s',
  chapter: '综艺嘭：52 Hz 次低頻（起音 70→52 Hz）持續 1 s、±5 dB 不規則起伏，88／141 Hz 非諧波模態，起音 60 ms 寬頻爆裂（重心 1.7 kHz），1.1 s 處截斷',
  sparkle: '仙尘：0–0.33 s 一串 6.6→13.4 kHz 小鈴（每顆 −70～−200 dB/s），之後 2.0–3.3 kHz 六個泛音的長尾（−20 dB/s）到 2.5 s，高頻先衰（重心 12→2.4 kHz）',
  shine: '综艺闪亮登场：10 音上行撥奏 1357→3223 Hz（以 1611 Hz 為主音的大調音階）每 35 ms 一音，近純音、低音 −48／高音 −30 dB/s，0.3–0.6 s 高音重撥，單聲道，1.9 s',
  thunder: '打雷：50 Hz–4 kHz 濾波噪聲（200–320 Hz 最強）、0.1／0.24／0.83 s 有爆裂、滾動起伏 6 次、立體聲去相關（相關 0.22），0.1 s 起音、1.2 s',
  'bgm-outro': '自備結尾配樂（Carefree，CC BY，只拿來比頻譜）：重心約 300 Hz、低頻豐厚、寬（側聲 −5 dB）',
};
const EVENTS = {
  ding: { target: -20, limit: 1.0, tailFade: 0.08 },
  alert: { target: -16, limit: 0.4, tailFade: 0.03 },
  success: { target: -16, limit: 2.0 },   // 2026-10-31 主代理裁決：放寬到接近剪映參考（1.93 s）；原 1.2 s
  impact: { target: -16, limit: 0.8 },
  chapter: { target: -16, limit: 1.3 },
  sparkle: { target: -16, limit: 2.8 },   // 同上（參考 2.74 s）；原 2.0 s
  shine: { target: -16, limit: 2.0 },     // 同上（參考 1.94 s）；原 1.6 s
  thunder: { target: -16, limit: 1.4 },
  'bgm-outro': { target: -20, limit: 12.5, bgm: true },
};

// ── ding：滴，提示音 ──
function dingTone(o, rnd, { room, beat = true, spread = 0.6 }) {
  // 斷點包絡：20 ms 起音、0.36 s 內只降 3.5 dB、之後兩段收尾（照參考包絡）
  const env = bpEnv([[0, -80], [0.02, 0], [0.12, -2.5], [0.36, -3.5], [0.52, -12], [0.70, -18], [0.80, -21], [0.88, -34], [0.93, -80]]);
  tone(o, { f: 787.5, dur: 0.95, env, spread, partials: [{ r: 1, db: 0 }, { r: 2, db: -36 }, { r: 4.03, db: -21 }] });
  if (beat) { // 微失諧夥伴音（+6／−5 cents，分在左右）：慢拍頻＋寬度
    tone(o, { f: 787.5 * 2 ** (6 / 1200), dur: 0.95, env, pan: -0.8, partials: [{ r: 1, db: -15 }] });
    tone(o, { f: 787.5 * 2 ** (-5 / 1200), dur: 0.95, env, pan: 0.8, partials: [{ r: 1, db: -17 }] });
  }
  // 起音：5 ms 帶通噪聲＋幾個 30 ms 內就消失的非諧波高泛音
  noiseHit(o, { dur: 0.012, rnd, tau: 0.0018, chain: [['hp', 2500], ['bp', 6000, 0.8]], db: -24, decor: 0.5 });
  modal(o, { f: 787.5, rnd, jitter: 8, attack: 0.0005, dur: 0.1, partials: [{ r: 6.6, db: -30, decay: 260 }, { r: 8.3, db: -33, decay: 300 }, { r: 11.7, db: -36, decay: 360 }] });
  return room ? fdn(o, { rt60: room, size: 0.5, damp: 0.45, pre: 0.004, wet: -20, lowcut: 300 }) : o;
}
const RECIPES = {
  ding: [
    { v: 'a', desc: '電子「滴」放在小房間：787.5 Hz＋4.03 倍泛音、照參考的平撐兩段包絡、+6／−5 cents 夥伴音分左右（慢拍頻＋寬度）、左右 ±0.3 cents、起音噪聲＋三個 30 ms 高泛音、FDN 殘響 RT60 0.35 s −20 dB',
      tech: ['斷點包絡', '微失諧拍頻', '起音噪聲瞬態', 'FDN 殘響', '立體聲微失諧'], build: (rnd) => dingTone(stereo(1.4), rnd, { room: 0.35 }) },
    { v: 'b', desc: '敲擊玻璃「叮」：模態 1／2／4.03／5.4／8.9 倍各自衰減（基音 −38 dB/s、高泛音 −120～−200 dB/s）、4 ms 軟槌起音＋槌噪、FDN RT60 0.5 s −18 dB',
      tech: ['模態合成', '每泛音獨立衰減', '起音噪聲瞬態', 'FDN 殘響', '立體聲微失諧'],
      build: (rnd) => { const o = stereo(1.4); modal(o, { f: 787.5, rnd, jitter: 1.5, spread: 4, attack: 0.004, dur: 1.3, partials: [{ r: 1, db: 0, decay: 38, decay2: 30, w2: 0.3 }, { r: 2.0, db: -32, decay: 60 }, { r: 4.03, db: -19, decay: 46 }, { r: 5.4, db: -33, decay: 120 }, { r: 8.9, db: -38, decay: 200 }] }); noiseHit(o, { dur: 0.02, rnd, tau: 0.003, chain: [['lp', 7000], ['hp', 400]], db: -27, decor: 0.4 }); return fdn(o, { rt60: 0.5, size: 0.6, damp: 0.4, wet: -18, lowcut: 300 }); } },
    { v: 'c', desc: '同 a 但乾聲（沒有殘響）、左右 ±0.5 cents：最接近參考的電子提示音',
      tech: ['斷點包絡', '微失諧拍頻', '起音噪聲瞬態', '立體聲微失諧'], build: (rnd) => dingTone(stereo(1.4), rnd, { room: 0, spread: 1.0 }) },
  ],
  alert: [
    { v: 'a', desc: '蜂鳴器：117.1 Hz 加法合成 80 個諧波（第 1–3 諧波 −17／0／−10 dB，其餘照參考的共振峰走勢 −18→−62 dB＋±5 dB 亂數），兩聲 0–82／108–300 ms、3 ms 起落、每聲內降 0.8 dB，0.1 % 音高抖動、喇叭顆粒噪聲 −40 dB，單聲道乾聲',
      tech: ['加法合成（諧波輪廓）', '音高微抖', '噪聲層'], build: (rnd) => alertBuzz(rnd, { room: 0, spread: 0 }) },
    { v: 'b', desc: '電磁蜂鳴器：117.1 Hz PolyBLEP 脈衝波（工作週期 0.38）→ 234／940／2000／2850 Hz 共振峰 → 輕微飽和 → 極小房間 FDN RT60 0.12 s −24 dB',
      tech: ['減法合成（共振峰濾波）', '輕微飽和', 'FDN 殘響'], build: (rnd) => alertPulse(rnd) },
    { v: 'c', desc: '同 a，加小房間 FDN RT60 0.25 s −20 dB、左右 ±1 cents',
      tech: ['加法合成（諧波輪廓）', '音高微抖', 'FDN 殘響', '立體聲微失諧'], build: (rnd) => alertBuzz(rnd, { room: 0.25, spread: 2 }) },
  ],
  success: [
    { v: 'a', desc: '鐘琴（FM 鈴式）：C6–D6–G6–C7 每 60 ms 一音；每音模態＝基音（−37.5／−39／−47／−51.5 dB/s，雙段）＋4.415 倍（−75 dB/s）＋5.30 倍（−120 dB/s），非諧波泛音照參考低音弱（−26 dB）高音強（−4 dB）；2 ms 槌噪；每音微微左右錯開；FDN RT60 0.9 s −20 dB',
      tech: ['模態合成（非諧波泛音）', '雙段衰減', '起音噪聲瞬態', 'FDN 殘響', '立體聲微失諧'], build: (rnd) => successBells(rnd, 'a') },
    { v: 'b', desc: '鐵琴：同四音，模態 1／4／10 倍（調音過的音條），基音較慢衰減（×0.75、雙段），軟槌（低通 4 kHz、3 ms），FDN RT60 1.3 s −17 dB',
      tech: ['模態合成', '雙段衰減', '起音噪聲瞬態', 'FDN 殘響', '立體聲微失諧'], build: (rnd) => successBells(rnd, 'b') },
    { v: 'c', desc: '鋼片琴：同四音，模態 1／2／3／4.415 倍（2、3 倍 −24／−32 dB，較溫暖），2 ms 起音，FDN RT60 0.7 s −20 dB',
      tech: ['模態合成', '每泛音獨立衰減', '起音噪聲瞬態', 'FDN 殘響'], build: (rnd) => successBells(rnd, 'c') },
  ],
  impact: [
    { v: 'a', desc: '綜藝大鼓兩下（第一下最大，照契約對齊第一下）：鼓膜模態 10 個（1／1.59／2.14／2.30／2.92／3.50／3.95／4.31／4.94／5.34 倍，−78～−200 dB/s）、音高 105→95.5 Hz 下滑、鼓框高模態 8 個（609–3609 Hz）、2.6 kHz 鼓棒噪聲＋5 kHz 喀聲，相隔 135 ms（第一下衰減快 1.6 倍，像參考），tanh 飽和，FDN RT60 0.45 s −17 dB',
      tech: ['模態合成（鼓膜）', '音高下滑', '起音噪聲瞬態', '輕微飽和', 'FDN 殘響'], build: (rnd) => drums(rnd, 'a') },
    { v: 'b', desc: '同 a，但第二下大 2 dB、音高高 2 %（跟參考一樣；最大樣本在第二下，用這顆要把 kit 的 event 改成第二下）',
      tech: ['模態合成（鼓膜）', '音高下滑', '起音噪聲瞬態', '輕微飽和', 'FDN 殘響'], build: (rnd) => drums(rnd, 'b') },
    { v: 'c', desc: '大一號的鼓：基頻 84 Hz、衰減慢 30 %、鼓棒小 3 dB、房間大（RT60 0.75 s −13 dB），兩下一樣大',
      tech: ['模態合成（鼓膜）', '音高下滑', '起音噪聲瞬態', '輕微飽和', 'FDN 殘響'], build: (rnd) => drums(rnd, 'c') },
  ],
  chapter: [
    { v: 'a', desc: '綜藝重低音：52 Hz（起音 86→52 Hz）＋88.5／141／167／249 Hz 非諧波模態，平滑亂數 ±6 dB 不規則起伏（14 Hz），棕噪聲隆隆（低通 220 Hz），寬頻噪聲體（150 Hz–4 kHz、τ 0.25 s、−8 dB），tanh 飽和 drive 2.5，飽和後才疊起音爆裂（白噪高通 250 Hz、低通 15→1.5 kHz 隨時間關閉、τ 45 ms、−1 dB），撐到 0.95 s 再 0.17 s 收，FDN RT60 1.1 s −18 dB',
      tech: ['次低頻滑音', '非諧波模態', '濾波噪聲分層', '時變低通', '輕微飽和', 'FDN 殘響'], build: (rnd) => boom(rnd, 'a') },
    { v: 'b', desc: '電影感 boom：46 Hz（起音 110→46 Hz）雙段指數衰減（−45→−16 dB/s）、爆裂更亮更大、FDN RT60 1.8 s −13 dB（寬），自然衰減不截斷',
      tech: ['次低頻滑音', '雙段衰減', '濾波噪聲分層', '時變低通', '輕微飽和', 'FDN 殘響'], build: (rnd) => boom(rnd, 'b') },
    { v: 'c', desc: '大鼓＋次低頻：62 Hz 鼓膜模態（慢衰減）＋52 Hz 持續隆隆（同 a 的不規則起伏）＋寬頻噪聲體＋爆裂 −4 dB，FDN RT60 1.0 s −16 dB',
      tech: ['模態合成（鼓膜）', '次低頻滑音', '濾波噪聲分層', '時變低通', '輕微飽和', 'FDN 殘響'], build: (rnd) => boom(rnd, 'c') },
  ],
  sparkle: [
    { v: 'a', desc: '鈴樹＋泛音長尾：0.02–0.34 s 撒 30 顆小鈴（6.6→13.4 kHz 上行、越來越密、每顆 1／1.51 倍兩泛音 −90～−210 dB/s、左右隨機）＋4.7／5.5 kHz 起頭音；1453–3253 Hz 七個泛音（各帶 2 倍 −16 dB）在 0.10–0.32 s 漸入、−22→−15 dB/s 雙段長尾（左右 ±0.15 cents 慢閃動）；8 kHz 高通空氣噪聲；亮的 FDN RT60 1.6 s −17 dB',
      tech: ['模態合成（小鈴）', '雙段衰減', '立體聲微失諧', '噪聲層', 'FDN 殘響', '高頻先衰'], build: (rnd) => sparkle(rnd, 'a') },
    { v: 'b', desc: '更密的閃粉：55 顆小鈴、空氣噪聲大 6 dB、泛音長尾小 5 dB、殘響大（RT60 2.2 s −13 dB）',
      tech: ['模態合成（小鈴）', '雙段衰減', '立體聲微失諧', '噪聲層', 'FDN 殘響', '高頻先衰'], build: (rnd) => sparkle(rnd, 'b') },
    { v: 'c', desc: '鐘琴撒粉（較暖）：30 顆鐘琴音條（1／2.76／5.40 倍）3→7.5 kHz 上行＋同 a 的泛音長尾，FDN RT60 1.4 s −16 dB',
      tech: ['模態合成（音條）', '雙段衰減', '立體聲微失諧', 'FDN 殘響', '高頻先衰'], build: (rnd) => sparkle(rnd, 'c') },
  ],
  shine: [
    { v: 'a', desc: '上行撥奏音階：1357→3223 Hz 十音（以 1611 Hz 為主音的大調，每 30–40 ms 一音）、每音近純音模態（2 倍 −30、3 倍 −38 dB）、衰減由低音 −48 到高音 −30 dB/s（雙段）、撥奏噪聲、0.33–0.62 s 高音重撥 6 次，FDN RT60 1.1 s −22 dB（接近單聲道）',
      tech: ['模態合成', '雙段衰減', '起音噪聲瞬態', 'FDN 殘響'], build: (rnd) => shine(rnd, 'a') },
    { v: 'b', desc: '豎琴刮奏：同十音與時間，用 Karplus–Strong 撥弦（迴圈濾波依音高解出、讓基音衰減照參考，高頻先衰；全通分數延遲調音），只留 1–4.5 kHz，由左到右展開，FDN RT60 1.3 s −18 dB',
      tech: ['Karplus–Strong 撥弦', '高頻先衰', '立體聲定位', 'FDN 殘響'], build: (rnd) => shine(rnd, 'b') },
    { v: 'c', desc: '同 a 再加鋼片琴泛音（4 倍 −20 dB）、0.25–0.9 s 小鈴亮片尾巴 −16 dB、由左到右展開，FDN RT60 1.5 s −18 dB',
      tech: ['模態合成', '雙段衰減', '起音噪聲瞬態', '立體聲定位', 'FDN 殘響'], build: (rnd) => shine(rnd, 'c') },
  ],
  thunder: [
    { v: 'a', desc: '近雷：11 次滾動（τ 90–160 ms）帶動左右獨立的棕噪聲（低通 2.5→0.65 kHz 隨時間關閉、250 Hz +6 dB）＋次低頻噪聲層（40–110 Hz、−11 dB），tanh 飽和，之後疊 0.10／0.24／0.83 s 三組爆裂（1.5–6 kHz、2–4 個 1 ms 脈衝、Haas 0.4 ms），FDN RT60 1.8 s −14 dB',
      tech: ['濾波噪聲分層', '時變低通', '低頻調變', '起音噪聲瞬態', 'Haas 寬度', '輕微飽和', 'FDN 殘響'], build: (rnd) => thunder(rnd, 'a') },
    { v: 'b', desc: '霹靂：開頭一聲大爆裂（低通 8→1.5 kHz、τ 50 ms）再接滾動隆隆，長到 1.4 s',
      tech: ['濾波噪聲分層', '時變低通', '低頻調變', '起音噪聲瞬態', 'Haas 寬度', '輕微飽和', 'FDN 殘響'], build: (rnd) => thunder(rnd, 'b') },
    { v: 'c', desc: '遠雷：低通 1.8→0.4 kHz、起音慢、爆裂小 10 dB、殘響大（RT60 2.4 s −11 dB）',
      tech: ['濾波噪聲分層', '時變低通', '低頻調變', 'FDN 殘響'], build: (rnd) => thunder(rnd, 'c') },
  ],
  'bgm-outro': [
    { v: 'a', desc: '鋼琴＋弦樂 pad，F 大調 70 BPM：F–C/E–Dm7–B♭maj7–Gm7 C7–F（每和弦 2 拍），左手低音八度、右手八分音符分解和弦、旋律 A4 G4 F4 D5 C5 B♭4 → A4；鋼琴＝模態（弦剛性非諧波 B、三弦 ±0.7 cents 拍頻、雙段衰減、高泛音先衰、槌噪、制音）；pad＝每音 3 個鋸齒 ±6 cents、低通 2.2 kHz、慢起音＋5–12 kHz 空氣噪聲；柔和低音；FDN 殘響 RT60 2.2 s −9 dB；混音 EQ（100 Hz 低架 −4 dB、400 Hz −3 dB）；終止和弦響 2.9 s 後 1.8 s 淡出，約 11.4 s',
      tech: ['鋼琴模態合成', '弦剛性非諧波', '三弦拍頻', '雙段衰減', '減法 pad', 'FDN 殘響'], build: (rnd) => bgm(rnd, 'a') },
    { v: 'b', desc: '電鋼琴＋pad：同和聲進行，電鋼琴＝FM（1:1、調變指數 1.4→0.15、τ 0.25 s）＋14 倍音叉「叮」瞬態、左右 4.5 Hz 輕微自動聲像；pad 與混音 EQ 同 a；FDN RT60 1.8 s −10 dB；約 11.4 s',
      tech: ['FM 電鋼琴', '起音瞬態', '自動聲像', '減法 pad', 'FDN 殘響'], build: (rnd) => bgm(rnd, 'b') },
  ],
};

// ── alert ──
const ALERT_F0 = 117.14, BEEPS = [[0, 0.082, 0], [0.108, 0.300, -0.4]];
function alertProfile(rnd) {
  const fix = { 1: -17, 2: 0, 3: -10, 4: -24, 5: -37, 6: -26, 7: -19, 8: -17 };
  const P = [[3, -18], [4.58, -28], [5.58, -50], [6.13, -62]]; // log2(k) → dB（照參考共振峰走勢的折線）
  return Array.from({ length: 80 }, (_, i) => {
    const k = i + 1; if (fix[k] != null) return fix[k];
    const x = Math.log2(k); let d = P.at(-1)[1];
    for (let j = 1; j < P.length; j++) if (x <= P[j][0]) { d = P[j - 1][1] + (P[j][1] - P[j - 1][1]) * (x - P[j - 1][0]) / (P[j][0] - P[j - 1][0]); break; }
    return d + pm(rnd, 5);
  });
}
function beepEnv(t) { for (const [a, z, g] of BEEPS) if (t >= a && t < z) { const r = 0.003, u = t - a; const ramp = Math.min(1, u / r, (z - t) / r); return (0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, ramp))) * dbl(g - 0.8 * u / (z - a)); } return 0; }
function alertBuzz(rnd, { room, spread }) {
  const prof = alertProfile(rnd), n = N(0.45), o = stereo(0.45);
  const jit = smoothRand(n, rnd, 30);
  for (const [ch, sc] of [['L', -spread / 2], ['R', spread / 2]]) {
    const y = o[ch], fr = 2 ** (sc / 1200);
    prof.forEach((db, i) => {
      const k = i + 1, A = dbl(db), ph0 = rndOf(`alert-phase-${k}`)() * TAU; let ph = ph0;
      if (k * ALERT_F0 > 15000) return;
      for (let s = 0; s < n; s++) { const e = beepEnv(s / SR); if (e) y[s] += A * Math.sin(ph) * e; ph += TAU * k * ALERT_F0 * fr * (1 + 0.001 * jit[s]) / SR; }
    });
  }
  // 喇叭顆粒：帶通噪聲，用 117 Hz 半波整流調變
  const nz = filt(white(n, rnd), [['bp', 2500, 0.7]]), nm = peak1(nz) || 1;
  for (let s = 0; s < n; s++) { const t = s / SR, e = beepEnv(t); if (!e) continue; const am = Math.max(0, Math.sin(TAU * 2 * ALERT_F0 * t)); const v = nz[s] / nm * am * e * dbl(-40) * 4; o.L[s] += v; o.R[s] += v; }
  return room ? fdn(o, { rt60: room, size: 0.35, damp: 0.5, wet: -20, lowcut: 200 }) : o;
}
function alertPulse(rnd) {
  const n = N(0.45), x = new Float64Array(n), dt = ALERT_F0 / SR, duty = 0.38; let p = 0;
  const blep = (t) => (t < dt ? (t /= dt, t + t - t * t - 1) : t > 1 - dt ? (t = (t - 1) / dt, t * t + t + t + 1) : 0);
  for (let i = 0; i < n; i++) { let v = (p < duty ? 1 : -1) + blep(p) - blep((p - duty + 1) % 1); x[i] = v * beepEnv(i / SR); p += dt; if (p >= 1) p -= 1; }
  let y = filt(x, [['hp', 90, 0.7], ['peak', 234, 2, 8], ['peak', 940, 3, 6], ['peak', 2000, 4, 5], ['peak', 2850, 4, 5], ['lp', 7000, 0.7]]);
  const o = addMono(stereo(0.45), y, 0, 0, 0);
  saturate(o, 1.6, 0.05);
  return fdn(o, { rt60: 0.12, size: 0.3, damp: 0.5, wet: -24, lowcut: 200 });
}

// ── success ──
// [起點, Hz, dB, 基音衰減 dB/s, 聲像, 4.415 倍 dB, 5.30 倍 dB]（非諧波泛音：低音弱、高音強，照參考實測）
const SUCC = [[0, 1046.5, 0, 37.5, -0.08, -26, -30], [0.06, 1174.7, 0.5, 39.3, -0.03, -21, -25], [0.12, 1568.0, 0, 47.2, 0.03, -4, -8], [0.18, 2093.0, -0.5, 51.5, 0.08, -9, -13]];
function successBells(rnd, v) {
  const o = stereo(2.0);
  for (const [at, f, g, d, pan, h4, h5] of SUCC) {
    let partials, mallet, attack = 0.0006;
    if (v === 'a') { partials = [{ r: 1, db: 0, decay: d, decay2: d * 0.7, w2: 0.15 }, { r: 4.415, db: h4, decay: 75 }, { r: 5.30, db: h5, decay: 120 }]; mallet = { chain: [['lp', 9000], ['hp', 40]], tau: 0.0015, db: -24 }; }
    else if (v === 'b') { partials = [{ r: 1, db: 0, decay: d * 0.75, decay2: d * 0.45, w2: 0.3 }, { r: 4.0, db: -12, decay: 60 }, { r: 10.0, db: -22, decay: 140 }]; mallet = { chain: [['lp', 4000], ['hp', 200]], tau: 0.003, db: -28 }; attack = 0.002; }
    else { partials = [{ r: 1, db: 0, decay: d, decay2: d * 0.7, w2: 0.15 }, { r: 2, db: -24, decay: d * 1.8 }, { r: 3, db: -32, decay: d * 2.5 }, { r: 4.415, db: h4 - 4, decay: 80 }]; mallet = { chain: [['lp', 6000], ['hp', 40]], tau: 0.002, db: -30 }; attack = 0.002; }
    modal(o, { f, at, db: g, pan, rnd, jitter: 1.5, spread: 0.4, attack, dur: 1.9, partials });
    noiseHit(o, { at, dur: 0.02, rnd, ...mallet, pan, decor: 0.3 });
  }
  const room = { a: [0.9, -20], b: [1.3, -17], c: [0.7, -20] }[v];
  return fdn(o, { rt60: room[0], size: 0.8, damp: 0.35, wet: room[1], lowcut: 400 });
}

// ── impact ──
const MEMBRANE = [[1.00, 0, 78], [1.59, -20, 90], [2.14, -22, 110], [2.30, -16, 120], [2.92, -6, 86], [3.50, -24, 120], [3.95, -18, 102], [4.31, -22, 200], [4.94, -24, 88], [5.34, -25, 85]];
// 鼓皮／鼓框的高模態（Hz, dB, dB/s）：參考每一下新出現的峰 609／797／844／1031／1313／2344／3281／3609 Hz
const SHELL = [[609, -14, 120], [797, -10, 73], [844, -12, 110], [1031, -16, 150], [1313, -16, 150], [2344, -12, 110], [3281, -10, 120], [3609, -16, 160]];
function drumHit(o, { at, f1, db, rnd, slow = 1, stick = -11, pan = 0 }) {
  const glide = (t) => 1 + 0.1 * Math.exp(-t / 0.08);
  modal(o, { f: f1, at, db, pan, rnd, jitter: 3, spread: 3, attack: 0.0008, dur: 0.9, glide, partials: MEMBRANE.map(([r, d, dec]) => ({ r, db: d, decay: dec * slow, decay2: dec * slow * 0.6, w2: 0.1 })) });
  modal(o, { f: 1, at, db: db - 4, pan, rnd, jitter: 12, spread: 5, attack: 0.0005, dur: 0.6, partials: SHELL.map(([hz, d, dec]) => ({ r: hz, db: d, decay: dec * Math.max(1, slow) })) });
  noiseHit(o, { at, dur: 0.05, rnd, chain: [['bp', 2600, 0.7]], tau: 0.007, db: db + stick, pan, decor: 0.3 });
  noiseHit(o, { at, dur: 0.008, rnd, chain: [['hp', 5000]], tau: 0.0008, db: db + stick - 7, pan, decor: 0.5 });
}
function drums(rnd, v) {
  const o = stereo(1.2), gap = 0.135;
  if (v === 'a') { drumHit(o, { at: 0, f1: 95.5, db: 0, rnd, slow: 1.6 }); drumHit(o, { at: gap, f1: 96.5, db: -1, rnd }); }
  else if (v === 'b') { drumHit(o, { at: 0, f1: 95.5, db: -2, rnd, slow: 1.6 }); drumHit(o, { at: gap, f1: 97.5, db: 0, rnd }); }
  else { drumHit(o, { at: 0, f1: 84, db: 0, rnd, slow: 0.7, stick: -14 }); drumHit(o, { at: gap, f1: 85, db: 0, rnd, slow: 0.7, stick: -14 }); }
  saturate(o, 1.4, 0.03);
  const room = v === 'c' ? [0.75, -13] : [0.45, -17];
  return fdn(o, { rt60: room[0], size: 0.6, damp: 0.5, wet: room[1], lowcut: 80, highcut: 7000 });
}

// ── chapter ──
function boom(rnd, v) {
  const T = 1.5, n = N(T), o = stereo(T);
  const mod = smoothRand(n, rnd, 14), modLin = (i) => dbl(6 * mod[Math.min(i, n - 1)]);
  const G = v === 'b' ? (t) => 0.4 * Math.exp(-t * 16 / 8.686) + 0.6 * Math.exp(-t * 45 / 8.686) : (t) => (t < 0.25 ? 1 : dbl(-8 * (t - 0.25))) * (t < 0.95 ? 1 : t < 1.12 ? fadeW(1 - (t - 0.95) / 0.17) : 0);
  const env = v === 'b' ? (t) => G(t) : (t) => G(t) * modLin(N(t));
  const f = v === 'b' ? 46 : 52, from = v === 'b' ? 110 / 46 : 86 / 52;
  modal(o, { f, rnd, jitter: 0, spread: 0, attack: 0.002, dur: T, glide: (t) => 1 + (from - 1) * Math.exp(-t / 0.035), env, partials: [{ r: 1, db: 0, decay: 0 }] });
  if (v === 'a') modal(o, { f: 52, rnd, jitter: 6, spread: 8, attack: 0.004, dur: T, env, partials: [{ r: 88.5 / 52, db: -9, decay: 14 }, { r: 141 / 52, db: -24, decay: 18 }, { r: 167 / 52, db: -30, decay: 20 }, { r: 249 / 52, db: -32, decay: 24 }] });
  if (v === 'c') drumHit(o, { at: 0, f1: 62, db: 0, rnd, slow: 0.35, stick: -18 });
  // 隆隆：左右獨立棕噪聲，低通 220 Hz
  const rum = { L: filt(brown(n, rnd), [['lp', 220, 0.7], ['lp', 220, 0.7]]), R: filt(brown(n, rnd), [['lp', 220, 0.7], ['lp', 220, 0.7]]) };
  const rm = Math.max(peak1(rum.L), peak1(rum.R)) || 1;
  for (let i = 0; i < n; i++) { const e = env(i / SR) * dbl(v === 'c' ? -10 : -12) / rm; o.L[i] += rum.L[i] * e; o.R[i] += (0.7 * rum.L[i] + 0.3 * rum.R[i]) * e; }
  // 寬頻噪聲體：150 Hz–4 kHz，比次低頻衰減快（τ 0.18 s），跟同一個起伏走（參考削頂後整個頻帶都有能量）
  const body = filt(white(n, rnd), [['hp', 150, 0.7], ['lp', 4000, 0.7]]), bm = peak1(body) || 1;
  for (let i = 0; i < n; i++) { const t = i / SR, e = Math.exp(-t / 0.25) * env(t) * dbl(v === 'b' ? -7 : -8) / bm; o.L[i] += body[i] * e; o.R[i] += body[i] * e; }
  saturate(o, v === 'b' ? 2.0 : 2.5, 0);
  // 起音爆裂（飽和之後才疊，不被壓扁；最大樣本因此落在起音）：低通隨時間關閉（高頻先衰）
  const crack = v === 'b' ? { db: -2, sweep: { from: 16000, to: 2000, tau: 0.07 }, tau: 0.07 } : { db: v === 'c' ? -4 : -1, sweep: { from: 15000, to: 1500, tau: 0.05 }, tau: 0.045 };
  noiseHit(o, { dur: 0.3, rnd, chain: [['hp', 250, 0.7]], ...crack, decor: 0.4 });
  const room = { a: [1.1, -18, 1.2], b: [1.8, -13, 1.4], c: [1.0, -16, 1.1] }[v];
  return fdn(o, { rt60: room[0], size: room[2], damp: 0.6, wet: room[1], lowcut: 40, highcut: 6000 });
}

// ── sparkle ──
const TAIL = [[1453, -14], [2048, -12], [2171, -4], [2437, -5], [2735, 0], [2898, -4], [3253, -6]];
function sparkle(rnd, v) {
  const o = stereo(2.6), count = v === 'b' ? 55 : 30;
  for (let i = 0; i < count; i++) {
    const u = i / (count - 1), t = 0.02 + 0.32 * u ** 0.7;
    const f = (v === 'c' ? 3000 * (7500 / 3000) ** u : 6600 * (13400 / 6600) ** u) * (1 + pm(rnd, 0.06));
    const db = -10 + 10 * u - rnd() * (v === 'b' ? 2 : 4) - (v === 'b' ? 3 : 0), dec = 90 + rnd() * 120;
    const partials = v === 'c' ? [{ r: 1, db: 0, decay: dec * 0.7 }, { r: 2.76, db: -8, decay: dec * 1.4 }, { r: 5.40, db: -14, decay: dec * 2 }] : [{ r: 1, db: 0, decay: dec }, { r: 1.51, db: -9, decay: dec * 1.5 }];
    modal(o, { f, at: t, db, pan: pm(rnd, 0.35), rnd, jitter: 4, spread: 0, attack: 0.0004, dur: 0.6, partials });
  }
  if (v !== 'c') for (const [t, f, db] of [[0.03, 4740, -17], [0.05, 5540, -13]]) modal(o, { f, at: t, db, rnd, pan: pm(rnd, 0.4), dur: 0.6, partials: [{ r: 1, db: 0, decay: 60 }] });
  const tailDb = v === 'b' ? -14 : -9;
  TAIL.forEach(([f, db], k) => modal(o, { f, at: 0.10 + 0.036 * k, db: tailDb + db, pan: k % 2 ? 0.15 : -0.15, rnd, jitter: 2, spread: 0.3, attack: 0.08, dur: 2.5, partials: [{ r: 1, db: 0, decay: 22, decay2: 15, w2: 0.3 }, { r: 2, db: -16, decay: 30 }] }));
  const airEnv = (t) => (t < 0.32 ? (t / 0.32) ** 1.5 : Math.exp(-(t - 0.32) / 0.25));
  noiseHit(o, { dur: 2.0, rnd, chain: [['hp', 8000, 0.7], ['hp', 8000, 0.7]], env: airEnv, db: v === 'b' ? -20 : -26, decor: 0.3 });
  const room = { a: [1.6, -17, 0.2], b: [2.2, -13, 0.15], c: [1.4, -16, 0.3] }[v];
  return fdn(o, { rt60: room[0], size: 1.1, damp: room[2], wet: room[1], lowcut: 800, highcut: 16000, width: 0.5 });
}

// ── shine ──
const SCALE = [1357, 1437, 1611, 1809, 2031, 2151, 2414, 2710, 2871, 3223];
const SHINE_T = [0.000, 0.012, 0.028, 0.062, 0.100, 0.140, 0.172, 0.212, 0.245, 0.278];
const SHINE_DB = [-9, -5, -1, 0, 0, -2, -1, -5, -7, -8];
const RESTRIKE = [[0.33, 2414, -10], [0.39, 2710, -11], [0.44, 3223, -8], [0.50, 2871, -12], [0.56, 3223, -12], [0.62, 2710, -15]];
function shine(rnd, v) {
  const o = stereo(2.0), dOf = (f) => 48 - 18 * (f - 1357) / (3223 - 1357);
  const notes = SCALE.map((f, i) => [SHINE_T[i], f, SHINE_DB[i]]).concat(RESTRIKE.map(([t, f, db]) => [t, f, db]));
  notes.forEach(([t, f, db], i) => {
    const pan = v === 'a' ? 0 : -0.45 + 0.9 * Math.min(1, t / 0.3);
    if (v === 'b') { // 撥弦只留 1–4.5 kHz：去掉激發噪聲的低頻、壓高次諧波
      const s1 = pluck(stereo(1.9), { f, pan, rnd, decay: dOf(f), bright: 1.5 * f, dur: 1.9 });
      addStereo(o, filtS(s1, [['hp', 1000, 0.7], ['hp', 1000, 0.7], ['lp', 4500, 0.7]]), t, db); return;
    }
    const partials = [{ r: 1, db: 0, decay: dOf(f), decay2: dOf(f) * 0.75, w2: 0.2 }, { r: 2, db: -30, decay: dOf(f) * 2 }, { r: 3, db: -38, decay: dOf(f) * 3 }];
    if (v === 'c') partials.push({ r: 4, db: -20, decay: dOf(f) * 3 });
    modal(o, { f, at: t, db, pan, rnd, jitter: 2, spread: v === 'a' ? 0.5 : 2, attack: 0.0008, dur: 1.9, partials });
    noiseHit(o, { at: t, dur: 0.012, rnd, chain: [['bp', 2 * f, 1]], tau: 0.002, db: db - 24, pan });
  });
  if (v === 'c') for (let i = 0; i < 22; i++) { const t = 0.25 + 0.65 * (i / 21) ** 1.2; modal(o, { f: 5000 + rnd() * 4000, at: t, db: -16 - 10 * (i / 21) - rnd() * 4, pan: pm(rnd, 0.7), rnd, dur: 0.4, partials: [{ r: 1, db: 0, decay: 120 + rnd() * 80 }] }); }
  const room = { a: [1.1, -22, 0.4], b: [1.3, -18, 1], c: [1.5, -18, 1] }[v];
  return fdn(o, { rt60: room[0], size: 0.9, damp: 0.3, wet: room[1], lowcut: 500, width: room[2] });
}

// ── thunder ──
function thunder(rnd, v) {
  const T = v === 'b' ? 1.6 : 1.5, n = N(T), o = stereo(T);
  const rolls = [[0.03, -8], [0.09, -2], [0.16, -4], [0.22, 0], [0.30, -3], [0.37, 0], [0.47, -4], [0.58, -5], [0.70, -4], [0.82, -6], [0.95, -10]].map(([t, d]) => [t + (v === 'b' ? 0.05 : 0) + pm(rnd, 0.01), d, 0.09 + rnd() * 0.07]);
  const endFade = (t) => (t < 1.0 ? 1 : t < 1.22 + (v === 'b' ? 0.15 : 0) ? fadeW(1 - (t - 1.0) / (0.22 + (v === 'b' ? 0.15 : 0))) : 0);
  const R = new Float64Array(n);
  for (let i = 0; i < n; i++) { const t = i / SR; let e = 0; for (const [a, d, tau] of rolls) if (t >= a) e += dbl(d) * Math.min(1, (t - a) / (v === 'c' ? 0.03 : 0.008)) * Math.exp(-(t - a) / tau); R[i] = e * endFade(t); }
  const rm = peak1(R) || 1; for (let i = 0; i < n; i++) R[i] /= rm;
  const sw = v === 'c' ? { from: 1800, to: 400, tau: 0.4 } : { from: 2500, to: 650, tau: 0.35 };
  const rum = () => filt(sweepLP(brown(n, rnd, 0.995), (t) => sw.to + (sw.from - sw.to) * Math.exp(-t / sw.tau)), [['peak', 250, 0.8, 6], ['hp', 35, 0.7]]);
  const a = rum(), b = rum(), am = Math.max(peak1(a), peak1(b)) || 1;
  const sub = filt(brown(n, rnd), [['hp', 40, 0.7], ['lp', 110, 0.7], ['lp', 110, 0.7]]), sm = peak1(sub) || 1, Rs = onePoleLP(R, 6);
  for (let i = 0; i < n; i++) { o.L[i] += (a[i] / am) * R[i] + sub[i] / sm * Rs[i] * dbl(-11); o.R[i] += (0.2 * a[i] + 0.8 * b[i]) / am * R[i] + sub[i] / sm * Rs[i] * dbl(-11); }
  saturate(o, 1.3, 0.02);
  if (v === 'b') noiseHit(o, { at: 0.02, dur: 0.3, rnd, chain: [['hp', 200, 0.7]], sweep: { from: 8000, to: 1500, tau: 0.05 }, tau: 0.05, db: 0, decor: 0.6 });
  // 爆裂（飽和之後才疊）：每組 2–4 個 1 ms 脈衝，Haas 0.4 ms
  const cracks = v === 'b' ? [[0.24, -12], [0.83, -16]] : [[0.10, -10], [0.24, -12], [0.83, -16]];
  for (const [t, d] of cracks) {
    const k = 2 + Math.floor(rnd() * 3);
    for (let j = 0; j < k; j++) noiseHit(o, { at: t + j * (0.002 + rnd() * 0.005), dur: 0.012, rnd, chain: [['hp', 1500, 0.7], ['lp', 6000, 0.7]], tau: 0.0006 + rnd() * 0.0008, db: d - (v === 'c' ? 10 : 0) - j * 3, pan: pm(rnd, 0.6), haas: 0.0004, decor: 0.5 });
  }
  const room = { a: [1.8, -14, 1.4], b: [1.8, -14, 1.4], c: [2.4, -11, 1.6] }[v];
  return fdn(o, { rt60: room[0], size: room[2], damp: 0.55, wet: room[1], lowcut: 60, highcut: 5000 });
}

// ── bgm-outro ──
const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);
function pianoNote(o, { m, at, vel, dur, rnd }) {
  const f0 = midiHz(m), B = 1e-4 * 2 ** ((m - 40) / 19), K = Math.min(24, Math.floor(9000 / f0));
  const fh = 2500 + 5000 * vel, pan = Math.max(-0.5, Math.min(0.5, (m - 60) / 40));
  const strings = f0 > 110 ? [-0.7, 0, 0.7] : f0 > 60 ? [-0.4, 0.4] : [0];
  const base = 20 * Math.log10(vel) - 6;
  strings.forEach((c, si) => {
    const partials = [];
    for (let k = 1; k <= K; k++) {
      if (si > 0 && k > 8) break;
      const fk = k * Math.sqrt(1 + B * k * k), hz = f0 * fk;
      const hammer = Math.abs(Math.sin(Math.PI * k / 7.3)) + 0.15;
      const db = -6 * Math.log2(k) - 12 * hz / fh + 20 * Math.log10(hammer);
      const d1 = 3 + 0.011 * hz;
      partials.push({ r: fk, db, decay: d1, decay2: d1 / 4, w2: 0.22, detune: c });
    }
    modal(o, { f: f0, at, db: base - 4.8 * Math.log10(strings.length), pan: pan + (si - 1) * 0.08, rnd, jitter: 0.3, spread: 0.6, attack: 0.002 + 0.003 * (1 - vel), dur: dur + 1.2, partials, release: { at: dur, decay: 45 } });
  });
  noiseHit(o, { at, dur: 0.04, rnd, chain: [['lp', 900 + 1500 * vel, 0.7], ['hp', 60]], tau: 0.008, db: base - 30, pan });
}
function epNote(o, { m, at, vel, dur, rnd }) {
  const f = midiHz(m), n = N(dur + 1.0), x = new Float64Array(n), pan = Math.max(-0.4, Math.min(0.4, (m - 60) / 40));
  for (let i = 0; i < n; i++) {
    const t = i / SR, idx = 0.15 + 1.25 * vel * Math.exp(-t / 0.25), rel = t < dur ? 1 : Math.exp(-(t - dur) / 0.12);
    const amp = (0.75 * Math.exp(-t / 1.4) + 0.25 * Math.exp(-t / 4)) * Math.min(1, t / 0.0015) * rel;
    x[i] = Math.sin(TAU * f * t + idx * Math.sin(TAU * f * t)) * amp + 0.06 * vel * Math.sin(TAU * 14 * f * t) * Math.exp(-t / 0.03);
  }
  // 4.5 Hz 自動聲像
  const [gl0, gr0] = panGains(pan), g = dbl(20 * Math.log10(vel) - 8), i0 = N(at);
  for (let i = 0; i < n; i++) { const j = i0 + i; if (j >= len(o)) break; const ap = 0.12 * Math.sin(TAU * 4.5 * (j / SR)); o.L[j] += x[i] * g * gl0 * (1 - ap); o.R[j] += x[i] * g * gr0 * (1 + ap); }
}
function padChord(o, { notes, at, dur, rnd, db = -14 }) {
  const n = N(dur + 1.0);
  for (const m of notes) for (const c of [-6, 0, 6]) {
    const f = midiHz(m) * 2 ** (c / 1200), dt = f / SR, x = new Float64Array(n); let p = rnd();
    const blep = (t) => (t < dt ? (t /= dt, t + t - t * t - 1) : t > 1 - dt ? (t = (t - 1) / dt, t * t + t + t + 1) : 0);
    for (let i = 0; i < n; i++) { x[i] = 2 * p - 1 - blep(p); p += dt; if (p >= 1) p -= 1; }
    const y = filt(x, [['lp', 2200, 0.6], ['lp', 3600, 0.7]]);
    for (let i = 0; i < n; i++) { const t = i / SR; y[i] *= Math.min(1, t / 0.7) ** 2 * (t < dur ? 1 : Math.max(0, 1 - (t - dur) / 1.0)); }
    addMono(o, y, at, db - 10, c / 12);
  }
  // 弓聲／空氣：5–12 kHz 噪聲跟 pad 包絡走，左右獨立（pad 的高頻質感）
  noiseHit(o, { at, dur: dur + 1.0, rnd, chain: [['hp', 5000, 0.7], ['lp', 12000, 0.7]], env: (t) => Math.min(1, t / 0.7) ** 2 * (t < dur ? 1 : Math.max(0, 1 - (t - dur) / 1.0)), db: db - 20, decor: 1 });
}
function bgm(rnd, v) {
  const beat = 60 / 70, bar = 2 * beat, T = 5 * bar + 2.9, o = stereo(T + 1);
  const chords = [ // [LH, RH 八分音符, pad, 旋律]
    { lh: [41, 48], rh: [53, 60, 65, 60], pad: [53, 57, 60], mel: [[0, 69, 2]] },
    { lh: [40, 48], rh: [52, 55, 60, 55], pad: [52, 55, 60], mel: [[0, 67, 2]] },
    { lh: [38, 45], rh: [50, 57, 60, 57], pad: [50, 53, 57, 60], mel: [[0, 65, 2]] },
    { lh: [34, 41], rh: [46, 53, 57, 53], pad: [46, 50, 53, 57], mel: [[0, 74, 2]] },
    { lh: [43, 36], rh: [55, 62, 52, 58], pad: [55, 58, 62], mel: [[0, 72, 1], [1, 70, 1]], lh2: true },
  ];
  const note = v === 'a' ? pianoNote : epNote;
  chords.forEach((c, ci) => {
    const t0 = ci * bar;
    if (c.lh2) { note(o, { m: c.lh[0], at: t0, vel: 0.55, dur: beat, rnd }); note(o, { m: c.lh[1], at: t0 + beat, vel: 0.55, dur: beat, rnd }); }
    else c.lh.forEach((m, k) => note(o, { m, at: t0 + k * 0.012, vel: 0.55 - k * 0.08, dur: bar * 0.95, rnd }));
    c.rh.forEach((m, k) => note(o, { m, at: t0 + k * beat / 2 + pm(rnd, 0.006), vel: 0.38 + 0.08 * (k === 0) + pm(rnd, 0.04), dur: beat / 2 * 1.6, rnd }));
    c.mel.forEach(([b, m, l]) => note(o, { m, at: t0 + b * beat + 0.01, vel: 0.62 + pm(rnd, 0.03), dur: l * beat * 0.95, rnd }));
    if (c.lh2) { padChord(o, { notes: c.pad, at: t0, dur: beat, rnd }); padChord(o, { notes: [52, 55, 58], at: t0 + beat, dur: beat, rnd }); }
    else padChord(o, { notes: c.pad, at: t0, dur: bar, rnd });
    tone(o, { f: midiHz(c.lh[0] - 12 > 28 ? c.lh[0] - 12 : c.lh[0]), at: t0, dur: bar + 0.4, partials: [{ r: 1, db: -27 }, { r: 2, db: -35 }], env: (t) => Math.min(1, t / 0.05) * Math.exp(-t / 1.2) * (t < bar ? 1 : Math.max(0, 1 - (t - bar) / 0.4)) });
  });
  // 終止和弦：F 琶音展開，長響
  const tf = 5 * bar;
  [29, 41, 48, 53, 57, 60, 65, 69].forEach((m, k) => note(o, { m, at: tf + k * 0.045, vel: k < 2 ? 0.45 : 0.45 + 0.03 * k, dur: 2.8, rnd }));
  padChord(o, { notes: [53, 57, 60], at: tf, dur: 2.6, rnd });
  const room = v === 'a' ? [2.2, -9] : [1.8, -10];
  let w = fdn(o, { rt60: room[0], size: 1.5, damp: 0.45, pre: 0.02, wet: room[1], lowcut: 150, highcut: 11000 });
  w = filtS(w, [['ls', 100, 0.707, -4], ['peak', 400, 1, -3]]); // 混音：低頻收一點、400 Hz 去悶
  return fadeOut(slice(w, 0, N(T)), 1.8);
}

// ───────────── 執行 ─────────────
const HELP = `005 音效合成 v2（研究用、零相依）
  node specs/005-sfx/v2/make-sfx-v2.mjs --out <資料夾> [--only ding,alert]
  node specs/005-sfx/v2/make-sfx-v2.mjs --list
產出 <資料夾>/<事件>-v2a.wav… 與 v2-recipes.json。`;
function parse(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { console.log(HELP); process.exit(0); }
    if (a === '--list') { o.list = true; continue; }
    if ((a === '--out' || a === '--only') && argv[i + 1]) { o[a.slice(2)] = argv[++i]; continue; }
    console.error(`✖ 不認得的參數：${a} → 跑 --help 看用法`); process.exit(2);
  }
  o.names = o.only ? o.only.split(',').map((s) => s.trim()).filter(Boolean) : Object.keys(RECIPES);
  for (const n of o.names) if (!RECIPES[n]) { console.error(`✖ 沒有「${n}」（可用：${Object.keys(RECIPES).join('、')}）`); process.exit(2); }
  if (!o.list && !o.out) { console.error('✖ 要給 --out <資料夾> → 例：--out /tmp/sfx-v2'); process.exit(2); }
  return o;
}
function main() {
  const o = parse(process.argv.slice(2));
  if (o.list) { for (const [ev, list] of Object.entries(RECIPES)) for (const r of list) console.log(`${ev.padEnd(10)} ${`${ev}-v2${r.v}`.padEnd(16)} ${r.desc}`); return; }
  fs.mkdirSync(o.out, { recursive: true });
  const metaPath = path.join(o.out, 'v2-recipes.json');
  let meta = []; try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch { /* 第一次 */ }
  for (const ev of o.names) for (const r of RECIPES[ev]) {
    const id = `${ev}-v2${r.v}`, t0 = Date.now();
    const raw = r.build(rndOf(id));
    const { wav, m } = finish(raw, EVENTS[ev], id);
    fs.writeFileSync(path.join(o.out, `${id}.wav`), wav);
    const row = { event: ev, id, file: `${id}.wav`, desc: r.desc, techniques: r.tech, ref: REF[ev], target: EVENTS[ev].bgm ? `I ${EVENTS[ev].target} LUFS` : `M max ${EVENTS[ev].target} LUFS`, limit_s: EVENTS[ev].limit, ...m, sha256: createHash('sha256').update(wav).digest('hex') };
    meta = meta.filter((x) => x.id !== id).concat(row);
    console.log(`${id.padEnd(16)} ${m.dur.toFixed(3)} s  峰值 ${m.peakSec.toFixed(3)} s  M max ${m.mmax}  I ${m.I}  TP ${m.tp} dBTP  （${Date.now() - t0} ms）`);
  }
  const order = Object.keys(RECIPES);
  meta.sort((a, b) => order.indexOf(a.event) - order.indexOf(b.event) || a.id.localeCompare(b.id));
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 1) + '\n');
  console.log(`✔ ${o.out}（v2-recipes.json）`);
}

export { RECIPES, EVENTS, measure, loudness, truePeak };
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
