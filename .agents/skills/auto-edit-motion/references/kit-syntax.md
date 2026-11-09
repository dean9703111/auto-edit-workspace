# kit 的 `P.*` 語法速查

給手改模板動畫（`x-<模板>-<段>.html`）用，以及對照 `shared/template/BEATS.md` §2 語彙表「對應」欄的 `P.*`。內容設計動畫（`x-design-<段>.html`）照 hyperframes skill 直接寫 GSAP，不用這份；要用也可以，兩種寫法可以混在同一個檔。

不用去讀 `kit/scene-motion.js`。`sel` 是選擇器字串，`at` 是段內秒數（`const T1 = P.at('#13@跑到')`），大括號都是選填。

| 動態 | 寫法 |
|---|---|
| 擦開、擦掉 | `P.wipe(sel, at, {dir, dur})`（dir：left、right、up、down）、`P.wipeOut(sel, at, {dir})` |
| 滑入 | `P.drift(sel, at, {dx, dur, stagger})`（dx 預設 16，左側元件寫 -16） |
| 彈出、錯拍彈出 | `P.pop(sel, at, {from, dy, to, dur, stagger})`（to 是落地亮度，預設 1） |
| 長出 | `P.grow(sel, at)`（卡片要固定寬高） |
| 抽屜 | `P.slide(sel, at, {from})`、`P.slideOut(sel, at, {to})`（外層 overflow:hidden） |
| 淡入、淡出、換內容 | `P.in(sel, at, {dur, stagger})`、`P.out(sel, at)`、`P.swap(舊, 新, at)` |
| 逐字 | `P.chars(sel, at, {mode, stagger})`（mode：rise、pop、drop） |
| 打字 | `P.type(sel, at, {cps})` |
| 數字滾動 | `P.count(sel, at, {from, to, dur, prefix, suffix, ease})`（一格一格跳寫 `ease: 'none'`） |
| 描線 | 整個插圖畫出來 `P.draw(sel, at, {dur})`；單一線條 `P.stroke(sel, at, {dur, stagger})` |
| 彗星描線 | `P.comet(線, at, {dur})`（描完是實線；沒有 stagger，錯拍就分開呼叫） |
| 圖示描線、描圈打勾 | `P.icon(圖示容器, at)`、`P.check(圖示容器, at)`（圖示用 circle-check；最短 0.55 秒） |
| 劃掉、量條 | `P.strike(sel, at, {wave})`、`P.bar(sel, at, {from, to})` |
| 光澤、螢光筆 | `P.sheen(sel, at)`（元素要 overflow:hidden）、`P.marker(sel, at)` |
| 重拍、漣漪 | `P.punch(sel, at)`、`P.ripple(sel, at, {to})`（to 是元素大小的倍數，預設 2.1） |
| 蓋章 | `P.stamp(sel, at, {on})`：印章 `class="sc-stamp"`，on 是被蓋的元素，兩者是兄弟 |
| 聚焦、回均衡、預覽態 | `P.spot(ALL, sel, at, {scale, lift, dim, done})`、`P.spot(ALL, null, at)`、`P.spot(ALL, 'none', at)`（ALL 是選擇器字串，只放已經進場的元素；新進場的元素 0.6 秒後才聚焦） |
| 退焦 | `P.dim(sel, at, {to})`（`{to: 1}` 回來） |
| 鏡頭 | 慢推 `P.cam('#xd<段 id>-group', T1 + 1.7, {scale: 1.04})`；跟焦點 `P.cam('#xd<段 id>-group', T3 - 0.2, {to: '#xd<段 id>-s3', k: 0.12})`；回正 `P.cam('#xd<段 id>-group', T5, {x: 0, y: 0, scale: 1})`。sel 只能是沒有底色、框線、陰影的群組 |
| 游標移動 | `P.morph(sel, at, {left, top}, {from: {left, top}, dur})`（一定要帶 from，下一次的 from＝這次的終點）；沿線走 `P.along(sel, 線, at, {from, to, dur})` |
| 換插圖狀態 | `P.swap('#a .il-qr', '#a .il-content', T1)`（class 是 `.il-<狀態>`，video 是 `.il-content`） |

**進場前藏起來**：`P.*` 的進場會在這個元素第一個動作之前先把它藏好。程式照時間先後寫，進場那行寫在它的聚焦、退焦、淡出前面；有底或有框的盒子對盒子本身做進場；只做強調（螢光筆、重拍、光澤、漣漪）或數字滾動的元素開場就看得到，要晚出現就先加一行 `P.in`。不要用 CSS `opacity: 0` 藏，擦開、抽屜、逐字、描線不會把它調回來。

**版面宣告**（模板檔大多用這個）：有 `data-layout="row|col|cols-2|grid-2x2"` 的容器會把每個 `data-slot` 改成 `position:absolute`，再寫上它算好的 left、top，class 或 style 寫的位置都會被蓋掉；`data-layout="free"` 不排，裡面自己寫 `position:absolute`、left、top。連接線 `<svg data-links="xdID-a>xdID-b" xmlns="http://www.w3.org/2000/svg"></svg>`。
