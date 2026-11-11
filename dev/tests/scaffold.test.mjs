// 分鏡素材（build.mjs --scaffold）：純函式與端到端
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { TOOLS, TEMPLATE, WORKSPACE, makeSrt, cueStart, imp } from './helpers.mjs';

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

test('splitParts（024）：照字數切：有 ## 照章切、超過 2,000 字切成差不多大的幾份（切點先挑小節）、不到 600 字併到相鄰那份；每句都在某一份、不重複', () => {
  // 30 分鐘、900 句（每句 2 秒、10 個字，共 9,000 字），每 50 句一個停頓長一點
  const many = Array.from({ length: 900 }, (_, i) => ({ n: i + 1, start: i * 2 + (Math.floor(i / 50) * 0.5), end: i * 2 + 1.8 + (Math.floor(i / 50) * 0.5), text: `這是第${String(i + 1).padStart(4, '0')}句字幕` }));
  assert.equal(K.charsOf('這是，第 1 句！OK'), 7, '去掉標點、空白');
  const none = K.splitParts({ cues: many, outline: [] });
  assert.equal(none.length, 5, `9,000 字切 5 份（現在 ${none.length}）`);
  for (const p of none) assert.ok(p.chars <= K.PART_CHARS && p.chars >= K.PART_MIN_CHARS, `${p.key} ${p.chars} 字`);
  assert.ok(Math.max(...none.map((p) => p.chars)) - Math.min(...none.map((p) => p.chars)) <= 700, '差不多大');
  let next = 1;
  for (const p of none) { assert.equal(p.firstN, next); next = p.lastN + 1; }
  assert.equal(next, 901, '每句都有人負責');
  const chapters = [{ level: 2, title: '第一章', first: 'x', n: 1 }, { level: 2, title: '第二章：很長的一章', first: 'x', n: 100 }];
  const parts = K.splitParts({ cues: many, outline: chapters });
  assert.equal(parts[0].title, '第一章');
  assert.equal(parts[0].lastN, 99, '第一章 990 字不用切');
  assert.ok(parts.length > 2, '第二章 8,010 字要再切');
  assert.ok(parts.every((p) => p.chars <= K.PART_CHARS));
  assert.equal(parts.filter((p) => p.chapterN != null).length, 1, '切開的章只有第一份放章節段；影片第一句就是章節開頭的不放');
  assert.equal(parts[0].chapter, null, '開場的勾子先上，不放章節轉場');
  assert.equal(parts.find((p) => p.chapterN != null).chapter, 1, '章號從下一章算起');
  // 小節：切點落在最接近目標字數的 ### 開頭
  const secs = [{ level: 2, title: '第一章', first: 'x', n: 1 }, { level: 3, title: '小節', first: 'x', n: 151 }];
  const two = K.splitParts({ cues: many.slice(0, 300), outline: secs });
  assert.deepEqual(two.map((p) => p.firstN), [1, 151], '3,000 字切兩份，切在小節開頭');
  // 太小的份併起來：開場 40 字、第一章 300 字，併到 600 字以上（第二章 2,660 字先切成兩份，第一份接上），兩章的章節段都留著
  const later = K.splitParts({ cues: many.slice(0, 300), outline: [{ level: 2, title: '第一章', first: 'x', n: 5 }, { level: 2, title: '第二章', first: 'x', n: 35 }] });
  assert.equal(later[0].title, '開場＋第一章＋第二章（1）', '開場和第一章都太小：一直併到 600 字以上');
  assert.deepEqual(later.flatMap((p) => p.chapters.map((c) => c.chapterN)), [5, 35], '第一句之前有講話：章節照放，併在一起的每章都有章節段');
  assert.ok(later.every((p) => p.chars >= K.PART_MIN_CHARS && p.chars <= K.PART_CHARS));
  const tiny = K.splitParts({ cues: many.slice(0, 120), outline: [{ level: 2, title: '一', first: 'x', n: 2 }, { level: 2, title: '二', first: 'x', n: 40 }, { level: 2, title: '三', first: 'x', n: 80 }] });
  assert.equal(tiny.length, 1, '全部加起來不到 2,000 字：併成一份');
  assert.deepEqual(tiny[0].chapters.map((c) => c.chapterN), [2, 40, 80], '每章的章節段都在');
  assert.equal(K.designTarget(1800), 54, '30 分鐘約 180 段的三成');
  assert.equal(K.designTarget(30), 0);
  assert.equal(K.designTargetOf(20), 6);
  assert.equal(K.designTargetOf(2), 0);
  assert.equal(K.designCap(6), 8);
  assert.equal(K.designEligible({ type: 'media' }), false);
  assert.equal(K.designEligible({ scene: 'chapter-tag' }), false);
  assert.equal(K.designEligible({ scene: 'key-point' }), true);
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
  assert.match(r.stdout, /--map-merge$/m, '024：第一回合先寫語意地圖，全部回來合併地圖');
  assert.ok(fs.existsSync(path.join(work, '分鏡素材', '語意.md')));
  assert.equal(JSON.parse(fs.readFileSync(path.join(work, '分鏡素材', 'index.json'), 'utf8')).semanticMap, true);
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
  assert.equal(K.floorLine(rules), '時間下限（`--check-draft` 會用實際時間算，不用自己算）：第一拍離段頭 ≥ 1.5 秒、拍與拍 ≥ 2.5–2.9 秒、最後一拍到段尾 ≥ 3.9 秒；項目全用上時段長至少 13.3 秒');
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

test('查詢指令：--spec、--icons、--words、--show、第二次 --check-draft 印可以交件；--scaffold 印第一回合（語意地圖）派工', () => {
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
  assert.doesNotMatch(r.stdout, /references\/director\.md/, '024：不再先派導演（主代理讀合併後的地圖做全片校正）');
  assert.match(r.stdout, /第一回合寫 .*ch01\.map\.md/, '只有一份：主代理自己寫地圖');

  r = run('--spec', 'x-process');
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /x-process/);
  assert.ok(r.stdout.length < 3000, `只印那一節，現在 ${r.stdout.length} 字`);
  r = run('--spec', 'media');
  assert.match(r.stdout, /retime/);
  assert.match(r.stdout, /redact/);
  assert.match(run('--spec', '不存在的東西').stdout, /可以查：/);
  r = run('--spec', 'x-process,fs-flow');
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /\*\*x-process\*\*[\s\S]*\*\*04c fs-flow\*\*/, '逗號一次查好幾個');

  assert.match(run('--icons', '手機').stdout, /smartphone/);

  r = run('--show', 's01');
  assert.match(r.stdout, /"key-point"/);
  assert.ok(r.stdout.length < 1500);

  fs.mkdirSync(path.join(proj, 'work', 'drafts'), { recursive: true });
  fs.writeFileSync(path.join(proj, 'work', 'drafts', 'ch01.json'), '{ 壞掉');
  assert.match(run('--check-draft', 'ch01').stdout, /JSON/);
  assert.match(run('--check-draft', 'ch99').stdout, /找不到草稿/, '找不到和 JSON 錯分開');

  // --outline：大綱 → 骨架；不認得的模板 ✖；相鄰同模板、太短 ⚠；--check-draft 擋還沒填的格子
  const ol = path.join(proj, 'work', 'drafts', 'ch01.outline.md');
  fs.writeFileSync(ol, 'id | from | to | 模板 | 在講什麼 | 候選構想\ns0101 | #1 | #1e | fs-flow | 流程 | —\nx0102 | #2 | #9e | x-process | 三步 | 人在三站之間跑\nx0103 | #10 | #18e | x-process | 再三步 | —\n');
  r = run('--outline', 'ch01');
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /s0101（04c fs-flow）只有 [\d.]+ 秒，至少要 4 秒/);
  assert.match(r.stdout, /x0103 和前一段 x0102 都用 x-process/);
  assert.match(r.stdout, /草稿骨架：.*ch01\.json（3 段，要填 \d+ 格/);
  const sk = JSON.parse(fs.readFileSync(path.join(proj, 'work', 'drafts', 'ch01.json'), 'utf8'));
  assert.deepEqual(sk.segments.map((x) => [x.id, x.from, x.to, x.template || x.scene]), [['s0101', '#1', '#1e', 'fs-flow'], ['x0102', '#2', '#9e', 'x-process'], ['x0103', '#10', '#18e', 'x-process']]);
  assert.equal(sk.segments[1].story.designIdea, '人在三站之間跑');
  assert.ok(sk.segments[0].anchor, '工具填 anchor');
  r = run('--check-draft', 'ch01');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /✖ 還沒填：s0101\.slots/);
  // 填過的段再跑 --outline 留著
  sk.segments[0].slots.title = '已經填了';
  fs.writeFileSync(path.join(proj, 'work', 'drafts', 'ch01.json'), JSON.stringify(sk));
  assert.equal(run('--outline', 'ch01').status, 0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(proj, 'work', 'drafts', 'ch01.json'), 'utf8')).segments[0].slots.title, '已經填了');
  // 空檔自動接上：to 寫成「講到第 N 句」（#3＝第 3 句開頭）也行，骨架照接好的寫；邊錄邊講蓋住的空檔不接，照樣 ⚠
  fs.writeFileSync(ol, 's0101 | #1 | #3 | fs-flow | 流程 | —\nx0102 | #4 | #9 | x-process | 三步 | 人在三站之間跑\nx0103 | #12 | #18e | x-scene | 再三步 | —\n');
  fs.writeFileSync(path.join(proj, 'work', 'screen-sync.json'), JSON.stringify({ segments: [{ id: 'sync01', from: cueStart(10), to: cueStart(12) }] }));
  r = run('--outline', 'ch01');
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /✓ 段與段之間的空檔自動接上 1 處.*：s0101 #3→#4$/m);
  assert.doesNotMatch(r.stdout, /s0101 結尾.*空了/);
  assert.match(r.stdout, /⚠ x0102 結尾（#9）到 x0103 起點（#12）空了/, '邊錄邊講蓋住的空檔不接');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(proj, 'work', 'drafts', 'ch01.json'), 'utf8')).segments.map((x) => [x.id, x.from, x.to]), [['s0101', '#1', '#4'], ['x0102', '#4', '#9'], ['x0103', '#12', '#18e']]);
  fs.rmSync(path.join(proj, 'work', 'screen-sync.json'));
  fs.writeFileSync(ol, 's0101 | #1 | #2e | 不存在的模板 | 流程 | —\n');
  r = run('--outline', 'ch01');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /不認得模板「不存在的模板」/);
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

test('內容設計動畫的 brief：段內的句子寫從段起點算的秒數，前後文只寫長度', async () => {
  const { briefCueLines } = await imp('lib/flow.mjs');
  const cues = [
    { n: 9, start: 18.0, end: 19.5, text: '前一句' },
    { n: 10, start: 20.0, end: 22.6, text: '而停止錄影驗收成果的時候' },
    { n: 11, start: 23.1, end: 25.6, text: '我需要在兩支手機間走來走去' },
    { n: 12, start: 26.0, end: 27.0, text: '後一句' },
  ];
  // 段從 #10+0.35 開始：第一句開頭在段起點前，寫 0.0；句間的停頓（22.6→23.1）要算進去，不能只累加句長
  assert.deepEqual(briefCueLines(cues, 10, 11, 20.35), [
    '（前後文）#9（1.5 秒）前一句',
    '#10（段內 0.0–2.3 秒）而停止錄影驗收成果的時候',
    '#11（段內 2.8–5.3 秒）我需要在兩支手機間走來走去',
    '（前後文）#12（1.0 秒）後一句',
  ]);
});

test('--outline：大綱一段一行，檢查段長、相鄰模板、接縫、章節角標、候選數量，產生骨架；--check-draft 擋還沒填的格子', async () => {
  const { parseOutline, minSecondsOf, placeholders } = await imp('lib/flow.mjs');
  const rows = parseOutline('id | from | to | 模板 | 在講什麼 | 候選構想\n|---|---|---|---|---|---|\ns0101 | #1 | #2e | key-point | 開場 | —\n| x0102 | #3 | #8e | x-scene | 跑來跑去 | 人來回跑 |\n');
  assert.deepEqual(rows.map((r) => [r.id, r.from, r.to, r.tpl, r.idea]), [['s0101', '#1', '#2e', 'key-point', ''], ['x0102', '#3', '#8e', 'x-scene', '人來回跑']]);
  assert.equal(minSecondsOf({ text: '**07 key-point**（重點字卡，疊加，最短 3.5 秒）：…' }, {}), 3.5);
  assert.equal(minSecondsOf({ text: '**x-a**：…\n時間下限（…）：第一拍離段頭 ≥ 2 秒、拍與拍 ≥ 2.5 秒、最後一拍到段尾 ≥ 3.9 秒' }, { slots: { items: [1, 2, 3] } }), 10.9);
  assert.deepEqual(placeholders([{ id: 's1', from: '#2', slots: { key: '<≤12 字>', lead: '已填' }, beats: { keyAt: '#N@詞' } }]), ['s1.slots.key（<≤12 字>）', 's1.beats.keyAt（#N@詞）']);
});

test('拍綁哪幾句：下限換成句號範圍；段太短只剩某句中段；圖示寫成中文給英文名稱', async () => {
  const { beatWindow } = await imp('lib/flow.mjs');
  const { iconHint } = await imp('lib/icon-alias.mjs');
  const cues = Array.from({ length: 8 }, (_, i) => ({ n: i + 1, start: i * 2, end: i * 2 + 1.9 }));
  assert.deepEqual(beatWindow(cues, 0, 16, { open: 2, gap: 2.5, end: 3.9 }), { first: 2, last: 7, lastHead: true, max: 5 });
  assert.deepEqual(beatWindow(cues, 0, 5, { open: 1.5, gap: 2.5, end: 3.9 }), { first: 1, last: 1, mid: true, max: 1 });
  assert.equal(beatWindow(cues, 0, 16, null), null);
  assert.match(iconHint('手機腳架', ['smartphone', 'laptop']), /英文名稱.*smartphone/);
  assert.match(iconHint('電腦', ['smartphone', 'laptop']), /laptop/);
  assert.match(iconHint('smartphon', ['smartphone'], (v, n) => n), /相近：smartphone/);
});

test('023 --check-draft 扣掉邊錄邊講的段：subtractSpans', async () => {
  const F = await imp('lib/flow.mjs');
  assert.deepEqual(F.subtractSpans([10, 20], []), [[10, 20]]);
  assert.deepEqual(F.subtractSpans([10, 20], [[12, 15]]), [[10, 12], [15, 20]]);
  assert.deepEqual(F.subtractSpans([10, 20], [[0, 30]]), []);
  assert.deepEqual(F.subtractSpans([10, 20], [[5, 12], [18, 25]]), [[12, 18]]);
  assert.deepEqual(F.subtractSpans([10, 20], [[20, 25], [0, 10]]), [[10, 20]]);
  assert.deepEqual(F.subtractSpans([5, 5], [[0, 1]]), []);
});

test('023 ensureBriefs：內容設計動畫段沒有 brief 才補寫（畫布照 build 算的 items），已經有的不動', async () => {
  const F = await imp('lib/flow.mjs');
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-brief-'));
  fs.mkdirSync(path.join(p, 'work', 'briefs'), { recursive: true });
  const srt = path.join(p, 'work', 'rough.srt');
  fs.writeFileSync(srt, '1\n00:00:00,000 --> 00:00:02,000\n第一句\n\n2\n00:00:02,000 --> 00:00:05,000\n第二句講重點\n\n3\n00:00:05,000 --> 00:00:09,000\n第三句\n');
  fs.writeFileSync(path.join(p, 'work', 'briefs', 'd2.md'), '舊的 brief\n');
  const plan = { scenes: [{ id: 's1', scene: 'key-point', from: '#1', to: '#1e' }, { id: 'd1', design: true, from: '#2', to: '#3e', story: { idea: '兩支手機' } }, { id: 'd2', design: true, from: '#3', to: '#3e' }] };
  const items = [{ id: 'd1', start: 2, end: 9, out: { wide: true, badgeBox: [1500, 40, 1800, 100] } }];
  const P = { project: p, srt, templateDir: TEMPLATE };
  const r = F.ensureBriefs(P, plan, items);
  assert.deepEqual(r.map((x) => x.id), ['d1']);
  const b = fs.readFileSync(path.join(p, 'work', 'briefs', 'd1.md'), 'utf8');
  assert.match(b, /^# d1 內容設計動畫/);
  assert.match(b, /這段 7\.0 秒/);
  assert.match(b, /## 畫布：全螢幕/);
  assert.match(b, /構想（草稿寫的，可以推翻）：兩支手機/);
  assert.equal(fs.readFileSync(path.join(p, 'work', 'briefs', 'd2.md'), 'utf8'), '舊的 brief\n');
  assert.deepEqual(F.ensureBriefs(P, plan, items), []);
  assert.deepEqual(F.ensureBriefs({ project: p, srt: path.join(p, 'nope.srt') }, plan, items), []);
  fs.rmSync(p, { recursive: true, force: true });
});

test('023 brief：前後段寫出用到的插圖與朝向（模板看 slots.parts、內容設計動畫看做好的檔）；疊加畫布寫講者框與可用範圍', async () => {
  const F = await imp('lib/flow.mjs');
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-brief2-'));
  const out = path.join(p, 'work', 'hyperframes');
  fs.mkdirSync(path.join(out, 'compositions'), { recursive: true });
  const srt = path.join(p, 'work', 'rough.srt');
  fs.writeFileSync(srt, '1\n00:00:00,000 --> 00:00:03,000\n第一句\n\n2\n00:00:03,000 --> 00:00:08,000\n第二句\n\n3\n00:00:08,000 --> 00:00:12,000\n第三句\n');
  fs.writeFileSync(path.join(out, 'compositions', 'x-design-d3.html'), '<template><!-- <div data-illus="tripod"></div> --><div data-illus="phone" data-orient="landscape"></div><div data-illus-src="illus-local/router.svg"></div></template>');
  const plan = { speakerBox: [1180, 120, 1700, 1080], scenes: [
    { id: 'x1', template: 'x-scene', from: '#1', to: '#1e', slots: { parts: [{ id: 'a', illus: 'phone', opts: { orient: 'landscape' } }, { id: 'g', layout: 'row', parts: [{ id: 'b', illus: 'laptop' }, { id: 'c', icon: 'cloud' }] }] } },
    { id: 'd2', design: true, layout: 'overlay', from: '#2', to: '#2e' },
    { id: 'd3', design: true, from: '#3', to: '#3e' }] };
  const P = { project: p, srt, templateDir: TEMPLATE, out };
  F.ensureBriefs(P, plan, [{ id: 'd2', start: 3, end: 8, out: {} }, { id: 'd3', start: 8, end: 12, out: { wide: true } }]);
  const b2 = fs.readFileSync(path.join(p, 'work', 'briefs', 'd2.md'), 'utf8');
  assert.match(b2, /前一段：x1（x-scene）；插圖：phone（landscape）、laptop（同一個東西用同一個名稱、朝向）/);
  assert.match(b2, /後一段：d3（內容設計動畫）；插圖：phone（landscape）、router（/);
  assert.doesNotMatch(b2, /tripod/, '註解裡的不算');
  assert.match(b2, /## 畫布：疊在講者畫面上[\s\S]*講者框 x 1180–1700、y 120–1080（audit 照這個框量「壓到講者」）。內容放在左邊 x 120–1180，y 40–900。/);
  const b3 = fs.readFileSync(path.join(p, 'work', 'briefs', 'd3.md'), 'utf8');
  assert.match(b3, /前一段：d2（內容設計動畫）\n/, '空白或沒做的設計段不寫插圖');
  fs.rmSync(p, { recursive: true, force: true });
});

test('023 dropBeatSheets：勾成內容設計動畫的段拿掉模板那張動畫分鏡（換一行指到鏡位腳本），別段不動；audit 讀不到那張表', async () => {
  const F = await imp('lib/flow.mjs');
  const { parseBeatSheets } = await imp('lib/audit-beats.mjs');
  const md = ['### x1｜#1–#2e', '', '截圖觀察：無', '', '#### 動畫分鏡 x1', '', '| 拍 | 講到（綁句） | 畫面上出現什麼 | 動態（設計系統語彙） | 焦點 | 音效拍點 |', '|---|---|---|---|---|---|', '| 0 | 段起點 | 主卡 | 開場 | 標題 | — |', '', '### x2｜#3–#4e', '', '#### 動畫分鏡 x2', '', '| 拍 | 講到（綁句） | 畫面上出現什麼 | 動態（設計系統語彙） | 焦點 | 音效拍點 |', '|---|---|---|---|---|---|', '| 0 | 段起點 | 主卡 | 開場 | 標題 | — |', '', '## 需要我決定的事', ''].join('\n');
  const next = F.dropBeatSheets(md, ['x1']);
  assert.ok(parseBeatSheets(md).has('x1'));
  assert.ok(!parseBeatSheets(next).has('x1'));
  assert.ok(parseBeatSheets(next).has('x2'));
  assert.match(next, /截圖觀察：無\n\n動畫分鏡：改成內容設計動畫，鏡位腳本看 work\/designs\/x1\.md（設計師寫）\n\n### x2/);
  assert.equal(F.dropBeatSheets(md, []), md);
});

test('023 resetRuns：只清指定段的 audit 次數（換人接手從第 1 次算起），草稿和別段的不動；沒有檔不出錯', async () => {
  const F = await imp('lib/flow.mjs');
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-runs-'));
  const P = { out: path.join(p, 'work', 'hyperframes') };
  assert.deepEqual(F.resetRuns(P, ['d1']), []);
  F.runCount(P, 'audit:d1'); F.runCount(P, 'audit:d1'); F.runCount(P, 'audit:d2'); F.runCount(P, 'draft:ch01.json');
  assert.deepEqual(F.resetRuns(P, ['d1', 'd9']), ['d1']);
  assert.equal(F.runCount(P, 'audit:d1'), 1);
  assert.equal(F.runCount(P, 'audit:d2'), 2);
  assert.equal(F.runCount(P, 'draft:ch01.json'), 2);
  fs.rmSync(p, { recursive: true, force: true });
});

test('022 --design-status：還沒動手／腳本寫好／動畫做了＋audit 過；空白畫布 20 分鐘沒進度就重派', async () => {
  const F = await imp('lib/flow.mjs');
  const { pathsFrom } = await imp('build.mjs');
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-dstatus-'));
  const put = (rel, text, minAgo) => {
    const f = path.join(p, ...rel.split('/'));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, text);
    const t = new Date(Date.now() - minAgo * 60000);
    fs.utimesSync(f, t, t);
  };
  put('work/hyperframes/plan.json', JSON.stringify({ version: 1, scenes: [{ id: 's1', scene: 'key-point' }, { id: 'd1', design: true }, { id: 'd2', design: true }, { id: 'd3', design: true }, { id: 'd4', design: true }, { id: 'd5', design: true }] }), 40);
  const blank = '<template><div data-design-blank></div></template>';
  put('work/hyperframes/compositions/x-design-d1.html', blank, 30); put('work/briefs/d1.md', '# d1', 30);
  put('work/hyperframes/compositions/x-design-d2.html', blank, 30); put('work/briefs/d2.md', '# d2', 30); put('work/designs/d2.md', '# d2', 5);
  put('work/hyperframes/compositions/x-design-d3.html', '<template><div>做好了</div></template>', 3); put('work/briefs/d3.md', '# d3', 30); put('work/audit-shots/sheet-d3.jpg', 'jpg', 1);
  // 023：動畫做了一半、25 分鐘沒改、之後沒 audit 過 → 卡住；25 分鐘沒改但 audit 過（拼圖較新）→ 做完了，不算卡住
  put('work/hyperframes/compositions/x-design-d4.html', '<template><div>做一半</div></template>', 25); put('work/briefs/d4.md', '# d4', 40); put('work/audit-shots/sheet-d4.jpg', 'jpg', 30);
  put('work/hyperframes/compositions/x-design-d5.html', '<template><div>做好了</div></template>', 25); put('work/briefs/d5.md', '# d5', 40); put('work/audit-shots/sheet-d5.jpg', 'jpg', 24);
  const list = F.designStatus(pathsFrom({ project: p }));
  assert.deepEqual(list.map((d) => [d.id, d.stalled, d.audited]), [['d1', true, false], ['d2', false, false], ['d3', false, true], ['d4', true, false], ['d5', false, true]]);
  assert.equal(list[0].state, '還沒動手（派出 30 分鐘）');
  assert.equal(list[1].state, '腳本寫好、動畫還沒動手（腳本 5 分鐘前）');
  assert.equal(list[2].state, '動畫做了（最後改動 3 分鐘前），audit 0 個 ✖ 的拼圖是最新的');
  put('work/hyperframes/.cache/check-runs.json', JSON.stringify({ 'audit:d1': 3, 'audit:d3': 2 }), 0);
  const r = spawnSync(process.execPath, [path.join(TOOLS, 'build.mjs'), '--project', p, '--design-status'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(p, 'work', 'hyperframes', '.cache', 'check-runs.json'), 'utf8')), { 'audit:d3': 2 }, '023：要重派的段次數歸零，別段不動');
  assert.match(r.stdout, /d1：還沒動手（派出 30 分鐘）　⚠ 超過 20 分鐘沒進度/);
  assert.match(r.stdout, /→ 下一步：停掉原本負責 d1、d4 的設計師，重派[\s\S]*（d4）你是設計師[^\n]*用 edit 接著改，不要整份重寫[\s\S]*（d1）你是設計師[^\n]*先照 \.agents\/skills\/auto-edit-motion\/references\/design-script\.md 寫鏡位腳本/);
  // 023：重派之後從重派起算，新設計師還沒寫檔也不會馬上又被判卡住
  const again = spawnSync(process.execPath, [path.join(TOOLS, 'build.mjs'), '--project', p, '--design-status'], { encoding: 'utf8' });
  assert.match(again.stdout, /d1：還沒動手（重派 0 分鐘）\n/);
  assert.match(again.stdout, /d4：動畫做了（最後改動 25 分鐘前）\n/);
  assert.doesNotMatch(again.stdout, /停掉原本負責/);
  assert.equal(F.designStatus(pathsFrom({ project: p }), Date.now() + 21 * 60000)[0].stalled, true, '重派後 20 分鐘還是沒動才再判卡住');
  fs.rmSync(p, { recursive: true });
});

test('022 骨架代填：有字可對的時間格寫 auto、why 預設模板用途；auto 只收有把握的（字幕講得到、比上一格晚），其餘一次列出要落在哪兩格之間；中文圖示換英文', async () => {
  const F = await imp('lib/flow.mjs');
  // markAuto：項目有 text、x-scene 的拍有新元件、beats.<欄位>At 對到 slots；狀態切換那拍沒有字 → 留給模型
  const sc = { id: 'x1', template: 'x-scene', slots: { parts: [{ id: 'a', label: '<≤10 字>' }, { id: 'b', label: '<≤10 字>' }], beats: [{ at: '#N@詞', in: ['a'] }, { at: '#N@詞', in: ['b'] }, { at: '#N@詞', state: ['b', 'x', 'y'] }] } };
  assert.equal(F.markAuto(sc), 2);
  assert.deepEqual(sc.slots.beats.map((b) => b.at), ['auto', 'auto', '#N@詞']);
  const kp = { id: 's1', scene: 'fs-compare', slots: { leftHead: '<≤6 字>', rightHead: '<≤6 字>' }, beats: { leftAt: '#N@詞', rightAt: '#N@詞' } };
  assert.equal(F.markAuto(kp), 2);
  const ring = { id: 'x2', slots: { startAt: '#N@詞', startText: '<≤8 字>', numAt: '#N@詞', unit: '<≤3 字>', fixAt: '#N@詞', sol: '<≤6 字>' } };
  assert.equal(F.markAuto(ring), 2, 'numAt 沒有對應的字；fixAt 對 sol');
  assert.equal(ring.slots.numAt, '#N@詞');
  assert.equal(F.purposeOf({ text: '**07 key-point**（重點字卡，疊加，最短 3.5 秒）：講解講到一句必須記住的重點；語氣 warn＝…' }), '講解講到一句必須記住的重點');
  // resolveAuto：字幕講得到就補；改寫過的字對不到 → 一次列出、寫明要落在哪兩格之間；中文圖示換英文
  const cues = [
    { n: 1, start: 0, end: 3, text: '常見的平台有 YouTube 和 Podcast' },
    { n: 2, start: 3, end: 6, text: '還有線上課程和訪談節目' },
    { n: 3, start: 6, end: 9, text: '每一種都要準備不同的素材' },
  ];
  const seg = { id: 's03', scene: 'two-sides', from: '#1', to: '#3e', slots: { cards: [
    { text: 'YouTube', icon: '電腦', at: 'auto' }, { text: 'Podcast', icon: 'mic', at: 'auto' },
    { text: '網課', icon: '不存在的圖示', at: 'auto' }, { text: '訪談節目', icon: 'users', at: 'auto' }] } };
  const r = F.resolveAuto([seg], cues);
  assert.deepEqual(seg.slots.cards.map((c) => c.at), ['#1@YouTube', '#1@Podcast', 'auto', '#2@訪談節目']);
  assert.deepEqual(r.filled, ['s03.slots.cards[0].at', 's03.slots.cards[1].at', 's03.slots.cards[3].at']);
  assert.equal(r.failed.length, 1);
  assert.match(r.failed[0], /^s03\.slots\.cards\[2\]\.at：「網課」在這段（#1–#3e）的字幕裡對不到[^→]*→ 改寫成 #N@詞（[^）]*要在 #1@Podcast 和 #2@訪談節目 之間/);
  assert.equal(seg.slots.cards[0].icon, 'laptop');
  assert.deepEqual(r.icons, ['圖示「電腦」→ laptop']);
  assert.equal(seg.slots.cards[2].icon, '不存在的圖示', '對不到的照舊，--check-draft 用 iconHint 報');
  // 自己寫的詞當下限：後面的 auto 不能比它早（不會兩拍撞在一起或順序倒）
  const two = { id: 's2', scene: 'fs-compare', from: '#1', to: '#3e', slots: { leftHead: '線上課程', rightHead: 'YouTube' }, beats: { leftAt: '#2@線上課程', rightAt: 'auto' } };
  const r2 = F.resolveAuto([two], cues);
  assert.equal(two.beats.rightAt, 'auto');
  assert.match(r2.failed[0], /s2\.beats\.rightAt：「YouTube」.*要比上一格 #2@線上課程 晚/);
});

test('022 --outline 認得字卡動態：fx 沒有範例 JSON，照「vars：…」組骨架', async () => {
  const { snippetOf } = await imp('lib/flow.mjs');
  assert.deepEqual(snippetOf({ name: 'fx 23 文字方塊', text: '**fx 23 文字方塊**：三到四個關鍵詞輪流；vars：text（動畫文字）、items（四個面的詞（用 | 分隔））' }),
    { type: 'fx', fx: 23, from: '#N', to: '#Me', vars: { text: '<動畫文字>', items: '<四個面的詞（用 | 分隔）>' } });
  assert.equal(snippetOf({ name: '07 key-point', text: '**07 key-point**：…' }), null);
});

test('023 情緒點：chNN.md 列候選與數量；--check-draft 數量、推近次數 ⚠、詞對不到 ✖；--merge-drafts 寫進 plan.json 的 moods（scenes 前面）', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-moods-'));
  fs.mkdirSync(path.join(root, 'shared', 'sfx'), { recursive: true });
  const tpl = path.join(root, 'shared', 'template');
  fs.symlinkSync(TEMPLATE, tpl, 'dir');
  fs.symlinkSync(path.join(WORKSPACE, 'shared', 'style.md'), path.join(root, 'shared', 'style.md'));
  for (const n of Object.keys(JSON.parse(fs.readFileSync(path.join(TEMPLATE, 'kit', 'sfx.json'), 'utf8')))) fs.copyFileSync(path.join(TEMPLATE, '..', 'sfx', 'ding.wav'), path.join(root, 'shared', 'sfx', `${n}.wav`));
  const proj = path.join(root, 'projects', 'm');
  fs.mkdirSync(path.join(proj, 'work', 'hyperframes'), { recursive: true });
  fs.mkdirSync(path.join(proj, 'assets', 'camera'), { recursive: true });
  const ff = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '110', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(proj, 'work', 'rough.mp4')], { encoding: 'utf8' });
  assert.equal(ff.status, 0, ff.stderr);
  const srt = makeSrt({ n: 30 }).replace('第 5 句字幕內容', '千萬不要這樣做').replace('第 12 句字幕內容', '結果竟然成功了');
  fs.writeFileSync(path.join(proj, 'work', 'rough.srt'), srt);
  fs.writeFileSync(path.join(proj, 'work', 'hyperframes', 'plan.json'), JSON.stringify({ version: 1, look: false }));
  const run = (...a) => spawnSync(process.execPath, [path.join(TOOLS, 'build.mjs'), ...a, '--template', tpl, '--project', 'projects/m'], { cwd: root, encoding: 'utf8', timeout: 120000 });

  let r = run('--scaffold');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const md = fs.readFileSync(path.join(proj, 'work', '分鏡素材', 'ch01.md'), 'utf8');
  assert.match(md, /## 情緒點（`moods`：這一份約 2 個，最多 4 個；推近最多 1 次）/);
  assert.match(md, /- #5 痛點「千萬不要」：千萬不要這樣做/);
  assert.match(md, /- #12 反轉「竟然」/);
  assert.match(fs.readFileSync(path.join(proj, 'work', '分鏡素材', '共用.md'), 'utf8'), /\*\*情緒點寫 `moods`\*\*/);

  const seg = (id, a, z) => ({ id, scene: 'key-point', from: `#${a}`, to: `#${z}e`, slots: { key: '重點' }, story: { say: '講重點', why: '測試' } });
  const draft = { chapter: '01', segments: [seg('s0101', 1, 8), seg('s0102', 9, 16), seg('s0103', 17, 24), seg('s0104', 25, 30)], icons: {}, quotes: [], moods: [], decide: [] };
  const write = () => fs.writeFileSync(path.join(proj, 'work', 'drafts', 'ch01.json'), JSON.stringify(draft));
  fs.mkdirSync(path.join(proj, 'work', 'drafts'), { recursive: true });
  write();
  r = run('--check-draft', 'ch01');
  assert.match(r.stdout, /⚠ 情緒點 0 個，這一份約 2 個/);
  draft.moods = [{ at: '#12@竟然', kind: 'turn', zoom: true }, { at: '#5@千萬不要', kind: 'pain', zoom: true }, { at: '#20@不存在', kind: 'land' }];
  write();
  r = run('--check-draft', 'ch01');
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /✖ moods\[2\].*找不到詞「不存在」/);
  assert.match(r.stdout, /⚠ 推近（zoom）2 次，這一份最多 1 次/);
  draft.moods.pop();
  write();
  r = run('--merge-drafts', '--no-storyboard');
  assert.match(r.stdout, /情緒點 2 個（金句 0、反轉 1、痛點 1、解法 0、落定 0；推近 2 次）/);
  const plan = JSON.parse(fs.readFileSync(path.join(proj, 'work', 'hyperframes', 'plan.json'), 'utf8'));
  assert.deepEqual(plan.moods.map((m) => m.at), ['#5@千萬不要', '#12@竟然'], '照句號排');
  const keys = Object.keys(plan);
  assert.equal(keys.indexOf('moods'), keys.indexOf('scenes') - 1, 'moods 放在 scenes 前面');
});

test('024 語意地圖（純函式）：parseMap 認範圍與級；checkMap 擋語意與級、補全名、接縫 ⚠；mapOptions 照語意縮模板；mergeMaps 預算、開場結尾、視覺語言；designVsMap', async () => {
  const M = await imp('lib/semantic-map.mjs');
  const md = fs.readFileSync(path.join(TEMPLATE, 'SITUATIONS.md'), 'utf8');
  const types = K.semanticTypes(md), sit = K.situationRows(md);
  assert.equal(types.length, 16);
  const names = new Set(types.map((t) => t.name));
  for (const r of sit) for (const s of r.sem.split('、')) assert.ok(names.has(s) || /金句/.test(s), `SITUATIONS 第 ${r.line} 行的語意「${s}」不在語意類型裡`);
  for (const t of types) assert.ok(sit.some((r) => r.sem === t.name), `「${t.name}」沒有對到任何一列`);
  const rows = M.parseMap('句號範圍 | 語意 | 級 | 在講什麼 | 特徵\n|---|---|---|---|---|\n#1–#3 | 步驟 | B | 裝好 | 項目 3\n| #4-#6e | 定義 | a | 比喻 | 理由：核心 |\n#7 | 轉場 | C | 下一步 | —\n#9–#10 | 亂寫 | Z | x |\n');
  assert.deepEqual(rows.map((r) => [r.a, r.z, r.tier]), [[1, 3, 'B'], [4, 6, 'A'], [7, 7, 'C'], [9, 10, 'Z']]);
  const part = { firstN: 1, lastN: 12 };
  const c = M.checkMap(rows, { part, types });
  assert.equal(c.errors.length, 2, c.errors.join('\n'));
  assert.match(c.errors.join('\n'), /語意「亂寫」不在清單裡/);
  assert.match(c.errors.join('\n'), /級「Z」/);
  assert.equal(rows[1].sem, '定義／比喻', '半個名稱補成全名');
  assert.match(c.warns.join('\n'), /#8–#8 不在地圖上/);
  assert.match(c.warns.join('\n'), /#11–#12 不在地圖上/);
  const cues = Array.from({ length: 12 }, (_, i) => ({ n: i + 1, start: i * 2, end: i * 2 + 1.8 }));
  const synced = M.checkMap(M.parseMap('#1–#7 | 步驟 | B | x | —\n#9–#12 | 列舉 | B | y | —'), { part, cues, types, syncSpans: [[13.5, 15]] });
  assert.deepEqual(synced.warns, [], '邊錄邊講蓋住的句子不用寫進地圖');
  assert.match(M.checkMap(M.parseMap('#1–#12 | 情境 | A | x |'), { part, types }).warns.join(), /沒寫理由/);
  const opts = M.mapOptions(c.rows.filter((r) => r.sem !== '亂寫'), sit);
  assert.match(opts[0], /^#1–#3 步驟 B：08 Step 字卡｜04c 全畫面流程｜情境動畫 x-process\.html$/);
  assert.match(opts[1], /x-metaphor.*（A：一樣先套模板/);
  assert.match(opts[2], /^#7–#7 轉場 C：串場用最便宜的/);
  const specNames = ['media', '01 chapter', '06 concept', '07 key-point', '08 steps', '10 tips', '11 summary', '15 quote', '04c fs-flow', 'fx 01 文字爆發', 'fx 03 印章蓋印', 'fx 29 數字計數', 'x-process', 'x-metaphor', 'x-scene'];
  assert.match(M.mapOptions(c.rows.slice(0, 1), sit, specNames)[0], /^#1–#3 步驟 B：08 steps｜04c fs-flow｜x-process$/, '有寫法.md 的名稱：印能直接寫進大綱的名稱');
  assert.deepEqual(M.specKeys('回顧 → 11；金句 → 15', specNames), ['11 summary', '15 quote']);
  assert.deepEqual(M.specKeys('前一段是模板動畫 → 後面接一段 fx 03 印章', specNames), ['fx 03 印章蓋印']);
  assert.deepEqual(M.specKeys('media 段（USAGE.md 第 5 節）：運鏡', specNames), ['media']);
  // 024 MiniMax 試跑：一行塞太多句、A 佔太多 → ⚠
  const coarse = M.checkMap(M.parseMap('#1–#11 | 步驟 | B | x | —\n#12–#12 | 轉場 | C | y | —'), { part, types });
  assert.match(coarse.warns.join(), /1 行太長（#1–#11 11 句）/);
  const cues40 = Array.from({ length: 12 }, (_, i) => ({ n: i + 1, start: i * 4, end: i * 4 + 3.8 }));
  assert.match(M.checkMap(M.parseMap('#1–#9 | 步驟 | B | x | —\n#10–#12 | 列舉 | B | y | —'), { part, cues: cues40, types }).warns.join(), /#1–#9 9 句／36 秒/, '句數沒超過、秒數超過也算');
  const manyA = M.checkMap(M.parseMap(['#1–#2', '#3–#4', '#5–#6', '#7–#8', '#9–#10', '#11–#12'].map((x, i) => `${x} | 步驟 | ${i < 3 ? 'A' : 'B'} | x | 理由`).join('\n')), { part, types });
  assert.match(manyA.warns.join(), /A 有 3 行，占 6 行的 50%/);
  // 024 試跑：照秒數只列放得下的；最少項目放得下、全部放不下的照列但標出來
  const mins = { '08 steps': 6, '04c fs-flow': 4, 'x-process': 9 }, fulls = { '04c fs-flow': 7 };
  const timed = M.mapOptions(c.rows.slice(0, 1), sit, specNames, { secsOf: () => 5.5, minOf: (n) => mins[n] || 0, fullOf: (n) => fulls[n] || 0 })[0];
  assert.equal(timed, '#1–#3 步驟 B（5.5 秒）：04c fs-flow（項目全用上要 7 秒，這裡只放得下幾項）；放不下：08 steps ≥ 6 秒、x-process ≥ 9 秒（真的要用就和前後一行併成一段）');
  assert.match(M.mapOptions(c.rows.slice(0, 1), sit, specNames, { secsOf: () => 2, minOf: () => 3 })[0], /這一行太短，這一型的模板都放不下/);
  const cs = Array.from({ length: 5 }, (_, i) => ({ n: i + 1, start: i * 3, end: i * 3 + 2.5 }));
  assert.equal(M.rowSeconds({ a: 2, z: 3 }, cs), 6, '到下一句開口（--outline 會接上空檔）');
  assert.equal(M.rowSeconds({ a: 4, z: 5 }, cs), 5.5, '最後一句到它講完');
  const voiceOnly = specNames.filter((n) => !/^(06|07|08|10|11|15) /.test(n));
  assert.match(M.mapOptions(c.rows.slice(0, 1), sit, voiceOnly)[0], /^#1–#3 步驟 B：04c fs-flow｜x-process$/, '版式不能用的字卡不列，也不印原文');
  // 全片：20 行 → 預算 6、最多 8；超過 ✖，開場、結尾沒有 A ⚠，5 分鐘以上沒有視覺語言 ✖
  const mk = (a, tier, sem = '步驟') => ({ raw: `#${a}`, a, z: a, sem, tier, say: `第 ${a} 句`, note: tier === 'A' ? '理由' : '' });
  const parts = [{ key: 'ch01', title: '一', firstN: 1, lastN: 10 }, { key: 'ch02', title: '二', firstN: 11, lastN: 20 }];
  const by = new Map([['ch01', Array.from({ length: 10 }, (_, i) => mk(i + 1, i >= 3 && i < 8 ? 'A' : 'B'))], ['ch02', Array.from({ length: 10 }, (_, i) => mk(i + 11, i < 4 ? 'A' : i >= 6 ? 'C' : 'B', i >= 6 ? '轉場' : '步驟'))]]);
  const m = M.mergeMaps(parts, by, { videoDur: 600, hasVision: false });
  assert.deepEqual([m.stats.target, m.stats.cap, m.stats.A], [6, 8, 9]);
  assert.match(m.errors.join('\n'), /A 9 段，全片最多 8 段/);
  assert.match(m.errors.join('\n'), /視覺語言\.md/);
  assert.match(m.warns.join('\n'), /開場/);
  assert.match(m.warns.join('\n'), /結尾/);
  assert.match(m.warns.join('\n'), /連續 4 行都是 C/);
  assert.match(m.md, /## ch02｜二（#11–#20）\n\n#11–#11 \| 步驟 \| A \| 第 11 句 \| 理由/);
  assert.equal(M.mergeMaps(parts, by, { videoDur: 120 }).errors.length, 1, '不到 5 分鐘不用視覺語言');
  const w = M.designVsMap([{ id: 's01', n: 1, idea: false }, { id: 'x02', n: 4, idea: true }, { id: 's03', n: 9, idea: true }], [{ a: 1, z: 3, tier: 'A', say: '開場' }, { a: 4, z: 8, tier: 'A', say: '比喻' }, { a: 9, z: 12, tier: 'B', say: 'x' }]);
  assert.equal(w.length, 2);
  assert.match(w[0], /#1–#3 是 A（開場）→ 那一段寫候選構想/);
  assert.match(w[1], /s03 寫了候選構想，但 #9 在地圖上不是 A/);
});

test('024 語意地圖端到端：--map 驗一份（第一回合不印模板），--map-merge 未通過不寫 _map.json、通過才印第二回合；之後 --map 印每行的模板，--outline 照地圖對候選', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-semmap-'));
  const proj = path.join(root, 'p'), work = path.join(proj, 'work');
  fs.mkdirSync(path.join(work, 'hyperframes'), { recursive: true });
  fs.writeFileSync(path.join(work, 'rough.srt'), makeSrt({ n: 12 }));
  fs.mkdirSync(path.join(proj, 'assets', 'camera'), { recursive: true });
  fs.writeFileSync(path.join(proj, 'assets', 'camera', 'a.mp4'), '');
  const ff = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=25', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '44', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', path.join(work, 'rough.mp4')]);
  assert.equal(ff.status, 0, String(ff.stderr));
  const run = (...a) => spawnSync(process.execPath, [path.join(TOOLS, 'build.mjs'), '--project', proj, ...a], { encoding: 'utf8' });
  let r = run('--scaffold');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /第一回合寫 .*ch01\.map\.md/);
  r = run('--map', 'ch01');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /找不到地圖/);
  fs.mkdirSync(path.join(work, 'drafts'), { recursive: true });
  const map = path.join(work, 'drafts', 'ch01.map.md');
  fs.writeFileSync(map, '#1–#4 | 情境／故事 | A | 開場的故事 | 理由：勾子\n#5–#8 | 步驟 | B | 三個步驟 | 項目 3\n#9–#12 | 總結 | B | 回顧 | —\n');
  r = run('--map', 'ch01');
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /地圖通過：3 行（A 1、B 2、C 0）/);
  assert.match(r.stdout, /第一回合完成/);
  assert.doesNotMatch(r.stdout, /08 Step 字卡/, '全片校正前不印模板');
  r = run('--map-merge');
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /語意地圖通過/);
  assert.match(r.stdout, /--merge-drafts$/m);
  assert.ok(fs.existsSync(path.join(work, '分鏡素材', '語意地圖.md')));
  r = run('--map', 'ch01');
  assert.match(r.stdout, /#5–#8 步驟 B（14 秒）：08 steps｜04c fs-flow｜x-process/, "印秒數和能直接寫進大綱的名稱");
  assert.match(r.stdout, /--outline ch01$/m);
  fs.writeFileSync(path.join(work, 'drafts', 'ch01.outline.md'), 's0101 | #1 | #5 | key-point | 開場 | —\ns0102 | #5 | #9 | x-process | 步驟 | 人走過三站\ns0103 | #9 | #12e | key-point | 回顧 | —\n');
  r = run('--outline', 'ch01');
  assert.match(r.stdout, /地圖上 #1–#4 是 A（開場的故事）→ 那一段寫候選構想/);
  assert.match(r.stdout, /s0102 寫了候選構想，但 #5 在地圖上不是 A/);
  assert.doesNotMatch(r.stdout, /三成約/, '有地圖就不照每份三成算');
  fs.writeFileSync(map, fs.readFileSync(map, 'utf8').replace('| B | 回顧', '| X | 回顧'));
  r = run('--map-merge');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /級「X」/);
  assert.ok(!fs.existsSync(path.join(work, 'drafts', '_map.json')), '沒通過就拿掉 _map.json：第二回合不能開始');
});

test('025 共用.md：有跨集偏好（shared/偏好.md「照做」）就列在「這支影片」；沒有就不出現', () => {
  const cues = Array.from({ length: 12 }, (_, i) => ({ n: i + 1, start: i * 5, end: i * 5 + 4, text: `第 ${i + 1} 句` }));
  const base = { project: 'p', format: { label: '橫式' }, videoDur: 60, cues, assets: { screen: 0, images: 0 }, parts: [] };
  assert.match(K.renderCommon({ ...base, prefs: ['金句都放左邊', '章節不要音效'] }), /- 使用者的偏好（每一集都照做；和下面的規則衝突時照這幾條）：（1）金句都放左邊；（2）章節不要音效/);
  assert.doesNotMatch(K.renderCommon(base), /使用者的偏好/);
});

test('025 字卡動態照語意輪流推薦：catalog 每張有 sem（都是語意類型的名稱）、每種常見語意至少 2 張；mapOptions 同一種語意連續幾行給不同的卡、太長的行不推薦、C 級不再寫死三張', async () => {
  const M = await imp('lib/semantic-map.mjs');
  const { loadFx } = await imp('lib/scenes.mjs');
  const fx = loadFx(TEMPLATE);
  const types = new Set([...K.semanticTypes(fs.readFileSync(path.join(TEMPLATE, "SITUATIONS.md"), "utf8"))].map((x) => (Array.isArray(x) ? x[0] : x.name ?? x)));
  for (const f of fx) { assert.ok(Array.isArray(f.sem), `fx ${f.id} 沒有 sem`); for (const s of f.sem) assert.ok(types.has(s), `fx ${f.id} 的 sem「${s}」不是語意類型`); }
  const count = (s) => fx.filter((f) => f.sem.includes(s)).length;
  for (const s of ['轉場', '重點／警告', '對比', '問答', '情境／故事']) assert.ok(count(s) >= 2, `「${s}」只有 ${count(s)} 張字卡動態`);
  assert.ok(fx.filter((f) => f.sem.length).length >= 36, '40 張裡至少 36 張有語意入口');
  const rows = [1, 2, 3].map((k) => ({ a: k * 10, z: k * 10 + 1, sem: '轉場', tier: 'C' }));
  const out = M.mapOptions(rows, [], [], { secsOf: () => 4, fx });
  const picks = out.map((l) => [...l.matchAll(/fx (\d{2})/g)].map((m) => m[1]));
  assert.equal(new Set(picks.flat()).size, 6, `三行各兩張、都不一樣：${JSON.stringify(picks)}`);
  assert.doesNotMatch(out.join('\n'), /fx 01、fx 03、fx 38/);
  assert.match(out[0], /同一張字卡動態一集最多用 2 次/);
  const long = M.mapOptions([{ a: 1, z: 6, sem: '對比', tier: 'B' }], [], [], { secsOf: () => 20, fx })[0];
  assert.doesNotMatch(long, /字卡動態/, '20 秒的行不推薦字卡動態');
  const short = M.mapOptions([{ a: 1, z: 2, sem: '對比', tier: 'B' }], [], [], { secsOf: () => 5, fx })[0];
  assert.match(short, /只有一個詞或一句短話就用字卡動態：fx \d{2} [^｜]+｜fx \d{2}/);
});
