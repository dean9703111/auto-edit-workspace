// 剪輯頁（瀏覽器）：長片找段：右側分頁（段落、字幕）、現在播到哪一段、網址跳段、沒有卡片的地方也能寫修改單
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { startEditor } from '../../shared/template/tools/editor.mjs';
import { findChrome } from '../../shared/template/tools/lib/audit-browser.mjs';
import { TEMPLATE } from './helpers.mjs';

let root, work, editor, browser, page;
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SEGS = [
  { id: 'c01', scene: 'chapter', at: '#1', slots: { num: '01', title: '第一章', sub: '開場' }, story: { say: '第一章開場' } },
  { id: 's0101', scene: 'concept', from: '#2', to: '#3e', slots: { text: '第一段' }, story: { say: '手機畫面太小看不清楚' } },
  { id: 'x0102', type: 'custom', template: 'x-callout', from: '#4', to: '#5e', slots: { title: '多機', items: [] }, story: { say: '多機拍攝的三個用途' } },
  { id: 's0103', scene: 'concept', from: '#8', to: '#9e', slots: { text: '第三段' }, story: { say: '最後一段的重點' } },
];
const srt = Array.from({ length: 10 }, (_, i) => `${i + 1}\n00:00:${String(i * 2 + 1).padStart(2, '0')},000 --> 00:00:${String(i * 2 + 2).padStart(2, '0')},800\n第 ${i + 1} 句字幕${i === 5 ? '手機' : ''}\n`).join('\n');

before(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-seg-ui-'));
  const project = path.join(root, 'projects', 'demo');
  work = path.join(project, 'work');
  fs.mkdirSync(path.join(work, 'hyperframes'), { recursive: true });
  fs.mkdirSync(path.join(root, 'shared'));
  fs.symlinkSync(TEMPLATE, path.join(root, 'shared', 'template'), 'dir');
  fs.writeFileSync(path.join(work, 'hyperframes', 'plan.json'), JSON.stringify({ version: 1, scenes: SEGS }));
  fs.writeFileSync(path.join(work, 'rough.srt'), srt);
  const media = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=navy:size=320x180:rate=30', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', '24', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', path.join(work, 'rough.mp4')]);
  assert.equal(media.status, 0, String(media.stderr));
  editor = await startEditor({ cwd: root, flags: { project, template: path.join(root, 'shared', 'template') }, port: 0, writeState: false });
  browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--no-first-run'] });
  page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument(() => { localStorage.setItem('auto-edit-editor.coach.v2', '1'); localStorage.setItem('auto-edit-editor.coach-final.v1', '1'); });
  await page.goto(editor.url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__editor?.itemsView?.length >= 4 && window.__editor.reportReady, { timeout: 60000 });
});
after(async () => { await browser?.close(); await editor?.close(); fs.rmSync(root, { recursive: true, force: true }); });

const side = (name) => page.click(`.side-tabs [data-side="${name}"]`);
const seek = (t) => page.evaluate((x) => window.__editor.seek(x), t);

test('段落分頁：照章分組、顯示摘要與時間；搜尋段號、文字、時間；點一段就跳過去', async () => {
  await side('segs');
  await page.waitForSelector('#segList .side-row');
  assert.equal(await page.$eval('#segCount', (n) => n.textContent), '4 段');
  assert.match(await page.$eval('#segList .side-ch', (n) => n.textContent), /第一章/);
  const row = await page.$eval('[data-seg="x0102"]', (n) => n.innerText.replace(/\s+/g, ' '));
  assert.match(row, /x0102 .*多機拍攝的三個用途/);
  assert.doesNotMatch(row, /\.html|custom/, '不是檔名');
  const search = async (q) => { await page.$eval('#segSearch', (i) => { i.value = ''; i.focus(); }); await page.keyboard.type(q); await sleep(60); return page.$$eval('#segList [data-seg]', (a) => a.map((x) => x.dataset.seg)); };
  assert.deepEqual(await search('x0102'), ['x0102']);
  assert.deepEqual(await search('手機畫面'), ['s0101']);
  assert.deepEqual(await search('手機'), ['s0101'], '字幕的字也找得到（第 6 句不在任何段就不算）');
  await page.$eval('#segSearch', (i) => { i.value = ''; i.dispatchEvent(new Event('input')); });
  await page.click('[data-seg="s0103"]');
  await page.waitForSelector('[data-seg="s0103"].sel');
  assert.equal(await page.evaluate(() => window.__editor.selection?.id), 's0103');
  assert.ok(await page.evaluate(() => { const it = window.__editor.itemsView.find((x) => x.id === 's0103'); return Math.abs(window.__editor.t - it.start) < 0.5; }));
  await page.click('[data-seg="s0103"] [data-seg-act="req"]');
  await page.waitForFunction(() => !document.querySelector('#requests').hidden);
  assert.match(await page.$eval('#rqTop', (n) => n.textContent), /s0103/);
  assert.equal(await page.$eval('#workspace', (n) => getComputedStyle(n).gridTemplateColumns.split(' ').length), 2, '修改單不會把預覽擠成三欄');
});

test('字幕分頁：全部列得出來、搜尋、點一句就能直接改字', async () => {
  await side('cues');
  await page.waitForSelector('#cueList .side-row');
  assert.equal(await page.$eval('#cueCount', (n) => n.textContent), '10 句');
  await page.type('#cueSearch', '手機');
  await sleep(60);
  assert.deepEqual(await page.$$eval('#cueList [data-cue]', (a) => a.map((x) => x.dataset.cue)), ['6']);
  await page.click('[data-cue="6"]');
  await page.waitForSelector('[data-cue="6"] .cue-edit');
  await page.waitForFunction(() => document.activeElement?.classList.contains('cue-edit'));
  await page.keyboard.type('改');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__editor.cues.find((c) => c.n === 6).text.endsWith('手機改'));
  assert.equal(await page.$eval('#saveState', (n) => n.dataset.state), 'dirty', '和別的編輯一樣要存檔');
  await page.$eval('#cueSearch', (i) => { i.value = ''; i.dispatchEvent(new Event('input')); });
  await page.keyboard.down('Meta'); await page.keyboard.press('z'); await page.keyboard.up('Meta');
  await page.waitForFunction(() => window.__editor.cues.find((c) => c.n === 6).text.endsWith('手機'));
});

test('現在這段：播放頭在哪就寫哪一段；沒有卡片的地方也能寫修改單', async () => {
  const it = await page.evaluate(() => window.__editor.itemsView.find((x) => x.id === 'x0102'));
  await seek(it.start + 0.3);
  await page.waitForFunction(() => document.querySelector('#nowBar .i')?.textContent === 'x0102');
  assert.match(await page.$eval('#nowBar', (n) => n.textContent), /多機拍攝的三個用途/);
  await page.click('#nowBar [data-now="req"]');
  await page.waitForFunction(() => !document.querySelector('#requests').hidden && /x0102/.test(document.querySelector('#rqTop').textContent));
  // 沒有卡片：#6、#7 這一段沒有任何卡片
  const gap = await page.evaluate(() => window.__editor.uncovered?.[0] || null);
  if (gap) {
    await seek(gap[0] + 0.1);
    await page.waitForSelector('#nowBar [data-now="gap"]');
    await page.click('#nowBar [data-now="gap"]');
    await page.waitForFunction(() => /這裡只有講者，想加畫面/.test(document.querySelector('#rqTop').textContent));
    await page.evaluate(() => [...document.querySelectorAll('#rqTop [data-rq="tag"]')].find((b) => /加一張字卡/.test(b.textContent)).click());
    await page.waitForFunction(() => document.querySelector('.rq-item')?.textContent.includes('加一張字卡'));
    const id = await page.$eval('#rqTop', (n) => n.dataset.id);
    assert.match(id, /^t\d+$/);
    const md = await page.evaluate(() => window.__editor.requests.map((r) => r.id).join());
    assert.ok(md.includes(id));
    await page.evaluate((x) => { window.__editor.requests = window.__editor.requests.filter((r) => r.id !== x); }, id);
  }
});

test('網址直接跳段：?seg= 與 ?t=；找不到的段會講；輸入段號也能跳', async () => {
  await page.goto(new URL('/?seg=s0103', editor.url).href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__editor?.selection?.id === 's0103', { timeout: 30000 });
  await page.goto(new URL('/?t=0:15', editor.url).href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Math.abs((window.__editor?.t ?? 0) - 15) < 0.5, { timeout: 30000 });
  await page.goto(new URL('/?seg=nope', editor.url).href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => /找不到 nope/.test(document.querySelector('#toasts').textContent), { timeout: 30000 });
  await page.waitForFunction(() => window.__editor?.itemsView?.length >= 4);
  await page.click('#tc');
  await page.keyboard.type('x0102');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__editor.selection?.id === 'x0102');
  // 上一段／下一段
  await page.keyboard.press(']');
  await page.waitForFunction(() => window.__editor.selection?.id === 's0103');
  await page.keyboard.press('[');
  await page.waitForFunction(() => window.__editor.selection?.id === 'x0102');
  assert.deepEqual(errors, []);
});

test('模板動畫：屬性面板可以改畫面上的字，圖示和時間不出現；存檔後寫回 plan.json、結構不動；名稱是白話', async () => {
  const plan = path.join(work, 'hyperframes', 'plan.json');
  fs.writeFileSync(plan, JSON.stringify({ version: 1, scenes: [
    ...SEGS.filter((s) => s.id !== 'x0102'),
    { id: 'x0102', type: 'custom', template: 'x-callout', from: '#4', to: '#5e', slots: { title: '多機', obj: 'camera', items: [{ text: '橫拍', icon: 'monitor', at: '#4@第' }, { text: '直拍', icon: 'smartphone', at: '#5@第' }] }, story: { say: '多機拍攝的三個用途' } },
    { id: 'd0104', type: 'custom', design: true, from: '#6', to: '#7e', story: { say: '手機畫面太小' } },
  ] }));
  await page.goto(editor.url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__editor?.scenes?.some((s) => s.id === 'd0104'), { timeout: 30000 });
  await page.evaluate(() => { window.__editor.select({ kind: 'item', id: 'x0102' }); });
  await page.click('.side-tabs [data-side="insp"]');
  await page.waitForSelector('#inspBody [data-path]');
  assert.match(await page.$eval('#inspKind', (n) => n.textContent), /模板動畫：主體四周貼標籤/);
  assert.match(await page.$eval('#inspTitle', (n) => n.textContent), /x0102　多機拍攝的三個用途/);
  const fields = await page.$$eval('#inspBody [data-path]', (a) => a.map((i) => [JSON.parse(i.dataset.path).join('.'), i.value]));
  assert.deepEqual(fields, [['slots.title', '多機'], ['slots.items.0.text', '橫拍'], ['slots.items.1.text', '直拍']]);
  assert.doesNotMatch(await page.$eval('#inspBody', (n) => n.innerText), /monitor|#4@|plan\.json|\.html/);
  await page.click('#inspBody [data-path=\'["slots","items",0,"text"]\']');
  await page.keyboard.press('End');
  await page.keyboard.type('片');
  await sleep(100);
  await page.evaluate(() => window.__editor.save?.());
  await page.keyboard.down('Meta'); await page.keyboard.press('s'); await page.keyboard.up('Meta');
  const until = Date.now() + 15000;
  let saved;
  while (Date.now() < until) { saved = JSON.parse(fs.readFileSync(plan, 'utf8')).scenes.find((s) => s.id === 'x0102'); if (saved.slots.items[0].text === '橫拍片') break; await sleep(200); }
  assert.deepEqual(saved.slots, { title: '多機', obj: 'camera', items: [{ text: '橫拍片', icon: 'monitor', at: '#4@第' }, { text: '直拍', icon: 'smartphone', at: '#5@第' }] });
  // 內容設計動畫：不能直接改
  await page.waitForFunction(() => document.querySelector('#saveState').dataset.state === 'saved', { timeout: 20000 });
  await page.evaluate(() => window.__editor.select({ kind: 'item', id: 'd0104' }));
  await page.waitForFunction(() => /內容設計動畫/.test(document.querySelector('#inspKind').textContent));
  assert.match(await page.$eval('#inspBody', (n) => n.innerText), /字畫在動畫裡，要改請寫進修改單/);
  fs.writeFileSync(plan, JSON.stringify({ version: 1, scenes: SEGS }));
});

test('錄影段：列出標註、點了跳時間；修改單有太快、太慢', async () => {
  const plan = path.join(work, 'hyperframes', 'plan.json');
  const screen = path.join(work, '..', 'assets', 'screen');
  fs.mkdirSync(screen, { recursive: true });
  fs.copyFileSync(path.join(work, 'rough.mp4'), path.join(screen, 'demo.mp4'));
  fs.writeFileSync(plan, JSON.stringify({ version: 1, scenes: [
    { id: 'm0101', type: 'media', src: 'assets/screen/demo.mp4', from: '#2', to: '#6e', marks: [{ at: '+1', until: '+3', box: [1, 2, 300, 400] }], callouts: [{ at: '#4', until: '#4e', text: '按這裡開始', box: [1, 2, 300, 80] }], moves: [{ at: '#3', box: [0, 0, 960, 540] }], story: { say: '打開設定頁' } },
  ] }));
  await page.goto(editor.url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__editor?.scenes?.some((s) => s.id === 'm0101') && window.__editor.itemsView.some((x) => x.id === 'm0101'), { timeout: 30000 });
  await page.evaluate(() => window.__editor.select({ kind: 'media', id: 'm0101' }));
  await page.click('.side-tabs [data-side="insp"]');
  await page.waitForSelector('.note-list button');
  const notes = await page.$$eval('.note-list button', (a) => a.map((b) => b.textContent.replace(/\s+/g, ' ').trim()));
  assert.equal(notes.length, 3);
  assert.ok(notes.some((n) => /紅框/.test(n)) && notes.some((n) => /說明卡：按這裡開始/.test(n)) && notes.some((n) => /運鏡/.test(n)), notes.join(' / '));
  const t = await page.$eval('.note-list button', (b) => Number(b.dataset.t));
  await page.click('.note-list button');
  await page.waitForFunction((x) => Math.abs(window.__editor.t - x) < 0.5, {}, t);
  await page.click('.side-tabs [data-side="rq"]');
  await page.waitForSelector('#rqTop [data-rq="tag"]');
  const tags = await page.$$eval('#rqTop [data-rq="tag"]', (a) => a.map((b) => b.textContent));
  assert.ok(tags.includes('播太快') && tags.includes('播太慢'), tags.join());
  fs.writeFileSync(plan, JSON.stringify({ version: 1, scenes: SEGS }));
  assert.deepEqual(errors, []);
});

test('存檔：不用等檢查（頁面馬上可以繼續改）；存完還能復原、重做，復原後是沒存的狀態，再存就寫回去', async () => {
  const plan = path.join(work, 'hyperframes', 'plan.json');
  await page.goto(editor.url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__editor?.itemsView?.length >= 3 && window.__editor.reportReady, { timeout: 30000 });
  const srtFile = path.join(work, 'rough.srt');
  const editCue = (n, text) => page.evaluate((a, b) => {
    window.__editor.select({ kind: 'cue', id: a });
    const t = document.querySelector('#capText');
    t.focus(); t.value = b; t.dispatchEvent(new Event('input', { bubbles: true })); t.dispatchEvent(new Event('change', { bubbles: true })); t.blur();
  }, n, text);
  const state = () => page.evaluate(() => ({ save: document.querySelector('#saveState').dataset.state, undo: !document.querySelector('#btnUndo').disabled, redo: !document.querySelector('#btnRedo').disabled, text: window.__editor.cues.find((c) => c.n === 2).text }));
  const original = (await state()).text;
  await editCue(2, '第二句改過');
  await page.waitForFunction(() => document.querySelector('#saveState').dataset.state === 'dirty');
  const t0 = Date.now();
  await page.keyboard.down('Meta'); await page.keyboard.press('s'); await page.keyboard.up('Meta');
  await page.waitForFunction(() => document.querySelector('#saveState').dataset.state === 'saved', { timeout: 15000 });
  assert.ok(Date.now() - t0 < 3000, `存檔要很快回來，花了 ${Date.now() - t0} ms`);
  assert.match(fs.readFileSync(srtFile, 'utf8'), /第二句改過/);
  let s = await state();
  assert.equal(s.undo, true, '存完還能復原');
  // 復原：回到舊字、變成沒存；再存就寫回檔案
  await page.click('#btnUndo');
  await page.waitForFunction((x) => window.__editor.cues.find((c) => c.n === 2).text === x, {}, original);
  s = await state();
  assert.equal(s.save, 'dirty');
  assert.equal(s.redo, true);
  await page.click('#btnRedo');
  await page.waitForFunction(() => window.__editor.cues.find((c) => c.n === 2).text === '第二句改過');
  assert.equal((await state()).save, 'saved', '重做回到存檔的樣子＝沒有修改');
  await page.click('#btnUndo');
  await page.waitForFunction(() => document.querySelector('#saveState').dataset.state === 'dirty');
  await page.keyboard.down('Meta'); await page.keyboard.press('s'); await page.keyboard.up('Meta');
  await page.waitForFunction(() => document.querySelector('#saveState').dataset.state === 'saved', { timeout: 15000 });
  const until = Date.now() + 5000;
  while (Date.now() < until && /第二句改過/.test(fs.readFileSync(srtFile, 'utf8'))) await sleep(100);
  assert.doesNotMatch(fs.readFileSync(srtFile, 'utf8'), /第二句改過/);
  assert.ok(JSON.parse(fs.readFileSync(plan, 'utf8')).scenes.length >= 3);
  // 背景檢查跑完不會蓋掉正在改的東西
  await page.waitForFunction(() => !window.__editor.checking, { timeout: 30000 });
  assert.deepEqual(errors, []);
});

test('小視窗：不用捲整頁，影片、播放控制、時間軸都在視窗裡；窄視窗右側面板變抽屜，收得起來', async () => {
  await page.goto(editor.url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__editor?.itemsView?.length >= 3, { timeout: 30000 });
  for (const [w, h] of [[1920, 1080], [1440, 900], [1440, 790], [1366, 650], [1280, 700], [1100, 700], [1000, 800], [860, 700], [720, 800]]) {
    await page.setViewport({ width: w, height: h });
    await sleep(300);
    const m = await page.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      const inside = (s) => { const x = r(s); return x.top >= 0 && x.bottom <= innerHeight + 0.5 && x.left >= 0 && x.right <= innerWidth + 0.5 && x.height > 0; };
      return { scrollH: document.documentElement.scrollHeight, inner: innerHeight, overX: document.documentElement.scrollWidth - innerWidth, stage: inside('#stageBox'), stageH: r('#stageBox').height, play: inside('#btnPlay'), tc: inside('#tc'), tl: inside('#tl'), status: inside('.statusbar'), save: inside('#btnSave'), exp: inside('#btnExport') };
    });
    assert.equal(m.scrollH, m.inner, `${w}×${h} 不能變成整頁捲動`);
    assert.equal(m.overX, 0, `${w}×${h} 不能左右捲`);
    for (const k of ['stage', 'play', 'tc', 'tl', 'status', 'save', 'exp']) assert.equal(m[k], true, `${w}×${h} 的 ${k} 要在視窗裡`);
    assert.ok(m.stageH >= 130, `${w}×${h} 影片太小（${m.stageH}px）`);
  }
  // 720 寬：右側面板收起來，要看才打開；可以收回去
  await page.setViewport({ width: 720, height: 800 });
  await sleep(250);
  const left = () => page.$eval('#inspector', (n) => n.getBoundingClientRect().left);
  assert.ok(await left() >= 720, '預設收起來');
  await page.click('#btnSide');
  await sleep(250);
  assert.ok(await left() < 720, '打開');
  await page.click('.side-tabs [data-side="segs"]');
  await page.waitForSelector('#segList .side-row');
  const row = await page.$eval('#segList .side-row .x', (n) => n.getBoundingClientRect().width);
  assert.ok(row > 150, `段落的文字要讀得到（${row}px）`);
  await page.click('#btnSideClose');
  await sleep(250);
  assert.ok(await left() >= 720, '收回去');
  // 修改單的按鈕會自己打開抽屜
  await page.click('#btnRequests');
  await sleep(250);
  assert.ok(await left() < 720);
  await page.click('#btnSideClose');
  await page.setViewport({ width: 1440, height: 900 });
  assert.deepEqual(errors, []);
});
