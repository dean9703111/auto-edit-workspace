# 背景圖：每條路的指令

給 `auto-edit-style` 步驟 3 用。選哪條路照 `shared/template/USAGE-reference.md` R9.3；尺寸與留空區照 R9.2；HTML 路線的完整做法在 R9.4。這裡只放指令。

## 0. 暫存資料夾（每次換背景開一個新的）

```
Mac：TMP="$(mktemp -d)"; echo "$TMP"
Windows（PowerShell）：$TMP = (New-Item -ItemType Directory -Path "$env:TEMP\bg-$(Get-Random)").FullName; $TMP
```

回報與停點 ⑤ 寫這個資料夾的完整路徑。所有輸出都先放這裡，使用者同意後才複製進 `shared/template/`。

## 1. 使用者給的圖

```
ffmpeg -v error -y -i "<使用者的圖>" -vf "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080" -q:v 2 "$TMP/bg-fs.jpg"
ffmpeg -v error -y -i "<使用者的圖>" -vf "scale=960:1080:force_original_aspect_ratio=increase,crop=960:1080" -q:v 2 "$TMP/bg-side.jpg"
ffmpeg -v error -y -i "<使用者的圖>" -vf "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080" -q:v 2 "$TMP/bg-ch.jpg"
```

Windows 把 `"$TMP/…"` 寫成 `"$TMP\…"`，其餘相同。其他路線產生的圖尺寸不對時，也用這三行裁。

## 2. Codex（提示詞一定從 stdin 給；`-i` 會吃掉後面的字串）

```
Mac：cp shared/template/bg-fs.jpg "$TMP/ref.jpg"
Windows（PowerShell）：Copy-Item shared\template\bg-fs.jpg "$TMP\ref.jpg"
codex exec --skip-git-repo-check -C "$TMP" -s workspace-write -i "$TMP/ref.jpg" < "$TMP/prompt.md"
```

`prompt.md` 寫：主色色碼、三張的尺寸與檔名（`raw-fs.png`、`raw-side.png`、`raw-ch.png`）、每張要留空的區域（R9.2 原文照抄）。PowerShell 沒有 `<`，改成 `Get-Content "$TMP\prompt.md" -Raw | codex exec --skip-git-repo-check -C "$TMP" -s workspace-write -i "$TMP\ref.jpg"`。

## 3. MiniMax CLI（`mmx`）

```
mmx image generate --prompt "<fs 的提示詞>" --width 1920 --height 1080 --n 3 --out-dir "$TMP/mmx" --out-prefix bg-fs --quiet
mmx image generate --prompt "<side 的提示詞>" --width 960 --height 1080 --n 3 --out-dir "$TMP/mmx" --out-prefix bg-side --quiet
mmx image generate --prompt "<ch 的提示詞>" --width 1920 --height 1080 --n 3 --out-dir "$TMP/mmx" --out-prefix bg-ch --quiet
```

每種各出 3 張，挑留空區最乾淨的一張，用第 1 節的指令轉成 `bg-<種類>.jpg`。

暗色版（plan.json `"theme": "dark"` 用的 `bg-<種類>-dark.jpg`；HTML 路線還不能做暗色）：fs 的提示詞照抄下面這段（`<主色色碼>` 換掉），side、ch 只換 `--width`、`--out-prefix`；轉檔時檔名寫 `bg-<種類>-dark.jpg`。

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
ffprobe -v error -show_entries stream=width,height -of csv=p=0 "$TMP/bg-fs.jpg"
ffmpeg -v error -y -i "$TMP/bg-fs.jpg" -vf "drawbox=x=120:y=150:w=1260:h=712:color=red@0.8:t=4,drawbox=x=1424:y=581:w=464:h=370:color=blue@0.8:t=4,drawbox=x=0:y=920:w=1920:h=160:color=yellow@0.8:t=4" "$TMP/zones-fs.jpg"
ffmpeg -v error -y -i "$TMP/bg-fs.jpg" -i "$TMP/bg-side.jpg" -i "$TMP/bg-ch.jpg" -filter_complex "[0]scale=640:360[a];[1]scale=320:360[b];[2]scale=640:360[c];[a][b][c]hstack=3" "$TMP/preview.jpg"
```

- 尺寸要是 `1920,1080`、`960,1080`、`1920,1080`。
- `zones-fs.jpg`：紅框（全畫面主卡）、藍框（子母畫面）、黃框（字幕帶）裡沒有裝飾（R9.2）。
- `preview.jpg` 給使用者看 → 停點 ⑤。HTML 路線的 `brand.mjs bg` 已經產生這兩張，不用再跑後兩行。
