# 改版（流程 D）

使用者指名一段要重新設計、更完善、換個動畫時照這份做。沒指名段（「動畫都更細節一點」）先列出動畫段、每段一句可以改的方向，問要改哪幾段，可以一次 `--seg s08,s12`。

**重新設計要回到內容，不是換一支模板**：想清楚這段要傳達什麼，再想畫面（`.agents/skills/auto-edit-motion/references/design-build.md`）。使用者想要的是更貼合內容的動畫。

## 1. 開提案 → 停點 ③

```
node shared/template/tools/versions.mjs begin --project projects/<專案> --seg <段> --say "使用者原話"
node shared/template/tools/versions.mjs new --project projects/<專案> --seg <段> --note "「使用者原話」"
```

工具先把現在的樣子存成 v<舊>（不 render；audit 拼圖比動畫新就附成 `v<舊>/預覽.jpg`），再開 `work/versions/<段>/v<N>/分鏡.md`。改那份分鏡.md：「這版要改什麼」寫 1–5 條（和 v<舊> 差在哪、為什麼；有 `v<舊>/預覽.jpg` 先看）；「## 分鏡」改那一節（動畫分鏡表頭照抄 BEATS.md §1、動態只用 §2 語彙表的名稱）。記 `status.mjs --mark "③ 分鏡表（<段> v<N>）" --state 待回覆`，最後一行照抄工具印的停點行。

## 2. 使用者說「可以」→ 做動畫

```
node shared/template/tools/versions.mjs accept --project projects/<專案> --seg <段> --say "使用者原話"
```

記 ③ 通過，分鏡寫回 `work/storyboard.md`。使用者要改分鏡的拍：改那份分鏡.md、重貼停點 ③，不要 accept。

- 內容設計動畫（已經是 `"design": true`）：派設計師照 `.agents/skills/auto-edit-motion/references/design-build.md` 改 `x-design-<段>.html`。「這版要改什麼」有換主角、換場景、換版面其中一項，才清空重做（第一次 write 只寫骨架，照 design-build.md 的做法，之後只用 edit）；其他（加站、改時間、換插圖、改字）都接著用 edit 改，不要整份重寫。
- 這段原本是模板、要改成內容設計：plan.json 那段拿掉 `template`、`slots`，加 `"design": true`，跑 `node shared/template/tools/build.mjs --project projects/<專案> --check`，確認 `work/briefs/<段>.md` 有了再派工。派工照 `--apply-storyboard` 印的那一句：先照 `.agents/skills/auto-edit-motion/references/design-script.md` 寫鏡位腳本（不用等確認），寫完接著照 `design-build.md` 做動畫。
- 模板動畫：改 plan.json 的 `slots`。字卡段：照分鏡改 plan.json 那段。

## 3. 做完 → 停點 ④

```
node shared/template/tools/versions.mjs finish --project projects/<專案>
```

不 render：`finish` 量改到的段、把 audit 拼圖存成 `v<N>/預覽.jpg`、印完成影片預覽網址（瀏覽器即時播放）。回覆附上那張拼圖和「這版要改什麼」那幾條。

比較影片（`比較-v<舊>-v<N>.mp4`，左舊右新）要兩版都有預覽：使用者開始改版時就說要比較，第 1 步的 `begin` 和這一步的 `finish` 都加 `--preview`；改完才要比較，先跟他說「舊版沒有預覽影片，兩版各要 render 一次（一段約 25 秒）」，他說好再照 `references/feedback-round.md` 第 1 節的四行做。

常見錯誤：`✖ … 還和 v<舊> 一模一樣` → 動畫還沒照新分鏡做；`✖ … 還是範本那一行` → 回第 1 步寫「這版要改什麼」，給使用者看過再 accept。
