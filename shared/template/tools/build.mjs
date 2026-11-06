#!/usr/bin/env node
/**
 * 主合成產生器：plan.json ＋ rough.srt ＋ rough.mp4 → projects/<專案>/work/hyperframes/（HyperFrames 專案）
 *
 *   node shared/template/tools/build.mjs --project projects/<專案>          產生整個專案（預設 plan=work/hyperframes/plan.json、
 *                                                     srt=work/rough.srt、video=work/rough.mp4、out=work/hyperframes，都在專案資料夾裡）
 *   node shared/template/tools/build.mjs --project projects/<專案> --check  只檢查 plan.json，不寫檔（分鏡定稿後先跑；只會寫偵測快取 work/hyperframes/.cache/）
 *   node shared/template/tools/build.mjs --project projects/<專案> --check --json
 *                                                     同上，stdout 只印一個 JSON（剪輯台讀；時間都是 rough.mp4 的秒數，格式見 USAGE-reference.md R2.6）
 *   node shared/template/tools/build.mjs --list [--json] 印出 18 情境＋40 字卡動態的 key、何時用、slots 與上限，以及插入素材（type: "media"）的欄位
 *   node shared/template/tools/build.mjs --project projects/<專案> --test 41,4
 *                                                     另外產生 compositions/test-clip.html：41 秒起的 4 秒
 *                                                     （再到 work/hyperframes 跑 npx hyperframes render -c compositions/test-clip.html --quality draft）
 *   node shared/template/tools/build.mjs --project projects/<專案> --capcut
 *                                                     另外產生剪映素材的合成：每段一支 compositions/capcut-<段>.html（透明底、沒有字幕與主軌聲音）
 *                                                     和主軌 compositions/capcut-main.html，清單寫 work/hyperframes/capcut.json（render 交給 capcut.mjs）
 *   node shared/template/tools/build.mjs --force      覆寫手改過的產生檔
 *   node shared/template/tools/build.mjs --no-loudnorm  重新編碼底片時不做人聲響度標準化（預設調到 −14 LUFS、true peak ≤ −1 dBTP）
 *   node shared/template/tools/build.mjs --no-declick   重新編碼底片時不在剪接點（work/cutpoints.json）做 15 ms 微淡化
 *   node shared/template/tools/build.mjs --gallery    （作者用）重新產生 shared/template/preview/*.html（情境動畫另出直式 x-<名稱>-v.html，和直式講者示意 speaker-v.jpg、speaker-v-dark.jpg）
 *   --format landscape|portrait（或 橫式|直式）：蓋過版式（預設照 plan.json "format" > work/製作進度.md 開工決策表「版式」> 主軌寬高比；lib/canvas.mjs）
 *
 * --project：專案資料夾（projects/example，或只寫名稱 example）。沒寫時：目前資料夾在某個專案裡就用它；
 *   projects/ 底下只有一個專案就用那個；都不是就出錯並列出現有專案。
 * 路徑旗標（選填，相對目前資料夾，會蓋過 --project 的預設）：--plan --srt --video --out --sfx；測試用：--template <shared/template 資料夾>
 * 需要 Node 22 以上、ffmpeg／ffprobe（npx hyperframes doctor 會檢查）。
 * 也會讀：work/cutpoints.json（剪接點，edit.joins 對照用，重新編碼底片時也在這些點做微淡化）；rough.mp4 全黑的區間＝只有聲音（ffmpeg blackdetect，快取在 work/hyperframes/.cache/）。
 * 報告開頭印版式（「版式：直式 1080×1920（來源：plan.json）」）與 HyperFrames 版本（和工作區根目錄 package.json 釘的版本不同時 ⚠）。
 * 版式兩個來源（plan.json、開工決策表）不同、或主軌方向和版式不合（直式專案給橫拍素材）時 ✖；build 結尾印字幕保留帶的 hyperframes check --caption-zone 指令。
 * plan 有情境動畫（type: "custom"）時，index.html 的 <head> 會多一段 window.__cues（字幕時間與每段起點、段長），
 * 情境動畫用 P.at('#N') 綁句、P.end() 撐到段長，不用手算秒數（寫法見 shared/template/USAGE-reference.md R7.3）。
 * --check 的節奏照 plan.json 的 rhythm（不寫＝continuous，列出沒有畫面的區間）。
 * plan.json 寫 "style": "<名稱>" 時，主色、子母畫面外框、背景圖改用 shared/template/styles/<名稱>/ 的（缺的檔退回 shared/template/ 目前那一份）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseSrt, formatSrt } from './lib/srt.mjs';
import { floorFrame, r3 } from './lib/time.mjs';
import { loadScenes, loadIcons, loadFx, motionConsts, resolveScene, sampleSeg } from './lib/scenes.mjs';
import { assembleScene, sceneParts, hashOf, verifyHash } from './lib/assemble.mjs';
import { buildCaptions, captionWarnings } from './lib/captions.mjs';
import { resolvePlan, formatReport, pipGeometry, sceneSfxCues, jsonItems, jsonTop, outroClip, outroLine } from './lib/plan.mjs';
import { buildMain, buildPreview, KIT_LINKS, withTheme } from './lib/main.mjs';
import { run, probeDuration, probeMedia, encodeFootage, encodeMedia, blackDetect, extractFrames, rawFrame, writeJpg, transcriptFresh } from './lib/ff.mjs';
import { hfShim } from './lib/hf.mjs';
import { mediaJobs, MEDIA_KEYS, MEDIA_FIELDS } from './lib/media.mjs';
import { DEFAULT_EDIT } from './lib/edit.mjs';
import { readSpeaker, applySpeaker, speakerIssues } from './lib/speaker.mjs';
import { encodeFootagePolished, audioKey, readStamp, stampMatches, audioReportLines, renderBgmClip } from './lib/audio.mjs';
import { ensureLook, lookCheck } from './lib/look.mjs';
import { hyperframesVersion, versionLine } from './caps.mjs';
import { canvasOf, resolveFormat, formatLine, formatErrors, probeDims, captionZoneArg } from './lib/canvas.mjs';
import { packDir, PACK_KIT, copyIfDiff } from './lib/styles.mjs';
import { appliedDesign } from './lib/project-design.mjs';

export { probeDuration, encodeFootage };

const HERE = path.dirname(fileURLToPath(import.meta.url));
// 第二層情境動畫的預覽頁（003 的 lib/custom-preview.mjs；檔還沒出現前 --gallery 照常跑，只是不產生 preview/x-*.html）
const CUSTOM_PREVIEW = path.join(HERE, 'lib', 'custom-preview.mjs');
const customPreview = fs.existsSync(CUSTOM_PREVIEW) ? await import(pathToFileURL(CUSTOM_PREVIEW).href) : null;
const TEST_FILE = 'compositions/test-clip.html';
const CAPCUT_RE = /^compositions\/capcut-[^/]+\.html$/;
const OUTPUT_DIRS = ['output', path.join('output', 'test-clips'), path.join('output', 'qc')];
const VALUE_FLAGS = ['project', 'plan', 'srt', 'video', 'out', 'sfx', 'template', 'test', 'only', 'format'];

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
    } else if (['check', 'list', 'json', 'force', 'gallery', 'help', 'no-loudnorm', 'no-declick', 'capcut'].includes(k)) flags[k] = true;
    else throw new Error(`沒有 --${k} 這個參數（用 --help 看用法）`);
  }
  return flags;
}

// 專案資料夾：--project（路徑或名稱）→ 目前資料夾所在的專案 → projects/ 只有一個時用它；--plan／--srt／--video／--out 全給時可以沒有專案
export function findProject(flags, root, cwd = process.cwd()) {
  const projects = path.join(root, 'projects');
  const list = () => (fs.existsSync(projects) ? fs.readdirSync(projects, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('.')).map((d) => d.name) : []);
  if (flags.project) {
    for (const p of [path.resolve(cwd, flags.project), path.join(projects, flags.project)]) if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return p;
    throw new Error(`找不到專案「${flags.project}」→ 現有專案：${list().map((n) => `projects/${n}`).join('、') || '（projects/ 是空的）'}`);
  }
  const r = path.relative(projects, cwd);
  if (r && !r.startsWith('..') && !path.isAbsolute(r)) return path.join(projects, r.split(path.sep)[0]);
  if (['plan', 'srt', 'video', 'out'].every((k) => flags[k])) return null;
  const names = list();
  if (names.length === 1) return path.join(projects, names[0]);
  throw new Error(`要指定專案：加 --project projects/<專案> → 現有專案：${names.map((n) => `projects/${n}`).join('、') || '（projects/ 是空的，先建專案資料夾）'}`);
}

export function pathsFrom(flags, cwd = process.cwd(), { needProject = true } = {}) {
  const templateDir = flags.template ? path.resolve(cwd, flags.template) : path.resolve(HERE, '..');
  const shared = path.resolve(templateDir, '..');
  const root = path.resolve(shared, '..');
  const project = needProject ? findProject(flags, root, cwd) : null;
  const work = project ? path.join(project, 'work') : null;
  const out = flags.out ? path.resolve(cwd, flags.out) : work && path.join(work, 'hyperframes');
  return {
    templateDir, root, project, out,
    plan: flags.plan ? path.resolve(cwd, flags.plan) : out && path.join(out, 'plan.json'),
    srt: flags.srt ? path.resolve(cwd, flags.srt) : work && path.join(work, 'rough.srt'),
    video: flags.video ? path.resolve(cwd, flags.video) : work && path.join(work, 'rough.mp4'),
    sfx: flags.sfx ? path.resolve(cwd, flags.sfx) : path.join(shared, 'sfx'),
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
    customDir: path.join(templateDir, 'custom'),
  };
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
  const PORTRAIT_ZH = { move: '可（換位置）', stage: '可（縮進上半）', none: '不提供' };
  const lines = ['# 情境（type 不寫＝scene；"scene" 填 key；直式＝plan.json "format": "portrait" 時能不能用）', '', '| # | key | 中文 | 組別 | 直式 | 長度（秒） | 綁句 | slots（上限） | beats | 音效 | 什麼時候用 | 不要用在 |', '|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const s of lib.scenes) {
    const d = s.duration || {};
    const len = d.fixed != null ? `固定 ${d.fixed}` : `預設 ${d.default}${d.min ? `、最短 ${d.min}` : ''}`;
    const beats = Object.entries(s.beats || {}).map(([k, b]) => `${k}（${b.label}，預設 ${b.default}）`).join('；') || '—';
    lines.push(`| ${s.num} | ${s.key} | ${s.zh} | ${s.family} | ${PORTRAIT_ZH[s.portrait] || '—'} | ${len} | ${s.bindsSrt === false ? 'at: "#N"' : 'from／to'} | ${slotSummary(s)}${s.tone ? '；tone: warn／good' : ''} | ${beats} | ${sfxSummary(s)} | ${s.when} | ${s.avoid || '—'} |`);
  }
  lines.push('', '# 字卡動態（"type": "fx", "fx": 編號；bg 預設 none＝透明疊在講者上；dark／light／accent＝不透明整張幕）', '', '| # | 中文 | 英文 | 類別 | vars | 音效 | 看到什麼句子用它 |', '|---|---|---|---|---|---|---|');
  for (const f of lib.fx) {
    const vars = f.vars.filter((v) => !['bg', 'accent'].includes(v.id)).map((v) => `${v.id}（${v.label}）`).join('、');
    lines.push(`| ${f.id} | ${f.zh} | ${f.en} | ${f.category} | ${vars} | ${f.sfx ? `${f.sfx.sound} @ ${f.sfx.at ?? 'start'}` : '—'} | ${f.when} |`);
  }
  const tags = (v) => [v.additive ? '附加' : '', v.maxPerVideo != null ? `每集 ≤ ${v.maxPerVideo}` : ''].filter(Boolean).map((x) => `，${x}`).join('');
  lines.push('', '# 音效（"sfx"）：' + Object.entries(lib.sfx).filter(([, v]) => v.kind !== 'bgm').map(([k, v]) => `${k}（${v.zh || k}，音量 ${v.volume}${tags(v)}）`).join('、') + '、null（不配）；"sfxExtra": false 可關掉該段的附加音效（跟動畫節拍的 tick 等）；不寫＝用上表音效欄的預設');
  const bgms = Object.keys(lib.sfx).filter((k) => lib.sfx[k].kind === 'bgm');
  if (bgms.length) lines.push(`結尾配樂（plan.json "outro"）：${bgms.join('、')}`);
  lines.push('', '# 插入素材（"type": "media"：螢幕錄影或圖片，整張幕＋右下角子母畫面；用法見 shared/template/USAGE.md 第 5 節）', '',
    '| 欄位 | 值 | 預設 | 說明 |', '|---|---|---|---|');
  for (const r of MEDIA_FIELDS) lines.push(`| ${r[0]} | ${r[1]} | ${r[2]} | ${r[3]} |`);
  return lines.join('\n');
}

// --list 的 media 欄位表：lib/media.mjs 的 MEDIA_FIELDS（004 擁有；文字與 --json 共用）
export { MEDIA_FIELDS };

// ---------- 風格包、剪映素材 ----------

// plan.json "style" 指的風格包要在 shared/template/styles/ 裡
function styleErrors(P, res) {
  if (!res.style) return [];
  try { packDir(P.templateDir, res.style); return []; } catch (e) { return [`style：${e.message}`]; }
}

const LAYOUT = { overlay: '疊加', side: '半畫面', pip: '子母畫面', full: '全幕' };
// 每段一支（時間窗＝那一段；有 noHost 又沒有子母畫面的段畫面上沒東西，略過），加一支主軌；字幕照畫面上實際顯示的時間寫 SRT
function capcutParts(res, { mainOpts, outDur, captions, format }) {
  const comps = [], segs = [];
  for (const it of res.items) {
    if (it.noHost && !it.pipPieces?.length) continue;
    const t0 = r3(it.start), len = r3(Math.min(it.end, outDur) - it.start);
    if (len < 1 / 30) continue;
    const m = buildMain({ ...mainOpts, test: { t0, len }, cut: { kind: 'seg', id: it.id, keepFootage: !!it.side } });
    const file = `compositions/capcut-${it.id}.html`;
    comps.push({ file, html: m.html });
    const layout = it.side ? 'side' : it.opaque && it.pipPieces?.length ? 'pip' : it.opaque ? 'full' : 'overlay';
    const sfx = [it.sfx, ...(it.sfxExtra || [])].filter((c) => c && c.at >= t0 - 1e-6 && c.at < t0 + m.duration).length;
    segs.push({ id: it.id, file, label: it.label || it.id, layout, layoutZh: format === 'portrait' && layout === 'pip' ? '上下分割' : LAYOUT[layout],
      start: t0, end: r3(t0 + m.duration), duration: m.duration, footage: !!it.side, sfx });
  }
  const mm = buildMain({ ...mainOpts, test: { t0: 0, len: outDur }, cut: { kind: 'main' } });
  comps.push({ file: 'compositions/capcut-main.html', html: mm.html });
  let n = 0;
  const srt = formatSrt(captions.items.flatMap((c) => c.spans.map(([a, b]) => ({ n: ++n, start: a, end: b, text: c.text }))));
  return { comps, segs, main: { file: 'compositions/capcut-main.html', duration: mm.duration }, srt };
}

// ---------- --gallery ----------

// 直式預覽頁的講者示意圖 preview/speaker-v.jpg（1080×1920）：speaker.jpg（1920×1080）裁講者那一塊（寬 900，約講者框 × 1.3＝pipCrop auto 的裁法）
// 放大到 1080 寬，貼在 y 120，上下露出的部分用同一張圖模糊壓暗補滿。custom-preview 的講者面板用 object-position 50% 20%（顯示 y 180–1200），
// 這樣頭頂落在面板頂端下約 40 px（和 build 的 pipCrop "auto" 一樣）。speaker.jpg 的講者臉＋手勢在 x 780–1320，裁切中心取寬度的 53%；
// speaker-v.jpg 比 speaker.jpg 新就不重做。暗色主題用的 speaker-dark.jpg（書櫃版）同樣裁出 speaker-v-dark.jpg（kit/style-switch.js 換圖）
const SPEAKER_V = { cx: 0.53, fgH: 1296, top: 120 };
export function speakerPortrait(outDir, name = 'speaker') {
  const src = path.join(outDir, `${name}.jpg`), dst = path.join(outDir, name.replace(/^speaker/, 'speaker-v') + '.jpg');
  if (!fs.existsSync(src)) return {};
  if (fs.existsSync(dst) && fs.statSync(dst).mtimeMs >= fs.statSync(src).mtimeMs) return {};
  const m = probeMedia(src), { W, H } = canvasOf('portrait');
  const cw = Math.round((m.height * W) / SPEAKER_V.fgH / 2) * 2;
  const x = Math.max(0, Math.min(m.width - cw, Math.round(m.width * SPEAKER_V.cx - cw / 2)));
  const fc = `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=30:2,eq=brightness=-0.12[bg];`
    + `[0:v]crop=${cw}:${m.height}:${x}:0,scale=${W}:${SPEAKER_V.fgH}:flags=lanczos[fg];[bg][fg]overlay=0:${SPEAKER_V.top}`;
  const r = run('ffmpeg', ['-y', '-v', 'error', '-i', src, '-filter_complex', fc, '-frames:v', '1', '-q:v', '3', dst]);
  return r.status === 0 ? { made: dst } : { error: `preview/${path.basename(dst)} 產生失敗：${String(r.stderr).trim().slice(-200)}` };
}

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
    // 全寬版型示意（只有聲音的段沒有講者小視窗：主卡 1680）：04 家族各一張 <編號>-<key>-wide.html；有主視覺欄位的（04a）放筆電
    if (scene.family === 'fullscreen') {
      const wseg = { ...seg, slots: { ...seg.slots, ...(scene.slots?.visual ? { visual: 'laptop' } : {}) } };
      const w = resolveScene({ scene, seg: wseg, cues: [], icons: lib.icons, consts: lib.consts, t0: 0, D, where: `[預覽 ${scene.key} 全寬]` });
      if (w.errors.length) { problems.push(...w.errors); continue; }
      const wparts = sceneParts({ scene, ctx: w.ctx, beats: w.beats, id: 'pv', D, tone: null, exitFade: true });
      const wfile = path.join(outDir, `${scene.num}-${scene.key}-wide.html`);
      fs.writeFileSync(wfile, buildPreview({ scene, parts: wparts, D, sub: scene.sample?.sub, pipStyle, cues, wide: true }));
      made.push(wfile);
    }
  }
  // 第二層情境動畫（custom/x-*.html）的預覽頁：003 的 buildCustomPreview（還沒有時略過）
  const customDir = path.join(templateDir, 'custom');
  if (customPreview?.buildCustomPreview && fs.existsSync(customDir)) {
    for (const f of fs.readdirSync(customDir).filter((x) => /^x-[\w-]+\.html$/.test(x)).sort()) {
      const name = path.basename(f, '.html');
      if (only && !only.includes(name)) continue;
      try {
        const src = fs.readFileSync(path.join(customDir, f), 'utf8');
        const html = customPreview.buildCustomPreview({ name, html: src, pipStyle, kitLinks: KIT_LINKS });
        fs.writeFileSync(path.join(outDir, f), html);
        made.push(path.join(outDir, f));
        // 009 FR-073：直式預覽頁 x-<名稱>-v.html（1080×1920：上半舞台縮放的動畫、下半講者面板示意）
        const vFile = path.join(outDir, `${name}-v.html`);
        fs.writeFileSync(vFile, customPreview.buildCustomPreview({ name, html: src, kitLinks: KIT_LINKS, format: 'portrait' }));
        made.push(vFile);
      } catch (e) { problems.push(`custom/${f}：${e.message}`); }
    }
    for (const name of ['speaker', 'speaker-dark']) {
      const sv = speakerPortrait(outDir, name);
      if (sv.error) problems.push(sv.error);
      else if (sv.made) made.push(sv.made);
    }
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

// 詞級逐字稿：work/transcript.json（剪乾淨第 6 步對 rough.mp4 轉的，[{ text, start, end }]）。
// 不比 rough.mp4 舊、最後一個詞和 rough.srt 最後一句差 ≤ 2 秒才掛上 cues.words（#N@詞 用真實時間）；否則記原因在 cues.wordsWhy
export function attachWords(cues, { transcript, video = null } = {}) {
  cues.approx = new Set();
  if (!transcript || !fs.existsSync(transcript)) { cues.wordsWhy = '沒有 work/transcript.json（rough.mp4 的詞級逐字稿）'; return cues; }
  let words;
  try { words = JSON.parse(fs.readFileSync(transcript, 'utf8')); } catch { cues.wordsWhy = 'work/transcript.json 不是合法的 JSON'; return cues; }
  if (Array.isArray(words?.words)) words = words.words;
  if (!Array.isArray(words) || !words.length || !words.every((w) => w && typeof w.text === 'string' && Number.isFinite(+w.start) && Number.isFinite(+w.end))) { cues.wordsWhy = 'work/transcript.json 的格式不是 [{ text, start, end }]'; return cues; }
  if (!transcriptFresh(transcript, video)) { cues.wordsWhy = 'work/transcript.json 比 rough.mp4 舊（不是這支初剪轉的）'; return cues; }
  const lastW = Math.max(...words.map((w) => +w.end)), lastC = cues.length ? Math.max(...cues.map((c) => c.end)) : 0;
  if (Math.abs(lastW - lastC) > 2) { cues.wordsWhy = `work/transcript.json 的長度（${r3(lastW)}s）和 rough.srt（${r3(lastC)}s）對不上`; return cues; }
  cues.words = words.map((w) => ({ text: w.text, start: +w.start, end: +w.end })).sort((a, b) => a.start - b.start);
  return cues;
}

function loadInputs(P) {
  if (!fs.existsSync(P.plan)) throw new Error(`找不到 ${rel(P.plan)} → 先照「剪好看」第 3 步寫草稿 plan.json（格式見 shared/template/USAGE.md 3.2）`);
  let plan;
  try { plan = JSON.parse(fs.readFileSync(P.plan, 'utf8')); } catch (e) { throw new Error(`${rel(P.plan)} 不是合法的 JSON：${e.message}（JSON 不能有註解、最後一項後面不能有逗號）`); }
  if (!fs.existsSync(P.srt)) throw new Error(`找不到字幕 ${rel(P.srt)}`);
  const cues = parseSrt(fs.readFileSync(P.srt, 'utf8'));
  if (!cues.length) throw new Error(`${rel(P.srt)} 讀不到任何字幕句（格式要是 SRT）→ 照「剪乾淨」第 6 步重新產生 work/rough.srt`);
  attachWords(cues, { transcript: path.join(path.dirname(P.srt), 'transcript.json'), video: P.video });
  return { plan, cues };
}

function printIssues(res, log) {
  for (const e of res.errors) log(`✖ ${e}`);
  for (const w of res.warnings) log(`⚠ ${w}`);
}

// 剪接點：剪乾淨第 7 步存的 work/cutpoints.json（edit.joins 要對到這些點）
// 講者框是 1920×1080 座標；底片不是 1080p（例如 640×360 的手機錄影）而講者框整個落在底片尺寸內，多半是直接用底片截圖的像素量的
// 直式（canvas）：畫布 1080×1920，門檻照比例（寬 > 畫布寬 × 0.75 才算原尺寸）
export function speakerBoxScaleWarning(box, dims, C = canvasOf('landscape')) {
  if (!Array.isArray(box) || box.length !== 4 || !dims?.width || !dims?.height) return null;
  const { width: w, height: h } = dims;
  if ((w === C.W && h === C.H) || w > C.W * 0.75) return null;
  if (!(box[2] <= w && box[3] <= h)) return null;
  const k = C.W / w;
  const fixed = box.map((v) => Math.round(v * k));
  return `speakerBox ${JSON.stringify(box)} 整個落在 ${w}×${h} 以內，底片是 ${w}×${h}：看起來是用原尺寸截圖的像素量的，但 speakerBox 要寫 ${C.W}×${C.H} 座標 → 每個數字乘 ${r3(k)}（例：${JSON.stringify(fixed)}）；講者真的在左上角就忽略這則`;
}
// check.textSync false 只給示意／預覽用的 plan；寫在專案正式的 work/hyperframes/plan.json 就提醒
export function textSyncOffWarnings(P, plan) {
  if (plan?.check?.textSync !== false || !P.project) return [];
  if (path.resolve(P.plan) !== path.join(P.project, 'work', 'hyperframes', 'plan.json')) return [];
  return ['plan.json 寫了 "check": { "textSync": false }，這次沒檢查「文字對時」→ 這只給示意／預覽用的 plan；正式 plan.json 刪掉 check，照 --check 的「文字對時」改時間'];
}
const boxWarnings = (plan, file, C) => {
  try { const w = speakerBoxScaleWarning(plan.speakerBox, probeMedia(file), C); return w ? [w] : []; } catch { return []; }
};

export function readCutpoints(P) {
  const file = P.project ? path.join(P.project, 'work', 'cutpoints.json') : path.join(path.dirname(P.video), 'cutpoints.json');
  if (!fs.existsSync(file)) return { list: [], warnings: [] };
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    const list = (Array.isArray(j?.cuts) ? j.cuts : []).filter((c) => c && Number.isFinite(c.at)).map((c) => ({ at: +Number(c.at).toFixed(3), kind: c.kind === 'ng' ? 'ng' : 'pause' })).sort((a, b) => a.at - b.at);
    return { list, warnings: Array.isArray(j?.cuts) ? [] : ['work/cutpoints.json 沒有 "cuts" 陣列 → 格式是 { "cuts": [ { "at": 12.34, "kind": "ng" } ] }（AGENTS.md「剪乾淨」第 7 步）'] };
  } catch (e) {
    return { list: [], warnings: [`work/cutpoints.json 不是合法的 JSON：${e.message} → 照 AGENTS.md「剪乾淨」第 7 步重新產生`] };
  }
}

// 只有聲音的區間＝rough.mp4 全黑的地方（聲音檔接進主軌時配的純黑畫面）；結果快取在 work/hyperframes/.cache/
export function voiceOnlyOf(P, videoFile, log = () => {}) {
  return blackDetect(videoFile, path.join(P.out, '.cache', 'blackdetect.json'), () => log('偵測只有聲音的區間（rough.mp4 全黑的地方；第一次會花一點時間，之後用快取）…'));
}

// 專案有沒有只有聲音的主軌素材：assets/voice/ 有檔，或 work/main.json 有 kind "voice"／"screen"（邊錄邊講的螢幕錄影，主軌只取聲音）的段
export function hasVoiceSource(projectDir) {
  try { if (fs.readdirSync(path.join(projectDir, 'assets', 'voice')).some((x) => !x.startsWith('.'))) return true; } catch { /* 沒有資料夾 */ }
  try { return (JSON.parse(fs.readFileSync(path.join(projectDir, 'work', 'main.json'), 'utf8')).clips || []).some((c) => c.kind === 'voice' || c.kind === 'screen'); } catch { return false; }
}

// rough.mp4 有全黑區間、專案卻沒有只有聲音的素材 → 初剪壞了（auto-editor 剪手機原檔的已知問題），不能當成「只有聲音」默默拿掉小視窗
// → { voiceOnly（給 resolvePlan 用）, black（併好的全黑區間）, errors }；相鄰 ≤ 0.1 秒的黑段併成一段
export function roughBlackCheck(projectDir, voiceOnly, projectRel = 'projects/<專案>') {
  if (!projectDir || !voiceOnly?.length || !fs.existsSync(path.join(projectDir, 'assets')) || hasVoiceSource(projectDir)) return { voiceOnly: voiceOnly || [], black: [], errors: [] };
  const black = [];
  for (const [a, b] of [...voiceOnly].sort((x, y) => x[0] - y[0])) { const l = black[black.length - 1]; if (l && a - l[1] <= 0.1 + 1e-9) l[1] = Math.max(l[1], b); else black.push([a, b]); }
  const clock = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
  const where = black.map(([a, b]) => `${clock(a)}–${clock(b)}`).join('、');
  return { voiceOnly: [], black, errors: [`work/rough.mp4 在 ${where} 是全黑，但素材沒有純聲音檔 → 初剪壞了：跑 node shared/template/tools/media.mjs verify-rough --project ${projectRel}`] };
}

// media 段的 src 相對專案資料夾：有 --project 就用它；只給 --plan／--out 等路徑時，從 --out（<專案>/work/hyperframes）往上找有 assets/ 的資料夾
export function mediaRoot(P) {
  if (P.project) return P.project;
  for (const base of [P.out && path.resolve(P.out, '..', '..'), P.video && path.resolve(path.dirname(P.video), '..')]) {
    if (base && fs.existsSync(path.join(base, 'assets'))) return base;
  }
  return null;
}

const posix = (p) => p.split(path.sep).join('/');
const realish = (p) => { try { return fs.realpathSync(p); } catch { return p; } };
// 工作區根目錄底下就寫相對路徑（projects/example/…）；比對用 realpath（macOS 的 /var 其實是 /private/var）
const fromRoot = (P, p) => { const r = path.relative(realish(P.root), realish(p)); return r && !r.startsWith('..') && !path.isAbsolute(r) ? posix(r) : posix(p); };
// 訊息裡的專案寫法：在 projects/ 底下就寫 projects/<名稱>（工具從別處 symlink 過來時 root 對不到，也照樣好讀）
export const projectLabel = (P, dir) => (path.basename(path.dirname(dir)) === 'projects' ? `projects/${path.basename(dir)}` : fromRoot(P, dir));

// 插入素材：轉檔（30fps CFR、每秒一個關鍵影格、speed 做進檔案）／複製圖片／放大鏡逐格；簽章沒變就不重做，沒用到的舊檔刪掉
function prepareMedia(items, out, log) {
  const dir = path.join(out, 'assets', 'media');
  const idxFile = path.join(dir, 'index.json');
  let idx = {};
  try { idx = JSON.parse(fs.readFileSync(idxFile, 'utf8')); } catch { idx = {}; }
  const media = items.filter((x) => x.type === 'media');
  if (!media.length && !fs.existsSync(dir)) return 0;
  const next = {};
  let made = 0;
  for (const it of media) {
    const jobs = mediaJobs(it);
    const main = jobs.main;
    const abs = path.join(out, main.rel);
    const name = path.basename(main.rel);
    const key = JSON.stringify(main.key);
    if (!next[name]) {
      if (idx[name]?.key !== key || !fs.existsSync(abs)) {
        if (main.type === 'video') {
          log(`轉檔 ${it.media.src} → ${main.rel}（30fps、每秒一個關鍵影格${main.speed !== 1 ? `、×${main.speed}` : ''}）…`);
          encodeMedia(it.media.abs, abs, { speed: main.speed, keepAudio: main.keepAudio, width: main.w, height: main.h });
        } else if (main.type === 'still') {
          log(`定格 ${it.media.src} 第 ${main.at}s → ${main.rel}`);
          writeJpg({ w: main.w, h: main.h, data: rawFrame(it.media.abs, { at: main.at, width: main.w, height: main.h }) }, abs, 2);
        } else {
          fs.mkdirSync(dir, { recursive: true });
          fs.copyFileSync(it.media.abs, abs);
        }
        made++;
      }
      next[name] = { key };
    }
    for (const lj of jobs.lenses) {
      const L = lj.lens;
      const ldir = path.join(out, lj.dir);
      const lname = path.basename(lj.dir);
      const lkey = JSON.stringify(lj.key);
      let map = idx[lname]?.key === lkey ? idx[lname].map : null;
      const count = map ? Math.max(...map) + 1 : 0;
      const file = (i) => `${String(i + 1).padStart(4, '0')}.jpg`;
      if (!map || !Array.from({ length: count }, (_, i) => fs.existsSync(path.join(ldir, file(i)))).every(Boolean)) {
        fs.rmSync(ldir, { recursive: true, force: true });
        const tmp = path.join(ldir, '.tmp');
        const image = it.media.kind === 'image';
        const files = extractFrames({ file: abs, ranges: image ? [{ at: 0, frames: 1 }] : L.ranges, crop: L.crop, size: L.C, dir: tmp, image });
        // 同一張畫面（錄影停著不動）只留一份，map 記第幾格用第幾張
        const seen = new Map();
        map = files.map((f) => {
          const h = createHash('sha1').update(fs.readFileSync(f)).digest('hex');
          if (!seen.has(h)) { seen.set(h, seen.size); fs.copyFileSync(f, path.join(ldir, file(seen.size - 1))); }
          return seen.get(h);
        });
        fs.rmSync(tmp, { recursive: true, force: true });
        made++;
      }
      next[lname] = { key: lkey, map };
      L.map = map;
      L.urls = Array.from({ length: Math.max(...map) + 1 }, (_, i) => `${lj.dir}/${file(i)}`);
    }
  }
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (f !== 'index.json' && !f.startsWith('.') && !next[f]) fs.rmSync(path.join(dir, f), { recursive: true, force: true });
  if (media.length) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(idxFile, JSON.stringify(next, null, 2) + '\n'); }
  else if (fs.existsSync(idxFile)) fs.rmSync(idxFile);
  return made;
}

export function build(flags, { log = console.log } = {}) {
  const P = pathsFrom(flags);
  const json = !!(flags.check && flags.json);
  if (json) log = () => {};
  if (P.project) log(`專案：${rel(P.project)}`);
  const { plan, cues } = loadInputs(P);
  // 版式（009 FR-003）：--format > plan.json > 開工決策表 > 主軌寬高比；之後的幾何一律讀 canvas
  const fmt = resolveFormat({ projectDir: P.project, plan, flag: flags.format ?? null });
  const C = canvasOf(fmt.format);
  log(formatLine(fmt));
  const fmtErrors = formatErrors({ projectDir: P.project, plan, format: fmt.format, dims: fs.existsSync(P.video) ? probeDims(P.video) : null });
  // HyperFrames 版本（環境問題，只印這一行、不進 warnings；--check --json 看 versions）
  const hfv = hyperframesVersion(P.root);
  log(versionLine(hfv));
  const versions = { hyperframes: { pinned: hfv.pinned, installed: hfv.installed, ok: hfv.ok } };
  const lib = loadLib(P.templateDir);
  if (!lib.scenes.length) throw new Error(`找不到情境模板：${rel(path.join(P.templateDir, 'scenes'))}`);
  // 講者資料（shared/講者.json）：14 講者介紹的姓名、頭銜與 15 金句的出處預設值；沒設定就用 scene.json 的示範人物並提醒
  const speaker = readSpeaker(P.templateDir);
  lib.scenes = applySpeaker(lib.scenes, speaker);
  const planHash = createHash('sha1').update(fs.readFileSync(P.plan)).digest('hex').slice(0, 8);
  // 講者調光＋瘦臉（006 的 ensureLook）：build 才做；瘦臉底片過期而且能跑時丟錯停下來（裁決 D4，contracts/look.md §3；✖ 原文是 006 的）
  const look = !flags.check && P.project ? ensureLook({ projectDir: P.project, plan, log, templateDir: P.templateDir, strict: true }) : null;
  const footSrc = look && path.resolve(look.footage) !== path.resolve(P.project, 'work', 'rough.mp4') ? look.footage : P.video;
  const assetVideo = path.join(P.out, 'assets', 'rough.mp4');
  const cp = readCutpoints(P);
  // 聲音處理（響度標準化＋剪接點微淡化）的戳記：來源、剪接點、參數任一變了就重新編碼底片
  const audioOpts = { loudnorm: !flags['no-loudnorm'], declick: !flags['no-declick'] };
  const stampFile = path.join(P.out, '.cache', 'footage-audio.json');
  const stamp = readStamp(stampFile);
  const wantKey = fs.existsSync(footSrc) ? audioKey({ src: footSrc, cutpoints: cp.list.map((c) => c.at), ...audioOpts, frame: plan.frame ?? null, look: look?.key ?? null, format: C.format }) : null;
  const fresh = fs.existsSync(assetVideo) && (!fs.existsSync(footSrc) || (fs.statSync(assetVideo).mtimeMs >= fs.statSync(footSrc).mtimeMs && stampMatches(stamp, wantKey)));
  if (!fresh && !fs.existsSync(P.video)) throw new Error(`找不到影片 ${rel(P.video)}`);
  const projectDir = mediaRoot(P);
  const projectRel = projectDir ? projectLabel(P, projectDir) : 'projects/<專案>';
  const ctx = (videoDur, voiceOnly) => ({ plan, cues, videoDur, lib, outDir: P.out, sfxDir: P.sfx, projectDir, voiceOnly, cutpoints: cp.list, projectRel, canvas: C });

  // --check：不寫檔（只寫偵測快取）
  if (flags.check) {
    const src = fresh ? assetVideo : P.video;
    // 和 build 同一個長度：不超過 rough.mp4（重新編碼的音軌尾巴可能多約 0.1s）
    const videoDur = floorFrame(src === P.video || !fs.existsSync(P.video) ? probeDuration(src) : Math.min(probeDuration(src), probeDuration(P.video)));
    const rb = roughBlackCheck(projectDir, voiceOnlyOf(P, fs.existsSync(P.video) ? P.video : assetVideo, log), projectRel);
    const voiceOnly = rb.voiceOnly;
    const res = resolvePlan(ctx(videoDur, voiceOnly));
    const spk = speakerIssues(speaker, res);
    res.errors.unshift(...fmtErrors, ...rb.errors, ...styleErrors(P, res), ...spk.errors);
    const capW = captionWarnings(cues, C);
    res.warnings.unshift(...cp.warnings, ...boxWarnings(plan, src, C), ...textSyncOffWarnings(P, plan), ...spk.warnings);
    if (P.project && res.tm) {
      const lc = lookCheck({ projectDir: P.project, plan, templateDir: P.templateDir });
      res.errors.push(...lc.errors.filter((e) => !res.errors.includes(e)));
      // C-14 的決定：「build 會停下來：…」在 --check 維持 ⚠（--check 檢查的是 plan.json；check-json.md §2.7）
      res.warnings.push(...lc.warnings);
    }
    const clip = outroClipOf(res, P);
    if (json) {
      const top = res.tm ? jsonTop(res, { clip }) : jsonTop({ theme: res.theme }, {});
      const report = {
        schema: 2, ok: !res.errors.length, errors: res.errors, warnings: [...res.warnings, ...capW],
        planHash, rhythm: top.rhythm, theme: top.theme, format: C.format, canvas: [C.W, C.H], formatSource: fmt.source, versions,
        videoDur, outputDur: res.outDur ?? videoDur,
        voiceOnly, roughBlack: rb.black, voiceUncovered: top.voiceUncovered, uncovered: top.uncovered, cutpoints: cp.list, chapters: top.chapters,
        items: res.tm ? jsonItems(res) : [],
        sfxCount: top.sfxCount, sfxBudget: top.sfxBudget, outro: top.outro,
        edit: res.edit ?? DEFAULT_EDIT(),
        paths: { project: projectDir ? projectLabel(P, projectDir) : null, video: fromRoot(P, fs.existsSync(P.video) ? P.video : src), plan: fromRoot(P, P.plan), out: fromRoot(P, P.out) },
      };
      return { ok: report.ok, res, json: report };
    }
    printIssues(res, log);
    for (const w of capW) log(`⚠ ${w}`);
    log('', formatReport(res, { videoDur, tail: [outroLine(res.outro, clip)] }));
    log(res.errors.length ? `\n未通過：${res.errors.length} 個錯誤（✖），${res.warnings.length + capW.length} 個提醒（⚠）。照 → 後面的建議改 plan.json 再跑一次。` : `\n通過：${res.items.length} 段，${res.warnings.length + capW.length} 個提醒（⚠）。`);
    return { ok: !res.errors.length, res };
  }

  // 構圖裁切 plan.frame＝[x, y, w, h]（畫布座標：橫式 1920×1080、16:9；直式 1080×1920、9:16）→ 換成來源影片的像素
  function frameCrop(pl, src) {
    if (!Array.isArray(pl.frame)) return null;
    const m = probeMedia(src), k = (m.width || C.W) / C.W, ev = (v) => Math.round(v * k / 2) * 2;
    const [x, y, w, h] = pl.frame;
    return { x: ev(x), y: ev(y), w: ev(w), h: ev(h) };
  }
  // 底片：專案的 work/rough.mp4 比較新才重新編碼
  let encoded = false, audioInfo = null;
  if (look) for (const l of look.report) log(l);
  if (!fresh) {
    log(`重新編碼底片 → ${rel(assetVideo)}（30fps、每秒一個關鍵影格${audioOpts.loudnorm ? '、人聲調到 −14 LUFS' : ''}${audioOpts.declick && cp.list.length ? '、剪接點微淡化' : ''}）…`);
    audioInfo = encodeFootagePolished(footSrc, assetVideo, { cacheDir: path.join(P.out, '.cache'), cutpoints: cp.list.map((c) => c.at), ...audioOpts, crop: frameCrop(plan, footSrc), lut: look?.lut ?? null, canvas: C,
      onMeasure: () => log('量人聲響度（第一次會花一點時間，之後用快取）…') });
    fs.mkdirSync(path.dirname(stampFile), { recursive: true });
    fs.writeFileSync(stampFile, JSON.stringify({ key: wantKey, info: audioInfo }, null, 2) + '\n');
    encoded = true;
  } else if (stamp?.info) audioInfo = stamp.info;   // 沒重新編碼：報告用上次的數字
  const rawDur = probeDuration(assetVideo);
  // 完成影片長度不超過 rough.mp4：人聲響度標準化（loudnorm）會讓音軌尾巴多約 0.1s，容器長度跟著變長，最後幾格會沒有畫面
  const srcDur = fs.existsSync(P.video) ? probeDuration(P.video) : rawDur;
  const videoDur = floorFrame(Math.min(rawDur, srcDur));
  if (encoded) {
    const drift = r3(rawDur - srcDur);
    log(`底片長度：原檔 ${r3(srcDur)}s → 重新編碼 ${r3(rawDur)}s（差 ${drift}s）${Math.abs(drift) > 0.1 ? ' ⚠ 差超過 0.1s，字幕可能對不準' : ''}`);
  }
  const rb = roughBlackCheck(projectDir, voiceOnlyOf(P, fs.existsSync(P.video) ? P.video : assetVideo, log), projectRel);
  const res = resolvePlan(ctx(videoDur, rb.voiceOnly));
  const spk = speakerIssues(speaker, res);
  res.errors.unshift(...fmtErrors, ...rb.errors, ...styleErrors(P, res), ...spk.errors);
  res.warnings.unshift(...cp.warnings, ...boxWarnings(plan, assetVideo, C), ...textSyncOffWarnings(P, plan), ...spk.warnings);
  // 人聲響度、音效比例（005 的 sfxBudget）、剪接點微淡化；音效比例的 ⚠ 已在 warnings 裡就不重印
  for (const l of audioReportLines(audioInfo, { ...audioOpts, cutpointsExist: cp.list.length > 0, sfx: res.sfxBudget })) {
    if (!(l.startsWith('⚠ ') && res.warnings.includes(l.slice(2)))) log(l);
  }
  printIssues(res, log);
  for (const w of captionWarnings(cues, C)) log(`⚠ ${w}`);
  if (res.errors.length) {
    log(`\n未通過：${res.errors.length} 個錯誤，沒有產生任何檔案。照 → 後面的建議改 plan.json 再跑一次。`);
    return { ok: false, res };
  }
  const outDur = res.outDur;
  const capCues = res.cuesOut;

  // 產生內容（先全部組好，組不出來就不寫檔）
  const files = [];
  for (const it of res.items) {
    if (it.type !== 'scene' || it.noHost) continue;   // noHost：02 章節角標段由常駐角標取代（音效照放）
    try {
      const a = assembleScene({ scene: it.scene, ctx: it.resolved.ctx, beats: it.resolved.beats, id: it.id, D: it.D, tone: it.resolved.tone, exitFade: it.exitFade, chapter: it.chapter, css: it.seg.css || '', chtag: !!it.seg.chtag && !res.chapterBadge, prev: it.prev, format: C.format });
      files.push([a.file, a.html]);
    } catch (e) { res.errors.push(`${it.where} ${e.message}`); }
  }
  if (res.errors.length) { printIssues({ errors: res.errors.slice(-1), warnings: [] }, log); return { ok: false, res }; }
  const fxDir = path.join(P.templateDir, 'fx', 'effects');
  const fxUsed = [...new Set(res.items.filter((x) => x.type === 'fx').map((x) => x.fxDef.fileName))];
  for (const f of fxUsed) files.push([`compositions/${f}`, fs.readFileSync(path.join(fxDir, f), 'utf8')]);
  if (fxUsed.length) {
    const kit = fs.readFileSync(path.join(fxDir, 'fx-kit.js'), 'utf8');
    files.push(['compositions/fx-kit.js', kit]);
    // 字卡動態裡寫的是相對路徑 fx-kit.js：render 以子合成檔的位置解析（compositions/），HyperFrames 播放器以專案根目錄解析，兩處都放
    files.push(['fx-kit.js', kit]);
  }
  const cap = buildCaptions(capCues, { duration: outDur, blackout: res.blackout || [], canvas: C });
  files.push([cap.file, cap.html]);
  const bgOne = fs.existsSync(path.join(P.templateDir, 'bg.jpg'));
  // 風格包（plan.json "style"）：包裡有的檔先用，沒有的退回 shared/template/ 目前那一份
  const pack = res.style ? packDir(P.templateDir, res.style) : null;
  const localDesign = appliedDesign(P.project);
  const srcOf = (f) => (localDesign && fs.existsSync(path.join(localDesign.dir, f)) ? path.join(localDesign.dir, f) : pack && fs.existsSync(path.join(pack, f)) ? path.join(pack, f) : path.join(P.templateDir, f));
  if (localDesign) log(`本集風格：work/design/drafts/${localDesign.id}（主色 ${localDesign.color}）`);
  const has = (f) => fs.existsSync(srcOf(f));
  // 暗色（plan.json "theme": "dark"）先用 bg-*-dark.jpg；沒有那張就退回亮色那張並 ⚠
  const dark = res.theme === 'dark';
  const bgMissDark = [];
  const bgPick = (f) => {
    const d = f.replace(/\.jpg$/, '-dark.jpg');
    if (dark && has(d)) return d;
    if (dark) bgMissDark.push(d);
    return has(f) ? f : bgOne ? 'bg.jpg' : null;
  };
  const bgMap = { fs: bgPick('bg-fs.jpg'), side: bgPick('bg-side.jpg'), ch: bgPick('bg-ch.jpg') };
  if (pack) {
    const own = [...PACK_KIT, ...Object.values(bgMap).filter(Boolean)].filter((f) => fs.existsSync(path.join(pack, f)));
    const miss = [...PACK_KIT, ...Object.values(bgMap).filter(Boolean)].filter((f) => !fs.existsSync(path.join(pack, f)));
    log(`風格包：${res.style}（shared/template/styles/${res.style}/：${own.join('、') || '沒有檔'}${miss.length ? `；${miss.join('、')} 用 shared/template/ 目前的` : ''}）`);
  }
  const bg = bgMap.fs || bgMap.side || bgMap.ch ? bgMap : false;
  if (dark) log(`主題：暗色（plan.json "theme": "dark"）：背景 ${Object.values(bgMap).filter(Boolean).join('、') || '無'}；主合成與每個子合成的 <html> 加 data-theme="dark"`);
  if (bgMissDark.length && pack) log(`⚠ 暗色背景圖 ${bgMissDark.map((f) => `shared/template/styles/${res.style}/${f}`).join('、')} 不存在，先用亮色那張 → 暗色三張補進這個風格包，或這支改回亮色`);
  else if (bgMissDark.length) log(`⚠ 暗色背景圖 ${bgMissDark.map((f) => `shared/template/${f}`).join('、')} 不存在，先用亮色那張 → 換風格時暗色三張一起放進 shared/template/`);
  // 插入素材的檔（放大鏡的逐格要先抽好，主合成才知道每一格用哪一張）
  const mediaN = prepareMedia(res.items, P.out, log);
  // 結尾配樂：量 wav 長度決定起播點，淡入淡出與增益烤進檔案（005 的 renderBgmClip，同參數不重做）
  const clip = outroClipOf(res, P);
  let outro = null;
  if (clip) {
    const r = renderBgmClip(path.join(P.sfx, `${res.outro.music}.wav`), path.join(P.out, 'assets'), { from: clip.from, dur: clip.dur, fadeIn: clip.fadeIn, fadeOut: clip.fadeOut, gain: clip.gain });
    outro = { file: posix(path.relative(P.out, r.file)), at: clip.at, dur: r.dur };
  }
  const mainOpts = { items: res.items, videoDur: outDur, pip: res.globals.pip, sideShift: res.globals.sideShift, bg, footage: res.footage, editFx: res.editFx, cues: res.cuesOut, outro, badges: res.badges || [], canvas: C };
  const main = buildMain({ ...mainOpts, captions: cap });
  let test = null;
  if (flags.test) {
    const m = String(flags.test).match(/^\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*$/);
    if (!m) throw new Error('--test 要寫成「起點,秒數」，例如 --test 41,4');
    const t0 = Number(m[1]), len = Number(m[2]);
    if (t0 >= outDur) throw new Error(`--test 起點 ${t0}s 超過影片長度 ${outDur}s`);
    const capT = buildCaptions(capCues, { duration: r3(Math.min(len, outDur - t0)), offset: t0, compId: 'captions-test', blackout: res.blackout || [], canvas: C });
    files.push([capT.file, capT.html]);
    test = buildMain({ ...mainOpts, captions: capT, test: { t0, len } });
    test.t0 = t0;
  }
  // 剪映素材（--capcut）：每段一支透明底的合成（時間窗＝那一段），加一支主軌；render 交給 capcut.mjs
  const capcut = flags.capcut ? capcutParts(res, { mainOpts, outDur, captions: cap, format: C.format }) : null;
  if (capcut) for (const c of capcut.comps) files.push([c.file, c.html]);
  // 暗色：主合成、測試片段、build 產生的子合成（情境、字卡動態、字幕）都加 data-theme="dark"；情境動畫 x-*.html 不是 build 產生的，跟著主合成的 <html> 走
  if (dark) {
    for (const e of files) if (e[0].endsWith('.html')) e[1] = withTheme(e[1], 'dark');
    main.html = withTheme(main.html, 'dark');
    if (test) test.html = withTheme(test.html, 'dark');
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
      throw new Error(`${rel(idx)} 被手改過（可能是舊專案在 Studio 存檔）：把想要的改動搬進 plan.json（時間、slots、css），再加 --force 重跑；直接覆寫會蓋掉手改`);
    }
  }

  // 寫檔（完成影片的資料夾先建好，render 的 -o 才寫得進去）
  fs.mkdirSync(P.out, { recursive: true });
  if (P.project) for (const d of OUTPUT_DIRS) fs.mkdirSync(path.join(P.project, d), { recursive: true });
  // kit 的畫廊與給工人看的風格說明不進專案（illus-gallery.jpg 1.7 MB）；illus.js／illus.css 照常複製
  const kitSkip = ['icons.json', 'illus-gallery.html', 'illus-gallery.jpg', 'illus-style.md', 'style-switch.js'];
  let kitN = copyDir(path.join(P.templateDir, 'kit'), path.join(P.out, 'kit'), [...kitSkip, ...PACK_KIT]);
  // 主色與外框：風格包的（沒有就 shared/template/kit/ 的）；比內容，換包時同樣大小的 brand.css 也會換
  for (const f of PACK_KIT) {
    const src = localDesign && fs.existsSync(path.join(localDesign.dir, f)) ? path.join(localDesign.dir, f) : pack && fs.existsSync(path.join(pack, f)) ? path.join(pack, f) : path.join(P.templateDir, 'kit', f);
    if (fs.existsSync(src) && copyIfDiff(src, path.join(P.out, 'kit', f))) kitN++;
  }
  if (fs.existsSync(P.sfx)) for (const f of fs.readdirSync(P.sfx).filter((x) => x.endsWith('.wav'))) copyIfChanged(path.join(P.sfx, f), path.join(P.out, 'assets', 'sfx', f));
  if (hfShim(P.out)) log('專案在工作區外面：寫了 work/hyperframes/node_modules/.bin/hyperframes，npx hyperframes 會用工作區釘住的版本');
  if (bg) for (const f of new Set(Object.values(bg).filter(Boolean))) copyIfDiff(srcOf(f), path.join(P.out, 'assets', f));
  const generated = new Set();
  for (const [f, c] of files) { W.write(f, c); generated.add(f); }
  W.write('index.html', main.html); generated.add('index.html');
  // index.html 的修改時間＝最後一次 build：內容沒變也更新時間（剪輯台「完成影片預覽是舊的」、audit、status、qc 都拿它和 plan.json 比；
  //   剪輯台存檔時已經重新產生過，再跑 build 不重寫 index.html，舊時間會讓它們誤報「plan.json 比 index.html 新」）
  if (W.res.same.includes('index.html')) { const now = new Date(); fs.utimesSync(path.join(P.out, 'index.html'), now, now); }
  if (test) { W.write(TEST_FILE, test.html); generated.add(TEST_FILE); }
  if (capcut) {
    fs.writeFileSync(path.join(P.out, 'capcut.json'), JSON.stringify({ v: 1, planHash, format: C.format, duration: outDur, segs: capcut.segs, main: capcut.main }, null, 2) + '\n');
    fs.writeFileSync(path.join(P.out, 'capcut.srt'), capcut.srt);
  }
  // 舊的產生檔（plan 拿掉的段）：沒被手改才刪
  const removed = [];
  for (const f of Object.keys(manifest.files)) {
    if (generated.has(f) || [TEST_FILE, 'compositions/captions-test.html'].includes(f) || CAPCUT_RE.test(f)) continue;
    const abs = path.join(P.out, f);
    if (!fs.existsSync(abs)) { delete manifest.files[f]; continue; }
    if (W.isUntouched(f, fs.readFileSync(abs, 'utf8'))) { fs.unlinkSync(abs); delete manifest.files[f]; removed.push(f); }
  }
  manifest.planHash = planHash;   // 和 --check --json 的 planHash 相同（004 的 qc storyboard 用來判斷截圖是不是最新的）
  fs.writeFileSync(path.join(P.out, '.build-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  log('', formatReport(res, { videoDur, tail: [outroLine(res.outro, clip)] }));
  log(`\n產生：${W.res.written.length} 個檔（沒變 ${W.res.same.length}）；kit 更新 ${kitN} 個檔${mediaN ? `；插入素材更新 ${mediaN} 個` : ''}${removed.length ? `；刪掉舊檔 ${removed.join('、')}` : ''}`);
  if (W.res.skipped.length) log(`⚠ 這些檔被手改過，沒有覆寫：${W.res.skipped.join('、')} → 把改動搬進 plan.json 後加 --force`);
  if (test) {
    const clip = path.relative(P.out, path.join(P.project || path.resolve(P.out, '..', '..'), 'output', 'test-clips', 'test-clip.mp4')).split(path.sep).join('/');
    log(`測試片段：${rel(path.join(P.out, TEST_FILE))}（${test.t0}s 起 ${test.duration}s）→ cd ${rel(P.out)} && npx hyperframes render -c ${TEST_FILE} --quality draft -o ${clip}`);
    for (const it of test.skipped) log(`⚠ ${it.id} 在 ${it.start}s 就開始了，測試片段不含這段（要看完整段，把起點改成 ${it.start}）`);
  }
  // FR-032：字幕保留帶照版式（直式 y 1280–1420，不是畫面底部）；USAGE 2 第 8 步照這一行跑
  log(`字幕保留帶檢查：cd ${rel(P.out)} && npx hyperframes check --caption-zone "${captionZoneArg(C)}"`);
  return { ok: true, res, written: W.res.written, skipped: W.res.skipped, removed };
}

async function cli() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*\n?/, '').replace(/^ \* ?/gm, '')); return 0; }
  const P = pathsFrom(flags, process.cwd(), { needProject: !flags.list && !flags.gallery });
  if (flags.list) {
    const lib = loadLib(P.templateDir);
    if (flags.json) console.log(JSON.stringify({ sounds: Object.fromEntries(Object.entries(lib.sfx).map(([k, v]) => [k, { ...v, file: `shared/sfx/${k}.wav`, exists: fs.existsSync(path.join(P.sfx, `${k}.wav`)) }])), scenes: lib.scenes.map(({ template, dir, ...s }) => s), fx: lib.fx.map(({ file, ...f }) => f),
      media: { keys: MEDIA_KEYS, fields: MEDIA_FIELDS.map(([field, values, dflt, note]) => ({ field, values, default: dflt, note })) } }, null, 2));
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
  if (r.json) console.log(JSON.stringify(r.json, null, 2));
  return r.ok ? 0 : 1;
}

// --check --json 出錯時也印齊 schema 2 的鍵（specs/contracts/check-json.md §5）
export function errorJson(message) {
  return { schema: 2, ok: false, errors: [message], warnings: [], planHash: null, rhythm: null, theme: null, format: null, canvas: null, formatSource: null,
    versions: { hyperframes: { pinned: null, installed: null, ok: false } },
    videoDur: null, outputDur: null, voiceOnly: [], roughBlack: [], voiceUncovered: [], uncovered: [], cutpoints: [],
    chapters: [], items: [], sfxCount: {}, sfxBudget: { perMinuteAvg: 0, over: [], dense: [], loud: [] },
    outro: null, edit: null, paths: {} };
}

// 結尾配樂的起播點：量 shared/sfx/<music>.wav 的長度（一次 ffprobe）
function outroClipOf(res, P) {
  if (!res.outro?.music) return null;
  const f = path.join(P.sfx, `${res.outro.music}.wav`);
  if (!fs.existsSync(f)) return null;
  return outroClip(res.outro, probeDuration(f), res.outDur);
}

// 用 realpath 比對：從 symlink 路徑執行時（例如 shared/template 是連結）也要跑，不能靜默 exit 0
const isMain = () => {
  try { return !!process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
};
if (isMain()) {
  const wantJson = process.argv.includes('--json') && process.argv.includes('--check');
  cli().then((code) => { process.exitCode = code; }, (e) => {
    // --check --json：出錯也只印 JSON（剪輯台讀 stdout）
    if (wantJson) console.log(JSON.stringify(errorJson(e.message), null, 2));
    else console.error(`✖ ${e.message}`);
    process.exitCode = 1;
  });
}
