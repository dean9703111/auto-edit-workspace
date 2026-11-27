// 058 完成影片預覽裡聲音、字幕樣式、重點字幕即時生效、「更新預覽」發光（要瀏覽器；真的 build 一次，播放器用工作區 node_modules 那一份）
//   拖人聲、音效滑桿、按軌頭 🔇：播放器裡元素的 data-volume 馬上變（播放器每一格照它設 Web Audio 增益），按鈕不發光，預覽旁邊寫「已即時套用」
//   換字幕樣式、標重點字幕：播放器裡的字幕馬上換，按鈕不發光；換主題照樣發光（背景圖是 build 寫死的）
//   按播放：有聲音的影片放進 audio group（走 Web Audio，調大才聽得到）
//   改瘦臉：右上角「更新預覽」和講者區的小按鈕都發光；減少動態效果時是固定的光圈；更新中不發光
//   更新完播放器重新載入：差歸 0，之後再改照樣即時生效
import { test as nodeTest } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { startEditor } from '../../shared/template/tools/editor.mjs';
import { findChrome } from '../../shared/template/tools/lib/audit-browser.mjs';
import { TEMPLATE, TOOLS, WORKSPACE, makeSrt, missingTools, skipAll, tmpDir } from './helpers.mjs';

const noUi = await missingTools('chrome', 'ffmpeg', 'puppeteer');
const test = skipAll(nodeTest, noUi);
const puppeteer = noUi ? null : (await import('puppeteer-core')).default;
const wait = (ms = 200) => new Promise((r) => setTimeout(r, ms));
const PLAN = { version: 1, look: false, rhythm: 'spaced', bed: { music: null }, edit: { sfx: [{ at: 1, sound: 'ding' }] }, scenes: [{ id: 's01', scene: 'concept', from: '#2', to: '#3e', slots: { text: '字卡' } }] };   // 要有一段：沒有段＝還在剪乾淨，沒有「更新預覽」

test('完成影片預覽：拖聲音滑桿、按 🔇 馬上改播放器裡的音量、不發光；改瘦臉兩顆「更新預覽」都發光、減少動態效果是固定光圈、更新中不發光；更新完重新接上', { timeout: 300000 }, async (t) => {
  const root = tmpDir(t, 'editor-live-sound-ui-');
  const shared = path.join(root, 'shared');
  fs.mkdirSync(shared);
  fs.symlinkSync(TEMPLATE, path.join(shared, 'template'), 'junction');
  fs.symlinkSync(path.join(WORKSPACE, 'shared', 'sfx'), path.join(shared, 'sfx'), 'junction');
  fs.symlinkSync(path.join(WORKSPACE, 'node_modules'), path.join(root, 'node_modules'), 'junction');   // 播放器（只讀）
  fs.writeFileSync(path.join(shared, 'setting.json'), JSON.stringify({ editor: { seen: ['coach-rough.v1', 'coach-final.v1', 'coach.v3'] } }));
  const project = path.join(root, 'projects', 'example'), work = path.join(project, 'work'), out = path.join(work, 'hyperframes');
  fs.mkdirSync(out, { recursive: true });
  const planFile = path.join(out, 'plan.json');
  fs.writeFileSync(planFile, `${JSON.stringify(PLAN, null, 2)}\n`);
  fs.writeFileSync(path.join(work, 'rough.srt'), makeSrt({ n: 3 }));
  const made = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=navy:size=320x180:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=48000', '-t', '10', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', path.join(work, 'rough.mp4')]);
  assert.equal(made.status, 0, String(made.stderr));
  const built = spawnSync(process.execPath, [path.join(TOOLS, 'build.mjs'), '--project', project, '--template', path.join(shared, 'template')], { cwd: root, encoding: 'utf8' });
  assert.equal(built.status, 0, built.stdout + built.stderr);

  const ed = await startEditor({ cwd: root, flags: { project, template: path.join(shared, 'template') }, port: 0, writeState: false, speakerTemplate: path.join(shared, 'template') });
  t.after(() => ed.close());
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--no-first-run', '--autoplay-policy=no-user-gesture-required'] });
  t.after(() => browser.close());
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewport({ width: 1600, height: 950 });
  await page.goto(`${ed.url}?view=final`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__editor?.started && window.__editor.reportReady, { timeout: 60000 });
  const app = (fn, ...args) => page.evaluate(fn, ...args);
  const until = async (fn, what, n = 150) => { for (let i = 0; i < n; i++) { if (await fn()) return; await wait(100); } assert.fail(typeof what === 'function' ? await what() : what); };
  const saved = () => until(() => app(() => document.querySelector('#saveState').dataset.state === 'saved'), '要自動存好');
  await until(() => app(() => window.__editor.mode === 'player' && window.__editor.player?.live?.on === true), () => app(() => `播放器要接上聲音：${window.__editor.mode} ${JSON.stringify(window.__editor.player?.live)}`), 300);
  const frame = () => page.frames().find((f) => f.url().includes('/composition/'));
  const vol = (id) => frame().evaluate((id) => { const e = document.getElementById(id); return e ? [e.getAttribute('data-volume'), e.getAttribute('data-audio-group')] : null; }, id);
  const ui = () => app(() => {
    const b = document.querySelector('#btnBuild'), s = document.querySelector('#lookPending button');
    return { glow: b.classList.contains('glow'), primary: b.classList.contains('primary'), exportPrimary: document.querySelector('#btnExport').classList.contains('primary'),
      note: document.querySelector('#modeNote').textContent, look: document.querySelector('#lookPending')?.textContent ?? '', lookGlow: !!s?.classList.contains('glow') };
  });
  const slide = (f, v) => app(([f, v]) => { const el = document.querySelector(`#inspBody [data-f="${f}"]`); el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, [f, v]).then(() => wait(200));   // 播放器下一格才套

  // 剛 build 完：不發光，輸出是主要按鈕；播放器裡是 build 寫的音量
  let u = await ui();
  assert.deepEqual([u.glow, u.primary, u.exportPrimary, u.look], [false, false, true, '']);
  const own0 = Number((await vol('sfx-own1'))[0]);
  assert.ok(own0 > 0, '自己加的那一顆有 data-volume');
  assert.equal((await vol('rough'))[0], null, '人聲 0 dB：build 沒寫 data-volume');

  // 人聲 +6：馬上改（還沒存也算），不發光
  await slide('vol.voice', 6);
  assert.equal((await vol('rough'))[0], '1.9953');
  u = await ui();
  assert.deepEqual([u.glow, u.primary], [false, false], '只差聲音不發光（還沒存）');
  await saved();
  await until(() => app(() => window.__editor.server.preview.liveOnly === true), '存好之後服務說只差直接套得上的');
  u = await ui();
  assert.deepEqual([u.glow, u.primary, u.exportPrimary, u.note], [false, false, true, '已即時套用；輸出時會一起做進去']);
  // 音效 −6：自己加的那一顆跟著乘
  await slide('vol.sfx', -6);
  assert.ok(Math.abs(Number((await vol('sfx-own1'))[0]) - own0 * 10 ** (-6 / 20)) < 1e-3);
  // 軌頭 🔇：0；再按回來
  await page.click('#tlHeads [data-mute="voice"]'); await wait(200);
  assert.equal((await vol('rough'))[0], '0');
  await page.click('#tlHeads [data-mute="voice"]'); await wait(200);
  assert.equal((await vol('rough'))[0], '1.9953');
  // 按播放：有聲音的影片放進 audio group（走 Web Audio）
  await page.click('#btnPlay'); await wait(600);
  assert.equal((await vol('rough'))[1], 'editor-live');
  await page.click('#btnPlay');
  await saved();
  assert.equal((await ui()).glow, false);

  // 瘦臉：兩顆都發光，講者區寫哪一項、要多久
  await page.click('#inspBody [data-look-on="slim"]'); await wait(200);
  u = await ui();
  assert.deepEqual([u.glow, u.primary, u.exportPrimary, u.lookGlow], [true, true, false, true]);
  assert.match(u.look, /瘦臉還沒做進完成影片預覽：要重新處理影片底片/);
  assert.match(u.note, /有新修改/);
  assert.equal(await app(() => getComputedStyle(document.querySelector('#btnBuild')).animationName), 'glow-breathe');
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  const still = await app(() => { const s = getComputedStyle(document.querySelector('#btnBuild')); return [s.animationName, s.boxShadow]; });
  assert.equal(still[0], 'none', '減少動態效果：不呼吸');
  assert.notEqual(still[1], 'none', '固定的光圈');
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  // 關掉瘦臉：look 變成 {color:0, slim:0}，和 build 時的 false 做出來一樣，又只差聲音
  await page.click('#inspBody [data-look-on="slim"]'); await saved();
  await until(async () => !(await ui()).glow && (await ui()).look === '', '瘦臉關掉之後不發光');

  // 字幕樣式、重點字幕：播放器裡的字幕馬上換，不發光
  // 字幕 root：HyperFrames 0.9 接進主文件後 id 換成 data-hf-authored-id
  const cap = () => frame().evaluate(() => { const r = document.querySelector('#captions, [data-hf-authored-id="captions"]'); return { look: r?.dataset.cap ?? null, em: !!document.querySelector('#cg-2')?.classList.contains('cg--em') }; });
  assert.deepEqual(await cap(), { look: null, em: false });
  await app(() => document.querySelector('#inspBody [data-act="capLook"][data-v="outline"]').click());
  await until(async () => (await cap()).look === 'outline', '字幕樣式馬上換');
  assert.equal((await ui()).glow, false, '換字幕樣式不發光（還沒存）');
  await app(() => window.__editor.select({ kind: 'cue', id: 2 })); await wait(200);
  await app(() => document.querySelector('#inspBody [data-act="capMark"]').click());
  await until(async () => (await cap()).em, '重點字幕馬上換');
  await app(() => window.__editor.select(null)); await wait(200);
  await saved();
  await until(() => app(() => window.__editor.server.preview.liveOnly === true), '存好之後還是只差直接套得上的');
  u = await ui();
  assert.deepEqual([u.glow, u.primary, u.exportPrimary, u.note], [false, false, true, '已即時套用；輸出時會一起做進去']);
  const saved1 = JSON.parse(fs.readFileSync(planFile, 'utf8'));
  assert.deepEqual([saved1.captionStyle?.look, saved1.captionMarks], ['outline', ['#2']]);

  // 換主題（背景圖要更新預覽才會換）→ 發光；按下去更新中不發光
  await app(() => document.querySelector('#inspBody [data-act="theme"][data-v="dark"]').click());
  await until(async () => (await ui()).glow, '換主題要發光');
  await saved();
  await page.click('#btnBuild');
  await until(() => app(() => window.__editor.building), '開始更新');
  u = await ui();
  assert.deepEqual([u.glow, u.primary], [false, false], '更新中不發光');
  await until(() => app(() => !window.__editor.building), '更新完', 600);
  await until(() => app(() => window.__editor.server.preview.stale === false && window.__editor.player?.live?.on === true), '新的預覽接上', 300);
  u = await ui();
  assert.deepEqual([u.glow, u.primary, u.exportPrimary], [false, false, true]);
  // 重新載入的播放器：差歸 0（build 已經做進去 +6），再拖照樣即時
  await until(async () => (await vol('rough'))?.[0] === '1.995', async () => `重新 build 之後是 build 寫的值：${JSON.stringify(await vol('rough'))}`);
  await slide('vol.voice', 0);
  assert.ok(Math.abs(Number((await vol('rough'))[0]) - 1.995 * 10 ** (-6 / 20)) < 1e-3, '新的播放器也接上了');
  assert.equal((await ui()).glow, false);
  await saved();
  assert.equal(JSON.parse(fs.readFileSync(planFile, 'utf8')).edit.volume.voice, 0);
  assert.deepEqual(errors, []);
});
