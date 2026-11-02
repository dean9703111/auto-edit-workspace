# 審查與驗收（給 AI 查）

定稿自查、回饋輪收尾、verifier 子代理都照這份看畫面。門檻數字只寫在 `shared/style.md`「審查門檻」，這裡只寫怎麼量、怎麼回報。和 `USAGE-reference.md` 同一層（優先序見 `AGENTS.md`「怎麼用這份檔」）。

## 1. 什麼時候用

| 時機 | 看什麼 | 誰看 |
|---|---|---|
| 定稿自查（`auto-edit-review` 流程 A，停點 ④ 之前） | §2 全部、§3 第 1–3 步 | 主代理；8 段以上可以分給 verifier（選用） |
| 回饋輪收尾（流程 B） | 只看改到的段 | 主代理 |
| 交付前（`auto-edit-deliver`） | §3 第 4 步、§5 | 主代理 |

## 2. 審查門檻

| 項目 | 門檻 | 怎麼量 | 等級 |
|---|---|---|---|
| 擋臉、壓手勢 | 卡片或字幕蓋到講者的臉、手勢會到的範圍 | `review-beats.jpg` 每段中間那格；`--check` 的「大約會蓋到講者框 N%」 | P0 |
| 字被切、撐破 | 文字被切掉、超出卡片、斷在詞中間 | `review-beats.jpg`、`review-phone.jpg`；有 custom 段跑 `node shared/template/tools/audit.mjs --project projects/<專案>` | P0 |
| 沒有畫面 | 照 style.md「審查門檻」的「沒有畫面」 | `node shared/template/tools/build.mjs --project projects/<專案> --check` 的「沒有畫面的區間」與「只有聲音」那幾行 | P0 |
| 講者小窗 | 子母畫面一定有講者小窗；只有純聲音素材的區間才沒有（AGENTS.md「剪好看」硬規則） | `--check --json` 子母畫面段的 `pip` 不是空的；`review-beats.jpg` 子母畫面段的右下角；`qc.mjs final` 的「沒有講者小窗」。空的先跑 `media.mjs verify-rough`（初剪全黑段），不要改版面 | P0 |
| 字幕 | 照 style.md「審查門檻」的「字幕」 | `review-beats.jpg` 底部；`--check` 的「超過 18 字」；對嘴請使用者在 Studio 看 | P0 |
| 閃動 | 照 style.md「審查門檻」的「閃動」「講者閃一下」 | `review-seam-NN.jpg`（每個接縫前後幾格）；`--check` 的「講者會閃一下」 | P1 |
| 停留 | 照 style.md「審查門檻」的「停留」 | `--check` 的「到退場只停」⚠；`qc.mjs storyboard` 的「完成態」截圖；custom 段看 audit 的「完成態停太短」「最後一幕太短」（量的是兩個 `P.at` 綁句點之間畫面最長的一段靜止，拍前就開始的動作算到它結束為止） | P1 |
| 版面細節（custom） | 照 USAGE-reference.md R8 #6 | audit 的「間距不足」「區塊重疊」「內距不足」「行高不足」「右側空白過多」「nowrap 餘裕不足」；內距差 ≤ 2px 不報、svg 線稿與連接線不算區塊（線壓到字要自己看截圖） | P2 |
| 同步 | 照 style.md「審查門檻」的「同步」；卡片主文字、每條項目、每個動畫站綁 `#N@詞` | `--check` 的「文字對時」（✖ 全修、⚠ 逐項說明；custom 段看 audit 的「綁句對不上」）；觀影總表格下的「時間｜段 id｜字幕」 | P1（「文字對時」✖ 是 P0） |
| 綁句對不上（custom） | custom 的 `P.at('#N')`、`P.at('#N@詞')` 那一拍出現的字（站名、項目），在這段的另一句才講到（數字、英文整個詞比，中文取 2–4 字；刪除線、底線、位移不算出現；找不到不報） | audit 的 `⚠ 綁句對不上`；照 → 改成 `P.at('#M@詞')`（USAGE-reference.md R8 #18） | P1 |
| 畫面沒有變化（custom） | custom 段裡連續 > 6 秒沒有任何動作（進場、點亮、焦點切換、描線、數字變化、位移都算動作），而那段時間有字幕句在講 | audit 的 `⚠ 畫面沒有變化：…（口播 #N–#M 在講；上限 6s）`；照 → 在那句補一拍 `P.at('#K@詞')`，或從那句拆成兩段（USAGE-reference.md R8 #21） | P1 |
| 章節角標 | 疊加、半畫面時右上角有章節角標，一直留到下一章；子母畫面、全幕時隱藏 | `review-beats.jpg`、觀影總表；角標不見了不要在 plan.json 補 `chtag`，回報給使用者 | P1 |
| 音效 | 照 style.md「審查門檻」的「音效」 | build 印的「音效次數」「音效密度」「音效比例」與 ⚠ | P1 |
| 靜止 | 照 style.md「審查門檻」的「靜止」 | `work/observe/index.md` 的「靜止區間」 | P2（口播在講新東西時升 P1） |
| 其他觀感 | 顏色、對齊、留白 | 截圖 | P2 |

## 3. 觀影 pass（照順序）

1. `(cd projects/<專案>/work/hyperframes && npx hyperframes snapshot --review)`：先看 `review-beats.jpg`（每段至少兩格；段起點那格還在進場，**判斷版面看段中間那格**），再看 `review-seam-NN.jpg`、`review-phone.jpg`（USAGE.md 2.5）。
2. 每段一列 PASS／FAIL（§4 的表）。FAIL 的修好後只重看那幾段。
3. 停點 ③ 之後改過條列或錄影標註的段，跑 `node shared/template/tools/qc.mjs storyboard --project projects/<專案>`，看那段的完成態截圖。
4. 有 mp4 之後（測試片段、`output/final.mp4`）照下面「觀影總表」做。

- `qc.mjs storyboard` 或 `qc.mjs final` 印 `✖ s21 是全畫面清單卻沒有講者小窗：work/rough.mp4 在 1:56.14–2:33.51 是全黑（原始素材不是）→ 初剪壞了，跑 node shared/template/tools/media.mjs verify-rough --project projects/<專案> 照它印的做`：不是版面的問題，不要改 plan.json；照 → 重做初剪，再 build、再截圖。專案有 `assets/voice/` 的旁白時不會報（全黑本來就是旁白區間）。
- `qc.mjs observe` 的 `work/observe/index.md`「總表」多一欄「小窗（子母畫面段）」：那張總表裡每個該有小窗的段寫 `有`／`無`／`部分（m:ss.s 起沒有）`（照 `--check --json` 判，不用看圖）。看到 `無`、`部分` 就跑 `qc.mjs final` 看原因。
- 測試片段（`--offset` > 0）的總表：起點在片段之前的段不標 id，並印 `⚠ <id> 在 m:ss.s 就開始了，測試片段不含這段`。要看那段，把 `build --test` 的起點改成它印的秒數。

### 觀影總表（交付前整片看一遍）

1. `node shared/template/tools/qc.mjs observe --project projects/<專案>`（只重看一段：加 `--from 60 --to 120`，單位是成片秒數；測試片段加 `--file projects/<專案>/output/test-clips/test-clip.mp4 --offset <起點>`）。
2. 依序看 `work/observe/sheet-NN.jpg`：每張 6×8 格＝24 秒、每格 0.5 秒；格下是 `時間｜段落編號｜字幕`。找：字幕和畫面對不上、卡片壓臉、文字被切、版面突然空掉、錄影停格。
3. 看 `work/observe/seam-NN.jpg`：每個段落接縫從前 0.5 秒到後 0.2 秒、每 0.1 秒一格。找：閃一格黑、卡片殘影、跳格。
4. 有情境動畫或 v2 字卡時看 `work/observe/beat-NN.jpg`（和分鏡截圖同一套拍點時刻、從成片抽格）：對照 `work/storyboard.md` 的動畫分鏡，每一拍該出現的東西有沒有在那一刻出現、焦點在不在對的元素上。
5. `index.md` 的「靜止區間」是連續 8 秒以上幾乎沒變的地方：對照口播決定要不要補畫面（換段、加標註或情境動畫），刻意留白就寫理由。
6. 每個問題一行：`[P0／P1／P2] m:ss.s（段落編號） 問題｜證據（sheet-02.jpg 第 3 列第 5 格）｜修法`。

## 4. 回報格式

每段一列：

```
| 段 | 結果 | 問題 | 截圖 |
|---|---|---|---|
| s01 | PASS | — | beat-01-at-6.2.png |
| s04 | FAIL | 第 3 條斷在「逐字//稿」中間 | beat-04-at-35.1.png |
```

每個問題一行：

```
[P0] 0:35.1（s04）條列第 3 條斷在詞中間｜beat-04-at-35.1.png｜改 // 的位置
```

最後一段「我確認沒問題的部分」：列出看過、PASS 的段範圍。子代理的回報最多 25 行。

| 等級 | 包含 | 處理 |
|---|---|---|
| P0 | 擋臉、字被切或撐破、沒有畫面、子母畫面沒有講者小窗、「文字對時」✖、字幕錯字或對不上嘴 | 一定修好才進停點 ④ |
| P1 | 停留、同步、閃動、音效密度 | 修；刻意保留就在回報寫理由 |
| P2 | 其他觀感、靜止（口播沒講新東西時） | 列給使用者決定 |

## 5. 交付前驗收清單

- [ ] `node shared/template/tools/build.mjs --project projects/<專案> --check`：0 個 ✖（含「文字對時」）；子母畫面段的 `pip` 都不是空的
- [ ] 有 custom 段：`node shared/template/tools/audit.mjs --project projects/<專案>`：0 個 ✖
- [ ] `snapshot --review` 看過，每段 PASS
- [ ] 測試片段有音軌（ffprobe）
- [ ] 觀影總表看過（`qc.mjs observe`）
- [ ] `node shared/template/tools/qc.mjs final --project projects/<專案>`：0 個 ✖（沒有「沒有講者小窗」的 ✖）；每個 ⚠ 都寫了「刻意」或「要修」
- [ ] 這一輪的 `work/feedback/r<N>.md` 四節都寫完（有回饋輪時）
