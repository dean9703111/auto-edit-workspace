---
name: auto-edit-storyboard
description: 剪好看的前半：講者調光瘦臉、素材盤點、構圖台拖框（停點 ②）、量講者框、分章先寫語意地圖再寫分鏡草稿（長片一章一個子代理，主代理全片校正）、標內容設計動畫候選、工具產生分鏡表（停點 ③）。當使用者說「剪好看」「做出完成影片」「包裝成完成影片」「列分鏡表」時使用。還沒有 work/rough.mp4 時不要用（改用 auto-edit-rough）；分鏡表已經確認、要做動畫或看完成影片預覽時不要用（改用 auto-edit-motion、auto-edit-review）。
version: 0.2.0
---
# 剪好看（前半）：構圖到分鏡表

規則在 AGENTS.md；本檔只寫這一階段的指令、判準、停點、退路。
衝突時：使用者當下的話 > AGENTS.md > shared/style.md > USAGE.md > USAGE-reference.md > 本 Skill；派工時派工訊息 > 本 Skill。

| 輸入 | 指令 | 產出 | 完成判準 | 停點 |
|---|---|---|---|---|
| `work/rough.mp4`、`work/rough.srt` | 步驟 1–3 | `work/media/notes/`（有素材時）、`work/構圖預覽.jpg`、構圖台網址 | 網址與建議那一行已貼 | ② 構圖 |
| ② 通過 | 步驟 4–7 | `work/分鏡素材/`、`work/drafts/`、`plan.json` 的 scenes、`work/storyboard.md` | 分鏡表由工具產生、`--check` 0 個 ✖ | ③ 分鏡表 |
| ③ 通過 | 步驟 8 | plan.json 套好使用者的修改 | 印出下一步 | — |

工具會印「→ 下一步」和要派工的那一行，照它做；分鏡表由工具產生，不手寫；秒數工具算。這一階段要你判斷的是：全片校正語意地圖、貼停點 ③ 之前看開場和結尾（都在步驟 5），以及使用者在停點的回覆怎麼處理（「停點」那張表）。

版面節奏由工具排（`--map` 印「版面安排」：開頭 30 秒字卡、子母畫面一次連續 ≥ 45 秒、半螢幕 ≥ 15 秒），大綱不合 `--outline` 會 ✖；`--check` 印的「講者位置：左／中／右」決定字卡和半螢幕面板靠哪一邊，給使用者看分鏡表時提一句。

畫面有三條路：對得上的錄影或圖片（media 段）、模板（工具直接產出）、內容設計動畫（地圖上的 A 先套模板、標成候選；預設不做，使用者在 ③ 勾了、或看完預覽說「<段> 重新設計」，才由設計師從空白畫布做）。「音效稀疏」⚠ 和 build 印的六行（人聲響度、音效比例…）到停點 ④ 才處理，這一階段不補、不貼。

## 開始前

| 條件（看得到的事實） | 做法 |
|---|---|
| 沒有 `work/rough.srt` | 改用 `auto-edit-rough` |
| 只有聲音，沒有真人錄影（`status.mjs` 的主軌種類） | 跳過步驟 3 和步驟 4 的第 1、2 行（記 ②、`qc.mjs speaker`）：沒有講者，不需要構圖 |
| plan.json 有 `speakerBox`，或停點紀錄 ② 是「通過」 | 跳過步驟 1–3 |
| 停點紀錄最後一列是 ② 或 ③「待回覆」 | 不重做；照「停點」那張表處理使用者的回覆 |
| 使用者說「快速初稿」「先出初稿」「動畫之後再做」 | 派工時加一句「這次不標內容設計動畫候選，全用模板」；回報第一行寫「快速初稿」，停點 ④ 列出值得補設計的段；使用者說「s05 做動畫」走 `auto-edit-review` 流程 D |

## 步驟

**1. 講者調光＋瘦臉**（構圖台要看套好的樣子；只有聲音就跳過）

```
node shared/template/tools/look.mjs status --project projects/<專案>
```

照「→ 下一步」做：那一行是說明，最後一行就是要跑的指令。
完成判準：`status` 的「→ 下一步」說 look 好了；有瘦臉時 `work/look-preview.jpg` 存在。
常見錯誤：臉太小、偵測率太低印 ⚠ → 工具已自動只調光，回報時說明就好。

**2. 素材盤點**（`assets/screen/`、`assets/images/` 有檔案才做，不用等使用者；`work/media/index.md` 已經有就不跑下面這條，直接派子代理）

```
node shared/template/tools/media.mjs scan --project projects/<專案>
```

每支錄影、每批圖片（12 張一頁）派一個子代理寫筆記 `work/media/notes/<檔名>.json`，同一則回覆一次派出（`auto-edit-screen` 步驟 1）；沒有子代理就自己一支一支寫，素材很多先寫跟講稿有關的。之後分章寫草稿時就知道素材能配哪裡。散在專案根目錄的檔不處理（使用者說「分類素材」才動）。
完成判準：每支錄影、每批圖片都有筆記。

**3. 構圖台 → 停點 ②**（只有聲音就跳過）

```
node shared/template/tools/qc.mjs framing --project projects/<專案>
node shared/template/tools/editor.mjs --project projects/<專案>
```

把「構圖台」網址、`work/look-preview.jpg`（有的話）和工具印的「建議：…」那一行原文給使用者。記 `status.mjs --mark "② 構圖" --state 待回覆`。
完成判準：`work/構圖預覽.jpg` 存在；網址與「建議：…」原文已貼。

**4. ② 通過：講者框、分鏡素材**

```
node shared/template/tools/status.mjs --project projects/<專案> --mark "② 構圖" --state 通過 --said "<使用者原話>" --back "plan.json frame"
node shared/template/tools/qc.mjs speaker --project projects/<專案> --write
node shared/template/tools/build.mjs --project projects/<專案> --scaffold
```

停點 ② 的每一種回覆都從第 1 行開始（先記 ② 通過；每種回覆第 1 行之前要先做什麼，看「停點」那張表）。第 2 行量講者框寫進 `speakerBox`（已含手勢範圍，不用開圖確認）。第 3 行產生 `work/分鏡素材/`，順便在背景先處理底片。
完成判準：停點紀錄有 ② 通過；plan.json 有 `speakerBox`；`work/分鏡素材/共用.md` 存在。

**5. 分章寫分鏡：語意地圖 → 全片校正 → 草稿**

```
node shared/template/tools/build.mjs --project projects/<專案> --map-merge
node shared/template/tools/build.mjs --project projects/<專案> --merge-drafts
```

1. **第一回合（語意地圖）**：`--scaffold` 切了幾份就派幾個子代理，派工訊息照它印的那一行，同一則回覆一次全部派出；只有 1 份就自己照 `references/chapter-worker.md` 做。
2. **全片校正**：全部回來才跑第 1 行。你是導演：只讀 `work/分鏡素材/語意地圖.md`、不讀字幕，照 `references/director.md` 挑 A、統一標法、寫視覺語言，再跑同一條到印「語意地圖通過」。
3. **第二回合（草稿）**：照它印的派工（能接續第一回合的子代理就接續）。全部回來才跑第 2 行合併；合併會自動修工具知道答案的問題（印「自動修好 N 處」），通過就接著產生分鏡表、印停點 ③ 那一行。合併有 ✖：照 → 改那一份 `work/drafts/chNN.json` 再合併（不直接改 plan.json 的 scenes，下次合併會蓋掉）；⚠ 回報只寫個數。
4. **貼停點 ③ 之前整集看一次**，只看兩處（`SITUATIONS.md` §6）：第一份草稿開頭幾段的 `story.say` 有沒有開場轉折句、最後一份結尾幾段有沒有回到前面的清單。缺了才改那一份草稿、再合併，最多一輪。

合併印「派一個設計師寫鏡位腳本」才做步驟 6；印了停點 ③ 那一行就跳過步驟 6、7。
完成判準：`--map-merge` 印「語意地圖通過」；`--merge-drafts` 0 個 ✖，最後印停點 ③ 那一行（或印鏡位腳本的派工）。

**6. 內容設計動畫：鏡位腳本**（只有 `--merge-drafts` 印「派一個設計師寫鏡位腳本」才做）

```
ls projects/<專案>/work/briefs/
```

只有使用者事先指名要做的段（plan.json 已經有 `"design": true`）才會走到這裡：每段派一個設計師，派工訊息照合併印的那一行，同一則回覆一次全部派出。一般的候選不在這裡做：使用者在 ③ 勾了，步驟 8 之後才派（腳本＋動畫一次做完）。
完成判準：每段都有 `work/designs/<段>.md`。交回來的概念讀起來像「標題＋幾條文字」就退回重想：要有具體的場景或比喻。

**7. 產生分鏡表 → 停點 ③**

```
node shared/template/tools/build.mjs --project projects/<專案> --storyboard
```

一條做完：build、截圖、寫 `work/storyboard.md`、開分鏡表頁、記停點，最後印停點 ③ 那一行（照抄）。內容設計動畫候選列在分鏡表「需要我決定的事」的勾選表，預設都不勾：使用者說「可以」就全部套模板合成；想一開始就專門設計的段他會自己勾。
完成判準：印出停點 ③ 那一行；✖ 0 個。

**8. ③ 回覆：套回修改**

```
node shared/template/tools/build.mjs --project projects/<專案> --apply-storyboard --said "使用者原話"
```

把網頁改的字、音效、金句勾選套回 plan.json，只動改到的欄位；勾了的候選，工具改成內容設計動畫。工具列出「想換成」「補充說明」時不記通過：照要求改那幾段（換情境改那段的 `template`／`scene`／`slots`；內容設計動畫改 `work/designs/<段>.md`；改 plan.json 一段的做法在 AGENTS.md「工具注意事項」），再跑 `--storyboard --only <段,段>` 重截、重貼停點 ③。
完成判準：沒有要求時，停點紀錄加了 ③ 通過，印出下一步（有勾內容設計動畫時，下一步是派設計師，不再停）。

## 停點

```
⏸ 停點 ② 構圖｜請看 <構圖台網址> 和 work/look-preview.jpg
請回：拖好框說「調好了」（會自動存），或說「用建議的」

⏸ 停點 ③ 分鏡表｜請看 <分鏡表網址>
請回：改好後說「可以」，或要改的地方
```

② 沒有 `work/look-preview.jpg`（沒開調光瘦臉）時，把「、work/look-preview.jpg」拿掉，其他字不動。

| 停點 | 使用者回 | 做什麼 |
|---|---|---|
| ② | 「調好了」；「用建議的」；倍率數字（例「1.15」）；說要改調光、瘦臉 | 每一種都走步驟 4（第 1 行先記 ② 通過）。「調好了」：先跑 `look.mjs status` 照「→ 下一步」做。「用建議的」：先跑 `qc.mjs framing --write`。倍率數字：先寫 `frame`。改調光瘦臉：先照 USAGE.md 第 7 節寫 plan.json 的 `look`，改了 `slim` 要再跑 `look.mjs run` |
| ③ | 「可以」「改好了」 | 步驟 8 |
| ③ | 「s05 換成側邊欄」這類指名修改 | 改 plan.json 那一段（做法見步驟 8；情境換了照新情境寫 slots），跑 `--storyboard --only s05` → 重貼停點 ③ |
| ③ | 改鏡位（「d0305 拍 3 不要預覽態」） | 改 `work/designs/d0305.md`，跑 `--storyboard --only d0305` → 重貼停點 ③（動畫在 ③ 之後才做，截圖是空的畫布；照樣跑這條，分鏡表那一段才會更新） |

## 自我核對

- [ ] 停點 ② 之前沒寫分鏡；② 通過有記；`frame` 寫對（1.0 倍不寫）；plan.json 有 speakerBox
- [ ] 只有聲音的區間都被蓋住；子母畫面段的 `pip` 都不是空的
- [ ] 內容設計動畫候選＝語意地圖上的 A（`--map-merge` 全片挑過、快速初稿不標），標的是真的值得設計的時刻
- [ ] `--merge-drafts`、`--storyboard` 都 0 個 ✖
- [ ] 金句只在候選表，沒有直接排成段

## 退路表

| 症狀（工具原文） | 做法 | 第二次還失敗 |
|---|---|---|
| `資產：✖ 少 N 個檔`、`sha256 不對` | 跑 `node shared/template/tools/look.mjs ensure --download`，再跑一次 `look.mjs status` | 照 `setup/troubleshooting.md`「共用」；還不行就只調光（plan.json `"look": { "slim": 0 }`），回報說明 |
| `✖ …「…」N 字，上限 M` | 縮文案，不改字級 | 換情境 |
| `找不到圖示「…」（…相近：a、b、c）` | 用括號裡的名稱 | 不配圖示 |
| `✖ 文字對時：s07 的 key「…」在 0:28.84 出現，「到電腦」0:34.84（#20）才講到 → beats.keyAt 寫 "#20@到電腦"`（合併時自動修過還剩下的） | 照 → 改那一份草稿，一則一則改完再合併 | 停下來回報那幾則原文 |
| `⚠ #N@詞 有 N 個用字數比例估…` | 照 → 重轉 `work/transcript.json`；「找不到這些詞」就照字幕原文換 2–4 個字的詞 | 回報說明 |
| `✖ 剪輯沒有啟動成功`（editor.mjs） | 讀 log 最後幾行；停點 ③ 的網址改寫 `work/storyboard.md`，請使用者直接改檔 | 照樣停點 ③，回報附 log 原文 |
| `8 格之間幾乎沒有動作`（`qc.mjs speaker`） | 只有聲音就跳過 speaker；有講者就看 8 格總表手動框 | 回報 |
| `✖ work/storyboard.md 在上次產生之後有人改過` | 使用者在網頁改過、還沒回覆：先不要照 → 跑 `--apply-storyboard`（它會記 ③ 通過）；重貼停點 ③ 那一行，等他說「可以」才跑步驟 8 | — |
| `✖ <id> 是全畫面清單卻沒有講者小視窗…初剪壞了`、`--check` 印子母畫面的 `pip` 有空的 | 不改 plan.json、不改版面繞過去；照 → 跑 `media.mjs verify-rough` 重做初剪 | 回報 |
| `⚠ …畫面文字有 N 則，plan.json 有 M 個欄位`（步驟 8） | 文字結構被改了：照分鏡表改 plan.json 那一段 | 回報 |
| `--map-merge` 印 `✖ A … 全片最多 N 段` | 你全片排序，把多的在地圖改成 B，不叫子代理重寫 | — |
| 工具呼叫超過預算 | 停下來回報卡在哪 | — |

## 工具呼叫預算

到停點 ② 最多 6 次；② 之後：量講者框 4 次、主代理全片校正 6 次、合併到停點 ③ 10 次；只有 1 份、主代理自己寫地圖和草稿時另加 20 次。派子代理的呼叫不算。超過就停下來回報卡在哪。分章子代理的上限由工具數：同一份檢查到第 5 次還有 ✖，工具會印「→ 停手」。

## 回報格式

到停點 ②：

```
構圖台開好了：建議 <倍率>x（<qc 印的理由>）
講者調光瘦臉：<look.mjs 印的設定一行，或「略過」>；素材盤點：<N 支錄影、M 張圖>
<停點 ② 那一行原文>
```

到停點 ③：

```
分鏡表好了：<N> 段（模板 <N>、media <N>），內容設計動畫候選 <N> 段，金句候選 <N> 則，情緒點 <N> 個
內容設計動畫：<工具印的「預設都不勾：先全部套模板…」那一句>；候選 <N> 段，看分鏡表
驗證：build --check → ✖ 0、⚠ <N>（自動修好 <N> 處）；沒有畫面的區間：<無／列出>
要你決定：<1–3 條；結尾配樂一定列>
<停點 ③ 那一行原文>
```

## 什麼時候讀 references/

- `references/director.md`：第一回合的地圖全部回來、跑 `--map-merge` 之前讀（主代理當導演）。
- `references/chapter-worker.md`：你是寫分章地圖或草稿的子代理時才讀（主代理派工不用讀，工具會印派工訊息）。
