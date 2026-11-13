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
    // 029：沒勾「重新設計」＝在現有的動畫上改，提示詞寫明不用載入 hyperframes skill；修改單每段有「做法」那一行
    assert.match(await page.evaluate(() => window.copiedRequest), /這次沒有要重新設計的段：都在現有的動畫上改，不用載入 hyperframes skill。/);
    assert.equal((fs.readFileSync(path.join(work, 'feedback/editor-requests.md'), 'utf8').match(/- 做法：在現有的動畫上改（沒勾「重新設計」）/g) || []).length, 2);
    assert.doesNotMatch(await page.$eval('#requests', (el) => el.textContent), /已送出/);
    let q = (await (await fetch(new URL('/api/requests/status', editor.url))).json()).requests;
    assert.deepEqual(q.states, {});
    const update = async (ids, state, message = '') => {
      const r = await fetch(new URL('/api/requests/status', editor.url), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: q.revision, ids, state, message, round: 'r1' }) });
      assert.equal(r.status, 200);
    };
    await update(['s01'], 'generating');
    await page.waitForSelector('.rq-sent.generating');
    assert.equal(await page.$$('.rq-sent.generating').then((x) => x.length), 1);
    const screenshot = path.join(root, '生成中.png');
    await page.screenshot({ path: screenshot });
    await update(['s01'], 'failed', '動畫檢查未通過');
    await page.waitForSelector('.rq-sent.failed');
    await update(['s01'], 'done', '已重做並通過 build、audit');
    await page.waitForSelector('.rq-item.done');
    assert.match(await page.$eval('.rq-item.done', (el) => el.textContent), /已重做並通過 build、audit/);
    // 改了需求後，舊批次的完成／生成狀態不再套到新需求。
    await page.evaluate(() => window.__editor.select({ kind: 'item', id: 's01' }));
    await page.waitForSelector('#rqNote');
    await page.type('#rqNote', '重新調整');
    await page.waitForFunction(() => document.querySelector('#rqState')?.textContent.includes('待改：已存進修改單'));
    assert.equal(await page.$$('.rq-item.done').then((x) => x.length), 0);
    // 029：勾了「重新設計」的段寫進修改單，複製的那一行寫明只有這幾段的子代理要載入 hyperframes skill
    assert.equal(await page.$eval('#rqTop [data-rq="redo"]', (el) => el.checked), false, '預設不勾');
    await page.click('#rqTop [data-rq="redo"]');
    await page.waitForSelector('.rq-item .chip-redo');
    await page.click('[data-rq="copy"]');
    await page.waitForFunction(() => /其中 1 段要重新設計（s01）：只有這幾段的子代理要載入 hyperframes skill、從空白畫布重畫；其他段在現有的動畫上改，不用載入。/.test(window.copiedRequest || ''));
    assert.match(fs.readFileSync(path.join(work, 'feedback/editor-requests.md'), 'utf8'), /## 1\. s01[\s\S]*- 做法：重新設計（使用者勾的）[\s\S]*## 2\. s02[\s\S]*- 做法：在現有的動畫上改/);
    // 剪貼簿失敗時，存檔成功也不能宣稱已複製。
    await page.evaluate(() => {
      navigator.clipboard.writeText = async () => { throw new Error('clipboard denied'); };
      document.execCommand = () => false;
    });
    await page.click('[data-rq="copy"]');
    await page.waitForFunction(() => [...document.querySelectorAll('.rq-sent')].every((el) => el.textContent === '已存檔'));
    assert.deepEqual(errors, []);
    console.log(`修改單 UI 截圖：${screenshot}`);
  } finally {
    await browser?.close();
    await editor.close();
  }
});
