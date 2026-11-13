// 032 B6：拍點只存一處（specs/032-arch-optimizations/beats-single-source.md §6 的驗證）。
// 用 projects/example（以及 projects/t029b，作者刪掉之前）的複本；真實專案一個字都不動。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { WORKSPACE, TOOLS, TEMPLATE, imp, lib, tmpDir } from './helpers.mjs';

const B = await imp('build.mjs');
const S = await imp('lib/beat-source.mjs');
const F = await imp('lib/custom-fill.mjs');
const BT = await imp('lib/audit-beats.mjs');

const EX = path.join(WORKSPACE, 'projects', 'example');
const T29 = path.join(WORKSPACE, 'projects', 't029b');
const SKIP_COPY = ['assets', 'output', 'work/main.mp4', 'work/storyboard-preview', 'work/design', 'work/audit-shots', 'work/versions', 'work/feedback'];
// 複本放在 <暫存>/projects/<名稱>（專案標籤才是 projects/<名稱>）；原始素材、輸出、截圖不抄
// 收尾：--review、finish 會在背景開剪輯台（寫進專案資料夾），先關掉再刪
function copyProject(t, src) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'b6-'));
  const dir = path.join(root, 'projects', path.basename(src));
  t.after(() => {
    if (fs.existsSync(path.join(dir, 'work', 'storyboard-preview')) || fs.existsSync(path.join(dir, 'work', 'feedback'))) spawnSync(process.execPath, [path.join(TOOLS, 'editor.mjs'), '--stop', '--project', dir], { cwd: root, encoding: 'utf8', timeout: 30000 });
    try { fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { /* 系統暫存，刪不掉不影響結果 */ }
  });
  // 保留修改時間：build 才不會以為素材變了重新轉檔
  fs.cpSync(src, dir, { recursive: true, preserveTimestamps: true, filter: (f) => !SKIP_COPY.includes(path.relative(src, f).split(path.sep).join('/')) });
  return { dir, P: B.pathsFrom({ project: dir }) };
}
const run = (tool, args, opts = {}) => spawnSync(process.execPath, [path.join(TOOLS, tool), ...args], { encoding: 'utf8', timeout: 600000, maxBuffer: 1 << 28, ...opts });
const read = (f) => fs.readFileSync(f, 'utf8');
const planOf = (P) => JSON.parse(read(P.plan));
const writePlan = (P, plan) => fs.writeFileSync(P.plan, `${JSON.stringify(plan, null, 2)}\n`);
const segOf = (plan, id) => plan.scenes.find((s) => s.id === id);
const refsIn = (md, id) => S.refList(BT.parseBeatSheets(md).get(id));

// 小專案：只有 work/hyperframes（plan.json、compositions），給 owner 判斷的單元測試
function miniProject(t) {
  const root = tmpDir(t, 'b6-mini-');
  const out = path.join(root, 'projects', 'mini', 'work', 'hyperframes');
  fs.mkdirSync(path.join(out, 'compositions'), { recursive: true });
  return { root, P: { project: path.dirname(path.dirname(out)), out, plan: path.join(out, 'plan.json'), templateDir: TEMPLATE } };
}

// ---------- 步驟 1：正本模組＋遷移 ----------

test('步驟 1：owner 判斷——模板沒手改＝plan、改一個字＝script／hand、design＝script／design、src＝script／src、字卡與 media＝none', async (t) => {
  const L = await lib();
  const { P } = miniProject(t);
  const spec = F.readFillSpec(L.customDir, 'x-point');
  const base = { id: 'x01', type: 'custom', template: 'x-point', from: '#1', to: '#2e', slots: spec.sample };
  const fresh = () => structuredClone(base);   // 每次像 build 一樣重新讀的段（沒有 materializeFills 記的 __fillState、src）
  const seg = fresh();
  F.materializeFills({ plan: { version: 1, scenes: [seg] }, outDir: P.out, lib: L });
  assert.equal(seg.__fillState, 'missing', '第一次產生前檔還不在');
  assert.deepEqual(S.beatOwnerOf(P, fresh(), { lib: L }), { owner: 'plan', why: 'template' });
  assert.equal(F.fillStateOf({ seg: fresh(), outDir: P.out, lib: L }), 'tool');
  const file = path.join(P.out, F.fillFileOf(seg));
  fs.writeFileSync(file, read(file).replace('</template>', '<!-- 改 --></template>'));
  assert.deepEqual(S.beatOwnerOf(P, fresh(), { lib: L }), { owner: 'script', why: 'hand' });
  const again = fresh();
  F.materializeFills({ plan: { version: 1, scenes: [again] }, outDir: P.out, lib: L });
  assert.equal(again.__fillState, 'hand', 'materializeFills 判斷也一樣（同一個 fillStateOf）');
  assert.deepEqual(S.beatOwnerOf(P, { id: 'd1', type: 'custom', design: true }), { owner: 'script', why: 'design' });
  assert.deepEqual(S.beatOwnerOf(P, { id: 'h1', type: 'custom', src: 'compositions/x-hand.html' }), { owner: 'script', why: 'src' });
  for (const s of [{ id: 's1', scene: 'key-point' }, { id: 'f1', type: 'fx', fx: '01' }, { id: 'm1', type: 'media', src: 'assets/a.mp4' }]) assert.equal(S.beatOwnerOf(P, s).owner, 'none', s.id);
});

test('步驟 1：遷移——example 複本 --migrate-beats --dry-run 印 x0105 那一行、不寫檔', (t) => {
  const { dir, P } = copyProject(t, EX);
  const r = run('build.mjs', ['--project', dir, '--migrate-beats', '--dry-run']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /x0105：分鏡表的拍（#12@開拍、#13@手機）和 plan\.json（#12@拍、#13@旁邊）不同，之後以 plan\.json 為準，分鏡表下次產生時更新/);
  assert.ok(!fs.existsSync(path.join(dir, 'work', 'designs')), '不寫檔');
  assert.ok(!fs.existsSync(S.beatsMarkOf(P)), '--dry-run 不記標記');
  assert.equal(read(path.join(dir, 'work', 'storyboard.md')), read(path.join(EX, 'work', 'storyboard.md')), 'storyboard.md 不動');
});

test('步驟 1：遷移——t029b 複本的 s0108（手改、沒有鏡位腳本）→ 建 work/designs/s0108.md，表＝storyboard.md 那張；再跑一次不動', { skip: !fs.existsSync(T29) && 'projects/t029b 不在（作者刪掉了）' }, async (t) => {
  const { dir, P } = copyProject(t, T29);
  const f = path.join(dir, 'work', 'designs', 's0108.md');
  assert.ok(!fs.existsSync(f));
  const r1 = S.ensureBeatsV2(P, { lib: () => B.loadLib(P.templateDir, P.project) });
  assert.equal(r1.ran, true);
  assert.ok(r1.lines.includes('s0108 的動畫檔手改過：拍點改 work/designs/s0108.md（工具剛照分鏡表建好）'), r1.lines.join('\n'));
  const sb = read(path.join(dir, 'work', 'storyboard.md'));
  assert.deepEqual(BT.parseBeatSheets(read(f)).get('s0108').rows.map((x) => [x.beat, x.said, x.what]), BT.parseBeatSheets(sb).get('s0108').rows.map((x) => [x.beat, x.said, x.what]));
  assert.match(read(f), /^概念：模板 x-scene 手改（拍點改下面這張表；plan\.json 這段 slots 的綁詞不再生效）/);
  assert.deepEqual(JSON.parse(read(S.beatsMarkOf(P))).moved, ['s0108']);
  const m0 = fs.statSync(f).mtimeMs;
  const r2 = S.ensureBeatsV2(P, { lib: () => { throw new Error('標記在就不該載 lib'); } });
  assert.equal(r2.ran, false);
  assert.equal(fs.statSync(f).mtimeMs, m0, '再跑一次不動');
  assert.equal(read(path.join(dir, 'work', 'storyboard.md')), sb, '遷移不寫 storyboard.md');
});

// ---------- 步驟 2：讀的人只讀正本 ----------

const FL = await imp('lib/flow.mjs');
const auditOf = (dir, only) => {
  const r = run('audit.mjs', ['--project', dir, '--only', only, '--json']);
  let j = null;
  try { j = JSON.parse(r.stdout); } catch { assert.fail(`audit --json 讀不懂：${r.stdout.slice(-400)}${r.stderr.slice(-400)}`); }
  return j;
};
const beatErrors = (j, id) => (j.findings || []).filter((f) => f.id === id && /^beats-/.test(f.rule) && f.level === 'error');
const later = (f) => { const t = new Date(Date.now() + 60_000); fs.utimesSync(f, t, t); };

test('步驟 2 S1：模板段改 slots 的綁詞 → build → audit 照 slots 對拍（不看過期的分鏡表）；storyboard.md 沒被碰', (t) => {
  const { dir, P } = copyProject(t, EX);
  const sbFile = path.join(dir, 'work', 'storyboard.md'), sb = read(sbFile);
  const plan = planOf(P);
  segOf(plan, 'x0107').slots.flow = '#21@下載';
  writePlan(P, plan);
  const b = run('build.mjs', ['--project', dir]);
  assert.equal(b.status, 0, b.stdout.slice(-800) + b.stderr.slice(-800));
  const j = auditOf(dir, 'x0107');
  assert.deepEqual((j.findings || []).filter((f) => f.id === 'x0107' && /^beats-(missing|extra)$/.test(f.rule)).map((f) => f.msg), []);
  assert.equal(read(sbFile), sb, 'storyboard.md 沒被碰');
});

test('步驟 2 S2＋--review 快取：手改模板段的動畫檔多一拍 → audit 印 seed 那一行、建 work/designs/<段>.md、1 個 beats-extra 指到那個檔；表加一列 → 0 個；只改 storyboard.md 的表不重量、改 designs 重量那段', (t) => {
  const { dir, P } = copyProject(t, EX);
  const comp = path.join(P.out, 'compositions', 'x-scene-x0110.html');
  const html = read(comp);
  assert.ok(html.includes("const T3 = P.at('#49@順手');"));
  fs.writeFileSync(comp, html.replace("const T3 = P.at('#49@順手');", "const T3 = P.at('#49@順手');\n    const T9 = P.at('#45@體力');"));
  const f = path.join(dir, 'work', 'designs', 'x0110.md');
  const j1 = auditOf(dir, 'x0110');
  assert.ok((j1.notes || []).includes('x0110 的動畫檔手改過：拍點改 work/designs/x0110.md（工具剛照分鏡表建好）'), JSON.stringify(j1.notes));
  assert.ok(fs.existsSync(f), 'designs 建好了');
  const e1 = beatErrors(j1, 'x0110');
  assert.deepEqual(e1.map((x) => x.rule), ['beats-extra'], JSON.stringify(e1));
  assert.match(e1[0].fix, /work\/designs\/x0110\.md/);
  const md = read(f), at = md.split('\n').findIndex((l) => l.includes('`#47@手機`'));
  assert.ok(at > 0);
  const lines = md.split('\n');
  lines.splice(at, 0, '| 1b | `#45@體力` | 體力條往下掉 | 彈出（體力條） | 體力條 | — | — | panelTop |');
  fs.writeFileSync(f, lines.join('\n'));
  const j2 = auditOf(dir, 'x0110');
  assert.deepEqual(beatErrors(j2, 'x0110').map((x) => x.msg), []);

  // --review 的雜湊：storyboard.md 是副本，只改它的動畫分鏡不重量；改正本（designs）重量那一段
  const h1 = FL.reviewNow(P);
  assert.ok(h1, 'reviewNow 算得出來');
  const sbFile = path.join(dir, 'work', 'storyboard.md');
  fs.writeFileSync(sbFile, read(sbFile).replace('兩支手機（標籤「兩支手機」）', '三支手機（標籤「三支手機」）'));
  later(sbFile);
  assert.deepEqual(FL.reviewNow(P).segs, h1.segs, '只改 storyboard.md：每段雜湊都沒變');
  fs.writeFileSync(f, read(f).replace('體力條往下掉', '體力條掉到底'));
  const h3 = FL.reviewNow(P);
  const diff = Object.keys(h1.segs).filter((id) => h1.segs[id] !== h3.segs[id]);
  assert.deepEqual(diff, ['x0110'], '改 designs：只重量那一段');
});

test('步驟 2 S4：內容設計段 designs 比 storyboard.md 舊、兩張表不同 → audit 照 designs', { skip: !fs.existsSync(T29) && 'projects/t029b 不在（作者刪掉了）' }, (t) => {
  const { dir, P } = copyProject(t, T29);
  S.ensureBeatsV2(P, { lib: () => B.loadLib(P.templateDir, P.project) });   // 遷移做過了（不然 storyboard.md 那張會在遷移時贏最後一次）
  assert.ok(segOf(planOf(P), 's0105').design);
  // storyboard.md 的 s0105 放一張和 designs 不同的表（第 2 拍綁別句），而且比較新
  const sbFile = path.join(dir, 'work', 'storyboard.md'), sb = read(sbFile);
  const table = S.beatBlocksOf(read(path.join(dir, 'work', 'designs', 's0105.md')), 's0105');
  assert.ok(table.includes('`#18@腳架`'));
  const lines = sb.split('\n'), h = lines.findIndex((l) => l.startsWith('### s0105'));
  assert.ok(h >= 0);
  let end = h + 1;
  while (end < lines.length && !/^#{1,3}\s/.test(lines[end])) end++;
  lines.splice(end, 0, table.replace('`#18@腳架`', '`#17`'), '');
  fs.writeFileSync(sbFile, lines.join('\n'));
  later(sbFile);
  assert.deepEqual(refsIn(read(sbFile), 's0105').filter((x) => x.startsWith('#17')), ['#17']);
  assert.ok(fs.statSync(path.join(dir, 'work', 'designs', 's0105.md')).mtimeMs < fs.statSync(sbFile).mtimeMs);
  assert.deepEqual(beatErrors(auditOf(dir, 's0105'), 's0105').map((x) => x.msg), []);
});

test('步驟 2 autofix：storyboard.md 在、模板段兩拍隔太近 → build.mjs --autofix 併拍成功', (t) => {
  const { dir, P } = copyProject(t, EX);
  assert.ok(fs.existsSync(path.join(dir, 'work', 'storyboard.md')));
  const r = run('build.mjs', ['--project', dir, '--autofix', '--only', 'x0111']);
  assert.equal(r.status, 0, r.stdout.slice(-800) + r.stderr.slice(-800));
  assert.match(r.stdout, /x0111：第 \d+ 拍併進第 \d+ 拍/);
  const ats = segOf(planOf(P), 'x0111').slots.items.map((x) => x.at);
  assert.ok(new Set(ats).size < ats.length, `兩拍綁同一個詞：${ats.join('、')}`);
});

// ---------- 步驟 3：分鏡表的動畫分鏡從正本重產＋網頁寫回 ----------

const SM = await imp('editor/storyboard-md.mjs');
const ST = await imp('lib/storyboard-state.mjs');
const rootOf = (dir) => path.dirname(path.dirname(dir));
const sbOf = (dir) => path.join(dir, 'work', 'storyboard.md');
const BEAT_HEAD = '| 拍 | 講到（綁句） | 畫面上出現什麼 | 動態（設計系統語彙） | 焦點 | 音效拍點 |\n|---|---|---|---|---|---|';
// 分鏡表某段第 n 拍的「畫面上出現什麼」換字（網頁送來的 cell op）
const editCell = (dir, id, beat, from, to) => {
  const f = sbOf(dir), md = read(f), row = BT.parseBeatSheets(md).get(id).rows.find((r) => r.beat === String(beat));
  fs.writeFileSync(f, SM.applyStoryboardEdit(md, { op: 'cell', line: row.line - 1, col: 2, text: row.what.replace(from, to) }));
};

test('步驟 3-1：內容設計段在網頁改動畫分鏡第 2 拍「」裡的字 → --apply-storyboard 寫回 work/designs/<段>.md；分鏡表和正本一致、不算 dirty', (t) => {
  const { dir, P } = copyProject(t, EX);
  const td = run('build.mjs', ['--project', dir, '--to-design', 'x0113'], { cwd: rootOf(dir) });
  assert.equal(td.status, 0, td.stdout.slice(-800) + td.stderr.slice(-800));
  assert.match(read(sbOf(dir)), /- 拍點正本：work\/designs\/x0113\.md/, '--to-design 之後分鏡表那段指到正本');
  const f = path.join(dir, 'work', 'designs', 'x0113.md');
  fs.writeFileSync(f, ['概念：三格依序亮起', '', '#### 動畫分鏡 x0113', '', BEAT_HEAD,
    '| 0 | 段起點 | 標題「本集三個部分」 | 開場 | 標題 | — |', '| 1 | `#64@下載` | 第一格「實作」 | 彈出（第一格） | 第一格 | — |',
    '| 2 | `#66@安裝` | 第二格「安裝」 | 彈出（第二格） | 第二格 | — |', '| 3 | `#68@AI` | 第三格「AI」 | 彈出（第三格） | 第三格 | — |', ''].join('\n'));
  const r0 = S.refreshStoryboard(P, planOf(P), { only: ['x0113'] });   // 設計師寫好之後的分鏡表（--storyboard --only 也是這樣產生）
  assert.deepEqual(r0.changed, ['x0113']);
  editCell(dir, 'x0113', 2, '安裝', '設定');
  assert.ok(ST.storyboardDirty(P));
  const r = run('build.mjs', ['--project', dir, '--apply-storyboard', '--said', '可以'], { cwd: rootOf(dir) });
  assert.equal(r.status, 0, r.stdout.slice(-800) + r.stderr.slice(-800));
  assert.match(r.stdout, /改：x0113 動畫分鏡第 2 拍「第二格「安裝」」→「第二格「設定」」（寫回 work\/designs\/x0113\.md）/);
  assert.equal(BT.parseBeatSheets(read(f)).get('x0113').rows[2].what, '第二格「設定」');
  assert.equal(S.beatBlocksOf(read(sbOf(dir)), 'x0113'), S.beatBlocksOf(read(f), 'x0113'), '分鏡表＝正本');
  assert.equal(ST.storyboardDirty(P), false);
});

test('步驟 3-2：模板段手改分鏡表一列的綁詞 → --apply-storyboard 印 ⚠（表和 slots 兩邊的詞都印），那張表換回 slots 產生的', (t) => {
  const { dir, P } = copyProject(t, EX);
  ST.recordStoryboard(P, read(sbOf(dir)));
  const before = refsIn(read(sbOf(dir)), 'x0107');
  const md = read(sbOf(dir)), at = md.indexOf('#### 動畫分鏡 x0107');
  fs.writeFileSync(sbOf(dir), md.slice(0, at) + md.slice(at).replace('`#21@電腦`', '`#21@下載`'));
  assert.notDeepEqual(refsIn(read(sbOf(dir)), 'x0107'), before);
  const r = run('build.mjs', ['--project', dir, '--apply-storyboard', '--said', '可以'], { cwd: rootOf(dir) });
  assert.equal(r.status, 0, r.stdout.slice(-800) + r.stderr.slice(-800));
  assert.match(r.stdout, /⚠ x0107 的動畫分鏡是照 plan\.json 的 slots 產生的，表上手改的拍不會生效：第 5 拍 #21@下載（表）／#21@電腦（slots） → 改 plan\.json 這段 slots 的 flow，再跑 build\.mjs --storyboard --only x0107/);
  assert.deepEqual(refsIn(read(sbOf(dir)), 'x0107'), before, '表換回 slots 產生的');
  assert.equal(segOf(planOf(P), 'x0107').slots.flow, '#21@電腦', 'slots 不動');
});

test('步驟 3-3：③ 通過後改 slots → --review 更新分鏡表那段、印「跟著正本更新」；status 的階段是 ④，不是「③ 通過，套回 plan.json」', { timeout: 300000 }, (t) => {
  const { dir, P } = copyProject(t, EX);
  const root = rootOf(dir), proj = 'projects/example';
  ST.recordStoryboard(P, read(sbOf(dir)), { at: Date.now() - 3600e3 });
  const m = run('status.mjs', ['--project', proj, '--mark', '③ 分鏡表', '--state', '通過', '--said', '可以'], { cwd: root });
  assert.equal(m.status, 0, m.stdout + m.stderr);
  const plan = planOf(P);
  segOf(plan, 'x0107').slots.flow = '#21@下載';
  writePlan(P, plan);
  const r = run('build.mjs', ['--project', proj, '--review', '--no-prerender'], { cwd: root });
  assert.equal(r.status, 0, r.stdout.slice(-1500) + r.stderr.slice(-800));
  assert.match(r.stdout, /分鏡表的動畫分鏡跟著正本更新：[^\n]*x0107/);
  assert.ok(refsIn(read(sbOf(dir)), 'x0107').includes('#21@下載'));
  const s = run('status.mjs', ['--project', proj, '--json'], { cwd: root });
  const j = JSON.parse(s.stdout);
  assert.notEqual(j.stage, 'S10', `${j.stage} ${j.at}`);
  assert.doesNotMatch(j.at, /③ 通過，把分鏡表的修改套回/);
  assert.match(j.at, /④/);
});

test('步驟 3-3b：有進度標記的專案（--apply-storyboard 記了 apply-storyboard）→ 改 slots、--review 重寫分鏡表之後，status 一樣不回到 ③', { timeout: 300000 }, (t) => {
  const { dir, P } = copyProject(t, EX);
  const root = rootOf(dir), proj = 'projects/example';
  const a = run('build.mjs', ['--project', proj, '--apply-storyboard', '--said', '可以'], { cwd: root });
  assert.equal(a.status, 0, a.stdout.slice(-800) + a.stderr.slice(-800));
  assert.ok(JSON.parse(read(path.join(dir, 'work', '.jobs', 'state.json'))).steps['apply-storyboard'], '--apply-storyboard 記了標記');
  const plan = planOf(P);
  segOf(plan, 'x0107').slots.flow = '#21@下載';
  writePlan(P, plan);
  const r = run('build.mjs', ['--project', proj, '--review', '--no-prerender'], { cwd: root });
  assert.equal(r.status, 0, r.stdout.slice(-1500) + r.stderr.slice(-800));
  assert.match(r.stdout, /分鏡表的動畫分鏡跟著正本更新：[^\n]*x0107/);
  const j = JSON.parse(run('status.mjs', ['--project', proj, '--json'], { cwd: root }).stdout);
  assert.notEqual(j.stage, 'S10', `${j.stage} ${j.at}`);
  assert.match(j.at, /④/);
});

test('步驟 3-4：分鏡表 dirty（③ 待回覆、使用者在網頁改到一半）→ refresh 不寫、印那一行；--to-design 也一樣', (t) => {
  const { dir, P } = copyProject(t, EX);
  ST.recordStoryboard(P, read(sbOf(dir)));
  fs.writeFileSync(sbOf(dir), read(sbOf(dir)).replace('- 音效：', '- 補充說明：還在想\n- 音效：'));
  const md = read(sbOf(dir));
  const r = S.refreshStoryboard(P, planOf(P));
  assert.equal(r.skipped, 'dirty');
  assert.equal(r.line, '分鏡表有改動還沒套回，動畫分鏡這次沒更新');
  assert.equal(read(sbOf(dir)), md, '不寫');
  const td = run('build.mjs', ['--project', dir, '--to-design', 'x0113'], { cwd: rootOf(dir) });
  assert.equal(td.status, 0, td.stdout.slice(-800) + td.stderr.slice(-800));
  assert.match(td.stdout, /分鏡表有改動還沒套回，動畫分鏡這次沒更新/);
  assert.equal(read(sbOf(dir)), md, '--to-design 也不寫');
});

// ---------- 步驟 4：versions ----------

const V = await imp('versions.mjs');
const handEdit = (P, id, file, find, add) => { const f = path.join(P.out, 'compositions', file); fs.writeFileSync(f, read(f).replace(find, `${find}\n    ${add}`)); };
const quiet = () => { const logs = []; return { logs, log: (l) => logs.push(l) }; };

test('步驟 4-1：手改模板段 save → 版本裡有 鏡位腳本.md；use 退回沒手改的版 → designs 搬到 .old/、owner 回到 plan', (t) => {
  const { dir, P } = copyProject(t, EX);
  const { log } = quiet(), flags = { 'no-preview': true };
  const v1 = V.saveSeg(P, flags, 'x0110', log);
  assert.ok(!fs.existsSync(path.join(v1.dir, '鏡位腳本.md')), '沒手改：拍點在 plan.json，不存鏡位腳本');
  handEdit(P, 'x0110', 'x-scene-x0110.html', "const T3 = P.at('#49@順手');", '// 手改');
  const b = run('build.mjs', ['--project', dir]);
  assert.equal(b.status, 0, b.stdout.slice(-800) + b.stderr.slice(-800));
  assert.match(b.stdout, /x0110 的動畫檔手改過：拍點改 work\/designs\/x0110\.md/);
  const f = path.join(dir, 'work', 'designs', 'x0110.md');
  assert.ok(fs.existsSync(f));
  const v2 = V.saveSeg(P, flags, 'x0110', log);
  assert.equal(v2.n, 2);
  assert.equal(read(path.join(v2.dir, '鏡位腳本.md')), read(f), '手改模板段：鏡位腳本一起存');
  V.useVersion(P, flags, 'x0110', 'v1', log);
  assert.ok(!fs.existsSync(f), 'designs 搬走了');
  const olds = fs.readdirSync(path.join(dir, 'work', 'designs', '.old')).filter((n) => n.startsWith('x0110-'));
  assert.equal(olds.length, 1);
  assert.equal(S.beatOwnerOf(P, segOf(planOf(P), 'x0110'), { lib: B.loadLib(P.templateDir, P.project) }).owner, 'plan');
});

test('步驟 4-2：模板段提案加一拍、accept 後只改了別的字（slots 的綁詞沒照提案改）→ finish 印 promised 的 ⚠', { timeout: 300000 }, (t) => {
  const { dir, P } = copyProject(t, EX);
  const { logs, log } = quiet(), flags = { 'no-preview': true };
  V.beginRound(P, flags, ['x0108'], 'x0108 多一拍主持人', log);
  const pr = V.newProposal(P, flags, 'x0108', log, 'x0108 多一拍主持人');
  const md = read(pr.file).replace(/^- （寫 1–5 條[^\n]*$/m, '- 多一拍：講到主持人時第四站亮起');
  const lines = md.split('\n'), k = lines.findIndex((l) => l.includes('`#30@訪談`'));
  assert.ok(k > 0, md);
  lines.splice(k + 1, 0, '| 4 | `#31@主持人` | 第四站「主持人」 | 彈出（第四站） | 第四站 | — |');
  fs.writeFileSync(pr.file, lines.join('\n'));
  V.acceptProposal(P, 'x0108', log);
  const meta = JSON.parse(read(path.join(path.dirname(pr.file), '.meta.json')));
  assert.ok(meta.promised.includes('#31@主持人'), JSON.stringify(meta.promised));
  const plan = planOf(P);
  segOf(plan, 'x0108').slots.title = '多機拍攝的三種情境';
  writePlan(P, plan);
  const rep = V.finishRound(P, flags, log);
  assert.deepEqual(rep.errors, [], logs.join('\n'));
  assert.ok(rep.warnings.some((w) => /^⚠ x0108：v\d+ 提案確認的拍是 [^\n]*#31@主持人[^\n]*，現在 plan\.json 產生的是 [^\n]* → 照提案改 slots；模板做不到就交給子代理手改動畫檔（拍點會移到 work\/designs\/x0108\.md）/.test(w)), rep.warnings.join('\n'));
});

test('步驟 4-3：內容設計段提案 accept → work/designs/<段>.md 的表＝提案的表（舊的備份在 .old/）；storyboard.md 那節一致', (t) => {
  const { dir, P } = copyProject(t, EX);
  const { log } = quiet(), flags = { 'no-preview': true };
  const td = run('build.mjs', ['--project', dir, '--to-design', 'x0113'], { cwd: rootOf(dir) });
  assert.equal(td.status, 0, td.stdout.slice(-800) + td.stderr.slice(-800));
  const f = path.join(dir, 'work', 'designs', 'x0113.md');
  fs.writeFileSync(f, ['概念：三格依序亮起', '', '#### 動畫分鏡 x0113', '', BEAT_HEAD,
    '| 0 | 段起點 | 標題「本集三個部分」 | 開場 | 標題 | — |', '| 1 | `#64@下載` | 第一格「實作」 | 彈出（第一格） | 第一格 | — |', ''].join('\n'));
  S.refreshStoryboard(P, planOf(P), { only: ['x0113'], force: true });
  const pr = V.newProposal(P, flags, 'x0113', log, 'x0113 多一格');
  const md = read(pr.file).replace(/^- （寫 1–5 條[^\n]*$/m, '- 多一格：安裝');
  const lines = md.split('\n'), k = lines.findIndex((l) => l.includes('`#64@下載`'));
  assert.ok(k > 0, md);
  lines.splice(k + 1, 0, '| 2 | `#66@安裝` | 第二格「安裝」 | 彈出（第二格） | 第二格 | — |');
  fs.writeFileSync(pr.file, lines.join('\n'));
  V.acceptProposal(P, 'x0113', log);
  assert.deepEqual(refsIn(read(f), 'x0113'), ['#64@下載', '#66@安裝']);
  assert.equal(S.beatBlocksOf(read(f), 'x0113'), S.beatBlocksOf(read(pr.file), 'x0113'), 'designs 的表＝提案的表');
  assert.match(read(f), /^概念：三格依序亮起/, '表以外的行留著');
  assert.ok(fs.readdirSync(path.join(dir, 'work', 'designs', '.old')).some((n) => n.startsWith('x0113-')), '舊的備份');
  const sb = read(sbOf(dir));
  assert.equal(S.beatBlocksOf(sb, 'x0113'), S.beatBlocksOf(read(f), 'x0113'));
  assert.match(sb, /- 拍點正本：work\/designs\/x0113\.md/);
});

// ---------- P3c 回報：--merge-drafts 的檢查和 --check-draft 同一個等級 ----------

test('--merge-drafts：第一拍來不及做完開場（audit 是 ✖）合併時就 ✖，不產生分鏡表、不停 ③', (t) => {
  const { dir } = copyProject(t, EX);
  const sb = read(sbOf(dir));
  const r = run('build.mjs', ['--project', dir, '--merge-drafts', '--force'], { cwd: rootOf(dir) });
  assert.equal(r.status, 1, r.stdout.slice(-1500));
  assert.match(r.stdout, /^✖ \[x0107 custom\] 動畫分鏡：第一拍 \S+ 在段內 /m);
  assert.match(r.stdout, /^✖ \[x0113 custom\] 動畫分鏡：第一拍 \S+ 在段內 /m);
  assert.match(r.stdout, /^未通過：2 個 ✖/m);
  assert.doesNotMatch(r.stdout, /^通過：/m);
  assert.doesNotMatch(r.stdout, /⏸ 停點 ③/);
  assert.match(r.stdout, /→ 下一步：照 ✖ 改（改那一份 work\/drafts\/chNN\.json，再合併一次）/);
  assert.equal(read(sbOf(dir)), sb, '沒有產生分鏡表');
});

// ---------- 步驟 5：字幕重對連正本 ----------

const W = await imp('editor/server/write.mjs');
const RM = await imp('lib/beat-remap.mjs');
const backups = (f) => fs.readdirSync(path.dirname(f)).filter((n) => n.startsWith(`${path.basename(f)}.align-`));

test('步驟 5：剪輯台把 #63 分成兩句 → plan.json、鏡位腳本、動畫檔在那之後的句號都 +1（各有 .align-* 備份），audit 0 個 beats ✖；srt-align --remap-plan 重新斷句 → 一起換回來', { timeout: 300000 }, (t) => {
  const { dir, P } = copyProject(t, EX);
  const root = rootOf(dir);
  const td = run('build.mjs', ['--project', dir, '--to-design', 'x0113'], { cwd: root });
  assert.equal(td.status, 0, td.stdout.slice(-800) + td.stderr.slice(-800));
  const animRel = F.designFileOf(segOf(planOf(P), 'x0113'));
  const f = path.join(dir, 'work', 'designs', 'x0113.md'), anim = path.join(P.out, animRel);
  fs.writeFileSync(f, ['概念：三格依序亮起', '', '#### 動畫分鏡 x0113', '', BEAT_HEAD,
    '| 0 | 段起點 | 標題「本集三個部分」 | 開場 | 標題 | — |', '| 1 | `#64@下載`＋0.2 | 第一格「實作」 | 彈出（第一格） | 第一格 | — |', ''].join('\n'));
  const html = read(anim);
  assert.ok(html.includes('const P = SceneMotion('));
  fs.writeFileSync(anim, html.replace(/(const P = SceneMotion\([^\n]*\n)/, "$1    const T1 = P.at('#64@下載', 0.2);\n"));
  const seg0 = segOf(planOf(P), 'x0113');
  assert.deepEqual([seg0.from, seg0.to], ['#62+1.3', '#70e']);

  // 剪輯台：applySave（純函式）算出新的 plan.json、rough.srt → 寫好 → remapScriptsAfterSave（editor.mjs 存檔後呼叫）
  // 分 #63（x0113 段內、第一拍 #64 之前）：之後沒有別的模板段（模板段字串欄位的句號、moods 剪輯台本來就不重對，不在這次範圍）
  const planText = read(P.plan), srtText = read(P.srt), ops = [{ op: 'split', n: 63, at: 137 }];
  const s = W.applySave(planText, { srt: { ops } }, { srtText });
  assert.deepEqual(s.errors, []);
  fs.writeFileSync(P.plan, s.text);
  fs.writeFileSync(P.srt, s.srtText);
  const lib = B.loadLib(P.templateDir, P.project);
  const r = W.remapScriptsAfterSave(P, { planBefore: planText, srtTextBefore: srtText, ops, lib });
  assert.deepEqual(r, { scripts: ['work/designs/x0113.md'], anims: [`work/hyperframes/${animRel}`] });
  assert.deepEqual([segOf(planOf(P), 'x0113').from, segOf(planOf(P), 'x0113').to], ['#62+1.3', '#71e']);
  assert.match(read(f), /\| 1 \| `#65@下載`＋0\.2 \|/);
  assert.match(read(anim), /P\.at\('#65@下載', 0\.2\)/);
  assert.equal(backups(f).length, 1);
  assert.equal(backups(anim).length, 1);
  const b = run('build.mjs', ['--project', dir], { cwd: root });
  assert.equal(b.status, 0, b.stdout.slice(-800) + b.stderr.slice(-800));
  assert.deepEqual(beatErrors(auditOf(dir, 'x0113'), 'x0113').map((x) => x.msg), []);

  // srt-align --remap-plan：照講稿重新斷句（分開的那句合回去）→ 鏡位腳本、動畫檔照時間換回 #64
  const a = run('media.mjs', ['srt-align', '--project', dir, '--remap-plan'], { cwd: root });
  assert.equal(a.status, 0, a.stdout.slice(-1500) + a.stderr.slice(-800));
  assert.match(a.stdout, new RegExp(`情境動畫的 P\\.at 句號一起換：${animRel.replace(/[.]/g, '\\.')}（各自備份 \\.align-<時間戳>）`));
  assert.match(a.stdout, /鏡位腳本的「講到」句號一起換：work\/designs\/x0113\.md（各自備份 \.align-<時間戳>）/);
  assert.deepEqual([segOf(planOf(P), 'x0113').from, segOf(planOf(P), 'x0113').to], ['#62+1.3', '#70e']);
  assert.match(read(f), /\| 1 \| `#64@下載`＋0\.2 \|/);
  assert.match(read(anim), /P\.at\('#64@下載', 0\.2\)/);
  assert.equal(backups(f).length, 2);
  assert.equal(backups(anim).length, 2);
  const b2 = run('build.mjs', ['--project', dir], { cwd: root });
  assert.equal(b2.status, 0, b2.stdout.slice(-800) + b2.stderr.slice(-800));
  assert.deepEqual(beatErrors(auditOf(dir, 'x0113'), 'x0113').map((x) => x.msg), []);
});

test('步驟 5：remapBeatTable 只換「#### 動畫分鏡」表的「講到」欄（說明文字、別的表、別的欄不動）；media.mjs 照舊匯出 remapCustomRefs', async () => {
  const mp = { map: (r) => ({ ...r, n: r.n + 1 }) };
  const md = ['概念：#6 那句講到的東西（說明不動）', '', '#### 動畫分鏡 d1', '', BEAT_HEAD,
    '| 0 | 段起點 | 畫面「#6」 | 開場 | 標題 | — |', '| 1 | `#6@詞`＋0.3 | 第 #6 句 | 彈出 | 主卡 | — |', '| 2 | `#7e` | 收 | 淡出 | 主卡 | — |', '',
    '#### 插圖清單 d1', '', '| 元件 | 來源 | 怎麼來 |', '|---|---|---|', '| #6 | 畫廊 | — |', ''].join('\n');
  const out = RM.remapBeatTable(md, mp, 'd1');
  assert.deepEqual(out.split('\n').filter((l, i) => l !== md.split('\n')[i]), ['| 1 | `#7@詞`＋0.3 | 第 #6 句 | 彈出 | 主卡 | — |', '| 2 | `#8e` | 收 | 淡出 | 主卡 | — |']);
  const M = await imp('media.mjs');
  assert.equal(M.remapCustomRefs, RM.remapCustomRefs);
});
