// ffmpeg／ffprobe 小工具（零依賴；build.mjs 與 media.mjs 共用）
//
//   run(cmd, args, opts)                 → spawnSync 結果（找不到指令時丟出中文錯誤）
//   probeDuration(file)                  → 秒數
//   probeMedia(file)                     → { kind:'video'|'image'|'audio', duration, width, height, fps, vfr, hasAudio, hasVideo }
//   encodeFootage(src, dst, { audioFilter, audioRaw })  主軌底片：30fps CFR、每秒一個關鍵幀、聲音 AAC（聲音處理見 audio.mjs）
//   encodeMedia(src, dst, { speed, keepAudio })   插入的錄影：同上（另外把 speed 做進檔案、太大的畫面縮到 3840×2160 內）
//   blackDetect(file, cacheFile, onMiss) → [[起, 迄], …]（全黑＝只有聲音的區間；依檔案大小＋修改時間快取，沒命中時先呼叫 onMiss）
//   rawFrame(file, { at, width, height })→ Buffer（rgb24；給 contact sheet、格線圖用）
//   writeJpg(raster, file)               raster＝{ w, h, data }（rgb24）→ JPG
//   extractFrames({ file, ranges, crop, size, dir, prefix })  逐幀裁切成 JPG（放大鏡用）→ 檔名陣列

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

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

// 重新編碼：固定 30fps、每秒一個關鍵幀（關鍵幀間隔太大時 seek 會凍結），聲音轉 AAC 讓長度和畫面一致
// opts.audioFilter＝聲音濾鏡（例如 loudnorm）；opts.audioRaw＝{ file, rate, channels }：聲音改用處理過的 f32le PCM（build 先把剪接點淡化好）
export function encodeFootage(src, dst, { audioFilter = null, audioRaw = null } = {}) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  const args = ['-y', '-v', 'error', '-i', src];
  if (audioRaw) args.push('-f', 'f32le', '-ar', String(audioRaw.rate), '-ac', String(audioRaw.channels), '-i', audioRaw.file, '-map', '0:v:0', '-map', '1:a:0');
  args.push('-vf', 'fps=30', '-fps_mode', 'cfr', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-g', '30', '-keyint_min', '30', '-pix_fmt', 'yuv420p');
  if (audioFilter) args.push('-af', audioFilter);
  args.push('-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', dst);
  const r = run('ffmpeg', args);
  if (r.status !== 0) throw new Error(`ffmpeg 重新編碼失敗：${String(r.stderr).trim().slice(0, 400)}`);
}

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
