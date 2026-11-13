// 032 第二階段 P2a（分鏡與 build）：C4 參數解析（build、qc 改用 lib/cli.mjs）、模式互斥、isMain 經 symlink、
// C5「→ 下一步」下面都是指令、派工改成「→ 派工」、指令路徑有空白會加引號。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { TOOLS, makeSrt, imp } from './helpers.mjs';

const B = await imp('build.mjs');
const Q = await imp('qc.mjs');
const F = await imp('lib/flow.mjs');
const G = await imp('lib/progress.mjs');

const tmp = (t, prefix) => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix)); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; };
const put = (root, rel, text, minAgo = null) => {
  const f = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
  if (minAgo != null) { const d = new Date(Date.now() - minAgo * 60000); fs.utimesSync(f, d, d); }
};
const run = (file, args, opts = {}) => spawnSync(process.execPath, [file, ...args], { encoding: 'utf8', timeout: 60000, ...opts });
const lines = (s) => String(s).trimEnd().split('\n');
// 「→ 下一步：」下面到下一個 → 或結尾之前，每一行都要是整行可執行的指令
function nextBlocks(out) {
  const L = lines(out), blocks = [];
  L.forEach((l, i) => {
    if (!l.startsWith('→ 下一步：')) return;
    const cmds = [];
    for (let k = i + 1; k < L.length && !L[k].startsWith('→ ') && L[k].trim(); k++) cmds.push(L[k]);
    blocks.push({ head: l, cmds });
  });
  return blocks;
}
const IS_CMD = /^(node |npx |\(cd )/;

// ---------- C4 參數解析 ----------

test('build parseArgs：--said=a=b 保留 a=b、--say 也收；值旗標後面是另一個旗標就 ✖（附怎麼改）', () => {
  assert.deepEqual(B.parseArgs(['--apply-storyboard', '--said=改成 a=b 就好']), { 'apply-storyboard': true, said: '改成 a=b 就好' });
  assert.deepEqual(B.parseArgs(['--framing-done', '--say', '可以']), { 'framing-done': true, say: '可以' });
  assert.throws(() => B.parseArgs(['--project', '--check']), /^Error: --project 後面要接值 → /);
  assert.throws(() => B.parseArgs(['--said']), /--said 後面要接值 → /);
  const r = run(path.join(TOOLS, 'build.mjs'), ['--project', '--check']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^✖ --project 後面要接值 → /, '不是把 --check 當專案名');
});

test('qc parseArgs：--file=a=b.mp4 只在第一個 = 切；值旗標缺值、後面是旗標都 ✖（原本的 → 怎麼改照留）', () => {
  assert.deepEqual(Q.parseArgs(['final', '--file=out/a=b.mp4', '--json']), { cmd: 'final', file: 'out/a=b.mp4', json: true });
  assert.deepEqual(Q.parseArgs(['observe', '--from', '60', '--to=120']), { cmd: 'observe', from: '60', to: '120' });
  assert.throws(() => Q.parseArgs(['final', '--project', '--json']), /--project 後面要接值 → 在 --project 後面補上值/);
  assert.throws(() => Q.parseArgs(['final', '--file']), /--file 後面要接值 → /);
  const r = run(path.join(TOOLS, 'qc.mjs'), ['final', '--project', '--json']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /✖ --project 後面要接值/);
});

test('build 模式互斥：兩個模式 ✖「不能一起用」、不做任何事；文件與工具用過的組合都還能用', (t) => {
  assert.throws(() => B.modeOf({ check: true, storyboard: true }), /--storyboard 和 --check 不能一起用 → 一次跑一個/);
  assert.throws(() => B.modeOf({ review: true, 'apply-storyboard': true }), /不能一起用/);
  assert.throws(() => B.modeOf({ unset: 'style', framing: true }), /--framing 和 --unset 不能一起用/);
  assert.equal(B.modeOf({ project: 'x' }), null, '沒有模式＝build');
  const legal = [
    ['--check', '--json'], ['--check', '--json', '--table', '--format', 'portrait'], ['--list', '--json'], ['--gallery', '--only', 'x-flow'],
    ['--design-canvas', 's01', '--reset'], ['--storyboard', '--only', 's05,s12', '--force'], ['--review', '--no-reuse', '--prerender', '--all-sheets'],
    ['--review', '--no-prerender'], ['--autofix', '--only', 's05', '--keep-sfx', 's05', '--json'], ['--plan', 'a.json', '--autofix', '--json'],
    ['--merge-drafts', '--no-storyboard', '--force'], ['--apply-storyboard', '--said', '可以'], ['--framing-done', '--use', 'suggested', '--said=用建議的'],
    ['--framing', '--wait', '5'], ['--set', 'theme=dark', '--unset', 'style'], ['--unset', 'bed'], ['--to-design', 's05'], ['--test', '41,4', '--nocaps'], ['--capcut'],
    ['--prepare', '--reencode', '--no-loudnorm', '--no-declick', '--format', 'portrait', '--template', 't'], ['--show', '1:15', '--format', 'portrait'],
    ['--scaffold', '--format', 'portrait'], ['--map', 'ch01'], ['--map-merge'], ['--outline', 'ch01'], ['--check-draft', 'work/drafts/ch01.json'],
    ['--design-status'], ['--spec', 'key-point'], ['--icons', '手機'], ['--pics'], ['--pics', '手機'], ['--words', '28-41'], ['--table'], ['--reencode'],
  ];
  for (const a of legal) assert.doesNotThrow(() => B.modeOf(B.parseArgs(['--project', 'projects/x', ...a])), a.join(' '));
  // CLI：擋在最前面，不會跑到第一個模式（以前 --check --storyboard 只靜靜跑 --check）
  const p = tmp(t, 'p2a-mode-');
  const r = run(path.join(TOOLS, 'build.mjs'), ['--project', p, '--design-status', '--to-design', 's01']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^✖ --to-design 和 --design-status 不能一起用 → 一次跑一個/);
  assert.equal(r.stdout, '');
  const ok = run(path.join(TOOLS, 'build.mjs'), ['--list', '--json']);
  assert.equal(ok.status, 0, ok.stderr);
  assert.ok(JSON.parse(ok.stdout).scenes.length > 0);
});

test('isMain：經 symlink 執行 build.mjs、qc.mjs 也會跑（不會靜靜 exit 0）', (t) => {
  const d = tmp(t, 'p2a-link-');
  for (const [name, head] of [['build.mjs', '主合成產生器'], ['qc.mjs', '品質檢查工具']]) {
    const link = path.join(d, `link-${name}`);
    fs.symlinkSync(path.join(TOOLS, name), link);
    const r = run(link, ['--help']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, new RegExp(head), `${name} 經 symlink 沒有跑`);
  }
});

// ---------- C5 next()／dispatch() ----------

test('--storyboard 的 ② 閘門：「→ 下一步」下面都是指令；路徑有空白的專案指令加引號', (t) => {
  const root = tmp(t, 'p2a-gate-');
  const p = path.join(root, 'my proj');
  put(p, 'work/rough.srt', makeSrt({ n: 6 }));
  put(p, 'assets/camera/a.mp4', '');
  put(p, 'work/hyperframes/plan.json', JSON.stringify({ version: 1, scenes: [] }));
  for (const st of [null, '待回覆']) {
    if (st) G.appendStop(p, { stop: '② 構圖', state: st });
    const r = run(path.join(TOOLS, 'build.mjs'), ['--project', p, '--storyboard']);
    assert.equal(r.status, 1);
    const blocks = nextBlocks(r.stdout);
    assert.equal(blocks.length, 1, r.stdout);
    assert.ok(blocks[0].cmds.length >= 1 && blocks[0].cmds.every((c) => IS_CMD.test(c)), r.stdout);
    assert.ok(blocks[0].cmds.every((c) => /--project "[^"]*my proj" /.test(c)), `路徑有空白要加引號：\n${blocks[0].cmds.join('\n')}`);
  }
});

test('--design-status：做完 → 下一步＋定稿指令；還在做 → 只有說明；卡住 → 「→ 派工」＋縮排兩格的派工訊息，沒有「→ 下一步」', (t) => {
  const root = tmp(t, 'p2a-ds-');
  const p = path.join(root, 'a b');
  const ds = () => run(path.join(TOOLS, 'build.mjs'), ['--project', p, '--design-status']);
  put(p, 'work/hyperframes/plan.json', JSON.stringify({ version: 1, scenes: [{ id: 'd1', design: true }] }), 40);
  put(p, 'work/hyperframes/compositions/x-design-d1.html', '<template><div>做好了</div></template>', 3);
  put(p, 'work/audit-shots/sheet-d1.jpg', 'jpg', 1);
  let r = ds();
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(lines(r.stdout).slice(-2), ['→ 下一步：全部做好了，定稿：', `node shared/template/tools/build.mjs --project "${path.relative(process.cwd(), p)}" --review`]);
  put(p, 'work/audit-shots/sheet-d1.jpg', 'jpg', 10);   // 拼圖比動畫舊：還在改
  r = ds();
  assert.equal(lines(r.stdout).at(-1), '→ 下一步：還在做，等設計師回覆（不要用 sleep 迴圈等）');
  put(p, 'work/hyperframes/compositions/x-design-d1.html', '<template><div data-design-blank></div></template>', 30);
  put(p, 'work/briefs/d1.md', '# d1', 30);
  r = ds();
  assert.doesNotMatch(r.stdout, /→ 下一步/);
  const L = lines(r.stdout), i = L.findIndex((l) => l.startsWith('→ 派工：停掉原本負責 d1 的設計師，重派'));
  assert.ok(i >= 0, r.stdout);
  assert.match(L[i + 1], /^ {2}你是設計師，負責 .*a b 的內容設計動畫 <段>。照 .*design\.md 寫鏡位腳本、接著做動畫/);
  assert.equal(L.length, i + 2, '派工訊息後面沒有別的');
});

test('dispatchLines：「→ 派工」開頭、每則派工訊息縮排兩格；記下派工的那一刻', (t) => {
  const p = tmp(t, 'p2a-dl-');
  put(p, 'work/hyperframes/plan.json', JSON.stringify({ version: 1, scenes: [{ id: 'd1', design: true }, { id: 'd2', design: true }] }));
  put(p, 'work/designs/d2.md', '# d2');
  const L = F.dispatchLines(B.pathsFrom({ project: p }), ['d1', 'd2']);
  assert.match(L[0], /^→ 派工：內容設計動畫一段派一個設計師，同一則回覆一次派出（一次最多 \d+ 個，回來再派下一批）：d1、d2。派工訊息只送下面這一行（換掉 <段>，不要另外加要求）：$/);
  assert.equal(L.length, 3);
  assert.ok(L.slice(1).every((l) => /^ {2}（d[12]）你是設計師/.test(l)), L.join('\n'));
  assert.ok(F.readDispatch({ project: p }).d1);
  assert.deepEqual(F.dispatchLines({ project: p }, []), []);
});
