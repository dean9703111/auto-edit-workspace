---
name: auto-edit-storyboard
description: 剪好看的前半：講者調光瘦臉、素材盤點、構圖台拖框（停點 ②）、量講者框、分章寫分鏡草稿（長片一章一個子代理）、提名與設計內容設計動畫、工具產生分鏡表（停點 ③）。當使用者說「剪好看」「做出完成影片」「包裝成完成影片」「列分鏡表」時使用。還沒有 work/rough.mp4 時不要用（改用 auto-edit-rough）；分鏡表已經確認、要做動畫或看完成影片預覽時不要用（改用 auto-edit-motion、auto-edit-review）。
version: 0.2.0
---
# 剪好看（前半）：構圖到分鏡表

規則在 AGENTS.md；本檔只寫這一階段的指令、判準、停點、退路。
衝突時：使用者當下的話 > AGENTS.md > shared/style.md > USAGE.md > USAGE-reference.md > 本 Skill；派工時派工訊息 > 本 Skill。

| 輸入 | 指令 | 產出 | 完成判準 | 停點 |
|---|---|---|---|---|
| `work/rough.mp4`、`work/rough.srt` | 步驟 1–3 | `work/media/notes/`（有素材時）、`work/構圖預覽.jpg`、構圖台網址 | 網址與建議那一行已貼 | ② 構圖 |
| ② 通過 | 步驟 4–7 | `work/分鏡素材/`、`work/drafts/`、`work/designs/`、`plan.json` 的 scenes、`work/storyboard.md` | 分鏡表由工具產生、`--check` 0 個 ✖ | ③ 分鏡表 |
| ③ 通過 | 步驟 8 | plan.json 套好使用者的修改 | 印出下一步 | — |

**先記住三條**：查規格先看 `work/分鏡素材/`，沒有才照它最後一節讀那幾行，不要整份讀 USAGE、SITUATIONS、BEATS。秒數 build 自己算，寫 `#N@詞` 就好，不要查 `transcript.json`、不要寫 script。分鏡表由工具產生，不要手寫。

## 畫面的三條路與硬規則

省下來的時間都花在第 2 條。

| 路 | 什麼時候 | 怎麼做 |
|---|---|---|
| 1. 錄影、圖片 | 有對得上講解的素材 | media 段（`auto-edit-screen`） |
| 2. **內容設計動畫** | 故事、比喻、因果轉折、抽象道理、最想讓人記住的畫面。**每 2 分鐘至少 1 段（建議初值）** | 設計師子代理從內容出發：先寫鏡位腳本，③ 確認後從空白畫布做。**不參考、不複製模板畫面** |
| 3. 模板 | 條列、流程、數字、字卡 | plan.json 寫 `template`／`scene`＋`slots`，工具直接產出，不用改 HTML、不用工人 |

- 構圖定之前不做分鏡；卡片和字幕不擋臉和手勢；「只有聲音」的區間一定被 media 段或不透明全幕蓋住（找不到對得上的素材，就做不透明的全幕動畫）。
- 章節角標由 build 自動常駐；沒有 01 的短片，章節起點是那一章的 02 段；講稿有 `###` 小節由 `--merge-drafts` 自動寫 `sections`。
- 子母畫面一定有講者小視窗；只有純聲音素材的區間才沒有，那些全畫面段 build 自動換全寬版型（沒有講者的句子列在 `chNN.md` 開頭，不能放字卡 06–15）。`--check` 印子母畫面的 `pip` 有空的，先跑 `media.mjs verify-rough`，不要改版面繞過去。
- 卡片主文字、每條項目、每個動畫站的出現時間＝講到那個詞的時間：綁 `#N@詞`，差 ≤ 0.5 秒。`--merge-drafts`、`--apply-storyboard` 寫完 plan.json 會自動跑 `build.mjs --autofix`，把文字對時、小重疊、清單第一項比標題早、≤ 3 秒的空檔、停留太短、音效太密這幾種工具知道答案的 ⚠／✖ 直接改好（印「自動修好 N 處」）；`--check` 剩下的「文字對時」✖ 全修、⚠ 逐項說明。
- 音效只用 `shared/sfx/`，不下載素材、不登入第三方服務；回報貼 build 印的「人聲響度…」「音效比例…」「剪接點微淡化…」「講者調光…」「講者瘦臉…」「結尾配樂…」六行（`--review` 會印），「音效稀疏」⚠ 照它列的段補到沒有。
- 調光由 build 套；瘦臉要跑 `look.mjs run`。
- 構圖：構圖台拖框，最多放大 2 倍；建議框＝1.0／1.15／1.3 裡不切到手勢、每個像素放大 ≤ 3.5 倍的最大的；直式另看頭頂 y 380–520、下巴 ≤ 860。

## 開始前

| 條件（看得到的事實） | 做法 |
|---|---|
| 沒有 `work/rough.srt` | 改用 `auto-edit-rough` |
| 只有聲音，沒有真人錄影（`status.mjs` 的主軌種類） | 跳過步驟 3 和 `qc.mjs speaker`：沒有講者，不需要構圖 |
| plan.json 已有 `frame`，停點紀錄 ② 是「通過」 | 跳過步驟 1–3 |
| 停點紀錄最後一列是 ② 或 ③「待回覆」 | 不重做；照「停點」那張表處理使用者的回覆 |
| 使用者說「快速初稿」「先出初稿」「動畫之後再做」 | 派工時加一句「這次不提名內容設計動畫，全用模板」；回報第一行寫「快速初稿」，停點 ④ 列出值得補設計的段；使用者說「s05 做動畫」走 `auto-edit-review` 流程 D |

## 步驟

**1. 講者調光＋瘦臉**（構圖台要看套好的樣子；只有聲音就跳過）

```
node shared/template/tools/look.mjs status --project projects/<專案>
```

照「→ 下一步」做：那一行是說明，最後一行就是要跑的指令。預估超過 2 分鐘時最後一行的 `look.mjs run` 已經帶 `--background`。
完成判準：`status` 的「→ 下一步」說 look 好了；有瘦臉時 `work/look-preview.jpg` 存在。
常見錯誤：臉太小、偵測率太低印 ⚠ → 工具已自動只調光，回報時說明就好。

**2. 素材盤點**（`assets/screen/`、`assets/images/` 有檔案才做；不用等使用者）

```
node shared/template/tools/media.mjs scan --project projects/<專案>
```

`media.mjs prep` 跑過就已經有 `work/media/index.md`，不用重掃。每支錄影、每批圖片（12 張一頁）派一個子代理看那支的 `work/media/<檔名>/events.md` 和 sheet、寫筆記 `work/media/notes/<檔名>.json`，同一則回覆一次派出（`auto-edit-screen` 步驟 1）。之後分章寫草稿時就知道素材能配哪裡，不用再看一次。
完成判準：每支錄影、每批圖片都有筆記。
常見錯誤：沒有子代理 → 自己一支一支寫；素材很多就先寫跟講稿有關的。

**3. 構圖台 → 停點 ②**（只有聲音就跳過）

```
node shared/template/tools/qc.mjs framing --project projects/<專案>
node shared/template/tools/editor.mjs --project projects/<專案>
```

把「構圖台」網址、`work/look-preview.jpg`（有的話）和「建議：…」那一行給使用者。記 `status.mjs --mark "② 構圖" --state 待回覆`。
完成判準：`work/構圖預覽.jpg` 存在；網址與「建議：…」原文已貼。
常見錯誤：印 `建議：1.13x（每個倍率都標了切到手勢或放大超過 3.5 倍…）` → 照建議給表上最小的那一列，回報說明。

**4. ② 通過：講者框、分鏡素材**

```
node shared/template/tools/qc.mjs speaker --project projects/<專案> --write
node shared/template/tools/build.mjs --project projects/<專案> --scaffold
```

「調好了」：構圖台已寫好 `frame`，不要再改；「用建議的」：先跑 `node shared/template/tools/qc.mjs framing --project projects/<專案> --write`。第 1 行把建議框寫進 `speakerBox`（已含手勢範圍，不用開圖確認）；之後拼圖看到卡片擋到手勢或臉，才照 `work/場地照-動作範圍.jpg` 改（USAGE.md 2.2）。第 2 行產生 `work/分鏡素材/`，順便在背景先處理底片。
完成判準：plan.json 有 `speakerBox`；`work/分鏡素材/共用.md` 存在。
常見錯誤：`8 格之間幾乎沒有動作` → 講者沒入鏡或只有聲音：只有聲音就跳過 speaker；有人就看 8 格總表手動框。

**5. 分章寫草稿**

```
node shared/template/tools/build.mjs --project projects/<專案> --merge-drafts
```

影片 5 分鐘以上先派一個導演寫視覺語言（`references/director.md`），回來再派分章。`--scaffold` 切了幾份就派幾個子代理（派工照 `references/chapter-worker.md`），**同一則回覆一次全部派出**，一次最多 4 個，超過就分批；只有 1 份就自己寫。子代理各寫 `work/drafts/chNN.json`、各自驗過。全部回來才跑上面這條合併。整集看一次：開場三拍、前後呼應、判決句（`SITUATIONS.md` §6），要改就改那一份草稿再合併。
完成判準：`--merge-drafts` 印「通過」；內容設計動畫達到建議數量（每 2 分鐘至少 1 段，品質靠這些段），不夠就回頭請那幾章提名。
常見錯誤：`✖ …` → 照 → 改那一份 `work/drafts/chNN.json`，再合併；不要直接改 plan.json 的 scenes，下次合併會蓋掉。

**6. 內容設計動畫：鏡位腳本**（有提名才做）

```
ls projects/<專案>/work/briefs/
```

每段派一個設計師子代理，同一則回覆一次全部派出（派工照 `.agents/skills/auto-edit-motion/references/design-script.md`「」）。他們從內容出發寫 `work/designs/<段>.md`：這段真正要傳達什麼、用什麼畫面、每句話對應什麼。**這不是套模板**，不要叫他們參考模板。
完成判準：每個提名的段都有 `work/designs/<段>.md`，表頭一字不差。
常見錯誤：概念讀起來像「標題＋幾條文字」→ 退回：那是模板的事，要有具體的場景或比喻。

**7. 產生分鏡表 → 停點 ③**

```
node shared/template/tools/build.mjs --project projects/<專案> --storyboard
```

一條做完：build、截圖、寫 `work/storyboard.md`、開分鏡表頁、記停點，最後印停點 ③ 那一行（照抄）。模板動畫在這裡就是真實內容；內容設計動畫是占位畫面＋鏡位腳本，確認後才做。
完成判準：印出停點 ③ 那一行；✖ 0 個。
常見錯誤：`✖ work/storyboard.md 在上次產生之後有人改過` → 先跑步驟 8 把改動套回去；`✖ <id> 是全畫面清單卻沒有講者小視窗…初剪壞了` → 不要改 plan.json，照 → 跑 `verify-rough` 重做初剪。

**8. ③ 回覆：套回修改**

```
node shared/template/tools/build.mjs --project projects/<專案> --apply-storyboard --said "使用者原話"
```

把網頁改的字、音效、金句勾選套回 plan.json，只動改到的欄位。有「想換成」「補充說明」時工具會列出來、不記通過：照要求改那幾段（換情境改那段的 `template`／`scene`／`slots`；內容設計動畫改 `work/designs/<段>.md`），再跑 `--storyboard --only <段,段>` 重截、重貼停點 ③。
完成判準：沒有要求時，停點紀錄加了 ③ 通過，印出下一步。
常見錯誤：`⚠ …畫面文字有 N 則，plan.json 有 M 個欄位` → 文字結構被改了，照分鏡表手動改 plan.json 那一段。

## 停點

```
⏸ 停點 ② 構圖｜請看：<構圖台網址>、work/look-preview.jpg｜請回：拖好框說「調好了」（會自動存），或說「用建議的」
⏸ 停點 ③ 分鏡表｜請看：<分鏡表網址>｜請回：改好後說「可以」，或要改的地方
```

| 停點 | 使用者回 | 做什麼 |
|---|---|---|
| ② | 「調好了」；倍率數字（例「1.15」）；說要改調光、瘦臉 | 「調好了」：跑 `look.mjs status` 照「→ 下一步」做 → 步驟 4。倍率數字：寫 `frame` → 步驟 4。改調光瘦臉：照 USAGE.md 第 7 節寫 plan.json 的 `look`，改了 `slim` 要再跑 `look.mjs run`；記 `status.mjs --mark "② 構圖" --state 通過 --said "…"` |
| ③ | 「可以」「改好了」 | 步驟 8 |
| ③ | 「s05 換成側邊欄」這類指名修改 | 改 plan.json 那一段（情境換了照新情境寫 slots），跑 `--storyboard --only s05` → 重貼停點 ③ |
| ③ | 改鏡位（「d0305 拍 3 不要預覽態」） | 改 `work/designs/d0305.md`，跑 `--storyboard --only d0305` → 重貼停點 ③（動畫在 ③ 之後才做，不用重截） |

## 自我核對

- [ ] 停點 ② 之前沒寫分鏡；`frame` 寫對（1.0 倍不寫）；plan.json 有 speakerBox
- [ ] 只有聲音的區間都被蓋住；子母畫面段的 `pip` 都不是空的
- [ ] 內容設計動畫有達到建議數量，提名的是真的值得設計的時刻
- [ ] 模板動畫段都是填資料（`template`＋`slots`），沒有手改 HTML
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
| 工具呼叫超過預算 | 停下來回報卡在哪 | — |

## 工具呼叫預算

到停點 ② 最多 6 次；② 之後：量講者框 3 次、每份草稿 15 次（子代理）、主代理合併到停點 ③ 10 次、每段鏡位腳本 6 次（子代理）。超過就停下來回報卡在哪。

## 回報格式

```
（停點 ②）構圖台開好了：建議 <倍率>x（<qc 印的理由>）
講者調光瘦臉：<look.mjs 印的設定一行，或「略過」>；素材盤點：<N 支錄影、M 張圖>
<停點 ② 那一行原文>

（停點 ③）分鏡表好了：<N> 段（模板 <N>、內容設計動畫 <N>、media <N>），金句候選 <N> 則
內容設計動畫：<段>：<概念一句話>（每段一行，最多 5 段，其他看分鏡表）
驗證：build --check → ✖ 0、⚠ <N>（自動修好 <N> 處）；沒有畫面的區間：<無／列出>
要你決定：<1–3 條；結尾配樂一定列>
<停點 ③ 那一行原文>
```

## 什麼時候讀 references/

- `references/director.md`：你是導演時才讀。
- `references/chapter-worker.md`：你是寫分章草稿的子代理時才讀（主代理派工不用讀，工具會印派工訊息）。
