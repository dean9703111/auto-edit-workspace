// versions.mjs begin／finish：一輪回饋的備份、紀錄、驗證併成工具指令；save 預設不出預覽；長片輸出不暴增
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { TOOLS, imp, hasChrome, makeSrt } from './helpers.mjs';

const V = await imp('versions.mjs');
const { projectStatus, readStopLog } = await imp('status.mjs');
const { pathsFrom } = await imp('build.mjs');
const { progressFile, appendStop } = await imp('lib/progress.mjs');

const tmps = [];
after(() => { for (const d of tmps) fs.rmSync(d, { recursive: true, force: true }); });
const touch = (p, rel, text = 'x', ageSec = 0) => {
  const f = path.join(p, ...rel.split('/'));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
  const t = new Date(Date.now() - ageSec * 1000);
  fs.utimesSync(f, t, t);
};
const read = (p, rel) => fs.readFileSync(path.join(p, ...rel.split('/')), 'utf8');
const X1 = '<template id="x-a"><div class="t">主持人跟來賓</div></template>\n';
function mk(scenes) {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-round-'));
  tmps.push(p);
  for (const d of ['camera', 'voice', 'screen', 'images']) fs.mkdirSync(path.join(p, 'assets', d), { recursive: true });
  touch(p, 'work/rough.srt', makeSrt({ n: 5 }), 600);
  touch(p, 'work/storyboard.md', '# 分鏡表\n\n### s05｜金句\n- 金句\n\n### s12｜x-a\n- 對比卡\n', 300);
  const plan = { version: 1, theme: 'light', scenes: scenes || [
    { id: 's05', scene: 'quote', from: '#1', to: '#1e', slots: { text: '小毛病', cards: [{ text: 'A' }, { text: 'B' }] } },
    { id: 's08', scene: 'concept', from: '#2', to: '#2e', slots: { text: '第二張' } },
    { id: 's12', type: 'custom', src: 'compositions/x-a.html', layout: 'fullscreen', from: '#3', to: '#3e' },
    { id: 's15', type: 'media', src: 'assets/images/a.png', from: '#4', to: '#4e' },
  ] };
  touch(p, 'work/hyperframes/plan.json', JSON.stringify(plan, null, 2) + '\n', 60);
  touch(p, 'work/hyperframes/compositions/x-a.html', X1, 60);
  return p;
}
const ctxOf = (p) => ({ P: pathsFrom({ project: p }), logs: [] });
const logTo = (c) => (s) => c.logs.push(s);
const editPlan = (p, fn) => { const f = path.join(p, 'work', 'hyperframes', 'plan.json'); const j = JSON.parse(fs.readFileSync(f, 'utf8')); fn(j); fs.writeFileSync(f, JSON.stringify(j, null, 2) + '\n'); };
const seg = (j, id) => j.scenes.find((s) => s.id === id);
const stops = (p) => readStopLog(fs.readFileSync(progressFile(p), 'utf8')).rows;
const RUN = (...a) => spawnSync(process.execPath, [path.join(TOOLS, 'versions.mjs'), ...a], { encoding: 'utf8' });
const sectionOf = (md, title) => md.split(new RegExp(`^## ${title}\\s*$`, 'm'))[1]?.split(/^## /m)[0] ?? '';

// 換掉真的工具：不用 ffmpeg、Chrome；記錄有沒有被叫到
const BUILD_OK = ['專案：x', '版式：橫式 1920×1080', '講者調光：關（plan.json 的 look）', '講者瘦臉：關、美顏：關（plan.json 的 look）', '人聲響度 −21.8 LUFS → −14 LUFS（true peak −8.2）', '音效比例：這支片沒有音效', '剪接點微淡化：2 個接點，前後各 15 ms', 'id｜情境｜起–迄', 's05｜金句｜0:01–0:04', '音效比例：這支片沒有音效', '結尾配樂：沒配（預設不配）', '產生：7 個檔'].join('\n');
function stepsOf(over = {}) {
  const calls = { build: 0, check: 0, audit: [], snapshot: [], editor: 0, prerender: 0 };
  const items = (P) => JSON.parse(fs.readFileSync(P.plan, 'utf8')).scenes.map((s, i) => ({ id: s.id, type: s.type === 'media' ? 'media' : s.type === 'custom' ? 'custom' : 'scene', out: { start: i * 4, end: i * 4 + 3 } }));
  const steps = {
    build() { calls.build++; return { ok: true, out: BUILD_OK }; },
    check(P) { calls.check++; return { ok: true, format: 'landscape', items: items(P) }; },
    audit(P, f, ids) { calls.audit.push(ids); return { ok: true, errors: [], warnings: [], findings: [], shots: [] }; },
    snapshot(P, list) { calls.snapshot.push(list); return []; },
    editor() { calls.editor++; return 'http://127.0.0.1:4400/?view=final'; },
    prerender() { calls.prerender++; },
    sheet(P, shots, out) { calls.sheet = shots; fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, 'x'); return out; },
    ...over,
  };
  return { steps, calls };
}

// ---------- 純函式 ----------

test('sceneSlices：照原文切出每一段與行號；縮排幾格都行、字串裡的括號不算、"scenes" 當值不會認錯', () => {
  const text = fs.readFileSync(path.join(TOOLS, '..', '..', '..', 'dev', 'tests', 'fixtures', 'example-trial1', 'work', 'hyperframes', 'plan.json'), 'utf8');
  const all = V.sceneSlices(text);
  const plan = JSON.parse(text);
  assert.deepEqual(all.map((s) => s.id), plan.scenes.map((s) => s.id), '1 格縮排的真實 plan.json');
  for (const s of all) {
    assert.ok(text.includes(s.text), `${s.id} 原文照抄就對得上（可以當 Edit 的 old_string）`);
    assert.deepEqual(JSON.parse(s.text), plan.scenes.find((x) => x.id === s.id));
    assert.match(text.split('\n')[s.from - 1], /^\s*\{/);
    assert.match(text.split('\n')[s.to - 1], /^\s*\},?$/);
  }
  const inline = '{"version":1,"note":"scenes","x":[{"id":"no"}],"scenes":[{"id":"a","slots":{"t":"有 } 和 ] 和 \\" 的字"}},\n  {"id":"b","list":[{"id":"inner"}]}],"after":[{"id":"no2"}]}';
  const cut = V.sceneSlices(inline);
  assert.deepEqual(cut.map((s) => [s.id, s.from, s.to]), [['a', 1, 1], ['b', 2, 2]]);
  assert.equal(cut[0].text, '{"id":"a","slots":{"t":"有 } 和 ] 和 \\" 的字"}}', '同一行前面還有別的東西：從 { 開始');
  assert.equal(cut[1].text, '  {"id":"b","list":[{"id":"inner"}]}', '前面只有縮排：連縮排一起');
  assert.deepEqual(V.sceneSlices('{"version":1}'), []);
});

test('nextRound：work/feedback/r*.md、plan.json.bak-r* 的最大數字＋1；status 的「下一輪回饋編號」同一個', () => {
  const p = mk();
  assert.equal(V.nextRound(p), 1);
  touch(p, 'work/feedback/r1.md');
  touch(p, 'work/feedback/r3.md');
  touch(p, 'work/feedback/editor-requests.md');
  assert.equal(V.nextRound(p), 4);
  touch(p, 'work/hyperframes/plan.json.bak-r7');
  assert.equal(V.nextRound(p), 8, '開到一半的備份不會被蓋掉');
  assert.equal(projectStatus(p).feedback, 'r8');
});

test('planDiff／describeChange：哪幾段變了、第一層哪幾欄變了；改法寫成 slots.key「舊」→「新」', () => {
  const a = { version: 1, theme: 'light', scenes: [{ id: 's1', to: '#1' }, { id: 's2' }, { id: 's3' }] };
  const b = { version: 1, theme: 'dark', outro: { music: null }, scenes: [{ id: 's1', to: '#2' }, { id: 's3' }, { id: 's9' }] };
  assert.deepEqual(V.planDiff(a, b), { changed: ['s1'], added: ['s9'], removed: ['s2'], top: ['theme', 'outro'] });
  assert.equal(V.describeChange({ slots: { text: '舊的字' } }, { slots: { text: '新的字' } }), 'slots.text 「舊的字」 → 「新的字」');
  assert.equal(V.describeChange({ a: 1 }, { a: 1, css: { left: '-120px' } }), 'css.left 無 → 「-120px」', '新加的物件寫到裡面的欄位');
  assert.equal(V.describeChange({ css: { left: '-1px' } }, {}), 'css.left 「-1px」 → 無');
  assert.equal(V.describeChange({ list: [{ t: 'a' }, { t: 'b' }] }, { list: [{ t: 'a' }, { t: 'c' }] }), 'list[1].t 「b」 → 「c」');
  assert.equal(V.describeChange({ list: [1] }, { list: [1, 2] }), 'list：1 項 → 2 項');
  assert.match(V.describeChange({ a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 }, { a: 2, b: 3, c: 4, d: 5, e: 6, f: 7 }), /；還有 2 處$/);
  assert.equal(V.describeChange({ a: 1 }, { a: 1 }), '');
});

test('digestBuild：只留 ✖、⚠、六行摘要（去重）；別段的 ⚠ 只算數量；全片的 ⚠ 留前幾則', () => {
  const lines = ['專案：x', '✖ [s05 quote] 字太多 → 改', '⚠ [s05 quote] 蓋到講者 → 換', '⚠ [s99 quote] 別段', '⚠ 文字對時：s05 的 key 早了 → 改', '⚠ 文字對時：s77 的 key 早了 → 改', '⚠ 音效密度：s05、s09 → 改',
    '⚠ 沒有畫面的區間共 1 段', '人聲響度 −21 LUFS', '人聲響度 −21 LUFS', 'id｜情境', 's05｜金句'];
  const d = V.digestBuild(lines.join('\n'), ['s05'], ['s05', 's09', 's77', 's99']);
  assert.deepEqual(d.errors, ['✖ [s05 quote] 字太多 → 改']);
  assert.deepEqual(d.warns, ['⚠ [s05 quote] 蓋到講者 → 換', '⚠ 文字對時：s05 的 key 早了 → 改', '⚠ 音效密度：s05、s09 → 改']);
  assert.deepEqual(d.global, ['⚠ 沒有畫面的區間共 1 段']);
  assert.equal(d.other, 2);
  assert.deepEqual(d.summary, ['人聲響度 −21 LUFS']);
  const many = V.digestBuild(Array.from({ length: 30 }, (_, i) => `⚠ 全片的提醒 ${i}`).join('\n'), ['s05'], ['s05']);
  assert.equal(many.global.length, V.ROUND.maxGlobal);
  assert.equal(many.other, 30 - V.ROUND.maxGlobal);
  assert.ok(V.digestBuild(`⚠ [s05 x] ${'長'.repeat(2000)}`, ['s05'], ['s05']).warns[0].length <= V.ROUND.lineCap + 1, '一行太長截斷');
});

test('digestAudit：✖、⚠ 用 audit 的格式；截圖對回段；pickShots 每段留完成態，總數有上限', () => {
  const r = { errors: ['找不到 Chrome → 跑 x'], warnings: ['plan.json 比 index.html 新'], findings: [
    { id: 's05', label: '金句', level: 'error', at: [12.3], msg: '文字撐破容器', fix: '縮文字' }, { id: 's05', label: '金句', level: 'warn', at: [12.3], msg: '字太小', fix: '放大' }],
    shots: ['work/audit-shots/s05-12.30.jpg', 'work/audit-shots/s-08-1.00.jpg'], sheets: [{ id: 's05', file: 'work/audit-shots/sheet-s05.jpg', count: 1 }] };
  const d = V.digestAudit(r, ['s05', 's-08']);
  assert.deepEqual(d.errors, ['✖ 找不到 Chrome → 跑 x', '✖ [s05 金句] 0:12.30 文字撐破容器 → 縮文字']);
  assert.deepEqual(d.warns, ['⚠ plan.json 比 index.html 新', '⚠ [s05 金句] 0:12.30 字太小 → 放大']);
  assert.deepEqual(d.shots.map((s) => s.id), ['s05', 's-08'], '段 id 可以有 -');
  assert.deepEqual(d.sheets, [path.resolve('work/audit-shots/sheet-s05.jpg')]);
  const mkShots = (id, n) => Array.from({ length: n }, (_, i) => ({ id, file: `${id}-${i}` }));
  const one = V.pickShots(mkShots('s1', 10), 4);
  assert.equal(one.length, 4);
  assert.equal(one.at(-1).file, 's1-9', '一定有最後一張（完成態）');
  const two = V.pickShots([...mkShots('s1', 3), ...mkShots('s2', 30)], 24);
  assert.deepEqual([two.filter((s) => s.id === 's1').length, two.filter((s) => s.id === 's2').length], [3, 12]);
  const lots = V.pickShots(Array.from({ length: 40 }, (_, i) => ({ id: `s${i}`, file: `f${i}` })), 24);
  assert.equal(lots.length, 24, '100 段一輪也不會爆');
});

test('shotSheet：jpg、png 混著拼成一張；一張也可以；直式 6 欄', { skip: spawnSync('ffmpeg', ['-version']).status !== 0 && '沒有 ffmpeg' }, () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-sheet-'));
  tmps.push(d);
  const pic = (f) => { const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=1920x1080:rate=1', '-frames:v', '1', path.join(d, f)]); assert.equal(r.status, 0, String(r.stderr)); return path.join(d, f); };
  const size = (f) => spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f], { encoding: 'utf8' }).stdout.trim();
  const out = V.shotSheet([pic('a.jpg'), pic('b.png'), pic('c.jpg'), pic('d.png'), pic('e.jpg')], path.join(d, 'sub', 'sheet.jpg'));
  assert.equal(size(out), `${4 * 480 + 3 * 4},${2 * 270 + 4}`);
  assert.equal(size(V.shotSheet([pic('f.png')], path.join(d, 'one.jpg'))), '480,270');
  assert.equal(size(V.shotSheet([pic('g.jpg'), pic('h.png')], path.join(d, 'v.jpg'), true)), `${2 * 240 + 4},426`);
});

// ---------- save 預設不出預覽 ----------

test('save 預設只存檔；--preview 才 render；new、use 自己帶；--no-preview 都不出；存進已確認的提案一定出', () => {
  const p = mk();
  const c = ctxOf(p);
  // 假專案沒有影片：makePreview 跑了就會印「⚠ s12 的預覽沒做」，用這個判斷有沒有試
  const tried = () => c.logs.some((l) => /的預覽沒做/.test(l));
  V.saveSeg(c.P, {}, 's12', logTo(c));
  assert.equal(tried(), false, 'save 預設不 build、不 render');
  assert.equal(V.saveSeg(c.P, {}, 's12', logTo(c)).previewOk, false);
  assert.equal(tried(), false, '沒變也不補預覽');
  V.saveSeg(c.P, { preview: true }, 's12', logTo(c));
  assert.equal(tried(), true, '--preview 會 render（缺的補上）');
  c.logs.length = 0;
  V.saveSeg(c.P, { preview: true, 'no-preview': true }, 's12', logTo(c));
  assert.equal(tried(), false, '--no-preview 優先');
  // new：一定要有現在這版的預覽
  V.newProposal(c.P, {}, 's12', logTo(c));
  assert.equal(tried(), true, 'new 自己帶預覽');
  c.logs.length = 0;
  // 存進已確認的提案（改版做完）：一定出預覽，才比較得了
  const f = path.join(p, 'work', 'versions', 's12', 'v2', '分鏡.md');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/- （寫 1–5 條.*/, '- 收尾加蓋章'));
  V.acceptProposal(c.P, 's12', logTo(c));
  touch(p, 'work/hyperframes/compositions/x-a.html', `${X1}<!-- 蓋章 -->\n`);
  V.saveSeg(c.P, {}, 's12', logTo(c));
  assert.equal(tried(), true, '存進提案那一版也試著出預覽');
  // use：先把現在的樣子存起來（含預覽），和以前一樣
  c.logs.length = 0;
  touch(p, 'work/hyperframes/compositions/x-a.html', `${X1}<!-- 第三版 -->\n`);
  V.useVersion(c.P, {}, 's12', 'v1', logTo(c));
  assert.equal(tried(), true, 'use 不受影響');
  // CLI：--preview 收得到；舊參數 --no-preview 還能用
  const r = RUN('save', '--project', p, '--seg', 's05', '--no-preview');
  assert.equal(r.status, 0, r.stderr);
  const r2 = RUN('save', '--project', p, '--seg', 's05');
  assert.match(r2.stdout, /s05：沒變，目前就是 v1/);
  assert.doesNotMatch(r2.stdout, /預覽/);
});

// ---------- begin ----------

test('begin：編號、備份、改之前的版本、r<N>.md 四節骨架、製作進度回饋輪；只印這幾段的原文；「改了哪幾段」先不寫（剪輯台看到才標已改）', () => {
  const p = mk();
  touch(p, 'work/feedback/r1.md');
  const r = RUN('begin', '--project', p, '--seg', 's12,s05', '--say', '「s05 的金句卡往左移，s12 字太多」');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(read(p, 'work/hyperframes/plan.json.bak-r2'), read(p, 'work/hyperframes/plan.json'));
  for (const id of ['s05', 's12']) assert.ok(fs.existsSync(path.join(p, 'work', 'versions', id, 'v1', '段落.json')), `${id} 改之前存 v1`);
  assert.equal(fs.existsSync(path.join(p, 'work', 'versions', 's12', 'v1', '預覽.mp4')), false, '不出預覽');
  const meta = JSON.parse(read(p, 'work/versions/s05/v1/.meta.json'));
  assert.equal(meta.kind, 'r2 改之前');
  assert.equal(meta.note, 's05 的金句卡往左移，s12 字太多');
  const md = read(p, 'work/feedback/r2.md');
  assert.match(md, /^# 回饋 r2（\d{4}-\d{2}-\d{2} \d{2}:\d{2}）\n/);
  assert.equal([...md.matchAll(/^## (原話|分類|改了哪幾段|驗證)\s*$/gm)].length, 4, '四節標題逐字');
  assert.match(sectionOf(md, '原話'), /^\s*「s05 的金句卡往左移，s12 字太多」\s*$/, '原話已經有「」不包兩層');
  assert.match(sectionOf(md, '分類'), /\| 1 \| s05 的金句卡往左移，s12 字太多 \| 個案 \| s12 \| （versions\.mjs finish 會填） \|\n\| 2 \| .* \| 個案 \| s05 \|/);
  assert.match(sectionOf(md, '分類'), /建議改規則：無/);
  assert.doesNotMatch(sectionOf(md, '改了哪幾段'), /^- /m, 'finish 才寫：剪輯台讀到「- 段：」就標「已改」');
  const prog = read(p, 'work/製作進度.md');
  assert.match(prog, /\| r2 \| \d{4}-\d{2}-\d{2} \d{2}:\d{2} \| work\/feedback\/r2\.md \| s12、s05 \| work\/hyperframes\/plan\.json\.bak-r2 \|/);
  assert.deepEqual(stops(p), [], '停點 ④ 沒在等就不記');
  // 只印這幾段；印的原文照抄就對得上 plan.json
  const planText = read(p, 'work/hyperframes/plan.json');
  assert.ok(r.stdout.includes('"id": "s05"') && r.stdout.includes('"id": "s12"'));
  assert.doesNotMatch(r.stdout, /"id": "s08"|"id": "s15"/, '沒改到的段不印');
  assert.match(r.stdout, /s12（.*plan\.json 第 \d+–\d+ 行；x 檔 work\/hyperframes\/compositions\/x-a\.html）/);
  const j = JSON.parse(RUN('begin', '--project', p, '--seg', 's05', '--json').stdout);
  assert.ok(planText.includes(j.blocks[0].text), '原文可以直接當 Edit 的 old_string');
  assert.ok(planText.split('\n').slice(j.blocks[0].from - 1, j.blocks[0].to).join('\n').startsWith(j.blocks[0].text), '行號對得上（最後一行多一個逗號）');
  // 最後兩行：→ 下一步＋可貼的指令
  const L = r.stdout.trim().split('\n');
  assert.match(L.at(-2), /^→ 下一步：/);
  assert.equal(L.at(-1), `node shared/template/tools/versions.mjs finish --project ${p}`);
  // status 接得上
  const s = projectStatus(p);
  assert.equal(s.round, 'r2');
  assert.match(s.at, /^回饋輪 r2／s12、s05（還沒 finish）$/);
  assert.match(s.cmd, /versions\.mjs finish --project /);
  assert.equal(s.feedback, 'r3');
});

test('begin：同一輪分多次接續（備份不重做、已存過的段不重存）；停點 ④ 在等就記使用者回覆；規則字眼提醒；錯誤都有 →', () => {
  const p = mk();
  touch(p, 'work/製作進度.md', ['# 製作進度', '', '## 停點紀錄', '', '| 時間 | 停點 | 狀態 | 使用者原話 | 寫回哪裡 |', '|---|---|---|---|---|', '| 2026-11-02 10:00 | ④ 完成影片預覽 | 待回覆 | — | — |', '', '## 回饋輪', '', '| 輪 | 時間 | 檔案 | 改了哪幾段 | 備份 |', '|---|---|---|---|---|', ''].join('\n'));
  const c = ctxOf(p);
  const a = V.beginRound(c.P, {}, ['s05'], 's05 往左移，以後都放左邊', logTo(c));
  assert.equal(a.round, 'r1');
  assert.equal(a.rule, '以後');
  let md = read(p, 'work/feedback/r1.md');
  assert.match(sectionOf(md, '分類'), /可能是規則，請確認/);
  assert.match(sectionOf(md, '分類'), /建議改規則：（原話有「以後」/);
  assert.deepEqual(stops(p).map((r) => [r.label, r.state]), [['④ 完成影片預覽', '待回覆'], ['④ 完成影片預覽', '修改後重停']]);
  assert.match(read(p, 'work/製作進度.md'), /修改後重停 \| 「s05 往左移，以後都放左邊」 \| work\/feedback\/r1\.md \|/);
  assert.deepEqual(projectStatus(p).waiting, [], '回饋輪開著：④ 不算在等');
  // 改到一半又多一段
  editPlan(p, (j) => { seg(j, 's05').slots.text = '改到一半'; });
  const before = read(p, 'work/hyperframes/plan.json.bak-r1');
  const b = V.beginRound(c.P, {}, ['s05', 's08'], '還有 s08', logTo(c));
  assert.equal(b.round, 'r1', '還沒 finish：同一輪');
  assert.equal(b.continued, true);
  assert.deepEqual(b.segs, ['s05', 's08']);
  assert.deepEqual(b.added, ['s08']);
  assert.equal(read(p, 'work/hyperframes/plan.json.bak-r1'), before, '備份是這輪最早的樣子');
  assert.equal(V.listVersions(p, 's05').length, 1, 's05 已經在這輪：不把改到一半的樣子存成新版');
  assert.equal(V.listVersions(p, 's08').length, 1);
  assert.match(b.blocks[0].text, /改到一半/, '再印一次是現在的樣子');
  md = read(p, 'work/feedback/r1.md');
  assert.match(sectionOf(md, '原話'), /「s05 往左移，以後都放左邊」\n「還有 s08」/);
  assert.match(sectionOf(md, '分類'), /\| 2 \| 還有 s08 \| 個案 \| s08 \|/);
  assert.match(sectionOf(md, '分類'), /\| 2 .*\n\n建議改規則/, '新列接在表格後面，建議改規則還在表格下面');
  const prog = read(p, 'work/製作進度.md');
  assert.match(prog, /\| r1 \| .* \| s05、s08 \| /, '回饋輪那一列更新，不多一列');
  assert.equal([...prog.matchAll(/^\| r1 \|/gm)].length, 1);
  assert.equal(stops(p).filter((r) => r.state === '修改後重停').length, 1, '同一輪不重記');
  // 不帶 --say 也能接續（只再印一次）
  assert.equal(V.beginRound(c.P, {}, ['s08'], undefined, logTo(c)).round, 'r1');
  // 錯誤
  const err = RUN('begin', '--project', p, '--seg', 's99,s05', '--say', 'x');
  assert.equal(err.status, 1);
  assert.match(err.stderr, /plan\.json 沒有「s99」這一段 → 段 id 照 build\.mjs --check 報告的第一欄（這份 plan\.json 共 4 段：s05、s08、s12、s15）/);
  assert.match(RUN('begin', '--project', p).stderr, /begin 要加 --seg <段 id>/);
  const q = mk();
  assert.match(RUN('begin', '--project', q, '--seg', 's05').stderr, /開新的一輪要記使用者原話 → 加 --say/);
  assert.equal(fs.existsSync(path.join(q, 'work', 'hyperframes', 'plan.json.bak-r1')), false, '出錯什麼都不寫');
  fs.rmSync(path.join(q, 'work', 'hyperframes', 'plan.json'));
  assert.match(RUN('begin', '--project', q, '--seg', 's05', '--say', 'x').stderr, /讀不到 .*plan\.json → /);
  touch(q, 'work/hyperframes/plan.json', '{ 壞掉');
  assert.match(RUN('begin', '--project', q, '--seg', 's05', '--say', 'x').stderr, /不是合法的 JSON.*→ 先跑 .*build\.mjs/);
});

test('begin：停點 ⑤ 在等（照修改單改）記通過；有提案的段不存（new 已經存好了）', () => {
  const p = mk();
  touch(p, 'work/製作進度.md', ['## 停點紀錄', '', '| 時間 | 停點 | 狀態 | 使用者原話 | 寫回哪裡 |', '|---|---|---|---|---|', '| 2026-11-02 10:00 | ⑤ 剪輯台 | 待回覆 | — | — |', '', '## 回饋輪', '', '| 輪 | 時間 | 檔案 | 改了哪幾段 | 備份 |', '|---|---|---|---|---|', ''].join('\n'));
  const c = ctxOf(p);
  V.beginRound(c.P, {}, ['s05'], '照修改單改', logTo(c));
  assert.deepEqual(stops(p).map((r) => [r.stop, r.state]), [['⑤ 剪輯台', '待回覆'], ['⑤ 剪輯台', '通過']]);
  const q = mk();
  const d = ctxOf(q);
  V.newProposal(d.P, { 'no-preview': true }, 's12', logTo(d));
  const r = V.beginRound(d.P, { 'no-preview': true }, ['s12'], 's12 重新設計', logTo(d));
  assert.equal(r.blocks[0].v, 1, '改之前的樣子是 new 存的 v1');
  assert.equal(V.listVersions(q, 's12').length, 2, '提案卡著：沒有另外存');
  assert.match(d.logs.join('\n'), /s12：有還沒做完的提案 v2，改之前的樣子是 v1/);
});

test('長片（150 段）：begin 只印改到的段，輸出不跟著 plan 變大；plan.json 很大也一樣', () => {
  const scenes = Array.from({ length: 150 }, (_, i) => ({ id: `s${String(i + 1).padStart(3, '0')}`, scene: 'concept', from: `#${i + 1}`, to: `#${i + 1}e`, slots: { text: `第 ${i + 1} 張卡`, items: Array.from({ length: 6 }, (__, k) => ({ text: `項目 ${k}`, at: `#${i + 1}@詞` })) } }));
  const p = mk(scenes);
  const planSize = fs.statSync(path.join(p, 'work', 'hyperframes', 'plan.json')).size;
  assert.ok(planSize > 50000, `plan.json ${planSize} bytes`);
  const r = RUN('begin', '--project', p, '--seg', 's100,s101', '--say', 's100、s101 字太多');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(Buffer.byteLength(r.stdout) < 2500 + 2 * p.length, `輸出 ${Buffer.byteLength(r.stdout)} bytes`);
  assert.ok(r.stdout.trim().split('\n').length < 90, '輸出行數有限');
  assert.doesNotMatch(r.stdout, /"id": "s099"|"id": "s102"/);
  const big = RUN('begin', '--project', p, '--seg', 's999', '--say', 'x');
  assert.ok(Buffer.byteLength(big.stderr) < 500 + p.length, `段不存在的訊息也不列整份：${Buffer.byteLength(big.stderr)} bytes`);
});

// ---------- finish ----------

test('finish：build → audit 改到的段 → 存版本 → r<N>.md → ④ 待回覆 → 停點那一行；不跑全片 snapshot；錄影段改 snapshot 那段中間', () => {
  const p = mk();
  const c = ctxOf(p);
  V.beginRound(c.P, {}, ['s05', 's15', 's12'], '「s05 字太多，s15 換圖，s12 動畫」', logTo(c));
  editPlan(p, (j) => { seg(j, 's05').slots.text = '短'; seg(j, 's05').slots.cards[1].text = 'C'; seg(j, 's15').to = '#5'; });
  touch(p, 'work/hyperframes/compositions/x-a.html', `${X1}<!-- 改了 -->\n`);
  const { steps, calls } = stepsOf();
  const log = [];
  const r = V.finishRound(c.P, {}, (l) => log.push(l), steps);
  assert.equal(r.ok, true);
  assert.equal(calls.build, 1);
  assert.deepEqual(calls.audit, [['s05', 's12']], 'audit 只量改到的段，錄影段不送');
  assert.deepEqual(calls.snapshot, [[{ id: 's15', t: 13.5 }]], '錄影段截那段中間（假的 --check：第 4 段 12–15 秒）');
  assert.equal(calls.prerender, 1, '過了才在背景先 render');
  const out = log.join('\n');
  assert.match(out, /^回饋 r1：s05、s15、s12/);
  assert.match(out, /build：✖ 0、⚠ 0/);
  for (const k of ['人聲響度', '音效比例', '剪接點微淡化', '講者調光', '講者瘦臉', '結尾配樂']) assert.match(out, new RegExp(`^${k}`, 'm'), `六行摘要：${k}`);
  assert.equal([...out.matchAll(/^音效比例/gm)].length, 1, '重複的摘要只印一次');
  assert.doesNotMatch(out, /^s05｜金句/m, '逐段表不印');
  assert.match(out, /audit --only s05,s12：✖ 0、⚠ 0/);
  assert.match(out, /錄影段（audit 不量）：s15 截 0:13\.50/);
  assert.match(out, /版本：s05 v1 → v2；s15 v1 → v2；s12 v1 → v2/);
  assert.equal(log.at(-1), '⏸ 停點 ④ 完成影片預覽｜請看：http://127.0.0.1:4400/?view=final｜請回：要改的段落（例：s05 往左移）或「可以了，輸出完成影片」');
  assert.match(log.at(-2), /^→ 下一步：看上面那張截圖/);
  // 版本
  assert.equal(JSON.parse(read(p, 'work/versions/s05/v2/.meta.json')).kind, 'r1 改之後');
  assert.equal(fs.existsSync(path.join(p, 'work', 'versions', 's05', 'v2', '預覽.mp4')), false);
  // r1.md：改法從差異自動填；剪輯台讀得到每段一列
  const md = read(p, 'work/feedback/r1.md');
  assert.match(sectionOf(md, '分類'), /\| s05 \| slots\.text 「小毛病」 → 「短」；slots\.cards\[1\]\.text 「B」 → 「C」 \|/);
  assert.match(sectionOf(md, '分類'), /\| s12 \| x-a\.html 改了 \|/);
  const rows = sectionOf(md, '改了哪幾段');
  assert.doesNotMatch(rows, /finish 會填/);
  const parsed = [...rows.matchAll(/^- (\S+?)：(.+)$/gm)].map((m) => m[1]);
  assert.deepEqual(parsed, ['s05', 's15', 's12'], '格式和 editor.mjs 的 requestsInfo 同一條 regex');
  assert.match(rows, /- s05：.*（v1 → v2）/);
  assert.match(rows, /- s15：to 「#4e」 → 「#5」（v1 → v2）/);
  const ver = sectionOf(md, '驗證');
  assert.match(ver, /- build（.*）：✖ 0、⚠ 0/);
  assert.match(ver, /- audit --only s05,s12：✖ 0、⚠ 0/);
  assert.match(ver, /- 錄影段 snapshot：s15/);
  assert.doesNotMatch(ver, /finish 會填/);
  // 停點與 status
  assert.deepEqual(stops(p).map((x) => [x.stop, x.state]), [['④ 完成影片預覽', '待回覆']]);
  const s = projectStatus(p);
  assert.equal(s.round, null);
  assert.deepEqual(s.waiting, ['④ 完成影片預覽']);
  assert.equal(s.feedback, 'r2');
  assert.equal(r.versions.length, 3);
});

test('finish：有 ✖ 就停（不存版本、不記停點、不寫「改了哪幾段」），改完再跑一次', () => {
  const p = mk();
  const c = ctxOf(p);
  V.beginRound(c.P, {}, ['s05'], 's05 往左移', logTo(c));
  editPlan(p, (j) => { seg(j, 's05').css = { left: '-120px' }; });
  const check = () => {
    assert.equal(V.listVersions(p, 's05').length, 1, '沒存新版本');
    assert.equal(stops(p).length, 0, '沒記停點');
    assert.doesNotMatch(sectionOf(read(p, 'work/feedback/r1.md'), '改了哪幾段'), /^- /m);
    assert.equal(V.openRound(p).n, 1, '這輪還開著');
  };
  // build ✖
  let log = [];
  const b = stepsOf({ build() { return { ok: false, out: `專案：x\n✖ [s05 quote] 字太多 → 縮文案\n⚠ [s05 quote] 蓋到講者\n未通過：1 個錯誤` }; } });
  let r = V.finishRound(c.P, {}, (l) => log.push(l), b.steps);
  assert.equal(r.ok, false);
  assert.deepEqual(r.errors, ['✖ [s05 quote] 字太多 → 縮文案']);
  assert.deepEqual(b.calls.audit, [], 'build 沒過不跑 audit');
  assert.equal(log.at(-1), `node shared/template/tools/versions.mjs finish --project ${p}`);
  assert.match(log.at(-2), /^→ 下一步：照 → 改好/);
  check();
  assert.match(sectionOf(read(p, 'work/feedback/r1.md'), '驗證'), /上次 finish（.*）：✖ 1，還沒過/);
  // build 失敗但沒有 ✖ 行（例：丟例外）
  r = V.finishRound(c.P, {}, () => {}, stepsOf({ build() { return { ok: false, out: 'Error: 爆了' }; } }).steps);
  assert.match(r.errors[0], /^✖ build 失敗：Error: 爆了 → /);
  check();
  // audit ✖
  log = [];
  const a = stepsOf({ audit() { return { ok: false, errors: [], warnings: [], findings: [{ id: 's05', label: '金句', level: 'error', at: [1], msg: '文字撐破容器', fix: '縮文字' }], shots: [] }; } });
  r = V.finishRound(c.P, {}, (l) => log.push(l), a.steps);
  assert.equal(r.ok, false);
  assert.match(log.join('\n'), /✖ \[s05 金句\] 0:01\.00 文字撐破容器 → 縮文字/);
  assert.equal(a.calls.editor, 0);
  check();
  // snapshot 失敗
  editPlan(p, (j) => { seg(j, 's15').to = '#5'; });
  r = V.finishRound(c.P, {}, () => {}, stepsOf({ snapshot() { throw new Error('npx hyperframes snapshot 失敗 → 跑 check'); } }).steps);
  assert.equal(r.ok, false, '這輪也改到 s15（錄影段）：snapshot 失敗也停');
  check();
  // 改好再跑一次
  log = [];
  const ok = stepsOf();
  r = V.finishRound(c.P, {}, (l) => log.push(l), ok.steps);
  assert.equal(r.ok, true);
  assert.equal(V.listVersions(p, 's05').length, 2);
  assert.doesNotMatch(sectionOf(read(p, 'work/feedback/r1.md'), '驗證'), /上次 finish/, '驗證換成最新的');
});

test('finish：這輪都沒改 ✖；--no-change 放行；只改第一層、字幕也算改；有段沒改只提醒', () => {
  const p = mk();
  const c = ctxOf(p);
  V.beginRound(c.P, {}, ['s05', 's08'], 's05 往左移', logTo(c));
  const { steps, calls } = stepsOf();
  let log = [];
  let r = V.finishRound(c.P, {}, (l) => log.push(l), steps);
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /這輪的段（s05、s08）都和改之前一樣 → 還沒改就先改 plan\.json 或 x 檔再跑一次；確定不用改就加 --no-change/);
  assert.equal(calls.build, 0, '還沒改就不用 build');
  r = V.finishRound(c.P, { 'no-change': true }, () => {}, steps);
  assert.equal(r.ok, true);
  const rows = sectionOf(read(p, 'work/feedback/r1.md'), '改了哪幾段');
  assert.match(rows, /^- s05 沒有改（和改之前一樣）$/m);
  assert.deepEqual([...rows.matchAll(/^- (\S+?)：(.+)$/gm)], [], '沒改的不算「已改」（剪輯台的 regex 對不上）');
  // 只改第一層
  const q = mk();
  const d = ctxOf(q);
  V.beginRound(d.P, {}, ['s05'], '換暗色', logTo(d));
  editPlan(q, (j) => { j.theme = 'dark'; });
  log = [];
  r = V.finishRound(d.P, {}, (l) => log.push(l), stepsOf().steps);
  assert.equal(r.ok, true);
  assert.match(sectionOf(read(q, 'work/feedback/r1.md'), '改了哪幾段'), /^- 全片：plan\.json 第一層 theme 改了$/m);
  assert.match(log.join('\n'), /⚠ s05 和改之前一樣：要改的話還沒改到/);
  // 只改字幕
  const w = mk();
  const e = ctxOf(w);
  V.beginRound(e.P, {}, ['s05'], '字幕錯字', logTo(e));
  touch(w, 'work/rough.srt', makeSrt({ n: 5 }).replace('第 1 句', '第一句'));
  r = V.finishRound(e.P, {}, () => {}, stepsOf().steps);
  assert.equal(r.ok, true);
  assert.match(sectionOf(read(w, 'work/feedback/r1.md'), '改了哪幾段'), /^- 字幕：work\/rough\.srt 改了$/m);
});

test('finish：begin 沒寫但改到的段一起驗證；太多段（重對句號）不全量；拿掉的段記下來', () => {
  const p = mk();
  const c = ctxOf(p);
  V.beginRound(c.P, {}, ['s05'], 's05 往左移', logTo(c));
  editPlan(p, (j) => { seg(j, 's05').css = { left: '-1px' }; seg(j, 's08').to = '#3'; j.scenes = j.scenes.filter((s) => s.id !== 's15'); });
  const { steps, calls } = stepsOf();
  const log = [];
  const r = V.finishRound(c.P, {}, (l) => log.push(l), steps);
  assert.equal(r.ok, true);
  assert.deepEqual(calls.audit, [['s05', 's08']]);
  assert.match(log.join('\n'), /⚠ 這輪也改到 s08（begin 沒寫）：一起驗證、存版本；改之前的樣子只在 plan\.json\.bak-r1/);
  assert.match(log.join('\n'), /回饋 r1：s05、s08；拿掉 s15/);
  const rows = sectionOf(read(p, 'work/feedback/r1.md'), '改了哪幾段');
  assert.match(rows, /^- s15：這段從 plan\.json 拿掉了$/m);
  assert.match(rows, /^- s08：to 「#2e」 → 「#3」（→ v1）$/m, '沒有改之前的版本：拿 plan.json.bak 比差異');
  assert.equal(V.listVersions(p, 's08').length, 1);
  // 重對句號：100 段都變了
  const many = Array.from({ length: 120 }, (_, i) => ({ id: `s${i + 1}`, scene: 'concept', from: `#${i + 1}`, to: `#${i + 1}e`, slots: { text: `卡 ${i}` } }));
  const q = mk(many);
  const d = ctxOf(q);
  V.beginRound(d.P, {}, ['s3'], 's3 往左移', logTo(d));
  editPlan(q, (j) => { for (const s of j.scenes) s.from = `${s.from}@詞`; seg(j, 's3').slots.text = '短'; });
  const k = stepsOf();
  const lg = [];
  const rr = V.finishRound(d.P, {}, (l) => lg.push(l), k.steps);
  assert.equal(rr.ok, true);
  assert.deepEqual(k.calls.audit, [['s3']], '不全量');
  assert.match(lg.join('\n'), /⚠ 另外 119 段和備份不一樣（多半是重對句號）/);
});

test('finish 之後自己看圖不對：改了再跑一次（同一輪、停點不重複、改法更新）；使用者回覆之後就要開下一輪；AI 自己寫的改法不蓋', () => {
  const p = mk();
  const c = ctxOf(p);
  V.beginRound(c.P, {}, ['s05'], 's05 往左移', logTo(c));
  editPlan(p, (j) => { seg(j, 's05').css = { left: '-120px' }; });
  V.finishRound(c.P, {}, () => {}, stepsOf().steps);
  assert.equal(V.openRound(p), null);
  editPlan(p, (j) => { seg(j, 's05').css = { left: '-200px' }; });
  const r = V.finishRound(c.P, {}, () => {}, stepsOf().steps);
  assert.equal(r.ok, true);
  assert.equal(r.round, 'r1');
  assert.deepEqual(stops(p).map((x) => x.state), ['待回覆'], '已經在等了：不重複記');
  let rows = sectionOf(read(p, 'work/feedback/r1.md'), '改了哪幾段');
  assert.match(rows, /^- s05：css\.left 無 → 「-200px」（v1 → v3）$/m);
  assert.equal([...rows.matchAll(/^- s05/gm)].length, 1, '同一段一列');
  assert.equal([...read(p, 'work/feedback/r1.md').matchAll(/^## 改了哪幾段/gm)].length, 1);
  // AI 把改法改成人話：再跑一次只更新版本號
  const f = path.join(p, 'work', 'feedback', 'r1.md');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/^- s05：.*$/m, '- s05：金句卡往左移 200px（v1 → v3）'));
  editPlan(p, (j) => { seg(j, 's05').css = { left: '-210px' }; });
  V.finishRound(c.P, {}, () => {}, stepsOf().steps);
  rows = sectionOf(read(p, 'work/feedback/r1.md'), '改了哪幾段');
  assert.match(rows, /^- s05：金句卡往左移 200px（v1 → v4）$/m);
  // 使用者回覆了：不能再算同一輪
  V.beginRound(c.P, {}, ['s08'], 's08 也改', logTo(c));
  assert.equal(V.openRound(p).n, 2, '下一輪');
  assert.ok(fs.existsSync(path.join(p, 'work', 'hyperframes', 'plan.json.bak-r2')));
  assert.deepEqual(stops(p).map((x) => x.state), ['待回覆', '修改後重停']);
  editPlan(p, (j) => { seg(j, 's08').to = '#3'; });
  V.finishRound(c.P, {}, () => {}, stepsOf().steps);
  assert.deepEqual(stops(p).map((x) => x.state), ['待回覆', '修改後重停', '待回覆']);
  // 使用者說通過之後：finish 不能再跑
  appendStop(p, { stop: '④ 完成影片預覽', state: '通過', said: '可以了' });
  assert.throws(() => V.finishRound(c.P, {}, () => {}, stepsOf().steps), /r2 已經 finish 過，使用者也回覆了 → 新的修改開下一輪：/);
});

test('finish：沒有開回饋輪、有提案卡著都有 →；改版流程 begin → new → accept → 做 → finish 存進提案那一版；退回 begin → use → finish', () => {
  const p = mk();
  const c = ctxOf(p);
  assert.throws(() => V.finishRound(c.P, {}, () => {}, stepsOf().steps), /還沒有開回饋輪 → 先跑 node shared\/template\/tools\/versions\.mjs begin --project .* --seg <段 id> --say "<使用者原話>"/);
  const none = RUN('finish', '--project', p);
  assert.equal(none.status, 1);
  assert.match(none.stderr, /^✖ 還沒有開回饋輪 →/);
  const flags = { 'no-preview': true };
  V.beginRound(c.P, flags, ['s12'], 's12 重新設計', logTo(c));
  const prop = V.newProposal(c.P, flags, 's12', logTo(c), 's12 重新設計');
  assert.equal(prop.n, 2);
  // 提案還沒確認：✖
  let r = V.finishRound(c.P, flags, () => {}, stepsOf().steps);
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /v2 分鏡還在等使用者確認 →/);
  let s = projectStatus(p);
  assert.match(s.at, /^改版／s12 v2（分鏡還沒給使用者確認）/, '改版的狀態蓋過回饋輪');
  assert.match(s.cmd, /--mark "③ 分鏡表（s12 v2）" --state 待回覆$/);
  // 確認了、還沒做：✖
  const f = path.join(p, 'work', 'versions', 's12', 'v2', '分鏡.md');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/- （寫 1–5 條.*/, '- 收尾加蓋章'));
  V.acceptProposal(c.P, 's12', logTo(c));
  r = V.finishRound(c.P, flags, () => {}, stepsOf().steps);
  assert.match(r.errors[0], /還和 v1 一模一樣：v2 的分鏡還沒做 →/);
  s = projectStatus(p);
  assert.match(s.at, /^改版／s12 v2（分鏡已確認，還沒做完）/);
  assert.match(s.cmd, /versions\.mjs finish --project /, '回饋輪開著：做完跑 finish');
  // 做好了
  touch(p, 'work/hyperframes/compositions/x-a.html', `${X1}<!-- 蓋章 -->\n`);
  const log = [];
  r = V.finishRound(c.P, flags, (l) => log.push(l), stepsOf().steps);
  assert.equal(r.ok, true);
  assert.deepEqual(r.versions[0], { id: 's12', before: 1, after: 2, compare: null });
  assert.equal(JSON.parse(read(p, 'work/versions/s12/v2/.meta.json')).state, '完成');
  assert.match(sectionOf(read(p, 'work/feedback/r1.md'), '改了哪幾段'), /^- s12：x-a\.html 改了（v1 → v2）$/m);
  // 退回：begin → use → finish（v2 → v1）
  V.beginRound(c.P, flags, ['s12'], 's12 用 v1', logTo(c));
  V.useVersion(c.P, flags, 's12', 'v1', logTo(c));
  r = V.finishRound(c.P, flags, () => {}, stepsOf().steps);
  assert.equal(r.ok, true);
  assert.deepEqual(r.versions[0], { id: 's12', before: 2, after: 1, compare: null });
  assert.match(sectionOf(read(p, 'work/feedback/r2.md'), '改了哪幾段'), /^- s12：x-a\.html 改了（v2 → v1）$/m);
});

test('要看的那一張：只有一段用 audit 拼好的；好幾段、有錄影段就拼成一張；audit 沒有 --sheet 也拼得出來；拼不出來一張一張列', () => {
  const p = mk();
  const c = ctxOf(p);
  V.beginRound(c.P, {}, ['s05'], 's05 往左移', logTo(c));
  editPlan(p, (j) => { seg(j, 's05').css = { left: '-1px' }; });
  const sheetFile = path.join(p, 'work', 'audit-shots', 'sheet-s05.jpg');
  touch(p, 'work/audit-shots/sheet-s05.jpg');
  const one = stepsOf({ audit() { return { ok: true, errors: [], warnings: [], findings: [], shots: [path.join(p, 'work/audit-shots/s05-1.00.jpg')], sheets: [{ id: 's05', file: sheetFile, count: 1 }] }; } });
  let log = [];
  let r = V.finishRound(c.P, {}, (l) => log.push(l), one.steps);
  assert.ok(r.shot.endsWith('sheet-s05.jpg'));
  assert.equal(one.calls.sheet, undefined, '不用另外拼');
  assert.match(log.join('\n'), /要看的截圖：.*sheet-s05\.jpg（由左到右、由上到下：s05 1 張）/);
  assert.match(sectionOf(read(p, 'work/feedback/r1.md'), '驗證'), /截圖：.*sheet-s05\.jpg/);
  // 好幾段＋錄影段：照段的順序拼一張
  V.beginRound(c.P, {}, ['s12', 's15', 's05'], '都改', logTo(c));
  editPlan(p, (j) => { seg(j, 's15').to = '#5'; seg(j, 's05').css = { left: '-2px' }; });
  touch(p, 'work/hyperframes/compositions/x-a.html', `${X1}<!-- 改 -->\n`);
  const many = stepsOf({
    audit() { return { ok: true, errors: [], warnings: [], findings: [], shots: ['s05-1.00.jpg', 's05-2.00.jpg', 's12-5.00.jpg'].map((f) => path.join(p, 'work/audit-shots', f)), sheets: [{ id: 's05', file: sheetFile }, { id: 's12', file: sheetFile }] }; },
    snapshot(P, list) { return list.map((x) => ({ id: x.id, file: path.join(p, 'work/audit-shots', `${x.id}-${x.t.toFixed(2)}.png`) })); },
  });
  log = [];
  r = V.finishRound(c.P, {}, (l) => log.push(l), many.steps);
  assert.ok(r.shot.endsWith('r2-sheet.jpg'));
  assert.deepEqual(many.calls.sheet.map((s) => s.id), ['s12', 's15', 's05', 's05'], '照 begin 寫的段順序');
  assert.match(log.join('\n'), /r2-sheet\.jpg（由左到右、由上到下：s12 1 張、s15 1 張、s05 2 張）/);
  // 拼不出來：一張一張列
  V.beginRound(c.P, {}, ['s05', 's08'], '再改', logTo(c));
  editPlan(p, (j) => { seg(j, 's05').css = { left: '-3px' }; });
  const noSheet = stepsOf({
    audit() { return { ok: true, errors: [], warnings: [], findings: [], shots: [path.join(p, 'work/audit-shots/s05-1.00.jpg')] }; },
    sheet() { throw new Error('拼不出 r3-sheet.jpg：ffmpeg 壞了'); },
  });
  log = [];
  r = V.finishRound(c.P, {}, (l) => log.push(l), noSheet.steps);
  assert.equal(r.ok, true, '截圖拼不出來不擋流程');
  assert.equal(r.shot, null);
  assert.match(log.join('\n'), /⚠ 拼不出 r3-sheet\.jpg：ffmpeg 壞了 → 下面的截圖一張一張看/);
  assert.match(log.join('\n'), /要看的截圖：\n {2}.*s05-1\.00\.jpg/);
});

test('長片（150 段）：finish 別段 200 則 ⚠ 只印數量，輸出行數固定；✖ 太多也截斷', () => {
  const scenes = Array.from({ length: 150 }, (_, i) => ({ id: `s${String(i + 1).padStart(3, '0')}`, scene: 'concept', from: `#${i + 1}`, to: `#${i + 1}e`, slots: { text: `第 ${i + 1} 張卡` } }));
  const p = mk(scenes);
  const c = ctxOf(p);
  V.beginRound(c.P, {}, ['s100'], 's100 字太多', logTo(c));
  editPlan(p, (j) => { seg(j, 's100').slots.text = '短'; });
  const noise = Array.from({ length: 200 }, (_, i) => `⚠ [s${String(i % 99 + 1).padStart(3, '0')} concept] 大約會蓋到講者框 25% → 用 snapshot 確認`).join('\n');
  const mineW = '⚠ [s100 concept] 大約會蓋到講者框 25% → 用 snapshot 確認';
  const log = [];
  const r = V.finishRound(c.P, {}, (l) => log.push(l), stepsOf({ build() { return { ok: true, out: `${BUILD_OK}\n${noise}\n${mineW}` }; } }).steps);
  assert.equal(r.ok, true);
  const out = log.join('\n');
  assert.ok(log.length < 25, `印了 ${log.length} 行`);
  assert.ok(out.includes(mineW), '改到的段的 ⚠ 要印');
  assert.doesNotMatch(out, /\[s001 concept\]/, '沒改到的段不印');
  assert.match(out, /build：✖ 0、⚠ 1（另外 99 則是沒改到的段，這輪不用管/);
  // ✖ 全部要修，但也不能爆版
  V.beginRound(c.P, {}, ['s101'], 's101 字太多', logTo(c));
  editPlan(p, (j) => { seg(j, 's101').slots.text = '短'; });
  const errs = Array.from({ length: 60 }, (_, i) => `✖ [s${String(i + 1).padStart(3, '0')} concept] 段長不夠 → 改`).join('\n');
  const lg = [];
  const rr = V.finishRound(c.P, {}, (l) => lg.push(l), stepsOf({ build() { return { ok: false, out: errs }; } }).steps);
  assert.equal(rr.ok, false);
  assert.ok(lg.length <= V.ROUND.maxErrors + 5, `印了 ${lg.length} 行`);
  assert.match(lg.join('\n'), /還有 40 個 ✖ → 跑 .*build\.mjs .*--check 看全部/);
});

test('CLI：new 印記停點的指令和停點 ③；accept 自己記通過（有開回饋輪就接 finish）；use 在回饋輪裡接 finish', () => {
  const p = mk();
  const n = RUN('new', '--project', p, '--seg', 's12', '--no-preview', '--note', '「重新設計」');
  assert.equal(n.status, 0, n.stderr);
  let L = n.stdout.trim().split('\n');
  assert.match(L.at(-3), /^→ 下一步：改每份 分鏡\.md/);
  assert.equal(L.at(-2), `node shared/template/tools/status.mjs --project ${p} --mark "③ 分鏡表（s12 v2）" --state 待回覆 --back "work/versions/s12/v2/分鏡.md"`);
  assert.match(L.at(-1), /^⏸ 停點 ③ 分鏡表（s12 v2）｜請看：.*分鏡\.md｜請回：「可以」或要改的拍$/);
  const mark = spawnSync(process.execPath, [path.join(TOOLS, 'status.mjs'), '--project', p, '--mark', '③ 分鏡表（s12 v2）', '--state', '待回覆', '--back', 'work/versions/s12/v2/分鏡.md'], { encoding: 'utf8' });
  assert.equal(mark.status, 0, mark.stderr);
  assert.deepEqual(projectStatus(p).waiting, ['③ 分鏡表（s12 v2）']);
  const f = path.join(p, 'work', 'versions', 's12', 'v2', '分鏡.md');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/- （寫 1–5 條.*/, '- 收尾加蓋章'));
  const a = RUN('accept', '--project', p, '--seg', 's12', '--say', '可以');
  assert.equal(a.status, 0, a.stderr);
  assert.match(a.stdout, /停點紀錄：\| .* \| ③ 分鏡表（s12 v2） \| 通過 \| 「可以」 \| work\/storyboard\.md \|/);
  L = a.stdout.trim().split('\n');
  assert.equal(L.at(-1), `node shared/template/tools/versions.mjs save --project ${p} --seg s12`, '沒開回饋輪：save');
  assert.deepEqual(projectStatus(p).waiting, []);
  // 回饋輪裡：accept 接 finish
  const q = mk();
  const c = ctxOf(q);
  V.beginRound(c.P, { 'no-preview': true }, ['s12'], 's12 重新設計', logTo(c));
  RUN('new', '--project', q, '--seg', 's12', '--no-preview');
  const g = path.join(q, 'work', 'versions', 's12', 'v2', '分鏡.md');
  fs.writeFileSync(g, fs.readFileSync(g, 'utf8').replace(/- （寫 1–5 條.*/, '- 收尾加蓋章'));
  L = RUN('accept', '--project', q, '--seg', 's12').stdout.trim().split('\n');
  assert.equal(L.at(-1), `node shared/template/tools/versions.mjs finish --project ${q}`);
  // 回饋輪裡：use 接 finish；沒開回饋輪接 build
  const w = mk();
  const e = ctxOf(w);
  V.saveSeg(e.P, {}, 's05', logTo(e));
  editPlan(w, (j) => { seg(j, 's05').slots.text = '第二版'; });
  V.beginRound(e.P, {}, ['s05'], 's05 用 v1', logTo(e));
  L = RUN('use', '--project', w, '--seg', 's05', '--ver', 'v1', '--no-preview').stdout.trim().split('\n');
  assert.equal(L.at(-1), `node shared/template/tools/versions.mjs finish --project ${w}`);
  const r = V.finishRound(e.P, {}, () => {}, stepsOf().steps);
  assert.deepEqual(r.versions[0], { id: 's05', before: 2, after: 1, compare: null });
  L = RUN('use', '--project', w, '--seg', 's05', '--ver', 'v2', '--no-preview').stdout.trim().split('\n');
  assert.equal(L.at(-1), `node shared/template/tools/build.mjs --project ${w}`);
});

test('長片：status 的輸出不跟著段數變長（一輪改 30 段、60 段動畫沒做）', () => {
  const scenes = Array.from({ length: 150 }, (_, i) => ({ id: `s${String(i + 1).padStart(3, '0')}`, scene: 'concept', from: `#${i + 1}`, to: `#${i + 1}e`, ...(i % 2 ? { design: true, story: { idea: `構想 ${i}` } } : {}), slots: { text: `第 ${i + 1} 張卡` } }));
  const p = mk(scenes);
  touch(p, 'assets/camera/a.mp4');
  const log = ['## 停點紀錄', '', '| 時間 | 停點 | 狀態 | 使用者原話 | 寫回哪裡 |', '|---|---|---|---|---|', '| 2026-11-02 10:00 | ③ 分鏡表 | 通過 | 「可以」 | plan.json |', ''].join('\n');
  for (const f of ['work/main.mp4', 'work/cuts.md', 'work/rough.mp4', 'work/rough.srt.align-1', 'work/transcript.json', 'work/cutpoints.json', 'work/構圖預覽.jpg']) touch(p, f, 'x', 900);
  touch(p, 'work/製作進度.md', log);
  touch(p, 'work/hyperframes/.cache/storyboard.json', JSON.stringify({ at: Date.now() + 5000 }));
  touch(p, 'work/hyperframes/plan.json', JSON.stringify({ version: 1, speakerBox: [1, 2, 3, 4], scenes }), 10);
  let s = projectStatus(p);
  assert.match(s.at, /做動畫（還沒做：s002、s004.*…）/);
  assert.ok(JSON.stringify(s).length < 2500, `${JSON.stringify(s).length} bytes`);
  const c = ctxOf(p);
  V.beginRound(c.P, {}, scenes.slice(0, 30).map((x) => x.id), '前 30 段都改', logTo(c));
  s = projectStatus(p);
  assert.match(s.at, /^回饋輪 r1／s001.*…（還沒 finish）$/);
  assert.ok(s.at.length < 80);
});

test('--json：begin、finish 都只印一個 JSON', () => {
  const p = mk();
  const r = RUN('begin', '--project', p, '--seg', 's05', '--say', 'x', '--json');
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.round, 'r1');
  assert.equal(j.segs[0], 's05');
  assert.deepEqual(j.blocks[0].seg.id, 's05');
  // 沒改：finish --json 也是一個 JSON、結束碼 1
  const f = RUN('finish', '--project', p, '--json');
  assert.equal(f.status, 1);
  assert.equal(JSON.parse(f.stdout).ok, false);
});

test('CLI：--help 有 begin、finish；參數名字錯有 →', () => {
  const h = RUN('--help').stdout;
  for (const s of ['versions.mjs begin --project', 'versions.mjs finish --project', '--preview', '--no-preview', '--no-change']) assert.ok(h.includes(s), s);
  const p = mk();
  assert.match(RUN('finish', '--project', p, '--nope').stderr, /沒有 --nope 這個參數 →/);
});

// ---------- 真的跑（ffmpeg、Chrome）----------

const chrome = await hasChrome();
test('一輪回饋實際跑一次：begin → 改 plan → finish（真的 build、audit、snapshot、拼圖），印的截圖真的在', { skip: (spawnSync('ffmpeg', ['-version']).status !== 0 || !chrome) && '沒有 ffmpeg 或 Chrome', timeout: 180000 }, () => {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-round-real-'));
  tmps.push(p);
  for (const d of ['camera', 'voice', 'screen', 'images']) fs.mkdirSync(path.join(p, 'assets', d), { recursive: true });
  fs.mkdirSync(path.join(p, 'work', 'hyperframes'), { recursive: true });
  const ff = (...a) => { const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...a]); assert.equal(r.status, 0, String(r.stderr)); };
  ff('-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '20', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', path.join(p, 'work', 'rough.mp4'));
  ff('-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=30', '-frames:v', '1', path.join(p, 'assets', 'images', 'shot.png'));
  fs.copyFileSync(path.join(p, 'work', 'rough.mp4'), path.join(p, 'assets', 'camera', 'a.mp4'));
  fs.writeFileSync(path.join(p, 'work', 'rough.srt'), makeSrt({ n: 5 }));
  const plan = { version: 1, speakerBox: [700, 200, 1220, 1000], look: false, scenes: [
    { id: 's01', scene: 'concept', from: '#1', to: '#2', slots: { text: '**第一張**：說明' } },
    { id: 's02', type: 'media', src: 'assets/images/shot.png', from: '#2', to: '#3' },
    { id: 's03', scene: 'concept', from: '#3', to: '#4', slots: { text: '**第三張**：說明' } },
  ] };
  fs.writeFileSync(path.join(p, 'work', 'hyperframes', 'plan.json'), JSON.stringify(plan, null, 2) + '\n');
  const B = spawnSync(process.execPath, [path.join(TOOLS, 'build.mjs'), '--project', p], { encoding: 'utf8' });
  assert.equal(B.status, 0, B.stdout + B.stderr);
  const c = ctxOf(p);
  const r0 = V.beginRound(c.P, {}, ['s03', 's02'], 's03 字太多', logTo(c));
  assert.equal(r0.round, 'r1');
  editPlan(p, (j) => { seg(j, 's03').slots.text = '**短一點**：說明'; });
  const log = [];
  // 真的 build、check、audit、snapshot；只有剪輯台和背景 render 不開（測試結束要收）
  const r = V.finishRound(c.P, {}, (l) => log.push(l), { editor: () => 'http://127.0.0.1:1/?view=final', prerender: () => {} });
  assert.equal(r.ok, true, log.join('\n'));
  const out = log.join('\n');
  assert.match(out, /audit --only s03：✖ 0/);
  assert.match(out, /錄影段（audit 不量）：s02 截 /);
  assert.match(out, /版本：s03 v1 → v2；s02 v1（沒變）/);
  for (const k of ['人聲響度', '音效比例', '剪接點微淡化', '講者調光', '講者瘦臉', '結尾配樂']) assert.match(out, new RegExp(`^${k}`, 'm'), k);
  assert.ok(r.shot, out);
  const shot = path.resolve(r.shot);
  assert.ok(fs.statSync(shot).size > 1000, '拼圖真的在');
  assert.ok(fs.readdirSync(path.join(p, 'work', 'audit-shots')).some((f) => /^s02-.*\.png$/.test(f)), '錄影段的 snapshot');
  assert.equal(fs.existsSync(path.join(p, 'work', 'hyperframes', '.round-shots')), false, '暫存收掉');
  assert.match(sectionOf(read(p, 'work/feedback/r1.md'), '驗證'), /截圖：/);
  assert.deepEqual(stops(p).map((x) => x.state), ['待回覆']);
  // 每格標段號與時間的拼圖真的拼得出來
  const sized = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width', '-of', 'csv=p=0', shot], { encoding: 'utf8' }).stdout.trim();
  assert.equal(sized, '1920', '有 Chrome：標籤版');
  assert.deepEqual(fs.readdirSync(path.join(p, 'work', 'audit-shots')).filter((f) => /\.html$|sheet\.jpg\.png$/.test(f)), [], '暫存收掉');
  // 只改一段（沒有錄影段）：用 audit --sheet 拼好的
  V.beginRound(c.P, {}, ['s03'], 's03 再短', logTo(c));
  editPlan(p, (j) => { seg(j, 's03').slots.text = '**再短**：說明'; });
  const r2 = V.finishRound(c.P, {}, () => {}, { editor: () => null, prerender: () => {} });
  assert.equal(r2.ok, true);
  assert.ok(r2.shot.endsWith('sheet-s03.jpg'), r2.shot);
  assert.match(r2.stopLine, /<完成影片預覽網址>/, '剪輯台開不起來：留佔位');
  assert.ok(r2.warnings.some((w) => /剪輯台沒開起來.*editor\.mjs/.test(w)));
});
