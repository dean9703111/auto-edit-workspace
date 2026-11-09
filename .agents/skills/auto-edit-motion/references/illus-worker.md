# 素材工人的派工模板（另外畫一個線稿元件）

只在使用者另外要求畫線稿元件時用（例：「幫我畫一個路由器的元件」）。內容設計動畫要的新元件，由做那段的設計師自己畫（`design-build.md` 的「新畫線稿元件」），不用派工人。

要畫的每個元件派一個工人，同一則回覆一次全部派出（一次最多 4 個，超過就分批）。工人只寫 `projects/<專案>/work/hyperframes/illus-local/<名稱>.svg` 和 `projects/<專案>/work/reports/illus-<名稱>.md`，不改 x 檔、plan.json、storyboard.md、`shared/`。

## 派工前先準備（主代理做）

1. 把要畫的元件寫成一行規格：`規格：<名稱>，建議尺寸 <寬>×<高>，狀態 <a>／<b>；描述：…`。名稱小寫英文開頭、只用英數；建議尺寸抄 `design-build.md` 元件表裡大小相近的那個；沒有狀態就寫 `狀態 —`。插圖清單裡已經有這一列就照抄。
2. 打開 `shared/template/kit/illus-gallery.jpg`，挑長得最像的 2 個畫廊元件，印出它們的 SVG 當參考（元件名照 `illus-gallery.jpg` 每格下面的寫法；opts 寫在 `{}` 裡，例 `{screen:'rec'}`）：

```
node -e "globalThis.window=globalThis;globalThis.document={querySelectorAll:()=>[]};require('./shared/template/kit/illus.js');console.log(window.ILLUS.<元件名>({}))"
```

## 派工訊息（照抄，把 `<…>` 換掉）

```
你要畫一個示意插圖元件，存成 projects/<專案>/work/hyperframes/illus-local/<名稱>.svg。
你只能寫這個檔和 projects/<專案>/work/reports/illus-<名稱>.md。

【規格】<那一行規格>
【風格契約】先讀 shared/template/kit/illus-style.md 全文，每一條都要照做。
【參考】畫廊裡最像的兩個元件（看線粗、圓角、用色怎麼搭；它們有 <text> 是例外，你不能用）：
<元件 1 的 SVG>
<元件 2 的 SVG>

【驗收】
1. 跑 node shared/template/tools/media.mjs illus-lint --project projects/<專案> --only <名稱>（只查這個檔）：沒有 ✖；⚠ 照 → 改，或在 work/reports/illus-<名稱>.md 寫保留理由。
2. viewBox＝0 0 <寬> <高>（建議尺寸，1 單位＝1 px）。
3. 規格寫的每個狀態都有 <g class="il-<狀態>" style="opacity:0">，底圖畫「沒有狀態」的樣子。
4. 不寫 id、不寫字、不用色碼；顏色只用 var(--il-*)。

【回報】只回一行：<名稱> ✖0 ⚠<N>｜<寬>×<高>，狀態 <a>／<b>。參考了哪兩個元件、每個 ⚠ 的原文和保留理由寫在 work/reports/illus-<名稱>.md。
```

## 收件（主代理做）

- 跑 `ls -l projects/<專案>/work/hyperframes/illus-local/<名稱>.svg`（時間是剛剛）和 `grep -c "il-<狀態>" projects/<專案>/work/hyperframes/illus-local/<名稱>.svg`（每個狀態至少 1），才算交件。
- 全部回來後跑一次 `node shared/template/tools/media.mjs illus-lint --project projects/<專案>`（會拼 `work/插圖清單.jpg`，和畫廊元件並排），打開看；不像同一套就把哪裡不像（線太細、圓角太尖、顏色太亮）寫清楚，交回同一個工人重畫。重畫最多 1 次，還是不像就照用，回報時告訴使用者哪裡不像。
