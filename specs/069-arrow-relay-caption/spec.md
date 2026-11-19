# 069 箭頭固定動畫＋接力、tape 截圖下方一行字

## 作者原話（minimax-ep1 修改單 r6）

- m0201：「我希望箭頭是跟著我說的系統呈現，現在都是指向 Windows／另外盡量同一側，可以用往左下的方式箭頭，剪頭可以設計成固定使用的動畫，可以更有藝術感，外圍有輕微紅光，可以參考剪映來做設計」
- m0202：「這種縮放會有位移的狀態，箭頭會更好」；m0204：「這邊不需要那麼多的運鏡，使用箭頭還比較合適」
- s0109：「我覺得這個部落格當成截圖，然後下方放網址就好，還是用有背景的版本」

## 定案

- 箭頭外觀固定：三角形＋由粗漸細的箭身（半寬 5.5 → 2.5）一個多邊形，警示紅、圓角，外圍兩層 drop-shadow 紅光（`kit/media.css` `.marrow`）。碰撞取樣不變。
- 箭頭動畫固定：沿箭身從 40 px 外、0.7 倍彈進來（0.4 s，`back.out(2)`，原點在箭尖）→ 到位後往目標輕戳 8 px（單程 0.4 s，只放完整來回）→ until 前 0.3 s 淡出。
- 接力：下一支的 `at` 貼著上一支的 `until`（差 ≤ 0.05 s）＝同一支箭頭換目標。同方向同長度整支平移過去（0.4 s），到了換成下一支；不同就上一支 0.25 s 淡出、下一支照常彈進來。接力的每一支 ≥ 0.6 s、整串 ≥ 2.2 s；不接力的仍是每支 ≥ 2.2 s。（我替作者定的：「Mac」「Windows」兩個詞只差 0.63 秒，原本一支 2.2 秒的下限跟不上講話）
- tape 圖片的 `caption`：截圖區下緣讓出 120 px，下方一顆說明卡樣式的全圓角膠囊（預設 link 圖示），對截圖水平置中、離 18 px；`at` 不寫＝膠帶貼完（段起點＋0.6）浮上來。說明卡、箭頭要避開它。

## 改了哪些檔

- `shared/template/tools/lib/media.mjs`：`ARROW` 常數、`arrowShape` 的 `body`、`mediaArrows`（接力判斷、R7／R8）、箭頭 DOM 與時間軸；`MEDIA_KEYS` 加 `caption`、`CAPTION` 常數、`checkMediaSeg` 欄位檢查、tape 版面讓出下緣、`mediaCaption`、膠囊 DOM 與浮上來的時間軸；欄位說明表
- `shared/template/kit/media.css`：`.marrow` 紅光與多邊形、`.mcapw`、`.mcard--cap`
- `shared/template/USAGE.md` 5.5 箭頭列、媒體欄位表 `caption` 列；`shared/style.md` tape 那一條；`specs/contracts/media.md` §2.6、§2.6b、R4／R7／R8
- `shared/template/tools/editor/server/rounds.mjs`：退回紀錄和工作用同一個時間（068 測試偶爾差 1 ms）
- 測試：`dev/tests/media.test.mjs`（箭頭 DOM／時間軸、接力、caption）
