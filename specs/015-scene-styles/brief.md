# 015 示意動畫換畫風與新情境（lemo-opuscar／shotcraft 選片）

來源：作者 2026-11-04 說 `x-scene`、`x-scene-example-rec`、`x-scene-example-outline`「真的很醜」，要從 lemo-opuscar 與 video-shotcraft 找口播適合的案例。選片頁（私人）https://claude.ai/artifact/Pvy66Ys2tFMzVGU9iY1UJo 回了 26 個「要」，並說「如果選中的已經有類似，就進行合併優化，然後要變成適合這個專案的風格」。

（shotcraft 鏡頭卡移植頁 https://claude.ai/artifact/QH83yQDapQZdqZNaCwUMd2 的決定還沒回；那條線之後用 016。）

## 診斷：現在的示意動畫為什麼醜

1. 畫法混在一起：插圖元件是「深色實心＋白描邊」（kit/illus.css 的 `--il-body` 深色），旁邊的箭頭、腳架是細線，像拼貼的圖示。
2. 沒有舞台：元件浮在白卡中間，沒有地面、桌面。
3. 沒有演出：元件只會彈出。

## 「這個專案的風格」是什麼（所有移植的共同規則）

- 顏色只用既有 token：主色 `--brand`（預設橘）、墨 `--v2-ink`、灰 `--v2-mute`、卡白 `--v2-node`、淡主色 `--v2-node-tint`、紅綠 `--sc-warn`／`--sc-good`。lemo 各風格自己的配色（藍綠象形、黑板綠、新聞黃黑）一律換成這組。
- 線稿為主：背景圖本來就是主色線稿（視窗、手機），插圖改成「白底＋墨線＋主色點綴」後同一個語言。暗色主題＝深底淺線（黑板感），同一套 token 自動切換。
- 字一律 Noto Sans TC（不引入手寫字型）；終端機與程式碼另加等寬字 JetBrains Mono（OFL）。
- 主卡（`.sc-wcard`＋主色標題列）、子母畫面小窗、綁句 `P.at('#N@詞')`、一拍一焦點、音效拍點全部照舊。
- 動作只能用 `kit/scene-motion.js` 的 `P.*`（examples.test 規定），新手法先進 kit 再給範本用。

## 定案：26 個怎麼處理

「合併」＝已經有同一件事的範本，把新手法併進去（改預設外觀或加變體檔）；「新」＝工作區沒有的情境。變體結構和原檔差很多時另開 `x-<原名>-<變體>.html`（弱模型照抄整支檔比照表改程式可靠），只差一兩行時寫在原檔的變體表。

| # | 選中 | 類似的現有 | 處理 | 落在哪 |
|---|---|---|---|---|
| 1 | 白板講解 | x-scene＋kit/illus.js | 合併 | illus.css 改線稿 token（亮＝白板、暗＝黑板）；新動作 `P.draw`（馬克筆把插圖一筆一筆畫出、筆尖看得到）；x-scene 與兩個範例重排（地面線、畫出來、標籤跟著出） |
| 2 | 象形運動圖形 | 無 | 新 | `x-crowd`（人群與數量：幾何人形一格一格出現、其中幾個換主色）；illus 新元件 `pgPerson` |
| 3 | 等距繪本 | 2 | 合併進 2 | `x-crowd-queue`（兩排人照不同速度前進，比哪個方法快） |
| 4 | 等距資訊圖 | 無 | 新 | `x-desk`（2.5D 地台：裝置立在地台上，東西沿地上的虛線走，鏡頭跟著） |
| 5 | 桌面穿梭 | 4 | 合併進 4 | `x-desk` 預設情境（手機 → 雲端 → 電腦，檔案沿線走、到站換狀態） |
| 6 | 地鐵線路圖 | x-timeline | 合併＋改預設外觀 | x-timeline 改路線圖：粗主色線、站環、站名牌、「目前位置」標記沿線滑到下一站（`P.along`）；本集大綱改用它 |
| 7 | 電路板 | x-process | 合併 | `x-process-trace`（晶片站、直角走線、一道光跑完全程） |
| 8 | 藍圖 | x-callout | 合併 | `x-callout-parts`（主體被畫出來、編號圓＋引線、右側零件表；配「藍圖」風格包更像） |
| 9 | 暗色科技發布 | x-ui-mock | 合併 | `x-ui-mock-tidy`（散落的視窗與通知，講到工具名時一鍵歸位） |
| 10 | 活體實機錄屏 | x-prompt 的「指令」變體 | 新（把指令變體搬出來） | `x-terminal`（終端機視窗：打指令、輸出逐行出現、完成） |
| 11 | 字幕新聞 | fx 29 數字計數、fx 30 快訊 | 疊加用法已有；全幕併進 12 | SITUATIONS 註明疊加用 fx 29／30 |
| 12 | 電視新聞包裝 | 無（全幕） | 新 | `x-news`（新聞條：標籤＋標題條、大數字、來源列、小走勢） |
| 13 | 數據敘事 | x-trend | 合併＋優化 | x-trend 加選用「標註」拍：參考線、區段高亮、事件標籤 |
| 14 | 數據實物化 | x-trend | 合併 | `x-trend-blocks`（長條改成一格一格疊上去的方塊） |
| 15 | 檔案燈台 | media 段 callouts／lens | 已有，優化進場 | media 段圖片 `enter: "tape"`（截圖用紙膠帶貼上） |
| 16 | 紙飛機傳訊 | x-architecture 的發光點 | 合併 | 新動作 `P.fly`；`x-architecture-send`（訊息、連結用紙飛機飛過去） |
| 17 | 對話 | x-prompt | 合併 | `x-prompt-chat`（送出 → 使用者泡泡 → AI 輸入中 → AI 回覆） |
| 18 | 手機＋功能標籤 | x-callout（中央圖示＋左右標籤） | 合併 | `x-callout-phone`（中央換成手機畫面、同心圓呼吸） |
| 19 | 概念圖串接 | x-process | 合併 | `x-process-loop`（3–4 站排成一圈、弧線箭頭、光點繞圈） |
| 20 | 概念堆疊 | x-stack | 合併 | `x-stack-podium`（層從下面翻起來疊成台座） |
| 21 | 環形圖註解 | x-ring | 合併 | `x-ring-facets`（環切成 3–5 段，講到哪個面向那段亮、旁邊編號說明） |
| 22 | 紙膠帶 | 無 | kit | 新動作 `P.tape`（給 15、x-callout-parts 的附圖用） |
| 23 | 聲紋 | x-scene-example-rec 的靜態聲紋 | kit | 新動作 `P.wave`（聲紋跟著時間起伏）；x-prompt 語音、試錄範例用 |
| 24 | AI 逐條完成 | x-checklist | 合併 | `x-checklist-ai`（每列先轉圈、講到時變勾、右邊結果字） |
| 25 | 程式碼打字 | x-prompt 打字 | 合併進 10 | `x-terminal-code`（行號、語法色 token、逐行打出） |
| 26 | 輸入膠囊 | x-prompt 提示詞框 | 合併＋改預設外觀 | x-prompt 的框改成輸入膠囊（送出鈕、可選麥克風聲紋） |

## kit 新動作（scene-motion.js，全部 seek-safe：純函式或 fromTo，亂序截圖要和照順序一樣）

| 動作 | 做什麼 | 給誰用 |
|---|---|---|
| `P.draw(sel, at, {dur, pen})` | 插圖或線條的每一筆依序畫出，馬克筆筆尖跟著線頭走，畫完筆離開；填色在描完後淡入 | x-scene 家族、x-callout-parts、x-desk |
| `P.along(sel, path, at, {dur, ease})` | 元素中心沿一條線（data-links 產生的線或自己的 path）移動 | x-timeline 目前位置、x-desk 檔案、x-crowd-queue |
| `P.fly(path, at, {dur})` | 紙飛機沿線飛（虛線尾跡），到站淡掉 | x-architecture-send、x-prompt-chat 送出 |
| `P.tape(sel, at, {rot})` | 卡片落下貼平、兩條紙膠帶啪地貼上角落 | x-callout-parts 附圖、media 段 `enter: "tape"` |
| `P.wave(sel, at, {until, amp})` | 聲紋條跟著時間起伏（固定種子，任何時間點畫面一樣） | x-prompt 語音、x-scene-example-rec |
| `P.spin(sel, at, {until})` | 載入圈等速轉 | x-checklist-ai、x-terminal |

## 分批

1. kit：illus 線稿 token、六個新動作、等寬字、scene.css 樣式、motion／illus 測試。
2. 原檔改預設外觀：x-scene＋兩個範例、x-timeline、x-prompt。
3. 變體檔：x-process-trace／loop、x-callout-phone／parts、x-checklist-ai、x-stack-podium、x-ring-facets、x-trend（標註）＋blocks、x-ui-mock-tidy、x-architecture-send、x-prompt-chat、x-terminal＋code。
4. 新情境：x-crowd＋queue、x-desk、x-news；media 段 `enter: "tape"`。
5. 文件與預覽：BEATS.md、SITUATIONS.md、USAGE-reference、CONTENTS.md、index.html ④、`build.mjs --gallery` 預覽、examples.test 表、check-all。

## 實作紀錄（2026-11-04 完成 1–5 批）

- 26 個全部落地；新增 17 支 custom（examples.test 表 37 支），整合測試 37 支排進同一個專案：--check 0 ✖ → build → audit 0 ✖ 0 ⚠ → 亂序 snapshot 一致。
- kit：scene-motion.js 七個新動作（P.draw／along／fly／tape／hinge／wave／spin）；illus.js 新元件 `pgPerson`（象形人）與 `stage`（2.5D 地台，960×180，頂面白底墨線、正面主色可疊字）→ 畫廊 22 個元件，ILLUS_BUILTIN、契約、畫廊頁一起改。
- x-news 沒有主卡（新聞包裝本身就是畫面），標籤與卡片用 `P.hinge` 翻起來；examples.test 的主卡右緣量 `#xnews-head`。
- x-desk 的地台與裝置是 2.5D 擺法、座標寫死（排版程式沒有斜投影）；鏡頭 `P.cam` 只推 `#xdsk-world`，放大 1.04、往那一站帶 0.08（再大會被主卡裁掉）。
- media 段 `enter: "tape"`：只給圖片、fit contain、橫式（直式自動改 zoom）；圖片縮小到 `TAPE.view`（200, 90, 1520×790）、底換成全幕主題背景（`.mbg--paper`，黑底規則的例外）、紙白邊、兩條膠帶在 stage 座標（跟著運鏡）；剪輯台的進場選單只有圖片多一個「紙膠帶貼上」，write.mjs 只在 enter 收 tape。
- audit 規則沒改；為了過 illus-small／padding／layout-pad，範本照規則調尺寸（例：x-callout-parts 零件列加淡主色底才算進「主體＋標籤」一組、拿掉表頭；x-process-loop 站改成橫式 300×112）。
- 11（字幕新聞）不另做：SITUATIONS 的 x-news 列寫疊加用 fx 29／fx 30。
- 坑：HyperFrames snapshot／render 跳進一段時先畫時間軸、後顯示，畫的當下那段還是 display:none（外框 0、`getCTM()` 不含 viewBox）。`P.along` 原本畫的時候才呼叫 `getCTM()`，x-desk（路的 svg 有 viewBox 位移）直接跳到完成態時檔案被推出畫面，亂序 snapshot 才抓到；改成呼叫當下量好矩陣（和 P.draw 的筆尖一樣）。新寫的 P.* 動作一律在呼叫當下量版面，畫的時候只用 progress 算。
- check-all 另抓到 auto-edit-motion 的 SKILL.md 超過 200 行：17 支變體不逐列寫，表頭一句指向分鏡表寫的檔名與 SITUATIONS。

## 不做

- lemo 的手寫字（中文要一字一字建筆順）、像素小角色 Clawd（別人的角色）、three.js 3D（亂序 seek 反鋸齒不穩，改 2.5D）。
- 不刪任何現有範本；舊的變體表照留。
