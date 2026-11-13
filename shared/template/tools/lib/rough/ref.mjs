// ref（拆參考片：抽格總表＋換鏡頭表）
// 032 C9：從 media.mjs 搬過來（只搬移，輸出不變）；media.mjs 照舊匯出原本那些名稱
import path from 'node:path';
import fs from 'node:fs';
import { run, probeMedia } from '../ff.mjs';
import { limiter } from '../proc.mjs';
import { next } from '../say.mjs';
import { r3, fmtT, rel } from './util.mjs';
import { makeSheets } from './scan.mjs';

// ---------- ref（拆參考片：抽格總表＋換鏡頭表） ----------
export const REF = { maxCells: 96, minEvery: 1, scene: 0.3, minShot: 0.4 };
// 換鏡頭的時間點：ffmpeg 的 scene 分數 > REF.scene；相隔不到 REF.minShot 秒的併成一個（閃白、快切的過渡格）
export function sceneCuts(file) {
  const r = run('ffmpeg', ['-v', 'info', '-i', file, '-an', '-vf', `scale=320:-2,select='gt(scene,${REF.scene})',showinfo`, '-f', 'null', '-']);
  const out = [];
  for (const m of String(r.stderr).matchAll(/pts_time:([\d.]+)/g)) { const t = Number(m[1]); if (!out.length || t - out[out.length - 1] >= REF.minShot) out.push(r3(t)); }
  return out;
}
// 節奏：鏡頭數、平均鏡頭長度、每 10 秒換幾次鏡頭（給「節奏」那一層看哪裡快、哪裡慢）
export function refRhythm(dur, cuts) {
  const shots = cuts.length + 1, per10 = [];
  for (let a = 0; a < dur; a += 10) per10.push({ from: a, n: cuts.filter((t) => t >= a && t < a + 10).length });
  return { shots, avg: r3(dur / shots), per10 };
}
export async function refSheets(P, { file, name = null, every = null, log = console.log } = {}) {
  if (!file) throw new Error('要給參考影片：--file <路徑>（放在哪裡都可以，只會讀它）');
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) throw new Error(`找不到參考影片 ${file} → 確認路徑；路徑有空白要加引號`);
  const info = probeMedia(abs);
  if (!info.width || !info.height || !(info.duration > 0)) throw new Error(`${path.basename(abs)} 讀不到畫面或長度 → 確認它是影片檔`);
  const slug = String(name || path.basename(abs, path.extname(abs))).replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 40) || 'ref';
  const outDir = path.join(P.project, 'work', 'reference', slug);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const dur = info.duration, cuts = sceneCuts(abs).filter((t) => t > 0.2 && t < dur - 0.2);
  const step = every ? Math.max(0.2, Number(every)) : Math.max(REF.minEvery, Math.ceil((dur / REF.maxCells) * 2) / 2);
  if (!(step > 0)) throw new Error(`--every 要是秒數（例 --every 2），現在是「${every}」`);
  const cells = [];
  for (let t = 0; t < dur - 0.05; t += step) cells.push({ t: r3(t), scene: false });
  // 換鏡頭後 0.15 秒那一格（畫面穩定了）；離固定間隔的格子不到 0.4 秒就把那一格標成換鏡頭，不另外抽
  for (const c of cuts) { const t = Math.min(dur - 0.05, c + 0.15), near = cells.find((x) => Math.abs(x.t - t) < 0.4); if (near) near.scene = true; else cells.push({ t: r3(t), scene: true }); }
  cells.sort((a, b) => a.t - b.t);
  cells.forEach((c, i) => { c.n = i + 1; c.label = fmtT(c.t); });
  const sheets = await makeSheets(abs, info, cells, outDir, limiter());
  const rh = refRhythm(dur, cuts);
  const md = [`# 參考片：${path.basename(abs)}`, '', `- 長度 ${fmtT(dur)}（${r3(dur)} 秒）、畫面 ${info.width}×${info.height}（${info.width >= info.height ? '橫式' : '直式'}）、${info.fps ?? '?'}fps`,
    `- 鏡頭 ${rh.shots} 個、平均一個鏡頭 ${rh.avg.toFixed(1)} 秒（換鏡頭 ${cuts.length} 次；全片程式產生的動畫片換鏡頭少，看縮圖判斷段落）`,
    `- 縮圖總表 ${sheets.length} 張、共 ${cells.length} 格（每 ${step} 秒一格；右上角有黃色方塊＝換鏡頭後那一格）`, '',
    '## 縮圖總表', '', '| 檔案 | 時間 |', '|---|---|', ...sheets.map((x) => `| ${path.basename(x.file)} | ${x.cells[0].label}–${x.cells[x.cells.length - 1].label} |`), '',
    '## 節奏（每 10 秒換幾次鏡頭）', '', '| 區間 | 換鏡頭 |', '|---|---|', ...rh.per10.map((x) => `| ${fmtT(x.from)}–${fmtT(Math.min(dur, x.from + 10))} | ${x.n} |`), '',
    '## 換鏡頭的時間點', '', cuts.length ? cuts.map((t) => fmtT(t)).join('、') : '（沒有偵測到）', ''];
  fs.writeFileSync(path.join(outDir, 'index.md'), md.join('\n'));
  log(`✓ 參考片 ${path.basename(abs)}：${fmtT(dur)}、${info.width}×${info.height}、鏡頭 ${rh.shots} 個（平均 ${rh.avg.toFixed(1)} 秒）`);
  log(`→ ${rel(path.join(outDir, 'index.md'))}、縮圖總表 ${sheets.length} 張（${sheets.map((x) => path.basename(x.file)).join('、')}）`);
  for (const l of next('照 .agents/skills/auto-edit-style/references/reference-video.md 一張一張看縮圖總表，寫九個維度的分析')) log(l);
  return { dir: outDir, sheets, cells, cuts, rhythm: rh, info };
}
