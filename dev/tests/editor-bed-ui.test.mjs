// 057 第二輪：時間軸「背景音樂」軌的軌頭（要瀏覽器）——和人聲、音效軌同一套
//   數字＝plan.json 的 bed.volume（0＝曲庫檔原本的音量，−40～+6，一格 1 dB）：和「整支 → 聲音 → 背景音樂」滑桿同步，上下拖、直接打數字都會存
//   🔇＝靜音：寫 bed.volume −40（完成影片不放），再按一次回到原本的值；這一軌畫暗的、快速試聽不出聲
//   🔒＝鎖定：和其他軌一樣只在頁面上，擋這一軌在時間軸上的編輯（右鍵「調整背景音樂音量」灰掉）
//   沒有背景音樂：數字、靜音灰掉
import { test as nodeTest } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { startEditor } from '../../shared/template/tools/editor.mjs';
import { findChrome } from '../../shared/template/tools/lib/audit-browser.mjs';
import { writeBedInfo } from '../../shared/template/tools/lib/music.mjs';
import { TEMPLATE, WORKSPACE, makeSrt, missingTools, skipAll, tmpDir } from './helpers.mjs';

const noUi = await missingTools('chrome', 'ffmpeg', 'puppeteer');
const test = skipAll(nodeTest, noUi);
const puppeteer = noUi ? null : (await import('puppeteer-core')).default;
const wait = (ms = 200) => new Promise((r) => setTimeout(r, ms));
const SCENES = [{ id: 's01', scene: 'concept', from: '#2', to: '#3e', slots: { text: '字卡' } }];

// 暫存工作區：shared/template、shared/sfx 連到這個 repo 的（只讀；底樂用內建的 bgm-cylinder-five），10 句字幕、37 秒的影片；
// built＝假裝上一次 build 混好的底樂 wav（.cache/bed.json），快速試聽才有東西播
async function setup(t, plan, { built = false } = {}) {
  const root = tmpDir(t, 'editor-bed-ui-');
  const shared = path.join(root, 'shared');
  fs.mkdirSync(shared);
  fs.symlinkSync(TEMPLATE, path.join(shared, 'template'), 'dir');
  fs.symlinkSync(path.join(WORKSPACE, 'shared', 'sfx'), path.join(shared, 'sfx'), 'dir');
  fs.writeFileSync(path.join(shared, 'setting.json'), JSON.stringify({ editor: { seen: ['coach-rough.v1', 'coach-final.v1', 'coach.v3'] } }));
  const project = path.join(root, 'projects', 'example'), work = path.join(project, 'work'), out = path.join(work, 'hyperframes');
  fs.mkdirSync(path.join(out, 'assets'), { recursive: true });
  const planFile = path.join(out, 'plan.json');
  fs.writeFileSync(planFile, `${JSON.stringify(plan, null, 2)}\n`);
  fs.writeFileSync(path.join(work, 'rough.srt'), makeSrt({ n: 10 }));
  const made = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=navy:size=320x180:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=48000', '-t', '37', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', path.join(work, 'rough.mp4')]);
  assert.equal(made.status, 0, String(made.stderr));
  if (built) {
    const wav = path.join(out, 'assets', 'bed-bgm-cylinder-five-0123456789ab.wav');
    assert.equal(spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=330:sample_rate=48000', '-t', '40', '-ac', '2', wav]).status, 0);
    writeBedInfo(out, { file: 'assets/bed-bgm-cylinder-five-0123456789ab.wav', music: 'bgm-cylinder-five', volume: plan.bed?.volume ?? 0, at: 0, dur: 40 });
  }
  const ed = await startEditor({ cwd: root, flags: { project, template: path.join(shared, 'template') }, port: 0, writeState: false, speakerTemplate: path.join(shared, 'template') });
  t.after(() => ed.close());
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--no-first-run', '--autoplay-policy=no-user-gesture-required'] });
  t.after(() => browser.close());
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewport({ width: 1600, height: 950 });
  await page.goto(`${ed.url}?view=sim`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__editor?.started && window.__editor.reportReady, { timeout: 60000 });
  await wait(300);
  const app = (fn, ...args) => page.evaluate(fn, ...args);
  const readPlan = () => JSON.parse(fs.readFileSync(planFile, 'utf8'));
  const until = async (fn, what) => { for (let i = 0; i < 100; i++) { if (await fn()) return; await wait(100); } assert.fail(typeof what === 'function' ? what() : what); };
  const saved = () => until(() => app(() => document.querySelector('#saveState').dataset.state === 'saved'), '要自動存好');
  const head = () => app(() => {
    const h = document.querySelector('#tlHeads [data-lane="bed"]'), A = window.__editor;
    const inp = h.querySelector('input.db'), mute = h.querySelector('[data-mute="bed"]'), lock = h.querySelector('[data-lock="bed"]');
    return { value: inp?.value, min: inp?.min, max: inp?.max, step: inp?.step, disabled: inp?.disabled, mute: mute?.classList.contains('on'), muteOff: mute?.disabled, lock: lock?.classList.contains('on'),
      slider: document.querySelector('#inspBody [data-f="bedVol"]')?.value ?? null, out: document.querySelector('#inspBody [data-out="bedVol"]')?.textContent ?? null,
      bedVol: A.bedVol, muted: A.trackMuted('bed'), locked: A.trackLocked('bed'), play: A.bedPlay() };
  });
  const center = (sel) => app((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
  const click = async (sel) => { const c = await center(sel); await page.mouse.click(c.x, c.y); await wait(200); };
  const lanePos = (time) => app((time) => { const T = window.__editor.timeline, r = document.querySelector('#tlCanvas').getBoundingClientRect(); return { x: r.left + T.xOf(time), y: r.top + (T.L.bed[0] + T.L.bed[1]) / 2 }; }, time);
  const menuItem = (label) => app((label) => { const e = [...document.querySelectorAll('#ctxMenu .ctx-item')].find((x) => x.querySelector('.lb').textContent === label); return e ? { off: e.classList.contains('is-disabled'), why: e.dataset.why ?? '', checked: e.getAttribute('aria-checked') } : null; }, label);
  return { page, errors, planFile, readPlan, app, until, saved, head, click, center, lanePos, menuItem };
}

test('背景音樂軌頭：數字和滑桿同步（上下拖、打數字都存 bed.volume）；🔇 寫 −40、這一軌變暗、試聽不出聲，再按回到原本的值；🔒 擋時間軸上的編輯', { timeout: 240000 }, async (t) => {
  const { page, errors, readPlan, app, until, saved, head, click, center, lanePos, menuItem } = await setup(t, { version: 1, bed: { music: 'bgm-cylinder-five', volume: 3 }, scenes: SCENES }, { built: true });
  await until(() => app(() => window.__editor.bedView?.kind === 'on'), '檢查報告出來後，背景音樂軌要畫一條');

  // 軌頭：數字＝bed.volume，範圍 −40～+6、一格 1；有靜音和鎖頭，和人聲軌同一個樣子
  let h = await head();
  assert.deepEqual([h.value, h.min, h.max, h.step, h.disabled, h.mute, h.lock, h.slider, h.out], ['3', '-40', '6', '1', false, false, false, '3', '+3 dB']);
  assert.deepEqual(await app(() => [...document.querySelectorAll('#tlHeads [data-lane="voice"] > *, #tlHeads [data-lane="bed"] > *')].map((e) => `${e.closest('.th').dataset.lane}:${e.tagName}.${e.className.split(' ')[0]}`)),
    ['voice:SPAN.nm', 'voice:SPAN.warnico', 'voice:INPUT.db', 'voice:BUTTON.mute', 'voice:BUTTON.lock', 'bed:SPAN.nm', 'bed:INPUT.db', 'bed:BUTTON.mute', 'bed:BUTTON.lock'], '和人聲軌同一組軌頭');
  assert.equal(h.play.gain.toFixed(3), '1.000', '做進 wav 的就是 +3：即時試聽不用補');

  // 上下拖數字：往上 16 px＝+4 dB，一格 1 dB、最多 +6；滑桿跟著，存進 plan.json
  const c = await center('#tlHeads [data-db="bed"]');
  await page.mouse.move(c.x, c.y); await page.mouse.down();
  await page.mouse.move(c.x, c.y - 8, { steps: 4 }); await page.mouse.move(c.x, c.y - 30, { steps: 6 });
  await page.mouse.up(); await wait(300);
  h = await head();
  assert.deepEqual([h.value, h.bedVol, h.slider, h.out], ['6', 6, '6', '+6 dB'], '拖到上限 +6');
  assert.ok(Math.abs(h.play.gain - 10 ** (3 / 20)) < 1e-6, `即時試聽補 +3 dB：${h.play.gain}`);
  await saved();
  assert.deepEqual(readPlan().bed, { music: 'bgm-cylinder-five', volume: 6 });

  // 打數字：超出範圍夾回 −40～+6；0＝原本的音量（plan.json 拿掉 volume）
  const typeDb = async (v) => { await page.$eval('#tlHeads [data-db="bed"]', (e, v) => { e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); }, v); await wait(200); };
  await typeDb('0'); await saved();
  assert.deepEqual(readPlan().bed, { music: 'bgm-cylinder-five' });
  assert.equal((await head()).out, '0 dB');
  await typeDb('-55'); await saved();
  assert.equal(readPlan().bed.volume, -40, '−55 夾到 −40（＝靜音）');
  assert.equal((await head()).mute, true, '音量到 −40＝靜音亮起來（和人聲 −60 一樣）');
  await typeDb('-4'); await saved();
  assert.equal(readPlan().bed.volume, -4);

  // 🔇：寫 −40，這一軌變暗（trackMuted）、試聽增益 0；報告也說靜音
  await click('#tlHeads [data-mute="bed"]');
  h = await head();
  assert.deepEqual([h.mute, h.muted, h.bedVol, h.value, h.play.gain], [true, true, -40, '-40', 0]);
  await saved();
  assert.equal(readPlan().bed.volume, -40);
  await until(() => app(() => window.__editor.report?.data?.bed?.muted === true), '檢查報告：bed.muted');
  assert.equal(await app(() => window.__editor.bedView.muted), true, '時間軸那一條照報告畫暗的');
  // 再按一次：回到靜音前的 −4
  await click('#tlHeads [data-mute="bed"]');
  h = await head();
  assert.deepEqual([h.mute, h.bedVol, h.value], [false, -4, '-4']);
  await saved();
  assert.equal(readPlan().bed.volume, -4);
  // ⌘Z 復原也回得去
  await page.keyboard.down('Control'); await page.keyboard.press('z'); await page.keyboard.up('Control'); await wait(300);
  assert.equal((await head()).bedVol, -40, '復原＝回到靜音');
  await page.keyboard.down('Control'); await page.keyboard.press('y'); await page.keyboard.up('Control'); await wait(300);
  assert.equal((await head()).bedVol, -4, '重做');
  await saved();

  // 🔒：只在頁面上（不寫 plan.json）；鎖住時右鍵「調整背景音樂音量」灰掉並寫原因，選單也能解鎖
  const planBefore = JSON.stringify(readPlan());
  await click('#tlHeads [data-lock="bed"]');
  assert.deepEqual([(await head()).lock, (await head()).locked], [true, true]);
  const p = await lanePos(10);
  await page.mouse.click(p.x, p.y, { button: 'right' }); await wait(150);
  assert.deepEqual(await menuItem('調整背景音樂音量'), { off: true, why: '「背景音樂」軌已鎖定 → 點軌頭的鎖頭解鎖', checked: null });
  assert.equal((await menuItem('鎖定這一軌')).checked, 'true');
  assert.ok(await menuItem('靜音這一軌'), '右鍵也能靜音（和其他軌一樣）');
  await page.keyboard.press('Escape'); await wait(100);
  await click('#tlHeads [data-lock="bed"]');
  assert.equal((await head()).lock, false);
  await page.mouse.click(p.x, p.y, { button: 'right' }); await wait(150);
  assert.equal((await menuItem('調整背景音樂音量')).off, false);
  await page.keyboard.press('Escape');
  await wait(1200);
  assert.equal(JSON.stringify(readPlan()), planBefore, '鎖定不寫 plan.json');
  assert.deepEqual(errors, []);
});

test('沒有背景音樂、這一集不配：軌頭的數字和靜音灰掉，按了也不寫', { timeout: 120000 }, async (t) => {
  const { errors, readPlan, app, until, head, click } = await setup(t, { version: 1, bed: { music: null }, scenes: SCENES });
  await until(() => app(() => window.__editor.bedView?.kind === 'off'), '這一集不配');
  const h = await head();
  assert.deepEqual([h.value, h.disabled, h.muteOff, h.muted], ['', true, true, false]);
  await click('#tlHeads [data-mute="bed"]');
  await click('#tlHeads [data-lock="bed"]');
  assert.equal((await head()).lock, true, '鎖頭照樣能按（和其他軌一樣）');
  await new Promise((r) => setTimeout(r, 1200));
  assert.deepEqual(readPlan().bed, { music: null });
  assert.deepEqual(errors, []);
});
