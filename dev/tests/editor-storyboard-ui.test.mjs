// 分鏡表頁（瀏覽器）：文字不會無聲消失：打字自動存、頁首固定、離開提醒、連不到時留字並補存、檔案被改過時留字。講者還沒設定時頂端可以直接填。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { startEditor } from '../../shared/template/tools/editor.mjs';
import { findChrome } from '../../shared/template/tools/lib/audit-browser.mjs';
import { TEMPLATE } from './helpers.mjs';

const filler = (id) => [`## ${id}（#1–2e，0:00.00–0:04.94）`, '', '- 起點那句字幕：嗨', '- 版面：疊加（07 重點字卡）', `- 畫面文字：標題「${id} 的字」，綁 \`#1@嗨\``, '- 理由：這是一段很長的內容，用來把頁面撐高', '', ...Array.from({ length: 30 }, (_, i) => `- 備註${i}：撐高`), ''];
const MD = ['# 分鏡表：demo（草稿）', '', ...filler('s01'), ...filler('s02'), ...filler('s03'), '## 需要我決定的事', '', '1. 結尾要不要配樂', ''].join('\n');

let root, work, file, editor, browser, page;
const dialogs = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const open = async () => {
  fs.writeFileSync(file, MD);
  await page.goto(new URL('/storyboard', editor.url).href, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#sec-s03 textarea');
};
const inView = (sel) => page.$eval(sel, (el) => { const r = el.getBoundingClientRect(); return !el.hidden && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight; });
const untilFile = async (re, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { if (re.test(fs.readFileSync(file, 'utf8'))) return true; await sleep(100); } return false; };

before(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-sb-ui-'));
  const project = path.join(root, 'projects', 'demo');
  work = path.join(project, 'work');
  file = path.join(work, 'storyboard.md');
  fs.mkdirSync(path.join(work, 'hyperframes'), { recursive: true });
  fs.mkdirSync(path.join(root, 'shared'));
  fs.symlinkSync(TEMPLATE, path.join(root, 'shared', 'template'), 'dir');
  fs.writeFileSync(path.join(work, 'hyperframes', 'plan.json'), JSON.stringify({ version: 1, scenes: [{ id: 's01', scene: 'speaker', from: '#1', to: '#2e' }] }));
  fs.writeFileSync(file, MD);
  editor = await startEditor({ cwd: root, flags: { project, template: path.join(root, 'shared', 'template') }, port: 0, writeState: false });
  browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--no-first-run'] });
  page = await browser.newPage();
  page.on('dialog', async (d) => { dialogs.push(d.type()); await d.accept(); });
  await page.setViewport({ width: 1280, height: 720 });
});
after(async () => { await browser?.close(); await editor?.close(); fs.rmSync(root, { recursive: true, force: true }); });

test('分鏡表：頁首捲到哪都在；打字停手就存，不用離開欄位', async () => {
  await open();
  await page.evaluate(() => document.getElementById('sec-s03').scrollIntoView());
  assert.equal(await inView('#saveState'), true, '儲存狀態要一直看得到');
  await page.click('#sec-s03 textarea');
  await page.keyboard.type('想看兩個畫面對比');
  assert.equal(await untilFile(/- 補充說明：想看兩個畫面對比/), true);
  assert.equal(await page.$eval('#sec-s03 textarea', (t) => document.activeElement === t), true, '游標還在欄位裡');
  // 接著打，存第二次（新增欄位後行號變了，也不能丟字）
  await page.keyboard.type('，手機在左');
  assert.equal(await untilFile(/- 補充說明：想看兩個畫面對比，手機在左/), true);
  // 別段的畫面文字：行號已經過期，一樣要存到對的那一行
  await page.click('#sec-s02 .sb-piece');
  await page.keyboard.press('End');
  await page.keyboard.type('改');
  await page.keyboard.press('Enter');
  assert.equal(await untilFile(/畫面文字：標題「s02 的字改」/), true);
  assert.equal(await page.$eval('#notice', (n) => n.hidden), true);
});

test('分鏡表：離開頁面前還有沒存的字會提醒', async () => {
  await open();
  await page.click('#sec-s01 textarea');
  await page.keyboard.type('還沒存到');
  dialogs.length = 0;
  await page.reload({ waitUntil: 'domcontentloaded' });
  assert.deepEqual(dialogs, ['beforeunload']);
  await page.waitForSelector('#sec-s03 textarea');
});

test('分鏡表：連不到服務時字留在欄位、右下角看得到，連上後自動補存', async () => {
  await open();
  await page.evaluate(() => document.getElementById('sec-s03').scrollIntoView());
  await page.setOfflineMode(true);
  await page.click('#sec-s03 textarea');
  await page.keyboard.type('離線寫的要求');
  await page.evaluate(() => document.activeElement.blur());
  await page.waitForFunction(() => !document.querySelector('#notice').hidden);
  assert.equal(await inView('#notice'), true, '提醒要在視窗裡');
  assert.match(await page.$eval('#notice', (n) => n.textContent), /1 處還沒存到.*連上後會自動補存/);
  assert.equal(await page.$eval('#sec-s03 textarea', (t) => t.classList.contains('unsaved') && t.value), '離線寫的要求');
  assert.equal(await page.$eval('#saveState', (n) => n.dataset.state), 'error');
  assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /離線寫的要求/);
  await page.setOfflineMode(false);
  assert.equal(await untilFile(/- 補充說明：離線寫的要求/, 12000), true, '連上後補存');
  await page.waitForFunction(() => document.querySelector('#notice').hidden && document.querySelector('#saveState').dataset.state === 'saved');
  assert.equal(await page.$eval('#sec-s03 textarea', (t) => t.classList.contains('unsaved')), false);
});

test('分鏡表：檔案被 AI 改過：別處改的自動合併；同一格也被改了，字留著，看過再存', async () => {
  await open();
  await page.evaluate(() => document.getElementById('sec-s02').scrollIntoView());
  // 別處被改：自動照新檔案再送一次
  await page.click('#sec-s02 textarea');
  await page.keyboard.type('要保留');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('1. 結尾要不要配樂', '1. 結尾要不要配樂（AI 改的）'));
  await page.evaluate(() => document.activeElement.blur());
  assert.equal(await untilFile(/- 補充說明：要保留/), true);
  assert.match(fs.readFileSync(file, 'utf8'), /AI 改的/);
  await page.waitForFunction(() => document.querySelector('#sec-s02 textarea')?.value === '要保留');

  // 同一格被改：不能蓋掉，也不能把使用者的字丟掉
  await page.waitForFunction(() => !document.querySelector('#sec-s03 .sb-piece').matches(':focus'));
  await page.click('#sec-s03 .sb-piece');
  await page.keyboard.press('End');
  await page.keyboard.type('我的');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('標題「s03 的字」', '標題「AI 的字」'));
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !document.querySelector('#notice').hidden);
  assert.equal(await inView('#notice'), true);
  assert.match(await page.$eval('#notice', (n) => n.textContent), /剛被 AI 改過/);
  assert.match(fs.readFileSync(file, 'utf8'), /標題「AI 的字」/, '檔案沒被蓋掉');
  await page.waitForFunction(() => /s03 的字我的/.test(document.querySelector('#sec-s03 .sb-piece').textContent));
  await page.click('[data-notice-retry]');
  assert.equal(await untilFile(/標題「s03 的字我的」/), true);
  await page.waitForFunction(() => document.querySelector('#notice').hidden);
});

test('分鏡表：講者還沒設定時頂端可以直接填，存好就收起來', async () => {
  await open();
  await page.waitForSelector('[data-speaker-form]');
  assert.match(await page.$eval('#speakerBox', (n) => n.textContent), /示範人物「林大寶」/);
  await page.type('[data-speaker-form] input[name="name"]', '一二三四五六');
  await page.type('[data-speaker-form] input[name="titles"]', '講師');
  await page.click('[data-speaker-form] button[type="submit"]');
  await page.waitForFunction(() => /最多 5 字/.test(document.querySelector('.sb-speaker-err')?.textContent));
  await page.$eval('[data-speaker-form] input[name="name"]', (i) => { i.value = '鼎淵'; });
  await page.click('[data-speaker-form] button[type="submit"]');
  await page.waitForFunction(() => !document.querySelector('[data-speaker-form]'));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'shared', 'setting.json'), 'utf8')), { speaker: { name: '鼎淵', titles: ['講師'] } });
});

test('剪輯清單：頁首固定；連不到服務時勾選還原並提醒，連上後恢復', async () => {
  const rows = Array.from({ length: 40 }, (_, i) => `| [x] | ${i}:01.00–${i}:03.00 | 第 ${i + 1} 句 | 重講 | — |`);
  fs.writeFileSync(path.join(work, 'cuts.md'), ['# 剪輯清單', '', '## NG', '', '| 剪 | 時間碼 | 內容 | 原因 | 待確認 |', '|---|---|---|---|---|', ...rows, ''].join('\n'));
  await page.goto(new URL('/cuts', editor.url).href, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ct-row[data-row="40"]');
  await page.evaluate(() => document.querySelector('.ct-row[data-row="30"]').scrollIntoView({ block: 'center' }));
  assert.equal(await inView('#saveState'), true);
  await page.setOfflineMode(true);
  await page.click('.ct-row[data-row="30"] input[type="checkbox"]');
  await page.waitForFunction(() => !document.querySelector('#notice').hidden);
  assert.equal(await inView('#notice'), true);
  assert.equal(await page.$eval('.ct-row[data-row="30"] input', (i) => i.checked), true, '沒存到就回到原本的勾選');
  assert.equal(await page.$eval('.ct-row[data-row="30"] .ct-tag', (t) => t.textContent), '剪掉');
  await page.setOfflineMode(false);
  await page.waitForFunction(() => document.querySelector('#notice').hidden && document.querySelector('#saveState').dataset.state === 'saved', { timeout: 12000 });
});

test('分鏡表：內容設計動畫的概念直接看得到，占位圖標「動畫還沒做」；描述不標橘底，只有畫面上的字可以改', async () => {
  const design = ['## d01（#1–2e，0:00.00–0:04.94）', '', '- 起點那句字幕：嗨', '- 版面：子母畫面（內容設計動畫）', '- 音效：預設', '- 概念：兩個小毛病藏在影片裡', '- 畫面：勾被擦掉，毛病跳出來', '- 理由：落差是情緒高點', '',
    '![d01](storyboard-preview/d01.png)', '', '截圖觀察：動畫要在這張鏡位腳本確認後才做，所以還沒有畫面', '', '#### 動畫分鏡 d01', '',
    '| 拍 | 講到（綁句） | 畫面上出現什麼 | 動態（設計系統語彙） | 焦點 | 音效拍點 |', '|---|---|---|---|---|---|',
    '| 0 | 段起點 | 拍攝現場：左邊一個人站著 | 開場 | 現場 | — |',
    '| 1 | `#1@嗨` | 貼標籤「腳架晃」；講到「雲端」雲彈出；中央（圖示「camera」） | 彈出 | 腳架 | click |', ''].join('\n');
  fs.writeFileSync(file, `${MD}\n${design}`);
  fs.mkdirSync(path.join(work, 'storyboard-preview'), { recursive: true });
  fs.writeFileSync(path.join(work, 'storyboard-preview', 'd01.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));
  await page.goto(new URL('/storyboard', editor.url).href, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#sec-d01');
  const text = await page.$eval('#sec-d01 .sb-segbody', (n) => n.innerText);
  assert.match(text, /概念\s*兩個小毛病藏在影片裡/);
  assert.match(text, /畫面\s*勾被擦掉，毛病跳出來/);
  assert.match(await page.$eval('#sec-d01 .sb-pending', (n) => n.textContent), /動畫還沒做/);
  // 鏡位腳本是給 AI 的細節：預設收起，summary 講有幾拍
  assert.equal(await page.$eval('#sec-d01 details[data-fold$="動畫分鏡 d01"]', (d) => d.open), false);
  assert.match(await page.$eval('#sec-d01 details[data-fold$="動畫分鏡 d01"] summary', (n) => n.textContent), /鏡位腳本（2 拍）/);
  await page.click('#sec-d01 details[data-fold$="動畫分鏡 d01"] summary');
  // 「理由」常常是 AI 排版的考量，收進 AI 的備註；截圖觀察不用放進去
  const notes = await page.$eval('#sec-d01 details[data-fold$=":notes"]', (n) => n.textContent);
  assert.match(notes, /落差是情緒高點/);
  assert.doesNotMatch(notes, /截圖觀察/);
  // 橘底只有畫面上的字
  assert.deepEqual(await page.$$eval('#sec-d01 .sb-table .sb-piece, #sec-d01 .sb-table .sb-edit', (a) => a.map((e) => e.textContent)), ['腳架晃']);
  const row = await page.$eval('#sec-d01 .sb-table tbody tr:nth-child(2)', (n) => n.innerText);
  assert.match(row, /講到「雲端」雲彈出/);
  assert.doesNotMatch(row, /camera/);
  // 改畫面上的字：講稿引用與圖示名稱原樣留著
  await page.click('#sec-d01 .sb-table .sb-piece');
  await page.keyboard.press('End');
  await page.keyboard.type('了');
  await page.keyboard.press('Enter');
  assert.equal(await untilFile(/貼標籤「腳架晃了」；講到「雲端」雲彈出；中央（圖示「camera」）/), true);
});

test('流程列：標出這一頁、走過的步驟與等你回覆的那一步，可以直接換頁', async () => {
  fs.writeFileSync(path.join(work, 'cuts.md'), '# 剪輯清單\n\n## NG\n\n| 剪 | 時間碼 | 內容 | 原因 | 待確認 |\n|---|---|---|---|---|\n');
  fs.writeFileSync(path.join(work, '製作進度.md'), ['# 製作進度', '', '## 開工決策表', '', '| 欄 | 值 |', '|---|---|', '| 主軌種類 | 只有真人 |', '', '## 停點紀錄', '', '| 時間 | 停點 | 狀態 | 使用者原話 | 寫回哪裡 |', '|---|---|---|---|---|', '| 2026-11-06 10:00 | ① 剪輯清單 | 通過 | 可以 | |', '| 2026-11-06 10:05 | ③ 分鏡表 | 待回覆 | | |', '', '## 回饋輪', ''].join('\n'));
  const flow = await (await fetch(new URL('/api/flow', editor.url))).json();
  assert.deepEqual(flow.steps.map((s) => [s.id, s.state]), [['cuts', 'done'], ['framing', 'none'], ['storyboard', 'waiting'], ['final', 'none']]);
  assert.equal(flow.waiting, 'storyboard');
  await page.goto(new URL('/storyboard', editor.url).href, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#flowbar .fb-step.on');
  assert.match(await page.$eval('#flowbar .fb-step.on', (n) => n.textContent), /分鏡表/);
  assert.equal(await page.$eval('#flowbar a[href="/cuts"]', (n) => n.classList.contains('done')), true);
  assert.equal(await page.$('#flowbar a[href="/framing"]'), null, '還沒有內容的步驟不給點');
  assert.equal(await page.$eval('#flowbar .fb-step.waiting', (n) => n.classList.contains('on')), true);
  await page.click('#flowbar a[href="/cuts"]');
  await page.waitForFunction(() => location.pathname === '/cuts' && document.querySelector('#flowbar .fb-step.on')?.textContent.includes('剪輯清單'));
  // 主要按鈕的字色照主色算：對比至少 4.5（白字配橘色只有 3.1）
  const ratio = await page.evaluate(() => {
    const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
    const css = getComputedStyle(document.documentElement);
    const a = lum(css.getPropertyValue('--brand').trim()), b = lum(css.getPropertyValue('--on-accent').trim());
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
  assert.ok(ratio >= 4.5, `主要按鈕對比 ${ratio.toFixed(2)}`);
  await fs.promises.rm(path.join(work, '製作進度.md'));
});

test('分鏡表：需要決定的事一項一張卡，各自回答；給 AI 的備註預設收起來', async () => {
  const md = ['# 分鏡表：demo（草稿）', '', ...filler('s01'), '## 需要我決定的事', '', '1. 講者的姓名與頭銜還沒給', '2. 這幾章的章名是 AI 取的，要改就告訴我：「第一章」', '3. 結尾要不要配樂', '', '### 給 AI 的備註（不用回答）', '', '- x-desk 放不下', '', '### 金句候選（勾了才上，每集最多 6 則）', '', '| 候選 | 句號 | 原句 | 卡上文字（≤ 14 字） | 情緒（正／負／中） | 要不要 ☐ |', '|---|---|---|---|---|---|', '| 1 | #4 | 一句 | 卡 | 正 | ☐ |', ''].join('\n');
  fs.writeFileSync(file, md);
  await page.goto(new URL('/storyboard', editor.url).href, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.sb-ask');
  assert.equal(await page.$$eval('.sb-ask', (a) => a.length), 3);
  assert.equal(await page.$eval('.sb-sec.decide details[data-fold$="給 AI 的備註（不用回答）"]', (d) => d.open), false);
  // 第 1 項回答之後行號變了，第 3 項要寫到對的地方
  const answers = await page.$$('.sb-answer');
  await answers[0].click();
  await page.keyboard.type('鼎淵');
  await page.evaluate(() => document.activeElement.blur());
  assert.equal(await untilFile(/1\. 講者的姓名與頭銜還沒給\n {3}- 回答：鼎淵\n/), true);
  await page.waitForFunction(() => document.querySelector('.sb-ask.answered .sb-ask-mark')?.textContent === '✓');
  const again = await page.$$('.sb-answer');
  await again[2].click();
  await page.keyboard.type('不要');
  await page.evaluate(() => document.activeElement.blur());
  assert.equal(await untilFile(/3\. 結尾要不要配樂\n {3}- 回答：不要\n/), true);
  await page.waitForFunction(() => document.querySelectorAll('.sb-ask.answered').length === 2);
  assert.match(fs.readFileSync(file, 'utf8'), /\| 1 \| #4 \| 一句 \| 卡 \| 正 \| ☐ \|/, '表格沒被動到');
});

test('分鏡表（長）：目錄照章分組；任務列數得對；搜尋段號、文字、時間；篩選；金句超過上限提醒；記得看到哪', async () => {
  const seg = (id, ch, a, b, card, say) => ({ id, ch, a, b, card, say });
  const list = [
    seg('c01', '第 1 章', '0:00.18', '0:02.68', '01 章節轉場', '第一章開場'),
    seg('s0101', '第 1 章', '0:02.68', '0:08.24', '07 重點字卡', '建議儲存影片'),
    seg('x0102', '第 1 章', '0:08.24', '0:30.00', '模板動畫 x-scene', '每次錄完都要跑去看'),
    seg('d0103', '第 2 章', '0:30.00', '1:00.00', '內容設計動畫', '手機畫面小看不出毛病'),
    seg('m0104', '第 2 章', '1:00.00', '1:30.00', '螢幕錄影或圖片 a.mp4', '打開設定頁'),
  ];
  const md = ['# 分鏡表：demo（草稿）', '', '## 總覽', '', '| 段 | 章 | 句號 | 時間碼 | 版面 | 卡片類型 | 一句話摘要 |', '|---|---|---|---|---|---|---|',
    ...list.map((s) => `| ${s.id} | ${s.ch} | #1 | ${s.a}–${s.b} | 疊加 | ${s.card} | ${s.say} |`), '', '## 分段', '',
    ...list.flatMap((s) => [`### ${s.id}｜#1｜${s.a}–${s.b}`, '', `- 起點那句字幕：${s.say}的字幕`, '- 版面：疊加', ...Array.from({ length: 12 }, (_, i) => `- 備註${i}：撐高`), '']),
    '## 需要我決定的事', '', '1. 第一件', '   - 回答：好', '2. 第二件', '', '### 金句候選（勾了才上，每集最多 2 則）', '', '| 候選 | 句號 | 原句 | 卡上文字（≤ 14 字） | 情緒（正／負／中） | 要不要 ☐ |', '|---|---|---|---|---|---|', '| 1 | #4 | 一 | 卡一 | 正 | ☐ |', '| 2 | #5 | 二 | 卡二 | 正 | ☐ |', '| 3 | #6 | 三 | 卡三 | 正 | ☐ |', ''].join('\n');
  fs.writeFileSync(file, md);
  await page.goto(new URL('/storyboard', editor.url).href, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { try { localStorage.clear(); } catch { /* 沒有也沒關係 */ } });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#nav details.sb-navch');
  // 章
  assert.deepEqual(await page.$$eval('#nav .sb-chname', (a) => a.map((x) => x.textContent)), ['第 1 章', '第 2 章']);
  assert.deepEqual(await page.$$eval('#nav details.sb-navch', (a) => a.map((d) => d.open)), [true, false], '目前這一章打開');
  assert.match(await page.$eval('#nav .sb-chmeta', (n) => n.textContent), /0:00.*3 段/);
  // 任務列
  const tasks = () => page.$eval('#tasks', (n) => n.innerText.replace(/\n/g, ' '));
  assert.match(await tasks(), /要你決定 1 件 共 2 件/);
  assert.match(await tasks(), /金句 0／最多 2/);
  // 跳到別章：那一章自己打開
  await page.evaluate(() => document.getElementById('sec-d0103').scrollIntoView());
  await page.waitForFunction(() => document.querySelector('#nav details.sb-navch[data-ch="1"]').open);
  assert.equal(await page.$eval('#nav details.sb-navch[data-ch="0"]', (d) => d.open), false);
  await page.waitForFunction(() => /看過 [1-9]／5/.test(document.querySelector('#tasks').innerText));
  // 搜尋：段號、字幕文字、時間
  const search = async (q) => { await page.$eval('#finderInput', (i) => { i.value = ''; i.focus(); }); await page.keyboard.type(q); await sleep(120); return page.$$eval('.sb-sec:not([hidden])', (a) => a.map((x) => x.id)); };
  assert.deepEqual(await search('x0102'), ['sec-x0102']);
  assert.deepEqual(await search('跑去看'), ['sec-x0102']);
  assert.deepEqual(await search('0:45'), ['sec-d0103'], '時間落在哪一段');
  assert.match(await page.$eval('#finderNote', (n) => n.textContent), /找到 1 段/);
  assert.deepEqual(await search('沒有這種字'), []);
  assert.match(await page.$eval('#finderNote', (n) => n.textContent), /沒有符合的段/);
  await page.click('[data-finder-clear]');
  assert.equal(await page.$$eval('.sb-sec:not([hidden])', (a) => a.length) > 5, true);
  // 篩選
  const only = async (k) => { await page.click(`[data-kind-filter="${k}"]`); await sleep(80); return page.$$eval('.sb-sec:not([hidden])', (a) => a.map((x) => x.id)); };
  assert.deepEqual(await only('anim'), ['sec-x0102', 'sec-d0103'], '內容設計動畫和模板動畫都是「動畫」');
  assert.deepEqual(await only('media'), ['sec-m0104']);
  assert.deepEqual(await only('card'), ['sec-c01', 'sec-s0101']);
  assert.deepEqual(await only('changed'), []);
  await only('all');
  // 金句超過上限
  const boxes = await page.$$('.sb-sec.decide td.check input');
  for (const b of boxes) { await b.click(); await sleep(150); }
  await page.waitForFunction(() => /金句 3／最多 2/.test(document.querySelector('#tasks').innerText));
  assert.match(await tasks(), /多了 1 則/);
  assert.ok(await page.$('#tasks .sb-task.over'));
  // 重新整理：看過的留著，也可以接著看
  await page.waitForFunction(() => localStorage.getItem('sb-last:demo'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#tasks [data-resume]');
  assert.match(await page.$eval('#tasks [data-resume]', (n) => n.textContent), /接著看/);
  assert.ok(await page.$('#nav a.seen'));
});

test('剪輯清單：聽剪完會跳過要剪的部分；只看 AI 不確定的；文字不露路徑', async () => {
  // 影片要真的能播：做一支 8 秒的
  const { spawnSync } = await import('node:child_process');
  const v = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=navy:size=160x90:rate=30', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', '12', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-g', '15', '-c:a', 'aac', path.join(work, 'main.mp4')]);
  assert.equal(v.status, 0, String(v.stderr));
  fs.writeFileSync(path.join(work, 'cuts.md'), ['# 剪輯清單', '', '## NG', '', '| 剪 | 時間碼 | 內容 | 原因 | 待確認 |', '|---|---|---|---|---|',
    '| [x] | 0:03.00–0:05.00 | 第一句 | 重講 | — |', '| [x] | 0:08.00–0:09.00 | 第二句 | 卡住 | 起點沒有停頓 |', '',
    '## 需要你決定', '', '- ⚠ NG 第 2 列（0:08.00–0:09.00）起點前後 1.0s 內沒有停頓，起點用原值 → 播 ../../proj/work/main.mp4 的 0:07.0–0:10.0 聽一下，切到字就把 cuts.md 的時間碼往停頓移', ''].join('\n'));
  await page.goto(new URL('/cuts', editor.url).href, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ct-row .ct-after');
  const body = await page.$eval('main', (n) => n.innerText);
  assert.doesNotMatch(body, /main\.mp4|cuts\.md|\.\.\//, '不露路徑');
  assert.match(body, /按那一列的 ▶ 聽一下（0:07\.0–0:10\.0）/);
  // 只看不確定的
  assert.equal(await page.$eval('#filterUnsure', (b) => b.textContent), '只看 AI 不確定的（1）');
  await page.click('#filterUnsure');
  assert.deepEqual(await page.$$eval('.ct-row:not([hidden])', (a) => a.map((x) => x.dataset.row)), ['2']);
  await page.click('#filterUnsure');
  assert.equal(await page.$$eval('.ct-row:not([hidden])', (a) => a.length), 2);
  // 聽剪完：跳過 3–5 秒那一段
  await page.evaluate(() => { window.__seen = []; const video = document.querySelector('#video'); const t = () => { window.__seen.push(video.currentTime); requestAnimationFrame(t); }; requestAnimationFrame(t); });
  await page.click('.ct-row[data-row="1"] .ct-after');
  await page.waitForFunction(() => /聽剪掉之後接起來的樣子/.test(document.querySelector('#now').textContent), { timeout: 8000 }).catch(() => {});
  const seen = await (async () => { const until = Date.now() + 5000; for (;;) { const a = await page.evaluate(() => window.__seen.slice()); if (a.some((x) => x > 5.2) || Date.now() > until) return a; await sleep(100); } })();
  if (seen.some((x) => x > 5.2)) {
    const after = seen.slice(seen.findIndex((x) => x > 1 && x < 3));
    assert.ok(!after.some((x) => x > 3.2 && x < 4.8), `跳過要剪的部分（聽到 ${after.filter((x) => x > 3 && x < 5).slice(0, 4)}）`);
  }
  await fs.promises.rm(path.join(work, 'main.mp4'));
});

test('分鏡表（長片總覽）：8 段以上先看縮圖總覽；點一張看那一段，上一段下一段；搜尋篩卡片；鏡位腳本不顯示座標；決定和提醒分開', async () => {
  const seg = (i) => {
    const id = `s0${i}`, t = `0:${String(i * 5).padStart(2, '0')}.00`, e = `0:${String(i * 5 + 5).padStart(2, '0')}.00`;
    return [`### ${id}｜#1｜${t}–${e}`, '', `- 起點那句字幕：第 ${i} 段的字幕`, '- 版面：疊加（07 重點字卡）', `- 畫面：左邊一個人（x 80–480、y 340–500）站著`, `- 理由：視覺語言建議 x-process`, '', `![${id}](storyboard-preview/${id}.png)`, ''];
  };
  const list = Array.from({ length: 10 }, (_, i) => i + 1);
  const md = ['# 分鏡表：demo（草稿）', '', '## 總覽', '', '| 段 | 章 | 句號 | 時間碼 | 版面 | 卡片類型 | 一句話摘要 |', '|---|---|---|---|---|---|---|',
    ...list.map((i) => `| s0${i} | 第 ${i > 5 ? 2 : 1} 章 | #1 | 0:${String(i * 5).padStart(2, '0')}.00–0:${String(i * 5 + 5).padStart(2, '0')}.00 | 疊加 | ${i === 3 ? '內容設計動畫' : '07 重點字卡'} | 第 ${i} 段在講什麼 |`), '', '## 分段', '',
    ...list.flatMap(seg), '## 需要我決定的事', '', '1. 片頭要不要配樂', '2. 補錄：登入後的畫面，2:12–2:19', '3. 部落格連結待補', ''].join('\n');
  fs.writeFileSync(file, md);
  await fs.promises.rm(path.join(work, '製作進度.md'), { force: true });
  await page.goto(new URL('/storyboard', editor.url).href, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { try { localStorage.clear(); } catch { /* 沒有也沒關係 */ } });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.sb-card');
  assert.equal(await page.$$eval('.sb-card', (a) => a.length), 10);
  assert.equal(await page.$$eval('.sb-sec[id^="sec-s0"]:not([hidden])', (a) => a.length), 0, '總覽時不展開每一段');
  assert.deepEqual(await page.$$eval('.sb-gridch', (a) => a.map((x) => x.firstChild.textContent)), ['第 1 章', '第 2 章']);
  const card = await page.$eval('.sb-card[data-id="s03"]', (n) => n.innerText.replace(/\s+/g, ' '));
  assert.match(card, /第 3 段在講什麼 0:15 動畫 s03/);
  assert.match(await page.$eval('#next', (n) => n.textContent), /可以/);
  // 決定和提醒分開，人稱一致
  const tasks = await page.$eval('#tasks', (n) => n.innerText.replace(/\s+/g, ' '));
  assert.match(tasks, /要你決定 1 件/);
  assert.match(tasks, /待補的素材和提醒 2 件/);
  // 搜尋篩卡片
  await page.type('#finderInput', 's07');
  await page.waitForFunction(() => document.querySelectorAll('.sb-card:not([hidden])').length === 1);
  await page.$eval('#finderInput', (i) => { i.value = ''; i.dispatchEvent(new Event('input')); });
  await page.click('[data-kind-filter="anim"]');
  await page.waitForFunction(() => document.querySelectorAll('.sb-card:not([hidden])').length === 1);
  await page.click('[data-kind-filter="all"]');
  // 點一張：只放那一段；有上一段、下一段
  await page.click('.sb-card[data-id="s03"]');
  await page.waitForSelector('#sec-s03:not([hidden])');
  assert.equal(await page.$$eval('.sb-sec[id^="sec-s0"]:not([hidden])', (a) => a.length), 1);
  assert.equal(await page.$eval('#grid', (n) => n.hidden), true);
  assert.match(await page.$eval('#onePos', (n) => n.textContent), /第 3／10 段/);
  // 座標和 AI 的考量不顯示，檔案裡還在
  const text = await page.$eval('#sec-s03 .sb-segbody', (n) => n.innerText);
  assert.match(text, /左邊一個人 ?站著/);
  assert.doesNotMatch(text, /x 80|y 340|x-process/);
  assert.match(fs.readFileSync(file, 'utf8'), /x 80–480/);
  await page.click('[data-one="next"]');
  await page.waitForSelector('#sec-s04:not([hidden])');
  await page.keyboard.press('[');
  await page.waitForSelector('#sec-s03:not([hidden])');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#grid').hidden);
  // 目錄點一段＝打開那一段；逐段捲動還在
  await page.click('#nav li[data-nav="s01"] a');
  await page.waitForSelector('#sec-s01:not([hidden])');
  await page.click('[data-one="back"]');
  await page.click('[data-view="list"]');
  assert.equal(await page.$$eval('.sb-sec[id^="sec-s0"]:not([hidden])', (a) => a.length), 10);
  // 重新載入內容（AI 改檔）不會跳回去
  fs.writeFileSync(file, md.replace('第 1 段在講什麼', '第一段改了'));
  await page.waitForFunction(() => /第一段改了/.test(document.querySelector('#sec-s01 h2')?.textContent || ''), { timeout: 10000 });
  assert.equal(await page.$$eval('.sb-sec[id^="sec-s0"]:not([hidden])', (a) => a.length), 10);
  // 只能看的時候：沒有待辦、沒有選單、例句是真的段號
  fs.writeFileSync(path.join(work, '製作進度.md'), ['# 製作進度', '', '## 開工決策表', '', '| 欄 | 值 |', '|---|---|', '| 主軌種類 | 只有真人 |', '', '## 停點紀錄', '', '| 時間 | 停點 | 狀態 | 使用者原話 | 決定寫回 |', '|---|---|---|---|---|', '| 2026-07-01 10:00 | ③ 分鏡表 | 通過 | 可以 | plan.json |', ''].join('\n'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.sb-card');
  assert.equal(await page.$eval('#saveState', (n) => n.textContent.trim()), '只能看');
  assert.doesNotMatch(await page.$eval('#tasks', (n) => n.innerText), /要你決定|待補|金句|看過/, '已經確認：沒有待辦（「接著看」可以留著）');
  assert.equal(await page.$$eval('.sb-sec select', (a) => a.length), 0, '不放看起來能選的選單');
  assert.match(await page.$eval('#banner', (n) => n.textContent), /「s01 重新設計」/);
  assert.equal(await page.$eval('#next', (n) => n.hidden), true);
  assert.match(await page.$eval('#nav a.decide', (n) => n.textContent), /當時的決定與提醒/);
  await fs.promises.rm(path.join(work, '製作進度.md'));
});
