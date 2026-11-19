// 063：手機確認頁（versions.mjs site）。固定模板 shared/template/site/review.html，這裡只準備資料塞進去：
// 每段的段號、動畫是什麼、完成影片時間、最後一格（壓過的 JPEG 內嵌成 data URI）、對應字幕；標籤與修改單格式內嵌 lib/requests-md.mjs（和剪輯台同一支）。
// 輸出 work/site/index.html 一個檔就是整包（可以直接發布成網頁）。
// 最後一格沿用已經有的完成態截圖（work/storyboard-preview/ 的分鏡截圖、work/audit-shots/ 的量測截圖，取比較新的那張）；
// 沒有、或比那段的動畫檔、版本舊的段，才用 qc.mjs storyboard --only 補截（不整支重截）。
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseSrt } from './srt.mjs';
import { rqKindOf, rqTime, rqSpan, rqTitle, rqWhat, rqShown, rqFile, rqIsImage, rqStamp } from './requests-md.mjs';
import { projectRel, readRounds, brandVars } from './learn.mjs';
import { writeAtomic } from './atomic.mjs';
import { listFillSpecs } from './custom-fill.mjs';
import { storyboardOptions } from '../editor/server/storyboard-options.mjs';
import { findSceneDef, findFxDef } from '../editor/text.mjs';
import { outOf } from '../editor/model.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), TOOLS = path.dirname(HERE);
// 一張最多 120 KB、整包盡量 15 MB 以內（段很多時每張再壓小一點）；寬度：橫式 720、直式 540（手機 2 倍螢幕看得清楚）
export const SITE = { maxKB: 120, minKB: 24, budgetMB: 15, width: { landscape: 720, portrait: 540 }, q: [4, 6, 9, 13, 18, 24] };
export const siteDir = (project) => path.join(project, 'work', 'site');
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const mtime = (f) => { try { return fs.statSync(f).mtimeMs; } catch { return null; } };
const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const tail = (s, n = 240) => String(s ?? '').trim().slice(-n);
const runTool = (name, args, opts = {}) => spawnSync(process.execPath, [path.join(TOOLS, name), ...args], { encoding: 'utf8', maxBuffer: 64 << 20, ...opts });

// ---------- 段落 ----------
function checkJson(P, templateArg) {
  const r = runTool('build.mjs', ['--project', P.project, '--check', '--json', ...templateArg]);
  try { return JSON.parse(r.stdout); } catch { throw new Error(`build.mjs --check --json 沒有輸出 JSON：${tail(r.stderr || r.stdout)} → 先跑 node shared/template/tools/build.mjs --project ${projectRel(P.root, P.project)} --check 看錯誤`); }
}
function namesOf(P) {
  const r = runTool('build.mjs', ['--list', '--json', '--template', P.templateDir]);
  let j = null;
  try { j = JSON.parse(r.stdout); } catch { j = null; }
  let custom = new Map();
  try {
    const zh = new Map(storyboardOptions(P.templateDir).scenes.flatMap((g) => g.items).map((i) => [i.id, i.label]));
    custom = new Map(listFillSpecs(path.join(P.templateDir, 'custom')).map((f) => [f.template, zh.get(f.template) || f.template]));
  } catch { /* 沒有中文名就寫模板名 */ }
  return { scenes: j?.scenes || [], fx: j?.fx || [], custom };
}
// 只放這一輪改到的段：最新的 r<N>.md「改了哪幾段」與分類表的「改哪一段」
export function roundSegs(project) {
  const rounds = readRounds(project), r = rounds[rounds.length - 1];
  if (!r) return null;
  const ids = new Set([...r.changed.map((c) => c.seg), ...r.rows.flatMap((w) => w.seg.split(/[、,，\s]+/))].filter(Boolean));
  return { round: r.round, ids };
}
export function siteSegments(P, check, plan, { only = null, round = null, names = { scenes: [], fx: [], custom: new Map() } } = {}) {
  const byId = new Map((plan?.scenes || []).filter((s) => s && s.id).map((s) => [s.id, s]));
  let items = (check?.items || []).filter((it) => byId.has(it.id));
  let scope = '全部段落';
  if (only) {
    const bad = only.filter((id) => !items.some((it) => it.id === id));
    if (bad.length) throw new Error(`--only 的 ${bad.join('、')} 不在 plan.json（或整段被剪掉了）→ 現有：${items.slice(0, 30).map((it) => it.id).join('、')}${items.length > 30 ? '…' : ''}`);
    items = items.filter((it) => only.includes(it.id));
    scope = `指定的 ${only.length} 段`;
  } else if (round) {
    if (!round.ids.size) throw new Error(`${round.round} 還沒寫改到哪幾段 → 先跑 versions.mjs finish，或用 --only 指定段`);
    items = items.filter((it) => round.ids.has(it.id));
    if (!items.length) throw new Error(`${round.round} 改到的段（${[...round.ids].join('、')}）都不在 plan.json → 用 --only 指定段`);
    scope = `${round.round} 改到的 ${items.length} 段`;
  }
  const cuts = check?.edit?.cuts || [];
  const cues = (() => { try { return parseSrt(fs.readFileSync(P.srt, 'utf8')); } catch { return []; } })();
  const rel = projectRel(P.root, P.project);
  const segs = items.map((it) => {
    const sc = byId.get(it.id), type = sc.type ?? 'scene', kind = rqKindOf(type);
    const def = type === 'scene' ? findSceneDef(names.scenes, sc.scene) : type === 'fx' ? findFxDef(names.fx, sc.fx) : null;
    const image = type === 'media' ? rqIsImage(sc.src) : undefined;
    const n = { zh: def?.zh, customZh: sc.template ? names.custom.get(sc.template) : undefined, image };
    const out = it.out && Number.isFinite(it.out.start) ? [it.out.start, it.out.end] : [outOf(it.start, cuts), outOf(it.end, cuts)];
    const shown = type === 'media' ? `${image ? '圖片' : '錄影'}：${String(sc.src || '').split('/').pop()}` : rqShown(sc, n);
    return {
      id: it.id, type, kind, badge: type === 'media' ? (image ? '圖片' : '錄影') : type === 'custom' ? '動畫' : '字卡',
      title: rqTitle(sc) || shown, shown, what: rqWhat(sc, n), file: rqFile(sc, rel), out, time: rqTime(out), span: rqSpan(sc),
      subs: cues.filter((c) => c.end > it.start + 0.05 && c.start < it.end - 0.05).map((c) => ({ n: c.n, text: c.text })),
    };
  }).sort((a, b) => a.out[0] - b.out[0]);
  return { segs, scope };
}

// ---------- 最後一格 ----------
// 分鏡截圖（qc.mjs storyboard；shots.json 裡這段的最後一張＝完成態）與量測截圖（audit --shots；秒數最大的＝完成態），取比較新的
export function findShot(P, id) {
  const out = [];
  const sb = path.join(P.project, 'work', 'storyboard-preview'), sj = readJson(path.join(sb, 'shots.json'));
  const mine = (sj?.shots || []).filter((s) => s.id === id).sort((a, b) => a.at - b.at);
  let file = mine.length ? path.join(sb, mine[mine.length - 1].file) : null;
  if (!file) {
    let names = [];
    try { names = fs.readdirSync(sb).filter((f) => new RegExp(`^${escRe(id)}(?:-(\\d+))?\\.png$`).test(f)); } catch { /* 沒有分鏡截圖 */ }
    names.sort((a, b) => Number(/-(\d+)\.png$/.exec(a)?.[1] || 0) - Number(/-(\d+)\.png$/.exec(b)?.[1] || 0));
    if (names.length) file = path.join(sb, names[names.length - 1]);
  }
  if (file && mtime(file) != null) out.push({ file, from: 'storyboard', t: mtime(file) });
  const au = path.join(P.project, 'work', 'audit-shots');
  let best = null;
  try {
    for (const f of fs.readdirSync(au)) {
      const m = new RegExp(`^${escRe(id)}-(\\d+(?:\\.\\d+)?)\\.jpg$`).exec(f);
      if (m && (!best || Number(m[1]) > best.sec)) best = { sec: Number(m[1]), file: path.join(au, f) };
    }
  } catch { /* 沒有量測截圖 */ }
  if (best) out.push({ file: best.file, from: 'audit', t: mtime(best.file) });
  return out.sort((a, b) => b.t - a.t)[0] || null;
}
// 這段的內容最後一次改的時間：動畫檔（compositions/ 裡這段的檔）、最新一版的段落.json（回饋輪 finish、改版、退回都會存）
export function sourceTime(P, sc, id) {
  const files = [];
  if (sc?.type === 'custom' && sc.src) files.push(path.join(P.out, sc.src));
  try { for (const f of fs.readdirSync(path.join(P.out, 'compositions'))) if (new RegExp(`(?:^|-)${escRe(id)}(?:-[^/]*)?\\.html$`).test(f)) files.push(path.join(P.out, 'compositions', f)); } catch { /* 還沒 build */ }
  const vd = path.join(P.project, 'work', 'versions', id);
  try {
    const last = fs.readdirSync(vd).map((n) => /^v(\d+)$/.exec(n)).filter(Boolean).sort((a, b) => Number(b[1]) - Number(a[1]))[0];
    if (last) files.push(path.join(vd, last[0], '段落.json'));
  } catch { /* 沒有版本 */ }
  return Math.max(0, ...files.map(mtime).filter((x) => x != null));
}
function shootDefault(P, ids, templateArg) {
  const r = runTool('qc.mjs', ['storyboard', '--project', P.project, '--only', ids.join(','), '--json', ...templateArg], { timeout: 20 * 60e3 });
  let j = null;
  try { j = JSON.parse(r.stdout); } catch { j = null; }
  if (r.status !== 0 || !j || j.ok === false) return { ok: false, message: [].concat(j?.errors || []).join('；') || tail(r.stderr || r.stdout) || `結束代碼 ${r.status}` };
  return { ok: true };
}

// ---------- 壓圖 ----------
// JPEG 的寬高（SOF 標記），給 <img width height>，載入時版面不跳
export function jpegSize(buf) {
  for (let i = 2; i + 9 < buf.length;) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xc3) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { i += 2; continue; }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}
// 縮到 width 寬、壓到 maxKB 以內（先降品質，再縮小）；回傳 { buf, w, h, over }
export function compressShot(src, { width, maxKB }) {
  let last = null;
  for (const w of [width, Math.round(width * 0.8 / 2) * 2, Math.round(width * 0.6 / 2) * 2]) {
    for (const q of SITE.q) {
      const r = spawnSync('ffmpeg', ['-v', 'error', '-i', src, '-vf', `scale='min(${w},iw)':-2:flags=lanczos`, '-frames:v', '1', '-q:v', String(q), '-f', 'image2', '-c:v', 'mjpeg', 'pipe:1'], { maxBuffer: 64 << 20 });
      if (r.status !== 0 || !r.stdout?.length) throw new Error(`ffmpeg 壓不了 ${path.basename(src)}：${tail(String(r.stderr || ''), 200)} → 確認 ffmpeg 裝好（setup/ 手冊），或那張截圖壞了就刪掉重跑`);
      last = { buf: r.stdout, ...(jpegSize(r.stdout) || {}) };
      if (r.stdout.length <= maxKB * 1024) return { ...last, over: false };
    }
  }
  return { ...last, over: true };
}

// ---------- 組頁面 ----------
export function renderSite({ templateDir, data }) {
  const tpl = fs.readFileSync(path.join(templateDir, 'site', 'review.html'), 'utf8');
  const mod = fs.readFileSync(path.join(HERE, 'requests-md.mjs'), 'utf8').replace(/^export\s+/gm, '');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return tpl.replace('__TITLE__', () => esc(`${data.name} 手機確認頁`)).replace('/*__BRAND__*/', () => brandVars(templateDir))
    .replace('/*__REQUESTS_MD__*/', () => mod).replace('__SITE_DATA__', () => JSON.stringify(data).replace(/</g, '\\u003c'));
}

// flags：{ only: ['s01'], round: true, template }；deps 的 shoot(P, ids)、check()、names() 換掉補截、build --check、模板名稱（測試用）
export function buildSite(P, flags = {}, { shoot = null, check: checkDep = null, names: namesDep = null, now = new Date(), log = () => {} } = {}) {
  const templateArg = flags.template ? ['--template', P.templateDir] : [];
  const plan = readJson(P.plan);
  if (!plan) throw new Error(`讀不到 ${projectRel(P.root, P.project)}/work/hyperframes/plan.json → 先做到分鏡表確認（auto-edit-storyboard）`);
  const check = checkDep ? checkDep(P) : checkJson(P, templateArg);
  const only = flags.only ? String(flags.only).split(/[,，、\s]+/).filter(Boolean) : null;
  const round = !only && flags.round ? roundSegs(P.project) : null;
  if (!only && flags.round && !round) throw new Error('這個專案還沒有回饋輪（work/feedback/r<N>.md）→ 拿掉 --round 放全部段，或用 --only 指定段');
  const { segs, scope } = siteSegments(P, check, plan, { only, round, names: namesDep ? namesDep(P) : namesOf(P) });
  const byId = new Map((plan.scenes || []).filter((s) => s && s.id).map((s) => [s.id, s]));
  // 截圖：沒有、或比動畫檔與版本舊的段一次補截
  const pick = () => new Map(segs.map((s) => [s.id, findShot(P, s.id)]));
  let shots = pick();
  const stale = (id) => { const s = shots.get(id); return !s || s.t + 1000 < sourceTime(P, byId.get(id), id); };
  const need = segs.filter((s) => stale(s.id)).map((s) => s.id);
  let shotFail = null;
  if (need.length) {
    log(`補截 ${need.length} 段的最後一格（${need.slice(0, 8).join('、')}${need.length > 8 ? '…' : ''}）…`);
    const r = (shoot || ((p, ids) => shootDefault(p, ids, templateArg)))(P, need);
    if (!r.ok) shotFail = r.message;
    shots = pick();
  }
  // 壓圖：段很多時每張壓小一點，整包盡量 15 MB 以內（base64 會大 4/3）
  const format = check.format === 'portrait' ? 'portrait' : 'landscape';
  const perKB = Math.max(SITE.minKB, Math.min(SITE.maxKB, Math.floor((SITE.budgetMB * 1024 * 1024 - 300 * 1024) / 1.34 / Math.max(1, segs.length) / 1024)));
  const warnings = [];
  let biggest = 0, made = 0;
  for (const s of segs) {
    const sh = shots.get(s.id);
    if (!sh) { s.img = null; s.imgNote = `這段沒有截圖${shotFail ? '（補截失敗）' : ''}`; continue; }
    const c = compressShot(sh.file, { width: SITE.width[format], maxKB: perKB });
    s.img = `data:image/jpeg;base64,${c.buf.toString('base64')}`;
    if (c.w) { s.imgW = c.w; s.imgH = c.h; }
    biggest = Math.max(biggest, c.buf.length);
    made++;
    if (stale(s.id)) s.imgNote = '這張截圖比這段最後一次修改舊，可能不是最新的';
    if (c.over) warnings.push(`${s.id} 的截圖壓到最小還是超過 ${perKB} KB（${Math.round(c.buf.length / 1024)} KB）`);
  }
  const rel = projectRel(P.root, P.project);
  const data = { v: 1, project: rel, name: path.basename(P.project), generated: rqStamp(now), format, scope, segs };
  const html = renderSite({ templateDir: P.templateDir, data });
  const dir = siteDir(P.project), file = path.join(dir, 'index.html');
  fs.mkdirSync(dir, { recursive: true });
  writeAtomic(file, html);
  const size = Buffer.byteLength(html);
  if (size > SITE.budgetMB * 1024 * 1024) warnings.push(`整包 ${(size / 1024 / 1024).toFixed(1)} MB，超過 ${SITE.budgetMB} MB → 加 --round 只放這一輪改到的段，或 --only 指定段`);
  const missing = segs.filter((s) => !s.img).map((s) => s.id), old = segs.filter((s) => s.img && s.imgNote).map((s) => s.id);
  if (shotFail) warnings.push(`補截沒有成功，${[...missing, ...old].join('、') || '—'} 用舊圖或沒有圖：${shotFail.includes('→') ? shotFail : `${shotFail} → 先跑 node shared/template/tools/build.mjs --project ${rel}，再跑一次`}；還是失敗就照樣發布，回報這行`);
  return { file, rel: `${rel}/work/site/index.html`, size, perKB, biggest, made, need, missing, old, scope, segs: segs.length, anim: segs.filter((s) => s.kind === 'anim').length, warnings, data };
}
