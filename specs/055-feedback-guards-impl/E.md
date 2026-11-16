# 包 E 初剪與去背（Q5、k25、k26、k28）

都做了。測試：`node --test dev/tests/matte.test.mjs`（11 過）、`dev/tests/rough-flow.test.mjs`（跳過兩個會開剪輯台的，34 過 1 略過）、`dev/tests/ngscan.test.mjs`（6 過）、`dev/tests/media-cli.test.mjs`（改了 snapNg，跑過一次，28 過）。

## 改了哪些檔

| 檔 | 改了什麼 |
|---|---|
| `lib/rough/ngscan.mjs` | `NGSCAN.edgeExtra`；`outsideRows` 標 `edge: 'head'｜'tail'`；ng-scan.md／log 的判定欄多「頭尾講稿外（預設剪）」；`ngSnap` 把主軌長度傳給 `snapNg` |
| `lib/rough/cuts.mjs` | `CUT.edge`；`snapNg(rows, sil, win, chapterSil, dur)`：起點 ≤ 0.1 秒的列從 0 剪、終點離主軌結尾 ≤ 0.1 秒的列剪到結尾，不往停頓對齊 |
| `lib/rough-flow.mjs` | `cutRows` 頭尾列預設剪（`EDGE_REASON`）；prep 那一行多「講稿第一句之前、最後一句之後的話 N 處預設剪」；rough 回報段多掃一次的 ⚠ |
| `lib/rough/residual.mjs`（新） | `residualScan`、`roughResidual`、`residualLines`、`residualWarnings`、常數 `RESIDUAL` |
| `lib/matte-steady.mjs` | `analyzeMatte` 多回傳 `blobs`（每塊多一個 `ok`）、`blobOf`（算法沒變）；新 `measureFlicker` |
| `lib/matte.mjs` | `FLICKER` 常數；`ensureMattes` 多 `flicker` 選項、回傳 `warnings`；`flickerMessage`、`isMatteFlickerLine`；快取 `work/hyperframes/.cache/matte-flicker.json` |
| `tools/build.mjs`（包 D 的檔，最小插入） | 一行 import＋`--check` 的 `res.warnings.unshift(…)` 多 `...residualWarnings(P.project, plan)` |
| `lib/flow.mjs`（包 A 的檔，最小插入） | 一行 import＋`--review` 印完六行摘要後多印 build 輸出裡的去背閃動 ⚠（`--review` 本來只轉印摘要行，這條 ⚠ 只有 build 量得到） |

## Q5（D6）頭尾講稿外預設剪

- ng-scan 找講稿外時，第一個錨點之前（頭）、最後一個錨點之後（尾）那一段，逐字稿比講稿多 ≥ `NGSCAN.edgeExtra`（2）個字就算（中間的照舊要多 ≥ 6 字），而且多出來的字在那一段的最前面（頭）／最後面（尾），標 `edge`。開頭幾個字被 whisper 聽錯（字數一樣）不算。
- `cutRows`：edge 列 `[x]`、不寫待確認；頭從 **0** 起（主軌最前面）、尾剪到**主軌最後**（`main.json` 最後一支的 end）。原因欄原文：
  - 頭：`試講／講完後的自言自語：講稿第一句之前的話，預設剪；要留就取消勾選`
  - 尾：`試講／講完後的自言自語：講稿最後一句之後的話，預設剪；要留就取消勾選`
- 「不用停」略過停點 ① 時，這幾列沒有待確認，照剪。
- 贅字照舊 `[ ]`、不寫待確認。
- ng-snap（`snapNg`）一起修：起點 ≤ `CUT.edge`（0.1 秒）的列從 0 剪、終點離主軌結尾 ≤ 0.1 秒的列剪到結尾，不往停頓對齊。**這是短影片5「把 AI」的根因**：NG 第 1 列寫 `0:00.00`，以前被對到 0.6 秒那個停頓的起點，0–0.6 秒的試講就留在初剪。複本重跑 `media.mjs rough --again`，auto-editor 的指令變成 `--cut-out "0sec,89.867sec"`（以前 `0.6sec`）。
- 真實資料（六支 PPA 的 transcript-main.json 重跑 ng-scan＋cutRows）：只有短影片4 出一列頭 `0:00.00–0:04.70「ai發展」`。那是 C0018 試講的頭（後面的 NG 從 4.7 秒起），主代理當時手寫的 NG 第 1 列也是從 0:00.00 剪，所以這列是對的。

## k25（C20）初剪完再掃一次

`media.mjs rough` 在剪接點那一步之後跑 `roughResidual`，結果放進回報段（「驗證：」那一行下面，最多三行）；`build --check` 印一行還沒處理的數量。

掃三種（`lib/rough/residual.mjs`）：

1. **NG 列沒剪乾淨**（054 沒寫，這次加的）：cuts.md 打勾的 NG 列，扣掉 `cuts.v1.json` 實際剪掉的範圍，剩 ≥ `RESIDUAL.minSec`（0.3 秒）而且裡面有字（初剪逐字稿；沒有字就看 transcript-main.json）→ 重講還留著。等待表的列不看。
   - 為什麼要加：六支 PPA 的初剪逐字稿（transcript.json）重跑 ng-scan 的重講和贅字，**一處都沒有**：whisper 對 rough.mp4 轉的時候把兩次併成一次、贅字也常不寫；照 main.mp4 換算的那條路，NG 列範圍裡的字照 cuts.md 的時間丟掉了。主宣傳片 59.85–60.72 那一處光看字看不出來。真正的原因是 ng-snap 把 NG 第 3 列的起點從 10:29.85 對到 10:30.70 的停頓（往後移了 0.85 秒），前面那截「你只要決」留在初剪 0:59.82–1:00.67。
2. **初剪逐字稿再跑一次 ng-scan**：重講（往回跳、緊接著重複）、贅字。和第 1 種重疊的不重列。
3. **開頭**（k26，下一節）。

rough 回報段的 ⚠（原文格式）：

```
⚠ 初剪後還留著 1 處重講：0:59.82–1:00.67「你只要決」（剪輯清單第 3 列對齊停頓後從原始錄影 10:30.70 才開始剪，前面 0.85 秒沒剪到） → 剪輯台把這幾段剪掉（或 plan.json 第一層 edit.cuts 加 [59.82, 60.67]）
⚠ 初剪後還留著 1 處重講：0:0x.xx–0:0x.xx「但畢竟手」（講稿第 2 行講了兩次） → 剪輯台把這幾段剪掉（或 plan.json 第一層 edit.cuts 加 [起, 迄]）
⚠ 初剪後還有 1 處贅字（照預設沒剪）：0:12.40「嗯嗯」 → 使用者試聽後要剪就在剪輯台剪掉，不剪不用管
```

（NG 列沒剪到的說法另外兩種：`剪輯清單第 N 列對齊停頓後剪到原始錄影 M:SS.ss 就停，後面 X 秒沒剪到`、`剪輯清單第 N 列中間原始錄影 A–B 沒剪到`、`剪輯清單第 N 列整列都沒剪到`。一行最多列 5 處，多的寫「…還有 N 處」。）

`build --check`（還有 `--check --json` 的 warnings）一行：只算 plan.json 第一層 `edit.cuts` 還沒蓋到（蓋到 < 60%）的重講和開頭；**贅字不算**（Q5：贅字只列出，不然這條 ⚠ 永遠消不掉，會變成大家都忽略的雜訊），有那一行時才順帶說贅字幾處。

```
⚠ 初剪後還留著 1 處重講或試講沒剪：0:59.82–1:00.67「你只要決」（剪輯清單第 3 列對齊停頓後從原始錄影 10:30.70 才開始剪，前面 0.85 秒沒剪到） → 剪輯台把這幾段剪掉（或 plan.json 第一層 edit.cuts 加 [59.82, 60.67]）
```

（後面有贅字時接「；另有 N 處贅字照預設沒剪，不用管」。）

## k26（C21）初剪開頭

開頭（`head`）三種來源，任一種就印一行：

- 上面第 1、2 種有落在初剪前 `RESIDUAL.headSec`（1.5 秒）的。
- 初剪逐字稿第一個錨點之前，比講稿多 ≥ `RESIDUAL.headChars`（2）個字、最前面那幾個字對不上講稿，而且第一個字在 1.5 秒內。
- 初剪最前面是原始錄影裡**單獨的一小段**（0.3–1.5 秒，和下一段在原始錄影裡隔 ≥ `RESIDUAL.orphanGap` 1 秒），兩份逐字稿那裡都沒有字。這是自動流程裡短影片5 那種情況：原始錄影的逐字稿根本沒聽到 0–0.6 秒的「把 AI」，ng-scan 的 NG 從 7.33 秒起，上面兩種都抓不到。

```
⚠ 初剪開頭有講稿外的話：0:00.00–0:00.60「把 AI」（剪輯清單第 1 列對齊停頓後從原始錄影 0:00.60 才開始剪，前面 0.60 秒沒剪到） → 剪掉：剪輯台把片頭拖到 0.6 秒（或 plan.json 第一層 edit.cuts 加 [0, 0.6]）
⚠ 初剪開頭有講稿外的話：0:00.00–0:00.60（原始錄影 0:00.00–0:00.60 單獨一小段，後面直接接原始錄影 1:29.87；逐字稿沒有字，多半是沒聽清楚的試講或雜音，聽一下） → 剪掉：剪輯台把片頭拖到 0.6 秒（或 plan.json 第一層 edit.cuts 加 [0, 0.6]）
```

## k28（C22）去背閃動

- 每個去背段做完或沿用後（`ensureMattes` 最後），用 043 的 `analyzeMatte` 量**做好的那支去背檔**（寫了 `steady` 的段量的是穩定後的結果）：只量、不改。找「整塊一起跳」的塊（043 會拿去換的同一種），面積 ≥ 講者框（plan.json `speakerBox`）的 `FLICKER.minArea`（2%）就報；沒有講者框拿畫面的一半當講者框。
- 只是 ⚠，不擋 build、不自動改（站著的講者沒辦法保證不誤判，043 的教訓）。
- 印在 build 的輸出（`⚠ <段> …`）；`versions.mjs finish` 照段號轉印；`build --review` 本來只轉印六行摘要，這次在 `lib/flow.mjs` 加了一行照印（`isMatteFlickerLine`）。
- 時間：第一次量一段約 0.5–2.5 秒（4.5–12 秒的段，解 320 px 寬的遮罩和底片）；結果記在 `work/hyperframes/.cache/matte-flicker.json`（檔名本身帶去背指紋，再對大小、修改時間、`FLICKER.version`、`STEADY.version`），同一支檔不重量；不在了的檔順手清掉。短影片4 第二次 build 0.58 秒。
- 測試的替身去背（`remove` 換掉、`AUTO_EDIT_MATTE=box`）預設不量（`flicker: false`），和 steady 一樣。

訊息原文：

```
⚠ s0101 去背有一塊在閃（約講者框的 5%，在 x 1176–1374、y 684–1080，段內 0.0–3.9 秒裡跳了 62 格）→ 講者坐著不動就把 data-matte 改成 "steady"；站著走動就換不用去背的版面
⚠ s0101 寫了 data-matte="steady"，去背還有一塊在閃（…）→ 看那幾秒的截圖確認；還在閃就換不用去背的版面
```

門檻怎麼定的（量真的去背檔，面積是講者框的比例）：

| 去背檔 | 最大一塊 | 報不報 |
|---|---|---|
| 主宣傳片 s0101 v2（`data-matte="1"`，複本 build 重做） | 5.4%（右側椅子，第 0–116 格裡 62 格） | 報 |
| 主宣傳片 s0101 v3（`steady`，複本 build 重做） | 0.3%（手肘旁殘角，043 說過的） | 不報 |
| 主宣傳片 x0105（舊版本留下的去背檔，現在沒用到） | 2.5%（左下圓椅，看格子圖確認是真的一下有一下沒有） | 會報 |
| 短影片4 s0101（站著，現行） | 1.4%（手臂晃過身體） | 不報 |
| 短影片4 x0103（站著，現行） | 0.7% | 不報 |
| 短影片1 s0103、x0105（現行） | 0.1% | 不報 |
| 主宣傳片 x0106（現行） | 0.2% | 不報 |

054 寫「短影片4 開場（站著）報了也只是 ⚠」：現在根本不報（1.4% < 2%）；就算報也只是 ⚠，程式不會改 data-matte。

## 驗證（複本 `/Volumes/auto-edit-projects/.tmp-055/E/`；`projects/tmp055-E-*` 連結已拿掉，複本資料夾本身被本機規則擋住刪不掉，要手動 `rm -rf /Volumes/auto-edit-projects/.tmp-055/E`）

- 主宣傳片 r5 前（`plan.json.bak-r5`，沒有 edit.cuts）`build --check`：報 `0:59.82–1:00.67「你只要決」`；現在的 plan.json（`edit.cuts [[59.85, 60.72]]`）不報。rough 回報段的那一行用現有的 transcript.json、cuts.md、cuts.v1.json 直接餵 `roughResidual` 驗（沒重跑初剪）。
- 短影片5 r3 前（`plan.json.bak-r3`）`build --check`：報開頭 `0:00.00–0:00.60「把 AI」`；現在的 plan.json（`edit.cuts [[0, 0.6]]`）不報。另外模擬自動流程（NG 照 ng-scan 自己找的從 7.33 秒起、逐字稿照 main.mp4 換算）→ 走「單獨一小段」那條報開頭 0–0.6。
- 短影片5 複本重跑 `media.mjs rough --again`：ng-snap 從 0 剪（`--cut-out "0sec,89.867sec"`），回報段沒有開頭、重講的 ⚠。（這次重跑用預設 `-20dB`，剪掉 83%；當初做這支是用別的門檻，和這次改的無關。）
- 主宣傳片複本 s0101 換成 v2 的 x 檔 build：`⚠ s0101 去背有一塊在閃（約講者框的 5%…）`；換成 v3（steady）build：不報。
- 六支 PPA 現行版本各 build 一次：去背閃動多報 **0** 條；`build --check` 的初剪掃描多報 **0** 條（六支的 plan.json 都已經用 edit.cuts 處理過，或沒有留下來的）。

## 留下的問題

- C20 的「初剪逐字稿再跑一次 ng-scan」在六支 PPA 上一處都沒抓到（理由見上）；實際有用的是「NG 列沒剪乾淨」和「單獨一小段」。ng-snap 會把 NG 起點往後移最多 1 秒（逐字稿常比嘴巴早，這是設計），只改了頭尾那兩個情況；中間的照舊會留一截，靠初剪後這一行抓。
- 去背閃動沒有扣掉 `data-matte="window"` 相框外、`data-matte-front` 洞裡看不到的地方（PPA 沒用到）；面積用 analyzeMatte 通過的位置算，會比整張椅子小（x0105 那張圓椅看起來比 2.5% 大）。
- 給包 G 寫文件：`auto-edit-rough/references/ng-rules.md`（頭尾講稿外預設剪、原因原文）、`auto-edit-rough/SKILL.md` 退路表（「初剪後還留著…重講」「初剪開頭有講稿外的話」「初剪後還有…贅字」三種 ⚠ 的做法：照 → 做；回報段已經有，照貼給使用者）、`shared/style.md` 去背那一條（build 會量閃動、門檻 2%、坐著改 steady、站著換版面）、`USAGE.md` build 的 ⚠ 表（去背閃動、初剪後還留著）。
