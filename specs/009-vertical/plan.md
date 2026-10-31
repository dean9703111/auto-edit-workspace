# 009 vertical：實作計畫

## 決策紀錄

### D-1 T002-V01 spike（FR-020）：直式 root 裡縮放 1920×1080 子合成（2026-10-31）

**結論：採用原案（host 本身加 FR-011 transform），兩條退路都不需要。** 四項全部通過；FR-011 要補 3 句（見下）。

**spike 專案**（手工寫，不經 build；`$SP` ＝ `/private/tmp/claude-501/-Users-lindingyuan-Downloads-workspace-auto-edit-workspace/6d54b3e1-59e6-4062-be1d-9ed5f77ee092/scratchpad`）：`$SP/w009/spike/proj/`

- root `#main-root` 1080×1920、4 秒；`<meta viewport width=1080, height=1920>`。
- L0 底片：`projects/範例-直式` 的口播（202×360）放大成 1080×1920、取 10–14 秒，有聲音。
- 上半：`#el-x01` 子合成 host（`data-width="1920" data-height="1080"`，內容＝`shared/template/custom/x-process.html` 原檔複本，帶整個 `kit/`），0.5–4 秒，z 30，CSS：`transform: translate(-61.7px, 129.825px) scale(0.8475); transform-origin: 0 0;`，加 `data-layout-allow-overflow`；底下一層 1080×1920 `.sc-surface-fs` backdrop（`.clip`，z 29，FR-022）。
- 下半：講者面板 `.pip` `[0,900,1080,1020]`、`overflow: hidden`、z 40（靜音複本），上緣 6 px 主色線。
- 最上層：1080×1920 字幕子合成（`data-format="portrait"`，`.cg` `bottom: 530px`、60／72、字重 700），z 60。（spike 時的值；決定 2 改成和橫式同一套 76／71、字重 400、底板 118，`bottom: 511px`，見 `contracts/canvas.md` §2.1）
- 工具版本：一律用工作區釘的 `node_modules/.bin/hyperframes`（0.8.221）。注意：在 scratch 資料夾跑 `npx hyperframes` 會拿到快取裡的 0.8.223（`compositions --json` 的 `_meta.version`）；兩版結果相同，紀錄以 0.8.221 為準。

| # | 項目 | 結果 | 證據（`$SP/w009/spike/…`） |
|---|---|---|---|
| ① | `hyperframes check` 沒有新 error | ✓ 0 error。原案（host 沒加 `data-layout-allow-overflow`）多 1 則 Layout ⚠ `panel_out_of_canvas div.sc-surface-fs.fill … overflowed left 61.7px, right 485.5px`；host 加 `data-layout-allow-overflow` 後消失，和橫式對照組完全相同（只剩 1 則 x-process 自己的 Contrast ⚠，`t=1.111s` 站在淡入中，橫式也有）。`lint` 0／0。 | `check-A.log`（原案）、`check-A2.log`（加 allow-overflow）、`check-land.log`（橫式對照組 `proj-land/`） |
| ② | `snapshot` 與 `render` 位置正確 | ✓ 卡片標題列量到 x 42–1037、頂 259；內容區白底到 y 858。公式預期：卡 40–1040、頂 256.95、底 860.4（差 2–3 px＝卡框 2 px 與圓角）。Studio 回報的選取框也證實：`#xproc-lines`（內容區左上角，子合成座標 x 122、y 280、1176×580）在主合成座標是 `x 41.695、y 367.125、996.66×491.55`＝`40 + (122−120)×0.8475`、`240 + (280−130)×0.8475`、`1176×0.8475`、`580×0.8475`，**完全吻合**。snapshot 與 render 同一格逐列量測一致（render 頂 260，±1 px 編碼）。render 輸出 1080×1920、30 fps、4.000 s、有音軌。 | `shots-221/`（0.3／1.2／2.5／3.8 s）、`render-221.mp4`、`render-221-sheet.jpg`、`measure.mjs` |
| ③ | `preview`（Studio）顯示正確、能列出與選取 | ✓ Studio 以直式畫布顯示；Compositions 列出 `index ROOT`、`x-process`、`captions`；時間軸列出 Rough／Bd X01／X Process／Pipv X01／Captions／Pip X01。畫布上點卡片 → 選到子合成裡的 `#xproc-lines`，選取框落在縮放後的位置（`--selection --json` 的 boundingBox 見 ②）；時間軸點 X Process → 選到 host `#el-x01`，選取框是縮放後的整個 1920×1080 外框（右邊超出畫布到 x 1565）；時間軸點 Captions → 選到 `#el-captions`。 | `studio/studio-2-t38.png`、`studio-3-select-xproc.png`、`studio-5-select-host-timeline.png`、`studio-6-select-captions-timeline.png`、`studio-selection-1.json` |
| ④ | 字幕子合成（1080×1920）在最上層 | ✓ snapshot、render、Studio 預覽三處都是字幕框蓋在講者面板上：字幕框頂 y 1302、x 272–807（置中 539.5），和 `caption.box [140,1302,940,1390]` 一致。畫布上點字幕會穿透選到下面的 `#pipv-x01`：字幕的 `pointer-events: none` 是 `captions.css` 原本就有的（橫式一樣），要選字幕從時間軸點。 | `shots-221/frame-03-at-3.8s.png`、`studio/studio-4-select-caption.png`（URL 的 `selId=pipv-x01`） |

**採用做法**：原案。host 直接帶 transform，不包 `stage-wrap`、不改 data-width／data-height。退路一（非 clip 的 `<div class="stage-wrap">`）與退路二（root 改 1000×636＋build 注入內層 scale）都沒試：四項第一輪就過。

**FR-011 要修改的字句**（給 spec.md 維護者；本 spike 不改 spec.md）：

1. `window` 是 `[x0, y0, x1, y1]`（不是 `[x, y, w, h]`）：`[120,130,1300,880]` ＝ 1180×750，×0.8475 ＝ 1000×636。建議在 FR-010 表格或 FR-011 開頭寫明。
2. host 除了 `transform`／`transform-origin`，**還要加 `data-layout-allow-overflow`**：縮放後的 1920×1080 子合成右緣到 x 1565、左緣 −61.7，`hyperframes check` 會報 `panel_out_of_canvas` ⚠；加了就和橫式一樣乾淨。
3. transform 寫在 host 的 CSS（`<style>` 的 `#el-<id>` 規則或 inline style），main 的 GSAP 對 host **只能動 `opacity`**：GSAP 動 `x`／`y`／`scale` 會改寫 inline transform，把舞台縮放蓋掉（直式的進場若要位移，動 backdrop 或子合成裡面的元素）。數字取到小數 3 位（`translate(-61.7px, 129.825px)`），`stageTransform()` 回傳字串時照這個格式。

**順帶發現（不在四項內，留給後續 FR）**

- FR-022 backdrop：子合成自己的 `.sc-surface-fs.fill` 也被縮放，蓋住 y 129.8–1045，所以 1080×1920 backdrop 只露出頂端 0–130；兩張 `bg-fs.jpg` 比例不同，背景裝飾線出現兩次（y ≈ 40 與 y ≈ 148，見 `shots-221/frame-03-at-3.8s.png` 頂端）。backdrop 建議改成純色（`--sc-fs` 底色 token）或和縮放後的面板對齊同一張圖的位置，C.1 實作時要定。
- Studio Inspector 對 host 顯示的是未縮放的 `X 0、Y 0、W 1920、H 1080`；在 Studio 拖動或改 host 的位置會寫 host 的 transform，可能蓋掉舞台縮放。剪輯台（006）與 Studio 使用說明要寫「上半面板的 host 不要在 Studio 移動，改內容去子合成」。
- render 時間（4 秒片段、`--quality draft`、本機硬體 GPU）：HyperFrames 回報 **6.1 s**（wall 7.3 s）；第一次在 0.8.223 冷快取跑是 10.4 s（wall 16.1 s）。和橫式同長度片段同一量級，舞台縮放沒有明顯成本。
