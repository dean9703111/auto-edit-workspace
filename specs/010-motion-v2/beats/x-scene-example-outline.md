# x-scene-example-outline 分鏡（拍型 S 示意；011 第二棒 T113b）

來源：ep2 seg13「本集大綱」（`esim_backup/hyperframes/動畫點位表.md` 163–171 行、`seg13-本集大綱/index.html`）。ep2 是三張橫向部分卡（序號＋標題＋一排圖示 chip）、灰色骨架條先佔位；v2 改成四個插圖元件一站一站進、站和站之間描線，最後一站換狀態。和 ep2 不一樣的地方：

- 不先放灰色骨架條：有底的容器不空著先出現（ep2 hyperframes-overlay pitfalls.md 149–153），每站講到才彈出。
- 圖示 chip 換成插圖元件（手機腳架、筆電、雲端、螢幕），一部分一個主角；字只剩標籤（≤ 10 字）。
- 「一次次迭代」從版本膠囊 v1 → v2 → v3 改成最後一站的螢幕換狀態（app → check），一拍一件事。

#### 動畫分鏡 x-scene-example-outline

| 拍 | 講到（綁句） | 畫面上出現什麼 | 動態（設計系統語彙） | 焦點 | 音效拍點 | 插圖元件（狀態） | 位置 |
|---|---|---|---|---|---|---|---|
| 0 | 段起點 `#201` | 主卡＋標題「本集大綱」 | 開場（依前段）；＋0.5 逐字上浮（標題） | 標題 | — | — | panelTop |
| 1 | `#202@實際操作` | 站 1：手機腳架＋「實際操作」 | 彈出（站 1）；＋0.14 逐字上浮（標籤）；＋0.6 聚焦（站 1）；漂浮 | 站 1 | tick | `phoneTripod`（portrait, rec） | panelTop｜row 1／4 |
| 2 | `#203@安裝` | 站 2：筆電＋「安裝工具」；線 1 | 彈出（站 2）；＋0.14 逐字上浮（標籤）；＋0.7 描線（線 1）；＋0.6 聚焦（站 2） | 站 2 | tick | `laptop`（app） | panelTop｜row 2／4 |
| 3 | `#204@網路` | 站 3：雲端＋「網路設定」；線 2 | 彈出（站 3）；＋0.14 逐字上浮（標籤）；＋0.7 描線（線 2）；＋0.6 聚焦（站 3） | 站 3 | tick | `cloud`（down） | panelTop｜row 3／4 |
| 4 | `#205@AI` | 站 4：螢幕＋「AI 開發」；線 3 | 彈出（站 4）；＋0.14 逐字上浮（標籤）；＋0.7 描線（線 3）；＋0.6 聚焦（站 4） | 站 4 | tick | `monitor`（app） | panelTop｜row 4／4 |
| 5 | `#206@迭代` | 站 4 螢幕從 app 變打勾 | 淡出（app）；淡入（打勾）；漣漪（站 4）；聚焦（站 4） | 站 4 | ding | `monitor`（check） | 同站 4 |
| 收 | 最後一拍＋2.0 | 全部（完成態停到段尾） | 回均衡 | 整體 | — | — | — |

#### 插圖清單 x-scene-example-outline

| 元件 | 來源 | 怎麼來 |
|---|---|---|
| phoneTripod（portrait, rec） | 畫廊 | `data-illus="phoneTripod" data-orient="portrait" data-screen="rec"`（70×180） |
| laptop（app） | 畫廊 | `data-illus="laptop" data-screen="app"`（194×132） |
| cloud（down） | 畫廊 | `data-illus="cloud" data-arrow="down"`（176×120） |
| monitor（app → check） | 畫廊 | `data-illus="monitor" data-screen="app"`（180×150） |
