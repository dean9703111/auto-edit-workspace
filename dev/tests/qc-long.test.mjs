// qc.mjs 長片：storyboard --only／--sheet／併發／跳過範例原文、final 併進靜止與被蓋住（只出文字）、一次解碼、總覽圖長片要到片尾
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { imp, hasChrome, makeSrt, TEMPLATE, TOOLS, missingTools, fixture as shared } from './helpers.mjs';

const Q = await imp('qc.mjs');
const CHROME = await hasChrome();
// 都要 ffmpeg 做片子；專案那幾個另外要 Chrome：缺一個就略過
const NO_FF = await missingTools('ffmpeg');
const NO_UI = (!CHROME && '沒有 HyperFrames 的 Chrome，略過') || NO_FF;
const TMP = [];
const mkTmp = (p) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), p)); TMP.push(d); return d; };
after(() => { for (const d of TMP) fs.rmSync(d, { recursive: true, force: true }); });
const ffmpeg = (args) => { const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...args], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
const dims = (f) => spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f], { encoding: 'utf8' }).stdout.trim();

// ---------- 純函式 ----------

test('總覽圖：短片每 10 秒一格不變；長片拉長間隔到整片都有格子（以前 80 格就截斷，13 分鐘之後看不到）；> 40 格改小格', () => {
  assert.deepEqual(Q.sheetTimes(24), [0, 10, 20, 23.7]);
  assert.equal(Q.sheetStepOf(800), 10);
  assert.equal(Q.sheetStepOf(931), 15);
  assert.equal(Q.sheetStepOf(1800), 25);
  const ts = Q.sheetTimes(1800);
  assert.ok(ts.length <= 81, `${ts.length} 格`);
  assert.ok(ts[ts.length - 1] > 1790, `最後一格在 ${ts[ts.length - 1]}，要到片尾`);
  assert.deepEqual(Q.qcSheetLayout(24).cols, 4);
  const L = Q.qcSheetLayout(1800);
  assert.deepEqual([L.cols, L.cw, L.ch, L.step], [8, 240, 135, 25]);
  const V = Q.qcSheetLayout(1800, { format: 'portrait', W: 1080, H: 1920 });
  assert.deepEqual([V.cols, V.cw, V.ch], [12, 135, 240]);
  assert.deepEqual(Q.qcSheetLayout(30, { format: 'portrait', W: 1080, H: 1920 }).cols, 6);
});

test('stillIssues：只看錄影、圖片段；聲音還在講才報；講者畫面、字卡、章節、沒聲音、沒字幕的配樂區間不報', () => {
  const items = [
    { id: 's01', type: 'scene', label: '01 章節轉場', start: 0, end: 12, opaque: true, out: { pip: [] } },
    { id: 's02', type: 'scene', label: '04a 全畫面清單', start: 20, end: 40, opaque: true, out: { pip: [] } },
    { id: 's03', type: 'media', key: 'media', label: 'media a.mp4', start: 50, end: 70, opaque: true, out: { pip: [{ start: 50, end: 70 }] } },
    { id: 's04', type: 'media', key: 'media', label: 'media b.mp4', start: 85, end: 120, opaque: true, out: { pip: [] } },
  ];
  const segs = items.map((x) => ({ id: x.id, start: x.start, end: x.end }));
  const cues = [{ n: 1, start: 50, end: 75, text: '一直講' }, { n: 2, start: 100, end: 120, text: '再講' }, { n: 3, start: 130, end: 150, text: '講者畫面' }];
  const run = (r, extra = {}) => Q.stillIssues(r, { items, segs, cues, ...extra });
  assert.deepEqual(run([[52, 62]]), [{ from: 52, to: 62, id: 's03', cue: '#1 一直講' }]);
  assert.deepEqual(run([[22, 32]]), [], '字卡本來就靜止');
  assert.deepEqual(run([[1, 11]]), [], '章節轉場本來就靜止');
  assert.deepEqual(run([[131, 145]]), [], '講者畫面（沒有段）不報：門檻附近不穩，凍結另外查');
  assert.deepEqual(run([[100, 110]], { silences: [[100, 106]] }), [], '扣掉沒聲音的 6 秒只剩 4 秒');
  assert.deepEqual(run([[100, 120]], { silences: [[100, 106]] }).map((s) => [s.from, s.to]), [[106, 120]]);
  assert.deepEqual(run([[85, 95]]), [], '有聲音但沒字幕（結尾配樂）不算在講');
  assert.deepEqual(run([[100, 104]]), [], '不到 8 秒');
  // 沒有字幕檔：只看 silencedetect
  assert.deepEqual(Q.stillIssues([[85, 95]], { items, segs, cues: [] }).map((s) => s.from), [85]);
  // 超出錄影段的部分不算，剩下的還夠長才報
  assert.deepEqual(run([[60, 80]]).map((s) => [s.from, s.to]), [[60, 70]]);
  assert.deepEqual(run([[65, 80]]), [], '錄影段裡只有 5 秒');
});

test('judge：靜止、被蓋住是 ⚠、提示 observe --from --to；沒有就 ✔；沒給這兩項（舊呼叫）不印；太多只列前 12 段', () => {
  const base = { width: 1920, height: 1080, fps: 30, hasAudio: true, dur: 200, expected: 200, loud: { i: -14, tp: -2 }, freezes: [], blacks: [], silences: [], project: 'projects/p1' };
  assert.equal(Q.judge(base).checks.some((c) => ['still', 'covered'].includes(c.key)), false);
  const ok = Q.judge({ ...base, stills: [], covered: [] });
  assert.equal(ok.warnings, 0);
  assert.equal(ok.checks.filter((c) => ['still', 'covered'].includes(c.key) && c.level === 'ok').length, 2);
  const w = Q.judge({ ...base, stills: [{ from: 52, to: 62, id: 's03', cue: '#1 一直講' }], covered: [{ id: 's03', by: 'x01', msg: 's03 的「字」在 0:18.70 才完整出現，但 x01 在 0:17.83 就蓋住了，觀眾看不到 → 改', from: 17.83, to: 18.7 }] });
  assert.equal(w.ok, true);
  assert.equal(w.warnings, 2);
  const st = w.checks.find((c) => c.key === 'still');
  assert.match(st.text, /0:52\.0–1:02\.0 聲音還在講、畫面 10\.0 秒沒動（s03｜#1 一直講）→ .*要看這段：node shared\/template\/tools\/qc\.mjs observe --project projects\/p1 --from 51 --to 63$/);
  assert.match(w.checks.find((c) => c.key === 'covered').text, /觀眾看不到 → 改；要看這段：node shared\/template\/tools\/qc\.mjs observe --project projects\/p1 --from 16 --to 20$/);
  // observe 的範圍不超過片長
  assert.match(Q.judge({ ...base, stills: [{ from: 190, to: 199.7, id: null, cue: null }] }).checks.find((c) => c.key === 'still').text, /（主軌講解）.*--from 189 --to 200$/);
  const many = Q.judge({ ...base, stills: Array.from({ length: 15 }, (_, i) => ({ from: i * 10, to: i * 10 + 9, id: null, cue: null })) });
  assert.equal(many.checks.filter((c) => c.key === 'still').length, Q.STILL_SHOW + 1);
  assert.match(many.checks.filter((c) => c.key === 'still').at(-1).text, /還有 3 段畫面沒動（2:00\.0、2:10\.0、2:20\.0）/);
});

test('shotPlan：only 只排指名的段（沒指名的段照樣算蓋住）；covers 是「被蓋住」的結構版', () => {
  const x01 = { id: 'x01', type: 'custom', opaque: true, start: 17.83, end: 32, lists: [], annotations: null };
  const s03 = { id: 's03', type: 'scene', opaque: false, start: 11.41, end: 18.33, lists: [], annotations: null };
  const tw = new Map([['s03', [[11.41, 11.96, 'enter', ''], [18.1, 18.7, 'enter', '節省時間的免費工具']]], ['x01', []]]);
  const all = Q.shotPlan([s03, x01], 60, tw);
  assert.deepEqual(all.shots.map((s) => s.id), ['s03', 'x01']);
  assert.equal(all.covers.length, 1);
  assert.deepEqual([all.covers[0].id, all.covers[0].by, all.covers[0].from, all.covers[0].to], ['s03', 'x01', 17.83, 18.7]);
  assert.equal(all.covers[0].msg, all.warnings[0]);
  const one = Q.shotPlan([s03, x01], 60, tw, null, new Set(['s03']));
  assert.deepEqual(one.shots.map((s) => [s.id, s.at]), [['s03', 17.73]], '沒截 x01，照樣知道被它蓋住');
  assert.deepEqual(Q.shotPlan([s03, x01], 60, tw, null, new Set(['x01'])).warnings, [], '只排 x01 就不報 s03');
});

test('jobsOf、parseArgs：storyboard 的 --only、--sheet、--jobs、--verbose', () => {
  assert.equal(Q.jobsOf(undefined), 4);
  assert.throws(() => Q.jobsOf('9'), /--jobs 要是 1–8 的整數，現在是「9」→ 改成 1–8/);
  assert.deepEqual(Q.parseArgs(['storyboard', '--only', 's05,s12', '--sheet', '--jobs=2', '--verbose']), { cmd: 'storyboard', only: 's05,s12', sheet: true, jobs: '2', verbose: true });
  const r = spawnSync(process.execPath, [path.join(TOOLS, 'qc.mjs'), 'final', '--only', 's05', '--project', 'projects/x'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--only 只有 storyboard 用 → 拿掉 --only/);
});

// ---------- 一次解碼（只要 ffmpeg）----------

test('analyzeFinal：一次解碼算出凍結、黑畫面、靜止灰階、無聲、響度；總覽圖格子和 -ss 抽到的是同一格；凍結和全解析 30 格的結果對得上', { timeout: 120000, skip: NO_FF }, () => {
  const dir = mkTmp('hf-qc-an-');
  const mp4 = path.join(dir, 'a.mp4');
  // 0–6 秒有雜訊、6–16 靜止、16–20 有雜訊、20–21 全黑、21–30 有雜訊；聲音 0–24、24–30 沒聲音
  ffmpeg(['-f', 'lavfi', '-i', "color=c=gray:s=640x360:r=30:d=30,noise=alls=80:allf=t:enable='lt(t,6)+gte(t,16)',drawbox=c=black:t=fill:enable='between(t,20,21)'",
    '-f', 'lavfi', '-i', "sine=frequency=440:sample_rate=48000:d=30,volume=enable='gte(t,24)':volume=0", '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', mp4]);
  const layout = Q.qcSheetLayout(30);
  const r = Q.analyzeFinal(mp4, 30, true, { sheet: layout });
  assert.equal(r.freezes.length, 1, JSON.stringify(r.freezes));
  assert.ok(Math.abs(r.freezes[0][0] - 6) <= 0.2 && Math.abs(r.freezes[0][1] - 16) <= 0.2, JSON.stringify(r.freezes));
  assert.ok(r.blacks.some(([a, b]) => Math.abs(a - 20) <= 0.2 && Math.abs(b - 21) <= 0.2), JSON.stringify(r.blacks));
  assert.ok(r.silences.some(([a, b]) => Math.abs(a - 24) <= 0.5 && Math.abs(b - 30) <= 0.5), JSON.stringify(r.silences));
  assert.ok(r.loud.found);
  assert.equal(r.statics.length, 1, JSON.stringify(r.statics));
  assert.ok(Math.abs(r.statics[0][0] - 6) <= 0.5 && Math.abs(r.statics[0][1] - 16) <= 0.5, JSON.stringify(r.statics));
  // 全解析、30 格的舊做法：凍結起點差 ≤ 0.2 秒
  const full = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', mp4, '-an', '-vf', `freezedetect=n=-60dB:d=3`, '-f', 'null', '-'], { encoding: 'utf8' });
  const f0 = Q.parseFreeze(full.stderr, 30);
  assert.ok(Math.abs(f0[0][0] - r.freezes[0][0]) <= 0.2, `${JSON.stringify(f0)} vs ${JSON.stringify(r.freezes)}`);
  // 灰階的時間和 observe 一樣是每 0.5 秒；總覽圖格子是標的那一秒（亮度遞增的片子比 -ss 抽到的）
  const ramp = path.join(dir, 'ramp.mp4');
  ffmpeg(['-f', 'lavfi', '-i', "nullsrc=s=64x36:r=30:d=45,geq=lum='min(255,T*5)':cb=128:cr=128", '-c:v', 'libx264', '-preset', 'ultrafast', '-qp', '0', '-pix_fmt', 'yuv420p', ramp]);
  const L2 = Q.qcSheetLayout(45);
  const r2 = Q.analyzeFinal(ramp, 45, false, { sheet: L2 });
  assert.equal(r2.loud, null);
  const lumaAt = (buf) => buf[Math.floor(buf.length / 2)];
  for (const t of L2.times.filter((x) => r2.frames.has(x))) {
    const one = spawnSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', ramp, '-frames:v', '1', '-vf', `scale=${L2.cw}:${L2.ch}:flags=bicubic`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']).stdout;
    assert.ok(Math.abs(lumaAt(r2.frames.get(t)) - lumaAt(one)) <= 1, `第 ${t} 秒：${lumaAt(r2.frames.get(t))} vs ${lumaAt(one)}`);
  }
  assert.ok(r2.frames.size >= 4);
  assert.ok(!r2.frames.has(L2.times.at(-1)), '最後一格（片尾前 0.3 秒）不在等間隔上，另外抽');
  // makeQcSheet 用抽好的格子，最後一格自己抽
  const out = path.join(dir, 'qc.jpg');
  const sheet = Q.makeQcSheet(ramp, 45, out, 'light', null, { layout: L2, frames: r2.frames });
  assert.equal(sheet.count, L2.times.length);
  assert.equal(sheet.step, 10);
  assert.ok(fs.existsSync(out));
});

// ---------- 專案（要 Chrome）----------

function fixture(srtN = 12, dur = 46) {
  const root = mkTmp('hf-qc-long-');
  fs.mkdirSync(path.join(root, 'shared', 'sfx'), { recursive: true });
  fs.symlinkSync(TEMPLATE, path.join(root, 'shared', 'template'), 'dir');
  for (const n of Object.keys(JSON.parse(fs.readFileSync(path.join(TEMPLATE, 'kit', 'sfx.json'), 'utf8')))) fs.copyFileSync(path.join(TEMPLATE, '..', 'sfx', 'ding.wav'), path.join(root, 'shared', 'sfx', `${n}.wav`));
  const proj = path.join(root, 'projects', 'p1'), out = path.join(proj, 'work', 'hyperframes');
  fs.mkdirSync(path.join(out, 'compositions'), { recursive: true });
  // 同樣長度的片子這一輪只做一次，各專案複製一份（測試會在專案裡改東西）
  const src = shared(`qc-long-rough-${dur}s.mp4`, (f) => ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', String(dur), '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', f]));
  fs.copyFileSync(src, path.join(proj, 'work', 'rough.mp4'));
  fs.writeFileSync(path.join(proj, 'work', 'rough.srt'), makeSrt({ n: srtN }));   // #N 起點 (N−1)×3.5＋1
  const tool = (t) => (...args) => spawnSync(process.execPath, [path.join(TOOLS, t), ...args, '--project', 'projects/p1'], { encoding: 'utf8', cwd: root });
  return { root, proj, out, dir: path.join(proj, 'work', 'storyboard-preview'), qc: tool('qc.mjs'), build: tool('build.mjs') };
}
const plan = (F, scenes) => fs.writeFileSync(path.join(F.out, 'plan.json'), JSON.stringify({ version: 1, look: false, check: { textSync: false }, speakerBox: [400, 80, 900, 700], rhythm: 'spaced', scenes }));
const keyCard = (id, n) => ({ id, scene: 'key-point', from: `#${n}`, to: `#${n + 1}e`, slots: { lead: '下方字卡', key: `重點 ${id}` } });
const listCard = (id, n) => ({ id, scene: 'fs-list', from: `#${n}`, to: `#${n + 1}e`, slots: { title: `清單 ${id}`, items: ['第一', '第二', '第三'] } });
const mtime = (f) => fs.statSync(f).mtimeMs;

test('storyboard：範例原文跳過並印一行；--sheet 拼圖每格標段 id 與為什麼；shots.json；預設安靜；--only 只重截、其他段不動、只重做有動到的頁', { skip: NO_UI, timeout: 600000 }, () => {
  const F = fixture();
  // x01：範例原封不動複製（還是範例原文）；其他段是做好的
  fs.copyFileSync(path.join(TEMPLATE, 'custom', 'x-fix.html'), path.join(F.out, 'compositions', 'x-fix.html'));
  plan(F, [keyCard('s01', 1), { id: 'x01', type: 'custom', src: 'compositions/x-fix.html', layout: 'fullscreen', from: '#3', to: '#4e' }, listCard('s02', 5), keyCard('s03', 7)]);
  let r = F.build();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  fs.mkdirSync(F.dir, { recursive: true });
  fs.writeFileSync(path.join(F.dir, 'x01.png'), 'old');     // 以前截過的範例圖：這次不截，清掉
  fs.writeFileSync(path.join(F.dir, 'gone.png'), 'old');    // 不在 plan.json 的段：留給使用者
  r = F.qc('storyboard', '--sheet');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^截圖：\d+ 張（4 段；/m);
  assert.match(r.stdout, /^略過 1 段（還是範例原文、還沒做）：x01$/m);
  assert.doesNotMatch(r.stdout, /^s01｜/m, '預設不印每張的表');
  assert.doesNotMatch(r.stdout, /^!\[s01\]/m, '預設不印貼上用的 markdown');
  assert.match(r.stdout, /^→ 拼圖 1 頁（每頁 12 張，每格標時間、段 id、為什麼）：projects\/p1\/work\/storyboard-preview\/sheet-01\.jpg/m);
  assert.match(r.stdout, /shots\.json/);
  assert.match(r.stdout, /清掉同一段的舊截圖（這次張數變了）：x01\.png/);
  assert.match(r.stdout, /⚠ 舊截圖 gone\.png 不在這次的 plan\.json 裡/);
  assert.ok(!fs.existsSync(path.join(F.dir, 'x01.png')));
  assert.ok(fs.existsSync(path.join(F.dir, 'gone.png')));
  assert.match(dims(path.join(F.dir, 'sheet-01.jpg')), /^1920,\d+$/);
  assert.ok(!fs.readdirSync(F.dir).some((f) => f.endsWith('.html')), '排版用的 html 要清掉');
  // shots.json：每段的截圖清單與「為什麼」（分鏡表產生器讀這個）
  const mf = JSON.parse(fs.readFileSync(path.join(F.dir, 'shots.json'), 'utf8'));
  assert.deepEqual([...new Set(mf.shots.map((s) => s.id))], ['s01', 's02', 's03']);
  for (const s of mf.shots) { assert.ok(s.why && s.file && Number.isFinite(s.at) && s.md, JSON.stringify(s)); assert.ok(fs.existsSync(path.join(F.dir, s.file))); }
  assert.deepEqual(mf.skipped, ['x01']);
  assert.deepEqual(mf.sheets.map((x) => x.file), ['sheet-01.jpg']);
  // --verbose：全表與 markdown
  const v = F.qc('storyboard', '--verbose');
  assert.match(v.stdout, /^s01｜.*｜storyboard-preview\/s01\.png$/m);
  assert.match(v.stdout, /^!\[s01\]\(storyboard-preview\/s01\.png\)$/m);
  // --only：只重截 s02；別段的檔不動；回傳帶整支
  fs.writeFileSync(path.join(F.dir, 's02.png'), 'stale');
  r = F.qc('storyboard', '--sheet');
  const t01 = mtime(path.join(F.dir, 's01.png')), t03 = mtime(path.join(F.dir, 's03.png')), sh = mtime(path.join(F.dir, 'sheet-01.jpg'));
  r = F.qc('storyboard', '--only', 's02', '--sheet', '--json');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const j = JSON.parse(r.stdout);
  assert.deepEqual([...new Set(j.shots.map((s) => s.id))], ['s02']);
  assert.deepEqual([...new Set(j.allShots.map((s) => s.id))], ['s01', 's02', 's03']);
  assert.deepEqual(j.only, ['s02']);
  assert.deepEqual(j.skipped, ['x01'], '沒指名的範例原文照樣算略過');
  assert.equal(mtime(path.join(F.dir, 's01.png')), t01, '別段不重截');
  assert.equal(mtime(path.join(F.dir, 's03.png')), t03);
  assert.ok(mtime(path.join(F.dir, 'sheet-01.jpg')) >= sh);
  assert.equal(j.sheets[0].redone, true);
  assert.ok(fs.existsSync(path.join(F.dir, 's01.png')), '--only 不清別段的截圖');
  // --only 指名範例原文：照截（和 audit 一樣）；不存在的段 ✖
  const named = JSON.parse(F.qc('storyboard', '--only', 'x01', '--json').stdout);
  assert.ok(named.shots.every((s) => s.id === 'x01') && named.shots.length >= 1);
  const bad = F.qc('storyboard', '--only', 'nope');
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /✖ --only 的 nope 不在 plan\.json（或整段被 edit\.cuts 剪掉了）→ 現有：s01、x01、s02、s03/);
  // 別段壞掉（x 檔改到一半，plan.json 沒動）：--only 照截、印一行；整片擋（和 audit --only 一樣）
  const xf = path.join(F.out, 'compositions', 'x-fix.html'), html = fs.readFileSync(xf, 'utf8'), at = html.lastIndexOf('P.end()');
  fs.writeFileSync(xf, `${html.slice(0, at)}P.at('#2@沒有這個詞'); ${html.slice(at)}`);
  const go = F.qc('storyboard', '--only', 's02');
  assert.equal(go.status, 0, go.stdout + go.stderr);
  assert.match(go.stdout, /^其他段有 \d+ 個 ✖（不影響這段）$/m);   // 改過就不算範例原文，範例自己的句號也會報
  const whole = F.qc('storyboard');
  assert.equal(whole.status, 1);
  assert.match(whole.stderr, /✖ plan\.json 有 \d+ 個 ✖（第一個：.*）→ 照 build\.mjs --check 的 → 修好，再跑 build、再截圖/);
  const self = F.qc('storyboard', '--only', 'x01');
  assert.equal(self.status, 1, '指名段自己的 ✖ 照擋');
  // 上次有拼圖、--only 沒加 --sheet：有動到的頁照樣重做（不留過期的圖）；整支重截沒加 --sheet：舊頁清掉
  fs.writeFileSync(xf, html);
  assert.equal(F.qc('storyboard', '--sheet').status, 0);
  const sh2 = mtime(path.join(F.dir, 'sheet-01.jpg'));
  const o3 = F.qc('storyboard', '--only', 's02');
  assert.match(o3.stdout, /→ 拼圖 1 頁.*這次重做 sheet-01\.jpg/);
  assert.ok(mtime(path.join(F.dir, 'sheet-01.jpg')) > sh2);
  assert.equal(F.qc('storyboard').status, 0);
  assert.ok(!fs.existsSync(path.join(F.dir, 'sheet-01.jpg')), '整支重截沒加 --sheet：舊頁清掉');
});

test('storyboard --jobs：多個截圖行程，張數、時間、為什麼和一個行程一樣；張數少時不開多的；--json 結構相容', { skip: NO_UI, timeout: 900000 }, () => {
  const F = fixture(24, 90);
  const scenes = [];
  for (let k = 0; k < 11; k++) scenes.push(k % 2 ? listCard(`s${String(k + 1).padStart(2, '0')}`, k * 2 + 1) : keyCard(`s${String(k + 1).padStart(2, '0')}`, k * 2 + 1));
  plan(F, scenes);
  let r = F.build();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const pick = (j) => j.shots.map(({ id, file, at, why }) => ({ id, file, at, why }));
  r = F.qc('storyboard', '--jobs', '1', '--json');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const one = JSON.parse(r.stdout);
  assert.ok(one.shots.length >= 11);
  for (const k of ['ok', 'format', 'dir', 'shots', 'warnings', 'stale', 'cleared']) assert.ok(k in one, k);
  r = F.qc('storyboard', '--jobs', '2');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /2 個行程併發/);
  const two = JSON.parse(fs.readFileSync(path.join(F.dir, 'shots.json'), 'utf8'));
  assert.deepEqual(pick(two), pick(one));
  for (const s of two.shots) assert.ok(fs.statSync(path.join(F.dir, s.file)).size > 1000, s.file);
  assert.ok(!fs.existsSync(path.join(F.out, '.storyboard-shots')), '暫存截圖要刪掉');
  // 只有一張：只開一個
  assert.doesNotMatch(F.qc('storyboard', '--only', 's01', '--jobs', '4').stdout, /行程併發/);
});

test('直式：storyboard --sheet 每格 9:16（一列 6 格）、audit --only --sheet 也是直的', { skip: NO_UI, timeout: 300000 }, () => {
  const F = fixture();
  ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=360x640:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '46', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(F.proj, 'work', 'rough.mp4')]);
  fs.writeFileSync(path.join(F.out, 'plan.json'), JSON.stringify({ version: 1, format: 'portrait', look: false, check: { textSync: false }, speakerBox: [100, 400, 980, 860], rhythm: 'spaced', scenes: [keyCard('s01', 1), keyCard('s02', 4)] }));
  const b = F.build();
  assert.equal(b.status, 0, b.stdout + b.stderr);
  const r = F.qc('storyboard', '--sheet');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^版式：直式 1080×1920/m);
  assert.equal(dims(path.join(F.dir, 'sheet-01.jpg')), `1920,${40 + 480 + 52}`);
  const a = spawnSync(process.execPath, [path.join(TOOLS, 'audit.mjs'), '--project', 'projects/p1', '--only', 's01', '--sheet'], { encoding: 'utf8', cwd: F.root });
  assert.match(a.stdout, /audit-shots\/sheet-s01\.jpg/, a.stdout + a.stderr);
  const [w, h] = dims(path.join(F.proj, 'work', 'audit-shots', 'sheet-s01.jpg')).split(',').map(Number);
  assert.equal(w, 1920);
  assert.ok(h > 500, `每格要是直的，現在高 ${h}`);
});

test('final：併進靜止與被蓋住、只出文字；字卡段不報靜止；沒有講者小視窗照樣 ✖；總覽圖照舊', { skip: NO_UI, timeout: 600000 }, () => {
  const F = fixture();
  // s02 有小視窗、s03 pip: false：都是字卡，畫面靜止＋聲音在講也不報（靜止只看錄影、圖片段）
  plan(F, [listCard('s02', 3), { ...listCard('s03', 8), pip: false }]);
  assert.equal(F.build().status, 0);
  // 完成影片：0–10 秒靜止但講話中（#3 從 8 秒起有字幕；#1–#2 也有），字幕整段都有
  const mp4 = path.join(F.proj, 'output', 'final.mp4');
  fs.mkdirSync(path.dirname(mp4), { recursive: true });
  ffmpeg(['-f', 'lavfi', '-i', "color=c=gray:s=1920x1080:r=30:d=46,noise=alls=80:allf=t:enable='lt(t,12)+between(t,24,27)+gte(t,42)'", '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:d=46', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', mp4]);
  let r = F.qc('final', '--json');
  const j = JSON.parse(r.stdout);
  assert.ok(Array.isArray(j.stills), r.stdout.slice(0, 300));
  assert.ok(Array.isArray(j.covered));
  assert.deepEqual(j.stills, [], JSON.stringify(j.stills));
  r = F.qc('final');
  assert.match(r.stdout, /✓ 錄影、圖片段沒有聲音還在講/);
  assert.match(r.stdout, /✓ 沒有字還沒出現就被下一段蓋住/);
  assert.match(r.stdout, /→ 總覽圖 projects\/p1\/output\/qc\/qc-sheet\.jpg（\d+ 格，每 10 秒一格/);
  assert.ok(!fs.existsSync(path.join(F.proj, 'work', 'observe')), '只出文字，不做 observe 的圖');
  // 既有防線：rough.mp4 全黑一段、專案沒有聲音素材 → ✖ 沒有講者小視窗
  ffmpeg(['-f', 'lavfi', '-i', "color=c=black:s=1280x720:r=30:d=46", '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:d=46', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(F.proj, 'work', 'rough.mp4')]);
  fs.rmSync(path.join(F.out, '.cache'), { recursive: true, force: true });
  fs.rmSync(path.join(F.proj, 'work', '.cache'), { recursive: true, force: true });
  fs.mkdirSync(path.join(F.proj, 'assets', 'camera'), { recursive: true });
  r = F.qc('final');
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /✖ s02 是全畫面清單卻沒有講者小視窗：work\/rough\.mp4 在 .* 是全黑（原始素材不是）→ 初剪壞了/);
});
