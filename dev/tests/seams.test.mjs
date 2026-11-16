// lib/seams.mjs（055 N5 seam-flash、N6 seam-cut）：換段清單、取格時刻、字幕帶、判斷（假格子＋PPA 短影片真的畫面）、訊息
// 真的畫面在 fixtures/055-seams/：照 frameTimes 截的格（hyperframes snapshot）縮成 40 px 格子的平均亮度／2 與標準差×2（deflate＋base64）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { imp } from './helpers.mjs';

const L = await imp('lib/seams.mjs');
const { SEAM, seamList, frameTimes, captionBand, maskOf, gridOf, analyzeSeam, seamLine, whereOf, seamSummary } = L;
const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', '055-seams');

const item = (id, type, s, e, tx = {}, extra = {}) => ({ id, type, out: { start: s, end: e, tx: { in: 'overlay', out: 'overlay', ...tx } }, ...extra });

// ---------- 換段清單 ----------

test('seamList：相接的兩段只算一個換段；段尾接講者也算；片頭片尾、錄影段、kit 的版面轉場不量', () => {
  const items = [
    item('s01', 'custom', 0.15, 9.35),
    item('x02', 'custom', 9.35, 19.73),
    item('s03', 'scene', 19.73, 26.75, { out: 'cover' }),
    item('m04', 'media', 26.25, 31.58, { in: 'media', out: 'media' }),
    item('m05', 'media', 31.11, 36.89, { in: 'media', out: 'media' }),
    item('s06', 'custom', 36.89, 40, { in: 'wipeIn' }),
    item('s07', 'custom', 41, 44, { in: 'overlay' }),
    item('c08', 'scene', 45, 48, { in: 'chapter' }, { key: 'chapter', family: 'chapter' }),
    item('s09', 'custom', 48, 50, { in: 'overlay' }),
    item('s10', 'custom', 51, 55),
  ];
  const list = seamList(items, { filmEnd: 55 });
  assert.deepEqual(list.map((m) => [m.t, m.a, m.b, m.cut]), [
    [0.15, null, 's01', false],   // 片頭前只有講者：不量硬切
    [9.35, 's01', 'x02', true],
    [19.73, 'x02', 's03', true],
    [40, 's06', null, true],      // s06 段尾接講者
    [41, null, 's07', false],
    [44, 's07', null, true],
    [48, 'c08', 's09', false],    // 章節幕：不報硬切
    [50, 's09', null, true],
    [51, null, 's10', false],
  ]);
  assert.deepEqual(seamList(items, { filmEnd: 55, only: ['x02'] }).map((m) => m.t), [9.35, 19.73]);
});

test('seamList：kit 的版面轉場（swap、rise、wipeOut、band…）整個不量', () => {
  for (const [tx, side] of [['swap', 'in'], ['wipe', 'in'], ['band', 'in'], ['rise', 'out'], ['wipeOut', 'out'], ['retract', 'out'], ['handoff', 'out']]) {
    const items = [item('a', 'custom', 1, 5, side === 'out' ? { out: tx } : {}), item('b', 'custom', 5, 9, side === 'in' ? { in: tx } : {})];
    assert.equal(seamList(items, { filmEnd: 20 }).filter((m) => m.t === 5).length, 0, `${side} ${tx}`);
  }
});

// ---------- 取格時刻 ----------

test('frameTimes：都對齊 30 fps 的格；換段前最後一格、換段後第一格；之前 0.3 秒那一格給 seam-cut', () => {
  const ft = frameTimes(9.35, 30);
  assert.equal(ft.tb, 9.333);
  assert.equal(ft.ta, 9.367);
  assert.equal(ft.pre, 8.367);
  assert.equal(ft.post, 9.967);
  for (const t of [ft.pre, ...ft.mids, ...ft.after, ft.post]) assert.ok(Math.abs(t * 30 - Math.round(t * 30)) < 0.05, `${t} 沒對齊`);
  assert.ok(ft.mids.includes(ft.gap) && Math.abs(ft.gap - 9.05) < 0.04);
  // 換段剛好在格上：最後一格是前一格
  const f2 = frameTimes(19.7333, 30);
  assert.equal(f2.tb, 19.7);
  assert.equal(f2.ta, 19.733);
  // 片頭：不會變負的
  assert.ok(frameTimes(0.15, 30).pre >= 0);
});

// ---------- 字幕帶 ----------

test('captionBand：照字幕 root 的 --cap-bottom／--cap-line／--cap-pad；沒有 data-cap 用 kit 的預設（直式 511、橫式 6）', () => {
  const root = '<div id="captions" data-composition-id="captions" data-format="portrait" data-cap="box" style="--cap-size: 76px; --cap-line: 71px; --cap-pad: 24px 37px 23px 37px; --cap-bottom: 363px">';
  assert.deepEqual(captionBand(root, 1080, 1920), [1920 - 363 - 118 - SEAM.capPad, 1920 - 363 + SEAM.capPad]);
  assert.deepEqual(captionBand('<div id="captions" data-format="portrait">', 1080, 1920), [1920 - 511 - 118 - SEAM.capPad, 1920 - 511 + SEAM.capPad]);
  assert.deepEqual(captionBand('<div id="captions">', 1920, 1080), [1080 - 6 - 118 - SEAM.capPad, 1080]);
  const { mask, gw, gh } = maskOf(1080, 1920, [1400, 1560]);
  assert.equal(gw, 27);
  assert.equal(gh, 48);
  assert.equal(mask[35 * gw], 0);   // y 1400–1440
  assert.equal(mask[34 * gw], 1);
});

// ---------- 判斷（假格子） ----------

const N = 27 * 48;
const flat = (v) => ({ gw: 27, gh: 48, m: new Float32Array(N).fill(v), sd: new Float32Array(N).fill(0) });
const textured = (v) => ({ gw: 27, gh: 48, m: new Float32Array(N).fill(v), sd: new Float32Array(N).fill(20) });
const paint = (g, share, v, sd = null) => { const n = Math.round(N * share); for (let i = 0; i < n; i++) { g.m[i] = v; if (sd != null) g.sd[i] = sd; } return g; };
const ALL = new Uint8Array(N).fill(1);
function framesOf(ft, fn) { const all = [ft.pre, ...ft.mids, ft.tb, ft.ta, ...ft.after, ft.post]; return new Map(all.map((t) => [t, fn(t)])); }

test('analyzeSeam：前後都是深色底、換段前底先淡掉露出講者 → seam-flash（整個畫面變亮、底色一樣的改法）', () => {
  const ft = frameTimes(9.35);
  const frames = framesOf(ft, (t) => (t > 9.15 && t < 9.35 ? paint(flat(20), 0.3, 120, 25) : flat(20)));
  const out = analyzeSeam({ t: 9.35, a: 's0101', b: 'x0103', cut: true }, frames, ALL, ft);
  assert.equal(out.length, 1);
  assert.equal(out[0].code, 'seam-flash');
  assert.equal(out[0].dir, 'up');
  assert.equal(out[0].reveal, true);
  assert.match(seamLine(out[0]), /^⚠ s0101→x0103 9\.35 秒換段前後畫面閃一下（9\.17–9\.33 秒，畫面上方變亮，約占 30%）→ 前後兩段同一個底色就讓底一直在，只淡出字和圖$/);
});

test('analyzeSeam：錄影（有紋路）自己在動不算；閃的面積 < 5% 不報', () => {
  const ft = frameTimes(9.35);
  const moving = framesOf(ft, (t) => (t > 9.15 && t < 9.35 ? paint(textured(60), 0.4, 150, 20) : textured(60)));
  assert.deepEqual(analyzeSeam({ t: 9.35, a: 'a', b: 'b', cut: true }, moving, ALL, ft), []);
  const small = framesOf(ft, (t) => (t > 9.15 && t < 9.35 ? paint(flat(20), 0.04, 120, 25) : flat(20)));
  assert.deepEqual(analyzeSeam({ t: 9.35, a: 'a', b: 'b', cut: true }, small, ALL, ft), []);
});

test('analyzeSeam：深色底一格內消失、之前沒有淡出 → seam-cut；有 0.3 秒淡出、或不量硬切的換段 → 不報', () => {
  const ft = frameTimes(19.234);
  const hard = framesOf(ft, (t) => (t <= ft.tb ? flat(20) : textured(110)));
  const out = analyzeSeam({ t: 19.234, a: 'x0103', b: null, cut: true }, hard, ALL, ft);
  assert.equal(out.length, 1);
  assert.equal(out[0].code, 'seam-cut');
  assert.equal(seamLine(out[0]), '⚠ x0103 的深色底在 19.23 秒一格內消失、露出講者（整個畫面，約占 100%）→ 至少 0.3 秒淡出或擦開');
  // 0.3 秒淡出：之前那一格已經在變
  const fade = framesOf(ft, (t) => (t >= ft.ta ? textured(110) : t >= ft.gap ? flat(20 + (90 * (t - ft.gap + 0.03)) / 0.33) : flat(20)));
  assert.deepEqual(analyzeSeam({ t: 19.234, a: 'x0103', b: null, cut: true }, fade, ALL, ft), []);
  assert.deepEqual(analyzeSeam({ t: 19.234, a: 'x0103', b: 'm0105', cut: false }, hard, ALL, ft), []);
});

test('whereOf、seamSummary', () => {
  assert.equal(whereOf([...Array(N).keys()], 27, 48), '整個畫面');
  assert.equal(whereOf([0, 1, 2, 27, 28], 27, 48), '畫面左上');
  assert.equal(seamSummary({ total: 0 }), '');
  assert.equal(seamSummary({ total: 5, cached: 3, measured: 2, seconds: 14.2, skipped: 0, findings: [] }), '換段：5 個、沿用上次 3、這次量 2（14.2 秒）；閃一下、硬切 ⚠ 0');
  assert.match(seamSummary({ error: '還沒 build（沒有 index.html）' }), /^換段：沒有量/);
});

// ---------- PPA 短影片真的畫面 ----------

function loadFix(name) {
  const j = JSON.parse(fs.readFileSync(path.join(FIX, `${name}.json`), 'utf8'));
  const n = j.gw * j.gh, frames = new Map();
  for (const [t, b64] of Object.entries(j.frames)) {
    const u = zlib.inflateRawSync(Buffer.from(b64, 'base64'));
    const m = new Float32Array(n), sd = new Float32Array(n);
    for (let i = 0; i < n; i++) { m[i] = u[i] * j.mScale; sd[i] = u[n + i] * j.sdScale; }
    frames.set(Number(t), { gw: j.gw, gh: j.gh, m, sd });
  }
  return { ...j, frames, mask: maskOf(j.W, j.H, j.band).mask };
}
const run = (name) => { const f = loadFix(name); return analyzeSeam(f.seam, f.frames, f.mask, f.ft); };

test('短影片4 抱怨過的那幾版要報：s0101 v7（r11 背景先淡掉露出書櫃）、v8（r13 壓暗的標誌先亮一下）、x0103 v5（r10 深色底又擦入一次）→ seam-flash；x0103 v4 → seam-cut', () => {
  const v7 = run('sv4-s0101-v7');
  assert.deepEqual(v7.map((x) => x.code), ['seam-flash']);
  assert.equal(v7[0].reveal, true);
  const v8 = run('sv4-s0101-v8');
  assert.deepEqual(v8.map((x) => x.code), ['seam-flash']);
  assert.equal(v8[0].reveal, false);   // 壓暗的東西變回全亮：改法先講淡出從現在的樣子開始
  assert.match(seamLine(v8[0]), /壓暗的東西不要先變回全亮/);
  assert.deepEqual(run('sv4-x0103-v5').map((x) => x.code), ['seam-flash']);
  assert.deepEqual(run('sv4-x0103-v4').map((x) => x.code), ['seam-cut']);
});

test('現行版本不報：短影片4 s0101→x0103（底一直在）、短影片1 字卡特效放大淡出（錄影上的特效）、短影片1 白卡一格內收掉（約 5%，低於 8% 門檻）', () => {
  assert.deepEqual(run('sv4-current-9.35'), []);
  assert.deepEqual(run('sv1-fx-exit-22.459'), []);
  assert.deepEqual(run('sv1-card-cut-20.773'), []);
});

test('沒有 index.html：checkSeams 不截圖、回一句原因；seamsSync 回空的（finish 不會被擋）', async () => {
  const os = await import('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-seams-'));
  try {
    const P = { project: dir, out: path.join(dir, 'work', 'hyperframes') };
    const r = await L.checkSeams(P, { items: [item('a', 'custom', 1, 5), item('b', 'custom', 5, 9)] });
    assert.match(r.error, /還沒 build/);
    assert.deepEqual(L.seamsSync(P, ['a']), []);
    assert.deepEqual(await L.seamsLines(P), []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
