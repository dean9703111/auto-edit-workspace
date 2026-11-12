# 026 文件瘦身、分層，工具把事實算好

來源：作者 2026-11-12 的問題「MiniMax 處理 subagent 每個步驟產出的文件是否太長、有多餘資訊干擾判斷」，以及接著給的方向：

- 「希望 AI 有一定的靈活性，文件希望明確但不要有太多無關資訊」
- 「工具要有通用性，不需要聚焦在既有的 SVG，那只是剛好從範例取出的資源」
- 「文件要有層次，避免不必要的資訊讀取造成額度浪費與判斷誤會」「可以使用 ref 這種技巧」
- 「hyperframes skill 是在設計動畫、判斷要重畫時使用的」
- 「主代理讀的 SKILL.md 和 AGENTS.md 也照同樣原則瘦身」
- 「仔細思考，讓專案跑每個步驟時都有好的結果」

## 從執行紀錄看到的（`~/.minimax/v2/sqlite/runtime-state.sqlite`，11-11、11-12 兩輪）

- 一個設計動畫子代理動手前要讀約 2.4 萬字；一段讀 6.6–11.6 萬字、思考 13–25 萬字、17–27 分鐘。
- 思考主要花在：(1) 文件寫了秒數規則（1.5／2.5／3 秒），短的段排不進去，就心算、再去翻 audit 原始碼；(2) 禁令和需求打架（不准看別的檔，但缺它要的資訊）；(3) 數自己的工具呼叫次數；(4) 重派時畫布檔被主代理搬走，文件沒有退路。
- brief 六成是整份視覺語言，含「其他段的方向」。
- 分鏡階段：`--map`、`--spec` 印了時間下限，主代理就先查 37 支模板、整份讀 4.6 萬字的 `寫法.md`、手算每段放不放得下；`共用.md` 一半是它自己說不用讀的對照表。

## 原則

1. **硬限制交給工具量；工具把「這一段」的事實算好。** 工具會檢查的規則不寫成文件裡要先算的通則。
2. **分層**：每次都要的放核心；用到才需要的放 ref，核心只留一行指過去。每個代理、每次開工都會讀的 AGENTS.md 只留規則和路由。
3. **通用**：畫面元素預設自己畫（HTML／CSS／inline SVG）；怎麼畫得好是 `hyperframes` skill 的通用知識；現成的線稿元件只是其中一種可選資源。
4. **判斷留給模型**：文件寫目標、格式、判準和一個範例；和工具訊息不一樣的判斷寫在退路表，工具自己會說的不重抄。
5. 子代理不數工具呼叫；卡住的判準是「同一個 ✖ 改兩次還在」。

## 做了什麼

### 內容設計動畫（設計師子代理）

| 項目 | 落點 |
|---|---|
| 兩份說明併成一份核心＋一份 ref（14,300 字 → 5,400＋1,600）。核心開頭一張表說四層資料各在哪 | `.agents/skills/auto-edit-motion/references/design.md`、`design-kit.md`（刪 `design-script.md`、`design-build.md`） |
| `hyperframes` skill 分步引用：想畫面讀 `types/explainer.md`（數字再讀 `types/data.md`），做動畫讀 `motion.md`；和這個工作區重疊的部分一句話說明跳過 | `design.md` |
| brief：字幕標出每一秒講到哪（`⟨2⟩`）、段尾在句子中間會註明；「拍點」換成這一段放得下幾拍、最從容到第幾秒、最晚不能超過第幾秒（對齊 audit 的 HOLD、TAIL、淡出）；視覺語言只帶句號蓋到這一段的主題與方向 | `lib/flow.mjs` 的 `tickText`、`briefCueLines`、`beatAdvice`、`visionFor` |
| 鏡位腳本用 6 欄表頭；內容設計動畫的動態欄用自己的話寫，不查語彙表 | `lib/audit-beats.mjs` |
| `build.mjs --design-canvas <段>`：畫布不見了補一份；`--reset` 備份後整段重做（主代理重派時用） | `lib/flow.mjs` 的 `designCanvasCmd`、`lib/custom-fill.mjs` 匯出 `blankFor`、`auto-edit-motion` 步驟 2 |
| 派工訊息只指到 `design.md` | `lib/flow.mjs`、`status.mjs`、`lib/deliver.mjs` |

### 分章寫分鏡

| 項目 | 落點 |
|---|---|
| `寫法.md` 收成工具用的 `.spec.md`（不列在分鏡素材、訊息不再提；舊專案的 `寫法.md` 照樣讀得到） | `lib/flow.mjs` 的 `SPEC_FILE` |
| `--map`：放不下的模板不印「≥ N 秒」，改由工具算好「併前一行／後一行／前後兩行就放得下」；放不下全部項目的標 ＊ | `lib/semantic-map.mjs` |
| `--spec` 不印時間下限（工具照樣用它算；`--outline` 會印每段的拍可以綁哪幾句） | `lib/flow.mjs` 的 `specShown` |
| `共用.md` 拿掉情境對照表、四題、和 `chapter-worker.md` 重複的做法（範例專案 9,700 字 → 3,800） | `lib/scaffold.mjs` 的 `renderCommon` |
| `chapter-worker.md` 重寫（5,100 字 → 2,500）：做法在這份、格式在 `共用.md` | `.agents/skills/auto-edit-storyboard/references/chapter-worker.md` |
| 視覺語言的主題和各段方向要寫句號（工具才篩得出和某一段有關的） | `references/director.md` |

### 主代理

| 項目 | 落點 |
|---|---|
| AGENTS.md 10,300 字 → 5,300：子代理分工表移到 ref；停點的逐字原文只留在那支 Skill 和工具印的訊息；規則 1 的例外清單移到 `auto-edit-style`；「讀文件要分層」寫成明文 | `AGENTS.md`、`.agents/skills/auto-edit-longform/references/subagents.md` |
| `auto-edit-storyboard` 9,400 → 7,500：拿掉「硬規則」區塊（工具會檢查的事實）、步驟 5 改成編號清單、和工具訊息不同的判斷移到退路表 | `SKILL.md` |
| `auto-edit-rough`、`auto-edit-deliver`、`auto-edit-review`、`auto-edit-motion`：同樣整理；`auto-edit-style` 換背景的細節移到 `references/background.md` | 各 `SKILL.md` |
| 骨架測試放寬：「常見錯誤」不再每步必填；Skill 沒抄的數字不比（數字只留在 style.md） | `dev/tests/docs.test.mjs` |

## 實測（測試專案＝範例專案的複本，只給工具印的那一行派工訊息）

- 設計動畫 3 段（弱模型）：每段約 3–4 分鐘、15–26 次工具呼叫、audit 0 個 ✖。拼圖看過：s0116 自己畫沙漏＋大字「1 小時」；s0114 筆電開始鍵＋兩支手機同時亮 REC；s0105 手機＋兩張問題卡（偏簡單，連接線有交叉）。
- 實測抓到、已補進文件的：`data-duration` 不用改（設計師自己改了）；最重要的詞要做成大字；看拼圖的判準寫具體。
- MiniMax-M3 只測到「寫鏡位腳本」（代理本體沒有無人值守指令）：舊文件排 4–7 拍、8 欄、要求新畫 SVG；新文件 2–5 拍、6 欄，短的段把那一拍綁在關鍵詞上。這個介面不回傳思考量，沒辦法比較思考字數。

## 規則留著、由工具把關（作者 2026-11-12：「我期待的是在規則內做出最好選擇」）

第一版為了瘦身拿掉了四條規則，作者問會不會破版、更耗時；查證後接回來，改成工具把關，文件不因此變長：

| 規則 | 第一版 | 現在 |
|---|---|---|
| 新畫的圖形要和全片同一套 | 設計師隨意畫在動畫檔裡 | 簡單的形狀和線直接畫；有外形的物件先用現成的，沒有才新畫成 `illus-local/*.svg`、過 `illus-lint`、一段最多一個（`design-kit.md`「新畫一個物件」）。audit 新增 ⚠「顏色寫死」「旋轉了非 90 度的角度」（`lib/audit-illus.mjs` 的 `designColorFindings`、`designRotateFindings`） |
| 動態欄只用語彙表的名稱 | 自由描述（實測出現「落下」「瞬間點亮」） | 接回 audit 的 ✖；語彙表精簡成 7 列放在 `design.md` |
| 工具呼叫有上限 | 子代理不數、沒有上限 | 上限由工具數：同一段驗收第 6 次還有 ✖（`audit.mjs` 的 `AUDIT_TRY_MAX`）、同一份草稿或地圖檢查第 5 次還有 ✖（`lib/flow.mjs` 的 `CHECK_TRY_MAX`）就印「→ 停手」；重派時歸零 |
| 停點最後兩行的逐字原文 | 只留在 Skill | 放回 AGENTS.md（六個工具也都會印） |

接回規則後再實測兩段（弱模型）：s0116 的沙漏照線稿規格畫成 `illus-local/hourglass.svg`、過檢查；s0105 改用現成的腳架元件；動態欄都在語彙表內；各約 3–3.5 分鐘、0 個 ✖。

## 模板優先（作者 2026-11-12：「分鏡確認後就直接合成；不滿意再做動畫的設計，否則一開始都是套用模板」）

- 分鏡表的內容設計動畫候選**預設都不勾**（`lib/storyboard-gen.mjs` 的 `designPlan`）：說「可以」就全部套模板合成、到停點 ④。想一開始就專門設計的段才勾。
- `--review` 到停點 ④ 時多印一句「還可以專門設計的段」（現在是模板的候選），看完預覽不滿意再說「<段> 重新設計」。
- 模板驗收工具加 `--stress`（`dev/tools/custom-check.mjs`）：每個文字欄位填到字數上限實際排一次，量會不會破版。

## 還沒做

- 模板庫補齊（作者要的「各種情境都有」）：見本檔最後的候選清單，等作者挑。
- 字卡（`scenes/` 01–15）和字卡動態（fx）還沒有「最長文字」的壓力測試；`custom-check --stress` 只涵蓋模板動畫。
- 短的地圖行（4–6 秒）大多沒有放得下的模板動畫，只能併行或用字卡動態。

- 還沒用 MiniMax 代理本體整支跑一次（要作者在 MiniMax Code 裡跑；跑之前先 `node setup/install-skills.mjs` 更新裝好的複本）。
- `auto-edit-screen`、`auto-edit-setup` 的 SKILL.md、`worker-brief.md`、`illus-worker.md`、`bg-worker.md` 只改了連動的句子。
- 模板庫（`x-scene`、SITUATIONS.md 的例句）仍以手機、腳架、電腦這組範例物件為主；這次只讓內容設計動畫不依賴它。
- audit「主角太小」只量現成線稿元件；自己畫的圖形只受「畫面太空」檢查（要通用地認出「主角」會誤判由小零件組成的圖）。
- `--map` 的輸出每一行仍重複模板說明（之前盲測過：每個選項帶說明，挑中的模板種類才多），這次只把重複的提示換成記號。

## 模板填資料的把關（作者：「最重要的是填寫時確認字的大小、每個位置都有」）

`node dev/tools/custom-check.mjs --all --stress`：每支模板動畫多排一段「每個文字欄位都填到字數上限」，實際 build、audit。

- 第一次跑：42 支裡 5 支照上限填就破版（字被裁掉或撐出框）：`x-metaphor`、`x-news`、`x-ring-facets`、`x-terminal`、`x-trend`。原因都一樣：幾格排在同一行的「合計上限」只寫在欄位說明的文字裡，填資料時不檢查，要到 build 之後 audit 才發現。
- 修法：合計上限改成規格（`fill.json` 的 `lines`），`--check`／`--check-draft` 在填的時候就 ✖ 並說怎麼縮。`lines` 多了兩種寫法：`weights`（字級不同的幾格各佔多寬）、`list`（清單每一項各算一次）。`x-news` 的漲幅上限 5 → 4；`x-metaphor` 限制句合計 10 → 9（10 個全形字會超出 12px）。
- 修完重跑：這 5 支＋`x-prompt` 都通過。

## 模板庫可以補的（HyperFrames registry 448 項裡，和目前 42 支模板動畫沒有重疊的情境）

| 情境 | 目前有的 | registry 可以改的 | 我的建議 |
|---|---|---|---|
| 地點、路線、各地的數字 | 沒有 | `world-map`、`us-map-flow`、`nyc-paris-flight` | 做一支「路線／地點」：講到去哪裡、從哪到哪 |
| 轉述留言、貼文 | 只有 `x-news`（新聞、公告） | `yt-comment-card`、`x-post`、`reddit-post`、`thread-message-stack` | 做一支「留言卡」：觀眾留言、網友怎麼說，教學片很常用 |
| 程式碼改了哪裡 | `x-terminal`、`x-terminal-code` | `code-diff`、`code-highlight`、`code-scroll` | 做一支「改前改後的程式」：這個頻道講工程，用得到 |
| 一般的長條、折線圖 | `x-trend`、`x-trend-blocks`、`x-numbers`、`x-ring` | `data-chart`、`bar-chart-race`、`mk-line-graph`、`chart-story` | 做一支「排名長條」：幾個東西比大小 |
| 通知一個一個跳出來 | `x-ui-mock-tidy`（亂 → 整齊） | `notification-stack`、`notification-cascade`、`macos-notification` | 可做可不做：和 `x-ui-mock-tidy` 有點重疊 |
| 手繪感的流程、圈重點 | `x-process` 系列（線稿風） | `hw-pipeline`、`hw-callout-circle`、`marker-checklist-card` | 先不做：和全片的線稿風格不同套 |
| 短句（4–6 秒）用的模板動畫 | 幾乎都要 8 秒以上；短的行只能併行或用字卡動態 | — | 最值得補：現有幾支常用模板各出一個「一兩拍的短版」（範例專案 25 行裡有 5 行太短、沒有模板放得下） |

每加一支都要做：模板檔、`fill.json`（欄位、上限、`lines`、範例）、SITUATIONS.md 一列、情境庫預覽、`custom-check --stress` 通過。等作者挑要做哪幾支。
