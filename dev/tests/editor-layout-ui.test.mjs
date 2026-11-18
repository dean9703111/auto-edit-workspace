// 048 剪輯台的版面彈性（要瀏覽器）：
//   1. 預覽和右側面板中間有一條可以左右拖的線：拖了面板變寬／變窄（有上下限）、記在瀏覽器、重新整理還在、雙擊回到預設、鍵盤左右也能調
//   2. 時間軸的軌道比放得下的高時：預覽不會被擠到不見、狀態列不會被切掉，軌道那一塊自己上下捲，捲軸一直在（不是滑過去才出現）；
//      在軌道上往下滾＝捲軌道，按住 Shift 滾照舊是前後移動時間（不捲軌道）；放得下時沒有捲軸
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
const LANE_KEY = 'auto-edit-editor.lane-scale', INSP_KEY = 'auto-edit-editor.insp-w';

test('右側面板可以拖寬度、時間軸放不下時自己上下捲（捲軸一直在）', { timeout: 180000 }, async (t) => {
  const root = tmpDir(t, 'editor-layout-ui-');
  const shared = path.join(root, 'shared');
  fs.mkdirSync(shared);
  fs.symlinkSync(TEMPLATE, path.join(shared, 'template'), 'dir');
  // 提示卡都看過了：不擋住要拖的地方
  fs.writeFileSync(path.join(shared, 'setting.json'), JSON.stringify({ editor: { seen: ['coach-rough.v1', 'coach-final.v1', 'coach.v3'] } }));
  const project = path.join(root, 'projects', 'alpha'), work = path.join(project, 'work');
  fs.mkdirSync(path.join(work, 'hyperframes'), { recursive: true });
  fs.writeFileSync(path.join(work, 'hyperframes', 'plan.json'), '{\n  "version": 1\n}\n');
  fs.writeFileSync(path.join(work, 'rough.srt'), [1, 2, 3, 4].map((n) => `${n}\n00:00:0${(n - 1) * 2},500 --> 00:00:0${n * 2},000\n第${n}段字幕\n`).join('\n'));
  const made = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=navy:size=320x180:rate=30', '-t', '9', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(work, 'rough.mp4')]);
  assert.equal(made.status, 0, String(made.stderr));
  const ed = await startEditor({ cwd: root, flags: { project, template: path.join(shared, 'template') }, port: 0, writeState: false, speakerTemplate: path.join(shared, 'template') });
  t.after(() => ed.close());

  // 捲軸要真的畫出來才量得到寬度：拿掉 puppeteer 預設的 --hide-scrollbars
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--no-first-run'], ignoreDefaultArgs: ['--hide-scrollbars'] });
  t.after(() => browser.close());
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const open = async () => { await page.goto(ed.url, { waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => window.__editor?.started, { timeout: 60000 }); await new Promise((r) => setTimeout(r, 300)); };
  const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms));
  const m = () => page.evaluate((keys) => {
    const q = (s) => document.querySelector(s), b = (s) => { const r = q(s).getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), bottom: Math.round(r.bottom) }; };
    const tb = q('.tl-body');
    return { H: innerHeight, W: innerWidth, ws: b('#workspace'), viewer: b('.viewer'), insp: b('#inspector'), canvas: b('#tlCanvas'), status: b('.statusbar'),
      tl: { top: tb.scrollTop, sh: tb.scrollHeight, ch: tb.clientHeight, bar: tb.offsetWidth - tb.clientWidth, oy: getComputedStyle(tb).overflowY },
      inspVar: q('#workspace').style.getPropertyValue('--insp-w'), saved: localStorage.getItem(keys[1]) };
  }, [LANE_KEY, INSP_KEY]);

  // ---------- 1. 右側面板的拖拉條 ----------
  await page.setViewport({ width: 1440, height: 900 });
  await open();
  const a = await m();
  assert.equal(a.insp.w, 372, '沒拖過＝預設 372');
  assert.equal(await page.$eval('#inspResize', (el) => `${el.getAttribute('role')}|${el.getAttribute('aria-orientation')}|${el.tabIndex}`), 'separator|vertical|0');
  const gy = a.insp.y + 120;
  const drag = async (from, dx) => { await page.mouse.move(from, gy); await page.mouse.down(); await page.mouse.move(from + dx / 2, gy, { steps: 3 }); await page.mouse.move(from + dx, gy, { steps: 3 }); await page.mouse.up(); await wait(); };
  await drag(a.insp.x, -180);
  const b = await m();
  assert.deepEqual([b.insp.w, b.inspVar, b.saved, b.viewer.w], [552, '552px', '552', 1440 - 552], '往左拖 180：面板寬 552，預覽讓出來');
  await open();
  assert.equal((await m()).insp.w, 552, '重新整理還在');
  await drag(b.insp.x, 900);
  assert.equal((await m()).insp.w, 280, '往右拖過頭：停在下限 280');
  await drag((await m()).insp.x, -900);
  assert.equal((await m()).insp.w, 720, '往左拖過頭：停在上限 720');
  await page.focus('#inspResize');
  await page.keyboard.press('ArrowRight');
  await wait();
  assert.deepEqual([(await m()).insp.w, (await m()).saved], [704, '704'], '方向鍵右：窄 16');
  // 視窗變窄：預覽至少留 480，面板跟著縮
  await page.setViewport({ width: 1120, height: 900 });
  await wait(400);
  assert.equal((await m()).insp.w, 640);
  await page.setViewport({ width: 1440, height: 900 });
  await wait(400);
  const g = await m();
  await page.mouse.click(g.insp.x, gy, { count: 2 });
  await wait();
  const back = await m();
  assert.deepEqual([back.insp.w, back.inspVar, back.saved], [372, '', ''], '雙擊：回到預設，不再記');

  // ---------- 2. 時間軸放不下時自己捲 ----------
  // 放得下：沒有捲軸
  assert.ok(back.tl.sh <= back.tl.ch + 1 && back.tl.bar <= 2, `放得下時不捲：${JSON.stringify(back.tl)}`);
  // 軌道拉到最高、視窗矮：放不下
  await page.evaluate((k) => localStorage.setItem(k, '2.2'), LANE_KEY);
  await page.setViewport({ width: 1440, height: 560 });
  await open();
  const s = await m();
  assert.ok(s.tl.sh > s.tl.ch + 20, `軌道比放得下的高：${JSON.stringify(s.tl)}`);
  assert.equal(s.tl.oy, 'auto');
  assert.equal(s.tl.bar, 14, '捲軸一直在：12 px 寬（＋左右邊框各 1）');
  assert.ok(s.ws.h >= Math.min(300, Math.round(s.H * 0.45)) - 1, `預覽那一列至少留 min(300, 45vh)：${s.ws.h}`);
  assert.ok(s.status.bottom <= s.H, '狀態列沒有被切到畫面外');
  // 在軌道上往下滾：捲軌道
  await page.mouse.move(s.canvas.x + 300, s.canvas.y + 30);
  await page.mouse.wheel({ deltaY: 120 });
  await wait();
  const down = (await m()).tl.top;
  assert.ok(down > 0, '往下滾：軌道往下捲');
  // 按住 Shift 滾：照舊是前後移動時間，軌道不捲
  await page.keyboard.down('Shift');
  await page.mouse.wheel({ deltaY: -120 });
  await page.keyboard.up('Shift');
  await wait();
  assert.equal((await m()).tl.top, down, '按住 Shift 滾不捲軌道');
  await page.mouse.wheel({ deltaY: -400 });
  await wait();
  assert.equal((await m()).tl.top, 0, '往上滾回頂');
  assert.deepEqual(errors, []);
});
