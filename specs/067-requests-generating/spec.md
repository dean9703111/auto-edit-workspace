# 067 修改單：生成中的段不再複製

## 作者原話

「另外如果新動畫在「生成中」，上面複製給 AI(X 段待改)應該要把標示移除，否則資訊會被重複複製到吧？」

## 問題

1. 剪輯台的「待改」＝沒改完的段，生成中的也算在裡面：「複製給 AI（N 段待改）」把 AI 正在改的段又送一次。
2. AI 改到一半時使用者又複製了新的修改單：狀態跟著修改單的版本走，舊那一版的段「生成中」不見、掉回待改；`versions.mjs finish` 印 ⚠「重新複製過」、不回報，那幾段永遠標不上已改完。

## 定案

- 剪輯台：生成中的段不算待改、不複製、不算進分頁上的數字；另列「生成中（N）」一區。改了它的標籤或描述就回到待改（使用者又改了，要再送）。生成失敗的算回待改。
- 伺服器（`editor/server/requests.mjs`）：每段狀態記著它屬於哪一版修改單（`revision`）。新修改單沒有、還在生成中的段帶著走（`carried`），回報時用它開輪那一版的 `revision` 收得到；新修改單的段照舊只收目前這一版。`requestsInfo` 多回傳 `carried`。
- `versions.mjs finish`：這輪的段被帶著走的照舊回報已改完／失敗；被使用者又寫進新修改單的段不回報，印 ⚠ 列出是哪幾段、停下來問。

## 改了哪些檔

- `shared/template/tools/editor/server/requests.mjs`、`shared/template/tools/versions.mjs`（reportRequests）、`shared/template/tools/editor/app.js`（rqExported、rqGenerating、rqPending、修改單清單與按鈕說明）
- `shared/template/EDITOR.md` 第 5 點
- 測試：`dev/tests/032-w2a.test.mjs`（p3 改成新行為、加 p4：生成中又複製新修改單）、`dev/tests/editor.test.mjs`（新修改單帶著走 x02）、`dev/tests/editor-requests-ui.test.mjs`（按鈕只算 1 段、生成中一區、再複製不含生成中的段）
