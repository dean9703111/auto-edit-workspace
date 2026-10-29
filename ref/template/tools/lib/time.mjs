// 時間語法與換算（plan.json 的 from／to／at／beats）
//
//   #N        cue N 起點                 from／to／at／beats
//   #Ne       cue N 結尾                 同上
//   #N+0.3    cue N 起點再加 0.3 秒（也可 #Ne-0.2）
//   12.5      絕對秒數                   只能用在 from／to
//   +1.2      本段起點後 1.2 秒          只能用在 at／beats
//
//   parseTime(v)              → { kind:'cue', n, end, off } | { kind:'abs', sec } | { kind:'rel', off } | { error }
//   cueSeconds(t, cues)       → { sec } | { error }（kind 必須是 cue）
//   r3(x)                     → 四捨五入到毫秒
//   floorFrame(x, fps)        → 往下對齊到 1/fps 秒

import { cueByN } from './srt.mjs';

export const FPS = 30;
export const r3 = (n) => +Number(n).toFixed(3);
export const floorFrame = (t, fps = FPS) => r3(Math.floor(t * fps + 1e-6) / fps);

export const TIME_HELP = '時間寫法：#12（第 12 句開頭）、#12e（第 12 句結尾）、#12+0.3、+1.2（本段起點後 1.2 秒，只用在 at／beats）、12.5（秒數，只用在 from／to）';

export function parseTime(v) {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? { kind: 'abs', sec: v, raw: String(v) } : { error: `時間「${v}」不是有效秒數` };
  if (typeof v !== 'string') return { error: `時間要寫成字串或數字，現在是 ${JSON.stringify(v)}。${TIME_HELP}` };
  const s = v.trim();
  let m;
  if ((m = s.match(/^#(\d+)(e?)\s*(?:([+-])\s*(\d+(?:\.\d+)?))?$/))) {
    return { kind: 'cue', n: Number(m[1]), end: m[2] === 'e', off: m[3] ? (m[3] === '-' ? -1 : 1) * Number(m[4]) : 0, raw: s };
  }
  if ((m = s.match(/^\+\s*(\d+(?:\.\d+)?)$/))) return { kind: 'rel', off: Number(m[1]), raw: s };
  if ((m = s.match(/^\d+(?:\.\d+)?$/))) return { kind: 'abs', sec: Number(s), raw: s };
  return { error: `看不懂的時間「${s}」。${TIME_HELP}` };
}

export function cueSeconds(t, cues) {
  const c = cueByN(cues, t.n);
  if (!c) {
    const last = cues.length ? cues[cues.length - 1].n : 0;
    return { error: `字幕沒有第 ${t.n} 句（rough.srt 共 ${cues.length} 句，句號 1–${last}）` };
  }
  return { sec: r3((t.end ? c.end : c.start) + t.off) };
}
