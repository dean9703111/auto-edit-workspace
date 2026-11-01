# dev/：維護者用（剪片用不到）

這個資料夾是作者維護工作區用的測試與素材工具。**剪片時不要讀、不要執行**；觀眾照根目錄的 `README.md`、`PROMPTS.md` 用就好。

| 路徑 | 用途 | 怎麼跑（在工作區根目錄） |
|---|---|---|
| `tests/` | `shared/template/tools/` 的單元與整合測試（build、剪輯台、插入素材、audit、qc…） | `node --test dev/tests/*.test.mjs`（要 Node 22、ffmpeg；audit 的瀏覽器測試要先 `npx hyperframes browser ensure`，沒有就自動略過） |
| `tests/docs.test.mjs` | 文件一致性：9 支 Skill 的骨架、六個停點的原文、門檻數字找得到出處（AGENTS.md、style.md、USAGE*.md、工具 `--help`）、文件寫到的檔案存在、G04 八項矛盾 | `node --test dev/tests/docs.test.mjs`（零依賴；約 1 秒） |
| `tests/docs-allow.json` | docs.test 的數字白名單：每筆 `{ "file", "text", "reason" }`，上限 40 筆；能搬進 style.md 或 AGENTS.md 的就不要加 | 改完重跑 docs.test |
| `tests/install-skills.test.mjs` | `setup/install-skills.mjs` 的 9 個案例（在系統暫存資料夾裝，不碰 `~/.minimax`） | `node --test dev/tests/install-skills.test.mjs` |
| `check-all.mjs` | 檢查迴圈的一鍵檢查：單元測試 → 合成測試專案 → `--check` → build → audit → snapshot；報告寫 `loop/last-check.md` | `node dev/check-all.mjs`（只看管線：`--skip-tests`；對真實專案：`--real projects/範例`；加 render：`--render`） |

| `loop/` | 檢查迴圈的做法、每一輪的紀錄（`round-N.md`）、弱模型試跑的提示詞 | 先讀 `dev/loop/README.md` |
| `tools/apply-samples.mjs` | 把 `tools/samples.json` 的範例文案套到 `shared/template/scenes/*/scene.json` 的 sample | `node dev/tools/apply-samples.mjs [--dry-run]` |
| `tools/build-icons.mjs` | 把 svg 圖示資料夾合併成 `icons.json` | `node dev/tools/build-icons.mjs <out.json> <dir1> <dir2> …` |
| `tools/illus-gallery-shot.mjs` | 重截 `shared/template/kit/illus-gallery.jpg`（`kit/illus-gallery.html` 的整頁截圖，寬 1920）；illus.js／illus.css 改了或換了主色後重跑 | `node dev/tools/illus-gallery-shot.mjs`（要 HyperFrames 的 Chrome 與 ffmpeg） |
| `tools/make-sfx.mjs` | 產生 `shared/sfx/` 的音效（CC0 素材加工或 AI 生成）、A/B 試聽檔、回寫 sources.json 與 `kit/sfx.json`（作者用，只要 Node 與 ffmpeg） | `node dev/tools/make-sfx.mjs --help`；試聽檔一定要寫在工作區外面（`--out`） |
| `site/index.html`、`tools/build-site.mjs` | 官網首頁；`build-site.mjs` 把首頁、`shared/template/` 情境庫（不含 tools、vendor）、`shared/sfx/`、NOTICE 組成 GitHub Pages 網站，`.github/workflows/pages.yml` 推上 main 時自動部署 | `node dev/tools/build-site.mjs --out <資料夾>`（預設 `_site`，不進版控）；第一次要在 GitHub Settings → Pages 把 Source 選「GitHub Actions」 |
| `tools/make_sfx.py` | 已退役，只保留凍結 8 顆音效的處理紀錄；執行會直接結束 | — |
| `tools/build_test_media.py` | 產生測試用口播與場地照到 `projects/測試/`（作者用，要 Python） | 見檔頭；答案寫在工作區外面的 `<工作區名>-驗收/`，AI 讀不到 |

`projects/測試/` 不進版控（`.gitignore` 只留 `projects/範例/`）。

**暫存目錄（外接硬碟）**：單元測試、合成專案與 hyperframes render 的暫存都走 `os.tmpdir()`，一小時可累積 30 GB。作者的外接硬碟是 ExFAT，直接當暫存會被 macOS 寫進 `._*` 隱藏檔、弄壞列目錄的測試，所以暫存放在硬碟上的 APFS 稀疏映像 `/Volumes/video/auto-edit-tmp.sparseimage`（`hdiutil create -size 300g -type SPARSE -fs APFS -volname auto-edit-tmp`，掛起來是 `/Volumes/auto-edit-tmp`）。`check-all.mjs` 看到映像檔沒掛就先 `hdiutil attach`，再把 `TMPDIR` 指到 `AUTO_EDIT_TMP` 或 `/Volumes/auto-edit-tmp`（子程序繼承）。手動跑 `node --test dev/tests/*.test.mjs`、`npx hyperframes render` 時自己加前綴：`TMPDIR=/Volumes/auto-edit-tmp node --test …`。暫存資料夾（`hf-*`、`look-*`、`auto-edit-check-*`）用完要清，用 node 的 fs 遞迴刪除（本機 hook 會擋 shell 的刪除指令）。
