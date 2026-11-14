// 專案路徑與模板庫（032 C9：從 build.mjs 搬過來；build.mjs 照舊匯出同名函式）
// 只要專案路徑的工具（media、deliver、look、editor、capcut、versions…）從這裡匯入，不用為了一個 pathsFrom 載入整支 build.mjs。
//
//   findProject(flags, root, cwd)            → 專案資料夾（找不到丟錯，訊息列出現有專案）
//   pathsFrom(flags, cwd, { needProject })   → { templateDir, root, project, out, plan, srt, video, sfx }
//   loadLib(templateDir, projectDir)         → 情境模板、圖示、特效、音效（含自備音效與配樂）、主色
//   fromRoot(P, p)、projectLabel(P, dir)     → 訊息裡的路徑寫法
//   hasVoiceSource(projectDir)               → 專案有沒有只有聲音的主軌素材
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadScenes, loadIcons, loadFx, motionConsts } from './scenes.mjs';
import { loadMusic } from './music.mjs';
import { readSettings } from './settings.mjs';
import { readEndingSetting } from './ending.mjs';
import { syncLocalSfx } from './sfx-local.mjs';

// tools/ 資料夾（pathsFrom 沒給 --template 時，模板＝tools/ 的上一層）
const TOOLS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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
  const templateDir = flags.template ? path.resolve(cwd, flags.template) : path.resolve(TOOLS, '..');
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

// projectDir：這一集自己的曲庫（work/music/）也算進配樂；沒給就只有工作區的 shared/music/
export function loadLib(templateDir, projectDir = null) {
  const kit = path.join(templateDir, 'kit');
  const sharedDir = path.resolve(templateDir, '..');
  const read = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
  const brandCss = fs.existsSync(path.join(kit, 'brand.css')) ? fs.readFileSync(path.join(kit, 'brand.css'), 'utf8') : '';
  const accent = (brandCss.match(/--brand\s*:\s*(#[0-9a-fA-F]{6})/) || [])[1] || '#FFD400';
  return {
    scenes: loadScenes(templateDir), icons: loadIcons(templateDir), fx: loadFx(templateDir),
    consts: motionConsts(kit), sfx: (() => { const k = read(path.join(kit, 'sfx.json'), {}); return { ...k, ...syncLocalSfx(sharedDir, { kit: k }), ...loadMusic({ sharedDir, projectDir }) }; })(), accent,   // 自備音效（shared/sfx-local/，030）蓋過內建的同名音效
    musicDefault: readSettings(sharedDir).data.music?.bed ?? null,
    // 片尾配樂的預設曲名（music.mjs outro）、片尾模板（brand.mjs ending）：每個人本機不一樣，測試用 AUTO_EDIT_NO_LOCAL_BRAND=1 關掉（033）
    outroDefault: process.env.AUTO_EDIT_NO_LOCAL_BRAND === '1' ? null : readSettings(sharedDir).data.music?.outro ?? null,
    ending: process.env.AUTO_EDIT_NO_LOCAL_BRAND === '1' ? null : readEndingSetting(sharedDir),
    customDir: path.join(templateDir, 'custom'),
  };
}

// 專案有沒有只有聲音的主軌素材：assets/voice/ 有檔，或 work/main.json 有 kind "voice"／"screen"（邊錄邊講的螢幕錄影，主軌只取聲音）的段
export function hasVoiceSource(projectDir) {
  try { if (fs.readdirSync(path.join(projectDir, 'assets', 'voice')).some((x) => !x.startsWith('.'))) return true; } catch { /* 沒有資料夾 */ }
  try { return (JSON.parse(fs.readFileSync(path.join(projectDir, 'work', 'main.json'), 'utf8')).clips || []).some((c) => c.kind === 'voice' || c.kind === 'screen'); } catch { return false; }
}

const posix = (p) => p.split(path.sep).join('/');
const realish = (p) => { try { return fs.realpathSync(p); } catch { return p; } };
// 工作區根目錄底下就寫相對路徑（projects/example/…）；比對用 realpath（macOS 的 /var 其實是 /private/var）
export const fromRoot = (P, p) => { const r = path.relative(realish(P.root), realish(p)); return r && !r.startsWith('..') && !path.isAbsolute(r) ? posix(r) : posix(p); };
// 訊息裡的專案寫法：在 projects/ 底下就寫 projects/<名稱>（工具從別處 symlink 過來時 root 對不到，也照樣好讀）
export const projectLabel = (P, dir) => (path.basename(path.dirname(dir)) === 'projects' ? `projects/${path.basename(dir)}` : fromRoot(P, dir));
