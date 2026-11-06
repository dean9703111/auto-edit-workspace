# 契約：plan.json 欄位總表（plan-fields）

- **擁有者**：002 pipeline-timing（`tools/lib/plan.mjs` 的 `TOP_KEYS`、`KEYS`）。各欄位的**內容 schema** 由右欄「定義在」的契約負責；本檔只定「有哪些鍵、誰寫、誰讀」。
- **照它做**：001（USAGE.md 3.2／3.3、R2、R7 的欄位表）、003（custom 範例）、004（`MEDIA_KEYS`）、005（`outro`、`clicks`）、006（剪輯台存檔時保留不認得的鍵）。
- **版本**：2026-10-31。不認得的鍵 → ✖「沒有這個欄位（可用：…）」（現行規則，`plan.mjs` 的 `TOP_KEYS`／`KEYS` 檢查），所以新增欄位一定要先改這張表。
- **出處**：`lib/plan.mjs:25-31`（現行）、`USAGE.md:205-230`（現行文件）、`contracts/look.md` §2.2、`contracts/sfx.md` §5–§6、`contracts/media.md` §2、spec FR-015、FR-052、FR-061、FR-062。

## 1. 第一層（`TOP_KEYS`，順序就是文件與剪輯台存檔的順序）

| 鍵 | 必填 | 值 | 預設 | 意思 | 誰寫 | 定義在 | 狀態 |
|---|---|---|---|---|---|---|---|
| `version` | ✓ | `1` | — | 固定 | AI | 本檔 | 現行 |
| `format` | | `"landscape"`／`"portrait"` | `"landscape"` | 版式：`portrait`＝1080×1920 直式短影片（上下分割、角標左上、字幕每則 10 字；幾何見 `contracts/canvas.md`）。橫式不寫；其他值 ✖ `format 只能是 "landscape" 或 "portrait"`；和開工決策表「版式」列不同、或和主軌方向不合 → `--check` ✖ | AI（開工決策表「版式」是直式時） | `contracts/canvas.md` §3 | **新（002，009 FR-002）** |
| `frame` | | `[x, y, w, h]` | 不裁切 | 構圖裁切（畫布座標：橫式 1920×1080、16:9；直式 1080×1920、9:16） | AI（使用者在構圖預覽選倍率後） | USAGE 2.2 第 0 步 | 現行 |
| `speakerBox` | 強烈建議 | `[x1, y1, x2, y2]` | — | 講者框（有 `frame` 時是裁切後的座標） | AI | USAGE 2.2 | 現行 |
| `sideShift` | | 0–960（px） | 480 | 03 側邊欄時講者右移多少（直式沒有 03，寫了 ⚠ 沒作用） | AI | R4 | 現行 |
| `pipCrop` | | `"auto"`／`[x, y, w, h]` | `"auto"` | 子母畫面裁切哪一塊（也是 PiP 飛入的起始框，spec FR-023）。直式＝講者面板（1080×1020）裁哪一塊，寬高比 1080:1020，`"auto"` 讓頭頂落在面板頂端下 40 px（009 FR-040） | AI | R4 | 現行 |
| `avoid` | | 情境 key 陣列 | `[]` | 使用者說不要用的情境 | AI | USAGE 3.2 | 現行 |
| `rhythm` | | `"continuous"`／`"spaced"` | `"continuous"` | 卡片節奏：`continuous`＝從頭到尾每段講解都有畫面（style.md「連續覆蓋」），報「沒有畫面的區間」與「講者會閃一下」；`spaced`＝要留露臉空檔，改報「開場前 30 秒最多一張」「露臉 < 3 s」 | AI（使用者明說要留空檔時才寫 `spaced`） | spec FR-015–FR-016 | **新（002）** |
| `outro` | | 物件（§1.1） | 不配樂 | 結尾配樂 | AI（使用者要片尾配樂時） | `contracts/sfx.md` §6 | **新（002＋005）** |
| `chapterBadge` | | `true`／`false` | `true` | 章節角標常駐右上角：章節起點（01 結束，或沒有 01 時的獨立 02 段起點）到下一章／outro；子母畫面、全幕時淡出。`false`＝關掉（回到 02 段只顯示那幾秒、`chtag` 附件照舊） | AI（使用者說不要角標時才寫 `false`） | `contracts/check-json.md` §2.5 | **新（002 round 2，F1）** |
| `check` | | `{ "textSync": false }` | 不寫＝全部檢查 | 只給示意／預覽用的 plan 關掉 `--check` 的規則；目前只有 `textSync`（「文字對時」）。正式 `work/hyperframes/plan.json` 寫了 build 會 ⚠；格式錯 ✖ | 工具（004 `qc.mjs framing --cards` 的示意 plan）；AI 不寫 | `contracts/check-json.md` §2.6 | **新（002 round 2b）** |
| `look` | | `false`／`{ "color", "slim" }` | 用 `kit/look.json` | 講者調光與瘦臉 | 剪輯台（AI 只在使用者明說時寫） | `contracts/look.md` §2.2 | **新（006）** |
| `theme` | | `"light"`／`"dark"` | `"light"` | 主題（`specs/010-motion-v2/design-system.md` §10）：`dark`＝build 改用 `shared/template/bg-{fs,side,ch}-dark.jpg`（缺哪張就退回亮色那張並 ⚠），主合成、測試片段與 build 產生的每個子合成（情境、字卡動態、字幕）的 `<html>` 加 `data-theme="dark"`；配色由 `kit/scene.css` 的 `:root[data-theme="dark"]` 換 token。情境動畫 `x-*.html` 不是 build 產生的，跟著主合成走（同一份 document）。其他值 ✖ | 剪輯台（006 的亮／暗切換）；AI 只在使用者明說時寫 | `contracts/check-json.md` §2 `theme` | **新（002 第二段 A）** |
| `edit` | | 物件（§1.2） | 全部 0／空 | 剪輯台的裁剪、淡入淡出、音量、轉場 | 剪輯台（AI 不主動寫） | `lib/edit.mjs`、EDITOR.md | 現行 |
| `scenes` | ✓ | 陣列 | — | 每一段，依時間順序 | AI；剪輯台改部分欄位（§3） | 本檔 §2 | 現行 |

`TOP_KEYS` 改成：`['version', 'format', 'frame', 'speakerBox', 'sideShift', 'pipCrop', 'avoid', 'rhythm', 'outro', 'chapterBadge', 'check', 'look', 'theme', 'edit', 'scenes']`。

### 1.1 `outro`

```json
"outro": { "from": "#187", "music": "bgm-outro", "volume": 0, "fadeOut": 1.85 }
```

| 鍵 | 必填 | 值 | 預設 | 意思 |
|---|---|---|---|---|
| `from` | ✓ | `"#N"`／`"#N@詞"` | — | 起播句（結語金句講完後、開始收尾那一句的起點） |
| `music` | | `kit/sfx.json` 裡 `kind: "bgm"` 的名稱，或 `null` | `"bgm-outro"` | `null`＝這集不配 |
| `volume` | | dB，−20～+6 | 0 | 這集配樂再調多少（也會乘 `edit.volume.sfx`） |
| `fadeOut` | | 秒，0–10 | `kit/sfx.json` 那顆的 `fadeOut`（`bgm-outro` 2.0） | 淡出長度；實際＝`min(max(fadeOut, edit.fadeOut), 播放長度 ÷ 3)`（`contracts/sfx.md` §6.2） |

`fadeOut` 是本線加的選填欄位（主代理派工的範例 1.85＝01 §2.8 剪映講者畫面與聲音淡出 1.851 s），**待 005 在 `contracts/sfx.md` §6.1 確認**；005 不要的話這一列拿掉、其他不變。

### 1.2 `edit`（`EDIT_KEYS`，`lib/edit.mjs:14`）

| 鍵 | 值 | 意思 | 狀態 |
|---|---|---|---|
| `cuts` | `[[起, 迄]]`（rough.mp4 秒數） | 剪掉的範圍 | 現行 |
| `fadeIn`、`fadeOut` | 秒 | 整支的淡入淡出 | 現行 |
| `volume` | `{ voice, sfx, media }`（dB） | 三軌音量 | 現行 |
| `gains` | `[{ from, to, db }]` | 局部音量 | 現行 |
| `joins` | `[{ at, type, dur }]` | 剪接點轉場 | 現行 |
| `pads` | `[{ at, dur }]`（rough.mp4 秒數、秒） | 在 `at` 插入 `dur` 秒靜音＋定格（給原片沒有停頓的章節用） | **保留名稱，P2，這一輪不接受**（寫了照現行 ✖ 沒有這個欄位；spec FR-010） |

## 2. 每一段（`KEYS[type]`；`type` 不寫＝`"scene"`）

共通：`id`（英數字或底線、不能有 `-`、全檔唯一）、`type`、`note`（給人看，build 不讀）。

| 鍵 | scene | fx | custom | media | 意思 | 定義在 | 狀態 |
|---|---|---|---|---|---|---|---|
| `scene` | ✓ | | | | 情境 key | `--list` | 現行 |
| `fx` | | ✓ | | | 字卡動態名稱 | R3 | 現行 |
| `src` | | | ✓ | ✓ | custom：`compositions/x-*.html`；media：素材檔名 | R7／`contracts/media.md` | 現行 |
| `layout` | | | ✓ | | `"overlay"`／`"fullscreen"` | R7 | 現行 |
| `from`、`to`、`duration` | ✓ | ✓ | ✓ | ✓ | 時間（`time.mjs` 文法） | USAGE 3.4 | 現行 |
| `at` | ✓（只有 01） | | | | 章節綁句 | USAGE 3.3 | 現行 |
| `anchor` | ✓ | ✓ | ✓ | ✓ | 起點那句的一小段原文 | USAGE 3.3 | 現行 |
| `slots` | ✓ | | | | 卡片文字 | `--list` | 現行 |
| `beats` | ✓ | | | | 動畫節拍覆寫 | R2 | 現行 |
| `tone` | ✓ | | | | `"warn"`／`"good"` | USAGE 3.3 | 現行 |
| `css` | ✓ | | | | 只改位置的 CSS | R4 | 現行 |
| `chtag` | ✓ | | | | 章節角標附件。round 2 起角標自動常駐，**不用寫**（寫了 ⚠，只有 `"chapterBadge": false` 時才畫附件） | R2 | 現行（相容） |
| `bg`、`vars` | | ✓ | | | 字卡動態底色與變數 | R3 | 現行 |
| `pip` | ✓ | | ✓ | ✓ | 子母畫面開關 | R4 | 現行 |
| `sfx` | ✓ | ✓ | ✓ | ✓ | 主音效名稱（只能是 `kind: "sfx"`）或 `null` | `contracts/sfx.md` §4.1 | 現行（限制是新的） |
| `sfxExtra` | ✓ | ✓ | ✓ | | `false`＝關附加音效（含 `clicks`） | `contracts/sfx.md` §5 | 現行 |
| `sfxVolume` | ✓ | ✓ | ✓ | ✓ | 這段音效 dB | USAGE 3.3 | 現行 |
| `clicks` | | | ✓ | ✓ | 游標按下的時間陣列（`"+秒"`、`"#N"`、`"#N@詞"`）→ `click` 附加音效 | `contracts/sfx.md` §5 | **新（custom：002；media：004）** |
| `in`、`speed`、`fit`、`volume`、`enter`、`exit`、`kenburns`、`moves`、`marks`、`lens` | | | | ✓ | media 的素材與運鏡 | `contracts/media.md` §2 | 現行 |
| `callouts`、`spot`、`steps`、`arrows`；`marks[].path` | | | | ✓ | media 的標註 | `contracts/media.md` §2.3–§2.7 | **新（004）** |

最終清單（實作直接照抄）：

```js
const KEYS = {
  scene:  ['id', 'type', 'scene', 'from', 'to', 'duration', 'at', 'anchor', 'slots', 'beats', 'tone', 'sfx', 'sfxExtra', 'css', 'chtag', 'pip', 'sfxVolume', 'note'],          // 不變
  fx:     ['id', 'type', 'fx', 'from', 'to', 'duration', 'anchor', 'bg', 'vars', 'sfx', 'sfxExtra', 'sfxVolume', 'note'],                                                   // 不變
  custom: ['id', 'type', 'src', 'layout', 'from', 'to', 'duration', 'anchor', 'sfx', 'sfxExtra', 'pip', 'sfxVolume', 'clicks', 'note'],                                    // 加 clicks
  media:  MEDIA_KEYS,   // 004 擁有；照 contracts/media.md §2.1 加 callouts spot steps arrows，照 contracts/sfx.md §5 加 clicks
};
```

**待 004、005 對齊**：media 段沒有 `sfxExtra`（`MEDIA_KEYS` 現行沒有），`contracts/sfx.md` §5「`"sfxExtra": false` 時 `clicks` 也一起關掉」在 media 段做不到；請 004 決定要不要把 `sfxExtra` 加進 `MEDIA_KEYS`。

## 3. 誰改哪些欄位（剪輯台與 AI 的分界，AGENTS.md「剪輯台」第 3 點）

| 欄位 | 剪輯台（006）會改 | AI 會改 |
|---|---|---|
| `edit` 全部 | ✓ | ✗（使用者明說才改） |
| media 的 `from`／`to`／`in`／`anchor`／`enter`／`exit`／`volume` | ✓ | ✓ |
| 任何段的 `sfxVolume`、`sfx: null`、`slots`／`vars` 的文字 | ✓ | ✓ |
| `look` | ✓（一律兩個都寫） | 使用者明說才改 |
| `theme` | ✓（亮＝刪掉這個鍵或寫 `"light"`） | 使用者明說才改；build 從不寫 plan.json，剪輯台存的值不會被蓋掉 |
| `rhythm`、`outro` | ✗（保留原值） | ✓ |
| media 的 `callouts`、`spot`、`steps`、`arrows`、`marks[].path`、`clicks` | ✗（保留原值，`contracts/media.md` §8-3） | ✓ |
| 其他全部 | ✗（保留原值） | ✓ |

剪輯台存檔時，不認得的鍵（第一層與段落）**原樣保留**，不丟掉（請 006 確認現行行為）。

## 4. 沒有 plan 欄位的新行為（由工具判斷，結果看 `--check --json` 的 `items[].out`）

| 行為 | 判斷規則 | spec |
|---|---|---|
| 子母畫面飛入／原地淡入／接續不動 | 起點前一格講者是不是滿版、片段長度 | FR-022–FR-025 |
| 子母畫面三層一起淡出 | 片段結束＝段落結束而且段落淡出 | FR-026 |
| 旁白段擦入／擦出 | 接縫在只有聲音的區間內、一邊是 media | FR-030–FR-032 |
| 章節置中、前後墊底 | 空檔長度、相鄰段相隔 ≤ 1.0 s | FR-006、FR-008 |
| 章節期間字幕清空 | 章節的 2.5 s | FR-007 |
| 轉場語彙（色帶擦開／收回、換卡不換景、章節擦入、講者慢推） | 前後段的不透明、相接、家族（plan.mjs `assignTransitions`）；結果在 `out.tx.in`／`out.tx.out` | design-system §5、§7 |
| 前一段是什麼 `prev`（模板與情境動畫選進場） | `fullscreen`＝前一段也是全畫面、同背景（`tx.in` 是 `swap`：換卡不換景）；`pip`＝前一段是別的不透明幕直接接上（插入素材、不透明字卡動態、章節：小視窗已在）；其他＝`speaker`（前面露講者：色帶擦開，卡從小視窗長出 `P.grow`）。build 寫在三個地方：每個 host 的 `data-prev`、情境子合成 root 的 `data-prev`、`window.__cues.segs[id].prev`（custom 段）；結果在 `out.tx.prev`。custom 的 `const ENTER` 預設讀它，手寫值優先 | 第二段 B（003 的 04 家族） |

不加開關欄位（憲法 VIII）；作者要例外時再開欄位，先改本表。
