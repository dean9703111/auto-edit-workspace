# 背景圖：每條路的指令

給 `auto-edit-style` 步驟 3 用。選哪條路照 `shared/template/USAGE-reference.md` R9.3；尺寸與留空區照 R9.2；HTML 路線的完整做法在 R9.4。這裡只放指令。

## 0. 暫存資料夾（每次換背景開一個新的）

```
node shared/template/tools/brand.mjs bg --tmp
```

記下它印的完整路徑。後面每條指令的 `$TMP` 都直接換成這個路徑再執行（每條指令是新的 shell，變數不會留著）。回報與停點 ⑥ 也寫這個完整路徑。所有輸出都先放這裡，使用者同意後照 `auto-edit-style` 步驟 4 存成風格包、套用，不要自己複製進 `shared/template/`。

## 1. 使用者給的圖（其他路線的成品也用這條轉）

```
node shared/template/tools/brand.mjs bg --image "<圖>" --kind fs --out "$TMP"
```

縮放到蓋滿、從中間裁成那一種的尺寸，存成 `$TMP/bg-<種類>.jpg`，另存 zones 圖、量留空區。三種（`fs`、`side`、`ch`）還缺哪幾種，它會印同一張圖接著裁的指令，照「→ 下一步」跑；三種齊了它印第 5 節那一條。暗色加 `--dark`（存成 `bg-<種類>-dark.jpg`）。

## 2. Codex（提示詞一定從 stdin 給；`-i` 會吃掉後面的字串）

```
Mac：cp shared/template/bg-fs.jpg "$TMP/ref.jpg"
Windows（PowerShell）：Copy-Item shared\template\bg-fs.jpg "$TMP\ref.jpg"
codex exec --skip-git-repo-check -C "$TMP" -s workspace-write -i "$TMP/ref.jpg" < "$TMP/prompt.md"
```

`prompt.md` 寫：主色色碼、三張的尺寸與檔名（`raw-fs.png`、`raw-side.png`、`raw-ch.png`）、每張要留空的區域（R9.2 原文照抄）。做完用第 1 節那一條轉成 `bg-<種類>.jpg`（`<圖>` 換成 `$TMP/raw-<種類>.png`，`--kind` 換成那一種）。派工人同時生成（`references/bg-worker.md`）時，每張一份 prompt、只寫自己那張，`-C` 和 prompt 都換成 `$TMP/<種類>`，參考圖仍用 `$TMP/ref.jpg`。PowerShell 沒有 `<`，改成 `Get-Content "$TMP\prompt.md" -Raw | codex exec --skip-git-repo-check -C "$TMP" -s workspace-write -i "$TMP\ref.jpg"`。

## 3. MiniMax CLI（`mmx`）

```
mmx image generate --prompt "<fs 的提示詞>" --width 1920 --height 1080 --n 3 --out-dir "$TMP/mmx" --out-prefix bg-fs --quiet
mmx image generate --prompt "<side 的提示詞>" --width 960 --height 1080 --n 3 --out-dir "$TMP/mmx" --out-prefix bg-side --quiet
mmx image generate --prompt "<ch 的提示詞>" --width 1920 --height 1080 --n 3 --out-dir "$TMP/mmx" --out-prefix bg-ch --quiet
```

每種各出 3 張，挑留空區最乾淨的一張，用第 1 節那一條轉成 `bg-<種類>.jpg`。三行互不相關，派工人同時跑（`references/bg-worker.md`）。

暗色版（plan.json `"theme": "dark"` 用的 `bg-<種類>-dark.jpg`；HTML 路線還不能做暗色，沒有 mmx 也沒有使用者的圖就沿用目前的暗色，回報寫「暗色背景沒換，要 mmx 或你給圖」）：fs 的提示詞照抄下面這段（`<主色色碼>` 換掉），side、ch 只換 `--width`、`--out-prefix`；轉檔時加 `--dark`。

```
mmx image generate --prompt "Dark premium tech presentation background, deep graphite black (#0C0E12) smooth matte surface, a soft diffuse warm (<主色色碼>) light bloom in the upper-right corner fading out, faint cool blue-gray haze in the lower-left corner, very fine film grain, subtle vignette, large calm empty area in the center and left, no objects, no text, no lines, no shapes, cinematic, 16:9" --width 1920 --height 1080 --seed 4242 --n 3 --out-dir "$TMP/mmx" --out-prefix bg-fs-dark --quiet
```

## 4. HTML／CSS／SVG → Chrome 截圖

每種版面寫一個 HTML（顏色用 `var(--brand)`、字型用 `var(--font-cjk)`；留空區用絕對定位避開），再截圖：

```
node shared/template/tools/brand.mjs bg --html "$TMP/bg-fs.html" --kind fs --out "$TMP"
node shared/template/tools/brand.mjs bg --html "$TMP/bg-side.html" --kind side --out "$TMP"
node shared/template/tools/brand.mjs bg --html "$TMP/bg-ch.html" --kind ch --out "$TMP"
```

它會寫 `bg-<種類>.jpg`、`zones-<種類>.jpg`，三張都有時寫 `preview.jpg`。`brand.mjs bg` 印 ✖ 時照那一行的 → 做（找不到 Chrome：`npx hyperframes browser ensure`）。

## 5. 驗證（每條路都一樣）

```
node shared/template/tools/brand.mjs bg --verify "$TMP"
```

驗三張（和 `-dark` 三張，有的話）的尺寸、重做 zones 圖、量留空區、產生並排預覽 `preview.jpg`（暗色三張齊了另出 `preview-dark.jpg`），最後印回報段和停點 ⑥ 那兩行（完整路徑），照抄給使用者。尺寸不對、少一張會 ✖：照那一行的 → 做。派工人做的一律由主代理跑這一節。

`zones-fs.jpg` 的紅框（全畫面主卡）、藍框（子母畫面）、黃框（字幕帶），`zones-side.jpg` 的紅框（側邊欄文字區）、`zones-ch.jpg` 的紅框（章名卡）裡都不能有裝飾（R9.2）；`--verify` 量到有裝飾會印 ⚠，照它的 → 做。
