// 050 時間軸的右鍵選單（要瀏覽器）：
//   1. 按右鍵＝先選到指標下的東西，再在指標旁開自己畫的選單（不超出視窗）；Esc、點外面、滾滑鼠、視窗失焦都會關；選單開著時按鍵不會動到剪輯台
//   2. 鍵盤：選到東西按 Shift＋F10／選單鍵開，↑↓ 選、Enter 執行
//   3. 選單只是入口：每一項走現有的動作（同一套復原、自動存檔）；不能做的灰掉並寫原因（軌道鎖住、最後一句不能合併、初剪預覽階段…）
//   4. 換、靜音、還原某一段的主音效（寫 plan.json 那一段的 sfx）；可以先試聽；換了之後標記不會跳回舊的名稱
//   5. 在任意時間加一顆自己的音效（plan.json edit.sfx）：左右拖改時間、上下拖調音量、換一顆、Delete 移除
import { test as nodeTest } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { startEditor } from '../../shared/template/tools/editor.mjs';
import { findChrome } from '../../shared/template/tools/lib/audit-browser.mjs';
import { TEMPLATE, WORKSPACE, makeSrt, missingTools, skipAll, tmpDir } from './helpers.mjs';

const noUi = await missingTools('chrome', 'ffmpeg', 'puppeteer');
const test = skipAll(nodeTest, noUi);
const puppeteer = noUi ? null : (await import('puppeteer-core')).default;
const wait = (ms = 200) => new Promise((r) => setTimeout(r, ms));

// 暫存工作區：shared/template、shared/sfx 連到這個 repo 的（只讀），專案是假的：10 句字幕（每句 3 秒、句間 0.5 秒）、37 秒的影片
async function setup(t, plan, { media = false } = {}) {
  const root = tmpDir(t, 'editor-ctx-ui-');
  const shared = path.join(root, 'shared');
  fs.mkdirSync(shared);
  fs.symlinkSync(TEMPLATE, path.join(shared, 'template'), 'dir');
  fs.symlinkSync(path.join(WORKSPACE, 'shared', 'sfx'), path.join(shared, 'sfx'), 'dir');
  fs.writeFileSync(path.join(shared, 'setting.json'), JSON.stringify({ editor: { seen: ['coach-rough.v1', 'coach-final.v1', 'coach.v2'] } }));   // 提示卡都看過了，不擋畫面
  const project = path.join(root, 'projects', 'example'), work = path.join(project, 'work');
  fs.mkdirSync(path.join(work, 'hyperframes'), { recursive: true });
  const planFile = path.join(work, 'hyperframes', 'plan.json'), srtFile = path.join(work, 'rough.srt');
  fs.writeFileSync(planFile, `${JSON.stringify(plan, null, 2)}\n`);
  fs.writeFileSync(srtFile, makeSrt({ n: 10 }));
  const made = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=navy:size=320x180:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=48000', '-t', '37', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', path.join(work, 'rough.mp4')]);
  assert.equal(made.status, 0, String(made.stderr));
  if (media) { fs.mkdirSync(path.join(project, 'assets', 'screen'), { recursive: true }); fs.copyFileSync(path.join(work, 'rough.mp4'), path.join(project, 'assets', 'screen', 'demo.mp4')); }
  const ed = await startEditor({ cwd: root, flags: { project, template: path.join(shared, 'template') }, port: 0, writeState: false, speakerTemplate: path.join(shared, 'template') });
  t.after(() => ed.close());
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--no-first-run'] });
  t.after(() => browser.close());
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewport({ width: 1600, height: 950 });
  await page.goto(`${ed.url}?view=sim`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__editor?.started && window.__editor.reportReady, { timeout: 60000 });
  await wait(300);

  const readPlan = () => JSON.parse(fs.readFileSync(planFile, 'utf8'));
  const seg = (id) => readPlan().scenes.find((s) => s.id === id);
  const until = async (fn, what) => { for (let i = 0; i < 100; i++) { if (await fn()) return; await wait(100); } assert.fail(typeof what === 'function' ? what() : what); };
  const app = (fn, ...args) => page.evaluate(fn, ...args);
  // 時間軸上某一軌、某個時間的視窗座標（dy＝離那一軌中線幾 px）
  const pos = (lane, time, dy = 0) => app((lane, time, dy) => { const T = window.__editor.timeline, r = document.querySelector('#tlCanvas').getBoundingClientRect(); return { x: r.left + T.xOf(time), y: r.top + (T.L[lane][0] + T.L[lane][1]) / 2 + dy }; }, lane, time, dy);
  const clearToasts = () => app(() => document.querySelector('#toasts').replaceChildren());   // 右下角的提示會蓋到時間軸的右下角
  const rclick = async (lane, time, dy = 0) => { await clearToasts(); const p = await pos(lane, time, dy); await page.mouse.click(p.x, p.y, { button: 'right' }); await wait(120); return p; };
  const lclick = async (lane, time, dy = 0) => { await clearToasts(); const p = await pos(lane, time, dy); await page.mouse.click(p.x, p.y); await wait(120); return p; };
  const drag = async (lane, from, to, { dy = 0, y0 = 0 } = {}) => {
    await clearToasts();
    const a = await pos(lane, from, y0), b = await pos(lane, to, y0 + dy);
    await page.mouse.move(a.x, a.y); await page.mouse.down();
    await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 }); await page.mouse.move(b.x, b.y, { steps: 4 });
    await page.mouse.up(); await wait(150);
  };
  const menu = (sel = '#ctxMenu') => app((sel) => {
    const m = document.querySelector(sel);
    if (!m || m.hidden) return null;
    const r = m.getBoundingClientRect();
    return { head: m.querySelector('.ctx-head')?.textContent ?? '', rect: { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) }, vw: innerWidth, vh: innerHeight,
      focus: document.activeElement?.id || document.activeElement?.querySelector?.('.lb')?.textContent || document.activeElement?.tagName,
      items: [...m.querySelectorAll('.ctx-item')].map((e) => ({ label: e.querySelector('.lb').textContent, key: e.querySelector('kbd')?.textContent ?? '', hint: e.querySelector('.hint')?.textContent ?? '',
        off: e.classList.contains('is-disabled'), why: e.dataset.why ?? '', checked: e.getAttribute('aria-checked'), sub: e.hasAttribute('aria-haspopup') })) };
  }, sel);
  const item = async (label, sel = '#ctxMenu') => { const m = await menu(sel); const it = m?.items.find((x) => x.label === label); assert.ok(it, `選單（${sel}）裡要有「${label}」：${JSON.stringify(m?.items.map((x) => x.label))}`); return it; };
  const center = (label, sel, part = '') => app((label, sel, part) => { const e = [...document.querySelectorAll(`${sel} .ctx-item`)].find((x) => x.querySelector('.lb').textContent === label); const r = (part ? e.querySelector(part) : e).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, label, sel, part);
  const pick = async (label, sel = '#ctxMenu', part = '') => { await item(label, sel); const c = await center(label, sel, part); await page.mouse.click(c.x, c.y); await wait(150); };
  const openSub = async (label) => { await item(label); const c = await center(label, '#ctxMenu'); await page.mouse.move(c.x - 3, c.y); await page.mouse.move(c.x, c.y); await page.waitForFunction(() => !document.querySelector('#ctxSub').hidden); return menu('#ctxSub'); };
  const toastText = () => app(() => [...document.querySelectorAll('#toasts .toast .t')].map((e) => e.textContent).join('｜'));
  const st = () => app(() => { const A = window.__editor; return { sel: A.selection, t: A.t, cues: A.cues.length, edit: A.edit, marks: A.marks, splits: A.splits, side: A.side, sfx: A.sfxView.map((m) => ({ id: m.id, name: m.name, at: m.at, main: m.main, muted: m.muted, user: m.user ?? null })) }; });
  const saved = () => until(() => app(() => document.querySelector('#saveState').dataset.state === 'saved'), '要自動存好');
  const undo = async () => { await page.keyboard.down('Control'); await page.keyboard.press('z'); await page.keyboard.up('Control'); await wait(300); };
  return { root, project, planFile, srtFile, ed, page, errors, readPlan, seg, until, app, pos, rclick, lclick, drag, menu, item, pick, openSub, toastText, st, saved, undo, clearToasts };
}

const PLAN = { version: 1, speakerBox: [700, 200, 1220, 1000], scenes: [
  { id: 's01', scene: 'key-point', from: '#1', to: '#2e', slots: { lead: '下方字卡', key: '重點在這裡' } },   // 1–7.5 秒；沒寫 sfx＝情境預設的主音效
  { id: 's02', scene: 'concept', from: '#4', to: '#5e', sfx: 'impact', slots: { text: '一般字卡' } },          // 11.5–18 秒；AI 明寫 impact
  { id: 's03', scene: 'concept', from: '#7', to: '#8e', slots: { text: '沒有音效的字卡' } },                    // 22–28.5 秒；06 預設不配
  { id: 'm01', type: 'media', src: 'assets/screen/demo.mp4', from: '#9', to: '#10e' },                          // 29–35.5 秒
] };

test('右鍵選單：先選再開、不超出視窗、鍵盤能開能選、灰掉的寫原因；每一項走現有的動作（復原、自動存檔照舊）', { timeout: 240000 }, async (t) => {
  const { page, errors, planFile, srtFile, readPlan, until, app, pos, rclick, lclick, drag, menu, item, pick, openSub, toastText, st, saved, undo, clearToasts } = await setup(t, PLAN, { media: true });
  const srtCount = () => (fs.readFileSync(srtFile, 'utf8').match(/-->/g) || []).length;

  // ---------- 1. 按右鍵：先選到那一句字幕，選單開在指標旁 ----------
  let p = await rclick('cap', 5.5);   // 第 2 句：4.5–7.5 秒
  let m = await menu();
  assert.ok(m, '按右鍵要跳出自己的選單');
  assert.deepEqual((await st()).sel, { kind: 'cue', id: 2 }, '先選到指標下的那一句（和點一下一樣）');
  assert.ok(Math.abs((await st()).t - 5.5) < 0.05, '播放頭也移過去了');
  assert.equal(m.head, '字幕　第 2 句');
  assert.deepEqual(m.items.map((x) => `${x.label}${x.key ? `[${x.key}]` : ''}`), ['改字[Enter]', '在播放頭分割[B]', '與下一句合併', '在後面新增一句', '在前面新增一句', '重點字幕[H]', '▶ 播這句', '刪除[Delete]'], '每一項右邊是現有的快捷鍵');
  assert.ok(m.items.every((x) => !x.off), JSON.stringify(m.items.filter((x) => x.off)));
  assert.ok(m.rect.b <= m.vh && m.rect.r <= m.vw && Math.abs(m.rect.l - p.x) <= 1, `選單在指標旁、不超出視窗：${JSON.stringify(m.rect)}（指標 ${JSON.stringify(p)}）`);
  assert.equal(m.focus, 'ctxMenu', '焦點在選單上：按鍵歸選單');
  // 選單開著：Delete、空白鍵不會刪字幕、不會播放
  await page.keyboard.press('Delete');
  await page.keyboard.press(' ');
  await wait();
  assert.equal((await st()).cues, 10);
  assert.equal(await app(() => window.__editor.sim.playing), false);
  // Esc 關掉，選取還在（Esc 沒有傳到剪輯台去取消選取）
  await page.keyboard.press('Escape');
  assert.equal(await menu(), null, 'Esc 關掉');
  assert.deepEqual((await st()).sel, { kind: 'cue', id: 2 });
  assert.equal(await app(() => document.activeElement === document.body), true, '關掉後不留焦點：空白鍵照舊是播放');
  // 點外面、在時間軸上滾滑鼠、視窗失焦：都關
  await rclick('cap', 5.5);
  await page.mouse.click(600, 300);
  assert.equal(await menu(), null, '點外面關掉');
  await rclick('cap', 5.5);
  p = await pos('main', 30);
  await page.mouse.move(p.x, p.y);
  await page.mouse.wheel({ deltaX: 40 });
  await wait();
  assert.equal(await menu(), null, '在選單外面滾滑鼠關掉');
  await rclick('cap', 5.5);
  await app(() => window.dispatchEvent(new Event('blur')));
  assert.equal(await menu(), null, '視窗失焦關掉');
  // 視窗右下角：選單和子選單都往裡挪，不超出視窗
  await rclick('sfx', 36.5);
  m = await menu();
  assert.equal(m.head, '音效軌');
  assert.ok(m.rect.r <= m.vw - 6 && m.rect.b <= m.vh - 6 && m.rect.l >= 6 && m.rect.t >= 6, `靠右下角時不超出視窗：${JSON.stringify(m.rect)}`);
  let sub = await openSub('在這裡加音效');
  assert.ok(sub.rect.r <= sub.vw - 6 && sub.rect.b <= sub.vh - 6 && sub.rect.l >= 6 && sub.rect.t >= 6, `子選單也不超出視窗：${JSON.stringify(sub.rect)}`);
  assert.deepEqual(sub.items.map((x) => x.hint), ['ding', 'success', 'alert', 'impact', 'click', 'chapter', 'sparkle', 'shine', 'thunder'], '音效清單照 kit/sfx.json（配樂不列）');
  await page.keyboard.press('Escape');
  assert.equal(await menu(), null);

  // ---------- 2. 鍵盤：選到東西按 Shift＋F10（或選單鍵）開，↑↓ 選、Enter 執行 ----------
  await lclick('cap', 9);   // 第 3 句：8–11 秒
  assert.deepEqual((await st()).sel, { kind: 'cue', id: 3 });
  await page.keyboard.down('Shift'); await page.keyboard.press('F10'); await page.keyboard.up('Shift');
  await wait();
  m = await menu();
  assert.equal(m?.head, '字幕　第 3 句');
  assert.equal(m.focus, '改字', '鍵盤開的：焦點在第一項');
  await page.keyboard.press('ArrowUp');
  assert.equal((await menu()).focus, '刪除', '↑ 從第一項繞到最後一項');
  await page.keyboard.press('Home');
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowDown');
  assert.equal((await menu()).focus, '重點字幕');
  await page.keyboard.press('Enter');
  await wait();
  assert.equal(await menu(), null, 'Enter 執行完就關');
  assert.deepEqual((await st()).marks, [3], '重點字幕：和按 H 同一個動作');
  await page.keyboard.press('ContextMenu');
  await wait();
  assert.equal((await item('重點字幕')).checked, 'true', '選單鍵也能開；開著的項目有打勾');
  await page.keyboard.press('Escape');
  await undo();
  assert.deepEqual((await st()).marks, [], '同一套復原');

  // ---------- 3. 不能做的灰掉、寫原因 ----------
  // 最後一句不能合併；靠近句子開頭切不開（切開後有一半不到 0.3 秒）
  await rclick('cap', 33);   // 第 10 句：32.5–35.5 秒
  assert.match((await item('與下一句合併')).why, /這是最後一句/);
  await page.keyboard.press('Escape');
  await rclick('cap', 4.6);
  assert.match((await item('在播放頭分割')).why, /切開後有一半不到/);
  await page.keyboard.press('Escape');
  // 軌道鎖住：會改到這一軌的項目都灰掉；點了只跳提示、不執行、選單還在
  await page.click('#tlHeads [data-lock="cap"]');
  await rclick('cap', 5.5);
  m = await menu();
  assert.deepEqual(m.items.filter((x) => x.off).map((x) => x.label), ['改字', '在播放頭分割', '與下一句合併', '在後面新增一句', '在前面新增一句', '重點字幕', '刪除']);
  assert.ok(m.items.filter((x) => x.off).every((x) => /「字幕」軌已鎖定 → 點軌頭的鎖頭解鎖/.test(x.why)));
  await clearToasts();
  await pick('刪除');
  assert.ok(await menu(), '灰掉的項目點了不關選單');
  assert.equal((await st()).cues, 10, '也不執行');
  assert.match(await toastText(), /現在不能用：「字幕」軌已鎖定/);
  await page.keyboard.press('Escape');
  // 空白處＝那一軌的選單：鎖定有打勾，點了解鎖（和軌頭的鎖頭同一個動作）
  await rclick('cap', 4.2);   // 第 1、2 句之間的空檔
  m = await menu();
  assert.equal(m.head, '字幕軌');
  assert.equal((await item('鎖定這一軌')).checked, 'true');
  assert.match((await item('在這裡新增一句')).why, /軌已鎖定/);
  await pick('鎖定這一軌');
  assert.equal(await page.$eval('#tlHeads [data-lock="cap"]', (b) => b.classList.contains('on')), false, '解鎖了，軌頭的鎖頭跟著變');

  // ---------- 4. 選單只是入口：分割、刪除、改字都是現有的動作，自動存檔、復原照舊 ----------
  await rclick('cap', 6);
  await pick('在播放頭分割');
  assert.equal((await st()).cues, 11);
  assert.match(await toastText(), /已把第 2 句在 0:06\.0 切成兩句/);
  await until(() => srtCount() === 11, '分割後自動存進 rough.srt');
  await saved();
  await undo();
  assert.equal((await st()).cues, 10, '⌘／Ctrl＋Z 復原');
  await until(() => srtCount() === 10, '復原後檔案也回去');
  await rclick('cap', 19.5);   // 第 6 句：18.5–21.5 秒，沒有段落綁著
  await pick('刪除');
  assert.equal((await st()).cues, 9);
  await undo();
  assert.equal((await st()).cues, 10);
  await rclick('cap', 19.5);
  await pick('改字');
  assert.equal(await app(() => document.activeElement?.id), 'capEditor', '改字＝時間軸上直接改（和雙擊一樣）');
  await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
  await page.keyboard.type('改過的字');
  await page.keyboard.press('Enter');
  await until(() => /改過的字/.test(fs.readFileSync(srtFile, 'utf8')), '改的字自動存進 rough.srt');

  // ---------- 5. 字卡／動畫、素材：改文字跳到屬性；沒有現成動作的帶進修改單 ----------
  await rclick('anim', 3);
  m = await menu();
  assert.deepEqual((await st()).sel, { kind: 'item', id: 's01' });
  assert.equal(m.head, '字卡　s01');
  assert.deepEqual(m.items.map((x) => x.label), ['改這段的文字', '寫進修改單…', '▶ 播這段', '換一顆音效', '靜音', '還原成原本的', '換一種動畫（寫進修改單）', '拿掉這一段（寫進修改單）']);
  assert.match((await item('還原成原本的')).why, /現在就是原本的音效/);
  await pick('改這段的文字');
  await page.waitForFunction(() => document.activeElement?.closest?.('#inspBody') && document.activeElement.dataset.path);
  assert.equal((await st()).side, 'insp');
  await rclick('anim', 3);
  await pick('拿掉這一段（寫進修改單）');
  await page.waitForFunction(() => !document.querySelector('#requests').hidden);
  assert.deepEqual(await app(() => window.__editor.requests.map((r) => [r.id, r.tags, r.note])), [['s01', [], '拿掉這一段']]);
  await rclick('anim', 3);
  await pick('換一種動畫（寫進修改單）');
  assert.deepEqual(await app(() => window.__editor.requests.map((r) => [r.id, r.tags, r.note])), [['s01', ['換一種動畫'], '拿掉這一段']]);
  await rclick('anim', 20);   // s02、s03 之間只有講者
  assert.equal((await menu()).head, '只有講者的講解');
  await pick('這裡想加畫面（寫進修改單）…');
  assert.equal(await page.$eval('#rqTop', (el) => el.dataset.id), 't18');
  await rclick('media', 32);
  m = await menu();
  assert.equal(m.head, '素材　m01');
  assert.deepEqual(m.items.map((x) => x.label), ['看屬性', '寫進修改單…', '▶ 播這段', '換一段錄影（寫進修改單）', '拿掉這一段（寫進修改單）']);
  await pick('看屬性');
  assert.deepEqual([(await st()).side, (await st()).sel], ['insp', { kind: 'media', id: 'm01' }]);

  // ---------- 6. 主軌：分割、剪掉／恢復、接點轉場；人聲：選一段調音量、清掉 ----------
  await rclick('main', 12);
  m = await menu();
  assert.equal(m.head, '主軌片段　0:00.0 – 0:37.0');
  assert.match((await item('剪掉這一段')).why, /不能把整支影片都剪掉/);
  await pick('在這裡分割');
  await rclick('main', 12);
  assert.match((await item('在這裡分割')).why, /這裡已經切開了/);
  await page.keyboard.press('Escape');
  await rclick('main', 16);
  await pick('在這裡分割');
  assert.equal((await st()).splits.length, 2);
  await rclick('main', 14);
  await pick('剪掉這一段');
  const cut = (await st()).edit.cuts;
  assert.ok(cut.length === 1 && Math.abs(cut[0][0] - 12) < 0.05 && Math.abs(cut[0][1] - 16) < 0.05, JSON.stringify(cut));
  await until(() => readPlan().edit?.cuts?.length === 1, '剪掉的範圍自動存進 plan.json');
  await rclick('main', 14);
  assert.match((await menu()).head, /^剪掉的範圍/);
  sub = await openSub('接點轉場');
  assert.deepEqual(sub.items.map((x) => [x.label, x.checked]), [['無', 'true'], ['過黑', 'false'], ['放大', 'false']]);
  await pick('過黑', '#ctxSub');
  assert.deepEqual((await st()).edit.joins.map((j) => j.type), ['dip']);
  p = await app(() => { const T = window.__editor.timeline, r = document.querySelector('#tlCanvas').getBoundingClientRect(); return { x: r.left + T.xOf(window.__editor.edit.cuts[0][0]), y: r.top + T.L.main[0] + 7 }; });
  await clearToasts();
  await page.mouse.click(p.x, p.y, { button: 'right' });   // 主軌上緣的菱形
  await wait();
  m = await menu();
  assert.match(m.head, /^剪接點/);
  assert.deepEqual(m.items.map((x) => [x.label, x.checked]), [['無', 'false'], ['過黑', 'true'], ['放大', 'false'], ['▶ 試看這個接點', null]]);
  await pick('放大');
  assert.deepEqual((await st()).edit.joins.map((j) => j.type), ['punch']);
  await rclick('main', 14);
  await pick('恢復這一段');
  assert.deepEqual((await st()).edit.cuts, []);
  // 人聲：沒選範圍時灰掉、寫怎麼做；拖一段範圍後按右鍵＝那個範圍的選單
  await rclick('voice', 22);
  assert.equal((await menu()).head, '人聲軌');
  assert.match((await item('調整這段人聲音量')).why, /先在人聲軌拖曳選一段範圍/);
  await page.keyboard.press('Escape');
  await drag('voice', 20, 24, { y0: 12 });
  await rclick('voice', 22, 12);
  assert.match((await menu()).head, /^選取範圍/);
  await pick('調整這段人聲音量');
  let s = await st();
  assert.deepEqual([s.edit.gains.length, s.sel], [1, { kind: 'gain', id: 0 }]);
  await rclick('voice', 22, 12);
  assert.match((await menu()).head, /^人聲範圍音量/);
  await pick('清掉這段的調整');
  assert.deepEqual((await st()).edit.gains, []);
  await saved();
  assert.deepEqual(errors, []);
});

test('音效：換、靜音、還原某一段的主音效；在任意時間加一顆自己的音效，拖時間、調音量、換一顆、移除', { timeout: 240000 }, async (t) => {
  const { page, errors, readPlan, seg, until, app, pos, rclick, lclick, drag, menu, item, pick, openSub, toastText, st, saved, undo, clearToasts } = await setup(t, PLAN, { media: true });
  const mainOf = async (id) => (await st()).sfx.find((x) => x.main && x.id.startsWith(`${id}:`));
  const own = async () => (await st()).edit.sfx;

  // ---------- 1. 換一顆：可以先試聽；寫 plan.json 那一段的 sfx；標記馬上換、存檔後不會跳回舊的 ----------
  assert.equal((await mainOf('s02')).name, 'impact');
  await rclick('anim', 13);
  let sub = await openSub('換一顆音效');
  assert.deepEqual(sub.items.filter((x) => x.checked === 'true').map((x) => x.hint), ['impact'], '現在用的那一顆打勾');
  await pick('完成音', '#ctxSub', '.ctx-play');
  assert.equal(await app(() => window.__editor.auditioned), 'success', '▶ 先聽聽看');
  assert.ok(await menu('#ctxSub'), '試聽不關選單');
  assert.equal(seg('s02').sfx, 'impact', '還沒換');
  await pick('完成音', '#ctxSub');
  assert.equal(await menu(), null);
  assert.equal((await mainOf('s02')).name, 'success', '時間軸上的標記馬上換成新的');
  await until(() => seg('s02').sfx === 'success', '自動存進 plan.json 那一段的 sfx');
  // 存檔後、檢查報告回來前後：標記一直是新的名稱（不會先跳回 impact）
  for (let i = 0; i < 20; i++) { assert.equal((await mainOf('s02'))?.name, 'success', `第 ${i} 次看`); await wait(100); }
  await until(() => app(() => !window.__editor.checking), '等檢查跑完');
  assert.equal((await mainOf('s02')).name, 'success');
  // ---------- 2. 音效軌上的標記：靜音（Delete 同一個動作）、還原成原本的 ----------
  let mark = await mainOf('s02');
  await rclick('sfx', mark.at + 0.1);
  let m = await menu();
  assert.equal(m.head, 's02 的主音效　success');
  assert.deepEqual(m.items.map((x) => `${x.label}${x.key ? `[${x.key}]` : ''}`), ['換一顆音效', '靜音[Delete]', '還原成原本的', '調整這段音量', '▶ 試聽', '看這段的其他屬性']);
  await pick('靜音');
  await until(() => seg('s02').sfx === null, '靜音寫 null');
  await saved();
  mark = (await st()).sfx.find((x) => x.id.startsWith('s02:') && x.main);
  assert.equal(mark.muted, true);
  await rclick('sfx', mark.at + 0.1);
  assert.equal((await item('靜音')).checked, 'true');
  await pick('還原成原本的');
  await until(() => seg('s02').sfx === 'impact', '還原成 AI 原本寫的 impact（不是中間換過的 success）');
  // ---------- 3. 原本沒寫 sfx 的段（照情境預設）：屬性面板的「換一顆音效…」是同一份清單；還原＝欄位拿掉 ----------
  await lclick('anim', 3);
  await page.click('#inspBody [data-act="sfxSwap"]');
  await wait();
  m = await menu();
  assert.equal(m?.head, '換一顆音效');
  await pick('提示「滴」');
  await until(() => seg('s01').sfx === 'ding', 's01 換成 ding');
  await saved();
  await page.click('#inspBody [data-act="sfxRestore"]');
  await until(() => !('sfx' in seg('s01')), '還原：原本沒寫，欄位拿掉（照情境預設）');
  // ---------- 4. 原本沒有音效的段：選一顆，標記先出現在段落開頭 ----------
  assert.equal(await mainOf('s03'), undefined);
  await rclick('anim', 25);
  await openSub('換一顆音效');
  await pick('提示「滴」', '#ctxSub');
  assert.equal((await mainOf('s03'))?.name, 'ding');
  await until(() => seg('s03').sfx === 'ding', 's03 寫 ding');
  await until(() => app(() => !window.__editor.checking), '等檢查跑完');
  assert.equal((await mainOf('s03'))?.name, 'ding', '檢查報告回來後標記還在');
  await undo();
  await until(() => !('sfx' in seg('s03')), '復原：s03 又沒有 sfx');

  // ---------- 5. 自己加一顆：音效軌空白處按右鍵 ----------
  await rclick('sfx', 20);
  assert.equal((await menu()).head, '音效軌');
  await openSub('在這裡加音效');
  await pick('提示「滴」', '#ctxSub');
  let list = await own();
  assert.ok(list.length === 1 && list[0].sound === 'ding' && Math.abs(list[0].at - 20) < 0.05 && !('db' in list[0]), JSON.stringify(list));
  let s = await st();
  assert.deepEqual(s.sel, { kind: 'usfx', id: 0 }, '加了就選到它');
  assert.ok(s.sfx.some((x) => x.user === 0 && x.name === 'ding'), '時間軸音效軌上畫出來');
  assert.equal(await app(() => window.__editor.auditioned), 'ding', '加了就聽得到是哪一顆');
  assert.equal(await page.$eval('#inspKind', (el) => el.textContent), '自己加的音效');
  await until(() => JSON.stringify(readPlan().edit?.sfx) === JSON.stringify(list), '自動存進 plan.json 的 edit.sfx');
  // 左右拖＝改時間；上下拖＝調這一顆的音量
  await drag('sfx', 20.05, 23.05);
  list = await own();
  assert.ok(Math.abs(list[0].at - 23) < 0.1, `左右拖 3 秒：${JSON.stringify(list)}`);
  await drag('sfx', 23.05, 23.05, { dy: -8 });
  list = await own();
  assert.deepEqual([list[0].db, Math.abs(list[0].at - 23) < 0.1], [4, true], '往上拖 8 px＝+4 dB，時間不動');
  await until(() => JSON.stringify(readPlan().edit?.sfx) === JSON.stringify(list), '拖完自動存');
  // 再加一顆在 30 秒；把第一顆拖到它後面：照時間重排，選取跟著拖的那一顆走
  await rclick('sfx', 27);
  await openSub('在這裡加音效');
  await pick('完成音', '#ctxSub');
  assert.deepEqual((await own()).map((x) => x.sound), ['ding', 'success']);
  await drag('sfx', 23.05, 28.55);
  s = await st();
  assert.deepEqual([s.edit.sfx.map((x) => x.sound), s.sel], [['success', 'ding'], { kind: 'usfx', id: 1 }]);
  // 按右鍵：換一顆、調整音量（跳到屬性的滑桿）、移除
  mark = s.sfx.find((x) => x.user === 1);
  await rclick('sfx', mark.at + 0.1);
  m = await menu();
  assert.equal(m.head, '自己加的音效　提示「滴」');
  assert.deepEqual(m.items.map((x) => `${x.label}${x.hint ? `(${x.hint})` : ''}${x.key ? `[${x.key}]` : ''}`), ['換一顆音效', '調整音量(+4 dB)', '▶ 試聽', '移除[Delete]']);
  sub = await openSub('換一顆音效');
  assert.deepEqual(sub.items.filter((x) => x.checked === 'true').map((x) => x.hint), ['ding']);
  await pick('綜藝「咚咚」', '#ctxSub');
  assert.deepEqual((await own()).map((x) => [x.sound, x.db ?? 0]), [['success', 0], ['impact', 4]], '換一顆：時間、音量照舊');
  mark = (await st()).sfx.find((x) => x.user === 1);
  await rclick('sfx', mark.at + 0.1);
  await pick('調整音量');
  await page.waitForFunction(() => document.activeElement?.dataset?.f === 'ownDb');
  await app(() => document.activeElement.blur());
  // Delete＝移除；復原拿得回來
  await lclick('sfx', mark.at + 0.1);
  assert.deepEqual((await st()).sel, { kind: 'usfx', id: 1 });
  await page.keyboard.press('Delete');
  assert.deepEqual((await own()).map((x) => x.sound), ['success']);
  await undo();
  assert.deepEqual((await own()).map((x) => x.sound), ['success', 'impact']);
  mark = (await st()).sfx.find((x) => x.user === 0);
  await rclick('sfx', mark.at + 0.1);
  await pick('移除');
  assert.deepEqual((await own()).map((x) => x.sound), ['impact']);
  await until(() => readPlan().edit?.sfx?.length === 1 && readPlan().edit.sfx[0].sound === 'impact', '移除後自動存');
  // 軌道鎖住：拖不動、選單的項目灰掉
  await page.click('#tlHeads [data-lock="sfx"]');
  const before = JSON.stringify(await own());
  mark = (await st()).sfx.find((x) => x.user === 0);
  await drag('sfx', mark.at + 0.1, mark.at + 3);
  assert.equal(JSON.stringify(await own()), before, '鎖住的軌拖不動');
  await rclick('sfx', mark.at + 0.1);
  m = await menu();
  assert.deepEqual(m.items.filter((x) => x.off).map((x) => x.label), ['換一顆音效', '調整音量', '移除']);
  await page.keyboard.press('Escape');
  await rclick('sfx', 5);
  assert.match((await item('在這裡加音效')).why, /「音效」軌已鎖定/);
  await pick('鎖定這一軌');
  // 剪掉的範圍裡加了也不會出聲：灰掉、寫原因
  await app(() => { const A = window.__editor; A.setSelection(8, 10); });
  await page.keyboard.press('Delete');
  assert.equal((await st()).edit.cuts.length, 1);
  await rclick('sfx', 9);
  assert.match((await item('在這裡加音效')).why, /這裡是剪掉的範圍，加了也不會出聲/);
  await page.keyboard.press('Escape');
  await saved();
  // 存好的 plan.json：build 的檢查過得了，報告有「自己加的音效」那一行
  const plan = readPlan();
  assert.deepEqual(plan.edit.sfx.map((x) => [x.sound, x.db]), [['impact', 4]]);
  await until(() => app(() => !window.__editor.checking), '等檢查跑完');
  assert.deepEqual(await app(() => window.__editor.report?.issues?.errors ?? null), [], '檢查沒有 ✖');
  assert.deepEqual(errors, []);
  assert.doesNotMatch(await toastText(), /沒有存成功/);
});

test('初剪預覽（還沒排段落）：字幕的項目照常能用；加音效、寫修改單灰掉並寫原因', { timeout: 120000 }, async (t) => {
  const { errors, rclick, menu, item } = await setup(t, { version: 1 });
  await rclick('sfx', 5);
  assert.match((await item('在這裡加音效')).why, /^初剪預覽階段還不能/);
  await rclick('anim', 5);
  assert.match((await item('這裡想加字卡或動畫（寫進修改單）…')).why, /^初剪預覽階段還不能/);
  await rclick('cap', 5.5);
  const m = await menu();
  assert.equal(m.head, '字幕　第 2 句');
  assert.ok(m.items.every((x) => !x.off), '初剪預覽是來校字幕的：字幕的項目都能用');
  assert.deepEqual(errors, []);
});
