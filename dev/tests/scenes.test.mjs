// 情境模板：18 個 sample 都能組成子合成、id 前綴與自檢、字數上限、時間換算
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lib, imp, makeSrt, cueStart, cueEnd } from './helpers.mjs';

const { resolveScene, sampleSeg, visibleLen } = await imp('lib/scenes.mjs');
const { assembleScene, sceneParts, prefixIds, scopeCss, verifyHash } = await imp('lib/assemble.mjs');
const { parseSrt } = await imp('lib/srt.mjs');
const { parseTime } = await imp('lib/time.mjs');
const L = await lib();
const scene = (k) => L.scenes.find((s) => s.key === k);

test('素材包有 18 個情境', () => {
  assert.equal(L.scenes.length, 18);
});

for (const sc of L.scenes) {
  test(`sample 組成子合成：${sc.num}-${sc.key}`, () => {
    const seg = { ...sampleSeg(sc), id: 's09' };
    const r = resolveScene({ scene: sc, seg, cues: [], icons: L.icons, consts: L.consts, t0: 0, D: seg.duration });
    assert.deepEqual(r.errors, [], r.errors.join('\n'));
    const a = assembleScene({ scene: sc, ctx: r.ctx, beats: r.beats, id: 's09', D: seg.duration, tone: r.tone });
    const compId = `s09-${sc.key}`;
    assert.equal(a.compId, compId);
    assert.equal(a.file, `compositions/${compId}.html`);
    // 外殼：<template> 包 style／root／script，root id＝composition id＝timeline key
    assert.match(a.html, /^<!doctype html>\n<!-- auto-edit: id=s09 scene=/);
    assert.ok(verifyHash(a.html).ok, '雜湊註解要能驗證');
    const tpl = a.html.match(/<template[^>]*>([\s\S]*)<\/template>/)[1];
    assert.match(tpl, /<style>[\s\S]*<\/style>/);
    assert.ok(tpl.includes(`<div id="${compId}" data-composition-id="${compId}"`));
    assert.ok(tpl.includes(`window.__timelines['${compId}'] = tl;`));
    assert.ok(tpl.includes('P.end(D);'));
    // 時間都已寫成數字（沒有 Mustache 殘留、沒有 T.at／HFSRT）
    assert.doesNotMatch(tpl, /\{\{|\}\}|HFSRT|T\.at\(|srt-cues/);
    // body 的 id 全部帶前綴
    for (const m of tpl.matchAll(/(?<![\w-])id="([^"]+)"/g)) assert.ok(m[1] === compId || m[1].startsWith('s09-'), `id 沒加前綴：${m[1]}`);
    // style 的每個規則都在 #compId 範圍內
    const css = tpl.match(/<style>([\s\S]*?)<\/style>/)[1];
    for (const rule of css.replace(/\/\*[\s\S]*?\*\//g, '').split('}').map((x) => x.split('{')[0].trim()).filter(Boolean)) {
      for (const sel of rule.split(/,(?![^(]*\))/)) assert.ok(sel.trim().startsWith(`#${compId}`), `選擇器沒加範圍：${sel}`);
    }
    // 不透明幕的底層是子層，不掛在 root 上
    if (sc.surface && sc.surface !== 'side') assert.ok(tpl.includes(`<div class="sc-surface-${sc.surface} fill"></div>`));
    assert.doesNotMatch(tpl, new RegExp(`id="${compId}"[^>]*class=`));
  });
}

test('id 前綴：字串串接的選擇器也換（steps 的 \'#s\' + i）', () => {
  const sc = scene('steps');
  const seg = { ...sampleSeg(sc), id: 's05' };
  const r = resolveScene({ scene: sc, seg, cues: [], icons: L.icons, consts: L.consts, t0: 0, D: 8 });
  const p = sceneParts({ scene: sc, ctx: r.ctx, beats: r.beats, id: 's05', D: 8 });
  assert.ok(p.timeline.includes("'#s05-s' + i"), p.timeline);
  assert.ok(p.timeline.includes("'#s05-n' + (i + 1)") || p.timeline.includes("'#s05-n' + i"));
  assert.ok(p.body.includes('id="s05-s1"'));
});

test('id 前綴：plan.json css 寫錯 id 會中止，並列出可用的 id', () => {
  const sc = scene('key-point');
  const seg = { ...sampleSeg(sc), id: 's03' };
  const r = resolveScene({ scene: sc, seg, cues: [], icons: L.icons, consts: L.consts, t0: 0, D: 5 });
  assert.throws(() => sceneParts({ scene: sc, ctx: r.ctx, beats: r.beats, id: 's03', D: 5, css: '#gcard { left: 96px; }' }), /#gcard[\s\S]*#gCard/);
  const ok = sceneParts({ scene: sc, ctx: r.ctx, beats: r.beats, id: 's03', D: 5, css: '#gCard { left: 96px; }' });
  assert.ok(ok.style.includes('#s03-key-point #s03-gCard { left: 96px; }'));
});

test('id 前綴：:has() 條件裡的 id 在 3 條時也換（側邊欄 #sItem4）', () => {
  const out = prefixIds({ style: '.sc-side:has(#sItem4) #sTitle { top: 1px; }', body: '<div id="sTitle"></div>', timeline: '' }, 's07-');
  assert.equal(out.style, '.sc-side:has(#s07-sItem4) #s07-sTitle { top: 1px; }');
});

test('CSS 範圍：每個選擇器加前綴，:has(a, b) 內的逗號不切，@ 規則中止', () => {
  assert.equal(scopeCss('.a, .b:has(.x, .y) { color: red; }', '#c').trim(), '#c .a, #c .b:has(.x, .y) { color: red; }');
  assert.throws(() => scopeCss('@media (max-width: 1px) { .a { color: red; } }', '#c'), /@ 規則/);
});

test('字數超過上限出錯（不縮字），訊息寫明欄位與上限', () => {
  const sc = scene('concept');
  const text = '這是一段超過二十四個字的字卡正文用來測試字數上限有沒有被擋下來';
  assert.ok(visibleLen(text) > 24);
  const r = resolveScene({ scene: sc, seg: { id: 's01', slots: { text } }, cues: [], icons: L.icons, consts: L.consts, t0: 0, D: 6 });
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /\[s01 concept\] slots\.text（正文）.*上限 24/);
  // 半形 0.5：40 個英文字母＝20 字，不出錯
  const r2 = resolveScene({ scene: sc, seg: { id: 's01', slots: { text: 'a'.repeat(40) } }, cues: [], icons: L.icons, consts: L.consts, t0: 0, D: 6 });
  assert.deepEqual(r2.errors, []);
});

test('清單項數、必填、圖示不存在都出錯', () => {
  const r = resolveScene({ scene: scene('fs-flow'), seg: { id: 's02', slots: { title: '流程', nodes: ['甲 ｜icon=no-such-icon', '乙 ｜icon=folder'] } }, cues: [], icons: L.icons, consts: L.consts, t0: 0, D: 6 });
  const all = r.errors.join('\n');
  assert.match(all, /至少 3 項，現在 2 項/);
  assert.match(all, /找不到圖示「no-such-icon」/);
  const r2 = resolveScene({ scene: scene('key-point'), seg: { id: 's02', slots: {} }, cues: [], icons: L.icons, consts: L.consts, t0: 0, D: 5 });
  assert.match(r2.errors.join('\n'), /slots\.key（重點）：必填/);
});

test('時間語法：#N、#Ne、#N+0.3、+x、秒數', () => {
  assert.deepEqual(parseTime('#5'), { kind: 'cue', n: 5, end: false, off: 0, raw: '#5' });
  assert.deepEqual(parseTime('#5e'), { kind: 'cue', n: 5, end: true, off: 0, raw: '#5e' });
  assert.equal(parseTime('#5e-0.2').off, -0.2);
  assert.equal(parseTime('#5+0.3').off, 0.3);
  assert.deepEqual(parseTime('+1.2'), { kind: 'rel', off: 1.2, raw: '+1.2' });
  assert.equal(parseTime(12.5).sec, 12.5);
  assert.match(parseTime('第五句').error, /看不懂的時間/);
});

test('beats／清單 at：#Ne 與 +x 換成相對本段起點的秒數', () => {
  const cues = parseSrt(makeSrt());
  const t0 = cueStart(3);
  const r = resolveScene({
    scene: scene('steps'), cues, icons: L.icons, consts: L.consts, t0, D: cueEnd(6) - t0,
    seg: { id: 's04', slots: { steps: ['第一步', { text: '第二步', at: '#4e' }, { text: '第三步', at: '+6.5' }] } },
  });
  assert.deepEqual(r.errors, []);
  assert.equal(r.listTimes.steps[1], +(cueEnd(4) - t0).toFixed(3));
  assert.equal(r.listTimes.steps[2], 6.5);
  // qa 的答案時間點可以寫在 slot 物件的 at
  const q = resolveScene({ scene: scene('qa'), cues, icons: L.icons, consts: L.consts, t0, D: 8, seg: { id: 's05', slots: { q: '要先剪嗎？', a: { text: '要', at: '#4' } } } });
  assert.deepEqual(q.errors, []);
  assert.equal(q.beats.aAt, +(cueStart(4) - t0).toFixed(3));
  // 絕對秒數不能用在 at
  const bad = resolveScene({ scene: scene('steps'), cues, icons: L.icons, consts: L.consts, t0, D: 10, seg: { id: 's04', slots: { steps: ['一', { text: '二', at: 12 }] } } });
  assert.match(bad.errors.join('\n'), /不能寫絕對秒數/);
});

test('時間點太晚（完成態停不到 0.6 秒）出錯並給出 to 要延到哪裡', () => {
  const cues = parseSrt(makeSrt());
  const r = resolveScene({ scene: scene('steps'), cues, icons: L.icons, consts: L.consts, t0: cueStart(1), D: 5.5, seg: { id: 's01', slots: { steps: ['一', { text: '二', at: '#2+1.5' }] } } });
  assert.match(r.errors.join('\n'), /晚於 D−0\.3−0\.6 = .*把 to 往後延到至少第/, 'D−P.OUT−0.6：P.OUT 讀 kit 的常數（v2 是 0.3）');
});

test('直式（009 FR-050／051）：18 個 scene.json 都有 portrait（move／stage／none）；@style-portrait 只在直式接上；12 直式改 free 橫排；橫式輸出不含直式的東西；--list 有直式欄', async () => {
  const want = { chapter: 'stage', 'chapter-tag': 'move', 'side-panel': 'none', 'fs-list': 'stage', 'fs-compare': 'stage', 'fs-flow': 'stage', 'fs-table': 'stage', 'two-sides': 'none',
    concept: 'move', 'key-point': 'move', steps: 'move', qa: 'move', tips: 'move', summary: 'move', keywords: 'move', 'title-list': 'move', speaker: 'move', quote: 'move' };
  assert.deepEqual(Object.fromEntries(L.scenes.map((s) => [s.key, s.portrait])), want);
  // move 的疊加情境都有 @style-portrait（卡片換到 x 60、bottom 680；角標左上；12 改橫排）
  for (const s of L.scenes.filter((x) => x.portrait === 'move')) assert.ok(s.template.stylePortrait.trim(), `${s.key} 少了 @style-portrait`);
  for (const s of L.scenes.filter((x) => x.portrait !== 'move')) assert.equal(s.template.stylePortrait, '', `${s.key} 不需要 @style-portrait`);
  for (const s of L.scenes) assert.ok(!s.template.style.includes('@style-portrait') && !/left: 60px; bottom: 680px/.test(s.template.style), `${s.key} 的 @style 混進直式規則`);
  const kw = scene('keywords');
  const seg = { ...sampleSeg(kw), id: 's09' };
  const r = resolveScene({ scene: kw, seg, cues: [], icons: L.icons, consts: L.consts, t0: 0, D: seg.duration });
  const opts = { scene: kw, ctx: r.ctx, beats: r.beats, id: 's09', D: seg.duration };
  const land = assembleScene(opts), port = assembleScene({ ...opts, format: 'portrait' });
  assert.match(land.html, /id="s09-kwList" data-layout="col" data-gap="md"/);
  assert.ok(!land.html.includes('data-layout-portrait') && !land.html.includes('flex-wrap'), '橫式不帶直式的東西');
  assert.match(land.html, /data-width="1920" data-height="1080"/);
  assert.match(port.html, /id="s09-kwList" data-layout="free" data-gap="md"/);
  assert.match(port.html, /#s09-kwList \{ left: 60px; top: auto; bottom: 680px; width: 880px;[^}]*flex-wrap: wrap;/);
  assert.match(port.html, /data-width="1080" data-height="1920"/);
  // stage 的情境（04 家族）直式子合成仍是 1920×1080（主合成縮放）
  const fl = scene('fs-list'), fseg = { ...sampleSeg(fl), id: 's08' };
  const fr = resolveScene({ scene: fl, seg: fseg, cues: [], icons: L.icons, consts: L.consts, t0: 0, D: fseg.duration });
  assert.match(assembleScene({ scene: fl, ctx: fr.ctx, beats: fr.beats, id: 's08', D: fseg.duration, format: 'portrait' }).html, /data-width="1920" data-height="1080"/);
  // --list：直式欄
  const { listText } = await imp('build.mjs');
  const t = listText(L);
  assert.match(t, /\| # \| key \| 中文 \| 組別 \| 直式 \| 長度（秒） \|/);
  assert.match(t, /\| 03 \| side-panel \| [^|]+ \| [^|]+ \| 不提供 \|/);
  assert.match(t, /\| 04a \| fs-list \| [^|]+ \| [^|]+ \| 可（縮進上半） \|/);
});
