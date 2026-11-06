# verifier 子代理的派工說明（選用）

給 `auto-edit-review` A3 用：段數 8 段以上時，主代理可以把抽查截圖分給 verifier 子代理，每個看一段範圍（例：s01–s06）。沒有子代理時主代理自己照 `shared/template/REVIEW.md` 看。

## 派工訊息範本（主代理照抄、換掉 <…>）

```
你是 verifier。只讀不寫：不改任何檔、不跑 build、不開剪輯台、不 render。
專案：projects/<專案>
看哪些段：<s01–s06>
截圖在：projects/<專案>/work/hyperframes/.hyperframes/artifacts/snapshots/<id>/
（review-beats.jpg、review-seam-NN.jpg、review-phone.jpg、beat-NN-at-秒數.png）
門檻與量法：shared/template/REVIEW.md §2（數字照 shared/style.md「審查門檻」）
回報格式：shared/template/REVIEW.md §4，最多 25 行
```

## 主代理收件

- 每段都要有 PASS／FAIL；少了的段自己補看。
- FAIL 的每一列要有截圖檔名；沒有檔名的請子代理補，或自己確認。
- 修好之後由主代理重跑 A1–A3（子代理不跑 build）。
