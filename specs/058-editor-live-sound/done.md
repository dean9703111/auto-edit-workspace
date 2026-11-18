# 058 完成紀錄：完成影片預覽裡聲音即時生效、「更新預覽」發光

分支 `058-editor-live-sound`，沒有 commit。

## 改了哪些檔

| 檔 | 改了什麼 |
|---|---|
| `shared/template/tools/editor/live-sound.mjs`（新） | build、剪輯服務、頁面共用的純函式（不 import node）。`soundOf`：哪些欄位算聲音。`soundStrip`／`soundFingerprint`：拿掉聲音欄位之後的指紋。`liveOk`：做進去時是靜音、現在打開了就套不上。`soundKind`：播放器裡的元素 id 對到哪一種聲音、哪一段。`liveScale`：data-volume 要乘多少。放在 `editor/` 底下，舊版（沒重開的）剪輯服務也送得出這個檔 |
| `shared/template/tools/build.mjs` | `loadInputs` 多回 plan.json、rough.srt 的原文。寫完 index.html（含更新修改時間）之後寫 `work/hyperframes/.cache/sound.json`＝`{ v, index（index.html 的 mtime）, fp, sound }` |
| `shared/template/tools/lib/look.mjs` | 新增 `lookKey`：look 寫法不同、做出來一樣（`false`、沒寫、`{color:0, slim:0}`）算同一個，給指紋用 |
| `shared/template/tools/editor.mjs` | `builtInfo` 加 `soundOnly`、`sound`。`stale` 多看 rough.srt 的修改時間。存檔、重送、復原的回應也帶 `preview`，頁面不用等下一次輪詢 |
| `shared/template/tools/editor/preview.js` | `PlayerPreview`：`scanSound`（找出聲的元素、記 build 寫的 data-volume）、`applySound`（每一格改 data-volume）、`routeSound`（按播放前把有聲音的影片放進 audio group）。播放器重新載入（`ready`）時重新找 |
| `shared/template/tools/editor/app.js` | `dirtySoundOnly`、`app.soundNow`、`previewPending`、`soundLive`、`syncPreview`。`renderHeader` 決定發光；預覽旁那一行拆成 `renderModeNote`，每次重畫頂列都跟著更新。講者區的提示和小按鈕（`lookPendingWhat`／`lookPendingHtml`／`renderLookPending`，`data-act="build"`）。聲音滑桿提示改成「快速試聽、完成影片預覽都馬上聽得到」 |
| `shared/template/tools/editor/editor.css` | `button.glow`：2 秒一次的呼吸光圈（`glow-breathe`）。`prefers-reduced-motion` 時是固定光圈。`.look-pending` |
| `shared/template/tools/editor/index.html` | 操作說明：完成影片預覽、講者、背景音樂、提示卡「怎麼生效」 |
| `shared/template/EDITOR.md` | `bed.volume` 那一列、兩種預覽表。新增「聲音即時生效（058）」一節，寫欄位、做進去的值、怎麼改播放器、還是要更新的情況、輸出不受影響。常見問題加「聲音已即時套用」一列、改「有新修改」那列。使用者說明的兩種預覽、講者、更新預覽 |
| `dev/tests/editor-live-sound.test.mjs`（新） | 6 個測試 |
| `dev/tests/editor-live-sound-ui.test.mjs`（新） | 1 個測試（瀏覽器） |

## 資料怎麼流

1. **build**
   - 完整 build 寫 `.cache/sound.json`，內容如下：
     - `sound`：這次做進 index.html 的聲音欄位，也就是 `soundOf(plan)`。
     - `fp`：plan.json 拿掉聲音欄位、再加上 rough.srt 的指紋。
   - 用的是 build 開頭讀到的那一份 plan.json 和字幕，build 途中被改過也不會記錯。
   - `index` 記這一版 index.html 的修改時間。對不上就是 index.html 後來被換過，剪輯台不用它。
2. **算聲音的欄位**
   - `edit.volume` 的人聲、音效、素材原聲。
   - `edit.gains`。
   - `edit.sfx[].db`。
   - `bed.volume`。
   - 段的 `sfxVolume`。
   - media 段 `volume` 的數字。開關原聲不算，指紋裡記成 `'on'`。
3. **指紋要排除的假差異**
   - 剪輯台存檔會補齊 `edit` 的預設值（`cuts: []`、`fadeIn: 0`…），這些拿掉。
   - 沒寫 `bed`，就當成工作區預設那一首（剪輯台存背景音樂音量時會把曲名一起寫）。
   - look 照 `lookKey` 正規化。
   - 鍵照字母排序。
4. **剪輯服務**：`/api/state`、`/api/version`、存檔、復原的 `preview` 有這些欄位：
   - `stale`：plan.json、rough.srt 或構圖比 index.html 新。
   - `soundOnly`：同時滿足下面四項才是 true。
     - `stale`。
     - 指紋一樣。
     - `liveOk`。
     - 構圖沒有比 index.html 新。
   - `sound`：做進去的值。
5. **頁面判斷**：`previewPending()` 就是「還有看不到的修改」，按鈕發光。
   - 沒 build 過：算。
   - 有過期或沒存的修改，而且不只聲音：算。
   - 播放器讀不到聲音：算。
   - `liveOk(做進去的, 現在的)` 不成立：算。
   - 沒存的修改是不是只有聲音，由 `dirtySoundOnly` 比對：拿掉聲音欄位後，跟上次存檔的快照比。
6. **播放器**：每一格 `applySound`，播放、暫停都跑。
   - 對每個出聲元素，`data-volume = build 寫的值 × liveScale(...)`，值變了才寫。倍數是 1 就放回 build 原本寫的字。
   - HyperFrames runtime 每一格照 data-volume 設它自己的 GainNode，上限 3.98，也就是 +12 dB。
   - 人聲的範圍音量照「這一支現在播到 rough.mp4 第幾秒」算，用 `data-media-start` 加上播放位置。
7. **輸出**
   - `runDeliver` 第一步一定是 build，音量用 plan.json 現在的值重新混。
   - `contentFingerprint` 本來就含 plan.json 和 index.html，只改聲音也不會被當成「沒變」。這條沒改程式，加了測試鎖住。

## 測試結果

- 驗收的那幾組：`node --test --test-timeout=300000 dev/tests/editor-*.test.mjs dev/tests/docs.test.mjs dev/tests/build.test.mjs`，**205 個全過**，花 61 秒。
  - 新加的 7 個在裡面。
  - 這次 `editor-framing` 整套一起跑也過了。
- 改到 build、look，另外跑了 `deliver`、`incremental`、`look`、`look-belly`、`music`，加上兩個新檔：116 個全過，花 8.6 分鐘。
- `dev/tests/editor-live-sound.test.mjs`，6 個：
  - 哪些欄位算聲音。
  - 指紋：
    - 只改聲音（8 種）時一樣。
    - 剪段、拉平人聲、加或換音效、換曲、不配、關原聲、改字卡、瘦臉、字幕時不一樣。
    - 剪輯台補的預設值、沒寫 bed 對上工作區預設、look 的三種寫法，都算同一個。
  - 增益算法：
    - 重新 build 之後全部是 1。
    - 只補差：人聲、背景音樂、情緒點、段的音效、自己加的、素材原聲都測了。
    - 🔇：人聲、音效、原聲 −60，背景音樂 −40，乘 0。
    - 已經拿掉的那一顆音效乘 0；剛關掉的原聲乘 0。
    - 範圍音量照時間：範圍外、範圍內、範圍結尾不包含都測了。整條 +2 加範圍 −60 等於 −58，不算靜音，和 build 一樣。
    - `soundKind` 的對應，包括 `rough-tail` 不管，以及段號剛好長得像的情況。
  - `liveOk`：做進去時是靜音、現在打開了，就是 false。
  - 服務端（真的 build 一次）：
    - `sound.json` 的內容正確。
    - 只差聲音時 `[stale, soundOnly]` 是 `[true, true]`，`/api/version` 也一樣。
    - look 從 `false` 改成 `{color:0, slim:0}` 還是只差聲音。
    - 瘦臉、剪段、加音效、主題、字幕改字都變成 false；字幕改回來又是 true。
    - 存檔回應帶 `preview`。
    - 做進去時是靜音，或 index.html 被換過，都是 false。
  - 只改了聲音之後輸出：
    - `runDeliver` 用真的 build 加假的 render。第一步是 build。
    - index.html 的人聲 data-volume 從 1 變成 1.995（+6 dB），自己加的音效 −6 dB，`sound.json` 也跟著換。
    - `job.source` 不是 `same`，重新 render 了。
- `dev/tests/editor-live-sound-ui.test.mjs`，1 個（puppeteer，真的 build 加工作區的播放器）：
  - 人聲 +6：還沒存就把 `#rough` 的 data-volume 改成 1.9953，不發光；存好後旁邊寫「聲音已即時套用；輸出時會一起重新混音」。
  - 音效 −6：自己加的那一顆跟著乘。
  - 軌頭 🔇 時是 0，再按回來。
  - 按播放：人聲影片放進 `data-audio-group="editor-live"`。
  - 瘦臉：
    - 頂上的按鈕和講者區的小按鈕都是 primary 加 glow，提示寫「瘦臉還沒做進完成影片預覽：要重新處理影片底片」。
    - 動畫名稱是 `glow-breathe`；減少動態效果時動畫是 none、box-shadow 不是 none。
    - 關掉瘦臉後不發光。
  - 換主題會發光；按更新預覽，更新中不發光。
  - 更新完：
    - 播放器重新載入，`#rough` 是 build 寫的 1.995（差歸 0）。
    - 再拖人聲照樣即時，表示新的播放器也接上了。

## 瀏覽器實測

暫存專案是 `projects/example` 複製到 scratchpad 的 `058/proj`，用 `music.mjs add` 加了 `bed-test` 再 `--set bed.music`，剪輯台開在 port 4481，沒動 4409–4414。量聲音的方法是在播放器 iframe 的輸出接一個 AnalyserNode 算 RMS，每次取 16–20 個樣本的平均。

| 拖什麼（播放中） | data-volume | 量到的 RMS |
|---|---|---|
| 背景音樂 −40（只剩人聲） | `bgm-bed` 1 → 0 | −16.7 → −21.0 dBFS |
| 人聲 −60 | `rough` → 0 | −180（完全沒聲音） |
| 人聲 +6 | `rough` → 1.9953（有 `data-audio-group`，走 Web Audio） | −15.8 |
| 人聲 0 | 拿掉 data-volume | −23.5（講話本身有起伏） |
| 只開背景音樂：0／−12／−6 dB（做進去 −6） | 1.9953／0.5012／1 | −29.3／−40.2／−36.7（音樂本身有起伏） |
| 素材原聲（測試用 440 Hz 影片 `mv-m0201`，人聲、背景音樂關掉）：−6／0／−60 | 0.5012／1／0 | −27.1／−21.0／−180，差 6.1 dB |
| 自己加的音效 +6、段 x0105 的音效 −9（做進去 −3）、整條音效 −6 | `sfx-own1` 0.359 → 0.7163；`sfx-x0105-e1` 0.256 → 0.1283；`sfx-mood1` 0.367 → 0.184 | （太短，看 data-volume） |
| 範圍音量 10–20 秒 −60，從 8.5 秒播 | 10 秒前沒有 data-volume，10.3 秒起是 `0` | −13 → −34（剩背景音樂） |

- 發光：
  - 拖人聲時不發光，存好後寫「聲音已即時套用」。
  - 打開瘦臉：兩顆都發光，講者區寫「瘦臉還沒做進完成影片預覽：要重新處理影片底片，長片要十幾分鐘（第一次開瘦臉還要先偵測臉部）」。
  - 關掉瘦臉：回到只差聲音。
  - 換主題會發光；按下去更新中 `animationName` 是 none、沒有 glow。
  - 更新完 stale 是 false，新的 index.html 裡人聲是 1.122（+1 dB），即時差歸 0。
- 實測時找到、已經修好的三個問題：
  1. 沒存的修改是不是只差聲音：快照比對多比到 `bed`、`version` 兩個鍵，永遠判成「不只聲音」。
  2. 剪輯台開了瘦臉又關掉，會寫成 `look: {color:0, slim:0}`，和 build 時的 `look: false` 指紋不同，一直發光。新增 `lookKey` 正規化。
  3. 預覽旁那一行只在切模式時更新：改瘦臉時按鈕發光了，那一行還寫「聲音已即時套用」。改成每次重畫頂列都更新。

## 截圖

- `specs/058-editor-live-sound/shot-live-playing.png`：播放中改過人聲、背景音樂。「更新預覽」不發光，旁邊寫「聲音已即時套用；輸出時會一起重新混音」，主要按鈕是「輸出完成影片」。
- `specs/058-editor-live-sound/shot-sound-only.png`：存好之後只差聲音（人聲 +1 dB），不發光。
- `specs/058-editor-live-sound/shot-look-glow.png`：打開瘦臉。「更新預覽」是主色並且發光，旁邊寫「有新修改」；講者區滑桿下面有提示和發光的小按鈕。
- `specs/058-editor-live-sound/shot-glow-peak.png`、`shot-look-hint-peak.png`：停在呼吸最亮那一格，分別是頂列和講者提示的局部。

## 和 brief 不一樣、或沒做的

1. **不是自己接 GainNode，是改 data-volume。**
   - 播放器裡的音效、背景音樂和走 Web Audio 的影片，已經接在 runtime 自己的 AudioContext 上。從外面 `createMediaElementSource` 會丟 InvalidStateError（`bgm-bed`、`rough`、`sfx-mood1` 都試過）。
   - runtime 每一格照 data-volume 設它自己的增益，所以改 data-volume 就是即時的，這是公開的 HTML 屬性。
   - 有聲音的影片平常走原生播放，data-volume 到 1 就封頂。按播放前放進一個音量 1 的 audio group（HyperFrames 的 `data-audio-group`），讓它改走 Web Audio，調大才聽得到。
2. **AudioContext 被擋的退路和 brief 想的不太一樣。**
   - runtime 的 AudioContext 讀不到狀態。我的做法是：頁面還沒有使用者操作（`navigator.userActivation.hasBeenActive` 為 false）時，不把影片放進 audio group。這樣影片照樣走原生播放：調小有效，調大最多到原本的音量。
   - 實際上播放只能從點擊開始，這個情況幾乎碰不到。
   - 讀不到播放器裡的元素，或這一版預覽沒有 `sound.json`（舊工具 build 的），就退回原本的做法：發光，並在預覽旁寫「有新修改，按「更新預覽」才看得到（聲音也是：原因）」。
3. **做進去時是靜音、現在打開了，要更新預覽。** 人聲、音效、原聲是 −60，背景音樂是 −40，從 0 乘不回來。這時照樣發光，`liveOk` 判斷。
4. **主題、字幕樣式、重點字幕在完成影片預覽本來就即時**，但 brief 說「第 1 點之外的全部」都要發光，所以它們改了照樣發光。（第二輪改掉了：字幕樣式、重點字幕不發光；主題照樣發光，原因見「第二輪」）
5. **`stale` 多看 rough.srt 的修改時間。** 以前只改字幕文字（只寫 rough.srt）時，旁邊不寫「有新修改」；現在會寫，也會發光。
6. **精確度。**
   - build 把 data-volume 四捨五入到小數 3 位、夾在 3.98；即時是「四捨五入後的值 × 倍數」，差不到 0.1%。
   - 做進去的值已經夾到 +12 dB 時，往下調是從 3.98 算，重新 build 前會略偏。
   - 背景音樂 wav 的 limiter（−1.5 dBFS）是在混 wav 時做的。即時調大是線性放大，大聲的曲子在預覽裡峰值可能比輸出高一點。
7. **片尾的原始錄影 `rough-tail` 不吃人聲音量。** 這是既有的 build 行為，即時也不動它。
8. **多了 `lib/look.mjs` 的 `lookKey`。** brief 沒提，是為了「開了瘦臉又關掉」不要一直發光。
9. **提示卡「怎麼生效」的文字改了，但沒換版號。** 已經按掉的人不會再跳出來；要讓大家再看一次，就把 `HINTS.coach` 換成 v3。（第二輪換成 v3 了）
10. **講者提示的花費。** 有上次的 `slowSeconds`（上次重新處理底片花多久）就寫那個，沒有就寫「長片要十幾分鐘（第一次開瘦臉還要先偵測臉部）」。

## 第二輪

作者原話（經主代理轉達）：「主題、字幕樣式、重點字幕不要讓『更新預覽』發光」「提示卡換版號」。本意是只有「改了、但完成影片預覽看不到的」才發光。

### 1. 字幕樣式、重點字幕不發光；主題照樣發光

- **做法**：沿用第一輪「拿掉這些欄位之後的指紋」。
  - `liveStrip` 多拿掉 `captionStyle`，以及 `captionMarks` 裡整則的 `"#N"`。
  - 只標幾個字的 `"#N@詞"` 留在指紋裡，排好順序：那是 AI 寫的，`applyMarks` 不管，改了照樣要 build。
  - 頁面還沒存的修改（`dirtyLiveOnly`）也一起拿掉 `cap`、`marks`。
  - 只改了這些（或加上聲音）：不發光，不當主要按鈕，預覽旁寫通用的一句「已即時套用；輸出時會一起做進去」。
- **改名**：欄位不只聲音了，跟著改名。
  - `soundOnly` → `liveOnly`。
  - `soundStrip`／`soundFingerprint` → `liveStrip`／`liveFingerprint`。
  - `.cache/sound.json` → `.cache/live.json`。
  - `dirtySoundOnly` → `dirtyLiveOnly`。
  - 讀不到播放器時的括號改成「（不能即時套用：原因）」。
  - 第一輪寫出的 `sound.json` 不再讀，留著無害，在 `.cache` 裡，輸出指紋不算。
- **主題沒有算進去（和這次的要求不一樣）**：
  - 主題就是 app.js 那句「在完成影片預覽馬上看得到」的配色。切換時改的是播放器 iframe 的 `<html data-theme>`，只換得了卡片顏色。
  - 背景圖（`bg-fs-dark.jpg` 這些）是 build 寫死在 index.html 的 CSS（`.sc-surface-fs { background-image: url("assets/bg-fs-dark.jpg") }`）。
  - 實測：暗色 build 好之後切成亮色，卡片變白，背景還是暗色的圖（`specs/058-editor-live-sound/shot-theme-built-dark.png`、`shot-theme-live-light.png`）。不發光的話，作者會以為這就是成品。
  - 所以主題改了照樣發光，面板那句改成「卡片的顏色在完成影片預覽馬上看得到；背景圖要按「更新預覽」才會換」。
  - 要讓主題也不發光，得讓預覽即時換背景圖：剪輯服務照 build 的挑圖順序（本集風格 → 風格包 → 模板，暗色沒有圖就退回亮色）送另一張，`applyTheme` 蓋掉那幾條 CSS。這件比較大，沒做，等作者決定。
- **字卡文字照樣發光**：打字時只是近似。
- **重點字幕的例外**：上次 build 之後改過字的那幾則 `applyMarks` 不動，但改字本身就會發光，不用另外處理。

### 2. 找到並修好：字幕樣式、重點字幕在完成影片預覽原本沒有即時換

- `applyCaption`、`applyMarks` 找的是 `#captions`。
- HyperFrames 0.9.28 把子合成接進主文件時，root 的 id 換成 `data-hf-authored-id="captions"`，所以一直找不到。035、038 說的「完成影片預覽馬上換」在現在這一版其實沒作用。
- 改成兩種都找（`preview.js` 的 `CAP_ROOT`）。`kit/captions.css` 用的是 `[data-cap]` 屬性選擇器，接進主文件之後照樣吃得到。
- 不修的話，「不發光」就是騙人的，所以一起修了。

### 3. 提示卡換版號

- `HINTS.coach` 從 `coach.v2` 換成 `coach.v3`。作者按掉過的那一張，下次打開剪輯台會再跳一次，看到新的「怎麼生效」。
- 沒改 `shared/setting.json`。
- 測試、`dev/tools/docs-visuals.mjs` 裡「先當作看過了，不擋畫面」的清單跟著換成 v3；`editor-hints.test.mjs` 只是拿 `coach.v2` 當代號字串測存取，沒改。

### 改到的檔

| 檔 | 改了什麼 |
|---|---|
| `shared/template/tools/editor/live-sound.mjs` | `liveStrip` 多拿掉字幕樣式、整則的重點字幕；改名（見上） |
| `shared/template/tools/build.mjs`、`editor.mjs` | 跟著改名（`live.json`、`liveOnly`、`liveFingerprint`） |
| `shared/template/tools/editor/app.js` | `restSnap` 多拿掉 `cap`、`marks`；`dirtyLiveOnly`、`liveApplied`、預覽旁那一句；字幕樣式、重點字幕、主題的說明字；`HINTS.coach` v3 |
| `shared/template/tools/editor/preview.js` | `CAP_ROOT`：字幕 root 兩種都找 |
| `shared/template/tools/editor/index.html` | 完成影片預覽、提示卡「怎麼生效」補上字幕樣式、重點字幕 |
| `shared/template/EDITOR.md` | `theme`、`captionStyle`、`captionMarks` 三列；「聲音、字幕樣式、重點字幕即時生效（058）」一節；常見問題「已即時套用」；兩種預覽、更新預覽 |
| `dev/tests/editor-live-sound.test.mjs` | 指紋：字幕樣式、整則重點一樣；`"#N@詞"`、主題不一樣。服務端：字幕樣式＋重點字幕時 `liveOnly` 為 true |
| `dev/tests/editor-live-sound-ui.test.mjs` | 換字幕樣式、標重點字幕：播放器裡馬上換（`data-cap="outline"`、`#cg-2.cg--em`），不發光，寫「已即時套用」，plan.json 存成 `captionStyle.look: "outline"`、`captionMarks: ["#2"]`；換主題照樣發光 |
| `dev/tests/editor-*-ui.test.mjs` 等 9 個測試檔、`dev/tools/docs-visuals.mjs` | 提示卡看過的清單換成 `coach.v3` |

### 第二輪的測試結果

- `node --test --test-timeout=300000 dev/tests/editor-*.test.mjs dev/tests/docs.test.mjs dev/tests/build.test.mjs`：**205 個全過**，花 62 秒。`editor-framing` 整套一起跑也過了；兩個新測試檔包含在 `editor-*` 裡：`editor-live-sound` 6 個、`editor-live-sound-ui` 1 個。
- 4481 的暫存剪輯台已經關了，暫存資料夾留著。

## 要注意的

- **沒重開的剪輯服務（4409–4414）**：`/api/state` 沒有 `liveOnly`、`sound`，頁面就照舊（過期就發光），完成影片預覽的聲音不會即時。重新整理頁面不會壞，因為 `live-sound.mjs` 從舊服務本來就有的 `/editor/` 送。字幕樣式、重點字幕的即時換（`CAP_ROOT` 那個修正）在頁面這一側，重新整理就有。重開服務之後，第一次「更新預覽」寫出 `live.json`，才會即時、才不發光。
- 暫存專案（scratchpad `058/`：`proj/`、build 紀錄、截圖）都留著給作者刪。port 4481 的剪輯台第二輪做完已經關了。
