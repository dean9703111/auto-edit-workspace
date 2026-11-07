/* ==========================================================================
   動畫情境庫 動態 API（scene-motion.js）— window.SceneMotion
   定調（v2，specs/010-motion-v2/design-system.md §0、§3）：動態的單位是「拍」——每個綁句點一拍：進場（≤ 0.6s、錯拍）→ 強調（0.2s，過衝或光）
   → 其他元素退焦 → 一顆音效；拍與拍之間停在完成態，不加微動（背景、圖示、卡片、虛線都不動）；同一時間只有一個焦點。
   曲線統一：進場 expo.out、強調 back.out、移動 power3.inOut、轉場 expo.inOut、退場 power2.in（比進場快）。過衝只用在強調拍。
   v1 的 in／out／rise／reveal 等仍可用（舊模板與第一層字卡），新寫的情境動畫用下面「v2」那一節。

   用法（段內，GSAP 之後載入）：
     const tl = gsap.timeline({ paused: true });
     const P = SceneMotion(tl);
     P.reveal('#gCard', 0);                       // 下方字卡外殼：遮罩由左往右揭開
     P.rise('#gCard .sc-lt__body', 0.15);        // 內容：淡入＋上漂 8
     P.out('#gCard', D - P.OUT).end(D);           // 整組淡出 0.3
     window.__timelines["seg06"] = tl;

   API（全部 seek-safe：只往 paused timeline 加 fromTo，絕對值、無隨機、無 repeat）
     P.in(sel, at, {dur, stagger})   淡入 opacity 0→1，IN 0.5s、sine.out；stagger＝同組依序間隔
     P.out(sel, at, {dur, stagger})  淡出 opacity 1→0，OUT 0.3s、sine.in（所有情境的離場；v2 退場比進場快，design-system.md §3）
     P.swap(outSel, inSel, at, {dur})原地交叉淡化：同一時間 out（0.3）＋ in（0.5）——同位置換內容、沒有順序（全畫面子版型）
     P.sideIn(sel, at)               側邊欄面板 x −960 → 0，PUSH 0.7s、ease＝P.pushEase
     P.sideOut(sel, at)              側邊欄面板 x 0 → −960，同上
     P.pushEase(p)                   與 tools/side_shift.py 相同的 9 點（steps=8）easeInOutSine 分段線性曲線：
                                     e_i ＝ −(cos(π·i/8) − 1)/2，i＝0..8，點間線性。剪映只能寫線性關鍵影格，兩邊用同一組點才逐格一致
     P.end(dur)                      把時間軸撐到 dur 秒（最後一個 tween 早於段長時必加，pitfalls §41）
     ── 綁句（第二層 custom 用；照 specs/contracts/cues.md v1）──
     P.at(ref, off)                  回傳這一句（或這個詞）在本段的秒數，不建立 tween。ref：'#18'＝那句開頭、'#18e'＝結尾、
                                     '#18-0.3'／'#18+0.3'＝前後幾秒、'#18@詞'＝講到那個詞（要寫成字串字面值，build 才算得到）、數字＝直接當秒數。
                                     off＝再往後幾秒（預設 0），結果小於 0 回 0。build 注入 window.__cues；直接開檔時讀 root 的 data-cues-sample
                                     （{"start":0,"D":秒數,"cues":{"18":[起,迄]},"refs":{"#18@詞":秒數}}）。找不到句子／詞／這段時回 max(0, off)，
                                     並在 window.__cueErrors 記一則（--check 與 audit 會 ✖），不丟錯
     P.dur()                         這段的長度（build 注入的段長 → data-cues-sample 的 D → root 的 data-duration）
     P.end()                         不帶參數＝P.end(P.dur())：長度自動等於 plan.json 這段的長度
     P.marks                         這個 P 每次 P.at 的 {ref, t}（audit 用來切拍；也放在 window.SceneMotion.marks[comp id]）
     ── 聚焦與打字 ──
     P.focus(group, active, at, {dim, dur, ring})  一組裡只亮一個：active 亮度 1、其他降到 dim（預設 0.4）；0.4s、sine.inOut。
                                     ring＝每個元素裡亮框的選擇器（例 '.xwarn-on'）：active 的框淡入、其他淡出（框第一次被碰到時先設成 0，
                                     CSS 不用先藏）。active 寫 null＝全部恢復亮度 1、框全滅。要照時間先後寫，而且每個元素要先進場。
                                     被 focus 過的元素之後 P.out／swap／axis 從目前亮度（例 0.4）淡出，不會先跳回 1。不補間顏色
     P.type(sel, at, {cps, dur, caret})  打字：文字逐字出現（自訂 plugin scType，seek-safe）。未打的字用 visibility:hidden 佔位，
                                     框的大小與換行一開始就是打完的樣子。<br>、關鍵詞 <span> 原樣保留；空白跟著後面那個字出現。
                                     dur 預設＝字數 ÷ cps（cps 預設 8.5 字／秒）、等速。caret（預設 true）：已打最後一個字後面一條
                                     淨寬 0 的游標，打完消失、不閃。打字的文字不要放 emoji

     ── v2 進場（依元件性質選；完成態一律 x／y＝0、clip 全開，回到整數 px 設計位置）──
     P.drift(sel, at, {dx, dur, stagger})  貼邊元件：從所貼的那一側小幅滑入＋淡入。dx 預設 +16（右側元件從右來）；
                                     左側元件傳 {dx: -16}。0.5s power2.out
     P.reveal(sel, at, {dur})        浮動卡外殼：clip-path inset 由左往右揭開＋淡入，卡本身不動。0.55s power2.out
                                     （sel 的盒子要包住所有可見層——.sc-lt 的外框盒本來就是聯集）
     P.rise(sel, at, {dy, dur, stagger})   內容／第二層新訊息：淡入＋上漂。dy 預設 8，0.5s power2.out
     P.maskUp(sel, at, {dur, stagger})     標題字：字從自己盒子的下緣「看不見的線」浮出（yPercent 100→0，
                                     同步把 clip-path 底部 100%→0%，視窗固定在完成位置），外框不動。0.6s power2.out
                                     sel 要是 block／flex item（inline 元素吃不到 transform）
     P.axis(outSel, inSel, at, {dur, dx, lag})  同位置換內容、有順序（Step 1→2、標題條列換條）：
                                     舊的往左淡出 12、新的從右淡入 12；0.45s power2.out，新的晚 0.1
     ── 圖示描線（作者規則「圖示先行」：圖示是這一拍的主角時，把線描出來，取代單純淡入）──
     P.stroke(sel, at, {dur, stagger, keepDash})  sel＝形狀元素（path／circle／rect／line…；build 貼的圖示已帶 class="stroke-draw" pathLength="1"，
                                     自己貼的 svg 沒有 pathLength 會自動補上）。
                                     strokeDashoffset 1→0，0.7s power2.inOut；stagger＝多個形狀依序描。起點另有 0.001s 的 opacity 0→1
                                     （round 線頭的零長度虛線會在起點留一個圓點）。描完那一拍 strokeDasharray 設回 none：Chrome 依 pathLength
                                     換算的虛線比實際路徑短一點，不設回去弧線終點會留缺口（作者：「最後一筆沒有閉環」）。之後還要反向擦掉的線帶 keepDash
     P.icon(sel, at, {dur, stagger})  sel＝圖示的容器（.sc-icon 或任何包住 <svg> 的元素）：每個容器的所有線同時描，多個容器依 stagger 錯開
                                     （stagger 預設 0＝一起描）。容器本身（圖示圓）先用 rise／in 進場，P.BEAT 後再描線
     P.check(sel, at, {dur})          圓環＋打勾：sel＝圖示容器（圖示用 circle-check 這類「圓＋勾」）。圓先描，勾晚 0.25s 描。
                                     只用在總結、回顧清單這種「完成／確認」的語意；流程圖的站不要用（作者：走過只換框色，不加打勾）
     ── v3 情境動畫語彙（第二層 custom 用；作者 hf-motion.js 的 morph／push／count／bar 對應版，同樣 seek-safe）──
     P.morph(sel, at, to, {from, dur, ease})  同一個容器變形：寬高或位置（width／height／left／top…任何數值屬性）從 from 補間到 to。
                                     0.7s、power2.inOut（不過衝；要彈一下自己傳 ease）。to 例 {width: 1100, height: 420}。要能往回 seek 就帶 from；
                                     連續多次變形時，後一次的 from 寫成前一次的 to。沒帶 from 時以「建立當下的值」當起點（只有第一次變形安全）
     P.push(sel, at, {to, from, origin, dur, ease})  慢速鏡頭推進：scale from→to（預設 1→1.4）、origin 預設 "50% 50%"、2.4s、sine.inOut。
                                     只用在全畫面；被縮放的元素（含祖先）不要設 will-change（文字會糊）；tween 已帶 force3D:false。
                                     推進後的座標＝origin＋scale×(靜止座標−origin)，要自己算有沒有出界（右緣 ≤ 1300 的全畫面主內容尤其注意）
     P.count(sel, at, {from, to, dur, decimals, prefix, suffix, comma, ease})  數字計數器：自訂 GSAP plugin（scCount）每次 render 直接寫元素的 textContent
                                     （不靠 onUpdate／proxy：HyperFrames 有的 seek 路徑 suppressEvents＝true，callback 不會跑）。
                                     預設 0→100、1.2s、power2.out；起點之前顯示 from、終點之後顯示 to，往回 seek 也對。
                                     自動加 font-variant-numeric: tabular-nums，數字寬度固定不抖；元素要放得下最寬的那個值（固定寬度＋置右／置中）
     P.bar(sel, at, {from, to, dur, ease})  量條長度：scaleX from→to（預設 0→1）、transform-origin 左緣、0.8s power2.out。
                                     to 可以大於 1＝「撐破」軌道（要讓條超出軌道，軌道不能 overflow:hidden）。條的圓角用小值（scaleX 會把圓角拉橫）
     ── v2（design-system.md §11；契約 specs/contracts/motion.md）。位移、振幅用 u（＝畫布短邊／1080，橫式直式都是 1）；字的位移用 em；
        位置用區域名（P.region(name)：band／panelTop／pip／badge／captions／safe／full，window.__regions 蓋過橫式預設；
        root 是 1920×1080 的子合成（data-width > data-height）在直式被舞台縮放＝STAGED：座標還是橫式，不讀 window.__regions）。
        新原語用 root.querySelectorAll 選元素，不必加進 $q 包裝清單 ──
     P.chars(sel, at, {mode, stagger, dy, dur})  逐字：拆成 inline-block 的 span[data-sc-ch]（中文一字一格，英文單字、數字整個一格）後錯拍進場。mode 'rise'（上浮 0.6em、0.6s expo.out、間隔 0.03）
                                     ／'pop'（縮放 0.3→1＋上移 0.4em、back.out(1.8)、間隔 0.035）／'drop'（由上落下 0.55em、back.out(1.4)、間隔 0.045）
     P.wipe(sel, at, {dir, dur, stagger})   擦開：clip-path 由 dir（left／right／up／down）一側揭開，0.5s expo.out；四邊外擴 20% 不切落影與底板
     P.wipeOut(sel, at, {dir, dur})  擦掉：反向，0.3s power2.in（比進場快）
     P.slide(sel, at, {from, dur})   抽屜抽出：從自己盒子的一側（xPercent／yPercent ±100）整個滑進來；外層要 overflow:hidden
     P.slideOut(sel, at, {to, dur})  抽屜收回：0.28s power2.in
     P.pop(sel, at, {from, dy, to, dur, stagger, ease})  彈出：縮放 from（0.82）→1＋上移 dy（28u）＋淡入到 to（1），back.out(1.6) 過衝落地
     P.punch(sel, at, {scale, dur})  重拍：0.12s 放大到 scale（1.06）再 0.45s 回彈（不和 spot／cam 用在同一元素）
     P.dim(sel, at, {to, dur})       退焦：亮度到 to（0.6），0.4s sine.inOut；{to: 1} 回來（記住目前亮度）
     P.marker(sel, at, {dur})        螢光筆：字後 40% 高的主色帶由左掃過（自動插 .sc-mk）
     P.strike(sel, at, {dim, dur, wave})  劃掉：一條線由左劃過文字（自動插 .sc-strike，0.35s）不擦回；劃完文字壓暗到 dim（0.5；false＝不壓暗）。
                                     wave: true＝手寫波浪線（0.45s）：劃掉人的建議、舊習慣用波浪；數字、價格用直線
     P.stamp(sel, at, {rot, from, dur, on, dim})  蓋章：sel＝寫好的印章元素（class="sc-stamp"，2–4 字），從 from（1.5）倍、多轉 12° 砸到 rot（−8°），
                                     0.22s power4.in，落地壓 0.96 再回 1；on＝被蓋的元素，落地那一刻退焦到 dim（0.55）。印章和被蓋的元素是兄弟（不要放在它裡面，
                                     不然跟著退焦）；自動加 data-layout-allow-overlap（印章本來就疊在東西上）
     P.sheen(sel, at, {dur})         光澤：一道斜光 0.7s 掃過（自動插 .sc-sheen；元素要 overflow:hidden）
     P.ripple(sel, at, {rings, from, to, dur})  漣漪：從元素中心擴散 rings（2）圈，大小 from（0.9）→to（2.1）倍，0.9s
     P.comet(path, at, {dur, ease, r, keepDash})  彗星描線：描線＋前端發光頭（半徑 r＝9u）沿路徑走，到站 0.3s 淡掉；0.8s power2.inOut
     P.flow(sel, at, {speed, until})  虛線流動（模板不再使用，只為舊檔保留）：stroke-dashoffset 等速往前（speed 24u／s）到 until（預設段尾）；dasharray 由 CSS 給
     P.idle(sel, at, {scale, period, phase, ramp, until})  呼吸（只給「等待中」的狀態，例對話的打字小點；停留畫面不用）（scale 比例，例 0.04＝±4 %；period 3.2s），頭尾 ramp（0.8s）漸入漸出；
                                     寫 CSS scale，不干擾進場位移。只給圖示、進度頭、數字；同一元素只掛一個。不做漂浮（卡片、焦點落定後不動）：
                                     y、x 不動作，沒寫 scale 就整個不做
     P.spot(group, active, at, {scale, lift, dim, done, dur})  焦點 v2：active 放大 scale（1.07）＋抬起 lift（−10u）＋亮框發光（自動插 .sc-spot），
                                     其他壓暗到 dim（0.42）縮到 0.96；active＝null 回均衡、'none'＝預覽態（全部壓暗）；done＝走過的（0.92、不縮）。
                                     group 只放已經進場的元素；照時間先後寫（上一個 spot 還在轉場就接在它後面）；新進場的元素 0.6s 後才 spot
     P.cam(sel, at, {to, k, scale, x, y, dur, ease})  鏡頭：容器推拉搖（x、y 用 u），或 {to: 焦點元素, k: 0.12}＝往焦點帶 k 比例；1.0s power3.inOut。
                                     底版不動：有底色、框線或陰影的容器（主卡、視窗）不推（推了會撞右上角的角標），只推沒有底的內容群組。
                                     dur ≥ 2s 的慢推算微動；回正寫 P.cam(sel, at, {x: 0, y: 0, scale: 1})。
                                     直式舞台縮放（STAGED）時 {to} 不往焦點帶，以容器上緣中點為原點推近（主卡推近 1.04 仍在畫面裡）
     P.grow(sel, at, {from, dur, ease})  長出：卡片從區域 from（預設 'pip'，或 [x, y, w, h]）長成自己的大小，0.8s expo.out；卡片要固定寬高
     ── 015（specs/015-scene-styles/brief.md）白板、傳送、紙膠帶、聲紋、載入 ──
     P.draw(sel, at, {dur, pen})     馬克筆畫出：sel（插圖容器、svg 或單一形狀）裡的每一筆照文件順序依序畫出，筆尖（自動插 .sc-pen）跟著線頭走，
                                     畫完 0.25s 內抬筆離開；有填色的形狀在自己那一筆畫完後 0.25s 補上填色，只有填色的形狀輪到時淡入，<text> 最後淡入。
                                     狀態群組（style="opacity:0"）裡的形狀不畫。dur 預設依總線長 0.6–1.6s；pen: false＝不顯示筆。
                                     插圖用 P.draw 進場就不要再 P.pop 同一個元件（畫出來就是進場）
     P.along(sel, path, at, {dur, from, to, ease})  沿線移動：元素中心沿 path（svg 線；data-links 產生的線也行）從線長比例 from 走到 to
                                     （預設 0→1、1.0s power3.inOut），寫 CSS translate、停在終點；再走下一段就再呼叫一次，from 寫上一次的 to
     P.fly(path, at, {dur, size})    紙飛機：沿線飛過去（1.1s power2.inOut），身後留虛線尾跡（線本體藏起來，尾跡留在畫面上），到站 0.3s 淡掉
     P.tape(sel, at, {rot, dur})     紙膠帶：卡片從 1.05 倍、多轉 3° 落到 rot（−2°）貼平（0.35s），接著兩條膠帶（自動插 .sc-tape）依序啪地貼上兩個上角；
                                     卡片不要 overflow:hidden（膠帶要露出卡外）
     P.hinge(sel, at, {from, origin, dur, stagger})  翻起來：元件以底邊為軸從平躺（rotationX −90°）翻起站好（0.6s back.out，透視 900）；
                                     origin 預設 '50% 100%'（底邊），翻下來寫 {from: 90, origin: '50% 0%'}（頂邊）。台座、新聞卡用
     P.wave(sel, at, {until, amp, bars})  聲紋：容器裡的 .sc-wave__bar（沒有就自動插 bars 根，預設照容器寬每 14px 一根）跟著時間起伏到 until（預設段尾），
                                     頭尾 0.3s 漸入漸出、固定種子（任何時間點畫面一樣）；amp 0–1 調幅度
     P.spin(sel, at, {until, period})  載入圈：等速轉（period 0.9s 一圈）到 until（預設段尾）；之後接 P.out 收掉、換成勾
     P.sfx(name, ref, off)           音效拍點：回傳 P.at(ref, off) 的秒數，並登記 {name, ref, off, t}（P.sfxCues、window.SceneMotion.sfx[comp id]）；
                                     ref 寫成字串字面值（例 const T1 = P.sfx('success', '#38@兩支')），build 靜態解析出 <audio>（motion.md §3）
     P.prev()                        前一段是什麼：'speaker'｜'fullscreen'｜'pip'（data-prev → __cues.segs[id].prev；單獨開檔＝'speaker'）。
                                     custom 開場：const ENTER = P.prev() === 'fullscreen' ? 'swap' : 'grow'（手寫 'grow'／'swap' 也可以）
     P.V2                            時間與曲線表：IN 0.5／SHELL 0.6／EMPH 0.2／OUT 0.3／MOVE 1.0／GROUP 0.12；CH 逐字間隔；EASE.in／emph／move／tx／out／idle
   常數：P.IN 0.5／P.OUT 0.3（＝P.V2.OUT）／P.STEP 0.35／P.HOLD 0.6／P.PUSH 0.7／P.SHIFT 480／P.SIDE 960
         P.DRIFT 16／P.RISE 8／P.AXIS 12／P.REVEAL 0.55／P.MASK 0.6／P.AXIS_DUR 0.45／P.AXIS_LAG 0.1
         P.STROKE 0.7（描線）／P.CHECK_LAG 0.25（打勾晚圓環多久）
         P.MORPH 0.7／P.ZOOM 2.4（鏡頭推進）／P.COUNT 1.2／P.BAR 0.8
         P.BEAT 0.15（外殼 → 內容）／P.READ 1.2（問句可讀後再停）／P.HOLD_END 1.5（最後完整內容最少停留）

   整數 px：SceneMotion(tl, root?) 會在字型載入後（傳 root 時只量 root 內的元素）把 .sc-lt__card、.sc-chtag__name、.sc-sectag、頭銜、[data-snap-width] 的寬度用右內距補成偶數整數 px
   （max-content 的字寬是小數，卡的右緣／右錨定角標的左緣會落在半像素）。v1 class 不受影響。

   seek-safe 的細節：同一元素第一次被 tween 的屬性用 immediateRender:true（進場前就是初始狀態），
   一個 tween 同時動多個屬性時，只有「每個屬性都是第一次」才 immediateRender；之後同一元素、同一屬性的 tween
   一律 immediateRender:false（pitfalls §22：第二段 fromTo 若 immediateRender 會在建立時把第一段的初始狀態蓋掉）。
   由本檔自動判斷，不必手寫。at 一律是秒數（數字）；要對到字幕句就用 P.at('#句號') 算出來。
   ========================================================================== */
(function () {
  var KNOTS = 8;
  var E = [];
  for (var i = 0; i <= KNOTS; i++) E.push(-(Math.cos(Math.PI * i / KNOTS) - 1) / 2);

  function pushEase(p) {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    var x = p * KNOTS, k = Math.floor(x);
    return E[k] + (E[k + 1] - E[k]) * (x - k);
  }

  // v2 整數 px：字寬是小數，width:max-content 的卡會讓「右緣」（左錨定）或「左緣」（右錨定／置中）落在半像素，直邊與框線發糊。
  // 字型載入後把 v2 元件的寬度補成偶數整數 px（偶數 → 置中時左右緣也是整數）。只動 v2 class 與標了 data-snap-width 的元素；
  // document.fonts.ready 的回呼在 render／audit／shots 等它之前就先執行，seek 前版面已定。
  var SNAP_SEL = '.sc-lt__metaitem > span, .sc-lt__card, .sc-chtag__name, .sc-sectag, [data-snap-width]';
  // 每個範圍只量一次：傳了 root 就只量 root 內的元素（子合成陸續掛上，各自量自己的卡）；
  // 沒傳 root 時範圍是整份 document，只跑一次，和原本的全域旗標行為相同。
  var snapped = new WeakSet();
  function snapWidths(root) {
    var scope = root || document;
    if (snapped.has(scope)) return; snapped.add(scope);
    var run = function () {
      // 反向文件順序＝先子後父：內層補完寬度，外層（卡）再量，才不會被撐出內距。
      // 補的是內距（不寫死 width）：元素仍是 max-content，audit 不會把它當成「固定寬度＋nowrap」。
      Array.prototype.slice.call(scope.querySelectorAll(SNAP_SEL)).reverse().forEach(function (el) {
        el.style.paddingLeft = ''; el.style.paddingRight = '';
        var cs = getComputedStyle(el), w = parseFloat(cs.width);
        var pl = parseFloat(cs.paddingLeft) || 0, pr = parseFloat(cs.paddingRight) || 0;
        // 量版面寬（計算樣式），不用 getBoundingClientRect：祖先這時可能停在進場的縮放（彈出 0.7、長出），量到的是縮放後的寬
        if (!/px$/.test(cs.width)) w = el.getBoundingClientRect().width;   // inline 元素沒有計算寬度
        else if (cs.boxSizing !== 'border-box') w += pl + pr + (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0);
        var d = Math.ceil(w / 2 - 0.001) * 2 - w;
        if (d < 0.001) return;
        if (el.matches('.sc-lt__metaitem > span')) { el.style.paddingLeft = (pl + d / 2) + 'px'; el.style.paddingRight = (pr + d / 2) + 'px'; }
        else el.style.paddingRight = (pr + d) + 'px';   // 右側補：左錨定的卡內容線不動
      });
    };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(run); else run();
  }

  // 數字計數 plugin（P.count 用）：值＝{from, to, decimals, comma, prefix, suffix}；render(ratio) 依緩動後的進度算出數字寫進 textContent
  var fmtCount = function (v, c) {
    var s = Number(v).toFixed(c.decimals);
    if (c.comma) { var p = s.split('.'); p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ','); s = p.join('.'); }
    return c.prefix + s + c.suffix;
  };
  var registerCount = function () {
    if (typeof gsap === 'undefined' || gsap.plugins.scCount) return;
    gsap.registerPlugin({
      name: 'scCount',
      init: function (target, value) { this.t = target; this.c = value; },
      render: function (ratio, data) { data.t.textContent = fmtCount(data.c.from + (data.c.to - data.c.from) * ratio, data.c); }
    });
  };

  // 打字 plugin（P.type 用）：第一次把元素裡每個非空白文字節點換成「已打」＋「未打」兩個 span（未打 visibility:hidden 佔位，
  // 版面不變），render(ratio) 依 k＝floor(ratio×N) 把前 k 個非空白字搬到已打。只用 FR-019 列的 DOM API（測試 shim 照同一份）。
  var NONWS = /\S/;
  var CARET_CSS = 'display:inline-block;width:0;height:0.9em;vertical-align:-0.1em;border-left:4px solid currentColor;margin-left:-4px';
  function prepType(el, caret) {
    if (el.__scType) return el.__scType;
    var doc = el.ownerDocument, units = [], n = 0;
    var walk = function (node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (c) {
        if (c.nodeType === 1) { walk(c); return; }
        if (c.nodeType !== 3 || !NONWS.test(c.nodeValue)) return;
        var txt = c.nodeValue, idx = [], pos = 0;
        Array.from(txt).forEach(function (ch) { pos += ch.length; if (NONWS.test(ch)) idx.push(pos); });
        var on = doc.createElement('span'), off = doc.createElement('span');
        on.setAttribute('data-sc-on', ''); off.setAttribute('data-sc-off', ''); off.style.cssText = 'visibility:hidden';
        off.textContent = txt;
        node.insertBefore(on, c); node.insertBefore(off, c); node.removeChild(c);
        units.push({ on: on, off: off, s: txt, idx: idx }); n += idx.length;
      });
    };
    walk(el);
    el.setAttribute('data-sc-type', String(n));
    var u = { units: units, n: n, caret: null };
    if (caret && units.length) {
      u.caret = doc.createElement('span');
      u.caret.setAttribute('data-sc-caret', ''); u.caret.setAttribute('aria-hidden', 'true'); u.caret.style.cssText = CARET_CSS;
    }
    el.__scType = u;
    return u;
  }
  function paintType(u, ratio) {
    if (!u.n) return;
    var k = Math.floor(ratio * u.n + 1e-6), left = k, at = u.units[0];
    u.units.forEach(function (x) {
      var j = Math.max(0, Math.min(left, x.idx.length)), cut = j === 0 ? 0 : j === x.idx.length ? x.s.length : x.idx[j - 1];
      x.on.textContent = x.s.slice(0, cut); x.off.textContent = x.s.slice(cut);
      if (j > 0) at = x;
      left -= j;
    });
    if (!u.caret) return;
    at.off.parentNode.insertBefore(u.caret, at.off);   // 已打最後一個字的後面（k＝0 時在第一個字前面）
    u.caret.style.cssText = ratio >= 1 ? CARET_CSS + ';display:none' : CARET_CSS;
  }
  // v2 純函式外掛（P.ripple／comet／grow／sheen／idle）：補間值是 FNS 的編號（GSAP 會把 vars 裡的函式當 function-based value 先呼叫）
  var FNS = [];
  var registerFn = function () {
    if (typeof gsap === 'undefined' || gsap.plugins.scFn) return;
    gsap.registerPlugin({
      name: 'scFn',
      init: function (target, v) { this.t = target; this.f = FNS[v]; },
      render: function (ratio, data) { if (data.f) data.f(data.t, ratio); }
    });
  };
  // v2 時間與曲線表（design-system.md §3；模板只引用名稱）
  var V2C = {
    IN: 0.5, SHELL: 0.6, EMPH: 0.2, OUT: 0.3, MOVE: 1.0, GROUP: 0.12, REST: 1.0001,
    CH: { rise: 0.03, pop: 0.035, drop: 0.045 },
    CHAR_DY: { rise: 0.6, pop: 0.4, drop: 0.55 },
    EASE: { in: 'expo.out', emph: 'back.out(1.8)', move: 'power3.inOut', tx: 'expo.inOut', out: 'power2.in', idle: 'sine.out' },
    CLIP: { left: 'inset(-20% 100% -20% -20%)', right: 'inset(-20% -20% -20% 100%)', up: 'inset(100% -20% -20% -20%)', down: 'inset(-20% -20% 100% -20%)', open: 'inset(-20% -20% -20% -20%)' }
  };
  // 具名區域的橫式預設 [x, y, w, h]（design-system.md §2）；直式由 009 的 canvas.mjs 注入 window.__regions 蓋過
  var REGIONS = { band: [120, 600, 1680, 260], panelTop: [120, 150, 1180, 708], pip: [1424, 594, 432, 324], badge: [1560, 40, 320, 100], captions: [0, 920, 1920, 160], safe: [96, 54, 1728, 972], full: [120, 40, 1680, 860] };
  var CALLS = { n: 0 };
  var ROLE = { idle: 'micro', flow: 'micro', end: 'micro', wave: 'micro', spin: 'micro', spot: 'focus', focus: 'focus', dim: 'focus', cam: 'focus', ripple: 'accent', sheen: 'accent', punch: 'accent', marker: 'accent', stamp: 'accent' };
  var registerType = function () {
    if (typeof gsap === 'undefined' || gsap.plugins.scType) return;
    gsap.registerPlugin({
      name: 'scType',
      init: function (target) { this.u = target.__scType; },
      render: function (ratio, data) { if (data.u) paintType(data.u, ratio); }
    });
  };

  // 綁句（cues.md v1 §4）：時間取到毫秒，免得 0.30000000000000004 讓截圖時刻對不齊
  var r3 = function (n) { return Math.round(n * 1000) / 1000; };
  var r2 = function (n) { return Math.round(n * 100) / 100; };
  var CUE_RE = /^#(\d+)(e)?([+-]\d+(?:\.\d+)?)?$/;
  var WHY_NO_CUE = function (n, m) { return '字幕沒有第 ' + n + ' 句（window.__cues 有 ' + m + ' 句）'; };
  var WHY_NO_WORD = '「@詞」沒有被 build 預先算到 → 把 ref 寫成字串字面值 P.at(\'#N@詞\')，再跑 build';
  var WHY_NO_SEG = '找不到 window.__cues 也沒有 data-cues-sample → 用 build 產生的 index.html 看，或在 root 加 data-cues-sample';
  var pushErr = function (msg) {
    var a = window.__cueErrors = window.__cueErrors || [];
    if (a.indexOf(msg) < 0) a.push(msg);   // HyperFrames 重新執行 script 時不重複
  };
  var readSample = function (root) {
    var raw = root && root.getAttribute ? root.getAttribute('data-cues-sample') : null;
    if (raw == null || raw === '') return null;
    var v;
    try { v = JSON.parse(raw); } catch (e) {
      throw new Error('data-cues-sample 不是合法的 JSON（' + e.message + '）；格式照 cues.md §5：{"start":0,"D":秒數,"cues":{"21":[起,迄]}}');
    }
    return { start: Number(v.start) || 0, D: v.D, cues: v.cues || {}, refs: v.refs || {} };
  };
  var nameOf = function (el) {
    if (el && el.id) return '#' + el.id;
    var tag = el && el.tagName ? String(el.tagName).toLowerCase() : '元素';
    var cls = el && el.className && typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : '';
    return cls ? tag + '.' + cls : tag;
  };

  window.SceneMotion = function (tl, root) {
    // 時間 < 0 一律當 0：GSAP 遇到負的位置會把已經排好的動畫全部往後推（綁句太早時 T - 0.9 這種算式會變負，整段跟講解對不上）
    var TL = tl, at0 = function (t) { return typeof t === 'number' && t < 0 ? 0 : t; };
    // 每個 tween 帶 data：{ sc: 第幾個 P.* 呼叫, role: enter｜focus｜accent｜micro, fn: 方法名 }（audit 用；motion.md §4）
    var CALL = { id: 0, depth: 0, role: null, fn: null };
    var tagV = function (v) { if (CALL.depth && v && !v.data) v.data = { sc: CALL.id, role: CALL.role, fn: CALL.fn }; return v; };
    tl = { fromTo: function (a, b, c, t) { return TL.fromTo(a, b, tagV(c), at0(t)); }, to: function (a, b, t) { return TL.to(a, tagV(b), at0(t)); }, set: function (a, b, t) { return TL.set(a, tagV(b), at0(t)); } };
    registerCount();
    registerType();
    registerFn();
    snapWidths(root);
    if (window.SceneLayout) window.SceneLayout.apply(root);   // data-layout 排版（kit/scene-layout.js；mount 時算一次，不進 timeline）
    // 找自己是哪一段（cues.md §4.1）：host 的 id 去掉 el- → window.__cues.segs[id]；沒有就讀 root 的 data-cues-sample
    var host = root && root.closest ? root.closest('[data-composition-src], [data-composition-file]') : null;
    var sid = host ? String(host.id || '').replace(/^el-/, '') : null;
    var C = window.__cues, injected = !!(C && C.segs && sid && C.segs[sid]);
    // comp id：root 的 data-composition-id；HyperFrames 掛上子合成後只留在 host 上，再退到 host、注入的 segs[id].comp
    var comp = (root && root.getAttribute && root.getAttribute('data-composition-id')) ||
               (host && host.getAttribute && host.getAttribute('data-composition-id')) || (injected ? C.segs[sid].comp : null) || null;
    var seg = injected ? C.segs[sid] : readSample(root);
    var cues = injected ? (C.cues || {}) : (seg ? seg.cues : {});
    var tag = injected ? sid : (comp || '?');
    var marks = [];
    (window.SceneMotion.marks = window.SceneMotion.marks || {})[comp || '?'] = marks;
    var lv = new Map();   // P.focus 記的亮度：元素 → { v: 目前 opacity, t: 最後一次改動結束的秒數 }
    var IN = 0.5, OUT = 0.3, STEP = 0.35, HOLD = 0.6, PUSH = 0.7, SHIFT = 480, SIDE = 960;
    var DRIFT = 16, RISE = 8, AXIS = 12, REVEAL = 0.55, MASK = 0.6, AXIS_DUR = 0.45, AXIS_LAG = 0.1;
    var BEAT = 0.15, READ = 1.2, HOLD_END = 1.5;
    // 收尾（回均衡這類排在最後一拍之後的動作）太晚、最後一幕停不到 HOLD_END 時，把它們整組往前挪：段長比模板要的短一點時不用每段改 plan.json。
    // 只動沒有綁字幕的收尾（最後一個 P.at 之後 ≥ 1 秒開始的），綁了詞的拍不動；build 另外加淡出或退場（最長 0.75 秒）
    var settleTail = function (D) {
      if (!(D > 0) || !TL.getChildren || !marks.length) return;   // TL＝真的 GSAP 時間軸（tl 是加了標記的包裝）
      var lastMark = Math.max.apply(null, marks.map(function (m) { return m.t; }));
      var kids = TL.getChildren(false, true, true), limit = D - HOLD_END - 0.75, floor = lastMark + 1, end = 0;
      kids.forEach(function (k) { end = Math.max(end, k.startTime() + k.totalDuration()); });
      if (end <= limit + 1e-6) return;
      var tail = kids.filter(function (k) { return k.startTime() >= floor - 1e-6 && k.totalDuration() > 0; });
      if (!tail.length) return;
      var first = Math.min.apply(null, tail.map(function (k) { return k.startTime(); }));
      var shift = Math.min(end - limit, first - floor);
      if (shift > 1e-6) tail.forEach(function (k) { k.startTime(k.startTime() - shift); });
    };
    var STROKE = 0.7, CHECK_LAG = 0.25;
    var MORPH = 0.7, ZOOM = 2.4, COUNT = 1.2, BAR = 0.8;
    var EASE = 'power2.out';
    var SHAPES = 'path, circle, rect, ellipse, line, polyline, polygon';
    var seen = {};
    var els = function (sel) { return gsap.utils.toArray(sel); };
    // 同一元素同一屬性的第一個 tween 才 immediateRender
    var first = function (prop, el) {
      var s = seen[prop] || (seen[prop] = new Set());
      var f = !s.has(el); s.add(el); return f;
    };
    // 多屬性：每個屬性都是第一次才 immediateRender（先全部查完再登記）
    var firstAll = function (props, el) {
      var f = props.every(function (p) { return !(seen[p] && seen[p].has(el)); });
      props.forEach(function (p) { first(p, el); });
      return f;
    };

    // 被 P.focus 記過亮度的元素：出場從記錄的亮度開始；進出場後更新記錄（沒記過的元素行為不變）
    var level = function (el, t, to, dur) {
      var r = lv.get(el);
      if (!r) return null;
      if (t < r.t - 0.001) throw new Error('P.focus 要照時間先後寫：' + nameOf(el) + ' 在 ' + r3(r.t) + 's 已經有亮度變化，這一行卻是 ' + r3(t) + 's → 把這一行移到前面，或把時間改晚');
      var from = r.v;
      lv.set(el, { v: to, t: t + dur });
      return from;
    };
    var fade = function (sel, at, from, to, dur, ease, stagger) {
      els(sel).forEach(function (el, i) {
        var t = at + i * (stagger || 0), rf = level(el, t, to, dur);
        tl.fromTo(el, { opacity: rf != null && to === 0 ? rf : from }, { opacity: to, duration: dur, ease: ease, immediateRender: first('opacity', el) }, t);
      });
    };
    var push = function (sel, at, from, to) {
      els(sel).forEach(function (el) {
        tl.fromTo(el, { x: from }, { x: to, duration: PUSH, ease: pushEase, immediateRender: first('x', el) }, at);
      });
    };
    // 通用：from → to（多屬性），每個元素依 stagger 排開
    var move = function (sel, at, from, to, dur, ease, stagger) {
      var props = Object.keys(from);
      els(sel).forEach(function (el, i) {
        var at2 = at + i * (stagger || 0), f = Object.assign({}, from);
        if ('opacity' in to) { var rf = level(el, at2, to.opacity, dur); if (rf != null && to.opacity === 0) f.opacity = rf; }
        var t = { duration: dur, ease: ease, immediateRender: firstAll(props, el) };
        for (var k in to) t[k] = to[k];
        tl.fromTo(el, f, t, at2);
      });
    };
    var opt = function (o, k, d) { return o && o[k] != null ? o[k] : d; };
    // 描線：每個形狀各自 tween（first() 才判斷得出同一元素第二次被描的 immediateRender）
    var draw = function (shapes, at, dur, stagger, keepDash) {
      shapes.forEach(function (el, i) {
        var t = at + i * (stagger || 0);
        // 第二層 custom 直接貼 icons.json 的 svg 時沒有 pathLength：補上，虛線 1 才等於整條線
        if (!el.hasAttribute('pathLength')) el.setAttribute('pathLength', '1');
        tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.001, ease: 'none', immediateRender: first('opacity', el) }, t);
        tl.fromTo(el, { strokeDasharray: 1, strokeDashoffset: 1 },
          { strokeDasharray: 1, strokeDashoffset: 0, autoRound: false, duration: dur, ease: 'power2.inOut',
            immediateRender: firstAll(['strokeDasharray', 'strokeDashoffset'], el) }, t);
        if (!keepDash) tl.set(el, { strokeDasharray: 'none' }, t + dur);
        // data-links 的箭頭頭（kit/scene-layout.js 另出的 <id>-head）：本體描到箭尖時淡入（P.comet 的光頭停在箭尖，不停在翼末端）
        var hd = el.id && el.ownerDocument.getElementById(el.id + '-head');
        if (hd && hd.getAttribute('data-link-head') === el.id) tl.fromTo(hd, { opacity: 0 }, { opacity: 1, duration: 0.15, ease: 'none', immediateRender: first('opacity', hd) }, Math.max(0, t + dur - 0.05));
      });
    };
    // 數字格式：decimals 位小數、可選千分位，前後綴原樣接上
    var fmtNum = function (v, o) {
      var s = Number(v).toFixed(opt(o, 'decimals', 0));
      if (o && o.comma) { var p = s.split('.'); p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ','); s = p.join('.'); }
      return opt(o, 'prefix', '') + s + opt(o, 'suffix', '');
    };
    var shapesIn = function (box) { return Array.prototype.slice.call(box.querySelectorAll(SHAPES)); };

    var P = {
      tl: TL, IN: IN, OUT: OUT, STEP: STEP, HOLD: HOLD, PUSH: PUSH, SHIFT: SHIFT, SIDE: SIDE,
      DRIFT: DRIFT, RISE: RISE, AXIS: AXIS, REVEAL: REVEAL, MASK: MASK, AXIS_DUR: AXIS_DUR, AXIS_LAG: AXIS_LAG,
      BEAT: BEAT, READ: READ, HOLD_END: HOLD_END, STROKE: STROKE, CHECK_LAG: CHECK_LAG,
      MORPH: MORPH, ZOOM: ZOOM, COUNT: COUNT, BAR: BAR,
      pushEase: pushEase,
      knots: E.slice(),
      marks: marks,
      at: function (ref, off) {
        off = off == null ? 0 : off;
        if (typeof ref !== 'number' && typeof ref !== 'string') {
          throw new Error("P.at 要傳句號字串或秒數，例如 P.at('#21')、P.at('#21@剪輯清單', 0.2)、P.at(3.2)；現在是 " + (ref === null ? 'null' : Array.isArray(ref) ? 'array' : typeof ref));
        }
        if (typeof off !== 'number' || !isFinite(off)) throw new Error("P.at('" + ref + "', " + String(off) + ')：第二個參數要是秒數（數字），例如 0.2');
        var t, m;
        if (typeof ref === 'number') t = ref + off;
        else if (seg && seg.refs && seg.refs[ref] != null) t = seg.refs[ref] - seg.start + off;
        else if (seg && (m = CUE_RE.exec(ref)) && cues[m[1]]) t = cues[m[1]][m[2] ? 1 : 0] + Number(m[3] || 0) - seg.start + off;
        else {
          t = off;
          pushErr(tag + " P.at('" + ref + "')：" + (!seg ? WHY_NO_SEG : m ? WHY_NO_CUE(m[1], Object.keys(cues).length) : WHY_NO_WORD));
        }
        t = Math.max(0, r3(t));
        marks.push({ ref: ref, t: t });
        return t;
      },
      dur: function () {
        var d = seg ? Number(seg.D) : NaN;
        if (!(isFinite(d) && d > 0)) d = Number(root && root.getAttribute ? root.getAttribute('data-duration') : NaN);
        if (isFinite(d) && d > 0) return d;
        pushErr(tag + ' P.dur()：找不到 window.__cues、data-cues-sample，root 也沒有 data-duration → 用 build 產生的 index.html 看，或在 root 寫 data-duration');
        return 0;
      },
      in: function (sel, at, o) { o = o || {}; fade(sel, at, 0, 1, o.dur != null ? o.dur : IN, 'sine.out', o.stagger); return P; },
      out: function (sel, at, o) { o = o || {}; fade(sel, at, 1, 0, o.dur != null ? o.dur : OUT, 'sine.in', o.stagger); return P; },
      swap: function (outSel, inSel, at, o) {
        o = o || {};
        fade(outSel, at, 1, 0, o.dur != null ? o.dur : OUT, 'sine.in');
        fade(inSel, at, 0, 1, o.dur != null ? o.dur : IN, 'sine.out');
        return P;
      },
      sideIn: function (sel, at) { push(sel, at, -SIDE, 0); return P; },
      sideOut: function (sel, at) { push(sel, at, 0, -SIDE); return P; },
      end: function (dur) {
        var D = dur == null ? P.dur() : dur;
        settleTail(D);
        tl.set({}, {}, D);
        return P;
      },

      // ── v2 進場（§2.1）──
      drift: function (sel, at, o) {
        move(sel, at, { x: opt(o, 'dx', DRIFT), opacity: 0 }, { x: 0, opacity: 1 }, opt(o, 'dur', IN), EASE, opt(o, 'stagger', 0));
        return P;
      },
      reveal: function (sel, at, o) {
        move(sel, at, { clipPath: 'inset(0% 100% 0% 0%)', opacity: 0 }, { clipPath: 'inset(0% 0% 0% 0%)', opacity: 1 }, opt(o, 'dur', REVEAL), EASE, 0);
        return P;
      },
      rise: function (sel, at, o) {
        move(sel, at, { y: opt(o, 'dy', RISE), opacity: 0 }, { y: 0, opacity: 1 }, opt(o, 'dur', IN), EASE, opt(o, 'stagger', 0));
        return P;
      },
      maskUp: function (sel, at, o) {
        move(sel, at, { yPercent: 100, clipPath: 'inset(0% 0% 100% 0%)' }, { yPercent: 0, clipPath: 'inset(0% 0% 0% 0%)' }, opt(o, 'dur', MASK), EASE, opt(o, 'stagger', 0));
        return P;
      },
      axis: function (outSel, inSel, at, o) {
        var d = opt(o, 'dur', AXIS_DUR), dx = opt(o, 'dx', AXIS);
        move(outSel, at, { x: 0, opacity: 1 }, { x: -dx, opacity: 0 }, d, EASE, 0);
        move(inSel, at + opt(o, 'lag', AXIS_LAG), { x: dx, opacity: 0 }, { x: 0, opacity: 1 }, d, EASE, 0);
        return P;
      },

      // ── v3 情境動畫語彙 ──
      morph: function (sel, at, to, o) {
        var props = Object.keys(to || {});
        els(sel).forEach(function (el) {
          var from = {};
          props.forEach(function (k) { from[k] = o && o.from && o.from[k] != null ? o.from[k] : gsap.getProperty(el, k); });
          var t = { duration: opt(o, 'dur', MORPH), ease: opt(o, 'ease', 'power2.inOut'), immediateRender: firstAll(props, el) };
          props.forEach(function (k) { t[k] = to[k]; });
          tl.fromTo(el, from, t, at);
        });
        return P;
      },
      push: function (sel, at, o) {
        var origin = opt(o, 'origin', '50% 50%');
        els(sel).forEach(function (el) {
          tl.fromTo(el, { scale: opt(o, 'from', 1), transformOrigin: origin },
            { scale: opt(o, 'to', 1.4), transformOrigin: origin, force3D: false, duration: opt(o, 'dur', ZOOM), ease: opt(o, 'ease', 'sine.inOut'),
              immediateRender: firstAll(['scale'], el) }, at);
        });
        return P;
      },
      count: function (sel, at, o) {
        var cfg = { from: opt(o, 'from', 0), to: opt(o, 'to', 100), decimals: opt(o, 'decimals', 0), comma: !!(o && o.comma),
                    prefix: opt(o, 'prefix', ''), suffix: opt(o, 'suffix', '') };
        els(sel).forEach(function (el) {
          el.style.fontVariantNumeric = 'tabular-nums';
          // 自訂 GSAP plugin：每次 render（含 suppressEvents 的 seek、immediateRender）都直接寫 textContent，不靠 onUpdate／proxy
          tl.to(el, { scCount: cfg, duration: opt(o, 'dur', COUNT), ease: opt(o, 'ease', 'power2.out'), immediateRender: first('scCount', el) }, at);
        });
        return P;
      },
      bar: function (sel, at, o) {
        move(sel, at, { scaleX: opt(o, 'from', 0), transformOrigin: '0% 50%' }, { scaleX: opt(o, 'to', 1) }, opt(o, 'dur', BAR), opt(o, 'ease', EASE), 0);
        return P;
      },

      // ── 聚焦與打字 ──
      focus: function (group, active, at, o) {
        var dim = opt(o, 'dim', 0.4), dur = opt(o, 'dur', 0.4), ring = opt(o, 'ring', null);
        var items = els(group), act = active == null ? null : els(active)[0];
        if (active != null && items.indexOf(act) < 0) {
          throw new Error('P.focus 的第二個參數 ' + (act ? nameOf(act) : String(active)) + ' 不在第一個參數那一組裡 → 改成那一組其中一個，或寫 null（全部恢復）');
        }
        var tw = function (el, from, to, firstTime) {
          tl.fromTo(el, { opacity: from }, { opacity: to, duration: dur, ease: 'sine.inOut', immediateRender: firstTime }, at);
        };
        items.forEach(function (el) {
          var cur = lv.get(el) || { v: 1, t: -1 };
          if (at < cur.t - 0.001) throw new Error('P.focus 要照時間先後寫：' + nameOf(el) + ' 在 ' + r3(cur.t) + 's 已經有亮度變化，這一行卻是 ' + r3(at) + 's → 把這一行移到前面，或把時間改晚');
          var target = act === null || el === act ? 1 : dim;
          if (target !== cur.v) tw(el, cur.v, target, first('opacity', el));
          lv.set(el, { v: target, t: at + dur });
          var r = ring && el.querySelector ? el.querySelector(ring) : null;
          if (!r) return;
          var rc = lv.get(r), rt = act !== null && el === act ? 1 : 0;
          if (!rc) tw(r, 0, rt, first('opacity', r));            // 框第一次被碰到：就算目標是 0 也寫一個 0→0（立即生效）
          else if (rc.v !== rt) tw(r, rc.v, rt, first('opacity', r));
          lv.set(r, { v: rt, t: at + dur });
        });
        return P;
      },
      type: function (sel, at, o) {
        var caret = opt(o, 'caret', true), cps = opt(o, 'cps', 8.5);
        els(sel).forEach(function (el) {
          var u = prepType(el, caret);
          var dur = opt(o, 'dur', u.n ? r2(u.n / cps) : 0.001);
          tl.to(el, { scType: 1, duration: dur || 0.001, ease: 'none', immediateRender: first('scType', el) }, at);
        });
        return P;
      },

      // ── 圖示描線 ──
      stroke: function (sel, at, o) {
        draw(els(sel), at, opt(o, 'dur', STROKE), opt(o, 'stagger', 0), !!(o && o.keepDash));
        return P;
      },
      icon: function (sel, at, o) {
        var dur = opt(o, 'dur', STROKE), st = opt(o, 'stagger', 0);
        els(sel).forEach(function (box, i) { draw(shapesIn(box), at + i * st, dur, 0, false); });
        return P;
      },
      check: function (sel, at, o) {
        var dur = opt(o, 'dur', 0.45);
        els(sel).forEach(function (box) {
          var s = shapesIn(box);
          var ring = s.filter(function (el) { return el.tagName.toLowerCase() === 'circle'; });
          var rest = s.filter(function (el) { return ring.indexOf(el) < 0; });
          draw(ring, at, dur, 0, false);
          draw(rest, at + CHECK_LAG, Math.max(0.3, dur - 0.1), 0, false);
        });
        return P;
      },
    };

    // ══ 動態 v2（specs/010-motion-v2/design-system.md §11；契約 specs/contracts/motion.md）══════════════════════
    // 確定性三種做法：(a) 一般進場仍是 fromTo（同元素同屬性第一個才 immediateRender，mv()）；
    // (b) 漣漪、彗星頭、長出、光澤、微動用純函式外掛 scFn：畫面只由 progress 算，0 與 1 都是定義好的狀態，建立時先畫一次 progress 0；
    // (c) 微動寫 CSS 個別屬性 translate／scale，不碰 GSAP 的 transform，和進場位移、spot、cam 互不覆蓋。
    // 參數是相對量：位移、振幅用 u（＝畫布短邊／1080，橫式直式都是 1）；字的位移用 em；位置用區域名（window.__regions 蓋過橫式預設）。
    var V2 = window.SceneMotion.V2;
    // v2 的位移／縮放一律 force3D:false：3D 圖層會讓字的反鋸齒跟著 seek 的先後不同（亂序截圖差 1–14 階）
    // 縮放過的元素回到 1 一律停在 V2.REST（1.0001，肉眼看不出）：縮放過又回到單位矩陣的元素（聚焦的「走過」、回均衡、逐字彈出、彈出落地），
    //   Chrome 畫圖示與圓角時的反鋸齒會跟著 seek 先後不同（亂序截圖差 300+ 個色值）；保留一個非單位的縮放就每次相同。
    //   還沒縮放過的元素（第一個縮放補間的起點）仍是 1：和沒動過的元素一樣畫法
    var XF = /^(x|y|scale|scaleX|scaleY|xPercent|yPercent|rotation)$/;
    var scaled = new WeakSet();
    var mv = function (sel, at, from, to, dur, ease, stagger) {
      if (Object.keys(to).some(function (k) { return XF.test(k); })) {
        to.force3D = false;
        if ('scale' in to) {
          var list = q(sel);
          if (from.scale === 1 && list.some(function (el) { return scaled.has(el); })) from.scale = V2.REST;
          if (to.scale === 1) to.scale = V2.REST;
          list.forEach(function (el) { scaled.add(el); });
        }
      }
      return move(sel, at, from, to, dur, ease, stagger);
    };
    var U = (function () {
      var g = function (k) { return Number(root && root.getAttribute ? root.getAttribute(k) : NaN); };
      var w = g('data-width'), h = g('data-height');
      return w > 0 && h > 0 ? Math.min(w, h) / 1080 : 1;
    })();
    var q = function (sel) {
      if (typeof sel === 'string' && root && root.querySelectorAll) return Array.prototype.slice.call(root.querySelectorAll(sel));
      return els(sel);
    };
    var mk = function (parent, cls, tag) {
      var e = parent.ownerDocument.createElement(tag || 'i'); e.className = cls; e.setAttribute('aria-hidden', 'true'); return e;
    };
    var relPos = function (el) { if (getComputedStyle(el).position === 'static') el.style.position = 'relative'; };
    // 元素在 stop（預設 root）座標系的版面盒：offset 鏈，不受 transform 影響（進場位移不會干擾量測）
    var boxOf = function (el, stop) {
      var x = 0, y = 0, n = el;
      while (n && n !== stop && n !== root) { x += n.offsetLeft || 0; y += n.offsetTop || 0; n = n.offsetParent; }
      return { x: x, y: y, w: el.offsetWidth, h: el.offsetHeight };
    };
    var fn = function (el, at, dur, f) {
      FNS.push(f);
      var isFirst = first('scFn', el);
      if (isFirst) f(el, 0);   // 建立時先畫 progress 0（timeline 的 to() 不保證立即 render，亂序 seek 才一致）
      tl.to(el, { scFn: FNS.length - 1, duration: dur, ease: 'none', immediateRender: isFirst }, Math.max(0, at));
    };
    var prepChars = function (el) {
      if (el.__scChars && el.__scChars.length && el.contains(el.__scChars[0])) return el.__scChars;
      var doc = el.ownerDocument, out = [];
      var walk = function (node) {
        Array.prototype.slice.call(node.childNodes).forEach(function (c) {
          if (c.nodeType === 1) { if (!c.hasAttribute('data-sc-ch') && !c.hasAttribute('data-sc-mk') && !c.hasAttribute('data-sc-strike')) walk(c); return; }
          if (c.nodeType !== 3 || !NONWS.test(c.nodeValue)) return;
          var frag = doc.createDocumentFragment();
          // 一個中文字一格；英文單字、數字（含 . , % ' - 連在一起的）整個一格，不會在字中間換行
          (c.nodeValue.match(/[A-Za-z0-9][A-Za-z0-9.,%'’\-]*|\s+|[\s\S]/g) || []).forEach(function (ch) {
            if (!NONWS.test(ch)) { frag.appendChild(doc.createTextNode(ch)); return; }
            var s = doc.createElement('span'); s.setAttribute('data-sc-ch', ''); s.style.display = 'inline-block'; s.textContent = ch;
            frag.appendChild(s); out.push(s);
          });
          node.replaceChild(frag, c);
        });
      };
      walk(el); el.__scChars = out; return out;
    };
    // 009：直式（有 window.__regions）裡的橫式子合成（root 寬 > 高）＝舞台縮放，座標仍是 1920×1080 → 用橫式區域；P.cam 不往焦點帶
    var STAGED = !!window.__regions && !!root && !!root.getAttribute && (+root.getAttribute('data-width') || 1920) > (+root.getAttribute('data-height') || 1080);
    var REGION = function (name) {
      if (Array.isArray(name)) return name;
      var R = (STAGED ? null : (window.__regions || {})[name]) || REGIONS[name];
      if (!R) throw new Error('沒有這個區域：' + name + '（可用 ' + Object.keys(REGIONS).join('／') + '）');
      return R;
    };
    var spotState = new Map(), camState = new Map(), dimState = new Map();
    var sfxList = [];
    (window.SceneMotion.sfx = window.SceneMotion.sfx || {})[comp || '?'] = sfxList;
    var dirClip = function (d) {
      if (!V2.CLIP[d]) throw new Error('方向要是 left／right／up／down，現在是 ' + d);
      return V2.CLIP[d];
    };

    P.V2 = V2; P.U = U; P.region = REGION; P.sfxCues = sfxList;
    // 前一段是什麼（002 plan-fields.md §4、cues.md §2 segs[id].prev）：root 的 data-prev → host 的 data-prev → __cues.segs[id].prev → 'speaker'
    //   'speaker'＝前面露講者（主卡從子母畫面長出）、'fullscreen'＝前一段也是全畫面同背景（換卡不換景）、'pip'＝前一段是別的不透明幕（小視窗已在）
    P.prev = function () {
      var v = root && root.getAttribute ? root.getAttribute('data-prev') : null;
      if (!v && host && host.getAttribute) v = host.getAttribute('data-prev');
      if (!v && injected && C.segs[sid].prev) v = C.segs[sid].prev;
      return v === 'fullscreen' || v === 'pip' || v === 'speaker' ? v : 'speaker';
    };
    // 字：逐字進場（rise＝上浮、pop＝過衝彈出、drop＝由上落下）；dy 用 em
    P.chars = function (sel, at, o) {
      var mode = opt(o, 'mode', 'rise');
      if (!/^(rise|pop|drop)$/.test(mode)) throw new Error("P.chars 的 mode 要是 'rise'／'pop'／'drop'，現在是 " + mode);
      var st = opt(o, 'stagger', V2.CH[mode]);
      q(sel).forEach(function (el) {
        var cs = prepChars(el), fs = parseFloat(getComputedStyle(el).fontSize) || 48;
        var dy = opt(o, 'dy', V2.CHAR_DY[mode]) * fs;
        if (mode === 'pop') mv(cs, at, { opacity: 0, y: dy, scale: 0.3, transformOrigin: '50% 90%' }, { opacity: 1, y: 0, scale: 1, transformOrigin: '50% 90%' }, opt(o, 'dur', 0.5), V2.EASE.emph, st);
        else if (mode === 'drop') mv(cs, at, { opacity: 0, y: -dy }, { opacity: 1, y: 0 }, opt(o, 'dur', 0.55), 'back.out(1.4)', st);
        else mv(cs, at, { opacity: 0, y: dy }, { opacity: 1, y: 0 }, opt(o, 'dur', 0.6), V2.EASE.in, st);
      });
      return P;
    };
    // 螢光筆：字後一條主色帶由左掃過（自動插 <i class="sc-mk">）
    P.marker = function (sel, at, o) {
      q(sel).forEach(function (el) {
        var m = el.querySelector(':scope > [data-sc-mk]');
        if (!m) { m = mk(el, 'sc-mk'); m.setAttribute('data-sc-mk', ''); el.insertBefore(m, el.firstChild); relPos(el); el.style.isolation = 'isolate'; }
        mv([m], at, { scaleX: 0, transformOrigin: '0% 50%' }, { scaleX: 1, transformOrigin: '0% 50%' }, opt(o, 'dur', 0.45), V2.EASE.in, 0);
      });
      return P;
    };
    // 劃掉：一條線由左劃過文字（自動插 <i class="sc-strike">），不擦回；劃完把文字壓暗（o.dim，預設 0.5；false＝不壓暗）
    //   wave: true＝波浪線（svg path，波長 0.55 em、振幅 0.09 em，照建立當下的字級與寬度畫），用 clip-path 由左揭開
    P.strike = function (sel, at, o) {
      var wave = !!(o && o.wave);
      var dur = opt(o, 'dur', wave ? 0.45 : 0.35), dm = o && o.dim === false ? null : opt(o, 'dim', 0.5);
      q(sel).forEach(function (el) {
        var s = el.querySelector(':scope > [data-sc-strike]');
        if (!s) {
          s = mk(el, wave ? 'sc-strike sc-strike--wave' : 'sc-strike'); s.setAttribute('data-sc-strike', '');
          if (wave) s.appendChild(wavePath(el));
          el.appendChild(s); relPos(el);
        }
        if (wave) mv([s], at, { clipPath: 'inset(-60% 100% -60% 0%)' }, { clipPath: 'inset(-60% 0% -60% 0%)' }, dur, 'power1.inOut', 0);
        else mv([s], at, { scaleX: 0, transformOrigin: '0% 50%' }, { scaleX: 1, transformOrigin: '0% 50%' }, dur, 'power2.out', 0);
        if (dm != null) P.dim([el], at + dur, { to: dm });
      });
      return P;
    };
    // 波浪線：寬＝文字寬＋8、高＝0.36 em；整數個波長，path 用 viewBox 座標（preserveAspectRatio none，字型晚到時只會微微拉伸）
    var wavePath = function (el) {
      var ns = 'http://www.w3.org/2000/svg', doc = el.ownerDocument;
      var fs = parseFloat(getComputedStyle(el).fontSize) || 48, w = (el.offsetWidth || fs * 4) + 8, h = fs * 0.36;
      var n = Math.max(2, Math.round(w / (fs * 0.55))), lam = w / n, a = fs * 0.09, sw = Math.max(3, fs * 0.075), y = h / 2;
      var d = 'M' + r2(sw / 2) + ' ' + r2(y);
      for (var k = 0; k < n; k++) {
        var x0 = k * lam;
        d += ' Q' + r2(x0 + lam / 4) + ' ' + r2(y - a * 2) + ' ' + r2(x0 + lam / 2) + ' ' + r2(y) + ' T' + r2(Math.min(w - sw / 2, x0 + lam)) + ' ' + r2(y);
      }
      var svg = doc.createElementNS(ns, 'svg');
      svg.setAttribute('viewBox', '0 0 ' + r2(w) + ' ' + r2(h)); svg.setAttribute('preserveAspectRatio', 'none');
      var path = doc.createElementNS(ns, 'path');
      path.setAttribute('d', d); path.setAttribute('fill', 'none'); path.setAttribute('stroke-width', String(r2(sw)));
      path.setAttribute('stroke-linecap', 'round'); path.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(path);
      return svg;
    };
    // 蓋章：印章元素（.sc-stamp）從 from 倍、多轉 12° 砸下到 rot；落地 0.06s 壓到 0.96、0.12s 回 1；o.on＝被蓋的元素同時退焦
    P.stamp = function (sel, at, o) {
      var rot = opt(o, 'rot', -8), from = opt(o, 'from', 1.5), dur = opt(o, 'dur', 0.22), land = at + dur;
      q(sel).forEach(function (el) {
        el.setAttribute('data-layout-allow-overlap', '');
        mv([el], at, { opacity: 0 }, { opacity: 1 }, 0.08, 'none', 0);
        mv([el], at, { scale: from, rotation: rot + 12 }, { scale: 1, rotation: rot }, dur, 'power4.in', 0);
        mv([el], land, { scale: 1 }, { scale: 0.96 }, 0.06, 'power2.out', 0);
        mv([el], land + 0.06, { scale: 0.96 }, { scale: 1 }, 0.12, 'power2.out', 0);
      });
      if (o && o.on) P.dim(o.on, land, { to: opt(o, 'dim', 0.55) });
      return P;
    };
    // 重拍：0.12s 放大再 0.45s 回彈（不和 spot／cam 用在同一元素）
    P.punch = function (sel, at, o) {
      var s = opt(o, 'scale', 1.06);
      q(sel).forEach(function (el) {
        mv([el], at, { scale: 1 }, { scale: s }, 0.12, 'power2.out', 0);
        mv([el], at + 0.12, { scale: s }, { scale: 1 }, opt(o, 'dur', 0.45), 'power3.out', 0);
      });
      return P;
    };
    // 漣漪：從元素中心擴散 1–2 圈（from／to＝元素大小的倍數；前後都透明）
    P.ripple = function (sel, at, o) {
      var n = opt(o, 'rings', 2), dur = opt(o, 'dur', 0.9), a = opt(o, 'from', 0.9), b = opt(o, 'to', 2.1), Ez = gsap.parseEase(V2.EASE.in);
      q(sel).forEach(function (el) {
        relPos(el);
        for (var k = 0; k < n; k++) {
          var r = mk(el, 'sc-ripple'); el.appendChild(r);
          fn(r, at + k * 0.14, dur, function (t, p) {
            if (p <= 0 || p >= 1) { t.style.opacity = '0'; t.style.transform = 'scale(' + a + ')'; return; }
            var e = Ez(p); t.style.opacity = String(0.85 * (1 - e)); t.style.transform = 'scale(' + (a + (b - a) * e) + ')';
          });
        }
      });
      return P;
    };
    // 彗星：線描出來時前端帶一顆發光頭（r 用 u），到站後 0.3s 淡掉；頭插在同一個 svg，起點先放在線頭
    P.comet = function (sel, at, o) {
      var dur = opt(o, 'dur', 0.8), Ez = gsap.parseEase(opt(o, 'ease', 'power2.inOut')), tail = 0.3, r = opt(o, 'r', 9) * U;
      q(sel).forEach(function (path) {
        draw([path], at, dur, 0, !!(o && o.keepDash));
        var svg = path.ownerSVGElement, ns = 'http://www.w3.org/2000/svg', doc = svg.ownerDocument;
        var g = doc.createElementNS(ns, 'g'); g.setAttribute('class', 'sc-comet'); g.setAttribute('aria-hidden', 'true');
        var halo = doc.createElementNS(ns, 'circle'); halo.setAttribute('r', String(r * 2.6)); halo.setAttribute('class', 'sc-comet__halo');
        var head = doc.createElementNS(ns, 'circle'); head.setAttribute('r', String(r)); head.setAttribute('class', 'sc-comet__head');
        g.appendChild(halo); g.appendChild(head); svg.appendChild(g);
        var p0 = path.getPointAtLength(0); g.setAttribute('transform', 'translate(' + p0.x + ' ' + p0.y + ')');
        var L = null;
        fn(g, at, dur + tail, function (t, p) {
          if (p <= 0) { t.style.opacity = '0'; t.setAttribute('transform', 'translate(' + p0.x + ' ' + p0.y + ')'); return; }
          if (L == null) L = path.getTotalLength();
          var q2 = Math.min(1, p * (dur + tail) / dur), pt = path.getPointAtLength(Ez(q2) * L);
          t.setAttribute('transform', 'translate(' + pt.x + ' ' + pt.y + ')');
          var after = (p * (dur + tail) - dur) / tail;
          t.style.opacity = String(after > 0 ? Math.max(0, 1 - after) : 1);
        });
      });
      return P;
    };
    // ── 015 白板、傳送、紙膠帶、聲紋、載入（specs/015-scene-styles/brief.md）──
    // 量測一律用版面盒（offset 鏈）＋ svg 的 getCTM（形狀 → 自己的 svg 視口，含 viewBox 縮放、不含 CSS transform）：
    //   進場的縮放、位移不影響量測，任何時間 seek 算出來都一樣
    var svgOrigin = function (svg) {
      var par = svg.parentElement, b = boxOf(par, root);
      var pr = par.getBoundingClientRect(), sr = svg.getBoundingClientRect(), k = pr.width > 0 ? par.offsetWidth / pr.width : 1;
      return { x: b.x + (sr.left - pr.left) * k, y: b.y + (sr.top - pr.top) * k };
    };
    var ptOf = function (shape, len, o0, m0) {   // m0：事先量好的 getCTM()（畫的時候才呼叫要傳；見 P.along）
      var p = shape.getPointAtLength(len), m = m0 || shape.getCTM(), o = o0 || svgOrigin(shape.ownerSVGElement);
      return { x: o.x + m.a * p.x + m.c * p.y + m.e, y: o.y + m.b * p.x + m.d * p.y + m.f };
    };
    var ctmScale = function (shape) { var m = shape.getCTM(); return m ? Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) : 1; };
    // 形狀「實際」的線長：non-scaling-stroke 的虛線以 svg 視口計（實測：外層 CSS 縮放不影響），其他以使用者單位計
    var dashLen = function (shape) {
      var L = shape.getTotalLength();
      return shape.getAttribute('vector-effect') === 'non-scaling-stroke' || getComputedStyle(shape).vectorEffect === 'non-scaling-stroke' ? L * ctmScale(shape) : L;
    };
    var hiddenIn = function (el, stop) {   // 狀態群組（style="opacity:0"）裡的形狀：不畫，不分時間
      for (var n = el; n && n !== stop; n = n.parentNode) if (n.style && n.style.opacity === '0') return true;
      return false;
    };
    var PEN_SVG = '<svg viewBox="-14 -158 64 172" width="64" height="172" aria-hidden="true"><g transform="rotate(28)">' +
      '<path class="sc-pen__nib" d="M0 0 L-7 -16 L7 -16 Z"/><rect class="sc-pen__ink" x="-9" y="-30" width="18" height="16" rx="3"/>' +
      '<rect class="sc-pen__body" x="-13" y="-128" width="26" height="100" rx="7"/><rect class="sc-pen__cap" x="-13" y="-80" width="26" height="12"/>' +
      '<rect class="sc-pen__cap" x="-13" y="-140" width="26" height="16" rx="6"/></g></svg>';
    var penFor = function () {
      var p = mk(root, 'sc-pen', 'div'); p.innerHTML = PEN_SVG; root.appendChild(p);
      p.style.left = '0px'; p.style.top = '0px'; p.style.opacity = '0';
      return p;
    };
    // 馬克筆畫出：sel 裡的每一筆（svg 形狀；sel 是容器就取裡面的形狀，照文件順序）依序畫出，筆尖跟著線頭；
    //   有填色的形狀在自己那一筆畫完後 0.25s 補上填色；只有填色沒有描邊的形狀在輪到時淡入；<text> 在最後淡入。
    //   dur 預設依總線長（0.6–1.6s）；pen: false＝不顯示筆
    P.draw = function (sel, at, o) {
      var list = [];
      q(sel).forEach(function (el) {
        var shapes = el.namespaceURI === 'http://www.w3.org/2000/svg' && el.tagName.toLowerCase() !== 'svg' && el.tagName.toLowerCase() !== 'g' ? [el] : shapesIn(el);
        shapes.forEach(function (s) { if (!hiddenIn(s, el) && list.indexOf(s) < 0) list.push(s); });
        Array.prototype.slice.call(el.querySelectorAll ? el.querySelectorAll('text') : []).forEach(function (t) { if (!hiddenIn(t, el)) list.push(t); });
      });
      if (!list.length) return P;
      var orgs = new Map();
      var segs = list.map(function (s) {
        var tag = s.tagName.toLowerCase(), cs = getComputedStyle(s);
        var stroked = tag !== 'text' && cs.stroke && cs.stroke !== 'none' && parseFloat(cs.strokeWidth) > 0;
        var filled = tag === 'text' || (cs.fill && cs.fill !== 'none' && parseFloat(cs.fillOpacity) > 0);
        var L = stroked ? Math.ceil(dashLen(s)) : 0, sv = s.ownerSVGElement;   // 取整數：GSAP 的起點值會被四捨五入，小數線長在亂序 seek 時差一點
        if (sv && !orgs.has(sv)) orgs.set(sv, svgOrigin(sv));   // 呼叫當下量好（之後的進場轉動、縮放不影響）
        return { s: s, tag: tag, stroked: stroked, filled: filled, L: L, Lu: stroked ? s.getTotalLength() : 0, w: stroked ? Math.max(L, 30) : 30 };
      });
      var total = segs.reduce(function (a, g) { return a + g.w; }, 0);
      var dur = opt(o, 'dur', Math.max(0.6, Math.min(1.6, 0.4 + total / 1800)));
      var t = at, Ez = gsap.parseEase('power1.inOut');
      segs.forEach(function (g) {
        g.t = t; g.d = dur * g.w / total; t += g.d;
        if (g.stroked) {
          // 輪到之前整個藏起來（round 線頭在零長度虛線上會留一個圓點，P.stroke 同一招）
          tl.fromTo(g.s, { opacity: 0 }, { opacity: 1, duration: 0.001, ease: 'none', immediateRender: first('opacity', g.s) }, g.t);
          tl.fromTo(g.s, { strokeDasharray: g.L + ' ' + (g.L + 1), strokeDashoffset: g.L },
            { strokeDasharray: g.L + ' ' + (g.L + 1), strokeDashoffset: 0, autoRound: false, duration: g.d, ease: 'power1.inOut',
              immediateRender: firstAll(['strokeDasharray', 'strokeDashoffset'], g.s) }, g.t);
          tl.set(g.s, { strokeDasharray: 'none' }, g.t + g.d);
        }
        if (g.filled) {
          var prop = g.tag === 'text' ? 'opacity' : 'fillOpacity', base = g.tag === 'text' ? 1 : (parseFloat(getComputedStyle(g.s).fillOpacity) || 1);
          var ft = g.stroked ? g.t + g.d : g.t, fd = g.stroked ? 0.25 : Math.max(0.12, g.d);
          var a = {}, b = { duration: fd, ease: 'power1.out', immediateRender: first(prop, g.s) }; a[prop] = 0; b[prop] = base;
          tl.fromTo(g.s, a, b, ft);
        }
      });
      if (o && o.pen === false) return P;
      var pen = penFor(), end = t, hop = 0.18;
      segs.forEach(function (g) {   // 每一筆的筆尖位置在呼叫當下先算好路徑上的點（填色形狀＝中心點）
        var org = orgs.get(g.s.ownerSVGElement);
        if (g.stroked) { g.pts = []; for (var k = 0; k <= 48; k++) g.pts.push(ptOf(g.s, g.Lu * k / 48, org)); return; }
        var bb = g.s.getBBox(), m = g.s.getCTM(), cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
        g.pts = [{ x: org.x + m.a * cx + m.c * cy + m.e, y: org.y + m.b * cx + m.d * cy + m.f }];
      });
      var pos = function (g, u) {   // u：這一筆的進度 0–1（和描線同一條 power1.inOut）
        if (g.pts.length === 1) return g.pts[0];
        var f = Ez(u) * (g.pts.length - 1), i = Math.min(g.pts.length - 2, Math.floor(f)), r = f - i, a = g.pts[i], b = g.pts[i + 1];
        return { x: a.x + (b.x - a.x) * r, y: a.y + (b.y - a.y) * r };
      };
      fn(pen, at - hop, end - at + hop + 0.25, function (el, p) {
        var s = (at - hop) + p * (end - at + hop + 0.25);
        if (p <= 0 || p >= 1) { el.style.opacity = '0'; el.style.left = '0px'; el.style.top = '0px'; return; }
        var g = segs[0], u = 0;
        for (var i = 0; i < segs.length; i++) { if (s >= segs[i].t) { g = segs[i]; u = Math.min(1, (s - g.t) / Math.max(1e-6, g.d)); } }
        var pt = s < at ? pos(segs[0], 0) : pos(g, u);
        var fadeIn = Math.min(1, (s - (at - hop)) / hop), fadeOut = Math.max(0, Math.min(1, (end + 0.25 - s) / 0.2));
        var lift = s > end ? (s - end) * 120 : (s < at ? (at - s) * 120 : 0);
        el.style.left = r2(pt.x + lift * 0.5) + 'px'; el.style.top = r2(pt.y - lift) + 'px';
        el.style.opacity = String(r2(Math.min(fadeIn, fadeOut)));
      });
      return P;
    };
    // 沿線移動：元素的中心沿 path（svg 形狀；data-links 的線也行）從 o.from 走到 o.to（線長比例 0–1，預設 0→1）；
    //   寫 CSS translate（不干擾進場的 transform），走完停在終點；之後要再走一段就再呼叫一次（from 寫上一次的 to）
    //   位置、svg 原點、線的矩陣都在呼叫當下量好：HyperFrames snapshot／render 跳到這段時，先畫時間軸、後顯示這段，
    //   畫的當下還是 display:none（外框 0、getCTM 不含 viewBox），在那時才量會把元素推走（亂序 seek 和照順序的不同）
    P.along = function (sel, path, at, o) {
      var pth = q(path)[0];
      if (!pth || !pth.getTotalLength) throw new Error('P.along 的第二個參數要是一條 svg 線（path／line／polyline…）：' + path);
      var dur = opt(o, 'dur', 1.0), f0 = opt(o, 'from', 0), f1 = opt(o, 'to', 1), Ez = gsap.parseEase(opt(o, 'ease', V2.EASE.move));
      var L = pth.getTotalLength();
      q(sel).forEach(function (el) {
        var b = boxOf(el, root), cx = b.x + b.w / 2, cy = b.y + b.h / 2, org = svgOrigin(pth.ownerSVGElement), m = pth.getCTM();
        fn(el, at, dur, function (t, p) {
          var pt = ptOf(pth, (f0 + (f1 - f0) * Ez(Math.max(0, Math.min(1, p)))) * L, org, m);
          t.style.translate = r2(pt.x - cx) + 'px ' + r2(pt.y - cy) + 'px';
        });
      });
      return P;
    };
    // 紙飛機：沿線飛過去，身後留下虛線尾跡（尾跡停在畫面上），到站 0.3s 淡掉；sel＝線（和 P.comet 一樣）
    P.fly = function (sel, at, o) {
      var dur = opt(o, 'dur', 1.1), Ez = gsap.parseEase(opt(o, 'ease', 'power2.inOut')), tail = 0.3, sz = opt(o, 'size', 30) * U;
      q(sel).forEach(function (path) {
        var svg = path.ownerSVGElement, ns = 'http://www.w3.org/2000/svg', doc = svg.ownerDocument, L = null;
        var trail = path.cloneNode(false); trail.removeAttribute('id'); trail.setAttribute('class', 'sc-fly__trail'); trail.setAttribute('aria-hidden', 'true');
        path.parentNode.insertBefore(trail, path); path.style.visibility = 'hidden';
        var g = doc.createElementNS(ns, 'g'); g.setAttribute('class', 'sc-fly'); g.setAttribute('aria-hidden', 'true');
        var k = sz / 30;
        g.innerHTML = '<g transform="scale(' + r2(k) + ')"><path class="sc-fly__wing" d="M16 0 L-14 -12 L-6 0 L-14 12 Z"/><path class="sc-fly__fold" d="M16 0 L-6 0 L-10 7 Z"/></g>';
        svg.appendChild(g);
        var dash = 10 * U, gap = 12 * U;
        fn(g, at, dur + tail, function (t, p) {
          if (L == null) L = path.getTotalLength();
          var s = Math.min(1, p * (dur + tail) / dur), e = Ez(s), d = e * L;
          var parts = [], acc = 0;
          while (acc + dash < d) { parts.push(dash, gap); acc += dash + gap; }
          parts.push(Math.max(0, d - acc), L + 1);
          trail.style.strokeDasharray = p <= 0 ? '0 ' + (L + 1) : parts.map(r2).join(' ');
          trail.style.opacity = p <= 0 ? '0' : '1';   // 起飛前連線頭的圓點都不留
          if (p <= 0) { t.style.opacity = '0'; t.removeAttribute('transform'); return; }
          var a = path.getPointAtLength(Math.max(0, d - 1)), b2 = path.getPointAtLength(Math.min(L, d + 1)), pt = path.getPointAtLength(d);
          var ang = Math.atan2(b2.y - a.y, b2.x - a.x) * 180 / Math.PI;
          t.setAttribute('transform', 'translate(' + r2(pt.x) + ' ' + r2(pt.y) + ') rotate(' + r2(ang) + ')');
          var after = (p * (dur + tail) - dur) / tail;
          t.style.opacity = String(after > 0 ? Math.max(0, 1 - after) : 1);
        });
      });
      return P;
    };
    // 紙膠帶：卡片從 1.05 倍、多轉 3° 落到 rot（−2°）貼平，0.35s 後兩條膠帶依序啪地貼上兩個上角（自動插 .sc-tape）；
    //   卡片要能露出角落（不要 overflow:hidden）
    P.tape = function (sel, at, o) {
      var rot = opt(o, 'rot', -2), dur = opt(o, 'dur', 0.35);
      q(sel).forEach(function (el) {
        relPos(el); el.setAttribute('data-layout-allow-overlap', '');
        mv([el], at, { opacity: 0, scale: 1.05, rotation: rot + 3 }, { opacity: 1, scale: 1, rotation: rot }, dur, 'power3.out', 0);
        ['l', 'r'].forEach(function (side, i) {
          var tp = el.querySelector(':scope > .sc-tape--' + side);
          if (!tp) { tp = mk(el, 'sc-tape sc-tape--' + side); tp.setAttribute('data-layout-allow-overlap', ''); el.appendChild(tp); }
          mv([tp], at + dur - 0.05 + i * 0.12, { opacity: 0, scale: 1.45 }, { opacity: 1, scale: 1 }, 0.16, 'power4.in', 0);
        });
      });
      return P;
    };
    // 翻起來：以底邊（origin）為軸從 from 度翻到 0（透視 900）；transform-origin 寫在元素 style（載入時，不進 timeline）
    P.hinge = function (sel, at, o) {
      var list = q(sel), org = opt(o, 'origin', '50% 100%');
      list.forEach(function (el) { el.style.transformOrigin = org; });
      mv(list, at, { opacity: 0, rotationX: opt(o, 'from', -90), transformPerspective: 900 }, { opacity: 1, rotationX: 0, transformPerspective: 900 },
        opt(o, 'dur', 0.6), 'back.out(1.3)', opt(o, 'stagger', 0));
      return P;
    };
    // 聲紋：sel 是容器，裡面的 .sc-wave__bar 跟著時間起伏（沒有就自動插 o.bars 根，預設照容器寬每 14px 一根）；固定種子的正弦疊加，
    //   任何時間點畫面一樣；頭尾 0.3s 漸入漸出；until 之後回到靜止（扁平的短條）
    P.wave = function (sel, at, o) {
      var until = o && o.until != null ? o.until : P.dur(), amp = opt(o, 'amp', 1);
      q(sel).forEach(function (el) {
        var bars = Array.prototype.slice.call(el.querySelectorAll('.sc-wave__bar'));
        var n = opt(o, 'bars', Math.max(6, Math.floor((el.offsetWidth + 6) / 14)));   // 預設照容器寬：每根 8px＋間距 6px
        if (!bars.length) { for (var i = 0; i < n; i++) { var b = mk(el, 'sc-wave__bar'); el.appendChild(b); bars.push(b); } }
        el.classList.add('sc-wave');
        var len = Math.max(0.2, until - at), ramp = Math.min(0.3, len / 2);
        fn(el, at, len, function (t, p) {
          var s = p * len, env = p <= 0 || p >= 1 ? 0 : Math.max(0, Math.min(1, s / ramp, (len - s) / ramp));
          bars.forEach(function (bar, k) {
            var c = Math.abs(k - (bars.length - 1) / 2) / Math.max(1, (bars.length - 1) / 2), shape = 1 - 0.55 * c * c;
            var v = 0.5 + 0.28 * Math.sin(s * 9.1 + k * 1.7) + 0.22 * Math.sin(s * 15.3 + k * 2.9 + 1.3);
            bar.style.scale = '1 ' + r2(0.14 + 0.86 * amp * shape * Math.max(0, Math.min(1, v)) * env);
          });
        });
      });
      return P;
    };
    // 載入圈：等速轉（period 秒一圈，預設 0.9）到 until（預設段尾）；之後通常接 P.out 收掉、換成勾
    P.spin = function (sel, at, o) {
      var until = o && o.until != null ? o.until : P.dur(), per = opt(o, 'period', 0.9), len = Math.max(0.1, until - at);
      mv(q(sel), at, { rotation: 0 }, { rotation: r2(360 * len / per) }, len, 'none', 0);
      return P;
    };
    // 虛線流動：stroke-dasharray 由 CSS 決定，dashoffset 等速往前（speed u／s，預設 24）；容器不要位移
    P.flow = function (sel, at, o) {
      var until = o && o.until != null ? o.until : P.dur(), sp = opt(o, 'speed', 24) * U;
      q(sel).forEach(function (el) {
        var len = Math.max(0.1, until - at);
        mv([el], at, { strokeDashoffset: 0 }, { strokeDashoffset: -sp * len, autoRound: false }, len, 'none', 0);
      });
      return P;
    };
    // 正弦微動（period 秒，頭尾 ramp 秒漸入漸出）：寫 scale（呼吸）
    var wave = function (els, at, o) {
      var until = o && o.until != null ? o.until : P.dur(), per = opt(o, 'period', 3.2);
      var S = opt(o, 'scale', 0);
      els.forEach(function (el, i) {
        var len = Math.max(0.2, until - at), ramp = Math.min(opt(o, 'ramp', 0.8), len / 2), ph = opt(o, 'phase', 0) + i * 1.3;
        fn(el, at, len, function (t, p) {
          var s = p * len, env = Math.max(0, Math.min(1, s / ramp, (len - s) / ramp));
          t.style.scale = String(Math.round((1 + S * Math.sin(2 * Math.PI * s / per + ph) * env) * 10000) / 10000);
        });
      });
    };
    // 微動：呼吸（scale 比例）。不做漂浮：卡片、焦點落定後還上下飄，看起來在晃（使用者：「出現的動畫窗都會輕微晃動」）；
    //   舊檔寫的 y、x 不動作，沒寫 scale 就整個不做
    P.idle = function (sel, at, o) {
      if (opt(o, 'scale', 0)) wave(q(sel), at, o);
      return P;
    };
    // 焦點 v2：active 放大＋抬起（lift u）＋亮框發光，其他壓暗縮小；null＝回均衡，'none'＝預覽態（全部壓暗）；
    //   o.done＝走過的元素（亮度 0.92、留細框）。group 只放已經進場的元素，照時間先後寫
    P.spot = function (group, active, at, o) {
      if (Array.isArray(active) && !active.length) active = 'none';   // 舊的 $q 包裝會把 'none' 變成空陣列
      var items = q(group), act = active == null || active === 'none' ? null : q(active)[0];
      if (active != null && active !== 'none' && (!act || items.indexOf(act) < 0)) throw new Error('P.spot：active 要是 group 裡的元素（' + active + '）');
      var dim = opt(o, 'dim', 0.42), dur = opt(o, 'dur', 0.5), S = opt(o, 'scale', 1.07), lift = opt(o, 'lift', -10) * U;
      var done = o && o.done ? q(o.done) : [];
      items.forEach(function (el) {
        var g = el.querySelector(':scope > [data-sc-spot]');
        if (!g) { g = mk(el, 'sc-spot'); g.setAttribute('data-sc-spot', ''); el.appendChild(g); relPos(el); }
        var cur = spotState.get(el) || { o: 1, s: 1, y: 0, g: 0, d: 0, t: -1, t0: -1 }, a = at;
        if (a < cur.t - 0.001) {
          if (a < cur.t0 - 0.001) throw new Error('P.spot 要照時間先後寫：' + nameOf(el) + ' 在 ' + r3(cur.t0) + 's 已經有焦點變化，這一行是 ' + r3(a) + 's');
          a = cur.t;   // 上一個焦點還在轉場（兩拍太近）：接在它後面，不丟錯（丟錯整段會停在空白的初始畫面）
        }
        var tg = el === act ? { o: 1, s: S, y: lift, g: 1, d: 0 }
          : done.indexOf(el) >= 0 ? { o: 0.92, s: 1, y: 0, g: 0, d: 1 }
          : active === 'none' || act ? { o: dim, s: 0.96, y: 0, g: 0, d: 0 } : { o: 1, s: 1, y: 0, g: 0, d: cur.d };
        mv([el], a, { opacity: cur.o, scale: cur.s, y: cur.y }, { opacity: tg.o, scale: tg.s, y: tg.y }, dur, 'power3.out', 0);
        mv([g], a, { opacity: cur.g }, { opacity: tg.g }, dur * 0.8, 'sine.inOut', 0);
        tg.t0 = a; tg.t = a + dur; spotState.set(el, tg);
      });
      return P;
    };
    // 鏡頭：容器的推拉搖（x、y 用 u，scale 比例），或 {to: 目標元素, k}＝往那個元素帶 k 比例；dur ≥ 2s 的慢推算微動
    // 底版（有底色、框線或陰影的容器：主卡、視窗）不推：推了底版跟著動、撞到右上角的小節角標（使用者：「底版沒有固定會跟著一起移動，甚至還撞到右上角的標題」）
    var isBoard = function (el) {
      if (!el || el.nodeType !== 1 || typeof getComputedStyle !== 'function') return false;
      var cs = getComputedStyle(el), bg = cs.backgroundColor || '';
      return (bg && bg !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(bg)) || (cs.backgroundImage && cs.backgroundImage !== 'none')
        || parseFloat(cs.borderTopWidth) > 0 || (cs.boxShadow && cs.boxShadow !== 'none');
    };
    P.cam = function (sel, at, o) {
      var dur = opt(o, 'dur', V2.MOVE);
      if (dur >= 2) CALL.role = 'micro';
      q(sel).forEach(function (el) {
        if (isBoard(el)) return;
        var cur = camState.get(el) || { x: 0, y: 0, s: 1 }, s = opt(o, 'scale', 1), x = opt(o, 'x', 0) * U, y = opt(o, 'y', 0) * U;
        // 直式舞台：只推近、不往焦點帶，原點放在容器上緣中點（主卡頂在舞台窗頂 y 130＝直式 unsafe 線，往上長會進平台介面；下面離講者面板還有 29–40px）
        if (o && o.to && STAGED) { x = 0; y = 0; }
        else if (o && o.to) {
          var t = q(o.to)[0], b = boxOf(t, el), cx = el.offsetWidth / 2, cy = el.offsetHeight / 2, k = opt(o, 'k', 0.12);
          x = -k * s * (b.x + b.w / 2 - cx); y = -k * s * (b.y + b.h / 2 - cy);
        }
        var tg = { x: Math.round(x), y: Math.round(y), s: s }, org = STAGED ? '50% 0%' : '50% 50%';
        mv([el], at, { x: cur.x, y: cur.y, scale: cur.s, transformOrigin: org }, { x: tg.x, y: tg.y, scale: tg.s, transformOrigin: org, force3D: false }, dur, opt(o, 'ease', V2.EASE.move), 0);
        camState.set(el, tg);
      });
      return P;
    };
    // 長出：卡片從某個區域（預設 pip）長成自己的大小（container transform）；卡片要固定寬高
    //   起點（區域）與目標框（卡片的版面位置）在呼叫時（掛載）就算好，seek 時不量 DOM：render 的 worker／snapshot 從段前一格
    //   跳進長出期時，合成可能還沒顯示（display:none 量到 0 寬 → transform 變無效值 → 截到原尺寸的卡，亂序差 15–58 萬色值）
    P.grow = function (sel, at, o) {
      var fr = REGION(opt(o, 'from', 'pip')), dur = opt(o, 'dur', 0.8), Ez = gsap.parseEase(opt(o, 'ease', V2.EASE.in));
      q(sel).forEach(function (el) {
        var b = boxOf(el, null);   // 掛載時量一次
        fn(el, at, dur, function (t, p) {
          if (p <= 0) { t.style.opacity = '0'; return; }
          t.style.opacity = '1';
          if (p >= 1) { t.style.transform = 'none'; return; }
          if (!b.w || !b.h) b = boxOf(t, null);   // 掛載時還沒排版：第一次量得到大小時記下來（之後固定）
          if (!b.w || !b.h) return;
          var e = Ez(p);
          var sx = fr[2] / b.w, sy = fr[3] / b.h, dx = fr[0] - b.x, dy = fr[1] - b.y;
          t.style.transformOrigin = '0 0';
          t.style.transform = 'translate(' + (dx * (1 - e)) + 'px,' + (dy * (1 - e)) + 'px) scale(' + (sx + (1 - sx) * e) + ',' + (sy + (1 - sy) * e) + ')';
        });
      });
      return P;
    };
    // 光澤：一道斜光掃過（自動插 <i class="sc-sheen">；元素要 overflow:hidden 或本身有 clip）
    P.sheen = function (sel, at, o) {
      var dur = opt(o, 'dur', 0.7), Ez = gsap.parseEase('power2.inOut');
      q(sel).forEach(function (el) {
        relPos(el);
        var s = mk(el, 'sc-sheen'); el.appendChild(s);
        fn(s, at, dur, function (t, p) {
          if (p <= 0 || p >= 1) { t.style.opacity = '0'; t.style.transform = 'translateX(-120%)'; return; }
          t.style.opacity = '1'; t.style.transform = 'translateX(' + (-120 + 240 * Ez(p)) + '%)';
        });
      });
      return P;
    };
    // 擦開／擦掉：clip-path 由一側揭開（dir left／right／up／down）；四邊外擴 20% 不切落影與底板
    P.wipe = function (sel, at, o) {
      mv(q(sel), at, { clipPath: dirClip(opt(o, 'dir', 'left')) }, { clipPath: V2.CLIP.open }, opt(o, 'dur', V2.IN), opt(o, 'ease', V2.EASE.in), opt(o, 'stagger', 0));
      return P;
    };
    P.wipeOut = function (sel, at, o) {
      mv(q(sel), at, { clipPath: V2.CLIP.open }, { clipPath: dirClip(opt(o, 'dir', 'left')) }, opt(o, 'dur', V2.OUT), V2.EASE.out, opt(o, 'stagger', 0));
      return P;
    };
    // 抽屜：從自己盒子的一側整個滑進來／收回（xPercent／yPercent ±100）；外層要 overflow:hidden
    var slideAx = function (d) {
      if (!/^(left|right|up|down)$/.test(d)) throw new Error('方向要是 left／right／up／down，現在是 ' + d);
      return { k: d === 'left' || d === 'up' ? -100 : 100, ax: d === 'left' || d === 'right' ? 'xPercent' : 'yPercent' };
    };
    P.slide = function (sel, at, o) {
      var s = slideAx(opt(o, 'from', 'left')), f = {}, t = {}; f[s.ax] = s.k; t[s.ax] = 0;
      mv(q(sel), at, f, t, opt(o, 'dur', V2.IN), opt(o, 'ease', V2.EASE.in), opt(o, 'stagger', 0));
      return P;
    };
    P.slideOut = function (sel, at, o) {
      var s = slideAx(opt(o, 'to', 'left')), f = {}, t = {}; f[s.ax] = 0; t[s.ax] = s.k;
      mv(q(sel), at, f, t, opt(o, 'dur', 0.28), V2.EASE.out, opt(o, 'stagger', 0));
      return P;
    };
    // 退焦：壓暗到 to（預設 0.6、0.4s）；P.dim(sel, at, {to: 1}) 回來
    P.dim = function (sel, at, o) {
      q(sel).forEach(function (el) {
        var cur = dimState.has(el) ? dimState.get(el) : 1, to = opt(o, 'to', 0.6);
        mv([el], at, { opacity: cur }, { opacity: to }, opt(o, 'dur', 0.4), 'sine.inOut', 0);
        dimState.set(el, to);
      });
      return P;
    };
    // 彈出：縮放＋上移（dy u）＋淡入，back.out 過衝落地；to＝落地亮度
    P.pop = function (sel, at, o) {
      mv(q(sel), at, { opacity: 0, scale: opt(o, 'from', 0.82), y: opt(o, 'dy', 28) * U }, { opacity: opt(o, 'to', 1), scale: 1, y: 0 }, opt(o, 'dur', 0.55), opt(o, 'ease', 'back.out(1.6)'), opt(o, 'stagger', 0));
      return P;
    };
    // 音效拍點：宣告這一拍的音效並回傳秒數（＝P.at(ref, off)）；ref 寫成字串字面值，build 靜態解析出 <audio>（motion.md §3）
    P.sfx = function (name, ref, off) {
      if (typeof name !== 'string' || !/^[a-z0-9-]+$/.test(name)) throw new Error("P.sfx 第一個參數是音效名（shared/sfx 的檔名、不含 .wav），例如 P.sfx('success', '#38@兩支')；現在是 " + String(name));
      var t = P.at(ref, off);
      sfxList.push({ name: name, ref: ref, off: off == null ? 0 : off, t: t });
      return t;
    };
    // 每個 P.* 呼叫打一個編號與角色（tween 的 data：{ sc, role, fn }）：audit 把同一呼叫的錯拍算 1 個新元素、
    // 「微動」（idle／flow、≥ 2s 的鏡頭慢推）不算停留中的動作（motion.md §4）
    Object.keys(P).forEach(function (k) {
      var f = P[k];
      if (typeof f !== 'function' || k === 'at' || k === 'dur' || k === 'pushEase' || k === 'region' || k === 'prev') return;
      P[k] = function () {
        var outer = CALL.depth++ === 0;
        if (outer) { CALL.id = ++CALLS.n; CALL.role = ROLE[k] || 'enter'; CALL.fn = k; }
        try { return f.apply(P, arguments); } finally { CALL.depth--; if (outer) CALL.role = null; }
      };
    });
    return P;
  };
  window.SceneMotion.V2 = V2C;
  window.SceneMotion.REGIONS = REGIONS;
  window.SceneMotion.pushEase = pushEase;
  window.SceneMotion.knots = E.slice();
})();
