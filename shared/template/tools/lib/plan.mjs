// plan.json → 每段的起迄、長度、圖層性質、子合成內容、音效（規格 §C.3、§B.5、§B.6）
//
//   resolvePlan({ plan, cues, videoDur, lib, outDir, sfxDir, projectDir, voiceOnly, cutpoints, probe, projectRel })
//     → { items, errors, warnings, globals, edit, editActive, tm, outDur, cuesOut, voiceOnly, voiceOut, footage, editFx }
//     lib = { scenes, icons, fx, consts, sfx, accent }
//     cues／videoDur／voiceOnly／cutpoints 都是 rough.mp4 的秒數；有 edit.cuts 時，items、cuesOut、outDur、footage 一律是「成片」秒數
//     （rough → 成片用 tm.map，反過來用 tm.unmapStart／unmapEnd）。沒有 edit 時兩者相同，輸出和舊版逐位元組一樣。
//     items（依起點排序）：{ id, type, key, label, start, end, D, opaque, pip, pipPieces, side, z, fadeIn, fadeOut, exitFade,
//                          footageReset, scene?, fxDef?, vars?, media?, compId, file, resolved?, chapter?, sfx?, sfxExtra[], errors[], warnings[] }
//                          sfx＝主音效 { name, at, volume, event }；sfxExtra＝跟動畫節拍的附加音效（同格式的陣列）
//     footage＝底片要切成幾支 <video>（edit 有效時才有）；editFx＝dip／punch／整支淡入淡出
//   sceneSfxCues({ scene, resolved, D, tone, override, extraOn, sfxConf }) → { main, extra, errors }（rel＝相對段起點的畫面事件秒數）
//   pipGeometry(pipCrop, speakerBox) → { crop:{x,y,w,h}, style:{left,top,width,height} }
//   formatReport(result) → 文字報告（每段一列：id｜情境｜起–迄｜長度｜音效時間｜警告）

import fs from 'node:fs';
import path from 'node:path';
import { findScene, suggestScenes, resolveScene } from './scenes.mjs';
import { readCustom } from './assemble.mjs';
import { findCue, norm, cueByN } from './srt.mjs';
import { parseTime, cueSeconds, r3, floorFrame, TIME_HELP, FPS } from './time.mjs';
import { normalizeEdit, timeMap, remapCues, splitAtJoins, subtract, dB, PUNCH } from './edit.mjs';
import { MEDIA_KEYS, ENTER, checkMediaSeg, resolveMedia } from './media.mjs';

const TOP_KEYS = ['version', 'frame', 'speakerBox', 'sideShift', 'pipCrop', 'avoid', 'edit', 'scenes'];
const KEYS = {
  scene: ['id', 'type', 'scene', 'from', 'to', 'duration', 'at', 'anchor', 'slots', 'beats', 'tone', 'sfx', 'sfxExtra', 'css', 'chtag', 'pip', 'sfxVolume', 'note'],
  fx: ['id', 'type', 'fx', 'from', 'to', 'duration', 'anchor', 'bg', 'vars', 'sfx', 'sfxExtra', 'sfxVolume', 'note'],
  custom: ['id', 'type', 'src', 'layout', 'from', 'to', 'duration', 'anchor', 'sfx', 'sfxExtra', 'pip', 'sfxVolume', 'note'],
  media: MEDIA_KEYS,
};
const DECLICK = 0.02;      // 剪接點兩側的人聲淡入淡出（避免爆音）
const VOICE_ERR = 1;       // 只有聲音的區間沒被蓋住超過 1 秒就 ✖
const VOICE_WARN = 0.5;
const PIP_MIN = 0.5;        // 子母畫面片段短於 0.5 秒就不放（只會閃一下）
const FADE = 0.5;          // 不透明幕淡入淡出
const HANDOFF = 0.4;       // 下方字卡換卡：前一張延到後一張起點＋0.4
const SFX_GAP = 3;         // 主音效之間的間隔
const EXTRA_GAP = 0.2;     // 同一段內兩個音效起點的最小間隔（附加音效太近就丟掉後者）
const LOWER = new Set(['lower-third']);
// 各情境大約佔的畫面範圍（§B.6；只用來提醒和講者框的碰撞，最後以 snapshot 為準）
const FOOTPRINT = {
  'lower-third': [[120, 536, 1020, 860]], summary: [[510, 536, 1410, 860]], quote: [[510, 536, 1410, 860]],
  keywords: [[120, 160, 560, 870]], 'chapter-tag': [[1200, 56, 1824, 168]], 'two-sides': [[96, 160, 600, 870], [1320, 160, 1824, 870]],
};

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const fmt = (t) => (t == null ? '—' : `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`);

export function pipGeometry(pipCrop, speakerBox) {
  const PW = 432, AR = 4 / 3;   // 子母畫面本體 432×324（4:3）
  let crop;
  if (Array.isArray(pipCrop)) {
    const [x, y, w, h] = pipCrop;
    crop = { x, y, w, h };
  } else if (!speakerBox) {
    const h = 0.66 * 1080, w = h * AR;
    crop = { x: (1920 - w) / 2, y: 0.02 * 1080, w, h };
  } else {
    const bw = speakerBox[2] - speakerBox[0], bh = speakerBox[3] - speakerBox[1];
    const cx = (speakerBox[0] + speakerBox[2]) / 2, cy = (speakerBox[1] + speakerBox[3]) / 2;
    let h = Math.min(1080, Math.max(bh * 1.15, bw * 1.15 / AR));
    let w = h * AR;
    if (w > 1920) { w = 1920; h = w / AR; }
    crop = { x: Math.min(Math.max(cx - w / 2, 0), 1920 - w), y: Math.min(Math.max(cy - h / 2, 0), 1080 - h), w, h };
  }
  const s = PW / crop.w;
  return { crop, style: { left: Math.round(-crop.x * s), top: Math.round(-crop.y * s), width: Math.round(1920 * s), height: Math.round(1080 * s) } };
}

const inter = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));

// scene.json 的 sfx.*.at 表達式 → 相對段起點的秒數陣列：start｜end｜<beat>｜<清單>[i]｜<清單>[i:]，可接 ± 秒數
function evalSfxAt(expr, resolved, D) {
  const m = String(expr ?? '').match(/^\s*([A-Za-z_]\w*)(?:\[\s*(\d+)\s*(:)?\s*\])?\s*(?:([+-])\s*(\d+(?:\.\d+)?))?\s*$/);
  if (!m) throw new Error('文法要是 start／end／<beat 名>／<清單名>[i]／<清單名>[i:]，後面可接 + 秒數 或 - 秒數');
  const [, name, idx, colon, sign, num] = m;
  const off = sign ? (sign === '-' ? -1 : 1) * Number(num) : 0;
  const beats = resolved?.beats || {}, lt = resolved?.listTimes || {};
  let base;
  if (idx === undefined) {
    if (name === 'start') base = [0];
    else if (name === 'end') base = [D];
    else if (name in beats) base = [beats[name]];
    else throw new Error(`沒有「${name}」這個時間點（可用：start、end、${Object.keys(beats).join('、') || '無 beat'}；清單要寫 ${Object.keys(lt)[0] || '清單名'}[i]）`);
  } else {
    if (!(name in lt)) throw new Error(`沒有「${name}」這個清單（可用：${Object.keys(lt).join('、') || '無'}）`);
    const i = Number(idx);
    base = colon ? lt[name].slice(i) : lt[name].slice(i, i + 1);
  }
  return base.map((t) => r3(t + off));
}

// 一個情境的音效 cue（畫面事件秒數，相對段起點）。override：plan 的 sfx（undefined＝照 scene.json；null＝不配；字串＝換名稱）
export function sceneSfxCues({ scene, resolved, D, tone = null, override, extraOn = true, sfxConf }) {
  const errors = [];
  const def = scene.sfx || {};
  const peakOf = (n) => sfxConf[n]?.peak || 0;
  let name = override;
  if (name === undefined) {
    const snd = def.main?.sound ?? null;
    name = snd && typeof snd === 'object' ? (snd[tone] ?? snd.default ?? null) : snd;
    for (const v of snd && typeof snd === 'object' ? Object.values(snd) : [snd]) {
      if (v && !sfxConf[v]) errors.push(`音效 main（情境 ${scene.key}）：sfx.json 沒有「${v}」`);
    }
  }
  const mainAt = def.main?.at ?? 'start';
  const evalAt = (what, expr) => {
    try { return evalSfxAt(expr, resolved, D); } catch (e) { errors.push(`音效 ${what}（情境 ${scene.key}）的 at「${expr}」：${e.message}`); return []; }
  };
  let main = null;
  if (name && sfxConf[name]) {
    const [rel] = evalAt('main', mainAt);
    if (rel != null) main = { name, rel };
  }
  const extra = [];
  if (extraOn) {
    const kept = main ? [main.rel - peakOf(main.name)] : [];
    const cues = [];
    (def.extra || []).forEach((c, n) => {
      if (!sfxConf[c.sound]) { errors.push(`音效 extra[${n}]（情境 ${scene.key}）：sfx.json 沒有「${c.sound}」`); return; }
      for (const rel of evalAt(`extra[${n}]`, c.at)) if (rel < D) cues.push({ name: c.sound, rel, vol: c.volume ?? 1 });
    });
    for (const c of cues.sort((a, b) => a.rel - peakOf(a.name) - (b.rel - peakOf(b.name)))) {
      const st = c.rel - peakOf(c.name);
      if (kept.some((k) => Math.abs(k - st) < EXTRA_GAP - 1e-9)) continue;
      kept.push(st);
      extra.push(c);
    }
  }
  return { main, extra, errors };
}

export function resolvePlan({ plan, cues, videoDur, lib, outDir, sfxDir, projectDir = null, voiceOnly = [], cutpoints = [], probe, projectRel = 'projects/<專案>' }) {
  const errors = [], warnings = [];
  const { scenes, icons, fx, consts, sfx: sfxConf = {}, accent = '#FFD400' } = lib;
  const roughDur = videoDur;

  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return { items: [], errors: ['plan.json 要是一個物件 { "version": 1, "scenes": [...] }'], warnings, globals: {} };
  for (const k of Object.keys(plan)) if (!TOP_KEYS.includes(k)) errors.push(`plan.json 第一層沒有「${k}」這個欄位（可用：${TOP_KEYS.join('、')}）`);
  if (plan.version !== 1) errors.push(`version 要寫 1（現在是 ${JSON.stringify(plan.version)}）`);

  // --- edit（剪輯台）：rough.mp4 秒數 → 成片秒數。沒有 cuts 時是恆等對應，下面所有計算和舊版一樣 ---
  const ne = normalizeEdit(plan.edit, { videoDur: roughDur, cutpoints });
  errors.push(...ne.errors); warnings.push(...ne.warnings);
  const edit = ne.edit;
  const tm = timeMap(edit.cuts, roughDur);
  const roughCues = cues;
  if (!tm.identity) {
    cues = remapCues(cues, tm);
    // rough 長度已對齊到格；cuts 是毫秒，r3 的誤差不能讓成片少掉最後一格
    videoDur = floorFrame(tm.outDur + 0.001);
  }
  const mapAbs = (x) => (tm.identity ? x : tm.map(x));
  const voiceOut = voiceOnly.map(([a, b]) => [mapAbs(a), mapAbs(b)]).filter(([a, b]) => b - a > 0.05);
  let speakerBox = plan.speakerBox ?? null;
  if (speakerBox != null && !(Array.isArray(speakerBox) && speakerBox.length === 4 && speakerBox.every(isNum) && speakerBox[0] < speakerBox[2] && speakerBox[1] < speakerBox[3])) {
    errors.push(`speakerBox 要寫 [x1, y1, x2, y2]（四個數字、左上到右下，1920×1080 座標），現在是 ${JSON.stringify(speakerBox)}`);
    speakerBox = null;
  }
  if (speakerBox == null && !errors.length) warnings.push('沒寫 speakerBox：看場地照框出講者頭、身體與手勢（外擴 40px），build 才能檢查右移與碰撞');
  const sideShift = plan.sideShift ?? 480;
  if (!isNum(sideShift) || sideShift < 0 || sideShift > 960) errors.push(`sideShift 要是 0–960 的數字（預設 480），現在是 ${JSON.stringify(plan.sideShift)}`);
  if (plan.frame != null) {
    const fr = plan.frame;
    if (!(Array.isArray(fr) && fr.length === 4 && fr.every(isNum) && fr[0] >= 0 && fr[1] >= 0 && fr[2] > 0 && fr[3] > 0 && fr[0] + fr[2] <= 1920 && fr[1] + fr[3] <= 1080))
      errors.push(`frame 要寫 [x, y, w, h]（1920×1080 座標、在畫面內），現在是 ${JSON.stringify(fr)} → 跑 qc.mjs framing 看建議值`);
    else if (Math.abs(fr[2] / fr[3] - 16 / 9) > 0.01) errors.push(`frame 的寬高比要是 16:9（現在 ${fr[2]}×${fr[3]}）→ 照 qc.mjs framing 印的值寫`);
    else if (1920 / fr[2] > 1.5) warnings.push(`frame 放大 ${(1920 / fr[2]).toFixed(2)} 倍，畫質會明顯變軟（建議 ≤ 1.3）`);
  }
  const pipCrop = plan.pipCrop ?? 'auto';
  if (pipCrop !== 'auto' && !(Array.isArray(pipCrop) && pipCrop.length === 4 && pipCrop.every(isNum) && pipCrop[2] > 0 && pipCrop[3] > 0 && pipCrop[0] >= 0 && pipCrop[1] >= 0 && pipCrop[0] + pipCrop[2] <= 1920 && pipCrop[1] + pipCrop[3] <= 1080)) {
    errors.push(`pipCrop 要寫 "auto" 或 [x, y, w, h]（裁切框在 1920×1080 內），現在是 ${JSON.stringify(plan.pipCrop)}`);
  }
  const avoid = plan.avoid ?? [];
  if (!Array.isArray(avoid)) errors.push('avoid 要寫成陣列，例如 ["two-sides"]');
  const avoidSet = new Set((Array.isArray(avoid) ? avoid : []).map((a) => findScene(scenes, a)?.key || a));
  if (!Array.isArray(plan.scenes)) { errors.push('scenes 要寫成陣列'); return { items: [], errors, warnings, globals: {} }; }

  const ids = new Set();
  const fxCount = {};
  const items = plan.scenes.map((seg, idx) => {
    const it = { idx, id: seg?.id, seg, errors: [], warnings: [] };
    const where = `[${seg?.id ?? `scenes[${idx}]`}${seg?.scene ? ` ${seg.scene}` : seg?.fx ? ` fx ${seg.fx}` : seg?.type === 'media' ? ' media' : ''}]`;
    it.where = where;
    const err = (m) => it.errors.push(`${where} ${m}`);
    const warn = (m) => it.warnings.push(`${where} ${m}`);
    if (!seg || typeof seg !== 'object') { err('每一段要是一個物件'); return it; }
    if (typeof seg.id !== 'string' || !/^[a-z][a-z0-9_]*$/i.test(seg.id)) err(`id 要是英文開頭的英數字（例如 "s01"、"x01"），現在是 ${JSON.stringify(seg.id)}`);
    else if (ids.has(seg.id)) err(`id「${seg.id}」重複了 → 每段 id 要唯一`);
    ids.add(seg.id);
    const type = seg.type ?? 'scene';
    it.type = type;
    if (!KEYS[type]) { err(`type 只能是 "scene"（預設）、"fx"、"custom" 或 "media"，現在是「${type}」`); return it; }
    for (const k of Object.keys(seg)) if (!KEYS[type].includes(k)) err(`沒有「${k}」這個欄位（type=${type} 可用：${KEYS[type].join('、')}）`);

    // --- 種類 ---
    if (type === 'scene') {
      const scene = findScene(scenes, seg.scene);
      if (!scene) { err(`scene：找不到情境「${seg.scene}」（相近：${suggestScenes(scenes, String(seg.scene ?? '')).join('、')}；完整清單跑 build.mjs --list）`); return it; }
      it.scene = scene; it.key = scene.key; it.label = `${scene.num} ${scene.zh}`;
      if (avoidSet.has(scene.key)) err(`「${scene.zh}」在 avoid 名單（使用者說不要用）→ 換別的情境`);
      it.opaque = ['fullscreen', 'chapter'].includes(scene.family);
      it.pip = scene.family === 'fullscreen' && seg.pip !== false;
      if (seg.pip != null && scene.family !== 'fullscreen') warn('pip 只對全畫面家族（04a–d）有效，已忽略');
      it.side = scene.key === 'side-panel';
      it.lower = LOWER.has(scene.family);
      it.z = it.opaque ? 30 : 20;
      it.compId = `${seg.id}-${scene.key}`;
      it.file = `compositions/${it.compId}.html`;
      if (seg.chtag && !(scene.addons || []).includes('chtag')) err(`chtag：「${scene.zh}」不能加章節角標`);
    } else if (type === 'fx') {
      const def = fx.find((f) => f.no === Number(seg.fx));
      if (!def) { err(`fx：沒有第 ${JSON.stringify(seg.fx)} 號字卡動態（1–40，清單跑 build.mjs --list）`); return it; }
      it.fxDef = def; it.key = `fx-${def.id}`; it.label = `fx ${def.id} ${def.zh}`;
      const bg = seg.bg ?? 'none';
      if (!['none', 'dark', 'light', 'accent'].includes(bg)) err(`bg 只能是 "none"（透明疊在講者上）、"dark"、"light"、"accent"（不透明整張幕），現在是「${bg}」`);
      it.bg = bg;
      it.opaque = bg !== 'none';
      it.pip = false; it.side = false; it.lower = false;
      it.z = it.opaque ? 30 : 50;
      const declared = new Set(def.vars.map((v) => v.id));
      const vars = {};
      for (const [k, v] of Object.entries(seg.vars || {})) {
        if (['bg', 'accent'].includes(k)) { err(`vars.${k}：不用寫，${k === 'bg' ? '寫在外層 "bg"' : '主色由 kit/brand.css 決定'}`); continue; }
        if (!declared.has(k)) { err(`vars.${k}：fx ${def.id} 沒有這個變數（可用：${[...declared].filter((x) => !['bg', 'accent'].includes(x)).join('、')}）`); continue; }
        vars[k] = String(v);
      }
      if (!('text' in vars) && declared.has('text') && !Object.keys(vars).length) warn(`vars 沒寫，會顯示預設文字「${def.vars.find((v) => v.id === 'text')?.default}」→ 寫 vars.text`);
      it.vars = { ...vars, bg, accent };
      fxCount[def.id] = (fxCount[def.id] || 0) + 1;
      it.compId = `card-${def.id}-${fxCount[def.id]}`;
      it.file = `compositions/${def.fileName}`;
    } else if (type === 'media') {
      const m = checkMediaSeg(seg, { projectDir, probe, err, warn });
      it.key = 'media'; it.label = `media ${seg.src ? path.basename(String(seg.src)) : '?'}`;
      if (!m) return it;
      it.media = m;
      it.label = `media ${path.basename(m.src)}`;
      it.opaque = true;
      it.pip = seg.pip !== false;
      it.side = false; it.lower = false;
      it.z = 30;
    } else {
      const src = String(seg.src ?? '');
      it.key = 'custom'; it.label = `custom ${path.basename(src)}`;
      if (!/^compositions\/x-[\w-]+\.html$/.test(src)) err(`src 要寫成 "compositions/x-<名稱>.html"（第二層動畫放在 work/hyperframes/compositions/），現在是「${src}」`);
      else {
        const expect = path.basename(src, '.html');
        const r = readCustom(path.join(outDir, src), expect);
        r.errors.forEach((e) => err(`src（${src}）：${e}`));
        it.compId = expect; it.file = src;
      }
      if (!['overlay', 'fullscreen'].includes(seg.layout)) err(`layout 要寫 "overlay"（透明、疊在講者上）或 "fullscreen"（不透明，自動加子母畫面），現在是 ${JSON.stringify(seg.layout)}`);
      it.opaque = seg.layout === 'fullscreen';
      it.pip = it.opaque && seg.pip !== false;
      it.side = false; it.lower = false;
      it.z = it.opaque ? 30 : 20;
    }

    // --- 起迄 ---
    const abs = (v, what) => {
      const t = parseTime(v);
      if (t.error) { err(`${what}：${t.error}`); return null; }
      if (t.kind === 'rel') { err(`${what}：from／to 不能寫「${t.raw}」（+x 只用在 at／beats）→ 要固定長度改寫 "duration": ${t.off}`); return null; }
      if (t.kind === 'abs') return mapAbs(t.sec);   // 絕對秒數是 rough.mp4 的秒數
      const c = cueSeconds(t, cues);
      if (c.error) { err(`${what}：${c.error}`); return null; }
      return c.sec;
    };
    const scene = it.scene;
    if (scene && scene.bindsSrt === false) {
      const fixed = scene.duration?.fixed ?? scene.duration?.default ?? 2.5;
      if (seg.to != null || seg.duration != null) warn(`「${scene.zh}」固定 ${fixed}s，to／duration 已忽略`);
      it.D = fixed;
      if (seg.at != null) {
        const t = parseTime(seg.at);
        if (t.error || t.kind !== 'cue' || t.end || t.off || t.kw) err(`at：章節轉場只寫 "#N"（該章第一句，不加 e、@詞、±秒），現在是 ${JSON.stringify(seg.at)}`);
        else {
          const c = cueByN(cues, t.n);
          if (!c) err(`at：字幕沒有第 ${t.n} 句`);
          else {
            const prev = [...cues].filter((x) => x.start < c.start).sort((a, b) => b.end - a.end)[0];
            const gap = prev ? c.start - prev.end : c.start;
            it.start = gap >= 2.0 ? r3(Math.max(0, c.start - fixed)) : c.start;
            it.chapterNote = gap >= 2.0 ? `放在 #${t.n} 前的空檔（${r3(gap)}s）` : `空檔 ${r3(gap)}s < 2s，從 #${t.n} 起點開始蓋 ${fixed}s，人聲在下面繼續`;
          }
        }
      } else if (seg.from != null) it.start = abs(seg.from, 'from');
      else err('at：章節轉場要寫 "at": "#N"（該章第一句）');
      if (it.start != null) it.end = r3(it.start + it.D);
    } else {
      if (seg.at != null) err('at：只有章節轉場（chapter）用 at；其他情境寫 from／to');
      if (seg.from == null) err(`from：沒有寫起點 → 寫 "from": "#N"（講到這張卡的那一句）。${TIME_HELP}`);
      else it.start = abs(seg.from, 'from');
      if (it.start != null) {
        if (seg.to != null) it.end = abs(seg.to, 'to');
        else if (seg.duration != null) {
          if (!isNum(seg.duration) || seg.duration <= 0) err(`duration 要是正數秒數，現在是 ${JSON.stringify(seg.duration)}`);
          else it.end = r3(it.start + seg.duration);
        } else it.end = r3(it.start + (scene?.duration?.default ?? (type === 'fx' ? 3 : 0)));
        if ((type === 'custom' || type === 'media') && seg.to == null && seg.duration == null) { err(`${type} 要寫 to 或 duration`); it.end = null; }
        if (it.end != null && it.end <= it.start) {
          // 有 cuts 時，整段落在剪掉的範圍裡 → 起迄收到同一點：拿掉並提醒（不是寫錯）
          if (!tm.identity && it.end === it.start && (seg.to != null || seg.duration == null)) { it.cutAway = true; warn('整段都在 edit.cuts 剪掉的範圍裡，已拿掉 → 不要這段就從 plan.json 刪掉；要留就到剪輯台改 cuts'); }
          else err(`to（${it.end}s）在 from（${it.start}s）之前或相同 → to 要寫在 from 之後，例如 "#Ne"（第 N 句結尾）`);
          it.end = null;
        }
      }
    }
    if (it.start != null && it.start >= videoDur) {
      if (!tm.identity && it.start >= videoDur - 1e-6 && seg.from != null) { it.cutAway = true; warn('整段都在 edit.cuts 剪掉的範圍裡，已拿掉 → 不要這段就從 plan.json 刪掉；要留就到剪輯台改 cuts'); }
      else err(`起點 ${r3(it.start)}s 超過影片長度 ${videoDur}s → 改成影片內的句號`);
      it.start = null;
    }
    if (it.start != null && it.end != null) {
      it.planEnd = Math.min(it.end, videoDur);   // plan.json 寫的迄點（換卡、接縫自動延長之前）；--check --json 給剪輯台拖曳用
      it.rough0 = tm.identity ? [it.start, it.end] : [tm.unmapStart(it.start), tm.unmapEnd(it.end)];
      if (!tm.identity) { const cut = r3(it.rough0[1] - it.rough0[0] - (it.end - it.start)); if (cut > 0.01) it.cutTrim = cut; }
    }

    // --- anchor ---
    if (seg.anchor != null) {
      const ft = parseTime(type === 'scene' && scene?.bindsSrt === false ? seg.at : seg.from);
      let n = !ft.error && ft.kind === 'cue' ? ft.n : null;
      // from 是秒數（剪輯台拖過時間會寫成秒數）：anchor 對那個時間點所在或緊接的句子
      if (!ft.error && ft.kind === 'abs') {
        const near = roughCues.filter((c) => ft.sec >= c.start - 1 && ft.sec <= c.end + 0.5);
        const hit = near.find((c) => norm(c.text).includes(norm(seg.anchor)));
        n = hit ? hit.n : near[0]?.n ?? null;
      }
      const c = n != null ? cueByN(cues, n) : null;
      if (!c || !norm(c.text).includes(norm(seg.anchor))) {
        const best = findCue(cues, String(seg.anchor));
        const bc = best != null ? cueByN(cues, best) : null;
        warn(`anchor「${seg.anchor}」不在 ${n != null ? `#${n}「${c?.text ?? '（沒有這句）'}」` : '起點那句'}裡${bc ? ` → 最可能是 #${best}「${bc.text}」，句號可能位移了` : '，整份字幕也找不到相近的句子'}`);
      }
    }
    if (seg.sfx !== undefined && seg.sfx !== null && !(seg.sfx in sfxConf)) err(`sfx：只能是 ${Object.keys(sfxConf).join('／')} 或 null，現在是「${seg.sfx}」`);
    if (seg.sfxVolume !== undefined && !(typeof seg.sfxVolume === 'number' && Number.isFinite(seg.sfxVolume) && seg.sfxVolume >= -60 && seg.sfxVolume <= 12)) err(`sfxVolume 要是 −60～+12 的 dB 數字（這段音效的音量，0＝預設），現在是 ${JSON.stringify(seg.sfxVolume)}`);
    if (seg.sfxExtra !== undefined && typeof seg.sfxExtra !== 'boolean') err(`sfxExtra 只能寫 false（關掉這段的附加音效）或 true，現在是 ${JSON.stringify(seg.sfxExtra)}`);
    return it;
  });

  const timed = items.filter((it) => it.start != null && it.end != null && it.opaque !== undefined).sort((a, b) => a.start - b.start || a.idx - b.idx);

  // --- 換卡：下方字卡相接時前一張延到後一張起點＋0.4 ---
  for (let i = 0; i < timed.length; i++) {
    const a = timed[i];
    if (!a.lower) continue;
    const b = timed.slice(i + 1).find((x) => x.lower);
    if (b && b.start > a.start && b.start < a.end + 0.1) {
      a.end = r3(b.start + HANDOFF);
      a.handoff = b.id;
    }
  }
  // --- 接不透明幕：前段停在完成態（不透明接不透明＝接縫不淡）---
  for (const a of timed) { a.fadeIn = a.opaque; a.fadeOut = a.opaque; a.exitFade = true; }
  for (const a of timed) {
    if (!a.opaque) continue;
    const b = timed.find((x) => x !== a && x.opaque && x.start > a.start && x.start <= a.end + 0.1);
    if (b) {
      a.fadeOut = false; b.fadeIn = false;
      if (b.start > a.end) a.end = b.start;
      // 後面的素材用 slide／zoom 進場：前一段要墊在底下直到進場完成，不然中間會露出講者
      if (b.type === 'media' && ['slide', 'zoom'].includes(b.media.enter)) a.end = Math.max(a.end, r3(b.start + ENTER[b.media.enter]));
      a.seamTo = b.id;
    }
  }
  // 素材的實際進出場：接不透明幕的那一側不淡（停在完成態），slide／zoom 照做
  for (const a of timed) {
    if (a.type !== 'media') continue;
    a.enterFx = a.fadeIn ? a.media.enter : a.media.enter === 'fade' ? 'cut' : a.media.enter;
    a.exitFx = a.fadeOut ? a.media.exit : 'cut';
  }
  for (const a of timed) {
    if (a.opaque) continue;
    const b = timed.find((x) => x.opaque && x.start > a.start && x.start <= a.end + 0.1);
    if (!b) continue;
    a.exitFade = false;
    const covered = r3(b.start + (b.fadeIn ? (b.type === 'media' ? ENTER[b.enterFx] : FADE) : 0));
    if (a.end < covered) a.end = covered;
    if (a.side) a.footageReset = covered;
    a.coveredBy = b.id;
  }
  for (const a of timed) {
    if (a.end > videoDur + 1e-6) {
      if (a.end - videoDur > 0.05) a.warnings.push(`${a.where} 結尾 ${r3(a.end)}s 超過影片長度 ${videoDur}s，已截短`);
      a.end = videoDur;
    }
    a.D = r3(a.end - a.start);
  }

  // --- 子母畫面的片段：只有聲音的區間不顯示（那裡沒有講者），接點（cut）切開讓 data-media-start 跟著跳 ---
  for (const a of timed) {
    if (!a.pip) { a.pipPieces = []; continue; }
    if (tm.identity && !voiceOut.length) { a.pipPieces = [{ s: a.start, e: a.end, ms: a.start }]; continue; }
    a.pipPieces = subtract([a.start, a.end], voiceOut).flatMap(([s, e]) => splitAtJoins(s, e, tm)).filter((p) => p.e - p.s >= PIP_MIN);
    if (!a.pipPieces.length) a.pipNote = '整段在只有聲音的區間，不放子母畫面';
    else if (voiceOut.some(([s, e]) => s < a.end && e > a.start)) a.pipNote = '只有聲音的區間不放子母畫面';
  }

  // --- 章節（給 chtag）---
  const chapters = timed.filter((x) => x.key === 'chapter').map((x) => ({ start: x.start, num: String(x.seg.slots?.num ?? ''), name: String(x.seg.slots?.title ?? ''), sub: String(x.seg.slots?.sub ?? '') }));

  // --- 內容 ---
  for (const it of timed) {
    if (it.type === 'scene') {
      const sc = it.scene;
      if (sc.duration?.min && sc.bindsSrt !== false && it.D < sc.duration.min - 1e-6) it.errors.push(`${it.where} 段長 ${it.D}s，「${sc.zh}」至少 ${sc.duration.min}s → to 往後延到至少 ${fmt(it.start + sc.duration.min)}（${r3(it.start + sc.duration.min)}s）或換情境`);
      const r = resolveScene({ scene: sc, seg: it.seg, cues, icons, consts, t0: it.start, D: it.D, where: it.where });
      it.resolved = r;
      it.errors.push(...r.errors);
      it.warnings.push(...r.warnings);
      it.chapter = [...chapters].reverse().find((c) => c.start <= it.start + 1e-6) || null;
      if (it.seg.chtag && !it.chapter) it.errors.push(`${it.where} chtag：前面沒有章節轉場（chapter），角標不知道要寫哪一章`);
    } else if (it.type === 'media') {
      const pipAt = (t) => it.pipPieces.some((p) => t >= p.s - 1e-6 && t < p.e);
      resolveMedia(it, { cues, tm, pipAt, err: (m) => it.errors.push(`${it.where} ${m}`), warn: (m) => it.warnings.push(`${it.where} ${m}`) });
    }
  }

  // --- 音效 ---
  const frame = 1 / FPS;
  const r2 = (x) => Math.round(x * 100) / 100;
  for (const it of timed) {
    it.sfxExtra = [];
    const seg = it.seg;
    let main = null, extra = [];
    if (it.type === 'scene') {
      const c = sceneSfxCues({ scene: it.scene, resolved: it.resolved, D: it.D, tone: it.resolved?.tone ?? null, override: seg.sfx, extraOn: seg.sfxExtra !== false, sfxConf });
      it.errors.push(...c.errors.map((m) => `${it.where} ${m}`));
      main = c.main; extra = c.extra;
    } else {
      const def = it.fxDef?.sfx;
      const name = seg.sfx === undefined ? (def?.sound ?? null) : seg.sfx;
      if (name && !sfxConf[name] && seg.sfx === undefined) it.errors.push(`${it.where} 音效 fx ${it.seg.fx}：sfx.json 沒有「${name}」`);
      if (name && sfxConf[name]) main = { name, rel: it.type === 'fx' ? (def?.at ?? 0) : 0 };
    }
    if (sfxDir) {
      for (const n of new Set([main?.name, ...extra.map((c) => c.name)].filter(Boolean))) {
        if (!fs.existsSync(path.join(sfxDir, `${n}.wav`))) it.errors.push(`${it.where} 音效檔 shared/sfx/${n}.wav 不存在 → shared/sfx/ 要有完整的 12 個檔（見 shared/template/USAGE-reference.md R5.2）`);
      }
    }
    const mk = (c, vol) => {
      const conf = sfxConf[c.name];
      const event = it.start + c.rel;
      return { name: c.name, at: r3(Math.max(0, event - (conf.peak || 0) + frame)), volume: vol, event: r3(event) };
    };
    if (main) {
      const cue = mk(main, sfxConf[main.name].volume ?? 0.5);
      if (cue.at >= videoDur) it.warnings.push(`${it.where} 音效 ${cue.name} 在 ${cue.at}s，超過影片長度，已拿掉`);
      else it.sfx = cue;
    }
    it.sfxExtra = extra.map((c) => mk(c, r2((sfxConf[c.name].volume ?? 0.5) * c.vol))).filter((c) => c.at < videoDur);
    // 這段的音效音量（sfxVolume，dB）：主音效＋附加音效一起調
    if (typeof seg.sfxVolume === 'number' && Number.isFinite(seg.sfxVolume) && seg.sfxVolume !== 0) {
      const g = dB(seg.sfxVolume);
      for (const c of [it.sfx, ...it.sfxExtra]) if (c) c.volume = r3(Math.min(3.98, c.volume * g));
    }
  }
  let lastSfx = null;
  for (const it of [...timed].filter((x) => x.sfx).sort((a, b) => a.sfx.at - b.sfx.at)) {
    if (lastSfx && it.sfx.at - lastSfx.sfx.at < SFX_GAP) {
      it.warnings.push(`${it.where} 音效 ${it.sfx.name}（${it.sfx.at}s）和 ${lastSfx.id} 的音效只差 ${r3(it.sfx.at - lastSfx.sfx.at)}s（< ${SFX_GAP}s），已拿掉（只保留前一個） → 想留這顆，就在 ${lastSfx.id} 寫 "sfx": null`);
      it.sfxDropped = it.sfx; it.sfx = null;
    } else lastSfx = it;
  }
  // edit：音效總增益＋整支淡入淡出期間跟著變小（音效很短，用起點那一刻的增益）
  if (ne.active && (edit.volume.sfx !== 0 || edit.fadeIn > 0 || edit.fadeOut > 0)) {
    const g = dB(edit.volume.sfx);
    const env = (t) => Math.max(0, Math.min(1, edit.fadeIn > 0 ? t / edit.fadeIn : 1, edit.fadeOut > 0 ? (videoDur - t) / edit.fadeOut : 1));
    const adj = (c) => { if (c) c.volume = r3(Math.min(3.98, c.volume * g * env(c.at))); };
    for (const it of timed) { adj(it.sfx); (it.sfxExtra || []).forEach(adj); }
  }

  // --- 插入素材（media）和其他段的關係：和不透明幕一樣是整張幕（z 30），同一時間只能有一張 ---
  const overlapSeen = new Set();
  for (const md of timed.filter((x) => x.type === 'media')) {
    for (const x of timed) {
      if (x === md) continue;
      if (x.opaque) {
        const [a, b] = x.start < md.start || (x.start === md.start && x.idx < md.idx) ? [x, md] : [md, x];
        if (b.start >= a.end - 1e-6 || overlapSeen.has(`${a.id}|${b.id}`)) continue;
        const allow = b.type === 'media' && ['slide', 'zoom'].includes(b.enterFx) ? ENTER[b.enterFx] : 0;
        const ov = r3(Math.min(a.end, b.end) - b.start);
        if (ov > allow + 0.1) {
          overlapSeen.add(`${a.id}|${b.id}`);
          b.errors.push(`${b.where} 和 ${a.id} 時間重疊 ${ov}s：整張幕（插入素材、全畫面、章節轉場、不透明字卡）同一時間只能有一張 → ${a.id} 的 to 提早到 ${b.id} 開始之前（或剛好接上），或把 ${b.id} 的 from 往後挪`);
        }
      } else if (x.start >= md.start - 1e-6 && x.start < md.end - 0.05) {
        if (x.type === 'fx') x.warnings.push(`${x.where} 疊在插入素材 ${md.id} 上 → 確認沒擋到錄影裡在講的地方（snapshot 看）`);
        else x.errors.push(`${x.where} 在插入素材 ${md.id}（${fmt(md.start)}–${fmt(md.end)}）播放期間出現，會被素材蓋住看不到 → 移到 ${md.id} 之前或之後，或把 ${md.id} 拆成兩段`);
      }
    }
  }

  // --- 只有聲音的區間（rough.mp4 全黑）：沒有講者，一定要被 media 段或不透明的全畫面蓋住 ---
  const opaqueSpans = timed.filter((x) => x.opaque).map((x) => [x.start, x.end]).sort((a, b) => a[0] - b[0]);
  const voiceGaps = [];
  for (const v of voiceOut) {
    for (const [a, b] of subtract(v, opaqueSpans)) {
      const len = r3(b - a);
      const ra = tm.identity ? a : tm.unmapStart(a), rb = tm.identity ? b : tm.unmapEnd(b);
      voiceGaps.push({ start: a, end: b, len });
      const where = `只有聲音的區間 ${fmt(a)}–${fmt(b)}${tm.identity ? '' : `（rough.mp4 ${r3(ra)}–${r3(rb)}s）`}`;
      const fix = `→ 跑 node shared/template/tools/media.mjs scan --project ${projectRel}，看 work/media/ 的 contact sheet，配一段螢幕錄影或圖片（"type": "media"，from／to 蓋住這段），或用不透明的全畫面情境蓋住`;
      if (len > VOICE_ERR) errors.push(`${where} 有 ${len}s 沒有畫面（全黑，講者不在）${fix}`);
      else if (len > VOICE_WARN) warnings.push(`${where} 有 ${len}s 是黑畫面 ${fix}`);
    }
  }

  // --- 跨段提醒 ---
  const shown = timed.filter((x) => x.key !== 'chapter-tag');
  let prevEnd = null, prevItem = null;
  for (const it of shown) {
    if (prevItem && it.start > prevEnd + 0.01 && it.start - prevEnd < 3 && prevItem.key !== 'chapter') it.warnings.push(`${it.where} 和前一段 ${prevItem.id} 之間只露臉 ${r3(it.start - prevEnd)}s（< 3s）→ 合併成一張或拉開`);
    if (prevEnd == null || it.end > prevEnd) { prevEnd = it.end; prevItem = it; }
  }
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      const a = timed[i], b = timed[j];
      if (b.start >= a.end - 1e-6) continue;
      const ov = r3(Math.min(a.end, b.end) - b.start);
      const isFxNone = (x) => x.type === 'fx' && !x.opaque;
      if ((isFxNone(a) && b.lower) || (isFxNone(b) && a.lower)) b.warnings.push(`${b.where} 字卡動態和下方字卡（${a.id}）同時出現 ${ov}s → 兩個強調會互搶，錯開或擇一`);
      else if (!a.opaque && !b.opaque && a.key !== 'chapter-tag' && b.key !== 'chapter-tag' && a.handoff !== b.id && ov > 0.05) b.warnings.push(`${b.where} 和 ${a.id} 時間重疊 ${ov}s → 一段只放一個情境`);
    }
  }
  for (let i = 2; i < timed.length; i++) {
    if (timed[i].key && timed[i].key !== 'media' && timed[i].key === timed[i - 1].key && timed[i].key === timed[i - 2].key) timed[i].warnings.push(`${timed[i].where} 連續三段都是同一個情境 → 換一個情境或合併`);
  }
  const early = timed.filter((x) => x.start < 30 && x.type !== 'media');
  if (early.length > 1) early[1].warnings.push(`${early[1].where} 開場前 30 秒已經有 ${early.length} 張（建議最多一張）`);
  if (speakerBox) {
    for (const it of timed) {
      if (it.side && sideShift > 0 && speakerBox[2] + sideShift > 1920) it.warnings.push(`${it.where} 講者右移 ${sideShift} 後右緣到 ${speakerBox[2] + sideShift}，超出畫面 → plan.json 設 "sideShift": 0（講者本來就在面板外），或改用 04a 全畫面清單`);
      const fam = it.scene ? (FOOTPRINT[it.key] || FOOTPRINT[it.scene.family]) : null;
      if (!fam) continue;
      const area = (speakerBox[2] - speakerBox[0]) * (speakerBox[3] - speakerBox[1]);
      const hit = fam.reduce((s, r) => s + inter(r, speakerBox), 0) / area;
      if (hit > 0.15) it.warnings.push(`${it.where} 「${it.scene.zh}」大約會蓋到講者框 ${Math.round(hit * 100)}% → 用 snapshot 確認，擋到臉或手勢就換情境（例：12 關鍵詞條列、04 全畫面）`);
    }
  }

  // --- edit：底片切成幾支 <video>（cut、dip 的位置），人聲淡入淡出用 HF 原生的 data-fade-in／out ---
  let footage = null, editFx = null;
  if (ne.active) {
    const dips = edit.joins.filter((j) => j.type === 'dip').map((j) => ({ at: tm.map(j.at), dur: j.dur })).filter((d) => d.at > 0 && d.at < videoDur);
    // 局部音量（gains）的邊界也切開，每一支用原生 data-volume
    const gainPts = edit.gains.flatMap((g) => [mapAbs(g.from), mapAbs(g.to)]).filter((p) => p > 0 && p < videoDur);
    const gainAt = (ms) => edit.gains.find((g) => ms >= g.from - 1e-6 && ms < g.to - 1e-6)?.db ?? 0;
    const clips = splitAtJoins(0, videoDur, tm, [...dips.map((d) => d.at), ...gainPts]).map((c) => {
      const db = edit.volume.voice + gainAt(c.ms);
      return { ...c, fadeIn: 0, fadeOut: 0, volume: db !== 0 ? r3(Math.min(3.98, dB(db))) : null, gainDb: db };
    });
    if (clips.length) {
      clips[0].fadeIn = edit.fadeIn;
      clips[clips.length - 1].fadeOut = edit.fadeOut;
      for (let i = 0; i < clips.length - 1; i++) {
        const p = clips[i].e;
        const dip = dips.find((d) => Math.abs(d.at - p) < 1e-3);
        // 只因為音量不同而切開的地方（同一段連續的人聲）不淡，免得聲音掉一下
        const isCut = tm.joinsOut.some((j) => Math.abs(j - p) < 1e-3);
        if (!dip && !isCut) continue;
        const half = dip ? r3(dip.dur / 2) : DECLICK;
        clips[i].fadeOut = Math.max(clips[i].fadeOut, half);
        clips[i + 1].fadeIn = Math.max(clips[i + 1].fadeIn, half);
      }
    }
    footage = { clips };
    // punch：接點後放大 1.08，到下一個接點（cut、cutpoints、joins 的位置都算接點）
    const points = [...new Set([...tm.joinsOut, ...cutpoints.map((c) => c.at).filter((x) => Number.isFinite(x)).map(mapAbs), ...edit.joins.map((j) => tm.map(j.at))])]
      .filter((p) => p > 0 && p < videoDur).sort((a, b) => a - b);
    const punches = [];
    for (const j of edit.joins.filter((x) => x.type === 'punch')) {
      const a = tm.map(j.at);
      const b = points.find((p) => p > a + 1e-3) ?? videoDur;
      const last = punches[punches.length - 1];
      if (last && Math.abs(last.b - a) < 1e-3) last.b = b; else punches.push({ a, b });
    }
    const box = speakerBox;
    const origin = box ? `${Math.round((box[0] + box[2]) / 2)}px ${Math.round(box[1] + (box[3] - box[1]) * 0.3)}px` : '960px 400px';
    editFx = { fadeIn: edit.fadeIn, fadeOut: edit.fadeOut, dips, punches, scale: PUNCH, origin, mediaDb: edit.volume.media };
  }

  const all = items.flatMap((x) => x.errors);
  return {
    items: timed, allItems: items, errors: [...errors, ...all], warnings: [...warnings, ...items.flatMap((x) => x.warnings)],
    globals: { speakerBox, sideShift, pipCrop, pip: pipGeometry(pipCrop === 'auto' || errors.some((e) => e.startsWith('pipCrop')) ? 'auto' : pipCrop, speakerBox) },
    edit, editActive: ne.active, tm, outDur: videoDur, roughDur, cuesOut: cues, voiceOnly, voiceOut, voiceGaps, footage, editFx, cutpoints,
  };
}

// --check --json 的 items：時間換回 rough.mp4 的秒數（剪輯台用 rough.mp4 的時間軸）。
// end＝plan.json 寫的迄點（剪輯台拖邊緣用這個）；shownEnd＝畫面上實際停到哪裡（自動延長或提早收時才有）
export function jsonItems(res) {
  const tm = res.tm;
  const back = (t, end) => (!tm || tm.identity ? r3(t) : end ? tm.unmapEnd(t) : tm.unmapStart(t));
  return res.items.map((it) => {
    const o = {
      id: it.id, type: it.type, label: it.label, start: back(it.start), end: back(it.planEnd ?? it.end, true),
      sfx: [it.sfx, ...(it.sfxExtra || [])].filter(Boolean).map((c) => ({ name: c.name, at: back(c.at), volume: c.volume, db: c.volume > 0 ? +(20 * Math.log10(c.volume)).toFixed(1) : null })),
      warnings: it.warnings.length,
    };
    // 畫面上實際停到哪裡（下方字卡換卡、接不透明幕時會自動延長或提早收）；和 end 一樣時不寫
    if (it.planEnd != null && Math.abs(it.planEnd - it.end) > 1e-3) o.shownEnd = back(it.end, true);
    if (it.type === 'media') { o.src = it.media.src; o.enter = it.media.enter; o.exit = it.media.exit; o.volume = it.media.volume; o.kind = it.media.kind; }
    return o;
  });
}

export function formatReport(res, { videoDur } = {}) {
  const lines = ['id｜情境｜起–迄｜長度｜音效時間｜警告'];
  for (const it of res.items) {
    let s = it.sfx ? `${it.sfx.name} ${fmt(it.sfx.at)}` : it.sfxDropped ? `（${it.sfxDropped.name} 已拿掉）` : '—';
    const cnt = {};
    for (const c of it.sfxExtra || []) cnt[c.name] = (cnt[c.name] || 0) + 1;
    const ex = Object.entries(cnt).map(([n, k]) => `＋${n}×${k}`).join(' ');
    if (ex) s += ` ${ex}`;
    const notes = [];
    if (it.handoff) notes.push(`換卡到 ${it.handoff}`);
    if (it.coveredBy) notes.push(`停在完成態，被 ${it.coveredBy} 蓋過`);
    if (it.seamTo) notes.push(`接縫不淡到 ${it.seamTo}`);
    if (it.chapterNote) notes.push(it.chapterNote);
    const tm = res.tm;
    if (tm && !tm.identity) notes.push(`rough ${fmt(tm.unmapStart(it.start))}–${fmt(tm.unmapEnd(it.end))}${it.cutTrim ? `，cuts 剪掉 ${it.cutTrim}s` : ''}`);
    if (it.media) {
      const m = it.media;
      if (m.kind === 'video') notes.push(`素材 ${m.in}s 起${m.speed !== 1 ? ` ×${m.speed}` : ''}${m.volume != null ? `、原聲 ${m.volume}dB` : ''}`);
      const fx = [m.cams?.length ? `運鏡 ${m.cams.length}` : '', m.kb ? '慢推' : '', m.marks?.length ? `紅框 ${m.marks.length}` : '', m.lenses?.length ? `放大鏡 ${m.lenses.length}` : ''].filter(Boolean);
      if (fx.length) notes.push(fx.join('、'));
      if (it.enterFx && it.enterFx !== 'fade') notes.push(`進場 ${it.enterFx}`);
    }
    if (it.pipNote) notes.push(it.pipNote);
    lines.push(`${it.id}｜${it.label}｜${fmt(it.start)}–${fmt(it.end)}｜${it.D}s｜${s}｜${it.warnings.length ? `⚠ ${it.warnings.length}` : '—'}${notes.length ? `（${notes.join('；')}）` : ''}`);
  }
  if (res.tm && !res.tm.identity) {
    const cut = r3(res.tm.cuts.reduce((s, [a, b]) => s + b - a, 0));
    lines.push(`影片長度 ${fmt(res.outDur)}（${res.outDur}s）＝ rough.mp4 ${res.roughDur}s − cuts ${cut}s（${res.tm.cuts.length} 段）；上表時間是成片的秒數（rough.mp4 的秒數寫在括號）`);
  } else if (videoDur != null) lines.push(`影片長度 ${fmt(videoDur)}（${videoDur}s）`);
  for (const [a, b] of res.voiceOnly || []) {
    const gap = (res.voiceGaps || []).filter((g) => g.start < (res.tm ? res.tm.map(b) : b) && g.end > (res.tm ? res.tm.map(a) : a));
    lines.push(`只有聲音（rough.mp4 ${fmt(a)}–${fmt(b)}，${r3(b - a)}s）：${gap.length ? `⚠ ${gap.map((g) => `${fmt(g.start)}–${fmt(g.end)}`).join('、')} 沒被蓋住` : '已被 media 段或全畫面蓋住，子母畫面自動不顯示'}`);
  }
  return lines.join('\n');
}

