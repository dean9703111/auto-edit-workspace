# 素材包使用說明：參考（給 AI 查）

流程和指令以 Skill 與工具為準；這份只管欄位、語法與查表。Skill、工具或 `USAGE.md` 寫到 `R<N>` 時才讀那一節（標題 `## R<N>` 可以直接搜尋）。

情境與字卡動態的清單（key、slots 上限、預設長度、什麼時候用、不要用在）不貼在這裡，一律跑 `node shared/template/tools/build.mjs --list`。這份只寫 `--list` 沒寫的事。工具的輸出和本文不一致時，以工具為準。

| 節 | 內容 | 什麼時候讀 |
|---|---|---|
| R2 | `--check --json` 的格式（R2.6）、圖示欄位（R2.7）、文字對時的欄位表（R2.8） | 讀機器報告、配圖示、改文字對時 |
| R3 | 字卡動態（fx） | 用到 fx 時 |
| R4 | 畫面分區、底片層、`sideShift`、`pipCrop`、`css`、直式分區 | 移位、看碰撞時 |
| R5 | 音效（build 自動處理） | 要換或拿掉音效時 |
| R6 | 密度與節奏、build 檢查哪些 | 看密度、節奏的 ⚠ 時 |
| R7 | 第二層情境動畫（custom）：檔案、版面、骨架 | 手改動畫檔時 |
| R8 | 硬規則與陷阱 | 手改動畫檔、用 `css` 移位時 |
| R9 | 換主色與背景、風格包（能力探測、生圖路由、HTML 背景圖） | 使用者要求時 |
| R13 | 測試過的版本與環境的坑 | 環境出錯時 |

---

## R2. 欄位查表

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
| `items[].sfx[]` | 主音效與附加音效：`at` 是音效檔開始播的時間，`volume` 是最終線性音量（0–3.98，已套 `sfx.json`、`sfxVolume`、`edit.volume.sfx`、淡入淡出），`db` 是同一個值換成 dB；`key` 是這一顆的 id（`edit.sfxAdjust` 用，6.1）、`base` 是剪輯台拖之前的 `at`、`len` 是音效檔多長（秒）、`dur` 是裁過之後播多久 |
| `items[]` 的 media 欄位 | `src`、`enter`、`exit`、`volume`（dB 或 `null`）、`kind`（`video`／`image`）、`pip`（這段要不要講者小視窗：照 plan.json 的 `pip` 和橫式／直式的預設算好的 `true`／`false`） |
| `edit` | 正規化後的 `edit`：cuts 排序合併、`joins` 吸附到剪接點、沒寫的欄位補預設；使用者在剪輯台自己加了音效時多一個 `sfx`（照時間排，`at` 是聽到的那一刻；一顆都沒有就沒有這個鍵），這幾顆不在 `items[].sfx[]` 裡 |
| `paths` | 工作區根目錄底下的相對路徑 |

### R2.7 圖示（圖示先行）

情境有圖示欄位就配圖示（圖示先行）。圖示的動態由模板處理，plan.json 只寫圖示名稱：容器先進場，0.15 秒後把線描出來（0.7 秒）。

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
- 挑圖示：同一個物件全集用同一個（寫進分鏡表的「本集圖示表」）。語意固定的：問句 `circle-help`、想法 `lightbulb`、正向 `check`、反向 `x`、警示 `triangle-alert`。
- 打勾（圓環＋勾）只給總結、回顧、成果這種「完成」語意；流程圖的站走過只換框色，不打勾。

### R2.8 文字對時：每個欄位改哪個時間點

卡片主文字、清單每一項、字卡動態的字，出現時間＝講到那個詞的時間（`#N@詞`），差 ≤ 0.5 秒（style.md「節奏」）。`--check` 的「文字對時」會量：差 0.6–1.5 秒 ⚠、超過 1.5 秒 ✖，訊息的 → 會寫好要改哪個欄位、寫什麼（USAGE.md 4.2）；`build.mjs --autofix`（合併、套回時自動跑）照這張表直接改，`from` 會連前一段 0 秒相接的 `to` 一起挪。這張表是「欄位 → 出現時間由誰決定」：

| 情境（scene key） | 欄位 → 出現時間由誰決定（改法寫哪裡） |
|---|---|
| 03 `side-panel` | `title` → `beats.head`；`items[i]` → `slots.items[i].at` |
| 04a `fs-list` | `title` → 段起點（`from`）；`items[i]` → `slots.items[i].at` |
| 04b `fs-compare` | `title` → `from`；`left[i]`、`right[i]` → `slots.left[i].at`、`slots.right[i].at` |
| 04c `fs-flow` | `title` → `from`；`nodes[i]` → `slots.nodes[i].at` |
| 04d `fs-table` | `title` → `from`；`rows[i]`（第一欄）→ `slots.rows[i].at` |
| 05 `two-sides` | `cards[i]` → `slots.cards[i].at` |
| 06 `concept` | `text` → `beats.in` |
| 07 `key-point` | `lead` → `from`；`key` → `beats.keyAt`（不寫＝進場後一拍；主音效跟著 `keyAt`） |
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
- `bg` 預設 `none`（透明疊在講者上）；`dark`／`light`／`accent` 是不透明整張幕（會蓋住講者，沒有子母畫面）。滿版流動字（`fx/catalog.json` 標 `"portrait": "band"` 的 14 張）橫式不寫 `bg` 時用那張卡自己的底色（catalog 的 `bg`，整張幕）：透明會縮到講者旁邊、邊被切成方框；明寫 `"none"` ⚠。顏色自動用 `kit/brand.css` 的主色，不用寫 `accent`。
- vars 的值一律寫字串：`"vars": { "label": "做了", "number": "29", "unit": "支影片" }`（fx 29 數字計數：`label` 左側、`number`、`unit` 右側單位，選填）。寫了 fx 沒有的變數（例 fx 29 的 `vars.text`），`--check` 會 ✖ 並列出可用欄位。
- **14、27、31、38** 用了另外的線上字型，第一次 render 需要網路（HyperFrames 會快取到 `~/.cache/hyperframes/fonts`），離線時避開。
- **03、12、16、33** 有非 90 度的斜邊，1× render 會有鋸齒，少用。
- 透明（`bg: none`）的字卡動態不能和下方字卡（06–11、13–15）同時出現。
- 字卡動態預設音效寫在 `fx/catalog.json` 的 `sfx` 欄（`--list` 的音效欄看得到），不要就寫 `"sfx": null`。

---

## R4. 畫面分區、底片層、`css`

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

### R4.3 哪些情境會動到底片層

全部由 build 在主時間軸處理。

| 情境 | 底片（講者）會怎樣 | 時間 |
|---|---|---|
| 03 半版側邊欄 | 整個底片往右平移 `sideShift`（預設 480），左半邊推入 960 寬的面板 | 段起點 0.7 秒推入、段尾前 0.7 秒推回；講者和面板用同一條 9 點曲線，所以同步、中間不露黑縫 |
| 04a–d 全畫面、custom `layout: "fullscreen"` | 不透明幕蓋住講者（聲音照常）；右下角出現子母畫面＝同一支影片的靜音複本，外框 `kit/pip-frame.png` | 幕、子母畫面、外框一起淡入 0.5 秒、淡出 0.5 秒；寫 `"pip": false` 就沒有子母畫面 |
| 01 章節轉場、fx `bg` 為 dark／light／accent | 不透明幕整個蓋住講者，沒有子母畫面 | 淡入淡出 0.5 秒 |
| media 段（插入螢幕錄影、圖片） | 素材整張蓋住講者（聲音照常）；橫式預設不放子母畫面（`"pip": true` 才放，同 04），直式下半是講者；只有聲音的區間不放子母畫面 | 依 `enter`／`exit`（`USAGE.md` 5.3） |
| `edit.joins` 的 `punch`（剪輯台） | 底片放大 1.08 倍（以講者框上方為中心），到下一個接點還原 | 硬切，不補間 |
| 其他（02、05–15、fx `bg: none`、custom `layout: "overlay"`） | 不動 | — |

不透明幕相接時（後一段起點 ≤ 前一段結尾＋0.1 秒）：接縫不淡出（前段停在完成態），避免每個接縫黑一下。透明卡後面接不透明幕時，透明卡停在完成態、被幕蓋過；如果它是 03，底片在幕完全蓋住後才歸位。

### R4.4 `sideShift` 怎麼定

- 目標：右移後講者在面板外（x1＋sideShift ≥ 960），而且不出畫面（x2＋sideShift ≤ 1920）。
- 算法：`sideShift = max(0, 960 − x1)`，再確認 `x2 + sideShift ≤ 1920`。
- 講者置中（例 x 640–1280）：960−640＝320，用預設 480（右緣 1760，在畫面內）。
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

## R5. 音效

### R5.2 音效

音效對準畫面事件，不放句尾。全部由 build 自動配，AI 只在要換、要拿掉、要加點擊、要配結尾配樂時寫。

**9 個音效＋1 首片尾配樂**：名稱、用途、對齊哪一格、每集上限照 `shared/style.md` 音效段；峰值、預設音量、相對人聲的大小（`targetDb`）在 `shared/template/kit/sfx.json`。`node shared/template/tools/build.mjs --list` 會印出全部。

**情境預設配對**：每個情境的預設主音效、落點、附加音效寫在各情境 `scene.json` 的 `sfx` 區塊，`build.mjs --list` 的音效欄看得到。

**字卡動態**：預設音效寫在 `fx/catalog.json` 的 `sfx` 欄（`{ "sound": 名稱, "at": 秒數 }`，沒寫 `at` 就是段起點）；`--list` 字卡動態表的音效欄看得到預設。要 `shine`、`sparkle` 就在那段寫 `"sfx"`。

**覆寫方式**（寫在 plan.json 的那一段）

- `"sfx": "ding"`：換主音效名稱，落點不變。只能寫段落音效；`bgm-cylinder-five` 是配樂，寫在第一層 `outro`。
- `"sfx": null`：這段不要主音效。
- `"sfxExtra": false`：關掉這段的附加音效（含 `clicks`），主音效不受影響。
- `"sfxVolume": -6`：這段音效（主音效＋附加音效）的音量，dB；疊在 `kit/sfx.json` 的預設音量與 `edit.volume.sfx` 上（剪輯台會寫）。
- `"clicks": ["+3.2", "#21@安裝"]`（media、custom 段）：每一項一顆 `click`。時間寫法和紅框 `marks[].at` 一樣：`"+秒數"`＝本段起點後幾秒、`"#N"`／`"#N@詞"`＝綁字幕；只寫畫面上看得到游標按下的地方（錄影用 `media.mjs frame --grid` 確認）。

**使用者自己加的音效**（plan.json 第一層 `edit.sfx`，剪輯台寫的，AI 不寫）

- `"sfx": [{ "at": 33.4, "sound": "ding", "db": -3 }]`：使用者在剪輯台的音效軌按右鍵「在這裡加音效」放的。`at` 是 `rough.mp4` 的秒數（那一刻聽到，起點照下面的公式）、`sound` 是音效名稱、`db` 是這一顆的音量（選填）。
- 不屬於任何一段：不進 3 秒間隔、每分鐘密度、每集上限的規則，也不算進「音效次數」；`--check` 另外印一行「自己加的音效：N 顆」。吃 `edit.volume.sfx` 和整支的淡入淡出，落在 `edit.cuts` 裡的不出聲。
- 這台機器沒有那顆音效（例如換了電腦、沒有他的自備音效）時 ✖：請使用者在剪輯台換一顆或移除，不要自己改名稱。

**結尾配樂**寫在 plan.json 第一層 `outro`（`USAGE.md` 3.2）；換曲、只配這一集、不配，照 `auto-edit-style` 的 `references/music.md`。

**時間規則**

- 起點＝畫面事件時間 − 音效峰值 ＋ 1 格（理由：放在句尾的音效會晚 1–3 秒，聽起來像沒對上）。
- 一張卡最多一個主音效；兩個主音效相距不到 3 秒時只留前一個，被拿掉的會出現在提醒與報告的「音效時間」欄（`（ding 已拿掉）`）。3 秒間隔只比主音效；附加音效和 `click` 不算。
- 同一段附加音效的起點相距不到 0.2 秒，丟掉後者（也會和主音效比）。
- `--check` 最後印「音效次數」（有上限的寫 `次數／上限`）與「音效密度」；超過上限、某一分鐘主音效太多會 ⚠（規則照 `shared/style.md`）。

音效只能用 `shared/sfx/` 裡的檔案，不另外下載。用 `--sfx <私人資料夾>` 時，那個資料夾要放齊 `kit/sfx.json` 的每個名稱。

---

## R6. 密度與節奏

| 規則 | 數字 | 理由 | build 會檢查？ |
|---|---|---|---|
| 密度 | 照 style.md「字卡文字」；實機操作段往稀的那端 | 整支片不留沒有畫面的空白 | — |
| 開場 | 預設照 style.md「字卡文字」（開場 30 秒不限張數）；`"rhythm": "spaced"` 時開場張數有上限（02 章節角標也算一張），照 build 印的 ⚠ 改 | — | ⚠（只在 `"rhythm": "spaced"`；預設照 style.md 不限） |
| 露臉 | 預設照 style.md「情境動畫優先」：段與段直接接上，講者露臉靠疊加版面與子母畫面小視窗；`"rhythm": "spaced"` 時兩段動畫之間要留露臉空檔（章節轉場後接的那段不算），間隔照 build 印的 ⚠ 改 | — | ⚠（只在 `"rhythm": "spaced"`；預設照 style.md 連續覆蓋） |
| 連續覆蓋 | 預設（`rhythm` 不寫）：每段講解都有畫面 | style.md「節奏」 | 報告「沒有畫面的區間」（> 1 秒）＋⚠ |
| 不閃 | 兩段之間空 0.05–1 秒時講者會閃一下，要 0 秒相接 | 同上 | ⚠ |
| 同情境 | 不連續三段同一情境；同一章裡同一情境最多三次 | 視覺疲乏 | ⚠（連續三段） |
| 一段一個 | 同一時間只放一個情境（02 章節角標除外） | 兩個強調互搶 | ⚠ |
| 字卡動態 | 一段講解最多一兩張，不和下方字卡同時出現 | 同上 | ⚠ |
| 停留 | 一般卡 2.5–4 秒以上；重點卡（07）至少 4 秒、停到這個重點講完 | 讀得完 | ✖（段長下限） |
| 新訊息停留 | 照 style.md「節奏」的完成態停留 | 讀得完 | ⚠（最後內容停得太短）；✖（完成態太短，照 build 的訊息） |
| 字數 | slots 上限照 `--list`；主句 8–14 字照 `style.md` | 版面放得下；看一眼就懂 | ✖（只檢查 `--list` 上限，8–14 字不檢查） |
| 換卡 | 兩張下方字卡相接時自動處理：前一張延到後一張起點＋0.4 秒，退場和進場同時 | 不要等上一張完全消失 | 自動 |
| 動作秒數 | 照 style.md「節奏」（模板固定） | — | 自動 |

`USAGE.md` 4.2 沒列的訊息：

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
| `work/cutpoints.json 不是合法的 JSON` | ⚠ | 照 → 跑 `media.mjs cutpoints` 重新產生；不影響 build，只是 `joins` 對不到剪接點 |

---

## R7. 第二層情境動畫（`type: "custom"`）

### R7.2 檔案與版面

1. 檔內 `data-composition-id` 要等於檔名（`x-flow`），script 要登記 `window.__timelines['x-flow']`，`<style>` 要放在 `<template>` 裡；不符合時 `--check` 會出錯。
2. 兩種版面，build 做的事不一樣：

| `layout` | 用在 | build 會做什麼 | 你要做什麼 |
|---|---|---|---|
| `"fullscreen"` | 不透明全畫面圖解 | 整段淡入淡出 0.5 秒、加子母畫面（`"pip": false` 可以拿掉）、和相鄰不透明幕接縫不淡 | 第一個子元素放滿版底 `<div class="sc-surface-fs fill"></div>`；主內容右緣 ≤ 1380（範例目前排到 1300）；內容從第 0.5 秒（淡入完）之後才開始動 |
| `"overlay"` | 透明、疊在講者上 | 只在時間到時掛上、時間到拿掉，**不幫你淡入淡出** | 自己寫進場與退場（`P.out(..., P.dur() - P.OUT)`）；不放滿版底；不能壓到 speakerBox |

- 直式：`fullscreen` 的子合成照樣用 1920×1080 寫，build 自動整張縮 0.8475 放進上半資訊窗（R4.7），內容一樣留在 x 120–1300、y 130–880；`overlay` 用 1080×1920 座標寫，文字留在文字安全區（`shared/style.md`「直式」）。
- 直式的樣子：同一支檔靠參數換，不複製成兩個檔。縮進上半的 1920×1080 子合成，直式時 root 自動多一個 `data-format="portrait"`（`P.portrait` 是 true；橫式、1080×1920 的 overlay 都沒有），用法：
  - CSS：`#x-flow[data-format="portrait"] .xflow-row { height: 84px; }`（只在直式生效）。
  - 排版屬性：任何 `data-<名>` 旁邊寫 `data-<名>-portrait`，直式時排版前換上，例 `data-layout="row" data-layout-portrait="col"`、`data-gap="xl" data-gap-portrait="md"`（root 上的也算）。
  - 有框的列（膠囊、清單列、層）直式字放大到 60 以上，audit 報 ⚠「內距不足」（門檻量整行高，框要約 2 倍字級）時：容器寫 `data-layout-allow-tight-portrait`，只在直式放寬框內上下內距，橫式照舊要內距。範例：`custom/x-stack.html`。
  - 字級：root 寫 `data-portrait-type`，`.sc-t30`–`.sc-t56` 直式換成 60（× 0.8475＝畫面上 51，聚焦壓暗縮 0.96 也還有 48）；60 以上不動。字變大後列高、圖示跟著用上面的 CSS 放大。
  - 插圖（`kit/illus.js`）裡的字：`data-text-scale-portrait="1.3"`（寫 `data-text-scale` 就橫式也放大）。
  - 換行：`P.chars` 拆成一字一格後，瀏覽器在任何字之間都能換行；直式要換行的字在 timeline 開頭、`P.chars` 之前寫 `P.wrapWords('.xflow-text')`（直式才照詞包成不斷行的 span：標點、「的了嗎」黏前一個詞，6 字以內的關鍵詞不拆；`{ lines: true }`＝`//` 斷開的每一行各自平衡，`{ colon: true }`＝第一個全形冒號後換行；橫式不動）。選擇器和 `P.chars` 一樣不要從最外層的 `#x-flow` 開始。
  - 鏡頭：直式的 `P.cam` 只推近、不帶位移（原點上緣中間），因為卡頂貼在舞台窗上緣、離講者面板只剩 30–40 px，往焦點帶會出窗；直式版面左右上下都留得出邊時，root 寫 `data-portrait-cam="free"` 照橫式推，audit 的 ⚠ `portrait-cam` 量有沒有出界。
  - 檔頭【版面】多寫一行「直式：…」（直式改了什麼、放得下幾項幾字）；直式放得比較少時，fill.json 寫 `"portraitMax": { "items": 3, "items.text": 10 }`（清單最多幾項、文字最多幾字），直式專案超過 `--check` ⚠。範例：`custom/x-checklist.html`。

3. 子合成的長度不用手填：結尾寫 `P.end()`（不帶參數），長度自動等於 plan.json 這段的長度（build 把段長帶進子合成，`P.dur()`），`to` 改了不用改檔。root 的 `data-duration` 留著、寫估計值就好，不用和段長一致；`--check` 印 ⚠「data-duration 比段長短」時照 → 改成 ≥ 段長。

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
- 動畫裡要配音效的拍點寫 `const T = P.sfx('success', '#38@兩支')`（回傳秒數，同時當這一拍的動畫時間；`P.sfx('ding', '#41', 0.2)` 晚 0.2 秒）。音效名、ref 都寫字串字面值，off 寫數字；build 會排成 `<audio>`，算進 `--check` 的音效次數與密度。不要在 plan.json 另外寫這些音效。寫成變數或 `+` 組字串、音效名不在 `kit/sfx.json` 都會 ✖；綁到段外的句子會被拿掉並 ⚠。
- 動畫照確認過的動畫分鏡一拍一拍做：每一拍一個拍點常數（`const T1 = P.at('#38@兩支')`，分鏡「音效拍點」有寫就用上一條的 `P.sfx`），「動態」欄的每個名稱用 `shared/template/BEATS.md` 語彙表「對應」欄的方法。只用 `SceneMotion` 的方法：
  - v2：進場 `P.wipe`／`P.drift`／`P.pop`／`P.grow`／`P.slide`／`P.in`；字 `P.chars`／`P.type`／`P.count`；線 `P.stroke`／`P.comet`／`P.icon`／`P.check`／`P.strike`／`P.bar`；強調 `P.sheen`／`P.marker`／`P.punch`／`P.ripple`／`P.stamp`（蓋章，對象是自己寫的 `<b class="sc-stamp">過時</b>`，和被蓋的元素放在同一層、不要放進它裡面；`{ on: '#被蓋的' }` 落地時讓它退焦）；`P.strike` 加 `{ wave: true }` 是波浪線；焦點 `P.spot`／`P.dim`／`P.rack`（換焦點：講到的那個清楚、同組其他模糊稍淡）；鏡頭 `P.cam`；微動 `P.idle`；退場 `P.wipeOut`／`P.slideOut`／`P.out`；拍點音效 `P.sfx`。參數與預設值寫在 `shared/template/kit/scene-motion.js` 開頭的「v2」那一段。
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

寫 custom 時的版面原則（模板已經照做，自己排版時要照做）：
- 圖示先行、多互動、少文字：每個概念先放圖示，畫面上的文字壓到 10 字以內的關鍵詞，完整句子交給字幕。
- 圖示和文字是同一塊（同一顆膠囊、同一列），不要做成「徽章＋旁邊另一個標籤」兩個元件；同一組清單每一條都有圖示。
- 先有節點再畫連接線；連接線兩端貼齊元件，離經過的元件至少 16px。
- 後出現的元素不能擠壓已經在畫面上的元素：最終版面先排好，預留位置。
- 並排的元素同高、同中線。
- 一個畫面 3–5 個重點，穩定停留；最後一幕至少停 1.5 秒（`P.HOLD_END`）。
- 不加講解沒講的裝飾（重複的小卡、分鏡沒寫的掃光與外圈）；光澤掃過、漣漪只用在動畫分鏡寫了的強調拍；截圖與手機畫面一律等比，不擠壓。

---

## R8. 硬規則與陷阱

`hyperframes check` 抓不到下面這些。第一層模板已經全部遵守；**寫第二層 custom、或用 `css` 移位時，自己要檢查**。

| # | 規則 | 為什麼 |
|---|---|---|
| 1 | `check` 全過不代表版面正確。有第二層情境動畫一定要跑 audit（`build.mjs --review` 會跑），再看完成態拼圖 | `check` 的版面量測只取全片均分的 9 個時間點，一個問題只在 1 個取樣點出現就降成 info、不算 issue，5–8 秒的段最多被取到一次；用 `--at` 指定時間也一樣會被降級 |
| 2 | 文字不進字幕區（y ≥ 920）；`check --caption-zone "x0=0;y0=0.852;x1=1;y1=1;severity=error"` | 情境文字壓到字幕。`--caption-zone` 預設只量片尾最後一格、而且只量文字框，片中的卡片進字幕區要靠 audit |
| 3 | 疊在實拍上（疊加版面）：硬邊錯位底板＋一層模糊 ≤ 30 px、不透明度 ≤ 0.35 的深色落影，不發光、不漸層。不透明幕上（全畫面、全幕）：光暈、柔影、漸層只能用 `var(--v2-*)` token；兩種都不寫 `box-shadow`、`filter`、`gradient` 的字面值；亮色大面積只能用在不透明幕 | 亮色塊邊緣壓縮後會浮出白暈；透明背景上的光暈看起來像髒污；用 token 才會跟著換主色與亮暗主題 |
| 4 | 座標、尺寸一律整數 px；自己畫的邊框至少 2px、alpha ≥ 0.34 | 1.5px 會被捨成 1px，半像素線發糊（audit 會報「半像素邊」⚠） |
| 5 | 字級下限：正文 ≥ 52px（`.sc-t52` 起）、標題 ≥ 72px（`.sc-wcard__bar` 標題列固定 64 例外）、標籤 ≥ 38px；空間夠就放大；放不下縮文案，不縮字。直式照 `shared/style.md`「直式」的下限（畫面上 48px） | 字太小是最常退件的原因（橫式 audit 只抓 < 30px，52／38 的下限要自己對） |
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
| 16 | 含 `<video>` 的合成一律用 `deliver.mjs`（內部是 `npx hyperframes render`）輸出，不用其他截圖式 render 工具 | 影片會凍在同一格，ffprobe 卻全部通過 |
| 17 | 第二層與 `css` 移位不能壓到 speakerBox、不能進子母畫面禁入區（全畫面時 x 1424–1888、y 581–951） | 擋臉；壓到子母畫面（audit 會報：壓到子母畫面 ✖、壓到講者 ⚠） |
| 18 | custom 的 `P.at('#N')`、`P.at('#N@詞')` 那一拍出現的字（站名、項目），要在 #N 那句講到；站名、項目在句中間或句尾就綁 `P.at('#N@詞')` | 綁句首，字會比講到早 1–3 秒出現。audit 會報 `⚠ 綁句對不上：「…」在 #M 才講到、不是 #N（…）`（數字、英文整個詞比，中文取 2–4 字；刪除線、底線、位移不算出現；找不到不報）→ 照 → 改成 `P.at('#M@詞')` |
| 19 | 用 `P.morph` 補間 `strokeDashoffset`／`strokeDasharray` 時，GSAP 當成 px 補、取整數；線條是 `pathLength="1"` 就會整段跳格 → 自己補間的弧、線改用 `pathLength="1000"`，數值放大 1000 倍（x-ring 的寫法） | 弧或線一格一格跳，不是平滑地走 |
| 20 | 帶虛線（`stroke-dasharray`）的線條放在會位移的容器裡（`P.rise`、`P.drift` 的目標），亂序 seek 截圖會和照順序的不同 → 那個容器改用 `P.in`（只淡入、不位移），線條自己用 `P.stroke` | render 的畫面和預覽、截圖對不上 |
| 21 | custom 段裡講解在講的時候，畫面不能連續 > 6 秒沒有任何動作（進場、點亮、焦點切換、描線、數字變化、位移都算動作）；在那句補一拍 `P.at('#K@詞')`，或從那句拆成兩段 | 觀眾以為畫面卡住。audit 會報 `⚠ 畫面沒有變化：<段> 在 <t1>–<t2> 畫面 <q>s 沒有變化（講解 #<N>–#<M> 在講；上限 6s）` → 照 → 補一拍或拆段。看時間軸、不看像素：點亮一個小框也算有變化（`qc.mjs observe` 的「靜止區間」看像素，兩者可能不一致） |

| audit 抓得到 | audit 抓不到（要看 snapshot） |
|---|---|
| 文字撐破有底有框的盒、被會裁切的框切掉、超出畫面、進字幕區、全畫面壓到子母畫面、壓到講者框（面積比例）、字 < 30px（直式畫面上 < 48px）、半像素邊、custom 的段長與 script 錯誤；完成態的大字被切、大字自動換行、線穿過字或卡片、沒置中、卡片空太多、同一組卡片不同寬；custom 另外量：同一個詞出現兩次、疊在講者身上的字太多、大字被講者擋太多、卡上的字比講的晚、未定位頂層、標題到內容的間距、區塊重疊（svg 線稿與連接線不算區塊）、文字框內距與行高、右側空白、nowrap 餘裕、垂直平衡、綁句失敗、綁句對不上、畫面沒有變化、分鏡對齊（storyboard.md 的動畫分鏡每一拍 ±0.5 秒內要有 `P.at`、檔裡的 `P.at` 都要在分鏡裡、動態欄只用語彙表名稱、表頭照抄）、節奏（同一秒新元素、間隔、完成態停留、最後一幕；完成態停留量的是兩個 `P.at` 綁句點之間畫面最長的一段靜止，拍前就開始的動作算到它結束為止） | 中文斷在詞中間、對比與底板、字形下伸部離框多近、進場途中的暫態（正在補間的元素不判）、字卡動態與 media 段、畫面內容有沒有對到講解的意思、情境模板的新規則（模板版面固定） |

`check` 可能出現的提醒：
- `Craft ⚠ line_unread: The film's last line "…" … is on screen 1.69 s …, under the 2.00 s a closing line needs` → 那段最後一項停太短：`to` 往後延，或把最後一項的 `at` 提早。

---

## R9. 換主色與背景

只在使用者明確要求時才改，而且只透過 `brand.mjs` 改（AGENTS.md 規則 1）。

### R9.0 風格包

一包＝`shared/template/styles/<名稱>/`：`style.json`（名稱、主色、說明）、`brand.css`、`pip-frame.png`、`pip-frame-v.png`、`bg-fs.jpg`、`bg-side.jpg`、`bg-ch.jpg`（＋暗色 `bg-*-dark.jpg`）。內建「預設」（目前的橘色）與示範「藍圖」（藍色，背景的 HTML 原始檔在 `styles/藍圖/來源/`）。

```bash
node shared/template/tools/brand.mjs list
node shared/template/tools/brand.mjs use 藍圖
node shared/template/tools/brand.mjs pack 我的品牌 --color "#1B7F4B" --bg <放 bg-*.jpg 的資料夾> --note "一句說明"
```

- 三種範圍：情境庫 `index.html` 上方的「風格」「暗色」只換預覽；plan.json 第一層 `"style": "<名稱>"` 只換這一集（build 印 `風格包：<名稱>…`）；`brand.mjs use <名稱>` 把包裡的檔複製進 `shared/template/`，之後每一集都用它。
- `use` 前會比對：`shared/template/` 目前的主色、外框、背景不屬於任何包時，先自動存成「原本-<YYYYMMDD>」再換（`--force`＝不存，直接蓋掉）。
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

不要只手改 `brand.css` 的 `--brand` 一行（理由：`--brand-ink`、`--brand-text` 不會跟著算，深色主色會看不清楚；子母畫面外框也不會換色）。

### R9.2 背景圖

- 每種版面一張，檔名固定：`shared/template/bg-fs.jpg`（1920×1080，全畫面；插入素材四周一律黑底）、`bg-side.jpg`（960×1080，側邊欄面板）、`bg-ch.jpg`（1920×1080，章節轉場）。哪張沒有就用 `shared/template/bg.jpg`（舊的單張寫法，側邊欄取它的左半）；都沒有就是主題底色與底紋。
- 留空的地方：全畫面主卡 x 120–1380、y 150–862，子母畫面 x 1424–1888、y 581–951，字幕帶 y ≥ 920；側邊欄文字區 x 0–816、y 86–864（左 85%、y 8–80%）；章節幕章名卡 x 160–1760、y 260–870（建議初值）。裝飾放在這些區域以外。`brand.mjs bg` 用同一組數字疊框、檢查。
- 影響範圍：01 章節轉場、04 全畫面家族、03 側邊欄面板（取圖的左半）。
- 直式：沿用這三張橫式圖（取中間），不用另做直式背景。
- 放好後重跑 build。拿掉背景就刪掉那張 jpg 再重跑 build。

### R9.3 能力探測與生圖路由

使用者要「生成背景圖」、沒有給圖時才走這一節；有給圖就直接用 ffmpeg 縮放裁切成上面三種尺寸。

**探測**：`node shared/template/tools/caps.mjs`（只檢查，不安裝、不登入、不下載）。它印一張「能力｜結果｜依據」表，最後印「這次生圖走：<路線>」。工具不能用時，手動逐項跑：

| 探測什麼 | Mac | Windows（PowerShell） | 算「可用」 |
|---|---|---|---|
| 模型本身能不能出圖 | 看這次 session 的工具清單 | 同左 | 清單裡有明確的圖片生成工具 |
| Codex CLI | `command -v codex && codex login status` | `Get-Command codex -ErrorAction SilentlyContinue; codex login status` | 指令存在且已登入 |
| MiniMax CLI | `command -v mmx && mmx auth status` | `Get-Command mmx -ErrorAction SilentlyContinue; mmx auth status` | 指令存在且已登入 |
| Antigravity CLI | `command -v agy && agy --version` | `Get-Command agy -ErrorAction SilentlyContinue; agy --version` | 指令存在、印出版本號（登入狀態查不到） |
| HTML 截圖 | `npx --no -- hyperframes browser path` | 同左 | 印出存在的 chrome-headless-shell 路徑 |
| 縮放裁切 | `ffprobe -version` | 同左 | 有版本號 |

**路由**：每個 Agent 走哪條路記在 `shared/setting.json` 的 `image`，沒寫的用下表的預設；`caps.mjs` 照它和這台能用的工具印「這次生圖走」。設定的那條不能用（沒裝、沒登入）就自動退到 HTML，HTML 也不行就只換主色、保留目前的背景；沒裝的不裝、沒登入的不幫使用者登入。

| Agent | 預設 |
|---|---|
| Claude Code | HTML／CSS／SVG → `brand.mjs bg` 截圖 |
| Codex | 自己的生圖工具 |
| MiniMax Code | `mmx image generate` |
| Antigravity | 自己的生圖工具 |
| 其他 | 工具清單裡的生圖工具（沒有就 HTML） |

- 換路線（使用者說了才換）：`node shared/template/tools/brand.mjs image <html｜native｜codex｜antigravity｜mmx>`；回到預設 `node shared/template/tools/brand.mjs image off`；看現在的設定 `node shared/template/tools/brand.mjs image`。Claude Code、Codex 工具自己認得出來，其他 Agent 加 `--agent minimax｜antigravity｜other`。
- 要求精準留空、幾何線稿、和主色完全一致：直接走 HTML 路線。
- HTML 路線：照 R9.4（`brand.mjs bg`，`fs`、`side`、`ch` 各跑一次）；輸出 `bg-<種類>.jpg`、疊上留空區框的 `zones-<種類>.jpg`，三張都在時產生並排的 `preview.jpg`。
- 每條路的完整指令（Mac／Windows）在 `.agents/skills/auto-edit-style/references/image-routing.md`；有子代理工具就每張圖一個工人同時生成（同一資料夾的 `bg-worker.md`）。
- 一律先存在暫存資料夾：尺寸（`ffprobe -v error -show_entries stream=width,height -of csv=p=0 <檔>`）要是 1920×1080、960×1080、1920×1080；留空區（R9.2）沒有裝飾；三張並排圖給使用者看（停點 ⑥），同意後才複製進 `shared/template/`。
- 同一條路重做 2 次還不行就改走 HTML；HTML 也不行就只換主色，告訴使用者原因。

### R9.4 用 HTML 畫背景圖（沒有生圖工具時）

1. 在暫存資料夾寫 `bg-fs.html`、`bg-side.html`、`bg-ch.html`。版面用絕對定位畫在 `html, body` 上，主色用 `var(--brand)`（`--brand-ink`、`--brand-text` 也能用），字型用 `var(--font-cjk)`；`brand.mjs bg` 截圖前會自動接上 `kit/brand.css`、`kit/fonts.css`（其他主題變數不會接，要用的顏色直接寫色碼）。不要另外連 CDN 或網路圖片（會 ⚠）。
2. 每張跑一次：

       node shared/template/tools/brand.mjs bg --html <暫存>/bg-fs.html --kind fs --out <暫存>

   產生 `bg-fs.jpg`（成品）、`zones-fs.jpg`（疊上留空區框：紅＝主卡或文字區、藍＝子母畫面、黃＝字幕帶）、`raw-fs.png`（原始截圖）。
3. 看指令印的那一行：`✓ 留空區乾淨` 就好；`⚠ 紅框（全畫面主卡）裡有 2.3% 的像素是裝飾` 就把裝飾移到框外，重跑。
4. 三張都做完會多一張 `preview.jpg`（上排原圖、下排疊框版，1600×720）。把它給使用者看，**停下來等同意**（停點 ⑥）；同意後照 `auto-edit-style` 步驟 4 存成風格包、套用（`brand.mjs pack`、`brand.mjs use`），再重跑 build；不要照指令最後印的 `cp`／`Copy-Item` 直接複製。
5. `--out` 不能是 `shared/template/` 裡面（✖）：背景圖一定要經過使用者同意才放進模板。

---

## R13. 測試過的版本與環境

| 項目 | 版本或做法 |
|---|---|
| HyperFrames CLI | 版本釘在工作區根目錄的 `package.json`（`npm install` 安裝；build 與 `caps.mjs` 會印實際版本，不同時 ⚠）。從 `projects/<專案>/work/hyperframes` 執行 `npx hyperframes` 也是用根目錄這一版。指令和本文不一致時，以 `npx hyperframes <指令> --help` 為準 |
| Node.js | ≥ 22（實測 24.16.0） |
| 實測平台 | macOS 15.3（M1 Max）。Windows 的指令照官方參數寫，以實際執行結果為準 |

環境的坑：
- render 報 `VIDEO_SOURCE_UNRENDERABLE`（`assets/rough.mp4` 讀不了）：底片壞了，重新編碼：`node shared/template/tools/build.mjs --project projects/<專案> --reencode`，再跑一次 `deliver.mjs`。
- **轉逐字稿**：`npx hyperframes transcribe <影片> -d work --model small --language zh`。預設模型 `small.en` 會把中文翻成英文。逐字稿的時間碼可能漂 1 秒左右。
- **M1 Max＋macOS 15.3** 轉錄會出錯時，前面加環境變數：`GGML_METAL_BF16_DISABLE=1 npx hyperframes transcribe …`。
- **auto-editor**：Skill 文件和安裝的版本參數名稱可能不同，以 `auto-editor --help` 為準（29.3.1 要用 `--cut-out`、`--add-in`、`--no-open`；每一段寫一次旗標，同一個旗標後面接兩段會失敗）。
- **`npx hyperframes doctor`**：列為選用（optional）的項目沒裝可以略過，必要項目（Chrome、ffmpeg）要裝好。
- **`preview --no-open`**：在非互動 shell 會自己轉到背景，印出網址就結束。
- **底片重新編碼**：build 第一次會把 `work/rough.mp4` 轉成 `work/hyperframes/assets/rough.mp4`（30fps、每秒一個關鍵影格、聲音轉 AAC），之後只有 `work/rough.mp4` 比較新時才重轉。build 會印出兩者長度差，超過 0.1 秒會警告字幕可能對不準。
- **字卡動態 14／27／31／38** 第一次 render 需要網路（R3）。
- `check`／`snapshot`／`render` 開頭印出 `Not inlining "kit/fonts/NotoSansTC-VF.woff2" (5.2 MB exceeds the 2 MB inline limit)` 是正常的，字型仍會從檔案載入，不用處理。
- **render 很慢**：記憶體 ≤ 8GB 的電腦 HyperFrames 會自動改用單一 worker，會更慢。
