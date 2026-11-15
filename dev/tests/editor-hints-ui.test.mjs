// 提示卡只跳第一次（044）的頁面行為：在 A 專案的剪輯台關掉提示卡，另一個 port 的 B 專案不再跳（記在暫存的 shared/setting.json）；
// 三張提示卡各記各的代號；設定檔壞了、服務沒有這個 API（還沒重開的舊服務）時頁面不壞，退回瀏覽器自己記。
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
const CARDS = ['coach', 'coachFinal', 'coachRough'];

test('提示卡：A 專案關掉 → 另一個 port 的 B 專案不再跳；三張各記各的；設定檔壞了、舊服務沒有 API 時退回瀏覽器自己記', { timeout: 120000 }, async (t) => {
  const root = tmpDir(t, 'editor-hints-ui-');
  const shared = path.join(root, 'shared'), setting = path.join(shared, 'setting.json');
  fs.mkdirSync(shared);
  fs.symlinkSync(TEMPLATE, path.join(shared, 'template'), 'dir');
  const speaker = { name: '測試講者', titles: ['工程師'] };
  fs.writeFileSync(setting, JSON.stringify({ speaker, agents: 7 }));
  const readSetting = () => JSON.parse(fs.readFileSync(setting, 'utf8'));
  // 兩個還在字幕預覽（plan.json 在、還沒排段落）的專案：開場要跳的是「這裡是字幕預覽」
  const media = path.join(root, 'rough.mp4');
  const made = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=navy:size=320x180:rate=30', '-t', '9', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', media]);
  assert.equal(made.status, 0, String(made.stderr));
  const editors = [];
  t.after(() => Promise.all(editors.map((ed) => ed.close())));
  for (const name of ['alpha', 'beta']) {
    const project = path.join(root, 'projects', name), work = path.join(project, 'work');
    fs.mkdirSync(path.join(work, 'hyperframes'), { recursive: true });
    fs.writeFileSync(path.join(work, 'hyperframes', 'plan.json'), '{\n  "version": 1\n}\n');
    fs.writeFileSync(path.join(work, 'rough.srt'), [1, 2, 3, 4].map((n) => `${n}\n00:00:0${(n - 1) * 2},500 --> 00:00:0${n * 2},000\n第${n}段字幕\n`).join('\n'));
    fs.copyFileSync(media, path.join(work, 'rough.mp4'));
    editors.push(await startEditor({ cwd: root, flags: { project, template: path.join(shared, 'template') }, port: 0, writeState: false, speakerTemplate: path.join(shared, 'template') }));
  }
  const [a, b] = editors;
  assert.notEqual(a.port, b.port);

  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--no-first-run'] });
  t.after(() => browser.close());
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewport({ width: 1440, height: 900 });
  const open = async (ed) => { await page.goto(ed.url, { waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => window.__editor?.started, { timeout: 60000 }); };
  const shown = () => page.evaluate((ids) => ids.filter((id) => !document.getElementById(id).hidden), CARDS);
  const local = () => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('auto-edit-editor.coach')).sort());
  const until = async (fn, what) => { for (let i = 0; i < 80; i++) { if (fn()) return; await new Promise((r) => setTimeout(r, 100)); } assert.fail(what()); };
  const seenIs = (want) => until(() => JSON.stringify(readSetting().editor?.seen) === JSON.stringify(want), () => `shared/setting.json 的 editor.seen 要是 ${JSON.stringify(want)}，現在 ${JSON.stringify(readSetting().editor)}`);

  // A：第一次打開會跳；關掉＝記到設定檔（講者、子代理數量都留著），瀏覽器自己不用記
  await open(a);
  assert.deepEqual(await shown(), ['coachRough']);
  await page.click('#coachRoughClose');
  assert.deepEqual(await shown(), []);
  await seenIs(['coach-rough.v1']);
  assert.deepEqual(readSetting(), { speaker, agents: 7, editor: { seen: ['coach-rough.v1'] } });
  assert.deepEqual(await local(), []);

  // B：另一個 port（另一個 origin，localStorage 是空的）不再跳；A 重新整理也不跳
  await open(b);
  assert.deepEqual(await local(), []);
  assert.deepEqual(await shown(), [], 'A 關掉過，B 不再跳');
  await open(a);
  assert.deepEqual(await shown(), []);

  // 另外兩張也是同一套：各記各的代號
  for (const [card, want] of [['coachFinal', ['coach-rough.v1', 'coach-final.v1']], ['coach', ['coach-rough.v1', 'coach-final.v1', 'coach.v2']]]) {
    await page.evaluate((id) => { document.getElementById(id).hidden = false; }, card);
    await page.click(`#${card}Close`);
    assert.deepEqual(await shown(), []);
    await seenIs(want);
  }

  // 設定檔壞了：讀不到＝照舊再跳一次；關掉時寫不進去，不蓋掉壞掉的檔，退回這個瀏覽器自己記，下次就不跳
  fs.writeFileSync(setting, '{ 壞掉的設定檔');
  await open(b);
  assert.deepEqual(await shown(), ['coachRough']);
  const failed = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/hints' && r.request().method() === 'POST');
  await page.click('#coachRoughClose');
  assert.equal((await failed).status(), 500);
  await page.waitForFunction(() => localStorage.getItem('auto-edit-editor.coach-rough.v1') === '1');
  assert.equal(fs.readFileSync(setting, 'utf8'), '{ 壞掉的設定檔');
  await open(b);
  assert.deepEqual(await shown(), []);

  // 還沒重開的舊服務沒有 /api/hints（回 404）：和以前一樣，這個瀏覽器自己記
  await page.setRequestInterception(true);
  page.on('request', (req) => (new URL(req.url()).pathname === '/api/hints' ? req.respond({ status: 404, contentType: 'application/json', body: '{"error":"notfound"}' }) : req.continue()));
  await open(a);
  assert.deepEqual(await shown(), ['coachRough']);
  await page.click('#coachRoughClose');
  await page.waitForFunction(() => localStorage.getItem('auto-edit-editor.coach-rough.v1') === '1');
  await open(a);
  assert.deepEqual(await shown(), []);

  assert.deepEqual(errors, []);
});
