// 工作區設定（零依賴）：shared/setting.json＝這台機器自己的設定，全部集中在這一個檔（不進版控；範本 shared/setting.example.json）
//
//   { "speaker": { "name": "林大寶", "short": "大寶", "titles": ["影音創作者"] },   講者資料（lib/speaker.mjs；{ "off": true }＝不放講者介紹）
//     "agents": 10,                                                               子代理一次最多派幾個（lib/agents.mjs）
//     "music": { "bed": "<曲名>", "outro": "<曲名>", "acestep": {…} },             每一集預設的底樂、片尾配樂（music.mjs use／outro）、ACE-Step 在哪
//     "ending": { "image": "book-cover.jpg", "seconds": 9.9, "quote": true, "subscribe": "subscribe.gif" } }
//                                                                                 片尾模板：片尾卡的圖、長度、要不要片尾金句、訂閱動畫（檔案在 shared/brand/；brand.mjs ending；lib/ending.mjs）
//     "captions": { "look": "outline", "font": "wenkai", "size": 84, "weight": 700 }   以後每集的字幕樣式（brand.mjs captions、剪輯台；lib/caption-style.mjs；只存和原本不一樣的欄位）
//
//   readSettings(sharedDir)             → { data, file, error }：檔案不在＝{}；不是合法 JSON＝error（data 是 {}）
//   writeSetting(sharedDir, key, value) → file：只改這一個 key，其他設定留著；value 是 undefined 就拿掉；檔案壞了丟錯（不蓋掉使用者的檔）
//
// 舊版把講者資料放在 shared/講者.json：setting.json 還沒有 speaker 時照舊讀它，下一次寫設定時一起搬進 setting.json（舊檔留著，不會再被讀）。
import fs from 'node:fs';
import path from 'node:path';
import { writeAtomic } from './atomic.mjs';

export const SETTINGS_FILE = 'setting.json';
export const SETTINGS_EXAMPLE = 'setting.example.json';
export const LEGACY_SPEAKER_FILE = '講者.json';
export const settingsFile = (sharedDir) => path.join(sharedDir, SETTINGS_FILE);
const isObj = (j) => j && typeof j === 'object' && !Array.isArray(j);

function legacySpeaker(sharedDir) {
  const file = path.join(sharedDir, LEGACY_SPEAKER_FILE);
  if (!fs.existsSync(file)) return null;
  try { const j = JSON.parse(fs.readFileSync(file, 'utf8')); return isObj(j) ? { data: j } : { error: '不是一個 JSON 物件' }; } catch (e) { return { error: `不是合法的 JSON（${e.message}）` }; }
}

export function readSettings(sharedDir) {
  const file = settingsFile(sharedDir);
  let data = {}, error = null;
  if (fs.existsSync(file)) {
    try { const j = JSON.parse(fs.readFileSync(file, 'utf8')); if (isObj(j)) data = j; else error = '不是一個 JSON 物件'; } catch (e) { error = `不是合法的 JSON（${e.message}）`; }
  }
  if (!error && data.speaker === undefined) {
    const old = legacySpeaker(sharedDir);
    if (old?.data) data = { ...data, speaker: old.data };
    else if (old?.error) error = `shared/${LEGACY_SPEAKER_FILE} ${old.error}`;
  }
  return { data, file, error };
}

export function writeSetting(sharedDir, key, value) {
  const { data, file, error } = readSettings(sharedDir);
  if (error && fs.existsSync(file)) throw new Error(`shared/${SETTINGS_FILE} ${error} → 修好這個檔再設定（不會蓋掉它）`);
  const next = { ...data };
  if (value === undefined) delete next[key]; else next[key] = value;
  fs.mkdirSync(sharedDir, { recursive: true });
  writeAtomic(file, `${JSON.stringify(next, null, 2)}\n`);
  return file;
}
