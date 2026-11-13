# 子代理分工（主代理要派工時才讀）

有能派子代理的工具就用；沒有才自己照那支 Skill 一個一個做。派工訊息工具會印在「→ 派工：」下面，一行一則，照抄。

| 工作 | 什麼時候分 | 子代理照哪一份做 | 子代理只能寫 |
|---|---|---|---|
| 素材盤點 | 每支錄影、每批圖片一個 | `auto-edit-screen` 步驟 1 | `work/media/notes/<檔名>.json`、`work/reports/<檔名>.md` |
| 分章（語意地圖、草稿） | `--scaffold` 切成 2 份以上，兩回合；全片校正是主代理做 | `.agents/skills/auto-edit-storyboard/references/chapter-worker.md` | `work/drafts/<份>.map.md`、`<份>.outline.md`、`<份>.json`、`work/reports/<份>.md` |
| 內容設計動畫 | 停點 ③ 勾了的段，每段一個（寫鏡位腳本、做動畫、要新畫的物件都是同一個） | `.agents/skills/auto-edit-motion/references/design.md` | `work/designs/<段>.md`、`compositions/x-design-<段>.html`、`compositions/components/`（registry 裝的）、`illus-local/` 自己新畫的（一段最多 1 個，`media.mjs illus-lint` 0 個 ✖ 才用）、`work/reports/<段>.md` |
| 新畫線稿元件 | 我另外要求畫可以重複用的元件時，每個元件一個 | `.agents/skills/auto-edit-motion/references/illus-worker.md` | `illus-local/<名稱>.svg`、`work/reports/illus-<名稱>.md` |
| 錄影的運鏡與標註 | 2 支以上 | `auto-edit-screen` 步驟 2–3 | `work/media/frames/`、`work/reports/<檔名>.md`，結果回報給主代理寫草稿 |
| 手改模板動畫 | 修改單、我指定模板做不到的改動 | `.agents/skills/auto-edit-motion/references/worker-brief.md` | 那一支 `compositions/<模板>-<段>.html`、`work/reports/<段>.md` |

子代理可以跑的指令只有：`build.mjs --map`、`--outline`、`--check-draft`（自己那份）、`--spec`、`--icons`、`--words`、`--design-canvas <自己的段>`，`audit.mjs --only <自己的段> --shots --sheet`，`media.mjs frame`、`media.mjs illus-lint`、`media.mjs illus-show`，設計師另外可以跑 `npx hyperframes catalog`、`npx hyperframes add`（在子殼裡）。合併、產生分鏡表、定稿、開剪輯台、render 都是主代理的事。別段有 ✖ 不影響 `--only`。

一次最多派幾個照工具印的數字（預設 10 個）；我說「子代理一次派 N 個」「只能開 N 個」時跑 `node shared/template/tools/status.mjs --agents <N>`（1–16）。平台實際開不了那麼多時，照開得了的數量分批，並在回報裡建議我把上限改成多少。
