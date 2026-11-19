// 061 錄影畫面框（specs/061-screen-frame）：auto 量測的數字、plan.json > shared/setting.json > 沒有、角標等距、子母畫面在框裡、
// 運鏡塞滿框、標註在框裡、框外是主題背景；沒設定時輸出和原本一樣。素材檔是空檔＋假的 probe，不用 ffmpeg
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { lib, imp, makeSrt, tmpDir, TOOLS, TEMPLATE } from './helpers.mjs';

const S = await imp('lib/screen-frame.mjs');
const M = await imp('lib/media.mjs');
const { CAP_DEFAULT, captionGeom } = await imp('lib/caption-style.mjs');
const { timeMap } = await imp('lib/edit.mjs');
const { resolvePlan, formatReport, jsonItems } = await imp('lib/plan.mjs');
const { parseSrt } = await imp('lib/srt.mjs');
const { setPlan, unsetPlan } = await imp('lib/plan-set.mjs');
const { checkShots } = await imp('lib/shots.mjs');
const L = await lib();
const cues = parseSrt(makeSrt({ n: 12 }));   // 第 N 句 (N−1)×3.5＋1 起、長 3 秒
const VD = 44;
const cap = (o) => ({ ...CAP_DEFAULT, ...o });
const DEF = { scale: 0.86, inset: 24, auto: true, win: [135, 12, 1651, 929], capTop: 956, gap: 12, radius: 16, measured: 0.86, from: 'plan' };

// 假專案：assets/screen 放空檔，probe 回傳寬高
function project(t, files = ['assets/screen/v.mp4']) {
  const dir = tmpDir(t, 'sf-');
  for (const f of files) { fs.mkdirSync(path.join(dir, path.dirname(f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), ''); }
  return dir;
}

test('auto 量測：預設字幕底板上緣 y 956 → 86%（1651×929、上 12、下緣 941，離字幕 15 px ≥ 12）；再大一格就不到 12 px', () => {
  assert.equal(captionGeom(CAP_DEFAULT).top, 956);
  assert.deepEqual(S.measureScale(956, 24), { scale: 0.86, short: false });
  assert.deepEqual(S.frameWin(0.86, 24), [135, 12, 1651, 929]);
  const [, y, , h] = S.frameWin(0.865, 24);
  assert.ok(y + h > 956 - S.FRAME.gap, '0.865 會進到 12 px 以內');
  // 字幕往上移、字級變大 → 跟著縮；60% 還是碰到 → short
  const at = (o) => S.resolveScreenFrame({ plan: { screenFrame: { scale: 'auto' } }, capStyle: cap(o) });
  assert.deepEqual([at({ lift: 120 }).frame.scale, at({ lift: 120 }).frame.capTop], [0.75, 836]);
  assert.deepEqual([at({ size: 96 }).frame.scale, at({ size: 96 }).frame.capTop], [0.83, 925]);
  const hi = at({ lift: 400 });
  assert.equal(hi.frame.scale, 0.6);
  assert.match(hi.warnings[0], /^錄影畫面框：字幕底板上緣 y 556 太高，縮到最小 60% 還是會碰到字幕（框下緣 y 660）→ 字幕往下移/);
  // 每一個量到的值：框下緣離字幕至少 12，而且再大一格（+0.005）就不夠
  for (const lift of [0, 40, 80, 160, 240]) {
    const f = at({ lift }).frame, w = S.frameWin(f.scale + 0.005, 24);
    assert.ok(f.win[1] + f.win[3] <= f.capTop - 12 && w[1] + w[3] > f.capTop - 12, `lift ${lift}：${f.scale}`);
  }
  // 框和畫面一樣大：上緣貼齊；上緣＝inset 的一半
  assert.deepEqual(S.frameWin(1, 24), [0, 0, 1920, 1080]);
  assert.deepEqual(S.frameWin(0.86, 40), [135, 20, 1651, 929]);
  assert.equal(S.describeScreenFrame(DEF), '縮到 86%（量字幕上緣 y 956；1651×929、上 12），角標離框上、右各 24 px');
  assert.equal(S.frameLine(DEF), '錄影畫面框：縮到 86%（量字幕上緣 y 956；1651×929、上 12），角標離框上、右各 24 px（這一集 plan.json screenFrame）');
});

test('解析順序：plan.json > shared/setting.json > 沒有；plan 只寫一個欄位時另一個照 setting；照 setting 解析的才要記進 plan（record）', () => {
  const r = (plan, setting) => S.resolveScreenFrame({ plan: { screenFrame: plan }, settings: { screenFrame: setting } });
  assert.equal(r(undefined, undefined).frame, null, '都沒寫＝原本的樣子');
  const s = r(undefined, { scale: 'auto', inset: 24 });
  assert.deepEqual(s.frame, { ...DEF, from: 'setting' });
  assert.deepEqual(s.record, { scale: 0.86, inset: 24 }, 'auto 記成量到的數字');
  const p = r({ scale: 0.8 }, { scale: 'auto', inset: 30 });
  assert.deepEqual([p.frame.scale, p.frame.inset, p.frame.auto, p.frame.from, p.record], [0.8, 30, false, 'plan', null]);
  assert.deepEqual(r({ inset: 32 }, undefined).frame.scale, 0.855, 'plan 只寫 inset：scale 照 auto（上緣 16，86% 的下緣 945 離字幕不到 12）');
  assert.equal(r({ scale: 0.8833 }).frame.scale, 0.885, '取到 0.005');
  // 寫錯：plan ✖（附 --unset）、setting ⚠ 不套；直式不套
  const bad = r({ scale: 1.2, size: 3 }, undefined);
  assert.equal(bad.frame, null);
  assert.equal(bad.errors.length, 2);
  assert.match(bad.errors[0], /^plan\.json screenFrame 沒有「size」這個欄位/);
  assert.match(bad.errors[1], /^plan\.json screenFrame\.scale 是錄影框縮到畫面的幾倍：0\.6–1.*現在是 1\.2 → 改好，或拿掉（＝照預設）：node shared\/template\/tools\/build\.mjs --project projects\/<專案> --unset screenFrame$/);
  const sbad = r(undefined, { scale: 'big' });
  assert.deepEqual([sbad.frame, sbad.errors.length], [null, 0]);
  assert.match(sbad.warnings[0], /^shared\/setting\.json 的 screenFrame\.scale .* → 先不套預設；用 brand\.mjs screen-frame 重設$/);
  const port = S.resolveScreenFrame({ plan: { screenFrame: { scale: 0.8 } }, canvas: { format: 'portrait', H: 1920 } });
  assert.equal(port.frame, null);
  assert.match(port.warnings[0], /直式不套/);
});

test('字幕改了、框疊到字幕：⚠ 附重新量測的指令（照字幕量出來會是多少）', () => {
  const r = S.resolveScreenFrame({ plan: { screenFrame: { scale: 0.86 } }, capStyle: cap({ lift: 120 }), projectRel: 'projects/demo' });
  assert.deepEqual(r.warnings, ['錄影畫面框縮到 86%，框下緣 y 941 疊到字幕底板（上緣 y 836）105 px → 重新量測（照字幕量到剛好不碰到，現在會是 75%）：node shared/template/tools/build.mjs --project projects/demo --set "screenFrame.scale=auto"']);
  assert.deepEqual(S.resolveScreenFrame({ plan: { screenFrame: { scale: 0.86 } } }).warnings, [], '預設字幕不碰到');
});

test('角標等距：有框時小節角標的右上角離框上緣、右緣都是 inset；子母畫面在框的右下角、離框右下 inset，右緣和角標對齊；072 橫向素材的框照素材比例縮（全景沒有黑邊），方形、直式照原本的框', () => {
  for (const fr of [DEF, { ...DEF, ...S.resolveScreenFrame({ plan: { screenFrame: { scale: 0.8, inset: 40 } } }).frame }]) {
    for (const info of [{ width: 1920, height: 1080 }, { width: 3840, height: 2280 }, { width: 1080, height: 2410 }, { width: 800, height: 800 }, { width: 800, height: 600 }]) {
      const win = S.fitWin(fr.win, info, 'contain'), [x, y, w, h] = win;
      const c = M.mediaCorner(info, 'contain', { w: 300, h: 80, dflt: [1824, 56], frame: fr });
      assert.deepEqual([c.top - y, x + w - c.right], [fr.inset, fr.inset], `${info.width}×${info.height} 離上、離右一樣`);
      const F = M.framedView({ ...fr, win });
      const G = M.mediaGeometry(info, 'contain', F);
      const [px, py, pw, ph] = M.pipRect(M.pipShift(G, { ...fr, win }));
      // 外框比本體多 9 px（brand.mjs drawPipFrame）
      assert.deepEqual([x + w - (px + pw + 9), y + h - (py + ph + 9)], [fr.inset, fr.inset], '子母畫面外框離框右、下 inset');
      assert.equal(px + pw + 9, c.right, '右緣和角標對齊');
      const landscape = info.width / info.height >= S.FIT_MIN;
      if (landscape) assert.ok(Math.abs(G.left - x) <= 1 && Math.abs(G.left + G.width - (x + w)) <= 1 && Math.abs(G.top - y) <= 1 && Math.abs(G.top + G.height - (y + h)) <= 1, `${info.width}×${info.height} 全景剛好塞滿框`);
      else assert.deepEqual(win, fr.win, `${info.width}×${info.height} 照原本的框`);
    }
  }
  // minimax-ep1 的錄影 3840×2280 放進 86% 的框（1651×929）：框縮成 1564×929、置中，角標不再跨在錄影邊上
  assert.deepEqual(S.fitWin(DEF.win, { width: 3840, height: 2280 }, 'contain'), [DEF.win[0] + Math.round((DEF.win[2] - Math.round(DEF.win[3] * 3840 / 2280)) / 2), DEF.win[1], Math.round(DEF.win[3] * 3840 / 2280), DEF.win[3]]);
  assert.deepEqual(S.fitWin(DEF.win, { width: 3840, height: 2280 }, 'cover'), DEF.win, 'cover 照原本');
  assert.deepEqual(S.fitWin(DEF.win, { width: 2560, height: 900 }, 'contain').slice(0, 1), [DEF.win[0]], '比框寬：上下縮');
  // 沒有框：照原本（16:9 錄影 1671×940 的右上角離 16）
  assert.deepEqual(M.mediaCorner({ width: 1920, height: 1080 }, 'contain', { w: 400, h: 80, dflt: [1824, 56] }), { right: 1780, top: 16 });
  assert.deepEqual(M.pipShift(M.mediaGeometry({ width: 1920, height: 1080 }, 'contain')), [-85, -3]);
});

test('073 錄影自帶黑邊：量出黑邊裡的畫面（快取）、框照裡面的比例、角標和紅框對裡面的畫面、video 照整個檔案放（黑邊在框外被裁掉）', async (t) => {
  const dir = project(t, []);
  fs.mkdirSync(path.join(dir, 'assets/screen'), { recursive: true });
  const mk = (name, vf) => {
    const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=440x270:rate=10', '-t', '2', ...(vf ? ['-vf', vf] : []), '-pix_fmt', 'yuv420p', path.join(dir, 'assets/screen', name)]);
    assert.equal(r.status, 0, String(r.stderr));
  };
  mk('bars.mp4', 'pad=480:270:20:0:black');
  mk('clean.mp4', null);
  const { blackBars, probeMedia } = await imp('lib/ff.mjs');
  const cache = path.join(dir, 'work/hyperframes/.cache/media-bars.json');
  assert.deepEqual(blackBars(path.join(dir, 'assets/screen/bars.mp4'), probeMedia(path.join(dir, 'assets/screen/bars.mp4')), cache), [20, 0, 460, 270]);
  assert.equal(blackBars(path.join(dir, 'assets/screen/clean.mp4'), probeMedia(path.join(dir, 'assets/screen/clean.mp4')), cache), null, '沒有黑邊');
  assert.deepEqual(Object.values(JSON.parse(fs.readFileSync(cache, 'utf8'))).map((x) => x.box), [[20, 0, 460, 270], null], '記在快取');
  assert.equal(blackBars(path.join(dir, 'assets/screen/bars.mp4'), { width: 1920, height: 1080, duration: 2 }), null, '大小對不上（假 probe）不判');
  const errs = [], warns = [];
  const seg = { id: 'm1', type: 'media', src: 'assets/screen/bars.mp4', marks: [{ at: '+0.5', until: '+1.5', box: [20, 0, 440, 270] }] };
  const media = M.checkMediaSeg(seg, { projectDir: dir, err: (x) => errs.push(x), warn: (x) => warns.push(x) });
  assert.deepEqual(media.info.content, [20, 0, 460, 270]);
  const it = { id: 'm1', seg, media, start: 2, end: 3.5, z: 20, enterFx: 'fade', exitFx: 'fade' };
  M.validateMedia(it, { cues, tm: timeMap([], 60), pipAt: () => false, frame: DEF, err: (x) => errs.push(x), warn: (x) => warns.push(x) });
  assert.deepEqual(errs, []);
  // 框照裡面的畫面（440×270）的比例縮：1514×929、置中；看得到的畫面剛好塞滿框
  const win = S.fitWin(DEF.win, media.info, 'contain'), G = it.media.geo;
  assert.deepEqual(win, [204, 12, 1514, 929]);
  assert.deepEqual(it.media.frame.win, win);
  assert.deepEqual([G.left, G.top, G.width, G.height], win);
  assert.deepEqual(G.el, [135, 12, 1652, 929], 'video 照整個檔案（含黑邊）放，左右黑邊落在框外');
  // 角標離看得到的畫面上、右都是 24（作者：「參考點：到 MiniMax Code 官網下載頁…」那段）
  assert.deepEqual(M.mediaCorner(media.info, 'contain', { w: 300, h: 80, frame: DEF }), { right: 204 + 1514 - 24, top: 12 + 24 });
  // 紅框框整個畫面（來源像素 [20, 0, 440, 270]）＝框
  assert.deepEqual(M.toStage(G, [20, 0, 440, 270]).map(Math.round), win);
  const html = M.mediaParts({ ...it, pipIds: [] }, { nextTrack: (() => { let n = 10; return () => n++; })() }).html;
  assert.match(html, /<div id="mgr-m1" class="mgrow mgrow--frame" style="left:204px;top:12px;width:1514px;height:929px;border-radius:16px"/);
  assert.match(html, /<video id="mv-m1"[^>]*style="left:135px;top:12px;width:1652px;height:929px"><\/video>/s);
});

test('validateMedia＋mediaParts：可見區是框、推近塞滿框、標註和步驟標籤在框裡（左下角的標籤和角標同一個距離）、框外是主題背景、子母畫面在框裡', (t) => {
  const dir = project(t);
  const probe = () => ({ width: 1920, height: 1080, duration: 30, hasAudio: false });
  const tm = timeMap([], 60);
  const run = (seg, frame, { pip = false } = {}) => {
    const errs = [], warns = [];
    const media = M.checkMediaSeg(seg, { projectDir: dir, probe, err: (x) => errs.push(x), warn: (x) => warns.push(x) });
    assert.ok(media, errs.join('\n'));
    const it = { id: seg.id, seg, media, start: 2, end: 14, z: 20, enterFx: 'fade', exitFx: 'fade', ...(pip ? { pipPieces: [{ s: 2, e: 14 }] } : {}) };
    const r = M.validateMedia(it, { cues, tm, pipAt: () => pip, frame, err: (x) => errs.push(x), warn: (x) => warns.push(x) });
    return { it, m: it.media, r, errs, warns };
  };
  const seg = { id: 'm1', type: 'media', src: 'assets/screen/v.mp4',
    steps: [{ at: '+0.2', text: '打開設定' }],
    moves: [{ at: '+0.5', to: [0, 0, 960, 540] }, { at: '+4', to: 'full' }],
    callouts: [{ at: '+6.5', until: '+9', box: [1200, 200, 300, 120], text: '按這裡' }],
    lens: [{ at: '+9.5', until: '+11.5', box: [100, 800, 300, 100] }] };
  const a = run(seg, DEF, { pip: true });
  assert.deepEqual(a.errs, []);
  const [x, y, w, h] = DEF.win, x2 = x + w, y2 = y + h;
  assert.deepEqual([a.m.geo.left, a.m.geo.top, a.m.geo.width, a.m.geo.height], [135, 12, 1651, 929], '16:9 剛好塞滿框');
  // 推近到 [0, 0, 960, 540]（左上四分之一）：畫面上剛好是框
  const cam = a.m.cams[0].to, sc = M.toScreen(M.toStage(a.m.geo, [0, 0, 960, 540]), cam);
  assert.deepEqual(sc.map(Math.round), [135, 12, 1651, 929], `推近 ${JSON.stringify(cam)}`);
  // 步驟標籤（066 橫式跟著操作；這一步的說明卡在推近時跑出框外，貼不住 → 放左下角）：離框左、下各 24（和角標同一個標準）
  assert.equal(a.m.steps.capsule, null);
  const tg = a.m.steps.list[0].tag;
  assert.equal(tg.side, 'corner');
  assert.deepEqual([tg.box[0], tg.box[3]], [x + 24, y2 - 24]);
  // 說明卡、放大鏡都在框裡（離框邊 24）
  const co = a.m.callouts[0].card;
  assert.ok(co[0] >= x + 24 && co[2] <= x2 - 24 && co[1] >= y + 24 && co[3] <= y2 - 24, `說明卡 ${co}`);
  const [lx, ly, lw, lh] = a.m.lenses[0].outer;
  assert.ok(lx >= x && lx + lw <= x2 && ly >= y + 24 && ly + lh <= y2 - 24, `放大鏡 ${a.m.lenses[0].outer}`);
  // 子母畫面在框的右下角
  assert.deepEqual(a.m.pipShift, [1762 - 1865, 917 - 927]);
  // DOM：框外照 screenBg（070 預設純黑，不放背景圖）、面板＝框（圓角、裁掉）、stage 抵回畫面座標；放大鏡的壓暗只蓋框
  const html = M.mediaParts({ ...a.it, pipIds: [] }, { nextTrack: (() => { let n = 10; return () => n++; })() }).html;
  assert.match(html, /<div id="mbg-m1" class="clip mbg mbg--frame"/);
  assert.doesNotMatch(html, /mbg--frame sc-surface-fs/);
  assert.match(html, /<div id="mgr-m1" class="mgrow mgrow--frame" style="left:135px;top:12px;width:1651px;height:929px;border-radius:16px" data-layout-allow-overflow>/);
  assert.match(html, /<div id="mst-m1" class="mstage" style="left:-135px;top:-12px"/);
  assert.match(html, /<div id="mdim-m1-l1" class="clip mdim" [^>]*style="left:135px;top:12px;width:1651px;height:929px;border-radius:16px"><\/div>/);
  assert.match(html, new RegExp(`<div id="mtag-m1-1" class="mtag" style="left:159px;top:${y2 - 24 - 80}px"><div id="msteps-m1-1" class="msteps">`));
  // 紅框推到框外：⚠ 說被框裁掉（下緣也算，字幕在框外）
  const b = run({ id: 'm2', type: 'media', src: 'assets/screen/v.mp4', fit: 'cover', marks: [{ at: '+0.5', until: '+2', box: [0, 1040, 300, 40] }] }, DEF);
  assert.ok(b.warns.some((m) => /marks\[0\] 有一部分在錄影框外（被裁掉/.test(m)), b.warns.join('\n'));
  // 右側步驟清單、tape 不套框
  const sd = run({ id: 'm3', type: 'media', src: 'assets/screen/v.mp4', side: { title: '步驟', items: [{ at: '+1', text: '一' }] } }, DEF);
  assert.equal(sd.m.frame.win, undefined);
});

test('沒設定（frame: null）：可見區、面板、黑底和原本一樣（mediaParts 輸出逐字相同）', (t) => {
  const dir = project(t);
  const probe = () => ({ width: 1920, height: 1080, duration: 30, hasAudio: false });
  const tm = timeMap([], 60);
  const out = (frame) => {
    const seg = { id: 'm1', type: 'media', src: 'assets/screen/v.mp4', marks: [{ at: '+0.5', until: '+2', box: [100, 100, 300, 100] }], lens: [{ at: '+3', until: '+5', box: [100, 800, 300, 100] }], spot: [{ at: '+6', until: '+9', box: [800, 300, 400, 300] }] };
    const media = M.checkMediaSeg(seg, { projectDir: dir, probe, err: assert.fail, warn: () => {} });
    const it = { id: 'm1', seg, media, start: 2, end: 14, z: 20, enterFx: 'tilt', exitFx: 'fade' };
    M.validateMedia(it, { cues, tm, frame, err: assert.fail, warn: () => {} });
    return { it, html: M.mediaParts({ ...it, pipIds: [] }, { nextTrack: (() => { let n = 10; return () => n++; })() }).html };
  };
  const a = out(null), b = out(undefined);
  assert.equal(a.html, b.html);
  assert.equal(a.it.media.frame.win, undefined);
  assert.match(a.html, /<div id="mbg-m1" class="clip mbg"/);
  assert.match(a.html, /<div id="mgr-m1" class="mgrow" style="left:125px;top:0px;width:1671px;height:940px" data-layout-allow-overflow>/);
  assert.match(a.html, /<div id="mdim-m1-l1" class="clip mdim" [^>]*><\/div>/);
  assert.doesNotMatch(a.html, /mbg--frame|mgrow--frame|border-radius/);
  assert.match(a.html, /<rect class="mspot-dim" width="1920" height="1080"/);
  // 有框時聚光燈的壓暗只蓋框（圓角）
  assert.match(out(DEF).html, /<rect class="mspot-dim" x="135" y="12" width="1651" height="929" rx="16"/);
});

test('resolvePlan：小節角標滑到框的右上角（離上、右 24）、摘要印一行、--check --json 的 out.frame；setting 的才 record；沒設定時沒有這些', (t) => {
  const dir = project(t);
  const probe = () => ({ width: 1920, height: 1080, duration: 30, hasAudio: false });
  const scenes = [
    { id: 'c01', scene: 'chapter-tag', from: '#2', to: '#3e', slots: { num: '01', name: '痛點' } },
    { id: 'm1', type: 'media', src: 'assets/screen/v.mp4', from: '#4', to: '#5e', pip: true },
  ];
  const go = (extra = {}, l = L) => resolvePlan({ plan: { version: 1, speakerBox: [700, 200, 1220, 1000], scenes, sections: [{ at: '#4', name: '設定' }], ...extra }, cues, videoDur: VD, lib: l, outDir: os.tmpdir(), projectDir: dir, probe });
  const res = go({ screenFrame: { scale: 'auto', inset: 24 } });
  assert.deepEqual(res.errors, []);
  const m1 = res.items.find((x) => x.id === 'm1');
  assert.deepEqual(res.badges[0].spots, [{ id: 'm1', a: m1.start, z: m1.end, dx: 1762 - 1824, dy: 36 - 56 }], '角標右上角 (1762, 36)：離框右 1786 − 1762 = 24、離框上 36 − 12 = 24');
  assert.deepEqual(res.screenFrame, DEF);
  assert.equal(res.screenFrameRecord, null);
  assert.ok(formatReport(res, { videoDur: VD }).split('\n').includes('錄影畫面框：縮到 86%（量字幕上緣 y 956；1651×929、上 12），角標離框上、右各 24 px（這一集 plan.json screenFrame）'));
  assert.deepEqual(jsonItems(res).find((x) => x.id === 'm1').out.frame, [135, 12, 1651, 929]);
  assert.deepEqual(jsonItems(res).find((x) => x.id === 'm1').out.pipShift, [-103, -10]);
  // 這一集的字幕往上移：auto 跟著縮
  assert.equal(go({ screenFrame: { scale: 'auto' }, captionStyle: { lift: 120 } }).screenFrame.scale, 0.75);
  // 預設在 shared/setting.json：照它解析、要記進 plan.json
  const fromSet = go({}, { ...L, screenFrameDefault: { scale: 'auto', inset: 24 } });
  assert.deepEqual([fromSet.screenFrame.from, fromSet.screenFrameRecord], ['setting', { scale: 0.86, inset: 24 }]);
  assert.ok(formatReport(fromSet, { videoDur: VD }).includes('（預設 shared/setting.json screenFrame）'));
  // 沒設定：原本的位置（1780, 16）、沒有摘要、沒有 out.frame
  const none = go();
  assert.ok(!('screenFrame' in none) && !('screenFrameRecord' in none), '沒設定：結果裡沒有這兩個鍵（和原本一樣）');
  assert.deepEqual(none.badges[0].spots[0].dx, 1780 - 1824);
  assert.ok(!formatReport(none, { videoDur: VD }).includes('錄影畫面框'));
  assert.ok(!('frame' in jsonItems(none).find((x) => x.id === 'm1').out));
  // 寫錯 ✖
  assert.ok(go({ screenFrame: { scale: 2 } }).errors.some((e) => e.startsWith('plan.json screenFrame.scale 是錄影框縮到畫面的幾倍')));
});

test('build.mjs --set／--unset：screenFrame.scale（auto 或 0.6–1）、screenFrame.inset（0–80）寫進 plan.json；--unset screenFrame 整個拿掉', (t) => {
  const dir = tmpDir(t, 'sf-set-'), plan = path.join(dir, 'plan.json');
  fs.writeFileSync(plan, JSON.stringify({ version: 1, scenes: [] }, null, 2) + '\n');
  const opts = { plan };
  assert.deepEqual(setPlan(dir, { 'screenFrame.scale': '0.88', 'screenFrame.inset': '24' }, opts).map((c) => [c.key, c.to]), [['screenFrame.scale', 0.88], ['screenFrame.inset', 24]]);
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(plan, 'utf8'))), ['version', 'screenFrame', 'scenes'], '放在 scenes 前面');
  setPlan(dir, { 'screenFrame.scale': 'auto' }, opts);
  assert.deepEqual(JSON.parse(fs.readFileSync(plan, 'utf8')).screenFrame, { scale: 'auto', inset: 24 });
  assert.throws(() => setPlan(dir, { 'screenFrame.scale': '1.3' }, opts), /✖ screenFrame\.scale 不能是「1\.3」→ 能寫的：screenFrame\.scale（auto（照字幕量到剛好不碰到）或 0\.6–1/);
  assert.throws(() => setPlan(dir, { 'screenFrame.inset': '-4' }, opts), /✖ screenFrame\.inset 不能是「-4」/);
  assert.deepEqual(unsetPlan(dir, ['screenFrame'], opts).map((c) => c.key), ['screenFrame']);
  assert.equal(JSON.parse(fs.readFileSync(plan, 'utf8')).screenFrame, undefined);
});

test('brand.mjs screen-frame：看、設定（只給要改的）、寫錯 ✖、off 拿掉；寫在暫存的 shared/setting.json', (t) => {
  const root = tmpDir(t, 'sf-brand-'), kit = path.join(root, 'shared', 'template', 'kit');
  fs.mkdirSync(kit, { recursive: true });
  const run = (...a) => spawnSync(process.execPath, [path.join(TOOLS, 'brand.mjs'), 'screen-frame', ...a, '--kit', kit], { encoding: 'utf8' });
  const setting = () => JSON.parse(fs.readFileSync(path.join(root, 'shared', 'setting.json'), 'utf8')).screenFrame;
  assert.match(run().stdout, /^錄影畫面框預設：沒設定（錄影放在字幕帶上方、四周黑底）/);
  const a = run('--scale', 'auto');
  assert.equal(a.status, 0, a.stderr);
  assert.match(a.stdout, /^✓ 錄影畫面框預設：縮到 86%（量字幕上緣 y 956；1651×929、上 12），角標離框上、右各 24 px/);
  assert.deepEqual(setting(), { scale: 'auto', inset: 24 });
  assert.equal(run('--inset', '30').status, 0);
  assert.deepEqual(setting(), { scale: 'auto', inset: 30 }, '只改 inset，scale 留著');
  const b = run('--scale', '0.95');
  assert.match(b.stdout, /⚠ 錄影畫面框縮到 95%，框下緣 y 1041 疊到字幕底板（上緣 y 956）85 px → 重新量測（照字幕量到剛好不碰到，現在會是 86%）：node shared\/template\/tools\/brand\.mjs screen-frame --scale auto/);
  const bad = run('--scale', '2');
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /✖ --scale 是錄影框縮到畫面的幾倍：0\.6–1/);
  assert.equal(run('off').status, 0);
  assert.equal(setting(), undefined);
});

test('截圖欄位：有錄影畫面框時，段的截圖切那個框（沒設定照舊 1671×940）', (t) => {
  const dir = tmpDir(t, 'sf-shot-'), customDir = path.join(dir, 'custom');
  fs.mkdirSync(customDir);
  fs.writeFileSync(path.join(customDir, 'x-t.fill.json'), JSON.stringify({ template: 'x-t', slots: { seg: { type: 'shot', from: 'segment' } } }));
  const plan = (extra = {}) => ({ ...extra, scenes: [{ id: 's01', scene: 'quote' }, { id: 's02', type: 'custom', template: 'x-t', slots: { seg: 's01' } }] });
  const job = (p, l = { customDir }) => checkShots({ plan: p, lib: l, projectDir: dir }).jobs.get('assets/shots/seg-s01.jpg');
  assert.equal(job(plan()).win, undefined);
  assert.deepEqual(job(plan({ screenFrame: { scale: 'auto' } })).win, [135, 12, 1651, 929]);
  assert.deepEqual(job(plan(), { customDir, screenFrameDefault: { scale: 0.8, inset: 24 } }).win, [192, 12, 1536, 864]);
  assert.equal(job(plan({ format: 'portrait', screenFrame: { scale: 0.8 } })).win, undefined, '直式不套');
});

test('070 screenBg：錄影四周預設純黑；plan.json screenBg > shared/setting.json screenBg；white＝框外和框裡都純白；寫錯 ✖／⚠；--set、brand.mjs screen-bg', (t) => {
  const dir = project(t);
  const probe = () => ({ width: 1920, height: 1080, duration: 30, hasAudio: false });
  const scenes = [{ id: 'm1', type: 'media', src: 'assets/screen/v.mp4', from: '#4', to: '#5e' }];
  const go = (extra = {}, l = L) => resolvePlan({ plan: { version: 1, speakerBox: [700, 200, 1220, 1000], scenes, ...extra }, cues, videoDur: VD, lib: l, outDir: os.tmpdir(), projectDir: dir, probe });
  const html = (res) => M.mediaParts({ ...res.items.find((x) => x.id === 'm1'), pipIds: [] }, { nextTrack: (() => { let n = 10; return () => n++; })() }).html;
  const line = (res) => formatReport(res, { videoDur: VD }).split('\n').find((x) => x.startsWith('錄影四周：'));
  // 預設：純黑（沒有 mbg--white）
  const def = go({ screenFrame: { scale: 'auto', inset: 24 } });
  assert.deepEqual(def.errors, []);
  assert.equal(def.screenBg, 'black');
  assert.match(html(def), /<div id="mbg-m1" class="clip mbg mbg--frame"/);
  assert.match(html(def), /<div id="mwb-m1" class="clip mwin"/);
  assert.equal(line(def), '錄影四周：黑底（預設；換白底：brand.mjs screen-bg white）');
  // 這一集白底：框外、框裡都純白
  const w = go({ screenFrame: { scale: 'auto', inset: 24 }, screenBg: 'white' });
  assert.match(html(w), /<div id="mbg-m1" class="clip mbg mbg--frame mbg--white"/);
  assert.match(html(w), /<div id="mwb-m1" class="clip mwin mwin--white"/);
  assert.equal(line(w), '錄影四周：白底（這一集 plan.json screenBg）');
  // 沒有錄影畫面框也套用
  assert.match(html(go({ screenBg: 'white' })), /<div id="mbg-m1" class="clip mbg mbg--white"/);
  // 預設在 shared/setting.json；這一集寫了照這一集
  const s = go({}, { ...L, screenBgDefault: 'white' });
  assert.equal(line(s), '錄影四周：白底（預設 shared/setting.json screenBg）');
  assert.equal(go({ screenBg: 'black' }, { ...L, screenBgDefault: 'white' }).screenBg, 'black');
  // 寫錯：plan ✖、setting ⚠（先用黑底）
  assert.ok(go({ screenBg: 'gray' }).errors.some((e) => e.includes('screenBg 只能是 "black"（預設，錄影、圖片四周黑底）或 "white"（白底），現在是 "gray"')));
  const bad = go({}, { ...L, screenBgDefault: 'gray' });
  assert.equal(bad.screenBg, 'black');
  assert.ok(bad.warnings.some((x) => x.includes('shared/setting.json 的 screenBg 只能是 "black" 或 "white"')));
  // build.mjs --set／--unset
  const pd = tmpDir(t, 'sb-set-'), plan = path.join(pd, 'plan.json');
  fs.writeFileSync(plan, JSON.stringify({ version: 1, scenes: [] }, null, 2) + '\n');
  assert.deepEqual(setPlan(pd, { screenBg: 'white' }, { plan }).map((c) => [c.key, c.to]), [['screenBg', 'white']]);
  assert.throws(() => setPlan(pd, { screenBg: 'gray' }, { plan }), /✖ screenBg 不能是「gray」/);
  unsetPlan(pd, ['screenBg'], { plan });
  assert.equal(JSON.parse(fs.readFileSync(plan, 'utf8')).screenBg, undefined);
  // brand.mjs screen-bg：看、設定、寫錯 ✖、off；寫在暫存的 shared/setting.json
  const root = tmpDir(t, 'sb-brand-'), kit = path.join(root, 'shared', 'template', 'kit');
  fs.mkdirSync(kit, { recursive: true });
  const run = (...a) => spawnSync(process.execPath, [path.join(TOOLS, 'brand.mjs'), 'screen-bg', ...a, '--kit', kit], { encoding: 'utf8' });
  const setting = () => JSON.parse(fs.readFileSync(path.join(root, 'shared', 'setting.json'), 'utf8')).screenBg;
  assert.match(run().stdout, /^錄影四周的底色預設：純黑（沒設定）/);
  const a = run('white');
  assert.equal(a.status, 0, a.stderr);
  assert.match(a.stdout, /^✓ 錄影四周的底色預設：純白（shared\/setting\.json 的 screenBg/);
  assert.equal(setting(), 'white');
  const b = run('gray');
  assert.equal(b.status, 1);
  assert.match(b.stderr, /✖ brand\.mjs screen-bg 只收 black（純黑）或 white（純白），現在是「gray」/);
  assert.equal(run('off').status, 0);
  assert.equal(setting(), undefined);
});

test('build（不是 --check）第一次把 shared/setting.json 的 screenFrame 記進 plan.json（auto 記成量到的數字）；已經有的不動、--check 不寫', (t) => {
  // 暫存的 shared/：template 連到真的（junction：Windows 不用管理員權限），setting.json 自己寫，不碰工作區的設定
  const root = tmpDir(t, 'sf-rec-'), shared = path.join(root, 'shared'), proj = path.join(root, 'proj');
  fs.mkdirSync(shared);
  fs.symlinkSync(TEMPLATE, path.join(shared, 'template'), 'junction');
  fs.writeFileSync(path.join(shared, 'setting.json'), JSON.stringify({ screenFrame: { scale: 'auto', inset: 24 } }));
  fs.mkdirSync(path.join(proj, 'work', 'hyperframes'), { recursive: true });
  const plan = path.join(proj, 'work', 'hyperframes', 'plan.json');
  fs.writeFileSync(plan, JSON.stringify({ version: 1, scenes: [] }, null, 2) + '\n');
  const run = (...a) => spawnSync(process.execPath, [path.join(TOOLS, 'build.mjs'), '--project', proj, '--template', path.join(shared, 'template'), ...a], { encoding: 'utf8', env: { ...process.env, AUTO_EDIT_NO_LOCAL_BRAND: '' } });
  run('--check');
  assert.equal(JSON.parse(fs.readFileSync(plan, 'utf8')).screenFrame, undefined, '--check 不寫');
  const b = run();   // 這個假專案沒有 rough.mp4，後面會停；記錄在讀輸入之前就做完
  assert.match(b.stdout, /✓ plan\.json：screenFrame＝\{"scale":0\.86,"inset":24\}（照 shared\/setting\.json 的 screenFrame 記下來，量字幕上緣 y 956；/, b.stdout + b.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(plan, 'utf8')).screenFrame, { scale: 0.86, inset: 24 });
  // 預設改了：已經記下來的這一集不跟著變
  fs.writeFileSync(path.join(shared, 'setting.json'), JSON.stringify({ screenFrame: { scale: 0.7, inset: 40 } }));
  assert.doesNotMatch(run().stdout, /screenFrame＝/);
  assert.deepEqual(JSON.parse(fs.readFileSync(plan, 'utf8')).screenFrame, { scale: 0.86, inset: 24 });
});
