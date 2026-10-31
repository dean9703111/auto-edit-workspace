# 006 look：要併進文件的原文（交 001 整合）

- 以下每一節都是要貼進去的原文；001 併進去時只改格式，不改數字與指令。數字的單一真相是 `shared/template/kit/look.json`（預設值）與 `specs/contracts/look.md` §8（常數）；style.md 的數字由 001 的 docs.test 和 `kit/look.json` 比對（spec「請 001 加」）。
- 標「⛔ 裁決 N」的段落有兩個版本，等主代理裁決 spec「需要主代理裁決」第 N 條後刪掉沒用到的那個。
- 指令原文以 `specs/contracts/cli-006.md` 為準；這裡出現的每個指令都在 cli-006 §0。
- **主代理裁決（2026-10-31，specs/README.md）**：§1.1 停點 ② 用「要給」版本；§1.5 用「可以」版本（規則 1 例外加 `kit/look.json`）；§5 用「資產進 git」版本；§6 的模型授權照寫 Apache-2.0，交付報告提醒作者 push 前對一次 model card 原文。位移 ⚠ 門檻是臉寬 6.5 %（看 95 百分位；審查 r1-C 的 C-03 用 slim 0.6／0.8／1.05 重新校準，原裁決 5 %）。

---

## 1. `AGENTS.md`

### 1.1「剪好看（成片）」：在「**正式開始之前，先做「構圖＋套卡預覽」**」那一段的**前面**插入

```markdown
**構圖預覽之前，先做「講者調光＋瘦臉」**（調光、瘦臉會改講者的畫面，構圖預覽要看套好的樣子）：

- 跑 `node shared/template/tools/look.mjs status --project projects/<專案>`，照「→ 下一步」做：那一行是說明，最後一行就是要跑的指令（單獨一行，整行複製執行）。
- 預估超過 2 分鐘時，最後一行的 `look.mjs run` 已經帶 `--background`；之後每 30 秒跑一次 `status`，直到「→ 下一步」說 look 好了（最後一行變成 `qc.mjs framing … --cards`；plan.json 已經有段落時是 build）。不要自己用 `&`、`nohup`、`Start-Process` 放背景。
- 跑完看 `work/look-preview.jpg`（每列：原圖｜套用後｜臉部放大＋輪廓，綠＝原本、紅＝套用後）和印出來的偵測率、位移；有 ⚠ 照 → 處理。臉太小、偵測率太低時工具會自動只調光，回報時說明就好。
- 預設值在 `shared/template/kit/look.json`（調光 0.8、瘦臉 0.6）。我說「不要調光」「不要瘦臉」「瘦一點」時才在 plan.json 第一層寫 `look`（做法照 `shared/template/USAGE.md` 第 7 節）；改了 `slim` 要再跑一次 `look.mjs run`，只改 `color` 不用。
```

⛔ 裁決 6（停點 ② 要不要多給對照圖）——**要給**時，「構圖＋套卡預覽」的「把兩張圖、指令印的倍率表和你的建議給我」改成：

```markdown
- 看圖給建議：……把兩張圖、`work/look-preview.jpg`、指令印的倍率表和你的建議給我，**停下來等我選倍率**（調光或瘦臉要改也在這時候說）。
```

**不給**時這一句不動。

### 1.2 規則 7：中間檔清單在「有插入螢幕錄影或圖片時還有 `work/media/`。」後面加

```markdown
有瘦臉時還有 `work/face-landmarks.json`（每格的臉部位置）、`work/rough-look.mp4`（瘦臉後的底片）、`work/look-preview.jpg`（對照圖）；`work/.look/` 是快取，可以刪（`look.mjs clear`）。
```

### 1.3「剪輯台」第 3 條「剪輯台會改的地方」：在「plan.json 的 `edit`；」後面加

```markdown
plan.json 第一層的 `look`（講者調光、瘦臉）；
```

### 1.4「工具注意事項」最後加一條

```markdown
- 講者調光不用另外跑工具，build 重新編碼底片時會直接套。瘦臉要用 `node shared/template/tools/look.mjs run --project projects/<專案>`；build 印「瘦臉底片不是最新的」時照那一行的 → 做，不要改 build 的參數繞過去。看不懂狀態就跑 `look.mjs status`。
```

### 1.5 ⛔ 裁決 9（換風格可不可以改 `kit/look.json`；04 §6 建議可以）

**可以**時：「資料夾」表 `shared/` 那列的例外、規則 1 的例外、「換風格」第 3 條，三處都在「背景圖 `shared/template/bg-fs.jpg`／`bg-side.jpg`／`bg-ch.jpg`」後面加「、講者調光與瘦臉的預設 `shared/template/kit/look.json`」；「換風格」加第 4 條：

```markdown
4. 講者調光、瘦臉的預設：我說「預設不要調光」「預設瘦一點」這類話時，改 `shared/template/kit/look.json` 的 `color`（0–1）或 `slim`（0–1.2），其他鍵不動；只想改這一集就寫 plan.json 的 `look`，不要改這個檔。
```

**不可以**時不加，使用者要改預設就請作者自己改。

---

## 2. `shared/template/USAGE.md`

### 2.1 §2 SOP 表第 2 列：「做什麼」欄最前面加一句、「指令」欄最前面加一個指令

- 做什麼：`先做講者調光＋瘦臉（第 7 節：look.mjs status 照最後一行做，跑完看 work/look-preview.jpg）；`
- 指令：`node shared/template/tools/look.mjs status --project projects/<專案>；`
- 查：加 `第 7 節`

（不加新的列，後面的步驟編號不變，「重跑步驟 6–7」這類引用不用改。）

### 2.2 §3.2 第一層欄位表：在 `frame` 那列**前面**加一列

```markdown
| `look` | | `false` 或 `{ "color": 0–1, "slim": 0–1.2 }` | 講者調光與瘦臉（第 7 節）。不寫＝用 `shared/template/kit/look.json`（調光 0.8、瘦臉 0.6）；`false`＝兩個都關。使用者要求才寫，剪輯台「講者」也會寫 |
```

### 2.3 §4.2 常見訊息表：最後加

```markdown
| `瘦臉底片不是最新的（…）→ 先跑 node shared/template/tools/look.mjs run --project …` | ✖ | 跑 → 後面的指令（預估超過 2 分鐘時已經帶 `--background`，用 `look.mjs status` 看進度），跑完再 build |
| `⚠ 講者瘦臉略過：臉寬中位數 N px < 60 px…，只調光` | ⚠ | 畫面裡的臉太小，瘦臉看不出來，是正常的；回報時說明 |
| `⚠ 講者瘦臉略過：偵測率 N%（< 80%），只調光 → …` | ⚠ | 看 `work/look-preview.jpg`；講者常轉身、遮臉時會這樣。確定不要就寫 `"look": { "slim": 0 }` |
| `⚠ 講者瘦臉略過：找不到 shared/template/vendor/mediapipe/…` | ⚠ | 跑 `node shared/template/tools/look.mjs ensure` 看缺哪個檔，照它的 → 做 |
| `look.slim 要是 0–1.2 的數字…` 這類 `look…` 開頭的訊息 | ✖ | 照訊息改 plan.json 的 `look`（只能寫 `color`、`slim`） |
```

### 2.4 §6 開頭的清單：第一條「第一層的 `edit`（下表）。」後面加一條

```markdown
- 第一層的 `look`（講者調光、瘦臉）：剪輯台一律兩個都寫，例如 `{ "color": 0.8, "slim": 0.5 }`；按「恢復預設」會整個拿掉。使用者在剪輯台改過，就以剪輯台的值為準。
```

### 2.5 新增「## 7. 講者調光與瘦臉（look）」（放在第 6 節後面）

```markdown
## 7. 講者調光與瘦臉（look）

講者的畫面會自動調光（亮一點、膚色紅潤一點）和瘦臉，預設在 `shared/template/kit/look.json`；規則與限制看 `shared/style.md`「講者畫面」。

| 誰做 | 什麼時候 | 做什麼 |
|---|---|---|
| build | 每次重新編碼底片 | 套調光的 LUT（`kit/look/jianying-smart.cube`，強度 `color`）。不用另外跑 |
| `look.mjs run` | 剪乾淨之後、構圖預覽之前；`rough.mp4` 換過或 `slim` 改過之後 | 偵測每一格的臉（`work/face-landmarks.json`）→ 做瘦臉底片 `work/rough-look.mp4` → 對照圖 `work/look-preview.jpg` |
| build | `slim` > 0 | 用 `work/rough-look.mp4` 當底片；不是最新的就 ✖ 停下來，請你先跑 `look.mjs run` |

指令（完整說明：`node shared/template/tools/look.mjs --help`）：

- 看狀態與下一步：`node shared/template/tools/look.mjs status --project projects/<專案>`（「→ 下一步」下面那一行就是要跑的指令）
- 偵測＋瘦臉：`node shared/template/tools/look.mjs run --project projects/<專案>`；預估超過 2 分鐘加 `--background`，再用 `status` 看進度
- 只重畫對照圖：`node shared/template/tools/look.mjs preview --project projects/<專案>`
- 檢查臉部偵測的檔案：`node shared/template/tools/look.mjs ensure`

plan.json 的寫法（使用者要求才寫）：

| 使用者說 | 寫 |
|---|---|
| 不要調光、不要瘦臉 | `"look": false` |
| 只要調光 | `"look": { "slim": 0 }` |
| 調光淡一點 | `"look": { "color": 0.5 }` |
| 瘦一點／不要那麼瘦 | `"look": { "slim": 0.8 }`／`"look": { "slim": 0.3 }`（改完跑 `look.mjs run`） |

- 自動略過瘦臉（只調光）：臉寬 < 60 px（畫面裡的臉太小）、偵測率 < 80 %、找不到臉部偵測的檔案或 Chrome。build 會印 ⚠ 和原因，不用處理。
- 側臉時瘦臉自動減半、偵測不到的格自動淡掉，不會一格有一格沒有。
- 對照圖的位移 ⚠（95 % 的格超過臉寬 6.5 %）表示太強，脖子與領口可能被拉彎：把 `slim` 調低。
```

---

## 3. `shared/style.md`：新增「## 講者畫面（調光、瘦臉）」

放在「## 畫布」後面、「## 講者」前面（「## 講者」是 14 講者介紹字卡的資料，名稱不同，避免混在一起）。

```markdown
## 講者畫面（調光、瘦臉）

- 預設：調光 **0.8**（＝剪映「智能調色」80，含美白 30）、瘦臉 **0.6**（＝剪映「瘦臉」60＋「V 臉」10）。每支影片共用的值在 `shared/template/kit/look.json`，單集要改寫 plan.json 的 `look`
- 範圍：調光 0–1（0＝不調）；瘦臉 0–1.2（0＝不瘦；超過 1.2 脖子、領口會被拉彎）
- 調光是一支固定的 3D LUT，從作者在同一個場地、同一台相機的剪映成片擬合出來（esim_ep2 第 8–16 秒），和剪映的色差平均 3.5（背景）／4.4（臉）ΔE；剪映會依每支影片自動分析，這裡不會。換場地、逆光、戶外時先看 `work/look-preview.jpg`，太過就調低或關掉
- 瘦臉只動臉頰到下巴的輪廓，不動眼睛、鼻子、嘴；每一格跟著臉走。側臉時自動減半，偵測不到臉的格自動淡掉
- 臉在畫面裡太小（臉寬 < 60 px）就不瘦臉，只調光
- 不做：大眼、磨皮、祛斑、法令紋（剪映「更瘦」預設裡有，這裡沒有）
```

出處：0.8、美白 30、瘦臉 60＋V 臉 10 → 04 §2.1、§2.2、§6 表；ΔE 3.5／4.4、擬合範圍 → 04 §0、§8；1.2 → 04 §6 表；60 px → 契約 §8 `MIN_FACE_PX`；不做的項目 → 04 §2.1 表（大眼 1.0、磨皮 0.3 等原型沒做）。

---

## 4. `shared/template/EDITOR.md`

### 4.1「一、給 AI」§3「剪輯台會寫哪些欄位」表：在「第一層 `edit`」那幾列**前面**加一列

```markdown
| 第一層 | `look` | 講者調光與瘦臉 `{ "color": 0–1, "slim": 0–1.2 }`，兩個都寫；按「恢復預設」整個拿掉。改 `slim` 後按「重新產生」，剪輯台會先跑 `look.mjs run` 再 build |
```

並在表下面的清單加一條：

```markdown
- `look` 原本沒有時，插在 `edit` 前面（沒有 `edit` 就插在 `scenes` 前面）。
```

### 4.2「一、給 AI」§7「兩種預覽與自動降級」最後加一條

```markdown
- 即時模擬的調光是 CSS 濾鏡近似（`brightness`／`contrast`／`saturate`），和成片的 LUT 不完全一樣，臉部很接近、牆面偏差較大；以成片預覽或 `work/look-preview.jpg` 為準。瘦臉沒有即時預覽，看屬性面板的「前／後」兩張臉。
```

### 4.3「一、給 AI」§8「常見問題」表：在「重新剪乾淨、換了 rough.mp4」那列後面加兩列

```markdown
| 「重新產生」很久，訊息停在「偵測臉部」或「套用瘦臉」 | 改了瘦臉強度或 rough.mp4 換過，剪輯台先跑 `look.mjs run`（長片要幾分鐘）。等它跑完；想先看別的，請使用者把瘦臉關掉（`slim` 0）就不用等 |
| 「講者」的臉部對照寫「還沒偵測臉部」 | 跑 `node shared/template/tools/look.mjs run --project projects/<專案>`，跑完重新整理頁面 |
```

### 4.4「二、給使用者」：在「### 聲音」**後面**新增一節

```markdown
### 講者（調光、瘦臉）

點時間軸空白處，右邊「屬性」最上面是「講者」：

- **調光**：開關＋強度（0–1，預設 0.80＝剪映 80）。拖的時候畫面馬上變（是近似效果，成片會更準）。
- **瘦臉**：開關＋強度（0–1.2，預設 0.60＝剪映 60）。下面兩張是「目前這一格」的臉，左邊原本、右邊瘦臉後，滑桿放開就更新。臉太小或偵測不到時會寫原因。
- **恢復預設**：回到每支影片共用的設定（`shared/template/kit/look.json`）。
- 改了瘦臉要按「重新產生」才會套進成片；長片第一次要幾分鐘（右下角會顯示「偵測臉部」「套用瘦臉」的進度）。只改調光很快。
```

### 4.5「二、給使用者」「### 畫面」那張圖的說明：第一條「點空白處＝整支影片的設定（」括號裡最前面加「講者調光與瘦臉、」

### 4.6 新 API

EDITOR.md 現在沒有列 API，**不用加**；API 只寫在 `specs/contracts/cli-006.md` §6（給程式看）。

---

## 5. `setup/`

### 5.1 `setup/README.md`「要裝的東西」表最後加一列

⛔ 裁決 1——**資產進 git**：

```markdown
| 臉部偵測檔（MediaPipe，約 18.7 MB） | 瘦臉用。已經在 `shared/template/vendor/mediapipe/`，不用裝；S7 只檢查檔案完整 |
```

**第一次使用時下載**：

```markdown
| 臉部偵測檔（MediaPipe，約 18.7 MB） | 瘦臉用。S7 下載到 `shared/template/vendor/mediapipe/`；不裝也能剪，只是不會瘦臉 |
```

### 5.2「步驟 3：共用步驟」：S5 和 S6 中間加 S7（S6 的「最後檢測」編號不變，S7 寫在它前面，或 001 統一重排）

⛔ 裁決 1——**資產進 git**：

```markdown
**S7 臉部偵測檔**：`node shared/template/tools/look.mjs ensure`。驗證：最後一行 `✔ 4 個檔都對`。出現 ✖：先 `git checkout -- shared/template/vendor/mediapipe`（下載 ZIP 的使用者：重新下載工作區），再跑一次；還是 ✖ 就照那一行的 → 做（要下載，算安裝，照規則 3 先問）。
```

**第一次使用時下載**：

```markdown
**S7 臉部偵測檔**（步驟 1 的清單要列這一項：「下載臉部偵測模型約 18.7 MB 到 shared/template/vendor/mediapipe/，瘦臉用」）：`node shared/template/tools/look.mjs ensure --download`。驗證：最後一行 `✔ 4 個檔都對`。下載失敗：確認網路能連 `cdn.jsdelivr.net` 與 `storage.googleapis.com`；連不上就跳過，之後剪片只調光、不瘦臉。
```

### 5.3 `setup/check.sh`、`check.ps1`（選做，001 決定）

`look.mjs ensure` 退出 0／1 已經足夠；check 腳本要列這項時，JSON 加 `{ "name": "mediapipe", "status": "ok|missing", "step": "S7" }`，`missing` 不算進 `todo`（瘦臉是選用）。

---

## 6. `NOTICE.md`：「## 第三方素材」最後加一節

```markdown
### MediaPipe Tasks Vision 1.2.0 與 Face Landmarker 模型

- 檔案：`shared/template/vendor/mediapipe/`（`vision_bundle.mjs`、`wasm/vision_wasm_internal.js`、`wasm/vision_wasm_internal.wasm`、`face_landmarker.task`）
- 授權：Apache License 2.0，全文見 `shared/template/vendor/mediapipe/LICENSE`
- 版權：Copyright 2022–2023 The MediaPipe Authors（Google LLC）
- 出處：程式庫 https://www.npmjs.com/package/@mediapipe/tasks-vision （1.2.0，原封不動的檔案）；模型 https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
- 說明：只用來在本機偵測講者的臉部位置（瘦臉），不上傳任何畫面。檔案沒有修改；每個檔的大小與 sha256 在同資料夾的 `manifest.json`
```

⛔ 裁決 2：模型那一行的授權要等作者看過 Google Face Landmarker model card 原文再定。若 model card 寫的不是 Apache-2.0，「授權」改成兩行（程式庫 Apache-2.0；模型照 model card 原文），並把 model card 網址加進「出處」。

---

## 7. 001 的 Skill（`.agents/skills/` 剪好看那支）

- 步驟清單在「構圖預覽」前面加一步「講者調光＋瘦臉：`look.mjs status` → 照 → 下一步做」，文字照本檔 §1.1 前兩點縮寫，指令原文不改。
- 停點 ② 的交付物照裁決 6。
- `look.mjs run --background` 的等法照本檔 §1.1 第二點（每 30 秒 `status`），不要寫成固定等幾分鐘。
