# 061 錄影畫面框（screenFrame）

worktree `agent-abd14c6fd831544f1`，沒有 commit。

## 作者的話

1. 「所有的螢幕錄影在全畫面時，應該縮放到 90% 左右，就是要剛好不要碰到字幕，這邊我覺得可以增加指定畫面縮放的功能，然後全片會幫我量測」
2. 「螢幕錄影片段，右上角的角標，應該距離上面跟右側要是一樣的間距…如果量測好後，應該都使用一樣的標準就好，每隻影片可能不同…這些細節參數可以先用「影片」為單位紀錄，也寫入 Global Setting 作為參考」

## 做了什麼

- 新欄位 `screenFrame: { "scale": 0.6–1 或 "auto", "inset": 0–80 }`。
  - plan.json 第一層＝這一集。
  - `shared/setting.json` 的 `screenFrame`＝以後每集的預設。
- 套用的範圍：橫式、`type: "media"` 的全畫面錄影與圖片段。
  - `side`（右側步驟清單）、`enter: "tape"` 有自己的版面，不套。
  - 直式不套（plan 寫了會 ⚠）。
- 錄影放進一個置中的框 WIN：
  - `contain`／`cover`、`start`、運鏡、放大鏡、進出場都在框裡。
  - 超出框的裁掉，框有圓角 16 px、淡陰影。
  - 框外是主題的純底色（`--sc-fs-bg`：亮色 #FFF8F3、暗色 #0A0F1E），不放背景圖（作者：「有螢幕錄影全畫面時，不需要放背景，這樣畫面很衝突」）。框裡沒蓋到的是黑底（計時的 `.mwin`）。
- 小節角標貼框的右上角，離框上緣、右緣都是 `inset`，整集同一個標準，不看素材寬窄。
- 子母畫面（`pip: true`）移進框的右下角，外框離框右緣、下緣 `inset`，右緣和角標對齊。
- STEP 膠囊貼框的左上角（或右上角），一樣離框邊 `inset`。
- 標註安全區（說明卡、箭頭、聚光燈、放大鏡、等待卡）都改成框內、離框邊 `inset`。

## 最後的數字（`lib/screen-frame.mjs` 的 `FRAME`）

| 項目 | 值 |
|---|---|
| scale 範圍 | 0.6–1，取到 0.005；或 `"auto"` |
| inset | 預設 24，範圍 0–80 |
| 框下緣離字幕底板 | 至少 12 px（gap） |
| 圓角 | 16 px |
| WIN 的算法 | `w = round(1920·s)`、`h = round(1080·s)`、`x = round((1920−w)/2)`、`y = min(round(inset/2), floor((1080−h)/2))` |

auto 怎麼量：

- 用 `captionGeom`（這一集的字幕樣式：`lift`、`size`、`look`）量字幕底板上緣 capTop。字幕是 nowrap 一行，所以最高的底板就是這一個。
- 從 s = 1 往下每次減 0.005，找第一個讓「框下緣 ≤ capTop − 12」的值。
- 到 0.6 還是碰到，就停在 0.6，並 ⚠ 叫使用者把字幕往下移或改小。

實際量到的值：

| 字幕 | capTop | auto | WIN [x, y, w, h] | 框下緣 |
|---|---|---|---|---|
| 預設（深底白字 76 px、原位） | 956 | **0.86** | [135, 12, 1651, 929] | 941（離字幕 15 px） |
| `lift` 120 | 836 | 0.75 | [240, 12, 1440, 810] | 822 |
| `size` 96 | 925 | 0.83 | — | — |
| `lift` 400 | 556 | 0.6，加 ⚠ | — | 660 |
| inset 32（預設字幕） | 956 | 0.855 | 上緣 16 | — |

預設（0.86、inset 24）下其他元素的位置：

- 小節角標：右上角 (1762, 36)，離框右 1786−1762＝24，離框上 36−12＝24。
- 子母畫面外框：右緣 1762、下緣 917（離框下緣 941 是 24）；位移 `[-103, -10]`。
- STEP 膠囊：左上 (159, 36)。
- 放大鏡：最大 1376×619（原本 1600×720 乘上 scale），放在框裡、離框邊 24。

## 解析順序與記錄

- 解析順序是 **plan.json `screenFrame`（逐欄）> shared/setting.json `screenFrame` > 沒有**。
  - plan 只寫 `inset` 時，`scale` 照 setting；setting 也沒有就是 `"auto"`。
  - 都沒有就是原本的樣子：錄影在字幕帶上方 1920×940、四周黑底。
- 寫錯的處理：
  - plan 寫錯是 ✖，附 `build.mjs --unset screenFrame`。
  - setting 寫錯是 ⚠，這次先不套，附 `brand.mjs screen-frame` 重設。
- **以影片為單位記錄**：
  - 條件：`build`（不是 `--check`、也不是背景的 `--prepare`）、這一集 plan.json 沒有 `screenFrame`、setting 有。
  - 這時先把解析好的值寫進 plan.json（`auto` 寫成量到的數字，例如 `{ "scale": 0.86, "inset": 24 }`），再讀輸入。
  - 寫完印一行：`✓ plan.json：screenFrame＝{"scale":0.86,"inset":24}（照 shared/setting.json 的 screenFrame 記下來，量字幕上緣 y 956；之後這一集照這一份，要改用 build.mjs --set "screenFrame.scale=…"）`。
  - 之後預設再怎麼改，這一集都照 plan.json。
- 自己在 plan.json 寫 `"auto"` 的會保留 `"auto"`，每次 build 照這一集的字幕重新量。
- 字幕改了、框疊到字幕：只有手寫數字、框下緣 > capTop 時才會發生。這時 build、`--check` 都會印：
  - `⚠ 錄影畫面框縮到 86%，框下緣 y 941 疊到字幕底板（上緣 y 836）105 px → 重新量測（照字幕量到剛好不碰到，現在會是 75%）：node shared/template/tools/build.mjs --project projects/<專案> --set "screenFrame.scale=auto"`
- build／`--check` 的摘要多一行：
  - `錄影畫面框：縮到 86%（量字幕上緣 y 956；1651×929、上 12），角標離框上、右各 24 px（這一集 plan.json screenFrame）`
  - 是手寫數字時沒有「量字幕上緣」那一段。
- 測試、CI 用 `AUTO_EDIT_NO_LOCAL_BRAND=1` 不看本機的 setting，和字幕樣式、片尾一樣。

## 指令

- 這一集：
  - `node shared/template/tools/build.mjs --project projects/<專案> --set "screenFrame.scale=0.88;screenFrame.inset=24"`
  - 照字幕重新量：`--set "screenFrame.scale=auto"`
  - 拿掉、回到預設：`--unset screenFrame`
- 以後每集（`shared/setting.json`）：
  - `node shared/template/tools/brand.mjs screen-frame`：看目前的預設與可選的值。
  - `node shared/template/tools/brand.mjs screen-frame --scale auto --inset 24`：設定，只給要改的。
  - `node shared/template/tools/brand.mjs screen-frame off`：拿掉預設。
- 文件各加了一行：`build.mjs --help`（`--set` 的鍵、`--unset`）、`build.mjs --list` 的插入素材表下面、`shared/template/USAGE.md` §5.3（還有第一層設定那一句）、`brand.mjs` 的說明與檔頭。

## 吃錄影幾何的地方（都跟著 WIN）

| 地方 | 怎麼跟 |
|---|---|
| `lib/media.mjs` `framedView` | 有框時取代 `LAND`：`view.contain`＝`view.cover`＝`focus`＝WIN、`safe`＝WIN 內縮 inset、`bottom` 不限（字幕在框外）、`step`、`lens`（尺寸照 scale 縮、中心在框裡） |
| `mediaGeometry`／運鏡 `camFor` | 不用改：吃 `F.view` 的都自動放進框；推近＝塞滿框（測試量過：推到素材左上四分之一，畫面上剛好是 WIN） |
| `mediaCorner`（小節角標） | 給 `frame` 時一律回框右上角內縮 inset（plan.mjs `secSpot`：錄影段、全寬段都用；tape 照舊） |
| `pipShift` | 給 `fr` 時一律移進框右下角，外框離框 inset |
| `markRects` | 有框時「跑到畫面外」改成「跑到錄影框外」「有一部分在錄影框外（被裁掉）」，下緣也算 |
| STEP 膠囊 `capAt`、等待卡 `mediaWaits`、放大鏡避開子母畫面 | 左界改成框內 |
| `mediaParts` | `#mbg` 加 `mbg--frame`（框外主題純底色）。`#mgr` 面板＝WIN（`mgrow--frame`：圓角、`overflow: hidden`；面板不計時，所以不能有底色或陰影），框內黑底與框線在計時的 `#mwb`（`.mwin`），stage 抵回 `-WIN.x/-WIN.y`。tilt 透視中心、聚光燈與放大鏡的壓暗、等待卡的壓暗只蓋框 |
| `kit/media.css` | `.mbg--frame`、`.mgrow--frame` 兩條 |
| `--check --json` | 第一層 `screenFrame`（`{ scale, inset, auto, win, capTop, from }` 或 `null`，出錯時也有）；有框時 `items[].out.frame`＝WIN（`specs/contracts/check-json.md` 已補） |
| 剪輯台 | `canvasInfo` 收解析好的框：`media.full`／`media.panel` 換成 WIN，另外帶 `media.frame`、`media.radius`（和 build 同一套解析，`AUTO_EDIT_NO_LOCAL_BRAND` 一樣擋）。`preview.js` `placeMedia` 照 WIN 放、加圓角；子母畫面位置本來就吃 `out.pipShift` |
| 截圖欄位（`lib/shots.mjs`） | 段的截圖改切 WIN 再縮成 960×540；快取 key 只有有框時才變 |
| 內容設計動畫 brief（`lib/flow.mjs` `canvasNote`） | 全寬段有框時寫「錄影畫面框 x 135–1786、y 12–941，框外是主題背景」 |
| 剪映素材（capcut） | 透明 MOV 是同一份合成渲染的，自動跟著（沒有另外改程式） |
| qc／audit | grep 過：audit 的 940 都是直式安全區或全寬內容範圍（x 120–1800、y 40–900），和錄影框無關，沒有改 |

## 判斷（細節我決定的）

- 素材不是 16:9 時框大小不變，框裡沒蓋到的是黑底。角標、子母畫面因此整集一個標準，不跟著素材寬窄跑。
- 框的上緣留 inset 的一半（12），不是置中。框盡量大、下緣貼近字幕，上下的留白不會比左右大。
- 框外只用主題底色（主代理在真專案看過：背景圖的裝飾和錄影衝突，作者要求拿掉）。面板不計時：一開始把黑底和陰影放在面板上，真專案整支片每一格都疊了黑框，改成計時的 `.mwin`。全寬段（沒有講者的內容設計動畫）照舊只留底色（`WIDE_BG`）；錄影段接全寬段時，背景差在有沒有背景圖右上的裝飾。
- 字幕重疊的 ⚠ 只在框下緣 > capTop（真的疊到）時出現；落在 12 px gap 內不算錯。
- 預設 0.86：在 85–87% 之間，是預設字幕下最大、而且不碰到字幕的值。

## 改了哪些檔

| 檔 | 改了什麼 |
|---|---|
| `shared/template/tools/lib/screen-frame.mjs`（新） | `FRAME`、`sanitizeScreenFrame`、`frameWin`、`measureScale`、`resolveScreenFrame`、`frameForPlan`、`describeScreenFrame`、`frameLine` |
| `shared/template/tools/lib/media.mjs` | `framedView`；`mediaCorner`、`pipShift`、`validateMedia` 收 frame；`markRects`、`capAt`、`mediaWaits`、放大鏡、`mediaParts` 跟著 WIN；`MEDIA_FIELDS` fit 那一列補一句 |
| `shared/template/kit/media.css` | `.mbg--frame`、`.mgrow--frame`；`.mbg` 註解 |
| `shared/template/tools/lib/plan.mjs` | `TOP_KEYS` 加 `screenFrame`；`resolvePlan` 解析、傳給角標與 `validateMedia`；有框時結果帶 `screenFrame`、`screenFrameRecord`（沒設定時不放這兩個鍵，resolvePlan 快照不變）；`jsonItems` 的 `out.frame`；摘要一行 |
| `shared/template/tools/lib/project.mjs` | `loadLib` 加 `screenFrameDefault` |
| `shared/template/tools/lib/settings.mjs` | 註解列出 `screenFrame` |
| `shared/template/tools/lib/plan-set.mjs` | `--set screenFrame.scale／screenFrame.inset`、`--unset screenFrame` |
| `shared/template/tools/build.mjs` | `recordScreenFrame`（第一次 build 記進 plan.json）；`--check --json` 第一層 `screenFrame`（出錯的 JSON 也有）；`--help`；`--list` 插入素材表下面一行 |
| `shared/template/tools/brand.mjs` | `screen-frame` 子指令（看、設定、off）、說明、檔頭 |
| `shared/template/tools/editor.mjs` | `canvasInfo(projectDir, plan, frame)`、`screenFrameOf` |
| `shared/template/tools/editor/preview.js` | `placeMedia` 有框時加圓角；註解 |
| `shared/template/tools/lib/shots.mjs` | 段的截圖切 WIN |
| `shared/template/tools/lib/flow.mjs` | 全寬段 brief 寫框的位置 |
| `shared/template/USAGE.md` | §5.3 一行；第一層設定那句加 `screenFrame` |
| `specs/contracts/check-json.md` | `screenFrame`、`out.frame`、出錯範例、版本紀錄 |
| `dev/tests/screen-frame.test.mjs`（新） | 11 個測試，見下面 |
| `dev/tests/build.test.mjs` | 兩處 `--check --json` 的鍵清單加 `screenFrame` |
| `dev/tests/032-w1b.test.mjs` | `--unset` 能拿掉的鍵清單最後多了 `screenFrame`（訊息變了，照改） |
| `package.json` | `test:fast` 加 `screen-frame.test.mjs`（0.6 秒） |

## 測試

`dev/tests/screen-frame.test.mjs` 的 11 個測試：

1. auto 的數字：預設 0.86、各種 lift／size、每一個值「再大一格就不夠」。
2. 解析順序：plan > setting > 沒有、只寫一欄、取到 0.005、plan ✖、setting ⚠、直式不套。
3. 字幕疊到時的 ⚠ 與重新量測指令。
4. 角標等距：三種素材比例，離框上＝離框右＝inset。子母畫面外框離框右、下 inset，右緣和角標對齊。沒有框時照原本（1780, 16）、`[-85, -3]`。
5. `validateMedia`＋`mediaParts`：16:9 塞滿框、推近塞滿框、STEP、說明卡、放大鏡在框裡；DOM 的 class、style、壓暗；紅框被框裁掉 ⚠；side 不套。
6. 沒設定時 `mediaParts` 逐字相同，沒有任何框的 class 或圓角。
7. `resolvePlan`：角標 spots、摘要一行、`out.frame`、`out.pipShift`、跟著這一集的字幕、setting 才 record、沒設定時沒有這些、寫錯 ✖。
8. `--set`／`--unset` 寫 plan.json（放在 scenes 前面）、範圍外 ✖。
9. `brand.mjs screen-frame`：看、設定、只改一欄、⚠、✖、off（寫在暫存的 shared/）。
10. 截圖欄位切 WIN（plan、setting 兩種）、直式不套。
11. build 第一次把 setting 記進 plan.json；`--check` 不寫；記了之後預設再改也不跟著變。暫存 shared/ 用 junction 連到真的 template。

### 結果（最後一輪，都加 `--test-timeout=300000`，整個檔跑，沒有用名稱篩）

`npm run test:fast` 的 29 個檔（含 `screen-frame.test.mjs`）：

```
ℹ tests 352
ℹ pass 352
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
```

相關的整合測試 30 個檔：media、canvas、build、brand、caption-style、media-guards-055、shotcraft-more、editor、editor-speed、fullscreen、motion、032-b6／p2a／p2c／p3d／p3e／w1a／w1b／w3a／w3b／c7、059-designer-speed、audit、ending、retime、rough-flow、screen-events、scaffold、editor-framing、capcut。

```
ℹ tests 491
ℹ pass 465
ℹ fail 17
ℹ cancelled 0
ℹ skipped 9
```

17 個失敗都查過，和這次的改動無關：

- `032-b6` 14 個、`brand.test`「風格包」1 個：改之前就壞了。
  - 驗法：`git archive HEAD` 解到 scratchpad、node_modules 連過去，跑這兩個檔，同樣 15 個失敗。
  - b6 要 `projects/example/work/`，那個資料夾沒進版控，worktree 裡沒有。
  - brand 是「橘色-20261116-2」包只有 6 個檔，測試要 9 個。
- `editor-framing` 2 個：在 worktree 裡才會壞，是環境問題。
  - 「兩個頁面」等 `player.ready` 30 秒逾時；「構圖下方直接預覽」只有和其他檔一起跑時才偶爾失敗。
  - 驗法：同一份 HEAD 複本蓋上這次全部改過的檔，整個檔跑 8 個全過。單獨跑 worktree 時，「構圖下方直接預覽」也會過。
  - worktree 根目錄沒有 node_modules（要往上找到工作區的那一份），HEAD 複本根目錄有。

第一輪另外失敗、已經修好的：

- `build.test` 鍵清單 2 個：加了 `screenFrame`，照改。
- `032-w1b` 1 個：`--unset` 的鍵清單變了，照改。
- `032-p3e` resolvePlan 快照 2 個：結果多了 `screenFrame: null`。改成沒設定時不放這兩個鍵，快照不用動。

## e2e

- 專案放在 scratchpad：rough.mp4 是 `projects/example` 口播的前 45 秒（只讀那支檔），加一支 1920×1080 的 testsrc2 錄影、一張 1600×1200 的圖。
- shared/ 是暫存的（template 連到 worktree），setting.json 寫 `{ "screenFrame": { "scale": "auto", "inset": 24 } }`。projects/ 底下什麼都沒有寫。
- 第一次 build 記下 `{ "scale": 0.86, "inset": 24 }`，摘要印「錄影畫面框：縮到 86%（1651×929、上 12），角標離框上、右各 24 px（這一集 plan.json screenFrame）」。
- `npx hyperframes snapshot` 截了 14 s、20.5 s、33 s，暗色主題又截了 14 s、36 s。看過的結果：
  - 錄影在圓角框裡，框外是主題背景圖：亮色有裝飾線，暗色是暗底。
  - 小節角標離框上、右等距；STEP 膠囊在框左上；子母畫面在框右下、右緣和角標對齊；說明卡在框裡。
  - 字幕底板在框下面，沒有碰到。
  - 4:3 圖片在框裡左右黑邊，推近時塞滿框、邊緣被框裁掉。
- **沒設定時逐位元相同**：
  - 把 worktree 的 template 複製一份，改過的檔換回 HEAD 版。
  - 同一個專案（沒有 screenFrame、setting 是 `{}`）先用 HEAD 版 build，再用新版 build。
  - `index.html` 用 `cmp` 比，完全相同；compositions「沒變 4」。
  - 只有 `kit/media.css` 因為多了兩條沒用到的 class 而更新。

## 沒做的

- **剪輯台沒有調這兩個參數的介面**：只有指令（`build.mjs --set`、`brand.mjs screen-frame`），沒有像字幕那樣在預覽上拖的 UI。
- 剪輯台快速試聽的模擬：錄影照框放、有圓角，但框外還是剪輯台的深色底，不是主題背景，也沒有陰影。完成影片預覽才是準的。
- 全寬段（沒有講者的內容設計動畫）的背景照舊只留底色，和框外的 `bg-fs.jpg` 差在右上的裝飾。要一致的話，要嘛框外也只留底色，要嘛全寬段放回背景圖，等作者選。
- 全寬段內容範圍照舊是 x 120–1800、y 40–900，沒有改成對齊框（框是 x 135–1786）。
- `shared/style.md`、AGENTS.md 路由表、Skill（例如 `auto-edit-style` 的「錄影縮小一點」）沒有加這個功能；brief 只要求 build／brand 的說明與 USAGE。
- 剪映素材沒有另外輸出驗證（程式沒改，透明 MOV 是同一份合成）。
- `side`、`tape`、直式不套框（照需求）。
