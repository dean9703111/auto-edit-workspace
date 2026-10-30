# 影片剪輯工作區規則

## 專案

一支影片＝一個專案資料夾 `projects/<專案>/`。我的提示詞會指定專案（例如 `@projects/範例`）；沒指定就列出 `projects/` 底下的專案，問我要處理哪一個。

一次只處理一個專案，不要讀寫其他專案的 `work/`、`成片/`。下面規則裡的 `<專案>` 都是這個專案的資料夾名稱，所有指令都在工作區根目錄執行。

專案資料夾長這樣：

```
projects/<專案>/
├─ 講稿.md            這支影片的講稿（選用）
├─ 素材/
│  ├─ 真人錄影/       有畫面有聲音的口播（主軌）
│  ├─ 聲音/           只有聲音的口播或旁白（主軌，沒有畫面）
│  ├─ 螢幕錄影/       操作畫面（插入用，預設靜音）
│  └─ 圖片/           截圖、照片（插入用）
├─ work/              中間產物
└─ 成片/              final.mp4、測試片段/、驗收截圖/
```

## 資料夾

| 資料夾 | 用途 | 權限 |
|---|---|---|
| `setup/` | 環境檢測與安裝手冊（Mac／Windows），我說「幫我檢測環境」時照它做 | 只能讀 |
| `shared/` | 每支影片共用：`style.md`（風格規範）、`template/`（情境庫模板與工具）、`sfx/`（可用的音效，只能從這裡挑） | 只能讀（例外：我要求換主色或背景時，可以改 `shared/template/kit/brand.css`、`shared/template/kit/pip-frame.png`（`brand.mjs` 會重畫）與 `shared/template/bg.jpg`） |
| `projects/<專案>/素材/` | 真人錄影、聲音、螢幕錄影、圖片 | 只能讀，不可覆寫、移動或刪除 |
| `projects/<專案>/講稿.md` | 這支影片的講稿 | 只能讀 |
| `projects/<專案>/work/` | 中間產物：逐字稿、剪輯清單、初剪、HyperFrames 專案 | AI 可新增、修改 |
| `projects/<專案>/成片/` | 最終成品、測試片段、驗收截圖 | AI 可新增 |
| `dev/` | 作者維護工作區用的測試與工具（有 Python），不是剪片流程的一部分 | 剪片時不要讀、不要執行；找不到合適的工具時照 `shared/template/USAGE.md`，也不要自己另寫腳本 |

## 規則

1. 不要覆寫、移動或刪除 `projects/*/素材/`、`projects/*/講稿.md`、`shared/` 的任何檔案（例外：我要求換主色或背景時，可以改 `shared/template/kit/brand.css`、`shared/template/kit/pip-frame.png` 與 `shared/template/bg.jpg`）；要刪除 `work/` 以外的檔案前，先問我。
2. 提示詞裡寫「停下來等我確認」的地方，一定要停：剪輯清單、分鏡表、Studio 預覽、剪輯台都要經過我同意。
3. 安裝新工具前，先告訴我指令和用途，等我同意再執行。照 `setup/` 手冊做時，整份清單問一次就好。
4. 字幕以專案的 `講稿.md` 為準校正；用繁體中文，技術名詞保留英文原文，中英文之間加半形空格。沒有講稿就只轉繁體、補標點，不要自己猜內容。
5. 視覺、版型、字幕、音效的做法以 `shared/template/USAGE.md`（核心）與 `shared/template/USAGE-reference.md`（參考）為準；節奏與字卡文字以 `shared/style.md` 為準；有衝突時先問我。
6. 每次交付都附上驗證方式（例如 ffprobe 的輸出、截圖），不要只說「完成了」。
7. `projects/<專案>/work/` 的中間檔交付後都要保留：剪輯清單 `work/cuts.md`、剪接點 `work/cutpoints.json`、分鏡表 `work/storyboard.md`、字幕、動畫設定 `work/hyperframes/plan.json`、HyperFrames 專案 `work/hyperframes/`；有接主軌時還有 `work/main.json`；有插入螢幕錄影或圖片時還有 `work/media/`。之後要修改或封裝成 Skill 都會用到。

## 開新專案

我說「開一個新專案 <名稱>」時：

1. 建立 `projects/<名稱>/`，以及 `素材/真人錄影`、`素材/聲音`、`素材/螢幕錄影`、`素材/圖片` 四個空資料夾。
2. 告訴我各放什麼：有畫面的口播影片放 `素材/真人錄影/`；只有聲音的旁白放 `素材/聲音/`（畫面會自動配螢幕錄影或圖片）；操作畫面的螢幕錄影放 `素材/螢幕錄影/`；截圖、照片放 `素材/圖片/`；講稿存成 `projects/<名稱>/講稿.md`。
3. 等我放好素材再說下一步，不要自己開始剪。

## 剪乾淨（初剪）

我說「把 X 剪成初剪」「剪乾淨」時，照這個順序做，產出都放 `projects/<專案>/work/`：

1. 決定主軌。主軌是 `素材/真人錄影/` 和 `素材/聲音/` 兩個資料夾的檔案，照檔名排序接起來：
   - 只有一支真人錄影：直接用它。
   - 有多支，或有聲音檔：先列出接起來的順序，併在第 3 步的剪輯清單那一停讓我確認。我確認後再執行 `node shared/template/tools/media.mjs main --project projects/<專案> [--order 檔名1,檔名2,…]`，接成 `work/main.mp4`（同時寫 `work/main.json`，記錄每一段來自哪個檔案、在主軌的第幾秒）。聲音檔會配純黑畫面。之後轉逐字稿、auto-editor 都對 `work/main.mp4` 做。
2. 轉逐字稿：`npx hyperframes transcribe "projects/<專案>/素材/真人錄影/<檔名>" -d projects/<專案>/work --model small --language zh --json`（有接主軌就改成 `work/main.mp4`；`-d projects/<專案>/work` 是讓逐字稿存進 `work/`，不要寫進 `素材/`）。
3. 找 NG：同一句話講了兩次以上，代表講錯重來，只保留最後一次完整的版本；講到一半卡住、停下來重講的，卡住那次也算 NG。
4. 列剪輯清單：用表格列出要剪掉的 NG（時間碼、內容、原因），存成 `work/cuts.md`，**停下來等我確認**（有接主軌的話，主軌順序也在這一停）。句子之間的空白不用列，下一步 auto-editor 會處理。
5. 我確認後，用 auto-editor 一次輸出 `work/rough.mp4`，加 `--no-open` 不要自動開播放器：
   - 沒講話的空白和停頓：`--edit audio:-20dB`（門檻是相對整支影片最大聲的那一點，-20dB 等於 `threshold=0.1`），先用 `--preview` 看會剪掉多少。正常講話的尾音被切到就放寬到 `-26dB` 或 `-30dB`；小聲的自言自語沒剪掉就收緊到 `-16dB`。改了門檻要再 `--preview` 一次再輸出
   - NG：把清單裡的時間範圍一起剪掉。逐字稿的時間碼會有誤差，每段的起訖點要對齊前後的靜音，不要切到字
6. 對 `work/rough.mp4` 重新轉逐字稿，存成 `work/rough.srt`：照規則 4 用 `講稿.md` 校正錯字和專有名詞；每則最多 18 個字，優先在標點處斷開。
   字幕校正完、確定句子不會再拆合之後，把字幕對齊實際開口的時間（逐字稿只有整句的時間碼，常比嘴巴早 1 秒左右）：先跑 `node shared/template/tools/media.mjs snap-srt --project projects/<專案> --dry-run`，看調整表合不合理，再去掉 `--dry-run` 執行。它會把原檔備份成 `work/rough.srt.bak-<時間戳>`。**只跑這一次**，之後我在剪輯台改的時間不要再被它覆蓋。
7. 回報：原始長度、初剪長度、剪掉幾段（用 auto-editor 自己印的統計）、snap-srt 調整了幾則（起點、結尾各幾則，最大調整量），以及每個剪接點在 `rough.mp4` 的時間。剪接點這樣算：用跟第 5 步一樣的參數再跑一次 `auto-editor … --export v1 -o work/cuts.v1`（只寫 JSON，不轉檔），`chunks` 每一項是 `[起始幀, 結束幀, 速度]`，速度 `1.0` 是保留段、`99999` 是剪掉；把保留段的長度依序累加（幀數除以影片 fps）就是每個剪接點在 `rough.mp4` 的秒數，順便標出哪幾個是 NG、哪幾個只是停頓。**另外存成 `work/cutpoints.json`**，格式：`{ "cuts": [ { "at": 12.34, "kind": "ng" }, { "at": 20.5, "kind": "pause" } ] }`（`at` 是 `rough.mp4` 的秒數，`kind` 是 `"ng"` 或 `"pause"`），剪輯台和轉場會用到。

剪乾淨時不要做的事：

- 初剪輸出後只做兩件事驗證：`ffprobe` 看解析度和長度、看 auto-editor 印的統計。不要拿波形跟原始檔比對、不要用對齊演算法還原切口、不要算字幕的語音覆蓋率、不要自己寫程式拿音訊驗證字幕；字幕文字只照講稿校正，時間對齊只用 `snap-srt` 一個指令。

- 逐字稿只是找 NG 的依據，不用拿音軌去驗證它。whisper 在沒聲音的地方偶爾會自己補一句講稿裡的話，遇到逐字稿跟講稿對不上的句子，照講稿判斷；拿不準就在剪輯清單加一欄「待確認」交給我，不要自己做音訊分析、比對舊版影片、拆段重新轉錄或研究 VAD。
- whisper-cli 出現 `SIGABRT`，直接在指令最前面加 `GGML_METAL_BF16_DISABLE=1` 重跑，不用再查手冊。
- 從開始到列出剪輯清單，工具呼叫超過 10 次還沒列出來，就先停下來把目前進度和卡住的點告訴我。

## 剪好看（成片）

我說「把 X 包裝成成片」「做成片」時，照 `shared/template/USAGE.md` 第 2 節的 SOP 做，HyperFrames 專案放 `projects/<專案>/work/hyperframes/`。下面是我的要求，USAGE.md 沒寫到的以這裡為準：

1. 字幕用 `work/rough.srt`（已校正，不要重新轉錄）。
2. 版面：看專案資料夾裡檔名含「場地照」的圖判斷講者的位置（這種圖只用來量位置，不會插進影片），沒有就從 `work/rough.mp4` 截一張存成 `work/場地照.jpg`；再跑 `node shared/template/tools/qc.mjs speaker --project projects/<專案>`，看 `work/場地照-動作範圍.jpg`（8 張畫面的疊影＋格線）量手勢會比到哪，座標直接寫進講者框（做法照 `shared/template/USAGE.md` 2.2）；資訊卡和字幕都不能擋到臉和手勢。
3. 螢幕錄影與圖片：`素材/螢幕錄影/`、`素材/圖片/` 有檔案，或 `node shared/template/tools/build.mjs --check --project projects/<專案>` 回報有「只有聲音」的區間（旁白沒有畫面）時，先跑 `node shared/template/tools/media.mjs scan --project projects/<專案>`，看 `work/media/` 裡的 contact sheet，對照字幕，自己找出每段口播該配哪支錄影的第幾秒，寫進分鏡表（media 列要寫素材檔名與起點秒數），用 media 段插入。錄影裡有操作時，依口播加運鏡、紅框、放大鏡（座標用 `media.mjs frame --grid` 截格線圖來讀），做法照 `shared/template/USAGE.md` 第 5 節。「只有聲音」的區間一定要被 media 段（或不透明的全畫面情境）蓋住。
4. 情境動畫優先：口播在講一個情境（過程、前後對比、數值變化、比喻、因果、沒有錄影的介面操作）時，做第二層情境動畫，從 `shared/template/custom/` 的範例改（挑法見 `shared/template/USAGE-reference.md` R7.1）；合適的動畫越多越好，字卡只放名詞、一句重點和提醒。
   資訊卡：版型只從 `shared/template/` 的情境庫裡挑，照每個情境標的使用時機和進場方式；密度、字數、進場時機、停留時間照 `shared/style.md`；講到 3 個以上並列的項目用條列卡。情境有圖示欄位就配圖示（圖示先行，做法見 `shared/template/USAGE-reference.md` R2.7），分鏡表的「畫面文字」欄寫出圖示名稱。
5. 音效：只用 `shared/sfx/`，照 `shared/style.md` 的對照表。build 會自動把人聲調到 −14 LUFS，並在剪接點做 15 毫秒的微淡化；回報時把 build 印的「人聲響度…」「剪接點微淡化…」那兩行貼給我，有「音效比例」的提醒也要說。
6. 分鏡表用表格列出（段落編號、時間碼、字幕、卡片類型、畫面文字、音效、理由），段落編號用 s01、s02… 並跟 plan.json 的 `id` 一致，**停下來等我確認**；我確認後先存成 `work/storyboard.md` 再開始做。
7. 做好之後，有情境動畫就先跑 `node shared/template/tools/audit.mjs --project projects/<專案>` 量版面，✖ 全部修掉（⚠ 照 → 處理，或說明保留的理由）；再用 `cd projects/<專案>/work/hyperframes && npx hyperframes snapshot --review` 抽查開頭、中間、結尾和每個轉場（段數多時照下面「子代理分工」分給 verifier 一起看），自己檢查文字斷行、字幕、卡片位置，有問題先修好；再用 `npx hyperframes preview --no-open` 開 Studio，把網址給我，**停下來等我確認**。我看完說「s05 的金句卡往左移」這類要求時，直接改 plan.json 那一段再重跑 build（做法照 `shared/template/USAGE.md` 2.6），不需要我在 Studio 點選。
8. 我說可以之後，先輸出 3–5 秒的測試片段（挑第一張資訊卡出現的地方）到 `成片/測試片段/`，用 ffprobe 確認有音軌、截一張畫面確認版面；沒問題再輸出 `成片/final.mp4`，然後跑 `node shared/template/tools/qc.mjs final --project projects/<專案>` 驗收（格式、長度、響度、畫面凍結、黑畫面、長時間沒聲音，做法照 `shared/template/USAGE.md` 2.8）：有 ✖ 先修好再交；⚠ 逐項說明是不是刻意的。把輸出和 `成片/驗收截圖/qc-sheet.jpg` 一起給我。

## 子代理分工（實作動畫時）

「剪好看」的分鏡表確認之後，彼此獨立的工作分給子代理同步做；你（主代理）負責分鏡、寫 plan.json、派工、整合與驗收。

| 工作 | 什麼時候分 | 派給 | 子代理只能寫 | 交回 |
|---|---|---|---|---|
| 第二層情境動畫（`shared/template/USAGE-reference.md` R7） | 分鏡表有 2 段以上情境動畫 | `worker`，一段一個 | 自己那支 `work/hyperframes/compositions/x-<名稱>.html` | 檔案路徑、長度 D、對到的句號、R7.6 檢查的結果 |
| 螢幕錄影配對（`shared/template/USAGE.md` 第 5 節） | `素材/螢幕錄影/` 有 2 支以上 | `explore`，一支一個 | 不寫檔 | 每段口播該配的起點秒數、運鏡／紅框／放大鏡的座標 |
| 抽查截圖（「剪好看」第 7 步） | 分鏡表 8 段以上 | `verifier`，每個看一段範圍（例：s01–s06） | 不寫檔 | 每段 PASS／FAIL、問題、截圖檔名 |

1. `plan.json`、`work/storyboard.md`、`work/rough.srt` 只有你能寫。子代理不跑 build、不開 Studio、不 render，也不改 `shared/`、`素材/`。
2. 派工時寫清楚：目標、它負責的檔案、要讀哪幾節規則（`shared/template/USAGE.md`／`USAGE-reference.md` 的節號、`shared/style.md`）、驗收條件、回報格式。
3. 子代理回報完成後，用 `ls -l`、`grep` 確認檔案真的寫進去了再整合（子代理可能回報完成，檔案卻沒寫進去）。
4. 全部回來之後才由你跑 `--check`、build、audit、snapshot。audit 有 ✖ 就把那幾行原文交回給寫那支情境動畫的子代理修。只有一件事可分時自己做，不用派。

## 剪輯台

我說「打開剪輯台」時：

1. 照 `shared/template/EDITOR.md`，在背景啟動 `node shared/template/tools/editor.mjs --project projects/<專案>`，把網址給我，**停下來等我調完**。我會在瀏覽器裡拖拉裁剪素材、調音量、加淡入淡出和轉場、修改字幕和動畫上的文字，按「儲存」。
2. 我說「調好了」，就重跑 build，再照「剪好看」第 7、8 步抽查與輸出。
3. 剪輯台會改的地方：plan.json 的 `edit`；media 段的 `from`／`to`／`in`／`anchor`／`enter`／`exit`／`volume`；任何段落的 `sfxVolume`、`sfx: null`、`slots`／`vars` 的文字；`work/rough.srt` 的字幕文字與起訖時間，也可以新增、分割、合併、刪除字幕（句子數量變動時，剪輯台會把 plan.json 所有綁句的 `#N` 一起重新對好，`work/storyboard.md` 的句號因此可能過期，以 plan.json 為準）。AI 要改 plan.json 或 rough.srt 之前，先重新讀檔，不要蓋掉我在剪輯台存的設定；我在剪輯台改過的文字、斷句和時間，以我改的為準，不要再改回去。

## 換風格

我說「使用「換風格」流程」「換成我的風格」「換主色」「換背景」時：

1. 主色：用 `node shared/template/tools/brand.mjs "#RRGGBB"` 換（它會寫入 `shared/template/kit/brand.css` 的 `--brand`、算好 `--brand-ink`／`--brand-text` 的對比，並重畫子母畫面外框 `shared/template/kit/pip-frame.png`）。我給的是顏色名稱就先轉成色碼，回報你用了哪個色碼；主色太深、對比不夠時 brand.mjs 會自動把字的顏色調亮，不用問我。
2. 背景圖：我有上傳圖片，就縮放／裁切成 1920×1080 存成 `shared/template/bg.jpg`；沒有就依主色生成一張同色系的暗色背景圖存到同一路徑。主要內容不要放在左上角，全畫面的白卡會蓋在那裡。
3. 改完告訴我改了哪些檔，我會重新打開 `shared/template/index.html` 預覽。

## 環境準備

- 我說「幫我檢測環境」「檢測環境」「安裝環境」「裝工具」這類話時，先讀 `setup/README.md`，照它的步驟做；每做完一步，照 `setup/README.md` 規定的格式回報進度。
- 需要輸入密碼（Mac 的 Homebrew）或按系統確認視窗（Windows 的 winget）的步驟，請我自己做。
- 裝完工具後（Mac、Windows 都可能），檢測顯示 `restart` 就請我關掉 MiniMax Code 重開，再說一次「幫我檢測環境」。重開後還是找不到，就在指令最前面加 PATH 前綴照樣做（Mac：`export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH";`），不要卡在重開。
- `npx` 第一次跑某個套件會問 `Ok to proceed?`，手冊裡的 `npx` 一律加 `-y`（例如 `npx -y hyperframes doctor`）；之後提示詞裡的 `npx hyperframes …` 已經有快取，不會再問。

## 工具注意事項

- 做成片前先把 `shared/template/USAGE.md` 從頭讀完（`USAGE-reference.md` 照它的指示，做到那一步再查）；成片用 `node shared/template/tools/build.mjs --project projects/<專案>` 產生，不要從零寫。
- hyperframes 的指令（`snapshot`、`preview`、`render`）都要先 `cd projects/<專案>/work/hyperframes`；輸出路徑是相對那個資料夾，成片輸出到 `../../成片/final.mp4`。
- 缺 Node.js 或其他工具時，照 `setup/` 的手冊裝，不要自己想辦法。
- 轉逐字稿用 `npx hyperframes transcribe`，**一定要帶 `--model small --language zh`**；預設的 `small.en` 會把中文翻成英文。
- 剪停頓和小聲的自言自語用 `auto-editor`；它的 Skill 文件和實際安裝的版本參數名稱可能不同（例如 `--cut` 與 `--cut-out`），**以 `auto-editor --help` 為準**。Windows 的 PowerShell 會把逗號拆成兩個參數，帶逗號或冒號的參數要加引號：`--cut-out "17sec,25sec"`、`--edit "audio:-20dB"`。
- 音效只用 `shared/sfx/`，不要另外下載素材，也不要登入任何第三方服務。
- 輸出前抽查畫面用 `npx hyperframes snapshot --review`（每段的開頭和中間、每個轉場前後都會截圖）；`hyperframes check` 回報沒問題，不代表版面正確，一定要看截圖。
- `hyperframes render` 沒有指定時間範圍的參數；要測短片段，用 `node shared/template/tools/build.mjs --project projects/<專案> --test 起點,秒數` 產生 `compositions/test-clip.html`，再在 `projects/<專案>/work/hyperframes` 裡用 `npx hyperframes render -c compositions/test-clip.html --quality draft` 輸出。
- `render` 超過幾分鐘時，改用背景執行並看 log（指令在 `shared/template/USAGE.md` 第 2.7 節）。
- 開 Studio 用 `npx hyperframes preview --no-open`，把網址給我；我說「這張卡」「我選的」時，用 `npx hyperframes preview --context --json --context-fields selection` 讀取我在 Studio 選到的元素。
