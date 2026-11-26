import { test as nodeTest } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { startEditor } from '../../shared/template/tools/editor.mjs';
import { findChrome } from '../../shared/template/tools/lib/audit-browser.mjs';
import { TEMPLATE, missingTools, skipAll, tmpDir } from './helpers.mjs';

// 整個檔都要開瀏覽器：沒有 Chrome、ffmpeg 或 puppeteer-core（hyperframes 順帶裝的，不在 package.json）就全部略過，用到才載入
const noUi = await missingTools('chrome', 'ffmpeg', 'puppeteer');
const test = skipAll(nodeTest, noUi);
const puppeteer = noUi ? null : (await import('puppeteer-core')).default;

test('修改單 UI：複製、開始、失敗、完成及重新編輯的狀態符合實際動作', async (t) => {
  const root = tmpDir(t, 'editor-requests-ui-');
  const project = path.join(root, 'projects/example'), work = path.join(project, 'work');
  fs.mkdirSync(path.join(work, 'hyperframes'), { recursive: true });
  fs.mkdirSync(path.join(root, 'shared'));
  fs.symlinkSync(TEMPLATE, path.join(root, 'shared/template'), 'dir');
  fs.writeFileSync(path.join(work, 'hyperframes/plan.json'), JSON.stringify({ version: 1, scenes: [
    { id: 's01', scene: 'concept', from: '#1', to: '#1e', slots: { text: '第一段' } },
    { id: 's02', scene: 'concept', from: '#2', to: '#2e', slots: { text: '第二段' } },
  ] }));
  fs.writeFileSync(path.join(work, 'rough.srt'), '1\n00:00:00,500 --> 00:00:02,500\n第一段字幕\n\n2\n00:00:03,000 --> 00:00:05,000\n第二段字幕\n');
  const media = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=navy:size=320x180:rate=30', '-t', '6', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(work, 'rough.mp4')]);
  assert.equal(media.status, 0, String(media.stderr));
  const editor = await startEditor({ cwd: root, flags: { project, template: path.join(root, 'shared/template') }, port: 0, writeState: false });
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: findChrome(), headless: true });
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewport({ width: 1800, height: 1000 });
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('editor-requests:projects/example', JSON.stringify(['s01', 's02'].map((id) => ({ id, tags: ['更有質感'], note: '', t: 1 }))));
      localStorage.setItem('editor-requests-open', '1');
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => { window.copiedRequest = text; } } });
    });
    await page.goto(editor.url);
    await page.waitForSelector('[data-rq="copy"]');
    await page.evaluate(() => { document.querySelector('#coach').hidden = true; });
    assert.equal(await page.$eval('#rqCount', (el) => el.textContent), '2', await page.evaluate(() => JSON.stringify({ project: window.__editor.server?.project, requests: window.__editor.requests })));
    assert.equal(await page.$$('.rq-sent').then((x) => x.length), 0);
    await page.click('[data-rq="copy"]');
    await page.waitForFunction(() => document.querySelector('.rq-sent')?.textContent === '已複製');
    assert.match(await page.evaluate(() => window.copiedRequest), /node shared\/template\/tools\/versions\.mjs begin --project "projects\/example" --requests/, '032 C6：剪輯台的狀態由 versions.mjs begin --requests、finish 回報');
    // 029：沒勾「重新設計」＝在現有的動畫上改；修改單每段有「做法」那一行
    assert.match(await page.evaluate(() => window.copiedRequest), /這次沒有要重新設計的段：都在現有的動畫上改。/);
    assert.equal((fs.readFileSync(path.join(work, 'feedback/editor-requests.md'), 'utf8').match(/- 做法：在現有的動畫上改（沒勾「重新設計」）/g) || []).length, 2);
    assert.doesNotMatch(await page.$eval('#requests', (el) => el.textContent), /已送出/);
    let q = (await (await fetch(new URL('/api/requests/status', editor.url))).json()).requests;
    assert.deepEqual(q.states, {});
    const update = async (ids, state, message = '') => {
      const r = await fetch(new URL('/api/requests/status', editor.url), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: q.revision, ids, state, message, round: 'r1' }) });
      assert.equal(r.status, 200);
    };
    await update(['s01'], 'generating');
    // 068 三個分頁：生成中的段移到「生成中」分頁（待改分頁只剩 s02）
    await page.waitForFunction(() => document.querySelector('[data-rq="tab"][data-tab="gen"]')?.textContent === '生成中（1）');
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.rq-tabs [data-rq="tab"]')].map((el) => [el.textContent, el.classList.contains('on')])), [['待改（1）', true], ['生成中（1）', false], ['已改完（0）', false]]);
    await page.click('[data-rq="tab"][data-tab="gen"]');
    await page.waitForSelector('.rq-sent.generating');
    assert.equal(await page.$$('.rq-sent.generating').then((x) => x.length), 1);
    const screenshot = path.join(root, '生成中.png');
    await page.screenshot({ path: screenshot });
    // 生成中的段 AI 已經在改：複製給 AI 不再送（不然同一段送兩次），另列「生成中」；再複製後舊那一版的段帶著走、照舊顯示生成中、回報照舊收得到
    assert.equal(await page.$eval('[data-rq="copy"]', (el) => el.textContent), '複製給 AI（1 段待改）');
    assert.match(await page.$eval('#rqTabs', (el) => el.textContent), /生成中（1）/);
    // 分頁貼齊面板上緣、不在捲動區裡；「這段想改」只在待改分頁
    assert.equal(await page.evaluate(() => document.querySelector('#rqTabs').parentElement.id), 'requests');
    assert.equal(await page.$eval('#rqTop', (el) => el.hidden), true, '生成中分頁不放編輯區');
    await page.evaluate(() => { window.copiedRequest = ''; });
    await page.click('[data-rq="copy"]');
    await page.waitForFunction(() => /begin/.test(window.copiedRequest || ''));
    const md2 = fs.readFileSync(path.join(work, 'feedback/editor-requests.md'), 'utf8');
    assert.match(md2, /## 1\. s02/);
    assert.doesNotMatch(md2, /## \d+\. s01/);
    await page.waitForFunction(() => window.__editor.server?.requests?.carried?.includes('s01'));
    assert.equal(await page.$$('.rq-sent.generating').then((x) => x.length), 1);
    await update(['s01'], 'failed', '動畫檢查未通過');
    // 完成一段就跳提示（versions.mjs done 每回來一段回報一次）：失敗的也跳，寫原因
    await page.waitForFunction(() => [...document.querySelectorAll('#toasts .toast')].some((el) => el.textContent.includes('s01 沒改成：動畫檢查未通過')));
    await page.click('[data-rq="tab"][data-tab="pend"]');
    await page.waitForSelector('.rq-sent.failed');
    // 068 已改完＝最近一輪回饋的修改紀錄（versions.mjs finish 寫的 r<N>.md「改了哪幾段」），每段可以用上一版
    fs.writeFileSync(path.join(work, 'feedback/r1.md'), '# 回饋 r1（2026-11-19 12:00）\n\n## 原話\n\n「照修改單改」\n\n## 改了哪幾段\n\n- s01：已重做並通過 build、audit（v1 → v2）\n\n## 驗證\n');
    await update(['s01'], 'done', '已重做並通過 build、audit');
    await page.waitForFunction(() => [...document.querySelectorAll('#toasts .toast')].some((el) => /^s01 改好了/.test(el.textContent) && el.querySelector('button')?.textContent === '▶ 看結果'));
    await page.click('[data-rq="tab"][data-tab="done"]');
    await page.waitForSelector('.rq-item.done');
    assert.match(await page.$eval('.rq-item.done', (el) => el.textContent), /已重做並通過 build、audit/);
    assert.match(await page.$eval('#rqLists', (el) => el.textContent), /r1（2026-11-19 12:00）改了 1 段/);
    await page.waitForFunction(() => document.querySelector('[data-rq="tab"][data-tab="done"]')?.textContent === '已改完（1）');
    // 改了需求後，舊批次的完成／生成狀態不再套到新需求。
    await page.click('[data-rq="tab"][data-tab="pend"]');
    await page.evaluate(() => window.__editor.select({ kind: 'item', id: 's01' }));
    await page.waitForSelector('#rqNote', { visible: true });
    // r8：已改完的段，修改單上寫的標籤、描述清空（下次點到從空白開始），已改完的狀態照樣看得到
    await page.waitForFunction(() => document.querySelector('#rqState')?.textContent.includes('已改完'));
    assert.deepEqual(await page.evaluate(() => [document.querySelector('#rqNote').value, document.querySelectorAll('#rqTop .rq-tags .toggle.on').length, document.querySelector('#rqState')?.textContent.includes('已改完')]), ['', 0, true]);
    await page.type('#rqNote', '重新調整');
    await page.waitForFunction(() => document.querySelector('#rqState')?.textContent.includes('待改：已存進修改單'));
    assert.equal(await page.$eval('[data-rq="tab"][data-tab="pend"]', (el) => el.textContent), '待改（2）', '改了需求就回到待改；已改完那一輪的紀錄照留');
    // 072 修改單存在專案裡（不是只在這個瀏覽器）
    await page.waitForFunction(() => !window.__editor.requests.some((x) => x.id === 's01' && x.note !== '重新調整'));
    await new Promise((r) => setTimeout(r, 300));
    const saved = JSON.parse(fs.readFileSync(path.join(work, 'feedback/editor-requests-list.json'), 'utf8')).list.find((x) => x.id === 's01');
    assert.deepEqual([saved.tags, saved.note, 'done' in saved], [[], '重新調整', false], '新的一筆不帶上一次的標籤');
    // 029：勾了「重新設計」的段寫進修改單，複製的那一行寫明這幾段派設計師從空白重畫
    assert.equal(await page.$eval('#rqTop [data-rq="redo"]', (el) => el.checked), false, '預設不勾');
    await page.click('#rqTop [data-rq="redo"]');
    // 修改單每次存檔回來會整塊重畫一次。page.click 是「先找到元素、再算位置、再點」，中間剛好被重畫換掉就會丟
    // 「Node is either not clickable or not an Element」（機器忙的時候才遇得到）。剛改完內容就要點的地方，在頁面裡一次找到就點
    const tap = (sel) => page.$eval(sel, (el) => el.click());
    await tap('[data-rq="tab"][data-tab="pend"]');
    await page.waitForSelector('.rq-item .chip-redo');
    assert.equal(await page.evaluate(() => localStorage.getItem('editor-requests-tab')), 'pend', '記住上次看的分頁');
    await tap('[data-rq="copy"]');
    await page.waitForFunction(() => /其中 1 段要重新設計（s01）：這幾段派設計師照 design\.md 從空白畫布重畫；其他段在現有的動畫上改。/.test(window.copiedRequest || ''));
    assert.match(fs.readFileSync(path.join(work, 'feedback/editor-requests.md'), 'utf8'), /## 1\. s01[\s\S]*- 做法：重新設計（使用者勾的）[\s\S]*## 2\. s02[\s\S]*- 做法：在現有的動畫上改/);
    // 剪貼簿失敗時，存檔成功也不能宣稱已複製。
    await page.evaluate(() => {
      navigator.clipboard.writeText = async () => { throw new Error('clipboard denied'); };
      document.execCommand = () => false;
    });
    await tap('[data-rq="copy"]');
    await page.waitForFunction(() => [...document.querySelectorAll('.rq-sent')].every((el) => el.textContent === '已存檔'));
    // 072：另一個沒存過東西的瀏覽器（無痕）打開，修改單一樣；在那邊寫的草稿，原本的分頁幾秒內也看得到（不會被舊分頁蓋掉）
    const other = await browser.createBrowserContext(), p2 = await other.newPage();
    p2.on('pageerror', (e) => errors.push(e.message));
    await p2.setViewport({ width: 1800, height: 1000 });
    await p2.goto(editor.url);
    await p2.waitForFunction(() => window.__editor?.requests?.length === 2);
    assert.deepEqual(await p2.evaluate(() => window.__editor.requests.map((x) => [x.id, x.note])), await page.evaluate(() => window.__editor.requests.map((x) => [x.id, x.note])));
    await p2.evaluate(() => { localStorage.setItem('editor-requests-open', '1'); });
    await p2.evaluate(() => window.__editor.select({ kind: 'item', id: 's02' }));
    await p2.evaluate(() => { document.querySelector('#coach').hidden = true; document.querySelector('.side-tabs [data-side="rq"]').click(); });
    await p2.waitForSelector('#rqNote', { visible: true });
    await p2.type('#rqNote', '另一個瀏覽器寫的草稿');
    await page.waitForFunction(() => window.__editor.requests.find((x) => x.id === 's02')?.note === '另一個瀏覽器寫的草稿', { timeout: 10000 });
    await other.close();
    // 073 剪輯台的程式更新了（/api/version 的 client 換了）：開著的分頁跳出「重新整理」橫幅，不會一直跑舊程式
    const ver = await page.evaluate(async () => (await (await fetch('/api/version')).json()).client);
    assert.ok(Number.isFinite(ver) && ver > 0, `/api/version 帶 client：${ver}`);
    assert.equal(await page.evaluate(() => document.querySelector('#banner').hidden), true);
    await page.evaluate(() => {
      const f = window.fetch;
      window.fetch = async (u, o) => {
        const r = await f(u, o);
        if (!String(u).includes('/api/version')) return r;
        const j = await r.json();
        return new Response(JSON.stringify({ ...j, client: j.client + 1 }), { status: r.status, headers: { 'Content-Type': 'application/json' } });
      };
    });
    await page.waitForFunction(() => !document.querySelector('#banner').hidden && /程式剛更新/.test(document.querySelector('#banner').textContent), { timeout: 10000 });
    assert.match(await page.evaluate(() => document.querySelector('#banner button').textContent), /重新整理/);
    assert.deepEqual(errors, []);
    console.log(`修改單 UI 截圖：${screenshot}`);
  } finally {
    await browser?.close();
    await editor.close();
  }
});
