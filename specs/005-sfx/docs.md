# 005 sfx：要併進文件的原文（交 001 整合）

- 以下每一節都是「整段取代」的原文；001 併進去時只改格式，不改數字。數字的單一真相：規則數字在 `shared/style.md`（本檔第 1 節），程式常數在 `tools/lib/audio.mjs` 的 `SFX_RULES`、每顆音效在 `kit/sfx.json`，三者由 `dev/tests/sfx.test.mjs` 比對。
- 2026-10-31 定稿（T081）：剪接點量測 0 凹洞，維持 15 ms 微淡化，交叉淡化版已刪；第三批 4 個名稱都上線（`thunder`、`bgm-outro` 先用合成版），表格全部保留。

## 1. `shared/style.md`「## 音效」整段

```markdown
## 音效

只能用 `shared/sfx/` 裡的檔案。build 會依情境自動配，分鏡表的音效欄寫「預設」就好；只有要換、要拿掉、要加點擊、要配結尾配樂，才在 plan.json 寫。

| 事件 | 音效 | 峰值對齊哪一格 | 預設配給哪些情境 | 每集上限 |
|---|---|---|---|---|
| 字卡揭開 | `pop.wav` | 卡片出現那一格 | 05、06、08–13 | — |
| 條列逐條、步驟切換（附加） | `tick.wav` | 每一條出現那一格 | 03、04a–d、05、08、12、13 | — |
| 側邊欄推入、角標滑入 | `swipe.wav` | 面板開始滑入那一格 | 02、03 | — |
| 章節轉場 | `chapter.wav` | 章名落定那一格 | 01 | — |
| 全畫面幕進場、從講者切到螢幕錄影的第一段 | `whoosh.wav` | 全畫面幕蓋滿那一刻 | 04a–d；錄影第一段自己寫 | — |
| 講重點、提醒、答案揭曉 | `ding.wav` | 重點字出現那一格 | 07、09 答案（附加） | — |
| 解法、成果、問題解決 | `success.wav` | 綠勾或結果出現那一格 | 07 `tone: "good"` | — |
| 踩坑、錯誤、限制 | `alert.wav` | 紅章或警告出現那一格 | 07 `tone: "warn"` | — |
| 錄影或動畫裡的游標點擊（附加） | `click.wav` | 游標按下那一格 | 段落寫 `clicks` 才有 | — |
| 入場、介紹主角、金句閃亮 | `sparkle.wav` | 主角或金句出現完成那一格 | 14、15 | 6 次 |
| 轉折亮點：本集最得意的設計、關鍵詞大字 | `shine.wav` | 關鍵詞到位那一格 | 沒有預設，那段寫 `"sfx": "shine"` | 3 次 |
| 負面：壓力、焦慮、晴天霹靂 | `thunder.wav` | 負面問句或壞消息出現那一格 | 15 `tone: "warn"` | 3 次 |
| 蓋章、重擊、數字或金句落定 | `impact.wav` | 落地那一格 | 字卡動態 | — |
| 翻牌 | `flip.wav` | 牌翻到正面那一格 | 字卡動態 | — |
| 打字 | `type.wav` | 第一個字打出來那一格 | 字卡動態 27 | — |
| 故障 | `glitch.wav` | 畫面開始故障那一格 | 字卡動態 34 | — |
| 鋪墊上升 | `riser.wav` | 揭曉那一格（聲音提早約 1.5 秒開始） | 字卡動態 17、18、20、21、37 | — |
| 結尾配樂 | `bgm-outro.wav` | 結語金句講完後那一句的起點 | plan.json 第一層寫 `"outro"` 才有（一集一首） | — |

- 一張卡最多一個主音效
- 兩個主音效相距不到 3 秒時，只留前一個；附加音效（`tick`、`click`、QA 答案的 `ding`）不算
- 每分鐘最多 2 顆主音效（附加音效不算）；超過時 build 會提醒，留最重要的：`chapter`、`thunder`、`shine`、`sparkle`、`alert`、`success` 先留，`pop`、`swipe` 先拿掉（那段寫 `"sfx": null`）
- 音效大小跟作者剪映定稿一樣，但每一顆都要比人聲小至少 3 dB；build 報告的「音效比例」會列出超過的
- 錄影或情境動畫裡**看得到游標按下**的地方，在那段寫 `"clicks": ["+秒數" 或 "#N@詞", …]`，一下一顆；口播說「按下去」但畫面沒有點擊，不寫
- 從講者切到螢幕錄影的第一段寫 `"sfx": "whoosh"`；之後連續的錄影段不配
- 結尾配樂：結語金句講完後，在 plan.json 第一層寫 `"outro": { "from": "#N" }`（N＝收尾那一句），配樂淡入、墊在講話底下、播到片尾；不想配就不寫
- 個別音效太大聲或太小聲，在剪輯台調那一段的音量（plan.json 的 `sfxVolume`，dB）；全部一起調用剪輯台的「音效」（`edit.volume.sfx`，結尾配樂也跟著）
```

## 2. `AGENTS.md`「剪好看」第 5 步整條

```markdown
5. 音效：只用 `shared/sfx/`，照 `shared/style.md` 的音效對照表（事件、對齊哪一格、每集上限）。錄影裡看得到游標按下的地方，在那段寫 `clicks`；結尾要配樂就在 plan.json 寫 `outro`。build 會自動把人聲調到 −14 LUFS，並在剪接點做 15 毫秒的微淡化；回報時把 build 印的「人聲響度…」「音效比例…」「剪接點微淡化…」那三行貼給我；`--check` 的「音效次數」「音效密度」有 ⚠ 也要說。
```

## 3. `shared/template/USAGE.md` §2.8「聲音由 build 處理」那幾條（取代原本 4 條）

```markdown
聲音由 build 處理，回報時把 build 印的這三行貼給使用者：
- 人聲響度：重新編碼底片時，人聲調到 −14 LUFS、true peak ≤ −1 dBTP（YouTube 播放的基準），報告印 `人聲響度 −21.3 LUFS → −14 LUFS（true peak …）`。量測結果有快取，素材沒變就不重量。成片的整體響度會落在 −14 ±1.5，因為音效、插入素材的聲音和結尾配樂也混在裡面。
- 音效比例：每顆音效的大小寫在 `shared/template/kit/sfx.json` 的 `targetDb`（相對人聲的 dB，上限照 `shared/style.md` 音效段）。報告印主音效、附加音效比人聲小幾 dB；有超過上限的會 ⚠，列出段落和要再調低幾 dB → 在剪輯台調那一段的音效音量（`sfxVolume`）。用了 `--no-loudnorm` 時印「沒有檢查」。
- 剪接點：`work/cutpoints.json` 的每個點，重新編碼時前後各淡 15 毫秒，消掉硬切的爆音（量測紀錄：`specs/005-sfx/research.md`，15 毫秒不會在底噪上挖出聽得到的凹洞）；剪輯台 `cuts` 的接點由 HyperFrames 淡 20 毫秒。沒有 `cutpoints.json` 時報告印「剪接點微淡化：略過」，不是錯誤。
- `--check` 最後另外印「音效次數」「音效密度」兩行；有 ⚠（某個音效超過每集上限、某一分鐘主音效太多）就照 → 處理，或在回報裡說明保留的理由。
- 不想要響度與剪接點處理：build 加 `--no-loudnorm` 或 `--no-declick`。
```

（`specs/` 是作者維護用、剪片時不讀；USAGE 裡的「量測紀錄」括號若 001 認為弱模型會去讀 specs/，可以刪掉這個括號。）

## 4. `shared/template/USAGE-reference.md` R5.2 整節

```markdown
### R5.2 音效

音效對準畫面事件，不放句尾。全部由 build 自動配，AI 只在要換、要拿掉、要加點擊、要配結尾配樂時寫。

**18 個音效**：名稱、用途、對齊哪一格、每集上限照 `shared/style.md` 音效段；峰值、預設音量、相對人聲的大小（`targetDb`）在 `shared/template/kit/sfx.json`。`node shared/template/tools/build.mjs --list` 會印出全部。

**情境預設配對**（寫在各情境 `scene.json` 的 `sfx` 區塊）

| 情境 | 主音效＋落點 | 附加音效 |
|---|---|---|
| 01 chapter | `chapter`：章名進場（`titleAt`，段起點後 0.45 秒） | — |
| 02 chapter-tag | `swipe`：進場 | — |
| 03 side-panel | `swipe`：段起點 | `tick`：每一條項目 |
| 04a fs-list | `whoosh`：段起點前 0.15 秒 | `tick`：每一條項目 |
| 04b fs-compare | `whoosh`：段起點前 0.15 秒 | `tick`：左欄進場、右欄進場 |
| 04c fs-flow | `whoosh`：段起點前 0.15 秒 | `tick`：每一個節點 |
| 04d fs-table | `whoosh`：段起點前 0.15 秒 | `tick`：每一列 |
| 05 two-sides | `pop`：第一張卡片 | `tick`：第 2–4 張卡片 |
| 06 concept | `pop`：進場後 0.1 秒 | — |
| 07 key-point | `ding`／`alert`／`success`（依 tone）：進場後 0.15 秒 | — |
| 08 steps | `pop`：進場後 0.1 秒 | `tick`：第 2 步起每一步 |
| 09 qa | `pop`：進場後 0.1 秒 | `ding`：答案進場（音量 ×0.8） |
| 10 tips | `pop`：進場後 0.1 秒 | — |
| 11 summary | `pop`：進場後 0.1 秒 | — |
| 12 keywords | `pop`：第一個詞 | `tick`：第 2 個詞起每一個 |
| 13 title-list | `pop`：進場後 0.1 秒 | `tick`：第 2 條起每一條 |
| 14 speaker | `sparkle`：進場後 0.1 秒 | — |
| 15 quote | `sparkle`（`tone: "warn"` 改 `thunder`）：進場後 0.1 秒 | — |
| media | 不配（從講者切過來的第一段自己寫 `"sfx": "whoosh"`） | `clicks` 每一項一顆 `click` |
| custom | 不配（要就自己寫 `"sfx"`，落點＝段起點） | `clicks` 每一項一顆 `click` |

07 的 tone：`warn`＝`alert`、`good`＝`success`、沒寫＝`ding`。15 的 tone：`warn`＝`thunder`，其他＝`sparkle`。

**字卡動態**：預設音效寫在 `fx/catalog.json` 的 `sfx` 欄（`{ "sound": 名稱, "at": 秒數 }`，沒寫 `at` 就是段起點）；`--list` 字卡動態表的音效欄看得到預設。要 `shine`、`sparkle` 就在那段寫 `"sfx"`。

**覆寫方式**（寫在 plan.json 的那一段）

- `"sfx": "ding"`：換主音效名稱，落點不變。只能寫段落音效；`bgm-outro` 是配樂，寫在第一層 `outro`。
- `"sfx": null`：這段不要主音效。
- `"sfxExtra": false`：關掉這段的附加音效（含 `clicks`），主音效不受影響。
- `"sfxVolume": -6`：這段音效（主音效＋附加音效）的音量，dB；疊在 `kit/sfx.json` 的預設音量與 `edit.volume.sfx` 上（剪輯台會寫）。
- `"clicks": ["+3.2", "#21@安裝"]`（media、custom 段）：每一項一顆 `click`。時間寫法和紅框 `marks[].at` 一樣：`"+秒數"`＝本段起點後幾秒、`"#N"`／`"#N@詞"`＝綁字幕；只寫畫面上看得到游標按下的地方（錄影用 `media.mjs frame --grid` 確認）。

**結尾配樂**（plan.json 第一層）

- `"outro": { "from": "#N" }`：從第 N 句起播 `bgm-outro` 到片尾；配樂比這段短時，改成對齊片尾起播（報告會說）。
- `"outro": { "from": "#N", "volume": -3 }`：這集配樂再小 3 dB；`"music": null`＝這集不配。

**時間規則**

- 起點＝畫面事件時間 − 音效峰值 ＋ 1 幀（理由：放在句尾的音效會晚 1–3 秒，聽起來像沒對上）。
- 一張卡最多一個主音效；兩個主音效相距不到 3 秒時只留前一個，被拿掉的會出現在提醒與報告的「音效時間」欄（`（pop 已拿掉）`）。3 秒間隔只比主音效；附加音效和 `tick`、`click` 不算。
- 同一段附加音效的起點相距不到 0.2 秒，丟掉後者（也會和主音效比）。
- `--check` 最後印「音效次數」（有上限的寫 `次數／上限`）與「音效密度」；超過上限、某一分鐘主音效太多會 ⚠（規則照 `shared/style.md`）。

要新增情境或改模板見 R14。

音效只能用 `shared/sfx/` 裡的檔案，不另外下載。用 `--sfx <私人資料夾>` 時，那個資料夾要放齊 `kit/sfx.json` 的每個名稱。
```

## 5. `shared/template/USAGE-reference.md` 其他兩處

- 第 134 行附近的段落欄位表 `sfx` 列：「12 個名稱之一（R5.2）」改「`kit/sfx.json` 裡 `kind` 是 `sfx` 的名稱之一（R5.2）」。
- 第 696 行附近的資產表「音效」列：「12 個」改「18 個」。
- R7（情境動畫）檔頭說明：加一句「動畫裡畫了游標按下：用 `P.at('#N@詞')` 定那一拍，plan.json 該段的 `clicks` 寫同一個 `#N@詞`」。

## 6. `dev/README.md` 表格

把 `tools/make_sfx.py` 那一列換成：

```markdown
| `tools/make-sfx.mjs` | 產生 `shared/sfx/` 的音效（CC0 素材加工或程式合成）、A/B 試聽檔、回寫 sources.json 與 `kit/sfx.json`（作者用，只要 Node 與 ffmpeg） | `node dev/tools/make-sfx.mjs --help`；試聽檔一定要寫在工作區外面（`--out`） |
| `tools/make_sfx.py` | 已退役，只保留凍結 8 顆音效的處理紀錄；執行會直接結束 | — |
```

## 7. 分鏡表 Skill（001 的 `.agents/skills/` 剪好看／分鏡那支）

- 每段「音效」欄的寫法：`預設`、`無`（`"sfx": null`）、換成某個名稱（例：`shine`）、錄影段加 `clicks 2 下（#21@安裝、+3.2）`。
- 「需要我決定的事」：`sparkle`、`shine`、`thunder` 超過 style.md 每集上限時列出來讓作者挑；結尾要不要配樂（寫 `outro`）列一題。
