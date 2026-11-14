# 033 片尾模板＋片尾配樂的工作區預設

來源：作者 2026-11-13～14。

- 「我在剪映的專案中，上方會有 FB 跟 YouTube 的品牌標誌…可以幫我把它設計到這個專案中嗎？預設沒有，除非在資料夾下放，然後這個可以在 setting.json 裡面使用。另外我覺得 setting.json 裡面也可以有設定片尾音樂的能力」
- 「我在剪映片尾有設計自己的固定模板，我希望也可以變成自己的固定設計，這個會變成 Setting 裡面可以調整的參數，然後幫我把這個設計搬移到專案，並且做 gitignore」

決定單（網頁）的回答：

| 題目 | 作者選 |
|---|---|
| 0. 標誌放哪些時段 | **C 不做標誌**（常駐章節角標已經占了頂端，標誌常駐不划算；作者自己看完「往左／往下」的代價後說「上面多了品牌似乎沒有比較好」） |
| 3. 片尾配樂起播點 | **C 沒寫就只播片尾最後 30 秒** |
| 4. 片尾卡還原圖 | **一樣** |
| 5. 片尾金句來源 | **A 講稿最後的 `>` 引言，沒寫就用最後一張金句字卡** |
| 我先定的 | 照做 |
| 可選改進 | 都不做 |

## 剪映的片尾（量到的，`jianying-editing` 的 `tpl_brand.json` ending_*、`tpl_ending_quote.json`、`editing-patterns.md`「結尾模板」）

- 影片結束後再接 9.9 秒：黑底；書封（`工程師下班有約.jpg`）置中、縮成填滿畫布的 0.63 倍，晚 0.1 秒淡入 0.5 秒；片尾金句在書封右邊（x 0.641、y −0.4025、左對齊、白字），晚 0.633 秒「复古打字机」進場 5.23 秒；圖和字最後 0.5 秒淡出。
- 講者最後一段影片版淡出 0.5 秒到黑；結尾配樂、品牌橫幅延續到片尾卡結束（作者在 ep5 指正：黑底不能疊在影片最後 9 秒上）。
- 訂閱呼籲 gif 4.93 秒、往下 0.36（半高單位）、最後 0.5 秒淡出；作者三集定案出現在講到「訂閱」那句後 0.3–0.67 秒。
- 金句文字取原稿最後一行 `>` 引言，逗點處空一行。

## 做法

- 素材：`shared/brand/`（不進版控，`.gitignore` 加一行）。剪映的四個檔已經複製進來：`book-cover.jpg`、`subscribe.gif`、`facebook.png`、`youtube.png`（標誌這次不做，檔案先留著）。
- 設定：`shared/setting.json`
  - `"ending": { "image": "book-cover.jpg", "seconds": 9.9, "quote": true, "subscribe": "subscribe.gif" }`：`brand.mjs ending <圖檔> [--seconds] [--subscribe <檔>|none] [--no-quote]`、`brand.mjs ending off`。沒設定＝沒有片尾（預設）。
  - `"music": { "outro": "<曲名>" }`：`music.mjs outro <曲名>|none`。曲庫的或內建的 `bgm-cylinder-five`。
- 單集：plan.json `"ending": false`（不要片尾）、`{ "quote": "<字>"|null, "subscribe": "#N"|null }`；`--set ending=false`、`--set "ending.quote=…"`、`--set ending.subscribe=#N`。`"outro": { "music": null }`＝這集不配；`outro.from` 沒寫＝只播最後 30 秒。
- 片尾卡（`lib/ending.mjs`）：主合成 root 長＝影片＋片尾卡秒數（`resolvePlan().finalDur`）；底片、字幕只到影片結束；黑底在影片結束前 0.5 秒淡入，z 80 蓋過字幕（60）與剪輯台淡出（70）。金句：左 1300、頂 575、寬 580、48 px、行高 73、Noto Sans TC，一個字一個 span，GSAP stagger 打字 5.23 秒；講稿最後一個 `>` 段落 → 最後一張 15 金句字卡 → 不放。超過約 6 行 ⚠。
- 訂閱動畫：最後四分之一第一句有「訂閱」的字幕起點＋0.5 秒，播 gif 的長度（到片尾為止，不到 2 秒不放）；build 把 gif 轉成 VP9＋alpha 的 webm（和人物去背層同一種；GIF 在瀏覽器裡不能逐格對時），`assets/brand/` 檔名帶指紋。往下移畫面高 0.18、z 56（蓋字卡、在字幕下）。
- 片尾配樂：沒寫 outro 而有工作區預設時，從 `finalDur − 30` 播到片尾（含片尾卡）；這種自動起播不算內容段落，常駐章節角標照常到片尾（寫了 `from` 的照舊停在起播點）。有片尾卡時剪輯台的整支淡出不再套到配樂上（配樂要延續到片尾卡）。
- 底樂鋪到 `finalDur`；壓低用的人聲 key 用 `apad` 補到同長（片尾卡沒人講話＝回升）。
- 不放：直式（版式本身）、剪映素材（`capcut.mjs`，作者的預設組合已經有）。
- qc：`--check --json` 多 `ending: { at, dur, quote, quoteFrom, subscribe, notes }`；`outputDur`＝含片尾卡的總長；qc final 從 `at − 0.65` 到片尾不判凍結、黑畫面、無聲。
- 停點 ③：問「結尾配樂：<曲名>（工作區預設），只播片尾最後 30 秒…，要換嗎」「片尾金句：「…」（來源），要改嗎」，訂閱動畫沒放時說原因。
- 測試：`AUTO_EDIT_NO_LOCAL_BRAND=1`（`dev/tests/helpers.mjs` 預設開）不讀本機的 `ending`、`music.outro`；`dev/tests/ending.test.mjs`。

## 驗證（2026-11-14）

- t026 複本（`projects/t033-ending`，153.27 秒）：build 出 163.167 秒的主合成；`--test 148,16` render 看到訂閱動畫、淡出到黑、書封淡入、金句逐字打出、最後淡出；片尾卡期間配樂約 −27 dB、最後 0.8 秒 −53 dB。
- 整支 draft render 163.20 秒，`qc.mjs final`：長度 ✓（預期 163.17）、凍結／黑畫面／無聲 ✓（片尾卡已排除）。

## 已知的小差異

- 剪輯台的時間軸仍是 rough.mp4 的長度：拖不到片尾卡、模擬預覽在影片結束就淡出（完成影片預覽播放器會播到片尾卡）。
- `--test` 的起點不能落在片尾卡裡（要看片尾就從片尾前幾秒開始）。
- 片尾金句的換行由瀏覽器決定（一行 12 字），和剪映的 fixed_width 不一定斷在同一個字。
