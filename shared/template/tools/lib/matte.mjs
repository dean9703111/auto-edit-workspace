// 人物去背層（025）：模板動畫的填資料規格寫 "matte": true 時（x-wall、x-magazine、x-breakout），build 把那一段的講者去背成
// 帶透明通道的 WebM（npx hyperframes remove-background，模型 u2net_human_seg），疊在動畫上面 → 動畫就在講者後面。
//
//   matteWeights()                               → { file, cached }：去背模型在不在（第一次用要下載約 170 MB，build 不會自己下載）
//   matteRange(it, tm)                           → { start, end } | null：這一段在底片（rough 秒數）的範圍；跨過剪輯台裁掉的地方回傳 null
//   ensureMattes({ outDir, root, items, tm, assetVideo, log, remove }) → { made, reused, problems: [{ id, msg }] }
//       每個要去背的段：assets/matte/<段 id>-<指紋>.webm 在就沿用；不在就切出那一段、去背、寫檔；在 it 上寫 it.matte = { file }
//       remove＝(clip, out) → { ok, message }（測試可以換掉；預設跑 npx hyperframes remove-background）
//       根元素寫 data-matte="steady" 的段，用真的模型去背完再過一道去背穩定（lib/matte-steady.mjs：講者坐著、椅背這種貼著人的東西
//       一下算進人、一下不算時用）。預設不做：講者站著、整個人會移動時，深色頭髮衣服配深色背景分不出是東西在跳還是人移開了，會誤切。
//       steady: false 一律不做（測試的替身去背也不做）
//       055 C22：每個去背段做完（或沿用）都量一次閃動（只量不改，lib/matte-steady.mjs 的 measureFlicker）：做好的檔裡有整塊一起跳的東西、
//       面積 ≥ 講者框的 FLICKER.minArea → res.warnings 多一則（也用 log 印 ⚠）。量過的檔記在 .cache/matte-flicker.json，同一支不重算。
//       flicker: false 不量（預設和 steady 一樣：測試的替身去背不量）
//   isMatteFlickerLine(line)                     → 這一行是不是去背閃動的 ⚠（build --review 只轉印摘要行，這一種也要轉印）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { r3Round as r3 } from './time.mjs';
import { steadyMatte, measureFlicker, STEADY } from './matte-steady.mjs';

// 去背閃動（055 C22）：整塊一起跳的東西面積 ≥ 講者框的 2% 才報（主宣傳片 s0101 椅子 5.4%、x0105 2.5%；穩定後剩的殘角 ≤ 0.3%；
// 站著的講者手臂晃過身體 ≤ 1.4%）。沒有講者框時拿畫面的一半當講者框。version：量法或門檻改了就加一（快取跟著作廢）
export const FLICKER = { version: 1, minArea: 0.02, cache: '.cache/matte-flicker.json' };
const FLICKER_RE = /^⚠ \S+ (?:寫了 data-matte="steady"，)?去背(?:還)?有一塊在閃/;
export const isMatteFlickerLine = (line) => FLICKER_RE.test(String(line ?? '').trim());

// choke＝去背後邊緣往內收幾 px 再柔化 0.7 px（作者 2026-11-15 短影片4 r5「去背後左側還是有殘留的痕跡」：模型的半透明邊混了原本的深色背景，
// 疊到亮底上變成一圈深色毛邊；2 px 剛好收乾淨，3 px 開始吃到袖口）。只對真的模型做；測試替身不做
export const MATTE = { dir: 'assets/matte', quality: 'balanced', model: 'u2net_human_seg', sizeMb: 170, choke: 2 };

function chokeMatte(src, out, px = MATTE.choke) {
  const ero = Array.from({ length: px }, () => 'erosion').join(',');
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-c:v', 'libvpx-vp9', '-i', src,
    '-filter_complex', `[0:v]format=yuva420p,split[c][a];[a]alphaextract,${ero},gblur=sigma=0.7[m];[c][m]alphamerge,format=yuva420p`,
    '-an', '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '24', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', '-auto-alt-ref', '0', out], { encoding: 'utf8' });
  return { ok: r.status === 0 && fs.existsSync(out) && fs.statSync(out).size > 0, message: String(r.stderr || '').trim().split('\n').slice(-1)[0] };
}

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
  if (matteKindOf(it, outDir) !== 'window') {
    // 046：根元素 data-matte-front 的幾塊範圍裡不放去背層（開洞）→ 那幾塊裡動畫的東西在講者前面（洞裡沒有東西時露出的是底片，同一個講者，看不出差別）
    const front = matteFrontOf(it, outDir);
    return front?.length ? `path(evenodd,'M-9 -9H9999V9999H-9Z${front.map(([x, y, w, h]) => `M${x} ${y}h${w}v${h}h${-w}Z`).join('')}')` : null;
  }
  const w = breakoutWindow(speakerBox);
  return w ? `inset(0px ${1920 - w.right}px ${1080 - w.bottom}px ${w.left}px)` : null;   // 上面不裁：頭要從相框上緣冒出來
};
// 這一段要不要去背：合成檔根元素有 data-matte（"window"＝去背層裁在相框開口裡；其他值＝整張；"steady"＝整張＋去背穩定）。套模板、手改過的複本都認得；
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
  // 根元素（帶 data-composition-id 的那個 div）上的 data-matte：寫在 data-composition-id 前面或後面都認得
  if (!kindCache.has(k)) {
    const html = fs.readFileSync(f, 'utf8'), m = /<div id="[^"]+"(?=[^>]*\sdata-composition-id=)[^>]*\sdata-matte="([^"]*)"/.exec(html);
    kindCache.set(k, m ? (m[1] === 'window' ? 'window' : 'full') : null); steadyCache.set(k, !!m && m[1] === 'steady');
    const fr = m && /<div id="[^"]+"(?=[^>]*\sdata-composition-id=)[^>]*\sdata-matte-front="([^"]*)"/.exec(html);
    frontCache.set(k, fr ? fr[1].split(';').map((s) => s.trim()).filter(Boolean).map((s) => s.split(',').map((v) => Number(v.trim()))) : null);
  }
  return kindCache.get(k);
}
// 這一段哪幾塊範圍要在講者前面：根元素 data-matte-front="x,y,寬,高; x,y,寬,高"（畫面座標）；沒寫回傳 null，寫錯的那一塊留著給 ensureMattes 報
const frontCache = new Map();
const frontOk = (r) => r.length === 4 && r.every(Number.isFinite) && r[2] > 0 && r[3] > 0;
export function matteFrontOf(it, outDir) {
  if (!matteKindOf(it, outDir) || !outDir || !it.file) return null;
  try { const st = fs.statSync(path.join(outDir, it.file)); return frontCache.get(`${path.join(outDir, it.file)}:${st.mtimeMs}:${st.size}`) || null; } catch { return null; }
}
// 這一段要不要做去背穩定：根元素寫 data-matte="steady"
const steadyCache = new Map();
export function matteSteadyOf(it, outDir) {
  if (!matteKindOf(it, outDir) || !outDir || !it.file) return false;
  try { const st = fs.statSync(path.join(outDir, it.file)); return steadyCache.get(`${path.join(outDir, it.file)}:${st.mtimeMs}:${st.size}`) === true; } catch { return false; }
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

export function ensureMattes({ outDir, root, items, tm = null, assetVideo, log = () => {}, remove = null, weights = matteWeights(), speakerBox = null, steady = null, flicker = null }) {
  const list = matteItems(items, outDir), res = { made: 0, reused: 0, problems: [], warnings: [] };
  if (!list.length) return res;
  const dir = path.join(outDir, MATTE.dir);
  fs.mkdirSync(dir, { recursive: true });
  let st = null;
  try { st = fs.statSync(assetVideo); } catch { st = null; }
  if (steady == null) steady = !remove && process.env.AUTO_EDIT_MATTE !== 'box';
  if (flicker == null) flicker = !remove && process.env.AUTO_EDIT_MATTE !== 'box';
  const done = [];   // 做好或沿用的段：最後一起量閃動
  if (!remove && process.env.AUTO_EDIT_MATTE === 'box') remove = boxRemove;
  const run = remove || defaultRemove(root);
  const live = new Set();
  for (const it of list) {
    const range = matteRange(it, tm);
    if (!st || !range) { res.problems.push({ id: it.id, msg: !st ? '底片還沒編碼好' : '這一段跨過剪輯台裁掉的地方，沒辦法去背 → 把段的起迄移到同一段連續的畫面裡，或換成不用去背的模板' }); continue; }
    const wantSteady = steady && matteSteadyOf(it, outDir);
    const wantChoke = !remove && MATTE.choke > 0;
    const key = createHash('sha1').update(`${st.size}:${Math.round(st.mtimeMs)}:${range.start}:${range.end}:${MATTE.model}:${MATTE.quality}${wantSteady ? `:steady${STEADY.version}` : ''}${wantChoke ? `:choke${MATTE.choke}` : ''}`).digest('hex').slice(0, 10);
    const name = `${it.id}-${key}.webm`, file = path.join(dir, name);
    live.add(name);
    if ((matteFrontOf(it, outDir) || []).some((r) => !frontOk(r))) { res.problems.push({ id: it.id, msg: 'data-matte-front 看不懂 → 寫成 "x,y,寬,高"（畫面座標的數字，寬高 > 0），好幾塊用分號隔開，例：data-matte-front="60,560,300,400; 720,560,300,400"' }); continue; }
    const clip0 = clipOf(it, speakerBox, outDir);
    if (matteKindOf(it, outDir) === 'window' && !clip0) { res.problems.push({ id: it.id, msg: '這個模板要講者框才知道相框放哪裡，plan.json 還沒有 speakerBox → 先跑 node shared/template/tools/qc.mjs speaker --project <專案> --write，或換一個模板' }); continue; }
    if (fs.existsSync(file) && fs.statSync(file).size > 0) { it.matte = { file: `${MATTE.dir}/${name}`, ...(clip0 ? { clip: clip0 } : {}) }; res.reused++; done.push({ it, file, range, steady: wantSteady }); continue; }
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
    if (!r.ok) { fs.rmSync(clip, { force: true }); fs.rmSync(tmp, { force: true }); res.problems.push({ id: it.id, msg: `去背失敗：${r.message || '沒有產生檔案'} → 跑 npx hyperframes remove-background --info 看狀態；修不好就把這一段換成不用去背的模板` }); continue; }
    if (wantSteady) {
      // 穩定做不成（ffmpeg 出錯）不擋：照用模型原本的去背
      const tmp2 = path.join(dir, `.tmp2-${name}`);
      const s = steadyMatte({ clip, matte: tmp, out: tmp2 });
      if (s.changed) { fs.renameSync(tmp2, tmp); log(`去背：${it.id} 有貼著人的東西一下算進來、一下不算，已經穩定成整段一致（data-matte="steady"）`); } else { fs.rmSync(tmp2, { force: true }); log(s.ok ? `去背：${it.id} 寫了 data-matte="steady"，但沒有找到整塊一起跳的東西，照用模型原本的結果` : `⚠ 去背：${it.id} 沒辦法做穩定（${s.message}），先用模型原本的結果`); }
    }
    if (wantChoke) {
      // 收邊做不成不擋：照用沒收邊的結果
      const tmp3 = path.join(dir, `.tmp3-${name}`);
      const c = chokeMatte(tmp, tmp3);
      if (c.ok) fs.renameSync(tmp3, tmp); else { fs.rmSync(tmp3, { force: true }); log(`⚠ 去背：${it.id} 邊緣收不了（${c.message}），先用模型原本的結果`); }
    }
    fs.rmSync(clip, { force: true });
    fs.renameSync(tmp, file);
    it.matte = { file: `${MATTE.dir}/${name}`, ...(clip0 ? { clip: clip0 } : {}) };
    res.made++;
    done.push({ it, file, range, steady: wantSteady });
  }
  // 同一段舊指紋的檔清掉（work/ 裡的中間產物；別段的不動）
  const ids = new Set(list.map((it) => it.id));
  for (const f of fs.readdirSync(dir)) { const m = /^(.+)-[0-9a-f]{10}\.webm$/.exec(f); if (m && ids.has(m[1]) && !live.has(f)) fs.rmSync(path.join(dir, f), { force: true }); }
  if (flicker && done.length) {
    for (const w of flickerWarnings({ outDir, done, assetVideo, speakerBox, log })) { res.warnings.push(w); log(`⚠ ${w}`); }
  }
  return res;
}

// 055 C22：量每個去背檔（快取在 outDir/.cache/matte-flicker.json：檔名本身帶指紋，再對大小、時間、量法版本；不在了的檔順手清掉）
function flickerWarnings({ outDir, done, assetVideo, speakerBox, log }) {
  const cacheFile = path.join(outDir, FLICKER.cache);
  let cache = {};
  try { const j = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); if (j.v === FLICKER.version && j.steady === STEADY.version) cache = j.files || {}; } catch { cache = {}; }
  const next = {}, out = [];
  for (const d of done) {
    const name = path.basename(d.file);
    let fst;
    try { fst = fs.statSync(d.file); } catch { continue; }
    const key = `${fst.size}:${Math.round(fst.mtimeMs)}`;
    let m = cache[name]?.key === key ? cache[name].m : null;
    if (!m) {
      const r = measureFlicker({ matte: d.file, video: assetVideo, start: d.range.start, dur: r3(d.range.end - d.range.start) });
      if (!r.ok) { log(`去背閃動檢查：${d.it.id} 量不到（${r.message}），略過`); continue; }
      m = { W: r.W, H: r.H, n: r.n, fps: r.fps, blobs: r.blobs };
    }
    next[name] = { key, m };
    const w = flickerMessage(d.it.id, m, { speakerBox, steady: d.steady });
    if (w) out.push(w);
  }
  try {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, `${JSON.stringify({ v: FLICKER.version, steady: STEADY.version, files: { ...Object.fromEntries(Object.entries(cache).filter(([f]) => fs.existsSync(path.join(outDir, MATTE.dir, f)))), ...next } }, null, 1)}\n`);
  } catch { /* 記不下來只是下次重量 */ }
  return out;
}

// 量到的結果 → ⚠ 一則（沒有夠大的塊回傳 null）。m＝{ W, H, n, fps, blobs }（measureFlicker 的結果）
export function flickerMessage(id, m, { speakerBox = null, steady = false } = {}) {
  const box = Array.isArray(speakerBox) && speakerBox.length === 4 ? speakerBox : null;
  const ref = box ? Math.max(1, (box[2] - box[0]) * (box[3] - box[1])) : (m.W * m.H) / 2;
  const b = (m.blobs || []).find((x) => x.area >= ref * FLICKER.minArea);
  if (!b) return null;
  const fps = (() => { const [a, c] = String(m.fps ?? '30').split('/').map(Number); return a > 0 ? a / (c > 0 ? c : 1) : 30; })();
  const pct = Math.round((100 * b.area) / ref);
  const where = `約${box ? '講者框' : '畫面'}的 ${pct}%，在 x ${b.box[0]}–${b.box[0] + b.box[2]}、y ${b.box[1]}–${b.box[1] + b.box[3]}，段內 ${(b.first / fps).toFixed(1)}–${((b.last + 1) / fps).toFixed(1)} 秒裡跳了 ${b.frames} 格`;
  return steady
    ? `${id} 寫了 data-matte="steady"，去背還有一塊在閃（${where}）→ 看那幾秒的截圖確認；還在閃就換不用去背的版面`
    : `${id} 去背有一塊在閃（${where}）→ 講者坐著不動就把 data-matte 改成 "steady"；站著走動就換不用去背的版面`;
}
