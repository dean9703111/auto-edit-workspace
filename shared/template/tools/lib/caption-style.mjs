// 字幕樣式（specs/035-caption-style）：一組設定管整支影片的每一則字幕（作者：「調一個，全部都動」）。
//
//   plan.json 第一層   "captionStyle": { "look": "outline", "font": "wenkai", "size": 84, "weight": 700, "lift": 120 }   這一集
//   shared/setting.json "captions":    { "look": …, "font": …, "size": …, "weight": …, "lift": { "landscape": 0, "portrait": 120 } }
//                                       以後每集的預設（brand.mjs captions、剪輯台勾「之後的影片也用這個」）；上下位置橫式、直式分開記
//   都沒寫＝原本的 F8（深底白字、思源黑體 76 px 400、原位），輸出和沒有這個功能時逐位元相同。
//
//   CAP_LOOKS、CAP_FONTS、CAP_WEIGHTS、CAP_SIZE、CAP_LIFT、CAP_DEFAULT
//   sanitizeCaptionStyle(v)                          → { style, errors, notes }：null＝拿掉；缺的欄位補預設；粗細換成字體有的那一個（notes 說明）
//   resolveCaptionStyle({ plan, settings, format })  → { style, from: 'plan'|'setting'|'default', isDefault, errors, notes }
//   captionGeom(style, canvas)                       → 字級、行高、內距、底板位置（橫式下緣 y 1074、直式置中 y 1350，再往上移 lift；直式最大 76）
//   captionRootAttrs(style, canvas)                  → root 要加的 ` data-cap="…" style="--cap-…"`；預設樣式回 ''（captionRootVars＝物件版，剪輯台用）
//   captionFontFace(style, base)                     → 選到另外的字體時的 @font-face（base＝kit 的相對路徑）；思源黑體回 ''
//   fontFiles(style)                                 → 這個樣式要的字型檔（build 只把它們複製進專案）
//   describeCaptionStyle(style)                      → 「白字黑框、霞鶩文楷 84 px 粗、往上 120 px」
// 沒有 node 的 import：剪輯台的頁面也直接載這一支（editor.mjs 的 /lib/caption-style.mjs），兩邊同一套數字。
export const CAP_LOOKS = Object.freeze({
  box: { zh: '深底白字', note: '原本的樣子（黑底 70%）' },
  outline: { zh: '白字黑框', note: '沒有底，白字外面一圈黑框' },
  yellow: { zh: '黃字黑框', note: '沒有底，黃字外面一圈黑框' },
  light: { zh: '白底黑字', note: '白底 92%、深色字' },
  brand: { zh: '主色底', note: '主色底，字色照主色自動配（--brand-ink）' },
});
export const CAP_WEIGHTS = Object.freeze({ 300: '細', 400: '一般', 500: '中', 700: '粗', 900: '特粗' });
export const CAP_SIZE = Object.freeze({ min: 60, max: 96, def: 76, portraitMax: 76 });
// 上下位置（px，往上為正）：橫式原位就貼著畫面底，只能往上；直式在講者面板（y 900 以下）裡上下移
export const CAP_LIFT = Object.freeze({ landscape: Object.freeze({ min: 0, max: 400 }), portrait: Object.freeze({ min: -350, max: 350 }) });
const LIFT_ANY = { min: CAP_LIFT.portrait.min, max: CAP_LIFT.landscape.max };

// 字體：思源黑體（kit/fonts/NotoSansTC-VF.woff2）＋ 5 個 Google Fonts 上的 SIL OFL 字體，都放在 kit/fonts/（授權檔 OFL-<字體>.txt 同一個資料夾）
export const CAP_FONTS = Object.freeze({
  'noto-sans': { zh: '思源黑體', family: null, weights: [300, 400, 500, 700, 900], files: [], note: '英數用 Google Sans Flex' },
  'noto-serif': { zh: '思源宋體', family: 'Noto Serif TC', weights: [300, 400, 500, 700, 900], files: [{ w: '200 900', file: 'NotoSerifTC-VF.ttf' }] },
  wenkai: { zh: '霞鶩文楷', family: 'LXGW WenKai TC', weights: [400, 700], files: [{ w: 400, file: 'LXGWWenKaiTC-Regular.ttf' }, { w: 700, file: 'LXGWWenKaiTC-Bold.ttf' }] },
  huninn: { zh: 'jf open 粉圓', family: 'Huninn', weights: [400], files: [{ w: 400, file: 'Huninn-Regular.ttf' }] },
  marker: { zh: '霞鶩漫黑', family: 'LXGW Marker Gothic', weights: [400], files: [{ w: 400, file: 'LXGWMarkerGothic-Regular.ttf' }] },
  iansui: { zh: '芫荽', family: 'Iansui', weights: [400], files: [{ w: 400, file: 'Iansui-Regular.ttf' }] },
});
export const CAP_DEFAULT = Object.freeze({ look: 'box', font: 'noto-sans', size: CAP_SIZE.def, weight: 400, lift: 0 });
export const CAP_KEYS = Object.keys(CAP_DEFAULT);
// 字幕另外的字體（思源黑體以外）的字型檔與授權檔：build 只把這一集選到的那個字體複製進專案
export const fontLicense = (f) => `OFL-${f.family.replace(/\s+/g, '')}.txt`;
export const EXTRA_FONT_FILES = Object.values(CAP_FONTS).filter((f) => f.files.length).flatMap((f) => [...f.files.map((x) => x.file), fontLicense(f)]);

const list = (o) => Object.entries(o).map(([k, v]) => `"${k}"（${v.zh}）`).join('、');
const nearest = (ws, w) => ws.reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a));
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const isLift = (n) => typeof n === 'number' && Number.isFinite(n) && n >= LIFT_ANY.min && n <= LIFT_ANY.max;
const formatOf = (canvas) => (canvas?.format === 'portrait' ? 'portrait' : 'landscape');
// 照版式夾在範圍內（直式的 -100 拿到橫式＝0）
export const clampLift = (n, format) => { const L = CAP_LIFT[format === 'portrait' ? 'portrait' : 'landscape']; return Math.min(L.max, Math.max(L.min, Math.round(n || 0))); };

export function sanitizeCaptionStyle(v, where = 'captionStyle') {
  if (v === null) return { style: null, errors: [], notes: [] };
  if (!isObj(v)) return { style: undefined, errors: [`${where} 要寫成 { "look": "outline", "font": "noto-sans", "size": 76, "weight": 400, "lift": 0 }，現在是 ${JSON.stringify(v)}`], notes: [] };
  const errors = [], notes = [];
  for (const k of Object.keys(v)) if (!CAP_KEYS.includes(k)) errors.push(`${where} 沒有「${k}」這個欄位（可用：${CAP_KEYS.join('、')}）`);
  const s = { ...CAP_DEFAULT };
  if (v.look !== undefined) { if (CAP_LOOKS[v.look]) s.look = v.look; else errors.push(`${where}.look 只能是 ${list(CAP_LOOKS)}，現在是 ${JSON.stringify(v.look)}`); }
  if (v.font !== undefined) { if (CAP_FONTS[v.font]) s.font = v.font; else errors.push(`${where}.font 只能是 ${list(CAP_FONTS)}，現在是 ${JSON.stringify(v.font)}`); }
  if (v.size !== undefined) {
    if (typeof v.size === 'number' && Number.isFinite(v.size) && v.size >= CAP_SIZE.min && v.size <= CAP_SIZE.max) s.size = Math.round(v.size);
    else errors.push(`${where}.size 是字級（px），${CAP_SIZE.min}–${CAP_SIZE.max}（預設 ${CAP_SIZE.def}），現在是 ${JSON.stringify(v.size)}`);
  }
  if (v.weight !== undefined) {
    if (CAP_WEIGHTS[v.weight] && typeof v.weight === 'number') s.weight = v.weight;
    else errors.push(`${where}.weight 只能是 ${Object.entries(CAP_WEIGHTS).map(([k, z]) => `${k}（${z}）`).join('、')}，現在是 ${JSON.stringify(v.weight)}`);
  }
  if (v.lift !== undefined) {
    if (isLift(v.lift)) s.lift = Math.round(v.lift);
    else errors.push(`${where}.lift 是字幕往上移幾 px（往下寫負的）：橫式 ${CAP_LIFT.landscape.min}–${CAP_LIFT.landscape.max}、直式 ${CAP_LIFT.portrait.min}–${CAP_LIFT.portrait.max}（0＝原位），現在是 ${JSON.stringify(v.lift)}`);
  }
  const ws = CAP_FONTS[s.font].weights;
  if (!ws.includes(s.weight)) {
    const w = nearest(ws, s.weight);
    notes.push(`${CAP_FONTS[s.font].zh}沒有「${CAP_WEIGHTS[s.weight]}」(${s.weight})，用 ${w}（${CAP_WEIGHTS[w]}）`);
    s.weight = w;
  }
  return { style: errors.length ? undefined : s, errors, notes };
}

export const isDefaultStyle = (s) => !s || CAP_KEYS.every((k) => (s[k] ?? CAP_DEFAULT[k]) === CAP_DEFAULT[k]);

// shared/setting.json 的 captions → 這個版式的預設（lift 是 { landscape, portrait }，取這個版式那一個）
function settingFor(sv, format) {
  if (!isObj(sv)) return { base: {}, errors: [`shared/setting.json 的 captions 要是物件，現在是 ${JSON.stringify(sv)}`] };
  const { lift, ...rest } = sv;
  const errors = [];
  if (lift !== undefined && (!isObj(lift) || Object.keys(lift).some((k) => !(k in CAP_LIFT) || !isLift(lift[k])))) {
    errors.push(`shared/setting.json 的 captions.lift 要寫成 { "landscape": 0, "portrait": 120 }（橫式、直式各自往上移幾 px），現在是 ${JSON.stringify(lift)}`);
  }
  const r = sanitizeCaptionStyle(rest, 'shared/setting.json 的 captions');
  errors.push(...r.errors);
  return { base: errors.length ? {} : { ...rest, ...(isObj(lift) && lift[format] !== undefined ? { lift: lift[format] } : {}) }, errors };
}

// 這一集（plan.json captionStyle）→ 預設（shared/setting.json captions，這個版式的）→ F8；這一集只寫幾個欄位時，其他欄位照預設（例：只改 look，字體照頻道的）
export function resolveCaptionStyle({ plan = {}, settings = {}, format = 'landscape' } = {}) {
  const fmt = format === 'portrait' ? 'portrait' : 'landscape';
  const pv = plan?.captionStyle, sv = settings?.captions;
  const { base, errors: sErr } = sv === undefined || sv === null ? { base: {}, errors: [] } : settingFor(sv, fmt);
  const done = (r, from) => {
    const notes = [...r.notes];
    const lift = clampLift(r.style.lift, fmt);
    if (lift !== r.style.lift) notes.push(`${fmt === 'portrait' ? '直式' : '橫式'}的字幕位置只能 ${CAP_LIFT[fmt].min}–${CAP_LIFT[fmt].max}，${r.style.lift} 用 ${lift}`);
    const style = { ...r.style, lift };
    return { style, from, isDefault: isDefaultStyle(style), errors: [], notes };
  };
  if (pv !== undefined && pv !== null) {
    const r = sanitizeCaptionStyle(isObj(pv) ? { ...base, ...pv } : pv, 'plan.json captionStyle');
    if (r.errors.length) return { style: { ...CAP_DEFAULT }, from: 'default', isDefault: true, errors: r.errors, notes: [] };
    return done(r, 'plan');
  }
  if (sErr.length) return { style: { ...CAP_DEFAULT }, from: 'default', isDefault: true, errors: sErr, notes: [] };
  if (Object.keys(base).length) return done(sanitizeCaptionStyle(base), 'setting');
  return { style: { ...CAP_DEFAULT }, from: 'default', isDefault: true, errors: [], notes: [] };
}

// 幾何：照 F8（76 px：行高 71、內距 24／37／23、底板高 118）等比例縮放；lift 往上移（直式往下是負的）
export function captionGeom(style = CAP_DEFAULT, canvas = null) {
  const portrait = formatOf(canvas) === 'portrait';
  const H = portrait ? canvas.H : 1080;
  const size = portrait ? Math.min(style.size, CAP_SIZE.portraitMax) : style.size;
  const lift = clampLift(style.lift, formatOf(canvas));
  const k = size / 76;
  const line = Math.round(71 * k), pt = Math.round(24 * k), pb = Math.round(23 * k), px = Math.round(37 * k);
  const h = line + pt + pb;
  const bottom = (portrait ? Math.round(H - 1350 - h / 2) : 6) + lift;
  return { size, line, pad: [pt, px, pb, px], h, bottom, lift, top: H - bottom - h, low: H - bottom, stroke: Math.max(2, Math.round(size * 0.12)), half: Math.round(40 * k), space: Math.round(19 * k), padW: 2 * px };
}

const familyOf = (style) => {
  const f = CAP_FONTS[style.font];
  return f.family ? `"${f.family}", "Noto Sans TC", sans-serif` : 'var(--cap-font)';
};

// root 的 CSS 變數（剪輯台直接 setProperty；build 寫成屬性）；預設樣式回 null
export const CAP_VARS = Object.freeze(['--cap-family', '--cap-weight', '--cap-size', '--cap-line', '--cap-pad', '--cap-bottom', '--cap-stroke']);
export function captionRootVars(style, canvas = null) {
  if (isDefaultStyle(style)) return null;
  const g = captionGeom(style, canvas);
  return { look: style.look, vars: [['--cap-family', familyOf(style)], ['--cap-weight', String(style.weight)], ['--cap-size', `${g.size}px`], ['--cap-line', `${g.line}px`],
    ['--cap-pad', g.pad.map((n) => `${n}px`).join(' ')], ['--cap-bottom', `${g.bottom}px`], ['--cap-stroke', `${g.stroke}px`]] };
}

export function captionRootAttrs(style, canvas = null) {
  const r = captionRootVars(style, canvas);
  if (!r) return '';
  return ` data-cap="${r.look}" style="${r.vars.map(([k, v]) => `${k}: ${v}`).join('; ').replace(/"/g, '&quot;')}"`;
}

export function fontFiles(style) {
  const f = CAP_FONTS[style?.font];
  if (!f || !f.files.length) return [];
  const exact = f.files.filter((x) => x.w === style.weight || typeof x.w === 'string');
  return exact.length ? exact : [f.files[0]];
}

export function captionFontFace(style, base = 'kit/fonts/') {
  const f = CAP_FONTS[style?.font];
  if (!f?.family) return '';
  return fontFiles(style).map((x) => `@font-face { font-family: "${f.family}"; src: url("${base}${x.file}") format("truetype"); font-weight: ${x.w}; font-display: block; }`).join('\n');
}

export const describeLift = (n) => (!n ? '原位' : n > 0 ? `往上 ${n} px` : `往下 ${-n} px`);
export function describeCaptionStyle(style) {
  const s = { ...CAP_DEFAULT, ...(style || {}) };
  return `${CAP_LOOKS[s.look].zh}、${CAP_FONTS[s.font].zh} ${s.size} px ${CAP_WEIGHTS[s.weight]}${s.lift ? `、${describeLift(s.lift)}` : ''}`;
}
