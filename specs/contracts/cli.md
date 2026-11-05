# 契約索引：指令（cli）

- 本檔只做索引，不複製內容。每支指令的完整參數、印出的關鍵行原文、退出碼、錯誤格式，**單一真相在各自的 `cli-00N.md`**；要改原文就改那一份，再請 001 對齊文件。
- 共通：指令都在工作區根目錄執行；錯誤是 `✖ <原因> → <改法>`（結束碼 1），提醒是 `⚠ <原因> → <改法>`（不影響結束碼）。各指令的例外寫在自己那一份。
- 文件怎麼引用：AGENTS.md、Skill、USAGE 寫完整指令與「照印的 → 改」，不另抄數字；`dev/tests/docs.test.mjs` T11 會比對每支工具 `--help` 的子指令都寫進文件。

| 契約 | 擁有者 | 指令 | 一行摘要 |
|---|---|---|---|
| [cli-001.md](cli-001.md) | 001 skills-docs | `node setup/install-skills.mjs` | 把 `.agents/skills/` 的 9 支 auto-edit Skill 複製到 MiniMax Code（`~/.minimax/skills/`）與 Claude Code（`.claude/skills/`）；標記檔、衝突、`--dry-run`／`--check`／`--json`、結束碼 0／1／2 |
| [cli-002.md](cli-002.md) | 002 pipeline-timing | `build.mjs`（新報告行）、`media.mjs ng-snap`／`cutpoints`／`srt-split`／`srt-align`、`status.mjs`、`caps.mjs` | build 的版本行、節奏與「沒有畫面的區間」、章節空檔、`P.at` 綁句訊息；剪乾淨的 NG 對齊與 auto-editor 三行、剪接點、拆句；專案進度與能力檢查 |
| [cli-003.md](cli-003.md) | 003 motion-audit | `audit.mjs`（新訊息） | `--help` 原文、新增的 3 條 ✖ 與 11 條 ⚠（版面與節奏）、SceneMotion 執行期錯誤、`--json` 新欄位 |
| [cli-004.md](cli-004.md) | 004 media-annotations-qc | `qc.mjs storyboard`／`observe`／`framing`、`brand.mjs bg` | 分鏡表每段完成態截圖、完成影片觀影總表與接縫圖、構圖倍率表的「建議」欄、HTML 背景圖截圖與留空區檢查 |
| [cli-005.md](cli-005.md) | 005 sfx | `dev/tools/make-sfx.mjs`（作者用）、build／`--check` 的音效報告行 | 音效產生與試聽；「音效比例」「音效次數」「音效密度」等報告行原文 |
| [cli-014.md](cli-014.md) | 014 segment-versions | `versions.mjs save`／`new`／`accept`／`use`／`list` | 每段的版本資料夾 `work/版本/<段>/v<N>/`、預覽影片與並排比較、改版提案 → 停點 ③ → 寫回 storyboard.md、退回舊版 |
| [cli-006.md](cli-006.md) | 006 look | `look.mjs run`／`preview`／`status`／`clear`／`ensure` | 講者臉部偵測、瘦臉底片與對照圖、進度與下一步、快取清除、MediaPipe 檔案檢查；剪輯台新 API；build 印的 look 行 |

相關的資料契約（不是指令）：`check-json.md`（`build.mjs --check --json` 欄位）、`cues.md`（`window.__cues` 與 `P.at`）、`media.md`（media 段欄位與訊息代號）、`sfx.md`（`kit/sfx.json` 欄位）、`look.md`（`ensureLook`、`plan.look`）、`plan-fields.md`（plan.json 新欄位清單）、`stop-points.md`（六個停點的固定格式）。
