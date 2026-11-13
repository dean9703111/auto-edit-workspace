// cut-check（剪接點有沒有把字切一半）與 cutpoints（cuts.v1.json → work/cutpoints.json）
// 032 C9：從 media.mjs 搬過來（只搬移，輸出不變）；media.mjs 照舊匯出原本那些名稱
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parseSrt } from '../srt.mjs';
import { probeMedia } from '../ff.mjs';
import { r3, fmtC, posix, backupPath } from './util.mjs';
import { CUT, readV1, parseCutsMd } from './cuts.mjs';

// ---------- cut-check（剪接點有沒有把字切一半） ----------
export const CUTCHECK = { win: 0.06, rate: 8000, below: 12 };   // 兩側各聽 0.06 秒；比「講話的音量」低 12 dB 以上算安靜
// pcm＝Int16Array（單聲道、rate Hz）；cuts＝剪接點秒數。講話的音量＝全片每 0.06 秒一格 RMS 的第 80 百分位
export function cutCheckRows(pcm, cuts, { rate = CUTCHECK.rate, win = CUTCHECK.win, below = CUTCHECK.below } = {}) {
  const n = Math.max(1, Math.round(win * rate));
  const rms = (a, b) => { a = Math.max(0, a); b = Math.min(pcm.length, b); if (b <= a) return 0; let s = 0; for (let i = a; i < b; i++) s += pcm[i] * pcm[i]; return Math.sqrt(s / (b - a)); };
  const db = (v) => (v > 0 ? 20 * Math.log10(v / 32768) : -120);
  const frames = [];
  for (let i = 0; i + n <= pcm.length; i += n) frames.push(rms(i, i + n));
  frames.sort((x, y) => x - y);
  const speech = db(frames[Math.floor(frames.length * 0.8)] || 0), quiet = speech - below;
  return { speech: r3(speech), rows: cuts.map((t) => { const k = Math.round(t * rate), L = db(rms(k - n, k)), R = db(rms(k, k + n)); return { at: r3(t), left: Math.round(L), right: Math.round(R), mid: L > quiet && R > quiet }; }) };
}
export function cutCheck(P, { log = console.log } = {}) {
  const work = path.join(P.project, 'work'), rough = path.join(work, 'rough.mp4');
  if (!fs.existsSync(rough)) throw new Error('找不到 work/rough.mp4 → 先「剪乾淨」');
  let cuts = [];
  try { cuts = (JSON.parse(fs.readFileSync(path.join(work, 'cutpoints.json'), 'utf8')).cuts || []).map((c) => Number(c.at)).filter(Number.isFinite); } catch { throw new Error('找不到 work/cutpoints.json → 先跑 node shared/template/tools/media.mjs cutpoints --project <專案>'); }
  if (!cuts.length) { log('✓ 沒有剪接點，不用檢查'); return { ok: true, rows: [] }; }
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', rough, '-vn', '-ac', '1', '-ar', String(CUTCHECK.rate), '-f', 's16le', 'pipe:1'], { maxBuffer: 1 << 30 });
  if (r.status !== 0 || !r.stdout?.length) throw new Error(`讀不到 work/rough.mp4 的聲音：${String(r.stderr).trim().slice(-200)}`);
  const pcm = new Int16Array(r.stdout.buffer, r.stdout.byteOffset, Math.floor(r.stdout.length / 2));
  const res = cutCheckRows(pcm, cuts);
  let cues = [];
  try { cues = parseSrt(fs.readFileSync(path.join(work, 'rough.srt'), 'utf8')); } catch { cues = []; }
  const bad = res.rows.filter((x) => x.mid);
  for (const x of bad) { const c = cues.find((q) => x.at >= q.start - 0.05 && x.at <= q.end + 0.05); log(`⚠ 剪接點 ${fmtC(x.at)} 兩邊都還在講話（左 ${x.left} dB、右 ${x.right} dB，講話約 ${Math.round(res.speech)} dB）${c ? `：#${c.n}「${String(c.text).slice(0, 18)}」` : ''} → 到剪輯台聽這一句，字被切到就把 work/cuts.md 那一列的起點或終點挪 0.1–0.2 秒再重剪`); }
  log(bad.length ? `剪接點 ${cuts.length} 個，${bad.length} 個可能切到字（上面 ⚠）；其他正常` : `✓ 剪接點 ${cuts.length} 個都落在安靜的地方`);
  return { ok: !bad.length, rows: res.rows, bad };
}

// ---------- 剪乾淨第 7 步：cuts.v1.json → work/cutpoints.json ----------
export function cutpointsFromV1(v1, fps, ngRanges = []) {
  const cuts = [], errors = [];
  let kept = 0, run = null, seenKeep = false;
  v1.chunks.forEach(([s, e, sp], i) => {
    if (sp >= 99999) { run = run ? [run[0], e] : [s, e]; return; }
    if (Math.abs(sp - 1) > 1e-9) { errors.push(`cuts.v1.json 第 ${i + 1} 段速度是 ${sp}（只能是 1 或 99999）→ 剪乾淨不要用變速，照 ng-snap 印的指令重剪`); return; }
    if (run && seenKeep) {
      const a = run[0] / fps, b = run[1] / fps;
      const ng = ngRanges.find((r) => { const ov = Math.min(b, r.end) - Math.max(a, r.start); return ov > 1e-6 && ov >= Math.min(CUT.ngKind, (r.end - r.start) * 0.5) - 1e-6; });
      cuts.push({ at: r3(kept / fps), kind: ng ? 'ng' : 'pause', src: [r3(a), r3(b)], ngRow: ng?.row ?? null });
    }
    run = null; seenKeep = true; kept += e - s;
  });
  return { cuts, keptFrames: kept, keptSec: r3(kept / fps), errors };
}

export function cutpoints(P, { dryRun = false, log = console.log, now = new Date() } = {}) {
  const work = path.join(P.project, 'work');
  const v1File = [path.join(work, 'cuts.v1.json'), path.join(work, 'cuts.v1')].find((f) => fs.existsSync(f));
  if (!v1File) throw new Error('找不到 work/cuts.v1.json（也沒有 work/cuts.v1）→ 用初剪同樣的參數再跑一次 auto-editor，結尾改 --export v1 -o work/cuts.v1.json（ng-snap 印的第 3 行）');
  const v1 = readV1(v1File);
  const rough = path.join(work, 'rough.mp4');
  if (!fs.existsSync(rough)) throw new Error('找不到 work/rough.mp4 → 先照 ng-snap 印的第 2 行輸出初剪');
  const info = probeMedia(rough);
  const fps = info.fps || 30;
  const cutsFile = path.join(work, 'cuts.md');
  const cm = fs.existsSync(cutsFile) ? parseCutsMd(fs.readFileSync(cutsFile, 'utf8')) : null;
  const ng = cm ? cm.ng.filter((r) => r.cut) : [];
  const res = cutpointsFromV1(v1, fps, ng);
  if (res.errors.length) throw new Error(res.errors[0]);
  log(`讀 ${posix(path.relative(P.project, v1File))}（${v1.chunks.length} 段）；fps ${fps}（work/rough.mp4）；${cm?.hasNg ? `NG 範圍讀 work/cuts.md（${cm.ng.length} 列）` : 'work/cuts.md 沒有 NG 表'}`);
  log('  #   rough.mp4   種類    原片剪掉的範圍');
  res.cuts.forEach((c, i) => log(`  ${String(i + 1).padEnd(3)} ${fmtC(c.at).padEnd(11)} ${c.kind.padEnd(7)} ${fmtC(c.src[0])}–${fmtC(c.src[1])}（${(c.src[1] - c.src[0]).toFixed(2)}s${c.ngRow ? `，NG 第 ${c.ngRow} 列` : ''}）`));
  const nNg = res.cuts.filter((c) => c.kind === 'ng').length;
  const dur = info.duration ?? 0;
  const diff = Math.round(Math.abs(res.keptSec - dur) * fps);
  log(`共 ${res.cuts.length} 個剪接點：NG ${nNg}、停頓 ${res.cuts.length - nNg}；保留 ${res.keptSec.toFixed(2)}s（${res.keptFrames} 格），rough.mp4 ${dur.toFixed(2)}s（差 ${diff} 格）`);
  const warnings = [];
  if (diff > 2) warnings.push(`⚠ cuts.v1.json 保留的長度 ${res.keptSec.toFixed(2)}s 和 rough.mp4 的 ${dur.toFixed(2)}s 差 ${diff} 格 → cuts.v1.json 可能不是這支 rough.mp4 的參數產生的；用剪乾淨第 5 步完全相同的參數重跑 --export v1`);
  if (!cm?.hasNg) warnings.push('⚠ 沒有 work/cuts.md 的 NG 表，剪接點全部標 pause → 沒有 NG 就不用管；有 NG 就照停點 ① 的格式補 NG 表再跑一次');
  for (const w of warnings) log(w);
  const outFile = path.join(work, 'cutpoints.json');
  const json = JSON.stringify({ cuts: res.cuts.map(({ at, kind }) => ({ at, kind })) }, null, 2) + '\n';
  let backup = null, written = false;
  if (dryRun) log('--dry-run：只印不寫，work/cutpoints.json 沒有動。');
  else if (fs.existsSync(outFile) && fs.readFileSync(outFile, 'utf8') === json) log('work/cutpoints.json 內容相同，沒有寫。');
  else {
    if (fs.existsSync(outFile)) { backup = backupPath(outFile, now); fs.copyFileSync(outFile, backup); }
    fs.writeFileSync(outFile, json);
    written = true;
    log(`已寫 work/cutpoints.json（剪輯台與 build 的剪接點微淡化會讀它）${backup ? `；舊檔備份在 ${posix(path.relative(P.project, backup))}` : ''}`);
  }
  return { ...res, warnings, written, backup, file: outFile };
}
