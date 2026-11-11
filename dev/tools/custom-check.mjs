#!/usr/bin/env node
/**
 * 情境動畫模板（custom/<名稱>.html＋<名稱>.fill.json）的驗收（作者維護用，剪片時不用）：
 *
 *   node dev/tools/custom-check.mjs x-process [x-ring …]     指定幾支
 *   node dev/tools/custom-check.mjs --all                    有 .fill.json 的全部
 *   --fast    只查標記（第 1 項），不 build
 *
 * 每支查三件事：
 *   1. 標記沒有改到模板：用 sample 填回去（不換圖示、不改名），要和模板拿掉標記後一字不差
 *   2. 最多項（sample）和最少項（清單砍到 min，或 sampleMin）都產得出來，沒有殘留標記
 *   3. 兩種項數排進同一個專案：--check 0 ✖ → build → audit 0 ✖；分鏡表（renderSheet）對得上 P.at、動態都在語彙表
 * 每支印一行 ✓／✖；有 ✖ 結束碼 1。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const TEMPLATE = path.join(ROOT, 'shared', 'template');
const TOOLS = path.join(TEMPLATE, 'tools');
const CUSTOM = path.join(TEMPLATE, 'custom');
const { readFillSpec, listFillSpecs, fillTemplate, stripMarkers, renderSheet } = await import(path.join(TOOLS, 'lib', 'custom-fill.mjs'));
const { loadIcons } = await import(path.join(TOOLS, 'lib', 'scenes.mjs'));
const { textWidth } = await import(path.join(TOOLS, 'lib', 'time.mjs'));

const args = process.argv.slice(2);
process.env.AUTO_EDIT_MATTE ||= 'box';   // 人物去背的模板（fill.json 寫 "matte": true）：驗收用假去背（方框當成人），不下載、不跑模型
const fast = args.includes('--fast'), verbose = args.includes('--verbose');
const names = args.includes('--all') ? listFillSpecs(CUSTOM).map((s) => s.template) : args.filter((a) => !a.startsWith('--'));
if (!names.length) { console.log('用法：node dev/tools/custom-check.mjs <模板名> … 或 --all [--fast] [--verbose]'); process.exit(2); }
const icons = loadIcons(TEMPLATE), kitDir = path.join(TEMPLATE, 'kit');
const stamp = (t) => { const ms = Math.round(t * 1000); const q = (n, w = 2) => String(n).padStart(w, '0'); return `${q(Math.floor(ms / 3600000))}:${q(Math.floor(ms / 60000) % 60)}:${q(Math.floor(ms / 1000) % 60)},${q(ms % 1000, 3)}`; };
const firstList = (spec) => Object.entries(spec.slots || {}).find(([, d]) => d.type === 'list')?.[0] || null;

function firstDiff(a, b) {
  const x = a.split('\n'), y = b.split('\n');
  for (let i = 0; i < Math.max(x.length, y.length); i++) if (x[i] !== y[i]) return `第 ${i + 1} 行\n    模板：${String(y[i]).trim().slice(0, 170)}\n    填回：${String(x[i]).trim().slice(0, 170)}`;
  return null;
}

// 最少項的 slots：有 sampleMin 用它；否則每個清單砍到 min
function minSlots(spec) {
  if (spec.sampleMin) return spec.sampleMin;
  const out = JSON.parse(JSON.stringify(spec.sample));
  for (const [k, d] of Object.entries(spec.slots || {})) if (d.type === 'list' && d.min != null && Array.isArray(out[k])) out[k] = out[k].slice(0, d.min);
  return out;
}

const atsOf = (spec, slots) => {
  const out = [];
  if (spec.generator === 'scene') { for (const b of slots.beats || []) out.push(b.at); return out; }
  for (const [k, d] of Object.entries(spec.slots || {})) {
    if (d.type === 'at' && slots[k]) out.push(slots[k]);
    if (d.type === 'list') for (const it of slots[k] || []) for (const [f, fd] of Object.entries(d.item || {})) if (fd.type === 'at' && it[f]) out.push(it[f]);
  }
  return out;
};

// slots 裡的句號整批位移（第二種項數排在同一份字幕的後面）
const shiftSlots = (x, off) => JSON.parse(JSON.stringify(x), (k, v) => (typeof v === 'string' && /^#\d+/.test(v) ? v.replace(/^#(\d+)/, (_, n) => `#${Number(n) + off}`) : v));

// 字幕：照模板的 data-cues-sample 排；@詞放在句中，讓字數比例估出來的時刻 ≥ sample 的 refs
function cueText(n, word, a, b, ref) {
  const tail = `這一句是第 ${n} 句的字幕內容，用來對時間`;
  if (!word) return `第 ${n} 句字幕內容`;
  for (let j = 0; j < 40; j++) {
    const pre = '嗯'.repeat(j >> 1) + (j & 1 ? ' ' : ''), text = pre + word + tail;
    if (a + textWidth(pre) / textWidth(text) * (b - a) >= ref - 1e-3) return text;
  }
  return word + tail;
}

let cacheVideo = null;
function baseVideo() {
  if (cacheVideo) return cacheVideo;
  cacheVideo = path.join(os.tmpdir(), 'custom-check-base.mp4');
  if (!fs.existsSync(cacheVideo)) {
    const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=330:sample_rate=48000', '-t', '240', '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '30', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', cacheVideo], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(r.stderr);
  }
  return cacheVideo;
}

function runProject(name, spec, html) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'custom-check-'));
  const proj = path.join(dir, 'p1'), out = path.join(proj, 'work', 'hyperframes');
  fs.mkdirSync(out, { recursive: true });
  const sample = JSON.parse(html.match(/data-cues-sample='([^']+)'/)?.[1] || '{}');
  const nums = Object.keys(sample.cues || {}).map(Number).sort((a, b) => a - b);
  if (!nums.length) return [`模板沒有 data-cues-sample`];
  const wordOf = {};
  for (const ref of Object.keys(sample.refs || {})) { const m = ref.match(/^#(\d+)@(.+)$/); if (m) wordOf[m[1]] = m[2]; }
  const srt = [], scenes = [], sheets = [];
  const OFF = 1000;
  let S = 1;
  [[spec.sample, 0, 'x1'], [minSlots(spec), OFF, 'x2']].forEach(([slots, off, id]) => {
    const open = nums[0] - 1 + off;
    srt.push({ n: open, a: S, b: S + sample.cues[nums[0]][0] - 0.3, text: `第 ${open} 句開場` });
    nums.forEach((n, i) => {
      const a = sample.cues[n][0], b = i === nums.length - 1 ? sample.D : sample.cues[n][1];
      srt.push({ n: n + off, a: S + a, b: S + b, text: cueText(n + off, wordOf[n], a, b, sample.refs?.[`#${n}@${wordOf[n]}`]) });
    });
    const shifted = off ? shiftSlots(slots, off) : slots;
    scenes.push({ id, type: 'custom', template: name, slots: shifted, from: `#${open}`, to: `#${nums[nums.length - 1] + off}e` });
    const sheet = renderSheet(spec, shifted, id);
    if (sheet) sheets.push(sheet);
    S += sample.D + 3;
  });
  fs.writeFileSync(path.join(proj, 'work', 'rough.srt'), srt.sort((a, b) => a.n - b.n).map((x) => `${x.n}\n${stamp(x.a)} --> ${stamp(x.b)}\n${x.text}\n`).join('\n'));
  fs.writeFileSync(path.join(proj, 'work', 'storyboard.md'), sheets.join('\n'));
  fs.writeFileSync(path.join(proj, 'work', 'cutpoints.json'), JSON.stringify({ cuts: [] }));
  fs.writeFileSync(path.join(out, 'plan.json'), JSON.stringify({ version: 1, speakerBox: [700, 200, 1220, 1000], look: { slim: 0 }, scenes }, null, 2));
  const cut = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', baseVideo(), '-t', String(Math.ceil(S + 2)), '-c', 'copy', path.join(proj, 'work', 'rough.mp4')], { encoding: 'utf8' });
  if (cut.status !== 0) return [`ffmpeg：${cut.stderr}`];
  const tool = (f, ...a) => spawnSync(process.execPath, [path.join(TOOLS, f), ...a], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
  const bad = [];
  const chk = tool('build.mjs', '--project', proj, '--check');
  if (chk.status !== 0) bad.push(...chk.stdout.split('\n').filter((l) => l.startsWith('✖')).map((l) => `--check ${l}`));
  if (!bad.length) {
    const b = tool('build.mjs', '--project', proj);
    if (b.status !== 0) bad.push(`build：${(b.stdout + b.stderr).split('\n').filter((l) => /✖|Error/.test(l)).slice(0, 3).join(' ')}`);
  }
  let warns = [];
  if (!bad.length) {
    const au = tool('audit.mjs', '--project', proj, '--only', 'x1,x2');
    const lines = (au.stdout + au.stderr).split('\n');
    bad.push(...lines.filter((l) => /^\s*✖/.test(l) && !/^\s*✖ 0/.test(l)).map((l) => `audit ${l.trim()}`));
    warns = lines.filter((l) => /^\s*⚠/.test(l)).map((l) => l.trim());
    if (au.status !== 0 && !bad.length) bad.push(`audit 結束碼 ${au.status}：${lines.filter((l) => l.trim()).slice(-3).join(' ')}`);
  }
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* 暫存 */ }
  return { bad, warns };
}

let failed = 0;
for (const name of names) {
  const spec = readFillSpec(CUSTOM, name);
  const problems = [];
  let warns = [];
  if (!spec) { console.log(`✖ ${name}：沒有 custom/${name}.fill.json`); failed++; continue; }
  const html = fs.readFileSync(path.join(CUSTOM, `${name}.html`), 'utf8');
  if (!spec.sample) problems.push('fill.json 沒有 sample');
  else if (spec.generator !== 'scene') {
    const r = fillTemplate({ spec, html, id: 'T', slots: spec.sample, icons, rename: false, keepIcons: true, kitDir });
    if (r.errors.length) problems.push(...r.errors.map((e) => `sample：${e}`));
    else { const d = firstDiff(r.html, stripMarkers(html)); if (d) problems.push(`sample 填回去和模板不一樣：${d}`); }
  }
  if (spec.sample) {
    for (const [label, slots] of [['最多項', spec.sample], ['最少項', minSlots(spec)]]) {
      const r = fillTemplate({ spec, html, id: 'x1', slots, icons, kitDir });
      if (r.errors.length) problems.push(...r.errors.map((e) => `${label}：${e}`));
      if (!renderSheet(spec, slots, 'x1')) problems.push(`${label}：沒有 sheet（動畫分鏡）`);
      if (!atsOf(spec, slots).length) problems.push(`${label}：沒有任何綁句（at）`);
    }
  }
  if (!problems.length && !fast) {
    const res = runProject(name, spec, html);
    if (Array.isArray(res)) problems.push(...res);
    else { problems.push(...res.bad); warns = res.warns; }
  }
  if (problems.length) { failed++; console.log(`✖ ${name}\n  ${problems.join('\n  ')}`); }
  else console.log(`✓ ${name}${warns.length ? `（⚠ ${warns.length}）` : ''}`);
  if (verbose || (warns.length && !problems.length)) for (const w of warns.slice(0, verbose ? 99 : 6)) console.log(`  ${w.slice(0, 220)}`);
}
console.log(`\n${names.length - failed}／${names.length} 支通過`);
process.exit(failed ? 1 : 0);
