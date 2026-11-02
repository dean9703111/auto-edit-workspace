// 講者資料（零依賴）：shared/講者.json＝創作者自己的姓名、頭銜（不進版控；範本 shared/講者.example.json）
//
//   { "name": "林大寶", "short": "大寶", "titles": ["影音創作者", "科技部落客", "線上課程講師"] }   設定好
//   { "off": true }                                                                              關閉：不放 14 講者介紹
//   檔案不存在                                                                                   還沒設定：14 用 scene.json 的示範人物，--check 會 ⚠ 提醒
//
//   readSpeaker(templateDir)          → { state: 'set'|'off'|'unset'|'bad', name, short, titles, file, error }
//   applySpeaker(scenes, sp)          → 設定好時把 14 的 name／titles、15 的 by 預設值換成講者資料（不改原物件）
//   speakerIssues(sp, res)            → { errors, warnings }：plan 裡的 14 講者介紹對照講者資料
//   validateSpeaker({ name, short, titles }) → 錯誤訊息陣列（字數上限照 14 講者介紹、15 金句的 scene.json）
//   SET_CMD                           → 設定講者的指令（提醒訊息共用）
import fs from 'node:fs';
import path from 'node:path';
import { visibleLen } from './scenes.mjs';

export const SPEAKER_FILE = '講者.json';
export const SPEAKER_EXAMPLE = '講者.example.json';
export const SET_CMD = 'node shared/template/tools/brand.mjs speaker --name "<姓名>" --titles "<頭銜1>,<頭銜2>"';
export const LIMITS = { name: 5, short: 10, titles: 6, maxTitles: 3 };

export const speakerFile = (templateDir) => path.join(path.resolve(templateDir, '..'), SPEAKER_FILE);

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
  const file = speakerFile(templateDir);
  if (!fs.existsSync(file)) return { state: 'unset', file };
  let j;
  try { j = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return { state: 'bad', file, error: `不是合法的 JSON（${e.message}）` }; }
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
