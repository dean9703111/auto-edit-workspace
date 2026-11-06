// 分鏡表頁（停點 ③，/storyboard）：讀寫 work/storyboard.md，解析與修改邏輯在 ../storyboard-md.mjs（官網示範頁也用同一份）。
// storyboard.md 仍是唯一的真相：每次只動改到的那幾行，其他字元原樣保留；AI 照舊重新讀檔寫 plan.json。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { readStopLog } from '../../status.mjs';
import { BEAT_HEADER, BEAT_HEADER_ILLUS } from '../../lib/audit-beats.mjs';
import { storyboardDocState, applyStoryboardEdit } from '../storyboard-md.mjs';

const PREVIEW_DIR = 'storyboard-preview';
const BEAT_HEADERS = [BEAT_HEADER, [...BEAT_HEADER, ...BEAT_HEADER_ILLUS]];
const fail = (message, status = 400, extra = {}) => Object.assign(new Error(message), { status, extra });
const sha = (s) => crypto.createHash('sha1').update(s).digest('hex');
const statOf = (f) => { try { return fs.statSync(f); } catch { return null; } };
const fileOf = (ctx) => path.join(ctx.P.project, 'work', 'storyboard.md');
const imageUrlOf = (ctx) => (name) => {
  const st = statOf(path.join(ctx.P.project, 'work', PREVIEW_DIR, name));
  return st ? `/${PREVIEW_DIR}/${encodeURIComponent(name)}?v=${Math.floor(st.mtimeMs).toString(36)}` : null;
};

// 製作進度的停點 ③ 最後一列是「通過」「略過」＝已經照這份寫了正式 plan.json，再改也不會生效；改版（③ 分鏡表（s12 v2））不算
export function storyboardLocked(project) {
  let text;
  try { text = fs.readFileSync(path.join(project, 'work', '製作進度.md'), 'utf8'); } catch { return false; }
  const rows = (readStopLog(text).rows || []).filter((r) => (r.label || '').trim() === '③ 分鏡表');
  return ['通過', '略過'].includes(rows.at(-1)?.state);
}

export function storyboardState(ctx) {
  const f = fileOf(ctx);
  const base = { project: path.basename(ctx.P.project), file: 'work/storyboard.md', readOnly: storyboardLocked(ctx.P.project) };
  if (!statOf(f)) return { ...base, exists: false, hash: null, sig: null, title: '', sections: [], overview: {}, warnings: [] };
  return { ...base, exists: true, ...storyboardDocState(fs.readFileSync(f, 'utf8'), { hash: sha, imageUrl: imageUrlOf(ctx), beatHeaders: BEAT_HEADERS }) };
}

export function saveStoryboard(ctx, body) {
  const f = fileOf(ctx);
  if (storyboardLocked(ctx.P.project)) throw fail('分鏡表已經確認，這一頁現在只能看；要改請在對話跟 AI 說', 409);
  if (!statOf(f)) throw fail('還沒有 work/storyboard.md', 404);
  const text = fs.readFileSync(f, 'utf8');
  if (body?.hash !== sha(text)) throw fail('work/storyboard.md 剛被改過（可能是 AI 在改），已重新載入', 409, { state: storyboardState(ctx) });
  let next;
  try { next = applyStoryboardEdit(text, body, imageUrlOf(ctx)); } catch (e) {
    if (e.extra?.moved) e.extra = { state: storyboardState(ctx) };
    throw e;
  }
  if (next !== text) fs.writeFileSync(f, next);
  return storyboardState(ctx);
}

// 分鏡截圖：只開放 work/storyboard-preview/ 底下的圖片
export function storyboardImage(ctx, name) {
  if (!/^[^/\\]+\.(png|jpe?g|webp)$/i.test(name) || name.startsWith('.')) return null;
  const f = path.join(ctx.P.project, 'work', PREVIEW_DIR, name);
  return statOf(f) ? f : null;
}
