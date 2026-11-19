// 062：versions.mjs learn——把這集的回饋輪（原話、建議改規則）、剪輯台手改、字幕手改、改版紀錄整理成 work/feedback/learn.md；
// AI 寫的候選規則（learn-rules.json）做成選擇頁；剪輯台的 /api/learn 和 deliver.mjs 回報給同一行指令。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { TOOLS, TEMPLATE, imp, makeSrt, tmpDir } from './helpers.mjs';

const V = await imp('versions.mjs');
const { pathsFrom } = await imp('build.mjs');
const L = await imp('lib/learn.mjs');
const { rqMarkdown } = await imp('lib/requests-md.mjs');
const { startEditor } = await imp('editor.mjs');

const write = (p, rel, text) => { const f = path.join(p, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); return f; };
const read = (p, rel) => fs.readFileSync(path.join(p, ...rel.split('/')), 'utf8');
const editPlan = (p, fn) => { const f = path.join(p, 'work', 'hyperframes', 'plan.json'); const j = JSON.parse(fs.readFileSync(f, 'utf8')); fn(j); fs.writeFileSync(f, JSON.stringify(j, null, 2) + '\n'); };
const seg = (j, id) => j.scenes.find((s) => s.id === id);
const sectionOf = (md, title) => md.split(new RegExp(`^## ${title}.*$`, 'm'))[1]?.split(/^## /m)[0] ?? '';
// 指令列：--template 指到這個 tmp 工作區（偏好.md 讀這裡的，不讀 repo 的）
const RUN = (cwd, ...a) => spawnSync(process.execPath, [path.join(TOOLS, 'versions.mjs'), ...a, '--template', path.join(cwd, 'shared', 'template')], { encoding: 'utf8', cwd });

// 工作區（tmp）：shared/偏好.md 有一條「照做」、一條「不採用」；專案在 projects/ep 底下
function workspace(t) {
  const root = tmpDir(t, 'learn-');
  fs.mkdirSync(path.join(root, 'shared'), { recursive: true });
  fs.symlinkSync(TEMPLATE, path.join(root, 'shared', 'template'), 'dir');
  write(root, 'shared/偏好.md', '# 偏好\n\n## 照做\n\n- 金句卡最多 12 個字（r1，2026-11-01）\n\n## 不採用\n\n- 每段都加音效（r2，2026-11-02）\n');
  const p = path.join(root, 'projects', 'ep');
  for (const d of ['camera', 'voice', 'screen', 'images']) fs.mkdirSync(path.join(p, 'assets', d), { recursive: true });
  write(p, 'work/rough.srt', makeSrt({ n: 6 }));
  write(p, 'work/storyboard.md', '# 分鏡表\n\n### s05｜金句\n- 金句\n');
  write(p, 'work/hyperframes/plan.json', JSON.stringify({ version: 1, theme: 'light', scenes: [
    { id: 's05', scene: 'quote', from: '#1', to: '#1e', slots: { text: '這是一句太長太長的金句' } },
    { id: 's08', scene: 'concept', from: '#2', to: '#2e', slots: { text: '第二張' } },
    { id: 's12', type: 'custom', src: 'compositions/x-a.html', layout: 'fullscreen', from: '#3', to: '#3e', sfx: 'impact' },
  ] }, null, 2) + '\n');
  write(p, 'work/hyperframes/compositions/x-a.html', '<template id="x-a"><div>主持人</div></template>\n');
  return { root, p, P: pathsFrom({ project: p, template: path.join(root, 'shared', 'template') }) };
}
// 換掉 finish 的 build／audit：不用 ffmpeg、Chrome（feedback-round.test.mjs 同一套）
const STEPS = {
  build: () => ({ ok: true, out: '專案：ep\n人聲響度 −20 LUFS → −14 LUFS' }),
  check: (P) => ({ ok: true, format: 'landscape', items: JSON.parse(fs.readFileSync(P.plan, 'utf8')).scenes.map((s, i) => ({ id: s.id, type: s.type || 'scene', out: { start: i * 4, end: i * 4 + 3 } })) }),
  audit: () => ({ ok: true, errors: [], warnings: [], findings: [], shots: [] }),
  snapshot: () => [],
  editor: () => 'http://127.0.0.1:4400/?view=final',
  prerender() {},
  sheet: (P, shots, out) => { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, 'x'); return out; },
};
const quiet = () => {};
// 在 r<N>.md 的「建議改規則：」後面補幾條（AI 照 feedback-round.md 寫的樣子）
function addRules(p, round, rules) {
  const f = path.join(p, 'work', 'feedback', `${round}.md`);
  const md = fs.readFileSync(f, 'utf8').replace(/^建議改規則：.*$/m, `建議改規則：\n${rules.map((r) => `- ${r}`).join('\n')}`);
  fs.writeFileSync(f, md);
}

// 三輪：r1 口頭回饋、r2 照修改單改（s08 換模板）、r3 退回 s05 v1；剪輯台手改剪接、音量、音效；字幕改字
function threeRounds(t) {
  const w = workspace(t);
  const { p, P } = w;
  V.beginRound(P, {}, ['s05'], 's05 金句字太多，以後金句都短一點', quiet);
  editPlan(p, (j) => { seg(j, 's05').slots.text = '短一點'; });
  assert.equal(V.finishRound(P, {}, quiet, STEPS).ok, true);
  addRules(p, 'r1', ['金句卡最多 12 個字（文件）', '清單每一項只留關鍵詞（文件）']);

  write(p, 'work/feedback/editor-requests.md', rqMarkdown({ project: 'projects/ep', stamp: '2026-11-19 10:00', items: [
    { id: 's08', label: '第二張', what: '資訊卡 concept', out: [4, 7], span: '#2 → #2e', kind: 'anim', tags: ['文字少一點', '換一種動畫'], note: '以後清單的字都少一點', subs: [] },
    { id: 's12', label: '主持人', what: '動畫', out: [8, 11], span: '#3 → #3e', kind: 'anim', tags: ['動作慢一點'], note: '', subs: [] },
  ] }));
  V.beginRound(P, { requests: true }, [], undefined, quiet);
  editPlan(p, (j) => { const s = seg(j, 's08'); s.scene = 'quote'; s.slots = { text: '少' }; });
  const r2 = path.join(p, 'work', 'feedback', 'r2.md');
  fs.writeFileSync(r2, fs.readFileSync(r2, 'utf8').replace(/^## 改了哪幾段\n\n.*$/m, '## 改了哪幾段\n\n- s12：沒做，動作速度是模板固定的'));
  assert.equal(V.finishRound(P, {}, quiet, STEPS).ok, true);
  addRules(p, 'r2', ['清單每一項只留關鍵詞（文件）', '每段都加音效（程式檢查）']);

  assert.equal(V.useAndFinish(P, {}, 's05', 'v1', quiet, STEPS).ok, true);

  // 剪輯台手改（plan.json 的 edit、captionMarks、段的 sfx；memory.json 記原本的音效）
  editPlan(p, (j) => {
    j.edit = { cuts: [[0, 0.4], [10, 11.5]], fadeIn: 0.3, volume: { voice: 2, sfx: -3 }, joins: [{ at: 10, type: 'dip', dur: 0.3 }, { at: 15, type: 'dip', dur: 0.3 }], sfx: [{ at: 3, sound: 'ding' }, { at: 9, sound: 'ding' }] };
    j.captionMarks = ['#2'];
    seg(j, 's12').sfx = 'click';
    seg(j, 's12').sfxVolume = -4;
  });
  write(p, 'work/hyperframes/.editor/memory.json', JSON.stringify({ sfx: { s12: { had: true, value: 'impact', set: 'click' } } }));
  // 字幕：srt-align 第一次排好的那份是基準；之後改字、合併
  write(p, 'work/.cache/rough-first.srt', makeSrt({ n: 6 }));
  const cur = makeSrt({ n: 6 }).replace('第 2 句字幕內容', '第 2 句字幕內文').replace('第 4 句字幕內容', '第 4 句字幕內文')
    .replace(/5\n00:00:15,000 --> 00:00:18,000\n第 5 句字幕內容\n\n6\n00:00:18,500 --> 00:00:21,500\n第 6 句字幕內容\n/, '5\n00:00:15,000 --> 00:00:21,500\n第 5 句字幕內容第 6 句字幕內容\n');
  write(p, 'work/rough.srt', cur);
  return w;
}

test('learn.md：原話同類歸在一起、建議改規則合併計次並標「已是規則」「說過不要」、剪輯台手改、字幕常改的字、換模板與退回', (t) => {
  const { root, p } = threeRounds(t);
  const r = L.writeLearn({ root, project: p, now: new Date('2026-11-19T12:00:00') });
  assert.equal(r.rel, 'projects/ep/work/feedback/learn.md');
  const md = read(p, 'work/feedback/learn.md');
  assert.equal(md, r.md);
  assert.match(md, /^# 這集的調整紀錄（projects\/ep）\n/);
  assert.match(md, /references\/learn-habits\.md/, '開頭告訴 AI 照哪份做');
  // 1. 原話：r1 口頭、r2 修改單兩段（s12 沒寫描述＝標籤），同類歸一組、標次數
  const said = sectionOf(md, '1\\. 使用者說過的話');
  assert.match(said, /### 字、文案（2 次）/);
  assert.match(said, /- r1 s05：「s05 金句字太多，以後金句都短一點」 → slots\.text 「這是一句太長太長的金句」 → 「短一點」/);
  assert.match(said, /- r2 s08：「以後清單的字都少一點」（要改：文字少一點、換一種動畫）/);
  assert.match(said, /### 時間、節奏（1 次）\n\n- r2 s12：（沒寫描述）（要改：動作慢一點） → 沒有改/);
  assert.match(said, /修改單勾的標籤：文字少一點×1、換一種動畫×1、動作慢一點×1|修改單勾的標籤：.*動作慢一點×1/);
  // 2. 建議改規則：同一句合併、標次數與輪次；偏好.md 有的標出來
  const rules = sectionOf(md, '2\\. 建議改規則');
  assert.match(rules, /- 清單每一項只留關鍵詞（文件）（2 次：r1、r2）\n/, '出現兩次的排前面');
  assert.match(rules, /- 金句卡最多 12 個字（文件）（1 次：r1）——已是規則（shared\/偏好\.md「照做」第 1 條）/);
  assert.match(rules, /- 每段都加音效（程式檢查）（1 次：r2）——使用者說過不要/);
  // 3. 剪輯台手改
  const ed = sectionOf(md, '3\\. 剪輯台手改');
  assert.match(ed, /剪掉 2 處，共 1\.9 秒（含片頭裁掉 0\.4 秒）/);
  assert.match(ed, /淡入 0\.3 秒/);
  assert.match(ed, /音量：人聲 \+2 dB、全部音效 -3 dB/);
  assert.match(ed, /剪接點轉場：過黑 2 個/);
  assert.match(ed, /自己加的音效 2 顆：ding×2/);
  assert.match(ed, /換了音效 1 段：s12 impact→click/);
  assert.match(ed, /重點字幕 1 則/);
  assert.match(ed, /和 work\/\.cache\/rough-first\.srt 比：改字 2 則、分割 0、合併 1、刪掉 0、新增 0/);
  assert.match(ed, /常改的字：「容」→「文」×2|常改的字：.*「容」→「文」/);
  assert.match(ed, /例 #2：「第 2 句字幕內容」→「第 2 句字幕內文」/);
  // 4. 改版紀錄：s08 換資訊卡（finish 存的版本看得出來）、s05 退回 v1
  const ver = sectionOf(md, '4\\. 改版紀錄');
  assert.match(ver, /- 換模板：s08 資訊卡 concept → 資訊卡 quote（r2）/);
  assert.match(ver, /- 退回：s05 用 v1（r3）/);
  assert.deepEqual(r.counts, { rounds: 3, quotes: 4, rules: 3, known: 1, edits: r.counts.edits, subtitles: 3, swaps: 1, redesigns: 0, reverts: 1 });
  assert.ok(r.counts.edits >= 7, `剪輯台手改項數：${r.counts.edits}`);
  // 複製的那一行：指到 learn.md 和 references/learn-habits.md、第一步是 learn 指令
  assert.equal(r.line, L.learnLine('projects/ep'));
  assert.match(r.line, /^照這集的調整紀錄學我的習慣（projects\/ep\/work\/feedback\/learn\.md）：照 auto-edit-review 的 references\/learn-habits\.md 做.*第一步跑 node shared\/template\/tools\/versions\.mjs learn --project "projects\/ep"$/);
});

test('learn：沒有回饋、沒有手改時每節寫「（沒有）」；字幕沒有基準時說明、改用最早的 rough.srt.bak', (t) => {
  const { root, p } = workspace(t);
  const md = L.buildLearn({ root, project: p }).md;
  assert.equal((md.match(/^（沒有）$/gm) || []).length, 6, md);
  assert.match(md, /- 回饋輪：沒有（沒開過回饋輪）/);
  assert.match(md, /### 字幕（rough\.srt）\n\n- （沒有初剪字幕的底稿.*work\/\.cache\/rough-first\.srt）/);
  write(p, 'work/rough.srt.bak-20260101-000000', makeSrt({ n: 6 }).replace('第 3 句字幕內容', '第 3 句字幕內文'));
  const md2 = L.buildLearn({ root, project: p }).md;
  assert.match(md2, /和 work\/rough\.srt\.bak-20260101-000000 比：改字 1 則/);
});

test('srtDiff：改字、分割、合併、刪掉、新增、重新斷句、只調時間各自算', () => {
  const c = (n, a, b, text) => ({ n, start: a, end: b, text });
  const base = [c(1, 0, 2, '甲乙丙'), c(2, 2, 4, '丁戊'), c(3, 4, 6, '己庚辛壬'), c(4, 6, 8, '癸子'), c(5, 8, 9, '丑寅'), c(6, 9, 10, '卯辰'), c(7, 10, 11, '巳午')];
  const cur = [c(1, 0, 2, '甲乙丁'), c(2, 2.5, 4, '丁戊'), c(3, 4, 5, '己庚'), c(4, 5, 6, '辛壬'), c(5, 6, 8, '癸子丑寅'), c(6, 10, 11, '巳午'), c(7, 11, 12, '新的一句')];
  const d = L.srtDiff(base, cur);
  assert.equal(d.edited.length, 1);
  assert.equal(d.split.length, 1);
  assert.equal(d.merged.length, 1);
  assert.equal(d.removed.length, 1);
  assert.equal(d.added.length, 1);
  assert.equal(d.retimed, 1, '#2 起點差 0.5 秒（超過 0.2 秒）');
  assert.deepEqual([...d.subs], [['「丙」→「丁」', 1]]);
  // 只加標點也算改字（不是重新斷句）；兩則字一樣、斷點不同＝重新斷句
  const p = L.srtDiff([c(1, 0, 1, '大家好我是鼎淵')], [c(1, 0, 1, '大家好，我是鼎淵')]);
  assert.deepEqual([p.edited.length, p.resplit, [...p.subs]], [1, 0, [['加「，」', 1]]]);
  const r = L.srtDiff([c(1, 0, 1, '甲乙'), c(2, 1, 2, '丙丁')], [c(1, 0, 1, '甲'), c(2, 1, 2, '乙丙丁')]);
  assert.deepEqual([r.edited.length, r.resplit], [0, 1]);
});

test('learn-rules.json 驗欄位（✖ 有 →）；選擇頁照落點分組、內嵌資料、主色跟著工作區', (t) => {
  const { root, p } = workspace(t);
  assert.throws(() => L.readRules(p), /讀不到 learn-rules\.json.*→ 照 references\/learn-habits\.md 第 2 步/);
  write(p, 'work/feedback/learn-rules.json', JSON.stringify({ rules: [{ id: 'X', text: '', where: '別的', evidence: 'r1' }, { id: 'L2', text: 'a', where: '偏好', evidence: 'r1' }, { id: 'L2', text: 'b', where: '偏好', evidence: 'r2' }] }));
  assert.throws(() => L.readRules(p), (e) => /id 要寫 L1、L2…/.test(e.message) && /text 是空的/.test(e.message) && /where 要是 偏好／改預設／程式檢查/.test(e.message) && /「L2」重複了/.test(e.message) && /→ 改好再跑一次$/.test(e.message));
  const rules = [
    { id: 'L1', text: '清單每一項只留關鍵詞，最多 4 個字', where: '偏好', evidence: 'r1 s05、r2 s08（2 次）', now: '照講稿摘一句', change: '只留關鍵詞', cost: '術語要拆開' },
    { id: 'L2', text: '剪接點預設過黑 0.3 秒', where: '改預設', evidence: '剪輯台：過黑 2 個', now: '直接切', change: '過黑', cost: '節奏慢一點' },
    { id: 'L3', text: '金句超過 12 個字時 build 給 ⚠', where: '程式檢查', evidence: 'r1 s05' },
  ];
  write(p, 'work/feedback/learn-rules.json', JSON.stringify({ rules }));
  const got = L.readRules(p);
  assert.deepEqual(got.map((r) => [r.id, r.where]), [['L1', '偏好'], ['L2', '改預設'], ['L3', '程式檢查']]);
  assert.equal(got[2].cost, '');
  const { file, data } = L.rulesPage({ templateDir: TEMPLATE, project: p, rel: 'projects/ep', rules: got });
  assert.equal(file, path.join(p, 'work', 'feedback', 'learn-choices.html'));
  const html = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(html, /__SITE_DATA__|\/\*__BRAND__\*\//, '佔位都換掉了');
  assert.match(html, /--brand:/);
  assert.equal(data.file, 'projects/ep/work/feedback/learn-rules.json');
  const json = JSON.parse(/<script type="application\/json" id="siteData">(.*?)<\/script>/s.exec(html)?.[1] ?? 'null');
  assert.deepEqual(json.rules.map((r) => r.id), ['L1', 'L2', 'L3']);
  assert.doesNotMatch(html.replace(/<\/script>/g, ''), /<\/scr/, '資料裡的 < 都轉成 \\u003c，不會提早結束 script');
});

test('versions.mjs learn：印計數與下一步（--page）；沒有紀錄時 ⚠、不給下一步；--page 沒寫規則 ✖ 有 →', (t) => {
  const { root } = threeRounds(t);
  const a = RUN(root, 'learn', '--project', 'projects/ep');
  assert.equal(a.status, 0, a.stderr);
  assert.match(a.stdout, /✓ projects\/ep\/work\/feedback\/learn\.md：回饋 3 輪、原話 4 則、建議改規則 3 條（已是規則 1）/);
  assert.match(a.stdout, /→ 下一步：.*learn-habits\.md 第 2 步.*\nnode shared\/template\/tools\/versions\.mjs learn --project projects\/ep --page/);
  const b = RUN(root, 'learn', '--project', 'projects/ep', '--page');
  assert.notEqual(b.status, 0);
  assert.match(b.stderr, /✖ 讀不到 learn-rules\.json.*→/);
  write(path.join(root, 'projects', 'ep'), 'work/feedback/learn-rules.json', JSON.stringify({ rules: [{ id: 'L1', text: '清單只留關鍵詞', where: '偏好', evidence: 'r1、r2' }] }));
  const c = RUN(root, 'learn', '--project', 'projects/ep', '--page');
  assert.equal(c.status, 0, c.stderr);
  assert.match(c.stdout, /✓ 選擇頁：projects\/ep\/work\/feedback\/learn-choices\.html（1 條：偏好 1、改預設 0、程式檢查 0）/);
  assert.match(c.stdout, /learn-habits\.md 第 4 步/);
  const { root: empty } = workspace(t);
  const d = RUN(empty, 'learn', '--project', 'projects/ep');
  assert.equal(d.status, 0, d.stderr);
  assert.match(d.stdout, /⚠ 這集沒有調整紀錄/);
  assert.doesNotMatch(d.stdout, /→ 下一步/);
});

test('剪輯台 POST /api/learn：寫 learn.md，回傳要複製的那一行（和 deliver.mjs 回報裡的同一行）', async (t) => {
  const { root, p } = threeRounds(t);
  const editor = await startEditor({ flags: { project: p, template: path.join(root, 'shared', 'template') }, cwd: root, port: 0, writeState: false });
  try {
    const r = await fetch(new URL('/api/learn', editor.url), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.file, 'projects/ep/work/feedback/learn.md');
    assert.equal(j.line, L.learnLine('projects/ep'));
    assert.equal(j.counts.rounds, 3);
    assert.match(read(p, 'work/feedback/learn.md'), /### 字、文案（2 次）/);
    const bad = await fetch(new URL('/api/learn', editor.url), { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://evil.example' }, body: '{}' });
    assert.equal(bad.status, 403, '別的網站送來的擋下');
  } finally { await editor.close(); }
  const CLI = await imp('deliver.mjs'), D = await imp('lib/deliver.mjs');
  const P = pathsFrom({ project: p, template: path.join(root, 'shared', 'template') });
  const lines = CLI.finishLines(P, { ...D.newJob(), ok: true, source: 'render', warnings: [], errors: [], qc: { ok: true, errors: 0, warnings: 0, checks: [], format: { width: 1920, height: 1080, fps: 30, hasAudio: true }, duration: { actual: 10 }, sheet: null } }, { size: 1024 });
  assert.ok(lines.includes(`想讓之後的影片更像你，把這行貼給 AI：${L.learnLine('projects/ep')}`), lines.join('\n'));
});
