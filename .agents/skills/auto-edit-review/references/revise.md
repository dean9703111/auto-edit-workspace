# 改版（流程 D）

使用者指名一段要重新設計、更完善、換個動畫時照這份做。沒指名段（「動畫都更細節一點」）先列出動畫段、每段一句可以改的方向，問要改哪幾段，可以一次 `--seg s08,s12`。

**重新設計要回到內容，不是換一支模板**：想清楚這段要傳達什麼，再想畫面（`.agents/skills/auto-edit-motion/references/design-build.md`）。使用者想要的是更貼合內容的動畫。

## 1. 開提案 → 停點 ③

```
node shared/template/tools/versions.mjs begin --project projects/<專案> --seg <段> --say "使用者原話"
node shared/template/tools/versions.mjs new --project projects/<專案> --seg <段> --note "「使用者原話」"
```

工具先把現在的樣子存成 v<舊>（含 預覽.mp4），再開 `work/versions/<段>/v<N>/分鏡.md`。改那份分鏡.md：「這版要改什麼」寫 1–5 條（和 v<舊> 差在哪、為什麼，先看 v<舊>/預覽.mp4）；「## 分鏡」改那一節（動畫分鏡表頭照抄 BEATS.md §1、動態只用 §2 語彙表的名稱）。記 `status.mjs --mark "③ 分鏡表（<段> v<N>）" --state 待回覆`，最後一行照抄工具印的停點行。

## 2. 使用者說「可以」→ 做動畫

```
node shared/template/tools/versions.mjs accept --project projects/<專案> --seg <段> --say "使用者原話"
```

記 ③ 通過，分鏡寫回 `work/storyboard.md`。內容設計動畫：派設計師照 `.agents/skills/auto-edit-motion/references/design-build.md`做（`x-design-<段>.html` 已經有就接著改，要全新設計就清空畫面重做）；這段原本是模板、要改成內容設計：plan.json 那段拿掉 `template`、`slots`，加 `"design": true`。模板動畫：改 plan.json 的 `slots`。字卡段：照分鏡改 plan.json 那段。使用者要改分鏡的拍：改那份分鏡.md、重貼停點 ③，不要 accept。

## 3. 做完 → 停點 ④

```
node shared/template/tools/versions.mjs finish --project projects/<專案> --preview
```

`--preview` 會 render 這段、出 `比較-v<舊>-v<N>.mp4`（左舊右新）。回覆附上比較影片路徑和「這版要改什麼」那幾條。

常見錯誤：`✖ … 還和 v<舊> 一模一樣` → 動畫還沒照新分鏡做；`✖ … 還是範本那一行` → 回第 1 步寫「這版要改什麼」，給使用者看過再 accept。
