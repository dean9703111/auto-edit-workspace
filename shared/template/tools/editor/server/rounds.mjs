// 068 修改單「已改完」分頁：只列最近一輪回饋（work/feedback/r<N>.md「改了哪幾段」）的修改紀錄，不是歷來全部；
// 每段可以「用上一版」退回這一輪改之前的樣子（versions.mjs use，會先把現在的樣子存成一版，所以也能再改回來）。
// 作者原話：「已改完是呈現這次總共修改的紀錄，而非全部，否則會有重複段落」「已改完如果不想採納，希望用上一個版本也是有彈性的」
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const VERSIONS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../versions.mjs');
const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const mtime = (f) => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } };
const fbDir = (project) => path.join(project, 'work', 'feedback');
// 剪輯台退回開的回饋輪（r<N> → { seg, ver, of }）：「已改完」跳過這幾輪，才不會一退回就只剩那一段
const revertsFile = (project) => path.join(fbDir(project), 'editor-reverts.json');
function readReverts(project) { try { const o = JSON.parse(fs.readFileSync(revertsFile(project), 'utf8')); return isObj(o) ? o : {}; } catch { return {}; } }
function writeReverts(project, o) { const f = revertsFile(project); fs.writeFileSync(`${f}.tmp`, JSON.stringify(o, null, 2) + '\n'); fs.renameSync(`${f}.tmp`, f); }

// r<N>.md「改了哪幾段」每一列：「- <段>：<做了什麼>（vA → vB）」改過、「（→ v1）」新的段、「這段從 plan.json 拿掉了」
export function parseChanged(md) {
  const sec = String(md).split(/^## 改了哪幾段[ \t]*$/m)[1]?.split(/^## /m)[0] || '';
  const rows = [];
  for (const m of sec.matchAll(/^- (\S+?)：(.+)$/gm)) {
    const note = m[2].trim(), v = note.match(/（(v\d+) → (v\d+)）$/);
    const kind = v ? 'changed' : /（→ v\d+）$/.test(note) ? 'new' : /這段從 plan\.json 拿掉了/.test(note) ? 'removed' : 'other';
    rows.push({ id: m[1], kind, note: note.replace(/（(?:v\d+ )?→ v\d+）$/, '').trim(), ...(v ? { before: v[1], after: v[2] } : {}) });
  }
  return rows;
}

// 最近一輪：編號最大、不是剪輯台退回開的、不是 AI 還在改的（還沒收尾）、而且「改了哪幾段」有內容
export function latestRound(project, openN = null) {
  let ns = [];
  try { ns = fs.readdirSync(fbDir(project)).map((f) => f.match(/^r(\d+)\.md$/)).filter(Boolean).map((m) => Number(m[1])).sort((a, b) => b - a); } catch { return null; }
  const reverts = readReverts(project);
  for (const n of ns) {
    const round = `r${n}`, file = path.join(fbDir(project), `${round}.md`);
    if (reverts[round] || n === openN) continue;
    const md = fs.readFileSync(file, 'utf8');
    const rows = parseChanged(md);
    if (!rows.length) continue;
    const time = md.match(/^# 回饋 r\d+（([^）]+)）/m)?.[1] || '';
    return { round, file, time, rows };
  }
  return null;
}

function runNode(args, cwd) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, args, { cwd, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' }, windowsHide: true });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('error', (e) => resolve({ code: -1, out: out + e.message }));
    p.on('close', (code) => resolve({ code, out }));
  });
}
const projArg = (P) => path.relative(P.root, P.project).split(path.sep).join('/') || '.';
const versionsArgs = (P, args) => [VERSIONS, ...args, '--project', projArg(P), ...(P.templateDir ? ['--template', P.templateDir] : [])];
const loadVersions = () => import(pathToFileURL(VERSIONS).href);

// 每段現在用哪一版（versions.mjs list 要比對檔案雜湊、跑 build --check，長片幾秒）：子處理程序算，結果照檔案時間記住
const cache = new Map();   // project → { key, value }
const inflight = new Map();
async function currentVersions(P, ids, run = runNode) {
  if (!ids.length) return {};
  const r = await run(versionsArgs(P, ['list', '--seg', ids.join(','), '--json']), P.root);
  let o = null;
  try { o = JSON.parse(r.out.slice(r.out.indexOf('{'))); } catch { /* 下面當成讀不到 */ }
  if (!o?.segs) throw new Error(r.out.split('\n').find((l) => l.startsWith('✖')) || '讀不到版本清單（versions.mjs list）');
  return Object.fromEntries(o.segs.map((s) => [s.id, s.versions.find((v) => v.current)?.v || null]));
}

let job = null;   // 正在換版本的那一段：{ seg, ver, round, of, state: running｜done｜failed, message, at }
async function openRoundN(P) {
  const V = await loadVersions();
  return V.openRound(P.project)?.n ?? null;
}

// run：跑 versions.mjs 的方法（測試換成假的）
export async function roundInfo(P, { run = runNode } = {}) {
  const openN = await openRoundN(P);
  const last = latestRound(P.project, openN);
  if (!last) return { round: null, rows: [], open: openN ? `r${openN}` : null, job: job && { ...job } };
  const key = [last.round, mtime(last.file), mtime(P.plan), mtime(revertsFile(P.project)), job?.at || 0, job?.state || ''].join(':');
  const hit = cache.get(P.project);
  let cur;
  // 換版本跑的時候不重算（plan.json 會一直變，又要跟 build 搶），先用上次的結果；跑完再算
  if (hit?.key === key || (job?.state === 'running' && hit?.round === last.round)) cur = hit.value;
  else {
    const ids = last.rows.filter((r) => r.kind === 'changed').map((r) => r.id);
    const k = `${P.project}:${key}`;
    // 讀不到版本清單（例：plan.json 壞了）：紀錄照列，只是不給換版本
    if (!inflight.has(k)) inflight.set(k, currentVersions(P, ids, run).catch((e) => ({ error: e.message })).finally(() => inflight.delete(k)));
    cur = await inflight.get(k);
    if (!cur.error) cache.set(P.project, { key, value: cur, round: last.round });
  }
  const rows = last.rows.map((r) => {
    if (r.kind !== 'changed') return r;
    if (cur.error) return { ...r, current: null, state: 'unknown' };
    const c = cur[r.id] ?? null;
    // kept＝用這一輪改的版本；reverted＝已退回這一輪改之前；later＝之後又改過（剪輯台或 AI）；gone＝plan.json 沒這段了
    const state = !(r.id in cur) ? 'gone' : c === r.after ? 'kept' : c === r.before ? 'reverted' : 'later';
    return { ...r, current: c, state };
  });
  return { round: last.round, time: last.time, rows, open: openN ? `r${openN}` : null, job: job && { ...job }, ...(cur.error ? { listError: cur.error } : {}) };
}

// 換版本：不採納＝用這一輪改之前那一版（before）；改回＝用這一輪改的那一版（after）。
// 沒有開著的回饋輪時 versions.mjs use 自己 begin → use → finish（備份、紀錄、build、audit、停點 ④），這一輪記進 editor-reverts.json。
// 檢查沒過（✖）：換回原本那一版、finish --no-change 收掉這一輪，回報 ✖ 原文（不留一個半套的退回）
export async function startUse(P, body, { onDone, run = runNode } = {}) {
  const { seg, ver } = body || {};
  if (typeof seg !== 'string' || !/^[\w-]+$/.test(seg) || typeof ver !== 'string' || !/^v\d+$/.test(ver)) return [400, { message: '請提供段 id（seg）和版本（ver，例 v1）' }];
  if (job?.state === 'running') return [409, { message: `${job.seg} 正在換版本，等它做完再換下一段` }];
  const info = await roundInfo(P, { run });
  if (info.open) return [409, { message: `AI 正在改（${info.open} 還沒收尾），等它做完再換版本` }];
  const row = info.rows.find((r) => r.id === seg && r.kind === 'changed');
  if (!row || ![row.before, row.after].includes(ver)) return [400, { message: `${seg} 不在 ${info.round || '最近一輪'} 改過的段裡，或 ${ver} 不是這一輪改之前／之後的版本` }];
  if (row.state === 'gone') return [409, { message: `plan.json 已經沒有 ${seg} 這一段了，不能換版本` }];
  if (row.current === ver) return [409, { message: `${seg} 現在就是 ${ver}` }];
  const V = await loadVersions();
  const round = `r${V.nextRound(P.project)}`;
  const back = ver === row.before;
  const said = back ? `剪輯台：${seg} 不採納 ${info.round} 的修改，用上一版 ${ver}` : `剪輯台：${seg} 改回 ${info.round} 改的版本 ${ver}`;
  const at = Date.now();   // 退回紀錄和工作用同一個時間（兩次 Date.now() 可能差 1 ms）
  writeReverts(P.project, { ...readReverts(P.project), [round]: { seg, ver, of: info.round, at } });
  job = { seg, ver, round, of: info.round, back, state: 'running', message: '', at };
  const mine = job;
  (async () => {
    // 換之前先存現在的樣子（之後又改過的段才有一版可以換回；和某一版一樣就不另存）
    if (!row.current) await run(versionsArgs(P, ['save', '--seg', seg]), P.root);
    const was = row.current || (await currentVersions(P, [seg], run))[seg];
    const r = await run(versionsArgs(P, ['use', '--seg', seg, '--ver', ver, '--said', said]), P.root);
    if (r.code === 0) Object.assign(mine, { state: 'done', message: back ? `${seg} 已退回 ${ver}（${info.round} 改之前），build、audit 都過了` : `${seg} 已改回 ${ver}（${info.round} 改的版本）` });
    else {
      const errs = r.out.split('\n').filter((l) => l.startsWith('✖')).slice(0, 3);
      if ((await openRoundN(P)) != null && was) {
        await run(versionsArgs(P, ['use', '--seg', seg, '--ver', was]), P.root);
        await run(versionsArgs(P, ['finish', '--no-change']), P.root);
      }
      Object.assign(mine, { state: 'failed', message: `${seg} 換成 ${ver} 之後檢查沒過，已換回原本的 ${was || '版本'}：${errs.join('；') || r.out.trim().split('\n').slice(-1)[0] || `結束碼 ${r.code}`} → 要退回就把這段寫進修改單，請 AI 一起調整前後段` });
    }
    cache.delete(P.project);
    onDone?.(mine);
  })();
  return [202, { ok: true, job: { ...job } }];
}
