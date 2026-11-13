#!/usr/bin/env node
/**
 * 素材工具：看螢幕錄影與圖片、讀座標、接主軌（零依賴，只用 Node 22 與 ffmpeg／ffprobe）
 *
 * 剪乾淨兩條指令（到停點 ① 一條、① 通過後一條；都在背景跑，前景最多等 9 分鐘，還沒好就印「再跑一次」）：
 *   node shared/template/tools/media.mjs prep --project projects/<專案> [--order a,b,…] [--format portrait|landscape] [--again] [--skip-stop] [--no-editor] [--wait <秒>] [--transcript <JSON>]
 *       一條指令到停點 ①：開工決策表 → main → 轉逐字稿＋掃素材（同時跑）→ ng-scan → 工具自己寫 work/cuts.md → ng-snap 預跑（⚠ 寫進「需要你決定」）→ 開剪輯台 → 停點紀錄 → 印停點那兩行。
 *       轉逐字稿：停頓先剪掉再轉（whisper 碰到長停頓會把後面那句的時間攤進停頓），詞的時間換回 main.mp4，寫 work/transcript-main.json 與 work/transcript.json。
 *       每步印一行，細節在 work/.jobs/prep-detail.log。再跑一次：沒做完就接著做；cuts.md 還是最新的就不重寫（使用者勾的不會不見），只重開網址。
 *       --order：改主軌順序（重接、重轉、重寫 cuts.md，舊的備份 cuts.md.bak-<時間戳>）；--format：使用者說了「直式」「橫式」才加（開工決策表的版式）；--again：已經有 rough.mp4 時重來（rough.mp4 改名留著）；--skip-stop：使用者說「不用停」（待確認的列不剪、紀錄「略過」）；
 *       --transcript：用現成的詞級逐字稿 [{ text, start, end }]（main.mp4 的秒數），不跑 whisper。結束碼 0 做完、1 失敗、75 還在跑。
 *   node shared/template/tools/media.mjs rough --project projects/<專案> [--edit "audio:-20dB"] [--margin 0.15sec] [--said "<使用者原話>"] [--again] [--remap-plan] [--retranscribe] [--no-editor] [--wait <秒>] [--transcript <JSON>]
 *       ① 通過後一條指令到字幕與剪接點：讀 cuts.md → ng-snap → auto-editor（輸出 rough.mp4 與 --export v1 同時跑）→ verify-rough → 逐字稿 → srt-align → cutpoints → 有邊錄邊講的錄影就 screen-sync。遇第一個 ✖ 就停、印修法；剪掉比例過高會 ⚠。
 *       有講稿：work/transcript-main.json 照 cuts.v1.json 換算成 rough.mp4 時間軸（lib/transcript-map.mjs），不重轉（準確度和重轉一樣）；--retranscribe 才對 rough.mp4 再轉一次；逐字稿是直接轉整支 main.mp4（media.mjs transcribe）時也重轉。沒有講稿：對 rough.mp4 轉。
 *       --said：停點紀錄「通過」那一列的使用者原話；--again：初剪做完之後要重剪（字幕會重排）；參數和清單都沒變就不重新輸出影片。--transcript：用現成的詞級逐字稿（rough.mp4 的秒數；和 --retranscribe 不能一起用）。
 *       prep 到停點 ①、rough 做完時，最後印一段「── 回報 ──」（照貼給使用者）；prep 成功時記素材清單 work/.jobs/assets-manifest.json（status.mjs 比對素材有沒有被換掉）。
 *       同一條連續沒過 4 次會印「→ 停手」。
 *   node shared/template/tools/media.mjs cuts --project projects/<專案> [--keep 3,5] [--cut 7] [--said "<使用者原話>"] [--no-editor]
 *       停點 ① 使用者指名改哪幾列（「第 3 列不要剪」「第 7 列也剪掉」）：--keep 那幾列的「剪」改成 [ ]、--cut 改成 [x]，兩個可以同時給（3,5 或 3-5）。
 *       列號＝剪輯清單頁每列的號碼（cuts.md 的 NG 表、等待表由上往下連號）。只改「剪」欄，和頁面勾選一樣；記停點 ①「修改後重停」、印回報段和停點那兩行。
 *       已經有 work/rough.mp4（初剪做完了）就 ✖：要重剪改 cuts.md 後跑 rough --again。--said 也可以寫成 --say。
 *   node shared/template/tools/media.mjs transcribe --project projects/<專案> [--file <mp4>] [--wait <秒>]
 *       包住 hyperframes transcribe（工作區釘的版本；固定 --model small --language zh --json、寫 work/transcript.json；Mac 預設帶 GGML_METAL_BF16_DISABLE=1）。--file 不寫＝work/main.mp4（同時存一份 work/transcript-main.json）；
 *       --file 是 rough.mp4 時也寫 work/rough.srt（舊檔先備份 rough.srt.transcribe-<時間戳>）。只印一行結果。
 *
 *   node shared/template/tools/media.mjs scan --project projects/<專案>
 *       列出 assets/screen/、assets/images/ 每個檔（長度、解析度、fps、有沒有聲音）；
 *       影片比相鄰畫面找事件（切頁、開視窗、區塊變化）、等待、捲動，寫 work/media/<檔名>/events.md（給 AI 抄 in、retime 的 src、框）與 events.json；
 *       在事件之後＋固定間隔取格，拼成帶時間的 contact sheet：work/media/<檔名>/sheet-01.jpg …
 *       圖片每 12 張拼一頁 work/media/images/sheet-01.jpg …，每格標檔名（中文字要 HyperFrames 的 Chrome；沒有時每格只標 #格號，index.md 有對照）。
 *       寫 work/media/index.md（總表：每支錄影、每頁圖片一列）與 index.json；圖片多的時候每張的解析度在 work/media/images/index.md；同時跑多支，只印統計一行。
 *   node shared/template/tools/media.mjs frame --project projects/<專案> --src assets/screen/<檔名> --at 12.5[,30,47.2] [--grid] [--box "x,y,w,h"]
 *       截原尺寸畫面到 work/media/frames/（--at 可以一次給多個時間，同時截，每張印一行）；--grid 疊每 100px 一條、標數字的座標格線（plan.json 的 box／moves／lens 用這個座標）
 *   node shared/template/tools/media.mjs main --project projects/<專案> [--order 檔名1,檔名2,…]
 *       把 assets/camera/、assets/voice/，以及 assets/screen/ 裡邊錄邊講的螢幕錄影（有聲音的比例 20–95%：講話會停頓，背景音樂不會）照檔名排序
 *       （或 --order 的順序；--order 可以寫檔名或 assets/… 路徑，也能放進沒偵測到講解、但有音軌的螢幕錄影）接成 work/main.mp4：
 *       檔名後面加 @起-迄（秒，迄可省略＝到檔尾）只取那一段，同一支可以出現好幾次——補錄插進旁白中間：
 *       --order "a.mp4,旁白.mp3@0-577.7,補錄.aac@2.1-32.4,旁白.mp3@603.4-,b.mp4"
 *       聲音檔與螢幕錄影都只取聲音、配純黑畫面（螢幕錄影的畫面之後由 screen-sync 自動蓋回）；
 *       解析度／fps 跟第一支真人錄影（沒有就 1920×1080 30fps）；聲音統一 48k AAC。
 *       同時寫 work/main.json：{ "clips": [{ "file", "kind": "camera"|"voice"|"screen", "start", "end"[, "src": [起, 迄]] }][, "order": "--order 的原文"] }（src＝有寫 @起-迄 時取的是素材哪一段）
 *       只有一支真人錄影時也轉一次（固定 fps、yuv420p）：auto-editor 直接剪手機原檔（VFR、yuvj420p），--cut-out 之後的畫面可能全黑。
 *       fps：原片在 29–31 之間、VFR 或沒有 fps 時用 30，其他照原片（例 25、60）。
 *
 *   node shared/template/tools/media.mjs ng-scan --project projects/<專案>
 *       找 NG（剪乾淨第 3–4 步）：讀 work/transcript.json（main.mp4 的詞級逐字稿），用講稿裡只出現一次的四字組當錨點對位置；
 *       講到講稿後面又跳回前面（接著往下講 ≥ 6 字）＝重講 → 前一次列成 NG 候選（留最後一次）；講稿找不到的話列「講稿外」；
 *       沒講稿時比相鄰句（停頓切句）。印 cuts.md 的 NG 表（「剪」欄都是 [x]）與章節空檔表（照抄），講稿每一行的開口時間寫 work/ng-scan.md。
 *   node shared/template/tools/media.mjs snap-srt --project projects/<專案> [--dry-run] [--below <dB>]
 *       把 work/rough.srt 每則字幕的起點對齊到實際開口的時間（逐字稿的時間碼只有整句，常比嘴巴早 1 秒左右）：
 *       用 ffmpeg 把 work/rough.mp4 的聲音解出來算能量包絡，門檻取這支音軌自己的「說話音量」與「底噪」之間（相對值，不寫死 dB；
 *       --below <dB> 可手動改成「說話音量減 dB」），找出說話區間；每則起點對齊到附近最接近的開口點（字幕比開口早 1.5 秒到晚 0.6 秒的範圍內，差超過 0.25 秒才動）；
 *       結尾拖進靜音超過 0.4 秒就收到說話結束＋0.15 秒。字幕不重疊、每則至少 0.6 秒、順序不變。
 *       寫回前先把原檔備份成 work/rough.srt.bak-<時間戳>（不刪任何檔）；--dry-run 只印調整表、不寫。
 *       只在「剪乾淨」做完字幕校正後跑一次；之後在剪輯台改的時間不要再跑它（會蓋掉）。build 不會自動執行它。
 *   node shared/template/tools/media.mjs cut-check --project projects/<專案>
 *       聽每個剪接點（work/cutpoints.json）兩側 0.06 秒的音量：兩邊都還在講話＝可能把字切一半，列出時間和那一句字幕（⚠）；
 *       一邊是安靜的＝正常。media.mjs rough 跑完會自動做一次。⚠ 的地方到剪輯台聽那一句，真的切到就把那一列 NG 的起點或終點挪 0.1–0.2 秒。
 *   node shared/template/tools/media.mjs shorts --project projects/<長片專案>
 *       長片切直式短片，第一步：從 work/rough.srt 列出可以單獨成片的候選段（20–75 秒、開頭結尾都落在原本有停頓的地方、不是連接詞開頭），
 *       寫成 work/shorts.md 的候選表（最多 24 列，附看得到的特徵）。評分和挑選照 auto-edit-longform 的 references/shorts.md。
 *   node shared/template/tools/media.mjs shorts --project projects/<長片專案> --pick "#12-#25" --name <新專案名稱>
 *       第二步：把那一段從 work/rough.mp4 切出來、裁成 9:16（水平置中在講者身上，照 plan.json 的 speakerBox；沒有就取畫面中間）、放大到 1080×1920，
 *       開成 projects/<新專案名稱>/（assets/camera/ 一支直的影片＋講稿.md）。不動原本的專案；名稱已經存在就停下來。之後照一般的直式流程剪新專案。
 *   node shared/template/tools/media.mjs cover --project projects/<專案> --title "第一行|第二行" [--kicker "小標"] [--at <秒>]
 *       封面圖：從 work/rough.mp4 抓一格講者（--at；不寫就先用前段的一格），去背後排成三種版型（a 人物跳出、b 色塊分割、c 底部標題），
 *       寫到 output/cover/cover-a.jpg、-b.jpg、-c.jpg 給使用者挑。橫式專案 1920×1080；直式專案 1080×1920，標題和臉都在中間 3:4 裡。
 *       --title 最多 3 行、一行最多 9 個字寬（| 換行，*詞* 是要強調的詞，會套主色底）；--kicker 是標題上面的小標（集數、系列名）。
 *       同時寫 work/cover/candidates.jpg（8 格候選，挑表情用）。去背模型沒下載時照樣出圖，只是講者沒有白邊。
 *   node shared/template/tools/media.mjs matte-setup
 *       下載人物去背模型（u2net_human_seg，約 170 MB，只下載一次；放在使用者家目錄的 .cache/hyperframes/）。用到講者去背的模板動畫（x-wall 這類，
 *       填資料規格寫 "matte": true）時 build 會說要先跑這條；跑之前先問使用者。不用 --project。已經下載過就只印 ✓。
 *   node shared/template/tools/media.mjs ref --project projects/<專案> --file <參考影片> [--name <名稱>] [--every <秒>]
 *       拆參考片用（auto-edit-style 的 references/reference-video.md）：每隔幾秒抽一格、換鏡頭的地方另外抽（黃色方塊），拼成縮圖總表
 *       work/reference/<名稱>/sheet-NN.jpg（每張 16 格，格子上標時間）；基本資料與節奏表寫 index.md：長度、畫面大小、鏡頭數、
 *       平均一個鏡頭幾秒、每 10 秒換幾次鏡頭。只讀參考影片，不複製、不改它。--every 預設讓整支落在 96 格以內（最密 1 秒一格）。
 *   node shared/template/tools/media.mjs ng-snap --project projects/<專案> [--edit "audio:-20dB"] [--margin 0.15sec] [--src <原片>] [--v1 <檔>]
 *       讀 work/cuts.md 的 NG 表（表頭有「時間碼」「原因」）與章節空檔表（表頭有「章節」「第一句」），
 *       用 auto-editor 判斷原片的停頓（結果快取在 work/.cache/），把每段 NG 的起訖對齊到前後的停頓（±1 秒內），
 *       每章第一句前保留 3 秒停頓（--add-in），印出三行可以直接複製的 auto-editor 指令：--preview、輸出 work/rough.mp4、--export v1 -o work/cuts.v1.json。
 *       邊錄邊講的螢幕錄影（main.json kind "screen"）只剪 NG、停頓保留（停頓時畫面常在操作；整段 --add-in，扣掉 NG）。
 *       主軌有兩支以上、有 講稿.md、還沒初剪時，用 work/transcript.json 比對每支講的是講稿第幾行，順序和講稿不同就 ⚠ 並印建議的 --order。
 *       NG 表有「剪」欄時只剪勾了 [x] 的列（剪輯清單頁 editor.mjs /cuts 寫的）；沒有「剪」欄（舊格式）時「待確認」欄有寫字的列不剪。原始停頓不到 3 秒的章節會 ⚠。除了下面說的自動轉 main.mp4，不寫 work/.cache/ 以外的檔。
 *       --src 不寫：用 work/main.mp4；還沒有、且只有一支真人錄影時，先自動跑 main 轉出 work/main.mp4（會寫 work/main.mp4、work/main.json）；
 *       --v1：用現成的 auto-editor --export v1 結果（不跑 auto-editor）。
 *       章節開口：先找包含表上時間的停頓；沒有就往後 6 秒內找第一個停頓的終點（再沒有才看表上時間前 0.6 秒內）。
 *   node shared/template/tools/media.mjs verify-rough --project projects/<專案>
 *       檢查初剪有沒有壞：blackdetect work/rough.mp4，每段黑畫面用 work/cuts.v1.json 換回原片同一秒、量原片亮度；
 *       原片不黑 → ✖ 並印重做的指令（結束碼 1）；原片也黑（或專案有只有聲音的素材）→ ✓ 列出區間。不寫檔。
 *   node shared/template/tools/media.mjs cutpoints --project projects/<專案> [--dry-run]
 *       讀 work/cuts.v1.json（auto-editor --export v1）與 work/rough.mp4 的 fps，算出每個剪接點在 rough.mp4 的秒數，
 *       和 work/cuts.md 要剪的 NG 重疊的標 ng、其他標 pause，寫 work/cutpoints.json（舊檔內容不同時先備份成 .bak-<時間戳>）。
 *   node shared/template/tools/media.mjs screen-sync --project projects/<專案> [--write-plan] [--dry-run]
 *       邊錄邊講的螢幕錄影：讀 work/main.json（kind "screen"）與 work/cuts.v1.json，算出初剪後每段保留下來的片段
 *       在 rough.mp4 的起訖與錄影本身的秒數（in），寫 work/screen-sync.json（media 段 sync01、sync02…：畫面蓋回主軌、和聲音同步）。
 *       --write-plan：再寫進 work/hyperframes/plan.json（先換掉舊的 sync 段，plan.json 先備份 .sync-<時間戳>）；初剪重做過就再跑一次。
 *       --dry-run：只印表、不寫。秒數都由工具算，不要手改 sync 段的 from／to／in（剪輯台拖邊緣會自動保持同步）。
 *   node shared/template/tools/media.mjs srt-align --project projects/<專案> [--dry-run] [--remap-plan] [--max 18] [--verbose]
 *       預設只印有標記的列（併、拆、內插；最多 30 列，⚠ 優先）和統計；--verbose 才印每一則。
 *       字幕重新斷句成完整語句（剪乾淨第 6 步，取代手動斷句）：
 *       有 講稿.md：字幕＝講稿每一行（# 標題、> 引言、含 ` 的說明行不算），時間用 work/transcript.json 的詞級時間做全域序列對齊
 *       （字元層級，允許錯字／多字／漏字）；沒講稿：work/rough.srt 每則依「，。！？；」切成子句。
 *       一行超過 18 字在「、，」處拆；同一口氣（停頓 ≤ 0.12 秒）或有一邊 ≤ 4 字、下一行不是「而、但、所以…」開頭的新句，合併後 ≤ 18 字就併；
 *       相鄰空檔 < 1 秒補滿；對不上的行用前後句內插（⚠ 列出）。字幕文字去掉「，。；：」，保留「、！？」。
 *       rough.mp4 聲音裡 ≥ 1.5 秒的停頓（章節前留的 3 秒、--add-in 保留的停頓）字幕不蓋：逐字稿常把字攤進停頓，
 *       起點落在停頓裡的挪到開口、終點拖進停頓的收到停頓起點（＋0.15 秒），build 才量得到章節前的空檔。
 *       沒有 transcript.json 時用 rough.srt 的整則時間按字數比例（⚠，之後跑 snap-srt）。
 *       寫回前先備份 work/rough.srt.align-<時間戳>；--dry-run 只印表。plan.json 已經用到 #N 時要加 --remap-plan（照時間換句號，plan.json 先備份 .align-<時間戳>）。
 *       每則字數上限（srt-align 的 --max）預設照版式：橫式 18、直式 10（lib/canvas.mjs 的 caption.maxChars；直式時第一行印「版式：直式 → 每則最多 10 字」）。
 *       超過字數上限的單一則字幕（多半是之後手改過）：到剪輯台分割（剪輯台會一起重對 plan.json 的 #N）。
 *   node shared/template/tools/media.mjs illus-lint --project projects/<專案> [--no-sheet] [--only <名稱> [--states a,b]]
 *       檢查專案自己畫的示意插圖元件 work/hyperframes/illus-local/*.svg（規則見 shared/template/kit/illus-style.md）：
 *       建議尺寸與狀態從 work/storyboard.md 和 work/designs/*.md 的插圖清單讀（「新建 SVG」列寫「規格：<name>，建議尺寸 W×H，狀態 a／b」）；
 *       讀不到就只查不用尺寸的規則（⚠）；插圖清單列了新建 SVG 卻沒有檔 ✖。有 ✖ 結束碼 1。不改任何 SVG。
 *       順便拼 work/插圖清單.jpg（插圖清單用到的畫廊元件＋illus-local 的新元件，1:1 px，上亮色、下暗色；要 HyperFrames 的 Chrome）；--no-sheet 不拼。
 *       --only <名稱>：設計師自查自己新畫的那一個（illus-local/<名稱>.svg）：只查這個檔，拼 work/插圖清單-<名稱>.jpg（這個元件＋phone、laptop、cloud 三個畫廊元件並排比對）；
 *         別人的檔、別段的插圖清單都不看，平行的設計師不會互相蓋掉拼圖。
 *       --states a,b（和 --only 一起用）：規格寫的狀態，每個都要有 <g class="il-<狀態>">，少了 ✖（和插圖清單寫的狀態合併檢查）。
 *   node shared/template/tools/media.mjs illus-show <元件> [--opts "screen=rec"]
 *       印畫廊元件（shared/template/kit/illus.js）的 SVG，派工訊息貼參考用；--opts 是那個元件的選項（和 data-* 同名，多個用 ; 隔開）。
 *       元件名照 shared/template/kit/illus-gallery.jpg 每格下面的寫法；不存在 ✖ 並列出有哪些。不用 --project。
 *   node shared/template/tools/media.mjs sort --project projects/<專案> [--as "檔名=camera;檔名=screen"] [--apply]
 *       分類散落的素材（照 auto-edit-longform 的 references/sort-assets.md 的決策表）：只看專案底下、不在 assets/、work/、output/ 裡的檔。
 *       預設只印計畫表（檔案｜搬到哪｜依據）與待確認，不搬。有畫面、檔名又看不出是螢幕錄影的影片：截中間一格，拼成 work/分類-總表.jpg（每格標檔名），表上寫「看圖」；
 *       看完用 --as 回答（camera＝真人在講解、screen＝電腦或手機的操作畫面；也收 voice、images、script＝當講稿、skip＝不動；檔名寫專案裡的相對路徑或只寫檔名）。
 *       --apply 才搬：只搬，不轉檔、不刪、不改檔名（講稿改名成 講稿.md 例外）；目的地已經有同名檔不覆寫、看圖沒回答的不搬、跨磁碟搬不動的，都列為待確認。
 *   node shared/template/tools/media.mjs new <名稱>
 *       開新專案：建 projects/<名稱>/ 與 assets/camera、voice、screen、images 四個空資料夾；已經有就 ✖。印要告訴使用者「各放什麼」的那段話。
 *
 * --project：專案資料夾（projects/example，或只寫名稱 example）；沒寫時規則同 build.mjs。測試用：--template <shared/template 資料夾>
 * 每個旗標都可以寫成 --旗標=值（只在第一個 = 切：--said="a=b"、--edit=audio:threshold=0.1）；--said 也可以寫成 --say。要值的旗標後面沒接值（或接著另一個旗標）✖。
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { splitFlag, valueOf, oneOf, isMain } from './lib/cli.mjs';
import { pathsFrom } from './lib/project.mjs';
import { parseSrt } from './lib/srt.mjs';
import { next } from './lib/say.mjs';
import { rel, fmtT } from './lib/rough/util.mjs';
import { frames } from './lib/rough/scan.mjs';
import { joinMain } from './lib/rough/main-track.mjs';
import { snapSrt, SNAP } from './lib/rough/snap.mjs';
import { editForLevel, CUT } from './lib/rough/cuts.mjs';
import { cutCheck, cutpoints } from './lib/rough/cutpoints.mjs';
import { matteSetup } from './lib/rough/matte-setup.mjs';
import { refSheets } from './lib/rough/ref.mjs';
import { ngScan, ngSnap } from './lib/rough/ngscan.mjs';
import { screenSync } from './lib/rough/screen-sync.mjs';
import { verifyRough } from './lib/rough/verify.mjs';
import { captionMax, srtAlign } from './lib/rough/align.mjs';
import { illusShow, illusLint } from './lib/rough/illus.mjs';

// 032 C9：指令列以外的函式搬到 lib/rough/（照段落一檔一段），這裡照舊匯出原本的名稱：測試、別的工具不用改
export { ENV, envelope, pickThreshold, speechFromEnvelope } from './lib/speech.mjs';
export { remapCustomRefs } from './lib/beat-remap.mjs';   // 032 B6：搬到 lib/beat-remap.mjs，這裡照舊匯出
export { pickTimes, IMG_SHEET, labelImageSheet, chromeOrNull, blackDetectBg, blackCacheOf, refreshVoiceOnly, scan, scanSummary, scanFresh, parseAtList, parseBoxes, frames, drawGrid } from './lib/rough/scan.mjs';
export { mainFps, NARR, narrationOf, mainCandidates, readMainOrder, mainIsCurrent, screenJudge, SILENT_PEAK, pickAudioTrack, sourceEnd, joinMain } from './lib/rough/main-track.mjs';
export { SNAP, snapCues, rewriteSrtTimes, snapSrt } from './lib/rough/snap.mjs';
export { CUT, editForLevel, parseClock, parseRange, WAIT_RE, WAIT_KEEP, WAIT_KEEP_MAX, waitKeep, parseCutsMd, setCutChecks, readV1, silencesOf, parseMargin, snapNg, chapterKeep, aeCommand, aeArgs, aeFailure, aeSilenceAsync, subtractRanges, scriptOrder, orderArg, orderCommand, suggestOrder } from './lib/rough/cuts.mjs';
export { CUTCHECK, cutCheckRows, cutCheck, cutpointsFromV1, cutpoints } from './lib/rough/cutpoints.mjs';
export { matteSetup } from './lib/rough/matte-setup.mjs';
export { REF, sceneCuts, refRhythm, refSheets } from './lib/rough/ref.mjs';
export { NGSCAN, scriptChapters, utterances, scriptAnchors, FILLERS, fillerRows, ngScanRows, chapterRows, ngScan, ngSnap } from './lib/rough/ngscan.mjs';
export { screenSegments, waitRows, SYNC_ID, screenSync } from './lib/rough/screen-sync.mjs';
export { ROUGH, roughToSource, mergeBlack, lumaAt, verifyRough } from './lib/rough/verify.mjs';
export { ALIGN, scriptLines, displayText, alignSeq, alignLines, CONNECTIVE, breakPoints, breakBad, splitRow, keepPauses, alignCues, clausesFromSrt, refMapper, remapPlanByTime, ALIGN_SHOW, evenOutCrushed, srtAlign, captionMax } from './lib/rough/align.mjs';
export { readIllusList, illusShow, illusLint } from './lib/rough/illus.mjs';

const VALUE_FLAGS = ['project', 'template', 'src', 'at', 'box', 'order', 'below', 'edit', 'margin', 'v1', 'max', 'file', 'wait', 'said', 'say', 'transcript', 'format', 'only', 'name', 'every', 'pick', 'title', 'kicker', 'keep', 'cut', 'as', 'opts', 'states'];
const BOOL_FLAGS = ['all', 'grid', 'help', 'dry-run', 'remap-plan', 'no-sheet', 'write-plan', 'again', 'skip-stop', 'no-editor', 'retranscribe', 'verbose', 'apply'];
// 這兩個指令的第一個參數不用旗標：media.mjs new <名稱>、media.mjs illus-show <元件>
const POSITIONAL = ['new', 'illus-show'];

// --help：檔頭整段 8 千字，模型通常只要一條指令。預設印指令清單；media.mjs <指令> --help 印那一條；--help --all 印全部
export function helpText(raw, { cmd = null, all = false } = {}) {
  if (all) return raw;
  const lines = raw.split('\n');
  const isCmd = (l) => /^\s*node\s+\S*media\.mjs\b/.test(l);
  const nameOf = (l) => (l.match(/media\.mjs\s+([a-z][\w-]*)/) || [])[1] || '';
  if (cmd) {
    const out = [];
    let on = false;
    for (const l of lines) {
      if (isCmd(l)) on = nameOf(l) === cmd;
      else if (on && !/^\s/.test(l)) on = false;
      if (on) out.push(l);
    }
    if (out.length) return out.join('\n');
  }
  return [lines[0], '', ...lines.filter(isCmd).map((l) => l.trim().replace(/\s+\S*$/, (m) => (l.length > 170 ? ' …' : m))), '', '看一條指令的完整說明：node shared/template/tools/media.mjs <指令> --help；全部：--help --all'].join('\n');
}

export function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const flags = { cmd };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--') && POSITIONAL.includes(cmd) && flags.arg == null) { flags.arg = a; continue; }
    if (!a.startsWith('--')) throw new Error(`看不懂的參數「${a}」（用 --help 看用法）`);
    const [k, inline] = splitFlag(a);   // --edit=audio:threshold=0.1、--said="a=b"：只在第一個 = 切
    if (VALUE_FLAGS.includes(k)) [flags[k], i] = valueOf(rest, i, k, inline);   // 缺值、或下一個是另一個旗標就丟錯（不會把 --dry-run 當成值吃掉）
    else if (BOOL_FLAGS.includes(k)) flags[k] = true;
    else throw new Error(`沒有 --${k} 這個參數（用 --help 看用法）`);
  }
  // 真的互斥的才擋：rough 用現成的逐字稿（--transcript）和重轉一次（--retranscribe）只能選一個，兩個都給以前會默默用 --transcript
  oneOf(flags, ['transcript', 'retranscribe']);
  return flags;
}
// ---------- CLI ----------


async function cli() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help || !flags.cmd || flags.cmd === '--help') { console.log(helpText(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*\n?/, '').replace(/^ \* ?/gm, ''), { cmd: flags.cmd === '--help' ? null : flags.cmd, all: flags.all })); return 0; }
  if (!['prep', 'rough', 'cuts', 'transcribe', 'scan', 'frame', 'main', 'snap-srt', 'ng-scan', 'ng-snap', 'cutpoints', 'screen-sync', 'srt-align', 'verify-rough', 'illus-lint', 'illus-show', 'ref', 'matte-setup', 'cover', 'shorts', 'cut-check', 'sort', 'new'].includes(flags.cmd)) throw new Error(`沒有「${flags.cmd}」這個指令：只有 prep、rough、cuts、transcribe、scan、frame、main、snap-srt、ng-scan、ng-snap、cutpoints、screen-sync、srt-align、verify-rough、illus-lint、illus-show、ref、sort、new（用 --help 看用法）`);
  if (flags.cmd === 'matte-setup') { matteSetup(); return 0; }   // 不看專案
  // 不看專案：new 要建的專案還不存在；illus-show 只讀 kit/illus.js
  if (flags.cmd === 'new' || flags.cmd === 'illus-show') {
    const P0 = pathsFrom({ template: flags.template }, process.cwd(), { needProject: false });
    if (flags.cmd === 'illus-show') { console.log(illusShow(P0.templateDir, flags.arg ?? flags.name, flags.opts)); return 0; }
    return (await import('./lib/sort-assets.mjs')).newProject(P0.root, flags.arg ?? flags.name);
  }
  const P = pathsFrom({ project: flags.project, template: flags.template });
  if (!process.env.AUTO_EDIT_JOB) console.log(`專案：${rel(P.project)}`);   // 背景工作的子行程不重複印
  if (['prep', 'rough', 'transcribe', 'scan'].includes(flags.cmd)) return (await import('./lib/rough-flow.mjs')).flowCli(flags.cmd, P, flags);
  if (flags.cmd === 'cuts') return (await import('./lib/rough-flow.mjs')).cutsCli(P, flags);
  if (flags.cmd === 'sort') return (await import('./lib/sort-assets.mjs')).sortCli(P, flags);
  if (flags.cmd === 'ng-scan') { ngScan(P); return 0; }
  if (flags.cmd === 'cut-check') { cutCheck(P); return 0; }
  if (flags.cmd === 'cover') {
    const { findChrome } = await import('./lib/audit-browser.mjs');
    (await import('./lib/cover.mjs')).makeCovers({ project: P.project, templateDir: P.templateDir, root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..'), title: flags.title, kicker: flags.kicker || '', at: flags.at ?? null, format: flags.format || null, chrome: findChrome() });
    return 0;
  }
  if (flags.cmd === 'shorts') {
    const SH = await import('./lib/shorts.mjs');
    if (flags.pick) { SH.makeShort({ project: P.project, name: flags.name, range: flags.pick, root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..') }); return 0; }
    const srt = path.join(P.project, 'work', 'rough.srt');
    if (!fs.existsSync(srt)) throw new Error('這個專案還沒有 work/rough.srt → 先「剪乾淨」，再切短片');
    let breaks = [];
    try { breaks = (JSON.parse(fs.readFileSync(path.join(P.project, 'work', 'cutpoints.json'), 'utf8')).cuts || []).map((c) => Number(c.at)).filter(Number.isFinite); } catch { breaks = []; }
    const list = SH.shortCandidates(parseSrt(fs.readFileSync(srt, 'utf8')), { breaks });
    if (!list.length) { console.log('找不到 20–75 秒、頭尾都落在停頓上的段落 → 這支片太短或沒有停頓；直接整支做直式（開新專案時說「做直式」）'); return 0; }
    const file = path.join(P.project, 'work', 'shorts.md');
    fs.writeFileSync(file, SH.shortsMarkdown(list, { project: rel(P.project) }));
    console.log(`✓ 短片候選 ${list.length} 段 → ${rel(file)}`);
    for (const l of next('照 .agents/skills/auto-edit-longform/references/shorts.md 讀每一段的字幕、填「評分」「理由」，把前幾名列給使用者選')) console.log(l);
    return 0;
  }
  if (flags.cmd === 'ref') { await refSheets(P, { file: flags.file, name: flags.name, every: flags.every }); return 0; }
  if (flags.cmd === 'ng-snap') { const mainF = path.join(P.project, 'work', 'main.mp4'); ngSnap(P, { edit: flags.edit ?? (fs.existsSync(mainF) ? editForLevel(mainF).edit : CUT.edit), margin: flags.margin ?? CUT.margin, src: flags.src ?? null, v1: flags.v1 ?? null }); return 0; }
  if (flags.cmd === 'cutpoints') { cutpoints(P, { dryRun: !!flags['dry-run'] }); return 0; }
  if (flags.cmd === 'screen-sync') { screenSync(P, { writePlan: !!flags['write-plan'], dryRun: !!flags['dry-run'] }); return 0; }
  if (flags.cmd === 'verify-rough') return verifyRough(P).ok ? 0 : 1;
  if (flags.cmd === 'illus-lint') return (await illusLint(P, { sheet: !flags['no-sheet'], only: flags.only || null, states: flags.states ?? null })).ok ? 0 : 1;
  const capMax = () => captionMax(P, flags.max);
  if (flags.cmd === 'srt-align') { srtAlign(P, { dryRun: !!flags['dry-run'], remapPlan: !!flags['remap-plan'], max: capMax(), verbose: !!flags.verbose }); return 0; }
  if (flags.cmd === 'snap-srt') {
    snapSrt(P, { dryRun: !!flags['dry-run'], below: flags.below ?? SNAP.below });
    return 0;
  }
  if (flags.cmd === 'frame') {
    const list = await frames(P, { src: flags.src, at: flags.at, grid: !!flags.grid, box: flags.box });
    const tail = `${list[0].width}×${list[0].height}；${flags.box ? '紅框畫上去了：框的東西那一刻不在畫面上就換 at 或框；' : ''}${flags.grid ? '格線每 100px 一條，數字是素材原尺寸的像素座標，box 寫 [x, y, w, h]' : '加 --grid 疊座標格線'}`;
    if (list.length === 1) console.log(`→ ${rel(list[0].file)}（${tail}）`);
    else { for (const x of list) console.log(`→ ${rel(x.file)}`); console.log(`共 ${list.length} 張（${tail}）`); }
    return 0;
  }
  const r = joinMain(P, { order: flags.order });
  if (!r) return 0;
  console.log(`\n→ ${rel(r.file)}（${r.width}×${r.height}、${r.fps}fps、${r.duration}s）＋ ${rel(path.join(P.project, 'work', 'main.json'))}`);
  for (const c of r.clips) console.log(`  ${fmtT(c.start)}–${fmtT(c.end)}  ${c.kind === 'voice' ? '聲音' : c.kind === 'screen' ? '螢幕錄影（邊錄邊講）' : '真人'}  ${c.file}`);
  return 0;
}

if (isMain(import.meta.url)) cli().then((code) => { process.exitCode = code; }, (e) => { console.error(`✖ ${e.message}`); process.exitCode = 1; });
