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
 *   node shared/template/tools/build.mjs --force      覆寫手改過的產生檔
 *   node shared/template/tools/build.mjs --no-loudnorm  重新編碼底片時不做人聲響度標準化（預設調到 −14 LUFS、true peak ≤ −1 dBTP）
 *   node shared/template/tools/build.mjs --no-declick   重新編碼底片時不在剪接點（work/cutpoints.json）做 15 ms 微淡化
 *   node shared/template/tools/build.mjs --gallery    （作者用）重新產生 shared/template/preview/*.html
 *
 * --project：專案資料夾（projects/範例，或只寫名稱 範例）。沒寫時：目前資料夾在某個專案裡就用它；
 *   projects/ 底下只有一個專案就用那個；都不是就報錯並列出現有專案。
 * 路徑旗標（選填，相對目前資料夾，會蓋過 --project 的預設）：--plan --srt --video --out --sfx；測試用：--template <shared/template 資料夾>
 * 需要 Node 22 以上、ffmpeg／ffprobe（npx hyperframes doctor 會檢查）。
 * 也會讀：work/cutpoints.json（剪接點，edit.joins 對照用，重新編碼底片時也在這些點做微淡化）；rough.mp4 全黑的區間＝只有聲音（ffmpeg blackdetect，快取在 work/hyperframes/.cache/）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseSrt } from './lib/srt.mjs';
import { floorFrame, r3 } from './lib/time.mjs';
import { loadScenes, loadIcons, loadFx, motionConsts, resolveScene, sampleSeg } from './lib/scenes.mjs';
import { assembleScene, sceneParts, hashOf, verifyHash } from './lib/assemble.mjs';
import { buildCaptions, captionWarnings } from './lib/captions.mjs';
import { resolvePlan, formatReport, pipGeometry, sceneSfxCues, jsonItems } from './lib/plan.mjs';
import { buildMain, buildPreview } from './lib/main.mjs';
import { probeDuration, probeMedia, encodeFootage, encodeMedia, blackDetect, extractFrames } from './lib/ff.mjs';
import { mediaJobs, MEDIA_KEYS, TRANSITIONS } from './lib/media.mjs';
import { DEFAULT_EDIT } from './lib/edit.mjs';
import { encodeFootagePolished, audioKey, readStamp, stampMatches, audioReportLines } from './lib/audio.mjs';

export { probeDuration, encodeFootage };

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEST_FILE = 'compositions/test-clip.html';
const OUTPUT_DIRS = ['成片', path.join('成片', '測試片段'), path.join('成片', '驗收截圖')];
const VALUE_FLAGS = ['project', 'plan', 'srt', 'video', 'out', 'sfx', 'template', 'test', 'only'];

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
    } else if (['check', 'list', 'json', 'force', 'gallery', 'help', 'no-loudnorm', 'no-declick'].includes(k)) flags[k] = true;
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
  lines.push('', '# 插入素材（"type": "media"：螢幕錄影或圖片，整張幕＋右下角子母畫面；用法見 shared/template/USAGE.md 第 5 節）', '',
    '| 欄位 | 值 | 預設 | 說明 |', '|---|---|---|---|');
  for (const r of MEDIA_FIELDS) lines.push(`| ${r[0]} | ${r[1]} | ${r[2]} | ${r[3]} |`);
  return lines.join('\n');
}

// --list 的 media 欄位表（文字與 --json 共用）
export const MEDIA_FIELDS = [
  ['src', '"素材/螢幕錄影/<檔名>" 或 "素材/圖片/<檔名>"', '必填', `相對專案資料夾；影片 .mp4 .mov .m4v .webm、圖片 .jpg .jpeg .png .webp（先跑 media.mjs scan）`],
  ['from／to／duration／anchor', '同其他段', 'to 或 duration 必填', 'rough.srt 的句號或秒數'],
  ['in', '秒數', '0', '錄影從第幾秒開始播；in＋段長×speed 不能超過錄影長度'],
  ['speed', '0.5–4', '1', '播放速度（2＝兩倍速）'],
  ['fit', '"contain"／"cover"', '"contain"', 'contain＝整張看得到、放在字幕帶上方，空白處是主題深底或 bg.jpg；cover＝鋪滿畫面'],
  ['pip', 'true／false', 'true', '右下角子母畫面露臉；只有聲音的區間自動不放'],
  ['volume', 'null 或 −60～+12（dB）', 'null', 'null＝素材靜音；寫數字＝保留素材原聲'],
  ['enter／exit', TRANSITIONS.map((x) => `"${x}"`).join('／'), '"fade"', '進場／出場；接在別的整張幕後面時 fade 自動變 cut'],
  ['moves', '[{ "at", "to": [x,y,w,h] 或 "full", "dur" }]', '—', '運鏡：推近到框、"full" 拉回全景；dur 預設 1 秒。圖片沒寫 moves 時自動慢推（"kenburns": false 關掉）'],
  ['marks', '[{ "at", "until", "box": [x,y,w,h] }]', '—', '紅框：實線 4px、描線進場；同時最多 2 個、停留 < 0.5s 的拿掉、最後一框多停 1s；until 不寫＝到段尾'],
  ['lens', '[{ "at", "until", "box": [x,y,w,h], "zoom" }]', '—', '放大鏡：從框的位置彈出到畫面中央偏上，zoom 預設 2（1.2–4）；至少 1.2 秒，until 不寫＝at＋3 秒'],
  ['sfx', '音效名稱或 null', '不配', '從講者切到錄影的第一段建議 "whoosh"'],
  ['sfxVolume', '−60～+12（dB）', '0', '這段音效的音量（每一種段落都能寫）'],
];

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
  if (!fs.existsSync(P.plan)) throw new Error(`找不到 ${rel(P.plan)}：先寫 plan.json（格式見 shared/template/USAGE.md）`);
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

// 剪接點：剪乾淨第 7 步存的 work/cutpoints.json（edit.joins 要對到這些點）
// 講者框是 1920×1080 座標；底片不是 1080p（例如 640×360 的手機錄影）而講者框整個落在底片尺寸內，多半是直接用底片截圖的像素量的
export function speakerBoxScaleWarning(box, dims) {
  if (!Array.isArray(box) || box.length !== 4 || !dims?.width || !dims?.height) return null;
  const { width: w, height: h } = dims;
  if ((w === 1920 && h === 1080) || w > 1440) return null;
  if (!(box[2] <= w && box[3] <= h)) return null;
  const k = 1920 / w;
  const fixed = box.map((v) => Math.round(v * k));
  return `speakerBox ${JSON.stringify(box)} 整個落在 ${w}×${h} 以內，底片是 ${w}×${h}：看起來是用原尺寸截圖的像素量的，但 speakerBox 要寫 1920×1080 座標 → 每個數字乘 ${r3(k)}（例：${JSON.stringify(fixed)}）；講者真的在左上角就忽略這則`;
}
const boxWarnings = (plan, file) => {
  try { const w = speakerBoxScaleWarning(plan.speakerBox, probeMedia(file)); return w ? [w] : []; } catch { return []; }
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

// media 段的 src 相對專案資料夾：有 --project 就用它；只給 --plan／--out 等路徑時，從 --out（<專案>/work/hyperframes）往上找有 素材/ 的資料夾
export function mediaRoot(P) {
  if (P.project) return P.project;
  for (const base of [P.out && path.resolve(P.out, '..', '..'), P.video && path.resolve(path.dirname(P.video), '..')]) {
    if (base && fs.existsSync(path.join(base, '素材'))) return base;
  }
  return null;
}

const posix = (p) => p.split(path.sep).join('/');
const realish = (p) => { try { return fs.realpathSync(p); } catch { return p; } };
// 工作區根目錄底下就寫相對路徑（projects/範例/…）；比對用 realpath（macOS 的 /var 其實是 /private/var）
const fromRoot = (P, p) => { const r = path.relative(realish(P.root), realish(p)); return r && !r.startsWith('..') && !path.isAbsolute(r) ? posix(r) : posix(p); };
// 訊息裡的專案寫法：在 projects/ 底下就寫 projects/<名稱>（工具從別處 symlink 過來時 root 對不到，也照樣好讀）
export const projectLabel = (P, dir) => (path.basename(path.dirname(dir)) === 'projects' ? `projects/${path.basename(dir)}` : fromRoot(P, dir));

// 插入素材：轉檔（30fps CFR、每秒一個關鍵幀、speed 做進檔案）／複製圖片／放大鏡逐幀；簽章沒變就不重做，沒用到的舊檔刪掉
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
          log(`轉檔 ${it.media.src} → ${main.rel}（30fps、每秒一個關鍵幀${main.speed !== 1 ? `、×${main.speed}` : ''}）…`);
          encodeMedia(it.media.abs, abs, { speed: main.speed, keepAudio: main.keepAudio, width: main.w, height: main.h });
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
  const lib = loadLib(P.templateDir);
  if (!lib.scenes.length) throw new Error(`找不到情境模板：${rel(path.join(P.templateDir, 'scenes'))}`);
  const { plan, cues } = loadInputs(P);
  const assetVideo = path.join(P.out, 'assets', 'rough.mp4');
  const cp = readCutpoints(P);
  // 聲音處理（響度標準化＋剪接點微淡化）的戳記：來源、剪接點、參數任一變了就重新編碼底片
  const audioOpts = { loudnorm: !flags['no-loudnorm'], declick: !flags['no-declick'] };
  const stampFile = path.join(P.out, '.cache', 'footage-audio.json');
  const stamp = readStamp(stampFile);
  const wantKey = fs.existsSync(P.video) ? audioKey({ src: P.video, cutpoints: cp.list.map((c) => c.at), ...audioOpts }) : null;
  const fresh = fs.existsSync(assetVideo) && (!fs.existsSync(P.video) || (fs.statSync(assetVideo).mtimeMs >= fs.statSync(P.video).mtimeMs && stampMatches(stamp, wantKey)));
  if (!fresh && !fs.existsSync(P.video)) throw new Error(`找不到影片 ${rel(P.video)}`);
  const projectDir = mediaRoot(P);
  const projectRel = projectDir ? projectLabel(P, projectDir) : 'projects/<專案>';
  const ctx = (videoDur, voiceOnly) => ({ plan, cues, videoDur, lib, outDir: P.out, sfxDir: P.sfx, projectDir, voiceOnly, cutpoints: cp.list, projectRel });

  // --check：不寫檔（只寫偵測快取）
  if (flags.check) {
    const src = fresh ? assetVideo : P.video;
    const videoDur = floorFrame(probeDuration(src));
    const voiceOnly = voiceOnlyOf(P, fs.existsSync(P.video) ? P.video : assetVideo, log);
    const res = resolvePlan(ctx(videoDur, voiceOnly));
    const capW = captionWarnings(cues);
    res.warnings.unshift(...cp.warnings, ...boxWarnings(plan, src));
    if (json) {
      const report = {
        ok: !res.errors.length, errors: res.errors, warnings: [...res.warnings, ...capW],
        videoDur, outputDur: res.outDur ?? videoDur,
        voiceOnly, cutpoints: cp.list,
        items: res.tm ? jsonItems(res) : [],
        edit: res.edit ?? DEFAULT_EDIT(),
        paths: { project: projectDir ? projectLabel(P, projectDir) : null, video: fromRoot(P, fs.existsSync(P.video) ? P.video : src), plan: fromRoot(P, P.plan), out: fromRoot(P, P.out) },
      };
      return { ok: report.ok, res, json: report };
    }
    printIssues(res, log);
    for (const w of capW) log(`⚠ ${w}`);
    log('', formatReport(res, { videoDur }));
    log(res.errors.length ? `\n未通過：${res.errors.length} 個錯誤（✖），${res.warnings.length + capW.length} 個提醒（⚠）。照 → 後面的建議改 plan.json 再跑一次。` : `\n通過：${res.items.length} 段，${res.warnings.length + capW.length} 個提醒（⚠）。`);
    return { ok: !res.errors.length, res };
  }

  // 底片：專案的 work/rough.mp4 比較新才重新編碼
  let encoded = false, audioInfo = null;
  if (!fresh) {
    log(`重新編碼底片 → ${rel(assetVideo)}（30fps、每秒一個關鍵幀${audioOpts.loudnorm ? '、人聲調到 −14 LUFS' : ''}${audioOpts.declick && cp.list.length ? '、剪接點微淡化' : ''}）…`);
    audioInfo = encodeFootagePolished(P.video, assetVideo, { cacheDir: path.join(P.out, '.cache'), cutpoints: cp.list.map((c) => c.at), ...audioOpts,
      onMeasure: () => log('量人聲響度（第一次會花一點時間，之後用快取）…') });
    fs.mkdirSync(path.dirname(stampFile), { recursive: true });
    fs.writeFileSync(stampFile, JSON.stringify({ key: wantKey, info: audioInfo }, null, 2) + '\n');
    encoded = true;
  } else if (stamp?.info) audioInfo = stamp.info;   // 沒重新編碼：報告用上次的數字
  const rawDur = probeDuration(assetVideo);
  const videoDur = floorFrame(rawDur);
  if (encoded) {
    const srcDur = probeDuration(P.video);
    const drift = r3(rawDur - srcDur);
    log(`底片長度：原檔 ${r3(srcDur)}s → 重新編碼 ${r3(rawDur)}s（差 ${drift}s）${Math.abs(drift) > 0.1 ? ' ⚠ 差超過 0.1s，字幕可能對不準' : ''}`);
  }
  for (const l of audioReportLines(audioInfo, { ...audioOpts, cutpointsExist: cp.list.length > 0 })) log(l);
  const voiceOnly = voiceOnlyOf(P, fs.existsSync(P.video) ? P.video : assetVideo, log);
  const res = resolvePlan(ctx(videoDur, voiceOnly));
  res.warnings.unshift(...cp.warnings, ...boxWarnings(plan, assetVideo));
  printIssues(res, log);
  for (const w of captionWarnings(cues)) log(`⚠ ${w}`);
  if (res.errors.length) {
    log(`\n未通過：${res.errors.length} 個錯誤，沒有產生任何檔案。照 → 後面的建議改 plan.json 再跑一次。`);
    return { ok: false, res };
  }
  const outDur = res.outDur;
  const capCues = res.cuesOut;

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
  if (fxUsed.length) {
    const kit = fs.readFileSync(path.join(fxDir, 'fx-kit.js'), 'utf8');
    files.push(['compositions/fx-kit.js', kit]);
    // 字卡動態裡寫的是相對路徑 fx-kit.js：render 以子合成檔的位置解析（compositions/），HyperFrames 播放器以專案根目錄解析，兩處都放
    files.push(['fx-kit.js', kit]);
  }
  const cap = buildCaptions(capCues, { duration: outDur });
  files.push([cap.file, cap.html]);
  const bg = fs.existsSync(path.join(P.templateDir, 'bg.jpg'));
  // 插入素材的檔（放大鏡的逐幀要先抽好，主合成才知道每一格用哪一張）
  const mediaN = prepareMedia(res.items, P.out, log);
  const mainOpts = { items: res.items, videoDur: outDur, pip: res.globals.pip, sideShift: res.globals.sideShift, bg, footage: res.footage, editFx: res.editFx };
  const main = buildMain({ ...mainOpts, captions: cap });
  let test = null;
  if (flags.test) {
    const m = String(flags.test).match(/^\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*$/);
    if (!m) throw new Error('--test 要寫成「起點,秒數」，例如 --test 41,4');
    const t0 = Number(m[1]), len = Number(m[2]);
    if (t0 >= outDur) throw new Error(`--test 起點 ${t0}s 超過影片長度 ${outDur}s`);
    const capT = buildCaptions(capCues, { duration: r3(Math.min(len, outDur - t0)), offset: t0, compId: 'captions-test' });
    files.push([capT.file, capT.html]);
    test = buildMain({ ...mainOpts, captions: capT, test: { t0, len } });
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
      throw new Error(`${rel(idx)} 被手改過（可能是 Studio 存檔）：把想要的改動搬進 plan.json（時間、slots、css），再加 --force 重跑；直接覆寫會蓋掉手改`);
    }
  }

  // 寫檔（成片的資料夾先建好，render 的 -o 才寫得進去）
  fs.mkdirSync(P.out, { recursive: true });
  if (P.project) for (const d of OUTPUT_DIRS) fs.mkdirSync(path.join(P.project, d), { recursive: true });
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
  log(`\n產生：${W.res.written.length} 個檔（沒變 ${W.res.same.length}）；kit 更新 ${kitN} 個檔${mediaN ? `；插入素材更新 ${mediaN} 個` : ''}${removed.length ? `；刪掉舊檔 ${removed.join('、')}` : ''}`);
  if (W.res.skipped.length) log(`⚠ 這些檔被手改過，沒有覆寫：${W.res.skipped.join('、')} → 把改動搬進 plan.json 後加 --force`);
  if (test) {
    const clip = path.relative(P.out, path.join(P.project || path.resolve(P.out, '..', '..'), '成片', '測試片段', 'test-clip.mp4')).split(path.sep).join('/');
    log(`測試片段：${rel(path.join(P.out, TEST_FILE))}（${test.t0}s 起 ${test.duration}s）→ cd ${rel(P.out)} && npx hyperframes render -c ${TEST_FILE} --quality draft -o ${clip}`);
    for (const it of test.skipped) log(`⚠ ${it.id} 在 ${it.start}s 就開始了，測試片段不含這段（要看完整段，把起點改成 ${it.start}）`);
  }
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

// 用 realpath 比對：從 symlink 路徑執行時（例如 shared/template 是連結）也要跑，不能靜默 exit 0
const isMain = () => {
  try { return !!process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
};
if (isMain()) {
  const wantJson = process.argv.includes('--json') && process.argv.includes('--check');
  cli().then((code) => { process.exitCode = code; }, (e) => {
    // --check --json：出錯也只印 JSON（剪輯台讀 stdout）
    if (wantJson) console.log(JSON.stringify({ ok: false, errors: [e.message], warnings: [], videoDur: null, outputDur: null, voiceOnly: [], cutpoints: [], items: [], edit: null, paths: {} }, null, 2));
    else console.error(`✖ ${e.message}`);
    process.exitCode = 1;
  });
}
