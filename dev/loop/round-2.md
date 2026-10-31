# 第 2 輪（使用者回饋 r1：F1–F5）

輸入：`dev/loop/feedback-r1-user.md`（使用者五條回饋＋診斷）、`review-r1-{A,B,C}.md`。

## 做了什麼（各工作線）

| 線 | 主要改動 | 測試 |
|---|---|---|
| 002 | 一律先轉 CFR `work/main.mp4` 再剪（修 auto-editor 對 VFR 來源 `--cut-out` 後全黑）、`media.mjs verify-rough`、`--check` 全黑 ✖、章節角標常駐層（`chapterBadge`）、`#N@詞` 用 transcript.json 真實詞級時間、「文字對時」✖／⚠、A-01／02／03、B-11、C-01 | 142 pass |
| 003 | fx 29 單位欄、40 張 fx vars 掃描、9 支範例改 `@詞`、audit `cue-text`（含兩個誤報修正）、B-02～05、fx 27 完成標籤、整合 008 的 8 支新動畫（共 17） | 236 pass |
| 004 | B-01 完成態截圖（含 fx label）、qc final／storyboard「沒有講者小窗」✖、observe 小窗欄、B-06～10 | 37 pass |
| 005 | 審查員 A 條目、F5：合成 v2（9 顆 ×2–3 變體）＋CC0 候選（10 事件 ×3）A/B 試聽頁 v2 | 36 pass |
| 006 | C-01（`lookNextStep`）、C-02 兩行格式、C-03 門檻 6.5 %、C-04～16 | 39 pass |
| 001 | F1–F5 規則進 AGENTS.md／Skill／USAGE／SITUATIONS／REVIEW／PROMPTS；兩遍對齊訊息原文；T23／T24 新測試 | 34 pass |
| 008 | Opus 研究員 16 候選→首批 8 支規格；4 個 Opus 工人移植；003 驗收安裝 | — |

## check-all

- 2a（002／004／006 交件後）：485 pass／0 fail，全步驟 ✓（`check-all-round2a.log`）。
- 2b（全部交件後，含 17 支動畫與文件第二遍）：538 pass／0 fail，全步驟 ✓（`round-2-check.md`）

## 弱模型驗證

- MiniMax-M3 規則理解抽測：5/5（`m3-spotcheck-r2.md`）。
- Sonnet 範例重跑（從剪乾淨到成片）：（待填）

## 使用者回饋對照

| 條 | 工具 | 文件 | 範例驗證 |
|---|---|---|---|
| F1 角標常駐 | 主合成常駐層，pip／full 隱藏 | AGENTS 硬規則、SITUATIONS 列 | （待填） |
| F2 小窗消失 | main.mp4 CFR、verify-rough、✖ | rough Skill 步驟、deliver 驗收 | （待填） |
| F3 列點→動畫 | 17 支 custom、12／13／04a 次選指向動畫 | 情境判定表必填 | （待填） |
| F4 文字對時 | `@詞` 真實時間、✖／⚠ | 硬規則、綁句說明 | （待填） |
| F5 音效 | A/B v2 試聽頁 | — | 等作者挑選 |

## Sonnet 重跑觀察（逐停點）

| 停點 | 工具呼叫 | 觀察 | 要改的 |
|---|---|---|---|
| ① 剪輯清單 | 12（預算 12） | whisper SIGABRT 照手冊加 `GGML_METAL_BF16_DISABLE=1` 一次過；只找到 1 段 NG，正確。把它標成「待確認」是因為 ng-snap 對齊後終點從 2:05.64 延到 2:08.37，它怕剪到後一次；實際是「第一次＋2.8 秒停頓」，後一次 2:08.37 才開口。判斷保守但沒猜，合規。 | 002（P2）：ng-snap 的「對齊停頓後」欄加一句「終點落在後一次開口（2:08.37）之前的停頓末端，後一次完整保留」，弱模型就不會誤標待確認。 |
| 初剪→② | 13 | verify-rough ✓（沒有黑畫面，F2 修好）；29 個剪接點、字幕 72 則、snap-srt 只跑一次；look 略過瘦臉（臉寬 43 px < 60 px，640×360 的範例素材本來就小）；倍率表與建議 1.15 正確。`qc.mjs framing --cards` 失敗：示意卡 c1 的 key 被新的「文字對時」✖ 擋（四字子串「在這個位」碰巧對到 #1）。Sonnet 沒有去改示意卡、沒有猜，停下來報。 | 004＋002（P1）：示意 build 關掉文字對時（`textSync:false`）、示意 ⚠ 靜音；中文子串門檻 2 字→3 字。 |
| ②→③ 分鏡表 | 69（預算 55；含派 8 個子代理做動畫） | **13 段裡 8 段情境動畫**（第 1 輪是追問後才 3 段）：x-timeline×2、x-callout、x-architecture 改、x-branch 改、x-process×2 改、x-fix，全部子母畫面有小窗；情境判定表每段有「為什麼不是動畫」；`--check` 0 ✖、文字對時 0 ✖、沒有畫面的區間「無」；audit 0 ✖／5 ⚠ 有理由；主動拿掉兩顆音效避開密度 ⚠；唯一退字卡的 s05 說明了原因（x-ring 需 8.9 s、段只有 5.1 s）並交使用者決定。截圖拼圖：scratchpad `fb/trial2-storyboard.jpg`。 | 004（P2）：被下一段提早蓋住的段（s03 被 x01 在 17.83 蓋住，s03 到 18.33），完成態截圖落在 key 揭開前（圖上 key 空白）→ 完成態要取「key 揭開完成」與「被蓋住前」兩者中較早但 key 已揭開的時間；揭不開就標 ⚠。預算：②→③ 55 次對有 8 段動畫的片偏緊，但派子代理後主代理本身 < 55，可維持。 |
| ③→④ Studio | 13（預算 30） | 六項決定全部照做：s05 改 15 金句（`--check` 報蓋到講者框 42% → 自己用 css 移到左側，看圖確認）、outro 寫好（build 印「bgm-outro 從 2:30.00 起播 3.3 秒」）、4 段 02 章節角標（章名取講稿 ### 標題）、c1／c2 設 sfx null 避開密度。我截圖驗證：0:35 疊加段右上角有「01 錄完要檢查」、2:12 有「03 自製錄影工具」＋金句在左側（**F1 ✓**）；0:25、1:20、2:31 子母畫面小窗都在（**F2 ✓**）；0:17.6 s03 的 key 已揭開（**F4 ✓**）。它正確指出角標在子母畫面會淡出所以只有疊加段看得到，是設計行為。 | 無。（c1–c4 的 02 段起點都落在子母畫面段裡，02 段本身被蓋住看不到，只靠常駐層——可考慮 002 讓 `--check` 提示「02 段整段被不透明段蓋住，只當章節起點用」P3） |
| ④→交付 | 10（預算 12） | 測試片段 4 s 有影音；第一次 `nohup` render 被取消（render_cancelled_parent_exited），改用工具的背景模式成功（1:39）；final.mp4 1920×1080、30 fps、153.30 s；**qc final 全 ✔**（響度 −14.0 LUFS／−2.4 dBTP、沒有凍結、子母畫面段都有小窗、沒有黑畫面、沒有無聲）；observe 報 1 個靜止 ⚠（1:18–1:28 在 x05 內，口播在講新內容）並交使用者決定；5 個 `--check` ⚠、5 個 audit ⚠ 逐項說明。驗收截圖：`projects/範例/成片/驗收截圖/qc-sheet.jpg`。 | 003（P2）：audit 對 custom 段加「口播進行中畫面靜止 > 6 s」⚠，建議加一拍或拆段（x05 一段綁 12 句、27 s，站與站之間空太久）。001（P2）：USAGE 2.7／deliver Skill 寫明背景 render 用工具自己的背景模式，不要 `nohup`（子代理退出會被取消）。 |

## 第 2 輪結論

- 五條回饋：F1 角標常駐 ✓（成片 0:35、2:12 看得到，子母畫面時隱藏）；F2 小窗 ✓（qc final「子母畫面段都有講者小窗」、verify-rough 無黑）；F3 動畫 ✓（13 段 8 段動畫，未經追問）；F4 文字對時 ✓（`--check` 0 ✖；s03 的 key 自己綁到 `#9@時間的免`）；F5 音效 → A/B v2 試聽頁等作者挑選。
- 弱模型：Sonnet 全程四個停點格式正確、沒有自己算、拿不準就問；MiniMax-M3 規則理解 5/5。
- check-all：2b 538 pass／0 fail；2c（004 完成態、002 textSync／fixture 後）545 pass／0 fail，全步驟 ✓（`round-2-check.md`）。
- 剩餘 P2／P3：004 完成態 ⚠ 已做；003 靜止 ⚠、001 render 背景模式說明、002 02 段被蓋住提示（P3）、編輯台 resolveTime 詞級時間（002 tasks）、Windows A-13 重試未測。
- 收尾：003 加 audit `static` ⚠（custom 段 > 6 s 沒有任何動畫且有口播）；範例的 x05 沒被抓到（每 ≤ 4.9 s 有站點亮，但面積小，observe 仍判靜止）→ P3：static 規則加「變化面積門檻」。001 統一背景 render 為 `HYPERFRAMES_RENDER_DETACHED=1`（render --help 沒有背景參數；來源是 hyperframes-cli Skill 與原始碼）。
