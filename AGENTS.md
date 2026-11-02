# 影片剪輯工作區規則

## 怎麼用這份檔

每個流程有一支 Skill（逐步指令、判準、退路），原始檔在 `.agents/skills/<名稱>/SKILL.md`；裝好的複本有出入時以原始檔為準。沒載入 Skill 就直接讀那個檔，讀不到就照本檔做。

| 我說 | Skill |
|---|---|
| 「剪這支影片」「繼續」「做到哪了」 | `auto-edit-longform` |
| 「幫我檢測環境」 | `auto-edit-setup` |
| 「剪乾淨」 | `auto-edit-rough` |
| 「剪好看」「做成片」 | `auto-edit-storyboard` |
| 「配螢幕錄影」 | `auto-edit-screen` |
| 分鏡表確認後做情境動畫 | `auto-edit-motion` |
| 定稿、Studio 修改、「打開剪輯台」、「s12 重新設計」「s12 用 v1」 | `auto-edit-review` |
| 「可以了，輸出成片」「輸出剪映素材」 | `auto-edit-deliver` |
| 「換風格」「換主色」「換背景」「換暗色」「有哪些風格」「這集用 XX 風格」 | `auto-edit-style` |

優先序：我當下的話 > 本檔 > `shared/style.md` > `shared/template/USAGE.md` > `USAGE-reference.md`、`SITUATIONS.md`、`REVIEW.md` > Skill；派工時派工訊息 > Skill。

## 專案

一支影片＝一個專案資料夾 `projects/<專案>/`。我的提示詞會指定專案（例如 `@projects/範例`）；沒指定就列出 `projects/` 底下的專案，問我要處理哪一個。

一次只處理一個專案，不讀寫其他專案的 `work/`、`成片/`。`<專案>` 是這個專案的資料夾名稱；指令都在工作區根目錄執行。

```
projects/<專案>/
├─ 講稿.md            這支影片的講稿（選用）
├─ 素材/
│  ├─ 真人錄影/       有畫面有聲音的口播（主軌）
│  ├─ 聲音/           只有聲音的口播或旁白（主軌，沒有畫面）
│  ├─ 螢幕錄影/       操作畫面（插入用，預設靜音）
│  └─ 圖片/           截圖、照片（插入用）
├─ work/              中間產物
│  └─ 版本/<段>/      每段的 v1、v2…（預覽.mp4、分鏡.md）和 比較-v1-v2.mp4（見「段落版本與改版」）
└─ 成片/              final.mp4、測試片段/、驗收截圖/
```

**接手**：我說「繼續」或你不確定做到哪時，先跑 `node shared/template/tools/status.mjs --project projects/<專案>`，照它印的「下一步」做（「下一步」下面有單獨一行指令時，整行複製執行）；有待回覆停點就重貼那個停點。

## 版式（橫式／直式）

開工時決定一次，寫進開工決策表「版式」；寫 plan.json 時第一層加 `"format": "portrait"`（橫式不寫）。之後的流程、停點、指令都一樣，差異由工具處理。

| 判斷順序 | 版式 |
|---|---|
| 1. 我說「短影片」「直式」「Shorts」「Reels」「抖音」 | 直式 |
| 2. 我說「長片」「橫式」 | 橫式 |
| 3. 都沒說：ffprobe 主軌，寬 < 高 | 直式；否則橫式 |

- 開工決策表「版式」欄寫「直式（理由）」或「橫式（理由）」，開頭兩個字固定（工具讀這兩個字）；我之後說「改成直式／橫式」就照改，停點紀錄新增一列。
- 工具第一行會印「版式：直式 1080×1920（來源：…）」；和開工決策表不一樣時 `--check` 會 ✖，照 → 改 plan.json。
- 直式素材做橫式：不支援，告訴我。橫式素材做直式：還不支援（`--check` 會 ✖），請我提供直拍素材。

| 直式的數字 | 值 |
|---|---|
| 畫布 | 1080×1920、30fps |
| 版面 | 疊加、上下分割（取代子母畫面：分割線 y 900，上半資訊、下半講者）、全幕；03 半版側邊欄、05 兩側不能用 |
| 字幕 | 每則最多 10 字（字級、字重、底板和橫式同一套）；字幕帶 y 1280–1420 |
| 文字安全區 | y 240–1440；y 840 以下右緣 940（右側按鈕列） |
| 下方字卡 | 卡片帶 y 880–1240，不擋臉 |
| 章節角標 | 左上 y 250 |
| 構圖 | 頭頂 y 380–520、下巴 ≤ 860 |
| 錄影段 | 16:9 錄影只有 1080 寬，一定要用 `moves` 推近到操作區 |

數字的出處是 `shared/style.md`「直式」。

## 資料夾

| 資料夾 | 用途 | 權限 |
|---|---|---|
| `.agents/skills/` | 9 支 auto-edit Skill 的原始檔 | 只能讀，照著做 |
| `setup/` | 環境檢測與安裝手冊（Mac／Windows） | 只能讀 |
| `shared/` | 每支影片共用：`style.md`（風格規範）、`template/`（情境庫模板與工具）、`sfx/`（音效，只能從這裡挑） | 只能讀（例外見規則 1） |
| `projects/<專案>/素材/` | 真人錄影、聲音、螢幕錄影、圖片 | 只能讀，不可覆寫、移動或刪除 |
| `projects/<專案>/講稿.md` | 這支影片的講稿 | 只能讀 |
| `projects/<專案>/work/` | 中間產物 | AI 可新增、修改 |
| `projects/<專案>/成片/` | 最終成品、測試片段、驗收截圖 | AI 可新增 |
| `dev/`、`.specify/`、`specs/` | 作者維護用 | 剪片時不要讀、不要執行；找不到合適的工具時照 `shared/template/USAGE.md`，不要自己另寫腳本 |

## 規則

1. 不要覆寫、移動或刪除 `projects/*/素材/`、`projects/*/講稿.md`、`shared/` 的任何檔案。例外：我要求換主色、背景、風格包或講者預設時，可以改 `shared/template/` 的 `kit/brand.css`、`kit/pip-frame.png`、`kit/pip-frame-v.png`、`kit/look.json`、`bg-*.jpg`，以及用 `brand.mjs pack` 新增 `shared/template/styles/<名稱>/`（已經有的包不改、不刪）。要刪除 `work/` 以外的檔案前，先問我。
2. 停點只有六個，照「停點總表」；停下來時回覆最後一行照固定格式。我說「不用停」「跑到停點 N」才連跑。
3. 安裝新工具前，先告訴我指令和用途，等我同意再執行。照 `setup/` 手冊做時，整份清單問一次就好。
4. 字幕以專案的 `講稿.md` 為準：一則＝講稿的一行（完整語句），由 `media.mjs srt-align` 照講稿排、對時間，不要自己拆句，之後只改講稿本身的錯字；顯示時去掉「，」「。」「；」「：」，保留「、」「！」「？」；用繁體中文，技術名詞保留英文原文，中英文之間加半形空格。沒有講稿就只轉繁體、照語音的句子切成完整子句，不要自己猜內容。
5. 文件之間照「怎麼用這份檔」的優先序；同一層的文件互相矛盾才問我。
6. 每次交付都附上驗證方式（例如 ffprobe 的輸出、截圖），不要只說「完成了」。
7. `work/` 的中間檔交付後都要保留：`cuts.md`、`cutpoints.json`、`storyboard.md`、字幕（含備份 `rough.srt.align-*`、`rough.srt.bak-*`、`rough.srt.split-*`）、`transcript.json`（rough.mp4 的詞級逐字稿，`#N@詞` 用它）、`hyperframes/`（含 `plan.json.bak-r<N>`）、`製作進度.md`、`回饋/`、`版本/`、`main.json`、`media/`、`face-landmarks.json`、`rough-look.mp4`、`look-preview.jpg`（`work/.look/` 是快取，可以 `look.mjs clear`）。之後修改、換 session 接續都會用到。
8. 每階段的回報最多 15 行，子代理最多 25 行；工具呼叫超過「階段預算」就停下來回報卡在哪。

## 停點總表

| 停點 | 在哪一步 | 給我看什麼 | 我可以回 | 決定寫回哪裡 |
|---|---|---|---|---|
| ① 剪輯清單 | 剪乾淨 4 | `work/cuts.md` | 「可以」、要改的列、「改好了」 | `work/cuts.md` |
| ② 構圖倍率 | 剪好看構圖預覽 | 構圖預覽兩張、`work/look-preview.jpg`、倍率表 | 倍率 | plan.json `frame` |
| ③ 分鏡表 | 剪好看 3；④ 之後的改版 | `work/storyboard.md`（情境動畫段附動畫分鏡）；改版看 `work/版本/<段>/v<N>/分鏡.md` | 「可以」、「改好了」、要改的段或拍 | 正式 plan.json；情境動畫照確認過的動畫分鏡做；改版由 `versions.mjs accept` 寫回 storyboard.md |
| ④ Studio 預覽 | 剪好看 5 | Studio 網址 | 要改的段、「可以了，輸出成片」 | plan.json、`work/回饋/` |
| ⑤ 剪輯台 | 「打開剪輯台」 | 剪輯台網址 | 「調好了」 | 剪輯台自己寫 |
| ⑥ 背景預覽 | 換風格 2 | 並排圖、留空區預覽 | 「可以」、「重做」 | `shared/template/bg-*.jpg` |

停下來時回覆最多 15 行（做完什麼、產物、要我決定的事、驗證），最後一行逐字用這行（`<…>` 換成實際值）：

```
⏸ 停點 ① 剪輯清單｜請看：work/cuts.md｜請回：「可以」或要改的列
⏸ 停點 ② 構圖倍率｜請看：work/構圖預覽.jpg、work/構圖預覽-套卡.jpg｜請回：倍率（1.0／1.15／1.3）
⏸ 停點 ③ 分鏡表｜請看：work/storyboard.md｜請回：「可以」或要改的地方
⏸ 停點 ③ 分鏡表（<段> v<N>）｜請看：work/版本/<段>/v<N>/分鏡.md｜請回：「可以」或要改的拍
⏸ 停點 ④ Studio 預覽｜請看：<Studio 網址>｜請回：要改的段落（例：s05 往左移）或「可以了，輸出成片」
⏸ 停點 ⑤ 剪輯台｜請看：<剪輯台網址>｜請回：調完按「儲存」後說「調好了」
⏸ 停點 ⑥ 背景預覽｜請看：<暫存資料夾>/preview.jpg、<暫存資料夾>/zones-fs.jpg｜請回：「可以」或「重做」
```

- 我的回覆對到最近一個「待回覆」的停點。不在停點上時最後一行寫 `→ 下一個停點：<編號> <名稱>（說「<觸發語>」開始）`；安裝清單用 `❓ 請回：「可以開始」或要拿掉的步驟編號`。
- 「不用停」：這一則訊息啟動的流程 ①–④ 都不停；「跑到停點 N」「做到分鏡表」「做到 Studio」：N 之前不停；下一則沒再說就恢復。⑤、⑥ 不能略過。略過時照樣寫檔、停點紀錄加「略過」，回報加 `⏭ 停點 <編號> 略過：<採用了什麼>`（① 待確認的不剪；② 用建議倍率，沒有就 1.0；③ 沒勾的金句不上）。

## 階段預算

單位是工具呼叫次數（建議初值）。

| 階段 | 上限 | 階段 | 上限 |
|---|---|---|---|
| 接手 | 4 次 | 一段情境動畫 | 18 次 |
| 剪乾淨到停點 ① | 12 次 | 定稿到停點 ④（不含情境動畫） | 30 次 |
| ① 通過到初剪回報 | 24 次 | 回饋輪每一項 | 10 次 |
| 剪好看到停點 ② | 8 次 | 交付（render log 另計 20 次） | 12 次 |
| ② 通過到停點 ③ | 55 次 | 換風格 | 15 次 |
| 配一支螢幕錄影 | 6 次 | 環境準備 | 同一步失敗 2 次就停 |
| 改版開提案到停點 ③（每段） | 6 次 | 改版確認後到停點 ④（不含情境動畫） | 12 次 |
| 剪映素材（不含 status 的等待） | 6 次 | | |

## 開工（每個專案第一次）

把這張表填進 `work/製作進度.md` 開頭（範本 `.agents/skills/auto-edit-longform/references/progress-template.md`）：

| 欄 | 怎麼看 | 會影響什麼 |
|---|---|---|
| 主軌種類 | `素材/真人錄影/`、`素材/聲音/` 的檔 | 只有一支真人錄影＝`media.mjs main` 直接轉；其他＝停點 ① 問順序 |
| 版式 | 我的話；沒說就看主軌寬高比（見「版式」） | 畫布、版面、字幕字數；plan.json `"format"` |
| 有沒有講稿 | `講稿.md` 在不在 | 沒有：字幕只轉繁體、補標點 |
| 有沒有螢幕錄影／圖片 | `素材/螢幕錄影/`、`素材/圖片/` | 有：照 `auto-edit-screen` 配 |
| 長度 | ffprobe 主軌 | 不到 180 秒（3 分鐘）不用 01 章節轉場 |
| 有沒有業配段 | 講稿有「業配」「贊助」「優惠碼」→ 待確認 | 業配段不放 01 |
| 構圖倍率 | 停點 ② 通過後填 | plan.json `frame` |

## 進度與回饋紀錄

- `work/製作進度.md` 固定四節：`## 開工決策表`、`## 階段`、`## 停點紀錄`、`## 回饋輪`。停點紀錄表頭 `| 時間 | 停點 | 狀態 | 使用者原話 | 寫回哪裡 |`；時間 `YYYY-MM-DD HH:MM`；停點寫 `① 剪輯清單`；狀態只有 `待回覆`、`通過`、`修改後重停`、`略過`。停下來先加一列「待回覆」，我回覆後**新增**一列、不改舊列；原話用「」逐字貼（超過 40 字截斷加「…」）。改版的停點寫 `③ 分鏡表（s12 v2）`。
- 「## 階段」的狀態：不管走哪一支 Skill（我直接說「剪乾淨」「打開剪輯台」也一樣），開始一個階段改成 🔄、停在停點改成 ⏸、做完改成 ✅。
- 回饋輪：停點 ④ 之後的修改開一輪 `r<N>`（N＝`status.mjs` 印的「下一輪回饋編號」；沒有工具時是 `work/回饋/` 裡 `r*.md` 的最大數字＋1）。改 plan.json 前先複製成 `work/hyperframes/plan.json.bak-r<N>`（Mac `cp`、Windows `Copy-Item`），改到的每一段在改之前、build 之後各跑一次 `versions.mjs save`（見「段落版本與改版」）。`work/回饋/r<N>.md` 四節：原話、分類（規則／個案、改哪段、改法）、改了哪幾段、驗證。「規則」類（「以後都…」）這集照做，只記在「建議改規則」，不改 `shared/` 和本檔。

## 開新專案

我說「開一個新專案 <名稱>」時：

1. 建立 `projects/<名稱>/`，以及 `素材/真人錄影`、`素材/聲音`、`素材/螢幕錄影`、`素材/圖片` 四個空資料夾。
2. 告訴我各放什麼：有畫面的口播放 `素材/真人錄影/`；只有聲音的旁白放 `素材/聲音/`（畫面會配螢幕錄影或圖片）；螢幕錄影放 `素材/螢幕錄影/`；截圖、照片放 `素材/圖片/`；講稿存成 `projects/<名稱>/講稿.md`。
3. 等我放好素材，不要自己開始剪。最後一行：`→ 下一步：素材放好後說「剪乾淨」`。

## 剪乾淨（初剪）

我說「剪乾淨」「剪成初剪」時，照 `auto-edit-rough` 做，產出都放 `work/`：

1. 主軌：一律先跑 `node shared/template/tools/media.mjs main --project projects/<專案>`（寫 `work/main.mp4`、`work/main.json`），之後逐字稿、ng-snap、auto-editor 都對 `work/main.mp4` 做。只有一支真人錄影也要跑（它會轉成固定 fps：auto-editor 直接剪手機原檔，`--cut-out` 之後的畫面會全黑；時間和原片一樣）。有多支或有聲音檔，照檔名排序列出順序併進停點 ①，確認後加 `--order "檔名1,檔名2"` 再跑一次（順序改了，第 2–4 步重做）。忘了跑也沒關係：ng-snap 發現沒有 `work/main.mp4` 會自己先轉。
2. 逐字稿：`npx hyperframes transcribe projects/<專案>/work/main.mp4 -d projects/<專案>/work --model small --language zh --json`。
3. 找 NG：同一句話講了兩次以上，只保留最後一次完整的；講到一半卡住、停下來重講的，卡住那次也算 NG。
4. 剪輯清單 `work/cuts.md`：NG 表表頭 `| 時間碼 | 內容 | 原因 | 待確認 |`，時間碼寫原片的 `起–迄`（例 `0:12.40–0:15.10`），拿不準的在「待確認」寫原因；講稿有 `##` 章節時加章節空檔表（表頭 `| 章節 | 第一句 | 時間碼 |`；時間碼抄逐字稿那句的起點，ng-snap 會往後找實際開口點）。「需要你決定」一項都沒有才寫「無」。列完跑 `node shared/template/tools/media.mjs ng-snap --project projects/<專案>`，它印的 ⚠ 寫進「需要你決定」。→ 停點 ①
5. 我確認後（改過就先重新讀檔）再跑 ng-snap，照它印的三行 auto-editor 指令依序執行：`--preview` 預演 → 輸出 `work/rough.mp4` → 存 `work/cuts.v1.json`。尾音被切就在 ng-snap 加 `--edit "audio:-26dB"`（或 `-30dB`），自言自語沒剪掉就 `--edit "audio:-16dB"`，再預演。三行跑完先跑 `node shared/template/tools/media.mjs verify-rough --project projects/<專案>`：印 ✖「初剪壞了」就照它印的 1–4 行重做（剪輯清單不用改），✓ 才往下；不要自己改 ffmpeg 或 auto-editor 參數。回報附上它印的那一行（✓ 或黑畫面表）。
6. 字幕：`npx hyperframes transcribe projects/<專案>/work/rough.mp4 -d projects/<專案>/work --model small --language zh --json --to srt -o projects/<專案>/work/rough.srt`（同時寫 `work/transcript.json` 詞級時間與 `work/rough.srt`）→ `node shared/template/tools/media.mjs srt-align --project projects/<專案> --dry-run`，看斷句表合理再去掉 `--dry-run`（有講稿：字幕＝講稿每一行，時間自動對到講話；沒講稿：照「，。！？；」切成完整子句；寫回前自動備份 `work/rough.srt.align-<時間戳>`）→ 照規則 4 只改錯字（講稿本身的錯字、沒講稿時 whisper 的錯字）。**有 `work/transcript.json` 就不跑 snap-srt**（srt-align 的時間已經是詞級）；沒有才照 srt-align 最後一行跑 `snap-srt`（只跑一次）。srt-align 印的 ⚠（對不上、沒標點的長行、不到 0.6 秒）寫進回報。之後我在剪輯台改的字和時間不要再被工具覆蓋。
7. 剪接點：`node shared/template/tools/media.mjs cutpoints --project projects/<專案>` 寫 `work/cutpoints.json`。回報原始與初剪長度、剪掉幾段（auto-editor 的統計）、srt-align 的最後一行統計（則數、併幾次、平均字數）與 ⚠、cutpoints 的表。

| 剪乾淨的數字 | 值 |
|---|---|
| 靜音門檻 | 預設 `-20dB`；尾音被切放寬到 `-26dB`、`-30dB`；自言自語沒剪收緊到 `-16dB` |
| auto-editor 留白 | `--margin 0.15sec`（ng-snap 印的三行都有） |
| 字幕 | 一則＝講稿一行（完整語句）；每則最多 18 字（直式 10 字），超過在「、，」處拆；同一口氣的短行併；不顯示「，。；：」，保留「、！？」；相鄰空檔不到 1 秒接起來 |
| 字幕合併（srt-align 自己判斷，看斷句表用） | 兩行併成一則要四條都符合：① 同一口氣（兩行之間停頓 ≤ 0.12 秒；有一邊 ≤ 4 字時停頓 < 1 秒也算）② 上一行不是「。！？」結尾 ③ 下一行不以連接詞開頭：而／但／所以／因為／另外／如果／或者／然後／接著／最後／為了／現在／不過／可是／因此／於是／首先／其次／再來／那麼／當／雖然／只是／其實 ④ 合併後 ≤ 18 字 |
| 字幕樣式 | 字級 76 px、字重 400、底板高 118 px（內距上下 24 px、左右 37 px）、底板距畫面底 6 px（style.md「字幕」） |
| snap-srt 要回報的異常（只在沒有 transcript.json、照 srt-align 的 ⚠ 跑 snap-srt 時） | 起點調整 ≥ 1.2 秒、超過一半被調整、有則被收到 0.6 秒下限 |

剪乾淨時不要做的事：

- 初剪只用 `ffprobe`（解析度、長度）、auto-editor 的統計和 `verify-rough` 驗證。不要拿波形比對、不要還原切口、不要算字幕的語音覆蓋率、不要自己寫程式驗證字幕；字幕的斷句與時間只用 `srt-align`。
- 字幕斷句交給 srt-align：不要自己按字數切、不要再跑 srt-split（舊流程）、不要把「，。」加回字幕。
- 秒數都由工具算（`ng-snap`、`srt-align`、`cutpoints`）：不要自己算 NG 起訖、拼 auto-editor 指令、累加幀數或按字數比例算時間。
- 逐字稿只是找 NG 的依據。whisper 在沒聲音處偶爾會補一句講稿的話，對不上的照講稿判斷；拿不準就放「待確認」，不要做音訊分析、比對舊版、拆段重轉或研究 VAD。
- whisper-cli 出現 `SIGABRT`，直接在指令最前面加 `GGML_METAL_BF16_DISABLE=1` 重跑，不用再查手冊。

## 剪好看（成片）

我說「做成片」「包裝成成片」時，依序照 `auto-edit-storyboard` → `auto-edit-screen`（有素材）→ `auto-edit-motion`（有情境動畫）→ `auto-edit-review` → `auto-edit-deliver`；HyperFrames 專案在 `work/hyperframes/`。

**構圖＋套卡預覽**（分鏡表之前）：`node shared/template/tools/look.mjs status --project projects/<專案>`（講者調光＋瘦臉；只讀，不寫任何檔）照「→ 下一步」做：倒數第二行「→ 下一步：<說明>」是說明，最後一行是可直接貼的指令，整行複製、單獨一行執行（預估超過 2 分鐘時它已經帶 `--background`，之後每 30 秒跑一次 `status`，直到「→ 下一步」說 look 好了）；再 `node shared/template/tools/qc.mjs framing --project projects/<專案> --cards`，兩張預覽圖、`work/look-preview.jpg`、倍率表和建議（先照表上「建議」打 ✔ 的）給我 → 停點 ②。選好後那一列的 `frame` 寫進 plan.json 第一層（1.0 倍不寫）。

1. 講者框：看檔名含「場地照」的圖（沒有就從 `work/rough.mp4` 截一張 `work/場地照.jpg`），跑 `node shared/template/tools/qc.mjs speaker --project projects/<專案>`，看 `work/場地照-動作範圍.jpg` 寫 speakerBox（USAGE.md 2.2）。字幕用 `work/rough.srt`，不重新轉錄。
2. 素材與情境：有螢幕錄影／圖片，或 `node shared/template/tools/build.mjs --check --project projects/<專案>` 報「只有聲音」的區間時，`node shared/template/tools/media.mjs scan --project projects/<專案>` 配每段口播（座標用 `media.mjs frame --grid`）。每段先填情境判定表（`auto-edit-storyboard` 步驟 5：口播在講什麼 → `shared/template/SITUATIONS.md` §3 哪一列 → 首選 → 為什麼不是動畫）。首選欄是情境動畫就做動畫，只有不符合 style.md「情境動畫優先」三條判準才退到字卡；連續 2 段以上都是 06／07／12／13 字卡就要回頭查 §3 有沒有動畫列。情境動畫從 `shared/template/custom/` 改、用 `P.at('#N@詞')` 綁句、結尾 `P.end()`；示意動畫（口播在描述具體的動作、物件）先判定素材（畫廊／圖示／新建 SVG），寫成那段的插圖清單（`shared/template/BEATS.md` §5）；資訊卡照 style.md，有圖示欄位就配。錄影或動畫裡看得到游標按下就寫 `clicks`；要片尾配樂寫 `outro`。
3. 分鏡表：草稿 plan.json → `--check`（✖ 先修掉）→ build → `node shared/template/tools/qc.mjs storyboard --project projects/<專案>` 截每段 → 照 USAGE.md 2.3 寫 `work/storyboard.md`（版面只用疊加／半畫面／子母畫面／全幕，直式只用疊加／上下分割／全幕，見 SITUATIONS.md §2；金句只列候選；整集照 SITUATIONS.md §6 看開場、呼應、判決句）。每段情境動畫（x-*、04 家族）底下加一張動畫分鏡 `#### 動畫分鏡 <段 id>`：抄 `shared/template/BEATS.md` 那個情境的預設拍型，只填講到的詞與畫面上的字，動態欄只用語彙表的名稱；字卡（06／07／12／13）不用 → 停點 ③（版面和動畫分鏡一次確認；某段情境被我改掉，只重出那一段的分鏡）。我說「改好了」「可以」：重新讀 storyboard.md，以檔案為準寫正式 plan.json；超過上限或違反規則的先告訴我，不要自己改。
4. 定稿：`node shared/template/tools/build.mjs --project projects/<專案>`；有情境動畫跑 `node shared/template/tools/audit.mjs --project projects/<專案>`（✖ 全部修掉）；「沒有畫面的區間」要是「無」，刻意留的要說明。
5. 抽查：`(cd projects/<專案>/work/hyperframes && npx hyperframes snapshot --review)` 照 `shared/template/REVIEW.md` 看，再 `(cd projects/<專案>/work/hyperframes && npx hyperframes preview --no-open)` → 停點 ④。我說「s05 往左移」這類修改：開回饋輪，改 plan.json 那一段再 build；要一段重新設計、退回舊版照「段落版本與改版」。
6. 輸出：`node shared/template/tools/build.mjs --project projects/<專案> --test 起點,4` → `(cd projects/<專案>/work/hyperframes && npx hyperframes render -c compositions/test-clip.html --quality draft -o ../../成片/測試片段/test-clip.mp4)`，ffprobe 確認有音軌，`node shared/template/tools/qc.mjs observe --project projects/<專案> --file projects/<專案>/成片/測試片段/test-clip.mp4 --offset <起點>` 看版面與接縫；再背景 render `成片/final.mp4`（USAGE.md 2.7）→ `node shared/template/tools/qc.mjs observe --project projects/<專案>`（照 REVIEW.md 看觀影總表）→ `node shared/template/tools/qc.mjs final --project projects/<專案>`：✖ 修好再交，⚠ 逐項說明；附 `成片/驗收截圖/qc-sheet.jpg`、`work/觀影/index.md`。

硬規則：

- 倍率定之前不做分鏡；卡片和字幕不擋臉和手勢；「只有聲音」的區間一定被 media 段或不透明全幕蓋住。
- 章節角標由 build 自動常駐：章節開始到下一章；子母畫面、全幕時自動隱藏；plan.json 不用寫 `chtag`。沒有 01 的短片，章節起點是那一章的 02 段。
- 子母畫面一定有講者小窗；只有純聲音素材的區間才沒有。`--check --json` 子母畫面段的 `pip` 是空的，先跑 `media.mjs verify-rough`，不要改版面繞過去。
- 卡片主文字、每條項目、每個動畫站的出現時間＝講到那個詞的時間：綁 `#N@詞`，差 ≤ 0.5 秒；`--check` 的「文字對時」✖ 全修、⚠ 逐項說明（情境動畫的站看 audit 的「綁句對不上」）。
- 音效只用 `shared/sfx/`，不下載素材、不登入第三方服務；回報貼 build 印的「人聲響度…」「音效比例…」「剪接點微淡化…」三行，`--check` 的「音效次數」「音效密度」有 ⚠ 也要說。

| 剪好看的數字 | 值 |
|---|---|
| 構圖倍率 | 1.0／1.15／1.3；每個像素放大超過 3.5 倍、或切到手勢的往小選；直式另看頭頂 y 380–520、下巴 ≤ 860 |
| 分鏡截圖 | `qc.mjs storyboard` 自己算：每段完成態（段尾前 0.6 秒）、條列逐條換的每次一張、錄影段每個標註到位一張 |
| 測試片段 | 3–5 秒，挑第一張資訊卡出現處 |

## 段落版本與改版（停點 ④ 之後）

每段的版本放 `work/版本/<段>/v<N>/`：`段落.json`（plan.json 那一段）、情境動畫的 `x-*.html` 與 svg、`分鏡.md`、`預覽.mp4`（這一段 render 出來的樣子）、`預覽.jpg`；改過的段另有 `比較-v<舊>-v<新>.mp4`（左舊右新）。版本只用 `versions.mjs` 建、退回，不要手動複製；我在停點 ④ 會看 Studio 和這幾支影片。

| 我說 | 走哪條 | 做法（`auto-edit-review` 流程 B、D、E） |
|---|---|---|
| 指名段＋具體改法：位置、文字、時間、音效、大小（「s05 往左移」「s09 字太多」） | 回饋輪直接改 | 改之前、build 之後各跑一次 `node shared/template/tools/versions.mjs save --project projects/<專案> --seg <段>` → 停點 ④ |
| 指名段、想要更好但沒說怎麼改：「更完善」「更細節」「重新設計」「重做」「換個動畫」 | 改版：先出分鏡、我確認再做 | `node shared/template/tools/versions.mjs new --project projects/<專案> --seg <段>` → 改 `v<N>/分鏡.md` → 停點 ③（<段> v<N>）→ 我說「可以」→ `versions.mjs accept` → 照 `auto-edit-motion` 做 → build、audit → `versions.mjs save` → 停點 ④ |
| 「s12 用 v1」「退回上一版」 | 退回 | `node shared/template/tools/versions.mjs use --project projects/<專案> --seg <段> --ver v1` → build、audit → 停點 ④ |
| 「s12 有哪些版本」 | 列出 | `node shared/template/tools/versions.mjs list --project projects/<專案> --seg <段>` |
| 沒指名段（「動畫都更細節一點」） | 先問 | 列出情境動畫段，每段一句可以改的方向，問要改哪幾段；可以一次改好幾段（`--seg s08,s12`，停點寫「③ 分鏡表（s08 v2、s12 v2）」） |

- 「1:10 那段」「這段」照 USAGE.md 2.6 找段 id。改版也算一輪回饋：照「進度與回饋紀錄」開 `r<N>`，rN.md 的改法寫「改版 <段> v<N>」。
- 改版的提案只寫在 `v<N>/分鏡.md`（不先改 storyboard.md）；「這版要改什麼」寫 1–5 條和上一版差在哪，動畫分鏡的格式和停點 ③ 一樣（表頭照抄 BEATS.md、動態只用語彙表的名稱）。

## 子代理分工（選用）

分鏡表確認後，獨立的工作可以分給子代理；你（主代理）負責 plan.json、派工、整合與驗收。沒有子代理就自己照 `auto-edit-motion` 一段一段做。

| 工作 | 什麼時候分 | 派給 | 子代理只能寫 | 交回 |
|---|---|---|---|---|
| 情境動畫 | 2 段以上 | `worker`，一段一個 | 自己那支 `x-<名稱>.html` | 照 `auto-edit-motion` |
| 螢幕錄影配對 | 2 支以上 | `explore`，一支一個 | 不寫檔 | 照 `auto-edit-screen` |
| 抽查截圖 | 8 段以上 | `verifier` | 不寫檔 | 照 `REVIEW.md` §4 |

1. `plan.json`、`work/storyboard.md`、`work/rough.srt` 只有你能寫。子代理可以跑 `node shared/template/tools/build.mjs --check --project projects/<專案>`、`node shared/template/tools/audit.mjs --project projects/<專案> --only <自己的段>`；不跑 build、不開 Studio、不 render，不改 `shared/`、`素材/`。
2. 派工寫清楚目標、負責的檔、要讀哪幾節（情境動畫附那段確認過的動畫分鏡）、驗收條件、回報格式。收件用 `ls -l` 看時間是剛剛、`grep` 確認真的寫進去了再整合；全部回來才由你跑 `--check`、build、audit、snapshot，audit 有 ✖ 就把原文交回那個子代理。

## 剪映素材

我說「輸出剪映素材」「我要用剪映剪」時（`auto-edit-deliver` 步驟 5）：`node shared/template/tools/capcut.mjs --project projects/<專案> --dry-run` 看會出幾支，再加 `--background` 跑、用 `status` 看進度。產出在 `成片/剪映/`：`主軌.mp4`（講者＋人聲＋片尾配樂）、每段一支有透明通道的 `.mov`（ProRes 4444，帶那段的音效）、`字幕.srt`、`清單.md`（每支放在剪映時間軸的哪一秒）。不用先輸出 final.mp4；章節角標不輸出。

## 剪輯台

我說「打開剪輯台」時：

1. 照 `shared/template/EDITOR.md` 在背景啟動 `node shared/template/tools/editor.mjs --project projects/<專案>`，把網址給我 → 停點 ⑤。
2. 我說「調好了」：重新讀 plan.json 與 rough.srt、重跑 build，再照「剪好看」第 5、6 步（`auto-edit-review` 流程 C）。
3. 剪輯台會改的地方（EDITOR.md §3）：plan.json 的 `edit`；plan.json 第一層的 `look`（講者調光、瘦臉）；media 段的 `from`／`to`／`in`／`anchor`／`enter`／`exit`／`volume`；任何段落的 `sfxVolume`、`sfx: null`、`slots`／`vars` 的文字；`work/rough.srt` 的字幕文字與起訖時間，也可以新增、分割、合併、刪除字幕（句子數量變動時，剪輯台會把 plan.json 所有綁句的 `#N` 一起重新對好，`work/storyboard.md` 的句號因此可能過期，以 plan.json 為準）。AI 要改 plan.json 或 rough.srt 之前，先重新讀檔，不要蓋掉我在剪輯台存的設定；我在剪輯台改過的文字、斷句和時間，以我改的為準，不要再改回去。

## 換風格

我說「換風格」「換成我的風格」「換主色」「換背景」「生成背景圖」「換暗色」「換主題」時（`auto-edit-style`）：

0. 風格包（`shared/template/styles/<名稱>/`＝主色＋外框＋亮暗背景）：我問「有哪些風格」先跑 `node shared/template/tools/brand.mjs list`；「這集用 XX 風格」只在這一集 plan.json 第一層寫 `"style": "<名稱>"`；「整個換成 XX」「換回預設」跑 `node shared/template/tools/brand.mjs use <名稱>`。內建「預設」（橘色）和示範「藍圖」（藍色）；情境庫 `shared/template/index.html` 上方的「風格」「暗色」可以直接預覽。
1. 主色：`node shared/template/tools/brand.mjs "#RRGGBB"`。我給色名就先轉成色碼，回報用了哪個；對比值與警告原文貼給我。
2. 背景圖：我有給圖就直接縮放裁切。沒有就跑 `node shared/template/tools/caps.mjs`，能力表貼給我，照「可用的生圖路線」與 `USAGE-reference.md` R9.3 選（HTML 路線：`node shared/template/tools/brand.mjs bg --html <檔.html> --kind fs`）；沒裝的不裝、沒登入的不幫我登入；全部不行就只換主色並說明原因。三張先放暫存資料夾，檢查尺寸（1920×1080、960×1080、1920×1080）、產生留空區預覽與並排圖 → 停點 ⑥；我同意才存成風格包 `node shared/template/tools/brand.mjs pack <名稱> --color "#RRGGBB" --bg <暫存資料夾>`，再照我要的範圍 `use`（整個工作區）或寫 plan.json `style`（這一集）。
3. 講者調光、瘦臉：預設都關（`kit/look.json` 兩個 0）。我說「這集要調光、瘦臉」就寫 plan.json 的 `look`（建議 `{ "color": 0.8, "slim": 0.6 }`）；說「以後都要調光」「預設瘦一點」才改 `shared/template/kit/look.json` 的 `color`（0–1）或 `slim`（0–1.2）。
4. 主題：我說「換暗色」「換主題」時，只改這一集 plan.json 第一層的 `"theme"`（`"light"`＝預設、`"dark"`），不改 `shared/`。
5. 改完告訴我改了哪些檔、走哪一條路，我會重新打開 `shared/template/index.html` 預覽。

## 環境準備

- 我說「幫我檢測環境」「安裝環境」「裝工具」這類話時，照 `auto-edit-setup`：讀 `setup/README.md` 照步驟做，每一步照它的格式回報進度。共用步驟 S3 在根目錄 `npm install`，S4 `node setup/install-skills.mjs` 裝 9 支 auto-edit Skill，S5 `node shared/template/tools/look.mjs ensure` 檢查臉部偵測檔。
- 需要輸入密碼（Mac 的 Homebrew）或按系統確認視窗（Windows 的 winget）的步驟，請我自己做。
- 檢測顯示 `restart` 就請我重開 MiniMax Code，再說一次「幫我檢測環境」；重開後還找不到，就在指令最前面加 PATH 前綴照樣做（Mac：`export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH";`），不要卡在重開。
- 手冊裡的 `npx` 一律加 `-y`（例 `npx -y hyperframes doctor`），才不會停在 `Ok to proceed?`。

## 工具注意事項

- `USAGE.md`、`USAGE-reference.md` 是查表用，Skill 會寫做到哪一步查哪一節；成片一律用 `build.mjs` 產生，不要從零寫。
- hyperframes 的指令（`snapshot`、`preview`、`render`）在子殼裡跑：`(cd projects/<專案>/work/hyperframes && npx hyperframes …)`，輸出路徑相對那個資料夾（成片是 `../../成片/final.mp4`）。版本照根目錄 `package.json`（0.8.221）：第一次、或 build 印「⚠ HyperFrames … 不同」時，在根目錄 `npm install`。
- 工具印「→ 下一步：<說明>」時，下面那一行（最後一行）就是可直接貼的指令：整行複製、單獨一行執行；說明那一行不是指令。
- 缺工具照 `setup/` 的手冊裝，不要自己想辦法。轉逐字稿一定帶 `--model small --language zh`（預設 `small.en` 會翻成英文）。
- `auto-editor` 的參數名稱以 `auto-editor --help` 為準（例 `--cut-out`，不是 `--cut`）。PowerShell 會把逗號拆開，帶逗號或冒號的參數加引號：`--cut-out "17sec,25sec"`、`--edit "audio:-20dB"`。
- `hyperframes check` 沒問題不代表版面正確，一定要看 `snapshot --review` 的截圖。`render` 沒有時間範圍參數，短片段用 `build.mjs --test`；render 很久就改背景執行看 log（USAGE.md 2.7）：指令前面加 `HYPERFRAMES_RENDER_DETACHED=1`（HyperFrames 自己的背景模式），不要用 `nohup`、也不要只加 `&`；log 出現 `render_cancelled_parent_exited` 就照這樣重跑。
- 我說「這張卡」「我選的」時，用 `(cd projects/<專案>/work/hyperframes && npx hyperframes preview --context --json --context-fields selection)` 讀選到的元素。
- 調光由 build 套；瘦臉要跑 `node shared/template/tools/look.mjs run --project projects/<專案>`。build 印「瘦臉底片不是最新的」時照那一行的 → 做，不要改 build 參數繞過去。
