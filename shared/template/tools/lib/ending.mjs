// 片尾模板（033，照作者剪映的定剪）：影片結束後再接一張片尾卡（黑底＋圖＋片尾金句），片尾前講到「訂閱」那句放訂閱動畫。
// 預設沒有：素材放 shared/brand/（不進版控），shared/setting.json 的 ending 指定才有（brand.mjs ending 寫）。零依賴（ffmpeg 只在 build 轉訂閱動畫）。
//
//   setting.json  "ending": { "image": "book-cover.jpg", "seconds": 9.9, "quote": true, "subscribe": "subscribe.gif" }
//                 image＝片尾卡的圖（沒寫＝沒有片尾卡）；seconds＝片尾卡長度；quote＝圖右邊放片尾金句；subscribe＝訂閱動畫（沒寫＝不放）
//                 motion＝片尾金句的文字動畫（077；ENDING_MOTIONS 的 id，沒寫＝打字機）
//   plan.json     "ending": false（這一集不要）｜{ "quote": "<字>"｜null, "subscribe": "#N"｜null, "motion": "<id>", "x": 1300, "y": 575, "size": 48, "w": 580, "lineSpacing": 0.07, "gap": 1 }
//                 （這一集換金句、指定訂閱那句、換文字動畫；null＝這集不放；082 x、y＝金句框左上角、size＝字級、w＝框寬，剪輯台拖的；lineSpacing＝行間距（剪映的單位）、gap＝段落間距（空幾行），editor/ending-layout.mjs）
//
//   readEndingSetting(sharedDir)                    → null（沒設定）｜{ image, seconds, quote, subscribe, problems[] }（image、subscribe 是完整路徑）
//   resolveEnding(ctx)                              → null（沒設定）｜{ off }｜{ dur, card, subscribe, notes[] }（resolvePlan 的一節；⚠ 推進 ctx.warnings）
//   quoteLines(text)                                → 片尾金句分段（有換行／// 照作者分的、標點照留；沒有照逗點分段；一段太長照框寬自動換行；editor/ending-layout.mjs quoteParse，剪輯台也用同一個）
//   prepareEnding(ending, outDir)                   → 同一個物件加上 card.file、subscribe.file（相對 work/hyperframes/；build.mjs 複製圖、gif 轉透明 webm，同檔不重做）
//   endingParts(ending, { t0, DUR, videoDur, base, W, H, nextTrack }) → { html[], tl[], css }（main.mjs 主合成；css 放 <head> 的 <style>）
//   endingLines(ending, { portrait })               → 報告行（build 的結尾、停點 ③）
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readSettings } from './settings.mjs';
import { parseTime, cueSeconds, r3 } from './time.mjs';
import { readScript } from './script-file.mjs';
import { QUOTE, QUOTE_SIZE, QUOTE_LS, QUOTE_GAP, QUOTE_KEYS, quoteLines, quoteParse, quoteBox, quoteGap, quoteLineSpacing, quoteFits, quoteMaxRows, quotePerLine } from '../editor/ending-layout.mjs';
import { probeDuration, run } from './ff.mjs';

export const BRAND_DIR = 'brand';   // shared/brand/
// 數字照作者剪映的定剪（jianying-editing 的 tpl_brand.json ending_*、tpl_ending_quote.json；2026-11-14 作者看過還原圖確認一樣）
export const ENDING = {
  seconds: 9.9, min: 3, max: 30,     // 片尾卡長度（剪映 ending.black_dur）
  black: 0.5,                         // 講者最後一段淡出到黑（剪映影片版渐隐 0.5 秒）
  image: { at: 0.1, scale: 0.63, fade: 0.5 },   // 圖：晚 0.1 秒淡入 0.5 秒、縮成填滿畫布的 0.63 倍置中；最後 0.5 秒淡出
  quote: QUOTE,                       // 片尾金句：書封右邊，晚 0.633 秒打字機進場 5.23 秒；位置、字級這一集可以換（plan.json 的 ending.x／y／size，082）
  z: 80,                              // 蓋過字幕（60）和剪輯台的淡出（70）
};
// 077 片尾金句的文字動畫：剪輯台「片尾卡 → 文字動畫」的下拉選單、build.mjs --set ending.motion、brand.mjs ending --motion 都是這一組。
// 預設打字機（剪映的复古打字机）；時間都從 quote.at 開始，最後和圖一起淡出
export const ENDING_MOTIONS = [
  { id: 'type', zh: '打字機', tip: '一個字一個字打出來（預設）' },
  { id: 'fade', zh: '淡入', tip: '整段一起淡入' },
  { id: 'rise', zh: '逐行浮出', tip: '一行一行由下往上浮出' },
  { id: 'wipe', zh: '由左擦開', tip: '一行一行由左往右擦開' },
  { id: 'none', zh: '直接出現', tip: '不做動畫，時間到字就在' },
];
export const ENDING_MOTION = 'type';
export const MOTION = { fade: 0.8, rise: { dur: 0.6, gap: 0.5, y: 28 }, wipe: { dur: 0.9, gap: 0.6 } };   // 各種動畫的秒數（剪輯台的快速試聽示意用同一組）
const MOTION_IDS = ENDING_MOTIONS.map((m) => m.id);
export const endingMotionZh = (id) => ENDING_MOTIONS.find((m) => m.id === id)?.zh ?? String(id);
const motionList = () => ENDING_MOTIONS.map((m) => `${m.id}（${m.zh}）`).join('、');
export const SUBSCRIBE = { word: '訂閱', from: 0.75, lead: 0.5, dy: 0.18, fade: 0.5, min: 2, z: 56 };   // 最後四分之一第一句講到「訂閱」的、晚 0.5 秒出現；往下移畫面高的 0.18（剪映 y −0.36）；蓋在字卡上、字幕底下
const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp'];
const SUB_EXT = ['.gif', '.webm', '.mov', '.mp4'];
const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n3 = (x) => String(r3(x));
const SET_CMD = 'node shared/template/tools/brand.mjs ending <圖檔>';

export function readEndingSetting(sharedDir) {
  const e = readSettings(sharedDir).data.ending;
  if (e === undefined || e === null) return null;
  const dir = path.join(sharedDir, BRAND_DIR), problems = [];
  if (!isObj(e)) return { image: null, seconds: ENDING.seconds, quote: true, subscribe: null, motion: ENDING_MOTION, problems: [`shared/setting.json 的 ending 要是物件 → 重新設定：${SET_CMD}`] };
  const file = (name, exts, what) => {
    if (name === undefined || name === null || name === '') return null;
    const f = path.join(dir, String(name));
    if (!exts.includes(path.extname(f).toLowerCase())) { problems.push(`${what} ${name} 不是 ${exts.join(' ')} → 換一個檔：${SET_CMD}`); return null; }
    if (!fs.existsSync(f)) { problems.push(`${what} shared/${BRAND_DIR}/${name} 不在 → 把檔放回去，或重新設定：${SET_CMD}`); return null; }
    return f;
  };
  const seconds = e.seconds === undefined ? ENDING.seconds : Number(e.seconds);
  if (!(seconds >= ENDING.min && seconds <= ENDING.max)) problems.push(`片尾卡長度 ${JSON.stringify(e.seconds)} 不對（要 ${ENDING.min}–${ENDING.max} 秒），先用 ${ENDING.seconds} 秒 → brand.mjs ending --seconds ${ENDING.seconds}`);
  let motion = ENDING_MOTION;
  if (e.motion !== undefined && e.motion !== null) {
    if (MOTION_IDS.includes(e.motion)) motion = e.motion;
    else problems.push(`片尾金句的文字動畫 ${JSON.stringify(e.motion)} 不認得（可用：${motionList()}），先用打字機 → brand.mjs ending --motion <名稱>`);
  }
  return {
    image: file(e.image, IMAGE_EXT, '片尾圖'), seconds: seconds >= ENDING.min && seconds <= ENDING.max ? r3(seconds) : ENDING.seconds,
    quote: e.quote !== false, subscribe: file(e.subscribe, SUB_EXT, '訂閱動畫'), motion, problems,
  };
}

// 片尾金句分段：逗點、//、換行處空一行（剪映的做法），拿掉句尾的句號與 **（editor/ending-layout.mjs）
export { quoteLines };

// 講稿最後一個 > 段落（字幕對齊本來就跳過 > 開頭的行）
function scriptQuote(projectDir) {
  if (!projectDir) return null;
  let md = '';
  try { md = readScript(path.join(projectDir, '講稿.md')); } catch { return null; }
  const blocks = [];
  let cur = null;
  for (const raw of md.split(/\r?\n/)) {
    const l = raw.trim();
    if (l.startsWith('>')) { const t = l.replace(/^>+\s*/, ''); if (!cur) blocks.push(cur = []); if (t) cur.push(t); }
    else cur = null;
  }
  const last = blocks.filter((b) => b.length).pop();
  return last ? last.join('\n') : null;
}

export function resolveEnding({ plan, lib, cues, timed, projectDir, videoDur, portrait, C: canvas, errors, warnings }) {
  const conf = lib.ending ?? null;
  if (!conf) {
    if (plan.ending !== undefined && plan.ending !== false) warnings.push(`plan.json 寫了 ending，但工作區沒有設定片尾（shared/setting.json 沒有 ending）→ 用不到就刪掉；要片尾先設定：${SET_CMD}`);
    return null;
  }
  for (const p of conf.problems) warnings.push(`片尾：${p}`);
  const pe = plan.ending;
  if (pe === false) return { off: 'plan.json 寫了 "ending": false', dur: 0 };
  if (pe !== undefined && !isObj(pe)) { errors.push(`ending 只能寫 false（這一集不要片尾）或物件 { "quote": "…", "subscribe": "#N" }，現在是 ${JSON.stringify(pe)} → 照例子改，或刪掉用工作區的設定`); return { off: 'plan.json 的 ending 寫錯', dur: 0 }; }
  for (const k of Object.keys(pe || {})) if (!['quote', 'subscribe', 'motion', ...QUOTE_KEYS].includes(k)) errors.push(`ending 不能有「${k}」→ 只能寫 quote（片尾金句）、subscribe（訂閱動畫跟哪一句）、motion（片尾金句的文字動畫）、x／y／size／w／lineSpacing／gap（片尾金句的位置、字級、框寬、行間距、段落間距）`);
  // 082 片尾金句的位置、字級、框寬（剪輯台拖的）、段落間距：數字才算，size、gap 夾在範圍裡
  const pos = {};
  for (const k of QUOTE_KEYS) {
    if (!pe || !(k in pe)) continue;
    if (typeof pe[k] !== 'number' || !Number.isFinite(pe[k])) { errors.push(`ending.${k} 要是數字（${k === 'gap' ? '段與段之間空幾行' : k === 'lineSpacing' ? '行間距，剪映的單位' : k === 'w' ? '框寬，畫布 px' : '畫布 px'}），現在是 ${JSON.stringify(pe[k])} → 改成數字，或刪掉用預設`); continue; }
    if (k === 'lineSpacing' && (pe[k] < QUOTE_LS.min || pe[k] > QUOTE_LS.max)) warnings.push(`片尾金句的行間距 ${pe[k]} 超出範圍（${QUOTE_LS.min}–${QUOTE_LS.max}），用 ${quoteLineSpacing(pe[k])}`);
    if (k === 'gap' && (pe[k] < QUOTE_GAP.min || pe[k] > QUOTE_GAP.max)) warnings.push(`片尾金句的段落間距 ${pe[k]} 行超出範圍（${QUOTE_GAP.min}–${QUOTE_GAP.max} 行），用 ${quoteGap(pe[k])}`);
    pos[k] = pe[k];
  }
  if (pos.size !== undefined && (pos.size < QUOTE_SIZE.min || pos.size > QUOTE_SIZE.max)) warnings.push(`片尾金句的字級 ${pos.size} 超出範圍（${QUOTE_SIZE.min}–${QUOTE_SIZE.max}），用 ${Math.min(QUOTE_SIZE.max, Math.max(QUOTE_SIZE.min, Math.round(pos.size)))}`);
  // 片尾金句的文字動畫：這一集寫了就用這一集的，沒寫用工作區的預設
  let motion = conf.motion ?? ENDING_MOTION;
  if (pe && 'motion' in pe) {
    if (MOTION_IDS.includes(pe.motion)) motion = pe.motion;
    else errors.push(`ending.motion：${JSON.stringify(pe.motion)} 不是可以用的文字動畫 → 改成 ${motionList()} 其中一個，或刪掉用預設`);
  }
  if (portrait) return { off: '直式不放片尾卡和訂閱動畫', dur: 0 };
  const notes = [];
  // 片尾卡＋金句
  let card = null, parsed = null;
  if (conf.image) {
    let quote = null;
    if (conf.quote) {
      let text = null, from = null;
      if (pe && 'quote' in pe) {
        if (pe.quote === null) from = 'plan.json 寫了 null（這一集不放）';
        else if (typeof pe.quote === 'string' && pe.quote.trim()) { text = pe.quote; from = 'plan.json'; }
        else errors.push(`ending.quote 要是一句話（字串），不放寫 null，現在是 ${JSON.stringify(pe.quote)}`);
      } else {
        text = scriptQuote(projectDir);
        if (text) from = '講稿最後的 > 引言';
        else {
          const q = [...timed].reverse().find((x) => x.type === 'scene' && x.scene?.key === 'quote' && x.seg?.slots?.text);
          if (q) { text = q.seg.slots.text; from = `[${q.id}] 金句字卡`; }
        }
      }
      parsed = text ? quoteParse(text, { auto: from !== 'plan.json' }) : null;   // 講稿、金句字卡照剪映的定剪分；plan.json（剪輯台、AI 打的）有換行就照它分
      const lines = parsed?.lines || [];
      if (lines.length) {
        quote = { lines, from, manual: parsed.manual };
        const W = canvas?.W || 1920, H = canvas?.H || 1080, box = quoteBox(pos, parsed), over = quoteFits(lines, box, { W, H });
        if (over === '下緣') warnings.push(`片尾金句「${lines.join(parsed.manual ? '／' : '，')}」太長，會超出畫面下緣（這個位置、字級最多約 ${quoteMaxRows(box, H)} 行、一行 ${quotePerLine(box)} 字）→ 縮短：build.mjs --set "ending.quote=<短一點的句子>"，或在剪輯台把金句往上拖、縮小`);
        else if (over === '右緣') warnings.push(`片尾金句的框超出畫面右緣（左邊 ${box.left}、寬 ${box.width}，畫面寬 ${W}）→ 在剪輯台把金句往左拖、縮小`);
      } else if (!from) notes.push('片尾金句：講稿沒有 > 引言、也沒有金句字卡，片尾卡只放圖（要放就在 plan.json 寫 ending.quote）');
      else if (from.startsWith('plan.json 寫了 null')) notes.push('片尾金句：這一集不放（plan.json 的 ending.quote 寫了 null）');
    }
    card = { image: conf.image, quote, motion, box: quoteBox(pos, quote ? parsed : null), moved: ['x', 'y', 'size', 'w'].some((k) => k in pos), gap: pos.gap, lineSpacing: pos.lineSpacing };
  }
  // 訂閱動畫：最後四分之一第一句講到「訂閱」的
  let subscribe = null;
  if (conf.subscribe) {
    let cue = null, why = null;
    if (pe && 'subscribe' in pe) {
      if (pe.subscribe === null) why = '這一集不放（plan.json 的 ending.subscribe 寫了 null）';
      else {
        const t = parseTime(pe.subscribe);
        const c = t.error || t.kind !== 'cue' || t.end || t.off || t.kw ? null : cueSeconds(t, cues);
        if (!c || c.error) errors.push(`ending.subscribe 要寫 "#N"（講到訂閱的那一句），現在是 ${JSON.stringify(pe.subscribe)}${c?.error ? `：${c.error}` : ''}`);
        else cue = { n: t.n, start: c.sec, text: cues.find((x) => x.n === t.n)?.text ?? null };
      }
    } else {
      const c = cues.find((x) => x.start >= videoDur * SUBSCRIBE.from - 1e-6 && x.start < videoDur && String(x.text).includes(SUBSCRIBE.word));
      if (c) cue = { n: c.n, start: c.start, text: c.text };
      else why = `最後四分之一沒有講到「${SUBSCRIBE.word}」的句子，沒放 → 要放就指定那一句：build.mjs --set "ending.subscribe=#N"`;
    }
    if (cue) {
      let len = 0;
      try { len = probeDuration(conf.subscribe); } catch (e) { warnings.push(`訂閱動畫：${e.message}`); }
      const at = r3(cue.start + SUBSCRIBE.lead), dur = r3(Math.min(len, videoDur - at));
      if (len > 0 && dur >= SUBSCRIBE.min) subscribe = { src: conf.subscribe, at, dur, n: cue.n, text: cue.text ?? null };
      else if (len > 0) why = `#${cue.n} 離片尾太近（只剩 ${Math.max(0, dur).toFixed(1)} 秒），沒放 → 指定早一點講到訂閱的那一句：build.mjs --set "ending.subscribe=#N"`;
    }
    if (why) notes.push(`訂閱動畫：${why}`);
  }
  if (!card && !subscribe && !notes.length) return null;
  return { dur: card ? conf.seconds : 0, card, subscribe, notes };
}

// build.mjs：圖複製進 assets/brand/；訂閱動畫轉成透明 webm（VP9＋alpha，和人物去背層同一種；GIF 在瀏覽器裡不能逐格對時）。檔名帶內容指紋，同檔不重做
export function prepareEnding(ending, outDir) {
  if (!ending || ending.off) return ending;
  const dir = path.join(outDir, 'assets', BRAND_DIR);
  const tag = (f, extra = '') => { const st = fs.statSync(f); return createHash('sha1').update(`${path.basename(f)}|${st.size}|${Math.round(st.mtimeMs)}|${extra}`).digest('hex').slice(0, 10); };
  const rel = (f) => path.relative(outDir, f).split(path.sep).join('/');
  const out = { ...ending };
  if (ending.card) {
    const ext = path.extname(ending.card.image).toLowerCase();
    const dst = path.join(dir, `ending-${tag(ending.card.image)}${ext}`);
    if (!fs.existsSync(dst)) { fs.mkdirSync(dir, { recursive: true }); fs.copyFileSync(ending.card.image, dst); }
    out.card = { ...ending.card, file: rel(dst) };
  }
  if (ending.subscribe) {
    const src = ending.subscribe.src;
    const dst = path.join(dir, `subscribe-${tag(src, 'vp9a')}.webm`);
    if (!fs.existsSync(dst)) {
      fs.mkdirSync(dir, { recursive: true });
      const tmp = `${dst}.tmp.webm`;
      const r = run('ffmpeg', ['-y', '-v', 'error', '-i', src, '-an', '-vf', 'format=yuva420p', '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '30', '-auto-alt-ref', '0', tmp]);
      if (r.status !== 0) { fs.rmSync(tmp, { force: true }); throw new Error(`訂閱動畫轉檔失敗（${path.basename(src)}）：${String(r.stderr).trim().slice(-200)}`); }
      fs.renameSync(tmp, dst);
    }
    out.subscribe = { ...ending.subscribe, file: rel(dst) };
  }
  return out;
}

// 主合成的片尾：訂閱動畫（<video>，最後 0.5 秒淡出）＋片尾卡（黑底在影片結束前 0.5 秒淡入蓋住一切 → 圖淡入 → 金句一個字一個字打出 → 最後 0.5 秒淡出）
export function endingParts(ending, { t0 = 0, DUR, videoDur, base = '', W, H, nextTrack }) {
  const html = [], tl = [];
  let css = '';
  if (!ending || ending.off) return { html, tl, css };
  const pos = (x) => r3(Math.max(0, x - t0));
  const sub = ending.subscribe;
  if (sub?.file) {
    const at = r3(sub.at - t0);
    if (at < DUR && at + sub.dur > 0) {
      const ms = at < 0 ? r3(-at) : 0, st = Math.max(0, at), du = r3(Math.min(sub.dur - ms, DUR - st));
      html.push(`  <video id="end-sub" src="${base}${sub.file}" data-start="${n3(st)}" data-duration="${n3(du)}"${ms ? ` data-media-start="${n3(ms)}"` : ''} data-track-index="${nextTrack()}" muted playsinline style="position:absolute;left:0;top:${Math.round(H * SUBSCRIBE.dy)}px;width:${W}px;height:${H}px;z-index:${SUBSCRIBE.z}"></video>`);
      const fo = r3(sub.at + sub.dur - SUBSCRIBE.fade - t0);
      if (fo >= 0 && fo < DUR) tl.push(`tl.to('#end-sub', { opacity: 0, duration: ${SUBSCRIBE.fade}, ease: 'none' }, ${n3(fo)});`);
    }
  }
  const card = ending.card;
  if (card?.file && ending.dur > 0) {
    const A = videoDur, end = r3(A + ending.dur), s = r3(A - ENDING.black - t0);
    if (s < DUR && end - t0 > 0) {
      const I = ENDING.image, Q = { ...ENDING.quote, ...(card.box || quoteBox()) }, iw = Math.round(W * I.scale), ih = Math.round(H * I.scale);
      // 金句的字：一段一個 <span class="el">（區塊；段與段之間空 Q.gap px＝段落間距；一段太長照框寬自動換行）；打字機再一個字一個 <span class="ec">
      //   作者自己分的段（有換行）照一般的換行規則（標點不放行首、英文字不拆開，太長才拆）；舊的照字斷；逐段的動畫（浮出、擦開）動 .el，其他整段一起
      const mo = card.quote ? card.motion || ENDING_MOTION : null;
      const quote = !card.quote ? '' : card.quote.lines.map((l) => `<span class="el">${mo === 'type' ? [...l].map((ch) => `<span class="ec">${esc(ch)}</span>`).join('') : esc(l)}</span>`).join('');
      html.push(`  <div id="end-card" class="clip" data-start="${n3(Math.max(0, s))}" data-duration="${n3(end - t0 - Math.max(0, s))}" data-track-index="${nextTrack()}" style="position:absolute;inset:0;background:#000;z-index:${ENDING.z};opacity:0">
    <img id="end-img" src="${base}${card.file}" alt="" style="position:absolute;left:${Math.round((W - iw) / 2)}px;top:${Math.round((H - ih) / 2)}px;width:${iw}px;height:${ih}px;object-fit:contain;opacity:0">${quote ? `
    <div id="end-quote" style="position:absolute;left:${Q.left}px;top:${Q.top}px;width:${Q.width}px;font:400 ${Q.size}px/${Q.line}px 'Noto Sans TC', sans-serif;color:#fff;${Q.manual ? 'overflow-wrap:anywhere' : 'word-break:break-all'}">${quote}</div>` : ''}
  </div>`);
      tl.push(s >= 0 ? `tl.fromTo('#end-card', { opacity: 0 }, { opacity: 1, duration: ${ENDING.black}, ease: 'none' }, ${n3(s)});` : `tl.set('#end-card', { opacity: 1 }, 0);`);
      tl.push(`tl.fromTo('#end-img', { opacity: 0 }, { opacity: 1, duration: ${I.fade}, ease: 'none' }, ${n3(pos(A + I.at))});`);
      if (quote) {
        const qa = n3(pos(A + Q.at)), nl = card.quote.lines.length, base0 = `    #end-quote .el { display: block; }\n    #end-quote .el + .el { margin-top: ${Q.gap}px; }\n`;
        if (mo === 'type') {
          css = `${base0}    #end-quote .ec { opacity: 0; }\n`;
          const n = card.quote.lines.join('').length, type = Math.min(Q.type, Math.max(1, ending.dur - Q.at - I.fade - 1));
          tl.push(`tl.to('#end-quote .ec', { opacity: 1, duration: 0.01, ease: 'none', stagger: ${n3(type / n)} }, ${qa});`);
        } else if (mo === 'fade') {
          css = `${base0}    #end-quote { opacity: 0; }\n`;
          tl.push(`tl.to('#end-quote', { opacity: 1, duration: ${MOTION.fade}, ease: 'none' }, ${qa});`);
        } else if (mo === 'rise') {
          css = `${base0}    #end-quote .el { opacity: 0; }\n`;
          tl.push(`tl.fromTo('#end-quote .el', { opacity: 0, y: ${MOTION.rise.y} }, { opacity: 1, y: 0, duration: ${MOTION.rise.dur}, ease: 'power2.out', stagger: ${MOTION.rise.gap} }, ${qa});`);
        } else if (mo === 'wipe') {
          css = `${base0}    #end-quote .el { clip-path: inset(0 100% 0 0); }\n`;
          tl.push(`tl.fromTo('#end-quote .el', { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: ${MOTION.wipe.dur}, ease: 'power2.inOut', stagger: ${nl > 1 ? MOTION.wipe.gap : 0} }, ${qa});`);
        } else {
          css = `${base0}    #end-quote { opacity: 0; }\n`;
          tl.push(`tl.set('#end-quote', { opacity: 1 }, ${qa});`);
        }
      }
      tl.push(`tl.to('#end-img${quote ? ', #end-quote' : ''}', { opacity: 0, duration: ${I.fade}, ease: 'none' }, ${n3(pos(end - I.fade))});`);
    }
  }
  return { html, tl, css };
}

// 報告行：沒設定片尾（ending 是 null）就不印，沒用到的人看不到
export function endingLines(ending) {
  if (!ending) return [];
  if (ending.off) return [`片尾：${ending.off}`];
  const L = [];
  if (ending.card) {
    const q = ending.card.quote;
    const b = ending.card.box, at = (q && ending.card.moved && b ? `，位置 (${b.left}, ${b.top})、字級 ${b.size}、框寬 ${b.width}` : '') + (q && ending.card.lineSpacing !== undefined ? `，行間距 ${quoteLineSpacing(ending.card.lineSpacing)}（行高 ${b.line}）` : '') + (q && ending.card.gap !== undefined ? `，段落間距 ${quoteGap(ending.card.gap)} 行` : '');
    L.push(`片尾卡：影片結束後接 ${ending.dur} 秒（${path.basename(ending.card.image)}${q ? `＋片尾金句「${q.lines.join(q.manual ? '／' : '，')}」，來源：${q.from}${(ending.card.motion || ENDING_MOTION) !== ENDING_MOTION ? `，文字動畫：${endingMotionZh(ending.card.motion)}` : ''}${at}` : ''}）；講者最後 ${ENDING.black} 秒淡出到黑`);
  }
  if (ending.subscribe) L.push(`訂閱動畫：#${ending.subscribe.n}${ending.subscribe.text ? `「${ending.subscribe.text}」` : ''}後 ${SUBSCRIBE.lead} 秒出現，播 ${ending.subscribe.dur} 秒`);
  return [...L, ...ending.notes];
}
