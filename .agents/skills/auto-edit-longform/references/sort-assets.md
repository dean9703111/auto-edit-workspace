# 分類素材

使用者說「幫我分類 @projects/<專案> 裡的素材」「分類素材」時照這份做。要開剪，但 `assets/camera/`、`assets/voice/` 都是空的、專案裡又有散落的素材時，也先照這份做。

只處理 `projects/<專案>/` 底下（含子資料夾）、不在 `assets/`、`work/`、`output/` 裡的檔案；已經在 `assets/` 的不動。

1. 建好 `assets/camera`、`assets/voice`、`assets/screen`、`assets/images`、`work`（沒有的才建）。
2. 每個影音檔先看有哪些軌：`ffprobe -v error -show_entries stream=codec_type -of csv=p=0 "<檔案>"`。
3. 由上往下，照第一個符合的列處理：

| 看到的事實 | 怎麼做 |
|---|---|
| 檔名有「場地照」 | 留在原地（工具會來這裡找） |
| 副檔名是 `.jpg`、`.jpeg`、`.png`、`.webp`、`.heic` | 搬到 `assets/images/` |
| ffprobe 只有 `audio` | 搬到 `assets/voice/` |
| ffprobe 有 `video`，檔名有「螢幕錄影」「錄屏」「Screen Recording」（不分大小寫） | 搬到 `assets/screen/` |
| ffprobe 有 `video`，其他檔名 | 先取片長：`ffprobe -v error -show_entries format=duration -of csv=p=0 "<檔案>"`。再截中間一格來看：`ffmpeg -v error -y -ss <片長一半的秒數> -i "<檔案>" -frames:v 1 "projects/<專案>/work/分類-<序號>.jpg"`。拍到真人在講解 → `assets/camera/`；電腦或手機的操作畫面 → `assets/screen/`；看不出來 → 待確認 |
| 專案裡還沒有 `講稿.md`，而且只有一個 `.md` 或 `.txt`、打開來是講稿內容 | 改名成 `projects/<專案>/講稿.md` |
| 其他（好幾份講稿候選、已經有 `講稿.md`、`.docx`、`.pdf`、ffprobe 失敗、不認得的檔案） | 不動，列為待確認 |

4. 只能搬，不要轉檔、刪除或改檔名（講稿除外）。目的地已經有同名檔時不要覆寫，列為待確認。搬完變空的子資料夾和 `work/分類-*.jpg` 都留著。
5. 回報一張表（檔案｜搬到哪｜依據），再列待確認的檔案。不要自己開始剪。最後一行：`→ 下一步：分類沒問題後說「剪乾淨」；要改就說哪個檔案放哪裡`。

