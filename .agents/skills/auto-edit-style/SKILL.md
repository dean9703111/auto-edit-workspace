---
name: auto-edit-style
description: 換工作區的主色、背景圖、講者調光瘦臉的預設，或換這一集的主題（亮／暗）、風格包：brand.mjs 換主色；背景圖有使用者的圖就縮放裁切，沒有就先跑 caps.mjs 探測生圖能力再照路由表生成（Codex／mmx／HTML 截圖），三張圖驗尺寸、出預覽，使用者同意才放進 shared/template/。風格包（shared/template/styles/<名稱>/）用 brand.mjs list／use／pack 試用、套用、存包。配樂照 references/music.md、拆參考片照 references/reference-video.md 做。當使用者說「換風格」「換成我的風格」「換主色」「換背景」「生成背景圖」「以後都要調光」「預設不要調光」「換暗色」「換主題」「有哪些風格」「這集用 XX 風格」「做一個風格包」「講者設定成…」「不要講者介紹」「生成配樂」「換配樂」「這集不要底樂」「用我自己的音樂」「拆這支參考片」時使用。只想移動某張卡的位置、改某一集的版面時不要用（改用 auto-edit-review）。
version: 0.1.0
---
# 換風格

規則在 AGENTS.md；本檔只寫這一階段的指令、判準、停點、退路。

| 輸入 | 指令 | 產出 | 完成判準 | 停點 |
|---|---|---|---|---|
| 色碼、色名或使用者的圖 | `brand.mjs`、`caps.mjs`、生圖、`brand.mjs bg` | `kit/brand.css`、`kit/pip-frame.png`、`bg-fs.jpg`、`bg-side.jpg`、`bg-ch.jpg`（＋`kit/look.json`） | `brand.mjs bg --verify` 0 個 ✖、使用者在停點 ⑥ 同意 | ⑥ 背景預覽 |
| 「換暗色」「換主題」 | 步驟 6 | 這一集 plan.json 第一層的 `theme` | build 0 個 ✖ | — |
| 「有哪些風格」「這集用 XX 風格」「整個換成 XX」 | 步驟 7 | 這一集 plan.json 第一層的 `style`，或 `brand.mjs use` 換掉 `shared/template/` 那幾個檔 | `brand.mjs list` 的 ● 是對的那包、build 0 個 ✖ | — |

路由規則的唯一定義：USAGE-reference.md R9.3；背景圖規格與留空區：R9.2。這支 Skill 會動到 `shared/`，只透過工具寫這幾樣（AGENTS.md 規則 1）：`brand.mjs` 寫 `kit/brand.css`、`kit/pip-frame.png`、`kit/pip-frame-v.png`、`bg-*.jpg`，`brand.mjs pack` 新增 `shared/template/styles/<名稱>/`（已經有的包不改、不刪），`brand.mjs speaker` 寫 `shared/setting.json`，`look.mjs default` 寫 `kit/look.json`（步驟 5）。這一集的 plan.json 設定一律用 `build.mjs --set`／`--unset` 改，不手改。

## 開始前

| 條件（看得到的事實） | 做法 |
|---|---|
| 只換主色 | 只做步驟 1 |
| 使用者有上傳圖片 | 步驟 2 直接走「使用者的圖」那條路，不用探測 |
| 使用者說「以後都要調光」「預設瘦一點」「預設不要調光」 | 只做步驟 5 |
| 使用者說「換暗色」「換主題」「改回亮色」 | 只做步驟 6 |
| 使用者說「有哪些風格」「這集用 XX 風格」「換回預設」 | 只做步驟 7 |
| 使用者說「做一個風格包」「換成我的風格」 | 步驟 1–4，第 4 步存成新的一包 |
| 使用者說「生成配樂」「做配樂」「換配樂」「加底樂」「這集不要底樂」「用我自己的音樂」 | 不做下面的步驟，改照 `references/music.md`（選用；沒人要求就不加底樂、不裝 ACE-Step） |
| 使用者說「拆這支參考片」「分析這支影片怎麼剪」 | 不做下面的步驟，改照 `references/reference-video.md`（只出報告，不改 `shared/`） |

## 步驟

**1. 主色**

```
node shared/template/tools/brand.mjs "#RRGGBB"
```

色名先轉成色碼，回報用了哪個色碼。brand.mjs 多印一行暗色主題跟著換的顏色（`kit/scene.css` 自動推，不用改）；直式的講者框 `kit/pip-frame-v.png` 一起重畫。
完成判準：brand.mjs 印的對比值與警告原文已貼給使用者。
常見錯誤：紅色系警告 → 明講「觀眾會分不出哪個是警告」（R9.1），由使用者決定；印 `⚠ 暗色主題標題列的白字對比只有…` → 把這行原文貼給使用者，建議換深一點的主色，或這支影片用亮色主題。

**2. 背景：選路**

```
node shared/template/tools/caps.mjs
```

做法、常見的狀況：`references/background.md`「2. 背景：選路」。
完成判準：能力表已貼、選了一條路。

**3. 生成到暫存資料夾、驗證、預覽 → 停點 ⑥**（每條路的指令在 `references/image-routing.md`）

```
node shared/template/tools/brand.mjs bg --tmp
node shared/template/tools/brand.mjs bg --verify <暫存資料夾>
```

第 1 行開暫存資料夾、印完整路徑（後面的 `<暫存資料夾>` 都換成它）；三張做好後跑第 2 行：驗尺寸、重做 zones 圖、量留空區、產生 `preview.jpg`，最後印回報段和停點 ⑥ 那兩行。做法、常見的狀況：`references/background.md`「3. 生成到暫存資料夾、驗證、預覽」。
完成判準：`--verify` 0 個 ✖、最後兩行是停點 ⑥；留空區有 ⚠ 照那一行的 → 做。

**4. ⑥ 同意後：存成風格包、套用，重跑 build**

```
node shared/template/tools/brand.mjs pack <名稱> --color "#RRGGBB" --bg <暫存資料夾> --note "<一句說明>"
node shared/template/tools/brand.mjs use <名稱>
node shared/template/tools/build.mjs --project projects/<專案>
```

做法、常見的狀況：`references/background.md`「4. ⑥ 同意後：存成風格包、套用，重跑 build」。
完成判準：回報改了哪些檔、走的是哪一條路；有專案時 build 0 個 ✖。

**5. 講者調光、瘦臉的預設**（使用者說「以後都要調光」「預設瘦一點」「預設不要調光」時；預設兩個都是 0＝關）

```
node shared/template/tools/look.mjs default --color 0.8 --slim 0.6
```

只寫使用者說的那幾個（`--color` 0–1、`--slim` 0–1.2、`--beauty` 0–1；0＝關），它只改 `shared/template/kit/look.json` 那幾個鍵；不帶值＝印目前的預設。只想改這一集（「這集要調光、瘦臉」）不要跑這條，改用 `node shared/template/tools/build.mjs --project projects/<專案> --set "look.color=0.8;look.slim=0.6"`（這集都不要：`--set look=off`）。改了瘦臉或美顏，有專案時照 `node shared/template/tools/look.mjs status --project projects/<專案>` 印的「→ 下一步」重跑 `look.mjs run`。
完成判準：印 `✓ kit/look.json：…` 和「設定：…」那一行是新的值。

**6. 換主題（亮／暗）**（使用者說「換暗色」「換主題」「改回亮色」時）

```
node shared/template/tools/build.mjs --project projects/<專案> --set theme=dark
node shared/template/tools/build.mjs --project projects/<專案>
```

`dark`＝暗色（石墨黑底、玻璃卡）；改回亮色寫 `theme=light`。只換顏色 token，版面與動態不變；這一步不改 `shared/`，不用停點 ⑥。第 2 行照 `--set` 印的「→ 下一步」跑。
完成判準：印 `✓ plan.json：theme＝…`、build 0 個 ✖；回報寫改成哪個主題、改的是哪個專案。

**7. 風格包：列出、這一集用、整個工作區換**

```
node shared/template/tools/brand.mjs list
node shared/template/tools/brand.mjs use <名稱>
node shared/template/tools/build.mjs --project projects/<專案>
```

先跑 list 把清單貼給使用者（內建「預設」橘色、示範「藍圖」藍色；也可以請他打開 `shared/template/index.html`，上方「風格」選單可以直接預覽每一包、亮／暗）。只換這一集：`node shared/template/tools/build.mjs --project projects/<專案> --set style=<名稱>`（不跑 use；名稱照 list 抄）；換回工作區目前的：`--unset style`。整個工作區換：跑 use（之後每集都用它；目前的設定不屬於任何包時，它會先自動存成「原本-<YYYYMMDD>」）。這一步不用停點 ⑥（風格包已經是使用者同意過的檔）。
完成判準：只換一集時 build 印 `風格包：<名稱>`；整個換時 list 的 ● 在那一包；build 0 個 ✖。

**8. 講者資料**（使用者說「講者設定成 <姓名>，頭銜 …」「不要講者介紹」，或 `status.mjs`／`--check` 印「還沒設定講者」而使用者給了資料時）

```
node shared/template/tools/brand.mjs speaker --name "<姓名>" --titles "<頭銜1>,<頭銜2>" [--short "<金句出處>"]
node shared/template/tools/brand.mjs speaker
```

寫 `shared/setting.json`（不進版控；14 講者介紹不寫 `name`、`titles` 就用它，15 金句不寫 `by` 用 `short`）。頭銜用逗號或「、」分開；只改頭銜就只給 `--titles`。不要講者介紹：`brand.mjs speaker off`。姓名、頭銜一定是使用者給的，不要從講稿或頻道名猜；這一步不用停點 ⑥。
完成判準：第 2 行印 `講者：<姓名>…`；有專案時重跑 build 0 個 ✖、沒有「還沒設定講者」的 ⚠。
常見錯誤：`✖ 講者資料不對：… 最多 6 字` → 把超過的頭銜唸給使用者、請他給短一點的，不要自己縮。

## 停點

```
⏸ 停點 ⑥ 背景預覽｜請看 <暫存資料夾>/preview.jpg 和 <暫存資料夾>/zones-fs.jpg
請回：「可以」或「重做」
```

停點 ⑥ 不能略過：背景圖放進 `shared/` 一定要使用者同意（AGENTS.md 規則 1）。這兩行照抄 `brand.mjs bg --verify` 印的（暫存資料夾已經是完整路徑）。

生成配樂（`references/music.md`）也停在 ⑥，用這兩行（`music.mjs gen` 會印，照抄）：

```
⏸ 停點 ⑥ 配樂試聽｜請看 <候選資料夾>/試聽.html
請回：「用第 N 首」或「重做」
```

| 使用者回 | 做什麼 |
|---|---|
| 「可以」 | 步驟 4 |
| 「重做」 | 步驟 3（只重派要重做的那張）；同一條路第 2 次還不行換下一條路 |

## 自我核對

- [ ] 用了哪個色碼已回報
- [ ] 能力表已貼
- [ ] 沒有安裝工具、沒有幫使用者登入任何服務
- [ ] `preview.jpg` 親眼看過：三張像同一套、留空區的框裡沒有裝飾
- [ ] 背景圖、新的風格包在停點 ⑥ 通過才 `pack`、`use`（步驟 1 換主色不用等 ⑥）
- [ ] `shared/` 只透過本檔開頭列的工具寫；plan.json 只用 `--set`／`--unset` 改

## 退路表

| 症狀（工具原文） | 做法 | 第二次還失敗 |
|---|---|---|
| 能力表 codex 是「未登入」或「沒有安裝或壞掉」 | 走路由表的下一條路；回報寫「登入 codex 之後可以改用生圖」 | — |
| 能力表 mmx 是「未登入」 | 同上 | — |
| `可用的生圖路線：無 → 背景圖只能用使用者上傳的圖` | 只換主色、保留目前的背景，告訴使用者原因，請他上傳圖片 | — |
| `⚠ 紅框（全畫面主卡）裡有 N% 的像素是裝飾` | 裝飾移到框外，重跑同一個 `brand.mjs bg` | 換下一條路 |
| `✖ 輸出資料夾不能在 shared/template/ 裡` | `--out` 改成暫存資料夾 | 停下來回報：指令、錯誤原文、已經試過什麼 |

## 工具呼叫預算

最多 15 次。超過就停下來回報卡在哪；工具印「→ 停手」也一樣停，把它上面還在的 ✖ 原文回報。

## 回報格式

```
主色：<色碼>（<色名>）；對比 <brand.mjs 原文>
能力表：<貼 caps.mjs 的表>
走的路：<使用者的圖／Codex／mmx／HTML>，理由：<一句>
主題（只在換主題時）：<--set 印的 ✓ 那一行>；build ✖ 0
<brand.mjs bg --verify 印的回報段（三張背景、留空區、停點 ⑥ 那兩行），照貼>
```

⑥ 通過後：`存成風格包：shared/template/styles/<名稱>/；套用：<整個工作區（brand.mjs use）／只有這一集（plan.json style）>`＋`→ 重新打開 shared/template/index.html，上方「風格」選 <名稱> 預覽`。

## 什麼時候讀 references/

- `references/background.md`：步驟 2–4 換背景圖、做風格包時才讀（每一步怎麼做、常見的狀況）。
- `references/image-routing.md`：步驟 3 生成背景圖時才讀。
- `references/bg-worker.md`：步驟 3 要派工人同時生成時才讀。
- `references/music.md`：使用者要配樂（底樂、片尾配樂、生成、放自己的音樂）時才讀（照它做，不做本檔的步驟）。
- `references/reference-video.md`：使用者說「拆這支參考片」「分析這支影片怎麼剪」時才讀（照它做，不做本檔的步驟）。
