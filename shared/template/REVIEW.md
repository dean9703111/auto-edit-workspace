# 審查與驗收（給 AI 查）

定稿、回饋輪收尾都照這份看畫面。門檻數字只寫在 `shared/style.md`「審查門檻」，這裡只寫怎麼量、怎麼回報。和 `USAGE-reference.md` 同一層（優先序見 `AGENTS.md`「怎麼用這份檔」）。

## 1. 什麼時候用

| 時機 | 看什麼 | 誰看 |
|---|---|---|
| 定稿（`build.mjs --review`，停點 ④ 之前） | 工具量的 ✖、⚠；人眼看 `work/storyboard-preview/sheet-NN.jpg` 的完成態拼圖，只找 FAIL | 主代理 |
| 回饋輪（`versions.mjs finish`） | 只看改到的段那一張拼圖 | 主代理 |
| 輸出（`deliver.mjs`） | `qc.mjs final` 的 ✖、⚠，掃一眼 `output/qc/qc-sheet.jpg` | 主代理 |

## 2. 審查門檻

**工具已經量的，不用再看圖**：`build.mjs --check`（文字對時、沒有畫面的區間、只有聲音、超過 18 字、講者閃一下、到退場只停、音效）、`audit.mjs`（情境動畫的版面、綁句、停留、畫面沒有變化）、`qc.mjs final`（格式、響度、凍結、黑畫面、沒有聲音、沒有講者小視窗、靜止區間）。✖ 全修，⚠ 照 → 改或寫理由。

**只有人眼看得出來的，看拼圖**：

| 項目 | 門檻 | 怎麼看 | 等級 |
|---|---|---|---|
| 擋臉 | 卡片或字幕蓋到講者的臉 | 拼圖每一格；`--check` 的「大約會蓋到講者框 N%」 | P0 |
| 壓到身體 | 臉沒擋到，只壓到身體或手勢可能會到的範圍 | 拼圖；不改，回報點名請使用者在完成影片預覽確認（拼圖是靜態的，看不出手勢會比到哪） | P2 |
| 字被切、撐破 | 文字被切掉、超出卡片、斷在詞中間 | 拼圖 | P0 |
| 講者小視窗 | 子母畫面一定有講者小視窗；只有純聲音素材的區間才沒有（`auto-edit-storyboard` 硬規則） | 拼圖右下角；`--check` 的「子母畫面的講者小視窗」那一行；空的先跑 `media.mjs verify-rough`，不要改版面 | P0 |
| 內容設計動畫 | 遮住字幕看得懂在講什麼、有主角、動作看得到 | 拼圖 | P1 |
| 章節角標 | 疊加、半畫面時右上角有章節角標，一直留到下一章；子母畫面、全幕時隱藏（有 `sections`：章號＋目前小節，子母畫面、全幕、錄影段也在） | 拼圖；角標不見了不要在 plan.json 補 `chtag`，回報給使用者 | P1 |
| 其他觀感 | 顏色、對齊、留白 | 拼圖 | P2 |

字幕對嘴只有使用者在完成影片預覽看得出來，AI 不用為了確認對嘴跑 snapshot、render；停點 ④ 回報時提醒他看，他指出哪一句再改 `rough.srt` 那一則的起訖。

## 3. 看拼圖

同一則回覆一次打開 `build.mjs --review` 印的所有頁，一次看完。每格標段 id 和「為什麼」（完成態、第幾條）。只列 FAIL：`[P0] s04 第 3 條斷在「逐字//稿」中間｜sheet-02.jpg｜改 // 的位置`。FAIL 修好後：停點 ④ 之前重跑 `build.mjs --review`；回饋輪（已經 `begin`）跑 `versions.mjs finish`。都只看改到的段。

使用者要求逐格抽查才跑全片截圖或觀影總表（都很慢）：

- `(cd projects/<專案>/work/hyperframes && npx hyperframes snapshot --review)`：`review-beats.jpg`、`review-seam-NN.jpg`、`review-phone.jpg`（USAGE.md 2.5）。
- `node shared/template/tools/qc.mjs observe --project projects/<專案> [--from 60 --to 120]`：`work/observe/sheet-NN.jpg` 每張 6×8 格＝24 秒，格下是 `時間｜段落編號｜字幕`；`seam-NN.jpg` 每個接縫前後每 0.1 秒一格；`index.md` 的「靜止區間」是連續 8 秒以上幾乎沒變的地方。`qc.mjs final` 有 ⚠ 時只看那一段就好。

- `qc.mjs storyboard` 或 `qc.mjs final` 印 `✖ s21 是全畫面清單卻沒有講者小視窗：work/rough.mp4 在 1:56.14–2:33.51 是全黑（原始素材不是）→ 初剪壞了，跑 node shared/template/tools/media.mjs verify-rough --project projects/<專案> 照它印的做`：不是版面的問題，不要改 plan.json；照 → 重做初剪。專案有 `assets/voice/` 的旁白時不會報（全黑本來就是旁白區間）。

## 4. 回報格式

每個問題一行：

```
[P0] 0:35.1（s04）條列第 3 條斷在詞中間｜sheet-02.jpg｜改 // 的位置
```

沒有問題寫「拼圖沒有 FAIL」。子代理只回有問題的列。

| 等級 | 包含 | 處理 |
|---|---|---|
| P0 | 擋臉、字被切或撐破、沒有畫面、子母畫面沒有講者小視窗、「文字對時」✖、字幕錯字 | 一定修好才進停點 ④ |
| P1 | 停留、同步、閃動、音效密度；字幕對不上嘴（使用者在停點 ④ 指出才改） | 修；刻意保留就在回報寫理由 |
| P2 | 其他觀感、靜止（講解沒講新東西時）、只壓到身體 | 列給使用者決定 |

## 5. 輸出前驗收清單

- [ ] `build.mjs --review`：build、audit 0 個 ✖；拼圖沒有 FAIL
- [ ] `deliver.mjs`：測試片段（或接手預先 render 的成品）有影音
- [ ] `qc.mjs final` 0 個 ✖（沒有「沒有講者小視窗」的 ✖）；每個 ⚠ 都寫了「刻意」或「要修」
- [ ] 有回饋輪時 `work/feedback/r<N>.md` 四節都寫完
