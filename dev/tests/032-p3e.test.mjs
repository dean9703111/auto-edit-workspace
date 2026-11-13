// 032 P3e（C10）：resolvePlan、validateMedia 拆成小函式前後輸出一個字都不能變（快照比對）；
// status.mjs 照 work/.jobs/state.json 的標記判斷做到哪（沒有標記照舊看檔案在不在、誰比較新）
//
// 快照在 dev/tests/fixtures/032-p3e/<名稱>.json（拆之前用原本的程式產生）。規則真的改了、輸出本來就該變時，
// 重產：P3E_UPDATE=1 node --test dev/tests/032-p3e.test.mjs（再看 git diff 確認只變了該變的地方）
// projects/example 的快照只在本機的 work/ 和產生快照時一樣才比（work/ 不進版控；別台機器、範例重剪過就略過）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { lib, imp, makeSrt, tmpDir, WORKSPACE, TOOLS } from './helpers.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SNAP = path.join(HERE, 'fixtures', '032-p3e');
const UPDATE = process.env.P3E_UPDATE === '1';
const { resolvePlan } = await imp('lib/plan.mjs');
const { checkMediaSeg, validateMedia, newStepState } = await imp('lib/media.mjs');
const { parseSrt } = await imp('lib/srt.mjs');
const { timeMap } = await imp('lib/edit.mjs');
const { canvasOf } = await imp('lib/canvas.mjs');
const L0 = await lib();
// 工作區預設的底樂（shared/setting.json，每台機器不一樣）不算：快照才不會跟著機器變
const L = { ...L0, musicDefault: null };

// ---------- 快照：轉成 JSON 時把 undefined、函式、Set、Map、陣列上多掛的欄位都留下來（JSON.stringify 會丟掉） ----------
function toPlain(v, stack = [], key = '') {
  if (v === undefined) return '$undefined';
  if (typeof v === 'number') return Number.isFinite(v) ? (Object.is(v, -0) ? '$-0' : v) : `$${v}`;
  if (typeof v === 'function') return '$fn';
  if (v === null || typeof v !== 'object') return v;
  // 情境、字卡動態的定義（lib 的模板，很長）只記名稱
  if (key === 'scene' && typeof v.key === 'string' && v.family) return `$scene:${v.key}`;
  if (key === 'fxDef' && v.id != null) return `$fx:${v.id}`;
  if (stack.includes(v)) return '$cycle';
  stack.push(v);
  let out;
  if (v instanceof Set) out = { $set: [...v].map((x) => toPlain(x, stack)) };
  else if (v instanceof Map) out = { $map: [...v].map(([k, x]) => [toPlain(k, stack), toPlain(x, stack)]) };
  else if (Array.isArray(v)) {
    const arr = Array.from(v, (x) => toPlain(x, stack));
    const extra = Object.keys(v).filter((k) => !/^\d+$/.test(k));
    out = extra.length ? { $array: arr, $props: Object.fromEntries(extra.map((k) => [k, toPlain(v[k], stack, k)])) } : arr;
  } else {
    out = {};
    for (const k of Object.keys(v)) out[k] = toPlain(v[k], stack, k);
  }
  stack.pop();
  return out;
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const TMPS = [...new Set([os.tmpdir(), fs.realpathSync(os.tmpdir())])].sort((a, b) => b.length - a.length);
const normalize = (text) => {
  let t = text.replaceAll(WORKSPACE, '<ROOT>');
  for (const d of TMPS) t = t.replace(new RegExp(`${esc(d)}/[^/"\\\\]+`, 'g'), '<TMP>/X').replaceAll(d, '<TMP>');
  return t;
};
const textOf = (v) => `${normalize(JSON.stringify(toPlain(v), null, 1))}\n`;

// 和快照比：不一樣就列前幾行不同的地方（整份 diff 太長）
function matchSnap(name, value, meta = null) {
  const file = path.join(SNAP, `${name}.json`);
  const text = textOf(meta ? { meta, value } : value);
  if (UPDATE) { fs.mkdirSync(SNAP, { recursive: true }); fs.writeFileSync(file, text); return; }
  assert.ok(fs.existsSync(file), `沒有快照 ${path.relative(WORKSPACE, file)} → P3E_UPDATE=1 重產`);
  const want = fs.readFileSync(file, 'utf8');
  if (text === want) return;
  const a = want.split('\n'), b = text.split('\n'), diffs = [];
  for (let i = 0; i < Math.max(a.length, b.length) && diffs.length < 6; i++) if (a[i] !== b[i]) diffs.push(`第 ${i + 1} 行\n  快照：${a[i]}\n  現在：${b[i]}`);
  assert.fail(`${name} 和快照不一樣（行數 ${a.length} → ${b.length}）：\n${diffs.join('\n')}`);
}

// ---------- 輸入 ----------
// 範例專案第一次試剪的固定檔（plan.test 的回歸測試同一份）
const TRIAL = path.join(HERE, 'fixtures', 'example-trial1', 'work');
async function trialRes() {
  const { attachWords } = await imp('build.mjs');
  const cs = attachWords(parseSrt(fs.readFileSync(path.join(TRIAL, 'rough.srt'), 'utf8')), { transcript: path.join(TRIAL, 'transcript.json') });
  return resolvePlan({ plan: JSON.parse(fs.readFileSync(path.join(TRIAL, 'hyperframes', 'plan.json'), 'utf8')), cues: cs, videoDur: 153.543, lib: L, outDir: path.join(TRIAL, 'hyperframes'), projectRel: 'projects/example' });
}

// 每一節都走得到的合成 plan：章節、角標、小節、字卡、字卡動態、錄影（運鏡、紅框、說明卡、STEP、放大鏡、箭頭、聚光燈、變速、打碼、右側清單、等待卡）、
// 情境動畫（P.at、P.sfx、clicks）、情緒點（推近）、剪輯台（cuts、dip、punch、gains、淡入淡出、音量）、片尾配樂、底樂、只有聲音的區間
const VD = 106;   // 30 句：#N 起點＝(N−1)×3.5＋1
function project(t) {
  const dir = tmpDir(t, 'p3e-snap-');
  for (const f of ['assets/screen/v.mp4', 'assets/screen/w.mp4', 'assets/images/a.png', 'work/hyperframes/compositions/x-demo.html']) fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
  for (const f of ['assets/screen/v.mp4', 'assets/screen/w.mp4', 'assets/images/a.png']) fs.writeFileSync(path.join(dir, f), '');
  fs.writeFileSync(path.join(dir, 'work/hyperframes/compositions/x-demo.html'),
    '<template id="x-demo-template"><div id="x-demo" data-composition-id="x-demo"></div><script>P.at(\'#16\'); P.sfx(\'click\', \'#16\', 0.2); P.sfx(\'ding\', \'#17\'); window.__timelines["x-demo"] = 1;</script></template>');
  return dir;
}
const probe = (f) => (f.endsWith('.png') ? { width: 1600, height: 900 } : f.endsWith('w.mp4') ? { width: 1920, height: 1080, duration: 120, hasAudio: false } : { width: 2560, height: 1440, duration: 90, hasAudio: true });
const kitchenPlan = (extra = {}) => ({
  version: 1, speakerBox: [700, 200, 1220, 1000], theme: 'dark', style: '預設',
  sections: [{ at: '#9', name: 'STEP 1｜設定' }, { at: '#19', name: '第二節' }],
  moods: [{ at: '#3@字幕', kind: 'pain', zoom: true }, { at: '#6', kind: 'win' }, { at: '#20@字幕', kind: 'quote' }, { at: '#26', kind: 'turn', sfx: null }, { at: '#28', kind: 'land' }],
  outro: { from: '#29', music: 'bgm-cylinder-five', volume: -3 },
  bed: { music: 'bgm-cylinder-five', volume: -2 },
  edit: { cuts: [[60, 61]], joins: [{ at: 20, type: 'punch' }, { at: 60, type: 'dip', dur: 0.4 }], gains: [{ from: 70, to: 75, db: -3 }], fadeIn: 0.5, fadeOut: 1, volume: { voice: 1, sfx: -2, media: -1 } },
  scenes: [
    { id: 'c1', scene: 'chapter', at: '#2', slots: { num: 1, title: '開始', sub: '先看問題' } },
    { id: 's01', scene: 'concept', from: '#3', to: '#3e', slots: { text: '先講概念' } },
    { id: 's02', scene: 'key-point', from: '#4', to: '#4e', slots: { lead: '重點', key: '放到電腦' } },
    { id: 'k1', scene: 'keywords', from: '#5', to: '#6e', slots: { items: [{ text: '甲' }, { text: '乙' }] } },
    { id: 'f1', type: 'fx', fx: 29, bg: 'dark', from: '#7', to: '#7e', vars: { number: '1' }, sfx: { name: 'ding', at: '#7e-0.2' } },
    { id: 'm1', type: 'media', src: 'assets/screen/v.mp4', from: '#8', to: '#11e', in: 2,
      moves: [{ at: '+0.9', to: [100, 100, 1200, 675] }, { at: '+11.5', to: 'full' }],
      marks: [{ at: '#9', box: [200, 200, 300, 100], path: [{ at: '#9+1', box: [220, 260, 300, 100] }] }],
      callouts: [{ at: '#10', until: '#10e', box: [600, 300, 200, 80], text: '按這裡', icon: 'star' }],
      steps: [{ at: '#8', text: '打開設定' }, { at: '#10', text: '按下儲存' }], clicks: ['+2'], sfx: 'success' },
    { id: 'm2', type: 'media', src: 'assets/images/a.png', from: '#11e', to: '#14e', kenburns: true,
      lens: [{ at: '#12+0.5', box: [100, 100, 200, 100] }], arrows: [{ at: '#13', to: [500, 300] }], spot: [{ at: '#14', box: [300, 300, 200, 200] }] },
    { id: 'x1', type: 'custom', src: 'compositions/x-demo.html', layout: 'fullscreen', from: '#15', to: '#17e', clicks: ['+1'] },
    { id: 't1', scene: 'chapter-tag', from: '#18', to: '#18e', slots: { num: 2, name: '第二章' } },
    { id: 's05', scene: 'side-panel', from: '#19', to: '#21e', sfxVolume: -3, slots: { title: '三件事', items: [{ text: '一' }, { text: '二' }, { text: '三' }] } },
    { id: 's06', scene: 'fs-list', from: '#22', to: '#24e', slots: { title: '清單', items: ['一', '二', '三'] } },
    { id: 'm3', type: 'media', src: 'assets/screen/w.mp4', from: '#25', to: '#27e', sfxExtra: true,
      retime: [{ at: '+0.5', src: 1 }, { at: '+3', src: 40 }, { at: '+6', src: 41 }], wait: 'AI 處理中｜寫入檔案', redact: [{ box: [0, 0, 100, 50] }],
      side: { title: '配對手機', items: [{ at: '#25', text: '打開 App' }, { at: '#26', text: '掃碼' }] } },
    { id: 's07', scene: 'quote', from: '#28', to: '#28e', slots: { text: '最後一句' } },
    { id: 's08', scene: 'summary', from: '#29', to: '#30e', sfxExtra: false, slots: { text: '總結一下' } },
  ],
  ...extra,
});
function kitchenRes(t, { portrait = false, plan = {} } = {}) {
  const dir = project(t);
  const cues = parseSrt(makeSrt({ n: 30 }));
  return resolvePlan({
    plan: kitchenPlan({ ...(portrait ? { format: 'portrait' } : {}), ...plan }), cues, videoDur: VD, lib: L,
    outDir: path.join(dir, 'work', 'hyperframes'), sfxDir: path.join(WORKSPACE, 'shared', 'sfx'), projectDir: dir,
    voiceOnly: [[44, 47], [90, 92]], cutpoints: [{ at: 20, kind: 'pause' }, { at: 60, kind: 'ng' }], probe, projectRel: 'projects/p3e',
    canvas: portrait ? canvasOf('portrait') : null,
  });
}

// ---------- resolvePlan ----------
test('resolvePlan 快照：範例試剪的固定檔（example-trial1）', async () => {
  matchSnap('trial1', await trialRes());
});

test('resolvePlan 快照：每一節都走得到的合成 plan（橫式、直式、沒有 edit 與 moods、寫錯的欄位）', (t) => {
  matchSnap('kitchen-landscape', kitchenRes(t));
  matchSnap('kitchen-portrait', kitchenRes(t, { portrait: true }));
  matchSnap('kitchen-plain', kitchenRes(t, { plan: { edit: undefined, moods: undefined, theme: undefined, chapterBadge: false, rhythm: 'spaced', sections: undefined } }));
  matchSnap('kitchen-bad', kitchenRes(t, { plan: { outro: { from: '3', music: 'nope', volume: 99, extra: 1 }, bed: { music: 'nope', loop: 1 }, sections: [{ at: '#9@字幕', name: '' }], check: { textSync: 'x' }, rhythm: 'fast', sideShift: 2000, pipCrop: [0, 0, 1, 1] } }));
});

// projects/example：build --check 同一條路（build 的 resolver），輸入沒變才比
const EX = path.join(WORKSPACE, 'projects', 'example');
function exampleHash() {
  const h = crypto.createHash('sha1');
  const add = (f) => { try { h.update(f); h.update(fs.readFileSync(path.join(EX, f))); } catch { h.update(`${f}:none`); } };
  for (const f of ['work/hyperframes/plan.json', 'work/rough.srt', 'work/transcript.json', 'work/cutpoints.json', 'work/main.json', '講稿.md']) add(f);
  for (const d of ['work/hyperframes/compositions', 'work/designs']) { let names = []; try { names = fs.readdirSync(path.join(EX, d)).sort(); } catch { /* 沒有 */ } for (const n of names) add(`${d}/${n}`); }
  try { const st = fs.statSync(path.join(EX, 'work', 'rough.mp4')); h.update(`rough.mp4:${st.size}`); } catch { h.update('rough.mp4:none'); }
  try { h.update(fs.readFileSync(path.join(WORKSPACE, 'shared', 'setting.json'))); } catch { h.update('setting:none'); }
  return h.digest('hex').slice(0, 16);
}
test('resolvePlan 快照：projects/example（本機有 work/、輸入和產生快照時一樣才比）', async (t) => {
  if (!fs.existsSync(path.join(EX, 'work', 'hyperframes', 'plan.json')) || !fs.existsSync(path.join(EX, 'work', 'rough.mp4'))) { t.skip('projects/example 還沒有 work/（work/ 不進版控）'); return; }
  const { build } = await imp('build.mjs');
  const r = build({ project: EX, check: true, json: false }, { log: () => {}, resolver: true });
  const { res } = r.check(JSON.parse(fs.readFileSync(r.P.plan, 'utf8')));
  const hash = exampleHash();
  const file = path.join(SNAP, 'example.json');
  if (!UPDATE) {
    const have = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).meta?.hash : null;
    if (have !== hash) { t.skip(`projects/example 的輸入和快照不一樣（${have ?? '沒有快照'} → ${hash}）`); return; }
  }
  matchSnap('example', res, { hash });
});

// ---------- validateMedia（直接呼叫，訊息照順序記下來）----------
test('validateMedia 快照：錄影、圖片、直式、寫錯的欄位，STEP 編號跨段接續', (t) => {
  const dir = project(t);
  const cues = parseSrt(makeSrt({ n: 30 }));
  const tm = timeMap([], VD);
  const steps = newStepState();
  const out = [];
  const run = (seg, start, end, { canvas = null, pip = false, badge = null, waitLead } = {}) => {
    const msgs = [];
    const media = checkMediaSeg(seg, { projectDir: dir, probe, err: (m) => msgs.push(`✖ ${m}`), warn: (m) => msgs.push(`⚠ ${m}`) });
    if (!media) { out.push({ id: seg.id, msgs }); return; }
    const it = { id: seg.id, seg, media, start, end, z: 30, enterFx: seg.enter ?? 'fade', exitFx: 'fade', pipPieces: pip ? [{ s: start, e: end, ms: start }] : [] };
    const r = validateMedia(it, { cues, tm, pipAt: () => pip, steps, canvas, badge, waitLead, err: (m) => msgs.push(`✖ ${m}`), warn: (m) => msgs.push(`⚠ ${m}`) });
    out.push({ id: seg.id, r, it, msgs });
  };
  const P = kitchenPlan().scenes;
  const seg = (id) => structuredClone(P.find((x) => x.id === id));
  run(seg('m1'), 25.5, 39, { pip: true, badge: { box: [1500, 56, 1824, 136], side: 'right', names: ['STEP 1｜設定'] } });
  run({ ...seg('m1'), id: 'm1b', steps: [{ at: '+0', text: '按下儲存' }, { at: '+3', text: '完成' }] }, 39, 46);
  run(seg('m2'), 39, 50.5);
  run(seg('m3'), 85, 95.5, { waitLead: 0.9 });
  run({ ...seg('m1'), id: 'm1p' }, 25.5, 39, { canvas: canvasOf('portrait'), pip: true });
  run({ ...seg('m2'), id: 'm2t', enter: 'tape' }, 39, 50.5);
  run({ id: 'bad', type: 'media', src: 'assets/screen/v.mp4', from: '#8', to: '#9e', moves: [{ at: 3, to: [0, 0, 9999, 10] }, { at: '+0.1', to: 'full', dur: 9 }],
    marks: [{ at: '#20', box: [1, 2, 3] }, { at: '+0.2', until: '+0.3', box: [10, 10, 50, 50] }], callouts: [{ at: '+0.5', box: [10, 10, 50, 50], text: '一二三四五六七八九十一二三' }],
    steps: [{ at: '+0', text: '' }, { at: '+0.5', text: '下一步' }, { at: '+0.6', text: '再下一步' }], lens: [{ at: '+1', until: '+1.5', box: [0, 0, 10, 10] }],
    arrows: [{ at: '+1', to: [9000, 1] }], spot: [{ at: '+1', box: [0, 0, 10, 10] }], redact: { box: [0, 0, 1, 1] }, side: { items: [] }, stepsSide: 'up' }, 25.5, 32.5);
  matchSnap('validate-media', out);
});

// ---------- 步驟標記（work/.jobs/state.json）與 status ----------
const { markStep, readSteps, stepChanged, fileSig, stepsFile, STEP_INPUTS } = await imp('lib/progress.mjs');
const { projectStatus } = await imp('status.mjs');
const { recordStoryboard } = await imp('lib/storyboard-state.mjs');
const touch = (p, rel, text = 'x', ageSec = 0) => {
  const f = path.join(p, ...rel.split('/'));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
  const t = new Date(Date.now() - ageSec * 1000);
  fs.utimesSync(f, t, t);
};
const age = (p, rel, ageSec) => { const t = new Date(Date.now() - ageSec * 1000); fs.utimesSync(path.join(p, ...rel.split('/')), t, t); };
const SRT = '1\n00:00:01,000 --> 00:00:02,000\n短句\n';

test('markStep：記在 work/.jobs/state.json（version 1、at、每個輸入檔的指紋）；同一步再記就蓋掉；檔案改了 stepChanged 才是 true；大檔讀頭尾', (t) => {
  const p = tmpDir(t, 'p3e-steps-');
  assert.equal(readSteps(p), null, '沒有標記＝舊專案');
  touch(p, 'work/hyperframes/plan.json', '{"version":1}');
  const rec = markStep(p, 'build');
  assert.deepEqual(Object.keys(rec), ['at', 'inputs']);
  assert.deepEqual(Object.keys(rec.inputs), ['work/hyperframes/plan.json']);
  assert.match(rec.inputs['work/hyperframes/plan.json'], /^sha1:[0-9a-f]{40}$/);
  const s = JSON.parse(fs.readFileSync(stepsFile(p), 'utf8'));
  assert.equal(s.version, 1);
  assert.deepEqual(readSteps(p).steps.build, rec);
  assert.equal(stepChanged(p, rec, 'work/hyperframes/plan.json'), false);
  assert.equal(stepChanged(p, rec, 'work/storyboard.md'), null, '沒記的檔＝不知道');
  assert.equal(stepChanged(p, null, 'work/hyperframes/plan.json'), null);
  touch(p, 'work/hyperframes/plan.json', '{"version":1}', 3600);
  assert.equal(stepChanged(p, rec, 'work/hyperframes/plan.json'), false, '只改修改時間不算改過');
  touch(p, 'work/hyperframes/plan.json', '{"version":1,"theme":"dark"}');
  assert.equal(stepChanged(p, rec, 'work/hyperframes/plan.json'), true);
  // 其他欄照存、指定 inputs、不存在的檔記 null
  const m = markStep(p, 'map-merge', { passed: true, inputs: ['work/drafts/ch01.map.md'] });
  assert.deepEqual([m.passed, m.inputs], [true, { 'work/drafts/ch01.map.md': null }]);
  assert.deepEqual(Object.keys(readSteps(p).steps), ['build', 'map-merge']);
  // 草稿：照 work/drafts/ 現有的檔（_merged.json、地圖不算）
  touch(p, 'work/drafts/ch01.json', '{}'); touch(p, 'work/drafts/ch02.json', '{}'); touch(p, 'work/drafts/_merged.json', '{}'); touch(p, 'work/drafts/ch01.map.md', 'x');
  assert.deepEqual(STEP_INPUTS['merge-drafts'](p), ['work/drafts/ch01.json', 'work/drafts/ch02.json']);
  assert.deepEqual(STEP_INPUTS['map-merge'](p), ['work/drafts/ch01.map.md']);
  // 大檔（> 4 MB）：頭尾各 1 MB＋大小
  const big = Buffer.alloc(5 * 1024 * 1024, 1);
  fs.mkdirSync(path.join(p, 'output'), { recursive: true });
  fs.writeFileSync(path.join(p, 'output', 'final.mp4'), big);
  const a = fileSig(p, 'output/final.mp4');
  assert.match(a, /^edge:5242880:[0-9a-f]{40}$/);
  big[big.length - 1] = 2;
  fs.writeFileSync(path.join(p, 'output', 'final.mp4'), big);
  assert.notEqual(fileSig(p, 'output/final.mp4'), a);
  assert.equal(fileSig(p, 'output/nope.mp4'), null);
  // 壞掉、版本不對：當作沒有標記
  touch(p, 'work/.jobs/state.json', '{"version":2,"steps":{}}');
  assert.equal(readSteps(p), null);
  touch(p, 'work/.jobs/state.json', '{壞');
  assert.equal(readSteps(p), null);
  assert.throws(() => markStep(p, ''), /markStep 要寫是哪一步/);
});

// 只有聲音的專案（沒有 ② 構圖），一路到 S14；檔案的修改時間故意弄成「和標記相反」，有標記就照標記
test('status 有標記照標記：修改時間弄亂（複製專案、雲端同步）也不會指回舊步驟；改了內容才回到那一步', (t) => {
  const p = tmpDir(t, 'p3e-status-');
  const st = () => projectStatus(p);
  touch(p, 'assets/voice/b.m4a');
  for (const f of ['work/main.mp4', 'work/cuts.md', 'work/rough.mp4', 'work/cutpoints.json']) touch(p, f);
  touch(p, 'work/rough.srt', SRT);
  assert.equal(st().stage, 'S5', '沒有標記、沒有備份：srt-align 還沒跑（照舊）');
  markStep(p, 'srt-align');
  assert.equal(st().stage, 'S6', 'srt-align 記過＝跑過（沒有 rough.srt.align-* 備份也算）');
  markStep(p, 'snap-srt');
  assert.equal(st().stage, 'S9');
  // 分鏡表：storyboard.md 比 plan.json 舊（舊的推法會說 S11），但 --storyboard 記過、還沒套回 → S10
  touch(p, 'work/hyperframes/plan.json', '{"version":1}', 0);
  touch(p, 'work/storyboard.md', '# 分鏡表', 120);
  assert.equal(st().stage, 'S11', '沒有標記：照修改時間（plan.json 比較新）');
  markStep(p, 'storyboard');
  assert.equal(st().stage, 'S10');
  assert.match(st().evidence.join('；'), /storyboard\.md 產生或改過之後還沒套回 plan\.json（work\/\.jobs\/state\.json）/);
  markStep(p, 'apply-storyboard');
  age(p, 'work/storyboard.md', 0); age(p, 'work/hyperframes/plan.json', 300);
  assert.equal(st().stage, 'S11', '套回之後分鏡表沒再改：storyboard.md 比較新也不算');
  touch(p, 'work/storyboard.md', '# 分鏡表（網頁改過）', 600);
  assert.equal(st().stage, 'S10', '套回之後分鏡表又改了：還沒套回（修改時間比較舊也一樣）');
  markStep(p, 'apply-storyboard');
  // 有分鏡表的雜湊紀錄（工具寫分鏡表都會記）：--review、回饋輪照正本重寫的不算改過，之後有人改才算；套回之後又整份重產也算還沒套回
  const SP = { project: p, out: path.join(p, 'work', 'hyperframes') };
  touch(p, 'work/storyboard.md', '# 分鏡表（--review 照正本重寫）', 600); recordStoryboard(SP, '# 分鏡表（--review 照正本重寫）');
  assert.equal(st().stage, 'S11', '工具照正本重寫分鏡表（同步記了雜湊）：不算還沒套回');
  touch(p, 'work/storyboard.md', '# 分鏡表（網頁又改）', 600);
  assert.equal(st().stage, 'S10', '內容和雜湊紀錄不一樣＝有人改過');
  recordStoryboard(SP, '# 分鏡表（網頁又改）'); markStep(p, 'apply-storyboard');
  assert.equal(st().stage, 'S11');
  markStep(p, 'storyboard');
  assert.equal(st().stage, 'S10', '套回之後又跑了一次 --storyboard（整份重產，要再給使用者看）');
  markStep(p, 'apply-storyboard');
  // build：index.html 比 plan.json 舊（舊的推法 S11），記過 build、plan.json 沒改 → S12
  touch(p, 'work/hyperframes/index.html', '<html>', 600);
  assert.equal(st().stage, 'S11');
  markStep(p, 'build');
  assert.equal(st().stage, 'S12');
  touch(p, 'work/hyperframes/plan.json', '{"version":1,"theme":"dark"}', 900);
  age(p, 'work/hyperframes/index.html', 0);
  assert.equal(st().stage, 'S11', 'build 之後 plan.json 改了：要重 build（index.html 比較新也一樣）');
  assert.match(st().evidence.join('；'), /plan\.json 在上次 build 之後改過（work\/\.jobs\/state\.json）/);
  markStep(p, 'build');
  // 驗收：qc-sheet.jpg 比 final.mp4 舊（舊的推法 S13），記過 qc → S14；換了 final.mp4 → S13
  touch(p, 'output/final.mp4', 'v1', 0);
  touch(p, 'output/qc/qc-sheet.jpg', 'jpg', 600);
  assert.equal(st().stage, 'S13');
  markStep(p, 'qc');
  assert.equal(st().stage, 'S14');
  touch(p, 'output/final.mp4', 'v2', 900);
  assert.equal(st().stage, 'S13', '驗收之後 final.mp4 換了');
  assert.match(st().evidence.join('；'), /final\.mp4 在上次驗收之後換過/);
});

test('status 有標記照標記：合併草稿、語意地圖、螢幕錄影同步；沒記的步驟照舊看修改時間', (t) => {
  const p = tmpDir(t, 'p3e-status2-');
  const st = () => projectStatus(p);
  touch(p, 'assets/voice/b.m4a');
  for (const f of ['work/main.mp4', 'work/cuts.md', 'work/rough.mp4', 'work/cutpoints.json', 'work/transcript.json', 'work/rough.srt.align-1']) touch(p, f);
  touch(p, 'work/rough.srt', SRT);
  touch(p, 'work/hyperframes/plan.json', JSON.stringify({ version: 1, scenes: [{ id: 's01' }] }), 600);
  touch(p, 'work/分鏡素材/index.json', JSON.stringify({ parts: [{ key: 'ch01' }, { key: 'ch02' }], semanticMap: true }));
  touch(p, 'work/drafts/ch01.map.md', 'a', 0); touch(p, 'work/drafts/ch02.map.md', 'b', 0);
  touch(p, 'work/drafts/_map.json', JSON.stringify({ passed: true }), 300);
  assert.equal(st().at, '剪好看／全片校正語意地圖', '沒有標記：地圖比 _map.json 新（照舊）');
  markStep(p, 'map-merge', { passed: true });
  assert.match(st().at, /第二回合：寫分鏡草稿（還缺 ch01、ch02）/, '記過 map-merge、地圖沒再改：過了');
  touch(p, 'work/drafts/ch02.map.md', 'b2', 900);
  assert.equal(st().at, '剪好看／全片校正語意地圖', '校正之後地圖改了（修改時間比較舊也一樣）');
  markStep(p, 'map-merge', { passed: false });
  assert.equal(st().at, '剪好看／全片校正語意地圖', '沒過');
  markStep(p, 'map-merge', { passed: true });
  touch(p, 'work/drafts/ch01.json', '{"a":1}', 0); touch(p, 'work/drafts/ch02.json', '{"b":1}', 0);
  touch(p, 'work/drafts/_merged.json', '{}', 300);
  assert.equal(st().at, '剪好看／合併分鏡草稿', '沒有標記：草稿比 _merged.json 新（照舊）');
  markStep(p, 'merge-drafts');
  assert.equal(st().at, '剪好看／產生分鏡表');
  touch(p, 'work/drafts/ch01.json', '{"a":2}', 900);
  assert.equal(st().at, '剪好看／合併分鏡草稿', '合併之後草稿改了');
  // 螢幕錄影同步：cuts.v1.json 比 screen-sync.json 新（舊的推法要重算）；記過 screen-sync、cuts.v1.json 沒變 → 不用
  const q = tmpDir(t, 'p3e-status3-');
  touch(q, 'assets/screen/s.mp4');
  touch(q, 'work/main.json', JSON.stringify({ clips: [{ file: 'assets/screen/s.mp4', kind: 'screen' }] }));
  for (const f of ['work/main.mp4', 'work/cuts.md', 'work/rough.mp4', 'work/cutpoints.json', 'work/transcript.json', 'work/rough.srt.align-1']) touch(q, f);
  touch(q, 'work/rough.srt', SRT);
  touch(q, 'work/screen-sync.json', '{}', 600);
  touch(q, 'work/cuts.v1.json', '{"v":1}', 0);
  assert.equal(projectStatus(q).stage, 'S7s', '沒有標記：照修改時間');
  markStep(q, 'screen-sync');
  assert.notEqual(projectStatus(q).stage, 'S7s');
  touch(q, 'work/cuts.v1.json', '{"v":2}', 900);
  assert.equal(projectStatus(q).stage, 'S7s', '初剪重做（cuts.v1.json 變了）');
  assert.match(projectStatus(q).evidence.join('；'), /cuts\.v1\.json 在上次螢幕錄影同步之後改過/);
});

test('status --json 的 summary：還沒初剪是 null；有初剪沒寫摘要＝none＋文字模式那一行；寫好＝ok', (t) => {
  const p = tmpDir(t, 'p3e-summary-');
  touch(p, 'assets/voice/b.m4a');
  const J = () => JSON.parse(spawnSync(process.execPath, [path.join(TOOLS, 'status.mjs'), '--project', p, '--json'], { encoding: 'utf8' }).stdout);
  assert.equal(J().summary, null);
  for (const f of ['work/main.mp4', 'work/cuts.md', 'work/rough.mp4']) touch(p, f);
  touch(p, 'work/rough.srt', SRT);
  const none = J().summary;
  assert.equal(none.state, 'none');
  const text = spawnSync(process.execPath, [path.join(TOOLS, 'status.mjs'), '--project', p], { encoding: 'utf8' }).stdout;
  assert.ok(text.split('\n').includes(none.line), `文字模式要有同一行：${none.line}`);
  touch(p, 'work/摘要.md', '這支影片講怎麼剪片。\n\n- 第一點\n- 第二點\n');
  const ok = J().summary;
  assert.deepEqual([ok.state, ok.line, ok.errors], ['ok', null, []]);
  touch(p, 'work/摘要.md', '- 只有列點\n');
  assert.equal(J().summary.state, 'bad');
});
