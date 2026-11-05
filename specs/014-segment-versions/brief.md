# 014 段落版本與改版

來源：作者 2026-11-01 問「每個階段完成都會有對應的更新嗎？」「想針對一段把動畫做得更完善：指定 HyperFrames 的片段 → AI 先出分鏡稿 → 我確認再做；專案結構上要有 v1／v2 資料夾讓我檢視」，回覆「給我在使用上最順暢的設計」＝四個待決定事項由我照最順暢的方向定。

## 盤點時找到的缺口（範例專案）

1. 製作進度.md 的「## 階段」只有 auto-edit-longform 寫要更新；直接說「剪乾淨」走單一 Skill 時不一定更新。
2. 回饋輪只備份 plan.json：r2 改了 s08／s12／s18／s20 四支 x 檔，沒有 `plan.json.bak-r2`，也沒有 x 檔舊版，回不去 r1 的 s12。
3. 停點 ④ 之後要「更完善」時沒有「先出分鏡、確認再做」：r1 直接加了運鏡，r2 又整批回退。
4. `work/s12-快照/`、`work/sfx-備份/` 是臨時起的資料夾，沒有規範。

## 定案（使用上最順暢）

| 題目 | 定案 | 理由 |
|---|---|---|
| A 停點 | 沿用停點 ③ 的變體「③ 分鏡表（s12 v2）」，停點仍是六個 | 意思和停點 ③ 一樣（先確認動畫分鏡再做），弱模型不用多學一個停點 |
| B 範圍 | 任何段都有版本；改版流程不限情境動畫（字卡段的「分鏡」就是 storyboard 那一節） | 使用者不用分段落種類 |
| C 預覽 | 每次存版本都自動 render 這一段（6 秒的段約 17–20 秒）＋拼格圖；改過的段自動出左右並排比較影片 | 動畫要看動的；實測 render 一段只要 18 秒，不設開關 |
| D 補缺口 | 回饋輪改到的段改前、改後都 `versions.mjs save`（x 檔、svg 一起存）；AGENTS.md 加一條「不管走哪支 Skill 都更新階段狀態」 | 一個工具同時解掉缺口 2、4 |
| 小改 vs 改版 | 有具體改法（位置、文字、時間、音效）＝回饋輪直接改；只說要更好、重做＝改版（先出分鏡） | 小改不多停一次 |

## 做了什麼

| 檔案 | 內容 |
|---|---|
| `shared/template/tools/versions.mjs`（新） | `save`／`new`／`accept`／`use`／`list`；契約 `specs/contracts/cli-014.md` |
| `shared/template/tools/status.mjs` | 停點標籤保留括號（`③ 分鏡表（s12 v2）`）、改版下一步、`改版／…` 狀態、S10 排除 accept／use 寫的 storyboard.md |
| `shared/template/tools/lib/raster.mjs` | 點陣字加小寫 v（比較影片的版本號） |
| `AGENTS.md` | 路由表、專案樹 `work/版本/`、規則 7、停點總表 ③ 列與改版那一行、階段預算兩格、進度紀錄（改版停點寫法、階段狀態不分 Skill、回饋輪存版本）、新節「段落版本與改版」 |
| `.agents/skills/auto-edit-review/` | 流程 B 存版本、新流程 D1–D3（改版）、E（退回）、停點、退路、回報；`references/feedback-round.md` 分類表加改版／退回 |
| `.agents/skills/auto-edit-motion/SKILL.md`、`auto-edit-longform/SKILL.md`、`progress-template.md` | 改版時從步驟 4 改；status「改版」→ 流程 D；停點紀錄範例 |
| `shared/template/USAGE.md` 2.6、`PROMPTS.md` 3b | 提示詞與做法各一段 |
| `specs/contracts/stop-points.md`、`cli.md`、`cli-014.md` | 停點 ③ 變體、指令契約 |
| `dev/tests/versions.test.mjs`（新）、`docs.test.mjs` | 版本流程 7 項；T7／T8 認得改版那一行 |

## 驗證

- `dev/tests/versions.test.mjs`、`status.test.mjs` 全過。
- 試跑（暫存區的 projects/範例 複本）：`save s12` → v1（預覽 6.0 秒、拼格 12 格，17 秒）→ `new` → `accept`（storyboard.md 只換 s12 那一行）→ status「改版／s12 v2（分鏡已確認，還沒做完）」→ 改 x 檔標題 → `save` → v2＋`比較-v1-v2.mp4`（1920×604、左右標 v1／v2）→ `use v1`（plan.json、x 檔、storyboard.md 都換回、和原始檔逐字相同）。

## 已知限制

- 段 id 改名或拆段（s20 → s20b）不會自動接上舊版本。
- 預覽用目前的 build：存舊版時如果 build 有 ✖，只存檔案、不出預覽（⚠ 會說）。

## 保留選項：動畫逐段進剪映（作者 2026-11-01：「第三種最理想，就是一個保留選項」，未排程）

目標：每段動畫輸出成透明 MOV＋導入清單，接 agent-skills `jianying-editing` 的 `import_hf_movs.py`，在剪映裡還能調。現在只有攤平的 `完成影片/final.mp4` 能進剪映。

已確認的事（2026-11-01）：

- 版本機制相容：版本存的是原始設定（`段落.json`、`x-*.html`），匯出時拿每段「目前」那一版；要用舊版先 `versions.mjs use`。`預覽.mp4`／`比較-*.mp4` 是攤平的 draft 預覽，不能當疊加層。
- HyperFrames 0.8.226 `render --format mov` 是 ProRes 4444 帶透明（`--prores-profile` 選 422 系列才會掉 alpha）。
- x 檔靠 build 注入的 `window.__cues` 綁句，不能單獨 render → build 要多一個「只有疊加層」的模式（不放 rough.mp4 底片、字幕、背景圖）。
- `import_hf_movs.py` 只吃橫式 1920×1080（`:467`、`:449`）；直式走 `gen_short_draft.py` 的 `hf_movs`。

開工前要做的比對（還沒做）：兩邊分工。本工作區在 HTML 裡做的講者小視窗、字幕、章節角標、轉場、音效、背景圖，剪映 pipeline 由剪映端做（`add_subtitle_track.py`、`pip_transitions.py`、`pip_frames_from_list.py`、音效點位表）→ 逐項決定匯出時拿掉還是保留；導入清單／`footprint.json` 欄位照 agent-skills `hyperframes-overlay` 的 `import-list.mjs`、`footprint.mjs`。

現在不用為它改任何東西；之後改版本機制時別把匯出用不到的東西寫進 x 檔（x 檔維持唯一的動畫原始檔）。

