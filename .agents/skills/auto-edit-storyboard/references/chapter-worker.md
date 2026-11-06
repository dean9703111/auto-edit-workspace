# 分章寫草稿：子代理的派工與做法

`build.mjs --scaffold` 會把影片切成幾份（有 `##` 章節照章節切，太長再切；沒有章節約每 5 分鐘一份）。**一份派一個子代理，同一則回覆一次全部派出**（超過 8 份就分批）。只有 1 份或沒有子代理工具，主代理自己照這份做。

## 派工訊息（主代理照抄，換掉 `<…>`）

```
你負責寫一份分鏡草稿：projects/<專案>/work/drafts/<chNN>.json。照 .agents/skills/auto-edit-storyboard/references/chapter-worker.md 做。
先讀：projects/<專案>/work/分鏡素材/共用.md、projects/<專案>/work/分鏡素材/<chNN>.md
```

## 做法

1. 讀 `共用.md` 和自己那份 `chNN.md`。其他文件不用讀；字卡與模板的寫法要用才查（`grep -A7 "<名稱>\*\*" work/分鏡素材/寫法.md`，例 `key-point`、`x-process`），每個都有欄位、限制和時間下限。
2. 一段一段判斷（三條路）：有對得上的素材用 media；值得專門設計的提名內容設計動畫；其他用模板。**連續講同一件事的幾句併成一段**，每段都要有畫面：講者直講的地方也放字卡或動畫，不留空（style.md「連續覆蓋」；只有章節角標那段讓講者露臉）。段與段要接起來（這段的 `to` 寫下一段的 `from`），可以切在句中（`"from": "#14@手機畫面"`）。模板放不下時間下限就併句、少一拍，還是放不下換字卡，不要硬塞。
3. 內容設計動畫要主動提名，目標寫在 `chNN.md`。提名只寫構想，不用設計細節；設計師之後會做。
4. 寫 `work/drafts/<chNN>.json`，`story` 每段都要寫（分鏡表由工具從這裡產生）。
5. 驗這一份：`node shared/template/tools/build.mjs --project projects/<專案> --check-draft work/drafts/<chNN>.json`。✖ 全修，⚠ 照 → 改，改完再跑一次，到 0 ✖ 為止。

## 不要做

- 不要查 `transcript.json`、不要自己算秒數：寫 `#N@詞`（字幕原文裡的 2–4 個字），工具算。
- 不要寫 script、不要讀別章的字幕。
- 不要寫 plan.json、storyboard.md：主代理合併，分鏡表由工具產生。
- 金句只放 `quotes`，不要排成段。拿不定的事放 `decide`，不要停下來問。

每份最多 15 次工具呼叫。

## 回報（最多 8 行）

幾段（字卡／模板動畫／內容設計動畫／media 各幾段）、提名了哪幾段內容設計動畫與一句話構想、`--check-draft` 的結果、`decide` 寫了什麼。
