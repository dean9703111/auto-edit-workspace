// 講者位置（027）：一個參數 speakerSide（left｜center｜right）決定字卡靠哪邊、半螢幕的面板從哪邊推入、講者移多少。
// 模板不各自判斷：plan.mjs 算一次，main.mjs、audit、分鏡素材都讀同一份。純函式。
//
//   speakerSideOf(box, W, override) → 'left'｜'center'｜'right'（box＝speakerBox [x1, y1, x2, y2]；沒有框＝center；override＝plan.json 的 speakerSide）
//   sideLayout(box, C, { side, shift }) → { side, cx, cardSide, panelSide, shift, zh }
//       cardSide ：下方字卡靠哪邊（講者在左 → 右；其他 → 左）
//       panelSide：半螢幕的面板在哪邊（講者在左 → 右邊推入；其他 → 左邊推入）
//       shift    ：講者（底片）移多少 px，正＝往右、負＝往左：移到「沒有面板的那一半」的中間，最多移半個面板寬的一半（再多底片的邊會露出來）
//       shift 給了數字（plan.json 的 sideShift）就照它（方向照 panelSide）

export const SIDES = ['left', 'center', 'right'];
export const SIDE_ZH = { left: '左', center: '中', right: '右' };
const LEFT_OF = 0.42, RIGHT_OF = 0.58;   // 講者框中心在畫面寬的 42% 以左＝左、58% 以右＝右
const GRID = 8;

export function speakerSideOf(box, W = 1920, override = null) {
  if (SIDES.includes(override)) return override;
  if (!Array.isArray(box) || box.length !== 4) return 'center';
  const cx = (box[0] + box[2]) / 2;
  return cx < W * LEFT_OF ? 'left' : cx > W * RIGHT_OF ? 'right' : 'center';
}

export function sideLayout(box, C = { W: 1920 }, { side = null, shift = null } = {}) {
  const W = C.W ?? 1920, half = W / 2, max = half / 2;
  const s = speakerSideOf(box, W, side);
  const cx = Array.isArray(box) && box.length === 4 ? (box[0] + box[2]) / 2 : half;
  const panelSide = s === 'left' ? 'right' : 'left';
  const target = panelSide === 'left' ? W * 0.75 : W * 0.25;                       // 沒有面板的那一半的中間
  const snap = (v) => Math.round(v / GRID) * GRID;
  let d = panelSide === 'left' ? Math.min(max, Math.max(0, target - cx)) : -Math.min(max, Math.max(0, cx - target));
  d = snap(d);
  if (typeof shift === 'number' && Number.isFinite(shift)) d = panelSide === 'left' ? Math.abs(shift) : -Math.abs(shift);
  const cardSide = s === 'left' ? 'right' : 'left';
  const zh = `講者位置：${SIDE_ZH[s]}（中心 x ${Math.round(cx)}）→ 字卡靠${SIDE_ZH[cardSide]}、半螢幕面板在${SIDE_ZH[panelSide]}、講者${d === 0 ? '不用移' : `${d > 0 ? '右' : '左'}移 ${Math.abs(d)}`}`;
  return { side: s, cx: Math.round(cx), cardSide, panelSide, shift: d, zh };
}

// 透明的字卡動態（疊在講者上、原本整張 1920×1080 置中）放哪裡才不會蓋到臉：縮小放進講者旁邊的空位；空位太窄就放進下方字卡的位置。
//   fxStage(box, C, { side }) → { s, tx, ty, rect, css, attr }｜null（沒有講者框＝不動，和以前一樣）
const FX_PAD = 40, FX_MIN = 0.3, SAFE = { x0: 96, x1: 1824, y0: 120, y1: 870 }, BAND = [120, 536, 1020, 860];
export function fxStage(box, C = { W: 1920, H: 1080 }, { side = null } = {}) {
  if (!Array.isArray(box) || box.length !== 4) return null;
  const W = C.W ?? 1920, H = C.H ?? 1080, s0 = speakerSideOf(box, W, side);
  const left = [SAFE.x0, SAFE.y0, box[0] - FX_PAD, SAFE.y1], right = [box[2] + FX_PAD, SAFE.y0, SAFE.x1, SAFE.y1];
  const fit = (z) => Math.min((z[2] - z[0]) / W, (z[3] - z[1]) / H);
  const band = s0 === 'left' ? [W - BAND[2], BAND[1], W - BAND[0], BAND[3]] : BAND;     // 講者在左：下方字卡的位置也在右邊
  let zone = s0 === 'left' ? right : s0 === 'right' ? left : (fit(left) >= fit(right) ? left : right);
  if (!(fit(zone) >= FX_MIN)) zone = band;
  const s = Math.round(fit(zone) * 1000) / 1000;
  const tx = Math.round(zone[0] + ((zone[2] - zone[0]) - W * s) / 2), ty = Math.round(zone[1] + ((zone[3] - zone[1]) - H * s) / 2);
  return { s, tx, ty, rect: [tx, ty, Math.round(tx + W * s), Math.round(ty + H * s)], css: `transform: translate(${tx}px, ${ty}px) scale(${s}); transform-origin: 0 0;`, attr: 'data-layout-allow-overflow' };
}
