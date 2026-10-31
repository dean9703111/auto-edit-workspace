# 素材工人的派工模板（示意動畫：畫一個新元件）

給 `auto-edit-motion` 示意動畫分支 S1 用：插圖清單裡「來源」是「新建 SVG」的每一列派一個工人（一次一個；複雜的物件可以改派 Codex）。工人只寫 `projects/<專案>/work/hyperframes/illus-local/<名稱>.svg` 這一個檔，不改 x 檔、plan.json、storyboard.md、`shared/`。

## 派工前先準備（主代理做）

1. 從插圖清單抄那一列（`規格：<名稱>，建議尺寸 <寬>×<高>，狀態 <a>／<b>；描述：…`）。
2. 打開 `shared/template/kit/illus-gallery.jpg`，挑長得最像的 2 個畫廊元件，印出它們的 SVG 當參考（元件名照 `illus-gallery.jpg` 每格下面的寫法；opts 寫在 `{}` 裡，例 `{screen:'rec'}`）：

```
node -e "globalThis.window=globalThis;globalThis.document={querySelectorAll:()=>[]};require('./shared/template/kit/illus.js');console.log(window.ILLUS.<元件名>({}))"
```

3. 讀 `shared/template/kit/illus-style.md` 全文，整份貼進派工訊息。

## 派工訊息（照抄，把 `<…>` 換掉）

```
你要畫一個示意插圖元件，存成 projects/<專案>/work/hyperframes/illus-local/<名稱>.svg（只寫這一個檔）。

【規格】<插圖清單那一列原文>
【風格契約】下面是 shared/template/kit/illus-style.md 全文，每一條都要照做：
<illus-style.md 全文>
【參考】畫廊裡最像的兩個元件（看線粗、圓角、用色怎麼搭；它們有 <text> 是例外，你不能用）：
<元件 1 的 SVG>
<元件 2 的 SVG>

【驗收】
1. 跑 node shared/template/tools/media.mjs illus-lint --project projects/<專案>：這個檔 0 個 ✖；⚠ 照 → 改，或在回報寫理由。
2. viewBox＝0 0 <寬> <高>（建議尺寸，1 單位＝1 px）。
3. 規格寫的每個狀態都有 <g class="il-<狀態>" style="opacity:0">，底圖畫「沒有狀態」的樣子。
4. 不寫 id、不寫字、不用色碼；顏色只用 var(--il-*)。

【回報】最多 10 行，照下面的格式。
```

## 回報格式（工人交回，最多 10 行）

```
元件：<名稱>（<寬>×<高>，狀態 <a>／<b>）
檔案：projects/<專案>/work/hyperframes/illus-local/<名稱>.svg
ls -l：<貼 ls -l 那一行>
參考：<畫廊元件 1>、<畫廊元件 2>
illus-lint：✖ 0、⚠ <N>（每個 ⚠ 一行原文＋保留理由；沒有寫「無」）
我沒有改的東西：x 檔、plan.json、storyboard.md、shared/
```

## 收件（主代理做）

- `ls -l` 的時間是剛剛、`grep -c "il-<狀態>"` 每個狀態至少 1，才算交件。
- 全部新元件都回來後，跑一次 `node shared/template/tools/media.mjs illus-lint --project projects/<專案>`，打開 `work/插圖清單.jpg` 和畫廊元件並排看；不像同一套就把哪裡不像（線太細、圓角太尖、顏色太亮）寫清楚交回同一個工人重畫。
