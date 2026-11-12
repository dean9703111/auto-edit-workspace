# 換背景：選路、生成、驗證、套用（`auto-edit-style` 步驟 2–4 的做法）

只有要換背景圖、做風格包時才讀。指令和完成判準在 SKILL.md 的步驟 2–4；這裡是每一步怎麼做、常見的狀況。每條生圖路線的指令在 `image-routing.md`，派工人照 `bg-worker.md`。

## 2. 背景：選路

把能力表貼給使用者。選路：在 R9.3 路由表找你這個模型那一列（MiniMax Code 是 MiniMax 系列、Claude Code 是 Claude 系列），從第一選擇往右找，第一個出現在 caps.mjs「可用的生圖路線」那一行裡的就用它（那一行的順序不是優先序）；寫一句選了哪條、為什麼。直式專案先沿用三張橫式背景（取中間），不用另做直式背景。

常見錯誤：想幫使用者安裝 codex／mmx 或登入 → 不要，沒裝不裝、沒登入不登入，直接走下一條路（AGENTS.md 規則 3、工具注意事項）；使用者也要換暗色背景（`bg-fs-dark.jpg`、`bg-side-dark.jpg`、`bg-ch-dark.jpg`）→ HTML 路線還不能做暗色，走 mmx（`references/image-routing.md` 第 3 節的暗色提示詞）或使用者的圖，亮、暗各三張一起過停點 ⑥；沒有 mmx 也沒有使用者的圖，亮色三張照常換，暗色沿用目前的，回報寫「暗色背景沒換，要 mmx 或你給圖」。

## 3. 生成到暫存資料夾、驗證、預覽

生圖很久，有能派子代理的工具就照 `references/bg-worker.md` 每張圖派一個工人，同一則回覆一次全部派出；全部回來後由你驗證、出預覽。沒有才自己一張一張做。下面的指令是工人（或你自己）照著跑的。

第 1 行是 HTML 路線（USAGE-reference.md R9.4；`--kind` 依序 `fs`、`side`、`ch` 各跑一次，三張都有才產生 `preview.jpg`）；其他路線照 references 的指令，再用 references 的 ffmpeg 指令產生 `zones-fs.jpg`、`preview.jpg`。`--out` 不能是 `shared/template/` 裡面。

常見錯誤：尺寸不對 → 用 references 第 1 節的 `scale…crop` 指令裁成對的尺寸。

## 4. ⑥ 同意後：存成風格包、套用，重跑 build

第 1 行把主色、外框、三張背景（暫存資料夾有 `bg-*-dark.jpg` 也一起）存進 `shared/template/styles/<名稱>/`；第 2 行換掉整個工作區（使用者只要這一集就跳過，改照步驟 7 寫 plan.json 的 `style`）。這兩行就是「同意後放進 shared/template/」，不要另外 cp 背景圖。包名：使用者有說就用；沒說用「<主色名>-<YYYYMMDD>」（例 `綠色-20261109`），回報寫出來。沒換主色就拿掉 `--color`。
`use` 停下來說「不屬於任何包」：這次跑過步驟 1，開工時 ● 在某一包（或開工時已經先存成 `原本-<YYYYMMDD>`），就加 `--force` 再跑一次 use（只蓋掉這次換主色的半成品）；其他情況先 `brand.mjs pack <新名稱>` 把目前的存起來再 use。

常見錯誤：使用者說「重做」→ 回步驟 3，只重派要重做的那張；同一條路重做 2 次還不行就換下一條路（R9.3）。
