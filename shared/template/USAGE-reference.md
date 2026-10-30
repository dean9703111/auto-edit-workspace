# 素材包使用說明：參考（給 AI 查）

先讀 `shared/template/USAGE.md`（核心）。這份照核心第 2 節 SOP 的「查」欄，做到那一步再讀那一節；標題 `## R1`–`## R14` 可以直接搜尋。

情境與字卡動態的清單（key、slots 上限、預設長度、什麼時候用、不要用在）不貼在這裡，一律跑 `node shared/template/tools/build.mjs --list`。這份只寫 `--list` 沒寫的事。工具的輸出和本文不一致時，以工具為準。

| 節 | 內容 | 什麼時候讀 |
|---|---|---|
| R1 | 挑情境：判斷順序、訊號表、不下卡的句子 | 步驟 4 列分鏡表 |
| R2 | 情境細節、清單寫法、全部欄位、media 段欄位、`--check --json` 格式 | 步驟 4–5、插入螢幕錄影時 |
| R3 | 字卡動態（fx） | 用到 fx 時 |
| R4 | 畫面分區、講者位置、底片層、`sideShift`、`pipCrop`、`css` | 步驟 2、5，Studio 要移位時 |
| R5 | 字幕與音效（build 自動處理） | 要換或拿掉音效時 |
| R6 | 密度與節奏、build 檢查哪些 | 步驟 4、6 |
| R7 | 第二層情境動畫（custom） | 18 情境放不下時 |
| R8 | 硬規則與陷阱 | 寫 custom、用 `css` 移位、步驟 8 |
| R9 | 換主色與背景 | 使用者要求時 |
| R10 | 不可以做的事 | 不確定能不能做時 |
| R11 | 可以重複使用的資源 | 找檔案時 |
| R12 | 給封裝 Skill 的人 | 封裝 Skill 時 |
| R13 | 測試過的版本與環境的坑 | 環境出錯時 |
| R14 | 改模板或新增情境（使用者明確要求時） | 使用者要求改模板、新增情境時 |

---

## R1. 挑情境

### R1.1 判斷順序

1. **要不要換版面**：01 章節轉場、03 半版側邊欄、04 全畫面家族、05 兩側。
2. **選下方字卡**：06 一般、07 重點、08 Step、09 QA、10 Tips、11 總結、15 金句。
3. **口播正在列舉時才用條列**：12 關鍵詞條列、13 標題條列。
4. **只有情緒、沒有資訊時才用字卡動態**（fx）。

理由：版面決定講者會不會被移動或蓋住，要最先定；資訊卡次之；字卡動態只負責情緒，放太多會搶走資訊卡的注意力。

### R1.2 訊號表（看到這種句子 → 先想這個情境）

| 句子長這樣 | 首選 | 次選／條件 |
|---|---|---|
| 換大主題：「接下來進入…」「首先是…」 | 01 章節轉場 | 短片（< 3 分鐘）不用 01，改 02 或不加 |
| 章節轉場後的第一段口播 | 02 章節角標，或在該段加 `"chtag": true` | `chtag` 要前面有 01；兩側、側邊欄不能加 |
| 第一次自我介紹「我是 OOO」 | 14 講者介紹（`name`、`titles` 照 `style.md` 的「講者」） | `style.md` 沒寫講者就不放；同一集第二次不加 |
| 定義句「所謂 X」「X 就是…」「可以把 X 想成…」 | 06 一般字卡（`**X**：一句定義`） | 類比要圖解 → 04b／04c |
| 「重點是」「關鍵在於」「一定要記住」、結論句 | 07 重點字卡 | 整段金句 → 15；只有一個爆點詞 → fx 01／03 |
| 「千萬不要」「注意」「踩雷」＋負面後果 | 07 重點字卡 `"tone": "warn"` | 一連串警告 → 04a；單句「別這樣做」 → fx 16 |
| 「第一步／第二步」「首先…接著…最後」＋動詞 | 08 Step 字卡（2–4 步） | 步驟要同時看見 → 04c |
| 自問自答「…嗎？」下一句回答 | 09 QA 字卡（`a` 的 at 綁回答那句） | — |
| 「小技巧」「建議大家」 | 10 Tips 字卡 | 只有一句提醒 → 06 |
| 「總結一下」「所以」＋回顧 | 11 總結字卡 | 回顧三項以上 → 13 或 04a |
| 金句、「不是 X，而是 Y」翻轉句 | 15 金句字卡（盡量用原句的詞，太長取後半；核心 3.5） | 反差兩半要對照 → 04b、fx 32／39 |
| 並列 2–3 個短名詞（每個 ≤ 5 字、沒說明） | 12 關鍵詞條列 | 剛好四個 → 05 |
| 有標題的列舉、每項「名詞：說明」逐項講 | 13 標題條列 | 3–4 項要同時看見 → 03 或 04a |
| 一個主題＋3–4 個重點、講 ≥ 8 秒 | 03 半版側邊欄 | 項目超過 12 字 → 04a |
| 剛好四個並列物件，講者不能被擋 | 05 兩側 | 講者不在中央時不用 05 |
| 「A vs B」「以前…現在…」 | 04b 全畫面對照 | 多個屬性 → 04d |
| 流程「A → B → C」、架構 | 04c 全畫面流程（3–4 節點） | 2 步 → 08 |
| 多個項目 × 多個屬性 | 04d 全畫面表格 | 只有一個屬性 → 04a |
| 資訊量大的清單、一連串條件 | 04a 全畫面清單 | ≤ 3 個短詞 → 12 |
| 數字「3 年」「500 萬」「10 倍」 | fx 29 數字計數 | 數字是定義的一部分 → 06 |
| 情緒高潮「就是這個」「重點來了」 | fx 01／03／04 | 有資訊 → 07 |

開場前 30 秒最多一張，02 章節角標也算一張（R6）。短片在前 30 秒只放角標或只放一張卡。

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

一段口播字卡動態最多一兩張，而且不和下方字卡同時出現。

---

## R2. 情境細節與欄位

### R2.1 `--list` 的欄位怎麼讀

- 「長度」：沒寫 `to`／`duration` 時的預設，以及段長下限。寫了 `to` 就以 `to` 為準，但不能短於「最短」。
- 「組別」決定圖層性質：`fullscreen`、`chapter` 是不透明幕；`panel`（03）會推講者；`lower-third` 是下方字卡（相接時自動換卡）；`edge` 疊在畫面邊緣。
- 「beats」：情境內部的時間點，可以用 `"beats": { "aAt": "#14" }` 覆寫（時間語法同 `at`）。
- 「slots」的 `rich`＝可以用 `**詞**` 與 `//`；`≤N 行、每行 ≤M` 是用 `//` 斷行後的限制；`N–M 項` 是清單項數。

### R2.2 個別情境補充

- **01 章節轉場**：只寫 `"at": "#N"`（該章第一句），長度固定 2.5 秒，寫 to／duration 會被忽略。前一句結尾到第 N 句起點的空檔 ≥ 2.0 秒時，轉場放在空檔裡、結束在第 N 句起點；空檔 < 2.0 秒（auto-editor 初剪後幾乎都是）時，從第 N 句起點開始蓋 2.5 秒，人聲在下面繼續，報告會寫明是哪一種。結語章的 `sub` 放本集金句，不要只寫「結語」。短片（< 3 分鐘）不建議用：會蓋住講者 2.5 秒，又佔掉開場 30 秒的名額。
- **`chtag: true`**：在這段右上角加章節角標。能加在 04a–d、06–11、12、13、15；不能加在 01、02、03、05、14。前面一定要有 01 章節轉場，否則 ✖；短片沒有 01，要角標就單獨放一段 02。
- **03 側邊欄**：清單預設在本段第 1.3 秒起、每 0.6 秒一項；第一項不寫 `at`。`sideShift` 見 R4。
- **04a、04c**：清單在第 0.5 秒起、每 0.35 秒一項。
- **04b 對照**：單項的 `at` 不生效（整欄一起進），要控制時間改寫 `"beats": { "leftAt": "#12", "rightAt": "#14" }`。
- **04d 表格**：4 欄時每格 ≤ 4 字、3 欄時每格 ≤ 6 字（超過會報錯）。
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
- 圖示：同一個物件全集用同一個圖示。常用：文件 `file-text`、清單 `list-checks`、剪輯 `scissors`、影片 `video`、相機 `camera`、AI `bot`、時間 `clock`、存檔 `save`、資料夾 `folder`、Skill `package`、人 `user`、聲音 `volume-2`、成片 `clapperboard`、設定清單 `clipboard-list`。不確定名字時先寫，`--check` 找不到會列出相近名稱。

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
| `sfx` | 選填 | 選填 | 選填 | 12 個名稱之一（R5.2）或 `null`（不配）。不寫＝用預設（R5）；custom 不寫就不配 |
| `sfxExtra` | 選填 | | | `false`＝關掉這段的附加音效（條列、步驟的 tick 等）；不寫＝開（fx 沒有附加音效） |
| `sfxVolume` | 選填 | 選填 | 選填 | 這段音效的音量（dB，−60～+12，0＝預設），主音效與附加音效一起調；疊在 `kit/sfx.json` 與 `edit.volume.sfx` 上。通常是剪輯台寫的（核心 6.3） |
| `css` | 選填 | | | 微調位置的 CSS，id 寫模板裡的原名（R4） |
| `chtag` | 選填 | | | `true`＝在這段加章節角標（R2.2） |
| `pip` | 04 家族選填 | | 選填 | `false`＝全畫面時不放子母畫面（講者完全被蓋住） |
| `note` | 選填 | 選填 | 選填 | 給人看的備註，build 不讀 |

插入螢幕錄影與圖片（`"type": "media"`）的欄位見 R2.5。第一層的 `edit`（剪輯台）見核心第 6 節。

### R2.5 media 段的全部欄位

用法、配對流程、座標怎麼讀見核心第 5 節。`--list` 最後一張表也印出同樣的欄位。

| 欄位 | 必填 | 值 | 預設 | 說明 |
|---|---|---|---|---|
| `id` | ✓ | 英數字 | | 建議 `m01`、`m02` |
| `type` | ✓ | `"media"` | | |
| `src` | ✓ | `"素材/螢幕錄影/<檔名>"`、`"素材/圖片/<檔名>"` | | 相對專案資料夾；影片 `.mp4 .mov .m4v .webm`、圖片 `.jpg .jpeg .png .webp` |
| `from` | ✓ | 時間 | | 同其他段（核心 3.4）；剪輯台可能寫成秒數 |
| `to`／`duration` | 二選一 | 時間／秒數 | | |
| `anchor` | 選填 | 文字 | | 起點那句的一小段原文 |
| `in` | 選填 | 秒數 ≥ 0 | `0` | 錄影從第幾秒開始播（圖片忽略）；`in ＋ 段長 × speed` 超過錄影長度 ✖ |
| `speed` | 選填 | 0.5–4 | `1` | 播放速度（圖片忽略）；聲音也跟著變速 |
| `fit` | 選填 | `"contain"`、`"cover"` | `"contain"` | contain：整張放進 1920×940（字幕帶上方）置中，空白處是主題深底或 `bg.jpg`；cover：鋪滿 1920×1080 |
| `pip` | 選填 | `true`、`false` | `true` | 右下角子母畫面；只有聲音的區間自動不放 |
| `volume` | 選填 | `null` 或 −60～+12（dB） | `null` | `null`＝靜音；數字＝保留素材原聲（素材沒有聲音時 ⚠ 並忽略），疊在 `edit.volume.media` 上 |
| `enter`／`exit` | 選填 | `"cut"`、`"fade"`、`"slide"`、`"zoom"` | `"fade"` | 進場 0.5／0.5／0.6／0.5 秒、出場 0.5／0.5／0.6／0.4 秒；接在另一張整張幕後面時 `fade` 自動變 `cut` |
| `kenburns` | 選填 | `true`、`false` | 圖片 `true`、錄影 `false` | 沒寫 `moves` 時整段慢推 1.00→1.05 |
| `moves` | 選填 | `[{ "at", "to": [x,y,w,h] 或 "full", "dur" }]` | | 運鏡；`dur` 0.2–5，預設 1；不能重疊 |
| `marks` | 選填 | `[{ "at", "until", "box": [x,y,w,h] }]` | | 紅框；`until` 不寫＝到段尾；同時 ≤ 2 |
| `lens` | 選填 | `[{ "at", "until", "box": [x,y,w,h], "zoom" }]` | | 放大鏡；`until` 不寫＝`at`＋3 秒；至少 1.2 秒；`zoom` 1.2–4，預設 2 |
| `sfx` | 選填 | 音效名稱或 `null` | 不配 | 從講者切到錄影的第一段建議 `"whoosh"` |
| `sfxVolume` | 選填 | −60～+12（dB） | `0` | |
| `note` | 選填 | 文字 | | build 不讀 |

- 座標（`box`、`moves.to`）一律是**素材原尺寸的像素**，用 `media.mjs frame --grid` 讀（核心 5.4）。超出素材範圍 ✖。
- `moves`／`marks`／`lens` 的 `at`／`until`：`"#N"`、`"#Ne"`、`"#N±秒"`、`"+秒"`（本段起點後），不能寫絕對秒數，要落在這段裡。
- 圖層：media 段和全畫面情境一樣是整張幕（z 30）。同一時間只能有一張整張幕（✖）；期間不能出現下方字卡、側邊欄等透明情境（✖）；透明字卡動態可以疊（⚠ 提醒確認）。
- build 會把錄影轉成 30fps、每秒一個關鍵幀、`speed` 做進檔案（`work/hyperframes/assets/media/`，依素材大小＋修改時間＋設定快取，素材沒變不重轉，沒用到的舊檔自動刪）；放大鏡把那幾秒逐幀裁成 JPG（同一張畫面只存一份）。

### R2.6 `--check --json` 的格式

`node shared/template/tools/build.mjs --project projects/<專案> --check --json`：stdout 只印一個 JSON（出錯也是，`ok: false`、訊息在 `errors`），不寫檔（只會寫偵測快取 `work/hyperframes/.cache/`）。結束碼同 `--check`（有 ✖ 是 1）。**時間都是 `rough.mp4` 的秒數。**

```json
{ "ok": true, "errors": [], "warnings": ["[s02 concept] …"],
  "videoDur": 107.567, "outputDur": 103.067,
  "voiceOnly": [[41.0, 58.2]],
  "cutpoints": [ { "at": 12.34, "kind": "ng" } ],
  "items": [
    { "id": "s01", "type": "scene", "label": "06 一般字卡", "start": 12.5, "end": 18.0,
      "sfx": [ { "name": "pop", "at": 12.623, "volume": 0.354, "db": -9 } ], "warnings": 0 },
    { "id": "m01", "type": "media", "label": "media 操作示範.mp4", "start": 41.0, "end": 58.2, "shownEnd": 58.8,
      "sfx": [], "warnings": 1, "src": "素材/螢幕錄影/操作示範.mp4", "enter": "fade", "exit": "fade", "volume": null, "kind": "video" } ],
  "edit": { "cuts": [], "fadeIn": 0, "fadeOut": 0, "volume": { "voice": 0, "sfx": 0, "media": 0 }, "gains": [], "joins": [] },
  "paths": { "project": "projects/範例", "video": "projects/範例/work/rough.mp4", "plan": "projects/範例/work/hyperframes/plan.json", "out": "projects/範例/work/hyperframes" } }
```

| 欄位 | 說明 |
|---|---|
| `videoDur`／`outputDur` | `rough.mp4` 長度／成片長度（＝`rough.mp4` − cuts） |
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

---

## R3. 字卡動態（fx）

- plan.json 寫 `"type": "fx", "fx": 編號`；40 種的名稱、vars、什麼時候用，跑 `--list` 看。效果看 `shared/template/fx/index.html`。
- `bg` 預設 `none`（透明疊在講者上）；`dark`／`light`／`accent` 是不透明整張幕（會蓋住講者，沒有子母畫面）。顏色自動用 `kit/brand.css` 的主色，不用寫 `accent`。
- vars 的值一律寫字串：`"vars": { "number": "3", "label": "道檢查" }`。
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
| 字幕區 | y ≥ 920（底部 160px） | **什麼都不放**（字幕框在 y 940–1020）。`check --caption-zone` 會把壓到這裡的文字當錯誤 |
| 子母畫面 | 本體 x 1344–1856、y 630–918（512×288）；外框禁入區 x 1344–1888、y 617–951 | 只在全畫面情境與 media 段出現。全畫面主卡右緣 ≤ 1300；media 段的紅框、放大鏡壓到這裡會 ⚠ |
| media 段可見區 | `fit: "contain"`：y 0–940 置中；`"cover"`：整個畫面 | 素材下緣碰到字幕帶上緣，字幕照常疊在上面 |
| 講者框 | speakerBox | 透明的卡不能壓到臉與手勢 |

各情境大約佔的範圍（build 拿來和 speakerBox 算碰撞，重疊 > 15% 就提醒）：

| 情境 | 大約範圍 |
|---|---|
| 06–10、13、14 下方字卡（靠左） | x 120–1020、y 536–860 |
| 11 總結、15 金句（置中） | x 510–1410、y 536–860 |
| 12 關鍵詞條列 | x 120–560、y 160–870 |
| 02 章節角標 | x 1200–1824、y 56–168 |
| 05 兩側 | x 96–600 與 1320–1824、y 160–870 |

碰撞提醒是用這張固定範圍算的，只是提醒；最後以 snapshot 為準。

### R4.2 依講者位置挑情境

| 講者位置 | 適合 | 避開或要調整 |
|---|---|---|
| 置中 | 全部 18 個 | — |
| 右側（中心 x > 1060） | 06–10、12、13、14（靠左）、04 家族；03 用 `sideShift: 0` | 11、15 置中會壓到身體：snapshot 看臉，擋到臉就換 06／07 或用 `css` 移到左邊；只壓到身體就保留，交 Studio 時點名請使用者確認（核心 2.5）。05 不用 |
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

- `"auto"`：講者置中時裁 x 16–82%、y 2–68% 的區域；不置中時以 speakerBox 中心取一個 16:9 的框（高＝max(框高×1.15, 框寬×1.15×9/16)，夾在畫面內）。
- 也可以直接寫 `[x, y, w, h]`（1920×1080 座標、寬高比 16:9）。snapshot 看到子母畫面裡的講者被切到頭或手時才改。

### R4.6 用 `css` 微調位置

```json
{ "id": "s04", "scene": "quote", "from": "#32", "to": "#33e",
  "slots": { "text": "把踩過的坑//寫成下一次的文件", "by": "鼎淵" },
  "css": "#gCard { left: 120px; right: auto; margin: 0; }" }
```

- 只寫位置（left／right／top／bottom／margin），不改字級、顏色、寬度、內距。
- id 寫模板裡的原名，build 會自動加前綴與範圍。各情境的主元件 id：06、07、08、11、13、15 是 `#gCard`；09 `#qaCard`；10 `#tipCard`；14 `#spkCard`；12 `#kwList`；02 `#cBadge`；04 家族 `#wCard`；05 `#sCard1`–`#sCard4`；01 `#chGroup`。寫了模板裡沒有的 id 會報錯並列出可用的 id。
- 下方字卡的底一律是 `bottom: 220px`（卡底 y 860），不要往下移進字幕區。
- 碰撞提醒是用固定範圍算的，移位後提醒不會消失；移完一定要 snapshot 確認，並在回報裡說明「已移位、snapshot 確認沒壓到講者」。

---

## R5. 字幕與音效

### R5.1 字幕（build 自動產生，不用寫）

- 來源：`work/rough.srt`（已校正，不要重新轉錄）。
- 樣式（`shared/style.md`，實作在 `shared/template/kit/captions.css`）：英數 Google Sans Flex、中文 Noto Sans TC、字重 500、54px、行高 64、字距 1、白字、黑底 70% 不透明、直角、寬度貼字、距底 60px（字幕框 y 940–1020）、水平置中、只排一行。
- 每則最多 18 字（全形 1、半形 0.5），超過要在 rough.srt 拆句（核心 2.4）；估寬超過 1600px 也會提醒。
- build 的處理：同一時間只顯示一則（前一則截到下一則起點）；第 0 秒開始的字幕挪到 0.1 秒；每則用硬開硬關（不淡入），所以不會殘留。產生的檔是 `compositions/captions.html`，每則 id 是 `cg-<句號>`。
- 時間碼不準（字幕比講話早或晚）時，snapshot 看不出來；處理見核心 4.3。

### R5.2 音效

音效對準畫面事件，不放句尾。全部由 build 自動配，AI 只在要換、要拿掉時寫 `sfx`／`sfxExtra`。

**12 個音效**（`shared/sfx/<名稱>.wav`，峰值與音量在 `shared/template/kit/sfx.json`）

| 檔名 | 聽起來像 | 用在 | 預設音量 |
|---|---|---|---|
| `pop` | 泡泡 pop | 下方字卡揭開、第一張卡片出現 | 0.5 |
| `tick` | 輕 tick | 條列逐條出現、步驟切換，每條一顆 | 0.3 |
| `swipe` | 短 swoosh | 側邊欄推入、角標滑入 | 0.45 |
| `whoosh` | 空氣 whoosh | 章節轉場、全畫面幕進場 | 0.5 |
| `ding` | 清亮鈴聲 | 講重點、答案揭曉 | 0.45 |
| `success` | 完成 chime | 解法、成果、完成 | 0.5 |
| `alert` | 柔和錯誤音 | 千萬不要、踩坑、注意 | 0.45 |
| `impact` | 悶重 thud | 蓋章、重擊、字爆發 | 0.5 |
| `flip` | 翻牌 | 翻牌、翻卡、切換 | 0.45 |
| `type` | 打字短串 | 打字機動畫起手 | 0.35 |
| `glitch` | 數位故障 | 出錯、系統崩潰、bug | 0.45 |
| `riser` | 上升張力音 | 隧道、穿越、揭曉前的鋪墊（峰值在結尾） | 0.4 |

**情境預設配對**（寫在各情境的 `scene.json` 的 `sfx` 區塊）

| 情境 | 主音效＋落點 | 附加音效 |
|---|---|---|
| 01 chapter | `whoosh`：段起點前 0.15 秒 | — |
| 02 chapter-tag | `swipe`：進場 | — |
| 03 side-panel | `swipe`：段起點 | `tick`：每一條項目 |
| 04a fs-list | `whoosh`：段起點前 0.15 秒 | `tick`：每一條項目 |
| 04b fs-compare | `whoosh`：段起點前 0.15 秒 | `tick`：左欄進場、右欄進場 |
| 04c fs-flow | `whoosh`：段起點前 0.15 秒 | `tick`：每一個節點 |
| 04d fs-table | `whoosh`：段起點前 0.15 秒 | `tick`：每一列 |
| 05 two-sides | `pop`：第一張卡片 | `tick`：第 2–4 張卡片 |
| 06 concept | `pop`：進場後 0.1 秒 | — |
| 07 key-point | `ding`／`alert`／`success`（依 tone）：進場後 0.15 秒 | — |
| 08 steps | `pop`：進場後 0.1 秒 | `tick`：第 2 步起每一步 |
| 09 qa | `pop`：進場後 0.1 秒 | `ding`：答案進場（音量 ×0.8） |
| 10 tips | `pop`：進場後 0.1 秒 | — |
| 11 summary | `pop`：進場後 0.1 秒 | — |
| 12 keywords | `pop`：第一個詞 | `tick`：第 2 個詞起每一個 |
| 13 title-list | `pop`：進場後 0.1 秒 | `tick`：第 2 條起每一條 |
| 14 speaker | `pop`：進場後 0.1 秒 | — |
| 15 quote | `pop`：進場後 0.1 秒 | — |

07 的 tone：`warn`＝`alert`、`good`＝`success`、沒寫＝`ding`。

**字卡動態**：預設音效寫在 `fx/catalog.json` 的 `sfx` 欄（`{ "sound": 名稱, "at": 秒數 }`，沒寫 `at` 就是段起點）；`--list` 字卡動態表的音效欄看得到預設。

**覆寫方式**（寫在 plan.json 的那一段）

- `"sfx": "ding"`：換主音效名稱，落點不變。
- `"sfx": null`：這段不要主音效。
- `"sfxExtra": false`：關掉這段的附加音效，主音效不受影響。
- `"sfxVolume": -6`：這段音效（主音效＋附加音效）的音量，dB；疊在上表的預設音量與 `edit.volume.sfx` 上（剪輯台會寫）。
- custom 要音效就自己寫 `"sfx"`（落點＝段起點）；不寫就不配。

**時間規則**

- 起點＝畫面事件時間 − 音效峰值 ＋ 1 幀（理由：放在句尾的音效會晚 1–3 秒，聽起來像沒對上）。
- 一張卡最多一個主音效；兩個主音效相距不到 3 秒時只留前一個，被拿掉的會出現在提醒與報告的「音效時間」欄（`（pop 已拿掉）`）。3 秒間隔只比主音效，不比附加音效。
- 同一段附加音效的起點相距不到 0.2 秒，丟掉後者（也會和主音效比）。

要新增情境或改模板見 R14。

音效只能用 `shared/sfx/` 裡的 12 個檔，不另外下載。

---

## R6. 密度與節奏

| 規則 | 數字 | 理由 | build 會檢查？ |
|---|---|---|---|
| 密度 | 每 3–8 句一張；實機操作段往稀的那端 | 卡太密就變第二份字幕 | — |
| 開場 | 前 30 秒最多一張；02 章節角標也算一張 | 開場是講者建立信任的時間 | ⚠ |
| 露臉 | 兩段動畫之間講者露臉 ≥ 3 秒（章節轉場後接的那段不算） | 觀眾要看到人 | ⚠（只在間隔 0.01–3 秒時提醒；前一段結尾＝後一段起點、完全沒露臉的情況 build 不會提醒，要自己檢查報告的起迄） |
| 同情境 | 不連續三段同一情境；同一章裡同一情境最多三次 | 視覺疲乏 | ⚠（連續三段） |
| 一段一個 | 同一時間只放一個情境（02 章節角標除外） | 兩個強調互搶 | ⚠ |
| 字卡動態 | 一段口播最多一兩張，不和下方字卡同時出現 | 同上 | ⚠ |
| 停留 | 一般卡 2.5–4 秒以上；重點卡（07）至少 4 秒、停到這個重點講完 | 讀得完 | ✖（段長下限） |
| 新訊息停留 | 第二層新訊息（QA 的答案、Step 2、條列下一條）出現後至少再停 1.2 秒；最後完整內容至少停 1.5 秒才退場 | 讀得完 | ⚠（最後內容 < 1.5 秒）；✖（完成態 < 0.6 秒） |
| 字數 | slots 上限照 `--list`；主句 8–14 字照 `style.md` | 版面放得下；看一眼就懂 | ✖（只檢查 `--list` 上限，8–14 字不檢查） |
| 換卡 | 兩張下方字卡相接時自動處理：前一張延到後一張起點＋0.4 秒，退場和進場同時 | 不要等上一張完全消失 | 自動 |
| 動作秒數 | 進場 0.5、出場 0.4（模板固定） | 作者定案 | 自動 |

核心 4.2 沒列的訊息：

| 訊息（節錄） | 類型 | 怎麼改 |
|---|---|---|
| `在 avoid 名單（使用者說不要用）→ 換別的情境` | ✖ | 換情境 |
| `字幕沒有第 N 句（rough.srt 共 M 句…）` | ✖ | 句號超出範圍 |
| `不是合法的 JSON：…（JSON 不能有註解、最後一項後面不能有逗號）` | ✖ | plan.json 是純 JSON |
| `字卡動態和下方字卡（…）同時出現 → 兩個強調會互搶，錯開或擇一` | ⚠ | 錯開時間或刪一個 |
| `連續三段都是同一個情境 → 換一個情境或合併` | ⚠ | 換情境 |
| `vars 沒寫，會顯示預設文字「…」→ 寫 vars.text` | ⚠ | 補 vars |
| `結尾 …s 超過影片長度 …s，已截短` | ⚠ | 通常可接受（最後一句） |
| `edit.cuts 幾乎剪掉整支影片（剩 Ns）` | ✖ | 剪輯台的 cuts 秒數不對，請使用者在剪輯台檢查 |
| `edit.fadeIn＋fadeOut（Ns）比成片長度 Ns 還長` | ✖ | 縮短淡入淡出 |
| `moves[i].to 要放大 N 倍，畫面會糊 → 框大一點，或改用放大鏡 lens` | ⚠ | 照 `→` 改 |
| `lens[i] 期間有運鏡，鏡片位置是用 … 那一刻的畫面算的` | ⚠ | 運鏡和放大鏡錯開 |
| `marks[i] 只停 Ns（< 0.5s，閃一下就不見），已拿掉` | ⚠ | 要留就把 `until` 往後延 |
| `work/cutpoints.json 不是合法的 JSON` | ⚠ | 照 AGENTS.md「剪乾淨」第 7 步重新產生；不影響 build，只是 `joins` 對不到剪接點 |

---

## R7. 第二層情境動畫（`type: "custom"`）

### R7.1 什麼時候用：有情境就做動畫

作者的方向：口播在講一個「情境」時，做動畫比單純的字卡好，合適的動畫越多越好。字卡留給名詞、一句重點和提醒。

挑法（分鏡時每一段都照這個順序判斷）：

| 口播在講 | 用什麼 |
|---|---|
| 過程、流程、步驟依序發生 | 3–4 站排成一直線、逐站出現 → 04c 全畫面流程；節點不在同一直線（分岔、匯流、上下錯落）、要逐站亮起 → 情境動畫 |
| 前後對比、改善前後 | 左右兩欄並列就夠 → 04b 全畫面對照；要讓「同一個東西變過去」、數字跟著變 → 情境動畫 |
| 數值變化、比例、超量 | 情境動畫 |
| 比喻（生活物件 → 技術概念） | 情境動畫 |
| 因果、架構、誰傳給誰 | 情境動畫 |
| 介面操作，但沒有螢幕錄影 | 情境動畫：示意畫面先給全貌，再放大重點 |
| 介面操作，有螢幕錄影 | media 段（核心第 5 節），不另做動畫 |
| 一個名詞、一句重點、一個提醒、並列幾個詞 | 字卡與條列（R1） |

| | 第一層：模板套用 | 第二層：情境動畫 |
|---|---|---|
| 是什麼 | 18 情境＋40 字卡動態 | 一支 `work/hyperframes/compositions/x-<名稱>.html`，從 `shared/template/custom/` 的範例改（R7.5） |
| AI 要做的事 | 在 plan.json 填 `slots`（文字）與綁定的字幕句號 | 改範例的文字、圖示、時間軸，再登記到 plan.json |
| 版面 | 模板固定，不能改（只能用 `css` 微調位置） | 自己排，遵守 R7.3 骨架、R7.3 的版面原則與 R8 硬規則 |
| 什麼時候用 | 口播講名詞、一句重點、提醒 | 口播在講上表的情境，段長 ≥ 4 秒 |
| 數量 | 依密度（R6） | 有情境就做，不設上限；兩段之間講者照 R6 露臉 ≥ 3 秒 |
| plan.json 寫法 | `"scene": "<key>"` 或 `"type": "fx"` | `"type": "custom"`、`"src"`、`"layout"` |

- 分鏡表的「情境」欄寫 `custom（fullscreen）` 或 `custom（overlay）`，再寫從哪一支範例改；「理由」欄寫口播在講哪一種情境。使用者確認分鏡表後才開始做。
- 每段情境動畫是一支獨立的檔，彼此不相依：分鏡表確認後，照 `AGENTS.md`「子代理分工」一段派一個子代理同時做。
- 品質關卡：每一段都要通過 R7.6 的檢查，並看過 snapshot 的中段與完成態，才交給使用者看 Studio。
- 兩層在同一個主合成裡一起掛：build 依 plan.json 的順序把它們排進時間軸，第二層的子母畫面、淡入淡出也由 build 加。
- 拿不準的時候：情境動畫比字卡多花製作與檢查的時間（點數），口播只是一句話帶過的地方，不要硬做動畫（作者：「影片內容合適時就採納，不合適就不用」）。

### R7.2 檔案與登記

1. 從 `shared/template/custom/` 挑最接近的範例（R7.5），複製到 `work/hyperframes/compositions/x-<名稱>.html`（名稱只用英數與 `-`）。檔名、`data-composition-id`、`<template id>`、`window.__timelines[...]` 四處要一起改成新名稱，所有 id 與 class 的前綴也一起換（例：`xproc-` → `xflow-`）。build 不會碰這個檔。
2. 檔內 `data-composition-id` 要等於檔名（`x-flow`），script 要登記 `window.__timelines['x-flow']`，`<style>` 要放在 `<template>` 裡；不符合時 `--check` 會報錯。
3. 在 plan.json 登記：

```json
{ "id": "x01", "type": "custom", "src": "compositions/x-flow.html", "layout": "fullscreen",
  "from": "#17", "to": "#25e", "anchor": "接著用 Whisper", "sfx": "whoosh" }
```

| `layout` | 用在 | build 會做什麼 | 你要做什麼 |
|---|---|---|---|
| `"fullscreen"` | 不透明全畫面圖解 | 整段淡入淡出 0.5 秒、加子母畫面（`"pip": false` 可以拿掉）、和相鄰不透明幕接縫不淡 | 第一個子元素放滿版底 `<div class="sc-surface-fs fill"></div>`；主內容右緣 ≤ 1300；內容從第 0.5 秒（淡入完）之後才開始動 |
| `"overlay"` | 透明、疊在講者上 | 只在時間到時掛上、時間到拿掉，**不幫你淡入淡出** | 自己寫進場與退場（`P.out(..., D - P.OUT)`）；不放滿版底；不能壓到 speakerBox |

4. 子合成的長度 D：先用估計值寫，跑 `--check` 後，把報告裡這段的「長度」填回檔內的 `data-duration` 與 `const D`（理由：時間軸要撐到整段長度，短了最後一段不會被取樣）。

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
    [ 'in', 'out', 'drift', 'reveal', 'rise', 'maskUp', 'sideIn', 'sideOut', 'morph', 'push', 'count', 'bar', 'stroke', 'icon', 'check' ].forEach(function (k) { var f = P[k]; P[k] = function (s) { var a = Array.prototype.slice.call(arguments); a[0] = $q(s); return f.apply(P, a); }; });
    [ 'swap', 'axis' ].forEach(function (k) { var f = P[k]; P[k] = function (s1, s2) { var a = Array.prototype.slice.call(arguments); a[0] = $q(s1); a[1] = $q(s2); return f.apply(P, a); }; });
    const D = 8;
    P.rise('#xflow-n1, #xflow-n2, #xflow-n3', 0.5, { stagger: 0.15 });
    P.in('#xflow-on1', 1.0);
    P.in('#xflow-on2', 3.0);
    P.in('#xflow-on3', 5.2);
    P.end(D);
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
- 時間軸的時間是「本段起點之後的秒數」。要對到某句字幕，用 `--check` 報告裡這段的起點和 `work/rough.srt` 的句子起點相減。
- 結尾一定要 `P.end(D)`（或 `tl.set({}, {}, D)`），D 等於 plan 報告裡的長度。
- 顏色只用 token（`var(--brand)`、`var(--sc-*)`），不寫色碼。理由：使用者換主色後，寫死的黃色不會跟著變。要「亮起來」就疊一層主色框再淡入（如上例的 `.xflow-on`），不要用 GSAP 補間顏色。
- 動畫只用 `SceneMotion` 的方法：進退場 `P.in`／`P.out`／`P.rise`／`P.reveal`／`P.drift`／`P.maskUp`／`P.swap`／`P.axis`，描圖示 `P.icon`／`P.stroke`／`P.check`，以及下表的情境動態。它會自動處理同一元素第二次補間的 `immediateRender:false`，也是作者定的節奏（進場 0.5、出場 0.4、位移 8–16px、描線 0.7）。不要用 GSAP 的 `onUpdate`／`onComplete` 改畫面：HyperFrames 跳到任意時間截圖時不會觸發回呼，畫面會停在錯的狀態。

| 方法 | 做什麼 | 預設 |
|---|---|---|
| `P.morph(sel, at, {width, height, left…}, {from})` | 同一個容器變形（寬高或位置）。往回 seek 要帶 `from`；連續變形時，後一次的 `from` 寫成前一次的終點 | 0.7 秒、`back.out(1.15)` |
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
- 不加口播沒講的裝飾（掃光、外圈、重複的小卡）；截圖與手機畫面一律等比，不擠壓。

### R7.4 怎麼讀 kit 的樣式

- `shared/template/kit/scene.css` 第 1–100 行：class 一覽與組裝範例（`.sc-wcard` 全畫面主卡、`.sc-card` 深色卡、`.sc-pill` 膠囊眉標、`.sc-icon` 圖示圓、`.sc-num` 序號圓、`.sc-row` 橫排、`.sc-t30`–`.sc-t150` 字級、`.sc-w500／700／900` 字重、`.sc-kw` 關鍵詞色、`.sc-opt` 光學置中）。
- `shared/template/kit/theme.css`：顏色 token（`--sc-fs-bg`、`--sc-fs-card`、`--sc-fs-card-line`、`--sc-fs-ink`、`--sc-fs-kw`、`--sc-fs-node`、`--sc-card-solid`、`--sc-ink`、`--sc-mute`、`--sc-warn`、`--sc-good`）與 `kit/brand.css` 的 `--brand`、`--brand-ink`、`--brand-text`。
- 最接近的模板當範本：流程看 `shared/template/scenes/04c-fs-flow/template.html`，清單看 `04a-fs-list`。build 產生的 `work/hyperframes/compositions/sNN-*.html` 是完整的子合成實例。
- 圖示：`shared/template/kit/icons.json` 是 `{ "名稱": "<svg…>" }`，把 svg 原文貼進 `<span class="sc-icon">…</span>`（拿掉 svg 的 class、width、height）。容器進場後把線描出來：`P.rise('#xflow-ico1', 1.0); P.icon('#xflow-ico1', 1.0 + P.BEAT);`（`P.icon` 描容器裡所有的線，形狀沒有 `pathLength` 會自動補）；總結、回顧用 `P.check`（先描圓、0.25 秒後描勾），流程圖的站不打勾。
- 字型不用宣告：主合成已載入 `kit/fonts.css`，文字自動用 Noto Sans TC。真的要寫就寫 `font-family: var(--font-cjk)`，不寫字型名。

### R7.5 情境動畫範例（`shared/template/custom/`）

四支範例都照 R7.3 骨架、作者的版面原則與 seek 規則驗證過（`build --check`、`hyperframes check`、亂序 snapshot）。每支檔頭都寫了：適用的口播、不要用在哪裡、要改的地方、時間軸怎麼對字幕句。

| 口播在講 | 範例檔 | 畫面上發生什麼 | 要改的地方 |
|---|---|---|---|
| 一條有先後的過程，3–4 站、每站一句，站不排成一直線（「先錄影，接著轉逐字稿，再列清單，最後初剪」） | `x-process.html` | 站逐步亮起、曲線連接線描出來，走過的站只換框色、不打勾 | 標題、站名（≤ 5 字）、四個圖示、`T1..T4`、`D` |
| 比喻：生活物件 → 技術概念 → 一句代價（「Skill 像使用說明書，AI 照著做，寫錯就照錯做」） | `x-metaphor.html` | 左圖示描線 → 箭頭描線 → 右圖示描線 → 結論句浮出 → 警示句 | 標題、左右名稱、結論與限制句（各 ≤ 10 字）、三個圖示、`T1..T5`、`D` |
| 同一件事換個做法，時間或成本差很多（「手動剪 3 小時，AI 剪 20 分鐘」） | `x-before-after.html` | 同一張卡變形：標籤換字、圖示重描、數字計數、量條縮短，最後蓋出省下多少 | 前後的標籤、數字、單位、圖示、時間點、`D` |
| 數量超過上限，再處理掉大部分（「NG 32 段，剪掉 28 段」） | `x-numbers.html` | 計數器加量條，超量時同一根軌道撐破、變警示色，第二列用同一把尺比 | 兩列的名稱、數字、上限、圖示、時間點、`D` |

- 用法：照 R7.2 第 1 步複製、改名，再照檔頭「要改的地方」改文字和時間點，最後登記到 plan.json。
- 沒有剛好對上的情境（因果鏈、架構、誰傳給誰）：從版型最接近的範例改，流程類從 `x-process`，兩邊對照類從 `x-metaphor`。
- 改完照 R7.6 檢查。

### R7.6 每段情境動畫的檢查

1. `node shared/template/tools/build.mjs --project projects/<專案> --check`：骨架、id、長度都要過，把報告裡這段的「長度」填回 `data-duration` 與 `const D`。
2. build 之後跑版面量測：`node shared/template/tools/audit.mjs --project projects/<專案>`（預設只量情境動畫；`--only x01` 只量一段；`--all` 連模板段一起量）。它在瀏覽器裡把每一段跳到中點與完成態（段尾前 0.6 秒），量出 ✖ 文字撐破容器、內容被裁掉、超出畫面、進字幕區（y > 920）、壓到子母畫面，以及 ⚠ 壓到講者框、字小於 30px、半像素邊、段長不符。✖ 全部修掉才往下，⚠ 照 `→` 改，或在回報裡說明為什麼保留。只改了 custom 檔不用重跑 build，直接再跑 audit；改了 plan.json 要先 build。刻意超出畫面的元素（例：從畫面外推入）標 `data-layout-allow-overflow`，刻意放在字幕帶的標 `data-layout-allow-caption-zone`（和 `hyperframes check` 同一組標記），並在回報寫理由。
3. `npx hyperframes snapshot --at <描線中段>,<完成態>`，親眼看：線描完閉合、數字對、文字沒撐破、沒壓到子母畫面和字幕區。
4. 派給子代理做時，子代理交回 1–3 的結果；主代理整合後再跑一次 1 和 2。audit 有 ✖ 就把那幾行原文交回給寫那支的子代理修。

---

## R8. 硬規則與陷阱

`hyperframes check` 抓不到下面這些。第一層模板已經全部遵守；**寫第二層 custom、或用 `css` 移位時，自己要檢查**。

| # | 規則 | 為什麼 |
|---|---|---|
| 1 | `check` 全過不代表版面正確。有第二層情境動畫一定跑 `audit.mjs`（R7.6），再 `snapshot --review` 看圖（核心 2.5） | 作者實測：九段 check 全部 0 issues，實際六段破版。原因：`check` 的版面量測只取全片均分的 9 個時間點，一個問題只在 1 個取樣點出現就降成 info、不算 issue，5–8 秒的段最多被取到一次；用 `--at` 指定時間也一樣會被降級 |
| 2 | 文字不進字幕區（y ≥ 920）；`check --caption-zone "x0=0;y0=0.852;x1=1;y1=1;severity=error"` | 情境文字壓到字幕。`--caption-zone` 預設只量片尾最後一格、而且只量文字框，片中的卡片進字幕區要靠 audit |
| 3 | 硬邊、實心深色底；不要光暈、發光、模糊、陰影光圈、漸層外框；亮色大面積只能用在不透明全畫面 | 亮色塊邊緣壓縮後會浮出白暈；透明背景上看起來像髒污 |
| 4 | 座標、尺寸一律整數 px；自己畫的邊框至少 2px、alpha ≥ 0.34 | 1.5px 會被捨成 1px，半像素線發糊（audit 會報「半像素邊」⚠） |
| 5 | 字級下限：正文 ≥ 52px（`.sc-t52` 起）、標題 ≥ 72px（`.sc-wcard__bar` 標題列固定 64 例外）、標籤 ≥ 38px；空間夠就放大；放不下縮文案，不縮字 | 字太小是作者最常退件的原因（audit 只抓 < 30px，52／38 的下限要自己對） |
| 6 | 間距：標題到內容 ≥ 40；文字框內距左右 ≥ max(24, 0.45×字級)、上下 ≥ max(14, 0.28×字級)；line-height ≥ 1.25；框寬用 `max-content` | 卡片擠、右側空白、g／p／y 的下伸部被切 |
| 7 | 中文斷行：自己用 `<br>` 斷在語意處，或 `text-wrap: balance`；不能拆的詞包 `<span style="white-space:nowrap">`；標題 nowrap | 「檔／案放進」這種詞中斷行 |
| 8 | `.fill` 的直接子元素一律 `position: absolute`＋寫死 left／top；最終版面先排好，後出現的元素先預留位置（用 opacity 藏，不用 display:none） | 元素黏在 (0,0)；後進場的元素把既有元素擠走 |
| 9 | 同一元素第二段 `fromTo` 要 `immediateRender: false`；只用 `SceneMotion` 就不用管 | 第一幀就出現應該稍後才發生的狀態 |
| 10 | 時間軸撐到 root 長度：`P.end(D)` 或 `tl.set({}, {}, D)` | 最後一段被截掉或沒被取樣 |
| 11 | 字型只寫 `var(--font-cjk)`、`var(--cap-font)` 或有 `@font-face` 的字型名 | 寫字面字型名，lint 報 error，整段 check 不跑 |
| 12 | 圖片一律 `object-fit` 等比，不擠壓 | 圖片變形 |
| 13 | 不做非 90 度的 div 旋轉；fx 03／12／16／33 少用 | 斜邊鋸齒 |
| 14 | 子合成：style 與 script 放在 `<template>` 裡、id 三處一致、用 `fromTo` 不用 `from`、root 用 id 選擇器 | 沒有樣式；時間軸 45 秒後變靜止幀 |
| 15 | 動作：不要縮放彈跳、旋轉、大位移飛入；位移 8–16px、進場 0.3–0.5 秒、出場 0.3–0.4 秒 | 作者定調「以淡入為底，只加有理由的方向」 |
| 16 | 含 `<video>` 的合成一律用 `npx hyperframes render`，不用其他截圖式 render 工具 | 影片會凍在同一幀，ffprobe 卻全部通過 |
| 17 | 第二層與 `css` 移位不能壓到 speakerBox、不能進子母畫面禁入區（全畫面時 x 1344–1888、y 617–951） | 擋臉；壓到子母畫面（audit 會報：壓到子母畫面 ✖、壓到講者 ⚠） |

| audit 抓得到 | audit 抓不到（要看 snapshot） |
|---|---|
| 文字撐破有底有框的盒、被會裁切的框切掉、超出畫面、進字幕區、全畫面壓到子母畫面、壓到講者框（面積比例）、字 < 30px、半像素邊、custom 的段長與 script 錯誤 | 間距與內距（第 6 條）、中文斷在詞中間、兩張卡互相重疊、對比與底板、進場途中的暫態（正在補間的元素不判）、字卡動態與 media 段、時間有沒有對到口播 |

build 已經自動處理、不用你做的（知道就好，不要重做）：時間在產生時就換成數字（不會算出 NaN）；底片重新編碼成固定 30fps、每秒一個關鍵幀（關鍵幀太稀時 seek 會凍結）；全畫面相接時接縫不淡；子母畫面用靜音主軌複本＋外框圖、位置和情境庫一致；側邊欄推講者的曲線和面板同步；字幕硬開硬關、同時只顯示一則；音效對準畫面事件、附加音效跟著條列；每個子合成的 id 與 CSS 都加了前綴與範圍。

`check` 可能出現的提醒：
- `Craft ⚠ line_unread: The film's last line "…" … is on screen 1.69 s …, under the 2.00 s a closing line needs` → 那段最後一項停太短：`to` 往後延，或把最後一項的 `at` 提早。

---

## R9. 換主色與背景

只在使用者明確要求時才改；這是 `shared/` 唯讀規則的唯一例外。

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

把它印出的對比值與警告原文轉告使用者。紅色系的警告要明講「觀眾會分不出哪個是警告」，建議換色。換完重跑 build（`kit/` 每次 build 都會重新複製，成片才會換色）；預覽頁 `shared/template/index.html` 重新整理就會更新。

不要只手改 `brand.css` 的 `--brand` 一行（理由：`--brand-ink`、`--brand-text` 不會跟著算，深色主色會看不清楚；子母畫面外框也不會換色）。

### R9.2 背景圖

- 把圖放成 `shared/template/bg.jpg`（檔名固定）。建議 1920×1080、暗色、主要內容不要放在左上（全畫面主卡在 x 120–1300、y 150–862）。
- 影響範圍：01 章節轉場、04 全畫面家族、03 側邊欄面板（取圖的左半）。
- 放好後重跑 build。拿掉背景就刪掉 `bg.jpg` 再重跑 build。
- 使用者要「生成同色系背景圖」時，用你自己的生圖能力產生，存成 `shared/template/bg.jpg`；做不到就說明，建議只換主色、保留預設的程式碼底紋。

---

## R10. 不可以做的事

| 不可以 | 理由 |
|---|---|
| 重新設計卡片、自己畫第一層情境的版面 | 版型只從素材包挑 |
| 改 `shared/template/` 裡的任何檔（例外：使用者要求時的 `kit/brand.css`、`kit/pip-frame.png`（brand.mjs 寫）、`bg.jpg`） | 模板是共用素材；改壞了每集都壞 |
| 手改 build 產生的檔（`index.html`、`compositions/sNN-*.html`、`captions.html`、`test-clip.html`、`work/hyperframes/kit/`） | 下次 build 會被擋下或蓋掉；改 plan.json 再重跑 |
| 用 `css` 改字級、顏色、寬度、內距 | 字級是作者定好的下限；`css` 只改位置 |
| 另外下載字型、圖示、音效、素材，或用 CDN | 全部都附了；另外下載的東西 Windows 與離線環境不一定有 |
| 登入任何服務 | 工作區規則 |
| 重新轉錄字幕 | `work/rough.srt` 已經校正過；時間碼不準就改那一則的時間 |
| 加光暈、發光、模糊、漸層外框 | 作者風格：硬邊、實心底 |
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
| 情境預覽 | `shared/template/preview/<NN>-<key>.html`、`shared/template/gallery/*.jpg` | 18 頁 | 給使用者看用；預覽講者是 Q 版圖、位置置中，實際版面以場地照與 snapshot 為準 |
| 頻道主題 | `shared/template/kit/brand.css`（主色 3 行）、`theme.css`、`scene.css` | 1 套 | 換主色見 R9 |
| 背景圖掛鉤 | `shared/template/bg.jpg`（預設沒有） | 1 個 | 放了就套到章節轉場、全畫面、側邊欄 |
| 圖示 | `shared/template/kit/icons.json` | 約 1,550 個 lucide 圖示 | slots 裡寫圖示名（例：`clipboard-list`） |
| 字型 | `shared/template/kit/fonts/` | Noto Sans TC、Google Sans Flex（OFL） | 已由 `kit/fonts.css` 載入，不用安裝 |
| 音效 | `shared/sfx/*.wav`＋`shared/template/kit/sfx.json` | 12 個 | build 自動配，見 R5 |
| 字卡動態預覽影片 | `shared/template/fx/renders/` | 每種效果一支 | 只給畫廊（`fx/index.html`）看，成片不用，改了效果 HTML 也不會跟著變 |
| 音效資料 | `shared/template/preview/sfx-data.js` | 1 個 | `build.mjs --gallery` 產生，畫廊頁與音效總表用 |
| 主合成產生器 | `shared/template/tools/build.mjs` | 1 支 | 核心第 2 節 |
| 素材工具 | `shared/template/tools/media.mjs` | 1 支 | `scan`（contact sheet）、`frame --grid`（座標格線圖）、`main`（接主軌）；核心第 5 節 |
| 插入素材與剪輯台效果的樣式 | `shared/template/kit/media.css`、`kit/media.js` | 各 1 個 | build 用到時自動連；紅框、放大鏡、dip、淡入淡出 |
| 換主色工具 | `shared/template/tools/brand.mjs` | 1 支 | R9 |
| 風格規範 | `shared/style.md` | 1 份 | 字幕、節奏、字卡文字、音效、講者資料的唯一來源 |

不在素材包裡、要靠提示詞安裝的：HyperFrames CLI（`npx hyperframes`）、auto-editor、ffmpeg、Chrome（`npx hyperframes doctor` 處理）。

---

## R12. 給封裝 Skill 的人

- Skill 直接引用工作區的 `shared/template/USAGE.md`、`shared/template/USAGE-reference.md` 與 `shared/template/tools/build.mjs`，**不要把模板複製進 Skill**。理由：使用者換過的主色與背景圖都在工作區的 `shared/template/`，複製一份就不會跟著變。
- 依賴：Node.js ≥ 22、ffmpeg／ffprobe（在 PATH 裡）、`npx hyperframes`。`build.mjs` 本身零依賴，不用 `npm install`。
- build 用 `--project projects/<專案>`（或只寫名稱）指定專案；沒寫時，目前資料夾在某個專案裡就用它，`projects/` 只有一個專案就用那個，否則報錯並列出現有專案。路徑旗標（相對目前資料夾，會蓋過專案預設）：`--plan`、`--srt`、`--video`、`--out`、`--sfx`。預設是專案裡的 `work/hyperframes/plan.json`、`work/rough.srt`、`work/rough.mp4`、`work/hyperframes/`，音效是 `shared/sfx/`。
- 專案結構：`projects/<專案>/講稿.md`、`素材/真人錄影/`（口播主軌）、`素材/螢幕錄影/`、`素材/圖片/`（只讀）、`work/`（中間產物）、`成片/`（`final.mp4`、`測試片段/`、`驗收截圖/`；build 會先建好這三個資料夾）。
- build 結束碼：有 ✖ 錯誤時是 1，可以拿來判斷要不要往下跑。`--list --json` 印出機器可讀的情境、字卡動態、音效清單與 media 段欄位；`--check --json` 印出機器可讀的檢查報告（R2.6）。
- 素材：`node shared/template/tools/media.mjs scan|frame|main --project projects/<專案>`（核心第 5 節、AGENTS.md「剪乾淨」）。也是零依賴，只用 ffmpeg／ffprobe。

---

## R13. 測試過的版本與環境

| 項目 | 版本或做法 |
|---|---|
| HyperFrames CLI | 0.8.216（`npx hyperframes --version`）。指令和本文不一致時，以 `npx hyperframes <指令> --help` 為準 |
| Node.js | ≥ 22（實測 24.16.0） |
| 實測平台 | macOS 15.3（M1 Max）。Windows 的指令照官方參數寫，以實際執行結果為準 |

環境的坑：
- **轉逐字稿**：`npx hyperframes transcribe <影片> -d work --model small --language zh`。預設模型 `small.en` 會把中文翻成英文。逐字稿的時間碼可能漂 1 秒左右，處理見核心 4.3。
- **M1 Max＋macOS 15.3** 轉錄會出錯時，前面加環境變數：`GGML_METAL_BF16_DISABLE=1 npx hyperframes transcribe …`。
- **auto-editor**：Skill 文件和安裝的版本參數名稱可能不同，以 `auto-editor --help` 為準（實測要用 `--cut-out`、`--no-open`）。
- **`npx hyperframes doctor`**：列為選用（optional）的項目沒裝可以略過，必要項目（Chrome、ffmpeg）要裝好。
- **`preview --no-open`**：在非互動 shell 會自己轉到背景，印出網址就結束（核心 2.6）。
- **Studio 的 `data-hf-id`**：Studio 開過之後，產生檔的每個元素會多一個 `data-hf-id` 屬性，不算手改（核心 2.6）。
- **底片重新編碼**：build 第一次會把 `work/rough.mp4` 轉成 `work/hyperframes/assets/rough.mp4`（30fps、每秒一個關鍵幀、聲音轉 AAC），之後只有 `work/rough.mp4` 比較新時才重轉。build 會印出兩者長度差，超過 0.1 秒會警告字幕可能對不準。
- **字卡動態 14／27／31／38** 第一次 render 需要網路（R3）。
- `check`／`snapshot`／`render` 開頭印出 `Not inlining "kit/fonts/NotoSansTC-VF.woff2" (5.2 MB exceeds the 2 MB inline limit)` 是正常的，字型仍會從檔案載入，不用處理。
- **render 很慢或被中斷**：改用背景執行（核心 2.7）。記憶體 ≤ 8GB 的電腦 HyperFrames 會自動改用單一 worker，會更慢。

---

## R14. 改模板或新增情境（使用者明確要求時）

這一集只是想換個樣子，先用 `css` 移位（R4.6）或第二層 custom（R7），不要改模板。改模板是 `shared/` 唯讀的例外，要先徵得使用者同意。

**情境**：改 `shared/template/scenes/<NN-key>/template.html` 的 `<!-- @style -->`、`<!-- @body -->`、`<!-- @timeline -->` 三段，以及旁邊 `scene.json` 的 slots、beats、lists、rules、sfx、sample。`scene.json` 的 `sfx` 區塊長這樣。

```json
"sfx": { "main": { "sound": "pop", "at": "in + 0.1" },
         "extra": [ { "sound": "tick", "at": "items[1:]" }, { "sound": "ding", "at": "aAt", "volume": 0.8 } ] }
```

- `main.sound` 可寫字串，或 `{ "default": "ding", "warn": "alert", "good": "success" }` 依 tone 挑；`extra[].volume` 是該音效在 `kit/sfx.json` 預設音量的倍數（例：09 的 ding＝0.45×0.8）。
- `at` 可寫：`start`、`end`、beat 名（`in`、`aAt`）、`清單名[i]`（第 i 項，例 `cards[0]`）、`清單名[i:]`（第 i 項起全部，例 `items[1:]`），後面可接 `± 秒數`（例 `in + 0.1`、`start - 0.15`）。

**字卡動態**：改 `shared/template/fx/effects/fx-NN-*.html` 與 `fx/catalog.json`。`fx/renders/` 的預覽影片不會跟著變。

**預覽與畫廊**

- `node shared/template/tools/build.mjs --gallery --only <key>` 重產該情境的預覽。`--only` 不會更新 `preview/sfx-data.js`，改了音效要跑不帶 `--only` 的版本。
- 新增情境要在 `shared/template/index.html` 手動加一張卡。

改完一定跑一次 `--check`＋snapshot。
