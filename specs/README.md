# specs/：2026-10 升級計畫（作者維護用，剪片時不要讀）

目標：把剪映 esim_ep2／PPA試看 的技法搬進工作區，做成弱模型也能跑的 Skill 與工具。分析報告在作者本機的 session scratchpad（`analysis/00-phase1-report.md`），本資料夾是依它寫的規格。

## 工作線

| 編號 | 名稱 | 範圍 | 來源（分析報告的項目） |
|---|---|---|---|
| 001 | skills-docs | 9 個 Skill、AGENTS.md／PROMPTS.md／USAGE／style.md 改寫、SITUATIONS.md、REVIEW.md、install-skills、文件一致性測試 | 02 §5、§7；G04、G06、G10（進度與回饋紀錄）、G22、G24、G25 |
| 002 | pipeline-timing | 章節空檔、無畫面空白偵測、rhythm 設定、cue 注入、PiP 飛入／三層淡出、旁白段擦入、章節定格墊片、`media.mjs cutpoints／ng-snap／srt-split`、`status.mjs`、`caps.mjs`、hyperframes 版本釘住、結尾配樂機制 | 01 P0-1/3/4/5/6、P1-1/3/5；G01、G02（build 端）、G03、G05、G07（caps）、G10（status）、G16、G17、G20 |
| 003 | motion-audit | `SceneMotion` 加 `P.at`／`P.focus`／`P.type`、4 支範例改 `P.at`、新增 5 支情境動畫、audit 補 6 條規則＋節奏 ⚠ | G02（SM 端）、G08、G11、G12 |
| 004 | media-annotations-qc | media 段 `callouts`／`spot`／`steps`／`arrows`／紅框 `path`、`qc.mjs observe`／`storyboard`、`brand.mjs bg`（HTML 路線） | G09、G13、G14、G21、G27、G07（生圖路線） |
| 005 | sfx | 三批音效替代（B＋C）、新事件（click／sparkle／shine／thunder／chapter／bgm）、`maxPerVideo`、附加音效不受 3 秒規則、音量政策、剪接點交叉淡化評估 | 03 全部；G15、G18 |
| 006 | look | 調光 LUT bake 進底片、瘦臉（Chrome 內 MediaPipe＋Node 變形）、`look.mjs`、`kit/look.json`、剪輯台「講者」面板、`look.mjs preview` 驗證 | 04 全部 |
| 007 | quality-loop | `dev/check-all.mjs`、`dev/loop/` 迴圈紀錄與弱模型試跑腳本 | 憲法「檢查迴圈」 |

每條工作線的資料夾：`specs/<編號>-<名稱>/spec.md`、`plan.md`、`tasks.md`、`docs.md`（要併進文件的原文，交 001 整合）；共用介面在 `specs/contracts/`。

## 檔案所有權（只有擁有者能改；要別人改的寫進自己 spec 的「請 <編號> 加」）

| 擁有者 | 檔案 |
|---|---|
| 001 | `.agents/skills/**`、`setup/install-skills.mjs`、`setup/*.md`、`setup/check.sh`、`setup/check.ps1`、`AGENTS.md`、`PROMPTS.md`、`README.md`、`shared/style.md`、`shared/template/USAGE.md`、`shared/template/USAGE-reference.md`、`shared/template/EDITOR.md`、`shared/template/SITUATIONS.md`（新）、`shared/template/REVIEW.md`（新）、`dev/README.md`、`dev/tests/docs.test.mjs`（新） |
| 002 | `package.json`（新，根目錄）、`shared/template/tools/build.mjs`、`tools/media.mjs`、`tools/status.mjs`（新）、`tools/caps.mjs`（新）、`tools/lib/plan.mjs`、`lib/assemble.mjs`、`lib/edit.mjs`、`lib/time.mjs`、`lib/srt.mjs`、`lib/captions.mjs`、`lib/main.mjs`、`lib/scenes.mjs`、`lib/mustache.mjs`、`tools/project/hyperframes.json`、`shared/template/scenes/**`、`shared/template/kit/scene.css`、`kit/captions.css`、`kit/theme.css`、`dev/tests/{plan,build,edit,timing,project,scenes,speakerbox}.test.mjs`、`dev/tests/{media-cli,status,caps}.test.mjs`（新） |
| 003 | `shared/template/kit/scene-motion.js`、`shared/template/custom/**`、`shared/template/index.html`、`shared/template/fx/**`、`tools/audit.mjs`、`tools/lib/audit-rules.mjs`、`lib/audit-page.mjs`、`lib/audit-browser.mjs`、`dev/tests/{motion,audit,examples,icons}.test.mjs` |
| 004 | `tools/lib/media.mjs`、`shared/template/kit/media.css`、`kit/media.js`、`tools/qc.mjs`、`tools/brand.mjs`、`tools/lib/raster.mjs`、`dev/tests/{media,qc,brand}.test.mjs` |
| 005 | `shared/sfx/**`、`shared/template/kit/sfx.json`、`tools/lib/audio.mjs`、`dev/tools/make-sfx.mjs`（新，取代 `make_sfx.py`）、`dev/tests/{audio,sfx}.test.mjs`、`NOTICE.md` 的音效段 |
| 006 | `tools/look.mjs`（新）、`tools/lib/look.mjs`（新）、`lib/landmarks.mjs`（新）、`lib/ff.mjs`、`shared/template/kit/look.json`（新）、`kit/look/*.cube`（新）、`shared/template/vendor/mediapipe/**`（新）、`tools/editor.mjs`、`tools/editor/**`、`dev/tests/{editor,editor-subtitles,look}.test.mjs`、`NOTICE.md` 的 MediaPipe 段 |
| 007 | `dev/check-all.mjs`（新）、`dev/loop/**`（新） |

`dev/tests/helpers.mjs` 共用：只能加函式，不能改既有函式的簽名。

## 共用契約（先寫契約再實作）

| 檔案 | 由誰寫 | 誰照它做 | 內容 |
|---|---|---|---|
| `contracts/cli-00N.md`（001 第二輪合併成 `cli.md`） | 每條工作線各寫自己的 | 001（文件與 Skill） | 每個指令：完整指令、參數、印出的關鍵行（原文）、退出碼、錯誤訊息格式 |
| `contracts/check-json.md` | 002 | 004、006（剪輯台）、001 | `build.mjs --check --json` 的欄位，含 `uncovered[]`、`chapters[]`、`sfxCount{}` |
| `contracts/cues.md` | 002 | 003 | build 注入 custom 子合成的 `window.__cues` 格式；`P.at('#21')`、`P.at('#21@詞', +0.2)`、`P.end()` 的語意 |
| `contracts/sfx.md` | 005 | 002（plan.mjs 的音效政策）、001 | `kit/sfx.json` 新欄位（`event`、`additive`、`maxPerVideo`、`targetDb`）、事件名、章節／全畫面幕拆開、結尾配樂欄位 |
| `contracts/media.md` | 004 | 002（plan.mjs 呼叫驗證）、001 | media 段新欄位 schema、`validateMedia()` 匯出、`--list` 的 media 表要加的列 |
| `contracts/look.md` | 006 | 002（build 呼叫）、005（audioKey）、001 | `ensureLook({ projectDir, plan, log })` 回傳底片路徑與快取鍵；`plan.look` schema；`kit/look.json` |
| `contracts/stop-points.md` | 001 | 全部 | 六個停點的固定回覆格式、「不用停」的條件 |
| `contracts/plan-fields.md` | 002 | 003、004、005、006、001 | plan.json 第一層新欄位（`rhythm`、`look`、`outro`）與段落新欄位的最終清單 |

## 整合順序

1. 六條工作線同時寫 spec.md → plan.md → tasks.md → 自己的 contracts。
2. 主代理核對契約互相一致（尤其 cues、sfx、media、look 四份），有衝突改 spec 不改口頭。
3. 六條同時實作，各自跑自己的 `dev/tests`。
4. 主代理整合：全部測試、範例專案 `--check`→build→audit→snapshot→qc，修衝突。
5. 跑憲法的「檢查迴圈」直到過關；每輪寫 `dev/loop/round-N.md`。

## 已定案的規則（取代分析報告裡的「待決定」）

| 題目 | 定案 |
|---|---|
| 條列進場 | 每條綁一句（`#N`）逐條進場；沒有句子可綁時每條相隔 ≥ 0.15 s 錯開；絕不整組同時出現 |
| 透明卡外層進出場 | HyperFrames 內做進出場（既有 IN 0.5／OUT 0.4），外層再保險淡入 0.4／淡出 0.4（PPA 做法） |
| 完成態停留 | 新訊息完成態 ≥ 1.2 s，段尾最後一幕 ≥ 1.5 s，中間步驟可 0.6 s |
| 剪接點聲音 | 先量 RMS（dev 測試），有凹洞才改 0.1 s 交叉淡化 |
| 音效 | B＋C 三批；新事件 click／sparkle／shine／thunder／chapter／bgm；音量跟剪映但上限人聲下 3 dB；合成音效 CC0 釋出 |
| 瘦臉調光 | 做；偵測資產下載到 `shared/template/vendor/mediapipe/`；預設 color 0.8、slim 0.6；完成影片 bake 進底片；設定在 `kit/look.json`＋`plan.look`；大眼、磨皮下一階段 |
| hyperframes 版本 | 根目錄 `package.json` 釘 0.8.221，setup 加 `npm install` |
| 跨集學習（G23） | 這次不做 |
| spec-kit | `.specify/`、`specs/` 進 git；AGENTS.md 資料夾表加一列「作者維護用，剪片時不要讀」 |

## 主代理裁決（2026-10-31，回應各工作線的提問）

| 題目 | 裁決 |
|---|---|
| 契約檔名 | 各寫 `specs/contracts/cli-00N.md`；001 第二輪合併成 `cli.md` |
| `.agents/skills/` 在 AGENTS.md 資料夾表的權限 | 「只能讀，照著做」（不是「不要讀」），MiniMax 沒載入專案 Skill 時 AI 仍可直接讀原始檔 |
| AGENTS.md 要不要變薄 | 不低於「沒有 Skill 也跑得動」：每階段保留關鍵指令與停點；Skill 放逐步 SOP、檢查表、退路 |
| `docs.test` 的數字來源 | AGENTS.md、style.md、USAGE.md、USAGE-reference.md（R 節是版面門檻的真相）、工具 `--help`；Skill 不得出現這些地方沒有的門檻數字 |
| REVIEW.md、SITUATIONS.md 的優先序 | 與 USAGE-reference.md 同級 |
| `dev/tests/install-skills.test.mjs` | 001 擁有 |
| W11（key 8–14 字的 ⚠） | 002 的 plan.mjs，P2 |
| 「兩個全畫面段之間露臉 ≥ 3 s」 | 不加（照 style.md 連續節奏） |
| 誰寫 `work/rough.srt` | `npx hyperframes transcribe work/rough.mp4 -d work …` 產生 → AI 照講稿校正文字 → `media.mjs srt-split` → `media.mjs snap-srt`（只跑一次） |
| click 每支上限（005） | 不設上限；只在畫面有游標下壓的地方寫 `clicks`，密度由 2 顆／分的 ⚠ 提醒 |
| 主音效每分鐘 > 2 顆 | 只 ⚠ 不自動刪 |
| 結尾配樂與打雷的來源（005） | 第三批先用合成版（repo 保持 CC0 可重現）；OpenGameArt 候選寫進 `sources.json` 的「待作者瀏覽器確認」欄，確認後再換檔 |
| impact 換成咚咚、success 單一檔 | impact 直接取代（檔名不變，5 張 fx 卡一起換）；success 用「正确」式上行琶音（C6–D6–G6–C7） |
| `dev/tools/make_sfx.py` | 凍結加防呆（8 顆不變的音效沿用）；新增與改動的音效用 `dev/tools/make-sfx.mjs`（Node 零依賴） |
| 標註可讀時間（004） | 一律 1.2 s，`quick` 0.8 s |
| STEP 膠囊位置與編號 | 左上；編號全片自動遞增，不提供手動 `n` |
| `marks[].path[].dur` | 接受（選填） |
| 給了 `side`／`from` 但放不下 | ✖ 並附建議值（不自動改） |
| 連續 media 段之間的疊化（P1-6） | 002 做：相鄰且無空檔的 media 段之間疊化 0.47 s |
| 標註預設音效 | 不配；游標下壓用 005 的 `clicks` |
| `ch` 留空區數字 | 先用 004 估的（x 160–1760、y 260–870）標「建議初值」 |
| `media.test.mjs` 拆分 | 004 留 lib 測試；002 把 CLI 測試搬到 `media-cli.test.mjs` |
| `qc.mjs observe` 的時機 | 只在剪好看第 8 步（有 mp4 之後） |
| MediaPipe 資產（006） | 放進 `shared/template/vendor/mediapipe/`（準備進 git，觀眾離線可用）；`look.mjs ensure --download` 留作修復。`.task` 的授權（Apache-2.0）在交付報告提醒作者 push 前到 model card 原文確認一次 |
| rough-look.mp4 過期時 build 的行為（D4） | 停下來 ✖ 並印 `look.mjs run` 指令，不自動跑重步驟 |
| rough-look 只做瘦臉、調光在 build 編碼時套（D1） | 接受 |
| 4K 先縮到長邊 2560 再變形（D2） | 接受 |
| 停點 ② 附 `work/look-preview.jpg` | 要 |
| 瘦臉位移 ⚠ 門檻 | 改成臉寬 5 %（slim ≈ 1.05 才會 ⚠）；滑桿上限 1.2 不變 |
| 「換風格」可改 `kit/look.json` | 可以（AGENTS.md 規則 1 例外清單加這個檔） |
| PiP 飛入的實作（002） | 先用 transform（scale＋translate）；迴圈第一輪用 snapshot 在 +0.35 s 看有沒有糊，有才退回補間 left／top／width／height |
| 章節置中與定格墊片是否加開關 | 不加開關，舊專案一併生效 |
| 只有聲音未蓋住的 ⚠ 門檻 | ✖ 仍是 > 1.0 s；⚠ 改成 ≥ 0.1 s（舊專案多出 ⚠ 可接受） |
| custom 根元素 `data-duration` | 以 host 長度與 `window.__cues.segs[id].D` 為準；若 HyperFrames 會用根元素值截斷，`--check` 改報 ⚠「data-duration 比段長短 → 改成 ≥ D」 |
| 擦入／擦出 | 只在只有聲音的區間內做 |
| `package-lock.json` | 要進 git（由 `npm install` 產生，不加進 .gitignore） |
| `ng-snap` 的靜音來源 | 用 auto-editor 的判定（不重用 snap-srt 的包絡） |
| 講者閃現門檻 | 1.0 s（同一個空檔只報一次） |
| 結尾淡出預設 | 1.85 s（01 §2.8 實測；005 的 2.0 s 改成 1.85） |
| check-json 兩套時間基準 | 接受：`start`／`end`＝rough.mp4 秒、`out.*`＝完成影片秒；006 的剪輯台「只有聲音未蓋住」讀 `voiceUncovered[]`，「沒有畫面」讀 `uncovered[]` |
| `tools/lib/custom-preview.mjs`（003） | 003 擁有；002 在 build.mjs 的 `runGallery` 加一行呼叫 `buildCustomPreview`（003 在回報給出 import 行） |
| audit 新規則的等級 | 第一輪只有三個 ✖（未定位頂層、標題壓內容、綁句失敗），其餘版面與節奏規則 ⚠ |
| stagger 門檻 vs 條列間隔 | audit ⚠ 門檻 < 0.12 s（TR v3）；文件建議值 0.15 s（兩個數字角色不同，文件要寫明） |
| PiP 禁入區 | 以程式為準 x 1424–1888／y 581–951；audit.mjs 檔頭的 1344／617 是筆誤，003 修 |
| `P.morph` 預設 ease `back.out` | 改成不過衝的 ease（建議 `power2.inOut`），受影響的範例一起改；列為 003 的任務 |
| 節奏檢查的 highlight／swap 類別 | 接受；8 px／80 %／0.15 s／50 % 標「建議初值」，實測後調 |

## 派工政策（2026-10-31 使用者定）

- 需要判斷與設計的工作（動態設計、規格、審查、整合）→ Claude Opus 子代理。
- 簡單、規格明確、單一檔案範圍、有驗收指令的工作 → Codex（`codex exec --sandbox workspace-write --skip-git-repo-check -C <工作區> "<任務>"`）或 MiniMax（純文字用 `mmx text chat --model MiniMax-M3`）；**一次只跑一個**，跑完驗收再派下一個。
- 派給 Codex／MiniMax 的任務說明要含：改哪個檔、規則原文、訊息原文、測試檔與指令、不可做的事（不 commit、不改其他檔）。
