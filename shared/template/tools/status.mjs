#!/usr/bin/env node
/**
 * 專案進度：做到哪一步、下一步做什麼、哪個停點在等回覆（只讀檔，不寫任何檔、不跑 ffmpeg；版式要看主軌時用 ffprobe 讀寬高）
 *
 *   node shared/template/tools/status.mjs --project projects/<專案> [--json]
 *   node shared/template/tools/status.mjs --project projects/<專案> --timeline [--json]
 *       時間軸：各階段產物第一次出現（建立時間）與最後修改的時間，加上 work/製作進度.md 停點紀錄的時間，
 *       算出總時長、等使用者回覆的時間、AI 在做事的時間，和最久的幾段（找「哪裡花最久」用；舊專案也能看）。
 *
 * 印出：
 *   版式：<直式 1080×1920｜橫式 1920×1080>（來源：…）   （lib/canvas.mjs 的 resolveFormat：plan.json > 開工決策表 > 主軌寬高比）
 *   專案：<路徑>
 *   目前在：<階段>            例：剪好看／停點 ③ 分鏡表（待回覆）
 *   下一步：<一句話>
 *   <指令>                   （只有講者調光瘦臉還沒好時：look.mjs 的 lookNextStep 給的指令，單獨一行、整行可以複製執行）
 *   下一個停點：<① 剪輯清單｜② 構圖｜③ 分鏡表｜④ Studio 預覽｜無>
 *   待回覆停點：<停點名稱，用「、」接｜無>
 *   下一輪回饋編號：r<N>      （work/feedback/ 裡 r*.md 的最大編號 ＋ 1）
 *   依據：<判斷用到的檔案與停點紀錄>
 *   講者：⚠ …                 （只有 shared/講者.json 還沒設定或格式不對時才印：提醒設定講者資料，lib/speaker.mjs）
 *
 * 判斷依據：work/ 裡各階段產物在不在、修改時間先後（例：storyboard.md 比 plan.json 新＝還在分鏡表；
 * storyboard.md 是 versions.mjs accept／use 寫的不算），以及 work/製作進度.md 的「## 停點紀錄」表（同一個停點以最後一列為準，
 * 狀態「待回覆」＝卡在這裡；改版的停點寫「③ 分鏡表（s12 v2）」）。work/versions/ 有沒做完的改版提案時，目前在印「改版／…」。
 * --json：只印一個 JSON（project、stage、at、next、cmd、nextStop、waiting、feedback、evidence、format、formatSource、speaker；cmd 平常是 null；speaker＝set／off／unset／bad）。
 * --project：同 build.mjs。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findProject } from './build.mjs';
import { VIDEO_EXT, AUDIO_EXT } from './lib/ff.mjs';
import { lookNextStep } from './lib/look.mjs';
import { narrationOf } from './media.mjs';
import { resolveFormat, formatLine } from './lib/canvas.mjs';
import { pendingRevisions, storyboardByVersions } from './versions.mjs';
import { readSpeaker, SET_CMD } from './lib/speaker.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STOPS = ['① 剪輯清單', '② 構圖', '③ 分鏡表', '④ Studio 預覽', '⑤ 剪輯台', '⑥ 背景預覽'];
const NEWER = 1000;   // 修改時間差 1 秒以內視為同時（同一次 build 寫出的檔）

const posix = (p) => p.split(path.sep).join('/');
const stat = (f) => { try { return fs.statSync(f); } catch { return null; } };
const files = (dir, exts) => { try { return fs.readdirSync(dir).filter((f) => !f.startsWith('.') && exts.includes(path.extname(f).toLowerCase())); } catch { return []; } };

// work/製作進度.md 的「## 停點紀錄」：| 時間 | 停點 | 狀態 | 使用者原話 | 寫回哪裡 |；同一停點以最後一列為準
export function readStopLog(text) {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/);
  const at = lines.findIndex((l) => /^##\s*停點紀錄\s*$/.test(l.trim()));
  if (at < 0) return { found: false, last: new Map(), rows: [] };
  let i = at + 1;
  while (i < lines.length && !/^\s*\|/.test(lines[i])) { if (/^##\s/.test(lines[i])) return { found: false, last: new Map(), rows: [] }; i++; }
  const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  const head = cells(lines[i] || '');
  const iT = head.findIndex((h) => h.includes('時間')), iS = head.findIndex((h) => h.includes('停點')), iV = head.findIndex((h) => h.includes('狀態'));
  if (iT < 0 || iS < 0 || iV < 0) return { found: true, bad: true, last: new Map(), rows: [] };
  const rows = [], last = new Map();
  for (let j = i + 2; j < lines.length && /^\s*\|/.test(lines[j]); j++) {
    const c = cells(lines[j]);
    const stop = STOPS.find((s) => c[iS]?.startsWith(s.slice(0, 1))) || null;
    if (!stop) continue;
    const row = { time: c[iT], stop, label: c[iS] || stop, state: c[iV], line: j + 1 };
    rows.push(row);
    last.set(stop, row);
  }
  return { found: true, last, rows };
}

// ---------- 時間軸（--timeline）----------
// 產物照「第一次出現」排（birthtime；檔案系統不給就用修改時間），停點紀錄照表上的時間；
// 等待＝停點「待回覆」到同一個停點下一列的時間，其餘算 AI 在做事（含 render、轉檔這類等工具跑的時間）
export const TIMELINE_FILES = [
  ['work/main.mp4', '接主軌（剪乾淨開始）'], ['work/cuts.md', '剪輯清單（停點 ①）'], ['work/rough.mp4', '初剪'],
  ['work/rough.srt', '字幕'], ['work/cutpoints.json', '剪接點'], ['work/screen-sync.json', '螢幕錄影同步'],
  ['work/rough-look.mp4', '瘦臉底片'], ['work/構圖預覽.jpg', '構圖分析（停點 ②）'], ['work/hyperframes/plan.json', 'plan.json'],
  ['work/storyboard.md', '分鏡表（停點 ③）'], ['work/hyperframes/index.html', 'build'],
  ['output/test-clips/test-clip.mp4', '測試片段'], ['output/final.mp4', '成片'], ['output/qc/qc-sheet.jpg', '驗收'],
];
const born = (st) => (st.birthtimeMs > 0 && st.birthtimeMs <= st.mtimeMs + 1000 ? st.birthtimeMs : st.mtimeMs);
const hm = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
const stamp = (ms) => { const d = new Date(ms), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
const parseStamp = (t) => { const m = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})/.exec(String(t || '').trim()); return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime() : null; };

export function projectTimeline(project) {
  const ev = [];
  const add = (rel, label) => { try { const st = fs.statSync(path.join(project, rel)); ev.push({ t: born(st), last: st.mtimeMs, what: rel, label, kind: 'file' }); } catch { /* 還沒有這個檔 */ } };
  for (const [rel, label] of TIMELINE_FILES) add(rel, label);
  // 情境動畫：每支 x-*.html 第一次出現
  try {
    const dir = path.join(project, 'work', 'hyperframes', 'compositions');
    for (const n of fs.readdirSync(dir).filter((x) => /^x-.*\.html$/.test(x))) add(`work/hyperframes/compositions/${n}`, '情境動畫');
  } catch { /* 沒有情境動畫 */ }
  // 停點紀錄
  const waits = [];
  try {
    const sl = readStopLog(fs.readFileSync(path.join(project, 'work', '製作進度.md'), 'utf8'));
    let open = new Map();
    for (const r of sl.rows) {
      const t = parseStamp(r.time);
      if (t == null) continue;
      ev.push({ t, last: t, what: r.label, label: r.state, kind: 'stop' });
      const o = open.get(r.stop);
      if (o != null && r.state !== '待回覆') { waits.push({ stop: r.label, ms: t - o }); open.delete(r.stop); }
      if (r.state === '待回覆') open.set(r.stop, t);
    }
    for (const [stop, t] of open) waits.push({ stop, ms: null, since: t });
  } catch { /* 沒有製作進度.md */ }
  ev.sort((a, b) => a.t - b.t || (a.kind === 'stop') - (b.kind === 'stop'));
  if (!ev.length) return { events: [], total: 0, wait: 0, work: 0, waits, longest: [] };
  const total = ev[ev.length - 1].t - ev[0].t, wait = waits.reduce((n, w) => n + (w.ms || 0), 0);
  const gaps = ev.slice(1).map((e, i) => ({ from: ev[i], to: e, ms: e.t - ev[i].t })).sort((a, b) => b.ms - a.ms).slice(0, 3);
  return { events: ev, total, wait, work: Math.max(0, total - wait), waits, longest: gaps };
}

function printTimeline(label, tl) {
  console.log(`專案：${label}`);
  if (!tl.events.length) { console.log('時間軸：還沒有任何產物'); return; }
  console.log('時間軸（產物第一次出現的時間；括號是最後修改；⏸ 是停點紀錄）');
  let prev = tl.events[0].t;
  for (const e of tl.events) {
    const d = `+${hm(e.t - prev)}`.padStart(6);
    console.log(e.kind === 'stop' ? `  ${stamp(e.t)} ${d}  ⏸ ${e.what}｜${e.label}` : `  ${stamp(e.t)} ${d}  ${e.what}  ${e.label}${e.last - e.t > 60000 ? `（最後修改 ${stamp(e.last)}）` : ''}`);
    prev = e.t;
  }
  console.log(`總時長 ${hm(tl.total)}；等使用者回覆 ${hm(tl.wait)}；AI 在做事 ${hm(tl.work)}（含等工具跑，例如轉檔、render）`);
  if (tl.waits.length) console.log(`停點等待：${tl.waits.map((w) => `${w.stop} ${w.ms == null ? '還在等' : hm(w.ms)}`).join('、')}`);
  console.log(`最久的幾段：${tl.longest.map((g) => `${g.from.kind === 'stop' ? g.from.what : g.from.what.replace(/^work\/(hyperframes\/)?/, '')} → ${g.to.kind === 'stop' ? g.to.what : g.to.what.replace(/^work\/(hyperframes\/)?/, '')} ${hm(g.ms)}`).join('、')}`);
}

export function projectStatus(project) {
  const P = (...p) => path.join(project, ...p);
  const W = (...p) => P('work', ...p);
  const ev = [];
  const has = (f) => !!stat(f);
  const newer = (a, b) => { const sa = stat(a), sb = stat(b); return !!(sa && sb && sa.mtimeMs - sb.mtimeMs > NEWER); };
  const rel = (f) => posix(path.relative(project, f));
  // 主軌素材：接過主軌就看 work/main.json；還沒接就數真人錄影、聲音檔，加上邊錄邊講的螢幕錄影（音軌有人聲）
  let mainJson = null;
  try { mainJson = JSON.parse(fs.readFileSync(W('main.json'), 'utf8')); } catch { mainJson = null; }
  const scrMain = !!mainJson?.clips?.some((c) => c.kind === 'screen');
  const mains = mainJson?.clips?.length || (files(P('assets', 'camera'), VIDEO_EXT).length + files(P('assets', 'voice'), AUDIO_EXT).length
    + files(P('assets', 'screen'), VIDEO_EXT).filter((f) => narrationOf(P('assets', 'screen', f)).narrated).length);
  const plan = W('hyperframes', 'plan.json'), index = W('hyperframes', 'index.html'), story = W('storyboard.md'), finalMp4 = P('output', 'final.mp4'), sheet = P('output', 'qc', 'qc-sheet.jpg');
  const workFiles = (() => { try { return fs.readdirSync(W()); } catch { return []; } })();
  // srt-align 跑過＝有 rough.srt.align-*；snap-srt 跑過＝有 rough.srt.bak-*（srt-split 的備份叫 rough.srt.split-*，不算；A-02）
  // F8：有 transcript.json 時 srt-align 已經是詞級時間，snap-srt 不用跑；只有沒有 transcript.json 才要 snap-srt
  const aligned = workFiles.some((f) => f.startsWith('rough.srt.align-'));
  const snapped = workFiles.some((f) => f.startsWith('rough.srt.bak-'));
  const words = has(W('transcript.json'));
  // build 前講者調光瘦臉好了沒：照 006 的 lookNextStep（look.mjs status／run 的最後兩行用同一個判斷，C-01）
  let lookTodo = null;
  if (has(W('rough.mp4'))) {
    try { const pl = has(plan) ? JSON.parse(fs.readFileSync(plan, 'utf8')) : {}; const ns = lookNextStep({ projectDir: project, plan: pl }); if (!ns.done) lookTodo = ns; } catch { /* plan.json 壞了：build 會報 */ }
  }

  const T = [
    ['S0', () => mains === 0, '開新專案（還沒有主軌素材）', '把口播放進 assets/camera/（有畫面）或 assets/voice/（只有聲音）；邊錄邊講的螢幕錄影放 assets/screen/ 也算；講稿存成 講稿.md', '無', 'assets/camera/ 與 assets/voice/ 都沒有檔，assets/screen/ 也沒有邊錄邊講的錄影'],
    ['S1', () => mains > 1 && !has(W('main.mp4')), '剪乾淨／接主軌', '列出主軌順序，和剪輯清單一起在停點 ① 確認後跑 media.mjs main', '① 剪輯清單', `主軌有 ${mains} 個檔、沒有 work/main.mp4`],
    ['S2', () => !has(W('cuts.md')), '剪乾淨／轉逐字稿、找 NG', '轉逐字稿（npx hyperframes transcribe … --model small --language zh），找 NG，寫 work/cuts.md', '① 剪輯清單', '沒有 work/cuts.md'],
    ['S3', () => !has(W('rough.mp4')), '剪乾淨／停點 ① 剪輯清單', '使用者確認剪輯清單後跑 media.mjs ng-snap，照它印的指令輸出 rough.mp4', '① 剪輯清單', '有 work/cuts.md、沒有 work/rough.mp4'],
    ['S4', () => !has(W('rough.srt')), '剪乾淨／字幕', '對 rough.mp4 轉逐字稿（--json --to srt：同時寫 work/transcript.json 與 work/rough.srt），再跑 media.mjs srt-align --dry-run', '② 構圖', '有 work/rough.mp4、沒有 work/rough.srt'],
    ['S5', () => !aligned && !has(plan), '剪乾淨／字幕斷句', '跑 media.mjs srt-align --dry-run 看斷句表，合理再去掉 --dry-run；之後只改錯字', '② 構圖', '沒有 work/rough.srt.align-*（srt-align 還沒跑）'],
    ['S6', () => !words && !snapped, '剪乾淨／字幕對齊', '跑 media.mjs snap-srt --dry-run，看表合理再去掉 --dry-run（只跑一次）', '② 構圖', '沒有 work/transcript.json（字幕時間是整句按字數估的）、也沒有 work/rough.srt.bak-*（snap-srt 還沒跑；srt-split 的備份叫 rough.srt.split-*，不算）'],
    ['S7', () => !has(W('cutpoints.json')), '剪乾淨／剪接點', '跑 media.mjs cutpoints', '② 構圖', '沒有 work/cutpoints.json'],
    ['S7s', () => scrMain && (!has(W('screen-sync.json')) || newer(W('cuts.v1.json'), W('screen-sync.json'))), '剪乾淨／螢幕錄影同步', '跑 media.mjs screen-sync（邊錄邊講的螢幕錄影：算出初剪後每段在錄影的秒數；寫好 plan.json 草稿後再加 --write-plan）', '② 構圖', has(W('screen-sync.json')) ? 'work/cuts.v1.json 比 work/screen-sync.json 新（初剪重做過）' : 'work/main.json 有邊錄邊講的螢幕錄影、還沒有 work/screen-sync.json'],
    ['S8', () => !has(W('構圖預覽.jpg')), '剪好看／構圖', '跑 qc.mjs framing（構圖分析），再開剪輯台（editor.mjs），把它印的「構圖台」網址給使用者拖框', '② 構圖', `沒有 work/構圖預覽.jpg${lookTodo ? `；講者調光瘦臉還沒好（look.mjs 的下一步：${lookTodo.step}）` : ''}`],
    ['S9', () => !has(story), '剪好看／停點 ② 構圖之後，寫分鏡表', '寫 work/storyboard.md（含每段截圖）', '③ 分鏡表', '沒有 work/storyboard.md'],
    ['S10', () => !has(plan) || (newer(story, plan) && !storyboardByVersions(project)), '剪好看／停點 ③ 分鏡表', '使用者確認後，重新讀 work/storyboard.md，以檔案為準寫正式 plan.json', '③ 分鏡表', has(plan) ? 'work/storyboard.md 比 work/hyperframes/plan.json 新' : '沒有 work/hyperframes/plan.json'],
    ['S11', () => !has(index) || newer(plan, index), '剪好看／build', '跑 build.mjs（有情境動畫先跑 audit.mjs），再 snapshot --review 抽查', '④ Studio 預覽', `${has(index) ? 'plan.json 比 index.html 新' : '沒有 work/hyperframes/index.html'}${lookTodo ? `；講者調光瘦臉還沒好（look.mjs 的下一步：${lookTodo.step}）` : ''}`],
    ['S12', () => !has(finalMp4), '剪好看／停點 ④ Studio 預覽', '開 Studio 給使用者看；使用者說可以後先輸出測試片段，再輸出 output/final.mp4', '④ Studio 預覽', '沒有 output/final.mp4'],
    ['S13', () => !has(sheet) || newer(finalMp4, sheet), '交付／驗收', '跑 qc.mjs final，把輸出和 qc-sheet.jpg 給使用者', '無', has(sheet) ? 'final.mp4 比 qc-sheet.jpg 新' : '沒有 output/qc/qc-sheet.jpg'],
    ['S14', () => true, '完成', '等使用者的修改要求（改了就從 build 重跑）', '無', '成片與驗收截圖都在'],
  ];
  const hit = T.find(([, cond]) => cond());
  let [stage, , at, next, nextStop, why] = hit;
  ev.push(why);
  // 構圖預覽（S8）與 build（S11）前，講者調光瘦臉還沒好 → 下一步直接用 lookNextStep 的說明＋指令（指令單獨一行，C-01）
  let cmd = null;
  if (lookTodo && ['S8', 'S11'].includes(stage)) { next = lookTodo.note; cmd = lookTodo.cmd; }
  // 改版（停點 ④ 之後）：work/versions/<段>/v<N>/ 只有提案 分鏡.md、還沒存進做好的檔
  const revs = ['S11', 'S12', 'S13', 'S14'].includes(stage) ? pendingRevisions(project) : [];
  if (revs.length) {
    const names = revs.map((r) => `${r.id} v${r.v}`).join('、'), ids = revs.map((r) => r.id).join(',');
    const done = revs.every((r) => r.state === '已確認');
    at = `改版／${names}（${done ? '分鏡已確認，還沒做完' : '分鏡還沒給使用者確認'}）`;
    next = done ? `照 auto-edit-motion 做 ${names.replace(/ v\d+/g, '')}，build、audit --only 都 0 個 ✖ 之後跑 versions.mjs save --seg ${ids}，再開 Studio`
      : `寫好 work/versions/<段>/v<N>/分鏡.md 的「這版要改什麼」和「## 分鏡」，停在停點 ③（${names}）`;
    nextStop = done ? '④ Studio 預覽' : '③ 分鏡表';
    ev.push(`work/versions/ 有沒做完的改版：${revs.map((r) => `${r.id}/v${r.v}（${r.state}）`).join('、')}`);
  }
  // 停點紀錄
  const logFile = W('製作進度.md');
  let waiting = [];
  if (has(logFile)) {
    const sl = readStopLog(fs.readFileSync(logFile, 'utf8'));
    if (sl.bad) ev.push('work/製作進度.md 停點紀錄的表頭看不懂（要有 時間、停點、狀態），略過');
    waiting = [...sl.last.values()].filter((r) => r.state === '待回覆').map((r) => r.label);
    const w = [...sl.last.values()].filter((r) => r.state === '待回覆').sort((a, b) => b.line - a.line)[0];
    if (w) {
      const phase = ['① 剪輯清單'].includes(w.stop) ? '剪乾淨' : ['⑥ 背景預覽'].includes(w.stop) ? '換風格' : ['⑤ 剪輯台'].includes(w.stop) ? '剪輯台' : '剪好看';
      at = `${phase}／停點 ${w.label}（待回覆）`;
      nextStop = w.stop;
      const rev = w.stop === '③ 分鏡表' ? [...w.label.matchAll(/([A-Za-z0-9-]+) v(\d+)/g)] : [];
      next = rev.length ? `等使用者看 ${rev.map((m) => `work/versions/${m[1]}/v${m[2]}/分鏡.md`).join('、')}；回覆「可以」後跑 versions.mjs accept --seg ${rev.map((m) => m[1]).join(',')}，再照 auto-edit-motion 做（要改就改那份 分鏡.md 再停一次）` : {
        '① 剪輯清單': '等使用者在剪輯清單頁（editor.mjs 印的「剪輯清單：」網址）勾好後回覆；回覆後先重新讀 cuts.md（只剪「剪」欄是 [x] 的列），跑 media.mjs ng-snap，照它印的指令剪',
        '② 構圖': '等使用者在構圖台拖好框按「儲存」（剪輯台直接寫進 plan.json 的 frame）後說「調好了」；說「用建議的」就把 qc.mjs framing 表上 ✔ 那一列的 frame 寫進 plan.json（1.0 倍不寫）。之後跑 qc.mjs speaker 量講者框',
        '③ 分鏡表': '等使用者回覆分鏡表；回覆「可以」或「改好了」後，先重新讀 work/storyboard.md，以檔案為準寫正式 plan.json',
        '④ Studio 預覽': '等使用者看 Studio；要改就改 plan.json 那一段再 build，說可以就輸出測試片段與成片',
        '⑤ 剪輯台': '等使用者在剪輯台調完說「調好了」；之後重新讀 plan.json 與 rough.srt 再 build',
        '⑥ 背景預覽': '等使用者看三張背景圖；說可以才複製進 shared/template/',
      }[w.stop];
      ev.unshift(`work/製作進度.md 停點紀錄最後一列「${w.time}｜${w.label}｜${w.state}」`);
    }
  }
  let fb = 0;
  for (const f of (() => { try { return fs.readdirSync(W('feedback')); } catch { return []; } })()) { const m = f.match(/^r(\d+)\.md$/); if (m) fb = Math.max(fb, Number(m[1])); }
  return { project, stage, at, next, cmd, nextStop, waiting, feedback: `r${fb + 1}`, evidence: ev };
}

function cli() {
  const argv = process.argv.slice(2);
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help') flags.help = true;
    else if (a === '--json') flags.json = true;
    else if (a === '--timeline') flags.timeline = true;
    else if (a === '--project') flags.project = argv[++i];
    else if (a.startsWith('--project=')) flags.project = a.slice(10);
    else throw new Error(`沒有 ${a} 這個參數（用 --help 看用法）`);
  }
  if (flags.help) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*\n?/, '').replace(/^ \* ?/gm, '')); return 0; }
  const root = path.resolve(HERE, '..', '..', '..');
  const project = findProject(flags, root);
  const label = posix(path.relative(process.cwd(), project)) || '.';
  if (flags.timeline) {
    const tl = projectTimeline(project);
    if (flags.json) console.log(JSON.stringify({ project: label, ...tl, events: tl.events.map((e) => ({ ...e, at: stamp(e.t) })) }, null, 2));
    else printTimeline(label, tl);
    return 0;
  }
  const s = projectStatus(project);
  let plan = null;
  try { plan = JSON.parse(fs.readFileSync(path.join(project, 'work', 'hyperframes', 'plan.json'), 'utf8')); } catch { plan = null; }
  const fmt = resolveFormat({ projectDir: project, plan });
  const sp = readSpeaker(path.join(root, 'shared', 'template'));
  if (flags.json) { console.log(JSON.stringify({ ...s, project: label, format: fmt.format, formatSource: fmt.source, speaker: sp.state }, null, 2)); return 0; }
  const spLine = sp.state === 'unset' ? `講者：⚠ 還沒設定（14 講者介紹會用示範人物林大寶）→ 跟使用者要姓名與頭銜後跑 ${SET_CMD}；不放講者介紹跑 node shared/template/tools/brand.mjs speaker off`
    : sp.state === 'bad' ? `講者：⚠ shared/講者.json ${sp.error} → ${SET_CMD}` : null;
  for (const l of [formatLine(fmt), `專案：${label}`, `目前在：${s.at}`, `下一步：${s.next}`, ...(s.cmd ? [s.cmd] : []), `下一個停點：${s.nextStop}`, `待回覆停點：${s.waiting.length ? s.waiting.join('、') : '無'}`, `下一輪回饋編號：${s.feedback}`, `依據：${s.evidence.join('；')}`, ...(spLine ? [spLine] : [])]) console.log(l);
  return 0;
}

const isMain = () => { try { return !!process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } };
if (isMain()) { try { process.exitCode = cli(); } catch (e) { console.error(`✖ ${e.message}`); process.exitCode = 1; } }
