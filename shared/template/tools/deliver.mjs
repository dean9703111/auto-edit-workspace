#!/usr/bin/env node
// 輸出完成影片（一條指令）：重新產生 → 4 秒測試片段確認有影音 → 整支 render → 成功才換成 output/final.mp4 → qc.mjs final → 記停點 ④ 通過。
// 流程和判準與剪輯台的「輸出完成影片」同一份（lib/deliver.mjs）。在背景跑（lib/job.mjs）：agent 的 shell 逾時也不影響，再跑一次同一條指令會接著等。
// 長片不用乾等：停點 ④ 時下 --prerender，使用者看預覽的時候先低優先權 render 起來；說「輸出」時內容沒變就直接接手。
// render 的 log 只寫 work/render.log（2:35 的片子 1200 行、120 KB），這裡每 10% 印一行。
// 預先 render 預設 2 個 worker（M2 Pro 10 核心、同一支 2:35 的片子，機器同時很忙、load 10–50）：workers 5 整支 136、156、285 秒，CPU 約 560 秒；
// workers 2 是 158、168、174 秒，CPU 約 480 秒；workers 2＋nice 10 是 137、188、196 秒，CPU 約 460 秒。差距比負載造成的誤差小；影音 md5 和自動 worker 相同。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathsFrom } from './build.mjs';
import { runJob, jobState, clearJob, isJobChild, DEFAULT_WAIT, STILL_RUNNING } from './lib/job.mjs';
import {
  runDeliver, runPrerender, cancelPrerender, prerenderInfo, prerenderBlocked, prerenderCanPatch, contentFingerprint, finalIsCurrent, lockHolder, killTree, reapRender,
  cliDeps, newJob, deliverPaths, QUALITY, FPS, PRERENDER,
} from './lib/deliver.mjs';

const SELF = fileURLToPath(import.meta.url);
const HELP = `輸出完成影片（一條指令跑完測試片段、整支、驗收；要 Node 22、ffmpeg、HyperFrames）

  node shared/template/tools/deliver.mjs --project projects/<專案>              輸出 output/final.mp4 並驗收（結束碼 0 做完、1 失敗、${STILL_RUNNING} 還在跑）
  node shared/template/tools/deliver.mjs --project projects/<專案> --prerender  停點 ④ 時下一次：低優先權在背景先 render（立刻返回），之後輸出不用再等一個片長
  node shared/template/tools/deliver.mjs --project projects/<專案> --cancel     取消背景的輸出和預先 render（連 Chrome 一起收，上一支 final.mp4 不動）

等待：前景最多等 ${DEFAULT_WAIT} 秒（--wait <秒> 可改）；超過時背景繼續，再跑一次同一條指令會接著等，不會重跑。進度每 10% 一行，render 全文在 work/render.log。
選項： --quality looks（預設）； --fps 30（預設）； --force（內容沒變也重新 render）； --said "<使用者原話>"（寫進停點紀錄）
預先 render：--workers <N>（預設 ${PRERENDER.workers}）。內容的指紋（plan.json、rough.srt、合成、kit、assets）相同且做完 → 直接搬成 final.mp4、跑驗收；
相同還在跑 → 接著等；只改了幾段 → 跑完自動補上；其他改動 → 取消重來（kit、片長、字幕樣式、版式、主題這類改動使用者存檔後它會自己收掉，再下一次 --prerender 才重開）。失敗不影響正式輸出。
只改了幾段時，輸出和預先 render 都只重畫改到的時間窗、接回上一支（通常不到一分鐘）；不是局部改動就印一行原因、整支重新 render。--force 一律整支。
記憶體 8 GB 以下、磁碟剩不到 20 GB 不跑。`;

const VALUE_FLAGS = ['project', 'template', 'quality', 'fps', 'wait', 'workers', 'said'];
const BOOL_FLAGS = ['prerender', 'cancel', 'force', 'help'];
const QUALITIES = ['draft', 'looks', 'delivery', 'standard', 'high'];

export function parseDeliverArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`看不懂的參數「${a}」→ 看用法：node shared/template/tools/deliver.mjs --help`);
    const [k, inline] = a.slice(2).split(/=(.*)/s);
    if (VALUE_FLAGS.includes(k)) {
      const v = inline ?? argv[++i];
      if (v == null) throw new Error(`--${k} 後面要接值 → 看用法：node shared/template/tools/deliver.mjs --help`);
      flags[k] = v;
    } else if (BOOL_FLAGS.includes(k)) flags[k] = true;
    else throw new Error(`沒有 --${k} 這個參數 → 看用法：node shared/template/tools/deliver.mjs --help`);
  }
  for (const k of ['wait', 'workers', 'fps']) if (flags[k] != null && !/^\d+$/.test(String(flags[k]))) throw new Error(`--${k} 要寫數字，現在是「${flags[k]}」→ 例：--${k} ${k === 'wait' ? 300 : k === 'fps' ? 30 : 2}`);
  if (flags.quality != null && !QUALITIES.includes(flags.quality)) throw new Error(`--quality 只能是 ${QUALITIES.join('、')}，現在是「${flags.quality}」→ 交付一律用 looks`);
  if (flags.prerender && flags.cancel) throw new Error('--prerender 和 --cancel 只能選一個 → 看用法：node shared/template/tools/deliver.mjs --help');
  return flags;
}

const relTo = (f) => path.relative(process.cwd(), f).split(path.sep).join('/') || '.';
const mmss = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
const mb = (n) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GB` : `${Math.round(n / 1024 ** 2)} MB`);
const elapsed = (ms) => { const s = Math.round(ms / 1000); return s >= 60 ? `${Math.floor(s / 60)} 分 ${s % 60} 秒` : `${s} 秒`; };

// build 報告裡 AGENTS.md 要求回報的那幾行（沒開、沒配也有一行）
const BUILD_LINE = /^(?:人聲響度|音效比例|剪接點微淡化|講者調光|講者瘦臉|結尾配樂)|^⚠ .*音效(?:次數|密度|稀疏|比例)/;
export const buildSummary = (log) => String(log).split(/\r?\n/).filter((l) => BUILD_LINE.test(l));

const noMark = (s) => String(s).replace(/^✖\s*/, '');
const SOURCE = { render: '這次 render', incremental: '只重畫改到的地方，接回上一支', prerender: '預先 render（沒有重新 render）', same: '上次輸出的（內容沒變，沒有重新 render）' };

export function finishLines(P, job, fileStat) {
  const F = deliverPaths(P.project), L = [''];
  const q = job.qc, fmt = q?.format;
  if (job.ok || q) {
    const facts = [q?.duration?.actual != null ? `${mmss(q.duration.actual)}（${q.duration.actual.toFixed(1)} 秒）` : null, fmt ? `${fmt.width}×${fmt.height}、${Math.round(fmt.fps)}fps、${fmt.hasAudio ? '有音軌' : '沒有音軌'}` : null, fileStat ? mb(fileStat.size) : null].filter(Boolean);
    L.push(`${job.ok ? '✔' : '✖'} 完成影片：${relTo(F.final)}（${facts.join('，')}）`);
    if (job.source) L.push(`來源：${SOURCE[job.source] || job.source}；用了 ${elapsed(Date.now() - job.startedAt)}`);
    L.push(`驗收：${q?.errors ?? job.errors.length} 個 ✖、${q?.warnings ?? job.warnings.length} 個 ⚠`);
    for (const e of job.errors) L.push(`✖ ${noMark(e)}`);
    for (const w of job.warnings) L.push(`⚠ ${w}`);
    if (q?.sheet) L.push(`驗收截圖：${relTo(F.sheet)}`);
    if (job.ok) L.push('→ 完成：把上面幾行和驗收截圖回報給使用者，每個 ⚠ 寫「刻意」或「要修」');
    else L.push(`→ ${job.fix}`);
    return L;
  }
  L.push(`✖ ${job.message}`);
  for (const e of job.errors) L.push(`✖ ${noMark(e)}`);
  L.push(`→ ${job.fix || '照訊息修好，再跑一次這條指令'}`);
  return L;
}

// 背景子行程：真正做事，stdout 寫進 work/.jobs/deliver.log，由前景那條指令轉印
async function deliverChild(P, flags) {
  const job = newJob();
  const say = (s) => console.log(s);
  const deps = cliDeps(P, job, { say });
  let shown = 0;
  const t0 = Date.now();
  await runDeliver(P, job, {
    ...deps, say, by: 'cli', force: !!flags.force, said: flags.said || '輸出完成影片（deliver.mjs）',
    quality: flags.quality, fps: flags.fps ? Number(flags.fps) : undefined,
    renderEnv: { HYPERFRAMES_RENDER_DETACHED: '1' },    // 工作行程的爸爸（前景那條指令）會先結束；不加這個 render 會自己取消（render_cancelled_parent_exited）
    onBuilt: (log) => { for (const l of buildSummary(log)) say(l); },
    onPercent: (p) => {
      const tens = Math.floor(p / 10) * 10;
      if (tens > shown) { shown = tens; say(`  ${tens}%（已 ${elapsed(Date.now() - t0)}）`); }
    },
  });
  const st = (() => { try { return fs.statSync(deliverPaths(P.project).final); } catch { return null; } })();
  for (const l of finishLines(P, job, st)) say(l);
  return job.ok ? 0 : 1;
}

async function prerenderChild(P, flags) {
  const job = newJob();
  const say = (s) => console.log(s);
  const deps = cliDeps(P, job, { nice: PRERENDER.nice, say });
  return runPrerender(P, job, { ...deps, say, quality: flags.quality, fps: flags.fps ? Number(flags.fps) : undefined, workers: flags.workers ? Number(flags.workers) : undefined, renderEnv: { HYPERFRAMES_RENDER_DETACHED: '1' } });
}

export async function startPrerender(P, flags, { log = console.log, argv = process.argv.slice(1) } = {}) {
  const opts = { quality: flags.quality || QUALITY, fps: flags.fps ? Number(flags.fps) : FPS };
  const holder = lockHolder(P);
  if (holder || jobState(P.project, 'deliver').state === 'running') { log(`正在正式輸出完成影片（${holder?.by === 'editor' ? '剪輯台' : 'deliver.mjs'}），不用預先 render`); return 0; }
  const blocked = prerenderBlocked(P);
  if (blocked) { log(`略過預先 render：${blocked}。不影響正式輸出，只是輸出時要等一個片長`); return 0; }
  const fp = contentFingerprint(P, opts);
  if (finalIsCurrent(P, fp)) { log('output/final.mp4 已經是現在的內容，不用預先 render'); return 0; }
  const info = prerenderInfo(P);
  if (info.state === 'running') {
    if (!info.fingerprint || info.fingerprint === fp) { log(`預先 render 已經在跑了${info.percent != null ? `（${info.percent}%）` : ''}，內容沒變，不用重開`); return 0; }
    if (prerenderCanPatch(P, opts)) { log(`預先 render 還在跑${info.percent != null ? `（${info.percent}%）` : ''}：只改了幾段，跑完會自動補上，不用重開`); return 0; }
    const { survivors } = await cancelPrerender(P);
    log(`內容改過了：取消舊的預先 render${survivors.length ? `（⚠ ${survivors.length} 個行程收不掉：${survivors.join('、')}）` : ''}，重新開始`);
  } else if (info.state === 'done' && info.fingerprint === fp) { log('預先 render 已經做好了，輸出時直接用'); return 0; } else if (info.state !== 'done' || !prerenderCanPatch(P, opts)) {
    // 上一次留下的狀態（失敗、內容改過）：清掉重來；做好了而且只差幾段就留著，下面補上
    await cancelPrerender(P);
  }
  clearJob(P.project, 'prerender');
  await runJob({ project: P.project, name: 'prerender', argv, waitSec: 0, log, run: () => 0 });
  log(`✔ 在背景預先 render（低優先權、${flags.workers || PRERENDER.workers} 個 worker，全文 log：${relTo(deliverPaths(P.project).log)}）`);
  log('→ 不用等它，照常停在停點 ④。使用者說「輸出」時跑 deliver.mjs 就會接手；只改幾段會自動補上，其他改動會自動取消重來');
  return 0;
}

async function cancelAll(P) {
  const F = deliverPaths(P.project);
  const js = jobState(P.project, 'deliver');
  let survivors = [], n = 0;
  if (js.state === 'running') { survivors = (await killTree(js.pid)).survivors; n++; }
  // 工作行程已經死了、render 還在跑（被 SIGKILL 時 render 不會跟著走）也要收
  if (await reapRender(P, 'final') && !n) n++;
  if (n) {
    // 工作狀態留著：別的 shell 還在等這條工作時，會看到「中途被結束了」而不是等到逾時
    try { fs.rmSync(F.tmp, { force: true }); fs.rmSync(F.lock, { force: true }); } catch { /* 下次會覆寫 */ }
  }
  const pi = prerenderInfo(P);
  if (pi.state !== 'none') {
    const res = await cancelPrerender(P);
    survivors = [...survivors, ...res.survivors]; if (pi.state === 'running') n++;
  }
  const holder = lockHolder(P);
  if (holder?.by === 'editor') console.log('剪輯台正在輸出 → 到剪輯台按取消（這條指令不動它）');
  console.log(n ? `已取消 ${n} 個背景工作；上一支 output/final.mp4 沒有被動到` : '現在沒有在背景輸出或預先 render');
  if (survivors.length) { console.log(`✖ 這些行程收不掉：${survivors.join('、')} → 回報這一行`); return 1; }
  return 0;
}

async function main() {
  const flags = parseDeliverArgs(process.argv.slice(2));
  if (flags.help) { console.log(HELP); return 0; }
  const P = pathsFrom(flags);
  const name = flags.prerender ? 'prerender' : 'deliver';
  if (isJobChild('prerender') && flags.prerender) {
    return runJob({ project: P.project, name: 'prerender', run: () => prerenderChild(P, flags) });
  }
  if (flags.cancel) return cancelAll(P);
  if (!fs.existsSync(P.plan)) { console.log(`✖ 還沒有 ${relTo(P.plan)} → 先做到分鏡表確認（auto-edit-storyboard），才能輸出`); return 1; }
  if (flags.prerender) return startPrerender(P, flags);
  if (!isJobChild(name)) {
    const holder = lockHolder(P);
    if (holder?.by === 'editor') { console.log('✖ 剪輯台正在輸出完成影片 → 等它跑完或在剪輯台按取消，再跑一次這條指令'); return 1; }
    // 上次做完、結果沒印出來（等的那條指令被砍了），之後內容又改過：那個結果過期了，重新輸出，不要把舊的成功印出來
    const st = jobState(P.project, 'deliver');
    if (st.state === 'done' && st.reported === false && !finalIsCurrent(P, contentFingerprint(P, { quality: flags.quality || QUALITY, fps: flags.fps ? Number(flags.fps) : FPS }))) clearJob(P.project, 'deliver');
  }
  const waitSec = flags.wait != null ? Number(flags.wait) : DEFAULT_WAIT;
  const code = await runJob({ project: P.project, name, run: () => deliverChild(P, flags), waitSec, retryFailed: !!flags.force });
  if (code === STILL_RUNNING) {
    if (waitSec <= 0) console.log('→ 下一步：再跑一次同一條指令會接著等，不會重跑');   // job.mjs 等過才印這一行
    console.log(`node ${relTo(SELF)} ${process.argv.slice(2).map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ')}`);
  }
  return code;
}

if (process.argv[1] && path.resolve(process.argv[1]) === SELF) {
  main().then((c) => { process.exitCode = c; }, (e) => { console.error(`✖ ${e.message}`); process.exitCode = 1; });
}
