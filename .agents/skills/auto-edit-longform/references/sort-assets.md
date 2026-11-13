# 分類素材

使用者說「幫我分類 @projects/<專案> 裡的素材」「分類素材」時照這份做。要開剪，但 `assets/camera/`、`assets/voice/` 都是空的、專案裡又有散落的素材時，也先照這份做。

工具只看 `projects/<專案>/` 底下（含子資料夾）、不在 `assets/`、`work/`、`output/` 裡的檔案，由上往下照第一個符合的列分：

| 看到的事實 | 怎麼分 |
|---|---|
| 檔名有「場地照」 | 不動（工具會來這裡找） |
| 副檔名是 `.jpg`、`.jpeg`、`.png`、`.webp`、`.heic` | `assets/images/` |
| 只有聲音 | `assets/voice/` |
| 有畫面，檔名有「螢幕錄影」「錄屏」「Screen Recording」（不分大小寫） | `assets/screen/` |
| 有畫面，其他檔名 | 看圖：中間一格拼進 `work/分類-總表.jpg`，你看完回答（第 2 步） |
| 專案裡還沒有 `講稿.md`，而且只有一個 `.md` 或 `.txt` | 改名成 `講稿.md`（先打開確認是講稿內容；不是就回答 `skip`） |
| 其他（好幾份講稿候選、已經有 `講稿.md`、`.docx`、`.pdf`、ffprobe 讀不到、不認得的檔案） | 不動，列為待確認 |

1. 先看計畫（只印表、不搬）：

   ```
   node shared/template/tools/media.mjs sort --project projects/<專案>
   ```

2. 表上有「看圖」的：打開 `work/分類-總表.jpg`，拍到真人在講解＝`camera`，電腦或手機的操作畫面＝`screen`，看不出來就不寫（會列為待確認）。使用者已經說了哪個檔放哪裡，也用同一個寫法（另外收 `voice`、`images`、`script`＝當講稿、`skip`＝不動）。
3. 照它印的 `→ 下一步` 那一條搬（有回答就加 `--as`）：

   ```
   node shared/template/tools/media.mjs sort --project projects/<專案> --apply --as "檔名=camera;檔名=screen"
   ```

   只搬，不轉檔、不刪、不改檔名（講稿例外）；同名不覆寫、看圖沒回答的不搬，都列為待確認。
4. 回報：照貼 `--apply` 印的表（檔案｜搬到哪｜依據）和待確認的檔案。不要自己開始剪。最後一行照它印的：`→ 下一步：分類沒問題後說「剪乾淨」；要改就說哪個檔案放哪裡`。
