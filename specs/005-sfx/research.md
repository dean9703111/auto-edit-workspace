# 005 sfx：研究紀錄

實作日期 2026-10-31。試聽檔與量測腳本都在作者本機 scratchpad（`w005/`），不進 repo。

## A/B 紀錄

`CHOICE`（`dev/tools/make-sfx.mjs`）是**暫定**：主代理派工要求這一輪就把 10 顆寫進 `shared/sfx/`，所以先照「客觀最接近」選，作者聽完 `w005/ab/index.html` 再改 `CHOICE`＋`--write --only <名稱>`（spec FR-014 原本寫「作者沒選之前不 `--write`」，這一輪由主代理裁決例外）。

客觀分數＝10 ms RMS 包絡差（dB，起音對齊、各自正規化到 0 dB、下限 −40 dB，平均）÷ 10 ＋ 頻譜重心差（八度）。越小越像參考。

| 日期 | 名稱 | 選的候選 | 作者原話 | sources.json candidate | 分數（選的／其他） |
|---|---|---|---|---|---|
| 2026-10-31 | ding | ding-a | （待作者試聽） | ding-a | 0.67／b 0.67、keep 2.41 |
| 2026-10-31 | alert | alert-a | （待作者試聽） | alert-a | 0.74／b 1.19、keep 1.37、c 3.51 |
| 2026-10-31 | success | success-a | 主代理裁決：用「正确」式琶音 | success-a | 1.07／keep 0.88（keep 分數較低，但裁決指定 a） |
| 2026-10-31 | click | click-a | （待作者試聽） | click-a | 0.92／c 1.05、b 4.91 |
| 2026-10-31 | impact | impact-c | 主代理裁決：直接取代；候選照客觀分數挑 | impact-c | 1.07／b 1.37、keep 2.00、a 2.08 |
| 2026-10-31 | chapter | chapter-c | （待作者試聽） | chapter-c | 1.59／a 1.70、b 1.78；峰值 0.037 s 最接近參考（0.008 s），a 的峰值在 0.219 s |
| 2026-10-31 | sparkle | sparkle-a | （待作者試聽） | sparkle-a | 0.66／c 0.65、b 2.00（a、c 差 0.01，選全合成的 a） |
| 2026-10-31 | shine | shine-d | （待作者試聽） | shine-d | 1.05／a 1.93、c 2.90、b 3.41 |
| 2026-10-31 | thunder | thunder-c | 主代理裁決：先用合成版 | thunder-c | 2.45（唯一候選；OpenGameArt 候選在 sources.json `pending_author_check`） |
| 2026-10-31 | bgm-outro | bgm-d | 主代理裁決：先用合成版 | bgm-d | 沒有參考（作者的結尾配樂 mp3 不在 scratchpad） |

客觀上還差得遠、試聽時特別注意的：`impact`、`chapter`、`thunder` 的頻譜重心都比參考低約一個八度（121／73／107 Hz 對 233／129／264 Hz），手機喇叭可能聽不太到；`success-a` 比參考暗（1.6 kHz 對 2.5 kHz）。

### shine 挑選（spec FR-012）

Kenney Music Jingles 的 Steel／Pizzicato／Sax 共 51 顆，量「後 0.3 s 重心 ÷ 前 0.3 s ≥ 1.3」且長 ≤ 2 s，只有 3 顆過：`SAX02`（1.63 倍、848 Hz）、`PIZZI16`（1.50 倍、444 Hz）、`PIZZI02`（1.99 倍、396 Hz），就是 shine-a～c。三顆重心都離參考 2.1 kHz 很遠，所以選合成的 shine-d。

### Kenney 檔名核對

5 個包下載後 sha256 都跟 `make_sfx.py` 的 `SOURCES` 一致；配方用到的 19 個 zip 內路徑全部存在（`--candidates` 跑過）。下載流程：素材頁 → `https://kenney.nl/download-link/<"assets/<slug>" 的 hex>` 回 JSON `{url}`（簽章網址）→ 下載；這一輪不需要 cookie。

### 實作時改的配方（spec 已同步）

- `success-a`：spec 原寫「峰值落在第一音」，但四音重疊後最大樣本在第四音（0.234 s）；量了參考「正确」也是後段最大聲（起音後 0.168 s），所以保留音量、對齊點改成最高音到位。另補上 spec 寫的 80 ms 淡出。
- `sparkle-a`：顆粒撒到 1.6 s（0.33 s 後間隔放寬到 25 ms），不然 0.9 s 後只剩雜訊撐不出 1.8 s 尾韻。
- `bgm-d`：八分音符 0.4 s（每和弦 8 顆）；spec 原寫 0.333 s 除不盡 3.2 s。
- `impact-c`、`chapter-c`、`click-c`：雜訊成分先正規化到峰值 1 再套 spec 的 dB（相對主體）。
- 參考峰值（起音後）：滴 0.020、错误 0.047、正确 0.168、咚咚 0.136（第二下比第一下大）、嘭 0.008、仙尘 0.263、闪亮 0.169、打雷 0.198、鼠标 0.128 s（放開那聲比按下大）。我們的 impact、click 照契約 event 把最大聲放在第一下／按下。

## 剪接點 RMS

**結論：維持 15 ms 微淡化，不改交叉淡化。**

方法（`audio.mjs` `cutDips`）：10 ms 窗、1 ms 步、接點前後 ±100 ms；底噪＝處理前整檔 10 ms RMS 的第 10 百分位；凹洞＝連續 ≥ 20 ms 同時滿足「處理後 < 底噪 − 6 dB」「處理前 ≥ 底噪 − 6 dB」「處理後比處理前低 ≥ 6 dB」。第三個條件是實作時加的：沒有它，範例 18.017 s、67.12 s 兩個接點的參考只比門檻高約 3 dB（−39.7、−39.3 對門檻 −42.9 dBFS），淡化掉 3 dB 就被算成 24／20 ms 的凹洞。

合成音（`audio.test.mjs`，−44 dBFS 底噪、接點在純底噪）：15 ms → 13 ms（不是凹洞）；30 ms → 29 ms（凹洞，重現作者在剪映端的觀察）；硬切 → 0。

真實素材：`projects/範例/素材/真人錄影/示範口播.mp4`（170.8 s）→ `auto-editor --edit "audio:-20dB"`（29.3.1）→ 157.2 s、10 個停頓接點（這次沒剪 NG）。work/ 放在 scratchpad `w005/rms/work/`（不碰 `projects/範例/work/`，避免跟其他工作線搶）。重跑：`AUTO_EDIT_RMS_PROJECT=<scratchpad>/w005/rms node --test dev/tests/audio.test.mjs`。

各淡化長度的「凹洞寬度」（ms，上面的三條件；≥ 20 算凹洞）：

| 接點（s） | 參考（dBFS） | 0 | 10 ms | **15 ms** | 20 ms | 30 ms |
|---|---|---|---|---|---|---|
| 18.017 | −39.7 | 0 | 9 | **16** | 22 | 24 |
| 31.521 | −32.5 | 0 | 6 | **14** | 17 | 26 |
| 43.187 | −40.9 | 0 | 9 | **12** | 14 | 19 |
| 54.217 | −52.2 | 0 | 0 | **0** | 0 | 0 |
| 67.12 | −39.3 | 0 | 7 | **15** | 22 | 27 |
| 78.953 | −42.9 | 0 | 6 | **7** | 7 | 7 |
| 100.646 | −40.8 | 0 | 6 | **12** | 12 | 12 |
| 119.331 | −44.7 | 0 | 0 | **0** | 0 | 3 |
| 137.181 | −62.1 | 0 | 0 | **0** | 0 | 0 |
| 149.682 | −39.0 | 0 | 9 | **13** | 16 | 20 |
| 凹洞數 | | 0 | 0 | **0** | 2 | 4 |

15 ms 最寬 16 ms，離門檻 20 ms 還有 4 ms；20 ms 就開始有凹洞。底噪 −36.9 dBFS（這支是近距離收音，比剪映那支 −44 dB 的旁白高）。限制：只有一支素材、只有停頓接點；有 NG 接點（講話中切）的素材之後再跑一次同一條指令。

## make_sfx.py 退役

2026-10-31：檔頭加說明；在 numpy 等第三方 import 之前 `if __name__ == "__main__": sys.exit(RETIRED)`。作者機器 `python3 dev/tools/make_sfx.py`（沒裝 numpy）→ 結束碼 1，印「✖ make_sfx.py 已由 dev/tools/make-sfx.mjs 取代；只保留當凍結 8 顆的處理紀錄 → 改跑 node dev/tools/make-sfx.mjs --help」。凍結 8 顆的 wav 位元組不變（`git status` 只有 4 個換檔＋6 個新檔）。
