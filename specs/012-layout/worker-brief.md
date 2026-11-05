# 012 第二棒工人說明（custom 17 支 ×2 人、scenes 18 支 ×1 人）

工作目錄 `/Users/lindingyuan/Downloads/workspace/auto-edit-workspace`；暫存 `TMPDIR=/Volumes/auto-edit-tmp`（測試、snapshot 都加這個前綴）；自己的暫存專案放 `$SP/w012/<你的代號>/`（`SP=/private/tmp/claude-501/-Users-lindingyuan-Downloads-workspace-auto-edit-workspace/6d54b3e1-59e6-4062-be1d-9ed5f77ee092/scratchpad`）。全程繁體中文。

## 目標

把你負責的檔改成「位置由 helper 排、不手寫座標」：同一列等距、底對齊（標籤同一條線）、群組置中、內距照 token、連接線由 `data-links` 產生。改完每支 audit 0 ✖、`layout-*` 0 ⚠、亂序 seek 0 差、動態不變。

## 讀的順序

1. `specs/012-layout/brief.md` §1–§4（token、helper 屬性、位置欄寫法、audit 六條與門檻）。
2. `shared/template/kit/scene-layout.js` 檔頭註解（實際 API：`data-layout`／`data-gap`（含 `none`）／`data-align`／`data-row`／`data-slot`／`data-links`；Z 形折線；`SceneLayout.apply`／`measure`）。
3. `shared/template/custom/x-scene.html`＋`x-scene-example-rec.html`（宣告式的樣子：DATA 1 沒有 `style="left…"`、svg 沒手寫 path、連接線 id 固定 `<a>-<b>`）。
4. `shared/template/kit/scene.css` 第一個 `:root` 的 `--sc-*` token。
5. `specs/010-motion-v2/worker-brief-custom.md` 的「自驗三關」與「亂序比對」做法（照抄）。

## 硬規則

- 只改你負責的檔；不改 kit、audit、文件、別人的檔；不 commit。
- 動態不變：`P.*` 呼叫、`P.at` 綁句、拍的時間都不動；只動版面（位置、間距、連接線）。分鏡表（`specs/010-motion-v2/beats/<檔>.md`）的「位置」欄若有，改成排法寫法（`panelTop｜row 1／3`）。
- 排法：站／欄／列用 `data-layout`＋`data-slot`，不再手寫 `left`／`top`；真的要手排（例：比喻的兩個框、介面 mock 的視窗）寫 `data-layout="free"`，但六條規則照樣要過。
- 列的對齊：有標籤的元件在同一列以**底對齊**（標籤同一條線）；沒標籤、等高的以中線對齊（helper 預設會做，你不用算）。
- 連接線：改用 `data-links="a>b"`，`P.stroke`／`P.comet` 的選擇器改成 helper 產生的 id（`#<a>-<b>`）。
- 內距：元件群離卡片內容區邊 ≥ 48（左右）／40（上下）；放大過的元素照放大後量。
- 字級、顏色、token 以外的數字不寫死；`.sc-*` 樣式不動。

## 自驗（每支）

1. 合成最小專案（照 `worker-brief-custom.md`），`build --check` 0 ✖、`build`、`audit --json` 0 ✖；`layout-*` 規則 0 ⚠（其他 ⚠ 逐條說明）。
2. 亂序 seek 比對 0 差（順序一次、反序一次，含完成態與每拍後 0.3 s）。
3. snapshot 每拍後 0.3 s＋完成態，用 Read 看圖：等距、底對齊、置中、連接線端點貼元件邊、沒壓小視窗、沒出卡。
4. `node --test dev/tests/examples.test.mjs`（你的檔那幾項）綠。

## 回報（≤ 20 行，每支一行）

檔名｜排法（row／col／cols-2／grid／free＋為什麼）｜連接線改了幾條｜audit（✖／layout ⚠／其他 ⚠）｜亂序差｜截圖路徑｜和原版面不一樣的地方（例：原本左偏 60 px）｜要 003 注意的事（helper 做不到的排法、誤報）。
