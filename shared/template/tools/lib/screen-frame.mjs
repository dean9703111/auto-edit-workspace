// 錄影畫面框（specs/061-screen-frame）：橫式的插入素材段（type: "media"：螢幕錄影、圖片）縮小放進一個框 WIN，框外是主題的純底色（不放背景圖）；
// 小節角標、子母畫面照框的邊放（角標離框上、右各 inset；子母畫面離框右、下各 inset），整集同一個標準。
//
//   plan.json 第一層    "screenFrame": { "scale": 0.86, "inset": 24 }      這一集（以影片為單位記下來；build 第一次照預設寫進來）
//   shared/setting.json "screenFrame": { "scale": "auto", "inset": 24 }    以後每集的參考預設（brand.mjs screen-frame）
//   都沒寫＝原本的樣子（錄影放在字幕帶上方 1920×940、四周黑底），輸出和沒有這個功能時逐位元相同。直式不套。
//
//   FRAME                                     數字：scale 0.6–1（取到 0.005）、inset 預設 24（0–80）、gap 12、圓角 16
//   sanitizeScreenFrame(v, where)             → { frame: { scale?, inset? }, errors }（v 是 null／undefined → frame null）
//   frameWin(scale, inset)                    → [x, y, w, h]：寬 1920·s、高 1080·s、水平置中，上緣 round(inset／2)（框和畫面一樣大時貼齊）
//   measureScale(capTop, inset)               → { scale, short }：WIN 下緣離字幕底板上緣至少 gap 的最大 scale（取到 0.005；60% 還碰到 short＝true）
//   resolveScreenFrame({ plan, settings, capStyle, canvas, projectRel })
//                                             → { frame, errors, warnings, record }；frame＝null（沒設定、直式）或
//                                               { scale, inset, auto, win, capTop, gap, radius, measured, from: 'plan'|'setting' }；
//                                               record＝plan 還沒有、照 setting 解析出來的 { scale, inset }（build 寫進 plan.json）
//   frameForPlan({ plan, settings, format })  → 同上，字幕樣式照 plan.json captionStyle → setting 的 captions 自己解析（剪輯台、截圖欄位用）
//   fitWin(win, info, fit)                    → 072：橫向素材（寬高比 ≥ 1.2、contain）的框照素材比例縮（全景剛好塞滿、沒有黑邊）；其他照原本的 win
//   describeScreenFrame(frame)                → 「縮到 86%（量字幕上緣 y 956；1651×929、上 12），角標離框上、右各 24 px」
//   frameLine(frame)                          → build／--check 摘要那一行（含出處）
//
// 字幕在 kit/captions.css 是 nowrap（一則一行），全片的底板上緣都是 captionGeom 的 top；重點字幕（cg--em）字級、行高、內距照一般字幕，高度一樣。
import { captionGeom, resolveCaptionStyle, CAP_DEFAULT } from './caption-style.mjs';

// 070 錄影、圖片段四周的底色（作者：「使用螢幕錄影時，背景白色還是黑色的選項，預設為黑色底」「能夠在 setting.json 上設定紀錄」「是指純白或純黑」）：
//   plan.json screenBg（這一集）→ shared/setting.json screenBg（brand.mjs screen-bg）→ "black"；有沒有錄影畫面框都套用，框裡沒蓋到的地方同色
export const SCREEN_BGS = Object.freeze(['black', 'white']);

export const FRAME = Object.freeze({ W: 1920, H: 1080, min: 0.6, max: 1, step: 0.005, inset: 24, insetMin: 0, insetMax: 80, gap: 12, radius: 16 });
const KEYS = ['scale', 'inset'];
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
// 0.005 一格：存成 0.86、0.865（不留浮點尾巴）
const snap = (s) => +(Math.round(s / FRAME.step) * FRAME.step).toFixed(3);
const pct = (s) => +(s * 100).toFixed(1);
const EXAMPLE = '{ "scale": "auto", "inset": 24 }';

export function sanitizeScreenFrame(v, where = 'screenFrame') {
  if (v === undefined || v === null) return { frame: null, errors: [] };
  if (!isObj(v)) return { frame: null, errors: [`${where} 要寫成 ${EXAMPLE}（scale：${FRAME.min}–${FRAME.max} 或 "auto"；inset：角標離框邊幾 px），現在是 ${JSON.stringify(v)}`] };
  const errors = [], frame = {};
  for (const k of Object.keys(v)) if (!KEYS.includes(k)) errors.push(`${where} 沒有「${k}」這個欄位（可用：${KEYS.join('、')}）`);
  if (v.scale !== undefined) {
    if (v.scale === 'auto') frame.scale = 'auto';
    else if (isNum(v.scale) && v.scale >= FRAME.min - 1e-9 && v.scale <= FRAME.max + 1e-9) frame.scale = snap(v.scale);
    else errors.push(`${where}.scale 是錄影框縮到畫面的幾倍：${FRAME.min}–${FRAME.max}（取到 ${FRAME.step}），或 "auto"（照字幕量到剛好不碰到），現在是 ${JSON.stringify(v.scale)}`);
  }
  if (v.inset !== undefined) {
    if (isNum(v.inset) && v.inset >= FRAME.insetMin && v.inset <= FRAME.insetMax) frame.inset = Math.round(v.inset);
    else errors.push(`${where}.inset 是角標、子母畫面離錄影框邊幾 px：${FRAME.insetMin}–${FRAME.insetMax}（預設 ${FRAME.inset}），現在是 ${JSON.stringify(v.inset)}`);
  }
  return { frame: errors.length ? null : frame, errors };
}

// 072（作者：「右上角的角標超過螢幕錄影的右側範圍，請優化，上與右應該一致；全部螢幕錄影的片段都檢查一次」）：
//   3840×2280 這類比 16:9 窄一點的錄影放進 16:9 的框，全景兩邊各留一條黑邊，貼框右上的角標就跨在錄影邊上。
//   橫向的錄影、圖片（寬高比 ≥ FIT_MIN、contain）框照素材的比例縮：全景剛好塞滿框，推近也不會比框寬，看得到的錄影邊＝框邊，
//   角標離框上、右，子母畫面離框右、下都是 inset。cover、方形的圖、直式手機畫面照原本的框（兩邊空很多，縮框會讓角標、小視窗壓到素材）
export const FIT_MIN = 1.2;
export function fitWin(win, info, fit = 'contain') {
  if (!win || fit === 'cover' || !(info?.width > 0) || !(info?.height > 0)) return win;
  // 073 錄影自帶黑邊（info.content）：照黑邊裡的畫面比例
  const [x0, y0, x1, y1] = info.content || [0, 0, info.width, info.height];
  const [x, y, w, h] = win, a = (x1 - x0) / (y1 - y0);
  if (a < FIT_MIN || Math.abs(a - w / h) < 0.005) return win;
  if (a < w / h) { const nw = Math.round(h * a); return [x + Math.round((w - nw) / 2), y, nw, h]; }
  const nh = Math.round(w / a);
  return [x, y + Math.round((h - nh) / 2), w, nh];
}

export function frameWin(scale, inset = FRAME.inset) {
  const w = Math.round(FRAME.W * scale), h = Math.round(FRAME.H * scale);
  const y = Math.min(Math.round(inset / 2), Math.floor((FRAME.H - h) / 2));
  return [Math.round((FRAME.W - w) / 2), y, w, h];
}

export function measureScale(capTop, inset = FRAME.inset, gap = FRAME.gap) {
  const hi = Math.round(FRAME.max / FRAME.step), lo = Math.round(FRAME.min / FRAME.step);
  for (let k = hi; k >= lo; k--) {
    const s = snap(k * FRAME.step), [, y, , h] = frameWin(s, inset);
    if (y + h <= capTop - gap) return { scale: s, short: false };
  }
  return { scale: FRAME.min, short: true };
}

const SET = (projectRel) => `node shared/template/tools/build.mjs --project ${projectRel} --set "screenFrame.scale=auto"`;

export function resolveScreenFrame({ plan = {}, settings = {}, capStyle = null, canvas = null, projectRel = 'projects/<專案>', fix = null } = {}) {
  const errors = [], warnings = [];
  const pv = plan?.screenFrame, sv = settings?.screenFrame;
  const p = sanitizeScreenFrame(pv, 'plan.json screenFrame');
  errors.push(...p.errors.map((e) => `${e} → 改好，或拿掉（＝照預設）：node shared/template/tools/build.mjs --project ${projectRel} --unset screenFrame`));
  const s = sanitizeScreenFrame(sv, 'shared/setting.json 的 screenFrame');
  warnings.push(...s.errors.map((e) => `${e} → 先不套預設；用 brand.mjs screen-frame 重設`));
  const none = { frame: null, errors, warnings, record: null };
  if (canvas?.format === 'portrait') {
    if (pv !== undefined && pv !== null) warnings.push('screenFrame 只管橫式的錄影段，直式不套 → 刪掉這個欄位');
    return none;
  }
  const own = p.errors.length ? null : p.frame, base = s.errors.length ? null : s.frame;
  if (!own && !base) return none;
  const want = { scale: own?.scale ?? base?.scale ?? 'auto', inset: own?.inset ?? base?.inset ?? FRAME.inset };
  const capTop = captionGeom(capStyle || CAP_DEFAULT, canvas).top;
  const m = measureScale(capTop, want.inset);
  const auto = want.scale === 'auto', scale = auto ? m.scale : want.scale;
  const win = frameWin(scale, want.inset), y2 = win[1] + win[3];
  if (auto && m.short) warnings.push(`錄影畫面框：字幕底板上緣 y ${capTop} 太高，縮到最小 ${pct(FRAME.min)}% 還是會碰到字幕（框下緣 y ${y2}）→ 字幕往下移（captionStyle.lift 改小），或字級改小`);
  else if (!auto && y2 > capTop) warnings.push(`錄影畫面框縮到 ${pct(scale)}%，框下緣 y ${y2} 疊到字幕底板（上緣 y ${capTop}）${y2 - capTop} px → 重新量測（照字幕量到剛好不碰到，現在會是 ${pct(m.scale)}%）：${fix || SET(projectRel)}`);
  const frame = { scale, inset: want.inset, auto, win, capTop, gap: FRAME.gap, radius: FRAME.radius, measured: m.scale, from: own ? 'plan' : 'setting' };
  return { frame, errors, warnings, record: own ? null : { scale, inset: want.inset } };
}

export function frameForPlan({ plan = {}, settings = {}, format = 'landscape' } = {}) {
  if (format === 'portrait') return { frame: null, errors: [], warnings: [], record: null };
  const cap = resolveCaptionStyle({ plan, settings, format });
  return resolveScreenFrame({ plan, settings, capStyle: cap.style, canvas: null });
}

export function describeScreenFrame(f) {
  if (!f) return '沒有（錄影放在字幕帶上方、四周黑底）';
  const [, y, w, h] = f.win;
  return `縮到 ${pct(f.scale)}%（${f.auto ? `量字幕上緣 y ${f.capTop}；` : ''}${w}×${h}、上 ${y}），角標離框上、右各 ${f.inset} px`;
}

export const frameLine = (f) => (f ? `錄影畫面框：${describeScreenFrame(f)}（${f.from === 'plan' ? '這一集 plan.json screenFrame' : '預設 shared/setting.json screenFrame'}）` : null);
