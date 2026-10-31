# MediaPipe Tasks Vision 1.2.0＋Face Landmarker 模型

講者瘦臉用的臉部偵測（`shared/template/tools/look.mjs` → `tools/lib/landmarks.mjs`，在 HyperFrames 的 chrome-headless-shell 裡用 CPU 跑）。檔案都是原封不動的官方檔，大小與 sha256 在 `manifest.json`；授權 Apache-2.0（`LICENSE`、`NOTICE.md`）。

檢查：`node shared/template/tools/look.mjs ensure`（壞了或缺檔：`git checkout -- shared/template/vendor/mediapipe`，或 `look.mjs ensure --download`）。
