# check-all 2026-10-31 04:58

專案：/var/folders/xm/pgvx67hd0nl1zyff20yxylcw0000gn/T/auto-edit-check-B9X5pE/專案（合成，已清掉）；總耗時 168s；結果：全部通過

| 步驟 | 結果 | 秒 | 細節 |
|---|---|---|---|
| node --test dev/tests/*.test.mjs | ✓ | 143.6 | pass 545、fail 0 |
| 合成測試專案（70 秒影片、20 句字幕、8 段 plan） | ✓ | 1.1 | /var/folders/xm/pgvx67hd0nl1zyff20yxylcw0000gn/T/auto-edit-check-B9X5pE/專案 |
| build.mjs --check（/var/folders/xm/pgvx67hd0nl1zyff20yxylcw0000gn/T/auto-edit-check-B9X5pE/專案） | ✓ | 0.3 | 通過：8 段，12 個提醒（⚠）。；✖ 0、⚠ 12<br>⚠ 音效密度：1 個一分鐘超過 2 顆主音效（0:00–1:00 5 顆；附加音效 tick、click 不算）→ 每分鐘留最重要的 2 顆（chapter、thunder、shine、sparkle、alert、success 先留，pop、swipe 先拿掉：那段寫 "sfx": null）<br>⚠ 沒有畫面的區間共 3 段、11.00s → 照 style.md「連續覆蓋」補卡片或情境動畫，或把前一段的 to 延到下一段的 from（0 秒相接）；故意留給講者的就在 plan.json 寫 "rhythm": "spaced"<br>⚠ #N@詞 有 4 個用字數比例估（沒有 work/transcript.json（rough.mp4 的詞級逐字稿）），可能差 1 秒：#12@錄影、#13@逐字稿、#14@剪輯清單、#15@初剪 → 對 rough.mp4 重轉詞級逐字稿：npx hyperframes transcribe /var/folders/xm/pgvx67hd0nl1zyff20yxylcw0000gn/T/auto-edit-check-B9X5pE/專案/work/rough.mp4 -d /var/folders/xm/pgvx67hd0nl1zyff20yxylcw0000gn/T/auto-edit-check-B9X5pE/專案/work --model small --language zh --json<br>⚠ [s01 concept] 「一般字卡」大約會蓋到講者框 25% → 用 snapshot 確認，擋到臉或手勢就換情境（例：12 關鍵詞條列、04 全畫面） |
| look.mjs run（臉部偵測 → rough-look.mp4；合成影片沒有臉 → 只調光） | ✓ | 7.2 | 講者調光＋瘦臉：/var/folders/xm/pgvx67hd0nl1zyff20yxylcw0000gn/T/auto-edit-check-B9X5pE/專案（rough.mp4 640×360、25 fps、1875 格、1:15.0）<br>設定：調光 0.8、瘦臉 0.6（kit/look.json；plan.json 沒有寫 look）<br>⚠ 抽樣 12 格都沒偵測到臉 → 這支只調光；確定有講者就加 --force<br>講者對照圖：work/look-preview.jpg（3 列：只有調光 0.8；瘦臉略過：抽樣 12 格都沒偵測到臉）<br>✔ 完成：瘦臉略過，build 用 work/rough.mp4，調光 0.8 在 build 重新編碼時 bake |
| build.mjs（產生 work/hyperframes） | ✓ | 8.4 | 重新編碼底片 → ../../../../../var/folders/xm/pgvx67hd0nl1zyff20yxylcw0000gn/T/auto-edit-check-B9X5pE/專案/work/hyperframes/assets/rough.mp4（30fps、每秒一個關鍵幀、人聲調到 −14 LUFS、剪接點微淡化）…<br>量人聲響度（第一次會花一點時間，之後用快取）…<br>人聲響度 −21.9 LUFS → −13.9 LUFS（true peak −7.1）<br>音效比例：主音效比人聲小 3.0–12.6 dB（中位 7.9）、附加音效小 16.1–16.1 dB；上限是比人聲小 3 dB<br>剪接點微淡化：2 個接點，前後各 15 ms<br>⚠ 沒有畫面的區間共 3 段、11.00s → 照 style.md「連續覆蓋」補卡片或情境動畫，或把前一段的 to 延到下一段的 from（0 秒相接）；故意留給講者的就在 plan.json 寫 "rhythm": "spaced"<br>沒有畫面的區間（> 1.0s）：0:01.00–0:04.50（3.50s）、0:11.00–0:14.75（3.75s）、0:17.25–0:21.00（3.75s）；共 11.00s，佔口播 15.3% |
| audit.mjs --all --json（0 ✖） | ✓ | 4.1 | ✖ 0、⚠ 1 |
| npx hyperframes snapshot --at（開頭、中段、結尾各一格） | ✓ | 3.7 | 3 張（1.5,30,58.5s） |
