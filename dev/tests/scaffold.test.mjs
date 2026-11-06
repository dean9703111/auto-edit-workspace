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
  assert.match(long.warn[0], /16|14|13/);
  const short = K.chapterSegments(ch, cues, { videoDur: 120, scenes });
  assert.equal(short.segs[0].scene, 'chapter-tag');
  assert.equal(short.segs[0].from, '#2');
  const c = (s) => cues.find((x) => `#${x.n}` === s);
  assert.ok(c(short.segs[0].to.replace('e', '')).end - c(short.segs[0].from).start >= 3.5, '02 不短於最短長度');
  assert.equal(short.segs[1].slots.name, '這是一個超過十個字的很長章名', '不自己縮短');
  assert.ok(short.warn.length >= 1);
});

test('sceneSnippet：必填欄位、清單項數照下限、綁詞的 beats、01 用 at', () => {
  const list = JSON.parse(K.sceneSnippet(scene('04a-fs-list')));
  assert.equal(list.slots.items.length, 3);
  assert.equal(list.slots.items[0].at, '#N@詞');
  assert.equal(list.slots.visual, undefined, '選填不放');
  assert.deepEqual(JSON.parse(K.sceneSnippet(scene('07-key-point'))).beats, { keyAt: '#N@詞' });
  const ch = JSON.parse(K.sceneSnippet(scene('01-chapter')));
  assert.equal(ch.at, '#N');
  assert.equal(ch.from, undefined);
  // 每個情境的片段都是合法 JSON、key 在清單裡
  for (const d of fs.readdirSync(path.join(TEMPLATE, 'scenes'))) assert.ok(JSON.parse(K.sceneSnippet(scene(d))).scene);
});

test('真的文件：situationRows 行號對得上、四題與三條判準讀得到、拍型行號範圍對', () => {
  const md = fs.readFileSync(path.join(TEMPLATE, 'SITUATIONS.md'), 'utf8'), lines = md.split('\n');
  const rows = K.situationRows(md);
  assert.ok(rows.length > 40);
  for (const r of rows) assert.ok(lines[r.line - 1].startsWith(`| ${r.say}`), `第 ${r.line} 行`);
  assert.equal(K.situationQuestions(md).length, 6);
  assert.match(K.situationQuestions(md)[2], /看得見的東西在動/);
  const rules = K.animationRules(fs.readFileSync(path.join(WORKSPACE, 'shared', 'style.md'), 'utf8'));
  assert.ok(rules.some((l) => /段長 ≥ 4 秒/.test(l)));
  const bm = fs.readFileSync(path.join(TEMPLATE, 'BEATS.md'), 'utf8'), bl = bm.split('\n');
  const idx = K.beatIndex(bm);
  for (const b of idx) assert.match(bl[b.line - 1], /^##+ /);
  assert.deepEqual(idx.filter((b) => /^[A-I] /.test(b.text)).map((b) => b.text[0]).join(''), 'ABCDEFGHI');
});

test('--scaffold 端到端：不用 scenes、不改 plan.json；字幕、章節、寫法都在；直式不列不提供的情境', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-scaffold-'));
  const proj = path.join(root, 'p1'), work = path.join(proj, 'work'), out = path.join(work, 'hyperframes');
  fs.mkdirSync(out, { recursive: true });
  const ff = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=25', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '44', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', path.join(work, 'rough.mp4')]);
  assert.equal(ff.status, 0, String(ff.stderr));
  fs.writeFileSync(path.join(work, 'rough.srt'), makeSrt({ n: 12 }));
  fs.writeFileSync(path.join(proj, '講稿.md'), SCRIPT);
  const planText = JSON.stringify({ version: 1, speakerBox: [100, 100, 900, 900], frame: [0, 0, 1600, 900] });
  fs.writeFileSync(path.join(out, 'plan.json'), planText);
  const run = (...a) => spawnSync(process.execPath, [path.join(TOOLS, 'build.mjs'), '--project', proj, '--scaffold', ...a], { encoding: 'utf8' });
  const r = run();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /--check$/m);
  assert.equal(fs.readFileSync(path.join(out, 'plan.json'), 'utf8'), planText, 'plan.json 不動');
  const md = fs.readFileSync(path.join(work, '分鏡素材.md'), 'utf8');
  assert.match(md, /\| #1 \| 0:01\.0 \| 第 1 句字幕內容 \|/);
  assert.match(md, /\[100,100,900,900\]/);
  assert.match(md, /"scene":"chapter-tag","from":"#2"/, '短片：02');
  assert.match(md, /"sections": \[\{"at":"#4","name":"小節 A"\}\]/);
  assert.match(md, /### 07 key-point/);
  assert.match(md, /"beats":\{"keyAt":"#N@詞"\}/);
  assert.match(md, /不要查 `transcript\.json`/);
  assert.match(md, /`x-ring`/);
  assert.match(md, /### 03 side-panel/, '橫式有 03');
  const v = run('--format', 'portrait');
  assert.equal(v.status, 0, v.stdout + v.stderr);
  assert.doesNotMatch(fs.readFileSync(path.join(work, '分鏡素材.md'), 'utf8'), /### 03 side-panel/, '直式不列 03');
});
