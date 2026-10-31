# 審查 r1-C：006 look＋跨線零依賴／跨平台／授權（只讀審查員 C，2026-10-31）

證據都在 `/private/tmp/claude-501/-Users-lindingyuan-Downloads-workspace-auto-edit-workspace/6d54b3e1-59e6-4062-be1d-9ed5f77ee092/scratchpad/rC/`（下稱 `rC/`）：
- `專案`：示範口播原檔（640×360、yuvj420p、5111 格）當 `work/rough.mp4`，一張 concept 卡。
- `專案2x`：同一支 lanczos 放大成 1280×720（音軌 copy），完整瘦臉、快取、build、剪輯台都在這裡跑。
- `專案4k`：放大成 3840×2160 的 20 秒片段（599 格），驗 2560 縮小、背景執行、鎖。
- `專案np`：沒有 plan.json（停點 ② 之前的狀態）。`faketpl`：少 `.wasm` 的假 template。
- 量測腳本：`de.mjs`（ΔE76）、`sc002.mjs`（和 Python `lm_full.npz` 比下顎）、`detect640.mjs`（原檔直接 `detectLandmarks`）、`scan.mjs`（跨線 grep）。

## 問題

| 編號 | 等級 | 位置 | 問題 | 證據 | 修法 |
|---|---|---|---|---|---|
| C-01 | P1 | `tools/look.mjs` cmdStatus 的 `next`（:164-174）；cli-006 §4.2 最後一列；AGENTS.md:159、USAGE.md §2 第 2 列「照最後一行做」 | 同一個狀態，`run` 說下一步是 `qc.mjs framing --cards`，`status` 卻說 `build.mjs`。停點 ② 之前 plan.json 還不存在，弱模型照 AGENTS.md「`look.mjs status` 照最後一行做」會先跑 build → ✖ | `rC/專案np`：`run` 最後一行 `→ 下一步：…qc.mjs framing --project … --cards`；緊接 `status` 最後一行 `→ 下一步：node shared/template/tools/build.mjs --project …`；照做得到 `✖ 找不到 …/work/hyperframes/plan.json：先寫 plan.json` | cli-006 §4.2「其他」列分兩種：plan.json 不存在或沒有 `scenes` → `→ 下一步：node shared/template/tools/qc.mjs framing --project <專案> --cards`；有 → build。或 AGENTS.md:159 改成「`status` 的 → 是 build 那一行＝look 完成，接著跑 framing」（storyboard Skill 的完成判準已經這樣寫） |
| C-02 | P1 | cli-006 §4.2 第 6 列、look.md §3.2「過期（strict）」原文；`look.mjs`:173、`lib/look.mjs`:326 | `→ 下一步` 那一行不能直接複製執行（SC-007）：指令後面緊接全形「（預估 N 分；超過 2 分鐘加 --background）」，沒有空白，貼進 zsh／PowerShell 會黏到 `--project` 的值上 | 原樣貼上 `node shared/template/tools/look.mjs run --project projects/範例（預估 4 分；超過 2 分鐘加 --background）` → `✖ 看不懂的參數「4」（用 --help 看用法）`，退出 2 | 預估移到冒號前：`→ 下一步（預估 4 分；超過 2 分鐘加 --background）：node shared/template/tools/look.mjs run --project projects/範例`；build 的 ✖ 原文同樣把指令放在最後 |
| C-03 | P1 | `lib/look.mjs`:49 `DISP_WARN`、:788-791；USAGE.md §7「瘦一點 → `"slim": 0.8`」；README 裁決「slim ≈ 1.05 才會 ⚠」 | 位移 ⚠ 看 95 百分位、門檻 5 %，在示範口播上 slim 0.8 就觸發，和裁決的「≈ 1.05 才 ⚠」不符；USAGE 建議的「瘦一點 0.8」一設就被告知「瘦臉太強，脖子與領口可能被拉彎；把 slim 調低」，弱模型會來回改 | `rC/專案2x`：slim 0.6 → `95% 的格 ≤ 3.63%`；slim 0.8 → `⚠ 位移 ＝ 臉寬 5.11%（95% 的格；> 5%）`。轉頭的格臉寬（234–454）變窄，比例被放大（4K 片段也一樣：最大 4.28 %、p95 3.60 %） | 擇一：門檻改 6.5 %（p95）；或比例的分母用整支的臉寬中位數（不用該格的臉寬）；或 USAGE 範例改 0.7。改完更新 :49 的註解與 look.md §8 |
| C-04 | P2 | spec 006 SC-001、US1 Independent Test | 「`assets/rough.mp4` 和 ffmpeg 直接套 LUT 的 ΔE76 ≤ 1.0」量不到：實測 1.02–1.13。不是 bake 錯：純 ffmpeg `lut3d,fps=30`＋同參數 x264 的結果到小數 3 位都一樣；只重新編碼不調光的基線就有 0.41–0.63 | `rC/de.mjs`：t＝30／85／150 s → assets vs ffmpeg+LUT 1.019／1.127／1.028；`base-lut.mp4`（純 ffmpeg 編碼）1.019／1.127；未調光 vs 原片 6.6（LUT 確實生效，平均亮度 +12.3） | SC-001 改成「和『ffmpeg lut3d＋同一組 x264 參數』的輸出比 ΔE ≤ 0.2」，或門檻放寬到 1.5 |
| C-05 | P2 | `lib/look.mjs` lookPreview :781-789；cli-006 §3.2 | preview 每 `floor(n/600)` 格抽一格算位移，印的「最大」不是真的最大；和 state 記的不一致 | `rC/專案2x` slim 0.6：preview 印「最大 4.8 px …＝臉寬 6.27%」；`state.footage.maxDisp` 7.7 px、`maxDispRatio` 0.0983 | 「最大」改用 renderLookFootage 存的 `maxDisp`／`maxDispAt`（preview 只在沒有底片時抽樣），或字樣改「抽樣最大」 |
| C-06 | P2 | `lib/look.mjs`:323（第 7 列預估）；`look.mjs`:395（`--background`） | 預估分鐘數不看 landmark 快取：只改 slim 時 build 的 ✖ 寫「預估 4 分」（status 寫 2 分，實際 27 秒），弱模型會多開 `--background`。`--background` 用 `modelSha(dirname×3(SELF))`＝`shared/`，manifest 讀不到 → 永遠當成要重新偵測，也忽略 `--template` | `rC/build2stale.log`：`（預估 4 分；…）`；同狀態 status `預估 2 分`；實測 `real 26.57`。`node -e` 驗：`modelSha('shared') → null` | 第 7 列傳 `detect: !landmarksFresh(...)`；:395 改用 `modelSha(templateDir)`（從 cmdRun 傳進來） |
| C-07 | P2 | `look.mjs`:44-57、:111、:203、:405；`lib/look.mjs`:75-77、:113-120、:272-275、:648、:700 | 幾則 ✖ 沒有「→ 改法」（憲法 III-4），參數錯誤也和 cli-006 §1 原文不同 | 實跑：`✖ 看不懂的參數「x」（用 --help 看用法）`（契約：`→ 跑 node shared/template/tools/look.mjs --help 看用法`）、`✖ 沒有「bogus」這個子指令 → 只有 …`（契約：`沒有 run／preview／status／clear／ensure 以外的子指令「x」→ …`）、`✖ 沒有 --nope 這個參數（用 --help 看用法）`；preview 的 ffmpeg／JPEG 失敗、kit/look.json 的 color／slim／lut、`.cube` 解析、`✖ 還是有檔不對`、`✖ 背景程序沒有啟動成功` 都只印原因 | 照 cli-006 §1 原文；preview 的 catch 補 `→ 確認 rough.mp4 能播；第二次失敗就停下來回報`；kit/look.json 補 `→ 從 git 還原 shared/template/kit/look.json`（:72-73 已有，:75-77 漏了） |
| C-08 | P2 | look.md §3.2、§5.1 `reason`；cli-006 §2.2、§4.1；USAGE.md §4.1 範例（:307、:353） | 程式多了 `reason: 'noface'`（抽樣 12 格都沒臉就略過整支偵測），look.md／cli-006 都沒有（look.md 只有 §7.3 單格 API 的 `noface`）；USAGE §4.2 已補（:393），但 §4.1 的範例還是舊行為「⚠ 講者瘦臉略過：偵測率 0%（< 80%）」，現在合成影片會印「⚠ 講者瘦臉略過：抽樣 12 格都沒偵測到臉 → 這支只調光；確定有講者就跑 … --force」 | `lib/look.mjs`:306-307、`look.mjs`:290-294；`dev/tests/look.test.mjs`「沒有臉的片（testsrc）」 | 契約 §3.2、§5.1、cli-006 §2.2／§4.1 補 noface 原文；請 001 把 USAGE §4.1 範例 :307、:353 換成新原文 |
| C-09 | P2 | `tools/editor/app.js` inspLook／refreshFaces（:1063-1091） | 這一格沒有臉（例如第 0 格全黑）時，兩個 `<img>` 沒有 src，顯示破圖示加 alt 文字；只處理 `reason === 'small'`，`noface`／`rate` 時仍顯示前後對照，API 回「還沒逐格偵測臉部 → 請 AI 跑 look.mjs run」，但重跑也一樣會略過 | `rC/editor.png`（t＝0：右側「原本」「瘦臉後」破圖＋「這一格沒偵測到臉…」）；`curl /api/look/face?t=0` → 404 `noface` | 沒拿到圖時把 figure 藏起來；`landmarks.slimOk === false` 一律顯示一行原因（small／noface／rate 各一句），不顯示前後對照 |
| C-10 | P2 | `editor/server/write.mjs` surgicalText 刪 `look`（:399 一帶） | 存 `null`（恢復預設）時連 `look` 後面的換行和縮排一起刪，下一個鍵被接到上一行（FR-043「那行消失、其他文字逐字相同」） | `rC/plan2x-before-editor.json` vs 存 null 後：`{ "version": 1, "speakerBox": [700,200,1220,1000], "scenes": [`（原本 `"scenes"` 在第 2 行） | 刪除時改吃前面的 `,` 與空白（`look` 是最後一個以外的 entry 時吃後面的 `,` 但保留換行） |
| C-11 | P2 | `lib/look.mjs`:616-617（renderLookFootage 驗長度） | 長度用 format duration 比，音軌是 copy，format 長度由音軌決定；畫面掉格也會過 | 程式路徑；本輪實跑沒有掉格（rough-look 與 rough.mp4 都是 5111 格） | 改比 video stream 的 `nb_frames`（或 `-count_frames`）和輸入格數 `n` |
| C-12 | P2 | `lib/landmarks.mjs`:109-155；FR-010；specs/README「請 003 加 export」 | 自己複製了一份 `launchChrome`／`cdpClient`，沒用 003 的；`audit-browser.mjs` 也還沒 export。兩份 Chrome 參數之後會分岔 | `grep -n export lib/audit-browser.mjs` 沒有這兩個 | 003 加 export 後改成 import，刪掉複本 |
| C-13 | P2 | `lib/landmarks.mjs` openDetector 的 `close()` | 程序被砍時（逾時、Ctrl+C）`mkdtemp` 的 Chrome profile 不會清；`$TMPDIR` 留著一個 32 MB 的 `look-lm-z20us5`（01:25 建立，早於本輪；本輪 5 次偵測都有清乾淨） | `ls $TMPDIR \| grep look-lm-` | openDetector 開始時清掉超過 1 天的 `look-lm-*`；或註冊 `process.once('SIGINT'/'SIGTERM')` 呼叫 close |
| C-14 | P2 | `build.mjs --check`（look.md §3.3） | 瘦臉底片過期時 `--check` 只報 ⚠、印「通過」，build 卻 ✖ 停下來；REVIEW.md §5 的驗收清單只看 `--check` 0 ✖ | `rC/專案2x` slim 0.8→0.6：`--check` `通過：1 段，3 個提醒`、`--json` `ok: true`；build 退出 1 | ⚠ 原文前加「build 會停下來：」，或讓 `--check` 也算 ✖（和 build 一致） |
| C-15 | P2 | spec 006 SC-004 | 「最大位移／臉寬 ＝ 2.7 % ± 0.3 %」拿的是原型單一正臉格；整支片段的「最大」含轉頭格，幾乎一定超過 3.0 % | 合成 4K 20 秒（`rC/專案4k`）：中位數 5.1 px／168 px ＝ 3.0 %、最大 4.28 %；`專案2x` 最大 6.27 %（抽樣）／9.83 %（全格） | SC-004 改看「中位數」或「正臉格（|yaw| < 0.1）的最大」 |
| C-16 | P2 | `look.mjs`:255、:428；`lib/look.mjs`:759-760 | 小殘留：:255 的 replace 前後字串一樣（沒作用）；`void pidAlive; void fileSha256;`、`rel`＋`void rel` 是沒用到的匯入與變數 | 讀碼 | 刪掉 |

P0：0 個。

## 實跑結果（摘要）

- **640×360（`rC/專案`）**：`run` 8.5 秒，`[1/3] 找臉：抽 12 格 → 臉寬中位數 43 px` → `⚠ 臉寬 43 px < 60 px（rough-look 畫面）：瘦臉效果不到 1 px，略過瘦臉；build 只調光`，不產生 rough-look，對照圖 3 列（1680×1210，第 3 欄留空）。`--help` 和 cli-006 §0 逐字一致；`ensure` 4 個 ✔。
- **1280×720 全片（`rC/專案2x`）**：163.7 秒（偵測 131 s、25.6 ms/格；變形編碼 24 s）；偵測 5110/5110（全黑 1 格不算）；rough-look 5111 格、170.841 s、和 rough.mp4 差 0.000 s；音軌 `-c copy` 的 md5 和 rough.mp4 相同（a9ce4d28…），8008 個封包；yuvj420p／pc／smpte170m 照抄。`face-landmarks.json` 3.66 MB：58 點、每格 `p` 116 個一位小數、`b` 4 個、`n`；第 0 格是 `0`（全黑）。對照圖 6×3（1680×2410），紅輪廓在綠輪廓內、下巴上提，看起來正常。
- **快取**：只改 slim 0.6→0.8：status `瘦臉底片：✖ 過期（瘦臉強度 0.6 → 0.8）`；run 印「找臉：用快取」「偵測…：用快取」，只重做變形，26.6 秒，`face-landmarks.json` 的 mtime 沒變。`clear` 後 status 回到「— 還沒跑」，重跑重算。只改 color 0.5：build 寫 `lut-0.50-…cube`、重新編碼，不用 run。
- **build 接線**：`--check` 併入 ⚠；build 印 `講者調光：0.8（kit/look/jianying-smart.cube，build 重新編碼底片時 bake）`＋瘦臉行；戳記 `key.look` ＝ `{"v":1,"color":0.8,"lut":"56969a5a84ac","slim":0.6,"footage":"rough-look.mp4"}`，`key.size` ＝ rough-look 的大小。過期時 build 退出 1 並印 `✖ 瘦臉底片不是最新的（瘦臉強度 0.8 → 0.6）→ 先跑 node shared/template/tools/look.mjs run --project …`。少 `.wasm`（`rC/faketpl`）：strict 也不丟錯，⚠ 略過並 → `look.mjs ensure`；`ensure` ✖ 退出 1。
- **4K（`rC/專案4k`）**：`[3/3] … 2560×1440，從 3840×2160 縮小`；599 格 39 秒（偵測 25 ms/格、變形 13 ms/格）。`--background`：印 pid 與 log，第二個 run `✖ 已經在跑了（pid …）`、clear `✖ 正在跑` 都退出 1，status 顯示「執行中」，45 秒後「完成」。
- **剪輯台**（port 4471，跑完已 `--stop`，沒有殘留程序）：`/api/state.look` 欄位齊（kit、plan、effective、baked、limits、landmarks、lines）；音效清單 17 個、沒有 bgm-outro；`/api/look/face` 360×360 JPEG，第一次 152 ms、之後 29 ms，全黑格 404 `noface`；存 `{color:0.7,slim:0.4}` 只動 look 那段，`{color:2}`、`{tone:1}` 被擋、檔案不動；沒有 look 時插在 `"scenes"` 前面；「重新產生」先跑 `look.mjs run`（log 併進來）再 build，53 秒，ok。截圖 `rC/editor.png`：「講者」在「整支影片」最上面，調光 0.50（剪映 50）、瘦臉 0.60、三個按鈕、狀態行。
- **測試**：`node --test dev/tests/*.test.mjs` 437 個：436 ✔、1 略過（`AUTO_EDIT_RMS_PROJECT` 沒設，不是 look 的），0 ✖。

## SC 逐項打勾（006）

| SC | 結果 | 實測 |
|---|---|---|
| SC-001 | ⚠ 部分 | run 8.5 s（≤ 30 ✔）；build 印調光行＋「略過瘦臉」⚠ ✔；ΔE76 1.02–1.13（> 1.0 ✖，但和純 ffmpeg 一樣，見 C-04） |
| SC-002 | ✔ | 原檔直接 `detectLandmarks`：5110/5110（100 %）、97 s；下顎 21 點和 `lm_full.npz` 平均差 0.413 % 臉寬（≤ 0.5 %）、平均偏移 (0.03, −0.01) px |
| SC-003 | ✔ | 1080p 60 秒：不調光 4.75 s、加 lut3d 11.08 s → 每分鐘多 6.3 s（≤ 10） |
| SC-004 | 未驗 | 沒有 ASUS 4K 原檔；合成 4K 中位數 3.0 %、最大 4.28 %（寫法見 C-15） |
| SC-005 | 推估 ✔ | 沒有 10 分鐘 4K；照 4K 片段 25.4＋13.4 ms/格外插 18,000 格 ≈ 11.9 分（≤ 15）、`--every 2` ≈ 8 分（≤ 11） |
| SC-006 | ✔ | face API 720p 第一次 152 ms、p50 29 ms；4K 第一次 313–387 ms（≤ 600）；調光滑桿走 `lookCss`，不打 API（讀碼） |
| SC-007 | ✖ | 每種狀態都只印一行 → ✔；但那一行不能直接複製執行（C-02），完成後的 → 和 run 不一致（C-01） |
| SC-008 | ✔ | 全部測試 0 ✖；look.test 34 個全過 |

## 跨線檢查結果

| 項目 | 結果 | 證據 |
|---|---|---|
| `spawn`／`spawnSync('npx'` 沒有 `shell` | ✔ 0 個 | caps.mjs:29（`shell: platform === 'win32'`）、qc.mjs:553／704（`npxShell`）、audit-browser.mjs:28（`shell: WIN`）、check-all.mjs:42（`WIN && cmd === 'npx'`）；look／editor 不呼叫 npx |
| `child_process` 呼叫 python／pip／uv | ✔ 0 個 | `rC/scan.mjs`；只有 setup/check.sh:169 讀 auto-editor 的 site-packages 路徑（檢測用，不執行 python） |
| 路徑硬寫 `/`、`~` | ✔ 程式 0 個 | `~`／`$HOME` 只出現在 Mac 專用的 check.sh、mac.md、troubleshooting.md 與顯示字串（install-skills.mjs:98 有 Windows 分支）；`${dir}/…` 拼路徑 0 個；`filterPath` 在含冒號、空白、中文的資料夾實跑 lut3d 過（look.test） |
| 遞迴強制刪除（shell 的 rm 遞迴、`Remove-Item -Recurse`） | ✔ 0 個 | 只有 `fs.rmSync` 刪 `work/.look/` 與自己建的暫存 profile |
| 根目錄 `package.json` | ✔ | 只有 `devDependencies.hyperframes: "0.8.221"`、`engines.node >=22`；`package-lock.json` 存在、沒被 .gitignore（兩個都還沒 commit） |
| `vendor/mediapipe` sha256 vs manifest | ✔ 4/4 | 大小合計 18,715,722 B；`ensure` 4 個 ✔；`.cube` sha256 `56969a5a…` 和 FR-001 一致 |
| 授權（MediaPipe） | ✔ | `vendor/mediapipe/LICENSE` 是 Apache-2.0 全文（202 行）；NOTICE.md 有「MediaPipe Tasks Vision 1.2.0 與 Face Landmarker 模型」段、Apache-2.0、提醒作者 push 前對 model card 原文 |
| `shared/sfx/sources.json` | ✔ 18/18 | 全部 `CC0 1.0`、sha256 都對；9 個作者合成（`source: 程式合成（dev/tools/make-sfx.mjs …）`、`license_note` 寫 CC0 釋出）；thunder、bgm-outro 有 `pending_author_check`（OpenGameArt 候選，2026-10-31 頁面 403）；NOTICE「18 個音效」一致 |
| look 的 ✖／⚠ 自帶 → | ⚠ 大部分 | 例外見 C-07（參數錯誤、preview 失敗、kit/look.json、背景啟動失敗） |
| AGENTS.md／Skill 與實際指令 | ⚠ | 指令（`status`、`run`、`--background`、`preview`、`ensure`、`clear`）都存在、參數一致；「照最後一行做」與 status 的 build 衝突（C-01）；USAGE 的 slim 0.8 範例會觸發 ⚠（C-03）；USAGE §4.1 範例是舊的「偵測率 0%」（C-08） |

## 我確認沒問題的部分

`--help` 原文；`ensure`（含少檔、退出碼）；臉太小略過；偵測、landmark 格式、快取鍵（只改 slim、只改 color、clear）；rough-look 的長度、格數、音軌 copy、色彩標記、4K 縮到 2560；build 的 bake、戳記、過期 ✖、缺資產 ⚠；`--background` 與鎖；剪輯台的 state、face API、存檔驗證、「重新產生」先跑 run、音效清單不含 bgm-outro；跨線的 npx／python／路徑／刪除／package.json／授權。
