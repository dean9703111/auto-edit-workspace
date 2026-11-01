// 音效庫：kit/sfx.json 欄位、shared/sfx/ 的 wav 格式／峰值／起音／響度、sources.json、README／NOTICE、授權護欄、make-sfx.mjs
// 規格：specs/005-sfx/spec.md FR-001～006、FR-013、FR-022、FR-025、FR-034～039；plan.md D3
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { WORKSPACE, TEMPLATE, imp } from './helpers.mjs';

const SFX = path.join(WORKSPACE, 'shared', 'sfx');
const MAKE = path.join(WORKSPACE, 'dev', 'tools', 'make-sfx.mjs');
const kit = JSON.parse(fs.readFileSync(path.join(TEMPLATE, 'kit', 'sfx.json'), 'utf8'));
const sources = JSON.parse(fs.readFileSync(path.join(SFX, 'sources.json'), 'utf8'));
const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sfx-test-'));
const sha = (p) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const make = (...args) => spawnSync(process.execPath, [MAKE, ...args], { encoding: 'utf8' });

// contracts/sfx.md §2（寫死：改名單要先改契約）
// 2026-11-02 作者：pop tick swipe whoosh flip type glitch riser bgm-outro 整顆拿掉；片尾配樂改成 bgm-cylinder-five（CC BY 4.0，預設不配）
const NAMES = ['ding', 'success', 'alert', 'click', 'impact', 'chapter', 'sparkle', 'shine', 'thunder', 'bgm-cylinder-five'];
const FIELDS = ['kind', 'zh', 'use', 'event', 'peak', 'volume', 'targetDb', 'additive', 'maxPerVideo'];
const BGM_FIELDS = ['fadeIn', 'fadeOut', 'credit'];
const LICENSE_GUARD = /剪映|CapCut|综艺|鼠标|仙尘|打卡成功|正确/;

// WAV：RIFF 標頭＋data 區塊（int16）
function readWav(p) {
  const b = fs.readFileSync(p);
  assert.equal(b.toString('ascii', 0, 4), 'RIFF', `${p} 不是 RIFF`);
  assert.equal(b.toString('ascii', 8, 12), 'WAVE');
  let o = 12, fmt = null, data = null;
  while (o + 8 <= b.length) {
    const id = b.toString('ascii', o, o + 4), size = b.readUInt32LE(o + 4);
    if (id === 'fmt ') fmt = { format: b.readUInt16LE(o + 8), channels: b.readUInt16LE(o + 10), rate: b.readUInt32LE(o + 12), bits: b.readUInt16LE(o + 22) };
    if (id === 'data') data = b.subarray(o + 8, o + 8 + size);
    o += 8 + size + (size & 1);
  }
  assert.ok(fmt && data, `${p} 缺 fmt 或 data 區塊`);
  const frames = data.length / (fmt.channels * 2);
  let pk = 0, pkI = 0, on = -1;
  for (let i = 0; i < frames; i++) for (let c = 0; c < fmt.channels; c++) {
    const v = Math.abs(data.readInt16LE((i * fmt.channels + c) * 2));
    if (v > pk) { pk = v; pkI = i; }
    if (on < 0 && v > 32767 * 0.01) on = i;   // −40 dBFS
  }
  return { ...fmt, frames, dur: frames / fmt.rate, peakSec: pkI / fmt.rate, onsetMs: (on / fmt.rate) * 1000 };
}

const M = await import(MAKE);   // 匯入不執行 CLI
const limitOf = (n) => (M.RECIPES[n] ? M.RECIPES[n].limit : 2.0);

test('名稱清單：9 個音效＋1 首片尾配樂，跟 contracts/sfx.md §2 一樣', () => {
  assert.deepEqual(Object.keys(kit).sort(), [...NAMES].sort());
});

test('kit 欄位齊全、型別正確、沒有不認得的欄位（FR-001、FR-025、FR-026）', () => {
  for (const [n, v] of Object.entries(kit)) {
    const allowed = v.kind === 'bgm' ? [...FIELDS, ...BGM_FIELDS] : FIELDS;
    for (const f of allowed) assert.ok(f in v, `${n} 缺 ${f}`);
    for (const f of Object.keys(v)) assert.ok(allowed.includes(f), `${n} 有不認得的欄位 ${f}`);
    assert.ok(['sfx', 'bgm'].includes(v.kind), `${n}.kind`);
    for (const f of ['zh', 'use', 'event']) assert.ok(typeof v[f] === 'string' && v[f].length > 0, `${n}.${f}`);
    assert.ok(Number.isFinite(v.peak) && v.peak >= 0, `${n}.peak`);
    assert.ok(v.volume > 0 && v.volume <= 1, `${n}.volume ${v.volume}`);
    assert.ok(v.targetDb <= -3, `${n}.targetDb ${v.targetDb} 要 ≤ −3`);
    assert.equal(typeof v.additive, 'boolean', `${n}.additive`);
    assert.ok(v.maxPerVideo === null || (Number.isInteger(v.maxPerVideo) && v.maxPerVideo >= 1), `${n}.maxPerVideo`);
    if (v.kind === 'bgm') { assert.equal(v.peak, 0); for (const f of ['fadeIn', 'fadeOut']) assert.ok(v[f] > 0 && v[f] <= 10, `${n}.${f}`); assert.match(v.credit, /^Music: ".+" by .+ licensed under CC BY 4\.0/, `${n}.credit`); }
  }
  assert.deepEqual(Object.keys(kit).filter((n) => kit[n].additive).sort(), ['click']);
  assert.deepEqual(Object.fromEntries(Object.entries(kit).filter(([, v]) => v.maxPerVideo !== null).map(([n, v]) => [n, v.maxPerVideo])), { sparkle: 6, shine: 3, thunder: 3 });
  assert.deepEqual(Object.keys(kit).filter((n) => kit[n].kind === 'bgm'), ['bgm-cylinder-five']);
  assert.equal(kit['bgm-cylinder-five'].fadeIn, 3.2);
  assert.equal(kit['bgm-cylinder-five'].fadeOut, 1.85);
});

test('wav 格式：PCM 16-bit、48 kHz、立體聲；長度在上限內（FR-004）', () => {
  for (const n of NAMES) {
    const w = readWav(path.join(SFX, `${n}.wav`));
    assert.deepEqual([w.format, w.bits, w.rate, w.channels], [1, 16, 48000, 2], `${n}.wav 格式`);
    if (kit[n].kind === 'bgm') assert.ok(w.dur >= 10 && w.dur <= 20, `${n} 長 ${w.dur} s，要 10–20 s`);
    else assert.ok(w.dur <= limitOf(n) + 0.001, `${n} 長 ${w.dur} s，上限 ${limitOf(n)} s`);
  }
});

test('峰值：kit peak 跟最大樣本的時間差 ≤ 10 ms；起音 ≤ 2.5 ms（FR-005、FR-006）', () => {
  for (const n of NAMES) {
    if (kit[n].kind === 'bgm') continue;
    const w = readWav(path.join(SFX, `${n}.wav`));
    assert.ok(Math.abs(w.peakSec - kit[n].peak) <= 0.010, `${n}：實測峰值 ${w.peakSec.toFixed(3)} s，kit 寫 ${kit[n].peak}`);
    assert.ok(w.onsetMs <= 2.5, `${n}：第一個超過 −40 dBFS 的樣本在 ${w.onsetMs.toFixed(2)} ms`);
  }
});

test('響度：M max（bgm 整合響度）跟 sources.json、targetDb 一致；true peak ≤ −1 dBTP（FR-004、FR-020）', { skip: !hasFfmpeg && '沒有 ffmpeg' }, () => {
  const by = Object.fromEntries(sources.map((s) => [s.file, s]));
  for (const n of NAMES) {
    const m = M.measure(M.decodeFile(path.join(SFX, `${n}.wav`)));
    const bgm = kit[n].kind === 'bgm', cur = bgm ? m.I : m.mmax, rec = bgm ? by[`${n}.wav`].integrated_lufs : by[`${n}.wav`].max_m_lufs;
    assert.ok(Math.abs(cur - rec) <= 0.5, `${n}：實測 ${cur}，sources.json 寫 ${rec}`);
    assert.ok(m.tp <= -1.0, `${n}：true peak ${m.tp} dBTP`);
    const rel = cur + 20 * Math.log10(kit[n].volume) + 14;
    assert.ok(Math.abs(rel - kit[n].targetDb) <= 0.5, `${n}：檔案 ${cur}＋volume ${kit[n].volume} → 相對人聲 ${rel.toFixed(2)} dB，targetDb ${kit[n].targetDb}`);
    if (!bgm) assert.ok(m.mmax >= -30 && m.mmax <= -10, `${n}：M max ${m.mmax} 要在 −30～−10 LUFS`);
  }
});

test('sources.json：每個名稱一筆、sha256 跟檔案一致、授權 CC0（片尾配樂 CC BY 4.0＋出處）、來源欄位齊全（FR-003、FR-035）', () => {
  assert.deepEqual(sources.map((s) => s.file).sort(), NAMES.map((n) => `${n}.wav`).sort());
  const hex = (v) => [].concat(v).every((x) => /^[0-9a-f]{64}$/.test(x));
  for (const s of sources) {
    const n = s.file.replace(/\.wav$/, '');
    assert.equal(s.sha256, sha(path.join(SFX, s.file)), `${s.file} sha256`);
    assert.equal(s.kind, kit[n].kind, `${s.file} kind`);
    if (s.route === 'L') {   // 片尾配樂：作者本機原曲剪輯，CC BY 4.0
      assert.equal(s.license, 'CC BY 4.0', `${s.file} license`);
      assert.ok(s.source_title && s.source_author && s.source_url && hex(s.source_sha256) && /licensed under CC BY 4\.0/.test(s.attribution), `${s.file}：L 要有 source_title、source_author、source_url、source_sha256、attribution`);
      assert.equal(s.candidate, M.CHOICE[n]);
      continue;
    }
    assert.equal(s.license, 'CC0 1.0', `${s.file} license`);
    const isB = s.download_url != null;
    if (isB) { assert.ok(s.source_url && hex(s.zip_sha256), `${s.file}：B 要有 source_url、zip_sha256`); }
    if (!isB || s.route === 'B+C') assert.ok(s.source && (isB || s.license_note), `${s.file}：C 要有 source、license_note`);
    assert.ok(['B', 'C', 'B+C'].includes(s.route), `${s.file} route`);
    assert.equal(s.candidate, M.CHOICE[n], `${s.file}：sources.json candidate ${s.candidate}，make-sfx.mjs CHOICE ${M.CHOICE[n]}`);
    assert.equal(s.recipe, s.candidate);
  }
});

test('README 每個名稱一列；NOTICE 音效段每個檔名各出現一次（FR-036、FR-037）', () => {
  const readme = fs.readFileSync(path.join(SFX, 'README.md'), 'utf8');
  assert.match(readme, /^9 個音效：取自 CC0（公眾領域）素材，或 AI 生成並以 CC0 釋出/m);
  assert.match(readme, /^片尾配樂 `bgm-cylinder-five\.wav` 是 CC BY 4\.0：預設不配/m);
  const notice = fs.readFileSync(path.join(WORKSPACE, 'NOTICE.md'), 'utf8');
  const a = notice.indexOf('### 音效'), z = notice.indexOf('\n### ', a + 1);
  assert.ok(a >= 0, 'NOTICE.md 找不到「### 音效」');
  const sec = notice.slice(a, z < 0 ? undefined : z);
  assert.match(sec, /9 個音效/);
  for (const n of NAMES) {
    assert.equal(readme.split('\n').filter((l) => l.startsWith(`| \`${n}.wav\` |`)).length, 1, `README 要有一列 ${n}.wav`);
    const where = kit[n].kind === 'bgm' ? notice : sec;   // 片尾配樂在 NOTICE 自己的一段
    assert.equal(where.split(`shared/sfx/${n}.wav`).length - 1, 1, `NOTICE 要提到 ${n}.wav 一次`);
  }
});

test('授權護欄：shared/sfx、kit/sfx.json、NOTICE 音效段沒有剪映的音效名（FR-039、憲法 VII）', () => {
  const files = [...fs.readdirSync(SFX).filter((f) => !f.endsWith('.wav')).map((f) => path.join(SFX, f)), path.join(TEMPLATE, 'kit', 'sfx.json')];
  for (const f of files) { const m = fs.readFileSync(f, 'utf8').match(LICENSE_GUARD); assert.equal(m, null, `${path.relative(WORKSPACE, f)} 出現「${m?.[0]}」`); }
  const notice = fs.readFileSync(path.join(WORKSPACE, 'NOTICE.md'), 'utf8');
  const a = notice.indexOf('### 音效'), z = notice.indexOf('\n### ', a + 1);
  assert.equal(notice.slice(a, z < 0 ? undefined : z).match(LICENSE_GUARD), null);
});

test('style.md 音效段的數字＝SFX_RULES、每集上限欄＝kit maxPerVideo（FR-022）', async (t) => {
  const style = fs.readFileSync(path.join(WORKSPACE, 'shared', 'style.md'), 'utf8');
  const a = style.indexOf('## 音效'), z = style.indexOf('\n## ', a + 1);
  const sec = style.slice(a, z < 0 ? undefined : z);
  if (!sec.includes('每集上限')) return t.skip('shared/style.md 還沒加「每集上限」欄（001 改 style.md 之後才檢查）');
  const { SFX_RULES } = await imp('lib/audio.mjs');
  assert.match(sec, new RegExp(`${SFX_RULES.gapSec} 秒`));
  assert.match(sec, new RegExp(`${SFX_RULES.perMinute} 顆`));
  assert.match(sec, new RegExp(`${-SFX_RULES.capDb} dB`));
  const head = sec.split('\n').find((l) => l.startsWith('|') && l.includes('每集上限')).split('|').map((c) => c.trim());
  const col = head.indexOf('每集上限'), sndCol = head.indexOf('音效');
  for (const l of sec.split('\n').filter((x) => /^\|\s*[^-|]/.test(x) && !x.includes('每集上限'))) {
    const c = l.split('|').map((x) => x.trim()), names = (c[sndCol].match(/`([\w-]+)`/g) || []).map((x) => x.slice(1, -1)).filter((n) => kit[n]);
    for (const n of names) assert.equal(c[col] === '—' ? null : Number(c[col]), kit[n].maxPerVideo, `style.md ${n} 每集上限 ${c[col]}`);
  }
});

test('make-sfx.mjs 只 import node: 內建模組（FR-034）', () => {
  const src = fs.readFileSync(MAKE, 'utf8');
  const specs = [...src.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm), ...src.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
  assert.ok(specs.length > 0);
  for (const s of specs) assert.ok(s.startsWith('node:'), `make-sfx.mjs import 了 ${s}`);
});

test('make-sfx.mjs 離線產生 ding：檔案都在、A/B 長度、同一台機器位元組相同（FR-013）', { skip: !hasFfmpeg && '沒有 ffmpeg' }, (t) => {
  const d = tmp(), ref = path.join(d, 'ref.wav');
  const g = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=800:duration=0.5:sample_rate=48000', '-ac', '2', '-c:a', 'pcm_s16le', ref]);
  assert.equal(g.status, 0, String(g.stderr));
  const r1 = make('--candidates', '--only', 'ding', '--ref', ref, '--out', path.join(d, 'a'));
  assert.equal(r1.status, 0, r1.stderr);
  for (const f of ['ding/ding-a.wav', 'ding/ding-b.wav', 'ding/ab-ding-a.wav', 'index.html']) assert.ok(fs.existsSync(path.join(d, 'a', f)), `缺 ${f}`);
  const ab = readWav(path.join(d, 'a', 'ding', 'ab-ding-a.wav')), cand = readWav(path.join(d, 'a', 'ding', 'ding-a.wav')), rw = readWav(ref);
  assert.ok(Math.abs(ab.frames - (2 * rw.frames + cand.frames + 48000)) <= 1, `ab 長 ${ab.frames} 樣本，應＝參考×2＋候選＋1.0 s`);
  const r2 = make('--candidates', '--only', 'ding', '--out', path.join(d, 'b'));
  assert.equal(r2.status, 0, r2.stderr);
  assert.equal(sha(path.join(d, 'a', 'ding', 'ding-a.wav')), sha(path.join(d, 'b', 'ding', 'ding-a.wav')), '跑兩次 ding-a.wav 位元組要相同');
  const repo = sources.find((s) => s.file === 'ding.wav').sha256;
  t.diagnostic(`ding-a 重產 ${sha(path.join(d, 'b', 'ding', 'ding-a.wav')) === repo ? '跟 repo 的 ding.wav 相同' : '跟 repo 的 ding.wav 不同（ffmpeg 版本不同會讓增益差一點，這條只提示）'}`);
});

test('make-sfx.mjs 護欄：--out 在工作區裡 → 2；--ref 配多個名稱 → 2', () => {
  const r1 = make('--candidates', '--only', 'ding', '--out', path.join(WORKSPACE, 'projects', 'x'));
  assert.equal(r1.status, 2);
  assert.match(r1.stderr, /試聽檔不能放進工作區/);
  assert.ok(!fs.existsSync(path.join(WORKSPACE, 'projects', 'x')), '不能建出資料夾');
  const r2 = make('--candidates', '--only', 'ding,alert', '--ref', 'a.wav', '--out', tmp());
  assert.equal(r2.status, 2);
  assert.match(r2.stderr, /--ref 一次只能配一個名稱/);
  const r3 = make('--write', '--only', 'pop');
  assert.equal(r3.status, 2, 'pop 已拿掉，沒有配方');
  assert.match(r3.stderr, /「pop」沒有配方/);
  const r4 = make('--write', '--only', 'bgm-cylinder-five');
  assert.equal(r4.status, 2, '片尾配樂沒給 --src');
  assert.match(r4.stderr, /加 --src/);
});

test('make-sfx.mjs 的訊息＝cli-005 原文：--help（§1.7）、名稱沒有配方（§1.5）、每則 ✖ 都有 → 改法', () => {
  const cli = fs.readFileSync(path.join(WORKSPACE, 'specs', 'contracts', 'cli-005.md'), 'utf8');
  const help = cli.slice(cli.indexOf('### 1.7')).match(/```\n([\s\S]*?)\n```/)[1];
  const h = make('--help');
  assert.equal(h.status, 0);
  assert.equal(h.stdout.trimEnd(), help);
  const row = cli.match(/\| 名稱沒有配方 \| `([^`]+)` \|/)[1];
  const r = make('--candidates', '--only', 'nope', '--out', tmp());
  assert.equal(r.status, 2);
  assert.equal(r.stderr.trimEnd(), row.replace('<名稱>', 'nope').replace('<名稱清單，用「、」分隔>', Object.keys(M.RECIPES).join('、')));
  const src = fs.readFileSync(MAKE, 'utf8');
  const msgs = [...src.matchAll(/fail\(\s*`([^`]*)`/g), ...src.matchAll(/fail\(\s*'([^']*)'/g)].map((m) => m[1]);
  assert.ok(msgs.length >= 10);
  for (const m of msgs) assert.match(m, / ?→ /, `make-sfx.mjs 的 ✖ 沒有「→ 改法」：${m.slice(0, 60)}`);
});
