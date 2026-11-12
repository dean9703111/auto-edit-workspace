// 分鏡表產生器與套回 plan.json（lib/storyboard-gen.mjs）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { TEMPLATE, imp } from './helpers.mjs';

const G = await imp('lib/storyboard-gen.mjs');
const { loadScenes } = await imp('lib/scenes.mjs');
const { listFillSpecs } = await imp('lib/custom-fill.mjs');
const { parseStoryboard, storyboardDocState, applyStoryboardEdit } = await imp('editor/storyboard-md.mjs');
const { parseBeatSheets, BEAT_HEADER, BEAT_HEADER_ILLUS } = await imp('lib/audit-beats.mjs');
const { findSection } = await imp('versions.mjs');

const scenes = loadScenes(TEMPLATE);
const specs = new Map(listFillSpecs(path.join(TEMPLATE, 'custom')).map((f) => [f.template, f]));
const plan = {
  speakerBox: [1, 2, 3, 4],
  scenes: [
    { id: 's0101', scene: 'key-point', from: '#2', to: '#3e', slots: { lead: '前句', key: '一鍵同步' }, beats: { keyAt: '#3@同步' }, story: { say: '在講同步', row: '④ 重點', why: '只有一句重點', notAnim: '段長 < 4 秒' } },
    { id: 'x0102', type: 'custom', template: 'x-process', from: '#4', to: '#8e', slots: { title: '流程', items: [{ text: '甲', icon: 'video', at: '#5' }, { text: '乙', icon: 'file', at: '#6' }, { text: '丙', icon: 'scissors', at: '#7' }] }, story: { say: '三站', row: '③ 流程', why: '有先後' } },
    { id: 'd0103', type: 'custom', design: true, from: '#9', to: '#11e', story: { say: '跑來跑去', idea: '人來回跑', why: '親身經驗' } },
    { id: 'm0104', type: 'media', src: 'assets/screen/a.mp4', from: '#12', to: '#13e', in: 3, story: { say: '操作', why: '同一個操作' } },
  ],
};
const cues = Array.from({ length: 14 }, (_, i) => ({ n: i + 1, start: i * 3, end: i * 3 + 2.5, text: `第 ${i + 1} 句` }));
const items = new Map(plan.scenes.map((s, i) => [s.id, { id: s.id, start: i * 10, end: i * 10 + 8, layoutZh: s.type ? '子母畫面' : '疊加', label: s.type ? `custom ${s.id}` : '07 重點字卡', opaque: !!s.type }]));
const designMd = '概念：來回跑很累\n畫面：俯視房間，腳印越來越多\n\n#### 動畫分鏡 d0103\n\n| 拍 | 講到（綁句） | 畫面上出現什麼 | 動態（設計系統語彙） | 焦點 | 音效拍點 | 插圖元件（狀態） | 位置 |\n|---|---|---|---|---|---|---|---|\n| 1 | `#9@跑` | 人走到手機旁 | 游標移動（人） | 人 | — | `personTop` | panelTop |\n';
const ctx = () => ({
  project: 'demo', plan, items, cues, scenes, specs, voiceOnly: [[20, 28]],
  shots: new Map([['s0101', [{ id: 's0101', file: 's0101.png', md: '![s0101](storyboard-preview/s0101.png)' }]]]),
  merged: { icons: { 手機: 'smartphone' }, decide: ['要不要加片頭'], quotes: [{ n: 4, text: '一句話', card: '卡上文字', mood: '正' }] },
  parts: [{ firstN: 1, lastN: 20, title: '第一章' }], designs: new Map([['d0103', { ...G.parseDesign(designMd, 'd0103'), done: false }]]),
});

test('renderStoryboard：網頁讀得懂、每段一節、總覽與判定表齊全、動畫分鏡 audit 讀得懂、versions 找得到那一節', () => {
  const md = G.renderStoryboard(ctx());
  const st = storyboardDocState(md, { hash: () => 'h', imageUrl: () => null, beatHeaders: [BEAT_HEADER, [...BEAT_HEADER, ...BEAT_HEADER_ILLUS]] });
  assert.deepEqual(st.warnings, []);
  const ids = st.sections.filter((s) => s.id).map((s) => s.id);
  assert.deepEqual(ids, ['s0101', 'x0102', 'd0103', 'm0104']);
  assert.equal(st.overview.s0101.summary, '在講同步');
  assert.match(md, /\| s0101 \| 在講同步 \| 07 重點字卡 \| 只有一句重點 \|/);
  assert.match(md, /講者框 speakerBox＝\[1,2,3,4\]/);
  assert.match(md, /\| 手機 \| smartphone \|/);
  assert.match(md, /畫面文字：前句「前句」；重點「一鍵同步」/);
  assert.match(md, /!\[s0101\]\(storyboard-preview\/s0101\.png\)/);
  assert.match(md, /概念：來回跑很累/);
  assert.match(md, /要不要加片頭/);
  assert.match(md, /結尾要不要配樂/);
  assert.match(md, /\| 1 \| #4 \| 一句話 \| 卡上文字 \| 正 \| ☐ \|/);
  const sheets = parseBeatSheets(md);
  assert.ok(sheets.get('x0102'), '模板動畫有分鏡');
  assert.ok(sheets.get('d0103'), '內容設計動畫有鏡位腳本');
  assert.equal(sheets.get('s0101'), undefined, '字卡不用分鏡');
  assert.match(findSection(md, 'x0102').text, /^### x0102｜/);
  assert.match(findSection(md, 'x0102').text, /#### 動畫分鏡 x0102/);
});

const edit = (md, id, label, fn) => {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`### ${id}｜`));
  const at = lines.findIndex((l, i) => i > start && l.startsWith(`- ${label}：`));
  lines[at] = fn(lines[at]);
  return lines.join('\n');
};

test('applyStoryboard：改字、改音效、勾金句都套回 plan；沒改就不動；要求欄不自動做', () => {
  const md = G.renderStoryboard(ctx());
  const none = G.applyStoryboard(md, plan, { scenes, specs });
  assert.equal(none.changed, false);
  assert.deepEqual(none.changes, []);
  assert.deepEqual(none.unmatched, []);
  let m = edit(md, 's0101', '畫面文字', (l) => l.replace('一鍵同步', '兩鍵同步'));
  m = edit(m, 'x0102', '畫面文字', (l) => l.replace('乙', '乙站'));
  m = edit(m, 's0101', '音效', () => '- 音效：無');
  m = m.replace('| 1 | #4 | 一句話 | 卡上文字 | 正 | ☐ |', '| 1 | #4 | 一句話 | 卡上文字 | 正 | ☑ |');
  const r = G.applyStoryboard(m, plan, { scenes, specs });
  const s = new Map(r.plan.scenes.map((x) => [x.id, x]));
  assert.equal(s.get('s0101').slots.key, '兩鍵同步');
  assert.equal(s.get('s0101').sfx, null);
  assert.equal(s.get('x0102').slots.items[1].text, '乙站');
  assert.deepEqual(s.get('q01').slots, { text: '卡上文字' });
  assert.equal(s.get('q01').from, '#4');
  assert.deepEqual(r.plan.scenes.map((x) => x.id), ['s0101', 'x0102', 'q01', 'd0103', 'm0104'], '照句號排序');
  assert.equal(plan.scenes[0].slots.key, '一鍵同步', '不改原本的物件');
  assert.equal(r.changes.length, 4);
  // 取消金句
  const back = G.applyStoryboard(m.replace('☑', '☐'), r.plan, { scenes, specs });
  assert.ok(!back.plan.scenes.some((x) => x.id === 'q01'));
  // 要求欄
  const asked = m.replace('- 音效：無', '- 音效：無\n- 想換成：x-ring\n- 補充說明：換個畫法');
  const q = G.applyStoryboard(asked, r.plan, { scenes, specs });
  assert.deepEqual(q.requests.map((x) => [x.id, x.label]), [['s0101', '想換成'], ['s0101', '補充說明']]);
  // 文字欄數量對不上：不猜，報給 AI
  const broken = edit(md, 's0101', '畫面文字', () => '- 畫面文字：只剩「一則」');
  assert.match(G.applyStoryboard(broken, plan, { scenes, specs }).unmatched[0], /s0101/);
});

test('內容設計動畫候選：分鏡表列成勾選表（026：預設都不勾、有預估），勾了才改成內容設計動畫，沒勾不動', () => {
  const cand = { ...plan, scenes: plan.scenes.map((s) => (s.id === 's0101' ? { ...s, sfx: 'pop', story: { ...s.story, designIdea: '同步像兩支手機握手', designWhy: '抽象概念' } } : s)) };
  assert.equal(G.isDesignPick(cand.scenes[0]), true);
  assert.equal(G.isDesignPick(cand.scenes[2]), false, '已經是內容設計動畫');
  assert.equal(G.isDesignPick(cand.scenes[3]), false, 'media 不算');
  const md = G.renderStoryboard({ ...ctx(), plan: cand });
  const st = storyboardDocState(md, { hash: () => 'h', imageUrl: () => null, beatHeaders: [BEAT_HEADER, [...BEAT_HEADER, ...BEAT_HEADER_ILLUS]] });
  assert.deepEqual(st.warnings, []);
  assert.match(md, /### 內容設計動畫候選/);
  assert.match(md, /\| 段 \| 時間碼 \| 現在用 \| 構想 \| 為什麼值得設計 \| 預估 \| 要不要 ☐ \|/);
  assert.match(md, /\| s0101 \| [^|]+ \| [^|]+ \| 同步像兩支手機握手 \| 抽象概念 \| 12 分鐘 \| ☐ \|/, '026：預設不勾，先套模板合成');
  assert.match(md, /預設都不勾：先全部套模板出完成影片預覽（全勾 1 段約 12 分鐘，4 段同時做）。想一開始就專門設計的段才勾/);
  assert.match(md, /不滿意再說「<段> 重新設計」/);
  assert.match(findSection(md, 's0101').text, /- 可以改做內容設計動畫：同步像兩支手機握手/);
  // 沒勾（預設）：plan 不動
  const none = G.applyStoryboard(md, cand, { scenes, specs });
  assert.equal(none.changed, false);
  assert.deepEqual(none.designs, []);
  // 勾了：換成內容設計動畫，留起訖、音效，拿掉模板欄位，構想搬到 story.idea
  const ticked = md.split('\n').map((l) => (l.startsWith('| s0101 |') && l.includes('同步像兩支手機握手') ? l.replace(/☐ \|$/, '☑ |') : l)).join('\n');
  const r = G.applyStoryboard(ticked, cand, { scenes, specs });
  assert.deepEqual(r.designs, ['s0101']);
  assert.ok(r.changes.includes('s0101 改成內容設計動畫（使用者勾選）'));
  const d = r.plan.scenes.find((x) => x.id === 's0101');
  assert.deepEqual(d, { id: 's0101', type: 'custom', design: true, from: '#2', to: '#3e', sfx: 'pop', story: { say: '在講同步', idea: '同步像兩支手機握手', why: '抽象概念' } });
  assert.equal(cand.scenes[0].scene, 'key-point', '不改原本的物件');
  // 再套一次：已經是內容設計動畫，不重複改
  assert.deepEqual(G.applyStoryboard(ticked, r.plan, { scenes, specs }).designs, []);
});

test('022 建議先做的段：⌈n/4⌉×12 ≤ 30 分鐘；各章輪流、同章段長的先；026 預設都不勾、表下寫全勾要多久', () => {
  assert.deepEqual([1, 4, 5, 8, 9].map(G.designMinutes), [12, 12, 24, 24, 36]);
  const cands = [
    { id: 'a1', part: '一', secs: 8 }, { id: 'a2', part: '一', secs: 20 }, { id: 'a3', part: '一', secs: 15 }, { id: 'a4', part: '一', secs: 9 },
    { id: 'b1', part: '二', secs: 12 }, { id: 'b2', part: '二', secs: 30 },
    { id: 'c1', part: '三', secs: 7 }, { id: 'c2', part: '三', secs: 11 }, { id: 'c3', part: '三', secs: 10 }, { id: 'c4', part: '三', secs: 6 },
  ];
  const on = G.defaultPicks(cands);
  assert.equal(on.size, 8, '8 段＝2 批×12＝24 分鐘；第 9 段會變 36 分鐘');
  assert.deepEqual([...on], ['a2', 'b2', 'c2', 'a3', 'b1', 'c3', 'a4', 'c1'], '各章輪流，同章長的先；二章用完就跳過');
  assert.ok(G.designMinutes(on.size) <= G.DESIGN_BUDGET);
  const d = { cands, on, minutes: G.designMinutes(on.size), all: G.designMinutes(cands.length) };
  assert.equal(G.designPlanLine(d), '勾了 8 段（預估 24 分鐘，4 段同時做）；全勾 10 段約 36 分鐘');
  assert.equal(G.designPlanLine({ cands, on: new Set(), minutes: 0, all: 36 }), '預設都不勾：先全部套模板出完成影片預覽（全勾 10 段約 36 分鐘，4 段同時做）');
  const dp = G.designPlan([{ id: 'k1', scene: 'key-point', story: { designIdea: '握手' } }, { id: 'k2', scene: 'key-point', story: {} }]);
  assert.deepEqual([dp.cands.map((c) => c.id), [...dp.on], [...dp.suggest]], [['k1'], [], ['k1']]);
  assert.equal(G.defaultPicks([]).size, 0);
});

test('網頁的文字編輯（applyStoryboardEdit 用的解析）能改到產生出來的分鏡表', () => {
  const doc = parseStoryboard(G.renderStoryboard(ctx()));
  const sec = doc.sections.find((s) => s.id === 's0101');
  const t = sec.blocks.find((b) => b.label === '畫面文字');
  assert.ok(t, '畫面文字是一個可編輯的欄位');
  assert.match(t.value, /「一鍵同步」/);
  assert.ok(sec.blocks.find((b) => b.label === '音效'));
  assert.equal(typeof applyStoryboardEdit, 'function');
});

test('parseDesign：概念、畫面、分鏡表', () => {
  const d = G.parseDesign(designMd, 'd0103');
  assert.equal(d.concept, '來回跑很累');
  assert.match(d.picture, /俯視房間/);
  assert.match(d.sheet, /^#### 動畫分鏡 d0103/);
  assert.equal(G.parseDesign('', 'x').concept, '');
});

test('需要我決定的事：去重、把 AI 自己能決定的分開、段號句號換成時間；回答會印給 AI', () => {
  const cues2 = Array.from({ length: 60 }, (_, i) => ({ n: i + 1, start: i * 10, end: i * 10 + 8, text: `第 ${i + 1} 句` }));
  const raw = [
    '講者姓名與頭銜還沒給：14 講者卡（#2–#5）沒寫 name、titles，會用 shared/setting.json（目前是示範人物林大寶）。請主代理問使用者要用的姓名與頭銜，不要用預設值上片。',
    '章節轉場在 #1（全幕 2.5 秒），會蓋住開場的前 2.5 秒。要不要先露臉再轉場，請主代理問使用者。',
    '講者姓名、頭銜待確認（#27 第一次自我介紹排 14，name、titles 未寫）',
    '章名：講稿沒有 ## 章名，依共用.md 自取「錄影痛點」；scaffold 原來的「第 2 章」已改掉',
    '章名自取：多機同步錄影（講稿沒有 ## 章名，待確認）',
    '章名（講稿沒有 ## 章名，自取）：多機同步錄影',
    'x-desk 的時間下限放不下 #19–#20，改用 07 字卡；想用 x-desk 要拉長段落，請主代理決定。',
    '循環素材：#20–#30 與 #10–#20 字幕相同，照同樣排法、未去重',
    '開場約 16 秒（#4–#6）只有講者沒有畫面，要不要補字卡？',
    '#47 用 07 重點字卡；想改成金句（15）請告訴我',
    '開場約 16 秒（#4–#6）只有講者沒有畫面，要不要補字卡？',
  ];
  const { ask, ai } = G.tidyDecide(raw, { cues: cues2 });
  assert.equal(ask.filter((x) => /姓名與頭銜/.test(x)).length, 1, '講者只問一次');
  assert.match(ask[0], /^講者的姓名與頭銜還沒給/);
  assert.equal(ask.filter((x) => /章名/.test(x)).length, 1, '章名只問一次');
  assert.match(ask.find((x) => /章名/.test(x)), /「錄影痛點」、「多機同步錄影」/);
  assert.equal(ask.filter((x) => /開場約 16 秒/.test(x)).length, 1, '一樣的只留一條，數字不能被當成情境編號拿掉');
  assert.ok(ask.includes('開場約 16 秒（0:30–0:58）只有講者沒有畫面，要不要補字卡？'), ask.join('\n'));
  assert.ok(ask.includes('章節轉場在 0:00（全幕 2.5 秒），會蓋住開場的前 2.5 秒。要不要先露臉再轉場'), ask.join('\n'));
  assert.ok(ask.includes('7:40 用重點字卡；想改成金句請告訴我'), ask.join('\n'));
  for (const x of ask) assert.doesNotMatch(x, /主代理|scaffold|name、titles|shared\/|#\d|x-[a-z]/, x);
  assert.equal(ai.length, 2);
  assert.match(ai[0], /x-desk/);
  assert.match(ai[1], /循環素材/);
  // 產生的檔：問作者的是數字清單，給 AI 的另一節，網頁解析得到
  const md = G.renderStoryboard({ ...ctx(), cues: cues2, merged: { ...ctx().merged, decide: raw } });
  assert.match(md, /## 需要我決定的事\n\n1\. 講者的姓名與頭銜還沒給/);
  assert.match(md, /### 給 AI 的備註（不用回答）\n\n- x-desk/);
  // 回答：套回時不改 plan.json，列給 AI
  const answered = md.replace('1. 講者的姓名與頭銜還沒給', '1. 講者的姓名與頭銜還沒給').replace(/(1\. 講者的姓名與頭銜還沒給[^\n]*\n)/, '$1   - 回答：鼎淵，工程師\n');
  const r = G.applyStoryboard(answered, plan, { scenes, specs });
  assert.equal(r.changed, false);
  assert.deepEqual(r.answers.map((a) => a.text), ['鼎淵，工程師']);
  assert.match(r.answers[0].q, /講者的姓名與頭銜/);
  assert.deepEqual(r.requests, [], '回答不擋通過');
});
