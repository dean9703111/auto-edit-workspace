---
name: auto-edit-rough
description: 把 projects/<專案> 的講解剪成初剪：接主軌、逐字稿、找 NG 列剪輯清單、auto-editor 去停頓、字幕校正拆句與對齊開口、剪接點。當使用者說「剪乾淨」「剪成初剪」「找 NG」時使用。已經有 work/rough.mp4、要做資訊卡或完成影片時不要用（改用 auto-edit-storyboard）；只改字幕文字或時間時也不要用（改用剪輯台，auto-edit-review 流程 C）。
version: 0.1.0
---
# 剪乾淨（初剪）

規則在 AGENTS.md；本檔只寫這一階段的指令、判準、停點、退路。
衝突時：使用者當下的話 > AGENTS.md > shared/style.md > USAGE.md > USAGE-reference.md > 本 Skill；派工時派工訊息 > 本 Skill。

| 輸入 | 指令 | 產出 | 完成判準 | 停點 |
|---|---|---|---|---|
| `assets/camera/`、`assets/voice/` | 步驟 1–5 | `work/main.mp4`、`work/cuts.md`（多支主軌另有順序表）、剪輯清單網址 | NG 表表頭五欄（第一欄「剪」）、時間碼是 `work/main.mp4` 的 `起–迄` | ① 剪輯清單 |
| ① 通過 | 步驟 6–8 | `work/rough.mp4`、`work/rough.srt`、`work/cutpoints.json` | 見各步「完成判準」 | — |

指令都在工作區根目錄執行。`<專案>` 換成資料夾名稱；`<主軌>`＝`projects/<專案>/work/main.mp4`（步驟 1 產生）。

## 開始前

| 條件（看得到的事實） | 做法 |
|---|---|
| `work/rough.mp4` 已經存在 | 先問使用者要不要重剪（會蓋掉），不要直接重跑 |
| 停點紀錄最後一列是「① 剪輯清單｜待回覆」 | 不重做；使用者的回覆照下面「停點」那張表處理 |
| 沒有 `講稿.md` | 字幕只轉繁體、補標點，不猜內容（AGENTS.md 規則 4）；沒有章節空檔表 |

## 步驟

**1. 決定主軌**

```
node shared/template/tools/media.mjs main --project projects/<專案>
```

一律先跑這一行，只有一支真人錄影也要跑：它把原片轉成固定 fps 的 `work/main.mp4`（auto-editor 直接剪手機原檔，`--cut-out` 之後的畫面會全黑），時間和原片一樣；之後逐字稿、ng-snap、auto-editor 都對 `work/main.mp4` 做。

| `assets/camera/` | `assets/voice/` | 做法 |
|---|---|---|
| 1 支 | 空 | 跑上面那一行就好 |
| 其他情況 | — | 先照檔名排序接（上面那一行），把順序寫進 cuts.md 的「主軌順序」表，併進停點 ① 問；使用者改了順序就照「停點」表重接 |

`assets/screen/` 裡邊錄邊講的螢幕錄影（有講話、有換氣停頓）也會接進主軌：只取聲音、配純黑，畫面在步驟 8 之後由 `screen-sync` 蓋回；這幾支只剪 NG、停頓保留（ng-snap 自己加 `--add-in`）。背景音樂、沒聲音的錄影還是插入素材（`auto-edit-screen`）。main 每支錄影印一行判斷（「偵測到講解」「聲音幾乎沒停」「沒有聲音」），照抄進 cuts.md 的「主軌順序」表；使用者說某支其實有講解（或沒有），用 `--order` 列出要接的檔（可以寫 `assets/screen/<檔名>`）。有講稿時 ng-snap 會照講稿比對順序，印 ⚠ 和建議的 `--order`，一起放進停點 ①。

完成判準：`work/main.mp4`、`work/main.json` 存在；只有一支時印「只有一支真人錄影（…）：轉成固定 fps 的 work/main.mp4…」。
常見錯誤：拿 `assets/` 的原檔直接給 auto-editor → 不要，一律用 `work/main.mp4`（ng-snap 印的三行已經是它；忘了跑 main，ng-snap 會自己先轉）；順序參數有逗號沒加引號（PowerShell）→ 加雙引號 `--order "檔名1,檔名2"`。

**2. 轉逐字稿**

```
npx hyperframes transcribe "<主軌>" -d projects/<專案>/work --model small --language zh --json
```

完成判準：`work/transcript.json` 存在，內容是中文。
常見錯誤：變成英文 → 少了 `--model small --language zh`；`whisper-cli crashed (SIGABRT)` → Mac 指令最前面加 `GGML_METAL_BF16_DISABLE=1`（Mac 第一次就可以直接加）；檔案寫進 `assets/` → 少了 `-d projects/<專案>/work`；主軌很長時轉錄要跑好幾分鐘 → 能背景執行就背景執行，不要接 `| tail`、`| head`（錯誤訊息會被截掉）。

**3. 找 NG：跑 ng-scan**（拿不準時讀 `references/ng-rules.md`）

```
node shared/template/tools/media.mjs ng-scan --project projects/<專案>
```

它把詞級逐字稿對到講稿：講到後面又跳回前面重講的，前一次列成 NG 候選（留最後一次）；講稿找不到的話列「講稿外」；沒講稿時比相鄰句。印的 NG 表照抄進 cuts.md（「剪」欄一律 `[x]`，不想剪的由使用者在剪輯清單頁取消），「講稿外」逐條看：是講到一半卡住、自言自語的才加進 NG 表（「剪」也寫 `[x]`），拿不準就在「待確認」寫原因。講稿每一行的開口時間在 `work/ng-scan.md`，要查某句在哪就查它，不要自己寫程式比對逐字稿。
完成判準：每段 NG 有原片時間碼、內容、原因；拿不準的，「待確認」欄寫原因。
常見錯誤：自己寫腳本、拿音軌驗證逐字稿 → 停，照 AGENTS.md「剪乾淨時不要做的事」，ng-scan 的表就是依據；印 `⚠ work/transcript.json 只到 …` → 步驟 7 已經把它換成 rough.mp4 的了，回到步驟 2 重轉再跑。

**4. 章節空檔（講稿有 `##` 章節標題時）**

```
（不用指令：照抄 ng-scan 印的「章節空檔表」；ng-snap 會往後找實際開口點，要保留的停頓也由它算）
```

完成判準：cuts.md 有章節空檔表，表頭 `| 章節 | 第一句 | 時間碼 |`；時間碼是 ng-scan 印的原值。
常見錯誤：時間碼寫成 rough.mp4 的秒數 → 一律寫 `work/main.mp4` 的秒數；自己用詞級時間推開口點 → 不用，照抄；印「找不到 → 聽 main.mp4 補」→ 那一章在 `work/ng-scan.md` 找前後行的時間，寫進「需要你決定」。

**5. 寫 `work/cuts.md`，先預跑一次 ng-snap，開剪輯清單頁，然後停點 ①**（表格範本在 `references/ng-rules.md`）

```
node shared/template/tools/media.mjs ng-snap --project projects/<專案>
node shared/template/tools/editor.mjs --project projects/<專案>
```

完成判準：cuts.md 存在、NG 表表頭逐字 `| 剪 | 時間碼 | 內容 | 原因 | 待確認 |`、每列「剪」是 `[x]`；editor.mjs 印出「剪輯清單：<網址>」，停點那一行的網址照抄它；ng-snap 印的 ⚠「原始停頓只有 Ns」抄進 cuts.md 最後的「需要你決定」；「需要你決定」一項都沒有才寫一行「無」，有項目就不寫「無」。
常見錯誤：ng-snap 表格內容欄寫「終點落在後一次開口（m:ss.ss）之前的停頓末端，後一次完整保留」→ 是安全的，不用標待確認；`✖ work/cuts.md 裡找不到 NG 表` → 表頭照抄範本；`✖ … 時間碼「…」看不懂` → 寫成 `1:03.00–1:05.80`；editor.mjs 印 `✖ 剪輯沒有啟動成功` → 照退路表，停點那一行的網址改寫 `work/cuts.md`。

**6. ① 通過後：NG 對齊停頓、預演、輸出初剪**（先重新讀 cuts.md：使用者在剪輯清單頁取消的列「剪」是 `[ ]`，ng-snap 不剪）

```
node shared/template/tools/media.mjs ng-snap --project projects/<專案>
```

照它印的三行 auto-editor 指令依序執行，不要自己算 NG 起訖、不要自己拼指令：第 1 行 `--preview` 看會剪多少 → 第 2 行輸出 `work/rough.mp4` → 第 3 行 `--export v1` 存 `work/cuts.v1.json`。三行都帶 `--margin 0.15sec`。

```
ffprobe -v error -show_entries format=duration -of csv=p=0 projects/<專案>/work/rough.mp4
node shared/template/tools/media.mjs verify-rough --project projects/<專案>
```

三行跑完先跑 verify-rough：它拿 rough.mp4 的黑畫面對照原片同一秒，原片不黑、rough 黑＝初剪壞了（之後子母畫面會沒有講者小視窗）。回報附上它印的那一行（✓ 或黑畫面表）。
完成判準：ffprobe 的長度和 auto-editor 統計的輸出長度一致；`work/cuts.v1.json` 存在；verify-rough 印 `✓ work/rough.mp4 沒有黑畫面`，或 `✓ 黑畫面 N 段，原片同位置也是黑的（只有聲音的素材配的純黑）：…`。
常見錯誤：把 ng-snap 印的指令存進變數或拼成字串再執行 → 引號會變成參數的一部分而失敗，整行照抄貼上執行（第 2 行要跑好幾分鐘就背景執行）；印 `✖ work/rough.mp4 有 N 段黑畫面（共 Ns）原片同位置不黑 → 初剪壞了…` → 照它印的 1–4 行重做（剪輯清單不用改），不要自己改 ffmpeg 或 auto-editor 參數；重做後 rough.mp4 長度和原本差超過 0.2 秒 → 第 7 步字幕重轉、重跑 srt-align；講話尾音被切 → ng-snap 加 `--edit "audio:-26dB"`（還切到就 `-30dB`）重跑再預演；小聲自言自語沒剪掉 → `--edit "audio:-16dB"`（AGENTS.md「剪乾淨的數字」）。

**7. 字幕：轉詞級逐字稿 → 照講稿排成完整語句**

```
npx hyperframes transcribe projects/<專案>/work/rough.mp4 -d projects/<專案>/work --model small --language zh --json --to srt -o projects/<專案>/work/rough.srt
node shared/template/tools/media.mjs srt-align --project projects/<專案> --dry-run
node shared/template/tools/media.mjs srt-align --project projects/<專案>
```

第 1 行同時寫 `work/transcript.json`（詞級逐字稿，蓋掉步驟 2 那份 main.mp4 的）與 whisper 的 rough.srt。第 2 行只印斷句表：有 `講稿.md` 時每則＝講稿一行、時間由 transcript.json 全域對齊；沒有講稿時把 rough.srt 切成完整子句；超過 18 字（直式 10 字，srt-align 照版式自動用，不用自己加參數）才拆、短句自動併；顯示時去掉「，」「。」「；」「：」、保留「、」「！」「？」（AGENTS.md 規則 4、style.md「字幕」）。表看過合理才跑第 3 行寫回（自動備份 `work/rough.srt.align-<時間戳>`）。之後照規則 4 只改錯字（講稿本身的錯字、沒講稿時 whisper 的錯字）；不要自己按字數切、併句、對時間，不要再跑 srt-split（舊流程），不要把「，。」加回字幕。合併規則與連接詞清單在 AGENTS.md「剪乾淨的數字」，看斷句表時對照。它印的 ⚠ 照 → 做，原文列進回報：`⚠ N 行講稿在逐字稿裡對不上，時間用前後句內插：…`、`⚠ N 則不到 0.6 秒…` 這類要到剪輯台處理的，先列在回報讓使用者知道；印 `⚠ 沒有 work/transcript.json：時間是整則按字數比例估的 → 寫回後要跑 node shared/template/tools/media.mjs snap-srt --project …` 才照 → 跑 snap-srt（先 `--dry-run`，只跑一次）。使用者之後在剪輯台改過的字和時間，不要再用工具覆蓋（AGENTS.md「剪輯台」）。

完成判準：`work/rough.srt.align-<時間戳>` 存在（srt-align 寫回過）；`work/rough.srt` 每則是一個完整語句（有講稿＝講稿一行）、最多 18 字（直式 10 字）、沒有「，」「。」「；」「：」、繁體、中英之間半形空格；`work/transcript.json` 是這次 rough.mp4 的詞級逐字稿（剪好看的 `#N@詞` 用它，不要刪）。
常見錯誤：印 `✖ work/hyperframes/plan.json 已經用到句號（#N），重新斷句後句號會全部位移 → 加 --remap-plan 再跑一次…` → 照 → 第 2、3 行加 `--remap-plan`（plan.json 與情境動畫的 `P.at` 會照時間換句號並先備份；storyboard.md 的句號會過期，以 plan.json 為準）；字幕斷在詞中間、連接詞吊在句尾 → 是講稿那一行本來就這樣斷，照講稿，不要手改 rough.srt。

**8. 剪接點**

```
node shared/template/tools/media.mjs cutpoints --project projects/<專案>
```

完成判準：`work/cutpoints.json` 是合法 JSON，`kind` 只有 `ng`／`pause`；印的「差 N 格」是 0。
常見錯誤：`✖ 找不到 work/cuts.v1.json` → 照抄 ng-snap 印的第 3 行再跑；`⚠ … 差 N 格` → cuts.v1.json 不是同一組參數產生的，用第 2 行同樣的參數重跑第 3 行。

主軌有邊錄邊講的螢幕錄影（`work/main.json` 有 `"kind": "screen"`）時接著跑：

```
node shared/template/tools/media.mjs screen-sync --project projects/<專案>
```

完成判準：寫了 `work/screen-sync.json`，印的 sync 段蓋住 verify-rough 印的那幾段黑畫面。`--write-plan` 等剪好看寫完草稿 plan.json 再加（auto-edit-storyboard 步驟 6）。

## 停點

```
⏸ 停點 ① 剪輯清單｜請看：<剪輯清單網址>｜請回：勾好後說「可以」，或要改的列
```

剪輯清單頁（`/cuts`）每列可以試聽，勾＝剪、取消＝保留，勾了就存回 cuts.md 的「剪」欄；cuts.md 改了頁面會自己更新。

| 使用者回 | 做什麼 |
|---|---|
| 「可以」「清單沒問題，繼續」 | 停點紀錄加「通過」→ 步驟 6（以 cuts.md 的「剪」欄為準） |
| 「第 3 列不要剪」這類指名修改 | 把那一列的「剪」改成 `[ ]`（要剪改 `[x]`；改時間碼就改那一格）→ 重貼停點 ①（紀錄寫「修改後重停」） |
| 改主軌順序（「聲音檔放最前面」） | 步驟 1 加 `--order "檔名1,檔名2"` 重接 → 步驟 2–5 重做 → 重貼停點 ①（紀錄寫「修改後重停」） |
| 有補錄要插進旁白中間（「录音3 取代中間音檔裡那一小段」） | 檔名後加 `@起-迄` 只取一段，同一支可切成前後兩段：`--order "a.mp4,旁白.mp3@0-577.7,補錄.aac@2.1-32.4,旁白.mp3@603.4-,b.mp4"`（起訖照逐字稿找那幾句的位置）→ 步驟 2–5 重做 |
| 「改好了」 | 重新讀 cuts.md，以檔案為準 → 步驟 6 |

## 自我核對

- [ ] cuts.md 每列都有原因、「剪」是 `[x]`，拿不準的寫在「待確認」
- [ ] 多支主軌的順序在停點 ① 問過
- [ ] rough.mp4 長度＝auto-editor 統計；verify-rough 印 ✓
- [ ] rough.srt 是 srt-align 產生的：每則一個完整語句、最多 18 字（直式 10 字）、沒有「，」「。」、繁體、中英之間半形空格
- [ ] cutpoints.json 合法、`kind` 只有 ng／pause
- [ ] 沒做波形比對、VAD、拆段重新轉錄（AGENTS.md「剪乾淨時不要做的事」）

## 退路表

| 症狀（工具原文） | 做法 | 第二次還失敗 |
|---|---|---|
| `auto-editor: error: unrecognized arguments`、`Unknown option` | 跑 `auto-editor --help`，照實際參數名改（例 `--cut-out`） | 停下來回報：指令、錯誤原文、已經試過什麼 |
| `Could not open input file` | 多個範圍寫在同一個旗標 → 每段各寫一次 `--cut-out "17sec,25sec"` | 停下來回報 |
| `whisper-cli crashed (SIGABRT)` | 最前面加 `GGML_METAL_BF16_DISABLE=1` | 停下來回報 |
| `✖ work/rough.mp4 有 N 段黑畫面（共 Ns）原片同位置不黑 → 初剪壞了…`（verify-rough）、`✖ work/rough.mp4 在 … 是全黑，但素材沒有純聲音檔 → 初剪壞了：跑 … verify-rough …`（build `--check`） | 照 verify-rough 印的 1–4 行重做：`media.mjs main` → `ng-snap` 印的三行 → `verify-rough` → `cutpoints` | 停下來回報：verify-rough 原文、已經試過什麼；不要往剪好看走 |
| `找不到 work/cuts.v1.json → 先跑 ng-snap 印的第 3 行…`（verify-rough） | 照 → 跑 ng-snap 印的第 3 行，再跑 verify-rough | 停下來回報 |
| `✖ 沒有 work/transcript.json，也沒有 work/rough.srt → 先轉逐字稿：…`、`✖ work/transcript.json 比 work/rough.mp4 舊…` | 照 → 跑它附的轉錄指令（步驟 7 第 1 行），再從第 2 行開始 | 停下來回報：指令、錯誤原文、已經試過什麼 |
| `⚠ 沒有 work/transcript.json：時間是整則按字數比例估的 → 寫回後要跑 … snap-srt …` | 照 → 跑 `node shared/template/tools/media.mjs snap-srt --project projects/<專案> --dry-run`，表合理再去掉 `--dry-run`（只跑一次） | 回報寫「字幕時間是 snap-srt 對的」 |
| `✖ 剪輯沒有啟動成功`（editor.mjs） | 讀它印的 log 最後幾行；停點那一行的網址改寫 `work/cuts.md`，請使用者直接改「剪」欄 | 照樣停點 ①，回報附 log 原文 |
| 工具呼叫 12 次還沒寫出 cuts.md | 停下來回報進度與卡住的點 | — |

## 工具呼叫預算

到停點 ① 最多 12 次；① 之後到回報最多 24 次（AGENTS.md「階段預算」）。超過就停下來回報卡在哪。

## 回報格式

停點 ① 用 AGENTS.md「停點總表」的骨架（≤ 15 行，最後一行是上面那一行）。剪完（不在停點上）：

```
初剪完成：原始 <長度>s → 初剪 <長度>s，剪掉 <N> 段（auto-editor 統計原文）
srt-align：<貼它最後一行統計「共 N 則（併 N 次、拆出 N 則）；平均 N 字…」>；⚠：<原文或「無」>
剪接點 <N> 個：ng <N>、pause <N>（cutpoints 印的表在 work/cutpoints.json）
驗證：ffprobe work/rough.mp4 → <長度>s、<寬>×<高>；verify-rough → ✓
→ 下一個停點：② 構圖（說「剪好看」開始）
```

## 什麼時候讀 references/

- `references/ng-rules.md`：步驟 3 拿不準是不是 NG 時、步驟 5 寫 cuts.md 表格時才讀。
