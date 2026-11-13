// 032 W2a：回饋輪少走幾步（use 沒開輪一次做完、compare、new 自己開輪記停點、begin --requests／finish 回報剪輯台）、finish 的回報段與停手、
// editor.mjs 的 ensureEditor、剪輯台與 AI 同時寫的三個檔改用 writeAtomic
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { TOOLS, TEMPLATE, imp, makeSrt } from './helpers.mjs';

const V = await imp('versions.mjs');
const E = await imp('editor.mjs');
const { pathsFrom } = await imp('build.mjs');
const { readStopLog } = await imp('status.mjs');
const { progressFile } = await imp('lib/progress.mjs');
const { stopLines } = await imp('lib/stops.mjs');
const { REPORT_HEAD } = await imp('lib/say.mjs');
const { MAIN_TRY_MAX } = await imp('lib/tries.mjs');

const RUN = (...a) => spawnSync(process.execPath, [path.join(TOOLS, 'versions.mjs'), ...a], { encoding: 'utf8' });
const ffmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
const touch = (p, rel, text = 'x', ageSec = 0) => {
  const f = path.join(p, ...rel.split('/'));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
  const t = new Date(Date.now() - ageSec * 1000);
  fs.utimesSync(f, t, t);
};
const read = (p, rel) => fs.readFileSync(path.join(p, ...rel.split('/')), 'utf8');
const stops = (p) => readStopLog(fs.readFileSync(progressFile(p), 'utf8')).rows;
const sectionOf = (md, title) => md.split(new RegExp(`^## ${title}\\s*$`, 'm'))[1]?.split(/^## /m)[0] ?? '';
const X1 = '<template id="x-a"><div class="t">主持人跟來賓</div><div data-illus-src="illus-local/router.svg"></div></template>\n';
// 故意不是 JSON.stringify(…, 2) 的排版：換回去要逐位元組一樣，不是重新排版
const planText = (to = '#1e') => `{"version": 1,\n "scenes": [\n  {"id": "s05", "scene": "quote", "from": "#1", "to": "#1e", "slots": {"text": "小毛病"}},\n  {"id": "s12", "type": "custom", "src": "compositions/x-a.html", "layout": "fullscreen", "from": "#1", "to": "${to}"}\n ]}\n`;

function mk(t) {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-032w2a-'));
  t.after(() => fs.rmSync(p, { recursive: true, force: true }));
  for (const d of ['camera', 'voice', 'screen', 'images']) fs.mkdirSync(path.join(p, 'assets', d), { recursive: true });
  touch(p, 'work/rough.srt', makeSrt({ n: 5 }), 600);
  touch(p, 'work/storyboard.md', '# 分鏡表\n\n### s05｜金句\n- 金句\n\n### s12｜x-a\n- 對比卡\n', 300);
  touch(p, 'work/hyperframes/plan.json', planText(), 60);
  touch(p, 'work/hyperframes/compositions/x-a.html', X1, 60);
  touch(p, 'work/hyperframes/illus-local/router.svg', '<svg id="r1"/>', 60);
  return p;
}
const editPlan = (p, fn) => { const f = path.join(p, 'work', 'hyperframes', 'plan.json'); const j = JSON.parse(fs.readFileSync(f, 'utf8')); fn(j); fs.writeFileSync(f, JSON.stringify(j, null, 2) + '\n'); };
// finish 的真工具換掉（同 feedback-round.test.mjs）
function stepsOf(over = {}) {
  const calls = { build: 0, audit: [] };
  const steps = {
    build() { calls.build++; return { ok: true, out: '人聲響度 −21.8 LUFS → −14 LUFS\n音效比例：這支片沒有音效' }; },
    check(P) { return { ok: true, format: 'landscape', items: JSON.parse(fs.readFileSync(P.plan, 'utf8')).scenes.map((s, i) => ({ id: s.id, type: s.type === 'custom' ? 'custom' : 'scene', out: { start: i * 4, end: i * 4 + 3 } })) }; },
    audit(P, f, ids) { calls.audit.push(ids); return { ok: true, errors: [], warnings: [], findings: [], shots: [] }; },
    snapshot() { return []; },
    editor() { return 'http://127.0.0.1:4400/?view=final'; },
    prerender() {},
    sheet(P, shots, out) { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, 'x'); return out; },
    ...over,
  };
  return { steps, calls };
}

test('A5 use：沒有開著的回饋輪 → begin → use → finish 一次做完（原話預設「<段> 用 <版>」）；版本不對先擋、不開輪', (t) => {
  const p = mk(t);
  const P = pathsFrom({ project: p });
  V.saveSeg(P, {}, 's12', () => {});
  touch(p, 'work/hyperframes/compositions/x-a.html', X1.replace('主持人跟來賓', '第二版'));
  V.saveSeg(P, {}, 's12', () => {});
  assert.throws(() => V.useAndFinish(P, {}, 's12', 'v9', () => {}, stepsOf().steps), /s12 沒有做完的 v9（有：v1、v2）→/);
  assert.equal(V.openRound(p), null, '版本不對：沒有開輪');
  assert.equal(fs.existsSync(path.join(p, 'work', 'feedback', 'r1.md')), false);
  const log = [];
  const { steps, calls } = stepsOf();
  const r = V.useAndFinish(P, {}, 's12', 'v1', (l) => log.push(l), steps);
  assert.equal(r.ok, true);
  assert.equal(calls.build, 1, 'finish 也跑了');
  assert.equal(read(p, 'work/hyperframes/compositions/x-a.html'), X1, '換回 v1');
  assert.deepEqual(r.versions[0], { id: 's12', before: 2, after: 1, compare: null });
  assert.match(sectionOf(read(p, 'work/feedback/r1.md'), '原話'), /「s12 用 v1」/);
  assert.deepEqual(stops(p).map((x) => [x.stop, x.state]), [['④ 完成影片預覽', '待回覆']]);
  assert.equal(V.openRound(p), null, 'finish 完：這輪關了');
  assert.equal(log.slice(-2).join('\n'), stopLines.final('http://127.0.0.1:4400/?view=final'));
  // CLI：--said 收得到；回饋輪開著時只換回去、接 finish
  V.beginRound(P, {}, ['s12'], 's12 用 v2', () => {});
  const L = RUN('use', '--project', p, '--seg', 's12', '--ver', 'v2', '--said', '用第二版').stdout.trim().split('\n');
  assert.equal(L.at(-1), `node shared/template/tools/versions.mjs finish --project ${p}`);
  assert.equal(V.openRound(p).n, 2);
});

test('A5 compare：兩版各補預覽（另一版暫時換上）、出比較影片、plan.json 與動畫檔逐位元組換回、build 一次；都有預覽就不重做', (t) => {
  const p = mk(t);
  const P = pathsFrom({ project: p });
  V.saveSeg(P, {}, 's12', () => {});                                   // v1
  const v2Plan = planText('#2e'), X2 = X1.replace('主持人跟來賓', '第二版');
  touch(p, 'work/hyperframes/plan.json', v2Plan);
  touch(p, 'work/hyperframes/compositions/x-a.html', X2);
  const seen = [], clips = [];
  let builds = 0;
  const steps = {
    preview(P2, flags, id, dir) {
      seen.push({ v: path.basename(dir), to: JSON.parse(fs.readFileSync(P2.plan, 'utf8')).scenes[1].to, x: read(p, 'work/hyperframes/compositions/x-a.html') });
      fs.writeFileSync(path.join(dir, '預覽.mp4'), 'mp4');
      return true;
    },
    clip(a, b, out, labels) { clips.push({ a, b, labels }); fs.writeFileSync(out, 'cmp'); },
    build() { builds++; return { ok: true }; },
  };
  const log = [];
  const r = V.compareVersions(P, {}, 's12', (l) => log.push(l), {}, steps);
  assert.equal(r.ok, true);
  assert.deepEqual(seen, [{ v: 'v2', to: '#2e', x: X2 }, { v: 'v1', to: '#1e', x: X1 }], '目前用的 v2 先做；v1 暫時換上 plan.json 那段與動畫檔');
  assert.equal(read(p, 'work/hyperframes/plan.json'), v2Plan, 'plan.json 逐位元組回到跑之前');
  assert.equal(read(p, 'work/hyperframes/compositions/x-a.html'), X2);
  assert.equal(builds, 1, '換回之後 build 一次');
  assert.deepEqual(clips.map((c) => [path.basename(path.dirname(c.a)), path.basename(path.dirname(c.b)), c.labels]), [['v1', 'v2', ['v1', 'v2']]], '版號小的在左');
  assert.equal(r.file, path.resolve(p, 'work', 'versions', 's12', '比較-v1-v2.mp4'));
  assert.ok(log.includes(`比較：${r.file}（左 v1、右 v2，聲音用 v2）`), '印完整路徑');
  // 都有預覽：不換、不 build、不重出
  seen.length = 0;
  const again = V.compareVersions(P, {}, 's12', () => {}, {}, steps);
  assert.equal(again.ok, true);
  assert.deepEqual([seen.length, builds, clips.length], [0, 1, 1]);
  // 指定 --a／--b：照給的左右
  assert.equal(V.compareVersions(P, {}, 's12', () => {}, { a: 'v2', b: 'v1' }, steps).file, path.resolve(p, 'work', 'versions', 's12', '比較-v2-v1.mp4'));
  assert.throws(() => V.compareVersions(P, {}, 's12', () => {}, { a: 'v1', b: 'v1' }, steps), /同一版（v1）→/);
  assert.throws(() => V.compareVersions(P, {}, 's05', () => {}, {}, steps), /s05 只有 v1 一版，沒有可以比的 →/);
  // 預覽做不出來：照樣換回去
  fs.rmSync(path.join(p, 'work', 'versions', 's12', 'v1', '預覽.mp4'));
  const bad = V.compareVersions(P, {}, 's12', () => {}, {}, { ...steps, preview: () => false });
  assert.equal(bad.ok, false);
  assert.equal(read(p, 'work/hyperframes/plan.json'), v2Plan);
  assert.equal(read(p, 'work/hyperframes/compositions/x-a.html'), X2);
  // CLI：--help、指令名稱
  assert.match(RUN('--help').stdout, /versions\.mjs compare --project .* --seg s12 \[--a v1 --b v2\]/);
});

test('A5 compare（ffmpeg）：真的拼出左右並排的比較影片', { skip: !ffmpeg && '沒有 ffmpeg' }, (t) => {
  const p = mk(t);
  const P = pathsFrom({ project: p });
  V.saveSeg(P, {}, 's12', () => {});
  touch(p, 'work/hyperframes/compositions/x-a.html', X1.replace('主持人跟來賓', '第二版'));
  const color = { v1: 'red', v2: 'blue' };
  const preview = (P2, flags, id, dir) => spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `color=c=${color[path.basename(dir)]}:s=640x360:r=30:d=1`, '-f', 'lavfi', '-i', 'sine=f=440:d=1', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', path.join(dir, '預覽.mp4')]).status === 0;
  const r = V.compareVersions(P, {}, 's12', () => {}, {}, { preview, build: () => ({ ok: true }) });
  assert.equal(r.ok, true);
  const size = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=width', '-of', 'csv=p=0', r.file], { encoding: 'utf8' }).stdout.trim();
  assert.equal(size, '640', '兩格各半寬');
});

test('A5 new：沒開輪就自己開（原話用 --note）、記停點 ③（<段> v<N>）待回覆、最後兩行是 stopLines.revise；沒給原話 ✖', (t) => {
  const p = mk(t);
  const none = RUN('new', '--project', p, '--seg', 's12');
  assert.equal(none.status, 1);
  assert.match(none.stderr, /沒有開著的回饋輪：new 會自己開一輪，要記使用者原話 → 加 --note/);
  assert.equal(fs.existsSync(path.join(p, 'work', 'versions', 's12', 'v2')), false, '出錯什麼都不開');
  const r = RUN('new', '--project', p, '--seg', 's12', '--note', '「s12 重新設計」');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(V.openRound(p).n, 1);
  assert.match(sectionOf(read(p, 'work/feedback/r1.md'), '原話'), /「s12 重新設計」/);
  const L = r.stdout.trim().split('\n');
  assert.equal(L.slice(-2).join('\n'), stopLines.revise('③ 分鏡表（s12 v2）', path.join(p, 'work', 'versions', 's12', 'v2', '分鏡.md')));
  assert.ok(!r.stdout.includes('status.mjs --mark'), '不用 AI 另外記停點');
  assert.deepEqual(stops(p).map((x) => [x.label, x.state]), [['③ 分鏡表（s12 v2）', '待回覆']]);
  assert.match(fs.readFileSync(progressFile(p), 'utf8'), /\| ③ 分鏡表（s12 v2） \| 待回覆 \| — \| work\/versions\/s12\/v2\/分鏡\.md \|/);
  // 再跑一次：沿用提案、輪不重開、停點不重記
  const again = RUN('new', '--project', p, '--seg', 's12', '--note', '再一次');
  assert.equal(again.status, 0, again.stderr);
  assert.equal(V.openRound(p).n, 1);
  assert.equal(stops(p).length, 1);
});

test('A5 begin --requests／finish：修改單的段自動開輪、標「生成中」；finish 改到的標「已改完」、沒改到的標「失敗」（理由取 r<N>.md 那一列）', (t) => {
  const p = mk(t);
  const P = pathsFrom({ project: p });
  assert.match(RUN('begin', '--project', p, '--requests').stderr, /還沒有剪輯台修改單（work\/feedback\/editor-requests\.md） →/);
  const REQ = ['# 剪輯台修改單', '', '照剪輯台修改單改這 3 段', '', '## 1. s05　金句', '- 要改：文字少一點', '', '## 2. s12　custom x-a.html', '- 要改：更有質感', '', '## 3. t1095', '- 這裡現在沒有段落：照時間和字幕新增一段', ''].join('\n');
  touch(p, 'work/feedback/editor-requests.md', REQ, 120);
  const b = RUN('begin', '--project', p, '--requests');
  assert.equal(b.status, 0, b.stderr);
  assert.match(b.stdout, /剪輯台修改單：s05、s12、t1095 標成「生成中」/);
  assert.match(b.stdout, /⚠ 修改單的 t1095 plan\.json 沒有 → .*「- t1095：新增 <段 id>，<做了什麼>」/);
  assert.deepEqual(V.openRound(p).segs, ['s05', 's12'], '不給 --seg：修改單裡 plan.json 有的段');
  assert.match(sectionOf(read(p, 'work/feedback/r1.md'), '原話'), /「照修改單改」/);
  let q = E.requestsInfo(p);
  assert.deepEqual(Object.entries(q.states).map(([id, s]) => [id, s.state, s.round]), [['s05', 'generating', 'r1'], ['s12', 'generating', 'r1'], ['t1095', 'generating', 'r1']]);
  // 改 s05；s12 沒做（AI 寫了理由）；t1095 新增了一段
  editPlan(p, (j) => { j.scenes[0].slots.text = '短'; j.scenes.push({ id: 's05b', scene: 'quote', from: '#2', to: '#2e', slots: { text: '新的' } }); });
  const f = path.join(p, 'work', 'feedback', 'r1.md');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('## 改了哪幾段\n\n（versions.mjs finish 會填）', '## 改了哪幾段\n\n- s12：沒做，參考圖找不到\n- t1095：新增 s05b，補一張金句卡'));
  const log = [];
  const r = V.finishRound(P, {}, (l) => log.push(l), stepsOf().steps);
  assert.equal(r.ok, true, log.join('\n'));
  q = E.requestsInfo(p);
  assert.deepEqual([q.states.s05.state, q.states.s05.round], ['done', 'r1']);
  assert.match(q.states.s05.message, /slots\.text 「小毛病」 → 「短」/);
  assert.deepEqual([q.states.s12.state, q.states.s12.message], ['failed', '沒做，參考圖找不到']);
  assert.deepEqual([q.states.t1095.state, q.states.t1095.message], ['done', '新增 s05b，補一張金句卡']);
  assert.deepEqual(Object.keys(q.done).sort(), ['s05', 't1095'], '剪輯台：失敗的段不算已改');
  assert.match(sectionOf(read(p, 'work/feedback/r1.md'), '改了哪幾段'), /^- s12：沒做，參考圖找不到$/m, 'AI 寫的沒做理由留著');
  assert.ok(log.includes('剪輯台修改單：已改完 s05、t1095；失敗 s12（沒做，參考圖找不到）'));
  assert.deepEqual(r.requests, { done: ['s05', 't1095'], failed: [{ id: 's12', msg: '沒做，參考圖找不到' }] });
  assert.ok(log.some((l) => /^剪輯台修改單：.*（剪輯台的修改單可以按「清空修改單」）$/.test(l)), '回報段帶這一行');
  // 沒寫理由的沒改到的段：「這段沒有改動」；修改單在這輪之間重新複製過：不動剪輯台、印 ⚠
  const p2 = mk(t);
  const P2 = pathsFrom({ project: p2 });
  touch(p2, 'work/feedback/editor-requests.md', REQ, 120);
  V.beginRound(P2, { requests: true }, [], '', () => {});
  editPlan(p2, (j) => { j.scenes[0].slots.text = '短'; });
  V.finishRound(P2, {}, () => {}, stepsOf().steps);
  assert.deepEqual([E.requestsInfo(p2).states.s12.state, E.requestsInfo(p2).states.s12.message], ['failed', '這段沒有改動']);
  assert.equal(E.requestsInfo(p2).states.t1095.message, '這段沒有改動');
  const p3 = mk(t);
  const P3 = pathsFrom({ project: p3 });
  touch(p3, 'work/feedback/editor-requests.md', REQ, 120);
  V.beginRound(P3, { requests: true }, [], '', () => {});
  touch(p3, 'work/feedback/editor-requests.md', REQ.replace('## 3. t1095', '## 3. s99'), 60);
  editPlan(p3, (j) => { j.scenes[0].slots.text = '短'; });
  const lg = [];
  assert.equal(V.finishRound(P3, {}, (l) => lg.push(l), stepsOf().steps).ok, true);
  assert.ok(lg.some((l) => /^⚠ 剪輯台修改單在這輪開始之後重新複製過.*→ 停下來重讀/.test(l)));
  assert.deepEqual(E.requestsInfo(p3).states, {}, '新修改單的狀態不動');
  // 手動的 --requests-state 照舊能用
  const rev = E.requestsInfo(p3).revision;
  const m = spawnSync(process.execPath, [path.join(TOOLS, 'editor.mjs'), '--project', p3, '--requests-state', 'done', '--request-revision', rev, '--ids', 's05', '--round', 'r1'], { encoding: 'utf8' });
  assert.equal(m.status, 0, m.stderr);
  assert.equal(E.requestsInfo(p3).done.s05.round, 'r1');
});

test('A3／A4 finish：最後是回報段（工具知道的填好、停點那兩行只在最後出現一次）；連續沒過到上限印「→ 停手」，過了歸零', (t) => {
  const p = mk(t);
  const P = pathsFrom({ project: p });
  V.beginRound(P, {}, ['s05'], 's05 字太多', () => {});
  const fail = stepsOf({ build() { return { ok: false, out: '✖ [s05 quote] 字太多 → 縮文案' }; } }).steps;
  for (let i = 1; i < MAIN_TRY_MAX.finish; i++) {
    const lg = [];
    assert.equal(V.finishRound(P, {}, (l) => lg.push(l), fail).ok, false);
    assert.ok(!lg.some((l) => l.startsWith('→ 停手')), `第 ${i} 次還不用停`);
  }
  editPlan(p, (j) => { j.scenes[0].slots.text = '短'; });
  let lg = [];
  const last = V.finishRound(P, {}, (l) => lg.push(l), fail);
  assert.match(lg.at(-1), new RegExp(`^→ 停手：versions\\.mjs finish 已經連續 ${MAIN_TRY_MAX.finish} 次沒過`));
  assert.equal(last.halt, lg.at(-1));
  // 過了：回報段
  lg = [];
  const sheet = path.join(p, 'work', 'audit-shots', 'sheet-s05.jpg');
  touch(p, 'work/audit-shots/sheet-s05.jpg');
  const ok = V.finishRound(P, {}, (l) => lg.push(l), stepsOf({ audit() { return { ok: true, errors: [], warnings: [], findings: [], shots: [path.join(p, 'work/audit-shots/s05-1.00.jpg')], sheets: [{ id: 's05', file: sheet }] }; } }).steps);
  assert.equal(ok.ok, true);
  const at = lg.indexOf(REPORT_HEAD);
  assert.ok(at > 0, '有回報段');
  const rep = lg.slice(at);
  assert.ok(rep.length <= 15);
  assert.match(rep[1], /^預覽好了（回饋 r1）：1 段 s05；build ✖ 0、⚠ 0；audit ✖ 0、⚠ 0$/);
  assert.ok(rep.includes('人聲響度 −21.8 LUFS → −14 LUFS；音效比例：這支片沒有音效'));
  assert.ok(rep.some((l) => /^拼圖：.*sheet-s05\.jpg（看完把 FAIL 的段與問題寫在這一行；沒有就寫「沒有 FAIL」）$/.test(l)));
  assert.ok(rep.includes('s05：slots.text 「小毛病」 → 「短」（v1 → v2）'));
  assert.equal(rep.slice(-2).join('\n'), stopLines.final('http://127.0.0.1:4400/?view=final'));
  assert.equal(lg.filter((l) => l.startsWith('⏸')).length, 1);
  assert.ok(!lg.some((l) => l.startsWith('→ 下一步：')), '過了沒有「→ 下一步」（下面不是指令）');
  // 歸零：再錯一次不會馬上停手
  lg = [];
  V.beginRound(P, {}, ['s05'], '再改', () => {});
  V.finishRound(P, {}, (l) => lg.push(l), fail);
  assert.ok(!lg.some((l) => l.startsWith('→ 停手')));
});

test('C6 ensureEditor：沒開就在背景開、回傳各頁網址（不印東西）；開著就沿用；CLI 印的字不變', { timeout: 60000 }, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-032w2a-ed-'));
  fs.mkdirSync(path.join(root, 'shared'), { recursive: true });
  fs.symlinkSync(TEMPLATE, path.join(root, 'shared', 'template'), 'dir');
  const project = path.join(root, 'projects', 'ens');
  fs.mkdirSync(path.join(project, 'work', 'hyperframes'), { recursive: true });
  const P = pathsFrom({ project, template: path.join(root, 'shared', 'template') }, root);
  const stateFile = path.join(P.out, '.editor', 'server.json');
  t.after(async () => { await E.stopEditor(stateFile, project); fs.rmSync(root, { recursive: true, force: true }); });
  const port = 49200 + (process.pid % 400);
  const out = [];
  const orig = console.log;
  console.log = (...a) => out.push(a.join(' '));
  let u;
  try { u = await E.ensureEditor(P, { port }); } finally { console.log = orig; }
  assert.deepEqual(out, [], '不印東西');
  assert.equal(u.started, true);
  assert.match(u.main, /^http:\/\/127\.0\.0\.1:\d+\/$/);
  assert.deepEqual([u.cuts, u.framing, u.storyboard, u.final], ['cuts', 'framing', 'storyboard', '?view=final'].map((x) => new URL(x, u.main).href));
  const ping = await (await fetch(new URL('api/ping', u.main))).json();
  assert.equal(path.resolve(ping.project), path.resolve(project));
  // 別的工作線同時在改 lib/ 時，這裡的後端版本會和剛開的服務對不上，ensureEditor 會換掉重開（那是對的）：只有版本一樣才驗「沿用同一個行程」
  const again = await E.ensureEditor(P);
  assert.equal(again.main, u.main, '網址不變（重開也沿用原本的 port）');
  if (ping.revision === E.SERVER_REVISION && !again.restarted) assert.deepEqual([again.started, again.pid], [false, u.pid], '開著就沿用');
  const cli = spawnSync(process.execPath, [path.join(root, 'shared', 'template', 'tools', 'editor.mjs'), '--project', 'projects/ens', '--template', 'shared/template'], { cwd: root, encoding: 'utf8', timeout: 30000 });
  assert.equal(cli.status, 0, cli.stderr);
  const pages = [`剪輯清單：${u.cuts}`, `構圖：${u.framing}`, `分鏡表：${u.storyboard}`, `完成影片預覽：${u.final}`].join('\n');
  if (/已有新版/.test(cli.stdout)) assert.ok(cli.stdout.includes(`剪輯：${u.main}\n${pages}\n專案：projects/ens\n`), cli.stdout);
  else assert.equal(cli.stdout.trim(), [`剪輯已經開著：${u.main}`, pages, '專案：projects/ens（要重開先關掉：node shared/template/tools/editor.mjs --stop --project projects/ens）'].join('\n'));
  assert.match(spawnSync(process.execPath, [path.join(TOOLS, 'editor.mjs'), '--help'], { encoding: 'utf8' }).stdout, /--round r<N>：done 時記是哪一輪回饋改好的/, 'D5：--help 有 --round');
});

test('C2：剪輯清單、分鏡表頁、製作進度的回饋輪那一列都是寫完才換上（writeAtomic：換名，檔案 inode 會換）', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-032w2a-c2-'));
  fs.mkdirSync(path.join(root, 'shared'), { recursive: true });
  fs.symlinkSync(TEMPLATE, path.join(root, 'shared', 'template'), 'dir');
  const project = path.join(root, 'projects', 'c2'), work = path.join(project, 'work');
  fs.mkdirSync(path.join(work, 'hyperframes'), { recursive: true });
  const ed = await E.startEditor({ flags: { project, template: TEMPLATE }, cwd: root, port: 0, writeState: false });
  t.after(async () => { await ed.close(); fs.rmSync(root, { recursive: true, force: true }); });
  const api = (route, body) => fetch(new URL(route, ed.url), body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const ino = (f) => fs.statSync(f).ino;
  // 剪輯清單
  const cuts = path.join(work, 'cuts.md');
  fs.writeFileSync(cuts, ['# 剪輯清單', '', '## NG', '', '| 剪 | 時間碼 | 內容 | 原因 | 待確認 |', '|---|---|---|---|---|', '| [x] | 0:01.00–0:02.00 | 今天 | 重講 | — |', ''].join('\n'));
  let before = ino(cuts);
  const cs = await (await api('/api/cuts')).json();
  assert.equal((await api('/api/cuts/save', { hash: cs.hash, cut: { 1: false } })).status, 200);
  assert.match(fs.readFileSync(cuts, 'utf8'), /\| \[ \] \| 0:01\.00/);
  assert.notEqual(ino(cuts), before, 'cuts.md 換名寫入');
  // 分鏡表
  const sb = path.join(work, 'storyboard.md');
  fs.writeFileSync(sb, ['# 分鏡表：c2（草稿）', '', '## s01（#1–2e，0:00.00–0:04.94）', '', '- 畫面文字：名字「林」，綁 `#1@嗨`', ''].join('\n'));
  before = ino(sb);
  const ss = await (await api('/api/storyboard')).json();
  const item = ss.sections.find((x) => x.id === 's01').blocks.find((x) => x.label === '畫面文字');
  const res = await api('/api/storyboard/save', { hash: ss.hash, op: 'text', line: item.line, text: '名字「王」，綁 `#1@嗨`\n', expect: item.value });
  assert.equal(res.status, 200, await res.clone().text());
  assert.match(fs.readFileSync(sb, 'utf8'), /名字「王」/);
  assert.notEqual(ino(sb), before, 'storyboard.md 換名寫入');
  // 製作進度：同一輪加段時只改回饋輪那一列（updateRoundRow）
  const p = mk(t);
  const P = pathsFrom({ project: p });
  V.beginRound(P, {}, ['s05'], 's05 往左移', () => {});
  const prog = progressFile(p);
  before = ino(prog);
  V.beginRound(P, {}, ['s05', 's12'], undefined, () => {});
  assert.match(fs.readFileSync(prog, 'utf8'), /\| r1 \| .* \| s05、s12 \|/);
  assert.notEqual(ino(prog), before, '製作進度.md 換名寫入');
});
