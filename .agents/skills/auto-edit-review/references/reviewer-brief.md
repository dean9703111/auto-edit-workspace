# 逐格抽查：子代理的派工（選用）

平常看 `build.mjs --review` 的完成態拼圖就夠了（`shared/template/REVIEW.md` §3）。只有使用者要求逐格看、已經跑過 `snapshot --review` 時才用：段數 8 段以上可以把截圖分給子代理，每個看一段範圍。

## 派工訊息（主代理照抄、換掉 <…>）

```
你只看圖、回報問題：只寫下面那一份報告，不改別的檔、不跑 build、不開剪輯台、不 render。
專案：projects/<專案>
看哪些段：<s01–s06>
截圖在：projects/<專案>/work/hyperframes/.hyperframes/artifacts/snapshots/<id>/
（review-beats.jpg、review-seam-NN.jpg、review-phone.jpg、beat-NN-at-秒數.png）
門檻：shared/template/REVIEW.md §2；只列 FAIL，格式照 §4，寫到 projects/<專案>/work/reports/review-<s01-s06>.md
回覆只回一行：<s01–s06> FAIL <N>｜work/reports/review-<s01-s06>.md
```

收件：讀每個子代理寫的 `work/reports/review-<段範圍>.md`，FAIL 的每一列要有截圖檔名。修好之後由主代理重跑（子代理不跑 build）：停點 ④ 之前跑 `build.mjs --review`；回饋輪（已經 `begin`）跑 `versions.mjs finish`。
