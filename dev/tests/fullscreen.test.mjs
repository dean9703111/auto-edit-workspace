// 034 全螢幕（specs/034-fullscreen）：疊加字卡的全幕版（沒有講者自動換、"full": true）、小節開頭的上推、沒有講者時的畫面推近
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import { lib, imp, makeSrt } from './helpers.mjs';

const { resolvePlan, formatReport } = await imp('lib/plan.mjs');
const { buildMain } = await imp('lib/main.mjs');
const { sceneParts } = await imp('lib/assemble.mjs');
const { resolveScene, sampleSeg, fullScene } = await imp('lib/scenes.mjs');
const { parseSrt } = await imp('lib/srt.mjs');
const L = await lib();
const cues = parseSrt(makeSrt({ n: 12 }));   // 第 N 句 (N−1)×3.5＋1 起、長 3 秒
const VD = 44;
const go = (scenes, { voiceOnly = [], ...extra } = {}) => resolvePlan({ plan: { version: 1, speakerBox: [700, 200, 1220, 1000], scenes, ...extra }, cues, videoDur: VD, lib: L, outDir: os.tmpdir(), voiceOnly });
const byId = (res, id) => res.items.find((x) => x.id === id);
const list = (id, from, to, title = 'A') => ({ id, scene: 'fs-list', from, to, slots: { title, items: ['一', '二', '三'], visual: 'laptop' } });
const main = (res) => buildMain({ items: res.items, videoDur: VD, captions: null, pip: res.globals.pip, cues: res.cuesOut, moods: res.moods, zooms: res.zooms }).html;

test('有全幕版的只有 15、09、06、11；每一支的全幕版都組得起來（fs 底、id 前綴自檢過）', () => {
  assert.deepEqual(L.scenes.filter((s) => s.hasFull).map((s) => s.key).sort(), ['concept', 'qa', 'quote', 'summary']);
  for (const s of L.scenes.filter((x) => x.hasFull)) {
    const seg = sampleSeg(s);
    const r = resolveScene({ scene: s, seg, cues: [], icons: L.icons, consts: L.consts, t0: 0, D: seg.duration });
    assert.deepEqual(r.errors, [], s.key);
    const f = fullScene(s);
    assert.equal(f.family, 'fullscreen');
    const p = sceneParts({ scene: f, ctx: r.ctx, beats: r.beats, id: 'pv', D: seg.duration, tone: null });
    assert.match(p.body, /^<div class="sc-surface-fs fill"><\/div>/, s.key);
    assert.doesNotMatch(p.body, /sc-lt__plate/, `${s.key} 全幕版不是下方字卡`);
  }
});

test('「名詞：定義」拆成 _head／_tail；最長一行的字數 _maxline', () => {
  const concept = L.scenes.find((s) => s.key === 'concept'), quote = L.scenes.find((s) => s.key === 'quote');
  const ctx = (scene, slots) => resolveScene({ scene, seg: { id: 'x', slots }, cues: [], icons: L.icons, consts: L.consts, t0: 0, D: 6 }).ctx;
  const a = ctx(concept, { text: '**Skill**：工具附的**使用說明書**' });
  assert.equal(a.text_head, 'Skill');
  assert.equal(a.text_tail, '工具附的<span class="sc-kw">使用說明書</span>');
  assert.equal(a.text_headlen, 3);
  const b = ctx(concept, { text: '先確認再開拍' });
  assert.equal(b.text_head, '');
  assert.equal(b.text_tail, '先確認再開拍');
  assert.equal(ctx(quote, { text: '剪片不難//難的是知道剪哪裡' }).text_maxline, 8);
});

test('全幕版：一半以上在只有聲音的區間自動換（不透明、z 30、沒有子母畫面）；有講者的不換；"full": true 強制換；--check 寫全幕版', () => {
  const res = go([
    { id: 'q1', scene: 'quote', from: '#1', to: '#2e', slots: { text: '經驗變成資產' } },
    { id: 'q2', scene: 'quote', from: 21, to: 27, slots: { text: '經驗變成資產' } },
    { id: 'q3', scene: 'qa', from: '#9', to: '#10e', full: true, slots: { q: '要多久？', a: '四十分鐘' } },
  ], { voiceOnly: [[21, 27]] });
  assert.deepEqual(res.errors, []);
  const [q1, q2, q3] = ['q1', 'q2', 'q3'].map((id) => byId(res, id));
  assert.deepEqual([q1.full, q2.full, q3.full], [undefined, true, true]);
  assert.deepEqual([q2.opaque, q2.z, q2.pip, q2.lower, q2.scene.family, q2.scene.fullOf], [true, 30, false, false, 'fullscreen', 'lower-third']);
  assert.equal(q1.scene.family, 'lower-third', '原本的情境物件沒有被改到');
  assert.equal(q2.pipNote, '全幕版（這段沒有講者）');
  assert.equal(q3.pipNote, '全幕版（"full": true）');
  assert.equal(q2.compId, 'q2-quote', '子合成的名字照舊');
  assert.match(formatReport(res), /q2｜[^\n]*全幕版（這段沒有講者）/);
  const html = main(res);
  assert.match(html, /id="el-q2"[^>]*style="z-index:30[^"]*" data-wide><\/div>/);
});

test('全幕版的錯誤：寫在沒有全幕版的情境 ✖；不是布林 ✖；旁白段裡 "full": false 的字卡 ✖ 並提示可以加 "full": true', () => {
  const a = go([{ ...list('s1', '#1', '#2e'), full: true }]);
  assert.ok(a.errors.some((e) => e.includes('full：「全畫面清單」沒有全幕版（有的：06 一般字卡、09 QA 字卡、11 總結字卡、15 金句字卡）')), a.errors.join('\n'));
  const b = go([{ id: 'c1', scene: 'concept', from: '#1', to: '#1e', full: 'yes', slots: { text: '**Skill**：說明書' } }]);
  assert.ok(b.errors.some((e) => e.includes('full 只能是 true（換成全幕版）或 false（不自動換），現在是 "yes"')), b.errors.join('\n'));
  const c = go([{ id: 'c1', scene: 'concept', from: 21, to: 27, full: false, slots: { text: '**Skill**：說明書' } }], { voiceOnly: [[21, 27]] });
  assert.ok(c.errors.some((e) => e.includes('c1 有全幕版，那一段加 "full": true')), c.errors.join('\n'));
});

test('上推：前後都是全畫面、後一段是小節開頭 → push（前一段多留 0.87 秒一起往上走）；同一小節照舊換卡不換景', () => {
  const scenes = [list('s1', 11, 15, 'A'), list('s2', 15, 19.5, 'B'), list('s3', 19.5, 24, 'C')];
  const res = go(scenes, { voiceOnly: [[11, 24]], sections: [{ at: '#5', name: '第二步' }] });
  assert.deepEqual(res.errors, []);
  const [s1, s2, s3] = ['s1', 's2', 's3'].map((id) => byId(res, id));
  assert.deepEqual([s1.txOut, s2.txIn, s2.txOut, s3.txIn], ['push', 'push', 'swap', 'swap']);
  assert.equal(s2.prev, 'fullscreen', '模板照「換卡不換景」進場');
  assert.match(formatReport(res), /上推 1（s2）/);
  const html = main(res);
  assert.match(html, /id="el-s1"[^>]*data-duration="4\.87"[^>]*style="z-index:30; translate: 0 var\(--ty, 0px\)"/);
  assert.match(html, /id="el-s2"[^>]*style="z-index:31; translate: 0 var\(--ty, 0px\); box-shadow:/);
  assert.ok(html.includes(`tl.fromTo('#el-s2', { '--ty': '1080px' }, { '--ty': '0px', duration: 0.87, ease: 'expo.out', immediateRender: false }, 15);`));
  assert.ok(html.includes(`tl.fromTo('#el-s1', { '--ty': '0px' }, { '--ty': '-1080px', duration: 0.87, ease: 'expo.out', immediateRender: false }, 15);`));
  const plain = go(scenes, { voiceOnly: [[11, 24]] });
  assert.deepEqual(['s1', 's2'].map((id) => byId(plain, id).txOut), ['swap', 'swap'], '沒有 sections 就不上推');
});

test('畫面推近：情緒點那一刻沒有講者、在全畫面段裡 → 推那一段的畫面 1.1 倍（host 的 --pz），字幕角標不動；剛進場的不推', () => {
  const moods = [{ at: '#4@字幕', kind: 'quote', zoom: true }];
  const res = go([list('s1', 11.5, 22)], { voiceOnly: [[11.5, 22]], moods });
  assert.deepEqual(res.errors, []);
  assert.equal(res.zooms.list.length, 1);
  const z = res.zooms.list[0];
  assert.deepEqual([z.screen, z.scale, z.dur, z.hold, z.out], ['s1', 1.1, 0.12, 0.55, 0.6]);
  assert.ok(res.sfxBudget.lines.some((l) => l.startsWith('講者爆衝推近：0 次；畫面推近 1 次（')), res.sfxBudget.lines.join('\n'));
  const html = main(res);
  assert.match(html, /id="el-s1"[^>]*style="z-index:30; scale: var\(--pz, 1\); --po: 960px 470px; transform-origin: var\(--po\)"/);
  assert.ok(html.includes(`tl.set('#el-s1', { '--po': () => punchAim('s1', ${+(z.event - 11.5).toFixed(3)}) }, ${z.a});`), '推向那一刻剛進場的元素（作者驗收單 punchAim=target）');
  assert.ok(html.includes('function punchAim(id, t)'));
  assert.ok(html.includes(`tl.fromTo('#el-s1', { '--pz': 1 }, { '--pz': 1.1, duration: 0.12, ease: 'expo.out', immediateRender: false }, ${z.a});`));
  assert.ok(html.includes(`tl.fromTo('#el-s1', { '--pz': 1.1 }, { '--pz': 1, duration: 0.6, ease: 'power3.inOut', immediateRender: false }, ${+(z.a + 0.67).toFixed(3)});`));
  assert.doesNotMatch(html, /#footage \{ transform-origin/, '沒有推講者');
  const early = go([list('s1', 12.9, 22)], { voiceOnly: [[12.9, 22]], moods });
  assert.equal(early.zooms.list.length, 0, '進場 0.7 秒內不推');
});

test('畫面推近的中心（瀏覽器）：詞開口前 2.5 秒內最後開始的 tween 的元素中心；巢狀時間軸、from() 照算，淡出、大容器、0 秒的 set 不算；段還沒顯示也量得到', { timeout: 60000 }, async (t) => {
  const { hasChrome, TEMPLATE } = await import('./helpers.mjs');
  const chrome = await hasChrome(); if (!chrome) { t.skip('沒有現有 Chrome'); return; }
  const { PUNCH_AIM_JS } = await imp('lib/main.mjs');
  const fs = await import('node:fs'), path = await import('node:path');
  const gsapJs = fs.readFileSync(path.join(TEMPLATE, 'kit', 'gsap.min.js'), 'utf8');
  const { default: puppeteer } = await import('puppeteer-core');
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<!doctype html><body style="margin:0"><div id="el-s1" data-composition-id="c1" style="position:absolute;left:0;top:0;width:1920px;height:1080px;display:none">
      <div id="big" style="position:absolute;left:10px;top:10px;width:1900px;height:1000px"></div>
      <div id="b" style="position:absolute;left:100px;top:100px;width:200px;height:100px"></div>
      <div id="c" style="position:absolute;left:1500px;top:600px;width:100px;height:100px"><span id="w">字</span></div>
      <div id="d" style="position:absolute;left:800px;top:800px;width:50px;height:50px"></div>
    </div><script>${gsapJs}</script><script>
      window.__timelines = {};
      const sub = gsap.timeline({ paused: true });
      sub.fromTo('#b', { opacity: 0 }, { opacity: 1, duration: 0.5 }, 1);
      const inner = gsap.timeline(); inner.from('#c', { opacity: 0, duration: 0.5 }, 1); sub.add(inner, 2);   // 巢狀：本段 3 秒
      sub.to('#d', { opacity: 0, duration: 0.3 }, 3.05);          // 淡出不算
      sub.fromTo('#big', { x: 0 }, { x: 1, duration: 0.5 }, 3.1); // 蓋住大半個畫面的容器不算
      sub.set('#d', { opacity: 1 }, 3.12);                         // 0 秒的 set 不算
      window.__timelines.c1 = sub;
${PUNCH_AIM_JS}
      window.punchAim = punchAim;
    </script></body>`);
    const r = await page.evaluate(() => [punchAim('s1', 3.05), punchAim('s1', 1.2), punchAim('s1', 9), punchAim('nope', 1), document.getElementById('el-s1').style.display]);
    assert.deepEqual(r, ['1550px 650px', '200px 150px', '960px 470px', '960px 470px', 'none']);
  } finally { await browser.close(); }
});
