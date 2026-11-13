# dev/archive/：退役的工具（不再執行，只留紀錄）

| 檔 | 是什麼 | 為什麼留著 |
|---|---|---|
| `make_sfx.py` | 舊的音效產生器（Python）：從 CC0 素材挑選、剪輯、統一響度，產生 `shared/sfx/` 的音效；已由 `dev/tools/make-sfx.mjs` 取代，直接執行會停下來 | 凍結的 8 顆音效（pop、tick、swipe、whoosh、flip、type、glitch、riser）是它處理的：來源、sha256、處理鏈只記在這支裡，`make-sfx.mjs` 也沿用它的數值 |
| `build_test_media.py` | 舊的測試素材產生器（Python）：用 macOS 語音合成刻意帶 NG、停頓的測試講解，加上場地照與答案卷，產生到 `projects/測試/` | 檔頭和內容是初剪驗收素材（NG 放在哪、答案卷怎麼寫）的設計紀錄；路徑還是舊 repo 的寫法，現在的工作區不能直接跑 |
