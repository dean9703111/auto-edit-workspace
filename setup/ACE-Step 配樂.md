# ACE-Step 1.5（選用：生成配樂）

**這不是必裝的。** 只有使用者說要「生成配樂」、而且 `music.mjs gen` 印「不能生成配樂」時才做。不裝也能用 `node shared/template/tools/music.mjs add <聲音檔> --name <曲名>` 放自己的音樂。

## 開始前一定要先告訴使用者（照抄，數字不要改）

    生成配樂要在這台電腦裝 ACE-Step 1.5，會用到：
    - 磁碟空間約 14 GB（程式與 Python 環境約 4.5 GB、模型約 9.4 GB）
    - 第一次要下載模型，網路快的話約 20–30 分鐘
    - 一次生成 3 首 90 秒的候選約 3.5 分鐘（M1 Max、32 GB 記憶體實測，含啟動；其他機器不一定）
    可以裝在外接硬碟。要裝嗎？裝在哪裡？

使用者同意、講了位置才往下做。內建磁碟剩不到 20 GB 時，建議他裝在外接硬碟。

## 需要

- Mac（Apple 晶片）或有 NVIDIA 顯卡的電腦；`uv`（沒有就先 `curl -LsSf https://astral.sh/uv/install.sh | sh`）、`git`。
- 裝在 ExFAT 的外接硬碟會壞（git 和 Python 環境都會出錯）：Mac 上先在那顆硬碟建一個 APFS 映像檔，裝在映像檔裡。

## 步驟

A1　只有裝在 ExFAT 外接硬碟時做（`diskutil info /Volumes/<硬碟> | grep Personality` 印 ExFAT）：

    hdiutil create -size 80g -type SPARSE -fs APFS -volname ace-step /Volumes/<硬碟>/ace-step.sparseimage
    hdiutil attach /Volumes/<硬碟>/ace-step.sparseimage

  之後的 `<位置>` 就是 `/Volumes/ace-step`。映像檔是用多少佔多少，不會一開始就佔 80 GB。

A2　下載程式、建環境（`<位置>` 例：`~`、`/Volumes/ace-step`）：

    cd <位置> && git clone --depth 1 https://github.com/ACE-Step/ACE-Step-1.5.git
    cd <位置>/ACE-Step-1.5 && UV_CACHE_DIR=<位置>/.uv-cache uv sync

  驗證：最後幾行是一串 `+ 套件名==版本`，沒有 `error`。

A3　告訴工作區裝在哪（有映像檔就加 `--image`，生成前會自己掛上）：

    node shared/template/tools/music.mjs acestep <位置>/ACE-Step-1.5
    node shared/template/tools/music.mjs acestep /Volumes/ace-step/ACE-Step-1.5 --image /Volumes/<硬碟>/ace-step.sparseimage

  驗證：`node shared/template/tools/music.mjs status` 第一行是 `ACE-Step：裝在 …`。

A4　生成第一次（會下載模型，要等；工具會自己開服務、做完自己關）：

    node shared/template/tools/music.mjs gen --style 輕快科技 --n 1 --seconds 60

  驗證：印 `✓ 1 首候選`。模型下載完 `<位置>/ACE-Step-1.5/checkpoints/` 約 9.4 GB；看到它另外在下載 `acestep-5Hz-lm-4B` 就是沒有透過 `music.mjs` 啟動（工具會關掉用不到的語言模型），停掉、改用上面那一條。之後回到 `auto-edit-style` 的 `references/music.md` 步驟 B。

## 常見錯誤

| 症狀 | 做法 |
|---|---|
| `non-monotonic index`、`._pack-…` | 裝在 ExFAT 上了 → 做 A1，裝進映像檔 |
| `✖ ACE-Step 開不起來` | 看它印的紀錄檔最後幾行；多半是模型還沒下載完或網路斷了，再跑一次 A4 |
| `ACE-Step：沒有（… 不在（映像檔掛不上或外接硬碟沒接））` | 接上外接硬碟再跑 |
| 想移除 | 先問使用者；確認後刪掉 `<位置>/ACE-Step-1.5`、`<位置>/.uv-cache`（或整個映像檔），再跑 `music.mjs use none`。曲庫裡已經生成的曲子不受影響 |
