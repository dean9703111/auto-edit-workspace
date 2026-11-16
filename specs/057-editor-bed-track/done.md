# 057 完成紀錄：剪輯台的背景音樂軌與音量滑桿

分支 `057-editor-bed-track`，沒有 commit。

## 改了哪些檔

| 檔 | 改了什麼 |
|---|---|
| `shared/template/tools/lib/music.mjs` | 新增 `bedDucks`（講話時壓低的區間）、`bedJson`（`--check --json` 的 `bed`）、`writeBedInfo`／`readBedInfo`（`work/hyperframes/.cache/bed.json`）、`BED.liftGap` |
| `shared/template/tools/build.mjs` | `--check --json` 加 `bed`（放在 `outro` 後面，`errorJson` 也加 `bed: null`）。完整 build 寫 `.cache/bed.json`，這次沒配底樂就刪掉 |
| `shared/template/tools/editor.mjs` | `/api/state` 加 `bed`（`{ music, off, volume, built }`）。`/api/waveform?src=bed` 回底樂 wav 的波形（每秒 25 格，快取在 `.editor/bed-waveform.json`）。存檔時把工作區預設的底樂交給 `applySave` |
| `shared/template/tools/editor/server/write.mjs` | `sanitizeBed`、`LIMITS.bedVolume`；`applySave` 收 `body.bed`，只改 plan.json 的 `bed` 那一塊 |
| `shared/template/tools/editor/model.mjs` | `bedLane`（這一軌畫什麼）、`bedHasMusic`、`bedLiveDb`（即時試聽要補幾 dB）、`bedFadeAt` |
| `shared/template/tools/editor/timeline.js` | 第 9 軌「背景音樂」（在「音效」下面），內容見下面的「時間軸」一節 |
| `shared/template/tools/editor/app.js` | 「整支 → 聲音」加背景音樂滑桿（在素材原聲下面）。`bedVol` 接上復原、未存提示、存檔、保留狀態。點這一軌會跳到滑桿；這一軌也有提示文字和右鍵選單 |
| `shared/template/tools/editor/preview.js` | 快速試聽播上一次 build 混好的底樂 wav，增益照 `bedLiveDb` |
| `shared/template/tools/editor/editor.css` | 滑桿的灰掉樣式（`.off`）、點到時亮起來（`.hot`、`.flash`） |
| `shared/template/tools/editor/index.html` | 操作說明加「背景音樂」一行 |
| `shared/template/EDITOR.md` | 「剪輯台會寫哪些欄位」加 `bed.volume`；版面圖、快速試聽那一列補上背景音樂 |
| `.agents/skills/auto-edit-style/references/music.md` | 「底樂大聲一點／小聲一點」補一句：剪輯台「整支 → 聲音 → 背景音樂」也能調 |
| `specs/contracts/check-json.md` | 補 `bed` 欄位、範例、版本紀錄（只加欄位，不升 schema） |
| `dev/tests/build.test.mjs` | 兩處 `--check --json` 的欄位清單加 `bed` |
| `dev/tests/editor-bed.test.mjs` | 新的測試檔，共 6 個測試 |

## 資料怎麼流

- **時間軸位置**：
  - `build --check --json` 的 `bed` 經 `/api/report` 送到頁面，再由 `bedLane` 決定 `app.bedView` 畫什麼。
  - 鋪的範圍、淡入淡出秒數都和 build 印的「底樂：…」那一行用同一個 `bedPlan` 算，剪輯台不另外算。
  - `start`／`end` 已經換成 rough.mp4 的秒數，時間軸直接用。
- **即時試聽**：
  - 完整 build 混出 wav 時，`.cache/bed.json` 記下做進去的 `volume` 和 `sfx`。
  - `/api/state` 的 `bed.built` 帶上這些值和 wav 網址，快速試聽就播這條 wav。
  - 增益只補「現在的 `bed.volume` 減掉做進去的 `volume`」，加上「現在的音效減掉做進去的 `sfx`」。重新 build 之後差是 0，不會疊兩次。
- **存檔**：
  - 拖滑桿會送 `body.bed = { volume }`，經過 `sanitizeBed` 只改 plan.json 的 `bed`。
  - 規則照 `build.mjs --set bed.volume`：
    - 範圍 −12～+12；0 就拿掉 `volume`。
    - 沒寫 `bed`、用工作區預設的底樂時，曲名一起寫。
    - 沒有底樂、`bed.music` 是 null 時擋下。
    - 超出範圍、不是數字、多寫欄位時回 400，plan.json 不動。

## 時間軸「背景音樂」軌

- 從鋪的起點畫到終點，條上寫「♪ 曲名」；音量不是 0 dB 時加上 dB 數。
- 藍色音量線頭尾是淡入、淡出的斜坡。
- 講話時壓低的區間填得比較低、比較暗。這一集「整段固定音量」時不畫壓低，名字後面加「整段固定音量」。
- 疊上底樂 wav 的波形，跟著滑桿的即時音量變大變小。
- 片尾卡那幾秒在 rough.mp4 外面，條的尾巴寫「片尾再 N 秒 →」。
- 沒有底樂寫「沒有背景音樂」；`bed.music=none` 寫「這一集不配」；檢查報告還沒好時寫「曲名（位置等檢查報告）」。
- 點這一軌：右側切到屬性、打開「聲音」、捲到背景音樂滑桿，滑桿閃一下、加框。
- 不能拖曳、不能換曲。

## 測試結果

- `node --test --test-timeout=300000 dev/tests/editor-*.test.mjs dev/tests/docs.test.mjs dev/tests/build.test.mjs`：196 個，195 個通過，1 個失敗。
  - 失敗的是 `editor-framing` 的「構圖下方直接預覽動畫」，原因是整套一起跑時負載高，`waitForFunction` 等了 30 秒逾時。
  - 單獨重跑 `editor-framing.test.mjs`：8 個全過。
- `dev/tests/editor-bed.test.mjs`：6 個全過。涵蓋：
  - 有底樂、沒有底樂、`bed.music=none` 三種情況這一軌顯示什麼，另含檢查報告還沒好和整段固定音量。
  - 滑桿寫 `bed.volume`，超出範圍（13、−12.5、字串、null）不寫；0 就拿掉；沒變不寫。
  - 工作區預設的底樂時曲名一起寫；沒有底樂、這一集不配都擋下。
  - 即時試聽不會疊兩次；淡入淡出照 build 的秒數。
  - `bedJson`、`bedDucks`。
  - 服務端：`/api/state` 的 `bed`、`/api/waveform?src=bed`、`/api/save` 帶 `bed`。
- 改到 build、music，另外跑了 `032-w1b`、`032-p3d`、`032-p3e`、`feedback-round`、`music`、`speaker`：74 個，73 個通過，1 個略過。

## 瀏覽器實測

- 用暫存專案：projects/example 複製到暫存資料夾，`music.mjs add` 加一首 60 秒的測試曲，`--set bed.music`。剪輯台開在 port 4471，沒動 4409。
- 滑桿拖到 +6 dB：試聽增益 1.995。播放中底樂 wav 的時間跟著播放頭走（差 0.01 秒）。
- 播放中再拖到 −6 dB：增益馬上變成 0.501，plan.json 存成 `{ "music": "bed-test", "volume": -6 }`。
- 重新 build：`.cache/bed.json` 的 volume 變成 −6，即時補的差回到 0。
- 改成 `bed.music=none`：這一軌顯示「這一集不配」，滑桿灰掉，提示「這一集沒有背景音樂」。
- 拿掉 `bed`：這一軌顯示「沒有背景音樂」，滑桿灰掉。
- 雙擊滑桿回到 0 dB，Cmd+Z 回到 +3 dB，和其他滑桿一樣。

## 截圖

- `specs/057-editor-bed-track/shot-editor.png`：整頁。背景音樂軌有條、有曲名、有「+3 dB」、尾巴寫「片尾再 1 秒」。點了這一軌，右側「聲音」裡的背景音樂滑桿亮起來。
- `specs/057-editor-bed-track/shot-fadein.png`：放大看開頭 20 秒，淡入斜坡在 0–2 秒。
- `specs/057-editor-bed-track/shot-fadeout.png`：放大看結尾，淡出斜坡。

## 和 brief 不一樣、或沒做的

1. **即時音量只在「快速試聽」**。完成影片預覽是上一次 build 的合成檔，HyperFrames 播放器每一格都會把音量設回去，不能從外面即時改。完成影片預覽要按「更新預覽」才會用新的 `bed.volume` 重混，和人聲、音效、素材原聲三個滑桿的做法一樣。
2. **「音效」滑桿也會帶動底樂**。原本 build 的底樂增益就有加 `edit.volume.sfx`，所以即時補的差把它也算進去，免得試聽和完成影片對不上。這是既有行為，沒改。（第二輪改掉了：底樂不再跟著「音效」，見下面「第二輪」。）
3. **「講話時壓低」的區間是估的**：用字幕和 build 量到的說話停頓，停頓至少 1 秒（`BED.liftGap`）才畫成回升。真正的壓低是 wav 裡的 sidechain，沒有逐格去量。
   - 暫存專案因為停頓都不到 1 秒，整段都畫成壓低。這跟它剪乾淨之後幾乎沒有空檔相符。
4. **片尾卡那幾秒不畫**。片尾卡在 rough.mp4 外面，時間軸上沒有那段，只在條的尾巴寫「片尾再 N 秒 →」。
5. **多了一個 build 寫的檔 `work/hyperframes/.cache/bed.json`**。這是為了讓即時試聽知道 wav 裡已經混了多少 dB，比照剪輯台讀 `.cache/footage-audio.json` 的做法。
6. **`--check --json` 多了 `bed` 欄位**。契約文件 `specs/contracts/check-json.md` 已經補上，只加欄位，沒升 schema。
7. **沒有「恢復預設」按鈕**。聲音區本來就沒有這個按鈕，滑桿用雙擊回到 0、用復原（Cmd+Z）退回，和其他三個滑桿一致。

## 第二輪

作者原話：「背景音樂應該也是用原始的音量，但是我可以透過調整拉 bar 才比較合理吧？一樣要有關閉鎖定等等的比較好辨識」。新配樂的預設他選了 0 dB（原本的音量）。

### 1. 刻度改成「0 dB＝歌曲原本的音量」

**`bed.volume` 的新意思**（沿用同一個鍵）：
- 它是套在曲庫檔上的 dB。曲庫檔是 −20 LUFS，約比人聲小 6 dB。
- 範圍 −40～+6，一格 1 dB，預設 0。
- 剪輯台存 0 時拿掉這個鍵；`--set bed.volume=0` 照舊寫 0。
- 範圍只寫在 `lib/music.mjs` 的 `BED.volume`，`plan.mjs`、`plan-set.mjs`、`editor/server/write.mjs` 都讀它。
- 頁面載不了 `lib/music.mjs`，所以 `editor/model.mjs` 的 `BED_VOL` 抄了一份；測試會比對兩邊一樣。

**混音**（`plan.mjs` 的 `resolveBed`、`lib/music.mjs` 的 `renderBedClip`）：
- 沒人講話時的音量＝曲庫檔＋`bed.volume`（`gainDb = LIB_LUFS + volume − 檔案響度`；曲庫檔的 `gainDb` 就等於 `volume`）。
- 講話時照原本的 sidechain 壓下去，深度約 6 dB（`BED.lift`）。
- 有剪段的集數，整段固定在曲庫檔＋`volume`。
- `BED.db`（−20）拿掉了。`relDb` 改成沒人講話時和人聲（−14 LUFS＋人聲滑桿）差幾 dB。片尾配樂和 `OUTRO_DB` 沒動。
- **防爆音**：渲染的最後一步先 4 倍取樣，再過 `alimiter`（上限 −1.5 dBFS，有延遲補償），輸出的 true peak ≤ −1（`BED.tp`）。
  - 實測：一首尖峰頂到 −2 dBTP 的曲子加 6 dB，輸出是 −1.5 dBTP。
  - 0 dB 時響度和峰值都不變。
- 渲染快取的版本從 v1 升到 v2，舊刻度混出來的 wav 不會被沿用。

**−40＝靜音**（和人聲 −60＝靜音同一個做法）：
- build 不把底樂放進完成影片（沒有 `bgm-bed`），印「底樂：<曲名> 靜音（bed.volume −40 dB＝靜音），完成影片不放；要放回來：剪輯台背景音樂軌的 🔇，或 --set bed.volume=0」。
- `--check --json` 的 `bed` 加 `muted: true`，範圍照樣給，剪輯台照樣畫一條（暗的）。
- 靜音時 `.cache/bed.json` 不動，取消靜音後快速試聽還有上一條可以播。

**build 印的那一行**，例：
- 「底樂：bed-test 鋪 0:00–2:43，音量 −3 dB（約比人聲小 9 dB），講話時壓低 6 dB，淡入 2 秒、淡出 3 秒」。
- 0 dB 時寫「音量 0 dB（原本的音量，約比人聲小 6 dB）」。
- 有剪段時寫「整段固定音量（這一集有剪輯台的剪段）」。
- 用工作區預設的曲子時，曲名後面加「（工作區預設）」。

**`.cache/bed.json` 和即時試聽**：
- `.cache/bed.json` 加了 `v: 2`，拿掉 `sfx`。
- 沒有 `v` 的（第一輪舊刻度）讀不到，所以不會照舊刻度去補差。
- 即時試聽補的差＝現在的 `bed.volume` 減掉做進 wav 的 `volume`。重新 build 之後差是 0，不會疊兩次。暫存專案重 build 後實測差是 0。

**一起改的文件**：
- `music.md`：一次 ±3 dB、範圍 −40～+6、0＝原本的音量。
- `EDITOR.md`、`check-json.md`、剪輯台的操作說明（`index.html`）。
- brief 沒列、但內容已經不對所以順手改的：
  - `shared/style.md` 底樂那一行：原本寫「講話時比人聲小 20 dB」。
  - `music.mjs` 試聽頁的那一句：原本用 `BED.db`。

### 2. 背景音樂軌的軌頭

**先看了人聲、音效軌原本的做法**：
- **數字**：就是 `edit.volume.*`，會寫進 plan.json、影響輸出。可以上下拖（4 px 1 dB，取到 0.5）或直接打數字，−60＝靜音。
- **🔇**：把音量設成 −60，會寫進 plan.json，完成影片也沒聲。原本的值記在頁面上，再按一次就回去；重新整理之後回到 0。
- **🔒**：只在頁面上，不寫檔。
  - 會擋：時間軸上這一軌的拖曳，和右鍵選單裡的編輯項（灰掉並寫原因）。
  - 不擋：軌頭的數字、靜音、屬性面板的滑桿。

**背景音樂照同一套做**：
- **數字**：就是 `bed.volume`（−40～+6，一格 1），和「整支 → 聲音 → 背景音樂」滑桿是同一個值，兩邊同步。上下拖、打數字都會自動存。
- **🔇**：寫 −40，再按一次回到原本的值，⌘Z 也能復原。
- **🔒**：擋右鍵的「調整背景音樂音量」，因為這一軌在時間軸上沒有別的編輯。
- 右鍵選單多了「靜音這一軌」「鎖定這一軌」。
- 沒有背景音樂、或這一集寫了不配：數字和 🔇 都灰掉。

**時間軸上的樣子**：
- **靜音時**：整條變灰，不畫波形和音量填色，曲名前面加 🔇、後面寫「靜音」，和音效靜音同一個樣子；快速試聽的增益是 0。
- **音量線**：高度跟著音量（+6 是滿的，0 約八成），拖數字時條會跟著變。

### 測試結果

- `node --test --test-timeout=300000 dev/tests/editor-*.test.mjs dev/tests/docs.test.mjs dev/tests/build.test.mjs`：198 個全過。
- `music`、`032-w1b`、`032-p3d`、`032-p3e`、`feedback-round`：67 個，66 個通過，1 個略過。
  - 略過的是 p3e 的 projects/example 快照：本機輸入和快照不一樣才略過，第一輪就是這樣，和這次無關。

**新增、更新的測試**：
- `editor-bed.test.mjs`：
  - 新刻度：0、−40、+6 寫得進去；−41、+7、12、字串、null 都擋下。
  - build 印的那一行（0 dB、+3 dB、有剪段、靜音）。
  - 舊的 `.cache/bed.json`（沒有 `v`）不算。
  - 頁面和 build 的範圍一致；即時試聽的差。
- `editor-bed-ui.test.mjs`（新檔，要瀏覽器）：
  - 軌頭和人聲軌是同一組元件；數字、滑桿同步。
  - 上下拖到上限 +6；打數字超出範圍會夾回去；打 0 會拿掉這個鍵。
  - 🔇 寫 −40：試聽增益 0，檢查報告的 `muted` 是 true；再按回到 −4；復原、重做都對。
  - 🔒 不寫 plan.json；右鍵的「調整背景音樂音量」灰掉並寫原因。
  - 這一集不配時，數字和 🔇 都灰掉。
- `music.test.mjs`：
  - 新增「沒爆音」：尖峰頂到 −2 的曲子加 6 dB 時，true peak ≤ −1；0 dB 時不動。
  - 「講話時壓低」改成比整段固定音量那一版小。
- `032-w1b`：`--set bed.volume` 收 −40、6、0，擋 −41、7。
- `build.test`：
  - 7 擋下；+6 時 `relDb` 是 0。
  - −40 時 build 成功，不放 `bgm-bed`，並印出靜音那一行。
- `032-p3e` 快照：只重產了 `kitchen-*` 三個（`bed` 的 `volume`、`relDb`、`gainDb` 換成新值）。重產時 `example.json` 只有輸入 hash 變了，已經還原。

### 截圖

- `specs/057-editor-bed-track/shot-editor-2.png`：
  - 背景音樂軌的軌頭有「−3」、🔇、🔒，和上面幾軌一樣。
  - 條上寫「♪ bed-test −3 dB」，0–2 秒是淡入斜坡。
  - 點了這一軌，右邊「聲音」的背景音樂滑桿（−40～+6，−3 dB）亮起來。
- `specs/057-editor-bed-track/shot-editor-2-muted.png`：按了 🔇 之後，軌頭是 −40、喇叭變紅，條變灰並寫「🔇 ♪ bed-test 靜音」。

### 和要求不一樣、要注意的

1. **「關閉」做成 −40＝靜音**。這和人聲 −60＝靜音同一個做法，所以不用加新的鍵。−40 時 build 完全不放底樂，不是只放一條 −40 dB 的。
2. **底樂不再跟著「音效」滑桿走**。照新的公式「曲庫檔＋bed.volume」，背景音樂有自己的音量了。人聲滑桿只影響 build 那一行的「約比人聲小幾 dB」。
3. **限幅器每次都過**，不是只有調大時才過。每分鐘的音訊多花約 0.5 秒，30 分鐘的片約多 15 秒；同樣的參數有快取，不會重做。
4. **第一輪有一處誤改，這次改回來了**：字幕清單播放時自動捲動的 `scrollIntoView` 被我從 `nearest` 改成了 `center`，已經改回 `nearest`。
5. **4409 那個剪輯台沒重啟**。伺服器端的改動（`write.mjs` 的範圍、`editor.mjs`）要重啟才會生效。
   - 頁面重新整理會拿到新的 `app.js`，但它對到的還是舊的伺服器：舊伺服器的範圍是 −12～+12，超出的值（例如 🔇 的 −40）會被擋下。
   - 作者方便時要重啟一次。
6. **ppa-主宣傳片我沒動**。它的 `bed.volume: 12` 在新刻度超出範圍，改回 0 之前 build 會 ✖「bed.volume 要是 −40～+6 的 dB 數字」。
