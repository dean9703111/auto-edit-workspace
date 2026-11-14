// 增量輸出：改一段不用整支重 render。只重畫改到的時間窗，視訊 stream copy 接回舊的完成影片；聲音沒變就沿用，有變才重混。零依賴。
// 判定保守：看不懂、或改動不是局部的（kit、片長、字幕樣式、版式、主題、底片、角標…）一律回 full，交給整支 render。
//
//   captureState(P, { quality, fps, hf })   現在的內容（index.html、字幕、每個檔的簽名）；可以存成 JSON（work/.jobs/*-content.json）
//   diffStates(a, b)                        → { full: 原因|null, ranges: [[起, 迄]…], audio: bool, why: […] }
//   planWindows(ranges, keyframes, filmSec) → [[a, b]…]：擴到舊檔的關鍵影格，重疊的併起來，太長的切開（單支 plan 有 2 GB 上限）
//   pruneIndex(html, a, b, { rough })       → { html, removed, media }：只留時間窗的 index.html（時間基準不變，照常 --start/--end）
//   audioOnlyHtml(html)                     → { html, fps, frames } | null：只有聲音的 16×16 空白合成（重混聲音用）；有錄影帶聲音、底片切段時回 null（交給整支）
//   renderIncremental(o)                    → { ok:true, seconds, windows } 或 { full: 原因 }：真的做，成品寫到 o.dest
//   spliceFinal(o)                          接回去並驗證（總格數、時間戳連續、SPS/PPS 相同），不對就丟例外
//   reviewHashes(state, items, o)           → { global, segs }｜null：--review 判斷哪幾段內容沒變（沿用上次的量測和截圖）
//
// 為什麼要精簡專案（實測 31 分鐘片，HyperFrames 0.9.3）：
//   --start/--end 會把專案複製到暫存資料夾再抽影格，快取鍵含路徑所以每次都 miss，30 秒的範圍要抽整支（1009 秒），抽完 plan 資料夾超過 2 GB 就丟 PLAN_TOO_LARGE。
//   精簡後整段 42–65 秒；接好的成品只有重畫的封包不同，對整支 render 逐格 50 dB 以上，AAC 逐位元相同。
//   --start/--end 不理 --workers，要用 PRODUCER_MAX_WORKERS；切塊照權重分 16 塊、每塊重開 Chrome，所以 root 拉長（MIN_ROOT）讓窗內只剩 1–2 塊。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { r3 } from './time.mjs';

export const MAX_DIRTY_SHARE = 0.4;   // 要重畫的超過片長四成：整支重來比較划算
export const MAX_WINDOW_SEC = 120;    // 單一時間窗的上限（plan 資料夾上限 2 GB，影格最多約 400 KB）
export const MIN_ROOT_SEC = 2000;     // root 拉長到這麼久：切塊每塊都到 3600 格上限，窗內只剩 1–2 塊
export const WINDOW_PAD = 1;          // 時間窗前後多留的秒數（段落的進退場）
export const KEYFRAME_SEC = 8;        // 片段的關鍵影格間隔（不設的話片段只有第一格是關鍵影格，之後不好 seek）
export const AUDIO_COMP = 'compositions/inc-audio.html';

const sha = (b) => createHash('sha1').update(b).digest('hex').slice(0, 16);
const TEXT_EXT = new Set(['.html', '.css', '.js', '.mjs', '.json', '.srt', '.svg', '.txt', '.cube']);
const ROOT_FILES = ['hyperframes.json', 'meta.json', 'fx-kit.js'];
const RENDER_DIRS = ['compositions', 'kit', 'assets', 'illus-local'];
export const NOT_IN_FINAL = /^compositions\/(?:test-clip|captions-test|capcut-[^/]+|inc-audio|final-nocaps)\.html$/;   // 測試片段、剪映素材、重混聲音、不燒字幕的合成不進完成影片的指紋
const statOf = (f) => { try { return fs.statSync(f); } catch { return null; } };

function listFiles(root, rel = '') {
  let names;
  try { names = fs.readdirSync(path.join(root, rel)).sort(); } catch { return []; }
  const out = [];
  for (const name of names) {
    if (name.startsWith('.')) continue;
    const r = rel ? `${rel}/${name}` : name;
    const st = statOf(path.join(root, r));
    if (st?.isDirectory()) out.push(...listFiles(root, r));
    else if (st) out.push(r);
  }
  return out;
}

// 簽名：文字檔算內容；影片、圖片、音效算大小＋修改時間（和 contentFingerprint 同一個判準）
function fileSig(file) {
  const st = statOf(file);
  if (!st) return null;
  return TEXT_EXT.has(path.extname(file).toLowerCase()) && st.size < 16 * 1024 * 1024 ? sha(fs.readFileSync(file)) : `${st.size}:${Math.floor(st.mtimeMs)}`;
}

export function captureState(P, { quality = '', fps = 0, hf = '' } = {}) {
  const sigs = {};
  for (const f of ROOT_FILES) { const s = fileSig(path.join(P.out, f)); if (s) sigs[f] = s; }
  for (const d of RENDER_DIRS) for (const f of listFiles(P.out, d)) if (!NOT_IN_FINAL.test(f)) sigs[f] = fileSig(path.join(P.out, f));
  const read = (f) => { try { return fs.readFileSync(path.join(P.out, f), 'utf8'); } catch { return null; } };
  return { v: 1, quality, fps, hf, index: read('index.html'), captions: read('compositions/captions.html'), sigs };
}

export const readState = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
export function writeState(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(state));
  fs.renameSync(`${file}.tmp`, file);
}

// ---------- 讀懂 index.html ----------

const VOID = new Set(['img', 'br', 'hr', 'meta', 'link', 'input', 'source', 'area', 'base', 'col', 'embed', 'track', 'wbr']);

// 從 at（'<' 的位置）讀一個標籤：屬性值裡的 > 不算結束
function readTag(html, at) {
  if (html.startsWith('<!--', at)) { const e = html.indexOf('-->', at); return { comment: true, end: e < 0 ? html.length : e + 3 }; }
  const close = html[at + 1] === '/';
  const m = /^[a-zA-Z][\w:-]*/.exec(html.slice(at + (close ? 2 : 1), at + 40));
  if (!m) return null;
  let i = at + (close ? 2 : 1) + m[0].length, q = null;
  for (; i < html.length; i++) {
    const c = html[i];
    if (q) { if (c === q) q = null; } else if (c === '"' || c === "'") q = c; else if (c === '>') break;
  }
  return { name: m[0].toLowerCase(), close, self: html[i - 1] === '/', end: i + 1, open: html.slice(at, i + 1) };
}

// [from, to) 的直接子節點：{ tag, id, open, start, end }；html.slice(start, end)＝整個元素
function scanChildren(html, from, to) {
  const out = [];
  let i = from, depth = 0, cur = null;
  while (i < to) {
    const lt = html.indexOf('<', i);
    if (lt < 0 || lt >= to) break;
    const t = readTag(html, lt);
    if (!t) { i = lt + 1; continue; }
    if (t.comment) { i = t.end; continue; }
    if (t.close) {
      depth--;
      if (depth === 0 && cur) { cur.end = t.end; out.push(cur); cur = null; }
      if (depth < 0) throw new Error('標籤對不起來');
      i = t.end;
      continue;
    }
    const leaf = t.self || VOID.has(t.name);
    if (depth === 0) {
      const node = { tag: t.name, id: /\sid="([^"]*)"/.exec(t.open)?.[1] ?? null, open: t.open, start: lt, end: t.end };
      if (leaf) out.push(node); else cur = node;
    }
    if (!leaf) {
      depth++;
      if (t.name === 'script' || t.name === 'style') {   // 內容不當標籤讀
        const e = html.indexOf(`</${t.name}>`, t.end);
        if (e < 0) throw new Error(`<${t.name}> 沒有結束`);
        i = e;
        continue;
      }
    }
    i = t.end;
  }
  if (depth !== 0 || cur) throw new Error('標籤對不起來');
  return out;
}

// 元素自己和底下所有 data-start／data-duration 的時間範圍；沒有就回 null
function timeOf(outer) {
  let lo = Infinity, hi = -Infinity;
  for (const m of outer.matchAll(/<[a-zA-Z][^<>]*?\sdata-start="(-?[\d.]+)"[^<>]*>/g)) {
    const s = Number(m[1]), d = Number(/\sdata-duration="([\d.]+)"/.exec(m[0])?.[1] ?? 0);
    lo = Math.min(lo, s);
    hi = Math.max(hi, s + d);
  }
  return Number.isFinite(lo) ? [lo, hi] : null;
}

// data-track-index 只給時間軸介面看，render 不讀（HyperFrames 文件）：新增一段時後面的都會變號，不算改動
const normTag = (s) => s.replace(/\s+data-track-index="\d+"/g, '').replace(/\s+/g, ' ').trim();
const idsIn = (outer) => [...outer.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
const BAND = /^tx\d+[ab]$/;

// 拆開 index.html；看不懂丟例外（呼叫端當成 full）
export function parseIndex(html) {
  if (typeof html !== 'string') throw new Error('沒有 index.html');
  const bodyAt = html.indexOf('<body');
  const rootOpen = /<div\s[^>]*data-composition-id="main"[^>]*>/.exec(html);
  if (bodyAt < 0 || !rootOpen) throw new Error('index.html 不是 build 產生的主合成');
  const rootStart = rootOpen.index, rootBodyAt = rootStart + rootOpen[0].length;
  const scriptAt = html.indexOf('<script>', rootBodyAt);
  if (scriptAt < 0) throw new Error('index.html 沒有時間軸');
  const closeAt = html.lastIndexOf('</div>', scriptAt);
  if (closeAt < rootBodyAt) throw new Error('index.html 的 root 對不起來');
  const nodes = scanChildren(html, rootBodyAt, closeAt);
  const rootDur = Number(/\sdata-duration="([\d.]+)"/.exec(rootOpen[0])?.[1]);
  if (!Number.isFinite(rootDur) || rootDur <= 0) throw new Error('讀不到片長');
  // 句子時間（綁句表）從 head 拿出來另外比
  const headRaw = html.slice(0, bodyAt);
  let cues = null;
  const head = headRaw.replace(/<script>window\.__cues = ([\s\S]*?);<\/script>/, (m, j) => { try { cues = JSON.parse(j); } catch { throw new Error('讀不懂綁句表'); } return '<cues/>'; });
  const script = html.slice(scriptAt, html.indexOf('</script>', scriptAt));
  const lines = script.split('\n').map((l) => l.trim()).filter(Boolean);
  const isTween = (l) => /^(?:tl|P|M)\.\w+\(|^\{ const M = |^MediaKit\.\w+\(/.test(l);
  const tweens = lines.filter(isTween).map((l) => l.replace(/#tx\d+([ab])/g, '#tx$1'));
  const shell = lines.filter((l) => !isTween(l) && l !== '}').join('\n');   // 其他腳本（宣告、收尾）；「}」是錄影段區塊的結尾，段數變了不算
  return { html, head, cues, nodes, rootOpen: rootOpen[0], rootStart, rootBodyAt, closeAt, scriptAt, rootDur, script, tweens, shell };
}

// 頂層節點分類：timed＝有時間的（段落、子母畫面、錄影段…）；audios＝會出聲的標籤；rest＝其他（比全文，變了就整支）
function classify(p, sigs) {
  const timed = new Map(), owner = new Map(), audios = [], rest = [];
  let footage = '', capHost = null;
  for (const n of p.nodes) {
    const outer = p.html.slice(n.start, n.end);
    if (n.id && BAND.test(n.id)) continue;   // 轉場色帶靠 tween 動，編號會隨前面的段變：比 tween，不比元素
    if (n.tag === 'audio') { audios.push(normTag(outer)); continue; }
    if (n.id === 'footage') { footage = normTag(outer); continue; }
    if (n.id === 'el-captions') { capHost = normTag(n.open); continue; }
    const t = n.id === 'chb' ? null : timeOf(outer);
    if (!t) { rest.push(normTag(outer)); continue; }
    // 段落內容：host 標籤＋合成檔；錄影段用到的素材也算進去（換了素材就是這段髒）
    const refs = [...outer.matchAll(/\s(?:data-composition-src|src)="([^"]+)"/g)].map((m) => m[1]).filter((f) => f !== 'assets/rough.mp4');
    const extra = refs.map((f) => `${f}=${sigs?.[f] ?? ''}`).join('|');
    const key = n.id ?? `@${sha(normTag(outer))}`;
    timed.set(key, { start: t[0], end: t[1], sig: sha(`${normTag(outer)}\n${extra}`), refs, files: refs.filter((f) => f.startsWith('compositions/')) });
    for (const id of idsIn(outer)) owner.set(id, key);
    for (const v of outer.matchAll(/<video\s[^>]*data-has-audio="true"[^>]*>/g)) audios.push(normTag(v[0]));
  }
  return { timed, owner, audios: audios.sort(), rest: rest.join('\n'), footage, capHost };
}

// 字幕：整份的殼（樣式、結構）＋一則一則（文字＋開關時間）；編號會隨前面的句子變，比內容不比編號
function parseCaptions(text) {
  if (text == null) return null;
  const items = new Map();
  for (const m of text.matchAll(/<div class="cg" id="(cg-\d+)"[^>]*>([\s\S]*?)<\/div>/g)) items.set(m[1], { text: m[2], times: [] });
  for (const m of text.matchAll(/tl\.set\('#(cg-\d+)',[^;]*?,\s*([\d.]+)\);/g)) items.get(m[1])?.times.push(Number(m[2]));
  const shell = text.replace(/<div class="cg"[\s\S]*?<\/div>\n?/g, '').replace(/^\s*tl\.set\('#cg-\d+'.*$\n?/gm, '').replace(/<!--[\s\S]*?-->/g, '');
  const keys = new Map();
  for (const it of items.values()) keys.set(`${it.text}|${it.times.join(',')}`, it);
  return { shell, keys };
}

const addRange = (ranges, a, b) => { if (Number.isFinite(a) && Number.isFinite(b)) ranges.push([Math.min(a, b), Math.max(a, b)]); };
function mergeRanges(ranges) {
  const out = [];
  for (const r of [...ranges].sort((p, q) => p[0] - q[0])) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1] + 1e-6) last[1] = Math.max(last[1], r[1]); else out.push([...r]);
  }
  return out;
}

const PERSISTENT = /#footage|#chb|#edit-|getElementById\('(?:footage|chb)/;   // 這些元素的狀態會往後延續，改了影響到不知道哪裡

// 兩份內容差在哪。full 不是 null＝要整支重 render，字串是給人看的原因
export function diffStates(a, b) {
  const why = [];
  const full = (reason) => ({ full: reason, ranges: [], audio: true, why });
  if (!a || !b) return full('沒有上次輸出時的內容紀錄');
  if (a.v !== b.v || a.quality !== b.quality || a.fps !== b.fps || a.hf !== b.hf) return full('畫質、fps 或 HyperFrames 版本變了');
  let A, B;
  try { A = parseIndex(a.index); B = parseIndex(b.index); } catch (e) { return full(`看不懂 index.html（${e.message}）`); }
  if (A.head !== B.head) return full('版式、主題或 <head> 變了');
  if (A.rootDur !== B.rootDur) return full(`片長變了（${A.rootDur} → ${B.rootDur} 秒），後面的影格全部位移`);
  if (A.rootOpen !== B.rootOpen) return full('畫布設定變了');
  if (A.shell !== B.shell) return full('主時間軸的腳本變了');
  // 全域檔：kit、背景圖、音效、底片。錄影素材（assets/media）算在用到它的段落上
  const keys = new Set([...Object.keys(a.sigs || {}), ...Object.keys(b.sigs || {})]);
  const changedComps = [], changedMedia = [];
  for (const k of keys) {
    if (a.sigs?.[k] === b.sigs?.[k]) continue;
    if (k.startsWith('compositions/')) changedComps.push(k);
    else if (k.startsWith('assets/media/') || k.startsWith('assets/shots/')) { if (a.sigs?.[k] != null && b.sigs?.[k] != null) changedMedia.push(k); }   // 新增、拿掉的檔：有用到的段一定也變了
    else if (!(k.startsWith('illus-local/') && a.sigs?.[k] == null)) return full(`${k} 變了`);   // 新畫的線稿：舊內容沒用到它
  }
  const CA = classify(A, a.sigs), CB = classify(B, b.sigs);
  if (CA.rest !== CB.rest) return full('章節角標或其他常駐元素變了');
  if (CA.footage !== CB.footage) return full('底片的時間變了');
  if (CA.capHost !== CB.capHost) return full('字幕的設定變了');
  // 改了的合成檔一定要對得到頂層的段落；對不到（巢狀合成）就不知道影響到哪裡
  const hostFiles = new Set([...CA.timed.values(), ...CB.timed.values()].flatMap((t) => t.files));
  const capFile = 'compositions/captions.html';
  for (const c of changedComps) if (c !== capFile && !hostFiles.has(c)) return full(`${c} 變了，但沒有對應的段落`);
  // 同名換了內容的素材：index.html 直接引用的算在那段（簽名有帶到），合成檔裡引用的不知道是哪一段
  const hostRefs = new Set([...CA.timed.values(), ...CB.timed.values()].flatMap((t) => t.refs));
  for (const k of changedMedia) if (!hostRefs.has(k)) return full(`${k} 換了內容，但沒有對應的段落`);
  const ranges = [];
  // 段落：內容或時間不同 → 舊時段＋新時段都算髒
  for (const id of new Set([...CA.timed.keys(), ...CB.timed.keys()])) {
    const x = CA.timed.get(id), y = CB.timed.get(id);
    if (x && y && x.sig === y.sig) continue;
    for (const e of [x, y]) if (e) addRange(ranges, e.start, e.end);
    why.push(`${id.replace(/^el-/, '')} ${x && y ? '改了' : x ? '刪了' : '新增'}`);
  }
  // 主時間軸：tween 差集（多重集合）
  const count = (list) => { const m = new Map(); for (const l of list) m.set(l, (m.get(l) || 0) + 1); return m; };
  const ca = count(A.tweens), cb = count(B.tweens);
  const changed = [];
  for (const [l, n] of ca) if ((cb.get(l) || 0) < n) changed.push([l, CA]);
  for (const [l, n] of cb) if ((ca.get(l) || 0) < n) changed.push([l, CB]);
  for (const [l, C] of changed) {
    if (PERSISTENT.test(l)) return full('底片運鏡、章節角標或過黑的動畫變了');
    const ids = [...l.matchAll(/(?:#|getElementById\(')([\w-]+)/g)].map((m) => m[1]).filter((id) => !/^tx[ab]$/.test(id));
    const bandOnly = !ids.length && /#tx[ab]/.test(l);
    if (bandOnly || ids.every((id) => C.owner.has(id) || CA.owner.has(id) || CB.owner.has(id))) {
      const pos = /,\s*(-?[\d.]+)\);\s*$/.exec(l)?.[1], dur = /duration:\s*([\d.]+)/.exec(l)?.[1];
      if (/stagger|repeat/.test(l)) return full('動畫的時間讀不懂（stagger／repeat）');
      if (bandOnly) {
        if (pos == null) return full('轉場色帶的時間讀不懂');
        addRange(ranges, Number(pos), Number(pos) + Number(dur || 0));
      }
      for (const id of ids) for (const K of [CA, CB]) { const t = K.timed.get(K.owner.get(id)); if (t) addRange(ranges, t.start, t.end); }
    } else return full('動畫改到不認得的元素');
  }
  // 綁句表：段落的（包含 P.at 算好的秒數）、句子的（時間變了，有用到的段落也可能變）
  const ca2 = A.cues, cb2 = B.cues;
  if (JSON.stringify(ca2) !== JSON.stringify(cb2)) {
    const segsA = ca2?.segs || {}, segsB = cb2?.segs || {};
    for (const id of new Set([...Object.keys(segsA), ...Object.keys(segsB)])) {
      if (JSON.stringify(segsA[id]) === JSON.stringify(segsB[id])) continue;
      for (const s of [segsA[id], segsB[id]]) if (s) addRange(ranges, s.start, s.start + s.D);
      why.push(`${id} 綁句變了`);
    }
    const cuesA = ca2?.cues || {}, cuesB = cb2?.cues || {};
    for (const n of new Set([...Object.keys(cuesA), ...Object.keys(cuesB)])) {
      if (JSON.stringify(cuesA[n]) === JSON.stringify(cuesB[n])) continue;
      for (const c of [cuesA[n], cuesB[n]]) {
        if (!c) continue;
        addRange(ranges, c[0], c[1]);
        for (const segs of [segsA, segsB]) for (const s of Object.values(segs)) if (s.start < c[1] && s.start + s.D > c[0]) addRange(ranges, s.start, s.start + s.D);
      }
      why.push(`第 ${n} 句時間變了`);
    }
  }
  // 字幕：一則一則
  const capA = parseCaptions(a.captions), capB = parseCaptions(b.captions);
  if ((capA == null) !== (capB == null)) return full('字幕加上或拿掉了');
  if (capA && capB) {
    if (capA.shell !== capB.shell) return full('字幕的樣式或結構變了');
    for (const [k, it] of capA.keys) if (!capB.keys.has(k) && it.times.length) { addRange(ranges, Math.min(...it.times), Math.max(...it.times)); why.push(`字幕「${it.text.replace(/<[^>]+>/g, '').slice(0, 10)}」`); }
    for (const [k, it] of capB.keys) if (!capA.keys.has(k) && it.times.length) addRange(ranges, Math.min(...it.times), Math.max(...it.times));
  }
  const audio = CA.audios.join('\n') !== CB.audios.join('\n') || CA.footage !== CB.footage;
  if (audio) why.push('音效');
  return { full: null, ranges: mergeRanges(ranges), audio, why };
}

// ---------- 定稿（--review）重用 ----------

// 整支共用的雜湊（global）＋每段的雜湊（segs）：沒變的段不用重量、重截。寧可多重算：這段時間內看得到的一切
// （疊在上面的段、子母畫面、字幕、動畫、綁句、合成檔用到的素材與線稿、plan 那段、分鏡表那段）有一個變了就算變；kit、背景、底片、模板、plan 其他欄變了全部重來。看不懂回 null
// readComp(檔名)：合成檔的文字（找它引用的素材）
export function reviewHashes(state, items, { scenes = [], sheets = {}, extra = {}, readComp = () => '' } = {}) {
  let p, c, cap;
  try { p = parseIndex(state.index); c = classify(p, state.sigs); cap = parseCaptions(state.captions); } catch { return null; }
  const byOwner = new Map(), bands = [], persistent = [];
  for (const l of p.tweens) {
    const ids = [...l.matchAll(/(?:#|getElementById\(')([\w-]+)/g)].map((m) => m[1]).filter((id) => !/^tx[ab]$/.test(id));
    if (!ids.length) { if (/#tx[ab]/.test(l)) bands.push(l); else persistent.push(l); continue; }
    const owners = new Set(ids.map((id) => c.owner.get(id)));
    if (owners.has(undefined)) { persistent.push(l); continue; }
    for (const o of owners) { if (!byOwner.has(o)) byOwner.set(o, []); byOwner.get(o).push(l); }
  }
  const hosted = new Set([...c.timed.values()].flatMap((t) => t.files));
  const perSeg = (k) => hosted.has(k) || k === 'compositions/captions.html' || k.startsWith('assets/media/') || k.startsWith('assets/shots/') || k.startsWith('illus-local/');   // 字幕：殼算共用（cap.shell），一則一則算在那個時間的段
  const common = Object.entries(state.sigs || {}).filter(([k]) => !perSeg(k)).sort((x, y) => (x[0] < y[0] ? -1 : 1));   // 沒對應段落的合成檔算共用
  const usedBy = (f) => [...String(readComp(f)).matchAll(/(?:assets\/media|illus-local)\/[^"'\s)]+/g)].map((m) => `${m[0]}=${state.sigs?.[m[0]] ?? ''}`);
  const global = sha(JSON.stringify([state.hf, p.head, p.rootOpen, p.shell, c.rest, c.footage, c.capHost, cap?.shell ?? null, common, persistent, extra]));
  const segs = {};
  const sceneOf = new Map(scenes.map((x) => [x.id, x]));
  for (const it of items) {
    const o = it.out || it, s = Number(o.start), e = Number(o.end);
    const parts = [JSON.stringify(sceneOf.get(it.id) ?? null), JSON.stringify(it), JSON.stringify(sheets[it.id] ?? null), JSON.stringify(p.cues?.segs?.[it.id] ?? null)];
    const hit = (a, b) => a < e + 0.01 && b > s - 0.01;
    for (const [id, t] of c.timed) if (hit(t.start, t.end)) parts.push(id, t.sig, ...(byOwner.get(id) || []), ...t.files.flatMap(usedBy));
    for (const l of bands) { const pos = Number(/,\s*(-?[\d.]+)\);\s*$/.exec(l)?.[1]), dur = Number(/duration:\s*([\d.]+)/.exec(l)?.[1] || 0); if (!Number.isFinite(pos) || hit(pos, pos + dur)) parts.push(l); }
    if (cap) for (const [k, x] of cap.keys) if (x.times.length && hit(Math.min(...x.times), Math.max(...x.times))) parts.push(k);
    for (const [n, c2] of Object.entries(p.cues?.cues || {})) if (hit(c2[0], c2[1])) parts.push(n, String(c2));
    segs[it.id] = sha(parts.join('\n'));
  }
  return { global, segs };
}

// ---------- 時間窗 ----------

// keyframes：舊檔的關鍵影格（秒，由小到大，含 0）。回傳要重畫的 [a, b)：a、b 都落在關鍵影格（或片尾）
export function planWindows(ranges, keyframes, filmSec, { maxWindow = MAX_WINDOW_SEC } = {}) {
  const spans = [];
  const eps = 1e-6;
  for (const [a0, b0] of mergeRanges(ranges)) {
    const a = Math.max(0, a0), b = Math.min(filmSec, b0);
    if (b <= a) continue;
    let lo = 0, hi = filmSec;
    for (const k of keyframes) { if (k <= a + eps) lo = k; if (k >= b - eps) { hi = k; break; } }
    const last = spans[spans.length - 1];
    if (last && lo <= last[1] + eps) last[1] = Math.max(last[1], hi); else spans.push([lo, hi]);
  }
  const out = [];
  for (const [a, b] of spans) {
    let s = a;
    while (b - s > maxWindow + eps) {
      const cut = keyframes.filter((k) => k > s + eps && k <= s + maxWindow + eps).pop();
      if (cut == null) break;
      out.push([s, cut]);
      s = cut;
    }
    out.push([s, b]);
  }
  return out;
}

// ---------- 只留時間窗的 index.html ----------

const overlaps = (t, a, b, pad) => t[0] < b + pad && t[1] > a - pad;

// rough：{ file: 'assets/rough.mp4', offset: K }＝底片換成從 K 秒開始的節錄，data-media-start 要扣掉 K
export function pruneIndex(html, a, b, { pad = WINDOW_PAD, minRoot = MIN_ROOT_SEC, offset = 0 } = {}) {
  const p = parseIndex(html);
  const removed = new Set();
  const kept = [];
  for (const n of p.nodes) {
    const outer = html.slice(n.start, n.end);
    if (n.tag === 'audio') continue;
    const t = n.id === 'chb' || n.id === 'el-captions' || n.id === 'footage' ? null : timeOf(outer);
    if (t && !overlaps(t, a, b, pad)) {
      // 錄影段的時間軸有 SceneMotion 綁元素（拿掉 DOM 會出錯）：留著元素，只拿掉影片（窗外本來就看不到）
      if (/\sclass="mlayer"/.test(n.open)) { kept.push(outer.replace(/<video\s[^>]*><\/video>\s*/g, '')); continue; }
      if (n.id) { removed.add(n.id); for (const id of idsIn(outer)) removed.add(id); }
      continue;
    }
    kept.push(n.id === 'footage' ? pruneFootage(outer, a, b, pad) : outer);
  }
  // 留下的影片一律靜音（聲音另外處理）
  let body = kept.join('\n').replace(/\s+data-has-audio="true"/g, ' muted').replace(/\s+data-(?:volume|fade-in|fade-out)="[^"]*"/g, '');
  if (offset) body = shiftRoughMedia(body, offset);
  const lines = html.slice(p.scriptAt, html.indexOf('</script>', p.scriptAt)).split('\n');
  const script = [];
  for (const raw of lines) {
    const l = raw.trim();
    const m = /^tl\.(?:fromTo|to|set)\('([^']+)'/.exec(l);
    if (!m) { script.push(raw); continue; }
    const ids = m[1].split(',').map((x) => x.trim().replace(/^#/, ''));
    if (ids.every((id) => BAND.test(id))) {   // 色帶：窗外的不用
      const pos = Number(/,\s*(-?[\d.]+)\);\s*$/.exec(l)?.[1]), dur = Number(/duration:\s*([\d.]+)/.exec(l)?.[1] || 0);
      if (Number.isFinite(pos) && (pos > b + pad || pos + dur < a - pad)) continue;
      script.push(raw);
      continue;
    }
    if (ids.every((id) => removed.has(id))) continue;
    const left = ids.filter((id) => !removed.has(id));
    script.push(left.length === ids.length ? raw : raw.replace(m[1], left.map((id) => `#${id}`).join(', ')));
  }
  const rootOpen = p.rootOpen.replace(/(\sdata-duration=")[\d.]+"/, `$1${Math.max(p.rootDur, minRoot)}"`);
  const tail = script.join('\n').replace(/tl\.set\(\{\}, \{\}, [\d.]+\);(\s*window\.__timelines\['main'\])/, `tl.set({}, {}, ${Math.max(p.rootDur, minRoot)});$1`);
  const out = `${html.slice(0, p.rootStart)}${rootOpen}\n${body}\n</div>\n${tail}${html.slice(html.indexOf('</script>', p.scriptAt))}`;
  return { html: out, removed: removed.size, kept: kept.length };
}

// 底片切成只剩時間窗：抽影格只抽這段（<video> 可能有好幾支：有 edit.cuts 時）
function pruneFootage(outer, a, b, pad) {
  return outer.replace(/<video\s[^>]*><\/video>/g, (tag) => {
    const s = Number(/\sdata-start="([\d.]+)"/.exec(tag)?.[1]), d = Number(/\sdata-duration="([\d.]+)"/.exec(tag)?.[1]);
    const ms = Number(/\sdata-media-start="([\d.]+)"/.exec(tag)?.[1] ?? 0);
    const e = s + d;
    if (!(s < b + pad && e > a - pad)) return '';
    const ns = Math.max(s, a - pad), ne = Math.min(e, b + pad);
    let t = tag.replace(/\sdata-start="[\d.]+"/, ` data-start="${r3(ns)}"`).replace(/\sdata-duration="[\d.]+"/, ` data-duration="${r3(ne - ns)}"`);
    const nm = r3(ms + (ns - s));
    t = /\sdata-media-start=/.test(t) ? t.replace(/\sdata-media-start="[\d.]+"/, ` data-media-start="${nm}"`) : t.replace(/\sdata-duration="[^"]*"/, (x) => `${x} data-media-start="${nm}"`);
    return t;
  });
}

const ROUGH_SRC = 'assets/rough.mp4';
// 換成節錄的底片：所有 rough.mp4 的 data-media-start 扣掉節錄的起點
function shiftRoughMedia(body, offset) {
  return body.replace(/<video\s[^>]*src="assets\/rough\.mp4"[^>]*>/g, (tag) => {
    const ms = Number(/\sdata-media-start="([\d.]+)"/.exec(tag)?.[1] ?? 0);
    // 不能四捨五入到毫秒：起點常常正好在影格邊界上，差 0.3 毫秒就抽到隔壁格
    const nm = +(ms - offset).toFixed(6);
    return /\sdata-media-start=/.test(tag) ? tag.replace(/\sdata-media-start="[\d.]+"/, ` data-media-start="${nm}"`) : tag.replace(/\ssrc="[^"]*"/, (x) => `${x} data-media-start="${nm}"`);
  });
}

// 精簡後的 index.html 用到底片的哪一段（秒）；沒用到回 null
export function roughSpan(html) {
  let lo = Infinity, hi = -Infinity;
  for (const m of html.matchAll(/<video\s[^>]*src="assets\/rough\.mp4"[^>]*>/g)) {
    const ms = Number(/\sdata-media-start="([\d.]+)"/.exec(m[0])?.[1] ?? 0), d = Number(/\sdata-duration="([\d.]+)"/.exec(m[0])?.[1] ?? 0);
    lo = Math.min(lo, ms);
    hi = Math.max(hi, ms + d);
  }
  return Number.isFinite(lo) ? [lo, hi] : null;
}

// ---------- 只有聲音的合成 ----------

const gcd = (x, y) => (y ? gcd(y, x % y) : x);
// 聲音會裁／補到 frames/fps：f＝30/gcd(N,30) 讓 frames/f 正好等於片長。放在 compositions/（和 test-clip 一樣），路徑前面加 ../
// 只支援「一支底片＋<audio>」：錄影段帶聲音、底片切段（edit.cuts）時 HyperFrames 混音的細節對不上保證不了，回 null
export function audioOnlyHtml(html) {
  const p = parseIndex(html);
  const audios = [];
  let foot = null, audible = 0;
  for (const n of p.nodes) {
    const outer = html.slice(n.start, n.end);
    if (n.tag === 'audio') { audios.push(outer); continue; }
    const vids = [...outer.matchAll(/<video\s[^>]*>/g)].map((m) => m[0]).filter((v) => /\sdata-has-audio="true"/.test(v) && !/\smuted\b/.test(v));
    if (!vids.length) continue;
    audible += vids.length;
    if (n.id === 'footage' && vids.length === 1) foot = vids[0];
  }
  if (audible > 1 || !foot) return audible === 0 ? buildAudioHtml(audios, null, p.rootDur) : null;
  if (/\sdata-(?:volume|fade-in|fade-out|media-start)=/.test(foot)) return null;
  return buildAudioHtml(audios, foot, p.rootDur);
}

function buildAudioHtml(audios, foot, D) {
  const N = Math.round(D * 30);
  if (Math.abs(N / 30 - D) > 0.002) return null;
  const fps = 30 / gcd(N, 30);
  const rel = (tag) => tag.replace(/\ssrc="(?!\.\.\/)/, ' src="../');
  const footTag = foot ? [rel(foot.replace(/^<video/, '<audio').replace(/\s+data-has-audio="true"/, '').replace(/\s+playsinline/, '').replace(/\s*>$/, '>')).replace(/\s+/g, ' ') + '</audio>'] : [];
  const html = `<!doctype html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=16, height=16">
<script src="../kit/gsap.min.js"></script><style>body{margin:0;background:#000}#audio-root{position:relative;width:16px;height:16px;overflow:hidden;background:#000}</style></head>
<body>
<div id="audio-root" data-composition-id="inc-audio" data-start="0" data-duration="${D}" data-width="16" data-height="16" data-fps="${fps}">
${[...footTag, ...audios.map(rel)].join('\n')}
</div>
<script>(function(){window.__timelines=window.__timelines||{};const tl=gsap.timeline({paused:true});tl.set({}, {}, ${D});window.__timelines['inc-audio']=tl;})();</script>
</body></html>
`;
  return { html, fps, frames: Math.round(D * fps) };
}

// ---------- 接回去 ----------

async function probeJson(run, args, cwd) {
  const r = await run('ffprobe', ['-v', 'error', ...args, '-of', 'json'], { cwd });
  if (r.code !== 0) throw new Error(`ffprobe 失敗：${String(r.stderr).slice(-200)}`);
  return JSON.parse(r.stdout);
}

async function videoInfo(run, file) {
  const j = await probeJson(run, ['-select_streams', 'v:0', '-show_entries', 'stream=time_base,extradata_hash', '-show_data_hash', 'md5', file]);
  const s = j.streams?.[0];
  if (!s) throw new Error(`${path.basename(file)} 沒有影像`);
  const [n, d] = String(s.time_base).split('/').map(Number);
  return { num: n, den: d, tb: n / d, extra: s.extradata_hash ?? null };
}

// [{ pts, key }]（整數，單位 time_base）
async function packetsOf(run, file) {
  const r = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=pts,flags', '-of', 'csv=p=0', file], {});
  if (r.code !== 0) throw new Error(`ffprobe 失敗：${String(r.stderr).slice(-200)}`);
  const out = [];
  for (const l of String(r.stdout).split('\n')) {
    const [pts, flags] = l.trim().split(',');
    if (pts && /^-?\d+$/.test(pts)) out.push({ pts: Number(pts), key: !!flags?.includes('K') });
  }
  return out;
}

export async function keyframesOf(run, file) {
  const info = await videoInfo(run, file);
  const pk = await packetsOf(run, file);
  return { info, frames: pk.length, keys: pk.filter((p) => p.key).map((p) => p.pts * info.tb) };
}

// n/fps 常常除不盡：outpoint 無條件捨去（關鍵影格本身不能算進前一段）、inpoint 無條件進位（seek 才會落在這個關鍵影格）
const upUs = (t, fps) => (Math.ceil(Math.round(t * fps) / fps * 1e6) / 1e6).toFixed(6);
const downUs = (t, fps) => (Math.floor(Math.round(t * fps) / fps * 1e6) / 1e6).toFixed(6);

// parts：[{ file, start, end }]（秒，都落在 base 的關鍵影格）。視訊 stream copy，聲音從 audio（沒給就是 base）stream copy
export async function spliceFinal({ base, dest, parts, audio = null, run, fps = 30, tmp }) {
  const info = await videoInfo(run, base);
  const before = await packetsOf(run, base);
  const dur = before.length / fps;
  const want = Math.round(1 / info.tb);
  const fixed = [];
  let n = 0;
  for (const part of [...parts].sort((x, y) => x.start - y.start)) {
    const pi = await videoInfo(run, part.file);
    if (pi.extra !== info.extra) throw new Error(`片段的 SPS/PPS 和舊檔不同（${pi.extra} vs ${info.extra}）`);
    let f = part.file;
    if (Math.round(1 / pi.tb) !== want) {   // concat 不換算 time base：只改容器，不動畫面
      f = path.join(tmp, `ts-${n++}.mp4`);
      const r = await run('ffmpeg', ['-y', '-hide_banner', '-v', 'error', '-i', part.file, '-map', '0:v:0', '-c', 'copy', '-video_track_timescale', String(want), f], {});
      if (r.code !== 0) throw new Error(`換 timescale 失敗：${String(r.stderr).slice(-200)}`);
    }
    fixed.push({ ...part, file: f });
  }
  const esc = (p) => path.resolve(p).split(path.sep).join('/').replace(/'/g, "'\\''");
  const lines = [];
  let cur = 0;
  for (const part of fixed) {
    if (part.start > cur + 1e-6) lines.push(`file '${esc(base)}'`, `inpoint ${upUs(cur, fps)}`, `outpoint ${downUs(part.start, fps)}`);
    lines.push(`file '${esc(part.file)}'`);
    cur = part.end;
  }
  if (cur < dur - 1e-6) lines.push(`file '${esc(base)}'`, `inpoint ${upUs(cur, fps)}`);
  const list = path.join(tmp, 'concat.txt');
  fs.writeFileSync(list, `${lines.join('\n')}\n`);
  // -auto_convert 0：不然每個關鍵影格會被塞 SPS/PPS，沒改的封包就不再逐位元相同
  const r = await run('ffmpeg', ['-y', '-hide_banner', '-v', 'error', '-f', 'concat', '-safe', '0', '-auto_convert', '0', '-i', list, '-i', audio || base, '-map', '0:v:0', '-map', '1:a:0', '-map_metadata', '1', '-c', 'copy', '-movflags', '+faststart', dest], {});
  if (r.code !== 0) throw new Error(`接回去失敗：${String(r.stderr).slice(-300)}`);
  const after = await packetsOf(run, dest);
  if (after.length !== before.length) throw new Error(`接好的總格數不對（${after.length}，應該 ${before.length}）`);
  const di = await videoInfo(run, dest);
  const step = (1 / fps) / di.tb;
  for (let i = 1; i < after.length; i++) {
    if (Math.abs(after[i].pts - after[i - 1].pts - step) > 1.5) throw new Error(`接好的時間戳在第 ${i} 格跳動`);
  }
  return { frames: after.length };
}

// ---------- 做 ----------

const COPY_SKIP = new Set(['assets', 'compositions', 'node_modules', 'index.html', 'plan.json', 'renders']);
function linkOrCopy(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  try { fs.linkSync(src, dst); } catch { fs.copyFileSync(src, dst); }   // exFAT 等不支援硬連結
}
function linkTree(srcDir, dstDir, skip = () => false) {
  for (const f of listFiles(srcDir)) if (!skip(f)) linkOrCopy(path.join(srcDir, f), path.join(dstDir, f));
}

// 時間窗專案：kit、合成、背景圖用硬連結；底片換節錄；錄影素材只帶用到的
function materializeWindow(hfDir, dir, html) {
  fs.mkdirSync(dir, { recursive: true });
  for (const name of fs.readdirSync(hfDir)) {
    if (name.startsWith('.') || COPY_SKIP.has(name) || /^plan\.json/.test(name)) continue;
    const st = statOf(path.join(hfDir, name));
    if (st?.isDirectory()) linkTree(path.join(hfDir, name), path.join(dir, name)); else if (st) linkOrCopy(path.join(hfDir, name), path.join(dir, name));
  }
  linkTree(path.join(hfDir, 'compositions'), path.join(dir, 'compositions'), (f) => NOT_IN_FINAL.test(`compositions/${f}`));
  const used = new Set();
  for (const m of html.matchAll(/assets\/media\/[^"'\s)]+/g)) used.add(m[0]);
  for (const f of listFiles(path.join(dir, 'compositions'))) { for (const m of fs.readFileSync(path.join(dir, 'compositions', f), 'utf8').matchAll(/assets\/media\/[^"'\s)]+/g)) used.add(m[0]); }
  linkTree(path.join(hfDir, 'assets'), path.join(dir, 'assets'), (f) => f === 'rough.mp4' || f.startsWith('sfx/') || (f.startsWith('media/') && !used.has(`assets/${f}`)));
  fs.writeFileSync(path.join(dir, 'index.html'), html);
}

// 底片節錄（stream copy，不重新編碼）：關鍵影格起算，畫面和原檔逐格相同；回傳節錄從原檔第幾秒開始
async function excerptRough(run, src, dst, lo, hi) {
  const from = Math.max(0, lo - 3);
  const r = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-read_intervals', `${from}%${lo + 0.1}`, '-show_entries', 'packet=pts_time,flags', '-of', 'csv=p=0', src], {});
  let K = null;
  for (const l of String(r.stdout).split('\n')) { const [t, f] = l.trim().split(','); if (f?.includes('K') && Number(t) <= lo + 1e-6) K = Number(t); }
  if (K == null) return null;   // 找不到關鍵影格：不節錄
  const k = Math.round(K * 30) / 30;   // pts_time 只有 6 位小數；底片是 30fps，用精確的影格時間
  if (Math.abs(k - K) > 1e-3) return null;
  // -ss 無條件進位到微秒：剛好落在這個關鍵影格、它的時間算成 0。多一點（例：2 毫秒）這一格就變負的，被 edit list 丟掉，後面全部差一格；少一點會退到上一個關鍵影格。
  // 也不加 -avoid_negative_ts：底片有 B 格，加了第一格會從 0.067 秒開始
  const c = await run('ffmpeg', ['-y', '-hide_banner', '-v', 'error', '-ss', (Math.ceil(k * 1e6) / 1e6).toFixed(6), '-i', src, '-t', String(hi - k + 1), '-map', '0:v:0', '-c', 'copy', '-movflags', '+faststart', dst], {});
  return c.code === 0 ? k : null;
}

// o：hfDir、base（舊檔）、diff（diffStates 的結果）、dest（成品）、run、render(args, { cwd, env, title })、say、onPercent、isCanceled、env、quality、fps、audioComp
// 做不到（改動太多、畫面參數對不上）回 { full: 原因 }；例外也當成 full。取消丟 { canceled: true }
export async function renderIncremental(o) {
  const { hfDir, base, diff, dest, run, render, say = () => {}, onPercent = () => {}, isCanceled = () => false, env = {}, quality = 'looks', fps = 30 } = o;
  const t0 = Date.now();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-render-inc-'));
  // 取消時 killTree 會照 owner.json 清掉（lib/deliver.mjs removeRenderTemp）
  fs.writeFileSync(path.join(tmp, 'owner.json'), JSON.stringify({ pid: process.pid }));
  const canceledCheck = () => { if (isCanceled()) throw Object.assign(new Error('已取消'), { canceled: true }); };
  const audioFile = path.join(hfDir, AUDIO_COMP);
  try {
    const kf = await keyframesOf(run, base);
    const indexHtml = fs.readFileSync(path.join(hfDir, 'index.html'), 'utf8');
    const film = parseIndex(indexHtml).rootDur;
    if (kf.frames !== Math.ceil(film * fps - 1e-6)) return { full: `舊檔 ${kf.frames} 格，和片長 ${film} 秒對不上` };
    const windows = planWindows(diff.ranges, kf.keys, kf.frames / fps);
    const dirtySec = windows.reduce((s, [a, b]) => s + b - a, 0);
    if (dirtySec > (kf.frames / fps) * MAX_DIRTY_SHARE) return { full: `改到 ${Math.round(dirtySec)} 秒，超過片長四成` };
    const audioPlan = diff.audio ? audioOnlyHtml(indexHtml) : null;
    if (diff.audio && !audioPlan) return { full: '這支片子有錄影帶聲音或底片切段，聲音要整支重混' };
    say(`${windows.length ? `只重畫改到的 ${dirtySec.toFixed(1)} 秒（${windows.length} 段）${diff.audio ? '＋重混聲音' : ''}` : '畫面不用重畫，只重混聲音'}：${diff.why.slice(0, 4).join('、')}${diff.why.length > 4 ? '…' : ''}`);
    const parts = [];
    let doneSec = 0;
    const tmpEnv = process.platform === 'win32' ? { TEMP: tmp, TMP: tmp } : { TMPDIR: tmp };
    for (let i = 0; i < windows.length; i++) {
      const [a, b] = windows[i];
      canceledCheck();
      const pruned0 = pruneIndex(indexHtml, a, b);
      const span = roughSpan(pruned0.html);
      const dir = path.join(tmp, `w${i}`);
      fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
      const K = span ? await excerptRough(run, path.join(hfDir, ROUGH_SRC), path.join(dir, ROUGH_SRC), span[0], span[1]) : null;
      if (span && K == null) linkOrCopy(path.join(hfDir, ROUGH_SRC), path.join(dir, ROUGH_SRC));
      const html = K != null ? pruneIndex(indexHtml, a, b, { offset: K }).html : pruned0.html;
      materializeWindow(hfDir, dir, html);
      const part = path.join(tmp, `part${i}.mp4`);
      const r = await render(['render', '--sdr', '--fps', String(fps), '--quality', quality, '--start', String(a), '--end', String(b), '--keyframe-interval', String(KEYFRAME_SEC), '--output', part], { cwd: dir, env: { ...env, ...tmpEnv }, title: `只重畫 ${r3(a)}–${r3(b)} 秒` });
      canceledCheck();
      if (r.code !== 0 || !statOf(part)) return { full: `時間窗 render 失敗：${String(r.stderr || r.stdout).split('\n').filter((l) => /error|fail/i.test(l)).pop()?.slice(0, 160) || `結束代碼 ${r.code}`}` };
      const pk = await packetsOf(run, part);
      const wantFrames = Math.round((b - a) * fps);
      if (pk.length !== wantFrames) return { full: `時間窗 ${pk.length} 格，應該 ${wantFrames} 格` };
      parts.push({ file: part, start: a, end: b });
      doneSec += b - a;
      onPercent(Math.round(90 * doneSec / Math.max(dirtySec, 1e-3)));
      fs.rmSync(dir, { recursive: true, force: true });
    }
    let audio = null;
    if (audioPlan) {
      canceledCheck();
      fs.writeFileSync(audioFile, audioPlan.html);
      const am = path.join(tmp, 'audio.mp4');
      const r = await render(['render', '-c', AUDIO_COMP, '--sdr', '--fps', String(audioPlan.fps), '--quality', 'draft', '--workers', '1', '--output', am], { cwd: hfDir, env: { ...env }, title: '重混聲音' });
      canceledCheck();
      if (r.code !== 0 || !statOf(am)) return { full: '重混聲音失敗' };
      audio = path.join(tmp, 'audio.m4a');
      const c = await run('ffmpeg', ['-y', '-hide_banner', '-v', 'error', '-i', am, '-map', '0:a:0', '-c', 'copy', audio], {});
      if (c.code !== 0) return { full: '抽聲音失敗' };
    }
    onPercent(95);
    canceledCheck();
    if (parts.length) await spliceFinal({ base, dest, parts, audio, run, fps, tmp });
    else {   // 只改聲音
      const r = await run('ffmpeg', ['-y', '-hide_banner', '-v', 'error', '-i', base, '-i', audio, '-map', '0:v:0', '-map', '1:a:0', '-map_metadata', '0', '-c', 'copy', '-movflags', '+faststart', dest], {});
      if (r.code !== 0) throw new Error(`換聲音失敗：${String(r.stderr).slice(-200)}`);
    }
    return { ok: true, seconds: Math.round((Date.now() - t0) / 1000), dirtySec: r3(dirtySec), windows };
  } catch (e) {
    if (e.canceled) throw e;
    return { full: e.message };
  } finally {
    fs.rmSync(audioFile, { force: true });
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 3 });
  }
}
