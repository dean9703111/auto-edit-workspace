// 瘦小腹（051 look.belly）：設定、位移場（方向、範圍、上限、對稱）、不做／減半的條件、姿勢軌跡（內插、去跳動、淡入淡出）、
// belly 0 輸出不變、ensureLook 判斷表、CLI、對照圖、真的偵測。契約：specs/contracts/look.md §9；沒有 ffmpeg／Chrome／示範口播時相關測試略過
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { TEMPLATE, WORKSPACE, imp, tmpDir as tmpFor } from './helpers.mjs';

const L = await imp('lib/look.mjs');
const CLI = await imp('look.mjs');
const { sanitizeLook } = await imp('editor/server/write.mjs');
const { chromeCandidates } = await imp('lib/audit-browser.mjs');

const HAS_FFMPEG = !spawnSync('ffmpeg', ['-version']).error;
const HAS_CHROME = chromeCandidates().length > 0;
const DEMO = path.join(WORKSPACE, 'projects', 'example', 'assets', 'camera', '示範口播.mp4');
const tmpDir = (p = 'belly-') => tmpFor(null, p);
const OK_PROBE = { assets: { ok: true, missing: [], bad: [] }, chrome: true };
const sha256 = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const B = L.BELLY;

// 合成的軀幹：肩中點 (cx, top)、肩寬 sw、軀幹長 len（左肩在畫面右邊，和 MediaPipe 一樣）；髖寬＝肩寬的一半
const pose = (cx, top, sw, len, { dx = 0 } = {}) => [cx + sw / 2, top, cx - sw / 2, top, cx + dx + sw / 4, top + len, cx + dx - sw / 4, top + len];
const sample = (p, v = [1, 1, 1, 1]) => ({ p, v });
// 網格上雙線性取位移（和 warpPlane 一樣的取法）
const dAt = (F, X, Y) => {
  const fx = (X - F.x0) / F.step, fy = (Y - F.y0) / F.step, gx = Math.floor(fx), gy = Math.floor(fy), tx = fx - gx, ty = fy - gy;
  const g = (i, j, c) => F.G[((gy + j) * F.gw + gx + i) * 2 + c];
  return [0, 1].map((c) => (g(0, 0, c) * (1 - tx) + g(1, 0, c) * tx) * (1 - ty) + (g(0, 1, c) * (1 - tx) + g(1, 1, c) * tx) * ty);
};

// ---------- 設定 ----------

test('設定：預設 belly 0；validateLook／kit/look.json／sanitizeLook 的訊息；belly > 0 也算要做底片', () => {
  const k = L.readKitLook(TEMPLATE);
  assert.equal(k.belly, 0, '工作區預設不瘦小腹');
  assert.deepEqual(L.LOOK_LIMITS.belly, [0, 1]);
  assert.deepEqual(L.validateLook({ belly: 0.5 }), []);
  assert.deepEqual(L.validateLook({ belly: 1.5 }), ['look.belly 要是 0–1 的數字（0＝不瘦小腹；腰往身體中線收，越大手臂與旁邊的東西越看得出變形），現在是 1.5']);
  assert.deepEqual(L.validateLook({ belly: '0.5' }), ['look.belly 要是 0–1 的數字（0＝不瘦小腹；腰往身體中線收，越大手臂與旁邊的東西越看得出變形），現在是 "0.5"']);
  const r = L.resolveLook({ plan: { look: { belly: 0.456 } }, templateDir: TEMPLATE });
  assert.deepEqual([r.color, r.slim, r.beauty, r.belly, r.source], [0, 0, 0, 0.46, 'plan']);
  assert.equal(L.resolveLook({ plan: { look: false }, templateDir: TEMPLATE }).belly, 0);
  assert.deepEqual([L.faceOn(r), L.needFace(r), L.needPose(r)], [true, false, true], '只開瘦小腹：要做底片、不偵測臉、要偵測姿勢');
  assert.deepEqual([L.faceOn({ slim: 0.6, beauty: 0, belly: 0 }), L.needPose({ slim: 0.6, beauty: 0, belly: 0 })], [true, false]);
  const t = tmpDir();
  fs.mkdirSync(path.join(t, 'kit'));
  fs.writeFileSync(path.join(t, 'kit', 'look.json'), '{ "color": 0, "slim": 0, "belly": 2, "lut": "x.cube" }');
  assert.throws(() => L.readKitLook(t), /kit\/look\.json 的 belly 要是 0–1 的數字，現在是 2 → 改成 0–1（預設 0＝不瘦小腹；要瘦小腹建議 0\.5），或刪掉這個欄位/);
  // 剪輯台存檔：belly 選填、有開才寫
  assert.deepEqual(sanitizeLook({ color: 0.8, slim: 0, belly: 0.5 }), { look: { color: 0.8, slim: 0, belly: 0.5 }, errors: [] });
  assert.deepEqual(sanitizeLook({ color: 0.8, slim: 0.6, belly: 0 }).look, { color: 0.8, slim: 0.6 });
  assert.deepEqual(sanitizeLook({ color: 0.8, slim: 0.6, belly: 1.2 }).errors, ['look.belly 要是 0–1 的數字，現在是 1.2']);
  assert.deepEqual(sanitizeLook({ color: 0.8, slim: 0.6, waist: 1 }).errors, ['look 不能有「waist」→ 只能寫 color、slim、beauty、belly']);
});

// ---------- 位移場 ----------

test('位移場：往中線收（左右對稱）、只有水平、肩膀以上和髖以下是 0、最大位移＝腰寬 × 6 % × 強度、強度單調、0 不做', () => {
  const p = pose(480, 200, 200, 240), W = 960, H = 640;   // 肩 y 200、髖 y 440；腰半寬 110、腰寬 220
  const g = L.bellyGeom(p);
  assert.deepEqual([g.sw, g.len, Math.round(g.half), Math.round(g.ratio * 100) / 100, g.tilt], [200, 240, 110, 0.83, 0]);
  const F = L.bellyField(p, 1, W, H);
  assert.ok(Math.abs(F.fw - 220) < 1e-6);
  // 範圍：ROI 上緣＝肩往下 top[0]、下緣＝bottom[1]；左右＝中線 ± reach × 半寬（各多 2 px）
  assert.deepEqual([F.x0, F.x1, F.y0, F.y1], [480 - 220 - 2, 480 + 220 + 2, Math.floor(200 + B.top[0] * 240) - 2, Math.ceil(200 + B.bottom[1] * 240) + 2]);
  // 只有水平位移
  for (let i = 1; i < F.G.length; i += 2) assert.ok(F.G[i] === 0);
  // 方向：反向取樣，右半從更右邊取（dx > 0）、左半從更左邊取（dx < 0）→ 畫面往中線收；中線不動；左右對稱
  const y = 380;   // t = 0.75，全做的那一段
  const D = B.max * 220;
  assert.ok(Math.abs(dAt(F, 590, y)[0] - D) < 0.15 && Math.abs(dAt(F, 370, y)[0] + D) < 0.15, `軀幹外緣 ±${D.toFixed(1)} px：${dAt(F, 590, y)[0].toFixed(2)}／${dAt(F, 370, y)[0].toFixed(2)}`);
  assert.ok(Math.abs(dAt(F, 480, y)[0]) < 1e-6, '中線不動');
  for (const d of [20, 55, 110, 160, 200]) assert.ok(Math.abs(dAt(F, 480 + d, y)[0] + dAt(F, 480 - d, y)[0]) < 0.15, `離中線 ${d} px 左右對稱（網格不一定對齊中線，差在 0.15 px 內）`);
  // 剖面：inner 以內等比例（位移 ÷ 距離是常數）、外緣附近最大、再往外回到 0
  const k1 = dAt(F, 480 + 22, y)[0] / 22, k2 = dAt(F, 480 + 66, y)[0] / 66;
  assert.ok(Math.abs(k1 - k2) < 0.003, `等比例：${k1.toFixed(4)}／${k2.toFixed(4)}`);
  assert.ok(dAt(F, 480 + 165, y)[0] < D * 0.7 && dAt(F, 480 + 165, y)[0] > 0 && Math.abs(dAt(F, 480 + 219, y)[0]) < 0.1, '往外衰減到 0');
  for (const r of [0, B.reach, 3]) assert.ok(L.bellyProfile(r) === 0, `ρ ${r}`);
  let peak = 0, at = 0; for (let r = 0; r <= 2; r += 0.01) if (L.bellyProfile(r) > peak) { peak = L.bellyProfile(r); at = r; }
  assert.ok(Math.abs(peak - 1) < 1e-3 && at > 0.9 && at < 1.15, `峰值 ${peak.toFixed(3)} 在 ρ ${at.toFixed(2)}`);
  // 上下：肩（t 0）到 top[0] 是 0、髖以下（bottom[1]）是 0，中間平滑
  for (const t of [0, 0.2, B.top[0], B.bottom[1], 1.3]) assert.ok(L.bellyBand(t) === 0, `t ${t}`);
  assert.deepEqual([B.top[1], 0.75, B.bottom[0]].map((t) => L.bellyBand(t)), [1, 1, 1]);
  assert.ok(L.bellyBand(0.45) > 0 && L.bellyBand(0.45) < 1 && L.bellyBand(0.95) > 0 && L.bellyBand(0.95) < 1);
  assert.ok(Math.abs(dAt(F, 590, 200 + 0.37 * 240)[0]) < 0.3, '肋骨上面幾乎不動');
  // 上限：整個場的最大位移＝腰寬 × max × 強度（網格取樣會少一點點，不會多）
  for (const s of [0.25, 0.5, 1]) {
    const m = L.maxDisp(L.bellyField(p, s, W, H));
    assert.ok(m <= B.max * 220 * s + 1e-6 && m > B.max * 220 * s * 0.97, `強度 ${s}：最大 ${m.toFixed(2)} px`);
  }
  assert.equal(L.bellyField(p, 0, W, H), null);
  assert.equal(L.bellyField(null, 1, W, H), null);
  assert.equal(L.bellyField(pose(480, 400, 200, -240), 1, W, H), null, '髖在肩上面（倒過來）不做');
  // 軀幹歪一點：中線跟著肩 → 髖的連線走
  const Ft = L.bellyField(pose(480, 200, 200, 240, { dx: 40 }), 1, W, H);
  assert.ok(Math.abs(dAt(Ft, 480 + 40 * 0.75, y)[0]) < 0.05, '歪的軀幹：中線在肩髖連線上');
});

test('變形：直的邊往中線移、橫線完全不動、ROI 外不動；YUV 的 U／V 平面位移是 Y 的一半', () => {
  const W = 960, H = 640, p = pose(480, 200, 200, 240);
  const img = Buffer.alloc(W * H, 200);
  for (let y = 150; y < 500; y++) for (let x = 370; x < 590; x++) img[y * W + x] = 30;   // 深色的軀幹（x 370–590＝中線 ± 半寬）
  for (const y of [400, 401]) for (let x = 0; x < W; x++) img[y * W + x] = 255;            // 一條橫線（桌緣）
  const out = Buffer.from(img), F = L.bellyField(p, 1, W, H);
  L.warpPlane(out, { w: W, h: H, ch: 1 }, F, 1);
  const edges = (buf, y) => { let a = -1, b = -1; for (let x = 0; x < W; x++) if (buf[y * W + x] < 115) { if (a < 0) a = x; b = x; } return [a, b]; };
  const [l0, r0] = edges(img, 380), [l1, r1] = edges(out, 380), D = B.max * 220;
  assert.deepEqual([l0, r0], [370, 589]);
  assert.ok(Math.abs(l1 - l0 - D) < 2.5 && Math.abs(r0 - r1 - D) < 2.5, `腰的兩邊各往內 ${D.toFixed(1)} px：左 ${l1 - l0}、右 ${r0 - r1}`);
  assert.ok(Math.abs((l1 - l0) - (r0 - r1)) <= 1, '左右對稱');
  assert.deepEqual(edges(out, 250), edges(img, 250), '肋骨以上（t 0.21）不動');
  assert.deepEqual(edges(out, 470), edges(img, 470), '髖以下（t 1.125）不動');
  for (const y of [400, 401]) for (let x = 0; x < W; x++) assert.equal(out[y * W + x], 255, `橫線 (${x}, ${y})`);
  for (let y = 0; y < H; y += 3) for (let x = 0; x < W; x += 3) {
    if (x >= F.x0 && x < F.x1 && y >= F.y0 && y < F.y1) continue;
    assert.equal(out[y * W + x], img[y * W + x], `ROI 外 (${x}, ${y})`);
  }
  // 色度平面（寬高各一半）：同一條邊移動一半
  const cw = W / 2, chh = H / 2, uv = Buffer.alloc(cw * chh, 200);
  for (let y = 75; y < 250; y++) for (let x = 185; x < 295; x++) uv[y * cw + x] = 30;
  const uo = Buffer.from(uv);
  L.warpPlane(uo, { w: cw, h: chh, ch: 1 }, F, 0.5);
  let a = -1; for (let x = 0; x < cw; x++) if (uo[190 * cw + x] < 115) { a = x; break; }
  assert.ok(Math.abs(a - 185 - D / 2) < 1.6, `U／V 左邊往內 ${a - 185} px（Y 的一半 ${(D / 2).toFixed(1)}）`);
});

// ---------- 什麼時候不做／減半 ----------

test('不做／減半：髖在畫面外、可見度低、側身、軀幹歪斜、人太小', () => {
  const p = pose(480, 200, 200, 240), opt = { height: 640 };
  assert.equal(L.bellyGate(p, [1, 1, 1, 1], opt), 1);
  // 髖在畫面外（半身取景）：不做
  assert.equal(L.bellyGate(p, [1, 1, 1, 1], { height: 430 }), 0, '髖的 y 440 ≥ 畫面高 430');
  assert.equal(L.bellyGate(p, [1, 1, 1, 1], { height: 441 }), 1);
  // 可見度（四點取最小）：≤ 0.5 不做、≥ 0.8 全做、中間平滑
  assert.equal(L.bellyGate(p, [1, 1, 0.3, 1], opt), 0);
  assert.equal(L.bellyGate(p, [1, 1, B.vis[0], 1], opt), 0);
  assert.equal(L.bellyGate(p, [1, 1, 1, B.vis[1]], opt), 1);
  const mid = L.bellyGate(p, [1, 0.65, 1, 1], opt);
  assert.ok(mid > 0.3 && mid < 0.7, `可見度 0.65 → ${mid.toFixed(2)}`);
  // 側身：肩寬 ÷ 軀幹長 ≤ 0.4 不做、≥ 0.6 全做、中間減半
  const side = (ratio) => L.bellyGate(pose(480, 200, 240 * ratio, 240), [1, 1, 1, 1], opt);
  assert.deepEqual([side(0.3), side(0.4), side(0.6), side(0.9)], [0, 0, 1, 1]);
  assert.ok(Math.abs(side(0.5) - 0.5) < 1e-6, `肩寬是軀幹長的一半 → ${side(0.5)}`);
  assert.ok(side(0.45) < side(0.5) && side(0.5) < side(0.55), '越側越少');
  // 軀幹歪斜（彎腰、斜躺）：≥ 35° 不做、≤ 25° 全做
  const tilt = (deg) => L.bellyGate(pose(480, 200, 200, 240, { dx: Math.tan((deg * Math.PI) / 180) * 240 }), [1, 1, 1, 1], opt);
  assert.equal(tilt(20), 1);
  assert.ok(tilt(30) > 0 && tilt(30) < 1);
  assert.equal(tilt(40), 0);
  // 人太小：肩寬（換算到 rough-look 畫面）< 60 px 不做
  assert.equal(L.bellyGate(pose(100, 50, 50, 60), [1, 1, 1, 1], { height: 640 }), 0);
  assert.equal(L.bellyGate(pose(100, 50, 50, 60), [1, 1, 1, 1], { height: 640, scale: 2 }), 1);
  assert.equal(L.bellyGate(p, [1, 1, 1, 1], { height: 640, scale: 0.25 }), 0);
});

// ---------- 姿勢軌跡 ----------

const poseData = (samples, extra = {}) => ({ version: 1, every: 3, frameCount: samples.length * 3, source: { height: 640 }, samples, ...extra });

test('loadPoseTrack：每 3 格一筆、中間內插；偵測斷掉的地方前後 5 格淡出；單筆跳動被平滑掉；全黑不算', () => {
  // 人慢慢往右移（每筆 3 px）：內插出來的每一格等距
  const move = poseData(Array.from({ length: 20 }, (_, j) => sample(pose(400 + j * 3, 200, 200, 240))));
  let t = L.loadPoseTrack(move);
  assert.deepEqual([t.n, t.every], [60, 3]);
  const cx = (i) => { const p = t.pose(i); return (p[0] + p[2]) / 2; };
  for (let i = 24; i < 36; i++) assert.ok(Math.abs(cx(i + 1) - cx(i) - 1) < 1e-3, `第 ${i} 格到下一格移 ${(cx(i + 1) - cx(i)).toFixed(3)} px`);
  assert.ok(Math.abs(cx(30) - 430) < 0.01, '平滑不改變等速移動的位置');
  assert.equal(t.weight(30), 1);
  assert.ok(Math.abs(L.bellyGeom(t.pose(30, 0.5)).sw - 100) < 1e-3, 'scale：換算到別的解析度');
  assert.equal(t.pose(60), null);
  assert.equal(t.weight(-1), 0);
  // 偵測斷掉（第 10 筆＝第 30–32 格沒有人）：那一筆權重 0，前後淡入淡出，每格最多變 1／FADE_FRAMES（外加內插的斜率）
  const gap = poseData(Array.from({ length: 30 }, (_, j) => (j === 10 ? null : sample(pose(480, 200, 200, 240)))));
  t = L.loadPoseTrack(gap);
  assert.equal(t.weight(30), 0);
  assert.ok(t.weight(27) > 0 && t.weight(27) < 1 && t.weight(36) < 1, `淡出／淡入：${t.weight(27).toFixed(2)}／${t.weight(36).toFixed(2)}`);
  assert.equal(t.weight(12), 1);
  assert.equal(t.weight(60), 1);
  for (let i = 1; i < t.n; i++) assert.ok(Math.abs(t.weight(i) - t.weight(i - 1)) <= 1 / 3 + 1e-6, `第 ${i} 格權重跳 ${Math.abs(t.weight(i) - t.weight(i - 1)).toFixed(2)}`);
  assert.ok(t.pose(30), '沒偵測到的那一筆用旁邊的位置（權重是 0，不會用到）');
  // 單筆跳動：某一筆髖部飄走 60 px → 三筆中位數去掉，前後幾格的位置幾乎不變
  const spike = poseData(Array.from({ length: 30 }, (_, j) => sample(j === 15 ? [580, 200, 380, 200, 530, 500, 430, 500] : pose(480, 200, 200, 240))));
  t = L.loadPoseTrack(spike);
  for (let i = 36; i < 54; i++) assert.ok(Math.abs(t.pose(i)[5] - 440) < 0.01, `第 ${i} 格的髖 y ${t.pose(i)[5].toFixed(2)}`);
  let jump = 0; for (let i = 1; i < t.n; i++) jump = Math.max(jump, Math.abs(L.maxDisp(L.bellyField(t.pose(i), 1, 960, 640)) - L.maxDisp(L.bellyField(t.pose(i - 1), 1, 960, 640))));
  assert.ok(jump < 0.01, `每格最大位移差 ${jump.toFixed(3)} px`);
  // 連續兩筆都飄走：高斯平滑把它攤開，每格的位置變化遠小於原本的 60 px
  const two = poseData(Array.from({ length: 30 }, (_, j) => sample(j === 15 || j === 16 ? [580, 200, 380, 200, 530, 500, 430, 500] : pose(480, 200, 200, 240))));
  t = L.loadPoseTrack(two);
  let dy = 0; for (let i = 1; i < t.n; i++) dy = Math.max(dy, Math.abs(t.pose(i)[5] - t.pose(i - 1)[5]));
  assert.ok(dy < 6, `髖 y 每格最多動 ${dy.toFixed(2)} px（原本一筆跳 60 px）`);
  // 髖看不到的那幾筆：權重 0
  const hid = poseData(Array.from({ length: 30 }, (_, j) => sample(pose(480, 200, 200, 240), j >= 20 ? [1, 1, 0.1, 0.1] : [1, 1, 1, 1])));
  t = L.loadPoseTrack(hid);
  assert.deepEqual([t.weight(30), t.weight(66), t.weight(89)], [1, 0, 0]);
});

test('poseSummary：偵測率、能做的格、肩寬中位數；偵測率低／人太小／能做的格太少 → 整支不做並寫原因', () => {
  const ok = sample(pose(480, 200, 200, 240));
  let s = L.poseSummary(poseData(Array.from({ length: 50 }, () => ok)));
  assert.deepEqual(s, { sampled: 50, detected: 50, black: 0, missing: 0, rate: 1, usable: 1, medianShoulder: 200, lookShoulder: 200, bellyOk: true });
  // 全黑的不算進偵測率
  s = L.poseSummary(poseData([...Array.from({ length: 40 }, () => ok), ...Array.from({ length: 10 }, () => 0)]));
  assert.deepEqual([s.black, s.rate, s.bellyOk], [10, 1, true]);
  // 偵測率 70 %（< 80 %）
  s = L.poseSummary(poseData(Array.from({ length: 50 }, (_, j) => (j % 10 < 3 ? null : ok))));
  assert.deepEqual([s.rate, s.bellyOk, s.reason], [0.7, false, 'rate']);
  assert.equal(L.bellySkipWhy(s), '姿勢偵測率 70%（< 80%）');
  // 人太小
  s = L.poseSummary(poseData(Array.from({ length: 50 }, () => sample(pose(100, 50, 40, 50)))));
  assert.deepEqual([s.bellyOk, s.reason, s.medianShoulder], [false, 'small', 40]);
  assert.equal(L.bellySkipWhy(s), '肩寬中位數 40 px < 60 px（畫面裡的人太小，腰收不到 1 px）');
  assert.equal(L.poseSummary(poseData(Array.from({ length: 50 }, () => sample(pose(100, 50, 40, 50)))), { lookScale: 2 }).bellyOk, true, '換算到 rough-look 畫面夠大就做');
  // 半身取景（髖在畫面外、可見度低）：偵測得到人，但能做的格是 0
  s = L.poseSummary(poseData(Array.from({ length: 50 }, () => sample(pose(480, 300, 200, 400), [1, 1, 0.1, 0.1]))));
  assert.deepEqual([s.rate, s.usable, s.bellyOk, s.reason], [1, 0, false, 'usable']);
  assert.equal(L.bellySkipWhy(s), '能做的格只有 0%（< 80%；髖部在畫面外、側身、彎腰的格不做）');
  // 一半的時間側身
  s = L.poseSummary(poseData(Array.from({ length: 50 }, (_, j) => sample(pose(480, 200, j < 25 ? 200 : 60, 240)))));
  assert.ok(s.usable > 0.4 && s.usable < 0.6 && s.reason === 'usable', JSON.stringify(s));
});

// ---------- 快取與 ensureLook 判斷表 ----------

function fakeProject() {
  const dir = tmpDir('belly-proj-'), work = path.join(dir, 'work');
  fs.mkdirSync(path.join(work, 'hyperframes'), { recursive: true });
  fs.writeFileSync(path.join(work, 'rough.mp4'), 'rough');
  return dir;
}
const FACE_OK = { rate: 0.9998, medianFaceWidth: 172, lookFaceWidth: 172, slimOk: true };
const POSE_OK = { sampled: 100, detected: 100, black: 0, missing: 0, rate: 1, usable: 0.98, medianShoulder: 320, lookShoulder: 320, bellyOk: true };
// face／pose＝各自的 summary（null＝沒偵測過）；footage＝底片實際套用的 { slim, beauty, belly }（null＝沒做）
function setState(dir, { face = null, pose = POSE_OK, footage = null } = {}) {
  const P = L.statePaths(dir), st = {};
  if (face) { fs.writeFileSync(P.landmarks, '{}'); st.landmarks = { ...L.statOf(P.landmarks), rough: L.statOf(P.rough), modelSha256: L.modelSha(TEMPLATE), lmVer: L.LM_VER, every: 1, summary: face }; }
  if (pose) { fs.writeFileSync(P.pose, '{"p":1}'); st.pose = { ...L.statOf(P.pose), rough: L.statOf(P.rough), modelSha256: L.poseSha(TEMPLATE), poseVer: L.POSE_VER, every: 3, summary: pose }; }
  if (footage) {
    fs.writeFileSync(P.footage, 'look');
    st.footage = { ...L.statOf(P.footage), rough: L.statOf(P.rough), landmarks: L.statOf(P.landmarks), slim: footage.slim || 0, beauty: footage.beauty || 0, lookVer: L.LOOK_VER, width: 640, height: 360,
      ...(footage.belly > 0 ? { belly: footage.belly, pose: L.statOf(P.pose) } : {}) };
  }
  L.writeState(dir, st);
  return P;
}

test('ensureLook：只開瘦小腹不看臉；最新 → rough-look.mp4＋key.belly；瘦臉、瘦小腹各自略過；belly 0 的 key 和以前一樣', () => {
  const run = (dir, look, strict = true, probe = OK_PROBE) => L.ensureLook({ projectDir: dir, plan: { look }, templateDir: TEMPLATE, strict, probe });
  // 沒跑過：strict 丟錯（怎麼關瘦小腹寫在訊息裡）、非 strict ⚠
  let d = fakeProject();
  assert.throws(() => run(d, { belly: 0.5 }), /^Error: 瘦臉底片不是最新的（還沒跑過；不要瘦小腹就在 plan\.json 寫 "look": \{ "belly": 0 \}）→ 先跑 node shared\/template\/tools\/look\.mjs run --project \S+$/);
  assert.throws(() => run(d, { slim: 0.6, belly: 0.5 }), /不要瘦臉、瘦小腹就在 plan\.json 寫 "look": \{ "slim": 0, "belly": 0 \}）→ 先跑 /);
  let r = run(d, { belly: 0.5 }, false);
  assert.match(r.report[1], /^⚠ 瘦小腹還沒套到底片（還沒跑過），這次先用 work\/rough\.mp4 → node shared\/template\/tools\/look\.mjs run --project /);
  assert.equal(r.key, null, '調光關、什麼都沒套：沒有 key');
  assert.equal(L.lookNeedsRun({ projectDir: d, plan: { look: { belly: 0.5 } }, templateDir: TEMPLATE, probe: OK_PROBE }), true);
  // 少姿勢模型：build 不停、略過並說怎麼補；下一步是 ensure --download（要先問使用者）
  const noPose = { assets: { ok: false, missing: [L.POSE_MODEL], bad: [] }, chrome: true };
  r = run(d, { belly: 0.5 }, true, noPose);
  assert.equal(r.report[1], '⚠ 講者瘦小腹略過：找不到 shared/template/vendor/mediapipe/pose_landmarker_lite.task，只調光 → node shared/template/tools/look.mjs ensure');
  const ns = L.lookNextStep({ projectDir: d, plan: { look: { belly: 0.5 } }, templateDir: TEMPLATE, probe: noPose });
  assert.deepEqual([ns.step, ns.cmd], ['ensure', 'node shared/template/tools/look.mjs ensure --download']);
  assert.match(ns.note, /^少姿勢偵測的檔（瘦小腹用）；照 AGENTS\.md 規則 3 先告訴使用者要下載約 6 MB，同意再跑$/);
  // 只開瘦小腹、姿勢與底片都最新：不需要臉部 landmark
  d = fakeProject();
  let P = setState(d, { footage: { belly: 0.5 } });
  r = run(d, { belly: 0.5 });
  assert.equal(r.footage, P.footage);
  assert.deepEqual(r.key, { v: L.LOOK_VER, color: 0, slim: 0, belly: 0.5, footage: 'rough-look.mp4' });
  assert.deepEqual(r.report, ['講者調光：關（plan.json 的 look）', '講者瘦臉：關、美顏：關、瘦小腹：0.5（work/rough-look.mp4；姿勢偵測率 100.00%、肩寬中位數 320 px）']);
  let st = L.readState(d);
  assert.equal(L.poseFresh(st, P, L.poseSha(TEMPLATE)), true);
  assert.equal(L.footageFresh(st, P, L.modelSha(TEMPLATE), 0, 0, 0.5, L.poseSha(TEMPLATE)), true);
  assert.equal(L.footageFresh(st, P, L.modelSha(TEMPLATE), 0, 0, 0.6, L.poseSha(TEMPLATE)), false);
  // 過期的原因
  assert.throws(() => run(d, { belly: 0.8 }), /瘦臉底片不是最新的（瘦小腹強度 0\.5 → 0\.8；/);
  assert.equal(L.staleReason(st, P, L.modelSha(TEMPLATE), 0, 0, 0.5, 'other'), '姿勢偵測模型換過');
  L.writeState(d, { pose: { ...st.pose, poseVer: 0 } });
  assert.throws(() => run(d, { belly: 0.5 }), /姿勢偵測版本更新（POSE_VER 0 → 1）/);
  L.writeState(d, { pose: st.pose });
  fs.writeFileSync(P.pose, '{"changed":true}');
  assert.throws(() => run(d, { belly: 0.5 }), /work\/pose-landmarks\.json 不見了或被改過/);
  // 本來只瘦臉、後來打開瘦小腹：要補偵測姿勢
  d = fakeProject();
  P = setState(d, { face: FACE_OK, pose: null, footage: { slim: 0.6 } });
  assert.deepEqual(run(d, { slim: 0.6 }).key, { v: L.LOOK_VER, color: 0, slim: 0.6, footage: 'rough-look.mp4' }, 'belly 0：key 沒有 belly，舊專案的戳記不變');
  assert.throws(() => run(d, { slim: 0.6, belly: 0.5 }), /瘦臉底片不是最新的（瘦小腹要的姿勢還沒偵測；/);
  // 兩個都開、都最新
  d = fakeProject();
  P = setState(d, { face: FACE_OK, footage: { slim: 0.6, belly: 0.5 } });
  r = run(d, { slim: 0.6, belly: 0.5 });
  assert.deepEqual(r.key, { v: L.LOOK_VER, color: 0, slim: 0.6, belly: 0.5, footage: 'rough-look.mp4' });
  assert.equal(r.report[1], '講者瘦臉：0.6、美顏：關、瘦小腹：0.5（work/rough-look.mp4；偵測率 99.98%、臉寬中位數 172 px；姿勢偵測率 100.00%、肩寬中位數 320 px）');
  // 臉太小（瘦臉略過）、瘦小腹照做：底片只有瘦小腹
  d = fakeProject();
  P = setState(d, { face: { rate: 1, medianFaceWidth: 43.1, lookFaceWidth: 43.1, slimOk: false, reason: 'small' }, footage: { belly: 0.5 } });
  r = run(d, { slim: 0.6, belly: 0.5 });
  assert.equal(r.footage, P.footage);
  assert.deepEqual([r.key.slim, r.key.belly], [0, 0.5]);
  assert.deepEqual(r.report.slice(1), ['講者瘦臉：關、美顏：關、瘦小腹：0.5（work/rough-look.mp4；姿勢偵測率 100.00%、肩寬中位數 320 px）',
    '⚠ 講者瘦臉略過：臉寬中位數 43 px < 60 px（畫面太小，瘦臉效果不到 1 px），瘦小腹照做']);
  assert.deepEqual(L.lookCheck({ projectDir: d, plan: { look: { slim: 0.6, belly: 0.5 } }, templateDir: TEMPLATE, probe: OK_PROBE }).warnings, ['講者瘦臉略過：臉寬中位數 43 px < 60 px（畫面太小，瘦臉效果不到 1 px），瘦小腹照做']);
  // 姿勢略過（半身取景）、瘦臉照做
  d = fakeProject();
  const HALF = { ...POSE_OK, usable: 0.03, bellyOk: false, reason: 'usable' };
  P = setState(d, { face: FACE_OK, pose: HALF, footage: { slim: 0.6 } });
  r = run(d, { slim: 0.6, belly: 0.5 });
  assert.equal(r.footage, P.footage);
  assert.deepEqual(r.key, { v: L.LOOK_VER, color: 0, slim: 0.6, footage: 'rough-look.mp4' });
  assert.deepEqual(r.report.slice(1), ['講者瘦臉：0.6、美顏：關、瘦小腹：關（work/rough-look.mp4；偵測率 99.98%、臉寬中位數 172 px）',
    '⚠ 講者瘦小腹略過：能做的格只有 3%（< 80%；髖部在畫面外、側身、彎腰的格不做），瘦臉、美顏照做 → 看 work/look-preview.jpg；確定不要瘦小腹就在 plan.json 寫 "look": { "belly": 0 }']);
  // 只開瘦小腹又略過：用 rough.mp4，不用跑
  d = fakeProject();
  P = setState(d, { pose: HALF });
  r = run(d, { belly: 0.5 });
  assert.equal(r.footage, P.rough);
  assert.equal(r.report[1], '⚠ 講者瘦小腹略過：能做的格只有 3%（< 80%；髖部在畫面外、側身、彎腰的格不做），只調光 → 看 work/look-preview.jpg；確定不要瘦小腹就在 plan.json 寫 "look": { "belly": 0 }');
  assert.equal(L.lookNeedsRun({ projectDir: d, plan: { look: { belly: 0.5 } }, templateDir: TEMPLATE, probe: OK_PROBE }), false);
  assert.equal(L.lookNextStep({ projectDir: d, plan: { look: { belly: 0.5 } }, templateDir: TEMPLATE, probe: OK_PROBE }).done, true);
});

test('預估：只偵測姿勢比偵測臉快；瘦小腹的變形多一點；都不給時和以前一樣', () => {
  const a = { frames: 36000, width: 1920, height: 1080 };
  assert.equal(L.estimateMinutes(a), Math.ceil((36000 * (26 + 14.5)) / 60000));
  assert.equal(L.estimateMinutes({ ...a, pose: true, belly: true }), Math.ceil((36000 * (26 + L.EST.poseMs / L.POSE_EVERY + 14.5 + L.EST.bellyMs)) / 60000));
  assert.ok(L.estimateMinutes({ ...a, detect: false, pose: true, warp: false }) < L.estimateMinutes({ ...a, warp: false }) / 2, '只跑姿勢不到臉部偵測的一半');
});

// ---------- 底片管線與對照圖（要 ffmpeg） ----------

// 320×240、2 秒的測試片；姿勢每 3 格一筆（肩寬 80、肩 y 60、髖 y 160）
function synthProject({ w = 320, h = 240, dur = 2, fps = 30, face = false } = {}) {
  const dir = tmpDir('belly-synth-'), work = path.join(dir, 'work');
  fs.mkdirSync(work, { recursive: true });
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `testsrc2=size=${w}x${h}:rate=${fps}`, '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
    '-t', String(dur), '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(work, 'rough.mp4')]);
  assert.equal(r.status, 0, String(r.stderr));
  const n = Math.round(dur * fps), samples = Array.from({ length: Math.ceil(n / 3) }, () => sample(pose(w / 2, h / 4, w / 4, h / 2.4)));
  const data = { version: 1, every: 3, frameCount: n, source: { height: h }, samples };
  data.summary = L.poseSummary(data);
  fs.writeFileSync(path.join(work, 'pose-landmarks.json'), JSON.stringify(data));
  if (face) {
    const lm = []; L.POINTS.forEach((id, i) => { lm.push(w / 2 + 30 * Math.cos(i), h / 6 + 30 * Math.sin(i)); });
    const frames = Array.from({ length: n }, () => ({ p: lm, b: [0, 0, 1, 1], n: 1 }));
    fs.writeFileSync(path.join(work, 'face-landmarks.json'), JSON.stringify({ version: 1, frames, summary: { detected: n, black: 0, missing: 0, rate: 1, medianFaceWidth: 60, lookFaceWidth: 60, slimOk: true } }));
  }
  return dir;
}

test('底片：belly 0 和沒有這個功能時逐位元相同；belly 1 只動腰那一段；只開瘦小腹不需要臉部 landmark', { skip: !HAS_FFMPEG && '沒有 ffmpeg' }, async () => {
  const dir = synthProject(), P = L.statePaths(dir);
  const ptrack = L.loadPoseTrack(P.pose);
  // 以前的呼叫法（沒有 belly）和 belly 0（就算給了姿勢）：輸出同一個檔
  const none = L.loadTrack({ frames: [] });
  let r = await L.renderLookFootage({ projectDir: dir, track: none, slim: 0.6 });
  const a = sha256(P.footage);
  assert.equal(r.belly, undefined, 'belly 0：回傳和以前一樣，沒有 belly');
  r = await L.renderLookFootage({ projectDir: dir, track: none, slim: 0.6, belly: 0, poseTrack: ptrack });
  assert.equal(sha256(P.footage), a, 'belly 0 逐位元相同');
  const base = L.grabRgb(P.footage, { at: 1 });
  // belly 1、沒有臉（track 是 null）
  r = await L.renderLookFootage({ projectDir: dir, track: null, slim: 0, belly: 1, poseTrack: ptrack });
  assert.deepEqual([r.width, r.height, r.frames, r.warped, r.belly.warped], [320, 240, 60, 0, 60]);
  assert.ok(Math.abs(r.belly.dispP95Ratio - B.max) < 0.002 && r.belly.maxDisp > 4.5 && r.belly.maxDisp <= B.max * 88 + 0.05, JSON.stringify(r.belly));
  const b = L.grabRgb(P.footage, { at: 1 });
  const diff = (y0, y1, x0 = 0, x1 = 320) => { let s = 0, n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const o = (y * 320 + x) * 3; s += Math.abs(base[o] - b[o]) + Math.abs(base[o + 1] - b[o + 1]) + Math.abs(base[o + 2] - b[o + 2]); n += 3; } return s / n; };
  // 肩 y 60、髖 y 160：腰那一段（y 120–145）變了；肩膀以上、髖以下、左右兩邊外面幾乎不變（只有重新編碼的差）
  assert.ok(diff(120, 145, 100, 220) > 5, `腰那一段平均差 ${diff(120, 145, 100, 220).toFixed(2)}／255`);
  assert.ok(diff(0, 90) < 3 && diff(172, 240) < 3, `肩膀以上 ${diff(0, 90).toFixed(2)}、髖以下 ${diff(172, 240).toFixed(2)}`);
  assert.ok(diff(100, 160, 0, 60) < 3 && diff(100, 160, 262, 320) < 3, '左右兩邊外面不變');
});

test('對照圖：開了瘦小腹多兩欄軀幹的前後；只開瘦小腹不留臉部那一欄；印姿勢偵測率與位移', { skip: !HAS_FFMPEG && '沒有 ffmpeg' }, () => {
  const size = (f) => spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f], { encoding: 'utf8' }).stdout.trim();
  // 只開瘦小腹：原圖｜套用後｜軀幹前｜軀幹後
  let dir = synthProject();
  let r = L.lookPreview({ projectDir: dir, templateDir: TEMPLATE, plan: { look: { belly: 0.5 } } });
  assert.equal(size(r.file), '2050,1210');
  assert.match(r.lines[0], /^講者對照圖：work\/look-preview\.jpg（3 列：頭 0:00\.1、中 0:01\.0、尾 0:01\.9）$/);
  assert.equal(r.lines[1], '  欄：原圖｜套用後（調光 0＋瘦臉 0＋美顏 0＋瘦小腹 0.5）｜軀幹放大：原本｜套用後＋腰線（綠＝估計的腰線、紅＝收進去之後）');
  assert.equal(r.lines[2], '姿勢偵測率：100.00%（20／20 筆，每 3 格一筆；全黑 0 筆不算）；能做瘦小腹的 100.00%');
  assert.match(r.lines[3], /^瘦小腹每格最大位移（全部 60 格）：中位數 2\.\d px、最大 2\.\d px（0:\d\d\.\d），＝腰寬 (2\.9\d|3\.00)%（95% 的格 ≤ (2\.9\d|3\.00)%）$/);   // 位移取自網格，可能比理論值少一點點
  assert.match(r.lines[4], /^姿勢抖動（平滑去掉的量）：0\.00 px（肩寬 0\.00%）$/);
  assert.deepEqual(r.warnings, []);
  // 開太強：⚠
  r = L.lookPreview({ projectDir: dir, templateDir: TEMPLATE, plan: { look: { belly: 1 } } });
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /^⚠ 瘦小腹位移 ＝ 腰寬 (5\.9\d|6\.00)%（95% 的格；> 5%）→ 收太多，手臂和腰旁邊的東西看得出變形；把 belly 調低（plan\.json 的 look\.belly 或剪輯台「講者」）$/);
  assert.deepEqual([L.BELLY_DISP_WARN, L.bellyWarning(0.0499)], [0.05, null]);
  // belly 0：和以前一樣三欄（就算 work/ 裡有姿勢檔）；還沒偵測臉照舊報錯
  assert.throws(() => L.lookPreview({ projectDir: dir, templateDir: TEMPLATE, plan: { look: { slim: 0.6 } } }), /^Error: 還沒偵測臉部 → 先跑 /);
  // 瘦臉＋瘦小腹：五欄
  dir = synthProject({ face: true });
  r = L.lookPreview({ projectDir: dir, templateDir: TEMPLATE, plan: { look: { slim: 0.6, belly: 0.5 } } });
  assert.equal(size(r.file), '2420,1210');
  assert.match(r.lines[1], /＋瘦小腹 0\.5）｜臉部放大＋輪廓（綠＝原本、紅＝套用後）｜軀幹放大：原本｜套用後＋腰線/);
  assert.ok(r.lines.some((l) => l.startsWith('偵測率：100.00%')) && r.lines.some((l) => l.startsWith('姿勢偵測率：100.00%')), r.lines.join('\n'));
  r = L.lookPreview({ projectDir: dir, templateDir: TEMPLATE, plan: { look: { slim: 0.6 } } });
  assert.equal(size(r.file), '1680,1210', 'belly 0：對照圖和以前一樣大');
  assert.ok(!r.lines.some((l) => l.includes('瘦小腹') || l.includes('姿勢')), r.lines.join('\n'));
  // 姿勢略過：印原因、不畫位移
  const P = L.statePaths(dir), data = JSON.parse(fs.readFileSync(P.pose, 'utf8'));
  fs.writeFileSync(P.pose, JSON.stringify({ ...data, summary: { ...data.summary, usable: 0.1, bellyOk: false, reason: 'usable' } }));
  r = L.lookPreview({ projectDir: dir, templateDir: TEMPLATE, plan: { look: { slim: 0.6, belly: 0.5 } } });
  assert.ok(r.lines.includes('瘦小腹略過：能做的格只有 10%（< 80%；髖部在畫面外、側身、彎腰的格不做）'), r.lines.join('\n'));
  assert.match(r.lines[1], /＋瘦小腹 0）/);
});

test('剪輯台的軀幹前後對照（bodyImage）：還沒偵測回原因；有姿勢回 JPEG；這一格不做回原因', { skip: !HAS_FFMPEG && '沒有 ffmpeg' }, () => {
  const dir = synthProject(), P = L.statePaths(dir), cache = {};
  const before = L.bodyImage({ projectDir: dir, t: 1, belly: 0, cache }), after = L.bodyImage({ projectDir: dir, t: 1, belly: 1, cache });
  assert.ok(Buffer.isBuffer(before) && before[0] === 0xff && before[1] === 0xd8 && Buffer.isBuffer(after));
  assert.ok(!before.equals(after), '前後不一樣');
  assert.equal(cache.frames.size, 1, '同一格只抓一次畫面');
  const data = JSON.parse(fs.readFileSync(P.pose, 'utf8'));
  fs.writeFileSync(P.pose, JSON.stringify({ ...data, samples: data.samples.map((s) => ({ ...s, v: [1, 1, 0, 0] })) }));
  assert.deepEqual(L.bodyImage({ projectDir: dir, t: 1, belly: 1, cache }), { error: 'nobody', message: '這一格不做瘦小腹（髖部在畫面外、側身、彎腰，或沒偵測到人）→ 換一格再看' });
  fs.rmSync(P.pose);
  const r = L.bodyImage({ projectDir: dir, t: 1, belly: 1, cache });
  assert.equal(r.error, 'nopose');
  assert.match(r.message, /^還沒偵測姿勢 → 請 AI 跑 node shared\/template\/tools\/look\.mjs run --project /);
});

// ---------- CLI ----------

async function cli(args) {
  const lines = [];
  const code = await CLI.main(args, { out: (l) => lines.push(l), cwd: WORKSPACE });
  return { code, lines };
}

test('CLI：status 的設定與姿勢 landmark 那一行、clear 連姿勢檔一起刪、belly 0 的 status 沒有姿勢那一行', async () => {
  const d = fakeProject(), P = L.statePaths(d);
  fs.writeFileSync(path.join(d, 'work', 'hyperframes', 'plan.json'), JSON.stringify({ look: { belly: 0.5 } }));
  let r = await cli(['status', '--project', d]);
  assert.equal(r.lines[1], '設定：調光 關、瘦臉 關、美顏 關、瘦小腹 0.5（來源：plan.json 的 look）');
  assert.ok(r.lines.includes('資產：✓ shared/template/vendor/mediapipe（5 個檔，sha256 都對）'), r.lines.join('\n'));
  assert.ok(r.lines.includes('臉部 landmark：— 不用（只開瘦小腹，不偵測臉）') && r.lines.includes('姿勢 landmark：— 還沒跑') && r.lines.includes('瘦臉底片：— 還沒做'), r.lines.join('\n'));
  setState(d, { footage: { belly: 0.5 } });
  r = await cli(['status', '--project', d]);
  assert.ok(r.lines.includes('姿勢 landmark：✓ 最新（100/100 筆，100.00%；能做瘦小腹的 98.00%；肩寬中位數 320 px）'), r.lines.join('\n'));
  assert.ok(r.lines.includes('瘦臉底片：✓ 最新（work/rough-look.mp4，瘦臉 0、美顏 0、瘦小腹 0.5，640×360）') && r.lines.includes('build 會用：work/rough-look.mp4'), r.lines.join('\n'));
  setState(d, { pose: { ...POSE_OK, usable: 0.03, bellyOk: false, reason: 'usable' } });
  fs.rmSync(P.footage);
  r = await cli(['status', '--project', d]);
  assert.ok(r.lines.includes('姿勢 landmark：⚠ 略過瘦小腹：能做的格只有 3%（< 80%；髖部在畫面外、側身、彎腰的格不做）'), r.lines.join('\n'));
  r = await cli(['clear', '--project', d]);
  assert.match(r.lines[0], /^已刪除：work\/pose-landmarks\.json、work\/\.look\/（/);
  assert.ok(!fs.existsSync(P.pose));
  // belly 0：資產只看 4 個檔、沒有姿勢那一行
  fs.writeFileSync(path.join(d, 'work', 'hyperframes', 'plan.json'), JSON.stringify({ look: { slim: 0.6 } }));
  r = await cli(['status', '--project', d]);
  assert.equal(r.lines[1], '設定：調光 關、瘦臉 0.6、美顏 關、瘦小腹 關（來源：plan.json 的 look）');
  assert.ok(r.lines.includes('資產：✓ shared/template/vendor/mediapipe（4 個檔，sha256 都對）') && !r.lines.some((l) => l.startsWith('姿勢 landmark')), r.lines.join('\n'));
});

// 少了姿勢模型的模板（其他檔都連回真的模板）
function templateWithoutPoseModel() {
  const t = tmpDir('belly-tpl-');
  for (const f of fs.readdirSync(TEMPLATE)) if (f !== 'vendor') fs.symlinkSync(path.join(TEMPLATE, f), path.join(t, f));
  const v = path.join(t, 'vendor', 'mediapipe'), real = path.join(TEMPLATE, 'vendor', 'mediapipe');
  fs.mkdirSync(v, { recursive: true });
  for (const f of fs.readdirSync(real)) if (f !== L.POSE_MODEL) fs.symlinkSync(path.join(real, f), path.join(v, f));
  return t;
}

test('少姿勢模型：belly 0 完全不受影響；belly > 0 跑 run ✖ 並印怎麼補（不自己下載）；ensure 列出缺的檔', { skip: !HAS_FFMPEG && '沒有 ffmpeg' }, async () => {
  const tpl = templateWithoutPoseModel(), v = path.join(tpl, 'vendor', 'mediapipe');
  assert.equal(L.assetsStatus(v, { sha: true }).ok, true, '沒開瘦小腹：4 個檔都對就能跑');
  assert.deepEqual(L.assetsStatus(v, { pose: true }).missing, [L.POSE_MODEL]);
  const dir = synthProject();
  // belly 0：build 的判斷和有模型時一樣（這裡是「沒跑過、能跑」）
  assert.throws(() => L.ensureLook({ projectDir: dir, plan: { look: { slim: 0.6 } }, templateDir: tpl, probe: { chrome: true } }), /瘦臉底片不是最新的（/);
  // belly > 0：build 略過並說怎麼補
  const e = L.ensureLook({ projectDir: dir, plan: { look: { belly: 0.5 } }, templateDir: tpl, probe: { chrome: true } });
  assert.equal(e.report[1], '⚠ 講者瘦小腹略過：找不到 shared/template/vendor/mediapipe/pose_landmarker_lite.task，只調光 → node shared/template/tools/look.mjs ensure');
  // run：✖，沒有下載、沒有產生任何檔
  fs.mkdirSync(path.join(dir, 'work', 'hyperframes'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'work', 'hyperframes', 'plan.json'), JSON.stringify({ look: { belly: 0.5 } }));
  fs.rmSync(L.statePaths(dir).pose);
  const r = await cli(['run', '--project', dir, '--template', tpl]);
  assert.equal(r.code, 1, r.lines.join('\n'));
  assert.ok(r.lines.includes('✖ shared/template/vendor/mediapipe/pose_landmarker_lite.task 不存在 → node shared/template/tools/look.mjs ensure --download（或 git checkout -- shared/template/vendor/mediapipe）'), r.lines.join('\n'));
  assert.ok(!fs.existsSync(path.join(v, L.POSE_MODEL)) && !fs.existsSync(L.statePaths(dir).pose) && !fs.existsSync(L.statePaths(dir).footage));
  const en = await cli(['ensure', '--template', tpl]);
  assert.equal(en.code, 1);
  assert.ok(en.lines.some((l) => /✖ pose_landmarker_lite\.task\s+不存在/.test(l)) && /^→ 加 --download 從固定網址下載缺的檔（約 5\.8 MB）/.test(en.lines.at(-1)), en.lines.join('\n'));
});

// ---------- 真的偵測（要 Chrome 與示範口播） ----------

const REAL = (!HAS_CHROME && '沒有 HyperFrames 的 Chrome') || (!fs.existsSync(DEMO) && '沒有示範口播') || (!HAS_FFMPEG && '沒有 ffmpeg');

test('偵測：示範口播前 3 秒，姿勢每 3 格一筆、肩寬 70–95 px、四點都看得到；同一趟的臉部結果和不偵測姿勢時一模一樣', { skip: REAL, timeout: 180000 }, async () => {
  const { openDetector, detectLandmarks } = await imp('lib/landmarks.mjs');
  const clip = path.join(tmpDir(), 'clip.mp4'), vendorDir = path.join(TEMPLATE, 'vendor', 'mediapipe');
  assert.equal(spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', DEMO, '-t', '3', '-c', 'copy', clip]).status, 0);
  let det = await openDetector({ vendorDir });
  let plain;
  try { plain = await detectLandmarks({ video: clip, detector: det }); } finally { await det.close(); }
  assert.equal(plain.poses, null, '沒要姿勢就不回 poses');
  det = await openDetector({ vendorDir, pose: true });
  let both, only;
  try {
    both = await detectLandmarks({ video: clip, detector: det, pose: true });
    only = await detectLandmarks({ video: clip, detector: det, face: false, pose: true });
  } finally { await det.close(); }
  assert.deepEqual(both.frames, plain.frames, '臉部 landmark 不受姿勢偵測影響');
  assert.equal(only.frames, null);
  assert.deepEqual(only.poses, both.poses, '只跑姿勢和一起跑的結果一樣');
  assert.equal(both.poses.length, Math.ceil(both.frameCount / L.POSE_EVERY));
  const ok = both.poses.filter((s) => s && typeof s === 'object');
  assert.ok(ok.length / both.poses.length >= 0.95, `姿勢偵測率 ${ok.length}/${both.poses.length}`);
  assert.deepEqual([ok[0].p.length, ok[0].v.length], [8, 4]);
  const sws = ok.map((s) => L.bellyGeom(s.p).sw).sort((a, b) => a - b), med = sws[sws.length >> 1];
  assert.ok(med > 70 && med < 95, `肩寬中位數 ${med.toFixed(1)} px`);
  assert.ok(ok.every((s) => Math.min(...s.v) >= 0.9), '示範口播（坐在桌子後面）四點的可見度都 ≥ 0.9');
  const s = L.poseSummary({ every: 3, frameCount: both.frameCount, source: { height: both.video.height }, samples: both.poses });
  assert.deepEqual([s.bellyOk, s.usable], [true, 1]);
});

test('偵測：示範口播裁成半身（畫面下緣在胸口）→ 髖在畫面外，整支不做', { skip: REAL, timeout: 180000 }, async () => {
  const { openDetector, detectLandmarks } = await imp('lib/landmarks.mjs');
  const clip = path.join(tmpDir(), 'half.mp4');
  assert.equal(spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', DEMO, '-t', '3', '-an', '-vf', 'crop=400:226:136:24', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '14', clip]).status, 0);
  const det = await openDetector({ vendorDir: path.join(TEMPLATE, 'vendor', 'mediapipe'), pose: true });
  let r;
  try { r = await detectLandmarks({ video: clip, detector: det, face: false, pose: true }); } finally { await det.close(); }
  const s = L.poseSummary({ every: 3, frameCount: r.frameCount, source: { height: r.video.height }, samples: r.poses });
  assert.ok(s.rate >= 0.95, `偵測得到人：${s.rate}`);
  assert.deepEqual([s.usable, s.bellyOk, s.reason], [0, false, 'usable'], JSON.stringify(s));
});
