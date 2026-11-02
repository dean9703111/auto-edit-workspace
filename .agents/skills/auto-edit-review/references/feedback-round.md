# 回饋輪 r<N>

給 `auto-edit-review` 流程 B 用。規則來源是 AGENTS.md「進度與回饋紀錄」；這裡放範本與判斷表。

## 1. 編號與備份

| 情況 | 這一輪的編號 |
|---|---|
| 有 `status.mjs`：印出 `下一輪回饋編號：r3` | r3 |
| `work/feedback/` 不存在 | r1（先建資料夾） |
| `work/feedback/` 有 `r1.md`、`r2.md` | r3（最大數字＋1） |

改 plan.json **之前**先備份，一輪一份，不覆蓋舊的：

```
Mac：cp projects/<專案>/work/hyperframes/plan.json projects/<專案>/work/hyperframes/plan.json.bak-r<N>
Windows（PowerShell）：Copy-Item projects\<專案>\work\hyperframes\plan.json projects\<專案>\work\hyperframes\plan.json.bak-r<N>
```

改到的每一段，改之前、build 之後各存一次版本（改之前那次和舊版一樣就不另存；改之後那次會出 `比較-v<舊>-v<新>.mp4`）：

```
node shared/template/tools/versions.mjs save --project projects/<專案> --seg <改到的段，逗號隔開>
```

要還原這一輪：把 `plan.json.bak-r<N>` 複製回 `plan.json`，再 build。只還原一段：`node shared/template/tools/versions.mjs use --project projects/<專案> --seg <段> --ver v<N>`（x 檔、svg 一起換回去）。

## 2. 規則還是個案

| 使用者說的話長這樣 | 分類 | 做法 |
|---|---|---|
| 指名一段、一張卡、一個時間，有具體改法（「s05 往左移」「1:20 那張字太多」） | 個案 | 只改那一段的 plan.json |
| 指名一段，只說要更好、沒說怎麼改（「s12 的動畫想更完善」「s12 重新設計」「換個動畫」） | 個案（改版） | 先出分鏡提案、停點 ③（SKILL.md 流程 D）；rN.md 的改法寫「改版 s12 v2」 |
| 「s12 用 v1」「退回上一版」 | 個案（退回） | SKILL.md 流程 E；rN.md 的改法寫「退回 v1」 |
| 「以後」「每次」「都」「全部的 X」 | 規則 | 這一集照做；在 rN.md「建議改規則」寫一條，**不改** `shared/`、AGENTS.md（AGENTS.md 規則 1） |
| 「這張卡」「我選的」 | 個案 | 讀 Studio 選取：`(cd projects/<專案>/work/hyperframes && npx hyperframes preview --context --json --context-fields selection)` |
| 分不出來 | 個案 | 照個案改，rN.md 註明「可能是規則，請確認」 |

## 3. `work/feedback/r<N>.md` 範本（四節，標題逐字）

```markdown
# 回饋 r<N>（YYYY-MM-DD HH:MM）

## 原話

「s05 的金句卡往左移，s09 字太多」

## 分類

| # | 原話節錄 | 規則／個案 | 改哪一段 | 改法 |
|---|---|---|---|---|
| 1 | s05 的金句卡往左移 | 個案 | s05 | css 往左 120px |
| 2 | s09 字太多 | 個案 | s09 | key 縮成 10 字 |

建議改規則：（沒有寫「無」）

## 改了哪幾段

- s05：`"css": { "left": "-120px" }`（v1 → v2，比較：work/versions/s05/比較-v1-v2.mp4）
- s09：key「…」→「…」（v1 → v2）

## 驗證

- build --check：✖ 0、⚠ 3
- snapshot --review：s05、s09 PASS（beat-05-at-41.2.png、beat-09-at-88.0.png）
```

## 4. 預算

每一項最多 10 次工具呼叫（AGENTS.md「階段預算」）。某一項超過就停下來，回報那一項卡在哪，其他項照做。
