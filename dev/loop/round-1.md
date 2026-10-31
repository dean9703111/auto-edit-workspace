# 第 1 輪　2026-10-31 02:30

## 這輪改了什麼
- 001：9 支 Skill、AGENTS.md 重寫、SITUATIONS.md、REVIEW.md、install-skills、docs.test；第二輪併入 002–006 的 docs.md（最後對齊 --help 原文進行中）
- 002：package.json 釘 hyperframes 0.8.221、check-json schema 2、章節置中／墊片／字幕清空、無畫面空白偵測、rhythm、cue 注入、PiP 飛入與三層淡出、擦入、相鄰 media 疊化、media.mjs cutpoints／ng-snap／srt-split、status.mjs、caps.mjs、outro、音效政策、look 接線
- 003：SceneMotion P.at／P.dur／P.end／P.focus／P.type／P.marks、morph ease、9 支情境動畫（4 改寫＋5 新）、audit 6 條版面規則＋節奏檢查、custom-preview
- 004：media callouts／spot／steps／arrows／path、validateMedia、qc storyboard／observe、brand bg、framing 套 look
- 005：18 顆音效（8 不變、4 換、6 新）、sfx.json 新 schema、SFX_RULES／sfxBudget／renderBgmClip、剪接點 RMS 結論維持 15 ms
- 006：kit/look.json、jianying-smart.cube、vendor/mediapipe（18 MB）、look.mjs run／preview／status／clear／ensure、lib/look.mjs、landmarks.mjs、ff.mjs lut3d、剪輯台「講者」面板
- 007：check-all 加 look 步驟、fixture x01 改從 #11 起

## check-all（`node dev/check-all.mjs --render`）
| 步驟 | 結果 | 細節 |
|---|---|---|
| node --test dev/tests | ✓ | **435 pass、0 fail**（第 0 輪的 5 個舊失敗全部歸零） |
| 合成測試專案 | ✓ | 70 s、20 句、8 段 |
| build --check | ✓ | 0 ✖、11 ⚠（音效密度、無畫面區間 11 s＝fixture 刻意留的、蓋講者 25%、items[0].at） |
| look.mjs run | ✓ | 41.5 s；合成影片沒有臉 → 只調光（見改進 1） |
| build | ✓ | 人聲 −21.9 → −13.9 LUFS；音效比例主 3.0–12.6 dB／附加 16.1 dB；微淡化 2 點；印出無畫面區間 3 段 |
| audit --all | ✓ | 0 ✖、1 ⚠（s06 模板段壓講者） |
| snapshot ×3 | ✓ | |
| --test render draft | ✓ | video＋audio |

## 弱模型試跑（模型：Sonnet，進行中）
| 停點 | 有停 | 格式對 | 自己算了什麼 | 讀了不該讀的檔 | 備註 |
|---|---|---|---|---|---|
| ① 剪輯清單 | ✓ | ✓ | 章節表的時間碼「從逐字稿詞級時間推的」（抄逐字稿是預期做法，但它不確定 → 文件要寫明「時間碼抄逐字稿那句的起點」） | 無 | 11 次工具呼叫（預算 10）；whisper SIGABRT 照規則重跑成功；「需要你決定」留了範本的「- 無」又列了 5 項（範本殘留） |
| 初剪回報 | （不是停點）✓ 格式對 | ✓ | 無 | 無 | 22 次工具呼叫（預算 12）；**發現 ng-snap 問題**：章節 2「另外，有些時候」逐字稿標 0:54.94，實際開口 1:00.07（前面是 54.83–60.07 共 5.24 s 的靜音），−0.6～+1.5 s 的搜尋窗找不到開口就宣告「找不到停頓，不保留」，結果 5.24 s 的停頓被整段剪掉；章節 4 同樣（靜音 145.77–148.07，開口在窗外 +1.87 s）→ 優化輪請 002 把開口搜尋延伸到 +6 s 或下一個語音段起點，並印「時間碼比開口早 X s，已改用開口點」 |
| ② 構圖倍率 | ✓ | ✓ | 無 | 無 | 28 次（含初剪後）；倍率表與建議 ✔ 正確；look 只調光（臉寬 42 px） |
| ③ 分鏡表 | ✓ | ✓ | 無（speakerBox 從動作範圍圖讀） | 無 | 52 次（預算 25，超）；24 段、32 張截圖、--check 0 ✖ 19 ⚠；**沒有主動提情境動畫**（問了才做）→ 優化輪：storyboard Skill 加「情境判定表」必填欄、符合 SITUATIONS 的直接列 custom；連續 14 張下方字卡偏單調 → 002 加「連續 ≥ 5 段同一版面家族」⚠（P2）；fx 29 數字卡截圖截在滾動中（同 B-01，storyboard 完成態判定） |
| ④ Studio | ✓ | ✓ | 無 | 無 | 83 次；3 支 custom（x-process ×2、x-warnings）自己做完三關、章節角標、outro、金句改用 fx 27（15 蓋不住黑畫面，它主動換並說明）；**缺陷**：s22 fx 29 的 vars 多寫了不存在的 `text`（單位「小時」沒出現），`--check` 沒擋 → 002 加「fx vars 未知欄位 ✖＋列可用欄位」；它貼 icons.json 的 svg 時矩形圖示少寬高畫不出來（自己修好）→ 003 查範例檔頭的圖示貼法 |
| 回饋輪 r1 | ✓（卡住就停下來問，給 3 個方案，不猜） | ✓ | 無 | 無 | **模板缺陷**：fx 29 數字計數宣告了 `text` 變數但程式沒用到，也沒有「數字右邊的單位」欄位 → 003 修 fx 29（加 `unit`，或讓 `text` 生效）並確認 40 張 fx 的宣告變數都有被用到 |

## 審查員
r1 審查分三組同時進行：A（002＋005）、B（003＋004）、C（006＋跨線的 Windows／零依賴）；報告在 `dev/loop/review-r1-{A,B,C}.md`。

## 下一輪要做
1. look.mjs：抽樣 12 格都沒有臉時直接略過整支偵測（省 40 s）。
2. 001 對齊完成後跑 Sonnet 範例試跑（`dev/loop/weak-model-brief.md`）。
3. 審查員 P0 清零。

## 階段預算重估（001，第 2 輪）
依據：上面「弱模型試跑」表的實測次數。Sonnet 每個停點都停對、格式對、沒有讀不該讀的檔，超出的是預算本身太緊，不是卡住；新值＝實測加約一成餘裕，讓預算只在真的卡住時觸發。

| 階段 | 舊 | 實測 | 新 | 為什麼 |
|---|---|---|---|---|
| 剪乾淨到停點 ① | 10 | 11 | 12 | whisper SIGABRT 照規則重跑多 1 次，屬正常路徑 |
| ① 通過到初剪回報 | 12 | 22 | 24 | ng-snap 三行＋ffprobe＋轉字幕＋校正＋srt-split／snap-srt 各兩次（dry-run）＋cutpoints 就要 13 次以上，校正 rough.srt 另需 5–8 次；這輪再加 verify-rough 1 次 |
| 剪好看到停點 ② | 6 | 6（28 含初剪後 22） | 8 | 剛好用滿；look status 可能要跑 run＋再看一次 status，看兩張預覽圖也算呼叫 |
| ② 通過到停點 ③ | 25 | 52（24 段、32 張截圖） | 55 | 寫 frame、量講者框、草稿 plan、check／build／storyboard 截圖、逐段寫分鏡表；段數 20 段以上時 25 不夠。這輪多了情境判定表（不加呼叫，只加寫的內容） |
| 定稿到停點 ④ | 12 | 83（含三支情境動畫） | 30（不含情境動畫） | 拆開算：三支動畫各約 15–18 次，剩下的 build、audit、snapshot、修正約 30 次 |
| 一段情境動畫 | 15 | 約 15–18（83 拆出來的估計） | 18 | 每支要跑三關（check、audit、自查截圖）＋改兩輪 |

派工訊息寫「②→③ 22／12、③→④ 52／25」，和上表的實測對不上（22 是初剪回報、52 是分鏡表）；以上表為準。

### 定案（001 第二遍）：上表照用，另外兩列
| 階段 | 舊 | 實測 | 新 | 為什麼 |
|---|---|---|---|---|
| 接手 | 3 | 沒量（r1 沒有換 session） | 4 | status 1 次＋讀 `work/製作進度.md` 1 次＋讀要交棒的 Skill 1 次（沒載入時）＋重貼停點前讀那個產物 1 次；status 在 look 沒好時多印一行指令，不加呼叫 |
| 回饋輪每一項 | 6 | 沒逐項量（r1 卡住就停下來問，沒有超支的紀錄） | 10 | `auto-edit-review` B1–B7 照做就要 status、重讀 plan、備份、寫 rN.md、改 plan、`--check`／build、snapshot、看圖、補 rN.md「驗證」共 9–10 次；6 次做不完一輪 |
| 交付、配一支螢幕錄影、換風格 | 12／6／15 | r1 沒做到 | 不變 | 沒有實測資料，下一輪試跑再量 |
