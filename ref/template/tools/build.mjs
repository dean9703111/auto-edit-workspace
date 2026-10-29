#!/usr/bin/env node
/**
 * 主合成產生器：plan.json ＋ rough.srt ＋ rough.mp4 → work/hyperframes/（HyperFrames 專案）
 *
 *   node ref/template/tools/build.mjs                 產生整個專案（預設 plan=work/hyperframes/plan.json、srt=work/rough.srt、
 *                                                     video=work/rough.mp4、out=work/hyperframes）
 *   node ref/template/tools/build.mjs --check         只檢查 plan.json，不寫檔（分鏡定稿後先跑）
 *   node ref/template/tools/build.mjs --list [--json] 印出 18 情境＋40 字卡動態的 key、何時用、slots 與上限
 *   node ref/template/tools/build.mjs --test 41,4     另外產生 compositions/test-clip.html：41 秒起的 4 秒
 *                                                     （再到 work/hyperframes 跑 npx hyperframes render -c compositions/test-clip.html --quality draft）
 *   node ref/template/tools/build.mjs --force         覆寫手改過的產生檔
 *   node ref/template/tools/build.mjs --gallery       （作者用）重新產生 ref/template/preview/*.html
 *
 * 路徑旗標（選填，相對目前資料夾）：--plan --srt --video --out --sfx；測試用：--template <ref/template 資料夾>
 * 需要 Node 22 以上、ffmpeg／ffprobe（npx hyperframes doctor 會檢查）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseSrt } from './lib/srt.mjs';
import { floorFrame, r3 } from './lib/time.mjs';
import { loadScenes, loadIcons, loadFx, motionConsts, resolveScene, sampleSeg } from './lib/scenes.mjs';
import { assembleScene, sceneParts, hashOf, verifyHash } from './lib/assemble.mjs';
import { buildCaptions, captionWarnings } from './lib/captions.mjs';
import { resolvePlan, formatReport, pipGeometry, sceneSfxCues } from './lib/plan.mjs';
import { buildMain, buildPreview } from './lib/main.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEST_FILE = 'compositions/test-clip.html';
const VALUE_FLAGS = ['plan', 'srt', 'video', 'out', 'sfx', 'template', 'test', 'only'];

export function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`看不懂的參數「${a}」（用 --help 看用法）`);
    const [k, inline] = a.slice(2).split('=');
    if (VALUE_FLAGS.includes(k)) {
      const v = inline ?? argv[++i];
      if (v == null) throw new Error(`--${k} 後面要接值`);
      flags[k] = v;
    } else if (['check', 'list', 'json', 'force', 'gallery', 'help'].includes(k)) flags[k] = true;
    else throw new Error(`沒有 --${k} 這個參數（用 --help 看用法）`);
  }
  return flags;
}

export function pathsFrom(flags, cwd = process.cwd()) {
  const templateDir = flags.template ? path.resolve(cwd, flags.template) : path.resolve(HERE, '..');
  const root = path.resolve(templateDir, '..', '..');
  const out = flags.out ? path.resolve(cwd, flags.out) : path.join(root, 'work', 'hyperframes');
  return {
    templateDir, root, out,
    plan: flags.plan ? path.resolve(cwd, flags.plan) : path.join(out, 'plan.json'),
    srt: flags.srt ? path.resolve(cwd, flags.srt) : path.join(root, 'work', 'rough.srt'),
    video: flags.video ? path.resolve(cwd, flags.video) : path.join(root, 'work', 'rough.mp4'),
    sfx: flags.sfx ? path.resolve(cwd, flags.sfx) : path.join(root, 'sfx'),
  };
}

const rel = (p) => path.relative(process.cwd(), p) || '.';

export function loadLib(templateDir) {
  const kit = path.join(templateDir, 'kit');
  const read = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
  const brandCss = fs.existsSync(path.join(kit, 'brand.css')) ? fs.readFileSync(path.join(kit, 'brand.css'), 'utf8') : '';
  const accent = (brandCss.match(/--brand\s*:\s*(#[0-9a-fA-F]{6})/) || [])[1] || '#FFD400';
  return {
    scenes: loadScenes(templateDir), icons: loadIcons(templateDir), fx: loadFx(templateDir),
    consts: motionConsts(kit), sfx: read(path.join(kit, 'sfx.json'), {}), accent,
  };
}

// ---------- ffmpeg ----------

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.error) {
    if (r.error.code === 'ENOENT') throw new Error(`找不到 ${cmd}：先跑 npx hyperframes doctor 安裝 ffmpeg，或確認 ${cmd} 在 PATH 裡`);
    throw r.error;
  }
  return r;
}
export function probeDuration(file) {
  const r = run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]);
  const d = Number(String(r.stdout).trim());
  if (r.status !== 0 || !Number.isFinite(d)) throw new Error(`ffprobe 讀不到 ${file} 的長度：${String(r.stderr).trim().slice(0, 200)}`);
  return d;
}
// 重新編碼：固定 30fps、每秒一個關鍵幀（關鍵幀間隔太大時 seek 會凍結），聲音轉 AAC 讓長度和畫面一致
export function encodeFootage(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  const args = ['-y', '-v', 'error', '-i', src, '-vf', 'fps=30', '-fps_mode', 'cfr', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
    '-g', '30', '-keyint_min', '30', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', dst];
  const r = run('ffmpeg', args);
  if (r.status !== 0) throw new Error(`ffmpeg 重新編碼失敗：${String(r.stderr).trim().slice(0, 400)}`);
}

// ---------- 寫檔與保護 ----------

function readManifest(out) {
  const f = path.join(out, '.build-manifest.json');
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return { version: 1, files: {} }; }
}

function makeWriter(out, manifest, force) {
  const res = { written: [], same: [], skipped: [] };
  const isUntouched = (relp, cur) => {
    const known = manifest.files[relp];
    if (known) return hashOf(cur) === known;
    const v = verifyHash(cur);
    return v.stamped && v.ok;
  };
  const write = (relp, content) => {
    const abs = path.join(out, relp);
    if (fs.existsSync(abs)) {
      const cur = fs.readFileSync(abs, 'utf8');
      if (cur === content) { manifest.files[relp] = hashOf(content); res.same.push(relp); return 'same'; }
      if (!force && !isUntouched(relp, cur)) { res.skipped.push(relp); return 'skip'; }
    }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
    manifest.files[relp] = hashOf(content);
    res.written.push(relp);
    return 'written';
  };
  return { write, isUntouched, res };
}

function copyIfChanged(src, dst) {
  if (fs.existsSync(dst)) {
    const a = fs.statSync(src), b = fs.statSync(dst);
    if (a.size === b.size && a.mtimeMs <= b.mtimeMs) return false;
  }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  return true;
}
function copyDir(src, dst, skip = []) {
  let n = 0;
  for (const name of fs.readdirSync(src)) {
    if (skip.includes(name) || name.startsWith('.')) continue;
    const s = path.join(src, name), d = path.join(dst, name);
    if (fs.statSync(s).isDirectory()) n += copyDir(s, d, skip);
    else if (copyIfChanged(s, d)) n++;
  }
  return n;
}

// ---------- --list ----------

const limitOf = (d) => {
  const p = [];
  if (d.required) p.push('必填');
  if (d.type === 'rich') p.push('rich');
  if (d.type === 'icon') p.push('圖示名');
  if (d.max != null) p.push(`≤${d.max}`);
  if (d.maxLines != null) p.push(`≤${d.maxLines} 行`);
  if (d.maxLine != null) p.push(`每行 ≤${d.maxLine}`);
  if (d.type === 'list') p.push(`${d.min ?? 0}–${d.maxItems ?? '∞'} 項`);
  if (d.default !== undefined) p.push(`預設 ${Array.isArray(d.default) ? d.default.join('/') : d.default}`);
  return p.join('、');
};
function slotSummary(scene) {
  return Object.entries(scene.slots || {}).map(([k, d]) => {
    let s = `${k}（${[d.label, limitOf(d)].filter(Boolean).join('：')}）`;
    if (d.type === 'list') {
      const it = d.item || { text: { type: 'text' } };
      s += ` 每項 { ${Object.entries(it).map(([fk, fd]) => `${fk}${limitOf(fd) ? ` ${limitOf(fd)}` : ''}`).join(', ')}, at? }`;
    }
    return s;
  }).join('；');
}
function sfxSummary(scene) {
  const sd = scene.sfx || {};
  const sound = sd.main?.sound;
  const name = sound && typeof sound === 'object' ? Object.values(sound).join('／') : sound;
  const compact = (a) => String(a).replace(/\s+/g, '');
  const parts = [];
  if (name) parts.push(`${name} @ ${compact(sd.main.at)}`);
  for (const c of sd.extra || []) parts.push(`${c.sound} ×${compact(c.at)}${c.volume != null && c.volume !== 1 ? `（音量 ×${c.volume}）` : ''}`);
  return parts.join('；') || '—';
}
export function listText(lib) {
  const lines = ['# 情境（type 不寫＝scene；"scene" 填 key）', '', '| # | key | 中文 | 組別 | 長度（秒） | 綁句 | slots（上限） | beats | 音效 | 什麼時候用 | 不要用在 |', '|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const s of lib.scenes) {
    const d = s.duration || {};
    const len = d.fixed != null ? `固定 ${d.fixed}` : `預設 ${d.default}${d.min ? `、最短 ${d.min}` : ''}`;
    const beats = Object.entries(s.beats || {}).map(([k, b]) => `${k}（${b.label}，預設 ${b.default}）`).join('；') || '—';
    lines.push(`| ${s.num} | ${s.key} | ${s.zh} | ${s.family} | ${len} | ${s.bindsSrt === false ? 'at: "#N"' : 'from／to'} | ${slotSummary(s)}${s.tone ? '；tone: warn／good' : ''} | ${beats} | ${sfxSummary(s)} | ${s.when} | ${s.avoid || '—'} |`);
  }
  lines.push('', '# 字卡動態（"type": "fx", "fx": 編號；bg 預設 none＝透明疊在講者上；dark／light／accent＝不透明整張幕）', '', '| # | 中文 | 英文 | 類別 | vars | 音效 | 看到什麼句子用它 |', '|---|---|---|---|---|---|---|');
  for (const f of lib.fx) {
    const vars = f.vars.filter((v) => !['bg', 'accent'].includes(v.id)).map((v) => `${v.id}（${v.label}）`).join('、');
    lines.push(`| ${f.id} | ${f.zh} | ${f.en} | ${f.category} | ${vars} | ${f.sfx ? `${f.sfx.sound} @ ${f.sfx.at ?? 'start'}` : '—'} | ${f.when} |`);
  }
  lines.push('', '# 音效（"sfx"）：' + Object.entries(lib.sfx).map(([k, v]) => `${k}（${v.zh || k}，音量 ${v.volume}）`).join('、') + '、null（不配）；"sfxExtra": false 可關掉該段的附加音效（跟動畫節拍的 tick 等）；不寫＝用上表音效欄的預設');
  return lines.join('\n');
}

// ---------- --gallery ----------

export function runGallery(templateDir, { only = null } = {}) {
  const lib = loadLib(templateDir);
  const outDir = path.join(templateDir, 'preview');
  fs.mkdirSync(outDir, { recursive: true });
  const pipStyle = pipGeometry('auto', null).style;
  const made = [], problems = [];
  const sfxScenes = {};
  for (const scene of lib.scenes) {
    if (only && !only.includes(scene.key)) continue;
    const seg = sampleSeg(scene);
    const D = seg.duration;
    const r = resolveScene({ scene, seg, cues: [], icons: lib.icons, consts: lib.consts, t0: 0, D, where: `[預覽 ${scene.key}]` });
    if (r.errors.length) { problems.push(...r.errors); continue; }
    const parts = sceneParts({ scene, ctx: r.ctx, beats: r.beats, id: 'pv', D, tone: null, exitFade: true });
    const file = path.join(outDir, `${scene.num}-${scene.key}.html`);
    const sc = sceneSfxCues({ scene, resolved: r, D, tone: null, sfxConf: lib.sfx });
    problems.push(...sc.errors);
    const cues = [...(sc.main ? [{ sound: sc.main.name, at: sc.main.rel }] : []), ...sc.extra.map((c) => ({ sound: c.name, at: c.rel, volume: c.vol }))];
    sfxScenes[scene.key] = { zh: scene.zh, no: scene.num, main: sc.main ? { sound: sc.main.name, at: sc.main.rel } : null, extra: sc.extra.map((c) => ({ sound: c.name, at: c.rel })) };
    fs.writeFileSync(file, buildPreview({ scene, parts, D, sub: scene.sample?.sub, pipStyle, cues }));
    made.push(file);
  }
  if (!only) {
    const fxData = {};
    for (const f of lib.fx) if (f.sfx) fxData[f.id] = { sound: f.sfx.sound, at: f.sfx.at ?? 0 };
    const data = { generated: new Date().toISOString(), sounds: lib.sfx, scenes: sfxScenes, fx: fxData };
    const dataFile = path.join(outDir, 'sfx-data.js');
    fs.writeFileSync(dataFile, `// build.mjs --gallery 產生，不要手改\nwindow.__SFX_DATA = ${JSON.stringify(data, null, 2)};\n`);
    made.push(dataFile);
  }
  return { made, problems };
}

// ---------- 主流程 ----------

function loadInputs(P) {
  if (!fs.existsSync(P.plan)) throw new Error(`找不到 ${rel(P.plan)}：先寫 plan.json（格式見 ref/template/USAGE.md）`);
  let plan;
  try { plan = JSON.parse(fs.readFileSync(P.plan, 'utf8')); } catch (e) { throw new Error(`${rel(P.plan)} 不是合法的 JSON：${e.message}（JSON 不能有註解、最後一項後面不能有逗號）`); }
  if (!fs.existsSync(P.srt)) throw new Error(`找不到字幕 ${rel(P.srt)}`);
  const cues = parseSrt(fs.readFileSync(P.srt, 'utf8'));
  if (!cues.length) throw new Error(`${rel(P.srt)} 讀不到任何字幕句（格式要是 SRT）`);
  return { plan, cues };
}

function printIssues(res, log) {
  for (const e of res.errors) log(`✖ ${e}`);
  for (const w of res.warnings) log(`⚠ ${w}`);
}

export function build(flags, { log = console.log } = {}) {
  const P = pathsFrom(flags);
  const lib = loadLib(P.templateDir);
  if (!lib.scenes.length) throw new Error(`找不到情境模板：${rel(path.join(P.templateDir, 'scenes'))}`);
  const { plan, cues } = loadInputs(P);
  const assetVideo = path.join(P.out, 'assets', 'rough.mp4');
  const fresh = fs.existsSync(assetVideo) && (!fs.existsSync(P.video) || fs.statSync(assetVideo).mtimeMs >= fs.statSync(P.video).mtimeMs);
  if (!fresh && !fs.existsSync(P.video)) throw new Error(`找不到影片 ${rel(P.video)}`);

  // --check：不寫檔
  if (flags.check) {
    const videoDur = floorFrame(probeDuration(fresh ? assetVideo : P.video));
    const res = resolvePlan({ plan, cues, videoDur, lib, outDir: P.out, sfxDir: P.sfx });
    const capW = captionWarnings(cues);
    printIssues(res, log);
    for (const w of capW) log(`⚠ ${w}`);
    log('', formatReport(res, { videoDur }));
    log(res.errors.length ? `\n未通過：${res.errors.length} 個錯誤（✖），${res.warnings.length + capW.length} 個提醒（⚠）。照 → 後面的建議改 plan.json 再跑一次。` : `\n通過：${res.items.length} 段，${res.warnings.length + capW.length} 個提醒（⚠）。`);
    return { ok: !res.errors.length, res };
  }

  // 底片：work/rough.mp4 比較新才重新編碼
  let encoded = false;
  if (!fresh) {
    log(`重新編碼底片 → ${rel(assetVideo)}（30fps、每秒一個關鍵幀）…`);
    encodeFootage(P.video, assetVideo);
    encoded = true;
  }
  const rawDur = probeDuration(assetVideo);
  const videoDur = floorFrame(rawDur);
  if (encoded) {
    const srcDur = probeDuration(P.video);
    const drift = r3(rawDur - srcDur);
    log(`底片長度：原檔 ${r3(srcDur)}s → 重新編碼 ${r3(rawDur)}s（差 ${drift}s）${Math.abs(drift) > 0.1 ? ' ⚠ 差超過 0.1s，字幕可能對不準' : ''}`);
  }
  const res = resolvePlan({ plan, cues, videoDur, lib, outDir: P.out, sfxDir: P.sfx });
  printIssues(res, log);
  for (const w of captionWarnings(cues)) log(`⚠ ${w}`);
  if (res.errors.length) {
    log(`\n未通過：${res.errors.length} 個錯誤，沒有產生任何檔案。照 → 後面的建議改 plan.json 再跑一次。`);
    return { ok: false, res };
  }

  // 產生內容（先全部組好，組不出來就不寫檔）
  const files = [];
  for (const it of res.items) {
    if (it.type !== 'scene') continue;
    try {
      const a = assembleScene({ scene: it.scene, ctx: it.resolved.ctx, beats: it.resolved.beats, id: it.id, D: it.D, tone: it.resolved.tone, exitFade: it.exitFade, chapter: it.chapter, css: it.seg.css || '', chtag: !!it.seg.chtag });
      files.push([a.file, a.html]);
    } catch (e) { res.errors.push(`${it.where} ${e.message}`); }
  }
  if (res.errors.length) { printIssues({ errors: res.errors.slice(-1), warnings: [] }, log); return { ok: false, res }; }
  const fxDir = path.join(P.templateDir, 'fx', 'effects');
  const fxUsed = [...new Set(res.items.filter((x) => x.type === 'fx').map((x) => x.fxDef.fileName))];
  for (const f of fxUsed) files.push([`compositions/${f}`, fs.readFileSync(path.join(fxDir, f), 'utf8')]);
  if (fxUsed.length) files.push(['compositions/fx-kit.js', fs.readFileSync(path.join(fxDir, 'fx-kit.js'), 'utf8')]);
  const cap = buildCaptions(cues, { duration: videoDur });
  files.push([cap.file, cap.html]);
  const bg = fs.existsSync(path.join(P.templateDir, 'bg.jpg'));
  const main = buildMain({ items: res.items, videoDur, captions: cap, pip: res.globals.pip, sideShift: res.globals.sideShift, bg });
  let test = null;
  if (flags.test) {
    const m = String(flags.test).match(/^\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*$/);
    if (!m) throw new Error('--test 要寫成「起點,秒數」，例如 --test 41,4');
    const t0 = Number(m[1]), len = Number(m[2]);
    if (t0 >= videoDur) throw new Error(`--test 起點 ${t0}s 超過影片長度 ${videoDur}s`);
    const capT = buildCaptions(cues, { duration: r3(Math.min(len, videoDur - t0)), offset: t0, compId: 'captions-test' });
    files.push([capT.file, capT.html]);
    test = buildMain({ items: res.items, videoDur, captions: capT, pip: res.globals.pip, sideShift: res.globals.sideShift, bg, test: { t0, len } });
    test.t0 = t0;
  }
  const projectJson = fs.readFileSync(path.join(HERE, 'project', 'hyperframes.json'), 'utf8');
  files.push(['hyperframes.json', projectJson]);
  files.push(['meta.json', JSON.stringify({ id: 'hyperframes', name: 'auto-edit' }, null, 2) + '\n']);

  // 保護：index.html 被改過就整個停下來
  const manifest = readManifest(P.out);
  const W = makeWriter(P.out, manifest, !!flags.force);
  const idx = path.join(P.out, 'index.html');
  if (!flags.force && fs.existsSync(idx)) {
    const cur = fs.readFileSync(idx, 'utf8');
    if (cur !== main.html && !W.isUntouched('index.html', cur)) {
      throw new Error('work/hyperframes/index.html 被手改過（可能是 Studio 存檔）：把想要的改動搬進 plan.json（時間、slots、css），再加 --force 重跑；直接覆寫會蓋掉手改');
    }
  }

  // 寫檔
  fs.mkdirSync(P.out, { recursive: true });
  const kitN = copyDir(path.join(P.templateDir, 'kit'), path.join(P.out, 'kit'), ['icons.json']);
  if (fs.existsSync(P.sfx)) for (const f of fs.readdirSync(P.sfx).filter((x) => x.endsWith('.wav'))) copyIfChanged(path.join(P.sfx, f), path.join(P.out, 'assets', 'sfx', f));
  if (bg) copyIfChanged(path.join(P.templateDir, 'bg.jpg'), path.join(P.out, 'assets', 'bg.jpg'));
  const generated = new Set();
  for (const [f, c] of files) { W.write(f, c); generated.add(f); }
  W.write('index.html', main.html); generated.add('index.html');
  if (test) { W.write(TEST_FILE, test.html); generated.add(TEST_FILE); }
  // 舊的產生檔（plan 拿掉的段）：沒被手改才刪
  const removed = [];
  for (const f of Object.keys(manifest.files)) {
    if (generated.has(f) || [TEST_FILE, 'compositions/captions-test.html'].includes(f)) continue;
    const abs = path.join(P.out, f);
    if (!fs.existsSync(abs)) { delete manifest.files[f]; continue; }
    if (W.isUntouched(f, fs.readFileSync(abs, 'utf8'))) { fs.unlinkSync(abs); delete manifest.files[f]; removed.push(f); }
  }
  fs.writeFileSync(path.join(P.out, '.build-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  log('', formatReport(res, { videoDur }));
  log(`\n產生：${W.res.written.length} 個檔（沒變 ${W.res.same.length}）；kit 更新 ${kitN} 個檔${removed.length ? `；刪掉舊檔 ${removed.join('、')}` : ''}`);
  if (W.res.skipped.length) log(`⚠ 這些檔被手改過，沒有覆寫：${W.res.skipped.join('、')} → 把改動搬進 plan.json 後加 --force`);
  if (test) {
    log(`測試片段：${rel(path.join(P.out, TEST_FILE))}（${test.t0}s 起 ${test.duration}s）→ cd ${rel(P.out)} && npx hyperframes render -c ${TEST_FILE} --quality draft -o ../../output/test-clip.mp4`);
    for (const it of test.skipped) log(`⚠ ${it.id} 在 ${it.start}s 就開始了，測試片段不含這段（要看完整段，把起點改成 ${it.start}）`);
  }
  return { ok: true, res, written: W.res.written, skipped: W.res.skipped, removed };
}

async function cli() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*\n?/, '').replace(/^ \* ?/gm, '')); return 0; }
  const P = pathsFrom(flags);
  if (flags.list) {
    const lib = loadLib(P.templateDir);
    if (flags.json) console.log(JSON.stringify({ sounds: Object.fromEntries(Object.entries(lib.sfx).map(([k, v]) => [k, { ...v, file: `sfx/${k}.wav`, exists: fs.existsSync(path.join(P.sfx, `${k}.wav`)) }])), scenes: lib.scenes.map(({ template, dir, ...s }) => s), fx: lib.fx.map(({ file, ...f }) => f) }, null, 2));
    else console.log(listText(lib));
    return 0;
  }
  if (flags.gallery) {
    const r = runGallery(P.templateDir, { only: flags.only ? flags.only.split(',') : null });
    for (const f of r.made) console.log(`→ ${rel(f)}`);
    for (const e of r.problems) console.log(`✖ ${e}`);
    return r.problems.length ? 1 : 0;
  }
  const r = build(flags);
  return r.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cli().then((code) => { process.exitCode = code; }, (e) => { console.error(`✖ ${e.message}`); process.exitCode = 1; });
}
