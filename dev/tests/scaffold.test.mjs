// 分鏡素材（build.mjs --scaffold）：純函式與端到端
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { TOOLS, TEMPLATE, WORKSPACE, makeSrt, imp } from './helpers.mjs';

const K = await imp('lib/scaffold.mjs');
const { parseSrt } = await imp('lib/srt.mjs');
const cues = parseSrt(makeSrt({ n: 12 }));
const SCRIPT = ['# 標題', '', '## 第一章 剪乾淨：先把影片剪乾淨', '第 2 句字幕內容', '', '### 小節 A', '第 4 句字幕內容', '', '## 這是一個超過十個字的很長章名', '第 8 句字幕內容'].join('\n');
const scene = (n) => JSON.parse(fs.readFileSync(path.join(TEMPLATE, 'scenes', n, 'scene.json'), 'utf8'));

test('scriptOutline／alignOutline：## 章、### 小節對到字幕句號，對不到的拿掉', () => {
  const o = K.scriptOutline(SCRIPT);
  assert.deepEqual(o.map((x) => [x.level, x.title]), [[2, '第一章 剪乾淨：先把影片剪乾淨'], [3, '小節 A'], [2, '這是一個超過十個字的很長章名']]);
  assert.deepEqual(K.alignOutline(o, cues).map((x) => x.n), [2, 4, 8]);
  assert.deepEqual(K.alignOutline([{ level: 2, title: 'x', first: '字幕裡沒有這句話' }], cues), []);
});

test('chapterSegments：滿 3 分鐘用 01（at）、短片用 02（夠最短長度）；章名太長提醒、不自己縮', () => {
  const ch = K.alignOutline(K.scriptOutline(SCRIPT), cues).filter((x) => x.level === 2);
  const scenes = [scene('01-chapter'), scene('02-chapter-tag')];
  const long = K.chapterSegments(ch, cues, { videoDur: 200, scenes });
  assert.deepEqual(long.segs[0], { id: 'c01', scene: 'chapter', at: '#2', slots: { num: '01', title: '剪乾淨', sub: '先把影片剪乾淨' } });
  assert.match(long.warn[0], /上限 10/);
  const short = K.chapterSegments(ch, cues, { videoDur: 120, scenes });
  assert.equal(short.segs[0].scene, 'chapter-tag');
  const c = (s) => cues.find((x) => `#${x.n}` === s);
  assert.ok(c(short.segs[0].to.replace('e', '')).end - c(short.segs[0].from).start >= 3.5, '02 不短於最短長度');
  assert.equal(short.segs[1].slots.name, '這是一個超過十個字的很長章名', '不自己縮短');
});

test('sceneSnippet：必填欄位、清單項數照下限、綁詞的 beats、01 用 at', () => {
  const list = JSON.parse(K.sceneSnippet(scene('04a-fs-list')));
  assert.equal(list.slots.items.length, 3);
  assert.equal(list.slots.items[0].at, '#N@詞');
  assert.equal(list.slots.visual, undefined, '選填不放');
  assert.deepEqual(JSON.parse(K.sceneSnippet(scene('07-key-point'))).beats, { keyAt: '#N@詞' });
  assert.equal(JSON.parse(K.sceneSnippet(scene('01-chapter'))).at, '#N');
  for (const d of fs.readdirSync(path.join(TEMPLATE, 'scenes'))) assert.ok(JSON.parse(K.sceneSnippet(scene(d))).scene);
});

test('真的文件：situationRows 行號對得上、四題與三條判準讀得到、拍型行號範圍對', () => {
  const md = fs.readFileSync(path.join(TEMPLATE, 'SITUATIONS.md'), 'utf8'), lines = md.split('\n');
  const rows = K.situationRows(md);
  assert.ok(rows.length > 40);
  for (const r of rows) assert.ok(lines[r.line - 1].startsWith(`| ${r.say}`), `第 ${r.line} 行`);
  assert.match(K.situationQuestions(md)[2], /看得見的東西在動/);
  assert.ok(K.animationRules(fs.readFileSync(path.join(WORKSPACE, 'shared', 'style.md'), 'utf8')).some((l) => /段長 ≥ 4 秒/.test(l)));
});

test('splitParts：照章切、太長的章再切、沒有章節約每 5 分鐘一份；每句都在某一份、不重複', () => {
  // 30 分鐘、900 句（每句 2 秒），每 50 句一個停頓長一點
  const many = Array.from({ length: 900 }, (_, i) => ({ n: i + 1, start: i * 2 + (Math.floor(i / 50) * 0.5), end: i * 2 + 1.8 + (Math.floor(i / 50) * 0.5), text: `第 ${i + 1} 句` }));
  const none = K.splitParts({ cues: many, outline: [], videoDur: 1800 });
  assert.ok(none.length >= 4 && none.length <= 8, `30 分鐘分成 ${none.length} 份`);
  for (const p of none) assert.ok(p.seconds <= K.PART_TARGET * 1.3 + 120, `${p.key} ${p.seconds}`);
  let next = 1;
  for (const p of none) { assert.equal(p.firstN, next); next = p.lastN + 1; }
  assert.equal(next, 901, '每句都有人負責');
  const chapters = [{ level: 2, title: '第一章', first: 'x', n: 1 }, { level: 2, title: '第二章：很長的一章', first: 'x', n: 100 }];
  const parts = K.splitParts({ cues: many, outline: chapters, videoDur: 1800 });
  assert.equal(parts[0].title, '第一章');
  assert.ok(parts.length > 2, '第二章超過 8 分鐘要再切');
  assert.ok(parts.slice(1).every((p) => p.seconds <= K.PART_MAX + 120));
  assert.equal(parts.filter((p) => p.chapterN != null).length, 1, '切開的章只有第一份放章節段；影片第一句就是章節開頭的不放');
  assert.equal(parts[0].chapter, null, '開場的勾子先上，不放章節轉場');
  assert.equal(parts.find((p) => p.chapterN != null).chapter, 1, '章號從下一章算起');
  const later = K.splitParts({ cues: many, outline: [{ level: 2, title: '第一章', first: 'x', n: 5 }, { level: 2, title: '第二章', first: 'x', n: 100 }], videoDur: 1800 });
  assert.equal(later.filter((p) => p.chapterN != null).length, 2, '第一句之前有講話：章節照放');
  assert.equal(K.designTarget(1800), 15);
  assert.equal(K.designTarget(30), 0);
});

test('--scaffold 端到端：共用、寫法、每份一檔；不改既有 plan.json 的內容；直式不列不提供的情境；純聲音沒有 plan 也能跑', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-scaffold-'));
  const proj = path.join(root, 'p1'), work = path.join(proj, 'work'), out = path.join(work, 'hyperframes');
  fs.mkdirSync(out, { recursive: true });
  const ff = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=25', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '44', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', path.join(work, 'rough.mp4')]);
  assert.equal(ff.status, 0, String(ff.stderr));
  fs.writeFileSync(path.join(work, 'rough.srt'), makeSrt({ n: 12 }));
  fs.writeFileSync(path.join(proj, '講稿.md'), SCRIPT);
  fs.mkdirSync(path.join(proj, 'assets', 'camera'), { recursive: true });
  fs.writeFileSync(path.join(proj, 'assets', 'camera', 'a.mp4'), '');
  const planText = JSON.stringify({ version: 1, speakerBox: [100, 100, 900, 900], frame: [0, 0, 1600, 900] });
  fs.writeFileSync(path.join(out, 'plan.json'), planText);
  const run = (...a) => spawnSync(process.execPath, [path.join(TOOLS, 'build.mjs'), '--project', proj, '--scaffold', ...a], { encoding: 'utf8' });
  const r = run();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /--merge-drafts$/m);
  assert.equal(fs.readFileSync(path.join(out, 'plan.json'), 'utf8'), planText, 'plan.json 不動');
  const dir = path.join(work, '分鏡素材');
  const common = fs.readFileSync(path.join(dir, '共用.md'), 'utf8'), snippets = fs.readFileSync(path.join(dir, '寫法.md'), 'utf8');
  assert.match(common, /\[100,100,900,900\]/);
  assert.match(common, /不要查 `transcript\.json`/);
  assert.match(common, /內容設計動畫/);
  assert.match(snippets, /\*\*07 key-point\*\*/);
  assert.match(snippets, /"beats":\{"keyAt":"#N@詞"\}/);
  assert.match(snippets, /\*\*x-process\*\*/);
  assert.match(snippets, /"template":"x-process"/);
  const parts = fs.readdirSync(dir).filter((f) => /^ch\d+\.md$/.test(f));
  assert.ok(parts.length >= 1);
  const one = fs.readFileSync(path.join(dir, parts[0]), 'utf8');
  assert.match(one, /^#1 0:01\.0 第 1 句字幕內容$/m);
  assert.match(one, /work\/drafts\/ch01\.json/);
  assert.ok(common.length < 30000, `共用.md ${common.length} 字`);
  assert.match(snippets, /side-panel/, '橫式有 03');
  const v = run('--format', 'portrait');
  assert.equal(v.status, 0, v.stdout + v.stderr);
  assert.doesNotMatch(fs.readFileSync(path.join(dir, '寫法.md'), 'utf8'), /\*\*03 side-panel/, '直式不列 03');
  // 純聲音：assets/camera 空的、沒有 plan.json
  fs.unlinkSync(path.join(proj, 'assets', 'camera', 'a.mp4'));
  fs.mkdirSync(path.join(proj, 'assets', 'voice'), { recursive: true });
  fs.writeFileSync(path.join(proj, 'assets', 'voice', 'a.wav'), '');
  fs.unlinkSync(path.join(out, 'plan.json'));
  const pure = run();
  assert.equal(pure.status, 0, pure.stdout + pure.stderr);
  assert.ok(fs.existsSync(path.join(out, 'plan.json')), '純聲音也建好 plan.json');
  assert.match(fs.readFileSync(path.join(dir, '共用.md'), 'utf8'), /沒有講者/);
  assert.doesNotMatch(fs.readFileSync(path.join(dir, '寫法.md'), 'utf8'), /\*\*07 key-point/, '純聲音不列下方字卡');
});

test('寫法：模板的時間下限印成一行，寫草稿前就知道放不下', () => {
  const rules = [{ lhs: 'P1', rhs: null, k: 1.5 }, { lhs: 'P2', rhs: 'P1', k: 2.5 }, { lhs: 'P3', rhs: 'P2', k: 2.5 }, { lhs: 'FIX', rhs: 'P3', k: 2.9 }, { lhs: 'D', rhs: 'FIX', k: 3.9 }];
  assert.equal(K.floorLine(rules), '時間下限：第一拍離段頭 ≥ 1.5 秒、拍與拍 ≥ 2.5–2.9 秒、最後一拍到段尾 ≥ 3.9 秒；項目全用上時段長至少 13.3 秒');
  assert.equal(K.floorLine([]), '');
});

test('寫法：整欄一起進的清單（fs-compare）不寫單項 at，時間寫在 beats', () => {
  const scene = { key: 'fs-compare', slots: { left: { type: 'list', required: true, min: 2, item: { text: { type: 'text', max: 10 } } } }, beats: { leftAt: { label: '左欄進場（整欄一起進；綁講到左欄的詞：#N@詞）' } }, lists: { left: { at: '{{leftAt}}' } } };
  const seg = JSON.parse(K.sceneSnippet(scene));
  assert.ok(seg.slots.left.every((x) => !('at' in x)));
  assert.equal(seg.beats.leftAt, '#N@詞');
  const list = { key: 'fs-list', slots: { items: { type: 'list', required: true, min: 2, item: { text: { type: 'text' } } } }, lists: { items: { at: '0.5 + {{i}} * 0.35' } } };
  assert.ok(JSON.parse(K.sceneSnippet(list)).slots.items.every((x) => x.at === '#N@詞'));
});

test('長片的 ⚠：同一句話換段號 ≥ 3 段併成一行，不同的和全片的照印', async () => {
  const { groupWarnings } = await imp('lib/flow.mjs');
  const same = (id, n) => `[${id} key-point] 「重點字卡」大約會蓋到講者框 ${n}% → 看截圖`;
  const out = groupWarnings([same('s01', 25), '全片一則', same('s02', 25), same('s03', 30), '[x01 custom] 別的問題', same('s04', 25), same('s05', 25), same('s06', 25), same('s07', 25)]);
  assert.equal(out.length, 3);
  assert.match(out[0], /^\[s01、s02、s03、s04、s05、s06…共 7 段\] 「重點字卡」大約會蓋到講者框 25%/);
  assert.equal(out[1], '全片一則');
  assert.equal(out[2], '[x01 custom] 別的問題');
  assert.deepEqual(groupWarnings([same('s01', 25), same('s02', 25)]), [same('s01', 25), same('s02', 25)], '只有 2 段不併');
});

test('scriptOutline：## 後面緊接 ###，章和第一個小節都對到同一句', () => {
  const md = ['## 第一章', '', '### 小節 A', '', '第 2 句字幕內容', '', '### 小節 B', '第 4 句字幕內容', '', '## 第二章', '第 8 句字幕內容'].join('\n');
  const o = K.alignOutline(K.scriptOutline(md), cues);
  assert.deepEqual(o.map((x) => [x.level, x.title, x.n]), [[2, '第一章', 2], [3, '小節 A', 2], [3, '小節 B', 4], [2, '第二章', 8]]);
});

test('查詢指令：--spec、--icons、--words、--show、第二次 --check-draft 印可以交件；--scaffold 長片印導演派工', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-query-'));
  fs.mkdirSync(path.join(root, 'shared', 'sfx'), { recursive: true });
  const tpl = path.join(root, 'shared', 'template');
  fs.symlinkSync(TEMPLATE, tpl, 'dir');
  fs.symlinkSync(path.join(WORKSPACE, 'shared', 'style.md'), path.join(root, 'shared', 'style.md'));
  for (const n of Object.keys(JSON.parse(fs.readFileSync(path.join(TEMPLATE, 'kit', 'sfx.json'), 'utf8')))) fs.copyFileSync(path.join(TEMPLATE, '..', 'sfx', 'ding.wav'), path.join(root, 'shared', 'sfx', `${n}.wav`));
  const proj = path.join(root, 'projects', 'q');
  fs.mkdirSync(path.join(proj, 'work', 'hyperframes'), { recursive: true });
  fs.mkdirSync(path.join(proj, 'assets', 'camera'), { recursive: true });
  const ff = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '400', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(proj, 'work', 'rough.mp4')], { encoding: 'utf8' });
  assert.equal(ff.status, 0, ff.stderr);
  fs.writeFileSync(path.join(proj, 'work', 'rough.srt'), makeSrt({ n: 130 }));
  fs.writeFileSync(path.join(proj, 'work', 'hyperframes', 'plan.json'), JSON.stringify({ version: 1, look: false, scenes: [{ id: 's01', scene: 'key-point', from: '#1', to: '#2e', slots: { key: '重點' } }] }));
  const run = (...a) => spawnSync(process.execPath, [path.join(TOOLS, 'build.mjs'), ...a, '--template', tpl, '--project', 'projects/q'], { cwd: root, encoding: 'utf8', timeout: 120000 });

  let r = run('--scaffold');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /references\/director\.md/, '5 分鐘以上先派導演');
  fs.writeFileSync(path.join(proj, 'work', '分鏡素材', '視覺語言.md'), '# 視覺語言\n');
  r = run('--scaffold');
  assert.doesNotMatch(r.stdout, /references\/director\.md/, '已經有視覺語言就不用再派');

  r = run('--spec', 'x-process');
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /x-process/);
  assert.ok(r.stdout.length < 3000, `只印那一節，現在 ${r.stdout.length} 字`);
  r = run('--spec', 'media');
  assert.match(r.stdout, /retime/);
  assert.match(r.stdout, /redact/);
  assert.match(run('--spec', '不存在的東西').stdout, /可以查：/);

  assert.match(run('--icons', '手機').stdout, /smartphone/);

  r = run('--show', 's01');
  assert.match(r.stdout, /"key-point"/);
  assert.ok(r.stdout.length < 1500);

  fs.mkdirSync(path.join(proj, 'work', 'drafts'), { recursive: true });
  fs.writeFileSync(path.join(proj, 'work', 'drafts', 'ch01.json'), '{ 壞掉');
  assert.match(run('--check-draft', 'ch01').stdout, /JSON/);
  assert.match(run('--check-draft', 'ch99').stdout, /找不到草稿/, '找不到和 JSON 錯分開');
});

test('素材候選：逐句列、錄影和圖片各有配額（圖片再多也不會擠掉錄影）、少見的詞排前面；共用.md 只留路徑', () => {
  const many = parseSrt(makeSrt({ n: 12 }));
  many[2].text = '接著打開設定頁建立金鑰';
  many[5].text = '這裡看設定';
  const notes = [
    { file: 'assets/screen/a.mp4', moments: [{ from: 3, to: 9, what: '建立金鑰', keywords: ['金鑰'] }, { from: 20, to: 30, what: '別的', keywords: ['沒講到'] }] },
    ...Array.from({ length: 30 }, (_, i) => ({ file: `assets/images/p${i}.png`, what: `設定頁 ${i}`, keywords: ['設定'] })),
  ];
  const part = { a: 0, z: many.length - 1, seconds: 60 };
  const rows = K.assetsFor(part, many, notes);
  assert.deepEqual(rows.map((r) => r.n), [many[2].n, many[5].n]);
  const first = rows[0].items;
  assert.equal(first[0].m.file, 'assets/screen/a.mp4', '錄影排在圖片前面，不會被 30 張圖擠掉');
  assert.equal(first.filter((x) => x.m.kind === 'image').length, 1, '一句最多 1 張圖');
  const md = K.renderPart({ ...part, key: 'ch01', code: '01', title: 'x', firstN: 1, lastN: 12, start: 0, end: 60, target: 0 }, { cues: many, videoDur: 60, notes });
  assert.match(md, /## 素材候選/);
  assert.match(md, new RegExp(`- #${many[2].n}：assets/screen/a\\.mp4 3–9 秒（建立金鑰）｜assets/images/p\\d+\\.png`));
  assert.match(md, /events\.md/);
  const common = K.renderCommon({ project: 'p', format: { label: '橫式' }, videoDur: 60, cues: many, assets: { screen: 31, images: 120 }, notes, parts: [part] });
  assert.doesNotMatch(common, /assets\/images\/p0\.png/, '共用.md 不列每一個素材');
  assert.match(common, /work\/media\/<檔名>\/events\.md/);
  assert.match(common, /work\/media\/index\.md/);
  assert.match(common, /grep -l/);
});
