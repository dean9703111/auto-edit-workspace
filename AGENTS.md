# 影片剪輯工作區規則

## 怎麼用這份檔

每個流程有一支 Skill（逐步指令、判準、退路），原始檔在 `.agents/skills/<名稱>/SKILL.md`；裝好的複本有出入時以原始檔為準。沒載入 Skill 就直接讀那個檔，讀不到就停下來告訴我（本檔只有規則和路由，沒有逐步指令）。

| 我說 | Skill |
|---|---|
| 「剪這支影片」「繼續」「做到哪了」 | `auto-edit-longform` |
| 「幫我檢測環境」 | `auto-edit-setup` |
| 「剪乾淨」 | `auto-edit-rough` |
| 「剪好看」「做出完成影片」 | `auto-edit-storyboard` |
| 「配螢幕錄影」 | `auto-edit-screen` |
| 分鏡表確認後做情境動畫 | `auto-edit-motion` |
| 定稿、Studio 修改、「打開剪輯台」、「s12 重新設計」「s12 用 v1」、「照修改單改」「照剪輯台修改單改…」 | `auto-edit-review` |
| 「可以了，輸出完成影片」「輸出剪映素材」 | `auto-edit-deliver` |
| 「換風格」「換主色」「換背景」「換暗色」「有哪些風格」「這集用 XX 風格」「講者設定成…」 | `auto-edit-style` |

優先序：我當下的話 > 本檔 > `shared/style.md` > `shared/template/USAGE.md` > `USAGE-reference.md`、`SITUATIONS.md`、`REVIEW.md` > Skill；派工時派工訊息 > Skill。

讀文件：開工只讀本檔和那一步的 Skill；`USAGE*.md`、`SITUATIONS.md`、`BEATS.md`、`style.md`、`EDITOR.md`、`REVIEW.md` 等 Skill 那一步指到才讀，而且只讀指到的那一節（用標題或 `grep -n` 找，不要整份讀）。

## 專案

一支影片＝一個專案資料夾 `projects/<專案>/`。我的提示詞會指定專案（例如 `@projects/example`）；沒指定就列出 `projects/` 底下的專案，問我要處理哪一個。

一次只處理一個專案，不讀寫其他專案的 `work/`、`output/`。`<專案>` 是這個專案的資料夾名稱；指令都在工作區根目錄執行。`projects/<專案>` 可以是指向外接硬碟的捷徑，照常用（不用改路徑）。

```
projects/<專案>/
├─ 講稿.md            這支影片的講稿（選用）
├─ assets/            素材
│  ├─ camera/         真人錄影：有畫面有聲音的講解（主軌）
│  ├─ voice/          聲音：只有聲音的講解或旁白（主軌，沒有畫面）
│  ├─ screen/         螢幕錄影：操作畫面（插入用，預設靜音；邊錄邊講的接進主軌）
│  └─ images/         圖片：截圖、照片（插入用）
├─ work/              中間產物
│  └─ versions/<段>/  每段的 v1、v2…（預覽.mp4、分鏡.md）和 比較-v1-v2.mp4（見「段落版本與改版」）
└─ output/            完成影片：final.mp4、test-clips/（測試片段）、qc/（驗收截圖）、capcut/（剪映素材）
```

**接手**：我說「繼續」或你不確定做到哪時，先跑 `node shared/template/tools/status.mjs --project projects/<專案>`，照它印的「下一步」做（「下一步」下面有單獨一行指令時，整行複製執行）；有待回覆停點就重貼那個停點。它最後印「講者：⚠ 還沒設定」時，在回報裡問我姓名與頭銜（不擋流程，不要自己編）。

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
| `projects/<專案>/assets/` | 真人錄影、聲音、螢幕錄影、圖片 | 只能讀，不可覆寫、移動或刪除 |
| `projects/<專案>/講稿.md` | 這支影片的講稿 | 只能讀 |
| `projects/<專案>/work/` | 中間產物 | AI 可新增、修改 |
| `projects/<專案>/output/` | 最終成品、測試片段、驗收截圖 | AI 可新增 |
| `dev/`、`.specify/`、`specs/` | 作者維護用 | 剪片時不要讀、不要執行；找不到合適的工具時照 `shared/template/USAGE.md`，不要自己另寫腳本 |

## 規則

1. 不要覆寫、移動或刪除 `projects/*/assets/`、`projects/*/講稿.md`、`shared/` 的任何檔案。例外：我要求換主色、背景、風格包或講者預設時，可以改 `shared/template/` 的 `kit/brand.css`、`kit/pip-frame.png`、`kit/pip-frame-v.png`、`kit/look.json`、`bg-*.jpg`，以及用 `brand.mjs pack` 新增 `shared/template/styles/<名稱>/`（已經有的包不改、不刪）；我給姓名、頭銜或說「不要講者介紹」時，用 `brand.mjs speaker` 寫 `shared/講者.json`。構圖台的「用這一格當預覽參考圖」會寫 `shared/template/preview/speaker-local.jpg`（直式 `speaker-v-local.jpg`；不進版控）。要刪除 `work/` 以外的檔案前，先問我。
2. 停點只有六個，照「停點總表」；停下來時回覆最後一行照固定格式。我說「不用停」「跑到停點 N」才連跑。
3. 安裝新工具前，先告訴我指令和用途，等我同意再執行。照 `setup/` 手冊做時，整份清單問一次就好。
4. 字幕以專案的 `講稿.md` 為準：一則＝講稿的一行（完整語句），由 `media.mjs srt-align` 照講稿排、對時間，不要自己拆句，之後只改講稿本身的錯字；顯示時去掉「，」「。」「；」「：」，保留「、」「！」「？」；用繁體中文，技術名詞保留英文原文，中英文之間加半形空格。沒有講稿就只轉繁體、照語音的句子切成完整子句，不要自己猜內容。
5. 文件之間照「怎麼用這份檔」的優先序；同一層的文件互相矛盾才問我。
6. 每次交付都附上驗證方式（例如 ffprobe 的輸出、截圖），不要只說「完成了」。
7. `work/` 的中間檔交付後都要保留：`cuts.md`、`cutpoints.json`、`storyboard.md`、字幕（含備份 `rough.srt.align-*`、`rough.srt.bak-*`、`rough.srt.split-*`）、`screen-sync.json`、`transcript.json`（rough.mp4 的詞級逐字稿，`#N@詞` 用它）、`hyperframes/`（含 `plan.json.bak-r<N>`）、`製作進度.md`、`feedback/`、`versions/`、`main.json`、`media/`、`face-landmarks.json`、`rough-look.mp4`、`look-preview.jpg`（`work/.look/` 是快取，可以 `look.mjs clear`）。之後修改、換 session 接續都會用到。
8. 每階段的回報最多 15 行，子代理最多 25 行；工具呼叫超過「階段預算」就停下來回報卡在哪。

## 停點總表

| 停點 | 在哪一步 | 給我看什麼 | 我可以回 | 決定寫回哪裡 |
|---|---|---|---|---|
| ① 剪輯清單 | 剪乾淨 4 | 剪輯清單網址（每列可試聽，勾＝剪、取消＝保留，即時存回 `work/cuts.md`） | 「可以」、要改的列、「改好了」 | `work/cuts.md` 的「剪」欄（網頁寫或 AI 照我的話改） |
| ② 構圖 | 剪好看構圖 | 構圖台網址（在影片上拖框、開關調光瘦臉、選預覽參考圖）、`work/look-preview.jpg` | 「調好了」、「用建議的」 | plan.json `frame`、`look`（構圖台存檔時寫）；預覽參考圖 `shared/template/preview/speaker-local.jpg`（構圖台寫） |
| ③ 分鏡表 | 剪好看 3；④ 之後的改版 | 分鏡表網址（每段截圖＋可直接改的內容，情境動畫段附動畫分鏡，即時存回 `work/storyboard.md`）；改版看 `work/versions/<段>/v<N>/分鏡.md` | 「可以」、「改好了」、要改的段或拍 | `work/storyboard.md`（網頁寫或 AI 照我的話改）→ 正式 plan.json；情境動畫照確認過的動畫分鏡做；改版由 `versions.mjs accept` 寫回 storyboard.md |
| ④ Studio 預覽 | 剪好看 5 | Studio 網址 | 要改的段、「可以了，輸出完成影片」 | plan.json、`work/feedback/` |
| ⑤ 剪輯台 | 「打開剪輯台」 | 剪輯台網址 | 「調好了」、「照修改單改」 | 剪輯台自己寫；修改單 `work/feedback/editor-requests.md` |
| ⑥ 背景預覽 | 換風格 2 | 並排圖、留空區預覽 | 「可以」、「重做」 | `shared/template/bg-*.jpg` |

停下來時回覆最多 15 行（做完什麼、產物、要我決定的事、驗證），最後一行逐字用這行（`<…>` 換成實際值）：

```
⏸ 停點 ① 剪輯清單｜請看：<剪輯清單網址>｜請回：勾好後說「可以」，或要改的列
⏸ 停點 ② 構圖｜請看：<構圖台網址>、work/look-preview.jpg｜請回：拖好框按「儲存」後說「調好了」，或說「用建議的」
⏸ 停點 ③ 分鏡表｜請看：<分鏡表網址>｜請回：改好後說「可以」，或要改的地方
⏸ 停點 ③ 分鏡表（<段> v<N>）｜請看：work/versions/<段>/v<N>/分鏡.md｜請回：「可以」或要改的拍
⏸ 停點 ④ Studio 預覽｜請看：<Studio 網址>｜請回：要改的段落（例：s05 往左移）或「可以了，輸出完成影片」
⏸ 停點 ⑤ 剪輯台｜請看：<剪輯台網址>｜請回：調完按「儲存」後說「調好了」
⏸ 停點 ⑥ 背景預覽｜請看：<暫存資料夾>/preview.jpg、<暫存資料夾>/zones-fs.jpg｜請回：「可以」或「重做」
```

- 我的回覆對到最近一個「待回覆」的停點。不在停點上時最後一行寫 `→ 下一個停點：<編號> <名稱>（說「<觸發語>」開始）`；安裝清單用 `❓ 請回：「可以開始」或要拿掉的步驟編號`。
- 「不用停」：這一則訊息啟動的流程 ①–④ 都不停；「跑到停點 N」「做到分鏡表」「做到 Studio」：N 之前不停；下一則沒再說就恢復。⑤、⑥ 不能略過。略過時照樣寫檔、停點紀錄加「略過」，回報加 `⏭ 停點 <編號> 略過：<採用了什麼>`（① 「待確認」欄有寫字的列把「剪」改成 `[ ]`，不剪；② 用 `qc.mjs framing` 表上 ✔ 的建議框，沒有就不裁切；③ 沒勾的金句不上）。

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
| 主軌種類 | `assets/camera/`、`assets/voice/` 的檔，加上 `assets/screen/` 裡邊錄邊講的（`media.mjs main` 會印判斷） | 只有一支真人錄影＝`media.mjs main` 直接轉；其他＝停點 ① 問順序；有邊錄邊講的螢幕錄影＝那幾支只剪 NG，初剪後跑 `screen-sync` |
| 版式 | 我的話；沒說就看主軌寬高比（見「版式」） | 畫布、版面、字幕字數；plan.json `"format"` |
| 有沒有講稿 | `講稿.md` 在不在 | 沒有：字幕只轉繁體、補標點 |
| 有沒有螢幕錄影／圖片 | `assets/screen/`、`assets/images/` | 有：照 `auto-edit-screen` 配 |
| 長度 | ffprobe 主軌 | 不到 180 秒（3 分鐘）不用 01 章節轉場 |
| 有沒有業配段 | 講稿有「業配」「贊助」「優惠碼」→ 待確認 | 業配段不放 01 |
| 構圖 | 停點 ② 通過後填（倍率，或「不裁切」） | plan.json `frame` |

## 進度與回饋紀錄

- `work/製作進度.md` 固定四節：`## 開工決策表`、`## 階段`、`## 停點紀錄`、`## 回饋輪`。停點紀錄表頭 `| 時間 | 停點 | 狀態 | 使用者原話 | 寫回哪裡 |`；時間 `YYYY-MM-DD HH:MM`；停點寫 `① 剪輯清單`；狀態只有 `待回覆`、`通過`、`修改後重停`、`略過`。停下來先加一列「待回覆」，我回覆後**新增**一列、不改舊列；原話用「」逐字貼（超過 40 字截斷加「…」）。改版的停點寫 `③ 分鏡表（s12 v2）`。
- 使用者問「為什麼這麼久」「時間花在哪」：跑 `node shared/template/tools/status.mjs --project projects/<專案> --timeline`，照它印的總時長、等使用者回覆的時間、最久的幾段回答（看產物的建立時間與停點紀錄，舊專案也能看）。
- 「## 階段」的狀態：不管走哪一支 Skill（我直接說「剪乾淨」「打開剪輯台」也一樣），開始一個階段改成 🔄、停在停點改成 ⏸、做完改成 ✅。
- 回饋輪：停點 ④ 之後的修改開一輪 `r<N>`（N＝`status.mjs` 印的「下一輪回饋編號」；沒有工具時是 `work/feedback/` 裡 `r*.md` 的最大數字＋1）。改 plan.json 前先複製成 `work/hyperframes/plan.json.bak-r<N>`（Mac `cp`、Windows `Copy-Item`），改到的每一段在改之前、build 之後各跑一次 `versions.mjs save`（還沒有任何版本的段兩次都加 `--no-preview`）（見「段落版本與改版」）。`work/feedback/r<N>.md` 四節：原話、分類（規則／個案、改哪段、改法）、改了哪幾段、驗證。「規則」類（「以後都…」）這集照做，只記在「建議改規則」，不改 `shared/` 和本檔。

## 開新專案

我說「開一個新專案 <名稱>」時：

1. 建立 `projects/<名稱>/`，以及 `assets/camera`、`assets/voice`、`assets/screen`、`assets/images` 四個空資料夾。
2. 告訴我各放什麼：有畫面的講解放 `assets/camera/`；只有聲音的旁白放 `assets/voice/`（畫面會配螢幕錄影或圖片）；螢幕錄影放 `assets/screen/`（邊錄邊講的也放這裡，會自動接進主軌）；截圖、照片放 `assets/images/`；講稿存成 `projects/<名稱>/講稿.md`。
3. 等我放好素材，不要自己開始剪。最後一行：`→ 下一步：素材放好後說「剪乾淨」`。

## 剪乾淨（初剪）

我說「剪乾淨」「剪成初剪」時照 `auto-edit-rough` 做，產出都放 `work/`。NG＝同一句話講了兩次以上，只保留最後一次完整的；講到一半卡住、停下來重講的，卡住那次也算 NG。工具訊息寫的「剪乾淨」第 N 步＝`auto-edit-rough`：1 主軌＝步驟 1、2 逐字稿＝2、3 找 NG＝3、4 剪輯清單＝4–5（停點 ①）、5 初剪＝6、6 字幕＝7、7 剪接點＝8。`verify-rough` 印 ✖「初剪壞了」就照它印的 1–4 行重做，不要自己改 ffmpeg 或 auto-editor 參數。

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
- 秒數都由工具算（`ng-snap`、`srt-align`、`cutpoints`）：不要自己算 NG 起訖、拼 auto-editor 指令、累加格數或按字數比例算時間。
- 逐字稿只是找 NG 的依據，對講稿找重講用 `media.mjs ng-scan` 印的表，不要自己寫程式比對。whisper 在沒聲音處偶爾會補一句講稿的話，對不上的照講稿判斷；拿不準就放「待確認」，不要做音訊分析、比對舊版、拆段重轉或研究 VAD。
- whisper-cli 出現 `SIGABRT`，直接在指令最前面加 `GGML_METAL_BF16_DISABLE=1` 重跑，不用再查手冊。

## 剪好看（完成影片）

我說「剪好看」「做出完成影片」「包裝成完成影片」時，依序照 `auto-edit-storyboard` → `auto-edit-screen`（有素材）→ `auto-edit-motion`（有情境動畫）→ `auto-edit-review` → `auto-edit-deliver`；HyperFrames 專案在 `work/hyperframes/`。停點總表、工具訊息寫的「剪好看」第 N 步：構圖＝`auto-edit-storyboard` 步驟 1–2（停點 ②）；1 講者框＝步驟 3；2 素材與情境＝步驟 4–5；3 分鏡表＝步驟 6–7（停點 ③）；4 定稿＝`auto-edit-review` A1–A2；5 抽查＝A3–A4（停點 ④）；6 輸出＝`auto-edit-deliver`。我說「快速初稿」「先出初稿」：動畫段先放卡、停點 ④ 列出待做動畫（`auto-edit-storyboard` 步驟 5）。

硬規則：

- 構圖定之前不做分鏡；卡片和字幕不擋臉和手勢；「只有聲音」的區間一定被 media 段或不透明全幕蓋住（找不到對得上講解的錄影或圖片，就做不透明的全幕情境動畫，介面操作用 `x-ui-mock`）。
- 章節角標由 build 自動常駐：章節開始到下一章；子母畫面、全幕時自動隱藏；plan.json 不用寫 `chtag`。沒有 01 的短片，章節起點是那一章的 02 段。講稿有 `###` 小節：照 `--check` ⚠ 印的 `sections` 貼進 plan.json 第一層，角標改成「章號＋目前小節」（寬度跟著小節名）、子母畫面、全幕和橫式錄影段也看得到。
- 子母畫面一定有講者小視窗；只有純聲音素材的區間才沒有，那些全畫面段 build 自動換全寬版型（主卡 1680；`--check` 寫「全寬版型」）：04a 清單寫 `slots.visual` 主視覺，情境動畫照 `shared/style.md`「全寬」用滿寬度。`--check --json` 子母畫面段的 `pip` 是空的，先跑 `media.mjs verify-rough`，不要改版面繞過去。
- 卡片主文字、每條項目、每個動畫站的出現時間＝講到那個詞的時間：綁 `#N@詞`，差 ≤ 0.5 秒；`--check` 的「文字對時」✖ 全修、⚠ 逐項說明（情境動畫的站看 audit 的「綁句對不上」）。
- 音效只用 `shared/sfx/`，不下載素材、不登入第三方服務；回報貼 build 印的「人聲響度…」「音效比例…」「剪接點微淡化…」「講者調光…」「講者瘦臉…」「結尾配樂…」六行（沒開、沒配也貼，我才知道可以開），`--check` 的「音效次數」「音效密度」有 ⚠ 也要說；「音效稀疏」⚠ 照它列的段補到沒有。

| 剪好看的數字 | 值 |
|---|---|
| 構圖 | 構圖台拖框，最多放大 2 倍；建議框＝1.0／1.15／1.3 裡不切到手勢、每個像素放大 ≤ 3.5 倍的最大的；直式另看頭頂 y 380–520、下巴 ≤ 860 |
| 分鏡截圖 | `qc.mjs storyboard` 自己算：每段完成態（段尾前 0.6 秒）、條列逐條換的每次一張、錄影段每個標註到位一張 |
| 測試片段 | 3–5 秒，挑第一張資訊卡出現處 |

## 段落版本與改版（停點 ④ 之後）

停點 ④ 之後的修改照 `auto-edit-review`：指名段＋具體改法（位置、文字、時間、音效、大小，例「s05 往左移」）→ 流程 B 回饋輪；指名段但只說要更好（「更完善」「重新設計」「換個動畫」）→ 流程 D 改版，提案只寫在 `work/versions/<段>/v<N>/分鏡.md`，停點 ③ 確認才做；「s12 用 v1」「退回上一版」→ 流程 E；「照修改單改」、貼上「照剪輯台修改單改這 N 段（…editor-requests.md）…」或「# 剪輯台修改單」→ 流程 F：讀 `work/feedback/editor-requests.md`，修改單就是確認過的改法，直接改（不出提案、不停 ③），情境動畫段一段一個子代理同時派出（plan.json 只有你寫），全部回來後 build、audit，停在停點 ④；沒指名段（「動畫都更細節一點」）→ 先問要改哪幾段。改版也算一輪回饋（照「進度與回饋紀錄」開 `r<N>`）。版本只用 `versions.mjs` 建、退回，不要手動複製。

## 子代理分工

分鏡表確認後，獨立的工作分給子代理平行做；你（主代理）負責 plan.json、派工、整合與驗收。有能派子代理的工具就用（同一則回覆一次全部派出），沒有才自己照那支 Skill 一個一個做。

| 工作 | 什麼時候分 | 派給（一個一份，派工訊息照） | 子代理只能寫 |
|---|---|---|---|
| 情境動畫 | 2 段以上 | `worker`（`auto-edit-motion` 的 `references/worker-brief.md`） | 自己那支 `x-<名稱>.html` |
| 螢幕錄影配對 | 2 支以上 | `explore`（`auto-edit-screen`） | 不寫檔 |
| 抽查截圖 | 8 段以上 | `verifier`（`auto-edit-review` 的 `references/reviewer-brief.md`） | 不寫檔 |

1. `plan.json`、`work/storyboard.md`、`work/rough.srt` 只有你能寫。子代理只跑 `build.mjs --check` 和 `audit.mjs --only <自己的段>`（加 `--shots` 存截圖自己看）；不跑 build、不開 Studio、不 render，不改 `shared/`、`assets/`。
2. 派工寫清楚目標、負責的檔、要讀哪幾節、驗收條件、回報格式。派工前 build 一次（子代理的 audit 量它）；派出後等子代理回覆或完成通知，不要寫 `sleep` 迴圈去等檔案。收件用 `ls -l` 看時間是剛剛、`grep` 確認真的寫進去了；全部回來才由你跑 `--check`、build、audit、snapshot（中途只有改了 plan.json 才再 build，不要每收一個就 build），audit 有 ✖ 就把原文交回那個子代理。

## 剪映素材

我說「輸出剪映素材」「我要用剪映剪」→ `auto-edit-deliver` 步驟 5（`capcut.mjs`，產出在 `output/capcut/`；不用先輸出 final.mp4，章節角標不輸出）。

## 剪輯台

我說「打開剪輯台」→ `auto-edit-review` 流程 C（停點 ⑤）；「調好了」→ 重新讀 plan.json 與 rough.srt、build，回流程 A。剪輯台會寫哪些欄位見 `shared/template/EDITOR.md`「3. 剪輯台會寫哪些欄位」。AI 要改 plan.json 或 rough.srt 之前，先重新讀檔，不要蓋掉我在剪輯台存的設定；我在剪輯台改過的文字、斷句和時間，以我改的為準，不要再改回去；剪輯台重對句號後 `work/storyboard.md` 的句號可能過期，以 plan.json 為準。

## 換風格

我說「換風格」「換成我的風格」「換主色」「換背景」「生成背景圖」「換暗色」「換主題」「講者設定成…」時照 `auto-edit-style`（「換風格」第 2 步背景圖＝它的步驟 2–4：先放暫存資料夾，停點 ⑥ 我同意才放進 `shared/template/`）。只改規則 1 例外清單裡的檔；只改這一集的主題、風格包、調光瘦臉寫這一集 plan.json 第一層的 `theme`、`style`、`look`，不改 `shared/`；色名先轉成色碼；講者姓名、頭銜由我給，不要自己編。

## 環境準備

我說「幫我檢測環境」「安裝環境」「裝工具」這類話時，照 `auto-edit-setup`（讀 `setup/README.md` 照步驟做，每一步照它的格式回報進度）。需要輸入密碼（Mac 的 Homebrew）或按系統確認視窗（Windows 的 winget）的步驟，請我自己做；檢測顯示 `restart` 就請我重開 MiniMax Code，重開後還找不到就照 `auto-edit-setup`「開始前」加 PATH 前綴繼續，不要卡在重開。

## 工具注意事項

- `USAGE.md`、`USAGE-reference.md` 是查表用，Skill 會寫做到哪一步查哪一節；完成影片一律用 `build.mjs` 產生，不要從零寫。
- hyperframes 的指令（`snapshot`、`preview`、`render`）在子殼裡跑：`(cd projects/<專案>/work/hyperframes && npx hyperframes …)`，輸出路徑相對那個資料夾（完成影片是 `../../output/final.mp4`）。版本照根目錄 `package.json`：第一次、或 build 印「⚠ HyperFrames … 不同」時，在根目錄 `npm install`。
- 工具印「→ 下一步：<說明>」時，下面那一行（最後一行）就是可直接貼的指令：整行複製、單獨一行執行；說明那一行不是指令。
- 缺工具照 `setup/` 的手冊裝，不要自己想辦法。轉逐字稿一定帶 `--model small --language zh`（預設 `small.en` 會翻成英文）。
- 參數名稱以工具的 `--help` 為準（例 auto-editor 是 `--cut-out`，不是 `--cut`）。PowerShell 會把逗號拆開，帶逗號或冒號的參數加引號：`--cut-out "17sec,25sec"`、`--edit "audio:-20dB"`。
- `hyperframes check` 沒問題不代表版面正確，一定要看 `snapshot --review` 的截圖。`render` 沒有時間範圍參數，短片段用 `build.mjs --test`；render 很久就背景執行：指令前面加 `HYPERFRAMES_RENDER_DETACHED=1`，不要用 `nohup`、也不要只加 `&`；log 出現 `render_cancelled_parent_exited` 就照這樣重跑（`auto-edit-deliver` 步驟 3）。
- 調光由 build 套；瘦臉要跑 `look.mjs run`。build 印「瘦臉底片不是最新的」時照那一行的 → 做，不要改 build 參數繞過去。
