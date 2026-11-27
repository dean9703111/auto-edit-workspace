// 038 重點字幕：剪輯台「字幕」分頁每一句右邊的「重點」開關、鍵盤 H、復原、增刪字幕時標記跟著走；
// 快速試聽的字幕馬上換成重點樣式（和完成影片同一個 class cg--em、同一份 kit/captions.css），自動存進 plan.json 第一層 captionMarks
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

test('重點字幕 UI：點「重點」→ 那一列有標示、預覽換樣式、存 plan.json；H 鍵；復原；合併、刪除時標記跟著走；只看重點', { timeout: 120000 }, async (t) => {
  const root = tmpDir(t, 'editor-capmarks-ui-');
  const project = path.join(root, 'projects/example'), work = path.join(project, 'work');
  fs.mkdirSync(path.join(work, 'hyperframes'), { recursive: true });
  fs.mkdirSync(path.join(root, 'shared'));
  fs.symlinkSync(TEMPLATE, path.join(root, 'shared/template'), 'junction');   // Windows 不用系統管理員也建得了（其他系統忽略這個參數）
  const planFile = path.join(work, 'hyperframes/plan.json'), srtFile = path.join(work, 'rough.srt');
  fs.writeFileSync(planFile, JSON.stringify({ version: 1, scenes: [{ id: 's01', scene: 'concept', from: '#4', to: '#4e', slots: { text: '第四段' } }] }, null, 2));
  fs.writeFileSync(srtFile, [1, 2, 3, 4].map((n) => `${n}\n00:00:0${(n - 1) * 2},500 --> 00:00:0${n * 2},000\n第${n}段字幕\n`).join('\n'));
  const media = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=navy:size=320x180:rate=30', '-t', '9', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(work, 'rough.mp4')]);
  assert.equal(media.status, 0, String(media.stderr));
  const editor = await startEditor({ cwd: root, flags: { project, template: path.join(root, 'shared/template') }, port: 0, writeState: false });
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: findChrome(), headless: true });
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewport({ width: 1800, height: 1000 });
    await page.goto(editor.url);
    await page.waitForFunction(() => window.__editor?.server);
    await page.evaluate(() => { document.querySelector('#coach').hidden = true; });
    const planMarks = () => JSON.parse(fs.readFileSync(planFile, 'utf8')).captionMarks;
    const until = async (fn, what) => { for (let i = 0; i < 80; i++) { if (fn()) return; await new Promise((r) => setTimeout(r, 100)); } assert.fail(typeof what === 'function' ? what() : what); };
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const saved = (want) => until(() => same(planMarks(), want), () => `plan.json 的 captionMarks 要是 ${JSON.stringify(want)}，現在 ${JSON.stringify(planMarks())}`);
    const row = (n) => page.$eval(`#cueList [data-cue="${n}"]`, (li) => ({ em: li.classList.contains('em'), pressed: li.querySelector('[data-mark]').getAttribute('aria-pressed'), text: li.querySelector('[data-mark]').textContent }));

    // 「字幕」分頁：每一句右邊都有「重點」，一開始都沒標
    await page.click('.side-tabs [data-side="cues"]');
    await page.waitForSelector('#cueList [data-cue="2"] [data-mark]', { visible: true });
    assert.deepEqual(await row(2), { em: false, pressed: 'false', text: '重點' });
    assert.equal(await page.$eval('#cueMarksOnly', (b) => b.textContent), '重點 0 則');
    const normal = await page.$eval('#simCaption span', (s) => { const c = getComputedStyle(s); return { size: c.fontSize, pad: c.padding, line: c.lineHeight }; });

    // 點第 2 句的「重點」：那一列左邊一條主色、開關實心；沒在播放就跳到那一句，快速試聽的字幕馬上是重點樣式（只換底板、字色、粗細）
    await page.click('#cueList [data-cue="2"] [data-mark]');
    await page.waitForFunction(() => document.querySelector('#cueList [data-cue="2"]')?.classList.contains('em'));
    assert.deepEqual(await row(2), { em: true, pressed: 'true', text: '重點' });
    assert.equal(await page.$eval('#cueMarksOnly', (b) => b.textContent), '重點 1 則');
    await page.waitForFunction(() => document.querySelector('#simCaption').classList.contains('cg--em'));
    const look = await page.$eval('#simCaption span', (s) => {
      const c = getComputedStyle(s), probe = document.createElement('i');
      probe.style.cssText = 'background: var(--brand); color: var(--brand-ink)';
      document.body.append(probe);
      const want = getComputedStyle(probe);
      const out = { text: s.textContent, bg: c.backgroundColor, ink: c.color, weight: c.fontWeight, size: c.fontSize, pad: c.padding, line: c.lineHeight, brand: want.backgroundColor, brandInk: want.color };
      probe.remove();
      return out;
    });
    assert.equal(look.text, '第2段字幕');
    assert.deepEqual([look.bg, look.ink, look.weight], [look.brand, look.brandInk, '700'], '主色底、主色底上的字色、粗體');
    assert.deepEqual({ size: look.size, pad: look.pad, line: look.line }, normal, '字級、內距、行高照一般字幕');
    assert.equal(await page.evaluate(() => window.__editor.selection?.id), 2);
    assert.equal(await page.$('#cueList .cue-edit'), null, '點「重點」不會進改字');
    await saved(['#2']);

    // 鍵盤 H：選到的那一句（第 3 句）切換；再按一次取消、再按一次標回來
    await page.evaluate(() => window.__editor.select({ kind: 'cue', id: 3 }, { lane: 'cap' }));
    await page.keyboard.press('h');
    await page.waitForFunction(() => document.querySelector('#cueList [data-cue="3"]')?.classList.contains('em'));
    await saved(['#2', '#3']);
    await page.keyboard.press('h');
    await saved(['#2']);
    await page.keyboard.press('H');
    await saved(['#2', '#3']);
    // 復原（⌘／Ctrl＋Z）：和其他修改同一條路，檔案跟著回去
    await page.evaluate(() => document.querySelector('#btnUndo').click());
    await saved(['#2']);
    await page.waitForFunction(() => !document.querySelector('#cueList [data-cue="3"]')?.classList.contains('em'));
    // 屬性面板（選到字幕）也有同一個開關
    assert.equal(await page.$eval('[data-act="capMark"]', (b) => b.getAttribute('aria-pressed')), 'false');
    await page.evaluate(() => window.__editor.select({ kind: 'cue', id: 2 }, { lane: 'cap' }));
    assert.equal(await page.$eval('[data-act="capMark"]', (b) => b.getAttribute('aria-pressed')), 'true');

    // 只看重點：清單只剩標了的那一句；再按一次看全部
    await page.click('#cueMarksOnly');
    assert.deepEqual(await page.$$eval('#cueList [data-cue]', (ls) => ls.map((li) => li.dataset.cue)), ['2']);
    assert.equal(await page.$eval('#cueMarksOnly', (b) => b.getAttribute('aria-pressed')), 'true');
    await page.click('#cueMarksOnly');
    assert.equal((await page.$$('#cueList [data-cue]')).length, 4);

    // 合併第 1、2 句（後面那句是重點）：合併後的第 1 句是重點；字幕和 plan.json 一起存，s01 的句號也跟著 −1
    await page.evaluate(() => window.__editor.select({ kind: 'cue', id: 1 }, { lane: 'cap' }));
    await page.evaluate(() => document.querySelector('[data-act="capMerge"]').click());
    await saved(['#1']);
    assert.equal(JSON.parse(fs.readFileSync(planFile, 'utf8')).scenes[0].from, '#3');
    assert.equal((fs.readFileSync(srtFile, 'utf8').match(/-->/g) || []).length, 3);
    assert.deepEqual(await row(1), { em: true, pressed: 'true', text: '重點' });
    // 刪掉那一句重點字幕：標記拿掉，plan.json 不留空的欄位
    await page.evaluate(() => document.querySelector('[data-act="capDel"]').click());
    await until(() => planMarks() === undefined, () => `刪掉重點字幕後 captionMarks 要拿掉，現在 ${JSON.stringify(planMarks())}`);
    assert.equal(await page.$eval('#cueMarksOnly', (b) => b.textContent), '重點 0 則');
    assert.equal((fs.readFileSync(srtFile, 'utf8').match(/-->/g) || []).length, 2);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await editor.close();
  }
});

test('091 只標幾個字 UI：改字時選字按「重點」或 Ctrl+B 只標那幾個字、游標放進去再按取消；屬性面板選字、×；整則為準；合併跟著字走；復原；字幕樣式的入口', { timeout: 120000 }, async (t) => {
  const root = tmpDir(t, 'editor-capwords-ui-');
  const project = path.join(root, 'projects/example'), work = path.join(project, 'work');
  fs.mkdirSync(path.join(work, 'hyperframes'), { recursive: true });
  fs.mkdirSync(path.join(root, 'shared'));
  fs.symlinkSync(TEMPLATE, path.join(root, 'shared/template'), 'junction');
  const planFile = path.join(work, 'hyperframes/plan.json'), srtFile = path.join(work, 'rough.srt');
  fs.writeFileSync(planFile, JSON.stringify({ version: 1, scenes: [] }, null, 2));
  const texts = ['隨時會崩潰的系統', '用對的人很少', '第三句收尾', '第四句結束'];
  fs.writeFileSync(srtFile, texts.map((x, i) => `${i + 1}\n00:00:0${i * 2},500 --> 00:00:0${(i + 1) * 2},000\n${x}\n`).join('\n'));
  const media = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=navy:size=320x180:rate=30', '-t', '9', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(work, 'rough.mp4')]);
  assert.equal(media.status, 0, String(media.stderr));
  const editor = await startEditor({ cwd: root, flags: { project, template: path.join(root, 'shared/template') }, port: 0, writeState: false });
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: findChrome(), headless: true });
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewport({ width: 1800, height: 1000 });
    await page.goto(editor.url);
    await page.waitForFunction(() => window.__editor?.server);
    await page.evaluate(() => { for (const id of ['#coach', '#coachRough']) document.querySelector(id).hidden = true; });   // 沒有段落的專案會跳初剪的導覽
    const planMarks = () => JSON.parse(fs.readFileSync(planFile, 'utf8')).captionMarks;
    const until = async (fn, what) => { for (let i = 0; i < 80; i++) { if (fn()) return; await new Promise((r) => setTimeout(r, 100)); } assert.fail(typeof what === 'function' ? what() : what); };
    const saved = (want) => until(() => JSON.stringify(planMarks()) === JSON.stringify(want), () => `plan.json 的 captionMarks 要是 ${JSON.stringify(want)}，現在 ${JSON.stringify(planMarks())}`);
    const select = (sel, a, b) => page.evaluate((s, x, y) => { const i = document.querySelector(s); i.focus(); i.setSelectionRange(x, y); }, sel, a, b);
    const ctrlB = async () => { await page.keyboard.down('Control'); await page.keyboard.press('b'); await page.keyboard.up('Control'); };

    // 字幕分頁：點第 1 句進改字，選「崩潰」按那一句的「重點」→ 只標那兩個字；那一列有標示，快速試聽那兩個字是 em.cw
    await page.click('.side-tabs [data-side="cues"]');
    await page.waitForSelector('#cueList [data-cue="1"] .x', { visible: true });
    await page.click('#cueList [data-cue="1"] .x');
    await page.waitForSelector('#cueList .cue-edit');
    await select('#cueList .cue-edit', 3, 5);
    await page.click('#cueList [data-cue="1"] [data-mark]');
    await saved(['#1@崩潰']);
    assert.equal(await page.$eval('#cueList [data-cue="1"]', (li) => li.classList.contains('emw') && !li.classList.contains('em') && li.querySelector('[data-mark]').getAttribute('aria-pressed')), 'true');
    assert.equal(await page.evaluate(() => document.activeElement?.matches('.cue-edit')), true, '按「重點」游標留在改字框');
    await page.waitForFunction(() => document.querySelector('#simCaption em.cw')?.textContent === '崩潰');
    assert.equal(await page.$eval('#simCaption', (el) => el.classList.contains('cg--em')), false, '整則不換樣式');
    assert.equal(await page.$eval('#cueMarksOnly', (b) => b.textContent), '重點 1 則');
    // 游標放在標過的字裡按 Ctrl+B：取消；再選一次按 Ctrl+B：標回來
    await select('#cueList .cue-edit', 4, 4);
    await ctrlB();
    await until(() => planMarks() === undefined, () => `取消後 captionMarks 要拿掉，現在 ${JSON.stringify(planMarks())}`);
    await select('#cueList .cue-edit', 3, 5);
    await ctrlB();
    await saved(['#1@崩潰']);
    // 離開改字：清單裡那兩個字是主色塊
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('#cueList [data-cue="1"] .x em.cw')?.textContent === '崩潰');

    // 沒在改字時按 H：整則為準，只標幾個字的拿掉
    await page.evaluate(() => window.__editor.select({ kind: 'cue', id: 1 }, { lane: 'cap' }));
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press('h');
    await saved(['#1']);
    assert.equal(await page.$('#cueList [data-cue="1"] .x em.cw'), null);

    // 屬性面板：第 3 句的「文字」選「收尾」按「重點字幕（H）」→ 只標那兩個字；面板列出標了的字，按 × 取消
    await page.evaluate(() => window.__editor.select({ kind: 'cue', id: 3 }, { lane: 'cap' }));
    await page.click('.side-tabs [data-side="insp"]');
    await page.waitForSelector('#capText');
    await select('#capText', 3, 5);
    await page.click('[data-act="capMark"]');
    await saved(['#1', '#3@收尾']);
    await page.waitForSelector('[data-act="capWordDel"][data-w="收尾"]');
    await page.click('[data-act="capWordDel"][data-w="收尾"]');
    await saved(['#1']);
    await select('#capText', 3, 5);
    await ctrlB();
    await saved(['#1', '#3@收尾']);

    // 合併第 2、3 句：那兩個字跟著併到第 2 句
    await page.evaluate(() => window.__editor.select({ kind: 'cue', id: 2 }, { lane: 'cap' }));
    await page.evaluate(() => document.querySelector('[data-act="capMerge"]').click());
    await saved(['#1', '#2@收尾']);
    // 復原：回到合併前
    await page.evaluate(() => document.querySelector('#btnUndo').click());
    await saved(['#1', '#3@收尾']);

    // 字幕樣式的入口：字幕分頁上面的「字幕樣式」、選到字幕時屬性面板的「字幕樣式…」都跳到整支影片的字幕那一區（打開、看得到樣式按鈕）
    const styleShown = () => page.waitForFunction(() => {
      const sub = document.querySelector('#capStyleSub'), r = sub?.getBoundingClientRect();
      return !window.__editor.selection && sub?.closest('details')?.open && !document.querySelector('#sideInsp').hidden && r && r.height > 0 && r.top >= 0 && r.top < innerHeight && document.querySelectorAll('[data-act="capLook"]').length === 5;
    });
    await page.click('.side-tabs [data-side="cues"]');
    await page.click('#capStyleBtn');
    await styleShown();
    await page.evaluate(() => window.__editor.select({ kind: 'cue', id: 2 }, { lane: 'cap' }));
    await page.click('[data-act="capStyle"]');
    await styleShown();
    // 在那裡換樣式：存進 plan.json 的 captionStyle；屬性面板停在原本捲到的地方（不跳回最上面）
    await page.waitForFunction(() => new Promise((ok) => { const b = document.querySelector('#inspBody'), y = b.scrollTop; setTimeout(() => ok(y > 0 && b.scrollTop === y), 300); }));
    const y0 = await page.$eval('#inspBody', (b) => b.scrollTop);
    await page.click('[data-act="capLook"][data-v="outline"]');
    await until(() => JSON.parse(fs.readFileSync(planFile, 'utf8')).captionStyle?.look === 'outline', '換成白字黑框要存進 plan.json');
    await page.waitForFunction(() => document.querySelector('[data-act="capLook"][data-v="outline"]')?.getAttribute('aria-pressed') === 'true');
    assert.equal(await page.$eval('#inspBody', (b) => b.scrollTop), y0, '換字幕樣式後屬性面板不跳回最上面');
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await editor.close();
  }
});

test('091 講者設定：沒有講者介紹段也找得到（頂端淡的提醒、整支 → 講者的「設定姓名與頭銜」）；存在暫存的 shared/setting.json，存好提醒收起來', { timeout: 120000 }, async (t) => {
  const root = tmpDir(t, 'editor-speaker-ui-');
  const project = path.join(root, 'projects/example'), work = path.join(project, 'work');
  fs.mkdirSync(path.join(work, 'hyperframes'), { recursive: true });
  fs.mkdirSync(path.join(root, 'shared'));
  fs.symlinkSync(TEMPLATE, path.join(root, 'shared/template'), 'junction');
  // 講者寫在暫存的 shared（ctx.speakerTemplate 的上一層），不動真的 shared/setting.json；14 講者介紹的示範人物要讀得到 scenes
  const fake = path.join(root, 'fake/shared/template');
  fs.mkdirSync(fake, { recursive: true });
  fs.symlinkSync(path.join(TEMPLATE, 'scenes'), path.join(fake, 'scenes'), 'junction');
  const settingFile = path.join(root, 'fake/shared/setting.json');
  fs.writeFileSync(path.join(work, 'hyperframes/plan.json'), JSON.stringify({ version: 1, scenes: [{ id: 's01', scene: 'concept', from: '#1', to: '#1e', slots: { text: '第一段' } }] }, null, 2));
  fs.writeFileSync(path.join(work, 'rough.srt'), '1\n00:00:00,500 --> 00:00:02,500\n第一段字幕\n');
  const media = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=navy:size=320x180:rate=30', '-t', '4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(work, 'rough.mp4')]);
  assert.equal(media.status, 0, String(media.stderr));
  const editor = await startEditor({ cwd: root, flags: { project, template: path.join(root, 'shared/template') }, port: 0, writeState: false, speakerTemplate: fake });
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: findChrome(), headless: true });
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewport({ width: 1800, height: 1000 });
    await page.goto(editor.url);
    await page.waitForFunction(() => window.__editor?.server?.speaker);
    await page.evaluate(() => { for (const id of ['#coach', '#coachRough']) document.querySelector(id).hidden = true; });
    // 這一集沒有講者介紹段：頂端是淡的提醒（不是紅的）
    assert.deepEqual(await page.$eval('#btnSpeakerWarn', (b) => ({ hidden: b.hidden, soft: b.classList.contains('soft') })), { hidden: false, soft: true });
    // 整支 → 講者：還沒設定、有按鈕；按了跳出對話框（不是「示範人物」的那一版）
    await page.waitForSelector('[data-act="spkEdit"]');
    assert.equal(await page.$eval('[data-act="spkEdit"]', (b) => b.textContent), '設定姓名與頭銜');
    await page.click('[data-act="spkEdit"]');
    await page.waitForFunction(() => document.querySelector('#dlgSpeaker').open);
    assert.equal(await page.$eval('#spkTitle', (h) => h.textContent), '講者的姓名與頭銜');
    await page.type('#spkName', '陳大文');
    await page.type('#spkTitles', '設計師、講師');
    await page.click('#spkSave');
    await page.waitForFunction(() => !document.querySelector('#dlgSpeaker').open);
    assert.deepEqual(JSON.parse(fs.readFileSync(settingFile, 'utf8')).speaker, { name: '陳大文', titles: ['設計師', '講師'] });
    await page.waitForFunction(() => document.querySelector('#btnSpeakerWarn').hidden && document.querySelector('[data-act="spkEdit"]')?.textContent === '修改姓名與頭銜');
    // 再打開：帶著現在的姓名與頭銜
    await page.click('[data-act="spkEdit"]');
    await page.waitForFunction(() => document.querySelector('#dlgSpeaker').open);
    assert.deepEqual(await page.evaluate(() => [document.querySelector('#spkName').value, document.querySelector('#spkTitles').value]), ['陳大文', '設計師、講師']);
    await page.click('#spkCancel');
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await editor.close();
  }
});
