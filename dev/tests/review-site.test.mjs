// 063：versions.mjs site——手機確認頁（work/site/index.html）：每段的段號、動畫是什麼、完成影片時間、最後一格、對應字幕、想怎麼改；
// 最後一格沿用完成態截圖、舊的才補截；圖壓到 120 KB 內；「複製提示詞」複製的整份修改單和剪輯台同一份格式，貼回來照流程 F 改得動。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { TOOLS, TEMPLATE, imp, makeSrt, tmpDir, missingTools, hasFfmpeg } from './helpers.mjs';

const S = await imp('lib/review-site.mjs');
const RQ = await imp('lib/requests-md.mjs');
const V = await imp('versions.mjs');
const { pathsFrom } = await imp('build.mjs');
const { requestsInfo } = await imp('editor/server/requests.mjs');

const write = (p, rel, text) => { const f = path.join(p, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); return f; };
const age = (f, sec) => { const t = new Date(Date.now() - sec * 1000); fs.utimesSync(f, t, t); };
const SCENES = [
  { id: 's01', scene: 'concept', from: '#1', to: '#2', slots: { text: '開場' }, story: { say: '為什麼要用手機拍' } },
  { id: 'x02', type: 'custom', template: 'x-route', src: 'compositions/x-route-x02.html', from: '#3', to: '#4', slots: { title: '路線' }, story: { say: '影片繞了一圈才到電腦' } },
  { id: 'm03', type: 'media', src: 'assets/screen/demo.mp4', from: '#5', to: '#6' },
  { id: 'p04', type: 'media', src: 'assets/images/logo.png', from: '#7', to: '#8' },
];
// 假的 build --check：每段 2 句，完成影片時間＝原本時間（沒有剪掉的）
const CHECK = () => ({ ok: true, format: 'landscape', edit: { cuts: [] }, items: SCENES.map((s, i) => ({ id: s.id, type: s.type || 'scene', start: i * 7 + 1, end: i * 7 + 7.5, out: { start: i * 7 + 1, end: i * 7 + 7.5 } })) });
const NAMES = () => ({ scenes: [{ key: 'concept', zh: '概念卡' }], fx: [], custom: new Map([['x-route', '路線圖']]) });

function project(t) {
  const root = tmpDir(t, 'site-');
  fs.mkdirSync(path.join(root, 'shared'), { recursive: true });
  fs.symlinkSync(TEMPLATE, path.join(root, 'shared', 'template'), 'dir');
  const p = path.join(root, 'projects', 'ep');
  write(p, 'work/rough.srt', makeSrt({ n: 8 }));
  write(p, 'work/storyboard.md', '# 分鏡表\n');
  write(p, 'work/hyperframes/plan.json', JSON.stringify({ version: 1, scenes: SCENES }, null, 2) + '\n');
  write(p, 'work/hyperframes/compositions/x-route-x02.html', '<template id="x-route-x02"></template>\n');
  write(p, 'work/hyperframes/compositions/concept-s01.html', '<template id="concept-s01"></template>\n');
  return { root, p, P: pathsFrom({ project: p, template: path.join(root, 'shared', 'template') }) };
}
// 一張 1920×1080 的雜訊圖（壓不小的那種），當完成態截圖
function shotPng(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=1', '-vf', 'noise=alls=60:allf=t', '-frames:v', '1', file]);
  assert.equal(r.status, 0, String(r.stderr));
  return file;
}

test('siteSegments：照完成影片時間排；段號、種類標籤（字卡／動畫／錄影／圖片）、動畫是什麼、時間、對應字幕；--only、--round 的範圍與錯誤', (t) => {
  const { P } = project(t);
  const plan = JSON.parse(fs.readFileSync(P.plan, 'utf8'));
  const { segs, scope } = S.siteSegments(P, CHECK(), plan, { names: NAMES() });
  assert.equal(scope, '全部段落');
  assert.deepEqual(segs.map((s) => [s.id, s.badge, s.kind]), [['s01', '字卡', 'anim'], ['x02', '動畫', 'anim'], ['m03', '錄影', 'media'], ['p04', '圖片', 'media']]);
  const [a, b, c] = segs;
  assert.equal(a.title, '為什麼要用手機拍');
  assert.equal(a.what, '資訊卡 concept（概念卡）');
  assert.equal(a.time, '0:01.0–0:07.5');
  assert.deepEqual(a.subs.map((x) => x.n), [1, 2]);
  assert.equal(b.what, '模板動畫 x-route（路線圖）');
  assert.equal(b.file, 'projects/ep/work/hyperframes/compositions/x-route-x02.html');
  assert.equal(c.shown, '錄影：demo.mp4');
  assert.equal(c.file, 'projects/ep/assets/screen/demo.mp4');
  const only = S.siteSegments(P, CHECK(), plan, { only: ['x02', 's01'], names: NAMES() });
  assert.deepEqual([only.scope, only.segs.map((s) => s.id)], ['指定的 2 段', ['s01', 'x02']]);
  assert.throws(() => S.siteSegments(P, CHECK(), plan, { only: ['s99'] }), /--only 的 s99 不在 plan\.json.*→ 現有：s01、x02、m03、p04/);
  const round = S.siteSegments(P, CHECK(), plan, { round: { round: 'r2', ids: new Set(['x02']) }, names: NAMES() });
  assert.deepEqual([round.scope, round.segs.map((s) => s.id)], ['r2 改到的 1 段', ['x02']]);
});

test('roundSegs：最新一輪 r<N>.md 的「改了哪幾段」與分類表的段', (t) => {
  const { p } = project(t);
  assert.equal(S.roundSegs(p), null);
  write(p, 'work/feedback/r1.md', '# 回饋 r1（2026-11-19 10:00）\n\n## 原話\n\n「s01 字太多」\n\n## 分類\n\n| # | 原話節錄 | 規則／個案 | 改哪一段 | 改法 |\n|---|---|---|---|---|\n| 1 | s01 字太多 | 個案 | s01 | 縮短 |\n\n## 改了哪幾段\n\n- s01：縮短（v1 → v2）\n');
  write(p, 'work/feedback/r2.md', '# 回饋 r2（2026-11-19 11:00）\n\n## 原話\n\n「照修改單改」\n\n## 分類\n\n| # | 原話節錄 | 規則／個案 | 改哪一段 | 改法 |\n|---|---|---|---|---|\n| 1 | 慢一點 | 個案 | x02 | （versions.mjs finish 會填） |\n\n## 改了哪幾段\n\n- m03：放慢（v1 → v2）\n');
  const r = S.roundSegs(p);
  assert.equal(r.round, 'r2');
  assert.deepEqual([...r.ids].sort(), ['m03', 'x02']);
});

test('findShot／sourceTime：分鏡截圖和量測截圖取比較新的；動畫檔、最新版本比截圖新＝要補截', (t) => {
  const { P, p } = project(t);
  assert.equal(S.findShot(P, 'x02'), null);
  const sb = write(p, 'work/storyboard-preview/x02-k.png', 'x');
  write(p, 'work/storyboard-preview/shots.json', JSON.stringify({ shots: [{ id: 'x02', at: 1, file: 'x02.png' }, { id: 'x02', at: 3, file: 'x02-k.png' }] }));
  age(sb, 300);
  const au1 = write(p, 'work/audit-shots/x02-9.50.jpg', 'x'), au2 = write(p, 'work/audit-shots/x02-13.20.jpg', 'x');
  age(au1, 10); age(au2, 60);
  assert.deepEqual([S.findShot(P, 'x02').from, path.basename(S.findShot(P, 'x02').file)], ['audit', 'x02-13.20.jpg'], '量測截圖取秒數最大的（完成態），比分鏡截圖新');
  age(au2, 900);
  assert.equal(path.basename(S.findShot(P, 'x02').file), 'x02-k.png', 'shots.json 這段最後一張＝完成態');
  const comp = path.join(p, 'work/hyperframes/compositions/x-route-x02.html');
  age(comp, 1200);
  assert.ok(S.sourceTime(P, SCENES[1], 'x02') < S.findShot(P, 'x02').t, '動畫檔比截圖舊：不用補截');
  write(p, 'work/versions/x02/v2/段落.json', '{}');
  assert.ok(S.sourceTime(P, SCENES[1], 'x02') > S.findShot(P, 'x02').t, '回饋輪存了新版本：要補截');
});

test('buildSite：沿用新的截圖、舊的與沒有的一次補截；每張 ≤ 120 KB、寬 720；整包一個 index.html、資料內嵌、佔位都換掉', { skip: !hasFfmpeg() && '沒有 ffmpeg' }, (t) => {
  const { P, p } = project(t);
  // s01：有分鏡截圖，比動畫檔新 → 沿用；x02：截圖比動畫檔舊 → 補截；m03、p04：沒有 → 補截（p04 補截失敗）
  const s01 = shotPng(path.join(p, 'work/storyboard-preview/s01.png'));
  const x02 = shotPng(path.join(p, 'work/storyboard-preview/x02.png'));
  age(path.join(p, 'work/hyperframes/compositions/concept-s01.html'), 600);
  age(x02, 600);
  const asked = [];
  const shoot = (P2, ids) => { asked.push(...ids); for (const id of ids.filter((x) => x !== 'p04')) shotPng(path.join(p, `work/storyboard-preview/${id}.png`)); return { ok: false, message: 'p04 截不到' }; };
  const logs = [];
  const r = S.buildSite(P, {}, { shoot, check: CHECK, names: NAMES, now: new Date('2026-11-19T10:30:00'), log: (l) => logs.push(l) });
  assert.deepEqual(asked, ['x02', 'm03', 'p04'], '只補截舊的和沒有的');
  assert.match(logs[0], /^補截 3 段的最後一格（x02、m03、p04）…$/);
  assert.equal(fs.statSync(s01).mtimeMs > 0, true);
  assert.equal(r.file, path.join(p, 'work/site/index.html'));
  assert.equal(r.rel, 'projects/ep/work/site/index.html');
  assert.deepEqual([r.segs, r.anim, r.made, r.missing], [4, 2, 3, ['p04']]);
  assert.ok(r.biggest <= 120 * 1024, `最大一張 ${r.biggest} bytes`);
  assert.ok(r.size < 15 * 1024 * 1024);
  assert.match(r.warnings.join('\n'), /補截沒有成功，p04 用舊圖或沒有圖：p04 截不到 → 先跑 node shared\/template\/tools\/build\.mjs --project projects\/ep，再跑一次；還是失敗就照樣發布/);
  const html = fs.readFileSync(r.file, 'utf8');
  assert.doesNotMatch(html, /__SITE_DATA__|__TITLE__|\/\*__BRAND__\*\/|\/\*__REQUESTS_MD__\*\//);
  assert.doesNotMatch(html, /^export /m, '共用模組去掉 export 內嵌');
  assert.match(html, /<title>ep 手機確認頁<\/title>/);
  assert.doesNotMatch(html, /src="(?!data:)[^"]+\.(png|jpe?g)"/, '圖片都內嵌，沒有外部檔');
  const data = JSON.parse(/<script type="application\/json" id="siteData">(.*?)<\/script>/s.exec(html)[1]);
  assert.equal(data.project, 'projects/ep');
  assert.equal(data.generated, '2026-11-19 10:30');
  const seg = (id) => data.segs.find((s) => s.id === id);
  assert.match(seg('s01').img, /^data:image\/jpeg;base64,/);
  assert.deepEqual([seg('s01').imgW, seg('s01').imgH], [720, 406]);
  assert.equal(seg('p04').img, null);
  assert.equal(seg('p04').imgNote, '這段沒有截圖（補截失敗）');
  // --round：沒有回饋輪就 ✖ 有 →
  assert.throws(() => S.buildSite(P, { round: true }, { shoot, check: CHECK, names: NAMES }), /還沒有回饋輪.*→ 拿掉 --round/);
});

test('修改單格式：手機確認頁和剪輯台同一支 rqMarkdown；只差第三行（多了「先存成檔」）和來源那一行', () => {
  const items = [
    { id: 's01', label: '為什麼要用手機拍', what: '資訊卡 concept（概念卡）', file: null, out: [1, 7.5], span: '#1 → #2', gap: false, kind: 'anim', tags: ['文字少一點'], note: '只留三個字\n再大一點', redo: false, subs: [{ n: 1, text: '第 1 句' }] },
    { id: 'x02', label: '影片繞了一圈', what: '模板動畫 x-route（路線圖）', file: 'projects/ep/work/hyperframes/compositions/x-route-x02.html', out: [8, 14.5], span: '#3 → #4', gap: false, kind: 'anim', tags: [], note: '', redo: true, subs: [] },
  ];
  const ed = RQ.rqMarkdown({ project: 'projects/ep', stamp: '2026-11-19 10:30', items }).split('\n');
  const ph = RQ.rqMarkdown({ project: 'projects/ep', stamp: '2026-11-19 10:30', items, source: '手機確認頁', pasted: true }).split('\n');
  assert.equal(ed[0], '# 剪輯台修改單');
  assert.equal(ph.length, ed.length);
  assert.deepEqual(ph.map((l, i) => (l === ed[i] ? null : i)).filter((i) => i != null), [2, 4]);
  assert.equal(ed[4], '（2026-11-19 10:30 從剪輯台複製）');
  assert.equal(ph[4], '（2026-11-19 10:30 從手機確認頁複製）');
  assert.match(ph[2], /^照剪輯台修改單改這 2 段（projects\/ep\/work\/feedback\/editor-requests\.md）：這份是從手機確認頁複製的整份修改單：先把整份原文存成 projects\/ep\/work\/feedback\/editor-requests\.md（覆寫），再照 auto-edit-review 流程 F 做/);
  assert.match(ph[2], /其中 1 段要重新設計（x02）.*存好之後第一步跑 node shared\/template\/tools\/versions\.mjs begin --project "projects\/ep" --requests$/);
  assert.equal(ed[2].replace('照 auto-edit-review', '').includes('先把整份原文存成'), false);
  assert.ok(ph.includes('- 描述：只留三個字／再大一點'));
});

// 手機上真的點一遍（390×844）：填兩段、按複製；複製的和 rqMarkdown 一字不差，存成修改單後 begin --requests 讀得到
const noUi = await missingTools('chrome', 'ffmpeg', 'puppeteer');
test('手機確認頁 UI：390 寬；點標籤、寫描述、勾重新設計會記下；沒填時複製鍵灰的並說原因；複製的修改單照流程 F 開得了回饋輪', { skip: noUi }, async (t) => {
  const { P, p } = project(t);
  for (const s of SCENES) shotPng(path.join(p, `work/storyboard-preview/${s.id}.png`));
  const r = S.buildSite(P, {}, { shoot: () => ({ ok: true }), check: CHECK, names: NAMES });
  const { findChrome } = await imp('lib/audit-browser.mjs');
  const puppeteer = (await import('puppeteer-core')).default;
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true });
  try {
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (x) => { window.__copied = x; } } }); });
    await page.goto(`file://${r.file}`);
    assert.equal(await page.$eval('#proj', (el) => el.textContent), 'ep');
    assert.match(await page.$eval('#meta', (el) => el.textContent), /4 段（字卡 1、動畫 1、錄影 1、圖片 1）/);
    assert.equal(await page.$eval('#copy', (el) => el.disabled), true);
    assert.match(await page.$eval('#barNote', (el) => el.textContent), /還沒有填任何一段/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390, '沒有橫向捲動');
    assert.equal(await page.$$eval('#seg-m03 [data-redo]', (x) => x.length), 0, '錄影段沒有「重新設計」');
    assert.deepEqual(await page.$$eval('#seg-m03 .chip', (x) => x.map((b) => b.dataset.tag)), RQ.RQ_TAGS.media);
    await page.click('#seg-s01 .chip[data-tag="文字少一點"]');
    await page.type('#seg-s01 textarea', '只留三個字');
    await page.click('#seg-x02 [data-redo]');
    assert.equal(await page.$eval('#copy', (el) => el.textContent), '複製提示詞（2 段）');
    await page.click('#seg-x02 .shot');
    assert.equal(await page.$eval('#zoom', (el) => el.open), true, '點截圖放大');
    await page.click('#zoomClose');
    await page.click('#copy');
    const copied = await page.waitForFunction(() => window.__copied).then((h) => h.jsonValue());
    const D = JSON.parse(/<script type="application\/json" id="siteData">(.*?)<\/script>/s.exec(fs.readFileSync(r.file, 'utf8'))[1]);
    const seg = (id) => D.segs.find((s) => s.id === id);
    const item = (s, x) => ({ id: s.id, label: s.title, what: s.what, file: s.file, out: s.out, span: s.span, gap: false, kind: s.kind, subs: s.subs, ...x });
    const stamp = /^（(.+) 從手機確認頁複製）$/m.exec(copied)[1];
    assert.equal(copied, RQ.rqMarkdown({ project: 'projects/ep', stamp, source: '手機確認頁', pasted: true, items: [
      item(seg('s01'), { tags: ['文字少一點'], note: '只留三個字', redo: false }), item(seg('x02'), { tags: [], note: '', redo: true }),
    ] }));
    // 重新整理還在（存在這支手機）
    await page.reload();
    assert.equal(await page.$eval('#seg-s01 textarea', (el) => el.value), '只留三個字');
    assert.equal(await page.$eval('#seg-x02 [data-redo]', (el) => el.checked), true);
    assert.deepEqual(errors, []);
    // 貼回給 AI：整份存成修改單 → begin --requests 開得了回饋輪，原話有修改單那兩段
    write(p, 'work/feedback/editor-requests.md', copied);
    assert.deepEqual(requestsInfo(p).ids, ['s01', 'x02']);
    const b = V.beginRound(P, { requests: true }, [], undefined, () => {});
    assert.equal(b.round, 'r1');
    const r1 = fs.readFileSync(path.join(p, 'work/feedback/r1.md'), 'utf8');
    assert.match(r1, /- 修改單 s01（要改：文字少一點）：「只留三個字」/);
    assert.match(r1, /\| 2 \| .* \| x02 \|/, '只勾重新設計的段也在這一輪');
  } finally { await browser.close(); }
});

test('versions.mjs site：--round 和 --only 不能一起用；沒有 plan.json 時 ✖ 有 →', (t) => {
  const { root, p } = project(t);
  const run = (...a) => spawnSync(process.execPath, [path.join(TOOLS, 'versions.mjs'), 'site', '--project', 'projects/ep', '--template', path.join(root, 'shared', 'template'), ...a], { encoding: 'utf8', cwd: root });
  const a = run('--round', '--only', 's01');
  assert.notEqual(a.status, 0);
  assert.match(a.stderr, /✖ .*--round.*--only.*→/);
  fs.renameSync(path.join(p, 'work/hyperframes/plan.json'), path.join(p, 'work/hyperframes/plan.json.moved'));
  const b = run();
  assert.notEqual(b.status, 0);
  assert.match(b.stderr, /✖ 讀不到 projects\/ep\/work\/hyperframes\/plan\.json → 先做到分鏡表確認/);
});
