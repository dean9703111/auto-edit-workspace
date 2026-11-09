// 剪輯台的畫面速度：段內分區、每區一個倍速（editor/speed.mjs），寫回 plan.json 的 in／speed／hold／retime，伺服器驗證，瀏覽器操作
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { startEditor } from '../../shared/template/tools/editor.mjs';
import { findChrome } from '../../shared/template/tools/lib/audit-browser.mjs';
import { sanitizeSegments } from '../../shared/template/tools/editor/server/write.mjs';
import { modelOf, fieldsOf, knotsOf, cutAt, setRate, freezeAt, joinAt, zoneAt, speedLabel } from '../../shared/template/tools/editor/speed.mjs';
import { TEMPLATE } from './helpers.mjs';

// ---------- 轉換 ----------
test('欄位 → 分區：原速、整段倍速、out、定格、變速', () => {
  assert.deepEqual(modelOf({ in: 3 }, 10), { start: 3, zones: [{ from: 0, to: 10, rate: 1 }] });
  assert.deepEqual(modelOf({ in: 3, speed: 2 }, 10).zones, [{ from: 0, to: 10, rate: 2 }]);
  assert.deepEqual(modelOf({ in: 2, out: 22 }, 10).zones, [{ from: 0, to: 10, rate: 2 }]);
  assert.deepEqual(modelOf({ hold: 7 }, 10), { start: 7, zones: [{ from: 0, to: 10, rate: 0 }] });
  const r = modelOf({ retime: [{ at: '+0', src: 5 }, { at: '+4', src: 13 }, { at: '+6', src: 13 }] }, 10, { resolveAt: (at) => Number(String(at).slice(1)) });
  assert.deepEqual(r, { start: 5, zones: [{ from: 0, to: 4, rate: 2 }, { from: 4, to: 6, rate: 0 }, { from: 6, to: 10, rate: 1 }] });
  assert.deepEqual(modelOf({}, 10, { knots: [[0, 1], [5, 11], [10, 16]] }).zones, [{ from: 0, to: 5, rate: 2 }, { from: 5, to: 10, rate: 1 }], '伺服器算好的優先');
});

test('分區 → 欄位：能用簡單的欄位就用簡單的，互斥的欄位一定清掉', () => {
  const one = (rate, start = 0) => ({ start, zones: [{ from: 0, to: 10, rate }] });
  const none = { in: undefined, out: undefined, speed: undefined, hold: undefined, retime: undefined };
  assert.deepEqual(fieldsOf(one(1, 3)), { ...none, in: 3 });
  assert.deepEqual(fieldsOf(one(1)), none, '從頭開始的原速：什麼都不用寫');
  assert.deepEqual(fieldsOf(one(2, 3)), { ...none, in: 3, speed: 2 });
  assert.deepEqual(fieldsOf(one(0, 3)), { ...none, hold: 3 });
  assert.deepEqual(fieldsOf(one(8, 1)).retime, [{ at: '+0', src: 1 }, { at: '+10', src: 81 }], '超過 speed 上限 4 倍就寫 retime');
  const m = { start: 5, zones: [{ from: 0, to: 4, rate: 2 }, { from: 4, to: 6, rate: 0 }, { from: 6, to: 10, rate: 1 }] };
  assert.deepEqual(fieldsOf(m).retime, [{ at: '+0', src: 5 }, { at: '+4', src: 13 }, { at: '+6', src: 13 }], '最後一區原速：不寫最後一點，段調短也不會超出');
});

test('分區 → 欄位：素材不夠就停在最後一格；時間沒動的點留原本的寫法', () => {
  const z = { start: 8, zones: [{ from: 0, to: 5, rate: 4 }] };
  assert.deepEqual(fieldsOf(z, { dur: 20 }).retime, [{ at: '+0', src: 8 }, { at: '+3', src: 20 }, { at: '+5', src: 20 }], '播到最後一格，剩下的時間定格');
  assert.deepEqual(knotsOf(z, 20), [[0, 8], [3, 20], [5, 20]]);
  const old = [{ at: '#21@詞', src: 5 }, { at: '#22', src: 9 }];
  const resolveAt = (at) => (at === '#21@詞' ? 0 : at === '#22' ? 4 : null);
  const m = { start: 5, zones: [{ from: 0, to: 4, rate: 1 }, { from: 4, to: 6, rate: 0 }, { from: 6, to: 10, rate: 1 }] };
  assert.deepEqual(fieldsOf(m, { oldRetime: old, resolveAt }).retime.map((k) => k.at), ['#21@詞', '#22', '+6']);
});

test('操作：切開、改速度、定格、併掉切點；太近的切點不接受', () => {
  const base = { start: 0, zones: [{ from: 0, to: 10, rate: 1 }] };
  assert.equal(cutAt(base, 0.1), null, '離邊緣不到 0.3 秒');
  const cut = cutAt(base, 4);
  assert.deepEqual(cut.zones.map((z) => [z.from, z.to]), [[0, 4], [4, 10]]);
  const fast = setRate(cut, 5, 4);
  assert.deepEqual(fast.zones.map((z) => z.rate), [1, 4]);
  assert.equal(zoneAt(fast, 3.9).rate, 1);
  assert.equal(setRate(fast, 5, 4), null, '已經是這個速度');
  assert.deepEqual(setRate(fast, 5, 1).zones, [{ from: 0, to: 10, rate: 1 }], '同速的相鄰區自動併起來');
  const hold = freezeAt(base, 3, 2);
  assert.deepEqual(hold.zones.map((z) => [z.from, z.to, z.rate]), [[0, 3, 1], [3, 5, 0], [5, 10, 1]]);
  assert.equal(freezeAt(hold, 4, 2), null, '已經是定格');
  assert.deepEqual(joinAt(hold, 3.2).zones.map((z) => [z.from, z.to, z.rate]), [[0, 5, 1], [5, 10, 1]].length && [[0, 10, 1]], '併掉最靠近的切點');
  assert.deepEqual(speedLabel(0) + speedLabel(1) + speedLabel(0.5), '定格原速×0.5');
});

// ---------- 伺服器 ----------
test('存檔驗證：速度欄位的範圍、不能倒帶、不能超過素材、null 是拿掉', () => {
  const plan = { scenes: [{ id: 'm1', type: 'media', src: 'assets/screen/a.mp4', from: 0, to: 10, in: 3 }] };
  const ctx = { cues: [], videoDur: 60, mediaDur: () => 30 };
  const go = (v) => sanitizeSegments({ m1: v }, plan, ctx);
  const ok = go({ in: null, retime: [{ at: '+0', src: 5 }, { at: '+4', src: 13 }] });
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.updates[0][1].retime.length, 2);
  assert.deepEqual(ok.updates[0][2], ['in']);
  assert.match(go({ speed: 9 }).errors[0], /speed 要是 0\.5–4/);
  assert.match(go({ hold: 99 }).errors[0], /hold 要是素材裡的秒數/);
  assert.match(go({ in: null, retime: [{ at: '+0', src: 9 }, { at: '+4', src: 3 }] }).errors[0], /不能倒帶/);
  assert.match(go({ in: null, retime: [{ at: '+0', src: 9 }, { at: '+4', src: 99 }] }).errors[0], /超過素材長度/);
  assert.match(go({ in: null, retime: [{ at: '+0', src: 9 }] }).errors[0], /至少 2 點/);
  assert.match(go({ retime: [{ at: '+0', src: 3 }, { at: '+4', src: 7 }] }).errors[0], /擇一/, '還留著 in 不能同時有 retime');
  assert.deepEqual(go({ hold: null, speed: null, retime: null }).updates[0][2].sort(), ['hold', 'retime', 'speed']);
  assert.deepEqual(go({ out: 12 }).errors.length, 1, 'out 只能拿掉');
});

// ---------- 瀏覽器 ----------
let root, work, editor, browser, page;
const errors = [];
const srt = Array.from({ length: 10 }, (_, i) => `${i + 1}\n00:00:${String(i * 2 + 1).padStart(2, '0')},000 --> 00:00:${String(i * 2 + 2).padStart(2, '0')},800\n第 ${i + 1} 句字幕\n`).join('\n');
const planFile = () => path.join(work, 'hyperframes', 'plan.json');
const savedSeg = () => JSON.parse(fs.readFileSync(planFile(), 'utf8')).scenes.find((s) => s.id === 'm1');
before(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-speed-'));
  const project = path.join(root, 'projects', 'demo');
  work = path.join(project, 'work');
  fs.mkdirSync(path.join(work, 'hyperframes'), { recursive: true });
  fs.mkdirSync(path.join(root, 'shared'));
  fs.mkdirSync(path.join(project, 'assets', 'screen'), { recursive: true });
  fs.symlinkSync(TEMPLATE, path.join(root, 'shared', 'template'), 'dir');
  fs.writeFileSync(planFile(), JSON.stringify({ version: 1, scenes: [{ id: 'm1', type: 'media', src: 'assets/screen/demo.mp4', from: '#2', to: '#6e', in: 1 }] }));
  fs.writeFileSync(path.join(work, 'rough.srt'), srt);
  const media = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', '24', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(work, 'rough.mp4')], { encoding: 'utf8' });
  assert.equal(media.status, 0, String(media.stderr));
  fs.copyFileSync(path.join(work, 'rough.mp4'), path.join(project, 'assets', 'screen', 'demo.mp4'));
  editor = await startEditor({ cwd: root, flags: { project, template: path.join(root, 'shared', 'template') }, port: 0, writeState: false });
  browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--no-first-run'] });
  page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());   // 上一個測試留著沒存的改動：離開頁面時的確認
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument(() => { localStorage.setItem('auto-edit-editor.coach.v2', '1'); localStorage.setItem('auto-edit-editor.coach-final.v1', '1'); });
  await page.goto(editor.url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__editor?.itemsView?.some((x) => x.id === 'm1'), { timeout: 60000 });
});
after(async () => { await browser?.close(); await editor?.close(); fs.rmSync(root, { recursive: true, force: true }); });

const clickAct = (act, r) => page.evaluate((a, x) => { document.querySelector(`[data-act="${a}"]${x != null ? `[data-r="${x}"]` : ''}`).click(); }, act, r);
const zones = () => page.$$eval('#spStrip .sp-zone', (a) => a.map((b) => b.textContent));
const knots = () => page.evaluate(() => window.__editor.itemsView.find((x) => x.id === 'm1').knots);

test('剪輯台：在播放頭切開、選速度、定格、恢復原速；預覽馬上照新速度走；存檔寫回 plan.json', async () => {
  await page.evaluate(() => window.__editor.select({ kind: 'media', id: 'm1' }));
  await page.click('.side-tabs [data-side="insp"]');
  await page.waitForSelector('#spStrip');
  assert.deepEqual(await zones(), ['原速']);
  const [start, end] = await page.evaluate(() => { const it = window.__editor.itemsView.find((x) => x.id === 'm1'); return [it.start, it.end]; });
  // 整段 ×2：寫 speed 就好
  await page.evaluate((t) => window.__editor.seek(t), start + 1);
  await clickAct('spRate', 2);
  await page.waitForFunction(() => document.querySelector('#spStrip .sp-zone')?.textContent === '×2');
  assert.deepEqual((await knots())[1][1], Math.round((1 + (end - start) * 2) * 1000) / 1000, '還沒存，預覽就照新速度');
  // 切開，後面一區定格
  await page.evaluate((t) => window.__editor.seek(t), start + 3);
  await clickAct('spCut');
  await page.waitForFunction(() => document.querySelectorAll('#spStrip .sp-zone').length === 2);
  await page.evaluate((t) => window.__editor.seek(t), start + 4);
  await page.waitForFunction(() => document.querySelector('#spRates button.on')?.textContent === '×2', {}, );
  await clickAct('spRate', 0);
  await page.waitForFunction(() => [...document.querySelectorAll('#spStrip .sp-zone')].map((b) => b.textContent).join() === '×2,定格');
  // 存檔
  await page.keyboard.down('Meta'); await page.keyboard.press('s'); await page.keyboard.up('Meta');
  const until = Date.now() + 15000;
  while (Date.now() < until && !savedSeg().retime) await new Promise((r) => setTimeout(r, 100));
  const s = savedSeg();
  assert.deepEqual(s.retime.map((k) => k.src), [1, 7, 7]);
  assert.equal(s.retime[0].at, '+0');
  assert.equal(s.in, undefined, 'retime 和 in 擇一');
  assert.equal(s.speed, undefined);
  // 恢復原速：欄位全部拿掉，起點留著
  await page.waitForFunction(() => !window.__editor.busy, { timeout: 30000 });
  await page.evaluate(() => { document.querySelector('[data-act="spReset"]').click(); });
  await page.waitForFunction(() => [...document.querySelectorAll('#spStrip .sp-zone')].map((b) => b.textContent).join() === '原速');
  assert.deepEqual(errors, []);
});

// ---------- 裁剪、顯示 ----------
test('拖邊緣裁剪有變速的段：畫面內容不跑、每一區的速度不變', async () => {
  const { trimModel } = await import('../../shared/template/tools/editor/speed.mjs');
  const m = { start: 5, zones: [{ from: 0, to: 4, rate: 2 }, { from: 4, to: 6, rate: 0 }, { from: 6, to: 10, rate: 1 }] };
  // 起點往後 1 秒：素材多跳 2 秒（×2）
  assert.deepEqual(trimModel(m, 1, 9), { start: 7, zones: [{ from: 0, to: 3, rate: 2 }, { from: 3, to: 5, rate: 0 }, { from: 5, to: 9, rate: 1 }] });
  // 切掉整個第一區
  assert.deepEqual(trimModel(m, 5, 5), { start: 13, zones: [{ from: 0, to: 1, rate: 0 }, { from: 1, to: 5, rate: 1 }] });
  // 起點往前 1 秒：第一區拉長，素材往前退 2 秒
  assert.deepEqual(trimModel(m, -1, 11), { start: 3, zones: [{ from: 0, to: 5, rate: 2 }, { from: 5, to: 7, rate: 0 }, { from: 7, to: 11, rate: 1 }] });
  // 終點往前：後面的區切掉；往後：最後一區拉長
  assert.deepEqual(trimModel(m, 0, 5).zones, [{ from: 0, to: 4, rate: 2 }, { from: 4, to: 5, rate: 0 }]);
  assert.deepEqual(trimModel(m, 0, 12).zones.at(-1), { from: 6, to: 12, rate: 1 });
});

test('顯示：AI 寫的變速和轉場都讀得出來', async () => {
  const { transitionOf, speedSummary } = await import('../../shared/template/tools/editor/motion.mjs');
  assert.equal(speedSummary([[0, 1], [10, 11]]), null, '整段原速不顯示');
  assert.equal(speedSummary([[0, 1], [3, 4], [5, 4], [10, 14]]), '3 秒 原速、2 秒 定格、5 秒 ×2');
  assert.deepEqual((({ inText, outText, showIn, showOut }) => [inText, outText, showIn, showOut])(transitionOf({ out: { tx: { in: 'swap', out: 'cover' } } })), ['換卡（背景不動）', '停著，被下一段蓋過', true, false]);
  const media = { type: 'media', enter: 'cut', exit: 'fade', out: { wipe: { in: false, out: false } } };
  assert.deepEqual([transitionOf(media).inText, transitionOf(media).outText, transitionOf(media).showIn, transitionOf(media).showOut], ['直接切', '淡出', false, true], '接在別的幕後面工具把淡入改成直接切：照實際的顯示');
  assert.equal(transitionOf({ type: 'media', enter: 'fade', exit: 'fade', out: { wipe: { in: true, out: false } } }).inText, '擦入');
  assert.equal(transitionOf(media, { enter: 'zoom' }).inText, '縮放', '使用者剛改、還沒存的值優先');
  assert.deepEqual([transitionOf(media, { enter: 'whip', exit: 'whip' }).inText, transitionOf(media, { exit: 'whip' }).outText, transitionOf(media, { enter: 'tilt' }).inText], ['甩鏡', '甩鏡', '斜躺擺平']);
});

test('AI 寫好的變速和轉場：重新載入就看得到（不用先改過）；預覽照變速走', async () => {
  fs.writeFileSync(planFile(), JSON.stringify({ version: 1, scenes: [
    { id: 's1', scene: 'key-point', from: '#1', to: '#3e', slots: { lead: '先看', key: '這一段' } },
    { id: 'm1', type: 'media', src: 'assets/screen/demo.mp4', from: '#4', to: '#9e', retime: [{ at: '#4', src: 2 }, { at: '#5', src: 2 }, { at: '#7', src: 10 }] },
  ] }));
  await page.goto(editor.url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__editor?.reportReady && window.__editor.itemsView.some((x) => x.id === 'm1' && x.knots), { timeout: 60000 });
  const knots = await page.evaluate(() => window.__editor.itemsView.find((x) => x.id === 'm1').knots);
  assert.deepEqual(knots.slice(0, 3).map((k) => k[1]), [2, 2, 10], '從報告拿到實際的素材時間');
  // 錄影段：速度條、段落清單
  await page.evaluate(() => window.__editor.select({ kind: 'media', id: 'm1' }));
  await page.click('.side-tabs [data-side="insp"]');
  await page.waitForSelector('#spStrip');
  assert.deepEqual((await zones()).slice(0, 2), ['定格', '×2']);
  assert.match(await page.$eval('#txNow', (n) => n.textContent), /進場.*出場/);
  // 進場可以選甩鏡、斜躺擺平（錄影沒有紙膠帶）；出場只有甩鏡（斜躺擺平只能當進場）
  assert.deepEqual(await page.$$eval('select[data-f="enter"] option', (o) => o.map((x) => x.value)), ['cut', 'fade', 'slide', 'zoom', 'whip', 'tilt']);
  assert.deepEqual(await page.$$eval('select[data-f="exit"] option', (o) => o.map((x) => x.value)), ['cut', 'fade', 'slide', 'zoom', 'whip']);
  await page.click('.side-tabs [data-side="segs"]');
  await page.waitForSelector('.sp-note');
  assert.match(await page.$eval('.sp-note', (n) => n.textContent), /定格/);
  // 動畫段：屬性面板寫進場、出場
  await page.evaluate(() => window.__editor.select({ kind: 'item', id: 's1' }));
  await page.click('.side-tabs [data-side="insp"]');
  await page.waitForSelector('#txSec');
  assert.match(await page.$eval('#txSec', (n) => n.textContent), /進場.*卡片滑入/);
  assert.deepEqual(errors, []);
});

test('預覽：子母畫面跟完成影片一樣在錄影裡面', async () => {
  fs.writeFileSync(planFile(), JSON.stringify({ version: 1, scenes: [{ id: 'm1', type: 'media', src: 'assets/screen/demo.mp4', from: '#2', to: '#6e' }] }));
  await page.goto(editor.url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__editor?.reportReady && window.__editor.itemsView.some((x) => x.id === 'm1' && x.pipShift), { timeout: 60000 });
  assert.deepEqual(await page.evaluate(() => window.__editor.itemsView.find((x) => x.id === 'm1').pipShift), [-85, -3], '16:9 錄影');
  await page.evaluate(() => window.__editor.seek(6));
  await page.waitForFunction(() => document.querySelector('#simPip').style.display === 'block', { timeout: 5000 });
  const pos = await page.$eval('#simPip', (n) => [parseFloat(n.style.left), parseFloat(n.style.top)]);
  assert.ok(Math.abs(pos[0] - (1339 / 1920) * 100) < 0.01 && Math.abs(pos[1] - (591 / 1080) * 100) < 0.01, String(pos));
  assert.deepEqual(errors, []);
});
