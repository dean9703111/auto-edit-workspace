#!/usr/bin/env node
/**
 * 檢查迴圈的一鍵檢查（作者維護用，剪片時不用）：
 *
 *   node dev/check-all.mjs                        單元測試 → 合成一個測試專案 → --check → build → audit → snapshot；
 *                                                 再對直式（projects/example-portrait 有 work/rough.mp4 與 plan.json 就用它，沒有就合成一個直式測試專案）跑一次 --check → build → audit → snapshot
 *   node dev/check-all.mjs --no-portrait          不跑直式那一輪
 *   node dev/check-all.mjs --render               再加：--test 片段 render（draft）並確認有影音軌（多 1–2 分鐘）
 *   node dev/check-all.mjs --real projects/example   不合成測試專案，改對真實專案跑 --check → build → audit → snapshot（有 output/final.mp4 就再跑 qc final）
 *   node dev/check-all.mjs --skip-tests           跳過 node --test（只看管線）
 *   node dev/check-all.mjs --keep                 保留合成的測試專案（印出路徑）
 *   node dev/check-all.mjs --out <檔>             報告寫到哪（預設 dev/loop/last-check.md）
 *
 * 每一步印 ✓／✖／略過；有 ✖ 結束碼 1。沒有 Chrome（npx hyperframes browser ensure 還沒跑）時 audit／snapshot／render 略過，不算失敗。
 * 零依賴：Node 22、ffmpeg／ffprobe、HyperFrames 的 chrome-headless-shell（選用）。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const TOOLS = path.join(ROOT, 'shared', 'template', 'tools');
const { hfArgs } = await import(path.join(TOOLS, 'lib', 'hf.mjs'));   // 合成專案在工作區外面：npx 會跑到快取裡的別版，直接跑工作區釘的那一版
const WIN = process.platform === 'win32';
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const val = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const outFile = path.resolve(ROOT, val('--out') || path.join('dev', 'loop', 'last-check.md'));

// 暫存目錄：測試、合成專案、hyperframes render 的暫存（hf-*）都走 os.tmpdir()；有外接硬碟就導過去，免得塞爆系統碟。
// 優先序：環境變數 AUTO_EDIT_TMP → /Volumes/auto-edit-tmp（作者外接硬碟上的 APFS 映像卷，存在才用）→ 系統預設。子處理程序（node --test、hyperframes、look）都繼承 TMPDIR。
// 外接硬碟是 ExFAT，直接當暫存會被 macOS 寫進 ._* 隱藏檔、弄壞列目錄的測試；所以暫存放在硬碟上的 APFS 稀疏映像（auto-edit-tmp.sparseimage），沒掛載就先掛。
const extTmp = process.env.AUTO_EDIT_TMP || '/Volumes/auto-edit-tmp';
const extImg = '/Volumes/video/auto-edit-tmp.sparseimage';
if (!WIN && !process.env.AUTO_EDIT_TMP && !fs.existsSync(extTmp) && fs.existsSync(extImg)) {
  const r = spawnSync('hdiutil', ['attach', '-nobrowse', '-quiet', extImg], { stdio: 'ignore' });
  if (r.status === 0) console.log(`已掛載 ${extImg}`); // 掛不上就用系統預設
}
if (!WIN && fs.existsSync(extTmp)) { try { fs.accessSync(extTmp, fs.constants.W_OK); process.env.TMPDIR = extTmp; console.log(`暫存 → ${extTmp}`); } catch { /* 不可寫就用系統預設 */ } }

const results = [];
const t0 = Date.now();
const step = (name, fn) => {
  const s = Date.now();
  let r;
  try { r = fn(); } catch (e) { r = { ok: false, detail: `丟出例外：${e.message}` }; }
  r.sec = ((Date.now() - s) / 1000).toFixed(1);
  r.name = name;
  results.push(r);
  console.log(`${r.skip ? '略過' : r.ok ? '✓' : '✖'} ${name}（${r.sec}s）${r.detail ? `\n    ${r.detail.split('\n').join('\n    ')}` : ''}`);
  return r;
};
const run = (cmd, a, opts = {}) => spawnSync(cmd, a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: WIN && cmd === 'npx', ...opts });
const node = (script, a, opts = {}) => run(process.execPath, [script, ...a], { cwd: ROOT, ...opts });
const count = (text, mark) => (text.match(new RegExp(`^\\s*${mark}`, 'gm')) || []).length;
const lines = (text, mark, n = 6) => text.split('\n').filter((l) => l.trim().startsWith(mark)).slice(0, n).join('\n');

// ---------- Chrome 有沒有 ----------
let chrome = null;
try { const { findChrome } = await import(path.join(TOOLS, 'lib', 'audit-browser.mjs')); chrome = findChrome({}); } catch { chrome = null; }
const noChrome = { ok: true, skip: true, detail: '沒有 chrome-headless-shell → 先跑 npx hyperframes browser ensure' };

// ---------- 1. 單元測試 ----------
if (!flag('--skip-tests')) {
  step('node --test dev/tests/*.test.mjs', () => {
    const files = fs.readdirSync(path.join(ROOT, 'dev', 'tests')).filter((f) => f.endsWith('.test.mjs')).map((f) => path.join('dev', 'tests', f));
    const r = node('--test', ['--test-reporter=tap', ...files], {});
    const out = r.stdout + r.stderr;
    const pass = /^# pass (\d+)/m.exec(out)?.[1] ?? '?', fail = /^# fail (\d+)/m.exec(out)?.[1] ?? '?';
    const failing = out.split('\n').filter((l) => /^not ok/.test(l)).slice(0, 8).join('\n');
    return { ok: r.status === 0, detail: `pass ${pass}、fail ${fail}${failing ? '\n' + failing : ''}` };
  });
}

// ---------- 2. 專案（合成或真實） ----------
let project, keep = flag('--keep');
const real = val('--real');
if (real) {
  project = path.resolve(ROOT, real);
  if (!fs.existsSync(path.join(project, 'work', 'rough.mp4'))) { console.log(`✖ ${real} 沒有 work/rough.mp4（先跑「剪乾淨」）`); process.exit(1); }
  keep = true;
} else {
  project = step('合成測試專案（70 秒影片、20 句字幕、8 段 plan）', () => makeFixture()).project;
}
const P = ['--project', project];
const relOf = (p) => (path.relative(ROOT, p).startsWith('..') ? p : path.relative(ROOT, p));
const relP = relOf(project);
const built = pipeline(project, '');

// ---------- 3.–6. --check → look → build → audit → snapshot（橫式一輪、直式一輪） ----------
function pipeline(project, tag) {
const P = ['--project', project];
const relP = relOf(project);
const check = step(`${tag}build.mjs --check（${relP}）`, () => {
  const r = node(path.join(TOOLS, 'build.mjs'), [...P, '--check']);
  const out = r.stdout + r.stderr;
  const x = count(out, '✖'), w = count(out, '⚠');
  return { ok: r.status === 0 && x === 0, detail: `${/通過：[^\n]*/.exec(out)?.[0] || ''}；✖ ${x}、⚠ ${w}${x ? '\n' + lines(out, '✖') : ''}${w ? '\n' + lines(out, '⚠', 4) : ''}` };
});

// ---------- 3.5 look（講者調光＋瘦臉：rough-look.mp4 沒跑過 build 會 ✖） ----------
step(`${tag}look.mjs run（臉部偵測 → rough-look.mp4；合成影片沒有臉 → 只調光）`, () => {
  if (!check.ok) return { ok: false, detail: '--check 沒過，不跑' };
  if (!chrome) return noChrome;
  const r = node(path.join(TOOLS, 'look.mjs'), ['run', ...P]);
  const out = r.stdout + r.stderr;
  const key = out.split('\n').filter((l) => /偵測|臉寬|瘦臉|只調光|rough-look|⚠|✖/.test(l)).slice(0, 5).join('\n');
  return { ok: r.status === 0, detail: key || out.split('\n').slice(-3).join('\n') };
});

// ---------- 4. build ----------
const built = step(`${tag}build.mjs（產生 work/hyperframes）`, () => {
  if (!check.ok) return { ok: false, detail: '--check 沒過，不 build' };
  const r = node(path.join(TOOLS, 'build.mjs'), P);
  const out = r.stdout + r.stderr;
  const key = out.split('\n').filter((l) => /人聲響度|剪接點微淡化|音效比例|沒有畫面/.test(l)).join('\n');
  return { ok: r.status === 0 && fs.existsSync(path.join(project, 'work', 'hyperframes', 'index.html')), detail: key || out.split('\n').slice(-3).join('\n') };
});

// ---------- 5. audit ----------
step(`${tag}audit.mjs --all --json（0 ✖）`, () => {
  if (!built.ok) return { ok: false, detail: 'build 沒過' };
  if (!chrome) return noChrome;
  const r = node(path.join(TOOLS, 'audit.mjs'), [...P, '--all', '--json']);
  let j = null; try { j = JSON.parse(r.stdout); } catch { return { ok: false, detail: `audit 沒印 JSON：${(r.stderr || r.stdout).slice(-400)}` }; }
  const errs = (j.findings || j.items || []).flatMap((it) => (it.findings || it.errors || []).filter((f) => f.level === 'error' || f.kind === 'error')).length;
  const fromTop = Array.isArray(j.errors) ? j.errors.length : 0;
  const text = JSON.stringify(j);
  const xs = (text.match(/"level":"error"/g) || []).length + fromTop;
  const ws = (text.match(/"level":"warn"/g) || []).length;
  return { ok: r.status === 0 && xs === 0, detail: `✖ ${xs || errs}、⚠ ${ws}${r.status !== 0 ? `（結束碼 ${r.status}）` : ''}` };
});

// ---------- 6. snapshot ----------
step(`${tag}hyperframes snapshot --at（工作區釘的版本；開頭、中段、結尾各一格）`, () => {
  if (!built.ok) return { ok: false, detail: 'build 沒過' };
  if (!chrome) return noChrome;
  const hf = path.join(project, 'work', 'hyperframes');
  const meta = JSON.parse(fs.readFileSync(path.join(hf, 'meta.json'), 'utf8'));
  const dur = Number(meta.outputDur ?? meta.duration ?? meta.durationSec ?? 60);
  const at = [1.5, +(dur / 2).toFixed(1), +(dur - 1.5).toFixed(1)].join(',');
  const outDir = path.join(project, 'work', 'check-snap');
  const r = run(process.execPath, hfArgs(['snapshot', '--at', at, '--no-end', '-o', outDir]), { cwd: hf });
  const pngs = fs.existsSync(outDir) ? fs.readdirSync(outDir).filter((f) => f.endsWith('.png')) : [];
  const small = pngs.filter((f) => fs.statSync(path.join(outDir, f)).size < 20 * 1024);
  return { ok: r.status === 0 && pngs.length >= 3 && small.length === 0, detail: `${pngs.length} 張（${at}s）${small.length ? '，太小（可能空白）：' + small.join('、') : ''}${r.status ? '\n' + (r.stderr || r.stdout).slice(-300) : ''}` };
});
return built;
}

// ---------- 6.5 直式（009 T007-V01）：projects/example-portrait 有剪好的 work 就用它，沒有就合成直式測試專案 ----------
let portraitProject = null;
if (!flag('--no-portrait') && !real) {
  const ex = path.join(ROOT, 'projects', 'example-portrait');
  if (fs.existsSync(path.join(ex, 'work', 'rough.mp4')) && fs.existsSync(path.join(ex, 'work', 'hyperframes', 'plan.json'))) portraitProject = ex;
  else portraitProject = step('合成直式測試專案（360×640 直拍影片、20 句字幕、7 段 plan，含 16:9 錄影）', () => makeFixture({ portrait: true })).project;
  pipeline(portraitProject, '直式｜');
}

// ---------- 7. render（選用） ----------
if (flag('--render')) {
  step('build --test 3 秒片段 → render draft → ffprobe 有影音軌', () => {
    if (!built.ok) return { ok: false, detail: 'build 沒過' };
    if (!chrome) return noChrome;
    const hf = path.join(project, 'work', 'hyperframes');
    const t = node(path.join(TOOLS, 'build.mjs'), [...P, '--test', '8,3']);
    if (t.status !== 0) return { ok: false, detail: (t.stdout + t.stderr).slice(-300) };
    const clip = path.join(project, 'output', 'test-clips', 'check-clip.mp4');
    fs.mkdirSync(path.dirname(clip), { recursive: true });
    const r = run(process.execPath, hfArgs(['render', '-c', 'compositions/test-clip.html', '--quality', 'draft', '-o', clip]), { cwd: hf });
    if (!fs.existsSync(clip)) return { ok: false, detail: `render 沒有輸出：${(r.stderr || r.stdout).slice(-300)}` };
    const p = run('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', clip]);
    return { ok: /video/.test(p.stdout) && /audio/.test(p.stdout), detail: `streams: ${p.stdout.trim().split('\n').join('、')}` };
  });
}

// ---------- 8. qc final（真實專案有完成影片時） ----------
if (real && fs.existsSync(path.join(project, 'output', 'final.mp4'))) {
  step('qc.mjs final（0 ✖）', () => {
    const r = node(path.join(TOOLS, 'qc.mjs'), ['final', ...P]);
    const out = r.stdout + r.stderr;
    return { ok: r.status === 0, detail: `✖ ${count(out, '✖')}、⚠ ${count(out, '⚠')}\n${lines(out, '⚠', 5)}${lines(out, '✖', 5)}` };
  });
}

// ---------- 報告 ----------
const bad = results.filter((r) => !r.ok && !r.skip);
const md = [`# check-all ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`, '', `專案：${relP}${keep ? '' : '（合成，已清掉）'}；總耗時 ${((Date.now() - t0) / 1000).toFixed(0)}s；結果：${bad.length ? `✖ ${bad.length} 步沒過` : '全部通過'}`, '', '| 步驟 | 結果 | 秒 | 細節 |', '|---|---|---|---|',
  ...results.map((r) => `| ${r.name} | ${r.skip ? '略過' : r.ok ? '✓' : '✖'} | ${r.sec} | ${(r.detail || '').replace(/\|/g, '｜').replace(/\n/g, '<br>')} |`), ''].join('\n');
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, md);
console.log(`\n${bad.length ? `✖ ${bad.length} 步沒過` : '✓ 全部通過'}；報告 → ${path.relative(ROOT, outFile)}${keep ? `；專案留在 ${project}` : ''}`);
if (!keep && !real) {
  fs.rmSync(path.dirname(project), { recursive: true, force: true });
  if (portraitProject && portraitProject.startsWith(os.tmpdir())) fs.rmSync(path.dirname(portraitProject), { recursive: true, force: true });
}
process.exit(bad.length ? 1 : 0);

// ---------- 合成測試專案 ----------
function makeFixture({ portrait = false } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), portrait ? 'auto-edit-check-v-' : 'auto-edit-check-'));
  const project = path.join(base, '專案');
  const work = path.join(project, 'work'), hf = path.join(work, 'hyperframes');
  for (const d of ['assets/camera', 'assets/voice', 'assets/screen', 'assets/images', 'work/hyperframes/compositions', 'output']) fs.mkdirSync(path.join(project, d), { recursive: true });
  // 20 句、每句 3 秒、句間 0.5 秒；第 5 句前留 3 秒給章節轉場
  const stamp = (t) => { const ms = Math.round(t * 1000); const p = (n, w = 2) => String(n).padStart(w, '0'); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; };
  const srt = []; let t = 1.0; const starts = [];
  // #12–#15 句首放 x-process 範例綁的站名（錄影／逐字稿／剪輯清單／初剪），讓 P.at('#12@錄影') 這類詞級綁句找得到詞
  const station = { 12: '錄影', 13: '逐字稿', 14: '剪輯清單', 15: '初剪' };
  for (let i = 1; i <= 20; i++) { if (i === 5) t += 2.5; starts.push(t); srt.push(`${i}\n${stamp(t)} --> ${stamp(t + 3)}\n${station[i] ? `${station[i]}是第 ${i} 句的重點` : `第 ${i} 句字幕內容，講到重點與操作`}\n`); t += 3.5; }
  fs.writeFileSync(path.join(work, 'rough.srt'), srt.join('\n'));
  const dur = Math.ceil(t + 1);
  let r = run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `testsrc=size=${portrait ? '360x640' : '640x360'}:rate=25`, '-f', 'lavfi', '-i', 'sine=frequency=330:sample_rate=48000', '-t', String(dur), '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(work, 'rough.mp4')]);
  if (r.status !== 0) throw new Error(`ffmpeg 合成講解失敗：${r.stderr}`);
  r = run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30', '-t', '20', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-an', path.join(project, 'assets', 'screen', '示範.mp4')]);
  if (r.status !== 0) throw new Error(`ffmpeg 合成錄影失敗：${r.stderr}`);
  fs.writeFileSync(path.join(work, 'cutpoints.json'), JSON.stringify({ cuts: [{ at: +(starts[3] + 3.2).toFixed(2), kind: 'pause' }, { at: +(starts[10] + 3.2).toFixed(2), kind: 'ng' }] }, null, 2));
  fs.copyFileSync(path.join(ROOT, 'shared', 'template', 'custom', 'x-process.html'), path.join(hf, 'compositions', 'x-process.html'));
  const plan = {
    version: 1, speakerBox: [700, 200, 1220, 1000],
    scenes: [
      { id: 's01', scene: 'concept', from: '#2', to: '#3e', slots: { text: '**場地設定**：一份文件' } },
      { id: 's02', scene: 'chapter', at: '#5', slots: { num: '01', title: '開場設定' } },
      { id: 's03', scene: 'side-panel', from: '#6', to: '#8e', slots: { title: '拍完之後', items: [{ text: '初剪', at: '#6' }, { text: '轉字幕', at: '#7' }, { text: '校對', at: '#8' }] } },
      { id: 's04', scene: 'fs-list', from: '#9', to: '#10e', slots: { title: '清單', items: ['一', '二', '三'] } },
      { id: 'x01', type: 'custom', src: 'compositions/x-process.html', layout: 'fullscreen', from: '#11', to: '#15e' },   // x-process 綁 #12–#15，T1 要 ≥ 3.0 s
      { id: 's05', type: 'fx', fx: 29, from: '#16', to: '#16e', vars: { number: '18', label: '字' } },
      { id: 'm01', type: 'media', src: 'assets/screen/示範.mp4', from: '#17', to: '#18e', in: 2, marks: [{ at: '#17+0.5', until: '#18e', box: [100, 100, 400, 200] }] },
      { id: 's06', scene: 'quote', from: '#19', to: '#20e', slots: { text: '先做對，再做快' } },
    ],
  };
  // 直式：format portrait、講者框是 1080×1920 座標；沒有 03 側邊欄（直式不提供）；16:9 錄影放進上半（lib/media.mjs 的直式可見區）
  if (portrait) {
    plan.format = 'portrait';
    plan.speakerBox = [300, 500, 780, 1100];
    plan.scenes = plan.scenes.filter((x) => x.scene !== 'side-panel');
    plan.scenes.find((x) => x.id === 's04').from = '#6';
  }
  fs.writeFileSync(path.join(hf, 'plan.json'), JSON.stringify(plan, null, 2));
  return { ok: true, project, detail: project };
}
