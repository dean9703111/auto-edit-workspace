// audit.mjs：平行工人（--only 互相不擋）、一條指令夠用（--check 的 ⚠、--shots --sheet）、併發量測（--jobs 和循序一樣）
import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { imp, hasChrome, makeSrt, TEMPLATE, TOOLS } from './helpers.mjs';

const A = await imp('audit.mjs');
const R = await imp('lib/audit-rules.mjs');
const RS = await imp('lib/raster.mjs');
const CHROME = await hasChrome();
const TMP = [];
after(() => { for (const d of TMP) fs.rmSync(d, { recursive: true, force: true }); });
const ffmpeg = (args) => { const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...args], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
const dims = (f) => spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f], { encoding: 'utf8' }).stdout.trim();

// ---------- 純函式 ----------

test('gateCheck：沒有 --only 每個 ✖ 都擋；有 --only 只有指名段與全域的 ✖ 擋，其他段算個數', () => {
  const res = { errors: ['全域錯', '[x01 custom] 壞了', '[x01 custom] 又壞', '[x03 custom] 這段壞了'], allItems: [
    { id: 'x01', errors: ['[x01 custom] 壞了', '[x01 custom] 又壞'] }, { id: 'x03', errors: ['[x03 custom] 這段壞了'] }, { id: 's02', errors: [] }] };
  assert.deepEqual(R.gateCheck(res), { fatal: res.errors, others: 0, otherIds: [] });
  assert.deepEqual(R.gateCheck(res, ['s02']), { fatal: ['全域錯'], others: 3, otherIds: ['x01', 'x03'] });
  assert.deepEqual(R.gateCheck(res, ['x03']), { fatal: ['全域錯', '[x03 custom] 這段壞了'], others: 2, otherIds: ['x01'] });
  assert.deepEqual(R.gateCheck({ errors: [], allItems: [] }, ['x03']), { fatal: [], others: 0, otherIds: [] });
  // 不在 it.errors、但訊息開頭寫明段 id（build 另外查的，例 14 講者介紹）：算那一段的；不認得的 id 當全域
  const sp = { errors: ['[s14 speaker] 講者介紹：設定成不放講者介紹', '[zz] 怪訊息'], allItems: [{ id: 's14', errors: [] }, { id: 'x03', errors: [] }] };
  assert.deepEqual(R.gateCheck(sp, ['x03']), { fatal: ['[zz] 怪訊息'], others: 1, otherIds: ['s14'] });
  assert.deepEqual(R.gateCheck(sp, ['s14']).fatal, sp.errors);
});

test('splitPageErrors：其他段的 script、綁句錯誤濾掉算個數，這段的與對不到段的留著', () => {
  const others = [{ id: 'x01', compId: 'x-a', file: 'compositions/x-a.html', type: 'custom' }];
  const r = A.splitPageErrors({
    errors: [{ text: '[HyperFrames] composition script error: x-a Error: boom' }, { text: '[HyperFrames] composition script error: x-b Error: mine' }, { text: 'ReferenceError: foo' }],
    cueErrs: ["x-a P.at('#9')：字幕沒有第 9 句", "x-b P.at('#9')：字幕沒有第 9 句"], others });
  assert.deepEqual(r.errors.map((e) => e.text), ['[HyperFrames] composition script error: x-b Error: mine', 'ReferenceError: foo']);
  assert.deepEqual(r.cueErrs, ["x-b P.at('#9')：字幕沒有第 9 句"]);
  assert.equal(r.others, 2);
  assert.deepEqual(r.otherIds, ['x01']);
});

test('jobsOf／parseArgs：--jobs 1–8，預設 4；--sheet、--verbose 是開關', () => {
  assert.equal(A.jobsOf(undefined), 4);
  assert.equal(A.jobsOf('2'), 2);
  assert.throws(() => A.jobsOf('0'), /--jobs 要是 1–8 的整數，現在是「0」→ 改成 1–8/);
  assert.throws(() => A.jobsOf('abc'), /--jobs 要是 1–8 的整數/);
  assert.deepEqual(A.parseArgs(['--only', 'x01', '--sheet', '--verbose', '--jobs', '3']), { only: 'x01', sheet: true, verbose: true, jobs: '3' });
});

test('formatReport：預設安靜（不印全表、節奏備註與範例原文各併一行）；--verbose 才印；有 --only 不叫工人跑 snapshot', () => {
  const seg = { id: 'x01', label: 'custom x-a.html', layout: 'fullscreen', samples: [{ t: 3, kind: 'done', moving: 0 }], errors: 0, warns: 1 };
  const f = { id: 'x01', label: 'custom x-a.html', level: 'warn', rule: 'hold', el: null, at: [3], t: 3, msg: '完成態停太短', fix: '改' };
  const base = { project: 'projects/p', errors: [], warnings: [], notes: ['x01：沒有 P.at 綁句，完成態停留不檢查', '不量 x02（compositions/x-b.html 還是範例原文、還沒做 → 照 auto-edit-motion 改完再量）', '不量 x03（compositions/x-c.html 還是範例原文、還沒做 → 照 auto-edit-motion 改完再量）'], findings: [f], segments: [seg] };
  const q = A.formatReport(base);
  assert.doesNotMatch(q, /id｜情境｜版型/);
  assert.doesNotMatch(q, /沒有 P\.at 綁句/);
  assert.match(q, /^節奏沒檢查 1 段（x01）→ --verbose 看原因$/m);
  assert.match(q, /^不量 2 段（還是範例原文、還沒做）：x02、x03$/m);
  assert.match(q, /⚠ \[x01 custom x-a\.html\].*完成態停太短/);
  assert.match(q, /通過：1 段，1 個提醒（⚠）/);
  assert.match(q, /看畫面：cd projects\/p\/work\/hyperframes && npx hyperframes snapshot --at 3 /);
  const v = A.formatReport(base, { verbose: true });
  assert.match(v, /^id｜情境｜版型｜量測時間｜結果$/m);
  assert.match(v, /沒有 P\.at 綁句/);
  // 工人（--only）：其他段一行、這段的 --check 一行與 ⚠；不能跑 snapshot，看圖用 --shots --sheet
  const w = A.formatReport({ ...base, notes: [], only: ['x01'], others: { errors: 3, ids: ['x09'] }, checkRows: ['x01｜custom x-a.html｜0:10.00–0:18.00｜8s｜—｜⚠ 1（綁句 2 個（#3、#4））'], checkWarnings: ['[x01 custom] P.at 在段外'] });
  assert.match(w, /^其他段有 3 個 ✖（不影響這段）$/m);
  assert.match(w, /^x01｜custom x-a\.html｜.*綁句 2 個/m);
  assert.match(w, /^⚠ \[x01 custom\] P\.at 在段外$/m);
  assert.match(w, /通過：1 段，2 個提醒（⚠）/);
  assert.doesNotMatch(w, /snapshot --at/);
  assert.match(w, /要看畫面：這條加 --shots --sheet/);
  // --sheet：只印拼圖那張；--verbose 才列每張
  const sh = { ...base, shots: ['a/x01-3.00.jpg', 'a/x01-5.00.jpg'], sheets: [{ id: 'x01', file: 'a/sheet-x01.jpg', count: 2 }] };
  const so = A.formatReport(sh);
  assert.match(so, /a\/sheet-x01\.jpg（2 格）/);
  assert.doesNotMatch(so, /x01-3\.00\.jpg/);
  assert.match(A.formatReport(sh, { verbose: true }), /x01-3\.00\.jpg/);
  // 長片的 --shots：不一張一張列
  const many = A.formatReport({ ...base, shots: Array.from({ length: 40 }, (_, i) => `a/x01-${i}.jpg`) });
  assert.match(many, /…（共 40 張，都在 a；--verbose 全列，或加 --sheet 拼成一張）/);
  assert.doesNotMatch(many, /x01-20\.jpg/);
});

test('poolOn：併發上限、結果照原順序、丟錯就停', async () => {
  let cur = 0, peak = 0;
  const out = await RS.pool([5, 1, 3, 2, 4], 2, async (v) => { cur++; peak = Math.max(peak, cur); await new Promise((r) => setTimeout(r, v * 3)); cur--; return v * 10; });
  assert.deepEqual(out, [50, 10, 30, 20, 40]);
  assert.equal(peak, 2);
  await assert.rejects(RS.poolOn(['w1', 'w2'], [1, 2, 3], async (w, v) => { if (v === 2) throw new Error('壞了'); return v; }), /壞了/);
  assert.deepEqual(await RS.pool([], 4, async (v) => v), []);
});

test('contactSheet：格子數、欄數決定頁高；字會跳脫', () => {
  const p = RS.contactSheet({ title: '<標題>', cells: Array.from({ length: 5 }, (_, i) => ({ src: `a${i}.png`, time: '0:01.00', id: 's01', text: '為什麼 <b>' })), cols: 4, tile: [472, 266] });
  assert.equal(p.height, 40 + 2 * (266 + 52));
  assert.equal(p.width, 1920);
  assert.match(p.html, /&lt;標題&gt;/);
  assert.match(p.html, /為什麼 &lt;b&gt;/);
  assert.equal((p.html.match(/class="c"/g) || []).length, 5);
});

// ---------- 真的開 Chrome ----------

const custom = (name, { script = '', top = 150 } = {}) => `<!doctype html><html><head><meta charset="UTF-8"><title>${name} 測試</title></head><body>
<template id="${name}-template">
  <style>
    #${name} { position: absolute; inset: 0; }
    #${name} .row { position: absolute; left: 120px; width: 700px; height: 120px; background: #FFFFFF; color: #141414; font-size: 60px; }
    #${name} #${name}-a { top: ${top}px; } #${name} #${name}-b { top: ${top + 180}px; }
  </style>
  <div id="${name}" data-composition-id="${name}" data-width="1920" data-height="1080" data-duration="6">
    <div class="sc-surface-fs" style="position: absolute; inset: 0;"></div>
    <div class="row" id="${name}-a">第一站</div><div class="row" id="${name}-b">第二站</div>
  </div>
  <script>
  (function () {
    const tl = gsap.timeline({ paused: true });
    const P = SceneMotion(tl, document.getElementById('${name}'));
    ${script}
    P.pop('#${name}-a', 0.3); P.pop('#${name}-b', 1.5);
    P.end();
    window.__timelines['${name}'] = tl;
  })();
  </script>
</template></body></html>`;

function fixture(n = 4) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-audit-par-'));
  TMP.push(root);
  fs.mkdirSync(path.join(root, 'shared', 'sfx'), { recursive: true });
  fs.symlinkSync(TEMPLATE, path.join(root, 'shared', 'template'), 'dir');
  for (const k of Object.keys(JSON.parse(fs.readFileSync(path.join(TEMPLATE, 'kit', 'sfx.json'), 'utf8')))) fs.copyFileSync(path.join(TEMPLATE, '..', 'sfx', 'ding.wav'), path.join(root, 'shared', 'sfx', `${k}.wav`));
  const proj = path.join(root, 'projects', 'p1'), out = path.join(proj, 'work', 'hyperframes');
  fs.mkdirSync(path.join(out, 'compositions'), { recursive: true });
  ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '46', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(proj, 'work', 'rough.mp4')]);
  fs.writeFileSync(path.join(proj, 'work', 'rough.srt'), makeSrt({ n: 12 }));   // #N 起點 (N−1)×3.5＋1
  const scenes = [];
  for (let i = 0; i < n; i++) {
    const name = `x-seg${i + 1}`, id = `x0${i + 1}`;
    fs.writeFileSync(path.join(out, 'compositions', `${name}.html`), custom(name));
    scenes.push({ id, type: 'custom', src: `compositions/${name}.html`, layout: 'fullscreen', from: `#${i * 3 + 1}`, to: `#${i * 3 + 2}e` });
  }
  fs.writeFileSync(path.join(out, 'plan.json'), JSON.stringify({ version: 1, look: false, check: { textSync: false }, speakerBox: [400, 80, 900, 700], scenes }));
  const tool = (t) => (...args) => spawnSync(process.execPath, [path.join(TOOLS, t), ...args, '--project', 'projects/p1'], { encoding: 'utf8', cwd: root });
  return { root, proj, out, audit: tool('audit.mjs'), build: tool('build.mjs') };
}

let F = null;
before(() => {
  if (!CHROME) return;
  F = fixture();
  const b = F.build();
  assert.equal(b.status, 0, b.stdout + b.stderr);
});
const xPath = (name) => path.join(F.out, 'compositions', `${name}.html`);
const withFile = (name, html, fn) => { const f = xPath(name), old = fs.readFileSync(f, 'utf8'); fs.writeFileSync(f, html); try { return fn(); } finally { fs.writeFileSync(f, old); } };

test('平行工人回歸：x01 的 #N@詞 對不上（工人 A 改到一半），x02 的 audit --only 照常量；--only x01 與全片才擋', { skip: !CHROME && '沒有 HyperFrames 的 Chrome，略過', timeout: 180000 }, () => {
  const bad = custom('x-seg1', { script: "const T1 = P.at('#2@不存在的詞');" });
  withFile('x-seg1', bad, () => {
    // 工人 B：照常量，只多一行其他段
    let r = F.audit('--only', 'x02');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /^其他段有 1 個 ✖（不影響這段）$/m);
    assert.doesNotMatch(r.stdout, /不存在的詞/, '別段的錯誤原文不印');
    assert.doesNotMatch(r.stdout, /plan\.json/, '不叫工人改他不能碰的 plan.json');
    assert.match(r.stdout, /通過：1 段/);
    assert.match(r.stdout, /量 1 段（--only x02）/);
    const j = JSON.parse(F.audit('--only', 'x02', '--json').stdout);
    assert.equal(j.ok, true);
    assert.equal(j.segments.length, 1);
    assert.ok(j.segments[0].samples.length >= 2, '指名段要真的量到');
    assert.deepEqual(j.others, { errors: 1, ids: ['x01'] });
    // 工人 A 自己：擋下來，訊息是他能改的
    r = F.audit('--only', 'x01');
    assert.equal(r.status, 1);
    assert.match(r.stdout, /✖ build --check：\[x01 custom\].*不存在的詞/);
    assert.match(r.stdout, /✖ --only x01 量不了（上面是這段或全域的 ✖）→ 照 → 後面的建議改；custom 檔的問題改完直接重跑這條（不用 build）/);
    // 全片（主代理）：照舊，任何 ✖ 都擋
    r = F.audit();
    assert.equal(r.status, 1);
    assert.match(r.stdout, /build --check 有 ✖ → 先照 → 後面的建議改好 plan\.json、重跑 build，再 audit/);
  });
});

test('平行工人回歸：x01 的 script 丟錯、檔案寫到一半（只有前半）→ x02 照量，頁面錯誤只算進「其他段」；全域 ✖ 還是擋', { skip: !CHROME && '沒有 HyperFrames 的 Chrome，略過', timeout: 180000 }, () => {
  withFile('x-seg1', custom('x-seg1', { script: "throw new Error('工人 A 改到一半');" }), () => {
    const j = JSON.parse(F.audit('--only', 'x02', '--json').stdout);
    assert.equal(j.ok, true, JSON.stringify(j.errors));
    assert.equal(j.warnings.length, 0, j.warnings.join('\n'));
    assert.deepEqual(j.others, { errors: 1, ids: ['x01'] });
    assert.deepEqual(JSON.parse(F.audit('--only', 'x01', '--json').stdout).findings.filter((f) => f.rule === 'script').map((f) => f.id), ['x01'], '指名段自己的 script 錯誤照樣 ✖');
  });
  withFile('x-seg1', custom('x-seg1').slice(0, 300), () => {
    const j = JSON.parse(F.audit('--only', 'x02', '--json').stdout);
    assert.equal(j.ok, true, JSON.stringify(j.errors));
    assert.ok(j.others.errors >= 1);
    assert.deepEqual(j.others.ids, ['x01']);
  });
  // x01 的檔整個不見（工人 A 正在換檔）：x02 照量
  const gone = xPath('x-seg1'), keep = fs.readFileSync(gone, 'utf8');
  fs.rmSync(gone);
  try {
    const j = JSON.parse(F.audit('--only', 'x02', '--json').stdout);
    assert.equal(j.ok, true, JSON.stringify(j.errors));
    assert.deepEqual(j.others.ids, ['x01']);
    assert.ok(j.segments[0].samples.length >= 2);
  } finally { fs.writeFileSync(gone, keep); }
  // 別段的 from 寫錯（排不上時間軸）：指名段照量，時間軸還在
  const planF = path.join(F.out, 'plan.json'), plan0 = fs.readFileSync(planF, 'utf8');
  const pj = JSON.parse(plan0);
  pj.scenes[0].from = '#999';
  fs.writeFileSync(planF, JSON.stringify(pj));
  try {
    const j = JSON.parse(F.audit('--only', 'x02', '--json').stdout);
    assert.equal(j.ok, true, JSON.stringify(j.errors));
    assert.deepEqual(j.others, { errors: 1, ids: ['x01'] });
    assert.ok(j.segments[0].samples.length >= 2);
    assert.ok(j.warnings.some((w) => /plan\.json 比 index\.html 新/.test(w)));
  } finally { fs.writeFileSync(planF, plan0); }
  // 全域的 ✖（plan.json 第一層）：指名段也量不了
  const plan = path.join(F.out, 'plan.json'), old = fs.readFileSync(plan, 'utf8');
  fs.writeFileSync(plan, JSON.stringify({ ...JSON.parse(old), rhythm: 'nope' }));
  try {
    const r = F.audit('--only', 'x02');
    assert.equal(r.status, 1);
    assert.match(r.stdout, /✖ build --check：rhythm 只能是/);
  } finally { fs.writeFileSync(plan, old); }
});

test('一條指令夠用：--only 印這段的 --check 一行與 ⚠；--shots --sheet 拼成一張、只印那張；舊圖清掉；工人各寫各的檔', { skip: !CHROME && '沒有 HyperFrames 的 Chrome，略過', timeout: 180000 }, () => {
  // 綁在段外（段起點之前）的 P.at → --check 的 ⚠
  withFile('x-seg2', custom('x-seg2', { script: "const T9 = P.at('#3');" }), () => {
    const r = F.audit('--only', 'x02', '--shots', '--sheet');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /^x02｜custom x-seg2\.html｜0:11\.50–0:18\.00｜6\.5s｜.*綁句 1 個（#3）/m);
    assert.match(r.stdout, /^⚠ \[x02 custom\] P\.at\('#3'\) 在 .*不在這段/m);
    const sheet = path.join(F.proj, 'work', 'audit-shots', 'sheet-x02.jpg');
    assert.ok(fs.existsSync(sheet));
    assert.match(r.stdout, /截圖拼成一張（每格標時間；.*\n\s+projects\/p1\/work\/audit-shots\/sheet-x02\.jpg（\d+ 格）/);
    assert.doesNotMatch(r.stdout, /x02-\d+\.\d\d\.jpg/, '不一張一張列');
    assert.match(dims(sheet), /^1920,\d+$/);
    assert.ok(!fs.readdirSync(path.dirname(sheet)).some((f) => f.endsWith('.html')), '排版用的 html 要清掉');
  });
  // 舊圖：時間變了的檔不留
  const dir = path.join(F.proj, 'work', 'audit-shots');
  fs.writeFileSync(path.join(dir, 'x02-99.99.jpg'), 'old');
  fs.writeFileSync(path.join(dir, 'x03-99.99.jpg'), 'old');
  const j = JSON.parse(F.audit('--only', 'x02', '--shots', '--json').stdout);
  assert.ok(j.shots.length >= 2);
  assert.ok(!fs.existsSync(path.join(dir, 'x02-99.99.jpg')), '這段的舊圖清掉');
  assert.ok(fs.existsSync(path.join(dir, 'x03-99.99.jpg')), '別段的不動（平行工人）');
  assert.equal(j.sheets, undefined);
});

test('--jobs：併發和循序的順序與內容一樣（findings、segments、shots、notes、warnings）', { skip: !CHROME && '沒有 HyperFrames 的 Chrome，略過', timeout: 240000 }, () => {
  const run = (jobs) => {
    const r = F.audit('--jobs', String(jobs), '--json', '--shots');
    assert.ok(r.stdout.startsWith('{'), r.stdout + r.stderr);
    const j = JSON.parse(r.stdout);
    delete j.elapsed;
    return j;
  };
  const seq = run(1), par = run(4);
  assert.equal(seq.segments.length, 4);
  assert.ok(seq.shots.length >= 8);
  assert.deepEqual(par, seq);
  // 第二次循序也一樣（不是剛好）
  assert.deepEqual(run(1), seq);
  const bad = F.audit('--jobs', '99');
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /--jobs 要是 1–8 的整數，現在是「99」/);
  // 預設安靜：沒有全表；--verbose 才有
  const quiet = F.audit();
  assert.doesNotMatch(quiet.stdout, /id｜情境｜版型/);
  assert.match(quiet.stdout, /通過：4 段/);
  assert.match(F.audit('--verbose').stdout, /^id｜情境｜版型｜量測時間｜結果$/m);
});
