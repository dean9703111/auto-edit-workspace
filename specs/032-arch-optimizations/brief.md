# 032 架構優化（39 項）

作者 2026-11-13 看完決定單後說「全部優化」。決定單（每項的現況、證據、建議）：https://claude.ai/artifact/DRQwqH5wkHFii6GSA9xS45
分支 `032-arch-optimizations`（從 main @ 3646eff）。這份是定案與分工；你是其中一條工作線時，先讀「共同規則」「共用模組」，再讀自己那一節。

## 共同規則（每條工作線都照做）

1. **只改自己那一節「擁有」的檔**。要別人的檔配合，寫進回報的「請別的工作線改」，不要自己動。可以在 `shared/template/tools/lib/` 建新檔（回報裡列出）。
2. **不 commit、不 push、不切分支、不 stash**。**不刪檔**（這台的本機規則會擋 shell 的刪除指令）：要退場的檔在回報列出，由主代理處理。
3. **測試只跑自己相關的檔**：`TMPDIR=/Volumes/auto-edit-tmp node --test --test-timeout=300000 dev/tests/<檔>.test.mjs`。不跑整套、不跑 `dev/check-all.mjs`、不用 `--test-name-pattern` 單跑 `examples.test.mjs`。別的工作線同時在改別的檔：遇到和你沒動的檔有關的失敗（語法錯誤、多出來的旗標），等 2 分鐘重跑一次；還是失敗就寫進回報，不要去修別人的檔。
4. **新測試寫在自己的新檔** `dev/tests/032-<工作線>.test.mjs`（例 `032-w1a.test.mjs`），暫存資料夾用 `t.after(() => fs.rmSync(dir, { recursive: true, force: true }))` 清掉。既有測試檔只在斷言必須跟著改時動那幾行，回報裡說明。
5. **訊息**：新訊息用 `lib/say.mjs`；停點那兩行用 `lib/stops.mjs`；✖ 一定附「→ 怎麼改」。「→ 下一步：」下面只能放整行可執行的指令（說明寫在同一行）。使用者原話的旗標叫 `--said`（`--say` 也收：`lib/cli.mjs` 的 `saidOf`）。用台灣用語（完成影片、講解、小視窗、影格；不寫成片、幀數）。
6. **`--help` 同步**：新指令、新旗標都要寫進該工具檔頭的說明。
7. **不改文件**（`.agents/skills/**`、`AGENTS.md`、`USAGE*.md`、`style.md`、`EDITOR.md`、`PROMPTS.md`、`README.md`、`CONTENTS.md`）：W4 和第二階段統一改。需要文件配合的寫在回報「文件要改」：新指令的完整寫法、它取代文件的哪一段。（W4 例外。）
8. **相容**：既有指令與旗標照舊能用（文件還沒改，弱模型還會照舊文件跑）。
9. **最小改動**：照檔案既有的寫法（ESM、零依賴、中文註解寫「為什麼」）。不順手重構、不改沒被要求的地方。
10. `shared/sfx/` 的非 wav 檔、`kit/sfx.json`、`NOTICE.md` 音效段不能出現剪映的音效名稱；不要重產 `shared/template/preview/` 的頁面。
11. **回報**（你的最後一則訊息，最多 45 行，繁體中文）：
    - 每項一行：`<編號> ✓｜部分｜沒做 — 做了什麼 — 動了哪些檔`
    - `測試：` 跑了哪些檔、幾個過、幾個沒過（沒過的原文一行）
    - `文件要改：` 每個新指令一行（完整寫法 → 取代哪份文件的哪一段）
    - `請別的工作線改：`、`沒把握的：`（沒有就寫「無」）

## 共用模組（主代理已寫好，`dev/tests/foundation.test.mjs` 8 項通過）

| 檔 | 匯出 | 用途 |
|---|---|---|
| `lib/tries.mjs` | `bumpTry(dir, key)`、`readTry`、`resetTry(dir, keys)`、`mainTry(project, name, ok)` → `{ n, max, stop }`、`MAIN_TRY_MAX`、`stopLine(n, what)`、`touchBeat(project, id)`、`lastBeat(project, id)` | 一個 key 一個檔的計數（C2）；主代理的指令連續沒過幾次就印「→ 停手」（A4）；子代理心跳（B5） |
| `lib/stops.mjs` | `STOP.<cuts｜framing｜storyboard｜final｜editor｜bg｜music>`、`stopLines.<同名>(…)`、`stopLines.revise(label, files)` | 停點名稱與那兩行原文的唯一來源（D9） |
| `lib/say.mjs` | `ok`、`warn(msg, fix)`、`fail(msg, fix)`、`quote`、`cmdLine(tool, args)`、`next(note, ...cmds)`、`assetsLine(files)`、`report(lines, { assets, stop })` | 訊息單一出口（C5）、回報段（A3） |
| `lib/cli.mjs` | `splitFlag`、`valueOf(argv, i, key, inline)`、`oneOf(flags, modes)`、`saidOf(flags)`、`isMain(import.meta.url)` | 參數解析共用（C4） |

**A3 回報段的寫法**（每條到停點、或做完一個階段的指令，最後印這一段；停點那兩行只在這一段的最後出現一次）：

```js
for (const l of report(['分鏡表好了：…', '驗證：…'], { assets: [abs], stop: stopLines.storyboard(url) })) console.log(l);
```

**A4 的寫法**（結束碼 75「還在跑」不算）：

```js
const t = mainTry(P.project, 'review', code === 0);
if (t.stop) console.log(stopLine(t.n, 'build.mjs --review '));
```

## 定案（介面）

| 編號 | 定案 | 工作線 |
|---|---|---|
| A1 | `build.mjs --set "<鍵>=<值>[;<鍵>=<值>]"`、`--unset "<鍵>[;<鍵>]"`：只收 plan.json 第一層的設定：`theme`（light／dark）、`style`（風格包資料夾名，要存在）、`format`（portrait／landscape）、`speakerSide`（left／center／right）、`chapterBadge`（true／false）、`look`（off）、`look.color`（0–1）、`look.slim`（0–1.2）、`look.beauty`（0–1）、`bed.music`（曲庫裡的曲名；none＝`null`）、`bed.volume`（−12–12）、`outro.from`（`#N`）、`outro.music`（曲名）。每次重新讀檔、只動那個鍵、`writeAtomic`、保留原縮排；鍵或值不對 ✖ 並列出能寫的。印 `✓ plan.json：theme＝dark（原本 light）`＋`→ 下一步` 的 build 指令。`build.mjs --to-design <段,段>`：把那幾段換成內容設計動畫（`storyboard-gen.mjs` 的 `toDesign`）、補 `work/briefs/`、歸零驗收次數、印派工那一行。實作放新檔 `lib/plan-set.mjs`。 | W1b |
| A2 | `build.mjs --framing`：量構圖、開構圖台、記 ② 待回覆、回報段（建議那一行、調光瘦臉、素材盤點）＋停點 ②。沒有講者的專案印「不用構圖」並直接做後半。`build.mjs --framing-done [--use suggested｜<倍率>] [--said "…"]`：不帶 `--use`＝「調好了」；`suggested`＝寫入建議的框；數字＝寫入那個倍率。接著記 ② 通過（`--back "plan.json frame"`）、瘦臉過期就先跑 look（還在跑回 75、同一條再跑）、量講者框、切章（`--scaffold`）。實作放新檔 `lib/framing-flow.mjs`。 | W1b；`status.mjs` 的 ② 改印這兩條：W3b |
| A3 | 回報段：`--framing`（W1b）、`--storyboard`／`--merge-drafts`、`--review`（W1a）、`versions.mjs finish`（W2a）、`deliver.mjs`（W2b）、`media.mjs prep`／`rough`（W3a）。內容照各支 Skill「回報格式」現在的樣板，工具知道的數字都填好；要 AI 判斷的留一行提示（例「拼圖：<頁面路徑>（看完把 FAIL 的段寫在這一行）」）。交付（初剪、完成影片）帶 `assets`。 | 各線 |
| A4 | `mainTry`：`prep`、`rough`（W3a）；`framing`（W1b）；`map-merge`、`merge-drafts`、`storyboard`、`apply-storyboard`、`review`（W1a）；`finish`（W2a）；`deliver`（W2b）。到上限在最後印 `stopLine`。 | 各線 |
| A5 | `versions.mjs use`：沒有開著的回饋輪就自己 begin → use → finish 一次做完（`--said`；沒給用「退回 <版>」）；輪開著就只做 use。`versions.mjs compare --seg <段> [--a v1 --b v2]`：兩版各補預覽、出比較影片、換回目前的版。`versions.mjs new`：沒開輪就自己開（原話用 `--note`）、自己記停點 ③（<段> v<N>）待回覆、最後印那兩行。`versions.mjs begin --requests`：讀 `work/feedback/editor-requests.md` 的版本與段號，回報剪輯台「生成中」；`finish`：這一輪有改到的段回報「已改完」，沒改到的回報「失敗」（理由取 r<N>.md 那一列，沒有就寫「這段沒有改動」）。手動的 `--requests-state` 照舊能用。 | W2a |
| A6 | `media.mjs sort --project <專案> [--apply] [--as "檔名=camera;檔名=screen"]`：預設只印「打算怎麼搬」的表（規則照 `sort-assets.md` 的決策表），看不出來的影片截中間一格、拼成 `work/分類-總表.jpg`；`--apply` 才搬，同名不覆寫、列為待確認。`media.mjs new <名稱>`：建專案與四個素材資料夾、印要告訴使用者的那段話。實作放新檔 `lib/sort-assets.mjs`。 | W3a |
| A7 | `brand.mjs bg --image <圖> --kind fs｜side｜ch [--dark] --out <資料夾>`：裁成對的尺寸、出 zones 圖、量框裡有沒有裝飾（和 HTML 路線同一套）。`brand.mjs bg --verify <資料夾>`：三張（和 -dark）尺寸、zones、`preview.jpg`、最後印停點 ⑥ 那兩行（完整路徑）。`brand.mjs bg --tmp`：開一個暫存資料夾、印完整路徑。 | W3b |
| A8 | 自我核對裡查得到的事實併進到停點的指令（不過就 ✖）。第一階段只做便宜的：`--storyboard` 檢查有講者的專案 ② 已通過、plan.json 有 `speakerBox`（W1a）。Skill 的核對表第二階段再瘦身。 | W1a＋第二階段 |
| A9 | ① `media.mjs cuts --project <專案> --keep 3,5｜--cut 7 [--said "…"]`：改「剪」欄、記 ① 修改後重停、印停點 ①（W3a）。② `look.mjs default [--color x] [--slim y] [--beauty z]`：只改 `kit/look.json` 那幾個鍵（W2b）。③ `status.mjs --init --format <版式>` 連 plan.json 的 `format` 一起改（W3b）。④ `build.mjs --show 1:15`（或 `75`）：印那一秒所在的段（W1b）。⑤ `media.mjs illus-show <元件> [--opts "screen=rec"]` 印 SVG；`illus-lint --only <名稱> --states a,b` 檢查狀態都在（W3a）。⑥ `deliver.mjs`：`output/final.mp4` 已經對得上現在的內容就印 `✓ 已經是最新的`、不重做（`--force` 才重做）（W2b）。⑦ `brand.mjs use`：目前的主色與背景不屬於任何包時，自動先存成 `原本-<YYYYMMDD>` 再換（W3b）。 | 各線 |
| A10 | 縮小成素材清單：`media.mjs prep` 記 `work/.jobs/assets-manifest.json`（`assets/` 每個檔與 `講稿.md` 的大小、修改時間）（W3a）；`status.mjs` 比對，有檔被改或不見印 `素材：⚠ …`（多出新檔不算）（W3b）。`shared/` 不做 git 比對（作者開發時常態是髒的，會變誤報）；「派工後 plan.json 不能動」也不做（主代理本來就會改）。 | W3a、W3b |
| B1 | 「占了 A 的一半以上」只有 2 份以上才印；版面節奏的秒數比較留 0.5 秒容差，不過時印可以照抄的改法；章節角標疊在講者介紹上不算重疊。 | W1a |
| B2 | `--storyboard --only` 在 ③ 已通過時不再記停點、不印停點那兩行（印「③ 已經通過：只重截 …」）；`appendStop` 同一個停點連續兩筆同狀態只留一筆。 | W1a |
| B3 | audit 遇到 plan.json 比 index.html 新：沒帶 `--only` 就先 build 再量；帶 `--only`（子代理）就 ✖、不出拼圖，訊息叫它把原文交回主代理。 | W3b |
| B4 | `--outline` 每一拍列出「選了不會 ✖、⚠ 的詞」；草稿階段和定稿階段同一條規則同一個等級；自動修加「拍距不足就併拍」「最後一幕太短就延 to」。 | W1a |
| B5 | 派工的那一刻記 `work/.jobs/dispatch.json`（哪一段、第幾次、時間）；`--design-status` 以這次派工之後的 `lastBeat`、檔案變動判斷有沒有進度。`audit.mjs --only` 每跑一次 `touchBeat`（W3b）。 | W1a、W3b |
| B6 | 第三階段：拍點只存一處。先寫 `specs/032-arch-optimizations/beats-single-source.md` 再實作。 | 第三階段 |
| B7 | 檢查指令（`--map`、`--outline`、`--check-draft`）不改 AI 寫的檔；要補的值印出來，合併時才落地。 | W1a |
| B8 | 空白畫布骨架給上下置中的舞台容器；垂直平衡的訊息改印目標值。 | W3b |
| C1 | `reviewCmd` 連 stderr 一起看；抽 `failLines(r)` 給 `--storyboard`、`--review` 共用。 | W1a（`versions.mjs` 的那一份：W2a） |
| C2 | `runCount`／`resetRuns` 改用 `lib/tries.mjs`（匯出名稱不變）（W1a）；`editor/server/cuts.mjs:63`、`storyboard.mjs:62`、`versions.mjs:548`（W2a）、`lib/settings.mjs:45`、`status.mjs:644`（W3b）換成 `writeAtomic`。 | 各線 |
| C3 | look、capcut 的背景工作改走 `lib/job.mjs`（結束碼 75、再跑同一條）；`job.mjs` 加「log 超過 N 分鐘沒有新內容就印 ⚠ 和取消指令」、匯出共用的等待函式。別的檔裡那幾份 `while (status === 75)` 第二階段再換。 | W2b |
| C4–C8 | 第二階段：全部工具改用 `lib/cli.mjs`、`lib/say.mjs`；摘要行與網址不再用比對文字；數字從主人匯入；退役路徑收掉（只收任何專案狀態都走不到的，舊專案的資料格式相容留著）。 | 第二階段 |
| C9、C10 | 第三階段。 | 第三階段 |
| D1 | docs.test 加步驟編號檢查（W4）；工具裡指錯的：`status.mjs:474`、`audit.mjs:120`（W3b）、`lib/media.mjs:1202`、`media.mjs:803`（W3a）；文件裡指錯的（W4）。 | W4、W3a、W3b |
| D2 | 文件改成每分鐘 5 顆；docs.test 加「程式常數 → 文件句型」對照；USAGE.md 4.1 的範例重新產生。 | W4 |
| D3 | `status.mjs` 呼叫 `setup/install-skills.mjs` 的檢查，不一致印 `Skill：⚠ …` 和更新指令（W3b）；環境檢測共用（W5）。 | W3b、W5 |
| D4 | 路由表觸發語補進各支 Skill 的 description；docs.test 加檢查。 | W4 |
| D5 | docs.test 驗整段指令的旗標、退路表原文對程式（W4）；`brand.mjs --help` 補 `speaker`（W3b）、`editor.mjs --help` 補 `--round`（W2a）。 | W4、W3b、W2a |
| D6 | `.github/workflows/check.yml`、`package.json` scripts、`dev/hooks/pre-commit`。 | W5 |
| D7 | `helpers.mjs` 加 `tmpDir(t)`、`needs(t, 'ffmpeg'｜'chrome')`；6 支介面測試改成用到才載入 `puppeteer-core`；`check-all.mjs` 加逾時。其他測試檔的暫存清理第三階段再做。 | W5 |
| D8 | 第三階段。 | 第三階段 |
| D9 | Skill 開頭「衝突時…」那一行刪掉（docs.test 的 T4 跟著改）；look-preview 那句改對；`docs-allow.json` 清掉失效的、沒用到的讓測試變紅；CONTENTS.md 舊資料夾名改回 `成片/` 等原名（W4）。各工具把自己檔裡寫死的停點原文換成 `lib/stops.mjs`（各線）。 | W4、各線 |
| D10 | 正本 `.agents/agents/auto-edit-worker.md`，`install-skills.mjs` 用同一套標記檔＋sha256 複製到 `.claude/agents/`；`.codex/` 加進 `.gitignore`。 | W5 |
| D11 | `make_sfx.py`、`build_test_media.py` 搬到 `dev/archive/`（`git mv`，不刪）；`dev/README.md` 表格修好、補齊；`weak-model-brief.md` 改用語。 | W5 |

## 跨線介面（先定好簽名，兩邊照這個寫；對方還沒寫好時，測試等 2 分鐘重跑）

| 提供 | 函式 | 使用 |
|---|---|---|
| W1b `lib/plan-set.mjs` | `setPlan(project, { <鍵>: <值>, … })` → `[{ key, from, to }]`（只改有變的鍵；鍵或值不對丟 `Error`，訊息以 `✖` 開頭、附「→ 能寫的：…」）；`unsetPlan(project, [<鍵>])` 同樣回傳 | W3b（`status.mjs --init --format`） |
| W3a `lib/assets-manifest.mjs` | `writeManifest(project)`；`diffManifest(project)` → 沒有清單回 `null`，否則 `{ changed: [相對路徑], missing: [相對路徑] }`（多出來的新檔不算） | W3b（`status.mjs`） |
| W5 `setup/install-skills.mjs` | `checkInstalled()` → `{ ok, stale: [一行一個人看得懂的說明] }`，不印東西、不安裝 | W3b（`status.mjs`） |
| W2a `editor.mjs` | `ensureEditor(P)` → `Promise<{ main, cuts, framing, storyboard, final, … }>`（沒開就開，網址直接回傳、不用比對輸出文字） | 第二階段（`lib/flow.mjs`、`status.mjs`、`lib/framing-flow.mjs` 改用） |
| W1a `lib/flow.mjs` | `failLines(r)` → `r.stdout＋r.stderr` 裡 `✖`／`Error` 開頭的行 | W2a 可用（versions 已經讀兩邊的話不用換） |

## 第一階段的工作線與檔案所有權

路徑省略 `shared/template/tools/`。

| 線 | 擁有的檔 | 項目 |
|---|---|---|
| W1a 分鏡流程 | `lib/flow.mjs`、`lib/semantic-map.mjs`、`lib/layout-rhythm.mjs`、`lib/autofix.mjs`、`lib/progress.mjs`、`lib/storyboard-gen.mjs`、`lib/scaffold.mjs`、`lib/agents.mjs` | B1、B2、B4、B5（flow 這一半）、B7、C1、C2（計數）、A3（③④）、A4、A8（閘門）、D9（flow 裡的停點原文） |
| W1b build 入口 | `build.mjs`、`qc.mjs`（只為了 A2 匯出要用的函式）、新檔 `lib/plan-set.mjs`、`lib/framing-flow.mjs` | A1、A2、A3（②）、A4（framing）、A9④ |
| W2a 回饋輪與剪輯台 | `versions.mjs`、`editor.mjs`、`editor/**`、`lib/storyboard-state.mjs` | A5、A3（finish）、A4（finish）、C1（versions 那份）、C2（三處）、C6（`editor.mjs` 匯出 `ensureEditor(P)` 回傳各頁網址）、D5（`--round`）、D9（versions 的停點原文） |
| W2b 背景工作與輸出 | `deliver.mjs`、`lib/deliver.mjs`、`capcut.mjs`、`look.mjs`、`lib/look.mjs`、`lib/job.mjs`、`lib/incremental.mjs` | C3、A9②、A9⑥、A3（deliver）、A4（deliver） |
| W3a 素材 | `media.mjs`、`lib/rough-flow.mjs`、`lib/shorts.mjs`、`lib/illus-lint.mjs`、`lib/media.mjs`、`lib/cover.mjs`、新檔 `lib/sort-assets.mjs`、`lib/assets-manifest.mjs` | A6、A9①、A9⑤、A3（prep、rough）、A4（prep、rough）、A10（記清單）、D1（工具裡兩處）、D9（rough-flow 的停點原文） |
| W3b 狀態、風格、量測 | `status.mjs`、`lib/settings.mjs`、`brand.mjs`、`lib/styles.mjs`、`music.mjs`、`lib/music.mjs`、`audit.mjs`、`lib/audit-*.mjs`、`lib/project-design.mjs`、`caps.mjs`、`lib/custom-fill.mjs`（只為 B8 的空白畫布骨架） | A7、A9③、A9⑦、A10（比對）、B3、B5（心跳）、B8、C2（兩處）、D1（工具裡兩處）、D3、D5（speaker）、A2（status 的 ② 改印新指令）、D9（status、music 的停點原文） |
| W4 文件與文件測試 | `.agents/skills/**`（這一階段只做 D4、D9 的文字）、`shared/style.md`、`shared/template/USAGE.md`、`USAGE-reference.md`、`EDITOR.md`、`CONTENTS.md`、`dev/tests/docs.test.mjs`、`dev/tests/docs-allow.json` | D1、D2、D4、D5、D9 |
| W5 維護設施 | `dev/tests/helpers.mjs`、6 支介面測試的載入方式、`dev/check-all.mjs`、`.github/workflows/check.yml`、`package.json`、`dev/hooks/`、`dev/README.md`、`dev/tools/*.py`、`dev/loop/weak-model-brief.md`、`setup/install-skills.mjs`、`dev/tests/install-skills.test.mjs`、`.agents/agents/`、`setup/check.sh`、`setup/check.ps1`、`.gitignore` | D3（環境檢測）、D6、D7、D10、D11 |

## 第二階段（第一階段整合完才派）

共同規則照第一階段（不 commit、不刪檔、只改自己的檔、測試只跑相關的、回報格式），另加：

12. **驗收測試** `dev/tests/032-p2.test.mjs`（主代理寫好，現在是紅的）：靜態掃工具原始碼，失敗會列「檔:行」。你負責讓**自己擁有的檔**不再出現在清單上；別人的檔還在清單上不用管。真的要例外的（例：讀使用者打的勾）寫進它的 `ALLOW` 並寫理由，回報列出。
13. **訊息改字的原則**：C5 只改「怎麼印」（改用 `next()`、`dispatch()`、`ok()`、`cmdLine()`），**不改字**。文件和別的工具在比對的字（停點、回報段、✖ 的原文）一個字都不動；非改不可的，回報「改了哪句、原本是什麼」。
14. **派工訊息**：「→ 下一步」下面接的是給子代理的派工訊息時，改用 `dispatch(說明, ...訊息)`（印「→ 派工：…」，下面每一行縮排兩格是一則照抄的派工訊息）。

### 新增的共用模組（主代理已寫好，`foundation.test.mjs` 10 項通過）

| 檔 | 匯出 | 用途 |
|---|---|---|
| `lib/say.mjs` | 多了 `dispatch(note, ...msgs)`；`next()` 測試時（`NODE_TEST_CONTEXT`）放錯丟錯、正式剪片時把不是指令的行併進說明 | C5 |
| `lib/build-summary.mjs` | `SUMMARY_HEADS`、`isSummaryLine(l)`、`isSfxWarn(l)`、`summaryLines(text)` | C6：build 六行摘要只認這一份 |

### 跨線介面（第二階段）

| 提供 | 函式 | 使用 |
|---|---|---|
| P2b `lib/job.mjs` | `runToolUntilDoneSync(file, args, { maxWaitSec = 10800, cwd, env, maxBuffer })` → `{ status, stdout, stderr, waits, timedOut }`（形狀和 `spawnSync` 一樣，換掉 `do { … } while (r.status === 75)` 只要改一行） | P2a（`lib/flow.mjs`）、P2b（`versions.mjs`） |
| P2b `editor.mjs --json` ＋ 新檔 `lib/editor-urls.mjs` | `editor.mjs --project <專案> --json` 印 `ensureEditor` 的結果（一行 JSON）；`editorUrlsSync(project, { template } = {})` → `{ main, cuts, framing, storyboard, final, … }` 或 `null`（同步：spawnSync＋JSON.parse，給同步的呼叫端） | P2a（`lib/flow.mjs` 的 `startEditor`、`lib/framing-flow.mjs`）、P2c（`lib/rough-flow.mjs`）、P2b（`versions.mjs`） |

對方還沒寫好時：先做別的項目，最後再接；測試等 2 分鐘重跑。

### 工作線與檔案所有權（路徑省略 `shared/template/tools/`）

| 線 | 擁有的檔 | 項目 |
|---|---|---|
| P2a 分鏡與 build | `build.mjs`、`qc.mjs`、`lib/flow.mjs`、`lib/framing-flow.mjs`、`lib/plan-set.mjs`、`lib/storyboard-gen.mjs`、`lib/scaffold.mjs`、`lib/semantic-map.mjs`、`lib/autofix.mjs`、`lib/progress.mjs`、`lib/layout-rhythm.mjs`、`lib/agents.mjs` | C4、C5、C6（摘要、網址、framing-flow 不再比對 scaffold 的輸出）、C3（flow 的 75 迴圈） |
| P2b 回饋輪、剪輯台、輸出、狀態 | `versions.mjs`、`editor.mjs`、`editor/**`、`deliver.mjs`、`lib/deliver.mjs`、`capcut.mjs`、`look.mjs`、`lib/look.mjs`、`lib/job.mjs`、`lib/incremental.mjs`、`status.mjs`、`lib/settings.mjs`、`lib/storyboard-state.mjs`、新檔 `lib/editor-urls.mjs` | C4、C5、C6、C3（`runToolUntilDoneSync`、versions 三處 75 迴圈）、C8（自己檔裡的） |
| P2c 素材、風格、量測 | `media.mjs`、`lib/rough-flow.mjs`、`lib/shorts.mjs`、`lib/illus-lint.mjs`、`lib/media.mjs`、`lib/cover.mjs`、`lib/sort-assets.mjs`、`lib/assets-manifest.mjs`、`brand.mjs`、`lib/styles.mjs`、`music.mjs`、`lib/music.mjs`、`audit.mjs`、`lib/audit-*.mjs`、`lib/project-design.mjs`、`caps.mjs`、`lib/custom-fill.mjs` | C4、C5、C6（rough-flow 的網址）、C8（`srt-split`、`snap-srt`） |
| P2d 文件：分鏡、審查、動畫 | `.agents/skills/auto-edit-storyboard/**`、`auto-edit-review/**`、`auto-edit-motion/**`、`shared/template/EDITOR.md`、`REVIEW.md`、`BEATS.md` | X2、A8、A4（這三支） |
| P2e 文件：其他 | `.agents/skills/auto-edit-{rough,longform,deliver,style,screen,setup}/**`、`AGENTS.md`、`shared/style.md`、`shared/template/USAGE.md`、`USAGE-reference.md`、`SITUATIONS.md`、`setup/README.md`、`specs/contracts/*.md`、`README.md`、`PROMPTS.md`、`dev/loop/weak-model-brief.md`、`dev/tests/docs.test.mjs`、`docs-allow.json` | X2、A8、A4（這六支）、AGENTS.md、T11 轉綠 |

**C8 的界線**：只收任何專案、任何工作區狀態都走不到的程式（沒有文件引用的子指令、build 還沒有 `--json` 時的降級路徑）。讀舊資料格式的相容（`講者.json`、沒有「剪」欄的剪輯清單、舊停點名）留著：別人 clone 的舊工作區還會有這些檔。

## 第三階段

共同規則照第一、二階段。分兩批，第二批等第一批整合完才派（會動到同一批核心檔）。

### 第一批（平行）

| 線 | 擁有的檔 | 項目 |
|---|---|---|
| P3a B6 | 照 `beats-single-source.md` §6：新檔 `lib/beat-source.mjs`、`lib/beat-remap.mjs`；`lib/custom-fill.mjs`、`build.mjs`、`audit.mjs`、`versions.mjs`、`lib/audit-beats.mjs`、`lib/plan.mjs`、`lib/autofix.mjs`、`lib/flow.mjs`、`lib/plan-set.mjs`、`lib/storyboard-gen.mjs`、`editor/storyboard.js`、`editor/server/write.mjs`、`media.mjs`；測試 `audit`、`versions`、`scaffold`、`custom-fill`、`editor-storyboard-ui`、新檔 `032-b6`；§5 列的文件 | B6 步驟 1–6 |
| P3b D7 | `dev/tests/helpers.mjs`、`dev/tests/*.test.mjs`（P3a 那 5 支和 `032-*` 除外） | D7 其餘：暫存一律 `tmpDir(t)`、用到 ffmpeg／Chrome 的加 `needs()`、重複現做的素材改 `fixture()` |
| P3c D8 | `dev/check-all.mjs`、`dev/loop/**`、`dev/README.md`（check-all 那段）、`package.json` 的 scripts | D8：一鍵檢查照 `status.mjs --json` 印的指令一路跑到停點 ④，每次跑完在紀錄檔加一行 |

### 第二批（第一批整合後）

| 線 | 擁有的檔 | 項目 |
|---|---|---|
| P3d 單一出處 | `media.mjs`、`build.mjs`、`qc.mjs`、`versions.mjs`、`deliver.mjs`、`editor.mjs`、`lib/rough-flow.mjs`、`brand.mjs`、`lib/canvas.mjs`、`lib/audio.mjs`、`lib/time.mjs`、`lib/main.mjs`、新檔 `lib/project.mjs`、`lib/check-project.mjs` | C9（純函式搬到 `lib/project.mjs`、`lib/rough/`，原檔 re-export；`r3` 統一前先跑逐位元組比對）、`checkProject(P)` 行程內呼叫、C7（數字只從 canvas／audio／time 匯入，kit 的 JS／CSS 加測試對） |
| P3e 大函式與狀態 | `lib/plan.mjs`、`lib/media.mjs`、`status.mjs`、`lib/progress.mjs` | C10（`resolvePlan`、`validateMedia` 照分節抽成收 `ctx` 的小函式，從尾端獨立的幾節開始；status 的狀態判斷改成明確的標記檔，舊專案沒有標記照舊推）；C7 在 `lib/plan.mjs` 的那幾處；`status.mjs` 的 `pathsFrom` 改從 `lib/project.mjs` 匯入（P3d 提供） |

### 第三階段新增的共用模組

| 檔 | 匯出 | 用途 |
|---|---|---|
| `lib/project.mjs` | `findProject`、`pathsFrom`、`loadLib`、`hasVoiceSource`、`projectLabel`、`fromRoot` | C9：專案路徑（`build.mjs` 照舊 re-export） |
| `lib/check-project.mjs` | `checkProject(project, opts)` → `build --check --json` 的結果（不 exit、不印、不改 cwd） | qc、versions、deliver 行程內呼叫；剪輯台照舊開子行程（長片檢查要好幾秒，會卡住網頁請求） |
| `lib/rough/*.mjs` | 剪乾淨的純函式（13 支：util、scan、main-track、snap、cuts、cutpoints、matte-setup、ref、ngscan、screen-sync、verify、align、illus） | C9：`media.mjs` 只留指令列與 re-export |
| `lib/time.mjs` | 多了 `r3Round`（Math.round 版；`r3` 是 toFixed 版，兩種在 .xxx5 差 1 毫秒，照各檔原本那種匯入）、`clock1`（m:ss.s）、`clock2`（m:ss.ss）、`clock2r` | C9 |
| `lib/canvas.mjs` | 多了 `LAYOUT`（plan.mjs 原本自己寫的版面數字）；`lib/audio.mjs` 多了 `LOUD_TEXT` | C7（`dev/tests/032-c7.test.mjs` 拿 kit 的 JS／CSS、剪輯台的數字和這兩份對） |
| `lib/progress.mjs` | `markStep`、`readSteps`、`stepChanged`、`fileSig`、`STEP_INPUTS`（標記寫在 `work/.jobs/state.json`） | C10：status 照標記判斷做到哪 |

**S10「分鏡表還沒套回」的定案（主代理）**：有標記的專案看「沒套回過」「套回之後又整份重產（`storyboard` 記得比 `apply-storyboard` 晚）」「有人改過」三者之一。「有人改過」看 `lib/storyboard-state.mjs` 的雜湊，不看套回時記的指紋：`--review`、回饋輪、`--to-design` 這些工具照正本重寫分鏡表時會同步記雜湊，不算改過（不然 B6 之後每次 `--review` 都會被判回 ③）。`--storyboard --only` 在 ③ 通過之後只重截幾段，不記 `storyboard`。測試：`032-b6` 步驟 3-3b、`032-p3e` 的 status 標記那兩項。

## 進度（主代理維護）

| 階段 | 狀態 |
|---|---|
| 共用模組 | ✓ 2026-11-13 |
| 第一階段 | ✓ 2026-11-13：8 條線都回報、互相請託的已整合（第一次派時額度用完中斷，重派） |
| 第二階段 | ✓ 2026-11-13：5 條線都回報；032-p2 驗收 5/5、docs.test 37/37；✔ 統一成 ✓（含 setup、specs/contracts） |
| 第三階段 | ✓ 2026-11-13：第一批（B6、D7、D8）、第二批（C9＋checkProject＋C7、C10）都整合完；suite-4 整套 83 支，81 支一次過、2 支偶發（032-w1b 清理順序已修、design 的 puppeteer 逾時），單獨重跑全過；check-all 橫式、直式都 ✓ 到停點 ④（3m10s） |
| Skill 複本 | ✓ 2026-11-13 作者同意後重裝：9 支 × 2 個位置更新、子代理新裝；`install-skills.mjs --check` ✓ |
| 待作者決定 | commit |
