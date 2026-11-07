# 分章寫草稿：子代理的派工與做法

`build.mjs --scaffold` 會把影片切成幾份（有 `##` 章節照章節切，太長再切；沒有章節約每 5 分鐘一份）。**一份派一個子代理，同一則回覆一次全部派出**（一次最多 4 個，超過就分批）。只有 1 份或沒有子代理工具，主代理自己照這份做。

## 派工訊息（`--scaffold` 會印出來，照抄）

```
你負責 projects/<專案> 的分鏡草稿 <chNN>。照 .agents/skills/auto-edit-storyboard/references/chapter-worker.md 做。
```

## 做法

指令都在工作區根目錄跑；下面的 `P` 是 `projects/<專案>`。不要讀 `shared/template/tools/`、`kit/*.js`、其他章的字幕。

1. 讀 `P/work/分鏡素材/共用.md`、自己那份 `P/work/分鏡素材/<chNN>.md`，有 `P/work/分鏡素材/視覺語言.md` 也要讀：裡面指定給這一章的內容設計動畫，id、句號、版面照抄（`"design": true`），不要再多提名。要查什麼用指令，不用開文件：
   - 字卡、模板的寫法：`node shared/template/tools/build.mjs --project P --spec key-point`（欄位、限制、時間下限都有；`--spec x-process`、`--spec "fx 29"` 同樣）
   - 圖示名稱：`node shared/template/tools/build.mjs --project P --icons 手機,雲端`
   - 這幾句逐字稿聽成什麼（挑 `@詞`）：`node shared/template/tools/build.mjs --project P --words 28-41`
2. 一段一段判斷（三條路）：有對得上的素材用 media；值得專門設計的提名內容設計動畫；其他用模板。**連續講同一件事的幾句併成一段**，每段都要有畫面：講者直講的地方也放字卡或動畫，不留空（只有章節角標那段讓講者露臉）。段與段要接起來（這段的 `to` 寫下一段的 `from`），可以切在句中（`"from": "#14@手機畫面"`）。模板放不下時間下限就併句、少一拍，還是放不下換字卡，不要硬塞。
3. 沒有視覺語言時，內容設計動畫要主動提名，目標寫在 `chNN.md`。提名只寫構想（`story.idea`），不用設計細節；設計師之後會做。
4. 寫 `P/work/drafts/<chNN>.json`，`story` 每段都要寫（分鏡表由工具從這裡產生）。
5. 驗這一份：`node shared/template/tools/build.mjs --project P --check-draft <chNN>`。✖ 全修；⚠ 只修一輪，工具印「可以交件」就停。

## 不要做

- 不要查 `transcript.json`、不要自己算秒數：寫 `#N@詞`（字幕原文裡的 2–4 個字），工具算。
- 不要寫 script、不要讀別章的字幕。
- 不要寫 plan.json、storyboard.md：主代理合併，分鏡表由工具產生。
- 金句只放 `quotes`，不要排成段。拿不定的事放 `decide`，不要停下來問。

每份最多 15 次工具呼叫。

## 回報

只回一行：`<chNN> <N> 段｜✖0 ⚠<N>｜內容設計 <N> 段`。拿不定的事放草稿的 `decide`，主代理會收齊。不要寫過程。
