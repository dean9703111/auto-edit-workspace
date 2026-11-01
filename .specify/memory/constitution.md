# auto-edit-workspace 憲法

這份憲法管的是「怎麼改這個工作區」。剪片時 AI 讀的是 `AGENTS.md`，不是這份。

## 核心原則

### I. AGENTS.md 是規則、Skill 是 SOP、工具做計算
- 資料夾權限、規則 1–7、停點總表只寫在 `AGENTS.md`。Skill（`.agents/skills/auto-edit-*/SKILL.md`）只放「這一階段的指令、完成判準、停點、退路」，不複製規則數字。
- 凡是要算的（時間、字數、座標、剪接點、截圖時刻、音量）都交給 `shared/template/tools/` 的 Node 工具；Skill 只寫「跑哪個指令、看哪一行、哪個數字算過關」。工具還沒有時，Skill 給公式加一個算好的例題。

### II. 零依賴、跨平台
- 剪片流程只需要 Node 22＋、ffmpeg／ffprobe、HyperFrames（`npx hyperframes`，版本釘在根目錄 `package.json`）、whisper-cli、auto-editor。**不裝 Python**（`dev/` 例外，剪片時不讀不跑）。
- 新增的執行期資產要寫明大小與來源，放 `shared/template/vendor/<名稱>/`，並在 `NOTICE.md` 記授權；目前唯一核准的是 MediaPipe face landmarker（約 18 MB，作者 2026-10-31 同意）。
- 每個指令都要能在 Mac（zsh）與 Windows（PowerShell）跑：路徑用 `path.join`、不用 `~`、帶逗號或冒號的參數加引號、`npx` 在 Windows 要 `shell: true`。

### III. 弱模型優先（Sonnet／GPT-6／MiniMax M3 也要能跑）
給 AI 讀的文字（AGENTS.md、Skill、USAGE、工具印出的訊息）一律：
1. 決策用表格，條件欄只放可觀察的事實（檔案在不在、工具印了哪一行、秒數、字數）。
2. 數字量化、單位寫死；還沒定案的標「建議初值」。
3. 每一步三件事：可直接複製的指令（工作區根目錄、`--project projects/<專案>`）、完成判準、常見錯誤→修法。
4. 工具的錯誤訊息自帶修法（「→ 改 …」），退路表照工具原文寫，第二次失敗就停下來回報。
5. 每階段有工具呼叫預算與回報行數上限（階段回報 ≤ 15 行、子代理 ≤ 25 行）。
6. 不依賴特定平台功能（Plan 模式、子代理、思考深度）；用到子代理的段落標「選用」並寫沒有時怎麼做。
7. 規則衝突優先序：使用者當下的話 > AGENTS.md > `shared/style.md` > `USAGE.md` > `USAGE-reference.md` > Skill；派工時「派工訊息 > Skill」。

### IV. 單一真相
- 同一個數字只在一個地方定義（優先序同上）。`USAGE*.md` 與 Skill 引用時寫「照 style.md」而不是抄數字。
- `dev/tests/docs.test.mjs` 檢查：Skill 與 USAGE 出現的門檻數字都能在 `AGENTS.md`／`style.md` 找到；工具 `--help` 列的指令都在文件裡出現過；文件裡的指令都存在。

### V. 停點固定、流程自己保證
- 停點只有六個：① 剪輯清單 ② 構圖倍率 ③ 分鏡表 ④ Studio 預覽 ⑤ 剪輯台 ⑥ 背景預覽。回覆最後一行固定寫 `⏸ 停點 ③ 分鏡表｜請看：work/storyboard.md｜請回：「可以」或要改的地方`。
- 使用者說「不用停」「跑到停點 ④」才連跑。停點由流程與回覆格式保證，不靠 Plan 模式。

### VI. 可驗證交付
- 每個工具都有 `dev/tests/*.test.mjs`；每條規則都寫「怎麼量」；交付附 ffprobe 輸出、截圖或工具報告，不只說「完成了」。
- 情境動畫過 R7.6 三關（`--check` 0 ✖、`audit.mjs` 0 ✖、亂序 snapshot 完成態一致）才算完成。

### VII. 授權乾淨
- `shared/sfx/` 只放 CC0 或 AI 生成並以 CC0 釋出的音效；剪映、CapCut 素材庫與其快取檔不進 repo，也不在文件裡教人複製。
- 例外（2026-11-02 作者決定）：片尾配樂可以是 CC BY（目前只有 `bgm-cylinder-five`），預設不配；出處寫進 `sources.json`、`NOTICE.md` 與 `kit/sfx.json` 的 `credit`，用到的影片要在說明欄標示。
- 第三方素材來源寫在 `shared/sfx/sources.json` 與 `NOTICE.md`。

### VIII. 不擴張範圍
- 只做 spec 寫到的；單次使用的程式不抽象化；不加沒人要的設定項。
- 改既有檔案只動跟任務有關的行，不順手整理旁邊的程式與註解。

## 檢查迴圈（Loop）
每一輪實作結束都跑同一個迴圈，直到全部過關才交付：
1. `node --test dev/tests/*.test.mjs` 全綠。
2. `node dev/check-all.mjs`：文件一致性、`build.mjs --check` 範例 0 ✖、build、`audit.mjs` 0 ✖、`qc.mjs final` 0 ✖。
3. 弱模型試跑：用較弱的模型（Sonnet 或更弱）只讀 AGENTS.md 與 Skill，從「剪乾淨」跑到停點 ③，記錄卡住的地方（`dev/loop/round-N.md`）。
4. 審查員（只讀）對照 spec 的驗收條件逐項打勾，P0 問題清零。
5. 有問題就修、回到 1。每輪結果寫進 `dev/loop/round-N.md`。

## 治理
- 改規則先改 `specs/<編號>/spec.md`，再改程式與文件；spec 的驗收條件就是迴圈第 4 步的檢查表。
- 共用介面（`--check --json`、`kit/sfx.json`、media 欄位、cue 注入、look hook、CLI 清單）先寫 `specs/contracts/*.md`，其他工作線照契約做，不口頭約定。
- 檔案所有權照 `specs/README.md` 的表；不是自己的檔案不改，要改就在自己的 spec 寫「請 <編號> 加 …」。

**Version**: 1.0.0 | **Ratified**: 2026-10-31 | **Last Amended**: 2026-10-31
