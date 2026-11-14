// 沒有講者的段用全螢幕：和縮到 87% 的錄影對齊、角標同一個位置、背景只留底色、內容用滿；分鏡素材和設計師都知道哪幾句沒有講者
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lib, imp, makeSrt, tmpDir } from './helpers.mjs';

const { resolvePlan } = await imp('lib/plan.mjs');
const { mediaGeometry, mediaCorner, VIEW } = await imp('lib/media.mjs');
const { bgCss } = await imp('lib/main.mjs');
const { parseSrt } = await imp('lib/srt.mjs');
const R = await imp('lib/audit-rules.mjs');
const K = await imp('lib/scaffold.mjs');
const { evenOutCrushed } = await imp('media.mjs');
const L = await lib();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cues = parseSrt(makeSrt({ n: 12 }));
const VD = 44;
const byId = (res, id) => res.items.find((x) => x.id === id);

const pdir = tmpDir(null, 'hf-full-');   // 整個檔跑完才清
fs.mkdirSync(path.join(pdir, 'assets', 'screen'), { recursive: true });
fs.writeFileSync(path.join(pdir, 'assets', 'screen', 'v.mp4'), '');
const go = (scenes, info = { width: 1920, height: 1080, duration: 60, hasAudio: false }, voiceOnly = [[10, 30]]) => resolvePlan({
  plan: { version: 1, speakerBox: [700, 200, 1220, 1000], scenes, sections: [{ at: '#2', name: '第一節' }] },
  cues, videoDur: VD, lib: L, outDir: os.tmpdir(), projectDir: pdir, probe: () => info, voiceOnly,
});
const tag = { id: 'c01', scene: 'chapter-tag', from: '#1', to: '#2e', slots: { num: '01', name: '測試' } };
const wide = (id, from, to) => ({ id, scene: 'fs-list', from, to, slots: { title: id, items: ['一', '二', '三'], visual: 'laptop' } });
const rec = (id, from, to) => ({ id, type: 'media', src: 'assets/screen/v.mp4', from, to });

test('87%：16:9 的錄影放進 1920×940 是 87%，左右和全寬的 x 120–1800 差不到 6 px；角標貼錄影右上角', () => {
  assert.deepEqual(VIEW.contain, [0, 0, 1920, 940]);
  const g = mediaGeometry({ width: 1920, height: 1080 }, 'contain');
  assert.equal(g.height, 940);
  assert.ok(Math.abs(g.width / 1920 - 0.87) < 0.002, String(g.width));
  assert.ok(Math.abs(g.left - 120) <= 6 && Math.abs(g.left + g.width - 1800) <= 6, JSON.stringify(g));
  assert.deepEqual(mediaCorner({ width: 1920, height: 1080 }, 'contain', { w: 400, h: 80, dflt: [1824, 56] }), { right: 1780, top: 16 });
});

test('角標：全寬段和錄影段同一個位置，接來接去不用滑；有講者小視窗的段留在畫布右上', () => {
  const res = go([tag, wide('a', 10, 16), rec('m', 16, 24), wide('b', 24, 30), wide('cam', 40, 44)]);
  assert.deepEqual(res.errors, []);
  assert.equal(byId(res, 'a').wide, true);
  assert.equal(byId(res, 'cam').wide, undefined, '有講者小視窗不是全寬');
  const [ax, ay, ar, ab] = byId(res, 'a').badgeBox;
  assert.deepEqual([ay, ar, ab], [16, 1780, 96]);
  assert.ok(ax < ar);
  assert.deepEqual(byId(res, 'cam').badgeBox.slice(1), [56, 1824, 136]);
  const b = res.badges.find((x) => x.spots);
  assert.equal(b.spots.length, 1, `全寬、錄影、全寬接成一個位置：${JSON.stringify(b.spots)}`);
  assert.deepEqual([b.spots[0].a, b.spots[0].z, b.spots[0].dx, b.spots[0].dy], [10, 30, -44, -40]);
});

test('角標：片中最長的橫向錄影決定全寬段的位置（不是 16:9 的錄影也對得上）', () => {
  const res = go([tag, wide('a', 10, 16), rec('m', 16, 30)], { width: 3452, height: 2016, duration: 60, hasAudio: false });
  assert.deepEqual(res.errors, []);
  const a = byId(res, 'a').badgeBox, m = byId(res, 'm').badgeBox;
  assert.deepEqual([a[1], a[2]], [m[1], m[2]]);
  assert.equal(a[2], 1749);
});

test('背景：全寬段只留底色，其他段照用背景圖', () => {
  const css = bgCss('assets/', { fs: 'bg-fs.jpg', side: null, ch: null });
  assert.match(css, /\.sc-surface-fs \{ background-image: url\("assets\/bg-fs\.jpg"\)/);
  assert.match(css, /\[data-wide\] \.sc-surface-fs \{ background-image: var\(--sc-fs-pattern\); \}/);
});

test('沒有講者卻排了疊加字卡：✖ 直接點名是哪一段', () => {
  const res = go([tag, { id: 'k', scene: 'key-point', from: 12, to: 18, slots: { text: '重點' } }, wide('a', 18, 40)]);
  const e = res.errors.find((x) => x.startsWith('只有聲音的區間'));
  assert.match(e, /k（.*）疊在講者上，這裡沒有講者，要換成全畫面的模板或內容設計動畫/);
});

// ---------- audit ----------
let n = 0;
const el = (o) => ({ i: n++, tag: 'div', desc: { id: '', cls: '', text: '', near: '' }, rect: o.rect, inner: o.rect, text: false, textRect: null, inkRect: null, fontSize: 52, scale: 1, whiteSpace: 'normal',
  painted: true, box: true, media: false, full: false, bg: false, shaped: false, clipX: false, clipY: false, sw: 0, cw: 0, sh: 0, ch: 0, constraint: -1, clips: [], parent: -1, moving: false, allowOverflow: false, allowCaption: false,
  pad: [0, 0, 0, 0], bw: [0, 0, 0, 0], anc: [], title: false, frame: false, own: [], chars: 0, ownFont: null, round: false, kit: false, centered: false, widthShared: false, alpha: 1, shapeRect: null, allowOverlap: false, allowSlack: false, allowTight: false });
const item = (o = {}) => ({ id: 'd1', type: 'custom', label: 'design', start: 10, end: 18, D: 8, opaque: true, pip: false, seg: { layout: 'fullscreen', design: true }, wide: true, ...o });
const sample = (els, ctx = {}) => R.judgeSample({ host: { start: 10 }, els }, { item: item(), t: 17, kind: 'done', layout: 'fullscreen', pipOn: false, speakerBox: null, sideShift: 0, ...ctx });
const layout = (els, it = {}) => R.judgeLayout({ host: { start: 10 }, els }, { item: item(it), t: 17, kind: 'done', layout: 'fullscreen', contentY: R.FULL.y });
const rulesOf = (list, rule) => list.filter((f) => f.rule === rule);

test('audit：壓到右上角標是 ✖，沒壓到不報', () => {
  const box = [1300, 16, 1780, 96];
  const hit = rulesOf(sample([el({ rect: [1500, 60, 1700, 200] })], { badgeBox: box }), 'badge');
  assert.equal(hit.length, 1);
  assert.equal(hit[0].level, 'error');
  assert.match(hit[0].fix, /y ≥ 112/);
  assert.equal(rulesOf(sample([el({ rect: [1500, 120, 1700, 300] })], { badgeBox: box }), 'badge').length, 0);
  assert.equal(rulesOf(sample([el({ rect: [1500, 60, 1700, 200] })], {}), 'badge').length, 0, '沒有角標就不量');
});

test('audit：全螢幕的內容設計動畫擠在左邊或太小 ⚠；撐開了不報；模板和有小視窗的段不量', () => {
  const left = layout([el({ rect: [120, 200, 1300, 800] })]);
  assert.equal(rulesOf(left, 'full-side').length, 1);
  assert.match(rulesOf(left, 'full-side')[0].msg, /內容偏左/);
  assert.equal(rulesOf(layout([el({ rect: [660, 200, 1260, 800] })]), 'full-small').length, 1);
  const good = layout([el({ rect: [120, 200, 1800, 812] })]);
  assert.deepEqual([rulesOf(good, 'full-side').length, rulesOf(good, 'full-small').length], [0, 0]);
  assert.equal(rulesOf(layout([el({ rect: [120, 200, 1300, 800] })], { seg: { layout: 'fullscreen' } }), 'full-side').length, 0, '模板不量');
  assert.equal(rulesOf(layout([el({ rect: [120, 40, 1800, 900] })]), 'vbalance').length, 0, '撐滿 y 40–900 不算不平衡');
  assert.equal(rulesOf(layout([el({ rect: [120, 112, 1800, 300] })]), 'vbalance').length, 1, '內容小又靠上才算');
  assert.equal(rulesOf(layout([el({ rect: [120, 200, 1300, 800] })], { wide: false }), 'full-side').length, 0, '有小視窗不量');
});

// ---------- 字幕時間 ----------
const cue = (n, start, end, text) => ({ n, start, end, text });

test('字幕：逐字稿聽錯、幾句擠在一起時照字數重分；正常的句子和跨停頓的不動', () => {
  const normal = (n, t) => cue(n, t, t + 2, '一二三四五六七八九十');   // 每秒 5 字
  const list = [normal(1, 0), normal(2, 2),
    cue(3, 4, 8, '一二三四五六七八九十'),                // 拉長：每秒 2.5 字
    cue(4, 8, 8.2, '一二三四五六七八九十'),              // 擠壓：每秒 50 字
    normal(5, 8.2), normal(6, 10.2)];
  const { cues: out, fixed } = evenOutCrushed(list);
  assert.deepEqual(fixed, [[3, 4]]);
  assert.deepEqual([out[2].start, out[2].end, out[3].start, out[3].end], [4, 6.1, 6.1, 8.2]);
  assert.deepEqual(out.slice(0, 2), list.slice(0, 2), '前面的不動');
  assert.deepEqual(out.slice(4), list.slice(4), '後面的不動');
  // 有聲音的停頓資料：交界貼到 0.5 秒內最近的真實停頓（這幾句的詞級時間不能信）
  const snapped = evenOutCrushed(list, { speech: [[0, 6.2], [6.5, 12.2]] }).cues;
  assert.deepEqual([snapped[2].end, snapped[3].start], [6.5, 6.5]);
  // 被長停頓隔開：不跨過去；旁邊也沒有拉長的句子可以分，就不動，留給 ⚠
  const paused = [normal(1, 0), cue(2, 2, 2.2, '一二三四五六七八九十'), normal(3, 6), normal(4, 8)];
  assert.deepEqual(evenOutCrushed(paused).fixed, []);
});

test('#N@詞：逐字稿把一整句擠在零點幾秒裡時不信那個時間，退回字數比例並標出來', async () => {
  const { cueSeconds, parseTime } = await imp('lib/time.mjs');
  const c = { n: 1, start: 10, end: 14, text: '就要整段重新生成時間' };
  const squeezed = [{ text: '就要整段重新生成時間', start: 13.8, end: 14 }];
  const good = [{ text: '就要整段', start: 10, end: 11.6 }, { text: '重新生成', start: 11.6, end: 13.2 }, { text: '時間', start: 13.2, end: 14 }];
  const at = (words) => { const cues = [c]; cues.words = words; cues.approx = new Set(); return { r: cueSeconds(parseTime('#1@重新生成'), cues), approx: [...cues.approx] }; };
  assert.equal(at(good).r.sec, 11.6);
  assert.deepEqual(at(good).approx, []);
  const bad = at(squeezed);
  assert.ok(Math.abs(bad.r.sec - 11.6) < 0.01, String(bad.r.sec));
  assert.deepEqual(bad.approx, ['#1@重新生成']);
});

// ---------- 分鏡素材與設計師文件 ----------
const many = parseSrt(makeSrt({ n: 12 }));
const part = (o) => ({ a: 0, z: many.length - 1, seconds: 60, key: 'ch01', code: '01', title: 'x', firstN: 1, lastN: 12, start: 0, end: 60, target: 0, ...o });

test('分鏡素材：chNN 開頭列出這一份裡沒有講者的句子；共用.md 有替換表；沒有只有聲音的區間就不寫', () => {
  const inside = many.filter((c) => c.end > 10 && c.start < 20);
  const md = K.renderPart(part(), { cues: many, videoDur: VD, voiceOnly: [[10, 20]] });
  assert.match(md, new RegExp(`沒有講者的句子：#${inside[0].n}–#${inside[inside.length - 1].n}`));
  assert.match(md, /字卡 06–15 和疊加的模板不能用/);
  // 旁白橫跨好幾章：只列這一份裡的句子
  const clipped = K.renderPart(part({ a: 0, z: 3, end: many[3].end, lastN: 4 }), { cues: many, videoDur: VD, voiceOnly: [[0, 40]] });
  assert.match(clipped, /沒有講者的句子：#1–#4\*\*/);
  assert.doesNotMatch(K.renderPart(part(), { cues: many, videoDur: VD }), /沒有講者的句子/);
  const common = (voiceOnly) => K.renderCommon({ project: 'p', format: { label: '橫式' }, videoDur: VD, cues: many, assets: { screen: 0, images: 0 }, notes: [], parts: [part()], voiceOnly, hasCamera: true });
  assert.match(common([[10, 20]]), /\| 07 重點字卡 \| `x-point`；字卡動態加 `"bg": "light"`/);
  // 034：15、09、06、11 有全幕版，照樣寫（不在替換表裡換掉）
  assert.match(common([[10, 20]]), /15 金句、09 QA、06 一般字卡、11 總結例外：照樣寫，build 自動換成整張畫面的全幕版/);
  assert.doesNotMatch(common([[10, 20]]), /\| 09 QA/);
  assert.doesNotMatch(common([]), /原本想用/);
});

test('設計師文件：全螢幕的範圍、87%、右上角標都寫得清楚；style.md 同一組數字', () => {
  const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  // 026：畫布的範圍只寫在 brief（工具照這一段算的），設計師文件指過去，不再放一張三種畫布的表
  assert.match(read('.agents/skills/auto-edit-motion/references/design.md'), /brief「畫布」寫的範圍/);
  assert.match(read('shared/template/tools/lib/flow.mjs'), /內容用滿 x 120–1800、y 40–900，左右和縮到 87% 的螢幕錄影對齊/);
  const style = read('shared/style.md');
  assert.match(style, /縮到 87% 的螢幕錄影/);
  assert.match(style, /右緣 1780、y 16–96/);
  assert.deepEqual(R.FULL.x, [120, 1800]);
});
