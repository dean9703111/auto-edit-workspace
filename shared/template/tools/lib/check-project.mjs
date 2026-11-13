// build.mjs --check --json 的行程內版本（032 C6 最後一步）：qc、versions、deliver 直接呼叫，不再各自另開 node 行程
//
//   checkProject(project, opts) → 和 `build.mjs --project <project> --check --json` 印的物件一樣（schema 2；出錯也回齊全部的鍵、ok: false）
//     project：專案資料夾（絕對路徑或相對目前資料夾）；opts：template、format、plan、srt、video、out、sfx（同 build.mjs 的旗標）
//
// 和子行程的差別都處理掉了：不會 process.exit、不印東西（log 關掉、錯誤包成 JSON 回傳）、不改 cwd、不留全域狀態。
// 和 CLI 一樣會做的副作用：拍點正本遷移（ensureBeatsV2，每個專案只做一次）、偵測快取（work/hyperframes/.cache/）、內容設計動畫補 brief。
// 剪輯台（editor.mjs）照舊開子行程：它是長時間的服務，build 的檢查是同步的、長片要好幾秒，行程內跑會卡住所有網頁請求。
import { build, errorJson } from '../build.mjs';
import { pathsFrom, loadLib } from './project.mjs';
import { ensureBeatsV2 } from './beat-source.mjs';

export function checkProject(project, opts = {}) {
  const flags = { ...opts, project, check: true, json: true };
  try {
    // build.mjs 的 cli 在 --check 之前先做拍點正本遷移（json 模式不印它的訊息）
    const P = pathsFrom(flags);
    if (P.project) ensureBeatsV2(P, { lib: () => loadLib(P.templateDir, P.project) });
    return build(flags, { log: () => {} }).json;
  } catch (e) {
    return errorJson(e.message);
  }
}
