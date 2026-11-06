# 背景圖工人的派工模板（同時生成）

給 `auto-edit-style` 步驟 3 用：生圖路線（Codex、mmx、自己的生圖工具）和 HTML 路線，每張圖派一個工人，同一則回覆一次全部派出（亮色 3 個；亮暗都要 6 個）。「使用者的圖」只跑 ffmpeg，不用派。

工人只寫 `<暫存資料夾>/<種類>/` 和 `<暫存資料夾>/bg-<種類>.jpg`（暗色 `bg-<種類>-dark.jpg`），不寫 `shared/`、plan.json，不跑 `brand.mjs pack`、`use`。

沒有能派子代理的工具，或工人回報沒有生圖工具時，主代理自己照 `references/image-routing.md` 一張一張做。

## 派工前先準備（主代理做）

1. 照 `references/image-routing.md` 第 0 節開暫存資料夾，建好每種的子資料夾：`mkdir -p "$TMP/fs" "$TMP/side" "$TMP/ch"`（PowerShell：`New-Item -ItemType Directory`）。
2. 寫 `<暫存資料夾>/brief.md`：主色色碼、亮或暗、視覺方向（造型、線條、材質、配色）、參考圖路徑（Codex 路線照第 2 節先複製 `ref.jpg`）。三張都照這份做才像同一套；工人不能自己改方向。
3. 從 `USAGE-reference.md` R9.2 抄這一張的尺寸與留空區，放進派工訊息。

## 派工訊息（照抄，把 `<…>` 換掉）

```
你要生成一張影片背景，存成 <暫存資料夾>/bg-<種類>.jpg（只寫這個檔和 <暫存資料夾>/<種類>/）。

【風格】讀 <暫存資料夾>/brief.md，照做，不要改方向。
【規格】<尺寸>；留空區：<R9.2 這一張的留空區原文>；圖片不含文字、標誌、卡片。
【路線】<Codex／mmx／自己的生圖工具／HTML>。指令照 .agents/skills/auto-edit-style/references/image-routing.md 第 <節>，暫存資料夾用 <暫存資料夾>/<種類>。
【驗收】
1. ffprobe -v error -show_entries stream=width,height -of csv=p=0 "<暫存資料夾>/bg-<種類>.jpg" 印 <寬>,<高>；不對就照 image-routing.md 第 1 節裁。
2. 留空區裡沒有裝飾（HTML 路線看 brand.mjs bg 印 ✔ 留空區乾淨）。

【回報】最多 8 行，照下面的格式。沒有生圖工具或指令失敗就直接回報原文，不要改走別條路。
```

## 回報格式（工人交回，最多 8 行）

```
背景：bg-<種類>.jpg（<寬>×<高>）
檔案：<完整路徑>
ls -l：<貼 ls -l 那一行>
路線：<Codex／mmx／自己的生圖工具／HTML>
留空區：<乾淨／哪一區有裝飾>
失敗原文：<沒有寫「無」>
我沒有改的東西：shared/、plan.json
```

## 收件（主代理做）

- 等完成通知，不要寫 `sleep` 迴圈等檔案。`ls -l` 的時間是剛剛才算交件。
- 全部回來後由主代理跑 `image-routing.md` 第 5 節產生 `zones-fs.jpg`、`preview.jpg`（HTML 路線 `brand.mjs bg` 已經產生的就不用再跑），停在停點 ⑥。
- 有一張失敗或「重做」：只重派那一張。同一條路第 2 次還不行才換下一條路（R9.3）。三張風格不像同一套：把不像的地方寫進 `brief.md`，重派不像的那張。
