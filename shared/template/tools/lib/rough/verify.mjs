// 初剪有沒有壞（verify-rough）
// 032 C9：從 media.mjs 搬過來（只搬移，輸出不變）；media.mjs 照舊匯出原本那些名稱
import path from 'node:path';
import fs from 'node:fs';
import { run, decodeIssues, AUDIO_EXT, VIDEO_EXT, probeMedia } from '../ff.mjs';
import { r3, listFiles, posixRel, fmtC, posix } from './util.mjs';
import { readV1, mainSource } from './cuts.mjs';

// ---------- 剪乾淨第 5 步之後：初剪有沒有壞（verify-rough）----------
// auto-editor 29.3.1 直接剪手機原檔（VFR、yuvj420p）時，--cut-out 之後的畫面可能全黑、聲音正常（2026-10 範例專案實測）
export const ROUGH = { d: 0.1, pixTh: 0.10, picTh: 0.98, gap: 0.1, dark: 32 };   // dark：原片 YAVG（0–255）低於這個值才算「原片也黑」

// rough.mp4 秒數 → 原片秒數（cuts.v1.json 的保留段依序接起來；超過保留總長就停在最後一格）
export function roughToSource(v1, fps, t) {
  let acc = 0, last = null;
  for (const [s, e, sp] of v1.chunks) {
    if (sp >= 99999) continue;
    const len = (e - s) / fps;
    if (t <= acc + len + 1e-9) return r3(s / fps + Math.max(0, t - acc));
    acc += len; last = e / fps;
  }
  return last == null ? null : r3(last);
}

// 相鄰 ≤ gap 秒的黑段併成一段（blackdetect 常每幾秒斷一格）
export function mergeBlack(ranges, gap = ROUGH.gap) {
  const out = [];
  for (const [a, b] of [...ranges].sort((x, y) => x[0] - y[0])) {
    const l = out[out.length - 1];
    if (l && a - l[1] <= gap + 1e-9) l[1] = Math.max(l[1], b); else out.push([a, b]);
  }
  return out;
}

// 黑畫面偵測本來就整支解碼一次：順便看解碼錯誤（聲音另外解一次，AAC 很快）。檔案壞了 ffmpeg 結束碼還是 0
function blackRanges(file) {
  const r = run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-an', '-sn', '-dn', '-vf', `blackdetect=d=${ROUGH.d}:pix_th=${ROUGH.pixTh}:pic_th=${ROUGH.picTh}`, '-f', 'null', '-']);
  if (r.status !== 0) throw new Error(`ffmpeg 偵測黑畫面失敗：${String(r.stderr).trim().split(/\r?\n/).pop()}`);
  const a = run('ffmpeg', ['-hide_banner', '-nostats', '-v', 'error', '-i', file, '-vn', '-sn', '-dn', '-f', 'null', '-']);
  const v = decodeIssues(r.stderr), s = decodeIssues(a.stderr);
  return {
    ranges: [...String(r.stderr).matchAll(/black_start:\s*([\d.]+)\s+black_end:\s*([\d.]+)/g)].map((m) => [r3(Number(m[1])), r3(Number(m[2]))]),
    decode: { count: v.count + s.count, sample: v.sample || s.sample },
  };
}

// 一格畫面的平均亮度（YAVG，0–255）
export function lumaAt(file, at) {
  const r = run('ffmpeg', ['-hide_banner', '-nostats', '-ss', String(Math.max(0, at)), '-i', file, '-frames:v', '1', '-vf', 'signalstats,metadata=print:key=lavfi.signalstats.YAVG', '-f', 'null', '-']);
  const m = String(r.stderr).match(/lavfi\.signalstats\.YAVG=([\d.]+)/);
  return m ? Math.round(Number(m[1])) : null;
}

function hasVoiceSource(project) {
  if (listFiles(path.join(project, 'assets', 'voice'), [...AUDIO_EXT, ...VIDEO_EXT]).length) return true;
  try { return (JSON.parse(fs.readFileSync(path.join(project, 'work', 'main.json'), 'utf8')).clips || []).some((c) => c.kind === 'voice' || c.kind === 'screen'); } catch { return false; }
}

export function verifyRough(P, { log = console.log } = {}) {
  const work = path.join(P.project, 'work'), proj = posixRel(P.project);
  const rough = path.join(work, 'rough.mp4');
  if (!fs.existsSync(rough)) throw new Error('找不到 work/rough.mp4 → 先照 ng-snap 印的第 2 行輸出初剪');
  const v1File = [path.join(work, 'cuts.v1.json'), path.join(work, 'cuts.v1')].find((f) => fs.existsSync(f));
  if (!v1File) throw new Error('找不到 work/cuts.v1.json → 先跑 ng-snap 印的第 3 行（--export v1 -o work/cuts.v1.json），verify-rough 靠它換回原片的秒數');
  const v1 = readV1(v1File);
  let source = null;
  if (v1.source) {
    const root = path.resolve(P.project, '..', '..');
    source = [path.resolve(v1.source), path.resolve(root, v1.source), path.join(P.project, v1.source)].find((p) => fs.existsSync(p) && fs.statSync(p).isFile()) || null;
  }
  if (!source) source = mainSource(P, null, { normalize: false });
  const info = probeMedia(rough), fps = info.fps || 30, dur = info.duration ?? 0;
  log(`初剪檢查：work/rough.mp4（${fmtC(dur)}，${info.width}×${info.height}，${fps}fps）對照原片 ${posixRel(source)}（用 ${posix(path.relative(P.project, v1File))} 換算秒數）`);
  const scanned = blackRanges(rough);
  if (scanned.decode.count) {
    log(`✖ work/rough.mp4 解碼有錯（${scanned.decode.count} 行，例：${scanned.decode.sample}）→ 檔案壞了（多半是上一次被中途砍掉又重跑）：重新輸出初剪；還是有錯就先跑 node shared/template/tools/media.mjs main --project ${proj} 重接主軌，再重新輸出`);
    return { ok: false, decode: scanned.decode, black: [], rows: [], source };
  }
  const black = mergeBlack(scanned.ranges);
  if (!black.length) { log('✓ work/rough.mp4 沒有黑畫面'); return { ok: true, black: [], rows: [], source }; }
  const voice = hasVoiceSource(P.project);
  const rows = black.map(([a, b]) => {
    const mid = r3((a + b) / 2), at = roughToSource(v1, fps, mid);
    const y = at == null ? null : lumaAt(source, at);
    const bad = y != null && y >= ROUGH.dark;
    return { start: a, end: b, at, luma: y, bad };
  });
  log('  黑畫面（rough.mp4）     長度      原片同位置   原片亮度   判定');
  for (const r of rows) log(`  ${`${fmtC(r.start)}–${fmtC(r.end)}`.padEnd(24)} ${`${(r.end - r.start).toFixed(2)}s`.padEnd(9)} ${(r.at == null ? '—' : fmtC(r.at)).padEnd(12)} ${String(r.luma ?? '—').padEnd(10)} ${r.bad ? '✖ 原片不黑' : '✓ 原片也黑'}`);
  const bad = rows.filter((r) => r.bad);
  if (!bad.length) {
    log(`✓ 黑畫面 ${rows.length} 段，原片同位置也是黑的${voice ? '（只有聲音的素材配的純黑）' : ''}：${rows.map((r) => `${fmtC(r.start)}–${fmtC(r.end)}`).join('、')}`);
    return { ok: true, black, rows, source };
  }
  const total = bad.reduce((s, r) => s + r.end - r.start, 0);
  log(`✖ work/rough.mp4 有 ${bad.length} 段黑畫面（共 ${total.toFixed(1)}s）原片同位置不黑 → 初剪壞了（auto-editor 直接剪手機原檔的已知問題）。剪輯清單不用改，照順序重做：`);
  for (const l of [
    `  1. node shared/template/tools/media.mjs main --project ${proj}`,
    `  2. node shared/template/tools/media.mjs ng-snap --project ${proj}   → 依序跑它印的三行 auto-editor 指令（原片會是 work/main.mp4）`,
    `  3. node shared/template/tools/media.mjs verify-rough --project ${proj}`,
    `  4. node shared/template/tools/media.mjs cutpoints --project ${proj}`,
    `  重做後 rough.mp4 長度和現在（${fmtC(dur)}）差 0.2 秒以內：work/rough.srt 照用；差更多：字幕跑 media.mjs srt-align 重對。`,
  ]) log(l);
  return { ok: false, black, rows, source };
}
