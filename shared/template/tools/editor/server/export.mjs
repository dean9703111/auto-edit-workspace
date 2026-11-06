// 剪輯頁的「輸出完成影片」（019）：重新產生 → 測試片段 → 整支 → 驗收，順序與判準和 auto-edit-deliver 相同。
// 整支先寫到 work/final-rendering.mp4，成功才換成 output/final.mp4；失敗或取消不動舊檔。
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { hfArgs } from '../../lib/hf.mjs';

const TOOLS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const STEPS = [['build', '重新產生'], ['test', '測試片段（確認有聲音）'], ['render', '輸出整支影片'], ['qc', '驗收']];
const TEST_SECONDS = 4;
const LOG_TAIL = 6000;

const statOf = (f) => { try { return fs.statSync(f); } catch { return null; } };
const finalPath = (P) => path.join(P.project, 'output', 'final.mp4');
const sheetPath = (P) => path.join(P.project, 'output', 'qc', 'qc-sheet.jpg');
const tag = (st) => `${Math.floor(st.mtimeMs).toString(36)}${st.size.toString(36)}`;

export const exportFile = (ctx, name) => (name === 'final.mp4' ? finalPath(ctx.P) : name === 'qc-sheet.jpg' ? sheetPath(ctx.P) : null);
export const exportBusy = (ctx) => !!ctx.exportJob?.running;

function finalInfo(ctx) {
  const P = ctx.P, st = statOf(finalPath(P)), sheet = statOf(sheetPath(P)), plan = statOf(P.plan);
  if (!st) return { exists: false };
  return {
    exists: true, file: path.relative(P.root, finalPath(P)).split(path.sep).join('/'), url: `/output/final.mp4?v=${tag(st)}`,
    sheetUrl: sheet ? `/output/qc-sheet.jpg?v=${tag(sheet)}` : null, stale: !!(plan && plan.mtimeMs > st.mtimeMs + 1),
  };
}

export function exportState(ctx) {
  const j = ctx.exportJob;
  const now = j?.finishedAt || Date.now();
  return {
    running: !!j?.running, started: !!j, step: j?.step ?? null, steps: STEPS.map(([id, label]) => ({ id, label })),
    percent: j?.percent ?? null, ok: j?.ok ?? null, canceled: !!j?.canceled, message: j?.message ?? '', errors: j?.errors ?? [], warnings: j?.warnings ?? [],
    log: (j?.log ?? '').slice(-LOG_TAIL), seconds: j ? Math.round((now - j.startedAt) / 1000) : 0, final: finalInfo(ctx),
  };
}

// 在「## 停點紀錄」表最後加一列；沒有檔案或沒有表就不寫（回傳 false）
export function appendStopPassed(file, when = new Date()) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return false; }
  const nl = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const at = lines.findIndex((l) => /^##\s*停點紀錄\s*$/.test(l.trim()));
  if (at < 0) return false;
  let head = at + 1;
  while (head < lines.length && !lines[head].trim().startsWith('|')) { if (/^##\s/.test(lines[head])) return false; head++; }
  if (head + 1 >= lines.length) return false;
  const cols = lines[head].trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  const iT = cols.findIndex((c) => c.includes('時間')), iS = cols.findIndex((c) => c.includes('停點')), iV = cols.findIndex((c) => c.includes('狀態'));
  if (iT < 0 || iS < 0 || iV < 0) return false;
  let end = head + 1;
  while (end + 1 < lines.length && lines[end + 1].trim().startsWith('|')) end++;
  const pad = (n) => String(n).padStart(2, '0');
  const cells = cols.map(() => '');
  cells[iT] = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())} ${pad(when.getHours())}:${pad(when.getMinutes())}`;
  cells[iS] = '④ 完成影片預覽';
  cells[iV] = '通過';
  const iSay = cols.findIndex((c) => c.includes('原話')), iBack = cols.findIndex((c) => c.includes('寫回'));
  if (iSay >= 0) cells[iSay] = '在剪輯台按「輸出完成影片」';
  if (iBack >= 0) cells[iBack] = 'output/final.mp4';
  lines.splice(end + 1, 0, `| ${cells.join(' | ')} |`);
  fs.writeFileSync(file, lines.join(nl));
  return true;
}

function spawnRunner(job) {
  return (cmd, args, { cwd, onData } = {}) => new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' }, windowsHide: true });
    job.child = p;
    let stdout = '', stderr = '';
    p.stdout.on('data', (d) => { stdout += d; onData?.(String(d)); });
    p.stderr.on('data', (d) => { stderr += d; onData?.(String(d)); });
    p.on('error', (e) => { job.child = null; resolve({ code: -1, stdout, stderr: stderr + e.message }); });
    p.on('close', (code) => { job.child = null; resolve({ code, stdout, stderr }); });
  });
}

const lastLine = (r) => `${r.stderr || ''}\n${r.stdout || ''}`.trim().split(/\r?\n/).filter(Boolean).pop()?.slice(0, 240) || `結束代碼 ${r.code}`;

async function runJob(ctx, job, deps) {
  const P = ctx.P;
  const run = deps.run || spawnRunner(job);
  const addLog = (s) => { job.log = (job.log + s).slice(-LOG_TAIL * 4); };
  const tmp = path.join(P.project, 'work', 'final-rendering.mp4');
  const clip = path.join(P.project, 'output', 'test-clips', 'test-clip.mp4');
  const fail = (message, errors = []) => { job.ok = false; job.message = message; job.errors = errors; };
  const nodeTool = (name, args) => run(process.execPath, [path.join(TOOLS, name), ...args], { cwd: P.root, onData: addLog });
  try {
    job.step = 'build';
    const [, built] = await deps.build();
    if (job.canceled) return;
    if (!built?.ok) return fail('重新產生沒有成功：照下面的訊息修改（看不懂就整段貼給 AI）。', built?.issues?.errors?.length ? built.issues.errors : [built?.message || '重新產生失敗']);
    addLog(built.log || '');

    job.step = 'test';
    const items = (await deps.report())?.report?.items || [];
    const start = items.find((x) => x.type !== 'media')?.start ?? 0;
    const tested = await nodeTool('build.mjs', ['--project', P.project, '--template', P.templateDir, '--test', `${start},${TEST_SECONDS}`]);
    if (job.canceled) return;
    if (tested.code !== 0) return fail('測試片段產生失敗：照下面的訊息修改（看不懂就整段貼給 AI）。', [lastLine(tested)]);
    fs.mkdirSync(path.dirname(clip), { recursive: true });
    const clipRender = await run(process.execPath, hfArgs(['render', '-c', 'compositions/test-clip.html', '--quality', 'draft', '-o', clip]), { cwd: P.out, onData: addLog });
    if (job.canceled) return;
    if (clipRender.code !== 0) return fail('測試片段輸出失敗：把下面的訊息貼給 AI。', [lastLine(clipRender)]);
    const probe = await run('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', clip], { cwd: P.root });
    if (job.canceled) return;
    const kinds = probe.stdout.split(/\r?\n/).map((s) => s.replace(/,/g, '').trim());
    if (!kinds.includes('video') || !kinds.includes('audio')) return fail('測試片段沒有畫面或沒有聲音，所以沒有輸出整支：把下面的訊息貼給 AI。', [`ffprobe 只看到：${kinds.filter(Boolean).join('、') || '沒有串流'}`]);

    job.step = 'render';
    job.percent = 0;
    const logFile = path.join(P.project, 'work', 'render.log');
    fs.writeFileSync(logFile, '');
    const rendered = await run(process.execPath, hfArgs(['render', '--fps', '30', '--quality', 'looks', '--output', tmp]), {
      cwd: P.out,
      onData: (s) => {
        addLog(s);
        try { fs.appendFileSync(logFile, s); } catch { /* log 寫不進去不影響輸出 */ }
        const hits = [...s.matchAll(/(\d{1,3}(?:\.\d+)?)\s*%/g)].map((m) => Number(m[1])).filter((n) => n <= 100);
        if (hits.length) job.percent = Math.round(hits.at(-1));
      },
    });
    if (job.canceled) return;
    if (rendered.code !== 0 || !statOf(tmp)) return fail('整支輸出失敗，上一支完成影片沒有被動到：把下面的訊息貼給 AI。', [lastLine(rendered)]);
    fs.mkdirSync(path.dirname(finalPath(P)), { recursive: true });
    fs.renameSync(tmp, finalPath(P));
    job.percent = 100;

    job.step = 'qc';
    const qc = await nodeTool('qc.mjs', ['final', '--project', P.project, '--json']);
    if (job.canceled) return;
    let report = null;
    try { report = JSON.parse(qc.stdout); } catch { /* 下面當成驗收沒有跑完 */ }
    if (!report) return fail('影片輸出好了，但驗收沒有跑完：把下面的訊息貼給 AI。', [lastLine(qc)]);
    // qc.mjs final --json 的 errors、warnings 是數字；每一則的文字在 checks 裡
    const said = (level) => (report.checks || []).filter((c) => c.level === level).map((c) => c.text);
    job.warnings = said('warn');
    if (report.ok === false) return fail('影片輸出好了，但驗收沒過：把下面的 ✖ 貼給 AI，或修改後再輸出一次。', said('error'));
    appendStopPassed(path.join(P.project, 'work', '製作進度.md'));
    job.ok = true;
    job.message = '完成影片輸出好了，驗收也通過了。';
  } catch (e) {
    if (!job.canceled) fail(`輸出中斷：${e.message}`);
  } finally {
    if (job.canceled) { job.ok = false; job.message = '已取消輸出，上一支完成影片沒有被動到。'; }
    try { fs.rmSync(tmp, { force: true }); } catch { /* 下次輸出會覆寫 */ }
    job.running = false;
    job.finishedAt = Date.now();
    ctx.report = null;
  }
}

export function startExport(ctx, deps) {
  if (exportBusy(ctx)) return [409, { error: 'busy', message: '已經在輸出了，等它跑完' }];
  if (ctx.build?.running) return [409, { error: 'building', message: '正在重新產生，等它跑完再輸出' }];
  if (!statOf(ctx.P.plan)) return [400, { error: 'noplan', message: '還沒有 plan.json，不能輸出 → 請 AI 先做到分鏡表確認' }];
  if (Object.values(deps.requestStates?.() || {}).some((s) => s?.state === 'generating')) return [409, { error: 'generating', message: 'AI 正在照修改單修改，等它改完再輸出' }];
  const job = { running: true, step: 'build', percent: null, ok: null, canceled: false, message: '', errors: [], warnings: [], log: '', startedAt: Date.now(), finishedAt: null, child: null };
  ctx.exportJob = job;
  job.done = runJob(ctx, job, deps);
  return [200, exportState(ctx)];
}

export function cancelExport(ctx) {
  const job = ctx.exportJob;
  if (!job?.running) return [409, { error: 'idle', message: '現在沒有在輸出' }];
  job.canceled = true;
  job.child?.kill();
  return [200, exportState(ctx)];
}
