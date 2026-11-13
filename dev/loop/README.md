# dev/loop/：檢查迴圈（作者維護用，剪片時不要讀）

每一輪改完工作區（工具、Skill、文件、音效、look）都跑同一個迴圈，直到全部過關才交付。憲法 `.specify/memory/constitution.md`「檢查迴圈」是規則，這裡是做法。

## 一輪怎麼跑

| 步 | 做什麼 | 指令／做法 | 過關條件 |
|---|---|---|---|
| 1 | 單元測試＋管線 | `node dev/check-all.mjs`（第一次加 `--render`；要驗輸出加 `--deliver`；整套測試加 `--full`） | 全部 ✓（沒有 Chrome 的機器測試專案那幾輪略過不算失敗） |
| 2 | 真實專案 | 專案跑過分鏡（有 `work/drafts/`）後：`node dev/check-all.mjs --real projects/<專案>`（用它的素材複本和它自己的草稿，專案本身不動） | 同上 |
| 3 | 弱模型試跑 | 用較弱的模型（Sonnet 或更弱）開一個**新 session**，只給 `weak-model-brief.md` 的提示詞，從「剪乾淨」跑到停點 ③ | 它在每個停點都用固定格式停下、沒有自己算時間、沒有讀 `dev/`；卡住的地方記下來 |
| 4 | 審查員 | 只讀的審查員照 `specs/<編號>/spec.md` 的 SC-xxx 逐項打勾；回報格式照 `shared/template/REVIEW.md` | P0 清零；P1 列出處理方式 |
| 5 | 修、記錄 | 修完回到第 1 步。第 1、2 步的紀錄工具自己寫（下面）；第 3、4 步的結果寫進這次改動的 `specs/<編號>/` | — |

結束條件：連續一輪 1–4 全過、審查 P0＝0、弱模型試跑沒有「自己算」「跳過停點」「讀錯檔」三種失誤。

## 一鍵檢查怎麼跑（`dev/check-all.mjs`）

和 AI 剪片走同一條路，不直接寫 plan.json：

1. 單元測試：`npm run test:fast`（`--full` 跑整套 `npm test`）。
2. 測試專案：`projects/example` 的 `assets/`、`講稿.md` 複製到暫存資料夾（真實專案不動）。
3. 迴圈：`status.mjs --project <測試專案> --json` → 照它的 `cmds` 整行跑（結束碼 75 就再跑同一條）→ 再問 status。
   停點照固定回答挑 `after` 裡的那一組：① 可以、② 用建議的、③ 可以；到 ④ 完成影片預覽停（`--deliver` 再回「可以了，輸出完成影片」）。
4. 要 AI 寫的檔換成 `fixtures/` 的固定範例檔，並跑寫的人會跑的驗證：
   - 語意地圖 `<份>.map.md` → `build.mjs --map <份>`（status 印 `--map-merge` 之前放）
   - 大綱 `<份>.outline.md` → `--outline <份>`；草稿 `<份>.json` 蓋掉骨架 → `--check-draft <份>`（status 印 `--merge-drafts` 之前放）
   - 摘要 `摘要.md` → `status.mjs --summary`（初剪好了就放）
5. 第二輪直式：同一支示範口播中間裁 9:16、放大到 360×640，從頭再跑一次（固定檔在 `fixtures/example-portrait/`）。

每一步印 ✓／✖／略過與秒數；有 ✖ 停在那一輪、印最後幾行輸出，結束碼 1。測試專案跑完就清掉（`--keep` 才留），剪輯台一律關掉。

## 紀錄

- `check-log.md`：每跑一次加一行（日期、分支、commit、單元測試、各輪每個停點的結果與秒數、選項、總時間），工具寫的，不要手改。格子裡的「固定檔」＝那一段要 AI 寫的檔用 `fixtures/` 代替。
- `last-check.md`：最近一次的每一步明細（工具每次覆寫）。
- `round-0.md`～`round-4.md`、`*-check.md`、`review-r1-*.md`：10-31 以前手寫的輪次紀錄，留作歷史，不再新增；之後看 `check-log.md`。

## 固定範例檔（`fixtures/`）什麼時候要改

`fixtures/example/` 是照 `projects/example` 的講稿寫的；`fixtures/example-portrait/` 是同一份講稿的直式版。改了範例的講稿或素材、或工具的規則變嚴，一鍵檢查會在 `--map`／`--outline`／`--check-draft` 那一步 ✖（看起來是工具壞了的，先查工具）：

1. `node dev/check-all.mjs --skip-tests --keep`，它印出測試專案的路徑。
2. 在那個專案照 ✖ 的「→」改 `work/drafts/` 裡的那份，重跑同一條驗證直到通過。
3. 改好的檔複製回 `fixtures/` 的同名檔，再跑一次 `node dev/check-all.mjs`。

## 定期跑

Claude Code 可以用 `/loop 30m node dev/check-all.mjs --skip-tests` 之類的方式定期跑第 1 步；但第 3、4 步要人（或另一個 session）做，不能靠排程。
