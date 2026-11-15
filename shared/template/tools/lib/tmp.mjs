// 暫存資料夾放哪（零依賴）：預設不動，就是系統暫存。shared/setting.json 寫了 tmp 才會改（node shared/template/tools/status.mjs --tmp <資料夾>）：
//
//   { "tmp": { "dir": "/Volumes/auto-edit-tmp", "image": "/Volumes/video/auto-edit-tmp.sparseimage" } }
//     dir    os.tmpdir() 底下的東西（render 的影格、抽格快取、瀏覽器設定檔）改放這裡：系統碟空間不夠、想放外接硬碟時設
//     image  選填，macOS：dir 是這個映像檔掛起來的卷。dir 不在、映像檔在，就先 hdiutil attach 再用
//
// 每支工具開跑時做一次（lib/cli.mjs 的 isMain 會呼叫 applyTmp）：dir 在而且可寫 → 把這個處理程序的 TMPDIR（Windows 是 TEMP、TMP）指過去，
// os.tmpdir() 和子處理程序（hyperframes、ffmpeg、瀏覽器）都跟著走；用不了（硬碟沒接、映像檔掛不上、不能寫入）→ 不動，照舊用系統暫存，不擋流程，
// 並把 AUTO_EDIT_TMP 設成 off，這一串子處理程序不用各自再試一次。
// 環境變數 AUTO_EDIT_TMP 蓋過設定：<資料夾>＝這一次用這個；off＝這一次不改（測試自己指定 TMPDIR 時用）。
//
//   tmpSetting(sharedDir)                  → { dir, image } 或 null（沒設定、寫錯都是 null）
//   applyTmp(sharedDir, { env, platform }) → { state: 'off' | 'on' | 'fallback', dir }；不丟例外
//   tmpApplied()                           → 這個處理程序最後一次 applyTmp 的結果（還沒跑過是 null）
//   tmpWarnLine(r)                         → status.mjs 印的那一行 ⚠（state 是 fallback 才有，其他回 null）
//   saveTmp(sharedDir, value, { image })   → { dir, image, file }；value 是 off → { off: true, file }；資料夾現在用不了就丟錯（不寫設定）
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readSettings, writeSetting, SETTINGS_FILE } from './settings.mjs';

export const TMP_CMD = 'node shared/template/tools/status.mjs --tmp';
const SHARED = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const OFF = { state: 'off', dir: null };
const usable = (dir) => { try { if (!fs.statSync(dir).isDirectory()) return false; fs.accessSync(dir, fs.constants.W_OK); return true; } catch { return false; } };
const attachImage = (image) => { spawnSync('hdiutil', ['attach', '-nobrowse', '-quiet', image], { stdio: 'ignore', timeout: 60000 }); };
let last = null;

export function tmpSetting(sharedDir = SHARED) {
  const t = readSettings(sharedDir).data.tmp;
  if (!t || typeof t.dir !== 'string' || !path.isAbsolute(t.dir)) return null;
  return { dir: t.dir, image: typeof t.image === 'string' && t.image ? t.image : null };
}

export function applyTmp(sharedDir = SHARED, { env = process.env, platform = process.platform, attach = attachImage } = {}) {
  try {
    const forced = env.AUTO_EDIT_TMP;
    const cfg = forced === 'off' ? null : forced ? { dir: path.resolve(forced), image: null } : tmpSetting(sharedDir);
    if (!cfg) return (last = OFF);
    if (!usable(cfg.dir) && cfg.image && platform === 'darwin' && fs.existsSync(cfg.image)) attach(cfg.image);
    if (!usable(cfg.dir)) { env.AUTO_EDIT_TMP = 'off'; return (last = { state: 'fallback', dir: cfg.dir }); }
    if (platform === 'win32') { env.TEMP = cfg.dir; env.TMP = cfg.dir; } else env.TMPDIR = cfg.dir;
    return (last = { state: 'on', dir: cfg.dir });
  } catch { return (last = OFF); }
}

export const tmpApplied = () => last;

export function tmpWarnLine(r) {
  if (r?.state !== 'fallback') return null;
  return `暫存：⚠ ${r.dir} 現在用不了（硬碟沒接上、映像檔沒掛上，或不能寫入）→ 這一次先用系統暫存，照常做，回報時告訴使用者一聲；硬碟接好之後下一條指令就會用回去。以後都不用它就跑 ${TMP_CMD} off`;
}

export function saveTmp(sharedDir, value, { image = null, platform = process.platform, attach = attachImage } = {}) {
  const v = String(value ?? '').trim();
  if (v === 'off') return { off: true, file: writeSetting(sharedDir, 'tmp', undefined) };
  if (!path.isAbsolute(v)) throw new Error(`--tmp 要寫資料夾的完整路徑（現在是「${value}」）→ 例：${TMP_CMD} /Volumes/auto-edit-tmp；要關掉寫 ${TMP_CMD} off`);
  const img = image == null ? null : String(image).trim();
  if (img != null && !path.isAbsolute(img)) throw new Error(`--tmp-image 要寫映像檔的完整路徑（現在是「${image}」）`);
  if (img && !fs.existsSync(img)) throw new Error(`找不到映像檔 ${img} → 先接上硬碟再設定`);
  if (!usable(v) && img && platform === 'darwin') attach(img);
  if (!usable(v)) throw new Error(`${v} 現在用不了（不存在、不是資料夾，或不能寫入）→ 先接上硬碟${img ? '' : '、掛上映像檔（下次要自動掛就加 --tmp-image <映像檔>）'}再設定；沒有寫進 shared/${SETTINGS_FILE}`);
  return { dir: v, image: img, file: writeSetting(sharedDir, 'tmp', { dir: v, ...(img ? { image: img } : {}) }) };
}
