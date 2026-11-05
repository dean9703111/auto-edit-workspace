// 構圖存檔 → 自動產生底片 → 已開啟的剪輯同步（含未儲存的調整）。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { TEMPLATE, TOOLS, imp, hasChrome } from './helpers.mjs';

const { startEditor } = await imp('editor.mjs');
let root, project, out, planFile, editor;
const readPlan = () => JSON.parse(fs.readFileSync(planFile, 'utf8'));
const get = async (route) => (await fetch(new URL(route, editor.url))).json();
const save = async (body) => {
  const r = await fetch(new URL('/api/save', editor.url), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal(r.status, 200, await r.clone().text());
  return r.json();
};
const waitForUpdate = async () => {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const v = await get('/api/version');
    if (!v.framingUpdate?.running) return v;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.fail('構圖預覽更新超過 60 秒');
};

before(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-editor-framing-'));
  fs.mkdirSync(path.join(root, 'shared'), { recursive: true });
  fs.symlinkSync(TEMPLATE, path.join(root, 'shared', 'template'), 'dir');
  project = path.join(root, 'projects', 'sync');
  out = path.join(project, 'work', 'hyperframes');
  fs.mkdirSync(out, { recursive: true });
  planFile = path.join(out, 'plan.json');
  fs.writeFileSync(planFile, JSON.stringify({ version: 1, look: false, rhythm: 'spaced', scenes: [] }));
  fs.writeFileSync(path.join(project, 'work', 'rough.srt'), '1\n00:00:00,100 --> 00:00:01,900\n構圖同步測試\n');
  const video = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30', '-t', '2', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', path.join(project, 'work', 'rough.mp4')]);
  assert.equal(video.status, 0, String(video.stderr));
  const previewDir = path.join(root, 'preview');
  fs.mkdirSync(previewDir);
  editor = await startEditor({ flags: { project, template: TEMPLATE }, cwd: root, port: 0, writeState: false, previewDir });
});

test('構圖下方直接預覽動畫：未儲存的框即時更新，橫直式版型與唯讀路由', { timeout: 90000 }, async (t) => {
  const chrome = await hasChrome();
  if (!chrome) { t.skip('找不到現有 Chrome'); return; }
  const original = fs.readFileSync(planFile, 'utf8');
  const { default: puppeteer } = await import('puppeteer-core');
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true });
  try {
    const page = await browser.newPage();
    let oldBackend = true;
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (oldBackend && new URL(req.url()).pathname === '/api/design') req.respond({ status: 404, contentType: 'text/plain; charset=utf-8', body: '找不到這個頁面' });
      else req.continue();
    });
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(new URL('/framing', editor.url).href);
    await page.waitForSelector('#main:not([hidden])');
    await page.waitForFunction(() => document.querySelector('#designError').textContent.includes('剪輯服務仍是舊版'));
    await page.$eval('#zoom', (el) => { el.value = '1.3'; el.dispatchEvent(new Event('input')); });
    oldBackend = false;
    await page.click('#retryDesign');
    await page.waitForSelector('#designPreviews iframe');
    assert.equal(await page.$eval('#zoom', (el) => el.value), '1.3', '重新連接不丟失未儲存的構圖');
    assert.equal(await page.$eval('#designError', (el) => el.textContent), '');
    assert.equal(await page.$eval('#retryDesign', (el) => el.hidden), true);
    assert.deepEqual(pageErrors, [], '舊版純文字 404 不可變成 JSON 解析錯誤');
    const preview = await page.$('#designPreviews iframe[src*="03-side-panel"]');
    await preview.scrollIntoView();
    const demo = await preview.contentFrame();
    await demo.waitForFunction(() => document.querySelector('#footage img')?.src.startsWith('data:image/jpeg;base64,'));
    assert.equal(fs.readFileSync(planFile, 'utf8'), original, '即時預覽不儲存構圖');
    const count = (await browser.pages()).length;
    await page.click('#designPreviews .design-preview-stage button');
    await page.waitForSelector('#designDialog[open]');
    assert.equal((await browser.pages()).length, count, '放大動畫也留在同一頁');
    await page.click('#closeDesignDialog');
    assert.equal(await page.$eval('#zoom', (el) => el.value), '1.3');
    await page.screenshot({ path: path.join(root, '同頁動畫預覽.png') });
    fs.writeFileSync(planFile, JSON.stringify({ ...readPlan(), format: 'portrait' }));
    const portraitPage = await browser.newPage();
    await portraitPage.goto(new URL('/framing', editor.url).href);
    await portraitPage.waitForSelector('#designPreviews iframe');
    assert.equal(await portraitPage.$$eval('#designPreviews iframe', (frames) => frames.every((f) => /-v\.html(?:\?|$)/.test(f.getAttribute('src')))), true);
    for (const route of ['/gallery/tools/editor.mjs', '/gallery/USAGE.md', '/design/draft/../../AGENTS.md']) assert.equal((await fetch(new URL(route, editor.url))).status, 404);
    t.diagnostic(`同頁動畫預覽：${root}/同頁動畫預覽.png`);
  } finally { fs.writeFileSync(planFile, original); await browser.close(); }
});
after(async () => { await editor?.ctx.framingJob; await editor?.close(); });

test('構圖：沒有完成影片只存設定；已有完成影片自動更新；連續儲存採最後一個框；不變、衝突和錯誤皆保留正確狀態', async () => {
  let state = await get('/api/state');
  const first = await save({ base: { hash: state.plan.hash }, frame: [160, 90, 1600, 900] });
  assert.equal(first.framingUpdate.running, false, '分鏡前不產生完成影片');
  assert.equal(fs.existsSync(path.join(out, 'index.html')), false);
  // 產生初始完成影片，後續僅按構圖儲存，不再呼叫 /api/build。
  const built = spawnSync(process.execPath, [path.join(TOOLS, 'build.mjs'), '--project', project, '--template', TEMPLATE], { cwd: root, encoding: 'utf8' });
  assert.equal(built.status, 0, built.stdout + built.stderr);
  state = await get('/api/state');
  const beforeMtime = state.preview.builtMtime;
  // 模擬正在產生中：這兩次存檔都必須排隊，不能因 busy 而漏掉。
  editor.ctx.build.running = true;
  try {
    const a = await save({ base: { hash: state.plan.hash }, frame: [200, 100, 1280, 720] });
    assert.equal(a.framingUpdate.running, true);
    const b = await save({ base: { hash: a.plan.hash }, frame: [240, 120, 1280, 720] });
    assert.equal(b.framingUpdate.running, true);
  } finally { editor.ctx.build.running = false; }
  const updated = await waitForUpdate();
  assert.equal(updated.framingUpdate.ok, true, editor.ctx.build.log);
  assert.ok(updated.builtMtime > beforeMtime);
  const cache = JSON.parse(fs.readFileSync(path.join(out, '.cache', 'footage-audio.json'), 'utf8'));
  assert.deepEqual(cache.key.frame, [240, 120, 1280, 720], '實際編碼的底片採最後一次構圖');
  const done = updated.framingUpdate.finishedAt;
  const unchanged = await save({ base: { hash: updated.plan.hash }, frame: readPlan().frame });
  assert.equal(unchanged.wrote.plan, false);
  assert.equal(unchanged.framingUpdate.finishedAt, done, '不變時不重做');
  for (const [body, status] of [
    [{ base: { hash: first.plan.hash }, frame: null }, 409],
    [{ base: { hash: updated.plan.hash }, frame: [0, 0, 1000, 1000] }, 400],
  ]) {
    const r = await fetch(new URL('/api/save', editor.url), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(r.status, status);
    assert.deepEqual(readPlan().frame, [240, 120, 1280, 720]);
    assert.equal((await get('/api/version')).framingUpdate.finishedAt, done);
  }
  // 底片產生失敗也要保留構圖，回報失敗並允許下一次重試。
  const validPlan = fs.readFileSync(planFile, 'utf8');
  fs.writeFileSync(planFile, JSON.stringify({ ...readPlan(), scenes: [{ id: 'bad', scene: 'missing-scene', from: 0, to: 1 }] }));
  state = await get('/api/state');
  await save({ base: { hash: state.plan.hash }, frame: [200, 100, 1280, 720] });
  const failed = await waitForUpdate();
  assert.equal(failed.framingUpdate.ok, false);
  assert.match(failed.framingUpdate.message, /預覽更新失敗/);
  assert.deepEqual(readPlan().frame, [200, 100, 1280, 720]);
  fs.writeFileSync(planFile, validPlan);
});

test('兩個頁面：構圖儲存自動更新完成影片播放器，保留剪輯未存音量，套用新調光；介面使用「構圖／剪輯」', { timeout: 90000 }, async (t) => {
  const chrome = await hasChrome();
  if (!chrome) { t.skip('找不到現有 Chrome'); return; }
  if (!fs.existsSync(path.join(out, 'index.html'))) {
    const built = spawnSync(process.execPath, [path.join(TOOLS, 'build.mjs'), '--project', project, '--template', TEMPLATE], { cwd: root, encoding: 'utf8' });
    assert.equal(built.status, 0, built.stdout + built.stderr);
  }
  const { default: puppeteer } = await import('puppeteer-core');
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(editor.url);
    await page.waitForFunction(() => window.__editor?.server?.preview?.built);
    assert.equal(await page.title(), '剪輯｜sync');
    await page.evaluate(async () => {
      for (const d of document.querySelectorAll('dialog[open]')) d.close();
      const app = window.__editor;
      await app.setMode('player');
      app.edit.volume.voice = -4;
      app.changed({ inspector: true });
    });
    await page.waitForFunction(() => window.__editor.player.ready);
    const previous = await page.$eval('hyperframes-player', (el) => el.getAttribute('src'));
    const framing = await browser.newPage();
    framing.on('pageerror', (e) => errors.push(e.message));
    await framing.setViewport({ width: 1440, height: 1000 });
    await framing.goto(new URL('/framing', editor.url).href);
    await framing.waitForSelector('#main:not([hidden])');
    assert.equal(await framing.title(), '構圖');
    await framing.$eval('#zoom', (el) => { el.value = '1.2'; el.dispatchEvent(new Event('input')); });
    await framing.$eval('#color', (el) => { el.value = '0.1'; el.dispatchEvent(new Event('input')); });
    await framing.click('#btnSave');
    await framing.waitForFunction(() => document.querySelector('#msg').textContent.includes('剪輯預覽已自動更新'), { timeout: 60000 });
    const expected = readPlan().frame;
    await page.waitForFunction((frame) => JSON.stringify(window.__editor.plan0.frame) === JSON.stringify(frame) && window.__editor.look?.color === 0.1 && window.__editor.player.ready, { timeout: 15000 }, expected);
    await page.waitForFunction((src) => document.querySelector('hyperframes-player')?.getAttribute('src') !== src, {}, previous);
    assert.equal(await page.evaluate(() => window.__editor.edit.volume.voice), -4, '未存的音量仍保留');
    assert.equal(await page.$eval('#btnSave', (el) => el.disabled), false);
    assert.equal(await page.$eval('#dlgConflict', (el) => el.open), false);
    assert.equal(await page.evaluate(() => window.__editor.mode), 'player');
    await framing.screenshot({ path: path.join(root, '構圖.png') });
    await page.screenshot({ path: path.join(root, '剪輯.png') });
    assert.deepEqual(errors, []);
    t.diagnostic(`互動驗證截圖：${root}/構圖.png、${root}/剪輯.png`);
  } finally { await browser.close(); }
});
