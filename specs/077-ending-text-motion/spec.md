# 077 片尾金句的文字動畫可以選（剪輯台的下拉選單）

## 作者原話（minimax-ep1，2026-11-21，看完片尾卡的截圖）

- 「還有最後出現書籍時，旁邊文字是否使用打字的動畫呢？如果是，這種常見的文字動畫應該要可以被選擇，以下拉選單出現」

## 現況

是打字機：片尾卡的金句一個字一個字打出來（033 照剪映的「复古打字机」做的），寫死在 `lib/ending.mjs`，沒有地方換。

## 做法

1. **五種文字動畫**（`lib/ending.mjs` 的 `ENDING_MOTIONS`，唯一的定義）：

   | id | 名稱 | 做法 |
   |---|---|---|
   | `type` | 打字機（預設） | 一個字一個字出現，和以前一模一樣 |
   | `fade` | 淡入 | 整段 0.8 秒淡入 |
   | `rise` | 逐行浮出 | 一行一行由下往上 28 px 浮出，每行 0.6 秒、間隔 0.5 秒 |
   | `wipe` | 由左擦開 | 一行一行由左往右擦開，每行 0.9 秒、間隔 0.6 秒 |
   | `none` | 直接出現 | 時間到字就在 |

   都從片尾卡的第 0.633 秒開始，最後 0.5 秒和圖一起淡出（這兩個時間沒變）。
2. **哪裡選**：
   - 剪輯台：點時間軸上的片尾卡，右邊「屬性」是片尾卡的設定，「文字動畫」下拉選單（預設那一項標「（預設）」）。選了自動存進這一集 plan.json 的 `ending.motion`；「快速試聽」的片尾卡示意馬上照新的動畫，「完成影片預覽」要更新預覽（面板會提醒上一次做進去的是哪一種）。可以復原。
   - 指令：這一集 `build.mjs --set ending.motion=<id>`；每一集的預設 `brand.mjs ending --motion <id>`（`shared/setting.json` 的 `ending.motion`）。
3. **存檔規則**（`editor/server/write.mjs` `sanitizeEnding`）：只能改 `motion`；原本的 `quote`、`subscribe` 照留；和工作區預設一樣的不寫，`ending` 空了整個拿掉；這一集 `"ending": false` 時擋下。只動 plan.json 的 `ending` 那一個鍵。
4. **資料**：檢查報告的 `ending` 加 `motion`；`/api/state` 的 `end` 加 `motions`（選項）、`motionDefault`、`motionBuilt`；`.cache/ending.json` 記做進去的那一種。

## 沒做

- 其他字卡、動畫上的文字沒有這個下拉選單（模板動畫的文字動態是各模板自己設計的）。作者原話指的是片尾書封旁邊那段字；要不要推到一般字卡等他說。
- 剪輯台不能改片尾金句的字、圖、秒數（照舊跟 AI 說）。
- 剪輯台沒有「之後的影片也用這個」的勾選；每一集的預設用 `brand.mjs ending --motion`。

## 驗證

- `dev/tests/ending.test.mjs`：五種的清單與預設、工作區設定與這一集的優先序、每一種的 timeline 寫法（打字機和以前逐字相同）、`--set ending.motion`。
- `dev/tests/editor-ending.test.mjs`：存檔規則、只動 `ending` 那一個鍵。
- `dev/tests/editor-ending-ui.test.mjs`（要瀏覽器）：點片尾卡出下拉選單、五個選項、選了存檔、快速試聽的示意照選的動、選回預設拿掉、工作區預設不是打字機時的標示。
