# 055 包 D：kit、手改檔、版本

做了：Q6（D7）、k10（N3）、k11（N4）、k29（F1）、k31（N10）。

## 改了哪些檔

| 檔 | 改了什麼 |
|---|---|
| `shared/template/kit/scene-motion.js` | Q6：`P.spot` 預設不插 `.sc-spot`、不發光，`{ glow: true }` 才加框。k10：新的 `opAt(el, t)`，算出元素在那一刻的透明度（掃整條 timeline 上對它的 opacity 補間，含 stagger、`tl.set`、`from`）；`P.out`、`P.swap`、`P.axis`、`P.peel` 等淡到 0 的出場、`P.dim`、`P.focus`、`P.spot` 的起點都從那個值開始。檔頭說明也更新了 |
| `shared/template/tools/lib/hand-shift.mjs`（新） | k11：`withTimes`、`readTimes`、`shiftHand` |
| `shared/template/tools/build.mjs`（手改檔那一段） | k11：情境檔頭補記 `t0=`、`d=`（組好情境檔那一行）。寫檔前多一段：手改過、不覆寫的情境檔，照起點差平移（在 `index.html` 手改檢查後面），約 20 行 |
| `shared/template/tools/versions.mjs` | k29：`requestNotes`、`requestQuote`，`begin --requests` 把描述寫進「原話」和分類表。k31：`handSceneFiles`、`aroundOf`、`aroundChange`、`情緒點與剪輯.json`；`snapshotOf`、`finish` 的描述、`use` 都改了。說明文字（`--help`）也更新了。包 B 的錄影段截圖、包 F 的接縫檢查沒動 |
| 測試 | `motion.test.mjs`：改 1 項、加 2 項，像素測試多一個 fixture。`feedback-round.test.mjs`：加 F1、N10 各 1 項。`hand-shift.test.mjs`（新）：5 項 |

`kit/scene.css` 沒改：`.sc-spot` 的樣式留著給 `glow: true` 用。`lib/custom-fill.mjs` 也沒改，理由見 k11。

## Q6（D7）P.spot 預設只做明暗

**行為**

- `P.spot(group, target, at, opts)` 現在只做三件事：
  - 聚焦的那個放大一點、抬一點；
  - 其他的壓暗（`dim`，預設 0.6）；
  - `target: null` 時全部恢復。
- `.sc-spot` 亮框（橘框加發光）只有寫 `{ glow: true }` 才插。
  - 加過框的元素，下一拍沒寫 `glow`，框就淡掉。
- 起點的透明度用 `opAt` 算，不寫死 1（見 k10）。

**用到 `P.spot` 的地方**

- `custom/` 有 20 支模板：x-trend、x-callout-parts、x-architecture、x-folder、x-stack-podium、x-crowd-queue、x-branch、x-ring、x-architecture-send、x-callout-phone、x-callout、x-checklist、x-process、x-ui-mock、x-metaphor、x-scene、x-warnings、x-checklist-ai、x-ring-facets、x-scene-example-outline。
- `scenes/` 的情境模板不直接用。
- 這些模板都沒寫 `glow`，所以全部改成只做明暗。

**焦點還看不看得到**（截圖對照：預覽頁上排用舊 kit、下排用新 kit，各取 5 個時間點）

| 模板 | 結果 | 對照圖 |
|---|---|---|
| x-stack-podium | 其他層壓暗，焦點清楚，只少了橘框 | `/private/tmp/claude-501/-Users-lindingyuan-Downloads-workspace-auto-edit-workspace/815f192b-d692-4a86-902c-6e9ff375331a/scratchpad/spotD/x-stack-podium-old-vs-new.jpg` |
| x-callout-parts | 第一拍只有一項，靠「它是唯一的一項」看得出來；之後各拍其他項壓暗，清楚 | `/private/tmp/claude-501/-Users-lindingyuan-Downloads-workspace-auto-edit-workspace/815f192b-d692-4a86-902c-6e9ff375331a/scratchpad/spotD/x-callout-parts-old-vs-new.jpg` |
| x-ring | 結論那一拍旁邊的圓環已經壓暗，結論卡少了框，只剩放大 1.04 | `/private/tmp/claude-501/-Users-lindingyuan-Downloads-workspace-auto-edit-workspace/815f192b-d692-4a86-902c-6e9ff375331a/scratchpad/spotD/x-ring-old-vs-new.jpg` |
| x-trend | 看不出差別 | `/private/tmp/claude-501/-Users-lindingyuan-Downloads-workspace-auto-edit-workspace/815f192b-d692-4a86-902c-6e9ff375331a/scratchpad/spotD/x-trend-old-vs-new.jpg` |

結論：

- 多項的模板靠壓暗就看得出焦點。
- group 只有一個元素的拍（x-ring 結論、x-callout-parts 第一拍）強調變弱，但還認得出來。作者要框，就在那一拍加 `{ glow: true }`。

預覽頁是用 `../kit/scene-motion.js` 載入 kit，不用重產，換了 kit 就是新的樣子。`shared/template/gallery/*.jpg` 沒重截，要的話跑 `node dev/tools/gallery-shot.mjs`。

**留給包 G**

- `shared/template/BEATS.md` 第 75 行還寫「放大＋抬起＋亮框發光」，要改成「放大＋抬起、其他壓暗；要亮框寫 `{ glow: true }`」。
- design-kit.md 的 `P.spot` 說明照上面改。

**觀察**：`glow` 的 box-shadow 在剛彈出的元素上，Chrome 截圖偶爾會差幾個像素。computed style 一樣，是合成的不確定性。所以像素測試的 glow 只放在原本那組 fixture 上，新加的 fixture 用預設。

## k10（N3）P.out 從那一刻的亮度淡出

**行為**

- `P.out` 和其他淡到 0 的出場（`swap`、`axis`、`peel`，以及 `move` 帶 `opacity: 0` 的），起點是元素在出場那一刻的透明度：`opAt(el, at)`。
- `opAt` 照時間順序重算 timeline 上對這個元素的 opacity 補間，算出那一刻的值。
  - 認得：`tl.to`、`tl.from`、`tl.fromTo`、`tl.set`、stagger 子補間，以及 kit 自己的 `P.dim`、`P.focus`、`P.spot`。
  - 用函式或相對值（`'+=0.2'`）寫的跳過。
- 結果在建 timeline 時就算好，寫死在 `fromTo` 的起點值，所以逐格 seek 任意順序跳都一樣。
- 已經進場完的元素（亮度 1）照舊從 1 淡出。
- 進場還沒做完就出場的元素（例：0.5 秒進場、0.6 秒出場），從那一刻的亮度（約 0.31）淡出，不會先跳回 1。
- `P.dim`、`P.focus`、`P.spot` 的起點也改用 `opAt`，不再用各自記的狀態。只有「突然變亮」的問題才改，其他寫死的值沒動。

**驗證**

- `motion.test.mjs` 新項「P.out／swap／axis／peel：從那一刻的亮度淡出」：
  - 情境：`P.dim` 0.6、`tl.to(opacity .25)`、`tl.set(.5)`、`P.spot` 壓暗、兩次 dim 0.3。
  - 9.2 秒的值是 0.6／0.25／0.5／0.3／0.42。
  - 照順序 seek 和三種亂序（含 9.2 → 8.0 → 9.25）結果一樣。
  - 舊 kit（HEAD）在 9.2 秒會跳到 1。
- 短影片4 複本跑 `versions.mjs use --seg s0101 --ver v8` → build → `snapshot --at 8.9,9.05,9.1,9.2,9.3`。
  - 標誌磚的平均亮度：61.5／61.5／60.1／49.3／30.4，一路變暗，沒有先變亮。
  - 截圖：`/private/tmp/claude-501/-Users-lindingyuan-Downloads-workspace-auto-edit-workspace/815f192b-d692-4a86-902c-6e9ff375331a/scratchpad/n3/contact-sheet.jpg`

## k11（N4）手改過的情境檔照新起點平移

**檔頭**

- build 產生的情境檔 `compositions/<段>-<情境>.html`，檔頭多記產生時的段起點與段長：`<!-- auto-edit: id=s0104 scene=keywords t0=19.734 d=7.016 hash=ebb6ff0e -->`。
- 雜湊本來就不算檔頭那一行，所以工具產生的檔照樣認得出沒手改。
- 第一次用新版 build 時，沒手改的舊檔會照常覆寫（補上檔頭）。

**build 遇到手改過、不覆寫的檔（沒加 `--force`）**

1. 起點差 Δ ＝ 這次的段起點 − 檔頭的 `t0`。
2. 會平移的秒數，各減 Δ（早於段頭的放在 0）：
   - `P.<動作>(sel, <秒>…)`：swap／axis／focus／spot／rack／along 看第 3 個參數，`P.at` 第 1 個，`P.sfx` 第 2 個；
   - `tl.to／from／set` 第 3 個參數、`fromTo` 第 4 個、`add`、`call`；
   - 前面是數字的運算式（`3.846 + 0.15`）；
   - `Math.max`、`Math.min` 裡的秒數；
   - 被當成秒數用到的 `const X = <秒>`、`[<秒>, …]`（間接用到的也算，例：`const T0 = 2.7 + (…)`、`const rowAt = [...]`）。
3. 不動的：
   - 和工具這次產生的檔同一個呼叫（方法＋選擇器＋第幾次）、同一個秒數的。段頭進場的 0、0.3、0.5 這類跟著段走，不能減。
   - 比例（`0.5 * D`）、相對 D 的（`D - 0.8`）、字串位置（`'<'`、`'+=0.2'`）。
4. 段長變了：`const D`、`P.end(<舊段長>)`、root 的 `data-duration` 換成新段長。
5. 寫回檔，檔頭換成新的 `t0=`、`d=`。
   - 不更新 `.build-manifest.json`，所以還是手改檔，下面照樣「⚠ 這些檔被手改過，沒有覆寫」。
   - 再 build 一次不會再動。

**報告（一行）**

- `s0104 手改過的動畫檔 compositions/s0104-keywords.html 照新起點平移 −0.5 秒（6 處）；段長 7.516 → 7.016 秒（const D、data-duration 一起換）`
- 括號裡會依情況多寫：`；和這次產生的一樣的 3 處不動`、`；2 處早於段頭，放在 0 秒`。
- 起點沒動、只改段長時：`s05 手改過的動畫檔 compositions/… 段長 9 → 8 秒（const D、data-duration 一起換）`

**✖（build 結束碼 1；其他檔都不產生）**

- 有認不出的寫法：整個檔不動（只動一部分的話，檔頭已經換成新起點，下次 build 就不會再提醒那幾行）。
  - 訊息：`[s05 fs-list] compositions/s05-fs-list.html 手改過，段起點從 20 改成 20.5 秒，第 16 行的秒數寫法認不出，整個檔的秒數都沒跟著動 → 那幾行改成數字開頭的寫法（例 3.8 + x）再跑 build，會自動照新起點平移；或自己把綁詞的秒數各減 0.5、檔頭的 t0= 改成 20.5；或刪掉這個檔重產（build 照 plan.json 產生）`
  - 認不出的例子：`-0.2 + x` 這類數字不在最前面的。`(3.8 + x)`、`x - 0.2`（看 `x` 的宣告）認得。
- 最後一行：`未通過：N 個錯誤，其他檔案都沒有產生。照 → 後面的建議改好再跑一次。`
- 同一次 build 裡別的手改檔已經平移好的，照樣寫了。

**沒有 `t0=` 的舊檔（055 之前產生的）**

用 `const D`（沒有就用 `data-duration`）當舊段長，和工具這次產生的檔比對同一個呼叫的秒數：

| 情況 | 判斷 | 做法 |
|---|---|---|
| 段長沒變 | 起點沒動 | 只補記檔頭 |
| 秒數都和這次產生的一樣 | 已經手動改好 | 只換 D |
| 綁詞的秒數都差「舊段長 − 新段長」，而且沒有任何段頭以後的秒數已經是新值 | 迄點沒動、起點晚了那麼多 | 平移 |
| 其他（例：有的差 0、有的差 0.5） | 推不出來 | ✖ |

推不出來時的 ✖：`[s0104 keywords] compositions/s0104-keywords.html 手改過、檔頭沒有記起點（舊版產生的），段長從 7.516 改成 7.016 秒，裡面綁詞的秒數和這次產生的差 0、+0.5 秒，認不出起點動了多少 → 起點晚了幾秒就把綁講到那個詞的秒數各減幾秒、const D 改成 7.016（改好再跑 build 就不會再報）；或刪掉這個檔重產（build 照 plan.json 產生）`

**模板段（x-* 填資料）不用平移**：產生的檔用 `P.at('#N')` 和 `P.dur()`，播放時才照段起點換算，起點改了自己就對。`custom-fill.mjs` 第 716 行「slots 的改動沒有套用」那則 ⚠ 照舊。

**驗證**

- `hand-shift.test.mjs` 5 項：
  - 檔頭；
  - 短影片4 r10 情況；
  - 段頭進場不動／陣列／`const T0`／`Math.max`／✖ 行號；
  - 舊檔三種情況；
  - 真的跑 build 的整合：手改後改起點 → 平移、報告一行、再 build 不動、`--force` 重產。
- 短影片4 複本，r10 的情況：
  - 做法：放回 r12 之前的手改檔（P.pop 3.846／4.716／5.976，沒有 t0），plan 用 `#17+0.5`，綁詞沒有 −0.2。
  - build 報告 `照新起點平移 −0.5 秒（6 處）；段長 7.516 → 7.016 秒`。
  - 三個 P.pop 變成 3.346／4.216／5.476，P.icon 跟著變 3.496／4.366／5.626。
- 短影片4 複本，現在的狀態（r12 已手動減 0.7，`const D` 還是 7.516）：
  - build 只報 `段長 7.516 → 7.016 秒`，P.pop 3.146／4.016／5.276 不動，沒有重複扣。
  - 真專案的 s0104 現在 `const D = 7.516`，比段長 7.016 多。所以 `P.wipeOut(…, D - 0.8)` 晚了 0.5 秒，下一次 build 會自動換成 7.016。

## k29（F1）修改單的描述寫進「原話」

**行為**

- `versions.mjs begin --requests` 讀 `work/feedback/editor-requests.md` 每一段的 `- 要改：` 和 `- 描述：`。兩個都沒有的段不列；`t<秒>` 的新段也列。
- 寫進 r<N>.md 的「原話」：

```
「照修改單改」
- 修改單 s0104（要改：版面）：「三張卡改成單欄直排、同寬、每張一行，前面加圖示」
- 修改單 x0105：「我覺得「反轉」的音效改成「丁」提示音比較合適」
```

- 分類表那一段的「原話節錄」改用那一段的描述；沒寫描述的段用整輪的原話。
- 「以後」這類規則字眼也看描述，看到就在分類表標「可能是規則，請確認」，並寫「建議改規則」。
- 同一輪再跑一次 `begin --requests`，原話不重複。
- 那一段「改之前」版本的 `.meta.json` 備註寫 `修改單：「<描述>」`。
- 沒加 `--requests` 時照舊，只記使用者原話。

**驗證**：`feedback-round.test.mjs` 新項「055 F1」。兩個複本回放（見 k31）的 r<N>.md 原話都有修改單那一行。

## k31（N10）版本工具也比手改檔和情緒點

**存什麼（begin、save、finish）**

- 情境段手改過的 `compositions/<段>-<情境>.html` 一起存。
  - 判斷手改：manifest 雜湊對不上，而且檔頭雜湊驗不過。工具產生的不存。
  - `.meta.json` 的 files 標 `hand: true`。
- 模板段的填資料檔是手改的，也標 `hand: true`。
- `情緒點與剪輯.json`：plan.json 第一層 `moods`、`edit.cuts`、`gains`、`joins`、`sfx` 中，落在這段時間內的項目（用 `build --check` 的段起迄與情緒點時間）。沒有就不存，雜湊和以前一樣。
- 手改檔檔頭的 `t0=`、`d=` 不算改了（build 補記檔頭不會讓版本 +1）。

**finish 怎麼寫「改了哪幾段」**

- 有任何一項變了就算改了：版本 +1，剪輯台標「已改完」，訊息就是這一列。
- 各種變動的寫法：
  - 手改檔：`- s0104：手改 compositions/s0104-keywords.html（v5 → v6）`
  - 情緒點：`- x0105：情緒點 #19@系統 改了（v3 → v4）`；也有「加了」「拿掉了」。
  - edit：`edit.cuts（剪掉）加 [13,13.5]`、`edit.gains（音量）拿掉 …`、`edit.joins（接點）…`、`edit.sfx（自己加的音效）…`
  - 手改檔換回工具產生：`compositions/… 拿掉手改（改回工具產生）`

**use**

- 退回的那一版當時是工具產生的情境檔：現在的手改檔會拿掉，印 `s08-concept.html（拿掉手改，build 照 plan.json 重產）`。
- `情緒點與剪輯.json` 只存不還原：`moods`、`edit` 是全片共用的，退回一段不改它們。說明文字有寫。

**驗證**

- `feedback-round.test.mjs` 新項「055 N10」：
  - 只改情緒點、只手改情境檔都算改了，剪輯台都標 done；
  - `edit.cuts` 加一段也算；
  - `use` 退回時拿掉手改檔，再退回又換回來；
  - 補記檔頭不算改了。
- 主宣傳片複本回放 r12：
  - 做法：plan 回到 bak-r12 → `begin --requests` → 加 `"sfx": "ding"` → finish。
  - 結果：`版本：x0105 v3 → v4`，`x0105：情緒點 #19@系統 改了（v3 → v4）`，`剪輯台修改單：已改完 x0105`。
- 短影片4 複本回放 r8：
  - 做法：s0104 手改檔 → `begin --requests` → 再改手改檔 → finish。
  - 結果：`版本：s0104 v5 → v6`，`s0104：手改 compositions/s0104-keywords.html（v5 → v6）`，剪輯台 state `done`。
- 兩次都沒有「沒變」，也沒有「失敗」。
- 回放時 finish 用 `scratchpad/replay.mjs`：剪輯台那一步不開（不搶埠），其他照真的跑。

## 測試

| 測試檔 | 結果 |
|---|---|
| `motion.test.mjs` | 28／28 |
| `versions.test.mjs` | 8／8 |
| `feedback-round.test.mjs` | 26／26 |
| `hand-shift.test.mjs` | 5／5 |
| `032-w2a.test.mjs` | 8／8（`begin --requests` 那一項受影響，照過） |
| `custom-fill.test.mjs` | 15／15 |
| `scenes.test.mjs` | 29／29 |
| `build.test.mjs` | 29／30 |

`build.test.mjs` 失敗的那一項是「style（風格包）…名稱打錯 ✖」：它期待現有的風格包只有「預設、藍圖」，HEAD 13a7427 多了「橘色-20261116-2」，和本包無關。

## 留下的問題

- BEATS.md 第 75 行、design-kit.md 的 `P.spot` 說明要改（包 G）。
- `use` 不還原 `moods`、`edit`（刻意的）：退回只改情緒點的那一版，要自己改回 plan.json。版本的 `情緒點與剪輯.json` 可以對照。
- 手改情境檔裡數字不在最前面的秒數（`-0.2 + x`），平移時報 ✖ 給行號、整個檔不動，要改寫法或自己減。秒數只放在沒宣告的變數裡（例：迴圈變數）的認不到，也不會報。
- 模板段（x-*）手改時如果自己寫了數字秒數（不用 `P.at`），起點改了不會平移；工具產生的都是 `P.at`，不受影響。
