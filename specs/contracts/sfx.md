# 契約：音效（sfx）

- **擁有者**：005 sfx。**照它做**：002（`tools/lib/plan.mjs` 的音效政策、`scenes/*/scene.json` 預設、`plan.outro`、`lib/main.mjs` 的配樂 `<audio>`）、004（media 段 `clicks`）、003（`index.html` 音效區）、006（剪輯台音效清單、`look` 快取鍵）、001（文件）。
- **版本**：1（2026-10-31）。改這份要先改 `specs/005-sfx/spec.md`。
- 名詞：**人聲**＝build 重新編碼後的主軌，整合響度固定 −14 LUFS（`tools/lib/audio.mjs` 的 `LOUD.I`）。**M max**＝ffmpeg `ebur128` 的 momentary 最大值（音檔前後各補 1 s 靜音再量，跟 `shared/sfx/sources.json` 同一種量法；分析報告 03 §1 驗證過兩者一致）。**dB 相對人聲**＝音效在成片裡的 M max 減人聲整合響度。

## 1. `shared/template/kit/sfx.json` schema

檔案仍是「名稱 → 設定」的扁平物件（不加包一層，既有程式 `Object.keys(sfx.json)`、`seg.sfx in sfxConf` 都照常運作）。名稱＝檔名：`shared/sfx/<名稱>.wav`。

| 欄位 | 型別 | 必填 | 意思 | 誰讀 |
|---|---|---|---|---|
| `kind` | `"sfx"`／`"bgm"` | 是 | `sfx`＝段落音效（可寫在段落 `sfx`、scene.json、fx catalog）；`bgm`＝配樂，只能由 plan.json 第一層 `outro.music` 用 | 002 plan.mjs、006 剪輯台、003 gallery |
| `zh` | 字串 | 是 | 中文名（`--list`、gallery 顯示） | 002、003 |
| `use` | 字串 | 是 | 用在哪（情境、口播內容） | 文件、`--list` |
| `event` | 字串 | 是 | **時機**：檔案的峰值（`peak`）要對齊畫面上哪一格。寫成「…那一格」 | 文件、分鏡表、情境動畫作者 |
| `peak` | 數字（秒，≥ 0） | 是 | 檔案裡最大樣本的時間（`kind: "bgm"` 寫 0）。cue 的起播時間＝畫面事件秒數 − `peak` ＋ 1 格（既有公式，plan.mjs `mk()`） | 002 |
| `volume` | 數字（線性，0 < v ≤ 1） | 是 | 預設音量。**由 `targetDb` 換算**，不手填（§3） | 002 |
| `targetDb` | 數字（dB，≤ −3） | 是 | 目標大小，相對人聲。`kind: "sfx"`＝檔案 M max＋20·log10(`volume`)−(−14)；`kind: "bgm"`＝檔案**整合響度**＋20·log10(`volume`)−(−14) | 005 測試、`sfxBudget()` |
| `additive` | 布林 | 是 | `true`＝附加音效：不受「主音效相距 < 3 s 只留前一個」、不算每分鐘主音效密度（§4） | 002 |
| `maxPerVideo` | 整數 ≥ 1 或 `null` | 是 | 一集最多幾次；超過印 ⚠（不自動拿掉）。`null`＝不限 | `sfxBudget()` |
| `fadeIn`、`fadeOut` | 數字（秒） | 只有 `bgm` | 配樂淡入、淡出長度 | 002（呼叫 `renderBgmClip`） |

規則（`dev/tests/sfx.test.mjs` 檢查）：
1. 每個名稱都有 `shared/sfx/<名稱>.wav`、`shared/sfx/sources.json` 一筆、`shared/sfx/README.md` 一列、`NOTICE.md` 音效段出現一次。
2. `|peak − 實測最大樣本時間| ≤ 0.010 s`；`|實測 M max（或 I）＋20·log10(volume)＋14 − targetDb| ≤ 0.5 dB`；`targetDb ≤ −3`。
3. 不認得的欄位 → 測試失敗（避免拼錯欄位名沒人發現）。

範例（三種代表）：

```json
{
  "click":     { "kind": "sfx", "zh": "滑鼠點擊", "use": "螢幕錄影或情境動畫裡看得到游標按下的地方，一下一顆", "event": "游標按下那一格", "peak": 0.003, "volume": 0.331, "targetDb": -19.6, "additive": true, "maxPerVideo": null },
  "thunder":   { "kind": "sfx", "zh": "打雷", "use": "負面情緒：壓力、焦慮、晴天霹靂（15 金句 tone warn 預設）", "event": "負面問句或壞消息出現那一格", "peak": 0.37, "volume": 0.891, "targetDb": -3.0, "additive": false, "maxPerVideo": 3 },
  "bgm-outro": { "kind": "bgm", "zh": "結尾配樂", "use": "結語金句講完到片尾，plan.json 寫 outro 才有", "event": "outro.from 那句字幕的起點", "peak": 0, "volume": 0.562, "targetDb": -11.0, "additive": false, "maxPerVideo": null, "fadeIn": 3.2, "fadeOut": 1.85 }
}
```

（`peak`、`volume` 是預估值；實際值由 `node dev/tools/make-sfx.mjs --write` 依實測寫入，見 `contracts/cli-005.md` §1。）

## 2. 事件名清單（18 個，固定）

| 名稱 | kind | zh | use（用在哪） | event（峰值對齊） | additive | maxPerVideo | targetDb | 狀態 |
|---|---|---|---|---|---|---|---|---|
| `pop` | sfx | 泡泡 pop | 下方字卡揭開、第一張卡片出現 | 卡片或第一個元素出現那一格 | false | null | −7.8 | 凍結 |
| `tick` | sfx | 輕 tick | 條列逐條出現、步驟切換，每條一顆 | 每一條項目出現那一格 | **true** | null | −16.1 | 凍結 |
| `swipe` | sfx | 短 swoosh | 側邊欄推入、角標滑入 | 面板開始滑入那一格 | false | null | −8.9 | 凍結 |
| `whoosh` | sfx | 空氣 whoosh | **全畫面幕進場（04a–d）、從講者切到螢幕錄影的第一段**（不再用在章節） | 全畫面幕蓋滿那一刻（聲音先漸強約 0.74 s） | false | null | −8.0 | 凍結，用途改 |
| `flip` | sfx | 翻牌 | 翻牌、翻卡、切換 | 牌翻到正面那一格 | false | null | −9.9 | 凍結 |
| `type` | sfx | 打字短串 | 打字機動畫起手 | 第一個字打出來那一格 | false | null | −16.5 | 凍結 |
| `glitch` | sfx | 數位故障 | 出錯、系統崩潰、bug | 畫面開始故障那一格 | false | null | −11.1 | 凍結 |
| `riser` | sfx | 上升張力音 | 揭曉前的鋪墊 | 揭曉那一格（峰值在檔尾，聲音提早約 1.5 s 開始） | false | null | −8.9 | 凍結 |
| `ding` | sfx | 提示「滴」 | 講重點、提醒（「提醒一下大家」）、答案揭曉 | 重點字出現那一格 | false | null | −12.6 | 第一批換檔 |
| `success` | sfx | 完成音 | 解法、成果、完成、問題解決 | 綠勾或結果出現那一格 | false | null | −5.2 | 第一批換檔 |
| `alert` | sfx | 錯誤「嗶嗶」 | 千萬不要、踩坑、錯誤、限制 | 紅章或警告出現那一格 | false | null | −6.9 | 第一批換檔 |
| `click` | sfx | 滑鼠點擊 | 螢幕錄影或情境動畫裡**看得到游標按下**的地方，一下一顆 | 游標按下那一格 | **true** | null | −19.6 | 第一批新增 |
| `impact` | sfx | 綜藝「咚咚」 | 蓋章、重擊、數字或金句落定 | 落定、蓋章落地那一格（第一下） | false | null | −6.2 | 第二批換檔 |
| `chapter` | sfx | 章節「嘭」 | 章節轉場（01） | 章名落定那一格（01 的 `titleAt`＝段起點＋0.45 s） | false | null | −3.0 | 第二批新增 |
| `sparkle` | sfx | 閃粉 | 入場、介紹主角（14 講者介紹）、金句閃亮（15） | 主角或金句出現完成那一格 | false | 6 | −5.9 | 第三批新增 |
| `shine` | sfx | 閃亮登場 | 轉折亮點：本集最得意的設計、關鍵詞大字進場 | 關鍵詞到位那一格 | false | 3 | −3.0 | 第三批新增 |
| `thunder` | sfx | 打雷 | 負面情緒：壓力、焦慮、晴天霹靂 | 負面問句或壞消息出現那一格 | false | 3 | −3.0 | 第三批新增 |
| `bgm-outro` | **bgm** | 結尾配樂 | 結語金句講完到片尾 | `outro.from` 那句字幕的起點 | false | null | −11.0（整合響度） | 第三批新增 |

- 凍結＝音檔與 `volume` 不變，只補新欄位；`targetDb` 是現況換算（sources.json `max_m_lufs`＋20·log10(`volume`)＋14，四捨五入到 0.1 dB）。
- `targetDb` 的出處：第一到三批取分析報告 `03-sfx-map.json` 各音效的 `rel_to_voice_db`（剪映草稿裡相對人聲的中位數），比 −3 大的壓到 −3（定案「音量跟剪映但上限人聲下 3 dB」）；`bgm-outro` 見 §6.2。完整換算表在 `specs/005-sfx/spec.md` FR-020。
- `maxPerVideo` 的出處：`thunder` 3＝G18「打雷 ≤ 3」（agent-skills `JY/SKILL.md` 音效現行規則表「全片 ≤3 顆」）；`sparkle` 6＝G18「金句音效 ≤ 6」（`JY/SKILL.md` 金句字卡「全片約 ≤6 顆」）；`shine` 3＝**建議初值**（剪映定稿 esim 2 次、PPA 1 次，分析報告 03 §2）。`click` 不設上限，理由見 `specs/005-sfx/spec.md`「需要主代理裁決」第 1 條。
- 不做：G18 的「疑問 ≤ 1」（定案沒有疑問事件）、金錢、秒針。

## 3. 音量換算（給所有實作者）

```
sfx：volume = 10 ^ ((−14 + targetDb − 檔案 M max) / 20)
bgm：volume = 10 ^ ((−14 + targetDb − 檔案整合響度) / 20)
成片裡某一顆 cue 相對人聲（dB）= targetDb + 20·log10(cue.volume ÷ kit.volume) − edit.volume.voice
```

- `cue.volume` 是 plan.mjs 算完的最終線性音量（已乘 scene.json `extra[].volume`、段落 `sfxVolume`、`edit.volume.sfx`、整支淡入淡出）。
- 例：`chapter` 檔案 M max −16 LUFS、targetDb −3 → volume＝10^((−14−3+16)/20)＝0.891；段落寫 `"sfxVolume": 2` → cue.volume 1.122 → 相對人聲 −1.0 dB → 超過上限 −3 dB → ⚠（§4.4）。

## 4. 音效政策（002 在 plan.mjs 照這節做；005 在 `audio.mjs` 提供 `SFX_RULES`、`sfxBudget()`）

### 4.1 主音效與附加音效

| 種類 | 來源 | 3 s 規則 | 每分鐘密度 | `maxPerVideo` | `sfxExtra: false` 關得掉 |
|---|---|---|---|---|---|
| 主音效（`it.sfx`） | scene.json `sfx.main`、fx catalog `sfx`、段落 `"sfx"` | 受（音效名的 `additive` 是 `false` 時） | 算 | 算 | 否（寫 `"sfx": null`） |
| 主音效但音效名 `additive: true` | 段落寫 `"sfx": "click"` 或 `"tick"` | **不受**（不被拿掉，也不讓後一顆被拿掉） | 不算 | 算 | 否 |
| 附加音效（`it.sfxExtra`） | scene.json `sfx.extra`、段落 `clicks`（§5） | 不受（既有） | 不算 | 算 | 是（含 `clicks`） |

- 3 s 規則（既有 `SFX_GAP`）改成：排序後逐顆看，`sfxConf[name].additive === true` 的 cue 跳過、不更新 `lastSfx`。
- 同一段內兩顆附加音效（或附加音效和主音效）起點相距 < 0.2 s 只留前一顆（既有 `EXTRA_GAP`，不變）。連點兩下的滑鼠聲（剪映實測最近 0.63 s，分析報告 01 §5.2）不受影響。
- 段落 `"sfx"` 只能填 `kind: "sfx"` 的名稱；填 `bgm-outro` → ✖（原文見 `contracts/cli-005.md` §3.3）。

### 4.2 `SFX_RULES`（`tools/lib/audio.mjs` 匯出，數字只在這裡定義，文件的數字寫在 `shared/style.md`，兩者由 `sfx.test.mjs` 比對）

```js
export const SFX_RULES = { gapSec: 3, extraGapSec: 0.2, perMinute: 2, capDb: -3 };
```

| 鍵 | 值 | 出處 |
|---|---|---|
| `gapSec` | 3 s | 既有 style.md「兩個主音效相距不到 3 秒時，只留前一個」 |
| `extraGapSec` | 0.2 s | 既有 plan.mjs `EXTRA_GAP` |
| `perMinute` | 2 顆／分 | G18「每分 ≤ 2」（agent-skills `JY/PAL` `budget.per_minute_max: 2`）；剪映定稿不含點擊 1.9 顆／分（分析報告 01 §5.1） |
| `capDb` | −3 dB | 定案「上限人聲下 3 dB」 |

002 把 plan.mjs 的 `SFX_GAP`、`EXTRA_GAP` 改成從這裡 import（行為不變）。

### 4.3 `sfxBudget(cues, sfxConf, opts)`（純函式，005 寫、有測試；002 在 resolvePlan 音效段最後、`edit` 音量調整之後呼叫）

```js
// cues：全部 cue（主＋附加），已扣掉被 3 s 規則拿掉的
//   [{ id: 's05', name: 'chapter', at: 62.4, volume: 0.891, main: true }]
// opts：{ voiceDb = 0 /* edit.volume.voice */, outDur /* 成片秒數 */, fmt /* 秒數 → "1:02.40" */ }
// 回傳：
{
  count: { pop: 12, tick: 30, chapter: 4 },            // 每種音效的次數（主＋附加）→ --check --json 的 sfxCount
  over:  [{ name: 'thunder', n: 4, max: 3, cues: [{ id: 's03', at: 12.4 }, …] }],
  dense: [{ from: 0, to: 60, n: 4, ids: ['s01', 's02', 's03', 's04'] }],   // 主音效、非 additive，floor(at/60) 分組，n > perMinute
  loud:  [{ id: 's05', name: 'chapter', at: 62.4, relDb: -1.2 }],         // relDb > capDb
  levels: { main: [-12.6, -3.0, -6.2], extra: [-19.6, -16.1] },          // [最小, 最大, 中位]／[最小, 最大]（dB 相對人聲）
  perMinuteAvg: 1.8,                                                     // 主音效（非 additive）÷ 成片分鐘數
  warnings: ['⚠ …'],                                                      // 原文見 contracts/cli-005.md §3.2；002 推進 resolvePlan 的全域 warnings
  lines: ['音效次數：…', '音效密度：…']                                   // --check 文字報告要印的資訊行
}
```

- `kind: "bgm"` 不進 `cues`。
- 只產生 ⚠，**不拿掉任何 cue**（拿掉只有 3 s 規則一種，維持現狀）。

### 4.4 判定

| 檢查 | 條件 | 結果 |
|---|---|---|
| 次數上限 | 某音效 `count[name] > maxPerVideo` | 每種音效 1 行 ⚠，列出全部 cue 的段 id 與時間 |
| 每分鐘密度 | 某個 `floor(at/60)` 分鐘的主音效（非 additive）> 2 顆 | 全片合成 1 行 ⚠，列出超過的分鐘與顆數 |
| 音效比例 | 某顆 cue 的相對人聲 > −3 dB（容差 0.05 dB） | 全片合成 1 行 ⚠，列出最多 8 顆（段 id、音效、時間、dB、要再調低幾 dB） |

## 5. `clicks`（錄影與情境動畫的點擊）

- 欄位：`"clicks": ["#21@安裝", "+3.20", "#22"]`，可寫在 **media 段**（004 加進 `MEDIA_KEYS`）與 **custom 段**（002 加進 custom 的段落欄位）。
- 每一項的時間文法＝004 `contracts/media.md` §2.2（media 段所有時間欄位共用）：`"#N"`、`"#Ne"`、`"#N±秒"`、`"#N@詞"`、`"#Ne@詞"`、`"+秒"`（本段起點後；`@詞` 的解析照 002 的 `contracts/cues.md`）。不能寫絕對秒數；要落在本段時間內。custom 段用同一套語法。
- 語意：每一項＝一顆 `click` 附加音效，畫面事件時間＝該項時間，起播＝事件 − `click.peak` ＋ 1 格。
- 只在**畫面上看得到游標按下**時寫（錄影用 `media.mjs frame --grid`／contact sheet 確認；情境動畫是自己畫的游標按下那一拍）。口播說「按下去」但畫面沒有點擊，不寫（agent-skills `JY/SKILL.md`「口播說『點擊』不算」）。
- 段落寫 `"sfxExtra": false` 時，`clicks` 也一起關掉。
- 錯誤原文（004、002 共用格式）：`✖ m01 clicks[1]（1:14.80）不在這段 1:01.30–1:14.10 裡 → 改成這段範圍內的句號或 +秒數`；`✖ m01 clicks 要寫成陣列，例如 ["+3.2", "#21@安裝"]`。

## 6. 結尾配樂 `bgm-outro`

### 6.1 plan.json 第一層 `outro`（欄位最終清單在 002 的 `contracts/plan-fields.md`；這裡是 005 要求的語意）

```json
"outro": { "from": "#423", "music": "bgm-outro", "volume": 0 }
```

| 欄位 | 型別 | 預設 | 意思 |
|---|---|---|---|
| `from` | `"#N"`／`"#N@詞"` | 必填 | 起播句（結語金句講完後、開始收尾那一句的起點） |
| `music` | `kind: "bgm"` 的名稱或 `null` | `"bgm-outro"` | `null`＝這集不配 |
| `volume` | dB（−20～+6） | 0 | 這集配樂再調多少；也會乘 `edit.volume.sfx` |
| `fadeOut` | 秒（0–10） | kit 那顆的 `fadeOut`（`bgm-outro` 1.85） | 這集的淡出長度（002 spec FR-052 加的覆寫；範圍錯的原文照 `cli-002.md` §1.6） |

不寫 `outro`＝不配樂（現況）。

### 6.2 行為（002 照做；005 提供 `renderBgmClip`）

1. `start`＝`from` 句起點（成片秒數），`end`＝成片長度，`span = end − start`；`len`＝配樂檔長度。
2. `len ≥ span`：從 `start` 播 `span` 秒。`len < span`：改從 `end − len` 起播（對齊片尾），報告印資訊行（原文 `contracts/cli-005.md` §3.4），不是 ⚠。
3. 淡入 `min(fadeIn, 播放長度 ÷ 3)`、淡出 `min(max(outro.fadeOut ?? kit.fadeOut, edit.fadeOut), 播放長度 ÷ 3)`。`fadeIn` 3.2 s 出處：agent-skills `JY/SKILL.md` 音效表「淡入 3.2s（config `ending.music_fade_in`）」、esim 草稿 `audioFade.in 3.2`（分析報告 01-timeline）；`fadeOut` 1.85 s 是主代理裁決（002 規格，2026-10-31；取代本契約原本的建議初值 2.0 s）。
4. 增益＝kit `volume` × 10^(`outro.volume`/20) × 10^(`edit.volume.sfx`/20)，**淡入淡出與增益烤進檔案**：build 呼叫

   ```js
   renderBgmClip(src /* shared/sfx/bgm-outro.wav */, dst /* <hyperframes>/assets/bgm-outro-<hash>.wav */, { from /* 檔內起點秒 */, dur, fadeIn, fadeOut, gain })
   // → { file, dur }；用 ffmpeg atrim＋afade＋volume，輸出 48 kHz 立體聲 pcm_s16le；同參數不重做（檔名含參數 hash）
   ```

   主合成放一個 `<audio id="bgm-outro" src="…" data-start="<起播秒>" data-volume="1">`（002 的 `lib/main.mjs`）。
5. 配樂不進 `sfxBudget` 的 cue，不受 3 s 規則；`targetDb` −11 dB 的出處：本規格 2026-10-31 量測作者剪映定稿用的結尾配樂（`/Volumes/video/音樂/適合放在結尾，感性.mp3`，前 40.5 s 整合響度 −17.9 LUFS、前 22.1 s −18.3 LUFS，草稿 volume 0.589＝−4.6 dB），對 esim 人聲 −10.6 LUFS 是 −11.9 dB、對 PPA 人聲 −13.0 LUFS 是 −9.9 dB，取中間 −11 dB。
6. 剪映定稿的配樂在人聲還在講的時候就起播（esim 954.1 s 起，人聲到 984.7 s），所以 −11 dB 是「墊在講話底下」的大小，不另做 ducking。

## 7. 章節轉場與全畫面幕拆開後的預設音效（002 改 scene.json；fx catalog 不改）

| 情境 | 主音效＋落點（改後） | 改前 | 附加音效 |
|---|---|---|---|
| 01 chapter | **`chapter`：`titleAt`**（段起點＋0.45 s；剪映「嘭」起音在章節起點＋0.37～0.40 s、檔案峰值 0.08 s → 峰值落在＋0.45～0.48 s，分析報告 01 §2.7、§5.2） | `whoosh`：`start - 0.15` | — |
| 02 chapter-tag | `swipe`：`in` | 不變 | — |
| 03 side-panel | `swipe`：`start` | 不變 | `tick` 每條 |
| 04a–d 全畫面 | `whoosh`：`start - 0.15` | 不變（`whoosh` 從此只給全畫面幕與切錄影） | `tick` |
| 05–13 | 不變（07 的 `ding`／`alert`／`success` 換的是音檔，scene.json 不動） | — | 不變 |
| 14 speaker | **`sparkle`：`in + 0.1`** | `pop`：`in + 0.1` | — |
| 15 quote | **`{ "default": "sparkle", "good": "sparkle", "warn": "thunder" }`：`in + 0.1`** | `pop`：`in + 0.1` | — |
| media | 不配；從講者切到錄影的第一段在 plan 寫 `"sfx": "whoosh"`（style.md 既有規則） | 不變 | `clicks` → `click` |
| custom | 不配（plan 寫 `"sfx"`） | 不變 | `clicks` → `click` |
| fx 字卡動態 01–40 | **不改**（音效是動畫節拍的一部分；要 `shine`／`sparkle` 就在那段寫 `"sfx"`） | — | — |

`shine` 沒有任何預設，只在 plan 寫 `"sfx": "shine"` 時出現；`thunder` 只有 15 tone warn 預設。

## 8. `tools/lib/audio.mjs` 給別人用的介面（版本 1）

| 匯出 | 簽名 | 誰用 | 備註 |
|---|---|---|---|
| `SFX_RULES` | 常數 §4.2 | 002 | — |
| `sfxBudget` | §4.3 | 002 | — |
| `renderBgmClip` | §6.2 | 002 | 需要 ffmpeg |
| `audioKey` | `audioKey({ src, cutpoints, loudnorm, declick, frame, look = null })` | 002（build）、006 | `look`＝`ensureLook().key`（`{ v, color, lut, slim, footage }`，006 `contracts/look.md` §4），005 不解讀內容；`look` 是 `null` 時戳記和現在一模一樣（舊專案不重新編碼） |
| `encodeFootagePolished` 的 `lut` | `encodeFootagePolished(src, dst, { …, lut = null })` | 002（build） | 照 look.md §4：原樣轉給 `encodeFootage(…, { crop, lut })` |
| `audioReportLines` | `audioReportLines(info, { loudnorm, declick, cutpointsExist, sfx = null })` | 002（build） | 新參數 `sfx`＝`sfxBudget()` 的回傳；印「音效比例」行（原文 `contracts/cli-005.md` §3.1）。**刪掉**舊的「⚠ 人聲被調大 N dB，音效相對人聲小了 N dB」：人聲一律被調到 −14 LUFS，音效比例只由 `targetDb` 決定，舊提醒在每支收音偏小的片都會誤報 |
| `cutDips` | `cutDips(f32, { channels, rate, points, ref = null })` → `[{ at, floorDb, minDb, runMs, hole, preexisting }]` | 005 測試 | 剪接點 RMS 凹洞量測（spec FR-030） |
| `encodeFootagePolished` | 不變；只有 spec FR-031 成立時才加 `join` 參數（見該條） | 002 | — |

## 9. 相容性

- 舊 plan.json 寫 `"sfx": "whoosh"` 在章節段：照樣播 whoosh（使用者明寫的優先）。
- 舊 plan.json 沒有 `clicks`、`outro`：行為和現在一樣，只多「音效次數」「音效密度」「音效比例」資訊行。
- `build.mjs --sfx <私人資料夾>`：私人資料夾要放齊 `kit/sfx.json` 的每個名稱（18 個 wav）；作者自己的 CC BY 結尾曲可以放在這裡當 `bgm-outro.wav`，但不能進 `shared/sfx/`（憲法 VII），影片說明欄要標出處。
- `--check --json`（002 的 `contracts/check-json.md`）加 `sfxCount`＝`sfxBudget().count`、`sfxBudget`＝`{ over, dense, loud, perMinuteAvg }`。

## 10. 測試 fixture（002 的 `plan.test.mjs` 與 005 的 `audio.test.mjs` 共用這組期望值）

| 輸入 | 期望 |
|---|---|
| 兩段 07 key-point 主音效相距 2 s | 後一顆被拿掉（不變） |
| m01 `clicks: ["+1.0", "+1.63"]`，同一秒還有 05 的 pop 主音效 | 兩顆 click 都在；pop 也在（click 是附加音效）；`count.click`＝2 |
| 段落 `"sfx": "click"` 與下一段 pop 相距 1 s | 兩顆都在（additive 不受 3 s 規則） |
| 4 段 15 quote `tone: "warn"` | `over` 有 `thunder` n 4 max 3；warnings 1 行 |
| 0:00–1:00 有 3 顆主音效、5 顆 tick | `dense` 1 筆 n 3；tick 不算 |
| 01 chapter 段 `"sfxVolume": 2` | `loud` 1 筆 relDb −1.0 |
| 段落 `"sfx": "bgm-outro"` | ✖ |
| `outro.from` 到片尾 40.5 s、配樂 20 s | 起播＝片尾 − 20 s，資訊行 1 行，0 ⚠ |
