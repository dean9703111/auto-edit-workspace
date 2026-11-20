// 074 剪輯台改字幕後，內容設計動畫（work/designs/<段>.md、x-design-*.html）的句號：
// ① 只改字把詞搬到隔壁句，"#N@詞" 跟著詞走（plan.json 與動畫檔都是）；② 復原／重做時，存檔順便改過的動畫檔、鏡位腳本跟著換回去
import { test as nodeTest, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { TEMPLATE, imp, missingTools, skipAll } from './helpers.mjs';

const test = nodeTest;
const S = await imp('editor/subtitles.mjs');
const RM = await imp('lib/beat-remap.mjs');

// 六句：第 2、3 句是「…分鏡怎麼排要你點頭」「它才往下做」這種斷錯的地方
const TEXTS = ['第一句開場', '所以哪幾句要剪分鏡怎麼排要你點頭', '它才往下做', '甚至可以把我去背放進任何情境裡', '同一份素材', '最後一句收尾'];
const cuesOf = (texts = TEXTS) => texts.map((text, i) => ({ n: i + 1, start: i * 3, end: i * 3 + 2.8, text }));
const srtOf = (texts = TEXTS) => texts.map((t, i) => `${i + 1}\n00:00:${String(i * 3).padStart(2, '0')},000 --> 00:00:${String(i * 3 + 2).padStart(2, '0')},800\n${t}\n`).join('\n');
const HTML = (refs) => `<!doctype html>\n<!-- 範例：P.at('#99@詞') 不動 -->\n<script>\n  // 註解裡的 P.at('#2@要你點頭') 不動\n${refs.map((r) => `  P.at('${r}');`).join('\n')}\n  P.sfx('ding', '${refs[0]}');\n</script>\n`;
const MOVE = [{ op: 'set', n: 2, text: '所以哪幾句要剪、分鏡怎麼排' }, { op: 'set', n: 3, text: '都要你點頭它才往下做' }];

test('改字把詞搬到隔壁句：replay（存檔）和 opsMapper（動畫檔）的 #N@詞 都跟過去；兩邊都有、都沒有就不動', () => {
  const plan = { scenes: [{ id: 's1', type: 'scene', from: '#2', to: '#3e', slots: { items: [{ text: '哪幾句', at: '#2@哪幾句' }, { text: '點頭', at: '#2@要你點頭' }] } }] };
  const r = S.replay(cuesOf(), plan, MOVE);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.plan.scenes[0].slots.items.map((x) => x.at), ['#2@哪幾句', '#3@要你點頭']);
  assert.deepEqual([r.plan.scenes[0].from, r.plan.scenes[0].to], ['#2', '#3e'], '沒有詞的句號不動');
  const mp = RM.opsMapper(cuesOf(), MOVE);
  assert.equal(mp.structural, false);
  assert.equal(mp.movesWords, true);
  assert.equal(RM.remapCustomRefs(HTML(['#2@要你點頭', '#2@哪幾句']), mp, 's1'), HTML(['#3@要你點頭', '#2@哪幾句']).replace("P.sfx('ding', '#2@要你點頭')", "P.sfx('ding', '#3@要你點頭')"));
  // 先加再刪（中間兩句都有）、先刪再加（中間兩句都沒有）：做完都一樣跟過去
  for (const ops of [[MOVE[1], MOVE[0]], MOVE]) assert.equal(S.replay(cuesOf(), plan, ops).plan.scenes[0].slots.items[1].at, '#3@要你點頭');
  // 前後兩句都有這個詞（先加到兩邊，最後才從第 2 句拿掉）：不猜
  const both = S.replay(cuesOf(), plan, [{ op: 'set', n: 1, text: '要你點頭開場' }, { op: 'set', n: 3, text: '要你點頭它才往下做' }, { op: 'set', n: 2, text: '所以哪幾句要剪' }]);
  assert.equal(both.plan.scenes[0].slots.items[1].at, '#2@要你點頭');
  // 只改時間：不動
  assert.equal(RM.opsMapper(cuesOf(), [{ op: 'set', n: 2, end: 2.5 }]).movesWords, false);
});

test('分割再合併回來（同一次存檔）：動畫檔的句號回到原本的；分割、合併各自照詞走', () => {
  const html = HTML(['#4@放進', '#5@同一份']);
  const split = { op: 'split', n: 2, at: 4.5, pos: 12 };   // 「所以哪幾句要剪分鏡怎麼排」｜「要你點頭」
  const mp1 = RM.opsMapper(cuesOf(), [split]);
  assert.equal(RM.remapCustomRefs(html, mp1, 'x'), HTML(['#5@放進', '#6@同一份']));
  const mp2 = RM.opsMapper(cuesOf(), [split, { op: 'merge', n: 2 }]);
  assert.equal(RM.remapCustomRefs(html, mp2, 'x'), html);
  // 分割的那句：詞在後半就跟到後半
  assert.equal(RM.remapCustomRefs(HTML(['#2@要你點頭']), mp1, 'x'), HTML(['#3@要你點頭']));
});

// ---------- 剪輯台服務：存檔、復原、重做 ----------

const noTools = await missingTools('ffmpeg');
const srvTest = skipAll(nodeTest, noTools);
let root, work, editor;
const planFile = () => path.join(work, 'hyperframes', 'plan.json');
const srtFile = () => path.join(work, 'rough.srt');
const animFile = () => path.join(work, 'hyperframes', 'compositions', 'x-design-x0101.html');
const scriptFile = () => path.join(work, 'designs', 'x0101.md');
const BEAT = (refs) => ['概念：測試', '', '#### 動畫分鏡 x0101', '', '| 拍 | 講到（綁句） | 畫面上出現什麼 | 動態（設計系統語彙） | 焦點 | 音效拍點 |', '|---|---|---|---|---|---|',
  ...refs.map((r, i) => `| ${i + 1} | \`${r}\` | 第 ${i + 1} 拍 | 彈出 | 主卡 | — |`), ''].join('\n');
const read = (f) => fs.readFileSync(f, 'utf8');
const post = async (p, body) => { const r = await fetch(new URL(p, editor.url), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, data: await r.json() }; };
const state = async () => { const s = await (await fetch(new URL('/api/state', editor.url))).json(); return { hash: s.plan.hash, srtHash: s.srt.hash }; };
const refsIn = (f) => [...read(f).matchAll(/^\s*P\.at\('([^']+)'\)/gm)].map((m) => m[1]);   // 只算程式碼那幾行（註解裡的範例不算）

before(async () => {
  if (noTools) return;
  const { startEditor } = await imp('editor.mjs');
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-realign-'));
  const project = path.join(root, 'projects', 'demo');
  work = path.join(project, 'work');
  fs.mkdirSync(path.join(work, 'hyperframes', 'compositions'), { recursive: true });
  fs.mkdirSync(path.join(work, 'designs'), { recursive: true });
  fs.mkdirSync(path.join(root, 'shared'));
  fs.symlinkSync(TEMPLATE, path.join(root, 'shared', 'template'), 'dir');
  fs.writeFileSync(planFile(), JSON.stringify({ version: 1, scenes: [{ id: 'x0101', type: 'custom', design: true, from: '#1', to: '#6e' }] }, null, 2) + '\n');
  fs.writeFileSync(srtFile(), srtOf());
  fs.writeFileSync(animFile(), HTML(['#2@要你點頭', '#4@放進', '#5@同一份']));
  fs.writeFileSync(scriptFile(), BEAT(['#2@要你點頭', '#4@放進', '#5@同一份']));
  const media = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=navy:size=320x180:rate=30', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', '20', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(work, 'rough.mp4')], { encoding: 'utf8' });
  assert.equal(media.status, 0, String(media.stderr));
  editor = await startEditor({ cwd: root, flags: { project, template: path.join(root, 'shared', 'template') }, port: 0, writeState: false });
});
after(async () => { if (noTools) return; await editor?.close(); fs.rmSync(root, { recursive: true, force: true }); });

srvTest('分割 → 復原 → 再分割：動畫檔、鏡位腳本的句號只 +1（以前復原沒換回去，再分割變 +2）；重做也跟著換', async () => {
  const b0 = await state();
  const ops = [{ op: 'split', n: 3, at: 7.5, pos: 2 }];   // 「它才」｜「往下做」：第 3 句之後的 +1
  let r = await post('/api/save', { quick: true, base: b0, srt: { ops } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const b1 = { hash: r.data.plan.hash, srtHash: r.data.srt.hash };
  assert.deepEqual(refsIn(animFile()), ['#2@要你點頭', '#5@放進', '#6@同一份']);
  assert.match(read(scriptFile()), /`#5@放進`/);
  // 復原：plan.json、字幕、動畫檔、鏡位腳本一起回去
  r = await post('/api/restore', { base: b1, to: b0 });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(r.data.scripts.restored.sort(), ['work/designs/x0101.md', 'work/hyperframes/compositions/x-design-x0101.html']);
  assert.deepEqual(refsIn(animFile()), ['#2@要你點頭', '#4@放進', '#5@同一份']);
  assert.match(read(scriptFile()), /`#4@放進`/);
  // 重做：又回到分割後
  r = await post('/api/restore', { base: b0, to: b1 });
  assert.equal(r.status, 200);
  assert.deepEqual(refsIn(animFile()), ['#2@要你點頭', '#5@放進', '#6@同一份']);
  // 再復原、再分割一次：只 +1
  r = await post('/api/restore', { base: b1, to: b0 });
  assert.equal(r.status, 200);
  r = await post('/api/save', { quick: true, base: b0, srt: { ops } });
  assert.equal(r.status, 200);
  assert.deepEqual(refsIn(animFile()), ['#2@要你點頭', '#5@放進', '#6@同一份']);
  const b2 = { hash: r.data.plan.hash, srtHash: r.data.srt.hash };
  // 存檔之後 AI 又改了動畫檔：復原不蓋掉，回報出來
  fs.writeFileSync(animFile(), read(animFile()).replace("P.at('#6@同一份')", "P.at('#6@同一份'); // AI 改的"));
  r = await post('/api/restore', { base: b2, to: b0 });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.scripts.skipped, ['work/hyperframes/compositions/x-design-x0101.html']);
  assert.match(read(animFile()), /AI 改的/);
  assert.match(read(scriptFile()), /`#4@放進`/, '沒被改過的鏡位腳本照樣換回去');
});

srvTest('只改字把「要你點頭」搬到下一句：存檔後 plan.json 不動，動畫檔、鏡位腳本跟著詞換句；復原換回去', async () => {
  fs.writeFileSync(srtFile(), srtOf());
  fs.writeFileSync(animFile(), HTML(['#2@要你點頭', '#4@放進', '#5@同一份']));
  fs.writeFileSync(scriptFile(), BEAT(['#2@要你點頭', '#4@放進', '#5@同一份']));
  const b0 = await state();
  let r = await post('/api/save', { quick: true, base: b0, srt: { ops: MOVE } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(refsIn(animFile()), ['#3@要你點頭', '#4@放進', '#5@同一份']);
  assert.match(read(scriptFile()), /`#3@要你點頭`/);
  r = await post('/api/restore', { base: { hash: r.data.plan.hash, srtHash: r.data.srt.hash }, to: b0 });
  assert.equal(r.status, 200);
  assert.deepEqual(refsIn(animFile()), ['#2@要你點頭', '#4@放進', '#5@同一份']);
});
