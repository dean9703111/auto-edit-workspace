---
name: auto-edit-rough
description: 把錄影剪乾淨：media.mjs prep 接主軌、轉逐字稿、找 NG、寫剪輯清單到停點 ①；media.mjs rough 剪掉 NG 與停頓、對字幕、記剪接點。當使用者說「剪乾淨」「剪成初剪」「把這支影片的 NG 剪掉」，或 auto-edit-longform 交棒時使用。已經有 work/rough.mp4 又沒有要重剪時不要用（改用 auto-edit-storyboard）。
version: 0.2.0
---
# 剪乾淨（初剪）

規則在 AGENTS.md；本檔只寫這一階段的指令、判準、停點、退路。
衝突時：使用者當下的話 > AGENTS.md > shared/style.md > USAGE.md > USAGE-reference.md > 本 Skill；派工時派工訊息 > 本 Skill。

| 輸入 | 指令 | 產出 | 完成判準 | 停點 |
|---|---|---|---|---|
| `assets/camera/`、`assets/voice/` | 步驟 1 | `work/main.mp4`、`work/transcript-main.json`、`work/cuts.md`、`work/media/`（有素材時）、剪輯清單網址 | 印出停點 ① 那一行 | ① 剪輯清單 |
| ① 通過 | 步驟 2 | `work/rough.mp4`、`work/rough.srt`、`work/transcript.json`、`work/cutpoints.json` | 印出驗證那幾行，verify-rough ✓ | — |
| 初剪完成 | 步驟 3 | `work/摘要.md`（影片摘要，300 字內） | `status.mjs --summary` 印 ✓ | — |

`prep` 和 `rough` 各是一條做完的指令（接主軌、轉逐字稿、找 NG、剪、對字幕、記剪接點都在裡面），會在背景跑：結束碼 75 表示還在跑，再跑一次同一條會接著等。不拆開跑裡面的步驟、不自己算秒數。

NG＝同一句話講了兩次以上，只保留最後一次完整的；講到一半卡住重講的，卡住那次也算。你聽不到聲音：拿不準的列放「待確認」讓使用者試聽，不做音訊分析、比對舊版或拆段重轉。

## 開始前

| 條件（看得到的事實） | 做法 |
|---|---|
| `assets/camera/`、`assets/voice/` 都是空的，專案裡有散落的素材 | 先照 `.agents/skills/auto-edit-longform/references/sort-assets.md` 分類 |
| `work/rough.mp4` 已經存在 | 先問使用者要不要重剪（會蓋掉），要才加 `--again` |
| 停點紀錄最後一列是「① 剪輯清單｜待回覆」 | 不重做；使用者的回覆照下面「停點」那張表處理 |
| 使用者說直式、短影片 | `prep` 加 `--format portrait` |
| 沒有 `講稿.md` | 工具會轉繁體、照標點切成子句；你不用補標點，也不猜內容（AGENTS.md 規則 4） |

## 步驟

**1. 到停點 ①**

```
node shared/template/tools/media.mjs prep --project projects/<專案>
```

一條做完：接主軌（真人＋聲音混用也一樣）、掃素材、轉逐字稿、找 NG、寫 `work/cuts.md`、開剪輯清單頁、記停點。把工具印的「需要你決定」和停點那兩行給使用者。邊錄邊講的錄影：cuts.md 會多一張「等待」表（畫面在等、沒人講話 ≥ 3 秒，預設不勾），勾了就壓成 1.5–4.5 秒的快轉（等待的五分之一），15 秒以上的等待在完成影片會有等待卡和秒針，要講給使用者聽。多支主軌工具會照講稿建議順序，寫在 cuts.md 讓使用者確認。
完成判準：印出停點 ① 那一行；cuts.md 每列有原因，拿不準的在「待確認」（怎麼判斷看 `references/ng-rules.md`）。

**2. ① 通過：初剪、字幕、剪接點**

```
node shared/template/tools/media.mjs rough --project projects/<專案> --said "使用者原話"
```

一條做完：讀 cuts.md、剪掉 NG 與停頓、驗證、對字幕、記剪接點，有邊錄邊講的錄影就同步。以 cuts.md 的「剪」欄為準（使用者在頁面取消的不剪）。
跑完會印「字幕預覽」網址（瀏覽器看字幕疊在畫面上，使用者可以直接改字）：照抄給使用者，不用等他看完，接著做下一步；使用者改過的字幕以他為準（AGENTS.md 規則 10）。
完成判準：印「初剪完成」「srt-align」「剪接點」「驗證」四行，verify-rough ✓。

**3. 寫影片摘要**

讀 `work/rough.srt`（有 `講稿.md` 就讀講稿），寫 `projects/<專案>/work/摘要.md`：這支影片在講什麼。之後生成這一集的背景圖時會參考（構圖台「參考這支影片的重點摘要」，預設勾選，使用者可以取消）。

```markdown
<一到兩句：在講什麼、講給誰聽、語氣（輕鬆、嚴肅、熱血…）>

- <重點>
- <重點>
```

300 字內（不算空白和記號），列點 2–6 個：只留觀眾最該記住的幾件事，不照抄字幕。只寫內容和氛圍，不寫模板、版面或畫面指示。沒有講稿時逐字稿會有錯字，照意思寫正確的詞（產品名、人名拿不準就照字幕原文）。寫完驗：

```
node shared/template/tools/status.mjs --project projects/<專案> --summary
```

完成判準：印 `✓ 摘要：<N> 字`。✖ 照它說的改，再跑一次。

**4. 接下一步**

```
node shared/template/tools/status.mjs --project projects/<專案>
```

照它印的下一條做，不用等使用者再說一次。使用者說「剪乾淨」「繼續」也照 status 接著做到停點 ②。只有使用者說「只要剪乾淨」「剪完先停」「先不要剪好看」才停在初剪回報。
完成判準：交棒給 status 印的那支 Skill，或回報裡寫清楚停在初剪。

## 停點

```
⏸ 停點 ① 剪輯清單｜請看 <剪輯清單網址>
請回：勾好後說「可以」，或要改的列
```

剪輯清單頁（`/cuts`）每列可以試聽，勾＝剪、取消＝保留，勾了就存回 cuts.md 的「剪」欄。

| 使用者回 | 做什麼 |
|---|---|
| 「可以」「清單沒問題，繼續」「改好了」 | 步驟 2 |
| 「第 3 列不要剪」這類指名修改 | 把那一列的「剪」改成 `[ ]`（要剪改 `[x]`）→ 重貼停點 ①（`status.mjs --mark "① 剪輯清單" --state 修改後重停`） |
| 改主軌順序（「聲音檔放最前面」） | `prep --order "檔名1,檔名2" --again` → 重貼停點 ① |
| 有補錄要插進旁白中間 | 檔名後加 `@起-迄` 只取一段，同一支可切成前後兩段：`--order "a.mp4,旁白.mp3@0-577.7,補錄.aac@2.1-32.4,旁白.mp3@603.4-,b.mp4"` |
| 「不用停」 | `prep --skip-stop`（待確認的列不剪） |

## 自我核對

- [ ] 沒有自己拆開跑工具已經串好的步驟
- [ ] 多支主軌的順序在停點 ① 問過
- [ ] verify-rough 印 ✓
- [ ] `work/摘要.md` 寫了，`status.mjs --summary` 印 ✓
- [ ] 回報的每一行都是工具印的原文
- [ ] 沒做波形比對、VAD、拆段重新轉錄

## 退路表

| 症狀（工具原文） | 做法 | 第二次還失敗 |
|---|---|---|
| `⏳ … 還在跑` | 再跑一次同一條指令（會接著等） | — |
| `⚠ 剪掉比例過高` | 把 ⚠ 原文貼給使用者，請他在字幕預覽聽開頭 1 分鐘，照常往下做 | — |
| 使用者說尾音被切 | `node shared/template/tools/media.mjs rough --project projects/<專案> --edit "audio:-26dB" --again` | 還切到改 `-30dB` |
| 使用者說自言自語、小聲的雜音沒剪掉 | 同一條改 `--edit "audio:-16dB" --again` | 回報 |
| plan.json 已經用 `#N` 時字幕改動 ✖ | 同一條加 `--remap-plan` | 回報 |
| `✖ work/rough.mp4 有 N 段黑畫面（共 Ns）原片同位置不黑 → 初剪壞了…` | 照它印的做，不要自己改 ffmpeg 或 auto-editor 參數 | 停下來回報：指令、錯誤原文、已經試過什麼 |
| `✖ 剪輯沒有啟動成功`（editor.mjs） | 讀 log 最後幾行；停點那一行的網址改寫 `work/cuts.md`，請使用者直接改「剪」欄 | 照樣停點 ①，回報附 log 原文 |
| 工具中途 ✖ 又看不懂 | 停下來回報指令、✖ 原文、`work/.jobs/<prep 或 rough>-detail.log` 最後 20 行；不要拆開單獨跑 `media.mjs main`、`ng-scan`、`ng-snap`、`srt-align`、`cutpoints` | — |
| 工具呼叫超過預算 | 停下來回報卡在哪 | — |

## 工具呼叫預算

到停點 ① 最多 4 次；① 之後到回報最多 7 次（含讀字幕、寫摘要、驗摘要）。超過就停下來回報卡在哪。

## 回報格式

停點 ① 貼工具印的這幾行就好，不要另外跑 curl、ffprobe 驗證（剪輯清單頁沒開成功，工具會印 ⚠，網址會換成 `work/cuts.md`）：

```
✓ 剪輯清單：<工具原文>
需要你決定 <N> 項：<工具原文，每項一行；沒有就省略>
<停點 ① 那一行原文>
```

剪完貼工具印的這五行和摘要那一行，最後附初剪的連結（AGENTS.md 規則 6）：

```
初剪完成：原始 <長度>s → 初剪 <長度>s，剪掉 <N> 段
srt-align：<統計原文>；⚠：<原文或「無」>
剪接點 <N> 個：ng <N>、pause <N>
驗證：work/rough.mp4 → <長度>s、<寬>×<高>；verify-rough → ✓
字幕預覽：<網址>
✓ 摘要：<N> 字（<工具原文>）
<deliver-assets><media type="video" src="<工作區的絕對路徑>/projects/<專案>/work/rough.mp4" /></deliver-assets>
```

## 什麼時候讀 references/

- `references/ng-rules.md`：看「待確認」拿不準是不是 NG 時才讀。
