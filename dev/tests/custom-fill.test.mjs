// 情境動畫填資料（lib/custom-fill.mjs）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TEMPLATE, imp } from './helpers.mjs';

const F = await imp('lib/custom-fill.mjs');
const { loadIcons } = await imp('lib/scenes.mjs');
const CUSTOM = path.join(TEMPLATE, 'custom');
const icons = loadIcons(TEMPLATE);
const kitDir = path.join(TEMPLATE, 'kit');
const read = (n) => fs.readFileSync(path.join(CUSTOM, `${n}.html`), 'utf8');

const spec = F.readFillSpec(CUSTOM, 'x-process');
const three = { title: '測試流程', items: [{ text: '第一', icon: 'video', at: '#7@第一' }, { text: '第二', icon: 'file', at: '#9' }, { text: '第三', icon: 'scissors', at: '#11' }] };

test('每支有規格的模板：sample 填回去＝模板拿掉標記（標記沒有改到模板）；最少項也產得出來', () => {
  const specs = F.listFillSpecs(CUSTOM);
  assert.ok(specs.length >= 2);
  for (const s of specs) {
    const html = read(s.template);
    if (s.generator !== 'scene') {
      const r = F.fillTemplate({ spec: s, html, id: 'T', slots: s.sample, icons, rename: false, keepIcons: true, kitDir });
      assert.deepEqual(r.errors, [], s.template);
      assert.equal(r.html, F.stripMarkers(html), `${s.template}：sample 填回去要和模板一字不差`);
    }
    const r = F.fillTemplate({ spec: s, html, id: 'x1', slots: s.sample, icons, kitDir });
    assert.deepEqual(r.errors, [], s.template);
    assert.doesNotMatch(r.html, /@if |@sub |data-fill=/, `${s.template} 不留標記`);
    assert.ok(F.renderSheet(s, s.sample, 'x1'), `${s.template} 有動畫分鏡`);
  }
});

test('fillTemplate：項數變少刪掉那一站、句號文字圖示換掉、改名不和別段撞', () => {
  const r = F.fillTemplate({ spec, html: read('x-process'), id: 'x07', slots: three, icons, kitDir });
  assert.deepEqual(r.errors, []);
  assert.equal(r.file, 'compositions/x-process-x07.html');
  const body = r.html.split('<template')[1];
  assert.match(body, /id="x-process-x07"/);
  assert.match(body, /id="x-process-x07-template"|x-process-x07-template/);
  assert.match(body, /id="xprocx07-n3"/);
  assert.doesNotMatch(body, /xprocx07-n4/, '第 4 站整組拿掉');
  assert.doesNotMatch(body, /\bT4\b/);
  assert.match(body, /const T1 = P\.at\('#7@第一'\)/);
  assert.match(body, />第一</);
  assert.match(body, /測試流程/);
  assert.doesNotMatch(body, /從錄影到初剪|#12@錄影/, '範例的字不留');
  assert.match(body, /data-links="xprocx07-n1>xprocx07-n2 xprocx07-n2>xprocx07-n3"/);
  assert.match(body, /const TR = T3 \+ 2\.6/);
  assert.match(body, /P\.comet\('#xprocx07-n1-xprocx07-n2'/, '連接線的 id 兩段都要換，不然彗星線找不到對象');
  assert.doesNotMatch(body, /(?<!\w)xproc-/, '不留舊前綴');
  assert.doesNotMatch(body, /data-cues-sample/);
});

test('x-folder：TREE 照列寫、沒有的列 T＝-1、開場就在的列綁段頭、註記晚講到換成 N、沒有總結拿掉 ding；每列都要綁句', () => {
  const s = F.readFillSpec(CUSTOM, 'x-folder');
  const slots = { title: '自動產生的資料夾', items: [
    { text: 'example', depth: 0, at: '#183' }, { text: '講稿.md', depth: 1, kind: 'text', at: '#183' },
    { text: 'work', depth: 1, note: '自動產生', at: '#184@work', noteAt: '#186@自動產生' }, { text: 'output', depth: 1, note: '自動產生', at: '#185@output', noteAt: '#186@自動產生' }] };
  const r = F.fillTemplate({ spec: s, html: read('x-folder'), id: 'x05', slots, icons, kitDir });
  assert.deepEqual(r.errors, []);
  const code = r.html.match(/<script>\s*\(function[\s\S]*?<\/script>/)[0];   // 檔頭說明也寫了「<script>」，要找真正的那一段
  assert.match(code, /const TREE = \[\["example",0,null,null\],\["講稿\.md",1,"text",null\],\["work",1,null,"自動產生"\],\["output",1,null,"自動產生"\]\];/);
  assert.match(code, /const T1 = P\.at\('#183'\);\n\s+const T2 = P\.at\('#183'\);\n\s+const T3 = P\.at\('#184@work'\);\n\s+const T4 = P\.at\('#185@output'\);\n\s+const T5 = -1;/);
  for (const k of [1, 2, 5, 6, 7, 8, 9]) assert.match(code, new RegExp(`const N${k} = -1;`));
  assert.match(code, /const N3 = P\.at\('#186@自動產生'\);/);
  assert.match(code, /const N4 = P\.at\('#186@自動產生'\);/);
  assert.match(code, /const ALL = -1;/);
  assert.doesNotMatch(code, /P\.sfx\(/, '沒有總結句就沒有 ding');
  assert.doesNotMatch(code, /#38[2-9]@|#39[01]@/, '範例的句號不留');
  assert.doesNotMatch(r.html.split('<template')[1], /(?<!\w)xfld-/, '不留舊前綴');
  const withAll = F.fillTemplate({ spec: s, html: read('x-folder'), id: 'x05', slots: { ...slots, all: '#186@自動產生' }, icons, kitDir });
  assert.match(withAll.html, /const ALL = P\.at\('#186@自動產生'\);\s+P\.sfx\('ding', '#186@自動產生'\);/);
  const md = F.renderSheet(s, slots, 'x05');
  assert.match(md, /\| 1 \| `#183` \| 第 1 列「example」/);
  assert.match(md, /\| 3 \| `#184@work` \|/);
  assert.match(md, /\| 註 4 \| `#186@自動產生` \|/);
  assert.doesNotMatch(md, /`\{at\}`|\{note\}|undefined/);
  const bad = F.validateSlots(s, { title: '樹', items: [{ text: '這個名稱真的太長了超過十個字', depth: 5, kind: 'pdf' }] }, { icons }).join('\n');
  assert.match(bad, /items\[0\]\.at：必填/);
  assert.match(bad, /至少 3 項/);
  assert.match(bad, /上限 10/);
  assert.match(bad, /最大 3/);
  assert.match(bad, /folder／file／text/);
  assert.match(F.validateSlots(s, { title: '樹', items: Array.from({ length: 10 }, (_, i) => ({ text: `f${i}`, depth: 0 })) }, { icons }).join(), /最多 9 項/);
});

test('validateSlots：字數、項數、圖示、句號錯都報，訊息有改法', () => {
  const bad = { title: '這個標題真的已經超過十個字了', items: [{ text: '太長的站名喔', icon: 'nope', at: '12' }] };
  const e = F.validateSlots(spec, bad, { icons }).join('\n');
  assert.match(e, /上限 10/);
  assert.match(e, /至少 3 項/);
  assert.match(e, /上限 4/);
  assert.match(e, /找不到圖示/);
  assert.match(e, /要寫句號/);
  assert.match(F.validateSlots(spec, { ...three, oops: 1 }, { icons }).join(), /沒有「oops」/);
});

test('renderSheet：每一項一拍，收尾綁最後一項；表頭是 audit 認得的', () => {
  const md = F.renderSheet(spec, three, 'x07');
  assert.match(md, /^#### 動畫分鏡 x07/);
  assert.match(md, /\| 拍 \| 講到（綁句） \| 畫面上出現什麼 \| 動態（設計系統語彙） \| 焦點 \| 音效拍點 \|/);
  assert.match(md, /`#7@第一`/);
  assert.match(md, /`#11`＋2\.6/);
  assert.equal((md.match(/\| 4 \|/g) || []).length, 1);
  assert.match(md, /\| 6 \|/, '拍號逐項遞增');
});

test('x-scene：元件與拍是資料；工具算大小；檢查元件名、參照；分鏡八欄', () => {
  const s = F.readFillSpec(CUSTOM, 'x-scene');
  const slots = { title: '上傳', parts: [{ id: 'a', illus: 'phone', opts: { screen: 'video' }, label: '手機' }, { id: 'b', illus: 'cloud', label: '雲端', pre: true }], links: ['a>b'], beats: [{ at: '#3@手機', in: ['a'], focus: 'a' }, { at: '#4@雲端', in: ['b'], line: 'a-b', focus: 'b', sfx: 'success' }] };
  const r = F.fillTemplate({ spec: s, html: read('x-scene'), id: 'x1', slots, icons, kitDir });
  assert.deepEqual(r.errors, []);
  const body = r.html.split('<template')[1];
  assert.match(body, /id="xscx1-a" class="xscx1-it"/);
  assert.match(body, /data-illus="phone" data-screen="video" style="width:\d+px;height:\d+px"/);
  assert.match(body, /class="xscx1-it xscx1-pre"/);
  assert.match(body, /data-links="xscx1-a>xscx1-b"/);
  assert.match(body, /const T2 = P\.at\('#4@雲端'\);\s+P\.sfx\('success', '#4@雲端'\)/);
  assert.match(body, /line: 'xscx1-a-xscx1-b'/);
  assert.doesNotMatch(body, /以前的傳檔流程|#182@手機/);
  const sheet = F.renderSheet(s, slots, 'x1');
  assert.match(sheet, /插圖元件（狀態） \| 位置 \|/);
  assert.match(sheet, /`phone`（video）/);
  const bad = F.validateScene({ title: 'x', parts: [{ id: 'a', illus: 'nope' }], beats: [{ at: '12', in: ['z'] }] }, { kitDir, icons });
  assert.match(bad.join('\n'), /畫廊沒有「nope」/);
  assert.match(bad.join('\n'), /parts 裡沒有「z」/);
  assert.match(bad.join('\n'), /要寫句號/);
});

test('materializeFills：寫檔、slots 改了會更新；手改過的不覆寫；拿掉的段清掉；design 開空白畫布且不覆寫', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-fill-'));
  const lib = { customDir: CUSTOM, icons };
  const seg = () => ({ id: 'x07', type: 'custom', template: 'x-process', slots: JSON.parse(JSON.stringify(three)), from: '#1', to: '#2e' });
  let plan = { scenes: [seg()] };
  let r = F.materializeFills({ plan, outDir, lib });
  assert.deepEqual(r.errors, []);
  assert.equal(plan.scenes[0].src, 'compositions/x-process-x07.html');
  assert.equal(plan.scenes[0].layout, 'fullscreen');
  assert.ok(Object.keys(plan.scenes[0]).includes('src'));
  assert.ok(!Object.keys(plan.scenes[0]).includes('__sheet'), '內部欄位不可列舉');
  const f = path.join(outDir, plan.scenes[0].src);
  assert.match(fs.readFileSync(f, 'utf8'), /測試流程/);
  plan = { scenes: [{ ...seg(), slots: { ...three, title: '第二版標題' } }] };
  F.materializeFills({ plan, outDir, lib });
  assert.match(fs.readFileSync(f, 'utf8'), /第二版標題/, 'slots 改了會更新');
  fs.writeFileSync(f, `${fs.readFileSync(f, 'utf8')}<!-- 手改 -->`);
  plan = { scenes: [{ ...seg(), slots: { ...three, title: '第三版標題' } }] };
  r = F.materializeFills({ plan, outDir, lib });
  assert.match(r.warnings.join(), /手改過/);
  assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /第三版標題/);
  // 錯的 slots：不寫檔，錯誤放在 __fillErrors（plan.mjs 報）
  const badPlan = { scenes: [{ id: 'x08', type: 'custom', template: 'x-process', slots: { title: 'x' }, from: '#1', to: '#2e' }] };
  F.materializeFills({ plan: badPlan, outDir, lib });
  assert.match(badPlan.scenes[0].__fillErrors.join(), /slots\.items/);
  assert.ok(!fs.existsSync(path.join(outDir, 'compositions/x-process-x08.html')));
  // design
  const d = { id: 'd01', type: 'custom', design: true, from: '#1', to: '#2e', story: { idea: '一個構想' } };
  plan = { scenes: [d] };
  F.materializeFills({ plan, outDir, lib, prune: true });
  const df = path.join(outDir, 'compositions/x-design-d01.html');
  assert.match(fs.readFileSync(df, 'utf8'), /一個構想/);
  assert.equal(d.__blank, true);
  assert.match(fs.readFileSync(df, 'utf8'), /data-composition-id="x-design-d01"/);
  assert.match(fs.readFileSync(df, 'utf8'), /xdd01-idea/);
  // 還沒做：構想改了就跟著更新，還是空白
  const d1 = { ...d, story: { idea: '換一個構想' } }; delete d1.src; delete d1.layout;
  F.materializeFills({ plan: { scenes: [d1] }, outDir, lib });
  assert.match(fs.readFileSync(df, 'utf8'), /換一個構想/);
  assert.equal(d1.__blank, true);
  // 設計師寫到一半、占位還沒刪：不能蓋掉，但還算沒做
  const half = fs.readFileSync(df, 'utf8').replace('</style>', '/* 寫到一半 */</style>');
  fs.writeFileSync(df, half);
  const d1b = { ...d, story: { idea: '第三個構想' } }; delete d1b.src; delete d1b.layout;
  F.materializeFills({ plan: { scenes: [d1b] }, outDir, lib });
  assert.equal(fs.readFileSync(df, 'utf8'), half);
  assert.equal(d1b.__blank, true);
  // 設計師動手（占位刪掉）：不再是空白，也不覆寫
  fs.writeFileSync(df, fs.readFileSync(df, 'utf8').replace(/<div id="xdd01-idea"[^\n]*\n/, '<div id="xdd01-main"></div>\n').replace('</style>', '/* 做好了 */</style>'));
  const d2 = { ...d }; delete d2.src; delete d2.layout;
  plan = { scenes: [d2] };
  F.materializeFills({ plan, outDir, lib });
  assert.equal(d2.__blank, undefined);
  assert.match(fs.readFileSync(df, 'utf8'), /做好了/);
  // 拿掉的段：手改過的（x-process-x07）留著，沒手改的清掉
  assert.ok(fs.existsSync(f));
});

test('expandIcons：空的 data-icon 填 SVG，填過的不動，找不到回報', () => {
  const r = F.expandIcons('<span class="sc-icon" data-icon="scissors"></span><i data-icon="nope"></i>', icons);
  assert.match(r.html, /data-icon="scissors"><svg/);
  assert.deepEqual(r.missing, ['nope']);
  assert.equal(F.expandIcons(r.html.replace('<i data-icon="nope"></i>', ''), icons).html, r.html.replace('<i data-icon="nope"></i>', ''), '填過的不動');
});

test('025 x-scene 貼紙風格：sticker: true → 舞台標 data-sticker、最後一拍 peel: true、分鏡寫貼上／撕走；沒開 sticker 或不在最後一拍的 peel ✖', () => {
  const s = F.readFillSpec(CUSTOM, 'x-scene');
  const parts = [{ id: 'a', illus: 'phone', opts: { screen: 'video' }, label: '原片' }, { id: 'b', illus: 'laptop', opts: { screen: 'blank' }, label: '講稿' }];
  const slots = { title: '要準備的東西', sticker: true, parts, beats: [{ at: '#12@原片', in: ['a'] }, { at: '#13@講稿', in: ['b'] }, { at: '#14@不用了', peel: true }] };
  const r = F.fillTemplate({ spec: s, html: read('x-scene'), id: 'x1', slots, icons, kitDir });
  assert.deepEqual(r.errors, []);
  assert.match(r.html, /<div id="[\w-]*stage" data-sticker /);
  assert.match(r.html, /\[T3, \{ peel: true \}\]/);
  const sheet = F.renderSheet(s, slots, 'x1');
  assert.match(sheet, /貼上（原片）/); assert.match(sheet, /撕走（全部貼紙）/); assert.doesNotMatch(sheet, /回均衡/);
  const noStk = F.fillTemplate({ spec: s, html: read('x-scene'), id: 'x1', slots: { ...slots, sticker: false }, icons, kitDir });
  assert.ok(noStk.errors.some((e) => /peel：撕走只有貼紙風格能用/.test(e)), noStk.errors.join('\n'));
  const mid = F.fillTemplate({ spec: s, html: read('x-scene'), id: 'x1', slots: { ...slots, beats: [slots.beats[0], { at: '#13@不用了', peel: true }, { at: '#14@講稿', in: ['b'] }] }, icons, kitDir });
  assert.ok(mid.errors.some((e) => /只能放在最後一拍/.test(e)), mid.errors.join('\n'));
});

test('x-scene：拍裡提到的元件沒寫 in 就自動補；從頭到尾沒提到的放第一拍；隔著別的元件的連接線擋下來', () => {
  const s = { title: '測試', parts: [{ id: 'a', illus: 'phone' }, { id: 'b', illus: 'phone' }, { id: 'c', illus: 'phone' }, { id: 'd', illus: 'phone' }, { id: 'e', illus: 'phone', pre: true }],
    beats: [{ at: '#1@手機', state: ['a', 'blank', 'play'], focus: 'a' }, { at: '#2@電腦', line: 'a>b' }, { at: '#3@雲端', in: ['c'], focus: 'c' }] };
  const n = F.normalizeBeats(s);
  assert.deepEqual(n.beats[0].in, ['a', 'd'], '第一拍補 a（state、focus 提到），d 從頭到尾沒提到也放第一拍');
  assert.deepEqual(n.beats[1].in, ['b'], '連接線另一頭');
  assert.deepEqual(n.beats[2].in, ['c']);
  assert.deepEqual(s.beats[0].in, undefined, '不改原本的資料');
  const bad = F.validateScene({ title: '測試', parts: [{ id: 'a', illus: 'phone' }, { id: 'b', illus: 'phone' }, { id: 'c', illus: 'phone' }], links: ['a>c'], beats: [{ at: '#1@手機', in: ['a'] }] }, { kitDir: path.join(TEMPLATE, 'kit') });
  assert.ok(bad.some((e) => /中間隔著別的元件/.test(e)), bad.join('\n'));
  const ok = F.validateScene({ title: '測試', parts: [{ id: 'a', illus: 'phone' }, { id: 'b', illus: 'phone' }, { id: 'c', illus: 'phone', row: 2 }], links: ['a>c', 'a>b'], beats: [{ at: '#1@手機', in: ['a'] }] }, { kitDir: path.join(TEMPLATE, 'kit') });
  assert.deepEqual(ok, []);
});

test('024 x-prompt：關鍵詞那一行（pre＋k1＋mid＋k2＋post）加起來超過 17 字 ✖（每格各自沒超過也一樣），說明怎麼改', () => {
  const spec = JSON.parse(fs.readFileSync(path.join(CUSTOM, 'x-prompt.fill.json'), 'utf8'));
  const base = { title: '提示詞', k1: '複製', k2: '說明欄', icon: 'notebook-text', typeAt: '#24@提示', k1At: '#26@複製', k2At: '#27@說明' };
  const long = F.validateSlots(spec, { ...base, pre: '提示詞放在部落格，可以', mid: '，連結在影片的' }, { icons });
  assert.equal(long.length, 1, long.join('\n'));
  assert.match(long[0], /關鍵詞那一行.*23 字，上限 17.*移到 above/);
  assert.deepEqual(F.validateSlots(spec, { ...base, above: '提示詞放在部落格', pre: '可以', mid: '，連結在', post: '裡' }, { icons }), []);
});

test('024 x-scene：圖示、波形元件標 data-anchor（排版把它們當錨點，有標籤的照樣底對齊）', () => {
  const html = read('x-scene');
  const spec = JSON.parse(fs.readFileSync(path.join(CUSTOM, 'x-scene.fill.json'), 'utf8'));
  const slots = { title: '交給 AI 下載', parts: [{ id: 'a', illus: 'personBust', label: '你' }, { id: 'b', icon: 'git-branch', label: 'Git' }, { id: 'c', wave: true, label: '聲音' }], links: ['a>b'], beats: [{ at: '#1@交給', in: ['a', 'b', 'c'] }] };
  const r = F.fillTemplate({ spec, html, id: 'x0206', slots, icons, kitDir });
  assert.deepEqual(r.errors, []);
  assert.match(r.html, /<span class="sc-icon" data-anchor /);
  assert.match(r.html, /<div class="xsc\w*-wv" data-anchor><\/div>/, '前綴會換成這一段的（xscx0206-wv）');
  const layout = fs.readFileSync(path.join(kitDir, 'scene-layout.js'), 'utf8');
  assert.match(layout, /:scope > \[data-anchor\]/, 'scene-layout.js 的 anchorOf 認得 data-anchor');
});

test('x-scene 只有小零件（搜尋列＋徽章）：沒有主角就自動放大（徽章 2 倍、細長條放寬到 640）；有主角的照舊', () => {
  const s = F.readFillSpec(CUSTOM, 'x-scene');
  const beats = [{ at: '#12@搜尋', in: ['a'] }, { at: '#13@不順手', in: ['b'] }];
  const small = F.fillTemplate({ spec: s, html: read('x-scene'), id: 'x1', slots: { title: '試過都不順手', parts: [{ id: 'a', illus: 'searchBar', label: '上網搜尋' }, { id: 'b', illus: 'badge', label: '不順手' }], beats }, icons, kitDir });
  assert.deepEqual(small.errors, []);
  assert.match(small.html, /data-illus="badge"[^>]*style="width:192px;height:192px"/);
  assert.match(small.html, /data-illus="searchBar"[^>]*style="width:640px;/);
  const hero = F.fillTemplate({ spec: s, html: read('x-scene'), id: 'x1', slots: { title: '試過都不順手', parts: [{ id: 'a', illus: 'laptop', label: '電腦' }, { id: 'b', illus: 'badge', label: '不順手' }], beats }, icons, kitDir });
  assert.match(hero.html, /data-illus="badge"[^>]*style="width:96px;height:96px"/);
});

test('autoBreak：宣告了每行上限的欄位，沒寫 // 又超過一行就自動斷成兩行；寫了 // 的照使用者寫的；兩行也放不下原樣回傳', async () => {
  const S = await imp('lib/scenes.mjs');
  const lines = (v) => S.autoBreak(v, 9, 2).split('//').map((x) => S.visibleLen(x));
  assert.equal(S.autoBreak('本集流程', 9, 2), '本集流程');
  const a = lines('手機上看不出的小毛病');
  assert.equal(a.length, 2);
  assert.ok(a.every((n) => n <= 9), a.join('、'));
  assert.equal(S.autoBreak('AI 照規則剪//我只負責把關', 9, 2), 'AI 照規則剪//我只負責把關');
  assert.ok(!/\*\*[^*]*\/\/[^*]*\*\*/.test(S.autoBreak('用 **Claude Code** 做多機錄影工具', 9, 2)), '不斷在關鍵詞裡面');
  assert.equal(S.autoBreak('一二三四五六七八九十一二三四五六七八九', 9, 2), '一二三四五六七八九十一二三四五六七八九');
  assert.equal(S.autoBreak('手機上看不出的小毛病', 9, 1), '手機上看不出的小毛病');
});

test('026 合計上限（lines）：幾格排在同一行的寬度加起來、每格一個字多寬（weights）、清單每一項各算一次（list）', async () => {
  const { validateSlots } = await imp('lib/custom-fill.mjs');
  const spec = {
    lines: [
      { label: '結論句', slots: ['a', 'b'], max: 10, fix: '縮短' },
      { label: '名稱＋說明', list: 'items', slots: ['text', 'desc'], weights: [52, 40], max: 344, fix: '縮短說明' },
    ],
    slots: { a: { type: 'text', max: 10 }, b: { type: 'text', max: 10 }, items: { type: 'list', item: { text: { type: 'text', max: 5 }, desc: { type: 'text', max: 6 } } } },
  };
  assert.deepEqual(validateSlots(spec, { a: '五個字五個', b: '再五個字喔', items: [{ text: '內容', desc: '值得看完整支' }] }), [], '2×52＋6×40＝344 剛好放得下');
  const bad = validateSlots(spec, { a: '六個字六個字', b: '再五個字喔', items: [{ text: '內容', desc: '好' }, { text: '三個字', desc: '這樣五個字' }] });
  assert.equal(bad.length, 2);
  assert.match(bad[0], /^結論句「六個字六個字再五個字喔」11 字，上限 10（這幾格排在同一行、不換行）→ 縮短$/);
  assert.match(bad[1], /^slots\.items\[1\] 的名稱＋說明「三個字｜這樣五個字」合計寬 356，上限 344/);
  // 真的模板：壓力測試（dev/tools/custom-check.mjs --stress）量出來會破版的幾支都宣告了合計上限
  const read = (n) => JSON.parse(fs.readFileSync(path.join(TEMPLATE, 'custom', `${n}.fill.json`), 'utf8'));
  for (const n of ['x-metaphor', 'x-ring-facets', 'x-trend', 'x-terminal', 'x-prompt']) assert.ok(read(n).lines?.length, `${n} 要有 lines`);
});

// 056：fill.json 的 "portraitMax"（直式上限）：直式專案超過只 ⚠（materializeFills 帶 format: 'portrait'），橫式不查
test('056 portraitMax：清單項數、文字字數、清單每項欄位；直式才 ⚠、橫式不報', () => {
  const spec = { slots: { title: { type: 'text', max: 10 }, items: { type: 'list', item: { text: { type: 'text', max: 14 } } } }, portraitMax: { items: 3, 'items.text': 8, title: 6 } };
  const w = F.portraitMaxWarnings(spec, { title: '一二三四五六七', items: [{ text: '一二三四五六七八九' }, { text: 'AB' }, { text: 'C' }, { text: 'D' }] });
  assert.equal(w.length, 3, w.join('\n'));
  assert.match(w[0], /slots\.items：直式最多 3 項，現在 4 項/);
  assert.match(w[1], /slots\.items\[0\]\.text「一二三四五六七八九」9 字，直式上限 8/);
  assert.match(w[2], /slots\.title「一二三四五六七」7 字，直式上限 6/);
  assert.deepEqual(F.portraitMaxWarnings(spec, { title: '短', items: [{ text: 'A' }] }), []);
  assert.deepEqual(F.portraitMaxWarnings({ slots: spec.slots }, { title: '一二三四五六七八九十' }), [], '沒寫 portraitMax 不查');
  // materializeFills：format（或 plan.format）是 portrait 才查；照樣寫檔（只 ⚠）
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-fill-pm-'));
  try {
    const custom = path.join(dir, 'custom');
    fs.mkdirSync(custom);
    fs.copyFileSync(path.join(CUSTOM, 'x-process.html'), path.join(custom, 'x-process.html'));
    fs.writeFileSync(path.join(custom, 'x-process.fill.json'), JSON.stringify({ ...JSON.parse(fs.readFileSync(path.join(CUSTOM, 'x-process.fill.json'), 'utf8')), portraitMax: { items: 2 } }));
    const lib = { customDir: custom, icons };
    const plan = () => ({ scenes: [{ id: 'x07', type: 'custom', template: 'x-process', slots: JSON.parse(JSON.stringify(three)), from: '#1', to: '#2e' }] });
    const land = F.materializeFills({ plan: plan(), outDir: path.join(dir, 'a'), lib, kitDir });
    assert.ok(!land.warnings.some((x) => x.includes('直式')), land.warnings.join('\n'));
    const por = F.materializeFills({ plan: plan(), outDir: path.join(dir, 'b'), lib, kitDir, format: 'portrait' });
    assert.deepEqual(por.errors, []);
    assert.ok(por.warnings.some((x) => /x07.*slots\.items：直式最多 2 項，現在 3 項/.test(x)), por.warnings.join('\n'));
    assert.ok(fs.existsSync(path.join(dir, 'b', 'compositions', 'x-process-x07.html')), '只 ⚠，照樣寫檔');
    const byPlan = F.materializeFills({ plan: { format: 'portrait', ...plan() }, outDir: path.join(dir, 'c'), lib, kitDir });
    assert.ok(byPlan.warnings.some((x) => x.includes('直式最多 2 項')), 'format 不給就看 plan.format');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---------- 089：同一拍的幾項 ----------
// 在 Node 裡直接跑填好的模板 <script>：P 是記錄器（每個呼叫記 [方法, 選擇器, 時間]），P.at 照表回時間；不需要瀏覽器
function runFilled(html, at) {
  const script = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));   // 檔頭的說明裡也有「<script>」這個字，取最後一個
  const calls = [];
  const selOf = (s) => (Array.isArray(s) ? s.map((e) => e.sel).join(',') : s);
  const timeOf = (ref, off = 0) => { if (!(ref in at)) throw new Error(`測試沒給 ${ref} 的時間`); return at[ref] + off; };
  const P = { portrait: false, V2: { EASE: { in: 'in' } }, prev: () => 'fullscreen', at: timeOf, sfx: (name, ref, off) => timeOf(ref, off) };
  for (const n of ['in', 'out', 'drift', 'reveal', 'rise', 'maskUp', 'sideIn', 'sideOut', 'morph', 'push', 'count', 'bar', 'stroke', 'icon', 'check', 'type', 'swap', 'axis', 'focus', 'grow', 'wipe', 'pop', 'chars', 'spot', 'end']) {
    P[n] = (a, b, c) => { calls.push(n === 'spot' ? [n, selOf(b), c] : [n, selOf(a), b]); return P; };
  }
  const rows = (html.match(/class="xchk-row/g) || []).length;
  const document = { getElementById: () => ({}), querySelectorAll: (sel) => (/\.xchk-row$/.test(sel) ? Array.from({ length: rows }, () => ({ sel })) : [{ sel }]) };
  new Function('gsap', 'SceneMotion', 'document', 'window', script)({ timeline: () => ({}) }, () => P, document, { __timelines: {} });
  const r3 = (n) => Math.round(n * 1000) / 1000;
  const when = (fn, tail) => calls.filter(([f, s]) => f === fn && typeof s === 'string' && s.endsWith(tail)).map(([, , t]) => r3(t));
  return { calls, when };
}

test('089 x-checklist：同一拍的幾項（綁同一個詞）一項一項寫出來，後一項晚 0.5 秒；各綁各的照原本的時間；3 項、2 項一樣跑得起來', () => {
  const s = F.readFillSpec(CUSTOM, 'x-checklist');
  const fill = (ats) => {
    const r = F.fillTemplate({ spec: s, html: read('x-checklist'), id: 'x9', slots: { title: '四個檢核點', items: ats.map((at, i) => ({ text: `第 ${i + 1} 項`, at })) }, icons, kitDir });
    assert.deepEqual(r.errors, []);
    return r.html;
  };
  const AT = { '#26': 5, '#27': 8, '#28': 11, '#29': 14 };
  // 後三項同一拍（合併草稿的「拍距不足（併拍）」會把相鄰太近的兩項綁成同一個詞）：字、打勾、計數、焦點都一項一項來
  const m = runFilled(fill(['#26', '#27', '#27', '#27']), AT);
  for (const [tail, want] of [['-t1', [5]], ['-t2', [8]], ['-t3', [8.5]], ['-t4', [9]]]) assert.deepEqual(m.when('chars', tail), want, `第 ${tail} 項的字`);
  assert.deepEqual(m.calls.filter(([f]) => f === 'count').map(([, , t]) => t), [5.3, 8.3, 8.8, 9.3], '計數一格一格加，不同時');
  assert.deepEqual(m.calls.filter(([f, sel]) => f === 'spot' && sel).map(([, , t]) => t), [5, 8, 8.5, 9], '焦點一列一列換（同時換三次 P.spot 會丟錯，整段停在初始畫面）');
  const all = m.calls.find(([f, sel]) => f === 'spot' && sel == null)[2];
  assert.equal(all, 10.5, '收尾照舊＝最後一項綁的詞 +2.5 秒');
  assert.ok(all >= 9 + 0.9, '最後一項寫完（0.9 秒）才收');
  // 各綁各的：時間一秒都不動
  const d = runFilled(fill(['#26', '#27', '#28', '#29']), AT);
  assert.deepEqual(['-t1', '-t2', '-t3', '-t4'].map((t) => d.when('chars', t)[0]), [5, 8, 11, 14]);
  // 3 項、2 項：刪掉的那幾項不留下沒定義的變數
  assert.deepEqual(['-t1', '-t2', '-t3'].map((t) => runFilled(fill(['#26', '#27', '#27']), AT).when('chars', t)[0]), [5, 8, 8.5]);
  assert.deepEqual(['-t1', '-t2'].map((t) => runFilled(fill(['#26', '#26']), AT).when('chars', t)[0]), [5, 5.5]);
});
