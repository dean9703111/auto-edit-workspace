#!/usr/bin/env node
/**
 * 056 橫式／直式對照（作者維護用，剪片時不用）：盤點用的暫存專案、截圖、量測、並排圖，整理成可以重跑的一支。
 *
 *   node dev/056/compare.mjs --make                 建暫存專案 L（橫式）、P（直式）並 build：54 支情境動畫模板（範例原文）＋18 種情境（sample＋全幕版）
 *                                                   ＋40 支字卡動態（預設文字，bg 不寫＝透明），和盤點（survey.md）同一份
 *   node dev/056/compare.mjs --baseline             改前：照專案現在 build 好的畫面截基準（橫式 PNG、直式 JPEG）存 <root>/before/，時間點記在 before/times.json。
 *                                                   056 的基準是盤點時的狀態，包 0 動手前截過一次了，之後不要再跑（會蓋掉）
 *   node dev/056/compare.mjs x-checklist [x-fix …]  改後：模板同步進專案 → 重 build L、P → 截這幾支（基準的同一批時間點）→ 橫式和基準逐像素比 → 直式 audit → 並排圖
 *   node dev/056/compare.mjs --pack D               一包的清單（survey.md「建議的分包」：A–G，可以寫 A,B）；--pack all＝七包全部；--all＝暫存專案的全部 116 段
 *     名稱：情境動畫模板 x-<名稱>、情境 01-chapter／06-concept-full（全幕版）、字卡動態 fx-12 或 fx-12-diagonal-text-bands
 *   選項：--root <資料夾>  暫存專案、基準、輸出放哪（預設 $AUTO_EDIT_056，或 /Volumes/auto-edit-projects/.tmp-056，沒掛就系統暫存的 auto-edit-056）
 *         --jobs N         同時開幾個 Chrome（預設 4）
 *         --no-build       不重 build（剛 build 過、只想重截圖時）
 *         --no-audit       不跑直式 audit
 *
 * 每支印一行：橫式（和改前逐像素比：每個色值差 > 4 的個數 ≤ 十萬分之一算相同，同 examples.test 的容許）、直式 audit 的 ✖／⚠ 數、
 * 畫面上最小字（改前 → 改後，直式已乘縮放）、並排圖路徑。並排圖 <root>/compare/<名稱>.jpg：每一列「改前橫｜改後橫｜改前直｜改後直」，
 * 第一列完成態、之後是關鍵拍；直式 audit 的原文、量測寫 <root>/compare/report.json。
 * 結束碼 1：橫式和改前不同（band 類字卡動態除外：056 包 0 起橫式不寫 bg 時改成不透明，預期不同）、或直式 audit 有 ✖
 *   （直式不提供的不算：band 類字卡動態、fill.json 寫 "portrait": "none" 的模板）。report.json 累積每一支最近一次的結果。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WS = path.resolve(HERE, '..', '..');
const TEMPLATE = path.join(WS, 'shared', 'template');
const TOOLS = path.join(TEMPLATE, 'tools');
const CUSTOM = path.join(TEMPLATE, 'custom');
const imp = (p) => import(pathToFileURL(path.join(TOOLS, p)).href);
const sharp = createRequire(path.join(WS, 'package.json'))('sharp');

const args = process.argv.slice(2);
const opt = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const flag = (k) => args.includes(k);
const VAL = new Set(['--root', '--jobs', '--pack']);
const names0 = args.filter((a, i) => !a.startsWith('--') && !VAL.has(args[i - 1]));
const JOBS = Math.max(1, Math.min(8, Number(opt('--jobs', 4)) || 4));
process.env.AUTO_EDIT_MATTE ||= 'box';   // 人物去背的模板：用假去背（方框當成人），不跑模型
const EXT = '/Volumes/auto-edit-projects/.tmp-056';
const ROOT = path.resolve(opt('--root') || process.env.AUTO_EDIT_056 || (fs.existsSync(path.dirname(EXT)) ? EXT : path.join(os.tmpdir(), 'auto-edit-056')));
const PROJ = { L: path.join(ROOT, 'L'), P: path.join(ROOT, 'P') };
const BEFORE = path.join(ROOT, 'before'), AFTER = path.join(ROOT, 'after'), OUT = path.join(ROOT, 'compare');

// survey.md「建議的分包」
const PACKS = {
  A: ['06-concept-full', '07-key-point', '08-steps', '09-qa', '09-qa-full', '10-tips', '11-summary-full', '12-keywords', '14-speaker', '15-quote', '15-quote-full'],
  B: ['01-chapter', '02-chapter-tag', '04a-fs-list', '04b-fs-compare', '04c-fs-flow', '04d-fs-table', 'fx-20', 'fx-22'],
  C: ['x-architecture', 'x-architecture-send', 'x-branch', 'x-callout', 'x-process', 'x-process-loop', 'x-process-trace', 'x-prompt-tree', 'x-route', 'x-timeline'],
  D: ['x-checklist', 'x-checklist-ai', 'x-fix', 'x-folder', 'x-recap', 'x-relay', 'x-scroll-brake', 'x-stack', 'x-stack-podium', 'x-warnings'],
  E: ['x-before-after', 'x-crowd', 'x-crowd-queue', 'x-rank', 'x-receipt', 'x-ring', 'x-ring-facets', 'x-trend', 'x-trend-blocks', 'x-versus'],
  F: ['x-code-diff', 'x-comment', 'x-news', 'x-prompt', 'x-prompt-chat', 'x-slider', 'x-terminal', 'x-terminal-code', 'x-ui-mock', 'x-ui-mock-tidy'],
  G: ['x-scene', 'x-scene-example-outline', 'x-scene-example-rec', 'x-desk', 'x-metaphor', 'x-callout-parts', 'x-callout-phone', 'x-point', 'x-wordcut'],
};

const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const node = (a, cwd = WS) => spawnSync(process.execPath, a, { cwd, encoding: 'utf8', maxBuffer: 1 << 28, env: process.env });
const stamp = (t) => { const ms = Math.round(t * 1000); const q = (n, w = 2) => String(n).padStart(w, '0'); return `${q(Math.floor(ms / 3600000))}:${q(Math.floor(ms / 60000) % 60)}:${q(Math.floor(ms / 1000) % 60)},${q(ms % 1000, 3)}`; };

// ---------- 暫存專案（照 dev/tests/examples.test.mjs 的 makeProject；情境、字卡動態另外配句號 2001 起） ----------
async function makeProject(dir, format) {
  const { stripMarkers } = await imp('lib/custom-fill.mjs');
  const { textWidth } = await imp('lib/time.mjs');
  const { loadScenes, loadFx, sampleSeg } = await imp('lib/scenes.mjs');
  const parse = (id) => {
    const file = path.join(CUSTOM, `${id}.html`);
    const tpl = stripMarkers(fs.readFileSync(file, 'utf8')).match(/<template[^>]*>([\s\S]*)<\/template>/)[1];
    return { file, sample: JSON.parse(tpl.match(/data-cues-sample='([^']+)'/)[1]), overlay: !tpl.includes('sc-surface-fs') };
  };
  const cueText = (n, word, a, b, ref) => {
    const tail = `這一句是第 ${n} 句的字幕內容，用來對時間`;
    if (!word) return `第 ${n} 句字幕內容`;
    for (let j = 0; ; j++) {
      const pre = '嗯'.repeat(j >> 1) + (j & 1 ? ' ' : ''), text = pre + word + tail;
      if (a + textWidth(pre) / textWidth(text) * (b - a) >= ref - 1e-3) return text;
    }
  };
  for (const d of ['assets/camera', 'assets/voice', 'assets/screen', 'assets/images', 'work/hyperframes/compositions', 'output']) fs.mkdirSync(path.join(dir, d), { recursive: true });
  const shots = path.join(TEMPLATE, 'preview', 'shots');
  // 036 截圖欄位的示意圖：模板原文寫 ../preview/shots/（主合成是 work/hyperframes/index.html → work/preview/shots/）；audit 的伺服器根目錄是 work/hyperframes/，再放一份
  if (fs.existsSync(shots)) for (const d of ['work/preview/shots', 'work/hyperframes/preview/shots']) fs.cpSync(shots, path.join(dir, d), { recursive: true });
  const srt = [], scenes = [], index = [], used = new Set();
  let S = 1.0, N = 2001;
  const names = fs.readdirSync(CUSTOM).filter((f) => /^x-[\w-]+\.html$/.test(f)).map((f) => f.replace(/\.html$/, '')).sort();
  for (const [k, name] of names.entries()) {
    const p = parse(name);
    const nums = Object.keys(p.sample.cues).map(Number).sort((a, b) => a - b);
    for (const n of [nums[0] - 1, ...nums]) { if (used.has(n)) throw new Error(`${name} 句號 ${n} 和別支重複`); used.add(n); }
    const wordOf = {};
    for (const ref of Object.keys(p.sample.refs || {})) { const m = ref.match(/^#(\d+)@(.+)$/); if (m) wordOf[m[1]] = m[2]; }
    const open = nums[0] - 1;
    srt.push({ a: S, b: S + p.sample.cues[nums[0]][0] - 0.3, text: `第 ${open} 句開場`, n: open });
    for (const [i, n] of nums.entries()) {
      const a = p.sample.cues[n][0], b = i === nums.length - 1 ? p.sample.D : p.sample.cues[n][1];
      srt.push({ n, a: S + a, b: S + b, text: cueText(n, wordOf[n], a, b, p.sample.refs?.[`#${n}@${wordOf[n]}`]) });
    }
    fs.copyFileSync(p.file, path.join(dir, 'work/hyperframes/compositions', `${name}.html`));
    const id = `x${String(k + 1).padStart(2, '0')}`;
    scenes.push({ id, type: 'custom', src: `compositions/${name}.html`, layout: p.overlay ? 'overlay' : 'fullscreen', from: `#${open}`, to: `#${nums[nums.length - 1]}e` });
    index.push({ id, kind: 'custom', name, D: p.sample.D, start: Math.round(S * 1000) / 1000 });
    S += p.sample.D + 1;
  }
  const list = [];
  for (const sc of loadScenes(TEMPLATE)) {
    if (format === 'portrait' && sc.portrait === 'none') continue;   // 03、05 直式不提供
    list.push({ sc, full: false });
    if (sc.hasFull) list.push({ sc, full: true });
  }
  for (const [k, { sc, full }] of list.entries()) {
    const seg = sampleSeg(sc), id = `s${String(k + 1).padStart(2, '0')}`, n = N++;
    if (sc.key === 'chapter') S += 3;   // 章節前留 3 秒停頓
    srt.push({ n, a: S, b: S + seg.duration - 0.2, text: `第 ${n} 句字幕內容` });
    const out = { id, scene: sc.key, slots: seg.slots };
    if (Object.keys(seg.beats).length) out.beats = seg.beats;
    if (sc.key === 'chapter') out.at = `#${n}`; else { out.from = `#${n}`; out.to = `#${n}e`; }
    if (full) out.full = true;
    scenes.push(out);
    index.push({ id, kind: 'scene', name: `${sc.num}-${sc.key}${full ? '-full' : ''}`, D: seg.duration, start: Math.round(S * 1000) / 1000 });
    S += seg.duration + 1;
  }
  for (const [k, f] of loadFx(TEMPLATE).entries()) {
    const id = `f${String(k + 1).padStart(2, '0')}`, n = N++;
    srt.push({ n, a: S, b: S + 4.3, text: `第 ${n} 句字幕內容` });
    const vars = {};
    for (const v of f.vars) if (!['accent', 'bg'].includes(v.id)) vars[v.id] = v.default;
    scenes.push({ id, type: 'fx', fx: f.no, from: `#${n}`, to: `#${n}e`, vars });
    index.push({ id, kind: 'fx', name: `fx-${String(f.no).padStart(2, '0')}-${f.slug}`, D: 4.5, start: Math.round(S * 1000) / 1000 });
    S += 5.5;
  }
  fs.writeFileSync(path.join(dir, 'work/rough.srt'), srt.map((x) => `${x.n}\n${stamp(x.a)} --> ${stamp(x.b)}\n${x.text}\n`).join('\n'));
  const img = path.join(TEMPLATE, 'preview', format === 'portrait' ? 'speaker-v.jpg' : 'speaker.jpg');
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-loop', '1', '-framerate', '30', '-i', img, '-f', 'lavfi', '-i', 'sine=frequency=330:sample_rate=48000', '-t', String(Math.ceil(S + 2)),
    '-vf', `scale=${format === 'portrait' ? '1080:1920' : '1920:1080'},format=yuv420p`, '-r', '30', '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'stillimage', '-crf', '30', '-g', '30', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-shortest', path.join(dir, 'work/rough.mp4')], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  fs.writeFileSync(path.join(dir, 'work/cutpoints.json'), JSON.stringify({ cuts: [] }, null, 2));
  const plan = { version: 1, ...(format === 'portrait' ? { format: 'portrait' } : {}), speakerBox: format === 'portrait' ? [300, 400, 780, 1400] : [700, 200, 1220, 1000], look: { slim: 0 }, scenes };
  fs.writeFileSync(path.join(dir, 'work/hyperframes/plan.json'), JSON.stringify(plan, null, 2));
  fs.writeFileSync(path.join(dir, 'survey-index.json'), JSON.stringify(index, null, 2));
}

// 模板同步進專案（custom 是複製的檔，build 不會自己更新）；回傳換了幾支
function syncCustom(dir) {
  let n = 0;
  const comp = path.join(dir, 'work', 'hyperframes', 'compositions');
  for (const it of readJson(path.join(dir, 'survey-index.json'), [])) {
    if (it.kind !== 'custom') continue;
    const src = path.join(CUSTOM, `${it.name}.html`), dst = path.join(comp, `${it.name}.html`);
    if (!fs.existsSync(src)) continue;
    if (fs.existsSync(dst) && fs.readFileSync(src).equals(fs.readFileSync(dst))) continue;
    fs.copyFileSync(src, dst); n++;
  }
  return n;
}
function build(dir, tag) {
  const b = node([path.join(TOOLS, 'build.mjs'), '--project', dir]);
  if (b.status !== 0) { console.log(`✖ ${tag} build 沒過（${dir}）：\n${(b.stdout + b.stderr).split('\n').filter((l) => /✖/.test(l)).slice(0, 20).join('\n') || (b.stdout + b.stderr).slice(-2000)}`); process.exit(1); }
  // 講者畫面：HyperFrames 的 chrome-headless-shell 解不了 H.264，截圖用示意圖當 poster
  fs.copyFileSync(path.join(TEMPLATE, 'preview', tag === 'P' ? 'speaker-v.jpg' : 'speaker.jpg'), path.join(dir, 'work', 'hyperframes', 'assets', 'pv-speaker.jpg'));
}
function segTimes(dir) {
  const c = node([path.join(TOOLS, 'build.mjs'), '--project', dir, '--check', '--json']);
  const j = JSON.parse(c.stdout);
  return Object.fromEntries((j.items || j.segments || []).map((s) => [s.id, { start: s.out?.start ?? s.start, end: s.out?.end ?? s.end }]));
}

// ---------- 量測（畫面上的最小字＝字級 × 實際縮放；內容外框占可用區） ----------
const MEASURE = (hostId) => `(() => {
  const host = document.getElementById(${JSON.stringify(hostId)});
  if (!host) return { missing: true };
  const op = (el) => { let o = 1; for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const v = parseFloat(getComputedStyle(n).opacity); if (Number.isFinite(v)) o *= v; } return o; };
  const vis = (el) => { if (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true })) return false; const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden' && op(el) >= 0.2; };
  const W = innerWidth, H = innerHeight, texts = [];
  const walk = (el) => {
    for (const c of el.childNodes) {
      if (c.nodeType === 3) {
        const s = (c.textContent || '').replace(/\\s+/g, '');
        if (!s || !vis(c.parentElement)) continue;
        const rg = document.createRange(); rg.selectNodeContents(c);
        const rs = [...rg.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5 && r.right > 0 && r.bottom > 0 && r.left < W && r.top < H);
        if (!rs.length) continue;
        const p = c.parentElement;
        let k = 1;
        if (p instanceof SVGElement) { const m = p.getScreenCTM && p.getScreenCTM(); k = m ? Math.hypot(m.a, m.b) : 1; }
        else { const b = p.getBoundingClientRect(); k = p.offsetWidth > 2 ? b.width / p.offsetWidth : (p.offsetHeight > 2 ? b.height / p.offsetHeight : 1); }
        const fs = Math.round(parseFloat(getComputedStyle(p).fontSize) * k * 10) / 10;
        for (const r of rs) texts.push({ t: s.slice(0, 12), fs, box: [r.left, r.top, r.right, r.bottom].map(Math.round) });
      } else if (c.nodeType === 1 && !['SCRIPT', 'STYLE', 'TEMPLATE'].includes(c.tagName) && getComputedStyle(c).display !== 'none') walk(c);
    }
  };
  walk(host);
  return { texts };
})()`;
function summarize(m) {
  if (!m || m.missing || !m.texts?.length) return { minFont: null };
  const min = m.texts.reduce((a, b) => (b.fs < a.fs ? b : a));
  const u = m.texts.map((t) => t.box);
  return { minFont: min.fs, minText: min.t, under48: [...new Set(m.texts.filter((t) => t.fs < 47.5).map((t) => `${t.t}(${t.fs})`))].slice(0, 6), ink: [Math.min(...u.map((b) => b[0])), Math.min(...u.map((b) => b[1])), Math.max(...u.map((b) => b[2])), Math.max(...u.map((b) => b[3]))] };
}

// 時間點：完成態（段尾前 0.6 秒；字卡動態照 catalog 的 done）＋關鍵拍（P.at 標記 ≥ 3 個加中間拍＋1 秒，≥ 5 個再加第一拍＋1 秒）
async function pickTimes(sess, it, seg) {
  const D = seg.end - seg.start, hostId = `el-${it.id}`;
  const out = [{ k: 'end', t: D - 0.6 }];
  if (it.kind === 'fx') {
    const d = await sess.evaluate(`(() => {
      const host = document.getElementById('${hostId}'), comp = host && host.getAttribute('data-composition-id');
      const tl = comp && window.__timelines && window.__timelines[comp];
      if (!tl) return null;
      if (tl.labels && tl.labels.done != null) return { label: tl.labels.done };
      const D = ${D}, iv = [];
      const walk = (t, off) => { for (const c of t.getChildren(false, true, true)) { const s = off + c.startTime(), e = s + c.totalDuration(); if (c.getChildren) walk(c, s); else if (c.totalDuration() > 0.05) iv.push([s, e]); } };
      walk(tl, 0);
      return { exitAt: iv.filter(([s, e]) => e >= D - 0.35 && s > 0.3).reduce((m, [s]) => Math.min(m, s), D) };
    })()`);
    if (d?.label != null) out[0].t = d.label;
    else if (d && d.exitAt < D - 0.3 && d.exitAt > 0.6) out[0].t = d.exitAt - 0.1;
    out.push({ k: 'b1', t: D * 0.5 });
  } else if (it.kind === 'custom') {
    let marks = [];
    try { await sess.seek(seg.start + 0.5); marks = [...new Set(((await sess.motion({ hostId, compId: it.name })).marks || []).map((x) => Math.round(x.t * 100) / 100))].sort((a, b) => a - b); } catch { marks = []; }
    if (marks.length >= 3) out.push({ k: 'b1', t: Math.min(marks[Math.floor(marks.length / 2)] + 1, D - 1.2) });
    if (marks.length >= 5) out.push({ k: 'b0', t: Math.min(marks[0] + 1, D - 1.2) });
  }
  return out.map((x) => ({ k: x.k, t: Math.round(x.t * 1000) / 1000 }));
}

// 截一個專案裡的幾段：times＝{ 名稱: [{k, t}] }（段內秒數）；沒給就現場算（--baseline）
async function shoot(tag, items, dest, times = null) {
  const AB = await imp('lib/audit-browser.mjs');
  const portrait = tag === 'P', W = portrait ? 1080 : 1920, H = portrait ? 1920 : 1080, ext = portrait ? 'jpg' : 'png';
  const segs = segTimes(PROJ[tag]);
  fs.mkdirSync(dest, { recursive: true });
  const S = await AB.openSessions({ dir: path.join(PROJ[tag], 'work', 'hyperframes'), chrome: AB.findChrome({}), runtime: AB.findRuntime({}).file, W, H, count: Math.min(JOBS, Math.max(1, items.length)) });
  for (const s of S.sessions) await s.evaluate(`document.querySelectorAll('video[src$="rough.mp4"]').forEach((v) => v.setAttribute('poster', 'assets/pv-speaker.jpg'))`);
  const res = {};
  let next = 0;
  const worker = async (sess) => {
    for (;;) {
      const it = items[next++];
      if (!it) return;
      const seg = segs[it.id];
      if (!seg) { res[it.name] = { error: `${tag} 專案沒有 ${it.id}` }; continue; }
      const ts = times?.[it.name]?.[tag] || await pickTimes(sess, it, seg);
      const shots = [];
      let meas = null;
      for (const { k, t } of ts) {
        await sess.seek(seg.start + t);
        const file = path.join(dest, `${it.name}.${tag}.${k}.${ext}`);
        await sess.screenshot(file);
        shots.push({ k, t, file });
        if (k === 'end') meas = summarize(await sess.evaluate(MEASURE(`el-${it.id}`)));
      }
      res[it.name] = { id: it.id, shots, times: ts, ...meas };
      process.stdout.write('.');
    }
  };
  try { await Promise.all(S.sessions.map(worker)); } finally { await S.close(); }
  process.stdout.write('\n');
  return res;
}

// 逐像素：每個色值差 > 4 的個數（RGB）
async function pixelDiff(a, b) {
  if (!fs.existsSync(a) || !fs.existsSync(b)) return null;
  const [x, y] = await Promise.all([a, b].map((f) => sharp(f).removeAlpha().raw().toBuffer()));
  if (x.length !== y.length) return { bad: Infinity, total: x.length };
  let bad = 0;
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i] - y[i]) > 4) bad++;
  return { bad, total: x.length, same: bad <= x.length * 1e-5 };
}

// ---------- 並排圖 ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const label = (w, h, text, size = 30, bg = '#1d1d1d') => Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="${bg}"/><text x="14" y="${Math.round(h * 0.7)}" font-family="Helvetica, Arial, PingFang TC, sans-serif" font-size="${size}" fill="#fff">${esc(text)}</text></svg>`);
const fit = async (file, w, h) => (file && fs.existsSync(file) ? sharp(file).resize(w, h, { fit: 'fill' }).jpeg().toBuffer()
  : sharp(label(w, h, '（沒有）', 28, '#444')).jpeg().toBuffer());
// 每一列：左邊上半「改前橫｜改後橫」（960×540），下半寫這一格的時間與直式 audit 的 ✖／⚠（只寫在完成態那一列）；右邊「改前直｜改後直」（540×960）
const textBlock = (w, h, lines) => Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#181818"/>${lines.slice(0, Math.floor((h - 12) / 30)).map((l, i) => `<text x="14" y="${34 + i * 30}" font-family="Helvetica, Arial, PingFang TC, sans-serif" font-size="22" fill="${/^✖/.test(l) ? '#ff8a80' : /^⚠/.test(l) ? '#ffd180' : '#ddd'}">${esc(l.length > 84 ? `${l.slice(0, 83)}…` : l)}</text>`).join('')}</svg>`);
async function compose(name, rows, head, file) {
  const LW = 960, LH = 540, PW = 540, PH = 960, GAP = 8, TOP = 52, CAP = 34;
  const W = LW * 2 + PW * 2 + GAP * 3, H = TOP + CAP + rows.length * (PH + GAP);
  const comps = [{ input: label(W, TOP, head, 28), left: 0, top: 0 }];
  const cols = [['改前 橫式', LW], ['改後 橫式', LW], ['改前 直式', PW], ['改後 直式', PW]];
  let x = 0;
  for (const [t, w] of cols) { comps.push({ input: label(w, CAP, t, 22, '#333'), left: x, top: TOP }); x += w + GAP; }
  for (const [i, r] of rows.entries()) {
    const y = TOP + CAP + i * (PH + GAP);
    comps.push({ input: await fit(r.Lb, LW, LH), left: 0, top: y }, { input: await fit(r.La, LW, LH), left: LW + GAP, top: y },
      { input: textBlock(LW * 2 + GAP, PH - LH - GAP, r.lines || []), left: 0, top: y + LH + GAP },
      { input: await fit(r.Pb, PW, PH), left: LW * 2 + GAP * 2, top: y }, { input: await fit(r.Pa, PW, PH), left: LW * 2 + PW + GAP * 3, top: y });
  }
  await sharp({ create: { width: W, height: H, channels: 3, background: '#111' } }).composite(comps).jpeg({ quality: 82 }).toFile(file);
}

// ---------- 主程式 ----------
function resolveNames(index, strict = true) {
  let want = [...names0];
  if (flag('--all')) want.push(...indexOf('L').map((x) => x.name));
  const pk = opt('--pack');
  if (pk) want.push(...(pk === 'all' ? Object.values(PACKS).flat() : String(pk).toUpperCase().split(',').flatMap((p) => PACKS[p] || (() => { throw new Error(`沒有包 ${p}（可用 A–G、all）`); })())));
  const out = [];
  for (const w of want) {
    const it = index.find((x) => x.name === w) || index.find((x) => /^fx-\d+$/.test(w) && x.name.startsWith(`${w}-`));
    if (!it) { if (strict) throw new Error(`找不到「${w}」（名稱照 survey.md 總表：x-checklist、06-concept-full、fx-12…）`); continue; }
    if (!out.includes(it)) out.push(it);
  }
  return out;
}
const indexOf = (tag) => readJson(path.join(PROJ[tag], 'survey-index.json'), []);
const fmtT = (t) => (Number.isFinite(t) ? `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}` : '');

async function main() {
  if (flag('--help') || (!names0.length && !opt('--pack') && !flag('--all') && !flag('--make') && !flag('--baseline'))) {
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').match(/\/\*\*([\s\S]*?)\*\//)[1].replace(/^ \* ?/gm, '').trim());
    return 0;
  }
  if (flag('--make')) {
    for (const [tag, format] of [['L', 'landscape'], ['P', 'portrait']]) { await makeProject(PROJ[tag], format); build(PROJ[tag], tag); console.log(`✓ ${tag} ${PROJ[tag]}（${indexOf(tag).length} 段）`); }
    if (!names0.length && !opt('--pack') && !flag('--baseline')) return 0;
  }
  for (const tag of ['L', 'P']) if (!fs.existsSync(path.join(PROJ[tag], 'survey-index.json'))) { console.log(`✖ 沒有暫存專案 ${PROJ[tag]} → 先跑 node dev/056/compare.mjs --make`); return 1; }
  if (flag('--baseline')) {
    // 照專案現在 build 好的畫面截（不重 build）；時間點記下來，改後照同一批時間截
    const times = {}, meas = {};
    for (const tag of ['L', 'P']) {
      const idx = indexOf(tag), items = names0.length || opt('--pack') ? resolveNames(idx, false) : idx;
      console.log(`改前 ${tag}：${items.length} 段`);
      const r = await shoot(tag, items, BEFORE);
      for (const [name, v] of Object.entries(r)) { (times[name] ||= {})[tag] = v.times; (meas[name] ||= {})[tag] = { minFont: v.minFont, minText: v.minText, under48: v.under48, ink: v.ink, error: v.error }; }
    }
    const tf = path.join(BEFORE, 'times.json');
    fs.writeFileSync(tf, JSON.stringify({ ...readJson(tf, {}), ...times }, null, 1));
    const mf = path.join(BEFORE, 'measure.json');
    fs.writeFileSync(mf, JSON.stringify({ ...readJson(mf, {}), ...meas }, null, 1));
    console.log(`✓ 基準 ${BEFORE}`);
    return 0;
  }
  const times = readJson(path.join(BEFORE, 'times.json'));
  if (!times) { console.log(`✖ 沒有基準 ${BEFORE}/times.json → 動手改之前先跑 node dev/056/compare.mjs --baseline`); return 1; }
  const before = readJson(path.join(BEFORE, 'measure.json'), {});
  const itemsL = resolveNames(indexOf('L')), itemsP = resolveNames(indexOf('P'), false);
  const { loadFx } = await imp('lib/scenes.mjs');
  const bandFx = new Set(loadFx(TEMPLATE).filter((f) => f.portrait === 'band').map((f) => `fx-${String(f.no).padStart(2, '0')}-${f.slug}`));
  // 直式不提供（不算沒過）：band 類字卡動態（catalog portrait: band，--check 會 ⚠）、fill.json 寫 "portrait": "none" 的模板（直式專案 ✖ 建議 portraitAlt）
  const noPortrait = (name) => bandFx.has(name) || readJson(path.join(TEMPLATE, 'custom', `${name}.fill.json`), {}).portrait === 'none';
  if (!flag('--no-build')) for (const tag of ['L', 'P']) { const n = syncCustom(PROJ[tag]); build(PROJ[tag], tag); console.log(`✓ ${tag} build（同步 ${n} 支模板）`); }
  const rL = await shoot('L', itemsL, AFTER, times);
  const rP = await shoot('P', itemsP, AFTER, times);
  // 直式 audit（只量這幾段；字卡動態要指名才量）
  let audit = { findings: [] };
  if (!flag('--no-audit') && itemsP.length) {
    const a = node([path.join(TOOLS, 'audit.mjs'), '--project', PROJ.P, '--json', '--only', itemsP.map((x) => x.id).join(',')]);
    try { audit = JSON.parse(a.stdout); } catch { console.log(`✖ 直式 audit 沒有回 JSON：\n${(a.stdout + a.stderr).slice(-1500)}`); return 1; }
  }
  fs.mkdirSync(OUT, { recursive: true });
  const report = [];
  let bad = 0;
  for (const it of itemsL) {
    const L = rL[it.name] || {}, P = rP[it.name] || {};
    const diffs = [];
    for (const s of L.shots || []) diffs.push({ k: s.k, ...(await pixelDiff(path.join(BEFORE, `${it.name}.L.${s.k}.png`), s.file)) });
    const same = diffs.length && diffs.every((d) => d.same);
    const band = bandFx.has(it.name);
    const pid = itemsP.find((x) => x.name === it.name)?.id;
    const f = (audit.findings || []).filter((x) => x.id === pid);
    const nE = f.filter((x) => x.level === 'error').length, nW = f.filter((x) => x.level === 'warn').length;
    const bm = before[it.name] || {};
    const fmt = (a, b) => `${a ?? '—'} → ${b ?? '—'}`;
    const lText = same ? '橫式 ✓ 逐像素相同' : band ? '橫式 ≠ 改前（band 類，056 包 0 預期）' : `橫式 ✖ 和改前不同（${diffs.map((d) => `${d.k} ${d.bad ?? '沒有基準'}`).join('、')} 個色值）`;
    const np = noPortrait(it.name);
    const pText = !pid ? '直式不放' : flag('--no-audit') ? '直式 audit 略過' : `直式 audit ${nE} ✖ ${nW} ⚠${np ? '（直式不提供，不算）' : ''}`;
    const fail = (!same && !band) || (nE && !np);
    if (fail) bad++;
    const head = `${it.name}  |  ${lText}  |  ${pText}  |  最小字 橫 ${fmt(bm.L?.minFont, L.minFont)}、直 ${fmt(bm.P?.minFont, P.minFont)} px`;
    const ks = (L.shots || []).map((s) => s.k);
    const tOf = (k) => (L.shots || []).find((s) => s.k === k)?.t;
    const fl = f.map((x) => `${x.level === 'error' ? '✖' : '⚠'} ${x.rule} ${fmtT(x.t)} ${x.msg}`);
    const rows = ks.map((k, i) => ({ Lb: path.join(BEFORE, `${it.name}.L.${k}.png`), La: path.join(AFTER, `${it.name}.L.${k}.png`), Pb: path.join(BEFORE, `${it.name}.P.${k}.jpg`), Pa: path.join(AFTER, `${it.name}.P.${k}.jpg`),
      lines: [`${k === 'end' ? '完成態' : '關鍵拍'}（段內 ${tOf(k)} 秒）${diffs[i] ? `｜橫式差 ${diffs[i].bad ?? '—'} 個色值` : ''}`, ...(k === 'end' ? (pid ? (fl.length ? fl : ['直式 audit 0 ✖ 0 ⚠']) : ['直式不放']) : [])] }));
    const file = path.join(OUT, `${it.name}.jpg`);
    await compose(it.name, rows, head, file);
    console.log(`${fail ? '✖' : '✓'} ${head}\n    ${file}`);
    if (!np) for (const x of f.filter((y) => y.level === 'error')) console.log(`    ✖ ${x.rule} ${x.msg}`);
    report.push({ name: it.name, id: it.id, pass: !fail, landscape: { same, band, diffs }, portrait: { id: pid, none: np, errors: nE, warns: nW, findings: f.map((x) => ({ level: x.level, rule: x.rule, t: x.t, msg: x.msg })) }, minFont: { before: { L: bm.L?.minFont, P: bm.P?.minFont }, after: { L: L.minFont, P: P.minFont } }, under48: P.under48, image: file });
  }
  // report.json 累積：這次跑到的蓋掉同名的舊結果，其他保留（一包一包跑完，整份就是全部的現況）
  const rf = path.join(OUT, 'report.json');
  const mine = new Set(report.map((x) => x.name));
  const all = [...(readJson(rf, {}).items || []).filter((x) => !mine.has(x.name)), ...report];
  fs.writeFileSync(rf, JSON.stringify({ at: new Date().toISOString(), root: ROOT, items: all }, null, 1));
  console.log(`${bad ? `✖ ${bad} 支沒過` : `✓ ${report.length} 支都過`}（橫式逐像素不變、直式 audit 0 ✖）；細節 ${rf}`);
  return bad ? 1 : 0;
}

main().then((c) => process.exit(c), (e) => { console.error(`✖ ${e.message}`); process.exit(1); });
