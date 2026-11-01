# 013 參考片技法（第一批 A–E）

來源：作者 2026-11-01 給的參考片 `cooljerrett-DfKQ_TCjxT3-1.mp4`（Future Brian〈Is editing "the old way" gone forever?〉的中文重製，全片程式渲染，154 秒 7 章）。分析報告在作者本機的 session scratchpad（`cj/報告.md`）。作者回「好啊，執行看看」＝照報告的建議做第一批，主色維持橘色。看過試跑後作者決定：**字幕螢光（C）不要**，其他保留（2026-11-01）。

## 做了什麼

| # | 技法（參考片） | 落點 | 檔案 |
|---|---|---|---|
| A | 蓋章當結論語彙（片中 8 次：過時、已送出、已取消、千真萬確…） | 新原語 `P.stamp(sel, at, {rot, from, dur, on, dim})`、`.sc-stamp`（紅框、墨點遮罩）；語彙表 47 個（加「蓋章」）；BEATS.md C、D 拍型加選用的「判」列；SITUATIONS.md §3「判決句」列 | `kit/scene-motion.js`、`kit/scene.css`、`BEATS.md`、`SITUATIONS.md`、`tools/lib/audit-beats.mjs`、`specs/010-motion-v2/design-system.md` §14.1 |
| B | 手寫波浪劃線（舊建議逐條劃掉） | `P.strike(sel, at, { wave: true })`：svg 波浪、clip-path 由左揭開；style.md「動畫視覺」：人的建議、舊習慣用波浪，數字價格用直線 | `kit/scene-motion.js`、`kit/scene.css`、`shared/style.md` |
| D | 開場三拍、前後呼應、判決句 | SITUATIONS.md 新增 §6「整集結構」；storyboard Skill 步驟 5 判定表後整集看一次；AGENTS.md 剪好看第 3 步一句 | `SITUATIONS.md`、`.agents/skills/auto-edit-storyboard/SKILL.md`、`AGENTS.md` |
| E | 短片章節只換角標＋快速擦過 | 由 02 起頭的章（沒有 01）、起點露著講者、在片頭 1 秒後：章節起點自動掃過一次色帶（沿用色帶擦開那一對，0.62 秒） | `tools/lib/plan.mjs`（badge.sweep）、`tools/lib/main.mjs`、`shared/style.md`「節奏」、SITUATIONS.md §3 第一列 |

## 驗證

- `dev/tests/motion.test.mjs`：`P.stamp`、波浪劃線加進 v2 原語亂序 seek 逐像素測試（23/23）。
- `dev/tests/plan.test.mjs`：常駐角標測試加章節擦過（02 起頭的章掃、01 章不掃）。
- `dev/tests/audit.test.mjs`、`docs.test.mjs`：語彙 47 個、BEATS.md／design-system §14.1 逐列一致。
- 試跑：`projects/範例` 的複本（暫存區）s17 改波浪劃線＋蓋章「放棄」→ build、`audit --only s17`（0 ✖）、snapshot 看圖；章節擦過 4 處。

## 不做

- C 字幕關鍵詞螢光（plan.json `captionMarks`）：做完試跑後作者不要，程式、測試、文件已全部拿掉；字幕維持 style.md「字幕」的剪映樣式。

## 還沒做（等作者決定）

1. F 側欄版面 `layout: "rail"`（講者框約 67%、左側窄欄跑情境動畫、跨句累積）：先做一段原型。
2. 第三批新部件：`x-lanes` 雙泳道、收據外觀、多行終端機、揉掉、物件變形、小貼紙、ripple delete 轉場、網點主題、片尾自曝卡。
3. glitch／切片轉場要不要放寬 SITUATIONS.md §5。
