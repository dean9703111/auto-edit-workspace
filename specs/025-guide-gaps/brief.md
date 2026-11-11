# 025 指南技法補齊

來源：作者 2026-11-10 給的網頁 madebypan.com/ai-video-guide（〈開始讓你的 Claude 幫你剪片〉）。讀完全文、抽格看過頁面上 15 支示範短片，對照工作區現況後列出缺口；作者用決定單選了要做的項目（人物去背三招都做、九項小功能都做、全片配樂與 Breeze ASR 不做、文案 README 和官網都加）。

## 做了什麼

| # | 項目 | 落點 |
|---|---|---|
| 1 | 文案：「剪得出來之後，怎麼剪得像你」五層對照 | `README.md`、`dev/site/index.html`（新的一節 04，後面的節號順延）、`dev/site/llms.txt`、`PROMPTS.md` 5b |
| 2 | 漲跌標（選填 `delta`） | `custom/x-before-after`（`x-numbers` 講的是超量再處理掉多少，沒有前後兩個可比的數字，沒加） |
| 3 | 收據列印 | 新模板 `custom/x-receipt`（3–5 列＋合計） |
| 4 | 同字異材快切 | 新模板 `custom/x-wordcut`；一集最多 1 次（`lib/plan.mjs` 的 `TEMPLATE_MAX`） |
| 5 | 重點詞浮標 | 新模板 `custom/x-tags`（第一支 `layout: "overlay"` 的模板動畫）；build 把講者框注入 `window.__cues.speaker`，`P.region('speaker')` 讀 |
| 6 | 插圖貼紙 | 新動作 `P.stick`／`P.peel`、`.sc-sticker`、語彙「貼上」「撕走」（44 → 46）；`x-scene` 的 slots 加 `"sticker": true`、最後一拍 `"peel": true` |
| 7 | 贅字列進剪輯清單 | `media.mjs` 的 `fillerRows`、`lib/rough-flow.mjs` 的 `cutRows`：預設不勾、不寫待確認 |
| 8 | YouTube 說明欄文字 | `lib/deliver.mjs` 的 `youtubeText`：3 個以上章節時寫 `output/youtube.txt`，用了配樂附出處 |
| 9 | 拆參考片 | `media.mjs ref`（抽格總表＋換鏡頭統計）、`.agents/skills/auto-edit-style/references/reference-video.md`（九個維度、只出報告） |
| 10 | 跨集偏好 | `status.mjs --prefs`／`--prefs-add`／`--prefs-skip`／`--prefs-drop`、`lib/prefs.mjs`、`shared/偏好.md`（不進版控）；scaffold 把「照做」的規則放進分鏡素材的共用.md；AGENTS.md 優先序、規則 1、規則 11 |
| 11 | 人物去背層 | `lib/matte.mjs`（`npx hyperframes remove-background`，模型 u2net_human_seg）、`lib/main.mjs` 的 `#matte-<段>` 圖層、填資料規格的 `"matte": true`（`"matteClip": "window"`＝去背層裁在相框開口裡）、`media.mjs matte-setup`、audit 不判壓到講者 |
| 12 | 情緒詞整面牆 | 新模板 `custom/x-wall`（牆在講者後面；一集最多 2 次） |
| 13 | 雜誌封面 | 新模板 `custom/x-magazine`（英文刊名逐字打在講者後面、左側封面標題；一集最多 1 次） |
| 14 | 破框而出 | 新模板 `custom/x-breakout`（講者先在白邊相框裡，講到那個詞相框上緣縮到下巴、頭冒出來；相框位置照講者框算；一集最多 1 次） |

順手修的：`kit/scene-motion.js` 的 `settleTail` 會把 overlay 寫在段尾的退場（`P.out(…, P.dur() - 0.3)`）往前挪，文件教的寫法其實不能用；現在段尾 0.75 秒內才開始的動作不挪。文件裡情境動畫的數量原本少算 `x-folder`，一起更正（現在 41 支）。

## 和決定單不一樣的地方

- 同字異材快切做成情境動畫 `x-wordcut`，不是第 41 張字卡動態：字卡動態是固定 40 張的收藏、每張要三種預覽影片，而且情境動畫才能綁到講到的那個詞。
- 拆參考片沒有變成第 10 支 Skill，掛在 `auto-edit-style` 底下：「9 支」寫在安裝程式、環境檢測、文件測試裡，牽動太大。
- 跨集偏好是「AI 列出來問、工具記下來」，不是勾選網頁。要做成網頁要在剪輯台加一頁。
- 人物去背用 HyperFrames 內建的 `remove-background`，沒有另外接分割模型。

## 還沒做

1. 破框而出的相框是正的，沒有歪一點（參考片是斜的）：歪的要連底片一起轉，現在的圖層做不到。
2. 情境庫的 `x-breakout` 預覽：示意講者的去背圖沒有裁在相框開口裡（預覽頁沒有 build 的裁切），手臂和桌面會露在相框外、標籤被頭擋到；完成影片裡是對的。
3. 直式：`x-tags`、`x-wall`、`x-magazine`、`x-breakout` 都只做橫式。
4. 剪輯台的完成影片預覽、`capcut.mjs` 的分層輸出還沒有針對去背層測過。
5. 去背的速度：範例專案的片段（640×360 放大到 1920×1080）每 11.5 秒的段要一分多鐘（CoreML）；一集最多用到 4 段，還沒做背景先算。

## 真模型驗收（2026-11-11）

作者同意後下載 u2net_human_seg。用 `projects/example/work/rough.mp4` 的 36 秒（複本放在暫存區，沒有動範例專案）排三段：`x-wall`、`x-magazine`、`x-breakout`，build 0 ✖，HyperFrames 截圖六格：講者都在動畫前面，手勢（舉起來的手臂）也在刊名前面，頭髮和肩膀邊緣乾淨，沒有看到底片和去背層錯開的重影；破框那段講到那個詞之後頭在相框上面。`shared/template/preview/speaker-cutout.png` 已產生，三招的情境庫預覽看得到講者在前面。

## 第二輪：全面檢視（2026-11-11，作者：「全力審視可以優化的細節」，並要求找別人的範例、考量直式短影音）

先看數據再動手：範例專案 17 段只用了 1 張字卡動態；時間軸上 AI 做事的 1 小時 40 分裡，內容設計動畫佔掉大半（這是作者定的做法，不動）。另外派三個子代理調查 GitHub、網路文章（X 的原貼文抓不到）、HyperFrames 元件庫（448 個）。

| # | 做了什麼 | 為什麼 | 落點 |
|---|---|---|---|
| 15 | 字卡動態照語意輪流推薦 | 40 張裡情境表只把句子導向約 10 張，語意地圖對串場句寫死「fx 01、03、38」，其他 30 張沒有入口 | `fx/catalog.json` 每張加 `sem`；`lib/semantic-map.mjs` 的 `fxPicker`（同一種語意每行給不同的兩張、超過 8 秒的行不推薦）；`--list` 與寫法.md 多一欄「適合的語意」 |
| 16 | 同一張字卡動態一集最多 2 次 | 不然又會集中在同幾張 | `lib/plan.mjs` 的 `FX_REPEAT_MAX`（29 數字計數不算） |
| 17 | 只做橫式的模板在直式專案擋下來 | `x-tags`、`x-wall`、`x-magazine`、`x-breakout` 照橫式的講者位置排版，直式會壞 | 規格 `"portrait": "none"`＋`portraitAlt`；`plan.mjs` ✖ 並建議替代；分鏡素材不列（沒有講者時也不列疊加模板） |
| 18 | 長片切直式短片 | 兩份調查都排第一；原本直式只收直拍素材 | `lib/shorts.mjs`、`media.mjs shorts`（列候選：頭尾落在剪接點上、不從連接詞開始）＋`--pick --name`（裁成 9:16、置中在講者身上、開成新專案）；`auto-edit-longform/references/shorts.md`（四步判準） |
| 19 | 剪接點切字檢查 | 現有驗證只看黑畫面，沒有檢查剪接點是不是切在講話中間 | `media.mjs cut-check`（聽兩側 0.06 秒的音量），`media.mjs rough` 跑完自動做、只提醒 |

### 第三輪（2026-11-11，作者：「封面圖和音效輪替都做」）

| # | 做了什麼 | 在哪 |
|---|---|---|
| 20 | 封面圖：一個標題出三種版型（a 人物跳出、b 色塊分割、c 底部標題），講者去背加白邊；橫式 1920×1080、直式 1080×1920（標題和臉在中間 3:4） | `media.mjs cover`、`lib/cover.mjs`、`auto-edit-deliver` 的 `references/cover.md` |
| 21 | 音效同類輪替：`ding`、`success`、`alert`、`impact` 各做兩個變體（同一顆升、降一個半音），build 照出現順序輪 本尊 → 變體 1 → 變體 2 | `dev/tools/make-sfx.mjs --variants`、`kit/sfx.json` 的 `variants`、`lib/audio.mjs` 的 `rotateSfx` |

我自己定的（可以推翻）：

- 音效變體沒有做新的音色，是把你選過的那一顆升降半音：音色不變、只差音高，不用重新試聽選配方。`chapter`（章節的記號）、`click`（真的滑鼠聲）、有每集上限的三顆不做。覺得半音差太明顯或太不明顯，改 `make-sfx.mjs` 的 `VARIANTS` 再跑 `--variants`。
- 剪輯台的即時預覽還是播本尊（只有完成影片和剪映素材會輪替）。
- 封面沒有自動挑表情：預設用前段的一格，同時給 8 格候選，由 AI 或你挑了再加 `--at`。
- 封面的字型、版型寫死在 `lib/cover.mjs`，顏色跟主色；沒有做成風格包的一部分。

### 調查到、判斷合適、這輪沒做的（照價值排）

1. **截圖前後擦拭比較**（HyperFrames registry 的 `before-after-wipe`）、**折線圖**（`mk-line-graph`）、**手畫圈標註**（`cursor-annotate`，給錄影段）：都是填資料型，要換成主色 token 並確認沒有停留時的漂浮。
2. **直式開場標題條**、**直式片尾具體 CTA**：直式沒有章節幕，開頭沒有定錨。
3. **世界地圖**（registry 的 `world-map`）：要把 d3、圖資搬進 `kit/` 離線化，台灣在 110m 精度只有幾個像素。

### 調查到、判斷不合適的

- 逐字跳的卡拉 OK 字幕、字幕關鍵詞變色：前者違反「一則一個完整語句、不做微動」；後者就是 013 的字幕螢光，作者試過後說不要。
- 固定每幾秒推近、底部進度條、迷因與圖庫 B-roll、全片配樂加大量音效、AI 自評爆紅分數、換成 Remotion 或 motion-canvas。

### 這輪發現、沒有處理的事

- `node_modules` 裡的 HyperFrames 是 0.9.3，`package.json` 釘的是 0.9.28（`npm ls` 印 invalid）。這次所有的驗證都是在 0.9.3 上跑的；要對齊就在根目錄 `npm install`，之後整套測試要再跑一次。
- 人物去背的速度卡在模型推論（約 5 格／秒），把片段縮到 540p 沒有變快；要更快只能同時跑幾段，還沒做。

## 驗證

- `node --test dev/tests/*.test.mjs`、`node dev/tools/custom-check.mjs --all`（結果見交付時的回報）。
- 新模板各自的完成態截圖在作者本機的 session scratchpad。
