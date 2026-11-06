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

test('分鏡表：改欄位只動那一行、欄名保留；改格子其他格原樣、| 會跳脫；☐ 可勾；表頭與標題不能用這條路改', async () => {
  fs.writeFileSync(file, MD);
  const s = await state();
  const item = sec(s, 's01').blocks.find((b) => b.label === '版面');
  assert.equal((await save({ op: 'text', line: item.line, text: '全幕\n（改了）' })).status, 200);
  assert.deepEqual(changed(fs.readFileSync(file, 'utf8')), ['- 版面：全幕 （改了）']);

  fs.writeFileSync(file, MD);
  const beat = sec(s, 'x01').blocks.find((b) => b.type === 'table');
  assert.equal((await save({ op: 'cell', line: beat.rows[1].line, col: 2, text: '書籤 | 雲' })).status, 200);
  assert.deepEqual(changed(fs.readFileSync(file, 'utf8')), ['| 1 | `#3@存` | 書籤 \\| 雲 |  彈出  | 書籤 | — |']);
  assert.equal(sec(await state(), 'x01').blocks.find((b) => b.type === 'table').rows[1].cells[2], '書籤 | 雲');

  fs.writeFileSync(file, MD);
  const picks = sec(s, sec(s, 's01') && s.sections.find((x) => x.title === '需要我決定的事').key).blocks.find((b) => b.type === 'table');
  assert.equal((await save({ op: 'cell', line: picks.rows[0].line, col: 5, text: '☑' })).status, 200);
  assert.deepEqual(changed(fs.readFileSync(file, 'utf8')), ['| 1 | #8 | 省時間 | 省時 | 正 | ☑ |']);

  fs.writeFileSync(file, MD);
  assert.equal((await save({ op: 'cell', line: beat.line, col: 0, text: '改' })).status, 400, '表頭');
  assert.equal((await save({ op: 'text', line: sec(s, 's01').start, text: '改' })).status, 400, '段標題');
  assert.equal((await save({ op: 'cell', line: beat.rows[0].line, col: 99, text: '改' })).status, 400, '超出欄數');
  assert.equal((await save({ op: 'nope' })).status, 400);
  assert.equal(fs.readFileSync(file, 'utf8'), MD);
});

test('分鏡表：加列、刪列；原始 Markdown 換整段且第一行標題要保留；改壞動畫分鏡表頭會警告', async () => {
  fs.writeFileSync(file, MD);
  const s = await state();
  const beat = sec(s, 'x01').blocks.find((b) => b.type === 'table');
  const added = await (await save({ op: 'addRow', line: beat.rows[0].line })).json();
  const rows = sec(added, 'x01').blocks.find((b) => b.type === 'table').rows;
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[1].cells, ['', '', '', '', '', '']);
  assert.equal(sec(await (await save({ op: 'cell', line: rows[1].line, col: 2, text: '新的拍' })).json(), 'x01').blocks.find((b) => b.type === 'table').rows[1].cells[2], '新的拍');
  const gone = await (await save({ op: 'delRow', line: rows[1].line })).json();
  assert.equal(sec(gone, 'x01').blocks.find((b) => b.type === 'table').rows.length, 2);
  assert.equal(fs.readFileSync(file, 'utf8'), MD, '加了又刪回到原樣');

  const raw = sec(s, 's01').raw;
  assert.equal((await save({ op: 'raw', key: 's01', text: raw.replace('## s01', '## s99') })).status, 400);
  assert.equal((await save({ op: 'raw', key: 's01', text: '- 只有內容' })).status, 400);
  const ok = await save({ op: 'raw', key: 's01', text: raw.replace('截圖觀察：無', '截圖觀察：無\n\n- 理由：手動加的') });
  assert.equal(ok.status, 200);
  const text = fs.readFileSync(file, 'utf8');
  assert.match(text, /截圖觀察：無\n\n- 理由：手動加的\n\n## x01/);
  assert.match(text, /## 總覽/);

  fs.writeFileSync(file, MD);
  const bad = await (await save({ op: 'raw', key: 'x01', text: sec(s, 'x01').raw.replace(BEAT, '| 拍 | 綁句 | 畫面 | 動態 | 焦點 | 音效 |') })).json();
  assert.match(bad.warnings[0], /動畫分鏡 x01 的表頭被改到了/);
});

test('分鏡表：檔案被改過擋下並回新內容；別的網站送來的擋下；CRLF 與 BOM 保留；停點 ③ 通過後只能看，重開待回覆又能改', async () => {
  fs.writeFileSync(file, MD);
  const s = await state();
  const line = sec(s, 's01').blocks.find((b) => b.label === '版面').line;
  fs.appendFileSync(file, '\n- AI 剛改的');
  const stale = await api('/api/storyboard/save', { hash: s.hash, op: 'text', line, text: '全幕' });
  assert.equal(stale.status, 409);
  const body = await stale.json();
  assert.match(body.message, /work\/storyboard\.md 剛被改過/);
  assert.notEqual(body.state.hash, s.hash);
  assert.ok(!fs.readFileSync(file, 'utf8').includes('全幕'));
  const blocked = await api('/api/storyboard/save', { hash: body.state.hash, op: 'text', line, text: '全幕' }, { Origin: 'http://evil.example' });
  assert.equal(blocked.status, 403);

  // 頁面的行號錯開時（hash 是新的、那一行內容不是頁面看到的）不能寫：改格子、改欄位、刪列都一樣
  fs.writeFileSync(file, MD);
  const before = fs.readFileSync(file, 'utf8');
  const beat = sec(s, 'x01').blocks.find((b) => b.type === 'table');
  for (const op of [{ op: 'text', line, text: '全幕', expect: '別的內容' }, { op: 'cell', line: beat.rows[0].line, col: 2, text: '改', expect: '別的內容' }, { op: 'delRow', line: beat.rows[0].line, expect: '別的內容' }]) {
    const moved = await save(op);
    assert.equal(moved.status, 409, op.op);
    assert.ok((await moved.json()).state.hash, '回新內容');
    assert.equal(fs.readFileSync(file, 'utf8'), before);
  }
  assert.equal((await save({ op: 'text', line, text: '全幕', expect: '疊加（14 講者介紹）' })).status, 200);

  fs.writeFileSync(file, `﻿${MD.replace(/\n/g, '\r\n')}`);
  assert.equal((await save({ op: 'text', line, text: '全幕' })).status, 200);
  const crlf = fs.readFileSync(file, 'utf8');
  assert.ok(crlf.startsWith('﻿'));
  assert.equal(crlf.replace(/\r\n/g, '').length, crlf.replace(/\r?\n/g, '').length);
  assert.ok(!/[^\r]\n/.test(crlf), '換行維持 CRLF');
  assert.ok(crlf.includes('- 版面：全幕\r\n'));

  fs.writeFileSync(file, MD);
  const log = (rows) => fs.writeFileSync(path.join(work, '製作進度.md'), ['## 停點紀錄', '', '| 時間 | 停點 | 狀態 | 使用者原話 | 寫回哪裡 |', '|---|---|---|---|---|', ...rows, ''].join('\n'));
  log(['| 2026-11-06 10:00 | ③ 分鏡表 | 待回覆 | — | — |']);
  assert.equal((await state()).readOnly, false);
  log(['| 2026-11-06 10:00 | ③ 分鏡表 | 待回覆 | — | — |', '| 2026-11-06 10:05 | ③ 分鏡表 | 通過 | 「可以」 | plan.json |']);
  assert.equal((await state()).readOnly, true);
  const locked = await save({ op: 'text', line, text: '全幕' });
  assert.equal(locked.status, 409);
  assert.match((await locked.json()).message, /已經確認/);
  assert.equal(fs.readFileSync(file, 'utf8'), MD);
  log(['| 2026-11-06 10:05 | ③ 分鏡表 | 通過 | 「可以」 | plan.json |', '| 2026-11-06 11:00 | ③ 分鏡表（s12 v2） | 待回覆 | — | — |']);
  assert.equal((await state()).readOnly, true, '改版的 ③ 不解鎖整份');
  log(['| 2026-11-06 10:05 | ③ 分鏡表 | 通過 | 「可以」 | plan.json |', '| 2026-11-06 12:00 | ③ 分鏡表 | 修改後重停 | 「重來」 | storyboard.md |']);
  assert.equal((await state()).readOnly, false);
  fs.rmSync(path.join(work, '製作進度.md'));
});
