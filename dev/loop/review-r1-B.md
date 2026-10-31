# 審查 r1-B：003 motion-audit＋004 media-annotations-qc（只讀審查員 B，2026-10-31）

證據都在 `/private/tmp/claude-501/-Users-lindingyuan-Downloads-workspace-auto-edit-workspace/6d54b3e1-59e6-4062-be1d-9ed5f77ee092/scratchpad/rB/`（下稱 `rB/`）：
- `proj`：`node dev/check-all.mjs --keep --skip-tests` 的合成專案（全部 ✓）。
- `proj9`：9 支 custom 原檔不改，字幕照各自 `data-cues-sample` 擺（`scripts/mk9.mjs`），`"look": {"slim": 0}`。
- `projbad`：故意違規的 `x-bad.html`；`projm`：m01 加 callouts／spot／steps／arrows／marks.path；`projm2`：故意放不下的標註。

## 問題

| 編號 | 等級 | 位置 | 問題 | 證據 | 修法 |
|---|---|---|---|---|---|
| B-01 | P1 | `tools/qc.mjs` storyboard 截圖時刻（cli-004 §2.2） | 03 側邊欄的最後一組／完成態用 `out.end − 0.6`，但 03 的內容在段尾前約 1.0 s 就開始淡出，截到的是空面板（標題與三條都不見）。停點 ③ 的使用者會以為這段沒內容 | `rB/projm`：s03 21–31 s → `work/storyboard-preview/s03-3.png`（0:30.4）只剩空面板；`rB/snap-s03/at-29.9s.png` 三條都在、`at-30.1s.png` 已淡出 | 截圖時刻取 `min(out.end − 0.6, 退場起點 − 0.1)`：照 audit.mjs 的做法往前每 0.3 s 找靜止畫面，或請 002 在 `items[].out` 加退場起點；`qc.test` 補一個 side-panel 案例 |
| B-02 | P1 | `custom/x-ui-mock.html` 完成態 | 以 (1032, 76) 推近 1.4 倍後，按鈕 886–1178、漣漪框 875–1189 超出 1176 寬的視區，主角按鈕右緣和框被切掉；通知（top 392）上方露出「解析度」字頂約 8 px；第三列被視區底切掉，只剩字的碎片。畫布標了 `data-layout-allow-overflow`，所以 audit 抓不到，要看 R7.6 第 3 步的截圖 | `rB/snap-ord/at-224.8s.png`、`rB/uimock-btn.png`、`rB/uimock-crop.png` | 按鈕中心 x 要 ≤ 1176 − 1.4×(104＋8) − 8 ≈ 1011（例：left 900），或改推近 1.3；通知上移到能完全蓋住第二列（約 top 360）；第三列在 ZOOM 結束前淡出，或縮小倍率讓它整列都看得到。檔頭「按鈕位置」那一步把這個上限寫進去 |
| B-03 | P2 | `lib/audit-page.mjs` tops[].parent | 「未定位頂層」的父層印成 `<元素>`（runtime 掛上後拿掉了 root 的 id／class），弱模型不知道是哪一層 | `rB/projbad` audit：`未定位頂層：#xbad-loose 直接放在 <元素> 底下` | 父層用 host 的 `data-composition-id` 或 `.fill` 印成「root（x-bad）」 |
| B-04 | P2 | `lib/audit-rules.mjs` cueFindings；cues.md §4.4 | `@詞` 與「找不到 window.__cues」這兩種原因的原文本身就帶 `→ …`，audit 又接一個 `→ fix`，一行出現兩個不同的修法 | 程式路徑：WHY_NO_WORD／WHY_NO_SEG（scene-motion.js:200-201）＋ formatFinding | 組 msg 前先去掉原因裡 ` → ` 之後的字（`why.split(' → ')[0]`），或從 cues.md §4.4 的原因拿掉 → |
| B-05 | P2 | `tools/audit.mjs` `--json` segments[].motion | 和 cli-003 §5 不一致：`units` 是 `{t, el}` 陣列（契約寫數量），`busy` 是成片秒（契約寫段內秒），`marks[].t` 卻是段內秒，同一個物件混用兩套時間 | `rB/audit9.json`：x01 `busy` [[32,35.2],…]、`marks` t 3.2 | 照契約改，或改 cli-003 §5 並逐欄寫明時間基準 |
| B-06 | P2 | `qc.mjs`、`brand.mjs` 錯誤訊息；cli-004 §3.4、§5.4、§6.1 | 這幾則 ✖ 沒有「→ 改法」，違反 cli-004 §1 與憲法 III-4（契約表的原文本身也漏寫）：`--from／--to` 範圍、`--html` 找不到、`--kind` 不對、沒給色碼、未知指令 | 實跑原文：`✖ --from／--to 要是成片秒數，而且 0 ≤ from < to ≤ 30（現在 from=20、to=10）`、`✖ --kind 只能是 fs…，現在是「xx」` | 契約與程式一起補，例：`→ 改成 0–30 之間、from < to 的成片秒數`、`→ 改成 fs、side 或 ch` |
| B-07 | P2 | `qc.mjs` 的 `rel()`（storyboard／observe／framing） | 工作區外的路徑印成 `../../../../../private/tmp/…`，cli-004 §1 規定要印絕對路徑；observe 用 `rel(dir) + '/' + 檔名` 組路徑，Windows 會混出 `\` 和 `/` | `rB/projm` 的 storyboard／observe 輸出的「專案：」「→」「✔ 存好了」那幾行 | 相對路徑以 `..` 開頭時改印絕對路徑；組路徑一律用 `path.join` |
| B-08 | P2 | `qc.mjs observe --file --offset`（測試片段） | `build --test 50,20` 不含 50 s 前就開始的 x01，但總表 0:50–0:55 的格子仍標 `x01`，畫面卻是講者原片，會誤導「畫面和段落對不上」的判讀 | `rB/projm/work/觀影/sheet-01.jpg` 第 1–2 列 | 有 `--offset` 時，起點早於 offset 的段標「（測試片段不含）」或印 ⚠，或讀 test-clip 實際包含的段 |
| B-09 | P2 | 004 SC-002；`dev/tests/brand.test.mjs` | 既有案例「pip-frame.png：用原本的黃色重畫…」被改寫（#FFD400／1344 → brand.css 主色／PIP 1424），不符合 SC-002「一行都不改」的字面要求。推定 HEAD 時這個案例就已經失敗（HEAD 的 brand.css 已是 #F6630F、PIP_ZONE 已是 1424），改寫有理由。media.test 搬走的 CLI 案例照裁決移到 media-cli，qc.test 只改了 import | `git diff dev/tests/brand.test.mjs` | 在 round-1.md 記成已知例外，或修改 SC-002 的文字 |
| B-10 | P2 | `qc.mjs framing` 建議欄（cli-004 §4） | 偵測到黑邊時表格最小的一列是 1.13x，全部被排除後退回的「建議：1.00x」卻不在表上（選了會露出黑邊）；文字也和契約不同（「都會切到手勢或放大超過 3.5 倍」vs「都標了切到手勢」） | `rB/projm3` framing 輸出 | 全部被排除時改建議表上最小的那一列；文字和契約擇一對齊 |
| B-11 | P2 | 跨線（請 002）`build.mjs --check` | (a) `P.at('#99')` 的 ✖ 沒有 → 改法（cli-002 §1.4 原文就沒有）；(b) 靜態掃描把 `P.at('#9' + '9')` 的前半段當成 `P.at('#9')`，報了「段外」⚠，實際執行的卻是 #99；(c) x03–x09 是 9 支不同的 custom，仍報「連續三段都是同一個情境」⚠，和 style.md「情境動畫越多越好」衝突 | `rB/projbad`、`rB/proj9` 的 `--check` 輸出 | (a) 補 `→ 改成這段範圍內的句號`；(b) 只認完整的字面值 `P.at('…'[, 數字])`，其他寫法報「ref 要寫成字串字面值」；(c) custom 段改用 src 判斷是不是同一個情境 |

P0：0 個。

## 實跑結果（摘要）

- **9 支 custom**（`rB/proj9`）：`--check` 0 ✖；`audit.mjs` 和 `audit.mjs --all --json` 都是 0 ✖ 0 ⚠（ok: true），9 段共 2.65 s。亂序 snapshot：27 個時刻（每支取完成態、開頭 +0.5、中點），依序截一次、整串反轉打亂再截一次，ffmpeg rawvideo md5 比對 0 張不同；完成態都有內容（`rB/done9.jpg`）。
- **故意違規**（`rB/projbad`）：stagger 0.05 → ⚠ 間隔太短 ×3；同一秒冒出 4 個 → ⚠ 同一秒新元素太多；標題壓到內容 → ✖（重疊 30px，建議往下移 ≥ 70px）；未定位頂層 → ✖。每則都帶 →（父層名稱問題見 B-03）。`P.at('#99')` 寫成字面值時 `--check` ✖；改成動態組字串繞過 `--check` 之後，runtime 有推進 `__cueErrors`，audit 報「✖ 綁句失敗：…字幕沒有第 99 句（window.__cues 有 20 句）→ …」。
- **media 標註**（`rB/projm`）：五種標註各放一個，`--check` 0 ✖，摘要印「紅框 1（跟捲動 2 次）、標註 1、聚光燈 1、STEP 2（第 1–2 步）、箭頭 1」。snapshot 在 at +0.2、+0.5、+0.95 依序看到紅框 → 引線 → 卡片；path 兩步的框 (900,384)、(1031,514) 和契約 §1.1 算出來的一致；箭尖離目標 9.04 px；STEP 膠囊在左上 (48,40)。故意寫 `side: "right"` 壓到子母畫面 → ✖ C7「改 "side": "bottom"」；C2、T5、R5 也都有報。
- **storyboard**：14 張，檔名＝id；s03 三條各一張，s04 一起出現的併成一張；m01 七張（相距 < 0.3 s 的已合併），`.storyboard-shots` 跑完有刪掉；plan.json 改過沒 build 時 ✖。
- **observe**：測試片段 20 s → 1 張總表（1920×1608）、2 條接縫（1920×366）；合成的 30 s 片（中間 11 s 靜止）→ 2 張，靜止區間 10.0–21.0 一秒不差；沒寫 `--offset` 有 ⚠。
- **brand bg**：fs、ch 1920×1080，side 960×1080，preview 1600×720；有裝飾的留空區 ⚠ 0.58%／0.51%，乾淨的 ✔；`shared/template/bg-*.jpg` 的 mtime 沒變。
- **跨平台**：003／004 的 `spawnSync('npx'` 都帶 `shell: WIN`；`~` 只出現在註解與訊息文字；沒有 shell 的 rm／cp，刪檔都用 `fs.rmSync`。
- **--help**：audit 和 cli-003 §1 一致（只差結尾一個空行）；brand 和 §6.2 逐字相同；qc 包含 §6.1 的每一行。
- **範例檔頭**：9 支都有 6 個小節（適用的口播、不要用在哪裡、要改的地方、綁句欄位、D 下限、版面），字數上限和 R7.5 表一致；gallery 的 9 個 `preview/x-*.html` 都有產生。

## SC 逐項打勾

### 003 motion-audit
| SC | 結果 | 證據 |
|---|---|---|
| SC-001 | ✓ | motion／audit／examples／icons 四支測試 158/158 通過、0 skip（`rB/t003.tap`） |
| SC-002 | ✓ | `rB/proj9`：`--check` 0 ✖；audit 0 ✖、新規則 0 ⚠ |
| SC-003 | ✓ | 指定的 grep 沒有輸出 |
| SC-004 | ✓ | `dev/loop/003-before.md`：x-process 有 density、padding；x-before-after 有 density、stagger、vbalance、padding；x-numbers 有 vbalance |
| SC-005 | ✓ | 27 張逐像素相同（附帶的畫面問題見 B-02） |
| SC-006 | ✓ | 9 段共 2.65 s（約 0.3 s／段） |
| SC-007 | 未驗 | round-1.md 的弱模型試跑還在進行，只跑到停點 ① |

### 004 media-annotations-qc
| SC | 結果 | 證據 |
|---|---|---|
| SC-001 | 部分 ✓ | 有 Chrome：40/40 通過、0 skip（`rB/t004.tap`）；沒有 Chrome 的情況沒驗（要改名 ~/.cache，超出只讀權限） |
| SC-002 | ✗（字面） | B-09 |
| SC-003 | ✓（有 B-01） | 見「實跑結果」的 media 標註與 storyboard 兩項 |
| SC-004 | 部分 ✓ | 張數＝⌈長度 ÷ 24⌉、靜止區間 ±0 s；10 分鐘成片 ≤ 3 分鐘沒驗（沒有 10 分鐘的成片；20 s 片段 1.85 s） |
| SC-005 | ✓ | 三種 kind 的尺寸、preview 1600×720、留空區 ⚠／✔ 都對 |
| SC-006 | 未驗 | 弱模型試跑還沒做 |
