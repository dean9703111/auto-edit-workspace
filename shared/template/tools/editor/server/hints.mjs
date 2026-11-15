// 提示卡只跳第一次（044）：使用者關掉過哪幾張提示卡，記在 shared/setting.json 的 editor.seen。
// 這台機器所有專案、所有 port 的剪輯台讀同一份，在一支影片關掉過，別支就不再跳（瀏覽器的 localStorage 是一個 port 一份，記不住）。
//   GET  /api/hints                         → { seen: ["coach-final.v1", …] }
//   POST /api/hints { "seen": "<代號>" }     → { ok: true, seen: […] }；只把這個代號加進 editor.seen，其他設定、editor 底下別的欄位都留著
// 設定檔讀不到、壞了、寫不進去都只回錯誤，不丟例外：頁面（app.js）會退回瀏覽器自己記，最差就是照舊再跳一次。
// 測試用 ctx.speakerTemplate 指到暫存的 shared/template；測試（AUTO_EDIT_NO_LOCAL_BRAND=1）沒有指過去時不讀也不寫，動不到真的 shared/setting.json。
import path from 'node:path';
import { readSettings, writeSetting } from '../../lib/settings.mjs';

const ID = /^[a-z][a-z0-9.-]{0,39}$/;   // 代號由頁面定（coach.v2、coach-final.v1、coach-rough.v1），這裡只擋不像代號的字
const MAX = 50;                          // 最多記幾個：頁面出錯也塞不爆設定檔
const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const sharedOf = (ctx) => (process.env.AUTO_EDIT_NO_LOCAL_BRAND === '1' && !ctx.speakerTemplate ? null : path.resolve(ctx.speakerTemplate || ctx.P.templateDir, '..'));
const seenOf = (editor) => [...new Set((Array.isArray(editor?.seen) ? editor.seen : []).filter((id) => typeof id === 'string' && ID.test(id)))];

export function hintsInfo(ctx) {
  const dir = sharedOf(ctx);
  if (!dir) return { seen: [] };
  try { return { seen: seenOf(readSettings(dir).data.editor) }; } catch { return { seen: [] }; }
}

export function doHintSeen(ctx, body) {
  const id = body?.seen;
  if (typeof id !== 'string' || !ID.test(id)) return [400, { error: 'badhint', message: '要送 { "seen": "<提示卡代號>" }，代號是小寫英數、點、連字號（例：coach-final.v1）' }];
  const dir = sharedOf(ctx);
  if (!dir) return [503, { error: 'nosettings', message: '測試中不寫 shared/setting.json（要測就用 speakerTemplate 指到暫存的 shared/template）' }];
  try {
    const { data } = readSettings(dir);
    if (data.editor !== undefined && !isObj(data.editor)) return [409, { error: 'badsettings', message: 'shared/setting.json 的 editor 不是一個物件 → 修好這個檔再試（不會蓋掉它）' }];
    const seen = seenOf(data.editor);
    if (!seen.includes(id)) writeSetting(dir, 'editor', { ...data.editor, seen: [...seen, id].slice(-MAX) });   // 檔案不是合法 JSON 時 writeSetting 會丟錯，不蓋掉它
    return [200, { ok: true, ...hintsInfo(ctx) }];
  } catch (e) { return [500, { error: 'settings', message: e.message }]; }
}
