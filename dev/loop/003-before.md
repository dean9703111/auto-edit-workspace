專案：/private/tmp/claude-501/-Users-lindingyuan-Downloads-workspace-auto-edit-workspace/6d54b3e1-59e6-4062-be1d-9ed5f77ee092/scratchpad/w003/proj
量 4 段（--only x01,x02,x03,x04）；HyperFrames runtime 0.8.221
x01：沒有 P.at 綁句，完成態停留不檢查（照 R7.3 用 P.at 綁句才會檢查）
x02：沒有 P.at 綁句，完成態停留不檢查（照 R7.3 用 P.at 綁句才會檢查）
x03：沒有 P.at 綁句，完成態停留不檢查（照 R7.3 用 P.at 綁句才會檢查）
x04：沒有 P.at 綁句，完成態停留不檢查（照 R7.3 用 P.at 綁句才會檢查）
⚠ [x01 custom x-process.html] 0:04.90、0:07.90、0:08.25、0:10.90、0:14.00、0:14.90 內距不足：#xproc-n2 裡的文字 左 42、右 42、上 5、下 9px（字級 52px：左右要 ≥ 24px、上下要 ≥ 15px） → 高度加到 ≥ 224px（整數），或縮短文字；不要縮字級（R8 #6）
⚠ [x01 custom x-process.html] 0:04.90、0:07.90、0:08.25、0:10.90、0:14.00、0:14.90 內距不足：#xproc-n3 裡的文字 左 16、右 16、上 5、下 9px（字級 52px：左右要 ≥ 24px、上下要 ≥ 15px） → 寬度加到 ≥ 264px、高度加到 ≥ 224px（整數），或縮短文字；不要縮字級（R8 #6）
⚠ [x01 custom x-process.html] 0:01.50 同一秒新元素太多：0:01.50–0:02.50 出現 4 個（#xproc-card、#xproc-n2、#xproc-n3、#xproc-n4；上限 2 個） → 錯開到每 0.5 秒 1 個（stagger: 0.5），或各自綁到講到它的那句（P.at）；同一張卡裡的東西跟著卡一起出現就好，不用各自進場
⚠ [x02 custom x-metaphor.html] 0:18.23、0:19.55、0:21.05、0:22.55、0:23.00、0:24.60、0:27.63、0:28.90 內距不足：#xmeta-boxL 裡的文字 左 46、右 46、上 3、下 7px（字級 52px：左右要 ≥ 24px、上下要 ≥ 15px） → 高度加到 ≥ 240px（整數），或縮短文字；不要縮字級（R8 #6）
⚠ [x02 custom x-metaphor.html] 0:18.23、0:19.55、0:21.05、0:22.55、0:23.00、0:24.60、0:27.63、0:28.90 內距不足：#xmeta-boxR 裡的文字 左 117、右 117、上 3、下 7px（字級 52px：左右要 ≥ 24px、上下要 ≥ 15px） → 高度加到 ≥ 240px（整數），或縮短文字；不要縮字級（R8 #6）
⚠ [x03 custom x-before-after.html] 0:34.80 內距不足：#xba-chips .xba-chip「逐句剪」 裡的文字 左 28、右 32、上 9、下 10px（字級 52px：左右要 ≥ 24px、上下要 ≥ 15px） → 高度加到 ≥ 108px（整數），或縮短文字；不要縮字級（R8 #6）
⚠ [x03 custom x-before-after.html] 0:34.80 內距不足：#xba-chips .xba-chip「反覆預覽」 裡的文字 左 28、右 32、上 9、下 10px（字級 52px：左右要 ≥ 24px、上下要 ≥ 15px） → 高度加到 ≥ 108px（整數），或縮短文字；不要縮字級（R8 #6）
⚠ [x03 custom x-before-after.html] 0:34.80 內距不足：#xba-chips .xba-chip「等渲染」 裡的文字 左 28、右 32、上 9、下 10px（字級 52px：左右要 ≥ 24px、上下要 ≥ 15px） → 高度加到 ≥ 108px（整數），或縮短文字；不要縮字級（R8 #6）
⚠ [x03 custom x-before-after.html] 0:34.80、0:37.50、0:39.15、0:43.90 垂直不平衡：內容 y 150–630，上留白 30px、下留白 240px（內容區 y 120–870，差 210px，超過 40px） → 整組往下移 105px（每個頂層元素的 top 都 +105）
⚠ [x03 custom x-before-after.html] 0:39.15、0:43.90 內距不足：#xba-save 裡的文字 左 28、右 36、上 12、下 13px（字級 52px：左右要 ≥ 24px、上下要 ≥ 15px） → 高度加到 ≥ 102px（整數），或縮短文字；不要縮字級（R8 #6）
⚠ [x03 custom x-before-after.html] 段長不符：compositions/x-before-after.html 寫 data-duration 10、const D 10，--check 報告的段長是 14s → 把結尾改成 P.end()（不帶參數，長度自動等於段長）並刪掉 const D；或把 data-duration 與 const D 都改成 14
⚠ [x03 custom x-before-after.html] 0:31.10 同一秒新元素太多：0:31.10–0:32.10 出現 4 個（#xba-lab1、#xba-ico1、#xba-n1、#xba-track；上限 2 個） → 錯開到每 0.5 秒 1 個（stagger: 0.5），或各自綁到講到它的那句（P.at）；同一張卡裡的東西跟著卡一起出現就好，不用各自進場
⚠ [x03 custom x-before-after.html] 0:31.20 間隔太短：#xba-lab1 和 #xba-ico1 只差 0.10s 出現（< 0.12s） → 沒有句子可綁時逐條錯開 ≥ 0.15s，或用同一個時間一起出現；最好各自綁講到它的那句（P.at）
⚠ [x03 custom x-before-after.html] 0:31.30 間隔太短：#xba-ico1 和 #xba-n1 只差 0.10s 出現（< 0.12s） → 沒有句子可綁時逐條錯開 ≥ 0.15s，或用同一個時間一起出現；最好各自綁講到它的那句（P.at）
⚠ [x03 custom x-before-after.html] 0:31.40 間隔太短：#xba-n1 和 #xba-track 只差 0.10s 出現（< 0.12s） → 沒有句子可綁時逐條錯開 ≥ 0.15s，或用同一個時間一起出現；最好各自綁講到它的那句（P.at）
⚠ [x04 custom x-numbers.html] 0:49.30、0:50.00、0:52.90、0:53.90 垂直不平衡：內容 y 150–778，上留白 30px、下留白 92px（內容區 y 120–870，差 62px，超過 40px） → 整組往下移 31px（每個頂層元素的 top 都 +31）

id｜情境｜版型｜量測時間｜結果
x01｜custom x-process.html｜fullscreen｜0:01.25 靜止（1 個在動畫中，不判）、0:04.90 靜止、0:07.90 靜止、0:08.25 中點、0:10.90 靜止、0:14.00 靜止、0:14.90 完成態｜⚠ 3
x02｜custom x-metaphor.html｜fullscreen｜0:16.75 靜止（1 個在動畫中，不判）、0:18.23 靜止、0:19.55 靜止、0:21.05 靜止、0:22.55 靜止、0:23.00 中點、0:24.60 靜止、0:27.63 靜止、0:28.90 完成態｜⚠ 2
x03｜custom x-before-after.html｜fullscreen｜0:30.80 靜止（3 個在動畫中，不判）、0:34.80 靜止、0:37.50 中點（4 個在動畫中，不判）、0:39.15 靜止、0:43.90 完成態｜⚠ 10
x04｜custom x-numbers.html｜fullscreen｜0:45.80 靜止（4 個在動畫中，不判）、0:49.30 靜止、0:50.00 中點、0:52.90 靜止、0:53.90 完成態｜⚠ 1

通過：4 段，16 個提醒（⚠）。audit 量的是幾何，最後仍以 snapshot 看圖為準。
看畫面：cd /private/tmp/claude-501/-Users-lindingyuan-Downloads-workspace-auto-edit-workspace/6d54b3e1-59e6-4062-be1d-9ed5f77ee092/scratchpad/w003/proj/work/hyperframes && npx hyperframes snapshot --at 4.9,7.9,8.25,10.9,14,14.9,18.225,19.55,21.05,22.55,23,24.6 --no-end -o ../../成片/驗收截圖
（1.343s）
