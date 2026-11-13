// 032 P2c：素材、風格、量測的參數解析（C4）、「→ 下一步」與 ✓（C5）、退役的子指令（C8）
//   media／audit／brand／music 的 --旗標=值（只在第一個 = 切）、缺值 ✖、真的互斥才擋；brand、music 經 symlink 執行也會跑；
//   shorts、music 的「→ 下一步」下面只有指令；srt-split 收掉了（印「沒有這個指令」的 ✖、--help 不再列）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { TOOLS, TEMPLATE, imp, tmpDir, needs } from './helpers.mjs';

const run = (tool, args, opt = {}) => spawnSync(process.execPath, [path.join(TOOLS, tool), ...args], { encoding: 'utf8', ...opt });
const out = (r) => `${r.stdout}${r.stderr}`;
// 「→ 下一步：」那一行之後、到下一個不是指令的行為止，每一行都要是整行可以跑的指令
function nextBlock(lines) {
  const i = lines.findIndex((l) => l.startsWith('→ 下一步：'));
  assert.ok(i >= 0, `沒有「→ 下一步：」：\n${lines.join('\n')}`);
  const after = lines.slice(i + 1).filter((l) => l.trim());
  return { note: lines[i], cmds: after.filter((l) => /^(node |npx |\(cd )/.test(l)), rest: after.filter((l) => !/^(node |npx |\(cd )/.test(l)) };
}

// ---------- C4：media.mjs ----------

test('media parseArgs：--said=a=b 只在第一個 = 切；--say 也收；缺值、下一個是旗標都丟錯；--transcript 和 --retranscribe 互斥', async () => {
  const { parseArgs } = await imp('media.mjs');
  const { saidOf } = await imp('lib/cli.mjs');
  assert.equal(parseArgs(['rough', '--said=可以=就這樣']).said, '可以=就這樣');
  assert.equal(saidOf(parseArgs(['cuts', '--say', '第 3 列不要剪'])), '第 3 列不要剪');
  assert.equal(parseArgs(['ng-snap', '--edit=audio:threshold=0.1']).edit, 'audio:threshold=0.1');
  assert.throws(() => parseArgs(['rough', '--said']), /--said 後面要接值/);
  assert.throws(() => parseArgs(['rough', '--project', '--no-editor']), /--project 後面要接值/, '下一個是旗標不能當成值吃掉');
  assert.throws(() => parseArgs(['rough', '--transcript', 'a.json', '--retranscribe']), /--transcript 和 --retranscribe 不能一起用/);
  assert.deepEqual(parseArgs(['cuts', '--keep', '3', '--cut', '7']), { cmd: 'cuts', keep: '3', cut: '7' }, '--keep、--cut 可以一起給（不互斥）');
  assert.deepEqual(parseArgs(['illus-show', 'phone', '--opts=screen=rec']), { cmd: 'illus-show', arg: 'phone', opts: 'screen=rec' });
});

test('media CLI：缺值印 ✖、結束碼 1', () => {
  const r = run('media.mjs', ['cuts', '--project', '--said', 'x']);
  assert.equal(r.status, 1, out(r));
  assert.match(r.stderr, /^✖ --project 後面要接值/m);
});

// ---------- C8：srt-split 收掉了 ----------

test('C8：srt-split 印「沒有這個指令」的 ✖；--help（清單和全部）都不列；snap-srt 還在（沒有 transcript.json 的專案走得到）', async () => {
  const r = run('media.mjs', ['srt-split', '--project', 'projects/x']);
  assert.equal(r.status, 1, out(r));
  assert.match(r.stderr, /^✖ 沒有「srt-split」這個指令：只有 .*srt-align/m);
  assert.doesNotMatch(r.stderr, /只有[^\n]*srt-split/);
  const short = run('media.mjs', ['--help']).stdout, all = run('media.mjs', ['--help', '--all']).stdout;
  for (const h of [short, all]) assert.doesNotMatch(h, /srt-split/);
  assert.match(short, /media\.mjs snap-srt/);
  const M = await imp('media.mjs');
  for (const name of ['srtSplit', 'splitCues', 'splitText']) assert.equal(M[name], undefined, `${name} 跟著收掉`);
});

// ---------- C4：audit.mjs ----------

test('audit parseArgs：--chrome=a=b 不切壞；缺值、下一個是旗標都丟錯；--all 和 --only 不互斥（--only 指名的照量，audit.test 的契約）', async () => {
  const { parseArgs } = await imp('audit.mjs');
  assert.deepEqual(parseArgs(['--only=x01,s03', '--json']), { only: 'x01,s03', json: true });
  assert.equal(parseArgs(['--chrome=/a=b/chrome']).chrome, '/a=b/chrome');
  assert.throws(() => parseArgs(['--project', '--json']), /--project 後面要接值/);
  assert.deepEqual(parseArgs(['--all', '--only', 'x01']), { all: true, only: 'x01' });
  assert.deepEqual(parseArgs(['--only', 'x03', '--shots', '--sheet']), { only: 'x03', shots: true, sheet: true });
});

// ---------- C4：brand.mjs ----------

test('brand：經 symlink 執行也會跑（以前什麼都不做）；--旗標=值；缺值、不認得的旗標 ✖ 附怎麼改；bg 的模式互斥', (t) => {
  const dir = tmpDir(t, 'hf-032-p2c-brand-');
  const link = path.join(dir, 'brand-link.mjs');
  fs.symlinkSync(path.join(TOOLS, 'brand.mjs'), link);
  const viaLink = spawnSync(process.execPath, [link, '--help'], { encoding: 'utf8' });
  assert.equal(viaLink.status, 0, out(viaLink));
  assert.match(viaLink.stdout, /brand\.mjs bg --html <檔\.html> --kind fs\|side\|ch/);
  // pack：--note=a=b 的值完整留著（假的 kit，不動 shared/template/）
  const kit = path.join(dir, 'template', 'kit');
  fs.mkdirSync(kit, { recursive: true });
  fs.copyFileSync(path.join(TEMPLATE, 'kit', 'brand.css'), path.join(kit, 'brand.css'));
  const pk = run('brand.mjs', ['pack', '測試包', '--note=說明=有等號', `--kit=${kit}`]);
  assert.equal(pk.status, 0, out(pk));
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'template', 'styles', '測試包', 'style.json'), 'utf8')).note, '說明=有等號');
  // 缺值：--kind 後面接的是 --tmp（以前會把 --tmp 當成種類）
  const miss = run('brand.mjs', ['bg', '--kind', '--tmp']);
  assert.equal(miss.status, 1);
  assert.match(miss.stderr, /^✖ --kind 後面要接值 → 在 --kind 後面補上值/m);
  const sp = run('brand.mjs', ['speaker', '--name']);
  assert.match(sp.stderr, /^✖ --name 後面要接值 → 例：/m);
  const bad = run('brand.mjs', ['--foo']);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /^✖ brand\.mjs 沒有 --foo 這個參數 → 換主色：/m);
  const both = run('brand.mjs', ['bg', '--tmp', '--verify', dir]);
  assert.equal(both.status, 1);
  assert.match(both.stderr, /✖ --tmp 和 --verify 不能一起用/);
});

// ---------- C4、C5：music.mjs ----------

test('music：經 symlink 執行也會跑；缺值、不認得的旗標 ✖；--style 和 --prompt 互斥（還沒碰 ACE-Step 就擋）', (t) => {
  const dir = tmpDir(t, 'hf-032-p2c-music-');
  const link = path.join(dir, 'music-link.mjs');
  fs.symlinkSync(path.join(TOOLS, 'music.mjs'), link);
  const viaLink = spawnSync(process.execPath, [link, '--help'], { encoding: 'utf8' });
  assert.equal(viaLink.status, 0, out(viaLink));
  assert.match(viaLink.stdout, /music\.mjs gen/);
  const miss = run('music.mjs', ['list', '--project']);
  assert.equal(miss.status, 1);
  assert.match(miss.stdout, /^✖ --project 後面要接值/m);
  const bad = run('music.mjs', ['list', '--bogus']);
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /^✖ 沒有 --bogus 這個參數 → /m);
  const both = run('music.mjs', ['gen', '--style', '輕快科技', '--prompt', 'calm piano']);
  assert.equal(both.status, 1);
  assert.match(both.stdout, /^✖ --style 和 --prompt 不能一起用/m);
});

test('music keep：--旗標=值；「→ 下一步」下面只有指令，單集用 build.mjs --set bed.music=<曲名>，專案路徑有空白也加引號', (t) => {
  const dir = tmpDir(t, 'hf-032-p2c-keep-');
  const proj = path.join(dir, 'my proj'), cand = path.join(dir, '候選');
  fs.mkdirSync(path.join(proj, 'work'), { recursive: true });
  fs.mkdirSync(cand, { recursive: true });
  fs.writeFileSync(path.join(cand, '1.wav'), 'RIFF');
  fs.writeFileSync(path.join(cand, 'candidates.json'), JSON.stringify({ prompt: 'p', style: '輕快科技', seconds: 90, engine: 'ACE-Step 1.5', created: 'x', tracks: [{ n: 1, file: '1.wav', seed: 1, model: 'm', dur: 90 }] }));
  const r = run('music.mjs', ['keep', '1', '--name=bed-x', `--from=${cand}`, '--project', 'my proj'], { cwd: dir });
  assert.equal(r.status, 0, out(r));
  assert.ok(fs.existsSync(path.join(proj, 'work', 'music', 'bed-x.wav')));
  const b = nextBlock(r.stdout.trim().split('\n'));
  assert.deepEqual(b.rest, [], '「→ 下一步」下面不能有不是指令的行');
  assert.deepEqual(b.cmds, ['node shared/template/tools/build.mjs --project "my proj" --set bed.music=bed-x']);
});

// ---------- C5：shorts ----------

test('shorts：「→ 下一步」下面只有指令（「用 auto-edit-longform 剪 …」寫進說明）', async (t) => {
  if (!(await needs(t, 'ffmpeg'))) return;
  const root = tmpDir(t, 'hf-032-p2c-shorts-');
  const proj = path.join(root, 'projects', 'long');
  fs.mkdirSync(path.join(proj, 'work'), { recursive: true });
  const ff = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=s=640x360:d=4:r=30', '-f', 'lavfi', '-i', 'sine=f=440:d=4', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', path.join(proj, 'work', 'rough.mp4')], { encoding: 'utf8' });
  assert.equal(ff.status, 0, ff.stderr);
  fs.writeFileSync(path.join(proj, 'work', 'rough.srt'), '1\n00:00:00,500 --> 00:00:01,800\n第一句\n\n2\n00:00:02,000 --> 00:00:03,200\n第二句\n');
  const SH = await imp('lib/shorts.mjs');
  const lines = [];
  SH.makeShort({ project: proj, name: 'short1', range: '#1-#2', root, log: (l) => lines.push(l) });
  const b = nextBlock(lines);
  assert.match(b.note, /^→ 下一步：請使用者看一眼講者有沒有在畫面中間；沒問題就照一般流程剪這個新專案（直式）：用 auto-edit-longform 剪 projects\/short1$/);
  assert.deepEqual(b.rest, []);
  assert.deepEqual(b.cmds, []);
});
