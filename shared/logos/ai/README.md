# AI 工具標誌素材（單色 SVG）

2026-11-15 作者說：「工具要找實際存在的 AI Logo，這些可以作為素材保存，日後可能使用」。這個資料夾放真實 AI 工具與常搭配的自動化工具的標誌，給內容設計動畫當圖示用。

- 來源：[Simple Icons](https://simpleicons.org/) v16.37.0（`https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/<名稱>.svg`）。
- 授權：圖示檔本身是 CC0 1.0。**標誌是各家公司的商標**，用在介紹、教學、評論這類指名用途；不要改形狀、不要讓人以為是官方合作，各品牌另有規範的照它的規範。
- 格式：24×24 viewBox、單一路徑、沒有寫死顏色（跟著 `fill`／`currentColor` 走），放大不會糊。
- 顏色：`colors.json` 記每個標誌的品牌色（`{ 檔名: { title, hex } }`，取自 Simple Icons 的資料；OpenAI、Canva 是另外補的）。作者 2026-11-15：「Logo 不一定要單色，彩色也可以」→ 可以用品牌色填，也可以照影片主題用單色。原廠是多色或漸層的（Gemini、Google Cloud、Figma…）這裡只有單一色的版本，要原色得另外找官方素材。
- 用法（內容設計動畫）：把檔案裡的 `<path d="…">` 貼進動畫檔的 inline `<svg viewBox="0 0 24 24">`，顏色用 token（例 `fill: var(--sc-fs-ink)`），放在白底圓角方塊裡。不要用 `data-illus-src` 掛（那條路只收線稿畫風的圖）。

| 檔名 | 是什麼 |
|---|---|
| `openai.svg` | OpenAI（ChatGPT） |
| `anthropic.svg`、`claude.svg` | Anthropic、Claude |
| `googlegemini.svg`、`notebooklm.svg` | Google Gemini、NotebookLM |
| `perplexity.svg` | Perplexity |
| `githubcopilot.svg` | GitHub Copilot |
| `cursor.svg` | Cursor |
| `deepseek.svg`、`mistralai.svg`、`meta.svg`、`x.svg` | DeepSeek、Mistral AI、Meta（Meta AI）、X（Grok 所屬） |
| `huggingface.svg`、`ollama.svg`、`replicate.svg`、`langchain.svg`、`dify.svg`、`poe.svg` | Hugging Face、Ollama、Replicate、LangChain、Dify、Poe |
| `elevenlabs.svg`、`suno.svg` | ElevenLabs（語音）、Suno（音樂） |
| `notion.svg`、`canva.svg`、`figma.svg` | Notion、Canva、Figma（都有 AI 功能） |
| `zapier.svg`、`n8n.svg`、`make.svg` | Zapier、n8n、Make（自動化） |
| `googlecloud.svg` | Google Cloud |

這一版圖示庫沒有的（下載時 404，要用得另外找官方素材）：Midjourney、Runway、Gamma、Grok、Microsoft Copilot、Cohere、Groq、Stability AI。
