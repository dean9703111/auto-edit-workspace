#!/usr/bin/env node
/**
 * 段落版本：每一段（plan.json 的 id）留 v1、v2…，可以看預覽、並排比較、退回（停點 ④ 之後的回饋輪與改版用）
 *
 *   node shared/template/tools/versions.mjs save --project projects/<專案> --seg s12[,s08]
 *       把這段現在的樣子存成下一版 work/versions/<段>/v<N>/：段落.json（plan.json 那一段）、情境動畫的 x-*.html 與用到的
 *       illus-local/*.svg、分鏡.md（storyboard.md 那一節）、預覽.mp4（build --test＋render 這一段，6 秒的段約 20 秒）、
 *       預覽.jpg（預覽每 0.5 秒一格，最多 24 格）。
 *       和某一版一模一樣就不另存（印「沒變」，缺預覽才補）；有已確認的提案（versions.mjs accept 過）就存進那一版。
 *       上一個使用中的版本也有預覽時，另出 work/versions/<段>/比較-v<舊>-v<新>.mp4（左舊右新，上方標版本號，聲音用新版）。
 *   node shared/template/tools/versions.mjs new --project projects/<專案> --seg s12[,s08] [--note "使用者原話"]
 *       改版第一步：先 save 現在的樣子，再開提案 work/versions/<段>/v<N+1>/分鏡.md（抄 storyboard.md 那一節，等 AI 改），
 *       印出停點 ③ 那一行。已經有還沒做完的提案就沿用它。
 *   node shared/template/tools/versions.mjs accept --project projects/<專案> --seg s12[,s08]
 *       使用者說「可以」之後：把提案 分鏡.md 的「## 分鏡」整節寫回 work/storyboard.md 那一段（audit 照它對拍），印出下一步。
 *   node shared/template/tools/versions.mjs use --project projects/<專案> --seg s12 --ver v1
 *       退回某一版：先 save 現在的樣子（不會弄丟），再把那一版的段落、x 檔、svg、分鏡寫回 plan.json、compositions/、
 *       illus-local/、storyboard.md；沒做完的提案標成「放棄」。之後要 build。
 *   node shared/template/tools/versions.mjs list --project projects/<專案> [--seg s12] [--json]
 *       列出每段的版本、哪一版是目前的（和現在的 plan.json、x 檔一致）、比較影片。
 *
 * --project：同 build.mjs。版本只能用這支工具建、退回，不要手動複製或改 work/versions/ 裡的檔（分鏡.md 的提案除外）。
 * --no-preview：只存檔案，不 build、不 render（一段幾秒，不用等 20–30 秒的預覽）。這一段還沒有任何版本時用（第一次存、
 *   沒給使用者確認過的草稿，左右比較沒有意義）；之後同一段不加 --no-preview 再 save，會補上缺的預覽。
 * 測試用：--template <shared/template 資料夾>
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pathsFrom } from './build.mjs';
import { hfArgs } from './lib/hf.mjs';
import { run, probeMedia, writeJpg } from './lib/ff.mjs';
import { canvas, text, textWidth } from './lib/raster.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DIR = 'versions';
const META = '.meta.json';
const STATE = '.state.json';
export const PREVIEW = { tail: 0.5, fps: 2, maxCells: 24, bar: 64, labelScale: 6 };
const PLACEHOLDER = '（寫 1–5 條';
const VALUE_FLAGS = ['project', 'seg', 'note', 'ver', 'template'];

const posix = (p) => p.split(path.sep).join('/');
// 工作區（目前資料夾）外的路徑印絕對路徑（同 qc.mjs）
const rel = (p) => { const r = path.relative(process.cwd(), p); return !r ? '.' : r.startsWith('..') || path.isAbsolute(r) ? path.resolve(p) : posix(r); };
const tail = (s, n = 300) => String(s ?? '').trim().slice(-n);
const r2 = (n) => Math.round(n * 100) / 100;
const hashOf = (s) => createHash('sha256').update(s).digest('hex').slice(0, 12);
const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const writeJson = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 2) + '\n'); };
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const now = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
const pj = (P) => `projects/${path.basename(P.project)}`;
const firstErr = (r) => { const all = `${r.stderr || ''}\n${r.stdout || ''}`; return (all.split('\n').find((l) => l.startsWith('✖')) || tail(all, 160)).trim(); };

// ---------- storyboard.md 的一節：「### <id>｜…」到下一個 #、##、### 標題之前（#### 動畫分鏡、插圖清單算在裡面） ----------
export function findSection(md, id) {
  const ls = String(md).split('\n');
  const re = new RegExp(`^###\\s+${esc(id)}(?=$|[\\s｜|（(：:])`);
  const i = ls.findIndex((l) => re.test(l));
  if (i < 0) return null;
  let j = i + 1;
  while (j < ls.length && !/^#{1,3}\s/.test(ls[j])) j++;
  let k = j;
  while (k > i + 1 && !ls[k - 1].trim()) k--;
  return { start: i, end: k, text: ls.slice(i, k).join('\n') };
}

export function replaceSection(md, id, body) {
  const ls = String(md).split('\n');
  const s = findSection(md, id);
  const add = String(body).replace(/\s+$/, '').split('\n');
  if (s) { ls.splice(s.start, s.end - s.start, ...add); return ls.join('\n'); }
  const at = ls.findIndex((l) => /^##\s+需要我決定的事/.test(l));
  if (at >= 0) { ls.splice(at, 0, ...add, '', ''); return ls.join('\n'); }
  return `${String(md).replace(/\s+$/, '')}\n\n${add.join('\n')}\n`;
}

const headOf = (md) => { const i = md.search(/^## 分鏡\s*$/m); return i < 0 ? md : md.slice(0, i); };
export const bodyOf = (md) => { const m = md.match(/^## 分鏡\s*$/m); return m ? md.slice(m.index + m[0].length).replace(/^\s*\n/, '').replace(/\s+$/, '') : null; };
const sectionBlock = (snap) => `## 分鏡\n\n${snap.section ?? `（work/storyboard.md 沒有「### ${snap.id}」這一節）`}\n`;

// ---------- 這段現在的樣子 ----------
export function snapshotOf(P, id) {
  const plan = readJson(P.plan);
  if (!plan) throw new Error(`讀不到 ${rel(P.plan)} → 先跑 node shared/template/tools/build.mjs --project ${pj(P)} --check 看 plan.json 哪裡壞了`);
  const seg = (plan.scenes || []).find((s) => s && s.id === id);
  if (!seg) throw new Error(`plan.json 沒有「${id}」這一段 → 段 id 照 build.mjs --check 報告的第一欄（例 s12）；「1:10 那段」先對照報告的起–迄找 id`);
  const files = [];
  if (seg.type === 'custom' && seg.src) {
    const f = path.join(P.out, seg.src);
    if (fs.existsSync(f)) {
      const c = fs.readFileSync(f, 'utf8');
      files.push({ rel: posix(seg.src), store: path.basename(seg.src), content: c });
      for (const m of new Set([...c.matchAll(/illus-local\/[^"'`\s)]+?\.svg/g)].map((x) => x[0]))) {
        const s = path.join(P.out, m);
        if (fs.existsSync(s)) files.push({ rel: m, store: m, content: fs.readFileSync(s, 'utf8') });
      }
    }
  }
  const sb = path.join(P.project, 'work', 'storyboard.md');
  const section = fs.existsSync(sb) ? findSection(fs.readFileSync(sb, 'utf8'), id)?.text ?? null : null;
  const srt = fs.existsSync(P.srt) ? hashOf(fs.readFileSync(P.srt, 'utf8')) : null;
  const hash = hashOf([JSON.stringify(seg), ...files.map((x) => `${x.rel}\0${x.content}`)].join('\0'));
  return { id, seg, files, section, hash, srt };
}

export const segDir = (project, id) => path.join(project, 'work', DIR, id);

export function listVersions(project, id) {
  const d = segDir(project, id);
  let names = [];
  try { names = fs.readdirSync(d); } catch { /* 還沒有版本 */ }
  return names.map((n) => /^v(\d+)$/.exec(n)).filter(Boolean).map((m) => {
    const dir = path.join(d, m[0]);
    return { n: Number(m[1]), name: m[0], dir, meta: readJson(path.join(dir, META), {}) || {},
      complete: fs.existsSync(path.join(dir, '段落.json')), preview: fs.existsSync(path.join(dir, '預覽.mp4')) };
  }).sort((a, b) => a.n - b.n);
}
const pendingOf = (vers) => vers.find((v) => !v.complete && v.meta.state !== '放棄') || null;
const segIds = (project) => { try { return fs.readdirSync(path.join(project, 'work', DIR), { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name).sort(); } catch { return []; } };

const stateFile = (project) => path.join(project, 'work', DIR, STATE);
const readState = (project) => readJson(stateFile(project), {}) || {};
const writeState = (project, s) => writeJson(stateFile(project), s);

// status.mjs 用：storyboard.md 最後一次是被 accept／use 寫的（不是停點 ③ 還在改）
export function storyboardByVersions(project) {
  const t = readState(project).storyboardMtime;
  let m = null;
  try { m = fs.statSync(path.join(project, 'work', 'storyboard.md')).mtimeMs; } catch { return false; }
  return Number.isFinite(t) && Math.abs(m - t) < 1000;
}

// status.mjs 用：還沒做完的提案（提案＝等使用者確認；已確認＝accept 過、還沒 save）
export function pendingRevisions(project) {
  return segIds(project).map((id) => { const p = pendingOf(listVersions(project, id)); return p ? { id, v: p.n, state: p.meta.state || '提案' } : null; }).filter(Boolean);
}

function markStoryboard(P, md) {
  const f = path.join(P.project, 'work', 'storyboard.md');
  fs.writeFileSync(f, md);
  const st = readState(P.project);
  st.storyboardMtime = fs.statSync(f).mtimeMs;
  writeState(P.project, st);
}

function writeVersionFiles(dir, snap) {
  fs.mkdirSync(dir, { recursive: true });
  writeJson(path.join(dir, '段落.json'), snap.seg);
  for (const f of snap.files) {
    const t = path.join(dir, ...f.store.split('/'));
    fs.mkdirSync(path.dirname(t), { recursive: true });
    fs.writeFileSync(t, f.content);
  }
}
const metaOf = (snap) => ({ hash: snap.hash, srt: snap.srt, files: snap.files.map((f) => ({ rel: f.rel, store: f.store })) });

// ---------- 預覽：build --test 這一段 → render → 拼格 ----------
export function contactSheet(mp4, out, portrait = false) {
  const dur = probeMedia(mp4).duration || 1;
  const fps = Math.min(PREVIEW.fps, PREVIEW.maxCells / dur);
  const n = Math.max(1, Math.floor(dur * fps + 1e-6));
  const cols = portrait ? 6 : 4, rows = Math.ceil(n / cols), w = portrait ? 240 : 480;
  const r = run('ffmpeg', ['-y', '-v', 'error', '-i', mp4, '-vf', `fps=${fps.toFixed(3)},scale=${w}:-2,tile=${cols}x${rows}:padding=4:margin=4:color=white`, '-frames:v', '1', '-q:v', '3', out]);
  if (r.status !== 0 || !fs.existsSync(out)) throw new Error(`拼不出 ${path.basename(out)}：${tail(r.stderr, 200)}`);
}

export function compareClip(a, b, out, labels) {
  const m = probeMedia(b);
  const hw = Math.round(m.width / 4) * 2, hh = Math.round(m.height / 4) * 2, bar = PREVIEW.bar, S = PREVIEW.labelScale;
  const lab = canvas(hw * 2, bar, [24, 24, 24]);
  labels.forEach((t, i) => text(lab, t, i * hw + Math.round((hw - textWidth(t, S)) / 2), Math.round((bar - 7 * S) / 2), S, [255, 255, 255]));
  const tmp = out.replace(/\.mp4$/, '.label.jpg');
  writeJpg(lab, tmp);
  const fc = `[0:v]scale=${hw}:${hh},setsar=1[l];[1:v]scale=${hw}:${hh},setsar=1[r];[l][r]hstack=inputs=2[s];[s]pad=iw:ih+${bar}:0:${bar}[p];[p][2:v]overlay=0:0:shortest=1,format=yuv420p[v]`;
  const args = ['-y', '-v', 'error', '-i', a, '-i', b, '-loop', '1', '-i', tmp, '-filter_complex', fc, '-map', '[v]'];
  if (m.hasAudio) args.push('-map', '1:a', '-c:a', 'aac', '-b:a', '128k');
  args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-movflags', '+faststart', out);
  const r = run('ffmpeg', args);
  fs.rmSync(tmp, { force: true });
  if (r.status !== 0 || !fs.existsSync(out)) throw new Error(`做不出 ${path.basename(out)}：${tail(r.stderr, 200)}`);
}

function makePreview(P, flags, id, dir, log) {
  const extra = flags.template ? ['--template', path.resolve(flags.template)] : [];
  const build = (args) => spawnSync(process.execPath, [path.join(HERE, 'build.mjs'), '--project', P.project, ...args, ...extra], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const again = '修好後再跑一次同一行（檔案已經存好，只會補預覽）';
  const fail = (why, fix) => { log(`⚠ ${id} 的預覽沒做：${why} → ${fix}`); return false; };
  const c = build(['--check', '--json']);
  let j = null;
  try { j = JSON.parse(c.stdout); } catch { /* 下面處理 */ }
  if (!j) return fail(`build --check 沒有輸出（${tail(c.stderr, 160)}）`, again);
  if (!j.ok) return fail(`plan.json 有 ✖（${(j.errors || [])[0] ?? '?'}）`, `照 build.mjs --check 的 → 修好，${again}`);
  const o = (j.items || []).find((x) => x.id === id)?.out;
  if (!o || !Number.isFinite(o.start)) return fail('--check 找不到這段在成片的時間', again);
  const t0 = r2(o.start), len = r2(Math.max(0.5, Math.min(o.end - o.start + PREVIEW.tail, (j.outputDur ?? Infinity) - o.start)));
  const b = build(['--test', `${t0},${len}`]);
  if (b.status !== 0) return fail(`build 失敗（${firstErr(b)}）`, `照 build 印的 → 修好，${again}`);
  const mp4 = path.join(dir, '預覽.mp4');
  const r = spawnSync(process.execPath, hfArgs(['render', '-c', 'compositions/test-clip.html', '--quality', 'draft', '-o', posix(path.relative(P.out, mp4))]), { cwd: P.out, encoding: 'utf8', timeout: 900000, maxBuffer: 1 << 28 });
  if (r.status !== 0 || !fs.existsSync(mp4)) return fail(`render 失敗（${tail(r.stderr || r.stdout, 200)}）`, `先跑 (cd ${pj(P)}/work/hyperframes && npx hyperframes check) 看錯誤，${again}`);
  try { contactSheet(mp4, path.join(dir, '預覽.jpg'), j.format === 'portrait'); } catch (e) { log(`⚠ ${id}：${e.message}（預覽.mp4 已經好了，可以直接看）`); }
  return true;
}

// ---------- save ----------
export function saveSeg(P, flags, id, log, opt = {}) {
  const snap = snapshotOf(P, id);
  const vers = listVersions(P.project, id);
  const same = vers.find((v) => v.complete && v.meta.hash === snap.hash) || null;
  const pend = pendingOf(vers);
  let target, created = false;
  if (pend) {
    const cur = same || vers.filter((v) => v.complete).at(-1);
    if (pend.meta.state !== '已確認') throw new Error(`${id} 的 v${pend.n} 分鏡還在等使用者確認 → 使用者說「可以」先跑 node shared/template/tools/versions.mjs accept --project ${pj(P)} --seg ${id}；不改了就跑 node shared/template/tools/versions.mjs use --project ${pj(P)} --seg ${id} --ver v${cur?.n ?? 1}（提案標成放棄）`);
    if (same) throw new Error(`${id} 還和 v${same.n} 一模一樣：v${pend.n} 的分鏡還沒做 → 照 auto-edit-motion 做完、build 之後再跑這一行`);
    writeVersionFiles(pend.dir, snap);
    const mdFile = path.join(pend.dir, '分鏡.md');
    const old = fs.existsSync(mdFile) ? fs.readFileSync(mdFile, 'utf8') : `# ${id} v${pend.n}（改版）\n\n`;
    fs.writeFileSync(mdFile, headOf(old) + sectionBlock(snap));
    writeJson(path.join(pend.dir, META), { ...pend.meta, ...metaOf(snap), state: '完成', done: now() });
    target = { ...pend, complete: true };
    created = true;
  } else if (same) {
    target = same;
  } else {
    const n = (vers.at(-1)?.n ?? 0) + 1;
    const dir = path.join(segDir(P.project, id), `v${n}`);
    writeVersionFiles(dir, snap);
    const kind = opt.kind || '存檔';
    fs.writeFileSync(path.join(dir, '分鏡.md'), `# ${id} v${n}（${kind}）\n\n- 時間：${now()}${opt.note ? `\n- 原話：${opt.note}` : ''}\n\n${sectionBlock(snap)}`);
    writeJson(path.join(dir, META), { id, v: n, kind, state: '完成', time: now(), ...(opt.note ? { note: opt.note } : {}), ...metaOf(snap) });
    target = { n, name: `v${n}`, dir, complete: true, preview: false };
    created = true;
  }
  log(created ? `${id}：存成 v${target.n}（${rel(target.dir)}/）` : `${id}：沒變，目前就是 v${target.n}（${rel(target.dir)}/）`);
  const mp4 = path.join(target.dir, '預覽.mp4');
  let previewOk = fs.existsSync(mp4);
  if (!previewOk && !flags['no-preview']) {
    previewOk = makePreview(P, flags, id, target.dir, log);
    if (previewOk) log(`  預覽：${rel(mp4)}（${probeMedia(mp4).duration} 秒）、預覽.jpg`);
  }
  // 比較：上一個使用中的版本 → 這一版
  const st = readState(P.project);
  st.live = st.live || {}; st.prev = st.prev || {};
  if (st.live[id] !== target.n) {
    st.prev[id] = st.live[id] ?? vers.filter((v) => v.complete && v.n < target.n).at(-1)?.n ?? null;
    st.live[id] = target.n;
    writeState(P.project, st);
  }
  let cmp = null;
  const pv = st.prev[id];
  const prev = pv != null && pv !== target.n ? listVersions(P.project, id).find((v) => v.n === pv && v.preview) : null;
  if (previewOk && prev) {
    cmp = path.join(segDir(P.project, id), `比較-v${prev.n}-v${target.n}.mp4`);
    if (!fs.existsSync(cmp)) {
      try { compareClip(path.join(prev.dir, '預覽.mp4'), mp4, cmp, [`v${prev.n}`, `v${target.n}`]); } catch (e) { log(`⚠ ${id}：${e.message} → 兩版的 預覽.mp4 都在，可以分開看`); cmp = null; }
    }
    if (cmp) log(`  比較：${rel(cmp)}（左 v${prev.n}、右 v${target.n}）`);
  }
  return { id, n: target.n, dir: target.dir, created, previewOk, cmp };
}

// ---------- new（改版提案） ----------
export function newProposal(P, flags, id, log, note = null) {
  const vers = listVersions(P.project, id);
  const pend = pendingOf(vers);
  if (pend) {
    log(`${id}：v${pend.n} 的提案已經在了（${pend.meta.state || '提案'}）→ 直接改 ${rel(path.join(pend.dir, '分鏡.md'))}`);
    return { id, n: pend.n, file: path.join(pend.dir, '分鏡.md'), reused: true };
  }
  const cur = saveSeg(P, flags, id, log);
  const n = Math.max(cur.n, ...listVersions(P.project, id).map((v) => v.n)) + 1;
  const dir = path.join(segDir(P.project, id), `v${n}`);
  const snap = snapshotOf(P, id);
  const md = [`# ${id} v${n}（改版）`, '', `- 提案：${now()}`, ...(note ? [`- 原話：${note}`] : []),
    `- 現在的樣子：[v${cur.n}/預覽.mp4](../v${cur.n}/預覽.mp4)、[v${cur.n}/預覽.jpg](../v${cur.n}/預覽.jpg)`, '',
    '## 這版要改什麼', '', `- ${PLACEHOLDER}：和 v${cur.n} 差在哪、為什麼；動態只用 BEATS.md 語彙表的名稱）`, '', sectionBlock(snap)].join('\n');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '分鏡.md'), md);
  writeJson(path.join(dir, META), { id, v: n, kind: '改版', state: '提案', time: now(), ...(note ? { note } : {}) });
  log(`${id}：提案開好了 ${rel(path.join(dir, '分鏡.md'))}（現在的樣子是 v${cur.n}）`);
  return { id, n, file: path.join(dir, '分鏡.md'), reused: false };
}

// ---------- accept ----------
export function acceptProposal(P, id, log) {
  const pend = pendingOf(listVersions(P.project, id));
  if (!pend) throw new Error(`${id} 沒有等確認的提案 → 先跑 node shared/template/tools/versions.mjs new --project ${pj(P)} --seg ${id}`);
  const file = path.join(pend.dir, '分鏡.md');
  const md = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (md.includes(PLACEHOLDER)) throw new Error(`${rel(file)} 的「這版要改什麼」還是範本那一行 → 寫 1–5 條和上一版差在哪，給使用者看過再 accept`);
  const body = bodyOf(md);
  if (!body || !findSection(body, id)) throw new Error(`${rel(file)} 的「## 分鏡」底下找不到「### ${id}｜…」那一節 → 照 storyboard.md 的格式寫（標題、截圖觀察、#### 動畫分鏡 ${id}）`);
  const sbFile = path.join(P.project, 'work', 'storyboard.md');
  const sb = fs.existsSync(sbFile) ? fs.readFileSync(sbFile, 'utf8') : '';
  markStoryboard(P, replaceSection(sb, id, body));
  writeJson(path.join(pend.dir, META), { ...pend.meta, state: '已確認', accepted: now() });
  log(`${id}：v${pend.n} 的分鏡寫回 work/storyboard.md（### ${id} 那一節）`);
  return { id, n: pend.n };
}

// ---------- use（退回） ----------
export function useVersion(P, flags, id, ver, log) {
  const want = Number(String(ver ?? '').replace(/^v/i, ''));
  const vers = listVersions(P.project, id);
  const t = vers.find((v) => v.n === want && v.complete);
  if (!t) throw new Error(`${id} 沒有做完的 v${Number.isFinite(want) ? want : ver}（有：${vers.filter((v) => v.complete).map((v) => v.name).join('、') || '無'}）→ 先跑 node shared/template/tools/versions.mjs list --project ${pj(P)} --seg ${id} 看有哪幾版`);
  for (const v of vers) if (!v.complete && v.meta.state !== '放棄') { writeJson(path.join(v.dir, META), { ...v.meta, state: '放棄', dropped: now() }); log(`${id}：v${v.n} 的提案標成放棄`); }
  saveSeg(P, flags, id, log);
  const seg = readJson(path.join(t.dir, '段落.json'));
  const plan = readJson(P.plan);
  const i = (plan?.scenes || []).findIndex((s) => s && s.id === id);
  if (i < 0) throw new Error(`plan.json 沒有「${id}」這一段了 → 退回不了；要加回這段，照 v${t.n}/段落.json 手動放進 plan.json 的 scenes`);
  plan.scenes[i] = seg;
  fs.writeFileSync(P.plan, JSON.stringify(plan, null, 2) + '\n');
  const restored = [];
  for (const f of t.meta.files || []) {
    const src = path.join(t.dir, ...f.store.split('/'));
    if (!fs.existsSync(src)) continue;
    const dst = path.join(P.out, ...f.rel.split('/'));
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    restored.push(path.basename(f.rel));
  }
  const body = bodyOf(fs.existsSync(path.join(t.dir, '分鏡.md')) ? fs.readFileSync(path.join(t.dir, '分鏡.md'), 'utf8') : '');
  const sbFile = path.join(P.project, 'work', 'storyboard.md');
  if (body && findSection(body, id) && fs.existsSync(sbFile)) { markStoryboard(P, replaceSection(fs.readFileSync(sbFile, 'utf8'), id, body)); restored.push('storyboard.md 那一節'); }
  const st = readState(P.project);
  st.live = st.live || {}; st.prev = st.prev || {};
  if (st.live[id] !== t.n) { st.prev[id] = st.live[id] ?? null; st.live[id] = t.n; }
  writeState(P.project, st);
  log(`${id}：退回 v${t.n}：plan.json 這段${restored.length ? `、${restored.join('、')}` : ''}都換成 v${t.n} 的`);
  const srt = fs.existsSync(P.srt) ? hashOf(fs.readFileSync(P.srt, 'utf8')) : null;
  if (t.meta.srt && srt && t.meta.srt !== srt) log(`⚠ 字幕在 v${t.n} 之後改過，這段的句號（#N）可能對不上 → build --check 看「文字對時」，有 ✖ 照 → 改`);
  return { id, n: t.n };
}

// ---------- list ----------
export function listAll(P, only = null) {
  const ids = only?.length ? only : segIds(P.project);
  return ids.map((id) => {
    let cur = null;
    try { cur = snapshotOf(P, id).hash; } catch { /* plan.json 沒這段了 */ }
    const vers = listVersions(P.project, id).map((v) => ({ v: v.name, time: v.meta.time || '', kind: v.meta.kind || '存檔', state: v.meta.state || (v.complete ? '完成' : '提案'),
      note: v.meta.note || '', preview: v.preview, current: !!(cur && v.complete && v.meta.hash === cur), dir: rel(v.dir) }));
    let compares = [];
    try { compares = fs.readdirSync(segDir(P.project, id)).filter((f) => /^比較-v\d+-v\d+\.mp4$/.test(f)).sort(); } catch { /* 沒有 */ }
    return { id, versions: vers, compares };
  });
}

// ---------- CLI ----------
export function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const flags = { cmd };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    const m = a.match(/^--([\w-]+)(?:=(.*))?$/);
    if (!m) throw new Error(`看不懂的參數「${a}」→ 用 --help 看用法`);
    if (VALUE_FLAGS.includes(m[1])) flags[m[1]] = m[2] ?? rest[++i];
    else if (['json', 'no-preview', 'help'].includes(m[1])) flags[m[1]] = true;
    else throw new Error(`沒有 --${m[1]} 這個參數 → 用 --help 看用法`);
  }
  return flags;
}

export function cli(argv = process.argv.slice(2)) {
  if (!argv.length || argv.includes('--help')) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*\n?/, '').replace(/^ \* ?/gm, '')); return 0; }
  const flags = parseArgs(argv);
  const CMDS = ['save', 'new', 'accept', 'use', 'list'];
  if (!CMDS.includes(flags.cmd)) throw new Error(`沒有「${flags.cmd}」這個指令：只有 ${CMDS.join('、')} → 改成其中一個（用 --help 看用法）`);
  const P = pathsFrom(flags);
  const ids = String(flags.seg || '').split(/[,，、\s]+/).filter(Boolean);
  if (flags.cmd !== 'list' && !ids.length) throw new Error(`${flags.cmd} 要加 --seg <段 id>（例 --seg s12，好幾段用逗號 --seg s08,s12）`);
  const log = (s) => console.log(s);
  const cmdLine = (sub, extra = '') => `node shared/template/tools/versions.mjs ${sub} --project ${pj(P)} --seg ${ids.join(',')}${extra}`;
  if (flags.cmd === 'list') {
    const all = listAll(P, ids);
    if (flags.json) { console.log(JSON.stringify({ project: pj(P), segs: all }, null, 2)); return 0; }
    if (!all.length) { log('還沒有任何段落版本（停點 ④ 之後的回饋輪、改版才會建立）'); return 0; }
    for (const s of all) {
      log(s.id);
      if (!s.versions.length) log('  （沒有版本）');
      for (const v of s.versions) log(`  ${v.v}  ${v.time.padEnd(16)}  ${v.kind}${v.state !== '完成' ? `（${v.state}）` : ''}${v.preview ? '  預覽.mp4' : ''}${v.current ? '  ← 目前' : ''}${v.note ? `  ${v.note}` : ''}`);
      for (const c of s.compares) log(`  比較：${rel(path.join(segDir(P.project, s.id), c))}`);
    }
    return 0;
  }
  if (flags.cmd === 'save') { for (const id of ids) saveSeg(P, flags, id, log); return 0; }
  if (flags.cmd === 'new') {
    const r = ids.map((id) => newProposal(P, flags, id, log, flags.note || null));
    log(`→ 下一步：改每份 分鏡.md 的「這版要改什麼」和「## 分鏡」（動畫分鏡表頭照抄、動態只用 BEATS.md 語彙），work/製作進度.md 停點紀錄加一列「③ 分鏡表（${r.map((x) => `${x.id} v${x.n}`).join('、')}）｜待回覆」，回覆最後一行照抄下一行`);
    log(`⏸ 停點 ③ 分鏡表（${r.map((x) => `${x.id} v${x.n}`).join('、')}）｜請看：${r.map((x) => rel(x.file)).join('、')}｜請回：「可以」或要改的拍`);
    return 0;
  }
  if (flags.cmd === 'accept') {
    for (const id of ids) acceptProposal(P, id, log);
    log(`→ 下一步：照 auto-edit-motion 做 ${ids.join('、')}（x 檔已經在就從步驟 4 改；情境換了先改 plan.json 這段的 src、layout），build、audit --only 都 0 個 ✖ 之後跑：`);
    log(cmdLine('save'));
    return 0;
  }
  if (flags.cmd === 'use') {
    if (ids.length !== 1) throw new Error('use 一次只退回一段 → --seg 只寫一個段 id');
    if (!flags.ver) throw new Error('use 要加 --ver（例 --ver v1）→ 先跑 versions.mjs list 看有哪幾版');
    useVersion(P, flags, ids[0], flags.ver, log);
    log(`→ 下一步：build、audit --only ${ids[0]}，再開 Studio（停點 ④）：`);
    log(`node shared/template/tools/build.mjs --project ${pj(P)}`);
    return 0;
  }
  return 0;
}

const isMain = () => { try { return !!process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } };
if (isMain()) { try { process.exitCode = cli(); } catch (e) { console.error(`✖ ${e.message}`); process.exitCode = 1; } }
