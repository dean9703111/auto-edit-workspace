# 010 階段 B：情境動畫換 v2 編排（工人共用說明，每人 3–4 支）

工作目錄 `/Users/lindingyuan/Downloads/workspace/auto-edit-workspace`；暫存 `SP=/private/tmp/claude-501/-Users-lindingyuan-Downloads-workspace-auto-edit-workspace/6d54b3e1-59e6-4062-be1d-9ed5f77ee092/scratchpad`。全程繁體中文。

## 目標
把你負責的 `shared/template/custom/x-<名稱>.html` 從舊的「淡入→停留→退場」改成 v2 動態（拍為單位、焦點管理、微動、拍點音效），**plan.json 的 slots／beats 欄位名與弱模型的寫法不變**；檔頭第一行改成 `<!-- 預設拍型：<BEATS.md §3 的哪一型> -->`。

## 讀的順序
1. `shared/template/BEATS.md`（§2 語彙表 45 個動作、§3 六種拍型 A–F、§4 待定情境的通用排法）。
2. 已換好的兩支範例：`shared/template/custom/x-process.html`（拍型 A）與 `x-timeline.html`（拍型 B）——**改法照抄**：`const ENTER = 'grow' | 'swap'` 開關；每一拍一行 `P.at(...)` 加一行同綁句的 `P.sfx(...)`；不用迴圈，每一拍寫開（examples.test 要能解析每個 `at`）；站與站最小間隔與 D 下限寫在檔頭【D 下限】；版面上排 top 56 讓焦點抬起後不壓標題。
3. `specs/contracts/motion.md`（P.* 參數、tween 的 data.role 標籤、P.sfx 格式）；`shared/template/kit/scene-motion.js` 檔頭。
4. `specs/010-motion-v2/design-system.md` §3（曲線表）、§7（焦點）、§8（微動）、§9（音畫對拍：哪一拍配哪顆 shared/sfx）。
5. `specs/010-motion-v2/beats/x05.md`（分鏡表長什麼樣；你的每支也要附一份）。

## 硬規則
- 只改自己那幾支 `custom/x-*.html` 與對應的 `specs/010-motion-v2/beats/x-<名稱>.md`（新檔）；不改 kit、scenes、tools、tests、其他 custom；不 commit。
- timeline 驅動、確定性（亂序 seek 逐像素相同）；零相依；只用 P.*（不自己寫 gsap 動態）；位置用 P.region 的區域名與 u 單位，不寫死像素。
- 子母畫面區不壓；字級、stagger、D 下限照 R7／R8；每拍：進場 ≤ 0.6 s → 強調 → 其他退焦 → 一顆音效（只用 `shared/sfx/`）；拍與拍之間有微動；同一時間只有一個焦點；完成態回均衡 ≥ 1.5 s。
- 文字出現時間＝講到那個詞（`#N@詞`），和舊版一樣。

## 自驗（每支都要）
1. 在 `$SP/w010b/<名稱>/` 合成最小專案（照 `dev/tests/examples.test.mjs` 的 `makeProject()` 作法：rough.mp4 testsrc、rough.srt 含你綁的詞、cutpoints、plan.json 一段 custom fullscreen、`work/storyboard.md` 裡放你的分鏡表 `#### 動畫分鏡 <段 id>`）。
2. `node shared/template/tools/build.mjs --check --project <專案>` 0 ✖ → build → `node shared/template/tools/audit.mjs --project <專案> --json` 0 ✖（含「分鏡對齊」）→ `(cd <專案>/work/hyperframes && npx -y hyperframes snapshot --at <每拍後 0.3 s> --at <完成態>)` 用 Read 看每張。
3. `node --test dev/tests/examples.test.mjs dev/tests/audit.test.mjs` 全過。
4. 動態條：`ffmpeg` 每 0.15 s 一格拼成一張放 `$SP/w010b/<名稱>/strip.jpg`。

## 回報（≤ 20 行，每支一段）
檔名｜拍型｜用到的 P.*｜D 下限與站間隔｜三關結果（✖／⚠ 數）｜截圖與動態條路徑｜和拍型不一樣的地方與原因｜要 003 或 001 注意的事（例：SITUATIONS §3 動態欄該怎麼寫）。
