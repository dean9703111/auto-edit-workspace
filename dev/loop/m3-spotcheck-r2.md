# MiniMax-M3 規則理解力抽測（第 2 輪文件定稿後）

日期：2026-10-31。方法：用 `mmx text chat --model MiniMax-M3` 把定稿的 AGENTS.md、auto-edit-storyboard/SKILL.md、SITUATIONS.md 當 system（32,253 字、18.5k input tokens），問五題，每題要求引用依據。沒有檔案與工具存取，純看「讀了規則會不會照做」。

| 題 | 預期 | M3 回答 | 判定 |
|---|---|---|---|
| Q1 剪好看前 4 個指令與第一個停點 | look.mjs status → 照兩行格式的指令 → qc.mjs framing --cards → 停點 ②，固定格式那行 | 完全一致，停點那行逐字正確 | ✓ |
| Q2 「有三件事要小心…」版面與首選 | 子母畫面、custom x-warnings，不是 12 | 一致，並說明 1 條退 07 warn、4 條以上 04a | ✓ |
| Q3 文字對時 ✖ 怎麼改 | s03 的 beats.keyAt = "#8@儲存這支"，不動 from，重跑 --check | 一致 | ✓ |
| Q4 子母畫面 pip 空、素材沒聲音檔 | 跑 verify-rough 重做初剪，不可改版面繞過 | 一致 | ✓ |
| Q5 連續三段 06 字卡 | 回頭查 §3：前後對比→x-before-after、數值變化→x-trend、本集大綱→x-timeline | 一致，三段都改成動畫 | ✓ |

結論：5/5。文件層面 M3 能照規則走；完整代理試跑（含工具呼叫）需使用者同意後用 Claude Code headless 指到 MiniMax 端點再做。原始回答：session scratchpad `m3/answer.json`。
