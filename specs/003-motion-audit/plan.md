# Implementation Plan: 003 motion-audit

**Spec**: `specs/003-motion-audit/spec.md`　**契約**：`specs/contracts/cli-003.md`（本線寫）、`specs/contracts/cues.md`（002 寫，本線照做）
**原則**：只改 003 擁有的檔（`specs/README.md` 所有權表）；每個改動點寫「改哪個檔、哪個函式、怎麼量、邊界條件」。行號是 2026-10-31 的現況。

## 技術背景

- 執行環境：Node 22（零依賴）、瀏覽器端是 HyperFrames 0.8.221 下載的 chrome-headless-shell（`AB` 的 `findChrome`）。
- SM 是瀏覽器端 IIFE（`window.SceneMotion`），測試用 `vm.runInThisContext` 在 Node 跑 GSAP（`dev/tests/motion.test.mjs` 現行做法），目標用純物件或 DOM shim。
- audit 是 Node＋CDP：`AU`（流程）→ `AB.openSession`（seek／measure／evaluate）→ `AP.measureInPage`（在頁面裡量）→ `AR.judgeSample`（純函式判定）。新規則照同一條線加：頁面端量原始資料、Node 端判定。

## 檔案與改動總表

| 檔案 | 改動 | 對應 FR |
|---|---|---|
| `shared/template/kit/scene-motion.js` | 新增 `at`、`dur`、`end()`、`focus`、`type`、`marks`；`fade`／`move` 讀寫亮度記錄；`scType` plugin；API 註解 | FR-001–FR-019 |
| `shared/template/custom/x-process.html`、`x-metaphor.html`、`x-before-after.html`、`x-numbers.html` | 綁句、檔頭、版面 | FR-020–FR-026 |
| `shared/template/custom/x-warnings.html`、`x-prompt.html`、`x-ui-mock.html`、`x-architecture.html`、`x-branch.html`（新） | 新範例 | FR-030–FR-036 |
| `shared/template/tools/lib/audit-page.mjs` | `measureInPage` 加欄位；新增 `collectMotionInPage` | FR-041–FR-049、FR-055 |
| `shared/template/tools/lib/audit-rules.mjs` | 新增 `judgeLayout`、`judgeMotion`、`stillTimes`、`cueFindings`；`customDuration` 加 `autoEnd` | FR-040–FR-058 |
| `shared/template/tools/lib/audit-browser.mjs` | `S.motion()`、`S.cueErrors()` | FR-055、FR-057 |
| `shared/template/tools/audit.mjs` | 取樣排程、呼叫新規則、`durationWarnings`、檔頭／`--help` | FR-049、FR-053–FR-059 |
| `shared/template/tools/lib/custom-preview.mjs`（新，待裁決） | `buildCustomPreview` | FR-061 |
| `shared/template/index.html` | ④ 情境動畫分頁、動態規則與音效分頁 | FR-060、FR-063 |
| `dev/tests/motion.test.mjs`、`audit.test.mjs`、`examples.test.mjs`、`icons.test.mjs` | 測試 | FR-070–FR-074 |
| `dev/tests/helpers.mjs`（共用，只加函式） | `makeDomShim()`、`makeCustomProject()` | FR-070、FR-072 |

---

## §A. `P.at`／`P.dur`／`P.end()`（SM；語意照 `cues.md` v1 §4）

### A.1 改哪裡

`window.SceneMotion = function (tl, root)`（SM:127 起）裡，在 `var P = { … }` 之前加（cues.md §4.1）：

```js
var host = root && root.closest ? root.closest('[data-composition-src], [data-composition-file]') : null;
var sid  = host ? String(host.id || '').replace(/^el-/, '') : null;
var comp = root && root.getAttribute ? root.getAttribute('data-composition-id') : null;
var C = window.__cues, injected = !!(C && C.segs && sid && C.segs[sid]);
var seg  = injected ? C.segs[sid] : readSample(root);          // readSample：JSON.parse(data-cues-sample)；沒有回 null，壞掉丟錯（cli-003 §3.1）
var cues = injected ? (C.cues || {}) : (seg && seg.cues) || {};
var tag  = injected ? sid : comp;                               // __cueErrors 每則的前綴（cues.md §4.4「段 id 或 comp id」）
var marks = [];
(window.SceneMotion.marks = window.SceneMotion.marks || {})[comp || '?'] = marks;   // 本線補充（FR-003）
```

`P.at(ref, off)`（cues.md §4.2）：

```
off = off == null ? 0 : off
if (!(typeof ref === 'number' || typeof ref === 'string') || !isFinite(off)) throw new Error(<cli-003 §3.1>)   // 本線補充
if (typeof ref === 'number') t = ref + off
else if (seg && seg.refs && seg.refs[ref] != null) t = seg.refs[ref] − seg.start + off
else if (seg && (m = /^#(\d+)(e)?([+-]\d+(?:\.\d+)?)?$/.exec(ref)) && cues[m[1]]) t = cues[m[1]][m[2] ? 1 : 0] + Number(m[3] || 0) − seg.start + off
else { t = off; pushErr(tag + " P.at('" + ref + "')：" + 原因) }
t = Math.max(0, r3(t)); marks.push({ ref: ref, t: t }); return t
```

原因（cues.md §4.4 原文）：`seg` 是 null → 第 3 種；符合 `#N…` 寫法但 `cues[N]` 沒有 → 第 1 種 `字幕沒有第 N 句（window.__cues 有 M 句）`（M＝`cues` 的鍵數）；其他（`@詞` 沒預先算到、不是句號寫法的字串）→ 第 2 種。
`pushErr(msg)`：`(window.__cueErrors = window.__cueErrors || [])`，同一則字串已經在陣列裡就不推（本線補充）。

`P.dur()`（cues.md §4.3）：`seg ? seg.D : Number(root.getAttribute('data-duration'))`；不是有限正數 → 回 0、推 `<comp> P.dur()：找不到 window.__cues、data-cues-sample，root 也沒有 data-duration → 用 build 產生的 index.html 看，或在 root 寫 data-duration`（本線提議的原文，FR-006）。
`P.end(x)`：`x == null ? P.dur() : x`，其餘照舊（`tl.set({}, {}, x)`，SM:207）。

### A.2 量測方法

- 純函式行為：`motion.test` 塞 `window.__cues` 與 root shim（`getAttribute`、`closest` 回傳 `{ id: 'el-x01' }`），比回傳值與 `__cueErrors` 字串。
- seek-safe：`P.at` 不碰時間軸，只回傳數字；用它排的時間軸照 SM 既有規則。

### A.3 邊界條件

- `round3` 和 `AR:27` 同（`Math.round(n*1000)/1000`），避免 0.30000000000000004 讓 snapshot 時刻對不齊。
- 預覽頁（`preview/x-*.html`）沒有 host：`closest` 回 `null` → 走 sample（cues.md §4.1 第 3 步）。
- `--test` 的 `test-clip.html`：`cues`、`start` 都減掉片段起點（cues.md §2），段內秒數不變，不用特別處理。
- `window.SceneMotion.marks` 掛在函式物件上：SM 重新載入會清空，符合「每次載入重算」。
- 數字 ref 也記進 `marks`：手寫秒數的舊檔照樣能切拍（`hold` 規則照判）。

### A.4 測試向量（`motion.test`）

- `cues.md` §6 的 #1–#13 全部照抄（共同輸入、期望回傳、`__cueErrors` 字串逐字相同）。
- 本線補充：

| # | 呼叫 | 期望 |
|---|---|---|
| E1 | `P.at({})` | 丟錯，訊息＝cli-003 §3.1 第 1 列 |
| E2 | `P.at('#18', NaN)` | 丟錯，訊息＝cli-003 §3.1 第 2 列 |
| E3 | 沒有 `__cues`、沒有 sample、root `data-duration="9"`：`P.dur()` | 9 |
| E4 | 三者都沒有：`P.dur()` | 0，`__cueErrors` 多一則 `x-process P.dur()：…` |
| E5 | 同一個 `P.at('#99')` 呼叫兩次 | `__cueErrors` 只有一則 |
| E6 | 依序 `P.at('#18')`、`P.at(5)`、`P.at('#17', -0.5)` | `P.marks`＝`[{ref:'#18',t:3.2},{ref:5,t:5},{ref:'#17',t:0}]`；重建 SceneMotion 後 `window.SceneMotion.marks['x-process']` 是空陣列 |

---

## §B. `P.focus`（SM）

### B.1 改哪裡

在 SceneMotion 內加亮度記錄：`var lv = new Map()`（元素 → `{ v, t }`，`v`＝目前 opacity、`t`＝最後一次改動的結束時間）。只有 `P.focus` 會**建立**記錄；`fade`（SM:149）與 `move`（SM:160）在記錄存在時：

- 出場（目標 opacity 0）：`from = lv.get(el).v`（取代固定 1），寫完把記錄改成 `{ v: 0, t: at + dur }`；
- 進場（目標 opacity 1）：寫完改成 `{ v: 1, t: at + dur }`。

`P.focus(group, active, at, o)`：

```
dim = opt(o,'dim',0.4); dur = opt(o,'dur',0.4); ring = opt(o,'ring',null)
items = els(group); act = active == null ? null : els(active)[0]
items.forEach(el => {
  cur = lv.get(el) || { v: 1, t: -1 }
  if (at < cur.t − 0.001) throw <cli-003 §3.1 focus-order>
  target = (act === null || el === act) ? 1 : dim
  if (target !== cur.v) tl.fromTo(el, { opacity: cur.v }, { opacity: target, duration: dur, ease: 'sine.inOut', immediateRender: first('opacity', el) }, at)
  lv.set(el, { v: target, t: at + dur })
  if (ring) {
    r = el.querySelector(ring); rc = lv.get(r)
    rt = (act !== null && el === act) ? 1 : 0
    if (!rc) { tl.fromTo(r, { opacity: 0 }, { opacity: rt, duration: dur, ease: 'sine.inOut', immediateRender: first('opacity', r) }, at) }
    else if (rc.v !== rt) { 同上，from rc.v }
    lv.set(r, { v: rt, t: at + dur })
  }
})
```

`'focus'` 加進骨架第二行 `forEach`（兩個選擇器都 `$q`，`$q(null)` 回 `null`）。

### B.2 量測方法

`motion.test`：三個純物件 `{ opacity: 1, querySelector: () => ring }`（ring 也是純物件）先 `P.rise`（0.5／1.0／1.5），再 `focus(…, r1, 3)`、`focus(…, r2, 6)`、`focus(…, null, 9)`、`P.out(r2, 11)`。亂序 seek 到 `[0, 2, 3.2, 3.5, 6.2, 7, 9.2, 10, 11, 11.2, 12]`，每個時刻三個元素與三個框的 opacity 和「順序 seek 一次跑完」的結果相同，並等於預期表（例：t=7 → r1 0.4、r2 1、r3 0.4、框 0/1/0；t=11 → r2 從 1 開始淡）。

### B.3 邊界條件

- active 不在 group 裡：當成 `null` 以外的「全部變暗」——**丟錯**比較好懂：`P.focus 的第二個參數 #x 不在第一組裡`（cli-003 §3.1）。
- group 元素在 `at` 時還沒進場（opacity 0）：記錄預設 1 是錯的；檔頭與 R7.3 方法表寫「`P.focus` 之前每個元素都要已經進場」。測試不覆蓋（使用錯誤）。
- 同一時刻兩次 `P.focus`：第二次 `at` ＜ 第一次結束（`at + dur`）→ 丟錯；要連續換焦點至少相隔 `dur`。
- 亮度 0.4 的元素被 audit 量「壓到講者」等規則：opacity 0.4 仍算可見（現行 AP 的可見門檻），行為不變。

---

## §C. `P.type`（SM）

### C.1 改哪裡

模組層加 `registerType()`（和 `registerCount` 同一處呼叫）：

```js
gsap.registerPlugin({ name: 'scType',
  init: function (target, cfg) { this.t = target; this.u = prep(target, cfg.caret); },
  render: function (ratio, data) { paint(data.u, ratio); } });
```

`prep(el, caret)`（只在第一次對這個元素呼叫時做，之後讀 `el.__scType`）：
1. 深度優先走 `el.childNodes`；`nodeType === 3` 而且 `/\S/.test(nodeValue)` 的文字節點換成兩個 span：`<span data-sc-on></span><span data-sc-off style="visibility:hidden">原文</span>`；元素節點（`<br>`、`<span>`、`<i>`、`<svg>`）不動、往下走（`<svg>`、`<i>` 裡沒有文字，自然略過）。
2. 每個單位記 `{ on, off, s: 原文, idx: [第 k 個非空白字結束的 code unit 位置] }`；`N`＝所有單位非空白字數總和，寫 `el.setAttribute('data-sc-type', N)`。
3. `caret` 時建一個 `<span data-sc-caret aria-hidden="true" style="display:inline-block;width:0;height:0.9em;vertical-align:-0.1em;border-left:4px solid currentColor;margin-left:-4px">`。

`paint(u, ratio)`：`k = floor(ratio × N + 1e-6)`，逐單位分配：這個單位分到 `j` 個字 → `on.textContent = s.slice(0, idx[j−1] 之後的空白也包含到下一個非空白字之前)`、`off.textContent = 其餘`；游標插在「已打」最後一個字所在單位的 `on` 後面（`k = 0` 時插在第一個單位的 `on` 前面），`ratio ≥ 1` 時 `caret.style.display = 'none'`。

`P.type(sel, at, o)`：每個元素先 `prep`，`dur = opt(o,'dur', round2(N / opt(o,'cps',8.5)))`，`tl.to(el, { scType: { caret: opt(o,'caret',true) }, duration: dur, ease: 'none', immediateRender: first('scType', el) }, at)`。`'type'` 加進骨架第一行 `forEach`。

### C.2 量測方法

`helpers.mjs` 加 `makeDomShim()`：只實作 spec FR-019 列的 API（`Element`：`childNodes`、`nodeType`、`parentNode`、`insertBefore`、`removeChild`、`setAttribute`／`getAttribute`／`hasAttribute`、`style.cssText`、`textContent`、`className`、`ownerDocument`；`Text`：`nodeType 3`、`nodeValue`）與 `serialize(el)`（輸出 `已打|未打` 兩段字串與游標位置）。`motion.test`：
- `<div>幫我把<span class="sc-kw">表格</span><br>整理好</div>`：N＝7、預設長度 0.82 s；亂序 seek 到 ratio 1／0／0.5／0.3／1，已打字串依序是 `幫我把表格整理好`、``、`幫我把`、`幫`、全部（k＝floor(r×7)）；`<span class="sc-kw">` 與 `<br>` 仍在原位；已打＋未打永遠等於原文。
- 同一元素呼叫兩次 `prep`：span 數不變、`data-sc-type` 不變。
- 游標：`ratio < 1` 時有且只有一個 `data-sc-caret`、樣式字串含 `width:0` 與 `margin-left:-4px`；`ratio 1` 時 `display:none`。

### C.3 邊界條件

- 文字裡有全形空白（U+3000）：`\s` 涵蓋，當空白處理（跟著下一個字出現）。
- emoji、合字：`Array.from` 以 code point 切，ZWJ 合字會被拆開（範例不用 emoji，檔頭寫「打字的文字不要放 emoji」）。
- `dur` 很短（N＝1）：`round2(1/8.5)`＝0.12 s，照用。
- 字數 0：`dur` 0 → 改成 0.001（避免 GSAP 0 長度 tween 的 immediateRender 特例），`paint` 什麼都不做。
- 打字途中 audit 取樣：元素在動、不判（AP 的 moving）。打字前（ratio 0）版面已經是完整文字的大小，所以靜止取樣量到的框就是最後的框。

---

## §D. 4 支範例改寫

共同：
- 時間常數改 `P.at`；`P.end()`；刪 `const D`；root 加 `data-cues-sample`；檔頭換 6 小節（原文由各檔自己寫，格式見 docs.md §4 的 R7.5 表與 §2 骨架）。
- `data-cues-sample` 照 cues.md §5：`"start": 0`；`cues[N]`＝`[綁句點, 下一個綁句點 − 0.3]`（最後一句到 `D − 0.5`）；`#N@詞` 的 ref 另放 `refs`，值＝那一句的起點（整合測試讓那句字幕以這個詞開頭，`cueSeconds` 算出來就是句子起點）。下面各節的「sample」就是要貼進 root 的字串。
- 骨架兩行 `forEach` 換成新版（含 `type`、`focus`）。
- 推導 D 下限與拍間距時用的長度（SM:128-132）：`IN` 0.5、`OUT` 0.4、`REVEAL` 0.55、`MASK` 0.6、`STROKE` 0.7、`MORPH` 0.7、`COUNT` 1.2、`BAR` 0.8、`BEAT` 0.15；淡出 0.5（R7.2 表）；完成態 1.2、最後一幕 1.5（定案）。

### D.1 x-process

| 項目 | 現在 | 改成 | 理由 |
|---|---|---|---|
| 站 | 248×208，left 24／316／608／900，top 40／332 | 264×224，left 40／316／592／868，top 40／316 | 內距（R8 #6）：左右 (256−208)/2＝24 ≥ 24；上下 (216−184)/2＝16 ≥ 14.56（內容＝圖示 96＋間距 16＋行高 72） |
| 曲線 | `M148 248 C148 356 200 436 316 436` 等 | c1 `M172 264 C172 372 224 428 316 428`、h1 `M302 414 L316 428 L302 442`；c2 `M448 316 C448 208 500 152 592 152`、h2 `M578 138 L592 152 L578 166`；c3 `M724 264 C724 372 776 428 868 428`、h3 `M854 414 L868 428 L854 442` | 端點跟著站的新座標（站中心 x＝left＋132、中線 y＝top＋112）；`examples.test.mjs:130` 的 ≥ 16 px 幾何檢查要過 |
| 總覽 | 站 0.8 起 stagger 0.12；圖示 1.3 起 stagger 0.12 | 站 1.0 起 stagger 0.5；圖示 1.15 起 stagger 0.5 | FR-050：0.36 s 內 4 個 → ⚠；0.5 s 一個 → 任何 1 s 窗 ≤ 2 |
| 綁句 | `T1 = 2.6 …` | `T1 = P.at('#12'), T2 = P.at('#13'), T3 = P.at('#14'), T4 = P.at('#15')` | |
| sample | — | `{"start":0,"D":14.5,"cues":{"12":[3.2,5.7],"13":[6,8.5],"14":[8.8,11.3],"15":[11.6,14]}}` | |

推導：第 i 站亮起 `P.in` 0.5 s → 忙到 `T_i + 0.5`；下一條線在 `T_{i+1} − 0.9` 開始描 → 靜止＝`Δ − 1.4` ≥ 1.2 ⇒ **相鄰兩站 ≥ 2.6 s**。最後一站 `T4 + 0.5`＋1.5＋0.5 ⇒ **D ≥ T4 + 2.5**。總覽最後一站 2.5 起、3.0 進場完 ⇒ **T1 ≥ 3.0**。卡片 150–862：上留白 30、下留白 8，差 22 ≤ 40，不動。

### D.2 x-metaphor

| 項目 | 現在 | 改成 | 理由 |
|---|---|---|---|
| 兩框 | 360×220，top 40 | 360×240，top 40；箭頭 `M408 160 H768`、箭頭頭 `M752 144 L768 160 L752 176` | 上下內距 (232−200)/2＝16（內容 112＋16＋72＝200）；原本 6 |
| 結論句、限制條 | top 300、428 | top 312、440 | 往下挪 12 px 保持間距 32／40；限制條底 552 ≤ 內容區 580 − 28 |
| 總覽 | 兩框 0.8 stagger 0.15 | `P.rise('#xmeta-boxL, #xmeta-boxR', 1.0, { stagger: 0.5 })` | 卡 0.5＋兩框 0.8／0.95 → [0.5,1.5) 3 個 |
| 綁句 | `T1..T5` 五個常數 | `T1 = P.at('#22')`（左圖示）；箭頭 `T1 + 1.4`、箭頭頭 `T1 + 2.1`、右框 `T1 + 2.8`（同一個比喻的中間步驟，用 + 秒數接）；`T4 = P.at('#23')`（結論）；`T5 = P.at('#24')`（限制） | 拍只給新資訊（FR-020） |
| sample | — | `{"start":0,"D":13,"cues":{"22":[2,6.5],"23":[6.8,8.7],"24":[9,12.5]}}` | |

推導：第 1 拍忙碌 `T1`–`T1+0.7`、`T1+1.4`–`T1+2.3`、`T1+2.8`–`T1+3.5`，最長靜止要 ≥ 1.2 ⇒ **T4 ≥ T1 + 4.7**；結論 `maskUp` 0.6 ⇒ **T5 ≥ T4 + 1.8**；限制條 rise 0.5＋圖示 `+0.15` 描 0.7 ⇒ **D ≥ T5 + 2.9**；兩框 1.5 起、2.0 完 ⇒ **T1 ≥ 2.0**。

### D.3 x-before-after

| 項目 | 現在 | 改成 | 理由 |
|---|---|---|---|
| 卡片 | top 150，高 620 → 480 | before top 185、高 620；after top 255、高 480：`P.morph('#xba-card', AFTER, { height: 480, top: 255 }, { from: { height: 620, top: 185 } })` | 垂直平衡：before 150–770 差 −70（> 40）；兩態都置中，`top = 120 + (750 − 高)/2` |
| 痛點膠囊 `.xba-chip` | 高 96（框 3） | 高 112 | 上下內距 (106−72)/2＝17 ≥ 14.56；原本 9 |
| 省下膠囊 `#xba-save` | 高 96（無框） | 高 104 | (104−72)/2＝16；原本 12 |
| 總覽 | `lab1, ico1, n1, track` 0.6 stagger 0.1 | `P.rise('#xba-lab1', 0.6)`、`P.rise('#xba-row', 1.1)`（整列一個單位，圖示與數字一起）、`P.rise('#xba-track', 1.6)`；時鐘描線 1.25 | 原本 0.3 s 內 4 個、間隔 0.1 → `density`＋`stagger` |
| 痛點 | `.xba-chip` 2.8 stagger 0.15 | `CHIPS = P.at('#33')`，`P.rise('.xba-chip', CHIPS, { stagger: 0.5 })` | 原本 0.3 s 內 3 個 |
| 綁句 | 手寫 1.0、1.2、5.2、6.7 | `BEFORE = P.at('#32')`（計數 0→3、量條）、`CHIPS = P.at('#33')`、`AFTER = P.at('#34')`（變形與換字，原 `T`）、`SAVE = P.at('#35')`（省下） | |
| sample | — | `{"start":0,"D":14,"cues":{"32":[2.2,4.8],"33":[5.1,7.8],"34":[8.1,10.4],"35":[10.7,13.5]}}` | |

推導：BEFORE 計數 1.2 s、量條 `+0.2` 1.4 s ⇒ 忙到 `BEFORE + 1.6` ⇒ **CHIPS ≥ BEFORE + 2.8**；膠囊最後一個 `CHIPS + 1.0` 起、`+1.5` 完，`AFTER − 0.2` 開始退 ⇒ **AFTER ≥ CHIPS + 2.9**；AFTER 計數 `+0.3` 1.0 s ⇒ 忙到 `+1.3` ⇒ **SAVE ≥ AFTER + 2.5**；SAVE 計數 `+0.2` 1.0 s ⇒ **D ≥ SAVE + 3.2**；量條 1.6 起、2.1 完 ⇒ **BEFORE ≥ 2.1**。換字（`lab1→lab2`、`ico1→ico2`、`n1→n2`）是「替換」（FR-051），不算新元素。

### D.4 x-numbers

| 項目 | 現在 | 改成 | 理由 |
|---|---|---|---|
| 卡片 | top 150、高 628 | top 179、高 632 | 內容 150–778 差 −62 → 置中；高多 4 是 A 區往下 4 |
| A／B 區 | top 36／276 | top 40／280 | 標題到內容目標 40（R8 #6） |
| 綁句 | `A = 1.2`、`Bt = 4.6` | `A = P.at('#42')`、`B = P.at('#43')`；撐破那一拍 `A + 1.1` 照舊用 + 秒數接 | |
| sample | — | `{"start":0,"D":9,"cues":{"42":[1.2,4.3],"43":[4.6,8.5]}}` | |

推導：A 計數到 20（1.1 s）＋撐破 0.7 ⇒ 忙到 `A + 1.8` ⇒ **B ≥ A + 3.0**；B 區 rise＋計數 `+0.6` 1.2 s ⇒ 忙到 `B + 1.8` ⇒ **D ≥ B + 3.8**；A 區 0.6 起、1.1 完 ⇒ **A ≥ 1.1**。`#xn-overA` 疊在填充上（inset 0）＝「亮起」，不算新元素。

### D.5 邊界條件

- 估算和實量的差：CJK 字寬以 52 px／字估（Noto Sans TC 全形字＝1 em）；英數比例字寬不定，含英數的文字以 audit 實量為準，差超過 4 px 的地方記在 tasks.md 的 T 項備註。
- max-content 的框加 `data-snap-width`（SM:87 `SNAP_SEL`），字型載入後補成偶數整數寬，置中時不會出現半像素邊。

---

## §E. 5 支新範例

共同：card `.sc-wcard`（或同尺寸的自訂視窗）left 120、width 1180、標題列 128、框 2 px；`top = 120 + (750 − 卡高)/2`；內容區 body 1176 寬。表內座標除特別註明外都是 body 內座標。sc-t52 有框文字盒的高度下限（R8 #6：上下 ≥ 14.56，行高 72，`kit/scene.css:224`）：無框 ≥ 104、3 px 框 ≥ 108、4 px 框 ≥ 112；sc-t40（行高 56，`scene.css:221`）：4 px 框 ≥ 92 → 取 88 時用無框或 2 px 框。

### E.1 x-warnings

| 元素 | 位置與尺寸 | 樣式要點 |
|---|---|---|
| 卡 `#xwarn-card` | 畫面 top 139；body 1176×580 → 卡高 712 | 標題 ≤ 10 字 |
| 清單 `#xwarn-list` | left 40、top 40；`display:grid; grid-auto-rows:144px; row-gap:34px; width:max-content`、`data-snap-width` | 三列 y 40–184、218–362、396–540 |
| 列 `.xwarn-row`（`#xwarn-r1..3`） | 隨清單同寬（grid stretch），≤ 600（8 字：4＋28＋72＋24＋416＋40＋4＝588） | 4 px 框、圓角 20、底 `--sc-fs-node`、`display:flex; align-items:center; gap:24px; padding:0 40px 0 28px; white-space:nowrap`；上下內距 (136−72)/2＝32 |
| 列圖示 `#xwarn-ico1..3` | `.sc-icon` `--d:72px; --i:40px` | key-round／file-x／shield-check |
| 亮框 `.xwarn-on` | 列內 `inset:-4px` | 4 px 主色框、圓角 20 |
| 示意區 `#xwarn-panel` | left 680、top 40、456×500 | 4 px 框；三張 `.xwarn-fig`（`#xwarn-p1..3`）`inset:0` 疊在同一位置，`flex-direction:column; justify-content:center; gap:24px`；圖示 `--d:160px; --i:88px`（`#xwarn-pico1..3`：globe／hard-drive／check）；說明 ≤ 7 字 |

時間軸：

```js
P.reveal('#xwarn-card', 0.5);
P.rise('#xwarn-r1, #xwarn-r2, #xwarn-r3', 1.0, { stagger: 0.5 });
P.icon('#xwarn-ico1, #xwarn-ico2, #xwarn-ico3', 1.0 + P.BEAT, { stagger: 0.5 });
const W1 = P.at('#52'), W2 = P.at('#53'), W3 = P.at('#54');
P.focus('.xwarn-row', '#xwarn-r1', W1, { ring: '.xwarn-on' });
P.rise('#xwarn-panel', W1);                       // 示意區和第一張圖一起出現（不留空框，OV/DR:L10）
P.icon('#xwarn-pico1', W1 + P.BEAT);
P.focus('.xwarn-row', '#xwarn-r2', W2, { ring: '.xwarn-on' });
P.swap('#xwarn-p1', '#xwarn-p2', W2);
P.icon('#xwarn-pico2', W2 + 0.3);
P.focus('.xwarn-row', '#xwarn-r3', W3, { ring: '.xwarn-on' });
P.swap('#xwarn-p2', '#xwarn-p3', W3);
P.icon('#xwarn-pico3', W3 + 0.3);
// 選用：const ALL = P.at('#55'); P.focus('.xwarn-row', null, ALL, { ring: '.xwarn-on' });
P.end();
```

推導：每拍忙碌＝聚焦 0.4、換圖 0.5、圖示 `+0.3` 描 0.7 ⇒ 忙到 `W + 1.0` ⇒ **相鄰兩條 ≥ 2.2 s**、**D ≥ W3 + 3.0**（用 ALL 時 ALL ≥ W3 + 2.2、D ≥ ALL + 2.4）；第三列 2.0 起、圖示 2.15–2.85 ⇒ **W1 ≥ 3.0**。節奏：[1.0,2.0) 2 列、[1.5,2.5) 2 列；W1 只有示意區 1 個新元素（亮框是「亮起」）；W2、W3 的換圖是「替換」。
sample：`{"start":0,"D":11.6,"cues":{"52":[3.2,5.5],"53":[5.8,8.1],"54":[8.4,11.1]}}`。
和 ES seg58 的差別：ES 三卡 700×200、右側示意 x 860–1800（02 §1 #10），右側會壓到工作區的子母畫面禁入區（x ≥ 1424）；改成卡內左清單＋右示意，全部在 x ≤ 1300。

### E.2 x-prompt

| 元素 | 位置與尺寸 | 樣式要點 |
|---|---|---|
| 卡 `#xprompt-card` | 畫面 top 169；body 1176×520 → 卡高 652 | 標題列內 `display:flex; align-items:center; gap:24px`：圖示 `#xprompt-bico`（`--d:72px`，message-square-text）＋標題 |
| 提示詞框 `#xprompt-box` | left 56、top 40、高 288、`width:max-content; max-width:1064px`、`data-snap-width` | 4 px 框、圓角 20、底 `--sc-fs-node`、`padding:32px 40px` |
| 提示詞 `#xprompt-text` | 框內 | `.sc-t52 .sc-w700`、`white-space:nowrap`，每行 ≤ 18 字（936 px），用 `<br>` 斷行，≤ 3 行（3×72＋上下 padding 64＋框 8＝288，所以框高 288；1–2 行時框高不變、下方留白，版面不跳） |
| 關鍵詞 `.xprompt-k`（`#xprompt-k1`、`#xprompt-k2`） | 文字中 | `class="sc-kw xprompt-k"`、`position:relative` |
| 底線 `.xprompt-u`（`#xprompt-u1`、`#xprompt-u2`） | 關鍵詞內 `position:absolute; left:0; right:0; bottom:-4px; height:6px` | 底 `--brand`、圓角 3、`transform-origin:0 50%`；`bottom` 是本線初值，snapshot 量字底到線 8–10 px 再調（`OV/DR:L56`） |
| 提醒膠囊 `#xprompt-note` | left 56、top 368、高 112、`width:max-content`、`data-snap-width` | 4 px 框、圓角 20、底 `--sc-fs-tint`、`display:flex; align-items:center; gap:20px; padding:0 40px 0 32px`；圖示 `#xprompt-nico`（`--d:64px`，lock）；文字 ≤ 10 字 |

時間軸：

```js
P.reveal('#xprompt-card', 0.5);
P.icon('#xprompt-bico', 0.5 + P.BEAT);
P.rise('#xprompt-box', 1.0);
const TYPE = P.at('#62', 0.45), K1 = P.at('#63@表格'), K2 = P.at('#64@時間碼'), NOTE = P.at('#65');
P.type('#xprompt-text', TYPE);                    // 8.5 字／秒（ES seg16），打完游標消失
P.bar('#xprompt-u1', K1);                         // 底線 0.8 s 從左畫到右
P.bar('#xprompt-u2', K2);
P.rise('#xprompt-note', NOTE);
P.icon('#xprompt-nico', NOTE + P.BEAT);
P.end();
```

範例文字（30 個非空白字 → 3.53 s）：`幫我把這支影片的 NG 段落<br>整理成<span…>表格</span>，附上<span…>時間碼</span><br>和剪掉的原因。`；提醒「貼之前先刪掉個資」。
推導：框 1.0 起、1.5 完 ⇒ **TYPE ≥ 1.5**；**K1 ≥ TYPE + 字數/8.5 + 1.2**；底線 0.8 s ⇒ **K2 ≥ K1 + 2.0**、**NOTE ≥ K2 + 2.0**；膠囊 rise 0.5＋圖示 `+0.15` 0.7 ⇒ **D ≥ NOTE + 2.9**。
sample：`{"start":0,"D":14.2,"cues":{"62":[1.6,6.6],"63":[6.9,8.7],"64":[9,10.8],"65":[11.1,13.7]},"refs":{"#63@表格":6.9,"#64@時間碼":9}}`（TYPE＝2.05、打完 5.58、K1 ≥ 6.78、K2 ≥ 8.9、NOTE ≥ 11.0、D ≥ 14.0）。
變體（檔頭表）：

| 變體 | 改什麼 |
|---|---|
| 指令 | 標題列圖示換 square-terminal；`#xprompt-text` 改一行 `<span class="sc-kw">$</span> npm install hyperframes`（不加 `<br>`）；K2、NOTE 可刪（刪了 D 下限改「K1 + 2.9」） |
| 網址 | 圖示換 globe；一行、不拆（`JY/SKILL.md:L133`），≤ 34 個半形字；不需要底線就刪 K1、K2（D 下限改「TYPE + 字數/8.5 + 2.0」，最後一幕 1.5＋淡出 0.5） |

### E.3 x-ui-mock

| 元素 | 位置與尺寸（畫面座標，視窗內另註） | 樣式要點 |
|---|---|---|
| 視窗 `#xui-win` | left 120、top 177、1180×636 | 2 px 框 `--sc-fs-card-line`、圓角 20、底 `--sc-fs-card`、`overflow:hidden` |
| 標題列 `#xui-chrome` | 視窗內 0–88 | 底 `--sc-fs-head`、`display:flex; align-items:center; gap:16px; padding:0 32px`；三顆 16×16 圓點＋標題 `.sc-t40` ≤ 16 字（上下內距 (88−56)/2＝16） |
| 視區 `#xui-view` | 標題列下方 1176×544 | `position:relative; overflow:hidden`、底 `--sc-fs-node` |
| 畫布 `#xui-canvas` | 視區內 `inset:0` | `data-layout-allow-overflow`（放大後超出視區是刻意的） |
| 側欄 `#xui-side` | 畫布內 left 0、264×544 | 底 `--sc-fs-tint`；三項 `.xui-nav` left 8、top 40／152／264、248×88、`padding:0 32px`，`.sc-t40` ≤ 4 字；只有第一項有底（目前頁）；寬 248＝側欄內寬 − 16，算橫條、不報右側空白（FR-045） |
| 頁面標題 `#xui-ptitle` | 畫布內 left 312、top 40 | `.sc-t52 .sc-w900` ≤ 6 字 |
| 按鈕 `#xui-btn` | 畫布內 left 928、top 32、208×88（中心 1032, 76） | 底 `--brand`、字 `--brand-ink`、圓角 16、`.sc-t40 .sc-w900` ≤ 4 字（左右 (208−160)/2＝24） |
| 漣漪 `#xui-ripple` | 按鈕內 `inset:-8px` | 4 px `--sc-fs-ink` 框、圓角 24 |
| 內容列 `.xui-row` ×3 | 畫布內 left 312、top 160／272／384、816×88 | 底 `--sc-fs-tint`、圓角 12、`display:flex; justify-content:space-between; align-items:center; padding:0 32px`；左標籤右值，`.sc-t40` |
| 游標 `#xui-cursor` | 視區內 left 560、top 360、48×48（畫布外、疊在上面） | mouse-pointer-2，`fill: var(--sc-fs-ink); stroke: var(--sc-fs-bg)`；箭尖在 (8, 8) |
| 通知 `#xui-toast` | 視區內 left 40、top 392、高 112、`width:max-content`、`data-snap-width` | 4 px `--sc-good` 框、底 `--sc-fs-card`、`padding:0 40px 0 28px`；圖示 `#xui-tico`（check，底 `--sc-good`）＋ ≤ 8 字；`data-layout-allow-overlap`（彈出通知本來就疊在介面上） |

時間軸：

```js
P.reveal('#xui-win', 0.5);
const ZOOM = P.at('#72'), CLICK = P.at('#73@匯出'), RESULT = P.at('#74');
P.push('#xui-canvas', ZOOM, { to: 1.4, origin: '1032px 76px', dur: 1.2, ease: 'power2.inOut' });   // 以按鈕中心推近：按鈕原地放大
P.in('#xui-cursor', ZOOM);
P.morph('#xui-cursor', CLICK - 0.6, { left: 1024, top: 68 }, { from: { left: 560, top: 360 }, dur: 0.6, ease: 'power2.inOut' });
P.in('#xui-ripple', CLICK, { dur: 0.3 });
P.morph('#xui-ripple', CLICK, { scale: 1 }, { from: { scale: 0.82 }, dur: 0.3, ease: 'power2.out' });
P.rise('#xui-toast', RESULT);
P.icon('#xui-tico', RESULT + P.BEAT);
P.end();
```

推導：視窗 0.5 起、1.05 完 ⇒ **ZOOM ≥ 1.1**；推近 1.2 s 後要停 1.2 s、游標再出發（CLICK − 0.6） ⇒ **CLICK ≥ ZOOM + 3.0**；漣漪 0.3 s ⇒ **RESULT ≥ CLICK + 1.5**；通知 rise 0.5＋圖示 0.85 ⇒ **D ≥ RESULT + 2.9**。游標座標：`P.push` 以按鈕中心為 origin，按鈕中心放大後還在 (1032, 76)；游標箭尖 (8, 8) ⇒ left 1024、top 68。改了按鈕位置就同時改 `origin` 與游標終點（檔頭寫公式：origin＝按鈕 left＋寬/2、top＋高/2；游標終點＝origin − 8）。
sample：`{"start":0,"D":9.6,"cues":{"72":[1.6,4.5],"73":[4.8,6.3],"74":[6.6,9.1]},"refs":{"#73@匯出":4.8}}`；plan.json 範例 `"clicks": ["#73@匯出"]`。
G11 原本寫游標用 `P.drift`：drift 是 16 px 貼邊滑入（SM:25），走不到按鈕；改 `P.morph` 補間 left／top。

### E.4 x-architecture

| 元素 | 位置與尺寸 | 樣式要點 |
|---|---|---|
| 卡 `#xarch-card` | 畫面 top 139；body 1176×580 | 標題 ≤ 10 字 |
| 中繼 `#xarch-cloud` | left 428、top 40、320×120 | 4 px 框、圓角 20、`display:flex; justify-content:center; align-items:center; gap:20px`；圖示 `--d:72px`（cloud）＋ ≤ 3 字（3 字左右內距 (312−248)/2＝32） |
| 裝置 `#xarch-a`、`#xarch-b` | left 40／872、top 316、264×224 | 同 x-process 新站樣式（≤ 4 字）；圖示 smartphone／laptop |
| 線 `#xarch-lines` | body 內 1176×580 的 svg，在裝置下面 | 直連 `#xarch-path` `M304 428 H872`（`--sc-fs-line`）；經雲端 `#xarch-up` `M172 316 V100 H428`、`#xarch-down` `M748 100 H1004 V316`（`--sc-fs-node-line`） |
| 檔案點 `.xarch-dot`（`#xarch-d1..3`） | left 292、top 416、24×24（中心在 A 右緣 304, 428） | 圓、底 `--brand`；z-index 在裝置下面 |
| B 亮框 `#xarch-onB` | B 內 `inset:-4px` | 4 px 主色框 |
| 劃線 `#xarch-cut` | 疊在中繼上的 svg（left 428、top 40、320×120），`#xarch-cutline` `M24 108 L296 12` | `stroke: var(--sc-warn)`、寬 8、圓頭 |
| 結論 `#xarch-no` | 外層 `#xarch-nowrap` left 0、top 196、寬 1176、`display:flex; justify-content:center`；膠囊高 112、`width:max-content` | 4 px `--sc-warn` 框、底 `--sc-warn-dim`；圖示 `#xarch-noico`（`--d:64px`，cloud-off）＋ ≤ 6 字；寬＝156＋52×字數（偶數）→ 置中後 left 是整數 |

時間軸：

```js
P.reveal('#xarch-card', 0.5);
P.rise('#xarch-a', 1.0);      P.icon('#xarch-aico', 1.0 + P.BEAT);
P.rise('#xarch-b', 1.5);      P.icon('#xarch-bico', 1.5 + P.BEAT);
P.rise('#xarch-cloud', 2.0);  P.icon('#xarch-cico', 2.0 + P.BEAT);
P.stroke('#xarch-up, #xarch-down', 2.0 + P.BEAT);
const PATH = P.at('#82'), FLOW = P.at('#83'), CUT = P.at('#84');
P.stroke('#xarch-path', PATH);
P.in('#xarch-d1', FLOW, { dur: 0.2 });        P.morph('#xarch-d1', FLOW, { x: 568 }, { from: { x: 0 }, dur: 1.5, ease: 'none' });        P.out('#xarch-d1', FLOW + 1.2, { dur: 0.3 });
P.in('#xarch-d2', FLOW + 0.5, { dur: 0.2 });  P.morph('#xarch-d2', FLOW + 0.5, { x: 568 }, { from: { x: 0 }, dur: 1.5, ease: 'none' });  P.out('#xarch-d2', FLOW + 1.7, { dur: 0.3 });
P.in('#xarch-d3', FLOW + 1.0, { dur: 0.2 });  P.morph('#xarch-d3', FLOW + 1.0, { x: 568 }, { from: { x: 0 }, dur: 1.5, ease: 'none' });  P.out('#xarch-d3', FLOW + 2.2, { dur: 0.3 });
P.in('#xarch-onB', FLOW + 1.5);               // 第一個檔案到了
P.stroke('#xarch-cutline', CUT);
P.rise('#xarch-no', CUT + 0.7);
P.icon('#xarch-noico', CUT + 0.85);
P.end();
```

推導：中繼 2.0 起、經雲端的線 2.15–2.85 ⇒ **PATH ≥ 3.0**；直連描 0.7 ⇒ **FLOW ≥ PATH + 1.9**；第三個點 `FLOW + 1.0` 出發、`+2.5` 到 ⇒ **CUT ≥ FLOW + 3.7**；劃線 0.7＋膠囊 rise 0.5＋圖示 `+0.15` 0.7 ⇒ 忙到 `CUT + 1.55` ⇒ **D ≥ CUT + 3.6**。節奏：三個點相隔 0.5 s（任何 1 s 窗 ≤ 2）；B 亮框是「亮起」。點走 568 px＝872 − 304（A 右緣到 B 左緣），點在 A、B 下面所以出發與抵達都像從裝置裡出來、進去；抵達前 0.3 s 淡出，完成態不留點（不會被「區塊重疊」報）。
sample：`{"start":0,"D":13.2,"cues":{"82":[3.2,5.1],"83":[5.4,9.1],"84":[9.4,12.7]}}`。

### E.5 x-branch

| 元素 | 位置與尺寸 | 樣式要點 |
|---|---|---|
| 卡 `#xbr-card` | 畫面 top 139；body 1176×580 | |
| 起點 `#xbr-root` | left 40、top 178、264×224（中線 y 290） | 同 x-process 新站樣式；≤ 4 字 |
| 分支欄 `#xbr-col` | left 720、top 40；`display:grid; grid-auto-rows:136px; row-gap:46px; width:max-content`、`data-snap-width` | 三列中線 y 108／290／472 |
| 分支 `.xbr-b`（`#xbr-b1..3`） | 隨欄同寬，≤ 432（5 字：4＋28＋72＋24＋260＋40＋4） | 同 x-warnings 列樣式；亮框 `.xbr-on` |
| 曲線 `#xbr-c1..3`、箭頭 `#xbr-h1..3` | body 內 svg | c1 `M304 290 C512 290 512 108 720 108`、h1 `M706 94 L720 108 L706 122`；c2 `M304 290 H720`、h2 `M706 276 L720 290 L706 304`；c3 `M304 290 C512 290 512 472 720 472`、h3 `M706 458 L720 472 L706 486` |

時間軸：

```js
P.reveal('#xbr-card', 0.5);
P.rise('#xbr-root', 1.0);   P.icon('#xbr-rico', 1.0 + P.BEAT);
P.rise('#xbr-b1, #xbr-b2, #xbr-b3', 1.5, { stagger: 0.5 });
P.icon('#xbr-ico1, #xbr-ico2, #xbr-ico3', 1.5 + P.BEAT, { stagger: 0.5 });
const B1 = P.at('#92'), B2 = P.at('#93'), B3 = P.at('#94');
P.stroke('#xbr-c1', B1);  P.stroke('#xbr-h1', B1 + P.STROKE, { dur: 0.2 });  P.focus('.xbr-b', '#xbr-b1', B1 + 0.9, { ring: '.xbr-on' });
P.stroke('#xbr-c2', B2);  P.stroke('#xbr-h2', B2 + P.STROKE, { dur: 0.2 });  P.focus('.xbr-b', '#xbr-b2', B2 + 0.9, { ring: '.xbr-on' });
P.stroke('#xbr-c3', B3);  P.stroke('#xbr-h3', B3 + P.STROKE, { dur: 0.2 });  P.focus('.xbr-b', '#xbr-b3', B3 + 0.9, { ring: '.xbr-on' });
// 選用：const ALL = P.at('#95'); P.focus('.xbr-b', null, ALL, { ring: '.xbr-on' });
P.end();
```

推導：第三支 2.5 起、圖示 2.65–3.35 ⇒ **B1 ≥ 3.4**；每拍線 0.7＋箭頭 0.2＋聚焦 0.4 ⇒ 忙到 `B + 1.3` ⇒ **相鄰兩條 ≥ 2.5 s**、**D ≥ B3 + 3.3**。曲線端點：起點右緣中點 (304, 290)，分支左緣中點 (720, 中線)，控制點 x 取兩端中點 512（`OV/MR:L150-176` 的 S 形曲線）。
sample：`{"start":0,"D":12.2,"cues":{"92":[3.6,5.9],"93":[6.2,8.5],"94":[8.8,11.7]}}`。
變體（檔頭表）：

| 變體 | 改什麼 |
|---|---|
| 兩條分支 | 刪第 3 支、c3、h3；`#xbr-col` 的 top 改 131（中線 199／381）；c1 終點與 h1 改到 y 199、c2 改 `M304 290 C512 290 512 381 720 381`、h2 改到 y 381 |
| 匯流 | 來源欄改 `left:auto; right:704px`（右緣固定在 x 472，字數不同也不用改曲線）；起點改成結果，left 872；曲線 `M472 <中線> C680 <中線> 680 290 872 290`；箭頭只在結果左緣一個 `M858 276 L872 290 L858 304`（最後一拍描）；聚焦對象改來源 |

### E.6 邊界條件（5 支共同）

- 文字超過上限：audit 會報「文字撐破」（✖）或「內距不足」（⚠）；檔頭寫「放不下縮文案，不縮字」（R8 #5）。
- 綁句間距不夠（口播太快）：audit ⚠「完成態停太短」；檔頭寫兩條路：綁後面的句子，或把這一拍和上一拍合併（同一拍用 + 秒數接，中間步驟可 0.6 s）。
- 只有 2 條警告／2 條分支：x-warnings 刪第 3 列與第 3 張示意、`W3` 那三行；清單 grid 會自己縮，示意區高度不變（上下置中不受影響）。
- `P.focus` 的 group 選擇器用 class（`.xwarn-row`），HyperFrames 把所有子合成掛在同一份文件：class 前綴不同就不會選到別段（R7.2 第 1 步的前綴規則）。

---

## §F. audit 頁面端（`AP`）

### F.1 `measureInPage` 加欄位

每個 `els[i]` 多：

| 欄位 | 怎麼量 | 給哪條規則 |
|---|---|---|
| `pos` | `getComputedStyle(el).position` | FR-041 |
| `top`（布林） | `el.parentElement` 是 composition root（`[data-composition-id]` 的那一層）或有 class `fill` | FR-041 |
| `title`（布林） | `el.matches('.sc-wcard__bar, .sc-pill, [data-audit-title]')` | FR-042 |
| `pad`、`bw` | computed padding、border-width 四邊（px） | FR-045、FR-047 |
| `lh` | computed line-height（`normal` 時用 1.2×字級） | FR-048 |
| `round`（布林） | 寬高差 ≤ 2 px 而且 `border-radius` ≥ 寬的一半 | FR-047 |
| `own` | 「自己的文字」行框矩形陣列＋巢狀框外框（`OV/PS:L19-21` 的定義；用 `Range.getClientRects()`，行框高度＝行高，上下各加半個 leading） | FR-047 |
| `chars` | 自己的文字的非空白字數 | FR-047（≤ 2 字豁免） |
| `centered`（布林） | `text-align: center` 或（flex 且 `justify-content: center`） | FR-045 |
| `kit`（布林） | `el.matches('.sc-wcard__bar, .sc-pill, .sc-num, .sc-icon')` | FR-047、FR-048、FR-045 |
| `allowOverlap`、`allowSlack`、`allowTight`、`widthShared` | `el.closest('[data-layout-allow-overlap]')` 等 | FR-043、FR-045、FR-047 |
| `parentInnerW` | `offsetParent` 的內寬（扣框與 padding） | FR-045（橫條豁免） |
| `alpha` | 累計 opacity（自己乘到 host） | FR-043 |

現有欄位（`rect`、`inner`、`textRect`、`painted`、`bg`、`moving`…）不改名、不改語意（`audit.test` 既有斷言靠它們）。

### F.2 `collectMotionInPage({ hostId, compId })`（新）

```
tl = window.__timelines[compId]; host = document.getElementById(hostId)
tws = tl.getChildren(true, true, false)
for tw: s = tw.startTime(); for (p = tw.parent; p && p !== tl; p = p.parent) s += p.startTime()
  e = s + tw.totalDuration(); if (e − s ≤ 0.002) continue
  targets = tw.targets().filter(t => t && t.nodeType === 1 && host.contains(t))
  kind = classify(tw, targets)   // FR-051：enter／exit／draw／change
回傳 { D: tl.duration(), marks: (SceneMotion.marks || {})[compId] || [], tweens: [{ start, end, kind, targets: [{ key, desc, chain, emph, box }] }] }
```

- `classify`：`startAt = tw.vars.startAt || {}`；`o0 = startAt.opacity`、`o1 = tw.vars.opacity`；`o0 < 0.2 ≤ o1` → enter；`o0 ≥ 0.2 > o1` → exit；`'strokeDashoffset' in tw.vars` → draw；`clipPath` 起點含 `100%` 而終點是 `inset(0% 0% 0% 0%)` → enter；其他 → change。`tl.to`（沒有 startAt）的 opacity 用 `gsap.getProperty` 在 `tw.startTime()` 前的值判斷不可靠，SM 全部用 `fromTo`，所以只認 fromTo；非 SM 的 `tl.to(…, {opacity})` 一律算 change（檔頭規則本來就要求只用 SM）。
- `emph`（亮起）：`t.offsetParent === t.parentElement` 且 `|offsetLeft|`、`|offsetTop|` ≤ 8、`offsetWidth × offsetHeight ≥ 0.8 × 父元素的` → true。
- `box`：`[offsetLeft, offsetTop, offsetWidth, offsetHeight]` 相對 offsetParent（「替換」比對要用）；`chain`：祖先元素在 host 內的 key 陣列（「併進祖先」要用）。
- `key`：元素在 host 裡的索引路徑字串（`'0/2/1'`），跨呼叫穩定；`desc` 用 AP 既有的 `descOf`（id／class／前 10 字）。

### F.3 量測方法與邊界

- 只跑一次（時間軸建好後），不 seek；`offset*` 是版面值、不受 transform 影響，和當下 seek 到哪裡無關。
- `getChildren(true, true, false)`：含巢狀 timeline 的子 tween、不含 timeline 本身（2026-10-31 在 Node 用 `kit/gsap.min.js` 實測：巢狀 timeline 放在 4.0、子 tween 0.2 → 起點 4.2）。
- `tw.targets()` 是純物件（`tl.set({}, {}, D)` 的 `{}`）→ 濾掉。
- SVG 形狀（`path` 等）沒有 `offsetParent`：draw 類不需要 `emph`／`box`。
- 回傳大小：一段約 30–80 個 tween，JSON < 50 KB。

---

## §G. audit 判定端（`AR`）

### G.1 新常數（`AR` 開頭，和既有常數同一區）

```js
export const TITLE_GAP_MIN = 24, TITLE_GAP_GOAL = 40;   // OV/AW:L77、R8 #6
export const NOWRAP_MIN = 7;                            // OV/SKILL.md:132
export const SLACK_MAX = 80, CENTER_TOL = 8, STRIP_TOL = 16;   // OV/SKILL.md:140；後兩個本線初值
export const VBAL_MAX = 40, CONTENT_TOP = 120;          // OV/AW:L218、R4.1
export const PAD_X = [24, 0.45], PAD_Y = [14, 0.28], LH_MIN = 1.25, LH_SKIP_FONT = 100;   // R8 #6、OV/PS:L27
export const DENSITY_MAX = 2, DENSITY_WIN = 1.0;        // TR/v3:L12-13
export const STAGGER_MIN = 0.12;                        // TR/v3:L12-13
export const HOLD_MIN = 1.2, TAIL_MIN = 1.5;            // 定案
export const MERGE_WIN = 0.3, SWAP_WIN = 0.15, BUSY_GAP = 0.05, STILL_MIN = 0.4, STILL_MAX = 8;   // 本線初值；STILL_MIN 出自 OV/AW:L215
```

### G.2 `judgeLayout(meas, ctx)` → findings

`ctx` 和 `judgeSample` 相同（`item`、`t`、`kind`、`layout`）。`item.type !== 'custom'` → 回 `[]`。只看 `!moving && alpha ≥ 0.05` 的元素。各規則照 spec FR-041–FR-048 的定義實作；矩形一律用 `rect`（含 transform 的畫面座標）。

- `unpositioned`：`top && pos ∉ {absolute, fixed} && 寬高 > 0`。
- `title-overlap`／`title-gap`：每個 `title` 找最近的有底框祖先 C（`constraint` 鏈上第一個 `painted`），候選＝C 的子孫、不是 title 子孫、`(text || painted || media) && !bg`、`rect[1] ≥ title.rect[1]`、水平有交集；`gap = min(rect[1]) − title.rect[3]`。
- `overlap`：候選＝`(painted || media) && !bg && !allowOverlap`；兩兩不是祖孫（用 `parent` 鏈）、交集寬高都 > `TOL`（2）。同一對只報一次（元素對排序後當 key）。
- `nowrap`：`whiteSpace === 'nowrap' && textRect`；C＝自己或最近的 painted 祖先；`m = min(textRect[0] − (C.rect[0] + C.bw[3]), (C.rect[2] − C.bw[1]) − textRect[2])`；`0 ≤ m < 7`；C 已在 `padding` 報過就略過。
- `slack`：候選＝FR-047 定義的文字框、`!kit && !allowSlack && !widthShared`、`寬 < parentInnerW − 16`；`right = (rect[2] − bw[1] − pad[1]) − max(內容右緣)`、`left` 同理；`centered && |right − left| ≤ 8` → 略過；依 `(round(rect[0]), round(寬))` 分組，組內取 `min(right)`；`> 80` → 一則（列出組內元素）。
- `vbalance`：`layout === 'fullscreen'`；聯集＝所有 `(text || painted || media) && !bg` 的可見矩形；`up = top − 120`、`down = 870 − bottom`、`diff = up − down`；`|diff| > 40` → 建議位移 `round((down − up)/2)`。
- `padding`：文字框（`own.length && painted`）、`!round && !kit && chars > 2 && !allowTight`；四邊 `L = own 最左 − (rect[0] + bw[3])` 等；門檻 `x = max(24, 0.45×fontSize)`、`y = max(14, 0.28×fontSize)`；任一邊不夠 → 一則，列出四邊實際值與門檻。
- `line-height`：同上的文字框、`fontSize < 100`；`lh / fontSize < 1.25 && B < y + 4` → 一則。

### G.3 `judgeMotion(motion, ctx)` → findings

`ctx`：`{ item, fadeOut }`；`item.type !== 'custom'` → `[]`。座標轉換：findings 的 `t` 用成片秒數（`item.start + 段內秒數`），方便 `fmtT` 與 snapshot 指令。

1. **新元素**：`enter` 且不 `emph` 的目標，依起點排序；「替換」：同 `parentElement`、`|Δt| ≤ 0.15` 的 `exit` 目標 `box` 重疊 ≥ 50% → 拿掉；「併進祖先」：`chain` 裡有任何已列入的單位、出現時刻差 0 ≤ Δ ≤ 0.3 → 拿掉。
2. **density**：對每個單位 `u`，窗 `[u.t, u.t + 1.0)` 的單位數 `c`；`max c > 2` → 一則（窗起點、元素列表）。
3. **stagger**：排序後相鄰 `0.001 < Δ < 0.12` → 每一對一則（`mergeFindings` 依 rule＋元素合併）。
4. **busy**：所有 tween 的 `[start, end]` 排序合併（間隔 < 0.05 視為連續）。
5. **hold**：`marks` 的 `t` 去重排序、留 `0 < t < D`；`i = 0..n−2`：窗 `[m_i, m_{i+1})`；`first`＝第一個起點 ≥ `m_i − 0.05` 且 < `m_{i+1}` 的忙碌段起點；沒有 → 跳過；在 `[first, m_{i+1})` 裡算靜止區間（忙碌段之間的空檔＋最後一段結束到 `min(下一段起點, m_{i+1})`），最長 < 1.2 → 一則（帶兩個 ref、兩個秒數、最長靜止）。
6. **tail**：`end0 = D − (fadeOut ? 0.5 : 0)`；收尾退場＝`exit` 而且 `end ≥ end0 − 0.05`；有的話 `end0 = min(它們的 start)`；`last = max(end of tween with end ≤ end0 + 0.001 且 start < end0)`；`end0 − last < 1.5` → 一則（缺多少秒）。
7. `marks` 空 → 回 `{ findings, notes: ['沒有 P.at 綁句，完成態停留不檢查'] }`。

### G.4 `stillTimes(motion, item)` → `[{ t, kind: 'still' }]`

忙碌段之間 ≥ 0.4 s 的空檔（含 0 到第一個動作、最後一個動作到 `D − 0.6`），取中點；超過 8 個時取最長的 8 個；和既有 `sampleTimes`（`AR:53-58`）的時刻差 < 0.1 s 的略過（不重複量）。

### G.5 `cueFindings(errors, items)` → `{ findings, warnings }`

`errors` 是 `window.__cueErrors` 的字串陣列（cues.md §4.4）。每則用 `/^(\S+) (P\.(?:at|dur)\(.*?\))：(.*)$/` 拆成 `who`、`call`、`why`；`who` 等於某個 item 的 `id`（段 id）或 `compId`（custom 的 compId＝檔名去 `.html`，`plan.mjs` 現行）就產生 `{ id, label, level: 'error', rule: 'cue', msg: `綁句失敗：${file} 的 ${call}：${why}`, fix }`，fix 依 `why` 的開頭選（cli-003 §2.3 表）；拆不開或對不到的 → `warnings`（`頁面 cue 錯誤：<原文>`）。

### G.6 `customDuration(html)` 加 `autoEnd`

`autoEnd = /P\.end\(\s*\)/.test(inner) || /P\.dur\(\s*\)/.test(inner)`；`AU.durationWarnings` 在 `autoEnd` 時跳過。

### G.7 量測方法與邊界

- 純函式：`audit.test` 每條規則用手寫的 `meas`／`motion` 物件（格式同 F.1、F.2）；數字邊界各測一組（例 gap 23.9 → ⚠、24 → 不報）。
- 同一元素在中點、完成態、靜止取樣都違規：`mergeFindings` 合成一則、時間列在一起（現行行為）。
- 重疊規則的假陽性：box 交疊但看起來有間隙（`OV/AW:L97`「bounding box 重疊不等於視覺重疊」）：訊息的 `→` 寫「看 snapshot；確定是刻意的就加 `data-layout-allow-overlap`」。

---

## §H. audit 流程（`AU`、`AB`）

- `AB.openSession` 回傳的物件加：
  - `motion({ hostId, compId })` → `evaluate(collectMotionInPage, …)`；
  - `cueErrors()` → `evaluate(() => window.__cueErrors || [])`。
  - 兩者都在第一次 `seek` 之後呼叫（HyperFrames 掛載子合成後時間軸才存在）。
- `AU.audit()`（AU:95-163）：
  1. 開 session 後，第一個 job 之前，對每個 custom item 呼叫 `S.motion`，存 `motions[id]`；
  2. `jobs` 加上 `stillTimes(motions[id], it)`；
  3. 每個 job 的量測多跑 `judgeLayout`；
  4. 量完後 `judgeMotion(motions[id], { item: it, fadeOut: it.fadeOut })`、`cueFindings(await S.cueErrors(), pick.list)`；
  5. `findings = [...script, ...cue, ...merge(raw), ...dur, ...motion]`，排序規則不變；
  6. `segments[].samples` 的 `kind` 多 `'still'`，`formatReport` 印「靜止」。
- 檔頭（`--help` 原文）照 cli-003 §1 改：禁入區數字、新規則表、「節奏」一節。
- 結束碼：不變（有 ✖ → 1，否則 0；例外 → 1）。

邊界：
- 舊專案沒有 `window.SceneMotion.marks`（SM 舊版）：`motion.marks` 空 → hold 不判、notes 一行。
- `window.__timelines[compId]` 不存在（script 出錯）：`motion` 回 `null`，節奏規則跳過（script ✖ 已經會報）。
- `--only` 指定的段：照樣只量那幾段。
- `--json`：`findings[].rule` 多新名稱；`segments[].motion`＝`{ units, marks, busy }`（給 004 `qc.mjs storyboard` 參考，選用）。

---

## §I. 預覽頁

### I.1 `tools/lib/custom-preview.mjs`（新，待主代理裁決所有權）

```js
export function buildCustomPreview({ name, html, pipStyle, kitLinks }) → string
```

- 從 `html` 取 `<template id="<name>-template">` 的內容；沒有 → 丟錯 `custom/<name>.html 沒有 <template id="<name>-template">`。
- 頁面骨架照 `lib/main.mjs:236-300` 的 `buildPreview`（舞台、`speaker.jpg` 底、`#pip`、`#pipf`、`fit()`、背景圖 CSS）：`#scene` 裡放 template 內容；`<script>window.__timelines = {};</script>` 放在 template 內容前面；template 內容的 `<script>` 在頁面解析時執行，建好 `window.__timelines[name]`。
- 播放：`var inner = window.__timelines[name]; var D = inner.duration(); var tl = gsap.timeline({ repeat: -1, repeatDelay: 1.2 }); tl.fromTo('#scene, #pip, #pipf', { opacity: 0 }, { opacity: 1, duration: 0.5 }, 0); tl.add(inner.paused(false), 0); tl.to('#scene, #pip, #pipf', { opacity: 0, duration: 0.5 }, D − 0.5);`；`?t=` 停住；`hf-preview-ready`／`hf-preview-replay` 協定同 `buildPreview`（cues 傳 `[]`）。
- `kitLinks` 由呼叫端傳（`main.mjs` 的 `KIT_LINKS`，避免本檔 import 002 的模組）；`pipStyle` 同。
- 不注入 `window.__cues`：`P.at` 走 `data-cues-sample`（FR-005）。

### I.2 `index.html`

- 分頁列（`index.html:172-180`）在 `③ 條列` 後加 `<a href="#custom"><span class="n">④</span>情境動畫</a>`。
- 新 `<section class="block" id="custom">`：說明一段（「第二層情境動畫：從 `shared/template/custom/` 複製改，挑法見 SITUATIONS.md」）＋9 張卡，卡片結構照 `#layout` 現有的卡（`index.html:188-230`：iframe、`a.open`、名稱、說明），說明用 docs.md §4 R7.5 表的「口播在講」欄濃縮成一句、版面標「子母畫面」。
- `#motion` 分頁：刪「進場 0.3–0.5」「露臉 3 秒」，數字照 001 寫進 style.md 的版本（001 還沒寫前先放 docs.md §8 的數字，標「照 style.md〈節奏〉」）。
- `#sfx` 分頁：讀 `preview/sfx-data.js` 的 `sounds`，依 `kind` 分「音效」與「配樂」兩組，名稱用 `zh`、數量用 `Object.keys(...).length` 算，不寫死。

量測：`examples.test` 解析 index.html：`#custom` 裡 9 個 iframe 的 `src` 集合＝`custom/x-*.html` 的檔名集合；`grep` 斷言（FR-063）。

---

## §J. 測試

| 檔 | 新增 | 需要 |
|---|---|---|
| `motion.test.mjs` | A.4：cues.md §6 #1–#13＋本線 E1–E6；`P.end()`／`P.dur()`；B.2 focus 亂序；C.2 type 亂序（DOM shim）；`forEach` 名單 | Node |
| `audit.test.mjs` | 版面 8 條 × 2（違規／過關）；節奏 4 條 × 2；`cueFindings`；`customDuration.autoEnd`；`stillTimes`；`--help` 數字；瀏覽器實量 1 支 fixture（同時有 static 子層、標題壓內容、stagger 0.1、hold 0.6） | Node；瀏覽器那支要 Chrome＋runtime（沒有就 skip，同現行 `audit.test.mjs:288`） |
| `examples.test.mjs` | 9 支結構；sample 與 D 下限；句號區段；index.html 對應；`buildCustomPreview`；整合（9 支登記成一個暫存專案 → `--check` → build → audit → 亂序 snapshot） | 結構只要 Node；整合要 ffmpeg（`testsrc2`）、Chrome、HyperFrames runtime，缺一就 skip 並印原因 |
| `icons.test.mjs` | 新 5 支的 svg 都在 icons.json | Node |
| `helpers.mjs`（只加） | `makeDomShim()`、`makeCustomProject({ examples, gap = 1.0 })`（產生 rough.mp4、rough.srt、plan.json，回傳專案路徑與每段的成片起點） | |

整合測試的 rough.srt 產生法：每支範例依序排，段起點 `S_k`＝前一段終點＋1.0 s；sample 的每個 `cues[N]` → 一則字幕，起訖＝`S_k + 起`、`S_k + 迄`；`refs` 裡有 `#N@詞` 的句子，文字以那個詞開頭（例 `匯出設定檔`），其他句子用固定填空文字；段的第一句另補一則從 `S_k` 開始、到第一個綁句點 − 0.3 的字幕當 `from`（句號＝區段第一號，例 x-process 的 #11），最後一個綁句的那則字幕，迄改成 `S_k + D`，plan 的 `to` 寫 `#<那一句>e`。句號在區段內遞增、可以跳號（`lib/srt.mjs` 的 `parseSrt` 保留原句號）。

---

## §K. 風險與對策

| 風險 | 對策 |
|---|---|
| 002 改 cues.md（例如不收本線補充） | 依賴格式的只有 A.1 找段那幾行、`readSample` 與 `pushErr`，跟著改＋A.4 向量 |
| HyperFrames 重新執行子合成 script（例如 Studio 熱重載）讓 `__cueErrors` 重複 | `pushErr` 同一則字串只推一次 |
| 「亮起」「替換」分類漏判，範例被報 density | 整合測試 SC-002 要求範例 0 ⚠；漏判就調 8 px／80%／0.15 s／50% 四個初值（都在 `AR` 常數） |
| 9 支範例整合測試太慢 | FR-074 上限 120 s；超過就把 snapshot 比對縮成每支 1 個時刻 |
| 新 ⚠ 太多讓 AI 忽略 | 先跑 SC-004 存一份「改寫前」報告；007 的 `dev/loop` 看弱模型怎麼處理，再決定要不要升 ✖（待裁決第 5 條） |
