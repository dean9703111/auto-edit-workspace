// 接主軌：main（work/main.mp4、main.json）
// 032 C9：從 media.mjs 搬過來（只搬移，輸出不變）；media.mjs 照舊匯出原本那些名稱
import path from 'node:path';
import fs from 'node:fs';
import { probeMedia, run, VIDEO_EXT, AUDIO_EXT, decodeIssues, sdrChain, tmpFor, sweepTmp } from '../ff.mjs';
import { resolveFormat } from '../canvas.mjs';
import { r3, listFiles, natural } from './util.mjs';

// ---------- main ----------

// 主軌 fps：29–31（手機常見 29.92、29.97）、VFR、沒有 fps、超過 61 → 30；其他照原片取到小數 2 位
export const mainFps = (info) => (info.vfr || !info.fps || info.fps > 61 || Math.abs(info.fps - 30) < 1 ? 30 : Math.round(info.fps * 100) / 100);

// 螢幕錄影有沒有邊錄邊講：音軌不是靜音（silencedetect −35 dB、停 0.3 秒以上才算停頓）的比例在 min–max 之間就算有講解。
// 只有點擊聲的錄影通常 < 10%；背景音樂、持續的系統聲幾乎不停（> 95%）；講話會換氣停頓，約 40–90%。
// 判斷錯了在停點 ① 改 --order（寫進去＝接進主軌、拿掉＝當插入素材）
export const NARR = { noise: '-35dB', d: 0.3, min: 0.2, max: 0.95 };
export function narrationOf(file, info = probeMedia(file)) {
  if (!info.hasAudio || !(info.duration > 0)) return { narrated: false, ratio: 0, hasAudio: !!info.hasAudio };
  const r = run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vn', '-sn', '-dn', '-af', `silencedetect=n=${NARR.noise}:d=${NARR.d}`, '-f', 'null', '-']);
  const err = String(r.stderr);
  let silent = 0, open = null;
  for (const m of err.matchAll(/silence_(start|end):\s*(-?[\d.]+)/g)) {
    if (m[1] === 'start') open = Math.max(0, Number(m[2]));
    else if (open != null) { silent += Number(m[2]) - open; open = null; }
  }
  if (open != null) silent += info.duration - open;   // 靜音一路到檔尾
  const ratio = r3(Math.min(1, Math.max(0, 1 - silent / info.duration)));
  return { narrated: ratio >= NARR.min && ratio <= NARR.max, ratio, hasAudio: true };
}

// 主軌的候選：真人錄影、聲音檔、有音軌的螢幕錄影（narrated＝偵測到講解，沒寫 --order 時才會自動接進主軌）
export function mainCandidates(proj) {
  const cams = listFiles(path.join(proj, 'assets', 'camera'), VIDEO_EXT).map((f) => ({ name: f, file: `assets/camera/${f}`, kind: 'camera' }));
  const voices = listFiles(path.join(proj, 'assets', 'voice'), [...AUDIO_EXT, ...VIDEO_EXT]).map((f) => ({ name: f, file: `assets/voice/${f}`, kind: 'voice' }));
  const screens = listFiles(path.join(proj, 'assets', 'screen'), VIDEO_EXT).map((f) => {
    const abs = path.join(proj, 'assets', 'screen', f);
    let n;
    try { n = narrationOf(abs); } catch { n = { narrated: false, ratio: 0, hasAudio: false }; }   // 壞檔不擋主軌：素材掃描會列出來
    return { name: f, file: `assets/screen/${f}`, kind: 'screen', narrated: n.narrated, ratio: n.ratio, hasAudio: n.hasAudio };
  }).filter((x) => x.hasAudio);
  return { cams, voices, screens };
}

// 這支 main.mp4 是照什麼順序接的（work/main.json 的 order，有寫 --order 才有；prep 用來判斷要不要重接）
export function readMainOrder(proj) {
  try { return JSON.parse(fs.readFileSync(path.join(proj, 'work', 'main.json'), 'utf8')).order ?? null; } catch { return null; }
}

// 現成的 main.mp4 還能用嗎：順序沒變、素材沒比它新、沒有新的真人錄影／聲音檔、main.json 和影片長度對得起來
export function mainIsCurrent(P, order = null) {
  const proj = P.project, file = path.join(proj, 'work', 'main.mp4');
  let clips, st;
  try { clips = JSON.parse(fs.readFileSync(path.join(proj, 'work', 'main.json'), 'utf8')).clips; st = fs.statSync(file); } catch { return false; }
  if (!Array.isArray(clips) || !clips.length) return false;
  const was = readMainOrder(proj);
  if (order != null && String(order) !== was) return false;
  for (const c of clips) {
    try { if (fs.statSync(path.join(proj, ...c.file.split('/'))).mtimeMs > st.mtimeMs) return false; } catch { return false; }
  }
  if (was == null) {
    const now = [...listFiles(path.join(proj, 'assets', 'camera'), VIDEO_EXT).map((f) => `assets/camera/${f}`), ...listFiles(path.join(proj, 'assets', 'voice'), [...AUDIO_EXT, ...VIDEO_EXT]).map((f) => `assets/voice/${f}`)];
    if (now.some((f) => !clips.some((c) => c.file === f))) return false;
  }
  try {
    const m = probeMedia(file);
    if (Math.abs(m.duration - clips[clips.length - 1].end) >= 1 || m.hdr) return false;   // m.hdr：舊版接出來還標 HDR 的主軌，重接才會轉 SDR
  } catch { return false; }
  // 主軌方向和第一支真人錄影不一樣：舊版沒算旋轉標記接出來的（直拍變橫的＋黑邊），重接
  const cam = clips.find((c) => c.kind === 'camera');
  if (cam) {
    try {
      const a = probeMedia(path.join(proj, ...cam.file.split('/'))), b = probeMedia(file);
      if ((a.width < a.height) !== (b.width < b.height)) return false;
    } catch { return false; }
  }
  // 檔案壞了（以前中途被砍又重跑留下的）重接才救得回來：聲音解一次，31 分鐘也只要幾秒
  return !decodeIssues(run('ffmpeg', ['-hide_banner', '-nostats', '-v', 'error', '-i', file, '-vn', '-sn', '-dn', '-f', 'null', '-']).stderr).count;
}

// 螢幕錄影的判斷（照抄進 cuts.md 的主軌順序）
export function screenJudge(x) {
  return x.narrated
    ? `${x.file}：偵測到講解（有聲音 ${Math.round(x.ratio * 100)}%）→ 接進主軌，畫面之後由 screen-sync 蓋回`
    : `${x.file}：${x.ratio > NARR.max ? `聲音幾乎沒停（${Math.round(x.ratio * 100)}%，像背景音樂或系統聲音）` : `聲音只有 ${Math.round(x.ratio * 100)}%`}，當插入素材（要接進主軌就寫進 --order）`;
}

// 多條音軌（兩支麥、螢幕錄影＋麥克風）：第一條有聲音就用第一條；第一條是靜音就用最響的那條
export const SILENT_PEAK = -60;
export function pickAudioTrack(file, count) {
  if (!(count > 1)) return { track: 0, peaks: [] };
  const peaks = [];
  for (let k = 0; k < count; k++) {
    const r = run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-map', `0:a:${k}`, '-af', 'volumedetect', '-f', 'null', '-']);
    const p = Number((String(r.stderr).match(/max_volume:\s*(-?[\d.]+) dB/) || [])[1]);
    peaks.push(Number.isFinite(p) ? p : -Infinity);
  }
  if (peaks[0] > SILENT_PEAK) return { track: 0, peaks };
  const best = peaks.indexOf(Math.max(...peaks));
  return { track: peaks[best] > SILENT_PEAK ? best : 0, peaks };
}

// 來源檔完整嗎：傳輸中斷的檔標示的長度還在、資料只到一半，ffmpeg 結束碼還是 0。只解封裝不解碼；給了長度就先看最後 2 秒（4K 大檔放外接硬碟也不用整支讀一次），壞了才整支掃出資料到幾秒
const PARTIAL = /partial file|corrupt input packet|Packet corrupt/;
export function sourceEnd(file, duration = null) {
  const scan = (before = []) => String(run('ffmpeg', ['-hide_banner', '-nostdin', '-stats', ...before, '-i', file, '-map', '0:v?', '-map', '0:a?', '-c', 'copy', '-f', 'null', '-']).stderr);
  if (duration > 4) {   // 資料沒到尾巴時，跳過去會什麼都讀不到（不一定印 partial file）
    const tail = scan(['-ss', String(r3(duration - 2))]);
    if (!PARTIAL.test(tail) && !/Output file is empty|time=N\/A\s+bitrate=N\/A speed=N\/A/.test(tail)) return { partial: false, end: null };
  }
  const err = scan();
  const m = [...err.matchAll(/time=(\d+):(\d+):([\d.]+)/g)].pop();
  return { partial: PARTIAL.test(err), end: m ? r3(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) : null };
}

export function joinMain(P, { order = null, log = console.log } = {}) {
  const proj = P.project;
  const { cams, voices, screens } = mainCandidates(proj);
  for (const x of screens) log(screenJudge(x));
  const all = [...cams, ...voices, ...screens];
  let list = [...cams, ...voices, ...screens.filter((x) => x.narrated)].sort((a, b) => natural(a.name, b.name));
  if (!list.length) {
    const other = ['camera', 'voice'].flatMap((d) => { try { return fs.readdirSync(path.join(proj, 'assets', d)).filter((n) => !n.startsWith('.')).map((n) => `assets/${d}/${n}`); } catch { return []; } });
    if (other.length) throw new Error(`${other.join('、')} 的格式不支援（影片收 ${VIDEO_EXT.join(' ')}，聲音收 ${AUDIO_EXT.join(' ')}）→ 轉成 mp4 或 m4a 放回去再跑`);
    throw new Error('assets/camera/ 和 assets/voice/ 都是空的，assets/screen/ 也沒有邊錄邊講的錄影：先把講解影片或旁白放進去');
  }
  if (order) {
    const want = String(order).split(',').map((s) => s.trim()).filter(Boolean);
    const picked = want.map((raw) => {
      // 檔名@起-迄：只取那一段（補錄插進旁白中間時，同一支旁白切成前後兩段）
      const m = raw.match(/^(.*)@(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)?$/);
      const w = m ? m[1].trim() : raw;
      const hits = all.filter((x) => x.name === w || x.file === w.replace(/\\/g, '/'));
      if (hits.length > 1) throw new Error(`--order 的「${w}」有 ${hits.length} 個同名檔（${hits.map((x) => x.file).join('、')}）→ 改寫成 assets/… 路徑`);
      if (!hits.length) throw new Error(`--order 的「${w}」找不到 → 現有：${all.map((x) => x.file).join('、')}`);
      if (!m) return hits[0];
      const a = Number(m[2]), b = m[3] != null ? Number(m[3]) : null;
      if (b != null && b <= a) throw new Error(`--order 的「${raw}」：迄要比起大（寫成 檔名@起-迄，秒數；迄不寫＝到檔尾）`);
      return { ...hits[0], range: [a, b] };
    });
    const left = list.filter((x) => !picked.some((p) => p.file === x.file));
    if (left.length) log(`⚠ 這些檔沒寫在 --order，不接進主軌：${left.map((x) => x.name).join('、')}`);
    list = picked;
  }
  if (list.length === 1 && list[0].kind === 'camera') log(`只有一支真人錄影（${list[0].file}）：轉成固定 fps 的 work/main.mp4（auto-editor 直接剪手機原檔，--cut-out 之後的畫面可能全黑），之後 ng-snap、auto-editor 都用它。`);
  // 規格跟第一支真人錄影
  const first = list.find((x) => x.kind === 'camera');
  let W = 1920, H = 1080, F = 30;
  if (first) {
    const info = probeMedia(path.join(proj, ...first.file.split('/')));
    W = Math.floor((info.width || 1920) / 2) * 2; H = Math.floor((info.height || 1080) / 2) * 2;
    F = mainFps(info);
  } else {
    // 沒有真人（手機邊錄邊講、純旁白）：黑底照版式，不然直式專案會被「主軌是橫的」擋下
    let plan = null;
    try { plan = JSON.parse(fs.readFileSync(P.plan, 'utf8')); } catch { plan = null; }
    if (resolveFormat({ projectDir: P.project, plan }).format === 'portrait') { W = 1080; H = 1920; }
  }
  // 一次接完（concat filter）：每一段的畫面與聲音都裁／補到同一個長度，接縫不會越接越偏
  const inputs = [], chains = [], labels = [], clips = [], warnings = [], noAudio = [];
  let anyHdr = false;
  let t = 0;
  list.forEach((x, i) => {
    const abs = path.join(proj, ...x.file.split('/'));
    const info = probeMedia(abs);
    if (x.kind !== 'camera' && !info.hasAudio) throw new Error(`${x.file} 沒有聲音軌`);
    if (x.kind === 'camera' && !info.hasAudio) noAudio.push(x.file);
    const whole = sourceEnd(abs, info.duration);
    if (whole.partial) warnings.push(`${x.file} 不完整：標示 ${r3(info.duration)} 秒，實際資料只到 ${whole.end ?? '?'} 秒（多半是複製或傳輸中斷）→ 從手機或相機重新複製一次再跑 prep --again；確定只要這一段就不用管`);
    const pick = info.hasAudio ? pickAudioTrack(abs, info.audioCount) : { track: 0, peaks: [] };
    if (pick.track) warnings.push(`${x.file} 有 ${info.audioCount} 條音軌，第 1 條是靜音，用第 ${pick.track + 1} 條（最大音量 ${pick.peaks[pick.track]} dB）→ 聲音不對就說`);
    else if (pick.peaks.length) log(`${x.file} 有 ${info.audioCount} 條音軌，用第 1 條（各條最大音量 ${pick.peaks.join('、')} dB）`);
    let src = null;
    if (x.range) {
      const a = x.range[0], b = Math.min(x.range[1] ?? info.duration, info.duration);
      if (a >= info.duration || b - a < 0.1) throw new Error(`--order 的 ${x.file}@${a}-${x.range[1] ?? ''}：素材只有 ${r3(info.duration)}s，這一段是空的`);
      src = [r3(a), r3(b)];
    }
    const D = r3(Math.round((src ? src[1] - src[0] : info.duration) * F) / F);
    if (src) inputs.push('-ss', String(src[0]), '-t', String(r3(src[1] - src[0])));
    inputs.push('-i', abs);
    // iPhone 預設錄 HDR（HLG）：先轉成 SDR BT.709，之後每一步都當一般影片（不然成品會變 HEVC HDR、render 慢好幾倍）
    const hdr = x.kind === 'camera' ? info.hdr : null;
    if (hdr) { anyHdr = true; log(`${x.file} 是 HDR（${hdr === 'hlg' ? 'HLG' : 'PQ'}）：轉成 SDR`); }
    if (x.kind === 'camera') chains.push(`[${i}:v:0]${hdr ? `${sdrChain(hdr)},` : ''}scale=${W}:${H}:force_original_aspect_ratio=decrease:out_range=tv,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,fps=${F}:start_time=0,format=yuv420p,tpad=stop_mode=clone:stop_duration=1,trim=duration=${D},setpts=PTS-STARTPTS[v${i}]`);
    // 聲音檔、邊錄邊講的螢幕錄影配純黑畫面（build 靠 blackdetect 認出「只有聲音」的區間，一定要是合成的純黑；螢幕錄影的畫面由 screen-sync 蓋回）
    else chains.push(`color=c=black:s=${W}x${H}:r=${F}:d=${D},format=yuv420p,setpts=PTS-STARTPTS[v${i}]`);
    // first_pts＝0、fps 的 start_time＝0：音軌或畫面晚開始（素材的起點偏移）就補靜音、補第一格，不然音畫會差那麼多
    if (info.hasAudio) chains.push(`[${i}:a:${pick.track}]aresample=48000:first_pts=0,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=duration=${D},asetpts=PTS-STARTPTS[a${i}]`);
    else chains.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${D},asetpts=PTS-STARTPTS[a${i}]`);
    labels.push(`[v${i}][a${i}]`);
    clips.push({ file: x.file, kind: x.kind, start: r3(t), end: r3(t + D), ...(src ? { src } : {}), ...(pick.track ? { audioTrack: pick.track } : {}) });
    t += D;
    log(`接主軌 ${i + 1}/${list.length}：${x.file}${src ? `@${src[0]}–${src[1]}s` : ''}${x.kind === 'voice' ? '（聲音，配純黑畫面）' : x.kind === 'screen' ? '（邊錄邊講的螢幕錄影：取聲音、配純黑畫面）' : ''}（${D}s）`);
  });
  if (noAudio.length === list.length) throw new Error(`${noAudio.join('、')} 沒有聲音軌 → 這個流程靠講話的聲音剪：確認錄影時有收音；聲音是另外錄的，就把聲音檔放 assets/voice/`);
  for (const f of noAudio) warnings.push(`${f} 沒有聲音軌，這段主軌是靜音的，逐字稿和字幕不會有內容`);
  const graph = `${chains.join(';')};${labels.join('')}concat=n=${list.length}:v=1:a=1[v][a]`;
  const mainFile = path.join(proj, 'work', 'main.mp4'), tmpFile = tmpFor(mainFile);   // 寫完才換上：中途被砍不會留下半支 main.mp4；檔名帶 pid：舊的 ffmpeg 還在寫也不會寫到同一個檔
  sweepTmp(path.dirname(mainFile));
  fs.mkdirSync(path.dirname(mainFile), { recursive: true });
  log(`轉檔中…（${W}×${H}、${F}fps；1080p 每 10 分鐘約 1–3 分鐘）`);
  const r = run('ffmpeg', ['-y', '-v', 'error', ...inputs, '-filter_complex', graph, '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-g', String(Math.round(F)), '-pix_fmt', 'yuv420p', '-color_range', 'tv', ...(anyHdr ? ['-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709'] : []), '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', tmpFile]);
  if (r.status !== 0) { fs.rmSync(tmpFile, { force: true }); throw new Error(`接主軌失敗：${String(r.stderr).trim().slice(-400)}`); }
  fs.renameSync(tmpFile, mainFile);
  // 中段破損（標示長度對得上但解碼有錯）：結束碼還是 0，只有 stderr 看得到
  const broken = decodeIssues(r.stderr);
  if (broken.count && !warnings.some((w) => w.includes('不完整'))) warnings.push(`素材解碼有錯（${broken.count} 行，例：${broken.sample}）→ 畫面或聲音可能有破損，聽看 work/main.mp4；有問題就重新複製素材`);
  for (const w of warnings) log(`⚠ ${w}`);
  const json = { clips, ...(order != null ? { order: String(order) } : {}), ...(warnings.length ? { warnings } : {}) };
  fs.writeFileSync(path.join(proj, 'work', 'main.json'), JSON.stringify(json, null, 2) + '\n');
  return { file: mainFile, width: W, height: H, fps: F, duration: probeMedia(mainFile).duration, clips, warnings };
}
