---
name: auto-edit-review
description: 分鏡表確認後的定稿與審查：build、audit、snapshot 抽查、開 Studio 給使用者看；使用者在 Studio 看完給修改時開回饋輪 rN（先備份 plan.json、記原話與分類）；使用者說「打開剪輯台」「調好了」時開關剪輯台。當分鏡表剛確認完，或使用者說「s05 的金句卡往左移」「這張卡…」「打開剪輯台」「調好了」時使用。還沒有確認分鏡表時不要用（改用 auto-edit-storyboard）；要輸出成片時不要用（改用 auto-edit-deliver）。
version: 0.1.0
---
# 定稿、審查、回饋輪、剪輯台

規則在 AGENTS.md；本檔只寫這一階段的指令、判準、停點、退路。
衝突時：使用者當下的話 > AGENTS.md > shared/style.md > USAGE.md > USAGE-reference.md > 本 Skill；派工時派工訊息 > 本 Skill。

| 輸入 | 指令 | 產出 | 完成判準 | 停點 |
|---|---|---|---|---|
| ③ 通過、情境動畫都做完 | 流程 A | snapshot 截圖、每段 PASS／FAIL 表、Studio 網址 | build 0 個 ✖、audit 0 個 ✖、每段 PASS | ④ Studio 預覽 |
| ④ 的修改 | 流程 B | `work/回饋/r<N>.md`、`work/hyperframes/plan.json.bak-r<N>` | rN.md 四節齊全 | ④ Studio 預覽 |
| 「打開剪輯台」 | 流程 C | 剪輯台網址 | `editor.mjs --status` 印出網址 | ⑤ 剪輯台 |

審查門檻、量法、回報格式的唯一定義：`shared/template/REVIEW.md`（數字照 style.md「審查門檻」）。

## 開始前

| 條件（看得到的事實） | 做法 |
|---|---|
| 停點紀錄 ③ 沒有「通過」 | 改用 `auto-edit-storyboard` |
| plan.json 有 custom 段，對應的 `compositions/x-*.html` 還是範例原文或不存在 | 先照 `auto-edit-motion` 做完 |
| 剪輯台開著（`editor.mjs --status` 有網址） | 改 plan.json 或 rough.srt 前先重新讀檔，不要蓋掉剪輯台存的設定 |

## 步驟

**A1. 檢查與 build**

```
node shared/template/tools/build.mjs --project projects/<專案> --check
node shared/template/tools/build.mjs --project projects/<專案>
```

完成判準：0 個 ✖；build 印的「人聲響度…」「音效比例…」「剪接點微淡化…」三行抄下來，`--check` 的「音效次數」「音效密度」有 ⚠ 也抄；「沒有畫面的區間」是「無」，或每段都有理由。
常見錯誤：`⚠ 這些檔被手改過，沒有覆寫` → 退路表第 1 列。

**A2. 量情境動畫的版面**（plan.json 有 custom 段才做）

```
node shared/template/tools/audit.mjs --project projects/<專案>
```

完成判準：0 個 ✖；每個 ⚠ 照 → 改，或寫保留的理由（直式的 `portrait-window`、`portrait-cam`、`font` 改法見 `shared/style.md`「直式」）。要把結果交給子代理或存檔時，改跑 `node shared/template/tools/audit.mjs --project projects/<專案> --json`（stdout 只有一個 JSON）。
常見錯誤：✖ 在某段 custom → 把那幾行原文交回寫那支的子代理（或自己照 `auto-edit-motion` 步驟 6 改）。

**A3. 抽查截圖**

```
(cd projects/<專案>/work/hyperframes && npx hyperframes snapshot --review)
```

照 REVIEW.md §2 的門檻，每段一列 PASS／FAIL；看圖的順序照 REVIEW.md §3。直式專案多看三件事：文字沒進頂部 y 240 以上、底部 y 1440 以下、右側按鈕列（x 940 以右、y 840–1440）；上下分割的臉沒被字幕壓到；講者面板一直都在。段數 8 段以上可以派 verifier 子代理分段看（選用，派工說明在 `references/reviewer-brief.md`）；沒有子代理就自己看。
完成判準：每段都有 PASS／FAIL；FAIL 的都修好、重跑 A1–A3 只看改到的段。
常見錯誤：看段起點那格判斷版面 → 那格還在進場動畫，看段中間那格（USAGE.md 2.5）。

**A4. 開 Studio → 停點 ④**

```
(cd projects/<專案>/work/hyperframes && npx hyperframes preview --no-open)
```

完成判準：印出網址；回覆附上要使用者確認的卡、提醒「請看字幕有沒有對到嘴」（USAGE.md 2.6）。直式專案上半面板的 host 不要在 Studio 裡拖動或改位置（會蓋掉舞台縮放），要改內容去子合成。
常見錯誤：網址打不開 → 退路表第 3 列。

**B. 回饋輪**（停點 ④ 收到修改時；細節讀 `references/feedback-round.md`）

```
node shared/template/tools/status.mjs --project projects/<專案>
Mac：cp projects/<專案>/work/hyperframes/plan.json projects/<專案>/work/hyperframes/plan.json.bak-r<N>
Windows（PowerShell）：Copy-Item projects\<專案>\work\hyperframes\plan.json projects\<專案>\work\hyperframes\plan.json.bak-r<N>
```

B1 編號 N 用 status 印的「下一輪回饋編號」（工具沒有時：`work/回饋/` 裡 `r*.md` 的最大數字＋1，例：有 r1、r2 → r3）→ B2 重新讀 plan.json（剪輯台可能改過）→ B3 備份（上面兩行擇一）→ B4 寫 `work/回饋/r<N>.md` 的「原話」「分類」→ B5 改 plan.json（「s05」直接找 id；「這張卡」才讀 Studio 選取，USAGE.md 2.6）→ B6 A1–A3 只看改到的段 → B7 寫 rN.md「改了哪幾段」「驗證」→ 停點 ④。
完成判準：`plan.json.bak-r<N>` 存在；rN.md 四節（原話、分類、改了哪幾段、驗證）齊全。
常見錯誤：「規則」類的回饋（例：「以後金句都放左邊」）去改了 `shared/` → 只記在 rN.md 的「建議改規則」，不改 `shared/`。

**C. 剪輯台 → 停點 ⑤**（EDITOR.md 第一部分）

```
node shared/template/tools/editor.mjs --project projects/<專案>
node shared/template/tools/editor.mjs --status --project projects/<專案>
```

第 1 行在背景啟動（工具自己轉背景）；第 2 行確認網址。使用者說「調好了」：重新讀 plan.json 與 rough.srt → 流程 A。
完成判準：`--status` 印出網址；「調好了」之後 build 0 個 ✖。
常見錯誤：使用者在剪輯台改過的文字、斷句、時間被改回去 → 以剪輯台存的為準（AGENTS.md「剪輯台」）。

## 停點

```
⏸ 停點 ④ Studio 預覽｜請看：<Studio 網址>｜請回：要改的段落（例：s05 往左移）或「可以了，輸出成片」
⏸ 停點 ⑤ 剪輯台｜請看：<剪輯台網址>｜請回：調完按「儲存」後說「調好了」
```

| 停點 | 使用者回 | 做什麼 |
|---|---|---|
| ④ | 「s05 的金句卡往左移」這類修改 | 流程 B → 重貼停點 ④ |
| ④ | 「可以了，輸出成片」 | 交 `auto-edit-deliver` |
| ④ | 「打開剪輯台」 | 流程 C |
| ⑤ | 「調好了」 | 重新讀 plan.json 與 rough.srt → 流程 A → 停點 ④ |

## 自我核對

- [ ] build 0 個 ✖；有 custom 段時 audit 0 個 ✖
- [ ] snapshot 每段有 PASS／FAIL
- [ ] 改 plan.json 前有 `plan.json.bak-r<N>`
- [ ] rN.md 四節齊全
- [ ] 沒蓋掉剪輯台存的設定
- [ ] 「規則」類的修改只記在 rN.md，沒改 `shared/`

## 退路表

| 症狀（工具原文） | 做法 | 第二次還失敗 |
|---|---|---|
| `⚠ 這些檔被手改過，沒有覆寫：… → 把改動搬進 plan.json 後加 --force` | 看改了什麼，搬進 plan.json，再加 `--force`（USAGE.md 2.6） | 停下來回報：指令、錯誤原文、已經試過什麼 |
| `"code": "no-selection"` | 請使用者暫停在那張卡、點卡上的字再說一次（USAGE.md 2.6） | 問使用者是第幾秒 |
| Studio 網址打不開 | `(cd projects/<專案>/work/hyperframes && npx hyperframes preview --status)` | 停下來回報 |
| 剪輯台存檔時說檔案被改過 | 請使用者重新載入再調（EDITOR.md） | 停下來回報 |
| audit `✖ … 綁句失敗`、`未定位頂層`、`標題壓到內容` | 把那幾行原文交回寫那支的子代理，或自己照 `auto-edit-motion` 退路表改 | 停下來回報 |
| audit `⚠ … 最後一幕太短：…` | plan.json 這段的 `to` 往後延訊息給的秒數，重跑 build | 回報保留理由 |
| `⚠ 音效密度：…` | 照 → 在 `pop`、`swipe` 那幾段寫 `"sfx": null`，或回報說明保留的理由 | — |
| `✖ 文字對時：… 才講到 → beats.keyAt 寫 "#20@到電腦"`（差 0.6–1.5 秒是 ⚠） | 照 → 後面那一句改 plan.json，一則一則改完再跑 `--check`；⚠ 也照改（欄位表 USAGE-reference.md R2.8） | 停下來回報那幾則原文 |
| `✖ work/rough.mp4 在 … 是全黑，但素材沒有純聲音檔 → 初剪壞了：跑 … verify-rough …` | 不要改 plan.json 繞過；照訊息跑 `verify-rough`，照它印的重做初剪；rough.mp4 長度變了就重轉字幕 | 停下來回報 |
| `⚠ build 會停下來：瘦臉底片不是最新的（…）→ 先跑 … look.mjs run …` | `--check` 只提醒；照它的 → 跑 `look.mjs`，再 build | 停下來回報 |
| 回饋某一項工具呼叫超過 10 次 | 停下來回報那一項卡在哪 | — |

## 工具呼叫預算

流程 A 最多 30 次（不含情境動畫）；回饋輪每一項最多 10 次（AGENTS.md「階段預算」）。超過就停下來回報卡在哪。

## 回報格式

```
（停點 ④）定稿好了：<N> 段，PASS <N>、FAIL 已修 <N>
人聲響度 …（build 原文）
剪接點微淡化 …（build 原文）
音效比例：…（build 原文；有 ⚠ 也貼）
音效次數／音效密度：<有 ⚠ 才貼原文與處理；沒有寫「無 ⚠」>
轉場：…｜主題：…（build 報告最後一行原文；轉場是 build 內建的，plan.json 不用寫）
audit：✖ 0、⚠ <N>（保留的理由一行）
要你確認：<卡 1–3 張>；請看字幕有沒有對到嘴
<停點 ④ 那一行原文，網址照工具印的>
```

回饋輪：多一行 `回饋 r<N>：改了 <段 id…>；驗證 build ✖ 0`，最後一行一樣是停點 ④。

## 什麼時候讀 references/

- `references/feedback-round.md`：流程 B 才讀。
- `references/reviewer-brief.md`：A3 要派 verifier 子代理時才讀。
