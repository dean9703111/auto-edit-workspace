# Implementation Plan: 005 sfx

**Branch**: `005-sfx` | **Date**: 2026-10-31 | **Spec**: `specs/005-sfx/spec.md`

**Input**: `specs/005-sfx/spec.md`；契約 `specs/contracts/sfx.md`、`specs/contracts/cli-005.md`

## Summary

1. 先把 `kit/sfx.json` 的 schema（`kind`、`event`、`targetDb`、`additive`、`maxPerVideo`）與測試立起來，現有 12 顆照現況補值，`sfx.test.mjs` 對現況就要綠。
2. 寫 `dev/tools/make-sfx.mjs`（Node 22 內建模組＋ffmpeg）：合成（C）、下載解碼加工（B）、統一處理鏈、A/B 試聽檔、`--write` 回寫。
3. `tools/lib/audio.mjs` 加 `SFX_RULES`、`sfxBudget()`、`renderBgmClip()`、`cutDips()`、`audioKey` 的 `look`，重寫「音效比例」報告行。
4. 三批音效各自做候選 → 作者 A/B → `--write`；三批彼此獨立可平行，只有回寫共用檔（sources.json、kit、README、NOTICE）那一步要排隊。
5. 剪接點：先用合成音驗證量測方法（15 ms 不是凹洞、30 ms 是），再量範例專案；有凹洞才做 0.1 s 交叉淡化。
6. 002／003／004／006／001 要改的地方都寫在 spec「請 00N 加」，照契約做。

## Technical Context

**Language/Version**：Node 22（作者機器實測 v24.22.1 也可；只用 Node 22 有的 API）

**Primary Dependencies**：ffmpeg／ffprobe（作者機器 8.1；只用 `ebur128`、`adelay`、`apad`、`ametadata`、`atrim`、`afade`、`volume`、`aresample`，ffmpeg 4.4 起都有）。不加 npm 套件。auto-editor 29.3.1 只在 US4 產生範例 work/ 時用。

**Storage**：檔案。`shared/sfx/*.wav`、`shared/sfx/sources.json`、`shared/template/kit/sfx.json`、`specs/005-sfx/research.md`（實作時新建）。

**Testing**：`node --test dev/tests/sfx.test.mjs dev/tests/audio.test.mjs`；需要 ffmpeg 的測試沒有 ffmpeg 時 skip（沿用 `audio.test.mjs` 的 `SKIP`）。

**Target Platform**：Mac（zsh）、Windows（PowerShell）。路徑一律 `path.join`；`spawnSync('ffmpeg', …)` 不用 shell；`--only` 帶逗號時文件寫加引號。

**Project Type**：CLI 工具＋函式庫＋資料檔。

**Performance Goals**：`make-sfx.mjs --candidates`（全部名稱、快取已下載）≤ 60 s；`sfx.test.mjs` ≤ 20 s（18 個檔各量一次 ffmpeg，約 0.3 s／檔）。

**Constraints**：剪映試聽檔不進 repo（憲法 VII）；凍結 8 顆位元組不變；`shared/sfx/` 新增大小 ≤ 6 MB（估算見「資產大小」）。

**Scale/Scope**：18 個音效、約 30 個候選配方。

## Constitution Check

| 原則 | 檢查 | 結果 |
|---|---|---|
| I. AGENTS.md 是規則、工具做計算 | 音量換算、次數、密度、比例都由 `audio.mjs` 算，文件只寫「看哪一行」 | 過 |
| II. 零依賴、跨平台 | make-sfx 只用 `node:` 模組＋ffmpeg；不裝 Python（`make_sfx.py` 退役但留檔，dev/ 例外）；新增執行期資產＝18 個 wav，大小與來源寫在 sources.json、NOTICE | 過 |
| III. 弱模型優先 | `event` 欄位寫「對齊哪一格」；⚠ 都帶「→ 改法」；style.md 用決策表 | 過 |
| IV. 單一真相 | 規則數字在 `SFX_RULES`（程式）＋`style.md`（文件），`sfx.test.mjs` 比對；每顆音量只存 `targetDb`，`volume` 由 make-sfx 換算並由測試驗 | 過（`volume` 是衍生值，見下「複雜度」） |
| V. 停點固定 | 不新增停點；A/B 試聽是作者維護工作，不是剪片停點 | 過 |
| VI. 可驗證交付 | 每條 FR 都寫了「驗」；research.md 留量測數據 | 過 |
| VII. 授權乾淨 | B 只用 CC0；C 以 CC0 釋出；A/B 輸出被擋在工作區外；`sfx.test.mjs` 掃剪映字樣 | 過 |
| VIII. 不擴張範圍 | 不做疑問、金錢、秒針；fx catalog 不改；交叉淡化只有量到凹洞才做 | 過 |

## Project Structure

### Documentation (this feature)

```text
specs/005-sfx/
├── spec.md
├── plan.md          # 本檔
├── tasks.md
├── docs.md          # 交 001 的文件原文
└── research.md      # 實作時建：A/B 紀錄、剪接點 RMS 數據、make_sfx.py 退役紀錄
specs/contracts/
├── sfx.md
└── cli-005.md
```

### Source Code（只列 005 擁有、會動的檔）

```text
shared/sfx/
├── *.wav                 # 換 ding success alert impact；加 click chapter sparkle shine thunder bgm-outro
├── sources.json          # 每筆加 sha256、kind；換／加的 10 筆整筆重寫
└── README.md             # make-sfx --write 整份重產
shared/template/kit/sfx.json        # 18 項，新欄位
shared/template/tools/lib/audio.mjs # SFX_RULES、sfxBudget、renderBgmClip、cutDips、audioKey look、audioReportLines
dev/tools/make-sfx.mjs              # 新
dev/tools/make_sfx.py               # 檔頭兩行＋main() 開頭 exit（退役）
dev/tests/sfx.test.mjs              # 新
dev/tests/audio.test.mjs            # 加測試、改「報告」那一條
NOTICE.md                           # 只改「音效」段
```

**Structure Decision**：make-sfx 是單一檔案（憲法 VIII：單次使用的程式不抽象化），內部用註解分段。`audio.mjs` 是剪片流程的執行期程式，只加純函式與一個 ffmpeg 包裝（`renderBgmClip`）。

## Phase 0：研究（本規格已做的量測）

| 項目 | 方法 | 結果 | 用在 |
|---|---|---|---|
| 剪映 10 顆的響度、形狀、相對人聲 | 分析報告 03、map（ebur128 補 1 s 靜音） | map `rel_to_voice_db`、`shape` | FR-010～012、FR-020 |
| 驗量法 | 本規格對 `sfx-preview/` 3 顆重量 M max | 嘭 −7.874、打雷 −9.915、仙塵 −14.225 LUFS，與 map 一致 | cli-005 §1.2 量測指令 |
| Kenney 候選檔名與頻譜 | 本機已解壓的 Kenney Impact／Interface 包（`/Users/lindingyuan/web-survivor-old/assets/audio/`），ffprobe＋`aspectralstats` | `impactSoft_heavy_000–004` 重心 72–143 Hz；`impactPunch_heavy_000–004` 254–863 Hz；`glass_004` 0.69 s、7.2 kHz；`confirmation_001` 0.29 s、823 Hz；`error_005／006` 0.50 s、0.9／1.1 kHz。原始數字：`scratchpad/w005/kenney-measure.txt` | FR-010～012 候選 |
| 結尾配樂大小 | `/Volumes/video/音樂/適合放在結尾，感性.mp3`（作者的 CC BY 曲，只量不用），ebur128 | 前 40.5 s：I −17.9、M max −14.3；前 22.1 s：I −18.3、M max −15.7；草稿 volume 0.589（−4.6 dB）、淡入 3.2 s | `bgm-outro` targetDb −11 |
| V 形微淡化的凹洞寬度 | `scratchpad/w005/dipwidth.mjs` 解析計算（穩定底噪、10 ms 窗、1 ms 步進） | 15 ms：13 ms；20 ms：19 ms；30 ms：29 ms（低於 −6 dB 的寬度） | FR-030 門檻 |
| CC0 雷聲、配樂 | WebSearch（OpenGameArt） | 找到候選頁，頁面 WebFetch 回 HTTP 403，授權欄與檔名未核對 | FR-012、裁決 3、4 |

## Phase 1：設計

### D1. `dev/tools/make-sfx.mjs` 的內部分段

| 段 | 內容 | 備註 |
|---|---|---|
| 參數與說明 | `--list`／`--candidates`／`--write`／`--only`／`--out`／`--ref`／`--voice`／`--cache`／`--help`；錯誤原文照 cli-005 §1.5 | `--out` 是否在工作區內：`path.relative(WS, out)` 不以 `..` 開頭且不是絕對路徑 → 擋 |
| 數學小工具 | `mulberry32(seed)`、`dbToLin`、`linToDb`、`clamp` | 種子寫在每個配方 |
| PCM 緩衝 | 立體聲 `Float32Array` ×2（L、R），48 kHz；`place(out, x, at, gainDb, pan)`、`mix`、`trim` | 統一 48 kHz，B 素材由 ffmpeg 重取樣 |
| DSP 基本件 | 正弦／帶限方波（加法合成，諧波到 8 kHz）／鋸齒（±7 cents 疊）；白、粉紅（Paul Kellet 濾波）、棕色雜訊；一階低通高通；RBJ biquad 帶通／高通；包絡：raised-cosine 起音、指數衰減、線性斜坡；`tanh` 軟削波；FM（載波：調變比、指數包絡）；Schroeder 殘響（4 梳狀＋2 全通） | 參數全部照 spec FR-010～012，程式註解寫「FR-0xx」對回去 |
| zip 讀取 | 找 End of Central Directory（`0x06054b50`）→ 中央目錄 → local header → `zlib.inflateRawSync`（method 8）或原樣（method 0） | 只讀記憶體，不解壓到磁碟（沿用 `make_sfx.py` 的原則） |
| 下載 | Kenney：GET 素材頁（存 `Set-Cookie`）→ GET `https://kenney.nl/download-link/<hex>`（帶 Cookie、Referer）→ JSON `{url}` → GET 簽章網址；OpenGameArt：GET `https://opengameart.org/sites/default/files/<檔名>`；`User-Agent` 用 `make_sfx.py` 的 `UA`；sha256 不符就停 | Node 22 內建 `fetch` |
| 解碼 | `spawnSync('ffmpeg', ['-v','error','-i','pipe:0','-f','f32le','-ar','48000','-ac','2','pipe:1'], { input: bytes, maxBuffer: 256 MB })` | ogg、flac、mp3、wav 都走這條；`--ref`、`--voice` 也是 |
| 量測 | cli-005 §1.2 的 ffmpeg 指令（先把緩衝寫成暫存 wav）；峰值秒、起音、頻譜重心（2048 點 FFT、Hann、全檔平均）在 JS | 暫存檔放 `os.tmpdir()` |
| 處理鏈 `finish(x, cfg)` | ① 去前導靜音：第一個 > −40 dBFS 的樣本前留 2 ms，前段淡入（`riser`、`bgm` 不做）② 去尾：最後一個 > −60 dBFS 的樣本後留 10 ms ③ 超過長度上限就截，最後 80 ms 淡出；沒超過就最後 5 ms 淡出 ④ 增益＝min(檔案目標 − 實測 M max（bgm 用 I）, −1.2 − 實測 true peak)，套用後再量一次，差 > 0.1 dB 再修一次 ⑤ 轉 16-bit：`Math.round(clamp(x,−1,1)×32767)` | 步驟與數字沿用 `make_sfx.py` `finish()`，結果才能跟凍結 8 顆一致 |
| WAV 寫入 | 44 byte 標頭（`RIFF`、`WAVE`、`fmt ` PCM 1、2 ch、48000、16 bit、`data`）＋交錯 int16 LE | 讀 WAV 給測試用：只解析這種格式 |
| 配方表 `RECIPES` | `{ 名稱: { limit, fileTarget, measure: 'M'|'I', ref?: 說明, candidates: [{ id, route, desc, like, src: [...], build(ctx) }] } }` | `like`＝README「聽起來像」；`desc`＝試聽頁說明 |
| `CHOICE` | `{ ding: 'ding-a', … }` | 作者 A/B 後改這裡 |
| 輸出 | `--candidates` 寫 `<out>/…`、`index.html`（自帶淺色／深色 CSS，跟 `make_sfx.py` `write_index` 同版型）；`--write` 寫 wav、sources.json 那一筆、kit 的 `peak`／`volume`、README | 寫 JSON 用 2 格縮排＋結尾換行；`kit/sfx.json` 保留原本的一項一行格式（自己序列化：每項 `JSON.stringify(v)` 一行、鍵對齊） |

### D2. `tools/lib/audio.mjs` 的變更

```js
export const SFX_RULES = { gapSec: 3, extraGapSec: 0.2, perMinute: 2, capDb: -3 };

// cues: [{ id, name, at, volume, main }]；sfxConf: kit/sfx.json；opts: { voiceDb = 0, outDur, fmt }
export function sfxBudget(cues, sfxConf, { voiceDb = 0, outDur = 0, fmt = defaultFmt } = {}) {
  // 1. 只取 kind !== 'bgm' 且 sfxConf 有的
  // 2. count：每個名稱的次數（主＋附加）
  // 3. over：maxPerVideo != null && count > maxPerVideo → 依 at 排序列出全部 cue
  // 4. dense：main && !additive 的 cue 依 floor(at/60) 分組，n > perMinute
  // 5. rel = targetDb + 20·log10(volume / conf.volume) − voiceDb；loud：rel > capDb + 0.05
  // 6. levels：main 的 [min, max, median]、extra 的 [min, max]（四捨五入 0.1）
  // 7. perMinuteAvg = 主音效（非 additive）數 ÷ (outDur / 60)，outDur 0 時 0
  // 8. warnings／lines：原文照 cli-005 §3.2
}

// 處理前 ref（可省略）、處理後 f32（交錯）
export function cutDips(f32, { channels = 2, rate = 48000, points, ref = null, win = 0.010, hop = 0.001, span = 0.100, belowDb = 6, minRun = 0.020 }) {
  // 1. 每個樣本取聲道平均能量 → 前綴和，O(1) 算任一窗的 RMS
  // 2. floorDb = ref（沒有就 f32）全檔 10 ms 窗（hop 10 ms）RMS 的第 10 百分位
  // 3. 每個接點 p：窗中心從 p−span 到 p+span，算處理後 db；below = db < floorDb − belowDb 且 refDb ≥ floorDb − belowDb 且 db < refDb − belowDb
  //    preexisting = ref 同一窗也 below
  //    runMs = 最長連續（below && !preexisting）的窗數 × hop × 1000
  // 4. 回傳 [{ at: p, floorDb, minDb, runMs, hole: runMs >= minRun*1000 - 0.5, preexisting: 有任何 preexisting 窗 }]
}

export function renderBgmClip(src, dst, { from = 0, dur, fadeIn, fadeOut, gain = 1 }) {
  // dst 檔名由呼叫端給（含 hash）；dst 存在且 mtime ≥ src 就直接回傳
  // ffmpeg -y -v error -ss <from> -t <dur> -i src -af "afade=t=in:d=<fadeIn>,afade=t=out:st=<dur−fadeOut>:d=<fadeOut>,volume=<gain>,aresample=48000" -ac 2 -c:a pcm_s16le dst
  // 回傳 { file: dst, dur }（ffprobe 實測）
}

export function audioKey({ src, cutpoints = [], loudnorm = true, declick = true, frame = null, look = null }) {
  // 既有內容 ...(frame ? { frame } : {}), ...(look ? { look } : {})；look＝ensureLook().key（006 look.md §4）
}

export function encodeFootagePolished(src, dst, { cacheDir, cutpoints = [], loudnorm = true, declick = true, onMeasure = null, crop = null, lut = null } = {}) {
  // 只改兩處 encodeFootage(...)：{ crop } → { crop, lut }（look.md §4）；其他不動
}

export function audioReportLines(info, { loudnorm = true, declick = true, cutpointsExist = true, sfx = null } = {}) {
  // 刪掉「⚠ 人聲被調大／調小 N dB …」那一段
  // 人聲響度行之後、剪接點行之前插入「音效比例」行（cli-005 §3.1）
}
```

`fmt` 預設實作與 plan.mjs 的 `fmt()` 相同（`m:ss.ss`）；002 呼叫時傳自己的 `fmt` 保證一致。

### D3. 測試設計

`dev/tests/sfx.test.mjs`（新）：

| 測試 | 需要 ffmpeg | 內容 |
|---|---|---|
| 名稱清單 | 否 | `Object.keys(kit)` ＝ contracts/sfx.md §2 的 18 個（測試裡寫死） |
| 欄位齊全、型別、沒有多的欄位 | 否 | FR-001；`additive` 只有 `tick`、`click`；`maxPerVideo` 只有 `sparkle` 6、`shine` 3、`thunder` 3；`targetDb ≤ −3` |
| 檔案格式 | 否 | 讀 WAV 標頭：PCM 16-bit、48 kHz、2 ch；長度在上限內（sfx ≤ 各顆上限、bgm 10–20 s） |
| 峰值 | 否 | 讀樣本找最大絕對值的時間，與 `peak` 差 ≤ 0.010 s（bgm 跳過） |
| 起音 | 否 | 第一個 > −40 dBFS 的樣本 ≤ 2.5 ms（`riser`、`bgm` 跳過） |
| 響度 | 是 | ffmpeg 量 M max（bgm 量 I）與 true peak；與 sources.json `max_m_lufs`（bgm `integrated_lufs`）差 ≤ 0.5 dB；TP ≤ −1.0 dBTP；`實測＋20·log10(volume)＋14` 與 `targetDb` 差 ≤ 0.5 dB；M max 在 −30～−10 LUFS |
| sources.json | 否 | 每個名稱一筆；`sha256` 與檔案一致；`license` ＝ `CC0 1.0`；B 有 `download_url`、`zip_sha256`（64 位 hex）、`source_url`；C 有 `source`、`license_note` |
| README／NOTICE | 否 | README 表格每個名稱一列；NOTICE「音效」段提到每個檔名 |
| 授權護欄 | 否 | `shared/sfx/**`、`kit/sfx.json`、NOTICE 音效段找不到 `剪映|CapCut|综艺|鼠标|仙尘|打卡成功|正确` |
| style.md 數字 | 否 | `shared/style.md` 音效段有「3 秒」「2 顆」「3 dB」；表格「每集上限」欄＝kit `maxPerVideo`（001 的 style.md 還沒改之前，這條 skip 並印原因） |
| make-sfx 依賴 | 否 | 掃 `dev/tools/make-sfx.mjs` 的 import，只有 `node:` 開頭 |
| make-sfx 離線 | 是 | `--candidates --only ding --out <tmp>`：結束碼 0、`ding-a.wav`、`ding-b.wav`、`index.html` 都在；跑兩次 `ding-a.wav` sha256 相同 |
| make-sfx 護欄 | 否 | `--candidates --only ding --out <WS>/projects/x` 結束碼 2、stderr 有「試聽檔不能放進工作區」；`--ref a.wav --only ding,alert` 結束碼 2 |

`dev/tests/audio.test.mjs`（加）：

| 測試 | 內容 |
|---|---|
| `SFX_RULES` | 值＝contracts/sfx.md §4.2 |
| `sfxBudget` ×6 | contracts/sfx.md §10 第 2–6 列的期望（純資料，不需要 ffmpeg）；warnings 原文逐字比對 cli-005 §3.2 |
| 報告（改寫原 112 行那一條） | `gainDb` 12 時不印舊 ⚠；`sfx.loud` 1 筆時印 cli-005 §3.1 的 ⚠；`loudnorm: false` 印「沒有檢查」 |
| `audioKey` look | 沒有 look 時 `JSON.stringify` 與改版前的期望值相同；look 不同 → `stampMatches` false |
| `cutDips` 合成 ×3 | 3 s、48 kHz、立體聲：底噪＝種子固定的白雜訊 RMS −44 dBFS；1.2–1.8 s 疊「語音」（200 Hz–3 kHz 帶通雜訊 −20 dBFS）；接點 1.0 s（純底噪）與 1.75 s（語音尾巴）。`applyDipsToFile` 15 ms → 0 凹洞、1.0 s 的 `runMs` 在 11–15 ms；30 ms → 1.0 s 是凹洞、`runMs` 27–31 ms；不處理（硬切）→ 0 凹洞 |
| `cutDips` 真實素材（gated） | spec FR-031；`AUTO_EDIT_RMS_PROJECT` 沒設或檔案不在就 skip |
| `renderBgmClip`（需要 ffmpeg） | spec FR-029 的三個數字 |

### D4. 剪接點研究流程（US4）

1. 產生範例的 work/（只為量測；`projects/範例/work/` 在 `.gitignore` 裡）：
   ```
   auto-editor "projects/範例/素材/真人錄影/示範口播.mp4" --edit "audio:-20dB" --no-open -o projects/範例/work/rough.mp4
   auto-editor "projects/範例/素材/真人錄影/示範口播.mp4" --edit "audio:-20dB" --export v1 -o projects/範例/work/cuts.v1
   ```
   再照 AGENTS.md「剪乾淨」第 7 步把 `chunks` 換算成 `work/cutpoints.json`（全部 `kind: "pause"`；這次不找 NG）。參數名以 `auto-editor --help` 為準（AGENTS.md 工具注意事項）。
2. `AUTO_EDIT_RMS_PROJECT=projects/範例 node --test dev/tests/audio.test.mjs`，把 diagnostic 表貼進 research.md。
3. 有作者自己的真實專案（攝影機收音、旁白檔）時，同一條指令再跑一次（`projects/` 其他專案不進 git，數據只進 research.md）。旁白檔是 02 G15 作者觀察到凹洞的情境，最有代表性。
4. 決策：全部專案 0 凹洞 → 維持 15 ms；任一 ≥ 1 → FR-032。

### D5. 交叉淡化（FR-032，條件式）

```
輸入：source（48 kHz f32）、chunks（保留段的 [a, b) 秒，依時間排序）、X = 0.1 s
for 每段 i：取 source[a_i − X/2, b_i + X/2)（超出素材就截到素材頭尾，該側不重疊、改 15 ms 微淡化）
輸出位置：第 i 段的「名目起點」＝Σ_{k<i}(b_k − a_k)（＝rough.mp4 的剪接點）
第 i 段放在 名目起點 − X/2；與前一段重疊的 X 秒：前段 × cos(π/2·u)、後段 × sin(π/2·u)，u 從 0 到 1
→ 總長＝Σ(b − a)，與 rough.mp4 相同
```

- 剪接點的時間軸不變，字幕、動畫、音效、剪輯台 `cuts` 都不用動。
- 等功率交叉淡化在兩段不相關（不同位置的底噪）時能量守恆，不會挖洞也不會鼓包；兩段相關（同一段聲音）時中心會 +3 dB，但剪接點兩側本來就是不同時間的聲音。
- `AUDIO_VER` 改 2（已編碼的底片全部重做一次）。

### D6. 整合順序與依賴

| 順序 | 005 做 | 誰接著做 | 檢查 |
|---|---|---|---|
| 1 | kit schema、`SFX_RULES`、`sfxBudget`、`audioReportLines`、`audioKey` look | 002：import `SFX_RULES`、呼叫 `sfxBudget`、3 s 規則跳過 additive；006：傳 look | 002 的 `plan.test.mjs`＋005 的 `audio.test.mjs` |
| 2 | 第一批 `--write`（含 `click`） | 004：media `clicks`；002：custom `clicks`、`click` 附加音效 | contracts/sfx.md §10 第 2、3 列 |
| 3 | 第二批 `--write`（含 `chapter`） | 002：01 scene.json 改 `chapter` | 範例專案章節段報告 `chapter` |
| 4 | 第三批 `--write`（含 `sparkle`、`thunder`、`bgm-outro`）、`renderBgmClip` | 002：14、15 預設、`outro`；003：gallery；006：剪輯台排除 bgm | 範例專案 `outro` build＋`qc.mjs final` |
| 5 | docs.md 定稿 | 001：併進 style.md、AGENTS.md、USAGE、R5.2 | 001 的 `docs.test.mjs` |

002 在 005 對應批次 `--write` 之前就改 scene.json 的話，plan.mjs 會報「sfx.json 沒有「chapter」」✖ → 依賴寫在 tasks.md，主代理整合時照順序合併。

### D7. 資產大小（憲法 II）

| 檔 | 估算 | 算法 |
|---|---|---|
| 9 顆短音效（≤ 2.0 s） | 每顆 ≤ 384 KB，合計 ≤ 2.0 MB | 48 000 × 2 ch × 2 byte × 秒數 |
| `bgm-outro.wav`（10–20 s） | 1.9–3.8 MB | 同上 |
| 增加量（扣掉被換掉的 4 顆舊檔約 0.48 MB） | ≤ 5.3 MB | — |

### D8. 風險

| 風險 | 影響 | 對策 |
|---|---|---|
| Kenney 下載流程改版 | B 配方抓不到檔 | 手動下載放 `--cache`（錯誤訊息已寫）；sha256 不變就能用 |
| 第三批 CC0 找不到像的 | `thunder`、`shine`、`bgm-outro` 上不了線 | 都有 C 保底；作者都不滿意就不上線，002 對應預設不改（15 warn 退回 `alert`、不加 `outro`） |
| `chapter` 次低頻在手機喇叭聽不到 | 「嘭」變小聲 | 候選 a、b 有 Kenney 爆炸聲的中頻；A/B 用 `--voice` 在筆電喇叭再聽一次 |
| `impact` 換成兩下影響字卡動態 | fx 02 逐字敲擊節奏打架 | A/B 時另聽 fx 01、02、03、16、24（`shared/template/index.html` 字卡動態區）；不合就 `impact-keep`（裁決 7） |
| 每分鐘 ≤ 2 顆 ⚠ 太常出現 | 弱模型被 ⚠ 淹沒 | 全片合成一行；裁決 2 |

## Complexity Tracking

| 違規 | 為什麼需要 | 更簡單的做法為什麼不行 |
|---|---|---|
| `kit/sfx.json` 同時存 `targetDb` 與 `volume`（衍生值） | plan.mjs、build `--list`、gallery、剪輯台都直接讀 `volume`；改成執行期換算要動 002／003／006 四個地方，而且要多讀 sources.json 的 M max | 只存 `volume`：音量政策（跟剪映、上限 −3 dB）沒有地方寫、沒辦法測；所以兩個都存，由 `sfx.test.mjs` 保證一致（±0.5 dB） |
