// 初剪預覽：還沒排分鏡就能在瀏覽器看字幕疊在畫面上（只有聲音的黑屏也看得到）、改字、存檔；影片還在處理時等它，不要報錯
import { test as nodeTest, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { startEditor } from '../../shared/template/tools/editor.mjs';
import { findChrome } from '../../shared/template/tools/lib/audit-browser.mjs';
import { TEMPLATE, missingTools, skipAll } from './helpers.mjs';

// 整個檔都要開瀏覽器：沒有 Chrome、ffmpeg 或 puppeteer-core（hyperframes 順帶裝的，不在 package.json）就全部略過，用到才載入
const noUi = await missingTools('chrome', 'ffmpeg', 'puppeteer');
const test = skipAll(nodeTest, noUi);
const puppeteer = noUi ? null : (await import('puppeteer-core')).default;

let root, work, editor, browser, page;
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const srt = Array.from({ length: 10 }, (_, i) => `${i + 1}\n00:00:${String(i * 2 + 1).padStart(2, '0')},000 --> 00:00:${String(i * 2 + 2).padStart(2, '0')},800\n第 ${i + 1} 句字幕\n`).join('\n');
const srtFile = () => path.join(work, 'rough.srt');
const planFile = () => path.join(work, 'hyperframes', 'plan.json');

before(async () => {
  if (noUi) return;
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-rough-'));
  const project = path.join(root, 'projects', 'demo');
  work = path.join(project, 'work');
  fs.mkdirSync(path.join(work, 'hyperframes'), { recursive: true });
  fs.mkdirSync(path.join(root, 'shared'));
  fs.symlinkSync(TEMPLATE, path.join(root, 'shared', 'template'), 'dir');
  fs.writeFileSync(planFile(), '{\n  "version": 1\n}\n');
  fs.writeFileSync(srtFile(), srt);
  // 前 8 秒有畫面，後面全黑（只有聲音）
  const media = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30:duration=8', '-f', 'lavfi', '-i', 'color=c=black:size=320x180:rate=30:duration=16', '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=44100:duration=24',
    '-filter_complex', '[0:v][1:v]concat=n=2:v=1[v]', '-map', '[v]', '-map', '2:a', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '30', '-c:a', 'aac', '-shortest', path.join(work, 'rough.mp4')], { encoding: 'utf8' });
  assert.equal(media.status, 0, String(media.stderr));
  editor = await startEditor({ cwd: root, flags: { project, template: path.join(root, 'shared', 'template') }, port: 0, writeState: false });
  browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--no-first-run'] });
  page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument(() => { for (const k of ['coach.v2', 'coach-final.v1', 'coach-rough.v1']) localStorage.setItem(`auto-edit-editor.${k}`, '1'); });
  await page.goto(editor.url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__editor?.reportReady, { timeout: 60000 });
});
after(async () => { if (noUi) return; await browser?.close(); await editor?.close(); fs.rmSync(root, { recursive: true, force: true }); });

test('初剪預覽：提示不是錯誤；開在字幕分頁；流程列標字幕預覽；黑屏標成只有聲音；字幕疊在黑屏上；沒有「沒有畫面」的 ✖；還不能更新預覽和輸出，也講得出為什麼', async () => {
  const banner = await page.$eval('#banner', (b) => ({ text: b.textContent, cls: b.className, hidden: b.hidden }));
  assert.equal(banner.hidden, false);
  assert.match(banner.text, /初剪預覽/);
  assert.doesNotMatch(banner.cls, /error/);
  assert.equal(await page.$eval('#saveState', (n) => n.dataset.state === 'error'), false);
  // 不能按的按鈕講得出原因（用 is-disabled，滑鼠移上去、點了都會講）
  for (const id of ['#btnBuild', '#btnExport']) {
    const b = await page.$eval(id, (n) => ({ off: n.classList.contains('is-disabled'), why: n.dataset.why }));
    assert.equal(b.off, true, id);
    assert.match(b.why, /分鏡做好/, id);
  }
  // 是來校字幕的：開在字幕分頁，不是主題和調光
  assert.equal(await page.$eval('.side-tabs [data-side="cues"]', (n) => n.classList.contains('on')), true);
  assert.equal(await page.$eval('#sideCues', (n) => n.hidden), false);
  await page.waitForSelector('#cueList [data-cue="1"]');
  assert.match(await page.$eval('#sideCues .side-hint', (n) => n.textContent), /點一句就能改字/);
  assert.doesNotMatch(await page.$eval('#modeNote', (n) => n.textContent), /更新預覽|重新產生/, '現在按不了的按鈕不要叫人按');
  // 流程列：這一頁是字幕預覽，不是 ④ 完成影片
  await page.waitForSelector('#flowbar .fb-step');
  await page.waitForFunction(() => /字幕預覽/.test(document.querySelector('#flowbar .fb-step.on')?.textContent || ''), { timeout: 15000 });
  assert.match(await page.$eval('#next', (n) => n.textContent), /不用回報/);
  const rep = await page.evaluate(() => ({ voice: window.__editor.voiceOnly, gaps: window.__editor.voiceUncovered.length, none: window.__editor.uncovered.length, errs: window.__editor.report.issues.errors }));
  assert.ok(rep.voice.length >= 1 && rep.voice[0][0] < 9, JSON.stringify(rep.voice));
  assert.deepEqual([rep.gaps, rep.none, rep.errs], [0, 0, []], '之後才要處理的事現在不要報');
  // 播放頭移到黑屏
  await page.evaluate(() => window.__editor.seek(13.5));
  await page.waitForFunction(() => /這裡只有聲音/.test(document.querySelector('#nowBar').textContent), { timeout: 5000 });
  await page.waitForFunction(() => /第 7 句字幕/.test(document.querySelector('#simCaption').textContent), { timeout: 5000 });
  await page.evaluate(() => window.__editor.seek(3.5));
  await page.waitForFunction(() => /這裡只有講者/.test(document.querySelector('#nowBar').textContent), { timeout: 5000 });
  assert.deepEqual(errors, []);
});

test('初剪預覽：改字幕自動存，寫回 rough.srt，plan.json 還是沒有段落', async () => {
  await page.click('.side-tabs [data-side="cues"]');
  await page.waitForSelector('#cueList [data-cue="6"]', { visible: true });
  // 清單隨時可能重畫（換分頁、檢查結果回來）：找到就點，中間不留空檔；正在改字時不會重畫
  await page.evaluate(() => document.querySelector('#cueList [data-cue="6"]').click());
  await page.waitForSelector('#cueList [data-cue="6"] .cue-edit');
  await page.waitForFunction(() => document.activeElement?.classList.contains('cue-edit'));
  await page.keyboard.type('改');
  await page.keyboard.press('Enter');
  const until = Date.now() + 15000;
  while (Date.now() < until && !/第 6 句字幕改/.test(fs.readFileSync(srtFile(), 'utf8'))) await sleep(100);
  assert.match(fs.readFileSync(srtFile(), 'utf8'), /第 6 句字幕改/);
  const plan = JSON.parse(fs.readFileSync(planFile(), 'utf8'));
  assert.equal(plan.version, 1);
  assert.ok(!plan.scenes?.length, '存檔不會多出段落');
  assert.deepEqual(errors, []);
});

test('影片播不了：還在處理就等它，好了自動接上；沒有在處理才報錯', async () => {
  const before = await page.evaluate(() => window.__editor.server.video.url);
  const next = `${before}x`;
  let phase = 'wait';
  await page.setRequestInterception(true);
  const onReq = async (req) => {
    if (!req.url().endsWith('/api/state')) return req.continue();
    const real = await (await fetch(req.url())).json();
    real.video = phase === 'wait' ? { ...real.video, preparing: true } : phase === 'ready' ? { ...real.video, url: next, preparing: false } : { ...real.video, url: next, preparing: false };
    return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(real) });
  };
  page.on('request', onReq);
  await page.evaluate(() => { window.__editor.seek(3); window.__editor.onVideoError('瀏覽器播不了 rough.mp4'); });
  await page.waitForFunction(() => /影片處理中/.test(document.querySelector('#stageEmpty').textContent) && !document.querySelector('#stageEmpty').hidden, { timeout: 5000 });
  phase = 'ready';
  await page.waitForFunction(() => document.querySelector('#stageEmpty').hidden, { timeout: 10000 });
  assert.equal(await page.$eval('video', (v) => v.getAttribute('src')), next);
  // 沒有在處理、網址也沒變：才告訴使用者播不了
  await page.evaluate(() => window.__editor.onVideoError('瀏覽器播不了 rough.mp4'));
  await page.waitForFunction(() => /播不了影片/.test(document.querySelector('#stageEmpty').textContent), { timeout: 5000 });
  page.off('request', onReq);
  await page.setRequestInterception(false);
  assert.deepEqual(errors, []);
});
