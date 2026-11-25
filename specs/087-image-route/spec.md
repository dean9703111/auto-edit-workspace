# 087 生圖路線記在 setting.json

## 作者原話（2026-11-25）

- 「我覺得不同 AI Agent 如果要使用不同的方案生成圖片，也應該是在 Setting.json 裡面。比如果 Claude 預設是使用生成網頁搭配 SVG 方案，但可以說自己想要使用 Codex 或是 Antigravity 生成，在這邊就會記住，程式也知道如何調用」
- 「幫我檢查專案，過去好像是用提示詞」
- （Claude 的預設改成 HTML，推翻 10/30 的 Codex 優先？）「是的，因為不是每個人都有 Codex」
- （setting.json 的 `subagent` 那段沒有程式在讀，要不要一起接？）「應該是分開的議題？」→ 這次不碰

## 發生了什麼

生成背景圖走哪條路，原本靠提示詞決定：

- `caps.mjs` 只偵測這台有哪些工具（codex、mmx、Chrome），印「可用的生圖路線」，不知道現在是哪個 Agent。
- 選路寫在文件：`USAGE-reference.md` R9.3 的路由表＋`background.md`「找你這個模型那一列」，AI 要自己認自己是哪一家再查表。
- 構圖台「複製生圖指令」只寫「直接用生圖工具生成」，沒有路線；Claude Code 沒有生圖工具，等於沒說怎麼做。
- Claude 的第一選擇是 Codex，這台有 Codex 就會走 Codex；Antigravity 整個專案沒出現過。

## 定案

- **設定**：`shared/setting.json` 的 `image`，一個 Agent 記一條路，沒寫的用預設（`lib/image-route.mjs`）。
  - Agent：`claude`、`codex`、`minimax`、`antigravity`、`other`
  - 路線：`html`（網頁＋SVG 截圖）、`native`（Agent 自己的生圖工具）、`codex`、`antigravity`（`agy`）、`mmx`
  - 預設：Claude Code＝`html`、Codex＝`native`、MiniMax Code＝`mmx`、Antigravity＝`native`、其他＝`native`
  - Agent 選到自己（Codex 裡選 `codex`）＝`native`
- **記住**：`brand.mjs image <路線>` 寫進現在這個 Agent 那一格；`image off` 回到預設；`brand.mjs image` 看全部。
- **調用**：`caps.mjs` 最後印「這次生圖走：<路線>」＋指令在 `image-routing.md` 第幾節。設定的路這台不能用（沒裝、沒登入）就退到 HTML 並寫原因；HTML 也不行＝「無 → 背景圖只能用使用者上傳的圖」。
- **認 Agent**（2026-11-25 實測）：
  - Claude Code：`CLAUDECODE=1`。
  - Codex：`CODEX_THREAD_ID`、`CODEX_SANDBOX`（不看 `CODEX_COMPANION_SESSION_ID`，那是 Claude Code 的 Codex 外掛設的）。
  - 兩個都有（一個叫另一個跑）＝認不出來。
  - MiniMax Code：跑指令前會把自己的環境變數清掉（紀錄裡的 `envSanitized`），PATH 也不可靠（`~/.minimax/bin` 是 shell 設定檔加的）→ 認不出來。
  - Antigravity：非互動模式不給跑指令，驗不到 → 當作認不出來。
  - 認不出來時 `caps.mjs` 每個 Agent 各印一行（都照設定與這台能用的算好），或加 `--agent <名稱>` 只印自己的；`brand.mjs image <路線>` 要加 `--agent`。
- **構圖台**：生圖指令改成請 AI 先跑 `caps.mjs`、照「這次生圖走」生成；HTML 路線存 `.jpg` 也收（本來就收 png／jpg／webp）。提示詞版本 `generate-all-v6`。
- **Antigravity 怎麼呼叫**（實測 agy 1.5.17）：`agy -p "<提示詞>" --mode accept-edits --output-format json`。
  JSON 有 `conversation_id`，圖存在 `~/.gemini/antigravity-cli/brain/<conversation_id>/`（1376×768 jpg），不會放到指定的位置
  （搬檔要跑指令，非互動模式會自動拒絕；不用 `--dangerously-skip-permissions`）。再用 `brand.mjs bg --image` 轉成對的尺寸。
  實測三次：一次出圖；一次它先想跑指令被擋、沒出圖（所以提示詞開頭固定寫「只用內建生圖工具、不要跑指令」）；一次後端回 503 滿載。
  它的生圖工具只收 1:1、2:3、3:2、3:4、4:3、9:16、16:9。文件寫「失敗重跑一次，再不行改走 HTML」。Windows 的存圖位置沒驗。
- `caps.mjs` 能力表多一列 Antigravity（`agy --version`；沒有查登入的指令，只看裝了沒）。
- **文件**（作者 2026-11-25 看過改前改後說「可以」）：AGENTS.md 路由表、`auto-edit-style` 的 SKILL.md／`background.md`／`image-routing.md`（新增第 6 節 Antigravity）／`bg-worker.md`、
  USAGE-reference.md R9.3（路由表換成每個 Agent 的預設＋怎麼改）、EDITOR.md、`auto-edit-setup` SKILL.md、README.md。
  Skill 文件不能寫 `~/`（docs T5），Antigravity 的存圖位置寫成「家目錄的 `.gemini/…`」。

## 沒做

- 工具自己去呼叫 codex／agy／mmx（一條指令出圖）：現在是工具決定走哪條、文件給那條的指令，由 AI 跑。
- `subagent`（各家子代理的模型與 effort）接上程式：作者說是另一個議題。

## 驗收

- `dev/tests/image-route.test.mjs`（加進 `test:fast`）：認 Agent、預設與設定、寫錯的設定、存與拿掉、退到 HTML 的每種說法、caps 的一行與五行、`brand.mjs image` 的看／設／錯、工具印的節號對得到 `image-routing.md` 的標題。
- `dev/tests/caps.test.mjs`：能力表七列、`env` 給空的（結果不跟著在哪個 Agent 裡跑測試而變）。
- `dev/tests/design.test.mjs`：生圖指令請 AI 照「這次生圖走」。
