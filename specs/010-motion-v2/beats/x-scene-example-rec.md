# x-scene-example-rec 分鏡（拍型 S 示意；011 第二棒 T113b）

來源：ep2 seg03「試錄確認」（`esim_backup/hyperframes/動畫點位表.md` 108–113 行、`seg03-試錄確認/index.html`）。ep2 是兩個面板（開拍前／開拍後）、Take 膠囊、腳印、大手機飛出、兩列打勾；v2 改成一個場景、一次一個焦點：人和桌子是場景骨架，手機進場後換兩次狀態（錄影 → 播放），人走過去，最後一個結果徽章。和 ep2 不一樣的地方：

- 不分兩個面板：v2「同一時間只有一個焦點」，兩個面板會讓左邊一直壓暗；開拍前／開拍後改用手機螢幕的狀態（錄影 → 播放）表達。
- 腳印、取景框、大手機飛出拿掉：一拍只做一件事（走過去＝游標移動，播放＝換狀態）。
- 兩列「畫面 ✓／聲音 ✓」併成「聲音」波形＋一個「符合需求」結果，標籤 ≤ 10 字。

#### 動畫分鏡 x-scene-example-rec

| 拍 | 講到（綁句） | 畫面上出現什麼 | 動態（設計系統語彙） | 焦點 | 音效拍點 | 插圖元件（狀態） | 位置 |
|---|---|---|---|---|---|---|---|
| 0 | 段起點 `#191` | 主卡＋標題「開拍前先試錄」 | 開場（依前段）；＋0.5 逐字上浮（標題） | 標題 | — | — | panelTop |
| 1 | 段起點＋1.0 | 場景骨架：桌子、人 | 錯拍彈出（桌子、人） | 均衡 | — | `desk`、`personBust`（a） | panelTop｜row 1／3（人＋桌子 col） |
| 2 | `#192@腳架` | 手機腳架＋標籤「手機」 | 彈出（手機）；＋0.14 逐字上浮（標籤）；＋0.6 聚焦（手機）；漂浮 | 手機 | tick | `phoneTripod`（landscape, blank） | panelTop｜row 2／3 |
| 3 | `#193@試錄` | 手機螢幕變錄影；錄影膠囊 00:00 → 00:05 | 淡入（錄影）；漣漪（手機）；彈出（錄影膠囊）；＋0.2 數字滾動（時間）；聚焦（手機） | 手機 | tick | `phoneTripod`（rec）、`recPill` | 同手機；panelTop｜row 3／3＞col 1／3 |
| 4 | `#194@走到` | 人走到手機旁邊 | 游標移動（人，1 秒）；聚焦（人） | 人 | tick | `personBust`（a） | 走到手機左邊（move 到 xscr-phone left） |
| 5 | `#195@播放` | 手機螢幕從錄影變播放 | 淡出（錄影）；淡入（播放）；漣漪（手機）；聚焦（手機） | 手機 | tick | `phoneTripod`（play） | 同手機 |
| 6 | `#196@聲音` | 聲音波形＋標籤「聲音」 | 彈出（波形）；＋0.14 逐字上浮（標籤）；＋0.6 聚焦（波形） | 波形 | tick | `waveform` | panelTop｜row 3／3＞col 2／3 |
| 7 | `#197@符合` | 結果徽章＋「符合需求」 | 彈出（徽章）；＋0.3 描圈打勾；＋0.6 聚焦（徽章） | 結果 | success | `badge`（check） | panelTop｜row 3／3＞col 3／3 |
| 收 | 最後一拍＋2.0 | 全部（完成態停到段尾） | 回均衡 | 整體 | — | — | — |

#### 插圖清單 x-scene-example-rec

| 元件 | 來源 | 怎麼來 |
|---|---|---|
| phoneTripod（landscape；blank → rec → play） | 畫廊 | `data-illus="phoneTripod" data-orient="landscape" data-screen="blank"` |
| personBust（a） | 畫廊 | `data-illus="personBust" data-tone="a"` |
| desk | 畫廊 | `data-illus="desk"` |
| recPill | 畫廊 | `data-illus="recPill"`（時間 `.il-time` 用數字滾動） |
| waveform | 畫廊 | `data-illus="waveform" data-bars="20" data-seed="3" data-color="yellow"` |
| badge（check） | 畫廊 | `data-illus="badge" data-kind="check"` |
