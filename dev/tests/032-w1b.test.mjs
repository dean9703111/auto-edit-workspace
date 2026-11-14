// 032 W1b：build.mjs --set／--unset（lib/plan-set.mjs）、--to-design、--show 收時間、--framing／--framing-done（lib/framing-flow.mjs）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { TEMPLATE, TOOLS, imp, makeSrt, hasFfmpeg, fixture } from './helpers.mjs';

const S = await imp('lib/plan-set.mjs');
const F = await imp('lib/framing-flow.mjs');
const B = await imp('build.mjs');
const NO_FF = !hasFfmpeg() && '沒有 ffmpeg';

function tmp(t, prefix = 'w1b-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
// 專案資料夾：<root>/projects/p1（shared/template 連到這份）；plan 給物件就寫成 2 格縮排，給字串照原文
function project(t, { plan = null, camera = true, video = false } = {}) {
  const root = tmp(t);
  fs.mkdirSync(path.join(root, 'shared', 'sfx'), { recursive: true });
  fs.symlinkSync(TEMPLATE, path.join(root, 'shared', 'template'), 'dir');
  const proj = path.join(root, 'projects', 'p1'), out = path.join(proj, 'work', 'hyperframes');
  fs.mkdirSync(out, { recursive: true });
  fs.mkdirSync(path.join(proj, 'assets', camera ? 'camera' : 'voice'), { recursive: true });
  fs.writeFileSync(path.join(proj, 'assets', camera ? 'camera' : 'voice', camera ? 'a.mp4' : 'a.wav'), '');
  if (video) {
    const src = fixture('w1b-rough.mp4', (f) => spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '12', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', f], { encoding: 'utf8' }));
    fs.copyFileSync(src, path.join(proj, 'work', 'rough.mp4'));
    fs.writeFileSync(path.join(proj, 'work', 'rough.srt'), makeSrt({ n: 3 }));   // #1 1–4、#2 4.5–7.5、#3 8–11
  }
  const planFile = path.join(out, 'plan.json');
  if (plan != null) fs.writeFileSync(planFile, typeof plan === 'string' ? plan : `${JSON.stringify(plan, null, 2)}\n`);
  const run = (...args) => spawnSync(process.execPath, [path.join(TOOLS, 'build.mjs'), ...args, '--project', 'projects/p1'], { cwd: root, encoding: 'utf8', timeout: 240000 });
  const readPlan = () => JSON.parse(fs.readFileSync(planFile, 'utf8'));
  const progress = () => { try { return fs.readFileSync(path.join(proj, 'work', '製作進度.md'), 'utf8'); } catch { return ''; } };
  return { root, proj, out, planFile, run, readPlan, progress };
}
const msg = (re) => (e) => re.test(e.message);   // 錯誤訊息要以 ✖ 開頭（assert.throws 的 regex 比的是 'Error: …'）
const lastLines = (s, n) => s.trimEnd().split('\n').slice(-n);

// ---------- --set／--unset ----------

test('setPlan：每種鍵的對與錯；只回傳有變的鍵；錯的值整批不寫', (t) => {
  const p = project(t, { plan: { version: 1, theme: 'light', scenes: [{ id: 's01' }] } });
  const ok = [
    ['theme', 'dark', 'dark'], ['style', '藍圖', '藍圖'], ['format', '直式', 'portrait'], ['format', 'landscape', 'landscape'], ['speakerSide', 'left', 'left'],
    ['chapterBadge', 'false', false], ['look.color', '0.8', 0.8], ['look.slim', '1.2', 1.2], ['look.beauty', 0, 0], ['look', 'off', false],
    ['bed.music', 'bgm-cylinder-five', 'bgm-cylinder-five'], ['bed.music', 'none', null], ['bed.volume', '-3', -3],
    ['outro.from', '#3', '#3'], ['outro.music', 'bgm-cylinder-five', 'bgm-cylinder-five'],
  ];
  for (const [k, v, want] of ok) {
    S.setPlan(p.proj, { [k]: v });
    const [a, b] = k.split('.');
    assert.deepEqual(b ? p.readPlan()[a][b] : p.readPlan()[a], want, `${k}=${v}`);
  }
  const bad = [['theme', 'blue'], ['style', '沒有這包'], ['format', 'square'], ['speakerSide', 'up'], ['chapterBadge', 'yes'], ['look', 'on'],
    ['look.color', '1.5'], ['look.slim', '1.3'], ['look.beauty', '-0.1'], ['look.slim', ''], ['bed.music', 'nope'], ['bed.volume', '13'], ['outro.from', '120'], ['outro.music', 'nope']];
  const before = fs.readFileSync(p.planFile, 'utf8');
  for (const [k, v] of bad) {
    assert.throws(() => S.setPlan(p.proj, { [k]: v }), (e) => e.message.startsWith(`✖ ${k} 不能是「${v}」→ 能寫的：${k}（`), `${k}=${v}`);
  }
  assert.throws(() => S.setPlan(p.proj, { foo: 1 }), msg(/^✖ plan\.json 沒有「foo」這個設定可以寫 → 能寫的：theme（light／dark）、style（.*藍圖.*）、format/));
  assert.throws(() => S.setPlan(p.proj, { theme: 'dark', speakerSide: 'up' }), /speakerSide/);
  assert.equal(fs.readFileSync(p.planFile, 'utf8'), before, '有一個不對就整批不寫');
  // 只回傳有變的；look 是 false 時寫 look.slim 換成物件
  const now = p.readPlan();
  assert.deepEqual(S.setPlan(p.proj, { theme: now.theme, 'look.slim': 0.6 }), [{ key: 'look.slim', from: undefined, to: 0.6 }]);
  assert.deepEqual(p.readPlan().look, { slim: 0.6 });
  assert.deepEqual(S.setPlan(p.proj, { 'look.slim': '0.6' }), [], '值一樣就不寫');
  const keys = Object.keys(p.readPlan());
  assert.equal(keys[keys.length - 1], 'scenes', '新的第一層鍵放在 scenes 前面');
});

test('setPlan：只寫底樂音量時補上工作區預設的曲名（沒有預設就 ✖）；片尾配樂可以只寫曲名（033：沒寫 from＝只播片尾最後 30 秒）', (t) => {
  const p = project(t, { plan: { version: 1, scenes: [] } });
  const fake = path.join(p.root, 'fake', 'shared', 'template');
  fs.mkdirSync(fake, { recursive: true });
  assert.throws(() => S.setPlan(p.proj, { 'bed.volume': 3 }, { templateDir: fake }), msg(/^✖ 這一集還沒有底樂，bed\.volume 沒有對象 → 能寫的：先寫 bed\.music（/));
  fs.writeFileSync(path.join(fake, '..', 'setting.json'), JSON.stringify({ music: { bed: 'bed-calm' } }));
  assert.deepEqual(S.setPlan(p.proj, { 'bed.volume': 3 }, { templateDir: fake }), [{ key: 'bed.volume', from: undefined, to: 3 }, { key: 'bed.music', from: undefined, to: 'bed-calm' }]);
  assert.deepEqual(p.readPlan().bed, { music: 'bed-calm', volume: 3 }, '只寫音量會把預設的底樂關掉：曲名一起寫');
  assert.deepEqual(S.setPlan(p.proj, { 'outro.music': 'bgm-cylinder-five' }).map((c) => c.key), ['outro.music']);
  assert.deepEqual(S.setPlan(p.proj, { 'outro.from': '#3', 'outro.music': 'bgm-cylinder-five' }).map((c) => c.key), ['outro.from']);
});

test('setPlan：保留原本的縮排與換行（4 格、tab、CRLF）', (t) => {
  for (const [indent, nl] of [['    ', '\n'], ['\t', '\n'], ['  ', '\r\n']]) {
    const raw = ['{', `${indent}"version": 1,`, `${indent}"theme": "light"`, '}', ''].join(nl);
    const p = project(t, { plan: raw });
    S.setPlan(p.proj, { theme: 'dark' });
    assert.equal(fs.readFileSync(p.planFile, 'utf8'), ['{', `${indent}"version": 1,`, `${indent}"theme": "dark"`, '}', ''].join(nl));
  }
});

test('unsetPlan：拿掉鍵、空的 bed／outro 不留；還沒有 plan.json 只有 theme、style、format、look* 能先建', (t) => {
  const p = project(t, { plan: { version: 1, style: '藍圖', bed: { music: 'bgm-cylinder-five' }, outro: { from: '#3', music: 'bgm-cylinder-five' }, scenes: [] } });
  assert.deepEqual(S.unsetPlan(p.proj, ['style', 'bed.music', 'outro']), [
    { key: 'style', from: '藍圖', to: undefined }, { key: 'bed.music', from: 'bgm-cylinder-five', to: undefined }, { key: 'outro', from: { from: '#3', music: 'bgm-cylinder-five' }, to: undefined }]);
  assert.deepEqual(p.readPlan(), { version: 1, scenes: [] });
  assert.deepEqual(S.unsetPlan(p.proj, ['style']), [], '沒有就不動');
  assert.throws(() => S.unsetPlan(p.proj, ['scenes']), msg(/^✖ plan\.json 沒有「scenes」這個設定可以拿掉 → 能寫的：.*、bed、outro$/));
  const q = project(t);
  assert.throws(() => S.setPlan(q.proj, { 'bed.music': 'none' }), msg(/^✖ 還沒有 plan\.json，bed\.music 要等產生分鏡素材.*→ 能寫的：theme（light／dark）、style（/));
  assert.ok(!fs.existsSync(q.planFile));
  assert.deepEqual(S.unsetPlan(q.proj, ['theme']), []);
  assert.ok(!fs.existsSync(q.planFile), '只有拿掉：不建檔');
  assert.deepEqual(S.setPlan(q.proj, { theme: 'dark', 'look.slim': 0.4 }), [{ key: 'theme', from: undefined, to: 'dark' }, { key: 'look.slim', from: undefined, to: 0.4 }]);
  assert.deepEqual(q.readPlan(), { version: 1, theme: 'dark', look: { slim: 0.4 } });
});

test('build.mjs --set／--unset：印 ✓ 原本→新值與下一步；值裡有 = 也切得對；改版式下一步是 status.mjs --init', (t) => {
  const p = project(t, { plan: { version: 1, theme: 'light', scenes: [{ id: 's01' }] } });
  let r = p.run('--set', 'theme=dark;outro.from=#2@字幕');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(lastLines(r.stdout, 4), ['✓ plan.json：theme＝dark（原本 light）', '✓ plan.json：outro.from＝#2@字幕（原本 沒寫）', '→ 下一步：重跑 build，改的設定才會生效', 'node shared/template/tools/build.mjs --project projects/p1']);
  r = p.run('--set', 'bed.music=bgm-cylinder-five');
  r = p.run('--set=bed.volume=3');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(p.readPlan().bed, { music: 'bgm-cylinder-five', volume: 3 });
  r = p.run('--set', 'format=portrait');
  assert.deepEqual(lastLines(r.stdout, 2), ['→ 下一步：開工決策表的「版式」跟著改', 'node shared/template/tools/status.mjs --project projects/p1 --init --format portrait']);
  r = p.run('--unset', 'theme');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^✓ plan\.json：拿掉 theme（原本 dark）$/m);
  r = p.run('--set', 'theme');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^✖ 「theme」要寫成「鍵=值」/m);
  r = p.run('--set', 'speakerSide=up');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^✖ speakerSide 不能是「up」→ 能寫的：speakerSide（left／center／right）$/m);
  const q = project(t);
  r = q.run('--set', 'theme=dark');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(lastLines(r.stdout, 2), ['→ 下一步：還沒有段落：設定先存著，之後 build 時生效；照專案進度往下', 'node shared/template/tools/status.mjs --project projects/p1']);
});

test('parseArgs：--set／--said 的值裡有 = 不會被切壞；--say 也收；新旗標', () => {
  assert.deepEqual(B.parseArgs(['--set', 'a=b;c=d', '--said=x=y']), { set: 'a=b;c=d', said: 'x=y' });
  assert.deepEqual(B.parseArgs(['--set=a=b']), { set: 'a=b' });
  assert.deepEqual(B.parseArgs(['--framing-done', '--use', '1.15', '--say', '用 1.15']), { 'framing-done': true, use: '1.15', say: '用 1.15' });
  assert.deepEqual(B.parseArgs(['--framing', '--to-design', 's01,s02', '--unset', 'style']), { framing: true, 'to-design': 's01,s02', unset: 'style' });
  assert.throws(() => B.parseArgs(['--set']), /--set 後面要接值/);
});

// ---------- --show 收時間 ----------

test('parseClock、segsAt：1:15／1:15.2／75；疊加段一起列；沒有段落時給前後最近的', () => {
  assert.equal(B.parseClock('1:15'), 75);
  assert.equal(B.parseClock('1:15.2'), 75.2);
  assert.equal(B.parseClock('75'), 75);
  assert.equal(B.parseClock('s05'), null);
  const it = (id, a, b) => ({ id, out: { start: a, end: b } });
  const items = [it('s01', 1, 7.5), it('f01', 5, 6), it('s02', 8, 12)];
  assert.deepEqual(B.segsAt(items, 5.5).hit.map((x) => x.id), ['s01', 'f01']);
  assert.deepEqual(B.segsAt(items, 7.5).hit, [], '段尾那一刻不算');
  const gap = B.segsAt(items, 7.8);
  assert.deepEqual([gap.prev.id, gap.next.id], ['s01', 's02']);
});

const SEGS = { version: 1, look: false, speakerBox: [400, 80, 900, 700], scenes: [
  { id: 's01', scene: 'key-point', from: '#1', to: '#2e', slots: { lead: '下方字卡', key: '重點在這裡' }, story: { say: '第一個重點', designIdea: '一台手機拉出一條線' } },
  { id: 's02', scene: 'fs-list', from: '#3', to: 12, slots: { title: '清單', items: ['第一', '第二', '第三'] } }] };

test('build.mjs --show 收時間：印那一秒的段再印 plan；沒有段落 ✖ 附前後最近的兩段；段 id 照舊', { skip: NO_FF, timeout: 240000 }, (t) => {
  const p = project(t, { plan: SEGS, video: true });
  let r = p.run('--show', '0:09');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^0:09 → s02（04a 全畫面清單｜0:08\.00–0:12\.00）$/m);
  assert.match(r.stdout, /"id": "s02"/);
  assert.doesNotMatch(r.stdout, /"id": "s01"/);
  r = p.run('--show', '7.8');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^✖ 完成影片 0:07\.80 沒有段落 → 前後最近的段：s01（.*0:01\.00–0:07\.50）、s02（.*0:08\.00–0:12\.00）/m);
  r = p.run('--show', 's01');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /"id": "s01"/);
});

// ---------- --to-design ----------

test('build.mjs --to-design：換成內容設計動畫、備份、補 brief、驗收次數歸零、build、印派工；已經是的不重做；錯的段整批不改', { skip: NO_FF, timeout: 300000 }, async (t) => {
  const p = project(t, { plan: SEGS, video: true });
  const flow = await imp('lib/flow.mjs');
  const P = { project: p.proj, out: p.out };
  flow.runCount(P, 'audit:s01'); flow.runCount(P, 'audit:s01');
  const before = fs.readFileSync(p.planFile, 'utf8');
  let r = p.run('--to-design', 's01,s09');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^✖ plan\.json 沒有「s09」 → 段 id 看 build\.mjs --check 的報告$/m);
  assert.equal(fs.readFileSync(p.planFile, 'utf8'), before, '有錯的段就整批不改');
  r = p.run('--to-design', 's01');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const s01 = p.readPlan().scenes[0];
  assert.deepEqual({ design: s01.design, type: s01.type, scene: s01.scene, slots: s01.slots, idea: s01.story.idea }, { design: true, type: 'custom', scene: undefined, slots: undefined, idea: '一台手機拉出一條線' });
  assert.equal(p.readPlan().scenes[1].scene, 'fs-list', '別段不動');
  assert.ok(fs.readdirSync(p.out).some((f) => f.startsWith('plan.json.bak-to-design-')), '先備份');
  assert.ok(fs.existsSync(path.join(p.proj, 'work', 'briefs', 's01.md')), '補 brief');
  assert.ok(fs.existsSync(path.join(p.out, 'compositions', 'x-design-s01.html')), 'build 過：有空白畫布');
  assert.equal(flow.runCount(P, 'audit:s01'), 1, '驗收次數歸零');
  assert.match(r.stdout, /^✓ plan\.json：s01 換成內容設計動畫（原本 key-point）$/m);
  assert.match(r.stdout, /^ {2}你是設計師，負責 projects\/p1 的內容設計動畫 <段>。照 \.agents\/skills\/auto-edit-motion\/references\/design\.md 寫鏡位腳本、接著做動畫（不用等確認）。$/m);
  assert.deepEqual(lastLines(r.stdout, 2), ['全部回來後定稿：', 'node shared/template/tools/build.mjs --project projects/p1 --review']);
  // 設計師開始做了（有鏡位腳本）：再跑不重做、不派工
  fs.mkdirSync(path.join(p.proj, 'work', 'designs'), { recursive: true });
  fs.writeFileSync(path.join(p.proj, 'work', 'designs', 's01.md'), '# s01');
  const now = fs.readFileSync(p.planFile, 'utf8');
  r = p.run('--to-design', 's01');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^s01 已經是內容設計動畫，不重做（要整段從空白重畫：build\.mjs --project projects\/p1 --design-canvas s01 --reset）$/m);
  assert.doesNotMatch(r.stdout, /你是設計師/);
  assert.equal(fs.readFileSync(p.planFile, 'utf8'), now);
});

// ---------- 等背景底片處理（prepare）有上限 ----------

test('build()：背景底片處理還在跑，最多等 --wait 秒就回 stillRunning；CLI 印 ⏳ 還在跑＋再跑同一條、結束碼 75', (t) => {
  const p = project(t, { plan: { version: 1, look: false, scenes: [] } });
  fs.writeFileSync(path.join(p.proj, 'work', 'rough.srt'), makeSrt({ n: 3 }));
  fs.mkdirSync(path.join(p.proj, 'work', '.jobs'), { recursive: true });
  // 還活著的 pid（這個測試行程）當成 prepare 的背景行程
  fs.writeFileSync(path.join(p.proj, 'work', '.jobs', 'prepare.json'), JSON.stringify({ name: 'prepare', state: 'running', pid: process.pid, startedAt: Date.now() - 5000 }));
  const t0 = Date.now();
  const r = B.build({ project: p.proj, wait: '1' }, { log: () => {} });
  assert.equal(r.stillRunning, true);
  assert.equal(r.ok, false);
  assert.ok(Date.now() - t0 < 4000, `等太久：${Date.now() - t0}ms`);
  // CLI：AUTO_EDIT_JOB=prepare 讓 buildCli 跳過開頭那段 async 等待，直接走到 build() 裡的等待（等於工作剛好在兩次檢查之間開始）
  const c = spawnSync(process.execPath, [path.join(TOOLS, 'build.mjs'), '--wait', '1', '--project', 'projects/p1'], { cwd: p.root, encoding: 'utf8', timeout: 60000, env: { ...process.env, AUTO_EDIT_JOB: 'prepare' } });
  assert.equal(c.status, 75, c.stdout + c.stderr);
  const tail = lastLines(c.stdout, 3);
  assert.match(tail[0], /^⏳ prepare 還在跑（已經 \d+ 秒，背景繼續，不用重開）$/);
  assert.equal(tail[1], '→ 下一步：再跑一次同一條指令會接著等，不會重跑');
  assert.match(tail[2], /^node \S*build\.mjs --wait 1 --project projects\/p1$/);
});

// ---------- --framing／--framing-done ----------

test('parseUse：不帶＝調好了；suggested；1–2 的倍率（1.15、1.15x、1.3 倍）；其他丟錯', () => {
  assert.deepEqual(F.parseUse(undefined), { kind: 'editor' });
  assert.deepEqual(F.parseUse('suggested'), { kind: 'suggested' });
  assert.deepEqual(F.parseUse('1.15x'), { kind: 'zoom', zoom: 1.15 });
  assert.deepEqual(F.parseUse('1.3 倍'), { kind: 'zoom', zoom: 1.3 });
  assert.throws(() => F.parseUse('3'), /--use 只能是 suggested（用建議的）或 1–2 的倍率/);
  assert.throws(() => F.parseUse('好'), /--use 只能是/);
});

const rowsOf = (md, state) => md.split('\n').filter((l) => l.includes('| ② 構圖 |') && l.includes(`| ${state} |`));

test('--framing-done「調好了」：照構圖台存的 frame、記 ② 通過（原話、寫回哪裡）、量講者框、切章；再跑一次不重記', { skip: NO_FF, timeout: 240000 }, (t) => {
  const p = project(t, { plan: { version: 1, look: false, frame: [160, 90, 1600, 900] }, video: true });
  let r = p.run('--framing-done', '--said', '調好了');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^✓ 構圖：照構圖台存的（frame \[160, 90, 1600, 900\]）$/m);
  assert.deepEqual(p.readPlan().frame, [160, 90, 1600, 900]);
  assert.equal(p.readPlan().speakerBox.length, 4, '量了講者框');
  assert.ok(fs.existsSync(path.join(p.proj, 'work', '分鏡素材', '共用.md')), '切章');
  assert.match(lastLines(r.stdout, 1)[0], /^node shared\/template\/tools\/build\.mjs --project projects\/p1 --map-merge$/, '最後是 --scaffold 印的下一步');
  const rows = rowsOf(p.progress(), '通過');
  assert.equal(rows.length, 1);
  assert.match(rows[0], /「調好了」 \| plan\.json frame \|$/);
  assert.match(p.progress(), /^\| 構圖 \| 1\.20 倍 \|$/m, '開工決策表的構圖跟著填');
  r = p.run('--framing-done', '--said', '調好了');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(rowsOf(p.progress(), '通過').length, 1, '再跑一次不重記');
});

test('--framing-done 在分鏡階段（② 已通過、只缺講者框）：不再記 ②（帶 --said 也一樣）、不重切章、只量講者框；構圖框改了才重切', { skip: NO_FF, timeout: 240000 }, async (t) => {
  const { STOP } = await imp('lib/stops.mjs');
  const { appendStop } = await imp('lib/progress.mjs');
  const p = project(t, { plan: { version: 1, look: false, frame: [160, 90, 1600, 900] }, video: true });
  let r = p.run('--framing-done', '--said', '調好了');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  // 分鏡階段：② 之後還有別的停點紀錄（停點紀錄的最後一列不是 ②），講者框不見了
  appendStop(p.proj, { stop: STOP.storyboard, state: '待回覆' });
  const { speakerBox, ...rest } = p.readPlan();
  assert.equal(speakerBox.length, 4);
  fs.writeFileSync(p.planFile, `${JSON.stringify(rest, null, 2)}\n`);
  const pack = path.join(p.proj, 'work', '分鏡素材');
  const common = fs.readFileSync(path.join(pack, '共用.md'), 'utf8');
  const stamp = fs.statSync(path.join(pack, 'index.json')).mtimeMs;
  r = p.run('--framing-done', '--said', '再量一次');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(rowsOf(p.progress(), '通過').length, 1, '② 最後一筆已經是通過：帶了 --said 也不再記');
  assert.doesNotMatch(p.progress(), /再量一次/);
  assert.equal(p.readPlan().speakerBox.length, 4, '量了講者框');
  assert.match(r.stdout, /^✓ 分鏡素材已經切好、構圖框沒變：不重切章（work\/分鏡素材\/ 沒動）$/m);
  assert.deepEqual(lastLines(r.stdout, 2), ['→ 下一步：接著做原本那一步；不確定做到哪就跑這一條', 'node shared/template/tools/status.mjs --project projects/p1']);
  assert.doesNotMatch(r.stdout, /--map-merge/);
  assert.equal(fs.readFileSync(path.join(pack, '共用.md'), 'utf8'), common);
  assert.equal(fs.statSync(path.join(pack, 'index.json')).mtimeMs, stamp, '分鏡素材沒動');
  // 構圖台改了框（存進 plan.json）再說「調好了」：和切分鏡素材那時的框不一樣 → 講者框重量、重切章
  fs.writeFileSync(p.planFile, `${JSON.stringify({ ...p.readPlan(), frame: [224, 0, 1472, 828] }, null, 2)}\n`);
  r = p.run('--framing-done');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(lastLines(r.stdout, 1)[0], /--map-merge$/, '重切章');
  assert.match(fs.readFileSync(path.join(pack, '共用.md'), 'utf8'), /；構圖：\[224,0,1472,828\]$/m);
  assert.match(r.stdout, /^✓ speakerBox \[[^\]]+\] 已寫進 /m, '換了框：講者框重量（不是「已經有，沒有覆寫」）');
  assert.equal(rowsOf(p.progress(), '通過').length, 1);
});

test('--framing-done --use suggested：寫入建議的框（這支建議 1.00x＝不寫 frame）、原本的框拿掉、講者框重量', { skip: NO_FF, timeout: 240000 }, (t) => {
  const p = project(t, { plan: { version: 1, look: false, frame: [224, 0, 1472, 828], speakerBox: [1, 2, 3, 4] }, video: true });
  const r = p.run('--framing-done', '--use', 'suggested', '--said', '用建議的');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^✓ 構圖：不裁切（建議 1\.00x）：plan\.json 不寫 frame$/m);
  assert.equal(p.readPlan().frame, undefined);
  assert.notDeepEqual(p.readPlan().speakerBox, [1, 2, 3, 4], '換了構圖框：舊的講者框是舊框的座標，重量');
  assert.match(rowsOf(p.progress(), '通過')[0], /「用建議的」/);
});

test('--framing-done --use 1.3：寫那個倍率的框；--use 3 ✖、連續沒過記次數，過了歸零', { skip: NO_FF, timeout: 240000 }, (t) => {
  const p = project(t, { plan: { version: 1, look: false }, video: true });
  const tries = path.join(p.proj, 'work', '.jobs', 'tries', `${encodeURIComponent('main:framing')}.json`);
  let r = p.run('--framing-done', '--use', '3');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^✖ --use 只能是 suggested/m);
  assert.equal(JSON.parse(fs.readFileSync(tries, 'utf8')).n, 1);
  r = p.run('--framing-done', '--use', '1.3', '--said', '用 1.3 倍');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^✓ plan\.json 的 frame → \[224, 0, 1472, 828\]（1\.30x；使用者指定的倍率）$/m);
  assert.deepEqual(p.readPlan().frame, [224, 0, 1472, 828]);
  assert.match(p.progress(), /^\| 構圖 \| 1\.30 倍 \|$/m);
  assert.ok(!fs.existsSync(tries), '過了歸零');
});

test('--framing：沒有講者印「不用構圖」直接切章（不開構圖台、不記 ②）', { skip: NO_FF, timeout: 240000 }, (t) => {
  const p = project(t, { camera: false, video: true });
  const r = p.run('--framing');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^✓ 只有聲音：不用構圖/m);
  assert.ok(fs.existsSync(path.join(p.proj, 'work', '分鏡素材', '共用.md')));
  assert.doesNotMatch(p.progress(), /② 構圖/);
  assert.doesNotMatch(r.stdout, /⏸ 停點/);
});

test('--framing：量構圖、開構圖台、記 ② 待回覆，最後是回報段＋停點 ② 那兩行', { skip: NO_FF, timeout: 240000 }, (t) => {
  const p = project(t, { plan: { version: 1, look: false }, video: true });
  const r = p.run('--framing');
  // 馬上關構圖台：t.after 照登記順序跑，刪暫存資料夾那個先登記，剪輯台還開著就會和刪檔搶（ENOTEMPTY）
  spawnSync(process.execPath, [path.join(TOOLS, 'editor.mjs'), '--stop', '--project', 'projects/p1'], { cwd: p.root });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(fs.existsSync(path.join(p.proj, 'work', '構圖預覽.jpg')));
  const tail = lastLines(r.stdout, 6);
  assert.equal(tail[0], '── 回報（照貼；要你判斷的另外補一行）──');
  assert.match(tail[1], /^構圖台開好了：建議 1\.00x（/);
  assert.match(tail[2], /^講者調光：/);
  assert.equal(tail[3], '素材盤點：沒有螢幕錄影和圖片');
  assert.match(tail[4], /^⏸ 停點 ② 構圖｜請看 http:\/\/127\.0\.0\.1:\d+\/framing$/, '沒有 look-preview.jpg：不帶後半句');
  assert.equal(tail[5], '請回：拖好框說「調好了」（會自動存），或說「用建議的」');
  assert.equal(rowsOf(p.progress(), '待回覆').length, 1);
});
