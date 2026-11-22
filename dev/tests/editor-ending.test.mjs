// 076 剪輯台看得到片尾：片尾卡接在影片後面（rough.mp4 沒有那幾秒），時間軸多畫一段；片尾配樂畫在「背景音樂」軌
//   這兩樣畫什麼（editor/model.mjs endingLane、outroLane）：照檢查報告（build --check --json 的 ending、outro），報告還沒好先看上一次 build 做進預覽的（/api/state 的 end）
//   build --check --json 的 outro 多給 outStart／outEnd／fadeIn／fadeOut／relDb／auto（lib/plan.mjs jsonTop）
//   build 記下做進 index.html 的片尾配樂與片尾卡（lib/music.mjs writeEndInfo → work/hyperframes/.cache/ending.json），快速試聽照它播
//   時間軸、播放頭、快速試聽的片尾卡示意在 editor-ending-ui.test.mjs（要瀏覽器）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { imp, tmpDir } from './helpers.mjs';

const { endingLane, outroLane, bedNoneText, bedLane, bedFadeAt, roughOf, outOf } = await imp('editor/model.mjs');
const { jsonTop } = await imp('lib/plan.mjs');
const { writeEndInfo, readEndInfo } = await imp('lib/music.mjs');
const { sanitizeEnding, applySave, LIMITS } = await imp('editor/server/write.mjs');

const REPORT = {
  ending: { at: 37, dur: 9.9, quote: '好內容，才是一切的根源', quoteFrom: 'plan.json', subscribe: 8, notes: [] },
  outro: { music: 'outro-a', start: 29, dur: 17.9, aligned: 'from', outStart: 29, outEnd: 46.9, fadeIn: 3, fadeOut: 2, relDb: -11, auto: false },
};
const BUILT = { layout: {}, outro: { music: 'outro-a', at: 29, dur: 17.9, fadeIn: 3, fadeOut: 2, url: '/composition/assets/outro-a-0123.wav?v=1' }, ending: { dur: 9.9, quote: ['好內容', '才是一切的根源'], image: '/composition/assets/brand/ending-0123.jpg?v=1' } };

test('片尾卡：照檢查報告的秒數與金句；示意圖、分行照上一次 build；報告還沒好先用上一次 build 的；沒有片尾卡＝null', () => {
  const e = endingLane(REPORT, BUILT);
  assert.deepEqual([e.dur, e.quote, e.image, e.lines], [9.9, '好內容，才是一切的根源', BUILT.ending.image, ['好內容', '才是一切的根源']]);
  // 還沒 build 過（沒有圖）：金句照報告的字切行，圖是 null
  assert.deepEqual(endingLane(REPORT, null), { dur: 9.9, quote: '好內容，才是一切的根源', image: null, lines: ['好內容', '才是一切的根源'], manual: false });
  // 082 作者分的行（行裡有逗號）：照報告的 quoteLines，不再用逗號切
  assert.deepEqual(endingLane({ ending: { at: 37, dur: 5, quote: 'AI 剪片／但好內容，才是基礎', quoteLines: ['AI 剪片', '但好內容，才是基礎'], quoteManual: true } }, null).lines, ['AI 剪片', '但好內容，才是基礎']);
  assert.equal(endingLane({ ending: { at: 37, dur: 5, quote: 'a', quoteLines: ['a'], quoteManual: true } }, null).manual, true);
  // 報告還沒好（undefined）：上一次 build 的
  assert.deepEqual([endingLane(undefined, BUILT).dur, endingLane(undefined, BUILT).quote], [9.9, '好內容，才是一切的根源']);
  assert.equal(endingLane(undefined, null), null);
  // 報告好了、這一集沒有片尾卡（ending: null）：就算上一次 build 有也不畫（等更新預覽）
  assert.equal(endingLane({ ending: null }, BUILT), null);
  assert.equal(endingLane({ ending: { at: 37, dur: 0 } }, BUILT), null);
  // 不放金句
  assert.deepEqual([endingLane({ ending: { at: 37, dur: 5, quote: null } }, null).quote, endingLane({ ending: { at: 37, dur: 5, quote: null } }, null).lines], ['', []]);
});

test('片尾配樂：範圍用完成影片秒數（含片尾卡那幾秒）、淡入淡出照 build；舊的報告沒有範圍、這一集不配＝不畫', () => {
  const o = outroLane(REPORT, BUILT);
  assert.deepEqual(o, { music: 'outro-a', outStart: 29, outEnd: 46.9, fadeIn: 3, fadeOut: 2, relDb: -11, auto: false });
  assert.equal(outroLane({ outro: null }, BUILT), null, '這一集不配');
  assert.equal(outroLane({ outro: { music: 'outro-a', start: 29, dur: 17.9, aligned: 'from' } }, BUILT), null, '舊的報告沒有 outStart／outEnd');
  assert.deepEqual(outroLane(undefined, BUILT), { music: 'outro-a', outStart: 29, outEnd: 46.9, fadeIn: 3, fadeOut: 2, relDb: null, auto: false }, '報告還沒好：上一次 build 的');
  assert.equal(outroLane(undefined, { outro: null }), null);
  // 畫在時間軸上：完成影片秒數換回 rough.mp4 的秒數，片尾卡那幾秒接在影片（37 秒）後面；有剪掉的範圍一樣對得上
  assert.deepEqual([roughOf(o.outStart, []), roughOf(o.outEnd, [])], [29, 46.9]);
  const cuts = [[10, 12]], shifted = { ...o, outStart: 27, outEnd: 44.9 };   // 剪掉 2 秒：完成影片 35 秒＋片尾卡 9.9
  assert.deepEqual([roughOf(shifted.outStart, cuts), Math.round(roughOf(shifted.outEnd, cuts) * 10) / 10], [29, 46.9]);
  assert.equal(Math.round(outOf(46.9, cuts) * 10) / 10, 44.9, '播放頭走到片尾卡結尾＝完成影片的結尾');
  // 音量線：淡入、淡出照秒數（和背景音樂同一個算法）
  assert.deepEqual([bedFadeAt(28.9, o), bedFadeAt(30.5, o), bedFadeAt(40, o), bedFadeAt(45.9, o), bedFadeAt(47, o)], [0, 0.5, 1, 0.5, 0]);
});

test('背景音樂軌沒有底樂時的那一行：有片尾配樂就說它在最後；沒有才寫「沒有背景音樂」；這一集不配、有底樂照舊', () => {
  const none = bedLane(null, { music: null }), off = bedLane({ music: null }, { music: null, off: true });
  assert.equal(bedNoneText(none, null), '沒有背景音樂');
  assert.equal(bedNoneText(none, outroLane(REPORT, BUILT)), '整支沒有鋪背景音樂，只有片尾配樂（在最後）');
  assert.equal(bedNoneText(off, outroLane(REPORT, BUILT)), '這一集不配');
  assert.equal(bedNoneText(null, null), '');
});

test('build --check --json 的 outro：多給完成影片的範圍、淡入淡出、和人聲的差、有沒有指定起播句；沒量到長度＝null', () => {
  const res = { outro: { music: 'outro-a', relDb: -11, auto: true } };
  const clip = { at: 29, dur: 17.9, aligned: 'from', fadeIn: 3, fadeOut: 2 };
  assert.deepEqual(jsonTop(res, { clip }).outro, { music: 'outro-a', start: 29, dur: 17.9, aligned: 'from', outStart: 29, outEnd: 46.9, fadeIn: 3, fadeOut: 2, relDb: -11, auto: true });
  assert.equal(jsonTop(res, {}).outro, null);
  assert.equal(jsonTop({ outro: { music: null } }, { clip }).outro, null);
});

test('build 記下做進預覽的片尾（.cache/ending.json）：片尾配樂、片尾卡各自可有可無；兩樣都沒有就刪掉', (t) => {
  const out = tmpDir(t, 'end-info-');
  const outro = { file: 'assets/outro-a-0123.wav', music: 'outro-a', at: 29, dur: 17.9, fadeIn: 3, fadeOut: 2 };
  const ending = { at: 37, dur: 9.9, image: 'assets/brand/ending-0123.jpg', quote: ['好內容', '才是一切的根源'] };
  assert.equal(readEndInfo(out), null);
  writeEndInfo(out, { outro, ending });
  assert.deepEqual(readEndInfo(out), { v: 1, outro, ending });
  writeEndInfo(out, { outro, ending: null });
  assert.deepEqual(readEndInfo(out), { v: 1, outro, ending: null });
  writeEndInfo(out, { outro: null, ending: null });
  assert.equal(fs.existsSync(path.join(out, '.cache', 'ending.json')), false);
  assert.equal(readEndInfo(out), null);
  fs.mkdirSync(path.join(out, '.cache'), { recursive: true });
  fs.writeFileSync(path.join(out, '.cache', 'ending.json'), '{"v":0}');
  assert.equal(readEndInfo(out), null, '版本不對的不算');
});

// ---------- 077 片尾金句的文字動畫（剪輯台點片尾卡 →「文字動畫」下拉選單，存 plan.json 的 ending.motion）----------
test('存片尾金句的文字動畫：原本的 quote、subscribe 照留；和工作區預設一樣的不寫，空了整個拿掉；這一集關掉片尾不能改；不能改圖', () => {
  assert.ok(LIMITS.bodyKeys.includes('ending'));
  assert.deepEqual(sanitizeEnding({ motion: 'fade' }, { ending: { quote: '一句' } }), { ending: { quote: '一句', motion: 'fade' }, errors: [] });
  assert.deepEqual(sanitizeEnding({ motion: 'rise' }, {}), { ending: { motion: 'rise' }, errors: [] });
  // 選回預設（打字機）：拿掉 motion；只剩它就整個 ending 拿掉
  assert.deepEqual(sanitizeEnding({ motion: 'type' }, { ending: { quote: '一句', motion: 'fade' } }), { ending: { quote: '一句' }, errors: [] });
  assert.deepEqual(sanitizeEnding({ motion: 'type' }, { ending: { motion: 'fade' } }), { ending: null, errors: [] });
  // 工作區預設是淡入：選淡入不寫、選打字機要寫
  assert.deepEqual(sanitizeEnding({ motion: 'fade' }, { ending: { motion: 'wipe' } }, { motionDefault: 'fade' }).ending, null);
  assert.deepEqual(sanitizeEnding({ motion: 'type' }, {}, { motionDefault: 'fade' }).ending, { motion: 'type' });
  assert.match(sanitizeEnding({ motion: 'spin' }, {}).errors[0], /^ending\.motion 要是 type（打字機）、fade（淡入）、rise（逐行浮出）、wipe（由左擦開）、none（直接出現） 其中一個，現在是 "spin"/);
  assert.match(sanitizeEnding({ motion: 'fade', image: '偷改' }, {}).errors[0], /^ending 在剪輯台只能改片尾金句的 motion（文字動畫）、quote（字）、x／y／size／w（位置、字級、框寬）、lineSpacing（行間距）、gap（段落間距），不能寫「image」/);
  assert.match(sanitizeEnding({ motion: 'fade' }, { ending: false }).errors[0], /這一集關掉了片尾/);
  assert.match(sanitizeEnding('fade', {}).errors[0], /ending 要寫成 \{ "motion"/);
});

// 082 剪輯台改片尾金句的字、拖位置、拉大小
test('存片尾金句的字、位置、字級：空白＝這一集不放；null＝回到預設；取整數、字級夾在範圍裡；型別錯擋下', () => {
  assert.deepEqual(sanitizeEnding({ quote: '  新的一句，第二段  ' }, { ending: { motion: 'fade' } }), { ending: { motion: 'fade', quote: '新的一句，第二段' }, errors: [] });
  assert.deepEqual(sanitizeEnding({ quote: '   ' }, {}), { ending: { quote: null }, errors: [] });
  assert.deepEqual(sanitizeEnding({ x: 900.6, y: 300.2, size: 64.4 }, { ending: { quote: '一句' } }), { ending: { quote: '一句', x: 901, y: 300, size: 64 }, errors: [] });
  assert.deepEqual(sanitizeEnding({ size: 500 }, {}).ending, { size: 120 });
  assert.deepEqual(sanitizeEnding({ size: 3 }, {}).ending, { size: 24 });
  assert.deepEqual(sanitizeEnding({ x: null, y: null, size: null }, { ending: { x: 1, y: 2, size: 50 } }), { ending: null, errors: [] });
  assert.match(sanitizeEnding({ x: '10' }, {}).errors[0], /^ending\.x 要是數字/);
  assert.match(sanitizeEnding({ quote: 3 }, {}).errors[0], /^ending\.quote 要是一句話/);
  assert.match(sanitizeEnding({ x: 10 }, { ending: false }).errors[0], /這一集關掉了片尾/);
  // 段落間距：0–2 行、取到 0.05（不取整數）、預設一行不寫；框寬取整數、null 拿掉
  assert.deepEqual(sanitizeEnding({ gap: 0.33 }, { ending: { quote: '一句' } }).ending, { quote: '一句', gap: 0.35 });
  assert.deepEqual(sanitizeEnding({ gap: 5 }, {}).ending, { gap: 2 });
  assert.deepEqual(sanitizeEnding({ gap: 1 }, { ending: { quote: '一句', gap: 0 } }).ending, { quote: '一句' });
  assert.deepEqual(sanitizeEnding({ w: 663.6 }, { ending: { quote: '一句' } }).ending, { quote: '一句', w: 664 });
  assert.deepEqual(sanitizeEnding({ w: null }, { ending: { quote: '一句', w: 700 } }).ending, { quote: '一句' });
  assert.match(sanitizeEnding({ gap: 'x' }, {}).errors[0], /^ending\.gap 要是數字（段與段之間空幾行）/);
  // 行間距：0–1、取到 0.01；和剪映的設定（0.07）一樣不寫
  assert.deepEqual(sanitizeEnding({ lineSpacing: 0.234 }, {}).ending, { lineSpacing: 0.23 });
  assert.deepEqual(sanitizeEnding({ lineSpacing: 0.07 }, { ending: { quote: '一句', lineSpacing: 0.3 } }).ending, { quote: '一句' });
});

test('存檔：只動 plan.json 的 ending 那一個鍵，其他字原樣（縮排、順序、沒動的鍵）；沒變不寫', () => {
  const text = '{\n  "version": 1,\n  "ending": {\n    "quote": "好內容，才是一切的根源。"\n  },\n  "scenes": []\n}\n';
  const ctx = { videoDur: 37, srtText: '' };
  const r = applySave(text, { base: {}, ending: { motion: 'fade' } }, ctx);
  assert.deepEqual(r.errors ?? [], []);
  assert.deepEqual(JSON.parse(r.text).ending, { quote: '好內容，才是一切的根源。', motion: 'fade' });
  assert.ok(r.text.startsWith('{\n  "version": 1,\n  "ending": ') && r.text.endsWith(',\n  "scenes": []\n}\n'), r.text);
  // 沒有 ending 的 plan：插在 scenes 前面；選回預設再拿掉
  const bare = '{\n  "version": 1,\n  "scenes": []\n}\n';
  const add = applySave(bare, { base: {}, ending: { motion: 'wipe' } }, ctx);
  assert.ok(add.text.startsWith('{\n  "version": 1,\n  "ending": ') && add.text.endsWith(',\n  "scenes": []\n}\n'), add.text);
  assert.deepEqual(JSON.parse(add.text), { version: 1, ending: { motion: 'wipe' }, scenes: [] });
  const back = applySave(add.text, { base: {}, ending: { motion: 'type' } }, ctx);
  assert.deepEqual(JSON.parse(back.text), { version: 1, scenes: [] });
  // 和現在一樣：不寫
  assert.equal(applySave(add.text, { base: {}, ending: { motion: 'wipe' } }, ctx).text, null);
  assert.ok(applySave(bare, { base: {}, ending: { motion: 'spin' } }, ctx).errors.length);
});
