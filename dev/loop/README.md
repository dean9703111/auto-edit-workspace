# dev/loop/：檢查迴圈（作者維護用，剪片時不要讀）

每一輪改完工作區（工具、Skill、文件、音效、look）都跑同一個迴圈，直到全部過關才交付。憲法 `.specify/memory/constitution.md`「檢查迴圈」是規則，這裡是做法。

## 一輪怎麼跑

| 步 | 做什麼 | 指令／做法 | 過關條件 |
|---|---|---|---|
| 1 | 單元測試＋管線 | `node dev/check-all.mjs`（第一次加 `--render`） | 全部 ✓（沒有 Chrome 的機器 audit／snapshot 略過不算失敗） |
| 2 | 真實專案 | 範例專案跑過「剪乾淨」後：`node dev/check-all.mjs --real projects/example` | 同上；有成片時 `qc final` 0 ✖ |
| 3 | 弱模型試跑 | 用較弱的模型（Sonnet 或更弱）開一個**新 session**，只給 `weak-model-brief.md` 的提示詞，從「剪乾淨」跑到停點 ③ | 它在每個停點都用固定格式停下、沒有自己算時間、沒有讀 `dev/`；卡住的地方記下來 |
| 4 | 審查員 | 只讀的審查員照 `specs/<編號>/spec.md` 的 SC-xxx 逐項打勾；回報格式照 `shared/template/REVIEW.md` | P0 清零；P1 列出處理方式 |
| 5 | 修、記錄 | 修完回到第 1 步；這一輪的結果寫 `round-N.md`（下面的範本） | — |

結束條件：連續一輪 1–4 全過、審查 P0＝0、弱模型試跑沒有「自己算」「跳過停點」「讀錯檔」三種失誤。

## round-N.md 範本

```markdown
# 第 N 輪　YYYY-MM-DD

## 這輪改了什麼
- （工作線編號）一句話

## check-all
貼 `dev/loop/last-check.md` 的表

## 弱模型試跑（模型：…）
| 停點 | 有停 | 格式對 | 自己算了什麼 | 讀了不該讀的檔 | 備註 |
|---|---|---|---|---|---|

## 審查員
| 編號 | 等級 | 位置 | 問題 | 修法 | 狀態 |
|---|---|---|---|---|---|

## 下一輪要做
1. …
```

## 定期跑

Claude Code 可以用 `/loop 30m node dev/check-all.mjs --skip-tests` 之類的方式定期跑第 1 步；但第 3、4 步要人（或另一個 session）做，不能靠排程。
