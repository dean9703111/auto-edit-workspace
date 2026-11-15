// 切換影片的選單（039、044）在頁面上：只開一個時專案名稱只是字；開第二個後專案名稱變成切換鈕，點了展開自己畫的選單；
// 滑鼠、鍵盤都能選，選了到那個專案的同一頁（seg、t、# 不帶過去）；清單沒變不重畫；按鍵不會漏到剪輯台的快捷鍵；關到剩一個變回字。
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

test('切換影片：一個時是字、兩個時是切換鈕；展開、鍵盤、點外面收起；選了到另一支的同一頁；清單沒變不重畫；剩一個變回字', { timeout: 120000 }, async (t) => {
  const root = tmpDir(t, 'editor-switch-ui-');
  fs.mkdirSync(path.join(root, 'shared'));
  fs.symlinkSync(TEMPLATE, path.join(root, 'shared', 'template'), 'dir');
  const media = path.join(root, 'rough.mp4');
  const made = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=navy:size=320x180:rate=30', '-t', '9', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', media]);
  assert.equal(made.status, 0, String(made.stderr));
  const editors = [];
  t.after(() => Promise.all(editors.map((ed) => ed.close())));
  const start = async (name) => {
    const project = path.join(root, 'projects', name), work = path.join(project, 'work');
    fs.mkdirSync(path.join(work, 'hyperframes'), { recursive: true });
    fs.writeFileSync(path.join(work, 'hyperframes', 'plan.json'), '{\n  "version": 1\n}\n');
    fs.writeFileSync(path.join(work, 'rough.srt'), [1, 2, 3, 4].map((n) => `${n}\n00:00:0${(n - 1) * 2},500 --> 00:00:0${n * 2},000\n第${n}段字幕\n`).join('\n'));
    fs.copyFileSync(media, path.join(work, 'rough.mp4'));
    const ed = await startEditor({ cwd: root, flags: { project, template: path.join(root, 'shared', 'template') }, port: 0 });
    editors.push(ed);
    return ed;
  };
  const a = await start('alpha');

  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--no-first-run'] });
  t.after(() => browser.close());
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewport({ width: 1280, height: 800 });
  await page.evaluateOnNewDocument(() => { for (const k of ['coach.v2', 'coach-final.v1', 'coach-rough.v1']) localStorage.setItem(`auto-edit-editor.${k}`, '1'); });
  const listed = () => page.waitForResponse((r) => new URL(r.url()).pathname === '/api/editors');
  const refocus = async () => { const got = listed(); await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await got; await page.evaluate(() => new Promise((r) => setTimeout(r, 50))); };
  const name = () => page.$eval('#projName', (n) => ({ text: n.textContent, cls: n.className, role: n.getAttribute('role'), tab: n.getAttribute('tabindex'), popup: n.getAttribute('aria-haspopup'), expanded: n.getAttribute('aria-expanded'), controls: n.getAttribute('aria-controls'), wrap: n.closest('.topbar').classList.contains('has-switch') }));
  const plain = { text: 'alpha', cls: 'sub', role: null, tab: null, popup: null, expanded: null, controls: null, wrap: false };
  const menuOpen = () => page.evaluate(() => { const m = document.getElementById('projMenu'); return !!m && !m.hidden; });
  const opts = () => page.$$eval('#projList [role="option"]', (list) => list.map((o) => [o.querySelector('.nm').textContent, o.getAttribute('aria-selected'), o.querySelector('.ck').textContent]));
  const focused = () => page.evaluate(() => { const el = document.activeElement; return el.id === 'projName' ? '切換鈕' : el.classList.contains('proj-opt') ? el.querySelector('.nm').textContent : el.tagName; });

  // 只開一個：專案名稱只是字，沒有選單
  let got = listed();
  await page.goto(a.url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__editor?.started, { timeout: 60000 });
  await got;
  assert.deepEqual(await name(), plain);
  assert.equal(await page.$('#projMenu'), null);

  // 開第二個：回到視窗就更新，專案名稱變成切換鈕（字還是各頁自己寫的那一行），選單收著
  const b = await start('beta');
  await refocus();
  assert.deepEqual(await name(), { text: 'alpha', cls: 'sub proj-switch', role: 'button', tab: '0', popup: 'listbox', expanded: 'false', controls: 'projList', wrap: true });
  assert.equal(await menuOpen(), false);
  assert.equal(await page.$eval('#projList', (l) => `${l.getAttribute('role')}／${l.getAttribute('aria-label')}`), 'listbox／切換影片');

  // 點專案名稱展開：一列一支，這一支有勾
  await page.click('#projName');
  assert.equal(await menuOpen(), true);
  assert.equal((await name()).expanded, 'true');
  assert.deepEqual(await opts(), [['alpha', 'true', '✓'], ['beta', 'false', '']]);
  // 選單在視窗裡、蓋在頁面內容上面
  const box = await page.$eval('#projMenu', (m) => { const r = m.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.bottom - 12); return { left: r.left, right: r.right, bottom: r.bottom, onTop: m.contains(top) }; });
  assert.ok(box.left >= 0 && box.right <= 1280 && box.bottom <= 800 && box.onTop, JSON.stringify(box));

  // 清單沒變：重新問一次不重畫，選單照樣開著
  await page.$eval('#projList [role="option"]', (o) => { o.dataset.same = '1'; });
  await refocus();
  assert.equal(await menuOpen(), true);
  assert.equal(await page.$eval('#projList [role="option"]', (o) => o.dataset.same), '1');

  // 點外面收起來；再點專案名稱開、再點一次收；點這一支只收起來。滑鼠收起來的不留焦點（之後按空白鍵照舊是播放，不會又打開選單）
  await page.mouse.click(900, 600);
  assert.equal(await menuOpen(), false);
  assert.equal((await name()).expanded, 'false');
  await page.click('#projName');
  await page.click('#projName');
  assert.equal(await menuOpen(), false);
  assert.equal(await focused(), 'BODY');
  await page.click('#projName');
  await page.click('#projList [role="option"][aria-selected="true"]');
  assert.equal(await menuOpen(), false);
  assert.equal(await focused(), 'BODY');
  assert.equal(new URL(page.url()).port, String(a.port), '選這一支不換頁');

  // 鍵盤：Enter 展開（焦點在這一支）、上下鍵移動（到頭就停）、Esc 收起來回到切換鈕；空白也能開，在這一支上按空白只收起來。
  // 這些按鍵都不會傳到剪輯台的快捷鍵（空白＝播放、上下鍵＝跳剪接點）
  await page.evaluate(() => { window.__leaked = []; document.addEventListener('keydown', (e) => window.__leaked.push(e.key)); });
  await page.focus('#projName');
  await page.keyboard.press('Enter');
  assert.equal(await menuOpen(), true);
  assert.equal(await focused(), 'alpha');
  await page.keyboard.press('ArrowDown');
  assert.equal(await focused(), 'beta');
  await page.keyboard.press('ArrowDown');
  assert.equal(await focused(), 'beta');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  assert.equal(await focused(), 'alpha');
  await page.keyboard.press('End');
  assert.equal(await focused(), 'beta');
  await page.keyboard.press('Home');
  await page.keyboard.press('j');   // 選單開著時，別的按鍵也不會變成剪輯台的快捷鍵
  await page.keyboard.press('Escape');
  assert.equal(await menuOpen(), false);
  assert.equal(await focused(), '切換鈕');
  await page.keyboard.press('Space');
  assert.equal(await menuOpen(), true);
  await page.keyboard.press('Space');
  assert.equal(await menuOpen(), false);
  assert.equal(await focused(), '切換鈕');
  assert.equal(new URL(page.url()).port, String(a.port), '選這一支不換頁');
  // Tab：收起來，焦點從切換鈕往下一個走
  await page.keyboard.press('Enter');
  assert.equal(await focused(), 'alpha');
  await page.keyboard.press('Tab');
  assert.equal(await menuOpen(), false);
  assert.equal(await page.evaluate(() => { const el = document.activeElement; return el !== document.body && el.id !== 'projName' && !el.closest('#projMenu'); }), true, '焦點到了切換鈕後面的東西');
  assert.deepEqual(await page.evaluate(() => window.__leaked), []);

  // 鍵盤選另一支：到它的同一頁、同一個檢視，seg、t、# 不帶過去
  await page.goto(new URL('/?view=sim&seg=x0410&t=3#here', a.url).href, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#projName.proj-switch');
  await page.focus('#projName');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  assert.equal(await focused(), 'beta');
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.keyboard.press('Enter')]);
  assert.equal(page.url(), new URL('/?view=sim', b.url).href);
  await page.waitForSelector('#projName.proj-switch');
  await page.waitForFunction(() => document.getElementById('projName').textContent === 'beta');
  await page.click('#projName');
  assert.deepEqual(await opts(), [['alpha', 'false', ''], ['beta', 'true', '✓']]);
  await page.keyboard.press('Escape');

  // 別頁也一樣；滑鼠點另一支
  await page.goto(new URL('/storyboard.html#sec-s05', b.url).href, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#projName.proj-switch');
  await page.click('#projName');
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#projList [role="option"][aria-selected="false"]')]);
  assert.equal(page.url(), new URL('/storyboard.html', a.url).href);
  await page.waitForSelector('#projName.proj-switch');

  // 讀不到清單（這個剪輯台關了）：留著上一次的樣子，還能切到別支
  await page.setRequestInterception(true);
  let down = true;
  page.on('request', (req) => (down && new URL(req.url()).pathname === '/api/editors' ? req.abort() : req.continue()));
  const failed = new Promise((resolve) => page.once('requestfailed', resolve));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await failed;
  await page.evaluate(() => new Promise((r) => setTimeout(r, 50)));
  assert.equal((await name()).cls, 'sub proj-switch');
  down = false;

  // 另一支關掉、只剩這一個：選單開著也收掉，專案名稱變回字
  await page.click('#projName');
  assert.equal(await menuOpen(), true);
  await b.close();
  await refocus();
  assert.deepEqual(await name(), { ...plain, text: await page.$eval('#projName', (n) => n.textContent) });
  assert.equal(await page.$('#projMenu'), null);

  assert.deepEqual(errors, []);
});
