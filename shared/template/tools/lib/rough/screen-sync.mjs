// 邊錄邊講的螢幕錄影：初剪後把錄影畫面蓋回主軌（screen-sync）
// 032 C9：從 media.mjs 搬過來（只搬移，輸出不變）；media.mjs 照舊匯出原本那些名稱
import path from 'node:path';
import fs from 'node:fs';
import { waitsInMain } from '../events.mjs';
import { probeMedia } from '../ff.mjs';
import { writeAtomic } from '../atomic.mjs';
import { markStep } from '../progress.mjs';
import { waitKeep, parseCutsMd, readV1 } from './cuts.mjs';
import { r3, posixRel, posix, fmtC, backupPath } from './util.mjs';

// ---------- 邊錄邊講的螢幕錄影：初剪後把錄影畫面蓋回主軌（screen-sync）----------
// cuts.v1.json 每個保留段 ∩ main.json 的 screen 段 → rough.mp4 的起訖＋錄影本身的秒數（in）；前後相接、錄影也連續的併成一段
// waits：勾了的等待（main.mp4 的秒數 [起, 迄]）：留下來的 waitKeep 秒放一段快轉（retime），從等待開始一路快轉到等待結束，前後都接得上
export function screenSegments(clips, v1, fps, waits = []) {
  const scr = clips.filter((c) => c.kind === 'screen');
  const out = [];
  let acc = 0;
  for (const [s, e, sp] of v1.chunks) {
    if (sp >= 99999) continue;
    const a = s / fps, b = e / fps;
    for (const c of scr) {
      const x = Math.max(a, c.start), y = Math.min(b, c.end);
      if (y - x <= 1e-6) continue;
      const from = acc + (x - a), to = from + (y - x), inn = x - c.start + (c.src ? c.src[0] : 0);
      const l = out[out.length - 1];
      if (l && l.src === c.file && Math.abs(l.to - from) < 1e-6 && Math.abs(l.in + (l.to - l.from) - inn) < 1e-3) { l.to = to; l.mainTo = y; }
      else out.push({ src: c.file, from, to, in: inn, mainFrom: x, mainTo: y });
    }
    acc += b - a;
  }
  const segs = [];
  out.forEach((x, i) => {
    const nx = out[i + 1];
    const w = nx && nx.src === x.src ? waits.find(([a, b]) => Math.abs(x.mainTo - Math.min(b, a + waitKeep(b - a))) < 0.25 && Math.abs(nx.mainFrom - b) < 0.25) : null;
    if (w && x.to - x.from > 0.2) {
      const keep = Math.min(waitKeep(w[1] - w[0]), x.to - x.from), mid = x.to - keep;
      if (mid - x.from > 0.05) segs.push({ src: x.src, from: x.from, to: mid, in: x.in });
      segs.push({ src: x.src, from: Math.max(mid, x.from), to: x.to, retime: [{ at: '+0', src: r3(x.in + (x.to - x.from) - keep) }, { at: `+${r3(keep)}`, src: r3(nx.in) }] });
    } else segs.push({ src: x.src, from: x.from, to: x.to, in: x.in });
  });
  return segs.map((x, i) => ({ id: `sync${String(i + 1).padStart(2, '0')}`, type: 'media', src: x.src, from: r3(x.from), to: r3(x.to), ...(x.retime ? { retime: x.retime } : { in: r3(x.in) }) }));
}

// cuts.md 「等待」表：邊錄邊講的主軌裡，畫面在等（events.json）又沒人講話的區間（預設不勾）。words：main.mp4 的詞
export function waitRows(P, clips, words) {
  const eventsOf = (file) => {
    const stem = path.basename(file, path.extname(file));
    for (const d of [stem, path.basename(file)]) { try { return JSON.parse(fs.readFileSync(path.join(P.project, 'work', 'media', d, 'events.json'), 'utf8')); } catch { /* 換下一個 */ } }
    return null;
  };
  return waitsInMain(clips, words, eventsOf);
}

export const SYNC_ID = /^sync\d+$/;

export function screenSync(P, { writePlan = false, dryRun = false, log = console.log, now = new Date() } = {}) {
  const work = path.join(P.project, 'work'), pj = posixRel(P.project);
  let clips = [];
  try { clips = JSON.parse(fs.readFileSync(path.join(work, 'main.json'), 'utf8')).clips || []; } catch { throw new Error(`找不到 work/main.json → 先跑 node shared/template/tools/media.mjs main --project ${pj}`); }
  if (!clips.some((c) => c.kind === 'screen')) { log('work/main.json 沒有邊錄邊講的螢幕錄影（kind "screen"）→ 不用跑 screen-sync'); return { segments: [], written: false }; }
  const v1File = [path.join(work, 'cuts.v1.json'), path.join(work, 'cuts.v1')].find((f) => fs.existsSync(f));
  if (!v1File) throw new Error('找不到 work/cuts.v1.json → 先照 ng-snap 印的第 3 行存剪接點（--export v1 -o work/cuts.v1.json）');
  const rough = path.join(work, 'rough.mp4');
  if (!fs.existsSync(rough)) throw new Error('找不到 work/rough.mp4 → 先照 ng-snap 印的第 2 行輸出初剪');
  const fps = probeMedia(rough).fps || 30;
  const durOf = new Map();
  const segments = [];
  let waits = [];
  try { waits = parseCutsMd(fs.readFileSync(path.join(work, 'cuts.md'), 'utf8')).ng.filter((r) => r.wait && r.cut).map((r) => [r.start, r.end]); } catch { waits = []; }
  for (const seg of screenSegments(clips, readV1(v1File), fps, waits)) {
    if (seg.retime) { segments.push(seg); continue; }
    if (!durOf.has(seg.src)) durOf.set(seg.src, probeMedia(path.join(P.project, ...seg.src.split('/'))).duration ?? Infinity);
    const room = r3(durOf.get(seg.src) - seg.in);   // 主軌把錄影長度補到整格，最後一段可能多出不到一格
    if (room <= 0) continue;
    if (seg.to - seg.from > room) seg.to = r3(seg.from + room);
    segments.push(seg);
  }
  segments.forEach((s, i) => { s.id = `sync${String(i + 1).padStart(2, '0')}`; });
  log(`邊錄邊講的螢幕錄影：${segments.length} 段（${posix(path.relative(P.project, v1File))}、rough.mp4 ${fps}fps）`);
  log('  id      rough.mp4             錄影從    檔');
  for (const s of segments) log(`  ${s.id.padEnd(7)} ${`${fmtC(s.from)}–${fmtC(s.to)}`.padEnd(21)} ${(s.retime ? `快轉 ${fmtC(s.retime[0].src)}–${fmtC(s.retime[1].src)}` : fmtC(s.in)).padEnd(9)} ${s.src}`);
  if (dryRun) { log('--dry-run：只印不寫。'); return { segments, written: false }; }
  const outFile = path.join(work, 'screen-sync.json');
  fs.writeFileSync(outFile, JSON.stringify({ segments }, null, 2) + '\n');
  markStep(P.project, 'screen-sync');   // 032 C10：寫完 screen-sync.json 之後記一筆（記的是 cuts.v1.json：初剪重做就要重算）
  log(`已寫 work/screen-sync.json`);
  if (!writePlan) { log(`→ 寫好 plan.json 草稿後跑 node shared/template/tools/media.mjs screen-sync --project ${pj} --write-plan，把這幾段放進 plan.json`); return { segments, written: true, file: outFile }; }
  const planFile = path.join(work, 'hyperframes', 'plan.json');
  if (!fs.existsSync(planFile)) throw new Error('還沒有 work/hyperframes/plan.json → 先寫 plan.json 草稿，再加 --write-plan');
  const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
  const old = (plan.scenes || []).filter((x) => SYNC_ID.test(x.id || '')).length;
  plan.scenes = [...(plan.scenes || []).filter((x) => !SYNC_ID.test(x.id || '')), ...segments];
  const backup = backupPath(planFile, now, 'sync');
  fs.copyFileSync(planFile, backup);
  writeAtomic(planFile, JSON.stringify(plan, null, 2) + '\n');
  log(`已寫進 plan.json：${old ? `換掉舊的 ${old} 段、` : ''}放進 ${segments.length} 段（備份 ${posix(path.relative(P.project, backup))}）→ 跑 build --check`);
  return { segments, written: true, file: outFile, plan: planFile, backup };
}
