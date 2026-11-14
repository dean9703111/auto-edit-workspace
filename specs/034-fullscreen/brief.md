# 034 全螢幕（shotcraft 第二輪評估）

來源：作者 2026-11-14 貼 https://github.com/Vincentwei1021/video-shotcraft，說「我想要知道這個裡面有哪些是適合放到專案裡面的，有時我們也會有全螢幕的可能性，仔細評估並設計」，接著說「完成後要全方位測試，並且清單示意圖、README、官網哪些都要改」。

上一輪（2026-11-02，記憶 project-shotcraft-port-2026-11）評估 124 張卡、做了 20 支原型（頁面 https://claude.ai/artifact/QH83yQDapQZdqZNaCwUMd2），作者還沒回；其中講者推近、斜躺擺平已經在 023 用別的方式做進來，其他 18 支照舊待決定，不在這一輪範圍。shotcraft 從 11-02 之後沒有新卡（只有 bug 修正）。

## 評估：全螢幕缺什麼

工作區的「全螢幕」有三種：① 只有聲音（旁白）的段，04 家族與 custom 自動換全寬；② 有講者但這段寫 `"pip": false`；③ 全幕（01 章節、不透明 fx）。講者不在畫面上時少了三樣東西：

| 缺口 | 現況 | shotcraft 補什麼 |
|---|---|---|
| 1. 疊加字卡沒有全畫面版 | 15 金句、09 QA、06 一般字卡、11 總結都是疊在講者上的透明卡，旁白段 build ✖「這裡沒有講者，要換成全畫面的模板」；能換的只有 07 → `x-point` | paper-title-card（逐詞壓印上紙）、card-flip-reveal（翻面）、brace-expand（花括號）、outro-group-photo-launch（全片合影） |
| 2. 全螢幕段之間只有一種接法 | 前後都是全畫面＝「換卡不換景」；有講者時切回講者會重置注意力，旁白片一整串都長一樣 | bottom-push-stack-wipe（上推）、shot-transitions 穿窗 |
| 3. 情緒點沒有畫面 | 023 的講者爆衝推近（`moods[].zoom`）在沒有講者的那一刻整個拿掉 | crash-zoom-punch／rhythm-interrupt（推整個畫面） |

另外兩支全螢幕寬度才放得下的內容：scroll-brake-moves（長清單急剎）、canvas-materialize-moves B（提示詞長出樹）。

原型（scratchpad `fs-port/proto/`）：fq-quote、fq-qa、fq-brace、ft-transitions、fm-punch、fr-recap、fc-scroll-brake、fc-prompt-tree。設計卡（不做原型、這輪不實作）：截圖接力（word-relay-filmstrip）、前後拉桿（before-after-slider-scrub）、本集地圖（basic-3d-scene 改平面＋wall-reveal-moves）。

124 張卡這輪的判定：全螢幕原型 9、設計卡 4、上次原型待決定 21（18 支原型）、已做 2、已有 5、部分已有 22、之後再看 16、不適合 45。

## 定案（我先定，作者可以推翻）

| # | 題目 | 定案 | 理由 |
|---|---|---|---|
| 1 | 疊加字卡在旁白段怎麼辦 | build 自動換成同一個模板的「全幕版」（像 04 家族自動換全寬），plan.json、分鏡、剪輯台照舊寫 15／09／06／11 | 弱模型不用多學名字；舊專案不用改；`--check` 那一段寫「全幕版」 |
| 2 | 有講者的片子能不能也用全幕版 | 可以：那一段寫 `"full": true` | 作者說「有時我們也會有全螢幕的可能性」 |
| 3 | 全幕版的樣子 | 15＝逐詞壓印的大字金句（沒有主卡）；09＝一張問題卡翻面成答案；06＝`{ 名詞 }` 花括號彈開＋定義打字；11＝大圓圈打勾＋兩行大字 | 照原型；11 只有一句話＋圖示、沒有清單，回顧牆（fr-recap 原型）不併進 11，留到之後做成新模板 |
| 4 | 回顧牆（fr-recap）要不要用這一集的真實畫面縮圖 | 這輪不做回顧牆；之後做成新模板時再決定（真實縮圖要 build 先截前面幾段的完成態，多一次 render） | 11 沒有清單可放；截圖會讓 build 變慢 |
| 5 | 全螢幕段之間的新接法 | 「上推」：前後都是全畫面、後一段是新的小節（`sections`）開頭時 build 自動用；其他照舊換卡不換景。不新增 plan.json 欄位 | 小節換了才需要「翻頁」的感覺；自動判斷不用 AI 寫 |
| 6 | 穿窗 | 這輪不做（要知道前一段焦點元素的位置，build 拿不到）；設計卡留著 | 成本高 |
| 7 | 沒有講者時的情緒點 | `moods[].zoom` 那一刻被不透明的全畫面段蓋住：改推整個畫面 1.1 倍（0.12 秒推進、停 0.55 秒、0.6 秒回正），推向講到的那個元素，字幕與角標不動；每分鐘上限照講者推近 | 和講者推近同一條規則，只是推的東西不同；推向哪裡是作者 2026-11-14 驗收單選的（punchAim=target） |
| 8 | 新模板 | `x-scroll-brake`（長清單急剎）、`x-prompt-tree`（提示詞長出樹） | 全螢幕寬度才放得下 |

## 實作清單

- kit：`P.flip`（翻面）、`P.press`（逐詞壓印）、`P.brace`（花括號彈開）；畫面推近、上推不進 kit，main.mjs 直接動 host 的 CSS 變數
- scenes：15、09、06、11 的 template.html 加 `@style-full`、`@body-full`、`@timeline-full`（三節都寫了就算有全幕版，scene.json 不另外加欄位）
- plan.mjs：`fullCards`（段落解析後、接縫前）；`assignTransitions` 加 `push`；`moodZooms` 加畫面推近
- main.mjs：全幕版的 host（不透明底、z 30）、上推、畫面推近
- custom：`x-scroll-brake.html／.fill.json`、`x-prompt-tree.html／.fill.json`
- 文件：style.md「全寬」、SITUATIONS §2／§3／§4、BEATS 語彙表、USAGE-reference 欄位、CONTENTS、README、官網、情境庫 index.html、gallery 截圖
- 測試：單元（全幕版切換、上推、畫面推近）、examples.test、custom-check、npm test、check-all --full

## 實作紀錄

### 和定案不一樣的地方（作者可以推翻）
- 上推的那一頁裡，模板照「換卡不換景」進場（`P.prev()` 還是 `fullscreen`）：整頁往上推的同時主卡由下擦開。原型是內容跟著底色一起上來、不另外進場；要照原型得每支全畫面模板多一個 `push` 分支，這輪不做。
- 上推只加接觸影（新的一頁上緣一道陰影），原型的受光邊、縱向動態模糊沒做（看不太出來，又要多一層 svg 濾鏡）。
- 畫面推近推向「講到的那個元素」（作者驗收單選 target），但沒照選項說的在 moods 多寫目標選擇器、也沒讓 build 先開瀏覽器量：改成播放時自動找。那一段的時間軸裡，詞開口前 2.5 秒到後 0.25 秒內最後開始的動作（不算 0.01 秒以下的 set、淡出到 0 的、蓋住大半個畫面的容器），它的元素中心就是推近的中心；找不到推內容區中心（960, 470）。位置用 offsetLeft／offsetTop 量（不受元素自己的動畫影響），量的時候段還沒顯示就先打開再還原；亂序跳格截圖一致。AI 不用多寫東西，build 也不用多一次 render。段有講者小視窗（04 家族、custom 有 pip）時不推，只推整段沒有講者的。
- 全幕版的金句逐詞壓印照固定節拍（每詞 0.14 秒），不綁每個詞講到的時刻；斷詞用瀏覽器的中文斷詞（Intl.Segmenter），plan.json 不用寫「｜」。
- 06 全幕版的名詞從正文的全形冒號拆（「名詞：定義」）；沒有冒號時括號裡放標籤（預設「概念」），定義放整句。
- 回顧牆（fr-recap）、穿窗（ft-transitions 的 dive）、截圖接力、前後拉桿、本集地圖這輪都沒做。
- 旁白段裡的 06／09／11／15 和插入素材（media）重疊時，現在報的是「兩張整張幕重疊」（因為已經換成不透明的全幕版），不是原本的「會被素材蓋住」；兩種都要改時間，改法一樣。
- x-scroll-brake：清單開始捲不另外綁句，從 TB（講到「這一個」）往前推 3.6 秒自動開始（分開綁時捲動到急剎中間停不到 1.2 秒，audit 一定 ⚠）；有講者時維持左計數、右清單（原型的上下排清單只放得下 3 列）。卡片要進 kit 的 `P.brake`、`P.lock` 寫在模板裡，kit 沒動；縱向動態模糊用 svg 濾鏡（測試禁止 CSS `blur(`）。
- x-prompt-tree：句號區段 5 句（#571–#575），總結綁自己那一句；送出（click）在下一句開頭，不是上一句結尾前 0.3 秒；新增「每長一層鏡頭往上帶」（沒有主卡時樹長一半會偏上，audit 報垂直不平衡）；有講者時維持 3 章橫排、重點直排在各章下面。

### 改了哪些
- 工具：`lib/scenes.mjs`（讀全幕版三節、`hasFull`、`fullScene()`、rich 欄位多 `_head`／`_tail`／`_headlen`／`_maxline`）、`lib/plan.mjs`（`full` 欄位、`fullCards`、`pushSeams`、畫面推近、旁白段 ✖ 的提示）、`lib/moods.mjs`（`SCREEN_PUNCH`、`zoomSpans` 的 `screenAt`）、`lib/main.mjs`（上推、畫面推近）、`build.mjs`（gallery 的 `-full.html`）、`lib/flow.mjs`、`lib/scaffold.mjs`（沒有講者時 15／09／06／11 照樣能用）
- kit：`scene-motion.js`（`P.press`、`P.flip`、`P.FLIP_LEAD`、`P.brace`）、`scene.css`（翻面受光層、括號）
- 模板：15、09、06、11 的 `template.html`；新 custom `x-scroll-brake.html／.fill.json`、`x-prompt-tree.html／.fill.json`
- audit：`lib/audit-beats.mjs` 的 VOCAB 加 5 個動作（和 BEATS §2 逐列相同）、`lib/audit-rules.mjs` 的 KIT_ROOT_QUERY 加 press、flip、brace
- 文件：style.md「全幕版、上推、畫面推近」、SITUATIONS §2／§3／§4（＋兩支新模板的訊號列）、BEATS 語彙表（+5，標題改成實際的 51 個）、design-system §14.1、USAGE-reference `full` 欄位與 R7.5 兩列、kit-syntax.md、README、CONTENTS、官網 FAQ、llms.txt（範例 46 → 48 支）、情境庫「全幕版」一組四張＋兩張新模板卡、gallery 截圖
- 測試：`dev/tests/fullscreen.test.mjs`（6 項）；跟著改的：examples（EXAMPLES 表＋2 支）、build（gallery 26 頁、全幕版預覽）、full-canvas（替換表）、media（旁白段的 06 自動全幕版）、audit（語彙數 51）、032-p3e 快照重產（只多了 `_head`／`_tail`／`_headlen`／`_maxline`、example 兩處 swap → push、推近略過的說明多一句）

### 驗證（2026-11-14，TMPDIR 指到非連結的暫存資料夾；`/Volumes/auto-edit-tmp` 這次沒掛）
- `npm test`：1662 項，1653 過、3 沒過、6 略過。
  - `032-b6` 遷移 `--dry-run`：本機 `projects/example/work/hyperframes/.cache/beats-v2.json` 已經有標記（git 忽略的本機狀態），複本帶著它；在拿掉標記的複本上實跑 `--migrate-beats --dry-run`，照預期只印、不寫標記。
  - `editor-segments-ui` 字幕分頁：「Node is detached from document」，單獨重跑通過（整套並行時的瀏覽器時序）。
  - `icons`：x-scroll-brake 刻意沒有圖示，加進 NOICON 後重跑通過。
  - 第一次整套跑（新 custom 還沒進來前）12 項沒過：7 項是 034 該跟著改的測試、清單（語彙表、KIT_ROOT_QUERY、gallery 頁數、替換表、media、p3e 快照），都已改好、重跑通過；剪輯台 2 項是 TMPDIR 為 `/var/folders` 連結造成的，換成非連結的資料夾通過；`incremental` 的 `--review` 重用是子代理同時在寫 `shared/template/custom/`（重用的雜湊包含模板資料夾的修改時間），第二次整套跑通過。
- `node dev/check-all.mjs --skip-tests --render`：全部通過（3 分 18 秒）；橫式到停點 ④ audit ✖ 0、⚠ 5，3 秒片段 render 有影音軌；直式 audit ✖ 0、⚠ 19。
- `dev/tools/custom-check.mjs`：x-scroll-brake ✓、x-prompt-tree ✓，各 1 個 ⚠（工具把 sample 和 sampleMin 排在相鄰兩段，「和前一段同一個模板」）。examples＋docs：506 項，502 過、0 沒過。
- 測試專案 `projects/t034-full`：`build --check` 通過 19 段、9 個 ⚠；全幕版 3 段（15、06、09）、上推 2、畫面推近 1。HyperFrames snapshot 看過：上推、金句逐詞壓印＋螢光筆、問答翻面（Q 徽章字色修過）、括號彈開、畫面推近前後對照；直式全幕版照舞台縮放、沒有錯誤。
- 兩支新模板的全寬版、子母畫面版預覽截圖看過（scratchpad `pv/final/`），亂序 seek 截圖一致（子代理的整合測試）。

## 作者驗收（2026-11-14，驗收單 https://claude.ai/artifact/MM1mjUXN2MC8Mb733DdZ4Y）

- commit：開分支，033＋034 commit 成一個（不 push）。
- 照現行：上推的頁面內容照「換卡不換景」進場（pushIn=now）、只在換小節時上推（pushWhen=section）、只要接觸影（pushLight=shadow）、壓印固定節拍（pressBeat 沒選）、06 名詞從冒號拆（conceptTerm=colon）、有講者也能寫 `"full": true`（fullWithSpeaker=yes）、兩支新模板照現在（customDev=ok）。
- 改：畫面推近推向講到的那個元素（punchAim=target）→ `lib/main.mjs` 的 `punchAim`（做法見上面「和定案不一樣的地方」）；`lib/moods.mjs` 畫面推近多記 `event`（詞開口）。驗證：`fullscreen.test.mjs` 多一項瀏覽器測試（巢狀時間軸、from()、淡出／大容器／set 不算、段還沒顯示也量得到）；`t034-full` 的 s0116 推向「1 小時」（截圖加除錯框確認）、先跳別的格再跳回來截圖逐位元相同。
- 之後要做（開下一個 spec）：回顧牆（新模板）、穿窗、截圖接力、前後拉桿、本集地圖。
