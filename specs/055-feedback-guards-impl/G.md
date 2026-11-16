# 055 包 G：文件

做了：Q1–Q7 的文件、k30（F2）、A–F 每條新檢查與新預設的說明。依據 A.md–F.md（程式現況），和 054／055 brief 不一樣的地方照報告寫。只改文件；`dev/tests/docs.test.mjs` 不用改（文件照程式改完就過）。

驗證：`node --test dev/tests/docs.test.mjs` 37／37 過（改之前 T30 直式字級下限不一致 1 個失敗）；`node setup/install-skills.mjs --check` ✓ 9 支 × 2 個 Agent 都連到正本。

## 改了哪些檔、哪幾條

### `shared/style.md`（規則和數字）

| 節 | 改了什麼 |
|---|---|
| 直式 | 文字最小 32 → **48 px**；縮放段寫字下限 38／52／57 → **57（全畫面 custom、內容設計、04 家族）／77（01 章節）／81（全幕版，新列）／86（fx 大字）**，不縮放的段 48；加「放不下縮文案」、`--review` 連模板段一起量、模板段的改法（Q3） |
| 直式 | fx：`portraitMinPx` 不到 48 的（22）`--check` ⚠ → 換同類（k1／C02） |
| 直式 | 錄影段：「一定要用 `moves` 推近」改成「一定要寫 `start`」；第一格上半黑底 > 10% ⚠（C10）；`start` 以外最多再動 1 次（C11） |
| 動畫視覺 | 聚焦「放大、亮框」改成只用明暗、不加框（Q6）；劃掉那條加 Q7-8（推翻、否定時劃掉前面的說法） |
| 節奏 | 進場時機加 N7（綁卡上最前面的詞，⚠「卡上的字比講的晚」）；條列進場加 Q7-9（一大群固定間隔冒到講到的詞）；去背那條加 C22（build 量閃動、2%、坐著 steady、站著換版面）；換卡加 Q7-10（新一組出現前一組退場或壓暗）；新條「換段不閃」（F：seam-flash、seam-cut，0.3 秒淡出） |
| 內容設計動畫 | 新小節「疊加段」（`text-heavy` 引用的 style.md「疊加段」）：Q7-4（一個大字或左右對比，> 24 字 ⚠）、Q7-1（最多擋一個字、最多一半，⚠ `matte-glyph`）、Q7-5（真實彩色標誌） |
| 版面 | 新段「完成態另外量的五條」：hcenter（Q7-2）、sibling-width（N2）、card-space（N1，30%／1.4 倍）、line-cross（C03，24 px）、text-wrap／text-cut（C04，≥ 120 px）；加 Q7-7（副標至少和大字同寬） |
| 字卡文字 | 新條 Q7-3（標籤和大字不重複同一個詞，模板 `--check`、設計 `dup-word`）；列舉那條加 Q7-6（1 2 3 編號、同寬、單欄、同一套圖示） |
| 螢幕錄影與圖片 | 新條 C17＋W7（捲動不慢放）；定格加 N8（> 2.5 秒沒標註 ⚠，慢放看起來停住 > 4 秒）；新條 Q7-12／C13（從頁首開始播，> 80 px）；個資加 C16（盤點筆記 `privacy`）；「講者縮到右下角子母畫面」改成橫式預設不放、要露臉寫 `"pip": true`（Q1）；連續圖片快切加 C18（3 張、≤ 2.5 秒 ⚠、`--autofix`）；子母畫面那條改成「寫了 `"pip": true` 的」；紅框多停 1 秒加 D3；新條「紅框的時機」Q7-13＋C14＋C15；運鏡拿掉「第一次至少在段起點 0.8 秒後（先看全景）」、改寫 `start`、直式 1 次（Q2、C11）；新條 C12＋W5（展示整頁不推近，85%）；慢推加「寫了 `start` 的不慢推」；新條 Q7-11（照片不加來源標示） |
| 音效 | 情緒點表 `turn` → `ding`（Q4）；新三條：D4（情緒點讓給動畫 `P.sfx`）、同一顆 3 秒內不連響、C19（兩顆疊在同一刻，0.4 秒）；每分鐘上限加「照實際出聲的算、列在『音效上限拿掉的』」 |
| 審查門檻 | 加「換段」「紅框」兩列 |

### 其他文件

| 檔 | 改了什麼 |
|---|---|
| `shared/template/REVIEW.md` | 「工具已經量的」補上 A–F 的新檢查（含 `--review`／`finish` 的換段、build 的去背閃動）、改完重量換段的做法與 `lib/seams.mjs --only`；講者小視窗 P0 改成「錄影段以外」、橫式 media 預設沒有不算問題（Q1）；新列「紅框」P1（每框兩張截圖，門檻引 style.md）；回報等級表 P0／P1 同步 |
| `shared/template/USAGE.md` | 2.6：手改情境檔自動平移與 ✖（k11）、finish 會量換段（F）；4.2 常見訊息加 12 列（D4、同一顆連響、C19、音效上限拿掉的、k7、k1、k15、N9 兩種、初剪後還留著、去背閃動、pip ✖）；「marks 被子母畫面擋住」的改法；4.3「錄影時要／不要露臉」；第 5 節開頭小視窗預設；5.3 範例改用 `start`、`pip` 列預設改「橫式 false、直式 true」、新 `start` 列、`kenburns` 列；5.5 運鏡列拿掉「段起點 0.8 秒內 ⚠」、加直式 1 次與 start；紅框列加 D3、C15、C14；5.6 加錄影段 8 種新 ⚠ 的改法、每框兩張截圖；6.2 加 N9。剪映草稿那一段沒動 |
| `shared/template/USAGE-reference.md` | R2.5 media 表：`pip` 預設、新 `start` 列、`kenburns`、`marks`；R2.6 media 欄位加 `pip`；R7.6 直式 font 32 → 48、新的一條列出 10 個新 audit 規則與刻意的寫法；R8 #5 加直式下限；「audit 抓得到」表補新規則 |
| `shared/template/BEATS.md` | §2「聚焦」：放大＋抬起、其他壓暗，不加框；要框寫 `{ glow: true }`（Q6） |
| `shared/template/SITUATIONS.md` | 版面表「子母畫面」、情境表「介面操作，有螢幕錄影」的小視窗欄：橫式 media 預設沒有（Q1，和新預設衝突的舊句子） |
| `.agents/skills/auto-edit-motion/references/design.md` | 語彙表「聚焦」加不加框；綁句加 N7；疊加段加 Q7-4、Q7-1（W8：先看講者框、放頭頂上方）；新「作者的品味」十條（Q7-2、3、6、7、8、9、10、5、11，N1、C03）；直式字級 38 → 57／48；大字用 `<br>`；「顏色寫死」標誌品牌色除外 |
| `.agents/skills/auto-edit-motion/references/design-kit.md` | `P.spot` 預設只做明暗、`{ glow: true }`；新節「工具標誌」（`shared/logos/ai/` 的 path＋`colors.json` 品牌色、排緊密置中、顏色寫死的處理） |
| `.agents/skills/auto-edit-motion/references/kit-syntax.md` | `P.spot` 參數加 `glow`、預設只做明暗 |
| `.agents/skills/auto-edit-screen/SKILL.md` | 步驟 1 筆記加 `privacy`（格式、錄影秒數／素材像素、完成判準）；步驟 2 加頁首開始（C13）；步驟 3 加紅框時機（Q7-13、C14、C15）、鏡位 `start`、展示整頁不推近（W5）、直式 `start`＋1 次、橫式預設不露臉；完成判準加錄影段 ⚠；自我核對的個資那條改成盤點時記 `privacy` |
| `.agents/skills/auto-edit-rough/references/ng-rules.md` | 範本加頭尾講稿外那一列（原因原文）；「剪」欄預設加頭尾講稿外 `[x]`、不寫待確認（Q5）；贅字那條加初剪後會列出；新第 3 節「初剪後再掃一次」三種 ⚠ 的做法（k25、k26） |
| `.agents/skills/auto-edit-rough/SKILL.md` | 退路表加兩列（初剪後還留著／開頭有講稿外的話；贅字）；「什麼時候讀 references」加第 3 節 |
| `.agents/skills/auto-edit-review/references/feedback-round.md` | 第 1 節：`begin --requests` 的描述寫進原話（F1）、版本多存手改情境檔與 `情緒點與剪輯.json`、只改這些也算改了、`use` 不還原 `moods`／`edit`（N10）；分類表新列 F2（講到畫面或聲音毛病就寫「建議改規則」，註明程式檢查／改預設／文件）；範本例子；finish 會量換段、每框兩張截圖（F、k19） |
| `.agents/skills/auto-edit-review/references/editor-requests.md` | 標籤「推近到操作區」改成先寫 `start`（和 Q2 衝突的舊做法） |
| `specs/contracts/check-json.md` | `items[]` 加 media 的 `pip`；`out.annotations` 的 `start`、`view.scale`；版本紀錄一列 |
| `specs/contracts/media.md` | `view.scale` 有 `start` 時的意思、`json.start` |
| `specs/contracts/canvas.md` | `minTextPx` 直式 32 → 48 |

## F（換段與預覽）

F.md 在最後一輪出現，已補：style.md「節奏」換段不閃＋「審查門檻」換段列、REVIEW.md（工具已經量的、重量換段、`lib/seams.mjs --only`）、USAGE.md 2.6 finish、feedback-round.md。k32（預覽多層影片對齊）沒有要改的文件：文件裡本來就沒有「預覽差一兩格」的說法。

## 找不到地方放、或和程式對不上的

- `auto-edit-storyboard/references/director.md` 的 W3（因果順序）：055 不做（brief：作者沒選），沒寫。
- 工具標誌的品牌色會讓內容設計段印「顏色寫死」⚠（`audit-illus` 不認標誌），design.md 原本規定這條要修到沒有：文件寫成「只有標誌色時不用改，reports 寫一行」。要根治得在 audit 放行 `data-logo` 底下的 fill（程式，沒做）。→ 主代理已做：`audit-illus.mjs` 的 `colorLiterals` 跳過 `data-logo` 元素裡的 `<svg>`、寫了 `data-logo` 的 `<svg>`（測試在 audit.test.mjs「顏色寫死」那條）；design-kit.md、design.md 改成「寫 `data-logo` 就不會報」。
- `MEDIA_FIELDS`（`--list`）和 USAGE-reference R2.5 的 `moves` 都寫「dur 預設 1 秒」，程式 `MOVE.dur` 是 1.5（B.md 也提過）；USAGE.md 5.5 寫 1.5。本來就這樣，沒改。
- `specs/contracts/media.md` 寫 `view` 只在直式有，程式橫式也有（`landscape: true`），是 055 之前就這樣，只補了 `start` 的部分。
- `qc.mjs` F8 還沒改用 `isShortCaption`（C.md），文件不受影響。
