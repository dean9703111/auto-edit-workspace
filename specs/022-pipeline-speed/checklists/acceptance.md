# 驗收清單：022 pipeline-speed

**日期**：2026-11-09　**對照**：`spec.md`、`tasks.md`　**範例複本**：`scratchpad/us4-011709`（US4）、`scratchpad/sk-012128`（US1、US2）、`scratchpad/bench-src`（基準測試）；原專案 `projects/example` 沒動。

✅＝有證據符合；⚠＝符合但有但書；❌＝沒達到。

## 全部測試（SC-010）

| 項目 | 證據 | 結果 |
|---|---|---|
| `node --test dev/tests/*.test.mjs` | tests 1251、pass 1249、fail 0、skipped 2（`alltests4.log`，540 s） | ✅ |
| `node setup/install-skills.mjs` | 「9 支 × 2 個位置，新裝 0、更新 6、沒變 12」 | ✅ |

## US4 修改動畫走預覽（FR-201～204、SC-011～013）

| 項目 | 證據 | 結果 |
|---|---|---|
| FR-201 版本存到動畫檔 | 修好前 `d0101/v1/.meta.json` 的 `files: []`；修好後 v3 `files`＝`compositions/x-design-d0101.html`、`../designs/d0101.md`；測試「022 修改動畫走預覽…」（design、template 段都有 html） | ✅ |
| SC-011 只改 html 也認得 | 只改「收工驗收→收工檢查」→ `finish` 5.33 s 印「版本：d0101 v3 → v4」，不用 `--no-change`；v4/ 有 `x-design-d0101.html`（含新字）、`鏡位腳本.md`、`預覽.jpg` | ✅ |
| FR-202／SC-012 改版不 render | `begin` 0.09 s、`new` 0.09 s（以前 build＋render 一段約 25 s 起）、`accept` 0.09 s、`finish` 5.19–5.33 s、`use` 0.09 s；`work/versions/` 底下 mp4 0 個、render 行程 0；提案寫「現在的樣子：[v4/預覽.jpg]…；會動的樣子在完成影片預覽（剪輯台）看 d0101 那段」；測試改成「022：save、new、use、存進已確認的提案都只存檔不 render」 | ✅ |
| FR-203／SC-013 拍改了不卡 | 只改 html 的拍 → audit ✖「P.at('#41@停止錄影') 不在分鏡表」（改前設計師在這裡卡住）；改 `work/designs/d0101.md` 那一拍 → audit 照 designs 對；`finish` 印「d0101：work/designs/d0101.md 的動畫分鏡寫回 work/storyboard.md 那一節」，storyboard.md 第 223 行變新拍；測試 `pickBeatSheet`、`syncDesignSheet` | ✅ |
| `use` 還原 | 「x-design-d0101.html、d0101.md、storyboard.md 那一節都換成 v3 的」，html、鏡位腳本內容都回到 v3 | ✅ |
| FR-204 文件 | `revise.md` 沒有 `finish --preview`；`worker-brief.md`、`editor-requests.md`、`design-build.md`、`feedback-round.md`、`auto-edit-motion` 退路表照改；docs、skills 測試 32 個通過 | ✅ |

## US1 時間成本看得到（FR-101～104、SC-008、SC-009）

| 項目 | 證據 | 結果 |
|---|---|---|
| FR-101 預估欄 | 分鏡表候選表表頭 `\| 段 \| 時間碼 \| 現在用 \| 構想 \| 為什麼值得設計 \| 預估 \| 要不要 ☐ \|`，每列「12 分鐘」 | ✅ |
| FR-102 預設勾選 | 測試「022 預設勾選」：10 段候選勾 8 段（24 分鐘），各章輪流、同章長的先；`shared/style.md`「內容設計動畫」寫 12／4／30 | ✅ |
| FR-103 回報行 | 「內容設計動畫候選 5 段，預設全勾 5 段（預估 24 分鐘，4 段同時做）」 | ✅ |
| SC-008 說「可以」就做 | `--apply-storyboard --said 可以`（0.82 s）→ x01、x02、x05、x06、x07 改成內容設計動畫，印派工（先寫腳本接著做動畫） | ✅ |
| FR-104 `--design-status` | 測試三種狀態＋「⚠ 超過 20 分鐘沒進度」＋重派訊息；在複本上印出 d0101、d0102 的狀態 | ✅ |
| SC-009 預覽不 render | `--review` 只有 `flags.prerender` 才叫 `deliver.mjs --prerender`（`lib/flow.mjs`）；`finish` 測試「預設不在背景先 render」 | ✅ |

## US2 模型只做判斷（FR-105～108、SC-005、SC-007）

| 項目 | 證據 | 結果 |
|---|---|---|
| SC-005 骨架格子 | 同一份大綱：改前 143 格 → 96 格（−33%，目標 ≤ 114）；31 格時間寫 auto、16 格 why 預設模板用途 | ✅ |
| FR-105 auto 補時間 | MiniMax 填好的草稿把 31 格改成 auto：工具補 16 格，8 格和模型挑的一樣，其餘對到卡上的字講出來的位置（和 build 的文字對時同一個標準）；對不到的 15 格一次列出、寫明要落在哪兩格之間；模擬模型照填後結果和原稿一樣（0 ✖、12 ⚠，自動修 3–4 處） | ⚠ 第一版放寬比對時 1/3 差 2–5 秒、兩拍撞在同一詞，已收緊；改寫過的卡字仍要模型寫，可能多一輪檢查 |
| FR-106 why 預設 | 骨架 `story.why`＝寫法.md 那一條的用途（例「講解講到一句必須記住的重點」） | ✅ |
| FR-107 中文圖示 | 測試：「電腦」→ laptop，印「圖示「電腦」→ laptop」；對不到的照舊交給 iconHint | ✅ |
| FR-108 合併接分鏡表 | `--merge-drafts --force`：合併＋產生分鏡表 13.3 s，最後印停點 ③ 那一行 | ✅ |
| SC-007 工具時間 | `--outline` 0.09 s（≤ 3 s）；合併＋分鏡表 13.3 s（≤ 60 s） | ✅ |
| FR-006 補修 fx | 驗收時發現 `--outline` 對 `fx 01`、`fx 29` 都 ✖「不認得模板」→ 照「vars：」組骨架；測試「022 --outline 認得字卡動態」 | ✅（新發現、已修） |

## US3 基準測試（FR-109、SC-001～004、SC-006）

`node dev/bench/draft-bench.mjs --project scratchpad/bench-src --runs 3`（MiniMax-M3.1-Flash 純文字模式、每次上限 4 萬 token、同時 3 個；範例 ch01，70 句）。結果檔 `scratchpad/bench-result-try2.json`、`bench-result-batch.json`。

| 寫法 | 產出 | 模型秒數 | 輸出 token | ✖ | ⚠ | 段數 | 模板動畫比例 | 候選比例 | 相鄰同模板 |
|---|---|---|---|---|---|---|---|---|---|
| 一次寫整份 | 0/3 | — | — | — | — | — | — | — | — |
| 大綱 → 骨架（一次填整份） | 2/3 | 350 | 6.4 萬 | 0 | 4 | 14.5 | 0.68 | 0.36 | 0 |
| 大綱 → 骨架（每批填 6 段） | 3/3 | 568 | 12.5 萬 | 1 | 8 | 19 | 0.69 | 0.35 | 0 |

- 一次寫整份沒產出的原因：1 次 179 秒把 4 萬 token 全花在思考；2 次單一請求超過 300 秒被伺服器切斷（`--timeout 900` 照樣在 302 秒斷，`--timeout 5` 會在 5 秒斷，所以是伺服器端上限）。
- 兩步式沒產出的 1 次：填骨架 4 萬 token 全花在思考。填骨架是剩下最大的一塊（161–272 秒、3.5–4 萬 token）；分批填每批照樣想 1.3–3.7 萬 token，總時間反而多 1.6 倍，所以文件維持一次填整份（分批留在基準測試 `--fill-batch` 給作者比較）。
- 第一次跑（`bench-result-try1.json`）是腳本的錯：mmx 預設 300 秒逾時，已加 `--timeout 900`，不算數。

| SC | 目標 | 量到 | 結果 |
|---|---|---|---|
| SC-001 兩步式每次都有可檢查的草稿 | 3／3（對照一次寫整份） | 一次填整份 2／3、分批 3／3；一次寫整份 0／3 | ⚠ 比一次寫整份好很多，但一次填整份沒到 3／3；分批到了，代價是時間 |
| SC-002 模板動畫比例 | 兩步式 ≥ 50%，高於一次寫整份 | 0.68（一次寫整份這次沒產出；上一輪成功那次 3／16） | ✅ |
| SC-003 候選比例 | 20–40% | 0.36（分批 0.35） | ✅ |
| SC-004 相鄰同模板 | 0 處 | 中位數 0（第一次跑有 1 次模型沒照 ⚠ 改） | ✅ |
| SC-006 填骨架後 ✖ | 中位數 ≤ 3 | 0（分批 1） | ✅ |
| auto 實際用法 | — | 兩次成功：一次模型自己全寫 `#N@詞`（23 格），一次留 10 格 auto、工具全補上 | — |

## 沒做到、要作者決定的

- SC-001：MiniMax 純文字模式一次填整份骨架有 1／3 次撞到 4 萬 token 上限。可以選「分批填」（穩、慢 1.6 倍），或在 MiniMax Code 調思考強度（`defaultModelThinking.effort` 是全域設定，要作者同意才改）。
- 代理式完整執行（MiniMax Code 裡跑整條流程）要作者在 MiniMax Code 裡跑；基準測試是純文字模擬。
