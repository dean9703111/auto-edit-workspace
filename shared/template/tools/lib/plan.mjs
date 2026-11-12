// plan.json → 每段的起迄、長度、圖層性質、子合成內容、音效（規格 §C.3、§B.5、§B.6）
//
//   resolvePlan({ plan, cues, videoDur, lib, outDir, sfxDir, projectDir, voiceOnly, cutpoints, probe, projectRel, canvas })
//     canvas：lib/canvas.mjs 的版式設定（build 照 resolveFormat 決定後傳入；沒傳就看 plan.json 的 format）。結果多 format、canvas；
//     直式：座標檢查用 1080×1920、講者面板（pipGeometry 第三個參數）、03／05 ✖、footprint 與角標照 canvas、臉超出講者面板 ⚠（FR-041）
//     → { items, errors, warnings, globals, edit, editActive, tm, outDur, cuesOut, voiceOnly, voiceOut, voiceGaps, footage, editFx,
//         rhythm, uncovered, spokenLen, chapters, blackout, sfxBudget, outro, theme }
//     （rhythm／uncovered／chapters／blackout／outro／theme：specs/002-pipeline-timing；sfxBudget：005 的 lib/audio.mjs）
//     theme＝"light"（預設）或 "dark"（specs/010-motion-v2/design-system.md §10；build 換 bg-*-dark.jpg、所有合成的 <html> 加 data-theme="dark"）
//     style＝風格包名稱（shared/template/styles/<名稱>/，lib/styles.mjs；不寫＝shared/template/ 目前的主色與背景）；這裡只檢查型別，包在不在由 build 查
//     lib = { scenes, icons, fx, consts, sfx, accent }
//     cues／videoDur／voiceOnly／cutpoints 都是 rough.mp4 的秒數；有 edit.cuts 時，items、cuesOut、outDur、footage 一律是「完成影片」秒數
//     （rough → 完成影片用 tm.map，反過來用 tm.unmapStart／unmapEnd）。沒有 edit 時兩者相同，輸出和舊版逐位元組一樣。
//     items（依起點排序）：{ id, type, key, label, start, end, D, opaque, pip, pipPieces, side, z, fadeIn, fadeOut, exitFade,
//                          footageReset, scene?, fxDef?, vars?, media?, compId, file, resolved?, chapter?, sfx?, sfxExtra[], errors[], warnings[] }
//                          sfx＝主音效 { name, at, volume, event }；sfxExtra＝跟動畫節拍的附加音效（同格式的陣列）
//     footage＝底片要切成幾支 <video>（edit 有效時才有）；editFx＝dip／punch／整支淡入淡出
//   sceneSfxCues({ scene, resolved, D, tone, override, extraOn, sfxConf }) → { main, extra, errors }（rel＝相對段起點的畫面事件秒數）
//   pipGeometry(pipCrop, speakerBox, canvas) → { crop:{x,y,w,h}, style:{left,top,width,height}[, box] }（canvas 直式時是講者面板，多回傳 box＝pip.box）
//   formatReport(result, { videoDur, tail }) → 文字報告（每段一列：id｜情境｜起–迄｜長度｜音效時間｜警告；之後是長度、節奏、沒有畫面的區間、只有聲音、音效次數、轉場與主題）
//   jsonItems(result)／jsonTop(result, { clip }) → --check --json 的 items 與第一層新欄位（specs/contracts/check-json.md schema 2）
//   outroClip(outro, len, outDur)／outroLine(outro, clip) → 結尾配樂的起播點與報告行
//   子母畫面片段 pipPieces[] 帶 enter（fly／fade／none）、exit（layer／fade／none）、exitDur、slideFrom（接上一段時從哪滑過來）；擦入擦出 wipeIn／wipeOut、preroll／postroll；media 疊化 xfade

import fs from 'node:fs';
import path from 'node:path';
import { findScene, suggestScenes, resolveScene } from './scenes.mjs';
import { readCustom } from './assemble.mjs';
import { findCue, norm, cueByN } from './srt.mjs';
import { parseTime, cueSeconds, r3, floorFrame, TIME_HELP, FPS, normText, wordTime, textWidth, onVoice, voicedAt } from './time.mjs';
import { normalizeEdit, timeMap, remapCues, splitAtJoins, subtract, dB, PUNCH } from './edit.mjs';
import { MEDIA_KEYS, ENTER, checkMediaSeg, validateMedia, newStepState, textPx, mediaCorner, mediaOverlaps } from './media.mjs';
import { SFX_RULES, SFX_SWAP, rotateSfx, sfxBudget, thinMainSfx } from './audio.mjs';
import { BED } from './music.mjs';
import { validateMoods, moodCues, zoomSpans, MOOD_KINDS } from './moods.mjs';
import { validateLook } from './look.mjs';
import { FORMATS, canvasOf } from './canvas.mjs';
import { parseBeatSheets, sheetPlanFindings } from './audit-beats.mjs';
import { floorRules, atConsts, faceZone, coverWarn, FACE_WARN } from './audit-rules.mjs';
import { layoutFindings, modeOfLayout } from './layout-rhythm.mjs';
import { sideLayout, SIDES } from './speaker-side.mjs';
import { readScript } from './script-file.mjs';

// plan.json 第一層（順序＝文件與剪輯台存檔的順序；specs/contracts/plan-fields.md §1）
const TOP_KEYS = ['version', 'format', 'frame', 'speakerBox', 'speakerSide', 'sideShift', 'pipCrop', 'avoid', 'rhythm', 'outro', 'bed', 'chapterBadge', 'sections', 'check', 'look', 'theme', 'style', 'edit', 'moods', 'scenes'];
const RHYTHMS = ['continuous', 'spaced'];
const THEMES = ['light', 'dark'];
const OUTRO_KEYS = ['from', 'music', 'volume', 'fadeOut'];
const BED_KEYS = ['music', 'volume'];
const KEYS = {
  scene: ['id', 'type', 'scene', 'from', 'to', 'duration', 'at', 'anchor', 'slots', 'beats', 'tone', 'sfx', 'sfxExtra', 'css', 'chtag', 'pip', 'sfxVolume', 'note', 'story'],
  fx: ['id', 'type', 'fx', 'from', 'to', 'duration', 'anchor', 'bg', 'vars', 'sfx', 'sfxExtra', 'sfxVolume', 'note', 'story'],
  custom: ['id', 'type', 'src', 'template', 'design', 'slots', 'layout', 'from', 'to', 'duration', 'anchor', 'sfx', 'sfxExtra', 'pip', 'sfxVolume', 'clicks', 'note', 'story'],
  media: [...MEDIA_KEYS, 'story'],
};
const DECLICK = 0.02;      // 剪接點兩側的人聲淡入淡出（避免爆音）
const VOICE_ERR = 1;       // 只有聲音的區間沒被蓋住超過 1 秒就 ✖
const VOICE_WARN = 0.1;      // 沒被蓋住超過 0.1 秒就 ⚠（舊值 0.5）
const PIP_MIN = 0.5;        // 子母畫面片段短於 0.5 秒就不放（只會閃一下）
const FADE = 0.5;          // 不透明幕淡入淡出
const FX_REPEAT_MAX = 2;    // 同一張字卡動態一集最多幾次（shared/style.md「節奏」）
const TEMPLATE_MAX = { 'x-wordcut': 1, 'x-wall': 2, 'x-magazine': 1, 'x-breakout': 1 };   // 吸睛的模板動畫一集最多幾次（shared/style.md「節奏」）
const HANDOFF = 0.4;       // 下方字卡換卡：前一張延到後一張起點＋0.4
const SFX_GAP = SFX_RULES.gapSec;          // 主音效之間的間隔（additive 的不算，005 的 contracts/sfx.md §4）
const EXTRA_GAP = SFX_RULES.extraGapSec;   // 同一段內兩個音效起點的最小間隔（附加音效太近就丟掉後者）
const CH_CENTER = 2.8;     // 章節前空檔 ≥ 2.8 秒就置中（2.5＋前後各 0.15）
const CH_MIN = 2.0;        // 空檔 < 2 秒：章節會壓到人聲（⚠）
const CH_BRIDGE = 1.0;     // 章節和前後不透明幕相隔 ≤ 1 秒就墊底（不露出講者）
const UNCOVERED_MIN = 1.0; // 沒有畫面的區間 > 1 秒才報
const SWEEP_MIN = 1.0;     // 章節擦過：章節起點在片頭 1 秒後才掃（013）
const FLASH = [0.05, 1.0]; // 兩段之間空 0.05–1 秒：講者會閃一下
const PIP_FLY_MIN = 1.0;   // 子母畫面片段 ≥ 1 秒才飛入（太短就原地淡入）
const PIP_FADE = 0.4;      // 子母畫面原地淡入淡出
const WIPE = 0.45;         // 旁白段擦入擦出
const ROLL = 0.5;          // 擦入擦出時底下的錄影多播／提早播
const XFADE = 0.47;        // 相鄰兩段 media 之間的疊化
const LOWER = new Set(['lower-third']);
// 各情境大約佔的畫面範圍（§B.6；只用來提醒和講者框的碰撞，最後以 snapshot 為準）
export const FOOTPRINT = {
  'lower-third': [[120, 536, 1020, 860]], summary: [[510, 536, 1410, 860]], quote: [[510, 536, 1410, 860]],
  keywords: [[120, 160, 560, 870]], 'chapter-tag': [[1200, 56, 1824, 168]], 'two-sides': [[96, 160, 600, 870], [1320, 160, 1824, 870]],
};

// 常駐章節角標（F1）：位置同 02 章節角標（右緣 1824、頂 56、高 112）；淡入淡出 0.3 秒，進場 0.5 秒（同 02 的 P.drift）
// 疊加情境量過的範圍（模板的實際座標）：和角標重疊才隱藏。05 兩側右卡頂 211 > 角標底 168、03 側邊欄面板 x ≤ 960 < 角標左 1200 → 都不衝突
export const BADGE = {
  rect: [1200, 56, 1824, 168], fade: 0.3, enter: 0.5, minGap: 0.6, minShow: 0.3, z: 25,
  zones: { 'two-sides': [[96, 211, 600, 819], [1320, 211, 1824, 819]], 'side-panel': [[0, 0, 960, 1080]], keywords: [[120, 160, 560, 870]] },
};
// 直式（FR-052）：footprint 與角標位置照 canvas.mjs（下方字卡帶 lowerThird.rect、置中卡 centerCard.rect、12 改成卡片帶內橫排、角標左上）；
// 03／05 直式不提供（決定 4），不用算；角標在 y 250–362、卡片帶在 880 起 → 沒有要隱藏角標的疊加情境
const footprintsOf = (C) => (C.format === 'portrait'
  ? { 'lower-third': [C.lowerThird.rect], summary: [C.centerCard.rect], quote: [C.centerCard.rect], keywords: [C.lowerThird.rect], 'chapter-tag': [C.badge.rect] }
  : FOOTPRINT);
const badgeOf = (C) => (C.format === 'portrait' ? { ...BADGE, rect: C.badge.rect, zones: {} } : BADGE);
// 小節角標（plan.json sections）：角標改成「章號＋目前小節」的膠囊（高 80、頂 56 → 底 136，全幕卡片頂 y 152 之上；寬度跟著當下的小節名），
// 子母畫面、全幕、錄影段也露出（z 55：情境 ≤ 40、子母畫面框 41 之上，字幕 60 之下）；只在章節轉場、疊加情境撞到時隱藏
export const SECTION = { h: 80, z: 55, name: 12, extra: 124 };   // extra：號板 8＋64＋間距 20＋右內距 32（小節名 40px，寬照 media.mjs textPx）
// 講稿的小節：### 標題＋底下第一句講解（略過的行同 media.mjs scriptLines）；給 sections 的建議用
export function scriptSections(md) {
  const out = [];
  let fence = false, cur = null;
  for (const raw of String(md ?? '').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const l = raw.trim();
    if (/^(```|~~~)/.test(l)) { fence = !fence; continue; }
    if (fence || !l) continue;
    const m = l.match(/^###\s+(.+)$/);
    if (m) { cur = { title: m[1].trim(), first: null }; out.push(cur); continue; }
    if (l.startsWith('#')) { cur = null; continue; }
    if (cur && cur.first == null && !l.startsWith('>') && !l.startsWith('<!--') && !l.includes('`') && !/^[-*_]{3,}$/.test(l) && !/^[（(].*[）)]$/.test(l)) cur.first = l;
  }
  return out.filter((x) => x.first);
}
// 決定 4：直式不提供的情境 → 建議替代（scene.json "portrait": "none"）
const PORTRAIT_ALT = { 'side-panel': '04a 全畫面條列（直式是上下分割）或 13 標題條列', 'two-sides': '13 標題條列，或情境動畫 x-versus' };

const FAMILY_RUN = 5;   // 連續幾段同一個版面家族就 ⚠
const FAMILY_ZH = { 'lower-third': '下方字卡', fullscreen: '全畫面', edge: '貼邊', panel: '側邊欄', chapter: '章節' };
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const LAYOUT_ZH = { overlay: '疊加', side: '半畫面', pip: '子母畫面', full: '全幕' };
const LAYOUT_ZH_PORTRAIT = { ...LAYOUT_ZH, pip: '上下分割' };   // FR-042：直式只有 疊加／上下分割／全幕
const fmt = (t) => (t == null ? '—' : `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`);

// 直式（FR-040）：講者面板 canvas.pip.box（1080×1020，寬高比 pip.aspect）；"auto"＝頭頂落在面板頂端下方 40 px、
// 裁切寬 clamp(講者框寬 × 1.3, 540, 1080)；手寫 [x, y, w, h] 是畫布座標。回傳多一個 box（面板位置）
function pipGeometryPortrait(pipCrop, speakerBox, C) {
  const [bx, by, bw0, bh0] = C.pip.box, AR = C.pip.aspect;
  let crop;
  if (Array.isArray(pipCrop)) {
    const [x, y, w, h] = pipCrop;
    crop = { x, y, w, h };
  } else if (!speakerBox) {
    const w = C.W, h = w / AR;
    crop = { x: 0, y: Math.max(0, (C.H - h) / 2), w, h };
  } else {
    const w = Math.min(C.W, Math.max(540, (speakerBox[2] - speakerBox[0]) * 1.3)), h = w / AR;
    const cx = (speakerBox[0] + speakerBox[2]) / 2;
    crop = { x: Math.min(Math.max(cx - w / 2, 0), C.W - w), y: Math.min(Math.max(speakerBox[1] - 40 * (w / bw0), 0), C.H - h), w, h };
  }
  const s = bw0 / crop.w;
  return { crop, box: C.pip.box, style: { left: Math.round(-crop.x * s) + 0, top: Math.round(-crop.y * s) + 0, width: Math.round(C.W * s), height: Math.round(C.H * s) } };
}
// FR-041：臉（speakerBox 上緣＋框高 30 %）放進講者面板後的 y 範圍；超出 pip.face 就給 pipCrop 建議值
function faceInPanel(geo, speakerBox, C) {
  const s = C.pip.box[2] / geo.crop.w, y = (v) => Math.round(C.pip.box[1] + (v - geo.crop.y) * s);
  const top = speakerBox[1], chin = speakerBox[1] + 0.3 * (speakerBox[3] - speakerBox[1]);
  return [y(top), y(chin)];
}

export function pipGeometry(pipCrop, speakerBox, canvas = null) {
  if (canvas?.format === 'portrait') return pipGeometryPortrait(pipCrop, speakerBox, canvas);
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

const sfxNames = (conf) => Object.keys(conf).filter((k) => conf[k]?.kind !== 'bgm');
const bgmNames = (conf) => Object.keys(conf).filter((k) => conf[k]?.kind === 'bgm');

// ---------- 文字對時（F4）：卡片的主文字出現時間 vs 講到那個詞的時間 ----------
// 每個情境的主文字欄 → 出現時間由誰決定：'@start'＝段起點（改 from）；其他字串＝beat 名稱（改 beats.<名>）；'[]'＝清單每一項的 at（改 slots.<欄>[i].at）；'[0]<beat>'＝整欄一起進，看第一項（改 beats.<beat>）
export const TEXT_BEATS = {
  'side-panel': { title: 'head', items: '[]' },
  'fs-list': { title: '@start', items: '[]' },
  'fs-compare': { title: '@start', left: '[0]leftAt', right: '[0]rightAt' },   // 整欄一起進：只看第一項，改那一欄的 beat
  'fs-flow': { title: '@start', nodes: '[]' },
  'fs-table': { title: '@start', rows: '[]' },
  'two-sides': { cards: '[]' },
  concept: { text: 'in' },
  'key-point': { lead: '@start', key: 'keyAt' },
  steps: { steps: '[]' },
  qa: { q: 'in', a: 'aAt' },
  tips: { title: 'in', desc: 'in' },
  summary: { text: 'in' },
  keywords: { items: '[]' },
  'title-list': { title: '@start', items: '[]' },
  quote: { text: 'in' },
};
export const TEXT_SYNC = { warn: 0.6, error: 1.5, window: 15, minMatch: 3, maxKw: 4 };

// 正規化（去空白標點、小寫）＋每個正規化字元對回原文的位置
// 數量詞兩邊寫法不同（卡片「1 小時」、字幕「一個小時」）：中文數字 零〇一二兩三四五六七八九 當成 0–9，數字後面的「個」不算
const CN_DIGIT = { 零: '0', 〇: '0', 一: '1', 二: '2', 兩: '2', 三: '3', 四: '4', 五: '5', 六: '6', 七: '7', 八: '8', 九: '9' };
function normMap(s) {
  const out = [], idx = [];
  const chars = [...String(s ?? '')];
  let pos = 0;
  for (const ch of chars) {
    for (const n0 of normText(ch)) {
      const n = CN_DIGIT[n0] ?? n0;
      if ((n === '個' || n === '个') && /[0-9]/.test(out[out.length - 1] || '')) continue;
      out.push(n); idx.push(pos);
    }
    pos += ch.length;
  }
  return { n: out, idx, raw: String(s ?? '') };
}
const plainText = (s) => String(s ?? '').replace(/\*\*/g, '').replace(/\/\//g, ' ');

// 比對單位：中文（和其他非英數）一個字一個單位、權重 1；英文／數字一整個 token（原文相連的 [a-z0-9]）一個單位、權重＝字數
function units(s) {
  const m = normMap(s), out = [];
  const isAsc = (ch) => /[a-z0-9]/.test(ch);
  for (let k = 0; k < m.n.length; k++) {
    const last = out[out.length - 1];
    if (isAsc(m.n[k]) && last?.asc && m.idx[k] === m.idx[k - 1] + 1) { last.s += m.n[k]; last.w++; last.i1 = k; continue; }
    out.push({ s: m.n[k], w: 1, asc: isAsc(m.n[k]), i0: k, i1: k });
  }
  return { m, u: out };
}
// 單位的最長共同子串（權重和最大）→ { w, len（單位數）, bt（b 裡的起點）}
function lcsUnits(a, b) {
  let best = { w: 0, len: 0, bt: 0 };
  let prev = new Array(b.length + 1).fill(null);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array(b.length + 1).fill(null);
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1].s !== b[j - 1].s) continue;
      const p = prev[j - 1] || { w: 0, len: 0 };
      cur[j] = { w: p.w + b[j - 1].w, len: p.len + 1 };
      if (cur[j].w > best.w) best = { w: cur[j].w, len: cur[j].len, bt: j - cur[j].len };
    }
    prev = cur;
  }
  return best;
}

// 一個欄位的文字對到哪一句、哪個詞、講到的秒數（完成影片）；找不到回 null（不報）
// 對到的字至少 TEXT_SYNC.minMatch（3）：中文要連續 3 字以上，英文／數字只算整個 token（「AI」2、「Podcast」7、「1 小時」3）；
// 取權重最大、一樣大取離出現時間最近的句。2 字的「字幕」「工具」到處都有，不猜
export function spokenAt(text, cues, { near, from = -Infinity, to = Infinity, minMatch = TEXT_SYNC.minMatch } = {}) {
  const f = units(plainText(text));
  if (f.u.reduce((s, x) => s + x.w, 0) < minMatch) return null;
  let best = null;
  for (const c of cues) {
    if (c.end - c.start < 1e-6 || c.start < from || c.start > to) continue;
    const g = units(c.text);
    const r = lcsUnits(f.u, g.u);
    if (r.w < minMatch) continue;
    const d = Math.abs(c.start - near);
    if (!best || r.w > best.r.w || (r.w === best.r.w && d < best.d)) best = { c, g, r, d };
  }
  if (!best) return null;
  const { c, g: { m, u }, r } = best;
  // 詞最多 4 個字寬（中文 1、英數每字 0.5）；英文／數字 token 不從中間切，至少一個單位
  let len = 0, w = 0;
  while (len < r.len) {
    const x = u[r.bt + len], xw = x.asc ? x.w * 0.5 : 1;
    if (len > 0 && w + xw > TEXT_SYNC.maxKw + 1e-9) break;
    w += xw; len++;
  }
  const a = m.idx[u[r.bt].i0], z = m.idx[u[r.bt + len - 1].i1];
  const kw = m.raw.slice(a, z + [...m.raw.slice(z)][0].length).trim();
  const real = wordTime(cues.words, c, kw);
  let sec = real;
  // 和 cueSeconds 同一套：落在停頓裡對到開口，字數估的只分給有在說話的時間（cues.pauses，lib/time.mjs）
  if (sec == null) {
    const total = textWidth(c.text), frac = total > 0 ? textWidth(c.text.slice(0, a)) / total : 0;
    sec = (cues.pauses && voicedAt(frac, c, cues.pauses)) ?? r3(c.start + frac * (c.end - c.start));
  } else if (cues.pauses) sec = onVoice(sec, c, cues.pauses) ?? sec;
  return { n: c.n, kw, sec, real: real != null };
}

// 每段的主文字欄：出現時間比講到早／晚 > TEXT_SYNC.error 秒 ✖，TEXT_SYNC.warn 以上 ⚠（custom 段由 003 的 audit 檢查）
export function textSyncIssues(it, cues) {
  const out = [];
  const fields = [];
  if (it.type === 'scene' && it.resolved && TEXT_BEATS[it.key]) {
    const ctx = it.resolved.ctx || {}, beats = it.resolved.beats || {}, lists = it.resolved.listTimes || {};
    for (const [f, how] of Object.entries(TEXT_BEATS[it.key])) {
      if (how.startsWith('[0]')) {
        const x = Array.isArray(ctx[f]) ? ctx[f][0] : null, beat = how.slice(3);
        const txt = x?.text_text ?? x?.text ?? Object.values(x || {}).find((v) => typeof v === 'string');
        if (txt && isNum(lists[f]?.[0])) fields.push({ name: `${f}[0]`, text: txt, at: r3(it.start + lists[f][0]), fix: `beats.${beat}` });
      } else if (how === '[]') {
        (Array.isArray(ctx[f]) ? ctx[f] : []).forEach((x, i) => {
          const txt = x?.text_text ?? x?.text ?? Object.values(x || {}).find((v) => typeof v === 'string');
          if (txt && isNum(lists[f]?.[i])) fields.push({ name: `${f}[${i}]`, text: txt, at: r3(it.start + lists[f][i]), fix: `slots.${f}[${i}].at` });
        });
      } else {
        const txt = ctx[`${f}_text`] ?? ctx[f];
        if (typeof txt !== 'string' || !txt) continue;
        if (how === '@start') fields.push({ name: f, text: txt, at: r3(it.start), fix: 'from' });
        else if (isNum(beats[how])) fields.push({ name: f, text: txt, at: r3(it.start + beats[how]), fix: `beats.${how}` });
      }
    }
  } else if (it.type === 'fx' && it.vars?.text) fields.push({ name: 'vars.text', text: it.vars.text, at: r3(it.start), fix: 'from', fx: true });
  for (const fd of fields) {
    const s = spokenAt(fd.text, cues, { near: fd.at, from: it.start - TEXT_SYNC.window, to: it.end + TEXT_SYNC.window });
    if (!s) continue;
    const diff = r3(fd.at - s.sec);
    if (Math.abs(diff) < TEXT_SYNC.warn - 1e-9) continue;
    const head = `${it.id} 的${fd.fx ? ' fx ' : ' '}${fd.name}「${plainText(fd.text).trim()}」在 ${fmt(fd.at)} 出現`;
    const body = diff < 0 ? `「${s.kw}」${fmt(s.sec)}（#${s.n}）才講到` : `「${s.kw}」${fmt(s.sec)}（#${s.n}）就講到了，晚了 ${Math.abs(diff).toFixed(2)}s`;
    const msg = `${head}，${body} → ${fd.fix} 寫 "#${s.n}@${s.kw}"${s.real ? '' : cues.words?.length ? '（逐字稿裡找不到這個詞，講到的秒數用字數比例估）' : '（沒有詞級逐字稿，講到的秒數用字數比例估）'}`;
    out.push({ level: Math.abs(diff) > TEXT_SYNC.error + 1e-9 ? 'error' : 'warn', msg, field: fd.name, fix: fd.fix, shown: fd.at, spoken: s.sec, n: s.n, kw: s.kw, real: s.real, diff });
  }
  return out;
}

// 情境動畫檔是從哪支範例複製的：<title>x-<名稱> <說明></title> 的說明和範例相同（改名四處只換 x-<名稱>）；找不到回 null
export function templateFor(html, customDir) {
  const desc = (h) => (String(h).match(/<title>\s*x-[\w-]+\s+([^<]+?)\s*<\/title>/) || [])[1] || null;
  const d = desc(html);
  if (!d || !customDir) return null;
  let files = [];
  try { files = fs.readdirSync(customDir).filter((f) => /^x-[\w-]+\.html$/.test(f)).sort(); } catch { return null; }
  for (const f of files) {
    const t = fs.readFileSync(path.join(customDir, f), 'utf8');
    if (desc(t) === d) return { file: f, html: t };
  }
  return null;
}

// 情境動畫檔和 shared/template/custom/ 的同名範例一字不差＝剛複製、還沒做
export function untouchedSample(file, customDir) {
  if (!customDir) return false;
  const sample = path.join(customDir, path.basename(file));
  try { return fs.readFileSync(file, 'utf8') === fs.readFileSync(sample, 'utf8'); } catch { return false; }
}

export function resolvePlan({ plan, cues, videoDur, lib, outDir, sfxDir, projectDir = null, voiceOnly = [], cutpoints = [], probe, projectRel = 'projects/<專案>', canvas = null }) {
  const errors = [], warnings = [];
  const { scenes, icons, fx, consts, sfx: sfxConf = {}, accent = '#FFD400' } = lib;
  const roughDur = videoDur;
  // work/storyboard.md 的動畫分鏡表（outDir＝work/hyperframes；第一次用到才讀）
  let sheets = null;
  const beatSheets = () => {
    if (sheets) return sheets;
    const f = outDir ? path.join(outDir, '..', 'storyboard.md') : null;
    try { sheets = f && fs.existsSync(f) ? parseBeatSheets(fs.readFileSync(f, 'utf8')) : new Map(); } catch { sheets = new Map(); }
    return sheets;
  };
  // ③ 勾選後才寫鏡位腳本的內容設計動畫：分鏡表裡沒有，讀 work/designs/<段>.md
  const designSheetOf = (seg) => {
    const f = seg?.design && outDir ? path.join(outDir, '..', 'designs', `${seg.id}.md`) : null;
    try { return f && fs.existsSync(f) ? parseBeatSheets(fs.readFileSync(f, 'utf8')).get(seg.id) ?? null : null; } catch { return null; }
  };

  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return { items: [], errors: ['plan.json 要是一個物件 { "version": 1, "scenes": [...] }'], warnings, globals: {} };
  for (const k of Object.keys(plan)) if (!TOP_KEYS.includes(k)) errors.push(`plan.json 第一層沒有「${k}」這個欄位（可用：${TOP_KEYS.join('、')}）`);
  if (plan.version !== 1) errors.push(`version 要寫 1（現在是 ${JSON.stringify(plan.version)}）`);
  errors.push(...validateMoods(plan.moods, lib.sfx || {}));
  // 版式（009）：build 照 --format > plan.json > 開工決策表 > 主軌 決定後傳 canvas 進來；沒傳就看 plan.json
  if (plan.format !== undefined && !FORMATS.includes(plan.format)) errors.push(`format 只能是 "landscape" 或 "portrait"（現在是 ${JSON.stringify(plan.format)}）→ 直式寫 "portrait"，橫式刪掉這個欄位`);
  const C = canvas || canvasOf(FORMATS.includes(plan.format) ? plan.format : 'landscape');
  const portrait = C.format === 'portrait';
  const FOOT = footprintsOf(C), BAD = badgeOf(C);
  const rhythm = plan.rhythm ?? 'continuous';
  if (!RHYTHMS.includes(rhythm)) errors.push(`rhythm 只能是 "continuous"（預設，照 style.md 連續覆蓋）或 "spaced"（要留露臉空檔），現在是 ${JSON.stringify(plan.rhythm)} → 刪掉 rhythm，或改成 "continuous"／"spaced"`);
  if (plan.chapterBadge !== undefined && typeof plan.chapterBadge !== 'boolean') errors.push(`chapterBadge 只能是 true 或 false（不寫＝true：章節角標自動常駐右上角），現在是 ${JSON.stringify(plan.chapterBadge)} → 不要常駐角標就寫 false，否則刪掉這個欄位`);
  const badgeOn = plan.chapterBadge !== false;
  if (plan.theme !== undefined && !THEMES.includes(plan.theme)) errors.push(`theme 只能是 "light"（預設，米白底、白卡）或 "dark"（石墨黑底、玻璃卡），現在是 ${JSON.stringify(plan.theme)} → 改成 "light"／"dark"，或刪掉這個欄位（＝亮色）`);
  const theme = plan.theme === 'dark' ? 'dark' : 'light';
  if (plan.style !== undefined && (typeof plan.style !== 'string' || !plan.style.trim())) errors.push(`style 要寫風格包的名稱（shared/template/styles/ 底下的資料夾名，例 "預設"），現在是 ${JSON.stringify(plan.style)} → 改成名稱，或刪掉這個欄位（＝用 shared/template/ 目前的主色與背景）`);
  const style = typeof plan.style === 'string' && plan.style.trim() ? plan.style.trim() : null;
  // check：只給示意／預覽用的 plan 關規則（示意卡的文字跟字幕無關）；正式 plan.json 寫了 build 會 ⚠
  if (plan.check !== undefined) {
    const c = plan.check;
    if (!c || typeof c !== 'object' || Array.isArray(c)) errors.push(`check 要是物件（例 "check": { "textSync": false }），現在是 ${JSON.stringify(c)} → 正式 plan.json 不用寫這個欄位，刪掉`);
    else {
      for (const k of Object.keys(c)) if (k !== 'textSync') errors.push(`check 沒有「${k}」這個欄位（只有 textSync）→ 刪掉`);
      if (c.textSync !== undefined && typeof c.textSync !== 'boolean') errors.push(`check.textSync 只能是 true 或 false，現在是 ${JSON.stringify(c.textSync)} → 正式 plan.json 刪掉這個欄位`);
    }
  }
  const textSyncOn = plan.check?.textSync !== false;
  errors.push(...validateLook(plan.look));

  // --- edit（剪輯台）：rough.mp4 秒數 → 完成影片秒數。沒有 cuts 時是恆等對應，下面所有計算和舊版一樣 ---
  const ne = normalizeEdit(plan.edit, { videoDur: roughDur, cutpoints });
  errors.push(...ne.errors); warnings.push(...ne.warnings);
  const edit = ne.edit;
  const tm = timeMap(edit.cuts, roughDur);
  const roughCues = cues;
  if (!tm.identity) {
    cues = remapCues(cues, tm);
    // 詞級逐字稿跟著換成完成影片秒數（落在剪掉範圍裡的詞拿掉）
    if (roughCues.words) cues.words = roughCues.words.filter((w) => !tm.cuts.some(([a, b]) => w.start >= a - 1e-6 && w.end <= b + 1e-6)).map((w) => ({ ...w, start: tm.map(w.start), end: tm.map(w.end) }));
    cues.wordsWhy = roughCues.wordsWhy; cues.approx = roughCues.approx; cues.voiceMoved = roughCues.voiceMoved;
    // 停頓也換成完成影片秒數（剪掉的部分縮掉）
    if (roughCues.pauses) cues.pauses = roughCues.pauses.map(([a, b]) => [tm.map(a), tm.map(b)]).filter(([a, b]) => b - a > 0.05);
    // rough 長度已對齊到格；cuts 是毫秒，r3 的誤差不能讓完成影片少掉最後一格
    videoDur = floorFrame(tm.outDur + 0.001);
  }
  const mapAbs = (x) => (tm.identity ? x : tm.map(x));
  const voiceOut = voiceOnly.map(([a, b]) => [mapAbs(a), mapAbs(b)]).filter(([a, b]) => b - a > 0.05);
  let speakerBox = plan.speakerBox ?? null;
  if (speakerBox != null && !(Array.isArray(speakerBox) && speakerBox.length === 4 && speakerBox.every(isNum) && speakerBox[0] < speakerBox[2] && speakerBox[1] < speakerBox[3])) {
    errors.push(`speakerBox 要寫 [x1, y1, x2, y2]（四個數字、左上到右下，${C.W}×${C.H} 座標），現在是 ${JSON.stringify(speakerBox)}`);
    speakerBox = null;
  }
  if (speakerBox == null && !errors.length) warnings.push('沒寫 speakerBox：看場地照框出講者頭、身體與手勢（外擴 40px），build 才能檢查右移與碰撞');
  // 027 講者位置（lib/speaker-side.mjs）：講者在左／中／右決定字卡靠哪邊、半螢幕的面板從哪邊推入、講者移多少。
  //   sideShift 不寫＝照講者框算（在右就不用移那麼多；在中間和以前一樣 480）；plan.json 可以寫死 speakerSide、sideShift
  if (plan.speakerSide !== undefined && !SIDES.includes(plan.speakerSide)) errors.push(`speakerSide 只能是 "left"、"center"、"right"（不寫＝照講者框的位置算），現在是 ${JSON.stringify(plan.speakerSide)}`);
  const sl = sideLayout(portrait ? null : speakerBox, C, { side: SIDES.includes(plan.speakerSide) ? plan.speakerSide : null, shift: isNum(plan.sideShift) ? plan.sideShift : null });
  const sideShift = plan.sideShift ?? Math.abs(sl.shift);
  if (portrait && plan.sideShift !== undefined) warnings.push('直式不用 sideShift（沒有半畫面）→ 刪掉這個欄位');
  if (!isNum(sideShift) || sideShift < 0 || sideShift > 960) errors.push(`sideShift 要是 0–960 的數字（不寫＝照講者的位置算，講者在中間是 480），現在是 ${JSON.stringify(plan.sideShift)}`);
  if (plan.frame != null) {
    const fr = plan.frame;
    if (!(Array.isArray(fr) && fr.length === 4 && fr.every(isNum) && fr[0] >= 0 && fr[1] >= 0 && fr[2] > 0 && fr[3] > 0 && fr[0] + fr[2] <= C.W && fr[1] + fr[3] <= C.H))
      errors.push(`frame 要寫 [x, y, w, h]（${C.W}×${C.H} 座標、在畫面內），現在是 ${JSON.stringify(fr)} → 跑 qc.mjs framing 看建議值`);
    else if (Math.abs(fr[2] / fr[3] - C.framing.aspect) > 0.01) errors.push(`frame 的寬高比要是 ${portrait ? '9:16' : '16:9'}（現在 ${fr[2]}×${fr[3]}）→ 照 qc.mjs framing 印的值寫`);
    else if (C.W / fr[2] > 1.5) warnings.push(`frame 放大 ${(C.W / fr[2]).toFixed(2)} 倍，畫質會明顯變軟（建議 ≤ 1.3）`);
  }
  const pipCrop = plan.pipCrop ?? 'auto';
  if (pipCrop !== 'auto' && !(Array.isArray(pipCrop) && pipCrop.length === 4 && pipCrop.every(isNum) && pipCrop[2] > 0 && pipCrop[3] > 0 && pipCrop[0] >= 0 && pipCrop[1] >= 0 && pipCrop[0] + pipCrop[2] <= C.W && pipCrop[1] + pipCrop[3] <= C.H)) {
    errors.push(`pipCrop 要寫 "auto" 或 [x, y, w, h]（裁切框在 ${C.W}×${C.H} 內），現在是 ${JSON.stringify(plan.pipCrop)}`);
  }
  const avoid = plan.avoid ?? [];
  if (!Array.isArray(avoid)) errors.push('avoid 要寫成陣列，例如 ["two-sides"]');
  const avoidSet = new Set((Array.isArray(avoid) ? avoid : []).map((a) => findScene(scenes, a)?.key || a));
  if (plan.scenes !== undefined && !Array.isArray(plan.scenes)) { errors.push('scenes 要寫成陣列'); return { items: [], errors, warnings, globals: {} }; }
  // 量完講者框還沒排段落：--check 照樣檢查 frame、speakerBox（build 才要求要有段落）
  if (plan.scenes === undefined) warnings.push('還沒排段落（plan.json 沒有 scenes）→ 跑 build.mjs --scaffold 拿分鏡素材，照它寫 scenes');

  const ids = new Set();
  const customSrc = new Map();
  const fxCount = {};
  const items = (plan.scenes ?? []).map((seg, idx) => {
    const it = { idx, id: seg?.id, seg, errors: [], warnings: [] };
    const where = `[${seg?.id ?? `scenes[${idx}]`}${seg?.scene ? ` ${seg.scene}` : seg?.fx ? ` fx ${seg.fx}` : seg?.type === 'media' ? ' media' : seg?.type === 'custom' ? ' custom' : ''}]`;
    it.where = where;
    const err = (m) => it.errors.push(`${where} ${m}`);
    const warn = (m) => it.warnings.push(`${where} ${m}`);
    if (!seg || typeof seg !== 'object') { err('每一段要是一個物件'); return it; }
    if (typeof seg.id !== 'string' || !/^[a-z][a-z0-9_]*$/i.test(seg.id)) err(`id 要是英文開頭的英數字（例如 "s01"、"x01"），現在是 ${JSON.stringify(seg.id)}`);
    else if (ids.has(seg.id)) err(`id「${seg.id}」重複了 → 每段 id 要唯一`);
    ids.add(seg.id);
    const type = seg.type ?? 'scene';
    it.type = type;
    if (!KEYS[type]) { err(`type 只能是 "scene"（預設）、"fx"、"custom" 或 "media"，現在是「${type}」→ 改成其中一個（第一層情境不寫 type）`); return it; }
    for (const k of Object.keys(seg)) if (!KEYS[type].includes(k)) err(`沒有「${k}」這個欄位（type=${type} 可用：${KEYS[type].join('、')}）`);

    // --- 種類 ---
    if (type === 'scene') {
      const scene = findScene(scenes, seg.scene);
      if (!scene) { err(`scene：找不到情境「${seg.scene}」（相近：${suggestScenes(scenes, String(seg.scene ?? '')).join('、')}；完整清單跑 build.mjs --list）`); return it; }
      it.scene = scene; it.key = scene.key; it.label = `${scene.num} ${scene.zh}`;
      if (avoidSet.has(scene.key)) err(`「${scene.zh}」在 avoid 名單（使用者說不要用）→ 換別的情境`);
      if (portrait && scene.portrait === 'none') err(`直式不提供「${scene.zh}」（1080 寬放不下${scene.key === 'side-panel' ? '側邊欄' : '兩側卡'}）→ 改用 ${PORTRAIT_ALT[scene.key] || '13 標題條列'}`);
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
      // 009 FR-060：滿版流動字（catalog.json portrait: "band"）直式縮 0.5625 倍後只剩中間一條
      if (portrait && def.portrait === 'band') {
        const alt = fx.filter((f) => f.category === def.category && f.portrait !== 'band').map((f) => f.id);
        warn(`fx-${def.id}（${def.zh}）直式只剩中間一條 → 換成 portrait: "ok" 的特效（${alt.length ? `同類可用：${alt.join('、')}` : `同類 ${def.category} 都是滿版，換別類`}）或拿掉`);
      }
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
      else if (seg.__fillErrors) {
        // 模板段的 slots 有錯（lib/custom-fill.mjs）：報這些，不用再讀檔
        seg.__fillErrors.forEach((e) => err(e));
        it.compId = path.basename(src, '.html'); it.file = src; it.refList = []; it.sfxBeats = [];
      } else {
        const expect = path.basename(src, '.html');
        const r = readCustom(path.join(outDir, src), expect);
        r.errors.forEach((e) => err(`src（${src}）：${e}`));
        it.compId = expect; it.file = src;
        it.refList = r.refs || [];
        it.sfxBeats = r.sfx || [];
        // 剛從 shared/template/custom/ 複製、還沒改的範例：句號是範例的，算得到的照算、算不到的不報 ✖（停點 ③ 前先 build 截圖、派工前 build 一次都要能過）
        if (seg.__blank) {
          it.sample = true;
          warn(`內容設計動畫還沒做（${src} 是空白畫布）→ 停點 ③ 確認鏡位腳本後照 auto-edit-motion 做`);
        } else if (untouchedSample(path.join(outDir, src), lib.customDir)) {
          it.sample = true;
          warn(`src（${src}）還是範例原文（還沒做）→ 停點 ③ 確認動畫分鏡後照 auto-edit-motion 改；在那之前畫面是範例、時間不準`);
        }
        const dup = customSrc.get(src);
        if (dup) err(`src「${src}」已經給 ${dup} 用了 → 複製成另一個檔名（例 ${expect}-2.html，template id 與 data-composition-id 一起改），兩段各用一支`);
        else customSrc.set(src, seg.id);
      }
      if (portrait && seg.__noPortrait) err(`直式不提供 ${seg.template}（它照橫式的講者位置排版）→ 改用 ${seg.__noPortrait}`);
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
            // 空檔 ≥ 2.8 s 置中；2.0–2.8 s 結尾貼齊 #N；< 2 s 從 #N 起點蓋（壓人聲 ⚠，回剪乾淨留 3 秒停頓）
            const base = prev ? prev.end : 0;
            const gap = r3(c.start - base), g2 = gap.toFixed(2);
            let placement;
            if (gap >= CH_CENTER - 1e-6) {
              placement = 'centered';
              it.start = r3(base + (gap - fixed) / 2);
              it.chapterNote = `放在 #${t.n} 前的空檔（${g2}s），前後各留 ${((gap - fixed) / 2).toFixed(2)}s`;
            } else if (gap >= CH_MIN - 1e-6) {
              placement = 'flush';
              it.start = r3(Math.max(0, c.start - fixed));
              it.chapterNote = `放在 #${t.n} 前的空檔（${g2}s），結尾貼齊 #${t.n}`;
            } else {
              placement = 'cover';
              it.start = c.start;
              it.chapterNote = `空檔 ${g2}s < 2s，從 #${t.n} 起點開始蓋 ${fixed}s`;
              warn(`#${t.n} 前的空檔只有 ${g2}s（< 2s），章節 ${fixed}s 會壓到 #${t.n} 的人聲 → 回剪乾淨保留 3 秒停頓：cuts.md 的章節空檔表加這一章，再跑 node shared/template/tools/media.mjs ng-snap --project ${projectRel}，照它印的指令重剪`);
            }
            it.chInfo = { cue: t.n, gap, placement };
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
    const sfxObj = seg.sfx !== null && typeof seg.sfx === 'object';
    if (sfxObj && (Array.isArray(seg.sfx) || typeof seg.sfx.name !== 'string' || seg.sfx.at == null || Object.keys(seg.sfx).some((k) => !['name', 'at'].includes(k)))) err(`sfx 寫成物件時要有 name 和 at：{ "name": "success", "at": "#12e-0.1" }（at 寫法同 marks），現在是 ${JSON.stringify(seg.sfx)}`);
    else if (sfxObj && !(seg.sfx.name in sfxConf)) err(`sfx.name：只能是 ${sfxNames(sfxConf).join('／')}，現在是「${seg.sfx.name}」→ 改成清單裡的名稱`);
    else if (!sfxObj && seg.sfx !== undefined && seg.sfx !== null && !(seg.sfx in sfxConf)) err(`sfx：只能是 ${sfxNames(sfxConf).join('／')} 或 null，現在是「${seg.sfx}」→ 改成清單裡的名稱（跑 build.mjs --list 看每顆的用途），或寫 null 不放音效`);
    else if (seg.sfx && sfxConf[sfxObj ? seg.sfx.name : seg.sfx]?.kind === 'bgm') err(`sfx：「${seg.sfx}」是配樂，不能當段落音效 → 結尾配樂寫在 plan.json 第一層的 "outro"（例 "outro": { "from": "#120" }）`);
    if (seg.clicks !== undefined && !Array.isArray(seg.clicks)) err('clicks 要寫成陣列，例如 ["+3.2", "#21@安裝"] → 一顆點擊一個元素，只有一顆也要加 [ ]');
    if (seg.sfxVolume !== undefined && !(typeof seg.sfxVolume === 'number' && Number.isFinite(seg.sfxVolume) && seg.sfxVolume >= -60 && seg.sfxVolume <= 12)) err(`sfxVolume 要是 −60～+12 的 dB 數字（這段音效的音量，0＝預設），現在是 ${JSON.stringify(seg.sfxVolume)}`);
    if (seg.sfxExtra !== undefined && typeof seg.sfxExtra !== 'boolean') err(`sfxExtra 只能寫 false（關掉這段的附加音效）或 true，現在是 ${JSON.stringify(seg.sfxExtra)}`);
    return it;
  });

  const timed = items.filter((it) => it.start != null && it.end != null && it.opaque !== undefined).sort((a, b) => a.start - b.start || a.idx - b.idx);

  for (const it of timed.filter((x) => x.key === 'chapter-tag')) {
    const cover = timed.find((x) => x !== it && x.opaque && x.start <= it.start + 0.05 && x.end >= it.end - 0.05);
    if (cover) it.warnings.push(`${it.where} 02 章節角標整段（${fmt(it.start)}–${fmt(it.end)}）被 ${cover.id} 蓋住，畫面看不到，只當章節起點用 → 要看到角標就把它的 from 移到疊加段，或刪掉這段只留 chapterBadge`);
  }

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
  for (const a of timed) { a.fadeIn = a.opaque; a.fadeOut = a.opaque; a.exitFade = true; a.notes = []; }
  // 章節墊底：章節和前後的不透明幕相隔 ≤ 1 秒 → 前一段墊在章節下面、章節照常淡入；章節墊在後一段下面、後一段照常淡入
  for (const ch of timed.filter((x) => x.key === 'chapter')) {
    const chEnd = ch.end;
    const a = timed.filter((x) => x !== ch && x.opaque && x.key !== 'chapter' && x.start < ch.start && x.end <= ch.start + 0.1 && ch.start - x.end <= CH_BRIDGE + 1e-6).sort((p, q) => q.end - p.end)[0];
    if (a && !a.holdFor) {
      const hold = `墊在 ${ch.id} 章節下面 ${FADE.toFixed(2)}s（不淡出）`;
      if (a.type !== 'media') {
        a.end = r3(ch.start + FADE); a.holdFor = ch.id; a.fadeOut = false; a.exitFade = false; a.pipEnd = a.end; a.pipExit = FADE;
        a.notes.push(hold);
      } else {
        // 錄影：不改 end，底下多播（post-roll）到章節淡入完
        const need = r3(ch.start + FADE - a.end), room = rollRoom(a, 'post');
        a.holdFor = ch.id; a.fadeOut = false; a.pipEnd = r3(ch.start + FADE); a.pipExit = FADE;
        a.postroll = r3(Math.max(0, Math.min(need, room)));
        a.notes.push(room >= need - 1e-3 ? hold : `錄影只剩 ${Math.max(0, room).toFixed(2)}s，章節淡入時硬切`);
      }
    }
    const b = timed.filter((x) => x !== ch && x.opaque && x.start >= chEnd - 0.1 && x.start - chEnd <= CH_BRIDGE + 1e-6).sort((p, q) => p.start - q.start)[0];
    if (b) {
      ch.end = r3(b.start + FADE); ch.holdFor = b.id; ch.fadeOut = false; ch.exitFade = false;
      ch.notes.push(`墊在 ${b.id} 下面 ${FADE.toFixed(2)}s（不淡出）`);
    }
  }
  for (const a of timed) {
    if (!a.opaque) continue;
    const b = timed.find((x) => x !== a && x.opaque && x.start > a.start && x.start <= a.end + 0.1);
    if (!b || a.holdFor === b.id) continue;
    a.fadeOut = false; b.fadeIn = false;
    if (b.start > a.end) a.end = b.start;
    // 後面的素材用 slide／zoom／whip／tape／tilt 進場：前一段要墊在底下直到進場完成，不然中間會露出講者；
    //   小視窗在接縫交棒（不然墊底那 0.3–0.65 秒會同時有兩個小視窗）
    //   前一段是從錄影擦入的幕（z 31）時，素材提到同一層：同 z 照 DOM 先後疊，後面的在上（不然進場那幾格被幕蓋住、看起來像直接出現）
    if (b.type === 'media' && ['slide', 'zoom', 'whip', 'tape', 'tilt'].includes(b.media.enter)) { a.end = Math.max(a.end, r3(b.start + ENTER[b.media.enter])); a.pipEnd = b.start; if (b.z < a.z) b.z = a.z; }
    a.seamTo = b.id;
    // 同一支錄影接著播（後段的起點接上前段的終點）：硬接。疊化會有 0.47 秒鬼影，還會多播前段的畫面
    if (a.type === 'media' && b.type === 'media' && continuesMedia(a, b)) {
      if (b.media.enter === 'fade') b.media.enter = 'cut';
      if (a.media.exit === 'fade') a.media.exit = 'cut';
      a.pipEnd = b.start;
      b.notes.push(`和 ${a.id} 是同一支錄影接著播：硬接`);
    }
    // 相鄰兩段 media（進場是預設的 fade）：後一段疊化 0.47 s，前一段墊在下面；子母畫面在接縫接續
    if (a.type === 'media' && b.type === 'media' && b.media.enter === 'fade') {
      b.xfade = XFADE; a.end = Math.max(a.end, r3(b.start + XFADE)); a.pipEnd = b.start;
      b.notes.push(`和 ${a.id} 疊化 ${XFADE}s`);
    }
    // 一邊是 media 一邊是動畫幕（情境動畫、全畫面卡、字卡動態）、都不是章節 → 擦入／擦出（底下的錄影多播或提早 0.5 s）；
    // 有講者小視窗時小視窗在上層（z 40）照常接續，只擦後面的畫面
    const seam = b.start;
    if (a.key === 'chapter' || b.key === 'chapter' || (a.type === 'media') === (b.type === 'media')) continue;
    if (a.type === 'media') {
      if (!['fade', 'cut'].includes(a.media.exit)) continue;
      const room = rollRoom(a, 'post');
      if (room >= WIPE - 1e-6) {
        b.wipeIn = true; b.z = 31; a.postroll = r3(Math.min(ROLL, room));
        b.notes.push(`從 ${a.id} 擦入 ${WIPE}s（${a.id} 錄影多播 ${a.postroll.toFixed(2)}s）`);
      } else b.notes.push(`不擦入：${a.id} 的錄影只剩 ${Math.max(0, room).toFixed(2)}s → 錄影要多 0.5s 才有擦入（現在硬切）`);
    } else {
      if (!['fade', 'cut'].includes(b.media.enter)) continue;
      const room = rollRoom(b, 'pre');
      if (room >= WIPE - 1e-6) {
        a.wipeOut = true; a.z = 31; a.end = seam; b.preroll = r3(Math.min(ROLL, room));
        a.notes.push(`擦出到 ${b.id} ${WIPE}s（${b.id} 錄影提早 ${b.preroll.toFixed(2)}s 開始）`);
      } else {
        // 錄影前面沒有多的（in 太小）：動畫停在完成態多留 WIPE 秒，蓋在錄影開頭上擦出（錄影照原時間開始，開頭 0.45 s 被擦開）
        a.wipeOut = true; a.wipeLate = true; a.z = 31; a.end = r3(seam + WIPE); a.pipEnd = seam;
        a.notes.push(`擦出到 ${b.id} ${WIPE}s（${b.id} 的 in 只有 ${r3(b.media.in).toFixed(2)}s 不能提早 → 停在完成態蓋住錄影開頭 ${WIPE}s 再擦開）`);
      }
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
    // 透明卡接整張幕：停在完成態、被幕蓋過（章節放寬到相隔 1 秒）
    const b = timed.find((x) => x.opaque && x.start > a.start && x.start <= a.end + (x.key === 'chapter' ? CH_BRIDGE : 0.1));
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

  assignTransitions(timed, videoDur);

  // --- 子母畫面的片段：只有聲音的區間不顯示（那裡沒有講者），接點（cut）切開讓 data-media-start 跟著跳 ---
  for (const a of timed) {
    if (!a.pip) { a.pipPieces = []; continue; }
    const pe = Math.min(a.pipEnd ?? a.end, videoDur);
    if (tm.identity && !voiceOut.length) { a.pipPieces = pe - a.start >= PIP_MIN ? [{ s: a.start, e: pe, ms: a.start }] : []; continue; }
    a.pipPieces = subtract([a.start, pe], voiceOut).flatMap(([s, e]) => splitAtJoins(s, e, tm)).filter((p) => p.e - p.s >= PIP_MIN);
    if (!a.pipPieces.length) a.pipNote = '整段在只有聲音的區間，不放子母畫面';
    else if (voiceOut.some(([s, e]) => s < pe && e > a.start)) a.pipNote = '只有聲音的區間不放子母畫面';
  }
  // 全寬版型：橫式、不透明的全畫面段（04 家族、custom fullscreen）整段沒有子母畫面小視窗 → 主卡 1680（main.mjs 寫 data-wide、kit/scene-motion.js widen）
  for (const a of timed) {
    if (portrait || !a.opaque || a.pipPieces.length || !(a.type === 'custom' || (a.type === 'scene' && a.scene?.family === 'fullscreen'))) continue;
    a.wide = true;
    a.pipNote = `${a.pipNote ? `${a.pipNote}；` : ''}全寬版型（主卡 1680、內容區 1676×580：插圖放大、站距拉開，style.md「全寬」）`;
    if (a.type === 'scene' && a.scene.key === 'fs-list' && !a.seg.slots?.visual) a.warnings.push(`${a.where} 全寬（沒有子母畫面小視窗）的清單右半邊會空 → slots 加 "visual": "<畫廊插圖元件>"（右邊的主視覺，講到每一項重拍一下；例 "laptop"、"phone"）`);
  }

  // 小節角標（sections）：用完成影片秒數（剪輯台剪過之後的字幕）
  const sections = [];
  if (plan.sections !== undefined) {
    if (!Array.isArray(plan.sections)) errors.push(`sections 要寫成陣列，例如 "sections": [{ "at": "#121", "name": "STEP 1｜設定資料夾" }] → 照例子改；不要小節角標就刪掉這個欄位`);
    else plan.sections.forEach((x, i) => {
      const w = `sections[${i}]`;
      if (!x || typeof x !== 'object' || typeof x.name !== 'string' || !x.name.trim()) { errors.push(`${w} 要寫 { "at": "#N", "name": "小節名" }，現在是 ${JSON.stringify(x)}`); return; }
      const t = parseTime(x.at);
      if (t.error || t.kind !== 'cue' || t.end || t.off || t.kw) { errors.push(`${w}.at：只寫 "#N"（這個小節的第一句），現在是 ${JSON.stringify(x.at)}`); return; }
      const c = cueByN(cues, t.n);
      if (!c) { errors.push(`${w}.at：字幕沒有第 ${t.n} 句`); return; }
      const name = x.name.trim(), len = textWidth(name);
      if (len > SECTION.name) warnings.push(`${w}.name「${name}」${len} 字，超過 ${SECTION.name} 字 → 縮短（角標字太多會蓋到畫面；例「STEP 1｜設定資料夾」）`);
      if (sections.length && c.start <= sections[sections.length - 1].at + 1e-6) { errors.push(`${w}.at：#${t.n} 不在前一個小節之後 → sections 照時間先後寫，一個句號只放一個小節`); return; }
      sections.push({ i, n: t.n, at: r3(c.start), name });
    });
  }
  // 小節角標在橫式錄影段也露出（右上）：錄影段的 STEP 膠囊、說明卡、箭頭要避開，紅框被蓋到要 ⚠。框寬照這段期間會出現的小節名（最寬那個）
  const secBadgeFor = (it) => {
    if (!badgeOn || !sections.length || portrait) return null;
    const heads = timed.filter((x) => (x.key === 'chapter' || x.key === 'chapter-tag') && x.start <= it.start + 1e-6).sort((p, q) => p.start - q.start);
    const ch = heads[heads.length - 1];
    if (!ch) return null;
    const chName = String((ch.key === 'chapter' ? ch.seg.slots?.title : ch.seg.slots?.name) ?? '');
    const inCh = sections.filter((x) => x.at >= ch.start - 1e-6);
    const cur = [...inCh].reverse().find((x) => x.at <= it.start + 1e-6);
    const names = [cur ? cur.name : chName, ...inCh.filter((x) => x.at > it.start + 1e-6 && x.at < it.end - 1e-6).map((x) => x.name)];
    const w = Math.max(...names.map((n) => textPx(n))) + SECTION.extra;
    // 錄影段：角標移到錄影旁的空白處或錄影畫面的右上角（media.mjs mediaCorner；main.mjs 照 badges[].spots 做）
    const spot = secSpot(it, w);
    const [x1, y0] = spot ? [spot.right, spot.top] : [BAD.rect[2], BAD.rect[1]];
    return { box: [x1 - w, y0, x1, y0 + SECTION.h], side: 'right', names };
  };
  // 全寬段（沒有講者）的角標放在和錄影段同一個位置：錄影和動畫接來接去，角標才不用滑來滑去。
  // 位置照這支片最長的橫向錄影算；沒有錄影照 16:9（縮到 87%：1671×940、右緣 1796）
  let frameCache = null;
  const frameInfo = () => {
    if (frameCache) return frameCache;
    const tally = new Map();
    for (const x of timed) {
      const i = x.type === 'media' && x.media?.fit !== 'cover' ? x.media?.info : null;
      if (!i?.width || i.width / i.height < 1.2 || x.seg?.side) continue;
      const k = `${i.width}x${i.height}`;
      tally.set(k, { width: i.width, height: i.height, d: (tally.get(k)?.d || 0) + x.end - x.start });
    }
    return (frameCache = [...tally.values()].sort((p, q) => q.d - p.d)[0] || { width: 1920, height: 1080 });
  };
  // 橫式的小節角標位置；跟畫布右上一樣就不用移
  function secSpot(it, w) {
    if (portrait) return null;
    const opt = { w, h: SECTION.h, dflt: [BAD.rect[2], BAD.rect[1]] };
    let c = null;
    if (it.wide) c = mediaCorner(frameInfo(), 'contain', opt);
    else if (it.type === 'media' && it.media?.info?.width && !it.seg?.side) c = mediaCorner(it.media.info, it.media.fit, opt);   // 右側步驟清單：錄影靠左，角標留在畫布右上（清單卡頂 ≥ 160）
    return c && !(c.right === BAD.rect[2] && c.top === BAD.rect[1]) ? c : null;
  }

  // 章節轉場沒有副標：只剩章號和章名（「結語」兩個字），畫面很空
  for (const ch of timed.filter((x) => x.key === 'chapter' && !String(x.seg.slots?.sub ?? '').trim())) {
    ch.warnings.push(`${ch.where} 沒有副標（slots.sub）：只有章號和章名，畫面很空 → 補一句 ≤ 12 字、講這一章要做什麼（講稿 ## 章名冒號後面那句可以直接用）`);
  }
  // --- 章節（給 chtag）---
  const chapters = timed.filter((x) => x.key === 'chapter').map((x) => ({ start: x.start, num: String(x.seg.slots?.num ?? ''), name: String(x.seg.slots?.title ?? ''), sub: String(x.seg.slots?.sub ?? '') }));

  // --- 內容 ---
  const steps = newStepState();   // media 的 STEP 編號跨段接續（依起點順序）
  for (const it of timed) {
    if (it.type === 'scene') {
      const sc = it.scene;
      if (sc.duration?.min && sc.bindsSrt !== false && it.D < sc.duration.min - 1e-6) it.errors.push(`${it.where} 段長 ${it.D}s，「${sc.zh}」至少 ${sc.duration.min}s → to 往後延到至少 ${fmt(it.start + sc.duration.min)}（${r3(it.start + sc.duration.min)}s）或換情境`);
      const r = resolveScene({ scene: sc, seg: it.seg, cues, icons, consts, t0: it.start, D: it.D, where: it.where });
      it.resolved = r;
      it.errors.push(...r.errors);
      it.warnings.push(...r.warnings);
      it.chapter = [...chapters].reverse().find((c) => c.start <= it.start + 1e-6) || null;
      if (it.seg.chtag && badgeOn) it.warnings.push(`${it.where} chtag：不用寫，角標現在自動常駐 → 刪掉 "chtag": true（要舊的附件角標，plan.json 第一層寫 "chapterBadge": false）`);
      else if (it.seg.chtag && !it.chapter) it.errors.push(`${it.where} chtag：前面沒有章節轉場（chapter），角標不知道要寫哪一章 → 在這段前面加 01 章節轉場，或刪掉 "chtag": true`);
    } else if (it.type === 'media') {
      const pipAt = (t) => it.pipPieces.some((p) => t >= p.s - 1e-6 && t < p.e);
      it.mediaReport = validateMedia(it, { cues, tm, pipAt, icons, steps, canvas: C, badge: secBadgeFor(it), err: (m) => it.errors.push(`${it.where} ${m}`), warn: (m) => it.warnings.push(`${it.where} ${m}`) });
    } else if (it.type === 'custom') {
      // 情境動畫綁句：x-*.html 裡的 P.at('#N…') 預先算成完成影片秒數（specs/contracts/cues.md §3）
      it.cueRefs = {};
      for (const ref of it.refList || []) {
        const t = parseTime(ref);
        const head = `${it.where} ${it.file} 的 P.at('${ref}')`;
        if (t.error || t.kind !== 'cue') { it.errors.push(`${head}：只能寫句號（#N、#Ne、#N±秒、#N@詞）→ 秒數直接寫數字 P.in(sel, 3.2)，要綁句就寫 P.at('#18')`); continue; }
        const c = cueSeconds(t, cues);
        if (c.error && it.sample) continue;   // 範例原文：句號是範例的，這集沒有就不算
        if (c.error) {
          const inSeg = cues.filter((x) => x.start >= it.start - 1e-6 && x.start < it.end - 1e-6);
          it.errors.push(`${head}：${c.error}${inSeg.length ? ` → 改成這段範圍內的句號（#${inSeg[0].n}–#${inSeg[inSeg.length - 1].n}）` : ' → 改成這段範圍內的句號'}`);
          continue;
        }
        it.cueRefs[ref] = r3(c.sec);
        if (!it.sample && (c.sec < it.start - 0.05 || c.sec > it.end + 0.05)) it.warnings.push(`${it.where} P.at('${ref}') 在 ${fmt(c.sec)}，不在這段 ${fmt(it.start)}–${fmt(it.end)} 裡 → 改綁這段裡的句子，或把 plan.json 這段的 to 延長`);
      }
      // work/storyboard.md 的「#### 動畫分鏡 <段 id>」排不排得下：拍序照講解、範例檔頭【D 下限】（停點 ③ 前就抓，不用等動畫做完）
      const sheet = beatSheets().get(it.seg?.id) ?? (it.seg?.__sheet ? parseBeatSheets(it.seg.__sheet).get(it.seg.id) : null) ?? designSheetOf(it.seg);
      if (sheet) {
        let tplRules = [], endExtra = 0;
        try {
          const html = fs.readFileSync(path.join(outDir, it.file), 'utf8'), tpl = templateFor(html, lib.customDir);
          if (tpl) tplRules = floorRules(tpl.html);
          // 沒有「總結那一句」：回均衡排在最後一拍之後（kit 最多提早到 1 秒後），段尾要多留這 1 秒，不然最後一幕停不夠
          if (tplRules.some((r) => r.lhs === 'D' && r.rhs === 'ALL') && !atConsts(html).ALL) endExtra = 1;
        } catch { /* 檔還沒複製：只比拍序 */ }
        for (const f of sheetPlanFindings({ item: it, sheet, cues, tplRules, endExtra })) it.warnings.push(`${it.where} 動畫分鏡：${f.msg} → ${f.fix}`);
      }
    }
  }

  // --- 素材帳本：同一段素材放了兩次 ---
  for (const o of mediaOverlaps(timed)) {
    const name = path.basename(o.src), nf = (v) => String(Math.round(v * 10) / 10);
    o.it.warnings.push(o.from == null
      ? `${o.it.where} 和 ${o.other.id} 用同一張 ${name}（觀眾會看到同一張圖兩次）→ 故意的就留著，不然換一張`
      : `${o.it.where} 和 ${o.other.id} 重疊 ${name} ${nf(o.from)}–${nf(o.to)}s（同一段畫面放了兩次）→ 故意重播就留著，不然換一段素材或改 in`);
  }

  // --- 音效 ---
  const frame = 1 / FPS;
  const r2 = (x) => Math.round(x * 100) / 100;
  for (const it of timed) {
    it.sfxExtra = [];
    const seg = it.seg;
    let main = null, extra = [];
    // "+秒"（段內秒數）或 "#N…"（綁字幕）→ 完成影片秒數；不在這段裡 ✖
    const evOf = (v, what) => {
      const t = parseTime(v);
      let ev = null;
      if (t.error) it.errors.push(`${it.where} ${what}：${t.error}`);
      else if (t.kind === 'abs') it.errors.push(`${it.where} ${what}：不能寫絕對秒數「${t.raw ?? v}」→ 改成 "+3.2"（本段起點後幾秒）或 "#N"（綁字幕句）`);
      else if (t.kind === 'rel') ev = it.start + t.off;
      else { const c = cueSeconds(t, cues); if (c.error) it.errors.push(`${it.where} ${what}：${c.error}`); else ev = c.sec; }
      if (ev == null) return null;
      if (ev < it.start - 1e-6 || ev > it.end + 1e-6) { it.errors.push(`${it.where} ${what}（${fmt(ev)}）不在這段 ${fmt(it.start)}–${fmt(it.end)} 裡 → 改成這段範圍內的句號或 +秒數`); return null; }
      return ev;
    };
    const obj = seg.sfx !== null && typeof seg.sfx === 'object';
    if (it.type === 'scene') {
      // 字卡：主音效照情境的拍點；寫成 { name, at } 就放在那一刻（踩坑句、結果句），附加音效照舊
      const c = sceneSfxCues({ scene: it.scene, resolved: it.resolved, D: it.D, tone: it.resolved?.tone ?? null, override: obj ? undefined : seg.sfx, extraOn: seg.sfxExtra !== false, sfxConf });
      it.errors.push(...c.errors.map((m) => `${it.where} ${m}`));
      main = c.main; extra = c.extra;
      if (obj && sfxConf[seg.sfx.name]) { const ev = evOf(seg.sfx.at, 'sfx.at'); main = ev != null ? { name: seg.sfx.name, rel: r3(ev - it.start) } : null; }
    } else {
      const def = it.fxDef?.sfx;
      const name = obj ? seg.sfx.name : seg.sfx === undefined ? (def?.sound ?? null) : seg.sfx;
      if (name && !sfxConf[name] && seg.sfx === undefined) it.errors.push(`${it.where} 音效 fx ${it.seg.fx}：sfx.json 沒有「${name}」`);
      if (name && sfxConf[name]) {
        // { name, at }：主音效放在那一刻（錄影段的踩坑句、結果句）；沒寫 at 的照舊放段起點
        const ev = obj ? evOf(seg.sfx.at, 'sfx.at') : null;
        if (!obj || ev != null) main = { name, rel: obj ? r3(ev - it.start) : it.type === 'fx' ? (def?.at ?? 0) : 0 };
      }
      // clicks：看得到游標按下的地方，一下一顆 click（附加音效；"+秒" 是段內秒數、"#N…" 綁字幕）
      if (Array.isArray(seg.clicks) && seg.sfxExtra !== false) {
        seg.clicks.forEach((v, n) => {
          const ev = evOf(v, `clicks[${n}]`);
          if (ev != null && sfxConf.click) extra.push({ name: 'click', rel: r3(ev - it.start), vol: 1 });
        });
      }
      // 情境動畫的 P.sfx('名', '#N…', off)（motion.md §5）：附加音效，時間＝ref 的完成影片秒數＋off；sfxExtra: false 整段關掉、sfxVolume 一起調；
      // 不受主音效 3 秒規則（作者排好的拍點），但算進每集上限與每分鐘密度（additive 的 click 除外）
      if (it.type === 'custom' && seg.sfxExtra !== false) {
        for (const b of it.sfxBeats || []) {
          const head = `${it.where} ${it.file} 的 P.sfx('${b.name}', '${b.ref}')`;
          if (!sfxConf[b.name] || sfxConf[b.name].kind === 'bgm') { it.errors.push(`${head}：kit/sfx.json 沒有「${b.name}」這顆音效 → 改成 ${Object.keys(sfxConf).filter((k) => sfxConf[k].kind !== 'bgm').join('、')} 其中一個`); continue; }
          const at = it.cueRefs?.[b.ref];
          if (at == null) continue;   // ref 寫錯：上面的綁句檢查已經 ✖
          const ev = r3(at + b.off);
          if (ev < it.start - 0.05 || ev > it.end + 0.05) { if (!it.sample) it.warnings.push(`${head}${b.off ? ` +${b.off}` : ''} 在 ${fmt(ev)}，不在這段 ${fmt(it.start)}–${fmt(it.end)} 裡，已拿掉 → 改綁這段裡的句子`); continue; }
          extra.push({ name: b.name, rel: r3(ev - it.start), vol: 1, beat: true });
        }
      }
    }
    if (sfxDir) {
      for (const n of new Set([main?.name, ...extra.map((c) => c.name)].filter(Boolean))) {
        if (!fs.existsSync(path.join(sfxDir, `${n}.wav`))) it.errors.push(`${it.where} 音效檔 shared/sfx/${n}.wav 不存在 → shared/sfx/ 要有完整的 ${Object.keys(sfxConf).length} 個檔（kit/sfx.json 列的每一顆；見 shared/template/USAGE-reference.md R5.2）`);
      }
    }
    const mk = (c, vol) => {
      const conf = sfxConf[c.name];
      const event = it.start + c.rel;
      return { name: c.name, at: r3(Math.max(0, event - (conf.peak || 0) + frame)), volume: vol, event: r3(event), ...(c.beat ? { beat: true } : {}) };
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
  // --- 情緒點（moods，specs/023）：音效照講者的情緒，峰值對齊詞的開口 ---
  const moodRes = moodCues(Array.isArray(plan.moods) && !validateMoods(plan.moods, sfxConf).length ? plan.moods : [], { cues, sfxConf, videoDur, frame });
  errors.push(...moodRes.errors);
  const moodItems = moodRes.list.map((x) => ({ id: `mood${x.i + 1}`, where: x.where, type: 'mood', mood: x, sfx: x.sfx, sfxExtra: [], warnings: [], errors: [], seg: {} }));
  const moodNotes = [];
  // 模板的預設音效：那一分鐘有情緒點的音效就讓位（段上明寫的 sfx、章節音效、附加音效不動）
  let sfxYielded = 0;
  const moodMins = new Set(moodItems.filter((m) => m.sfx).map((m) => Math.floor(m.sfx.at / 60)));
  if (moodMins.size) {
    for (const it of timed) {
      if (!it.sfx || it.seg.sfx !== undefined || it.sfx.name === 'chapter' || sfxConf[it.sfx.name]?.additive) continue;
      if (moodMins.has(Math.floor(it.sfx.at / 60))) { it.sfxDropped = it.sfx; it.sfxYield = true; it.sfx = null; sfxYielded++; }
    }
  }
  // 3 秒規則只管主音效；additive（click）疊在別的聲音上，不算。
  // 優先序：段上明寫的 sfx、章節 ＞ 情緒點（金句、反轉 ＞ 痛點、解法 ＞ 落定）＞ 模板預設；同一級留前一個
  const sfxPrio = (x) => (x.type === 'mood' ? 10 + x.mood.rank : x.seg?.sfx != null || x.sfx?.name === 'chapter' ? 100 : 0);
  const kept = [];
  for (const it of [...timed, ...moodItems].filter((x) => x.sfx && !sfxConf[x.sfx.name]?.additive).sort((a, b) => a.sfx.at - b.sfx.at)) {
    const near = kept.filter((k) => it.sfx.at - k.sfx.at < SFX_GAP);
    if (!near.length) { kept.push(it); continue; }
    if (near.every((k) => sfxPrio(k) < sfxPrio(it))) {
      for (const k of near) {
        if (k.type === 'mood') moodNotes.push(`${k.where} 的音效讓給 ${it.where}（相距不到 ${SFX_GAP} 秒，留情緒比較強的）`);
        else if (it.type !== 'mood') k.warnings.push(`${k.where} 音效 ${k.sfx.name}（${k.sfx.at}s）和 ${it.id} 明寫的音效只差 ${r3(it.sfx.at - k.sfx.at)}s（< ${SFX_GAP}s），已拿掉（段上明寫的優先）`);
        else sfxYielded++;
        k.sfxDropped = k.sfx; k.sfx = null; kept.splice(kept.indexOf(k), 1);
      }
      kept.push(it);
      continue;
    }
    const last = near[near.length - 1];
    if (it.type === 'mood') {
      if (last.type === 'mood') moodNotes.push(`${it.where} 的音效讓給 ${last.where}（相距不到 ${SFX_GAP} 秒）`);
      else it.warnings.push(`${it.where} 的音效和 ${last.id} 明寫的音效只差 ${r3(it.sfx.at - last.sfx.at)}s（< ${SFX_GAP}s），已拿掉 → 想留情緒點，就把 ${last.id} 的 sfx 拿掉；不然這個情緒點寫 "sfx": null`);
    } else if (last.type === 'mood') sfxYielded++;
    else it.warnings.push(`${it.where} 音效 ${it.sfx.name}（${it.sfx.at}s）和 ${last.id} 的音效只差 ${r3(it.sfx.at - last.sfx.at)}s（< ${SFX_GAP}s），已拿掉（只保留前一個） → 想留這顆，就在 ${last.id} 寫 "sfx": null`);
    it.sfxDropped = it.sfx; it.sfx = null;
  }
  // 每分鐘最多 2 顆主音效：工具照優先序留（情緒點照強弱），不用人一段一段寫 "sfx": null
  const sfxThinned = thinMainSfx([...timed, ...moodItems], sfxConf);
  for (const m of moodItems) if (m.sfxThinned) moodNotes.push(`${m.where} 的音效被每分鐘 ${SFX_RULES.perMinute} 顆的上限拿掉（那一分鐘有更強的）`);
  // 每集上限（sparkle 6、shine 3、thunder 3）：情緒點超過的，從後面的開始換成替代音效（shine、sparkle → ding；thunder → alert）
  const cnt = {};
  for (const x of [...timed, ...moodItems]) if (x.sfx) cnt[x.sfx.name] = (cnt[x.sfx.name] || 0) + 1;
  for (const m of [...moodItems].filter((x) => x.sfx).sort((a, b) => b.sfx.at - a.sfx.at)) {
    const n = m.sfx.name, max = sfxConf[n]?.maxPerVideo, to = SFX_SWAP[n];
    if (max == null || !(cnt[n] > max) || !to || !sfxConf[to]) continue;
    cnt[n]--; cnt[to] = (cnt[to] || 0) + 1;
    m.sfx = { ...m.sfx, name: to, at: r3(Math.max(0, m.sfx.event - (sfxConf[to].peak || 0) + frame)), volume: sfxConf[to].volume ?? 0.5 };
    moodNotes.push(`${m.where} 的 ${n} 超過每集 ${max} 次，換成 ${to}`);
  }
  // edit：音效總增益＋整支淡入淡出期間跟著變小（音效很短，用起點那一刻的增益）
  if (ne.active && (edit.volume.sfx !== 0 || edit.fadeIn > 0 || edit.fadeOut > 0)) {
    const g = dB(edit.volume.sfx);
    const env = (t) => Math.max(0, Math.min(1, edit.fadeIn > 0 ? t / edit.fadeIn : 1, edit.fadeOut > 0 ? (videoDur - t) / edit.fadeOut : 1));
    const adj = (c) => { if (c) c.volume = r3(Math.min(3.98, c.volume * g * env(c.at))); };
    for (const it of [...timed, ...moodItems]) { adj(it.sfx); (it.sfxExtra || []).forEach(adj); }
  }
  rotateSfx([...timed, ...moodItems].flatMap((it) => [it.sfx, ...(it.sfxExtra || [])]), sfxConf, (f) => !sfxDir || fs.existsSync(path.join(sfxDir, `${f}.wav`)));
  // 音效政策：每集上限、每分鐘密度、和人聲的比例（005 的 sfxBudget；訊息原文 contracts/cli-005.md §3）
  const budgetCues = [...timed, ...moodItems].flatMap((it) => [it.sfx && { id: it.id, name: it.sfx.name, at: it.sfx.at, volume: it.sfx.volume, main: true },
    ...(it.sfxExtra || []).map((c) => ({ id: it.id, name: c.name, at: c.at, volume: c.volume, main: !!c.beat }))].filter(Boolean));
  // 音效稀疏的空檔裡，列出情境動畫與錄影段（這兩種要自己配：動畫寫 P.sfx、錄影寫 sfx；字卡照情境預設）
  const gapNote = (g) => { const ids = timed.filter((x) => (x.type === 'custom' || x.type === 'media') && x.start < g.to && x.end > g.from).map((x) => x.id); return ids.length > 8 ? `${ids.slice(0, 8).join('、')}…等 ${ids.length} 段` : ids.join('、'); };
  const budget = sfxBudget(budgetCues, sfxConf, { voiceDb: edit.volume?.voice ?? 0, outDur: videoDur, fmt, gapNote, thinned: sfxThinned, moods: Array.isArray(plan.moods) });
  if (Array.isArray(plan.moods)) {
    const withSfx = moodItems.filter((m) => m.sfx).length;
    budget.lines.push(`情緒點：${moodItems.length} 個（音效 ${withSfx} 顆${moodItems.length - withSfx ? `、不出聲 ${moodItems.length - withSfx} 個` : ''}；模板預設音效讓位 ${sfxYielded} 顆）${moodNotes.length ? `；${moodNotes.slice(0, 4).join('；')}${moodNotes.length > 4 ? `…等 ${moodNotes.length} 則` : ''}` : ''}`);
  }
  warnings.push(...budget.warnings.map((w) => w.replace(/^[⚠✖]\s*/, '')));

  // --- 插入素材（media）和其他段的關係：和不透明幕一樣是整張幕（z 30），同一時間只能有一張 ---
  const overlapSeen = new Set();
  for (const md of timed.filter((x) => x.type === 'media')) {
    for (const x of timed) {
      if (x === md) continue;
      if (x.opaque) {
        const [a, b] = x.start < md.start || (x.start === md.start && x.idx < md.idx) ? [x, md] : [md, x];
        if (b.start >= a.end - 1e-6 || overlapSeen.has(`${a.id}|${b.id}`)) continue;
        // slide／zoom 進場、疊化、章節墊底：前一段刻意墊在底下，容許那一段重疊
        const allow = a.holdFor === b.id ? FADE : b.xfade && a.seamTo === b.id ? b.xfade : a.wipeLate && a.seamTo === b.id ? WIPE : b.type === 'media' && ['slide', 'zoom', 'whip', 'tape', 'tilt'].includes(b.enterFx) ? ENTER[b.enterFx] : 0;
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
  // 有邊錄邊講的螢幕錄影（media.mjs screen-sync 算好了）：先把那幾段放進 plan.json，不用自己配
  const syncReady = !!projectDir && fs.existsSync(path.join(projectDir, 'work', 'screen-sync.json'));
  for (const v of voiceOut) {
    for (const [a, b] of subtract(v, opaqueSpans)) {
      const len = r3(b - a);
      const ra = tm.identity ? a : tm.unmapStart(a), rb = tm.identity ? b : tm.unmapEnd(b);
      if (len <= VOICE_WARN + 1e-9) continue;
      voiceGaps.push({ start: a, end: b, len, level: len > VOICE_ERR ? 'error' : 'warn' });
      const where = `只有聲音的區間 ${fmt(a)}–${fmt(b)}${tm.identity ? '' : `（rough.mp4 ${r3(ra)}–${r3(rb)}s）`}`;
      const fix = syncReady && !timed.some((x) => /^sync\d+$/.test(x.id))
        ? `→ 邊錄邊講的螢幕錄影還沒放進 plan.json：跑 node shared/template/tools/media.mjs screen-sync --project ${projectRel} --write-plan`
        : `→ 跑 node shared/template/tools/media.mjs scan --project ${projectRel}，看 work/media/ 的 contact sheet，配一段螢幕錄影或圖片（"type": "media"，from／to 蓋住這段），或用不透明的全畫面情境蓋住`;
      // 這裡排的是疊在講者上的字卡：沒有講者，底下是黑的。直接講是哪一段，不用去猜
      const overlays = timed.filter((x) => !x.opaque && x.key !== 'chapter-tag' && x.start < b - 0.05 && x.end > a + 0.05).map((x) => `${x.id}（${x.label || x.key}）`);
      const swap = overlays.length ? `（${overlays.slice(0, 4).join('、')}${overlays.length > 4 ? ` 等 ${overlays.length} 段` : ''}疊在講者上，這裡沒有講者，要換成全畫面的模板或內容設計動畫）` : '';
      if (len > VOICE_ERR) errors.push(`${where} 有 ${len}s 沒有畫面（全黑，講者不在）${swap}${fix}`);
      else {
        // 前後有沒有不透明段（A-06）：前面沒有 → 把後一段的 from 提早到區間起點；後面沒有 → 把前一段的 to 延到區間終點
        const before = timed.filter((x) => x.opaque && x.end <= a + 1e-6).pop(), after = timed.find((x) => x.opaque && x.start >= b - 1e-6);
        const tip = before && after ? '把前一段的 to 延到下一段的 from（0 秒相接）'
          : after ? `把 ${after.id} 的 from 提早到 ${fmt(a)}（${r3(ra)}s）`
          : before ? `把 ${before.id} 的 to 延到 ${fmt(b)}（${r3(rb)}s）` : '用 media 段或不透明的全畫面情境蓋住';
        warnings.push(`${where} 有 ${len}s 是黑畫面 → ${tip}`);
      }
    }
  }

  // --- 跨段提醒 ---
  // rhythm：continuous（預設）＝每段講解都要有畫面 → 報「沒有畫面的區間」與「講者會閃一下」；spaced＝留露臉空檔 → 報舊的兩條
  const spaced = rhythm === 'spaced';
  const shown = timed.filter((x) => x.key !== 'chapter-tag');
  let prevEnd = null, prevItem = null;
  for (const it of shown) {
    const gap = prevItem ? r3(it.start - prevEnd) : null;
    if (spaced && prevItem && it.start > prevEnd + 0.01 && it.start - prevEnd < 3 && prevItem.key !== 'chapter') it.warnings.push(`${it.where} 和前一段 ${prevItem.id} 之間只露臉 ${r3(it.start - prevEnd)}s（< 3s）→ 合併成一張或拉開`);
    if (!spaced && prevItem && prevItem.key !== 'chapter' && gap > FLASH[0] + 1e-9 && gap <= FLASH[1] + 1e-9) {
      it.warnings.push(`${it.where} 和前一段 ${prevItem.id} 之間只空 ${gap.toFixed(2)}s，講者會閃一下 → ${prevItem.id} 改 "to": ${JSON.stringify(it.seg.from ?? it.seg.at ?? r3(it.start))}（0 秒相接），或拉開到 ${FLASH[1].toFixed(1)}s 以上`);
    }
    if (prevEnd == null || it.end > prevEnd) { prevEnd = it.end; prevItem = it; }
  }
  // 沒有畫面的區間：[第一句起點, 最後一句結尾] 扣掉每段實際顯示的範圍與只有聲音的區間（那些另外報），> 1 秒的列出
  const spoken = cues.filter((c) => c.end > c.start + 1e-6);
  let uncovered = [], spokenLen = 0;
  if (spoken.length) {
    const span = [Math.min(...spoken.map((c) => c.start)), Math.max(...spoken.map((c) => c.end))];
    spokenLen = r3(span[1] - span[0]);
    uncovered = subtract(span, [...shown.map((x) => [x.start, x.end]), ...voiceOut])
      .filter(([a, b]) => b - a > UNCOVERED_MIN + 1e-9).map(([a, b]) => ({ start: r3(a), end: r3(b), len: r3(b - a) }));
  }
  if (!spaced && uncovered.length) {
    const tot = uncovered.reduce((s, u) => s + u.len, 0);
    warnings.push(`沒有畫面的區間共 ${uncovered.length} 段、${tot.toFixed(2)}s → 照 style.md「連續覆蓋」補卡片或情境動畫，或把前一段的 to 延到下一段的 from（0 秒相接）；故意留給講者的就在 plan.json 寫 "rhythm": "spaced"`);
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
  // 同一個模板：模板動畫看 template，其他 custom 看 src（不同的情境動畫不算同一個，B-11 c）；相鄰兩段就提醒
  const kindOf = (x) => (x.key === 'custom' ? (x.seg.template ? `tpl:${x.seg.template}` : `custom:${x.seg.src}`) : x.key);
  for (let i = 1; i < timed.length; i++) {
    if (timed[i].key && !['media', 'chapter', 'chapter-tag'].includes(timed[i].key) && kindOf(timed[i]) === kindOf(timed[i - 1])) timed[i].warnings.push(`${timed[i].where} 和前一段（${timed[i - 1].id}）用同一個模板 → 換一個模板或併成一段`);
  }
  // 吸睛的模板動畫一集有上限（TEMPLATE_MAX）：超過的那幾段提醒
  const tplSeen = {};
  for (const x of timed) {
    const tpl = x.key === 'custom' ? x.seg.template : null, max = tpl ? TEMPLATE_MAX[tpl] : 0;
    if (!max) continue;
    tplSeen[tpl] = (tplSeen[tpl] || 0) + 1;
    if (tplSeen[tpl] > max) x.warnings.push(`${x.where} ${tpl} 一集最多 ${max} 次，這是第 ${tplSeen[tpl]} 次 → 換成 15 金句字卡或 07 重點字卡`);
  }
  // 同一張字卡動態一集最多 FX_REPEAT_MAX 次（29 數字計數是資料卡，不算）：第 3 次起提醒換同類的另一張
  const fxSeen = {};
  for (const x of timed) {
    if (x.type !== 'fx' || x.fxDef?.no === 29) continue;
    const n = x.fxDef?.no;
    fxSeen[n] = (fxSeen[n] || 0) + 1;
    if (fxSeen[n] > FX_REPEAT_MAX) x.warnings.push(`${x.where} 字卡動態 ${String(n).padStart(2, '0')} 這一集已經用了 ${fxSeen[n] - 1} 次 → 換一張同類的（清單：node shared/template/tools/build.mjs --list，看「適合的語意」）`);
  }
  // 連續 ≥ 5 段同一個版面家族（例：06／07／11 都是下方字卡）：畫面太單調
  const famRun = timed.filter((x) => !['chapter', 'chapter-tag'].includes(x.key));
  const famOf = (x) => (x.type === 'scene' ? x.scene.family : x.type);
  for (let i = 0, run = 1; i < famRun.length; i++, run++) {
    if (i && famOf(famRun[i]) !== famOf(famRun[i - 1])) run = 1;
    if (run === FAMILY_RUN && famRun[i].type === 'scene') {
      const seq = famRun.slice(i - FAMILY_RUN + 1, i + 1);
      famRun[i].warnings.push(`${famRun[i].where} 連續 ${FAMILY_RUN} 段都是${FAMILY_ZH[famRun[i].scene.family] || famRun[i].scene.family}（${seq.map((x) => x.id).join('、')}）→ 中間換一段情境動畫（style.md「情境動畫優先」）或別的版面`);
    }
  }
  const early = timed.filter((x) => x.start < 30 && x.type !== 'media');
  if (spaced && early.length > 1) early[1].warnings.push(`${early[1].where} 開場前 30 秒已經有 ${early.length} 張（建議最多一張）`);
  if (speakerBox) {
    for (const it of timed) {
      if (it.side && sideShift > 0 && sl.panelSide === 'left' && speakerBox[2] + sideShift > C.W) it.warnings.push(`${it.where} 講者右移 ${sideShift} 後右緣到 ${speakerBox[2] + sideShift}，超出畫面 → plan.json 設 "sideShift": 0（講者本來就在面板外），或改用 04a 全畫面清單`);
      if (it.side && sideShift > 0 && sl.panelSide === 'right' && speakerBox[0] - sideShift < 0) it.warnings.push(`${it.where} 講者左移 ${sideShift} 後左緣到 ${speakerBox[0] - sideShift}，超出畫面 → plan.json 設 "sideShift": 0（講者本來就在面板外），或改用 04a 全畫面清單`);
      let fam = it.scene ? (FOOT[it.key] || FOOT[it.scene.family]) : null;
      if (!fam) continue;
      // 027：講者在左時，下方字卡、關鍵詞靠右、半螢幕的面板在右 → 版位左右鏡像
      const mirrored = !portrait && (it.side ? sl.panelSide === 'right' : sl.cardSide === 'right' && (it.lower || it.key === 'keywords'));
      if (mirrored) fam = fam.map(([x0, y0, x1, y1]) => [C.W - x1, y0, C.W - x0, y1]);
      if (portrait && fam.some((r) => C.unsafe.some((u) => inter(r, u) > 0))) it.warnings.push(`${it.where} 「${it.scene.zh}」會壓到平台介面的範圍（上 240、下 480、右側按鈕列）→ 用 snapshot 確認，被蓋到就換情境`);
      // 模板固定的版位只壓到講者框下半身（身體）不報；蓋到臉的位置、或蓋住講者框四成以上（手勢多半會被擋）才報（門檻和 audit 的「壓到講者」一樣）
      const area = (speakerBox[2] - speakerBox[0]) * (speakerBox[3] - speakerBox[1]);
      const hit = fam.reduce((s, r) => s + inter(r, speakerBox), 0) / area;
      const fz = faceZone(speakerBox), fzArea = (fz[2] - fz[0]) * (fz[3] - fz[1]);
      const face = fzArea > 0 ? fam.reduce((s, r) => s + inter(r, fz), 0) / fzArea : 0;
      if (coverWarn(hit, face)) it.warnings.push(`${it.where} 「${it.scene.zh}」大約會蓋到講者框 ${Math.round(hit * 100)}%${face >= FACE_WARN ? `，臉的位置也蓋到 ${Math.round(face * 100)}%` : '（超過四成，手勢多半會被擋）'} → 看 --storyboard 的截圖確認，擋到臉或手勢就換情境（例：12 關鍵詞條列、04 全畫面）`);
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
    const origin = box ? `${Math.round((box[0] + box[2]) / 2)}px ${Math.round(box[1] + (box[3] - box[1]) * 0.3)}px` : portrait ? `${C.W / 2}px ${Math.round(C.H * 0.37)}px` : '960px 400px';
    editFx = { fadeIn: edit.fadeIn, fadeOut: edit.fadeOut, dips, punches, scale: PUNCH, origin, mediaDb: edit.volume.media };
  }

  // --- 情緒點的講者爆衝推近（moods[].zoom，specs/023）：詞開口 0.2 秒推到 1.25 倍，停到句尾（遇到接點、整張幕提早收）---
  let zooms = null;
  if (moodItems.some((m) => m.mood.zoom)) {
    const covers = (x, t) => (x.opaque || x.side) && x.start <= t + 1e-9 && t < x.end - 1e-9;
    const speakerVisible = (t) => t >= 0 && !timed.some((x) => covers(x, t)) && !voiceOut.some(([s0, e0]) => t >= s0 - 1e-9 && t < e0);
    const blockedUntil = (a, b) => {
      const starts = [...timed.filter((x) => (x.opaque || x.side) && x.start > a + 1e-6 && x.start < b).map((x) => x.start), ...voiceOut.map(([s0]) => s0).filter((s0) => s0 > a + 1e-6 && s0 < b)];
      return starts.length ? Math.min(...starts) : null;
    };
    const cutPts = [...new Set([...tm.joinsOut, ...cutpoints.map((c) => c.at).filter((x) => Number.isFinite(x)).map(mapAbs), ...(edit.joins || []).map((j) => tm.map(j.at))])]
      .filter((p) => p > 0 && p < videoDur).sort((p, q) => p - q);
    const zr = zoomSpans(moodItems.map((m) => m.mood), { cues, cutPoints: cutPts, videoDur, speakerVisible, blockedUntil });
    const box = speakerBox;
    const origin = box ? `${Math.round((box[0] + box[2]) / 2)}px ${Math.round(box[1] + (box[3] - box[1]) * 0.3)}px` : portrait ? `${C.W / 2}px ${Math.round(C.H * 0.37)}px` : '960px 400px';
    const punches = editFx?.punches || [];
    zooms = { origin, list: zr.zooms.map((z) => ({ ...z, base: punches.some((p) => z.a >= p.a - 1e-9 && z.a < p.b) ? PUNCH : 1 })) };
    budget.lines.push(`講者爆衝推近：${zr.zooms.length} 次${zr.zooms.length ? `（${zr.zooms.map((z) => fmt(z.a)).join('、')}）` : ''}${zr.notes.length ? `；${zr.notes.slice(0, 3).join('；')}${zr.notes.length > 3 ? `…等 ${zr.notes.length} 則` : ''}` : ''}`);
  }

  // --- 文字對時（F4）：卡片主文字的出現時間 vs 講到那個詞的時間 ---
  if (textSyncOn) for (const it of timed) for (const x of textSyncIssues(it, cues)) (x.level === 'error' ? it.errors : it.warnings).push(`文字對時：${x.msg}`);

  // --- 章節：位置、字幕避開（章節的 2.5 秒內不放字幕；墊底延長的部分不算）---
  const chapterList = [];
  const blackout = [];
  for (const ch of timed.filter((x) => x.key === 'chapter')) {
    const len = ch.scene.duration?.fixed ?? ch.scene.duration?.default ?? 2.5;
    const bs = ch.start, be = r3(ch.start + len);
    blackout.push([bs, be]);
    const clipped = [], words = [];
    for (const c of cues) {
      if (c.end - c.start < 1e-6 || c.end <= bs + 0.05 || c.start >= be - 0.05) continue;
      clipped.push(c.n);
      if (c.start < bs) words.push(`#${c.n} 提早 ${(Math.min(c.end, be) - bs).toFixed(2)}s 收`);
      else if (c.end > be) words.push(`#${c.n} 晚 ${(be - c.start).toFixed(2)}s 出現`);
      else words.push(`#${c.n} 整句不顯示`);
    }
    if (words.length) ch.notes.push(`字幕避開章節：${words.join('、')}`);
    chapterList.push({ id: ch.id, kind: 'chapter', num: String(ch.seg.slots?.num ?? ''), cue: ch.chInfo?.cue ?? null, title: String(ch.seg.slots?.title ?? ''), start: bs, end: be, gap: ch.chInfo?.gap ?? null, placement: ch.chInfo?.placement ?? null, captionsClipped: clipped, badge: [] });
  }

  // --- 結尾配樂 outro（005 的 contracts/sfx.md §6；長度要量 wav，build 用 outroClip() 算起播點）---
  let outro = null;
  if (plan.outro !== undefined) {
    const o = plan.outro;
    if (!o || typeof o !== 'object' || Array.isArray(o)) errors.push(`outro 要寫成物件，例如 "outro": { "from": "#120" }，現在是 ${JSON.stringify(o)} → 照例子改，不要結尾配樂就刪掉 outro`);
    else {
      for (const k of Object.keys(o)) if (!OUTRO_KEYS.includes(k)) errors.push(`outro 不能有「${k}」→ 只能寫 ${OUTRO_KEYS.join('、')}`);
      const music = o.music === undefined ? null : o.music;   // 預設不配（2026-11-02 作者）：要配樂就寫 kit/sfx.json 裡 kind: "bgm" 的名稱
      let ok = true;
      if (music !== null && sfxConf[music]?.kind !== 'bgm') { ok = false; errors.push(`outro.music：「${music}」不是配樂（可用：${bgmNames(sfxConf).join('、') || '（kit/sfx.json 沒有 kind: "bgm"）'}）→ 改成可用的配樂名稱，或寫 null 不配`); }
      const t = parseTime(o.from);
      let start = null;
      if (t.error || t.kind !== 'cue' || t.end || t.off) { ok = false; errors.push(`outro.from：要寫 "#N" 或 "#N@詞"（結語金句講完後那一句），現在是 ${JSON.stringify(o.from)} → 改成收尾那一句的句號，例 "#120"`); }
      else { const c = cueSeconds(t, cues); if (c.error) { ok = false; errors.push(`outro.from：${c.error}`); } else start = r3(c.sec); }
      if (o.volume !== undefined && !(isNum(o.volume) && o.volume >= -20 && o.volume <= 6)) { ok = false; errors.push(`outro.volume 要是 −20～+6 的 dB 數字（0＝預設），現在是 ${JSON.stringify(o.volume)} → 改成 −20～+6 之間的數字，或刪掉這個欄位用預設`); }
      if (o.fadeOut !== undefined && !(isNum(o.fadeOut) && o.fadeOut >= 0 && o.fadeOut <= 10)) { ok = false; errors.push(`outro.fadeOut 要是 0–10 的秒數（不寫＝用 kit/sfx.json 的 fadeOut），現在是 ${JSON.stringify(o.fadeOut)} → 改成 0–10 之間的秒數，或刪掉這個欄位用預設`); }
      if (music && ok && sfxDir && !fs.existsSync(sfxConf[music].file || path.join(sfxDir, `${music}.wav`))) { ok = false; errors.push(`outro：音效檔 shared/sfx/${music}.wav 不存在 → shared/sfx/ 要有完整的 ${Object.keys(sfxConf).length} 個檔（kit/sfx.json 列的每一顆；見 shared/template/USAGE-reference.md R5.2）`); }
      if (music === null) outro = { music: null };
      else if (ok && start != null) {
        const conf = sfxConf[music];
        outro = { music, file: conf.file ?? null, credit: conf.credit ?? null, from: String(o.from), start, end: videoDur, span: r3(videoDur - start), fadeIn: conf.fadeIn ?? 0,
          fadeOut: Math.max(o.fadeOut ?? conf.fadeOut ?? 0, edit.fadeOut || 0), gain: (conf.volume ?? 1) * dB(o.volume ?? 0) * dB(edit.volume?.sfx ?? 0),
          relDb: r3((conf.targetDb ?? 0) + (o.volume ?? 0) + (edit.volume?.sfx ?? 0) - (edit.volume?.voice ?? 0)) };
      }
    }
  }

  // --- 底樂 bed（選用）：整支片墊一首配樂，講話時壓低（lib/music.mjs）。plan.json 沒寫就用工作區預設（shared/setting.json 的 music.bed，music.mjs use 寫的）---
  let bed = null;
  const bedIn = plan.bed !== undefined ? plan.bed : lib.musicDefault ? { music: lib.musicDefault } : undefined;
  if (bedIn !== undefined) {
    const b = bedIn, fromPlan = plan.bed !== undefined;
    if (!b || typeof b !== 'object' || Array.isArray(b)) errors.push(`bed 要寫成物件，例如 "bed": { "music": "<曲名>" }，現在是 ${JSON.stringify(b)} → 照例子改，這一集不要底樂寫 "bed": { "music": null }`);
    else {
      for (const k of Object.keys(b)) if (!BED_KEYS.includes(k)) errors.push(`bed 不能有「${k}」→ 只能寫 ${BED_KEYS.join('、')}`);
      const music = b.music === undefined ? null : b.music, conf = music ? sfxConf[music] : null;
      if (music === null) bed = { music: null };
      else if (conf?.kind !== 'bgm') {
        const msg = `「${music}」不是曲庫裡的配樂（可用：${bgmNames(sfxConf).join('、') || '沒有'}）`;
        if (fromPlan) errors.push(`bed.music：${msg} → 改成可用的曲名（node shared/template/tools/music.mjs list），或寫 null 不配`);
        else warnings.push(`底樂：工作區預設的${msg}，這一集沒配 → node shared/template/tools/music.mjs use <曲名> 重新設定，或 music.mjs use none 取消預設`);
      } else if (b.volume !== undefined && !(isNum(b.volume) && b.volume >= -12 && b.volume <= 12)) errors.push(`bed.volume 要是 −12～+12 的 dB 數字（0＝預設），現在是 ${JSON.stringify(b.volume)} → 改成數字或拿掉`);
      else {
        const file = conf.file || (sfxDir ? path.join(sfxDir, `${music}.wav`) : null);
        if (file && !fs.existsSync(file)) errors.push(`bed：配樂檔 ${music}.wav 不存在 → node shared/template/tools/music.mjs list 看曲庫，換一首或重新生成`);
        else {
          // 檔案本身的響度（LUFS）＝ −14 ＋ targetDb − 音量倍數換成的 dB（片尾配樂的設定反推回去）；底樂講話時要落在 −14 ＋ BED.db
          const fileLufs = -14 + (conf.targetDb ?? 0) - 20 * Math.log10(conf.volume || 1);
          const relDb = r3(BED.db + (b.volume ?? 0) + (edit.volume?.sfx ?? 0) - (edit.volume?.voice ?? 0));
          bed = { music, file, from: fromPlan ? 'plan.json' : '工作區預設', credit: conf.credit ?? null, relDb, gainDb: r3(-14 + BED.db + (b.volume ?? 0) + (edit.volume?.sfx ?? 0) - fileLufs) };
        }
      }
    }
  }

  // --- 常駐章節角標（F1）：章節起點（01 章節轉場結束；沒有 01 時是獨立 02 段的起點）→ 下一章起點、outro 起點或片尾 ---
  //     子母畫面、全幕（不透明的段）期間淡出 0.3 秒、回到疊加／半畫面再淡入；疊加情境和角標重疊（BADGE.zones）才隱藏
  // 全畫面段：右上角標的框（audit 量有沒有壓到、設計師的 brief 寫給他看）
  for (const x of timed) if (x.opaque && x.key !== 'chapter') x.badgeBox = secBadgeFor(x)?.box ?? null;
  const badges = [];
  if (badgeOn) {
    const starts = [];
    for (const x of timed) {
      if (x.key === 'chapter') starts.push({ id: x.id, kind: 'chapter', cut: x.start, at: x.end, num: String(x.seg.slots?.num ?? ''), name: String(x.seg.slots?.title ?? '') });
      else if (x.key === 'chapter-tag') { x.noHost = true; starts.push({ id: x.id, kind: 'tag', cut: x.start, at: x.start, num: String(x.seg.slots?.num ?? ''), name: String(x.seg.slots?.name ?? ''), seg: x }); }
    }
    starts.sort((a, b) => a.cut - b.cut);
    const chs = [];
    for (const s of starts) {
      const prev = chs[chs.length - 1];
      if (s.kind === 'tag' && prev && prev.num === s.num) continue;   // 02 段和前一章同號：同一章，不另起
      chs.push(s);
      if (s.kind === 'tag') chapterList.push({ id: s.id, kind: 'tag', num: s.num, cue: null, title: s.name, start: s.seg.start, end: s.seg.end, gap: null, placement: null, captionsClipped: [], badge: [] });
    }
    // 有 sections：膠囊（底 136），子母畫面、全幕、橫式錄影段照樣露出（錄影段的 STEP 膠囊、說明卡避開它，media.mjs）；章節轉場、疊加情境撞到才隱藏
    const sec = sections.length > 0, rect = sec ? [BAD.rect[0], BAD.rect[1], BAD.rect[2], BAD.rect[1] + SECTION.h] : BAD.rect;
    const zoneHit = (x) => (BAD.zones[x.key] || []).some((r) => inter(r, rect) > 0);
    const hides = (x) => (sec ? x.key === 'chapter' || (portrait && x.key === 'media') : x.opaque) || zoneHit(x);   // 直式的錄影段：角標和 STEP 膠囊同在左上，膠囊接手
    const hideAll = timed.filter((x) => x.key !== 'chapter-tag' && hides(x)).map((x) => [x.start, x.end]).sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const [a, b] of hideAll) { const l = merged[merged.length - 1]; if (l && a - l[1] <= BADGE.minGap + 1e-9) l[1] = Math.max(l[1], b); else merged.push([a, b]); }
    chs.forEach((c, i) => {
      const nextCut = chs[i + 1]?.cut ?? videoDur;
      const stop = outro?.start != null && outro.start > c.at + 1e-6 ? outro.start : videoDur;
      const s = r3(c.at), e = r3(Math.min(nextCut, stop, videoDur));
      if (e - s < BADGE.minShow) return;
      const hide = merged.map(([a, b]) => [r3(Math.max(a, s)), r3(Math.min(b, e))]).filter(([a, b]) => b - a > 1e-3);
      const show = subtract([s, e], hide).filter(([a, b]) => b - a >= BADGE.minShow - 1e-9).map(([a, b]) => [r3(a), r3(b)]);
      if (!show.length) return;
      // 章節擦過（013）：沒有 01 章節幕、由 02 起頭的章（短片），章節起點露著講者時，主色色帶掃過一次再進角標；片頭 1 秒內的章不掃
      const sweep = c.kind === 'tag' && s >= SWEEP_MIN && Math.abs(show[0][0] - s) < 1e-6;
      // 小節：從這一章的章節轉場起點（cut）到下一章之間開講的；章節轉場蓋到小節第一句時，從角標起點算
      const subs = sec ? sections.filter((x) => x.at >= c.cut - 1e-6 && x.at < e - 1e-6).map((x) => (x.used = true, { at: r3(Math.max(x.at, s)), name: x.name })) : null;
      // 錄影段：外框移到錄影畫面的右上角（dx、dy＝相對畫布右上的位移）
      const spots = sec ? timed.filter((x) => (x.type === 'media' || x.wide) && x.start < e - 1e-6 && x.end > s + 1e-6).map((x) => ({ x, bx: secBadgeFor(x)?.box }))
        .filter(({ bx }) => bx && (bx[2] !== BAD.rect[2] || bx[1] !== BAD.rect[1]))
        .map(({ x, bx }) => ({ id: x.id, a: r3(x.start), z: r3(x.end), dx: bx[2] - BAD.rect[2], dy: bx[1] - BAD.rect[1] }))
        .reduce((list, p) => {   // 同一個位置、中間只隔不到 1 秒：接起來，角標不要滑出去又滑回來
          const l = list[list.length - 1];
          if (l && l.dx === p.dx && l.dy === p.dy && p.a - l.z < 1) l.z = p.z; else list.push({ ...p });
          return list;
        }, []) : [];
      badges.push({ id: c.id, k: badges.length + 1, num: c.num, name: c.name, start: s, end: e, hide, show, ...(sweep ? { sweep: true } : {}), ...(sec ? { subs } : {}), ...(spots.length ? { spots } : {}) });
      const entry = chapterList.find((x) => x.id === c.id);
      if (entry) entry.badge = show;
    });
    chapterList.sort((a, b) => a.start - b.start);
    for (const x of sections) if (!x.used) warnings.push(`sections[${x.i}]（#${x.n}「${x.name}」）不在任何一章裡（第一章之前沒有章節角標），不會顯示 → 刪掉這一個`);
    // 講稿有 ### 小節、plan.json 沒寫 sections：印一行可以直接貼的建議（#N 照第一句講解對字幕；第一章之前的不列）
    if (plan.sections === undefined && chs.length && projectDir) {
      let md = '';
      try { md = readScript(path.join(projectDir, '講稿.md')); } catch { /* 沒有講稿，或編碼不對（prep 已經擋過） */ }
      const first = Math.min(...chs.map((c) => c.cut));
      let from = 0;
      const sug = [];
      for (const x of scriptSections(md)) {
        const key = normText(x.first).slice(0, 6);
        const k = key ? cues.findIndex((c, j) => j >= from && normText(c.text).includes(key)) : -1;
        if (k < 0) continue;
        from = k + 1;
        if (cues[k].start >= first - 1e-6) sug.push({ at: `#${cues[k].n}`, name: x.title });
      }
      if (sug.length) warnings.push(`講稿有 ${sug.length} 個小節（###），plan.json 沒有 sections，觀眾只看得到章名 → 第一層加 "sections": ${JSON.stringify(sug)}（name 超過 ${SECTION.name} 字的自己縮短）`);
    }
  }

  pipMotion(timed, { tm, voiceOut, punches: editFx?.punches || [] });

  // #N@詞 退回字數比例估的（cueSeconds 記在 cues.approx）：一則 ⚠
  if (cues.approx?.size) {
    const list = [...cues.approx];
    const fix = cues.wordsWhy
      ? `對 rough.mp4 重轉詞級逐字稿：npx hyperframes transcribe ${projectRel}/work/rough.mp4 -d ${projectRel}/work --model small --language zh --json`
      : '詞照字幕原文挑 2–4 個字；逐字稿聽成別的字時換相鄰的詞';
    const heard = cues.words?.length ? list.slice(0, 3).map((r) => {
      const c = cues.find((x) => `#${x.n}` === String(r).replace(/@.*$/, '').replace(/e$/, ''));
      if (!c) return null;
      const said = cues.words.filter((w) => w.start < c.end && w.end > c.start).map((w) => w.text ?? w.word ?? '').join('').trim();
      return said ? `#${c.n} 逐字稿聽成「${said}」` : null;
    }).filter(Boolean) : [];
    warnings.push(`#N@詞 有 ${list.length} 個用字數比例估（${cues.wordsWhy || '詞級逐字稿在那句附近找不到這些詞'}），可能差 1 秒：${list.slice(0, 6).join('、')}${list.length > 6 ? '…' : ''}${heard.length ? `（${heard.join('；')}）` : ''} → ${fix}`);
  }

  const pip = pipGeometry(pipCrop === 'auto' || errors.some((e) => e.startsWith('pipCrop')) ? 'auto' : pipCrop, speakerBox, portrait ? C : null);
  // FR-041：直式上下分割時，臉要落在講者面板的 y 940–1280（字幕框在下面）
  if (portrait && speakerBox && timed.some((x) => x.pipPieces?.length)) {
    const [f0, f1] = faceInPanel(pip, speakerBox, C), [lo, hi] = C.pip.face;
    if (f0 < lo || f1 > hi) {
      const fit = pipGeometry('auto', speakerBox, C), [g0, g1] = faceInPanel(fit, speakerBox, C);
      const sug = g0 >= lo && g1 <= hi && Array.isArray(pipCrop) ? `改回 "pipCrop": "auto"（${[fit.crop.x, fit.crop.y, fit.crop.w, fit.crop.h].map(Math.round).join(', ')}）`
        : `plan.json 寫 "pipCrop": [${[fit.crop.x, Math.max(0, fit.crop.y - (g0 - lo) * fit.crop.w / C.pip.box[2]), fit.crop.w, fit.crop.h].map(Math.round).join(', ')}]，再看 qc.mjs storyboard 的上下分割段`;
      warnings.push(`講者面板的臉超出 y ${lo}–${hi}（估計 y ${f0}–${f1}，字幕框在 ${C.caption.box[1]} 起）→ ${g1 - g0 > hi - lo ? '講者在畫面裡太大，面板放不下整張臉：拍遠一點，或 ' : ''}${sug}`);
    }
  }

  // 027 版面節奏（lib/layout-rhythm.mjs）：有講者的橫式，開頭 30 秒字卡、半螢幕 ≥ 15 秒、子母畫面 ≥ 45 秒。
  // 大綱那一步（--outline）是 ✖；這裡是 ⚠：之後在剪輯台、修改單改過的段也量得到，但不擋 build
  if (!portrait && speakerBox) {
    const lay = timed.filter((x) => x.type !== 'media' || !x.media?.sync).map((x) => ({ id: x.id, start: x.start, end: x.end, mode: modeOfLayout(x.side ? 'side' : x.opaque ? 'pip' : 'overlay', x.key) }));
    for (const f of layoutFindings(lay, { voice: voiceOut })) warnings.push(`版面節奏：${f.msg} → ${f.fix}`);
  }

  const all = items.flatMap((x) => x.errors);
  return {
    items: timed, allItems: items, errors: [...errors, ...all], warnings: [...warnings, ...items.flatMap((x) => x.warnings), ...moodItems.flatMap((x) => x.warnings)],
    globals: { speakerBox, sideShift, pipCrop, pip, speakerSide: sl.side, panelSide: sl.panelSide, cardSide: sl.cardSide, sideLine: !portrait && speakerBox ? sl.zh : null },
    edit, editActive: ne.active, tm, outDur: videoDur, roughDur, cuesOut: cues, voiceOnly, voiceOut, voiceGaps, footage, editFx, cutpoints, voiceMoved: [...(cues.voiceMoved || [])],
    moods: moodItems.map((m) => ({ i: m.mood.i, kind: m.mood.kind, event: m.mood.event, zoom: m.mood.zoom, sfx: m.sfx, dropped: m.sfxDropped?.name ?? null, off: m.mood.sfxOff })), zooms,
    rhythm: RHYTHMS.includes(rhythm) ? rhythm : 'continuous', uncovered, spokenLen, chapters: chapterList, blackout, sfxBudget: budget, outro, bed,
    chapterBadge: badgeOn, badges, theme, style, format: C.format, canvas: C,
  };
}

// 後段接著前段的素材時間往下播（差 ≤ 0.25 秒）
function continuesMedia(a, b) {
  const A = a.media, B = b.media;
  if (A.src !== B.src || !A.info?.duration) return false;
  const endOf = (it) => { const m = it.media; if (m.hold != null) return m.hold; if (m.retimeRaw) return m.retimeRaw[m.retimeRaw.length - 1].src; if (m.out != null) return m.out; return m.in + (it.end - it.start) * m.speed; };
  const startOf = (m) => (m.hold != null ? m.hold : m.retimeRaw ? m.retimeRaw[0].src : m.in);
  return Math.abs(endOf(a) - startOf(B)) <= 0.25;
}

// 片子沒切開的地方（rough 的秒數不跳）
function rollRoom(it, side) {
  const m = it.media;
  if (m.kind !== 'video') return ROLL;
  if (m.retimeRaw) return 0;   // 變速段的檔案就是這一段，前後沒有多的
  const sp = m.speed || 1;
  if (side === 'pre') return r3(m.in / sp);
  return r3((m.info.duration - m.in) / sp - (it.end - it.start));
}

// 轉場語彙（specs/010-motion-v2/design-system.md §5）：每段的進場 txIn／退場 txOut，main.mjs 照這兩個值做，--check --json 的 items[].out.tx 報出來
//   txIn ：band（疊加卡進場）｜wipe（色帶帶路擦開＋講者飛進子母畫面）｜swap（換卡不換景：背景不動，新卡在段內進場）
//          ｜chapter（主色色塊從左下斜擦）｜side（側推）｜fade（淡入：不透明字卡動態）｜media（素材自己的 enter）｜wipeIn（旁白段擦入）｜cut｜overlay（其他透明段，模板自己進場）
//   txOut：band（卡片收回、講者推回）｜retract（色帶反向收、子母畫面淡出）｜swap（舊卡擦掉）｜cover（停在完成態被下一張幕蓋過）｜hold（墊在下一段下面）
//          ｜handoff（下方字卡換卡）｜fade｜media｜wipeOut｜side｜cut｜overlay
export const TX_IN = ['band', 'wipe', 'swap', 'chapter', 'side', 'fade', 'media', 'wipeIn', 'cut', 'overlay'];
export const TX_OUT = ['band', 'retract', 'swap', 'cover', 'hold', 'handoff', 'fade', 'media', 'wipeOut', 'side', 'cut', 'overlay'];
// it.prev：給模板與情境動畫選進場（host 與情境子合成 root 的 data-prev、window.__cues.segs[id].prev；contracts/motion.md §3.1）
//   speaker＝前面露講者（色帶擦開，卡從小視窗長出 P.grow）｜fullscreen＝前一段也是全畫面、同背景（換卡不換景）｜pip＝前一段是別的幕（插入素材、不透明字卡動態、章節），小視窗已在
export const PREVS = ['speaker', 'fullscreen', 'pip'];
const fsSurface = (x) => (x.type === 'custom' && x.opaque) || (x.type === 'scene' && x.scene?.family === 'fullscreen');
// 片尾 TAIL 秒內結束的色帶收回：擦出做不完、最後一格會停在擦到一半 → 改淡出（tailFade；main.mjs 在片尾前一格做完）
const TAIL = 1;
function assignTransitions(timed, videoDur = Infinity) {
  const byId = new Map(timed.map((x) => [x.id, x]));
  for (const b of timed) {
    const a = timed.find((x) => x.seamTo === b.id);
    b.txIn = b.type === 'media' ? 'media' : b.wipeIn ? 'wipeIn' : b.side ? 'side' : b.key === 'chapter' ? (b.fadeIn ? 'chapter' : 'cut')
      : b.opaque ? (b.fadeIn ? (fsSurface(b) ? 'wipe' : 'fade') : a && fsSurface(a) && fsSurface(b) ? 'swap' : 'cut')
      : b.lower ? 'band' : 'overlay';
    b.prev = b.txIn === 'swap' ? 'fullscreen' : b.opaque && b.txIn === 'cut' ? 'pip' : 'speaker';
  }
  for (const a of timed) {
    const next = a.seamTo ? byId.get(a.seamTo) : null;
    a.txOut = a.type === 'media' ? 'media' : a.wipeOut ? 'wipeOut' : a.holdFor ? 'hold' : a.handoff ? 'handoff' : a.coveredBy ? 'cover' : a.side ? 'side'
      : a.opaque ? (a.fadeOut ? (fsSurface(a) ? 'retract' : 'fade') : next?.txIn === 'swap' ? 'swap' : 'cut')
      : a.lower ? 'band' : 'overlay';
    if (a.txOut === 'retract' && videoDur - a.end <= TAIL + 1e-6) { a.txOut = 'fade'; a.tailFade = true; }
  }
}

// 子母畫面每個片段的進場（fly／fade／none）與出場（layer／fade／none）（spec FR-022、FR-026）
function pipMotion(timed, { tm, voiceOut, punches = [] }) {
  const frame = 1 / FPS;
  const all = timed.flatMap((a) => (a.pipPieces || []).map((p) => ({ a, p })));
  const near = (x, y) => Math.abs(x - y) <= 0.001 + 1e-9;
  const isJoin = (t) => tm.joinsOut.some((j) => Math.abs(j - t) < 1e-3);
  // 這一刻講者是不是滿版（沒被整張幕蓋住、不是只有聲音、沒有側邊欄、沒有 punch 放大）
  const speakerFull = (t) => t >= 0
    && !timed.some((x) => x.opaque && x.start <= t + 1e-9 && t < x.end - 1e-9)
    && !voiceOut.some(([s, e]) => t >= s - 1e-9 && t < e)
    && !timed.some((x) => x.side && x.start <= t + 1e-9 && t < x.end - 1e-9)
    && !punches.some((p) => t >= p.a - 1e-9 && t < p.b);
  for (const { a, p } of all) {
    const pieces = a.pipPieces, last = p === pieces[pieces.length - 1];
    const before = all.find((q) => q.a !== a && near(q.p.e, p.s));
    if (before) {
      p.enter = 'none';
      // 從上一段接過來：錄影段的小視窗在錄影裡（media.mjs pipShift），位置不同就滑過去（main.mjs）
      const [x0, y0] = before.a.media?.pipShift || [0, 0], [x1, y1] = a.media?.pipShift || [0, 0];
      if (x0 !== x1 || y0 !== y1) p.slideFrom = [x0, y0];
    } else if (p.s > a.start + 1e-3 && isJoin(p.s)) p.enter = 'none';
    // 甩鏡、斜躺擺平進場的錄影段：小視窗原地淡入（講者整張飛過去會蓋住進場）
    else if (p.e - p.s >= PIP_FLY_MIN - 1e-9 && speakerFull(r3(p.s - frame)) && !(near(p.s, a.start) && ['whip', 'tilt'].includes(a.enterFx))) p.enter = 'fly';
    else p.enter = 'fade';
    p.exitDur = 0;
    if (all.some((q) => q.a !== a && near(q.p.s, p.e))) p.exit = 'none';
    else if (!last && isJoin(p.e)) p.exit = 'none';
    else if (last && a.pipExit) { p.exit = 'fade'; p.exitDur = a.pipExit; }
    else if (last && near(p.e, a.end) && a.fadeOut) p.exit = 'layer';
    else { p.exit = 'fade'; p.exitDur = PIP_FADE; }
  }
}

// 結尾配樂的實際起播點與長度（len＝配樂檔長度；specs/contracts/sfx.md §6.2）
export function outroClip(outro, len, outDur) {
  if (!outro?.music || !(len > 0)) return null;
  const aligned = len >= outro.span - 1e-3 ? 'from' : 'end';
  const at = aligned === 'from' ? outro.start : r3(Math.max(0, outDur - len));
  const dur = r3(aligned === 'from' ? outro.span : Math.min(len, outDur));
  return { at, dur, from: 0, aligned, fadeIn: r3(Math.min(outro.fadeIn, dur / 3)), fadeOut: r3(Math.min(outro.fadeOut, dur / 3)), gain: outro.gain, len: r3(len) };
}

// 「結尾配樂：…」那一行（原文 specs/contracts/cli-005.md §3.4）
export function outroLine(outro, clip) {
  // 沒寫 outro（沒人決定過）也印一行：停點回報貼這行，使用者才知道可以配片尾配樂
  if (!outro) return '結尾配樂：沒配（預設不配；要配就在 plan.json 第一層寫 "outro": { "from": "#N" }，N＝結語金句講完後那一句；確定不配寫 "outro": { "music": null }）';
  if (!outro.music) return '結尾配樂：outro 沒寫 music（或寫 null），不配';
  if (!clip) return null;
  const credit = outro.credit ? `；這首要在影片說明欄標示出處：${outro.credit}` : '';
  if (clip.aligned === 'end') return `結尾配樂：${outro.music} 只有 ${clip.len.toFixed(1)} 秒，比 outro.from（${outro.from}，${fmt(outro.start)}）到片尾的 ${outro.span.toFixed(1)} 秒短，改從 ${fmt(clip.at)} 起播、對齊片尾${credit}`;
  return `結尾配樂：${outro.music} 從 ${fmt(clip.at)} 起播 ${clip.dur.toFixed(1)} 秒（淡入 ${String(+clip.fadeIn.toFixed(2))} 秒、淡出 ${String(+clip.fadeOut.toFixed(2))} 秒，比人聲小 ${(-outro.relDb).toFixed(1)} dB）${credit}`;
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
    const layout = it.side ? 'side' : it.opaque && it.pipPieces?.length ? 'pip' : it.opaque ? 'full' : 'overlay';
    const lists = Object.values(it.resolved?.listTimes || {}).flat().filter(isNum).map((t) => r3(it.start + t)).sort((a, b) => a - b);
    return {
      id: o.id, type: o.type, label: o.label,
      key: it.type === 'scene' ? (it.scene.dir ? path.basename(it.scene.dir) : it.scene.key) : it.type === 'fx' ? it.fxDef.id : it.type === 'custom' ? path.basename(String(it.seg.src ?? '')) : it.media.src,
      family: it.type === 'scene' ? it.scene.family : it.type,
      layout, layoutZh: (res.format === 'portrait' ? LAYOUT_ZH_PORTRAIT : LAYOUT_ZH)[layout], opaque: !!it.opaque,
      ...o,
      out: {
        start: r3(it.start), end: r3(it.end), lists,
        annotations: it.type === 'media' ? (it.mediaReport?.json ?? null) : null,
        pip: (it.pipPieces || []).map((p) => ({ start: r3(p.s), end: r3(p.e), enter: p.enter ?? 'fade', exit: p.exit ?? 'layer' })),
        pipShift: it.media?.pipShift ?? null,
        wipe: { in: !!it.wipeIn, out: !!it.wipeOut, preroll: it.preroll || 0, postroll: it.postroll || 0 },
        refs: it.cueRefs || {},
        tx: { in: it.txIn ?? 'cut', out: it.txOut ?? 'cut', prev: it.prev ?? 'speaker' },
        wide: !!it.wide, badgeBox: it.badgeBox ?? null,
      },
    };
  });
}

// --check --json 第一層的新欄位（schema 2，specs/contracts/check-json.md §2）；clip＝outroClip() 的結果（沒量長度時 null）
export function jsonTop(res, { clip = null } = {}) {
  const tm = res.tm;
  const back = (t, end) => (!tm || tm.identity ? r3(t) : end ? tm.unmapEnd(t) : tm.unmapStart(t));
  const span = (u, extra = {}) => ({ start: back(u.start), end: back(u.end, true), outStart: r3(u.start), outEnd: r3(u.end), len: r3(u.end - u.start), ...extra });
  const b = res.sfxBudget;
  return {
    rhythm: res.rhythm ?? 'continuous',
    theme: res.theme ?? 'light',
    voiceUncovered: (res.voiceGaps || []).map((g) => span(g, { level: g.level })),
    uncovered: (res.uncovered || []).map((u) => span(u)),
    chapters: (res.chapters || []).map((c) => ({ id: c.id, kind: c.kind ?? 'chapter', num: c.num ?? '', cue: c.cue, title: c.title, start: back(c.start), end: back(c.end, true), outStart: r3(c.start), outEnd: r3(c.end), gap: c.gap, placement: c.placement, captionsClipped: c.captionsClipped,
      badge: (c.badge || []).map(([a, b]) => [back(a), back(b, true)]), outBadge: (c.badge || []).map(([a, b]) => [r3(a), r3(b)]) })),
    sfxCount: b?.count ?? {},
    sfxBudget: b ? {
      perMinuteAvg: b.perMinuteAvg,
      over: b.over.map((x) => ({ ...x, cues: x.cues.map((c) => ({ ...c, at: back(c.at) })) })),
      dense: b.dense,
      loud: b.loud.map((x) => ({ ...x, at: back(x.at) })),
    } : { perMinuteAvg: 0, over: [], dense: [], loud: [] },
    outro: res.outro?.music && clip ? { music: res.outro.music, start: back(clip.at), dur: clip.dur, aligned: clip.aligned } : null,
    // 情緒點（plan.json moods，023）：i＝moods 的第幾個；at＝rough.mp4 秒數；sfx＝最後出聲的音效（被取捨拿掉的是 null，dropped 寫原本那顆）
    moods: (res.moods || []).map((m) => ({ i: m.i, kind: m.kind, at: back(m.event), outAt: r3(m.event), sfx: m.sfx?.name ?? null, dropped: m.sfx ? null : m.dropped, off: !!m.off,
      zoom: !!(res.zooms?.list || []).find((z) => z.i === m.i) })),
  };
}

export function formatReport(res, { videoDur, tail = [] } = {}) {
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
    notes.push(...(it.notes || []));
    const refs = Object.keys(it.cueRefs || {});
    if (refs.length) notes.push(`綁句 ${refs.length} 個（${refs.join('、')}）`);
    const tm = res.tm;
    if (tm && !tm.identity) notes.push(`rough ${fmt(tm.unmapStart(it.start))}–${fmt(tm.unmapEnd(it.end))}${it.cutTrim ? `，cuts 剪掉 ${it.cutTrim}s` : ''}`);
    if (it.media) {
      const m = it.media;
      if (m.kind === 'video' && !m.retime) notes.push(`素材 ${m.in}s 起${m.speed !== 1 ? ` ×${m.speed}` : ''}${m.volume != null ? `、原聲 ${m.volume}dB` : ''}`);
      if (m.hold != null) notes.push(`定格 素材第 ${m.hold}s`);
      if (it.mediaReport?.summary) notes.push(it.mediaReport.summary);
      if (it.enterFx && it.enterFx !== 'fade') notes.push(`進場 ${it.enterFx}`);
    }
    if (it.pipNote) notes.push(it.pipNote);
    lines.push(`${it.id}｜${it.label}｜${fmt(it.start)}–${fmt(it.end)}｜${it.D}s｜${s}｜${it.warnings.length ? `⚠ ${it.warnings.length}` : '—'}${notes.length ? `（${notes.join('；')}）` : ''}`);
  }
  if (res.tm && !res.tm.identity) {
    const cut = r3(res.tm.cuts.reduce((s, [a, b]) => s + b - a, 0));
    lines.push(`影片長度 ${fmt(res.outDur)}（${res.outDur}s）＝ rough.mp4 ${res.roughDur}s − cuts ${cut}s（${res.tm.cuts.length} 段）；上表時間是完成影片的秒數（rough.mp4 的秒數寫在括號）`);
  } else if (videoDur != null) lines.push(`影片長度 ${fmt(videoDur)}（${videoDur}s）`);
  // 節奏與沒有畫面的區間（原文 specs/contracts/cli-002.md §1.3）
  lines.push(res.rhythm === 'spaced'
    ? '節奏：spaced（留露臉空檔：開場前 30 秒最多一張、兩段之間至少露臉 3 秒）'
    : '節奏：continuous（連續覆蓋：每段講解都要有畫面；要留露臉空檔就在 plan.json 寫 "rhythm": "spaced"）');
  const unc = res.uncovered || [];
  if (!unc.length) lines.push(`沒有畫面的區間（> ${UNCOVERED_MIN.toFixed(1)}s）：無`);
  else {
    const tm = res.tm, cutOn = tm && !tm.identity;
    const tot = unc.reduce((s, u) => s + u.len, 0);
    const pct = res.spokenLen > 0 ? ((tot / res.spokenLen) * 100).toFixed(1) : '0.0';
    lines.push(`沒有畫面的區間（> ${UNCOVERED_MIN.toFixed(1)}s）：${unc.map((u) => `${fmt(u.start)}–${fmt(u.end)}（${u.len.toFixed(2)}s）${cutOn ? `（rough.mp4 ${fmt(tm.unmapStart(u.start))}–${fmt(tm.unmapEnd(u.end))}）` : ''}`).join('、')}；共 ${tot.toFixed(2)}s，佔講解 ${pct}%`);
  }
  for (const [a, b] of res.voiceOnly || []) {
    const gap = (res.voiceGaps || []).filter((g) => g.start < (res.tm ? res.tm.map(b) : b) && g.end > (res.tm ? res.tm.map(a) : a));
    lines.push(`只有聲音（rough.mp4 ${fmt(a)}–${fmt(b)}，${r3(b - a)}s）：${gap.length ? `${gap.map((g) => `${g.level === 'error' ? '✖' : '⚠'} ${fmt(g.start)}–${fmt(g.end)}`).join('、')} 沒被蓋住` : '已被 media 段或全畫面蓋住，子母畫面自動不顯示'}`);
  }
  // 只是告知（不用改）：逐字稿給的時間落在停頓裡的 #N@詞，已經對到開口（lib/time.mjs onVoice）
  if (res.voiceMoved?.length) lines.push(`綁詞對準開口：${res.voiceMoved.length} 個 #N@詞 原本落在停頓裡（那一刻沒在說話），已移到開口那一刻：${res.voiceMoved.slice(0, 6).join('、')}${res.voiceMoved.length > 6 ? '…' : ''}`);
  if (res.globals?.sideLine) lines.push(res.globals.sideLine);
  if (res.sfxBudget) lines.push(...res.sfxBudget.lines);
  // 轉場與主題（design-system.md §5、§10；每段的值在 --check --json 的 items[].out.tx）
  const txCount = (k, v) => res.items.filter((it) => it[k] === v).map((it) => it.id);
  const txParts = [['txIn', 'wipe', '色帶擦開'], ['txIn', 'swap', '換卡不換景'], ['txOut', 'retract', '色帶收回'], ['txIn', 'band', '疊加卡'], ['txIn', 'chapter', '章節擦入']]
    .map(([k, v, zh]) => [zh, txCount(k, v)]).filter(([, ids]) => ids.length).map(([zh, ids]) => `${zh} ${ids.length}（${ids.join('、')}）`);
  lines.push(`轉場：${txParts.join('；') || '無'}｜主題：${res.theme === 'dark' ? '暗色（theme: "dark"）' : '亮色'}${res.style ? `｜風格包：${res.style}` : ''}`);
  lines.push(...tail.filter(Boolean));
  return lines.join('\n');
}

