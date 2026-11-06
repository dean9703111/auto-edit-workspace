# 影片剪輯工作區規則

## 怎麼用這份檔

每個流程有一支 Skill（逐步指令、判準、退路），原始檔在 `.agents/skills/<名稱>/SKILL.md`；裝好的複本有出入時以原始檔為準。沒載入 Skill 就直接讀那個檔，讀不到就停下來告訴我（本檔只有規則和路由，沒有逐步指令）。

| 我說 | Skill |
|---|---|
| 「剪這支影片」「繼續」「做到哪了」 | `auto-edit-longform` |
| 「幫我檢測環境」 | `auto-edit-setup` |
| 「幫我分類 @projects/<專案> 裡的素材」「分類素材」 | `auto-edit-longform` 的 `references/sort-assets.md` |
| 「剪乾淨」 | `auto-edit-rough` |
| 「剪好看」「做出完成影片」 | `auto-edit-storyboard` |
| 「配螢幕錄影」 | `auto-edit-screen` |
| 分鏡表確認後做內容設計動畫 | `auto-edit-motion` |
| 定稿、預覽後的修改、「打開剪輯台」、「s12 重新設計」「s12 用 v1」、「照修改單改」「照剪輯台修改單改…」 | `auto-edit-review` |
| 「可以了，輸出完成影片」「輸出剪映素材」（使用者也可以在剪輯台按「輸出完成影片」，自己跑完測試片段、整支與驗收；已輸出就不要重做） | `auto-edit-deliver` |
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

**接手**：我說「繼續」或你不確定做到哪時，先跑 `node shared/template/tools/status.mjs --project projects/<專案>`，照它印的「下一步」做（下面那一行就是指令，整行複製執行）；有待回覆停點就重貼那個停點。它印「講者：⚠ 還沒設定」時，在回報裡問我姓名與頭銜（不擋流程，不要自己編）。

**長片是常態**（15–30 分鐘、400–900 句字幕）：能用工具一條做完的不要拆步驟；能同時做的同一則回覆一次派出；長時間的指令工具會背景跑，超過等待上限就再跑一次同一條（會接著等，不會重跑）。

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

直式的數字（畫布、版面、字幕、安全區、構圖）看 `shared/style.md`「直式」。

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
6. 每次交付都附上驗證方式（例如 ffprobe 的輸出、截圖），不要只說「完成了」。產物同時附**可點擊的超連結**：用 `<deliver-assets>` 內的 `<media>` 標籤，`src` 寫本地檔的**絕對路徑**（type 選 image／file／audio／video）。
7. `work/` 的中間檔交付後都要保留：`cuts.md`（含備份 `cuts.md.bak-*`）、`rough.mp4`（含備份 `rough.mp4.bak-*`）、`cutpoints.json`、`transcript-main.json`、`.jobs/`、`final-prerender.*`、`final-fingerprint.json`、`分鏡素材/`、`drafts/`、`designs/`、`briefs/`、`storyboard.md`、字幕（含備份 `rough.srt.align-*`、`rough.srt.bak-*`、`rough.srt.split-*`）、`screen-sync.json`、`transcript.json`（rough.mp4 的詞級逐字稿，`#N@詞` 用它）、`hyperframes/`（含 `plan.json.bak-*`）、`製作進度.md`、`feedback/`、`versions/`、`main.json`、`media/`、`face-landmarks.json`、`rough-look.mp4`、`look-preview.jpg`（`work/.look/` 是快取，可以 `look.mjs clear`）。之後修改、換 session 接續都會用到。
8. 每階段的回報最多 15 行，子代理最多 25 行；工具呼叫超過「階段預算」就停下來回報卡在哪。

## 停點總表

| 停點 | 在哪一步 | 給我看什麼 | 我可以回 | 決定寫回哪裡 |
|---|---|---|---|---|
| ① 剪輯清單 | 剪乾淨 4 | 剪輯清單網址（每列可試聽，勾＝剪、取消＝保留，即時存回 `work/cuts.md`） | 「可以」、要改的列、「改好了」 | `work/cuts.md` 的「剪」欄（網頁寫或 AI 照我的話改） |
| ② 構圖 | 剪好看構圖 | 構圖台網址（在影片上拖框、開關調光瘦臉、選預覽參考圖）、`work/look-preview.jpg` | 「調好了」、「用建議的」 | plan.json `frame`、`look`（構圖台存檔時寫）；預覽參考圖 `shared/template/preview/speaker-local.jpg`（構圖台寫） |
| ③ 分鏡表 | 剪好看 3；④ 之後的改版 | 分鏡表網址（每段截圖；模板是真實畫面，內容設計動畫看鏡位腳本；我能改畫面文字、選呈現方式與音效、勾金句、寫補充說明，即時存回 `work/storyboard.md`）；改版看 `work/versions/<段>/v<N>/分鏡.md` | 「可以」、「改好了」、要改的段或拍 | `work/storyboard.md`（網頁寫或 AI 照我的話改）→ `build.mjs --apply-storyboard` 套回 plan.json；內容設計動畫照確認過的鏡位腳本做；改版由 `versions.mjs accept` 寫回 storyboard.md |
| ④ 完成影片預覽 | 剪好看 5 | 完成影片預覽網址（剪輯台直接開在完成影片預覽） | 要改的段、「可以了，輸出完成影片」 | plan.json、`work/feedback/` |
| ⑤ 剪輯台 | 「打開剪輯台」 | 剪輯台網址 | 「調好了」、「照修改單改」 | 剪輯台自己寫；修改單 `work/feedback/editor-requests.md` |
| ⑥ 背景預覽 | 換風格 2 | 並排圖、留空區預覽 | 「可以」、「重做」 | `shared/template/bg-*.jpg` |

停下來時回覆最多 15 行（做完什麼、產物、要我決定的事、驗證），最後一行逐字用這行（`<…>` 換成實際值）：

```
⏸ 停點 ① 剪輯清單｜請看：<剪輯清單網址>｜請回：勾好後說「可以」，或要改的列
⏸ 停點 ② 構圖｜請看：<構圖台網址>、work/look-preview.jpg｜請回：拖好框按「儲存」後說「調好了」，或說「用建議的」
⏸ 停點 ③ 分鏡表｜請看：<分鏡表網址>｜請回：改好後說「可以」，或要改的地方
⏸ 停點 ③ 分鏡表（<段> v<N>）｜請看：work/versions/<段>/v<N>/分鏡.md｜請回：「可以」或要改的拍
⏸ 停點 ④ 完成影片預覽｜請看：<完成影片預覽網址>｜請回：要改的段落（例：s05 往左移）或「可以了，輸出完成影片」
⏸ 停點 ⑤ 剪輯台｜請看：<剪輯台網址>｜請回：調完按「儲存」後說「調好了」
⏸ 停點 ⑥ 背景預覽｜請看：<暫存資料夾>/preview.jpg、<暫存資料夾>/zones-fs.jpg｜請回：「可以」或「重做」
```

- 我的回覆對到最近一個「待回覆」的停點。不在停點上時最後一行寫 `→ 下一個停點：<編號> <名稱>（說「<觸發語>」開始）`；安裝清單用 `❓ 請回：「可以開始」或要拿掉的步驟編號`。
- 「不用停」：這一則訊息啟動的流程 ①–④ 都不停；「跑到停點 N」「做到分鏡表」「做到預覽」（舊說法「做到 Studio」也算）：N 之前不停；下一則沒再說就恢復。⑤、⑥ 不能略過。略過時照樣寫檔、停點紀錄加「略過」，回報加 `⏭ 停點 <編號> 略過：<採用了什麼>`（① 「待確認」欄有寫字的列把「剪」改成 `[ ]`，不剪；② 用 `qc.mjs framing` 表上 ✔ 的建議框，沒有就不裁切；③ 沒勾的金句不上）。只有聲音的專案沒有 ②。

## 階段預算

單位是工具呼叫次數（建議初值）。

| 階段 | 上限 | 階段 | 上限 |
|---|---|---|---|
| 接手 | 2 次 | 素材盤點（每支、每批，子代理） | 3 次 |
| 到停點 ① | 4 次 | 配一支錄影的標註 | 6 次 |
| ① 通過到初剪回報 | 4 次 | 內容設計動畫：鏡位腳本（每段） | 6 次 |
| 初剪到停點 ② | 6 次 | 內容設計動畫：做動畫（每段） | 18 次 |
| 量講者框 | 3 次 | ③ 通過到停點 ④（主代理） | 8 次 |
| 每份草稿（子代理） | 15 次 | 回饋輪每一項 | 6 次 |
| 合併到停點 ③（主代理） | 10 次 | 交付 | 4 次 |
| 改版開提案到停點 ③（每段） | 6 次 | 改版確認後到停點 ④（不含動畫） | 12 次 |
| 剪映素材 | 4 次 | 換風格 | 15 次 |
| 環境準備 | 同一步失敗 2 次就停 | | |

## 開工（每個專案第一次）

`media.mjs prep`（或 `status.mjs --init`）自動填 `work/製作進度.md` 的開工決策表，不用手動查。會影響後面流程的只有這些：

| 欄 | 會影響什麼 |
|---|---|
| 主軌種類 | 只有真人、真人＋聲音混用、只有聲音。多支主軌：停點 ① 問順序。**只有聲音：沒有講者，跳過停點 ② 和講者框**。邊錄邊講的螢幕錄影只剪 NG，初剪後自動 `screen-sync` |
| 版式 | 畫布、版面、字幕字數；plan.json `"format"` |
| 有沒有講稿 | 沒有：字幕只轉繁體、補標點 |
| 有沒有螢幕錄影／圖片 | 有：開工時就掃、初剪後盤點（`auto-edit-screen`），不管主軌是真人還是聲音 |
| 長度 | 不到 180 秒（3 分鐘）不用 01 章節轉場 |
| 有沒有業配段 | 業配段不放 01 |

## 進度與回饋紀錄

- `work/製作進度.md` 由工具寫，不要手動 Read＋Edit：`node shared/template/tools/status.mjs --project projects/<專案> --mark "<停點>" --state <狀態> --said "我的原話" --back "寫回哪裡"`（時間工具蓋）。停點寫 `① 剪輯清單`；狀態只有 `待回覆`、`通過`、`修改後重停`、`略過`。改版的停點寫 `③ 分鏡表（s12 v2）`。很多指令已經自動記（`media.mjs prep`、`build.mjs --storyboard`、`--review`、`deliver.mjs`），工具印了就不用再記。
- 使用者問「為什麼這麼久」「時間花在哪」：跑 `status.mjs --project projects/<專案> --timeline`，照它印的總時長、等使用者回覆的時間、最久的幾段回答。
- 回饋輪：停點 ④ 之後的修改用 `versions.mjs begin --seg <段> --say "我的原話"` 開一輪（備份、版本、`work/feedback/r<N>.md` 都由它做，只印這幾段的 plan），改完跑 `versions.mjs finish`。「規則」類（「以後都…」）這集照做，只記在 r<N>.md 的「建議改規則」，不改 `shared/` 和本檔。

## 開新專案

我說「開一個新專案 <名稱>」時：

1. 建立 `projects/<名稱>/`，以及 `assets/camera`、`assets/voice`、`assets/screen`、`assets/images` 四個空資料夾。
2. 告訴我各放什麼：有畫面的講解放 `assets/camera/`；只有聲音的旁白放 `assets/voice/`（畫面會配螢幕錄影或圖片）；螢幕錄影放 `assets/screen/`（邊錄邊講的也放這裡，會自動接進主軌）；截圖、照片放 `assets/images/`；講稿存成 `projects/<名稱>/講稿.md`。
3. 等我放好素材，不要自己開始剪。最後一行：`→ 下一步：素材放好後說「剪乾淨」`。

## 剪乾淨（初剪）

照 `auto-edit-rough` 做，兩條指令：`media.mjs prep` 到停點 ①，`media.mjs rough` 到字幕與剪接點。NG＝同一句話講了兩次以上，只保留最後一次完整的；講到一半卡住、停下來重講的，卡住那次也算 NG。工具訊息寫的「剪乾淨」第 N 步：1–4＝`media.mjs prep`、5–7＝`media.mjs rough`。`verify-rough` 印 ✖「初剪壞了」就照它印的做，不要自己改 ffmpeg 或 auto-editor 參數。

| 剪乾淨的數字 | 值 |
|---|---|
| 靜音門檻 | 預設 `-20dB`（很小聲的錄音工具自動降）；尾音被切放寬到 `-26dB`、`-30dB`；自言自語沒剪收緊到 `-16dB` |
| 字幕 | 一則＝講稿一行（完整語句）；每則最多 18 字（直式 10 字），超過在「、，」處拆；同一口氣的短行併；不顯示「，。；：」，保留「、！？」 |

- 秒數都由工具算，字幕斷句只用 `srt-align`：不要自己算 NG 起訖、拼 auto-editor 指令、按字數切字幕。
- 逐字稿只是找 NG 的依據；whisper 在沒聲音處偶爾會補一句講稿的話。拿不準就放「待確認」，不要做音訊分析、比對舊版、拆段重轉或研究 VAD。

## 剪好看（完成影片）

我說「剪好看」「做出完成影片」時，依序照 `auto-edit-storyboard` → `auto-edit-motion`（有內容設計動畫）→ `auto-edit-review` → `auto-edit-deliver`；有素材就先 `auto-edit-screen` 盤點。從「剪這支影片」「繼續」進來時，初剪做完直接接構圖，不用等我再說一次；只有我明說「剪乾淨」才停在初剪。工具訊息寫的「剪好看」第 N 步：構圖＝`auto-edit-storyboard` 步驟 1–3（停點 ②）；1 講者框＝步驟 4；2 素材與情境＝步驟 5–6；3 分鏡表＝步驟 7（停點 ③）；4 定稿＝`build.mjs --review`；6 輸出＝`deliver.mjs`。

**畫面有三條路，省下來的時間都花在第 2 條：**

| 路 | 什麼時候 | 怎麼做 |
|---|---|---|
| 1. 錄影、圖片 | 有對得上講解的素材 | media 段（`auto-edit-screen`） |
| 2. **內容設計動畫** | 故事、比喻、因果轉折、抽象道理、最想讓人記住的畫面。**每 2 分鐘至少 1 段（建議初值）** | 設計師子代理從內容出發：先寫鏡位腳本，③ 確認後從空白畫布做。**不參考、不複製模板畫面** |
| 3. 模板 | 條列、流程、數字、字卡 | plan.json 寫 `template`／`scene`＋`slots`，工具直接產出，不用改 HTML、不用工人 |

硬規則：

- 排分鏡先跑 `build.mjs --scaffold`，查規格看 `work/分鏡素材/`；秒數 build 自己算，不要查 `transcript.json`、不要自己寫 script。分鏡表由工具產生，不要手寫。
- 構圖定之前不做分鏡；卡片和字幕不擋臉和手勢；「只有聲音」的區間一定被 media 段或不透明全幕蓋住（找不到對得上的素材，就做不透明的全幕動畫）。
- 章節角標由 build 自動常駐；沒有 01 的短片，章節起點是那一章的 02 段；講稿有 `###` 小節由 `--merge-drafts` 自動寫 `sections`。
- 子母畫面一定有講者小視窗；只有純聲音素材的區間才沒有，那些全畫面段 build 自動換全寬版型。`--check --json` 子母畫面段的 `pip` 是空的，先跑 `media.mjs verify-rough`，不要改版面繞過去。
- 卡片主文字、每條項目、每個動畫站的出現時間＝講到那個詞的時間：綁 `#N@詞`，差 ≤ 0.5 秒；`--check` 的「文字對時」✖ 全修、⚠ 逐項說明。
- 音效只用 `shared/sfx/`，不下載素材、不登入第三方服務；回報貼 build 印的「人聲響度…」「音效比例…」「剪接點微淡化…」「講者調光…」「講者瘦臉…」「結尾配樂…」六行（`--review` 會印），「音效稀疏」⚠ 照它列的段補到沒有。

| 剪好看的數字 | 值 |
|---|---|
| 構圖 | 構圖台拖框，最多放大 2 倍；建議框＝1.0／1.15／1.3 裡不切到手勢、每個像素放大 ≤ 3.5 倍的最大的；直式另看頭頂 y 380–520、下巴 ≤ 860 |

## 段落版本與改版（停點 ④ 之後）

停點 ④ 之後的修改照 `auto-edit-review`：指名段＋具體改法（位置、文字、時間、音效、大小，例「s05 往左移」）→ 流程 B（`versions.mjs begin`／`finish`）；指名段但只說要更好（「更完善」「重新設計」「換個動畫」）→ 流程 D 改版：**內容設計動畫要重新從內容想，不是換模板**，提案寫在 `work/versions/<段>/v<N>/分鏡.md`，停點 ③ 確認才做；「s12 用 v1」「退回上一版」→ 流程 E；「照修改單改」、貼上「照剪輯台修改單改這 N 段（…editor-requests.md）…」或「# 剪輯台修改單」→ 流程 F：讀 `work/feedback/editor-requests.md`，修改單就是確認過的改法，直接改，情境動畫段一段一個子代理同時派出（plan.json 只有你寫），全部回來後 `--review`，停在停點 ④；沒指名段（「動畫都更細節一點」）→ 先問要改哪幾段。版本只用 `versions.mjs` 建、退回，不要手動複製。

## 子代理分工

獨立的工作分給子代理平行做；你（主代理）負責 plan.json、派工、整合與驗收。有能派子代理的工具就用，**同一則回覆一次全部派出**，超過 8 個就分批，回來再派下一批；沒有才自己照那支 Skill 一個一個做。

| 工作 | 什麼時候分 | 派工訊息 | 子代理只能寫 |
|---|---|---|---|
| 素材盤點 | 有素材就分：每支錄影、每批圖片一個 | `auto-edit-screen` 步驟 1 | `work/media/notes/<檔名>.json` |
| 分章寫草稿 | `--scaffold` 切成 2 份以上 | `auto-edit-storyboard` 的 `references/chapter-worker.md` | `work/drafts/<份>.json` |
| 內容設計動畫：鏡位腳本 | 每段一個（③ 之前） | `auto-edit-motion` 的 `references/design-brief.md` 階段一 | `work/designs/<段>.md` |
| 內容設計動畫：做動畫 | 每段一個（③ 之後） | 同上，階段二 | `compositions/x-design-<段>.html`、`illus-local/` 自己新畫的 |
| 新畫線稿元件 | 動畫之前，每個元件一個 | `auto-edit-motion` 的 `references/illus-worker.md` | `illus-local/<名稱>.svg` |
| 錄影的運鏡與標註 | 2 支以上 | `auto-edit-screen` 步驟 2–3 | `work/media/frames/`，結果回報給你寫草稿 |
| 手改模板動畫 | 修改單、使用者指定模板做不到的改動 | `auto-edit-motion` 的 `references/worker-brief.md` | 那一支 `compositions/<模板>-<段>.html` |

1. `plan.json`、`work/storyboard.md`、`work/rough.srt` 只有你能寫。子代理只跑 `--check-draft`（自己那份）和 `audit.mjs --only <自己的段> --shots --sheet`；不跑 build、不開剪輯台、不 render，不改 `shared/`、`assets/`。別段有 ✖ 不影響 `--only`。
2. 派出後等子代理回覆或完成通知，不要寫 `sleep` 迴圈去等檔案。全部回來才由你跑 `--merge-drafts` 或 `--review`，不要每收一個就 build；audit 有 ✖ 就把原文交回那個子代理。

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
- hyperframes 的指令（`snapshot`、`render`）在子殼裡跑：`(cd projects/<專案>/work/hyperframes && npx hyperframes …)`，輸出路徑相對那個資料夾（完成影片是 `../../output/final.mp4`）。版本照根目錄 `package.json`：第一次、或 build 印「⚠ HyperFrames … 不同」時，在根目錄 `npm install`。
- 工具印「→ 下一步：<說明>」時，下面那幾行就是可直接貼的指令：整行複製、依序單獨一行執行；說明那一行不是指令。結束碼 75（印「⏳ 還在跑」）就再跑一次同一條，會接著等、不會重跑。
- 缺工具照 `setup/` 的手冊裝，不要自己想辦法。轉逐字稿用 `media.mjs transcribe`（已帶 `--model small --language zh` 與 Mac 需要的環境變數）。
- 參數名稱以工具的 `--help` 為準（例 auto-editor 是 `--cut-out`，不是 `--cut`）。PowerShell 會把逗號拆開，帶逗號或冒號的參數加引號：`--cut-out "17sec,25sec"`、`--edit "audio:-20dB"`。
- 輸出一律用 `deliver.mjs`（背景跑、接著等，不用輪詢 log）。版面用 `build.mjs --review` 的完成態拼圖看；全片 `snapshot --review` 很慢（15 段就 164 格、60 秒），只有我要求逐格看才跑。
- 調光由 build 套；瘦臉要跑 `look.mjs run`。build 印「瘦臉底片不是最新的」時照那一行的 → 做，不要改 build 參數繞過去。
