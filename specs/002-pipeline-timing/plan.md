# 實作計畫：002 pipeline-timing

**Branch**: `002-pipeline-timing` | **Date**: 2026-10-31 | **Spec**: `specs/002-pipeline-timing/spec.md`

**契約**：`specs/contracts/check-json.md`、`cues.md`、`plan-fields.md`、`cli-002.md`（本線）；`sfx.md`、`cli-005.md`（005）；`look.md`、`cli-006.md`（006）；`media.md`、`cli-004.md`（004）；`stop-points.md`（001）。

## Summary

把「秒數由工具算」推到剪乾淨（ng-snap／cutpoints／srt-split）與情境動畫（cue 注入），把 01 分析報告的版面接法（章節不壓口播、PiP 飛入與三層淡出、旁白段擦入）做進 `plan.mjs`／`main.mjs`，把連續覆蓋變成預設檢查，並把 005 音效、006 look、004 media 的介面接進 build。另外新增兩支只讀工具（`status.mjs`、`caps.mjs`）與根目錄 `package.json` 釘住 HyperFrames 0.8.221。

## Technical Context

| 項目 | 值 | 出處 |
|---|---|---|
| 語言／執行環境 | Node.js ≥ 22，ES modules，零 npm 依賴（只有 devDependency `hyperframes`） | 憲法 II；`USAGE-reference.md` R13 |
| 外部工具 | ffmpeg／ffprobe 8.1、auto-editor 29.3.1、HyperFrames 0.8.221（2026-10-31 實測） | 本線探測 |
| 測試 | `node --test dev/tests/*.test.mjs`（現行做法），外部工具用固定 JSON／合成測試片代替 | `dev/tests/` |
| 平台 | macOS、Windows（PowerShell 引號規則，AGENTS.md:153） | AGENTS.md |
| 效能 | `--check` 只多一次 ffprobe（有 `outro` 時量配樂長度，約 50 ms）；status 不跑 ffmpeg；caps 只跑 `-version` | 憲法 II |

## Constitution Check

| 原則 | 本線怎麼符合 |
|---|---|
| I 工具算數 | ng-snap、cutpoints、srt-split、cue 注入、PiP 起始框、擦入的 pre-roll／post-roll 全部由程式算；文件不再教 AI 相減 |
| II 零依賴跨平台 | 只用 Node 內建模組＋既有 ffmpeg／auto-editor；指令輸出對 PowerShell 加引號 |
| III 弱模型優先訊息 | 每則 ⚠／✖ 帶 `→ 改法`，原文在 `cli-002.md`；指令印出可直接複製的下一步 |
| IV 單一真相 | 時間文法只在 `time.mjs`（cue refs 由 build 用同一套算）；音效數字從 005 的 `SFX_RULES` import；look 由 006 函式判斷；`MEDIA_FIELDS` 從 004 import |
| V 六個停點 | 不新增停點；status.mjs 只讀 001 的停點紀錄 |
| VI 可驗證交付 | 每條 FR 有測試；PiP／擦入／cue 有 snapshot 整合驗證（007） |
| VII 範圍紀律 | 不改別線的檔；要別人改的列在 spec「請 00N 加」 |
| VIII 不加沒人要的設定 | 只新增 `rhythm`、`outro`（派工點名）；PiP、擦入、章節墊底都沒有開關 |

## 檔案（全部是 002 擁有，`specs/README.md` 所有權表）

| 檔案 | 改什麼 | 變更點 |
|---|---|---|
| `package.json`（新） | 釘 hyperframes 0.8.221 | P-11 |
| `shared/template/tools/build.mjs` | 版本行、cue 注入呼叫、look、outro、check-json schema 2、planHash、`MEDIA_FIELDS` import | P-09、P-11–P-16 |
| `shared/template/tools/media.mjs` | `ng-snap`、`cutpoints`、`srt-split`、cuts.md 解析 | P-01–P-04 |
| `shared/template/tools/status.mjs`（新） | 進度判斷 | P-10 |
| `shared/template/tools/caps.mjs`（新） | 能力探測、`hyperframesVersion` | P-11 |
| `shared/template/tools/lib/plan.mjs` | 章節、uncovered、rhythm、PiP 片段 enter／exit、擦入、cue refs、音效政策、outro、look、validateMedia、jsonItems | P-05–P-09、P-12–P-16 |
| `shared/template/tools/lib/main.mjs` | PiP tween、擦入 clip-path、`window.__cues`、outro `<audio>` | P-05、P-06、P-09、P-12 |
| `shared/template/tools/lib/assemble.mjs` | `scanCueRefs(html)` | P-09 |
| `shared/template/tools/lib/captions.mjs` | `blackout` 參數 | P-07 |
| `shared/template/tools/lib/srt.mjs` | `formatSrt` | P-04 |
| `shared/template/scenes/01-chapter/scene.json`、`14-speaker`、`15-quote` | 預設音效（等 005 的 wav） | P-13 |
| `dev/tests/{plan,build,timing,project}.test.mjs` | 新案例 | 各 P |
| `dev/tests/{media-cli,status,caps}.test.mjs`（新） | 新指令 | P-01–P-04、P-10、P-11 |

不改：`lib/time.mjs`（只 import）、`lib/edit.mjs`（`pads` 這輪不接受）、`lib/scenes.mjs`、`lib/mustache.mjs`、`kit/*.css`。

---

## 變更點

### P-01 `work/cuts.md` 解析（`media.mjs` 匯出 `parseCutsMd(text)`）

- **資料流**：`fs.readFileSync(work/cuts.md)` → 逐行找 Markdown 表（連續的 `|…|` 行，第二行是分隔線）→ 用表頭分類：含「時間碼」與「原因」＝NG 表；含「章節」與「第一句」＝章節空檔表（「時間碼」欄必須在）→ 回傳 `{ ng: [{ row, start, end, text, pending }], chapters: [{ row, title, first, t }], errors, warnings }`。
- **時間碼**：`parseClock(s)` 接受 `m:ss.ss`、`h:mm:ss.ss`、`ss.ss`、`hh:mm:ss,mmm`；範圍分隔 `–`、`-`、`~`、`～`（先試 `–`、`~`、`～`，`-` 最後試，避免和負號混淆）。章節表的時間碼是範圍時取起點。
- **待確認**：欄位 trim 後不是空字串、`—`、`-`、`否` → `pending: true`。
- **邊界**：表格外的文字、程式碼區塊（```` ``` ```` 之間）裡的表格一律略過；同一份檔有兩張 NG 表時合併（列號依出現順序連號）；欄位內的 `\|` 跳脫照 Markdown 處理。
- **測試**：`media-cli.test.mjs`「cuts.md」。

### P-02 `media.mjs ng-snap`（`ngSnap(P, opts)`）

- **資料流**：
  1. 原片：`--src` → 否則 `work/main.json` 存在用 `work/main.mp4` → 否則 `素材/真人錄影/` 唯一一支（多支 → ✖）。
  2. 靜音段：`--v1 <檔>` 直接讀；否則 `spawnSync('auto-editor', [src, '--edit', edit, '--margin', margin, '--export', 'v1', '-o', <work/.cache/ng-snap.v1.json>, '--no-open'])`，`work/.cache/ng-snap.key.json` 存 `{ size, mtimeMs, edit, margin, aeVersion }`，相同就不重跑。fps 用 `probeMedia(src).fps`（v1 沒有 timebase，2026-10-31 實測格式）。`silences = chunks.filter(speed ≥ 99999).map(([a, b]) => [a / fps, b / fps])`。
  3. NG 吸附：每列 `[s, e]` → 起點：找 `|silence.a − s| ≤ 1.0` 裡最近的 `a`；終點：找 `|silence.b − e| ≤ 1.0` 裡最近的 `b`；找不到用原值＋⚠。吸附後 `s' ≥ e'` → 用原值＋⚠。
  4. 章節保留：每章 `T` → 在 `[T − 0.6, T + 1.5]` 內找最接近 `T` 的靜音段終點 `b`（同時要 `b ≥ T − 0.6`）；`pause = (b − a) + 2 × margin`；`pause ≥ 3.0` → `addIn = [max(0, b − (3.0 − 2 × margin)), b]`；否則 `addIn = [a, b]`＋⚠。
  5. 衝突：任一 `cutOut` 和 `addIn` 重疊 → `addIn.start = cutOut.end`；剩 < 0.5 s 拿掉＋⚠。
  6. 印出：調整表＋三行指令（`aeCommand({ src, edit, margin, cutOut, addIn, tail })`，`tail` 三種：`['--preview']`、`['-o', rough, '--no-open']`、`['--export', 'v1', '-o', cutsV1]`）。
- **秒數格式**：`fmtSec(x)`＝`r3(x)` 去掉多餘的 0，後面接 `sec`（`63sec`、`12.27sec`）。
- **`--margin` 解析**：接受 `<數字>sec`、`<數字>s`；其他 → ✖ `--margin 要寫成秒數加 sec，例如 0.15sec（auto-editor 的純數字是格數）`（加進 `cli-002.md` §2 的 ✖ 表）。
- **邊界**：auto-editor 找不到（ENOENT）→ ✖；Windows 的 auto-editor 是 `.exe`，`spawnSync` 不用 `shell`；原片路徑含空白 → 印出的指令加雙引號；NG 與 NG 重疊 → 合併成一段；沒有 NG 也沒有章節 → 只印三行指令。
- **為什麼不重用 snap-srt 的能量包絡**：見 spec「待裁決」第 7 條。
- **測試**：`media-cli.test.mjs`「ng-snap」（全部用 `--v1`）。

### P-03 `media.mjs cutpoints`（`cutpointsFromV1(v1, fps, ngRanges)`）

- **資料流**：讀 `work/cuts.v1.json`（或 `work/cuts.v1`）→ 驗格式（`version === "1"`、`chunks` 陣列）→ fps：`probeMedia(work/rough.mp4).fps` → 依序走 chunks：`speed === 1` 累加 `acc += (e − s) / fps`；`speed ≥ 99999` 標記「剪掉中」並記錄這一串剪掉的原片範圍（連續兩個剪掉 chunk 合成一串）；遇到下一個保留 chunk 且前面已經有保留段 → 推一個剪接點 `{ at: r3(acc), kind }`。`kind`：這一串剪掉的範圍和任一 NG（非 pending）重疊 ≥ `min(0.3, NG 長度 × 0.5)` → `ng`。
- **核對**：`|acc − probeDuration(rough.mp4)| > 2 / fps` → ⚠；speed 其他值 → ✖。
- **寫檔**：`work/cutpoints.json`（`{ "cuts": [...] }` + 換行，2 空格縮排）；舊檔存在而且內容不同 → 先 `copyFileSync` 成 `cutpoints.json.bak-<時間戳>`（同 snap-srt 的命名）。
- **邊界**：片頭或片尾的剪掉不產生剪接點（和 `edit.mjs:166` 的 `joinsOut` 規則一致）；0 個剪接點 → 寫 `{ "cuts": [] }`。
- **測試**：`media-cli.test.mjs`「cutpoints」（spec US6 情境 1 的固定 JSON；fps 用合成的 30fps 測試片）。

### P-04 `media.mjs srt-split`（`splitCues(cues, max)`；`srt.mjs` 新增 `formatSrt`）

- **資料流**：讀 `work/rough.srt`（記住 BOM 與換行 `\r\n`／`\n`）→ 擋：`work/hyperframes/plan.json` 存在而且內容符合 `/"#\d+/`（任何欄位裡有 `#N`）→ ✖ → `parseSrt` → 每則 `visibleLen(text) > max` 的拆開 → 重新連號 → `formatSrt(cues, { eol, bom })` → 備份 → 寫回。
- **切點**：候選＝每個字元邊界；分三級：標點後（`，。！？、；：,.!?;:` 後面）＞ 空白 ＞ 其他（兩側都不是 `[A-Za-z0-9]`）；在第一個有「左右都 ≤ max」候選的等級裡挑 `|左寬 − 右寬|` 最小的；沒有任何等級成立（例：40 字無標點）→ 在最接近中間的合法邊界切，兩半遞迴；用到第三級 → ⚠。
- **時間**：每一則的長度＝原長 × `textWidth(片段) / textWidth(原句)`（`time.mjs:48`）；第一則起點＝原起點，之後首尾相接，最後一則終點＝原終點（吸收捨入誤差）；r3。
- **文字**：切點兩側的空白 trim；標點留在前半；所有片段串起來（忽略切點空白）等於原文。
- **邊界**：`--max` 範圍 8–40；沒有要拆 → 不寫不備份；`parseSrt` 讀到 0 則 → ✖ 同 snap-srt。
- **測試**：`media-cli.test.mjs`「srt-split」。

### P-05 PiP 飛入與三層淡出（`plan.mjs` 片段判斷；`main.mjs` 產生 tween）

- **plan.mjs 資料流**：現行 `pipPieces`（`plan.mjs:395-401`）之後，新增 `pipMotion(timed, ctx)`，對每個片段標 `enter`、`exit`、`exitDur`（spec FR-022、FR-026）：
  - 「起點前一格講者滿版」＝`t = p.s − 1/30` 時：沒有任何 `opaque` 段的 `[start, end)` 包含 `t`（含墊底延長）、`t` 不在 `voiceOut`、沒有 `side` 段在 `[start, end)`、`editFx.punches` 沒有包含 `t`。
  - 接續判斷：所有段的片段收成一張表，`|q.e − p.s| ≤ 0.001` 而且 `q` 屬於別段 → `p.enter = 'none'`、`q.exit = 'none'`。
  - 片段起點來自 `splitAtJoins` 切開（`p.s` 是某個 `tm.joinsOut`）→ `enter = 'none'`；終點同理 `exit = 'none'`。
- **main.mjs 資料流**（`main.mjs:58-95` 那一段）：
  - `group`（幕的淡入）不再 `push(...pipIds)`；幕的淡出 tween 改成 `[#el-id, …exit === 'layer' 的片段 id]`。
  - `enter: fly`：`tl.fromTo('#pip-<id><sfx>', { x: X0, y: Y0, scale: K, transformOrigin: '0 0' }, { x: 0, y: 0, scale: 1, duration: 0.7, ease }, s)`，`X0 = crop.x − 1424`、`Y0 = crop.y − 594`、`K = crop.w / 432`（`pipGeometry` 的 `crop`）；`ease` 用主合成已有的 `SceneMotion.pushEase`（`main.mjs:222`）；外框 `tl.fromTo('#pipf-…', { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'sine.out' }, s + 0.7)`。
  - `enter: fade`：`#pip`、`#pipf` 一起 `opacity 0→1`、0.4 s、`sine.out`。
  - `exit: fade`：一起 `opacity 1→0`、`exitDur`（0.5 或 0.4）、`sine.in`、`immediateRender: false`，結束在片段終點。
- **起始框推導**：`.pip` 容器在 `(1424, 594)`、432×324、`overflow: hidden`；裡面 `<video>` 的 `left = −crop.x·s`、`top = −crop.y·s`、寬 `1920·s`（`s = 432 / crop.w`，`plan.mjs:67-68`）。容器加 `translate(X0, Y0) scale(K)`（原點左上）後，容器內 `(u, v)` 落在舞台 `(crop.x + K·u, crop.y + K·v)`，而 `(u, v)` 顯示的是底片的 `(crop.x + u/s, crop.y + v/s)`；`K = 1/s`，兩者相同 → 第一格和底下的講者逐像素重合（誤差＝`style` 的 `Math.round`，≤ K × 0.5 px ≈ 1.2 px @ K 2.4）。
- **邊界**：`plan.frame` 有值時底片已經裁切放大（`build.mjs:441-452`），`crop` 本來就是裁切後的座標，公式不變；`pipCrop` 手寫成非 4:3 時，容器仍是 4:3 窗，起始框對齊的是窗的左上與寬，下緣多或少的部分本來就看不到；圓角 6 px 飛入時被放大到 6K px，0.7 s 內縮回（可接受，不另外補間）；`--test` 片段裡 `s` 已平移，tween 時間用平移後的值。
- **退路（待裁決第 1 條）**：改成同時補間 `.pip` 的 `left／top／width／height` 與 `<video>` 的 `left／top／width／height`（數值線性內插起訖兩組 style）。
- **media 段**：`mediaParts`（004）收 `pipIds`（只放 `exit: layer` 的）與 `pipEnter: [{ id, enter }]`；本線的 tween 產生函式 `pipTweens(pieces, crop)` 從 main.mjs 匯出，004 在 `mediaParts` 呼叫或由 main.mjs 在 media 段外面補（兩者擇一，和 004 對齊；預設由 main.mjs 補，004 只要不再淡 pip）。
- **測試**：`plan.test.mjs`「子母畫面進場／出場」；`build.test.mjs`「PiP tween 字串」。

### P-06 旁白段擦入擦出（`plan.mjs` 接縫；`main.mjs` clip-path；`mediaParts` pre／post-roll）

- **plan.mjs 資料流**：在「接不透明幕」迴圈（`plan.mjs:357-369`）找到 `b` 之後，判斷 `seam = b.start`：`voiceOut` 有區間 `[va, vb]` 滿足 `va + 0.05 < seam < vb − 0.05`、`a.key !== 'chapter' && b.key !== 'chapter'`、而且 `(a.type === 'media') !== (b.type === 'media')`：
  - `a` 是 media → `b.wipeIn = true`、`a.postroll = rollFor(a, 'post')`；
  - `b` 是 media → `a.wipeOut = true`、`b.preroll = rollFor(b, 'pre')`、`a.end = seam`（擦出要在接縫前完成：擦出 tween 在 `a.end − 0.45` 開始）。
  - `rollFor`：圖片 0.5；影片 post：`min(0.5, (素材長 − m.in − 段長 × speed) / speed)`；影片 pre：`min(0.5, m.in / speed)`；結果 < 0.45 → 取消擦入／擦出（`wipe* = false`、roll = 0）＋報告 note（`cli-002.md` §1.5）。
- **main.mjs**：`wipeIn` → host `#el-<id>` 的 `z-index` 改 31、`tl.fromTo('#el-<id>', { clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.45, ease: 'sine.out' }, s)`；`wipeOut` → z 31、`tl.fromTo(…, { clipPath: 'inset(0% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 100%)', duration: 0.45, ease: 'sine.in', immediateRender: false }, e − 0.45)`；這兩種段的幕淡入淡出照現行的接縫規則（不淡）。
- **VOICE_WARN**：`plan.mjs:34` 改 0.1；報告行在 `plan.mjs:644` 改成依長度前綴 ⚠／✖（`cli-002.md` §1.5）。
- **邊界**：擦入段本身是 custom fullscreen（root 有 `.fill` 底）—— clip-path 套在 host，子合成整張一起被裁，OK；擦入段有子母畫面 → 子母畫面在 z 40，不受 clip-path 影響，照 P-05 判斷（前一格是 media＝不透明 → `fade`）；`pre／postroll` 不參與 `plan.mjs:478-496` 的重疊檢查。
- **測試**：`plan.test.mjs`「擦入擦出」；`build.test.mjs`「clip-path tween」。

### P-07 章節（`plan.mjs` 位置、墊底、字幕；`captions.mjs` blackout）

- **位置**（`plan.mjs:276-291`）：`gap ≥ 2.8` → `start = prev.end + (gap − 2.5) / 2`、note「前後各留」；`2.0 ≤ gap < 2.8` → 現行；`< 2.0` → 現行位置＋`it.warnings.push(…)`（原文 `cli-002.md` §1.2，專案路徑用 `projectRel`，`resolvePlan` 已有這個參數）。`it.chapter = { cue, title, gap, placement }` 給 `chapters[]`。
- **墊底**（在現行「接不透明幕」迴圈之前加一個章節專用迴圈）：
  - 前一段 `a`（不透明、非 media）`0 ≤ ch.start − a.end ≤ 1.0` → `a.end = ch.start + 0.5`、`a.fadeOut = false`、`a.holdFor = ch.id`；`ch.fadeIn = true`（照常淡入）。`a` 的子母畫面最後一個片段 `exit = 'fade'`、`exitDur = 0.5`、終點＝`a.end`。
  - 前一段是 media → `a.postroll = rollFor(a, 'post')`（P-06 的函式）、不改 `a.end`；roll < 0.45 → note「錄影只剩…硬切」。
  - 前一段透明 → 現行 `coveredBy` 迴圈的 `x.start <= a.end + 0.1` 對章節改成 `+ 1.0`。
  - 後一段 `b`（不透明）`0 ≤ b.start − ch.end ≤ 1.0` → `ch.end = b.start + 0.5`、`ch.fadeOut = false`、`b.fadeIn = true`。
  - 這些延長在「整張幕重疊」檢查（`plan.mjs:478-496`）用 `holdFor` 放行（容許 `FADE`）。
- **字幕**：`resolvePlan` 收集 `blackout = chapters.map((c) => [c.start, c.start + 2.5])`（成片秒數）；`build.mjs:497` 改 `buildCaptions(capCues, { duration: outDur, blackout })`；`captions.mjs` 每則字幕的 `[a, b]` 扣掉 blackout（`subtract`，`edit.mjs` 已有），剩下 < 0.05 s 的片段不顯示（沿用 `captions.mjs:45`）；被裁到的句號回傳給 plan 寫 note。
- **邊界**：章節在第一句（`gap`＝第一句起點）且 < 2.8 → 現行；同時有兩個章節相鄰（不太可能）→ 各自判斷；章節壓到的那句字幕被整個吃掉（句長 < 2.5）→ 那句不顯示，note 列出。
- **測試**：`plan.test.mjs`「章節：置中／貼齊／壓人聲 ⚠／字幕清空／墊底四種」。

### P-08 沒有畫面的區間與 rhythm（`plan.mjs`）

- **資料流**：在「露臉」檢查（`plan.mjs:514-519`）的位置：
  1. `span = [第一個 end > start 的句子起點, 最後一句結尾]`（`cuesOut`）。
  2. `covered = timed.filter((x) => x.key !== 'chapter-tag').map((x) => [x.start, x.end])`（`end` 是延長後的值）。
  3. `holes = subtract([span], [...covered, ...voiceOut])`（`edit.mjs` 的 `subtract`）→ `len > 1.0` 的進 `res.uncovered`。
  4. 閃一下：`shown`（現行就有）依起點排序，相鄰 `gap ∈ (0.05, 1.0]` 而且前一段不是章節 → ⚠（`→` 的 `to` 寫法照 `cli-002.md` §1.3 的規則，用後一段 `seg.from` 原文）。
  5. `rhythm = plan.rhythm ?? 'continuous'`：`spaced` 時跑現行兩條（`:516-519`、`:533-534`）、不跑第 4 步與彙總 ⚠；`continuous` 反之。
- **報告**：`formatReport` 在「影片長度」那一行之後 push 兩行（節奏、沒有畫面的區間）；有 cuts 時區間後面加 rough 秒數。
- **邊界**：`span` 不存在（0 句）→ `uncovered = []`；百分比的分母＝`span` 長度。
- **測試**：`plan.test.mjs`「沒有畫面的區間」「rhythm」。

### P-09 cue 注入（`assemble.mjs` 掃描；`plan.mjs` 計算與檢查；`main.mjs` 輸出）

- **assemble.mjs**：新增 `scanCueRefs(html) → string[]`：取 `<template>…</template>` 內所有 `<script>…</script>`，去掉 `/*…*/` 與 `(^|\s)//.*$`，用 `/\bP\.at\(\s*(['"])(#[^'"\n]+)\1/g` 收集、去重、保留順序。`readCustom` 回傳物件加 `refs`。
- **plan.mjs**：custom 段 `readCustom` 之後：`it.cueRefs = {}`；每個 ref → `parseTime` → 不是 `cue` → ✖；`cueSeconds(t, cuesOut)` → error ✖（原文帶檔名）／成功存 `it.cueRefs[ref] = sec`，段外 ⚠。同一個 `src` 出現兩次 → ✖（在 KEYS 檢查之後、時間計算之前）。
- **main.mjs**：`buildMain` 收 `cueTable = { cues: cuesOut → { n: [s, e] }, segs: custom 段 → { comp, start: it.s, D: d, refs } }`；`--test` 時 `cues`、`start`、`refs` 一起減 `t0`；序列化 `JSON.stringify(...).replace(/</g, '\\u003c')`，插在 `main.mjs:183` 的 `<script src="…scene-motion.js">` 前一行。沒有 custom 段時不插。
- **段長**：host 的 `data-duration` 本來就是段長（`main.mjs:78-79`），不改；`--check` 不再比對 custom root 的 `data-duration`（現行 build 沒有這條檢查，比對在 003 的 audit，見「請 003 加」）。
- **邊界**：custom 檔讀不到 → 現行 ✖；ref 有中文詞 → JSON 原樣（UTF-8）；同一 ref 寫兩次只算一次。
- **測試**：`timing.test.mjs`「cue 注入」（`cues.md` §6 的 002 端向量）；`build.test.mjs`「head 有 window.__cues」。

### P-10 `status.mjs`

- **資料流**：`findProject`（從 build.mjs import）→ 收集 `facts`：每個判斷表用到的路徑 `{ exists, mtimeMs }`、`rough.srt` 有沒有 > 18 字（`parseSrt`＋`visibleLen`）、`素材/真人錄影/`＋`素材/聲音/` 的檔數、`work/rough.srt.bak-*` 有沒有、`work/回饋/r*.md` 最大編號 → 判斷表（`cli-002.md` §5.2）由上往下第一個符合 → 讀 `work/製作進度.md`：找 `## 停點紀錄` 後第一張表，表頭要有「時間」「停點」「狀態」；每列停點欄取 `①`–`⑥` 開頭的名稱，`Map` 以停點為鍵、後列覆蓋前列 → 狀態是「待回覆」的進 `waiting`。
- **輸出**：`cli-002.md` §5.1 的 7 行；`--json` §5.3。
- **邊界**：停點紀錄表格式壞了（沒有那三欄）→ `waiting = []`、`依據` 加「停點紀錄的表頭看不懂，略過」；mtime 差 < 1 s 視為同時；`work/` 不存在 → S0／S2 依素材判斷。
- **測試**：`status.test.mjs`（暫存專案 × 判斷表 15 列；停點紀錄覆蓋規則；不寫檔）。

### P-11 `caps.mjs`、`package.json`、版本行

- **package.json**（根目錄，新）：

  ```json
  {
    "name": "auto-edit-workspace",
    "private": true,
    "description": "AI 剪片工作區：固定 HyperFrames 版本（npm install 後，npx hyperframes 用這一版）",
    "engines": { "node": ">=22" },
    "devDependencies": { "hyperframes": "0.8.221" }
  }
  ```

- **caps.mjs**：`export function probeCaps({ root, run = defaultRun, platform = process.platform })`；`defaultRun(cmd, args)`＝`spawnSync(cmd, args, { encoding: 'utf8', timeout: 15000, shell: platform === 'win32' })` → `{ code, stdout, stderr, error }`；每列照 `cli-002.md` §6 判斷；依據字串過 `redact()`：JSON 輸出先 `JSON.parse`，只留 `method`、`source`、`status`、`logged_in` 這類鍵；純文字遇到 `/(key|token|secret|balance|amount|quota)/i` 的行整行不印；`sk-[A-Za-z0-9]` 一律換成 `sk-…`。
- **`hyperframesVersion(root)`**：讀 `<root>/package.json` 的 `devDependencies.hyperframes`（沒有 → `pinned: null`）、`<root>/node_modules/hyperframes/package.json` 的 `version`（沒有 → `installed: null`）→ `{ pinned, installed, ok: pinned && installed === pinned }`。build.mjs 在 `專案：` 之後呼叫，`root`＝`P.root`（`--template` 測試時是暫存資料夾的上兩層，測試自己放假的 package.json）。
- **邊界**：Windows 上 `npx` 要 `shell: true`（`npx.cmd`）；`codex` 的 shim 壞掉（實測 `spawn ENOENT`）→「沒有安裝或壞掉」並附錯誤第一行；`mmx auth status` 實測輸出含 API key 片段與餘額 → 一定要過 `redact`。
- **測試**：`caps.test.mjs`（假的 `run`）；`build.test.mjs`「版本行三種」；`project.test.mjs`「build 不產生 package.json／node_modules」。

### P-12 結尾配樂（`plan.mjs` 驗證與時間；`build.mjs` 呼叫 `renderBgmClip`；`main.mjs` 放 `<audio>`）

- **plan.mjs**：`TOP_KEYS` 加 `outro`；驗證（`cli-005.md` §3.3＋`cli-002.md` §1.6）；`res.outro = { music, start, span, fadeIn, fadeOut, gain, from }`（`len` 未知，留給 build）。
- **build.mjs**（非 `--check`）：`len = probeDuration(shared/sfx/<music>.wav)` → `len ≥ span` ? `{ at: start, dur: span, from: 0 }` : `{ at: outDur − len, dur: len, from: 0 }`；淡入淡出照 `contracts/sfx.md` §6.2 取 min；`renderBgmClip(src, <out>/assets/<名稱>-<hash>.wav, { from, dur, fadeIn, fadeOut, gain })` → `main.mjs` 加 `<audio id="bgm-outro" src="assets/<file>" data-start data-duration data-track-index data-volume="1">`；報告行（`cli-005.md` §3.4）。`--check` 時同樣用 `probeDuration` 量 wav 長度（一次 ffprobe，約 50 ms）以印出正確的報告行與 JSON `outro`。
- **`--test`**：`at < t0` → `data-start 0`、`data-media-start = t0 − at`；`at ≥ t0 + 秒數` → 不放。
- **邊界**：`music: null` → 不放、報告「不配」；檔案不存在 → 現行「音效檔不存在」✖。
- **測試**：`plan.test.mjs`「outro」；`build.test.mjs`「<audio id="bgm-outro">」（`renderBgmClip` 用 005 的實作；005 合併前用暫時的 stub 測 HTML）。

### P-13 音效政策（`plan.mjs`；scene.json）

- **plan.mjs**：`import { SFX_RULES, sfxBudget } from './audio.mjs'`；`SFX_GAP = SFX_RULES.gapSec`、`EXTRA_GAP = SFX_RULES.extraGapSec`；3 秒規則迴圈（`:462-468`）跳過 `sfxConf[it.sfx.name]?.additive`；段落 `sfx` 是 `kind: 'bgm'` → ✖；`custom` 的 `clicks`（新）與 media 的 `it.media.clicks`（004）→ `sfxExtra` 加 `click`（`mk({ name: 'click', … })`，`sfxExtra === false` 時不加）；最後（`:470-474` 之後）`const budget = sfxBudget(allCues, sfxConf, { voiceDb: edit.volume.voice, outDur, fmt })` → `warnings.push(...budget.warnings.map(stripMark))`、`res.sfxLines = budget.lines`、`res.sfxBudget = budget`；`plan.mjs:442` 的「12 個檔」改成 `${Object.keys(sfxConf).length} 個檔`。
- **build.mjs**：`audioReportLines(info, { …, sfx: res.sfxBudget })`；`--list` 音效行照 FR-060。
- **scene.json**：照 `contracts/sfx.md` §7，各自等 wav 進 repo（tasks.md Phase 10 的依賴）。
- **測試**：`plan.test.mjs` 跑 `contracts/sfx.md` §10 全部。

### P-14 look（`build.mjs`、`plan.mjs`）

- **plan.mjs**：`TOP_KEYS` 加 `look`；`for (const m of validateLook(plan.look)) errors.push(m)`。
- **build.mjs `--check`**：`const lc = lookCheck({ projectDir: P.project, plan, templateDir: P.templateDir })` → `res.errors.push(...lc.errors)`、`res.warnings.push(...lc.warnings.map(stripMark))`。
- **build.mjs build**：`build.mjs:408` 之前 `const look = ensureLook({ projectDir: P.project, plan, log, templateDir: P.templateDir, strict: true })`（丟錯 → 外層 catch 印 `✖`、結束碼 1）；`for (const l of look.report) log(l)`；`audioKey({ src: look.footage, …, frame, look: look.key })`；`fresh` 判斷與 `encodeFootagePolished(look.footage, assetVideo, { …, crop: frameCrop(plan, look.footage), lut: look.lut })`。`voiceOnlyOf` 與 `--check` 仍用 `P.video`。
- **相依**：006 先交 stub（spec「請 006 加」）；005 的 `audioKey` 已有 `look` 參數（`contracts/sfx.md` §8）。
- **測試**：`build.test.mjs` 用 `--template` 指向暫存模板資料夾，放一支假的 `lib/look.mjs`（stub）測接線。

### P-15 `--check --json` schema 2（`build.mjs`、`plan.mjs` 的 `jsonItems`）

- **build.mjs:422-430**：report 物件照 `check-json.md` §2 的順序加鍵；`planHash = sha1(fs.readFileSync(P.plan)).slice(0, 8)`（`node:crypto`）；build 成功後在 `<out>/.build-manifest.json` 寫 `planHash`（檔案已存在就讀出來合併；不存在就建，內容 `{ "planHash": "…" }`）。出錯 JSON（`build.mjs:594`）照 §5。
- **jsonItems**：加 `key`、`family`（scene 讀 `it.scene.family`）、`layout`／`layoutZh`（`it.side` → side；`it.opaque && it.pipPieces.length` → pip；`it.opaque` → full；其他 overlay）、`opaque`、`out`（`start: r3(it.start)`、`end: r3(it.end)`、`lists`（`listTimes` 攤平＋`it.start`，排序）、`annotations`（`it.mediaReport?.json ?? null`）、`pip`、`wipe`、`refs`）。
- **第一層新陣列**：`uncovered`／`voiceUncovered`（`{ start: back(a), end: back(b, true), outStart: a, outEnd: b, len }`）、`chapters`、`sfxCount`、`sfxBudget`（`at` 用 `back()`）、`outro`。
- **測試**：`build.test.mjs`（`check-json.md` §7）。

### P-16 004 的介面（`plan.mjs`、`build.mjs`）

- `plan.mjs` 第二輪：`const steps = newStepState()`；依 `timed` 起點順序，media 段 `it.mediaReport = validateMedia(it, { cues: cuesOut, tm, pipAt, icons, steps, err, warn })`（取代 `resolveMedia`）；`formatReport` media 那段改印 `it.mediaReport.summary`（`plan.mjs:630-631`）。
- `build.mjs`：刪 `MEDIA_FIELDS`（`:215-`），`import { MEDIA_FIELDS } from './lib/media.mjs'`。
- **過渡**：004 的 `validateMedia` 還沒合併時用 `resolveMedia` 別名（`contracts/media.md` §4、§8-2）。
- **測試**：`plan.test.mjs`「media：STEP 接續、報告 summary」；`build.test.mjs`「--list --json media.fields」。

---

## 並行與快取（回覆 001 的問題，spec「回覆 001」第 1 條）

| 指令 | 寫哪裡 | 同時跑多個會怎樣 |
|---|---|---|
| `build.mjs --check` | `work/hyperframes/.cache/blackdetect.json`（`ff.mjs:128`） | 寫入內容相同；讀到半個檔時 JSON.parse 失敗 → 重算（`ff.mjs:117-119`）。安全，最壞多算一次 |
| `media.mjs ng-snap` | `work/.cache/ng-snap.*.json` | 只在剪乾淨由主代理跑，不會並行 |
| `status.mjs`、`caps.mjs` | 不寫 | 安全 |

## 測試計畫總表

| 測試檔 | 新增案例（對應 FR） |
|---|---|
| `plan.test.mjs` | FR-005–FR-009、FR-011–FR-016、FR-020、FR-022、FR-026、FR-029–FR-033、FR-052–FR-058、FR-060–FR-062、FR-071；`contracts/sfx.md` §10 |
| `build.test.mjs` | FR-013、FR-017、FR-019、FR-023–FR-025、FR-031、FR-034、FR-050、FR-053、FR-059、FR-063–FR-065、FR-067–FR-070、FR-072 |
| `timing.test.mjs` | FR-018；`cues.md` §6 的 002 端 |
| `project.test.mjs` | FR-051 |
| `media-cli.test.mjs`（新） | FR-001–FR-004、FR-035–FR-041、FR-066；從 `media.test.mjs` 搬來的 002 案例（FR-072） |
| `status.test.mjs`（新） | FR-042–FR-044 |
| `caps.test.mjs`（新） | FR-045–FR-049 |

整合驗證（007 的 check-all，或作者手動）：FR-019（host 長度為準）、FR-023（飛入四格）、FR-025（連續 PiP）、FR-031（擦入兩格）、FR-051（npx 版本）。
