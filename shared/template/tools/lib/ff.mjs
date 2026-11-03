// ffmpeg／ffprobe 小工具（零依賴；build.mjs 與 media.mjs 共用）
//
//   run(cmd, args, opts)                 → spawnSync 結果（找不到指令時丟出中文錯誤）
//   probeDuration(file)                  → 秒數
//   probeMedia(file)                     → { kind:'video'|'image'|'audio', duration, width, height, fps, vfr, hasAudio, hasVideo }
//   encodeFootage(src, dst, { audioFilter, audioRaw, crop, lut, canvas })  主軌底片：30fps CFR、每秒一個關鍵幀、聲音 AAC（聲音處理見 audio.mjs）；lut＝講者調光的 .cube
//                                        canvas＝lib/canvas.mjs 的 canvasOf(format)（不傳＝橫式，輸出和原本逐位元組相同）
//   footageVf({ crop, canvas })          → 底片的裁切／縮放濾鏡陣列（frame 寬高比不對時丟出中文錯誤）
//   filterPath(p)                        → 濾鏡參數裡的路徑（'C\:/x/a.cube'；Windows 的磁碟機冒號要跳脫）
//   lut3dFilter(file)                    → lut3d=file=…:interp=tetrahedral
//   encodeMedia(src, dst, { speed, keepAudio })   插入的錄影：同上（另外把 speed 做進檔案、太大的畫面縮到 3840×2160 內）
//   transcriptFresh(tj, video)           → work/transcript.json 是不是這支 rough.mp4 轉的（noteTranscript 記下轉的時候 rough.mp4 多長）
//   blackDetect(file, cacheFile, onMiss) → [[起, 迄], …]（全黑＝只有聲音的區間；依檔案大小＋修改時間快取，沒命中時先呼叫 onMiss）
//   rawFrame(file, { at, width, height })→ Buffer（rgb24；給 contact sheet、格線圖用）
//   writeJpg(raster, file)               raster＝{ w, h, data }（rgb24）→ JPG
//   extractFrames({ file, ranges, crop, size, dir, prefix })  逐幀裁切成 JPG（放大鏡用）→ 檔名陣列

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { CANVAS } from './canvas.mjs';

export const VIDEO_EXT = ['.mp4', '.mov', '.m4v', '.webm'];
export const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp'];
export const AUDIO_EXT = ['.m4a', '.mp3', '.wav', '.aac', '.flac', '.ogg', '.opus'];
const r3 = (n) => +Number(n).toFixed(3);

export function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 30, ...opts });
  if (r.error) {
    if (r.error.code === 'ENOENT') throw new Error(`找不到 ${cmd}：先跑 npx hyperframes doctor 安裝 ffmpeg，或確認 ${cmd} 在 PATH 裡`);
    throw r.error;
  }
  return r;
}
const tail = (s, n = 400) => String(s ?? '').trim().slice(-n);

// 詞級逐字稿是不是這支 rough.mp4 轉的：不比 rough.mp4 舊就是；比較舊（初剪重做過）時，看 srt-align 記下的當時長度（work/.cache/transcript-of.json）：
// 逐字稿沒換過、rough.mp4 長度差 ≤ 0.2 秒（剪輯清單沒改、只是重輸出）照用，不用重轉（剪乾淨步驟 6「差超過 0.2 秒才重轉」）
export const TRANSCRIPT_TOL = 0.2;
const transcriptNote = (tj) => path.join(path.dirname(tj), '.cache', 'transcript-of.json');
export function transcriptFresh(tj, video) {
  if (!video || !fs.existsSync(video) || fs.statSync(tj).mtimeMs >= fs.statSync(video).mtimeMs - 1000) return true;
  try {
    const rec = JSON.parse(fs.readFileSync(transcriptNote(tj), 'utf8'));
    return Math.abs(rec.mtimeMs - fs.statSync(tj).mtimeMs) < 1 && Math.abs(probeDuration(video) - rec.rough) <= TRANSCRIPT_TOL + 1e-6;
  } catch { return false; }
}
export function noteTranscript(tj, video) {
  try {
    if (fs.statSync(tj).mtimeMs < fs.statSync(video).mtimeMs - 1000) return;   // 只在剛轉完時記（記的是轉的那一支）
    fs.mkdirSync(path.dirname(transcriptNote(tj)), { recursive: true });
    fs.writeFileSync(transcriptNote(tj), JSON.stringify({ rough: probeDuration(video), mtimeMs: fs.statSync(tj).mtimeMs }) + '\n');
  } catch { /* 記不下來只是之後重輸出初剪時要重轉 */ }
}

export function probeDuration(file) {
  const r = run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]);
  const d = Number(String(r.stdout).trim());
  if (r.status !== 0 || !Number.isFinite(d)) throw new Error(`ffprobe 讀不到 ${file} 的長度：${String(r.stderr).trim().slice(0, 200)}`);
  return d;
}

const rate = (s) => { const [a, b] = String(s || '0/1').split('/').map(Number); return b ? a / b : a; };

export function probeMedia(file) {
  const ext = path.extname(file).toLowerCase();
  const r = run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,duration:stream_disposition=attached_pic', '-of', 'json', file]);
  if (r.status !== 0) throw new Error(`ffprobe 讀不到 ${path.basename(file)}：${tail(r.stderr, 200)}（檔案壞了，或不是影片／圖片）`);
  let j;
  try { j = JSON.parse(r.stdout); } catch { throw new Error(`ffprobe 讀不到 ${path.basename(file)} 的資訊`); }
  const streams = j.streams || [];
  const v = streams.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic);
  const a = streams.find((s) => s.codec_type === 'audio');
  const image = IMAGE_EXT.includes(ext);
  const duration = Number(j.format?.duration);
  const out = {
    kind: image ? 'image' : v ? 'video' : a ? 'audio' : 'unknown',
    duration: image ? null : Number.isFinite(duration) ? r3(duration) : null,
    width: v?.width ?? null, height: v?.height ?? null,
    fps: v && !image ? r3(rate(v.avg_frame_rate) || rate(v.r_frame_rate)) : null,
    vfr: !!(v && !image && Math.abs(rate(v.avg_frame_rate) - rate(v.r_frame_rate)) > 0.01),
    hasAudio: !!a && !image, hasVideo: !!v,
  };
  return out;
}

// 底片的裁切／縮放（FR-100）：
//   有 crop：寬高比要等於 canvas.framing.aspect（差 2 % 內；frame 換成來源像素時取偶數會差一點），裁完縮放到 W×H
//   沒有 crop：直式等比縮放到蓋滿 1080×1920、置中裁掉多出來的（不補邊）；橫式不縮放（和改版前一樣）
export const FRAME_ASPECT_TOL = 0.02;
export function footageVf({ crop = null, canvas = CANVAS.landscape } = {}) {
  const { W, H } = canvas;
  if (crop) {
    const a = crop.w / crop.h, want = canvas.framing.aspect;
    if (Math.abs(a / want - 1) > FRAME_ASPECT_TOL) {
      const ratio = canvas.format === 'portrait' ? '9:16' : '16:9';
      throw new Error(`frame 的寬高比要是 ${ratio}（換成來源像素是 ${crop.w}×${crop.h}＝${a.toFixed(3)}，要 ${want.toFixed(3)}）→ 照 qc.mjs framing 印的值重寫 plan.json 的 frame`);
    }
    return [`crop=${crop.w}:${crop.h}:${crop.x}:${crop.y}`, `scale=${W}:${H}:flags=lanczos`];
  }
  if (canvas.format === 'landscape') return [];
  return [`scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos`, `crop=${W}:${H}`];
}

// 重新編碼：固定 30fps、每秒一個關鍵幀（關鍵幀間隔太大時 seek 會凍結），聲音轉 AAC 讓長度和畫面一致
// opts.audioFilter＝聲音濾鏡（例如 loudnorm）；opts.audioRaw＝{ file, rate, channels }：聲音改用處理過的 f32le PCM（build 先把剪接點淡化好）
// opts.crop＝{ x, y, w, h }（來源影片的像素）：構圖裁切，裁完縮放到畫布 W×H
// opts.lut＝.cube 路徑：講者調光（已經照強度混好，contracts/look.md §3）；順序 crop → scale → lut3d → fps
// opts.canvas＝畫布（specs/009-vertical FR-100）：不傳＝橫式
export function encodeFootage(src, dst, { audioFilter = null, audioRaw = null, crop = null, lut = null, canvas = CANVAS.landscape } = {}) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  const args = ['-y', '-v', 'error', '-i', src];
  if (audioRaw) args.push('-f', 'f32le', '-ar', String(audioRaw.rate), '-ac', String(audioRaw.channels), '-i', audioRaw.file, '-map', '0:v:0', '-map', '1:a:0');
  const vf = footageVf({ crop, canvas });
  if (lut) vf.push(lut3dFilter(lut));
  vf.push('fps=30');
  args.push('-vf', vf.join(','), '-fps_mode', 'cfr', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-g', '30', '-keyint_min', '30', '-pix_fmt', 'yuv420p');
  if (audioFilter) args.push('-af', audioFilter);
  args.push('-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', dst);
  const r = run('ffmpeg', args);
  if (r.status !== 0) throw new Error(`ffmpeg 重新編碼失敗：${String(r.stderr).trim().slice(0, 400)}`);
}

// 濾鏡圖裡的路徑：ffmpeg 先拆濾鏡圖（'…' 裡面原樣），再拆選項（\: → :），所以 C:\x\a.cube 要寫成 'C\:/x/a.cube'
export function filterPath(p) {
  const abs = path.resolve(p).split(path.sep).join('/').replace(/\\/g, '/');
  if (/['\[\],;]/.test(abs)) throw new Error(`路徑裡有 ' [ ] , ; 這些字元，ffmpeg 濾鏡讀不了：${abs} → 把專案資料夾改名`);
  return `'${abs.replace(/:/g, '\\:')}'`;
}
export const lut3dFilter = (file) => `lut3d=file=${filterPath(file)}:interp=tetrahedral`;

// atempo 一次只能 0.5–2 倍，超過就串起來
const atempo = (speed) => {
  const f = [];
  let s = speed;
  while (s > 2 + 1e-9) { f.push('atempo=2'); s /= 2; }
  while (s < 0.5 - 1e-9) { f.push('atempo=0.5'); s /= 0.5; }
  if (Math.abs(s - 1) > 1e-9) f.push(`atempo=${+s.toFixed(6)}`);
  return f;
};

// 插入的錄影：macOS 螢幕錄影是 VFR，關鍵幀也稀，和底片一樣轉成 30fps CFR、每秒一個關鍵幀；
// speed 直接做進檔案（檔案的第 t 秒＝素材的第 t×speed 秒），播放端只用 data-media-start 跳到要的地方。
// 畫面超過 3840×2160 等比縮小（座標換算由呼叫端用 scale 處理）。
export function encodeMedia(src, dst, { speed = 1, keepAudio = false, width, height } = {}) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  const vf = [];
  if (Math.abs(speed - 1) > 1e-9) vf.push(`setpts=PTS/${speed}`);
  vf.push('fps=30');
  if (width && height) vf.push(`scale=${width}:${height}:flags=lanczos`);
  vf.push('format=yuv420p');
  const args = ['-y', '-v', 'error', '-i', src, '-map', '0:v:0', '-vf', vf.join(','), '-fps_mode', 'cfr', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
    '-g', '30', '-keyint_min', '30', '-sc_threshold', '0'];
  if (keepAudio) {
    args.push('-map', '0:a:0?');
    const af = atempo(speed);
    if (af.length) args.push('-af', af.join(','));
    args.push('-c:a', 'aac', '-b:a', '192k', '-ar', '48000');
  } else args.push('-an');
  args.push('-movflags', '+faststart', dst);
  const r = run('ffmpeg', args);
  if (r.status !== 0) throw new Error(`ffmpeg 轉檔失敗（${path.basename(src)}）：${tail(r.stderr)}`);
}

// 全黑偵測：門檻很嚴，只抓「聲音檔配的合成純黑」（真人錄影再暗也不會整格 99.8% 的像素都是黑）
export const BLACK = { d: 0.3, pixTh: 0.02, picTh: 0.998 };
export function blackDetect(file, cacheFile = null, onMiss = null) {
  const st = fs.statSync(file);
  const key = { file: path.basename(file), size: st.size, mtimeMs: Math.round(st.mtimeMs), ...BLACK };
  if (cacheFile && fs.existsSync(cacheFile)) {
    try {
      const c = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (c.key && JSON.stringify(c.key) === JSON.stringify(key)) return c.ranges;
    } catch { /* 快取壞了就重算 */ }
  }
  if (onMiss) onMiss();
  const r = run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-an', '-sn', '-dn', '-vf', `blackdetect=d=${BLACK.d}:pix_th=${BLACK.pixTh}:pic_th=${BLACK.picTh}`, '-f', 'null', '-']);
  if (r.status !== 0) throw new Error(`ffmpeg 偵測全黑區間失敗：${tail(r.stderr)}`);
  const ranges = [];
  for (const m of String(r.stderr).matchAll(/black_start:\s*([\d.]+)\s+black_end:\s*([\d.]+)/g)) ranges.push([r3(Number(m[1])), r3(Number(m[2]))]);
  if (cacheFile) {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify({ key, ranges }, null, 2) + '\n');
  }
  return ranges;
}

// 一格畫面 → rgb24 Buffer（width／height 給了就縮放成那個大小）
export function rawFrame(file, { at = 0, width, height } = {}) {
  const args = ['-v', 'error'];
  if (at > 0) args.push('-ss', String(at));
  args.push('-i', file, '-frames:v', '1');
  if (width && height) args.push('-vf', `scale=${width}:${height}:flags=bicubic`);
  args.push('-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1');
  const r = spawnSync('ffmpeg', args, { maxBuffer: 1 << 30 });
  if (r.error) throw r.error.code === 'ENOENT' ? new Error('找不到 ffmpeg：先跑 npx hyperframes doctor') : r.error;
  if (r.status !== 0 || !r.stdout?.length) throw new Error(`抽不到 ${path.basename(file)} 第 ${at}s 的畫面：${tail(r.stderr?.toString())}`);
  return r.stdout;
}

export function writeJpg({ w, h, data }, file, quality = 3) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${w}x${h}`, '-i', 'pipe:0', '-frames:v', '1', '-q:v', String(quality), file], { input: data, maxBuffer: 1 << 28 });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`寫不出 ${path.basename(file)}：${tail(r.stderr?.toString())}`);
}

// 放大鏡逐幀：ranges＝[{ at（檔案秒數）, frames（張數）}]，依序抽出、裁 crop＝[x, y, w, h]（檔案像素）、縮成 size＝[w, h]
// JPG 不帶 PNG 的 cICP 色彩標記（pitfalls §52：帶了 Chrome 會畫暗一階）
export function extractFrames({ file, ranges, crop, size, dir, prefix = 'f', image = false }) {
  fs.mkdirSync(dir, { recursive: true });
  const names = [];
  const [cx, cy, cw, ch] = crop.map((v) => Math.max(0, Math.round(v)));
  const vf = `crop=${cw}:${ch}:${cx}:${cy},scale=${size[0]}:${size[1]}:flags=lanczos`;
  ranges.forEach((rg, j) => {
    const pat = path.join(dir, `${prefix}${j}-%04d.jpg`);
    const args = ['-y', '-v', 'error'];
    if (!image && rg.at > 0) args.push('-ss', String(r3(rg.at)));
    args.push('-i', file, '-frames:v', String(image ? 1 : rg.frames), '-vf', vf, '-q:v', '3', pat);
    const r = run('ffmpeg', args);
    if (r.status !== 0) throw new Error(`放大鏡抽幀失敗（${path.basename(file)}）：${tail(r.stderr)}`);
    const got = fs.readdirSync(dir).filter((f) => f.startsWith(`${prefix}${j}-`)).sort();
    if (!got.length) throw new Error(`放大鏡抽幀失敗（${path.basename(file)} 第 ${r3(rg.at)}s 之後沒有畫面）`);
    // 抽到的張數不夠（素材尾巴）：重複最後一張補齊
    for (let k = 0; k < (image ? 1 : rg.frames); k++) names.push(path.join(dir, got[Math.min(k, got.length - 1)]));
  });
  return names;
}
