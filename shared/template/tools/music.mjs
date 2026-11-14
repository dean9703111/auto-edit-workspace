#!/usr/bin/env node
/**
 * 配樂（選用，零依賴，只用 Node 22 與 ffmpeg）：曲庫、整支片的底樂、用 ACE-Step 1.5 在本機生成
 *
 *   node shared/template/tools/music.mjs status
 *       ACE-Step 有沒有裝、服務有沒有開、曲庫有幾首、每一集預設的底樂是哪一首。
 *   node shared/template/tools/music.mjs list [--project projects/<專案>]
 *       列曲庫：工作區的（shared/music/）和這一集的（work/music/），標出預設的底樂。
 *   node shared/template/tools/music.mjs gen [--style <風格>] [--prompt "<英文描述>"] [--seconds 90] [--n 3] [--project projects/<專案>]
 *       用 ACE-Step 生成 n 首純音樂候選（服務沒開會自己開，做完自己關），調好響度，寫一頁可以播放的試聽頁。
 *       風格：輕快科技（預設）、溫暖敘事、沉穩專業、活力教學。使用者自己給描述才寫 --prompt（英文效果最好；和 --style 不能一起用）。
 *       沒裝 ACE-Step：印怎麼裝（setup/ACE-Step 配樂.md，選用），結束碼 2。
 *   node shared/template/tools/music.mjs keep <第幾首> --name <曲名> [--project projects/<專案>] [--from <候選資料夾>]
 *       把試聽後挑中的那一首存進曲庫（沒寫 --project＝工作區曲庫，每一集都能用；寫了＝只有這一集）。
 *   node shared/template/tools/music.mjs add <聲音檔> --name <曲名> [--project projects/<專案>] [--credit "<出處>"]
 *       把自己的音樂放進曲庫（不用 ACE-Step）：去頭尾靜音、調響度。要標出處的寫 --credit。
 *   node shared/template/tools/music.mjs use <曲名>|none
 *       設定每一集預設的底樂（寫 shared/setting.json 的 music.bed）；none＝取消。某一集不要：那集 plan.json 寫 "bed": { "music": null }。
 *   node shared/template/tools/music.mjs outro <曲名>|none
 *       設定每一集預設的片尾配樂（寫 shared/setting.json 的 music.outro）；none＝取消。曲名可以是曲庫的，或內建的 bgm-cylinder-five。
 *       那一集沒寫 outro.from 就只播片尾最後 30 秒（有片尾卡時含片尾卡）；要從結語金句講完那句起播：build.mjs --set "outro.from=#N"。
 *       某一集不要：build.mjs --set outro.music=none（寫進那集 plan.json 的 "outro": { "music": null }）。
 *   node shared/template/tools/music.mjs acestep <ACE-Step 資料夾> [--image <映像檔.sparseimage>]
 *       記下 ACE-Step 裝在哪（寫 shared/setting.json 的 music.acestep）；裝在外接硬碟的映像檔裡就加 --image，生成前會自己掛上。
 *
 * 曲名：小寫英文開頭，只用小寫英數和 -（例 bed-calm-tech）。已經在曲庫的曲名不覆寫。
 * 用在影片上：plan.json 第一層 "bed": { "music": "<曲名>" }（整支片的底樂）、"outro": { "from": "#N", "music": "<曲名>" }（片尾配樂；from 不寫＝最後 30 秒）。
 * 旗標也可以寫成 --旗標=值（只在第一個 = 切，例 --credit="a=b"）；要值的旗標後面沒接值（或接著另一個旗標）、不認得的旗標都 ✖。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readSettings, writeSetting } from './lib/settings.mjs';
import { ACE, BED, NAME_RE, LIB_LUFS, loadMusic, musicDirs, registerTrack, normalizeTrack, aceHealth, aceGenerate, aceDownload } from './lib/music.mjs';
import { probeDuration } from './lib/ff.mjs';
import { stopLines } from './lib/stops.mjs';
import { splitFlag, valueOf, oneOf, isMain } from './lib/cli.mjs';
import { next, cmdLine } from './lib/say.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const SHARED = path.join(ROOT, 'shared');
const rel = (p) => path.relative(process.cwd(), p) || '.';
const SETUP_DOC = 'setup/ACE-Step 配樂.md';

export const STYLES = {
  輕快科技: 'upbeat modern tech background music, light electronic beat, plucky synths, clean bass, positive and focused, 110 bpm',
  溫暖敘事: 'warm gentle acoustic background music, soft piano and acoustic guitar, light percussion, calm storytelling mood, 90 bpm',
  沉穩專業: 'calm corporate ambient background music, soft pads, subtle piano, minimal percussion, confident and steady, 95 bpm',
  活力教學: 'energetic friendly tutorial background music, funky guitar, claps, bright keys, motivating, 120 bpm',
};
const SUFFIX = 'instrumental, no vocals, steady volume, seamless loop, background underscore for a talking video';
export const promptOf = ({ style = '輕快科技', prompt = null }) => `${prompt ? String(prompt).trim() : STYLES[style]}, ${SUFFIX}`;

const VALUE_FLAGS = ['project', 'style', 'prompt', 'seconds', 'n', 'name', 'from', 'credit', 'image', 'seed'];
const BOOL_FLAGS = ['json', 'help'];
// lib/cli.mjs 的寫法：--旗標=值 只在第一個 = 切；要值的旗標缺值（或下一個是另一個旗標）✖，不再默默當成 true；不認得的旗標 ✖
function parse(argv) {
  const f = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!String(a).startsWith('--')) { f._.push(a); continue; }
    const [k, inline] = splitFlag(a);
    if (VALUE_FLAGS.includes(k)) [f[k], i] = valueOf(argv, i, k, inline);
    else if (BOOL_FLAGS.includes(k)) f[k] = true;
    else throw new Error(`沒有 --${k} 這個參數 → 看用法：node shared/template/tools/music.mjs --help`);
  }
  // --prompt 會整個取代 --style 的描述：兩個都給時以前默默不管 --style
  oneOf(f, ['style', 'prompt']);
  return f;
}
function projectOf(f) {
  if (!f.project) return null;
  for (const p of [path.resolve(process.cwd(), String(f.project)), path.join(ROOT, 'projects', String(f.project))]) if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return p;
  throw new Error(`找不到專案「${f.project}」→ 寫 --project projects/<專案>`);
}
const settings = () => readSettings(SHARED).data.music || {};
const setMusic = (patch) => writeSetting(SHARED, 'music', { ...settings(), ...patch });

// ---------- ACE-Step 服務 ----------
function aceInstall() {
  const a = settings().acestep;
  if (!a?.dir) return { ok: false, why: '還沒設定 ACE-Step 裝在哪' };
  if (!fs.existsSync(a.dir) && a.image && fs.existsSync(a.image)) spawnSync('hdiutil', ['attach', a.image, '-nobrowse'], { encoding: 'utf8' });
  if (!fs.existsSync(path.join(a.dir, 'pyproject.toml'))) return { ok: false, why: `${a.dir} 不在${a.image ? '（映像檔掛不上或外接硬碟沒接）' : ''}` };
  return { ok: true, dir: a.dir };
}
async function ensureServer(log) {
  const h = await aceHealth();
  if (h.ok) return { started: null };
  const inst = aceInstall();
  if (!inst.ok) return { error: inst.why };
  log(`啟動 ACE-Step（${inst.dir}）…（第一次用會先下載約 9.4 GB 的模型）`);
  const logFile = path.join(os.tmpdir(), `acestep-${Date.now()}.log`);
  const fd = fs.openSync(logFile, 'a');
  // ACESTEP_INIT_LLM=false：純音樂用不到語言模型；不關的話它會照機器規格再下載、載入一個 3.5–8.4 GB 的模型
  const env = { ...process.env, ACESTEP_LM_BACKEND: process.platform === 'darwin' ? 'mlx' : process.env.ACESTEP_LM_BACKEND || '', TOKENIZERS_PARALLELISM: 'false', ACESTEP_INIT_LLM: 'false', UV_CACHE_DIR: process.env.UV_CACHE_DIR || path.join(path.dirname(inst.dir), '.uv-cache') };
  const child = spawn('uv', ['run', 'acestep-api', '--host', '127.0.0.1', '--port', String(new URL(ACE.url).port)], { cwd: inst.dir, env, detached: true, stdio: ['ignore', fd, fd] });
  child.unref();
  for (let i = 0; i < 200; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    if ((await aceHealth()).ok) return { started: child.pid, logFile };
    if (child.exitCode != null) break;
  }
  return { error: `ACE-Step 開不起來 → 看 ${logFile} 最後幾行；或在 ${inst.dir} 自己跑 uv run acestep-api 看錯誤` };
}
function stopServer(pid) { try { process.kill(-pid, 'SIGTERM'); } catch { /* 已經關了 */ } }

// ---------- 子指令 ----------
function listLib(f) {
  const projectDir = projectOf(f);
  const lib = loadMusic({ sharedDir: SHARED, projectDir });
  const def = settings().bed || null;
  const rows = Object.entries(lib).map(([name, e]) => ({ name, scope: e.scope, exists: fs.existsSync(e.file), secs: fs.existsSync(e.file) ? Math.round(probeDuration(e.file)) : 0, zh: e.zh || '', from: e.source?.engine || '自己的檔', isDefault: name === def }));
  if (f.json) { console.log(JSON.stringify({ default: def, tracks: rows }, null, 2)); return 0; }
  if (!rows.length) { console.log(`曲庫是空的（shared/music/${projectDir ? `、${rel(path.join(projectDir, 'work', 'music'))}` : ''}）→ 生成：music.mjs gen；放自己的音樂：music.mjs add <聲音檔> --name <曲名>`); return 0; }
  console.log('曲名｜範圍｜長度｜來源｜說明');
  const outroDef = settings().outro || null;
  for (const r of rows) console.log(`${r.name}${r.isDefault ? '（每一集預設的底樂）' : ''}${r.name === outroDef ? '（每一集預設的片尾配樂）' : ''}｜${r.scope === 'shared' ? '工作區' : '這一集'}｜${r.exists ? `${r.secs} 秒` : '✖ 檔案不在'}｜${r.from}｜${r.zh}`);
  console.log(`用法：plan.json 第一層寫 "bed": { "music": "<曲名>" }（整支片的底樂）或 "outro": { "from": "#N", "music": "<曲名>" }（片尾配樂）；每一集都用同一首：music.mjs use <曲名>（底樂）、music.mjs outro <曲名>（片尾配樂）`);
  return 0;
}

async function status() {
  const s = settings(), h = await aceHealth(), inst = aceInstall();
  const lib = loadMusic({ sharedDir: SHARED });
  console.log(`ACE-Step：${inst.ok ? `裝在 ${inst.dir}` : `沒有（${inst.why}；選用，要生成配樂才需要 → ${SETUP_DOC}）`}`);
  console.log(`ACE-Step 服務：${h.ok ? `開著（${ACE.url}）` : '沒開（music.mjs gen 會自己開、做完自己關）'}`);
  console.log(`工作區曲庫：${Object.keys(lib).length} 首${Object.keys(lib).length ? `（${Object.keys(lib).join('、')}）` : ''}`);
  console.log(`每一集預設的底樂：${s.bed || '沒設定（不配）'}`);
  console.log(`每一集預設的片尾配樂：${s.outro || '沒設定（不配）'}`);
  return 0;
}

function candDir(projectDir) { return projectDir ? path.join(projectDir, 'work', 'music', '候選') : path.join(os.tmpdir(), 'auto-edit-music', '候選'); }

async function gen(f) {
  const projectDir = projectOf(f);
  const style = f.style ? String(f.style) : '輕快科技';
  if (!f.prompt && !STYLES[style]) { console.log(`✖ 沒有「${style}」這個風格 → 可用：${Object.keys(STYLES).join('、')}；或自己寫 --prompt "<英文描述>"`); return 1; }
  const seconds = Number(f.seconds || 90), n = Number(f.n || 3);
  if (!(seconds >= BED.minLen && seconds <= 600)) { console.log(`✖ --seconds 要在 ${BED.minLen}–600 之間，現在是 ${f.seconds}`); return 1; }
  if (!(n >= 1 && n <= 8)) { console.log(`✖ --n 要在 1–8 之間，現在是 ${f.n}`); return 1; }
  const srv = await ensureServer(console.log);
  if (srv.error) {
    console.log(`✖ 不能生成配樂：${srv.error}`);
    console.log(`→ ACE-Step 是選用的（要約 14 GB 的磁碟空間）。要裝先問使用者，同意後照 ${SETUP_DOC} 做；不裝也可以用 music.mjs add 放自己的音樂`);
    return 2;
  }
  const prompt = promptOf({ style, prompt: f.prompt && f.prompt !== true ? f.prompt : null });
  const dir = candDir(projectDir);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  let last = 0;
  try {
    console.log(`生成 ${n} 首 ${seconds} 秒的純音樂（${f.prompt ? '自訂描述' : style}）…`);
    const t0 = Date.now();
    const tracks = await aceGenerate(ACE.url, { prompt, seconds, n, seed: f.seed != null ? Number(f.seed) : null }, (s) => { if (s - last >= 60) { last = s; console.log(`⏳ 已經 ${Math.round(s / 60)} 分鐘…`); } });
    const meta = { prompt, style: f.prompt ? null : style, seconds, engine: 'ACE-Step 1.5', created: new Date().toISOString(), tracks: [] };
    for (let i = 0; i < tracks.length; i++) {
      const raw = path.join(dir, `raw-${i + 1}.wav`), out = path.join(dir, `${i + 1}.wav`);
      await aceDownload(ACE.url, tracks[i].file, raw);
      const r = normalizeTrack(raw, out);
      fs.rmSync(raw, { force: true });
      meta.tracks.push({ n: i + 1, file: `${i + 1}.wav`, seed: tracks[i].seed, model: tracks[i].model, dur: r.dur });
    }
    fs.writeFileSync(path.join(dir, 'candidates.json'), `${JSON.stringify(meta, null, 2)}\n`);
    fs.writeFileSync(path.join(dir, '試聽.html'), auditionHtml(meta));
    console.log(`✓ ${meta.tracks.length} 首候選（${Math.round((Date.now() - t0) / 1000)} 秒）：${rel(dir)}`);
    // keep 要等使用者選了第幾首才能跑（<N>、<曲名> 要換掉）：寫進說明，「→ 下一步」下面不放還不能跑的指令
    for (const l of next(`把停點那兩行貼給使用者；他說「用第 N 首」就跑（曲名自己取，小寫英文和 -）：${cmdLine('music.mjs', ['keep', { raw: '<N>' }, '--name', { raw: '<曲名>' }, ...(projectDir ? ['--project', rel(projectDir)] : [])])}`)) console.log(l);
    console.log(stopLines.music(path.join(dir, '試聽.html')));
    return 0;
  } catch (e) {
    console.log(`✖ ${e.message}`);
    return 1;
  } finally { if (srv.started) stopServer(srv.started); }
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function auditionHtml(meta) {
  const rows = meta.tracks.map((t) => `<section><h2>第 ${t.n} 首<small>${Math.round(t.dur)} 秒</small></h2><audio controls preload="metadata" src="${t.file}"></audio></section>`).join('\n');
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>配樂試聽</title>
<style>body{font:16px/1.7 system-ui,"PingFang TC","Microsoft JhengHei",sans-serif;max-width:720px;margin:32px auto;padding:0 16px;color:#17212b;background:#f3f5f7}
h1{font-size:24px}h2{font-size:18px;margin:0 0 8px}small{font-weight:400;color:#5b6875;margin-left:8px}section{background:#fff;border:1px solid #d5dce3;border-radius:10px;padding:16px;margin:12px 0}
audio{width:100%}p{color:#5b6875}@media(prefers-color-scheme:dark){body{background:#10161c;color:#e6ecf1}section{background:#18212a;border-color:#2c3a47}p,small{color:#9aa8b5}}</style></head><body>
<h1>配樂試聽</h1><p>${meta.style ? `風格：${esc(meta.style)}。` : ''}放進影片時會比這裡小聲很多（講話時比人聲小 ${-BED.db} dB）。聽完回覆「用第 N 首」或「重做」。</p>
${rows}
<p>描述：${esc(meta.prompt)}</p></body></html>\n`;
}

function keep(f) {
  const projectDir = projectOf(f);
  const dir = f.from ? path.resolve(process.cwd(), String(f.from)) : candDir(projectDir);
  const metaFile = path.join(dir, 'candidates.json');
  if (!fs.existsSync(metaFile)) { console.log(`✖ 找不到候選（${rel(dir)}）→ 先跑 music.mjs gen${projectDir ? ` --project ${rel(projectDir)}` : ''}`); return 1; }
  const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
  const n = Number(f._[1]), t = meta.tracks.find((x) => x.n === n);
  if (!t) { console.log(`✖ 沒有第 ${f._[1]} 首 → 候選有第 ${meta.tracks.map((x) => x.n).join('、')} 首`); return 1; }
  const name = String(f.name || '');
  if (!NAME_RE.test(name)) { console.log(`✖ 要給曲名：--name <曲名>（小寫英文開頭，只用小寫英數和 -，例 bed-calm-tech）`); return 1; }
  const d = musicDirs({ sharedDir: SHARED, projectDir }), target = projectDir ? d.project : d.shared;
  fs.mkdirSync(target, { recursive: true });
  registerTrack(target, name, { kind: 'bgm', zh: `${meta.style || '自訂'}（ACE-Step 生成）`, source: { engine: meta.engine, model: t.model, prompt: meta.prompt, seed: t.seed, seconds: meta.seconds, created: meta.created } });
  fs.copyFileSync(path.join(dir, t.file), path.join(target, `${name}.wav`));
  console.log(`✓ 存進${projectDir ? '這一集的' : '工作區'}曲庫：${rel(path.join(target, `${name}.wav`))}（${Math.round(t.dur)} 秒）`);
  // 單集的底樂用 build.mjs --set 寫進 plan.json（不用手改 JSON）；它會接著印 build 那一條
  const L = projectDir
    ? next('這一集用它當底樂就跑下面那一條（寫進 plan.json 第一層的 bed.music，再照它印的跑 build）', cmdLine('build.mjs', ['--project', rel(projectDir), '--set', `bed.music=${name}`]))
    : next(`每一集都用它當底樂就跑下面那一條；只用在某一集就跑 node shared/template/tools/build.mjs --project projects/<專案> --set bed.music=${name}`, cmdLine('music.mjs', ['use', name]));
  for (const l of L) console.log(l);
  return 0;
}

function add(f) {
  const projectDir = projectOf(f);
  const src = f._[1] ? path.resolve(process.cwd(), f._[1]) : null, name = String(f.name || '');
  if (!src || !fs.existsSync(src)) { console.log(`✖ 找不到聲音檔「${f._[1] || ''}」→ music.mjs add <聲音檔> --name <曲名>`); return 1; }
  if (!NAME_RE.test(name)) { console.log(`✖ 要給曲名：--name <曲名>（小寫英文開頭，只用小寫英數和 -，例 bed-my-song）`); return 1; }
  const d = musicDirs({ sharedDir: SHARED, projectDir }), target = projectDir ? d.project : d.shared;
  if (loadMusic({ sharedDir: SHARED, projectDir })[name]?.scope === (projectDir ? 'project' : 'shared')) { console.log(`✖ 曲庫已經有「${name}」→ 換一個曲名（已經有的不覆寫）`); return 1; }
  fs.mkdirSync(target, { recursive: true });
  const r = normalizeTrack(src, path.join(target, `${name}.wav`));
  registerTrack(target, name, { kind: 'bgm', zh: path.basename(src), ...(f.credit && f.credit !== true ? { credit: String(f.credit) } : {}), source: { engine: null, file: path.basename(src) } });
  console.log(`✓ 存進${projectDir ? '這一集的' : '工作區'}曲庫：${rel(path.join(target, `${name}.wav`))}（${Math.round(r.dur)} 秒，響度調到 ${LIB_LUFS} LUFS）`);
  if (r.dur < BED.minLen) console.log(`⚠ 只有 ${Math.round(r.dur)} 秒，不到 ${BED.minLen} 秒不能當整支片的底樂（循環聽得出來），可以當片尾配樂`);
  return 0;
}

function use(f) {
  const name = f._[1];
  if (!name) { console.log('✖ 要給曲名：music.mjs use <曲名>；取消預設：music.mjs use none'); return 1; }
  if (name === 'none') { setMusic({ bed: undefined }); console.log('✓ 取消每一集預設的底樂（之後只有 plan.json 寫了 bed 的那一集才有）'); return 0; }
  const e = loadMusic({ sharedDir: SHARED })[name];
  if (!e) { console.log(`✖ 工作區曲庫沒有「${name}」→ music.mjs list 看有哪些（這一集的曲庫不能當每一集的預設）`); return 1; }
  if (!fs.existsSync(e.file) || probeDuration(e.file) < BED.minLen) { console.log(`✖ 「${name}」不到 ${BED.minLen} 秒或檔案不在，不能當底樂 → 換一首`); return 1; }
  setMusic({ bed: name });
  console.log(`✓ 之後每一集都用 ${name} 當底樂（下次 build 生效）；某一集不要就在那集 plan.json 第一層寫 "bed": { "music": null }`);
  return 0;
}

// 片尾配樂的預設（033）：曲庫（工作區的）或 kit/sfx.json 內建的配樂都可以；不用到 20 秒（片尾配樂不循環，短的會對齊片尾）
function outroDefault(f) {
  const name = f._[1];
  if (!name) { console.log('✖ 要給曲名：music.mjs outro <曲名>；取消預設：music.mjs outro none'); return 1; }
  if (name === 'none') { setMusic({ outro: undefined }); console.log('✓ 取消每一集預設的片尾配樂（之後只有 plan.json 寫了 outro.music 的那一集才有）'); return 0; }
  let kit = {};
  try { kit = JSON.parse(fs.readFileSync(path.resolve(HERE, '..', 'kit', 'sfx.json'), 'utf8')); } catch { /* 讀不到內建清單：只看曲庫 */ }
  const e = loadMusic({ sharedDir: SHARED })[name] || (kit[name]?.kind === 'bgm' ? { file: path.join(SHARED, 'sfx', `${name}.wav`) } : null);
  if (!e) { console.log(`✖ 沒有「${name}」這首 → music.mjs list 看工作區曲庫；內建的有 ${Object.keys(kit).filter((k) => kit[k]?.kind === 'bgm').join('、') || '（沒有）'}（這一集的曲庫不能當每一集的預設）`); return 1; }
  if (!fs.existsSync(e.file)) { console.log(`✖ 「${name}」的檔案不在（${rel(e.file)}）→ 換一首`); return 1; }
  setMusic({ outro: name });
  console.log(`✓ 之後每一集都用 ${name} 當片尾配樂（下次 build 生效）：沒寫 outro.from 的那集只播片尾最後 30 秒；某一集不要：build.mjs --project projects/<專案> --set outro.music=none`);
  return 0;
}

function acestep(f) {
  const dir = f._[1] ? path.resolve(process.cwd(), f._[1]) : null;
  if (!dir || !fs.existsSync(path.join(dir, 'pyproject.toml'))) { console.log(`✖ 「${f._[1] || ''}」不是 ACE-Step 的資料夾（裡面要有 pyproject.toml）→ 照 ${SETUP_DOC} 裝好再設定`); return 1; }
  const image = f.image && f.image !== true ? path.resolve(process.cwd(), String(f.image)) : undefined;
  if (image && !fs.existsSync(image)) { console.log(`✖ 找不到映像檔 ${image}`); return 1; }
  setMusic({ acestep: { dir, ...(image ? { image } : {}) } });
  console.log(`✓ 記下 ACE-Step 在 ${dir}${image ? `（映像檔 ${image}，生成前會自己掛上）` : ''}`);
  return 0;
}

async function main() {
  let f;
  try { f = parse(process.argv.slice(2)); } catch (e) { console.log(`✖ ${e.message}`); return 1; }
  const cmd = f._[0];
  if (!cmd || f.help) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').match(/\/\*\*([\s\S]*?)\*\//)[1].replace(/^ \* ?/gm, '').trim()); return 0; }
  try {
    if (cmd === 'status') return await status();
    if (cmd === 'list') return listLib(f);
    if (cmd === 'gen') return await gen(f);
    if (cmd === 'keep') return keep(f);
    if (cmd === 'add') return add(f);
    if (cmd === 'use') return use(f);
    if (cmd === 'outro') return outroDefault(f);
    if (cmd === 'acestep') return acestep(f);
    console.log(`✖ 沒有「${cmd}」這個子指令 → status、list、gen、keep、add、use、outro、acestep（--help 看說明）`);
    return 1;
  } catch (e) { console.log(`✖ ${e.message}`); return 1; }
}

// 經 symlink 執行也算（lib/cli.mjs 的 isMain 用 realpath 比）：以前直接比路徑，從 symlink 跑什麼都不做
if (isMain(import.meta.url)) process.exit(await main());
