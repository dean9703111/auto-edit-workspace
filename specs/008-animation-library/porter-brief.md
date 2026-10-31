# 008 移植工人共用說明（每個工人負責 2 支）

工作目錄 `/Users/lindingyuan/Downloads/workspace/auto-edit-workspace`；暫存區 `SP=/private/tmp/claude-501/-Users-lindingyuan-Downloads-workspace-auto-edit-workspace/6d54b3e1-59e6-4062-be1d-9ed5f77ee092/scratchpad`。全程繁體中文（檔頭註解、回報）。

## 讀的順序
1. `specs/008-animation-library/spec.md` §0（共同規則）＋ 你負責那兩支的章節（檔頭草稿、DOM 草圖、時間軸分鏡、slots、綁句與 D 下限、本支驗收）。
2. `specs/008-animation-library/research.md` 裡那兩支的候選節（口播訊號、靈感來源、技法）。
3. `shared/template/custom/x-process.html` 全文（骨架、檔頭六小節、`data-cues-sample`、id 前綴、`P.at('#N@詞')`、`P.end()`）；再看一支和你最像的現有範例（清單類看 `x-warnings.html`，數字類看 `x-numbers.html`、`x-before-after.html`，圖解類看 `x-architecture.html`、`x-branch.html`）。
4. `shared/template/kit/scene-motion.js` 檔頭的 P.* API 註解；`shared/template/kit/scene.css` 的 token 與 `.sc-*` 元件（只用 token，不寫死顏色）；`shared/template/USAGE-reference.md` R7.2–R7.6、R8（audit 會抓什麼）。
5. `dev/check-all.mjs` 的 `makeFixture()`（怎麼合成一個最小測試專案）與 `dev/tests/examples.test.mjs` 的 `makeProject()`（003 的三關怎麼跑）——只拿來照抄做法，不要改這兩個檔。

## 硬規則
- 只寫 `specs/008-animation-library/staging/x-<名稱>.html`（一支一檔）與 `$SP/w008/<名稱>/` 底下的暫存；不改 `shared/`、`dev/`、`specs/008` 其他檔；不 commit。
- 單一 HTML、零相依：只用 kit 的 gsap 與 scene.css、brand token；動畫全部由 gsap timeline 驅動（不用 rAF／Date／setInterval／CSS animation 的時間流）；SVG／DOM 為主，Canvas 只在 timeline progress 能重畫時用。
- 1920×1080；`layout: "fullscreen"` 時右下 1424–1856 × 594–918 是講者小窗，任何元素不能壓到；字級下限、stagger、D 下限照 R7／R8。
- 弱模型只改：文字 slots（≤ 6 欄）、圖示（kit/icons.json 的 svg 整段貼上、一個字不改）、句號 `#N@詞`；其他結構固定，`DATA`／常數集中在 `<script>` 開頭，寬度比例由程式算。
- 文字出現時間＝講到那個詞（F4）：每個會出現文字的元素都綁 `P.at('#N@詞')`，不綁句首；完成態停得住（最後一幕 ≥ 1.5 s＋build 淡出 0.5 s）。
- 靈感來源只借「技法」，不複製任何人的程式或素材；檔頭「靈感」一行寫 slug／作者／網址。

## 自驗（每支都要做，回報要附路徑）
1. 在 `$SP/w008/<名稱>/專案/` 合成最小專案：`ffmpeg testsrc` 70–90 秒 640×360 的 `work/rough.mp4`、`work/rough.srt`（句號照 spec 的 sample data，例 #101–#175；句子裡要含你綁的詞）、`work/cutpoints.json`（空陣列也可，照 makeFixture）、`work/hyperframes/plan.json`（一段 custom fullscreen 指到 `compositions/x-<名稱>.html`，`from`／`to` 綁句）、把 staging 的檔複製到 `work/hyperframes/compositions/`。
2. 依序跑並貼關鍵行：
   - `node shared/template/tools/build.mjs --check --project <專案>` → 0 ✖
   - `node shared/template/tools/build.mjs --project <專案>` → 成功
   - `node shared/template/tools/audit.mjs --project <專案> --json` → 0 ✖（⚠ 逐條說明或修掉）
   - `(cd <專案>/work/hyperframes && npx -y hyperframes snapshot --at <每個 beat 後 0.3 s> --at <完成態>)` → 用 Read 看每張圖，確認：文字沒壓到小窗、沒溢出、完成態是對的、沒有半途卡住的元素。
3. 另外把檔案複製一份到 `$SP/w008/<名稱>/preview/` 用 `node shared/template/tools/build.mjs --gallery` **不要跑**（會寫 shared/）；改用 `node -e` 呼叫 `shared/template/tools/lib/custom-preview.mjs` 的 `buildCustomPreview({ name, html, pipStyle, kitLinks })` 產生預覽頁到暫存區，確認可開（若呼叫方式不清楚，看 build.mjs 229–275 行怎麼呼叫）。

## 回報（≤ 20 行，每支一段）
檔名｜用到的 P.*｜slots 數｜D 下限公式｜自驗三關結果（✖／⚠ 數）｜截圖路徑（2–4 張）｜和 spec 不一樣的地方與原因｜要 003 注意的事。
