#!/usr/bin/env node
/**
 * 寫草稿的基準測試（specs/022-pipeline-speed FR-109）：同一份分鏡素材，「一次寫整份」和「大綱 → 骨架」各跑 N 次，
 * 用 MiniMax（mmx text chat）當弱模型、工具輸出由這支腳本餵回去，比較產出率、時間、token、檢查結果、模板動畫與候選比例。
 *
 *   node dev/bench/draft-bench.mjs --project projects/example [--part ch01] [--runs 3] [--modes one,two]
 *                                  [--parallel 3] [--max-tokens 40000] [--timeout 900] [--fill-batch 6] [--model <id>] [--out <結果.json>] [--dry]
 * --fill-batch N：兩步式的填骨架一次填 N 段（0＝一次填整份）。
 *
 * 專案要先跑過 build.mjs --scaffold（有 work/分鏡素材/）。每次都先把專案複製到暫存（APFS clone，不動原專案）。
 * 每種寫法最多一輪修正（工具有 ✖ 才修），兩種一樣，比較才公平。
 * --dry：不呼叫 mmx，只組提示、印長度（檢查腳本本身）。
 * mmx 沒登入、額度用完：印原因、結束碼 2，不影響剪片流程。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BUILD = path.join(ROOT, 'shared', 'template', 'tools', 'build.mjs');
const { specEntries } = await import(path.join(ROOT, 'shared', 'template', 'tools', 'lib', 'flow.mjs'));

// ---------- 量測（純函式，dev/tests/draft-bench.test.mjs 測） ----------
const NOT_COUNTED = ['chapter-tag', 'speaker', 'chapter'];
const kindOf = (s) => (s.type === 'media' ? 'media' : s.template || (s.type === 'fx' ? `fx ${s.fx}` : s.scene) || (s.design ? 'design' : '?'));
const cueOf = (s) => Number(String(s.from ?? s.at ?? '').match(/^#(\d+)/)?.[1] ?? 0);
export function draftMetrics(segs = []) {
  const list = [...segs].sort((a, b) => cueOf(a) - cueOf(b));
  const body = list.filter((s) => s.type !== 'media' && !NOT_COUNTED.includes(s.scene));
  const anim = body.filter((s) => /^x-/.test(s.template || '') || s.type === 'fx');
  const cands = body.filter((s) => String(s.story?.designIdea || '').trim() || s.design);
  const main = list.filter((s) => !['chapter-tag'].includes(s.scene));
  let adjacent = 0;
  for (let i = 1; i < main.length; i++) if (kindOf(main[i]) !== 'media' && kindOf(main[i]) === kindOf(main[i - 1])) adjacent++;
  const r = (x) => (body.length ? Math.round((x / body.length) * 100) / 100 : 0);
  return { segs: list.length, body: body.length, animRatio: r(anim.length), candRatio: r(cands.length), adjacent };
}
export function parseCheck(out = '') {
  const t = String(out);
  let m = t.match(/未通過：(\d+) 個 ✖、(\d+) 個 ⚠/);
  if (m) return { errors: +m[1], warns: +m[2] };
  m = t.match(/通過：\d+ 段，(\d+) 個 ⚠/);
  if (m) return { errors: 0, warns: +m[1] };
  m = t.match(/未通過：(\d+) (?:格|個 ✖)/);
  if (m) return { errors: +m[1], warns: (t.match(/^⚠/gm) || []).length };
  return { errors: (t.match(/^✖/gm) || []).length || (/通過/.test(t) ? 0 : 1), warns: (t.match(/^⚠/gm) || []).length };
}
export function jsonFrom(text = '') {
  const t = String(text).replace(/^```(?:json)?\s*/m, '').replace(/```\s*$/m, '');
  const a = t.indexOf('{'), z = t.lastIndexOf('}');
  if (a < 0 || z <= a) return null;
  try { return JSON.parse(t.slice(a, z + 1)); } catch { return null; }
}
export const median = (xs) => { const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b); if (!v.length) return null; const k = Math.floor(v.length / 2); return v.length % 2 ? v[k] : Math.round(((v[k - 1] + v[k]) / 2) * 100) / 100; };

// ---------- 執行 ----------
function args(argv) {
  const f = { part: 'ch01', runs: 3, modes: 'one,two', parallel: 3, 'max-tokens': 40000, timeout: 900, 'fill-batch': 0 };   // mmx 預設 300 秒就斷，一次寫整份常超過
  for (let i = 0; i < argv.length; i++) {
    const m = argv[i].match(/^--(.+)$/);
    if (!m) continue;
    if (['dry', 'help'].includes(m[1])) f[m[1]] = true; else f[m[1]] = argv[++i];
  }
  return f;
}
const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const build = (proj, ...a) => spawnSync(process.execPath, [BUILD, '--project', proj, ...a], { encoding: 'utf8', cwd: ROOT, maxBuffer: 1 << 26 });

function mmx(F, messages, tmp) {
  if (F.dry) return Promise.resolve({ ok: true, text: '', secs: 0, input: messages.reduce((n, x) => n + x.content.length, 0), output: 0, thinking: 0, dry: true });
  const file = path.join(tmp, `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.json`);
  fs.writeFileSync(file, JSON.stringify(messages));
  const a = ['text', 'chat', '--messages-file', file, '--max-tokens', String(F['max-tokens']), '--output', 'json', '--timeout', String(F.timeout), '--non-interactive', ...(F.model ? ['--model', F.model] : [])];
  const t0 = Date.now();
  return new Promise((resolve) => {
    const c = spawn('mmx', a, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    c.stdout.on('data', (d) => { out += d; });
    c.stderr.on('data', (d) => { err += d; });
    c.on('error', (e) => resolve({ ok: false, why: `mmx 跑不起來（${e.message}）→ 照 mmx-cli 說明安裝、登入` }));
    c.on('close', () => {
      const secs = Math.round((Date.now() - t0) / 100) / 10;
      let j = null;
      try { j = JSON.parse(out.slice(out.indexOf('{'))); } catch { /* 下面處理 */ }
      if (!j?.content) return resolve({ ok: false, secs, why: `mmx 沒有回應內容：${(err || out).trim().split('\n').slice(-2).join(' ').slice(0, 200)}` });
      const text = j.content.filter((x) => x.type === 'text').map((x) => x.text).join('\n');
      const thought = j.content.filter((x) => x.type === 'thinking').map((x) => x.thinking).join('\n');
      resolve({ ok: true, text, thought, secs, input: j.usage?.input_tokens ?? 0, output: j.usage?.output_tokens ?? 0, thinking: j.usage?.output_tokens_details?.thinking_tokens ?? 0, stop: j.stop_reason });
    });
  });
}

function materials(proj, part) {
  const D = path.join(proj, 'work', '分鏡素材');
  const common = read(path.join(D, '共用.md')), ch = read(path.join(D, `${part}.md`)), howto = read(path.join(D, '寫法.md'));
  if (!common || !ch || !howto) throw new Error(`${proj} 沒有 work/分鏡素材/（共用.md、${part}.md、寫法.md）→ 先跑 build.mjs --project ${proj} --scaffold`);
  const list = specEntries(howto);
  const menu = list.map((e) => `- ${e.text.split('\n')[0].replace(/\*\*/g, '')}`).join('\n');
  const sec = (n) => common.split(/\n(?=## )/).find((x) => x.startsWith(`## ${n}.`)) || '';
  return { common, ch, howto, list, menu, sec };
}

const ONE = '你是分章寫分鏡草稿的子代理。一次寫完整份草稿 work/drafts/<份>.json：每段選模板或字卡、填好欄位（畫面上的字、#N@詞 綁講到的詞、story 的 say、why），約三成的段在 story 寫 designIdea、designWhy 當內容設計動畫候選（照樣先套模板），相鄰兩段不要用同一個模板，金句寫 quotes，拿不定寫 decide。秒數、時間下限、字數之後工具會檢查。只輸出完整 JSON（不要 markdown 圍欄、不要其他文字）。';
const OUTLINE = '這次只做第一步：分段大綱。每段一行：id | from | to | 模板 | 這段在講什麼（一句話） | 候選構想（值得做內容設計動畫才寫，不是寫 —）。連續講同一件事的幾句併成一段；每段都要有畫面；相鄰兩段不要同一個模板；約三成的段寫候選構想。段長、時間下限、接縫、候選比例都由工具檢查，不用自己算。只輸出這幾行，不要其他文字。';
const FILL = '第二步：填草稿骨架。段落、模板、起訖、anchor 已經定好，只把 <…>（畫面上的字，<> 裡是字數上限）和 #N@詞（講到那個東西的詞，要是那句字幕裡連續的字）換成真的內容；寫 auto 的時間不用動（卡上的字用字幕原詞，工具會找到講到它的地方；卡上的字是改寫的就直接寫 #N@詞）；why 已經寫了模板用途，要改再改；designWhy 寫為什麼值得設計。金句寫 quotes，拿不定寫 decide。只輸出填好的完整 JSON（不要 markdown 圍欄、不要其他文字）。';
const FIX = (tool) => `工具檢查的結果如下，照 → 改好 ✖（⚠ 不用管），輸出改好的完整內容（格式和上次一樣，不要其他文字）：\n\n${tool}`;

async function runOne(F, src, mode, i, tmpRoot) {
  const proj = path.join(tmpRoot, `${mode}-${i}`);
  const cp = spawnSync('cp', ['-cR', src, proj]);
  if (cp.status !== 0) spawnSync('cp', ['-R', src, proj]);
  const drafts = path.join(proj, 'work', 'drafts');
  fs.mkdirSync(drafts, { recursive: true });
  for (const f of [`${F.part}.json`, `${F.part}.outline.md`]) if (fs.existsSync(path.join(drafts, f))) fs.renameSync(path.join(drafts, f), path.join(drafts, `${f}.before-bench`));
  const M = materials(proj, F.part);
  const rec = { mode, run: i, calls: [], secs: 0, input: 0, output: 0, thinking: 0, produced: false, errors: null, warns: null, metrics: null, why: null };
  const call = async (label, messages) => {
    const r = await mmx(F, messages, tmpRoot);
    if (r.text != null) fs.writeFileSync(path.join(proj, `bench-${rec.calls.length + 1}-${label}.txt`), r.text);   // 原始回覆留著，解析失敗時看
    if (r.thought) fs.writeFileSync(path.join(proj, `bench-${rec.calls.length + 1}-${label}.thinking.txt`), r.thought);   // 思考內容：分析時間花在哪
    rec.calls.push({ label, secs: r.secs ?? 0, output: r.output ?? 0, thinking: r.thinking ?? 0, ok: r.ok, stop: r.stop });
    rec.secs += r.secs ?? 0; rec.input += r.input ?? 0; rec.output += r.output ?? 0; rec.thinking += r.thinking ?? 0;
    if (!r.ok) rec.why = r.why;
    return r;
  };
  const draftFile = path.join(drafts, `${F.part}.json`);
  const check = () => { const c = build(proj, '--check-draft', F.part); return { out: `${c.stdout}${c.stderr}`, ...parseCheck(c.stdout) }; };
  const finish = (draft) => {
    if (!draft) return rec;
    rec.produced = true;
    const c = check();
    Object.assign(rec, { errors: c.errors, warns: c.warns });
    const now = JSON.parse(read(draftFile) || 'null') || draft;
    rec.metrics = draftMetrics(now.segments || []);
    return rec;
  };
  if (mode === 'one') {
    const msgs = [{ role: 'user', content: `${ONE}\n\n===== 共用.md =====\n${M.common}\n\n===== 寫法.md =====\n${M.howto}\n\n===== ${F.part}.md（這一份的字幕）=====\n${M.ch}` }];
    const r = await call('寫整份', msgs);
    if (F.dry) { rec.promptChars = msgs[0].content.length; return rec; }
    let draft = r.ok ? jsonFrom(r.text) : null;
    if (!draft) { rec.why = rec.why || (r.ok ? `回覆不是 JSON（${r.stop}，原文在 ${proj}/bench-1-寫整份.txt）` : null); return rec; }
    fs.writeFileSync(draftFile, JSON.stringify(draft, null, 2));
    const c = check();
    if (c.errors > 0) {
      const r2 = await call('修正', [...msgs, { role: 'assistant', content: r.text }, { role: 'user', content: FIX(c.out) }]);
      const d2 = r2.ok ? jsonFrom(r2.text) : null;
      if (d2) { draft = d2; fs.writeFileSync(draftFile, JSON.stringify(draft, null, 2)); }
    }
    return finish(draft);
  }
  // 兩步：大綱 → --outline（✖／⚠ 修一輪）→ 骨架 → 填 → --check-draft（✖ 修一輪）
  const olFile = path.join(drafts, `${F.part}.outline.md`);
  const om = [{ role: 'user', content: `${OUTLINE}\n\n可以用的模板（名稱照第一個空白前後寫，例 key-point、x-scene、fx 01、media）：\n${M.menu}\n\n===== 共用.md =====\n${M.common}\n\n===== ${F.part}.md（這一份的字幕）=====\n${M.ch}` }];
  const o1 = await call('大綱', om);
  if (F.dry) { rec.promptChars = om[0].content.length; return rec; }
  if (!o1.ok || !o1.text.includes('|')) return rec;
  fs.writeFileSync(olFile, o1.text.trim() + '\n');
  let ol = build(proj, '--outline', F.part);
  if (ol.status !== 0 || /^⚠/m.test(ol.stdout)) {
    const o2 = await call('大綱修正', [...om, { role: 'assistant', content: o1.text }, { role: 'user', content: FIX(ol.stdout) }]);
    if (o2.ok && o2.text.includes('|')) { fs.writeFileSync(olFile, o2.text.trim() + '\n'); ol = build(proj, '--outline', F.part); }
  }
  if (ol.status !== 0 || !fs.existsSync(draftFile)) { rec.why = rec.why || `--outline 沒過：${ol.stdout.split('\n').filter((l) => l.startsWith('✖')).slice(0, 2).join(' ')}`; return rec; }
  const sk = JSON.parse(read(draftFile));
  const nameOf = (s) => (s.type === 'fx' ? `fx ${String(s.fx).padStart(2, '0')}` : s.scene || s.template || (s.type === 'media' ? 'media' : ''));
  const specFor = (u) => M.list.find((e) => { const n = e.name.toLowerCase(); return n === u || n.split(/\s+/).includes(u) || n.startsWith(`${u} `); })?.text;
  const specsOf = (segs) => [...new Set(segs.map(nameOf).filter(Boolean))].map(specFor).filter(Boolean).join('\n\n');
  const hints = ol.stdout.split('\n').filter((l) => /^ {2}\S/.test(l)).join('\n');
  const fillPrompt = (segs, text) => [{ role: 'user', content: `${text}${hints ? `\n\n===== 模板動畫的拍綁哪幾句 =====\n${hints.split('\n').filter((l) => segs.some((x) => l.includes(`${x.id}：`))).join('\n')}` : ''}\n\n===== 要填的段 =====\n${JSON.stringify(segs)}\n\n===== 用到的模板寫法 =====\n${specsOf(segs)}\n\n===== 時間寫法、草稿格式 =====\n${M.sec(6)}\n${M.sec(7)}\n\n===== ${F.part}.md（這一份的字幕）=====\n${M.ch}` }];
  const batch = Number(F['fill-batch']) || 0;
  let draft = null, fm = null, last = null;
  if (!batch) {
    fm = fillPrompt(sk.segments, `${FILL}\n（要填的段就是整份骨架的 segments；輸出整份草稿 JSON：chapter、segments、icons、quotes、decide）`);
    const f1 = await call('填骨架', fm);
    last = f1;
    draft = f1.ok ? jsonFrom(f1.text) : null;
  } else {
    // 分批填：一次 batch 段，每批只想那幾段（2026-11-09 實測：一次填整份 1/3 次 4 萬 token 全花在思考）
    draft = { ...sk, segments: [], quotes: [], decide: [] };
    for (let k = 0; k < sk.segments.length; k += batch) {
      const part = sk.segments.slice(k, k + batch);
      fm = fillPrompt(part, `${FILL}\n（這一批只填下面這 ${part.length} 段；輸出 JSON：{"segments":[填好的這幾段],"quotes":[],"decide":[]}，金句、拿不定的事只寫這幾段範圍裡的）`);
      const r = await call(`填第 ${k / batch + 1} 批`, fm);
      last = r;
      const j = r.ok ? jsonFrom(r.text) : null;
      if (!j?.segments) { draft = null; break; }
      draft.segments.push(...j.segments); draft.quotes.push(...(j.quotes || [])); draft.decide.push(...(j.decide || []));
    }
  }
  if (!draft) { rec.why = rec.why || (last?.ok ? `填骨架的回覆不是 JSON（${last.stop}${last.stop === 'max_tokens' ? '：上限全花在思考' : ''}）` : null); return rec; }
  fs.writeFileSync(draftFile, JSON.stringify(draft, null, 2));
  const c = check();
  if (c.errors > 0) {
    const cur = read(draftFile);   // 工具可能已經補了 auto、換了圖示
    const f2 = await call('填骨架修正', [{ role: 'user', content: `${FILL}\n\n===== 草稿 =====\n${cur}\n\n===== 用到的模板寫法 =====\n${specsOf(sk.segments)}\n\n===== ${F.part}.md（這一份的字幕）=====\n${M.ch}` }, { role: 'assistant', content: cur }, { role: 'user', content: FIX(c.out) }]);
    const d2 = f2.ok ? jsonFrom(f2.text) : null;
    if (d2) { draft = d2; fs.writeFileSync(draftFile, JSON.stringify(draft, null, 2)); }
  }
  return finish(draft);
}

async function pool(tasks, n) {
  const out = [];
  let k = 0;
  await Promise.all(Array.from({ length: Math.max(1, n) }, async () => { while (k < tasks.length) { const i = k++; out[i] = await tasks[i](); } }));
  return out;
}

export async function main(argv = process.argv.slice(2)) {
  const F = args(argv);
  if (F.help || !F.project) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*\n?/, '').replace(/^ \* ?/gm, '')); return F.help ? 0 : 1; }
  const src = path.resolve(F.project);
  try { materials(src, F.part); } catch (e) { console.log(`✖ ${e.message}`); return 1; }
  if (!F.dry && spawnSync('mmx', ['--version'], { encoding: 'utf8' }).status !== 0) { console.log('✖ 找不到 mmx → 照 mmx-cli 說明安裝並登入（mmx auth login），再跑一次'); return 2; }
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'draft-bench-'));
  const modes = String(F.modes).split(',').map((x) => x.trim()).filter((x) => ['one', 'two'].includes(x));
  const tasks = [];
  for (let i = 1; i <= Number(F.runs); i++) for (const m of modes) tasks.push(() => runOne(F, src, m, i, tmpRoot).catch((e) => ({ mode: m, run: i, produced: false, why: e.message, calls: [] })));
  console.log(`基準測試：${path.relative(ROOT, src) || src} ${F.part}，${modes.join('、')} 各 ${F.runs} 次（同時 ${F.parallel} 個；暫存 ${tmpRoot}）`);
  const t0 = Date.now();
  const rows = await pool(tasks, Number(F.parallel));
  const quota = rows.find((r) => /quota|額度|insufficient|401|unauthor/i.test(r.why || ''));
  if (quota) { console.log(`✖ mmx 不能用：${quota.why}`); return 2; }
  const sum = Object.fromEntries(modes.map((m) => {
    const rs = rows.filter((r) => r.mode === m), ok = rs.filter((r) => r.produced);
    const med = (f) => median(ok.map(f));
    return [m, { runs: rs.length, produced: ok.length, secs: med((r) => r.secs), output: med((r) => r.output), thinking: med((r) => r.thinking), calls: med((r) => r.calls.length),
      errors: med((r) => r.errors), warns: med((r) => r.warns), animRatio: med((r) => r.metrics?.animRatio), candRatio: med((r) => r.metrics?.candRatio), adjacent: med((r) => r.metrics?.adjacent), segs: med((r) => r.metrics?.segs) }];
  }));
  const name = { one: '一次寫整份', two: `大綱 → 骨架${Number(F['fill-batch']) ? `（每批 ${F['fill-batch']} 段）` : ''}` };
  console.log('\n| 寫法 | 產出 | 秒數 | 輸出 token | 思考 token | 呼叫 | ✖ | ⚠ | 段數 | 模板動畫比例 | 候選比例 | 相鄰同模板 |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const m of modes) { const s = sum[m]; console.log(`| ${name[m]} | ${s.produced}/${s.runs} | ${s.secs ?? '—'} | ${s.output ?? '—'} | ${s.thinking ?? '—'} | ${s.calls ?? '—'} | ${s.errors ?? '—'} | ${s.warns ?? '—'} | ${s.segs ?? '—'} | ${s.animRatio ?? '—'} | ${s.candRatio ?? '—'} | ${s.adjacent ?? '—'} |`); }
  console.log('（中位數；只算有產出的次數。秒數＝模型時間加總，不含工具）');
  for (const r of rows) if (!r.produced && r.why) console.log(`沒產出：${name[r.mode]} 第 ${r.run} 次：${r.why}`);
  if (F.dry) for (const r of rows) console.log(`提示長度：${name[r.mode]} 第 ${r.run} 次 ${r.promptChars ?? '—'} 字`);
  const out = path.resolve(F.out || path.join(tmpRoot, 'result.json'));
  fs.writeFileSync(out, JSON.stringify({ when: new Date().toISOString(), project: src, part: F.part, maxTokens: Number(F['max-tokens']), wallSecs: Math.round((Date.now() - t0) / 1000), summary: sum, rows }, null, 2));
  console.log(`結果：${out}`);
  return 0;
}

const isMain = () => { try { return fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } };
if (isMain()) process.exitCode = await main();
