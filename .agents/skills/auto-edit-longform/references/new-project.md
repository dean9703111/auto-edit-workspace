# 開新專案

使用者說「開一個新專案 <名稱>」時：

1. 建立 `projects/<名稱>/`，以及 `assets/camera`、`assets/voice`、`assets/screen`、`assets/images` 四個空資料夾。
2. 告訴使用者各放什麼：有畫面的講解放 `assets/camera/`；只有聲音的旁白放 `assets/voice/`（畫面會配螢幕錄影或圖片）；螢幕錄影放 `assets/screen/`（邊錄邊講的也放這裡，會自動接進主軌）；截圖、照片放 `assets/images/`；講稿存成 `projects/<名稱>/講稿.md`。只有開頭結尾露臉的片：開頭結尾的錄影放 `assets/camera/`、中間的旁白放 `assets/voice/`，檔名照順序編號（`01-開場.mp4`、`02-中段.m4a`、`03-結語.mp4`；順序不對，剪輯清單會照講稿提示），中間沒有講者的地方自動用全螢幕。
3. 等使用者放好素材，不要自己開始剪。最後一行：`→ 下一步：素材放好後說「剪乾淨」`。
