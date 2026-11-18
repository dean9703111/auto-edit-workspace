// 058 聲音、字幕樣式、重點字幕在完成影片預覽即時生效（editor/live-sound.mjs，build、剪輯服務、頁面共用）
//   哪些欄位算聲音（soundOf）、拿掉這些欄位之後的指紋（liveFingerprint：跟上次 build 比只差這些＝指紋一樣；第二輪加上字幕樣式、整則的重點字幕）
//   預覽裡每個出聲元素要乘多少（liveScale）：重新 build 之後是 1、🔇 是 0、人聲範圍音量照時間；做進去時是靜音就套不上（liveOk）
//   服務：/api/state 的 preview.liveOnly、preview.sound（build 寫的 .cache/live.json）
//   build／輸出：只改了聲音照樣重新 build，做出來的音量是新的值，輸出不會當成「沒變」
//   按鈕發光、講者提示、播放器裡的 data-volume 在 editor-live-sound-ui.test.mjs（要瀏覽器）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { TEMPLATE, WORKSPACE, TOOLS, imp, makeSrt, tmpDir, missingTools } from './helpers.mjs';

const L = await imp('editor/live-sound.mjs');
const { lookKey } = await imp('lib/look.mjs');
const D = await imp('lib/deliver.mjs');
const noFf = await missingTools('ffmpeg');
const sha1 = (s) => createHash('sha1').update(s).digest('hex');
const fp = (plan, srt = 'x', opts) => L.liveFingerprint(plan, srt, sha1, opts);
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ''}：${a} ≠ ${b}`);

const BASE = {
  version: 1, look: false,
  edit: { cuts: [[3, 4]], volume: { voice: 0, sfx: 0, media: 0 }, gains: [], sfx: [{ at: 5, sound: 'ding' }] },
  bed: { music: 'bed-a' },
  scenes: [
    { id: 's01', scene: 'concept', from: '#1', to: '#2e', slots: { text: '字卡' } },
    { id: 'm02', type: 'media', src: 'assets/screen/a.mp4', from: '#3', to: '#4e', volume: 0 },
  ],
};
const clone = (o) => JSON.parse(JSON.stringify(o));
const withPlan = (fn) => { const p = clone(BASE); fn(p); return p; };

test('哪些欄位算聲音：人聲／音效／素材原聲、範圍音量、自己加的音效的 dB、背景音樂、段的音效音量、素材原聲音量', () => {
  const p = withPlan((p) => {
    p.edit.volume = { voice: 3, sfx: -6, media: -2 };
    p.edit.gains = [{ from: 10, to: 20, db: -4 }, { from: 30, to: 30, db: 2 }];   // 長度 0 的不算（build 也不套）
    p.edit.sfx[0].db = -3;
    p.bed.volume = -10;
    p.scenes[0].sfxVolume = -5;
    p.scenes[1].volume = -8;
  });
  assert.deepEqual(L.soundOf(p), {
    voice: 3, sfx: -6, media: -2, gains: [{ from: 10, to: 20, db: -4 }], own: [{ at: 5, sound: 'ding', db: -3 }], bed: -10,
    segs: { s01: { sfxVolume: -5 }, m02: { volume: -8 } },
  });
  assert.deepEqual(L.soundOf({ version: 1, scenes: [] }), { voice: 0, sfx: 0, media: 0, gains: [], own: [], bed: 0, segs: {} }, '沒寫＝0 dB');
  assert.deepEqual(L.soundOf({ scenes: [{ id: 'm1', type: 'media', volume: false }] }).segs, {}, '原聲關著（volume false）不是音量');
});

test('指紋：只改聲音、字幕樣式、整則的重點字幕一樣；剪段、拉平人聲、加刪音效、換曲、開關原聲、講者、主題、只標幾個字的重點、字幕都不一樣；剪輯台補的預設值、沒寫 bed＝工作區預設那一首、look 寫法不同但做出來一樣都算同一個', () => {
  const a = fp(BASE);
  // 只差聲音
  for (const [name, fn] of [
    ['人聲音量', (p) => { p.edit.volume.voice = 6; }],
    ['音效、素材原聲音量', (p) => { p.edit.volume.sfx = -60; p.edit.volume.media = 4; }],
    ['範圍音量', (p) => { p.edit.gains = [{ from: 1, to: 2, db: -6 }]; }],
    ['自己加的音效的 dB', (p) => { p.edit.sfx[0].db = 4; }],
    ['背景音樂音量', (p) => { p.bed.volume = -40; }],
    ['段的音效音量', (p) => { p.scenes[0].sfxVolume = -12; }],
    ['素材原聲音量', (p) => { p.scenes[1].volume = -20; }],
    ['鍵的順序', (p) => { const { scenes, ...rest } = p; for (const k of Object.keys(p)) delete p[k]; Object.assign(p, { scenes, ...rest }); }],
    ['字幕樣式', (p) => { p.captionStyle = { look: 'outline', font: 'noto-serif', size: 90, weight: 700, lift: 40 }; }],
    ['整則的重點字幕', (p) => { p.captionMarks = ['#6', '#2']; }],
  ]) assert.equal(fp(withPlan(fn)), a, name);
  // 只標幾個字的（AI 寫的 "#N@詞"）頁面不管：改了要 build；整則的那幾個怎麼排、加或拿掉都一樣
  const words = withPlan((p) => { p.captionMarks = ['#3@關鍵', '#6']; });
  assert.equal(fp(withPlan((p) => { p.captionMarks = ['#2', '#3@關鍵']; })), fp(words));
  assert.notEqual(fp(words), a, '加了只標幾個字的');
  assert.notEqual(fp(withPlan((p) => { p.captionMarks = ['#3@別的']; })), fp(words), '換了標的字');
  assert.equal(fp(withPlan((p) => { p.captionMarks = []; })), a, '空陣列＝沒寫');
  // 不只差聲音
  for (const [name, fn] of [
    ['剪段', (p) => { p.edit.cuts = [[3, 5]]; }],
    ['拉平人聲', (p) => { p.edit.level = true; }],
    ['加一顆音效', (p) => { p.edit.sfx.push({ at: 9, sound: 'click' }); }],
    ['換音效', (p) => { p.edit.sfx[0].sound = 'click'; }],
    ['換曲', (p) => { p.bed.music = 'bed-b'; }],
    ['這一集不配', (p) => { p.bed = { music: null }; }],
    ['關掉原聲', (p) => { p.scenes[1].volume = false; }],
    ['改字卡', (p) => { p.scenes[0].slots.text = '別的字'; }],
    ['瘦臉', (p) => { p.look = { slim: 0.6 }; }],
    ['主題（背景圖是 build 寫死的）', (p) => { p.theme = 'dark'; }],
  ]) assert.notEqual(fp(withPlan(fn)), a, name);
  assert.notEqual(fp(BASE, 'y'), a, '字幕檔改了');

  // 剪輯台第一次存檔會把 edit 補齊預設值：做出來一樣，不能因為這樣就要更新預覽
  const bare = { version: 1, scenes: [] };
  assert.equal(fp({ ...bare, edit: { cuts: [], fadeIn: 0, fadeOut: 0, volume: { voice: 2, sfx: 0, media: 0 }, gains: [], joins: [], sfx: [], level: false } }), fp(bare));
  // 沒寫 bed＝工作區預設那一首：剪輯台存背景音樂音量時會把曲名一起寫進去
  assert.equal(fp({ ...bare, bed: { music: 'bed-d', volume: -3 } }, 'x', { bedDefault: 'bed-d' }), fp(bare, 'x', { bedDefault: 'bed-d' }));
  assert.notEqual(fp({ ...bare, bed: { music: 'bed-e' } }, 'x', { bedDefault: 'bed-d' }), fp(bare, 'x', { bedDefault: 'bed-d' }));
  // look：false、沒寫（kit 預設全關）、寫了 0 做出來一樣（剪輯台開了瘦臉又關掉會寫 {color:0, slim:0}）
  const look = (plan) => fp(plan, 'x', { look: lookKey({ plan, templateDir: TEMPLATE }) });
  const kit = JSON.parse(fs.readFileSync(path.join(TEMPLATE, 'kit', 'look.json'), 'utf8'));
  assert.equal(look({ ...bare, look: false }), look({ ...bare, look: { color: 0, slim: 0, beauty: 0, belly: 0 } }));
  assert.equal(look({ ...bare, look: { slim: kit.slim } }), look(bare), '寫了和 kit 預設一樣的值');
  assert.notEqual(look({ ...bare, look: { slim: 0.6 } }), look({ ...bare, look: false }));
});

const B = L.soundOf(withPlan((p) => {
  p.edit.volume = { voice: 2, sfx: -3, media: 0 };
  p.edit.gains = [{ from: 10, to: 20, db: -6 }];
  p.edit.sfx[0].db = -2;
  p.bed.volume = -6;
  p.scenes[0].sfxVolume = -4;
  p.scenes[1].volume = -1;
}));
const now = (fn) => { const n = clone(B); fn(n); return n; };

test('每個出聲元素要乘多少：重新 build 之後是 1、只補差的 dB；🔇（人聲／音效／原聲 −60、背景音樂 −40）是 0；人聲範圍音量照播到的秒數', () => {
  const ids = ['s01', 'm02'];
  const K = (id) => L.soundKind(id, ids);
  const all = ['rough', 'rough-2', 'bgm-bed', 'sfx-own1', 'sfx-mood3', 'sfx-s01', 'sfx-s01-e2', 'mv-m02', 'mv-m02-2'];
  // 重新 build 之後（做進去的＝現在的）：全部是 1，不會疊兩次
  for (const id of all) assert.equal(L.liveScale(K(id), { built: B, now: B, t: 15 }), 1, id);
  // 只補差
  close(L.liveScale(K('rough'), { built: B, now: now((n) => { n.voice = 8; }), t: 5 }), L.dbGain(6), '人聲 +6');
  close(L.liveScale(K('bgm-bed'), { built: B, now: now((n) => { n.bed = -12; }) }), L.dbGain(-6), '背景音樂 −6');
  close(L.liveScale(K('sfx-mood3'), { built: B, now: now((n) => { n.sfx = 3; }) }), L.dbGain(6), '情緒點吃整條音效');
  close(L.liveScale(K('sfx-s01-e2'), { built: B, now: now((n) => { n.segs.s01.sfxVolume = -10; }) }), L.dbGain(-6), '段的音效音量');
  close(L.liveScale(K('sfx-own1'), { built: B, now: now((n) => { n.own[0].db = 4; n.sfx = 0; }) }), L.dbGain(9), '自己加的：自己的 dB＋整條音效');
  close(L.liveScale(K('mv-m02-2'), { built: B, now: now((n) => { n.segs.m02.volume = 5; n.media = -2; }) }), L.dbGain(4), '素材原聲：段＋整條');
  // 🔇＝0
  assert.equal(L.liveScale(K('rough'), { built: B, now: now((n) => { n.voice = -60; }), t: 5 }), 0);
  assert.equal(L.liveScale(K('bgm-bed'), { built: B, now: now((n) => { n.bed = -40; }) }), 0);
  assert.equal(L.liveScale(K('sfx-s01'), { built: B, now: now((n) => { n.sfx = -60; }) }), 0);
  assert.equal(L.liveScale(K('mv-m02'), { built: B, now: now((n) => { n.media = -60; }) }), 0);
  assert.equal(L.liveScale(K('sfx-own1'), { built: B, now: now((n) => { n.own = []; }) }), 0, '已經拿掉的那一顆先不出聲');
  assert.equal(L.liveScale(K('mv-m02'), { built: B, now: now((n) => { delete n.segs.m02; }) }), 0, '剛關掉原聲');
  // 人聲範圍音量：照播到 rough.mp4 的第幾秒，整條＋範圍（和 build 一樣：−58 不是靜音，加起來 ≤ −60 才是）
  const g = now((n) => { n.voice = 0; n.gains = [{ from: 10, to: 20, db: 2 }, { from: 30, to: 40, db: -60 }]; });
  close(L.liveScale(K('rough'), { built: B, now: g, t: 5 }), L.dbGain(-2), '範圍外：只差整條（做進去 +2、現在 0）');
  close(L.liveScale(K('rough'), { built: B, now: g, t: 15 }), L.dbGain(6), '做進去 2−6、現在 0+2');
  assert.equal(L.liveScale(K('rough'), { built: B, now: g, t: 35 }), 0, '這個範圍現在是靜音');
  close(L.liveScale(K('rough'), { built: B, now: g, t: 20 }), L.dbGain(-2), '範圍的結尾不包含（和 build 一樣）');
  close(L.liveScale(K('rough'), { built: B, now: now((n) => { n.gains = [{ from: 30, to: 40, db: -60 }]; }), t: 35 }), L.dbGain(-60), '整條 +2、範圍 −60＝−58，不是靜音');
  // 不是剪輯台管的聲音：不動
  for (const id of ['rough-tail', 'sfx-x99', 'mv-x99', 'title-card']) assert.equal(K(id), null, id);
  assert.deepEqual([K('sfx-s01-e2'), K('mv-m02-2'), K('sfx-own3')], [{ kind: 'sfx', seg: 's01' }, { kind: 'media', seg: 'm02' }, { kind: 'own', i: 2 }]);
  assert.deepEqual(L.soundKind('sfx-s01-e1', ['s01', 's01-e1']), { kind: 'sfx', seg: 's01-e1' }, '段號剛好長得像：完全相同的先');
});

test('做進去時是靜音、現在打開了：乘多少都還是靜音，要重新 build（liveOk false，那個元素先不動）', () => {
  assert.equal(L.liveOk(B, B), true);
  assert.equal(L.liveOk(B, now((n) => { n.voice = -60; n.bed = -40; })), true, '現在關掉可以（乘 0）');
  const mutedVoice = { ...B, voice: -60 };
  assert.equal(L.liveOk(mutedVoice, B), false);
  assert.equal(L.liveScale(L.soundKind('rough'), { built: mutedVoice, now: B, t: 0 }), 1, '先不動（不會乘出天文數字）');
  assert.equal(L.liveOk({ ...B, bed: -40 }, B), false);
  assert.equal(L.liveOk({ ...B, gains: [{ from: 10, to: 20, db: -62 }] }, B), false, '某個範圍做進去時是靜音');
  assert.equal(L.liveOk(B, now((n) => { n.gains = [{ from: 10, to: 20, db: -62 }]; })), true);
  assert.equal(L.liveOk(now((n) => { n.own[0].db = -60; }), B), false, '自己加的那一顆');
  assert.equal(L.liveOk(now((n) => { n.segs.m02.volume = -60; }), B), false, '素材原聲');
  assert.equal(L.liveOk(null, B), false, '舊版 build 沒記做進去的值');
});

// 暫存工作區：shared/template、shared/sfx 連到這個 repo 的（只讀）；4 秒有聲音的影片、2 句字幕
function makeProject(t, plan) {
  const root = tmpDir(t, 'editor-live-sound-');
  const shared = path.join(root, 'shared');
  fs.mkdirSync(shared);
  fs.symlinkSync(TEMPLATE, path.join(shared, 'template'), 'dir');
  fs.symlinkSync(path.join(WORKSPACE, 'shared', 'sfx'), path.join(shared, 'sfx'), 'dir');
  const project = path.join(root, 'projects', 'demo'), work = path.join(project, 'work'), out = path.join(work, 'hyperframes');
  fs.mkdirSync(out, { recursive: true });
  const v = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=navy:size=320x180:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
    '-t', '4', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(work, 'rough.mp4')]);
  assert.equal(v.status, 0, String(v.stderr));
  fs.writeFileSync(path.join(work, 'rough.srt'), makeSrt({ n: 2 }));
  const planFile = path.join(out, 'plan.json');
  fs.writeFileSync(planFile, `${JSON.stringify(plan, null, 2)}\n`);
  const P = { root, project, out, plan: planFile, srt: path.join(work, 'rough.srt'), video: path.join(work, 'rough.mp4'), templateDir: path.join(shared, 'template') };
  const build = () => {
    const r = spawnSync(process.execPath, [path.join(TOOLS, 'build.mjs'), '--project', project, '--template', P.templateDir], { cwd: root, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    return r;
  };
  // plan.json 改了要比 index.html 新（同一毫秒寫的不算改過）
  const writePlan = (p) => { fs.writeFileSync(planFile, `${JSON.stringify(p, null, 2)}\n`); const t2 = new Date(Date.now() + 2000); fs.utimesSync(planFile, t2, t2); };
  const tagOf = (id) => fs.readFileSync(path.join(out, 'index.html'), 'utf8').match(new RegExp(`<(?:audio|video) id="${id}"[^>]*>`))?.[0] ?? '';
  const volOf = (id) => { const m = /data-volume="([\d.]+)"/.exec(tagOf(id)); return m ? Number(m[1]) : 1; };
  return { P, planFile, build, writePlan, tagOf, volOf };
}

const PLAN0 = { version: 1, look: false, rhythm: 'spaced', bed: { music: null }, edit: { sfx: [{ at: 1, sound: 'ding' }] }, scenes: [] };

test('服務：preview.liveOnly＝跟上次 build 比只差聲音、字幕樣式、重點字幕（存檔回應也帶）；講者、剪段、字幕、加音效、主題都不算；舊版 build 沒有記錄就當不是', { skip: noFf, timeout: 240000 }, async (t) => {
  const { P, planFile, build, writePlan } = makeProject(t, PLAN0);
  build();
  const info = JSON.parse(fs.readFileSync(path.join(P.out, L.LIVE_INFO), 'utf8'));
  assert.equal(info.v, L.LIVE_INFO_V);
  assert.equal(info.index, Math.floor(fs.statSync(path.join(P.out, 'index.html')).mtimeMs), '記的是這一版 index.html');
  assert.deepEqual(info.sound, L.soundOf(PLAN0));
  const { startEditor } = await imp('editor.mjs');
  const ed = await startEditor({ cwd: P.root, flags: { project: P.project, template: P.templateDir }, port: 0, writeState: false, speakerTemplate: P.templateDir });
  t.after(() => ed.close());
  const get = async (p) => (await fetch(new URL(p, ed.url))).json();
  const pv = async () => { const s = (await get('/api/state')).preview; return [s.stale, s.liveOnly]; };
  assert.deepEqual(await pv(), [false, false]);
  assert.deepEqual((await get('/api/state')).preview.sound, info.sound, '頁面拿這個算差');

  // 只差聲音：stale 但 liveOnly
  const sound = clone(PLAN0);
  sound.edit = { cuts: [], fadeIn: 0, fadeOut: 0, volume: { voice: 6, sfx: -3, media: 0 }, gains: [{ from: 0, to: 2, db: -4 }], joins: [], sfx: [{ at: 1, sound: 'ding', db: -6 }] };
  writePlan(sound);
  assert.deepEqual(await pv(), [true, true]);
  assert.equal((await get('/api/version')).liveOnly, true, '/api/version 也帶（頁面輪詢用）');
  // 字幕樣式、整則的重點字幕也算
  writePlan({ ...sound, captionStyle: { look: 'outline', font: 'noto-serif', size: 90, weight: 700, lift: 40 }, captionMarks: ['#1'] });
  assert.deepEqual(await pv(), [true, true]);
  // look false 和 {color:0, slim:0} 做出來一樣
  writePlan({ ...sound, look: { color: 0, slim: 0 } });
  assert.deepEqual(await pv(), [true, true]);
  // 不只差聲音
  for (const [name, p] of [
    ['瘦臉', { ...sound, look: { slim: 0.6 } }],
    ['剪段', { ...sound, edit: { ...sound.edit, cuts: [[0.5, 1]] } }],
    ['加一顆音效', { ...sound, edit: { ...sound.edit, sfx: [...sound.edit.sfx, { at: 2, sound: 'click' }] } }],
    ['主題', { ...sound, theme: 'dark' }],
  ]) { writePlan(p); assert.deepEqual(await pv(), [true, false], name); }
  writePlan(sound);
  const srt = fs.readFileSync(P.srt, 'utf8');
  fs.writeFileSync(P.srt, srt.replace(/\n\n$/, '\n').replace(/(\n\d\d:[^\n]+\n)([^\n]+)/, '$1改過的字'));
  assert.deepEqual(await pv(), [true, false], '字幕改了（只改 rough.srt 也算過期）');
  fs.writeFileSync(P.srt, srt);
  const t3 = new Date(Date.now() + 3000);
  fs.utimesSync(P.srt, t3, t3);
  assert.deepEqual(await pv(), [true, true], '改回來');
  // 存檔回應帶 preview（頁面不用等下一次輪詢）
  const s = await get('/api/state');
  const r = await fetch(new URL('/api/save', ed.url), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quick: true, base: { mtime: s.plan.mtime, hash: s.plan.hash }, edit: { ...sound.edit, volume: { voice: 4, sfx: -3, media: 0 } } }) });
  const body = await r.json();
  assert.equal(r.status, 200, JSON.stringify(body));
  assert.deepEqual([body.preview?.stale, body.preview?.liveOnly], [true, true]);
  assert.equal(JSON.parse(fs.readFileSync(planFile, 'utf8')).edit.volume.voice, 4);
  // 做進去時是靜音、現在打開：要重新 build
  fs.writeFileSync(path.join(P.out, L.LIVE_INFO), JSON.stringify({ ...info, sound: { ...info.sound, voice: -60 } }));
  assert.deepEqual(await pv(), [true, false]);
  // 舊版 build（沒有記錄、或 index.html 之後被換過）：當不是
  fs.writeFileSync(path.join(P.out, L.LIVE_INFO), JSON.stringify({ ...info, index: info.index - 5000 }));
  assert.deepEqual(await pv(), [true, false]);
  assert.equal((await get('/api/state')).preview.sound, null);
});

test('只改了聲音：重新 build 做出來的音量是新的值，live.json 跟著換；輸出照樣先 build，不會當成「沒變」', { skip: noFf, timeout: 240000 }, async (t) => {
  const { P, build, writePlan, volOf, tagOf } = makeProject(t, PLAN0);
  build();
  assert.ok(tagOf('rough') && tagOf('sfx-own1'), '人聲和自己加的音效都在');
  const v0 = { rough: volOf('rough'), own: volOf('sfx-own1') };
  // 假裝已經輸出過這一版
  const F = D.deliverPaths(P.project);
  fs.mkdirSync(path.dirname(F.final), { recursive: true });
  fs.writeFileSync(F.final, 'old-video');
  const st = fs.statSync(F.final), fp1 = D.contentFingerprint(P);
  fs.writeFileSync(F.memo, JSON.stringify({ fingerprint: fp1, size: st.size, mtimeMs: Math.floor(st.mtimeMs), source: 'render' }));
  assert.equal(D.finalIsCurrent(P, fp1), true);

  writePlan({ ...PLAN0, edit: { volume: { voice: 6, sfx: 0, media: 0 }, sfx: [{ at: 1, sound: 'ding', db: -6 }] } });
  // 輸出：第一步一定是 build（lib/deliver.mjs runDeliver），這裡換成真的 build，後面的 render 用假的
  const calls = [];
  const job = D.newJob();
  await D.runDeliver(P, job, {
    build: async () => { calls.push('build'); const r = build(); return [200, { ok: true, log: r.stdout }]; },
    run: async (cmd, args) => {
      calls.push(cmd === 'ffprobe' ? 'probe' : args.includes('--fps') ? 'render' : 'other');
      if (cmd === 'ffprobe') return { code: 0, stdout: 'video\naudio\n', stderr: '' };
      if (args.includes('--fps')) fs.writeFileSync(args[args.indexOf('--output') + 1], 'new-video');
      if (args.includes('final')) return { code: 0, stdout: JSON.stringify({ ok: true, errors: 0, warnings: 0, checks: [], format: { width: 1920, height: 1080, fps: 30, hasAudio: true } }), stderr: '' };
      return { code: 0, stdout: '', stderr: '' };
    },
    report: async () => ({ report: { items: [] } }), pollMs: 10, said: '可以了，輸出完成影片',
  });
  assert.equal(calls[0], 'build', '先 build');
  assert.ok(Math.abs(volOf('rough') - v0.rough * L.dbGain(6)) < 1e-3, `人聲 +6 dB 做進去了：${v0.rough} → ${volOf('rough')}`);
  assert.ok(Math.abs(volOf('sfx-own1') - v0.own * L.dbGain(-6)) < 2e-3, `自己加的音效 −6 dB：${v0.own} → ${volOf('sfx-own1')}`);
  const info = JSON.parse(fs.readFileSync(path.join(P.out, L.LIVE_INFO), 'utf8'));
  assert.deepEqual([info.sound.voice, info.sound.own[0].db], [6, -6], 'live.json 記新的值（重新 build 之後差是 0）');
  assert.notEqual(job.source, 'same', `不是「沒變」：${job.source}／${job.error ?? ''}`);
  assert.notEqual(D.contentFingerprint(P), fp1);
  assert.ok(calls.includes('render'), `重新輸出了：${calls.join(',')}`);
  assert.equal(fs.readFileSync(F.final, 'utf8'), 'new-video');
});
