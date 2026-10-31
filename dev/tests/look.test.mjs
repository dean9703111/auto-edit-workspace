// 講者調光＋瘦臉（006 look）：設定、LUT、變形、軌跡、快取與 ensureLook 判斷表、底片管線、對照圖、CLI、偵測、資產
// 契約：specs/contracts/look.md、specs/contracts/cli-006.md；沒有 ffmpeg／Chrome／示範口播時相關測試略過
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { TEMPLATE, WORKSPACE, imp } from './helpers.mjs';

const L = await imp('lib/look.mjs');
const FF = await imp('lib/ff.mjs');
const { CANVAS } = await imp('lib/canvas.mjs');
const CLI = await imp('look.mjs');
const { chromeCandidates } = await imp('lib/audit-browser.mjs');

const HAS_FFMPEG = !spawnSync('ffmpeg', ['-version']).error;
const HAS_CHROME = chromeCandidates().length > 0;
const DEMO = path.join(WORKSPACE, 'projects', '範例', '素材', '真人錄影', '示範口播.mp4');
const tmpDir = (p = 'look-') => fs.mkdtempSync(path.join(os.tmpdir(), p));
const OK_PROBE = { assets: { ok: true, missing: [], bad: [] }, chrome: true };
const sha256 = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

// 固定測試臉（plan.md §5.1）：lm_12.json 的 58 點，以點 1 與 168 的中點為原點、臉寬 200 px
const FACE58 = [[1.5,62.1],[1.3,30.7],[0.7,21.6],[-0.9,-18.3],[-4.2,-97.9],[1.7,72],[2.6,90.5],[2.8,108.1],[3.9,110.2],[-91.7,-51.4],
  [-56.7,-21.4],[-84.4,-68.1],[-80.2,73.3],[-27.8,80.2],[-52.3,-91.2],[-79.7,-44.4],[-93.5,27.4],[-72,-81.7],[-60.1,-61.7],[-30.4,-95.9],
  [-97.1,-13],[-88.7,49.5],[-24.4,-20],[-58.3,103.8],[-11.6,135],[-35.6,122.1],[-45.9,114.5],[5.7,136.5],[-95.7,-33.8],[-1.3,-30.7],
  [-69.3,91.4],[5.3,131.5],[-24.7,129.2],[4.7,124.2],[4.3,116.4],[-95.7,6.8],[92.7,-60.1],[57.5,-26.9],[82.5,-76.2],[93.1,65.8],
  [35.1,79.7],[45.4,-95.9],[77.9,-51.1],[103.7,19],[67.4,-88.6],[54.8,-66.6],[22.4,-98.6],[103.1,-22],[100.5,41.5],[25.6,-21.7],
  [72.1,98.8],[23.8,134.2],[49.2,119.8],[59.7,111],[99.2,-43],[82.8,85.1],[37.7,127.8],[104.1,-1.9]];
const face = (cx, cy, k = 1) => { const lm = []; L.POINTS.forEach((id, i) => { lm[id] = [cx + FACE58[i][0] * k, cy + FACE58[i][1] * k]; }); return lm; };
const faceP = (cx, cy, k = 1) => FACE58.flatMap(([x, y]) => [Math.round((cx + x * k) * 10) / 10, Math.round((cy + y * k) * 10) / 10]);
// 網格上雙線性取位移（和 warpPlane 一樣的取法）
const dAt = (F, X, Y) => {
  const fx = (X - F.x0) / F.step, fy = (Y - F.y0) / F.step, gx = Math.floor(fx), gy = Math.floor(fy), tx = fx - gx, ty = fy - gy;
  const g = (i, j, c) => F.G[((gy + j) * F.gw + gx + i) * 2 + c];
  return [0, 1].map((c) => (g(0, 0, c) * (1 - tx) + g(1, 0, c) * tx) * (1 - ty) + (g(0, 1, c) * (1 - tx) + g(1, 1, c) * tx) * ty);
};

// ---------- 設定 ----------

test('設定：kit/look.json 預設、validateLook 每則訊息、resolveLook 三種來源', () => {
  const k = L.readKitLook(TEMPLATE);
  assert.deepEqual([k.color, k.slim, k.lut], [0.8, 0.6, 'look/jianying-smart.cube']);
  assert.deepEqual(L.validateLook(undefined), []);
  assert.deepEqual(L.validateLook(false), []);
  assert.deepEqual(L.validateLook({ color: 0.5, slim: 1.2 }), []);
  for (const bad of [null, true, 'x', [1]]) assert.deepEqual(L.validateLook(bad), ['plan.json 的 look 要是物件或 false → 例如 "look": { "color": 0.8, "slim": 0.6 }；要用預設就把 look 整個拿掉']);
  assert.deepEqual(L.validateLook({ x: 1 }), ['look 不能有「x」→ 只能寫 color、slim']);
  assert.deepEqual(L.validateLook({ color: 1.5 }), ['look.color 要是 0–1 的數字（0＝不調光），現在是 1.5']);
  assert.deepEqual(L.validateLook({ slim: 2 }), ['look.slim 要是 0–1.2 的數字（0＝不瘦臉；超過 1.2 脖子與領口會被拉彎），現在是 2']);
  assert.equal(L.resolveLook({ plan: {}, templateDir: TEMPLATE }).source, 'kit');
  const off = L.resolveLook({ plan: { look: false }, templateDir: TEMPLATE });
  assert.deepEqual([off.color, off.slim, off.source], [0, 0, 'off']);
  const p = L.resolveLook({ plan: { look: { color: 0.456 } }, templateDir: TEMPLATE });
  assert.deepEqual([p.color, p.slim, p.source], [0.46, 0.6, 'plan']);
  const t = tmpDir();
  fs.mkdirSync(path.join(t, 'kit'));
  fs.writeFileSync(path.join(t, 'kit', 'look.json'), '{ "color": 0.8, "slim": 0.6, "lut": "x.cube", "eyes": 1 }');
  assert.throws(() => L.readKitLook(t), /kit\/look\.json 不能有「eyes」→ 只能寫 color、slim、lut/);
});

// ---------- LUT ----------

test('LUT：jianying-smart.cube 原檔、混合 m＝0／1／1.25、cubeText 來回一致', () => {
  const f = path.join(TEMPLATE, 'kit', 'look', 'jianying-smart.cube');
  assert.equal(sha256(f), '56969a5a84ace8157a8669044f32a23c99c53284477464dab7292a81198d2b6f');
  assert.equal(fs.statSync(f).size, 132760);
  const c = L.parseCube(fs.readFileSync(f, 'utf8'));
  assert.equal(c.size, 17);
  const id = L.blendCube(c, 0);
  for (const i of [0, 3 * 100, 3 * (17 ** 3 - 1)]) {
    const n = i / 3, r = n % 17, g = Math.floor(n / 17) % 17, b = Math.floor(n / 289);
    assert.deepEqual([...id.data.slice(i, i + 3)].map((v) => +v.toFixed(5)), [r / 16, g / 16, b / 16].map((v) => +v.toFixed(5)));
  }
  assert.deepEqual([...L.blendCube(c, 1).data], [...c.data]);
  const hi = L.blendCube(c, 1.25);
  assert.ok([...hi.data].every((v) => v >= 0 && v <= 1));
  const back = L.parseCube(L.cubeText(c));
  assert.ok(back.data.every((v, i) => Math.abs(v - c.data[i]) < 1e-6));
  assert.throws(() => L.parseCube('LUT_3D_SIZE 2\n0 0 0\n'), /格點數不對/);
});

test('filterPath：冒號跳脫、單引號包起來、怪字元擋下；encodeFootage 的 -vf 順序', () => {
  assert.equal(FF.filterPath('/a b/中文/x:y.cube'), "'/a b/中文/x\\:y.cube'");
  assert.equal(FF.lut3dFilter('/tmp/x.cube'), "lut3d=file='/tmp/x.cube':interp=tetrahedral");
  assert.throws(() => FF.filterPath("/tmp/it's.cube"), /ffmpeg 濾鏡讀不了/);
  assert.throws(() => FF.filterPath('/tmp/a,b.cube'), /ffmpeg 濾鏡讀不了/);
});

test('LUT 實跑：含冒號、空白、中文的資料夾；灰 128 經過混合 LUT 和 Node 算的一致', { skip: !HAS_FFMPEG && '沒有 ffmpeg' }, () => {
  const t = tmpDir(), dir = path.join(t, '專 案:1');
  fs.mkdirSync(path.join(dir, 'work'), { recursive: true });
  const lut = L.ensureBlendedLut({ projectDir: dir, lutFile: path.join(TEMPLATE, 'kit', 'look', 'jianying-smart.cube'), color: 0.5 });
  assert.match(path.basename(lut), /^lut-0\.50-56969a5a\.cube$/);
  const src = path.join(t, 'gray.mp4'), dst = path.join(dir, 'out.mp4');
  assert.equal(spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x808080:s=64x64:r=30:d=1', '-c:v', 'libx264', '-pix_fmt', 'yuv444p', '-qp', '0', src]).status, 0);
  FF.encodeFootage(src, dst, { lut });
  const px = L.grabRgb(dst, { at: 0.5 });
  const m = L.parseCube(fs.readFileSync(lut, 'utf8'));
  // 灰軸上四面體內插＝對角線兩個格點的線性內插
  const v = 128 / 255, f = v * 16, i0 = Math.floor(f), w = f - i0;
  const at = (i) => (i + 17 * i + 289 * i) * 3;
  const want = [0, 1, 2].map((c) => Math.round(255 * (m.data[at(i0) + c] * (1 - w) + m.data[at(i0 + 1) + c] * w)));
  const got = [px[(32 * 64 + 32) * 3], px[(32 * 64 + 32) * 3 + 1], px[(32 * 64 + 32) * 3 + 2]];
  for (let c = 0; c < 3; c++) assert.ok(Math.abs(got[c] - want[c]) <= 4, `通道 ${c}：ffmpeg ${got[c]}，Node ${want[c]}`);
  assert.ok(got[0] > 128, '調光後灰色要變亮');
});

// ---------- 變形 ----------

test('變形：FACE58 的位移方向與大小、固定點不動、強度單調、s＝0 不變、ROI 外不變', () => {
  const lm = face(480, 300), W = 960, H = 640;
  assert.equal(Math.round(L.faceWidth(lm)), 200);
  const F = L.field(lm, 0.6, W, H);
  assert.ok(Math.abs(L.maxDisp(F) / F.fw - 0.0273) < 0.0005, `最大位移 ${(L.maxDisp(F) / F.fw * 100).toFixed(3)}%（原型 2.73%）`);
  const cp = L.controlPoints(lm, 0.6), dst = cp.moved.get(172);
  const D = dAt(F, dst[0], dst[1]);
  assert.ok(D[0] < 0 && D[1] > 0, `點 172 的反向位移 ${D}`);
  const want = Math.hypot(lm[172][0] - dst[0], lm[172][1] - dst[1]);
  assert.ok(Math.abs(Math.hypot(...D) - want) / want < 0.05, `|D| ${Math.hypot(...D).toFixed(2)} vs ${want.toFixed(2)}`);
  for (const i of [33, 263, 168]) assert.ok(Math.hypot(...dAt(F, lm[i][0], lm[i][1])) < 0.05, `固定點 ${i}`);
  const m = [0.3, 0.6, 0.9, 1.2].map((s) => L.maxDisp(L.field(lm, s, W, H)));
  assert.ok(m.every((v, i) => i === 0 || v > m[i - 1]), `單調：${m}`);
  const ratio = m[3] / m[1];
  assert.ok(ratio >= 2.0 && ratio <= 2.4, `s 1.2 ÷ s 0.6 ＝ ${ratio.toFixed(2)}`);
  const img = Buffer.alloc(W * H * 3);
  for (let i = 0; i < img.length; i++) img[i] = (i * 2654435761) >>> 24;
  const z = Buffer.from(img);
  L.warpPlane(z, { w: W, h: H, ch: 3 }, L.field(lm, 0, W, H), 1);
  assert.ok(z.equals(img), 's＝0 要逐位元組相同');
  const out = Buffer.from(img);
  L.warpPlane(out, { w: W, h: H, ch: 3 }, F, 1);
  let inside = 0, outside = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 3, diff = out[o] !== img[o] || out[o + 1] !== img[o + 1] || out[o + 2] !== img[o + 2];
    const inRoi = x >= F.x0 && x < F.x1 && y >= F.y0 && y < F.y1;
    if (diff && inRoi) inside++;
    if (diff && !inRoi) outside++;
  }
  assert.equal(outside, 0, 'ROI 外不能動');
  assert.ok(inside > 1000, `ROI 裡要有變（${inside} 個像素）`);
});

test('變形：直線往中軸移動的量；YUV 的 U／V 平面位移是 Y 的一半', () => {
  const W = 512, H = 512, lm = face(256, 230);
  const F = L.field(lm, 0.6, W, H);
  // Y：垂直條紋 v＝x（水平漸層），變形後的值差＝取樣位置的 x 位移
  const Y = Buffer.alloc(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) Y[y * W + x] = Math.min(255, x >> 1);
  const Y0 = Buffer.from(Y);
  L.warpPlane(Y, { w: W, h: H, ch: 1 }, F, 1);
  const p = lm[172], yy = Math.round(p[1]), xx = Math.round(p[0]);
  const shiftY = 2 * (Y[yy * W + xx] - Y0[yy * W + xx]);
  assert.ok(Math.abs(shiftY - dAt(F, xx, yy)[0]) <= 2.1, `Y 位移 ${shiftY} vs 場 ${dAt(F, xx, yy)[0].toFixed(2)}（8-bit 量化 ±2 px）`);
  // U：半解析度、v＝x；平面上 (x, y) 對到全解析度 (2x＋0.5, 2y＋0.5)，位移乘 0.5
  const w2 = W / 2, h2 = H / 2, U = Buffer.alloc(w2 * h2);
  for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) U[y * w2 + x] = x;
  const U0 = Buffer.from(U);
  L.warpPlane(U, { w: w2, h: h2, ch: 1 }, F, 0.5);
  let n = 0, worst = 0;
  for (let y = Math.ceil(F.y0 / 2) + 6; y < F.y1 / 2 - 6; y += 3) for (let x = Math.ceil(F.x0 / 2) + 6; x < F.x1 / 2 - 6; x += 3) {
    const want = 0.5 * dAt(F, 2 * x + 0.5, 2 * y + 0.5)[0], got = U[y * w2 + x] - U0[y * w2 + x];
    worst = Math.max(worst, Math.abs(got - want)); n++;
  }
  assert.ok(n > 50 && worst <= 0.6, `U 平面 ${n} 點，最大誤差 ${worst.toFixed(2)} px（8-bit 量化）`);
});

// ---------- 軌跡 ----------

test('軌跡：rampWeights 5 格過渡、平滑（常數不變、尖刺壓低、不跨過 null）、--every 2 內插、yaw', () => {
  const w = [...L.rampWeights([1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1], 5)].map((v) => +v.toFixed(2));
  assert.deepEqual(w, [1, 1, 0.8, 0.6, 0.4, 0.2, 0, 0.2, 0.4, 0.6, 0.8, 1, 1]);
  assert.deepEqual([...L.rampWeights([1, 1, 0.5, 1, 1, 1, 1, 1], 5)].map((v) => +v.toFixed(2)), [0.7, 0.6, 0.5, 0.6, 0.7, 0.8, 0.9, 1]);
  const c = Float32Array.from([5, 7]);
  const sm = L.smoothTrack([c, c, c, c, c]);
  assert.ok(sm.every((f) => Math.abs(f[0] - 5) < 1e-4 && Math.abs(f[1] - 7) < 1e-4));
  const spike = [0, 0, 0, 10, 0, 0, 0].map((v) => Float32Array.from([v, 0]));
  assert.ok(L.smoothTrack(spike)[3][0] <= 4, '單格尖刺要壓到 ≤ 40 %');
  const seg = L.smoothTrack([Float32Array.from([0, 0]), Float32Array.from([0, 0]), null, Float32Array.from([10, 0]), Float32Array.from([10, 0])]);
  assert.equal(seg[1][0], 0); assert.equal(seg[2], null); assert.equal(seg[3][0], 10);
  const a = { p: [0, 0], b: [0, 0, 2, 2], n: 1 }, b = { p: [2, 4], b: [2, 2, 4, 4], n: 1 };
  assert.deepEqual(L.interpolateEvery2([a, undefined, b, undefined, null]), [a, { p: [1, 2], b: [1, 1, 3, 3], n: 1, i: 1 }, b, null, null]);
  assert.equal(L.interpolateEvery2([a, undefined, b], [false, true, false])[1], 0);
  assert.ok(Math.abs(L.yawOf(face(0, 0))) < 0.1, 'FACE58 正臉');
  const side = face(0, 0); for (const i of L.POINTS) if (side[i][0] > 1.5) side[i] = [1.5 + (side[i][0] - 1.5) * 0.3, side[i][1]];
  assert.ok(L.yawOf(side) > 0.35, `右半邊壓扁 → yaw ${L.yawOf(side).toFixed(2)}`);
});

test('loadTrack：臉太小權重 0、側臉減半、沒偵測到的格前後淡出', () => {
  const big = { p: faceP(500, 400), b: [0, 0, 1, 1], n: 1 }, small = { p: faceP(500, 400, 0.2), b: [0, 0, 1, 1], n: 1 };
  const frames = [big, big, big, big, big, big, null, big, big, big, big, big, null, small];
  const t = L.loadTrack({ frames });
  assert.equal(t.n, 14);
  assert.equal(t.weight(6), 0);
  assert.ok(Math.abs(t.weight(4) - 0.4) < 1e-6);
  assert.equal(t.raw[13], 0);
  assert.equal(t.lm(6), null);
  assert.ok(Math.abs(L.faceWidth(t.lm(0, 0.5)) - 100) < 1);
});

// ---------- 快取與 ensureLook 判斷表 ----------

function fakeProject({ plan = null } = {}) {
  const dir = tmpDir('look-proj-'), work = path.join(dir, 'work');
  fs.mkdirSync(path.join(work, 'hyperframes'), { recursive: true });
  fs.writeFileSync(path.join(work, 'rough.mp4'), 'rough');
  if (plan) fs.writeFileSync(path.join(work, 'hyperframes', 'plan.json'), JSON.stringify(plan));
  return dir;
}
function freshState(dir, { slim = 0.6, summary = { rate: 0.9998, medianFaceWidth: 172, lookFaceWidth: 172, slimOk: true }, footage = true } = {}) {
  const P = L.statePaths(dir);
  fs.writeFileSync(P.landmarks, '{}');
  const lm = { ...L.statOf(P.landmarks), rough: L.statOf(P.rough), modelSha256: L.modelSha(TEMPLATE), lmVer: L.LM_VER, every: 1, summary };
  const st = { landmarks: lm };
  if (footage) {
    fs.writeFileSync(P.footage, 'look');
    st.footage = { ...L.statOf(P.footage), rough: L.statOf(P.rough), landmarks: L.statOf(P.landmarks), slim, lookVer: L.LOOK_VER, width: 640, height: 360 };
  }
  L.writeState(dir, st);
  return P;
}

test('ensureLook 判斷表：七列 × strict、key 與 report 原文、lookCheck、lookNeedsRun', () => {
  const run = (dir, plan, strict, probe = OK_PROBE) => L.ensureLook({ projectDir: dir, plan, templateDir: TEMPLATE, strict, probe });
  // 1：全關
  let d = fakeProject();
  let r = run(d, { look: false }, true);
  assert.deepEqual([r.lut, r.key, r.report], [null, null, ['講者調光：關（plan.json 的 look）', '講者瘦臉：關（plan.json 的 look）']]);
  assert.equal(r.footage, path.join(d, 'work', 'rough.mp4'));
  // 2：只調光
  r = run(d, { look: { slim: 0 } }, true);
  assert.deepEqual(r.key, { v: 1, color: 0.8, lut: '56969a5a84ac', slim: 0, footage: 'rough.mp4' });
  assert.equal(path.basename(r.lut), 'lut-0.80-56969a5a.cube');
  assert.deepEqual(r.report, ['講者調光：0.8（kit/look/jianying-smart.cube，build 重新編碼底片時 bake）', '講者瘦臉：關（plan.json 的 look）']);
  // 7：沒跑過、能跑 → strict 丟錯、非 strict ⚠
  // 指令放在 → 後面、行尾（C-02）；rough.mp4 是假檔時不預估
  assert.throws(() => run(d, {}, true), /^Error: 瘦臉底片不是最新的（還沒跑過；不要瘦臉就在 plan\.json 寫 "look": \{ "slim": 0 \}）→ 先跑 node shared\/template\/tools\/look\.mjs run --project \S+$/);
  r = run(d, {}, false);
  assert.match(r.report[1], /^⚠ 瘦臉還沒套到底片（還沒跑過），這次先用 work\/rough\.mp4 → node shared\/template\/tools\/look\.mjs run --project /);
  assert.equal(r.key.slim, 0);
  assert.equal(L.lookNeedsRun({ projectDir: d, plan: {}, templateDir: TEMPLATE, probe: OK_PROBE }), true);
  const lc = L.lookCheck({ projectDir: d, plan: { look: { slim: 0.6, x: 1 } }, templateDir: TEMPLATE, probe: OK_PROBE });
  assert.deepEqual(lc.errors, ['look 不能有「x」→ 只能寫 color、slim']);
  assert.match(lc.warnings[0], /^build 會停下來：瘦臉底片不是最新的/);
  // 6：不能跑
  r = run(d, {}, true, { assets: { ok: false, missing: ['face_landmarker.task'], bad: [] }, chrome: true });
  assert.equal(r.report[1], '⚠ 講者瘦臉略過：找不到 shared/template/vendor/mediapipe/face_landmarker.task，只調光 → node shared/template/tools/look.mjs ensure');
  r = run(d, {}, true, { ...OK_PROBE, chrome: false });
  assert.equal(r.report[1], '⚠ 講者瘦臉略過：找不到 HyperFrames 的 Chrome，只調光 → npx hyperframes browser ensure');
  assert.equal(L.lookNeedsRun({ projectDir: d, plan: {}, templateDir: TEMPLATE, probe: { ...OK_PROBE, chrome: false } }), false);
  // 5：最新
  d = fakeProject();
  freshState(d);
  r = run(d, {}, true);
  assert.equal(r.footage, path.join(d, 'work', 'rough-look.mp4'));
  assert.deepEqual(r.key, { v: 1, color: 0.8, lut: '56969a5a84ac', slim: 0.6, footage: 'rough-look.mp4' });
  assert.equal(r.report[1], '講者瘦臉：0.6（work/rough-look.mp4；偵測率 99.98%、臉寬中位數 172 px）');
  assert.equal(L.lookNeedsRun({ projectDir: d, plan: {}, templateDir: TEMPLATE, probe: OK_PROBE }), false);
  // 強度改了 → 過期原因
  assert.throws(() => run(d, { look: { slim: 0.8 } }, true), /瘦臉底片不是最新的（瘦臉強度 0\.6 → 0\.8；/);
  // rough.mp4 換過
  fs.writeFileSync(path.join(d, 'work', 'rough.mp4'), 'rough v2');
  assert.throws(() => run(d, {}, true), /rough\.mp4 換過（剪乾淨重做了）/);
  // 4：landmark 最新但臉太小
  d = fakeProject();
  freshState(d, { summary: { rate: 1, medianFaceWidth: 43.1, lookFaceWidth: 43.1, slimOk: false, reason: 'small' }, footage: false });
  r = run(d, {}, true);
  assert.equal(r.report[1], '⚠ 講者瘦臉略過：臉寬中位數 43 px < 60 px（畫面太小，瘦臉效果不到 1 px），只調光');
  assert.equal(r.key.slim, 0);
  assert.deepEqual(L.lookCheck({ projectDir: d, plan: {}, templateDir: TEMPLATE, probe: OK_PROBE }).warnings, ['講者瘦臉略過：臉寬中位數 43 px < 60 px（畫面太小，瘦臉效果不到 1 px），只調光']);
  // 3：還在跑
  L.writeState(d, { run: { pid: process.pid, phase: 'detect' } });
  assert.throws(() => run(d, {}, true), /^Error: 瘦臉還在跑（pid \d+；status 顯示「完成」再 build）→ node shared\/template\/tools\/look\.mjs status --project \S+$/);
  assert.match(run(d, {}, false).report[1], /^⚠ 講者瘦臉還在跑/);
  // 設定錯 → strict 丟 validateLook 的訊息
  assert.throws(() => run(d, { look: { color: 3 } }, true), /look\.color 要是 0–1 的數字/);
});

test('快取：landmark／底片「最新」的條件、estimateMinutes、lookSize', () => {
  const d = fakeProject(), P = freshState(d), mSha = L.modelSha(TEMPLATE);
  let st = L.readState(d);
  assert.equal(L.landmarksFresh(st, P, mSha), true);
  assert.equal(L.footageFresh(st, P, mSha, 0.6), true);
  assert.equal(L.footageFresh(st, P, mSha, 0.7), false);
  assert.equal(L.landmarksFresh(st, P, 'other'), false);
  fs.writeFileSync(P.footage, 'changed!!');
  st = L.readState(d);
  assert.equal(L.footageFresh(st, P, mSha, 0.6), false);
  assert.equal(L.staleReason(st, P, mSha, 0.6), 'work/rough-look.mp4 不見了或被改過');
  assert.deepEqual(L.lookSize(3840, 2160), { w: 2560, h: 1440, scaled: true });
  assert.deepEqual(L.lookSize(640, 360), { w: 640, h: 360, scaled: false });
  assert.equal(L.estimateMinutes({ frames: 18000, width: 3840, height: 2160 }), Math.ceil((18000 * (26 + 14.5 * (2560 * 1440) / (1920 * 1080))) / 60000));
});

// ---------- 底片管線與對照圖（要 ffmpeg） ----------

function synthProject({ w = 320, h = 240, dur = 2, fps = 30, landmarks = true, nullEvery = 0 } = {}) {
  const dir = tmpDir('look-synth-'), work = path.join(dir, 'work');
  fs.mkdirSync(work, { recursive: true });
  const rough = path.join(work, 'rough.mp4');
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `testsrc2=size=${w}x${h}:rate=${fps}`, '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
    '-t', String(dur), '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', rough]);
  assert.equal(r.status, 0, String(r.stderr));
  if (landmarks) {
    const n = Math.round(dur * fps), k = Math.min(w, h) / 480;
    const frames = Array.from({ length: n }, (_, i) => (nullEvery && i % nullEvery === 0 ? null : { p: faceP(w / 2, h / 2, k), b: [0, 0, 1, 1], n: 1 }));
    const det = frames.filter(Boolean).length;
    const data = { version: 1, frames, summary: { detected: det, black: 0, missing: n - det, rate: det / n, medianFaceWidth: 200 * k, lookFaceWidth: 200 * k, slimOk: true } };
    fs.writeFileSync(path.join(work, 'face-landmarks.json'), JSON.stringify(data));
  }
  return dir;
}

test('底片管線：解析度、格數、音軌 copy、長度；ROI 外和來源幾乎一樣', { skip: !HAS_FFMPEG && '沒有 ffmpeg' }, async () => {
  const dir = synthProject();
  const P = L.statePaths(dir);
  const track = L.loadTrack(P.landmarks);
  const r = await L.renderLookFootage({ projectDir: dir, track, slim: 0.6 });
  assert.deepEqual([r.width, r.height, r.frames, r.scaled], [320, 240, 60, false]);
  assert.ok(r.warped === 60 && r.maxDisp > 0);
  assert.ok(r.diff <= 1 / 30 + 0.05);
  const pr = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name', '-of', 'csv=p=0', P.footage], { encoding: 'utf8' }).stdout.trim().split('\n');
  assert.deepEqual(pr.sort(), ['aac,audio', 'h264,video']);
  const a = L.grabRgb(P.rough, { at: 1 }), b = L.grabRgb(P.footage, { at: 1 });
  const F = L.field(track.lm(30), 0.6, 320, 240);
  let sum = 0, n = 0;
  for (let y = 0; y < 240; y += 4) for (let x = 0; x < 320; x += 4) {
    if (x >= F.x0 - 8 && x < F.x1 + 8 && y >= F.y0 - 8 && y < F.y1 + 8) continue;
    const o = (y * 320 + x) * 3; sum += Math.abs(a[o] - b[o]) + Math.abs(a[o + 1] - b[o + 1]) + Math.abs(a[o + 2] - b[o + 2]); n += 3;
  }
  assert.ok(sum / n <= 3, `ROI 外平均差 ${(sum / n).toFixed(2)}／255`);
});

test('底片管線：長邊 3840 的片縮到 2560', { skip: !HAS_FFMPEG && '沒有 ffmpeg' }, async () => {
  const dir = synthProject({ w: 3840, h: 2160, dur: 1, fps: 5, landmarks: false });
  const r = await L.renderLookFootage({ projectDir: dir, track: L.loadTrack({ frames: [] }), slim: 0.6 });
  assert.deepEqual([r.width, r.height, r.scaled, r.frames], [2560, 1440, true, 5]);
});

test('對照圖：1680 寬、3 列；印偵測率與位移；偵測率低時 ⚠', { skip: !HAS_FFMPEG && '沒有 ffmpeg' }, () => {
  let dir = synthProject();
  let r = L.lookPreview({ projectDir: dir, templateDir: TEMPLATE, plan: {} });
  const info = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', r.file], { encoding: 'utf8' }).stdout.trim();
  assert.equal(info, '1680,1210');
  assert.match(r.lines[0], /^講者對照圖：work\/look-preview\.jpg（3 列：頭 0:00\.1、中 0:01\.0、尾 0:01\.9）$/);
  assert.ok(r.lines.includes('偵測率：100.00%（60／60 格；全黑 0 格不算）'));
  assert.ok(r.lines.some((l) => /^每格最大位移（全部 60 格）：中位數 [\d.]+ px、最大 [\d.]+ px（0:\d\d\.\d），＝臉寬 2\.\d\d%（95% 的格 ≤ 2\.\d\d%）$/.test(l)), r.lines.join('\n'));
  assert.deepEqual(r.warnings, []);
  dir = synthProject({ nullEvery: 10 });
  r = L.lookPreview({ projectDir: dir, templateDir: TEMPLATE, plan: {} });
  assert.ok(r.warnings.some((w) => /^⚠ 偵測率 90\.00%（< 95%）/.test(w)), r.warnings.join('\n'));
  assert.ok(r.lines.some((l) => l.startsWith('未偵測區間：0 段')));
});

test('底片編碼（009 FR-100）：橫式濾鏡和改版前相同；frame 寬高比照 framing.aspect；直式沒有 frame 等比蓋滿 1080×1920', () => {
  const crop = { x: 120, y: 144, w: 1664, h: 936 };
  assert.deepEqual(FF.footageVf({}), []);
  assert.deepEqual(FF.footageVf({ crop }), ['crop=1664:936:120:144', 'scale=1920:1080:flags=lanczos']);
  assert.deepEqual(FF.footageVf({ crop, canvas: CANVAS.landscape }), FF.footageVf({ crop }));
  assert.deepEqual(FF.footageVf({ canvas: CANVAS.portrait }), ['scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos', 'crop=1080:1920']);
  assert.deepEqual(FF.footageVf({ crop: { x: 656, y: 0, w: 608, h: 1080 }, canvas: CANVAS.portrait }), ['crop=608:1080:656:0', 'scale=1080:1920:flags=lanczos']);
  assert.throws(() => FF.footageVf({ crop, canvas: CANVAS.portrait }), /^Error: frame 的寬高比要是 9:16（換成來源像素是 1664×936＝1\.778，要 0\.563）→ 照 qc\.mjs framing/);
  assert.throws(() => FF.footageVf({ crop: { x: 0, y: 0, w: 608, h: 1080 } }), /frame 的寬高比要是 16:9/);
  assert.doesNotThrow(() => FF.footageVf({ crop: { x: 0, y: 0, w: 1662, h: 936 } }));   // 取偶數差 0.1 % 不擋
});

test('底片編碼實跑（009 FR-100）：直式素材沒有 frame → 1080×1920、30 fps，等比不補黑邊', { skip: !HAS_FFMPEG && '沒有 ffmpeg' }, () => {
  const dir = tmpDir('look-v-'), src = path.join(dir, 'rough.mp4'), dst = path.join(dir, 'footage.mp4');
  // 4:5 的紅色片：等比蓋滿後上下剛好、左右裁掉；補邊的話四角會是黑的
  assert.equal(spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=360x450:r=25:d=1', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
    '-t', '1', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', src]).status, 0);
  FF.encodeFootage(src, dst, { canvas: CANVAS.portrait });
  const info = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate', '-of', 'csv=p=0', dst], { encoding: 'utf8' }).stdout.trim();
  assert.equal(info, '1080,1920,30/1');
  const rgb = L.grabRgb(dst, { at: 0.5 });
  for (const [x, y] of [[2, 2], [1077, 2], [2, 1917], [1077, 1917]]) {
    const o = (y * 1080 + x) * 3;
    assert.ok(rgb[o] > 200 && rgb[o + 1] < 60 && rgb[o + 2] < 60, `(${x}, ${y}) 是 ${[rgb[o], rgb[o + 1], rgb[o + 2]]}，不是紅色`);
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

test('對照圖（009 FR-101）：直拍來源每欄 360×640，三欄 1120 寬', { skip: !HAS_FFMPEG && '沒有 ffmpeg' }, () => {
  const dir = synthProject({ w: 180, h: 320 });
  const r = L.lookPreview({ projectDir: dir, templateDir: TEMPLATE, plan: {} });
  const info = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', r.file], { encoding: 'utf8' }).stdout.trim();
  assert.equal(info, '1120,2050');
  assert.match(r.lines[0], /^講者對照圖：work\/look-preview\.jpg（3 列：/);
});

test('對照圖的位移數字（C-05）：瘦臉底片最新時用 renderLookFootage 逐格算好的（和 state.json 一致），不再抽樣', { skip: !HAS_FFMPEG && '沒有 ffmpeg' }, async () => {
  const dir = synthProject(), P = L.statePaths(dir);
  const r = await L.renderLookFootage({ projectDir: dir, track: L.loadTrack(P.landmarks), slim: 0.6 });
  assert.ok(r.dispP95Ratio > 0.02 && r.dispP95Ratio < 0.035 && r.maxDispAt >= 0 && r.medianDisp > 0, JSON.stringify(r));
  const summary = JSON.parse(fs.readFileSync(P.landmarks, 'utf8')).summary;
  L.writeState(dir, {
    landmarks: { ...L.statOf(P.landmarks), rough: L.statOf(P.rough), modelSha256: L.modelSha(TEMPLATE), lmVer: L.LM_VER, every: 1, summary },
    footage: { ...L.statOf(P.footage), rough: L.statOf(P.rough), landmarks: L.statOf(P.landmarks), slim: 0.6, lookVer: L.LOOK_VER, width: r.width, height: r.height,
      warped: r.warped, medianDisp: r.medianDisp, maxDisp: 99.9, maxDispRatio: r.maxDispRatio, maxDispAt: r.maxDispAt, dispP95Ratio: r.dispP95Ratio },
  });
  const pv = L.lookPreview({ projectDir: dir, templateDir: TEMPLATE, plan: {} });
  assert.ok(pv.lines.some((l) => l.startsWith('每格最大位移（全部 60 格）：') && l.includes('最大 99.9 px')), pv.lines.join('\n'));
});

// ---------- CLI ----------

async function cli(args, cwd = WORKSPACE) {
  const lines = [];
  const code = await CLI.main(args, { out: (l) => lines.push(l), cwd });
  return { code, lines };
}

test('CLI：--help、參數錯誤退出 2、run 不用跑、status 只印一行下一步、clear', async () => {
  let r = await cli(['--help']);
  assert.equal(r.code, 0);
  assert.match(r.lines[0], /^講者調光＋瘦臉（零依賴/);
  for (const bad of [['nope'], ['run', '--every', '3'], ['ensure', '--project', 'x'], ['status', '--zzz'], [], ['status', 'x']]) {
    r = await cli(bad);
    assert.equal(r.code, 2, bad.join(' '));
    assert.match(r.lines[0], /^✖ .*→ /, '每則 ✖ 都要有 → 改法（C-07）');
  }
  assert.equal((await cli(['nope'])).lines[0], '✖ 沒有 run／preview／status／clear／ensure 以外的子指令「nope」 → 看用法：node shared/template/tools/look.mjs --help');
  assert.equal((await cli(['status', 'x'])).lines[0], '✖ 看不懂的參數「x」 → 看用法：node shared/template/tools/look.mjs --help');
  assert.equal((await cli(['status', '--zzz'])).lines[0], '✖ 沒有 --zzz 這個參數 → 看用法：node shared/template/tools/look.mjs --help');
  assert.equal((await cli(['run', '--every', '3'])).lines[0], '✖ --every 只能是 1 或 2，現在是「3」 → 改成 --every 1 或 --every 2');
  const dir = fakeProject({ plan: { version: 1, look: { slim: 0 }, scenes: [] } });
  r = await cli(['run', '--project', dir]);
  assert.equal(r.code, 0);
  assert.match(r.lines.at(-1), /^瘦臉關閉（plan\.json 的 look slim = 0）→ 不用跑；調光 0\.8 在 build 時 bake$/);
  const d2 = fakeProject();
  r = await cli(['status', '--project', d2]);
  assert.equal(r.code, 0);
  assert.equal(r.lines.filter((l) => l.startsWith('→ 下一步：')).length, 1, r.lines.join('\n'));
  assert.equal(r.lines[1], '設定：調光 0.8、瘦臉 0.6（來源：kit/look.json）');
  freshState(d2);
  fs.writeFileSync(path.join(d2, 'work', 'look-preview.jpg'), 'x');
  r = await cli(['status', '--project', d2]);
  assert.ok(r.lines.includes('瘦臉底片：✔ 最新（work/rough-look.mp4，瘦臉 0.6，640×360）'), r.lines.join('\n'));
  // 沒有 plan.json：look 好了 → 構圖預覽，不叫人 build（C-01）；指令單獨一行（C-02）
  assert.match(r.lines.at(-2), /^→ 下一步：look 好了；接著做構圖＋套卡預覽/);
  assert.match(r.lines.at(-1), /^node shared\/template\/tools\/qc\.mjs framing --project \S+ --cards$/);
  L.writeState(d2, { run: { pid: process.pid, phase: 'detect', done: 10, total: 100, etaSec: 30, startedAt: new Date().toISOString() } });
  r = await cli(['clear', '--project', d2]);
  assert.equal(r.code, 1);
  assert.match(r.lines[0], /^✖ 正在跑（pid \d+）/);
  L.writeState(d2, { run: { pid: process.pid, phase: 'done' } });
  r = await cli(['clear', '--project', d2]);
  assert.equal(r.lines[0], '已刪除：work/face-landmarks.json、work/rough-look.mp4、work/look-preview.jpg、work/.look/（下次 look.mjs run 會重新偵測與變形；瘦臉 > 0 時 build 會請你先跑 run）');
  assert.ok(!fs.existsSync(path.join(d2, 'work', '.look')));
  r = await cli(['clear', '--project', d2]);
  assert.equal(r.lines[0], '沒有要刪的（work/ 裡沒有 look 的檔）');
});

// 指令單獨一行、可以整行複製執行：只有 node／npx 開頭、沒有全形說明黏在後面（C-02）
const bareCmd = (c) => assert.match(c, /^(node shared\/template\/tools\/[\w-]+\.mjs|npx hyperframes) [^\s（）。；，、]+( [^\s（）。；，、]+)*$/, c);

test('lookNextStep（C-01、C-02、C-06）：還沒好 → 修／等／重跑／run（超過 2 分鐘帶 --background）／ensure／Chrome；好了 → 構圖預覽 → status.mjs，plan 有段落才 build', { skip: !HAS_FFMPEG && '沒有 ffmpeg' }, async () => {
  const ns = (dir, plan = {}, probe = OK_PROBE) => { const s = L.lookNextStep({ projectDir: dir, plan, templateDir: TEMPLATE, probe }); bareCmd(s.cmd); assert.ok(!s.note.includes('\n')); return s; };
  // 120 秒、30 fps：3600 格 → 偵測＋變形預估 3 分（> 2 → --background）；landmark 快取還在時只變形，預估 1 分
  const dir = tmpDir('look-next-'), work = path.join(dir, 'work');
  fs.mkdirSync(path.join(work, 'hyperframes'), { recursive: true });
  assert.equal(spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=gray:s=64x64:r=30', '-t', '120', '-c:v', 'libx264', '-preset', 'ultrafast', path.join(work, 'rough.mp4')]).status, 0);
  let s = ns(dir);
  assert.deepEqual([s.step, s.done], ['run', false]);
  assert.equal(s.note, '瘦臉底片要重做（還沒跑過），預估 3 分（Windows 約 ×1.5–3），超過 2 分鐘所以在背景跑，之後每 30 秒跑一次 look.mjs status');
  assert.match(s.cmd, /^node shared\/template\/tools\/look\.mjs run --project \S+ --background$/);
  assert.equal(L.nextLines(s)[0], `→ 下一步：${s.note}`);
  assert.throws(() => L.ensureLook({ projectDir: dir, plan: {}, templateDir: TEMPLATE, probe: OK_PROBE }),
    /^Error: 瘦臉底片不是最新的（還沒跑過；預估 3 分，超過 2 分鐘就在背景跑，用 look\.mjs status 看進度；不要瘦臉就在 plan\.json 寫 "look": \{ "slim": 0 \}）→ 先跑 node shared\/template\/tools\/look\.mjs run --project \S+ --background$/);
  // 只改 slim（landmark 還是最新）→ 只重做變形：預估 1 分、前景跑（C-06）
  freshState(dir);
  s = ns(dir, { look: { slim: 0.8 } });
  assert.equal(s.note, '瘦臉底片要重做（瘦臉強度 0.6 → 0.8），預估 1 分（Windows 約 ×1.5–3）');
  assert.match(s.cmd, /^node shared\/template\/tools\/look\.mjs run --project \S+$/);
  L.writeState(dir, { run: { pid: 999999, phase: 'failed', error: 'x' } });
  s = ns(dir, { look: { slim: 0.8 } });
  assert.equal(s.step, 'retry');
  assert.equal(s.note, '上次失敗（原因在 work/.look/run.log 最後幾行）；重跑一次，預估 1 分（Windows 約 ×1.5–3），第二次失敗就停下來回報');
  L.writeState(dir, { run: { pid: process.pid, phase: 'render' } });
  s = ns(dir, { look: { slim: 0.8 } });
  assert.deepEqual([s.step, s.done], ['wait', false]);
  assert.match(s.cmd, /^node shared\/template\/tools\/look\.mjs status --project \S+$/);
  L.writeState(dir, { run: { pid: process.pid, phase: 'done' } });
  assert.equal(ns(dir, { look: { slim: 0.8 } }, { assets: { ok: false, missing: ['face_landmarker.task'], bad: [] }, chrome: true }).cmd, 'node shared/template/tools/look.mjs ensure --download');
  assert.equal(ns(dir, { look: { slim: 0.8 } }, { ...OK_PROBE, chrome: false }).cmd, 'npx hyperframes browser ensure');
  s = ns(dir, { look: { slim: 9 } });
  assert.equal(s.step, 'fix');
  assert.match(s.note, /^plan\.json 的 look 寫錯（look\.slim 要是 0–1\.2 的數字/);
  // look 好了：沒有 plan.json（或還沒有段落）→ 構圖預覽；構圖預覽比瘦臉底片新 → status.mjs；plan 有段落 → build
  s = ns(dir);
  assert.deepEqual([s.step, s.done], ['framing', true]);
  assert.match(s.cmd, /^node shared\/template\/tools\/qc\.mjs framing --project \S+ --cards$/);
  assert.equal(ns(dir, { version: 1, scenes: [] }).step, 'framing');
  const cards = path.join(work, L.FRAMING_CARDS), old = new Date(Date.now() - 600000);
  fs.writeFileSync(cards, 'jpg');
  fs.utimesSync(cards, old, old);
  assert.equal(ns(dir).step, 'framing', '構圖預覽比瘦臉底片舊 → 重做');
  fs.utimesSync(cards, new Date(), new Date());
  s = ns(dir);
  assert.deepEqual([s.step, s.done], ['next', true]);
  assert.match(s.cmd, /^node shared\/template\/tools\/status\.mjs --project \S+$/);
  s = ns(dir, { version: 1, scenes: [{ id: 's01' }] });
  assert.deepEqual([s.step, s.done], ['build', true]);
  assert.match(s.cmd, /^node shared\/template\/tools\/build\.mjs --project \S+$/);
  // 路徑有空白就加雙引號（整行複製才跑得動）
  assert.deepEqual([L.projArg('projects/範例'), L.projArg('projects/my video')], ['projects/範例', '"projects/my video"']);
  // 略過瘦臉（臉太小）也算好了
  freshState(dir, { summary: { rate: 1, medianFaceWidth: 43, lookFaceWidth: 43, slimOk: false, reason: 'small' }, footage: false });
  assert.deepEqual([ns(dir).step, ns(dir).done], ['next', true]);
});

test('位移 ⚠（C-03）：門檻 6.5 %、看 95 百分位；dispSummary／dispStats；正臉在 slim 1.2 也不到門檻', () => {
  assert.equal(L.DISP_WARN, 0.065);
  assert.equal(L.dispWarning(0.0649), null);
  assert.equal(L.dispWarning(0.0651), '⚠ 位移 ＝ 臉寬 6.51%（95% 的格；> 6.5%）→ 瘦臉太強，脖子與領口可能被拉彎；把 slim 調低（plan.json 的 look.slim 或剪輯台「講者」）');
  const items = Array.from({ length: 100 }, (_, i) => ({ m: i, r: i / 1000, t: i / 10 }));
  assert.deepEqual(L.dispSummary(items), { n: 100, med: 50, mx: 99, mxAt: 9.9, mxR: 0.099, p95: 0.095 });
  assert.deepEqual(L.dispSummary([]), { n: 0, med: 0, mx: 0, mxAt: 0, mxR: 0, p95: 0 });
  // 正臉 FACE58（臉寬 200 px）：位移比 ≈ 4.55 % × slim；1.2 時 ≈ 5.5 %，⚠ 只會被轉頭的格推過門檻
  const track = L.loadTrack({ frames: Array.from({ length: 30 }, () => ({ p: faceP(640, 360), b: [0, 0, 1, 1], n: 1 })) });
  const at = (slim) => L.dispStats({ track, slim, w: 1280, h: 720 }).p95;
  assert.ok(Math.abs(at(0.6) - 0.0273) < 0.001, `slim 0.6：${(at(0.6) * 100).toFixed(2)}%`);
  assert.ok(at(1.2) < L.DISP_WARN && at(1.2) > 0.05, `slim 1.2：${(at(1.2) * 100).toFixed(2)}%`);
});

test('位移 ⚠ 校準（C-03）：示範口播 15–25 秒、landmark 放大 2 倍，slim 0.6／0.8 不 ⚠、1.05 ⚠（各留 0.5 % 邊距）', { skip: (!HAS_CHROME && '沒有 HyperFrames 的 Chrome') || (!fs.existsSync(DEMO) && '沒有示範口播') || (!HAS_FFMPEG && '沒有 ffmpeg'), timeout: 180000 }, async () => {
  const { openDetector, detectLandmarks } = await imp('lib/landmarks.mjs');
  const clip = path.join(tmpDir(), 'clip.mp4');
  assert.equal(spawnSync('ffmpeg', ['-y', '-v', 'error', '-ss', '15', '-i', DEMO, '-t', '10', '-an', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '12', clip]).status, 0);
  const det = await openDetector({ vendorDir: path.join(TEMPLATE, 'vendor', 'mediapipe') });
  let r;
  try { r = await detectLandmarks({ video: clip, detector: det }); } finally { await det.close(); }
  // 640×360 偵測、landmark 放大 2 倍＝1280×720 rough-look 的量法（位移比和解析度無關；原尺寸臉寬 43 px 會被當成太小）
  const track = L.loadTrack({ frames: r.frames }, { lookScale: 2 });
  const p95 = [0.6, 0.8, 1.05].map((slim) => L.dispStats({ track, slim, w: 1280, h: 720, lookScale: 2 }).p95);
  const msg = p95.map((x) => `${(x * 100).toFixed(2)}%`).join('／');
  assert.ok(p95[0] < L.DISP_WARN - 0.005 && p95[1] < L.DISP_WARN - 0.005, `0.6／0.8 要不 ⚠：${msg}`);
  assert.ok(p95[2] > L.DISP_WARN + 0.005, `1.05 要 ⚠：${msg}`);
});

test('Chrome 暫存 profile：開新的之前清掉超過 1 天的 look-lm-*，別的前綴與新的不動（C-13）', async () => {
  const { sweepStaleProfiles } = await imp('lib/landmarks.mjs');
  const t = tmpDir('look-sweep-'), old = new Date(Date.now() - 2 * 86400000);
  for (const n of ['look-lm-old', 'look-lm-new', 'other-old']) fs.mkdirSync(path.join(t, n, 'Default'), { recursive: true });
  for (const n of ['look-lm-old', 'other-old']) fs.utimesSync(path.join(t, n), old, old);
  fs.writeFileSync(path.join(t, 'look-lm-file'), 'x');
  fs.utimesSync(path.join(t, 'look-lm-file'), old, old);
  assert.equal(sweepStaleProfiles(t), 1);
  assert.deepEqual(fs.readdirSync(t).sort(), ['look-lm-file', 'look-lm-new', 'other-old']);
});

test('CLI ensure：缺檔 ✖ 退出 1；--download 從本機假來源補、sha256 不符不換上去、404', async () => {
  const t = tmpDir('look-tpl-'), v = path.join(t, 'vendor', 'mediapipe');
  fs.mkdirSync(path.join(v, 'wasm'), { recursive: true });
  const good = { 'a.mjs': Buffer.from('export const a = 1;\n'), 'wasm/b.wasm': Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]) };
  const served = { '/a.mjs': good['a.mjs'], '/b.wasm': Buffer.from('not the wasm') };
  const srv = http.createServer((req, res) => { const b = served[req.url]; if (!b) { res.writeHead(404); return res.end(); } res.writeHead(200); res.end(b); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const manifest = (urlB) => ({ version: 'test', files: [
    { path: 'a.mjs', size: good['a.mjs'].length, sha256: crypto.createHash('sha256').update(good['a.mjs']).digest('hex'), url: `${base}/a.mjs` },
    { path: 'wasm/b.wasm', size: good['wasm/b.wasm'].length, sha256: crypto.createHash('sha256').update(good['wasm/b.wasm']).digest('hex'), url: urlB },
  ] });
  try {
    fs.writeFileSync(path.join(v, 'manifest.json'), JSON.stringify(manifest(`${base}/b.wasm`)));
    let r = await cli(['ensure', '--template', t]);
    assert.equal(r.code, 1);
    assert.ok(r.lines.some((l) => /✖ a\.mjs\s+不存在/.test(l)), r.lines.join('\n'));
    assert.match(r.lines.at(-1), /^→ 加 --download/);
    r = await cli(['ensure', '--template', t, '--download']);
    assert.equal(r.code, 1);
    assert.ok(r.lines.some((l) => /↓ a\.mjs/.test(l)));
    assert.ok(r.lines.some((l) => /^✖ 下載的 wasm\/b\.wasm sha256 不對（[0-9a-f]{12}）→ 沒有換上去/.test(l)), r.lines.join('\n'));
    assert.ok(fs.existsSync(path.join(v, 'a.mjs')) && !fs.existsSync(path.join(v, 'wasm', 'b.wasm')) && !fs.existsSync(path.join(v, 'wasm', 'b.wasm.download')));
    fs.writeFileSync(path.join(v, 'manifest.json'), JSON.stringify(manifest(`${base}/missing.wasm`)));
    r = await cli(['ensure', '--template', t, '--download']);
    assert.ok(r.lines.some((l) => /^✖ 下載 wasm\/b\.wasm 失敗（HTTP 404）/.test(l)), r.lines.join('\n'));
    served['/b.wasm'] = good['wasm/b.wasm'];
    fs.writeFileSync(path.join(v, 'manifest.json'), JSON.stringify(manifest(`${base}/b.wasm`)));
    r = await cli(['ensure', '--template', t, '--download']);
    assert.equal(r.code, 0, r.lines.join('\n'));
    assert.equal(r.lines.at(-1), '✔ 2 個檔都對');
  } finally { srv.close(); }
});

// ---------- 資產與真的偵測 ----------

test('資產：vendor/mediapipe 的 4 個檔和 manifest 的大小與 sha256 一致；LICENSE 是 Apache-2.0 全文', () => {
  const v = path.join(TEMPLATE, 'vendor', 'mediapipe'), m = JSON.parse(fs.readFileSync(path.join(v, 'manifest.json'), 'utf8'));
  assert.equal(m.files.length, 4);
  assert.equal(m.files.reduce((s, f) => s + f.size, 0), 18715722);
  for (const f of m.files) {
    const file = path.join(v, f.path);
    assert.equal(fs.statSync(file).size, f.size, f.path);
    assert.equal(sha256(file), f.sha256, f.path);
  }
  assert.equal(sha256(path.join(v, 'LICENSE')), 'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30');
  assert.equal(L.assetsStatus(v, { sha: true }).ok, true);
});

test('偵測：示範口播前 3 秒，偵測率 ≥ 95 %、臉寬 35–55 px', { skip: (!HAS_CHROME && '沒有 HyperFrames 的 Chrome') || (!fs.existsSync(DEMO) && '沒有示範口播') || (!HAS_FFMPEG && '沒有 ffmpeg'), timeout: 120000 }, async () => {
  const { openDetector, detectLandmarks, locateFaces } = await imp('lib/landmarks.mjs');
  const t = tmpDir(), clip = path.join(t, 'clip.mp4');
  assert.equal(spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', DEMO, '-t', '3', '-c', 'copy', clip]).status, 0);
  const det = await openDetector({ vendorDir: path.join(TEMPLATE, 'vendor', 'mediapipe') });
  try {
    const loc = await locateFaces({ video: clip, times: [1.5], detector: det });
    assert.ok(loc[0] && loc[0].fw > 35 && loc[0].fw < 55, JSON.stringify(loc));
    const r = await detectLandmarks({ video: clip, detector: det });
    const ok = r.frames.filter((f) => f && typeof f === 'object');
    assert.ok(ok.length / r.frames.length >= 0.95, `偵測率 ${ok.length}/${r.frames.length}`);
    const fws = ok.map((f) => L.faceWidth(L.lmFromP(f.p))).sort((a, b) => a - b);
    const med = fws[fws.length >> 1];
    assert.ok(med > 35 && med < 55, `臉寬中位數 ${med}`);
    assert.equal(ok[0].p.length, 116);
  } finally { await det.close(); }
});

test('沒有臉的片（testsrc）：抽樣 12 格都沒臉就略過整支偵測，run 退出 0、ensureLook 用 rough.mp4', { skip: (!HAS_CHROME && '沒有 HyperFrames 的 Chrome') || (!HAS_FFMPEG && '沒有 ffmpeg'), timeout: 120000 }, async () => {
  const dir = synthProject({ w: 640, h: 360, dur: 30, landmarks: false });
  const t0 = Date.now();
  const r = await cli(['run', '--project', dir]);
  const sec = (Date.now() - t0) / 1000;
  assert.equal(r.code, 0, r.lines.join('\n'));
  assert.ok(r.lines.includes('[1/3] 找臉：抽 12 格 → 12 格都沒找到臉'), r.lines.join('\n'));
  assert.ok(r.lines.includes('⚠ 抽樣 12 格都沒偵測到臉 → 這支只調光；確定有講者就加 --force'), r.lines.join('\n'));
  assert.ok(!r.lines.some((l) => l.startsWith('[2/3]')), '不能逐格偵測');
  assert.ok(sec < 20, `花了 ${sec.toFixed(1)} 秒（900 格不該逐格掃）`);
  const P = L.statePaths(dir);
  assert.ok(!fs.existsSync(P.footage));
  const lm = JSON.parse(fs.readFileSync(P.landmarks, 'utf8'));
  assert.deepEqual([lm.frames.length, lm.summary.reason, lm.summary.slimOk], [0, 'noface', false]);
  const look = L.ensureLook({ projectDir: dir, plan: {}, templateDir: TEMPLATE, strict: true });
  assert.equal(look.footage, P.rough);
  assert.equal(look.key.slim, 0);
  assert.match(look.report[1], /^⚠ 講者瘦臉略過：抽樣 12 格都沒偵測到臉 → 這支只調光；確定有講者就跑 node shared\/template\/tools\/look\.mjs run --project .* --force$/);
  const again = await cli(['run', '--project', dir]);
  assert.ok(again.lines.includes('[1/3] 找臉：用快取（抽樣 12 格都沒有臉）'), again.lines.join('\n'));
  const st = await cli(['status', '--project', dir]);
  assert.match(st.lines.at(-1), /^node shared\/template\/tools\/qc\.mjs framing --project \S+ --cards$/);
});
