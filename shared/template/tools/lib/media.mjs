// type: "media"：插入螢幕錄影或圖片（plan.json 的一段）
//
//   checkMediaSeg(seg, { projectDir, probe, err, warn }) → media 描述（src、種類、素材資訊、in／speed／fit／volume／enter／exit）或 null
//   validateMedia(it, { cues, tm, pipAt, icons, steps, canvas, badge, err, warn }) → { summary, json }（badge＝小節角標在畫面上的框 { box, side }，plan.json 有 sections 才傳）
//                                                          段落時間定案後：畫面位置、錄影片段（cut 會切開）、運鏡、紅框（含跟捲動）、放大鏡、
//                                                          說明卡 callouts、聚光燈 spot、STEP 膠囊 steps、箭頭 arrows（resolveMedia＝過渡期別名）
//   newStepState()                                         STEP 編號狀態（整份 plan.json 一個）
//   mediaJobs(it)                                          build 要準備的素材檔（轉檔、複製、放大鏡逐格）
//   mediaParts(it, { off, lim, base, nextTrack, mediaDb, edit, outDur }) → { html, tl[] }（主合成用；off＝--test 起點）
//
//   mediaFrame(canvas, { panel })                          版式的畫面幾何（可見區、標註安全區、避讓區、STEP 位置、放大鏡範圍）；
//                                                          canvas＝lib/canvas.mjs 的 canvasOf(format)（不傳＝橫式，輸出和原本逐位元組相同）；
//                                                          直式 panel＝下半有講者面板（pipAt 在段內任一取樣點為真），沒有時用 containFull／coverFull
//
// 座標一律是素材本身的像素（media.mjs frame --grid 讀）；畫面上的位置由這裡換算。
// 錄影 <video> 放在主合成（root），不放子合成（pitfalls §38）；放大鏡用逐格 JPG 畫進 <canvas>，不用第二個 <video>。

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseTime, cueSeconds, r3, FPS } from './time.mjs';
import { probeMedia, VIDEO_EXT, IMAGE_EXT } from './ff.mjs';
import { splitAtJoins, dB } from './edit.mjs';
import { visibleLen, nearest, loadIcons } from './scenes.mjs';
import { CANVAS } from './canvas.mjs';

export const MEDIA_KEYS = ['id', 'type', 'src', 'from', 'to', 'duration', 'anchor', 'in', 'out', 'speed', 'hold', 'retime', 'redact', 'fit', 'pip', 'volume', 'enter', 'exit', 'kenburns', 'moves', 'marks', 'lens', 'sfx', 'sfxVolume', 'callouts', 'spot', 'steps', 'arrows', 'clicks', 'sfxExtra', 'stepsSide', 'side', 'note'];
export const MEDIA_DIRS = ['assets/screen/', 'assets/images/'];
export const TRANSITIONS = ['cut', 'fade', 'slide', 'zoom'];
export const ENTER = { cut: 0, fade: 0.5, slide: 0.6, zoom: 0.5, tape: 0.6 };
export const ENTER_ONLY = ['tape'];   // 只能當進場：圖片縮小貼在全幕背景上，落下貼平、兩條紙膠帶貼上兩個上角（015）
export const EXIT = { cut: 0, fade: 0.5, slide: 0.6, zoom: 0.4 };
// contain：放在字幕帶上方（y 0–940，和作者錄影段「可見區不碰字幕帶」同理）；cover：鋪滿 1920×1080
export const VIEW = { contain: [0, 0, 1920, 940], cover: [0, 0, 1920, 1080] };
export const PIP_ZONE = [1424, 581, 1888, 951];   // 子母畫面外框禁入區 x1, y1, x2, y2
const CAPTION_Y = 920;
const MAX_FILE = [3840, 2160];
const MARK = { pad: 6, sw: 4, draw: 0.4, out: 0.3, min: 0.5, hold: 1, max: 2, rx: 6 };
const LENS = { delay: 0.28, pop: 0.6, back: 0.32, fade: 0.1, min: 1.2, zoom: 2, maxW: 1600, maxH: 720, cx: 960, cy: 450, border: 3, pad: 10, dflt: 3 };
// 運鏡節奏（參考專案作者：「跳來跳去，眼睛受不了」→ 改慢推）：推近／拉回 ≥ 1.5 s，倍率 ≥ 2 時 ≥ 2.2 s；一段 ≤ 2 次；第一次離段起點 ≥ 0.8 s（先看全景）；相鄰兩框倍率比 ≤ 1.4
const MOVE = { dur: 1.5, durBig: 2.2, big: 2, warnZoom: 4, warnPixel: 2.5, max: 2, lead: 0.8, ratio: 1.4 };
const KB = 1.05;
const DECLICK = 0.02;
// 動態 v2（specs/010-motion-v2/design-system.md §5、§7）：從講者進來的錄影面板由小視窗位置長出（P.grow，0.3 s 起、kit 預設 0.8 s expo.out）；
// 標註一個接一個出現時，先出現、還在畫面上的壓暗到 0.5（P.dim 0.4 s），最後一個出現後 2.6 s（或段尾前 1.4 s、最後那個收掉前，取早的）回均衡
export const GROW = { at: 0.3, from: 'pip' };
export const FOCUS = { dim: 0.5, dur: 0.4, eq: 2.6, tail: 1.4, out: 0.3 };

// ---------- 標註（callouts／spot／steps／arrows／marks.path；數字出處見 specs/contracts/media.md §2）----------
const SAFE = [40, 40, 1880, 900];   // 標註文字、箭頭的安全區 x1, y1, x2, y2（字幕區 920 − 20）
// 橫式的畫面幾何（就是上面這些常數）；直式由 mediaFrame() 從 canvas.mjs 算（specs/009-vertical/spec.md FR-080、FR-081）
const LAND = {
  format: 'landscape', W: 1920, H: 1080, view: VIEW, focus: VIEW.contain, screen: [0, 0, 1920, 1080], safe: SAFE, avoid: [],
  pip: PIP_ZONE, pipWhy: '壓到右下角子母畫面', bottom: CAPTION_Y, bottomWhy: '壓到字幕區', top: null,
  step: { left: 48, top: 40 }, lens: { maxW: 1600, maxH: 720, cx: 960, cy: 450, top: 40, bottom: 900, pipLeft: 1320 },
};
const xywh = (r) => [r[0], r[1], r[2] - r[0], r[3] - r[1]];
export function mediaFrame(canvas = null, { panel = true } = {}) {
  if (!canvas || canvas.format !== 'portrait') return LAND;
  const v = canvas.media.view, pad = 20;
  const contain = xywh(panel ? v.contain : v.containFull), cover = xywh(panel ? v.cover : v.coverFull);
  const ts = canvas.textSafe, top = canvas.unsafe[0][3];                       // 上方平台介面 y 0–240
  const bottom = panel ? canvas.pip.box[1] : canvas.caption.zone[1];          // 有講者面板：面板頂 900；沒有：字幕區頂
  const safe = [Math.min(...ts.map((r) => r[0])), top + pad, Math.max(...ts.map((r) => r[2])), bottom - pad];
  // 右側平台按鈕（unsafe 第三塊）：只有沒有講者面板、可見區伸到下面時才碰得到
  const avoid = canvas.unsafe.slice(2).filter((b) => b[1] < safe[3]).map((b) => ({ box: b, why: `壓到右側平台按鈕區（x ${b[0]}–${b[2]}、y ${b[1]}–${b[3]}）` }));
  const L = 2 * (LENS.border + LENS.pad);
  return {
    format: 'portrait', panel, W: canvas.W, H: canvas.H, view: { contain, cover }, focus: contain, screen: [0, 0, canvas.W, panel ? bottom : canvas.H], safe, avoid,
    pip: null, pipWhy: '壓到下半的講者面板', bottom: panel ? bottom : canvas.caption.zone[1], bottomWhy: panel ? '壓到下半的講者面板' : '壓到字幕區', top,
    step: { left: safe[0], top: safe[1] },
    lens: { maxW: safe[2] - safe[0] - L, maxH: safe[3] - safe[1] - L, cx: canvas.W / 2, cy: (safe[1] + safe[3]) / 2, top: safe[1], bottom: safe[3], pipLeft: null },
  };
}
const READ = 1.2, READ_QUICK = 0.8;   // 完整可讀（定案：一般 1.2s、quick 0.8s）
const CALLOUT = { gap: 56, gapV: 40, h: 96, padL: 14, padR: 32, padPlain: 32, icon: 64, iconGap: 20, border: 2, full: 40, half: 24, maxLen: 12,
  edge: 8, lineAt: 0.3, lineDur: 0.25, cardAt: 0.45, cardDur: 0.4, drift: 16, ready: 0.85, quick: 0.25, out: 0.3, elbow: 24, dot: 5 };
const SPOT = { alpha: 0.35, pad: 8, rx: 12, fade: 0.4 };
// 右側步驟清單（seg.side）：錄影放左邊 view（x 120、寬 720，置中），清單卡 x 840、寬 960，在 y 160–880（有講者小視窗：160–560）裡垂直置中
// （使用者：「直式的可以靠左，右邊用動畫講解不是更好？」）
// enter "tape"：截圖縮小放在這一區（上面留給膠帶、下面不碰字幕帶），紙白邊 12、膠帶 132×40
export const TAPE = { view: [200, 90, 1520, 790], w: 132, out: 36, up: 20, drop: 0.35, gap: 0.1, dur: 0.15 };
export const SIDE = { view: [120, 0, 720, 940], x: 840, w: 960, top: 160, bottom: 880, pipBottom: 560, bar: 112, row: 100, pad: 32, maxItems: 5, title: 12, text: 14, gap: 0.8, hi: 0.3, dim: 0.4, done: 0.7 };
const STEP = { left: 48, top: 40, inset: 32, h: 80, extra: 118, maxLen: 12, in: 0.5, inX: -24, swOut: 0.25, swIn: 0.35, swDelay: 0.1, swReady: 0.45, carry: 0.1 };
const ARROW = { gap: 9, lens: [120, 96], head: 30, halfW: 3.5, sample: 2, fade: 0.5, slide: 12, dflt: 3, max: 1, pad: 4, ring: 2 };
const PATH = { dur: 0.4, min: 0.2, max: 2 };
const SIDES = ['right', 'left', 'bottom', 'top'];
const DIRS = { n: [0, -1], ne: [0.7071, -0.7071], e: [1, 0], se: [0.7071, 0.7071], s: [0, 1], sw: [-0.7071, 0.7071], w: [-1, 0], nw: [-0.7071, -0.7071] };
const AUTO_DIRS = ['ne', 'nw', 'se', 'sw', 'e', 'w', 'n', 's'];
const ANN_KEYS = ['callouts', 'spot', 'arrows'];
const FREEZE_WARN = 15;   // 定格超過幾秒提醒
const TEMPLATE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let iconCache = null;

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
const n3 = (x) => String(r3(x));
const even = (x) => Math.max(2, Math.floor(x / 2) * 2);
const inter = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
const ascii = (s) => s.normalize('NFKD').replace(/[^A-Za-z0-9_-]+/g, '').slice(0, 24) || 'media';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// --list 的 media 欄位表（build.mjs 的文字與 --list --json 共用；契約 specs/contracts/media.md §5）
export const MEDIA_FIELDS = [
  ['src', '"assets/screen/<檔名>" 或 "assets/images/<檔名>"', '必填', `相對專案資料夾；影片 .mp4 .mov .m4v .webm、圖片 .jpg .jpeg .png .webp（先跑 media.mjs scan）`],
  ['from／to／duration／anchor', '同其他段', 'to 或 duration 必填', 'rough.srt 的句號或秒數'],
  ['in', '秒數', '0', '錄影從第幾秒開始播；in＋段長×speed 不能超過錄影長度'],
  ['out', '秒數', '—', '錄影播到第幾秒：speed 自動＝(out−in)÷段長（不用寫 speed）；段 ≤ 3 秒時可到 64 倍（快轉跳過等待）'],
  ['speed', '0.5–4', '1', '播放速度（2＝兩倍速）'],
  ['hold', '秒數', '—', '定格：整段停在錄影第幾秒那一格（in／out／speed 不用寫）；標註、放大鏡、運鏡照常'],
  ['retime', '[{ "at", "src" }]', '—', '同一段裡變速、定格：講到 at 時錄影要在第 src 秒，兩點之間自動算速度，src 一樣＝定格；運鏡、紅框跨整段不會斷。第一點之前、最後一點之後是正常速度（錄影用完就停在最後一格）；不保留原聲。和 in／out／speed／hold 擇一'],
  ['redact', '[{ "at", "until", "box": [x,y,w,h] }]', '—', '打碼：框裡的東西模糊後燒進影片（金鑰、密碼、個資）；at、until 不寫＝整段。放大鏡也看不到原文；框要蓋住這段時間裡它會出現的所有位置'],
  ['fit', '"contain"／"cover"', '"contain"', 'contain＝整張看得到、放在字幕帶上方（16:9 縮到 87%），四周黑底；cover＝鋪滿畫面'],
  ['pip', 'true／false', 'true', '右下角子母畫面露臉；只有聲音的區間自動不放'],
  ['volume', 'null 或 −60～+12（dB）', 'null', 'null＝素材靜音；寫數字＝保留素材原聲'],
  ['enter／exit', TRANSITIONS.map((x) => `"${x}"`).join('／') + '（enter 另有 "tape"）', '"fade"', '進場／出場；接在別的整張幕後面時 fade 自動變 cut；"tape"＝圖片縮小貼在全幕背景上、紙膠帶貼兩角（只給圖片、fit "contain"、橫式）'],
  ['moves', '[{ "at", "to": [x,y,w,h] 或 "full", "dur" }]', '—', '運鏡：推近到框、"full" 拉回全景；dur 預設 1 秒。圖片沒寫 moves 時自動慢推（"kenburns": false 關掉）'],
  ['marks', '[{ "at", "until", "box": [x,y,w,h], "path": [{ "at", "box", "dur" }] }]', '—', '紅框：實線 4px、描線進場；同時最多 2 個（callouts 的框也算）、停留 < 0.5s 的拿掉、最後一框多停 1s；until 不寫＝到段尾。path＝錄影捲動時框跟著移（dur 預設 0.4 秒）'],
  ['lens', '[{ "at", "until", "box": [x,y,w,h], "zoom" }]', '—', '放大鏡：從框的位置彈出到畫面中央偏上，zoom 預設 2（1.2–4）；至少 1.2 秒，until 不寫＝at＋3 秒'],
  ['callouts', '[{ "at", "until", "box": [x,y,w,h], "text", "icon", "side", "quick" }]', '—', '標註：紅框＋引線＋說明卡（text 1–12 字、icon 選填）；side 不寫＝自動挑放得下的那邊；完整可讀 ≥ 1.2s（quick ≥ 0.8s）；期間不能有運鏡'],
  ['spot', '[{ "at", "until", "box": [x,y,w,h] }]', '—', '聚光燈：其他地方壓暗 35%，只留框的地方；至少 2 秒、一次一個、不和放大鏡同時'],
  ['side', '{ "title", "items": [{ "at", "text" }] }', '—', '右側步驟清單（橫式、直式／窄的錄影）：錄影靠左（左邊 720 寬），右邊一張卡＝標題（1–12 字）＋1–5 條步驟（每條 1–14 字），一開始淡淡列著、講到 at 那條亮起；有講者小視窗時清單在小視窗上方（最多 2 條）'],
  ['steps', '[{ "at", "text" }]', '—', 'STEP 膠囊（text 1–12 字）放在錄影可見區左上（離錄影邊 32px）；壓到紅框自動換右上，"stepsSide": "right" 指定右上；號碼自動累加，同字沿用；相鄰兩步 ≥ 1.65 秒'],
  ['arrows', '[{ "at", "until", "to": [x,y], "from" }]', '—', '箭頭：箭尖離 to 9px，from＝箭尾方向（n／ne／e／se／s／sw／w／nw，不寫＝自動）；放不下就拿掉；一次一支、至少 2.2 秒，until 不寫＝at＋3 秒'],
  ['clicks', '["#21@安裝", "+3.2"]', '—', '錄影裡看得到游標按下的時間，一下配一顆 click 附加音效（不受 3 秒規則）；時間寫法同 at，要落在這段裡；"sfxExtra": false 會一起關掉'],
  ['sfx', '音效名稱或 null', '不配', '錄影段預設不配'],
  ['sfxVolume', '−60～+12（dB）', '0', '這段音效的音量（每一種段落都能寫）'],
];

function listDir(projectDir, dir) {
  const abs = path.join(projectDir, ...dir.split('/').filter(Boolean));
  return fs.existsSync(abs) ? fs.readdirSync(abs).filter((f) => !f.startsWith('.')).map((f) => `${dir}${f}`) : [];
}

// ---------- 幾何（純函式；測試直接驗 specs/contracts/media.md §1.1 的例題）----------

// 素材 info（width、height）放進可見區（橫式 contain：字幕帶上方 1920×940；cover：鋪滿 1920×1080；直式見 mediaFrame）
export function mediaGeometry(info, fit = 'contain', F = LAND) {
  const W = info.width, H = info.height;
  const [vx, vy, vw, vh] = F.view[fit];
  const k0 = fit === 'cover' ? Math.max(vw / W, vh / H) : Math.min(vw / W, vh / H);
  const dw = Math.round(W * k0), dh = Math.round(H * k0);
  return { kx: dw / W, ky: dh / H, left: Math.round(vx + (vw - dw) / 2), top: Math.round(vy + (vh - dh) / 2), width: dw, height: dh };
}
// 橫式錄影段的小節角標（plan.mjs、main.mjs）：w×h＝角標大小，dflt＝平常的位置 [右緣 x, 上緣 y]；回傳角標右緣 x 與上緣 y
//   錄影旁邊放得下（窄的錄影、直式手機畫面）：放在空白處，不壓錄影（使用者：「有空間的狀態下，沒必要讓標題跟畫面重疊」）
//   放不下：貼著錄影畫面的右上角、離右／上緣 BADGE_INSET，盡量少蓋到錄影的內容（「靠右上一些，減少與下方資訊的重疊」）
const BADGE_INSET = 16, BADGE_GAP = 24;
export function mediaCorner(info, fit = 'contain', { w = 0, h = 80, dflt = [1824, 56] } = {}) {
  const G = mediaGeometry(info, fit, LAND), R = [G.left, G.top, G.left + G.width, G.top + G.height];
  if (inter([dflt[0] - w, dflt[1], dflt[0], dflt[1] + h], R) <= 0) return { right: dflt[0], top: dflt[1] };
  const right = Math.min(LAND.W - BADGE_INSET, Math.round(R[2]) + BADGE_GAP + w);
  if (right - w >= R[2] + BADGE_GAP - 1e-6 && LAND.W - R[2] >= w + BADGE_GAP + BADGE_INSET) return { right, top: dflt[1] };
  return { right: Math.min(LAND.W - BADGE_INSET, Math.round(R[2]) - BADGE_INSET), top: Math.max(BADGE_INSET, Math.round(R[1]) + BADGE_INSET) };
}
// STEP 膠囊和小節角標重複（「設定錄影資料夾」vs「STEP 1｜設定錄影資料夾、新增專案」）：去掉「STEP N」與標點後，一邊包含另一邊
const stepCore = (s) => String(s).replace(/STEP\s*\d+/gi, '').replace(/[\s｜|、，,。：:．.]/g, '');
export const dupStep = (text, name) => { const a = stepCore(text), b = stepCore(name); return a.length >= 2 && b.length >= 2 && (a.includes(b) || b.includes(a)); };
// 素材像素 [x, y, w, h] → stage（沒有運鏡時的畫面座標）
const stageOf = (G, [x, y, w, h]) => [G.left + x * G.kx, G.top + y * G.ky, w * G.kx, h * G.ky];
export { stageOf as toStage };
// stage 矩形 → 畫面（cam＝那一刻的運鏡 { z, x, y }）
export const toScreen = (r, c) => [c.x + c.z * r[0], c.y + c.z * r[1], c.z * r[2], c.z * r[3]];
// 卡片寬度估算：全形 40px、半形 24px（偏保守），加圖示與內距、框線
export const textPx = (s) => [...String(s)].reduce((a, ch) => a + (ch.codePointAt(0) >= 0x20 && ch.codePointAt(0) <= 0x7e ? CALLOUT.half : CALLOUT.full), 0);
export const cardWidth = (text, hasIcon) => CALLOUT.border * 2 + (hasIcon ? CALLOUT.padL + CALLOUT.icon + CALLOUT.iconGap : CALLOUT.padPlain) + textPx(text) + CALLOUT.padR;

const xyxy = (r) => [r[0], r[1], r[0] + r[2], r[1] + r[3]];
const grow = (b, d) => [b[0] - d, b[1] - d, b[2] + d, b[3] + d];
const hits = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
const inSafe = (b, S = SAFE) => b[0] >= S[0] - 1e-6 && b[1] >= S[1] - 1e-6 && b[2] <= S[2] + 1e-6 && b[3] <= S[3] + 1e-6;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ri = (v) => Math.round(v);
const safeWhy = (b, S = SAFE) => `超出安全區（x ${S[0]}–${S[2]}、y ${S[1]}–${S[3]}；卡片 ${ri(b[0])}–${ri(b[2])}, ${ri(b[1])}–${ri(b[3])}）`;

// 說明卡位置：R＝紅框矩形（畫面座標 [x, y, w, h]）、w＝估算卡寬、side＝指定或 null、avoid＝[{ box: [x1,y1,x2,y2], why }]（已只留時間重疊的）
// → { side, card: [x1,y1,x2,y2], anchor, x, top, lead: { d, dot } } 或 { fail: { right: [原因…], … } }
export function placeCallout({ R, w, side = null, avoid = [], F = LAND }) {
  const H = CALLOUT.h, SAFE = F.safe;
  const cy = R[1] + R[3] / 2, cx = R[0] + R[2] / 2;
  const pos = (sd) => {
    if (sd === 'right' || sd === 'left') {
      const T = clamp(cy - H / 2, SAFE[1], SAFE[3] - H);
      const L = sd === 'right' ? R[0] + R[2] + CALLOUT.gap : R[0] - CALLOUT.gap - w;
      return { sd, L, T, C: L + w / 2 };
    }
    const T = sd === 'bottom' ? R[1] + R[3] + CALLOUT.gapV : R[1] - CALLOUT.gapV - H;
    const C = w / 2 > (SAFE[2] - SAFE[0]) / 2 ? cx : clamp(cx, SAFE[0] + w / 2, SAFE[2] - w / 2);
    return { sd, L: C - w / 2, T, C };
  };
  const why = (p) => {
    const b = [p.L, p.T, p.L + w, p.T + H];
    const r = inSafe(b, SAFE) ? [] : [safeWhy(b, SAFE)];
    for (const a of avoid) if (hits(b, a.box) && !r.includes(a.why)) r.push(a.why);
    return r;
  };
  const fail = {};
  const order = side ? [side, ...SIDES.filter((x) => x !== side)] : SIDES;
  for (const sd of order) {
    const p = pos(sd), r = why(p);
    if (r.length) { fail[sd] = r; continue; }
    if (side && sd !== side) return { fail, alt: sd };
    return { side: sd, ...finishCallout(R, p, w, F.W) };
  }
  return { fail, alt: null };
}

function finishCallout(R, p, w, CW = 1920) {
  const H = CALLOUT.h, e = CALLOUT.edge, sd = p.sd;
  const x1 = R[0], y1 = R[1], x2 = R[0] + R[2], y2 = R[1] + R[3];
  let pts;
  if (sd === 'right' || sd === 'left') {
    const fx = sd === 'right' ? x2 : x1, cxEdge = sd === 'right' ? p.L : p.L + w;
    const a = Math.max(y1 + e, p.T + e), b = Math.min(y2 - e, p.T + H - e);
    if (a <= b) pts = [[fx, (a + b) / 2], [cxEdge, (a + b) / 2]];
    else {
      const y0 = (y1 + y2) / 2, mx = sd === 'right' ? cxEdge + CALLOUT.elbow : cxEdge - CALLOUT.elbow;
      pts = [[fx, y0], [mx, y0], [mx, y0 < p.T ? p.T : p.T + H]];
    }
  } else {
    const fy = sd === 'bottom' ? y2 : y1, cyEdge = sd === 'bottom' ? p.T : p.T + H;
    const x = clamp(p.C, x1 + e, x2 - e);
    if (Math.abs(x - p.C) <= w / 2 - e) pts = [[x, fy], [x, cyEdge]];
    else {
      const x0 = (x1 + x2) / 2, my = p.T + H / 2;
      pts = [[x0, fy], [x0, my], [x0 < p.C ? p.L : p.L + w, my]];
    }
  }
  pts = pts.map(([x, y]) => [ri(x), ri(y)]);
  const d = pts.map(([x, y], k) => `${k ? 'L' : 'M'}${x} ${y}`).join(' ');
  const anchor = sd === 'right' ? 'left' : sd === 'left' ? 'right' : 'center';
  const x = anchor === 'left' ? ri(p.L) : anchor === 'right' ? ri(CW - (p.L + w)) : ri(p.C);
  return { card: [p.L, p.T, p.L + w, p.T + H], anchor, x, top: ri(p.T), lead: { d, dot: pts[0] } };
}

// 箭頭位置：P＝目標點（畫面座標）、from＝指定方向或 null、avoid＝[{ box, why }]（卡片、膠囊，已外擴）、rings＝[{ box, why }]（紅框矩形，線上 ±2px 不能碰）、pip＝子母畫面禁入區或 null
// → { ok: true, from, len, tip, base, tail, c1, c2, u, alt（指定方向放不下時，放得下的那個）, why } 或 { ok: false, why: { ne: [原因…], … } }
export function placeArrow({ P, from = null, avoid = [], rings = [], pip = null, F = LAND }) {
  const SAFE = F.safe;
  const order = from ? [from, ...AUTO_DIRS.filter((d) => d !== from)] : AUTO_DIRS;
  const fail = {};
  for (const d of order) {
    let first = null;
    for (const L of ARROW.lens) {
      const g = arrowShape(P, d, L);
      const r = [];
      const out = (q) => q[0] < SAFE[0] || q[0] > SAFE[2] || q[1] < SAFE[1] || q[1] > SAFE[3];
      const inBox = (q, b) => q[0] >= b[0] && q[0] <= b[2] && q[1] >= b[1] && q[1] <= b[3];
      if (g.pts.some(out)) r.push('超出安全區');
      if (pip && g.pts.some((q) => inBox(q, pip))) r.push(F.pipWhy);
      for (const a of avoid) if (g.pts.some((q) => inBox(q, a.box)) && !r.includes(a.why)) r.push(a.why);
      for (const a of rings) {
        const o = grow(a.box, ARROW.ring), i = grow(a.box, -ARROW.ring);
        if (g.pts.some((q) => inBox(q, o) && !(i[0] < i[2] && i[1] < i[3] && q[0] > i[0] && q[0] < i[2] && q[1] > i[1] && q[1] < i[3])) && !r.includes(a.why)) r.push(a.why);
      }
      if (!r.length) return { ok: true, from: d, len: L, ...g, alt: from && d !== from ? d : null, why: fail };
      if (!first) first = r;
    }
    fail[d] = first;
  }
  return { ok: false, why: fail };
}

function arrowShape(P, d, L) {
  const u = DIRS[d], n = [-u[1], u[0]];
  const at = (k, m = 0) => [P[0] + u[0] * k + n[0] * m, P[1] + u[1] * k + n[1] * m];
  const tip = at(ARROW.gap), base = at(ARROW.gap + ARROW.head), tail = at(ARROW.gap + L);
  const c1 = at(ARROW.gap + ARROW.head, ARROW.head / 2), c2 = at(ARROW.gap + ARROW.head, -ARROW.head / 2);
  const pts = [tip, c1, c2];
  for (let k = ARROW.gap + ARROW.head; k <= ARROW.gap + L + 1e-6; k += ARROW.sample) pts.push(at(k, ARROW.halfW), at(k, -ARROW.halfW));
  pts.push(at(ARROW.gap + L, ARROW.halfW), at(ARROW.gap + L, -ARROW.halfW));
  const r2 = (q) => q.map((v) => +v.toFixed(2));
  return { u, tip: r2(tip), base: r2(base), tail: r2(tail), c1: r2(c1), c2: r2(c2), pts };
}

// STEP 膠囊的編號狀態：整份 plan.json 一個，依段落起點順序傳給每個 media 段
export const newStepState = () => ({ n: 0, byText: new Map(), last: null });

// ---------- 第一輪：欄位檢查（時間還沒定案）----------

export function checkMediaSeg(seg, { projectDir, probe = probeMedia, err, warn }) {
  const src = typeof seg.src === 'string' ? seg.src.trim().replace(/\\/g, '/').replace(/^\.\//, '') : '';
  if (!src || !MEDIA_DIRS.some((d) => src.startsWith(d)) || src.split('/').includes('..')) {
    err(`src 要寫專案資料夾裡 assets/screen/ 或 assets/images/ 底下的檔案，例如 "assets/screen/操作示範.mp4"，現在是 ${JSON.stringify(seg.src)}`);
    return null;
  }
  const ext = path.extname(src).toLowerCase();
  const kind = VIDEO_EXT.includes(ext) ? 'video' : IMAGE_EXT.includes(ext) ? 'image' : null;
  if (!kind) { err(`src：「${ext || '沒有副檔名'}」不支援 → 影片用 ${VIDEO_EXT.join(' ')}，圖片用 ${IMAGE_EXT.join(' ')}`); return null; }
  if (!projectDir) { err('media 段要知道專案資料夾：build 加 --project projects/<專案>'); return null; }
  const abs = path.join(projectDir, ...src.split('/'));
  if (!fs.existsSync(abs)) {
    const have = MEDIA_DIRS.flatMap((d) => listDir(projectDir, d));
    err(`src：找不到 ${src} → 檔名要和專案的 assets/ 資料夾裡一模一樣（現有：${have.join('、') || 'assets/screen/、assets/images/ 都是空的'}）`);
    return null;
  }
  let info;
  try { info = probe(abs); } catch (e) { err(`src：${e.message}`); return null; }
  if (!info.width || !info.height) { err(`src：${src} 讀不到畫面（不是影片或圖片）`); return null; }
  if (kind === 'video' && !(info.duration > 0)) { err(`src：${src} 讀不到影片長度`); return null; }

  // 有說明卡、聚光燈、箭頭時畫面要停住對準：圖片預設不慢推
  const hasAnn = ANN_KEYS.some((k) => Array.isArray(seg[k]) && seg[k].length > 0);
  const m = { src, abs, kind, ext, info, in: 0, speed: 1, fit: 'contain', volume: null, enter: 'fade', exit: 'fade', kenburns: kind === 'image' && !hasAnn, hasAnn };
  if (seg.in != null) {
    if (kind === 'image') warn('in：圖片沒有起點，已忽略');
    else if (!isNum(seg.in) || seg.in < 0) err(`in 要是 ≥ 0 的秒數（錄影從第幾秒開始播），現在是 ${JSON.stringify(seg.in)}`);
    else if (seg.in >= info.duration) err(`in：第 ${seg.in}s 已經超過錄影長度 ${info.duration}s`);
    else m.in = r3(seg.in);
  }
  if (seg.speed != null) {
    if (kind === 'image') warn('speed：圖片沒有速度，已忽略');
    else if (!isNum(seg.speed) || seg.speed < 0.5 || seg.speed > 4) err(`speed 要是 0.5–4 的數字（2＝兩倍速），現在是 ${JSON.stringify(seg.speed)}`);
    else m.speed = seg.speed;
  }
  if (seg.out != null) {
    if (kind === 'image') warn('out：圖片沒有終點，已忽略');
    else if (seg.speed != null) err('out 和 speed 擇一：寫 out 時速度由 (out−in)÷段長自動算');
    else if (!isNum(seg.out) || seg.out <= m.in || seg.out > info.duration + 1e-6) err(`out 要是比 in（${m.in}s）大、不超過錄影長度 ${info.duration}s 的秒數（錄影播到第幾秒），現在是 ${JSON.stringify(seg.out)}`);
    else m.out = r3(seg.out);
  }
  if (seg.fit != null) {
    if (!['contain', 'cover'].includes(seg.fit)) err(`fit 只能是 "contain"（整張看得到，放在字幕帶上方）或 "cover"（鋪滿畫面、多的裁掉），現在是 ${JSON.stringify(seg.fit)}`);
    else m.fit = seg.fit;
  }
  if (seg.pip != null && typeof seg.pip !== 'boolean') err(`pip 只能寫 true（右下角子母畫面露臉，預設）或 false（整段不露臉），現在是 ${JSON.stringify(seg.pip)}`);
  if (seg.volume != null) {
    if (!isNum(seg.volume) || seg.volume < -60 || seg.volume > 12) err(`volume 要寫 null（靜音，預設）或 −60～+12 的 dB 數字（保留素材原聲），現在是 ${JSON.stringify(seg.volume)}`);
    else if (kind === 'image' || !info.hasAudio) warn(`volume：${kind === 'image' ? '圖片' : `${src} 本身`}沒有聲音，已忽略`);
    else m.volume = r3(seg.volume);
  }
  // 定格：整段停在素材第 hold 秒那一格，build 抽成一張圖、當圖片放（標註、放大鏡、運鏡照常）
  if (seg.hold != null) {
    if (kind === 'image') warn('hold：圖片本來就不動，已忽略');
    else if (!isNum(seg.hold) || seg.hold < 0 || seg.hold >= info.duration) err(`hold 要是 0 到錄影長度 ${info.duration}s 之間的秒數（定格在錄影第幾秒那一格），現在是 ${JSON.stringify(seg.hold)}`);
    else {
      if (['in', 'out', 'speed', 'volume'].some((k) => seg[k] != null)) warn('hold：定格不播放，in／out／speed／volume 已忽略');
      Object.assign(m, { hold: r3(seg.hold), in: 0, out: null, speed: 1, volume: null, kenburns: false });
    }
  }
  // 同一段裡變速、定格：at 要等字幕時間才算得出來，這裡只檢查形狀（validateMedia 算成 m.retime）
  if (seg.retime != null) {
    if (kind === 'image') warn('retime：圖片不用變速，已忽略');
    else if (!Array.isArray(seg.retime) || seg.retime.length < 2 || !seg.retime.every((k) => k && typeof k === 'object' && !Array.isArray(k) && k.at != null && isNum(k.src))) err(`retime 要寫 [{ "at": "#N@詞", "src": 秒數 }, …]，至少 2 點（講到 at 時錄影在第 src 秒），現在是 ${JSON.stringify(seg.retime)}`);
    else if (['in', 'out', 'speed', 'hold'].some((k) => seg[k] != null)) err('retime 和 in／out／speed／hold 擇一：每個點已經寫了錄影在第幾秒 → 拿掉 in／out／speed／hold');
    else {
      const badSrc = seg.retime.find((k) => k.src < 0 || k.src > info.duration + 1e-6);
      if (badSrc) err(`retime：src ${badSrc.src} 超出錄影長度 ${info.duration}s（要是錄影的第幾秒）`);
      else {
        if (seg.volume != null) warn('retime：變速段不保留原聲，volume 已忽略');
        Object.assign(m, { retimeRaw: seg.retime, in: 0, out: null, speed: 1, volume: null });
      }
    }
  }
  for (const k of ['enter', 'exit']) {
    if (seg[k] == null) continue;
    const ok = k === 'enter' ? [...TRANSITIONS, ...ENTER_ONLY] : TRANSITIONS;
    if (!ok.includes(seg[k])) err(`${k} 只能是 ${ok.map((x) => `"${x}"`).join('、')}，現在是 ${JSON.stringify(seg[k])}`);
    else if (seg[k] === 'tape' && kind !== 'image') err('enter "tape"（紙膠帶貼上）只給圖片用 → 錄影改 "zoom" 或 "fade"');
    else if (seg[k] === 'tape' && m.fit === 'cover') err('enter "tape" 要配 fit "contain"（截圖縮小貼在背景上；cover 鋪滿畫面沒地方貼）→ 拿掉 fit 或換 enter');
    else m[k] = seg[k];
  }
  if (seg.kenburns != null) {
    if (typeof seg.kenburns !== 'boolean') err(`kenburns 只能寫 true 或 false，現在是 ${JSON.stringify(seg.kenburns)}`);
    else if (seg.kenburns && hasAnn) warn('kenburns：有 callouts／spot／arrows 時不做慢推（標註要對準不動的畫面），已忽略');
    else m.kenburns = seg.kenburns;
  }
  for (const k of ['moves', 'marks', 'lens', 'callouts', 'spot', 'steps', 'arrows']) if (seg[k] != null && !Array.isArray(seg[k])) err(`${k} 要寫成陣列（[{ … }, { … }]）`);
  // 轉檔尺寸（只縮不放；yuv420p 要偶數）
  const fsx = Math.min(1, MAX_FILE[0] / info.width, MAX_FILE[1] / info.height);
  m.file = kind === 'video' ? { w: even(info.width * fsx), h: even(info.height * fsx) } : { w: info.width, h: info.height };
  m.file.sx = m.file.w / info.width; m.file.sy = m.file.h / info.height;
  if (m.hold != null) m.kind = 'image';
  return m;
}

// ---------- 第二輪：時間定案後 ----------

// 回傳 { summary（--check 報告那一列的括號內文字）, json（--check --json 的 items[].out.annotations）}，契約 specs/contracts/media.md §4.1
// 「0–5s ×2、5–8s 定格、8–12s ×1」：回報與分鏡表用
export function retimeText(r) {
  const t = (v) => String(Math.round(v * 10) / 10);
  return r.speeds.map((sp, i) => `${t(r.knots[i][0])}–${t(r.knots[i + 1][0])}s ${sp === 0 ? '定格' : `×${sp}`}`).join('、');
}
// 段內第幾秒 ↔ 素材第幾秒；圖片沒有
export function sourceKnots(m, len) {
  if (m.retime) return m.retime.knots;
  if (m.hold != null) return [[0, m.hold], [len, m.hold]];
  if (m.kind !== 'video') return null;
  return [[0, m.in], [len, r3(m.in + len * m.speed)]];
}

// 素材帳本：這段用到素材的哪一段 [起, 迄]（秒）。圖片、定格沒有長度，回 null
function usedRange(it, nextStart) {
  const m = it.media;
  if (!m || m.kind !== 'video' || m.hold != null) return null;
  if (m.retime) { const v = m.retime.knots.map((k) => k[1]); return [Math.min(...v), Math.max(...v)]; }
  // 疊化時前段會多播一點，那不算「用了」：算到下一段開始
  const end = nextStart != null ? Math.min(it.end, nextStart) : it.end;
  const k = sourceKnots(m, r3(end - it.start));
  return k ? [k[0][1], k[k.length - 1][1]] : null;
}
// 同一段素材放了兩次（≥ 1 秒）：items 依起點排序；回傳 [{ it, other, src, from, to }]。圖片：不相鄰的兩段用同一張也算
export const OVERLAP_MIN = 1;
export function mediaOverlaps(items) {
  const list = items.filter((x) => x.type === 'media' && x.media);
  const out = [];
  list.forEach((it, i) => {
    const r = usedRange(it, list[i + 1]?.start);
    for (let j = 0; j < i; j++) {
      const o = list[j];
      if (o.media.src !== it.media.src) continue;
      if (it.media.kind === 'image' && it.media.hold == null) {
        if (o.media.kind === 'image' && o.media.hold == null && o.end < it.start - 0.1) { out.push({ it, other: o, src: it.media.src, from: null, to: null }); break; }
        continue;
      }
      const q = usedRange(o, list[j + 1]?.start);
      if (!r || !q) continue;
      const a = Math.max(r[0], q[0]), b = Math.min(r[1], q[1]);
      if (b - a >= OVERLAP_MIN - 1e-6) { out.push({ it, other: o, src: it.media.src, from: r3(a), to: r3(b) }); break; }
    }
  });
  return out;
}
const SHOWN_EXT = [...VIDEO_EXT, ...IMAGE_EXT];
// assets/screen/、assets/images/ 用了幾個、哪些沒用到（--review 印）
export function assetUsage(projectDir, scenes) {
  const used = new Set((scenes || []).filter((x) => x?.type === 'media' && x.src).map((x) => String(x.src).replace(/\\/g, '/').replace(/^\.\//, '')));
  const one = (dir) => {
    const all = listDir(projectDir, dir).filter((f) => SHOWN_EXT.includes(path.extname(f).toLowerCase()));
    return { total: all.length, used: all.filter((f) => used.has(f)).length, unused: all.filter((f) => !used.has(f)).map((f) => path.basename(f)) };
  };
  return { screen: one('assets/screen/'), images: one('assets/images/') };
}

export function validateMedia(it, { cues, tm, pipAt = () => false, icons = null, steps: stepState = null, canvas = null, badge = null, err, warn }) {
  const m = it.media, seg = it.seg;
  const s = it.start, e = it.end;
  const W = m.info.width, H = m.info.height;

  // 版式：直式時講者面板（下半）在不在決定可見區（FR-080）；橫式＝原本的常數
  const cv = canvas || it.canvas || null;
  let F = m.frame = mediaFrame(cv, { panel: [s, (s + e) / 2, e - 0.01].some((t) => pipAt(t)) });
  // 右側步驟清單：錄影改放左邊、清單卡的位置（條數決定高度；有講者小視窗時在小視窗上方）
  const sd = seg.side;
  m.side = null;
  if (sd != null) {
    const n = Array.isArray(sd?.items) ? sd.items.length : 0;
    if (F.format === 'portrait') err('side（右側步驟清單）只在橫式用：直式畫面放不下左右兩欄 → 拿掉 side');
    else if (m.fit === 'cover') err('side 要配 fit "contain"（cover 鋪滿畫面，右邊沒有空位）→ 拿掉 fit 或拿掉 side');
    else if (!sd || typeof sd !== 'object' || Array.isArray(sd)) err(`side 要寫成 { "title": "…", "items": [{ "at": "#N@詞", "text": "…" }] }，現在是 ${JSON.stringify(sd)}`);
    else if (n < 1 || n > SIDE.maxItems) err(`side.items 要寫 1–${SIDE.maxItems} 條 [{ "at": "#N@詞", "text": "…" }]，現在是 ${JSON.stringify(sd.items)}`);
    else {
      const pipOn = [s, (s + e) / 2, e - 0.01].some((t) => pipAt(t));
      const bottom = pipOn ? SIDE.pipBottom : SIDE.bottom, h = SIDE.bar + n * SIDE.row + 2 * SIDE.pad;
      if (h > bottom - SIDE.top) err(`side 有 ${n} 條放不下（${pipOn ? '有講者小視窗，清單在小視窗上方，' : ''}最多 ${Math.floor((bottom - SIDE.top - SIDE.bar - 2 * SIDE.pad) / SIDE.row)} 條）→ 合併幾條`);
      else {
        const box = [SIDE.x, Math.round(SIDE.top + (bottom - SIDE.top - h) / 2), SIDE.w, h];
        m.side = { title: '', items: [], box };
        F = m.frame = { ...F, view: { contain: SIDE.view, cover: SIDE.view }, focus: SIDE.view, avoid: [...(F.avoid || []), { box: [box[0], box[1], box[0] + box[2], box[1] + box[3]], why: '壓到右側步驟清單' }] };
      }
    }
  } else if (it.enterFx === 'tape' && F.format === 'portrait') {
    warn('enter "tape" 只在橫式用（直式畫面太窄，縮小貼上看不清楚）→ 這段改用 "zoom" 進場');
    it.enterFx = 'zoom';
  } else if (it.enterFx === 'tape') {
    F = m.frame = { ...F, view: { ...F.view, contain: TAPE.view }, focus: TAPE.view };
  } else if (F.format !== 'portrait' && m.fit !== 'cover' && W / H < 0.8) {
    warn(`直式錄影（${W}×${H}）在橫式影片只佔中間一條、兩邊空著 → 加 "side": { "title": "…", "items": [{ "at": "#N@詞", "text": "…" }] }：錄影靠左、右邊列步驟，講到哪一條亮哪一條`);
  }
  // 畫面位置（stage 座標＝沒有運鏡時的畫面座標：橫式 1920×1080、直式 1080×1920）
  const G = m.geo = mediaGeometry(m.info, m.fit, F);
  const [VX, VY, VW, VH] = F.view[m.fit], [FX, FY, FW, FH] = F.focus;
  const toStage = (b) => stageOf(G, b);

  // 錄影片段：接點（cut）切開，檔案的第 t 秒＝素材的第 t×speed 秒
  if (m.kind === 'video' && !m.retimeRaw) {
    const r0 = tm.unmapStart(s);
    const [rs, re] = it.rough0 || [r0, tm.unmapEnd(e)];
    // out：速度由素材起訖與段長算；段 ≤ 3 秒的快轉（跳過等待）可到 64 倍
    if (m.out != null) {
      const len = r3(re - rs), sp = r3((m.out - m.in) / len);
      if (sp < 0.5) err(`out：素材 ${m.in}–${m.out}s 只有 ${r3(m.out - m.in)}s，放進 ${len}s 的段要慢到 ×${sp}（下限 0.5）→ out 改大，或段落縮短`);
      else if (sp > 64 || (sp > 4 && len > 3)) err(`out：素材 ${m.in}–${m.out}s 放進 ${len}s 的段要 ×${sp}（一般上限 4；段 ≤ 3 秒的快轉上限 64）→ 拆成兩段、中間等待的部分另開一段短的快轉`);
      else {
        if (sp > 4) warn(`out：×${sp} 快轉 ${len}s（跳過等待）；確定畫面只是在等，不是要看的操作`);
        m.speed = sp;
      }
    }
    const fileDur = m.info.duration / m.speed;
    const pieces = splitAtJoins(s, e, tm).map((p) => ({ s: p.s, e: p.e, fms: r3(m.in / m.speed + (p.ms - r0)) }));
    const need = r3(m.in + (re - rs) * m.speed);
    if (need > m.info.duration + 1 / FPS + 1e-6) {
      err(`素材 ${m.src} 長 ${m.info.duration}s；從第 ${m.in}s 起播 ${r3(re - rs)}s${m.speed !== 1 ? `（×${m.speed}）` : ''} 要用到第 ${need}s → to 提早、in 改小，或 speed 改小`);
    }
    m.pieces = [];
    for (const p of pieces) {
      const room = r3(fileDur - 1 / FPS - p.fms);
      if (room <= 0.05) continue;
      m.pieces.push({ s: p.s, e: r3(Math.min(p.e, p.s + room)), fms: p.fms });
    }
  }

  // 時間：#N／#Ne／+秒（本段起點後）
  const tAt = (v, what) => {
    const t = parseTime(v);
    if (t.error) { err(`${what}：${t.error}`); return null; }
    // 原文照 cli-005 §3.3：建議值＝寫的秒數 − 本段起點（算出來是負的就給格式範例）
    if (t.kind === 'abs') { const off = r3(t.sec - s); err(`${what}：不能寫絕對秒數「${t.raw}」→ 改成 "+${off >= 0 ? off : 3.2}"（本段起點後幾秒）或 "#N"（綁字幕句）`); return null; }
    if (t.kind === 'rel') return r3(s + t.off);
    const c = cueSeconds(t, cues);
    if (c.error) { err(`${what}：${c.error}`); return null; }
    return c.sec;
  };
  const inSeg = (t, what) => {
    if (t < s - 1e-6 || t > e + 1e-6) { err(`${what}（${fmt(t)}）不在這段 ${fmt(s)}–${fmt(e)} 裡 → 改成這段範圍內的句號或 +秒數`); return false; }
    return true;
  };
  const boxOf = (b, what) => {
    if (!Array.isArray(b) || b.length !== 4 || !b.every(isNum) || b[2] <= 0 || b[3] <= 0) {
      err(`${what} 要寫 [x, y, w, h]（素材本身的像素座標，用 media.mjs frame --grid 截格線圖讀），現在是 ${JSON.stringify(b)}`);
      return null;
    }
    const [x, y, w, h] = b;
    if (x < -2 || y < -2 || x + w > W + 2 || y + h > H + 2) {
      err(`${what} [${b.join(', ')}] 超出素材範圍 ${W}×${H} → 座標是素材原尺寸的像素（不是 ${F.W}×${F.H} 的畫面座標），用 media.mjs frame --grid 重讀`);
      return null;
    }
    const cx = Math.max(0, x), cy = Math.max(0, y);
    return [cx, cy, Math.min(W, x + w) - cx, Math.min(H, y + h) - cy];
  };
  const keysOk = (o, what, keys) => {
    if (!o || typeof o !== 'object' || Array.isArray(o)) { err(`${what} 要是物件`); return false; }
    let ok = true;
    for (const k of Object.keys(o)) if (!keys.includes(k)) { err(`${what}.${k}：沒有這個欄位（可用：${keys.join('、')}）`); ok = false; }
    return ok;
  };

  // --- 同一段裡變速、定格（retime）：檔案就是這一段，長度＝段長，第 t 秒＝照 knots 內插的素材秒數 ---
  m.retime = null;
  if (m.kind === 'video' && m.retimeRaw) {
    const r0 = tm.unmapStart(s);
    const [, re] = it.rough0 || [r0, tm.unmapEnd(e)];
    const len = r3(re - r0);
    const pts = [];
    let bad = false, clipped = false;
    m.retimeRaw.forEach((k, i) => {
      if (clipped) return;
      const t = tAt(k.at, `retime[${i}].at`);
      if (t == null) { bad = true; return; }
      const rel = r3(tm.unmapStart(t) - r0), prev = pts[pts.length - 1];
      // 段被調短（剪輯台拖邊緣）：相對時間 +秒 超過段尾的點，改成段尾那一格，速度不變
      if (/^\+/.test(String(k.at)) && t > e + 1e-6 && prev && rel > prev[0]) {
        pts.push([len, r3(prev[1] + (k.src - prev[1]) * (len - prev[0]) / (rel - prev[0])), i]);
        clipped = true;
        return;
      }
      if (inSeg(t, `retime[${i}].at`)) pts.push([rel, r3(k.src), i]); else bad = true;
    });
    let ok = !bad;
    for (let i = 1; ok && i < pts.length; i++) {
      if (pts[i][0] <= pts[i - 1][0] + 0.05) { err(`retime[${pts[i][2]}].at 要比前一點晚 → 照講的順序寫，兩點至少隔 0.1 秒`); ok = false; }
      else if (pts[i][1] < pts[i - 1][1] - 1e-6) { err(`retime[${pts[i][2]}].src（${pts[i][1]}s）比前一點（${pts[i - 1][1]}s）小：錄影不能倒帶 → src 要一路變大，一樣＝定格`); ok = false; }
    }
    if (ok) {
      const knots = pts.map(([t, src]) => [t, src]);
      // 第一點之前、最後一點之後：正常速度；素材不夠就停在那一格
      if (knots[0][0] > 0.01) knots.unshift([0, r3(Math.max(0, knots[0][1] - knots[0][0]))]);
      const last = knots[knots.length - 1];
      if (last[0] < len - 0.01) knots.push([len, r3(Math.min(m.info.duration, last[1] + (len - last[0])))]);
      const speeds = [];
      for (let i = 1; i < knots.length; i++) {
        const dt = knots[i][0] - knots[i - 1][0], sp = r3((knots[i][1] - knots[i - 1][1]) / dt);
        speeds.push(sp);
        if (sp > 0 && sp < 0.25) err(`retime：第 ${r3(knots[i - 1][0])}–${r3(knots[i][0])} 秒要慢到 ×${sp}（下限 0.25，太慢畫面會一格一格跳）→ src 拉開，或改成定格（src 一樣）`);
        else if (sp > 64 || (sp > 16 && dt > 3)) err(`retime：第 ${r3(knots[i - 1][0])}–${r3(knots[i][0])} 秒要 ×${sp}（上限 ×16，3 秒內的跳過等待可到 ×64）→ 多留一點時間給這段，或 src 改小`);
      }
      m.retime = { knots, speeds, len };
      m.pieces = splitAtJoins(s, e, tm).map((p) => ({ s: p.s, e: p.e, fms: r3(p.ms - r0) }));
    } else m.pieces = [];
  }

  // --- 打碼（redact）：框的座標換成轉出來的檔案尺寸，時間換成檔案的秒數，轉檔時燒進去 ---
  m.redact = [];
  if (Array.isArray(seg.redact)) {
    const r0 = tm.unmapStart(s);
    const fileAt = (t) => (m.retime ? r3(tm.unmapStart(t) - r0) : r3(m.in / m.speed + (tm.unmapStart(t) - r0)));
    seg.redact.forEach((rd, i) => {
      const what = `redact[${i}]`;
      if (!keysOk(rd, what, ['at', 'until', 'box'])) return;
      const box = boxOf(rd.box, `${what}.box`);
      if (!box) return;
      let at = null, until = null;
      if (m.kind === 'video' && m.hold == null) {
        if (rd.at != null) { const t = tAt(rd.at, `${what}.at`); if (t != null && inSeg(t, `${what}.at`)) at = fileAt(t); }
        if (rd.until != null) { const t = tAt(rd.until, `${what}.until`); if (t != null && inSeg(t, `${what}.until`)) until = fileAt(t); }
      } else if (rd.at != null || rd.until != null) warn(`${what}：這段畫面不會動，at／until 已忽略（整段都打碼）`);
      const sx = m.file.sx, sy = m.file.sy;
      m.redact.push({ i, at, until, box: [box[0] * sx, box[1] * sy, box[2] * sx, box[3] * sy].map((v) => Math.round(v)) });
    });
  } else if (seg.redact != null) err('redact 要寫成陣列（[{ "box": [x, y, w, h] }]）');

  // --- 右側步驟清單：標題、每一條的字與時間 ---
  if (m.side) {
    if (keysOk(sd, 'side', ['title', 'items'])) {
      const title = typeof sd.title === 'string' ? sd.title.trim() : '';
      if (!title || visibleLen(title) > SIDE.title) err(`side.title 要寫 1–${SIDE.title} 字（這一段在做什麼，例「配對手機」），現在是 ${JSON.stringify(sd.title)}`);
      m.side.title = title;
    }
    sd.items.forEach((x, i) => {
      const what = `side.items[${i}]`;
      if (!keysOk(x, what, ['at', 'text'])) return;
      const text = typeof x.text === 'string' ? x.text.trim() : '';
      if (!text || visibleLen(text) > SIDE.text) { err(`${what}.text 要寫 1–${SIDE.text} 字，現在是 ${JSON.stringify(x.text)} → 縮短`); return; }
      const at = tAt(x.at, `${what}.at`);
      if (at == null || !inSeg(at, `${what}.at`)) return;
      const prev = m.side.items[m.side.items.length - 1];
      if (prev && at <= prev.at + 1e-6) { err(`${what}.at（${fmt(at)}）要晚於前一條（${fmt(prev.at)}）→ 照講的順序排`); return; }
      if (prev && at - prev.at < SIDE.gap - 1e-6) warn(`${what} 和前一條只差 ${r3(at - prev.at)}s（< ${SIDE.gap}s）→ 亮起來馬上又換，合併成一條或把 at 往後挪`);
      m.side.items.push({ i, at, text });
    });
  }

  // --- 運鏡 ---
  const ID = { z: 1, x: 0, y: 0 };
  const camFor = (box) => {
    const [X, Y, Wd, Ht] = toStage(box);
    let z = Math.min(FW / Wd, FH / Ht);
    if (z < 1) z = 1;
    let tx = FX + FW / 2 - z * (X + Wd / 2), ty = FY + FH / 2 - z * (Y + Ht / 2);
    const mw = z * G.width, mh = z * G.height;
    tx = mw >= VW ? Math.min(VX - z * G.left, Math.max(VX + VW - z * (G.left + G.width), tx)) : VX + (VW - mw) / 2 - z * G.left;
    ty = mh >= VH ? Math.min(VY - z * G.top, Math.max(VY + VH - z * (G.top + G.height), ty)) : VY + (VH - mh) / 2 - z * G.top;
    return { z: +z.toFixed(4), x: +tx.toFixed(1), y: +ty.toFixed(1) };
  };
  m.cams = [];
  let prev = ID, prevEnd = -Infinity;
  (seg.moves || []).forEach((mv, i) => {
    const what = `moves[${i}]`;
    if (!keysOk(mv, what, ['at', 'to', 'dur'])) return;
    const at = tAt(mv.at, `${what}.at`);
    if (at == null || !inSeg(at, `${what}.at`)) return;
    let dur = null;
    if (mv.dur != null) {
      if (!isNum(mv.dur) || mv.dur < 0.2 || mv.dur > 5) { err(`${what}.dur 要是 0.2–5 的秒數，現在是 ${JSON.stringify(mv.dur)}`); return; }
      dur = mv.dur;
    }
    let to;
    if (mv.to === 'full') to = ID;
    else {
      const box = boxOf(mv.to, `${what}.to`);
      if (!box) return;
      to = camFor(box);
      const [, , Wd, Ht] = toStage(box);
      const want = Math.min(FW / Wd, FH / Ht);
      if (want < 1) warn(`${what}.to 的框比畫面還大，推不近（已維持原大小）→ 框小一點，或寫 "full"`);
      else if (want > MOVE.warnZoom) warn(`${what}.to 要放大 ${r3(want)} 倍，畫面會糊 → 框大一點，或改用放大鏡 lens`);
      else if (want * G.kx > MOVE.warnPixel) warn(`${what}.to 放大後素材每個像素變 ${r3(want * G.kx)} 倍（素材 ${W}×${H}，超過 ${MOVE.warnPixel} 倍），字會糊 → 框大一點，或錄影時用更高的解析度`);
    }
    const zoom = Math.max(prev.z, to.z), slow = zoom >= MOVE.big - 1e-6 ? MOVE.durBig : MOVE.dur;
    if (dur == null) dur = slow;
    else if (dur < slow - 1e-6) warn(`${what} ${dur}s 太快（${r3(zoom)} 倍要 ≥ ${slow}s），看的人眼睛跟不上 → dur 改 ${slow}，或不寫用預設`);
    if (i === 0 && at < s + MOVE.lead - 1e-6) warn(`${what} 在段起點後 ${r3(at - s)}s 就動，觀眾還沒看清全景 → at 至少 "+${MOVE.lead}"`);
    if (prev !== ID && to !== ID && Math.max(prev.z, to.z) / Math.min(prev.z, to.z) > MOVE.ratio + 1e-6) warn(`${what} 從 ${r3(prev.z)} 倍直接換到 ${r3(to.z)} 倍，跳太大 → 先 "full" 拉回，或拆成兩段硬切`);
    if (at < prevEnd - 1e-6) { err(`${what}.at（${fmt(at)}）在上一個運鏡還沒結束（${fmt(prevEnd)}）時開始 → 往後挪，或把上一個的 dur 改短`); return; }
    if (at + dur > e + 1e-6) { warn(`${what} 在段尾之後才結束，dur 已縮成 ${r3(e - at)}s`); dur = r3(e - at); }
    if (dur < 0.2) return;
    m.cams.push({ i, t0: at, dur: r3(dur), from: prev, to });
    prev = to; prevEnd = at + dur;
  });
  if (m.cams.length > MOVE.max) warn(`moves 一段有 ${m.cams.length} 次運鏡（建議 ≤ ${MOVE.max}），畫面跳來跳去 → 留最重要的推近，其他改放大鏡 lens 或拆段`);
  m.kb = m.kenburns && !m.cams.length;
  if (m.kenburns && m.cams.length && seg.kenburns === true) warn('kenburns：有 moves 時不做慢推（Ken Burns），已忽略');
  const kbTo = m.kbTo = { z: KB, x: +((G.left + G.width / 2) * (1 - KB)).toFixed(1), y: +((G.top + G.height / 2) * (1 - KB)).toFixed(1) };
  const camAt = (t) => {
    if (m.kb) { const p = Math.min(1, Math.max(0, (t - s) / Math.max(0.001, e - s))); return { z: 1 + (KB - 1) * p, x: kbTo.x * p, y: kbTo.y * p }; }
    let c = ID;
    for (const mv of m.cams) {
      if (t < mv.t0) break;
      if (t >= mv.t0 + mv.dur) { c = mv.to; continue; }
      const p = (t - mv.t0) / mv.dur;
      return { z: mv.from.z + (mv.to.z - mv.from.z) * p, x: mv.from.x + (mv.to.x - mv.from.x) * p, y: mv.from.y + (mv.to.y - mv.from.y) * p };
    }
    return c;
  };
  const moving = (a, b) => m.kb ? false : m.cams.some((mv) => mv.t0 < b - 1e-6 && mv.t0 + mv.dur > a + 1e-6);

  // --- 紅框 ---
  const marks = [];
  (seg.marks || []).forEach((mk, i) => {
    const what = `marks[${i}]`;
    if (!keysOk(mk, what, ['at', 'until', 'box', 'path'])) return;
    const at = tAt(mk.at, `${what}.at`);
    if (at == null || !inSeg(at, `${what}.at`)) return;
    let until = mk.until != null ? tAt(mk.until, `${what}.until`) : e;
    if (until == null) return;
    const box = boxOf(mk.box, `${what}.box`);
    if (!box) return;
    if (until > e) until = e;
    if (until <= at + 1e-6) { err(`${what}.until（${fmt(until)}）要晚於 at（${fmt(at)}）`); return; }
    if (until - at < MARK.min - 1e-6) { warn(`${what} 只停 ${r3(until - at)}s（< ${MARK.min}s，閃一下就不見），已拿掉 → 要留就把 until 往後延`); return; }
    // 跟捲動：同一個框依序移到新位置
    const path = [];
    if (mk.path != null) {
      if (!Array.isArray(mk.path)) err(`${what}.path 要寫成陣列 [{ "at", "box": [x,y,w,h], "dur" }] → 一步一個物件，照時間先後排`);
      else mk.path.forEach((p, k) => {
        const pw = `${what}.path[${k}]`;
        if (!keysOk(p, pw, ['at', 'box', 'dur'])) return;
        const pa = tAt(p.at, `${pw}.at`);
        if (pa == null || !inSeg(pa, `${pw}.at`)) return;
        const pb = boxOf(p.box, `${pw}.box`);
        if (!pb) return;
        let dur = PATH.dur;
        if (p.dur != null) {
          if (!isNum(p.dur) || p.dur < PATH.min || p.dur > PATH.max) { err(`${pw}.dur 要是 ${PATH.min}–${PATH.max} 的秒數（預設 ${PATH.dur}；跟捲動用錄影捲動的秒數），現在是 ${JSON.stringify(p.dur)} → 改成這個範圍的秒數，或刪掉 dur`); return; }
          dur = p.dur;
        }
        path.push({ k, at: pa, box: pb, dur: r3(dur) });
      });
    }
    marks.push({ i, at, until, box, path });
  });
  if (marks.length) {
    const last = marks.reduce((a, b) => (b.until > a.until ? b : a));
    if (last.until < e - 1e-6) last.until = r3(Math.min(e, last.until + MARK.hold));   // 段尾最後一框講完再多停 1s
  }
  for (const mk of marks) {
    let prevEnd = mk.at + MARK.draw;
    mk.path = mk.path.filter((p) => {
      const pw = `marks[${mk.i}].path[${p.k}]`;
      if (p.at < mk.at + MARK.draw - 1e-6 || p.at + p.dur > mk.until - MARK.out + 1e-6) {
        err(`${pw}.at（${fmt(p.at)}）要在紅框描完（${fmt(mk.at + MARK.draw)}）之後、${fmt(mk.until - MARK.out - p.dur)} 之前到 → 改 at，或把 marks[${mk.i}].until 往後延`);
        return false;
      }
      if (p.at < prevEnd - 1e-6) { err(`${pw}.at（${fmt(p.at)}）在上一次移動還沒結束（${fmt(prevEnd)}）時開始 → 往後挪，或把上一次的 dur 改短`); return false; }
      prevEnd = p.at + p.dur;
      return true;
    });
  }

  // --- 說明卡：先驗欄位與時間（紅框數要一起算）；位置等運鏡、膠囊定了再擺 ---
  const callouts = [];
  if (Array.isArray(seg.callouts)) seg.callouts.forEach((co, i) => {
    const what = `callouts[${i}]`;
    if (!keysOk(co, what, ['at', 'until', 'box', 'text', 'icon', 'side', 'quick'])) return;
    const at = tAt(co.at, `${what}.at`);
    if (at == null || !inSeg(at, `${what}.at`)) return;
    let until = co.until != null ? tAt(co.until, `${what}.until`) : e;
    if (until == null) return;
    if (until > e) until = e;
    if (until <= at + 1e-6) { err(`${what}.until（${fmt(until)}）要晚於 at（${fmt(at)}）→ until 往後延，或不寫（預設到段尾）`); return; }
    const box = boxOf(co.box, `${what}.box`);
    if (!box) return;
    const text = typeof co.text === 'string' ? co.text.trim() : '';
    if (!text || /[\r\n]|(?<!:)\/\//.test(text)) { err(`${what}.text 要寫 1–${CALLOUT.maxLen} 字的說明（名詞或一句重點），現在是 ${JSON.stringify(co.text)} → 補上畫面上要強調的名詞或動作`); return; }
    const len = visibleLen(text);
    if (len > CALLOUT.maxLen) { err(`${what}.text「${text}」有 ${len} 字（上限 ${CALLOUT.maxLen}）→ 縮成名詞或一句重點，細節交給講解`); return; }
    let iconSvg = null;
    if (co.icon != null && co.icon !== 'none') {
      const lib = icons || (iconCache ||= loadIcons(TEMPLATE_DIR));
      iconSvg = typeof co.icon === 'string' ? lib.get(co.icon) : null;
      if (!iconSvg) { err(`${what}.icon：找不到圖示「${co.icon}」（kit/icons.json；相近：${nearest(String(co.icon), lib.names).join('、')}）→ 改成相近的名稱，或拿掉 icon`); return; }
    }
    if (co.side != null && !SIDES.includes(co.side)) { err(`${what}.side 只能是 "right"、"left"、"top"、"bottom"（不寫＝自動挑放得下的那一邊），現在是 ${JSON.stringify(co.side)} → 改成這四個之一，或刪掉 side`); return; }
    if (co.quick != null && typeof co.quick !== 'boolean') { err(`${what}.quick 只能寫 true（框、線、卡一起淡入 ${CALLOUT.quick} 秒，給短句用）或 false → 改成 true 或 false（不加引號）`); return; }
    const quick = co.quick === true;
    const ready = r3(at + (quick ? CALLOUT.quick : CALLOUT.ready));
    const read = r3(until - CALLOUT.out - ready), need = quick ? READ_QUICK : READ;
    if (read < need - 1e-6) {
      err(`${what} 完整可讀只有 ${read}s（要 ≥ ${need}s：${quick ? 'quick 在' : '卡片在'} at＋${quick ? CALLOUT.quick : CALLOUT.ready}s 到位、until 前 ${CALLOUT.out}s 開始淡出）→ until 延到 ${fmt(ready + need + CALLOUT.out)} 之後${quick ? '' : '，或寫 "quick": true'}`);
      return;
    }
    callouts.push({ i, at, until, box, text, iconSvg, side: co.side ?? null, quick, ready });
  });

  // 同一時間的紅框（marks＋callouts 的框）≤ 2
  const frames = [...marks.map((x) => ({ at: x.at, until: x.until, co: false })), ...callouts.map((x) => ({ at: x.at, until: x.until, co: true }))];
  const crowded = new Set();
  for (const a of frames) {
    const on = frames.filter((b) => b.at <= a.at + 1e-6 && b.until > a.at + 1e-6);
    const n = on.length;
    if (n > MARK.max && !crowded.has(n)) { crowded.add(n); err(`marks：${fmt(a.at)} 同時有 ${n} 個紅框（最多 ${MARK.max} 個）${on.some((b) => b.co) ? '；callouts 的框也算在內' : ''} → 位置相近的合成一個大框，或錯開 at／until`); }
  }
  m.marks = marks.map((mk, n) => {
    const c = camAt(mk.at);
    const off = (MARK.pad + MARK.sw / 2) / c.z;
    const one = Math.abs(c.z - 1) < 1e-6;
    const q = (v) => (one ? Math.round(v) : +v.toFixed(2));
    const rectOf = (box) => { const [X, Y, Wd, Ht] = toStage(box); return [q(X - off), q(Y - off), q(Wd + 2 * off), q(Ht + 2 * off)]; };
    const rect = rectOf(mk.box);
    const told = new Set();
    const once = (key, text) => { if (!told.has(key)) { told.add(key); warn(text); } };
    const check = (r, t, name, when = '') => {
      const scr = toScreen(r, camAt(t));
      const sb = [scr[0], scr[1], scr[0] + scr[2], scr[1] + scr[3]];
      if (F.pip && pipAt(t) && inter(sb, F.pip) > 0) once(`${name}p`, `${name}${when} 在畫面上會被右下角的子母畫面擋住 → 這段寫 "pip": false，或用 moves 把那一塊推到畫面中間`);
      else if (sb[3] > F.bottom) once(`${name}b`, `${name}${when} ${F.bottomWhy}（畫面 y > ${F.bottom}）→ 用 moves 把那一塊往上推，或換 fit`);
      else if (F.top != null && sb[1] < F.top) once(`${name}t`, `${name}${when} 在上方平台介面區（畫面 y < ${F.top}）→ 用 moves 把那一塊往下推，或改 fit "contain"`);
      if (sb[2] <= 0 || sb[0] >= F.W || sb[3] <= 0 || sb[1] >= F.H) once(`${name}o`, `${name}${when} 整個跑到畫面外（運鏡把它推出去了，紅框看不到）→ 調整 moves，或紅框的 until 提早到運鏡之前`);
      else if (sb[0] < 0 || sb[2] > F.W || sb[1] < 0) once(`${name}o`, `${name}${when} 有一部分在畫面外（運鏡推太近）→ 調整 moves 或紅框的時間`);
    };
    check(rect, mk.at, `marks[${mk.i}]`);
    const path = mk.path.map((p) => {
      const r = rectOf(p.box);
      check(r, r3(p.at + p.dur), `marks[${mk.i}].path[${p.k}]`);
      return { k: p.k, at: p.at, dur: p.dur, rect: r };
    });
    // 全程查：運鏡、跟捲動之後紅框可能被擋或跑出畫面，不是只有出現那一刻（框已經淡出的不算）
    const rectAt = (t) => { let r = rect; for (const p of path) { if (t < p.at) break; r = t >= p.at + p.dur ? p.rect : r.map((v, j) => v + (p.rect[j] - v) * ((t - p.at) / p.dur)); } return r; };
    const lastT = mk.until - MARK.out;
    const times = [...m.cams.filter((c) => c.t0 + c.dur > mk.at && c.t0 + c.dur < lastT).map((c) => c.t0 + c.dur)];
    for (let t = mk.at + 0.5; t < lastT; t += 0.5) times.push(t);
    for (const t of times.sort((a, b) => a - b)) check(rectAt(t), t, `marks[${mk.i}]`, ` 在 ${fmt(t)}`);
    return { id: `mmk-${it.id}-${n + 1}`, i: mk.i, at: mk.at, until: mk.until, rect, sw: +(MARK.sw / c.z).toFixed(3), rx: +(MARK.rx / c.z).toFixed(2), path };
  });

  // --- 放大鏡 ---
  m.lenses = [];
  const frameSnap = (t) => r3(s + Math.round((t - s) * FPS) / FPS);
  (seg.lens || []).forEach((ln, i) => {
    const what = `lens[${i}]`;
    if (!keysOk(ln, what, ['at', 'until', 'box', 'zoom'])) return;
    let la = tAt(ln.at, `${what}.at`);
    if (la == null || !inSeg(la, `${what}.at`)) return;
    let lb = ln.until != null ? tAt(ln.until, `${what}.until`) : la + LENS.dflt;
    if (lb == null) return;
    lb = Math.min(lb, e);
    la = frameSnap(la); lb = frameSnap(lb);
    if (lb - la < LENS.min - 1e-6) { err(`${what} 只有 ${r3(lb - la)}s，放大鏡至少要 ${LENS.min}s（彈出 0.6＋縮回 0.32＋看清楚的時間）→ until 往後延`); return; }
    const box = boxOf(ln.box, `${what}.box`);
    if (!box) return;
    let zoom = LENS.zoom;
    if (ln.zoom != null) {
      if (!isNum(ln.zoom) || ln.zoom < 1.2 || ln.zoom > 4) { err(`${what}.zoom 要是 1.2–4 的倍數（預設 2），現在是 ${JSON.stringify(ln.zoom)}`); return; }
      zoom = ln.zoom;
    }
    if (m.lenses.some((o) => o.la < lb - 1e-6 && o.lb > la + 1e-6)) { err(`${what} 和前一個放大鏡時間重疊 → 一次只放一個，錯開 at／until`); return; }
    if (moving(la, lb)) warn(`${what} 期間有運鏡，鏡片位置是用 ${fmt(la)} 那一刻的畫面算的 → 運鏡和放大鏡錯開`);
    const c = camAt(la);
    const R = toScreen(toStage(box), c);
    let Cw = R[2] * zoom, Ch = R[3] * zoom;
    const f = Math.min(1, F.lens.maxW / Cw, F.lens.maxH / Ch);
    if (f < 1) {
      Cw *= f; Ch *= f;
      if (zoom * f < 1.2) warn(`${what}.box 太大，放大鏡只能放大 ${r3(zoom * f)} 倍 → 只框要看清的那一小塊（或改用 moves 推近）`);
    }
    Cw = even(Cw); Ch = even(Ch);
    const ow = Cw + 2 * (LENS.border + LENS.pad), oh = Ch + 2 * (LENS.border + LENS.pad);
    let left = Math.round(F.lens.cx - ow / 2), top = Math.round(F.lens.cy - oh / 2);
    top = Math.max(F.lens.top, Math.min(top, F.lens.bottom - oh));
    const box2 = () => [left, top, left + ow, top + oh];
    if (F.pip && [la, (la + lb) / 2, lb - 0.01].some((t) => pipAt(t)) && inter(box2(), F.pip) > 0) {
      if (F.lens.pipLeft - ow >= 40) left = F.lens.pipLeft - ow;
      else warn(`${what} 的鏡片會壓到子母畫面 → 這段寫 "pip": false，或 zoom 改小`);
    }
    const ocx = left + ow / 2, ocy = top + oh / 2;
    const back = { x: +(R[0] + R[2] / 2 - ocx).toFixed(2), y: +(R[1] + R[3] / 2 - ocy).toFixed(2), scaleX: +(R[2] / Cw).toFixed(5), scaleY: +(R[3] / Ch).toFixed(5) };
    // 逐格：第 k 張＝完成影片 la＋k/30 那一格的錄影
    const N = Math.max(1, Math.round((lb - la) * FPS));
    const ranges = [];
    if (m.kind === 'video') {
      for (let k = 0; k < N; k++) {
        const t = la + k / FPS;
        const p = m.pieces.find((x) => t < x.e - 1e-6) || m.pieces[m.pieces.length - 1];
        if (!p) break;
        const ft = r3(p.fms + Math.max(0, t - p.s));
        const lastR = ranges[ranges.length - 1];
        if (lastR && lastR.piece === p) lastR.frames++;
        else ranges.push({ piece: p, at: ft, frames: 1 });
      }
    }
    const crop = [box[0] * m.file.sx, box[1] * m.file.sy, box[2] * m.file.sx, box[3] * m.file.sy];
    m.lenses.push({
      id: `${it.id}-l${m.lenses.length + 1}`, i, la, lb, N, R: R.map((v) => +v.toFixed(2)), C: [Cw, Ch], outer: [left, top, ow, oh], back,
      crop, ranges: ranges.map(({ at, frames }) => ({ at, frames })), map: null, urls: null,
    });
  });

  // --- STEP 膠囊（編號全片累加、同字沿用；和前一段相接、同字時不重播進場）---
  const st = stepState || newStepState();
  const stepList = [];
  if (Array.isArray(seg.steps)) {
    seg.steps.forEach((sp, i) => {
      const what = `steps[${i}]`;
      if (!keysOk(sp, what, ['at', 'text'])) return;
      const at = tAt(sp.at, `${what}.at`);
      if (at == null || !inSeg(at, `${what}.at`)) return;
      const text = typeof sp.text === 'string' ? sp.text.trim() : '';
      if (!text || /[\r\n]|(?<!:)\/\//.test(text)) { err(`${what}.text 要寫 1–${STEP.maxLen} 字（這一步在做什麼），現在是 ${JSON.stringify(sp.text)} → 補上這一步的動作`); return; }
      const len = visibleLen(text);
      if (len > STEP.maxLen) { err(`${what}.text「${text}」有 ${len} 字（上限 ${STEP.maxLen}）→ 縮短`); return; }
      const dup = (badge?.names || []).find((n) => dupStep(text, n));
      if (dup) { warn(`${what}「${text}」和右上角的小節角標「${dup}」重複（畫面上下兩個角各寫一次）→ 刪掉這個 step，角標已經寫了在哪一步；要分更細的步驟再寫不同的字（這次不畫這顆膠囊）`); return; }
      const prev = stepList[stepList.length - 1];
      if (prev && at <= prev.at + 1e-6) { err(`${what}.at（${fmt(at)}）要晚於 steps[${prev.i}]（${fmt(prev.at)}）→ 照時間先後排列`); return; }
      const need = STEP.swReady + READ;
      if (prev && at - prev.at < need - 1e-6) { err(`${what} 和前一步只差 ${r3(at - prev.at)}s（要 ≥ ${need}s：換步 ${STEP.swReady}＋停 ${READ}）→ 合併成一步，或把 at 往後挪到 ${fmt(prev.at + need)} 之後`); return; }
      stepList.push({ i, at, text });
    });
    const last = stepList[stepList.length - 1];
    const need = STEP.swReady + READ;
    if (last && e - last.at < need - 1e-6) err(`steps[${last.i}] 在段尾前 ${r3(e - last.at)}s 才出現（要 ≥ ${need}s）→ 提早 at，或移到下一段`);
  }
  let carry = false;
  if (stepList.length) {
    const f = stepList[0];
    carry = !!(st.last && f.at <= s + STEP.carry + 1e-6 && Math.abs(st.last.end - s) <= STEP.carry + 1e-6 && st.last.text === f.text);
    for (const sp of stepList) {
      if (!st.byText.has(sp.text)) st.byText.set(sp.text, ++st.n);
      sp.n = st.byText.get(sp.text);
    }
    stepList.forEach((sp, k) => { sp.carry = k === 0 && carry; sp.ready = r3(k === 0 ? (carry ? sp.at : sp.at + STEP.in) : sp.at + STEP.swReady); });
    const last = stepList[stepList.length - 1];
    st.last = { end: e, text: last.text, n: last.n };
  } else st.last = null;
  const capW = stepList.length ? Math.max(...stepList.map((x) => textPx(x.text))) + STEP.extra : 0;
  // 膠囊放在錄影可見區裡（離錄影左／上緣 32px，不跨在錄影邊上；參考專案作者：「沒有考量到實際螢幕錄影的上方與右側邊界」）
  // 直式照 FR-024 固定在左上 y 260（右邊＝安全區右緣）
  const capAt = (side) => {
    const port = F.format === 'portrait';
    const top = port ? F.step.top : Math.max(F.step.top, Math.round(G.top) + STEP.inset);
    const left = side === 'right' ? (port ? F.safe[2] : Math.min(F.safe[2], Math.round(G.left + G.width) - STEP.inset)) - capW : port ? F.step.left : Math.max(F.step.left, Math.round(G.left) + STEP.inset);
    return [left, top, left + capW, top + STEP.h];
  };
  if (seg.stepsSide != null && !['left', 'right'].includes(seg.stepsSide)) err(`stepsSide 只能是 "left"（預設）或 "right"，現在是 ${JSON.stringify(seg.stepsSide)}`);
  const capsule = stepList.length ? { box: capAt(seg.stepsSide === 'right' ? 'right' : 'left'), side: seg.stepsSide === 'right' ? 'right' : 'left', from: carry ? s : stepList[0].at, to: e } : null;
  m.steps = { list: stepList, carry, capsule };

  // --- 說明卡、聚光燈、箭頭共用 ---
  const ov = (a1, b1, a2, b2) => a1 < b2 - 1e-6 && a2 < b1 - 1e-6;
  const moveIn = (a, b) => m.cams.findIndex((mv) => ov(a, b, mv.t0, mv.t0 + mv.dur));
  const camErr = (what, a, b) => {
    const j = moveIn(a, b);
    if (j < 0) return false;
    err(`${what}（${fmt(a)}–${fmt(b)}）期間有運鏡 moves[${m.cams[j].i}] → 標註期間畫面不能動：運鏡移到標註之前結束，或標註移到運鏡之後`);
    return true;
  };
  const cutWarn = (what, a, b) => {
    const t = (m.pieces || []).slice(1).map((p) => p.s).find((x) => x > a + 1e-6 && x < b - 1e-6);
    if (t != null) warn(`${what} 期間錄影有接點（${fmt(t)}，edit.cuts 切開），畫面會跳、框可能對不上 → at／until 避開這個時間`);
  };
  const lensAt = (a, b) => m.lenses.findIndex((L) => ov(a, b, L.la, L.lb));
  const pipOn = (a, b) => [a, (a + b) / 2, b - 0.01].some((t) => pipAt(t));
  const scrBox = (box, t) => xyxy(toScreen(toStage(box), camAt(t)));
  const offScreen = (b) => b[2] <= F.screen[0] || b[0] >= F.screen[2] || b[3] <= F.screen[1] || b[1] >= F.screen[3];
  // 紅框在 [a, b] 期間占到的畫面矩形（含跟捲動的每一步）
  const markBoxes = (mk, a, b) => {
    const out = [];
    const steps2 = [{ at: mk.at, end: mk.path.length ? mk.path[0].at + mk.path[0].dur : mk.until, rect: mk.rect }, ...mk.path.map((p, k) => ({ at: p.at, end: k + 1 < mk.path.length ? mk.path[k + 1].at + mk.path[k + 1].dur : mk.until, rect: p.rect }))];
    for (const x of steps2) if (ov(a, b, x.at, x.end)) out.push(xyxy(toScreen(x.rect, camAt(Math.max(a, x.at)))));
    return out;
  };

  // 膠囊壓到紅框、沒寫 stepsSide → 換到右邊（右邊也壓到、或右上有小節角標就留左邊，下面的碰撞檢查會 ⚠）
  const BADGE_WHY = '壓到右上角的小節角標';
  if (capsule && seg.stepsSide == null) {
    const hitAt = (box) => m.marks.some((mk) => markBoxes(mk, capsule.from, capsule.to).some((b) => hits(box, b)));
    const right = capAt('right');
    if (hitAt(capsule.box) && !hitAt(right) && !(badge && hits(right, badge.box))) Object.assign(capsule, { box: right, side: 'right' });
  }

  // --- 說明卡：擺位置（運鏡、紅框、膠囊都定了）---
  m.callouts = [];
  for (const co of callouts) {
    const what = `callouts[${co.i}]`;
    if (camErr(what, co.at, co.until)) continue;
    const bx = scrBox(co.box, co.at);
    if (offScreen(bx)) { err(`${what}.box 在畫面外（fit "cover" 裁掉了）→ 改 fit "contain"，或框畫面上看得到的地方`); continue; }
    const j = lensAt(co.at, co.until);
    if (j >= 0) warn(`${what} 和放大鏡 lens[${m.lenses[j].i}] 同時出現，卡片會被壓暗 → 錯開時間`);
    cutWarn(what, co.at, co.until);
    if (F.pip && pipOn(co.at, co.until) && inter(bx, F.pip) > 0.3 * (bx[2] - bx[0]) * (bx[3] - bx[1])) warn(`${what} 的框被右下角的子母畫面擋住（卡片指的東西看不到）→ 這段寫 "pip": false，或先用 moves 把那一塊推到畫面中間`);
    const e8 = CALLOUT.edge;
    const R = [bx[0] - e8, bx[1] - e8, bx[2] - bx[0] + 2 * e8, bx[3] - bx[1] + 2 * e8];
    const avoid = [...F.avoid];
    if (F.pip && pipOn(co.at, co.until)) avoid.push({ box: F.pip, why: F.pipWhy });
    if (capsule && ov(co.at, co.until, capsule.from, capsule.to)) avoid.push({ box: capsule.box, why: '壓到 STEP 膠囊' });
    if (badge) avoid.push({ box: badge.box, why: BADGE_WHY });
    for (const o of m.callouts) if (ov(co.at, co.until, o.at, o.until)) avoid.push({ box: o.card, why: `壓到 callouts[${o.i}]` }, { box: xyxy(o.R), why: `壓到 callouts[${o.i}]` });
    for (const mk of m.marks) if (ov(co.at, co.until, mk.at, mk.until)) for (const b of markBoxes(mk, co.at, co.until)) avoid.push({ box: grow(b, 2), why: `壓到 marks[${mk.i}] 的紅框` });
    const w = cardWidth(co.text, !!co.iconSvg);
    const p = placeCallout({ R, w, side: co.side, avoid, F });
    if (!p.side) {
      const sd = co.side || SIDES[0];
      const why = (p.fail[sd] || []).join('、');
      err(`${what} 的卡片放 ${sd} 會${why} → ${p.alt ? `改 "side": "${p.alt}"（放得下）` : '四邊都放不下：text 縮短、拿掉 icon，或先用 moves 把那一塊推到畫面中間（運鏡要在標註之前結束）'}`);
      continue;
    }
    m.callouts.push({ ...co, k: m.callouts.length + 1, R: R.map(ri), side: p.side, card: p.card, anchor: p.anchor, x: p.x, top: p.top, lead: p.lead });
  }

  // --- 聚光燈 ---
  m.spots = [];
  if (Array.isArray(seg.spot)) seg.spot.forEach((sp, i) => {
    const what = `spot[${i}]`;
    if (!keysOk(sp, what, ['at', 'until', 'box'])) return;
    const at = tAt(sp.at, `${what}.at`);
    if (at == null || !inSeg(at, `${what}.at`)) return;
    let until = sp.until != null ? tAt(sp.until, `${what}.until`) : e;
    if (until == null) return;
    if (until > e) until = e;
    if (until <= at + 1e-6) { err(`${what}.until（${fmt(until)}）要晚於 at（${fmt(at)}）→ until 往後延，或不寫（預設到段尾）`); return; }
    const box = boxOf(sp.box, `${what}.box`);
    if (!box) return;
    const need = 2 * SPOT.fade + READ;
    if (until - at < need - 1e-6) { err(`${what} 只有 ${r3(until - at)}s（要 ≥ ${need}s：淡入 ${SPOT.fade}＋停 ${READ}＋淡出 ${SPOT.fade}）→ until 延到 ${fmt(at + need)} 之後`); return; }
    const o = m.spots.find((x) => ov(at, until, x.at, x.until));
    if (o) { err(`${what} 和 spot[${o.i}] 時間重疊 → 一次只放一個聚光燈，錯開 at／until`); return; }
    const j = lensAt(at, until);
    if (j >= 0) { err(`${what} 和放大鏡 lens[${m.lenses[j].i}] 時間重疊（會壓暗兩層）→ 錯開，或只留一個`); return; }
    if (camErr(what, at, until)) return;
    const bx = scrBox(box, at);
    if (offScreen(bx)) { err(`${what}.box 在畫面外（fit "cover" 裁掉了）→ 改 fit "contain"，或框畫面上看得到的地方`); return; }
    cutWarn(what, at, until);
    const hole = [ri(bx[0] - SPOT.pad), ri(bx[1] - SPOT.pad), ri(bx[2] - bx[0] + 2 * SPOT.pad), ri(bx[3] - bx[1] + 2 * SPOT.pad)];
    const holeBox = xyxy(hole);
    if (F.pip && pipOn(at, until) && inter(holeBox, F.pip) > 0.3 * hole[2] * hole[3]) warn(`${what} 的亮區被右下角的子母畫面擋住（全畫面變暗卻看不到重點）→ 這段寫 "pip": false，或先用 moves 把那一塊推到畫面中間`);
    m.spots.push({ i, k: m.spots.length + 1, at, until, hole, ready: r3(at + SPOT.fade) });
  });

  // --- 箭頭 ---
  m.arrows = [];
  let dropped = 0;
  if (Array.isArray(seg.arrows)) seg.arrows.forEach((ar, i) => {
    const what = `arrows[${i}]`;
    if (!keysOk(ar, what, ['at', 'until', 'to', 'from'])) return;
    const at = tAt(ar.at, `${what}.at`);
    if (at == null || !inSeg(at, `${what}.at`)) return;
    let until = ar.until != null ? tAt(ar.until, `${what}.until`) : r3(at + ARROW.dflt);
    if (until == null) return;
    if (until > e) until = e;
    if (until <= at + 1e-6) { err(`${what}.until（${fmt(until)}）要晚於 at（${fmt(at)}）→ until 往後延，或不寫（預設 at＋3 秒）`); return; }
    const to = ar.to;
    if (!Array.isArray(to) || to.length !== 2 || !to.every(isNum)) { err(`${what}.to 要寫 [x, y]（箭頭要指的點，素材本身的像素座標，用 media.mjs frame --grid 讀），現在是 ${JSON.stringify(to)} → 改成兩個數字的陣列`); return; }
    if (to[0] < -2 || to[1] < -2 || to[0] > W + 2 || to[1] > H + 2) { err(`${what}.to [${to.join(', ')}] 超出素材範圍 ${W}×${H} → 座標是素材原尺寸的像素（不是 ${F.W}×${F.H} 的畫面座標），用 media.mjs frame --grid 重讀`); return; }
    if (ar.from != null && !Object.hasOwn(DIRS, ar.from)) { err(`${what}.from 只能是 ${Object.keys(DIRS).map((d) => `"${d}"`).join('、')}（箭尾在箭尖的哪個方向；不寫＝自動挑），現在是 ${JSON.stringify(ar.from)} → 改成這 8 個之一，或刪掉 from`); return; }
    const need = 2 * ARROW.fade + READ;
    if (until - at < need - 1e-6) { err(`${what} 只有 ${r3(until - at)}s（要 ≥ ${need}s：淡入 ${ARROW.fade}＋停 ${READ}＋淡出 ${ARROW.fade}）→ until 延到 ${fmt(at + need)} 之後，或不寫 until（預設 at＋${ARROW.dflt} 秒）`); return; }
    const j = lensAt(at, until);
    if (j >= 0) { warn(`${what} 在放大鏡 lens[${m.lenses[j].i}] 期間，已拿掉（放大鏡會蓋住）`); dropped++; return; }
    const o = m.arrows.find((x) => ov(at, until, x.at, x.until));
    if (o) { err(`${what} 和 arrows[${o.i}] 時間重疊 → 一次只放一支箭頭，錯開 at／until`); return; }
    if (camErr(what, at, until)) return;
    cutWarn(what, at, until);
    const c = camAt(at), sp = toStage([to[0], to[1], 0, 0]);
    const P = [c.x + c.z * sp[0], c.y + c.z * sp[1]];
    const avoid = [...F.avoid], rings = [];
    if (capsule && ov(at, until, capsule.from, capsule.to)) avoid.push({ box: grow(capsule.box, ARROW.pad), why: '壓到 STEP 膠囊' });
    if (badge) avoid.push({ box: grow(badge.box, ARROW.pad), why: BADGE_WHY });
    for (const co of m.callouts) if (ov(at, until, co.at, co.until)) { avoid.push({ box: grow(co.card, ARROW.pad), why: `壓到 callouts[${co.i}]` }); rings.push({ box: xyxy(co.R), why: '壓到紅框' }); }
    for (const mk of m.marks) if (ov(at, until, mk.at, mk.until)) for (const b of markBoxes(mk, at, until)) rings.push({ box: b, why: '壓到紅框' });
    const p = placeArrow({ P, from: ar.from ?? null, avoid, rings, pip: F.pip && pipOn(at, until) ? F.pip : null, F });
    if (!p.ok) {
      const why = [...new Set(Object.values(p.why).flat())].join('、');
      warn(`${what} 找不到不擋字的位置（${why}），已拿掉（作者規則：找不到位置就不放）→ 換一個 to（目標已有紅框時改指紅框外緣），或只用紅框 marks`);
      dropped++;
      return;
    }
    if (p.alt) { err(`${what} 從 "${ar.from}" 方向放會${p.why[ar.from].join('、')} → 改 "from": "${p.alt}"（放得下）`); return; }
    m.arrows.push({ i, k: m.arrows.length + 1, at, until, from: p.from, len: p.len, u: p.u, tip: p.tip, base: p.base, tail: p.tail, c1: p.c1, c2: p.c2, ready: r3(at + ARROW.fade) });
  });

  // --- 膠囊碰撞（⚠）---
  if (capsule) {
    const told = new Set();
    const hit = (b, a, b2, name) => {
      if (told.has(name) || !ov(capsule.from, capsule.to, a, b2) || !hits(capsule.box, b)) return;
      told.add(name);
      warn(`STEP 膠囊（x ${capsule.box[0]}–${ri(capsule.box[2])}、y ${capsule.box[1]}–${capsule.box[3]}）在 ${fmt(Math.max(capsule.from, a))} 壓到 ${name} → 換 side／from、用 moves 把那一塊往下推，或錯開時間`);
    };
    for (const co of m.callouts) hit(xyxy(co.R), co.at, co.until, `callouts[${co.i}] 的紅框`);
    for (const sp of m.spots) hit(xyxy(sp.hole), sp.at, sp.until, `spot[${sp.i}] 的亮區`);
    for (const mk of m.marks) for (const b of markBoxes(mk, capsule.from, capsule.to)) hit(b, mk.at, mk.until, `marks[${mk.i}] 的紅框`);
  }

  // --- 小節角標碰撞（⚠）：膠囊指定放右上、紅框／亮區在角標底下（角標蓋在錄影上，z 55）---
  if (badge) {
    const told = new Set();
    const where = `x ${ri(badge.box[0])}–${ri(badge.box[2])}、y ${badge.box[1]}–${badge.box[3]}`;
    const hit = (b, a, name) => {
      if (told.has(name) || !hits(badge.box, b)) return;
      told.add(name);
      warn(`${name}在 ${fmt(a)} 被右上角的小節角標（${where}）蓋住 → 用 moves 把那一塊推到畫面中間，或改指別的地方`);
    };
    if (capsule && hits(capsule.box, badge.box)) hit(capsule.box, capsule.from, 'STEP 膠囊（"stepsSide": "right"）');
    for (const co of m.callouts) hit(xyxy(co.R), co.at, `callouts[${co.i}] 的紅框`);
    for (const sp of m.spots) hit(xyxy(sp.hole), sp.at, `spot[${sp.i}] 的亮區`);
    for (const mk of m.marks) for (const b of markBoxes(mk, mk.at, mk.until)) hit(b, mk.at, `marks[${mk.i}] 的紅框`);
  }

  // --- 報告與 JSON ---
  const pathN = m.marks.reduce((a, mk) => a + mk.path.length, 0);
  const nums = stepList.map((x) => x.n);
  const parts = [
    m.cams.length ? `運鏡 ${m.cams.length}` : '', m.kb ? '慢推' : '',
    m.marks.length ? `紅框 ${m.marks.length}${pathN ? `（跟捲動 ${pathN} 次）` : ''}` : '',
    m.callouts.length ? `標註 ${m.callouts.length}` : '', m.spots.length ? `聚光燈 ${m.spots.length}` : '',
    stepList.length ? `STEP ${stepList.length}（第 ${Math.min(...nums)}${Math.max(...nums) !== Math.min(...nums) ? `–${Math.max(...nums)}` : ''} 步）` : '',
    m.arrows.length || dropped ? `箭頭 ${m.arrows.length}${dropped ? `（拿掉 ${dropped}）` : ''}` : '',
    m.lenses.length ? `放大鏡 ${m.lenses.length}` : '',
  ].filter(Boolean);
  // 下限：錄影段 ≥ 4 秒（style.md「標註不要密」的平均間距）卻一個標註、運鏡都沒有
  if ((m.kind === 'video' || m.hold != null) && !parts.length && e - s >= 4) {
    warn(`錄影 ${r3(e - s)}s 沒有任何標註或運鏡 → 講解講到畫面上的東西（按鈕、欄位、選項、數字，或說「這邊」「點」「選」）那句加紅框 marks 或說明卡 callouts，一步一步的操作加 steps（auto-edit-screen 步驟 3–4）；真的沒有要指的東西，回報寫保留理由`);
  }
  if (m.retime) parts.unshift(`變速 ${retimeText(m.retime)}`);
  if (m.redact.length) parts.unshift(`打碼 ${m.redact.length} 處`);
  const frozen = m.hold != null ? r3(e - s) : m.retime ? Math.max(0, ...m.retime.speeds.map((sp, i) => (sp === 0 ? r3(m.retime.knots[i + 1][0] - m.retime.knots[i][0]) : 0))) : 0;
  if (frozen > FREEZE_WARN) warn(`定格 ${frozen}s（超過 ${FREEZE_WARN} 秒畫面像當掉）→ 中間換標註或運鏡，或講到下一件事就換畫面`);
  let summary = parts.join('、');
  if (m.kind === 'image' && m.hasAnn && seg.kenburns !== false && !m.cams.length) summary += `${summary ? '；' : ''}有標註，不做慢推`;
  const json = {
    marks: m.marks.map((mk) => ({ i: mk.i, at: mk.at, until: mk.until, ready: r3(mk.at + MARK.draw), path: mk.path.map((p) => ({ k: p.k, at: p.at, ready: r3(p.at + p.dur) })) })),
    callouts: m.callouts.map((co) => ({ i: co.i, at: co.at, until: co.until, ready: co.ready, side: co.side, text: co.text })),
    spot: m.spots.map((sp) => ({ i: sp.i, at: sp.at, until: sp.until, ready: sp.ready })),
    steps: stepList.map((sp) => ({ i: sp.i, at: sp.at, ready: sp.ready, n: sp.n, text: sp.text, carry: sp.carry })),
    side: m.side ? { title: m.side.title, box: m.side.box, items: m.side.items.map((x) => ({ i: x.i, at: x.at, text: x.text })) } : null,
    arrows: m.arrows.map((a) => ({ i: a.i, at: a.at, until: a.until, ready: a.ready, from: a.from })),
    lens: m.lenses.map((L) => ({ i: L.i, at: L.la, until: L.lb, ready: r3(L.la + LENS.delay + LENS.pop) })),
    redact: m.redact.map((rd) => ({ i: rd.i })),
    // 段內第幾秒 ↔ 素材第幾秒（剪輯台的即時模擬、面板用；hold、out、speed 都換成這個）
    knots: sourceKnots(m, r3(e - s)),
  };
  // FR-082：錄影（含定格）畫面縮成原尺寸的幾倍、有幾個運鏡／放大鏡（qc storyboard：< 0.6、沒有 moves 和 lens、> 3 秒 ⚠ 介面字太小）
  // 直式只看橫的錄影；橫式也看（參考專案：3452×2016 的錄影縮到 1609×940，介面字只剩 8–10px，靠放大鏡補）
  const rec = m.kind === 'video' || m.hold != null;
  if (F.format === 'portrait' && rec && W > H) json.view = { scale: r3(G.kx), moves: m.cams.length, lens: m.lenses.length };
  else if (F.format !== 'portrait' && rec) json.view = { scale: r3(G.kx), moves: m.cams.length, lens: m.lenses.length, landscape: true };
  return { summary, json };
}
// 過渡期別名（002 改成呼叫 validateMedia 之前 build 照常能跑）
export const resolveMedia = validateMedia;

// ---------- build 要準備的檔 ----------

export function mediaJobs(it) {
  const m = it.media;
  const st = fs.statSync(m.abs);
  const stem = ascii(path.basename(m.src, m.ext));
  const sig = { src: m.abs, size: st.size, mtimeMs: Math.round(st.mtimeMs) };
  const jobs = { main: null, lenses: [] };
  const redact = (m.redact || []).length ? m.redact.map((rd) => ({ at: rd.at, until: rd.until, box: rd.box })) : null;
  const red = redact ? { redact } : {};
  const hdrKey = m.info?.hdr ? { sdr: m.info.hdr } : {};   // HDR 素材轉成 SDR 的版本（舊版沒轉的要重做）
  if (m.hold != null) {
    const key = { ...sig, hold: m.hold, w: m.file.w, h: m.file.h, ...red, ...hdrKey, v: 1 };
    const h = createHash('sha1').update(JSON.stringify(key)).digest('hex').slice(0, 8);
    jobs.main = { type: 'still', rel: `assets/media/${stem}-${h}.jpg`, key, at: m.hold, w: m.file.w, h: m.file.h, redact };
  } else if (m.retime) {
    const key = { ...sig, retime: m.retime.knots, w: m.file.w, h: m.file.h, ...red, ...hdrKey, v: 2 };
    const h = createHash('sha1').update(JSON.stringify(key)).digest('hex').slice(0, 8);
    jobs.main = { type: 'video', rel: `assets/media/${stem}-${h}.mp4`, key, retime: m.retime, speed: 1, keepAudio: false, w: m.file.w, h: m.file.h, redact };
  } else if (m.kind === 'video') {
    const key = { ...sig, speed: m.speed, w: m.file.w, h: m.file.h, ...red, ...hdrKey, v: 1 };
    const h = createHash('sha1').update(JSON.stringify(key)).digest('hex').slice(0, 8);
    jobs.main = { type: 'video', rel: `assets/media/${stem}-${h}.mp4`, key, speed: m.speed, keepAudio: !!m.info.hasAudio, w: m.file.w, h: m.file.h, redact };
  } else {
    const key = redact ? { ...sig, ...red, v: 1 } : sig;
    const h = createHash('sha1').update(JSON.stringify(key)).digest('hex').slice(0, 8);
    jobs.main = { type: 'image', rel: `assets/media/${stem}-${h}${m.ext === '.jpeg' ? '.jpg' : m.ext}`, key, redact };
  }
  m.asset = jobs.main.rel;
  for (const L of m.lenses || []) {
    const key = { main: jobs.main.rel, ranges: L.ranges, crop: L.crop.map((v) => +v.toFixed(2)), size: L.C, image: m.kind === 'image', v: 1 };
    jobs.lenses.push({ lens: L, dir: `assets/media/${L.id}`, key });
  }
  return jobs;
}

// ---------- 主合成 ----------

// 標註的焦點（§7）：ev＝[{ sel, at, until }]（完成影片秒）→ [{ sel, at, to }]，照時間排序
// 後一個出現時，前面出現、還會留 ≥ 0.4 s 的壓暗到 0.5；同一刻一起出現的不互相壓暗；回均衡只對還在畫面上的做
export function focusPlan(ev, end) {
  const E = [...ev].sort((a, b) => a.at - b.at), out = [], dimmed = new Set();
  for (let k = 1; k < E.length; k++) {
    for (let j = 0; j < k; j++) {
      if (dimmed.has(j) || E[j].at >= E[k].at - 1e-6 || E[j].until <= E[k].at + FOCUS.dur + 1e-6) continue;
      out.push({ sel: E[j].sel, at: E[k].at, to: FOCUS.dim }); dimmed.add(j);
    }
  }
  if (dimmed.size) {
    const L = E[E.length - 1], T = r3(Math.min(L.at + FOCUS.eq, end - FOCUS.tail, L.until - FOCUS.out));
    if (T >= L.at + FOCUS.dur - 1e-6) for (const j of dimmed) if (E[j].until > T + FOCUS.dur + 1e-6) out.push({ sel: E[j].sel, at: T, to: 1 });
  }
  return out.sort((a, b) => a.at - b.at);
}

const vol = (db) => +Math.min(3.98, Math.max(0, dB(db))).toFixed(3);

export function mediaParts(it, { off = 0, lim = Infinity, base = '', nextTrack, mediaDb = 0, edit = null, outDur = Infinity }) {
  const m = it.media, id = it.id;
  const sh = (t) => n3(t - off);
  const s = it.start, e = Math.min(it.end, lim);
  const G = m.geo;
  const F = m.frame || LAND, CW = F.W, CH = F.H, port = F.format === 'portrait';
  const vb = `0 0 ${CW} ${CH}`;
  const tl = [];
  const html = [];
  const style = `left:${G.left}px;top:${G.top}px;width:${G.width}px;height:${G.height}px`;
  // 直式：畫面座標的層（.mstage／.mmarks／.mann／.mlreg）寬高吃 --cw／--ch（kit/media.css 預設 1920×1080）
  html.push(`  <div id="el-${id}" class="mlayer" style="z-index:${it.z}${port ? `;--cw:${CW}px;--ch:${CH}px` : ''}">`);
  const taped = it.enterFx === 'tape';
  html.push(`    <div id="mbg-${id}" class="clip mbg${taped ? ' mbg--paper' : ''}" data-start="${sh(s)}" data-duration="${n3(e - s)}" data-track-index="${nextTrack()}"></div>`);
  // 面板：不計時的外框，大小＝錄影可見區（P.grow 從小視窗長成它）；運鏡層放在裡面、位移抵回去，座標還是畫面座標
  html.push(`    <div id="mgr-${id}" class="mgrow" style="${style}" data-layout-allow-overflow>`);
  html.push(`    <div id="mst-${id}" class="mstage" style="left:${-G.left}px;top:${-G.top}px" data-layout-allow-overflow>`);
  if (m.kind === 'video') {
    const audio = m.volume != null && m.info.hasAudio;
    const enterD = it.enterFx === 'cut' ? DECLICK : ENTER[it.enterFx];
    const exitD = it.exitFx === 'cut' ? DECLICK : EXIT[it.exitFx];
    const pcs = m.pieces.filter((p) => p.s < lim - 1e-6);
    pcs.forEach((p, n) => {
      const pe = Math.min(p.e, lim);
      let attrs = audio ? ` data-has-audio="true" data-volume="${vol(m.volume + mediaDb)}"` : ' muted';
      if (audio) {
        let fi = n === 0 ? enterD : DECLICK, fo = n === pcs.length - 1 && pe >= it.end - 1e-6 ? exitD : DECLICK;
        if (edit?.fadeIn && p.s < edit.fadeIn) fi = Math.max(fi, edit.fadeIn - p.s);
        if (edit?.fadeOut && pe > outDur - edit.fadeOut) fo = Math.max(fo, pe - (outDur - edit.fadeOut));
        attrs += ` data-fade-in="${n3(Math.min(fi, pe - p.s))}" data-fade-out="${n3(Math.min(fo, pe - p.s))}"`;
      }
      html.push(`      <video id="mv-${id}${n ? `-${n + 1}` : ''}" src="${base}${m.asset}" data-start="${sh(p.s)}" data-duration="${n3(pe - p.s)}" data-media-start="${n3(p.fms)}"
             data-track-index="${nextTrack()}"${attrs} playsinline style="${style}"></video>`);
    });
  } else {
    html.push(`      <img id="mi-${id}" class="clip mimg${taped ? ' mimg--paper' : ''}" src="${base}${m.asset}" alt="" data-start="${sh(s)}" data-duration="${n3(e - s)}" data-track-index="${nextTrack()}" style="${style}">`);
  }
  // 紙膠帶：貼在圖片兩個上角（stage 座標，跟著運鏡一起動）；不計時，進場時彈上去
  if (taped) [[G.left - TAPE.out, -34], [G.left + G.width + TAPE.out - TAPE.w, 34]].forEach(([x, r], k) => html.push(`      <i id="mtp-${id}-${k + 1}" class="mtape" style="left:${Math.round(x)}px;top:${Math.round(G.top - TAPE.up)}px;rotate:${r}deg" data-layout-allow-overlap></i>`));
  if (m.marks.length) {
    html.push(`      <svg id="mmk-${id}" class="clip mmarks" data-start="${sh(s)}" data-duration="${n3(e - s)}" data-track-index="${nextTrack()}" viewBox="${vb}" data-layout-allow-overlap>`);
    for (const mk of m.marks) html.push(`        <g id="fo-${mk.id}"><rect id="${mk.id}" class="mmark" x="${mk.rect[0]}" y="${mk.rect[1]}" width="${mk.rect[2]}" height="${mk.rect[3]}" rx="${mk.rx}" pathLength="1" style="stroke-width:${mk.sw}px"/></g>`);
    html.push('      </svg>');
  }
  html.push('    </div>');
  html.push('    </div>');
  // --- 標註（畫在運鏡層外面：卡片的字不會被推近放大；兩個計時容器都直接放在 #el 底下）---
  const vis = (x) => x.at < lim - 1e-6;
  const cos = (m.callouts || []).filter(vis), sps = (m.spots || []).filter(vis), ars = (m.arrows || []).filter(vis);
  const stl = (m.steps?.list || []).filter(vis);
  if (cos.length || sps.length || ars.length) {
    html.push(`    <svg id="man-${id}" class="clip mann" data-start="${sh(s)}" data-duration="${n3(e - s)}" data-track-index="${nextTrack()}" viewBox="${vb}" data-layout-allow-overlap>`);
    for (const p of sps) {
      const [x, y, w, h] = p.hole;
      html.push(`      <g id="msp-${id}-${p.k}" class="mspot"><mask id="mspm-${id}-${p.k}"><rect width="${CW}" height="${CH}" fill="#ffffff"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${SPOT.rx}" fill="#000000"/></mask><rect class="mspot-dim" width="${CW}" height="${CH}" mask="url(#mspm-${id}-${p.k})"/></g>`);
    }
    // 標註外面各包一層焦點容器（fo-…）：壓暗只動它的 opacity，不和標註自己的進出場補間打架
    for (const c of cos) {
      const [x, y, w, h] = c.R;
      html.push(`      <g id="fo-mc-${id}-${c.k}"><rect id="mcb-${id}-${c.k}" class="mcbox" x="${x}" y="${y}" width="${w}" height="${h}" rx="${MARK.rx}" pathLength="1"/>`);
      html.push(`      <g id="mcl-${id}-${c.k}" class="mclead"><path d="${c.lead.d}" pathLength="1"/><circle cx="${c.lead.dot[0]}" cy="${c.lead.dot[1]}" r="${CALLOUT.dot}"/></g></g>`);
    }
    for (const a of ars) html.push(`      <g id="fo-mar-${id}-${a.k}"><g id="mar-${id}-${a.k}" class="marrow"><line x1="${a.base[0]}" y1="${a.base[1]}" x2="${a.tail[0]}" y2="${a.tail[1]}"/><polygon points="${[a.tip, a.c1, a.c2].map((q) => q.join(',')).join(' ')}"/></g></g>`);
    html.push('    </svg>');
  }
  if (stl.length || cos.length) {
    html.push(`    <div id="mcd-${id}" class="clip mcards" data-start="${sh(s)}" data-duration="${n3(e - s)}" data-track-index="${nextTrack()}" data-layout-allow-overlap>`);
    if (stl.length) {
      const cb = m.steps.capsule.box;
      html.push(`      <div id="msteps-${id}" class="msteps"${port || cb[0] !== STEP.left || cb[1] !== STEP.top ? ` style="left:${cb[0]}px;top:${cb[1]}px"` : ''}>`);
      stl.forEach((p, k) => html.push(`        <div id="mstep-${id}-${k + 1}" class="mstep"><span class="mnum">${p.n}</span><span class="mtxt">${esc(p.text)}</span></div>`));
      html.push('      </div>');
    }
    for (const c of cos) {
      const pos = c.anchor === 'right' ? `right:${c.x}px` : `left:${c.x}px`;
      html.push(`      <div id="fo-mcc-${id}-${c.k}" class="mfo"><div id="mcc-${id}-${c.k}" class="mcard mcard--${c.side}${c.iconSvg ? '' : ' mcard--plain'}" style="${pos};top:${c.top}px">${c.iconSvg ? `<span class="mic">${c.iconSvg}</span>` : ''}<span class="mtxt">${esc(c.text)}</span></div></div>`);
    }
    html.push('    </div>');
  }
  // 右側步驟清單（m.side）：一張卡＝標題列＋步驟；整段都在（跟著錄影進出場），講到 at 那條亮起（.mside__hi 底色＋字變實），前一條變淡
  const sdi = m.side ? m.side.items.filter(vis) : [];
  if (m.side) {
    const [bx, by, bw, bh] = m.side.box;
    html.push(`    <div id="msd-${id}" class="clip mside" data-start="${sh(s)}" data-duration="${n3(e - s)}" data-track-index="${nextTrack()}" style="left:${bx}px;top:${by}px;width:${bw}px;height:${bh}px">`);
    html.push(`      <div class="mside__bar">${esc(m.side.title)}</div>`);
    html.push('      <div class="mside__list">');
    m.side.items.forEach((x, k) => html.push(`        <div id="msdi-${id}-${k + 1}" class="mside__item"><i id="msdh-${id}-${k + 1}" class="mside__hi"></i><span class="mside__num">${k + 1}</span><span class="mside__txt">${esc(x.text)}</span></div>`));
    html.push('      </div>');
    html.push('    </div>');
  }
  for (const L of m.lenses) {
    if (L.la >= lim - 1e-6) continue;
    const [left, top, ow, oh] = L.outer;
    const R = L.R;
    const ts = `data-start="${sh(L.la)}" data-duration="${n3(Math.min(L.lb, lim) - L.la)}"`;
    // 外層不計時（巢狀的計時 div 會被 lint 當成要拆子合成）；壓暗層、描框、鏡片各自計時
    html.push(`    <div id="mlz-${L.id}" class="mlz">`);
    html.push(`      <div id="mdim-${L.id}" class="clip mdim" ${ts} data-track-index="${nextTrack()}"></div>`);
    html.push(`      <svg id="mlg-${L.id}" class="clip mlreg" ${ts} data-track-index="${nextTrack()}" viewBox="${vb}"><rect id="mlr-${L.id}" x="${Math.round(R[0] - 4)}" y="${Math.round(R[1] - 4)}" width="${Math.round(R[2] + 8)}" height="${Math.round(R[3] + 8)}" rx="6" pathLength="1"/></svg>`);
    // 鏡片不計時：CSS 預設 opacity 0，時間軸自己淡入淡出（計時 div 裡放 canvas 會被 lint 當成要拆子合成）
    html.push(`      <div id="mlens-${L.id}" class="mlens" data-layout-allow-overlap style="left:${left}px;top:${top}px;width:${ow}px;height:${oh}px"><canvas id="mlc-${L.id}" width="${L.C[0]}" height="${L.C[1]}"></canvas></div>`);
    html.push(`      <div id="mlsrc-${L.id}" class="mlsrc">${(L.urls || []).map((u) => `<img src="${base}${u}" alt="">`).join('')}</div>`);
    html.push('    </div>');
  }
  html.push('  </div>');

  // --- 進出場（整層＋子母畫面）---
  const pipSel = (it.pipIds || []).join(', ');
  const layer = `#el-${id}`;
  const both = pipSel ? `${layer}, ${pipSel}` : layer;
  const fullEnd = it.end <= lim + 1e-6;
  const ent = it.enterFx, ext = it.exitFx;
  if (ent === 'fade') tl.push(`tl.fromTo('${both}', { opacity: 0 }, { opacity: 1, duration: ${ENTER.fade}, ease: 'sine.out' }, ${sh(s)});`);
  else if (ent === 'slide') {
    tl.push(`tl.fromTo('${layer}', { x: ${CW} }, { x: 0, duration: ${ENTER.slide}, ease }, ${sh(s)});`);
    if (pipSel) tl.push(`tl.fromTo('${pipSel}', { opacity: 0 }, { opacity: 1, duration: ${ENTER.fade}, ease: 'sine.out' }, ${sh(s)});`);
  } else if (ent === 'tape') {
    // 整層 0.2 秒淡入；面板從 1.05 倍、多轉 3° 落下貼平（0.35 秒）；兩條膠帶依序啪地貼上
    tl.push(`tl.fromTo('${layer}', { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'sine.out' }, ${sh(s)});`);
    tl.push(`tl.fromTo('#mgr-${id}', { scale: 1.05, rotation: 3 }, { scale: 1, rotation: 0, duration: ${TAPE.drop}, ease: 'power3.out' }, ${sh(s)});`);
    [1, 2].forEach((k) => tl.push(`tl.fromTo('#mtp-${id}-${k}', { opacity: 0, scale: 1.4 }, { opacity: 1, scale: 1, duration: ${TAPE.dur}, ease: 'power2.out' }, ${sh(s + TAPE.drop + (k - 1) * TAPE.gap)});`));
    if (pipSel) tl.push(`tl.fromTo('${pipSel}', { opacity: 0 }, { opacity: 1, duration: ${ENTER.fade}, ease: 'sine.out' }, ${sh(s)});`);
  } else if (ent === 'zoom') {
    tl.push(`tl.fromTo('${layer}', { opacity: 0, scale: 1.06 }, { opacity: 1, scale: 1, duration: ${ENTER.zoom}, ease: 'power2.out' }, ${sh(s)});`);
    if (pipSel) tl.push(`tl.fromTo('${pipSel}', { opacity: 0 }, { opacity: 1, duration: ${ENTER.fade}, ease: 'sine.out' }, ${sh(s)});`);
  }
  if (fullEnd) {
    // 出場一律 immediateRender:false（同一個屬性進場時已經補間過，見 pitfalls §22）
    const pipOut = () => { if (pipSel) tl.push(`tl.fromTo('${pipSel}', { opacity: 1 }, { opacity: 0, duration: ${EXIT.fade}, ease: 'sine.in', immediateRender: false }, ${sh(it.end - EXIT.fade)});`); };
    if (ext === 'fade') tl.push(`tl.fromTo('${both}', { opacity: 1 }, { opacity: 0, duration: ${EXIT.fade}, ease: 'sine.in', immediateRender: false }, ${sh(it.end - EXIT.fade)});`);
    else if (ext === 'slide') { tl.push(`tl.fromTo('${layer}', { x: 0 }, { x: -${CW}, duration: ${EXIT.slide}, ease, immediateRender: false }, ${sh(it.end - EXIT.slide)});`); pipOut(); }
    else if (ext === 'zoom') { tl.push(`tl.fromTo('${layer}', { opacity: 1, scale: 1 }, { opacity: 0, scale: 0.96, duration: ${EXIT.zoom}, ease: 'power2.in', immediateRender: false }, ${sh(it.end - EXIT.zoom)});`); pipOut(); }
  }

  // --- 右側步驟清單：亮起／變淡（第一個補間 immediateRender:false，之前照 CSS 的淡色）---
  sdi.forEach((x, k) => {
    const it1 = `#msdi-${id}-${k + 1}`, hi = `#msdh-${id}-${k + 1}`, nx = sdi[k + 1];
    tl.push(`tl.fromTo('${it1}', { opacity: ${SIDE.dim} }, { opacity: 1, duration: ${SIDE.hi}, ease: 'sine.out', immediateRender: false }, ${sh(x.at)});`);
    tl.push(`tl.fromTo('${hi}', { opacity: 0 }, { opacity: 1, duration: ${SIDE.hi}, ease: 'sine.out', immediateRender: false }, ${sh(x.at)});`);
    if (nx) {
      tl.push(`tl.fromTo('${it1}', { opacity: 1 }, { opacity: ${SIDE.done}, duration: ${SIDE.hi}, ease: 'sine.in', immediateRender: false }, ${sh(nx.at)});`);
      tl.push(`tl.fromTo('${hi}', { opacity: 1 }, { opacity: 0, duration: ${SIDE.hi}, ease: 'sine.in', immediateRender: false }, ${sh(nx.at)});`);
    }
  });

  // --- 動態 v2：面板從小視窗長出（從講者進來的 fade 才長；slide／zoom／cut 照舊）、標註焦點（§7）---
  const v2 = [];
  if (ent === 'fade' && s + GROW.at < lim - 1e-6) v2.push(`M.grow('#mgr-${id}', ${sh(s + GROW.at)}, { from: '${GROW.from}' });`);
  const fev = [
    ...m.marks.filter(vis).map((mk) => ({ sel: `#fo-${mk.id}`, at: mk.at, until: mk.until })),
    ...cos.map((c) => ({ sel: `#fo-mc-${id}-${c.k}, #fo-mcc-${id}-${c.k}`, at: c.at, until: c.until })),
    ...ars.map((a) => ({ sel: `#fo-mar-${id}-${a.k}`, at: a.at, until: a.until })),
  ];
  for (const f of focusPlan(fev, it.end)) if (f.at < lim - 1e-6) v2.push(`M.dim('${f.sel}', ${sh(f.at)}, { to: ${f.to} });`);
  if (v2.length) tl.push(`{ const M = SceneMotion(tl, document.getElementById('el-${id}'));\n  ${v2.join('\n  ')}\n}`);

  // --- 運鏡（全部掛在 paused timeline：seek 到哪裡都一樣）---
  const st = `#mst-${id}`;
  const cam = (c) => `{ x: ${c.x}, y: ${c.y}, scale: ${c.z} }`;
  if (m.kb) tl.push(`tl.fromTo('${st}', { x: 0, y: 0, scale: 1 }, { x: ${m.kbTo.x}, y: ${m.kbTo.y}, scale: ${KB}, duration: ${n3(it.end - s)}, ease: 'none', force3D: false }, ${sh(s)});`);
  m.cams.forEach((mv, n) => {
    tl.push(`tl.fromTo('${st}', ${cam(mv.from)}, { x: ${mv.to.x}, y: ${mv.to.y}, scale: ${mv.to.z}, duration: ${n3(mv.dur)}, ease: 'power2.inOut', force3D: false${n ? ', immediateRender: false' : ''} }, ${sh(mv.t0)});`);
  });

  // --- 紅框：描線 0.4s → 描完閉環（pitfalls §50）→ 退場淡出 0.3s ---
  for (const mk of m.marks) {
    tl.push(`tl.fromTo('#${mk.id}', { strokeDashoffset: 1 }, { strokeDashoffset: 0, autoRound: false, duration: ${MARK.draw}, ease: 'power2.inOut' }, ${sh(mk.at)});`);
    tl.push(`tl.set('#${mk.id}', { strokeDasharray: 'none' }, ${sh(mk.at + MARK.draw)});`);
    tl.push(`tl.fromTo('#${mk.id}', { opacity: 1 }, { opacity: 0, duration: ${MARK.out}, ease: 'sine.in', immediateRender: false }, ${sh(mk.until - MARK.out)});`);
  }

  // --- 紅框線寬：框在運鏡層裡會跟著放大，反向補間讓畫面上一直是 4px（運鏡是 power2.inOut，線寬照同一條曲線分 8 小段）---
  for (const mk of m.marks) {
    for (const mv of m.cams) {
      const a = Math.max(mv.t0, mk.at), b = Math.min(mv.t0 + mv.dur, mk.until);
      if (b - a < 1e-3 || mv.from.z === mv.to.z) continue;
      const swAt = (t) => { const p = Math.min(1, Math.max(0, (t - mv.t0) / mv.dur)), e = p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2; return +(MARK.sw / (mv.from.z + (mv.to.z - mv.from.z) * e)).toFixed(3); };
      const N = 8, d = (b - a) / N;
      for (let k = 0; k < N; k++) {
        const t = a + k * d;
        if (t >= lim - 1e-6) break;
        tl.push(`tl.fromTo('#${mk.id}', { strokeWidth: ${swAt(t)} }, { strokeWidth: ${swAt(t + d)}, autoRound: false, duration: ${n3(d)}, ease: 'none', immediateRender: false }, ${sh(t)});`);
      }
    }
  }

  // --- 紅框跟捲動：同一個 <rect> 補間位置與大小（框在運鏡層裡，有運鏡也貼得住）---
  for (const mk of m.marks) {
    let r0 = mk.rect;
    for (const p of mk.path || []) {
      if (p.at >= lim - 1e-6) break;
      const a = (r) => `{ x: ${r[0]}, y: ${r[1]}, width: ${r[2]}, height: ${r[3]} }`;
      tl.push(`tl.fromTo('#${mk.id}', { attr: ${a(r0)} }, { attr: ${a(p.rect)}, duration: ${n3(p.dur)}, ease: 'power2.inOut', immediateRender: false }, ${sh(p.at)});`);
      r0 = p.rect;
    }
  }

  // --- 說明卡：紅框描線 → 引線 → 卡片滑入；退場三者一起淡出（quick：一起淡入）---
  const DRIFT = { right: [CALLOUT.drift, 0], left: [-CALLOUT.drift, 0], bottom: [0, CALLOUT.drift], top: [0, -CALLOUT.drift] };
  for (const c of cos) {
    const b = `#mcb-${id}-${c.k}`, l = `#mcl-${id}-${c.k}`, cd = `#mcc-${id}-${c.k}`;
    if (c.quick) {
      tl.push(`tl.set('${b}, ${l} path', { strokeDasharray: 'none' }, ${sh(c.at)});`);
      tl.push(`tl.fromTo('${b}, ${l}, ${cd}', { opacity: 0 }, { opacity: 1, duration: ${CALLOUT.quick}, ease: 'power2.out' }, ${sh(c.at)});`);
      tl.push(`tl.set('${l} circle', { opacity: 1 }, ${sh(c.at)});`);
    } else {
      const [dx, dy] = DRIFT[c.side];
      tl.push(`tl.fromTo('${b}', { strokeDashoffset: 1 }, { strokeDashoffset: 0, autoRound: false, duration: ${MARK.draw}, ease: 'power2.inOut' }, ${sh(c.at)});`);
      tl.push(`tl.set('${b}', { strokeDasharray: 'none' }, ${sh(c.at + MARK.draw)});`);
      tl.push(`tl.set('${l} circle', { opacity: 1 }, ${sh(c.at + CALLOUT.lineAt)});`);
      tl.push(`tl.fromTo('${l} path', { strokeDashoffset: 1 }, { strokeDashoffset: 0, autoRound: false, duration: ${CALLOUT.lineDur}, ease: 'power1.inOut' }, ${sh(c.at + CALLOUT.lineAt)});`);
      tl.push(`tl.set('${l} path', { strokeDasharray: 'none' }, ${sh(c.at + CALLOUT.lineAt + CALLOUT.lineDur)});`);
      tl.push(`tl.fromTo('${cd}', { opacity: 0, x: ${dx}, y: ${dy} }, { opacity: 1, x: 0, y: 0, duration: ${CALLOUT.cardDur}, ease: 'power2.out' }, ${sh(c.at + CALLOUT.cardAt)});`);
    }
    tl.push(`tl.fromTo('${b}, ${l}, ${cd}', { opacity: 1 }, { opacity: 0, duration: ${CALLOUT.out}, ease: 'sine.in', immediateRender: false }, ${sh(c.until - CALLOUT.out)});`);
  }

  // --- 聚光燈 ---
  for (const p of sps) {
    tl.push(`tl.fromTo('#msp-${id}-${p.k}', { opacity: 0 }, { opacity: 1, duration: ${SPOT.fade}, ease: 'power1.inOut' }, ${sh(p.at)});`);
    tl.push(`tl.fromTo('#msp-${id}-${p.k}', { opacity: 1 }, { opacity: 0, duration: ${SPOT.fade}, ease: 'power1.inOut', immediateRender: false }, ${sh(p.until - SPOT.fade)});`);
  }

  // --- 箭頭：沿箭身方向從 12px 外滑向目標 ---
  for (const a of ars) {
    const ox = +(ARROW.slide * a.u[0]).toFixed(2), oy = +(ARROW.slide * a.u[1]).toFixed(2);
    tl.push(`tl.fromTo('#mar-${id}-${a.k}', { opacity: 0, x: ${ox}, y: ${oy} }, { opacity: 1, x: 0, y: 0, duration: ${ARROW.fade}, ease: 'power2.out' }, ${sh(a.at)});`);
    tl.push(`tl.fromTo('#mar-${id}-${a.k}', { opacity: 1 }, { opacity: 0, duration: ${ARROW.fade}, ease: 'sine.in', immediateRender: false }, ${sh(a.until - ARROW.fade)});`);
  }

  // --- STEP 膠囊：第一步整顆滑入（接續上一段時直接出現）；換步舊的淡出、新的淡入 ---
  stl.forEach((p, k) => {
    const me = `#mstep-${id}-${k + 1}`;
    if (k === 0) {
      if (p.carry) { tl.push(`tl.set('#msteps-${id}', { opacity: 1 }, ${sh(s)});`); tl.push(`tl.set('${me}', { opacity: 1 }, ${sh(s)});`); }
      else { tl.push(`tl.fromTo('#msteps-${id}', { opacity: 0, x: ${STEP.inX} }, { opacity: 1, x: 0, duration: ${STEP.in}, ease: 'power2.out' }, ${sh(p.at)});`); tl.push(`tl.set('${me}', { opacity: 1 }, ${sh(p.at)});`); }
      return;
    }
    tl.push(`tl.fromTo('#mstep-${id}-${k}', { opacity: 1 }, { opacity: 0, duration: ${STEP.swOut}, ease: 'power1.in', immediateRender: false }, ${sh(p.at)});`);
    tl.push(`tl.fromTo('${me}', { opacity: 0 }, { opacity: 1, duration: ${STEP.swIn}, ease: 'power2.out' }, ${sh(p.at + STEP.swDelay)});`);
  });

  // --- 放大鏡（motion-recipes §7）---
  for (const L of m.lenses) {
    if (L.la >= lim - 1e-6) continue;
    const b = L.back;
    const back = `{ x: ${b.x}, y: ${b.y}, scaleX: ${b.scaleX}, scaleY: ${b.scaleY} }`;
    const home = '{ x: 0, y: 0, scaleX: 1, scaleY: 1 }';
    const p0 = L.la + LENS.delay;
    tl.push(`tl.fromTo('#mlr-${L.id}', { strokeDashoffset: 1 }, { strokeDashoffset: 0, autoRound: false, duration: 0.4, ease: 'power2.inOut' }, ${sh(L.la)});`);
    tl.push(`tl.fromTo('#mlr-${L.id}', { opacity: 1 }, { opacity: 0, duration: 0.3, ease: 'sine.in', immediateRender: false }, ${sh(p0)});`);
    tl.push(`tl.fromTo('#mdim-${L.id}', { opacity: 0 }, { opacity: 0.5, duration: 0.3, ease: 'sine.out' }, ${sh(p0)});`);
    tl.push(`tl.fromTo('#mlens-${L.id}', { opacity: 0 }, { opacity: 1, duration: 0.05, ease: 'none' }, ${sh(p0)});`);
    tl.push(`tl.fromTo('#mlens-${L.id}', ${back}, { x: 0, y: 0, scaleX: 1, scaleY: 1, duration: ${LENS.pop}, ease: 'back.out(1.4)', force3D: false }, ${sh(p0)});`);
    tl.push(`tl.fromTo('#mlens-${L.id}', ${home}, { x: ${b.x}, y: ${b.y}, scaleX: ${b.scaleX}, scaleY: ${b.scaleY}, duration: ${LENS.back}, ease: 'power2.in', force3D: false, immediateRender: false }, ${sh(L.lb - LENS.back)});`);
    tl.push(`tl.fromTo('#mlens-${L.id}', { opacity: 1 }, { opacity: 0, duration: ${LENS.fade}, ease: 'none', immediateRender: false }, ${sh(L.lb - LENS.fade)});`);
    tl.push(`tl.fromTo('#mdim-${L.id}', { opacity: 0.5 }, { opacity: 0, duration: ${LENS.back}, ease: 'sine.in', immediateRender: false }, ${sh(L.lb - LENS.back)});`);
    tl.push(`MediaKit.lens(tl, '#mlc-${L.id}', '#mlsrc-${L.id} img', ${JSON.stringify(L.map || [0])}, ${sh(L.la)}, ${n3(L.lb - L.la)});`);
  }
  return { html: html.join('\n'), tl };
}
