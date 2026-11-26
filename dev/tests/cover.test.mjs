// 封面（090）：三個情境的內容檢查、版面、給 AI 的指令；有 ffmpeg／Chrome 才跑的出圖與封面台頁面。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { TEMPLATE, imp, missingTools, tmpDir } from './helpers.mjs';

const CV = await imp('lib/cover.mjs');
const SV = await imp('editor/server/cover.mjs');
const noShot = await missingTools('chrome', 'ffmpeg');
const noUi = await missingTools('chrome', 'ffmpeg', 'puppeteer');

const GOOD = {
  cutout: { kicker: 'EP 12', title: '*自動剪片*|只要出一張嘴', chips: [{ icon: 'scissors', text: '自動剪 NG' }, '免費開源'], behind: { at: 2 } },
  mock: { title: '*講一句*|它就開剪', mock: { kind: 'chat', bubbles: [{ me: true, text: '幫我把這支口播剪好' }, { text: '剪好了' }] } },
  icon: { title: '*18 個模板*', sub: 'Mac、Windows 都能用', icon: 'clapperboard' },
};
const CTX = { icons: new Set(['scissors', 'clapperboard', 'triangle-alert', 'arrow-right']), exists: (p) => p === 'work/cover/plate.png', hasPic: (p) => p === 'ai/robot', duration: 60 };

test('090 三個情境：名稱、預設描述齊全', () => {
  assert.deepEqual(CV.COVER.scenes, ['cutout', 'mock', 'icon']);
  for (const s of CV.COVER.scenes) assert.ok(CV.COVER.names[s] && CV.COVER.notes[s].length > 10, s);
});

test('090 fitLines：每一行各自撐到寬度（字少的行比較大）、合計高度不超過框', () => {
  const lines = CV.parseTitle('*自動剪片*|只要出一張嘴');
  const sizes = CV.fitLines(lines, 950, 600, 230);
  assert.ok(sizes[0] > sizes[1], '四個字那一行比六個字那一行大');
  assert.ok(sizes.every((z, i) => z * CV.lineEm(lines[i]) <= 950 + 1 && z <= 230));
  const tight = CV.fitLines(lines, 950, 200, 230);
  assert.ok(tight.reduce((s, z) => s + z * 1.22, 0) <= 200 + 1, '高度不夠就一起縮');
});

test('090 coverProblems：合格的三張沒有問題；每一則問題都帶 →', () => {
  for (const s of CV.COVER.scenes) assert.deepEqual(CV.coverProblems(s, GOOD[s], CTX), [], s);
  const all = [
    CV.coverProblems('cutout', { ...GOOD.cutout, title: '' }, CTX),
    CV.coverProblems('cutout', { ...GOOD.cutout, chips: ['一', '二', '三', '四', '五'] }, CTX),
    CV.coverProblems('cutout', { ...GOOD.cutout, chips: [{ icon: 'no-such-icon', text: '免費' }] }, CTX),
    CV.coverProblems('cutout', { ...GOOD.cutout, behind: { at: 99 } }, CTX),
    CV.coverProblems('cutout', { ...GOOD.cutout, behind: { image: 'work/cover/none.png' } }, CTX),
    CV.coverProblems('mock', { title: '標題' }, CTX),
    CV.coverProblems('mock', { title: '標題', mock: { kind: 'chat', bubbles: [] } }, CTX),
    CV.coverProblems('mock', { title: '標題', mock: { kind: 'alert', body: '沒有標題' } }, CTX),
    CV.coverProblems('mock', { title: '標題', mock: { kind: 'compare', left: { title: '之前', rows: ['一', '二', '三', '四'] }, right: {} } }, CTX),
    CV.coverProblems('mock', { title: '標題', mock: { kind: 'image' } }, CTX),
    CV.coverProblems('icon', { title: '標題' }, CTX),
    CV.coverProblems('icon', { title: '標題', icon: 'no-such-icon' }, CTX),
    CV.coverProblems('icon', { title: '標題', pic: 'ai/none' }, CTX),
    CV.coverProblems('icon', null, CTX),
    CV.coverProblems('poster', GOOD.icon, CTX),
  ];
  for (const list of all) { assert.ok(list.length >= 1, JSON.stringify(list)); for (const m of list) assert.match(m, / → /, m); }
  assert.match(all[1][0], /底部重點 5 個，最多 4 個/);
  assert.match(all[3][0], /behind\.at 99 不在影片裡（0–60 秒）/);
  assert.match(all[8].join('\n'), /有 4 列，最多 3 列[\s\S]*少了 right\.title/);
  assert.deepEqual(CV.coverProblems('cutout', { title: '只有標題' }, CTX), [], '去背＋內容只要標題就能出');
  assert.deepEqual(CV.coverProblems('icon', { title: '標題', pic: 'ai/robot' }, CTX), []);
  assert.deepEqual(CV.coverProblems('mock', { title: '標題', mock: { kind: 'image', image: 'work/cover/plate.png' } }, CTX), []);
});

test('090 coverHtml：橫式有底部重點、直式都在中間 3:4 裡；不放頻道名和講者名；三個情境各有自己的主視覺', () => {
  const icons = { scissors: '<svg data-i="scissors"></svg>', clapperboard: '<svg data-i="clap"></svg>', 'triangle-alert': '<svg></svg>', 'arrow-right': '<svg data-i="arrow"></svg>', 'arrow-down': '<svg data-i="arrow"></svg>' };
  const base = { frame: 'frame.jpg', cutout: 'cutout.png', speakerBox: [300, 100, 900, 1080], icons, kit: 'file:///kit' };
  for (const format of ['landscape', 'portrait']) {
    const V = format === 'portrait';
    const cut = CV.coverHtml({ ...base, scene: 'cutout', format, cover: GOOD.cutout, behind: 'behind.jpg' });
    assert.match(cut, new RegExp(`#cover \\{ position: relative; width: ${V ? 1080 : 1920}px; height: ${V ? 1920 : 1080}px`));
    assert.match(cut, /<em>自動剪片<\/em>/);
    assert.match(cut, /class="kicker">EP 12</);
    assert.match(cut, /class="card"[^>]*><img src="behind\.jpg"/);
    assert.match(cut, /class="cut" src="cutout\.png"/);
    assert.doesNotMatch(cut, /class="bar"/, '封面上不放頻道列');
    assert.doesNotMatch(cut, /class="glow"|text-shadow/, '上面不加光暈（背景、標題）');
    assert.equal((cut.match(/box-shadow/g) || []).length, 1, '光暈只在底部重點的框上');
    assert.match(cut, /\.chip \{[^}]*box-shadow: 0 0 14px color-mix\(in srgb, var\(--brand\)/);
    assert.equal(/class="chips"/.test(cut.split('</style>')[1]), !V, '底部重點只有橫式有');
    if (!V) { assert.match(cut, /data-i="scissors"><\/svg><span>自動剪 NG<\/span>/); assert.match(cut, /class="chips" style="[^"]*font-size:68px/, '兩個短的重點：字放到上限 68'); }
    const text = cut.match(/\.text \{ position: absolute; left: (\d+)px; top: (\d+)px; width: (\d+)px/);
    if (V) assert.ok(+text[2] >= 240 && +text[2] + 520 <= 1680, '直式的標題在中間 3:4 裡');
    else assert.equal(+text[2], 64, '橫式沒有頻道列：標題從上邊界開始，和下邊界留的一樣');
    const raw = CV.coverHtml({ ...base, cutout: null, scene: 'cutout', format, cover: { title: '沒去背' } });
    assert.match(raw, /class="raw" src="frame\.jpg"/, '沒有去背圖就放原圖');
    assert.doesNotMatch(raw.split('</style>')[1], /class="card"/, '沒有 behind 就沒有內容卡');

    const chat = CV.coverHtml({ ...base, scene: 'mock', format, cover: GOOD.mock });
    assert.match(chat, /class="bb me" style="white-space:nowrap">幫我把這支口播剪好<\/div><div class="bb ai" style="white-space:nowrap">剪好了</, '一行放得完就不折行');
    const long = CV.coverHtml({ ...base, scene: 'mock', format, cover: { title: '標題', mock: { kind: 'chat', bubbles: [{ text: '這一則對話寫得比較長，一行一定放不完要折成兩行' }] } } });
    assert.match(long, /class="bb ai" style="max-width:\d+px">/, '放不完才折行');
    const alert = CV.coverHtml({ ...base, scene: 'mock', format, cover: { title: '標題', mock: { kind: 'alert', title: 'AI 不認識你', body: '不知道你是誰', buttons: ['重新交代', '從零開始'] } } });
    assert.match(alert, /class="t">AI 不認識你<[\s\S]*<span>重新交代<\/span><span>從零開始<\/span>/);
    const cmp = CV.coverHtml({ ...base, scene: 'mock', format, cover: { title: '標題', mock: { kind: 'compare', left: { title: '之前', rows: ['手動剪'] }, right: { title: '之後', rows: ['講一句'] } } } });
    assert.match(cmp, /class="mk mk-cmp stack"[\s\S]*class="cd before"><div class="h">之前<\/div><div class="rw">手動剪<[\s\S]*data-i="arrow"[\s\S]*class="cd after"><div class="h">之後</, '上下疊比較大就用上下疊');
    const img = CV.coverHtml({ ...base, scene: 'mock', format, cover: { title: '標題', mock: { kind: 'image', image: 'work/cover/plate.png' } }, image: 'file:///p/plate.png' });
    assert.match(img, /class="mk-img" src="file:\/\/\/p\/plate\.png"/);

    const ic = CV.coverHtml({ ...base, scene: 'icon', format, cover: GOOD.icon });
    assert.match(ic, /class="tile"[^>]*><svg data-i="clap">/);
    assert.match(ic, /class="sub">Mac、Windows 都能用</);
    const pic = CV.coverHtml({ ...base, scene: 'icon', format, cover: { title: '標題', pic: 'ai/robot' }, picSvg: '<svg data-pic="1"></svg>' });
    assert.match(pic, /class="tile"[^>]*><svg data-pic="1">/);
  }
  // 沒有底部重點時，標題和主視覺往下用到底
  const noChips = CV.coverHtml({ ...base, scene: 'icon', format: 'landscape', cover: GOOD.icon });
  const withChips = CV.coverHtml({ ...base, scene: 'icon', format: 'landscape', cover: { ...GOOD.icon, chips: ['一', '二'] } });
  const visH = (h) => +h.match(/class="vis" style="[^"]*height:(\d+)px/)[1];
  assert.ok(visH(noChips) > visH(withChips));
  assert.match(CV.coverHtml({ ...base, scene: 'icon', format: 'landscape', cover: { title: '<b>&' , icon: 'clapperboard' } }), /&lt;b&gt;&amp;/, '文字要跳脫');
});

test('090 coverPrompt：只列勾起來的情境、帶使用者改的描述；指定標題就不叫 AI 另外想；直式不提底部重點', () => {
  const scenes = [{ id: 'cutout', on: true, note: '講者站前面，後面放剪輯台的畫面' }, { id: 'mock', on: false, note: 'x' }, { id: 'icon', on: true, note: CV.COVER.notes.icon }];
  const p = SV.coverPrompt({ project: 'projects/demo', format: 'landscape', scenes, title: '', at: 21.7, hasFinal: true });
  assert.match(p, /做這支影片的封面（專案 projects\/demo，橫式 1920×1080）/);
  assert.match(p, /要做 2 張，一個情境一張：\n1\. 去背＋內容（covers\.cutout）：講者站前面，後面放剪輯台的畫面\n2\. 大塊圖示（covers\.icon）：/);
  assert.doesNotMatch(p, /covers\.mock/);
  assert.match(p, /標題每一張各想一組/);
  assert.match(p, /"at": 21\.7/);
  assert.match(p, /取完成影片那一秒的畫面/);
  assert.match(p, /chips（底部重點，最多 4 個/);
  assert.match(p, /node shared\/template\/tools\/caps\.mjs，照它最後印的「這次生圖走」那條路生成/);
  assert.match(p, /node shared\/template\/tools\/media\.mjs cover --project projects\/demo\n/);
  const v = SV.coverPrompt({ project: 'projects/demo', format: 'portrait', scenes: scenes.map((s) => ({ ...s, on: true })), title: '*自動剪片*', at: 3, hasFinal: false });
  assert.match(v, /直式 1080×1920/);
  assert.match(v, /標題使用者已經指定：「\*自動剪片\*」，每一張都用這一句，不改字。/);
  assert.doesNotMatch(v, /chips/);
  assert.match(v, /取初剪那一秒的畫面/);
  assert.match(v, /covers\.mock 多一個 mock（四選一）/);
  assert.match(v, new RegExp(`每列最多 ${CV.COVER.compare.row} 個字寬`), '情境元件的上限寫在指令裡，和檢查用同一組數字');
  assert.match(CV.coverProblems('mock', { title: '標題', mock: { kind: 'compare', left: { title: '之前', rows: ['這一列實在太長了啦'] }, right: { title: '之後', rows: [] } } }, CTX)[0], new RegExp(`對照卡的列「這一列實在太長了啦」有 9 個字寬，最多 ${CV.COVER.compare.row} → `));
});

// ---------- 以下要 ffmpeg／Chrome ----------

function fakeProject(t, { final = true } = {}) {
  const root = tmpDir(t, 'cover-');
  const project = path.join(root, 'projects/demo'), work = path.join(project, 'work');
  fs.mkdirSync(path.join(work, 'hyperframes'), { recursive: true });
  fs.mkdirSync(path.join(root, 'shared'));
  fs.symlinkSync(TEMPLATE, path.join(root, 'shared/template'), 'dir');
  fs.writeFileSync(path.join(work, 'hyperframes/plan.json'), JSON.stringify({ version: 1, speakerBox: [600, 100, 1300, 1080], scenes: [] }));
  const mk = (file, color) => assert.equal(spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `color=c=${color}:size=640x360:rate=10`, '-t', '12', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', file]).status, 0);
  mk(path.join(work, 'rough.mp4'), 'navy');
  if (final) { fs.mkdirSync(path.join(project, 'output')); mk(path.join(project, 'output/final.mp4'), 'teal'); }
  return { root, project, work, template: path.join(root, 'shared/template') };
}

test('090 makeCovers：照 cover.json 出圖（三張都是 1920×1080）、內容不合就擋、--only 只出一張、選定複製成 cover.jpg', { skip: noShot }, async (t) => {
  const { findChrome } = await imp('lib/audit-browser.mjs');
  const { probeMedia } = await imp('lib/ff.mjs');
  const P = fakeProject(t), logs = [];
  const run = (o = {}) => CV.makeCovers({ project: P.project, templateDir: P.template, root: P.root, chrome: findChrome(), log: (l) => logs.push(l), remove: (img, out) => { fs.copyFileSync(img, out); return true; }, ...o });
  assert.throws(() => run(), /還沒有封面內容 → /);
  // --title：最快出第一張（只有去背＋內容）
  let r = run({ set: { title: '*自動剪片*|只要出一張嘴', kicker: null, at: null } });
  assert.deepEqual(r.scenes, ['cutout']);
  assert.equal(CV.readCover(P.project).covers.cutout.title, '*自動剪片*|只要出一張嘴');
  assert.match(logs.join('\n'), /還沒有內容、沒出圖：情境模擬、大塊圖示/);
  // 三張
  CV.writeCover(P.project, { at: 3, covers: GOOD });
  r = run();
  assert.deepEqual(r.scenes, ['cutout', 'mock', 'icon']);
  assert.equal(r.format, 'landscape');
  for (const f of r.files) { const m = probeMedia(f); assert.deepEqual([m.width, m.height], [1920, 1080], f); }
  assert.ok(fs.existsSync(path.join(P.work, 'cover/behind.jpg')), '後面那張取自完成影片');
  assert.equal(fs.readdirSync(path.join(P.work, 'cover')).filter((n) => /^cand-\d\.jpg$/.test(n)).length, 8);
  // 內容不合：整批不出，訊息標出是哪一張
  CV.writeCover(P.project, { at: 3, covers: { ...GOOD, icon: { title: '標題', icon: 'no-such-icon' } } });
  assert.throws(() => run(), /大塊圖示：找不到圖示「no-such-icon」/);
  // --only：別張壞掉不影響
  const before = fs.statSync(CV.coverJpg(P.project, 'cutout')).mtimeMs;
  r = run({ only: ['mock'] });
  assert.deepEqual(r.scenes, ['mock']);
  assert.equal(fs.statSync(CV.coverJpg(P.project, 'cutout')).mtimeMs, before);
  // --brief：不開封面台也印得出同一段指令（專案路徑從工作區根目錄寫起、帶講者那一格）
  const brief = CV.coverBrief({ project: P.project, templateDir: P.template, root: P.root, title: '*自動剪片*' });
  assert.match(brief, /做這支影片的封面（專案 projects\/demo，橫式 1920×1080）[\s\S]*要做 3 張[\s\S]*「\*自動剪片\*」[\s\S]*"at": 3,[\s\S]*media\.mjs cover --project projects\/demo\n/);
  // 選定
  const picked = CV.pickCover(P.project, 'mock');
  assert.ok(fs.existsSync(picked) && picked.endsWith(path.join('output', 'cover', 'cover.jpg')));
  assert.equal(CV.readCover(P.project).pick, 'mock');
  assert.throws(() => CV.pickCover(P.project, 'poster'), /還沒出圖/);
  // 直式專案
  fs.writeFileSync(path.join(P.work, 'hyperframes/plan.json'), JSON.stringify({ version: 1, format: 'portrait', scenes: [] }));
  CV.writeCover(P.project, { at: 3, covers: GOOD });
  r = run({ only: ['icon'] });
  const m = probeMedia(r.files[0]);
  assert.deepEqual([m.width, m.height], [1080, 1920]);
});

test('090 封面台：挑表情、勾情境複製指令、改字重出、字太長會擋、選定', { skip: noUi }, async (t) => {
  const puppeteer = (await import('puppeteer-core')).default;
  const { startEditor } = await imp('editor.mjs');
  const { findChrome } = await imp('lib/audit-browser.mjs');
  const P = fakeProject(t);
  CV.writeCover(P.project, { covers: { mock: GOOD.mock } });
  const editor = await startEditor({ cwd: P.root, flags: { project: P.project, template: P.template }, port: 0, writeState: false });
  const rendered = [];
  // 出圖換成假的（不開第二個 Chrome）：寫一張小圖，記下出了哪幾張
  editor.ctx.coverRunner = async (scenes) => {
    rendered.push(scenes);
    fs.mkdirSync(path.join(P.project, 'output/cover'), { recursive: true });
    for (const s of scenes) spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:size=192x108', '-frames:v', '1', CV.coverJpg(P.project, s)]);
    return { ok: true };
  };
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: findChrome(), headless: true });
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewport({ width: 1500, height: 1000 });
    await page.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => { window.copied = text; } } }); });
    await page.goto(new URL('/cover', editor.url).href);
    await page.waitForSelector('.cv-cand');
    assert.equal((await page.$$('.cv-cand')).length, 8);
    assert.equal(await page.$eval('#projName', (el) => el.textContent), 'demo・橫式 1920×1080');
    assert.deepEqual(await page.$$eval('.cv-scene label', (els) => els.map((el) => el.textContent)), ['去背＋內容', '情境模擬', '大塊圖示']);
    assert.equal(await page.$eval('.cv-scene[data-scene="mock"] textarea', (el) => el.value), CV.COVER.notes.mock, '描述預設是內建的那一段');
    assert.match(await page.$eval('.cv-card[data-scene="cutout"] .cv-empty', (el) => el.textContent), /還沒有這一張/);
    // 挑表情：寫進 cover.json
    await page.click('.cv-cand:nth-child(5)');
    await page.waitForFunction(() => document.querySelector('.cv-cand:nth-child(5)').getAttribute('aria-pressed') === 'true');
    const at = CV.readCover(P.project).at;
    assert.equal(at, CV.candidateTimes(12)[4]);
    // 取消一個情境、改描述、複製
    await page.click('#on-icon');
    await page.$eval('.cv-scene[data-scene="cutout"] textarea', (el) => { el.value = '講者站前面，後面放剪輯台的畫面'; });
    await page.click('#copy');
    await page.waitForFunction(() => /已複製/.test(document.querySelector('#status').textContent));
    const copied = await page.evaluate(() => window.copied);
    assert.match(copied, /要做 2 張[\s\S]*covers\.cutout）：講者站前面，後面放剪輯台的畫面/);
    assert.doesNotMatch(copied, /covers\.icon/);
    assert.match(copied, new RegExp(`"at": ${at}`));
    assert.equal(fs.readFileSync(path.join(P.work, 'cover/request.md'), 'utf8'), copied, '需求存在專案裡');
    assert.deepEqual(CV.readCover(P.project).request.scenes.icon, { on: false, note: CV.COVER.notes.icon });
    assert.deepEqual(CV.readCover(P.project).covers.mock, GOOD.mock, '複製指令不動已經寫好的內容');
    // 改字重出：只出那一張
    await page.waitForSelector('.cv-card[data-scene="mock"] [data-path="mock.bubbles.1.text"]');
    await page.$eval('.cv-card[data-scene="mock"] [data-path="mock.bubbles.1.text"]', (el) => { el.value = '剪好了，NG 都拿掉了'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.click('.cv-card[data-scene="mock"] [data-act="render"]');
    await page.waitForSelector('.cv-card[data-scene="mock"] .cv-shot img');
    assert.deepEqual(rendered, [['mock']]);
    assert.equal(CV.readCover(P.project).covers.mock.mock.bubbles[1].text, '剪好了，NG 都拿掉了');
    // 字太長：不存、不出圖，訊息留在那一張下面
    await page.$eval('.cv-card[data-scene="mock"] [data-path="title"]', (el) => { el.value = '這一行實在是太長了放不進封面啦'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.click('.cv-card[data-scene="mock"] [data-act="render"]');
    await page.waitForFunction(() => /一行最多 9/.test(document.querySelector('.cv-card[data-scene="mock"] .cv-msg').textContent));
    assert.equal(CV.readCover(P.project).covers.mock.title, GOOD.mock.title);
    assert.equal(rendered.length, 1);
    assert.equal(await page.$eval('.cv-card[data-scene="mock"] [data-path="title"]', (el) => el.value), '這一行實在是太長了放不進封面啦', '還沒送出的字不會被輪詢蓋掉');
    // 選定
    await page.waitForSelector('.cv-card[data-scene="mock"] [data-act="pick"]:not([disabled])');   // 出圖中不能選：等下一次輪詢看到出完了
    await page.click('.cv-card[data-scene="mock"] [data-act="pick"]');
    await page.waitForSelector('.cv-card[data-scene="mock"].picked');
    assert.ok(fs.existsSync(path.join(P.project, 'output/cover/cover.jpg')));
    assert.equal((await fetch(new URL('/cover/file/cover.jpg', editor.url))).status, 200);
    assert.equal((await fetch(new URL('/cover/file/..%2Fcover.json', editor.url))).status, 404, '只供應封面的圖');
    assert.deepEqual(errors, []);
    // 剪輯台頂列的按鈕
    await page.goto(editor.url);
    await page.waitForSelector('#btnCover');
    assert.equal(await page.$eval('#btnCover', (el) => el.textContent), '做封面');
  } finally {
    await browser?.close();
    await editor.close();
  }
});
