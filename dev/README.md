# dev/：維護者用（剪片用不到）

這個資料夾是作者維護工作區用的測試與素材工具。**剪片時不要讀、不要執行**；觀眾照根目錄的 `README.md`、`PROMPTS.md` 用就好。

| 路徑 | 用途 | 怎麼跑（在工作區根目錄） |
|---|---|---|
| `tests/` | `shared/template/tools/` 的單元與整合測試（build、剪輯台、插入素材、audit、qc…） | 整套：`npm test`（＝`node --test --test-timeout=300000 "dev/tests/*.test.mjs"`；要 Node 22、ffmpeg；瀏覽器測試要先 `npx hyperframes browser ensure`，沒有 Chrome、ffmpeg 或 puppeteer-core 就自動略過） |
| `npm run test:fast` | 不用 ffmpeg、Chrome、`node_modules` 的那一批（docs、install-skills、foundation、032-w5 和 plan、scenes、editor-storyboard 等單元測試）；`.github/workflows/check.yml` 在 push、pull request 時用 Ubuntu 與 Windows 跑的就是這一批，官網（`pages.yml`）要它過了才部署 | `npm run test:fast`（清單在 `package.json` 的 `scripts`；新增不碰 ffmpeg／Chrome 的測試檔就加進去） |
| `tests/docs.test.mjs` | 文件一致性：9 支 Skill 的骨架、六個停點的原文、門檻數字找得到出處（AGENTS.md、style.md、USAGE*.md、工具 `--help`）、文件寫到的檔案存在、G04 八項矛盾 | `npm run test:docs`（＝`node --test dev/tests/docs.test.mjs`；零依賴；約 1 秒） |
| `tests/docs-allow.json` | docs.test 的數字白名單：每筆 `{ "file", "text", "reason" }`，上限 40 筆；能搬進 style.md 或 AGENTS.md 的就不要加 | 改完重跑 docs.test |
| `tests/install-skills.test.mjs` | `setup/install-skills.mjs` 的案例：9 支 Skill、子代理定義（`.agents/agents/` → `.claude/agents/`）、`checkInstalled()`（在系統暫存資料夾裝，不碰 `~/.minimax` 與 `.claude`） | `node --test dev/tests/install-skills.test.mjs` |
| `tests/foundation.test.mjs` | 032 的共用模組：`lib/tries.mjs`（計數）、`lib/stops.mjs`（停點原文）、`lib/say.mjs`（訊息出口）、`lib/cli.mjs`（參數） | `node --test dev/tests/foundation.test.mjs` |
| `tests/helpers.mjs` | 測試共用：`tmpDir(t)`（測試結束自動清掉的暫存資料夾）、`needs(t, 'ffmpeg'｜'chrome'｜'puppeteer')`（缺就 skip）、`missingTools`＋`skipAll`（整個檔都要瀏覽器時）、`fixture(name, make)`（同一輪共用的小素材） | 測試檔 `import … from './helpers.mjs'` |
| `hooks/pre-commit` | 提交前跑 docs.test，沒過就擋下這次提交（約 1 秒） | 每個 clone 啟用一次：`git config core.hooksPath dev/hooks`；臨時略過：`git commit --no-verify` |
| `check-all.mjs` | 檢查迴圈的一鍵檢查，和 AI 剪片走同一條路：單元測試（`npm run test:fast`）→ 複製 `projects/example` 的素材與講稿到暫存 → 照 `status.mjs --json` 印的指令一路跑到停點 ④（停點固定回「可以」「用建議的」「可以」；要 AI 寫的語意地圖、大綱、草稿、摘要用 `loop/fixtures/` 的範例）→ 再用裁成直拍的同一支片跑一輪直式。詳細報告寫 `loop/last-check.md`，每次在 `loop/check-log.md` 加一行 | `node dev/check-all.mjs`（約 5 分鐘；只看管線：`--skip-tests`；整套測試：`--full`；再輸出完成影片：`--deliver`；用別的專案的素材與它自己的草稿：`--real projects/<專案>`；其他選項 `--help`） |
| `verify-editor-ui.mjs` | 唯讀檢查一個已經開著的剪輯台（構圖頁的背景預覽、動畫有在播）；不存任何專案設定 | `node dev/verify-editor-ui.mjs http://127.0.0.1:<埠>/`（要 HyperFrames 的 Chrome 與 puppeteer-core） |
| `bench/draft-bench.mjs` | 寫草稿的基準測試：同一份分鏡素材用「一次寫整份」「大綱 → 骨架」「語意地圖 → 大綱 → 骨架」各跑 N 次，用 MiniMax（mmx）當弱模型比產出率、時間、token | `node dev/bench/draft-bench.mjs --project projects/example [--runs 3] [--modes one,two,map] [--dry]`（專案要先跑過 `build.mjs --scaffold`；會呼叫 mmx，花 token） |
| `loop/` | 檢查迴圈的做法、一鍵檢查的紀錄（`check-log.md`，工具寫；10-31 以前手寫的 `round-N.md` 留作歷史）、固定範例檔（`fixtures/`）、弱模型試跑的提示詞 | 先讀 `dev/loop/README.md` |
| `tools/apply-samples.mjs` | 把 `tools/samples.json` 的範例文案套到 `shared/template/scenes/*/scene.json` 的 sample | `node dev/tools/apply-samples.mjs [--dry-run]` |
| `tools/build-icons.mjs` | 把 svg 圖示資料夾合併成 `icons.json` | `node dev/tools/build-icons.mjs <out.json> <dir1> <dir2> …` |
| `tools/illus-gallery-shot.mjs` | 重截 `shared/template/kit/illus-gallery.jpg`（`kit/illus-gallery.html` 的整頁截圖，寬 1920）；illus.js／illus.css 改了或換了主色後重跑 | `node dev/tools/illus-gallery-shot.mjs`（要 HyperFrames 的 Chrome 與 ffmpeg） |
| `tools/gallery-shot.mjs` | 重截 `shared/template/gallery/<情境>.jpg`（情境庫卡片、官網預覽的底圖，1280×720）；換了講者示意圖、主色、背景圖或改了模板之後重跑 | `node dev/tools/gallery-shot.mjs [01-chapter,14-speaker]`（要 HyperFrames 的 Chrome 與 ffmpeg） |
| `tools/og-image.mjs`、`tools/og/og-image.html` | 重截官網分享預覽圖 `dev/site/og-image.jpg`（1200×630）；來源是 `og/og-image.html`，重截情境庫縮圖後跟著重跑 | `node dev/tools/og-image.mjs`（要 HyperFrames 的 Chrome 與 ffmpeg） |
| `tools/make-sfx.mjs` | 產生 `shared/sfx/` 的音效（CC0 素材加工或 AI 生成）、A/B 試聽檔、回寫 sources.json 與 `kit/sfx.json`（作者用，只要 Node 與 ffmpeg） | `node dev/tools/make-sfx.mjs --help`；試聽檔一定要寫在工作區外面（`--out`） |
| `tools/pics-build.mjs`、`pics/catalog.tsv` | 圖庫產生器：`dev/pics/catalog.tsv` 列的線條圖示（Tabler、Lucide）換成工作區的線稿畫風，寫進 `shared/template/kit/pics/` | `node dev/tools/pics-build.mjs --tabler <Tabler Icons 的 icons/outline 資料夾> [--check] [--sheet <png>]` |
| `tools/custom-check.mjs` | 情境動畫模板（`custom/<名稱>.html`＋`.fill.json`）的驗收：標記沒改到模板、最多項和最少項都產得出來、兩種項數排進同一個專案 `--check`、build、audit 都 0 ✖ | `node dev/tools/custom-check.mjs x-process [x-ring …]` 或 `--all`（`--fast` 只查標記；`--stress` 多排最長文字；`--shots <資料夾>` 存截圖；要 ffmpeg，build 之後的量測要 Chrome） |
| `tools/showcase.mjs`、`tools/showcase-lines.json` | 情境總覽示範片：把全部字卡模板、字卡動態、情境動畫排進一個專案，旁白用 macOS 的 say 合成（情境動畫的台詞在 `showcase-lines.json`） | `node dev/tools/showcase.mjs [--project projects/showcase] [--only scenes,fx,custom] [--clean]`（要 macOS say、ffmpeg；之後照一般指令 build、deliver） |
| `tools/sizzle.mjs`、`tools/sizzle-music.mjs` | 展示片：把情境總覽的實際輸出剪成約 36 秒的短片；`sizzle-music.mjs` 是它匯入的配樂合成（程式合成的節拍，不單獨跑） | `node dev/tools/sizzle.mjs [--out projects/showcase-reel] [--mattes <資料夾>] [--no-render]`（先跑過 `showcase.mjs --clean` 與正式流程的去背；要 ffmpeg） |
| `tools/docs-figures.mjs` | README 與官網的三張說明圖（版面節奏、講者左中右、圖庫一覽），只寫 `dev/site/guides/` | `node dev/tools/docs-figures.mjs`（圖庫一覽要 HyperFrames 的 Chrome 與 ffmpeg，沒有就跳過那張） |
| `site/index.html`、`tools/build-site.mjs` | 官網首頁；`build-site.mjs` 把首頁、`shared/template/` 情境庫（不含 tools、vendor）、`shared/sfx/`、NOTICE 組成 GitHub Pages 網站，`.github/workflows/pages.yml` 推上 main 時先跑 `check.yml`，過了才部署 | `node dev/tools/build-site.mjs --out <資料夾>`（預設 `_site`，不進版控）；第一次要在 GitHub Settings → Pages 把 Source 選「GitHub Actions」 |
| `tools/docs-visuals.mjs`、`site/guides/` | README 與官網的流程圖、背景選圖圖解、剪輯清單、構圖、分鏡表與動畫預覽截圖；只在系統暫存建立示範專案，使用內建示範講者 | `node dev/tools/docs-visuals.mjs`（需現有 ffmpeg、HyperFrames Chrome、puppeteer-core）；介面更新後重跑，官網圖片尺寸同步實際輸出 |
| `site/demo/`、`tools/build-site.mjs` | 官網的可操作示範：頁面直接用 `shared/template/tools/editor/` 真正的 cuts、storyboard 介面，`demo-api.js` 在瀏覽器裡回應 API，示範內容是同資料夾的 Markdown（`docs-visuals.mjs` 也讀它）；`dev/tests/site-demo.test.mjs` 確保和真正的服務一致 | 改介面不用動示範；改 API 回傳格式時測試會失敗，照著改 `demo-core.mjs` |
| `archive/make_sfx.py` | 已退役（由 `tools/make-sfx.mjs` 取代），只保留凍結 8 顆音效的處理紀錄；執行會直接結束 | — 見 `dev/archive/README.md` |
| `archive/build_test_media.py` | 已退役：舊的測試講解與場地照產生器（要 Python），留作初剪驗收素材的設計紀錄 | — 見 `dev/archive/README.md` |

`projects/測試/` 不進版控（`.gitignore` 只留 `projects/example/`）。

**暫存目錄（外接硬碟）**：單元測試、合成專案與 hyperframes render 的暫存都走 `os.tmpdir()`，一小時可累積 30 GB。作者的外接硬碟是 ExFAT，直接當暫存會被 macOS 寫進 `._*` 隱藏檔、弄壞列目錄的測試，所以暫存放在硬碟上的 APFS 稀疏映像 `/Volumes/video/auto-edit-tmp.sparseimage`（`hdiutil create -size 300g -type SPARSE -fs APFS -volname auto-edit-tmp`，掛起來是 `/Volumes/auto-edit-tmp`）。`check-all.mjs` 看到映像檔沒掛就先 `hdiutil attach`，再把 `TMPDIR` 指到 `AUTO_EDIT_TMP` 或 `/Volumes/auto-edit-tmp`（子處理程序繼承）。手動跑 `node --test dev/tests/*.test.mjs`、`npx hyperframes render` 時自己加前綴：`TMPDIR=/Volumes/auto-edit-tmp node --test …`。暫存資料夾（`hf-*`、`look-*`、`auto-edit-check-*`）用完要清，用 node 的 fs 遞迴刪除（本機 hook 會擋 shell 的刪除指令）。
