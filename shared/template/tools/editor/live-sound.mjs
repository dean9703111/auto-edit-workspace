// 058 剪輯台：改了直接套進完成影片預覽、不用「更新預覽」的欄位（build.mjs、editor.mjs、剪輯台頁面共用；頁面從 /editor/live-sound.mjs 載，所以不能 import node 的東西。
// 放在 editor/ 底下：還沒重開的舊版剪輯台服務也送得出這個檔，頁面重新整理不會整頁壞掉）
//
//   哪些欄位算「聲音」：只改音量、不動時間和畫面的那幾個——
//     edit.volume（人聲、音效、素材原聲）、edit.gains（人聲範圍音量）、edit.sfx[].db（自己加的音效的音量）、
//     bed.volume（背景音樂）、段的 sfxVolume（這段音效的音量）、media 段的 volume（素材原聲的音量；開關原聲不算，那是加減一條聲音）
//   拉平人聲（edit.level）、剪段、加刪音效、換曲都不算：要重新排時間或重新處理底片
//   第二輪：字幕樣式（captionStyle）、重點字幕（captionMarks 的整則 "#N"）也直接套（preview.js applyCaption、applyMarks 改播放器裡的字幕）。
//     只標幾個字的 "#N@詞" 頁面不管（AI 寫的），照樣要 build；主題（theme）不算：卡片配色會即時換，背景圖是 build 寫死在 index.html 的
//   082：片尾金句的位置、字級、框寬、行間距、段落間距（ending.x／y／size／w／lineSpacing／gap）也直接套（preview.js applyEnding 改播放器裡的 #end-quote）；改金句的字照樣要 build
//
//   soundOf(plan)              聲音那幾個欄位的值（build 記在 work/hyperframes/.cache/live.json＝「做進去的值」；頁面拿現在的值來比）
//   liveStrip(plan, { bedDefault, look })  拿掉上面那些欄位、其他照舊的 plan（指紋用：跟上次 build 比只差這些＝指紋一樣）；
//                              look＝呼叫端算好的講者設定（lib/look.mjs lookKey：沒寫和寫了預設值算同一個），沒給就照 plan.json 原樣
//   liveFingerprint(plan, srtText, hash, { bedDefault, look })  指紋：liveStrip 加上字幕檔的時間（srtTiming：只改字不算；hash＝呼叫端給的雜湊函式，node 用 sha1）
//   第三輪（r8）：字幕只改字也直接套（preview.js applyText 換播放器裡那一則的字）
//   liveOk(built, now)         這些差在預覽裡套得上嗎（做進去時是靜音的，乘多少都還是靜音：要重新 build）
//   liveScale(id, ctx)         完成影片預覽裡這個出聲元素的 data-volume 要乘多少（null＝不是剪輯台管的聲音，不動）
//
// 做法：完成影片預覽（HyperFrames 播放器）每一格照元素的 data-volume 設它自己的 Web Audio 增益，
// 剪輯台改 data-volume＝做進去的值 ×（現在的值 − 做進去的值）換成的倍數；重新 build 之後差是 0，不會疊兩次
export const LIVE_INFO = '.cache/live.json';
export const LIVE_INFO_V = 1;
// 這個值以下＝靜音（和剪輯台的軌頭、build 一樣：人聲、音效、素材原聲 −60，背景音樂 −40）
export const MUTE = Object.freeze({ voice: -60, sfx: -60, media: -60, bed: -40 });
// 播放器的增益上限（HyperFrames 把 data-volume 夾在 0–3.98＝+12 dB；build 也是同一個上限）
export const MAX_GAIN = 3.98;

const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const num = (v) => (isNum(v) ? v : 0);
export const dbGain = (db) => Math.pow(10, db / 20);
// 和 build（lib/plan.mjs editFootage）同一個找法：第一個包住 t 的範圍
export const gainDbAt = (t, gains) => (gains || []).find((g) => t >= g.from - 1e-6 && t < g.to - 1e-6)?.db ?? 0;

export function soundOf(plan) {
  const p = isObj(plan) ? plan : {}, e = isObj(p.edit) ? p.edit : {}, v = isObj(e.volume) ? e.volume : {};
  const segs = {};
  for (const s of Array.isArray(p.scenes) ? p.scenes : []) {
    if (!isObj(s) || typeof s.id !== 'string') continue;
    const o = {};
    if (isNum(s.sfxVolume)) o.sfxVolume = s.sfxVolume;
    if (s.type === 'media' && isNum(s.volume)) o.volume = s.volume;
    if (Object.keys(o).length) segs[s.id] = o;
  }
  return {
    voice: num(v.voice), sfx: num(v.sfx), media: num(v.media),
    gains: (Array.isArray(e.gains) ? e.gains : []).filter((g) => isObj(g) && isNum(g.from) && isNum(g.to) && g.to > g.from).map((g) => ({ from: g.from, to: g.to, db: num(g.db) })),
    own: (Array.isArray(e.sfx) ? e.sfx : []).filter(isObj).map((x) => ({ at: x.at, sound: x.sound, db: num(x.db) })),
    bed: isObj(p.bed) ? num(p.bed.volume) : 0,
    segs,
  };
}

// 和沒寫 edit 一樣的預設值（lib/edit.mjs：全是預設值時輸出和沒寫 edit 一模一樣）：剪輯台存檔會補齊，不能因為這樣就算「不只差聲音」
//   065 音效拖過、裁過（edit.sfxAdjust、edit.sfx 的 trimIn／trimOut）動到時間：照留，要更新預覽
const EDIT_DEFAULTS = [['cuts', []], ['fadeIn', 0], ['fadeOut', 0], ['joins', []], ['sfx', []], ['sfxAdjust', []], ['level', false]];
export function liveStrip(plan, { bedDefault = null, look } = {}) {
  const p = isObj(plan) ? JSON.parse(JSON.stringify(plan)) : {};
  if (look !== undefined) p.look = look;
  // 字幕樣式、整則的重點字幕：完成影片預覽直接改字幕（applyCaption、applyMarks）。"#N@詞" 留著（頁面不管，要 build），排好順序
  delete p.captionStyle;
  // 082 片尾金句的位置、字級：完成影片預覽直接改金句框（preview.js applyEnding）；金句的字要 build（文字動畫照字數排時間）
  if (isObj(p.ending)) { for (const k of ['x', 'y', 'size', 'w', 'lineSpacing', 'gap']) delete p.ending[k]; if (!Object.keys(p.ending).length) delete p.ending; }
  if (Array.isArray(p.captionMarks)) {
    const words = [...new Set(p.captionMarks.map((x) => {
      const m = typeof x === 'string' ? /^#(\d+)@(.+)$/.exec(x.trim()) : null;
      return m ? `#${Number(m[1])}@${m[2].trim()}` : typeof x === 'string' && /^#\d+$/.test(x.trim()) ? null : JSON.stringify(x);   // 寫錯的照原樣留（build 會擋）
    }).filter((x) => x != null))].sort();
    if (words.length) p.captionMarks = words; else delete p.captionMarks;
  }
  if (isObj(p.edit)) {
    const e = p.edit;
    delete e.volume; delete e.gains;
    if (Array.isArray(e.sfx)) e.sfx = e.sfx.map((x) => { if (!isObj(x)) return x; const { db, ...rest } = x; return rest; });
    for (const [k, d] of EDIT_DEFAULTS) if (k in e && JSON.stringify(e[k]) === JSON.stringify(d)) delete e[k];
    if (!Object.keys(e).length) delete p.edit;
  }
  // 背景音樂：拿掉音量；沒寫 bed＝工作區預設那一首（剪輯台第一次存音量時會把曲名一起寫進去，那不算換曲）
  const bed = isObj(p.bed) ? p.bed : null;
  if (p.bed === undefined || bed) {
    const { volume, ...rest } = bed || {};
    p.bed = { ...rest, music: bed && 'music' in bed ? bed.music ?? null : bedDefault ?? null };
  }
  if (Array.isArray(p.scenes)) {
    p.scenes = p.scenes.map((s) => {
      if (!isObj(s)) return s;
      const o = { ...s };
      delete o.sfxVolume;
      if (o.type === 'media' && isNum(o.volume)) o.volume = 'on';   // 原聲開著：音量多少不算，開關才算
      return o;
    });
  }
  return p;
}
// 鍵照字母排：plan.json 被別的工具重新排版、換了鍵的順序，指紋照樣一樣
export function stableJson(v) {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  if (isObj(v)) return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableJson(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}
// r8（作者：「調整字幕應該要直接變更吧？不需要按更新預覽」）：字幕檔只算時間（每一則的起迄，則數跟著算進去），不算字：
//   只改字頁面直接換播放器裡的字（preview.js applyText）；分割、合併、刪句、改時間會動到段落的位置，照樣要 build
export const srtTiming = (srtText) => String(srtText ?? '').split(/\r?\n/).filter((l) => l.includes('-->')).map((l) => l.trim()).join('\n');
export const liveFingerprint = (plan, srtText, hash, opts) => hash(`${stableJson(liveStrip(plan, opts))}\n${hash(srtTiming(srtText))}`);

// 做進去時是靜音（或小到乘回來會差很多）的地方，現在打開了：預覽裡乘多少都還是靜音，要重新 build
export function liveOk(b, n) {
  if (!b || !n) return false;
  const off = (v, k) => v <= MUTE[k] + 1e-9;
  const was = (bv, nv, k) => off(bv, k) && !off(nv, k);
  // 人聲：整條＋範圍音量；兩邊的範圍邊界上各看一次（中間是平的）
  const pts = [0, ...b.gains.flatMap((g) => [g.from, g.to]), ...n.gains.flatMap((g) => [g.from, g.to])];
  if (pts.some((t) => was(b.voice + gainDbAt(t, b.gains), n.voice + gainDbAt(t, n.gains), 'voice'))) return false;
  if (was(b.sfx, n.sfx, 'sfx') || was(b.media, n.media, 'media') || was(b.bed, n.bed, 'bed')) return false;
  for (const [id, s] of Object.entries(b.segs)) {
    const ns = n.segs[id] || {};
    if (isNum(s.sfxVolume) && was(s.sfxVolume + b.sfx, num(ns.sfxVolume) + n.sfx, 'sfx')) return false;
    if (isNum(s.volume) && isNum(ns.volume) && was(s.volume + b.media, ns.volume + n.media, 'media')) return false;
  }
  for (const o of b.own) {
    const x = n.own.find((y) => y.at === o.at && y.sound === o.sound);
    if (x && was(o.db + b.sfx, x.db + n.sfx, 'sfx')) return false;
  }
  return true;
}

// 播放器裡的元素 id（lib/main.mjs、lib/media.mjs 產生的）→ 是哪一種聲音、屬於哪一段
//   rough、rough-2…（人聲；片尾接的原始錄影 rough-tail 不吃人聲音量，build 也沒套）、sfx-<段>、sfx-<段>-e1…（段的音效）、
//   sfx-mood1…（情緒點）、sfx-own1…（自己加的，第 N 顆＝edit.sfx 的第 N−1 個）、bgm-bed、mv-<段>、mv-<段>-2…（素材原聲）
export function soundKind(id, segIds = []) {
  if (/^rough(-\d+)?$/.test(id)) return { kind: 'voice' };
  if (id === 'bgm-bed') return { kind: 'bed' };
  let m = /^sfx-own(\d+)$/.exec(id);
  if (m) return { kind: 'own', i: Number(m[1]) - 1 };
  if (/^sfx-mood\d+$/.test(id)) return { kind: 'mood' };
  const seg = (rest, tail) => segIds.find((s) => rest === s) ?? segIds.filter((s) => rest.startsWith(`${s}-`) && tail.test(rest.slice(s.length))).sort((a, b) => b.length - a.length)[0];
  if (id.startsWith('sfx-')) { const s = seg(id.slice(4), /^-e\d+$/); return s ? { kind: 'sfx', seg: s } : null; }
  if (id.startsWith('mv-')) { const s = seg(id.slice(3), /^-\d+$/); return s ? { kind: 'media', seg: s } : null; }
  return null;
}

// 倍數：built＝做進去的值（soundOf），now＝現在的值（頁面上的，還沒存的也算）；t＝人聲那一支現在播到 rough.mp4 的第幾秒
// 現在是靜音＝0；做進去時是靜音＝1（不動，乘不回來；liveOk 會叫你更新預覽）
export function liveScale(k, { built: b, now: n, t = 0 }) {
  if (!k || !b || !n) return null;
  const off = (v, key) => v <= MUTE[key] + 1e-9;
  const step = (bl, nl, key) => (off(nl, key) ? 0 : off(bl, key) ? 1 : dbGain(nl - bl));
  if (k.kind === 'voice') return step(b.voice + gainDbAt(t, b.gains), n.voice + gainDbAt(t, n.gains), 'voice');
  if (k.kind === 'bed') return step(b.bed, n.bed, 'bed');
  if (k.kind === 'mood') return step(b.sfx, n.sfx, 'sfx');
  if (k.kind === 'own') {
    const o = b.own[k.i];
    if (!o) return null;
    const x = n.own.find((y) => y.at === o.at && y.sound === o.sound);
    return x ? step(o.db + b.sfx, x.db + n.sfx, 'sfx') : 0;   // 已經拿掉的那一顆：先不出聲
  }
  if (k.kind === 'sfx') return step(num(b.segs[k.seg]?.sfxVolume) + b.sfx, num(n.segs[k.seg]?.sfxVolume) + n.sfx, 'sfx');
  if (k.kind === 'media') {
    const bv = b.segs[k.seg]?.volume, nv = n.segs[k.seg]?.volume;
    if (!isNum(bv)) return null;
    if (!isNum(nv)) return 0;   // 剛關掉原聲：先不出聲
    return step(bv + b.media, nv + n.media, 'media');
  }
  return null;
}
