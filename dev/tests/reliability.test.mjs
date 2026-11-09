// 穩定性：中斷重跑、同時跑、弱模型跑錯順序、怪素材（對應 scratchpad 稽核報告的 12 項）。素材都用 lavfi 現做的短片
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { TOOLS, makeSrt, imp } from './helpers.mjs';

const tmpProject = (name = 'hf-rel-') => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), name));
  fs.mkdirSync(path.join(project, 'work', 'hyperframes'), { recursive: true });
  return project;
};
const tool = (name, args, opts = {}) => spawnSync(process.execPath, [path.join(TOOLS, name), ...args], { encoding: 'utf8', maxBuffer: 1 << 28, ...opts });
const out = (r) => `${r.stdout}${r.stderr}`;
const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
const ffSkip = hasFfmpeg ? false : '要 ffmpeg';

// ---------- 第 5 項：--merge-drafts ----------

function mergeProject() {
  const project = tmpProject();
  const work = path.join(project, 'work');
  fs.writeFileSync(path.join(work, 'rough.srt'), makeSrt({ n: 12 }));
  fs.mkdirSync(path.join(work, 'drafts'), { recursive: true });
  fs.writeFileSync(path.join(work, 'drafts', 'ch01.json'), JSON.stringify({ segments: [{ id: 's01', scene: 'key-point', from: '#1', to: '#3e', slots: { key: '草稿的字' } }] }));
  return { project, plan: path.join(work, 'hyperframes', 'plan.json') };
}
const planKey = (f) => JSON.parse(fs.readFileSync(f, 'utf8')).scenes[0].slots.key;
const merge = (project, ...extra) => tool('build.mjs', ['--project', project, '--merge-drafts', '--no-storyboard', ...extra]);

test('--merge-drafts：第一次照寫；草稿改了、plan 沒人動過可以再合併；plan 被改過就 ✖ 不蓋，--force 才蓋，每次備份都留著', () => {
  const { project, plan } = mergeProject();
  const dir = path.dirname(plan);
  const backups = () => fs.readdirSync(dir).filter((f) => f.startsWith('plan.json.bak-merge')).sort();
  merge(project);
  assert.equal(planKey(plan), '草稿的字');
  assert.deepEqual(backups(), []);   // 沒有舊檔不用備份

  // 草稿改字再合併（--check 沒過時工具會叫人這樣做）：plan 沒被別人改過，放行
  const draft = path.join(project, 'work', 'drafts', 'ch01.json');
  const d = JSON.parse(fs.readFileSync(draft, 'utf8'));
  d.segments[0].slots.key = '草稿改過的字';
  fs.writeFileSync(draft, JSON.stringify(d));
  merge(project);
  assert.equal(planKey(plan), '草稿改過的字');
  assert.equal(backups().length, 1);

  // frame 這種第一層欄位不算（合併只換 scenes）
  let p = JSON.parse(fs.readFileSync(plan, 'utf8'));
  p.frame = [0, 0, 1920, 1080];
  fs.writeFileSync(plan, JSON.stringify(p, null, 2));
  merge(project);
  assert.deepEqual(JSON.parse(fs.readFileSync(plan, 'utf8')).frame, [0, 0, 1920, 1080]);

  // 段落被改過（分鏡表套回、剪輯台、回饋輪）：✖，plan 不動
  p = JSON.parse(fs.readFileSync(plan, 'utf8'));
  p.scenes[0].slots.key = '使用者改的字';
  fs.writeFileSync(plan, JSON.stringify(p, null, 2));
  const n = backups().length;
  let r = merge(project);
  assert.equal(r.status, 1);
  assert.match(out(r), /上次合併之後改過/);
  assert.match(out(r), /--force/);
  assert.equal(planKey(plan), '使用者改的字');
  r = merge(project);   // 再跑一次也一樣，備份不會被草稿版蓋掉
  assert.equal(planKey(plan), '使用者改的字');
  assert.equal(backups().length, n);

  // --force：蓋掉，但備份裡有使用者的字
  merge(project, '--force');
  assert.equal(planKey(plan), '草稿改過的字');
  const all = backups();
  assert.ok(all.length > n);
  assert.ok(all.some((f) => planKey(path.join(dir, f)) === '使用者改的字'));
});

test('--merge-drafts：plan.json 壞了不當成空的蓋掉；手寫的 scenes（沒合併過）也不蓋', () => {
  const { project, plan } = mergeProject();
  fs.writeFileSync(plan, '{ "version": 1, "frame": [0,0,1920,1080], }');
  let r = merge(project);
  assert.equal(r.status, 1);
  assert.match(out(r), /不是合法的 JSON/);
  assert.match(fs.readFileSync(plan, 'utf8'), /frame/);
  fs.writeFileSync(plan, JSON.stringify({ version: 1, scenes: [{ id: 's09', scene: 'key-point', from: '#1', to: '#2', slots: { key: '手寫的' } }] }));
  r = merge(project);
  assert.equal(r.status, 1);
  assert.equal(planKey(plan), '手寫的');
});

// ---------- 第 6 項：--review、--storyboard 查分鏡表有沒有套回 ----------

test('--review：分鏡表有改動還沒套回 → ✖ 給 --apply-storyboard，不跑 build；工具自己寫的（recordStoryboard、回饋輪）不算', async () => {
  const { recordStoryboard, markStoryboardWritten, storyboardDirty } = await imp('lib/storyboard-state.mjs');
  const { project } = mergeProject();
  const P = { project, out: path.join(project, 'work', 'hyperframes') };
  const sb = path.join(project, 'work', 'storyboard.md');
  assert.equal(storyboardDirty(P), false);        // 還沒有分鏡表
  fs.writeFileSync(sb, '# 舊專案沒有紀錄\n');
  assert.equal(storyboardDirty(P), false);        // 舊專案沒有紀錄：不擋
  markStoryboardWritten(P, '# 舊專案沒有紀錄\n');
  assert.equal(fs.existsSync(path.join(P.out, '.cache', 'storyboard.json')), false, '還沒有紀錄不要自己建');
  recordStoryboard(P, '# 工具寫的\n', { at: 123 });
  fs.writeFileSync(sb, '# 工具寫的\n');
  assert.equal(storyboardDirty(P), false);
  fs.writeFileSync(sb, '# 工具寫的\n使用者在網頁改的\n');
  assert.equal(storyboardDirty(P), true);
  const r = tool('build.mjs', ['--project', project, '--review', '--no-prerender']);
  assert.equal(r.status, 1);
  assert.match(out(r), /還沒套回/);
  assert.match(out(r), /--apply-storyboard$/m);
  assert.doesNotMatch(out(r), /build 沒過/, '在 build 之前就擋下來');
  markStoryboardWritten(P, fs.readFileSync(sb, 'utf8'));    // versions.mjs accept／use 寫回時
  assert.equal(storyboardDirty(P), false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(P.out, '.cache', 'storyboard.json'), 'utf8')).at, 123, '時間不動（status.mjs 用它判斷停點 ③ 套回過沒）');
});

// ---------- 第 2、10 項：背景工作 ----------

// 和 media.mjs 一樣用 runJob 的小工具：每次真的做事就在 runs 檔記一行；--child 開一個同 process group 的子行程
function jobFixture() {
  const project = tmpProject('hf-rel-job-');
  const script = path.join(project, 'tool.mjs'), runs = path.join(project, 'runs.txt');
  fs.writeFileSync(script, `
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { runJob } from ${JSON.stringify(path.join(TOOLS, 'lib', 'job.mjs'))};
const flags = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const has = (k) => flags.includes(k);
const code = await runJob({ project: ${JSON.stringify(project)}, name: 'x', waitSec: has('--wait') ? Number(flags[flags.indexOf('--wait') + 1]) : 30, pollMs: 30, retryFailed: has('--again'), log: console.log, run: async () => {
  fs.appendFileSync(${JSON.stringify(runs)}, flags.join(' ') + '\\n');
  console.log('做事');
  if (has('--child')) { const c = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120000)'], { stdio: 'ignore' }); fs.writeFileSync(${JSON.stringify(path.join(project, 'child.pid'))}, String(c.pid)); }
  if (has('--slow')) await sleep(60000);
  if (has('--slow1')) await sleep(1500);
  return has('--fail') ? 1 : 0;
} });
process.exitCode = code;
`);
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  return { project, script, run, count: () => { try { return fs.readFileSync(runs, 'utf8').trim().split('\n').filter(Boolean).length; } catch { return 0; } }, stateFile: path.join(project, 'work', '.jobs', 'x.json') };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isAlive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function settled(f) {
  for (let i = 0; i < 300; i++) { const s = JSON.parse(fs.readFileSync(f.stateFile, 'utf8')); if (s.state !== 'running') return s; await sleep(30); }
  throw new Error('工作一直沒結束');
}

test('runJob：結果沒印出來：同一條指令（--wait、--said 不同也算）交代結果不重跑；參數不同是新的要求，真的重跑', async () => {
  const f = jobFixture();
  f.run('--wait', '0', '--edit', 'A');
  await settled(f);
  assert.equal(f.count(), 1);
  let r = f.run('--edit', 'A', '--said', '可以');   // 75 之後再跑一次同一條：不重跑
  assert.equal(r.status, 0);
  assert.match(r.stdout, /做事/);
  assert.equal(f.count(), 1);
  f.run('--wait', '0', '--edit', 'A');                  // 這條已經交代過了：重做
  await settled(f);
  assert.equal(f.count(), 2);
  r = f.run('--edit', 'B');                         // 上一條做完沒人看，這條參數不同：不能印舊的就算了
  assert.match(r.stdout, /參數不同，重新開始/);
  assert.equal(f.count(), 3);
  assert.match(fs.readFileSync(path.join(f.project, 'runs.txt'), 'utf8'), /--edit B/);
});

test('runJob：上次失敗、結果沒印，又帶 --again：明說要重來，真的重跑；不帶 --again 的同一條先交代失敗', async () => {
  const f = jobFixture();
  f.run('--wait', '0', '--fail', '--again');
  await settled(f);
  let r = f.run('--fail', '--again');
  assert.match(r.stdout, /明說要重來/);
  assert.equal(f.count(), 2);
  const g = jobFixture();
  g.run('--wait', '0', '--fail');
  await settled(g);
  r = g.run('--fail');
  assert.equal(r.status, 1);
  assert.equal(g.count(), 1);
});

test('runJob：pid 被別的程式重用（當機、重開機後）不會一直等，那個程式也不會被收掉', { skip: process.platform === 'win32' }, async () => {
  const { jobState } = await imp('lib/job.mjs');
  const f = jobFixture();
  const other = spawnSync('sh', ['-c', 'sleep 60 >/dev/null 2>&1 & echo $!'], { encoding: 'utf8' });
  const pid = Number(other.stdout.trim());
  try {
    fs.mkdirSync(path.dirname(f.stateFile), { recursive: true });
    fs.writeFileSync(f.stateFile, JSON.stringify({ name: 'x', pid, state: 'running', startedAt: Date.now() - 3600000, argv: [f.script, '--old'] }));
    const st = jobState(f.project, 'x');
    assert.equal(st.state, 'failed');
    assert.equal(st.reused, true);
    const r = f.run('--new');
    assert.equal(r.status, 0);
    assert.equal(f.count(), 1);
    assert.ok(isAlive(pid), '別人的程式不能動');
  } finally { try { process.kill(pid, 'SIGKILL'); } catch { /* 已走 */ } }
});

test('runJob：工作行程被砍 → 重跑前收掉它留下的子行程；同時開很多條只起一個工作', { skip: process.platform === 'win32' }, async () => {
  const f = jobFixture();
  f.run('--wait', '0', '--child', '--slow');
  const pidFile = path.join(f.project, 'child.pid');
  for (let i = 0; i < 200 && !fs.existsSync(pidFile); i++) await sleep(30);
  const child = Number(fs.readFileSync(pidFile, 'utf8'));
  const job = JSON.parse(fs.readFileSync(f.stateFile, 'utf8')).pid;
  process.kill(job, 'SIGKILL');
  await sleep(100);
  assert.ok(isAlive(child), '工作行程死了子行程還在（才有孤兒的問題）');
  const r = f.run('--quick');
  assert.match(r.stdout, /收掉上一次/);
  assert.equal(r.status, 0);
  for (let i = 0; i < 50 && isAlive(child); i++) await sleep(30);
  assert.equal(isAlive(child), false);

  // 同時開 8 條：只有一條真的開工
  const { spawn } = await import('node:child_process');
  const g = jobFixture();
  const kids = Array.from({ length: 8 }, () => spawn(process.execPath, [g.script, '--wait', '0', '--slow1'], { stdio: 'ignore' }));
  await Promise.all(kids.map((c) => new Promise((res) => c.on('close', res))));
  await settled(g);
  assert.equal(g.count(), 1);
});

test('tmpFor／sweepTmp：暫存檔名帶 pid、副檔名不變（ffmpeg 靠它選格式）；只清主人不在的', async () => {
  const { tmpFor, sweepTmp, decodeIssues } = await imp('lib/ff.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-rel-tmp-'));
  const t = tmpFor(path.join(dir, 'rough.mp4'));
  assert.equal(path.basename(t), `.rough.${process.pid}.tmp.mp4`);
  assert.equal(path.basename(tmpFor(path.join(dir, 'cuts.v1.json'))), `.cuts.v1.${process.pid}.tmp.json`);
  const dead = spawnSync('sh', ['-c', 'echo $$'], { encoding: 'utf8' }).stdout.trim();
  fs.writeFileSync(t, 'x');
  fs.writeFileSync(path.join(dir, `.rough.${dead}.tmp.mp4`), 'x');
  fs.writeFileSync(path.join(dir, 'rough.mp4'), 'x');
  assert.equal(sweepTmp(dir), 1);
  assert.deepEqual(fs.readdirSync(dir).sort(), [path.basename(t), 'rough.mp4'].sort());
  // 檔名裡有這些字不算，只看 [元件 @ …] 開頭的行
  assert.equal(decodeIssues("Input #0, mov, from '/x/Invalid NAL unit size/a.mp4':\nframe=1").count, 0);
  assert.equal(decodeIssues('[h264 @ 0x1] Invalid NAL unit size (0 > 8098).\n[aac @ 0x2] channel element 0.0 duplicate\nframe=1').count, 2);
});

// ---------- 第 2、3 項：實際的影片 ----------

function shortClip(file, { seconds = 2, size = '320x180', extra = [] } = {}) {
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `testsrc2=s=${size}:r=30:d=${seconds}`, '-f', 'lavfi', '-i', `sine=f=440:d=${seconds}`, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', ...extra, file], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return file;
}

test('verify-rough：解碼有錯就 ✖（ffmpeg 結束碼還是 0，黑畫面檢查看不出來）', { skip: ffSkip }, () => {
  const project = tmpProject();
  const work = path.join(project, 'work'), rough = path.join(work, 'rough.mp4');
  shortClip(rough);
  fs.writeFileSync(path.join(work, 'cuts.v1.json'), JSON.stringify({ version: '1', source: 'work/rough.mp4', chunks: [[0, 60, 1]] }));
  let r = tool('media.mjs', ['verify-rough', '--project', project]);
  assert.equal(r.status, 0, out(r));
  // 中段寫入垃圾（兩個行程寫同一個檔就是這樣）
  const buf = fs.readFileSync(rough);
  for (let i = Math.floor(buf.length * 0.4); i < Math.floor(buf.length * 0.7); i += 7) buf[i] = (buf[i] + 91) & 255;
  fs.writeFileSync(rough, buf);
  r = tool('media.mjs', ['verify-rough', '--project', project]);
  assert.equal(r.status, 1, out(r));
  assert.match(out(r), /解碼有錯/);
});

test('encodeFootage：寫完才換上，失敗舊檔不動、不留暫存；encodeFootagePolished 的聲音暫存帶 pid、用完就刪', { skip: ffSkip }, async () => {
  const { encodeFootage } = await imp('lib/ff.mjs');
  const { encodeFootagePolished } = await imp('lib/audio.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-rel-enc-'));
  const src = shortClip(path.join(dir, 'src.mp4')), dst = path.join(dir, 'out', 'rough.mp4');
  fs.mkdirSync(path.dirname(dst));
  fs.writeFileSync(dst, 'old');
  assert.throws(() => encodeFootage(path.join(dir, 'nope.mp4'), dst));
  assert.equal(fs.readFileSync(dst, 'utf8'), 'old');
  assert.deepEqual(fs.readdirSync(path.dirname(dst)), ['rough.mp4']);
  const cache = path.join(dir, 'cache');
  encodeFootagePolished(src, dst, { cacheDir: cache, cutpoints: [1] });
  assert.notEqual(fs.statSync(dst).size, 3);
  assert.deepEqual(fs.readdirSync(path.dirname(dst)), ['rough.mp4']);
  assert.deepEqual(fs.readdirSync(cache).filter((f) => /f32/.test(f)), []);
});

test('build：底片要編碼走背景工作（戳記記底片大小與時間）；同時兩條只編一次；底片被別人寫過會重編；--reencode', { skip: ffSkip }, async () => {
  const project = tmpProject();
  const work = path.join(project, 'work'), H = path.join(work, 'hyperframes'), asset = path.join(H, 'assets', 'rough.mp4');
  shortClip(path.join(work, 'rough.mp4'), { seconds: 3 });
  fs.writeFileSync(path.join(work, 'rough.srt'), '1\n00:00:00,100 --> 00:00:02,000\n第一句\n');
  fs.writeFileSync(path.join(H, 'plan.json'), JSON.stringify({ version: 1, rhythm: 'spaced', scenes: [] }));
  const { spawn } = await import('node:child_process');
  const go = () => new Promise((res) => { let o = ''; const c = spawn(process.execPath, [path.join(TOOLS, 'build.mjs'), '--project', project]); c.stdout.on('data', (d) => { o += d; }); c.stderr.on('data', (d) => { o += d; }); c.on('close', (code) => res({ code, out: o })); });
  const [a, b] = await Promise.all([go(), go()]);
  assert.equal(a.code, 0, a.out);
  assert.equal(b.code, 0, b.out);
  assert.equal([a, b].filter((x) => /prepare 在背景跑/.test(x.out)).length, 1, `${a.out}\n---\n${b.out}`);
  const stamp = JSON.parse(fs.readFileSync(path.join(H, '.cache', 'footage-audio.json'), 'utf8'));
  assert.equal(stamp.asset.size, fs.statSync(asset).size);
  assert.deepEqual(fs.readdirSync(path.dirname(asset)).filter((f) => /tmp/.test(f)), []);
  let r = tool('build.mjs', ['--project', project]);
  assert.doesNotMatch(out(r), /重新編碼底片/);
  // 舊專案的戳記沒有 asset：照舊算數，不重編
  const old = { key: stamp.key, info: stamp.info };
  fs.writeFileSync(path.join(H, '.cache', 'footage-audio.json'), JSON.stringify(old));
  r = tool('build.mjs', ['--project', project]);
  assert.doesNotMatch(out(r), /重新編碼底片/);
  // 底片被別的行程寫過
  fs.writeFileSync(path.join(H, '.cache', 'footage-audio.json'), JSON.stringify(stamp));
  fs.appendFileSync(asset, 'x');
  r = tool('build.mjs', ['--project', project]);
  assert.match(out(r), /重新編碼底片/);
  r = tool('build.mjs', ['--project', project]);
  assert.doesNotMatch(out(r), /重新編碼底片/);
  r = tool('build.mjs', ['--project', project, '--reencode']);
  assert.match(out(r), /重新編碼底片/);
  assert.equal(r.status, 0, out(r));
});

// ---------- 第 1 項：手機直拍的旋轉標記 ----------

test('probeMedia：旋轉 90／270 寬高交換，180 不換；主軌變直的、沒有黑邊；插入素材不變形', { skip: ffSkip }, async () => {
  const { probeMedia, encodeMedia } = await imp('lib/ff.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-rel-rot-'));
  const base = shortClip(path.join(dir, 'base.mp4'));
  const rotated = (deg) => {
    const f = path.join(dir, `r${deg}.mov`);
    const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-display_rotation', String(deg), '-i', base, '-c', 'copy', f], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return f;
  };
  for (const [deg, w, h] of [[90, 180, 320], [-90, 180, 320], [180, 320, 180], [0, 320, 180]]) {
    const m = probeMedia(rotated(deg));
    assert.deepEqual([m.width, m.height], [w, h], `旋轉 ${deg}`);
  }
  const project = tmpProject();
  fs.mkdirSync(path.join(project, 'assets', 'camera'), { recursive: true });
  fs.copyFileSync(rotated(90), path.join(project, 'assets', 'camera', 'phone.mov'));
  const r = tool('media.mjs', ['main', '--project', project]);
  assert.equal(r.status, 0, out(r));
  const main = probeMedia(path.join(project, 'work', 'main.mp4'));
  assert.deepEqual([main.width, main.height], [180, 320]);
  const left = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', path.join(project, 'work', 'main.mp4'), '-frames:v', '1', '-vf', 'crop=18:320:0:0,signalstats,metadata=print', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  assert.ok(Number(left.match(/YAVG=([\d.]+)/)[1]) > 20, `左邊不能是黑邊：${left.match(/YAVG=[\d.]+/)}`);
  const dst = path.join(dir, 'media.mp4');
  encodeMedia(rotated(90), dst, { width: 180, height: 320 });
  const got = probeMedia(dst);
  assert.deepEqual([got.width, got.height], [180, 320]);
  // 舊版接出來的橫向主軌（方向和第一支錄影不同）算過期，prep 會重接
  const { mainIsCurrent } = await imp('media.mjs');
  assert.equal(mainIsCurrent({ project }), true);
  fs.copyFileSync(base, path.join(project, 'work', 'main.mp4'));
  assert.equal(mainIsCurrent({ project }), false);
});

// ---------- 第 11 項：HDR（iPhone 的 HLG）轉 SDR ----------

test('hdrToSdr：BT.2408 的參考點（18% 灰 38%、參考白 75%、峰值）、中性色還是中性、一路遞增；鮮豔的顏色不被洗白', async () => {
  const { hdrToSdr, hdrKind } = await imp('lib/hdr.mjs');
  assert.equal(hdrKind('arib-std-b67'), 'hlg');
  assert.equal(hdrKind('smpte2084'), 'pq');
  assert.equal(hdrKind('bt709'), null);
  const gray = (e, kind = 'hlg') => hdrToSdr(kind, e, e, e);
  assert.deepEqual(gray(0), [0, 0, 0]);
  const g38 = gray(0.38)[0], w75 = gray(0.75)[0];
  assert.ok(g38 > 0.38 && g38 < 0.47, `18% 灰：${g38}`);     // SDR 的 18% 灰約 41–45%
  assert.ok(w75 > 0.93 && w75 <= 1, `參考白：${w75}`);        // 參考白接近 SDR 的白，亮部還留一點空間
  assert.ok(gray(1)[0] > 0.999);
  for (const e of [0.1, 0.5, 0.9]) { const [r, g, b] = gray(e); assert.ok(Math.abs(r - g) < 1e-6 && Math.abs(g - b) < 1e-6, `中性色 ${e}`); }
  for (let e = 0.02; e <= 1; e += 0.02) assert.ok(gray(e)[0] >= gray(e - 0.02)[0] - 1e-9, `遞增 ${e}`);
  const red = hdrToSdr('hlg', 0.75, 0.2, 0.2);
  assert.ok(red[0] > 0.9 && red[1] < 0.1 && red[2] < 0.25, `紅色不能洗成粉色：${red}`);
  const skin = hdrToSdr('hlg', 0.6, 0.45, 0.38);
  assert.ok(skin[0] > skin[1] && skin[1] > skin[2], '膚色的順序不變');
  // PQ：100 nit（訊號約 0.508）差不多是參考白的一半亮
  const pq100 = gray(0.508, 'pq')[0];
  assert.ok(pq100 > 0.68 && pq100 < 0.82, `PQ 100 nit：${pq100}`);
});

test('HLG 主軌：main.mp4 是 SDR BT.709，顏色照 LUT；舊版留下的 HDR 主軌 prep 會重接；SDR 素材完全不動', { skip: ffSkip }, async () => {
  const enc = spawnSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' }).stdout;
  if (!/libx265/.test(enc)) return;
  const { probeMedia } = await imp('lib/ff.mjs');
  const { hdrToSdr } = await imp('lib/hdr.mjs');
  const { mainIsCurrent } = await imp('media.mjs');
  const project = tmpProject();
  const dir = path.join(project, 'assets', 'camera');
  fs.mkdirSync(dir, { recursive: true });
  // 灰階 50% 的 HLG（BT.2020、limited）：Y＝64＋876×0.5＝502、U＝V＝512；直接寫 10-bit 原始影格，不經過 ffmpeg 的色彩轉換
  const W = 64, H = 36, raw = path.join(project, 'g.yuv');
  const frame = Buffer.concat([Buffer.from(new Uint16Array(W * H).fill(502).buffer), Buffer.from(new Uint16Array((W * H) / 2).fill(512).buffer)]);
  fs.writeFileSync(raw, Buffer.concat(Array.from({ length: 30 }, () => frame)));
  const src = path.join(dir, 'hlg.mov');
  let r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'yuv420p10le', '-s', `${W}x${H}`, '-r', '30', '-color_primaries', 'bt2020', '-color_trc', 'arib-std-b67', '-colorspace', 'bt2020nc', '-color_range', 'tv', '-i', raw, '-f', 'lavfi', '-i', 'sine=f=440:d=1', '-c:v', 'libx265', '-preset', 'ultrafast', '-x265-params', 'log-level=error:colorprim=bt2020:transfer=arib-std-b67:colormatrix=bt2020nc:range=limited', '-tag:v', 'hvc1', '-c:a', 'aac', '-shortest', src], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(probeMedia(src).hdr, 'hlg');
  r = tool('media.mjs', ['main', '--project', project]);
  assert.equal(r.status, 0, out(r));
  const main = path.join(project, 'work', 'main.mp4');
  assert.equal(probeMedia(main).hdr, null);
  const tags = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,pix_fmt,color_transfer,color_primaries,color_space', '-of', 'csv=p=0', main], { encoding: 'utf8' }).stdout.trim();
  assert.equal(tags, 'h264,yuv420p,bt709,bt709,bt709');
  // 畫面的亮度＝LUT 算的值（誤差 2 個碼值內）
  const stat = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', main, '-frames:v', '1', '-vf', 'signalstats,metadata=print', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const yavg = Number(stat.match(/YAVG=([\d.]+)/)[1]);
  const want = 16 + 219 * hdrToSdr('hlg', 0.5, 0.5, 0.5)[0];
  assert.ok(Math.abs(yavg - want) < 2, `Y ${yavg} 應該接近 ${want}`);
  assert.equal(mainIsCurrent({ project }), true);
  // 插入素材（HDR 的 b-roll）也轉 SDR
  const { encodeMedia } = await imp('lib/ff.mjs');
  const dst = path.join(project, 'media.mp4');
  encodeMedia(src, dst, { width: W, height: H });
  assert.equal(probeMedia(dst).hdr, null);
  // 舊版接出來還標 HDR 的主軌算過期
  r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', src, '-c', 'copy', main], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(mainIsCurrent({ project }), false);
});

// ---------- 第 7、8、12 項：素材異常 ----------

test('素材異常：截斷的檔列進 main.json 的 warnings；沒聲音軌 ✖；聲音在第二軌用第二軌；全靜音 prep ✖；不支援的格式講清楚；壞的螢幕錄影不擋', { skip: ffSkip }, async () => {
  const { probeMedia, decodeIssues } = await imp('lib/ff.mjs');
  const { sourceEnd, pickAudioTrack } = await imp('media.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-rel-src-'));
  const base = shortClip(path.join(dir, 'base.mp4'), { seconds: 4 });
  // 截斷（moov 在前，ffprobe 還是說 4 秒）
  const cut = path.join(dir, 'cut.mp4');
  fs.copyFileSync(base, cut);
  fs.truncateSync(cut, Math.floor(fs.statSync(base).size / 2));
  assert.ok(probeMedia(cut).duration > 3.9);
  assert.equal(sourceEnd(base).partial, false);
  const se = sourceEnd(cut);
  assert.equal(se.partial, true);
  assert.ok(se.end < 3.5, `實際只到 ${se.end}`);
  const P1 = tmpProject();
  fs.mkdirSync(path.join(P1, 'assets', 'camera'), { recursive: true });
  fs.copyFileSync(cut, path.join(P1, 'assets', 'camera', 'cut.mp4'));
  let r = tool('media.mjs', ['main', '--project', P1]);
  assert.equal(r.status, 0, out(r));
  assert.match(out(r), /cut\.mp4 不完整/);
  assert.match(JSON.parse(fs.readFileSync(path.join(P1, 'work', 'main.json'), 'utf8')).warnings[0], /不完整/);
  assert.equal(decodeIssues('[in#0/mov @ 0x1] stream 1, offset 0x1: partial file').count, 1);

  // 沒聲音軌：還沒轉檔就 ✖
  const P2 = tmpProject();
  fs.mkdirSync(path.join(P2, 'assets', 'camera'), { recursive: true });
  r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', base, '-an', '-c:v', 'copy', path.join(P2, 'assets', 'camera', 'a.mp4')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  r = tool('media.mjs', ['main', '--project', P2]);
  assert.equal(r.status, 1);
  assert.match(out(r), /a\.mp4 沒有聲音軌/);
  assert.equal(fs.existsSync(path.join(P2, 'work', 'main.mp4')), false);

  // 第一條靜音、第二條有聲音
  const two = path.join(dir, 'two.mp4');
  r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', base, '-f', 'lavfi', '-t', '4', '-i', 'anullsrc=r=48000:cl=stereo', '-map', '0:v', '-map', '1:a', '-map', '0:a', '-c:v', 'copy', '-c:a', 'aac', '-shortest', two], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(probeMedia(two).audioCount, 2);
  assert.equal(pickAudioTrack(two, 2).track, 1);
  assert.equal(pickAudioTrack(base, 1).track, 0);
  const P3 = tmpProject();
  fs.mkdirSync(path.join(P3, 'assets', 'camera'), { recursive: true });
  fs.copyFileSync(two, path.join(P3, 'assets', 'camera', 'two.mp4'));
  r = tool('media.mjs', ['main', '--project', P3]);
  assert.equal(r.status, 0, out(r));
  const j3 = JSON.parse(fs.readFileSync(path.join(P3, 'work', 'main.json'), 'utf8'));
  assert.equal(j3.clips[0].audioTrack, 1);
  assert.match(j3.warnings[0], /用第 2 條/);
  const vol = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', path.join(P3, 'work', 'main.mp4'), '-vn', '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  assert.ok(Number(vol.match(/max_volume:\s*(-?[\d.]+)/)[1]) > -40, '主軌要有聲音');

  // 全靜音：prep 在 whisper 之前就 ✖（不會幻聽）
  const P4 = tmpProject();
  fs.mkdirSync(path.join(P4, 'assets', 'voice'), { recursive: true });
  r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-t', '3', '-i', 'anullsrc=r=48000:cl=stereo', '-c:a', 'aac', path.join(P4, 'assets', 'voice', 'v.m4a')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  r = tool('media.mjs', ['prep', '--project', P4, '--no-editor']);
  assert.equal(r.status, 1);
  assert.match(out(r), /主軌是靜音/);
  assert.equal(fs.existsSync(path.join(P4, 'work', 'transcript-main.json')), false);

  // 不支援的格式：不要說「都是空的」
  const P5 = tmpProject();
  fs.mkdirSync(path.join(P5, 'assets', 'camera'), { recursive: true });
  fs.writeFileSync(path.join(P5, 'assets', 'camera', 'a.mkv'), 'x');
  r = tool('media.mjs', ['main', '--project', P5]);
  assert.equal(r.status, 1);
  assert.match(out(r), /a\.mkv 的格式不支援/);

  // 壞的螢幕錄影不擋主軌
  const P6 = tmpProject();
  fs.mkdirSync(path.join(P6, 'assets', 'camera'), { recursive: true });
  fs.mkdirSync(path.join(P6, 'assets', 'screen'), { recursive: true });
  fs.copyFileSync(base, path.join(P6, 'assets', 'camera', 'a.mp4'));
  fs.writeFileSync(path.join(P6, 'assets', 'screen', 'bad.mp4'), 'not a video');
  r = tool('media.mjs', ['main', '--project', P6]);
  assert.equal(r.status, 0, out(r));
});

test('aeFailure：Timeline is empty 不要叫人查參數名稱；其他失敗照舊', async () => {
  const { aeFailure } = await imp('media.mjs');
  assert.match(aeFailure({ status: 1, stderr: '\x1b[31mError! Timeline is empty, nothing to do.\x1b[0m' }).message, /什麼都不剩.*cuts\.md/s);
  assert.match(aeFailure({ status: 2, stderr: 'unknown option' }, '；第二次還失敗就停下來回報').message, /--help.*第二次/s);
});

test('joinMain：音軌、畫面的起點偏移照實保留（音畫不會差那麼多）', { skip: ffSkip }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-rel-sync-'));
  const sync = path.join(dir, 'sync.mp4');
  let r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', "color=black:s=160x90:r=30:d=8,drawbox=enable='lt(mod(t,3),0.2)':c=white:t=fill", '-f', 'lavfi', '-i', "aevalsrc='if(lt(mod(t,3),0.2),0.8*sin(2*PI*1000*t),0)':s=48000:d=8", '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '30', '-c:a', 'aac', sync], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const firstFlash = (f) => Number(spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-ss', '2', '-i', f, '-an', '-vf', 'blackdetect=d=0.1:pix_th=0.1', '-f', 'null', '-'], { encoding: 'utf8' }).stderr.match(/black_end:([\d.]+)/)?.[1]);
  const firstBeep = (f) => Number(spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-ss', '2', '-i', f, '-vn', '-af', 'silencedetect=n=-30dB:d=0.1', '-f', 'null', '-'], { encoding: 'utf8' }).stderr.match(/silence_end: ([\d.]+)/)?.[1]);
  const offs = [['aoff', ['-i', sync, '-itsoffset', '0.6', '-i', sync]], ['voff', ['-itsoffset', '0.6', '-i', sync, '-i', sync]]];
  for (const [name, inputs] of offs) {
    const f = path.join(dir, `${name}.mp4`);
    r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...inputs, '-map', '0:v', '-map', '1:a', '-c', 'copy', f], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const project = tmpProject();
    fs.mkdirSync(path.join(project, 'assets', 'camera'), { recursive: true });
    fs.copyFileSync(f, path.join(project, 'assets', 'camera', 'a.mp4'));
    const t = tool('media.mjs', ['main', '--project', project]);
    assert.equal(t.status, 0, out(t));
    const main = path.join(project, 'work', 'main.mp4');
    const diffSrc = firstBeep(f) - firstFlash(f), diffMain = firstBeep(main) - firstFlash(main);
    assert.ok(Math.abs(diffSrc - diffMain) < 0.08, `${name}：來源差 ${diffSrc}，主軌差 ${diffMain}`);
  }
});

// ---------- 第 9 項：講稿編碼 ----------

test('講稿不是 UTF-8：srt-align、prep 都 ✖，字幕不會變亂碼；BOM＋CRLF、UTF-16（有 BOM）照常', async () => {
  const { readScript } = await imp('lib/script-file.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-rel-enc-'));
  const f = path.join(dir, '講稿.md');
  const text = '# 標題\n第一句話\n第二句話\n';
  fs.writeFileSync(f, text);
  assert.equal(readScript(f), text);
  fs.writeFileSync(f, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text)]));
  assert.equal(readScript(f), text);
  fs.writeFileSync(f, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]));
  assert.equal(readScript(f), text);
  fs.writeFileSync(f, Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(text, 'utf16le').swap16()]));
  assert.equal(readScript(f), text);
  // Big5 的「第一句話」：不是合法的 UTF-8
  const big5 = Buffer.from([0xb2, 0xc4, 0xa4, 0x40, 0xa5, 0x79, 0xb8, 0xdc, 0x0a]);
  fs.writeFileSync(f, big5);
  assert.throws(() => readScript(f), /不是 UTF-8/);
  const project = tmpProject();
  fs.writeFileSync(path.join(project, '講稿.md'), big5);
  const srt = path.join(project, 'work', 'rough.srt');
  fs.writeFileSync(srt, makeSrt({ n: 2 }));
  const before = fs.readFileSync(srt, 'utf8');
  let r = tool('media.mjs', ['srt-align', '--project', project]);
  assert.equal(r.status, 1);
  assert.match(out(r), /不是 UTF-8/);
  assert.equal(fs.readFileSync(srt, 'utf8'), before);
  r = tool('media.mjs', ['prep', '--project', project, '--no-editor']);
  assert.equal(r.status, 1);
  assert.match(out(r), /不是 UTF-8/);
});

// ---------- 推測項目重現後修的：別人的 --check 蓋掉設計師的檔、快取掉資料、寫到一半失敗 ----------

test('atomic：writeAtomic 失敗舊檔不動、不留暫存；rewriteIfSame 內容變了就不寫；withLock 互斥、鎖太舊當沒有', async () => {
  const { writeAtomic, rewriteIfSame, withLock } = await imp('lib/atomic.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-rel-at-'));
  const f = path.join(dir, 'plan.json');
  writeAtomic(f, 'A');
  assert.equal(fs.readFileSync(f, 'utf8'), 'A');
  assert.deepEqual(fs.readdirSync(dir), ['plan.json']);
  assert.equal(rewriteIfSame(f, 'A', 'B'), true);
  assert.equal(fs.readFileSync(f, 'utf8'), 'B');
  assert.equal(rewriteIfSame(f, 'A', 'C'), false, '別人剛存過：不能蓋');
  assert.equal(fs.readFileSync(f, 'utf8'), 'B');
  assert.deepEqual(fs.readdirSync(dir), ['plan.json']);
  // 資料夾不存在（寫不進去）：丟錯，不留東西
  assert.throws(() => writeAtomic(path.join(dir, 'nope', 'x'), 'A'));
  const lock = path.join(dir, 'lock');
  assert.equal(withLock(lock, () => 42), 42);
  assert.equal(fs.existsSync(lock), false);
  fs.mkdirSync(lock);
  const old = new Date(Date.now() - 60000);
  fs.utimesSync(lock, old, old);
  assert.equal(withLock(lock, () => 'ok'), 'ok', '主人死了留下的鎖不能卡住');
  // 拿不到鎖也不能卡死：逾時就照做
  fs.mkdirSync(lock);
  assert.equal(withLock(lock, () => 'timeout', { timeoutMs: 30 }), 'timeout');
  fs.rmdirSync(lock);
});

test('寫 plan.json 中途失敗（磁碟滿）：舊的 plan.json 還是完整的', { skip: process.platform === 'win32' }, () => {
  const { project, plan } = mergeProject();
  fs.writeFileSync(plan, JSON.stringify({ version: 1, frame: [0, 0, 1920, 1080] }));
  const draft = path.join(project, 'work', 'drafts', 'ch01.json');
  fs.writeFileSync(draft, JSON.stringify({ segments: Array.from({ length: 200 }, (_, i) => ({ id: `s${i}`, scene: 'key-point', from: '#1', to: '#2', slots: { key: '字'.repeat(20) } })) }));
  const r = spawnSync('sh', ['-c', `ulimit -f 12; exec "${process.execPath}" "${path.join(TOOLS, 'build.mjs')}" --project "${project}" --merge-drafts`], { encoding: 'utf8' });
  assert.notEqual(r.status, 0, out(r));
  assert.deepEqual(JSON.parse(fs.readFileSync(plan, 'utf8')).frame, [0, 0, 1920, 1080]);
  assert.deepEqual(fs.readdirSync(path.dirname(plan)).filter((f) => f.endsWith('.tmp')), []);
});

test('平行 --check-draft：快取不會掉別人寫的；--check 不會蓋掉子代理剛存的動畫檔', { skip: ffSkip }, async () => {
  const { materializeFills } = await imp('lib/custom-fill.mjs');
  assert.ok(materializeFills);
  const { spawn } = await import('node:child_process');
  const project = tmpProject();
  const work = path.join(project, 'work'), H = path.join(work, 'hyperframes');
  shortClip(path.join(work, 'rough.mp4'), { seconds: 12 });
  fs.writeFileSync(path.join(work, 'rough.srt'), makeSrt({ n: 3 }));
  fs.writeFileSync(path.join(H, 'plan.json'), JSON.stringify({ version: 1, rhythm: 'spaced', scenes: [] }));
  // 8 份草稿同時檢查，每份 2 段模板
  const seg = (id) => ({ id, type: 'custom', template: 'x-callout', from: '#1', to: '#2', slots: { title: '標題', obj: 'camera', items: [{ text: '項目一', icon: 'film', at: '#1' }, { text: '項目二', icon: 'film', at: '#1' }] } });
  const dir = path.join(work, 'drafts');
  fs.mkdirSync(dir, { recursive: true });
  const ids = [];
  for (let k = 0; k < 8; k++) { const segs = [`y${k}a`, `y${k}b`].map(seg); ids.push(...segs.map((s) => s.id)); fs.writeFileSync(path.join(dir, `p${k}.json`), JSON.stringify({ segments: segs })); }
  const run = (k) => new Promise((res) => { const c = spawn(process.execPath, [path.join(TOOLS, 'build.mjs'), '--project', project, '--check-draft', path.join(dir, `p${k}.json`)], { stdio: 'ignore' }); c.on('close', res); });
  await Promise.all(Array.from({ length: 8 }, (_, k) => run(k)));
  const cache = JSON.parse(fs.readFileSync(path.join(H, '.cache', 'custom-fill.json'), 'utf8'));
  const missing = ids.filter((id) => !cache[`compositions/x-callout-${id}.html`]);
  assert.deepEqual(missing, []);
  assert.deepEqual(fs.readdirSync(path.join(H, '.cache')).filter((f) => f.endsWith('.lock') || f.endsWith('.tmp')), []);
});

test('sweepStaleProfiles：開找臉 Chrome 的行程不在了 → 收掉那個 Chrome、刪 profile；主人還在的不動', { skip: process.platform === 'win32' }, async () => {
  const { sweepStaleProfiles } = await imp('lib/landmarks.mjs');
  const { spawn } = await import('node:child_process');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-rel-lm-'));
  const dead = path.join(tmp, 'look-lm-dead'), mine = path.join(tmp, 'look-lm-mine');
  fs.mkdirSync(dead); fs.mkdirSync(mine);
  // 假 Chrome：命令列帶著 profile 名稱
  const fake = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)', `--user-data-dir=${dead}`], { stdio: 'ignore', detached: true });
  fake.unref();
  const deadPid = Number(spawnSync('sh', ['-c', 'echo $$'], { encoding: 'utf8' }).stdout.trim());
  fs.writeFileSync(path.join(dead, 'owner.json'), JSON.stringify({ parent: deadPid, chrome: fake.pid }));
  fs.writeFileSync(path.join(mine, 'owner.json'), JSON.stringify({ parent: process.pid, chrome: fake.pid }));
  assert.equal(sweepStaleProfiles(tmp), 1);
  assert.equal(fs.existsSync(dead), false);
  assert.equal(fs.existsSync(mine), true);
  for (let i = 0; i < 50 && isAlive(fake.pid); i++) await sleep(30);
  assert.equal(isAlive(fake.pid), false);
});
