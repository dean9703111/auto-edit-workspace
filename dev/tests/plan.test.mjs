// plan.json 解析：起迄、換卡延長、接不透明幕、音效間隔、錯誤訊息、主合成與 --test 平移
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lib, imp, makeSrt, cueStart, cueEnd } from './helpers.mjs';

const { resolvePlan, pipGeometry, formatReport } = await imp('lib/plan.mjs');
const { buildMain } = await imp('lib/main.mjs');
const { buildCaptions } = await imp('lib/captions.mjs');
const { parseSrt } = await imp('lib/srt.mjs');
const L = await lib();
const cues = parseSrt(makeSrt({ n: 12 }));
const VD = 44;
const run = (scenes, extra = {}, outDir = os.tmpdir()) => resolvePlan({ plan: { version: 1, speakerBox: [700, 200, 1220, 1000], scenes, ...extra }, cues, videoDur: VD, lib: L, outDir });
const byId = (res, id) => res.items.find((x) => x.id === id);
const r3 = (x) => +x.toFixed(3);

test('from／to 綁句號：#N 起點、#Ne 結尾；沒寫 to 用預設長度', () => {
  const res = run([
    { id: 's01', scene: 'concept', from: '#2', to: '#3e', slots: { text: '一般字卡' } },
    { id: 's02', scene: 'key-point', from: '#6', slots: { key: '重點' } },
  ]);
  assert.deepEqual(res.errors, []);
  assert.equal(byId(res, 's01').start, cueStart(2));
  assert.equal(byId(res, 's01').end, cueEnd(3));
  assert.equal(byId(res, 's02').D, 5);   // key-point duration.default
});

test('相接的下方字卡：前一張的結尾改成後一張起點＋0.4（同時退場進場）', () => {
  const res = run([
    { id: 's01', scene: 'concept', from: '#2', to: '#4e', slots: { text: '第一張' } },
    { id: 's02', scene: 'summary', from: '#4', to: '#6e', slots: { text: '第二張' } },
  ]);
  assert.deepEqual(res.errors, []);
  const a = byId(res, 's01');
  assert.equal(a.end, r3(cueStart(4) + 0.4));
  assert.equal(a.handoff, 's02');
  assert.ok(!res.warnings.some((w) => w.includes('時間重疊')), '換卡不算重疊');
  // 沒相接（隔 0.5 秒以上）就不動
  const res2 = run([
    { id: 's01', scene: 'concept', from: '#2', to: '#3e', slots: { text: '第一張' } },
    { id: 's02', scene: 'summary', from: '#5', to: '#6e', slots: { text: '第二張' } },
  ]);
  assert.equal(byId(res2, 's01').end, cueEnd(3));
});

test('音效：3 秒內只留第一個，被拿掉的列進警告；起點＝事件時間−峰值＋1 幀', () => {
  const res = run([
    { id: 's01', scene: 'keywords', from: 5.5, to: 9.5, slots: { items: ['一', '二'] } },
    { id: 's02', scene: 'key-point', from: '#3', to: '#4e', slots: { key: '二' } },
    { id: 's03', scene: 'concept', from: '#6', to: '#7e', slots: { text: '三' }, sfx: 'success' },
  ]);
  assert.deepEqual(res.errors, []);
  const s1 = byId(res, 's01'), s2 = byId(res, 's02'), s3 = byId(res, 's03');
  assert.equal(s1.sfx.name, 'pop');
  // keywords：主 pop 落在 items[0]（0.2）
  assert.equal(s1.sfx.at, r3(5.5 + 0.2 - L.sfx.pop.peak + 1 / 30));
  assert.equal(s2.sfx, null);
  assert.equal(s2.sfxDropped.name, 'ding');
  assert.ok(s2.warnings.some((w) => /< 3s）.*已拿掉/.test(w)));
  assert.equal(s3.sfx.name, 'success');
  // 預設：07 tone warn＝alert；章節＝whoosh（起點前 0.15 秒）；fx 10 的 catalog sfx 是 null → 不配
  const res2 = run([
    { id: 's01', scene: 'key-point', tone: 'warn', from: '#2', to: '#3e', slots: { key: '注意' } },
    { id: 's02', scene: 'chapter', at: '#6', slots: { num: '01', title: '章' } },
    { id: 's03', type: 'fx', fx: 10, from: '#9', to: '#9e', vars: { text: '重點' } },
  ]);
  assert.equal(byId(res2, 's01').sfx.name, 'alert');
  assert.equal(byId(res2, 's02').sfx.name, 'whoosh');
  assert.equal(byId(res2, 's02').sfx.event, r3(byId(res2, 's02').start - 0.15));
  assert.equal(byId(res2, 's03').sfx, undefined);
});

test('章節轉場：空檔 ≥ 2 秒放在空檔裡，否則從該句起點蓋 2.5 秒', () => {
  const gapCues = parseSrt('1\n00:00:01,000 --> 00:00:04,000\n第一句\n\n2\n00:00:07,000 --> 00:00:10,000\n第二句\n\n3\n00:00:10,500 --> 00:00:13,000\n第三句\n');
  const mk = (at) => resolvePlan({ plan: { version: 1, scenes: [{ id: 'c1', scene: 'chapter', at, slots: { num: '01', title: '開始' } }] }, cues: gapCues, videoDur: 20, lib: L, outDir: os.tmpdir() });
  assert.equal(byId(mk('#2'), 'c1').start, 4.5);    // 空檔 3 秒：結束在 #2 起點
  assert.equal(byId(mk('#3'), 'c1').start, 10.5);   // 空檔 0.5 秒：從 #3 起點開始
  assert.equal(byId(mk('#3'), 'c1').D, 2.5);
});

test('接不透明幕：側邊欄停在完成態、延到幕淡入結束，底片在那時歸位；全畫面接全畫面接縫不淡', () => {
  const res = run([
    { id: 's01', scene: 'side-panel', from: '#2', to: '#4e', slots: { title: '標題', items: ['一', '二', '三'] } },
    { id: 's02', scene: 'fs-list', from: '#4', to: '#6e', slots: { title: '清單', items: ['一', '二', '三'] } },
    { id: 's03', scene: 'fs-table', from: '#7', to: '#9e', slots: { title: '表格', head: ['甲 / 乙'], rows: ['一 / 二', '三 / 四'] } },
  ]);
  assert.deepEqual(res.errors, []);
  const side = byId(res, 's01'), fs1 = byId(res, 's02'), fs2 = byId(res, 's03');
  assert.equal(side.exitFade, false);
  assert.ok(side.end >= r3(cueStart(4) + 0.5), '至少延到全畫面淡入結束');
  assert.equal(side.footageReset, r3(cueStart(4) + 0.5));
  assert.equal(fs1.fadeIn, true);
  assert.equal(fs1.fadeOut, true);    // #6e 和 #7 差 0.5 秒（> 0.1）：不是接縫，照常淡出
  assert.equal(fs2.fadeIn, true);
});

test('全畫面接全畫面（間隔 ≤ 0.1 秒）：前段不淡出、後段不淡入，空隙補起來', () => {
  const res = run([
    { id: 's02', scene: 'fs-list', from: '#4', to: 18, slots: { title: '清單', items: ['一', '二', '三'] } },
    { id: 's03', scene: 'fs-table', from: 18.05, to: '#9e', slots: { title: '表格', head: ['甲 / 乙'], rows: ['一 / 二', '三 / 四'] } },
  ]);
  assert.deepEqual(res.errors, []);
  const a = byId(res, 's02'), b = byId(res, 's03');
  assert.equal(a.fadeOut, false);
  assert.equal(b.fadeIn, false);
  assert.equal(a.end, 18.05);
  assert.equal(a.pip && b.pip, true);
});

test('錯誤訊息寫明段落、欄位、怎麼改', () => {
  const res = run([
    { id: 's01', scene: 'concpet', from: '#2' },
    { id: 's02', scene: 'concept', from: '#99', slots: { text: '一' } },
    { id: 's02', scene: 'concept', from: '#3', to: '#2', slots: { text: '一' } },
    { id: 's04', scene: 'two-sides', from: '#5', slots: { cards: [] } },
    { id: 's05', scene: 'concept', from: '#2', colour: 'red', slots: { text: '一' } },
    { id: 's06', scene: 'concept', from: '#2', to: '+3', slots: { text: '一' } },
  ], { avoid: ['two-sides'] });
  const all = res.errors.join('\n');
  assert.match(all, /\[s01 concpet\] scene：找不到情境「concpet」（相近：concept/);
  assert.match(all, /\[s02 concept\] from：字幕沒有第 99 句（rough\.srt 共 12 句/);
  assert.match(all, /id「s02」重複了/);
  assert.match(all, /to（.*）在 from（.*）之前或相同/);
  assert.match(all, /「兩側」在 avoid 名單/);
  assert.match(all, /沒有「colour」這個欄位/);
  assert.match(all, /from／to 不能寫「\+3」.*"duration": 3/);
});

test('時間超過影片長度：起點報錯、結尾截短', () => {
  const res = run([{ id: 's01', scene: 'concept', from: 45, slots: { text: '一' } }, { id: 's02', scene: 'concept', from: 40, to: 50, slots: { text: '二' } }]);
  assert.match(res.errors.join('\n'), /起點 45s 超過影片長度 44s/);
  const r2 = run([{ id: 's02', scene: 'concept', from: 40, to: 50, slots: { text: '二' } }]);
  assert.equal(byId(r2, 's02').end, 44);
  assert.match(r2.warnings.join('\n'), /超過影片長度 44s，已截短/);
});

test('anchor 不符時警告並指出最可能的句號', () => {
  const res = run([{ id: 's01', scene: 'concept', from: '#2', anchor: '第 5 句', slots: { text: '一' } }]);
  assert.match(res.warnings.join('\n'), /anchor「第 5 句」不在 #2.*最可能是 #5/);
});

test('fx 字卡動態：host id 唯一（card-NN-k）、vars 檢查、bg 決定是否不透明', () => {
  const res = run([
    { id: 'f1', type: 'fx', fx: 29, from: '#2', to: '#2e', vars: { number: '18', label: '字' } },
    { id: 'f2', type: 'fx', fx: 29, from: '#6', to: '#6e', bg: 'dark', vars: { number: '3' } },
    { id: 'f3', type: 'fx', fx: 29, from: '#9', to: '#9e', vars: { nope: '1' } },
  ]);
  assert.equal(byId(res, 'f1').compId, 'card-29-1');
  assert.equal(byId(res, 'f2').compId, 'card-29-2');
  assert.equal(byId(res, 'f1').opaque, false);
  assert.equal(byId(res, 'f1').z, 50);
  assert.equal(byId(res, 'f2').opaque, true);
  assert.equal(byId(res, 'f1').vars.accent, L.accent);
  assert.match(res.errors.join('\n'), /vars\.nope：fx 29 沒有這個變數（可用：.*number/);
});

test('custom：檔案要存在、data-composition-id 和檔名一致', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-custom-'));
  fs.mkdirSync(path.join(dir, 'compositions'));
  fs.writeFileSync(path.join(dir, 'compositions', 'x-flow.html'), `<!doctype html><html><body><template><div id="x-flow" data-composition-id="x-flow2"></div><script>window.__timelines['x-flow2'] = 1;</script></template></body></html>`);
  const res = run([
    { id: 'x01', type: 'custom', src: 'compositions/x-flow.html', layout: 'fullscreen', from: '#2', to: '#4e' },
    { id: 'x02', type: 'custom', src: 'compositions/x-none.html', layout: 'overlay', from: '#6', to: '#7e' },
  ], {}, dir);
  const all = res.errors.join('\n');
  assert.match(all, /data-composition-id 是「x-flow2」，要和檔名一致改成「x-flow」/);
  assert.match(all, /找不到 .*x-none\.html/);
  assert.equal(byId(res, 'x01').pip, true);
});

test('子母畫面裁切：講者置中用預設框，偏右時以講者框為中心', () => {
  assert.deepEqual(pipGeometry('auto', [700, 200, 1220, 1000]).style, { left: -124, top: -9, width: 776, height: 436 });
  const g = pipGeometry('auto', [1000, 300, 1600, 980]);
  assert.ok(g.crop.x + g.crop.w <= 1920 && g.crop.y + g.crop.h <= 1080);
  assert.ok(Math.abs(g.crop.w / g.crop.h - 16 / 9) < 1e-6);
  assert.equal(pipGeometry([0, 0, 1920, 1080]).style.width, 512);
});

test('主合成：底片、子合成 host、子母畫面、字幕、音效、底片右移都在', () => {
  const res = run([
    { id: 's01', scene: 'side-panel', from: '#2', to: '#4e', slots: { title: '標題', items: ['一', '二', '三'] } },
    { id: 's02', scene: 'fs-list', from: '#6', to: '#8e', slots: { title: '清單', items: ['一', '二', '三'] } },
    { id: 's03', type: 'fx', fx: 29, from: '#10', to: '#10e', vars: { number: '3' } },
  ]);
  assert.deepEqual(res.errors, []);
  const cap = buildCaptions(cues, { duration: VD });
  const { html } = buildMain({ items: res.items, videoDur: VD, captions: cap, pip: res.globals.pip, sideShift: 480 });
  assert.match(html, /<video id="rough" src="assets\/rough\.mp4" data-start="0" data-duration="44"\s+data-track-index="0" data-has-audio="true" playsinline>/);
  assert.match(html, /id="el-s02" data-composition-id="s02-fs-list" data-composition-src="compositions\/s02-fs-list\.html"/);
  assert.match(html, /<video id="pipv-s02" src="assets\/rough\.mp4" data-start="18\.5" data-duration="[\d.]+" data-media-start="18\.5"[\s\S]*?muted playsinline/);
  assert.match(html, /<img id="pipf-s02" class="clip pip-frame" src="kit\/pip-frame\.png"/);
  assert.match(html, /data-variable-values='\{"number":"3","bg":"none","accent":"#[0-9A-Fa-f]{6}"\}'/);
  assert.match(html, /data-track-kind="captions"/);
  assert.match(html, /<audio id="sfx-s02" src="assets\/sfx\/whoosh\.wav"/);
  assert.match(html, /tl\.fromTo\('#footage', \{ x: 0 \}, \{ x: 480, duration: 0\.7, ease \}, 4\.5\);/);
  assert.match(html, /tl\.fromTo\('#el-s02, #pip-s02, #pipf-s02', \{ opacity: 0 \}/);
  assert.doesNotMatch(html, /id="root"/, '主合成的 root 不能叫 root（fx 子合成的根也叫 #root）');
  // DOM 順序：底片 → 情境 → 子母畫面 → 字幕 → 音效
  const order = ['id="footage"', 'id="el-s01"', 'id="pip-s02"', 'id="el-captions"', 'id="sfx-s02"'].map((k) => html.indexOf(k));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.match(formatReport(res), /s02｜04a 全畫面清單｜/);
});

test('--test 平移：root 長度＝秒數、底片 data-media-start＝起點、情境與音效往前移；放在 compositions/ 用 ../ 路徑', () => {
  const res = run([
    { id: 's01', scene: 'concept', from: '#2', to: '#3e', slots: { text: '一' } },
    { id: 's02', scene: 'concept', from: '#6', to: '#7e', slots: { text: '二' } },
  ]);
  const t0 = cueStart(6) - 1, len = 6;
  const cap = buildCaptions(cues, { duration: len, offset: t0, compId: 'captions-test' });
  const { html, skipped, duration } = buildMain({ items: res.items, videoDur: VD, captions: cap, pip: res.globals.pip, test: { t0, len } });
  assert.equal(duration, 6);
  assert.match(html, /data-composition-id="test-clip" data-start="0" data-duration="6"/);
  assert.match(html, /src="\.\.\/assets\/rough\.mp4" data-start="0" data-duration="6" data-media-start="17\.5"/);
  assert.match(html, /id="el-s02"[^>]*\n\s+data-start="1"/);
  assert.doesNotMatch(html, /el-s01/);
  assert.match(html, /<audio id="sfx-s02" src="\.\.\/assets\/sfx\/pop\.wav" data-start="1\.\d+"/);
  assert.match(html, /href="\.\.\/kit\/scene\.css"/);
  assert.match(html, /data-composition-src="compositions\/s02-concept\.html"/, 'data-composition-src 以專案根目錄為準，不加 ../');
  assert.deepEqual(skipped, []);
  // 起點落在某段中間：該段略過並回報
  const mid = buildMain({ items: res.items, videoDur: VD, captions: cap, pip: res.globals.pip, test: { t0: cueStart(2) + 1, len: 4 } });
  assert.deepEqual(mid.skipped.map((x) => x.id), ['s01']);
  // 字幕平移
  assert.match(cap.html, /tl\.set\('#cg-6', \{ opacity: 1, visibility: 'visible' \}, 1\);/);
});

// ---------- 音效 v2：scene.json 宣告主音效＋跟節拍的附加音效 ----------
const F = 1 / 30;
const atOf = (start, rel, name) => r3(Math.max(0, start + rel - L.sfx[name].peak + F));

test('音效：06 concept 沒寫 sfx → 主 pop 落在 in+0.1', () => {
  const s = byId(run([{ id: 's01', scene: 'concept', from: '#2', to: '#3e', slots: { text: '一' } }]), 's01');
  assert.equal(s.sfx.name, 'pop');
  assert.equal(s.sfx.event, r3(s.start + 0.1));
  assert.equal(s.sfx.at, atOf(s.start, 0.1, 'pop'));
  assert.deepEqual(s.sfxExtra, []);
});

test('音效：07 key-point 依 tone 選 ding／alert／success', () => {
  const res = run([
    { id: 's01', scene: 'key-point', from: '#1', duration: 5, slots: { key: '一' } },
    { id: 's02', scene: 'key-point', tone: 'warn', from: '#4', duration: 5, slots: { key: '二' } },
    { id: 's03', scene: 'key-point', tone: 'good', from: '#7', duration: 5, slots: { key: '三' } },
  ]);
  assert.deepEqual(res.errors, []);
  assert.deepEqual(['s01', 's02', 's03'].map((id) => byId(res, id).sfx.name), ['ding', 'alert', 'success']);
});

test('音效：03 side-panel 3 項 → 主 swipe＋tick 3 顆，時間 1.3＋i×0.6', () => {
  const s = byId(run([{ id: 's01', scene: 'side-panel', from: '#2', to: '#4e', slots: { title: '標題', items: ['一', '二', '三'] } }]), 's01');
  assert.equal(s.sfx.name, 'swipe');
  assert.deepEqual(s.sfxExtra.map((c) => c.name), ['tick', 'tick', 'tick']);
  assert.deepEqual(s.sfxExtra.map((c) => c.at), [0, 1, 2].map((i) => atOf(s.start, 1.3 + i * 0.6, 'tick')));
  assert.deepEqual(s.sfxExtra.map((c) => c.volume), [1, 2, 3].map(() => L.sfx.tick.volume));
});

test('音效：12 keywords 3 項 → 主 pop 在 items[0]，tick 2 顆', () => {
  const s = byId(run([{ id: 's01', scene: 'keywords', from: '#2', to: '#4e', slots: { items: ['一', '二', '三'] } }]), 's01');
  assert.equal(s.sfx.event, r3(s.start + 0.2));
  assert.deepEqual(s.sfxExtra.map((c) => c.event), [r3(s.start + 0.7), r3(s.start + 1.2)]);
});

test('音效：09 qa 的 ding 在 aAt，音量＝ding 預設音量×0.8', () => {
  const s = byId(run([{ id: 's01', scene: 'qa', from: '#2', to: '#4e', slots: { q: '問', a: '答' } }]), 's01');
  assert.equal(s.errors.length, 0, s.errors.join('\n'));
  assert.equal(s.sfxExtra.length, 1);
  assert.equal(s.sfxExtra[0].name, 'ding');
  assert.equal(s.sfxExtra[0].event, r3(s.start + s.resolved.beats.aAt));
  assert.equal(s.sfxExtra[0].volume, Math.round(L.sfx.ding.volume * 0.8 * 100) / 100);
});

test('音效：sfxExtra:false 關附加；sfx:null 只關主；sfx:"whoosh" 換名稱落點不變', () => {
  const seg = { scene: 'side-panel', from: '#2', to: '#4e', slots: { title: '標題', items: ['一', '二', '三'] } };
  const res = run([{ id: 's01', ...seg, sfxExtra: false }, { id: 's02', ...seg, from: '#6', to: '#8e', sfx: null }, { id: 's03', ...seg, from: '#10', to: '#12e', sfx: 'whoosh' }]);
  assert.deepEqual(res.errors, []);
  assert.deepEqual(byId(res, 's01').sfxExtra, []);
  assert.equal(byId(res, 's01').sfx.name, 'swipe');
  assert.equal(byId(res, 's02').sfx, undefined);
  assert.equal(byId(res, 's02').sfxExtra.length, 3);
  const s3 = byId(res, 's03');
  assert.equal(s3.sfx.name, 'whoosh');
  assert.equal(s3.sfx.event, s3.start);
  const bad = run([{ id: 's01', ...seg, sfxExtra: 'no' }]);
  assert.ok(bad.errors.some((e) => /sfxExtra/.test(e)));
});

test('音效：不存在的名稱 → ✖ 列出 12 個可用名稱', () => {
  const res = run([{ id: 's01', scene: 'concept', from: '#2', to: '#3e', slots: { text: '一' }, sfx: 'boom' }]);
  const e = res.errors.find((x) => /sfx：只能是/.test(x));
  assert.ok(e);
  for (const n of Object.keys(L.sfx)) assert.ok(e.includes(n), n);
  assert.equal(Object.keys(L.sfx).length, 12);
});

test('音效：3 秒間隔只管主 cue；同段附加 cue 不受影響，起點相距 < 0.2 才丟', () => {
  const res = run([
    { id: 's01', scene: 'side-panel', from: '#2', to: '#3e', slots: { title: '標題', items: ['一', '二', '三'] } },
    { id: 's02', scene: 'concept', from: 6, to: '#4e', slots: { text: '二' } },
  ]);
  assert.equal(byId(res, 's02').sfx, null);
  assert.equal(byId(res, 's02').sfxDropped.name, 'pop');
  assert.equal(byId(res, 's01').sfxExtra.length, 3);
  // 兩顆 tick 事件只差 0.1 秒 → 丟後者
  const close = run([{ id: 's01', scene: 'fs-list', from: '#2', to: '#4e', slots: { title: '清單', items: [{ text: '一', at: '+1' }, { text: '二', at: '+1.1' }, { text: '三', at: '+1.5' }] } }]);
  assert.deepEqual(close.errors, []);
  assert.deepEqual(byId(close, 's01').sfxExtra.map((c) => r3(c.event - byId(close, 's01').start)), [1, 1.5]);
});

test('音效：fx 預設來自 catalog 的 sfx，plan 的 sfx 換名稱；custom 只有寫 sfx 才配', () => {
  const fx2 = L.fx.map((f) => (f.no === 1 ? { ...f, sfx: { sound: 'impact', at: 0.3 } } : f));
  const L2 = { ...L, fx: fx2 };
  const mk = (scenes) => resolvePlan({ plan: { version: 1, speakerBox: [700, 200, 1220, 1000], scenes }, cues, videoDur: VD, lib: L2, outDir: os.tmpdir() });
  const res = mk([
    { id: 's01', type: 'fx', fx: 1, from: '#2', to: '#2e', vars: { text: '重點' } },
    { id: 's02', type: 'fx', fx: 1, from: '#6', to: '#6e', vars: { text: '重點' }, sfx: 'glitch' },
    { id: 's03', type: 'fx', fx: 10, from: '#9', to: '#9e', vars: { text: '重點' } },  // fx 10 的 catalog sfx 是 null
  ]);
  assert.deepEqual(res.errors, []);
  const a = byId(res, 's01'), b = byId(res, 's02');
  assert.equal(a.sfx.name, 'impact');
  assert.equal(a.sfx.event, r3(a.start + 0.3));
  assert.equal(b.sfx.name, 'glitch');
  assert.equal(b.sfx.event, r3(b.start + 0.3));
  assert.equal(byId(res, 's03').sfx, undefined);
  assert.match(formatReport(res), /impact \d+:\d\d\.\d\d/);
});

test('音效：報告欄位 pop 12.55 ＋tick×3；只有附加時 — ＋tick×3', () => {
  const res = run([
    { id: 's01', scene: 'side-panel', from: '#2', to: '#4e', slots: { title: '標題', items: ['一', '二', '三'] } },
    { id: 's02', scene: 'fs-list', from: '#8', to: '#10e', sfx: null, slots: { title: '清單', items: ['一', '二', '三'] } },
  ]);
  const rep = formatReport(res);
  assert.match(rep, /s01｜.*｜swipe \d+:\d\d\.\d\d ＋tick×3｜/);
  assert.match(rep, /s02｜.*｜— ＋tick×3｜/);
});

test('音效名稱檢查：scene.json 的 main.sound（含 tone 物件）與 catalog 的 fx sfx.sound 拼錯都 ✖', () => {
  const mk = (Lx, scenes) => resolvePlan({ plan: { version: 1, speakerBox: [700, 200, 1220, 1000], scenes }, cues, videoDur: VD, lib: Lx, outDir: os.tmpdir() });
  const L1 = { ...L, scenes: L.scenes.map((s) => (s.key === 'concept' ? { ...s, sfx: { ...s.sfx, main: { ...s.sfx?.main, sound: 'popp' } } } : s)) };
  const r1 = mk(L1, [{ id: 's01', scene: 'concept', from: '#2', to: '#3e', slots: { text: '一般字卡' } }]);
  assert.ok(r1.errors.some((e) => /\[s01 concept\] 音效 main（情境 concept）：sfx\.json 沒有「popp」/.test(e)), r1.errors.join('\n'));
  const L2 = { ...L, scenes: L.scenes.map((s) => (s.key === 'key-point' ? { ...s, sfx: { ...s.sfx, main: { ...s.sfx?.main, sound: { default: 'ding', warn: 'alertt' } } } } : s)) };
  const r2 = mk(L2, [{ id: 's01', scene: 'key-point', from: '#2', slots: { key: '重點' } }]);
  assert.ok(r2.errors.some((e) => /sfx\.json 沒有「alertt」/.test(e)), r2.errors.join('\n'));
  const L3 = { ...L, fx: L.fx.map((f) => (f.no === 1 ? { ...f, sfx: { sound: 'impactt', at: 0.3 } } : f)) };
  const r3_ = mk(L3, [{ id: 's01', type: 'fx', fx: 1, from: '#2', to: '#2e', vars: { text: '重點' } }]);
  assert.ok(r3_.errors.some((e) => /\[s01 fx 1\] 音效 fx 1：sfx\.json 沒有「impactt」/.test(e)), r3_.errors.join('\n'));
});
