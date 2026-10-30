#!/usr/bin/env node
/**
 * 版面量測：在瀏覽器裡把 work/hyperframes/ 跳到每一段的中點與完成態（段尾前 0.6 秒），量出破版（零依賴，只用 Node 22 與 HyperFrames 的 Chrome）
 *
 *   node shared/template/tools/audit.mjs --project projects/<專案>               只量第二層 custom（x 開頭、type: "custom"）
 *   node shared/template/tools/audit.mjs --project projects/<專案> --all         連情境模板一起量（字卡動態、media 段不量）
 *   node shared/template/tools/audit.mjs --project projects/<專案> --only x01,s03 只量這幾段（字卡動態要量就用這個指名）
 *   node shared/template/tools/audit.mjs --project projects/<專案> --json        stdout 只印一個 JSON
 *
 * 先 build（audit 量的是 build 產生的 work/hyperframes/index.html；只改了 custom 檔不用重 build，改了 plan.json 要先 build）。
 * 段落起迄取自 build.mjs --check（成片秒數，和 Studio、snapshot 的秒數一樣）。完成態那一刻全部還在動（退場比 0.6 秒長）時，每次往前 0.3 秒找靜止的畫面。
 * 和 npx hyperframes snapshot／check 用同一個 runtime 與 seek（__player.renderSeek），所以量到的就是 render 的版面；約 2–5 秒。
 *
 * ✖ 錯誤（一定要修，結束碼 1）
 *   文字撐破容器   文字超出最近的有底有框盒（卡片、膠囊、節點）
 *   內容被裁掉     文字或卡片超出 overflow:hidden／固定寬高的框，被切掉
 *   超出畫面       內容超出 1920×1080
 *   進字幕區       內容下緣 y > 920（R4.1；滿版底、從頂撐到底的面板不算）
 *   壓到子母畫面   全畫面版型（layout: "fullscreen"、04 家族）、這一刻有子母畫面時，內容進到 x 1344–1888、y 617–951
 *   script 出錯    custom 的 <script> 丟錯（時間軸沒建好，畫面停在初始狀態）
 *   對不上         index.html 的段落起點和 plan.json 不同（改了 plan.json 沒重跑 build）
 * ⚠ 提醒
 *   壓到講者       透明版型（layout: "overlay"、下方字卡等）的內容蓋到 plan.json 的 speakerBox（面積比例；custom 與用 css 移位的段 ≥ 2%、
 *                  沒移位的模板 ≥ 15%，和 build 的碰撞提醒同門檻；03 側邊欄期間講者框加上 sideShift）
 *   字太小         文字 < 30px
 *   半像素邊       有底或有框的元素邊緣離整數 px ≥ 0.2（直邊與框線會糊，R8.4）
 *   段長不符       custom 檔的 data-duration／const D 和 --check 報告的段長不同（R7.2 第 4 步）
 * 正在補間的元素（進場、退場途中）不判；刻意的例外標 data-layout-allow-overflow／data-layout-allow-caption-zone／data-layout-ignore
 * （和 npx hyperframes check 同一組標記）。
 *
 * 選填：--chrome <路徑>（預設用 HyperFrames 下載的 chrome-headless-shell）、--runtime <hyperframe.runtime.iife.js>；測試用：--template <shared/template 資料夾>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, pathsFrom, projectLabel } from './build.mjs';
import { findChrome, findRuntime, openSession } from './lib/audit-browser.mjs';
import { pickItems, sampleTimes, layoutOf, pipOnAt, speakerWarnOf, judgeSample, mergeFindings, formatFinding, customDuration, fmtT, CANVAS } from './lib/audit-rules.mjs';

const VALUE_FLAGS = ['project', 'only', 'chrome', 'runtime', 'template'];
const rel = (p) => path.relative(process.cwd(), p) || '.';
const r3 = (n) => Math.round(n * 1000) / 1000;

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
    } else if (['all', 'json', 'help'].includes(k)) flags[k] = true;
    else throw new Error(`沒有 --${k} 這個參數（用 --help 看用法）`);
  }
  return flags;
}

// custom 檔寫的長度要等於段長（R7.2 第 4 步）；不等時時間軸不是短了（最後一段沒被取樣）就是多了
export function durationWarnings(items, outDir) {
  const out = [];
  for (const it of items) {
    if (it.type !== 'custom' || !it.file) continue;
    const f = path.join(outDir, it.file);
    if (!fs.existsSync(f)) continue;
    const { duration, constD } = customDuration(fs.readFileSync(f, 'utf8'));
    const bad = [['data-duration', duration], ['const D', constD]].filter(([, v]) => v != null && Math.abs(v - it.D) > 0.05);
    if (bad.length) out.push({ id: it.id, label: it.label, level: 'warn', rule: 'duration', el: null, at: [], t: null,
      msg: `段長不符：${it.file} 寫 ${bad.map(([k, v]) => `${k} ${v}`).join('、')}，--check 報告的段長是 ${it.D}s`, fix: `把 data-duration 與 const D 都改成 ${it.D}（R7.2 第 4 步）` });
  }
  return out;
}

// 頁面的 JS 錯誤：量的那幾段的子合成出錯 → 那一段 ✖（時間軸沒建好，量到的是沒有動畫的初始狀態）；其他 → ⚠
export function scriptErrors(errors, items) {
  const findings = [], warnings = [];
  const seen = new Set();
  for (const e of errors) {
    const m = String(e.text).match(/composition script error:\s*(\S+)\s+(.*)$/);
    const it = m && items.find((x) => x.compId === m[1]);
    const key = `${it ? it.id : ''}|${e.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (it) findings.push({ id: it.id, label: it.label, level: 'error', rule: 'script', el: null, at: [], t: null, kind: 'done',
      msg: `${it.file || it.compId} 的 script 出錯：${m[2]}（時間軸沒建好，畫面停在沒有動畫的初始狀態）`, fix: `修好 ${it.file || it.compId} 的 <script>（npx hyperframes check 會列出行號），再重跑 audit` });
    else warnings.push(`頁面 JS 錯誤：${e.text}${e.url && !e.url.includes('__audit') ? `（${e.url.replace(/^https?:\/\/[^/]+\//, '')}${e.line != null ? `:${e.line + 1}` : ''}）` : ''} → 跑 npx hyperframes check 看是哪一段`);
  }
  return { findings, warnings };
}

export async function audit(flags, { log = console.log } = {}) {
  const P = pathsFrom(flags);
  const project = P.project ? projectLabel(P, P.project) : rel(P.out);
  const index = path.join(P.out, 'index.html');
  const report = { ok: false, project, errors: [], warnings: [], notes: [], segments: [], findings: [], chrome: null, runtime: null };
  if (!fs.existsSync(index)) { report.errors.push(`找不到 ${rel(index)} → 先跑 node shared/template/tools/build.mjs --project ${project}`); return report; }

  const chk = build({ project: flags.project, template: flags.template, check: true, json: true }, { log: () => {} });
  if (!chk.ok) {
    report.errors.push(...chk.json.errors.map((e) => `build --check：${e}`), `build --check 有 ✖ → 先照 → 後面的建議改好 plan.json、重跑 build，再 audit`);
    return report;
  }
  const res = chk.res;
  const pick = pickItems(res.items, { only: flags.only ? flags.only.split(',') : null, all: !!flags.all });
  report.errors.push(...pick.errors);
  report.notes.push(...pick.skipped.map((s) => `不量 ${s}`));
  if (pick.errors.length) return report;
  if (!pick.list.length) {
    report.ok = true;
    report.notes.push(flags.all ? 'plan.json 沒有可以量的段' : 'plan.json 沒有 custom 段（type: "custom"）→ 要量情境模板加 --all');
    return report;
  }
  if (fs.existsSync(P.plan) && fs.statSync(P.plan).mtimeMs > fs.statSync(index).mtimeMs + 1) report.warnings.push(`plan.json 比 index.html 新 → 先重跑 build，量到的才是最新版`);

  const dur = durationWarnings(pick.list, P.out);
  const chrome = findChrome({ chrome: flags.chrome });
  const rt = findRuntime({ runtime: flags.runtime });
  report.chrome = chrome;
  report.runtime = rt.version;
  log(`專案：${project}`);
  log(`量 ${pick.list.length} 段（${flags.only ? `--only ${flags.only}` : flags.all ? '情境模板與 custom' : 'custom'}）；HyperFrames runtime ${rt.version}`);

  const jobs = pick.list.flatMap((it) => {
    const ts = sampleTimes(it);
    return ts.map((s) => ({ it, ...s, floor: ts[0].kind === 'mid' && s.kind === 'done' ? ts[0].t : it.start }));
  }).sort((a, b) => a.t - b.t);
  const raw = [];
  const segs = new Map(pick.list.map((it) => [it.id, { id: it.id, type: it.type, label: it.label, layout: layoutOf(it), start: it.start, end: it.end, samples: [] }]));
  const S = await openSession({ dir: P.out, chrome, runtime: rt.file });
  const measureAt = async (t, id) => { await S.seek(t); return S.measure({ hostId: `el-${id}`, W: CANVAS[0], H: CANVAS[1] }); };
  // 「有靜止的內容」：背景層（滿版底、側邊欄面板）不算
  const hasStill = (m) => (m.els || []).some((e) => !e.moving && !e.bg && (e.text || e.painted || e.media));
  try {
    for (const j of jobs) {
      let m = await measureAt(j.t, j.it.id);
      // 完成態那一刻全部都在動（退場動畫比 0.6 秒長，例如 03 側邊欄推回 0.7 秒）：每次往前 0.3 秒找最後一個靜止的畫面，最多退到中點
      for (let k = 1; j.kind === 'done' && !m.missingHost && (m.els || []).length && !hasStill(m) && k <= 6; k++) {
        const t = r3(j.t - 0.3 * k);
        if (t <= j.floor + 0.05) break;
        const m2 = await measureAt(t, j.it.id);
        if (hasStill(m2)) { m = m2; j.t = t; }
      }
      const seg = segs.get(j.it.id);
      const still = (m.els || []).filter((e) => !e.moving);
      seg.samples.push({ t: j.t, kind: j.kind, measured: still.length, moving: (m.els || []).length - still.length });
      if (!m.missingHost && Math.abs(m.host.start - j.it.start) > 0.02) {
        raw.push({ id: j.it.id, label: j.it.label, level: 'error', rule: 'stale', el: null, t: j.t, kind: j.kind,
          msg: `index.html 和 plan.json 對不上：#el-${j.it.id} 在 index.html 從 ${m.host.start}s 開始，plan.json 算出來是 ${j.it.start}s`, fix: `重跑 node shared/template/tools/build.mjs --project ${project}` });
        continue;
      }
      raw.push(...judgeSample(m, { item: j.it, t: j.t, kind: j.kind, layout: seg.layout, pipOn: pipOnAt(j.it, j.t), speakerBox: res.globals.speakerBox, sideShift: res.globals.sideShift, speakerWarn: speakerWarnOf(j.it), W: CANVAS[0], H: CANVAS[1] }));
      if (j.kind === 'done' && !m.missingHost && !hasStill(m)) {
        raw.push({ id: j.it.id, label: j.it.label, level: 'warn', rule: 'empty', el: null, t: j.t, kind: j.kind,
          msg: `完成態沒有量到任何內容（${(m.els || []).length ? '全部還在動畫中' : '畫面上是空的'}）`, fix: `用 npx hyperframes snapshot --at ${j.t} 看這一刻的畫面；內容要在段尾前 0.6 秒停在完成態（R6）` });
      }
    }
  } finally { await S.close(); }
  const pageErrs = scriptErrors(S.errors, pick.list);
  report.warnings.push(...pageErrs.warnings);
  const findings = [...pageErrs.findings, ...mergeFindings(raw), ...dur];
  const order = [...segs.keys()];
  findings.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id) || (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1));
  report.findings = findings;
  report.segments = [...segs.values()].map((s) => ({ ...s, errors: findings.filter((f) => f.id === s.id && f.level === 'error').length, warns: findings.filter((f) => f.id === s.id && f.level === 'warn').length }));
  report.ok = !report.errors.length && !findings.some((f) => f.level === 'error');
  return report;
}

export function formatReport(r) {
  const L = [];
  for (const e of r.errors) L.push(`✖ ${e}`);
  for (const n of r.notes || []) L.push(n);
  for (const w of r.warnings) L.push(`⚠ ${w}`);
  for (const f of r.findings) L.push(formatFinding(f));
  if (r.segments.length) {
    L.push('', 'id｜情境｜版型｜量測時間｜結果');
    for (const s of r.segments) {
      const times = s.samples.map((x) => `${fmtT(x.t)} ${x.kind === 'done' ? '完成態' : '中點'}${x.moving ? `（${x.moving} 個在動畫中，不判）` : ''}`).join('、');
      L.push(`${s.id}｜${s.label}｜${s.layout}｜${times}｜${s.errors || s.warns ? [s.errors ? `✖ ${s.errors}` : '', s.warns ? `⚠ ${s.warns}` : ''].filter(Boolean).join(' ') : '✓'}`);
    }
  }
  const ne = r.errors.length + r.findings.filter((f) => f.level === 'error').length, nw = r.warnings.length + r.findings.filter((f) => f.level === 'warn').length;
  if (r.segments.length) {
    L.push('', ne ? `未通過：${ne} 個錯誤（✖），${nw} 個提醒（⚠）。照 → 後面的改法改 custom 檔（或 plan.json 後重跑 build），再跑一次 audit。` : `通過：${r.segments.length} 段，${nw} 個提醒（⚠）。audit 量的是幾何，最後仍以 snapshot 看圖為準。`);
    const bad = [...new Set(r.findings.flatMap((f) => f.at || []))].sort((a, b) => a - b).slice(0, 12);
    if (bad.length) L.push(`看畫面：cd ${r.project}/work/hyperframes && npx hyperframes snapshot --at ${bad.map((t) => r3(t)).join(',')} --no-end -o ../../成片/驗收截圖`);
  } else if (ne) L.push('', `未通過：${ne} 個錯誤（✖）。`);
  return L.join('\n');
}

async function cli() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*\n?/, '').replace(/^ \* ?/gm, '')); return 0; }
  const t0 = Date.now();
  const r = await audit(flags, { log: flags.json ? () => {} : console.log });
  r.elapsed = r3((Date.now() - t0) / 1000);
  if (flags.json) console.log(JSON.stringify(r, null, 2));
  else console.log(`${formatReport(r)}\n（${r.elapsed}s）`);
  return r.ok ? 0 : 1;
}

const isMain = () => {
  try { return !!process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
};
if (isMain()) {
  const wantJson = process.argv.includes('--json');
  cli().then((code) => { process.exitCode = code; }, (e) => {
    if (wantJson) console.log(JSON.stringify({ ok: false, errors: [e.message], warnings: [], segments: [], findings: [] }, null, 2));
    else console.error(`✖ ${e.message}`);
    process.exitCode = 1;
  });
}
