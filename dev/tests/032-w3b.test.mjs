// 032 W3b：status 的 ② 新指令、--init --format 連 plan.json、素材清單 ⚠、Skill ⚠；brand.mjs bg --tmp／--image／--verify、use 自動存原本；
// audit 的 B3（plan.json 比 index.html 新）、B5 心跳；空白畫布的舞台容器（B8）、垂直不平衡印目標值
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { TOOLS, TEMPLATE, imp } from './helpers.mjs';

const S = await imp('status.mjs');
const { stopLines } = await imp('lib/stops.mjs');
const has = (rel) => fs.existsSync(path.join(TOOLS, rel));
const tmpDir = (t, p = 'hf-032-w3b-') => { const d = fs.mkdtempSync(path.join(os.tmpdir(), p)); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };
const touch = (p, rel, text = 'x', ageSec = 0) => {
  const f = path.join(p, ...rel.split('/'));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
  const at = new Date(Date.now() - ageSec * 1000);
  fs.utimesSync(f, at, at);
};
const STOP_TABLE = (...rows) => ['# 製作進度', '', '## 停點紀錄', '', '| 時間 | 停點 | 狀態 | 使用者原話 | 寫回哪裡 |', '|---|---|---|---|---|', ...rows, ''].join('\n');
const run = (tool, ...args) => spawnSync(process.execPath, [path.join(TOOLS, tool), ...args], { encoding: 'utf8' });
const noProj = (c) => c.replace(/--project \S+ /, '');
const ffmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
const dims = (f) => spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f], { encoding: 'utf8' }).stdout.trim();

// 一支已經剪好初剪的真人專案（停在 ② 之前）
function roughDone(t) {
  const p = tmpDir(t);
  for (const d of ['camera', 'voice', 'screen', 'images']) fs.mkdirSync(path.join(p, 'assets', d), { recursive: true });
  touch(p, 'assets/camera/a.mp4');
  for (const f of ['work/main.mp4', 'work/cuts.md', 'work/rough.mp4', 'work/rough.srt.align-1', 'work/transcript.json', 'work/cutpoints.json']) touch(p, f);
  touch(p, 'work/rough.srt', '1\n00:00:01,000 --> 00:00:02,000\n短句\n');
  return p;
}

// ---------- A2：status 的 ② 改印 build.mjs --framing／--framing-done ----------

test('A2：② 還沒給使用者看 → --framing；在等回覆 → 調好了／用建議的各一條 --framing-done；② 通過還沒量講者框 → --framing-done', (t) => {
  const p = roughDone(t);
  const at = '2026-11-13 10:00';
  const st = () => S.projectStatus(p);
  const s8 = st();
  assert.equal(s8.stage, 'S8');
  if (!s8.cmds[0].includes('look.mjs')) assert.deepEqual(s8.cmds.map(noProj), ['node shared/template/tools/build.mjs --framing']);
  touch(p, 'work/構圖預覽.jpg');
  assert.deepEqual(st().cmds.map(noProj), ['node shared/template/tools/build.mjs --framing'], 'S9：構圖預覽有了、② 還沒記');
  touch(p, 'work/製作進度.md', STOP_TABLE(`| ${at} | ② 構圖 | 待回覆 | — | — |`));
  let s = st();
  assert.equal(s.stopLine, stopLines.framing('<構圖台網址>'));
  assert.deepEqual(s.after.map((a) => [a.when, a.cmds.map(noProj)]), [
    ['回覆「調好了」', ['node shared/template/tools/build.mjs --framing-done --said "<使用者原話>"']],
    ['回覆「用建議的」', ['node shared/template/tools/build.mjs --framing-done --use suggested --said "<使用者原話>"']],
    ['回覆倍率（例「1.3 倍」）', ['node shared/template/tools/build.mjs --framing-done --use <倍率> --said "<使用者原話>"']],
  ]);
  assert.doesNotMatch(s.next, /qc\.mjs/, '不再叫 AI 自己跑 qc.mjs framing／speaker');
  touch(p, 'work/look-preview.jpg');
  assert.equal(st().stopLine, stopLines.framing('<構圖台網址>', { look: true }));
  touch(p, 'work/製作進度.md', STOP_TABLE(`| ${at} | ② 構圖 | 通過 | 「調好了」 | plan.json |`));
  s = st();
  assert.equal(s.at, '剪好看／② 通過，量講者框');
  assert.deepEqual(s.cmds.map(noProj), ['node shared/template/tools/build.mjs --framing-done']);
});

test('D1、D9：停點那兩行都來自 lib/stops.mjs；技能步驟對到 Skill 的標題（流程 A、流程 D）', (t) => {
  const p = roughDone(t);
  const at = '2026-11-13 10:00';
  for (const [row, line] of [['① 剪輯清單', stopLines.cuts('<剪輯清單網址>')], ['③ 分鏡表', stopLines.storyboard('<分鏡表網址>')], ['④ 完成影片預覽', stopLines.final('<完成影片預覽網址>')],
    ['⑤ 剪輯台', stopLines.editor('<剪輯台網址>')], ['⑥ 背景預覽', stopLines.bg('<暫存資料夾>')], ['③ 分鏡表（s12 v2）', stopLines.revise('③ 分鏡表（s12 v2）', 'work/versions/s12/v2/分鏡.md')]]) {
    touch(p, 'work/製作進度.md', STOP_TABLE(`| ${at} | ${row} | 待回覆 | — | — |`));
    assert.equal(S.projectStatus(p).stopLine, line, row);
  }
  touch(p, 'work/製作進度.md', STOP_TABLE(`| ${at} | ③ 分鏡表（s12 v2） | 待回覆 | — | — |`));
  assert.equal(S.projectStatus(p).skill, 'auto-edit-review 流程 D（references/revise.md 第 1–2 步）');
  const src = fs.readFileSync(path.join(TOOLS, 'status.mjs'), 'utf8');
  assert.doesNotMatch(src, /A1–A4|D1–D2/);
  assert.doesNotMatch(src, /'⏸ 停點|`⏸ 停點/, 'status.mjs 不再寫死停點原文');
  assert.doesNotMatch(fs.readFileSync(path.join(TOOLS, 'music.mjs'), 'utf8'), /⏸ 停點/, 'music.mjs 不再寫死停點原文');
  // 每一個「auto-edit-xxx 步驟 N」都對得到那支 SKILL.md 的 **N. 標題
  const skills = path.join(TEMPLATE, '..', '..', '.agents', 'skills');
  for (const m of src.matchAll(/'(auto-edit-[a-z]+) 步驟 (\d+)(?:[–、](\d+))?/g)) {
    const md = fs.readFileSync(path.join(skills, m[1], 'SKILL.md'), 'utf8');
    for (const n of [m[2], m[3]].filter(Boolean)) assert.match(md, new RegExp(`^\\*\\*${n}\\. `, 'm'), `${m[0]}：${m[1]} 沒有步驟 ${n}`);
  }
});

// ---------- A9③：--init --format 連 plan.json 的 format 一起改 ----------

test('A9③：--init --format portrait，plan.json 已經有了就一起改（印 ✓ plan.json：format＝…）；沒有 plan.json 不建', { skip: !has('lib/plan-set.mjs') && 'W1b 的 lib/plan-set.mjs 還沒有' }, async (t) => {
  const p = roughDone(t);
  assert.equal(await S.initFormat(p, 'portrait'), null, '還沒有 plan.json：不建');
  assert.ok(!fs.existsSync(path.join(p, 'work', 'hyperframes', 'plan.json')));
  touch(p, 'work/hyperframes/plan.json', JSON.stringify({ version: 1, format: 'landscape', scenes: [] }, null, 2));
  const r = run('status.mjs', '--project', p, '--init', '--format', 'portrait');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /✓ plan\.json：format＝portrait（原本 landscape）/);
  assert.match(r.stdout, /版式：直式（使用者指定）/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(p, 'work', 'hyperframes', 'plan.json'), 'utf8')).format, 'portrait');
  assert.doesNotMatch(r.stdout, /⚠ .*(不一致|對不上)/, '兩個來源一致，不再提醒');
  const again = run('status.mjs', '--project', p, '--init', '--format', '直式', '--json');
  assert.deepEqual(JSON.parse(again.stdout).plan, [], '已經是直式：沒有改動');
});

// ---------- A10：素材清單 ----------

test('A10：assetsWarnLine：被改過、不見了各列（最多 3 個）＋重剪指令；沒有清單（null）或都沒變不印', () => {
  assert.equal(S.assetsWarnLine(null, 'projects/x'), null);
  assert.equal(S.assetsWarnLine({ changed: [], missing: [] }, 'projects/x'), null);
  const l = S.assetsWarnLine({ changed: ['assets/camera/a.mp4'], missing: ['講稿.md', 'assets/images/1.png', 'assets/images/2.png', 'assets/images/3.png'] }, 'projects/我的 影片');
  assert.match(l, /^素材：⚠ assets\/camera\/a\.mp4 被改過；講稿\.md、assets\/images\/1\.png、assets\/images\/2\.png 等 4 個不見了/);
  assert.match(l, /→ 素材只能讀.*node shared\/template\/tools\/media\.mjs prep --project "projects\/我的 影片" --again$/);
});

test('A10：status 比對 media.mjs prep 記的清單：改過、刪掉的印 素材：⚠，新加的不算', { skip: !has('lib/assets-manifest.mjs') && 'W3a 的 lib/assets-manifest.mjs 還沒有' }, async (t) => {
  const { writeManifest } = await imp('lib/assets-manifest.mjs');
  const p = roughDone(t);
  touch(p, '講稿.md', '講稿');
  const plain = run('status.mjs', '--project', p);
  assert.doesNotMatch(plain.stdout, /素材：/, '舊專案沒有清單：不印');
  writeManifest(p);
  assert.doesNotMatch(run('status.mjs', '--project', p).stdout, /素材：/, '都沒變：不印');
  touch(p, 'assets/images/new.png');
  assert.doesNotMatch(run('status.mjs', '--project', p).stdout, /素材：/, '多出新檔不算');
  touch(p, 'assets/camera/a.mp4', '換過的內容', -60);
  fs.rmSync(path.join(p, '講稿.md'));
  const r = run('status.mjs', '--project', p);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^素材：⚠ assets\/camera\/a\.mp4 被改過；講稿\.md 不見了.*--again$/m);
});

// ---------- D3：Skill 裝好的版本 ----------

test('D3：skillsWarnLine：ok 才不印；第一筆＋共 N 處；第一筆自己帶 → 就用它的改法', () => {
  assert.equal(S.skillsWarnLine({ ok: true, stale: [] }), null);
  assert.equal(S.skillsWarnLine(null), null);
  assert.equal(S.skillsWarnLine({ ok: false, stale: ['.claude/skills 的 auto-edit-motion 和 .agents/ 的正本不同', '~/.minimax/skills 還沒裝 auto-edit-rough'] }),
    'Skill：⚠ .claude/skills 的 auto-edit-motion 和 .agents/ 的正本不同…（共 2 處） → node setup/install-skills.mjs');
  assert.equal(S.skillsWarnLine({ ok: false, stale: ['x 不是 install-skills 裝的（同名）→ 改名或移走它，再跑一次 node setup/install-skills.mjs'] }),
    'Skill：⚠ x 不是 install-skills 裝的（同名） → 改名或移走它，再跑一次 node setup/install-skills.mjs');
  assert.equal(S.skillsWarnLine({ ok: false, stale: ['✖ install-skills.mjs --check 沒有回報結果'] }), 'Skill：⚠ install-skills.mjs --check 沒有回報結果 → node setup/install-skills.mjs');
});

test('D3：status 照 checkInstalled 的結果印 Skill：⚠（不一致才印），檢查要快', { skip: !has('../../../setup/install-skills.mjs') && '沒有 setup/install-skills.mjs' }, async (t) => {
  const mod = await import(path.join(TOOLS, '..', '..', '..', 'setup', 'install-skills.mjs'));
  if (typeof mod.checkInstalled !== 'function') { t.skip('W5 的 checkInstalled 還沒有'); return; }
  const t0 = performance.now();
  const r = mod.checkInstalled();
  assert.ok(performance.now() - t0 < 300, '每次 status 都跑：要在 300 毫秒內');
  const p = roughDone(t);
  const out = run('status.mjs', '--project', p).stdout;
  const want = S.skillsWarnLine(r);
  if (want) assert.ok(out.includes(want), out); else assert.doesNotMatch(out, /^Skill：⚠/m);
});

// ---------- A7：brand.mjs bg --tmp／--image／--verify ----------

test('A7：bg --tmp 開暫存資料夾印完整路徑；--image 沒寫 --out、--dark 配 --html、--verify 在 shared/template 裡都 ✖', (t) => {
  let r = run('brand.mjs', 'bg', '--tmp');
  assert.equal(r.status, 0, r.stderr);
  const dir = /暫存資料夾：(.+)$/m.exec(r.stdout)?.[1];
  assert.ok(dir && path.isAbsolute(dir) && fs.statSync(dir).isDirectory(), r.stdout);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const img = path.join(dir, 'x.png');
  fs.writeFileSync(img, 'x');
  r = run('brand.mjs', 'bg', '--image', img, '--kind', 'fs');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /✖ --image 一定要寫 --out <資料夾> → 先跑 node shared\/template\/tools\/brand\.mjs bg --tmp/);
  r = run('brand.mjs', 'bg', '--image', img, '--kind', 'fs', '--out', path.join(TEMPLATE, 'tmp-bg'));
  assert.match(r.stderr, /✖ 輸出資料夾不能在 shared\/template\/ 裡/);
  assert.ok(!fs.existsSync(path.join(TEMPLATE, 'tmp-bg')));
  r = run('brand.mjs', 'bg', '--html', img, '--kind', 'fs', '--dark');
  assert.match(r.stderr, /✖ --dark 只能和 --image 一起用/);
  r = run('brand.mjs', 'bg', '--image', img, '--html', img, '--kind', 'fs');
  assert.match(r.stderr, /✖ --image 和 --html 不能一起用|✖ --html 和 --image 不能一起用/);
  r = run('brand.mjs', 'bg', '--verify', path.join(TEMPLATE, 'styles', '預設'));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /✖ --verify 的資料夾不能在 shared\/template\/ 裡/);
  r = run('brand.mjs', '--help');
  for (const s of ['bg --tmp', 'bg --image <圖> --kind fs|side|ch [--dark] --out <資料夾>', 'bg --verify <資料夾>', 'brand.mjs speaker off', 'speaker --name']) assert.ok(r.stdout.includes(s), s);
});

test('A7：bg --image 裁成三種尺寸、zones、量留空區；--verify 驗尺寸、出 preview.jpg、最後兩行是停點 ⑥（完整路徑）；暗色只有一張 ⚠、尺寸不對 ✖', { skip: !ffmpeg && '沒有 ffmpeg', timeout: 120000 }, (t) => {
  const dir = tmpDir(t), out = path.join(dir, 'out');
  const img = path.join(dir, '使用者 的圖.png'), dirty = path.join(dir, 'dirty.png');
  assert.equal(spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0xF2EEE6:s=1600x1200', '-frames:v', '1', img]).status, 0);
  assert.equal(spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0xF2EEE6:s=1920x1080,drawbox=x=0:y=500:w=1920:h=8:color=black:t=fill', '-frames:v', '1', dirty]).status, 0);
  let r = run('brand.mjs', 'bg', '--image', img, '--kind', 'fs', '--out', out);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /bg-fs\.jpg（1920×1080 ✓）/);
  assert.match(r.stdout, /zones-fs\.jpg（紅＝全畫面主卡/);
  assert.match(r.stdout, /✓ 留空區乾淨（紅、藍、黃框裡沒有裝飾）/);
  const L = r.stdout.trim().split('\n');
  assert.match(L.at(-3), /^→ 下一步：還沒做 side、ch：同一張圖接著裁/);
  assert.match(L.at(-2), /^node shared\/template\/tools\/brand\.mjs bg --image ".*使用者 的圖\.png" --kind side --out /);
  r = run('brand.mjs', 'bg', '--image', img, '--kind', 'side', '--out', out);
  assert.equal(r.status, 0, r.stderr);
  r = run('brand.mjs', 'bg', '--image', dirty, '--kind', 'ch', '--out', out);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /⚠ 紅框（章名卡）裡有 [\d.]+% 的像素是裝飾.*→ 圖在框裡有東西/);
  assert.deepEqual(r.stdout.trim().split('\n').slice(-2), ['→ 下一步：三種都有了：驗證尺寸、出並排預覽、印停點 ⑥', `node shared/template/tools/brand.mjs bg --verify ${out}`]);
  assert.equal(dims(path.join(out, 'bg-fs.jpg')), '1920,1080');
  assert.equal(dims(path.join(out, 'bg-side.jpg')), '960,1080');
  assert.equal(dims(path.join(out, 'zones-ch.jpg')), '1920,1080');
  // --verify：最後兩行就是停點 ⑥（完整路徑）
  r = run('brand.mjs', 'bg', '--verify', out);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(r.stdout.trim().split('\n').slice(-2), stopLines.bg(out).split('\n'));
  assert.match(r.stdout, /── 回報/);
  assert.match(r.stdout, /三張背景：bg-fs\.jpg 1920×1080、bg-side\.jpg 960×1080、bg-ch\.jpg 1920×1080/);
  assert.match(r.stdout, /留空區：⚠ bg-ch\.jpg 框裡有裝飾/);
  assert.equal(dims(path.join(out, 'preview.jpg')), '1600,720');
  // 暗色只有一張：⚠，但亮色三張照樣過
  r = run('brand.mjs', 'bg', '--image', img, '--kind', 'fs', '--dark', '--out', out);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /bg-fs-dark\.jpg（1920×1080 ✓）/);
  assert.match(r.stdout, /→ 下一步：暗色還沒做 side、ch/);
  r = run('brand.mjs', 'bg', '--verify', out);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /⚠ 暗色只有 bg-fs-dark\.jpg → 暗色三張都要有，或都拿掉/);
  for (const k of ['side', 'ch']) assert.equal(run('brand.mjs', 'bg', '--image', img, '--kind', k, '--dark', '--out', out).status, 0);
  r = run('brand.mjs', 'bg', '--verify', out);
  assert.match(r.stdout, /preview-dark\.jpg/);
  assert.equal(dims(path.join(out, 'preview-dark.jpg')), '1600,720');
  // 尺寸不對：✖，不印停點
  assert.equal(spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=white:s=100x100', '-frames:v', '1', path.join(out, 'bg-ch.jpg')]).status, 0);
  r = run('brand.mjs', 'bg', '--verify', out);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /✖ bg-ch\.jpg 是 100×100，要 1920×1080 → 用 brand\.mjs bg --image <那張圖> --kind ch --out <這個資料夾> 裁成對的尺寸/);
  assert.doesNotMatch(r.stdout, /⏸ 停點/);
});

// ---------- A9⑦：use 之前自動存原本 ----------

test('A9⑦：use 時目前的不屬於任何包 → 先存成「原本-<YYYYMMDD>」（同名加 -2）、styles.js 更新；屬於某一包就不存', async (t) => {
  const B = await imp('brand.mjs');
  const tpl = tmpDir(t, 'brand-pack-');
  fs.mkdirSync(path.join(tpl, 'kit'));
  for (const f of ['brand.css', 'pip-frame.png', 'pip-frame-v.png']) fs.copyFileSync(path.join(TEMPLATE, 'kit', f), path.join(tpl, 'kit', f));
  for (const f of ['bg-fs.jpg', 'bg-side.jpg', 'bg-ch.jpg']) fs.copyFileSync(path.join(TEMPLATE, f), path.join(tpl, f));
  B.makePack(tpl, '甲');
  B.makePack(tpl, '乙', { color: '#2563EB' });
  const now = new Date(2026, 10, 13);
  assert.equal(B.usePack(tpl, '乙', { now }).saved, null, '目前就是「甲」：不用存');
  fs.mkdirSync(path.join(tpl, 'styles', '原本-20261113'));
  fs.writeFileSync(path.join(tpl, 'styles', '原本-20261113', 'brand.css'), '/* 今天早一點存的別的包 */');
  assert.equal(B.freePackName(tpl, '原本-20261113'), '原本-20261113-2');
  fs.appendFileSync(path.join(tpl, 'kit', 'brand.css'), '\n/* 手改 */\n');
  const r = B.usePack(tpl, '甲', { now });
  assert.equal(r.saved, '原本-20261113-2');
  assert.match(fs.readFileSync(path.join(tpl, 'styles', '原本-20261113-2', 'brand.css'), 'utf8'), /\/\* 手改 \*\//, '存的是換之前的樣子');
  assert.match(fs.readFileSync(path.join(tpl, 'styles', 'styles.js'), 'utf8'), /原本-20261113-2/);
  assert.equal(B.currentPack(tpl), '甲');
  assert.equal(B.usePack(tpl, '原本-20261113-2', { now }).saved, null, '換回來：目前是「甲」，不用再存');
  assert.equal(B.currentPack(tpl), '原本-20261113-2');
});

// ---------- B3、B5：audit ----------

function staleProject(t) {
  const p = tmpDir(t);
  touch(p, 'work/hyperframes/index.html', '<html></html>', 120);
  touch(p, 'work/hyperframes/plan.json', JSON.stringify({ version: 1, scenes: [] }));
  return p;
}

test('B5：audit --only 每跑一次碰一下那幾段的心跳（--review 不算）', async (t) => {
  const A = await imp('audit.mjs');
  const { lastBeat } = await imp('lib/tries.mjs');
  const p = staleProject(t);
  const t0 = Date.now();
  await A.audit({ project: p, only: 'x01,x02' }, { log: () => {} }).catch(() => {});   // 假專案 --check 會丟錯：心跳在那之前就記了
  for (const id of ['x01', 'x02']) assert.ok(lastBeat(p, id) >= t0, id);
  await A.audit({ project: p, only: 'x03', review: true }, { log: () => {} }).catch(() => {});
  assert.equal(lastBeat(p, 'x03'), 0, '--review 是主代理重量，不算子代理的心跳');
});

// 一支 build 得起來的小專案（10 秒底片、一段內容設計動畫）
function builtProject(t) {
  const p = tmpDir(t);
  fs.mkdirSync(path.join(p, 'work', 'hyperframes'), { recursive: true });
  assert.equal(spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '10', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(p, 'work', 'rough.mp4')]).status, 0);
  fs.writeFileSync(path.join(p, 'work', 'rough.srt'), '1\n00:00:01,000 --> 00:00:04,000\n第一句字幕內容\n\n2\n00:00:04,500 --> 00:00:08,000\n第二句字幕內容\n');
  fs.writeFileSync(path.join(p, 'work', 'hyperframes', 'plan.json'), JSON.stringify({ version: 1, look: false, check: { textSync: false }, speakerBox: [400, 80, 900, 700],
    scenes: [{ id: 'd01', type: 'custom', design: true, layout: 'fullscreen', from: '#1', to: '#2e', story: { idea: '一個構想' } }] }, null, 2));
  let r;
  for (let i = 0; i < 5; i++) { r = run('build.mjs', '--project', p); if (r.status !== 75) break; }
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return p;
}

test('B3：--only（子代理）遇到 plan.json 比 index.html 新 → 過了 --check 才 ✖、不量、叫它交回主代理；沒帶 --only（主代理）先 build', { skip: !ffmpeg && '沒有 ffmpeg', timeout: 180000 }, async (t) => {
  const A = await imp('audit.mjs');
  const p = builtProject(t);
  const planF = path.join(p, 'work', 'hyperframes', 'plan.json'), index = path.join(p, 'work', 'hyperframes', 'index.html');
  const later = new Date(Date.now() + 5000);
  fs.utimesSync(planF, later, later);
  const r = await A.audit({ project: p, only: 'd01', sheet: true }, { log: () => {} });
  assert.equal(r.ok, false);
  assert.deepEqual(r.errors, ['plan.json 比 index.html 新，這次量不準（不出拼圖）→ 子代理不能 build：把這一行原文交回主代理，主代理跑完 build 再驗收']);
  assert.equal(r.segments.length, 0, '不量');
  assert.ok(!r.sheets, '不出拼圖');
  assert.match(A.formatReport(r), /^✖ plan\.json 比 index\.html 新/);
  // 主代理：先 build（index.html 的時間跟著更新），量的是最新版；不再只是 ⚠
  const before = fs.statSync(index).mtimeMs;
  const m = await A.audit({ project: p, all: true, only: undefined, jobs: '1' }, { log: () => {} }).catch((e) => ({ thrown: e }));
  assert.ok(fs.statSync(index).mtimeMs > before, '先 build 了');
  if (!m.thrown) {
    assert.ok(m.notes.includes('plan.json 比 index.html 新：先 build 了，量的是最新版'), JSON.stringify(m.notes));
    assert.ok(!m.warnings.some((w) => /比 index\.html 新/.test(w)));
  }
});

test('B3：沒帶 --only（主代理）→ 先 build 再量；build 丟錯、沒過、要重新編碼都 ✖ 並說怎麼辦', async (t) => {
  const A = await imp('audit.mjs');
  const P = { project: '/x' };
  assert.deepEqual(A.rebuildFirst({}, P, 'projects/x', () => ({ ok: true })), { ok: true });
  assert.match(A.rebuildFirst({}, P, 'projects/x', () => { throw new Error('壞了'); }).errors[0], /^plan\.json 比 index\.html 新，先 build 失敗：壞了$/);
  assert.match(A.rebuildFirst({}, P, 'projects/x', () => ({ ok: false, needEncode: true })).errors[0], /底片要重新編碼.*node shared\/template\/tools\/build\.mjs --project projects\/x/);
  const bad = A.rebuildFirst({}, P, 'projects/x', (flags, { log }) => { log('專案：x'); log('✖ [s05] 綁句找不到 #99 → 改成 #12'); log('⚠ 提醒'); return { ok: false }; });
  assert.deepEqual(bad.errors, ['plan.json 比 index.html 新，先 build 沒過 → 照下面 build 的 → 改好 plan.json，再跑這條 audit', 'build：[s05] 綁句找不到 #99 → 改成 #12']);
  let got = null;
  A.rebuildFirst({ project: 'projects/x', template: 'tpl', only: 'x' }, P, 'projects/x', (flags, opts) => { got = { flags, delegate: opts.delegateEncode }; return { ok: true }; });
  assert.deepEqual(got, { flags: { project: 'projects/x', template: 'tpl' }, delegate: true });
  // 真的接上：這個假專案 build 不起來 → ✖ 是 build 的，不是「只提醒」
  const p = staleProject(t);
  const r = await A.audit({ project: p }, { log: () => {} });
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /^plan\.json 比 index\.html 新，先 build (失敗|沒過)/);
  assert.ok(!r.warnings.some((w) => /比 index\.html 新/.test(w)), '不再只是 ⚠');
});

// ---------- B8：空白畫布的舞台容器、垂直不平衡印目標值 ----------

test('B8：空白畫布有上下置中的舞台（占位在裡面）；isBlankDesign 認得新舊骨架；舊骨架還空白就換成新的，寫到一半的不動', async (t) => {
  const F = await imp('lib/custom-fill.mjs');
  const { loadIcons } = await imp('lib/scenes.mjs');
  const CUSTOM = path.join(TEMPLATE, 'custom');
  const seg = { id: 'd01', type: 'custom', design: true, from: '#1', to: '#2e', story: { idea: '一個構想' } };
  const fresh = F.blankFor(CUSTOM, seg), old = F.blankFor(CUSTOM, seg, { stage: false });
  assert.match(fresh, /#x-design-d01 #xdd01-stage \{ position: absolute; left: 120px; top: 120px; width: 1180px; height: 750px; display: flex; flex-direction: column; align-items: center; justify-content: center; \}/);
  assert.match(fresh, /<div id="xdd01-stage">\s*<div id="xdd01-idea" data-design-blank[^\n]*一個構想[^\n]*<\/div>\s*<\/div>/);
  assert.doesNotMatch(fresh, /#xdd01-idea \{ position: absolute/, '占位跟著舞台置中');
  assert.doesNotMatch(old, /stage/);
  assert.ok(F.isBlankDesign(fresh) && F.isBlankDesign(old));
  assert.equal(F.withStage(fresh), fresh, '已經有舞台不再加');
  assert.ok(!F.isBlankDesign(fresh.replace(/\s*<div id="xdd01-idea"[^\n]*<\/div>/, '\n<div id="xdd01-main">做好了</div>')), '占位刪掉＝做了（舞台留著）');
  const outDir = tmpDir(t);
  const lib = { customDir: CUSTOM, icons: loadIcons(TEMPLATE) };
  const file = path.join(outDir, F.designFileOf(seg));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, old.replace('一個構想', '舊的構想'));
  F.materializeFills({ plan: { scenes: [{ ...seg }] }, outDir, lib });
  assert.equal(fs.readFileSync(file, 'utf8'), fresh, '舊骨架還空白：換成有舞台的');
  const half = old.replace('</style>', '/* 寫到一半 */</style>');
  fs.writeFileSync(file, half);
  F.materializeFills({ plan: { scenes: [{ ...seg }] }, outDir, lib });
  assert.equal(fs.readFileSync(file, 'utf8'), half, '寫到一半的不能蓋');
});

test('B8：垂直不平衡的改法印目標值（移完 y 幾到幾、上下留白各幾 px）；內容設計動畫加舞台的提示', async () => {
  const R = await imp('lib/audit-rules.mjs');
  const el = (rect) => ({ i: 0, tag: 'div', desc: { id: 'c', cls: '', text: '', near: '' }, rect, inner: rect, painted: true, box: true, text: false, textRect: null, inkRect: null, fontSize: 52, scale: 1,
    whiteSpace: 'normal', media: false, full: false, bg: false, clipX: false, clipY: false, clips: [], parent: -1, anc: [], moving: false, alpha: 1, pad: [0, 0, 0, 0], bw: [0, 0, 0, 0], own: [], chars: 0 });
  const lay = (rect, seg) => R.judgeLayout({ host: { start: 10 }, els: [el(rect)] }, { item: { id: 'd01', type: 'custom', label: 'x', start: 10, end: 18, D: 8, seg }, t: 17.4, kind: 'still', layout: 'fullscreen' }).filter((f) => f.rule === 'vbalance');
  const [a] = lay([200, 120, 1200, 600], { layout: 'fullscreen' });
  assert.equal(a.fix, '整組往下移 135px（每個頂層元素的 top 都 +135）→ 移完內容在 y 255–735，上下留白各 135px');
  assert.deepEqual([a.data.move, a.data.target], [135, 135]);
  const [b] = lay([200, 400, 1200, 860], { layout: 'fullscreen', design: true });
  assert.equal(b.fix, '整組往上移 135px（每個頂層元素的 top 都 −135）→ 移完內容在 y 265–725，上下留白各 145px；畫布有 #xdd01-stage 舞台的，內容放進舞台就自動上下置中');
});
