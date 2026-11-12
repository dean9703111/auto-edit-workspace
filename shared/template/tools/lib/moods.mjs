// 情緒點（plan.json 第一層 moods，specs/023-emotion-sfx-camera）：音效照講者的情緒決定，不照選了哪個模板。
//
//   "moods": [
//     { "at": "#61@一個小時", "kind": "land" },               // 落定 → impact，峰值對齊「一個小時」開口
//     { "at": "#12@千萬不要", "kind": "pain", "zoom": true },  // 痛點 → alert，講者畫面同時爆衝推近
//     { "at": "#30@竟然", "kind": "turn", "sfx": null }        // 反轉，不要音效（只留標記或推近）
//   ]
//
//   MOOD_KINDS                 五類：音效、取捨的強弱（rank 大的先留）
//   validateMoods(moods, sfxConf)          → errors[]（欄位、類別、音效名稱）
//   moodCues(moods, { cues, sfxConf, videoDur, frame }) → { list, errors }
//       list[i] = { i, where, kind, event, sfx（{ name, at, volume, event } 或 null）, zoom, rank, sfxOff }
//   moodSound(kind, override)  → 音效名稱或 null
//   zoomSpans(list, { cues, cutPoints, videoDur, speakerVisible, blockedUntil }) → { zooms, notes }
//   moodCandidates(cues)       → 候選句（scaffold 印給寫草稿的子代理挑）
//   insertMoods(plan, moods)   → 新的 plan 物件：moods 放在 scenes 前面（TOP_KEYS 順序）
//   moodTarget(seconds)        → { target, low, cap, zoomCap }：一份草稿大概要幾個情緒點、最多幾次推近
//
// 規則（作者 2026-11-09 定案，2026-11-12 照他的剪映定剪放寬，specs/030）：任一分鐘最多 5 顆主音效、相距至少 3 秒，超過時照情緒強度留
// （金句、反轉 > 痛點、解法 > 落定 > 模板的固定配對）；模板的固定配對（章節、重點卡、提醒卡、總結）照常出聲，離情緒點不到 3 秒才讓；
// 使用者在段上明寫的 sfx、章節音效最優先。踩坑、解法的音效不在動畫段裡時打在句尾前 0.2 秒。推近每分鐘最多 1 次。
import { parseTime, cueSeconds, r3 } from './time.mjs';

export const MOOD_KINDS = Object.freeze({
  quote: { zh: '金句', sound: 'sparkle', rank: 5 },
  turn: { zh: '反轉', sound: 'shine', rank: 4 },
  pain: { zh: '痛點', sound: 'alert', rank: 3 },
  win: { zh: '解法', sound: 'success', rank: 3 },
  land: { zh: '落定', sound: 'impact', rank: 2 },
});
export const MOOD_KEYS = ['at', 'kind', 'sfx', 'zoom'];
export const MOOD_ZOOM = Object.freeze({ scale: 1.25, dur: 0.2, minHold: 0.8, maxHold: 2.5, perMinute: 1 });
const KIND_LIST = Object.entries(MOOD_KINDS).map(([k, v]) => `"${k}"（${v.zh}）`).join('、');

export function moodSound(kind, override) {
  if (override === null) return null;
  if (typeof override === 'string') return override;
  return MOOD_KINDS[kind]?.sound ?? null;
}

export function validateMoods(moods, sfxConf = {}) {
  const errors = [];
  if (moods === undefined) return errors;
  if (!Array.isArray(moods)) return [`moods 要是陣列，例 "moods": [{ "at": "#12@千萬不要", "kind": "pain" }]，現在是 ${JSON.stringify(moods)}`];
  const names = Object.keys(sfxConf).filter((k) => sfxConf[k]?.kind !== 'bgm');
  moods.forEach((m, i) => {
    const w = `moods[${i}]`;
    if (!m || typeof m !== 'object' || Array.isArray(m)) { errors.push(`${w} 要寫成 { "at": "#N@詞", "kind": "pain" }，現在是 ${JSON.stringify(m)}`); return; }
    for (const k of Object.keys(m)) if (!MOOD_KEYS.includes(k)) errors.push(`${w} 沒有「${k}」這個欄位（可用：${MOOD_KEYS.join('、')}）`);
    if (typeof m.at !== 'string' || !m.at.trim().startsWith('#')) errors.push(`${w}.at 要寫 "#N@詞"（第 N 句裡講到那個詞的地方），現在是 ${JSON.stringify(m.at)}`);
    if (!MOOD_KINDS[m.kind]) errors.push(`${w}.kind 只能是 ${KIND_LIST}，現在是 ${JSON.stringify(m.kind)}`);
    if (m.sfx !== undefined && m.sfx !== null && !(typeof m.sfx === 'string' && names.includes(m.sfx))) errors.push(`${w}.sfx 只能是 ${names.join('／')} 或 null（不要音效），現在是 ${JSON.stringify(m.sfx)}；不寫＝照類別配`);
    if (m.sfx && sfxConf[m.sfx]?.additive) errors.push(`${w}.sfx：「${m.sfx}」是附加音效（點擊），不能當情緒點的音效 → 拿掉 sfx 照類別配`);
    if (m.zoom !== undefined && typeof m.zoom !== 'boolean') errors.push(`${w}.zoom 只能寫 true（講者畫面爆衝推近）或拿掉，現在是 ${JSON.stringify(m.zoom)}`);
  });
  return errors;
}

// 情緒點 → 音效 cue（峰值對齊詞的開口）；cues 是完成影片的字幕時間（resolvePlan 換算過的）
export function moodCues(moods, { cues, sfxConf = {}, videoDur = Infinity, frame = 1 / 30 } = {}) {
  const list = [], errors = [];
  if (!Array.isArray(moods)) return { list, errors };
  moods.forEach((m, i) => {
    if (!m || typeof m !== 'object' || !MOOD_KINDS[m.kind] || typeof m.at !== 'string') return;
    const where = `moods[${i}]（${m.at} ${MOOD_KINDS[m.kind].zh}）`;
    const t = parseTime(m.at);
    if (t.error) { errors.push(`${where}：${t.error}`); return; }
    if (t.kind !== 'cue') { errors.push(`${where}：at 要綁字幕句，寫 "#N@詞"`); return; }
    const c = cueSeconds(t, cues);
    if (c.error) { errors.push(`${where}：${c.error}`); return; }
    const event = c.sec;
    if (!(event >= 0 && event < videoDur)) return;   // 剪掉的句子：不出聲也不報錯（剪輯台剪掉的）
    const name = moodSound(m.kind, m.sfx);
    let sfx = null;
    if (name && sfxConf[name]) {
      const conf = sfxConf[name];
      const at = r3(Math.max(0, event - (conf.peak || 0) + frame));
      if (at < videoDur) sfx = { name, at, volume: conf.volume ?? 0.5, event: r3(event), mood: true };
    }
    const cue = (cues || []).find((q) => q.n === t.n);   // 這一句的結尾（反應音效沒有動畫時打在句尾，lib/plan.mjs）
    list.push({ i, where, kind: m.kind, event: r3(event), sfx, zoom: m.zoom === true, rank: MOOD_KINDS[m.kind].rank, sfxOff: m.sfx === null, n: t.n, cueEnd: cue && Number.isFinite(cue.end) ? r3(cue.end) : null });
  });
  return { list, errors };
}

// 講者爆衝推近的區間：詞開口 0.2 秒推到 1.25 倍，停到這句講完（最多 2.5 秒、遇到接點或整張幕就提早收），收的時候直接切回。
//   speakerVisible(t) → 講者那一刻是不是滿版看得到；blockedUntil(a, b) → [a, b] 之間第一個蓋住講者的時間（沒有回 null）
export function zoomSpans(list, { cues, cutPoints = [], videoDur, speakerVisible = () => true, blockedUntil = () => null } = {}) {
  const zooms = [], notes = [];
  const want = list.filter((x) => x.zoom).sort((a, b) => b.rank - a.rank || a.event - b.event);
  const perMin = new Map();
  for (const x of want) {
    const a = x.event;
    if (!speakerVisible(a)) { notes.push(`${x.where} 的推近拿掉：那一刻講者被整張幕、側邊欄蓋住，或只有聲音`); continue; }
    const k = Math.floor(a / 60);
    if ((perMin.get(k) || 0) >= MOOD_ZOOM.perMinute) { notes.push(`${x.where} 的推近拿掉：同一分鐘已經推近 ${MOOD_ZOOM.perMinute} 次（留情緒比較強的）`); continue; }
    const cue = cues.find((c) => c.n === x.n);
    let b = Math.min(cue ? cue.end : a + MOOD_ZOOM.maxHold, a + MOOD_ZOOM.maxHold, videoDur);
    const cut = cutPoints.find((p) => p > a + 1e-3);
    if (cut != null) b = Math.min(b, cut);
    const blk = blockedUntil(a, b);
    if (blk != null) b = Math.min(b, blk);
    if (b - a < MOOD_ZOOM.minHold - 1e-6) {
      // 句尾太近：至少撐 0.8 秒（沒有接點、沒有整張幕擋著才能延長）
      const ext = Math.min(a + MOOD_ZOOM.minHold, videoDur);
      const cut2 = cutPoints.find((p) => p > a + 1e-3);
      if ((cut2 != null && cut2 < ext) || blockedUntil(a, ext) != null) { notes.push(`${x.where} 的推近拿掉：${MOOD_ZOOM.minHold} 秒內就有接點或整張幕，推了馬上被切掉`); continue; }
      b = ext;
    }
    if (zooms.some((z) => a < z.b && b > z.a)) { notes.push(`${x.where} 的推近拿掉：和前一次推近重疊`); continue; }
    perMin.set(k, (perMin.get(k) || 0) + 1);
    zooms.push({ a: r3(a), b: r3(b), scale: MOOD_ZOOM.scale, dur: MOOD_ZOOM.dur, where: x.where, i: x.i });
  }
  zooms.sort((p, q) => p.a - q.a);
  return { zooms, notes };
}

// 一份草稿（seconds 秒）大概要幾個情緒點：約每分鐘 1 個（至少 1 個），最多每分鐘 2 個（情緒點只是主音效的一部分，模板的固定配對另外算）；推近約每分鐘最多 1 次
export function moodTarget(seconds) {
  const min = Math.max(0, seconds) / 60;
  return { target: Math.max(1, Math.round(min)), low: Math.max(1, Math.floor(min * 0.6)), cap: Math.max(2, Math.ceil(min * 2)), zoomCap: Math.max(1, Math.floor(min)) };
}

// ---------- 候選（scaffold 印給子代理挑；只是提示，挑不挑、標哪一類由子代理判斷）----------
const LEX = [
  ['pain', /千萬不要|不要再|踩坑|踩雷|坑|錯誤|失敗|出錯|崩潰|焦慮|壓力|痛苦|麻煩|卡住|卡關|浪費|風險|小心|注意|危險|來不及|搞砸|翻車|白做|慘/],
  ['turn', /竟然|居然|沒想到|想不到|反而|原來|其實|但是|不過|偏偏|誰知道/],
  ['win', /解決|搞定|成功|做到|完成了|終於|省下|省了|變快|輕鬆|簡單|一鍵|自動|不用再|免費|順利/],
  ['land', /[0-9０-９一二兩三四五六七八九十百千萬半]+\s*(?:個(?:小時|月|禮拜|星期)?|小時|分鐘|秒鐘?|天|週|年|萬|倍|%|％|塊|元|人|台|部|步|支|次)/],
];
export function moodCandidates(cues) {
  const out = [];
  for (const c of cues) {
    for (const [kind, re] of LEX) {
      const m = String(c.text).match(re);
      if (m) { out.push({ n: c.n, kind, word: m[0].trim(), text: c.text }); break; }
    }
  }
  return out;
}

// plan.json 的 moods 放在 scenes 前面（和 TOP_KEYS 的順序一樣，剪輯台存檔也照這個順序）
export function insertMoods(plan, moods) {
  const out = {};
  for (const [k, v] of Object.entries(plan)) { if (k === 'moods') continue; if (k === 'scenes') out.moods = moods; out[k] = v; }
  if (!('moods' in out)) out.moods = moods;
  return out;
}
