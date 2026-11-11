// 講者資料（零依賴）：shared/setting.json 的 speaker＝創作者自己的姓名、頭銜（不進版控；範本 shared/setting.example.json；讀寫走 lib/settings.mjs）
//
//   "speaker": { "name": "林大寶", "short": "大寶", "titles": ["影音創作者", "科技部落客", "線上課程講師"] }   設定好
//   "speaker": { "off": true }                                                                              關閉：不放 14 講者介紹
//   沒有 speaker（也沒有舊版的 shared/講者.json）                                                             還沒設定：14 用 scene.json 的示範人物，--check 會 ⚠ 提醒
//
//   readSpeaker(templateDir)          → { state: 'set'|'off'|'unset'|'bad', name, short, titles, file, error }
//   applySpeaker(scenes, sp)          → 設定好時把 14 的 name／titles、15 的 by 預設值換成講者資料（不改原物件）
//   speakerIssues(sp, res)            → { errors, warnings }：plan 裡的 14 講者介紹對照講者資料
//   validateSpeaker({ name, short, titles }) → 錯誤訊息陣列（字數上限照 14 講者介紹、15 金句的 scene.json）
//   speakerGate(templateDir, plan)    → { needed, demo, segments, state, … }：這份 plan 輸出後，畫面上會不會是示範人物（輸出前的確認用）
//   saveSpeaker(templateDir, input)   → { errors, file }：寫 shared/setting.json 的 speaker（剪輯頁輸出前的確認、分鏡表頂端的提醒用；brand.mjs speaker 同一份格式）
//   SET_CMD                           → 設定講者的指令（提醒訊息共用）
//
// 示範人物「林大寶」只有一個來源：scenes/14-speaker/scene.json 的 slots.name.default、slots.titles.default（情境庫預覽用）。
// 講者還沒設定、段落也沒寫 slots.name 時，14 講者介紹就用這組預設值，所以真實影片會出現別人的名字：輸出前一定要問過使用者。
import path from 'node:path';
import { visibleLen, loadScenes, findScene } from './scenes.mjs';
import { readSettings, writeSetting, SETTINGS_FILE, SETTINGS_EXAMPLE } from './settings.mjs';

export const SPEAKER_FILE = SETTINGS_FILE;         // 訊息裡印的檔名：shared/setting.json
export const SPEAKER_EXAMPLE = SETTINGS_EXAMPLE;
export const SET_CMD = 'node shared/template/tools/brand.mjs speaker --name "<姓名>" --titles "<頭銜1>,<頭銜2>"';
export const LIMITS = { name: 5, short: 10, titles: 6, maxTitles: 3 };

const sharedOf = (templateDir) => path.resolve(templateDir, '..');
export const speakerFile = (templateDir) => path.join(sharedOf(templateDir), SPEAKER_FILE);

export function validateSpeaker({ name, short, titles }) {
  const e = [];
  if (!name || !String(name).trim()) e.push('姓名沒有寫');
  else if (visibleLen(name) > LIMITS.name) e.push(`姓名「${name}」${visibleLen(name)} 字，最多 ${LIMITS.name} 字`);
  if (short != null && visibleLen(short) > LIMITS.short) e.push(`簡稱「${short}」${visibleLen(short)} 字，最多 ${LIMITS.short} 字（金句卡的出處）`);
  if (!Array.isArray(titles) || !titles.length) e.push('頭銜至少 1 個');
  else {
    if (titles.length > LIMITS.maxTitles) e.push(`頭銜 ${titles.length} 個，最多 ${LIMITS.maxTitles} 個`);
    for (const t of titles) if (visibleLen(t) > LIMITS.titles) e.push(`頭銜「${t}」${visibleLen(t)} 字，每個最多 ${LIMITS.titles} 字`);
  }
  return e;
}

export function readSpeaker(templateDir) {
  const { data, file, error } = readSettings(sharedOf(templateDir));
  if (error) return { state: 'bad', file, error };
  const j = data.speaker;
  if (j === undefined) return { state: 'unset', file };
  if (j && j.off === true) return { state: 'off', file };
  const sp = { name: String(j?.name ?? '').trim(), short: j?.short != null ? String(j.short).trim() : null, titles: Array.isArray(j?.titles) ? j.titles.map((t) => String(t).trim()).filter(Boolean) : [] };
  const errs = validateSpeaker(sp);
  if (errs.length) return { state: 'bad', file, error: errs.join('；') };
  return { state: 'set', file, ...sp, short: sp.short || sp.name };
}

export function applySpeaker(scenes, sp) {
  if (sp?.state !== 'set') return scenes;
  return scenes.map((s) => {
    if (s.key === 'speaker') return { ...s, slots: { ...s.slots, name: { ...s.slots.name, default: sp.name }, titles: { ...s.slots.titles, default: [...sp.titles] } } };
    if (s.key === 'quote' && s.slots?.by) return { ...s, slots: { ...s.slots, by: { ...s.slots.by, default: sp.short } } };
    return s;
  });
}

// 這份 plan 輸出後，畫面上會不會是示範人物：段落沒寫 name 且還沒設定講者，或 name 直接寫了示範人物而講者資料沒設定
export function speakerGate(templateDir, plan, sp = readSpeaker(templateDir)) {
  let scenes = [];
  try { scenes = loadScenes(templateDir); } catch { /* 模板讀不到：當成沒有講者段，由 build 報錯 */ }
  const def = scenes.find((s) => s.key === 'speaker');
  const demo = def?.slots?.name?.default ?? null;
  const segs = (Array.isArray(plan?.scenes) ? plan.scenes : []).filter((s) => s && s.scene != null && findScene(scenes, s.scene)?.key === 'speaker');
  const shown = segs.filter((s) => {
    const name = typeof s.slots?.name === 'string' ? s.slots.name.trim() : '';
    return name ? name === demo && sp.state !== 'set' : sp.state === 'unset';
  });
  return {
    needed: shown.length > 0, state: sp.state, demo, demoTitles: def?.slots?.titles?.default ?? [], segments: shown.map((s) => s.id),
    name: sp.state === 'set' ? sp.name : null, titles: sp.state === 'set' ? sp.titles : [], limits: LIMITS,
  };
}

export function saveSpeaker(templateDir, { name, titles, short } = {}) {
  const list = Array.isArray(titles) ? titles : String(titles ?? '').split(/[,，、]/);
  const data = { name: String(name ?? '').trim(), titles: list.map((t) => String(t).trim()).filter(Boolean) };
  if (short != null && String(short).trim()) data.short = String(short).trim();
  const errors = validateSpeaker(data);
  if (errors.length) return { errors, file: null };
  try { return { errors: [], file: writeSetting(sharedOf(templateDir), 'speaker', data) }; } catch (e) { return { errors: [e.message], file: null }; }
}

export function speakerIssues(sp, res) {
  const errors = [], warnings = [];
  const segs = (res.items || []).filter((it) => it.type === 'scene' && it.scene?.key === 'speaker');
  // 檔案壞了：有用到 14 才擋，沒用到只提醒
  if (sp.state === 'bad') (segs.length ? errors : warnings).push(`shared/${SPEAKER_FILE}：${sp.error} → 重新設定：${SET_CMD}`);
  for (const it of segs) {
    const name = it.seg?.slots?.name;
    if (sp.state === 'off') errors.push(`${it.where} 講者介紹：shared/${SPEAKER_FILE} 設定成不放講者介紹 → 刪掉這段，或重新設定講者：${SET_CMD}`);
    else if (sp.state === 'unset' && !name) warnings.push(`${it.where} 講者介紹：還沒設定講者，畫面上是示範人物「${it.scene.slots?.name?.default}」→ ${SET_CMD}（或在這段 slots 寫 name、titles）`);
    else if (sp.state === 'set' && name && String(name).trim() !== sp.name) warnings.push(`${it.where} 講者介紹：姓名「${name}」和 shared/${SPEAKER_FILE} 的「${sp.name}」不同（來賓就沒關係）`);
  }
  return { errors, warnings };
}
