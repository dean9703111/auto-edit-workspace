# Tasks：022 pipeline-speed

格式：`- [ ] T### 做什麼 → 驗：怎麼確認`。做完打勾。

## 前半（已做，這輪一起驗）

- [x] T001 草稿只標候選、③ 勾選表、`--apply-storyboard` 換成內容設計動畫（FR-001、002）→ 驗：`storyboard-gen.test.mjs`
- [x] T002 候選三成目標與上限（FR-003）→ 驗：`scaffold.test.mjs` designTargetOf／designCap
- [x] T003 相鄰同模板 ⚠（FR-004）→ 驗：`plan.test.mjs`
- [x] T004 `--review`／`finish` 不 prerender（FR-005）→ 驗：`feedback-round.test.mjs`
- [x] T005 `--outline`、拍綁句提示、骨架（FR-006）→ 驗：`scaffold.test.mjs` 端到端
- [x] T006 `--check-draft` 未填 ✖、`--spec a,b`、圖示提示（FR-007～009）→ 驗：`scaffold.test.mjs`
- [x] T007 剪輯台播放錯誤分類（FR-010）→ 驗：手動＋`editor` 測試
- [x] T008 派工文件兩步式（FR-011）→ 驗：`skills.test.mjs`、`docs` 測試

## US4 修改動畫走預覽（P1）

- [x] T201 `snapshotOf` 收動畫 html、svg、designs md（FR-201）→ 驗：versions.test 新測試「design／template 段存 html」
- [x] T202 `new`／`use`／已確認提案預設不 render；`預覽.jpg` 用 audit 拼圖（FR-202）→ 驗：versions.test（無 render 呼叫、預覽.jpg 存在）、feedback-round.test
- [x] T203 audit 用較新的 designs 分鏡表；finish 寫回 storyboard（FR-203）→ 驗：audit 測試＋versions 測試
- [x] T204 修改單與改版文件（FR-204）→ 驗：grep 無 `finish --preview`；skills 測試
- [x] T205 範例複本端到端 SC-011～013 → 驗：驗收清單貼輸出與秒數

## US1 時間成本看得到（P1）

- [x] T101 常數寫進 `shared/style.md`（FR-102）→ 驗：docs 測試
- [x] T102 候選表「預估」欄與預設勾選（FR-101、102）→ 驗：storyboard-gen.test 新測試（輪流、預算 ≤ 30）
- [x] T103 storyboard 回報行（FR-103）→ 驗：scaffold／flow 測試輸出
- [x] T104 `--design-status`（FR-104）→ 驗：新測試（三種狀態、重派訊息）

## US2 模型只做判斷（P1）

- [x] T111 骨架 `at: auto`、`why` 預設（FR-105、106）→ 驗：scaffold.test（骨架格子數 ≤ 114／143）
- [x] T112 `resolveAuto` 補 `#N@詞`、補不到 ✖（FR-105）→ 驗：scaffold.test
- [x] T113 中文圖示自動換英文（FR-107）→ 驗：scaffold.test
- [x] T114 合併接著產生分鏡表（FR-108）→ 驗：scaffold.test 端到端有停點 ③
- [x] T115 文件（FR-110）→ 驗：docs、skills 測試

## US3 基準測試（P2）

- [x] T121 `dev/bench/draft-bench.mjs`（FR-109）→ 驗：`--runs 1 --dry` 跑得完；正式 `--runs 3` 出 JSON
- [x] T122 跑基準、結果寫進驗收清單（SC-001～006）

## 收尾

- [x] T901 全部測試（SC-010）
- [x] T902 `node setup/install-skills.mjs`
- [x] T903 `checklists/acceptance.md` 每個 FR／SC 一列證據
