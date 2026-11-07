// 剪輯頁的「輸出完成影片」（019）：流程和判準在 lib/deliver.mjs（和 deliver.mjs 同一份），這裡只有剪輯台的狀態與 API。
// 整支先寫到 work/final-rendering.mp4，成功才換成 output/final.mp4；失敗或取消不動舊檔。
// 預先 render（deliver.mjs --prerender）不算輸出：不擋存檔和重新產生；這裡按「輸出」時內容沒變就直接接手它。
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { STEPS, runDeliver, spawnRunner, killTree, newJob, lockHolder, deliverPaths, prerenderInfo, prerenderCanPatch } from '../../lib/deliver.mjs';

const LOG_TAIL = 6000;

const statOf = (f) => { try { return fs.statSync(f); } catch { return null; } };
const finalPath = (P) => deliverPaths(P.project).final;
const sheetPath = (P) => deliverPaths(P.project).sheet;
const tag = (st) => `${Math.floor(st.mtimeMs).toString(36)}${st.size.toString(36)}`;

export const exportFile = (ctx, name) => (name === 'final.mp4' ? finalPath(ctx.P) : name === 'qc-sheet.jpg' ? sheetPath(ctx.P) : null);
export const exportBusy = (ctx) => !!ctx.exportJob?.running;

function finalInfo(ctx) {
  const P = ctx.P, st = statOf(finalPath(P)), sheet = statOf(sheetPath(P)), plan = statOf(P.plan);
  if (!st) return { exists: false };
  return {
    exists: true, file: path.relative(P.project, finalPath(P)).split(path.sep).join('/'), url: `/output/final.mp4?v=${tag(st)}`,
    sheetUrl: sheet ? `/output/qc-sheet.jpg?v=${tag(sheet)}` : null, stale: !!(plan && plan.mtimeMs > st.mtimeMs + 1),
  };
}

// 剩餘時間：照到目前的速度算（至少走了 1% 才算，太早的估計會差很多）
function etaSeconds(j) {
  const s = j?.pctStart;
  if (!j?.running || j.step !== 'render' || !s || j.percent == null) return null;
  const moved = j.percent - s.p;
  return moved >= 1 ? Math.max(1, Math.round(((Date.now() - s.t) / 1000 / moved) * (100 - j.percent))) : null;
}

export function exportState(ctx) {
  const j = ctx.exportJob;
  const now = j?.finishedAt || Date.now();
  return {
    running: !!j?.running, started: !!j, step: j?.step ?? null, steps: STEPS.map(([id, label]) => ({ id, label })), eta: etaSeconds(j),
    percent: j?.percent ?? null, ok: j?.ok ?? null, canceled: !!j?.canceled, message: j?.message ?? '', errors: j?.errors ?? [], warnings: j?.warnings ?? [],
    log: (j?.log ?? '').slice(-LOG_TAIL), seconds: j ? Math.round((now - j.startedAt) / 1000) : 0, final: finalInfo(ctx),
  };
}

export function startExport(ctx, deps, body = {}) {
  if (exportBusy(ctx)) return [409, { error: 'busy', message: '已經在輸出了，等它跑完' }];
  if (ctx.build?.running) return [409, { error: 'building', message: '正在重新產生，等它跑完再輸出' }];
  if (!statOf(ctx.P.plan)) return [400, { error: 'noplan', message: '還沒有 plan.json，不能輸出 → 請 AI 先做到分鏡表確認' }];
  // 畫面上還是示範人物：先問過使用者（頁面跳確認卡；按「照樣輸出」才帶 confirmSpeaker）
  const gate = deps.speakerGate?.();
  if (gate?.needed && !body?.confirmSpeaker) return [409, { error: 'speaker', message: `講者介紹還是示範人物「${gate.demo}」，先確認再輸出`, speaker: gate }];
  if (Object.values(deps.requestStates?.() || {}).some((s) => s?.state === 'generating')) return [409, { error: 'generating', message: 'AI 正在照修改單修改，等它改完再輸出' }];
  const other = lockHolder(ctx.P);
  if (other && other.pid !== process.pid) return [409, { error: 'busy', message: 'AI 正在背景輸出完成影片，等它跑完（或請 AI 取消）再按' }];
  const job = newJob();
  ctx.exportJob = job;
  const log = (s) => { job.log = (job.log + s).slice(-LOG_TAIL * 4); };
  job.done = runDeliver(ctx.P, job, {
    run: spawnRunner(job), ...deps, by: 'editor', said: '在剪輯台按「輸出完成影片」', say: (s) => log(`${s}\n`),
  }).finally(() => { ctx.report = null; });
  return [200, exportState(ctx)];
}

// 背景先算的完成影片（deliver.mjs --prerender）：頁面要讓使用者知道它在跑、改動大的存檔會讓它白算。fresh＝還用得上：開始之後 plan.json 沒有再被改過，或只改了幾段（跑完自動補上）
export function prerenderState(ctx) {
  const info = prerenderInfo(ctx.P);
  if (!['running', 'done'].includes(info.state)) return { state: 'none' };
  const plan = statOf(ctx.P.plan);
  return { state: info.state, percent: info.percent ?? null, fresh: !plan || !info.startedAt || plan.mtimeMs <= info.startedAt + 1000 || prerenderCanPatch(ctx.P) };
}

// 在 Finder／檔案總管打開完成影片所在的資料夾並選起來（只有本機頁面會呼叫，路徑固定是 output/final.mp4）
export function revealFinal(ctx, { spawnFn = spawn } = {}) {
  const f = finalPath(ctx.P);
  if (!statOf(f)) return [404, { error: 'nofile', message: '還沒有完成影片' }];
  const [cmd, args] = process.platform === 'darwin' ? ['open', ['-R', f]] : process.platform === 'win32' ? ['explorer', [`/select,${f}`]] : ['xdg-open', [path.dirname(f)]];
  const child = spawnFn(cmd, args, { stdio: 'ignore', detached: true, windowsHide: true });
  child.on?.('error', () => {});
  child.unref?.();
  return [200, { ok: true, file: path.relative(ctx.P.project, f).split(path.sep).join('/') }];
}

export function cancelExport(ctx) {
  const job = ctx.exportJob;
  if (!job?.running) return [409, { error: 'idle', message: '現在沒有在輸出' }];
  job.canceled = true;
  // render 的 Chrome worker 各自一個 process group，連子孫一起收；等待預先 render 時沒有 child，流程自己會停
  if (job.child?.pid) killTree(job.child.pid).catch(() => {});
  return [200, exportState(ctx)];
}
