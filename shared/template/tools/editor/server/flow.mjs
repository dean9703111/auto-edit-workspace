// 四頁共用的流程列（/api/flow）：照 work/製作進度.md 的停點紀錄和現有的檔案，告訴頁面每一步走到哪、現在等誰。
import fs from 'node:fs';
import path from 'node:path';
import { readStopLog } from '../../status.mjs';

const exists = (f) => { try { return fs.statSync(f).isFile(); } catch { return false; } };

export function flowState(ctx) {
  const P = ctx.P, work = path.join(P.project, 'work');
  let text = '';
  try { text = fs.readFileSync(path.join(work, '製作進度.md'), 'utf8'); } catch { /* 還沒有製作進度 */ }
  const log = readStopLog(text);
  const voiceOnly = /\|\s*主軌種類\s*\|\s*只有聲音/.test(text);   // 只有聲音的專案沒有構圖
  const steps = [
    { id: 'cuts', no: '①', label: '剪輯清單', stop: '① 剪輯清單', url: '/cuts', ready: exists(path.join(work, 'cuts.md')) },
    { id: 'framing', no: '②', label: '構圖', stop: '② 構圖', url: '/framing', ready: exists(path.join(work, 'rough.mp4')) && !voiceOnly, skip: voiceOnly },
    { id: 'storyboard', no: '③', label: '分鏡表', stop: '③ 分鏡表', url: '/storyboard', ready: exists(path.join(work, 'storyboard.md')) },
    { id: 'final', no: '④', label: '完成影片', stop: '④ 完成影片預覽', url: '/?view=final', ready: exists(P.plan) && exists(path.join(P.out, 'index.html')) },
  ].filter((s) => !s.skip);
  const stateOf = (row) => (!row ? 'none' : ['通過', '略過'].includes(row.state) ? 'done' : 'waiting');
  const out = steps.map(({ stop, skip, ...s }) => ({ ...s, state: stateOf(log.last?.get(stop)), said: log.last?.get(stop)?.state ?? null }));
  const lastRow = log.rows?.at(-1);
  const waiting = lastRow && stateOf(lastRow) === 'waiting' ? steps.find((s) => s.stop === lastRow.stop)?.id ?? null : null;
  // ⑤ 剪輯台不在流程列上，頁面的「下一步」還是要知道現在等的是它
  return { steps: out, waiting, stop: lastRow && stateOf(lastRow) === 'waiting' ? lastRow.stop : null };
}
