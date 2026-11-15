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
  fs.symlinkSync(TEMPLATE, path.join(root, 'shared/template'), 'dir');
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
