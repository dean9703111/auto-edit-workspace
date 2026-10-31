# 011 示意動畫：把 esim ep2 的做法搬進工作區（主代理的調查與提案）

## 使用者原話（2026-10-31 16:40）

> 我想要知道過去 esim ep2 專案，前面哪些很棒的動畫是如何製作的，理論上他模擬的才是我期待的情境動畫，這類型的可以透過在生成動畫前的稿件中，設計出合適的 prompt 說明鏡位腳本，然後 AI 執行方式嗎？這才是我認為完善的設計，並且能讓較普通模型完成任務的技巧，因為這些動畫是 subagent 呼叫 hyperframes 執行的

## esim ep2 當時怎麼做的（磁碟上查證）

來源：`~/Documents/external_project/agent-skills/video/surfshark_esim/esim_backup/hyperframes/`（72 段，render 到 `/Volumes/video/esim-ep2/動畫/`，成片 `/Volumes/video/esim-ep2/esim_ep2.mp4`）；規則在 `~/Documents/external_project/agent-skills/.agents/skills/hyperframes-overlay/`（SKILL.md、references/{worker-brief,design-rules,pitfalls,motion-recipes,casebook}.md）。

三層分工：

| 層 | 檔 | 內容 |
|---|---|---|
| 腳本（鏡位腳本） | `動畫點位表.md` | 共通規則（版型與安全區依講者位置分三種、視覺硬規則、時間與收尾、驗收五步）＋**每段一節**：版型、概念一句話，然後**逐句**寫「講到 #N → 畫什麼（指名插圖元件與狀態）→ 什麼動態（M.* 名稱）→ 相對秒數 → 位置／尺寸」，段尾怎麼收 |
| 零件 | `shared/illus.js`＋`illus.css`（556 行、28 個線條插圖元件，每個有狀態子元素：phone／phoneTripod／laptop／monitor／cloud／personBust／personTop／desk／cone／waveform／progress／energy／fileVideo／window／searchBar／badge／recPill／stopwatch／bookmark…；畫廊 `_kit/gallery.png` 深淺兩底）、lucide 121 支圖示、`hf-motion.js`（rise／pop／stamp／slide／draw／fill／accent／outUp／dim／stroke／maskUp／morph／edges／count）、`theme.css` | 弱模型只「選元件、擺位置、綁句號」，不畫圖、不發明動態 |
| 執行 | 每段一個 `sonnet-mechanic` 工人（**是 Sonnet**），prompt＝worker-brief.md＋點位表那一節＋2–3 段已定稿的參考段；從 init-project 建好的骨架改 `index.html`；驗收五步（precheck 截幀、audit.mjs 版面量測、check、snapshot、shots.mjs 講者合成）；主控不做段、只規劃／驗收／回收回饋 | 作者回饋輪 v1→v9；r7 一次 33 項回饋提煉成「違反任何一條都要重做」的共同規則 |

點位表一段的實例（seg03 試錄確認，#9–#14，全畫面＋子母畫面）：

> 版面：左右兩個面板（深色卡＋黃色標題列）：A「開拍前」x 120–690、B「開拍後」x 730–1300，y 150–860。
> A（#9–#11）：#9 面板 A 進場；#10「試錄一小段」：`phoneTripod`（landscape, rec）＋`recPill` 時間 00:00→00:05 跑動，下方一條短短的影片片段條長出來；#11「確認畫面、聲音」：兩列檢查項依序出現並打勾——「畫面」✓ T.at(11)+0.3、「聲音」（`waveform` 小）✓ T.at(11)+1.2，最後一個綠色「符合需求」徽章 T.at(11)+2.2。
> B（#12–#14）：#12 面板 A 變暗（0.45），面板 B 進場，上方一排 Take 膠囊「第 1 段」「第 2 段」「第 3 段」；#13「跑到手機旁邊播放影片」：俯視小房間——桌子＋`personTop`，人沿虛線走到手機旁（腳印逐個出現 1.2s），彈出正面 `phone` screen=play；#14：兩個檢查「動作」✓「聲音」✓，Take「第 1 段」變綠 ✓。停在完成態到段尾。

成片對應畫面：`scratchpad/w012/sheet-seg03.jpg`（主代理抓的 6 格）。

## 回答使用者的問題

**可以，而且 esim ep2 就是這樣做出來的，執行的是 Sonnet。** 關鍵不是模型，是三件東西同時存在：(1) 腳本具體到「哪個元件、哪個狀態、哪一句的第幾秒、放哪裡」；(2) 零件庫讓工人不用畫圖；(3) 驗收是量出來的（截幀、版面量測、講者合成），加上作者回饋累積成的硬規則。缺任何一個，普通模型就會做出「字卡感」的東西。

## 工作區現況與缺口

| | esim ep2 | auto-edit-workspace（010 階段 B 之後） |
|---|---|---|
| 腳本 | 動畫點位表（逐句指名元件） | 動畫分鏡（拍｜講到｜出現什麼｜動態語彙｜焦點｜音效）＋預設拍型 — **缺「插圖元件」與「位置」欄，缺逐句的具體度** |
| 動態語彙 | hf-motion M.*（14 個） | v2 P.*（45 個具名動作，更完整） ✓ |
| 零件 | illus.js 28 個示意插圖＋狀態 | **沒有**；只有 icons.json 圖示與情境模板的卡片 |
| 執行 | 工人從骨架自由組裝 | 工人只能填模板（x-*.html）— 這是「有字卡感」的根因之一 |
| 驗收 | precheck／audit.mjs／shots.mjs 講者合成 | audit（含分鏡對齊）、qc storyboard／observe、speakerBox ✓ |
| 規則 | hyperframes-overlay 的 design-rules／pitfalls／casebook（作者 33 項回饋） | style.md＋USAGE-reference R7／R8；**缺 ep2 r7 那批「示意」規則** |

## 提案：加第三條路「示意動畫」（與字卡、情境模板並存）

1. **零件**：把 `illus.js`／`illus.css` 搬成 `shared/template/kit/illus.js`／`illus.css`（作者自己的程式，直接搬；顏色改吃 brand token，亮／暗兩套底色），`qc.mjs gallery` 或 build `--gallery` 產出畫廊圖給弱模型與使用者看；lucide 圖示已有 icons.json。
2. **腳本**：動畫分鏡表加兩欄「插圖元件（狀態）」「位置（區域名或 x–y）」；SITUATIONS §3 加「示意動畫」列（口播在描述具體動作／物件／流程時首選，例：手機、電腦、雲端、人走動、時間流逝）；BEATS.md 加「示意動畫拍型」與「元件清單」節；分鏡由弱模型照講稿寫、停點 ③ 人確認（這就是使用者說的「生成前的鏡位腳本」）。
3. **執行**：`auto-edit-motion` 加「示意動畫」分支：工人從 `custom/x-scene.html` 骨架（區域、theme、P.*、illus 已載入）照分鏡逐拍組裝；派工 prompt＝BEATS.md 該節＋分鏡表那段＋2 段參考（ep2 seg03、seg13 的做法改寫成 v2 語彙放 `shared/template/custom/x-scene-example-*.html`）。
4. **驗收**：audit 分鏡對齊（已有）＋ 元件白名單（分鏡表寫的元件要在 illus 清單）＋ qc storyboard 每拍截圖＋ speakerBox 合成檢查（已有 qc speaker）。
5. **規則**：從 hyperframes-overlay 的 design-rules／pitfalls／casebook 提煉「示意動畫」專屬的硬規則進 style.md 與 USAGE-reference（深色實心底板、字只當標籤 ≤ 10 字、主角是圖、先有節點再畫線、後出現的元素不擠壓既有元素、每幕完成態 ≥ 0.6 s…）。
6. **基準測試**：`projects/範例` 就是 esim ep2 的前 2.5 分鐘，同一份講稿；ep2 的 seg01–seg13 點位表與成片都在。用 Sonnet 工人照新流程做 s03／x01／x05 對應的三段，和 ep2 的 seg03／seg05／seg09 並排給使用者看，就能判斷「普通模型＋鏡位腳本」有沒有到位。

工作量估：零件搬移＋畫廊 0.5 人日（004 或 003）、分鏡表擴欄＋BEATS／SITUATIONS／Skill 0.5 人日（001）、x-scene 骨架＋兩段參考改寫 1 人日（003 或 Opus 工人）、audit 元件白名單 0.2（003）、Sonnet 基準試做三段 0.5。合計約 2.5–3 人日，排在 010 階段 B 的 003 模板交件之後（kit/ 不能同時改）。

## 風險與取捨

- ep2 是 9 版、33 項回饋才到位；規則要先搬，不然第一版一定被退。把 casebook 的「esim-ep2 r7」整節搬成測試能抓的規則（字級、底板、元件不擠壓、完成態停留）。
- 自由組裝比填模板更容易破版：audit 的版面量測（最右緣、底線、重疊）要在工人自驗裡強制跑，照 ep2 的五步。
- 亮色主題：ep2 全是深色線條插圖，畫廊有淺底版本（元件本體仍深色），亮色主題可直接用。

## 補充（2026-10-31 16:55，使用者：「但很多時候這些素材不在，需要先判斷是否有素材，沒有就建立，可能是 SVG 方案」）

零件庫永遠不會齊（ep2 的 28 個元件只覆蓋「手機錄影」這個題目）。流程要有**素材判定 → 缺的就建**這一步，而且建出來的東西要和既有元件一個風格，否則畫面會雜。

### 素材判定（分鏡之後、生成之前；弱模型做，停點 ③ 一起確認）

每段示意動畫在 `work/storyboard.md` 的動畫分鏡表下面多一張「素材清單」：

| 元件 | 來源 | 怎麼來 |
|---|---|---|
| phoneTripod（rec） | 畫廊 ✓ | `data-illus="phoneTripod" data-screen="rec"` |
| 檔案夾＋加號 | 圖示組合 | lucide `folder`＋`plus` 放進 `.il-chip`（icons.json 已有 121 支） |
| 路由器 | **新建 SVG** | 規格：`router`，建議尺寸 220×120，狀態 `.il-led`（綠／紅），描述：橫式機身＋兩根天線＋前面板三顆燈 |

來源只有三種，照這個順序選：① 畫廊裡有 → 直接用；② lucide 圖示（單個或 2–3 個組合在卡／膠囊裡）能表達 → 組合；③ 都不行 → 新建 SVG。相片、背景、質感圖不走這條（那是 mmx／codex 生圖的事），示意插圖一律向量線條，才和既有元件一致。

### 新建 SVG 的做法（讓普通模型也能造出一致的零件）

1. **風格契約** `shared/template/kit/illus-style.md`（從 illus.js 的通則提煉）：線條圖、描邊 4／3／2 px 三級且 `vector-effect="non-scaling-stroke"`、圓角 8–16、只用 rect／circle／line／path（path 點數少）、顏色只用 `--il-*` token（主體／內層／描邊／黃／紅／綠）、viewBox 貼齊外框、狀態用 `.il-<狀態>` 子群組（預設 opacity 0）、不用漸層／濾鏡／光暈／文字（標籤由 HTML 寫）、尺寸比照清單的建議尺寸。
2. **掛載點**：`ILLUS.register(name, fn)` 或 `data-illus-src="illus-local/router.svg"`；專案自己的元件放 `projects/<專案>/work/hyperframes/illus-local/<name>.svg`（AI 可寫），`shared/template/kit/illus/` 是作者定稿的共用庫（只有作者說「收進去」才搬）。
3. **誰造**：主代理派一個工人（Sonnet 可以；複雜的物件給 Codex，一次一個）照素材清單那一列的規格寫 SVG；工人的 prompt＝illus-style.md＋那一列＋畫廊裡最像的 2 個元件原始碼當參考。
4. **檢查**：`node shared/template/tools/media.mjs illus-lint --project`（或併進 audit）：描邊寬只在 {4,3,2}、顏色只在 token、沒有 `<image>`／filter／gradient／text、viewBox 與建議尺寸比例一致、狀態群組存在；再把新元件連同畫廊既有元件拼成一張 `work/素材清單.jpg`（同底色、同比例）給使用者在停點 ③ 一起看，風格不合就退回重造。
5. **升級**：一支影片做完，`work/illus-local/` 裡被用到且作者點頭的元件，由作者決定要不要搬進 `shared/template/kit/illus/`（規則 1：shared/ 作者才能改）。

### 對 011 派工的影響

- 第一棒（搬庫）加：`ILLUS.register`／`data-illus-src`、`illus-style.md`、`illus-lint`。
- 第二棒（骨架與流程）加：storyboard Skill 的「素材清單」表與判定順序、motion Skill 的「缺的先造再組裝」步驟、素材工人派工模板、`work/素材清單.jpg` 的產生。
- 基準測試時刻意挑一段畫廊沒有的物件（例：Wi-Fi 路由器、ExFAT 記憶卡），驗證「造 SVG → lint → 拼圖 → 組裝」整條路。
