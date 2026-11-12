# 素材包使用說明：核心（給 AI 讀）

這份寫給在這個工作區剪片的 AI Agent。照著做，就能把初剪好的講解影片（`work/rough.mp4`＋`work/rough.srt`）做成有字幕、資訊卡、子母畫面、音效、插入螢幕錄影與圖片的完成影片 `output/final.mp4`。

**路徑**：一支影片＝一個專案資料夾 `projects/<專案>/`（例：`projects/example/`）。本文提到的 `work/`、`output/`、`assets/`、`講稿.md`、場地照都在專案資料夾裡；`shared/`（模板、音效、`style.md`）是每集共用的。指令裡的 `<專案>` 換成這次的專案名稱。

- **查表用**：`AGENTS.md` 與 `.agents/skills/` 的 Skill 會寫做到哪一步查哪一節，不用從頭讀到尾。
- `shared/template/USAGE-reference.md` 是參考：挑情境、講者位置與 `css`、字幕與音效、密度、第二層 custom、硬規則、換主色。本文或 Skill 寫到 `R<N>` 時才讀那一節（`grep -n "^## R<N>" shared/template/USAGE-reference.md` 找標題，小節用 `### R<N>.<M>`），沒寫到就不讀。
- **情境與字卡動態的清單、slots 上限、預設長度，一律跑 `node shared/template/tools/build.mjs --list` 看**。不要憑記憶，也不要從其他文件抄。`--list` 只印出、不寫檔；不能跑指令時，讀 `shared/template/scenes/*/scene.json` 與 `shared/template/fx/catalog.json`（同一份資料）。
- 本文的欄位名稱與錯誤訊息都取自 `shared/template/tools/build.mjs`。工具的輸出和本文不一致時，以工具為準（`--help`、`--list`）。

## 1. 先記住這幾條

1. 版型只從素材包挑：18 個情境模板＋40 種字卡動態＋模板動畫（`x-*`，填 slots，寫法 `build.mjs --spec <模板>`）。不從零設計卡片；只有停點 ③ 勾了的內容設計動畫由設計師從空白畫布做。
2. 完成影片一律用 `build.mjs` 產生，不要從零寫 HyperFrames 的 `index.html`。理由：底片、子母畫面、字幕、音效、淡入淡出的時間都由程式算，手寫一定會漏。
3. 你要寫的是分章草稿（`work/drafts/<份>.json`），`work/hyperframes/plan.json` 由工具產生：`--merge-drafts` 合併草稿，`--apply-storyboard` 套回停點 ③ 的修改。之後只改要改的那一段（先用 `build.mjs --show <段>` 讀）。情境動畫有兩種：模板動畫在草稿寫 `template`＋`slots`，build 自動產生 HTML，不用手寫；內容設計動畫只做停點 ③ 勾了的段，由設計師子代理做（`auto-edit-motion`），主代理不寫 `compositions/x-*.html`。**講解在講情境（過程、前後對比、數值變化、比喻、因果）時優先做情境動畫**，字卡只放名詞、一句重點和提醒（R7.1）。
4. 要改任何東西，只改 plan.json，再重跑 build。不要直接改 build 產生的檔（`index.html`、`compositions/sNN-*.html`、`captions.html`、`kit/`）。
5. 停點照 `AGENTS.md`「停點總表」（①–⑥）：構圖（第 1 步）、分鏡表（第 5 步）、完成影片預覽（第 7 步）都要停下來等使用者確認，最後兩行照總表的固定格式。
6. 字級由模板固定，`css` 只能改位置。字放不下就縮文案；使用者要求「字再大一號」也做不到（4.3）。
7. 「只有聲音」的區間（旁白、`rough.mp4` 全黑的地方）沒有講者，要用螢幕錄影、圖片（第 5 節）或不透明的全畫面模板、內容設計動畫蓋住，否則 build 報 ✖。沒有對得上的素材不要硬配，改成全畫面情境動畫。
8. plan.json 的 `edit`、`look`、`sfxVolume` 是使用者在剪輯台調的（第 6 節）。改 plan.json 前先重新讀要改的那一段（段落用 `build.mjs --show <段>`），不要整份讀、不要蓋掉；使用者在剪輯台改過的值以他改的為準。

## 2. 工作流程（SOP）

前提：專案的 `work/rough.mp4` 與 `work/rough.srt`（已校正的字幕）都已經存在。指令都在工作區根目錄（有 `AGENTS.md` 的那層）執行，除非寫了 `cd`。build.mjs 一律加 `--project projects/<專案>`（`projects/` 只有一個專案時可以省略）。

| # | 做什麼 | 指令 | 查 | 停？ |
|---|---|---|---|---|
| 1 | 調光瘦臉、素材盤點、構圖（只有聲音就跳過構圖） | `look.mjs status`、`media.mjs scan`、`qc.mjs framing`＋`editor.mjs` | 第 7 節、2.2、第 5 節 | **停點 ②** |
| 2 | 量講者框、產生分鏡素材 | `qc.mjs speaker --write`、`build.mjs --scaffold` | 2.2 | |
| 3 | 分章寫分鏡（一份一個子代理）：第一回合語意地圖 → 主代理全片校正 → 第二回合草稿（大綱 → 骨架）、合併（通過就接著做第 5 步） | `build.mjs --map chNN`、`build.mjs --map-merge`、`build.mjs --outline chNN`、`build.mjs --check-draft chNN`、`build.mjs --merge-drafts` | `work/分鏡素材/`、style.md「分章」 | |
| 4 | （只有事先指定要做的內容設計動畫）寫鏡位腳本；其他值得設計的段在草稿標候選，③ 勾了才做 | `auto-edit-motion` 的 `references/design.md` | style.md「內容設計動畫」 | |
| 5 | 截圖、產生分鏡表（內容設計動畫候選有預估時間、預設都不勾） | `build.mjs --storyboard`（`--merge-drafts` 已經接著做了就跳過） | 2.3 | **停點 ③** |
| 6 | 套回修改；勾了的內容設計動畫：設計師寫鏡位腳本、從空白畫布做；等設計師時看進度 | `build.mjs --apply-storyboard`；`audit.mjs --only <段> --shots --sheet`；`build.mjs --design-status` | | |
| 7 | build＋量測＋完成態拼圖＋開預覽（不 render） | `build.mjs --review` | `REVIEW.md`、2.6 | **停點 ④** |
| 8 | 修改：一輪回饋（不 render，看完成影片預覽與拼圖） | `versions.mjs begin --seg <段> --say "…"`、`versions.mjs finish` | | |
| 9 | 輸出並驗收 | `deliver.mjs` | 2.7、2.8 | |

理由：改分鏡表只要改一行字，改完成影片要等好幾分鐘 render。所以順序是「分鏡 → 檢查 → 截圖 → 完成影片預覽 → 短片段 → 整支」。

使用者說「打開剪輯台」時（任何一步之後都可以），照 `shared/template/EDITOR.md` 開；使用者說「調好了」後重跑 `build.mjs --review`，剪輯台寫了哪些欄位見第 6 節。

### 2.1 不用 Plan 模式

- 不用 Plan 模式：流程會在停點 ② ③ 自己停。使用者開著 Plan 模式時只能列句號、挑情境；要寫檔（構圖分析、草稿、分鏡表、截圖）時，請他離開 Plan 模式再說一次（不要在 Plan 模式裡硬做）。
- 分鏡表一律存成 `work/storyboard.md`（格式 2.3），停點 ③ 給使用者 `editor.mjs` 印的分鏡表網址（網頁改的內容存回同一份檔；「想換成」「補充說明」兩欄要先照做再停一次）。
- 確認之後跑 `node shared/template/tools/build.mjs --project projects/<專案> --apply-storyboard --said "使用者原話"`，工具把網頁的修改套回 plan.json。不要照 storyboard.md 手寫 plan.json。

### 2.2 量 `speakerBox`

0. **先確認構圖（畫面要不要放大）**：跑 `node shared/template/tools/qc.mjs framing --project projects/<專案>`。它量講者的動作範圍、偵測四周黑邊，算出 1.0／1.15／1.3 倍的 16:9 裁切框（講者水平置中、頭頂上方留 120px），存 `work/構圖預覽.jpg`（每個倍率一格，橘框是講者動作範圍；紅底標題＝會切到手勢），並印出每個倍率的 `frame` 與畫質提醒（來源像素被放大的倍數）。
   - 接著開剪輯台（`node shared/template/tools/editor.mjs --project projects/<專案>`），把它印的「構圖台」網址給使用者：在沒裁切的 `work/rough.mp4` 上拖一個鎖定比例的框（最多放大 2 倍），右邊即時顯示裁切後套上字幕、下方字卡、子母畫面小視窗的樣子；切到手勢、每個像素放大超過 3.5 倍、直式頭頂／下巴不在範圍會標紅。拖好就自動寫進 plan.json 的 `frame`（還沒有 plan.json 會新建；打開頁面就把建議的框存起來，所以使用者沒動框直接說「調好了」，用的就是建議的框）。這一步要在列分鏡表之前做（`EDITOR.md`「構圖台」）。
   - 看預覽圖判斷：四周有多餘的外框（黑邊、櫃子、大片空牆、桌面倒影）讓構圖鬆散時，建議放大；講者的手勢會被切到、或原片解析度低（每個像素放大超過 3.5 倍會明顯變軟）時，倍率往小選。
   - 每個倍率都會切到手勢或放大超過 3.5 倍時，「建議」是表上倍率最小的那一列（有黑邊時表上最小的是 1.13x 這類，不是 1.00x；1.00x 會露出黑邊）。
   - 把構圖台網址與建議倍率給使用者，**停下來等確認**。使用者說「調好了」：構圖台已經寫好 `frame`，不用再改；說「用建議的」：跑 `node shared/template/tools/qc.mjs framing --project projects/<專案> --write`（把表上 ✔ 那一列寫進 plan.json 第一層的 `frame`，1.0 倍不寫），不要手寫。之後在構圖台換框，已經量好的 `speakerBox` 會跟著換算，不用重量。build 重新編碼底片時會照它裁切放大回 1920×1080，子母畫面、碰撞檢查都以裁切後的畫面為準。
   - 直式（plan.json `"format": "portrait"`）：預覽圖是直的、裁切框是 9:16，倍率一樣 1.0／1.15／1.3；另看講者頭頂有沒有落在 y 380–520、下巴 ≤ 860（`shared/style.md`「直式」）。
   - 寫好 `frame` 之後才做下面的步驟（場地照的座標要換算：`(x − frame.x) × 1920 ÷ frame.w`；`qc.mjs speaker` 會自動照 `frame` 裁切後再量）。
第 1–3 步是手動框講者，只有第 4 步的 `qc.mjs speaker` 印「8 格之間幾乎沒有動作」時才做；平常直接做第 4 步。

1. 場地照：專案資料夾裡檔名有「場地照」的圖。沒有就截一張：`ffmpeg -v error -ss 5 -i projects/<專案>/work/rough.mp4 -frames:v 1 projects/<專案>/work/場地照.jpg`。
2. 確認是 1920×1080：`ffprobe -v error -show_entries stream=width,height -of csv=p=0 <場地照路徑>`。不是的話，量出來的數字要等比換算（範例的 `示範口播.mp4` 是 640×360，從它截的場地照量出來要乘 3）。講者框整個落在底片尺寸內時，`--check` 會提醒「看起來是用原尺寸截圖的像素量的」並附換算後的框。
3. 框出講者的頭頂、兩肩、手勢會到的範圍，四邊各外擴 40px，寫成 `[x1, y1, x2, y2]`（左上到右下）。
4. 場地照只是一張靜止畫面，看不出手勢會比到哪。有 `work/rough.mp4` 之後，一定要跑 `node shared/template/tools/qc.mjs speaker --project projects/<專案> --write`（`--write` 把青色建議框寫進 plan.json 的 `speakerBox`，已經有的不覆寫，`--force` 才覆寫），它會產生兩張圖：

   - `work/場地照-動作範圍.jpg`：8 張畫面疊在一起，橘色是動作掃過的範圍。格線每 100px 一條、每 500px 一條粗線，數字就是 1920×1080 的座標（不是 1080p 的影片會先等比放大，座標不用再換算）。青色框是自動估的範圍（已外擴 40px），只當參考，桌面倒影會讓它的下緣偏大。
   - `work/場地照-8格.jpg`：8 個時間點的總表，先確認講者整集沒有換位置。

   建議框已經含手勢範圍（動作範圍外擴 40px），不用每次開圖；`--review` 的拼圖看到卡片擋到手勢或臉、或桌面倒影讓下緣明顯偏大時，才看這兩張圖照著改。

範例（講者坐在桌前、畫面置中）：頭頂 y≈276、雙手與身體 x≈790–1220、桌面 y≈840 → `[750, 236, 1260, 880]`，中心 x≈1005（置中）。中心 x 在 860–1060 算置中，小於 860 在左側，大於 1060 在右側；各位置適合哪些情境見 R4。

### 2.3 分鏡表格式（`work/storyboard.md`）

分鏡表由 `build.mjs --storyboard` 產生（`--merge-drafts` 通過會接著產生），不要手寫、不要手改：手改過，下一次 `--storyboard` 會 ✖。使用者在分鏡表網頁改的內容會存回這份檔。實際格式以工具產生的檔為準，這一節只說明欄位，讓你看得懂。

| 段 id | 句號（起–迄） | 時間碼 | 字幕（起點那句） | 版面 | 情境 | 畫面文字（slots） | 音效 | 理由 |
|---|---|---|---|---|---|---|---|---|
| s02 | #11–#13e | 0:25.83–0:33.44 | 千萬不要小看這份紀錄 | 疊加 | 07 key-point（warn） | lead「少了這份文件」／key「場佈多花半小時」 | 預設 | 「千萬不要」＋負面後果 → 警示重點 |
| m01 | #20–#24e | 1:02.10–1:15.40 | 接下來打開設定頁 | 子母畫面 | media 螢幕錄影 | `assets/screen/操作示範.mp4` 從 12.5s（sheet-01 #7）；#21 推近左側選單、紅框「設定」；#23 拉回全景 | 預設 | 1:03–1:14 只有聲音；sheet #7–#10 正在開設定頁，和講解同一個操作 |

- 開頭有兩行：「講者框 speakerBox＝[x1, y1, x2, y2]」、「本集圖示表」（同一個物件全集用同一個圖示）；接著是四種版面的對照表（`shared/template/SITUATIONS.md` §2）與總覽表（段落編號、章、句號、時間碼、版面、卡片類型、一句話摘要）。「章」是這段屬於哪一章（`01 痛點`；第一章之前寫 `—`），章節起點是 01 段，沒有 01 的短片用 02 段；章節角標由 build 自動常駐，不用另排。
- 總覽表後面是「情境判定」表（工具從草稿的 `story.say`、`story.why` 產生）：`| 段 | 講解在講什麼 | 首選 | 為什麼這樣呈現 |`。首選是情境動畫就做動畫；退到字卡時 `why` 寫不符合 style.md「情境動畫優先」的哪一條。
- 「版面」欄只用四個名稱：疊加、半畫面、子母畫面、全幕（SITUATIONS.md §2）。
- 截圖：`--storyboard` 會跑 `qc.mjs storyboard`，把每段的截圖放進那一段，「截圖觀察」那一行也由工具寫；不用另外跑、不用貼。不要自己算秒數跑 `snapshot --at`。
  - 截圖檔名：一段一張是 `s20.png`；一段多張是 `s20-1.png`、`s20-2.png`…（條列分組、錄影標註各一張）。同一段張數變了（例：上一版 s20 是三條的清單 `s20-1.png`～`s20-3.png`，這一版改成情境動畫只截 `s20.png`），工具會清掉同一段的舊檔並印「清掉同一段的舊截圖（這次張數變了）：…」；plan.json 已經沒有的段，舊圖留著並印 ⚠，不用就刪。自己改名的方案圖（`s05-A.png`）不會被動到。
  - 每張後面的「為什麼」：`完成態（段尾前 0.6 秒）`／`完成態（退場前 0.1 秒）`／`完成態（動畫停住的最後一刻）`＝這段內容全部出現、還沒退場的那一刻（工具讀動畫時間軸算，03 側邊欄、數字滾動卡會自動往前）；`第 1 條`、`第 2–3 條`＝條列的那一組進場完成之後（進場動畫重疊的幾條算同一組，所以三條可能只有一張）；`…到位`＝錄影標註；`段很短，截中點`；`…（整段都在動，沒有停住的畫面）`＝循環動畫。
  - 用了動態 v2 原語的段，每個拍點各截一張：`抽屜抽出後 0.3 秒：「<字>」`、`焦點抬起：「<字>」`；最後一拍之後畫面沒再變，就不另截完成態（最後一拍的「為什麼」加 `（完成態）`）。呼吸這類微動不算動畫。`qc.mjs observe` 另出 `work/observe/beat-NN.jpg`：同一套時刻、從完成影片抽格，對照分鏡截圖看 render 出來的拍點對不對。
  - 截圖停在動畫中途（字半透明、卡片在飛）→ 重跑一次 `node shared/template/tools/build.mjs --project projects/<專案> --storyboard --only <段>`；還是一樣就在回報裡列出段號和秒數，不要自己改秒數跑 `snapshot --at`。
  - 印 `✖ <id> 是全畫面清單卻沒有講者小視窗：work/rough.mp4 在 …–… 是全黑（原始素材不是）→ 初剪壞了…`：不是版面的問題，不要改 plan.json；照 → 跑 `node shared/template/tools/media.mjs verify-rough --project projects/<專案>` 重做初剪，再 build、再截圖。專案有 `assets/voice/` 的旁白時不會報（全黑本來就是旁白區間）。
- 「需要我決定的事」前面有情緒點表（`| 點 | 綁在 | 時間碼 | 情緒 | 音效 | 推近 | 要不要 ☐ |`），☑ 的點出聲、取消勾＝這個點不要；分鏡表頁上方畫成情緒曲線。
- 最後一節「需要我決定的事」固定有金句候選表，勾了才上（style.md「字卡文字」）：

  | 候選 | 句號 | 原句 | 卡上文字（≤ 14 字） | 情緒（正／負／中） | 要不要 ☐ |
  |---|---|---|---|---|---|
- 圖示先行：情境有圖示欄位（R2.7）就在草稿配圖示，「畫面文字」欄會顯示（例：`items「剪乾淨｜scissors」「剪好看｜sparkles」`）；清單的圖示每一項都配，或全部不配。
- 插入素材的列（第 5 節）：「情境」是 `media 螢幕錄影` 或 `media 圖片`；「畫面文字」是素材路徑、起點秒數（`in`）、要做的運鏡／紅框／放大鏡；「理由」是講解和畫面對上的地方。只有聲音的區間列在「只有聲音的區間」表，寫用哪一段蓋住。
- 「音效」欄：`預設`、`無`（`"sfx": null`）、換成某個名稱（例：`shine`），錄影段加 `clicks 2 下（#21@安裝、+3.2）`（音效清單見 R5.2）。`sparkle`、`shine`、`thunder` 超過 style.md 的每集上限時，寫進草稿的 `decide`，會列進「需要我決定的事」讓使用者挑；結尾要不要配樂（`outro`）也列一題。
- 時間碼是那幾句在 rough.srt 的起點與結尾；「字幕」欄是起點那句的原文（草稿的 `anchor`）。
- 內容設計動畫的段：工具把設計師的鏡位腳本（`work/designs/<段>.md` 的 `#### 動畫分鏡 <段 id>` 表，表頭 `| 拍 | 講到（綁句） | 畫面上出現什麼 | 動態（設計系統語彙） | 焦點 | 音效拍點 |`，audit 會讀這張表）放進那一段。模板動畫的拍由模板內建，不寫動畫分鏡、不寫插圖清單；鏡位腳本的寫法只給設計師看（`auto-edit-motion` 的 `references/design.md`）。

### 2.4 先處理字幕長度

`media.mjs rough` 已經用 `node shared/template/tools/media.mjs srt-align --project projects/<專案>` 排成完整語句（超過 18 字的已經拆開；直式是 10 字）。字幕長度不用另外查：`--merge-drafts`、`--storyboard` 跑的檢查會印還超過 18 字的字幕。不要用暫時的 plan.json 去跑 `--check`，會蓋掉構圖台寫好的 `frame` 和量好的 `speakerBox`。印出來長這樣：

```
⚠ 字幕 #12「提醒我桌子、椅子、電腦、提詞器、攝影機」19 字，超過 18 字 → 在 rough.srt 拆成兩則（斷在標點處）
```

還有超過 18 字的（多半是之後手改過）：到剪輯台分割（剪輯台會一起重對 `#N`）。要整份重新斷句（例：講稿改過）而 plan.json 已經用到 `#N`：`node shared/template/tools/media.mjs srt-align --project projects/<專案> --remap-plan`（照時間把 plan.json 與情境動畫的 `P.at` 換到新句號，先備份 `.align-<時間戳>`；storyboard.md 的句號會過期，以 plan.json 為準）。舊專案（沒有 `work/rough.srt.align-*`、plan.json 還沒寫）才用 `node shared/template/tools/media.mjs srt-split --project projects/<專案>`（先 `--dry-run`）；plan.json 已經用到句號時 `srt-split` 會拒絕。不要手改 rough.srt 拆句：後面的句號全部 +1，每一段的 `#N` 都要重對。

### 2.5 snapshot 怎麼看

- 圖在 `work/hyperframes/.hyperframes/artifacts/snapshots/<一串 id>/`，指令結尾會印出完整路徑。
- 先看 `review-beats.jpg`：每段至少兩格（檔名 `beat-NN-at-秒數.png`）。段起點後 0.3 秒那格**還在進場動畫中**（字被遮罩切一半、面板還在滑入，都是正常的）；**判斷版面看段中間那格**。再看 `review-seam-NN.jpg`（每個接縫前後 5 格）；`review-phone.jpg` 是手機寬度。
- 逐張確認：卡片沒擋到講者的臉；文字沒被切掉、沒超出卡片、沒斷在詞中間；字幕在底部、只有一行、中文是黑體；子母畫面裡的講者沒被切到頭；側邊欄期間講者完整在右半邊。
- `--check` 的「大約會蓋到講者框 N%」只在卡片範圍碰到臉的位置（講者框上緣往下約三成的中間），或蓋住講者框四成以上時才出現（模板固定的版位只壓到下半身不報）：截圖看到擋臉，就用 `css` 移位（R4）或換情境。只壓到身體、臉沒擋到，就保留，給使用者看預覽時點名請他確認（靜態照片看不出手勢會比到哪）。
- 示範影片本身燒了「原始時間 00:xx」黑框和「測試用場地示意圖」黃字，不是版面問題。
- 要看特定時間：`npx hyperframes snapshot --at 38.5,45.2 --no-end -o ../../output/qc`（另外產生 `contact-sheet.jpg`）。

### 2.6 完成影片預覽與修改

1. `build.mjs --review` 已經開好剪輯台，停點 ④ 那一行的網址就是完成影片預覽（像 `http://127.0.0.1:4400/?view=final`），不用再跑 `editor.mjs`。打不開才跑 `node shared/template/tools/editor.mjs --project projects/<專案> --status` 看狀態（它在非互動的 shell 裡會自己轉到背景，不用加 `&` 或 nohup；關掉用 `--stop`）。
2. 給網址時一起說三件事：要使用者確認的卡（例：碰撞 ⚠ 那張）；請他順便看字幕有沒有對到講話（snapshot 檢查不到）；要改哪一段，直接說時間軸上的段落編號（例「s05 的金句卡往左移」）就可以。
3. 使用者直接說段落編號（例「s05 的金句卡」）時，直接改 plan.json 的那個 `id`。他說「這張卡」「我選的」時，請他說段號或大約第幾秒。
   - 使用者說「第 X 秒那張卡」：看 `--check` 報告的「起–迄」欄，X 落在哪一段就是哪一段（例：75 秒 → `s04｜15 金句字卡｜1:13.26–1:18.40`）。
4. 先跑 `node shared/template/tools/versions.mjs begin --project projects/<專案> --seg <段> --say "原話"`（備份、存改前版本，印那一段的原文），再改那一段：文字改 `slots`，時間改 `from`／`to`／`at`，位置改 `css`（R4）。改完跑 `node shared/template/tools/versions.mjs finish --project projects/<專案>`（build、量、存版本一次做完），不用另外跑 `--check`、build。剪輯台的預覽會自動換成新版；畫面沒變就重新整理頁面。只想單獨存一版：`node shared/template/tools/versions.mjs save --project projects/<專案> --seg <段>`，平常不用。
5. 使用者沒說怎麼改、只說要更好（「s12 想更完善」「重新設計」），照 `auto-edit-review` 流程 D（改版）；要退回舊版（「s12 用 v1」），照流程 E（退回）。
6. 產生檔被手改過（舊專案可能在 Studio 拖過東西）時，build 會印出下面其中一則。先看改了什麼，把要保留的搬進 plan.json，再 `node shared/template/tools/build.mjs --project projects/<專案> --force`。
   - `⚠ 這些檔被手改過，沒有覆寫：… → 把改動搬進 plan.json 後加 --force`
   - `work/hyperframes/index.html 被手改過（可能是舊專案在 Studio 存檔）：…再加 --force 重跑`（build 整個停下來）

### 2.7 render

```bash
node shared/template/tools/deliver.mjs --project projects/<專案> --said "使用者原話"
```

一條做完：重新產生 → 4 秒測試片段確認有影音 → 整支（成功才換成 `output/final.mp4`，失敗不動舊檔）→ `qc.mjs final`。第一次整支的時間大約和影片一樣長；上一支只差幾段時只重畫改到的時間窗、接回去（通常不到一分鐘；印「只重畫改到的 N 秒」，指令一樣）。不是局部改動（kit、片長、字幕樣式、底片、版式、主題，或改到超過片長四成）會印一行「整支重新輸出：原因」再整支；`--force` 一律整支。工具在背景跑、前景最多等 9 分鐘；結束碼 75 就再跑一次同一條（接著等，不會重跑）。全文 log 在 `work/render.log`。

- `deliver.mjs --prerender`：立刻返回，用低優先權在背景先 render 到 `work/final-prerender.mp4`。`build.mjs --review`、`versions.mjs finish` 加 `--prerender` 才開（預設不開：預覽不用 render）。使用者說「輸出」時內容沒變就直接接手；只改了幾段就跑完補上（已經 render 的不丟）；不是局部改動才取消重來。存檔不會被擋。
- `deliver.mjs --cancel`：取消背景輸出和預先 render。
- 單獨做測試片段（使用者要看某一段 render 出來的樣子才做；平常看完成影片預覽，回饋輪也不 render）：`build.mjs --test 起點,秒數`，再照 build 印的指令 render。`render` 沒有時間範圍參數，短片段只能這樣做。起點更早的段會被略過，build 會印 `⚠ s04 在 49.5s 就開始了，測試片段不含這段（要看完整段，把起點改成 49.5）`。

### 2.7b 剪映素材（使用者要求才做）

```bash
node shared/template/tools/capcut.mjs --project projects/<專案> --dry-run
node shared/template/tools/capcut.mjs --project projects/<專案> --background
node shared/template/tools/capcut.mjs status --project projects/<專案> --wait
```

- 先跑 `build.mjs --capcut`（工具自己跑）：每段一支 `compositions/capcut-<段>.html`（透明底、沒有字幕、角標與主軌聲音；半畫面段連講者一起，因為講者被推到右邊）、一支主軌 `compositions/capcut-main.html`，清單 `work/hyperframes/capcut.json`。
- 再逐支 render 到 `output/capcut/`：每段 `NN_<段>_<起點>.mov`（`--format mov`＝ProRes 4444、有透明通道、帶那段的音效）、`主軌.mp4`、`字幕.srt`（照畫面上實際顯示的時間）、`清單.md`。合成和底片都沒變的會略過；`--only s05,s12` 只做幾段；`--no-main` 不做主軌。
- 每段約 30 秒 render、5 秒的段約 30 MB；預設同時 3 支（`--jobs N`）。用 `--background`，再跑 `status --wait`（等到做完或快逾時才印一行，不用輪詢）。
- 不輸出：章節角標、疊加卡期間講者的慢推（剪映用文字、關鍵影格補）。

### 2.8 驗收（附輸出給使用者）

`deliver.mjs` 已經跑過 `qc.mjs final`，這一節是讀它的輸出，把輸出附給使用者。只有要單獨重驗才跑：

```bash
node shared/template/tools/qc.mjs final --project projects/<專案>
```

它檢查的項目：

| 等級 | 項目 | 標準 |
|---|---|---|
| ✖ 一定要修 | 格式 | 1920×1080（直式 1080×1920）、30fps、有音軌 |
| ✖ 一定要修 | 講者小視窗 | 子母畫面段都有講者小視窗；沒有＝`work/rough.mp4` 全黑、素材又沒有純聲音檔（初剪壞了），照 → 跑 `verify-rough` 重做初剪（4.2） |
| ✖ 一定要修 | 長度 | 和 `--check` 報告的「影片長度」相差 ≤ 0.1 秒（剪輯台剪過時是 `rough.mp4 − cuts`） |
| ⚠ 逐項確認是不是刻意的 | 響度 | 整合響度 −15.5～−12.5 LUFS、true peak ≤ −1.0 dBTP |
| ⚠ | 畫面凍結 | ≥ 3 秒（01 章節轉場、沒有講者小視窗的全畫面段本來就是靜止的，已排除） |
| ⚠ | 黑畫面 | ≥ 0.5 秒 |
| ⚠ | 沒有聲音 | ≥ 4 秒（可能是漏剪的停頓） |

- ⚠ 會標出時間和段落，例：`⚠ 1:02.3–1:06.0 畫面凍結 3.7 秒（m01 螢幕錄影） → 看 qc-sheet.jpg 與該段起點截圖；…`。有 ✖ 時結束碼是 1；`--json` 給機器讀。
- 再打開 `output/qc/qc-sheet.jpg`（每 10 秒一格）掃一眼，有沒有掉圖、卡片破版、錄影卡住。理由：格式和長度全過，內容仍可能掉圖或卡住，作者踩過。
- 有插入螢幕錄影，而且 qc final 對錄影段有 ⚠、或 `qc-sheet.jpg` 看不出紅框位置時，才截那一格（`ffmpeg -v error -y -ss <秒數> -i projects/<專案>/output/final.mp4 -frames:v 1 projects/<專案>/output/qc/check-<秒數>s.jpg`），確認紅框框在對的地方。

聲音由 build 處理，回報時把 build 印的這三行貼給使用者：
- 人聲響度：重新編碼底片時，人聲調到 −14 LUFS、true peak ≤ −1 dBTP（YouTube 播放的基準），報告印 `人聲響度 −21.9 LUFS → −13.9 LUFS（true peak −7.1）`。量測結果有快取，素材沒變就不重量。完成影片的整體響度會落在 −14 ±1.5，因為音效、插入素材的聲音和結尾配樂也混在裡面。
- 音效比例：每顆音效的大小寫在 `shared/template/kit/sfx.json` 的 `targetDb`（相對人聲的 dB，上限照 `shared/style.md` 音效段）。報告印 `音效比例：主音效比人聲小 3.0–12.6 dB（中位 7.9）、附加音效小 16.1–16.1 dB；上限是比人聲小 3 dB`；有超過上限的會 ⚠，列出段落和要再調低幾 dB → 在剪輯台調那一段的音效音量（`sfxVolume`）。用了 `--no-loudnorm` 時印「沒有檢查」。
- 剪接點：`work/cutpoints.json` 的每個點，重新編碼時前後各淡 15 毫秒，消掉硬切的爆音（15 毫秒不會在底噪上挖出聽得到的凹洞）；剪輯台 `cuts` 的接點由 HyperFrames 淡 20 毫秒。有 `cutpoints.json` 時印 `剪接點微淡化：2 個接點，前後各 15 ms`；沒有時印「剪接點微淡化：略過（work/cutpoints.json 不存在；…）」，不是錯誤。
- `--check` 最後另外印「音效次數」「音效密度」兩行；有 ⚠（某個音效超過每集上限、某一分鐘主音效太多）就照 → 處理，或在回報裡說明保留的理由。
- 講者與配樂：build 另外印「講者調光：…」「講者瘦臉：…」「結尾配樂：…」三行，也一起貼。沒開、沒配時括號裡寫怎麼開（`講者調光：關（kit/look.json 預設；要開就在 plan.json 寫 "look"…）`、`結尾配樂：沒配（預設不配；要配就在 plan.json 第一層寫 "outro"…）`）：使用者看到才知道有這些功能，不要省略。
- 不想要響度與剪接點處理：`node shared/template/tools/build.mjs --project projects/<專案> --no-loudnorm`（不調人聲響度）或 `node shared/template/tools/build.mjs --project projects/<專案> --no-declick`（不做剪接點微淡化）。

## 3. plan.json

### 3.1 最小範例

示範影片實測：`--check` 0 個 ✖、2 個 ⚠（開場 30 秒 2 張、金句碰撞；處理見 4.2、2.5）。

```json
{ "version": 1, "speakerBox": [960, 260, 1640, 1020], "sideShift": 0, "pipCrop": "auto",
  "scenes": [
    { "id": "s01", "scene": "chapter-tag", "from": "#8", "to": "#10e", "anchor": "場地設定的文件", "slots": { "num": "01", "name": "場地設定" } },
    { "id": "s02", "scene": "key-point", "tone": "warn", "from": "#11", "to": "#13e", "anchor": "千萬不要小看", "slots": { "lead": "少了這份文件", "key": "場佈多花半小時" } },
    { "id": "s03", "scene": "side-panel", "from": "#17", "to": "#22e", "anchor": "接著用 Whisper",
      "slots": { "eyebrow": "字幕流程", "title": "**Whisper** 轉字幕//再請 AI 校對",
        "items": [ "轉成 **SRT** 字幕檔", { "text": "AI 檢查錯字", "at": "#19" }, { "text": "專有名詞留英文", "at": "#21" } ] } },
    { "id": "s04", "scene": "quote", "from": "#32", "to": "#33e", "anchor": "踩過的坑",
      "slots": { "text": "把踩過的坑//寫成下一次的文件", "by": "大寶" },
      "css": "#gCard { left: 120px; right: auto; margin: 0; }", "note": "預覽：擋到手勢，移到左半邊" } ] }
```

**JSON 不能有註解，最後一項後面不能有逗號。**欄位只能用下面兩張表與 R2 列的，多寫會出錯。

### 3.2 第一層欄位

| 欄位 | 必填 | 值 | 說明 |
|---|---|---|---|
| `version` | ✓ | `1` | 固定 |
| `format` | 直式必填 | `"landscape"`、`"portrait"` | 版式（`auto-edit-longform`「版式」）：直式寫 `"portrait"`，橫式不寫。要和 `work/製作進度.md` 開工決策表的「版式」一樣，不一樣時 `--check` ✖ |
| `look` | | `false` 或 `{ "color": 0–1, "slim": 0–1.2, "beauty": 0–1 }` | 講者調光、瘦臉、美顏（第 7 節；`beauty` 選填）。不寫＝用 `shared/template/kit/look.json`（預設都是 0＝關）；`false`＝都關。使用者要求才寫（要開建議 `{ "color": 0.8, "slim": 0.6 }`，美顏 `"beauty": 0.5`），構圖台、剪輯台「講者」也會寫 |
| `frame` | | `[x, y, w, h]` | 構圖裁切（2.2 第 0 步）：1920×1080 座標、16:9；底片照它裁切放大回 1920×1080。不寫＝原樣 |
| `speakerBox` | 強烈建議 | `[x1, y1, x2, y2]` | 講者框（2.2）。有 `frame` 時是裁切後的座標。沒寫會提醒，也無法檢查碰撞 |
| `sideShift` | | `0`–`960`，預設 `480` | 03 側邊欄時講者往右推多少 px（R4） |
| `pipCrop` | | `"auto"` 或 `[x, y, w, h]` | 子母畫面裁切哪一塊（R4） |
| `avoid` | | 情境 key 陣列 | 使用者說「不要用 XX」時寫進來，用了會出錯 |
| `rhythm` | | `"continuous"`（預設）或 `"spaced"` | 卡片節奏。`continuous`＝連續覆蓋（style.md）：報「沒有畫面的區間」與「講者會閃一下」；只有使用者說要留露臉空檔時才寫 `"spaced"` |
| `outro` | | 物件 | 結尾配樂：`{ "from": "#N" }`（從第 N 句起播到片尾，淡入淡出自動；`music`、`volume`、`fadeOut` 選填）。使用者要片尾配樂時才寫（R5.2） |
| `bed` | | 物件 | 底樂（選用）：`{ "music": "<曲名>" }` 整支片墊一首配樂，講話時自動壓低，片頭淡入、片尾（或片尾配樂起播前）淡出；`volume` 選填（dB）。這一集不要寫 `{ "music": null }`。曲名看 `music.mjs list`；使用者要底樂時才寫（`auto-edit-style` 的 `references/music.md`） |
| `chapterBadge` | | `true`（預設）或 `false` | 章節角標自動常駐右上角：章節開始（01 章節轉場結束；沒有 01 時是 02 章節角標段開始）一直到下一章或片尾配樂，子母畫面、全幕時自動淡出。不要常駐才寫 `false`（回到舊的行為：02 段只顯示那幾秒、`chtag` 附件照舊）。使用者說不要角標時才寫 |
| `sections` | | 陣列 | 小節角標：`[{ "at": "#N", "name": "STEP 1｜設定資料夾" }]`（講稿 `###` 小節的第一句、小節名 ≤ 12 字）。有寫時右上角角標改成「章號＋目前小節」（寬度跟著小節名），子母畫面、全幕、錄影段也露出（橫式錄影段：旁邊有空位就放空位，沒有就貼錄影畫面右上角；錄影的 `steps` 和小節名重複時不畫、⚠ 請刪掉；說明卡、箭頭自動避開，紅框被蓋到 ⚠）。講稿有 `###` 而沒寫時 `--check` 會 ⚠ 並印出可以直接貼的整行 |
| `theme` | | `"light"`（預設，不寫）或 `"dark"` | 主題：暗色時 build 換 `bg-*-dark.jpg`、所有合成 `<html data-theme="dark">`；只換顏色 token，版面與動態不變。剪輯台可以切；AI 只在使用者明說「暗色」時寫（`auto-edit-style` 步驟 6） |
| `style` | | 風格包名稱，例 `"藍圖"` | 這一集用 `shared/template/styles/<名稱>/` 的主色、子母畫面外框、背景圖（亮暗都看包裡的；包裡沒有的檔用 `shared/template/` 目前的）。不寫＝工作區目前的。名稱照 `brand.mjs list`；AI 只在使用者說「這集用 XX 風格」時寫（`auto-edit-style` 步驟 7） |
| `edit` | | 物件 | 剪輯台寫的設定（裁剪、淡入淡出、音量、轉場），AI 不主動寫（第 6 節） |
| `moods` | 建議 | 陣列 | 情緒點（style.md「音效」）：`[{ "at": "#12@千萬不要", "kind": "pain" }]`。`kind` 只能是 `quote`（金句）、`turn`（反轉）、`pain`（痛點）、`win`（解法）、`land`（落定），各配一顆音效、峰值對齊 `@詞` 的開口；`"sfx": null`＝不出聲、`"sfx": "ding"`＝換一顆；`"zoom": true`＝講者畫面同時爆衝推近（每分鐘最多 1 次）。分章草稿寫、`--merge-drafts` 收進來；停點 ③ 分鏡表「情緒點」勾選表改 |
| `scenes` | ✓ | 陣列 | 每一段一個物件，依時間順序寫 |

### 3.3 每一段的常用欄位

| 欄位 | 說明 |
|---|---|
| `id` | 英文開頭的英數字或底線，**不能有 `-`**（`s01`、`x01`），全檔唯一 |
| `scene` | 情境 key（`--list` 的 key 欄），例：`key-point` |
| `from` | 起點（3.4）。01 章節轉場不寫 from，改寫 `"at": "#N"` |
| `to`／`duration` | 結尾／秒數。都沒寫就用情境的預設長度；不能短於「最短」 |
| `anchor` | 起點那句的一小段原文，句號位移時會提醒（每段都建議寫） |
| `slots` | 卡片文字，欄位與上限看 `--list` |
| `tone` | `"warn"`（警示紅）或 `"good"`（解方綠），`--list` 寫了 tone 的情境才能用 |
| `sfx` | `kit/sfx.json` 裡 `kind` 是 `sfx` 的名稱之一（見 R5.2 或 `--list`）或 `null`；不寫＝用情境預設（R5）。要落在某一句（踩坑句、結果句）寫 `{ "name": "alert", "at": "#12e-0.1" }`（任何段都可以；`at` 寫法同 `marks`，要在這段裡） |
| `clicks` | media、custom 段：畫面上看得到游標按下的時間（`["+3.2", "#21@安裝"]`），一下一顆 `click`（R5.2） |
| `sfxExtra` | `false`＝關掉這段跟著條列／步驟的附加音效；不寫＝開 |
| `sfxVolume` | 這段音效的音量（dB，−60～+12，0＝預設），主音效＋附加音效一起調；通常是剪輯台寫的 |
| `css` | 只改位置的 CSS，id 寫模板原名（R4） |

`note` 是給人看的備註，build 不讀。其他欄位（`beats`、`chtag`、`pip`、字卡動態的 `fx`／`vars`／`bg`、custom 的 `src`／`layout`）見 R2、R3、R7；插入螢幕錄影與圖片（`"type": "media"`）見第 5 節與 R2.5。

### 3.4 時間語法與綁句

| 寫法 | 意思 | 能用在 |
|---|---|---|
| `"#N"` | 第 N 句字幕的起點 | from、to、at、beats |
| `"#Ne"` | 第 N 句字幕的結尾 | 同上 |
| `"#N+0.3"`、`"#Ne-0.2"` | 起點／結尾再加減秒數 | 同上 |
| `"#N@剪輯清單"` | 第 N 句裡講到「剪輯清單」的時間 | from、to、at、beats、清單項目的 at |
| `"#Ne@剪輯清單"` | 同一個詞講完的時間（`e` 寫在 `@` 前面） | 同上 |
| `"#N@剪輯清單+0.2"` | 詞的位置再加減秒數 | 同上 |
| `12.5` | `rough.mp4` 的絕對秒數 | 只能用在 from、to |
| `"+1.2"` | **本段起點**之後 1.2 秒 | 只能用在 at、beats、`clicks`，以及 media 段標註（`moves`／`marks`／`lens`／`callouts`／`spot`／`steps`／`arrows`／`path`）的 `at`／`until` |

- 句號＝`work/rough.srt` 的編號。build 產生檔案時就換成秒數，所以字幕改了只要重跑 build。
- 段的起點＝講到這張卡的那一句（`"from": "#N"`）。卡早到會劇透，晚到觀眾已經聽過了。
- 段的結尾通常是這段最後一句的結尾（`"#Me"`）。下一段要接著出現時，前一段的 `to` 寫成後一段的 `from`（0 秒相接，style.md「節奏」的連續覆蓋）。
- 清單項目：進場方式照 `shared/style.md`「節奏」的條列進場。講解逐項講到時，每項用 `at` 綁講到它的那一句；一句帶過全部項目時不寫 `at`，模板會自動錯開依序進場。有標題的情境（03、09 等）第一項不寫 `at`。
- 卡片主文字、每條項目、每個動畫站，出現時間＝講到那個詞的時間：綁 `#N@詞`，差 ≤ 0.5 秒（`auto-edit-storyboard` 硬規則）；段的 `from` 綁這段第一句，主文字等講到才出現。
- `#N@詞` 用 `work/transcript.json`（`media.mjs rough` 對 rough.mp4 轉的詞級逐字稿）的詞級時間，是真實開口時間，不用自己猜。build 只用不比 rough.mp4 舊、長度和 rough.srt 對得上的 transcript.json；用不到、或那句裡找不到這個詞時，才退回字數比例（「詞前面的字數 ÷ 全句字數 × 句長」，全形 1、半形 0.5；量得到說話停頓時只分給有在說話的時間）。逐字稿給的時間落在停頓裡（那一刻沒在說話）時，build 會移到開口那一刻、報告印「綁詞對準開口：N 個…」，不用手動加秒數；用字數比例時整份報告印一則 `⚠ #N@詞 有 N 個用字數比例估（<原因>），可能差 1 秒：… → 對 rough.mp4 重轉詞級逐字稿：npx hyperframes transcribe projects/<專案>/work/rough.mp4 -d projects/<專案>/work --model small --language zh --json`。照 → 重轉（剪乾淨第 6 步的轉錄指令去掉 `--to srt -o …`，不會蓋掉校正過的 rough.srt）；原因是「詞級逐字稿在那句附近找不到這些詞」時，詞照字幕原文挑 2–4 個字，或換相鄰的詞。詞要和字幕寫法一致（大小寫、中英之間的空格不影響）；同一句出現兩次時綁第一個；找不到會 ✖ 並印出那一句原文。清單項目寫在字串裡、詞有空格時加引號：`"第三項 ｜at=\"#12@Claude Code\""`。01 章節轉場的 `at` 只能寫 `"#N"`。
- `anchor` 不符時 `--check` 會提醒並列出最可能的句號：`⚠ [s02 concept] anchor「場地設定的文件」不在 #8「…」裡 → 最可能是 #11「…」，句號可能位移了`。
- 剪輯台拖過的段，`from`／`to` 可能是秒數、沒有 `anchor`（沒對到字幕時）；照樣能 build，不用改回 `#N`。秒數一律是 `rough.mp4` 的秒數，剪輯台剪掉的範圍（`edit.cuts`）build 會自己扣掉。

### 3.5 卡片文字

- `**詞**` 套主色（一張卡 1–2 個；清單、條列每項最多 1 個，標那一項最該記住的詞，例 `**Node.js** 跑動畫的環境`；使用者在剪輯台選字按「重點」或 ⌘B／Ctrl+B 可以加、可以取消）；`//` 是手動斷行，斷在語意處。兩個都只在 `--list` 標 `rich` 的欄位有效。字數算法：全形 1、半形 0.5，`**` 與 `//` 不算。
- 清單項目寫字串（`"初剪：移除多餘"`）或物件（`{ "text": "**Whisper** 轉字幕", "at": "#19" }`）。有圖示、表格的寫法見 R2。
- **字數有兩道限制**：`--list` 的上限（版面放得下的極限，超過 build 會 ✖）；`style.md` 的「字卡文字 8–14 字」（**build 不檢查，要自己數**）。主句（正文、key、金句）以 8–14 字為準。
- 文案傾向（具體實例優先、動詞放前面）照 `style.md`「字卡文字」。
- 動畫不重述講解，只留看一眼就懂的重點；完整句子交給字幕。同一張卡文字元素 ≤ 6 個（不含圖示）。標籤、條列詞 ≤ 6 字，能用一個名詞就不用片語（「回覆客戶信件」→「回信」）。
- 忠於講解：數字、專有名詞照講稿，不自編案例、數字、職稱。技術名詞保留英文，中英文之間加半形空格（`**Whisper** 轉字幕`）。
- 金句盡量用原句的詞；原句太長就取後半的翻轉句（例：「靠的不是哪一個工具，而是把每一次踩過的坑都寫成下一次可以直接用的文件」→「把踩過的坑//寫成下一次的文件」）。
- 14 講者介紹：`name`、`titles` 不寫＝`shared/setting.json` 的講者資料（`shared/style.md`「講者」）。`--check` 印「還沒設定講者」→ 先問使用者姓名與頭銜，跑 `brand.mjs speaker` 設定，不要自己編；`講者.json` 是 `{ "off": true }` 就不放 14。來賓或字幕自我介紹的名字和講者資料不同時，先問使用者再在這段寫 `name`、`titles`。

## 4. 常見錯誤與狀況

### 4.1 讀懂 `--check` 的輸出

輸出有三部分：✖ 錯誤（一定要修，有 ✖ 時 build 不產生任何檔）、⚠ 提醒（建議修，可以說明理由後保留）、每段一列的報告。每則訊息 `→` 後面就是修改建議。

工具知道答案的幾種會自動改：`--merge-drafts`、`--apply-storyboard` 寫完 plan.json 會跑 `node shared/template/tools/build.mjs --project projects/<專案> --autofix`，把文字對時、兩段透明情境重疊 ≤ 0.5 秒、清單第一項比標題早、≤ 3 秒的空檔（講者會閃一下、沒有畫面的區間）、停留太短、一分鐘超過 2 顆主音效直接改進 plan.json（一處一處試，重跑檢查沒變好就退回；改之前備份 `plan.json.bak-autofix-<時間>`），印「自動修好 N 處：…」和每一處改了什麼。`--check` 剩下的才要處理。剪輯台的「更新預覽」、`--check`、`--review` 不會自動改（使用者在剪輯台改的時間要算數）；回饋輪自己改了段之後要用，加 `--only <這輪改的段>`。

真實範例（75 秒合成測試專案的實際輸出：字幕 #7 還沒拆句、講者在右側、合成影片沒有臉）：

```json
{"version":1,"speakerBox":[960,260,1640,1000],"sideShift":480,"pipCrop":"auto",
 "scenes":[
  {"id":"s01","scene":"chapter","at":"#5","slots":{"num":"01","title":"場地設定","sub":"一份文件記位置"}},
  {"id":"s02","scene":"concept","from":"#5","to":"#7e","anchor":"第 5 句","slots":{"tag":"概念","icon":"clipboard-list","text":"**場地設定**：一份文件記位置"}},
  {"id":"s03","scene":"summary","from":"#8","to":"#9e","slots":{"text":"少了這份文件//場佈要多花**半小時**"}},
  {"id":"s04","scene":"side-panel","from":"#11","to":"#13e","slots":{"eyebrow":"剪輯流程","title":"拍完之後//先做**兩件事**","items":["初剪：移除多餘",{"text":"**Whisper** 轉字幕","at":"#12"},{"text":"輸出 **SRT** 檔","at":"#13"}]}},
  {"id":"s05","type":"fx","fx":29,"from":"#14","to":"#15e","bg":"none","vars":{"label":"做了","number":"29","unit":"支影片"}}]}
```

```
專案：projects/<專案>
HyperFrames <版本>（package.json 釘 <版本>）
⚠ 音效密度：1 個一分鐘超過 2 顆主音效（0:00–1:00 4 顆；附加音效 click 不算）→ 每分鐘留最重要的 2 顆（chapter、thunder、shine、sparkle、alert、success 先留，ding、impact 先拿掉：那段寫 "sfx": null）
⚠ 沒有畫面的區間共 3 段、35.25s → 照 style.md「連續覆蓋」補卡片或情境動畫，或把前一段的 to 延到下一段的 from（0 秒相接）；故意留給講者的就在 plan.json 寫 "rhythm": "spaced"
⚠ [s02 concept] 音效 pop（17.623s）和 s01 的音效只差 2.427s（< 3s），已拿掉（只保留前一個） → 想留這顆，就在 s01 寫 "sfx": null
⚠ [s03 summary] 和前一段 s02 之間只空 0.50s，講者會閃一下 → s02 改 "to": "#8"（0 秒相接），或拉開到 1.0s 以上
⚠ [s04 side-panel] 講者右移 480 後右緣到 2120，超出畫面 → plan.json 設 "sideShift": 0（講者本來就在面板外），或改用 04a 全畫面清單
⚠ [s05 fx 29] 和前一段 s04 之間只空 0.50s，講者會閃一下 → s04 改 "to": "#14"（0 秒相接），或拉開到 1.0s 以上
⚠ 講者瘦臉略過：抽樣 12 格都沒偵測到臉 → 這支只調光；確定有講者就跑 node shared/template/tools/look.mjs run --project projects/<專案> --force
⚠ 字幕 #7「提醒我桌子、椅子、電腦、提詞器、攝影機」19 字，超過 18 字 → 在 rough.srt 拆成兩則（斷在標點處）
id｜情境｜起–迄｜長度｜音效時間｜警告
s01｜01 章節轉場｜0:14.75–0:17.25｜2.5s｜chapter 0:15.20｜—（放在 #5 前的空檔（3.00s），前後各留 0.25s）
s02｜06 一般字卡｜0:17.50–0:27.50｜10s｜（pop 已拿掉）｜⚠ 1
s03｜11 總結字卡｜0:28.00–0:34.50｜6.5s｜pop 0:28.12｜⚠ 1
s04｜03 半版側邊欄｜0:38.50–0:48.50｜10s｜—｜⚠ 1
s05｜fx 29 數字計數｜0:49.00–0:55.50｜6.5s｜ding 0:50.82｜⚠ 1
影片長度 1:15.00（75s）
節奏：continuous（連續覆蓋：每段講解都要有畫面；要留露臉空檔就在 plan.json 寫 "rhythm": "spaced"）
沒有畫面的區間（> 1.0s）：0:01.00–0:14.75（13.75s）、0:34.50–0:38.50（4.00s）、0:55.50–1:13.00（17.50s）；共 35.25s，佔講解 49.0%
音效次數：ding 2、chapter 1、sparkle 0／6、shine 0／3、thunder 0／3
音效密度：主音效平均 3.2 顆／分（上限：任一分鐘 ≤ 2 顆，超過才 ⚠），附加音效 3 顆

通過：5 段，8 個提醒（⚠）。
```

順序：`專案：` → HyperFrames 版本（有 ⚠ 就在工作區根目錄跑 `npm install`）→ ✖ → 整支片的 ⚠（音效密度、沒有畫面的區間）→ 每段的 ⚠ → 講者調光瘦臉的 ⚠ → 字幕的 ⚠ → 每段一列的報告 → 「影片長度」「節奏」「沒有畫面的區間」（有只有聲音的區間時再一行「只有聲音」）→「音效次數」「音效密度」→ 最後一行 `通過：…` 或 `未通過：…`。「沒有畫面的區間」要是「無」才算連續覆蓋；有的話補一段，或把前一段的 `to` 改成下一段的 `from`（0 秒相接）。

「音效時間」欄會顯示 `ding 0:12.55 ＋click×2`：前面是主音效與起點，`＋` 後面是這段附加音效（09 答案的 ding、游標點擊）的顆數；被拿掉的主音效寫成 `（ding 已拿掉）`，沒有音效是 `—`。

時間是音效檔開始播的時間（畫面事件 − 峰值 ＋ 1 格），success／shine 會比畫面早，正常。

報告的「（…）」是 build 自動做的處理，不是錯誤：`換卡到 s03`＝兩張下方字卡相接時同時換場；`放在 #11 前的空檔`＝章節轉場的位置；`停在完成態，被 X 蓋過`、`接縫不淡到 X`＝不透明幕相接時的處理（R4）。插入素材（第 5 節）的列還會寫 `素材 12.5s 起`、`運鏡 2、紅框 1、放大鏡 1`、`慢推`、`進場 slide`、`只有聲音的區間不放子母畫面`。

有剪輯台設定（第 6 節）時，報告多兩種寫法：

```
m01｜media 操作示範.mp4｜1:01.30–1:14.10｜12.8s｜—｜—（rough 1:03.10–1:16.40，cuts 剪掉 0.5s；素材 12.5s 起；紅框 1；只有聲音的區間不放子母畫面）
影片長度 1:43.07（103.07s）＝ rough.mp4 107.567s − cuts 4.5s（2 段）；上表時間是完成影片的秒數（rough.mp4 的秒數寫在括號）
只有聲音（rough.mp4 1:03.80–1:14.00，10.2s）：已被 media 段或全畫面蓋住，子母畫面自動不顯示
```

- 有 `edit.cuts` 時，表格的「起–迄」是**完成影片**的秒數（完成影片預覽、`--test`、使用者說「第 X 秒」都是完成影片秒數），括號裡的 `rough …` 是 `rough.mp4` 的秒數（plan.json、剪輯台用這個）。
- 「只有聲音」那行：沒被蓋住超過 1 秒時寫 `✖ 1:10.00–1:11.20 沒被蓋住`（同時會有一則 ✖，4.2），0.1–1 秒寫 `⚠ 1:10.00–1:10.30 沒被蓋住`。

這份範例的改法：

| 提醒 | 改法 |
|---|---|
| 音效密度：一分鐘 4 顆主音效 | 照 `→` 留最重要的 2 顆（例：s03 寫 `"sfx": null`），或回報說明保留的理由 |
| 沒有畫面的區間 3 段 | 開頭 0:01.00–0:14.75、結尾 0:55.50–1:13.00 補卡片或情境動畫；中間 0:34.50–0:38.50 把 s03 的 `to` 延到 `"#11"`（s04 的 `from`，0 秒相接） |
| s02 的 pop 已拿掉 | 只是告知：和 s01 的 chapter 只差 2.4 秒。想留 pop 就在 s01 寫 `"sfx": null` |
| s03、s05 講者會閃一下 | 照 `→`：s02 的 `to` 改成 `"#8"`、s04 的 `to` 改成 `"#14"`，0 秒相接 |
| s04 右移後超出畫面 | `"sideShift": 0`。講者框左緣 x1＝960，本來就在面板（x 0–960）外 |
| 講者瘦臉略過：抽樣 12 格都沒偵測到臉 | 合成影片沒有臉，只調光是正常的；真實專案畫面裡明明有講者，才照 `→` 加 `--force` 重跑（第 7 節） |
| 字幕 #7 超過 18 字 | 在 rough.srt 拆句（2.4），改完重新對 plan.json 的句號 |
| 字幕含句中標點、字幕不到 0.6 秒 | 照 4.2 那兩列的 → 改（style.md「字幕」） |

這份是手寫 plan.json 直接 `--check`；走 `--merge-drafts` 時，「講者會閃一下」這兩則會先自動修掉（上面那段），沒有畫面的區間只有中間 4.00 秒那段超過 3 秒，要自己補。

### 4.2 常見訊息

| 訊息（節錄） | 類型 | 怎麼改 |
|---|---|---|
| `「…」N 字，上限 M → 縮成 M 字以內（全形 1、半形 0.5；不縮字級）` | ✖ | 縮文案。不要改字級、不要用 `css` 縮字 |
| `第 N 行「…」…每行上限 M → 縮文案或用 // 換斷行位置` | ✖ | 調 `//` 位置或縮字 |
| `段長 Ns，「…」至少 Ms → to 往後延到至少 …` | ✖ | 找第一個「結尾」晚於那個秒數的句子，`to` 寫 `#Ne`（`#N` 是起點，常常不夠晚）；或換情境 |
| `…晚於 D−0.3−0.6 = Xs（…完成態至少要停 0.6s）` | ✖ | `to` 往後延，或把最後一項的 `at` 提早 |
| `src（compositions/x-a.html）：P.sfx(n, '#4')：音效名與 ref 要寫成字串字面值、off 寫數字（例 P.sfx('success', '#38@兩支')、P.sfx('ding', '#41', 0.2)；音效名只有小寫英數字與 -），build 才排得出音效 → 不要用變數或 + 組字串` | ✖ | 照 → 改成字面值（R7.3） |
| `[x01 custom] compositions/x-a.html 的 P.sfx('boom', '#3')：kit/sfx.json 沒有「boom」這顆音效 → 改成 ding、success、…其中一個` | ✖ | 換成清單裡的名稱（`build.mjs --list` 看每顆的用途） |
| `[x01 custom] compositions/x-a.html 的 P.sfx('ding', '#40') 在 1:02.30，不在這段 0:50.00–1:00.00 裡，已拿掉 → 改綁這段裡的句子` | ⚠ | 照 → 改綁這段範圍內的句號 |
| `轉場：色帶擦開 4（x01、x02、x03、x08）；換卡不換景 4（…）；色帶收回 4（…）；疊加卡 4（…）｜主題：亮色`（報告最後一行） | 資訊 | build 內建的轉場（SITUATIONS.md §4 轉場語彙表），plan.json 不用寫；定稿回報照貼 |
| `⚠ 暗色背景圖 shared/template/bg-fs-dark.jpg 不存在，先用亮色那張 → 換風格時暗色三張一起放進 shared/template/` | ⚠ | 只在 `"theme": "dark"` 時出現；照 →（`auto-edit-style`），或這支改回亮色 |
| `找不到圖示「…」（…相近：a、b、c）` | ✖ | 用括號裡的相近名稱 |
| `沒有「…」這個欄位（type=scene 可用：…）` | ✖ | 欄位拼錯；照可用清單改 |
| `chtag：不用寫，角標現在自動常駐 → 刪掉 "chtag": true（要舊的附件角標，plan.json 第一層寫 "chapterBadge": false）` | ⚠ | 照 → 刪掉 `chtag` |
| `chtag：前面沒有章節轉場（chapter），角標不知道要寫哪一章 → 在這段前面加 01 章節轉場，或刪掉 "chtag": true`（只在 `"chapterBadge": false` 時） | ✖ | 照 →；短片沒有 01 就刪掉 `chtag`，在章節起點放一段 02 |
| `chapterBadge 只能是 true 或 false（不寫＝true：章節角標自動常駐右上角），現在是 … → 不要常駐角標就寫 false，否則刪掉這個欄位` | ✖ | 照 → 改 |
| `講稿有 N 個小節（###），plan.json 沒有 sections，觀眾只看得到章名 → 第一層加 "sections": […]` | ⚠ | 把印出的陣列整段貼進 plan.json 第一層；name 太長（`sections[i].name … 超過 16 字`）自己縮短，對不到的小節自己補 `#N` |
| `字幕含句中標點「，。；：」：#2、#5、#7 等 12 則 → 字幕不顯示這四種標點（保留「、！？」），跑 media.mjs srt-align 或在剪輯台改` | ⚠ | plan.json 還沒寫：重跑 `node shared/template/tools/media.mjs srt-align --project projects/<專案>`；已經寫了：到剪輯台改那幾則（`qc.mjs final` 也會報同一件事） |
| `字幕不到 0.6 秒：#3、#9 → 在剪輯台和前後句合併，或把起迄拉長` | ⚠ | 照 → 到剪輯台合併或拉長（剪映最短一則約 0.73 秒） |
| `文字對時：s07 的 key「放到電腦才看得出」在 0:28.84 出現，「到電腦」0:34.84（#20）才講到 → beats.keyAt 寫 "#20@到電腦"`；晚出現的寫 `…就講到了，晚了 2.32s → slots.items[1].at 寫 "#59@按下結束"` | ✖（差 > 1.5 秒；0.6–1.5 秒是 ⚠） | 合併、套回時已自動改過（`--autofix`）；剩下的是自動改了會出別的問題（例：挪起點會擠到前一段的動畫），照 → 後面那一句改 plan.json（`beats.<名>`、`slots.<清單>[i].at` 或 `from`），一則一則改完再跑 `--check`；⚠ 也照改。講到的秒數是用字數估的（逐字稿找不到那個詞）不會自動改。每個欄位改哪個時間點見 R2.8 |
| `#N@詞 有 N 個用字數比例估（沒有 work/transcript.json（rough.mp4 的詞級逐字稿）），可能差 1 秒：… → 對 rough.mp4 重轉詞級逐字稿：npx hyperframes transcribe …` | ⚠ | 照 → 重轉（3.4）；原因是「詞級逐字稿在那句附近找不到這些詞」→ 詞照字幕原文挑 2–4 個字，或換相鄰的詞 |
| `work/rough.mp4 在 1:56.14–2:33.51 是全黑，但素材沒有純聲音檔 → 初剪壞了：跑 node shared/template/tools/media.mjs verify-rough --project projects/<專案>` | ✖ | 不要改 plan.json 繞過；照訊息跑 `verify-rough`，照它印的重做初剪；rough.mp4 長度變了就重轉字幕（verify-rough 最後一行會說） |
| `plan.json 寫了 "check": { "textSync": false }，這次沒檢查「文字對時」→ 這只給示意／預覽用的 plan；正式 plan.json 刪掉 check，照 --check 的「文字對時」改時間` | ⚠ | `check` 是工具做示意圖用的，正式 plan.json 不要寫；刪掉後照「文字對時」改時間。格式錯（`check 要是物件…`、`check 沒有「x」這個欄位…`、`check.textSync 只能是 true 或 false…`）是 ✖，照 → 刪掉 |
| ng-snap 表格內容欄：`…；終點落在後一次開口（m:ss.ss）之前的停頓末端，後一次完整保留` | 資訊 | NG 終點往後延到停頓末端，後一次講的完整保留，是安全的；不用標「待確認」 |
| `<id> 的「…」在 m:ss.ss 才完整出現，但 <id> 在 m:ss.ss 就蓋住了，觀眾看不到 → <id> 的那個拍點綁早一點的詞（#N@詞），或 <id> 的 from 延後到 … 之後`（`qc.mjs storyboard`） | ⚠ | 照 →：那個拍點綁早一點的詞，或把蓋住它的子母畫面／全幕段 `from` 延後 |
| `讀不到動畫時間軸（…）：完成態用段尾前 0.6 秒、條列用進場後 0.9 秒估 → 截圖停在動畫中途就重跑一次`（`qc.mjs storyboard`） | ⚠ | 截圖停在動畫中途就重跑一次 `build.mjs --storyboard --only <段>`；還是一樣就在回報裡列出段號和秒數 |
| `<id> 的 fx 時間軸沒有 'done' 標記：完成態照段尾前 0.6 秒截 → 截到動畫中途就回報 003`（`qc.mjs storyboard`） | ⚠ | 看那張截圖；停在動畫中途就在回報裡寫段號與 fx 編號（模板問題，不要自己改秒數） |
| `[s07 key-point] 連續 5 段都是下方字卡（s03、s04、s05、s06、s07）→ 中間換一段情境動畫（style.md「情境動畫優先」）或別的版面` | ⚠ | 回頭查 SITUATIONS.md §3 有沒有動畫列，中間換一段 |
| `build 會停下來：瘦臉底片不是最新的（…）→ 先跑 node shared/template/tools/look.mjs run --project …` | ⚠（`--check` 只提醒；build 會 ✖ 停下來） | 看到這則先照它的 → 跑 `look.mjs`，再 build |
| `開場前 30 秒已經有 N 張（建議最多一張）`、`只露臉 Ns（< 3s）` | ⚠ | 只在 `"rhythm": "spaced"` 時出現；預設的連續覆蓋不印 |
| `和前一段 s04 之間只空 0.40s，講者會閃一下 → s04 改 "to": "#21"…` | ⚠ | 照 `→` 改成 0 秒相接（`--autofix` 會自動改） |
| `沒有畫面的區間共 N 段、Ns → 照 style.md「連續覆蓋」補卡片…` | ⚠ | ≤ 3 秒的 `--autofix` 會接起來（前一段的 `to` 延到下一段的 `from`；前一段是章節就把下一段提早）；剩下的補卡片或情境動畫；刻意留給講者的在回報說明 |
| `#11 前的空檔只有 0.50s（< 2s），章節 2.5s 會壓到 #11 的人聲 → 回剪乾淨保留 3 秒停頓…` | ⚠ | 跟使用者說明；要修就回剪乾淨：cuts.md 加章節空檔表、跑 `ng-snap`、重剪 |
| `compositions/x-….html 的 P.at('#99')：字幕沒有第 99 句（rough.srt 共 20 句，句號 1–20）` | ✖ | 情境動畫綁的句號不存在或詞找不到：照字幕原文改 `P.at` |
| `P.at('#12') 在 0:42.00，不在這段 0:56.00–1:06.00 裡 → 改綁這段裡的句子，或把 plan.json 這段的 to 延長` | ⚠ | 照 `→` 改；複製別段的檔來改時最常見（句號沒換） |
| `rhythm 只能是 "continuous"（預設，照 style.md 連續覆蓋）或 "spaced"（要留露臉空檔），現在是 "…" → 刪掉 rhythm，或改成 "continuous"／"spaced"` | ✖ | 照 → 改 |
| `outro.music：「…」不是配樂（可用：bgm-cylinder-five）→ 改成可用的配樂名稱，或寫 null 不配` | ✖ | 照 → 改 |
| `sfx：只能是 … 或 null，現在是「…」→ 改成清單裡的名稱（跑 build.mjs --list 看每顆的用途），或寫 null 不放音效` | ✖ | 照 → 改 |
| `src「compositions/x-process.html」已經給 x01 用了 → 複製成另一個檔名…` | ✖ | 同一支情境動畫不能登記兩段 |
| `音效密度：N 個一分鐘超過 2 顆主音效（…）→ 每分鐘留最重要的 2 顆…` | ⚠ | 只有段上明寫的 `sfx` 才會超過（其他的 build 自動拿掉）；`--autofix` 會照同一個優先序在最不重要的那段寫 `"sfx": null`（章節音效、使用者在分鏡表改過的不動），剩下的回報說明保留的理由 |
| `音效稀疏：0:00.00–3:33.41（213 秒：x10、x11…）沒有主音效 → …` | ⚠ | 每個空檔都補一顆：括號裡的情境動畫在結果那拍寫 `P.sfx('success', '#N@詞')`（壞事 `alert`），錄影段寫 `"sfx": { "name": "success", "at": "#Ne-0.1" }` |
| `最後一個內容在第 Xs，到退場只停 Ys，建議 ≥ 1.5s` | ⚠ | 後面有空、或下一段能一起往後挪時 `--autofix` 會自動延；剩下的 `to` 往後延一句，或請使用者決定 |
| `slots.items[0].at：…比 beats.head…還早` | ⚠ | 第一項不寫 `at` |
| `音效 pop（…s）和 s01 的音效只差 2.427s（< 3s），已拿掉（只保留前一個） → 想留這顆，就在 s01 寫 "sfx": null` | ⚠ | 只是告知；想保留後一個，就照 `→` 在前一段寫 `"sfx": null` |
| `和 X 時間重疊 Ns → 一段只放一個情境` | ⚠ | ≤ 0.5 秒的 `--autofix` 會自動錯開；更長的錯開時間 |
| `只有聲音的區間 …–… 有 Ns 沒有畫面（全黑，講者不在）→ 跑 … media.mjs scan …` | ✖（> 1 秒；0.1–1 秒是 ⚠） | 照第 5 節配一段螢幕錄影或圖片，`from`／`to` 蓋住這個區間；或用不透明的全畫面情境（04 家族）蓋住 |
| `src：找不到 assets/screen/… → 檔名要和專案的 assets/ 資料夾裡一模一樣（現有：…）` | ✖ | 照括號裡的現有檔名改；路徑相對專案資料夾，開頭是 `assets/` |
| `素材 … 長 Ns；從第 Ns 起播 Ns 要用到第 Ns → to 提早、in 改小，或 speed 改小` | ✖ | 錄影不夠長：`in` 往前、`to` 提早，或拆成兩段 media |
| `… [x, y, w, h] 超出素材範圍 W×H → 座標是素材原尺寸的像素…` | ✖ | 用 `media.mjs frame --grid` 重讀座標（5.4），不要用 1920×1080 的畫面座標 |
| `marks：… 同時有 N 個紅框（最多 2 個）` | ✖ | 位置相近的合成一個大框，或錯開 `at`／`until`（5.5） |
| `錄影 Ns 沒有任何標註或運鏡 → 講解講到畫面上的東西…` | ⚠ | 照 `auto-edit-screen` 步驟 3–4 讀座標、加紅框／說明卡／STEP（style.md「螢幕錄影與圖片」）；只對好 `in` 不算配完 |
| `在插入素材 X（…）播放期間出現，會被素材蓋住看不到` | ✖ | 下方字卡、側邊欄不能放在 media 段期間；移到前後，或把 media 拆成兩段 |
| `和 X 時間重疊 Ns：整張幕（插入素材、全畫面、章節轉場、不透明字卡）同一時間只能有一張` | ✖ | 前一段 `to` 提早到後一段的 `from`（剛好接上就好，build 會處理接縫） |
| `marks[i] 在畫面上會被右下角的子母畫面擋住` | ⚠ | 這段寫 `"pip": false`，或用 `moves` 把那一塊推到畫面中間 |
| `整段都在 edit.cuts 剪掉的範圍裡，已拿掉` | ⚠ | 使用者在剪輯台剪掉了這段講解；不要這段就從 plan.json 刪掉，要留就請使用者在剪輯台改 |
| `edit.joins[i]：at Ns 不在剪接點上（最近的是 Ns）` | ⚠ | 剪輯台的轉場沒對到剪接點；請使用者在剪輯台重新選，或改成括號裡的秒數 |
| `瘦臉底片不是最新的（<原因>；預估 N 分…；不要瘦臉就在 plan.json 寫 "look": { "slim": 0 }）→ 先跑 node shared/template/tools/look.mjs run --project …` | ✖ | 照 `→` 後面的指令跑（預估超過 2 分鐘時它已經帶 `--background`，用 `look.mjs status` 看進度），跑完再 build |
| `⚠ 講者瘦臉略過：臉寬中位數 N px < 60 px…，只調光` | ⚠ | 畫面裡的臉太小，瘦臉看不出來，是正常的；回報時說明 |
| `⚠ 講者瘦臉略過：偵測率 N%（< 80%），只調光 → …` | ⚠ | 看 `work/look-preview.jpg`；講者常轉身、遮臉時會這樣。確定不要就寫 `"look": { "slim": 0 }` |
| `⚠ 講者瘦臉略過：抽樣 12 格都沒偵測到臉 → 這支只調光；確定有講者就跑 … look.mjs run --project … --force` | ⚠ | 只有聲音或講者沒入鏡的影片是正常的；畫面裡明明有講者才照 `→` 重跑 |
| `⚠ 講者瘦臉略過：找不到 shared/template/vendor/mediapipe/…，只調光 → node shared/template/tools/look.mjs ensure` | ⚠ | 跑 `node shared/template/tools/look.mjs ensure` 看缺哪個檔，照它的 → 做（`setup/troubleshooting.md`） |
| `⚠ 講者瘦臉略過：找不到 HyperFrames 的 Chrome，只調光 → npx hyperframes browser ensure` | ⚠ | 照 `→` 跑，再 build |
| `⚠ 講者瘦臉還在跑（look.mjs run，pid …）→ 等 … 顯示「完成」再 build` | ⚠ | 背景的 `look.mjs run` 還沒跑完：每 30 秒跑一次 `look.mjs status`，「完成」後再 build |
| `⚠ 瘦臉還沒套到底片（…），這次先用 work/rough.mp4 → …` | ⚠ | 這次 build 先用沒瘦臉的底片；照 `→` 跑完 `look.mjs run` 再 build |
| `look.slim 要是 0–1.2 的數字…` 這類 `look…` 開頭的訊息 | ✖ | 照訊息改 plan.json 的 `look`（只能寫 `color`、`slim`、`beauty`） |
| `✖ s21 是全畫面清單卻沒有講者小視窗：work/rough.mp4 在 1:56.14–2:33.51 是全黑（原始素材不是）→ 初剪壞了，跑 node shared/template/tools/media.mjs verify-rough --project projects/<專案> 照它印的做`（`qc.mjs storyboard`、`qc.mjs final`；另一種是「講者小視窗在 m:ss.ss 就沒了（段到 …）」） | ✖ | 不是版面的問題，不要改 plan.json；照 → 重做初剪，再 build、再截圖。專案有 `assets/voice/` 的旁白時不會報 |
| `⚠ <id> 是全畫面清單卻沒有講者小視窗 → 跑 node shared/template/tools/qc.mjs final --project … 看原因`（`qc.mjs observe`；`work/observe/index.md` 總表的「小視窗（子母畫面段）」欄是 `無`／`部分（m:ss.s 起沒有）`） | ⚠ | 照 → 跑 `qc.mjs final` 看原因，再照上一列做 |
| `清掉同一段的舊截圖（這次張數變了）：…`（`qc.mjs storyboard`） | 資訊 | 不用處理；plan.json 已經沒有的段，舊圖留著並印 ⚠，不用就刪 |
| `⚠ <id> 在 m:ss.s 就開始了，測試片段不含這段：格子不標它（要看這段，build --test 的起點改成 …）`（`qc.mjs observe --offset`） | ⚠ | 要看那段，把 `build --test` 的起點改成它印的秒數 |

其他訊息照 `→` 改；其餘訊息、密度規則與 build 檢查哪些，見 R6。

### 4.3 使用者常見的要求

| 使用者說 | 怎麼做 |
|---|---|
| 「字再大一號」 | 做不到：字級由模板固定，`css` 不能改字級。想更醒目，可以縮短卡片文字，或換成全畫面情境（04 家族，整個畫面只有這張卡；字級差不多，不會變大） |
| 「這張卡晚一句再出來」 | 改那段的 `from`（例：`#11` → `#12`），重跑 `--check` 與 build |
| 「第 X 秒那張卡」 | 2.6 第 3 點 |
| 「字幕早了／晚了」 | 逐字稿的時間碼會漂 1 秒左右，snapshot 看不出來。改 `work/rough.srt` 那一則的起訖時間（句號不變，不要重新轉錄），重跑 build；綁在這句的卡會跟著移 |
| 「換主色」「加背景圖」 | R9 |
| 「這段換成螢幕錄影」「旁白那段配畫面」 | 第 5 節：`media.mjs scan` 看 contact sheet，加一段 `"type": "media"` |
| 「錄影太快／太慢」「錄影對不上講解」 | 改那段 media 的 `speed`（0.5–4）或 `in`；講解跳著講就拆成幾段 media，各自設 `in`（5.2） |
| 「紅框歪了」「框大一點」 | 用 `media.mjs frame --grid` 在紅框出現的那一秒重截格線圖，重讀 `box`（5.4） |
| 「錄影時不要露臉」 | 那段 media 寫 `"pip": false` |
| 「剪掉這幾秒」「調音量」「加淡出」 | 請使用者打開剪輯台（`shared/template/EDITOR.md`）自己拖；使用者要你直接改，就照第 6 節寫 `edit` |

## 5. 插入螢幕錄影與圖片

`assets/screen/`（操作畫面）、`assets/images/`（截圖、照片）裡的檔，用 plan.json 的 `"type": "media"` 段插進完成影片：素材整張蓋住講者，講者縮到右下角子母畫面，講解照常。**「只有聲音」的區間一定要用 media 段蓋住**：旁白檔接進主軌時配的是純黑畫面，build 用 ffmpeg 偵測 `rough.mp4` 全黑的地方，沒蓋住超過 1 秒就 ✖。

### 5.1 什麼時候用

| 用 | 不要用 |
|---|---|
| 只有聲音的區間（一定要） | 講者在講觀念、講故事（看人比看畫面重要） |
| 講解在講操作：「打開設定頁」「點右上角」「貼上提示詞」 | 錄影裡沒有講解講到的東西（觀眾會找不到重點） |
| 講解在講一張圖：架構圖、結果截圖、網頁 | 同一張圖已經有資訊卡在講 |

- 一段講解配一段錄影：從講到那個操作的句子開始，講完就回到講者。連續講好幾個不同的操作時，一個操作一段 media（每段各自的 `in`），中間不用回講者；同一個操作要變速、定格用 `retime`，不要拆段。
- media 段期間不能放下方字卡、側邊欄（會被素材蓋住，build ✖）；要強調畫面上的東西，用紅框、說明卡、聚光燈、箭頭、放大鏡（5.5）。字卡動態（`bg: "none"`）可以疊，但要用 snapshot 確認沒擋到錄影在講的地方。
- 字卡密度在錄影段往稀的那端（`shared/style.md`「螢幕錄影與圖片」）。

### 5.2 配對流程（AI 看圖＋對字幕）

1. 掃素材：`media.mjs prep` 開工時已經做了（要重掃跑 `node shared/template/tools/media.mjs scan --project projects/<專案>`）。
   產生 `work/media/index.md`（總表：每個檔的長度、解析度、有沒有聲音、細節在哪，以及 `rough.mp4` 只有聲音的區間）、每支錄影一份 `work/media/<檔名>/events.md`（**事件**：哪一秒切頁、開視窗、哪一塊變了，附框和建議的 `in`；**等待**：可以快轉的區間，附 `retime` 寫法；**捲動**；contact sheet 每一格的秒數）、`work/media/<檔名>/sheet-NN.jpg`（影片，在事件之後取格）和 `work/media/images/sheet-NN.jpg`（圖片，每頁 12 張，每格標檔名）。盤點由子代理做，每支錄影、每批圖片寫一份 `work/media/notes/<檔名>.json`（`auto-edit-screen` 步驟 1）。
2. 讀那支的 `events.md`，要看畫面才開 sheet。每格左上角是「`#格號 分:秒`」（素材本身的時間）；右上角有黃色小方塊的格子＝事件剛發生完（切頁、開視窗、跳出選單），操作通常就從這幾格開始。
3. 對字幕：看 `work/分鏡素材/chNN.md`（素材候選和字幕都在裡面，不用讀整份 `rough.srt`），找出講解在講哪個操作，對到 `events.md` 上那個事件。
   - `from`／`to` 綁講解的句號（`"#20"`、`"#24e"`），跟資訊卡一樣。
   - `in`＝素材從第幾秒開始播：取那個操作開始那格的秒數，再往前 0.5–1 秒（讓觀眾先看到操作前的畫面）。
   - 知道操作在素材的哪裡開始、哪裡結束時，寫 `in` 和 `out`，速度 build 自己算（`out` 和 `speed` 擇一）。
   - 播到第 k 句時，畫面是素材的第 `in ＋ (第 k 句起點 − from 的秒數) × speed` 秒。用這個式子檢查後面幾句講的操作有沒有對上。講解和畫面對不上、中間要等、要停在結果畫面講好幾句，都在同一段寫 `retime`（5.3），不要拆段（有游標、打字的畫面不要超過 1.5 倍）。只有講解換到另一個操作才開下一段 media。
   - 圖片沒有時間，只要決定綁哪幾句。
   - 只有聲音的區間：`from` 要在區間起點之前（或剛好），`to` 要在區間結尾之後；句子剛好對不上時，`from`／`to` 可以寫秒數（`rough.mp4` 的秒數，`index.md` 有列）。
4. 寫進草稿（`work/drafts/<份>.json`）的 media 段：`src`、`in`、`from`、`to`，`story` 寫為什麼配這段；分鏡表由工具產生。只有聲音的區間每一段都要被 media 或不透明全幕蓋住。
5. 要框、要推近、要放大鏡的地方，截格線圖讀座標（5.4），寫進草稿那一段（5.3）。
6. `build.mjs --review` 的拼圖看有紅框、放大鏡的那幾格；錄影要確認有在動，看 `qc.mjs final` 的「畫面沒動」。

### 5.3 寫法

```json
{ "id": "m01", "type": "media", "src": "assets/screen/操作示範.mp4", "from": "#20", "to": "#26e", "anchor": "打開設定頁",
  "in": 12.5,
  "steps":    [ { "at": "#20", "text": "打開設定" }, { "at": "#23", "text": "建立金鑰" } ],
  "moves":    [ { "at": "#20+0.5", "to": [0, 120, 640, 400] }, { "at": "#22", "to": "full", "dur": 0.6 } ],
  "callouts": [ { "at": "#21", "until": "#21e", "box": [24, 300, 220, 64], "text": "設定", "icon": "settings" } ],
  "marks":    [ { "at": "#23", "until": "#24e", "box": [441, 310, 249, 428],
                  "path": [ { "at": "#24", "box": [498, 759, 450, 52], "dur": 0.6 } ] } ],
  "arrows":   [ { "at": "#25", "to": [1712, 64] } ],
  "lens":     [ { "at": "#26", "until": "#26e", "box": [1500, 40, 300, 90], "zoom": 2 } ] },
{ "id": "m02", "type": "media", "src": "assets/images/架構圖.png", "from": "#27", "to": "#29e", "anchor": "整體架構",
  "spot": [ { "at": "#28", "until": "#29", "box": [820, 260, 600, 420] } ] }
```

（標註出現期間不能運鏡：範例的推近在 `#21` 前結束、拉回全景在說明卡退場後的 `#22`。說明卡停得夠不夠久、有沒有和運鏡重疊，寫完跑 `build.mjs --check-draft work/drafts/<份>.json` 看。）

| 欄位 | 預設 | 說明 |
|---|---|---|
| `src` | 必填 | 相對專案資料夾，只能在 `assets/screen/` 或 `assets/images/` 底下。影片 `.mp4 .mov .m4v .webm`，圖片 `.jpg .jpeg .png .webp` |
| `from`／`to`／`duration`／`anchor` | `to` 或 `duration` 必填 | 同其他段（3.4） |
| `in` | `0` | 錄影從第幾秒開始播；`in ＋ 段長 × speed` 不能超過錄影長度 |
| `out` | — | 錄影播到第幾秒：`speed`＝(`out` − `in`) ÷ 段長，build 算；段 ≤ 3 秒時可到 64 倍（快轉跳過等待，⚠ 提醒） |
| `speed` | `1` | 0.5–4（和 `out` 擇一） |
| `hold` | — | 定格：整段停在錄影第幾秒那一格（build 抽成一張圖；`in`／`out`／`speed`／`volume` 不用寫）；標註、放大鏡、運鏡照常 |
| `retime` | — | 同一段裡變速、定格：`[{ "at": "#21", "src": 19 }, …]`，講到 `at` 時錄影在第 `src` 秒，兩點之間速度 build 算（下限 ×0.25、上限 ×16，3 秒內的跳過等待可到 ×64）；`src` 一樣＝定格。第一點之前、最後一點之後是正常速度。運鏡、紅框跨整段；不保留原聲；和 `in`／`out`／`speed`／`hold` 擇一 |
| `redact` | — | 打碼：`[{ "box": [x, y, w, h], "at": "#21", "until": "#22e" }]`，框裡的東西模糊後燒進影片（放大鏡也看不到原文）；`at`、`until` 不寫＝整段。框要蓋住那段時間它會出現的所有位置，build 完在拼圖看一次 |
| `fit` | `"contain"` | `contain`＝整張看得到，放在字幕帶上方（y 0–940），空白處是黑底；`cover`＝鋪滿 1920×1080，多的裁掉 |
| `pip` | `true` | 右下角子母畫面露臉（橫式會自動移進素材右下角，不用寫座標）；只有聲音的區間自動不放。`false`＝整段不露臉 |
| `volume` | `null` | `null`＝素材靜音；寫 dB 數字（−60～+12）＝保留素材原聲 |
| `enter`／`exit` | `"fade"` | `"cut"`、`"fade"`、`"slide"`（從右滑入、往左滑出）、`"zoom"`、`"whip"`（甩鏡：0.3 秒從右甩進、往左甩出，有動態模糊）；只能寫在 `enter`：`"tilt"`（斜躺擺平：面板從透視斜躺 0.65 秒擺平，錄影、圖片都可以，要 `fit` `"contain"`）、`"tape"`（紙膠帶貼上：只給圖片）。挑哪一種照 `shared/style.md`「螢幕錄影與圖片」 |
| `moves`／`marks`／`lens` | — | 運鏡、紅框（含跟捲動 `path`）、放大鏡（5.5） |
| `callouts`／`spot`／`steps`／`arrows` | — | 說明卡、聚光燈、STEP 膠囊、箭頭（5.5） |
| `kenburns` | 圖片 `true` | 圖片沒寫 `moves`、也沒有 `callouts`／`spot`／`arrows` 時整段慢推 1.00→1.05；`false` 關掉 |
| `sfx`／`sfxVolume` | 不配 | 錄影段預設不配；要配就寫 `{ "name": "success", "at": "#24e-0.1" }`（`at` 寫法同標註，落在這段裡） |
| `stepsSide` | 自動 | STEP 膠囊放錄影左上；壓到紅框自動換右上。`"right"`／`"left"` 指定 |

- `moves`／`marks`／`lens`／`callouts`／`spot`／`steps`／`arrows` 與 `path` 的 `at`／`until` 用 `"#N"`、`"#Ne"`、`"#N+0.5"`、`"+3"`（本段起點後 3 秒），要落在這段裡面。
- 同一支錄影、後段的起點接上前段的終點：自動硬接，不疊化。連續兩段 media（或 media 接全畫面情境）剛好接上時，接縫自動不淡出；後一段用 `slide`／`zoom` 進場時，前一段會墊在底下直到進場完成。
- 錄影一律轉成 30fps、每秒一個關鍵影格（`work/hyperframes/assets/media/`，素材沒變就不重轉），`<video>` 放在主合成；不要自己寫 custom 放錄影。

### 5.4 座標怎麼讀（`frame --grid`）

```bash
node shared/template/tools/media.mjs frame --project projects/<專案> --src assets/screen/操作示範.mp4 --at 14.2 --grid
```

- 產生 `work/media/frames/操作示範-14.2s-grid.jpg`：**素材原尺寸**的截圖，每 100px 一條黃線（每 500px 粗一點），上緣與左緣標 x、y 數字，每 500px 再重複標一次。圖片不用 `--at`。
- `--at` 用紅框出現那一刻的素材秒數：`in ＋ (at 的秒數 − from 的秒數) × speed`（5.2 第 3 步的式子）。錄影會捲動，時間不對框就會歪。
- `box` 寫 `[x, y, w, h]`：被框元素左上角的座標與寬高，**貼齊整個控制項的邊**（輸入框連外框、清單列連左邊的圖示）；紅框的內距（6px）與線寬（4px）build 會自己加，上下左右等距。
- `events.md` 的框已經是素材原尺寸的像素，可以直接抄；格線圖是用來讀表上沒有的東西。
- 座標一律是素材原尺寸的像素，不是 1920×1080 的畫面座標；build 依 `fit`、運鏡換算到畫面上。`index.md` 的「解析度」欄就是座標範圍。
- `callouts`／`spot`／`marks.path` 的 `box` 和紅框一樣貼齊元素的邊；箭頭的 `to` 寫 `[x, y]` 一個點：要指的那個元素**最靠近箭尾那一側的邊**（例：箭頭從右上來，就寫元素右上角附近的點），build 會讓箭尖停在離它 9px 的地方。

### 5.5 運鏡、紅框、標註、放大鏡

| | 寫法 | 規則（build 會檢查的標 ✖／⚠） |
|---|---|---|
| 運鏡 `moves` | `{ "at": "#21", "to": [x, y, w, h] }`；拉回全景 `"to": "full"` | 推近到框剛好塞滿畫面（字幕帶上方）。推近超過 4 倍會糊（⚠，改用放大鏡）；兩次運鏡不能重疊（✖）；`dur` 0.2–5，預設 1.5 秒（倍率 ≥ 2 時 2.2 秒），寫得比預設短 ⚠；一段超過 2 次、第一次在段起點 0.8 秒內、兩框倍率差超過 1.4 倍都 ⚠。講完那一塊就 `"full"` 拉回 |
| 紅框 `marks` | `{ "at": "#21", "until": "#22e", "box": [x, y, w, h] }`；`until` 不寫＝到段尾。錄影捲動時加 `"path": [{ "at": "#22", "box": [x, y, w, h], "dur": 0.6 }]` | 實線 4px 警示紅、描線 0.4 秒進場、0.3 秒淡出；跟著運鏡一起動（線寬自動維持 4px）。同時最多 2 個，說明卡的框也算（✖）；停不到 0.5 秒的拿掉（⚠）；最後一個框自動多停 1 秒；被子母畫面擋住、壓到字幕區、運鏡後跑出畫面會 ⚠（出現到消失全程都查）。`path` 每一步把同一個框移到新位置：要等框描完（`at` 後 0.4 秒）才能動、淡出前要到位（✖）；`dur` 0.2–2，預設 0.4 |
| 說明卡 `callouts` | `{ "at": "#21", "until": "#22e", "box": [x, y, w, h], "text": "打開 API 設定", "icon": "settings" }`；選填 `"side"`、`"quick": true` | 紅框＋引線＋說明卡。`text` 最多 12 字（✖）；`icon` 名稱用 `build.mjs --icons <關鍵字>` 查（不要打開 `kit/icons.json`）；`side` 不寫＝依序試右、左、下、上，自動挑放得下的那邊；寫了但放不下 ✖，訊息會告訴你改哪一邊。完整可讀一般至少 1.2 秒（`until − at ≥ 2.35` 秒）、`quick` 至少 0.8 秒（≥ 1.35 秒）（✖）。期間不能有運鏡（✖） |
| 聚光燈 `spot` | `{ "at": "#21", "until": "#22e", "box": [x, y, w, h] }`；`until` 不寫＝到段尾 | 其他地方壓暗 35%，只留框的地方（外擴 8px、圓角）；淡入淡出各 0.4 秒。至少 2 秒、一次一個、不和放大鏡同時（✖）；期間不能有運鏡（✖） |
| STEP 膠囊 `steps` | `[{ "at": "#20", "text": "新增專案" }, { "at": "#23", "text": "連接 Gmail" }]` | 錄影可見區左上角（離錄影邊 32px）「STEP N＋這一步在做什麼」；壓到紅框自動換右上（`stepsSide` 指定）。`text` 最多 12 字；依時間排、相鄰兩步至少 1.65 秒、最後一步離段尾至少 1.65 秒（✖）。號碼 build 自己算：全片接著數，和前面同字的沿用號碼；下一段接著同一步時第一步寫同樣的字、`at` 寫 `"+0"`，膠囊不會重播。壓到其他標註會 ⚠ |
| 箭頭 `arrows` | `{ "at": "#24", "to": [x, y] }`；選填 `"until"`（預設 `at` 後 3 秒）、`"from": "ne"`（箭尾方向） | 指小按鈕、小圖示。箭尖離 `to` 9px，箭身 120px（放不下用 96px）；`from` 不寫＝依序試 ne、nw、se、sw、e、w、n、s，挑第一個不壓到字、卡片、膠囊、紅框線、子母畫面的方向；寫了但放不下 ✖ 並建議方向；全部放不下就拿掉（⚠）。至少 2.2 秒、一次一支（✖）；放大鏡期間自動拿掉（⚠）；期間不能有運鏡（✖） |
| 放大鏡 `lens` | `{ "at": "#23", "until": "#24", "box": [x, y, w, h], "zoom": 2 }`；`until` 不寫＝`at`＋3 秒 | 原區域描主色框 → 鏡片彈到畫面中央偏上、背景壓暗 → 縮回原位。至少 1.2 秒（✖）；一次一個（✖）；`zoom` 1.2–4；鏡片最大約 1600×720，框太大時自動降低倍率（降到 1.2 倍以下會 ⚠）；期間有運鏡會 ⚠（鏡片位置用 `at` 那一刻算） |

- 紅框：位置相近、連續幾句講同一塊時，**一開始就畫一個涵蓋全部的大框**，不要一句一框反覆閃；框要等那個元素出現在錄影上才畫。
- 放大鏡：給小字、數字、小按鈕用；`box` 只框要看清的那一小塊（鏡片和框同比例）。錄影在動時鏡片裡也會動（逐格同步）。
- 推近與放大鏡二選一：要看一整區用運鏡，只看一個小地方用放大鏡。
- 標註和運鏡錯開：說明卡、聚光燈、箭頭出現時畫面必須是停的。要推近再標註，就先 `moves` 推過去（`dur` 結束），再讓標註的 `at` 晚於它。
- 選哪一種標註：講「這一塊」用紅框；講「這是什麼／按這個」用說明卡；要觀眾只看一塊、其他都不重要用聚光燈；目標小到紅框框不清楚用箭頭；字太小看不清用放大鏡；一步一步的操作加 STEP 膠囊。
- 說明卡和紅框不要框同一個東西：說明卡本身就有紅框。
- build 自動做、不用寫：從講者切進錄影段（`enter` 是 `"fade"`）時，錄影面板從右下角小視窗長出；同一段有好幾個紅框、說明卡、箭頭時，後一個出現，前面還留著的壓暗到一半，最後一個出現後回均衡（同時出現的不互相壓暗）。放大鏡本來就壓暗；`clicks` 只有音效。
- 箭頭指的東西已經有紅框時，`to` 改指紅框外面一點（箭頭不能穿過紅框線）。
- 錄影裡看得到游標按下的地方，在那段寫 `"clicks": ["+3.2", "#21@安裝"]`，一下一顆 `click` 音效（style.md「音效」）；用錄影裡按下那一格的 `+秒數` 比 `#N@詞` 準。講解說「點／按 X」時再加一支箭頭先指到 X，`until` 在按下前 0.3 秒。

### 5.6 檢查

- `--check`：同一段素材放兩次 ⚠「和 m03 重疊 a.mp4 12–18s」（定格、相接的不算；同一張圖不相鄰才算）；`--review` 印「素材：錄影用了 12／31 支…；沒用到：…」。
- `--check` 報告那一列：`素材 12.5s 起、原聲 -6dB`、`運鏡 2、紅框 1（跟捲動 1 次）、標註 1、STEP 2（第 1–2 步）、箭頭 1、放大鏡 1`、`只有聲音的區間不放子母畫面`。箭頭被拿掉時寫 `箭頭 0（拿掉 1）`，對照 ⚠ 改 `to` 或 `from`。
- 截圖：`node shared/template/tools/qc.mjs storyboard --project projects/<專案>` 會在紅框、每一步 `path`、說明卡、聚光燈、每一步 STEP、箭頭、放大鏡到位的那一刻各截一張（`work/storyboard-preview/m01-1.png` …），確認框住的是講解講的東西、卡片和箭頭沒壓到字、鏡片沒壓到子母畫面。
- 測試片段挑一段 media：確認錄影有在動（沒寫 `hold` 的段不該停格）、子母畫面在只有聲音的區間沒出現；跑 `node shared/template/tools/qc.mjs observe --project projects/<專案> --file <測試片段> --offset <起點>` 看接縫條帶有沒有閃。

### 5.7 邊錄邊講的螢幕錄影（主軌）

錄影裡就有講解的螢幕錄影，不是插入素材，是主軌的一部分：

| 步驟 | 工具做什麼 | 你要做的 |
|---|---|---|
| `media.mjs main` | 每支 `assets/screen/` 錄影判斷一次：有講話、有換氣停頓（有聲音的時間 20–95%）＝邊錄邊講，接進主軌（只取聲音、配純黑，`main.json` 的 `kind` 是 `screen`）；一路不停的背景音樂、沒聲音＝插入素材 | 判斷印在停點 ①；判斷錯了用 `--order` 指定要接的檔 |
| `media.mjs ng-snap` | 錄影那幾段整段 `--add-in`（扣掉 NG）：只剪 NG、停頓保留，畫面才不會亂跳；有講稿時照講稿比對主軌順序 | 順序 ⚠ 放進停點 ① |
| `media.mjs prep` | 畫面在等、又沒人講話 ≥ 3 秒的地方列進 `cuts.md` 的「等待」表（預設不勾；和 NG 列一樣在剪輯清單頁勾） | 停點 ① 給使用者看；勾了就壓成 1.5 秒快轉，那段聲音一起剪掉 |
| `media.mjs screen-sync` | 照 `work/cuts.v1.json` 算初剪後每段對到錄影的哪一秒，寫 `work/screen-sync.json`（`sync01`、`sync02`…，NG 剪掉的地方切成兩段；勾了的等待多一段 `retime` 快轉，前後硬接） | 初剪、cutpoints 之後跑 |
| `media.mjs screen-sync --write-plan` | 把 sync 段放進 plan.json（先備份 `plan.json.sync-<時間>`；舊的 sync 段整批換掉，其他段不動） | `--merge-drafts` 會自己放，平常不用跑；初剪重做過、沒有重新合併時才跑 |

- sync 段就是一般的 media 段：可以加 `moves`、`callouts`、`clicks`（5.5），`from`／`to`／`in` 不要改，改了畫面就對不上聲音。
- 兩段 sync 相接時 build 自動疊化 0.47 秒（NG 剪接點不會硬跳）。
- sync 段蓋住的區間沒有講者小視窗（整段在只有聲音的區間）；build `--check` 報「只有聲音的區間沒有畫面」而有 `work/screen-sync.json` 時，會直接叫你跑 `--write-plan`。

## 6. 剪輯台的設定（edit）

剪輯台（`shared/template/EDITOR.md`）是給使用者自己拖拉調整的網頁。它只寫 plan.json 的這幾個地方，AI 不主動改；**AI 要改 plan.json 前先重新讀檔，不要蓋掉使用者在剪輯台存的值**：

- 第一層的 `edit`（下表）。
- 第一層的 `look`（講者調光、瘦臉）：剪輯台一律兩個都寫，例如 `{ "color": 0.8, "slim": 0.5 }`；按「恢復預設」會整個拿掉。使用者在剪輯台改過，就以剪輯台的值為準。
- 第一層的 `frame`（構圖台拖的框；停點 ② 還沒有 plan.json 時會新建）：換框時已經有的 `speakerBox`、`pipCrop`（陣列）會跟著換算成同一塊畫面，不用重量。
- 任何段落的 `sfxVolume`、`"sfx": null`（靜音），以及 `slots`／`vars` 的文字。
- media 段的 `from`／`to`／`in`／`anchor`／`enter`／`exit`／`volume`。拖到字幕邊界時寫 `"#N"`／`"#Ne"`，沒對到字幕時寫秒數並拿掉 `anchor`；兩種都能直接 build。
- `work/rough.srt` 的字幕文字與時間，也可能新增、分割、合併、刪除字幕；句子數量變了，剪輯台會把 plan.json 所有 `#N` 一起重新對好，`work/storyboard.md` 的句號會過期，以 plan.json 為準。

### 6.1 `edit` 的欄位

```json
"edit": {
  "cuts": [[12.0, 14.5], [41.2, 41.9]],
  "fadeIn": 0.5, "fadeOut": 1.0,
  "volume": { "voice": 0, "sfx": -3, "media": 0 },
  "gains": [{ "from": 41.9, "to": 44.0, "db": 4 }],
  "joins": [{ "at": 12.0, "type": "dip", "dur": 0.3 }, { "at": 20.5, "type": "punch" }]
}
```

| 欄位 | 值 | 說明 |
|---|---|---|
| `cuts` | `[[起, 迄], …]`（`rough.mp4` 秒數） | 從完成影片拿掉的範圍。重疊的會合併 |
| `fadeIn`／`fadeOut` | 0–10 秒 | 片頭從黑淡入、片尾淡出到黑；聲音（人聲、音效、素材原聲）同步淡入淡出 |
| `volume.voice`／`sfx`／`media` | −60～+12 dB | 主軌人聲／全部音效／有開原聲的 media 段的總音量 |
| `gains` | `[{ from, to, db }]`（`rough.mp4` 秒數） | 只調人聲某一段的音量，疊在 `volume.voice` 上；範圍不能重疊（✖） |
| `joins` | `[{ at, type, dur? }]` | 接點轉場。`at` 要對到 `cuts` 的邊界或 `work/cutpoints.json` 的剪接點（±0.1 秒會自動吸附，否則 ⚠）。`type`：`"none"`、`"dip"`（過黑，`dur` 預設 0.3）、`"punch"`（接點後畫面放大 1.08 倍到下一個接點，講解跳接常用） |

所有秒數都是 `rough.mp4` 的秒數（剪掉之前的時間軸）；沒有 `edit` 或欄位沒寫＝不做任何處理，輸出和沒有剪輯台時一模一樣。音量 0 dB＝原音量，最大 +12 dB。

### 6.2 `cuts` 生效後

- 完成影片長度＝`rough.mp4` − cuts（`--check` 報告最後一行；2.8 驗收用這個數字）。
- 字幕、資訊卡、音效、media 段全部照剪掉的範圍重新對時間：整段落在剪掉範圍裡的段會被拿掉並 ⚠；部分重疊的段被裁短（報告寫 `cuts 剪掉 Ns`）。插入的錄影也跳過同一段，和講解保持同步。
- 報告與完成影片預覽、`--test` 的秒數是**完成影片**秒數；plan.json、剪輯台、`--check --json` 是 `rough.mp4` 秒數（報告括號裡有對照）。
- 剪掉的地方 build 會在兩側加 0.02 秒的聲音淡入淡出，避免爆音。

### 6.3 音效音量

- 每一段都能寫 `"sfxVolume": -6`（dB）：這段的主音效與附加音效一起調，疊在 `kit/sfx.json` 的預設音量與 `edit.volume.sfx` 上。
- `"sfx": null` 仍是拿掉這段的主音效。
- `--check` 報告的「音效時間」欄不顯示音量；要看最終音量用 `--check --json`（6.4）的 `items[].sfx[].volume`／`db`。

### 6.4 `--check --json`

```bash
node shared/template/tools/build.mjs --project projects/<專案> --check --json
```

剪輯台用的機器可讀報告，stdout 只印一個 JSON（所有訊息都在 `errors`／`warnings` 裡），不寫檔。格式見 R2.6；除錯時也可以用它看每一段在 `rough.mp4` 的位置與每顆音效的最終音量。

## 7. 講者調光與瘦臉（look）

講者畫面的調光（亮一點、膚色紅潤一點）和瘦臉是選用的，**預設關閉**（`shared/template/kit/look.json` 兩個都是 0），使用者在構圖台（停點 ②）或剪輯台「講者」開，或用說的；規則與限制看 `shared/style.md`「講者畫面」。

| 誰做 | 什麼時候 | 做什麼 |
|---|---|---|
| build | 每次重新編碼底片 | 套調光的 LUT（`kit/look/jianying-smart.cube`，強度 `color`）。不用另外跑 |
| `look.mjs run` | 剪乾淨之後、構圖之前；`rough.mp4` 換過或 `slim`、`beauty` 改過之後 | 偵測每一格的臉（`work/face-landmarks.json`）→ 做瘦臉底片 `work/rough-look.mp4` → 對照圖 `work/look-preview.jpg` |
| build | `slim` 或 `beauty` > 0 | 用 `work/rough-look.mp4` 當底片；不是最新的就 ✖ 停下來，請你先跑 `look.mjs run` |

指令（完整說明：`node shared/template/tools/look.mjs --help`）：

- 看狀態與下一步：`node shared/template/tools/look.mjs status --project projects/<專案>`（只讀，不寫任何檔；「→ 下一步」下面那一行就是要跑的指令）
- 偵測＋瘦臉：`node shared/template/tools/look.mjs run --project projects/<專案>`；預估超過 2 分鐘加 `--background`，再用 `status` 看進度
- 只重畫對照圖：`node shared/template/tools/look.mjs preview --project projects/<專案>`
- 檢查臉部偵測的檔案：`node shared/template/tools/look.mjs ensure`

plan.json 的寫法（使用者要求才寫）：

| 使用者說 | 寫 |
|---|---|
| 要調光、瘦臉 | `"look": { "color": 0.8, "slim": 0.6 }`（改完跑 `look.mjs run`） |
| 只要調光 | `"look": { "color": 0.8 }` |
| 只要瘦臉 | `"look": { "slim": 0.6 }`（改完跑 `look.mjs run`） |
| 要美顏（磨皮、提亮、淡化黑眼圈） | `look` 加 `"beauty": 0.5`（0–1；改完跑 `look.mjs run`） |
| 調光淡一點 | `"look": { "color": 0.5, "slim": <原本的值> }` |
| 瘦一點／不要那麼瘦 | `"look": { "color": <原本的值>, "slim": 0.8 }`／`0.3`（改完跑 `look.mjs run`） |
| 都不要（kit 預設被改成開的時候） | `"look": false` |

- 自動略過瘦臉（只調光）：臉寬 < 60 px（畫面裡的臉太小）、抽樣 12 格都沒偵測到臉（確定有講者就加 `--force`）、偵測率 < 80 %、找不到臉部偵測的檔案或 Chrome。build 會印 ⚠ 和原因，不用處理。
- 側臉時瘦臉自動減半、偵測不到的格自動淡掉，不會一格有一格沒有。
- 對照圖的位移 ⚠（95 % 的格超過臉寬 6.5 %：p95 位移 ÷ 臉寬，用 slim 0.6／0.8／1.05 校準）表示太強，脖子與領口可能被拉彎：把 `slim` 調低。
