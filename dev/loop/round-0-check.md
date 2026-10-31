# check-all 2026-10-30 16:28

專案：/var/folders/xm/pgvx67hd0nl1zyff20yxylcw0000gn/T/auto-edit-check-ySNuzf/專案（合成，已清掉）；總耗時 35s；結果：✖ 1 步沒過

| 步驟 | 結果 | 秒 | 細節 |
|---|---|---|---|
| node --test dev/tests/*.test.mjs | ✖ | 9.7 | pass ?、fail ? |
| 合成測試專案（70 秒影片、20 句字幕、8 段 plan） | ✓ | 1.0 | /var/folders/xm/pgvx67hd0nl1zyff20yxylcw0000gn/T/auto-edit-check-ySNuzf/專案 |
| build.mjs --check（/var/folders/xm/pgvx67hd0nl1zyff20yxylcw0000gn/T/auto-edit-check-ySNuzf/專案） | ✓ | 0.3 | 通過：8 段，7 個提醒（⚠）。；✖ 0、⚠ 7<br>⚠ [s01 concept] 「一般字卡」大約會蓋到講者框 25% → 用 snapshot 確認，擋到臉或手勢就換情境（例：12 關鍵詞條列、04 全畫面）<br>⚠ [s02 chapter] 開場前 30 秒已經有 3 張（建議最多一張）<br>⚠ [s03 side-panel] slots.items[0].at：第 0s 出現，比 beats.head（第 0.7s）還早，會在標題前冒出來 → 第一項不寫 at（用預設），或寫 "+0.7" 之後的時間<br>⚠ [s04 fs-list] 和前一段 s03 之間只露臉 0.5s（< 3s）→ 合併成一張或拉開 |
| build.mjs（產生 work/hyperframes） | ✓ | 8.6 | 重新編碼底片 → ../../../../../var/folders/xm/pgvx67hd0nl1zyff20yxylcw0000gn/T/auto-edit-check-ySNuzf/專案/work/hyperframes/assets/rough.mp4（30fps、每秒一個關鍵幀、人聲調到 −14 LUFS、剪接點微淡化）…<br>量人聲響度（第一次會花一點時間，之後用快取）…<br>人聲響度 −21.9 LUFS → −13.9 LUFS（true peak −7.1）<br>剪接點微淡化：2 個接點，前後各 15 ms |
| audit.mjs --all --json（0 ✖） | ✓ | 4.1 | ✖ 0、⚠ 2 |
| npx hyperframes snapshot --at（開頭、中段、結尾各一格） | ✓ | 4.1 | 3 張（1.5,30,58.5s） |
| build --test 3 秒片段 → render draft → ffprobe 有影音軌 | ✓ | 6.9 | streams: video、audio |
