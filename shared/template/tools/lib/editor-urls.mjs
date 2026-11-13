// 剪輯台各頁網址的同步版：給同步的呼叫端（lib/flow.mjs、lib/framing-flow.mjs、lib/rough-flow.mjs、versions.mjs）。
// 跑 editor.mjs --project … --json（沒開就在背景開），讀它印的那一行 JSON：網址直接拿，不從人看的輸出比對文字。零依賴。
//   editorUrlsSync(project, { template } = {}) → { main, cuts, framing, storyboard, final, url, port, pid, started, restarted, log }；
//     開不起來、印的不是 JSON 都回 null（呼叫端照舊印「剪輯台沒開」那類退路）
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const EDITOR = fileURLToPath(new URL('../editor.mjs', import.meta.url));
const WAIT_MS = 60000;   // ensureEditor 最多等 20 秒開好；舊版後端要先關掉再開，留寬一點

export function editorUrlsSync(project, { template } = {}) {
  if (!project) return null;
  const args = [EDITOR, '--project', project, ...(template ? ['--template', template] : []), '--json'];
  const r = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: WAIT_MS, windowsHide: true });
  if (r.status !== 0) return null;
  try {
    const u = JSON.parse(String(r.stdout).trim().split('\n').pop());
    return u?.main ? u : null;
  } catch { return null; }
}
