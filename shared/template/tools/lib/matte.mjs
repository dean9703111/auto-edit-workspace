// 人物去背層（025）：模板動畫的填資料規格寫 "matte": true 時（x-wall、x-magazine、x-breakout），build 把那一段的講者去背成
// 帶透明通道的 WebM（npx hyperframes remove-background，模型 u2net_human_seg），疊在動畫上面 → 動畫就在講者後面。
//
//   matteWeights()                               → { file, cached }：去背模型在不在（第一次用要下載約 170 MB，build 不會自己下載）
//   matteRange(it, tm)                           → { start, end } | null：這一段在底片（rough 秒數）的範圍；跨過剪輯台裁掉的地方回傳 null
//   ensureMattes({ outDir, root, items, tm, assetVideo, log, remove }) → { made, reused, problems: [{ id, msg }] }
//       每個要去背的段：assets/matte/<段 id>-<指紋>.webm 在就沿用；不在就切出那一段、去背、寫檔；在 it 上寫 it.matte = { file }
//       remove＝(clip, out) → { ok, message }（測試可以換掉；預設跑 npx hyperframes remove-background）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

export const MATTE = { dir: 'assets/matte', quality: 'balanced', model: 'u2net_human_seg', sizeMb: 170 };
const r3 = (n) => Math.round(n * 1000) / 1000;

export function matteWeights(home = os.homedir()) {
  const file = path.join(home, '.cache', 'hyperframes', 'background-removal', 'models', `${MATTE.model}.onnx`);
  return { file, cached: fs.existsSync(file) };
}

export function matteRange(it, tm) {
  if (!tm || tm.identity) return { start: r3(it.start), end: r3(it.end) };
  const start = tm.unmapStart(it.start), end = tm.unmapEnd(it.end);
  return Math.abs((end - start) - (it.end - it.start)) > 0.05 ? null : { start: r3(start), end: r3(end) };
}

// x-breakout 的相框開口（custom/x-breakout.html 的 script 用同一個算法，兩邊要一樣）：speakerBox＝[x1, y1, x2, y2]
export function breakoutWindow(box) {
  if (!box) return null;
  const [x1, y1, x2, y2] = box, top = y1 + 40, head = Math.round(0.3 * (y2 - y1 - 80));
  return { left: Math.max(120, Math.round(x1) - 20), right: Math.min(1800, Math.round(x2) + 20), bottom: Math.min(880, Math.round(y2)), top0: Math.max(100, top - 40), top1: top + head + 10 };
}
const clipOf = (it, speakerBox, outDir) => {
  if (matteKindOf(it, outDir) !== 'window') return null;
  const w = breakoutWindow(speakerBox);
  return w ? `inset(0px ${1920 - w.right}px ${1080 - w.bottom}px ${w.left}px)` : null;   // 上面不裁：頭要從相框上緣冒出來
};
// 這一段要不要去背：合成檔根元素有 data-matte（"window"＝去背層裁在相框開口裡；其他值＝整張）。套模板、手改過的複本都認得；
// 沒有檔可讀時（測試）看 seg.__matte（custom-fill 照規格的 matte 標的）
const kindCache = new Map();
export function matteKindOf(it, outDir) {
  if (it.type !== 'custom') return null;
  if (it.seg?.__matte) return it.seg.__matte === 'window' ? 'window' : 'full';
  if (!outDir || !it.file) return null;
  const f = path.join(outDir, it.file);
  let st = null;
  try { st = fs.statSync(f); } catch { return null; }
  const k = `${f}:${st.mtimeMs}:${st.size}`;
  if (!kindCache.has(k)) { const m = /<div id="[^"]+" data-composition-id="[^"]+"[^>]*\sdata-matte="([^"]*)"/.exec(fs.readFileSync(f, 'utf8')); kindCache.set(k, m ? (m[1] === 'window' ? 'window' : 'full') : null); }
  return kindCache.get(k);
}
export const matteItems = (items, outDir = null) => (items || []).filter((it) => !!matteKindOf(it, outDir));

function defaultRemove(root) {
  return (clip, out) => {
    const r = spawnSync('npx', ['hyperframes', 'remove-background', clip, '-o', out, '--quality', MATTE.quality], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26, shell: process.platform === 'win32' });
    const ok = r.status === 0 && fs.existsSync(out) && fs.statSync(out).size > 0;
    return { ok, message: ok ? '' : String(r.stderr || r.stdout || r.error?.message || '').trim().split('\n').slice(-2).join(' ') };
  };
}

// 作者測試用（dev/）：環境變數 AUTO_EDIT_MATTE=box 時不跑模型，把畫面中間一個方框當成「人」做出帶透明通道的 WebM（管線、圖層、時間都照走）
function boxRemove(clip, out) {
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', clip, '-f', 'lavfi', '-i', 'color=c=black:s=1920x1080,drawbox=x=700:y=160:w=520:h=920:color=white:t=fill,format=gray',
    '-filter_complex', '[1:v][0:v]scale2ref[m][v];[v][m]alphamerge=shortest=1,format=yuva420p', '-an', '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '36', '-deadline', 'realtime', '-cpu-used', '8', '-auto-alt-ref', '0', out], { encoding: 'utf8' });
  return { ok: r.status === 0 && fs.existsSync(out), message: String(r.stderr).trim().slice(-200) };
}

export function ensureMattes({ outDir, root, items, tm = null, assetVideo, log = () => {}, remove = null, weights = matteWeights(), speakerBox = null }) {
  const list = matteItems(items, outDir), res = { made: 0, reused: 0, problems: [] };
  if (!list.length) return res;
  const dir = path.join(outDir, MATTE.dir);
  fs.mkdirSync(dir, { recursive: true });
  let st = null;
  try { st = fs.statSync(assetVideo); } catch { st = null; }
  if (!remove && process.env.AUTO_EDIT_MATTE === 'box') remove = boxRemove;
  const run = remove || defaultRemove(root);
  const live = new Set();
  for (const it of list) {
    const range = matteRange(it, tm);
    if (!st || !range) { res.problems.push({ id: it.id, msg: !st ? '底片還沒編碼好' : '這一段跨過剪輯台裁掉的地方，沒辦法去背 → 把段的起迄移到同一段連續的畫面裡，或換成不用去背的模板' }); continue; }
    const key = createHash('sha1').update(`${st.size}:${Math.round(st.mtimeMs)}:${range.start}:${range.end}:${MATTE.model}:${MATTE.quality}`).digest('hex').slice(0, 10);
    const name = `${it.id}-${key}.webm`, file = path.join(dir, name);
    live.add(name);
    const clip0 = clipOf(it, speakerBox, outDir);
    if (matteKindOf(it, outDir) === 'window' && !clip0) { res.problems.push({ id: it.id, msg: '這個模板要講者框才知道相框放哪裡，plan.json 還沒有 speakerBox → 先跑 node shared/template/tools/qc.mjs speaker --project <專案> --write，或換一個模板' }); continue; }
    if (fs.existsSync(file) && fs.statSync(file).size > 0) { it.matte = { file: `${MATTE.dir}/${name}`, ...(clip0 ? { clip: clip0 } : {}) }; res.reused++; continue; }
    if (!remove && !weights.cached) {
      res.problems.push({ id: it.id, msg: `去背模型還沒下載（約 ${MATTE.sizeMb} MB，只下載一次）→ 先問使用者；同意就跑 node shared/template/tools/media.mjs matte-setup 再重跑這條 build；不同意就把這一段換成不用去背的模板（15 金句字卡、07 重點字卡）` });
      continue;
    }
    const clip = path.join(dir, `.clip-${it.id}.mp4`);
    log(`去背：${it.id}（${range.start}–${range.end} 秒，${r3(range.end - range.start)} 秒）…`);
    const cut = spawnSync('ffmpeg', ['-y', '-v', 'error', '-ss', String(range.start), '-i', assetVideo, '-t', String(r3(range.end - range.start)), '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '14', '-pix_fmt', 'yuv420p', clip], { encoding: 'utf8' });
    if (cut.status !== 0) { res.problems.push({ id: it.id, msg: `切不出這一段的底片：${String(cut.stderr).trim().slice(-200)}` }); continue; }
    const tmp = path.join(dir, `.tmp-${name}`);
    const r = run(clip, tmp);
    fs.rmSync(clip, { force: true });
    if (!r.ok) { fs.rmSync(tmp, { force: true }); res.problems.push({ id: it.id, msg: `去背失敗：${r.message || '沒有產生檔案'} → 跑 npx hyperframes remove-background --info 看狀態；修不好就把這一段換成不用去背的模板` }); continue; }
    fs.renameSync(tmp, file);
    it.matte = { file: `${MATTE.dir}/${name}`, ...(clip0 ? { clip: clip0 } : {}) };
    res.made++;
  }
  // 同一段舊指紋的檔清掉（work/ 裡的中間產物；別段的不動）
  const ids = new Set(list.map((it) => it.id));
  for (const f of fs.readdirSync(dir)) { const m = /^(.+)-[0-9a-f]{10}\.webm$/.exec(f); if (m && ids.has(m[1]) && !live.has(f)) fs.rmSync(path.join(dir, f), { force: true }); }
  return res;
}
