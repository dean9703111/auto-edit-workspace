# auto-edit-workspace

這是配合影片「AI 自動剪輯 EP1」用的工作區。

把它交給 MiniMax Code，照影片裡的 4 個提示詞貼上去，AI 就會幫你把一支原始口播，剪成有字幕、資訊卡、音效的成片。

影片連結：待補

## 裡面有什麼

字型、模板、圖示、預覽頁、音效、示範素材都已經放好，不用另外下載。

| 項目 | 數量 | 位置 | 怎麼用 |
|---|---|---|---|
| 情境模板 | 18 個 | `shared/template/scenes/` | 版面 9 個（章節轉場、章節角標、半版側邊欄、全畫面 4 種、兩側、講者介紹），下方字卡 7 個（一般、重點、步驟、問答、小技巧、總結、金句），條列 2 個。AI 只要填文字、圖示和要對齊的字幕句；圖示會自動「描出來」 |
| 情境動畫範例 | 4 支（流程、比喻、前後對比、數值變化） | `shared/template/custom/` | 口播在講一個情境時，AI 從這裡挑一支改成這一集的動畫，不用從零寫；做法在 `shared/template/USAGE-reference.md` R7 |
| 字卡動態 | 40 種 | `shared/template/fx/` | 打開 `shared/template/fx/index.html` 看效果，分鏡寫編號就能用 |
| 動畫原始檔 | 18 情境＋40 字卡動態都是 HTML（HyperFrames） | `shared/template/scenes/<編號-key>/template.html`＋`scene.json`、`shared/template/fx/effects/fx-NN-*.html` | AI 直接讀、改、換；`fx/renders/` 和 `gallery/` 只是預覽用的影片和圖。要改模板先看 `shared/template/USAGE-reference.md` R14 |
| 頻道主題 | 1 套（深藍黑＋黃） | `shared/template/kit/brand.css` | 改 3 行換主色 |
| 背景圖掛鉤 | 1 個 | `shared/template/bg.jpg`（自己放） | 放一張圖就套用 |
| 圖示 | 1,500 多個（lucide） | `shared/template/kit/icons.json` | 分鏡寫圖示名稱 |
| 字型 | 2 套（Noto Sans TC、Google Sans Flex） | `shared/template/kit/fonts/` | 不用安裝，Mac 和 Windows 看起來一樣 |
| 音效 | 12 個（pop、tick、swipe、whoosh、ding、success、alert、impact、flip、type、glitch、riser），取自 Kenney、OpenGameArt 的 CC0 素材 | `shared/sfx/` | 照 `shared/style.md` 的對照表，AI 自動對準動畫。每個聽起來像什麼、出處在 `shared/sfx/README.md` |
| 成片產生器 `build.mjs` | 1 支 | `shared/template/tools/build.mjs` | 一個指令組好字幕、資訊卡、子母畫面、音效；人聲自動調到 YouTube 的響度標準（−14 LUFS），剪接點自動消爆音 |
| 素材工具 `media.mjs` | 1 支 | `shared/template/tools/media.mjs` | 把多支影片、錄音接成主軌；掃描螢幕錄影與圖片，產生縮圖總表讓 AI 配對、讀座標；`snap-srt` 把字幕對齊實際開口的時間 |
| 版面量測 `audit.mjs` | 1 支 | `shared/template/tools/audit.mjs` | 在瀏覽器裡把每段情境動畫跳到中點與完成態，量出文字撐破、被裁掉、壓到字幕或子母畫面、擋到講者 |
| 驗收工具 `qc.mjs` | 1 支 | `shared/template/tools/qc.mjs` | `speaker`：疊出講者的動作範圍，量資訊卡不能擋的地方；`final`：成片輸出後檢查格式、長度、響度、畫面凍結、黑畫面、長時間沒聲音 |
| 剪輯台 `editor.mjs` | 1 支 | `shared/template/tools/editor.mjs`，說明在 `shared/template/EDITOR.md` | 網頁介面：剪掉不要的片段、調音量、加淡入淡出和轉場。說「打開剪輯台」，AI 會給你網址 |
| 換主色工具 `brand.mjs` | 1 支 | `shared/template/tools/brand.mjs` | 換色時自動檢查顏色看不看得清楚 |
| 使用說明 `USAGE.md`、`USAGE-reference.md` | 2 份 | `shared/template/` | AI 第一次用只讀核心的 USAGE.md；每個情境的參數在 reference，或用 `node shared/template/tools/build.mjs --list` 查 |
| 工作區守則 `AGENTS.md` | 1 份 | `AGENTS.md` | AI 開工前自動讀 |
| 剪輯風格 `style.md` | 1 份 | `shared/style.md` | 字幕、節奏、字卡文字、音效規則 |
| 提示詞 `PROMPTS.md` | 4 個＋中途回覆 | `PROMPTS.md` | 照順序貼，卡住時也看這份 |
| 安裝手冊 `setup/` | 1 套 | `setup/README.md` | 說「幫我檢測環境」，AI 就照著裝，每步回報進度 |
| 範例專案 | 原始口播 1 支、講稿、場地照 | `projects/範例/` | 第一次照著做就有成片 |

## 事前準備

- [MiniMax Code 桌面版](https://agent.minimax.io/download)

其他工具（git、Node.js、ffmpeg、whisper、auto-editor、兩組 Skill）由提示詞 1 照 [setup/](setup/README.md) 的手冊幫你檢測、安裝，Mac 和 Windows 都有。Windows 還沒有實測，歡迎回報。

## 怎麼開始

1. 取得這個工作區，三種方式挑一種：
   - 照影片的做法：打開 MiniMax Code 桌面版，先選 Local，再點 Select folder 選桌面，貼上 [PROMPTS.md](PROMPTS.md) 第 0 步的提示詞，AI 會幫你抓下來（沒裝 git 它會教你裝）。
   - 會用終端機：`git clone https://github.com/dean9703111/auto-edit-workspace.git`
   - 在 GitHub 頁面點「Code → Download ZIP」。解壓縮後的資料夾名稱會多一個 `-main`，不影響使用；Windows 要先「解壓縮全部」再打開。
2. 回到 MiniMax Code，開一個新任務，先選 Local，再點 Select folder，選進看得到 `AGENTS.md` 的那一層。這樣 AI 才讀得到守則。
3. 先貼 [PROMPTS.md](PROMPTS.md) 的提示詞 1，讓 AI 檢測環境、把缺的工具裝好。
4. 接著照 [PROMPTS.md](PROMPTS.md) 的順序，貼上提示詞 2 到 4。

## 預覽情境庫

想先看成片會長什麼樣子，打開 `shared/template/index.html`。建議用 Chrome 或 Edge 開。

## 開自己的專案

一支影片＝`projects/` 底下的一個資料夾，不用再複製整個工作區。跟 AI 說「開一個新專案 EP2」，它會幫你建好；也可以自己建，結構是：

```
projects/EP2/
├─ 講稿.md            這一集的講稿（選用）
├─ 素材/
│  ├─ 真人錄影/        有畫面的口播影片
│  ├─ 聲音/            只有聲音的旁白
│  ├─ 螢幕錄影/        操作畫面
│  └─ 圖片/            截圖、照片
├─ work/              AI 的中間產物（自動產生）
└─ 成片/              輸出的 final.mp4（自動產生）
```

四種素材各放什麼：

- **真人錄影**：有畫面有聲音的口播，是主軌。
- **聲音**：只有聲音的旁白，也是主軌。這種地方沒有畫面，AI 會自動配上螢幕錄影或圖片。
- **螢幕錄影**：操作畫面，預設靜音插入。AI 可以依口播加運鏡、紅框、放大鏡。
- **圖片**：截圖、照片，插入影片中。

講稿存成 `講稿.md`；沒有講稿也可以，AI 只會轉繁體、補標點。場地照不用準備，AI 會從你的影片自動截。`shared/style.md` 是剪輯風格，不要換掉，只要把裡面「講者」那一節改成你的名字和頭銜（留空就不會出現講者介紹卡）。

提示詞要指定專案，例如 `@projects/EP2`，AI 一次只處理一個專案。

### 錄影前檢查

AI 剪得再好，也救不回糊掉的畫面和聽不清楚的聲音。開錄前花一分鐘看這幾項：

- **收音**：麥克風離嘴 15–30 公分，有領夾式麥克風更好。關掉冷氣、風扇，先錄 10 秒聽一次，確認沒有雜音、沒有爆音。
- **畫面**：手機或相機鎖定曝光、對焦和白平衡，不要背對窗戶。整集機位不要動，講者框只要量一次。
- **講錯時**：停 1 秒，從那一句的開頭重講，不要接著往下講。AI 是靠逐字稿裡重複的句子找 NG，auto-editor 是靠停頓剪，停一下兩邊都好剪。
- **頭尾**：開頭、結尾各留 2 秒不講話，淡入淡出才不會切到字。
- **手勢**：盡量在身體前方比畫，不要往畫面左下伸，那裡是資訊卡的位置。
- **螢幕錄影**：解析度 1920×1080 以上，滑鼠移動放慢，每個操作前先停 1 秒，AI 配對畫面和加運鏡會比較準。

### 換主色

跟 AI 說「把主色換成深綠」就會處理。想自己改，就改 `shared/template/kit/brand.css` 裡的 3 個變數：`--brand`、`--brand-ink`、`--brand-text`。

子母畫面的外框是圖檔，改 CSS 改不到。想連外框一起換，請 AI 用 `shared/template/tools/brand.mjs` 換色。

### 換背景圖

把一張 1920×1080 的暗色圖放到 `shared/template/bg.jpg`。章節轉場、全畫面、側邊欄的底就會改成這張圖。主要內容不要放在左上角，因為全畫面的白卡會蓋在那裡。

## 常見問題

更完整的清單在 [PROMPTS.md](PROMPTS.md) 最後的「卡住的時候」。

### 逐字稿變成英文

轉逐字稿的指令要帶 `--model small --language zh`。預設的 `small.en` 會把中文翻成英文。

### auto-editor 回報參數錯誤

Skill 文件寫的參數名稱，可能和你裝的版本不同。以 `auto-editor --help` 為準。

### Mac M 系列晶片上，轉逐字稿的 whisper 當掉

在整行指令的最前面加上 `GGML_METAL_BF16_DISABLE=1`，再執行一次。

### Windows 可以用嗎

可以，`setup/windows.md` 有 Windows 的安裝路線。不過作者只在 Mac 上實測過，Windows 遇到問題歡迎回報。

### `hyperframes doctor` 顯示 Some checks failed

TTS、BGM、Docker 都是選用功能，這個工作區用不到。只有這幾項失敗的話，可以略過。

### 回覆之後，AI 還是只給計畫

還停在 Plan 模式。先關閉 Plan 模式，再回覆一次。

## 授權

程式碼採 MIT，情境模板、情境動畫範例與字卡動態採 CC BY 4.0，第三方素材與示範影片的條件見 [NOTICE.md](NOTICE.md)。

音效取自 Kenney（https://kenney.nl）與 OpenGameArt（https://opengameart.org）的 CC0 素材，可以放進自己的影片、商用，不用標示出處。逐檔來源見 [shared/sfx/README.md](shared/sfx/README.md)。

## 作者

林鼎淵 (Dean Lin)，YouTube 頻道「工程師下班有約」。

- 影片：待補
- FB：https://www.facebook.com/deanlinbao
- Medium：https://dean-lin.medium.com/
- 書籍：[《工程師下班有約》](https://www.books.com.tw/products/0010935713)
