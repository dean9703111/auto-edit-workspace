# MediaPipe Tasks Vision 1.2.0＋Face Landmarker、Pose Landmarker 模型

講者瘦臉、美顏用的臉部偵測，和瘦小腹用的姿勢偵測（`shared/template/tools/look.mjs` → `tools/lib/landmarks.mjs`，在 HyperFrames 的 chrome-headless-shell 裡用 CPU 跑）。檔案都是原封不動的官方檔，大小與 sha256 在 `manifest.json`；授權 Apache-2.0（`LICENSE`、`NOTICE.md`）。

| 檔案 | 用在 |
|---|---|
| `vision_bundle.mjs`、`wasm/` | 程式庫（臉部、姿勢共用） |
| `face_landmarker.task` | 瘦臉、美顏（`look.slim`、`look.beauty`） |
| `pose_landmarker_lite.task` | 瘦小腹（`look.belly`）：只有開了瘦小腹才會載入；沒開的人少了這個檔也不受影響（`manifest.json` 裡標 `"for": "belly"`）。2026-11-15 作者同意下載（「我希望有可以瘦小腹的功能」），5,777,746 B，來源 `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task` |

檢查：`node shared/template/tools/look.mjs ensure`（5 個檔都驗；壞了或缺檔：`git checkout -- shared/template/vendor/mediapipe`，或 `look.mjs ensure --download`）。
