---
name: auto-edit-storyboard
description: 剪好看的前半：講者調光瘦臉、構圖台拖框（停點 ②）、量講者框、配螢幕錄影、挑情境、寫草稿 plan.json 與分鏡表 work/storyboard.md（附每段截圖與金句候選）。當使用者說「剪好看」「做出完成影片」「包裝成完成影片」「列分鏡表」時使用。還沒有 work/rough.mp4 時不要用（改用 auto-edit-rough）；分鏡表已經確認、要做動畫或看完成影片預覽時不要用（改用 auto-edit-motion、auto-edit-review）。
version: 0.1.0
---
# 剪好看（前半）：構圖到分鏡表

規則在 AGENTS.md；本檔只寫這一階段的指令、判準、停點、退路。
衝突時：使用者當下的話 > AGENTS.md > shared/style.md > USAGE.md > USAGE-reference.md > 本 Skill；派工時派工訊息 > 本 Skill。

| 輸入 | 指令 | 產出 | 完成判準 | 停點 |
|---|---|---|---|---|
| `work/rough.mp4`、`work/rough.srt` | 步驟 1–2 | `work/look-preview.jpg`（有瘦臉時）、`work/構圖預覽.jpg`、構圖台網址 | 網址與建議那一行已貼 | ② 構圖 |
| ② 通過 | 步驟 3–7 | 草稿 plan.json、`work/storyboard.md`、`work/storyboard-preview/` | `--check` 0 個 ✖、每段至少一張截圖 | ③ 分鏡表 |

格式的唯一定義：分鏡表照 `shared/template/USAGE.md` 2.3；版面四個名稱照 `shared/template/SITUATIONS.md` §2。

## 開始前

| 條件（看得到的事實） | 做法 |
|---|---|
| 沒有 `work/rough.srt` | 改用 `auto-edit-rough` |
| plan.json 已有 `frame`，停點紀錄 ② 是「通過」 | 跳過步驟 1–2 |
| 停點紀錄最後一列是 ② 或 ③「待回覆」 | 不重做；照「停點」那張表處理使用者的回覆 |
| 使用者開了 Plan 模式 | 不用 Plan 模式：請使用者離開後再說一次（要寫檔） |

## 步驟

**1. 講者調光＋瘦臉**（構圖台要看套好的樣子）

```
node shared/template/tools/look.mjs status --project projects/<專案>
```

照「→ 下一步」做：那一行是說明，最後一行就是要跑的指令（單獨一行，整行複製執行）。預估超過 2 分鐘時，最後一行的 `look.mjs run` 已經帶 `--background`；之後每 30 秒跑一次 `status`，直到「→ 下一步」說 look 好了。不要自己用 `&`、`nohup`、`Start-Process` 放背景。`status` 只讀，不寫任何檔。
完成判準：`status` 的「→ 下一步」說 look 好了（最後一行變成 `qc.mjs framing …`；plan.json 已經有段落時是 build）；有瘦臉時 `work/look-preview.jpg` 存在。
常見錯誤：臉太小、偵測率太低印 ⚠ → 工具已自動只調光，回報時說明就好；`資產：✖ 少 N 個檔` → 退路表第 1 列。

**2. 構圖台 → 停點 ②**

```
node shared/template/tools/qc.mjs framing --project projects/<專案>
node shared/template/tools/editor.mjs --project projects/<專案>
```

第 1 行量講者動作範圍、算建議的框（約 5–15 秒），第 2 行在背景開剪輯台（已經開著會印網址）。把剪輯台印的「構圖台」網址、`work/look-preview.jpg`（有的話）和「建議：…」那一行給使用者：使用者在構圖台拖框、看右邊套上字幕與字卡的樣子，按「儲存」就寫進 plan.json 的 `frame`（還沒有 plan.json 會新建）。構圖台下面還有講者調光、瘦臉（預設關；打開瘦臉要按「偵測臉部」，在背景跑）和「用這一格當預覽參考圖」（情境庫、風格預覽頁的講者換成使用者自己的畫面），回報裡一句帶到。
構圖台一打開的框就是表上 ✔ 的建議（不切到手勢、每個像素放大不超過 3.5 倍的倍率裡最大的），切到手勢、太糊、直式頭頂不在 y 380–520 或下巴超過 860 會即時標紅。
完成判準：`work/構圖預覽.jpg` 存在；構圖台網址與「建議：…」那一行原文已貼進回覆。
常見錯誤：印 `建議：1.13x（每個倍率都標了切到手勢或放大超過 3.5 倍，選表上最小的；最後由使用者選）` → 照建議給表上最小的那一列（有黑邊時不是 1.00x，1.00x 會露出黑邊），回報裡說明。

**步驟 3–6 先記住這三條**

- 查規格先看 `work/分鏡素材.md`（步驟 4 產生）：字幕編號、章節、情境對照、每種情境的 plan.json 寫法都在裡面；沒有的才照它第 7 節讀那幾行，不要整份讀 USAGE、SITUATIONS、BEATS。
- 秒數 build 自己算：寫 `#N@詞`（字幕原文裡的 2–4 個字）就好，不要查 `transcript.json`、不要寫 script、不要自己算時間。
- `--check` 等 scenes 全部寫完才跑一次，照 ✖ 一次改完，不要一段跑一次。

**3. ② 通過（「調好了」或「用建議的」）：量講者框**（最多 3 次工具呼叫）

```
ffmpeg -v error -ss 5 -i projects/<專案>/work/rough.mp4 -frames:v 1 projects/<專案>/work/場地照.jpg
node shared/template/tools/qc.mjs speaker --project projects/<專案> --write
```

第 1 行只在專案裡沒有檔名含「場地照」的圖時才跑。「調好了」：構圖台已經寫好 `frame`，不要再改；「用建議的」：先把表上 ✔ 那一列的 `frame` 寫進 plan.json 第一層（1.0 倍不寫）。
`--write` 把建議框寫進 plan.json 的 `speakerBox`，已經有的不覆寫。建議框只是起點，一定要看一次 `work/場地照-動作範圍.jpg`：手勢的橘色跑出青框，或下緣壓到桌面倒影，就照圖改（做法 USAGE.md 2.2）；看過沒問題就不用再量。字幕用 `work/rough.srt`，不重新轉錄。

完成判準：plan.json 有 `speakerBox`；`--check` 0 個 ✖、不再印「沒寫 speakerBox」（這時會印「還沒排段落」，是正常的）。
常見錯誤：`--check` 提醒「看起來是用原尺寸截圖的像素量的」→ 改成它附的換算後的框。

**4. 分鏡素材、素材決策**

```
node shared/template/tools/build.mjs --project projects/<專案> --scaffold
```

讀 `work/分鏡素材.md`，看第 1 節的素材與「只有聲音的區間」：

| 條件（看得到的事實） | 做什麼 |
|---|---|
| `assets/screen/` 或 `assets/images/` 有檔案 | 照 `auto-edit-screen` 做（2 支以上可以派 explore 子代理，選用），結果寫進分鏡表的 media 列 |
| 有「只有聲音」的區間 | 同上；那個區間一定要被 media 段或不透明的全幕蓋住。素材裡找不到對得上講解的錄影或圖片時，照步驟 5 做情境判定，改做不透明的全幕情境動畫（介面操作用 `x-ui-mock`；只有聲音的區間沒有講者小視窗，全畫面的段自動換全寬版型，照 `shared/style.md`「全寬」設計：04a 清單寫 `slots.visual` 主視覺），分鏡表那一列寫「沒有對應素材，改做動畫」 |
| 都沒有 | 跳過 |

完成判準：`work/分鏡素材.md` 存在；每個「只有聲音」的區間在分鏡表都有一列寫用哪一段蓋住。
常見錯誤：沒有子代理 → 自己照 `auto-edit-screen` 一支一支做。

**5. 挑情境：情境判定表（必填）**

```
sed -n '<分鏡素材第 4 節第一欄的行號>p' shared/template/SITUATIONS.md
```

要看某一列的「次選」「不要用在」才跑（只讀那一行）。

先填情境判定表（storyboard.md 的「情境判定」節，表頭照 `references/storyboard-template.md`），一段一列，全部照 `work/分鏡素材.md` 第 4 節：

講解在講什麼 → 四題定大類 → 對到哪一列 → 首選 → 為什麼不是動畫。第 ② 題（看得見的東西在動）是「是」就做示意動畫 `x-scene`，畫法先查 `shared/template/BEATS.md` §5.4，句型像流程、條列也一樣。
首選是情境動畫就做動畫；只有不符合 style.md「情境動畫優先」三條判準才退到字卡，「為什麼不是動畫」寫不符合哪一條。連續 2 段以上都是 06／07／12／13 字卡，就回頭查有沒有動畫列。
判定表填完，照 `shared/template/SITUATIONS.md` §6 整集看一次：開場三拍、前後呼應、判決句（蓋章）。講解本來就沒有的不硬湊；有排的在判定表那一段的「首選」寫清楚（例：`x-checklist-2（呼應 s04）`）。
章節段、`sections` 照分鏡素材第 3 節貼（名稱太長照 ⚠ 縮短）；章節角標不用另排（build 自動常駐）；沒有 01 的短片，在章節起點放一段 02（≥ 3.5 秒，R2.2），build 會在那裡自動掃過一次色帶。金句先放候選表讓使用者勾（style.md「字卡文字」），不直接上。資訊卡照 style.md「字卡文字」，有圖示欄位就配（寫進本集圖示表）。

有情境動畫（`x-*`）或 04 家族的段，判定表填完讀 `references/animation-sheets.md` 寫動畫分鏡；示意動畫另有插圖清單；使用者說「快速初稿」也照那份做。

完成判準：判定表每段一列、每欄都有值；首選是情境動畫的段不是 custom 時，「為什麼不是動畫」寫的是三條判準之一；每段都有版面（疊加／半畫面／子母畫面／全幕之一；直式只用疊加／上下分割／全幕，不挑 03、05）、情境 key；主句 8–14 字（style.md「字卡文字」，build 不檢查，自己數：全形 1、半形 0.5）；每段情境動畫都有一張動畫分鏡，表頭和 BEATS.md 一字不差。
常見錯誤：「為什麼不是動畫」寫「字卡比較簡單」「時間不夠」→ 不是判準，改做動畫；版面寫成 overlay、panel → 只用四個名稱；動畫分鏡的動態欄寫「閃一下」「放大很多」→ 換成語彙表的名稱（聚焦、重拍…）；畫廊裡有的元件也寫成「新建 SVG」→ 照判定順序改回「畫廊」；「位置」寫成 `x 160–480` 這種像素 → 改寫排法；字幕還有超過 18 字的 → 照 USAGE.md 2.4（到剪輯台分割，剪輯台會一起重對句號）。

**6. 草稿 plan.json → 檢查 → build → 截圖 → 寫分鏡表 → 停點 ③**

```
node shared/template/tools/build.mjs --project projects/<專案> --check
node shared/template/tools/build.mjs --project projects/<專案>
node shared/template/tools/qc.mjs storyboard --project projects/<專案>
node shared/template/tools/editor.mjs --project projects/<專案>
```

草稿 plan.json 照分鏡素材第 5、6 節寫：直式第一層先寫 `"format": "portrait"`；有 `work/screen-sync.json`（邊錄邊講的螢幕錄影）就先跑 `node shared/template/tools/media.mjs screen-sync --project projects/<專案> --write-plan`，sync 段不用再配也不要改 `in`；段的 `from` 綁這段第一句；卡片主文字、每條項目、每個動畫站綁講到那個詞的 `#N@詞`（哪個欄位改哪個時間點見 USAGE-reference.md R2.8，例：07 重點字卡寫 `"slots": { "key": "一鍵同步" }, "beats": { "keyAt": "#12@同步" }`，不是綁句首的 `#12`）；情境動畫段從 `shared/template/custom/` 複製最接近的範例成 `compositions/x-<名稱>.html` 登記進草稿（`"type": "custom"`），範例原文 build 只 ⚠「還沒做」、不擋，截圖是範例的樣子，要做的內容寫在動畫分鏡。
`--check` 的 ✖ 全部修掉才 build。段尾完成態不到 1.5 秒（印「最後一幕太短」）時，先把這段的 `to` 往後延（不超過下一段起點、最多 0.5 秒）再跑一次；延了還不夠，才列進「需要我決定的事」。
截圖貼法、音效欄、拿不定版面的做法：`references/storyboard-template.md` 開頭。

editor.mjs 印的「分鏡表：<網址>」照抄進停點 ③ 那一行。使用者在網頁能改的只有：畫面上的文字、金句勾選（`☑`）、音效，以及兩個要求欄：`- 想換成：<情境>`（下拉選單）、`- 補充說明：<文字>`（不滿意時寫的）。都存回 `work/storyboard.md`，這份檔仍是唯一的真相。
完成判準：`--check` 的「文字對時」0 個 ✖，⚠ 也照改（不改的在該段「截圖觀察」寫理由）；沒有「#N@詞 有 N 個用字數比例估」的 ⚠；情境動畫段的「動畫分鏡：」⚠（拍序和講解相反、拍在段尾淡出之後、照範例檔頭【D 下限】放不下）照 → 改分鏡表，不改的在那段「需要我決定的事」寫理由；`--check --json` 每個子母畫面段的 `pip` 不是空的；storyboard.md 有 speakerBox、本集圖示表、總覽表（含「章」欄）、情境判定表、每段一節＋截圖＋截圖觀察、需要我決定的事（含金句候選表；`sparkle`、`shine`、`thunder` 超過 style.md「音效」每集上限時列出來讓使用者挑；結尾要不要配樂 `outro` 列一題）；`--check` 報告「沒有畫面的區間」是「無」，或每段都寫了理由；沒有「音效稀疏」⚠（照它括號裡列的段，在情境動畫的結果／壞事那拍或錄影段補 success／alert）。
常見錯誤：印 `✖ s21 是全畫面清單卻沒有講者小視窗：work/rough.mp4 在 …–… 是全黑（原始素材不是）→ 初剪壞了，跑 node shared/template/tools/media.mjs verify-rough …`（或 `--check --json` 子母畫面段的 `pip` 是空的）→ 不是版面的問題，不要改 plan.json；照 → 重做初剪（`auto-edit-rough` 步驟 6），再 build、再截圖；`qc.mjs storyboard` 印 `✖ plan.json 在上次 build 之後改過` → 先 build 再截圖；印 ✖ 找不到 Chrome → `npx hyperframes browser ensure` 再跑一次。

**7. ③ 通過：寫正式 plan.json**

```
node shared/template/tools/build.mjs --project projects/<專案> --check
```

先重新讀 `work/storyboard.md`，以檔案內容為準重寫 plan.json；超過字數上限或違反規則的地方先列給使用者，不要自己改。金句候選只留勾了的。動畫分鏡也以檔案為準（使用者改過的拍照改過的做）。
完成判準：`--check` 0 個 ✖；plan.json 每段 `id` 和 storyboard.md 的段落編號一致。
常見錯誤：有 `"type": "custom"` 的段 → 交 `auto-edit-motion`（附那段確認過的動畫分鏡；2 段以上有子代理工具就一次全部平行派出，派工訊息照 `auto-edit-motion` 的派工範本 worker-brief.md）；沒有 → 交 `auto-edit-review` 流程 A。

## 停點

```
⏸ 停點 ② 構圖｜請看：<構圖台網址>、work/look-preview.jpg｜請回：拖好框按「儲存」後說「調好了」，或說「用建議的」
⏸ 停點 ③ 分鏡表｜請看：<分鏡表網址>｜請回：改好後說「可以」，或要改的地方
```

| 停點 | 使用者回 | 做什麼 |
|---|---|---|
| ② | 「調好了」；倍率數字（例「1.15」）；說要改調光、瘦臉 | 「調好了」：重新讀 plan.json（構圖台已寫 `frame`、`look`），跑 `look.mjs status` 照「→ 下一步」做（瘦臉還在背景跑就先做不用 build 的步驟）→ 步驟 3。倍率數字：寫 `frame` → 步驟 3。用說的改調光瘦臉：照 USAGE.md 第 7 節寫 plan.json 的 `look`，改了 `slim` 要再跑 `look.mjs run`，只改 `color` 跑 `node shared/template/tools/look.mjs preview --project projects/<專案>` 重畫對照圖 |
| ③ | 「可以」「改好了」，重新讀檔後有「想換成」或「補充說明」 | 照那幾段的要求重做（換情境就照新情境的拍型重寫畫面文字與動畫分鏡）、重截那段、刪掉這兩行；「需要我決定的事」的補充說明照回答處理，一樣刪掉；停點紀錄加「修改後重停」→ 重貼停點 ③ |
| ③ | 「可以」「改好了」，重新讀檔後這兩欄都沒有 | 步驟 7（停點紀錄加「通過」後網頁變成只能看） |
| ③ | 「s05 換成側邊欄」這類指名修改 | 改 storyboard.md 那一節＋重截那段（情境換了，照新情境的拍型重寫那段動畫分鏡）→ 重貼停點 ③ |
| ③ | 改動畫分鏡（「x05 拍 3 不要預覽態」） | 照改那張表 → 重貼停點 ③（動畫在 ③ 之後才做，不用重截） |

## 自我核對

- [ ] 停點 ② 之前沒寫分鏡；`frame` 寫對（1.0 倍不寫）；speakerBox 是裁切後的座標
- [ ] 只有聲音的區間都被蓋住；子母畫面段的 `pip` 都不是空的
- [ ] 情境判定表每段一列；首選是情境動畫的都做了動畫，沒做的寫了不符合哪條判準；每段情境動畫有動畫分鏡（表頭照抄、動態只用 BEATS.md 的名稱）；示意動畫段另有插圖清單
- [ ] `--check` 的「文字對時」0 個 ✖，⚠ 逐項說明
- [ ] 版面欄只用四個名稱；總覽表每段有「章」
- [ ] 金句只在候選表，沒有直接進正式 plan.json
- [ ] 每段截圖檔名＝plan.json 的 id
- [ ] 步驟 7 是照重新讀過的 storyboard.md 寫的

## 退路表

| 症狀（工具原文） | 做法 | 第二次還失敗 |
|---|---|---|
| `資產：✖ 少 N 個檔`、`sha256 不對` | 跑 `node shared/template/tools/look.mjs ensure --download`，再跑一次 `look.mjs status` | 照 `setup/troubleshooting.md`「共用」；還不行就只調光（plan.json `"look": { "slim": 0 }`），回報裡說明 |
| `✖ …「…」N 字，上限 M` | 縮文案，不改字級（USAGE.md 4.2，用訊息原文 grep 那一列） | 換情境 |
| `找不到圖示「…」（…相近：a、b、c）` | 用括號裡的名稱 | 不配圖示，分鏡表註明 |
| `anchor「…」不在 #N「…」裡 → 最可能是 #M` | 改成 #M | 停下來回報 |
| `✖ 文字對時：s07 的 key「…」在 0:28.84 出現，「到電腦」0:34.84（#20）才講到 → beats.keyAt 寫 "#20@到電腦"` | 照 → 後面那一句改 plan.json（`beats.<名>`、`slots.<清單>[i].at` 或 `from`），一則一則改完再跑 `--check`；差 0.6–1.5 秒的 ⚠ 也照改 | 停下來回報那幾則原文 |
| `⚠ #N@詞 有 N 個用字數比例估（…）… → 對 rough.mp4 重轉詞級逐字稿：npx hyperframes transcribe …` | 照 → 重轉 `work/transcript.json`（剪乾淨的轉錄指令去掉 `--to srt -o …`）；原因是「找不到這些詞」就照字幕原文換 2–4 個字的詞 | 回報說明 |
| `✖ work/rough.mp4 在 … 是全黑，但素材沒有純聲音檔 → 初剪壞了：跑 … verify-rough …` | 不要改 plan.json 繞過；照訊息跑 `verify-rough`，照它印的重做初剪（`auto-edit-rough` 步驟 6）；rough.mp4 長度變了就重轉字幕 | 停下來回報 |
| `✖ 剪輯沒有啟動成功`（editor.mjs） | 讀它印的 log 最後幾行；停點 ③ 那一行的網址改寫 `work/storyboard.md`，請使用者直接改檔 | 照樣停點 ③，回報附 log 原文 |
| `⚠ chtag：不用寫，角標現在自動常駐 → …` | 刪掉那段的 `"chtag": true` | — |
| 工具呼叫超過預算 | 停下來回報卡在哪 | — |

## 工具呼叫預算

到停點 ② 最多 8 次（不含 `look.mjs status` 的等待）；② 之後到停點 ③ 最多 55 次，其中量講者框最多 3 次、分鏡素材以外查文件最多 5 次（AGENTS.md「階段預算」）。超過就停下來回報卡在哪。

## 回報格式

```
（停點 ②）構圖台開好了：建議 <倍率>x（<qc 印的理由>）
講者調光瘦臉：<look.mjs 印的設定與偵測率一行，或「略過」>
構圖台：<網址>；work/look-preview.jpg
<停點 ② 那一行原文>

（停點 ③）分鏡表草稿好了：<N> 段（疊加 <N>、半畫面 <N>、子母畫面 <N>、全幕 <N>），情境動畫 <N> 段，金句候選 <N> 則
情境判定：首選是動畫 <N> 段，做了 <N> 段，退字卡 <N> 段（理由見 storyboard.md「情境判定」）
動畫分鏡：<N> 張（拍型 A <N>、B <N>…、S <N>；待定 <N>）；插圖清單 <N> 張（新建 SVG <N> 個）
驗證：build --check → ✖ 0、⚠ <N>；文字對時 ✖ 0、⚠ <N>；沒有畫面的區間：<無／列出>
要你決定：<1–3 條；結尾配樂一定列（「結尾要配樂嗎？建議從 #N 起」）>
<停點 ③ 那一行原文>
```

## 什麼時候讀 references/

- `references/storyboard-template.md`：步驟 6 寫 storyboard.md 時才讀。
- `references/animation-sheets.md`：步驟 5 有情境動畫、04 家族的段，或使用者說「快速初稿」時才讀。
