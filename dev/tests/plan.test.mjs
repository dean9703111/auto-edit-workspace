// plan.json 解析：起迄、換卡延長、接不透明幕、音效間隔、錯誤訊息、主合成與 --test 平移
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

test('02 章節角標整段被不透明段蓋住才警告（容許 0.05 s 誤差）', () => {
  const od = fs.mkdtempSync(path.join(os.tmpdir(), 'chapter-tag-cover-'));
  try {
    fs.mkdirSync(path.join(od, 'compositions'));
    fs.writeFileSync(path.join(od, 'compositions/x-cover.html'), '<template id="x-cover-template"><div id="x-cover" data-composition-id="x-cover"></div><script>window.__timelines["x-cover"] = 1;</script></template>');
    const go = (from, to) => run([
      { id: 'x01', type: 'custom', src: 'compositions/x-cover.html', layout: 'fullscreen', from: 0, to: 10 },
      { id: 'c1', scene: 'chapter-tag', from, to, slots: { num: '01', name: '開始' } },
    ], {}, od);
    const covered = go(2, 5);
    // 題定的 2–5／12–15 秒只有 3 秒，仍會觸發既有的 3.5 秒最短段長檢查。
    assert.equal(covered.errors.length, 1, covered.errors.join('\n'));
    assert.match(covered.errors[0], /章節角標.*至少 3.5s/);
    assert.ok(covered.warnings.includes('[c1 chapter-tag] 02 章節角標整段（0:02.00–0:05.00）被 x01 蓋住，畫面看不到，只當章節起點用 → 要看到角標就把它的 from 移到疊加段，或刪掉這段只留 chapterBadge'));
    const visible = go(12, 15);
    assert.equal(visible.errors.length, 1);
    assert.match(visible.errors[0], /章節角標.*至少 3.5s/);
    assert.ok(!visible.warnings.some((w) => w.includes('02 章節角標整段')));
    assert.ok(go(0, 10.04).warnings.some((w) => w.includes('02 章節角標整段')));
    assert.ok(!go(0, 10.06).warnings.some((w) => w.includes('02 章節角標整段')));
  } finally {
    fs.rmSync(od, { recursive: true, force: true });
  }
});

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
  // 預設：07 tone warn＝alert；章節＝chapter（章名落定 titleAt＝起點＋0.45）；fx 10 的 catalog sfx 是 null → 不配
  const res2 = run([
    { id: 's01', scene: 'key-point', tone: 'warn', from: '#2', to: '#3e', slots: { key: '注意' } },
    { id: 's02', scene: 'chapter', at: '#6', slots: { num: '01', title: '章' } },
    { id: 's03', type: 'fx', fx: 10, from: '#9', to: '#9e', vars: { text: '重點' } },
  ]);
  assert.equal(byId(res2, 's01').sfx.name, 'alert');
  assert.equal(byId(res2, 's02').sfx.name, 'chapter');
  assert.equal(byId(res2, 's02').sfx.event, r3(byId(res2, 's02').start + 0.45));
  assert.equal(byId(res2, 's02').sfx.at, r3(byId(res2, 's02').start + 0.45 - L.sfx.chapter.peak + 1 / 30));
  // 14 講者介紹＝sparkle；15 金句 tone warn＝thunder、其他＝sparkle；04a 仍是 whoosh
  const res3 = run([
    { id: 's01', scene: 'quote', tone: 'warn', from: '#2', to: '#3e', slots: { text: '壓力好大' } },
    { id: 's02', scene: 'quote', from: '#5', to: '#6e', slots: { text: '慢慢來' } },
    { id: 's03', scene: 'fs-list', from: '#8', to: '#10e', slots: { title: '清單', items: ['一', '二', '三'] } },
  ]);
  assert.equal(byId(res3, 's01').sfx.name, 'thunder');
  assert.equal(byId(res3, 's02').sfx.name, 'sparkle');
  assert.equal(byId(res3, 's03').sfx.name, 'whoosh');
  assert.equal(byId(res2, 's03').sfx, undefined);
});

test('章節轉場：空檔 3 s 置中 4.25；2.5 s 貼齊；0.5 s 從該句起點蓋＋⚠（含 ng-snap 指令與專案名）', () => {
  const gapCues = parseSrt('1\n00:00:01,000 --> 00:00:04,000\n第一句\n\n2\n00:00:07,000 --> 00:00:10,000\n第二句\n\n3\n00:00:10,500 --> 00:00:13,000\n第三句\n\n4\n00:00:15,500 --> 00:00:17,000\n第四句\n');
  const mk = (at) => resolvePlan({ plan: { version: 1, scenes: [{ id: 'c1', scene: 'chapter', at, slots: { num: '01', title: '開始' } }] }, cues: gapCues, videoDur: 20, lib: L, outDir: os.tmpdir(), projectRel: 'projects/範例' });
  const a = mk('#2');
  assert.equal(byId(a, 'c1').start, 4.25);   // 空檔 3 秒：前後各留 0.25
  assert.equal(byId(a, 'c1').chapterNote, '放在 #2 前的空檔（3.00s），前後各留 0.25s');
  assert.deepEqual(a.chapters.map((c) => [c.cue, c.placement, c.gap]), [[2, 'centered', 3]]);
  const f = mk('#4');
  assert.equal(byId(f, 'c1').start, 13);     // 空檔 2.5 秒：結尾貼齊 #4
  assert.equal(byId(f, 'c1').chapterNote, '放在 #4 前的空檔（2.50s），結尾貼齊 #4');
  const c = mk('#3');
  assert.equal(byId(c, 'c1').start, 10.5);   // 空檔 0.5 秒：從 #3 起點開始
  assert.equal(byId(c, 'c1').D, 2.5);
  assert.equal(byId(c, 'c1').chapterNote, '空檔 0.50s < 2s，從 #3 起點開始蓋 2.5s');
  assert.ok(c.warnings.includes('[c1 chapter] #3 前的空檔只有 0.50s（< 2s），章節 2.5s 會壓到 #3 的人聲 → 回剪乾淨保留 3 秒停頓：cuts.md 的章節空檔表加這一章，再跑 node shared/template/tools/media.mjs ng-snap --project projects/範例，照它印的指令重剪'), c.warnings.join('\n'));
  assert.ok(!formatReport(c).includes('人聲在下面繼續'));
  // 字幕避開章節：#3（10.5–13.0）整句被章節蓋住
  assert.deepEqual(c.blackout, [[10.5, 13]]);
  assert.deepEqual(c.chapters[0].captionsClipped, [3]);
  assert.match(formatReport(c), /字幕避開章節：#3 整句不顯示/);
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

test('子母畫面裁切：講者置中用預設框，偏右時以講者框為中心（432×324，4:3）', () => {
  assert.deepEqual(pipGeometry('auto', [700, 200, 1220, 1000]).style, { left: -122, top: -49, width: 676, height: 380 });
  const g = pipGeometry('auto', [1000, 300, 1600, 980]);
  assert.ok(g.crop.x + g.crop.w <= 1920 && g.crop.y + g.crop.h <= 1080);
  assert.ok(Math.abs(g.crop.w / g.crop.h - 4 / 3) < 1e-6);
  assert.equal(pipGeometry([0, 0, 1920, 1080]).style.width, 432);
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
  // v2 轉場（design-system §5）：全畫面由色帶帶路擦開（host clip-path＋兩條色帶 0.62 s expo.inOut），子母畫面不跟著擦；
  // 前一格講者滿版 → 子母畫面從講者原位飛入（0.75 s power3.inOut），0.62 s 外框彈出落地；段尾色帶反向收、子母畫面 0.3 s 淡出
  assert.match(html, /tl\.fromTo\('#el-s02', \{ clipPath: 'inset\(0% 0% 0% 110\.4%\)' \}, \{ clipPath: 'inset\(0% 0% 0% 0%\)', duration: 0\.62, ease: 'expo\.inOut' \}, 18\.5\);/);
  assert.match(html, /tl\.fromTo\('#tx0a', \{ x: 1920 \}, \{ x: -198, duration: 0\.62, ease: 'expo\.inOut' \}, 18\.5\);/);
  assert.match(html, /<i id="tx0b" class="v2-tx v2-tx--b" style="left:0;transform:translateX\(2070px\)"><\/i>/);
  const c = res.globals.pip.crop, k = (x) => String(r3(x)).replace('.', '\\.');
  assert.match(html, new RegExp(`tl\\.fromTo\\('#pip-s02', \\{ x: ${k(c.x - 1424)}, y: ${k(c.y - 594)}, scale: ${k(c.w / 432)}, transformOrigin: '0 0' \\}, \\{ x: 0, y: 0, scale: 1, duration: 0\\.75, ease: 'power3\\.inOut' \\}, 18\\.5\\);`));
  assert.match(html, /tl\.fromTo\('#pipf-s02', \{ opacity: 0, scale: 1\.04, transformOrigin: '1640px 756px' \}, \{ opacity: 1, scale: 1, duration: 0\.35, ease: 'back\.out\(2\)' \}, 19\.12\);/);
  const s2 = byId(res, 's02'), back = r3(s2.end - 0.5);
  assert.ok(html.includes(`tl.fromTo('#el-s02', { clipPath: 'inset(0% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 110.4%)', duration: 0.5, ease: 'expo.inOut', immediateRender: false }, ${back});`));
  assert.ok(html.includes(`tl.fromTo('#pip-s02, #pipf-s02', { opacity: 1 }, { opacity: 0, duration: 0.3, ease: 'sine.in', immediateRender: false }, ${back});`));
  assert.deepEqual([s2.txIn, s2.txOut], ['wipe', 'retract']);
  assert.deepEqual(byId(res, 's02').pipPieces.map((p) => [p.enter, p.exit]), [['fly', 'layer']]);
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

test('音效：不存在的名稱 → ✖ 列出 kit/sfx.json 的段落音效（不含配樂）；配樂寫在段落 ✖', () => {
  const res = run([{ id: 's01', scene: 'concept', from: '#2', to: '#3e', slots: { text: '一' }, sfx: 'boom' }]);
  const e = res.errors.find((x) => /sfx：只能是/.test(x));
  assert.ok(e);
  const names = Object.keys(L.sfx).filter((k) => L.sfx[k].kind !== 'bgm');
  for (const n of names) assert.ok(e.includes(n), n);
  assert.ok(!e.includes('bgm-outro'));
  const r2 = run([{ id: 's05', scene: 'concept', from: '#2', to: '#3e', slots: { text: '一' }, sfx: 'bgm-outro' }]);
  assert.ok(r2.errors.includes('[s05 concept] sfx：「bgm-outro」是配樂，不能當段落音效 → 結尾配樂寫在 plan.json 第一層的 "outro"（例 "outro": { "from": "#120" }）'), r2.errors.join('\n'));
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

// ---------- 002 pipeline-timing（specs/002-pipeline-timing/tasks.md）----------
const { outroClip, outroLine, jsonItems, jsonTop } = await imp('lib/plan.mjs');
const { parseTime, cueSeconds } = await imp('lib/time.mjs');

test('第一層 rhythm／outro／look 是認得的欄位；rhythm 寫錯 ✖ 原文；look 型別錯 ✖', () => {
  const ok = run([], { rhythm: 'spaced', look: false, outro: { from: '#11' } });
  assert.ok(!ok.errors.some((e) => /第一層沒有/.test(e)), ok.errors.join('\n'));
  assert.ok(run([], { rhythm: 'dense' }).errors.includes('rhythm 只能是 "continuous"（預設，照 style.md 連續覆蓋）或 "spaced"（要留露臉空檔），現在是 "dense" → 刪掉 rhythm，或改成 "continuous"／"spaced"'));
  assert.ok(run([], { look: true }).errors.some((e) => e.startsWith('plan.json 的 look 要是物件或 false')));
});

test('continuous：沒有畫面的區間、講者閃一下 ⚠（附 to）；0.03 s 不報；spaced 時改報舊的兩條', () => {
  const scenes = [
    { id: 's01', scene: 'concept', from: '#1', to: '#2e', slots: { text: '一' } },
    { id: 's02', scene: 'concept', from: '#3', to: '#4e', slots: { text: '二' } },
    { id: 's03', scene: 'key-point', from: 14.53, to: '#6e', slots: { key: '三' } },
  ];
  const c = run(scenes);
  assert.equal(c.rhythm, 'continuous');
  assert.ok(c.warnings.includes('[s02 concept] 和前一段 s01 之間只空 0.50s，講者會閃一下 → s01 改 "to": "#3"（0 秒相接），或拉開到 1.0s 以上'), c.warnings.join('\n'));
  assert.ok(!c.warnings.some((w) => w.startsWith('[s03') && /閃一下/.test(w)), '0.03 s 不報');
  assert.deepEqual(c.uncovered, [{ start: 21.5, end: 42.5, len: 21 }]);
  assert.ok(c.warnings.some((w) => w.startsWith('沒有畫面的區間共 1 段、21.00s → 照 style.md「連續覆蓋」')));
  assert.ok(!c.warnings.some((w) => /只露臉|開場前 30 秒/.test(w)));
  const rep = formatReport(c, { videoDur: VD });
  assert.match(rep, /\n節奏：continuous（連續覆蓋：每段口播都要有畫面；要留露臉空檔就在 plan\.json 寫 "rhythm": "spaced"）\n沒有畫面的區間（> 1\.0s）：0:21\.50–0:42\.50（21\.00s）；共 21\.00s，佔口播 50\.6%/);
  const s = run(scenes, { rhythm: 'spaced' });
  assert.ok(s.warnings.some((w) => /\[s02 concept\] 和前一段 s01 之間只露臉 0\.5s/.test(w)));
  assert.ok(s.warnings.some((w) => /開場前 30 秒已經有 3 張/.test(w)));
  assert.ok(!s.warnings.some((w) => /閃一下|沒有畫面的區間共/.test(w)));
  assert.match(formatReport(s), /節奏：spaced（留露臉空檔：開場前 30 秒最多一張、兩段之間至少露臉 3 秒）/);
  // 補到 0 秒相接、蓋滿：沒有區間
  const full = run([{ id: 's01', type: 'fx', fx: 29, bg: 'dark', from: '#1', to: '#12e', vars: { number: '1' } }]);
  assert.deepEqual(full.uncovered, []);
  assert.match(formatReport(full), /沒有畫面的區間（> 1\.0s）：無/);
});

test('只有聲音：沒蓋住 0.3 s ⚠、1.2 s ✖；報告行寫 ⚠／✖；JSON voiceUncovered 有 level', () => {
  const res = resolvePlan({ plan: { version: 1, speakerBox: [700, 200, 1220, 1000], scenes: [
    { id: 'f1', type: 'fx', fx: 29, bg: 'dark', from: 20, to: 25, vars: { number: '1' } },
    { id: 'f2', type: 'fx', fx: 29, bg: 'dark', from: 25.3, to: 28.8, vars: { number: '2' } },
  ] }, cues, videoDur: VD, lib: L, outDir: os.tmpdir(), voiceOnly: [[20, 30]] });
  assert.ok(res.warnings.includes('只有聲音的區間 0:25.00–0:25.30 有 0.3s 是黑畫面 → 把前一段的 to 延到下一段的 from（0 秒相接）'), res.warnings.join('\n'));
  assert.ok(res.errors.some((e) => e.startsWith('只有聲音的區間 0:28.80–0:30.00 有 1.2s 沒有畫面')));
  assert.match(formatReport(res), /只有聲音（rough\.mp4 0:20\.00–0:30\.00，10s）：⚠ 0:25\.00–0:25\.30、✖ 0:28\.80–0:30\.00 沒被蓋住/);
  assert.deepEqual(jsonTop(res).voiceUncovered.map((g) => [g.start, g.end, g.level]), [[25, 25.3, 'warn'], [28.8, 30, 'error']]);
});

test('子母畫面進場／出場＋章節墊底：透明卡→04a＝fly；04a→04a＝none；04a→章節（相隔 0.5 s）＝墊底、fade 0.5；章節→04a（相隔 1 s）＝章節墊底、fade', () => {
  const res = run([
    { id: 's01', scene: 'concept', from: '#1', to: '#2e', slots: { text: '一' } },
    { id: 's02', scene: 'fs-list', from: '#3', to: '#5', slots: { title: 'A', items: ['一', '二', '三'] } },
    { id: 's03', scene: 'fs-list', from: '#5', to: '#7e', slots: { title: 'B', items: ['一', '二', '三'] } },
    { id: 'c1', scene: 'chapter', at: '#8', slots: { num: '01', title: '章' } },
    { id: 's04', scene: 'fs-list', from: '#9', to: '#10e', slots: { title: 'C', items: ['一', '二', '三'] } },
  ]);
  assert.deepEqual(res.errors, []);
  const m = (id) => byId(res, id).pipPieces.map((p) => [p.enter, p.exit, p.exitDur]);
  assert.deepEqual(m('s02'), [['fly', 'none', 0]]);
  assert.deepEqual(m('s03'), [['none', 'fade', 0.5]]);
  assert.deepEqual(m('s04'), [['fade', 'layer', 0]]);
  const s03 = byId(res, 's03'), c1 = byId(res, 'c1'), s04 = byId(res, 's04');
  assert.equal(c1.start, 25.5);
  assert.deepEqual([s03.end, s03.fadeOut, s03.holdFor, c1.fadeIn], [26, false, 'c1', true]);
  assert.deepEqual([c1.end, c1.fadeOut, c1.holdFor, s04.fadeIn], [29.5, false, 's04', true]);
  const rep = formatReport(res);
  assert.match(rep, /s03｜.*墊在 c1 章節下面 0\.50s（不淡出）/);
  assert.match(rep, /c1｜.*墊在 s04 下面 0\.50s（不淡出）/);
  // JSON：layout 與 out.pip
  const j = jsonItems(res);
  assert.deepEqual(j.find((x) => x.id === 's02').out.pip, [{ start: 8, end: 15, enter: 'fly', exit: 'none' }]);
  assert.deepEqual(['s01', 's02', 'c1'].map((id) => j.find((x) => x.id === id).layoutZh), ['疊加', '子母畫面', '全幕']);
  assert.deepEqual(jsonTop(res).chapters.map((c) => [c.id, c.cue, c.start, c.end, c.placement]), [['c1', 8, 25.5, 28, 'cover']]);
});

test('擦入擦出：只在只有聲音的區間、media↔動畫幕；in 0.2 → 不擦出＋note；圖片可以；相鄰 media 疊化 0.47 s', () => {
  const pdir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-wipe-'));
  for (const f of ['素材/圖片/a.png', '素材/圖片/b.png', '素材/螢幕錄影/v.mp4']) { fs.mkdirSync(path.dirname(path.join(pdir, f)), { recursive: true }); fs.writeFileSync(path.join(pdir, f), ''); }
  const probe = (f) => (f.endsWith('.mp4') ? { width: 1920, height: 1080, duration: 30, hasAudio: false } : { width: 1920, height: 1080 });
  const go = (scenes) => resolvePlan({ plan: { version: 1, speakerBox: [700, 200, 1220, 1000], scenes }, cues, videoDur: VD, lib: L, outDir: os.tmpdir(), projectDir: pdir, probe, voiceOnly: [[10, 30]] });
  const base = (vin) => [
    { id: 'm1', type: 'media', src: '素材/圖片/a.png', from: 10, to: 20 },
    { id: 'f1', type: 'fx', fx: 29, bg: 'dark', from: 20, to: 25, vars: { number: '1' } },
    { id: 'm2', type: 'media', src: '素材/螢幕錄影/v.mp4', from: 25, to: 30, in: vin },
  ];
  const a = go(base(2));
  assert.deepEqual(a.errors, []);
  const f1 = byId(a, 'f1'), m1 = byId(a, 'm1'), m2 = byId(a, 'm2');
  assert.deepEqual([f1.wipeIn, f1.wipeOut, f1.z, f1.end, m1.postroll, m2.preroll], [true, true, 31, 25, 0.5, 0.5]);
  const rep = formatReport(a);
  assert.match(rep, /從 m1 擦入 0\.45s（m1 錄影多播 0\.50s）/);
  assert.match(rep, /擦出到 m2 0\.45s（m2 錄影提早 0\.50s 開始）/);
  assert.deepEqual(jsonItems(a).find((x) => x.id === 'f1').out.wipe, { in: true, out: true, preroll: 0, postroll: 0 });
  const b = go(base(0.2));
  assert.equal(byId(b, 'f1').wipeOut, undefined);
  assert.match(formatReport(b), /不擦出：m2 的 in 只有 0\.20s，提早不了 0\.5s → in 改 ≥ 0\.5 才有擦出（現在硬切）/);
  // 相鄰兩段 media：疊化，前一段墊在底下 0.47 s，不算整張幕重疊
  const c = go([{ id: 'm1', type: 'media', src: '素材/圖片/a.png', from: 10, to: 20 }, { id: 'm3', type: 'media', src: '素材/圖片/b.png', from: 20, to: 30 }]);
  assert.deepEqual(c.errors, []);
  assert.deepEqual([byId(c, 'm3').xfade, byId(c, 'm1').end, byId(c, 'm1').wipeOut, byId(c, 'm3').wipeIn], [0.47, 20.47, undefined, undefined]);
  // 章節不擦；講者段（只有聲音以外）不擦
  const d = go([{ id: 'm1', type: 'media', src: '素材/圖片/a.png', from: 4, to: 8 }, { id: 'f1', type: 'fx', fx: 29, bg: 'dark', from: 8, to: 9.5, vars: { number: '1' } }]);
  assert.equal(byId(d, 'f1').wipeIn, undefined);
  fs.rmSync(pdir, { recursive: true });
});

test('情境動畫綁句：P.at 的句號換成秒數；註解不算；不是句號 ✖、找不到 ✖、段外 ⚠；同一支 src 兩段 ✖；報告 note', () => {
  const od = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-cue-'));
  fs.mkdirSync(path.join(od, 'compositions'));
  fs.writeFileSync(path.join(od, 'compositions', 'x-flow.html'), `<!doctype html><html><body><template id="x-flow-template"><div id="x-flow" data-composition-id="x-flow"></div><script>
  // 例：P.at('#77')
  const tl = gsap.timeline({ paused: true }); /* P.at('#66') */
  P.in('#a', P.at('#3')); P.in('#b', P.at("#3@字幕", 0.2)); P.in('#c', P.at('#99')); P.in('#d', P.at('3.2')); P.in('#e', P.at('#11'));
  window.__timelines['x-flow'] = tl;
  </script></template></body></html>`);
  const res = resolvePlan({ plan: { version: 1, speakerBox: [700, 200, 1220, 1000], scenes: [
    { id: 'x01', type: 'custom', src: 'compositions/x-flow.html', layout: 'overlay', from: '#2', to: '#4e' },
    { id: 'x02', type: 'custom', src: 'compositions/x-flow.html', layout: 'overlay', from: '#6', to: '#7e' },
  ] }, cues, videoDur: VD, lib: L, outDir: od });
  const x01 = res.allItems.find((x) => x.id === 'x01');
  assert.deepEqual(x01.cueRefs, { '#3': 8, '#3@字幕': r3(cueSeconds(parseTime('#3@字幕'), cues).sec), '#11': 36 });
  assert.ok(res.errors.some((e) => e.startsWith("[x01 custom] compositions/x-flow.html 的 P.at('#99')：") && e.includes('字幕沒有第 99 句')), res.errors.join('\n'));
  assert.ok(res.errors.includes("[x01 custom] compositions/x-flow.html 的 P.at('3.2')：只能寫句號（#N、#Ne、#N±秒、#N@詞）→ 秒數直接寫數字 P.in(sel, 3.2)，要綁句就寫 P.at('#18')"));
  assert.ok(res.warnings.includes("[x01 custom] P.at('#11') 在 0:36.00，不在這段 0:04.50–0:14.50 裡 → 改綁這段裡的句子，或把 plan.json 這段的 to 延長"));
  assert.ok(res.errors.includes('[x02 custom] src「compositions/x-flow.html」已經給 x01 用了 → 複製成另一個檔名（例 x-flow-2.html，template id 與 data-composition-id 一起改），兩段各用一支'));
  assert.ok(!Object.keys(x01.cueRefs).includes('#77') && !Object.keys(x01.cueRefs).includes('#66'));
  assert.match(formatReport(res), /綁句 3 個（#3、#3@字幕、#11）/);
  fs.rmSync(od, { recursive: true });
});

test('outro：錯誤原文 5 種；起點、對齊片尾、淡入淡出取 min；報告行', () => {
  const e = (o) => run([], { outro: o }).errors;
  assert.ok(e({ from: '#11', music: 'pop' }).includes('outro.music：「pop」不是配樂（可用：bgm-outro）→ 改成可用的配樂名稱，或寫 null 不配'));
  assert.ok(e({ from: '12' }).includes('outro.from：要寫 "#N" 或 "#N@詞"（結語金句講完後那一句），現在是 "12" → 改成收尾那一句的句號，例 "#120"'));
  assert.ok(e({ from: '#11', volume: 9 }).includes('outro.volume 要是 −20～+6 的 dB 數字（0＝預設），現在是 9 → 改成 −20～+6 之間的數字，或刪掉這個欄位用預設'));
  assert.ok(e({ from: '#11', fadeOut: 11 }).includes('outro.fadeOut 要是 0–10 的秒數（不寫＝用 kit/sfx.json 的 fadeOut），現在是 11 → 改成 0–10 之間的秒數，或刪掉這個欄位用預設'));
  assert.ok(e({ from: '#11', gain: 1 }).includes('outro 不能有「gain」→ 只能寫 from、music、volume、fadeOut'));
  const res = run([], { outro: { from: '#11' } });
  assert.deepEqual(res.errors, []);
  assert.deepEqual([res.outro.music, res.outro.start, res.outro.span, res.outro.fadeIn, res.outro.fadeOut], ['bgm-outro', 36, 8, L.sfx['bgm-outro'].fadeIn, L.sfx['bgm-outro'].fadeOut]);
  const long = outroClip(res.outro, 40, VD);
  assert.deepEqual([long.aligned, long.at, long.dur, long.fadeIn, long.fadeOut], ['from', 36, 8, r3(8 / 3), Math.min(L.sfx['bgm-outro'].fadeOut, r3(8 / 3))]);
  const short = outroClip(res.outro, 5, VD);
  assert.deepEqual([short.aligned, short.at, short.dur], ['end', 39, 5]);
  assert.equal(outroLine(res.outro, short), '結尾配樂：bgm-outro 只有 5.0 秒，比 outro.from（#11，0:36.00）到片尾的 8.0 秒短，改從 0:39.00 起播、對齊片尾');
  assert.match(outroLine(res.outro, long), /^結尾配樂：bgm-outro 從 0:36\.00 起播 8\.0 秒（淡入 2\.67 秒、淡出 1\.85 秒，比人聲小 11\.0 dB）$/);
  assert.equal(outroLine(run([], { outro: { from: '#11', music: null } }).outro, null), '結尾配樂：outro.music 是 null，不配');
});

test('custom 的 clicks：+秒與句號各一顆 click（附加音效）；超出段 ✖；sfxExtra false 不加', () => {
  const od = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-click-'));
  fs.mkdirSync(path.join(od, 'compositions'));
  fs.writeFileSync(path.join(od, 'compositions', 'x-c.html'), `<template><div id="x-c" data-composition-id="x-c"></div><script>window.__timelines['x-c'] = gsap.timeline({ paused: true });</script></template>`);
  const go = (extra) => resolvePlan({ plan: { version: 1, scenes: [{ id: 'x01', type: 'custom', src: 'compositions/x-c.html', layout: 'overlay', from: '#2', to: '#4e', ...extra }] }, cues, videoDur: VD, lib: L, outDir: od });
  const a = go({ clicks: ['+1', '#3'] });
  const x = a.allItems[0];
  assert.deepEqual(x.sfxExtra.map((c) => [c.name, c.event]), [['click', 5.5], ['click', 8]]);
  assert.ok(go({ clicks: ['+20'] }).errors.includes('[x01 custom] clicks[0]（0:24.50）不在這段 0:04.50–0:14.50 裡 → 改成這段範圍內的句號或 +秒數'));
  assert.ok(go({ clicks: '+1' }).errors.some((e) => e.endsWith('clicks 要寫成陣列，例如 ["+3.2", "#21@安裝"] → 一顆點擊一個元素，只有一顆也要加 [ ]')));
  assert.deepEqual(go({ clicks: ['+1'], sfxExtra: false }).allItems[0].sfxExtra, []);
  fs.rmSync(od, { recursive: true });
});

// ---------- round 2：F1 常駐章節角標 ----------
test('常駐章節角標（F1）：02 段起點→下一章；子母畫面／全幕期間隱藏；chapters[] 把 02 段也算章節；chtag ⚠；chapterBadge:false 關掉', () => {
  const scenes = [
    { id: 'c01', scene: 'chapter-tag', from: '#2', to: '#3e', slots: { num: '01', name: '痛點' } },
    { id: 's01', scene: 'concept', from: '#2', to: '#3e', chtag: true, slots: { text: '甲乙丙丁' } },
    { id: 's02', scene: 'fs-list', from: '#4', to: '#5e', slots: { title: '清單', items: ['一', '二', '三'] } },
    { id: 's03', scene: 'concept', from: '#6', to: '#7e', slots: { text: '戊己庚辛' } },
    { id: 's04', scene: 'chapter', at: '#9', slots: { num: '02', title: '解法' } },
    { id: 's05', scene: 'concept', from: '#10', to: '#11e', slots: { text: '壬癸子丑' } },
  ];
  const res = run(scenes);
  assert.deepEqual(res.errors, []);
  const c01 = byId(res, 'c01'), s02 = byId(res, 's02'), ch = byId(res, 's04');
  assert.equal(c01.noHost, true);
  assert.equal(res.chapterBadge, true);
  assert.deepEqual(res.chapters.map((c) => [c.id, c.kind, c.num]), [['c01', 'tag', '01'], ['s04', 'chapter', '02']]);
  assert.deepEqual(res.chapters[0].badge, [[c01.start, s02.start], [s02.end, ch.start]]);
  assert.deepEqual(res.chapters[1].badge, [[ch.end, VD]]);
  assert.ok(byId(res, 's01').warnings.some((w) => w.includes('chtag：不用寫，角標現在自動常駐 → 刪掉 "chtag": true（要舊的附件角標，plan.json 第一層寫 "chapterBadge": false）')));
  // 主合成：c01 不放 host（音效照放）、角標一個 clip、在子母畫面段淡出 0.3 秒
  const cap = buildCaptions(cues, { duration: VD });
  const { html } = buildMain({ items: res.items, videoDur: VD, captions: cap, pip: res.globals.pip, badges: res.badges });
  assert.ok(!html.includes('id="el-c01"'));
  assert.ok(html.includes('id="sfx-c01"'));
  assert.match(html, /<div id="chb-1" class="sc-chtag" data-chapter-badge="4\.5–[\d.]+" style="right:96px;top:56px;z-index:25;opacity:0">/);
  assert.ok(html.includes("tl.set('#chb-1', { opacity: 0 }, 0);"), '時間 0 先透明（不是 clip，靠 opacity）');
  assert.ok(html.includes(`tl.fromTo('#chb-1', { opacity: 1 }, { opacity: 0, duration: 0.3, ease: 'sine.in', immediateRender: false }, ${s02.start});`));
  // 第一次露出同 02 模板：由右擦開 0.35 → 0.12 號碼彈出 → 0.2 章名逐字（kit 的 P.*，root＝#chb）
  for (const x of ["tl.set('#chb-1', { opacity: 1 }, 4.5);", "P.wipe('#chb-1', 4.5, { dir: 'right', dur: 0.35 });", "P.pop('#chb-1 .sc-chtag__num', 4.62, { from: 0.4, dy: 0 });", "P.chars('#chb-1 .sc-chtag__name', 4.7);", "const P = SceneMotion(tl, document.getElementById('chb'));"]) assert.ok(html.includes(x), x);
  // 第二次（子母畫面段之後回來）只淡入；章節結束向右擦掉
  assert.ok(html.includes(`tl.fromTo('#chb-1', { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'sine.in', immediateRender: false }, ${s02.end});`.replace("'sine.in'", "'sine.out'")));
  assert.ok(html.includes(`P.wipeOut('#chb-1', ${r3(ch.start - 0.3)}, { dir: 'right' });`));
  assert.match(html, /<span class="sc-chtag__num">02<\/span>/);
  // --test 從子母畫面中間開始：角標一開始就是透明的
  const mid = buildMain({ items: res.items, videoDur: VD, captions: cap, pip: res.globals.pip, badges: res.badges, test: { t0: s02.start + 1, len: 3 } });
  assert.ok(mid.html.includes("tl.set('#chb-1', { opacity: 0 }, 0);"));
  // 關掉：沒有角標、02 段照舊放 host、chtag 不 ⚠
  const off = run(scenes, { chapterBadge: false });
  assert.deepEqual(off.badges, []);
  assert.ok(!byId(off, 'c01').noHost);
  assert.ok(!off.warnings.some((w) => w.includes('chtag：不用寫')));
  assert.deepEqual(off.chapters.map((c) => c.id), ['s04']);
  assert.ok(run(scenes, { chapterBadge: 'yes' }).errors.includes('chapterBadge 只能是 true 或 false（不寫＝true：章節角標自動常駐右上角），現在是 "yes" → 不要常駐角標就寫 false，否則刪掉這個欄位'));
});

// 範例專案第一次試剪（2026-10-31，projects/範例/work.trial1）的固定檔：plan.json（sha1 931c64f3…）、rough.srt、transcript.json、3 支情境動畫
// 回歸測試：F1 角標覆蓋、F4 回饋表 13 列都要 ✖（不依賴 live 專案）
const EX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'example-trial1', 'work');
const exRun = async () => {
  const { attachWords } = await imp('build.mjs');
  const cs = attachWords(parseSrt(fs.readFileSync(path.join(EX, 'rough.srt'), 'utf8')), { transcript: path.join(EX, 'transcript.json') });
  return resolvePlan({ plan: JSON.parse(fs.readFileSync(path.join(EX, 'hyperframes', 'plan.json'), 'utf8')), cues: cs, videoDur: 153.543, lib: L, outDir: path.join(EX, 'hyperframes'), projectRel: 'projects/範例' });
};

test('範例 c01–c04（F1）：每章的角標區間蓋到這章所有疊加段（扣掉不透明段）', async () => {
  const res = await exRun();
  const tags = res.chapters.filter((c) => c.kind === 'tag');
  assert.deepEqual(tags.map((c) => c.id), ['c01', 'c02', 'c03', 'c04']);
  const opaque = res.items.filter((x) => x.opaque).map((x) => [x.start, x.end]);
  tags.forEach((c, i) => {
    const end = tags[i + 1]?.start ?? res.outro?.start ?? VD;
    for (const it of res.items.filter((x) => !x.opaque && x.key !== 'chapter-tag' && x.start >= c.start - 1e-6 && x.start < end)) {
      // 這段實際露出的部分（扣掉不透明段、限在本章）都要在角標區間裡
      let parts = [[Math.max(it.start, c.start), Math.min(it.end, end)]];
      for (const [a, b] of opaque) parts = parts.flatMap(([s, e]) => (b <= s || a >= e ? [[s, e]] : [[s, a], [b, e]].filter(([x, y]) => y - x > 1e-3)));
      for (const [s, e] of parts) assert.ok(c.badge.some(([a, b]) => s >= a - 1e-6 && e <= b + 1e-6), `${c.id} 的角標 ${JSON.stringify(c.badge)} 沒蓋到 ${it.id} ${s}–${e}`);
    }
  });
});

// ---------- round 2：F4 文字對時 ----------
test('文字對時（F4）：主文字比講到早 > 1.5 s ✖、0.6–1.5 s ⚠，訊息直接給 #N@詞；綁好就不報；2 字的詞到處都有時不猜', () => {
  const cs = parseSrt('1\n00:00:01,000 --> 00:00:04,000\n手機畫面太小\n\n2\n00:00:04,500 --> 00:00:08,000\n一定要放到電腦才看得出問題\n\n3\n00:00:08,500 --> 00:00:12,000\n第三句\n');
  const go = (seg) => resolvePlan({ plan: { version: 1, scenes: [{ id: 's07', scene: 'key-point', from: '#1', to: '#2e', slots: { lead: '手機畫面太小', key: '放到電腦才看得出' }, ...seg }] }, cues: cs, videoDur: 20, lib: L, outDir: os.tmpdir() });
  const all = (r) => [...r.errors, ...r.warnings].filter((m) => m.startsWith('文字對時'));
  const bad = go({});
  assert.deepEqual(all(bad), ['文字對時：s07 的 key「放到電腦才看得出」在 0:01.15 出現，「放到電腦」0:05.31（#2）才講到 → beats.keyAt 寫 "#2@放到電腦"（沒有詞級逐字稿，講到的秒數用字數比例估）']);
  assert.ok(bad.errors.includes(all(bad)[0]));
  assert.deepEqual(all(go({ beats: { keyAt: '#2@放到電腦' } })), []);
  const w = go({ beats: { keyAt: '#2@放到電腦-1' } });
  assert.deepEqual(w.errors, []);
  assert.ok(w.warnings.includes('文字對時：s07 的 key「放到電腦才看得出」在 0:04.31 出現，「放到電腦」0:05.31（#2）才講到 → beats.keyAt 寫 "#2@放到電腦"（沒有詞級逐字稿，講到的秒數用字數比例估）'));
  // makeSrt 每句都有「字幕」：只對到 2 個字而且不只一句 → 不報
  assert.ok(!run([{ id: 's01', scene: 'concept', from: '#2', to: '#3e', slots: { text: '轉字幕' } }]).errors.some((m) => m.startsWith('文字對時')));
});

test('文字對時：至少對到 3 字（中文連續 3 字、英文／數字整個 token、中文數字＝阿拉伯數字）才報；plan 第一層 "check": { "textSync": false } 整條跳過', async () => {
  const { spokenAt } = await imp('lib/plan.mjs');
  const cs = parseSrt('1\n00:00:01,000 --> 00:00:04,000\n這是我常用的 AI 工具\n\n2\n00:00:04,500 --> 00:00:08,000\nPodcast 錄一小時\n\n3\n00:00:08,500 --> 00:00:12,000\n字幕會出現在這個位置\n');
  const at = (t) => spokenAt(t, cs, { near: 0 });
  assert.equal(at('工具'), null, '中文 2 字不報');
  assert.equal(at('AI'), null, '英文 2 字的 token 不報');
  assert.equal(at('Podc'), null, '英文不從 token 中間對');
  assert.deepEqual([at('AI 工具').kw, at('Podcast').kw, at('一小時').kw], ['AI 工具', 'Podcast', '一小時']);
  assert.equal(at('重點會疊在這個位置').kw, '在這個位');
  // 數量詞：中文數字當 0–9、數字後的「個」不算（範例 s22「1 小時」↔「一個小時」）
  assert.equal(at('1 小時').kw, '一小時');
  assert.equal(spokenAt('3 個步驟', parseSrt('1\n00:00:01,000 --> 00:00:04,000\n總共三個步驟\n'), { near: 0 }).kw, '三個步驟');
  // 示意 plan（qc.mjs framing --cards）：關掉文字對時；check 只收 textSync（布林）
  const plan = (extra) => ({ version: 1, ...extra, scenes: [{ id: 'c1', scene: 'key-point', from: '#1', to: '#3e', slots: { lead: '示意', key: '重點會疊在這個位置' } }] });
  const go = (extra) => resolvePlan({ plan: plan(extra), cues: cs, videoDur: 20, lib: L, outDir: os.tmpdir() });
  assert.ok(go({}).errors.some((m) => m.startsWith('文字對時：c1 的 key')));
  const off = go({ check: { textSync: false } });
  assert.ok(![...off.errors, ...off.warnings].some((m) => m.startsWith('文字對時')), off.errors.join('\n'));
  assert.deepEqual(go({ check: { textSync: 'no', x: 1 } }).errors.filter((m) => m.startsWith('check')), ['check 沒有「x」這個欄位（只有 textSync）→ 刪掉', 'check.textSync 只能是 true 或 false，現在是 "no" → 正式 plan.json 刪掉這個欄位']);
  assert.ok(go({ check: [] }).errors.includes('check 要是物件（例 "check": { "textSync": false }），現在是 [] → 正式 plan.json 不用寫這個欄位，刪掉'));
});

test('範例的 13 列（F4 回饋表）：--check 全部 ✖', async () => {
  const res = await exRun();
  const rows = [['s03', 'key'], ['s06', 'key'], ['s07', 'key'], ['s11', 'text'], ['s13', 'text'], ['s14', 'text'], ['s17', 'key'], ['s18', 'text'],
    ['s21', 'items[0]'], ['s21', 'items[1]'], ['s22', 'fx vars.text'], ['s23', 'items[0]'], ['s24', 'fx vars.text']];
  for (const [id, f] of rows) assert.ok(res.errors.some((e) => e.startsWith(`文字對時：${id} 的 ${f}「`)), `${id} ${f} 沒有 ✖`);
  assert.ok(res.errors.includes('文字對時：s07 的 key「放到電腦才看得出」在 0:28.84 出現，「到電腦」0:34.84（#20）才講到 → beats.keyAt 寫 "#20@到電腦"'));
  assert.ok(res.errors.includes('文字對時：s22 的 fx vars.text「1 小時」在 2:08.78 出現，「一個小時」2:12.87（#64）才講到 → from 寫 "#64@一個小時"'), '中文數字＝阿拉伯數字');
});

test('v2 轉場（design-system §5）：txIn／txOut 分類；換卡不換景（舊的幕多留 0.3 s、z＋1、只留內容區往左擦掉）；章節色塊斜擦；--check 報 items[].out.tx 與「轉場：」一行', async () => {
  const { jsonItems, TX_IN, TX_OUT } = await imp('lib/plan.mjs');
  const res = run([
    { id: 's01', scene: 'concept', from: '#1', to: '#3', slots: { text: '甲乙丙丁' } },
    { id: 'a01', scene: 'fs-list', from: '#3', to: '#5', slots: { title: '清單', items: ['一', '二', '三'] } },
    { id: 'a02', scene: 'fs-compare', from: '#5', to: '#6e', slots: { title: '比較', leftHead: '左', rightHead: '右', left: ['一', '二'], right: ['三', '四'] } },
    { id: 'c01', scene: 'chapter', from: '#8', slots: { num: '01', title: '第一章' } },
    { id: 's02', scene: 'concept', from: '#10', to: '#11e', slots: { text: '戊己庚辛' } },
  ]);
  assert.deepEqual(res.errors, []);
  const tx = (id) => [byId(res, id).txIn, byId(res, id).txOut];
  assert.deepEqual(tx('s01'), ['band', 'cover']);
  assert.deepEqual(tx('a01'), ['wipe', 'swap']);
  assert.deepEqual(tx('a02'), ['swap', 'retract']);
  assert.deepEqual(tx('c01')[0], 'chapter');
  assert.deepEqual(tx('s02'), ['band', 'band']);
  for (const it of res.items) { assert.ok(TX_IN.includes(it.txIn), it.txIn); assert.ok(TX_OUT.includes(it.txOut), it.txOut); }
  assert.deepEqual(jsonItems(res).find((x) => x.id === 'a01').out.tx, { in: 'wipe', out: 'swap', prev: 'speaker' });
  // prev（給 04 家族與 custom 選進場）：前面露講者＝speaker、前一段也是全畫面＝fullscreen
  assert.deepEqual(['s01', 'a01', 'a02', 'c01'].map((id) => byId(res, id).prev), ['speaker', 'speaker', 'fullscreen', 'speaker']);
  const { assembleScene } = await imp('lib/assemble.mjs');
  const a02 = byId(res, 'a02');
  const asm = assembleScene({ scene: a02.scene, ctx: a02.resolved.ctx, beats: a02.resolved.beats, id: 'a02', D: a02.D, tone: a02.resolved.tone, exitFade: a02.exitFade, chapter: a02.chapter, prev: a02.prev });
  assert.match(asm.html, /<div id="a02-fs-compare" data-composition-id="a02-fs-compare"[^>]* data-prev="fullscreen">/);
  assert.match(formatReport(res), /\n轉場：色帶擦開 1（a01）；換卡不換景 1（a02）；色帶收回 1（a02）；疊加卡＋講者慢推 2（s01、s02）；章節色塊 1（c01）｜主題：亮色$/m);
  const a01 = byId(res, 'a01'), c01 = byId(res, 'c01');
  const { html } = buildMain({ items: res.items, videoDur: VD, captions: buildCaptions(cues, { duration: VD }), pip: res.globals.pip, speakerBox: res.globals.speakerBox });
  // 換卡：a01 的 host 多 0.3 s、z 31；接縫那一刻只留內容區，再 0.3 s power2.in 往左擦掉（之前沒有 clip）
  assert.match(html, new RegExp(`id="el-a01"[^>]*data-duration="${r3(a01.end - a01.start + 0.3)}"[^>]*data-prev="speaker" style="z-index:31"`));
  assert.match(html, /id="el-a02"[^>]*data-prev="fullscreen"/);
  assert.ok(html.includes(`tl.fromTo('#el-a01', { clipPath: 'inset(0px 0px 0px 0px)' }, { clipPath: 'inset(96px 516px 186px 96px)', duration: 0.001, ease: 'none', immediateRender: false }, ${a01.end});`));
  assert.ok(html.includes(`tl.fromTo('#el-a01', { clipPath: 'inset(96px 516px 186px 96px)' }, { clipPath: 'inset(96px 1824px 186px 96px)', duration: 0.3, ease: 'power2.in', immediateRender: false }, ${r3(a01.end + 0.001)});`));
  assert.doesNotMatch(html, /tl\.fromTo\('#el-a02', \{ (opacity|clipPath: 'inset\(0% 0% 0% 110)/, '換卡的新幕不淡入、不擦開（新卡由段內進場）');
  // 章節：主色色塊（和章節幕同 z、DOM 在前）從左下斜擦 0.45 s，章節幕晚 0.08 s 跟上，之後色塊藏起來
  assert.ok(html.indexOf('id="txc-c01"') < html.indexOf('id="el-c01"'));
  assert.match(html, /<i id="txc-c01" class="v2-tx-ch" style="[^"]*background:var\(--v2-tx-a\);z-index:30;/);
  assert.ok(html.includes(`tl.fromTo('#txc-c01', { clipPath: 'polygon(0% 100%, 0% 100%, 0% 100%)' }, { clipPath: 'polygon(0% 100%, 0% -100%, 200% 100%)', duration: 0.45, ease: 'expo.inOut' }, ${c01.start});`));
  assert.ok(html.includes(`tl.fromTo('#el-c01', { clipPath: 'polygon(0% 100%, 0% 100%, 0% 100%)' }, { clipPath: 'polygon(0% 100%, 0% -100%, 200% 100%)', duration: 0.45, ease: 'expo.inOut' }, ${r3(c01.start + 0.08)});`));
  assert.ok(html.includes(`tl.set('#txc-c01', { opacity: 0 }, ${r3(c01.start + 0.53)});`));
  // 主時間軸對 host 只動 opacity／clip-path（009 直式的舞台縮放寫在 host 的 CSS transform）
  for (const m of html.matchAll(/tl\.(?:fromTo|to|set)\('(#el-[^']+)'[^;]*;/g)) assert.doesNotMatch(m[0], /\b(x|y|scale|xPercent|yPercent|rotation):/, m[0]);
});

test('講者慢推（§7）：疊加卡期間 #footage-push 1→1.045、原點＝臉（speakerBox 中線、上緣往下 20%）；收卡 0.6 s 推回；接色帶擦開時子母畫面從推過的畫面飛出', () => {
  const res = run([
    { id: 's01', scene: 'concept', from: '#1', to: '#3', slots: { text: '甲乙丙丁' } },
    { id: 'a01', scene: 'fs-list', from: '#3', to: '#4e', slots: { title: '清單', items: ['一', '二', '三'] } },
    { id: 's02', scene: 'concept', from: '#7', to: '#8e', slots: { text: '戊己庚辛' } },
  ]);
  assert.deepEqual(res.errors, []);
  const s01 = byId(res, 's01'), a01 = byId(res, 'a01'), s02 = byId(res, 's02');
  const { html } = buildMain({ items: res.items, videoDur: VD, captions: buildCaptions(cues, { duration: VD }), pip: res.globals.pip, speakerBox: res.globals.speakerBox });
  // speakerBox [700, 200, 1220, 1000] → 臉 (960, 360)
  assert.ok(html.includes('#footage-push { position: absolute; inset: 0; transform-origin: 960px 360px; }'));
  assert.match(html, /<div id="footage">\s*<div id="footage-push">\s*<video id="rough"/);
  assert.ok(html.includes(`tl.fromTo('#footage-push', { scale: 1 }, { scale: 1.045, duration: ${r3(a01.start - s01.start)}, ease: 'sine.inOut', force3D: false }, ${s01.start});`));
  assert.ok(html.includes(`tl.set('#footage-push', { scale: 1 }, ${r3(a01.start + 0.8)});`), '飛完、幕蓋住之後才歸位');
  // 飛入起點＝推過 1.045 倍的裁切框（和底下的講者逐像素重合）
  const c = res.globals.pip.crop, k = 1.045, O = { x: 960, y: 360 };
  assert.ok(html.includes(`tl.fromTo('#pip-a01', { x: ${r3(O.x + k * (c.x - O.x) - 1424)}, y: ${r3(O.y + k * (c.y - O.y) - 594)}, scale: ${r3(k * c.w / 432)}, transformOrigin: '0 0' }`));
  // 獨立的疊加卡：推到段尾前 0.6 s，再 0.6 s power2.inOut 推回
  const back = r3(s02.end - 0.6);
  assert.ok(html.includes(`tl.fromTo('#footage-push', { scale: 1 }, { scale: 1.045, duration: ${r3(back - s02.start)}, ease: 'sine.inOut', force3D: false, immediateRender: false }, ${s02.start});`));
  assert.ok(html.includes(`tl.fromTo('#footage-push', { scale: 1.045 }, { scale: 1, duration: 0.6, ease: 'power2.inOut', force3D: false, immediateRender: false }, ${back});`));
  // 沒有疊加卡：沒有 #footage-push（底片結構不變）
  const none = run([{ id: 'a01', scene: 'fs-list', from: '#3', to: '#4e', slots: { title: '清單', items: ['一', '二', '三'] } }]);
  assert.doesNotMatch(buildMain({ items: none.items, videoDur: VD, captions: buildCaptions(cues, { duration: VD }), pip: none.globals.pip, speakerBox: none.globals.speakerBox }).html, /footage-push/);
});

test('直式（009 FR-040–043、FR-052）：講者面板 pipGeometry、臉超出面板 ⚠＋pipCrop 建議、format 寫錯 ✖、座標檢查用 1080×1920、footprint 照 canvas、版面中文', async () => {
  const { CANVAS } = await imp('lib/canvas.mjs');
  const V = CANVAS.portrait;
  // auto：裁切寬 clamp(講者框寬 × 1.3, 540, 1080)、頭頂落在面板頂端下方 40px
  const g = pipGeometry('auto', [300, 500, 780, 1100], V);
  assert.deepEqual(g.box, [0, 900, 1080, 1020]);
  assert.equal(g.crop.w, 624);
  assert.ok(Math.abs(g.crop.w / g.crop.h - 1080 / 1020) < 1e-9);
  assert.ok(Math.abs((500 - g.crop.y) * (1080 / g.crop.w) - 40) < 1e-6, '頭頂在面板頂端下 40px');
  assert.deepEqual(g.style, { left: -395, top: -825, width: 1869, height: 3323 });
  assert.equal(pipGeometry('auto', [500, 500, 600, 700], V).crop.w, 540, '最窄 540');
  assert.equal(pipGeometry('auto', [0, 0, 1080, 1900], V).crop.w, 1080, '最寬 1080');
  assert.deepEqual(pipGeometry([0, 0, 1080, 1020], null, V).style, { left: 0, top: 0, width: 1080, height: 1920 });
  // 橫式不受影響（沒傳 canvas＝橫式）
  assert.deepEqual(pipGeometry('auto', [700, 200, 1220, 1000]).style, { left: -122, top: -49, width: 676, height: 380 });
  const fs04 = { id: 's01', scene: 'fs-list', from: '#2', to: '#3e', slots: { title: '清單', items: ['一', '二', '三'] } };
  const P = (extra) => resolvePlan({ plan: { version: 1, format: 'portrait', scenes: [fs04], ...extra }, cues, videoDur: VD, lib: L, outDir: os.tmpdir(), canvas: V });
  // 臉放得進 940–1280：沒有 ⚠；講者框太高（臉＝上緣＋30% 框高）：⚠ 附建議
  assert.ok(!P({ speakerBox: [300, 500, 780, 1100] }).warnings.some((w) => w.includes('講者面板的臉')));
  const big = P({ speakerBox: [300, 500, 780, 1500] });
  assert.ok(big.warnings.some((w) => /^講者面板的臉超出 y 940–1280（估計 y 940–1459，字幕框在 1291 起）→ 講者在畫面裡太大，面板放不下整張臉：拍遠一點，或 plan\.json 寫 "pipCrop": \[/.test(w)), big.warnings.join('\n'));
  assert.equal(big.format, 'portrait');
  // 座標檢查用 1080×1920
  assert.ok(P({ speakerBox: [300, 500, 1200, 1100] }).errors.length === 0, 'speakerBox 超過 1080 不算格式錯（只有 pipCrop／frame 檢查範圍）');
  assert.ok(P({ pipCrop: [0, 0, 1500, 900] }).errors.some((e) => e.includes('pipCrop 要寫 "auto" 或 [x, y, w, h]（裁切框在 1080×1920 內）')));
  assert.ok(P({ frame: [0, 0, 1080, 1080] }).errors.some((e) => e.includes('frame 的寬高比要是 9:16（現在 1080×1080）')));
  // format 寫錯 ✖
  assert.ok(run([], { format: 'square' }).errors.some((e) => e === 'format 只能是 "landscape" 或 "portrait"（現在是 "square"）→ 直式寫 "portrait"，橫式刪掉這個欄位'));
  // footprint：直式的下方字卡帶 60–940 × 880–1240；講者框在帶裡就 ⚠，在帶上面就沒事
  const lt = { id: 's01', scene: 'concept', from: '#2', to: '#3e', slots: { text: '一句話' } };
  const Q = (box) => resolvePlan({ plan: { version: 1, format: 'portrait', speakerBox: box, scenes: [lt] }, cues, videoDur: VD, lib: L, outDir: os.tmpdir(), canvas: V });
  assert.ok(Q([100, 850, 900, 1250]).warnings.some((w) => w.includes('「一般字卡」大約會蓋到講者框')));
  assert.ok(!Q([100, 300, 900, 800]).warnings.some((w) => w.includes('大約會蓋到講者框')));
  // 05 兩側：直式 ✖
  const two = resolvePlan({ plan: { version: 1, format: 'portrait', scenes: [{ id: 's09', scene: 'two-sides', from: '#2', to: '#3e', slots: { left: '一', right: '二' } }] }, cues, videoDur: VD, lib: L, outDir: os.tmpdir(), canvas: V });
  assert.ok(two.errors.some((e) => e.startsWith('[s09 two-sides] 直式不提供') && e.endsWith('→ 改用 13 標題條列，或情境動畫 x-versus')), two.errors.join('\n'));
});

test('直式（009 FR-060）：fx/catalog.json portrait: "band" 的特效 ⚠「直式只剩中間一條」附同類可用的編號；"ok" 不報；橫式不報', async () => {
  const { CANVAS } = await imp('lib/canvas.mjs');
  const V = CANVAS.portrait;
  const bands = L.fx.filter((f) => f.portrait === 'band').map((f) => f.id);
  assert.deepEqual(bands, ['07', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '21', '31', '33']);
  const seg = (fx, id) => ({ id, type: 'fx', fx, from: '#2', to: '#2e', vars: { text: '重點' } });
  const R = (fx, format) => resolvePlan({ plan: { version: 1, ...(format ? { format } : {}), scenes: [seg(fx, 'f1')] }, cues, videoDur: VD, lib: L, outDir: os.tmpdir(), ...(format ? { canvas: V } : {}) });
  const band = (r) => r.warnings.filter((w) => w.includes('直式只剩中間一條'));
  // 07（IMPACT）：同類有 ok 的卡 → 列出來
  assert.deepEqual(band(R(7, 'portrait')), ['[f1 fx 7] fx-07（' + L.fx.find((f) => f.id === '07').zh + '）直式只剩中間一條 → 換成 portrait: "ok" 的特效（同類可用：01、02、03、04、05、06、08）或拿掉']);
  // 10（FLOW）：同類全是 band → 換別類
  assert.match(band(R(10, 'portrait'))[0], /fx-10（.+）直式只剩中間一條 → 換成 portrait: "ok" 的特效（同類 FLOW 都是滿版，換別類）或拿掉$/);
  assert.deepEqual(band(R(1, 'portrait')), [], 'portrait: "ok" 不報');
  assert.deepEqual(band(R(7)), [], '橫式不報');
});
