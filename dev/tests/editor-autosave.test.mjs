// 剪輯台自動存檔：存檔途中又改、拖曳中、連不到服務、切走分頁、有完成影片時的預設畫面；/api/restore 的保護
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
const srt = Array.from({ length: 10 }, (_, i) => `${i + 1}\n00:00:${String(i * 2 + 1).padStart(2, '0')},000 --> 00:00:${String(i * 2 + 2).padStart(2, '0')},800\n第 ${i + 1} 句字幕\n`).join('\n');
const SEGS = [{ id: 's0101', scene: 'concept', from: '#2', to: '#3e', slots: { text: '第一段' }, story: { say: '手機畫面太小看不清楚' } }];
const planFile = () => path.join(work, 'hyperframes', 'plan.json');
const srtFile = () => path.join(work, 'rough.srt');
const readPlan = () => JSON.parse(fs.readFileSync(planFile(), 'utf8'));
const until = async (fn, ms = 10000) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await sleep(60); } return !!fn(); };
const saved = () => page.waitForFunction(() => document.querySelector('#saveState').dataset.state === 'saved', { timeout: 15000 });
const setCue = (n, text) => page.evaluate((a, b) => window.__editor.setCue(a, { text: b }), n, text);
const post = (p, body) => fetch(new URL(p, editor.url), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

async function open() {
  await page.goto(editor.url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__editor?.itemsView?.length >= 1 && window.__editor.reportReady, { timeout: 60000 });
  await saved();
}

before(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-auto-'));
  const project = path.join(root, 'projects', 'demo');
  work = path.join(project, 'work');
  fs.mkdirSync(path.join(work, 'hyperframes'), { recursive: true });
  fs.mkdirSync(path.join(root, 'shared'));
  fs.symlinkSync(TEMPLATE, path.join(root, 'shared', 'template'), 'dir');
  fs.writeFileSync(planFile(), JSON.stringify({ version: 1, scenes: SEGS }));
  fs.writeFileSync(srtFile(), srt);
  const media = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=navy:size=320x180:rate=30', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', '24', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '30', '-c:a', 'aac', '-shortest', path.join(work, 'rough.mp4')], { encoding: 'utf8' });
  assert.equal(media.status, 0, String(media.stderr));
  editor = await startEditor({ cwd: root, flags: { project, template: path.join(root, 'shared', 'template') }, port: 0, writeState: false });
  browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--no-first-run'] });
  page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument(() => { for (const k of ['coach.v2', 'coach-final.v1', 'coach-rough.v1']) localStorage.setItem(`auto-edit-editor.${k}`, '1'); });
  await open();
});
after(async () => { await browser?.close(); await editor?.close(); fs.rmSync(root, { recursive: true, force: true }); });

test('存檔途中又改了：後改的不會不見，下一輪存進去；已送出的字幕操作不會重複', async () => {
  await page.setRequestInterception(true);
  let held = null, passed = 0;
  const onReq = (req) => {
    if (new URL(req.url()).pathname === '/api/save' && req.method() === 'POST' && !held) { held = req; return; }
    if (new URL(req.url()).pathname === '/api/save') passed++;
    req.continue();
  };
  page.on('request', onReq);
  await setCue(2, '第二句A');
  assert.equal(await until(() => !!held), true, '有送出存檔');
  // 送出去還沒回來的時候又改了兩處：同一句（不能併進已送出的那步）和別句
  await setCue(2, '第二句B');
  await setCue(3, '第三句C');
  await page.evaluate(() => { window.__editor.edit.fadeIn = 0.5; window.__editor.changed(); });
  await held.continue();
  assert.equal(await until(() => /第二句B/.test(fs.readFileSync(srtFile(), 'utf8')) && /第三句C/.test(fs.readFileSync(srtFile(), 'utf8'))), true, '後改的也存進去');
  await until(() => readPlan().edit?.fadeIn === 0.5);
  assert.equal(readPlan().edit.fadeIn, 0.5);
  await saved();
  assert.equal(await page.evaluate(() => window.__editor.srtOps.length), 0, '都存好了，沒有留下要再送的字幕操作');
  assert.ok(passed >= 1);
  assert.equal(await page.evaluate(() => window.__editor.cues.find((c) => c.n === 2).text), '第二句B');
  page.off('request', onReq);
  await page.setRequestInterception(false);
  // 全部復原回到原本：幾步都回得去
  for (let i = 0; i < 12 && !(await page.$eval('#btnUndo', (b) => b.disabled)); i++) { await page.click('#btnUndo'); await sleep(120); }
  await until(() => /第 2 句字幕/.test(fs.readFileSync(srtFile(), 'utf8')) && /第 3 句字幕/.test(fs.readFileSync(srtFile(), 'utf8')));
  assert.match(fs.readFileSync(srtFile(), 'utf8'), /第 2 句字幕/);
  assert.match(fs.readFileSync(srtFile(), 'utf8'), /第 3 句字幕/);
  assert.deepEqual(errors, []);
});

test('拖曳中不存，放開才存；拖到一半存檔回來也不會蓋掉正在拖的', async () => {
  await open();
  const plan0 = fs.readFileSync(planFile(), 'utf8');
  await page.evaluate(() => { const A = window.__editor; A.gestureBegin(); A.edit.fadeOut = 1; A.recompute(); });
  await sleep(1700);
  assert.equal(fs.readFileSync(planFile(), 'utf8'), plan0, '還在拖：不存');
  await page.evaluate(() => window.__editor.gestureEnd(true));
  assert.equal(await until(() => readPlan().edit?.fadeOut === 1), true, '放開就存');
  await saved();
  // 存檔已經送出，這時候開始拖：回應不能把正在拖的值洗掉
  await page.setRequestInterception(true);
  let held = null;
  const onReq = (req) => { if (new URL(req.url()).pathname === '/api/save' && !held) { held = req; return; } req.continue(); };
  page.on('request', onReq);
  await setCue(4, '第四句改');
  await until(() => !!held);
  await page.evaluate(() => { const A = window.__editor; A.gestureBegin(); A.edit.volume.voice = -3; A.recompute(); });
  await held.continue();
  await until(() => /第四句改/.test(fs.readFileSync(srtFile(), 'utf8')));
  await sleep(200);
  assert.equal(await page.evaluate(() => window.__editor.edit.volume.voice), -3, '正在拖的值還在');
  await page.evaluate(() => window.__editor.gestureEnd(true));
  page.off('request', onReq);
  await page.setRequestInterception(false);
  assert.equal(await until(() => readPlan().edit?.volume?.voice === -3), true);
  assert.deepEqual(errors, []);
});

test('連不到服務：修改留在頁面、講清楚；連回來自動補存。切走分頁馬上存，不等那一秒', async () => {
  await open();
  await page.setRequestInterception(true);
  let block = true, tried = 0;
  const onReq = (req) => { if (block && new URL(req.url()).pathname === '/api/save') { tried++; req.abort(); return; } req.continue(); };
  page.on('request', onReq);
  await setCue(5, '第五句改');
  assert.equal(await until(() => tried >= 1), true);
  await page.waitForFunction(() => /連不到剪輯台/.test(document.querySelector('#saveState').textContent));
  assert.equal(await page.evaluate(() => window.__editor.cues.find((c) => c.n === 5).text), '第五句改', '修改還在');
  block = false;
  assert.equal(await until(() => /第五句改/.test(fs.readFileSync(srtFile(), 'utf8')), 12000), true, '連回來自動補存');
  await saved();
  page.off('request', onReq);
  await page.setRequestInterception(false);
  // 切回對話：不等一秒就存
  await setCue(6, '第六句改');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  assert.equal(await until(() => /第六句改/.test(fs.readFileSync(srtFile(), 'utf8')), 700), true, '切走就存');
  await page.evaluate(() => { delete document.hidden; });
  await saved();
  assert.deepEqual(errors, []);
});

test('AI 改了檔案：不蓋掉；沒有未存的修改就自動載入，復原清單清掉（舊快照對不上）', async () => {
  await open();
  await setCue(7, '第七句改');
  await until(() => /第七句改/.test(fs.readFileSync(srtFile(), 'utf8')));
  await saved();
  assert.equal(await page.$eval('#btnUndo', (b) => b.disabled), false);
  const p = readPlan();
  p.scenes[0].slots.text = 'AI 改的字';
  fs.writeFileSync(planFile(), JSON.stringify(p));
  await page.waitForFunction(() => window.__editor.plan0.scenes[0].slots.text === 'AI 改的字', { timeout: 10000 });
  assert.equal(await page.$eval('#btnUndo', (b) => b.disabled), true, '不能再復原回 AI 改之前');
  assert.deepEqual(errors, []);
});

test('/api/restore：檔案被改過就擋，存過的版本才回得去', async () => {
  await open();
  const state = await (await fetch(new URL('/api/state', editor.url))).json();
  const base = { hash: state.plan.hash, srtHash: state.srt.hash };
  // 沒存過的版本
  let r = await post('/api/restore', { base, to: { hash: 'nope', srtHash: 'nope' } });
  assert.equal(r.status, 410);
  // 現在的檔案和頁面認知的不一樣（AI 改過）
  r = await post('/api/restore', { base: { hash: 'old', srtHash: base.srtHash }, to: base });
  assert.equal(r.status, 409);
  // 存一次，回到存之前
  r = await post('/api/save', { quick: true, base, edit: { fadeIn: 1.5 } });
  assert.equal(r.status, 200);
  const after1 = await r.json();
  assert.equal(readPlan().edit.fadeIn, 1.5);
  r = await post('/api/restore', { base: { hash: after1.plan.hash, srtHash: after1.srt.hash }, to: base });
  assert.equal(r.status, 200);
  const back = await r.json();
  assert.equal(back.plan.hash, base.hash);
  assert.notEqual(readPlan().edit?.fadeIn, 1.5);
  // 再回到存之後（重做）
  r = await post('/api/restore', { base: { hash: back.plan.hash, srtHash: back.srt.hash }, to: { hash: after1.plan.hash, srtHash: after1.srt.hash } });
  assert.equal(r.status, 200);
  assert.equal(readPlan().edit.fadeIn, 1.5);
  await post('/api/restore', { base: { hash: after1.plan.hash, srtHash: after1.srt.hash }, to: base });
});

test('畫面：沒有儲存按鈕；有段落但還沒做過成品時留在快速試聽，講得出下一步；用詞不露內部名稱', async () => {
  await open();
  assert.equal(await page.$('#btnSave'), null);
  assert.equal(await page.evaluate(() => window.__editor.mode), 'sim');
  assert.match(await page.$eval('#saveState', (n) => n.textContent), /已自動存檔/);
  // 測試環境可能沒有播放器：兩種情況都要講得出下一步
  assert.match(await page.$eval('#modeNote', (n) => n.textContent), /更新預覽|找不到播放器/);
  assert.equal(await page.$eval('#btnBuild', (n) => n.classList.contains('primary')), true, '還沒有成品：主要按鈕是更新預覽');
  assert.match(await page.$eval('#btnBuild', (n) => n.textContent), /更新預覽/);
  assert.match(await page.$eval('#next', (n) => n.textContent), /調好了/);
  const seg = await page.$$eval('.seg button', (a) => a.map((b) => b.textContent));
  assert.deepEqual(seg, ['完成影片預覽', '快速試聽'], '成品在前面');
  const body = await page.evaluate(() => document.body.innerText);
  assert.doesNotMatch(body, /重新產生|即時模擬|資訊卡|字卡動態|LUFS|符合視窗/);
  // 時間：平常看分秒，沒剪掉東西時不印兩次
  assert.equal(await page.$eval('.tc-out', (n) => n.hidden), true);
  assert.doesNotMatch(await page.$eval('.tc-dur', (n) => n.textContent), /00:00:/);
  // 選到字卡：快速試聽看不到，角落講一聲
  await page.evaluate(() => { const A = window.__editor; A.seek(3.5); });
  await page.waitForFunction(() => /快速試聽看不到/.test(document.querySelector('#simHint').textContent), { timeout: 5000 });
  assert.equal(await page.$eval('#simHint', (n) => n.classList.contains('corner')), true);
  // 整支影片的設定收成一區一區，標題帶現在的值
  await page.evaluate(() => window.__editor.select(null));
  await page.click('.side-tabs [data-side="insp"]');
  assert.ok((await page.$$eval('#inspBody details.ip-fold', (a) => a.length)) >= 5);
  assert.match(await page.$eval('#inspBody details[data-ipfold="sound"] summary', (n) => n.textContent), /聲音：人聲/);
  // 控制項都有名字
  const unnamed = await page.$$eval('#inspBody input, #inspBody select, #inspBody textarea', (a) => a.filter((x) => !x.getAttribute('aria-label') && !x.labels?.length).length);
  assert.equal(unnamed, 0);
  assert.deepEqual(errors, []);
});

test('時間軸：長片打開一屏三分鐘，從清單跳到一段會放大，可以拖分隔線；檢查結果在右側分頁，不蓋畫面', async () => {
  await open();
  const T = () => page.evaluate(() => { const t = window.__editor.timeline; return { span: t.span(), scale: t.scale, totalH: t.totalH }; });
  const t0 = await T();
  assert.ok(t0.span <= 181, `一屏最多三分鐘，現在 ${t0.span}`);
  await page.evaluate(() => { const t = window.__editor.timeline; t.dur = 1000; t.fitPps = (t.cssW - 20) / 1000; t.pps = t.fitPps; t.t0 = 0; t.reveal(500, 505); });
  const t1 = await T();
  assert.ok(t1.span <= 61, `跳到一段：放大到前後約 30 秒（${t1.span}）`);
  assert.ok(await page.evaluate(() => { const t = window.__editor.timeline; return t.t0 < 500 && t.t0 + t.span() > 505; }), '那一段在畫面裡');
  await page.evaluate((d) => { const t = window.__editor.timeline; t.setDuration(d); t.fit(); }, await page.evaluate(() => window.__editor.dur));
  // 分隔線
  const box = await (await page.$('#tlResize')).boundingBox();
  await page.mouse.move(box.x + 200, box.y + 3);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 63, { steps: 4 });
  await page.mouse.up();
  const t2 = await T();
  assert.ok(t2.totalH < t0.totalH, `往下拖：時間軸變矮（${t0.totalH} → ${t2.totalH}）`);
  await page.evaluate(() => document.querySelector('#tlResize').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
  assert.equal((await T()).scale, 1, '雙擊回到預設');
  // 檢查結果
  await page.click('#stIssues');
  await page.waitForSelector('#sideIssues:not([hidden])');
  assert.equal(await page.$eval('.side-tabs [data-side="issues"]', (n) => n.classList.contains('on')), true);
  assert.deepEqual(errors, []);
});

test('改完馬上換頁：不會跳「確定要離開」，修改也存好了（keepalive）；真的存不到才問', async () => {
  await open();
  const dialogs = [];
  const onDialog = (d) => dialogs.push(d.type());
  page.on('dialog', onDialog);
  await page.mouse.click(700, 20);   // 瀏覽器要有使用者操作過才會跳 beforeunload，沒點過的話這個測試什麼都測不到
  await setCue(8, '第八句改');
  await page.goto(new URL('/cuts', editor.url).href, { waitUntil: 'domcontentloaded' });
  assert.equal(await until(() => /第八句改/.test(fs.readFileSync(srtFile(), 'utf8'))), true, '換頁也存好了');
  assert.deepEqual(dialogs, [], '不用問');
  await open();
  // 存不到（連不到服務）：這時候關頁才要問
  await page.setRequestInterception(true);
  const onReq = (req) => { if (new URL(req.url()).pathname === '/api/save') { req.abort(); return; } req.continue(); };
  page.on('request', onReq);
  await page.mouse.click(700, 20);
  await setCue(9, '第九句改');
  await page.waitForFunction(() => /連不到剪輯台/.test(document.querySelector('#saveState').textContent), { timeout: 8000 });
  await page.goto(new URL('/cuts', editor.url).href, { waitUntil: 'domcontentloaded' }).catch(() => {});
  assert.deepEqual(dialogs, ['beforeunload'], '存不到才問');
  page.off('request', onReq);
  await page.setRequestInterception(false);
  page.off('dialog', onDialog);
  await open();
  assert.deepEqual(errors, []);
});

test('字幕分頁：只是點進去沒打字，AI 改了那句也不會被舊字蓋回去；打字自動存；Esc 回到原本的字', async () => {
  await open();
  await page.click('.side-tabs [data-side="cues"]');
  await page.waitForSelector('#cueList [data-cue="3"]');
  await page.evaluate(() => document.querySelector('#cueList [data-cue="3"]').click());
  await page.waitForFunction(() => document.activeElement?.classList.contains('cue-edit'));
  // AI 改了同一句；頁面自動載入，輸入框不能留著舊字寫回去
  const orig = fs.readFileSync(srtFile(), 'utf8');
  const was = /3\n[^\n]+\n([^\n]+)\n/.exec(orig)[1];
  fs.writeFileSync(srtFile(), orig.replace(was, 'AI 改的第三句'));
  await page.waitForFunction(() => window.__editor.cues.find((c) => c.n === 3).text === 'AI 改的第三句', { timeout: 10000 });
  await page.evaluate(() => document.activeElement?.blur());
  await sleep(1500);
  assert.match(fs.readFileSync(srtFile(), 'utf8'), /AI 改的第三句/, '沒打字就不寫');
  // 打字：不用按 Enter 就存好
  await page.waitForSelector('#cueList [data-cue="4"]');
  await page.evaluate(() => document.querySelector('#cueList [data-cue="4"]').click());
  await page.waitForFunction(() => document.activeElement?.classList.contains('cue-edit'));
  await page.keyboard.press('End');
  await page.keyboard.type('甲');
  assert.equal(await until(() => /第 4 句字幕甲|第四句改甲/.test(fs.readFileSync(srtFile(), 'utf8'))), true, '打字就存');
  // Esc：回到點進來時的字，檔案也回去
  await page.keyboard.press('Escape');
  assert.equal(await until(() => !/字幕甲|改甲/.test(fs.readFileSync(srtFile(), 'utf8'))), true, 'Esc 還原');
  await saved();
  assert.deepEqual(errors, []);
});

test('檔案被 AI 改過又按「保留我的調整」：只保留自己改的那幾項，AI 改的 edit 留著', async () => {
  await open();
  await page.setRequestInterception(true);
  let held = null;
  const onReq = (req) => { if (new URL(req.url()).pathname === '/api/save' && !held) { held = req; return; } req.continue(); };
  page.on('request', onReq);
  await setCue(5, '第五句保留');
  assert.equal(await until(() => !!held), true);
  // 存檔送出去但還沒到：AI 改了 plan.json 的 edit
  const p = readPlan();
  p.edit = { ...(p.edit || {}), fadeOut: 2 };
  fs.writeFileSync(planFile(), JSON.stringify(p));
  await held.continue();
  await page.waitForFunction(() => document.querySelector('#dlgConflict').open, { timeout: 10000 });
  await page.click('#conflictKeep');
  assert.equal(await until(() => /第五句保留/.test(fs.readFileSync(srtFile(), 'utf8'))), true, '自己的修改存進去');
  assert.equal(readPlan().edit.fadeOut, 2, 'AI 改的 edit 還在');
  page.off('request', onReq);
  await page.setRequestInterception(false);
  await saved();
  assert.deepEqual(errors, []);
});

test('按住時間軸沒拖動（存檔剛好回來）：已經存好的字幕操作不會再送一次，不會多刪一句', async () => {
  await open();
  const before = await page.evaluate(() => window.__editor.cues.length);
  await page.setRequestInterception(true);
  let held = null;
  const onReq = (req) => { if (new URL(req.url()).pathname === '/api/save' && !held) { held = req; return; } req.continue(); };
  page.on('request', onReq);
  await page.evaluate(() => { const A = window.__editor; A.deleteCue(A.cues.find((c) => c.n === 7)); });
  assert.equal(await until(() => !!held), true);
  await page.evaluate(() => window.__editor.gestureBegin());   // 按下去
  await held.continue();
  assert.equal(await until(() => (fs.readFileSync(srtFile(), 'utf8').match(/-->/g) || []).length === before - 1), true);
  await sleep(150);
  await page.evaluate(() => window.__editor.gestureEnd(false));   // 沒拖動就放開
  await sleep(1800);
  assert.equal((fs.readFileSync(srtFile(), 'utf8').match(/-->/g) || []).length, before - 1, '只刪一句');
  assert.equal(await page.evaluate(() => window.__editor.cues.length), before - 1);
  page.off('request', onReq);
  await page.setRequestInterception(false);
  await saved();
  await page.click('#btnUndo');
  assert.equal(await until(() => (fs.readFileSync(srtFile(), 'utf8').match(/-->/g) || []).length === before), true, '復原回來');
  await saved();
  assert.deepEqual(errors, []);
});

test('重新載入途中又改了：修改不會消失；復原遇到一時失敗不會清掉整條清單；很長的修改也存得進去', async () => {
  await open();
  await setCue(6, '第六句新');
  await until(() => /第六句新/.test(fs.readFileSync(srtFile(), 'utf8')));
  await saved();
  await page.setRequestInterception(true);
  let held = null, failUndo = false;
  const onReq = (req) => {
    const u = new URL(req.url()).pathname;
    if (u === '/api/state' && !held) { held = req; return; }
    if (u === '/api/restore' && failUndo) { req.abort(); return; }
    req.continue();
  };
  page.on('request', onReq);
  const load = page.evaluate(() => { const A = window.__editor; return A.loadState({ keep: A.keepIfDirty }); });
  assert.equal(await until(() => !!held), true);
  await setCue(8, '第八句新');   // 等回應的時候又改
  await held.continue();
  await load;
  assert.equal(await page.evaluate(() => window.__editor.cues.find((c) => c.n === 8).text), '第八句新', '修改還在');
  assert.equal(await until(() => /第八句新/.test(fs.readFileSync(srtFile(), 'utf8'))), true, '也存進去了');
  await saved();
  // 一時連不到：復原失敗，清單還在，等一下還能再按
  const n = await page.evaluate(() => window.__editor.undoStack.length);
  assert.ok(n > 0);
  failUndo = true;
  await page.click('#btnUndo');
  await sleep(300);
  assert.equal(await page.evaluate(() => window.__editor.undoStack.length), n, '這一步還在');
  failUndo = false;
  await page.click('#btnUndo');
  assert.equal(await until(() => !/第八句新/.test(fs.readFileSync(srtFile(), 'utf8'))), true, '再按一次就回去了');
  page.off('request', onReq);
  await page.setRequestInterception(false);
  await saved();
  // 超過 keepalive 上限（64 KB）的修改：照樣存得進去，不會一直顯示連不到
  const long = '長'.repeat(25000);
  await setCue(9, long);
  assert.equal(await until(() => fs.readFileSync(srtFile(), 'utf8').includes(long)), true);
  await saved();
  await page.evaluate(() => window.__editor.undo());
  await until(() => !fs.readFileSync(srtFile(), 'utf8').includes(long));
  assert.deepEqual(errors, []);
});
