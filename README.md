# auto-edit-workspace

這是配合影片「AI 自動剪輯 EP1」用的工作區。

把它交給 MiniMax Code，照影片裡的 4 個提示詞貼上去，AI 就會幫你把一支原始口播，剪成有字幕、資訊卡、音效的成片。

影片連結：待補

## 裡面有什麼

字型、模板、圖示、預覽頁、音效、示範素材都已經放好，不用另外下載。

| 項目 | 數量 | 位置 | 怎麼用 |
|---|---|---|---|
| 情境模板 | 18 個 | `ref/template/scenes/` | 版面 9 個（章節轉場、章節角標、半版側邊欄、全畫面 4 種、兩側、講者介紹），下方字卡 7 個（一般、重點、步驟、問答、小技巧、總結、金句），條列 2 個。AI 只要填文字和要對齊的字幕句 |
| 字卡動態 | 40 種 | `ref/template/fx/` | 打開 `ref/template/fx/index.html` 看效果，分鏡寫編號就能用 |
| 動畫原始檔 | 18 情境＋40 字卡動態都是 HTML（HyperFrames） | `ref/template/scenes/<編號-key>/template.html`＋`scene.json`、`ref/template/fx/effects/fx-NN-*.html` | AI 直接讀、改、換；`fx/renders/` 和 `gallery/` 只是預覽用的影片和圖。要改模板先看 `ref/template/USAGE-reference.md` R14 |
| 頻道主題 | 1 套（深藍黑＋黃） | `ref/template/kit/brand.css` | 改 3 行換主色 |
| 背景圖掛鉤 | 1 個 | `ref/template/bg.jpg`（自己放） | 放一張圖就套用 |
| 圖示 | 1,500 多個（lucide） | `ref/template/kit/icons.json` | 分鏡寫圖示名稱 |
| 字型 | 2 套（Noto Sans TC、Google Sans Flex） | `ref/template/kit/fonts/` | 不用安裝，Mac 和 Windows 看起來一樣 |
| 音效 | 12 個（pop、tick、swipe、whoosh、ding、success、alert、impact、flip、type、glitch、riser），取自 Kenney、OpenGameArt 的 CC0 素材 | `sfx/` | 照 `ref/style.md` 的對照表，AI 自動對準動畫。每個聽起來像什麼、出處在 `sfx/README.md` |
| 成片產生器 `build.mjs` | 1 支 | `ref/template/tools/build.mjs` | 一個指令組好字幕、資訊卡、子母畫面、音效 |
| 換主色工具 `brand.mjs` | 1 支 | `ref/template/tools/brand.mjs` | 換色時自動檢查顏色看不看得清楚 |
| 使用說明 `USAGE.md`、`USAGE-reference.md` | 2 份 | `ref/template/` | AI 第一次用只讀核心的 USAGE.md；每個情境的參數在 reference，或用 `node ref/template/tools/build.mjs --list` 查 |
| 工作區守則 `AGENTS.md` | 1 份 | `AGENTS.md` | AI 開工前自動讀 |
| 剪輯風格 `style.md` | 1 份 | `ref/style.md` | 字幕、節奏、字卡文字、音效規則 |
| 提示詞 `PROMPTS.md` | 4 個＋中途回覆 | `PROMPTS.md` | 照順序貼，卡住時也看這份 |
| 安裝手冊 `setup/` | 1 套 | `setup/README.md` | 說「幫我檢測環境」，AI 就照著裝，每步回報進度 |
| 示範素材 | 原始口播 1 支、講稿、場地照 | `raw/`、`ref/` | 第一次照著做就有成片 |

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

想先看成片會長什麼樣子，打開 `ref/template/index.html`。建議用 Chrome 或 Edge 開。

## 換成自己的影片

要換兩個地方：

1. `raw/`：放進你的影片，提示詞裡的檔名跟著改。
2. `ref/`：把 `示範口播稿.md` 換成這一集的講稿 `.md`（示範稿刪掉，避免兩份講稿）。沒有講稿也可以，AI 只會轉繁體、補標點。`style.md` 是剪輯風格，不要換掉，只要把裡面「講者」那一節改成你的名字和頭銜（留空就不會出現講者介紹卡）。

場地照不用準備，Skill 會從你的影片自動截。

### 換主色

跟 AI 說「把主色換成深綠」就會處理。想自己改，就改 `ref/template/kit/brand.css` 裡的 3 個變數：`--brand`、`--brand-ink`、`--brand-text`。

子母畫面的外框是圖檔，改 CSS 改不到。想連外框一起換，請 AI 用 `ref/template/tools/brand.mjs` 換色。

### 換背景圖

把一張 1920×1080 的暗色圖放到 `ref/template/bg.jpg`。章節轉場、全畫面、側邊欄的底就會改成這張圖。主要內容不要放在左上角，因為全畫面的白卡會蓋在那裡。

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

程式碼採 MIT，情境模板與字卡動態採 CC BY 4.0，第三方素材與示範影片的條件見 [NOTICE.md](NOTICE.md)。

音效取自 Kenney（https://kenney.nl）與 OpenGameArt（https://opengameart.org）的 CC0 素材，可以放進自己的影片、商用，不用標示出處。逐檔來源見 [sfx/README.md](sfx/README.md)。

## 作者

林鼎淵 (Dean Lin)，YouTube 頻道「工程師下班有約」。

- 影片：待補
- FB：https://www.facebook.com/deanlinbao
- Medium：https://dean-lin.medium.com/
- 書籍：[《工程師下班有約》](https://www.books.com.tw/products/0010935713)
