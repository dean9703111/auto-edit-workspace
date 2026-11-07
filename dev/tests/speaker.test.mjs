// 講者資料（shared/講者.json）：讀檔三種狀態、套進 14／15 的預設值、--check 的提醒、brand.mjs speaker
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { TOOLS, TEMPLATE, WORKSPACE, imp, lib } from './helpers.mjs';

const S = await imp('lib/speaker.mjs');
const { resolveScene } = await imp('lib/scenes.mjs');
const L = await lib();
const scene = (scenes, k) => scenes.find((s) => s.key === k);

// 假的 shared/：<tmp>/shared/template/kit（brand.mjs --kit 用）＋ <tmp>/shared/講者.json
function fakeShared(data) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'speaker-'));
  const tpl = path.join(dir, 'shared', 'template');
  fs.mkdirSync(path.join(tpl, 'kit'), { recursive: true });
  if (data !== undefined) fs.writeFileSync(path.join(dir, 'shared', '講者.json'), typeof data === 'string' ? data : JSON.stringify(data));
  return { tpl, kit: path.join(tpl, 'kit'), file: path.join(dir, 'shared', '講者.json') };
}
const brand = (kit, ...args) => spawnSync(process.execPath, [path.join(TOOLS, 'brand.mjs'), 'speaker', ...args, '--kit', kit], { encoding: 'utf8' });

test('模板預設是示範人物（不是作者本人），範本檔和模板一致、講者.json 不進版控', () => {
  const sp = scene(L.scenes, 'speaker').slots;
  assert.equal(sp.name.default, '林大寶');
  assert.deepEqual(sp.titles.default, ['影音創作者', '科技部落客', '線上課程講師']);
  const ex = JSON.parse(fs.readFileSync(path.join(WORKSPACE, 'shared', S.SPEAKER_EXAMPLE), 'utf8'));
  assert.equal(ex.name, sp.name.default);
  assert.deepEqual(ex.titles, sp.titles.default);
  assert.deepEqual(S.validateSpeaker(ex), []);
  assert.match(fs.readFileSync(path.join(WORKSPACE, '.gitignore'), 'utf8'), /^shared\/講者\.json$/m);
  for (const f of ['scenes/14-speaker/scene.json', 'scenes/15-quote/scene.json', 'kit/scene.css']) assert.ok(!/林鼎淵|鼎淵|外商工程師/.test(fs.readFileSync(path.join(TEMPLATE, f), 'utf8')), `${f} 不能有作者本人的資料`);
});

test('readSpeaker：沒檔＝unset、{ off: true }＝off、壞檔＝bad、正常＝set（short 沒寫＝姓名）', () => {
  assert.equal(S.readSpeaker(fakeShared().tpl).state, 'unset');
  assert.equal(S.readSpeaker(fakeShared({ off: true }).tpl).state, 'off');
  assert.equal(S.readSpeaker(fakeShared('{ 壞掉').tpl).state, 'bad');
  const long = S.readSpeaker(fakeShared({ name: '一二三四五六', titles: ['頭銜'] }).tpl);
  assert.equal(long.state, 'bad');
  assert.match(long.error, /最多 5 字/);
  const ok = S.readSpeaker(fakeShared({ name: '陳大文', titles: ['設計師', '插畫家'] }).tpl);
  assert.deepEqual({ state: ok.state, name: ok.name, short: ok.short, titles: ok.titles }, { state: 'set', name: '陳大文', short: '陳大文', titles: ['設計師', '插畫家'] });
});

test('applySpeaker：設定好時 14 不寫 name／titles、15 不寫 by 就用講者資料；沒設定維持示範人物', () => {
  const sp = { state: 'set', name: '陳大文', short: '大文', titles: ['設計師', '插畫家'] };
  const scenes = S.applySpeaker(L.scenes, sp);
  const r = resolveScene({ scene: scene(scenes, 'speaker'), seg: { id: 's01', slots: {} }, cues: [], icons: L.icons, consts: L.consts, t0: 0, D: 7 });
  assert.deepEqual(r.errors, []);
  assert.equal(r.ctx.name, '陳大文');
  assert.deepEqual(r.ctx.titles.map((t) => t.text), ['設計師', '插畫家']);
  const q = resolveScene({ scene: scene(scenes, 'quote'), seg: { id: 's02', slots: { text: '一句話' } }, cues: [], icons: L.icons, consts: L.consts, t0: 0, D: 6 });
  assert.equal(q.ctx.by, '大文');
  assert.equal(scene(L.scenes, 'speaker').slots.name.default, '林大寶', '原本的 scenes 不被改');
  assert.equal(S.applySpeaker(L.scenes, { state: 'unset' }), L.scenes);
});

test('speakerIssues：沒設定 ⚠、關閉 ✖、名字不同 ⚠（來賓）、檔案壞了有用 14 才 ✖', () => {
  const sc = scene(L.scenes, 'speaker');
  const res = (slots = {}) => ({ items: [{ type: 'scene', scene: sc, seg: { slots }, where: 's01' }] });
  const unset = S.speakerIssues({ state: 'unset' }, res());
  assert.deepEqual(unset.errors, []);
  assert.match(unset.warnings[0], /^s01 講者介紹：還沒設定講者，畫面上是示範人物「林大寶」→ node shared\/template\/tools\/brand\.mjs speaker/);
  assert.deepEqual(S.speakerIssues({ state: 'unset' }, res({ name: '陳大文' })).warnings, [], '自己寫了 name 就不提醒');
  assert.match(S.speakerIssues({ state: 'off' }, res()).errors[0], /設定成不放講者介紹/);
  const guest = S.speakerIssues({ state: 'set', name: '陳大文' }, res({ name: '李來賓' }));
  assert.match(guest.warnings[0], /姓名「李來賓」和 shared\/講者\.json 的「陳大文」不同/);
  assert.deepEqual(S.speakerIssues({ state: 'set', name: '陳大文' }, res()), { errors: [], warnings: [] });
  assert.equal(S.speakerIssues({ state: 'bad', error: 'x' }, res()).errors.length, 1);
  assert.deepEqual(S.speakerIssues({ state: 'bad', error: 'x' }, { items: [] }).errors, []);
});

test('brand.mjs speaker：看設定、設定（逗號或「、」分頭銜）、字數超過擋下、off', () => {
  const f = fakeShared();
  assert.match(brand(f.kit).stdout, /還沒設定講者/);
  const set = brand(f.kit, '--name', '陳大文', '--titles', '設計師、插畫家', '--short', '大文');
  assert.equal(set.status, 0, set.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(f.file, 'utf8')), { name: '陳大文', short: '大文', titles: ['設計師', '插畫家'] });
  assert.match(brand(f.kit).stdout, /講者：陳大文（金句出處：大文）｜頭銜：設計師、插畫家/);
  assert.equal(brand(f.kit, '--titles', '設計師,插畫家,講師').status, 0, '只改頭銜，姓名與簡稱留著');
  assert.deepEqual(JSON.parse(fs.readFileSync(f.file, 'utf8')), { name: '陳大文', short: '大文', titles: ['設計師', '插畫家', '講師'] });
  const bad = brand(f.kit, '--name', '陳大文', '--titles', '一二三四五六七');
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /每個最多 6 字/);
  assert.equal(brand(f.kit, 'off').status, 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(f.file, 'utf8')), { off: true });
  assert.match(brand(f.kit).stdout, /講者介紹：關閉/);
});

test('speakerGate：示範人物來自 scene.json 的預設值；只有真的會顯示示範人物才要問', () => {
  const plan = (scenes) => ({ scenes });
  const seg = { id: 's1', scene: 'speaker' };
  // 沒設定：段落沒寫 name → 會顯示示範人物；scene 用編號或別名也算
  const unset = fakeShared().tpl;
  fs.symlinkSync(path.join(TEMPLATE, 'scenes'), path.join(unset, 'scenes'), 'dir');
  const g = S.speakerGate(unset, plan([seg, { id: 's2', scene: '14' }, { id: 's3', scene: '講者介紹', slots: { name: '陳大文' } }, { id: 's4', scene: 'key-point' }]));
  assert.equal(g.needed, true);
  assert.equal(g.demo, '林大寶');
  assert.deepEqual(g.segments, ['s1', 's2']);
  assert.equal(S.speakerGate(unset, plan([{ id: 's3', scene: '14', slots: { name: '林大寶' } }])).needed, true, '直接寫了示範人物的名字也要問');
  assert.equal(S.speakerGate(unset, plan([{ id: 's3', scene: '14', slots: { name: '陳大文' } }])).needed, false);
  assert.equal(S.speakerGate(unset, plan([{ id: 's4', scene: 'key-point' }])).needed, false);
  assert.equal(S.speakerGate(unset, null).needed, false, '還沒有 plan.json');
  // 設定好（就算真的叫林大寶）、關閉：都不問（關閉時 --check 會 ✖）
  const named = fakeShared({ name: '陳大文', titles: ['設計師'] }).tpl;
  fs.symlinkSync(path.join(TEMPLATE, 'scenes'), path.join(named, 'scenes'), 'dir');
  assert.equal(S.speakerGate(named, plan([seg])).needed, false);
  assert.equal(S.speakerGate(named, plan([seg])).name, '陳大文');
  const off = fakeShared({ off: true }).tpl;
  fs.symlinkSync(path.join(TEMPLATE, 'scenes'), path.join(off, 'scenes'), 'dir');
  assert.equal(S.speakerGate(off, plan([seg])).needed, false);
});

test('saveSpeaker：頓號逗號都能分頭銜、字數照 scene.json、不合就不寫檔', () => {
  const f = fakeShared();
  assert.match(S.saveSpeaker(f.tpl, { name: '', titles: '講師' }).errors[0], /姓名沒有寫/);
  assert.match(S.saveSpeaker(f.tpl, { name: '陳大文', titles: '' }).errors[0], /頭銜至少 1 個/);
  assert.equal(fs.existsSync(f.file), false);
  assert.deepEqual(S.saveSpeaker(f.tpl, { name: ' 陳大文 ', titles: '設計師、插畫家, 講師' }).errors, []);
  assert.deepEqual(JSON.parse(fs.readFileSync(f.file, 'utf8')), { name: '陳大文', titles: ['設計師', '插畫家', '講師'] });
  assert.equal(S.readSpeaker(f.tpl).state, 'set');
});
