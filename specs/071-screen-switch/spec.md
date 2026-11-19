# 071 錄影換畫面疊化＋r7 順手修的兩個工具問題

## 作者原話（minimax-ep1 修改單 r7）

- 「然後我希望螢幕錄影再切換畫面時（輸入指令切換到完成畫面）可以有轉場，視覺比較好看，全片檢查」
- s0109：「部落格可以往下一點，現在畫面平衡不好，然後連結的字太小，並且要與上方有一點間隔／然後右下的人不需要漸隱」

## 定案

### 錄影換畫面疊化（`switches`）

- 段與段之間原本就有轉場：錄影接錄影疊化 0.47 秒、錄影接動畫擦入擦出。沒有轉場的是**一段錄影裡面**畫面整個換掉的那一格，例如送出指令後換到完成畫面、按了按鈕換頁。
- build 自動找：
  - 每一格和前一格的差異分數 ≥ 0.28，而且換之前 0.5 秒內都 < 0.12。「停著」才算，捲動、播影片不算。
  - 連著幾格只算第一格，兩處至少隔 1 秒。
  - 離段頭 0.6 秒、離段尾 1.05 秒內不做。
- 做法：那一格疊上前一格（舊畫面），0.45 秒淡出並模糊到 10 px，類似剪映的「模糊」轉場。
  - 舊畫面放在 stage 裡，會跟著運鏡。
  - 放大鏡、紅框、說明卡都在它上面，不受影響。
- `"switches": false`＝這段不做。
- 門檻是用 minimax-ep1 全片 38 支錄影短片調的：
  - 18 個大變化裡，挑出 13 處換頁。
  - 手機錄影捲動的那幾格，換之前一直在動，不算。
  - 段頭那一格本來就有段落轉場，也不算。
- 第一次 build 這集多花約 35 秒，之後走快取（`assets/media/index.json`）。

### s0109 的兩個工具問題

- tape 截圖下方一行字（069 `caption`）：
  - 截圖區往下 40，到 y 130–765。
  - 膠囊放大一號：高 116、字 56、圖示圓 80。
  - 離截圖 44（紙白邊外還有 32）。
  - 膠囊下緣 925，不碰字幕帶。
- 小視窗淡出又淡入：
  - 原因：剪接點（edit.cuts）落在兩段之間，接點到下一段起點只差 0.02 秒。這一小片短於 PIP_MIN 被濾掉，兩段的小視窗沒接上，就變成淡出再淡入。
  - 修法：`pipMotion` 把下一段的片段往前接到接點，`data-media-start` 跟著往前；接點之後就是剪掉之後的畫面。

## 改了哪些檔

- `shared/template/tools/lib/ff.mjs`：`sceneScores`
- `shared/template/tools/lib/media.mjs`：
  - `SWITCH`、`pickSwitches`、`switchTimes`
  - `MEDIA_KEYS`、`switches` 檢查、`mediaParts` 的 `mxf` 與時間軸、欄位說明表
  - `CAPTION` 新尺寸、`capWidth`
- `shared/template/kit/media.css`：`.mstage .mxf`、`.mcard--cap` 放大
- `shared/template/tools/build.mjs`：`prepareMedia` 找換畫面、抽前一格、快取、印一行
- `shared/template/tools/lib/plan.mjs`：`pipMotion` 接點後的小縫
- 文件：`shared/template/USAGE.md` 媒體欄位表 `switches` 列；`specs/contracts/media.md` §2.6b 版面、§2.6c
- 測試：
  - `dev/tests/switches.test.mjs`（新）
  - `dev/tests/media.test.mjs`（caption 版面）
  - `dev/tests/edit.test.mjs`（小視窗小縫）
