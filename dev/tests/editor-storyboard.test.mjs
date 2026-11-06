// 分鏡表頁（017，停點 ③）：/storyboard 頁面、/api/storyboard 讀、/api/storyboard/save 只動改到的行、衝突與唯讀。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TEMPLATE, imp } from './helpers.mjs';

const { startEditor } = await imp('editor.mjs');
let root, work, file, editor;
const api = (route, body, headers = {}) => fetch(new URL(route, editor.url), body ? { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) } : undefined);
const state = async () => (await api('/api/storyboard')).json();
const save = async (body) => { const s = await state(); return api('/api/storyboard/save', { hash: s.hash, ...body }); };
const BEAT = '| 拍 | 講到（綁句） | 畫面上出現什麼 | 動態（設計系統語彙） | 焦點 | 音效拍點 |';
const MD = ['# 分鏡表：demo（草稿）', '', '講者框 speakerBox＝[1, 2, 3, 4]', '',
  '## 總覽', '', '| 段 | 章 | 句號 | 時間碼 | 版面 | 卡片類型 | 一句話摘要 |', '|---|---|---|---|---|---|---|', '| s01 | — | #1–2e | 0:00.00–0:04.94 | 疊加 | 14 講者介紹 | 自我介紹 |', '| x01 | — | #3–5e | 0:04.94–0:12.00 | 子母畫面 | x-scene | 儲存影片 |', '',
  '## s01（#1–2e，0:00.00–0:04.94）', '', '- 起點那句字幕：嗨！大家好', '- 版面：疊加（14 講者介紹）', '- 畫面文字：名字「林」，綁 `#1@嗨`', '', '![s01](storyboard-preview/s01.png)', '![s01-2](storyboard-preview/s01-2.png)', '', '截圖觀察：無', '',
  '## x01（#3–5e，0:04.94–0:12.00）', '', '- 版面：子母畫面', '', '#### 動畫分鏡 x01', '', BEAT, '|---|---|---|---|---|---|', '| 0 | 段起點 | 標題「存」 | 開場 | 標題 | — |', '| 1 | `#3@存` | 書籤 |  彈出  | 書籤 | — |', '',
  '## 需要我決定的事', '', '1. **結尾要不要配樂**：要的話寫 outro', '', '### 金句候選（勾了才上，每集最多 6 則）', '', '| 候選 | 句號 | 原句 | 卡上文字（≤ 14 字） | 情緒（正／負／中） | 要不要 ☐ |', '|---|---|---|---|---|---|', '| 1 | #8 | 省時間 | 省時 | 正 | ☐ |', ''].join('\n');
const sec = (s, key) => s.sections.find((x) => x.key === key);
const changed = (text, was = MD) => { const a = text.split('\n'), b = was.split('\n'); return a.filter((l, i) => l !== b[i]); };

before(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-editor-sb-'));
  fs.mkdirSync(path.join(root, 'shared'), { recursive: true });
  fs.symlinkSync(TEMPLATE, path.join(root, 'shared', 'template'), 'dir');
  const project = path.join(root, 'projects', 'sb');
  work = path.join(project, 'work');
  file = path.join(work, 'storyboard.md');
  fs.mkdirSync(path.join(work, 'storyboard-preview'), { recursive: true });
  editor = await startEditor({ flags: { project, template: TEMPLATE }, cwd: root, port: 0, writeState: false });
});
after(async () => { await editor?.close(); fs.rmSync(root, { recursive: true, force: true }); });

test('分鏡表：還沒有檔案時說還在寫；頁面路由；解析段、欄名、截圖網址與總覽', async () => {
  const none = await state();
  assert.equal(none.exists, false);
  assert.equal(none.project, 'sb');
  const page = await api('/storyboard');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<title>分鏡表<\/title>/);
  assert.equal((await api('/editor/storyboard.js')).status, 200);

  fs.writeFileSync(file, MD);
  fs.writeFileSync(path.join(work, 'storyboard-preview', 's01.png'), 'png');
  const s = await state();
  assert.equal(s.title, '分鏡表：demo（草稿）');
  assert.deepEqual(s.sections.filter((x) => x.id).map((x) => x.id), ['s01', 'x01']);
  assert.equal(s.overview.x01.summary, '儲存影片');
  assert.deepEqual(s.warnings, []);
  const seg = sec(s, 's01');
  const item = seg.blocks.find((b) => b.type === 'item' && b.label === '版面');
  assert.equal(item.value, '疊加（14 講者介紹）');
  const imgs = seg.blocks.filter((b) => b.type === 'image');
  assert.match(imgs[0].url, /^\/storyboard-preview\/s01\.png\?v=/);
  assert.equal(imgs[1].url, null, '沒有檔案的截圖不給網址');
  assert.equal((await api(imgs[0].url)).status, 200);
  assert.equal((await api('/storyboard-preview/nope.png')).status, 404);
  assert.equal((await api('/storyboard-preview/..%2Fstoryboard.md')).status, 404);
  assert.equal(sec(s, 'head').blocks[0].value, '講者框 speakerBox＝[1, 2, 3, 4]');
});

test('分鏡表：只有畫面文字、畫面上出現什麼、卡上文字、金句勾選能改；其他欄位、表頭、段標題都擋下', async () => {
  fs.writeFileSync(file, MD);
  const s = await state();
  const text = sec(s, 's01').blocks.find((b) => b.label === '畫面文字');
  assert.equal((await save({ op: 'text', line: text.line, text: '名字「王」，綁 `#1@嗨`\n', expect: text.value })).status, 200);
  assert.deepEqual(changed(fs.readFileSync(file, 'utf8')), ['- 畫面文字：名字「王」，綁 `#1@嗨`']);

  fs.writeFileSync(file, MD);
  const beat = sec(s, 'x01').blocks.find((b) => b.type === 'table');
  assert.equal((await save({ op: 'cell', line: beat.rows[1].line, col: 2, text: '書籤 | 雲' })).status, 200);
  assert.deepEqual(changed(fs.readFileSync(file, 'utf8')), ['| 1 | `#3@存` | 書籤 \\| 雲 |  彈出  | 書籤 | — |']);
  assert.equal(sec(await state(), 'x01').blocks.find((b) => b.type === 'table').rows[1].cells[2], '書籤 | 雲');

  fs.writeFileSync(file, MD);
  const decide = s.sections.find((x) => x.title === '需要我決定的事');
  const picks = decide.blocks.find((b) => b.type === 'table');
  assert.equal((await save({ op: 'cell', line: picks.rows[0].line, col: 5, text: '☑' })).status, 200);
  assert.deepEqual(changed(fs.readFileSync(file, 'utf8')), ['| 1 | #8 | 省時間 | 省時 | 正 | ☑ |']);

  fs.writeFileSync(file, MD);
  const layout = sec(s, 's01').blocks.find((b) => b.label === '版面');
  const bad = [
    [{ op: 'text', line: layout.line, text: '名字「王」' }, '版面'],
    [{ op: 'text', line: sec(s, 's01').start, text: '改' }, '段標題'],
    [{ op: 'cell', line: beat.line, col: 0, text: '改' }, '表頭'],
    [{ op: 'cell', line: beat.rows[0].line, col: 1, text: '改' }, '綁句欄'],
    [{ op: 'cell', line: beat.rows[0].line, col: 99, text: '改' }, '超出欄數'],
    [{ op: 'addRow', line: beat.rows[0].line }, '加列已拿掉'],
    [{ op: 'delRow', line: beat.rows[0].line }, '刪列已拿掉'],
    [{ op: 'raw', key: 's01', text: sec(s, 's01').raw }, '原始 Markdown 已拿掉'],
    [{ op: 'field', key: 's01', label: '版面', value: '全幕' }, '不能用 field 改版面'],
    [{ op: 'field', key: decide.key, label: '想換成', value: '07 重點字卡' }, '決定區不能選情境'],
    [{ op: 'field', key: sec(s, 'head') ? 'head' : 's01', label: '補充說明', value: '想改' }, '開頭不能寫補充說明'],
    [{ op: 'nope' }, '看不懂'],
  ];
  for (const [op, why] of bad) assert.equal((await save(op)).status, 400, why);
  assert.equal(fs.readFileSync(file, 'utf8'), MD);
});

test('分鏡表：想換成、音效、補充說明新增在第一個小標題之前，清空就拿掉，檔案回到原樣', async () => {
  fs.writeFileSync(file, MD);
  // s01 最後是一行「截圖觀察」段落：空一行再加清單
  await save({ op: 'field', key: 's01', label: '補充說明', value: '不要字卡\n想要動畫' });
  let t = fs.readFileSync(file, 'utf8');
  assert.match(t, /截圖觀察：無\n\n- 補充說明：不要字卡 想要動畫\n\n## x01/);
  assert.equal(sec(await state(), 's01').blocks.find((b) => b.label === '補充說明').value, '不要字卡 想要動畫');
  await save({ op: 'field', key: 's01', label: '補充說明', value: '' });
  assert.equal(fs.readFileSync(file, 'utf8'), MD, '清空回到原樣');

  // x01 的欄位在 #### 動畫分鏡 之前
  await save({ op: 'field', key: 'x01', label: '想換成', value: 'x-process 流程逐步亮起', expect: '' });
  t = fs.readFileSync(file, 'utf8');
  assert.match(t, /- 版面：子母畫面\n- 想換成：x-process 流程逐步亮起\n\n#### 動畫分鏡 x01/);
  await save({ op: 'field', key: 'x01', label: '想換成', value: '07 重點字卡', expect: 'x-process 流程逐步亮起' });
  assert.match(fs.readFileSync(file, 'utf8'), /- 想換成：07 重點字卡\n/);
  assert.equal((await save({ op: 'field', key: 'x01', label: '想換成', value: '改', expect: '別的內容' })).status, 409);
  await save({ op: 'field', key: 'x01', label: '想換成', value: '' });
  assert.equal(fs.readFileSync(file, 'utf8'), MD);

  // 音效：沒有這行時選預設不寫；選了才寫；選回無照寫
  await save({ op: 'field', key: 'x01', label: '音效', value: '預設' });
  assert.equal(fs.readFileSync(file, 'utf8'), MD);
  await save({ op: 'field', key: 'x01', label: '音效', value: 'shine' });
  assert.match(fs.readFileSync(file, 'utf8'), /- 音效：shine\n/);
  fs.writeFileSync(file, MD);

  // 需要我決定的事：回答寫在金句候選的小標題之前，表格讀得到
  const key = (await state()).sections.find((x) => x.title === '需要我決定的事').key;
  await save({ op: 'field', key, label: '補充說明', value: '要配樂' });
  assert.match(fs.readFileSync(file, 'utf8'), /1\. \*\*結尾要不要配樂\*\*：要的話寫 outro\n- 補充說明：要配樂\n\n### 金句候選/);
  assert.equal((await state()).warnings.length, 0);
});

test('分鏡表：下拉選單的選項來自工作區現有的情境與音效', async () => {
  fs.writeFileSync(file, MD);
  const { options, previewBase } = await state();
  assert.deepEqual(options.scenes.map((g) => g.name), ['疊加', '半畫面', '子母畫面', '全幕', '情境動畫']);
  const all = options.scenes.flatMap((g) => g.items);
  const key = all.find((i) => i.id === '07');
  assert.equal(key.value, '07 重點字卡');
  assert.ok(key.when);
  assert.ok(options.scenes.find((g) => g.name === '半畫面').items.some((i) => i.id === '03'));
  const proc = all.find((i) => i.id === 'x-process');
  assert.equal(proc.value, 'x-process 流程逐步亮起');
  assert.ok(!all.some((i) => i.id.includes('-example-')), '範例檔不是選項');
  for (const i of all) assert.ok(fs.existsSync(path.join(TEMPLATE, 'preview', i.preview)), i.preview);
  assert.equal(previewBase, '/gallery/preview/');
  assert.equal((await api(`${previewBase}${key.preview}`)).status, 200);
  assert.deepEqual(options.sfx.slice(0, 2).map((o) => o.value), ['預設', '無']);
  assert.ok(options.sfx.some((o) => o.value === 'ding'));
  assert.ok(!options.sfx.some((o) => o.value.startsWith('bgm')), '配樂不是音效選項');
  // 直式專案：03、05 不能用
  fs.mkdirSync(path.join(work, 'hyperframes'), { recursive: true });
  fs.writeFileSync(path.join(work, 'hyperframes', 'plan.json'), JSON.stringify({ version: 1, format: 'portrait' }));
  const portrait = (await state()).options.scenes.flatMap((g) => g.items).map((i) => i.id);
  assert.ok(!portrait.includes('03') && !portrait.includes('05'));
  fs.rmSync(path.join(work, 'hyperframes'), { recursive: true, force: true });
});

test('分鏡表：檔案被改過擋下並回新內容；別的網站送來的擋下；CRLF 與 BOM 保留；停點 ③ 通過後只能看，重開待回覆又能改', async () => {
  fs.writeFileSync(file, MD);
  const s = await state();
  const line = sec(s, 's01').blocks.find((b) => b.label === '畫面文字').line;
  fs.appendFileSync(file, '\n- AI 剛改的');
  const stale = await api('/api/storyboard/save', { hash: s.hash, op: 'text', line, text: '名字「王」' });
  assert.equal(stale.status, 409);
  const body = await stale.json();
  assert.match(body.message, /work\/storyboard\.md 剛被改過/);
  assert.notEqual(body.state.hash, s.hash);
  assert.ok(!fs.readFileSync(file, 'utf8').includes('名字「王」'));
  const blocked = await api('/api/storyboard/save', { hash: body.state.hash, op: 'text', line, text: '名字「王」' }, { Origin: 'http://evil.example' });
  assert.equal(blocked.status, 403);

  // 頁面的行號錯開時（hash 是新的、那一行內容不是頁面看到的）不能寫：改格子、改欄位、補充說明都一樣
  fs.writeFileSync(file, MD);
  const before = fs.readFileSync(file, 'utf8');
  const beat = sec(s, 'x01').blocks.find((b) => b.type === 'table');
  for (const op of [{ op: 'text', line, text: '名字「王」', expect: '別的內容' }, { op: 'cell', line: beat.rows[0].line, col: 2, text: '改', expect: '別的內容' }, { op: 'field', key: 's01', label: '補充說明', value: '想改', expect: '別的內容' }]) {
    const moved = await save(op);
    assert.equal(moved.status, 409, op.op);
    assert.ok((await moved.json()).state.hash, '回新內容');
    assert.equal(fs.readFileSync(file, 'utf8'), before);
  }
  assert.equal((await save({ op: 'text', line, text: '名字「王」', expect: '名字「林」，綁 `#1@嗨`' })).status, 200);

  fs.writeFileSync(file, `﻿${MD.replace(/\n/g, '\r\n')}`);
  assert.equal((await save({ op: 'text', line, text: '名字「王」' })).status, 200);
  const crlf = fs.readFileSync(file, 'utf8');
  assert.ok(crlf.startsWith('﻿'));
  assert.equal(crlf.replace(/\r\n/g, '').length, crlf.replace(/\r?\n/g, '').length);
  assert.ok(!/[^\r]\n/.test(crlf), '換行維持 CRLF');
  assert.ok(crlf.includes('- 畫面文字：名字「王」\r\n'));

  fs.writeFileSync(file, MD);
  const log = (rows) => fs.writeFileSync(path.join(work, '製作進度.md'), ['## 停點紀錄', '', '| 時間 | 停點 | 狀態 | 使用者原話 | 寫回哪裡 |', '|---|---|---|---|---|', ...rows, ''].join('\n'));
  log(['| 2026-11-06 10:00 | ③ 分鏡表 | 待回覆 | — | — |']);
  assert.equal((await state()).readOnly, false);
  log(['| 2026-11-06 10:00 | ③ 分鏡表 | 待回覆 | — | — |', '| 2026-11-06 10:05 | ③ 分鏡表 | 通過 | 「可以」 | plan.json |']);
  assert.equal((await state()).readOnly, true);
  const locked = await save({ op: 'text', line, text: '名字「王」' });
  assert.equal(locked.status, 409);
  assert.match((await locked.json()).message, /已經確認/);
  assert.equal(fs.readFileSync(file, 'utf8'), MD);
  log(['| 2026-11-06 10:05 | ③ 分鏡表 | 通過 | 「可以」 | plan.json |', '| 2026-11-06 11:00 | ③ 分鏡表（s12 v2） | 待回覆 | — | — |']);
  assert.equal((await state()).readOnly, true, '改版的 ③ 不解鎖整份');
  log(['| 2026-11-06 10:05 | ③ 分鏡表 | 通過 | 「可以」 | plan.json |', '| 2026-11-06 12:00 | ③ 分鏡表 | 修改後重停 | 「重來」 | storyboard.md |']);
  assert.equal((await state()).readOnly, false);
  fs.rmSync(path.join(work, '製作進度.md'));
});
