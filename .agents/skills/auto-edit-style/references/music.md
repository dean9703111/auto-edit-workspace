# 配樂（選用）

整支片墊一首很小聲的音樂（底樂），或換片尾配樂。**沒人要求就不做**：預設沒有底樂，流程和以前一樣。

指令都在工作區根目錄跑。不讀 `shared/template/tools/` 的原始碼。

## 使用者說什麼，做什麼

| 使用者說 | 做法 |
|---|---|
| 「有哪些配樂」 | `node shared/template/tools/music.mjs list`，照貼 |
| 「用我自己的音樂」＋檔案路徑 | 步驟 A |
| 「生成配樂」「做配樂」「換配樂」 | 步驟 B（要 ACE-Step；沒裝照步驟 B 的第 2 點問） |
| 「這集生一首新的」 | 步驟 B，每條指令加 `--project projects/<專案>` |
| 「每一集都用這首」 | `node shared/template/tools/music.mjs use <曲名>` |
| 「這集不要底樂」 | 那一集 plan.json 第一層寫 `"bed": { "music": null }`，跑 build |
| 「以後都不要底樂」 | `node shared/template/tools/music.mjs use none` |
| 「底樂大聲一點／小聲一點」 | 那一集 plan.json 的 `bed` 加 `"volume": 3`（dB，−12～+12；一次調 3），跑 build |

## 步驟 A：放自己的音樂

1. `node shared/template/tools/music.mjs add <聲音檔> --name <曲名>`（只給這一集用就加 `--project projects/<專案>`）。曲名自己取：小寫英文開頭，只用小寫英數和 `-`，例 `bed-my-song`。使用者說這首要標出處，加 `--credit "<出處那一句>"`。
2. 印 `✓ 存進…曲庫` 就接步驟 C。印 `⚠ 只有 N 秒` 的不能當底樂，告訴使用者換一首長一點的（或只當片尾配樂）。

## 步驟 B：用 ACE-Step 生成

1. 挑風格：使用者有講就照他講的；沒講就讀這一集的 `work/摘要.md`（沒有就用「輕快科技」），從這四個挑最像的：輕快科技、溫暖敘事、沉穩專業、活力教學。使用者自己描述了想要的音樂，才把他的話翻成英文寫 `--prompt "…"`；不要自己編描述。
2. 跑 `node shared/template/tools/music.mjs gen --style <風格>`。
   - 印 `✖ 不能生成配樂`：ACE-Step 沒裝。**先問使用者要不要裝**，問的時候照 `setup/ACE-Step 配樂.md` 第一段講要下載多大、要多久；他同意才照那份手冊裝，不同意就改問他要不要用步驟 A 放自己的音樂。
   - 印 `⏳ 已經 N 分鐘…`：還在做，等它，不要重跑。
3. 印出停點那兩行就照抄貼給使用者，停下來。
4. 使用者回「用第 N 首」：跑工具印的 `music.mjs keep <N> --name <曲名>`（曲名自己取，例 `bed-calm-tech`）。回「重做」：問他想換哪個風格或想要什麼感覺，回步驟 1；同一個風格重做 2 次還不行，建議他換風格或用步驟 A。
5. 接步驟 C。

## 步驟 C：用在影片上

| 使用者要 | 做法 |
|---|---|
| 這一集當底樂 | 那一集 plan.json 第一層寫 `"bed": { "music": "<曲名>" }` |
| 每一集都當底樂 | `node shared/template/tools/music.mjs use <曲名>`（plan.json 不用寫） |
| 當片尾配樂 | 那一集 plan.json 第一層寫 `"outro": { "from": "#N", "music": "<曲名>" }`（N＝結語金句講完後那一句） |

沒講清楚就問一次：「要每一集都用，還是只用在這一集？」

改完跑 `node shared/template/tools/build.mjs --project projects/<專案>`，把它印的「底樂：…」那一行照貼給使用者。底樂的音量、淡入淡出、講話時壓低都是工具做的，不用自己調。

## 不要做

- 不要自己寫 ffmpeg 混音、不要手動改 `shared/music/` 和 `shared/setting.json`。
- 不要在使用者沒要求時加底樂或安裝 ACE-Step。
- 已經在曲庫的曲子不改、不刪；要換就用新的曲名。

## 退路

| 症狀（工具原文） | 做法 |
|---|---|
| `✖ ACE-Step 開不起來` | 照 → 看它印的紀錄檔最後幾行，原文回報給使用者 |
| `✖ ACE-Step 生成超過 … 秒還沒好` | `--seconds 60` 再跑一次；還是不行就回報 |
| `bed.music：「…」不是曲庫裡的配樂` | `music.mjs list` 看曲名，改成有的 |
| `底樂：工作區預設的「…」不是曲庫裡的配樂` | 照 → 跑 `music.mjs use <曲名>` 或 `music.mjs use none` |
