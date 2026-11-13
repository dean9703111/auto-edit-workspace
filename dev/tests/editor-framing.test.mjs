// 構圖存檔 → 自動產生底片 → 已開啟的剪輯同步（含未儲存的調整）。
import { test as nodeTest, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { TEMPLATE, TOOLS, imp, hasChrome, missingTools, skipAll } from './helpers.mjs';

// 整個檔都要 ffmpeg（before 做底片、構圖存檔會重產底片）：沒有就全部略過，before 也不做
const noFf = await missingTools('ffmpeg');
const test = skipAll(nodeTest, noFf);

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
  if (noFf) return;
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
    await page.waitForFunction(() => document.querySelector('#designError').textContent.includes('剪輯台仍是舊版'));
    await page.$eval('#zoom', (el) => { el.value = '1.3'; el.dispatchEvent(new Event('input')); });
    oldBackend = false;
    await page.evaluate(() => { document.querySelector('#designWrap').open = true; });
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
after(async () => { await editor?.ctx.framingJob; await editor?.close(); if (root) fs.rmSync(root, { recursive: true, force: true }); });

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

test('兩個頁面：構圖自動存檔不帶起更新，按「更新預覽」才更新完成影片播放器；保留剪輯的音量，套用新調光；介面使用「構圖／剪輯台」', { timeout: 90000 }, async (t) => {
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
    assert.equal(await page.title(), '剪輯台｜sync');
    await page.evaluate(async () => {
      for (const d of document.querySelectorAll('dialog[open]')) d.close();
      const app = window.__editor;
      await app.setMode('player');
      app.edit.volume.voice = -4;
      app.changed({ inspector: true });
    });
    await page.waitForFunction(() => window.__editor.player.ready);
    await page.waitForFunction(() => document.querySelector('#saveState').dataset.state === 'saved', { timeout: 15000 });
    const previous = await page.$eval('hyperframes-player', (el) => el.getAttribute('src'));
    const framing = await browser.newPage();
    framing.on('pageerror', (e) => errors.push(e.message));
    await framing.setViewport({ width: 1440, height: 1000 });
    await framing.goto(new URL('/framing', editor.url).href);
    await framing.waitForSelector('#main:not([hidden])');
    assert.equal(await framing.title(), '構圖');
    await framing.$eval('#zoom', (el) => { el.value = '1.2'; el.dispatchEvent(new Event('input')); });
    await framing.$eval('#color', (el) => { el.value = '0.1'; el.dispatchEvent(new Event('input')); });
    // 不按任何按鈕就存好；底片要重新處理很久，所以不會自己開始更新，等使用者按
    await framing.waitForFunction(() => document.querySelector('#saveState').dataset.state === 'saved' && !document.querySelector('#updateBar').hidden, { timeout: 20000 });
    assert.equal((await (await fetch(new URL('/api/version', editor.url))).json()).build.running, false);
    await framing.click('#btnUpdate');
    await framing.waitForFunction(() => document.querySelector('#msg').textContent.includes('預覽更新好了'), { timeout: 60000 });
    const expected = readPlan().frame;
    await page.waitForFunction((frame) => JSON.stringify(window.__editor.plan0.frame) === JSON.stringify(frame) && window.__editor.look?.color === 0.1 && window.__editor.player.ready, { timeout: 15000 }, expected);
    await page.waitForFunction((src) => document.querySelector('hyperframes-player')?.getAttribute('src') !== src, {}, previous);
    assert.equal(await page.evaluate(() => window.__editor.edit.volume.voice), -4, '剪輯台改的音量還在');
    assert.equal(await page.$eval('#dlgConflict', (el) => el.open), false);
    assert.equal(await page.evaluate(() => window.__editor.mode), 'player');
    await framing.screenshot({ path: path.join(root, '構圖.png') });
    await page.screenshot({ path: path.join(root, '剪輯.png') });
    assert.deepEqual(errors, []);
    t.diagnostic(`互動驗證截圖：${root}/構圖.png、${root}/剪輯.png`);
  } finally { await browser.close(); }
});

test('構圖頁自動存檔：還沒決定過就先存建議的框；拖了就存、不帶起更新；選原畫面重開還是原畫面；分鏡之後沒寫 frame 不會被寫入', { timeout: 120000 }, async (t) => {
  const chrome = await hasChrome();
  if (!chrome) { t.skip('找不到現有 Chrome'); return; }
  const dir = path.join(root, 'projects', 'auto');
  const work = path.join(dir, 'work');
  fs.mkdirSync(path.join(work, 'hyperframes'), { recursive: true });
  const plan = path.join(work, 'hyperframes', 'plan.json');
  fs.writeFileSync(plan, JSON.stringify({ version: 1 }));
  fs.writeFileSync(path.join(work, 'rough.srt'), '1\n00:00:00,100 --> 00:00:01,900\n第一句\n');
  fs.copyFileSync(path.join(project, 'work', 'rough.mp4'), path.join(work, 'rough.mp4'));
  const ed = await startEditor({ flags: { project: dir, template: TEMPLATE }, cwd: root, port: 0, writeState: false, previewDir: path.join(root, 'preview') });
  const read = () => JSON.parse(fs.readFileSync(plan, 'utf8'));
  const until = async (fn, ms = 10000) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await new Promise((r) => setTimeout(r, 80)); } return !!fn(); };
  const { default: puppeteer } = await import('puppeteer-core');
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewport({ width: 1440, height: 900 });
    const open = async () => { await page.goto(new URL('/framing', ed.url).href); await page.waitForSelector('#main:not([hidden])', { timeout: 60000 }); };
    await open();
    assert.equal(await page.$('#btnSave'), null, '沒有儲存按鈕');
    assert.match(await page.$eval('#next', (n) => n.textContent), /調好了/);
    // 看到的就是建議的框：不用動就存好（使用者直接說「調好了」，完成影片就是看到的樣子）
    const suggestion = (await (await fetch(new URL('/api/framing', ed.url))).json()).suggestion.frame;
    assert.equal(await until(() => JSON.stringify(read().frame ?? null) === JSON.stringify(suggestion?.[2] >= 1920 ? null : suggestion)), true, `plan.json 的 frame：${JSON.stringify(read().frame)}，建議：${JSON.stringify(suggestion)}`);
    await page.waitForFunction(() => document.querySelector('#saveState').dataset.state === 'saved');
    // 拖放大：自動存，不會自己開始更新預覽
    await page.$eval('#zoom', (el) => { el.value = '1.5'; el.dispatchEvent(new Event('input')); });
    assert.equal(await until(() => read().frame?.[2] === 1280), true, `放大後 ${JSON.stringify(read().frame)}`);
    await page.waitForFunction(() => document.querySelector('#saveState').dataset.state === 'saved');
    // 選原畫面：拿掉 frame；重開頁面還是原畫面，不會又套回建議的框
    await page.click('#btnFull');
    assert.equal(await until(() => !('frame' in read())), true);
    await page.waitForFunction(() => document.querySelector('#saveState').dataset.state === 'saved');
    await open();
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal('frame' in read(), false, '決定過不裁切：不再寫入建議的框');
    assert.equal(await page.$eval('#zoomOut', (n) => n.textContent), '1.00×');
    // 切走分頁：不等一秒就存
    await page.$eval('#zoom', (el) => { el.value = '1.25'; el.dispatchEvent(new Event('input')); });
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal(await until(() => Array.isArray(read().frame), 700), true, '切走就存');
    await page.evaluate(() => { delete document.hidden; });
    await page.waitForFunction(() => document.querySelector('#saveState').dataset.state === 'saved');
    // 已有段落、沒寫 frame（早就決定不裁切的舊專案）：只是打開看，不能寫檔
    const old = path.join(root, 'projects', 'old');
    fs.mkdirSync(path.join(old, 'work', 'hyperframes'), { recursive: true });
    const oldPlan = path.join(old, 'work', 'hyperframes', 'plan.json');
    const text = JSON.stringify({ version: 1, scenes: [{ id: 's01', scene: 'concept', from: '#1', to: '#1e', slots: { text: '字' } }] });
    fs.writeFileSync(oldPlan, text);
    fs.writeFileSync(path.join(old, 'work', 'rough.srt'), '1\n00:00:00,100 --> 00:00:01,900\n第一句\n');
    fs.copyFileSync(path.join(project, 'work', 'rough.mp4'), path.join(old, 'work', 'rough.mp4'));
    const ed2 = await startEditor({ flags: { project: old, template: TEMPLATE }, cwd: root, port: 0, writeState: false, previewDir: path.join(root, 'preview') });
    try {
      await page.goto(new URL('/framing', ed2.url).href);
      await page.waitForSelector('#main:not([hidden])', { timeout: 60000 });
      await new Promise((r) => setTimeout(r, 1800));
      assert.equal(fs.readFileSync(oldPlan, 'utf8'), text, '只是打開看，不寫檔');
    } finally { await ed2.close(); }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await ed.close(); }
});

test('/api/framing/save 帶 update:false 不更新預覽；/api/framing/update 才更新', async () => {
  const state = await get('/api/state');
  if (!state.preview.built) return;   // 前面的測試已經 build 過
  const r = await fetch(new URL('/api/framing/save', editor.url), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base: { hash: state.plan.hash }, frame: [160, 90, 1600, 900], update: false }) });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.framingUpdate.running, false);
  assert.equal(j.preview.stale, true);
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal((await get('/api/version')).build.running, false, '沒有帶起更新');
  const u = await fetch(new URL('/api/framing/update', editor.url), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(u.status, 200);
  const done = await waitForUpdate();
  assert.equal(done.framingUpdate.ok, true, editor.ctx.build.log);
  assert.equal(done.stale, false);
});

test('構圖連續存：講者框、pipCrop 從這一輪開始時的值換算，拖來拖去再改回去不會縮小；AI 改過就重新算', async () => {
  const dir = path.join(root, 'projects', 'origin');
  const work = path.join(dir, 'work');
  fs.mkdirSync(path.join(work, 'hyperframes'), { recursive: true });
  const plan = path.join(work, 'hyperframes', 'plan.json');
  const SB = [600, 200, 1400, 1000], PC = [500, 100, 400, 800];
  fs.writeFileSync(plan, JSON.stringify({ version: 1, speakerBox: SB, pipCrop: PC }));
  fs.writeFileSync(path.join(work, 'rough.srt'), '1\n00:00:00,100 --> 00:00:01,900\n第一句\n');
  fs.copyFileSync(path.join(project, 'work', 'rough.mp4'), path.join(work, 'rough.mp4'));
  const ed = await startEditor({ flags: { project: dir, template: TEMPLATE }, cwd: root, port: 0, writeState: false, previewDir: path.join(root, 'preview') });
  const read = () => JSON.parse(fs.readFileSync(plan, 'utf8'));
  const go = async (frame) => { const st = await (await fetch(new URL('/api/framing', ed.url))).json(); const r = await fetch(new URL('/api/framing/save', ed.url), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base: { hash: st.plan.hash }, frame, update: false }) }); assert.equal(r.status, 200, await r.clone().text()); return r.json(); };
  try {
    await go([320, 180, 1280, 720]);
    assert.notDeepEqual(read().speakerBox, SB, '放大：跟著換算');
    assert.equal(read().pipCrop, 'auto', '出界了：先交回 auto');
    await go([240, 135, 1440, 810]);
    await go(null);
    assert.deepEqual(read().speakerBox, SB, '改回原畫面：回到原本的值，沒有縮小');
    assert.deepEqual(read().pipCrop, PC, '手調的 pipCrop 也回來了');
    // AI 重新量了講者框：這一輪要重算，從新的值換算
    const p = read(); p.speakerBox = [700, 300, 1300, 900]; fs.writeFileSync(plan, JSON.stringify(p));
    await go([320, 180, 1280, 720]);
    await go(null);
    assert.deepEqual(read().speakerBox, [700, 300, 1300, 900]);
  } finally { await ed.close(); }
});

test('構圖頁：框被 AI 改過不會被舊的蓋回去；只有別的欄位被改就照存；連不到時狀態留著、不會每秒重送，關頁才問', { timeout: 120000 }, async (t) => {
  const chrome = await hasChrome();
  if (!chrome) { t.skip('找不到現有 Chrome'); return; }
  const dir = path.join(root, 'projects', 'conflict');
  const work = path.join(dir, 'work');
  fs.mkdirSync(path.join(work, 'hyperframes'), { recursive: true });
  const plan = path.join(work, 'hyperframes', 'plan.json');
  fs.writeFileSync(plan, JSON.stringify({ version: 1, frame: [240, 135, 1440, 810] }));
  fs.writeFileSync(path.join(work, 'rough.srt'), '1\n00:00:00,100 --> 00:00:01,900\n第一句\n');
  fs.copyFileSync(path.join(project, 'work', 'rough.mp4'), path.join(work, 'rough.mp4'));
  const ed = await startEditor({ flags: { project: dir, template: TEMPLATE }, cwd: root, port: 0, writeState: false, previewDir: path.join(root, 'preview') });
  const read = () => JSON.parse(fs.readFileSync(plan, 'utf8'));
  const until = async (fn, ms = 10000) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await new Promise((r) => setTimeout(r, 80)); } return !!fn(); };
  const { default: puppeteer } = await import('puppeteer-core');
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true });
  try {
    const page = await browser.newPage();
    const errors = [], dialogs = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('dialog', (d) => { dialogs.push(d.type()); d.accept(); });
    await page.setViewport({ width: 1440, height: 900 });
    const open = async () => { await page.goto(new URL('/framing', ed.url).href); await page.waitForSelector('#main:not([hidden])', { timeout: 60000 }); };
    await open();
    // 只是別的欄位被改（通常是剪輯台自動存）：照存
    let p = read(); p.rhythm = 'spaced'; fs.writeFileSync(plan, JSON.stringify(p));
    await page.$eval('#zoom', (el) => { el.value = '1.5'; el.dispatchEvent(new Event('input')); });
    assert.equal(await until(() => read().frame?.[2] === 1280), true, '別的欄位被改：框照存');
    assert.equal(read().rhythm, 'spaced', '別的欄位還在');
    await page.waitForFunction(() => document.querySelector('#saveState').dataset.state === 'saved');
    // 框本身被 AI 改了：不蓋回去，換成 AI 的，講一聲
    p = read(); p.frame = [160, 90, 1600, 900]; fs.writeFileSync(plan, JSON.stringify(p));
    await page.$eval('#zoom', (el) => { el.value = '1.8'; el.dispatchEvent(new Event('input')); });
    await page.waitForFunction(() => /被改過/.test(document.querySelector('#msg').textContent), { timeout: 10000 });
    assert.deepEqual(read().frame, [160, 90, 1600, 900], 'AI 的框沒被蓋掉');
    assert.equal(await page.$eval('#zoomOut', (n) => n.textContent), '1.20×', '頁面換成最新的框');
    // 連不到：狀態留著、不會每秒重送
    await open();
    await page.setRequestInterception(true);
    let tried = 0;
    const onReq = (req) => { if (new URL(req.url()).pathname === '/api/framing/save') { tried++; req.abort(); return; } req.continue(); };
    page.on('request', onReq);
    await page.mouse.click(700, 20);   // 瀏覽器要有使用者操作過才會跳 beforeunload
    await page.$eval('#zoom', (el) => { el.value = '1.4'; el.dispatchEvent(new Event('input')); });
    await page.waitForFunction(() => /連不到剪輯台/.test(document.querySelector('#saveState').textContent), { timeout: 8000 });
    const n0 = tried;
    await new Promise((r) => setTimeout(r, 2500));
    assert.equal(tried, n0, '不會每秒重送');
    assert.match(await page.$eval('#saveState', (n) => n.textContent), /連不到剪輯台/, '狀態留著');
    await page.goto(new URL('/cuts', ed.url).href, { waitUntil: 'domcontentloaded' }).catch(() => {});
    assert.deepEqual(dialogs, ['beforeunload'], '存不到才問');
    page.off('request', onReq);
    await page.setRequestInterception(false);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await ed.close(); }
});

test('構圖頁：存檔途中又拖了一下就關頁會問（最後那一下還沒送出去）；送出去後沒再動就不問', { timeout: 120000 }, async (t) => {
  const chrome = await hasChrome();
  if (!chrome) { t.skip('找不到現有 Chrome'); return; }
  const dir = path.join(root, 'projects', 'unsent');
  const work = path.join(dir, 'work');
  fs.mkdirSync(path.join(work, 'hyperframes'), { recursive: true });
  fs.writeFileSync(path.join(work, 'hyperframes', 'plan.json'), JSON.stringify({ version: 1, frame: [240, 135, 1440, 810] }));
  fs.writeFileSync(path.join(work, 'rough.srt'), '1\n00:00:00,100 --> 00:00:01,900\n第一句\n');
  fs.copyFileSync(path.join(project, 'work', 'rough.mp4'), path.join(work, 'rough.mp4'));
  const ed = await startEditor({ flags: { project: dir, template: TEMPLATE }, cwd: root, port: 0, writeState: false, previewDir: path.join(root, 'preview') });
  const until = async (fn, ms = 10000) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await new Promise((r) => setTimeout(r, 80)); } return !!fn(); };
  const { default: puppeteer } = await import('puppeteer-core');
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true });
  try {
    const page = await browser.newPage();
    const errors = [], dialogs = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('dialog', (d) => { dialogs.push(d.type()); d.accept(); });
    await page.setViewport({ width: 1440, height: 900 });
    const open = async () => { await page.goto(new URL('/framing', ed.url).href); await page.waitForSelector('#main:not([hidden])', { timeout: 60000 }); };
    const zoom = (v) => page.$eval('#zoom', (el, x) => { el.value = x; el.dispatchEvent(new Event('input')); }, v);
    await page.setRequestInterception(true);
    let held = null;
    page.on('request', (req) => { if (new URL(req.url()).pathname === '/api/framing/save' && !held) { held = req; return; } req.continue(); });
    // 送出去了、沒再動：換頁不問（keepalive 會存好）
    await open();
    await page.mouse.click(700, 20);   // 瀏覽器要有使用者操作過才會跳 beforeunload
    await zoom('1.4');
    assert.equal(await until(() => !!held), true, '自動存檔送出去了');
    await page.goto(new URL('/cuts', ed.url).href, { waitUntil: 'domcontentloaded' }).catch(() => {});
    assert.deepEqual(dialogs, [], '最新的已經送出去：不用問');
    // 存檔途中又拖了一下：最後那一下還沒送出去，關頁要問
    held = null;
    await open();
    await page.mouse.click(700, 20);
    await zoom('1.55');   // 上一頁那次 keepalive 已經存好 1.4 了，這次換別的值
    assert.equal(await until(() => !!held), true, '自動存檔送出去了');
    await zoom('1.8');
    await page.goto(new URL('/cuts', ed.url).href, { waitUntil: 'domcontentloaded' }).catch(() => {});
    assert.deepEqual(dialogs, ['beforeunload'], '最後那一下沒送出去：要問');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await ed.close(); }
});
