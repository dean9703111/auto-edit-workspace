# 工作區裡有什麼

[README](README.md) 只講怎麼用；這份列出工作區裡每一樣東西放在哪、做什麼。字型、模板、圖示、預覽頁、音效、示範素材都已經放好，不用另外下載。

- [模板與素材](#模板與素材)
- [工具](#工具)
- [文件](#文件)
- [舊專案的資料夾改名](#舊專案的資料夾改名)

## 模板與素材

| 項目 | 數量 | 位置 | 怎麼用 |
|---|---|---|---|
| 情境模板 | 18 個 | `shared/template/scenes/` | 版面 9 個（章節轉場、章節角標、半版側邊欄、全畫面 4 種、兩側、講者介紹），下方字卡 7 個（一般、重點、步驟、問答、小技巧、總結、金句），條列 2 個。AI 只要填文字、圖示和要對齊的字幕句；圖示會自動「描出來」 |
| 情境動畫範例 | 17 支（流程、比喻、前後對比、數值變化、警告、提示詞、介面示意、架構、分支、分層、清單打勾、時間軸、雙邊比較、主體標註、趨勢、比例環、痛點與解法） | `shared/template/custom/x-*.html` | 口播在講一個抽象的結構（流程、對比、比例…）時，AI 挑一支改成這一集的動畫，不用從零寫。畫面主角是圖，字只當標籤；動畫用 `P.at('#N@詞')` 綁到講到的那個詞，不用手算秒數 |
| 示意動畫 | 1 支骨架＋2 個範例（`x-scene`、`x-scene-example-rec`、`x-scene-example-outline`） | `shared/template/custom/` | 口播在講看得見的東西在動（手機掃碼、資料夾刪檔、人走過去），而且沒有對得上的錄影時，AI 用線條插圖照講到的順序演出來；只有聲音的段落也靠它蓋住 |
| 字卡動態 | 40 種 | `shared/template/fx/` | 打開 `shared/template/fx/index.html` 看效果，分鏡寫編號就能用 |
| 動畫原始檔 | 18 情境＋40 字卡動態都是 HTML（HyperFrames） | `shared/template/scenes/<編號-key>/template.html`＋`scene.json`、`shared/template/fx/effects/fx-NN-*.html` | AI 直接讀、改、換；`fx/renders/` 和 `gallery/` 只是預覽用的影片和圖。要改模板先看 `shared/template/USAGE-reference.md` R14 |
| 風格包 | 2 包：「預設」（橘色 `#F6630F`、米白線稿）、「藍圖」（藍色 `#2563EB`、網格製圖線稿，示範用），亮色、暗色背景都有 | `shared/template/styles/<名稱>/` | 一包＝主色＋子母畫面外框＋背景圖。情境庫上方的「風格」可以直接預覽 |
| 主色 | 1 個（工作區目前是「預設」的橘色） | `shared/template/kit/brand.css` | 說「換主色」，AI 用 `brand.mjs` 換色、算好字的對比、重畫子母畫面外框 |
| 背景圖 | 亮色 3 張（全畫面 `bg-fs.jpg`、側邊欄 `bg-side.jpg`、章節轉場 `bg-ch.jpg`）＋暗色 3 張（`bg-*-dark.jpg`） | `shared/template/` | 說「換背景」，AI 縮放你給的圖，或用 Codex／HTML 產生，先給你看預覽再換 |
| 講者調光、瘦臉、美顏 | 選用，預設關閉；建議值調光 0.8、瘦臉 0.6、美顏 0.5 | `shared/template/kit/look.json`（工具 `look.mjs`） | 構圖台、影片編輯器都有開關和強度滑桿。臉部偵測在本機做、不上傳 |
| 圖示 | 1,500 多個（lucide） | `shared/template/kit/icons.json` | 分鏡寫圖示名稱 |
| 字型 | 2 套（Noto Sans TC、Google Sans Flex） | `shared/template/kit/fonts/` | 不用安裝，Mac 和 Windows 看起來一樣 |
| 音效 | 9 個（ding、success、alert、impact、click、chapter、sparkle、shine、thunder），CC0 素材或 AI 生成；片尾配樂 1 首（bgm-cylinder-five，CC BY 4.0，預設不配、用到要標示出處） | `shared/sfx/` | 照 `shared/style.md` 的對照表，AI 自動對準動畫。每個聽起來像什麼、出處在 `shared/sfx/README.md` |
| 範例專案 | 原始口播 1 支、講稿、場地照；直式版 1 支 | `projects/example/`、`projects/example-portrait/` | 第一次照著做就有成片 |

## 工具

都在 `shared/template/tools/`，用 Node.js 跑，AI 照 Skill 呼叫；參數以各工具的 `--help` 為準。

| 工具 | 做什麼 |
|---|---|
| `build.mjs` 成片產生器 | 一個指令組好字幕、資訊卡、情境動畫、子母畫面、音效；人聲自動調到 YouTube 的響度標準（−14 LUFS），剪接點自動消爆音。`--check` 檢查字數、版面、文字出現時間對不對得上講到的詞 |
| `media.mjs` 素材 | 把多支影片、錄音接成主軌（補錄可以只取一段插進旁白中間）；`ng-scan` 把逐字稿對到講稿，列出重講的地方和章節起點；`ng-snap` 把 NG 對齊停頓並印出 auto-editor 指令；`srt-align` 把字幕照講稿排成完整語句並對好時間（舊流程 `srt-split`、`snap-srt`）；`cutpoints` 算剪接點；掃描螢幕錄影與圖片，產生縮圖總表讓 AI 配對、讀座標 |
| `status.mjs` 進度 | 換 session 說「繼續」時看做到哪、下一步；`--timeline` 列出時間花在哪 |
| `caps.mjs` 能力 | 這台電腦能用哪些生圖與影片工具（只檢查、不安裝） |
| `audit.mjs` 版面量測 | 在瀏覽器裡把每段動畫跳到中點與完成態，量出文字撐破、被裁掉、壓到字幕或子母畫面、擋到講者；`--shots` 存截圖 |
| `qc.mjs` 驗收 | `framing`：構圖分析（講者動作範圍、建議的框）；`speaker`：量資訊卡不能擋的地方；`storyboard`：分鏡表每段的完成態截圖；`observe`：成片每 0.5 秒一格的觀影總表；`final`：檢查成片的格式、長度、響度、畫面凍結、黑畫面、長時間沒聲音 |
| `editor.mjs` 影片編輯器 | 網頁介面：裁剪、調音量、淡入淡出與轉場、改字幕、改卡片上的字（影片預覽即時換字）、構圖台拖框、修改單（選段寫想怎麼改，一行指令交給 AI）、輸出（1080p／2K／4K 影片或只輸出字幕）。說明在 `shared/template/EDITOR.md` |
| `versions.mjs` 段落版本 | 每一段留 v1、v2…，改前改後都存、出左右對照影片，說「s12 用 v1」就退回 |
| `brand.mjs` 換風格 | 換色時自動檢查顏色看不看得清楚；`bg` 把 HTML 截成背景圖並檢查留空區；`list`／`use`／`pack` 列出、套用、建立風格包；`speaker` 設定講者 |
| `capcut.mjs` 剪映素材 | 把成片拆成主軌 MP4、每段一支有透明通道的 MOV、字幕 SRT 和排法清單 |
| `look.mjs` 講者 | 偵測講者的臉、產生瘦臉與美顏底片和對照圖 `work/look-preview.jpg` |

## 文件

| 文件 | 給誰看 | 內容 |
|---|---|---|
| [PROMPTS.md](PROMPTS.md) | 你 | 照順序貼的提示詞、停下來時怎麼回、卡住的時候 |
| [shared/template/EDITOR.md](shared/template/EDITOR.md) | 你與 AI | 影片編輯器、構圖台、修改單怎麼用，會寫哪些欄位 |
| [setup/README.md](setup/README.md) | AI | 環境檢測與安裝手冊（Mac、Windows）；說「幫我檢測環境」，AI 照著裝，每步回報進度 |
| [AGENTS.md](AGENTS.md) | AI | 工作區守則：五個停點、每個流程對應哪支 Skill、資料夾權限 |
| `.agents/skills/` | AI | 9 支 Skill（總指揮、環境、剪乾淨、分鏡、螢幕錄影、情境動畫、審查、輸出、換風格）：每個流程的逐步指令與退路 |
| `shared/template/USAGE.md`、`USAGE-reference.md` | AI | 工具與情境的用法；AI 第一次只讀核心的 USAGE.md，每個情境的參數在 reference，或用 `node shared/template/tools/build.mjs --list` 查 |
| `shared/template/SITUATIONS.md` | AI | 口播在講什麼 → 用哪個版面、情境、動態、音效 |
| `shared/template/BEATS.md` | AI | 情境動畫的拍型與動作語彙 |
| `shared/template/REVIEW.md` | AI | 抽查截圖、驗收成片時看哪些地方、怎麼回報 |
| `shared/style.md` | AI | 字幕、節奏、字卡文字、音效的規則與數字 |
| [NOTICE.md](NOTICE.md) | 你 | 第三方素材與示範影片的授權 |

## 舊專案的資料夾改名

舊版的資料夾是中文，現在改成英文，工具只認新名稱。舊專案照這張表改名就能接著用（檔名，例如 `講稿.md`、`製作進度.md`，不用改）：

| 舊名稱 | 新名稱 |
|---|---|
| `素材/` | `assets/` |
| `素材/真人錄影/` | `assets/camera/` |
| `素材/聲音/` | `assets/voice/` |
| `素材/螢幕錄影/` | `assets/screen/` |
| `素材/圖片/` | `assets/images/` |
| `成片/` | `output/` |
| `成片/測試片段/` | `output/test-clips/` |
| `成片/驗收截圖/` | `output/qc/` |
| `成片/剪映/` | `output/capcut/` |
| `work/版本/` | `work/versions/` |
| `work/回饋/` | `work/feedback/` |
| `work/觀影/` | `work/observe/` |

改完還有兩件事：`work/hyperframes/plan.json` 裡插入素材的 `src`（例如 `素材/螢幕錄影/demo.mp4`）改成新路徑（`assets/screen/demo.mp4`），然後重跑一次 build。範例專案也改名了：`projects/範例/` → `projects/example/`、`projects/範例-直式/` → `projects/example-portrait/`。
