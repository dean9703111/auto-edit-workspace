# 素材包使用說明：參考（給 AI 查）

先讀 `shared/template/USAGE.md`（核心）。這份照核心第 2 節 SOP 的「查」欄，做到那一步再讀那一節；標題 `## R1`–`## R14` 可以直接搜尋。

情境與字卡動態的清單（key、slots 上限、預設長度、什麼時候用、不要用在）不貼在這裡，一律跑 `node shared/template/tools/build.mjs --list`。這份只寫 `--list` 沒寫的事。工具的輸出和本文不一致時，以工具為準。

| 節 | 內容 | 什麼時候讀 |
|---|---|---|
| R1 | 挑情境：判斷順序、不下卡的句子（訊號表在 `SITUATIONS.md`） | 步驟 4 列分鏡表 |
| R2 | 情境細節、清單寫法、全部欄位、media 段欄位、`--check --json` 格式、文字對時的欄位表（R2.8） | 步驟 4–5、插入螢幕錄影時 |
| R3 | 字卡動態（fx） | 用到 fx 時 |
| R4 | 畫面分區、講者位置、底片層、`sideShift`、`pipCrop`、`css` | 步驟 2、5，預覽後要移位時 |
| R5 | 字幕與音效（build 自動處理） | 要換或拿掉音效時 |
| R6 | 密度與節奏、build 檢查哪些 | 步驟 4、6 |
| R7 | 第二層情境動畫（custom）：骨架、`P.at` 綁句、48 支範例、檢查 | 符合 style.md「情境動畫優先」時 |
| R8 | 硬規則與陷阱 | 寫 custom、用 `css` 移位、步驟 8 |
| R9 | 換主色與背景、風格包（能力探測、生圖路由、HTML 背景圖） | 使用者要求時 |
| R10 | 不可以做的事 | 不確定能不能做時 |
| R11 | 可以重複使用的資源 | 找檔案時 |
| R12 | Skill 與安裝 | 改 Skill 時 |
| R13 | 測試過的版本與環境的坑 | 環境出錯時 |
| R14 | 改模板或新增情境（使用者明確要求時） | 使用者要求改模板、新增情境時 |

---

## R1. 挑情境

### R1.1 判斷順序

1. **要不要換版面**：01 章節轉場、03 半版側邊欄、04 全畫面家族、05 兩側。
2. **選下方字卡**：06 一般、07 重點、08 Step、09 QA、10 Tips、11 總結、15 金句。
3. **講解正在列舉時才用條列**：12 關鍵詞條列、13 標題條列。
4. **只有情緒、沒有資訊時才用字卡動態**（fx）。

理由：版面決定講者會不會被移動或蓋住，要最先定；資訊卡次之；字卡動態只負責情緒，放太多會搶走資訊卡的注意力。

### R1.2 訊號表（看到這種句子 → 先想這個情境）

訊號表已經搬到 `shared/template/SITUATIONS.md` §3（版面、首選、次選、動態、音效、不要用在），版面四個名稱在同一份的 §2。

### R1.3 不下卡的句子

- 操作指示句（「點擊右上角」「接著輸入」）：畫面本身就是答案。
- 成功、完成之類的狀態句。
- 只有一句的打勾項目（要湊成清單才下）。
- 開場招呼、自我介紹以外的簽名句、CTA、「稍等一段時間」這類等待句、收尾「我們下班有約」。

### R1.4 情境 vs 字卡動態

| 用情境 | 用字卡動態（fx） |
|---|---|
| 句子有資訊要看懂：定義、步驟、問答、清單、對照 | 句子是情緒或節奏：一個詞的衝擊、數字跳動、轉場 |
| 要停留 ≥ 3 秒讓觀眾讀 | 1.5–3 秒一閃而過 |

一段講解字卡動態最多一兩張，而且不和下方字卡同時出現。

---

## R2. 情境細節與欄位

### R2.1 `--list` 的欄位怎麼讀

- 「長度」：沒寫 `to`／`duration` 時的預設，以及段長下限。寫了 `to` 就以 `to` 為準，但不能短於「最短」。
- 「組別」決定圖層性質：`fullscreen`、`chapter` 是不透明幕；`panel`（03）會推講者；`lower-third` 是下方字卡（相接時自動換卡）；`edge` 疊在畫面邊緣。
- 「beats」：情境內部的時間點，可以用 `"beats": { "aAt": "#14" }` 覆寫（時間語法同 `at`）。
- 「slots」的 `rich`＝可以用 `**詞**` 與 `//`；`≤N 行、每行 ≤M` 是用 `//` 斷行後的限制；`N–M 項` 是清單項數。

### R2.2 個別情境補充

- **01 章節轉場**：只寫 `"at": "#N"`（該章第一句），長度固定 2.5 秒，寫 to／duration 會被忽略。前一句結尾到第 N 句起點的空檔 ≥ 2.0 秒時，轉場放在空檔裡、結束在第 N 句起點；空檔 < 2.0 秒（auto-editor 初剪後幾乎都是）時，從第 N 句起點開始蓋 2.5 秒，人聲在下面繼續，報告會寫明是哪一種。結語章的 `sub` 放本集金句，不要只寫「結語」。短片（< 3 分鐘）不建議用：會蓋住講者 2.5 秒，又佔掉開場 30 秒的名額。
- **章節角標**：會自動常駐右上角：章節開始（01 章節轉場結束；沒有 01 時是 02 章節角標段開始）一直到下一章或片尾配樂，子母畫面、全幕的時候自動淡出（`auto-edit-storyboard` 硬規則）。沒有 01 的短片，02 段照樣寫（它決定章節從哪裡開始、號碼和章名），長度 ≥ 3.5 秒就好；號碼和前一章相同的 02 段不另起一章。`chtag: true` 不用再寫（寫了會 ⚠）。不要常駐角標：plan.json 第一層寫 `"chapterBadge": false`（回到舊的行為：02 段只顯示那幾秒、`chtag` 附件照舊）。
- **07 重點字卡**：`key` 有自己的時間點 `beats.keyAt`：`lead`（前句）在段起點先出，`key` 等講到那個詞才揭開（`"beats": { "keyAt": "#20@放到電腦" }`，或寫在 slots：`"key": { "text": "放到電腦才看得出", "at": "#20@放到電腦" }`）；主音效跟著 `keyAt`。
- **03 側邊欄**：清單預設在本段第 1.3 秒起、每 0.6 秒一項；第一項不寫 `at`。`sideShift` 見 R4。
- **04a、04c**：清單在第 0.5 秒起、每 0.35 秒一項。
- **04b 對照**：單項的 `at` 不生效（整欄一起進），要控制時間改寫 `"beats": { "leftAt": "#12", "rightAt": "#14" }`。
- **04d 表格**：4 欄時每格 ≤ 4 字、3 欄時每格 ≤ 6 字（超過會出錯）。
- **08 Step**：每步間隔 2.6 秒。**13 標題條列**：每條間隔 2.4 秒。
- **09 QA**：答案要晚一點出來，寫成物件帶時間：`"a": { "text": "不行，**三道關**都要看", "at": "#14" }`。
- **14 講者介紹**：`name`、`titles` 的預設值是作者本人，一律照 `shared/style.md` 的「講者」一節換掉；那一節空白就不放 14。

### R2.3 清單與表格的寫法

- 清單項目可以寫字串，或寫物件加時間：
  - `"初剪：移除多餘"`
  - `{ "text": "**Whisper** 轉字幕", "at": "#19" }`
- 有圖示的項目（04c、05 必填；03、04a、08、12、13 選填，見 R2.7）：`{ "text": "轉逐字稿", "icon": "file-text", "at": "#8" }`，或字串 `"轉逐字稿 ｜icon=file-text"`。
- 04d 表格的列：字串用 ` / `（前後有空格）分欄，`"HyperFrames / 字幕與動畫"`；`head` 也是只有一項的清單：`"head": ["工具 / 負責"]`。
- 一般欄位也可以寫成物件帶時間（09 QA 的答案）。
- 圖示：同一個物件全集用同一個圖示。常用：文件 `file-text`、清單 `list-checks`、剪輯 `scissors`、影片 `video`、相機 `camera`、AI `bot`、時間 `clock`、存檔 `save`、資料夾 `folder`、Skill `package`、人 `user`、聲音 `volume-2`、完成影片 `clapperboard`、設定清單 `clipboard-list`。不確定名字時先寫，`--check` 找不到會列出相近名稱。

### R2.4 每一段的全部欄位

| 欄位 | scene（預設） | fx | custom | 說明 |
|---|---|---|---|---|
| `id` | ✓ | ✓ | ✓ | 英文開頭的英數字或底線，**不能有 `-`**（例：`s01`、`x01`），全檔唯一 |
| `type` | 省略 | `"fx"` | `"custom"` | |
| `scene` | ✓ | | | 情境 key（`concept`）。編號（`"06"`）和中文名（`"一般字卡"`）也認得，但一律寫 key |
| `fx` | | ✓ | | 字卡動態編號 1–40 |
| `src` | | | ✓ | `"compositions/x-<名稱>.html"` |
| `layout` | | | ✓ | `"overlay"`（透明、疊在講者上）或 `"fullscreen"`（不透明，自動加子母畫面與淡入淡出） |
| `from` | ✓ | ✓ | ✓ | 起點。01 章節轉場不寫 from，改寫 `at` |
| `to` | 選填 | 選填 | 二選一 | 結尾。沒寫用 `duration`，再沒寫用情境的預設長度（fx 預設 3 秒） |
| `duration` | 選填 | 選填 | 二選一 | 秒數 |
| `at` | 只有 01 | | | 01 章節轉場寫 `"at": "#N"`（該章第一句） |
| `anchor` | 選填 | 選填 | 選填 | 起點那句應該包含的一段文字，句號位移時會提醒 |
| `slots` | ✓ | | | 卡片文字，欄位依情境不同（`--list`） |
| `beats` | 選填 | | | 覆寫情境的內部時間點（`--list` 的 beats 欄） |
| `tone` | 選填 | | | `"warn"`（警示紅）或 `"good"`（解方綠），只有 `--list` 標了 tone 的情境能用 |
| `vars` | | ✓ | | 字卡動態的變數（R3） |
| `bg` | | 選填 | | `"none"`（預設，透明疊在講者上）、`"dark"`、`"light"`、`"accent"`（不透明整張幕） |
| `sfx` | 選填 | 選填 | 選填 | `kit/sfx.json` 裡 `kind` 是 `sfx` 的名稱之一（R5.2）或 `null`（不配）。不寫＝用預設（R5）；custom 不寫就不配 |
| `clicks` | | | 選填 | 畫面上看得到游標按下的時間 `["+3.2", "#21@安裝"]`，一下一顆 `click`（R5.2）；media 段也能寫 |
| `sfxExtra` | 選填 | | | `false`＝關掉這段的附加音效（09 答案的 ding、情境動畫的 P.sfx 等）；不寫＝開（fx 沒有附加音效） |
| `sfxVolume` | 選填 | 選填 | 選填 | 這段音效的音量（dB，−60～+12，0＝預設），主音效與附加音效一起調；疊在 `kit/sfx.json` 與 `edit.volume.sfx` 上。通常是剪輯台寫的（核心 6.3） |
| `css` | 選填 | | | 微調位置的 CSS，id 寫模板裡的原名（R4） |
| `chtag` | 不用寫 | | | 章節角標由 build 自動常駐（R2.2）；寫了會 ⚠，只有 `"chapterBadge": false` 時才畫附件 |
| `pip` | 04 家族選填 | | 選填 | `false`＝全畫面時不放子母畫面（講者完全被蓋住） |
| `full` | 15／09／06／11 選填 | | | `true`＝換成全幕版（不透明整張畫面，沒有講者）；不寫＝一半以上落在只有聲音的區間時 build 自動換；`false`＝不自動換（旁白段會 ✖）。別的情境寫了 ✖（style.md「全幕版、上推、畫面推近」） |
| `note` | 選填 | 選填 | 選填 | 給人看的備註，build 不讀 |

插入螢幕錄影與圖片（`"type": "media"`）的欄位見 R2.5。第一層的 `edit`（剪輯台）見核心第 6 節。

### R2.5 media 段的全部欄位

用法、配對流程、座標怎麼讀見核心第 5 節。`--list` 最後一張表也印出同樣的欄位。

| 欄位 | 必填 | 值 | 預設 | 說明 |
|---|---|---|---|---|
| `id` | ✓ | 英數字 | | 建議 `m01`、`m02` |
| `type` | ✓ | `"media"` | | |
| `src` | ✓ | `"assets/screen/<檔名>"`、`"assets/images/<檔名>"` | | 相對專案資料夾；影片 `.mp4 .mov .m4v .webm`、圖片 `.jpg .jpeg .png .webp` |
| `from` | ✓ | 時間 | | 同其他段（核心 3.4）；剪輯台可能寫成秒數 |
| `to`／`duration` | 二選一 | 時間／秒數 | | |
| `anchor` | 選填 | 文字 | | 起點那句的一小段原文 |
| `in` | 選填 | 秒數 ≥ 0 | `0` | 錄影從第幾秒開始播（圖片忽略）；`in ＋ 段長 × speed` 超過錄影長度 ✖ |
| `speed` | 選填 | 0.5–4 | `1` | 播放速度（圖片忽略）；聲音也跟著變速 |
| `fit` | 選填 | `"contain"`、`"cover"` | `"contain"` | contain：整張放進 1920×940（字幕帶上方）置中，空白處是黑底；cover：鋪滿 1920×1080 |
| `pip` | 選填 | `true`、`false` | `true` | 右下角子母畫面；只有聲音的區間自動不放 |
| `volume` | 選填 | `null` 或 −60～+12（dB） | `null` | `null`＝靜音；數字＝保留素材原聲（素材沒有聲音時 ⚠ 並忽略），疊在 `edit.volume.media` 上 |
| `enter`／`exit` | 選填 | `"cut"`、`"fade"`、`"slide"`、`"zoom"`、`"whip"`；`enter` 另有 `"tape"`、`"tilt"` | `"fade"` | 進場 0.5／0.5／0.6／0.5／0.3 秒、出場 0.5／0.5／0.6／0.4／0.3 秒；接在另一張整張幕後面時 `fade` 自動變 `cut`（其他照做，前一段墊在底下到進場做完）；`"whip"`＝甩鏡：整層從右邊甩進、往左邊甩出，拉長＋模糊在最快的那幾格（錄影、圖片、直式都可以；不配音效）；`"tape"`（0.6 秒）＝圖片縮小貼在全幕背景上：紙白邊、面板落下貼平、兩條紙膠帶貼在兩個上角（只給圖片、`fit` `"contain"`、橫式；直式自動改 `"zoom"`）；`"tilt"`（0.65 秒）＝斜躺擺平：整層 0.25 秒淡入，面板以底邊為軸從透視斜躺（往後倒 22°、側轉 8°）擺平（錄影、圖片、直式都可以；要 `fit` `"contain"`，`"cover"` ✖） |
| `kenburns` | 選填 | `true`、`false` | 圖片 `true`、錄影 `false`；有 `callouts`／`spot`／`arrows` 時 `false` | 沒寫 `moves` 時整段慢推 1.00→1.05；有標註時寫 `true` 會 ⚠ 並忽略 |
| `moves` | 選填 | `[{ "at", "to": [x,y,w,h] 或 "full", "dur" }]` | | 運鏡；`dur` 0.2–5，預設 1；不能重疊 |
| `marks` | 選填 | `[{ "at", "until", "box": [x,y,w,h], "path": [{ "at", "box", "dur" }] }]` | | 紅框；`until` 不寫＝到段尾；同時 ≤ 2（callouts 的框也算）；`path` 讓框跟著錄影捲動，`dur` 0.2–2，預設 0.4 |
| `lens` | 選填 | `[{ "at", "until", "box": [x,y,w,h], "zoom" }]` | | 放大鏡；`until` 不寫＝`at`＋3 秒；至少 1.2 秒；`zoom` 1.2–4，預設 2 |
| `callouts` | 選填 | `[{ "at", "until", "box": [x,y,w,h], "text", "icon", "side", "quick" }]` | | 說明卡；`text` 1–12 字；`icon` 圖示名或 `"none"`；`side` `"right"`／`"left"`／`"top"`／`"bottom"`，不寫＝自動；`quick` 預設 `false`；完整可讀 ≥ 1.2 秒（quick ≥ 0.8 秒）；期間不能有運鏡 |
| `spot` | 選填 | `[{ "at", "until", "box": [x,y,w,h] }]` | | 聚光燈；壓暗 35%；≥ 2 秒；一次一個；不和放大鏡同時；期間不能有運鏡 |
| `steps` | 選填 | `[{ "at", "text" }]` | | STEP 膠囊；`text` 1–12 字；相鄰兩步 ≥ 1.65 秒；號碼自動 |
| `arrows` | 選填 | `[{ "at", "until", "to": [x,y], "from" }]` | `until`＝`at`＋3 秒 | 箭頭；`from` `"n" "ne" "e" "se" "s" "sw" "w" "nw"`，不寫＝自動；≥ 2.2 秒；一次一支；放不下自動拿掉（⚠）；期間不能有運鏡 |
| `clicks` | 選填 | `["+秒數" 或 "#N@詞", …]` | | 錄影裡看得到游標按下的地方，一下一顆 `click`（R5.2） |
| `sfx` | 選填 | 音效名稱或 `null` | 不配 | 錄影段預設不配 |
| `sfxVolume` | 選填 | −60～+12（dB） | `0` | |
| `note` | 選填 | 文字 | | build 不讀 |

- 座標（`box`、`moves.to`、`arrows.to`、`path[].box`）一律是**素材原尺寸的像素**，用 `media.mjs frame --grid` 讀（核心 5.4）。超出素材範圍 ✖。說明卡、聚光燈、箭頭由 build 換成畫面座標、畫在運鏡層外面（字不會被放大變糊），所以它們出現的期間不能運鏡；紅框（含 `path`）畫在運鏡層裡，跟著運鏡動。
- `moves`／`marks`／`lens`／`callouts`／`spot`／`steps`／`arrows`／`path` 的 `at`／`until`：`"#N"`、`"#Ne"`、`"#N±秒"`、`"+秒"`（本段起點後），不能寫絕對秒數，要落在這段裡。
- `--check` 的 ✖／⚠ 原文都附「→」改法，照它改就好。
- 圖層：media 段和全畫面情境一樣是整張幕（z 30）。同一時間只能有一張整張幕（✖）；期間不能出現下方字卡、側邊欄等透明情境（✖）；透明字卡動態可以疊（⚠ 提醒確認）。
- build 會把錄影轉成 30fps、每秒一個關鍵影格、`speed` 做進檔案（`work/hyperframes/assets/media/`，依素材大小＋修改時間＋設定快取，素材沒變不重轉，沒用到的舊檔自動刪）；放大鏡把那幾秒逐格裁成 JPG（同一張畫面只存一份）。

### R2.6 `--check --json` 的格式

`node shared/template/tools/build.mjs --project projects/<專案> --check --json`：stdout 只印一個 JSON（出錯也是，`ok: false`、訊息在 `errors`），不寫檔（只會寫偵測快取 `work/hyperframes/.cache/`）。結束碼同 `--check`（有 ✖ 是 1）。**時間都是 `rough.mp4` 的秒數**（`out` 欄位例外，見下）。

除了下表，還有：`planHash`（plan.json 內容的雜湊，qc 用來判斷改過還沒 build）、`rhythm`、`versions`、`uncovered`（沒有畫面的區間）、`voiceUncovered`（只有聲音、沒被蓋住的區間）、`chapters`（每個章節的位置與空檔）、`sfxCount`、`sfxBudget`、`outro`；每段多 `key`、`family`、`layout`（`overlay`／`side`／`pip`／`full`）、`layoutZh`（疊加／半畫面／子母畫面／全幕）、`opaque`，以及 `out`（**完成影片秒數**的起迄、條列每條進場時間、子母畫面片段、擦入擦出、情境動畫的綁句）。

```json
{ "ok": true, "errors": [], "warnings": ["[s02 concept] …"],
  "videoDur": 107.567, "outputDur": 103.067,
  "voiceOnly": [[41.0, 58.2]],
  "cutpoints": [ { "at": 12.34, "kind": "ng" } ],
  "items": [
    { "id": "s01", "type": "scene", "label": "06 一般字卡", "start": 12.5, "end": 18.0,
      "sfx": [ { "name": "ding", "at": 12.623, "volume": 0.468, "db": -12.6 } ], "warnings": 0 },
    { "id": "m01", "type": "media", "label": "media 操作示範.mp4", "start": 41.0, "end": 58.2, "shownEnd": 58.8,
      "sfx": [], "warnings": 1, "src": "assets/screen/操作示範.mp4", "enter": "fade", "exit": "fade", "volume": null, "kind": "video" } ],
  "edit": { "cuts": [], "fadeIn": 0, "fadeOut": 0, "volume": { "voice": 0, "sfx": 0, "media": 0 }, "gains": [], "joins": [] },
  "paths": { "project": "projects/example", "video": "projects/example/work/rough.mp4", "plan": "projects/example/work/hyperframes/plan.json", "out": "projects/example/work/hyperframes" } }
```

| 欄位 | 說明 |
|---|---|
| `videoDur`／`outputDur` | `rough.mp4` 長度／完成影片長度（＝`rough.mp4` − cuts） |
| `voiceOnly` | `rough.mp4` 全黑（只有聲音）的區間 |
| `cutpoints` | `work/cutpoints.json` 的剪接點（沒有這個檔就是空陣列） |
| `items[]` | 每一段：`start`／`end` 是 plan.json 寫的起迄；`shownEnd` 只在畫面上實際停留的時間不同時出現（下方字卡換卡、接不透明幕時自動延長或提早收）；整段被 cuts 剪掉的段不列出 |
| `items[].sfx[]` | 主音效與附加音效：`at` 是音效檔開始播的時間，`volume` 是最終線性音量（0–3.98，已套 `sfx.json`、`sfxVolume`、`edit.volume.sfx`、淡入淡出），`db` 是同一個值換成 dB |
| `items[]` 的 media 欄位 | `src`、`enter`、`exit`、`volume`（dB 或 `null`）、`kind`（`video`／`image`） |
| `edit` | 正規化後的 `edit`：cuts 排序合併、`joins` 吸附到剪接點、沒寫的欄位補預設 |
| `paths` | 工作區根目錄底下的相對路徑 |

### R2.7 圖示（圖示先行）

作者的規則是「圖示先行」：情境有圖示欄位就配圖示。圖示的動態由模板處理，plan.json 只寫圖示名稱：容器先進場，0.15 秒後把線描出來（0.7 秒）。

| 情境 | 欄位 | 必填／預設 | 有圖示時的字數上限 |
|---|---|---|---|
| 01 章節轉場 | `icon` | 選填，標題上方的大圖示 | — |
| 03 側邊欄 | `items[].icon` | 選填，序號圓換成圖示圓 | — |
| 04a 全畫面清單 | `items[].icon` | 選填 | 每項 ≤ 17（沒圖示 18） |
| 04b 全畫面對照 | `leftIcon`、`rightIcon` | 選填，放在欄頭前面 | 有圖示的欄頭 ≤ 5（沒圖示 6） |
| 04c 全畫面流程 | `nodes[].icon` | 必填 | — |
| 05 兩側 | `cards[].icon` | 必填 | — |
| 06 一般字卡 | `icon` | 預設 `lightbulb` | — |
| 07 重點字卡 | `icon` | 預設 `star`；`tone: "warn"` 預設 `triangle-alert`、`"good"` 預設 `circle-check`（圓環＋打勾） | 前句 ≤ 7（沒圖示 10） |
| 08 Step 字卡 | `steps[].icon` | 選填，跟著每一步一起換 | 每步 ≤ 17（沒圖示 20） |
| 10 Tips 字卡 | `icon` | 預設 `check` | — |
| 11 總結字卡 | `icon` | 預設 `circle-check`（圓環＋打勾） | 每行 ≤ 15（沒圖示 18） |
| 12 關鍵詞條列 | `items[].icon` | 選填，放在膠囊裡 | 每個詞 ≤ 8、每行 ≤ 4（沒圖示 10、5） |
| 13 標題條列 | `items[].icon` | 選填，序號圓換成圖示圓 | — |

02、04d、09、14、15 沒有圖示欄位。

- 寫法：一般欄位 `"icon": "scissors"`；清單項目 `"剪乾淨 ｜icon=scissors"` 或 `{ "text": "剪乾淨", "icon": "scissors" }`。
- 清單的圖示：每一項都有，或全部不放。只有部分有會 ✖ `只有 N／M 項有圖示`。
- 不要預設圖示：寫 `"icon": "none"`，字數上限回到沒圖示的值。必填的不能寫 `none`。
- 字數超過「有圖示時的上限」會 ✖，訊息會寫要縮成幾字。理由：圖示占掉 1–3 個字的寬度，卡片不能因為加了圖示就變寬、壓到講者。
- 挑圖示：同一個物件全集用同一個（寫進分鏡表的「本集圖示表」）。語意固定的：問句 `circle-help`、想法 `lightbulb`、正向 `check`、反向 `x`、警示 `triangle-alert`。常用名稱見 R2.3。
- 打勾（圓環＋勾）只給總結、回顧、成果這種「完成」語意；流程圖的站走過只換框色，不打勾。

### R2.8 文字對時：每個欄位改哪個時間點

卡片主文字、清單每一項、字卡動態的字，出現時間＝講到那個詞的時間（`#N@詞`），差 ≤ 0.5 秒（`auto-edit-storyboard` 硬規則）。`--check` 的「文字對時」會量：差 0.6–1.5 秒 ⚠、超過 1.5 秒 ✖，訊息的 → 會寫好要改哪個欄位、寫什麼（USAGE.md 4.2）；`build.mjs --autofix`（合併、套回時自動跑）照這張表直接改，`from` 會連前一段 0 秒相接的 `to` 一起挪。這張表是「欄位 → 出現時間由誰決定」：

| 情境（scene key） | 欄位 → 出現時間由誰決定（改法寫哪裡） |
|---|---|
| 03 `side-panel` | `title` → `beats.head`；`items[i]` → `slots.items[i].at` |
| 04a `fs-list` | `title` → 段起點（`from`）；`items[i]` → `slots.items[i].at` |
| 04b `fs-compare` | `title` → `from`；`left[i]`、`right[i]` → `slots.left[i].at`、`slots.right[i].at` |
| 04c `fs-flow` | `title` → `from`；`nodes[i]` → `slots.nodes[i].at` |
| 04d `fs-table` | `title` → `from`；`rows[i]`（第一欄）→ `slots.rows[i].at` |
| 05 `two-sides` | `cards[i]` → `slots.cards[i].at` |
| 06 `concept` | `text` → `beats.in` |
| 07 `key-point` | `lead` → `from`；`key` → `beats.keyAt`（R2.2；不寫＝進場後一拍；主音效跟著 `keyAt`） |
| 08 `steps` | `steps[i]` → `slots.steps[i].at` |
| 09 `qa` | `q` → `beats.in`；`a` → `beats.aAt` |
| 10 `tips` | `title`、`desc` → `beats.in` |
| 11 `summary`、15 `quote` | `text` → `beats.in` |
| 12 `keywords` | `items[i]` → `slots.items[i].at` |
| 13 `title-list` | `title` → `from`；`items[i]` → `slots.items[i].at` |
| fx（字卡動態） | `vars.text` → `from` |
| 不量 | 01 章節、02 章節角標、14 講者介紹；custom（情境動畫的站名由 audit 的「綁句對不上」量，R8 #18） |

- 對到哪一句：欄位文字去掉 `**`、`//`、空白、標點後，和這段前後 15 秒內的字幕比最長的共同字；欄位 ≤ 4 字時至少 2 字相同，> 4 字時至少 3 字相同。找不到對應句不報。
- 講到的秒數用 `work/transcript.json` 的詞級時間；沒有或找不到這個詞時用字數比例估，訊息尾巴會加註（USAGE.md 3.4 的重轉指令）。

---

## R3. 字卡動態（fx）

- plan.json 寫 `"type": "fx", "fx": 編號`；40 種的名稱、vars、什麼時候用，跑 `--list` 看。效果看 `shared/template/fx/index.html`。
- 直式：字卡動態縮 0.5625 倍放中間；`fx/catalog.json` 標 `"portrait": "band"` 的 14 張只剩中間一條，`--check` 會 ⚠（→ 換 `"portrait": "ok"` 的或拿掉）。挑之前在 `fx/index.html` 按「直式預覽」看（`shared/style.md`「直式」）。
- `bg` 預設 `none`（透明疊在講者上）；`dark`／`light`／`accent` 是不透明整張幕（會蓋住講者，沒有子母畫面）。顏色自動用 `kit/brand.css` 的主色，不用寫 `accent`。
- vars 的值一律寫字串：`"vars": { "label": "做了", "number": "29", "unit": "支影片" }`（fx 29 數字計數：`label` 左側、`number`、`unit` 右側單位，選填）。寫了 fx 沒有的變數（例 fx 29 的 `vars.text`），`--check` 會 ✖ 並列出可用欄位。
- **14、27、31、38** 用了另外的線上字型，第一次 render 需要網路（HyperFrames 會快取到 `~/.cache/hyperframes/fonts`），離線時避開。
- **03、12、16、33** 有非 90 度的斜邊，1× render 會有鋸齒，少用。
- 透明（`bg: none`）的字卡動態不能和下方字卡（06–11、13–15）同時出現。
- 字卡動態預設音效寫在 `fx/catalog.json` 的 `sfx` 欄（`--list` 的音效欄看得到），不要就寫 `"sfx": null`。

---

## R4. 畫面分區、講者位置、底片層、`css`

### R4.1 畫面分區（1920×1080）

| 區域 | 範圍 | 規則 |
|---|---|---|
| 內容區 | y 120–870 | 所有卡片文字都在這裡；下方字卡底座在 y 860 |
| 字幕區 | y ≥ 920（底部 160px） | **什麼都不放**（字幕框在 y 956–1074）。`check --caption-zone` 會把壓到這裡的文字當錯誤 |
| 子母畫面 | 本體 x 1424–1856、y 594–918（432×324，4:3）；外框禁入區 x 1424–1888、y 581–951 | 只在全畫面情境與 media 段出現。全畫面主卡右緣 ≤ 1380（模板的 04 家族目前寬 1180、右緣 1300）；media 段的小視窗和禁入區自動移進素材右下角（外框離素材邊 16；16:9 錄影：本體 x 1339–1771、y 591–915，禁入區 x 1339–1803、y 578–948；小視窗只碰到素材邊邊的，例如手機直式、正方形的圖，不移），紅框、放大鏡壓到會 ⚠ |
| media 段可見區 | `fit: "contain"`：y 0–940 置中；`"cover"`：整個畫面 | 素材下緣碰到字幕帶上緣，字幕照常疊在上面 |
| 講者框 | speakerBox | 透明的卡不能壓到臉與手勢 |

各情境大約佔的範圍（build 拿來和 speakerBox 算碰撞：碰到臉的位置（框上緣往下約三成的中間）≥ 5%、或蓋住講者框 ≥ 40% 就提醒，只壓到下半身不報；audit 量實際畫面用同一個門檻）：

| 情境 | 大約範圍 |
|---|---|
| 06–10、13、14 下方字卡（靠左） | x 120–1020、y 536–860 |
| 11 總結、15 金句（置中） | x 510–1410、y 536–860 |
| 12 關鍵詞條列 | x 120–560、y 160–870 |
| 02 章節角標 | x 1200–1824、y 56–168 |
| 小節角標（有 `sections`） | 右緣 x 1824、y 56–136，寬照小節名（號碼板＋小節名 40 px＋內距，約 字寬＋124） |
| 05 兩側 | x 96–600 與 1320–1824、y 160–870 |

碰撞提醒是用這張固定範圍算的，只是提醒；最後以 snapshot 為準。

### R4.2 依講者位置挑情境

| 講者位置 | 適合 | 避開或要調整 |
|---|---|---|
| 置中 | 全部 18 個 | — |
| 右側（中心 x > 1060） | 06–10、12、13、14（靠左）、04 家族；03 用 `sideShift: 0` | 11、15 置中會壓到身體：snapshot 看臉，擋到臉就換 06／07 或用 `css` 移到左邊；只壓到身體就保留，給使用者看預覽時點名請他確認（核心 2.5）。05 不用 |
| 左側（中心 x < 860） | 04 家族、02 | 06–15 下方字卡與 12 都靠左，會壓到講者：用 `css` 把卡移到右邊，或改用 04 家族；03 側邊欄蓋住左半邊，不用；05 不用 |

### R4.3 哪些情境會動到底片層

全部由 build 在主時間軸處理，**AI 不要自己寫底片的動畫**。

| 情境 | 底片（講者）會怎樣 | 時間 |
|---|---|---|
| 03 半版側邊欄 | 整個底片往右平移 `sideShift`（預設 480），左半邊推入 960 寬的面板 | 段起點 0.7 秒推入、段尾前 0.7 秒推回；講者和面板用同一條 9 點曲線，所以同步、中間不露黑縫 |
| 04a–d 全畫面、custom `layout: "fullscreen"` | 不透明幕蓋住講者（聲音照常）；右下角出現子母畫面＝同一支影片的靜音複本，外框 `kit/pip-frame.png` | 幕、子母畫面、外框一起淡入 0.5 秒、淡出 0.5 秒；寫 `"pip": false` 就沒有子母畫面 |
| 01 章節轉場、fx `bg` 為 dark／light／accent | 不透明幕整個蓋住講者，沒有子母畫面 | 淡入淡出 0.5 秒 |
| media 段（插入螢幕錄影、圖片） | 素材整張蓋住講者（聲音照常）；右下角子母畫面同 04；只有聲音的區間不放子母畫面 | 依 `enter`／`exit`（核心 5.3） |
| `edit.joins` 的 `punch`（剪輯台） | 底片放大 1.08 倍（以講者框上方為中心），到下一個接點還原 | 硬切，不補間 |
| 其他（02、05–15、fx `bg: none`、custom `layout: "overlay"`） | 不動 | — |

不透明幕相接時（後一段起點 ≤ 前一段結尾＋0.1 秒）：接縫不淡出（前段停在完成態），避免每個接縫黑一下。透明卡後面接不透明幕時，透明卡停在完成態、被幕蓋過；如果它是 03，底片在幕完全蓋住後才歸位。

### R4.4 `sideShift` 怎麼定

- 目標：右移後講者在面板外（x1＋sideShift ≥ 960），而且不出畫面（x2＋sideShift ≤ 1920）。
- 算法：`sideShift = max(0, 960 − x1)`，再確認 `x2 + sideShift ≤ 1920`。
- 講者置中（例 x 640–1280）：960−640＝320，但作者規範是 480，用預設 480（右緣 1760，在畫面內）。
- 講者在右側（例 `[960, 260, 1640, 1020]`）：960−960＝0 → `"sideShift": 0`。用 480 會推到 2120，`--check` 會提醒「超出畫面」。
- 兩個條件同時做不到（講者框寬超過 960）：不用 03，改 04a 全畫面清單。

### R4.5 `pipCrop`（子母畫面裁哪一塊）

- `"auto"`：以 speakerBox 中心取一個 4:3 的框（高＝max(框高×1.15, 框寬×1.15×3/4)，夾在畫面內）；沒寫 speakerBox 時裁畫面中央、高 66%。有 `frame` 時座標是裁切後的畫面。
- 也可以直接寫 `[x, y, w, h]`（1920×1080 座標、寬高比 4:3）。snapshot 看到子母畫面裡的講者被切到頭或手時才改。
- 從講者滿版切到子母畫面時，小視窗會從這個裁切框的位置縮到右下角（0.7 秒），所以裁切框要框住臉；`pipCrop` 不寫（`"auto"`）時用 speakerBox 算。

### R4.6 用 `css` 微調位置

```json
{ "id": "s04", "scene": "quote", "from": "#32", "to": "#33e",
  "slots": { "text": "把踩過的坑//寫成下一次的文件", "by": "大寶" },
  "css": "#gCard { left: 120px; right: auto; margin: 0; }" }
```

- 只寫位置（left／right／top／bottom／margin），不改字級、顏色、寬度、內距。
- id 寫模板裡的原名，build 會自動加前綴與範圍。各情境的主元件 id：06、07、08、11、13、15 是 `#gCard`；09 `#qaCard`；10 `#tipCard`；14 `#spkCard`；12 `#kwList`；02 `#cBadge`；04 家族 `#wCard`；05 `#sCard1`–`#sCard4`；01 `#chGroup`。寫了模板裡沒有的 id 會出錯並列出可用的 id。
- 下方字卡的底一律是 `bottom: 220px`（卡底 y 860），不要往下移進字幕區。
- 碰撞提醒是用固定範圍算的，移位後提醒不會消失；移完一定要 snapshot 確認，並在回報裡說明「已移位、snapshot 確認沒壓到講者」。

### R4.7 直式分區（1080×1920，plan.json `"format": "portrait"`）

數字的出處是 `shared/style.md`「直式」與 `shared/template/tools/lib/canvas.mjs` 的 `CANVAS.portrait`；這裡是同一組數字畫成表。

| 區 | 範圍 | 放什麼 |
|---|---|---|
| 頂部不安全區 | y 0–240 | 不放字（平台標題、狀態列） |
| 上半資訊面板 | x 0–1080、y 0–900 | 上下分割的上半：04 家族、情境動畫、插入素材 |
| 資訊窗 | x 40–1040、y 240–876 | 1920×1080 子合成整張縮 0.8475 放進來（主卡框 x 120–1300、y 130–880 對到這裡） |
| 卡片帶 | x 60–940、y 880–1240 | 疊加版面的下方字卡、11 總結、15 金句 |
| 下半講者面板 | x 0–1080、y 900–1920 | 上下分割的下半：講者（臉約 y 940–1280） |
| 字幕帶 | y 1280–1420 | 字幕（講者胸前） |
| 右側按鈕列 | x 940–1080、y 840–1440 | 不放字 |
| 底部不安全區 | y 1440–1920 | 不放字（平台說明、按鈕） |
| 章節角標 | 左上 x 60–684、y 250–362 | build 自動常駐 |

- 全幕：01 章節的章名卡（1920 舞台 x 160–1760、y 260–870）縮 0.625、中心放在 y 860；fx 字卡動態縮 0.5625，不透明的上緣 y 416、透明的上緣 y 766；四周補主題底色。
- 插入素材：有講者面板時 `contain` 放在 y 240–900、`cover` 鋪滿上半 y 0–900；只有聲音（沒有講者面板）時 `contain` 放在 y 240–1260、`cover` 鋪滿整個 1080×1920。
- 03 半版側邊欄、05 兩側在直式不提供（`--check` ✖ 並給替代）。
- 版式平常不用指定：`build.mjs`、`qc.mjs`、`audit.mjs` 照 plan.json `format` > `work/製作進度.md` 開工決策表「版式」> 主軌寬高比決定，第一行印「版式：…（來源：…）」。要蓋過才加 `--format portrait`（或 `landscape`），例：`node shared/template/tools/audit.mjs --project projects/<專案> --format portrait`。

---

## R5. 字幕與音效

### R5.1 字幕（build 自動產生，不用寫）

- 來源：`work/rough.srt`（`media.mjs srt-align` 照講稿排好的完整語句，不要重新轉錄）。
- 樣式（`shared/style.md`「字幕」，實作在 `shared/template/kit/captions.css`）：英數 Google Sans Flex、中文 Noto Sans TC、字重 400、76px、行高 71、字距 0、白字、黑底 70% 不透明、直角、寬度貼字、底板高 118（內距上 24、下 23、左右 37）、距底 6px（字幕框 y 956–1074）、水平置中、只排一行。
- 直式（plan.json `"format": "portrait"`）：字級、字重、底板、內距和上面同一套；每則最多 10 字，字幕帶 y 1280–1420（R4.7）。
- 每則最多 18 字（直式 10 字；全形 1、半形 0.5），超過要在 rough.srt 拆句（核心 2.4）；估寬超過 1840px 也會提醒；含「，」「。」「；」「：」、一則不到 0.6 秒也會提醒（核心 4.2）。
- build 的處理：同一時間只顯示一則（前一則截到下一則起點）；第 0 秒開始的字幕挪到 0.1 秒；每則用硬開硬關（不淡入），所以不會殘留。產生的檔是 `compositions/captions.html`，每則 id 是 `cg-<句號>`。
- 時間碼不準（字幕比講話早或晚）時，snapshot 看不出來；處理見核心 4.3。

### R5.2 音效

音效對準畫面事件，不放句尾。全部由 build 自動配，AI 只在要換、要拿掉、要加點擊、要配結尾配樂時寫。

**9 個音效＋1 首片尾配樂**：名稱、用途、對齊哪一格、每集上限照 `shared/style.md` 音效段；峰值、預設音量、相對人聲的大小（`targetDb`）在 `shared/template/kit/sfx.json`。`node shared/template/tools/build.mjs --list` 會印出全部。

**情境預設配對**（寫在各情境 `scene.json` 的 `sfx` 區塊）

| 情境 | 主音效＋落點 | 附加音效 |
|---|---|---|
| 01 chapter | `chapter`：章名進場（`titleAt`，段起點後 0.45 秒） | — |
| 02 chapter-tag | — | — |
| 03 side-panel | — | — |
| 04a fs-list | — | — |
| 04b fs-compare | — | — |
| 04c fs-flow | — | — |
| 04d fs-table | — | — |
| 05 two-sides | — | — |
| 06 concept | — | — |
| 07 key-point | `ding`／`alert`／`success`（依 tone）：進場後 0.15 秒 | — |
| 08 steps | — | — |
| 09 qa | — | `ding`：答案進場（音量 ×0.8） |
| 10 tips | — | — |
| 11 summary | — | — |
| 12 keywords | — | — |
| 13 title-list | — | — |
| 14 speaker | `sparkle`：進場後 0.1 秒 | — |
| 15 quote | `sparkle`（`tone: "warn"` 改 `thunder`）：進場後 0.1 秒 | — |
| media | 不配 | `clicks` 每一項一顆 `click` |
| custom | 不配（要就自己寫 `"sfx"`，落點＝段起點） | `clicks` 每一項一顆 `click` |

07 的 tone：`warn`＝`alert`、`good`＝`success`、沒寫＝`ding`。15 的 tone：`warn`＝`thunder`，其他＝`sparkle`。

**字卡動態**：預設音效寫在 `fx/catalog.json` 的 `sfx` 欄（`{ "sound": 名稱, "at": 秒數 }`，沒寫 `at` 就是段起點）；`--list` 字卡動態表的音效欄看得到預設。要 `shine`、`sparkle` 就在那段寫 `"sfx"`。

**覆寫方式**（寫在 plan.json 的那一段）

- `"sfx": "ding"`：換主音效名稱，落點不變。只能寫段落音效；`bgm-cylinder-five` 是配樂，寫在第一層 `outro`。
- `"sfx": null`：這段不要主音效。
- `"sfxExtra": false`：關掉這段的附加音效（含 `clicks`），主音效不受影響。
- `"sfxVolume": -6`：這段音效（主音效＋附加音效）的音量，dB；疊在 `kit/sfx.json` 的預設音量與 `edit.volume.sfx` 上（剪輯台會寫）。
- `"clicks": ["+3.2", "#21@安裝"]`（media、custom 段）：每一項一顆 `click`。時間寫法和紅框 `marks[].at` 一樣：`"+秒數"`＝本段起點後幾秒、`"#N"`／`"#N@詞"`＝綁字幕；只寫畫面上看得到游標按下的地方（錄影用 `media.mjs frame --grid` 確認）。

**結尾配樂**（plan.json 第一層）

- `"outro": { "from": "#N", "music": "bgm-cylinder-five" }`：從第 N 句起播到片尾（不寫 `music`＝不配；這首是 CC BY 4.0，影片說明欄要貼 build 印的出處那一行）；配樂比這段短時，改成對齊片尾起播（報告會說）。
- `"outro": { "from": "#N", "volume": -3 }`：這集配樂再小 3 dB；`"music": null`＝這集不配。

**時間規則**

- 起點＝畫面事件時間 − 音效峰值 ＋ 1 格（理由：放在句尾的音效會晚 1–3 秒，聽起來像沒對上）。
- 一張卡最多一個主音效；兩個主音效相距不到 3 秒時只留前一個，被拿掉的會出現在提醒與報告的「音效時間」欄（`（ding 已拿掉）`）。3 秒間隔只比主音效；附加音效和 `click` 不算。
- 同一段附加音效的起點相距不到 0.2 秒，丟掉後者（也會和主音效比）。
- `--check` 最後印「音效次數」（有上限的寫 `次數／上限`）與「音效密度」；超過上限、某一分鐘主音效太多會 ⚠（規則照 `shared/style.md`）。

要新增情境或改模板見 R14。

音效只能用 `shared/sfx/` 裡的檔案，不另外下載。用 `--sfx <私人資料夾>` 時，那個資料夾要放齊 `kit/sfx.json` 的每個名稱。

---

## R6. 密度與節奏

| 規則 | 數字 | 理由 | build 會檢查？ |
|---|---|---|---|
| 密度 | 照 style.md「字卡文字」；實機操作段往稀的那端 | 整支片不留沒有畫面的空白 | — |
| 開場 | 預設照 style.md「字卡文字」（開場 30 秒不限張數）；`"rhythm": "spaced"` 時開場張數有上限（02 章節角標也算一張），照 build 印的 ⚠ 改 | 作者定案 | ⚠（只在 `"rhythm": "spaced"`；預設照 style.md 不限） |
| 露臉 | 預設照 style.md「情境動畫優先」：段與段直接接上，講者露臉靠疊加版面與子母畫面小視窗；`"rhythm": "spaced"` 時兩段動畫之間要留露臉空檔（章節轉場後接的那段不算），間隔照 build 印的 ⚠ 改 | 作者定案 | ⚠（只在 `"rhythm": "spaced"`；預設照 style.md 連續覆蓋） |
| 連續覆蓋 | 預設（`rhythm` 不寫）：每段講解都有畫面 | style.md「節奏」 | 報告「沒有畫面的區間」（> 1 秒）＋⚠ |
| 不閃 | 兩段之間空 0.05–1 秒時講者會閃一下，要 0 秒相接 | 同上 | ⚠ |
| 同情境 | 不連續三段同一情境；同一章裡同一情境最多三次 | 視覺疲乏 | ⚠（連續三段） |
| 一段一個 | 同一時間只放一個情境（02 章節角標除外） | 兩個強調互搶 | ⚠ |
| 字卡動態 | 一段講解最多一兩張，不和下方字卡同時出現 | 同上 | ⚠ |
| 停留 | 一般卡 2.5–4 秒以上；重點卡（07）至少 4 秒、停到這個重點講完 | 讀得完 | ✖（段長下限） |
| 新訊息停留 | 照 style.md「節奏」的完成態停留 | 讀得完 | ⚠（最後內容停得太短）；✖（完成態太短，照 build 的訊息） |
| 字數 | slots 上限照 `--list`；主句 8–14 字照 `style.md` | 版面放得下；看一眼就懂 | ✖（只檢查 `--list` 上限，8–14 字不檢查） |
| 換卡 | 兩張下方字卡相接時自動處理：前一張延到後一張起點＋0.4 秒，退場和進場同時 | 不要等上一張完全消失 | 自動 |
| 動作秒數 | 照 style.md「節奏」（模板固定） | 作者定案 | 自動 |

核心 4.2 沒列的訊息：

| 訊息（節錄） | 類型 | 怎麼改 |
|---|---|---|
| `在 avoid 名單（使用者說不要用）→ 換別的情境` | ✖ | 換情境 |
| `字幕沒有第 N 句（rough.srt 共 M 句…）` | ✖ | 句號超出範圍 |
| `不是合法的 JSON：…（JSON 不能有註解、最後一項後面不能有逗號）` | ✖ | plan.json 是純 JSON |
| `字卡動態和下方字卡（…）同時出現 Ns → 兩個強調會互搶，錯開或擇一` | ⚠ | 錯開時間或刪一個 |
| `連續三段都是同一個情境 → 換一個情境或合併` | ⚠ | 換情境 |
| `vars 沒寫，會顯示預設文字「…」→ 寫 vars.text` | ⚠ | 補 vars |
| `vars.text：fx 29 沒有這個變數（可用：…）` | ✖ | 改成括號裡的欄位（fx 29 是 `label`、`number`、`unit`） |
| `結尾 …s 超過影片長度 …s，已截短` | ⚠ | 通常可接受（最後一句） |
| `edit.cuts 幾乎剪掉整支影片（剩 Ns）` | ✖ | 剪輯台的 cuts 秒數不對，請使用者在剪輯台檢查 |
| `edit.fadeIn＋fadeOut（Ns）比完成影片長度 Ns 還長` | ✖ | 縮短淡入淡出 |
| `moves[i].to 要放大 N 倍，畫面會糊 → 框大一點，或改用放大鏡 lens` | ⚠ | 照 `→` 改 |
| `lens[i] 期間有運鏡，鏡片位置是用 … 那一刻的畫面算的` | ⚠ | 運鏡和放大鏡錯開 |
| `marks[i] 只停 Ns（< 0.5s，閃一下就不見），已拿掉` | ⚠ | 要留就把 `until` 往後延 |
| `work/cutpoints.json 不是合法的 JSON` | ⚠ | 跑 `media.mjs rough --again` 重新產生；不影響 build，只是 `joins` 對不到剪接點 |

---

## R7. 第二層情境動畫（`type: "custom"`）

### R7.1 什麼時候用：符合判準的情境做動畫

作者的方向：講解在講一個「情境」時，做動畫比單純的字卡好；要不要做照 `shared/style.md`「情境動畫優先」的三條判準。字卡留給名詞、一句重點和提醒。

挑法（講解在講什麼 → 用第一層的哪個情境，還是做情境動畫）在 `shared/template/SITUATIONS.md` §3；要不要做的判準照 `shared/style.md`「情境動畫優先」。

| | 第一層：模板套用 | 第二層：情境動畫 |
|---|---|---|
| 是什麼 | 18 情境＋40 字卡動態 | 一支 `work/hyperframes/compositions/x-<名稱>.html`，從 `shared/template/custom/` 的範例改（R7.5） |
| AI 要做的事 | 在 plan.json 填 `slots`（文字）與綁定的字幕句號 | 改範例的文字、圖示、時間軸，再登記到 plan.json |
| 版面 | 模板固定，不能改（只能用 `css` 微調位置） | 自己排，遵守 R7.3 骨架、R7.3 的版面原則與 R8 硬規則 |
| 什麼時候用 | 講解講名詞、一句重點、提醒 | 照 style.md「情境動畫優先」的三條判準 |
| 數量 | 依密度（R6） | 照 style.md「情境動畫優先」：符合判準的段都做，段與段直接接上 |
| plan.json 寫法 | `"scene": "<key>"` 或 `"type": "fx"` | `"type": "custom"`、`"src"`、`"layout"` |

- 分鏡表的「情境」欄寫 `custom（fullscreen）` 或 `custom（overlay）`，再寫從哪一支範例改；「理由」欄寫講解在講哪一種情境。使用者確認分鏡表後才開始做。
- 每段情境動畫是一支獨立的檔，彼此不相依：分鏡表確認後，可以照 `AGENTS.md`「子代理分工」一段派一個子代理同時做（選用；沒有子代理就照 `.agents/skills/auto-edit-motion/SKILL.md` 一段一段做）。
- 品質關卡：每一段都要通過 R7.6 的檢查，並看過 snapshot 的中段與完成態，才交給使用者看完成影片預覽。
- 兩層在同一個主合成裡一起掛：build 依 plan.json 的順序把它們排進時間軸，第二層的子母畫面、淡入淡出也由 build 加。
- 拿不準的時候：判準照 style.md「情境動畫優先」；講解只是一句話帶過的地方，不要硬做動畫（作者：「影片內容合適時就採納，不合適就不用」）。
- 動畫裡畫了游標按下：用 `P.at('#N@詞')` 定那一拍，plan.json 該段的 `clicks` 寫同一個 `#N@詞`（R5.2）。

### R7.2 檔案與登記

1. 從 `shared/template/custom/` 挑最接近的範例（R7.5），複製到 `work/hyperframes/compositions/x-<名稱>.html`（名稱只用英數與 `-`）。檔名、`data-composition-id`、`<template id>`、`window.__timelines[...]` 四處要一起改成新名稱，所有 id 與 class 的前綴也一起換（例：`xproc-` → `xflow-`）。build 不會碰這個檔。
2. 檔內 `data-composition-id` 要等於檔名（`x-flow`），script 要登記 `window.__timelines['x-flow']`，`<style>` 要放在 `<template>` 裡；不符合時 `--check` 會出錯。
3. 在 plan.json 登記：

```json
{ "id": "x01", "type": "custom", "src": "compositions/x-flow.html", "layout": "fullscreen",
  "from": "#17", "to": "#25e", "anchor": "接著用 Whisper" }
```

| `layout` | 用在 | build 會做什麼 | 你要做什麼 |
|---|---|---|---|
| `"fullscreen"` | 不透明全畫面圖解 | 整段淡入淡出 0.5 秒、加子母畫面（`"pip": false` 可以拿掉）、和相鄰不透明幕接縫不淡 | 第一個子元素放滿版底 `<div class="sc-surface-fs fill"></div>`；主內容右緣 ≤ 1380（範例目前排到 1300）；內容從第 0.5 秒（淡入完）之後才開始動 |
| `"overlay"` | 透明、疊在講者上 | 只在時間到時掛上、時間到拿掉，**不幫你淡入淡出** | 自己寫進場與退場（`P.out(..., P.dur() - P.OUT)`）；不放滿版底；不能壓到 speakerBox |

- 直式：`fullscreen` 的子合成照樣用 1920×1080 寫，build 自動整張縮 0.8475 放進上半資訊窗（R4.7），內容一樣留在 x 120–1300、y 130–880；`overlay` 用 1080×1920 座標寫，文字留在文字安全區（`shared/style.md`「直式」）。

4. 子合成的長度不用手填：結尾寫 `P.end()`（不帶參數），長度自動等於 plan.json 這段的長度（build 把段長帶進子合成，`P.dur()`），`to` 改了不用改檔。root 的 `data-duration` 留著、寫估計值就好，不用和段長一致；`--check` 印 ⚠「data-duration 比段長短」時照 → 改成 ≥ 段長。

### R7.3 骨架（照抄，只改版面與時間軸）

```html
<!doctype html>
<html lang="zh-Hant">
<head><meta charset="UTF-8"><title>x-flow 字幕三道關卡</title></head>
<body>
<template id="x-flow-template">
  <style>
    #x-flow { position: absolute; inset: 0; }
    #x-flow .fill { position: absolute; inset: 0; }
    #x-flow #xflow-card { position: absolute; left: 120px; top: 150px; width: 1180px; }
    #x-flow #xflow-card .sc-wcard__bar { height: 128px; padding: 20px 56px; }
    #x-flow #xflow-row { position: relative; display: flex; gap: 40px; padding: 120px 56px; }
    #x-flow .xflow-node { position: relative; flex: 1; height: 200px; display: flex; align-items: center; justify-content: center;
                          border: 4px solid var(--sc-fs-card-line); border-radius: 12px; color: var(--sc-fs-ink); }
    #x-flow .xflow-on { position: absolute; inset: -4px; border: 4px solid var(--brand); border-radius: 12px; }
  </style>
  <div id="x-flow" data-composition-id="x-flow" data-width="1920" data-height="1080" data-duration="8">
    <div class="sc-surface-fs fill"></div>
    <div id="xflow-card" class="sc-wcard">
      <div class="sc-wcard__bar"><span class="sc-opt">字幕三道關卡</span></div>
      <div id="xflow-row">
        <div id="xflow-n1" class="xflow-node sc-t56 sc-w900"><span class="sc-opt">Whisper</span><i id="xflow-on1" class="xflow-on"></i></div>
        <div id="xflow-n2" class="xflow-node sc-t56 sc-w900"><span class="sc-opt">AI 校對</span><i id="xflow-on2" class="xflow-on"></i></div>
        <div id="xflow-n3" class="xflow-node sc-t56 sc-w900"><span class="sc-opt">人工確認</span><i id="xflow-on3" class="xflow-on"></i></div>
      </div>
    </div>
  </div>
  <script>
  (function () {
    var $q = function (s) { return typeof s === 'string' ? Array.prototype.slice.call(document.querySelectorAll(s)) : s; };
    const tl = gsap.timeline({ paused: true });
    const P = SceneMotion(tl, document.getElementById('x-flow'));
    [ 'in', 'out', 'drift', 'reveal', 'rise', 'maskUp', 'sideIn', 'sideOut', 'morph', 'push', 'count', 'bar', 'stroke', 'icon', 'check', 'type' ].forEach(function (k) { var f = P[k]; P[k] = function (s) { var a = Array.prototype.slice.call(arguments); a[0] = $q(s); return f.apply(P, a); }; });
    [ 'swap', 'axis', 'focus' ].forEach(function (k) { var f = P[k]; P[k] = function (s1, s2) { var a = Array.prototype.slice.call(arguments); a[0] = $q(s1); a[1] = $q(s2); return f.apply(P, a); }; });
    const T1 = P.at('#17@Whisper'), T2 = P.at('#18@AI 校對'), T3 = P.at('#19@人工確認');   // 講到那一站的那個詞
    P.rise('#xflow-n1, #xflow-n2, #xflow-n3', 0.5, { stagger: 0.5 });
    P.in('#xflow-on1', T1);
    P.in('#xflow-on2', T2);
    P.in('#xflow-on3', T3);
    P.end();
    window.__timelines['x-flow'] = tl;
  })();
  </script>
</template>
</body>
</html>
```

骨架的規則（每一條都是 build 或 HyperFrames 會出錯的點）：
- 檔頭只有 `<meta charset>` 與 `<title>`：`<style>`、畫面、`<script>` 全部包在 `<template id="<id>-template">` 裡（放在 `<head>` 的 style 會被丟掉）。
- root 是 `<div id="<id>" data-composition-id="<id>">`，三處 id 一致；root 不加 class（滿版底放子層 `.fill`）。
- 所有 CSS 選擇器前面加 `#<id> `，所有自訂 id 與 class 加前綴（例 `xflow-`）。理由：全部子合成掛在同一份文件，沒加範圍的 CSS 會套到別的卡。
- `$q` 與兩行 `forEach` 照抄：讓 `SceneMotion` 在子合成範圍內找元素。
- 時間軸的時間是「本段起點之後的秒數」。要對到字幕就寫 `P.at`，以 `@詞` 為主：`P.at('#18@逐字稿')`＝講到那個詞（每一站、每一拍的出現時間＝講到那個詞，差 ≤ 0.5 秒，audit 的「綁句對不上」會量；`--check` 的「文字對時」不量 custom）；`P.at('#18')`＝那句開頭（那句一開口就是這個詞時才用）、`P.at('#18e')`＝那句結尾；要晚一點加第二個參數 `P.at('#18@逐字稿', 0.3)`。站名、項目、關鍵詞在句中間或句尾時一定用 `P.at('#N@詞')`，不要綁句首（綁句首，字會比講到早 1–3 秒出現）；剛好是那句第一個詞才寫 `P.at('#N')`。audit 的 ⚠ 綁句對不上會給改法。build 會把句子時間換成這段的秒數；句號或詞找不到時 `--check` 和 audit 都會 ✖。只綁每個新訊息的第一拍，同一件事接著發生的步驟用「上一拍 + 秒數」。不要用 `--check` 報告的起點自己算秒數。
- 拍點常數（`const T1 = P.at(…)`）的名字用大寫英文字母開頭、只用大寫字母和數字（`T1`、`ALL`、`FIX`、`R2`），不要有底線或小寫；檔頭【D 下限】用同一個名字。
- 結尾一定要 `P.end()`（不帶參數）：長度自動等於 plan.json 這段的長度。要用到段長（例：overlay 自己退場 `P.out(..., P.dur() - P.OUT)`）寫 `P.dur()`。
- 顏色只用 token（`var(--brand)`、`var(--sc-*)`、`var(--v2-*)`），不寫色碼。理由：使用者換主色、換主題（亮／暗）後，寫死的顏色不會跟著變。陰影、光暈、漸層只能用 `var(--v2-*)`，不寫 `box-shadow`、`filter`、`gradient` 的字面值（R8 #3）。要「亮起來」用 `P.spot`（聚焦），不要用 GSAP 補間顏色。
- 動畫裡要配音效的拍點寫 `const T = P.sfx('success', '#38@兩支')`（回傳秒數，同時當這一拍的動畫時間；`P.sfx('ding', '#41', 0.2)` 晚 0.2 秒）。音效名、ref 都寫字串字面值，off 寫數字；build 會排成 `<audio>`，算進 `--check` 的音效次數與密度。不要在 plan.json 另外寫這些音效。寫成變數或 `+` 組字串、音效名不在 `kit/sfx.json` 都會 ✖；綁到段外的句子會被拿掉並 ⚠（USAGE.md 4.2）。
- 動畫照確認過的動畫分鏡一拍一拍做：每一拍一個拍點常數（`const T1 = P.at('#38@兩支')`，分鏡「音效拍點」有寫就用上一條的 `P.sfx`），「動態」欄的每個名稱用 `shared/template/BEATS.md` 語彙表「對應」欄的方法。只用 `SceneMotion` 的方法：
  - v2：進場 `P.wipe`／`P.drift`／`P.pop`／`P.grow`／`P.slide`／`P.in`；字 `P.chars`／`P.type`／`P.count`；線 `P.stroke`／`P.comet`／`P.icon`／`P.check`／`P.strike`／`P.bar`；強調 `P.sheen`／`P.marker`／`P.punch`／`P.ripple`／`P.stamp`（蓋章，對象是自己寫的 `<b class="sc-stamp">過時</b>`，和被蓋的元素放在同一層、不要放進它裡面；`{ on: '#被蓋的' }` 落地時讓它退焦）；`P.strike` 加 `{ wave: true }` 是波浪線；焦點 `P.spot`／`P.dim`／`P.rack`（換焦點：講到的那個清楚、同組其他模糊稍淡）；鏡頭 `P.cam`；微動 `P.idle`；退場 `P.wipeOut`／`P.slideOut`／`P.out`；拍點音效 `P.sfx`。參數與預設值寫在 `shared/template/kit/scene-motion.js` 開頭的「v2」那一段。
  - 舊範例裡的 `P.rise`／`P.reveal`／`P.maskUp`／`P.swap`／`P.axis`／`P.focus`／`P.push`／`P.morph` 還能用；新寫的拍照 BEATS.md。
  - 這些方法會自動處理同一元素第二次補間的 `immediateRender:false`，秒數與曲線是 kit 常數（style.md「節奏」），不要自己填。不要用 GSAP 的 `onUpdate`／`onComplete` 改畫面：HyperFrames 跳到任意時間截圖時不會觸發回呼，畫面會停在錯的狀態。

- 節奏：任何 1 秒內新出現的元素 ≤ 2 個、兩個之間 ≥ 0.12 秒；新資訊停 ≥ 1.2 秒、最後一幕 ≥ 1.5 秒（style.md「節奏」；audit 會 ⚠）。亮框、同位置換內容、跟著卡片一起出現的子元素不算新元素；逐字出現的一串字、同一個方法一起錯拍的一組各算 1 個；微動（`P.idle`）不算動作，不影響停留。

| 方法 | 做什麼 | 預設 |
|---|---|---|
| `P.at(ref, off)` | 綁句：回傳這一句（或這個詞）在本段的秒數，`off`＝再往後幾秒。`ref` 寫法同 plan.json：`#18`、`#18e`、`#18@詞`、`#18+0.3`（`@詞` 要寫成字串字面值，build 才算得到）；也可以直接寫秒數 `P.at(3.2)` | `off` 0；找不到不會讓動畫壞掉，但 `--check` 與 audit 會 ✖ |
| `P.dur()`／`P.end()` | 這段的長度／把時間軸撐到這段結尾 | build 注入；plan.json 的 `to` 改了自動跟著變 |
| `P.focus(group, active, at, {dim, dur, ring})` | 一組裡只亮一個：active 亮度 1、其他降到 `dim`；`ring` 是每個元素裡亮框的選擇器（例 `'.xwarn-on'`），active 的框淡入、其他淡出；active 寫 `null`＝全部恢復。要照時間先後寫，而且每個元素要先進場 | `dim` 0.4、0.4 秒、`sine.inOut` |
| `P.type(sel, at, {cps, dur, caret})` | 打字：文字逐字出現，框的大小一開始就是打完的樣子（不會跳）；`<br>`、關鍵詞 `<span>` 原樣保留；打完游標消失（不閃） | 8.5 字／秒、等速 |
| `P.morph(sel, at, {width, height, left…}, {from})` | 同一個容器變形（寬高或位置）。往回 seek 要帶 `from`；連續變形時，後一次的 `from` 寫成前一次的終點 | 0.7 秒、`power2.inOut`（不過衝；要彈一下自己傳 `ease`） |
| `P.push(sel, at, {to, from, origin})` | 慢速鏡頭推進，只用在全畫面。推進後座標＝origin＋scale×(靜止座標−origin)，自己算有沒有出界；元素不能加 will-change | 1→1.4、2.4 秒、`sine.inOut` |
| `P.count(sel, at, {from, to, decimals, prefix, suffix, comma})` | 數字計數器：起點之前顯示 from、終點之後顯示 to，往回 seek 也對。元素只放數字（單位另放一個 span），固定寬度 | 1.2 秒、`power2.out` |
| `P.bar(sel, at, {from, to})` | 量條長度（`scaleX`，左緣為原點）。要「同一根撐破」就用 `P.morph` 把軌道變寬，填充寬 100% 跟著長 | 0→1、0.8 秒 |

寫 custom 時的版面原則（作者在插入動畫上定案的規則，模板已經照做，自己排版時要照做）：
- 圖示先行、多互動、少文字：每個概念先放圖示，畫面上的文字壓到 10 字以內的關鍵詞，完整句子交給字幕。
- 圖示和文字是同一塊（同一顆膠囊、同一列），不要做成「徽章＋旁邊另一個標籤」兩個元件；同一組清單每一條都有圖示。
- 先有節點再畫連接線；連接線兩端貼齊元件，離經過的元件至少 16px。
- 後出現的元素不能擠壓已經在畫面上的元素：最終版面先排好，預留位置。
- 並排的元素同高、同中線。
- 一個畫面 3–5 個重點，穩定停留；最後一幕至少停 1.5 秒（`P.HOLD_END`）。
- 不加講解沒講的裝飾（重複的小卡、分鏡沒寫的掃光與外圈）；光澤掃過、漣漪只用在動畫分鏡寫了的強調拍；截圖與手機畫面一律等比，不擠壓。

### R7.4 怎麼讀 kit 的樣式

- `shared/template/kit/scene.css` 第 1–100 行：class 一覽與組裝範例（`.sc-wcard` 全畫面主卡、`.sc-card` 深色卡、`.sc-pill` 膠囊眉標、`.sc-icon` 圖示圓、`.sc-num` 序號圓、`.sc-row` 橫排、`.sc-t30`–`.sc-t150` 字級、`.sc-w500／700／900` 字重、`.sc-kw` 關鍵詞色、`.sc-opt` 光學置中）。
- `shared/template/kit/theme.css`：顏色 token（`--sc-fs-bg`、`--sc-fs-card`、`--sc-fs-card-line`、`--sc-fs-ink`、`--sc-fs-kw`、`--sc-fs-node`、`--sc-card-solid`、`--sc-ink`、`--sc-mute`、`--sc-warn`、`--sc-good`）與 `kit/brand.css` 的 `--brand`、`--brand-ink`、`--brand-text`。
- `shared/template/kit/scene.css` 後段「動態 v2」：亮暗主題 token `--v2-*`（亮色在 `:root`、暗色在 `:root[data-theme="dark"]`；例 `--v2-card`、`--v2-card-shadow`、`--v2-ink`、`--v2-mute`、`--v2-node`、`--v2-spot-glow`）。陰影、光暈、漸層只用這組（R8 #3）；換主題時自動跟著換。
- 最接近的模板當範本：流程看 `shared/template/scenes/04c-fs-flow/template.html`，清單看 `04a-fs-list`。build 產生的 `work/hyperframes/compositions/sNN-*.html` 是完整的子合成實例。
- 圖示：寫 `<span class="sc-icon" data-icon="名稱"></span>`，build 會自己把 svg 填進去，不要自己貼 svg、不要跑 node 或 python 撈。名稱用 `node shared/template/tools/build.mjs --project projects/<專案> --icons 手機,雲端` 查（只查名稱；中文查不到就換英文關鍵字），不要打開 `shared/template/kit/icons.json`（一行 586 KB）。大小由 `.sc-icon` 的 `--i` 決定。容器進場後把線描出來：`P.rise('#xflow-ico1', 1.0); P.icon('#xflow-ico1', 1.0 + P.BEAT);`（`P.icon` 描容器裡所有的線，形狀沒有 `pathLength` 會自動補）；總結、回顧用 `P.check`（先描圓、0.25 秒後描勾），流程圖的站不打勾。
- 版面：`shared/template/kit/scene-layout.js` 照 `data-layout`／`data-gap`／`data-justify`／`data-align`／`data-row`／`data-slot`／`data-links` 排位置、畫連接線（有箭頭時頭是另一條 path `<a>-<b>-head`，`P.stroke`／`P.comet` 描本體 `<a>-<b>`，頭在描到箭尖時淡入；刻意橫過元件的線加 `data-layout-ignore`，audit 不當連接線量）（寫法與規則見 `shared/style.md`「版面」）。`SceneLayout.apply(root)` 在 mount 時自動跑一次（不進 timeline，亂序 seek 不受影響；改了 DOM 要重排寫 `SceneLayout.apply(root, { force: true })`）；`SceneLayout.measure(root)` 給 audit 量版面。相鄰元件照放大 1.1 倍（`SCALE_MAX`）預留，聚焦、過衝不會互碰。間距 token `--sc-grid`、`--sc-pad-card*`、`--sc-gap-*`、`--sc-link-*` 在 `kit/scene.css` 的 `:root`。
- 字型不用宣告：主合成已載入 `kit/fonts.css`，文字自動用 Noto Sans TC。真的要寫就寫 `font-family: var(--font-cjk)`，不寫字型名。

### R7.5 情境動畫範例（`shared/template/custom/`）

48 支情境＋x-scene 骨架與 2 段參考都照 R7.3 骨架、作者的版面原則與 seek 規則驗證過（build --check、audit 0 ✖、亂序 snapshot）。每支檔頭固定 6 小節：適用的講解、不要用在哪裡、要改的地方、綁句欄位、D 下限、版面。

綁句：站名、項目、關鍵詞在句中間或句尾時一定用 `P.at('#N@詞')`，不要綁句首（綁句首，字會比講到早 1–3 秒出現）；剛好是那句第一個詞才寫 `P.at('#N')`。audit 的 ⚠ 綁句對不上會給改法。範例的綁句都是 `@詞`（x-prompt 的 TYPE 例外：提示詞一開口就開始打）。

| 講解在講 | 範例檔 | 畫面上發生什麼 | 要改的地方 |
|---|---|---|---|
| 一條有先後的過程，3–4 站、每站一句，站不排成一直線（「先錄影，接著轉逐字稿，再列清單，最後初剪」） | `x-process.html` | 站逐步亮起、曲線連接線描出來，走過的站只換框色、不打勾 | 標題（≤ 10 字）、站名（≤ 4 字）、四個圖示、`T1..T4` 綁的句號；站數不是 4 照檔頭改 |
| 訊號、資料、聲音一路經過幾個裝置，3–4 站（「聲音從麥克風進錄音介面，再進電腦，最後到剪輯軟體」） | `x-process-trace.html` | 晶片上下錯落 → 講到一站，訊號帶發光頭沿直角走線跑過去、晶片變主色、指示燈亮 → 最後一道光跑完全程 | 標題（≤ 10 字）、站名（≤ 4 字）、圖示、`T1`–`T4` |
| 做完最後一步又回到第一步，3–4 站（「每週拍片、上片、看數據、改腳本，改完再拍下一支」） | `x-process-loop.html` | 站排成一圈、中間是循環名 → 講到一站，弧線箭頭帶發光頭繞過去、那一站亮起 → 最後一段接回第一站、光繞一圈 | 標題（≤ 10 字）、中間主題（≤ 4 字）、站名（≤ 3 字）、圖示、`T1`–`T4` |
| 比喻：生活物件 → 技術概念 → 一句代價（「Skill 像使用說明書，AI 照著做，寫錯就照錯做」） | `x-metaphor.html` | 左框（生活物件）彈出、聚焦 → 虛線預告右邊還有一個 → 箭頭彗星描過去、右框（技術概念）彈出、聚焦，左框走過 → 結論句逐字浮出、關鍵詞螢光筆，上面兩框退焦 → 警示條彈出、壞的詞重拍（選用） | 標題（≤ 10 字）、左右名稱（≤ 6 字）、結論與限制句（各 ≤ 10 字）、三個圖示、`T1`–`T4` 綁的句號；沒有限制句刪警示條那一拍 |
| 同一件事換個做法，時間或成本差很多（「手動剪 3 小時，AI 剪 20 分鐘」） | `x-before-after.html` | 左右兩欄：左欄（舊做法）擦開、量條長滿 → 講到缺點，缺點被劃掉、左欄壓暗 → 箭頭走到右欄，右欄（新做法）彈出、量條用同一把尺 → 講到省下，右欄數字螢光筆、光澤掃過、聚焦（有填 `delta` 時漲跌標在這一拍彈出） | 標題（≤ 10 字）、兩欄名稱（≤ 5 字）、數字與單位、缺點與右欄說明（各 ≤ 8 字）、兩個圖示、右欄量條比例（新 ÷ 舊）、`BEFORE`／`PAIN`／`AFTER`／`SAVE` 綁的句號 |
| 數量超過上限，再處理掉大部分（「NG 32 段，剪掉 28 段」） | `x-numbers.html` | 數字卡彈出 → 數字提前 1.2 秒開始滾、量條同速長，超過上限時軌道撐破、變警示色，講到數字那一刻落定 → 第二張卡用同一把尺，同樣提前 1.2 秒滾、落在那個詞，第一張退焦 | 標題（≤ 10 字）、兩張卡的名稱（≤ 4 字）、單位（≤ 2 字）、數字、撐開寬度與第二條比例（檔頭算法）、圖示、`T1`–`T3` 綁的句號 |
| 一組 2–3 條警告，一條一句（「有三件事要小心：……」） | `x-warnings.html` | 講到哪條，那條才彈出、聚焦，其他降到 0.6；右邊範例面板在同一個位置跟著換 | 標題（≤ 10 字）、三列文字（≤ 8 字，三列字數差 ≤ 1 字）與圖示、右側三張示意（圖示＋≤ 7 字）、`W1..W3` 綁的句號；只有 2 條照檔頭改 |
| 提示詞（≤ 49 字）、終端機指令、網址（「我是這樣下提示詞的：……」） | `x-prompt.html` | 提示詞框先擦開 → 文字逐字打出 → 講到關鍵詞，那個詞變主色（不用底線、不加色帶），前一個變回墨色 → 提醒膠囊彈出、提示詞框退焦 | 標題（≤ 10 字）、提示詞（每行 ≤ 18 字、≤ 3 行）、兩個關鍵詞、提醒（≤ 10 字）、`TYPE`／`K1`／`K2`／`NOTE`；指令、網址照檔頭變體表改 |
| 演一次問 AI、AI 回答（「我問它這段可以剪掉嗎？它馬上回我：可以，保留第二次就好」） | `x-prompt-chat.html` | 輸入膠囊逐字打出問題 → 送出時紙飛機飛上去、變成主色泡泡 → AI 三個點跳動 → 回答泡泡彈出、逐字打出 | 標題（≤ 10 字）、問題（≤ 16 字）、回答（每行 ≤ 18 字、≤ 2 行）、`TYPE`／`SEND`／`REPLY` |
| 打一行指令、看它跑完（「打 node media.mjs rough ep2，它先找出重講，再把字幕對好」） | `x-terminal.html` | 深色終端機：指令逐字打出 → 轉圈「處理中」→ 講到每個步驟印一行輸出 → 完成行與新的提示字元 | 視窗標題、指令（≤ 32 個半形字寬）、兩行輸出（≤ 14 字）、完成行（≤ 16 字）、`RUN`／`STEP1`／`STEP2`／`DONE` |
| 講一小段程式在做什麼（≤ 6 行） | `x-terminal-code.html` | 深色編輯器：程式碼逐字打出（等寬字、關鍵字／函式／字串上色）→ 講到某件事那幾行亮起標示帶 → 執行時結果列印出綠色勾 | 檔名、程式碼（≤ 6 行、每行 ≤ 38 個半形字寬）、上色的 span、結果列（≤ 16 字）、`TYPE`／`H1`／`H2`／`RUN` |
| 介面操作，但沒有螢幕錄影（「在設定頁按右上角的匯出，就會跳出完成通知」） | `x-ui-mock.html` | 示意視窗全貌錯拍彈出 → 講到頁面，聚焦頁面標題、鏡頭往焦點帶 12%（不推近）、游標出現 → 游標移到按鈕按下（聚焦、漣漪）→ 跳出通知、介面退焦 | 視窗標題（≤ 16 字）與頁面標題（≤ 6 字）、側欄三項（≤ 4 字）、按鈕文字（≤ 4 字）、通知（≤ 8 字）、`ZOOM`／`CLICK`／`RESULT`；改了按鈕位置照檔頭同時改兩個數字；plan.json 寫 `"clicks"` |
| 很多軟體、通知亂成一團，換成一個工具後全部收整齊（「通知一直跳；交給 Auto Edit 一鍵歸位」） | `x-ui-mock-tidy.html` | 4 個小視窗歪斜疊著 → 3 則通知跳出 → 大視窗擦開、小視窗飛進去排成 2×2 → 「全部歸位」勾勾彈出 | 視窗名（≤ 4 字）、通知（≤ 5 字）、大視窗標題（≤ 12 字）、完成標籤（≤ 4 字）、`MESS`／`TIDY`／`DONE` |
| 資料在裝置之間怎麼走、不經過雲端（「手機的照片直接傳到電腦，不經過雲端」） | `x-architecture.html` | 兩個裝置和雲端先出現、雲端退焦 → 講到「直接」，直連線描出、手機聚焦 → 三個檔案沿直連走到電腦、電腦亮起 → 雲端先亮回再被劃掉 → 結論膠囊彈出、逐字落下 | 標題（≤ 10 字）、兩個裝置（圖示＋≤ 4 字）與中繼（圖示＋≤ 3 字）、結論（≤ 6 字）、`PATH`／`FLOW`／`CUT` |
| 一樣東西傳給好幾個人（「把連結傳給客戶、主管和字幕師，三個人都收到就能開始審」） | `x-architecture-send.html` | 寄件端＋3 個收件人 → 講到一個收件人，紙飛機沿弧線飛過去、留虛線尾跡、那一列打勾 → 都收到時結論膠囊彈出 | 標題、寄件端與收件人名稱（≤ 4 字）、結論（≤ 6 字）、圖示、`S1`–`S3`／`ALL` |
| 一個東西在 3 台裝置之間接力（「手機拍完自動上傳到雲端，回家在電腦上直接剪」） | `x-desk.html` | 2.5D 地台上站著三個裝置、站名寫在地台正面 → 講到一站，鏡頭帶過去、檔案沿地上的虛線走到那一站、那一站換狀態 → 講完鏡頭回正 | 標題、站名（≤ 3 字）、三個裝置的 `data-illus`、`T1`–`T3` |
| 一個起點分成 2–3 條路，或 2–3 個來源匯成一個（「同一支錄影，可以剪長片、剪短影音，或直接出逐字稿」） | `x-branch.html` | 起點和分支先出現、分支一起壓暗 → 講到哪條，那條曲線彗星描過去（第 1 條也是）、那條聚焦、鏡頭往焦點帶一點；講過的和沒講的分支一起壓暗 | 標題（≤ 10 字）、起點（≤ 4 字）、分支（≤ 5 字，三個字數差 ≤ 1 字）與圖示、`B1..B3`；兩條或匯流照檔頭變體表改 |
| 由下往上的組成，3–4 層、從底層講起（「最底層是手機上的錄影 App，中間靠區網連線，最上層是電腦端的控制台」） | `x-stack.html` | 先描地基線 → 講到哪層，那層從上方落下、圖示描線、聚焦（只放大 1.02），下面的層壓暗 → 講到「合起來」全部亮回 | 標題（≤ 10 字）、每層名稱（≤ 6 字）與說明（≤ 12 字）、四個圖示、`T1..T4`／`ALL`；3 層照檔頭【版面】改 top 與地基線 |
| 由下往上、越上面越接近目標，從底層講起（「器材、剪輯流程、內容企劃，最上面才是個人品牌」） | `x-stack-podium.html` | 地面線先出現 → 講到一層，那一層從平躺翻起來疊上去（越上層越窄）→ 合起來時最上層換主色 | 標題、每層名稱（≤ 5 字，最上層 ≤ 4 字）、圖示、`T1`–`T4`／`ALL` |
| 一組要確認／要完成的事，2–4 項（「包含新增專案、下載 APP、配對手機、調整解析度」） | `x-checklist.html` | 空框、進度軌道和「0 / 4」一開始就在 → 講到哪項，那列聚焦、字浮出、打勾，進度條和計數跟著走 → 講到「全部好了」全部亮回、進度條換完成色 | 標題（≤ 10 字）、每項文字（≤ 14 字，動詞放前面）、`T1..T4`／`ALL`；沒有圖示（勾就是圖示）；項數變了分母自動跟著變 |
| 交給 AI 或工具跑的 2–4 項工作，每項有結果（「先讀逐字稿、找出重講、列剪輯清單，最後產生字幕」） | `x-checklist-ai.html` | 目前那一列的圈圈在轉 → 講到一項，換成打勾、右邊跳出結果、下一列開始轉、進度條前進 → 全部完成換完成色 | 標題、項目（≤ 10 字）、結果（≤ 6 字）、`T1`–`T4`／`ALL`（沒有圖示） |
| 有時間先後的 3–4 個點：年份、版本、階段，或「這集分成三個部分」 | `x-timeline.html` | 橫軸和空心點先出現 → 講到哪個點，進度走到那裡、點填滿、卡片（圖示＋年份或序號）浮出、下方一行說明 | 標題（≤ 10 字）、每點年份或序號（4 位數或 ≤ 2 字）、說明（≤ 8 字）、圖示、`T1..T4`；3 點刪第 4 點，位置自動排 |
| 兩個選項在 2–3 個面向上比，每個面向有數字（「手動剪要 180 分鐘、AI 只要 20 分鐘；手動 6 個步驟、AI 只剩 2 個」） | `x-versus.html` | 兩個對手標頭先出現 → 每個面向一拍：那一列彈出，A 的條往左長、B 的條往右長、數字同時跑、贏的數字重拍，前一列退後（亮度 0.6、縮小 0.96）→ 結論時贏家標頭底色亮起、光澤掃過（選用） | 標題（≤ 10 字）、兩個標頭（≤ 4 字）與圖示、面向名稱（≤ 4 字）、`DATA` 那一行（數字 ≤ 4 位、誰贏）、`WINNER`、`T1..T3`／`WIN`；2 個面向照檔頭刪 |
| 一個主體＋2–4 個短名詞：毛病、零件、用途（「腳架不穩造成畫面晃動，或衣服太薄」） | `x-callout.html` | 中央主體圖示圓先彈出 → 講到哪個詞，四角之一的標籤彈出、引線彗星描到主體、那個標籤聚焦，上一條引線退焦 → 講到總結全部亮回 | 標題（主體與主題，≤ 10 字）、主體圖示、標籤（≤ 4 字）與圖示、`T1..T4`／`ALL`；3 個或 2 個標籤照檔頭刪 |
| 一個 App 或產品的 2–4 個功能（「下載就能用、不用換卡、安卓也能用，還能隨時加值」） | `x-callout-phone.html` | 手機在中間、背後同心圓 → 講到一個功能，手機送出漣漪、那顆膠囊從旁邊彈出並聚焦 → 總結時全部亮回、手機打勾 | 標題、膠囊（≤ 5 字）、圖示、`T1`–`T4`／`ALL` |
| 一個看得見的物件由哪幾個部分組成（「這套拍片架從上到下是鏡頭、手機、雲台和三腳架」） | `x-callout-parts.html` | 主體被馬克筆畫出來、零件表用紙膠帶貼上 → 講到一個零件，編號圓彈出、引線指到那個部位、那一列亮起 | 標題、主體名稱（≤ 6 字）、零件名（≤ 4 字）、主體的 `data-illus`、部位的 `data-at`、`T1`–`T4`／`ALL`（沒有圖示） |
| 帶觀眾走過一個資料夾結構，3–9 列、最多 4 層（「一支影片一個資料夾，統一放在 projects 底下；example 裡有講稿和 assets，assets 分四類」） | `x-folder.html` | 像檔案總管的樹狀目錄 → 講到一列，樹狀線從上一層長過去、那一列滑入、圖示描線、聚焦，上一層資料夾換成打開的圖示，之前的列退焦 → 註記（「自動產生」）跟著那一列或晚一點彈出 → 總結時全部亮回 | 標題（≤ 10 字）、`TREE` 那一行（名稱 ≤ 10 字、第幾層 0–3、種類、註記 ≤ 5 字，3–9 列）、`T1`–`T9`／`N1`–`N9`／`ALL`；綁在段頭 1.6 秒內的列開場就一起出現（第二段接上一段的樹時，講過的上層綁這段第一句）、沒有的列寫 `-1`；沒有圖示欄位（圖示照種類） |
| 同一個量在 3–6 個時間點的變化，最後點出現在的值（「開台第一個月 200 人訂閱，半年後 2 千，今年破兩萬」） | `x-trend.html` | 講到第一個值，基線和長條由左到右逐根長出 → 數字提前 1.2 秒開始數、趨勢線彗星描過去，講到最後的值落定、最後一根換主色 → 標題列右端的結論膠囊（選用） | 標題（≤ 10 字）、單位（≤ 3 字）、結論（≤ 8 字）、`DATA` 那一行（3–6 組、≤ 999999 的整數）、圖示（上升／下降）、`T1`／`T2`／`T3`；轉折原因要標出來時加選用的標註拍 `TN`（`NOTE`＝從第幾組起，`#xtr-note` ≤ 6 字） |
| 同一個量 3–5 個時間點，數字小、數得出來（「第 1 集剪 8 小時，第 10 集 4 小時，現在只要 2 小時」） | `x-trend-blocks.html` | 圖例先出現（1 格＝多少）→ 講到一組，方塊一格一格掉下來疊好、數字數到 → 最後一組主色、重拍 | 標題、圖例（≤ 6 字）、`DATA`（3–5 組、每組 1–10 格）、`UNIT`、`T1`–`T4`（沒有圖示） |
| 一個比例或一段時間，前後各一句起點與結論（「32 段 NG 裡，AI 剪掉了 87%，也就是 28 段」「從萌生想法到完成原型只花了一個小時」） | `x-ring.html` | 講到起點，起點列擦開、圓環彈出 → 數字提前 1.2 秒開始滾，主色弧從 12 點鐘描線走到那個比例、數字同步跑，講到數字落定 → 講到結論，終點列擦開、箭頭描下來、圓環退焦；倒數從滿走到空 | 標題（≤ 10 字）、中央單位（≤ 3 字）、右邊兩列（≤ 8 字）與圖示、`RING` 那一行（百分比／計時／倒數）、`R1`／`ARC`／`R2` |
| 一件事由 3–5 個面向組成、缺一不可（「一支好影片要顧到內容、剪輯、聲音和畫面」） | `x-ring-facets.html` | 切成幾段的圓環＋右邊編號清單 → 講到一個面向，那一段描成主色、編號圓彈出、清單那一列聚焦 | 標題、環中間主題（≤ 4 字）、名稱（≤ 5 字）、說明（≤ 10 字，選填）、`T1`–`T4`／`ALL`（沒有圖示） |
| 幾個人裡有幾個（「10 個點進來的觀眾，有 7 個看不到 30 秒就滑走」） | `x-crowd.html` | 10 個象形小人逐個彈出、數字數到 10 → 講到那幾個，身體換主色、其他人淡下去 → 結論膠囊（選用） | 標題、兩行說明（≤ 7 字）、膠囊（≤ 8 字）、`xcrd-hot` 的人數與 `HOT`、`T1`–`T3`（沒有圖示） |
| 兩個方法比快慢、量看得到（「手動剪一支一支排隊要 5 天，自動剪整批一起跑 1 天就好」） | `x-crowd-queue.html` | 兩條跑道各 5 個小人 → 講到慢的，最前面的人慢慢走到終點 → 講到快的，整排一起走到終點、換主色 → 結論膠囊（選用） | 標題、跑道名稱（≤ 3 字）、時間（≤ 4 字）、膠囊（≤ 8 字）、圖示、`T1`–`T3` |
| 轉述新聞、公告、官方數據，一個大數字＋一段變化（「YouTube 說 Shorts 觀看次數是去年的兩倍」） | `x-news.html` | 沒有主卡：快訊標籤翻起來、標題條擦開 → 講到數字，大數字卡翻起來數上去 → 講到變化，走勢卡畫線、終點亮起漲幅 → 講到出處，來源列擦開 | 標籤（≤ 2 字）、標題（≤ 14 字）、數字與單位、走勢點、漲幅（≤ 5 字）、來源（≤ 24 字）、圖示、`T1`–`T3` |
| 一筆一筆加起來是多少，3–5 項＋合計（「找 NG 90 分鐘、上字幕 60 分鐘……加起來 250 分鐘」） | `x-receipt.html` | 沒有主卡：出紙口彈出、收據抬頭印出來 → 講到哪一項，那一列由上往下印出來、金額落下 → 講到合計，數字從 0 數上去、重拍、螢光筆，條碼和撕口印出來 | 抬頭（≤ 8 字）、項目（≤ 6 字）與金額（≤ 5 個字元）3–5 列、合計名稱（≤ 3 字）、`TOTAL`、單位（≤ 2 字）、`T1`–`T5`／`SUM` |
| 整支片最想讓觀眾記住的那個詞（「今天要講的就是，剪片」）；一集最多 1 次 | `x-wordcut.html` | 沒有主卡：講到引子，大視窗彈出（報紙材質）→ 講到那個詞之前 0.8 秒開始每 0.2 秒硬切一種材質（描邊、色塊、殘影、終端機）→ 講到那個詞，停在主色大字、重拍、底線擦開、副標浮出 | 那個詞（≤ 4 字，每個 `.xwc-w` 都改）、副標（≤ 12 字，選填）、`OPEN`／`HIT` |
| 講者露臉講一句話，句子裡連續點到 2–4 個重點詞（「剪停頓、上字幕、配音效，還會加字卡」）；`layout: "overlay"` | `x-tags.html` | 講者畫面不動 → 講到哪個詞，那個詞變成小標籤從頭的旁邊彈出、細線描到頭邊、線尾圓點彈出；左右交錯排在臉的兩側（照 `speakerBox` 算，不擋臉）→ 段尾前 0.3 秒整組淡出 | 詞（≤ 5 字）2–4 個、`T1`–`T4` |
| 講者露臉，反覆強調一個詞、喊口號、情緒最滿的那一句（「它就是你的剪輯師」）；`layout: "overlay"`，一集最多 2 次 | `x-wall.html` | 講到那個詞，講者背後整面主色的牆由下擦開、實心字三排彈出 → 講到第二次，空心字三排彈出 → 段尾前 0.3 秒淡出。build 自動把這一段的講者去背、疊在牆上（第一次要下載去背模型） | 那個詞（≤ 5 字）、第二個詞（選填）、`HIT`／`AGAIN` |
| 講者露臉，講到一個可以當刊名的概念詞，後面接著幾個重點（「很多人都聽過一個詞叫品味」）；`layout: "overlay"`，一集最多 1 次 | `x-magazine.html` | 講到引子，封面細框擦開、期別小字浮出 → 講到那個詞，英文刊名逐字彈出（在講者後面）→ 講到後面的重點，左側封面標題錯拍彈出、條碼擦開 → 段尾前 0.3 秒淡出。講者自動去背 | 刊名（英文大寫 ≤ 7 個字母）、上緣三個小字、封面標題 1–3 條（數字＋一行字）、`OPEN`／`HIT`／`MORE` |
| 講者露臉，開場第一句或整支片情緒最高的那一下（「直到我發現可以跳出來」）；`layout: "overlay"`，一集最多 1 次，要有 `speakerBox` | `x-breakout.html` | 講到引子，紙底淡入、白邊相框彈出（講者在相框裡）→ 講到那個詞，相框上緣縮到下巴、頭從相框上面冒出來、標籤彈出 → 段尾前 0.3 秒淡出。講者自動去背，相框位置照講者框算 | 標籤（≤ 8 字）、`OPEN`／`HIT` |
| 先講數量很多、再點名只留下一個，12–30 項（「這一年我試了三十個工具，最後留下來的只有這一個」） | `x-scroll-brake.html` | 左邊大數字滾到項數、右邊長清單第一屏錯拍彈出 → 講到「這一個」前 3.6 秒清單開始捲、越捲越快 → 急剎停在留下的那一項：準星咬住、其他列退暗、數字換成主色的 1 | 視窗標題（≤ 10 字）、小標（≤ 6 字）、單位（≤ 7 字）、`ITEMS`（12–30 項，每項 ≤ 6 字）、`PICK`、膠囊（≤ 4 字）、`TC`／`TB`（沒有圖示） |
| 一句提示詞生出一整份結構，2–3 章、每章 0–2 個重點（「它就把整份大綱長出來，分成三個章節」） | `x-prompt-tree.html` | 沒有主卡：輸入膠囊逐字打出 → 送出、鏡頭拉回 → 根節點 → 章節 → 重點，每長一層鏡頭往上帶 → 總結膠囊 | 提示詞（≤ 22 字）、根節點（≤ 8 字）、`TREE`（章 ≤ 5 字、重點 ≤ 4 字）、總結（≤ 7 字，選填）、`TT`／`TR`／`TB`／`TL`／`TM` |
| 先講 2–3 個痛點，再給一個解法，20 秒內講完（「啟動不同步、要走來走去、還要一支一支檢查，所以我乾脆自己設計了一套」） | `x-fix.html` | 每個痛點一拍逐條出現、前一條退焦 → 講到解法前 0.75 秒，痛點一起被劃掉、變淡 → 箭頭彗星描過去、解法卡彈出、解法逐字落下 → 爆點：重拍、螢光筆、光澤掃過 | 標題（≤ 10 字）、痛點（≤ 7 字）與圖示、解法（≤ 6 字）與副句（≤ 8 字）、`P1..P3`／`FIX`；2 個痛點照檔頭【版面】改 top |
| 具體的動作、物件或過程（「拍完先從手機上傳到雲端，再下載到電腦打開播放」「把手機架上腳架試錄一小段」） | `x-scene.html`（示意動畫骨架） | 主角是線條插圖元件（`shared/template/kit/illus-gallery.jpg`），字只當標籤：場景骨架 → 物件逐個彈出、描連接線 → 換狀態（淡出舊的、淡入新的、漣漪）→ 結果徽章打勾 | 先寫插圖清單（BEATS.md §5）；只改兩塊 DATA：DATA 1 元件清單（照分鏡「插圖元件（狀態）」「位置」欄，標籤 ≤ 10 字；自己畫的元件寫 `data-illus-src="illus-local/<名稱>.svg"`）、DATA 2 拍（一拍一行 `T<k>`，寫 `in`／`state`／`line`／`move`／`check`／`count`／`focus`）；物件超過 4 個或狀態換超過 3 次拆兩段 |
| 一連串具體動作（「先把手機架上腳架，按下錄影試錄一小段，錄完走到手機旁邊播放，確認畫面和聲音」） | `x-scene-example-rec.html`（參考） | 桌子和人先在 → 手機腳架彈出 → 螢幕換錄影、錄影膠囊計時 00:00 → 00:05 → 人走到手機旁 → 螢幕換播放 → 聲音波形 → 「符合需求」徽章打勾 | 只看兩塊 DATA 怎麼寫（`T1`–`T6`）；新段落從 `x-scene.html` 複製 |
| 本集大綱，每部分都有具體物件可以畫（「這集分成四個部分：先實際操作，再安裝工具，接著設定網路，最後聊 AI 開發」） | `x-scene-example-outline.html`（參考） | 四站一站一站彈出（手機腳架、筆電、雲端、螢幕）、站和站之間描線、聚焦目前這站 → 最後一站螢幕從 app 換成打勾 | 只看兩塊 DATA 怎麼寫（`T1`–`T5`）；新段落從 `x-scene.html` 複製；大綱只有字、沒有物件可以畫 → `x-timeline` |

- 用法：照 R7.2 第 1 步複製、改名，再照檔頭「要改的地方」改文字和時間點，最後登記到 plan.json。
- `x-versus`：兩邊數字差 20 倍以上時，小的那條只剩 8 px → 改成 `x-numbers` 或把單位換大（檔頭【不要用在哪裡】）。
- 沒有剛好對上的情境：從版型最接近的範例改（一組並列項目逐條聚焦從 x-warnings，節點與連線從 x-process 或 x-branch，示意介面從 x-ui-mock，分層從 x-stack，逐項打勾從 x-checklist，沿一條軸前進從 x-timeline，圍著一個主體標註從 x-callout，一串數字的走勢從 x-trend，兩邊數字對比從 x-versus，比例或時間從 x-ring，劃掉換成別的從 x-fix）。
- 改完照 R7.6 檢查。

### R7.6 每段情境動畫的檢查

1. `node shared/template/tools/build.mjs --project projects/<專案> --check`：骨架、id、`P.at` 的句號與詞都要過（找不到會 ✖ 並附那一句原文）。
2. build 之後跑 `node shared/template/tools/audit.mjs --project projects/<專案>`（預設只量情境動畫；`--only x01` 只量一段；`--all` 連情境模板一起量；`node shared/template/tools/audit.mjs --project projects/<專案> --json` 給工具讀，stdout 只印一個 JSON）。它把每一段跳到中點、完成態與每個靜止畫面，量出 ✖ 文字撐破、被裁掉、超出畫面、進字幕區、壓到子母畫面、未定位頂層、標題壓到內容、綁句失敗、分鏡對齊（缺拍、多出來的 `P.at`、動態不在語彙表、表頭不對），以及 ⚠ 沒有動畫分鏡、分鏡用了沒做的動作、間距、重疊、內距、行高、右側空白、垂直平衡、nowrap 餘裕、壓到講者、字太小、半像素邊和節奏（同一秒新元素、間隔、完成態停留、最後一幕）。✖ 全部修掉才往下，⚠ 照 → 改，或在回報裡說明為什麼保留。只改了 custom 檔不用重跑 build；改了 plan.json 要先 build。刻意超出畫面的元素（例：從畫面外推入）標 `data-layout-allow-overflow`，刻意放在字幕帶的標 `data-layout-allow-caption-zone`（和 `hyperframes check` 同一組標記），並在回報寫理由。
3. 亂序截圖：`cd projects/<專案>/work/hyperframes && npx hyperframes snapshot --at <完成態>,<第一拍+1>,<中間拍+1> --no-end -o ../storyboard-preview`，親眼看：線描完閉合、數字對、文字沒撐破、底線在字下面、沒壓到子母畫面和字幕區；三張的內容要和照時間順序截的一樣。
4. 派給子代理做時，子代理交回：檔案路徑、綁了哪幾句（`P.at` 的句號與詞）、1–3 的結果；主代理整合後再跑一次 1 和 2。audit 有 ✖ 就把那幾行原文交回給寫那支的子代理修。
- 直式專案 audit 多量三條（數字與改法見 `shared/style.md`「直式」）：✖ `portrait-window`（縮放的段擺位超出舞台窗）、⚠ `portrait-cam`（`P.cam` 推近後切到邊）、⚠ `font`（字級 × 縮放倍率 < 32 px）。

---

## R8. 硬規則與陷阱

`hyperframes check` 抓不到下面這些。第一層模板已經全部遵守；**寫第二層 custom、或用 `css` 移位時，自己要檢查**。

| # | 規則 | 為什麼 |
|---|---|---|
| 1 | `check` 全過不代表版面正確。有第二層情境動畫一定跑 `audit.mjs`（R7.6），再 `snapshot --review` 看圖（核心 2.5） | 作者實測：九段 check 全部 0 issues，實際六段破版。原因：`check` 的版面量測只取全片均分的 9 個時間點，一個問題只在 1 個取樣點出現就降成 info、不算 issue，5–8 秒的段最多被取到一次；用 `--at` 指定時間也一樣會被降級 |
| 2 | 文字不進字幕區（y ≥ 920）；`check --caption-zone "x0=0;y0=0.852;x1=1;y1=1;severity=error"` | 情境文字壓到字幕。`--caption-zone` 預設只量片尾最後一格、而且只量文字框，片中的卡片進字幕區要靠 audit |
| 3 | 疊在實拍上（疊加版面）：硬邊錯位底板＋一層模糊 ≤ 30 px、不透明度 ≤ 0.35 的深色落影，不發光、不漸層。不透明幕上（全畫面、全幕）：光暈、柔影、漸層只能用 `var(--v2-*)` token；兩種都不寫 `box-shadow`、`filter`、`gradient` 的字面值；亮色大面積只能用在不透明幕 | 亮色塊邊緣壓縮後會浮出白暈；透明背景上的光暈看起來像髒污；用 token 才會跟著換主色與亮暗主題 |
| 4 | 座標、尺寸一律整數 px；自己畫的邊框至少 2px、alpha ≥ 0.34 | 1.5px 會被捨成 1px，半像素線發糊（audit 會報「半像素邊」⚠） |
| 5 | 字級下限：正文 ≥ 52px（`.sc-t52` 起）、標題 ≥ 72px（`.sc-wcard__bar` 標題列固定 64 例外）、標籤 ≥ 38px；空間夠就放大；放不下縮文案，不縮字 | 字太小是作者最常退件的原因（audit 只抓 < 30px，52／38 的下限要自己對） |
| 6 | 間距：標題到內容 ≥ 40；文字框內距左右 ≥ max(24, 0.45×字級)、上下 ≥ max(14, 0.28×字級)；line-height ≥ 1.25；框寬用 `max-content` | 卡片擠、右側空白、g／p／y 的下伸部被切（audit 會報：間距不足、內距不足、行高不足、右側空白過多、nowrap 餘裕不足；只量 custom。內距容許 2px：差 ≤ 2px 不報；圓形、≤ 2 字的徽章、kit 元件不量內距；字級 ≥ 100px 的數字不量行高） |
| 7 | 中文斷行：自己用 `<br>` 斷在語意處，或 `text-wrap: balance`；不能拆的詞包 `<span style="white-space:nowrap">`；標題 nowrap | 「檔／案放進」這種詞中斷行 |
| 8 | `.fill` 的直接子元素一律 `position: absolute`＋寫死 left／top；最終版面先排好，後出現的元素先預留位置（用 opacity 藏，不用 display:none） | 元素黏在 (0,0)；後進場的元素把既有元素擠走 |
| 9 | 同一元素第二段 `fromTo` 要 `immediateRender: false`；只用 `SceneMotion` 就不用管 | 第一格就出現應該稍後才發生的狀態 |
| 10 | 時間軸撐到段尾：結尾寫 `P.end()`（不帶參數＝plan.json 這段的長度） | 最後一段被截掉或沒被取樣 |
| 11 | 字型只寫 `var(--font-cjk)`、`var(--cap-font)` 或有 `@font-face` 的字型名 | 寫字面字型名，lint 報 error，整段 check 不跑 |
| 12 | 圖片一律 `object-fit` 等比，不擠壓 | 圖片變形 |
| 13 | 不做非 90 度的 div 旋轉；fx 03／12／16／33 少用 | 斜邊鋸齒 |
| 14 | 子合成：style 與 script 放在 `<template>` 裡、id 三處一致、用 `fromTo` 不用 `from`、root 用 id 選擇器 | 沒有樣式；時間軸 45 秒後變靜止畫面 |
| 15 | 動作：只用 `shared/template/BEATS.md` 語彙表的具名動作（對應的 `P.*`）；秒數與曲線照 style.md「節奏」（kit 常數）；過衝（彈出、逐字彈出、重拍）只用在強調拍；不旋轉、不大位移飛入；不做微動（呼吸只給等待中的狀態、不配音效；卡片、焦點、背景不動） | 動態的單位是拍：進場 → 強調 → 其他退焦 → 一顆音效，同一時間只有一個焦點（style.md「動畫視覺」） |
| 16 | 含 `<video>` 的合成一律用 `npx hyperframes render`，不用其他截圖式 render 工具 | 影片會凍在同一格，ffprobe 卻全部通過 |
| 17 | 第二層與 `css` 移位不能壓到 speakerBox、不能進子母畫面禁入區（全畫面時 x 1424–1888、y 581–951） | 擋臉；壓到子母畫面（audit 會報：壓到子母畫面 ✖、壓到講者 ⚠） |
| 18 | custom 的 `P.at('#N')`、`P.at('#N@詞')` 那一拍出現的字（站名、項目），要在 #N 那句講到；站名、項目在句中間或句尾就綁 `P.at('#N@詞')` | 綁句首，字會比講到早 1–3 秒出現（r1 實測）。audit 會報 `⚠ 綁句對不上：「…」在 #M 才講到、不是 #N（…）`（數字、英文整個詞比，中文取 2–4 字；刪除線、底線、位移不算出現；找不到不報）→ 照 → 改成 `P.at('#M@詞')` |
| 19 | 用 `P.morph` 補間 `strokeDashoffset`／`strokeDasharray` 時，GSAP 當成 px 補、取整數；線條是 `pathLength="1"` 就會整段跳格 → 自己補間的弧、線改用 `pathLength="1000"`，數值放大 1000 倍（x-ring 的寫法） | 弧或線一格一格跳，不是平滑地走 |
| 20 | 帶虛線（`stroke-dasharray`）的線條放在會位移的容器裡（`P.rise`、`P.drift` 的目標），亂序 seek 截圖會和照順序的不同 → 那個容器改用 `P.in`（只淡入、不位移），線條自己用 `P.stroke` | render 的畫面和預覽、截圖對不上 |
| 21 | custom 段裡講解在講的時候，畫面不能連續 > 6 秒沒有任何動作（進場、點亮、焦點切換、描線、數字變化、位移都算動作）；在那句補一拍 `P.at('#K@詞')`，或從那句拆成兩段 | 觀眾以為畫面卡住。audit 會報 `⚠ 畫面沒有變化：<段> 在 <t1>–<t2> 畫面 <q>s 沒有變化（講解 #<N>–#<M> 在講；上限 6s）` → 照 → 補一拍或拆段。看時間軸、不看像素：點亮一個小框也算有變化（`qc.mjs observe` 的「靜止區間」看像素，兩者可能不一致） |

| audit 抓得到 | audit 抓不到（要看 snapshot） |
|---|---|
| 文字撐破有底有框的盒、被會裁切的框切掉、超出畫面、進字幕區、全畫面壓到子母畫面、壓到講者框（面積比例）、字 < 30px、半像素邊、custom 的段長與 script 錯誤；custom 另外量：未定位頂層、標題到內容的間距、區塊重疊（svg 線稿與連接線不算區塊）、文字框內距與行高、右側空白、nowrap 餘裕、垂直平衡、綁句失敗、綁句對不上、畫面沒有變化、分鏡對齊（storyboard.md 的動畫分鏡每一拍 ±0.5 秒內要有 `P.at`、檔裡的 `P.at` 都要在分鏡裡、動態欄只用語彙表名稱、表頭照抄）、節奏（同一秒新元素、間隔、完成態停留、最後一幕；完成態停留量的是兩個 `P.at` 綁句點之間畫面最長的一段靜止，拍前就開始的動作算到它結束為止） | 中文斷在詞中間、對比與底板、字形下伸部離框多近、進場途中的暫態（正在補間的元素不判）、字卡動態與 media 段、畫面內容有沒有對到講解的意思、情境模板的新規則（模板版面固定） |

build 已經自動處理、不用你做的（知道就好，不要重做）：時間在產生時就換成數字（不會算出 NaN）；底片重新編碼成固定 30fps、每秒一個關鍵影格（關鍵影格太稀時 seek 會凍結）；全畫面相接時接縫不淡；子母畫面用靜音主軌複本＋外框圖、位置和情境庫一致；側邊欄推講者的曲線和面板同步；字幕硬開硬關、同時只顯示一則；音效對準畫面事件、附加音效跟著條列；每個子合成的 id 與 CSS 都加了前綴與範圍。

`check` 可能出現的提醒：
- `Craft ⚠ line_unread: The film's last line "…" … is on screen 1.69 s …, under the 2.00 s a closing line needs` → 那段最後一項停太短：`to` 往後延，或把最後一項的 `at` 提早。

---

## R9. 換主色與背景

只在使用者明確要求時才改；這是 `shared/` 唯讀規則的唯一例外。

### R9.0 風格包

一包＝`shared/template/styles/<名稱>/`：`style.json`（名稱、主色、說明）、`brand.css`、`pip-frame.png`、`pip-frame-v.png`、`bg-fs.jpg`、`bg-side.jpg`、`bg-ch.jpg`（＋暗色 `bg-*-dark.jpg`）。內建「預設」（目前的橘色）與示範「藍圖」（藍色，背景的 HTML 原始檔在 `styles/藍圖/來源/`）。

```bash
node shared/template/tools/brand.mjs list
node shared/template/tools/brand.mjs use 藍圖
node shared/template/tools/brand.mjs pack 我的品牌 --color "#1B7F4B" --bg <放 bg-*.jpg 的資料夾> --note "一句說明"
```

- 三種範圍：情境庫 `index.html` 上方的「風格」「暗色」只換預覽；plan.json 第一層 `"style": "<名稱>"` 只換這一集（build 印 `風格包：<名稱>…`）；`brand.mjs use <名稱>` 把包裡的檔複製進 `shared/template/`，之後每一集都用它。
- `use` 前會比對：`shared/template/` 目前的主色、外框、背景不屬於任何包時停下來，先 `pack <新名稱>` 存起來（`--force` 才直接蓋掉）。
- `pack` 只給名稱＝把 `shared/template/` 目前的檔存成一包；給 `--color` 就照 R9.1 算 `brand.css`、畫外框；`--bg` 資料夾要有三張亮色（有暗色三張就一起收）。建好會重寫 `styles/styles.js`（情境庫的清單）。
- 已經有的包不改、不刪（AGENTS.md 規則 1）；要改就另存一個新名稱。

### R9.1 換主色

```bash
node shared/template/tools/brand.mjs "#1B7F4B"
node shared/template/tools/build.mjs --project projects/<專案>
```

`brand.mjs` 會：
1. 寫入 `shared/template/kit/brand.css` 的 `--brand`。
2. 算 `--brand-ink`（主色底上的字）：主色對深底 #0B1020 的對比 ≥ 4.5 用 #0B1020，否則用白色。
3. 算 `--brand-text`（深底上的主色字）：對比不夠就逐步混白，直到 ≥ 4.5。
4. 主色是紅色系（色相 340°–20°）時警告：會和警示紅（踩雷、注意）撞色。
5. 重畫 `shared/template/kit/pip-frame.png`（子母畫面外框跟著換色）。

把它印出的對比值與警告原文轉告使用者。紅色系的警告要明講「觀眾會分不出哪個是警告」，建議換色。換完重跑 build（`kit/` 每次 build 都會重新複製，完成影片才會換色）；預覽頁 `shared/template/index.html` 重新整理就會更新。

目前的設定（2026-10-30，PPA 風格）：`--brand: #F6630F`，`--brand-ink` 手動改成 `#FFFFFF`（橘底白字，對比約 3.2，作者指定）。重跑 `brand.mjs` 會把 `--brand-ink` 算回 `#0B1020`；要維持橘底白字，跑完再把這一行改回 `#FFFFFF`。

不要只手改 `brand.css` 的 `--brand` 一行（理由：`--brand-ink`、`--brand-text` 不會跟著算，深色主色會看不清楚；子母畫面外框也不會換色）。

### R9.2 背景圖

- 每種版面一張，檔名固定：`shared/template/bg-fs.jpg`（1920×1080，全畫面；插入素材四周一律黑底）、`bg-side.jpg`（960×1080，側邊欄面板）、`bg-ch.jpg`（1920×1080，章節轉場）。哪張沒有就用 `shared/template/bg.jpg`（舊的單張寫法，側邊欄取它的左半）；都沒有就是主題底色與底紋。
- 留空的地方：全畫面主卡 x 120–1380、y 150–862，子母畫面 x 1424–1888、y 581–951，字幕帶 y ≥ 920；側邊欄文字區 x 0–816、y 86–864（左 85%、y 8–80%）；章節幕章名卡 x 160–1760、y 260–870（建議初值）。裝飾放在這些區域以外。`brand.mjs bg` 用同一組數字疊框、檢查。
- 現在的三張是 2026-10-30 用 Codex 照 PPA 風格生成的（淺暖底、橘色線稿；提示詞與參考圖見 git log）。重新生成：`codex exec --skip-git-repo-check -C <暫存資料夾> -s workspace-write -i <參考圖> ... < prompt.md`（`-i` 會吃掉後面的字串，提示詞一定從 stdin 給），生成後用 ffmpeg 縮放成上面的尺寸存 jpg。
- 影響範圍：01 章節轉場、04 全畫面家族、03 側邊欄面板（取圖的左半）。
- 直式：沿用這三張橫式圖（取中間），不用另做直式背景。
- 放好後重跑 build。拿掉背景就刪掉那張 jpg 再重跑 build。

### R9.3 能力探測與生圖路由

使用者要「生成背景圖」、沒有給圖時才走這一節；有給圖就直接用 ffmpeg 縮放裁切成上面三種尺寸。

**探測**：`node shared/template/tools/caps.mjs`（只檢查，不安裝、不登入、不下載）。它印一張「能力｜結果｜依據」表，最後一行是「可用的生圖路線」。工具不能用時，手動逐項跑：

| 探測什麼 | Mac | Windows（PowerShell） | 算「可用」 |
|---|---|---|---|
| 模型本身能不能出圖 | 看這次 session 的工具清單 | 同左 | 清單裡有明確的圖片生成工具 |
| Codex CLI | `command -v codex && codex login status` | `Get-Command codex -ErrorAction SilentlyContinue; codex login status` | 指令存在且已登入 |
| MiniMax CLI | `command -v mmx && mmx auth status` | `Get-Command mmx -ErrorAction SilentlyContinue; mmx auth status` | 指令存在且已登入 |
| HTML 截圖 | `npx --no -- hyperframes browser path` | 同左 | 印出存在的 chrome-headless-shell 路徑 |
| 縮放裁切 | `ffprobe -version` | 同左 | 有版本號 |

**路由**（第一個可用的路；沒裝的不裝、沒登入的不幫使用者登入，直接走下一條，回報寫「登入之後可以改用生圖」）：

| 模型／環境 | 第一選擇 | 第二選擇 | 最後退路 |
|---|---|---|---|
| Claude 系列（Claude Code） | Codex 生圖 | HTML／CSS／SVG → `brand.mjs bg` 截圖 | 只換主色，保留目前的背景 |
| MiniMax 系列（MiniMax Code） | `mmx image generate` | HTML 路線 | 同上 |
| GPT 系列（Codex CLI 裡） | 自己的生圖工具 | HTML 路線 | 同上 |
| 其他模型 | 工具清單裡的生圖工具（有才用） | HTML 路線 | 同上 |
| 要求精準留空、幾何線稿、和主色完全一致 | 直接走 HTML 路線 | — | — |

- HTML 路線：照 R9.4（`brand.mjs bg`，`fs`、`side`、`ch` 各跑一次）；輸出 `bg-<種類>.jpg`、疊上留空區框的 `zones-<種類>.jpg`，三張都在時產生並排的 `preview.jpg`。
- 每條路的完整指令（Mac／Windows）在 `.agents/skills/auto-edit-style/references/image-routing.md`；有子代理工具就每張圖一個工人同時生成（同一資料夾的 `bg-worker.md`）。
- 一律先存在暫存資料夾：尺寸（`ffprobe -v error -show_entries stream=width,height -of csv=p=0 <檔>`）要是 1920×1080、960×1080、1920×1080；留空區（R9.2）沒有裝飾；三張並排圖給使用者看（停點 ⑥），同意後才複製進 `shared/template/`。
- 同一條路重做 2 次還不行就換下一條；全部不行就只換主色，告訴使用者原因。

### R9.4 用 HTML 畫背景圖（沒有生圖工具時）

1. 在暫存資料夾寫 `bg-fs.html`、`bg-side.html`、`bg-ch.html`。版面用絕對定位畫在 `html, body` 上，主色用 `var(--brand)`（`--brand-ink`、`--brand-text` 也能用），字型用 `var(--font-cjk)`；`brand.mjs bg` 截圖前會自動接上 `kit/brand.css`、`kit/fonts.css`（其他主題變數不會接，要用的顏色直接寫色碼）。不要另外連 CDN 或網路圖片（會 ⚠）。
2. 每張跑一次：

       node shared/template/tools/brand.mjs bg --html <暫存>/bg-fs.html --kind fs --out <暫存>

   產生 `bg-fs.jpg`（成品）、`zones-fs.jpg`（疊上留空區框：紅＝主卡或文字區、藍＝子母畫面、黃＝字幕帶）、`raw-fs.png`（原始截圖）。
3. 看指令印的那一行：`✓ 留空區乾淨` 就好；`⚠ 紅框（全畫面主卡）裡有 2.3% 的像素是裝飾` 就把裝飾移到框外，重跑。
4. 三張都做完會多一張 `preview.jpg`（上排原圖、下排疊框版，1600×720）。把它給使用者看，**停下來等同意**（停點 ⑥）；同意後照 `auto-edit-style` 步驟 4 存成風格包、套用（`brand.mjs pack`、`brand.mjs use`），再重跑 build；不要照指令最後印的 `cp`／`Copy-Item` 直接複製。
5. `--out` 不能是 `shared/template/` 裡面（✖）：背景圖一定要經過使用者同意才放進模板。

---

## R10. 不可以做的事

| 不可以 | 理由 |
|---|---|
| 重新設計卡片、自己畫第一層情境的版面 | 版型只從素材包挑 |
| 改 `shared/template/` 裡的任何檔（例外：使用者要求時的 `kit/brand.css`、`kit/pip-frame.png`（brand.mjs 寫）、`kit/look.json`（`look.mjs default` 寫）、`bg-fs.jpg`／`bg-side.jpg`／`bg-ch.jpg`／`bg.jpg`） | 模板是共用素材；改壞了每集都壞 |
| 手改 build 產生的檔（`index.html`、`compositions/sNN-*.html`、`captions.html`、`test-clip.html`、`work/hyperframes/kit/`） | 下次 build 會被擋下或蓋掉；改 plan.json 再重跑 |
| 用 `css` 改字級、顏色、寬度、內距 | 字級是作者定好的下限；`css` 只改位置 |
| 另外下載字型、圖示、音效、素材，或用 CDN | 全部都附了；另外下載的東西 Windows 與離線環境不一定有 |
| 登入任何服務 | 工作區規則 |
| 重新轉錄字幕 | `work/rough.srt` 已經校正過；時間碼不準就改那一則的時間 |
| 疊在實拍上的卡片加光暈、發光、模糊、漸層；不透明幕上寫死陰影或顏色 | 疊在實拍硬邊；不透明幕只用 `--v2-*` token（R8 #3） |
| 自己寫底片的移動、裁切、淡入淡出 | build 已經處理（R4.3） |
| 把 `work/rough.mp4` 以外的影片放進合成（custom 裡放 `<video>`、手寫 `<img>`） | 螢幕錄影與圖片一律用 media 段（核心第 5 節）：build 會轉檔、把 `<video>` 放在主合成、跟著 cuts 對時間；子合成裡的 `<video>` seek 會不同步 |
| 用 ffmpeg 自己燒字幕、疊卡片 | 一律 `npx hyperframes render` 一次輸出 |
| 第二層情境動畫從零寫、不從 `shared/template/custom/` 的範例改 | 範例已經照作者的版面規範與 seek 規則驗證過（R7.5） |

---

## R11. 可以重複使用的資源

| 項目 | 位置 | 數量 | 怎麼用 |
|---|---|---|---|
| 情境模板 | `shared/template/scenes/<NN>-<key>/` | 18 個（版面 9、下方字卡 7、條列 2） | plan.json 寫 `"scene": "<key>"`；清單跑 `--list` |
| 字卡動態 | `shared/template/fx/effects/fx-NN-*.html` | 40 種（5 類 × 8） | plan.json 寫 `"type": "fx", "fx": 編號`；效果看 `shared/template/fx/index.html` |
| 情境動畫範例 | `shared/template/custom/x-*.html` | 9 支 | 複製到 `work/hyperframes/compositions/` 改（R7.5） |
| 情境預覽 | `shared/template/preview/<NN>-<key>.html`、`shared/template/gallery/*.jpg` | 18 頁 | 給使用者看用；預覽講者是 Q 版圖、位置置中，實際版面以場地照與 snapshot 為準 |
| 頻道主題 | `shared/template/kit/brand.css`（主色 3 行）、`theme.css`、`scene.css` | 1 套 | 換主色見 R9 |
| 背景圖掛鉤 | `shared/template/bg-fs.jpg`、`bg-side.jpg`、`bg-ch.jpg`（沒有的退回 `bg.jpg`） | 3 個 | 分別套到全畫面、側邊欄、章節轉場（插入素材四周是黑底） |
| 圖示 | `shared/template/kit/icons.json` | 約 1,550 個 lucide 圖示 | slots 裡寫圖示名（例：`clipboard-list`） |
| 字型 | `shared/template/kit/fonts/` | Noto Sans TC、Google Sans Flex（OFL） | 已由 `kit/fonts.css` 載入，不用安裝 |
| 音效 | `shared/sfx/*.wav`＋`shared/template/kit/sfx.json` | 18 個 | build 自動配，見 R5 |
| 字卡動態預覽影片 | `shared/template/fx/renders/` | 每種效果一支 | 只給畫廊（`fx/index.html`）看，完成影片不用，改了效果 HTML 也不會跟著變 |
| 音效資料 | `shared/template/preview/sfx-data.js` | 1 個 | `build.mjs --gallery` 產生，畫廊頁與音效總表用 |
| 主合成產生器 | `shared/template/tools/build.mjs` | 1 支 | 核心第 2 節 |
| 素材工具 | `shared/template/tools/media.mjs` | 1 支 | `scan`（contact sheet）、`frame --grid`（座標格線圖）、`main`（接主軌）、`ng-snap`／`srt-align`／`cutpoints`（剪乾淨；舊流程 `snap-srt`）；核心第 5 節 |
| 插入素材與剪輯台效果的樣式 | `shared/template/kit/media.css`、`kit/media.js` | 各 1 個 | build 用到時自動連；紅框、說明卡、聚光燈、STEP、箭頭、放大鏡、dip、淡入淡出 |
| 換主色工具 | `shared/template/tools/brand.mjs` | 1 支 | 換主色、`bg` 做背景圖（`--tmp`、`--html`、`--image`、`--verify`；R9） |
| 剪映素材 | `shared/template/tools/capcut.mjs` | 1 支 | 核心 2.7b。舊寫法 `node shared/template/tools/capcut.mjs --project projects/<專案> --background`（開了就回）＋`node shared/template/tools/capcut.mjs status --project projects/<專案> --wait` 還能用（同一個背景工作），文件不再用 |
| 講者調光＋瘦臉 | `shared/template/tools/look.mjs`、`kit/look.json`、`kit/look/*.cube`、`vendor/mediapipe/` | 1 支＋設定 | 核心第 7 節 |
| 分鏡素材 | `shared/template/tools/build.mjs --scaffold`、`tools/lib/scaffold.mjs` | 1 個旗標 | 排分鏡前產生 `work/分鏡素材/`（共用、寫法、每章一份）：字幕編號、章節、情境對照、每種情境的 plan.json 寫法 |
| 進度、能力 | `shared/template/tools/status.mjs`、`caps.mjs` | 各 1 支 | 接手時看做到哪；換風格前看能用哪條生圖路線（R9.3） |
| 風格規範 | `shared/style.md` | 1 份 | 字幕、節奏、字卡文字、音效、講者資料的唯一來源 |

不在素材包裡、要靠提示詞安裝的：HyperFrames CLI（`npx hyperframes`）、auto-editor、ffmpeg、Chrome（`npx hyperframes doctor` 處理）。

---

## R12. Skill 與安裝

- 9 支 auto-edit Skill 已經內建在 `.agents/skills/`（`AGENTS.md`「怎麼用這份檔」有對照表）。環境準備的 S4 用 `node setup/install-skills.mjs` 複製到 `.claude/skills/`（Claude Code）與 MiniMax Code 的使用者 Skill 資料夾；改了 `.agents/skills/` 之後重跑一次就會更新，`node setup/install-skills.mjs --check` 只比對不寫檔。
- Skill 直接引用工作區的 `shared/template/USAGE.md`、`shared/template/USAGE-reference.md` 與 `shared/template/tools/build.mjs`，**不要把模板複製進 Skill**。理由：使用者換過的主色與背景圖都在工作區的 `shared/template/`，複製一份就不會跟著變。
- 依賴：Node.js ≥ 22、ffmpeg／ffprobe（在 PATH 裡）、`npx hyperframes`（版本照根目錄 `package.json`，`npm install` 安裝）。`build.mjs` 本身零依賴。
- build 用 `--project projects/<專案>`（或只寫名稱）指定專案；沒寫時，目前資料夾在某個專案裡就用它，`projects/` 只有一個專案就用那個，否則出錯並列出現有專案。路徑旗標（相對目前資料夾，會蓋過專案預設）：`--plan`、`--srt`、`--video`、`--out`、`--sfx`。預設是專案裡的 `work/hyperframes/plan.json`、`work/rough.srt`、`work/rough.mp4`、`work/hyperframes/`，音效是 `shared/sfx/`。
- 專案結構：`projects/<專案>/講稿.md`、`assets/camera/`（講解主軌）、`assets/screen/`、`assets/images/`（只讀）、`work/`（中間產物）、`output/`（`final.mp4`、`test-clips/`、`qc/`；build 會先建好這三個資料夾）。
- build 結束碼：有 ✖ 錯誤時是 1，可以拿來判斷要不要往下跑。`--list --json` 印出機器可讀的情境、字卡動態、音效清單與 media 段欄位；`--check --json` 印出機器可讀的檢查報告（R2.6）。
- 素材：`node shared/template/tools/media.mjs scan|frame|main --project projects/<專案>`（核心第 5 節）。也是零依賴，只用 ffmpeg／ffprobe。

---

## R13. 測試過的版本與環境

| 項目 | 版本或做法 |
|---|---|
| HyperFrames CLI | 版本釘在工作區根目錄的 `package.json`（`npm install` 安裝；build 與 `caps.mjs` 會印實際版本，不同時 ⚠）。從 `projects/<專案>/work/hyperframes` 執行 `npx hyperframes` 也是用根目錄這一版。指令和本文不一致時，以 `npx hyperframes <指令> --help` 為準 |
| Node.js | ≥ 22（實測 24.16.0） |
| 實測平台 | macOS 15.3（M1 Max）。Windows 的指令照官方參數寫，以實際執行結果為準 |

環境的坑：
- render 報 `VIDEO_SOURCE_UNRENDERABLE`（`assets/rough.mp4` 讀不了）：底片壞了，重新編碼：`node shared/template/tools/build.mjs --project projects/<專案> --reencode`，再跑一次 `deliver.mjs`。
- **轉逐字稿**：`npx hyperframes transcribe <影片> -d work --model small --language zh`。預設模型 `small.en` 會把中文翻成英文。逐字稿的時間碼可能漂 1 秒左右，處理見核心 4.3。
- **M1 Max＋macOS 15.3** 轉錄會出錯時，前面加環境變數：`GGML_METAL_BF16_DISABLE=1 npx hyperframes transcribe …`。
- **auto-editor**：Skill 文件和安裝的版本參數名稱可能不同，以 `auto-editor --help` 為準（實測 29.3.1 要用 `--cut-out`、`--add-in`、`--no-open`；每一段寫一次旗標，同一個旗標後面接兩段會失敗）。剪乾淨的指令由 `media.mjs ng-snap` 印出，不要自己拼。
- **`npx hyperframes doctor`**：列為選用（optional）的項目沒裝可以略過，必要項目（Chrome、ffmpeg）要裝好。
- **`preview --no-open`**：在非互動 shell 會自己轉到背景，印出網址就結束（核心 2.6）。
- **舊專案的 `data-hf-id`**：舊專案開過 Studio 的話，產生檔的每個元素會多一個 `data-hf-id` 屬性，不算手改（build 算雜湊時會排除）。
- **底片重新編碼**：build 第一次會把 `work/rough.mp4` 轉成 `work/hyperframes/assets/rough.mp4`（30fps、每秒一個關鍵影格、聲音轉 AAC），之後只有 `work/rough.mp4` 比較新時才重轉。build 會印出兩者長度差，超過 0.1 秒會警告字幕可能對不準。
- **字卡動態 14／27／31／38** 第一次 render 需要網路（R3）。
- `check`／`snapshot`／`render` 開頭印出 `Not inlining "kit/fonts/NotoSansTC-VF.woff2" (5.2 MB exceeds the 2 MB inline limit)` 是正常的，字型仍會從檔案載入，不用處理。
- **render 很慢或被中斷**：改用背景執行（核心 2.7）。記憶體 ≤ 8GB 的電腦 HyperFrames 會自動改用單一 worker，會更慢。

---

## R14. 改模板或新增情境（使用者明確要求時）

這一集只是想換個樣子，先用 `css` 移位（R4.6）或第二層 custom（R7），不要改模板。改模板是 `shared/` 唯讀的例外，要先徵得使用者同意。

**情境**：改 `shared/template/scenes/<NN-key>/template.html` 的 `<!-- @style -->`、`<!-- @body -->`、`<!-- @timeline -->` 三段，以及旁邊 `scene.json` 的 slots、beats、lists、rules、sfx、sample。`scene.json` 的 `sfx` 區塊長這樣。

```json
"sfx": { "main": { "sound": "sparkle", "at": "in + 0.1" },
         "extra": [ { "sound": "ding", "at": "aAt", "volume": 0.8 } ] }
```

- `main.sound` 可寫字串，或 `{ "default": "ding", "warn": "alert", "good": "success" }` 依 tone 挑；`extra[].volume` 是該音效在 `kit/sfx.json` 預設音量的倍數（例：09 的 ding＝0.45×0.8）。
- `at` 可寫：`start`、`end`、beat 名（`in`、`aAt`）、`清單名[i]`（第 i 項，例 `cards[0]`）、`清單名[i:]`（第 i 項起全部，例 `items[1:]`），後面可接 `± 秒數`（例 `in + 0.1`、`start - 0.15`）。

**字卡動態**：改 `shared/template/fx/effects/fx-NN-*.html` 與 `fx/catalog.json`。`fx/renders/` 的預覽影片不會跟著變。

**預覽與畫廊**

- `node shared/template/tools/build.mjs --gallery --only <key>` 重產該情境的預覽。`--only` 不會更新 `preview/sfx-data.js`，改了音效要跑不帶 `--only` 的版本。
- 新增情境要在 `shared/template/index.html` 手動加一張卡。

改完一定跑一次 `--check`＋snapshot。
