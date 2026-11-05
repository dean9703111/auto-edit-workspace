# Tasks: 011 示意動畫（illustrated beats）

**Brief**：`brief.md`（含文末「補充」：素材判定與新建 SVG）　**契約**：`specs/contracts/illus.md`
**記號**：`[x]` 做完（附驗證）；`[ ]` 沒做、交給誰。

## 第一棒：搬庫（2026-10-31，主代理派工；本棒不改 scene.css／scene-motion.js／custom／scenes／tools 既有檔，不 commit）

### 做了什麼

- [x] **T101** `shared/template/kit/illus.js`：從作者 agent-skills repo 的 esim ep2 `shared/illus.js` 搬（68 份複本 md5 相同）。20 個元件、8 種螢幕狀態與所有 `.il-*` 子元素原樣；`data-illus` 宣告式用法與 `ILLUS.mount` 保留。
  - 顏色常數全部改 `var(--il-*)`；personTop 的寫死黃、cone 的淡填色也改 token；主色底上的符號（play 三角、badge warn 的驚嘆號）從 BODY 改 `--il-on-accent`（＝`--brand-ink`，主色換成深色時仍看得到）；字型屬性改 `var(--font-cjk, sans-serif)`。
  - 驗證：把 token 換回原色碼後，73 組 opts（每個元件每個狀態）的輸出和來源逐字相同（`scratchpad/scripts/parity.mjs`，0 個不同）。
- [x] **T102** `kit/illus.css`：`.il` 樣式＋10 個 `--il-*` token。亮色接 `--sc-card-solid`／`--sc-plate`／`--sc-ink`／`--sc-mute`／`--brand`／`--brand-ink`／`--sc-warn`／`--sc-good`；暗色（`:root[data-theme="dark"]`）主體接 `--sc-card-solid`、描邊接 `--v2-ink`，內層／次要線／tone b 自己給值。亮色主題元件本體仍是深色。對照表見契約 §3。
- [x] **T103** 掛載點（補充需求 1）：`ILLUS.register(name, fn)`（名稱 camelCase，不能蓋內建元件與方法）；`data-illus-src="illus-local/<name>.svg"`（路徑相對主合成 index.html，專案元件放 `work/hyperframes/illus-local/`）。選「mount 時同步讀檔」：理由與實測在契約 §4（promise 版 HyperFrames 不等；build inline 要改寫工人的 x 檔）。
  - 驗證：臨時 HyperFrames 專案（runtime 0.8.223）子合成裡 `data-illus-src` 的 `.il-led` 在 script 執行時已存在；6 個時間點亂序／順序 seek 的 opacity 相同；`hyperframes snapshot` 兩組 PNG md5 逐張相同；errors、cueErrors 都是空的。
- [x] **T104** `ILLUS.mount` 改成「掛過的跳過、`{force:true}` 才重畫」：同一份文件有多個子合成，ep2 的「每次重畫」會把別段已綁 tween 的子元素換掉。讀不到的 `data-illus-src` 只報一次 `console.error`。
- [x] **T105** 畫廊 `kit/illus-gallery.html`：兩欄 iframe（本檔 `?theme=light`／`?theme=dark`，主題開關和完成影片一樣在 `<html data-theme>`），20 個元件、77 格（每個螢幕狀態、opts 變體與 4 個「中途狀態」示範），每格標 `data-*` 寫法、每組標建議尺寸與子元素 class。file:// 直接開也能看。
- [x] **T106** 截圖 `kit/illus-gallery.jpg`：1920×10876、1.66 MB。重截用 `node dev/tools/illus-gallery-shot.mjs`（HyperFrames 的 chrome-headless-shell `--dump-dom` 量高度 → `--screenshot` → ffmpeg 轉 jpg；dev/README 已加一列）。
- [x] **T107** 風格契約 `kit/illus-style.md`（補充需求 2）：素材判定順序、檔案與掛載、規則表（標出 lint 會查的項目）、10 個 token 的用途、router 220×120 範例（狀態 `.il-led`、`.il-warn`）、lint 的呼叫方式。看 HyperFrames 實際截圖後加了一條「細長零件畫成有填色的窄形狀」（亮色主題的淺底上，單獨一條白線會看不見；router 的天線從 line 改成 polygon）。
- [x] **T108** `tools/lib/illus-lint.mjs`（補充需求 3）：純函式 `lintIllusSvg(svgText, { name, size, states })`，回傳 audit 格式的 finding；規則表在契約 §6。零相依（自帶極簡 XML 樹，處理描邊寬從 `<g>` 繼承）。
- [x] **T109** 測試 `dev/tests/illus.test.mjs`：9 個測試。Node：20 個元件 viewBox 與子元素、螢幕狀態開關、只用 token＋描邊 4/3/2 non-scaling、register 規則；lint：範例 0 則＋3 個不合格樣本；瀏覽器（HyperFrames 的 Chrome，http 送頁、`--dump-dom` 取結果）：20 個元件都有 svg 且有大小、除 cone（只用主色）外每個元件兩個主題的 fill／stroke 不同、主體／內層／描邊等於來源 token 的計算值、主色＝`--brand`、`data-illus-src` 同步掛上、mount 不重掛、讀不到只報一次。
- [x] **T110** 文件：`specs/contracts/illus.md`；`NOTICE.md` 加一行來源；本檔。

### 沒做（交給誰）

- [x] **T111**（002）`KIT_LINKS` 加 `kit/illus.css`（scene.css 後；主合成、`--gallery` 預覽頁、custom 預覽頁共用）；三處 head 在 scene-motion.js 後加 `kit/illus.js`；`build.mjs` 複製 kit 略過 `illus-gallery.html`／`.jpg`／`illus-style.md`。驗證：`build.test` 新案例（head 順序、kit 只有 illus.js／illus.css、custom 預覽頁）。
- [ ] **T112**（002）`media.mjs illus-lint --project`：掃 `work/hyperframes/illus-local/*.svg`，size／states 從 storyboard 的素材清單讀，呼叫 `lintIllusSvg`；`work/素材清單.jpg` 拼圖。
- [x] **T113**（003；做法與驗證見第二棒 T113a–d）`custom/x-scene.html` 骨架：script 第一行 `ILLUS.mount(root)`；audit 的元件白名單（契約 §5.6）與 lint 接線；量容器邊緣時留描邊外擴 2 px；`[ILLUS] 讀不到…` 現在是 ⚠ 頁面 JS 錯誤，建議升成那一段的 ✖（契約 §5.7）。
- [ ] **T114**（001）storyboard Skill 的「素材清單」表與判定順序、motion Skill 的「缺的先造再組裝」、BEATS／SITUATIONS 的示意動畫列、素材工人派工模板（prompt＝illus-style.md＋那一列＋畫廊最像的 2 個元件原始碼）。
- [ ] **T115**（作者）`shared/template/kit/illus/` 共用庫：專案做完、作者點頭才收（規則 1）。本棒沒建這個資料夾。
- 沒做：ep2 的 lucide 121 支圖示（工作區已有 icons.json）、`hf-motion.js`（已由 v2 `P.*` 取代）、`qc.mjs gallery`（派工改成靜態頁）。

### 要注意

- brief 說「28 個元件」：實際是 20 個元件＋8 種螢幕狀態。
- 亮色的 body／inner 會跟著 theme.css 變（目前是淺色版的 #141414／#2A2522，不是 ep2 的深藍）；測試比的是「等於來源 token」，theme.css 再改不會紅。
- `data-illus-src` 在 file:// 讀不到（同步 XHR 被擋）：畫廊、`--gallery` 的 custom 預覽頁直接開檔時看不到專案元件；preview／snapshot／render／audit 都正常。

## 第二棒：骨架、流程、檢查（2026-10-31 16:10 主代理派工；三條線並行，彼此不改同一個檔，不 commit）

共同規則：只讀 `brief.md`（含文末「補充」）、`specs/contracts/illus.md`、`kit/illus-style.md`、`kit/illus-gallery.jpg`（用 Read 看圖）、`shared/template/BEATS.md`、`specs/010-motion-v2/design-system.md` §11／§14；ep2 原檔在 `~/Documents/external_project/agent-skills/video/surfshark_esim/esim_backup/hyperframes/`（`動畫點位表.md` 108–179 行是 seg03／seg13；`seg03-試錄確認/index.html`、`seg13-本集大綱/index.html`）只借做法，不複製 ep2 的 hf-motion.js／srt-cues.js。測試暫存用 `TMPDIR=/Volumes/auto-edit-tmp`。給弱模型看的訊息（audit／check／Skill）只能指到 `shared/` 或 AGENTS.md，不能指到 `specs/`。

### 003（T113＋參考範例）
- [x] **T113a** `shared/template/custom/x-scene.html` 骨架：檔頭六小節照 `x-process.html`；區域用 design-system §2 的具名區域（`P.region`）；script 第一行 `ILLUS.mount(document.getElementById('<root id>'))`，再 `gsap.timeline`、`SceneMotion`；`const ENTER = P.prev() === 'fullscreen' ? 'swap' : 'grow'`；`P.sfx`；結尾 `P.end()`。`DATA` 區放「元件清單」（每項：id、`data-illus`／`data-illus-src`、狀態、區域或 x–y、標籤 ≤ 10 字）與「拍」（每拍：`#N@詞`、做什麼），弱模型只填這兩個。
- [x] **T113b** 兩段參考 `custom/x-scene-example-rec.html`（ep2 seg03：手機上腳架、試錄、看回放確認）與 `custom/x-scene-example-outline.html`（ep2 seg13：本集大綱四站）：照 ep2 點位表的拍，改寫成 v2 語彙與 illus 元件；各附 `specs/010-motion-v2/beats/x-scene-example-*.md` 分鏡（表頭固定六欄＋「插圖元件（狀態）」「位置」兩欄）。自驗照 `worker-brief-custom.md` 三關＋snapshot 看圖；完成態 ≥ 1.5 s。
- [x] **T113c** audit：`[ILLUS] 讀不到` 升成那一段的 ✖（契約 §4、§5.7）；分鏡表「插圖元件」欄白名單（契約 §5.6：20 個內建、`register` 過的、`illus-local/*.svg` 有檔）；量容器邊緣留描邊 2 px（§5.5）；BEATS §3「段起點」當隱含的一拍（W4 回報）；語彙表補「游標移動 → P.morph」。`node --test dev/tests/audit.test.mjs dev/tests/motion.test.mjs dev/tests/illus.test.mjs` 全綠。
- [x] **T113d** 從 ep2 的 hyperframes-overlay（`~/Documents/external_project/agent-skills/.agents/skills/hyperframes-overlay/` 的 design-rules.md、pitfalls.md、casebook.md「esim-ep2 r7」）提煉示意動畫硬規則（深色實心底板、字只當標籤 ≤ 10 字、主角是圖、先有節點再畫線、後出現的元素不擠壓既有元素、每幕完成態 ≥ 0.6 s…）：能量的進 audit（✖／⚠ 各寫清楚）、量不了的交 001 寫進 style.md「示意動畫」節（給 001 一份清單，附原文出處）。

- 003 做了什麼（2026-10-31）：
  - T113a：`x-scene.html`（前綴 `xsc`、句號 181–186）。DATA 1＝body 裡的元件清單（每項一個 `.xsc-it`：`data-illus`＋狀態、left／top、≤ 10 字標籤；常駐的加 `xsc-pre`）；DATA 2＝拍（`[T, {in／state／move／count／line／check／focus}]`）。引擎：主卡 `P.region('panelTop')`、彈出 → 換狀態（`.il-content`／`.il-rec`…，＋0.15）→ 漣漪 → 描線（＋0.7，節點進場完才描）→ 聚焦；最後一拍＋2.0 回均衡。檔頭「這支沒有圖示」（主角是插圖元件）。
  - T113b：`x-scene-example-rec.html`（`xscr`，191–197：腳架上的手機 → 開錄＋計時 → 人走到鏡頭前 → 回放 → 聲音波形 → 符合需求）、`x-scene-example-outline.html`（`xsco`，201–207：四站＋三條線，最後一站換成打勾）；分鏡 `specs/010-motion-v2/beats/x-scene-example-{rec,outline}.md`（8 欄＋第 0 列段起點＋`#### 插圖清單`）。驗證：三支同一個專案 `--check` 0 ✖、audit 3 段 0 ✖ 0 ⚠；完成態 2.4／2.4／2.7 秒（D − 最後一拍 − 2.5）；snapshot 看過（節點先到、線後描、聚焦一次一個、完成態左右平衡）。畫廊 `index.html` 加三張卡、`preview/x-scene*.html` 已產生。
  - T113c：`tools/lib/audit-illus.mjs`（新）＋`audit-page.mjs`（`.il>svg` 外擴 2 px、目標標 `il`／`line`）＋`audit-beats.mjs`（8 欄表頭、段起點列、`#### 插圖清單`（舊名素材清單也認）、語彙 46 個含「游標移動 → P.morph」、回均衡也接受 `P.dim`）＋`audit.mjs` 接線。新規則：✖ illus-name／illus-src／beats-illus／illus-list、`[ILLUS] 讀不到` 升成那一段的 ✖；⚠ illus-label（> 10 字）、illus-align（完成態中線差 1–8 px）、illus-blink（亮滅 > 1 次）、illus-line-first（元件還在進場就描線）。契約 `specs/contracts/cli-003.md` §2.3d 補、§2.3e 新。
  - 測試：audit.test 加 6 個「011：」測試；icons.test 的不放圖示名單加 x-scene 三支；docs-allow.json 拿掉三條 T12。
- 003 → 001（T114d 寫進 `shared/style.md`「示意動畫」節；audit 量不到的硬規則，出處是 `~/Documents/external_project/agent-skills/.agents/skills/hyperframes-overlay/references/` 的檔名:行號）：
  1. 疊加層的元素一律深色實心底；強調靠框色、字色，不靠亮色填滿（剪映輸出後亮色底邊緣會浮白暈）（pitfalls.md:222、231）。
  2. 後出現的元素不擠壓既有元素：最終版面先排好，之後才出現的打勾框一開始就是空框佔位（design-rules.md:58；casebook.md:487）。
  3. 會放大（scale > 1）的元素，用放大後的尺寸預留位置，鄰居的間距從預留盒量（pitfalls.md:361）。
  4. 經過或圍繞元件的線離元件 ≥ 16 px；連接兩個區塊的箭頭兩端貼齊區塊邊（design-rules.md:96）。
  5. 同欄相鄰節點的間隙全部相等（節點 ≥ 44 px）（design-rules.md:136）。
  6. 不用乘號「×」（字身偏小、浮在上面）（design-rules.md:20）。
  7. 不要先掛空底板再等內容：有底色或框的容器跟著內容一起進（pitfalls.md:149–153）。
  8. 一幕 3–5 個重點，只往上加或局部變化；抖動／閃紅／脈衝每幕最多一次（design-rules.md:50）。
  9. 同一件事只說一次：裝置的狀態畫在它自己的螢幕或路徑上，不再加一行提示字；講解沒講的裝飾不加（design-rules.md:99；casebook.md:507）。
  10. 畫面文案忠於講解，不自編數字或引言（motion-recipes.md:75）。
  11. 示意 UI 先給完整畫面 0.8–1.5 秒讓觀眾定位，再推近重點（design-rules.md:97）。
  12. 運鏡先數次數：一段裡慢推 ≤ 2 次、每次 ≥ 2 秒、不先拉遠再推近（casebook.md:513）。
  - 已由 audit 量的（不用再寫成文字規則，style.md 一句帶過即可）：標籤 ≤ 10 字（design-rules.md:9）、同列同中線（design-rules.md:87）、不閃爍（casebook.md:486）、先有節點再畫線（design-rules.md:11；motion-recipes.md:156）、描邊外擴 2 px；完成態、段尾停留、字幕區、子母畫面原本就量。
  - 和我們不同、001 決定要不要寫：ep2 只動 transform／opacity（worker-brief.md:41），我們的「游標移動」＝`P.morph` 動 left／top（慢的尾巴可能一格一格跳；要改成 x／y 會和聚焦的 lift 打架，先記 003 待辦）；ep2 字級下限 主文字 52／標題 72（design-rules.md:51），我們照 style.md。
  - BEATS.md 請 001 補：§2 標題改「46 個具名動作」，「鏡頭回正」後加一列 `| 移動 | 游標移動 | 游標或小物件沿直線移到目標再停（不過衝） | `P.morph`（left／top，帶 from） | 介面操作的點按、示意動畫裡人走到某處 |`（audit.test「parseBeatSheets…」比對 VOCAB 和 BEATS §2，現在只差這列）；§5.2 拍型 S 第 2 列「−0.3 描線」改「彈出（物件 k）；＋0.7 描線」（骨架是節點進場完才描）。
- 003 收尾掃描改到的拍型文字（2026-10-31；BEATS／SITUATIONS 是 001 的檔，請照下面改）：
  - 標題逐字上浮：20 支 custom 統一在開場後 0.5 s（x-prompt 照 H 是 0.62；換卡不換景、長出兩種開場都和主卡算同一個新元素，不會有密度 ⚠）。BEATS §3 A／B／C／D／E／F 與 §5.2 S 第 0 列的「＋0.35」「＋0.42」請改「＋0.5 逐字上浮（標題）」；H 維持「＋0.5 圖示描線；＋0.62 逐字上浮」。
  - 「走過」（`P.spot` 的 `done`）、「退焦 → 1 亮回來」、「逐字彈出」現在亂序 seek 0 差（kit 的 `V2.REST`），BEATS 照寫即可，不用再加「縮小 0.96」之類的繞法；x-architecture 已改回「走過」。
  - 分鏡表（`specs/010-motion-v2/beats/`）我改了：x-architecture 拍 5「＋0.8 聚焦（電腦）；走過（手機）」、拿掉 x-architecture／x-branch／x-versus 備註裡「亂序 seek 反鋸齒」的理由、x-scene 兩支範例第 0 列「＋0.5」。
  - 已看過 001 改好的 E（−1.2 開始滾）、C（收＝拍 4＋2.6）、D（收＝最後一條＋2.5，兩列只抄一列）：和 audit 的停留、段尾規則一致，audit 不用再改。退焦在聚焦組裡用 `P.spot` 的預覽態也算做到（`VOCAB_ALT`）。
  - SITUATIONS §3 動態欄建議一句：「custom 列只寫『照 BEATS.md §3 的 <拍型> 抄』＋這支和拍型不一樣的地方（例：x-ring 的弧寫『描線』），不列 P.*」。

### 002（T111 已派＋T112）
- [x] **T112a** `media.mjs illus-lint --project projects/<專案>`：掃 `work/hyperframes/illus-local/*.svg`，每檔呼叫 `lintIllusSvg`；`size`／`states` 從 `work/storyboard.md` 的素材清單表讀（欄：元件｜來源｜怎麼來；「新建 SVG」列寫 `規格：<name>，建議尺寸 W×H，狀態 a／b`），讀不到就只跑不需要 size 的規則並印 ⚠；輸出照 audit 的 ✖／⚠ 格式，結束碼 1＝有 ✖。
- [x] **T112b**（改名 `work/插圖清單.jpg`，標題 `#### 插圖清單 <段 id>`；舊名「素材清單」解析時也認）`work/素材清單.jpg`：素材清單裡用到的畫廊元件＋`illus-local` 新元件拼成一張（同底色、同比例、每格標名稱與來源；亮／暗各一列），用 HyperFrames 的 Chrome 截圖（照 `dev/tools/illus-gallery-shot.mjs` 的做法），`media.mjs illus-lint` 跑完順便產生（加 `--no-sheet` 可略過）。
- [x] **T112c** `dev/tests/media.test.mjs` 加：好檔 0 ✖、壞檔抓到、沒有 illus-local 時印「無」結束碼 0、拼圖存在且寬 1920。契約 §6 下面補 CLI 一節。驗證：五個案例（含 `readIllusList` 新舊標題）全過；契約 §6.1。

### 001（T114）
- [ ] **T114a** `auto-edit-storyboard` 步驟 5 之後加「素材清單」：每段示意動畫（x-scene）在動畫分鏡表下面一張素材清單表（brief 補充節的三欄表＋三種來源的判定順序，原文抄 `kit/illus-style.md` §1），停點 ③ 和分鏡一起確認；分鏡表表頭加「插圖元件（狀態）」「位置」兩欄（只有示意動畫段要填）。
- [ ] **T114b** `auto-edit-motion` 加「示意動畫」分支：步驟＝讀確認過的分鏡＋素材清單 → 缺的先造（派素材工人或自己畫，照 `kit/illus-style.md`）→ `media.mjs illus-lint` 0 ✖ → 看 `work/素材清單.jpg` → 從 `custom/x-scene.html` 骨架照拍組裝（參考 `x-scene-example-rec.html`、`x-scene-example-outline.html`）→ 三關自驗。
- [ ] **T114c** 素材工人派工模板 `.agents/skills/auto-edit-motion/references/illus-worker.md`：prompt＝`kit/illus-style.md` 全文＋素材清單那一列＋畫廊最像的 2 個元件原始碼（從 `kit/illus.js` 抄）＋驗收（lint 0 ✖、尺寸、狀態群組）＋回報格式（≤ 10 行）。
- [ ] **T114d** `BEATS.md` 加「§5 示意動畫」（拍型 S：場景骨架 → 物件逐個進 → 狀態切換 → 結果；元件清單怎麼寫）、`SITUATIONS.md` §3 加「示意動畫」列（講解在描述具體動作／物件／流程時首選；例：手機、電腦、雲端、人走動、時間流逝）、`style.md` 加「示意動畫」節（硬規則等 003 T113d 的清單）、USAGE.md 2.3 分鏡表格式加兩欄、AGENTS.md「剪好看」第 2 步補一句「示意動畫先判定素材（畫廊／圖示／新建 SVG）」。`docs.test` 全綠。
- [ ] **T114e** 等 W1–W4 回報後回填 BEATS §3（W4 的 G 比喻／H 提示詞／I 介面操作三個拍型草案；W1–W3 的照回報）、SITUATIONS §3 動態欄、USAGE-reference R7.5 三支描述、x-prompt 音效欄。

### 基準測試（三條線都交件、check-all 綠之後；主代理派 Sonnet 工人）
- [ ] 範例 s03／x01／x05 對應的三段改成示意動畫，其中一段刻意用畫廊沒有的物件（Wi-Fi 路由器或 ExFAT 記憶卡）走「造 SVG → lint → 拼圖 → 組裝」整條路；和 ep2 seg03／05／09 並排給使用者看。
