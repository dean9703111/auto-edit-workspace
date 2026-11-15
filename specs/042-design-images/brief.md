# 042 內容設計動畫可以放素材圖片

來源：作者 2026-11-15 看 PPA 主宣傳片與短影片1：「『出版過 7 本專業書籍…』這段話的畫面很卡，會不會書籍用圖片出現，然後教學網頁後面再進去，節奏比較順呢？」「『短影片1』書籍出現的部分，未必要全部都在上面，在畫面依序出現也不錯」。

## 現況（2026-11-15 盤點）

- 圖片只能走 media 段（整張鋪滿、一次一張），或模板的截圖欄位（036 的 `shot`：`x-recap`、`x-relay`、`x-slider`）。內容設計動畫（`"design": true`，設計師從空白畫布做）沒有放素材圖片的管道，`USAGE-reference.md` 還寫「不要手寫 `<img>`」。
- 所以「七本書封一本接一本出現在講者身邊」做不出來：短影片1 原本是七張圖在上半快切，一張不到 0.6 秒；主宣傳片是拿個人網頁錄影慢放捲動。
- 疊加段（`"layout": "overlay"`）根元素加 `data-matte="1"` 就會去背（037 順手做的），但沒寫進設計師文件，每次都要在派工訊息裡交代。

## 定案

| # | 題目 | 定案 | 理由 |
|---|---|---|---|
| 1 | 設計師怎麼寫 | 直接寫 `<img src="assets/images/<檔名>" alt="">`（`assets/screen/` 的圖片檔也可以），就是素材在專案裡的路徑 | 不用記雜湊檔名、不用多一個欄位；`work/media/index.md` 寫的就是這個路徑 |
| 2 | build 做什麼 | 掃每個內容設計段的檔（`compositions/x-design-<段>.html`），把用到的圖縮到 1920×1080 以內，放到 `work/hyperframes/` 底下同一個相對路徑。來源沒變不重做；不再用到的刪掉（清單 `assets/design-images.json`） | 子合成是掛進主合成的，相對路徑從 `work/hyperframes/` 算起；原圖常常是幾千 px 的書封，縮好才不拖慢算圖 |
| 3 | 查什麼 | 圖不在 ✖、不是圖片檔（例：`.mov`）✖，`--check` 也查 | 和截圖欄位同一套判斷（`isShotImage`） |
| 4 | 只管內容設計段 | 模板段照舊用截圖欄位；外部網址、`data:` 不管 | 模板的檔是工具產生的，手寫 `<img>` 會被覆寫 |
| 5 | 文件 | `design.md`「這個工作區的寫法」多兩條：素材圖片、疊加段去背（`data-matte="1"`、`data-layout-allow-overflow`） | 派工訊息回到工具印的那一行，不用再另外交代 |

沒做的：圖片不裁切、不去背、不調色；動圖（gif）不收；錄影照舊用 media 段。

## 做了什麼

- `shared/template/tools/lib/shots.mjs`：`designImages`、`prepareDesignImages`。`build.mjs`：查錯和備圖各接一行。
- `.agents/skills/auto-edit-motion/references/design.md`：兩條寫法。`shared/template/USAGE-reference.md`：「不要做」那一列補上例外。
- 測試：`dev/tests/shotcraft-more.test.mjs` 多一項（只掃 design 段、✖ 兩種、縮圖尺寸、沒變不重做、不用了刪掉）。

## 驗證

- `node --test dev/tests/shotcraft-more.test.mjs`：10 過。`npm run test:docs`：37 過。
- 真的專案：`projects/ppa-主宣傳片` 的 x0106、`projects/ppa-短影片1` 的 x0105（設計師照 `design.md` 做，派工訊息只有工具那一行）build 印「素材圖片 assets/images/… → assets/images/…」七行，截圖看過七張書封都在、清楚。
