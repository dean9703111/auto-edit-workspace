// 片尾模板（033）：setting.json 的 ending、片尾金句的來源、訂閱動畫找句、主合成接長、片尾配樂的工作區預設與最後 30 秒、qc 排除片尾卡、--set 的鍵
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { lib, imp, makeSrt, cueStart, tmpDir, needs } from './helpers.mjs';

const { resolvePlan, outroLine, OUTRO_AUTO } = await imp('lib/plan.mjs');
const { buildMain } = await imp('lib/main.mjs');
const { parseSrt } = await imp('lib/srt.mjs');
const { quoteLines, readEndingSetting, endingParts, endingLines, ENDING, SUBSCRIBE } = await imp('lib/ending.mjs');
const { setPlan } = await imp('lib/plan-set.mjs');
const Q = await imp('qc.mjs');
const L0 = await lib();
const VD = 44;
const cues = parseSrt(makeSrt({ n: 12 }));

// 工作區設定：shared/brand/ 有一張圖（不用真的是圖，readEndingSetting 只看副檔名與檔案在不在）
function shared(t, ending, files = { 'cover.jpg': 'x' }) {
  const dir = tmpDir(t, 'ending-shared-');
  fs.mkdirSync(path.join(dir, 'brand'));
  for (const [f, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, 'brand', f), body);
  if (ending !== undefined) fs.writeFileSync(path.join(dir, 'setting.json'), JSON.stringify({ ending }));
  return dir;
}
const project = (t, script) => { const d = tmpDir(t, 'ending-proj-'); if (script != null) fs.writeFileSync(path.join(d, '講稿.md'), script); return d; };
const run = ({ ending = null, plan = {}, projectDir = null, scenes = [], outroDefault = null, cuesIn = cues, canvas } = {}) =>
  resolvePlan({ plan: { version: 1, speakerBox: [700, 200, 1220, 1000], scenes, ...plan }, cues: cuesIn, videoDur: VD, lib: { ...L0, ending, outroDefault }, outDir: projectDir || tmpDir(null, 'ending-out-'), projectDir, ...(canvas ? { canvas } : {}) });

test('quoteLines：逗點、// 換成分段，拿掉句尾句號與 **', () => {
  assert.deepEqual(quoteLines('專案不是另一個對話視窗，而是一套可持續更新、重複使用的工作背景與規則。'), ['專案不是另一個對話視窗', '而是一套可持續更新、重複使用的工作背景與規則']);
  assert.deepEqual(quoteLines('把**經驗**//變成資產'), ['把經驗', '變成資產']);
  assert.deepEqual(quoteLines(''), []);
});

test('readEndingSetting：沒設定＝null；檔案、長度、副檔名不對列進 problems；預設 9.9 秒、要金句', (t) => {
  assert.equal(readEndingSetting(shared(t, undefined)), null);
  const ok = readEndingSetting(shared(t, { image: 'cover.jpg' }));
  assert.deepEqual([path.basename(ok.image), ok.seconds, ok.quote, ok.subscribe, ok.problems], ['cover.jpg', ENDING.seconds, true, null, []]);
  const bad = readEndingSetting(shared(t, { image: 'gone.jpg', seconds: 99, subscribe: 'a.txt', quote: false }));
  assert.equal(bad.image, null);
  assert.equal(bad.seconds, ENDING.seconds);
  assert.equal(bad.quote, false);
  assert.equal(bad.problems.length, 3, bad.problems.join('\n'));
  assert.ok(bad.problems.some((p) => p.includes('shared/brand/gone.jpg 不在')));
});

test('片尾金句：講稿最後的 > 引言優先，沒有就用最後一張金句字卡，plan.json 的 ending.quote 蓋過；null＝不放', (t) => {
  const conf = readEndingSetting(shared(t, { image: 'cover.jpg' }));
  const quoteScene = { id: 'q1', scene: 'quote', from: '#9', to: '#10e', slots: { text: '把經驗//變成資產' } };
  const fromScript = run({ ending: conf, projectDir: project(t, '# 標題\n\n> 中間的備註\n\n最後一句\n\n> 規格只能涵蓋你想到的，\n> 其他的要實戰\n'), scenes: [quoteScene] });
  assert.deepEqual(fromScript.errors, []);
  assert.deepEqual(fromScript.ending.card.quote, { lines: ['規格只能涵蓋你想到的', '其他的要實戰'], from: '講稿最後的 > 引言' });
  assert.equal(fromScript.ending.dur, ENDING.seconds);
  assert.equal(fromScript.finalDur, +(VD + ENDING.seconds).toFixed(3));
  const fromCard = run({ ending: conf, projectDir: project(t, '沒有引言\n'), scenes: [quoteScene] });
  assert.deepEqual(fromCard.ending.card.quote, { lines: ['把經驗', '變成資產'], from: '[q1] 金句字卡' });
  const fromPlan = run({ ending: conf, projectDir: project(t, '> 講稿的\n'), plan: { ending: { quote: '這一集，換一句' } } });
  assert.deepEqual(fromPlan.ending.card.quote, { lines: ['這一集', '換一句'], from: 'plan.json' });
  const none = run({ ending: conf, projectDir: project(t, '> 講稿的\n'), plan: { ending: { quote: null } } });
  assert.equal(none.ending.card.quote, null);
  const empty = run({ ending: conf, projectDir: project(t, '沒有\n') });
  assert.equal(empty.ending.card.quote, null);
  assert.ok(empty.ending.notes.some((n) => n.startsWith('片尾金句：講稿沒有 > 引言、也沒有金句字卡')));
  const long = run({ ending: conf, plan: { ending: { quote: '一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十一二三四五' } } });
  assert.ok(long.warnings.some((w) => w.startsWith('片尾金句「') && w.includes('太長')));
});

test('ending：plan.json 寫 false／直式＝不放（總長不變）；沒設定卻寫了 ending ⚠；寫錯 ✖', (t) => {
  const conf = readEndingSetting(shared(t, { image: 'cover.jpg' }));
  const off = run({ ending: conf, plan: { ending: false } });
  assert.deepEqual([off.ending.off, off.finalDur], ['plan.json 寫了 "ending": false', VD]);
  assert.deepEqual(endingLines(off.ending), ['片尾：plan.json 寫了 "ending": false']);
  const portrait = run({ ending: conf, plan: { format: 'portrait' } });
  assert.equal(portrait.ending.off, '直式不放片尾卡和訂閱動畫');
  assert.equal(portrait.finalDur, VD);
  const noConf = run({ plan: { ending: { quote: 'x' } } });
  assert.equal(noConf.ending, null);
  assert.ok(noConf.warnings.some((w) => w.startsWith('plan.json 寫了 ending，但工作區沒有設定片尾')));
  assert.ok(run({ ending: conf, plan: { ending: 'yes' } }).errors.some((e) => e.startsWith('ending 只能寫 false')));
  assert.ok(run({ ending: conf, plan: { ending: { color: 1 } } }).errors.includes('ending 不能有「color」→ 只能寫 quote（片尾金句）、subscribe（訂閱動畫跟哪一句）'));
});

test('訂閱動畫：最後四分之一第一句講到「訂閱」的晚 0.5 秒；找不到、太靠近片尾只留一行說明；plan.json 指定句號', async (t) => {
  if (!(await needs(t, 'ffmpeg'))) return;
  const dir = shared(t, undefined, { 'cover.jpg': 'x' });
  const gif = path.join(dir, 'brand', 'sub.gif');
  assert.equal(spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=64x36:d=2:r=10', gif]).status, 0);
  fs.writeFileSync(path.join(dir, 'setting.json'), JSON.stringify({ ending: { subscribe: 'sub.gif' } }));
  const conf = readEndingSetting(dir);
  const said = cues.map((c) => (c.n === 11 ? { ...c, text: '記得訂閱頻道' } : c.n === 2 ? { ...c, text: '訂閱太早不算' } : c));
  said.words = cues.words;
  const auto = run({ ending: conf, cuesIn: said });
  assert.deepEqual(auto.errors, []);
  assert.equal(auto.ending.card, null);
  assert.equal(auto.ending.dur, 0);
  assert.equal(auto.finalDur, VD);
  assert.deepEqual([auto.ending.subscribe.n, auto.ending.subscribe.at, auto.ending.subscribe.dur], [11, +(cueStart(11) + SUBSCRIBE.lead).toFixed(3), 2]);
  const miss = run({ ending: conf });
  assert.equal(miss.ending.subscribe, null);
  assert.ok(miss.ending.notes[0].startsWith('訂閱動畫：最後四分之一沒有講到「訂閱」的句子，沒放'));
  const pick = run({ ending: conf, plan: { ending: { subscribe: '#9' } } });
  assert.equal(pick.ending.subscribe.n, 9);
  assert.ok(run({ ending: conf, plan: { ending: { subscribe: '9' } } }).errors.some((e) => e.startsWith('ending.subscribe 要寫 "#N"')));
});

test('片尾配樂：沒寫 outro 用工作區預設、只播最後 30 秒（含片尾卡）、角標照常到片尾；from 照舊；null＝這集不配', (t) => {
  const conf = readEndingSetting(shared(t, { image: 'cover.jpg' }));
  const auto = run({ outroDefault: 'bgm-cylinder-five' });
  assert.deepEqual(auto.errors, []);
  assert.deepEqual([auto.outro.music, auto.outro.auto, auto.outro.source, auto.outro.start, auto.outro.end], ['bgm-cylinder-five', true, '工作區預設', VD - OUTRO_AUTO, VD]);
  const withCard = run({ outroDefault: 'bgm-cylinder-five', ending: conf });
  assert.deepEqual([withCard.outro.start, withCard.outro.end], [+(VD + ENDING.seconds - OUTRO_AUTO).toFixed(3), +(VD + ENDING.seconds).toFixed(3)]);
  assert.match(outroLine(auto.outro, { aligned: 'from', at: 14, dur: 30, fadeIn: 1, fadeOut: 2, len: 40 }), /^結尾配樂：bgm-cylinder-five（工作區預設）從 0:14\.00 起播 30\.0 秒（沒寫 outro\.from，只播片尾最後 30 秒/);
  const fromCue = run({ outroDefault: 'bgm-cylinder-five', plan: { outro: { from: '#11' } } });
  assert.deepEqual([fromCue.outro.music, fromCue.outro.auto, fromCue.outro.start], ['bgm-cylinder-five', false, cueStart(11)]);
  assert.equal(run({ outroDefault: 'bgm-cylinder-five', plan: { outro: { music: null } } }).outro.music, null);
  assert.ok(run({ outroDefault: 'nope' }).warnings.some((w) => w.startsWith('結尾配樂：工作區預設的「nope」不是曲庫裡的配樂')));
  // 角標：只播最後 30 秒的不算內容段落，章節角標照常到片尾；寫了 from 的照舊停在起播點
  const scenes = [{ id: 'c01', scene: 'chapter-tag', from: '#2', to: '#3e', slots: { num: '01', name: '開始' } }];
  assert.equal(run({ outroDefault: 'bgm-cylinder-five', scenes }).badges.at(-1).end, VD);
  assert.equal(run({ outroDefault: 'bgm-cylinder-five', scenes, plan: { outro: { from: '#11' } } }).badges.at(-1).end, cueStart(11));
});

test('主合成：片尾卡接在影片後面（root 長＝影片＋片尾卡，底片、字幕只到影片結束），剪映素材不放', (t) => {
  const conf = readEndingSetting(shared(t, { image: 'cover.jpg' }));
  const res = run({ ending: conf, plan: { ending: { quote: '第一段，第二段' } } });
  const ending = { ...res.ending, card: { ...res.ending.card, file: 'assets/brand/ending-x.jpg' } };
  const opts = { items: [], videoDur: VD, captions: { compId: 'captions', file: 'compositions/captions.html' }, pip: { crop: null, style: {} }, ending };
  const { html, duration } = buildMain(opts);
  assert.equal(duration, +(VD + ENDING.seconds).toFixed(3));
  assert.match(html, new RegExp(`data-composition-id="main" data-start="0" data-duration="${VD + ENDING.seconds}"`));
  assert.match(html, new RegExp(`<video id="rough" src="assets/rough.mp4" data-start="0" data-duration="${VD}"`));
  assert.match(html, new RegExp(`data-track-kind="captions" data-start="0" data-duration="${VD}"`));
  assert.match(html, new RegExp(`<div id="end-card" class="clip" data-start="${VD - ENDING.black}" data-duration="${+(ENDING.seconds + ENDING.black).toFixed(3)}"`));
  assert.equal((html.match(/class="ec"/g) || []).length, '第一段第二段'.length);
  assert.ok(html.includes('#end-quote .ec { opacity: 0; }'));
  assert.ok(html.includes(`tl.fromTo('#end-img', { opacity: 0 }, { opacity: 1, duration: 0.5, ease: 'none' }, ${+(VD + ENDING.image.at).toFixed(3)});`));
  const cut = buildMain({ ...opts, test: { t0: 0, len: VD }, cut: { kind: 'main' } });
  assert.equal(cut.duration, VD);
  assert.ok(!cut.html.includes('end-card'));
  // --test 的片段跨過片尾：時間平移、長度截在片尾
  const tc = buildMain({ ...opts, test: { t0: 40, len: 20 } });
  assert.equal(tc.duration, +(VD + ENDING.seconds - 40).toFixed(3));
  assert.match(tc.html, /<div id="end-card" class="clip" data-start="3.5"/);
  // 沒有片尾卡的片尾設定（只有訂閱動畫）：長度不變
  const parts = endingParts({ dur: 0, card: null, subscribe: { file: 'assets/brand/s.webm', at: 30, dur: 4.93 }, notes: [] }, { t0: 0, DUR: VD, videoDur: VD, W: 1920, H: 1080, nextTrack: () => 9 });
  assert.match(parts.html[0], /<video id="end-sub" src="assets\/brand\/s.webm" data-start="30" data-duration="4.93" data-track-index="9" muted playsinline style="position:absolute;left:0;top:194px;width:1920px;height:1080px;z-index:56">/);
  assert.deepEqual(parts.tl, [`tl.to('#end-sub', { opacity: 0, duration: 0.5, ease: 'none' }, 34.43);`]);
});

test('qc：片尾卡那段（含淡出到黑的 0.5 秒）不判凍結、黑畫面、無聲；之前的照判', () => {
  const base = { width: 1920, height: 1080, fps: 30, vfr: false, hasAudio: true, dur: 53.9, expected: 53.9, loud: { i: -14, tp: -2 }, items: [], cuts: [] };
  const tail = { at: 44, dur: 9.9 };
  const r = Q.judge({ ...base, tail, freezes: [[44.5, 53.9]], blacks: [[43.6, 44.4]], silences: [[45, 53.9]] });
  assert.equal(r.warnings, 0, JSON.stringify(r.checks.filter((c) => c.level !== 'ok')));
  const before = Q.judge({ ...base, tail, freezes: [[30, 34]], blacks: [[10, 11]], silences: [[20, 25]] });
  assert.equal(before.warnings, 3);
  assert.equal(Q.judge({ ...base, freezes: [[44.5, 53.9]] }).warnings, 1);
});

test('--set：ending=false、ending.quote、ending.subscribe（none＝null）；outro.music 不用再和 outro.from 一起寫', (t) => {
  const proj = tmpDir(t, 'ending-set-');
  fs.mkdirSync(path.join(proj, 'work', 'hyperframes'), { recursive: true });
  fs.writeFileSync(path.join(proj, 'work', 'hyperframes', 'plan.json'), '{\n  "version": 1\n}\n');
  setPlan(proj, { 'ending.quote': '一句話', 'ending.subscribe': '#12', 'outro.music': 'bgm-cylinder-five' });
  const read = () => JSON.parse(fs.readFileSync(path.join(proj, 'work', 'hyperframes', 'plan.json'), 'utf8'));
  assert.deepEqual([read().ending, read().outro], [{ quote: '一句話', subscribe: '#12' }, { music: 'bgm-cylinder-five' }]);
  setPlan(proj, { 'ending.subscribe': 'none' });
  assert.equal(read().ending.subscribe, null);
  setPlan(proj, { ending: 'false' });
  assert.equal(read().ending, false);
  setPlan(proj, { 'ending.quote': '再換' });
  assert.deepEqual(read().ending, { quote: '再換' });
  assert.throws(() => setPlan(proj, { 'ending.subscribe': '12' }), /ending\.subscribe/);
  assert.throws(() => setPlan(proj, { ending: 'true' }), /ending/);
});
