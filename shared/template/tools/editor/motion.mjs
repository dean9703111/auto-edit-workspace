// 這段實際用了什麼轉場、畫面速度：AI 寫的、工具自動決定的，介面都照這裡顯示，使用者看得到。瀏覽器和測試共用，沒有 DOM。
import { speedLabel } from './speed.mjs';

const IN = { band: '卡片滑入', wipe: '色帶擦開', swap: '換卡（背景不動）', chapter: '色塊擦入', side: '側邊推入', fade: '淡入', wipeIn: '擦入', cut: '直接切', overlay: '動畫自己進場' };
const OUT = { band: '卡片收回', retract: '色帶收回', swap: '舊卡擦掉', cover: '停著，被下一段蓋過', hold: '墊在下一段底下', handoff: '直接換下一張卡', fade: '淡出', wipeOut: '擦出', side: '側邊收回', cut: '直接切', overlay: '動畫自己退場' };
const MEDIA_IN = { cut: '直接切', fade: '淡入', slide: '滑入', zoom: '縮放', whip: '甩鏡', tape: '紙膠帶貼上', tilt: '斜躺擺平' };
const MEDIA_OUT = { cut: '直接切', fade: '淡出', slide: '滑出', zoom: '縮放', whip: '甩鏡' };
// 這些沒有看得到的動作：時間軸不畫
const QUIET = new Set(['cut', 'cover', 'hold', 'overlay', 'handoff']);

// item＝/api/report 的一段（out.tx、out.wipe；錄影段另有 enter、exit）；enter、exit 傳使用者剛改、還沒存的值
export function transitionOf(item, { enter = null, exit = null } = {}) {
  const tx = item?.out?.tx, wipe = item?.out?.wipe;
  let inKey = tx?.in ?? null, outKey = tx?.out ?? null, inText = null, outText = null;
  if (item?.type === 'media') {
    const e = enter ?? item.enterNow ?? item.enter ?? 'fade', x = exit ?? item.exitNow ?? item.exit ?? 'fade';
    inKey = wipe?.in && !enter ? 'wipeIn' : e;
    outKey = wipe?.out && !exit ? 'wipeOut' : x;
    inText = wipe?.in && !enter ? '擦入' : MEDIA_IN[e] ?? e;
    outText = wipe?.out && !exit ? '擦出' : MEDIA_OUT[x] ?? x;
  } else {
    inText = inKey ? IN[inKey] ?? inKey : null;
    outText = outKey ? OUT[outKey] ?? outKey : null;
  }
  return { inKey, outKey, inText, outText, showIn: !!inKey && !QUIET.has(inKey), showOut: !!outKey && !QUIET.has(outKey) };
}

// knots＝[[段內秒, 素材秒], …] → 「3 秒原速、5 秒 ×2、2 秒定格」；整段原速回 null
export function speedSummary(knots) {
  if (!knots || knots.length < 2) return null;
  const parts = [];
  let plain = true;
  for (let i = 1; i < knots.length; i++) {
    const dt = knots[i][0] - knots[i - 1][0];
    if (dt <= 0) continue;
    const rate = Math.round(((knots[i][1] - knots[i - 1][1]) / dt) * 1000) / 1000;
    if (Math.abs(rate - 1) > 1e-3) plain = false;
    parts.push(`${Math.round(dt * 10) / 10} 秒 ${speedLabel(rate)}`);
  }
  return plain ? null : parts.join('、');
}
