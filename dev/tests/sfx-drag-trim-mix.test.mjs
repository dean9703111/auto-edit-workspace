// 065 音效拖曳、裁前後的混音實跑：build → 只有聲音的合成（lib/incremental.mjs audioOnlyHtml，和「重混聲音」同一條）→ HyperFrames render → ffmpeg 量每一顆什麼時候響
//   欄位、build、存檔的單元測試在 sfx-drag-trim.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { lib, imp, makeSrt, tmpDir, missingTools, TOOLS, WORKSPACE } from './helpers.mjs';

const { wavSeconds } = await imp('lib/sfx-local.mjs');
const L = await lib();
const F = 1 / 30;
const r3 = (x) => +x.toFixed(3);
const DING = wavSeconds(path.join(WORKSPACE, 'shared', 'sfx', 'ding.wav'));

const noRender = await missingTools('ffmpeg', 'chrome');
const hfPkg = (() => { try { return JSON.parse(fs.readFileSync(path.join(WORKSPACE, 'node_modules', 'hyperframes', 'package.json'), 'utf8')); } catch { return null; } })();
test('混音實跑：段落主音效往後拖 1 秒＋裁後段、自己加的裁前段 → 成品裡那一顆從新的時間開始響、裁掉後段的在新的長度停', { skip: noRender || (!hfPkg && '沒有 node_modules/hyperframes（工作區根目錄 npm install）'), timeout: 300000 }, async (t) => {
  const root = tmpDir(t, 'sfx-mix-');
  const project = path.join(root, 'projects', 'demo'), work = path.join(project, 'work'), out = path.join(work, 'hyperframes');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(work, 'rough.srt'), makeSrt({ n: 3 }));
  let r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=gray:size=320x180:rate=30', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '12', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', path.join(work, 'rough.mp4')]);
  assert.equal(r.status, 0, String(r.stderr));
  const plan = { version: 1, speakerBox: [700, 200, 1220, 1000], look: { color: 0, slim: 0 }, check: { textSync: false },
    edit: { sfx: [{ at: 8, sound: 'impact', trimIn: 0.1 }], sfxAdjust: [{ id: 's01', shift: 1, trimOut: 0.4 }] },
    scenes: [{ id: 's01', scene: 'concept', from: '#1', to: '#2e', sfx: 'ding', slots: { text: '字卡' } }] };
  fs.writeFileSync(path.join(out, 'plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
  r = spawnSync(process.execPath, [path.join(TOOLS, 'build.mjs'), '--project', project], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const idx = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  const tags = [...idx.matchAll(/<audio id="(sfx-[^"]+)"[^>]*>/g)];
  assert.deepEqual(tags.map((m) => m[1]).sort(), ['sfx-own1', 'sfx-s01'], '只有這兩顆音效（沒有底樂、片尾）');
  const { audioOnlyHtml, AUDIO_COMP } = await imp('lib/incremental.mjs');
  const a = audioOnlyHtml(idx);
  assert.ok(a, '只有聲音的合成做得出來');
  fs.writeFileSync(path.join(out, AUDIO_COMP), a.html);
  const mp4 = path.join(root, 'mix.mp4');
  const bin = typeof hfPkg.bin === 'string' ? hfPkg.bin : hfPkg.bin.hyperframes;
  r = spawnSync(process.execPath, [path.join(WORKSPACE, 'node_modules', 'hyperframes', bin), 'render', '-c', AUDIO_COMP, '--sdr', '--fps', String(a.fps), '--quality', 'draft', '--workers', '1', '--output', mp4], { cwd: out, encoding: 'utf8', timeout: 240000 });
  assert.equal(r.status, 0, (r.stdout + r.stderr).slice(-2000));
  // 有聲音的區間（−45 dB 以上、靜音至少 0.1 秒）
  const det = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', mp4, '-vn', '-af', 'silencedetect=n=-45dB:d=0.1', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const ends = [...det.matchAll(/silence_end: ([\d.]+)/g)].map((m) => +m[1]), starts = [...det.matchAll(/silence_start: ([\d.]+)/g)].map((m) => +m[1]);
  const spans = ends.filter((e) => e < 11.9).map((e) => [e, starts.find((s) => s > e) ?? null]);   // 12 秒＝檔尾，ffmpeg 收尾印的不算
  const ding = r3(1 - L.sfx.ding.peak + F + 1), own = r3(8 - L.sfx.impact.peak + F + 0.1);
  assert.equal(spans.length, 2, `有聲音的區間：${JSON.stringify(spans)}\n${det.slice(-1500)}`);
  assert.ok(Math.abs(spans[0][0] - ding) < 0.03, `s01 的 ding 開始響：${spans[0][0]}，要 ${ding}（#1＝1 秒，往後拖 1 秒）`);
  assert.ok(Math.abs(spans[0][1] - (ding + r3(DING - 0.4))) < 0.03, `s01 的 ding 停：${spans[0][1]}，要 ${r3(ding + DING - 0.4)}（裁掉後面 0.4 秒）`);
  assert.ok(Math.abs(spans[1][0] - own) < 0.03, `自己加的 impact 開始響：${spans[1][0]}，要 ${own}（裁掉前面 0.1 秒＝晚 0.1 秒）`);
});
