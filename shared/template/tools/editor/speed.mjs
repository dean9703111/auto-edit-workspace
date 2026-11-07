// 錄影段的畫面速度：段內分成幾區，每區一個倍速（0＝定格）。講話的時間不變，只改畫面走多快。
// 瀏覽器和測試共用，沒有 DOM。
//
//   model＝{ start, zones: [{ from, to, rate }] }   start＝段起點對到素材第幾秒；from、to＝段內秒
//   modelOf(seg, len, { knots, resolveAt })          plan.json 的 in／speed／hold／out／retime → model
//   fieldsOf(model, { dur, oldRetime, resolveAt })   model → 要寫回 plan.json 的欄位（undefined＝拿掉）
//   knotsOf(model, dur)                              → [[段內秒, 素材秒], …]（預覽照這個走）
//   cutAt、setRate、freezeAt、joinAt                 改 model，回傳新的；做不到回 null
export const SPEEDS = [0, 0.5, 0.75, 1, 1.5, 2, 4, 8];
export const MIN_ZONE = 0.3;     // 一區最短幾秒（檢查要求兩點至少隔 0.1 秒；太短也看不出來）
const SPEED_FIELD = [0.5, 4];    // plan.json 的 speed 能寫的範圍；超過就寫 retime
const r3 = (x) => Math.round(x * 1000) / 1000;
const near = (a, b) => Math.abs(a - b) < 1e-3;

export const speedLabel = (rate) => (rate === 0 ? '定格' : rate === 1 ? '原速' : `×${r3(rate)}`);

function zonesFromKnots(knots) {
  const zones = [];
  for (let i = 1; i < knots.length; i++) {
    const dt = knots[i][0] - knots[i - 1][0];
    if (dt <= 0) continue;
    zones.push({ from: r3(knots[i - 1][0]), to: r3(knots[i][0]), rate: r3((knots[i][1] - knots[i - 1][1]) / dt) });
  }
  return zones;
}

// knots＝伺服器算好的（有的話最準）；沒有就照欄位算。resolveAt(at) → 段內秒（"+3.2"、"#21@詞"）
export function modelOf(seg, len, { knots = null, resolveAt = null } = {}) {
  if (knots?.length >= 2) return { start: knots[0][1], zones: zonesFromKnots(knots) };
  if (seg.hold != null) return { start: seg.hold, zones: [{ from: 0, to: r3(len), rate: 0 }] };
  if (Array.isArray(seg.retime) && seg.retime.length >= 2 && resolveAt) {
    const pts = seg.retime.map((k) => [resolveAt(k.at), k.src]);
    if (pts.every(([t]) => t != null)) {
      if (pts[0][0] > 0.01) pts.unshift([0, Math.max(0, pts[0][1] - pts[0][0])]);
      const last = pts[pts.length - 1];
      if (last[0] < len - 0.01) pts.push([len, last[1] + (len - last[0])]);
      return { start: pts[0][1], zones: zonesFromKnots(pts) };
    }
  }
  const start = Number.isFinite(seg.in) ? seg.in : 0;
  if (Number.isFinite(seg.out) && seg.out > start && len > 0) return { start, zones: [{ from: 0, to: r3(len), rate: r3((seg.out - start) / len) }] };
  return { start, zones: [{ from: 0, to: r3(len), rate: Number.isFinite(seg.speed) ? seg.speed : 1 }] };
}

// 相鄰同速的併起來；太短的併進前一區
function tidy(zones) {
  const out = [];
  for (const z of zones) {
    const l = out[out.length - 1];
    if (l && (l.rate === z.rate || z.to - z.from < 1e-3)) l.to = z.to;
    else out.push({ ...z });
  }
  return out;
}

export function knotsOf(model, dur = null) {
  const pts = [[0, r3(model.start)]];
  let src = model.start;
  for (const z of model.zones) {
    const next = src + (z.to - z.from) * z.rate;
    // 素材用完：照選的速度播到最後一格，剩下的時間停在那一格
    if (dur != null && next > dur + 1e-3) {
      if (src < dur - 1e-3) pts.push([r3(z.from + (dur - src) / z.rate), r3(dur)]);
      pts.push([r3(z.to), r3(dur)]);
      src = dur;
      continue;
    }
    src = next;
    pts.push([r3(z.to), r3(src)]);
  }
  return pts;
}

export function fieldsOf(model, { dur = null, oldRetime = null, resolveAt = null } = {}) {
  const zones = tidy(model.zones);
  const clear = { in: undefined, out: undefined, speed: undefined, hold: undefined, retime: undefined };
  const end = model.start + zones.reduce((s, z) => s + (z.to - z.from) * z.rate, 0);
  const clipped = dur != null && end > dur + 0.05;
  if (zones.length === 1 && !clipped) {
    const { rate } = zones[0];
    if (rate === 0) return { ...clear, hold: r3(model.start) };
    if (rate === 1) return { ...clear, in: model.start > 0 ? r3(model.start) : undefined };
    if (rate >= SPEED_FIELD[0] && rate <= SPEED_FIELD[1]) return { ...clear, in: model.start > 0 ? r3(model.start) : undefined, speed: rate };
  }
  const knots = knotsOf({ start: model.start, zones }, dur);
  // 最後一區是原速：不用寫最後一點（第一點之前、最後一點之後本來就是原速），段尾之後調短也不會超出
  if (zones.length > 1 && zones[zones.length - 1].rate === 1 && !clipped) knots.pop();
  // 時間沒動的點，留著原本的寫法（"#21@詞"：字幕改了還跟得上）
  const old = (oldRetime || []).map((k) => ({ at: k.at, t: resolveAt ? resolveAt(k.at) : null }));
  const atOf = (t) => old.find((k) => k.t != null && Math.abs(k.t - t) < 0.02)?.at ?? `+${r3(t)}`;
  return { ...clear, retime: knots.map(([t, src]) => ({ at: atOf(t), src })) };
}

const zoneIndex = (model, t) => {
  const i = model.zones.findIndex((z) => t >= z.from - 1e-6 && t < z.to - 1e-6);
  return i >= 0 ? i : model.zones.length - 1;
};
export const zoneAt = (model, t) => model.zones[zoneIndex(model, t)];

export function cutAt(model, t) {
  const i = zoneIndex(model, t), z = model.zones[i];
  if (!z || t - z.from < MIN_ZONE || z.to - t < MIN_ZONE) return null;
  const zones = model.zones.slice();
  zones.splice(i, 1, { ...z, to: r3(t) }, { ...z, from: r3(t) });
  return { ...model, zones };
}

export function setRate(model, t, rate) {
  const i = zoneIndex(model, t);
  if (!model.zones[i] || model.zones[i].rate === rate) return null;
  const zones = model.zones.slice();
  zones[i] = { ...zones[i], rate };
  return { ...model, zones: tidy(zones) };
}

// 從 t 開始定格 secs 秒（到不了那麼長就到這一區結尾）
export function freezeAt(model, t, secs) {
  const z = zoneAt(model, t);
  if (!z || z.rate === 0) return null;
  let next = model;
  if (t - z.from >= MIN_ZONE) next = cutAt(next, t) || next;
  const z2 = zoneAt(next, t);
  const stop = t + secs;
  if (z2.to - stop >= MIN_ZONE) next = cutAt(next, stop) || next;
  return setRate(next, t, 0);
}

// 拿掉最靠近 t 的切點：後一區併進前一區
export function joinAt(model, t) {
  if (model.zones.length < 2) return null;
  let best = 1;
  for (let i = 1; i < model.zones.length; i++) if (Math.abs(model.zones[i].from - t) < Math.abs(model.zones[best].from - t)) best = i;
  const zones = model.zones.slice();
  zones.splice(best - 1, 2, { ...zones[best - 1], to: zones[best].to });
  return { ...model, zones: tidy(zones) };
}

export const isPlain = (model) => model.zones.length === 1 && near(model.zones[0].rate, 1);

// 拖時間軸裁剪：段起點往後 ds 秒（負的＝往前），長度變成 len；畫面內容不跑、每一區的速度不變
export function trimModel(model, ds, len) {
  let start = model.start;
  let zones;
  if (ds > 0) {
    zones = [];
    for (const z of model.zones) {
      if (z.to <= ds) { start += (z.to - z.from) * z.rate; continue; }
      if (z.from < ds) { start += (ds - z.from) * z.rate; zones.push({ from: 0, to: r3(z.to - ds), rate: z.rate }); } else zones.push({ from: r3(z.from - ds), to: r3(z.to - ds), rate: z.rate });
    }
  } else {
    zones = model.zones.map((z, i) => ({ from: i === 0 ? 0 : r3(z.from - ds), to: r3(z.to - ds), rate: z.rate }));
    start = Math.max(0, start + ds * zones[0].rate);
  }
  const kept = [];
  for (const z of zones) {
    if (z.from >= len - 1e-3) break;
    kept.push({ ...z, to: r3(Math.min(z.to, len)) });
  }
  if (kept.length) kept[kept.length - 1].to = r3(len);
  return { start: r3(start), zones: kept.length ? kept : [{ from: 0, to: r3(len), rate: 1 }] };
}
