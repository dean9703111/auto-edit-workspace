# 改版（流程 D）

使用者指名一段要重新設計、更完善、換個動畫時照這份做。沒指名段（「動畫都更細節一點」）先列出動畫段、每段一句可以改的方向，問要改哪幾段，可以一次 `--seg s08,s12`。

**重新設計要回到內容，不是換一支模板**：想清楚這段要傳達什麼，再想畫面（`.agents/skills/auto-edit-motion/references/design.md`）。使用者想要的是更貼合內容的動畫。

## 1. 開提案 → 停點 ③

```
node shared/template/tools/versions.mjs new --project projects/<專案> --seg <段> --note "使用者原話"
```

沒有開著的回饋輪會自己開一輪。工具先把現在的樣子存成 v<舊>（不 render；audit 拼圖比動畫新就附成 `v<舊>/預覽.jpg`），再開 `work/versions/<段>/v<N>/分鏡.md`、記停點 ③（<段> v<N>）待回覆，最後印停點那兩行。改那份分鏡.md：「這版要改什麼」寫 1–5 條（和 v<舊> 差在哪、為什麼；有 `v<舊>/預覽.jpg` 先看）；「## 分鏡」改那一節（動畫分鏡表頭照抄 BEATS.md §1、動態只用 §2 語彙表的名稱）。回覆最後兩行照抄工具印的停點那兩行。

## 2. 使用者說「可以」→ 做動畫

```
node shared/template/tools/versions.mjs accept --project projects/<專案> --seg <段> --said "使用者原話"
```

記 ③ 通過；內容設計段、手改模板段的拍寫進 `work/designs/<段>.md`，模板段照提案改 slots（finish 會比對）。使用者要改分鏡的拍：改那份分鏡.md、重貼停點 ③，不要 accept。

- 內容設計動畫（已經是 `"design": true`）：派設計師照 `.agents/skills/auto-edit-motion/references/design.md` 改 `x-design-<段>.html`。「這版要改什麼」有換主角、換場景、換版面其中一項，才清空重做（先 `build.mjs --design-canvas <段> --reset` 換回空白畫布）；其他（加站、改時間、換插圖、改字）都接著用 edit 改，不要整份重寫。
- 這段原本是模板、要改成內容設計：跑 `node shared/template/tools/build.mjs --project projects/<專案> --to-design <段>`（換成內容設計動畫、補 brief、build 一次做完），派工照抄它「→ 派工：」下面那一行（設計師照 design.md 寫鏡位腳本、接著做動畫，不用等確認）。
- 模板動畫：改 plan.json 的 `slots`。字卡段：照分鏡改 plan.json 那段。

## 3. 做完 → 停點 ④

```
node shared/template/tools/versions.mjs finish --project projects/<專案>
```

不 render：`finish` 量改到的段、把 audit 拼圖存成 `v<N>/預覽.jpg`、印完成影片預覽網址（瀏覽器即時播放），最後印回報段。照貼，再加那張拼圖和「這版要改什麼」那幾條。

要比較影片（`比較-v<舊>-v<N>.mp4`，左舊右新）照 `references/feedback-round.md` 第 1 節。

常見錯誤：`✖ … 還和 v<舊> 一模一樣` → 動畫還沒照新分鏡做；`✖ … 還是範本那一行` → 回第 1 步寫「這版要改什麼」，給使用者看過再 accept。
