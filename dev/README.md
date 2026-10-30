# dev/：維護者用（剪片用不到）

這個資料夾是作者維護工作區用的測試與素材工具。**剪片時不要讀、不要執行**；觀眾照根目錄的 `README.md`、`PROMPTS.md` 用就好。

| 路徑 | 用途 | 怎麼跑（在工作區根目錄） |
|---|---|---|
| `tests/` | `shared/template/tools/` 的單元與整合測試（build、剪輯台、插入素材、audit、qc…） | `node --test dev/tests/*.test.mjs`（要 Node 22、ffmpeg；audit 的瀏覽器測試要先 `npx hyperframes browser ensure`，沒有就自動略過） |
| `tools/apply-samples.mjs` | 把 `tools/samples.json` 的範例文案套到 `shared/template/scenes/*/scene.json` 的 sample | `node dev/tools/apply-samples.mjs [--dry-run]` |
| `tools/build-icons.mjs` | 把 svg 圖示資料夾合併成 `icons.json` | `node dev/tools/build-icons.mjs <out.json> <dir1> <dir2> …` |
| `tools/make_sfx.py` | 從 CC0 素材產生 `shared/sfx/` 的 12 顆音效（作者用，要 Python） | 見檔頭；候選音效寫在工作區外面的 `<工作區名>-sfx-candidates/` |
| `tools/build_test_media.py` | 產生測試用口播與場地照到 `projects/測試/`（作者用，要 Python） | 見檔頭；答案寫在工作區外面的 `<工作區名>-驗收/`，AI 讀不到 |

`projects/測試/` 不進版控（`.gitignore` 只留 `projects/範例/`）。
