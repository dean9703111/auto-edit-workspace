# AI 自動剪輯 EP1：提示詞彙整

整支影片照順序貼這些提示詞，中間需要你確認的地方，AI 會自己停下來，你只要回一句話就能繼續。
提示詞裡 `［ ］` 的部分是我的例子，換成你自己的內容。

## 開始之前

1. 安裝 MiniMax Code 桌面版並登入：https://agent.minimax.io/download
2. 打開後先選 **Local**，再點 **Select folder** 選資料夾。
   - 已經有這個工作區（用 git clone 或下載 ZIP）：選進這一層資料夾，也就是看得到 `AGENTS.md` 的那一層。
   - 還沒有：先選一個放專案的資料夾（例如桌面），貼上第 0 步的提示詞把工作區抓下來，再開新任務，選抓下來的 `auto-edit-demo`。
3. 模型選 **MiniMax-M3.1-Flash**。
4. 權限選 **Ask**，AI 動手前會先問你。提示詞裡寫好的工具指令可以允許，要刪除或覆寫 `raw/` 的就拒絕。

---

## 0. 下載工作區

貼在最開始，資料夾選的是放專案的地方（例如桌面）。AI 會把整個工作區抓到 `auto-edit-demo`。已經有工作區的人可以跳過。

```
把 https://github.com/dean9703111/auto-edit-workspace 下載到這個資料夾，資料夾名稱 auto-edit-demo，沒有 git 的話先告訴我怎麼裝。
```

完成後開一個新任務，一樣先選 Local，再點 Select folder，選抓下來的 `auto-edit-demo`。每次開新任務都要重新選一次。

## 0a. 確認 AI 讀得到守則

選好 `auto-edit-demo` 之後貼。故意不提 `AGENTS.md`，看 AI 有沒有自己讀到規則。

```
raw 資料夾裡的影片可以刪除嗎？
```

AI 回答不行，並說明 `raw/` 只能讀，代表規則生效了。如果回答可以，或說不知道有什麼規則，通常是資料夾選錯層，回到上一步重選。

## 1. 檢測環境、裝工具

新任務的第一個提示詞。思考深度可以調低，這是機械式的工作。AI 會先看你的電腦是 Mac 還是 Windows、已經有哪些工具，列出缺的清單，問你一次，同意之後一步一步裝（git、Node.js、ffmpeg、whisper-cli、auto-editor、兩組 Skill）。
裝完會跑 `hyperframes doctor`，再檢查一次，最後列出 `raw/` 裡每支影片的資訊。每做完一步，AI 會回報一次進度。
Mac 會要你輸入電腦密碼，Windows 會跳出確認視窗，都是正常的，這幾步要你自己動手。
Windows 裝完要關掉 MiniMax Code 重開，再說一次「幫我檢測環境」。

```
幫我檢測環境，缺的工具幫我裝好。
```

## 2. 轉逐字稿、找 NG、初剪

工具裝好之後貼。第一次執行會下載轉逐字稿的模型，大約要等兩分鐘。AI 列出剪輯清單後會停下來，等你確認。

```
請幫我把 @raw/示範口播.mp4 剪乾淨，原始檔不可覆寫，產出都放到 work/：
1. 轉逐字稿：npx hyperframes transcribe raw/示範口播.mp4 -d work --model small --language zh --json（一定要帶 --language zh，不然中文會被翻成英文；-d work 是讓逐字稿存進 work/，不要寫進 raw/）
2. 找 NG：同一句話講了兩次以上，代表我講錯重來，只保留最後一次完整的版本
3. 列出剪輯清單：用表格列出要剪掉的 NG（時間碼、內容、原因），存成 work/cuts.md，然後停下來等我確認
4. 我確認後，用 auto-editor 一次輸出 work/rough.mp4，加 --no-open 不要自動開播放器：
   - 沒講話的空白和停頓：--edit audio:threshold=0.1，先用 --preview 看會剪掉多少
   - NG：把清單裡的時間範圍一起剪掉（參數名稱以 auto-editor --help 為準；逐字稿的時間碼會有誤差，每段的起訖點要對齊前後的靜音，不要切到字）
5. 對 work/rough.mp4 重新轉逐字稿，存成 work/rough.srt：以 @ref/示範口播稿.md 為準校正錯字和專有名詞（沒有講稿就只轉繁體、補標點，不要自己猜內容），用繁體中文，中英文之間加半形空格，每則最多 18 個字，優先在標點處斷開
6. 最後回報：原始長度、初剪長度、剪掉幾段，以及每個剪接點在 rough.mp4 的時間
```

## 2a. 看完剪輯清單後的回覆

AI 列出剪輯清單、停下來之後貼。清單有錯就直接在清單上改，沒問題再回這一句。

```
清單沒問題，繼續。
```

## 2b. 換主色（可略過）

想把模板的主色換成自己的顏色時貼。改完再點兩下 `ref/template/index.html` 預覽，確認是你要的樣子再往下。想換背景圖，把圖片放進 `ref/template/`，檔名改成 `bg.jpg` 就會套用。

```
把 ref/template/ 的主色從黃色換成［你要的顏色］，並生成一張同色系的背景圖存成 ref/template/bg.jpg，改完告訴我，我要重新預覽。
```

## 3. 用 HyperFrames 包裝

初剪和字幕都完成之後貼。先點「+」選 **Plan** 模式，思考深度調高，再送出。Plan 模式下 AI 只會讀檔和提出計畫，列出分鏡表後會停下來。

```
請用 HyperFrames 把 work/rough.mp4 包裝成成片，做法照 @ref/template/USAGE.md（用 build.mjs 套模板，不要重新設計），節奏照 @ref/style.md，專案放在 work/hyperframes/：
1. 字幕：用 work/rough.srt（已校正，不要重新轉錄）
2. 版面：看 ref/ 裡的場地照判斷講者的位置（沒有就從 work/rough.mp4 截一張存成 work/場地照.jpg），資訊卡和字幕都不能擋到臉和手勢
3. 資訊卡：每 3–8 句挑一個重點，畫面文字 8–14 字；講到 3 個以上並列的項目用條列卡；版型只從 @ref/template/ 的情境庫裡挑，照每個情境標的使用時機和進場方式；進場時機和停留時間照 style.md 的節奏規則
4. 音效：只用 sfx/ 裡的檔案，照 style.md 的對照表，不要另外下載或登入任何服務
進行方式：
- 先用表格列出分鏡（時間碼、字幕、卡片類型、畫面文字、音效、理由），停下來等我確認
- 我確認後，先把分鏡表存成 work/storyboard.md 再開始製作；做好之後先用 npx hyperframes snapshot --review 抽查開頭、中間、結尾和每個轉場，自己檢查文字斷行、字幕、卡片位置，有問題先修好；再用 npx hyperframes preview --no-open 開 Studio，把網址給我，停下來等我確認
- 我說可以之後，先輸出 3–5 秒的測試片段（挑第一張資訊卡出現的地方），用 ffprobe 確認有音軌、截一張畫面確認版面，沒問題再輸出 output/final.mp4，用 ffprobe 確認 1920×1080、30fps、長度和初剪一樣（誤差 0.1 秒內）
```

## 3a. 看完分鏡表後的回覆

看完分鏡表，想調整某個地方時貼。先**關閉 Plan 模式**再送出，不然 AI 還是只會給計畫。`［ ］` 裡是我的例子，換成你自己想改的；沒有要改，就回「照你的規劃，開始製作。」

```
［開場打招呼那兩句先不要放資訊卡，讓觀眾先看到我的臉］，其他照你的規劃，開始製作。
```

## 3b. 在 Studio 選到卡片後的回覆

AI 給了 Studio 的網址之後，在右側面板點「+」選 Browser 貼上網址。暫停在有問題的那張卡，點卡片上的字，出現綠色框線代表選到了，再貼這句。AI 會自己讀你選的是哪一張。

```
我在 Studio 選了這張卡，它擋到我的手勢，請移到左半邊的安全範圍內。
```

## 3c. 輸出

Studio 預覽沒問題之後貼。AI 會先輸出一小段測試片段，確認有聲音、畫面正常，再輸出整支成片。輸出時間大約跟影片本身一樣長。

```
可以了，輸出成片。
```

## 4. 封裝成 Skill

成片完成、你對流程滿意之後貼。完成後點輸入框左邊的「+」，選 Skills，看得到 `auto-edit-longform` 就代表建立成功。

```
這次的剪輯流程我很滿意，請把它封裝成一個 Skill，名稱 auto-edit-longform，存到 ~/.minimax/skills/：
1. 流程：剪乾淨 → 剪好看 → 抽查畫面 → 測試片段 → 輸出，直接沿用這次的提示詞和參數
2. 模板：直接用工作區 ref/template/ 的樣式，不要重新設計；使用者換了背景圖或主色，就照換過的版本
3. 保留三次確認：剪輯清單、分鏡表、Studio 預覽，沒有我同意不能往下做
4. 把這次遇到的問題寫進注意事項：transcribe 一定要帶 --language zh、auto-editor 參數以 --help 為準、空白沒剪乾淨時怎麼調 threshold、hyperframes render 要測短片段時怎麼做
5. 寫清楚它依賴的 Skill（hyperframes、auto-editor），以及講稿、style.md、sfx/ 要放在工作區的哪裡
6. 場地照不用我準備：每一集都從新影片截一張畫面，存成 work/場地照.jpg，版面照這張判斷
```

## 5. 下一集

下一集先複製一份新的工作區，不然這一集 `work/` 裡的檔案會被蓋掉。`raw/` 放新的影片，`ref/` 的示範口播稿換成這一集的講稿。開一個新任務，一樣先選 Local，再選新的資料夾，然後貼這一句，檔名換成你自己的。

```
用 auto-edit-longform 剪 raw/下一集.mp4
```

---

## 換成自己的影片要改什麼

1. `raw/`：放進你的影片，提示詞裡的檔名一起改。
2. `ref/示範口播稿.md`：換成你自己的講稿。沒有講稿也可以，AI 只會轉繁體、補標點，不會猜內容。換的時候刪掉示範稿，避免 `ref/` 裡有兩份講稿。
3. 場地照不用準備，AI 會從你的影片截一張。

`ref/style.md` 是剪輯風格，不要換掉。

## 卡住的時候

下面是比較常遇到的狀況，症狀對得上，就照右邊做。

| 症狀 | 怎麼做 |
|---|---|
| 轉逐字稿時出現 `whisper-cli crashed (SIGABRT)`（部分 Mac） | 跟 AI 說「在指令最前面加 `GGML_METAL_BF16_DISABLE=1` 再跑一次」，例如 `GGML_METAL_BF16_DISABLE=1 npx hyperframes transcribe …`。也可以先把 macOS 更新到最新版 |
| 轉逐字稿前 30 到 40 秒完全沒反應 | 沒照手冊先裝 whisper 的話，第一次會自動用 Homebrew 安裝 whisper-cpp，這段沒有輸出，不是當機。接著會下載約 500 MB 的模型並一直刷進度，整段大約 1 到 3 分鐘 |
| 出現 `whisper-cpp not found`（沒裝 Homebrew 的 Mac，或 Windows） | Mac 跟 AI 說「照 `setup/mac.md` 裝 whisper-cpp」。Windows 跟 AI 說「照 `setup/windows.md` 下載 whisper-cli 並設 `HYPERFRAMES_WHISPER_PATH`」 |
| 裝完了，AI 還是說找不到 node 或 ffmpeg | 關掉 MiniMax Code 重開，再說一次「幫我檢測環境」 |
| AI 要我輸入密碼，但打字沒有任何反應 | 密碼不會顯示星號，打完按 Enter 就好 |
| 逐字稿出現在 `raw/` 裡 | 轉逐字稿沒帶 `-d work` 時，`transcript.json` 會寫到影片所在的資料夾。請 AI 把它搬到 `work/`，下次指令加上 `-d work` |
| 逐字稿是簡體字 | 同一個模型有時轉簡體、有時轉繁體。字幕那一步會轉成繁體，不用處理 |
| `hyperframes doctor` 最後顯示 Some checks failed | TTS、BGM、Docker 是選用功能，這個流程用不到。Node.js、FFmpeg、FFprobe、whisper-cpp 都是 ✓ 就可以繼續（Chrome 那列是 HyperFrames 自己下載的，第一次輸出時才會裝） |
| 執行 auto-editor 時系統說「無法驗證開發者」（Mac）或 SmartScreen 擋下（Windows） | 手動下載的執行檔會這樣。Mac 照手冊用 Homebrew 裝就不會；Windows 點「其他資訊 → 仍要執行」一次就好 |
| auto-editor 出現 `Error! Unknown option: --cut` | 新版改名成 `--cut-out`。每一段範圍各寫一次，例如 `--cut-out "17sec,25sec" --cut-out "69sec,75sec"`（Windows 的 PowerShell 一定要加引號，不然逗號會被拆開）。用空格隔開會被當成檔名，出現 `Could not open input file`。參數以 `auto-editor --help` 為準 |
| auto-editor 跑完自動跳出播放器 | 這是預設行為，加上 `--no-open` 就不會開 |
| 字幕和嘴巴對不上，提早一秒左右 | 逐字稿的時間碼會漂，停頓多的地方更明顯，畫面抽查看不出來。跟 AI 說「把第 N 則字幕的開始時間對齊實際開口的時間」，改完字幕再重新產生成片 |
| 回覆「開始製作」之後，AI 還是只給計畫 | 還停在 Plan 模式。先關閉 Plan 模式，再回覆一次 |
| AI 說要先寫一份暫時的設定檔檢查字幕長度，但 Plan 模式不讓它寫檔 | 回它「Plan 模式下先自己數字數，確認後再檢查」 |
| AI 自己從零寫 HyperFrames 的網頁，沒有用範本 | 回它「照 `ref/template/USAGE.md`，用 `node ref/template/tools/build.mjs` 產生」。通常是 `AGENTS.md` 沒被讀到，確認資料夾選的是看得到 `AGENTS.md` 的那一層 |
| 檢查出現 ✖ 就停住 | 每一行 `→` 後面就是改法，請 AI 照改再跑一次。有 ✖ 的時候，不會產生任何檔案 |
| Studio 網址打不開 | 請 AI 執行 `npx hyperframes preview --status`，看 Studio 還在不在。網址可能是 `localhost` 或 `127.0.0.1`，兩個都可以 |
| 說「我選的這張卡」，AI 回答沒有選到東西 | 在 Studio 先暫停在那張卡出現的畫面，點卡片上的字，出現綠色框線再說一次。也可以直接說「第 75 秒那張卡」 |
| 改完之後 Studio 畫面沒變 | 重新整理 Studio，並請 AI 確認產生的檔案裡是新內容 |
| 重新產生時，AI 說檔案「被手改過」 | 你在 Studio 裡拖過東西或改過字。把想保留的改動告訴 AI，請它寫進設定後，加上 `--force` 重新產生 |
| 想要「字再大一點」 | 模板的字級是固定的，改不了。請 AI 縮短卡片上的文字，或換成全畫面的版型 |
| 輸出等很久，對話框好像沒反應 | 輸出時間大約跟影片一樣長，電腦慢會更久。超過幾分鐘，請 AI 改用背景執行並看 log，看到 `Render complete` 才算完成 |
| 下一集用 Skill 時，AI 開始改上一集的檔案 | 先複製一份新的工作區再開始。`work/` 裡有舊東西時，Skill 通常會先問你 |
