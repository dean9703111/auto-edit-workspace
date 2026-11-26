// 封面台（090）：/cover 頁的狀態、給 AI 的封面指令、改字重出、選定。
// 內容都在專案的 work/cover/cover.json（lib/cover.mjs 讀它出圖）；這裡只多記 request（使用者在頁面上勾的情境、描述、指定的標題）。
//
//   coverState(ctx)                  → 頁面要的全部狀態
//   prepareCoverRequest(ctx, body)   → 存需求、寫 work/cover/request.md，回傳含指令的狀態
//   setCoverOptions(ctx, body)       → { at }：換講者那一格，「去背＋內容」出過就重出
//   editCover(ctx, body)             → { scene, cover }：改一張的內容，檢查過了才存、重出那一張
//   pickCoverChoice(ctx, body)       → { scene }：選定，複製成 output/cover/cover.jpg
//   coverAsset(ctx, name)            → 頁面能讀的圖（三張成品、選定的那張、候選格）
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { COVER, coverInfo, coverProblems, coverPrompt, readCover, writeCover, pickCover, coverOut, coverDir, coverFile } from '../../lib/cover.mjs';

const TOOLS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const read = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const rel = (ctx, f) => path.relative(ctx.P.root, f).split(path.sep).join('/');
const requestFile = (ctx) => path.join(coverDir(ctx.P.project), 'request.md');
const str = (v, max) => String(v ?? '').trim().slice(0, max);

export function coverState(ctx) {
  const P = ctx.P, name = path.basename(P.project);
  const info = coverInfo({ project: P.project, templateDir: P.templateDir });
  if (!info.ready) return { ready: false, project: name, message: info.message };
  const req = info.request || {}, rf = requestFile(ctx);
  return {
    ready: true, project: name, format: info.format, at: info.at, pick: info.pick, hasFinal: info.hasFinal,
    candidates: info.times.map((t, i) => ({ at: t, thumb: `/cover/file/cand-${i + 1}.jpg` })),
    scenes: COVER.scenes.map((id) => ({
      id, name: COVER.names[id], preset: COVER.notes[id], note: req.scenes?.[id]?.note ?? COVER.notes[id], on: req.scenes?.[id]?.on !== false,
      data: info.covers[id].data, image: info.covers[id].mtime ? `/cover/file/cover-${id}.jpg?v=${Math.round(info.covers[id].mtime)}` : null,
    })),
    title: req.title || '', prompt: fs.existsSync(rf) ? fs.readFileSync(rf, 'utf8') : '', savedTo: rel(ctx, coverDir(P.project)), out: rel(ctx, coverOut(P.project)),
    job: ctx.coverJob ? { running: ctx.coverJob.running, ok: ctx.coverJob.ok, message: ctx.coverJob.message } : null,
    limits: { lines: COVER.lines, lineMax: COVER.lineMax, kicker: COVER.kicker, sub: COVER.sub, chips: COVER.chips, chip: COVER.chip },
  };
}

export function prepareCoverRequest(ctx, body) {
  const P = ctx.P, info = coverInfo({ project: P.project, templateDir: P.templateDir });
  if (!info.ready) throw fail(info.message, 409);
  const scenes = COVER.scenes.map((id) => ({ id, on: body?.scenes?.[id]?.on !== false, note: str(body?.scenes?.[id]?.note, 600) || COVER.notes[id] }));
  if (!scenes.some((s) => s.on)) throw fail('至少勾一個情境。');
  const title = str(body?.title, 120);
  const data = readCover(P.project);
  data.request = { scenes: Object.fromEntries(scenes.map((s) => [s.id, { on: s.on, note: s.note }])), title };
  data.at = info.at;   // 候選裡預設的那一格也寫下來，AI 和頁面看到的是同一格
  writeCover(P.project, data);
  fs.writeFileSync(requestFile(ctx), coverPrompt({ project: rel(ctx, P.project), format: info.format, scenes, title, at: info.at, hasFinal: info.hasFinal }));
  return coverState(ctx);
}

// 出圖在背景跑（Chrome 截圖＋去背要幾秒到幾十秒）；跑的時候又有人改，跑完再跑一次
function render(ctx, only) {
  const want = only ? new Set(only) : new Set(COVER.scenes);
  if (ctx.coverJob?.running) { for (const s of want) ctx.coverJob.next.add(s); return; }
  const job = ctx.coverJob = { running: true, ok: null, message: '', next: new Set() };
  if (ctx.coverRunner) return Promise.resolve(ctx.coverRunner([...want])).then((r) => Object.assign(job, { running: false, ok: r?.ok !== false, message: r?.message || '' }));   // 測試用：不開 Chrome
  let out = '';
  const child = spawn(process.execPath, [path.join(TOOLS, 'media.mjs'), 'cover', '--project', ctx.P.project, '--template', ctx.P.templateDir, '--only', [...want].join(',')], { cwd: ctx.P.root });
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  child.on('error', (e) => { out += `✖ ${e.message}`; });
  child.on('close', (code) => {
    const lines = out.trim().split('\n').filter((l) => /^[✖⚠]/.test(l.trim()));
    Object.assign(job, { running: false, ok: code === 0, message: lines.join('\n') || (code === 0 ? '' : out.trim().slice(-400)) });
    if (job.next.size) render(ctx, [...job.next]);
  });
}

const made = (ctx) => { const c = readCover(ctx.P.project).covers; return COVER.scenes.filter((s) => c[s]?.title); };

export function setCoverOptions(ctx, body) {
  const P = ctx.P, info = coverInfo({ project: P.project, templateDir: P.templateDir });
  if (!info.ready) throw fail(info.message, 409);
  const data = readCover(P.project);
  let redo = [];
  if (body?.at != null) {
    const at = Number(body.at);
    if (!(at >= 0 && at < info.duration)) throw fail(`這一格不在影片裡（0–${Math.floor(info.duration)} 秒）。`);
    if (at !== data.at) { data.at = at; redo = made(ctx).filter((s) => s === 'cutout'); }
  }
  writeCover(P.project, data);
  if (redo.length) render(ctx, redo);
  return coverState(ctx);
}

const EDITABLE = ['title', 'kicker', 'sub', 'chips', 'behind', 'mock', 'icon', 'pic', 'image'];
export function editCover(ctx, body) {
  const P = ctx.P, scene = body?.scene;
  if (!COVER.scenes.includes(scene) || !body.cover || typeof body.cover !== 'object') throw fail('請指定要改哪一張和它的內容。');
  const data = readCover(P.project), next = { ...(data.covers[scene] || {}) };
  for (const k of EDITABLE) if (k in body.cover) { if (body.cover[k] === null || body.cover[k] === '') delete next[k]; else next[k] = body.cover[k]; }
  if (Array.isArray(next.chips)) next.chips = next.chips.filter((c) => (typeof c === 'string' ? c.trim() : c?.text?.trim()));
  const icons = read(path.join(P.templateDir, 'kit', 'icons.json')) || {};
  const bad = coverProblems(scene, next, { icons: new Set(Object.keys(icons)), exists: (p) => fs.existsSync(path.resolve(P.project, p)), hasPic: (p) => /^[\w-]+\/[\w-]+$/.test(p) && fs.existsSync(path.join(P.templateDir, 'kit', 'pics', `${p}.svg`)) });
  if (bad.length) throw fail(bad.map((m) => m.split(' → ')[0]).join('\n'));
  data.covers[scene] = next;
  writeCover(P.project, data);
  render(ctx, [scene]);
  return coverState(ctx);
}

export function pickCoverChoice(ctx, body) {
  try { pickCover(ctx.P.project, body?.scene); } catch (e) { throw fail(e.message.split(' → ')[0], 409); }
  return coverState(ctx);
}

export function coverAsset(ctx, name) {
  if (!/^(?:cover(?:-(?:cutout|mock|icon))?\.jpg|cand-[1-9]\.jpg)$/.test(name)) return null;
  const f = path.join(name.startsWith('cand-') ? coverDir(ctx.P.project) : coverOut(ctx.P.project), name);
  return fs.existsSync(f) ? f : null;
}
export { coverFile, coverPrompt };
