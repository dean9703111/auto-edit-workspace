# 製作進度：<專案>

<!-- 由 auto-edit-longform 步驟 2 從 .agents/skills/auto-edit-longform/references/progress-template.md 複製。
     四節的標題不要改：status.mjs 讀「## 停點紀錄」那張表。 -->

## 開工決策表

| 欄 | 值 | 怎麼看 | 會影響什麼 |
|---|---|---|---|
| 主軌種類 | | `ls projects/<專案>/assets/camera projects/<專案>/assets/voice`，加上 `media.mjs main` 印的邊錄邊講螢幕錄影 | 1 支真人錄影＝直接用；其他＝停點 ① 要問順序；邊錄邊講的螢幕錄影只剪 NG、初剪後跑 `screen-sync` |
| 版式 | | 使用者說「短影片」「直式」「Shorts」「Reels」「抖音」→ 直式；說「長片」「橫式」→ 橫式；都沒說：`ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "<主軌>"`，寬 < 高 → 直式（AGENTS.md「版式」） | 寫「直式（理由）」或「橫式（理由）」；直式：畫布 1080×1920、版面只有疊加／上下分割／全幕、字幕每則 10 字、plan.json `"format": "portrait"` |
| 有沒有講稿 | | `projects/<專案>/講稿.md` 在不在 | 沒有：字幕只轉繁體、補標點；沒有章節空檔表 |
| 有沒有螢幕錄影／圖片 | | `ls projects/<專案>/assets/screen projects/<專案>/assets/images` | 有：分鏡時跑 `auto-edit-screen` |
| 長度（秒） | | `ffprobe -v error -show_entries format=duration -of csv=p=0 "<主軌>"` | 不到 180 秒（3 分鐘）：不用 01 章節轉場 |
| 有沒有業配段 | | 講稿出現「業配」「贊助」「優惠碼」→「可能有，待確認」；沒講稿寫「未知」 | 有：業配段不放 01 章節轉場 |
| 構圖 | 待停點 ② | 停點 ② 通過後填（倍率，或「不裁切」） | plan.json `frame` |

## 階段

狀態只用這六個：⬜ 還沒開始、🔄 進行中、⏸ 等使用者、✅ 完成、↩ 退回重做、— 這集不用。

| 階段 | Skill | 狀態 | 產物 |
|---|---|---|---|
| 剪乾淨 | auto-edit-rough | ⬜ | work/cuts.md、rough.mp4、rough.srt、cutpoints.json |
| 構圖＋分鏡 | auto-edit-storyboard | ⬜ | 構圖預覽.jpg、storyboard.md、storyboard-preview/ |
| 螢幕錄影配對 | auto-edit-screen | ⬜ | storyboard.md 的 media 列 |
| 情境動畫 | auto-edit-motion | ⬜ | work/hyperframes/compositions/x-*.html |
| 定稿與 Studio | auto-edit-review | ⬜ | work/hyperframes/、feedback/r*.md |
| 交付 | auto-edit-deliver | ⬜ | output/final.mp4、output/qc/qc-sheet.jpg |

## 停點紀錄

| 時間 | 停點 | 狀態 | 使用者原話 | 寫回哪裡 |
|---|---|---|---|---|

## 回饋輪

| 輪 | 時間 | 檔案 | 改了哪幾段 | 備份 |
|---|---|---|---|---|

---

## 附：產物 → 階段（status.mjs 不能用時手動判斷；由上往下第一個符合的）

| 看到的檔案狀態 | 目前在 | 交給 |
|---|---|---|
| `assets/camera/`、`assets/voice/` 都沒有檔 | 開新專案 | 告訴使用者放素材 |
| 沒有 `work/cuts.md` | 剪乾淨：轉逐字稿、找 NG | auto-edit-rough 步驟 2 |
| 有 cuts.md、沒有 `work/rough.mp4` | 剪乾淨：停點 ① | auto-edit-rough（等使用者回 ①） |
| 有 rough.mp4、沒有 `work/rough.srt` 或沒有 `work/rough.srt.bak-*` | 剪乾淨：字幕 | auto-edit-rough 步驟 7 |
| 沒有 `work/cutpoints.json` | 剪乾淨：剪接點 | auto-edit-rough 步驟 8 |
| 沒有 `work/構圖預覽.jpg` | 剪好看：構圖 | auto-edit-storyboard 步驟 1 |
| 沒有 `work/storyboard.md` | 剪好看：停點 ② 之後 | auto-edit-storyboard 步驟 3 |
| storyboard.md 比 `work/hyperframes/plan.json` 新 | 剪好看：停點 ③ | auto-edit-storyboard（等使用者回 ③） |
| 沒有 `work/hyperframes/index.html` | 定稿 | auto-edit-review 流程 A |
| 沒有 `output/final.mp4` | 停點 ④ | auto-edit-review（等使用者回 ④） |
| 沒有 `output/qc/qc-sheet.jpg` | 交付：驗收 | auto-edit-deliver 步驟 4 |
| 其他 | 完成 | 等使用者的修改 |

停點紀錄的格式（時間、停點名稱、四種狀態、只新增不改舊列）照 AGENTS.md「進度與回饋紀錄」。例：

| 時間 | 停點 | 狀態 | 使用者原話 | 寫回哪裡 |
|---|---|---|---|---|
| 2026-11-02 14:10 | ① 剪輯清單 | 待回覆 | — | — |
| 2026-11-02 14:20 | ① 剪輯清單 | 通過 | 「清單沒問題，繼續」 | work/cuts.md |
| 2026-11-03 10:05 | ③ 分鏡表（s12 v2） | 待回覆 | — | work/versions/s12/v2/分鏡.md |
