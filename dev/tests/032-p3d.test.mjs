// 032 第三階段 P3d：單一出處。
//   1. r3（四捨五入到毫秒）：各工具原本自己的那一份，和現在匯入的 lib/time.mjs 共用版逐位元組比對（同一組輸入、輸出一樣）
//   2. 時間碼（分:秒.1 位／.2 位）：同上
//   3. media.mjs 只剩指令列入口：lib/rough-flow.mjs 不匯入 media.mjs、lib/rough/ 沒有循環匯入；build.mjs 的 pathsFrom 等於 lib/project.mjs 的
//   4. checkProject(P) 和 build.mjs --check --json 印的物件一樣
//   5. 剪輯台拆句、併句、刪句（editor/subtitles.mjs）與 srt-align --remap-plan：字串型 slot、plan.moods 的句號一起換
//   6. 步驟標記：srt-align、snap-srt、screen-sync、build、qc final 做完那一步才記進 work/.jobs/state.json
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { TOOLS, TEMPLATE, imp, tmpDir, makeSrt } from './helpers.mjs';

// ---------- 1. r3 ----------
// 換掉之前各檔自己的定義（原文照抄；檔:行是 032 之前的位置）。A＝toFixed 版、B＝Math.round 版
const OLD_A = (n) => +Number(n).toFixed(3);
const OLD_B = (n) => Math.round(n * 1000) / 1000;
const R3_SITES = {
  // P3d 擁有的檔
  'qc.mjs:83': ['A', 'r3'], 'media.mjs:166（現在 lib/rough/util.mjs）': ['A', 'r3'], 'editor.mjs:74': ['A', 'r3'], 'lib/audio.mjs:32': ['A', 'r3'], 'lib/canvas.mjs:76': ['A', 'r3'],
  'versions.mjs:571': ['B', 'r3Round'],
  // 只換匯入那一行的檔
  'lib/ff.mjs:27': ['A', 'r3'], 'lib/music.mjs:37': ['A', 'r3'], 'lib/incremental.mjs:35': ['A', 'r3'], 'editor/server/write.mjs:32': ['A', 'r3'],
  'audit.mjs:123': ['B', 'r3Round'], 'lib/matte.mjs:16': ['B', 'r3Round'], 'lib/shorts.mjs:19': ['B', 'r3Round'], 'lib/audit-rules.mjs:58': ['B', 'r3Round'],
  'lib/speech.mjs:10': ['B', 'r3Round'], 'lib/sfx-local.mjs:36': ['B', 'r3Round'],
};
// 輸入：所有 ±10 秒內的半毫秒（最容易四捨五入分歧的值）、兩個毫秒值的中點、亂數、特殊值
function r3Inputs() {
  const xs = [];
  for (let k = -20000; k <= 20000; k++) xs.push(k / 2000);
  for (let k = 0; k < 4000; k++) xs.push((k / 1000 + (k + 1) / 1000) / 2, 1234 + k / 2000, 3599.9995 - k / 1000);
  let s = 12345;
  const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  for (let k = 0; k < 20000; k++) xs.push(+(rnd() * 3600).toFixed(6), rnd() * 60, -rnd() * 5);
  xs.push(0, -0, 1.2345, 0.0005, -0.0005, 1e-7, 1e21, NaN, Infinity, -Infinity, null, undefined, '1.2345', '', '0.0625');
  return xs;
}
const bytes = (v) => `${String(v)}|${JSON.stringify(v)}`;

test('r3：每一份舊的和現在匯入的共用版逐位元組一樣（toFixed 版、Math.round 版各自對）', async () => {
  const T = await imp('lib/time.mjs');
  const xs = r3Inputs();
  const bad = [];
  for (const [site, [kind, now]] of Object.entries(R3_SITES)) {
    const old = kind === 'A' ? OLD_A : OLD_B;
    const diff = xs.filter((x) => bytes(old(x)) !== bytes(T[now](x)));
    if (diff.length) bad.push(`${site}：${diff.length} 個輸入不一樣（例 ${diff.slice(0, 3).map(String).join('、')}）`);
  }
  assert.deepEqual(bad, []);
  // 兩種算法不能互換：這些輸入會差 1 毫秒（所以各檔照原本那一種匯入）
  const split = xs.filter((x) => bytes(OLD_A(x)) !== bytes(OLD_B(x)));
  assert.ok(split.length > 0 && bytes(T.r3(1.2345)) === bytes(1.234) && bytes(T.r3Round(1.2345)) === bytes(1.235), 'r3 與 r3Round 的差別要在');
});

test('r3：換過的檔不再自己定義 r3（瀏覽器端的頁面函式、editor/*.mjs、零依賴的 transcript-map 例外）', () => {
  const ALLOW = new Set(['lib/time.mjs', 'lib/transcript-map.mjs', 'editor/model.mjs', 'editor/speed.mjs', 'editor/subtitles.mjs']);
  const bad = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); continue; }
      if (!e.name.endsWith('.mjs')) continue;
      const rel = path.relative(TOOLS, p).split(path.sep).join('/');
      if (ALLOW.has(rel)) continue;
      fs.readFileSync(p, 'utf8').split('\n').forEach((l, i) => { if (/^(export )?const r3 = /.test(l)) bad.push(`${rel}:${i + 1}`); });
    }
  };
  walk(TOOLS);
  assert.deepEqual(bad, [], '改成從 lib/time.mjs 匯入 r3（toFixed 版）或 r3Round（Math.round 版），照原本那一份的算法');
});

// ---------- 2. 時間碼 ----------
const OLD_C1 = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
const OLD_C2 = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
const OLD_C2R = (t) => { const r = Math.round(t * 100) / 100; return `${Math.floor(r / 60)}:${(r % 60).toFixed(2).padStart(5, '0')}`; };
test('時間碼：qc fmtT／fmtT2、deliver mmss、build clock／clockOf、audio fmtT、versions fmtT、rough-flow clock、media 的 fmtT／fmtC／fmtS 換成共用版，輸出一樣', async () => {
  const T = await imp('lib/time.mjs');
  const xs = [];
  for (let k = 0; k <= 400000; k++) xs.push(k / 100 - 0.005, k / 100, k / 1000 + 59);
  xs.push(59.95, 59.96, 59.996, 119.995, 3599.999, 0, NaN);
  for (const [old, now] of [[OLD_C1, 'clock1'], [OLD_C2, 'clock2'], [OLD_C2R, 'clock2r']]) {
    const diff = xs.filter((x) => old(x) !== T[now](x));
    assert.deepEqual(diff.slice(0, 5), [], `${now} 和舊的那一份不一樣`);
  }
  const Q = await imp('qc.mjs');
  assert.equal(Q.fmtT(75.25), OLD_C1(75.25));
});

// ---------- 3. media.mjs 只剩入口 ----------
function staticImports(file) {
  const src = fs.readFileSync(file, 'utf8');
  return [...src.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+'([^']+)'/gm)].map((m) => m[1]).filter((s) => s.startsWith('.')).map((s) => path.resolve(path.dirname(file), s));
}
function closure(file, seen = new Set()) {
  if (seen.has(file)) return seen;
  seen.add(file);
  for (const f of staticImports(file)) closure(f, seen);
  return seen;
}
test('C9：rough-flow 不匯入 media.mjs；lib/rough/ 不匯入 media.mjs、彼此沒有循環；只要專案路徑的工具不載入 build.mjs', async () => {
  const MEDIA = path.join(TOOLS, 'media.mjs');
  const rf = path.join(TOOLS, 'lib', 'rough-flow.mjs');
  assert.ok(!/from '\.\.\/media\.mjs'|import\('\.\.\/media\.mjs'\)/.test(fs.readFileSync(rf, 'utf8')), 'rough-flow 不能再整包匯入 media.mjs');
  assert.ok(!closure(rf).has(MEDIA), 'rough-flow 的匯入鏈裡不能有 media.mjs（media.mjs 會動態匯入 rough-flow：循環）');
  const dir = path.join(TOOLS, 'lib', 'rough');
  for (const f of fs.readdirSync(dir)) {
    const file = path.join(dir, f);
    assert.ok(!closure(file).has(MEDIA), `lib/rough/${f} 不能匯入 media.mjs`);
    // 循環：從自己出發走得回自己
    const back = staticImports(file).some((g) => closure(g).has(file));
    assert.ok(!back, `lib/rough/${f} 有循環匯入`);
  }
  for (const t of ['deliver.mjs', 'look.mjs', 'editor.mjs', 'capcut.mjs', 'versions.mjs', 'media.mjs']) {
    const src = fs.readFileSync(path.join(TOOLS, t), 'utf8');
    assert.ok(!/from '\.\/build\.mjs'/.test(src), `${t} 只要 pathsFrom：從 lib/project.mjs 匯入，不要載入整支 build.mjs`);
  }
  const B = await imp('build.mjs'), PJ = await imp('lib/project.mjs');
  for (const k of ['findProject', 'pathsFrom', 'loadLib', 'hasVoiceSource', 'projectLabel']) assert.equal(B[k], PJ[k], `build.mjs 照舊匯出 ${k}（同一個函式）`);
  assert.equal(PJ.pathsFrom({}, process.cwd(), { needProject: false }).templateDir, TEMPLATE, '沒給 --template 時模板＝tools/ 的上一層');
});

// ---------- 4. checkProject ----------
// 小專案：projects/<名稱>/work/{rough.mp4, rough.srt, hyperframes/plan.json}（模板用工作區的）
function makeProject(t) {
  const root = tmpDir(t, 'p3d-check-');
  const project = path.join(root, 'projects', 'p3d');
  const work = path.join(project, 'work'), out = path.join(work, 'hyperframes');
  fs.mkdirSync(out, { recursive: true });
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
    '-t', '20', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', path.join(work, 'rough.mp4')]);
  assert.equal(r.status, 0, String(r.stderr));
  fs.writeFileSync(path.join(work, 'rough.srt'), makeSrt({ n: 5 }));
  const plan = (scenes) => fs.writeFileSync(path.join(out, 'plan.json'), JSON.stringify({ version: 1, speakerBox: [700, 200, 1220, 1000], scenes }, null, 2));
  plan([{ id: 's01', scene: 'concept', from: '#2', to: '#3e', slots: { text: '**場地設定**：一份文件' } }]);
  return { project, plan };
}
const cliCheck = (project, extra = []) => {
  const r = spawnSync(process.execPath, [path.join(TOOLS, 'build.mjs'), '--project', project, '--template', TEMPLATE, '--check', '--json', ...extra], { encoding: 'utf8', maxBuffer: 1 << 28 });
  return { code: r.status, json: JSON.parse(r.stdout), stderr: r.stderr };
};
// 行程內跑、順便確認不印東西
async function inProcess(project, opts) {
  const { checkProject } = await imp('lib/check-project.mjs');
  const said = [];
  const keep = { log: console.log, error: console.error, warn: console.warn, out: process.stdout.write, err: process.stderr.write };
  console.log = console.error = console.warn = (...a) => { said.push(a.join(' ')); };
  process.stdout.write = process.stderr.write = (s) => { said.push(String(s)); return true; };
  try { return { json: checkProject(project, opts), said }; } finally {
    console.log = keep.log; console.error = keep.error; console.warn = keep.warn; process.stdout.write = keep.out; process.stderr.write = keep.err;
  }
}

test('checkProject：和 build.mjs --check --json 印的物件一樣（通過、有 ✖、找不到專案三種），行程內不印東西', async (t) => {
  const { hasFfmpeg } = await import('./helpers.mjs');
  if (!hasFfmpeg()) { t.skip('沒有 ffmpeg'); return; }
  const { project, plan } = makeProject(t);
  const first = cliCheck(project);   // 第一次會做拍點正本遷移、寫偵測快取：兩邊都從第二次開始比
  assert.equal(first.code, 0, first.stderr);
  const a = cliCheck(project), b = await inProcess(project, { template: TEMPLATE });
  assert.equal(a.code, 0);
  assert.equal(b.json.ok, true);
  assert.deepEqual(b.json, a.json);
  assert.deepEqual(b.said, [], '行程內呼叫不能印東西（呼叫端的輸出會被弄亂）');
  // 有 ✖：一樣的錯誤、一樣 ok: false，CLI 結束碼 1
  plan([{ id: 's01', scene: 'concept', from: '#2', slots: { text: '一'.repeat(30) } }]);
  const c = cliCheck(project), d = await inProcess(project, { template: TEMPLATE });
  assert.equal(c.code, 1);
  assert.equal(d.json.ok, false);
  assert.deepEqual(d.json, c.json);
  // 找不到專案：都是 schema 2 的錯誤 JSON
  const nope = path.join(path.dirname(project), 'nope');
  const e = cliCheck(nope), f = await inProcess(nope, { template: TEMPLATE });
  assert.equal(e.code, 1);
  assert.deepEqual(f.json, e.json);
  assert.equal(f.json.schema, 2);
  assert.match(f.json.errors[0], /找不到專案/);
});

// ---------- 5. 字串型 slot 與 plan.moods 的句號 ----------
// 5 句：#N 起點 (N−1)×3.5＋1、長 3 秒；文字各不相同（找詞時不會撞到別句）
const WORDS = ['開場', '剪輯清單', '逐字稿', '字幕檔', '收尾'];
const cues5 = () => [1, 2, 3, 4, 5].map((n) => ({ n, start: (n - 1) * 3.5 + 1, end: (n - 1) * 3.5 + 4, text: `第${n}句講${WORDS[n - 1]}的內容${n}` }));
const planX = () => ({
  version: 1,
  moods: [{ at: '#3@內容3', kind: 'land' }, { at: '#5', kind: 'pain', zoom: true }, { at: '#1', kind: 'quote' }],
  scenes: [
    { id: 'x01', type: 'custom', template: 'x-breakout', from: '#2', to: '#4e',
      slots: { tag: '第 #3 名', openAt: '#3', hitAt: '#3@內容3', path: '#4@字幕檔', flow: '#3e', items: [{ text: '一', noteAt: '#4' }] } },
  ],
});
const x01 = (p) => p.scenes[0].slots;

test('剪輯台分割：字串型 slot（openAt、hitAt、path、flow、清單的 noteAt）和 plan.moods 照和清單 at 同一套換；詞落在後半句的指到後半句；文字裡的 #3 不動', async () => {
  const S = await imp('editor/subtitles.mjs');
  // 第 3 句「第3句講逐字稿的內容3」在第 6 個字切：前半「第3句講逐字」、後半「稿的內容3」
  const p = planX();
  const r = S.replay(cues5(), p, [{ op: 'split', n: 3, at: 9, pos: 6 }]);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(x01(r.plan), { tag: '第 #3 名', openAt: '#3', hitAt: '#4@內容3', path: '#5@字幕檔', flow: '#4e', items: [{ text: '一', noteAt: '#5' }] });
  assert.deepEqual(r.plan.moods, [{ at: '#4@內容3', kind: 'land' }, { at: '#6', kind: 'pain', zoom: true }, { at: '#1', kind: 'quote' }]);
  assert.equal(r.plan.moods[2], p.moods[2], '沒動到的情緒點原樣回傳');
  const p0 = planX(), r0 = S.replay(cues5(), p0, [{ op: 'split', n: 5, at: 16, pos: 2 }]);
  assert.deepEqual(r0.plan.moods.map((m) => m.at), ['#3@內容3', '#5', '#1'], '#5 的起點不變');
});

test('剪輯台合併：字串型 slot、plan.moods 照合併的規則（#(k+1) → #k+差、詞改綁 #k、> k+1 的 −1）', async () => {
  const S = await imp('editor/subtitles.mjs');
  const r = S.replay(cues5(), planX(), [{ op: 'merge', n: 2 }]);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(x01(r.plan), { tag: '第 #3 名', openAt: '#2+3.5', hitAt: '#2@內容3', path: '#3@字幕檔', flow: '#2e', items: [{ text: '一', noteAt: '#3' }] });
  assert.deepEqual(r.plan.moods.map((m) => m.at), ['#2@內容3', '#4', '#1']);
});

test('剪輯台刪句：plan.moods 綁著的也要選改綁；改綁後一句時字串型 slot 和 moods 一起換、綁詞的退成整句', async () => {
  const S = await imp('editor/subtitles.mjs');
  const bad = S.replay(cues5(), planX(), [{ op: 'delete', n: 3 }]);
  assert.match(bad.errors[0], /第 3 句字幕有 plan\.json 的時間綁著：.*moods\[0\]（#3@內容3）/);
  assert.deepEqual(S.refsTo(planX(), 5), [{ id: 'moods[1]', ref: '#5' }]);
  const r = S.replay(cues5(), planX(), [{ op: 'delete', n: 3, bind: 'next' }]);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(x01(r.plan), { tag: '第 #3 名', openAt: '#3', hitAt: '#3', path: '#3@字幕檔', flow: '#3e', items: [{ text: '一', noteAt: '#3' }] });
  assert.deepEqual(r.plan.moods.map((m) => m.at), ['#3', '#4', '#1']);
});

test('srt-align --remap-plan（remapPlanByTime）：字串型 slot 與 plan.moods 照時間換到新句號', async () => {
  const { remapPlanByTime } = await imp('media.mjs');
  const oldCues = cues5();
  // 新字幕：最前面多一句（舊 #N → 新 #N+1，時間不變）
  const newCues = [{ n: 1, start: 0.1, end: 0.8, text: '前言' }, ...oldCues.map((c) => ({ ...c, n: c.n + 1 }))];
  const { plan } = remapPlanByTime(planX(), oldCues, newCues);
  assert.deepEqual(x01(plan), { tag: '第 #3 名', openAt: '#4', hitAt: '#4@內容3', path: '#5@字幕檔', flow: '#4e', items: [{ text: '一', noteAt: '#5' }] });
  assert.deepEqual(plan.moods.map((m) => m.at), ['#4@內容3', '#6', '#2']);
  assert.equal(plan.scenes[0].from, '#3');
});

// ---------- 6. 步驟標記（lib/progress.mjs markStep → work/.jobs/state.json）----------
// 做完那一步才記（--dry-run、--check、--file 指別支都不記）；記的輸入指紋＝那一刻的檔案內容
const ffOk = (args) => { const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...args], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
const stampSrt = (t) => { const ms = Math.round(t * 1000), p = (n, w = 2) => String(n).padStart(w, '0'); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; };
const srtOf = (list) => list.map(([a, b, tx], i) => `${i + 1}\n${stampSrt(a)} --> ${stampSrt(b)}\n${tx}\n`).join('\n');
const quiet = () => {};

test('步驟標記：srt-align、snap-srt、screen-sync 寫完才記一筆（--dry-run 不記），記的是 STEP_INPUTS 那幾個檔當下的指紋', async (t) => {
  const { hasFfmpeg } = await import('./helpers.mjs');
  if (!hasFfmpeg()) { t.skip('沒有 ffmpeg'); return; }
  const M = await imp('media.mjs');
  const { readSteps, fileSig } = await imp('lib/progress.mjs');
  const project = path.join(tmpDir(t, 'p3d-steps-'), 'projects', 'p');
  const work = path.join(project, 'work');
  fs.mkdirSync(path.join(project, 'assets', 'screen'), { recursive: true });
  fs.mkdirSync(work, { recursive: true });
  const P = { project };
  const steps = () => readSteps(project)?.steps ?? {};
  // rough.mp4：1–3、4.2–6.5、7–9 秒有聲音；字幕故意早 1 秒（snap-srt 會調）
  const ranges = [[1, 3], [4.2, 6.5], [7, 9]];
  ffOk(['-f', 'lavfi', '-i', `aevalsrc='0.05*sin(2*PI*220*t)*(${ranges.map(([a, b]) => `between(t,${a},${b})`).join('+')})+0.0005*sin(2*PI*50*t)':s=48000:d=11`,
    '-f', 'lavfi', '-i', 'color=c=black:s=160x90:r=30:d=11', '-shortest', '-c:v', 'libx264', '-c:a', 'aac', '-pix_fmt', 'yuv420p', path.join(work, 'rough.mp4')]);
  fs.writeFileSync(path.join(work, 'rough.srt'), srtOf([[0, 1.9, '第一句，有逗號'], [3.2, 5.2, '第二句'], [6.0, 8.1, '第三句']]));

  M.srtAlign(P, { dryRun: true, log: quiet });
  assert.equal(steps()['srt-align'], undefined, 'srt-align --dry-run 不記');
  M.srtAlign(P, { log: quiet });
  assert.deepEqual(Object.keys(steps()['srt-align'].inputs), ['work/rough.srt']);
  assert.equal(steps()['srt-align'].inputs['work/rough.srt'], fileSig(project, 'work/rough.srt'), '記的是寫回之後的 rough.srt');

  // srt-align 會照停頓調起迄；snap-srt 要有東西可調：把字幕再寫回「早 1 秒」的版本
  fs.writeFileSync(path.join(work, 'rough.srt'), srtOf([[0, 1.9, '第一句，有逗號'], [3.2, 5.2, '第二句'], [6.0, 8.1, '第三句']]));
  M.snapSrt(P, { dryRun: true, log: quiet });
  assert.equal(steps()['snap-srt'], undefined, 'snap-srt --dry-run 不記');
  const r = M.snapSrt(P, { log: quiet });
  assert.equal(r.written, true);
  assert.equal(steps()['snap-srt'].inputs['work/rough.srt'], fileSig(project, 'work/rough.srt'));
  assert.ok(steps()['srt-align'], '記別的步驟不會蓋掉 srt-align 那一筆');
  // 再跑一次（已經對好、沒有要調的）：不寫檔也要記，不然 status 會一直叫人再跑 snap-srt
  const { stepsFile } = await imp('lib/progress.mjs');
  const s = readSteps(project); delete s.steps['snap-srt']; fs.writeFileSync(stepsFile(project), JSON.stringify(s));
  const r2 = M.snapSrt(P, { log: quiet });
  assert.equal(r2.written, false, '第二次沒有要調的');
  assert.ok(steps()['snap-srt'], '沒有要調的也記');

  // screen-sync：main.json 有 kind "screen" 的段＋cuts.v1.json
  ffOk(['-f', 'lavfi', '-i', 'testsrc=size=160x90:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=300:sample_rate=48000', '-t', '8', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(project, 'assets', 'screen', 's.mp4')]);
  fs.writeFileSync(path.join(work, 'main.json'), JSON.stringify({ clips: [{ file: 'assets/screen/s.mp4', kind: 'screen', start: 0, end: 8 }] }));
  fs.writeFileSync(path.join(work, 'cuts.v1.json'), JSON.stringify({ version: '1', source: 'work/main.mp4', chunks: [[0, 90, 1], [90, 120, 99999], [120, 240, 1]] }));
  M.screenSync(P, { dryRun: true, log: quiet });
  assert.equal(steps()['screen-sync'], undefined, 'screen-sync --dry-run 不記');
  M.screenSync(P, { log: quiet });
  assert.ok(fs.existsSync(path.join(work, 'screen-sync.json')));
  assert.equal(steps()['screen-sync'].inputs['work/cuts.v1.json'], fileSig(project, 'work/cuts.v1.json'));
});

test('步驟標記：build 寫完 index.html 記 build（--check 不記）；qc final 寫完 qc-sheet.jpg 記 qc（--file 指別支不記）', async (t) => {
  const { hasFfmpeg } = await import('./helpers.mjs');
  if (!hasFfmpeg()) { t.skip('沒有 ffmpeg'); return; }
  const { readSteps, fileSig } = await imp('lib/progress.mjs');
  const { project } = makeProject(t);
  const steps = () => readSteps(project)?.steps ?? {};
  const tool = (f, args) => spawnSync(process.execPath, [path.join(TOOLS, f), ...args, '--project', project, '--template', TEMPLATE], { encoding: 'utf8', maxBuffer: 1 << 28, env: { ...process.env, AUTO_EDIT_NO_LOCAL_SFX: '1' } });
  assert.equal(cliCheck(project).code, 0);
  assert.equal(steps().build, undefined, '--check 不寫 index.html，不記');
  // qc final：final.mp4 用 rough.mp4 充當；--file 指別支不記
  fs.mkdirSync(path.join(project, 'output'), { recursive: true });
  fs.copyFileSync(path.join(project, 'work', 'rough.mp4'), path.join(project, 'output', 'other.mp4'));
  let q = tool('qc.mjs', ['final', '--no-captions', '--file', path.join(project, 'output', 'other.mp4')]);
  assert.ok(fs.existsSync(path.join(project, 'output', 'qc', 'qc-sheet.jpg')), q.stdout + q.stderr);
  assert.equal(steps().qc, undefined, '--file 指別支：不是這個專案的 final.mp4，不記');
  fs.copyFileSync(path.join(project, 'work', 'rough.mp4'), path.join(project, 'output', 'final.mp4'));
  q = tool('qc.mjs', ['final', '--no-captions']);
  assert.ok(steps().qc, q.stdout + q.stderr);
  assert.equal(steps().qc.inputs['output/final.mp4'], fileSig(project, 'output/final.mp4'));
  // build
  const b = tool('build.mjs', []);
  assert.equal(b.status, 0, b.stdout + b.stderr);
  assert.ok(fs.existsSync(path.join(project, 'work', 'hyperframes', 'index.html')));
  assert.equal(steps().build.inputs['work/hyperframes/plan.json'], fileSig(project, 'work/hyperframes/plan.json'));
  assert.ok(steps().qc, '記 build 不會蓋掉 qc 那一筆');
});
