// snap-srt：字幕起點對齊實際開口
// 032 C9：從 media.mjs 搬過來（只搬移，輸出不變）；media.mjs 照舊匯出原本那些名稱
import path from 'node:path';
import fs from 'node:fs';
import { SPEECH, envelope, pickThreshold, speechFromEnvelope } from '../speech.mjs';
import { parseSrt } from '../srt.mjs';
import { probeMedia } from '../ff.mjs';
import { writeAtomic } from '../atomic.mjs';
import { markStep } from '../progress.mjs';
import { r3, rel } from './util.mjs';
import { clock2 } from '../time.mjs';

// ---------- snap-srt ----------

// 對齊參數（理由見檔頭 snap-srt 那一段和下面每一行；調整請連同 timing.test.mjs 一起看）
export const SNAP = {
  minSilence: SPEECH.minSilence,  // 短於這個的空檔算咬字間隙，不當成停頓（lib/speech.mjs，理由寫在那裡）
  minSpeech: SPEECH.minSpeech,    // 短於這個的聲響（喀嗒、呼吸）不算說話
  early: 0.6,        // 開口點最多比字幕起點早這麼多（字幕偏晚的情況少見）
  late: 1.5,         // 開口點最多比字幕起點晚這麼多（症狀是字幕比嘴巴早約 1 秒；實測偏 1.0 秒再加上起點本來就落在句首前 0.2 秒，會到 1.2 秒，1.2 剛好壓線所以放到 1.5）
  tolerance: 0.25,   // 差在這以內不動（講解本來就有 0.1–0.2 秒的前導氣聲，不要為了零頭亂動）
  tailSilence: 0.4,  // 結尾拖進靜音超過這個秒數才收
  tailPad: 0.15,     // 收尾時留在說話結束後面的秒數
  minDur: 0.6,       // 每則至少這麼長
  lead: 0.03,        // 開口點往前留一點（輕子音的能量低於門檻，會晚一點點才算開口）
};

// 能量包絡、門檻、說話區間（envelope、pickThreshold、speechFromEnvelope、ENV）搬到 lib/speech.mjs，build 的 #N@詞 對準開口也用同一套；這裡照舊匯出

// 純函式：cues ＋ 說話區間 → 新的 cues ＋ 調整表（測試直接餵合成資料）
//   cues：[{ n, start, end, text }]；speech：[[起, 迄], …]（照時間排序）
export function snapCues(cues, speech, opt = {}) {
  const o = { ...SNAP, ...opt };
  const onsets = speech.map(([a]) => a);
  const startOf = cues.map((c) => c.start);
  const prop = cues.map((c, i) => {
    // 起點已經落在某個開口點 tolerance 內 → 不動
    if (onsets.some((t) => Math.abs(t - c.start) <= o.tolerance)) return c.start;
    let best = null;
    for (const t of onsets) {
      const d = t - c.start;                      // 正＝開口比字幕晚（字幕偏早）
      if (d < -o.early || d > o.late) continue;
      if (best == null || Math.abs(d) < Math.abs(best - c.start)) best = t;
    }
    return best == null ? c.start : r3(Math.max(0, best - o.lead));
  });
  // 不重疊、每則至少 minDur、順序不變：動過的起點撞到鄰居就退回原值，直到沒有衝突
  for (let guard = 0; guard < cues.length + 2; guard++) {
    let bad = false;
    for (let i = 0; i + 1 < cues.length; i++) {
      if (prop[i + 1] - prop[i] >= o.minDur - 1e-6) continue;
      const mi = Math.abs(prop[i] - startOf[i]) > 1e-6, mj = Math.abs(prop[i + 1] - startOf[i + 1]) > 1e-6;
      if (mi) { prop[i] = startOf[i]; bad = true; } else if (mj) { prop[i + 1] = startOf[i + 1]; bad = true; }
    }
    if (!bad) break;
  }
  const speechEndBefore = (t) => {   // t 落在靜音裡時，前一段說話的結束點；t 在說話中回 null
    let prev = null;
    for (const [a, b] of speech) { if (t >= a && t <= b) return null; if (b <= t) prev = b; else break; }
    return prev;
  };
  const rows = cues.map((c, i) => {
    const next = cues[i + 1];
    const ns = prop[i];
    let ne = c.end;
    const adjacent = next && c.end >= next.start - 0.05;   // 原本就首尾相連：跟著下一則的新起點走，畫面上不會出現空檔
    if (adjacent) ne = prop[i + 1];
    else ne = Math.max(c.end, ns + o.minDur);
    // 結尾拖進靜音太久 → 收到說話結束＋tailPad（只收不延）
    const se = speechEndBefore(ne);
    if (se != null && se > ns && ne - se > o.tailSilence) ne = Math.min(ne, r3(se + o.tailPad));
    if (next) ne = Math.min(ne, prop[i + 1]);
    ne = r3(Math.max(ne, ns + o.minDur));
    if (next && ne > prop[i + 1] + 1e-6) ne = prop[i + 1];   // 極端：空檔不夠 minDur，寧可短也不重疊（前面的退回已盡量避免）
    return { n: c.n, text: c.text, start0: c.start, end0: c.end, start: r3(ns), end: r3(ne), dStart: r3(ns - c.start), dEnd: r3(ne - c.end) };
  });
  return { rows, cues: cues.map((c, i) => ({ ...c, start: rows[i].start, end: rows[i].end })), changed: rows.filter((r) => r.dStart !== 0 || r.dEnd !== 0) };
}

const stampSrt = (t) => {
  const ms = Math.round(t * 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};

// 只改時間行，文字、空行、換行風格、BOM 全部原樣保留
export function rewriteSrtTimes(text, rows) {
  const byN = new Map(rows.map((r) => [r.n, r]));
  const lines = String(text).split(/(\r?\n)/);   // 保留換行符
  let prevNum = null;
  for (let i = 0; i < lines.length; i += 2) {
    const ln = lines[i];
    const m = ln.match(/^(\s*)([\d:,.]+)(\s*-->\s*)([\d:,.]+)(.*)$/);
    if (m && prevNum != null && byN.has(prevNum)) {
      const r = byN.get(prevNum);
      lines[i] = `${m[1]}${stampSrt(r.start)}${m[3]}${stampSrt(r.end)}${m[5]}`;
      prevNum = null;
    } else if (/^\s*\d+\s*$/.test(ln.replace(/^﻿/, ''))) prevNum = Number(ln.replace(/^﻿/, '').trim());
  }
  return lines.join('');
}

export function snapSrt(P, { dryRun = false, below = null, log = console.log, now = new Date() } = {}) {
  const work = path.join(P.project, 'work');
  const srtFile = path.join(work, 'rough.srt'), mp4 = path.join(work, 'rough.mp4');
  if (!fs.existsSync(srtFile)) throw new Error(`找不到 ${rel(srtFile)} → 先跑 node shared/template/tools/media.mjs rough --project <專案> 產生 rough.srt`);
  if (!fs.existsSync(mp4)) throw new Error(`找不到 ${rel(mp4)} → 先剪出 work/rough.mp4（字幕的時間是對它的）`);
  if (below != null && !(Number(below) >= 5 && Number(below) <= 60)) throw new Error(`--below 要是 5–60 之間的 dB 數字（門檻＝說話音量減這個數字；不寫＝自動），現在是「${below}」`);
  const text = fs.readFileSync(srtFile, 'utf8');
  const cues = parseSrt(text);
  if (!cues.length) throw new Error(`${rel(srtFile)} 讀不到任何字幕 → 跑 media.mjs rough --again 重新產生 rough.srt（格式：序號、00:00:01,000 --> 00:00:02,500、文字，中間空一行）`);
  const info = probeMedia(mp4);
  if (!info.hasAudio) throw new Error(`${rel(mp4)} 沒有聲音軌，沒辦法找開口時間`);
  const env = envelope(mp4);
  const th = pickThreshold(env.db, below == null ? null : Number(below));
  const speech = speechFromEnvelope(env, th.threshold);
  if (!speech.length) throw new Error(`用門檻 ${th.threshold} dB 找不到任何說話區間 → 試 --below 30（門檻放低）`);
  const res = snapCues(cues, speech, {});
  const T = clock2;
  log(`說話音量 ${r3(th.level)} dB、底噪 ${r3(th.floor)} dB → 開口門檻 ${th.threshold} dB${below == null ? '（相對這支音軌自動算）' : `（說話音量 −${below} dB，手動）`}；說話區間 ${speech.length} 段`);
  let backup = null;
  if (res.changed.length) {
    log('', '  則   起點（原 → 新）          差       結尾（原 → 新）          差');
    for (const r of res.changed) {
      const sg = (d) => (d === 0 ? '   —' : `${d > 0 ? '+' : '-'}${Math.abs(d).toFixed(2)}`);
      log(`  #${String(r.n).padEnd(3)} ${T(r.start0)} → ${T(r.start)}   ${sg(r.dStart).padStart(6)}    ${T(r.end0)} → ${T(r.end)}   ${sg(r.dEnd).padStart(6)}   ${r.text.slice(0, 14)}`);
    }
  }
  const moved = res.changed.filter((r) => r.dStart !== 0);
  const trimmed = res.changed.filter((r) => r.dEnd !== 0);
  log(`\n共 ${cues.length} 則：起點調整 ${moved.length} 則、結尾調整 ${trimmed.length} 則、不動 ${cues.length - res.changed.length} 則`);
  if (!res.changed.length) {
    log('字幕和開口時間都對得上，沒有寫任何檔。');
    if (!dryRun) markStep(P.project, 'snap-srt');   // 對過了（沒有要調的）也算跑過：不記的話 status 會一直叫人再跑
    return { ...res, backup, written: false, threshold: th.threshold, speech };
  }
  if (dryRun) { log('--dry-run：只印不寫，rough.srt 沒有動。'); return { ...res, backup, written: false, threshold: th.threshold, speech }; }
  const p2 = (n) => String(n).padStart(2, '0');
  const ts = `${now.getFullYear()}${p2(now.getMonth() + 1)}${p2(now.getDate())}-${p2(now.getHours())}${p2(now.getMinutes())}${p2(now.getSeconds())}`;
  backup = path.join(work, `rough.srt.bak-${ts}`);
  for (let k = 2; fs.existsSync(backup); k++) backup = path.join(work, `rough.srt.bak-${ts}-${k}`);
  fs.copyFileSync(srtFile, backup);
  writeAtomic(srtFile, rewriteSrtTimes(text, res.rows));
  markStep(P.project, 'snap-srt');   // 032 C10：寫回 rough.srt 之後記一筆，status 照它判斷
  log(`已寫回 ${rel(srtFile)}；原檔備份在 ${rel(backup)}（要還原就把它複製回 rough.srt）`);
  log('→ 重跑 build 前先到剪輯台看一眼；之後不要再跑 snap-srt（會蓋掉你在剪輯台改的時間）。');
  return { ...res, backup, written: true, threshold: th.threshold, speech };
}
