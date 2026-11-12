// media 段的 retime（同一段變速、定格）、redact（打碼）、同一支錄影接著播硬接：真的轉檔，用畫面亮度反推素材時間
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { TOOLS, TEMPLATE, makeSrt } from './helpers.mjs';

const BUILD = path.join(TOOLS, 'build.mjs');
const FF = await import(path.join(TOOLS, 'lib', 'ff.mjs'));
const M = await import(path.join(TOOLS, 'lib', 'media.mjs'));
const ff = (args) => { const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...args], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
const dur = (f) => Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).stdout.trim());

let root, proj, tpl, out, ramp;
const REC = 'assets/screen/亮度.mp4';
// 素材：每秒亮度加 20（第 t 秒的 Y ≈ 16 + 20t），用亮度就能反推畫面是素材第幾秒
const srcAtFile = (f, at) => {
  const data = FF.rawFrame(f, { at, width: 16, height: 10 });
  const avg = data.reduce((s, v) => s + v, 0) / data.length;
  return avg / (20 * 255 / 219);   // 亮度 16–235 換成 RGB 0–255
};
const near = (got, want, tol, what) => assert.ok(Math.abs(got - want) <= tol, `${what}：畫面是素材第 ${got.toFixed(2)} 秒，應該是 ${want}`);

before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-retime-'));
  fs.mkdirSync(path.join(root, 'shared', 'sfx'), { recursive: true });
  tpl = path.join(root, 'shared', 'template');
  fs.symlinkSync(TEMPLATE, tpl, 'dir');
  for (const n of Object.keys(JSON.parse(fs.readFileSync(path.join(TEMPLATE, 'kit', 'sfx.json'), 'utf8')))) fs.copyFileSync(path.join(TEMPLATE, '..', 'sfx', 'ding.wav'), path.join(root, 'shared', 'sfx', `${n}.wav`));
  proj = path.join(root, 'projects', 'p1');
  for (const d of ['camera', 'voice', 'screen', 'images']) fs.mkdirSync(path.join(proj, 'assets', d), { recursive: true });
  out = path.join(proj, 'work', 'hyperframes');
  fs.mkdirSync(out, { recursive: true });
  ramp = path.join(proj, ...REC.split('/'));
  // 30 fps、關鍵影格很稀，和真的螢幕錄影一樣
  ff(['-f', 'lavfi', '-i', 'color=c=black:s=320x200:r=30:d=10', '-vf', "geq=lum='16+20*T':cb=128:cr=128", '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '300', '-pix_fmt', 'yuv420p', ramp]);
  ff(['-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '20', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(proj, 'work', 'rough.mp4')]);
  fs.writeFileSync(path.join(proj, 'work', 'rough.srt'), makeSrt({ n: 6 }));
});

const writePlan = (scenes) => fs.writeFileSync(path.join(out, 'plan.json'), JSON.stringify({ version: 1, look: false, speakerBox: [100, 100, 300, 300], scenes }, null, 2));
const run = (...args) => spawnSync(process.execPath, [BUILD, ...args, '--template', tpl, '--project', 'projects/p1'], { cwd: root, encoding: 'utf8', timeout: 180000 });
const checkJson = () => JSON.parse(run('--check', '--json').stdout);
const seg = (o) => ({ id: 'm01', type: 'media', src: REC, from: 3, to: 9, ...o });

test('encodeRetime：×2、定格、×1 接在一支檔案裡，長度＝段長，時間對得上素材', () => {
  const dst = path.join(root, 'rt.mp4');
  FF.encodeRetime(ramp, dst, { knots: [[0, 0], [2, 4], [3, 4], [5, 6]], width: 320, height: 200 });
  near(dur(dst), 5, 0.05, '檔案長度');
  near(srcAtFile(dst, 1), 2, 0.2, '×2 的中間');
  near(srcAtFile(dst, 2.5), 4, 0.2, '定格中');
  near(srcAtFile(dst, 2.95), 4, 0.2, '定格快結束');
  near(srcAtFile(dst, 4), 5, 0.2, '定格後 ×1');
});

test('retimeFilter：定格只留第一格（留到第二格的話，定格結束接下一段會倒退一格）', () => {
  const g = FF.retimeFilter([[0, 4], [2, 4], [3, 5]]);
  assert.match(g, /trim=start=4:duration=[\d.]+,select='eq\(n,0\)',setpts/);
});

test('encodeRetime：只解用到的區間，素材中段起播也對', () => {
  const dst = path.join(root, 'rt2.mp4');
  FF.encodeRetime(ramp, dst, { knots: [[0, 6], [1, 6.5], [2, 8.5]], width: 320, height: 200 });
  near(dur(dst), 2, 0.05, '檔案長度');
  near(srcAtFile(dst, 0.5), 6.25, 0.2, '×0.5');
  near(srcAtFile(dst, 1.5), 7.5, 0.2, '×2');
});

test('retime 欄位檢查：形狀、不能倒帶、擇一、速度上下限；--check 回報變速與 knots', () => {
  writePlan([seg({ retime: [{ at: '#2', src: 1 }] })]);
  assert.match(checkJson().errors.join('\n'), /retime 要寫 \[\{ "at": "#N@詞", "src": 秒數 \}, …\]，至少 2 點/);
  writePlan([seg({ in: 1, retime: [{ at: '+0', src: 1 }, { at: '+2', src: 3 }] })]);
  assert.match(checkJson().errors.join('\n'), /retime 和 in／out／speed／hold 擇一/);
  writePlan([seg({ retime: [{ at: '+0', src: 3 }, { at: '+2', src: 1 }] })]);
  assert.match(checkJson().errors.join('\n'), /錄影不能倒帶/);
  writePlan([seg({ retime: [{ at: '+0', src: 0 }, { at: '+5', src: 0.5 }] })]);
  assert.match(checkJson().errors.join('\n'), /下限 0\.25/);
  // 031：5 秒內的跳過等待可到 ×600（AI 跑好幾分鐘壓成 4.5 秒的等待）；這支錄影只有 10 秒，快不到上限
  writePlan([seg({ retime: [{ at: '+0', src: 0 }, { at: '+0.1', src: 9.9 }] })]);
  assert.doesNotMatch(checkJson().errors.join('\n'), /上限 ×16/);
  assert.deepEqual([M.WAIT.fast, M.WAIT.short], [600, 5]);
  writePlan([seg({ retime: [{ at: '+0', src: 99 }, { at: '+2', src: 100 }] })]);
  assert.match(checkJson().errors.join('\n'), /src 99 超出錄影長度/);

  writePlan([seg({ retime: [{ at: '+0', src: 1 }, { at: '+2', src: 5 }, { at: '+4', src: 5 }], moves: [{ at: '+1', to: [10, 10, 200, 125] }] })]);
  const j = checkJson();
  assert.deepEqual(j.errors, []);
  const a = j.items[0].out.annotations;
  // 段長 6 秒：最後一點之後正常速度
  assert.deepEqual(a.knots, [[0, 1], [2, 5], [4, 5], [6, 7]]);
  assert.equal(M.retimeText({ knots: a.knots, speeds: [2, 0, 1] }), '0–2s ×2、2–4s 定格、4–6s ×1');
});

test('retime：第一點之前也是正常速度；素材用完就停在最後一格', () => {
  writePlan([seg({ retime: [{ at: '+2', src: 5 }, { at: '+3', src: 9.5 }] })]);
  const a = checkJson().items[0].out.annotations;
  assert.deepEqual(a.knots, [[0, 3], [2, 5], [3, 9.5], [6, 10]]);
});

test('knots：一般、out、定格也換算好（剪輯台不會再顯示錯的素材時間）', () => {
  writePlan([seg({ in: 1 })]);
  assert.deepEqual(checkJson().items[0].out.annotations.knots, [[0, 1], [6, 7]]);
  writePlan([seg({ in: 1, out: 4 })]);
  assert.deepEqual(checkJson().items[0].out.annotations.knots, [[0, 1], [6, 4]]);
  writePlan([seg({ hold: 2.5 })]);
  assert.deepEqual(checkJson().items[0].out.annotations.knots, [[0, 2.5], [6, 2.5]]);
});

test('同一支錄影接著播：自動硬接，不疊化；跳到別的地方照舊疊化', () => {
  writePlan([seg({ to: 6, in: 0, out: 4 }), seg({ id: 'm02', from: 6, to: 9, in: 4, out: 6 })]);
  let j = checkJson();
  let [a, b] = j.items;
  assert.equal(a.exit, 'cut');
  assert.equal(b.enter, 'cut');
  writePlan([seg({ to: 6, in: 0, out: 4 }), seg({ id: 'm02', from: 6, to: 9, hold: 4 })]);
  [a, b] = checkJson().items;
  assert.equal(b.enter, 'cut', '定格接在終點');
  writePlan([seg({ to: 6, in: 0, out: 4 }), seg({ id: 'm02', from: 6, to: 9, in: 8, speed: 0.5 })]);
  [a, b] = checkJson().items;
  assert.equal(b.enter, 'fade', '跳到別的地方');
});

test('build：retime 段只轉一支、檔案長度＝段長；放大鏡與標註都用這支', () => {
  writePlan([seg({ retime: [{ at: '+0', src: 0 }, { at: '+2', src: 4 }, { at: '+4', src: 4 }], marks: [{ at: '+1', box: [20, 20, 100, 60] }] })]);
  const r = run();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /轉檔 assets\/screen\/亮度\.mp4 → assets\/media\/[\w-]+\.mp4（30fps、每秒一個關鍵影格、變速）/);
  const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  const file = html.match(/<video id="mv-m01[^>]*src="(assets\/media\/[\w-]+\.mp4)"/)?.[1];
  assert.ok(file, 'html 裡要有這支檔');
  near(dur(path.join(out, file)), 6, 0.1, '檔案長度');
  near(srcAtFile(path.join(out, file), 3), 4, 0.25, '定格');
});

test('redact：框裡讀不出來、框外不變；時間外不打碼；欄位檢查', () => {
  // 左邊 160 寬有高對比條紋，打碼前標準差很大
  const stripes = path.join(root, 'stripes.mp4');
  ff(['-f', 'lavfi', '-i', 'color=c=white:s=320x200:r=30:d=3', '-vf', "geq=lum='if(lt(mod(X,4),2),16,235)':cb=128:cr=128", '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', stripes]);
  const spread = (f, at, x0, x1) => {
    const d = FF.rawFrame(f, { at, width: 320, height: 200 });
    let min = 255, max = 0;
    for (let y = 80; y < 120; y++) for (let x = x0; x < x1; x++) { const v = d[(y * 320 + x) * 3]; if (v < min) min = v; if (v > max) max = v; }
    return max - min;
  };
  assert.ok(spread(stripes, 1, 40, 120) > 150, '原圖條紋要明顯');
  const dst = path.join(root, 'red.mp4');
  FF.encodeMedia(stripes, dst, { width: 320, height: 200, redact: [{ at: 1, until: 2, box: [20, 60, 120, 80] }] });
  assert.ok(spread(dst, 1.5, 40, 120) < 30, `時間內框裡要糊掉，現在差 ${spread(dst, 1.5, 40, 120)}`);
  assert.ok(spread(dst, 0.5, 40, 120) > 150, '時間前不打碼');
  assert.ok(spread(dst, 2.5, 40, 120) > 150, '時間後不打碼');
  assert.ok(spread(dst, 1.5, 200, 300) > 150, '框外不動');

  const jpg = path.join(root, 'red.jpg');
  ff(['-i', stripes, '-frames:v', '1', '-q:v', '2', jpg]);
  FF.redactImage(jpg, [{ box: [20, 60, 120, 80] }], 320, 200);
  assert.ok(spread(jpg, 0, 40, 120) < 30, '圖片也要糊掉');

  writePlan([seg({ redact: [{ box: [0, 0, 9999, 10] }] })]);
  assert.match(checkJson().errors.join('\n'), /redact\[0\]\.box .*超出素材範圍/);
  writePlan([seg({ redact: 'x' })]);
  assert.match(checkJson().errors.join('\n'), /redact 要寫成陣列/);
  writePlan([seg({ redact: [{ box: [20, 20, 100, 60] }] })]);
  assert.match(run('--check').stdout, /打碼 1 處/);
});

test('帳本：同一段素材放兩次 ⚠、定格和相接的不算、同一張圖不相鄰才算；assetUsage 算沒用到的', async () => {
  writePlan([seg({ id: 'm01', from: 1, to: 3, in: 2 }), seg({ id: 'm02', from: 4, to: 6, in: 3 })]);
  assert.match(checkJson().warnings.join('\n'), /\[m02 media\] 和 m01 重疊 亮度\.mp4 3–4s/);
  writePlan([seg({ id: 'm01', from: 1, to: 3, in: 2 }), seg({ id: 'm02', from: 4, to: 6, hold: 3 }), seg({ id: 'm03', from: 7, to: 9, in: 6 })]);
  assert.doesNotMatch(checkJson().warnings.join('\n'), /重疊/, '定格是停在那一格，不算重播；沒重疊的不報');
  writePlan([seg({ id: 'm01', from: 1, to: 3, retime: [{ at: '+0', src: 2 }, { at: '+2', src: 6 }] }), seg({ id: 'm02', from: 4, to: 6, in: 5 })]);
  assert.match(checkJson().warnings.join('\n'), /和 m01 重疊 亮度\.mp4 5–6s/);
  const IMG = 'assets/images/圖.png';
  ff(['-f', 'lavfi', '-i', 'color=c=gray:s=320x200', '-frames:v', '1', path.join(proj, ...IMG.split('/'))]);
  writePlan([seg({ id: 'm01', src: IMG, from: 1, to: 2 }), seg({ id: 'm02', src: IMG, from: 2, to: 3 }), seg({ id: 'm03', src: IMG, from: 5, to: 6 })]);
  const w = checkJson().warnings.join('\n');
  assert.doesNotMatch(w, /\[m02 media\] 和 m01 用同一張/, '相鄰的是同一張圖接著講');
  assert.match(w, /\[m03 media\] 和 m01 用同一張 圖\.png/);
  const u = M.assetUsage(proj, [{ type: 'media', src: IMG }]);
  assert.deepEqual([u.images.used, u.images.total, u.images.unused], [1, 1, []]);
  assert.equal(u.screen.used, 0);
  assert.ok(u.screen.total >= 1 && u.screen.unused.includes('亮度.mp4'));
  const { assetUsageLine } = await import(path.join(TOOLS, 'lib', 'flow.mjs'));
  assert.match(assetUsageLine(proj, [{ type: 'media', src: IMG }]), /^素材：錄影用了 0／\d+ 支、圖片用了 1／1 張；沒用到：亮度\.mp4/);
  fs.rmSync(path.join(proj, ...IMG.split('/')));
});

test('紅框全程查：平移出畫面、後來才被小視窗擋都 ⚠；說明卡的框被小視窗擋 ⚠', () => {
  writePlan([seg({ retime: undefined, in: 0, from: 1, to: 9, pip: false, marks: [{ at: '+1', until: '+7', box: [10, 10, 40, 20] }], moves: [{ at: '+2', to: [240, 140, 80, 50], dur: 1 }] })]);
  const w = checkJson().warnings.join('\n');
  assert.match(w, /marks\[0\] 在 0:\d+\.\d+ (整個跑到畫面外|有一部分在畫面外)/);
  writePlan([seg({ in: 0, from: 1, to: 9, callouts: [{ at: '+1', until: '+5', box: [280, 170, 30, 20], text: '設定', side: 'top' }] })]);
  const j = checkJson();
  assert.match(j.warnings.concat(j.errors).join('\n'), /callouts\[0\] 的框被右下角的子母畫面擋住/);
});

test('紅框跨運鏡：線寬反向補間，畫面上一直是 4px；沒有運鏡就不補', () => {
  writePlan([seg({ in: 0, from: 1, to: 9, pip: false, marks: [{ at: '+1', until: '+7', box: [100, 60, 40, 20] }], moves: [{ at: '+2', to: [40, 20, 160, 100], dur: 1.5 }] })]);
  assert.equal(run().status, 0);
  const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  const tw = [...html.matchAll(/tl\.fromTo\('#mmk-m01-1', \{ strokeWidth: ([\d.]+) \}, \{ strokeWidth: ([\d.]+),/g)].map((x) => [+x[1], +x[2]]);
  assert.equal(tw.length, 8);
  assert.equal(tw[0][0], 4, '運鏡前 4px');
  assert.ok(tw[7][1] < 4, '推近後線寬變細，放大回來還是 4px');
  for (let i = 1; i < 8; i++) assert.equal(tw[i][0], tw[i - 1][1], '一段接一段');
  writePlan([seg({ in: 0, from: 1, to: 9, pip: false, marks: [{ at: '+1', until: '+7', box: [100, 60, 40, 20] }] })]);
  assert.equal(run().status, 0);
  assert.doesNotMatch(fs.readFileSync(path.join(out, 'index.html'), 'utf8'), /strokeWidth/);
});

test('邊錄邊講的快轉段：三段都硬接，不疊化', () => {
  writePlan([seg({ id: 'sync01', from: 0, to: 3, in: 0, pip: false }), seg({ id: 'sync02', from: 3, to: 4.5, retime: [{ at: '+0', src: 3 }, { at: '+1.5', src: 8 }], pip: false }), seg({ id: 'sync03', from: 4.5, to: 6, in: 8, pip: false })]);
  const j = checkJson();
  assert.deepEqual(j.errors, []);
  assert.doesNotMatch(run('--check').stdout, /疊化/);
});

test('031 等待卡：沒人講話、×5 以上、至少 3 秒的快轉 → 畫面壓暗、等待卡（計時圈、實際經過的時間、在等什麼、快轉倍數）；快轉提早跑完、停在結果那一格，「滴」響完再過 0.1 秒人聲才回來；秒針（自備才有）響到圈跑完；一邊講一邊快轉、不夠快、太短、"wait": false 都沒有', () => {
  const it = (retime, extra = {}) => ({ start: 3, end: 9, rough0: [3, 9], media: { kind: 'video', retime }, ...extra });
  const rt = { knots: [[0, 0], [1, 1], [4.5, 21], [6, 22.5]], speeds: [1, 5.714, 1] };
  assert.deepEqual(M.waitSpans(it(rt), undefined, [{ start: 1, end: 4 }, { start: 7.5, end: 9 }]), [{ a: 4, b: 7.5, real: 20, speed: 5.714, knots: [1, 2] }]);
  assert.deepEqual(M.waitSpans(it(rt), undefined, [{ start: 1, end: 5 }]), [], '快轉的時候在講話：不是等待');
  assert.deepEqual(M.waitSpans(it({ knots: [[0, 0], [2.5, 50], [6, 53.5]], speeds: [20, 1] })), [], '不到 3 秒');
  assert.deepEqual(M.waitSpans(it({ knots: [[0, 0], [4, 16], [6, 18]], speeds: [4, 1] })), [], '×4 是加速，不是等待');
  assert.deepEqual(M.waitSpans(it({ knots: [[0, 0], [1, 6], [4, 36], [6, 38]], speeds: [6, 10, 1] })), [{ a: 3, b: 7, real: 36, speed: 9, knots: [0, 2] }], '連著的快轉併成一段');
  assert.deepEqual(M.waitSpans({ start: 10, end: 13.5, media: { kind: 'video', in: 5, out: 47, speed: 12, retime: null } }), [{ a: 10, b: 13.5, real: 42, speed: 12 }], '整段用 out 快轉');
  assert.deepEqual(M.waitSpans({ start: 10, end: 14, media: { kind: 'video', speed: 3, retime: null } }), [], '只寫 speed 的是加速');
  assert.deepEqual(M.waitSpans({ start: 10, end: 14, media: { kind: 'image' } }), []);

  // 真的 build：20 秒的錄影，第 4–7.5 秒沒人講話，3.5 秒跑完 18 秒（×5.14）
  const local = path.join(root, 'shared', 'sfx-local'), srtFile = path.join(proj, 'work', 'rough.srt'), srt0 = fs.readFileSync(srtFile, 'utf8');
  const LONG = 'assets/screen/長.mp4';
  ff(['-f', 'lavfi', '-i', 'color=c=black:s=320x200:r=30:d=20', '-vf', "geq=lum='16+10*T':cb=128:cr=128", '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '300', '-pix_fmt', 'yuv420p', path.join(proj, ...LONG.split('/'))]);
  const kit = JSON.parse(fs.readFileSync(path.join(TEMPLATE, 'kit', 'sfx.json'), 'utf8'));
  // 「滴」響完再過 0.1 秒人聲才回來：圈跑完＝等待結束前（滴的長度−峰值＋0.1 秒＋1 格）
  const dingLen = dur(path.join(root, 'shared', 'sfx', 'ding.wav'));
  const lead = +(dingLen - kit.ding.peak + 0.1 + 1 / 30).toFixed(3), end = +(7.5 - lead).toFixed(3), cardSec = +(end - 4).toFixed(3);
  const dingAt = +(end - kit.ding.peak + 1 / 30).toFixed(3);
  assert.ok(Math.abs(dingAt + dingLen + 0.1 - 7.5) < 0.002, `滴在 ${dingAt} 開始、響 ${dingLen} 秒，結束後 0.1 秒是 7.5（人聲）`);
  const env = { ...process.env, AUTO_EDIT_NO_LOCAL_SFX: '0' };
  const runL = (...args) => spawnSync(process.execPath, [BUILD, ...args, '--template', tpl, '--project', 'projects/p1'], { cwd: root, encoding: 'utf8', timeout: 180000, env });
  const wait = { src: LONG, retime: [{ at: '+1', src: 0 }, { at: '+4.5', src: 18 }], pip: false };
  const rx = (x) => String(x).replace('.', '\\.');
  try {
    fs.writeFileSync(srtFile, '1\n00:00:01,000 --> 00:00:04,000\n第 1 句字幕內容\n\n2\n00:00:07,500 --> 00:00:09,000\n第 2 句字幕內容\n');
    // 沒有自備秒針（預設的測試環境）：等待卡照樣有，音效只有 ding
    writePlan([seg({ ...wait, wait: 'AI 逐張辨識收據｜寫入 Excel' })]);
    const j = checkJson();
    assert.deepEqual(j.errors, []);
    const speed = +(18 / cardSec).toFixed(3);
    assert.deepEqual(j.items[0].out.annotations.waits, [{ k: 1, at: 4, until: 7.5, real: 18, speed, text: 'AI 逐張辨識收據｜寫入 Excel' }]);
    assert.deepEqual(j.items[0].out.annotations.knots, [[0, 0], [1, 0], [+(1 + cardSec).toFixed(3), 18], [4.5, 18], [6, 19.5]], '快轉提早跑完，後面停在結果那一格到等待結束');
    assert.deepEqual(j.items[0].sfx.map((c) => [c.name, c.at]), [['ding', dingAt]]);
    assert.match(run('--check').stdout, new RegExp(`定格、4\\.5–6s ×1、等待卡 1（快轉 ${Math.round(speed)} 倍、實際 18 秒）`), '快轉後面多一段定格（停在結果那一格）');
    const b = run();
    assert.equal(b.status, 0, b.stdout + b.stderr);
    let html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
    assert.match(html, /<div id="mwd-m01-1" class="clip mdim" data-start="4" data-duration="3\.5" /, '壓暗層的時間＝整段等待（收的時候自己淡出）');
    assert.match(html, /<div id="mwk-m01-1" class="mwait__card"[^>]*>[\s\S]*?<span id="mwt-m01-1" class="mwait__time">0:00<\/span>[\s\S]*?<div class="mwait__title">AI 逐張辨識收據<\/div>\s*<div class="mwait__sub">寫入 Excel<\/div>[\s\S]*?<span>快轉 \d+ 倍<\/span>/);
    assert.match(html, new RegExp(`M\\.count\\('#mwt-m01-1', 4, \\{ from: 0, to: 18, dur: ${rx(cardSec)}, ease: 'none', clock: true \\}\\);`), '數字從 0:00 跑到實際經過的 18 秒，圈跑完就停');
    assert.match(html, new RegExp(`tl\\.fromTo\\('#mwk-m01-1', \\{ opacity: 1, scale: 1 \\}, \\{ opacity: 0, scale: 1\\.04, duration: 0\\.2, [^}]*\\}, ${rx(end)}\\);`), '圈跑完那一刻卡片收掉，露出結果');
    // 沒寫在等什麼：卡片寫「處理中」，--check 提醒
    writePlan([seg(wait)]);
    assert.match(run('--check').stdout, /⚠ \[m01 media\] 等待卡（1–4\.5s，實際 18 秒）沒有寫在等什麼，卡片上只會寫「處理中」→ 這段加 "wait": "在等什麼"/);
    assert.equal(checkJson().items[0].out.annotations.waits[0].text, '處理中');
    // 自備了秒針：從等待開始響到圈跑完，只播那一段；自備的 ding 沒放，照內建的長度算
    fs.mkdirSync(local, { recursive: true });
    ff(['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono:d=0.2', '-f', 'lavfi', '-i', 'sine=frequency=880:duration=6:sample_rate=48000', '-filter_complex', '[0][1]concat=n=2:v=0:a=1,volume=0.2', path.join(local, 'tick.wav')]);
    const jl = JSON.parse(runL('--check', '--json').stdout);
    assert.deepEqual(jl.items[0].sfx.map((c) => [c.name, c.at, c.dur ?? null]), [['tick', 4, cardSec], ['ding', dingAt, null]]);
    assert.equal(runL().status, 0);
    html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
    assert.match(html, new RegExp(`<audio id="sfx-m01-e1" src="assets/sfx/tick\\.wav" data-start="4" data-duration="${rx(cardSec)}" data-media-start="0\\.1[0-9]*" `), '秒針只播到圈跑完，從第一下前面一點開始');
    assert.ok(fs.existsSync(path.join(out, 'assets', 'sfx', 'tick.wav')), '自備的檔有複製進專案');
    // "sfxExtra": false：卡片還在、音效關掉、不用等滴（圈跑到等待結束前 0.2 秒，不定格）；"wait": false：卡片和音效都沒有
    writePlan([seg({ ...wait, sfxExtra: false })]);
    const q = JSON.parse(runL('--check', '--json').stdout).items[0];
    assert.deepEqual([q.sfx, q.out.annotations.waits.length, q.out.annotations.knots], [[], 1, [[0, 0], [1, 0], [4.5, 18], [6, 19.5]]]);
    writePlan([seg({ ...wait, wait: false })]);
    const off = JSON.parse(runL('--check', '--json').stdout).items[0];
    assert.deepEqual([off.sfx, off.out.annotations.waits], [[], []]);
    // 一邊講一邊快轉（第 2 句提早到 4.5 秒開口）：不是等待
    fs.writeFileSync(srtFile, '1\n00:00:01,000 --> 00:00:04,000\n第 1 句字幕內容\n\n2\n00:00:04,500 --> 00:00:09,000\n第 2 句字幕內容\n');
    writePlan([seg({ ...wait, wait: 'AI 安裝套件' })]);
    assert.deepEqual(checkJson().items[0].out.annotations.waits, []);
    assert.match(run('--check').stdout, /wait：這段沒有「×5 以上、至少 3 秒、沒人講話」的快轉，等待卡不會出現/);
    // wait 寫錯
    writePlan([seg({ ...wait, wait: '一二三四五六七八九十一二三' })]);
    assert.match(checkJson().errors.join('\n'), /wait 要寫在等什麼：1–2 行、用「｜」分行、每行 1–12 字/);
  } finally { fs.writeFileSync(srtFile, srt0); fs.rmSync(local, { recursive: true, force: true }); }
});
