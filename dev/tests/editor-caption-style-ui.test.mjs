// 035 字幕樣式：剪輯台「整支 → 字幕」調樣式、字體、大小、粗細、上下位置（預覽畫面上直接拖），快速預覽馬上變，存進 plan.json captionStyle；
// 勾「之後的影片也用這個」同時寫 shared/setting.json 的 captions，位置橫式、直式分開記（測試指到暫存的 shared/template，不動真的設定）
import { test as nodeTest } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { startEditor } from '../../shared/template/tools/editor.mjs';
import { findChrome } from '../../shared/template/tools/lib/audit-browser.mjs';
import { TEMPLATE, missingTools, skipAll, tmpDir } from './helpers.mjs';

const noUi = await missingTools('chrome', 'ffmpeg', 'puppeteer');
const test = skipAll(nodeTest, noUi);
const puppeteer = noUi ? null : (await import('puppeteer-core')).default;

test('字幕樣式 UI：五種樣式、字體（沒有的粗細灰掉）、大小、拖上下；快速預覽的字幕圖層跟著變；存 plan.json，勾選時寫預設（位置只記這個版式）', { timeout: 120000 }, async (t) => {
  const root = tmpDir(t, 'editor-capstyle-ui-');
  const project = path.join(root, 'projects/example'), work = path.join(project, 'work');
  fs.mkdirSync(path.join(work, 'hyperframes'), { recursive: true });
  fs.mkdirSync(path.join(root, 'shared'));
  fs.symlinkSync(TEMPLATE, path.join(root, 'shared/template'), 'dir');
  // 設定寫在暫存的 shared（ctx.speakerTemplate 的上一層）；已經記了直式的位置，改橫式不能動到它
  const fake = path.join(root, 'fake/shared/template');
  fs.mkdirSync(fake, { recursive: true });
  const planFile = path.join(work, 'hyperframes/plan.json'), settingFile = path.join(root, 'fake/shared/setting.json');
  fs.writeFileSync(settingFile, JSON.stringify({ captions: { lift: { portrait: 80 } } }, null, 2));
  fs.writeFileSync(planFile, JSON.stringify({ version: 1, scenes: [{ id: 's01', scene: 'concept', from: '#1', to: '#1e', slots: { text: '第一段' } }] }, null, 2));
  fs.writeFileSync(path.join(work, 'rough.srt'), '1\n00:00:00,500 --> 00:00:02,500\n第一段字幕\n\n2\n00:00:03,000 --> 00:00:05,000\n第二段字幕\n');
  const media = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=navy:size=320x180:rate=30', '-t', '6', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(work, 'rough.mp4')]);
  assert.equal(media.status, 0, String(media.stderr));
  const editor = await startEditor({ cwd: root, flags: { project, template: path.join(root, 'shared/template') }, port: 0, writeState: false, speakerTemplate: fake });
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: findChrome(), headless: true });
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewport({ width: 1800, height: 1000 });
    await page.goto(editor.url);
    await page.waitForFunction(() => window.__editor?.server);
    await page.evaluate(() => { document.querySelector('#coach').hidden = true; });
    const lib = await (await fetch(new URL('/lib/caption-style.mjs', editor.url))).text();
    assert.match(lib, /export function captionGeom/, '頁面和 build 用同一支 lib/caption-style.mjs');
    assert.doesNotMatch(lib, /from 'node:/, '這一支不能 import node 模組（頁面也要載）');
    const openCaps = async () => {
      await page.waitForSelector('[data-ipfold="caps"]');
      await page.evaluate(() => { const d = document.querySelector('[data-ipfold="caps"]'); if (!d.open) d.querySelector('summary').click(); });
      await page.waitForSelector('[data-act="capLook"][data-v="outline"]', { visible: true });
    };
    await openCaps();
    const layer = () => page.$eval('#simCapLayer', (L) => ({ cap: L.dataset.cap ?? null, size: L.style.getPropertyValue('--cap-size'), family: L.style.getPropertyValue('--cap-family'), bottom: document.querySelector('#simCaption').style.bottom }));
    assert.deepEqual(await layer(), { cap: null, size: '', family: '', bottom: '6px' }, '沒設定＝原本的 F8，不帶 data-cap（只記了直式的位置，橫式照原位）');
    await page.click('[data-act="capLook"][data-v="outline"]');
    await page.waitForFunction(() => document.querySelector('#simCapLayer').dataset.cap === 'outline');
    assert.equal((await layer()).size, '76px');
    // 字體：粉圓（kit/fonts 裡就有）→ 變數換家族名；粉圓只有一般，特粗灰掉
    await openCaps();
    await page.$eval('[data-f="capFont"]', (s) => { s.value = 'huninn'; s.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForFunction(() => document.querySelector('#simCapLayer').style.getPropertyValue('--cap-family').includes('Huninn'));
    await openCaps();
    assert.equal(await page.$eval('[data-act="capWeight"][data-v="900"]', (b) => b.classList.contains('is-disabled')), true);
    assert.match(await page.$eval('#capFace', (s) => s.textContent), /font-family: "Huninn"; src: url\("\/kit\/fonts\/Huninn-Regular\.ttf"\)/);
    // 自動存檔：plan.json 第一層 captionStyle；預設（勾著）寫進暫存的 shared/setting.json
    const planCap = () => JSON.parse(fs.readFileSync(planFile, 'utf8')).captionStyle;
    const settingCap = () => (fs.existsSync(settingFile) ? JSON.parse(fs.readFileSync(settingFile, 'utf8')).captions : undefined);
    const until = async (fn, what) => { for (let i = 0; i < 60; i++) { if (fn()) return; await new Promise((r) => setTimeout(r, 100)); } assert.fail(what); };
    await until(() => planCap()?.font === 'huninn', `plan.json 沒存到 captionStyle：${JSON.stringify(planCap())}`);
    assert.deepEqual(planCap(), { look: 'outline', font: 'huninn', size: 76, weight: 400, lift: 0 });
    await until(() => settingCap()?.font === 'huninn', `預設沒寫進 setting.json：${JSON.stringify(settingCap())}`);
    assert.deepEqual(settingCap(), { look: 'outline', font: 'huninn', lift: { portrait: 80 } }, '預設只存和原本不一樣的欄位；直式的位置留著');
    // 上下位置：在預覽畫面上把字幕往上拖 60 px（螢幕 px × 畫布高 ÷ 預覽框高，2 px 一格）；放開存這一集，預設只記橫式、直式的留著
    const at = await page.$eval('#capDrag', (el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, scale: 1080 / document.querySelector('#stageBox').clientHeight }; });
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x, at.y - 30, { steps: 4 });
    await page.mouse.move(at.x, at.y - 60, { steps: 4 });
    await page.mouse.up();
    await until(() => planCap()?.lift > 0, `拖完沒存位置：${JSON.stringify(planCap())}`);
    const lift = planCap().lift;
    assert.ok(Math.abs(lift - 60 * at.scale) <= 3 && lift % 2 === 0, `拖 60 px（×${at.scale.toFixed(2)}）存成 ${lift}`);
    assert.equal(await page.$eval('#simCaption', (c) => c.style.bottom), `${6 + lift}px`);
    assert.equal(await page.$eval('#capDrag', (el) => el.textContent), `字幕往上 ${lift} px（橫式）`);
    await until(() => settingCap()?.lift?.landscape === lift, `預設沒記橫式的位置：${JSON.stringify(settingCap())}`);
    assert.deepEqual(settingCap(), { look: 'outline', font: 'huninn', lift: { portrait: 80, landscape: lift } });
    // 方向鍵微調（拖的時候字幕框已經有焦點）：↑ 一次 2 px、Shift+↓ 一次 10 px
    await page.keyboard.press('ArrowUp');
    await until(() => planCap()?.lift === lift + 2, `↑ 沒有往上 2 px：${JSON.stringify(planCap())}`);
    await page.keyboard.down('Shift');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.up('Shift');
    await until(() => planCap()?.lift === lift - 8, `Shift+↓ 沒有往下 10 px：${JSON.stringify(planCap())}`);
    await until(() => settingCap()?.lift?.landscape === lift - 8, `預設沒跟著微調：${JSON.stringify(settingCap())}`);
    const drag = { setting: settingCap() };
    // 取消勾選後再改大小：這一集變、預設不變
    await openCaps();
    await page.click('[data-f="capDefault"]');
    await page.$eval('[data-f="capSize"]', (r) => { r.value = '88'; r.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForFunction(() => document.querySelector('#simCapLayer').style.getPropertyValue('--cap-size') === '88px');
    await until(() => planCap()?.size === 88, `大小沒存：${JSON.stringify(planCap())}`);
    await new Promise((r) => setTimeout(r, 900));
    assert.deepEqual(settingCap(), drag.setting);
    // 雙擊字幕框：回到原位（沒勾預設，setting.json 不動）
    await page.click('#capDrag', { count: 2 });
    await until(() => planCap()?.lift === 0, `雙擊沒回原位：${JSON.stringify(planCap())}`);
    assert.equal(await page.$eval('#simCaption', (c) => c.style.bottom), '6px');
    // 回到原本：這一集明寫 F8（預設是白字黑框也不會套到這一集）
    await openCaps();
    await page.click('[data-act="capReset"]');
    await page.waitForFunction(() => !document.querySelector('#simCapLayer').dataset.cap);
    await until(() => planCap()?.look === 'box', `回到原本沒存：${JSON.stringify(planCap())}`);
    assert.deepEqual(planCap(), { look: 'box', font: 'noto-sans', size: 76, weight: 400, lift: 0 });
    assert.equal(await page.$eval('#simCaption', (c) => c.style.bottom), '6px');
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await editor.close();
  }
});
