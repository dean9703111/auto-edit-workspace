# 065 音效可以拖曳換位置、裁前後

作者原話：「還有「音效」無法拖曳換位置與裁剪前後，這也是問題」。

worktree `.claude/worktrees/agent-a29763cd38c9ead60`，沒有 commit。

## 做到什麼

時間軸音效軌上的每一顆音效（段落主音效、附加音效、動畫拍點 `P.sfx`、錄影的 `clicks`、等待卡的秒針、情緒點、自己加的）：

- **拖本體＝換位置**：游標 `grab`。提示寫「名稱　幾秒開始響　比原本晚／早 X 秒」。
- **拖左右邊緣＝裁掉開頭／結尾**：滑到邊緣 6 px 內，游標變 `col-resize`，邊緣出現黃色把手。提示寫「開頭／結尾裁掉 X 秒　剩 Y 秒」。
  - 方塊變短。聲音從裁點開始、到裁點停，裁過的那一端加 10 ms 淡入／淡出。
  - 往外拖到底＝不裁。
- **吸附**：照「吸附」開關，對字幕邊界、段落邊界、剪接點、播放頭。
  - 方塊的頭、尾、峰值（那一刻聽到的地方），哪個近就吸哪個。
- **擋下來的情況**：
  - 段落的音效拖不出那一段，其他拖不出影片。拖到邊界會停住，提示多一行原因。
  - 裁到剩不到 0.1 秒時停住，提示「最短 0.1 秒」。
- **復原、還原**：
  - 復原／重做、自動存檔都走原本那一套（`gestureBegin`／`gestureEnd`）。
  - AI 配的那一顆：右鍵「還原這一顆的位置和長度」，拖過、裁過才有這一項。屬性面板「還原位置和長度（N 顆）」。
  - 自己加的：右鍵「不裁（放回整顆）」，屬性面板的「不裁」。
- **哪裡聽得到**：
  - 快速試聽馬上聽得到（從檔案的裁點播、播到裁點）。
  - 完成影片預覽要按「更新預覽」，因為改的是時間，不算「只差聲音」。
  - build、輸出、剪映素材都照新的值。

## 決定（我先定的，作者可以推翻）

1. **存法**：
   - **AI 配的**：覆寫記在 `plan.json` 的 `edit.sfxAdjust: [{ id, shift?, trimIn?, trimOut? }]`。
     - 只覆寫那一顆，段落、動畫、情緒點本身一個字都不動。
     - 全拿掉＝還原，主合成和沒拖過一模一樣（有測試）。
   - **自己加的**（`edit.sfx`）：同一顆上多 `trimIn`／`trimOut`。位置本來就是它的 `at`。
2. **id**：
   - 段落主音效＝段 id。
   - 同一段的其他音效＝`段:名稱`，同名第 2 顆起 `段:名稱:2`。
   - 情緒點＝`mood:N`（`moods` 的第幾個）。
   - 動畫加減拍點時 `:N` 可能對到別顆。對不到時 build 印 ⚠ 並略過，不會 ✖。
3. **`shift` 是 rough.mp4 的秒數**：和 `edit` 其他欄位一樣。有剪段時照時間對照換到完成影片。
4. **套用順序**：覆寫在「3 秒規則、同一顆 3 秒內、每分鐘疏密、每集上限」這些「留哪顆」的規則**之後**才套，所以拖一顆不會讓別顆消失。
   - 「疊在一起」（0.4 秒內）、密度、響度照**拖過的新位置**算。
5. **為什麼段落的音效拖不出那一段**：剪映素材是每段一支透明 MOV，只放 `[段起點, 段終點)` 裡的音效，拖出去那支就沒有這顆。
   - 剪輯台擋，build 也擋（⚠ 略過位移）。
   - 原本就在段外一點的（峰值對齊時提早開始）照原本的位置算。
6. **方塊照實際長度畫**（最窄 12 px）：
   - 以前一律畫 0.6 秒寬，看不出響多久，也沒有邊緣可拖。
   - 不知道檔案多長（舊的檢查報告）的照舊畫，沒有邊緣。
   - 方塊比 24 px 窄時只能整顆拖，要放大時間軸才拖得到邊緣。
7. **情緒點的音效變成方塊**：可以拖、可以裁，快速試聽也播得到（以前快速試聽不播情緒點）。
   - 菱形縮小放在方塊上緣。
   - 要不要這顆照舊在分鏡表或跟 AI 說。
8. **裁過的那一顆不輪替變體**（`ding-2.wav` 之類）：變體長度不一樣，裁點會對不上，所以用本尊的檔。
9. **拖音效時播放頭也是吸附點**：拖音效時播放頭不跟著跑。其他拖曳照舊不吸播放頭。
10. **build 對不合法的覆寫只印 ⚠ 並略過那一項**：拖出那一段、對不到、裁太短。剪輯台已經擋了，會出現多半是 AI 後來改了段落或動畫，不該讓整支 build 失敗。
    - 存檔時（`sanitizeEdit`）格式錯照舊 ✖ 擋下。
    - 知道檔案長度時，自己加的那一顆裁到剩不到 0.1 秒也擋。
11. **AI 音效左右拖要有新的檢查報告**（有 `key`）：舊報告沒有 `key`，只能上下拖音量，游標是 `pointer`。

## 改了哪些檔

| 檔 | 改了什麼 |
|---|---|
| `shared/template/tools/lib/edit.mjs` | `EDIT_KEYS` 加 `sfxAdjust`。新的常數：`SFX_ADJUST_ID`、`SFX_ADJUST_KEYS`、`SFX_TRIM_MAX`（10）、`SFX_SHIFT_MAX`（600）、`SFX_MIN_LEN`（0.1）、`SFX_TRIM_FADE`（0.01）。`normalizeEdit` 檢查 `edit.sfx[].trimIn／trimOut` 與 `edit.sfxAdjust`：同一顆留後面那筆並 ⚠、全是 0 拿掉、照 id 排 |
| `shared/template/tools/lib/plan.mjs` | 每一顆音效有 `key`，段上記 `sfxKeys`。`applySfxAdjust` 在留哪顆的規則之後套位移與裁切，並記 `base`、`len`。`trimCue` 寫 `from`／`dur`／`fadeIn`／`fadeOut`，記 `fileAt` 給疊在一起的檢查用。自己加的音效套 `trimIn`／`trimOut`。`--check --json` 的 `items[].sfx[]` 多 `key`、`base`、`len`、`dur`，`moods[]` 多 `cue` |
| `shared/template/tools/lib/main.mjs` | `<audio>` 依需要多寫 `data-media-start`、`data-fade-in`、`data-fade-out`（沒裁的一個字都不變） |
| `shared/template/tools/lib/audio.mjs` | `rotateSfx` 跳過裁過的 |
| `shared/template/tools/editor.mjs` | 給頁面的音效清單多 `seconds`（檔案長度） |
| `shared/template/tools/editor/server/write.mjs` | 存檔檢查 `sfxAdjust`、`trimIn`／`trimOut`，知道長度時擋裁太短 |
| `shared/template/tools/editor/model.mjs` | `defaultEdit`／`normEdit` 帶 `sfxAdjust` 與裁切。新增 `adjOf`、`setAdj`、`sfxSpan`、`SFX_MIN` |
| `shared/template/tools/editor/live-sound.mjs` | `sfxAdjust` 不算「只差聲音」 |
| `shared/template/tools/editor/app.js` | 音效方塊照覆寫算位置與長度，情緒點音效也做成方塊。拖曳：`sfxMover`、`dragSfxMove`、`dragSfxEdge`、`snapSfx`、`sfxRange`。時間提示、右鍵選單（`sfx`、`usfx`、新的 `msfx`）、屬性面板的還原與「不裁」 |
| `shared/template/tools/editor/timeline.js` | 方塊照長度畫（`sfxW`）。裁過的那一端畫亮邊，可裁的邊緣畫黃色把手。`hit` 判邊緣與 `msfx`，`cursorFor` 給 `grab`／`col-resize`。`snap` 多 `play` 選項 |
| `shared/template/tools/editor/preview.js` | 快速試聽 `tickSfx`：從裁點播、播到裁點，10 ms 淡入淡出（只動這幾行，沒碰安全框） |
| `shared/template/tools/editor/index.html` | 操作說明的「音效」一行 |
| `shared/template/EDITOR.md` | 欄位表加 `sfxAdjust`、`edit.sfx` 的裁切。「聲音」加「拖曳音效、裁前後」，改掉情緒點「只能看」。右鍵選單表 |
| `shared/template/USAGE.md` | 6.1 加 `sfxAdjust` 一列 |
| `shared/template/USAGE-reference.md` | R2.6 `items[].sfx[]` 的新欄位 |
| `specs/contracts/check-json.md` | `items[].sfx`、`moods[].cue` |
| `dev/tests/sfx-drag-trim.test.mjs`（新，進 `test:fast`） | 9 個：欄位檢查、存檔寫回與還原、id、位移／裁切的 `<audio>`、剪映分段、剪段時的時間軸、⚠ 略過、疊在一起照新位置、還原＝一模一樣、頁面 model、預覽指紋 |
| `dev/tests/sfx-drag-trim-mix.test.mjs`（新，要 Chrome） | 真的 build＋HyperFrames render＋ffmpeg 量：主音效往後拖 1 秒、裁後段 0.4 秒；自己加的裁前段 0.1 秒。開始響、停的時間誤差 < 0.03 秒 |
| `dev/tests/edit.test.mjs`、`moods.test.mjs` | 錯誤訊息的可用欄位、`moods[0]` 的鍵多 `cue` |
| `dev/tests/editor-context-menu-ui.test.mjs` | 自己加的音效抓方塊中間拖（原本抓左緣 1 px，現在那裡是裁剪） |
| `dev/tests/fixtures/032-p3e/*.json` | `P3E_UPDATE=1` 重產。差別只有新增的 `key`、`base`、`len`、`sfxKeys`（逐行比過，沒有別的行變） |
| `package.json` | `test:fast` 加 `sfx-drag-trim.test.mjs` |

## 測試

TEST_RESULTS

## 剪輯台實測（projects/example 的複本）

- **環境**：複本放在 scratchpad，`cp -R`，不是連結。`shared/template`、`shared/sfx` 連到這個 worktree。
- **做法**：`startEditor` 開剪輯台，用 puppeteer 拖一次、裁一次。截圖在這個資料夾。截圖左上角的黃框是腳本加的標註，寫當下的游標（headless 截圖不會畫出滑鼠）。

| 截圖 | 看什麼 |
|---|---|
| `1-hover-body.png` | 滑到 s0103 的 impact 方塊中間：游標 `grab` |
| `2-dragging-body.png` | 拖曳中，提示「綜藝「咚咚」　0:26:20 開始響　比原本晚 0.50 秒」 |
| `3-hover-edge.png` | 滑到 x0109 的 shine 右邊緣：游標 `col-resize`、黃色把手、提示「拖曳裁掉「閃亮登場」的結尾（往裡拖＝裁短，往外拖＝放回來）」 |
| `4-trimming-edge.png` | 裁剪中，提示「閃亮登場　結尾裁掉 0.62 秒　剩 1.30 秒」 |
| `5-after-trim.png` | 裁完：方塊變短。選取框蓋住了右端的亮邊。滑上去的提示多一行「結尾裁 0.62 秒（按右鍵可以還原）」；右邊是情緒點「解法・success」的方塊 |
| `6-context-menu.png` | 拖過的 s0103 按右鍵：多一項「還原這一顆的位置和長度」 |

`ui-verify.log` 的結果：

```
本體上的游標：grab
拖曳中的提示："綜藝「咚咚」　0:26:20 開始響　比原本晚 0.50 秒"
放開後 edit.sfxAdjust：[{"id":"s0103","shift":0.5}]
plan.json edit.sfxAdjust：[{"id":"s0103","shift":0.5}]
報告回來後 s0103 開始響：26.669（拖之前 26.169）
右邊緣的游標：col-resize
裁剪中的提示："閃亮登場　結尾裁掉 0.62 秒　剩 1.30 秒"
裁完 edit.sfxAdjust：[{"id":"s0103","shift":0.5},{"id":"x0109:shine","trimOut":0.617}]
復原一次後：[{"id":"s0103","shift":0.5}]
重做後：[{"id":"s0103","shift":0.5},{"id":"x0109:shine","trimOut":0.617}]
s0103 右鍵選單：["換一顆音效","靜音","還原成原本的","調整這段音量","▶ 試聽","還原這一顆的位置和長度","看這段的其他屬性"]
還原後 edit.sfxAdjust：[{"id":"x0109:shine","trimOut":0.617}]
頁面錯誤：[]
```

剪輯台存的 plan.json 接著跑 `build.mjs --check --json`：`ok true`，音效沒有 ⚠。shine 是 `{"name":"shine","at":104.054,…,"dur":1.3,"key":"x0109:shine","base":104.054,"len":1.917}`。

## 沒做、要注意

- **一顆一顆來**：沒有多選一起拖，也沒有用鍵盤（方向鍵）微調位置或裁切。
- **AI 改了動畫拍點的數量之後**：`段:名稱:N` 可能對到別顆，或對不到（⚠ 略過）。
  - 沒有自動搬移覆寫。
  - EDITOR.md 寫了「build 印對不到時告訴使用者」。
- **舊的檢查報告**：沒有 `key`／`len` 時，AI 音效只能上下拖音量。剪輯台存一次、檢查報告重跑就有。
- **完成影片預覽**：拖過、裁過要按「更新預覽」，不像音量那樣即時套用。
- **`editor-segments-ui.test.mjs`「字幕分頁…」**：和 15 支整合測試一起平行跑時失敗一次（`Node is detached from document`），單獨重跑 8 個全過。和音效無關。
- **整套 `npm test` 沒有全部跑**：只跑了 `test:fast` 和動到的整合測試，清單在上面。
- **暫時連結**：worktree 根目錄暫時連了主目錄的 `node_modules` 來跑測試，已經拿掉。
