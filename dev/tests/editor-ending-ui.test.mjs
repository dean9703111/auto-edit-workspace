// 076 剪輯台看得到片尾（要瀏覽器）
//   時間軸在影片後面多畫片尾卡那幾秒（只能看）：長度、時間顯示、播放頭走得進去、按 End 到片尾卡結尾
//   主軌的「片尾卡」方塊、「背景音樂」軌的片尾配樂：點得到、提示寫在哪裡與怎麼改；片尾卡那幾秒不能切、不能拖
//   快速試聽：影片播完接著走片尾卡（放示意：圖、金句一個字一個字出來），片尾配樂播上一次 build 烤好的那一段
//   沒有片尾卡、沒有片尾配樂：時間軸照舊到影片結尾，背景音樂軌寫「沒有背景音樂」
process.env.AUTO_EDIT_NO_LOCAL_BRAND = '0';   // 這支要讀暫存工作區自己的 shared/setting.json（ending）；helpers 預設關掉是為了不讀「這台機器」的
import { test as nodeTest } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { startEditor } from '../../shared/template/tools/editor.mjs';
import { findChrome } from '../../shared/template/tools/lib/audit-browser.mjs';
import { writeEndInfo } from '../../shared/template/tools/lib/music.mjs';
import { TEMPLATE, WORKSPACE, makeSrt, missingTools, skipAll, tmpDir } from './helpers.mjs';

const noUi = await missingTools('chrome', 'ffmpeg', 'puppeteer');
const test = skipAll(nodeTest, noUi);
const puppeteer = noUi ? null : (await import('puppeteer-core')).default;
const wait = (ms = 200) => new Promise((r) => setTimeout(r, ms));
const SCENES = [{ id: 's01', scene: 'concept', from: '#2', to: '#3e', slots: { text: '字卡' } }];
const VD = 37, CARD = 9.9;

// 暫存工作區：shared/template、shared/sfx 連到這個 repo 的（片尾配樂用內建的 bgm-cylinder-five）；ending＝shared/setting.json 的片尾設定（圖放 shared/brand/）；
// built＝假裝上一次 build 做進預覽的片尾配樂 wav 與片尾卡的圖（.cache/ending.json），快速試聽才有東西播、有圖放
async function setup(t, plan, { ending = true, built = false, motion = null } = {}) {
  const root = tmpDir(t, 'editor-ending-ui-');
  const shared = path.join(root, 'shared');
  fs.mkdirSync(path.join(shared, 'brand'), { recursive: true });
  fs.symlinkSync(TEMPLATE, path.join(shared, 'template'), 'dir');
  fs.symlinkSync(path.join(WORKSPACE, 'shared', 'sfx'), path.join(shared, 'sfx'), 'dir');
  const cover = path.join(shared, 'brand', 'cover.jpg');
  assert.equal(spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=white:size=300x420', '-frames:v', '1', cover]).status, 0);
  fs.writeFileSync(path.join(shared, 'setting.json'), JSON.stringify({ ...(ending ? { ending: { image: 'cover.jpg', seconds: CARD, quote: true, ...(motion ? { motion } : {}) } } : {}), editor: { seen: ['coach-rough.v1', 'coach-final.v1', 'coach.v3'] } }));
  const project = path.join(root, 'projects', 'example'), work = path.join(project, 'work'), out = path.join(work, 'hyperframes');
  fs.mkdirSync(path.join(out, 'assets', 'brand'), { recursive: true });
  fs.writeFileSync(path.join(out, 'plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
  fs.writeFileSync(path.join(work, 'rough.srt'), makeSrt({ n: 10 }));
  const made = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=navy:size=320x180:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=48000', '-t', String(VD), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', path.join(work, 'rough.mp4')]);
  assert.equal(made.status, 0, String(made.stderr));
  if (built) {
    const wav = path.join(out, 'assets', 'outro-bgm-cylinder-five-0123456789ab.wav');
    assert.equal(spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=330:sample_rate=48000', '-t', '17.9', '-ac', '2', wav]).status, 0);
    fs.copyFileSync(cover, path.join(out, 'assets', 'brand', 'ending-0123456789.jpg'));
    writeEndInfo(out, {
      outro: { file: 'assets/outro-bgm-cylinder-five-0123456789ab.wav', music: 'bgm-cylinder-five', at: 29, dur: 17.9, fadeIn: 3, fadeOut: 2 },
      ending: { at: VD, dur: CARD, image: 'assets/brand/ending-0123456789.jpg', quote: ['好內容', '才是一切的根源'], motion: 'type' },
    });
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
  const until = async (fn, what) => { for (let i = 0; i < 150; i++) { if (await fn()) return; await wait(100); } assert.fail(typeof what === 'function' ? what() : what); };
  // 時間軸上某一軌、某一秒的畫面座標；那一點的 hit 與提示
  const pos = (lane, time) => app((lane, time) => { const T = window.__editor.timeline, r = document.querySelector('#tlCanvas').getBoundingClientRect(); return { x: r.left + T.xOf(time), y: r.top + (T.L[lane][0] + T.L[lane][1]) / 2 }; }, lane, time);
  const hit = (lane, time) => app((lane, time) => { const A = window.__editor, T = A.timeline, h = T.hit(T.xOf(time), (T.L[lane][0] + T.L[lane][1]) / 2); return { kind: h.kind ?? null, t: h.t, tip: A.tlTip(h) }; }, lane, time);
  return { page, errors, app, until, pos, hit, planFile: path.join(out, 'plan.json') };
}
const r1 = (n) => Math.round(n * 10) / 10;

test('片尾卡與片尾配樂上時間軸：多畫片尾卡那幾秒、時間含片尾卡、點得到有提示；那幾秒不能切；快速試聽播完影片接著走片尾卡、片尾配樂跟著播', { timeout: 300000 }, async (t) => {
  const plan = { version: 1, outro: { music: 'bgm-cylinder-five', from: '#9' }, ending: { quote: '好內容，才是一切的根源。' }, scenes: SCENES };
  const { page, errors, app, until, pos, hit, planFile } = await setup(t, plan, { built: true });
  await until(() => app(() => window.__editor.endDur > 0 && !!window.__editor.outroView), '檢查報告出來後要有片尾卡和片尾配樂');

  // 時間軸：影片 37 秒＋片尾卡 9.9 秒；時間顯示、狀態列都含片尾卡
  await wait(300);
  let s = await app(() => { const A = window.__editor, T = A.timeline; return { endDur: A.endDur, vdur: T.vdur, dur: T.dur, tcDur: document.querySelector('#tcDur').textContent, st: document.querySelector('#stOut').textContent, end: A.endView, outro: A.outroView }; });
  assert.deepEqual([s.endDur, r1(s.vdur), r1(s.dur), s.tcDur], [CARD, VD, VD + CARD, '0:47']);
  assert.equal(s.st, '完成影片 0:47（含片尾卡 9.90 秒）');
  assert.deepEqual([s.end.dur, s.end.quote, s.end.lines, /\/composition\/assets\/brand\/ending-0123456789\.jpg\?v=/.test(s.end.image)], [CARD, '好內容，才是一切的根源', ['好內容', '才是一切的根源'], true]);
  assert.deepEqual([s.outro.music, s.outro.outStart, r1(s.outro.outEnd), s.outro.fadeOut > 0], ['bgm-cylinder-five', 29, VD + CARD, true]);

  // 主軌的片尾卡方塊、背景音樂軌的片尾配樂：點得到、提示寫在哪裡與怎麼改；影片裡照舊
  const card = await hit('main', 42);
  assert.equal(card.kind, 'ending');
  assert.match(card.tip, /^片尾卡 9\.90 秒：影片講完後接黑底的圖＋片尾金句「好內容，才是一切的根源」\n這幾秒不在錄影裡，只能看、不能剪/);
  for (const lane of ['anim', 'media', 'cap', 'voice', 'sfx']) assert.equal((await hit(lane, 42)).kind, 'ending', `${lane} 軌在片尾卡那幾秒只能看`);
  const music = await hit('bed', 42);
  assert.equal(music.kind, 'outro');
  assert.match(music.tip, /^片尾配樂「bgm-cylinder-five」　0:29 起播 17\.90 秒（最後 9\.90 秒在片尾卡）\n淡入 /);
  assert.equal((await hit('bed', 33)).kind, 'outro', '片尾配樂從講話時就開始');
  assert.equal((await hit('bed', 10)).kind, 'bed');
  assert.equal((await hit('main', 20)).kind, 'piece');
  assert.equal(await app(() => window.__editor.timeline.cv ? null : null), null);

  // 點片尾卡：播放頭走進去、方塊選起來；按 End 到片尾卡結尾；「現在」寫片尾卡
  let p = await pos('main', 42);
  await page.mouse.click(p.x, p.y);
  await wait(300);
  s = await app(() => { const A = window.__editor; return { t: A.t, lane: A.selLane, now: document.querySelector('#nowBar').textContent, splits: A.splits.length, cuts: A.edit.cuts.length }; });
  assert.deepEqual([r1(s.t), s.lane, s.splits, s.cuts], [42, 'ending', 0, 0]);
  assert.match(s.now, /片尾卡：好內容，才是一切的根源/);
  await page.keyboard.press('End');
  await wait(200);
  assert.equal(r1(await app(() => window.__editor.t)), VD + CARD);
  // 分割工具在片尾卡上點：不切
  await app(() => { window.__editor.tool = 'split'; });
  p = await pos('main', 44);
  await page.mouse.click(p.x, p.y);
  await wait(300);
  assert.deepEqual(await app(() => { const A = window.__editor; A.tool = 'select'; return [A.splits.length, A.edit.cuts.length]; }), [0, 0]);
  // 從影片裡拖選範圍、拖過影片結尾：範圍停在影片結尾（片尾卡不能剪）
  const a = await pos('main', 30), b = await pos('main', 45);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move((a.x + b.x) / 2, a.y, { steps: 4 }); await page.mouse.move(b.x, b.y, { steps: 4 }); await page.mouse.up();
  await wait(300);
  const sel = await app(() => window.__editor.sel);
  assert.ok(sel.b <= VD + 1e-6 && sel.a < sel.b, `拖選範圍不能超過影片：${JSON.stringify(sel)}`);
  await page.keyboard.press('Escape');

  // 快速試聽：拖進片尾卡 → 放示意（圖、金句照時間出來）；片尾卡第 3 秒金句打到一半
  await app(() => window.__editor.seek(40));
  await wait(400);
  s = await app(() => { const A = window.__editor, box = document.querySelector('#simEnd'); return { endT: A.sim.endT, hidden: box.hidden, img: document.querySelector('#simEndImg').getAttribute('src'), chars: box.querySelectorAll('.ec').length, shown: [...box.querySelectorAll('.ec')].filter((e) => e.style.opacity === '1').length, playing: A.sim.playing, t: A.t }; });
  assert.deepEqual([r1(s.endT), s.hidden, s.chars, s.playing, r1(s.t)], [3, false, 10, false, 40]);
  assert.ok(s.shown >= 3 && s.shown < 10, `片尾卡第 3 秒金句要打到一半（${s.shown}／10）`);
  assert.match(s.img, /ending-0123456789\.jpg/);
  // 拖回影片：示意收起來
  await app(() => window.__editor.seek(20));
  await wait(300);
  assert.deepEqual(await app(() => [window.__editor.sim.endT, document.querySelector('#simEnd').hidden]), [null, true]);

  // 從影片結尾前播：播完影片接著走片尾卡，片尾配樂在播；走到片尾卡結尾停下來
  await app(() => window.__editor.seek(36));
  await wait(200);
  await page.click('#btnPlay');
  await until(() => app(() => window.__editor.t > 37.8), () => '影片播完要接著走片尾卡');
  s = await app(() => { const A = window.__editor, o = A.sim.outro; return { playing: A.sim.playing, endT: A.sim.endT, hidden: document.querySelector('#simEnd').hidden, outro: o ? { paused: o.el.paused, t: o.el.currentTime, src: o.el.src } : null, play: A.outroPlay() }; });
  assert.equal(s.playing, true);
  assert.equal(s.hidden, false);
  assert.ok(s.endT > 0.5 && s.endT < 6, `片尾卡的時鐘在走（${s.endT}）`);
  assert.deepEqual([s.play.at, s.play.dur, s.play.gain], [29, 17.9, 1]);
  assert.ok(s.outro && !s.outro.paused && Math.abs(s.outro.t - (37 + s.endT - 29)) < 0.8, `片尾配樂跟著播、對得上時間：${JSON.stringify(s.outro)}`);
  assert.match(s.outro.src, /outro-bgm-cylinder-five-0123456789ab\.wav/);
  await until(() => app(() => !window.__editor.sim.playing), '走到片尾卡結尾要停');
  assert.equal(r1(await app(() => window.__editor.t)), VD + CARD);
  // 到底再按播放：從頭播
  await page.click('#btnPlay');
  await until(() => app(() => window.__editor.sim.playing && window.__editor.t < 5), '片尾卡播完再按播放要從頭');
  await page.click('#btnPlay');
  await wait(200);

  // 存檔沒被動到：片尾卡、片尾配樂只能看
  assert.deepEqual(JSON.parse(fs.readFileSync(planFile, 'utf8')).outro, plan.outro);
  assert.deepEqual(errors, []);
});

test('沒有片尾卡、沒有片尾配樂：時間軸到影片結尾為止，背景音樂軌寫「沒有背景音樂」，按 End 到影片結尾', { timeout: 240000 }, async (t) => {
  const { page, errors, app, hit } = await setup(t, { version: 1, scenes: SCENES }, { ending: false });
  await wait(500);
  const s = await app(() => { const A = window.__editor, T = A.timeline; return { endDur: A.endDur, end: A.endView, outro: A.outroView, vdur: T.vdur, dur: T.dur, tcDur: document.querySelector('#tcDur').textContent, st: document.querySelector('#stOut').textContent, bed: A.bedView }; });
  assert.deepEqual([s.endDur, s.end, s.outro, r1(s.vdur), r1(s.dur), s.tcDur, s.st], [0, null, null, VD, VD, '0:37', '完成影片 0:37']);
  assert.deepEqual(s.bed, { kind: 'none', text: '沒有背景音樂' });
  assert.equal((await hit('bed', 30)).kind, 'bed');
  await page.keyboard.press('End');
  await wait(200);
  assert.equal(r1(await app(() => window.__editor.t)), VD);
  assert.deepEqual(errors, []);
});

test('有片尾卡、沒有背景音樂：背景音樂軌那一行說片尾配樂在最後；片尾配樂鋪到片尾卡結尾', { timeout: 240000 }, async (t) => {
  const { errors, app, until } = await setup(t, { version: 1, outro: { music: 'bgm-cylinder-five' }, scenes: SCENES });
  await until(() => app(() => window.__editor.endDur > 0 && !!window.__editor.outroView), '要有片尾卡和片尾配樂');
  const s = await app(() => { const A = window.__editor; return { bed: A.bedView, outro: A.outroView, play: A.outroPlay(), card: A.endCard() }; });
  assert.equal(s.bed.kind, 'none');
  // 沒寫 outro.from：只播片尾最後幾秒（內建那首 20 秒，比 30 秒短，對齊片尾）；還沒 build 過，快速試聽沒有東西播、示意只有字
  assert.deepEqual([s.outro.music, r1(s.outro.outEnd), s.outro.auto, s.play, s.card.image], ['bgm-cylinder-five', VD + CARD, true, null, null]);
  assert.ok(s.outro.outStart >= VD + CARD - 30 - 1e-6 && s.outro.outStart < VD);
  assert.deepEqual(errors, []);
});

// ---------- 077 片尾金句的文字動畫：點片尾卡，右邊「屬性」用下拉選單選 ----------
test('點片尾卡 → 屬性出「文字動畫」下拉選單（五種，預設打字機）；選了存進 plan.json 的 ending.motion、快速試聽馬上照新的示意；選回預設就拿掉', { timeout: 300000 }, async (t) => {
  const plan = { version: 1, ending: { quote: '好內容，才是一切的根源。' }, scenes: SCENES };
  const { page, errors, app, until, pos, planFile } = await setup(t, plan, { built: true });
  await until(() => app(() => window.__editor.endDur > 0), '要有片尾卡');
  await wait(300);
  const readPlan = () => JSON.parse(fs.readFileSync(planFile, 'utf8'));
  const saved = () => until(() => app(() => document.querySelector('#saveState').dataset.state === 'saved'), '要自動存好');
  const panel = () => app(() => { const sel = document.querySelector('#inspBody select[data-f="endMotion"]'); return { kind: document.querySelector('#inspKind').textContent, title: document.querySelector('#inspTitle').textContent, value: sel?.value ?? null, options: sel ? [...sel.options].map((o) => `${o.value}:${o.textContent}`) : null, notes: [...document.querySelectorAll('#inspBody .ip-note')].map((n) => n.textContent) }; });

  // 點時間軸上的片尾卡：右邊是片尾卡的屬性，下拉選單列出五種，現在是打字機（預設）
  const p = await pos('main', 42);
  await page.mouse.click(p.x, p.y);
  await wait(300);
  let s = await panel();
  assert.deepEqual([s.kind, s.title, s.value], ['片尾卡', '影片講完後接 9.90 秒', 'type']);
  assert.deepEqual(s.options, ['type:打字機（預設）', 'fade:淡入', 'rise:逐行浮出', 'wipe:由左擦開', 'none:直接出現']);
  assert.ok(s.notes[0].includes('好內容，才是一切的根源') && s.notes.includes('一個字一個字打出來（預設）'));
  assert.equal(await app(() => document.querySelectorAll('#simEnd .ec').length), 10, '打字機：一個字一個 span');

  // 選「逐行浮出」：存進這一集、說明跟著換、快速試聽的示意換成一行一塊
  await page.select('#inspBody select[data-f="endMotion"]', 'rise');
  await saved();
  assert.deepEqual(readPlan().ending, { quote: '好內容，才是一切的根源。', motion: 'rise' });
  await wait(400);
  s = await panel();
  assert.equal(s.value, 'rise');
  assert.ok(s.notes.includes('一行一行由下往上浮出'));
  assert.ok(s.notes.some((n) => n.includes('完成影片預覽裡還是「打字機」') && n.includes('更新預覽')), '上一次 build 做進去的是打字機：提醒要更新預覽');
  const sim = await app(() => { const A = window.__editor, box = document.querySelector('#simEnd'); return { motion: A.endMotion, card: A.endCard().motion, els: [...box.querySelectorAll('.el')].map((e) => e.textContent), ec: box.querySelectorAll('.ec').length, hidden: box.hidden }; });
  assert.deepEqual(sim, { motion: 'rise', card: 'rise', els: ['好內容', '才是一切的根源'], ec: 0, hidden: false });
  // 逐行：片尾卡第 0.8 秒第一行出來一點、第二行還沒；第 3 秒兩行都在
  await app(() => window.__editor.seek(window.__editor.dur + 0.8));
  await wait(300);
  let op = await app(() => [...document.querySelectorAll('#simEnd .el')].map((e) => Number(e.style.opacity)));
  assert.ok(op[0] > 0 && op[0] < 1 && op[1] === 0, JSON.stringify(op));
  await app(() => window.__editor.seek(window.__editor.dur + 3));
  await wait(300);
  op = await app(() => [...document.querySelectorAll('#simEnd .el')].map((e) => Number(e.style.opacity)));
  assert.deepEqual(op, [1, 1]);

  // 選「由左擦開」「淡入」「直接出現」：示意各自換寫法，都存得進去
  for (const [id, check] of [['wipe', () => app(() => [...document.querySelectorAll('#simEnd .el')].every((e) => e.style.clipPath === 'inset(0px 0% 0px 0px)' || e.style.clipPath === 'inset(0px 0%)' || /inset\(0(px)? 0(\.0)?%/.test(e.style.clipPath)))],
    ['fade', () => app(() => document.querySelector('#simEndQuote').style.opacity === '1' && !document.querySelector('#simEnd .el'))],
    ['none', () => app(() => document.querySelector('#simEndQuote').style.opacity === '1')]]) {
    await page.select('#inspBody select[data-f="endMotion"]', id);
    await saved();
    assert.equal(readPlan().ending.motion, id);
    await app(() => window.__editor.seek(window.__editor.dur + 4));
    await wait(300);
    assert.equal(await check(), true, `${id} 的示意`);
  }
  // 選回打字機（預設）：plan.json 的 motion 拿掉，金句照留
  await page.select('#inspBody select[data-f="endMotion"]', 'type');
  await saved();
  assert.deepEqual(readPlan().ending, { quote: '好內容，才是一切的根源。' });
  assert.deepEqual(errors, []);
});

test('工作區預設是「淡入」：下拉選單標在淡入上、一開始就是淡入；選打字機要寫進這一集', { timeout: 240000 }, async (t) => {
  const { page, errors, app, until, pos, planFile } = await setup(t, { version: 1, ending: { quote: '一句話' }, scenes: SCENES }, { motion: 'fade' });
  await until(() => app(() => window.__editor.endDur > 0), '要有片尾卡');
  await wait(300);
  const p = await pos('main', 42);
  await page.mouse.click(p.x, p.y);
  await wait(300);
  const s = await app(() => { const sel = document.querySelector('#inspBody select[data-f="endMotion"]'); return { value: sel.value, options: [...sel.options].map((o) => o.textContent), motion: window.__editor.endMotion }; });
  assert.deepEqual(s, { value: 'fade', options: ['打字機', '淡入（預設）', '逐行浮出', '由左擦開', '直接出現'], motion: 'fade' });
  await page.select('#inspBody select[data-f="endMotion"]', 'type');
  await until(() => app(() => document.querySelector('#saveState').dataset.state === 'saved'), '要自動存好');
  assert.deepEqual(JSON.parse(fs.readFileSync(planFile, 'utf8')).ending, { quote: '一句話', motion: 'type' });
  assert.deepEqual(errors, []);
});
