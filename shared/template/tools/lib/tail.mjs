// 片尾（049 → 052 作者 2026-11-15：「應該結束後聲音跟畫面在一秒慢慢消失，而非畫面定格」）：
//   講完之後接 dur 秒的原始錄影（初剪剪掉的那一段的開頭：講者還在動、最後一個字的尾音自然收掉），主合成讓畫面和聲音一起在 dur 秒內淡出。
//   原始錄影接不上（沒有 work/cuts.v1.json、work/main.mp4，剪掉的不夠長，講者有瘦臉底片）才退回 049：把畫面上最後一格凍結成 dur 秒（沒有聲音）。
// 和底片同一套處理：構圖裁切、縮放、調光 LUT、30fps、H.264 yuv420p；聲音照底片的響度增益。同樣的輸入不重做；舊指紋的檔清掉。
//
//   prepareTail({ asset, outDir, at, dur, live }) → { file: 'assets/tail-….mp4', made, live } 或 { error }
//       asset＝底片（work/hyperframes/assets/rough.mp4）；at＝畫面上最後一格在底片裡的秒數；dur＝片尾幾秒
//       live＝{ source, from, crop, lut, canvas, gainDb }：source＝原始錄影（work/main.mp4）、from＝底片結尾在原始錄影的秒數；不給或接不上就凍結
//   liveSource({ projectDir, roughEnd, dur }) → { source, from } 或 { why }：用 work/cuts.v1.json 把底片結尾換回原始錄影的秒數，後面剪掉的要夠 dur 秒
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { encodeFootage } from './ff.mjs';
import { keptSegments, roughToSourceTime } from './transcript-map.mjs';

export const TAIL_FPS = 30;

export function liveSource({ projectDir, roughEnd, dur }) {
  const v1f = path.join(projectDir, 'work', 'cuts.v1.json'), source = path.join(projectDir, 'work', 'main.mp4');
  if (!fs.existsSync(v1f) || !fs.existsSync(source)) return { why: '沒有 work/cuts.v1.json 或 work/main.mp4' };
  let v1;
  try { v1 = JSON.parse(fs.readFileSync(v1f, 'utf8')); } catch { return { why: 'work/cuts.v1.json 讀不懂' }; }
  if (!Array.isArray(v1?.chunks) || !v1.chunks.length) return { why: 'work/cuts.v1.json 沒有 chunks' };
  const kept = keptSegments(v1, TAIL_FPS);
  const from = roughToSourceTime(kept, roughEnd);
  const total = v1.chunks.at(-1)[1] / TAIL_FPS;
  if (total - from < dur - 1e-3) return { why: `原始錄影在講完之後只剩 ${Math.max(0, total - from).toFixed(2)}s` };
  return { source, from };
}

export function prepareTail({ asset, outDir, at, dur, live = null }) {
  let st;
  try { st = fs.statSync(asset); } catch { return { error: '底片還沒編碼好' }; }
  const n = Math.max(1, Math.round(dur * TAIL_FPS));
  const dir = path.join(outDir, 'assets');
  let liveKey = '';
  if (live) {
    try { const s = fs.statSync(live.source); liveKey = `|live:${s.size}:${Math.round(s.mtimeMs)}:${live.from.toFixed(3)}:${JSON.stringify(live.crop)}:${live.lut || ''}:${(live.gainDb ?? 0).toFixed(2)}:${live.canvas?.W}x${live.canvas?.H}`; } catch { live = null; }
  }
  const key = createHash('sha1').update(`${st.size}:${Math.round(st.mtimeMs)}:${at.toFixed(3)}:${n}${liveKey}`).digest('hex').slice(0, 10);
  const name = `tail-${key}.mp4`, file = path.join(dir, name);
  const clean = () => { for (const f of fs.readdirSync(dir)) if (/^tail-[0-9a-f]{10}\.mp4$/.test(f) && f !== name) fs.rmSync(path.join(dir, f), { force: true }); };
  if (fs.existsSync(file) && fs.statSync(file).size > 0) { clean(); return { file: `assets/${name}`, made: false, live: !!live }; }
  if (live) {
    const r = makeLive({ live, dur: n / TAIL_FPS, dir, name });
    if (!r.error) { fs.renameSync(r.tmp, file); clean(); return { file: `assets/${name}`, made: true, live: true }; }
    return { error: r.error, retry: true };   // build 退回凍結
  }
  const tmp = path.join(dir, `.tmp-${name}`);
  // -ss 往前讓四分之一格：浮點誤差不會跳到下一格
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-ss', String(Math.max(0, at - 0.25 / TAIL_FPS)), '-i', asset, '-an',
    '-vf', `trim=end_frame=1,loop=loop=${n - 1}:size=1:start=0,setpts=N/(${TAIL_FPS}*TB)`, '-frames:v', String(n), '-r', String(TAIL_FPS),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-g', String(TAIL_FPS), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', tmp], { encoding: 'utf8' });
  if (r.status !== 0 || !fs.existsSync(tmp) || !fs.statSync(tmp).size) {
    fs.rmSync(tmp, { force: true });
    return { error: String(r.stderr || r.error?.message || '').trim().split('\n').slice(-1)[0] || 'ffmpeg 沒有產生檔案' };
  }
  fs.renameSync(tmp, file);
  clean();
  return { file: `assets/${name}`, made: true, live: false };
}

// 原始錄影 from 秒起切 dur 秒（先無損精確地切成暫存檔），再走和底片同一支 encodeFootage（裁切、縮放、LUT、30fps），聲音乘上底片的響度增益
function makeLive({ live, dur, dir, name }) {
  const cut = path.join(dir, `.cut-${name.replace(/\.mp4$/, '.mkv')}`), tmp = path.join(dir, `.tmp-${name}`);
  try {
    const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-ss', live.from.toFixed(4), '-i', live.source, '-t', dur.toFixed(4),
      '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '10', '-pix_fmt', 'yuv420p', '-c:a', 'pcm_s16le', cut], { encoding: 'utf8' });
    if (r.status !== 0 || !fs.existsSync(cut)) return { error: String(r.stderr || '').trim().split('\n').slice(-1)[0] || '切原始錄影失敗' };
    encodeFootage(cut, tmp, { audioFilter: `volume=${(live.gainDb ?? 0).toFixed(2)}dB,aresample=48000`, crop: live.crop, lut: live.lut, canvas: live.canvas });
    if (!fs.existsSync(tmp) || !fs.statSync(tmp).size) return { error: '編碼原始錄影失敗' };
    return { tmp };
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    return { error: e.message };
  } finally {
    fs.rmSync(cut, { force: true });
  }
}
