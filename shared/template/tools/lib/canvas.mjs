// 畫布設定：橫式／直式的幾何常數與換算（specs/009-vertical/spec.md §B FR-010、FR-011、文末「決定」節；spike 見 specs/009-vertical/plan.md D-1）
//
//   橫式：main.mjs、plan.mjs、captions.mjs 仍用自己的常數（橫式輸出逐位元組不變），dev/tests/canvas.test.mjs 確認 CANVAS.landscape 和那些常數一模一樣；
//   直式：一律讀這份（T002-V03–V06 接線：main／plan／captions／assemble／build／status／media.mjs）。
//
//   CANVAS = { landscape, portrait }、canvasOf(format) → 該版式的設定（format 只能是 "landscape"／"portrait"）
//   stageTransform(kind, canvas, { clear }) → 把 1920×1080 子合成縮進直式畫布的 host transform（kind：fs／fx／ch；橫式回 null）
//       { s, tx, ty, rect, css, attr }：css 寫在 host 的 CSS（main 的 GSAP 對 host 只能動 opacity，動 x／y／scale 會蓋掉縮放）；
//       attr＝"data-layout-allow-overflow"（縮放後的子合成超出畫布，不加 hyperframes check 會報 panel_out_of_canvas）
//   stagePoint(st, [x, y]) → 子合成座標換成畫布座標（X = tx + x × s、Y = ty + y × s）
//   regionsOf(canvas) → 具名區域 { band, panelTop, pip, badge, captions, safe[, panelBottom] }，每個 [x, y, w, h]（specs/contracts/motion.md §1）
//   regionsScript(canvas) → 直式時給 index.html 的 <script>window.__regions = {…};</script>；橫式回 ''（原語用自己的橫式預設，輸出不變）
//   resolveFormat({ projectDir, plan, flag, probe }) → { format, source, detail }：--format > plan.json format > 製作進度.md「版式」列 > 主軌寬高比
//   formatLine(r) → 「版式：直式 1080×1920（來源：plan.json）」（FR-003 指令第一行）
//   formatErrors({ projectDir, plan, format, dims }) → ✖ 訊息陣列（FR-004 一致性、決定 5 橫式素材不能做直式；dims＝主軌 { w, h }）
//   captionZoneArg(canvas) → hyperframes check --caption-zone 的值（FR-032；橫式 "x0=0;y0=0.852;x1=1;y1=1;severity=error"）
//
//   矩形寫法：除了 pip.box 與 regionsOf 是 [x, y, w, h]，其他一律 [x0, y0, x1, y1]（照 spec FR-010 表）。

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const FORMATS = ['landscape', 'portrait'];
const ZH = { landscape: '橫式', portrait: '直式' };

export const CANVAS = {
  // 橫式：現行常數搬過來，數值不變（各值出處見 canvas.test.mjs）
  landscape: {
    format: 'landscape', W: 1920, H: 1080, fps: 30,
    unsafe: [],
    textSafe: [[0, 120, 1920, 870]],                       // R4.1 內容區（audit CONTENT_TOP／CONTENT_BOTTOM）
    // F8 剪映樣式（kit/captions.css、lib/captions.mjs CAPTION）：box＝18 字滿寬時的黑底板
    caption: { font: 76, line: 71, weight: 400, stroke: 0, pad: [24, 37, 23], bottom: 6, box: [40, 956, 1880, 1074], zone: [0, 920, 1920, 1080], maxChars: 18, maxW: 1840 },
    lowerThird: { left: 120, bottom: 220, rect: [120, 536, 1020, 860] },
    centerCard: { rect: [510, 536, 1410, 860] },
    badge: { rect: [1200, 56, 1824, 168], side: 'right', dx: 16 },
    pip: { box: [1424, 594, 432, 324], zone: [1424, 581, 1888, 951], aspect: 4 / 3, frame: 'kit/pip-frame.png' },
    stage: { fs: null, fx: null, ch: null },
    media: { view: { contain: [0, 0, 1920, 940], cover: [0, 0, 1920, 1080] } },
    framing: { aspect: 16 / 9, headTop: 120 },
    minTextPx: 30,
    // 具名區域（motion.md §1 的橫式預設，和 kit/scene-motion.js 的 REGIONS 相同）
    regions: { band: [120, 600, 1680, 260], panelTop: [120, 150, 1180, 768], pip: [1424, 594, 432, 324], badge: [1560, 40, 320, 100], captions: [0, 920, 1920, 160], safe: [96, 54, 1728, 972] },
  },
  // 直式：spec FR-010 建議初值＋「決定」節（分割線 y 900、角標左上 y 250）；字幕和橫式同一套（決定 2，16:05 改：76 px／字重 400／底板 118），
  // 只差每則 10 字與位置：底板 118 高置中在字幕帶 zone y 1280–1420 裡＝y 1291–1409（臉 940–1280 下面、平台介面 1440 上面）；
  // maxW＝10 × 76 ＋ 內距 74 ＝ 834，置中 x 123–957（12 字會到 x 47–1033，壓進右側平台按鈕區 x 940 起 93 px；10 字只碰邊 17 px）
  portrait: {
    format: 'portrait', W: 1080, H: 1920, fps: 30,
    unsafe: [[0, 0, 1080, 240], [0, 1440, 1080, 1920], [940, 840, 1080, 1440]],
    textSafe: [[60, 240, 1020, 840], [60, 840, 940, 1440]],
    caption: { font: 76, line: 71, weight: 400, stroke: 0, pad: [24, 37, 23], bottom: 511, box: [123, 1291, 957, 1409], zone: [0, 1280, 1080, 1420], maxChars: 10, maxW: 834 },
    lowerThird: { left: 60, bottom: 680, rect: [60, 880, 940, 1240] },
    centerCard: { left: 60, right: 140, rect: [60, 880, 940, 1240] },
    badge: { rect: [60, 250, 684, 362], side: 'left', dx: -16 },
    pip: { box: [0, 900, 1080, 1020], zone: [0, 900, 1080, 1920], aspect: 1080 / 1020, frame: 'kit/pip-frame-v.png', face: [940, 1280] },
    stage: {
      fs: { window: [120, 130, 1300, 880], to: [40, 240], scale: 0.8475 },
      fx: { opaque: { top: 416, scale: 0.5625 }, clear: { top: 766, scale: 0.5625 } },
      ch: { window: [160, 260, 1760, 870], scale: 0.625, centerY: 860 },
    },
    media: { view: { contain: [0, 240, 1080, 900], cover: [0, 0, 1080, 900], containFull: [0, 240, 1080, 1260], coverFull: [0, 0, 1080, 1920] } },
    framing: { aspect: 9 / 16, headTop: [380, 520], chinMax: 860 },
    minTextPx: 32,
    // 上半資訊面板 1080×900、下半講者面板 1080×1020（決定 1）；band＝lowerThird.rect、badge＝badge.rect、captions＝caption.zone、safe＝textSafe 的外框
    regions: { band: [60, 880, 880, 360], panelTop: [0, 0, 1080, 900], panelBottom: [0, 900, 1080, 1020], pip: [0, 900, 1080, 1020], badge: [60, 250, 624, 112], captions: [0, 1280, 1080, 140], safe: [60, 240, 960, 1200] },
  },
};

export function canvasOf(format = 'landscape') {
  if (!FORMATS.includes(format)) throw new Error(`format 只能是 "landscape" 或 "portrait"（現在是 ${JSON.stringify(format)}）`);
  return CANVAS[format];
}

const r3 = (n) => +Number(n).toFixed(3);

// FR-011：X = to[0] + (x − window[0]) × s、Y = to[1] + (y − window[1]) × s；host 的 CSS 是 translate(tx, ty) scale(s)、transform-origin 0 0
// window 是 [x0, y0, x1, y1]（spike：[120,130,1300,880]＝1180×750，×0.8475＝1000×636）；translate 取小數 3 位
export function stageTransform(kind, canvas = CANVAS.landscape, { clear = false } = {}) {
  const st = canvas.stage?.[kind];
  if (!st) return null;
  let s, tx, ty, win;
  if (kind === 'fx') {
    const v = clear ? st.clear : st.opaque;
    s = v.scale; win = [0, 0, 1920, 1080];
    tx = (canvas.W - 1920 * s) / 2; ty = v.top;
  } else if (kind === 'ch') {
    s = st.scale; win = st.window;
    tx = canvas.W / 2 - ((win[0] + win[2]) / 2) * s; ty = st.centerY - ((win[1] + win[3]) / 2) * s;
  } else {
    s = st.scale; win = st.window;
    tx = st.to[0] - win[0] * s; ty = st.to[1] - win[1] * s;
  }
  tx = r3(tx); ty = r3(ty);
  const rect = [r3(tx + win[0] * s), r3(ty + win[1] * s), r3(tx + win[2] * s), r3(ty + win[3] * s)];
  return { kind, s, tx, ty, window: win, rect, css: `transform: translate(${tx}px, ${ty}px) scale(${s}); transform-origin: 0 0;`, attr: 'data-layout-allow-overflow' };
}
export const stagePoint = (st, [x, y]) => (st ? [r3(st.tx + x * st.s), r3(st.ty + y * st.s)] : [x, y]);

export const regionsOf = (canvas = CANVAS.landscape) => JSON.parse(JSON.stringify(canvas.regions));
// 橫式不注入（原語的橫式預設就是 CANVAS.landscape.regions）；直式給全部名稱
export function regionsScript(canvas = CANVAS.landscape) {
  if (canvas.format === 'landscape') return '';
  return `<script>${regionsJs(canvas)}</script>`;
}
// 直式：具名區域＋全畫面主卡內容區維持 580（舞台窗只到 y 880；橫式是 kit/scene.css 的 --sc-body-h 636）
export const STAGED_BODY_H = 580;
export const regionsJs = (canvas) => `window.__regions = ${JSON.stringify(canvas.regions)}; document.documentElement.style.setProperty('--sc-body-h', '${STAGED_BODY_H}px');`;

// ---- 版式從哪來（FR-003）----
const PROGRESS_RE = /^\|\s*版式\s*\|\s*(直式|橫式)/m;
const FLAG = { landscape: 'landscape', portrait: 'portrait', 橫式: 'landscape', 直式: 'portrait' };
const VIDEO_EXT = /\.(mp4|mov|m4v|mkv|webm|avi)$/i;

// ffprobe 主軌寬高（手機直拍常是 1920×1080＋rotation −90，要轉回顯示方向）
export function probeDims(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:stream_tags=rotate:stream_side_data=rotation', '-of', 'json', file], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  try {
    const s = JSON.parse(r.stdout).streams?.[0];
    if (!s?.width || !s?.height) return null;
    const rot = Math.abs(Number(s.side_data_list?.find((d) => d.rotation != null)?.rotation ?? s.tags?.rotate ?? 0)) % 180;
    return rot === 90 ? { w: s.height, h: s.width } : { w: s.width, h: s.height };
  } catch { return null; }
}

export function resolveFormat({ projectDir = null, plan = null, flag = null, probe = probeDims } = {}) {
  if (flag != null && flag !== false) {
    const f = FLAG[String(flag).trim()];
    if (!f) throw new Error(`--format 只能是 landscape（橫式）或 portrait（直式），現在是 ${JSON.stringify(flag)}`);
    return { format: f, source: 'flag', detail: '--format' };
  }
  if (plan && FORMATS.includes(plan.format)) return { format: plan.format, source: 'plan', detail: 'plan.json' };
  if (!projectDir) return { format: 'landscape', source: 'default', detail: '預設' };
  const prog = path.join(projectDir, 'work', '製作進度.md');
  const m = fs.existsSync(prog) ? fs.readFileSync(prog, 'utf8').match(PROGRESS_RE) : null;
  if (m) return { format: m[1] === '直式' ? 'portrait' : 'landscape', source: 'progress', detail: 'work/製作進度.md' };
  const first = (d) => { const abs = path.join(projectDir, d); return fs.existsSync(abs) ? fs.readdirSync(abs).filter((f) => !f.startsWith('.')).sort()[0] : null; };
  const main = path.join(projectDir, 'work', 'main.mp4');
  const cam = first('assets/camera');
  const src = fs.existsSync(main) ? ['work/main.mp4', main] : cam && VIDEO_EXT.test(cam) ? [`assets/camera/${cam}`, path.join(projectDir, 'assets', 'camera', cam)] : null;
  if (src) {
    const d = probe(src[1]);
    if (d) return { format: d.w < d.h ? 'portrait' : 'landscape', source: 'media', detail: `${src[0]} ${d.w}×${d.h}` };
  }
  if (first('assets/voice')) return { format: 'landscape', source: 'media', detail: '只有聲音（assets/voice/）' };
  return { format: 'landscape', source: 'default', detail: '預設' };
}

// FR-004：版式兩個來源（plan.json、開工決策表）與主軌方向要一致；決定 5：直式專案只收直拍素材（橫轉直是 P2）
export function formatErrors({ projectDir = null, plan = null, format = 'landscape', dims = null } = {}) {
  const out = [];
  const prog = projectDir ? path.join(projectDir, 'work', '製作進度.md') : null;
  const m = prog && fs.existsSync(prog) ? fs.readFileSync(prog, 'utf8').match(PROGRESS_RE) : null;
  const progFmt = m ? (m[1] === '直式' ? 'portrait' : 'landscape') : null;
  const pf = plan && FORMATS.includes(plan.format) ? plan.format : null;
  if (pf && progFmt && pf !== progFmt) out.push(`plan.json 的 format 是 "${pf}"（${ZH[pf]}），work/製作進度.md 開工決策表「版式」是${ZH[progFmt]} → 兩邊改成一樣：plan.json 寫 "format": "${progFmt}"，或開工決策表改成${ZH[pf]}（新增停點紀錄列）`);
  else if (!pf && progFmt === 'portrait') out.push('work/製作進度.md 開工決策表「版式」是直式，plan.json 沒寫 format → plan.json 第一層加 "format": "portrait"（放在 "version" 後面）');
  if (dims && dims.w < dims.h && format === 'landscape') out.push(`主軌是直的（${dims.w}×${dims.h}），版式是橫式 → plan.json 第一層加 "format": "portrait"；真的要做橫式就換橫拍素材`);
  if (dims && dims.w > dims.h && format === 'portrait') out.push(`直式專案的主軌是橫的（${dims.w}×${dims.h}）→ 請提供直拍素材（寬 < 高）放進 assets/camera/；橫式素材轉直式還不支援（P2）`);
  return out;
}

// FR-032：caption.zone 換成比例（小數 3 位）
export function captionZoneArg(canvas = CANVAS.landscape) {
  const [x0, y0, x1, y1] = canvas.caption.zone, f = (v) => String(+v.toFixed(3));
  return `x0=${f(x0 / canvas.W)};y0=${f(y0 / canvas.H)};x1=${f(x1 / canvas.W)};y1=${f(y1 / canvas.H)};severity=error`;
}

export function formatLine({ format, detail }) {
  const c = canvasOf(format);
  return `版式：${ZH[format]} ${c.W}×${c.H}（來源：${detail}）`;
}
