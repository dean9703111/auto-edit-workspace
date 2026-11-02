# 情境動畫子代理的回報格式

給 `auto-edit-motion` 步驟 7 用。最多 25 行（AGENTS.md 規則 8）。主代理收件時會用 `ls -l` 與 `grep` 確認檔案真的寫進去了（AGENTS.md「子代理分工」）。

## 格式

```
段落：<段 id>（<情境，例：過程>）
檔案：projects/<專案>/work/hyperframes/compositions/x-<名稱>.html
ls -l：<貼 ls -l 那一行>
從哪支範例改：shared/template/custom/<範例>.html
動畫分鏡：<N> 拍都照做了（沒照做的拍與理由；沒有寫「無」）
綁句：<P.at 清單，以 @詞 為主，例：#18@剪輯清單、#19@逐字稿、#20@初剪>；畫了游標按下時加「clicks：#N@詞」請主代理寫進 plan.json
build --check：<這段那一列原文>
audit --only <段 id>：<✖ N、⚠ N；每個 ⚠ 一行原文>
留著的 ⚠ 與理由：<每個一行；沒有寫「無」>
我沒有改的東西：plan.json、rough.srt、storyboard.md、shared/
```

## 例

```
段落：x01（過程）
檔案：projects/example/work/hyperframes/compositions/x-process.html
ls -l：-rw-r--r--  1 me  staff  6120 11  2 14:31 x-process.html
從哪支範例改：shared/template/custom/x-process.html
動畫分鏡：6 拍都照做了（無）
綁句：#18、#18@逐字稿、#20
build --check：x01 custom 0:40.00–0:54.50（14.5s）綁句 3 個（#18、#18@逐字稿、#20）
audit --only x01：✖ 0、⚠ 1
  ⚠ [x01] .x-process-note 離右下角小窗 12px → 刻意的，小窗在這段是關的
留著的 ⚠ 與理由：上面那一個，這段 layout 是 fullscreen、pip 關閉
我沒有改的東西：plan.json、rough.srt、storyboard.md、shared/
```
