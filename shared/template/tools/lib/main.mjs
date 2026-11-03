// 主合成 index.html／test.html（規格 §B.2、§B.6）與情境預覽頁 preview/NN-key.html（§F.3）
//
//   buildMain({ items, videoDur, captions, pip, sideShift, bg, test, footage, editFx, cues, outro, badges, canvas }) → { html, skipped }
//     canvas    lib/canvas.mjs 的版式設定（預設橫式；橫式輸出和沒有這個參數時逐位元組相同）。直式（009 FR-021–026）：
//               root／viewport／底片／字幕 host 1080×1920；window.__regions 注入具名區域；舞台縮放的幕（01、04 家族、全畫面情境動畫、
//               字卡動態）host 帶 stageTransform 的 CSS transform＋data-layout-allow-overflow，下面墊一層整張畫布的純色底（#bd-<id>，
//               同起迄、同進退場）；疊加情境與 overlay 情境動畫 host 1080×1920；講者面板 pip.box（上緣 6px 主色線）；角標左上；色帶掃過 1080 寬
//     items     resolvePlan().items（起點排序；已有 compId／file／start／end／fade 資訊；media 段由 lib/media.mjs 產生）
//     videoDur  成片長度（有 edit.cuts 時已扣掉剪掉的範圍）
//     footage／editFx  resolvePlan() 的同名欄位（沒有 edit 時是 null，輸出和舊版逐位元組相同）
//     captions  { compId, file }
//     pip       pipGeometry() 結果
//     test      { t0, len }：產生測試片段（root 長度＝len，底片 data-media-start＝t0，全部平移 −t0）
//     cues      成片秒數的字幕（resolvePlan().cuesOut）：有 custom 段時注入 window.__cues（specs/contracts/cues.md §2）
//     outro     { file, at, dur }：結尾配樂（build 用 renderBgmClip 做好的 wav；at 是成片秒數）
//     badges    resolvePlan().badges：常駐章節角標 [{ k, num, name, start, end, show: [[s, e]] }]（成片秒數；plan.json "chapterBadge": false 時是空陣列）
//               02 章節角標段（it.noHost）不放 host，只留音效
//   v2 轉場（specs/010-motion-v2/design-system.md §5、§7；用哪一種看 plan.mjs 的 it.txIn／it.txOut）：
//     wipe   色帶帶路擦開：主色帶 150、墨色細帶 48 由右往左 0.62s（expo.inOut），新的幕緊跟細帶右緣（host clip-path）；講者 0.75s 飛進子母畫面、0.62s 外框彈出
//     retract 色帶反向由左往右收 0.5s、子母畫面 0.3s 淡出（片尾 1 秒內結束的段改淡出 0.5s、片尾前一格做完：plan.mjs 的 tailFade）；swap 換卡不換景：舊的幕多留 0.3s 疊在新的幕上，只留內容區、向左擦掉（新卡由段內 P.wipe＋P.pop）
//     chapter 主色色塊從左下斜擦滿版 0.45s，章節幕晚 0.08s 跟上；band 疊加卡進場時講者不縮放（不做慢推）
//     主時間軸對 host 只動 opacity、clip-path（不動 x／y／scale：009 直式的舞台縮放寫在 host 的 CSS transform）；常駐角標用 kit 的 P.wipe／P.pop／P.chars（同 02 模板）
//   withTheme(html, theme)：theme＝"dark" 時在第一個 <html 加 data-theme="dark"（主合成與 build 產生的每個子合成都套；亮色原樣回傳）
//   子母畫面片段的 enter（fly／fade／none）、exit（layer／fade／none）由 plan.mjs 的 pipMotion 決定；擦入擦出 wipeIn／wipeOut 是 host 的 clip-path
//   buildPreview({ scene, parts, D, sub, pipStyle, cues, wide }) → html（獨立頁，不是 HF 合成；cues＝[{ sound, at, volume? }] 畫面事件秒數，給父頁排音效；wide＝全寬版型示意）

import { r3, FPS } from './time.mjs';
import { SCOPE_P } from './assemble.mjs';
import { mediaParts, EXIT } from './media.mjs';
import { CANVAS, stageTransform, regionsScript } from './canvas.mjs';

const FADE = 0.5;
const PUSH = 0.7;
const PIP_FADE = 0.4;      // 子母畫面原地淡入
const WIPE = 0.45;         // 旁白段擦入擦出
export const V2TX = {
  wipe: 0.62, bandA: 150, bandB: 48,   // 色帶擦開（expo.inOut）
  retract: 0.5, pipOut: 0.3,           // 色帶收回、子母畫面淡出
  swapOut: 0.3,                        // 換卡不換景：舊卡擦掉（power2.in）
  chapter: 0.45, chapterLag: 0.08,     // 章節色塊斜擦
  fly: 0.75, land: 0.62, pop: 0.35,    // 子母畫面飛入（power3.inOut）、外框淡入
};
const SWAP_KEEP = 'inset(96px 516px 186px 96px)', SWAP_GONE = 'inset(96px 1824px 186px 96px)';   // 換卡：只留內容區 x 96–1404、y 96–894，再往左擦掉
const TRI0 = 'polygon(0% 100%, 0% 100%, 0% 100%)', TRI1 = 'polygon(0% 100%, 0% -100%, 200% 100%)';   // 從左下角斜擦滿版

// media 段的 pre-roll／post-roll（擦入擦出、章節墊底時底下的錄影提早或多播）與疊化：給 mediaParts 一份調過起迄的複本
function rolled(it, t0) {
  const pre = Math.min(it.preroll || 0, Math.max(0, it.start - t0)), post = it.postroll || 0;
  if (!pre && !post && !it.xfade) return it;
  const m = it.media;
  let pieces = m.pieces;
  if (m.kind === 'video' && pieces?.length) {
    pieces = pieces.map((p) => ({ ...p }));
    if (pre) { pieces[0].s = r3(pieces[0].s - pre); pieces[0].fms = r3(Math.max(0, pieces[0].fms - pre)); }
    if (post) pieces[pieces.length - 1].e = r3(pieces[pieces.length - 1].e + post);
  }
  return { ...it, start: r3(it.start - pre), end: r3(it.end + post), enterFx: it.xfade ? 'cut' : it.enterFx, media: { ...m, pieces } };
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attrJson = (o) => JSON.stringify(o).replace(/&/g, '&amp;').replace(/'/g, '&#39;');
const n3 = (x) => String(r3(x));
const indent = (s, n) => s.replace(/\s+$/, '').split('\n').map((l) => (l ? ' '.repeat(n) + l : l)).join('\n');

// illus.css／illus.js：011 的示意插圖元件（specs/contracts/illus.md）；主合成、--gallery 預覽頁、情境動畫預覽頁都載
export const KIT_LINKS = ['kit/fonts.css', 'kit/brand.css', 'kit/scene.css', 'kit/illus.css', 'kit/theme.css', 'kit/captions.css'];

// 背景圖：每種版面各一張（bg-fs.jpg 全畫面（插入素材是黑底，kit/media.css .mbg）、bg-side.jpg 側邊欄面板 960×1080、bg-ch.jpg 章節轉場），沒有的那張退回 bg.jpg
export const BG_FILES = { fs: "bg-fs.jpg", side: "bg-side.jpg", ch: "bg-ch.jpg" };
// 暗色主題（plan.json "theme": "dark"）：kit/scene.css 的 :root[data-theme="dark"] 換 token；已經寫了 data-theme 的不動
export function withTheme(html, theme) {
  return theme === 'dark' ? html.replace(/<html\b(?![^>]*\bdata-theme=)/, '<html data-theme="dark"') : html;
}
export function bgCss(prefix, bg = { fs: "bg.jpg", side: "bg.jpg", ch: "bg.jpg" }) {
  const out = [];
  if (bg.fs) out.push(`.sc-surface-fs { background-image: url("${prefix}${bg.fs}"); background-size: cover; background-position: center; }`);
  if (bg.ch) out.push(`.sc-surface-ch { background-image: url("${prefix}${bg.ch}"); background-size: cover; background-position: center; }`);
  if (bg.side) out.push(bg.side === "bg.jpg"
    ? `.sc-surface-side { background-image: url("${prefix}bg.jpg"); background-size: 1920px auto; background-position: 0 50%; }`
    : `.sc-surface-side { background-image: url("${prefix}${bg.side}"); background-size: cover; background-position: center; }`);
  return out.join("\n");
}

// 常駐章節角標的動態：進場（章節起點）同 02 模板（由右擦開＋號碼彈出＋章名逐字，kit 的 P.*）；版面切到子母畫面／全幕時淡出 0.3 秒、回來淡入 0.3 秒；章節結束前 0.3 秒向右擦掉
const BADGE_FADE = 0.3, BADGE_Z = 25, SECTION_Z = 55, SECTION_SWAP = 0.25, SECTION_MOVE = 0.35;   // SECTION_MOVE：錄影段滑到錄影畫面右上角；SECTION_Z 同 plan.mjs 的 SECTION.z（小節角標要蓋過全幕情境）
// 角標不是 clip（HF lint：有子元素的 clip 要做成子合成），露出與否全由 GSAP 的 opacity 決定：時間 0 先設好、章節前是 0
function badgeParts(b, { t0, DUR, C = CANVAS.landscape }) {
  const id = `chb-${b.k}`;
  const s = r3(b.start - t0), e = r3(Math.min(b.end - t0, DUR));
  if (e <= 0 || s >= DUR) return null;
  const st = Math.max(0, s);
  const ev = [];
  // 第一次露出（章節起點，或章節開頭被全畫面蓋住時第一次回到講者）做完整進場；之後版面切回來只淡入
  for (const [i, [a, z]] of b.show.entries()) {
    ev.push(i === 0 ? { at: a, kind: 'enter' } : { at: a, kind: 'in' });
    ev.push(Math.abs(z - b.end) < 1e-6 ? { at: r3(Math.max(a, z - BADGE_FADE)), kind: 'last' } : { at: z, kind: 'out' });
  }
  // 小節角標（plan.json sections）：一章一個外框（露出／隱藏、章節進退場照下面），裡面每個小節一顆「章號＋小節名」膠囊，寬度跟著自己的字；
  // 講到下一節時舊的擦掉（0.25 秒）、新的擦開（0.35 秒）。整段都在角標露出前（或測試片段起點前）就結束的小節不放（沒擦開過會整顆露著）
  const dir = C.format === 'portrait' ? 'left' : 'right', shown0 = b.show[0][0];
  const caps = b.subs ? (!b.subs.length || b.subs[0].at > b.start + 1e-6 ? [{ at: b.start, name: b.name }] : []).concat(b.subs)
    .map((x, k, a) => ({ ...x, end: a[k + 1]?.at ?? b.end }))
    .filter((x) => x.end > shown0 + 1e-6 && x.end - t0 > 1e-6)
    .map((x, k) => ({ ...x, cid: `${id}-n${k + 1}` })) : null;
  const capAt = (t) => caps.find((x) => t >= x.at - 1e-6 && t < x.end - 1e-6) || caps[caps.length - 1];
  const tl = [];
  const live = ev.filter((x) => x.at - t0 >= st - 1e-6 && x.at - t0 < DUR);
  const first = live[0], lastEv = live.find((x) => x.kind === 'last');
  const shownAt = (t) => b.show.some(([a, z]) => t >= a - 1e-6 && t < z - 1e-6);
  const init = st > 1e-6 ? 0 : first && Math.abs(first.at - t0) < 1e-6 ? (['out', 'last'].includes(first.kind) ? 1 : 0) : shownAt(t0) ? 1 : 0;
  tl.push(`tl.set('#${id}', { opacity: ${init} }, 0);`);
  for (const x of live) {
    const at = n3(x.at - t0);
    // 進場同 02 模板（design-system §5「任何 → 章節角標」）：由右擦開 0.35 → 0.12 號碼彈出 → 0.2 章名逐字；章節結束向右擦掉
    if (x.kind === 'enter' && b.subs) tl.push(`tl.set('#${id}', { opacity: 1 }, ${at});`);   // 膠囊的擦開在下面（小節各一顆）
    else if (x.kind === 'enter') tl.push(`tl.set('#${id}', { opacity: 1 }, ${at});`, `P.wipe('#${id}', ${at}, { dir: 'right', dur: 0.35 });`, `P.pop('#${id} .sc-chtag__num', ${n3(x.at - t0 + 0.12)}, { from: 0.4, dy: 0 });`, `P.chars('#${id} .sc-chtag__name', ${n3(x.at - t0 + 0.2)});`);
    else if (x.kind === 'last' && caps) continue;   // 章節結束：擦掉當下那顆膠囊（下面，要排在它的擦開之後：同一元素第一個 clipPath 補間會先套用初始狀態）
    else if (x.kind === 'last') tl.push(`P.wipeOut('#${id}', ${at}, { dir: 'right' });`);
    else if (x.kind === 'in') tl.push(`tl.fromTo('#${id}', { opacity: 0 }, { opacity: 1, duration: ${BADGE_FADE}, ease: 'sine.out', immediateRender: false }, ${at});`);
    else tl.push(`tl.fromTo('#${id}', { opacity: 1 }, { opacity: 0, duration: ${BADGE_FADE}, ease: 'sine.in', immediateRender: false }, ${at});`);
  }
  // 直式：左上（canvas.mjs 的 badge.rect；右上是平台按鈕列）
  const pos = C.format === 'portrait' ? `left:${C.badge.rect[0]}px;top:${C.badge.rect[1]}px` : 'right:96px;top:56px';
  if (caps) {
    for (const x of caps) {
      const inAt = r3(Math.max(x.at, shown0) - t0), enter = x.at <= shown0 + 1e-6;
      if (inAt >= 0 && inAt < DUR) {
        const at = enter ? inAt : r3(inAt + SECTION_SWAP);
        tl.push(`P.wipe('#${x.cid}', ${n3(at)}, { dir: '${dir}', dur: 0.35 });`);
        if (enter) tl.push(`P.pop('#${x.cid} .sc-sectag__num', ${n3(at + 0.12)}, { from: 0.4, dy: 0 });`);
      }
      const outAt = r3(x.end - t0);
      if (x.end < b.end - 1e-6 && x.end > shown0 + 1e-6 && outAt >= 0 && outAt < DUR) tl.push(`P.wipeOut('#${x.cid}', ${n3(outAt)}, { dir: '${dir}', dur: ${SECTION_SWAP} });`);
      if (lastEv && capAt(lastEv.at) === x) tl.push(`P.wipeOut('#${x.cid}', ${n3(lastEv.at - t0)}, { dir: '${dir}' });`);
    }
    // 橫式錄影段（plan.mjs badges[].spots）：外框滑到錄影畫面的右上角、段落結束滑回（相鄰兩段錄影直接滑到下一個位置）
    if (b.spots) {
      const pos = (t) => b.spots.find((p) => t >= p.a - 1e-6 && t < p.z - 1e-6) || { dx: 0, dy: 0 };
      const marks = [...new Set(b.spots.flatMap((p) => [p.a, p.z]))].sort((p, q) => p - q);
      const p0 = pos(t0);
      if (p0.dx || p0.dy) tl.push(`tl.set('#${id}', { x: ${p0.dx}, y: ${p0.dy} }, 0);`);
      for (const t of marks) {
        const at = r3(t - t0), f = pos(t - 1e-3), g = pos(t);
        if (at < 0 || at >= DUR || (f.dx === g.dx && f.dy === g.dy)) continue;
        tl.push(`tl.fromTo('#${id}', { x: ${f.dx}, y: ${f.dy} }, { x: ${g.dx}, y: ${g.dy}, duration: ${SECTION_MOVE}, ease: 'sine.inOut', immediateRender: false }, ${n3(at)});`);
      }
    }
    const html = `  <div id="${id}" class="sc-secwrap${dir === 'left' ? ' sc-secwrap--left' : ''}" data-chapter-badge="${n3(st)}–${n3(e)}" style="${pos};z-index:${SECTION_Z};opacity:0">
${caps.map((x) => `    <div id="${x.cid}" class="sc-sectag"><span class="sc-sectag__num">${esc(b.num)}</span><span class="sc-sectag__name">${esc(x.name)}</span></div>`).join('\n')}
  </div>`;
    return { html, tl };
  }
  const html = `  <div id="${id}" class="sc-chtag" data-chapter-badge="${n3(st)}–${n3(e)}" style="${pos};z-index:${BADGE_Z};opacity:0">
    <div class="sc-chtag__shell"><span class="sc-chtag__num">${esc(b.num)}</span></div>
    <div class="sc-chtag__band"><span class="sc-chtag__name">${esc(b.name)}</span></div>
  </div>`;
  return { html, tl };
}

// 直式字卡動態的底色（fx/effects/fx-kit.js 的 --fx-bg；accent＝主色）
const FX_BG = { dark: '#232733', light: '#f3efe6', accent: 'var(--brand)' };

// cut（剪映素材，capcut.mjs）：要和 test 一起給（時間窗）
//   { kind: 'seg', id, keepFootage }  只放這一段（含它的子母畫面與音效）；透明底、沒有字幕、角標、主軌聲音、剪輯台過黑／淡入淡出；
//                                      keepFootage＝側邊欄段（講者被推到右邊）連底片一起放（靜音），剪映疊上去才對得起來
//   { kind: 'main' }                  主軌：只有底片＋人聲＋剪輯台（跳接放大、過黑、淡入淡出）＋片尾配樂；沒有情境、字幕、角標、段落音效
export function buildMain({ items, videoDur, captions, pip, sideShift = 480, bg = false, test = null, footage = null, editFx = null, cues = null, outro = null, badges = [], canvas = null, cut = null }) {
  const C = canvas || CANVAS.landscape, portrait = C.format === 'portrait', W = C.W, H = C.H;
  const segCut = cut?.kind === 'seg', mainCut = cut?.kind === 'main';
  if (cut) {
    items = segCut ? items.filter((it) => it.id === cut.id) : [];
    badges = [];
    captions = null;
    if (segCut) { outro = null; editFx = editFx && { ...editFx, punches: [], dips: [], fadeIn: 0, fadeOut: 0 }; }
  }
  const compName = segCut ? `capcut-${cut.id}` : mainCut ? 'capcut-main' : test ? 'test-clip' : 'main';
  const PB = C.pip.box;   // 子母畫面本體（橫式 1424,594、432×324）／講者面板（直式 0,900、1080×1020）
  const t0 = test ? test.t0 : 0;
  // 測試片段放在 compositions/test-clip.html（放在專案根目錄會被 lint 當成第二個 root：multiple_root_compositions，
  // 正式 render 還可能重複播音）。data-composition-src 以專案根目錄為準，其他相對路徑以檔案位置為準，所以 kit／assets 前面加 ../
  const base = test ? '../' : '';
  // root 不用 id="root"：字卡動態（fx-*.html）子合成的根就叫 #root，主合成寫 #root { background:#000 } 會套到它身上、把底片整個蓋黑
  const rootId = cut ? 'capcut-root' : test ? 'test-root' : 'main-root';
  const DUR = test ? r3(Math.min(test.len, videoDur - t0)) : videoDur;
  const skipped = [];
  // 測試片段：只收起點落在 [t0, t0+len) 的段；起點在 t0 之前、還在播的段略過並回報
  const list = [];
  for (const it of items) {
    if (!test) { list.push({ ...it, s: it.start, e: it.end, fullEnd: true }); continue; }
    if (it.start >= t0 - 1e-6 && it.start < t0 + DUR) list.push({ ...it, s: r3(it.start - t0), e: r3(Math.min(it.end - t0, DUR)), fullEnd: it.end - t0 <= DUR + 1e-6 });
    else if (it.start < t0 && it.end > t0) skipped.push(it);
  }
  let track = 2;
  const hosts = [], pips = [], tl = [];
  const footTweens = [];
  const hasMedia = list.some((it) => it.type === 'media');
  const hasLens = list.some((it) => it.type === 'media' && it.media.lenses?.length);
  // 子母畫面飛入的起點：容器（左上 1424,594、432×324）放大 K 倍、平移到 pipCrop 的位置 → 第一格和底下的講者逐像素重合（plan.md P-05）
  const crop = pip.crop || { x: PB[0], y: PB[1], w: PB[2] };
  const FLY = { x: r3(crop.x - PB[0]), y: r3(crop.y - PB[1]), k: r3(crop.w / PB[2]) };
  const bands = [];   // 色帶（z 35，在子母畫面 40、字幕 60 之下）
  const bandPair = (at, dir) => {
    const k = bands.length;
    const [a0, a1, b0, b1] = dir === 'in' ? [W, -(V2TX.bandA + V2TX.bandB), W + V2TX.bandA, -V2TX.bandB] : [-(V2TX.bandA + V2TX.bandB), W, -V2TX.bandB, W + V2TX.bandA];
    const dur = dir === 'in' ? V2TX.wipe : V2TX.retract;
    const hh = portrait ? `;height:${H}px` : '';   // .v2-tx 的 CSS 高 1080
    bands.push(`  <i id="tx${k}a" class="v2-tx v2-tx--a" style="left:0;transform:translateX(${a0}px)${hh}"></i>\n  <i id="tx${k}b" class="v2-tx v2-tx--b" style="left:0;transform:translateX(${b0}px)${hh}"></i>`);
    tl.push(`tl.fromTo('#tx${k}a', { x: ${a0} }, { x: ${a1}, duration: ${dur}, ease: 'expo.inOut' }, ${n3(at)});`);
    tl.push(`tl.fromTo('#tx${k}b', { x: ${b0} }, { x: ${b1}, duration: ${dur}, ease: 'expo.inOut' }, ${n3(at)});`);
  };
  // 換卡不換景的連鎖（x04→x05→x06）：前一張要疊在後一張上面，z 往後遞減（只有 DOM 順序時後一張會蓋住前一張的退場）
  const byId = new Map(list.map((x) => [x.id, x]));
  const swapDepth = (it) => { let n = 0; for (let x = it; x?.txOut === 'swap'; x = byId.get(x.seamTo)) n++; return n; };
  const EDGE = 110.4;   // 新畫面的左緣跟著細帶右緣：起點 2120px＝畫面寬的 110.4%（細帶 2070＋48，留 2px）
  // 直式：舞台縮放的幕（FR-022／023）；字卡動態 bg none 縮到下面一點、不墊底
  const stageOf = (it) => {
    if (!portrait || it.type === 'media') return null;
    if (it.type === 'fx') return stageTransform('fx', C, { clear: !it.opaque });
    if (it.type === 'scene') return it.scene.portrait === 'stage' ? stageTransform(it.key === 'chapter' ? 'ch' : 'fs', C) : null;
    return it.type === 'custom' && it.opaque ? stageTransform('fs', C) : null;
  };
  // 全寬版型：橫式、不透明的全畫面段（04 家族、custom fullscreen）整段沒有子母畫面小窗（只有聲音的區間）→ 主卡拉到 1680（kit/scene-motion.js widen）
  const wideOf = (it, pieces) => !portrait && it.opaque && !pieces.length && (it.type === 'custom' || (it.type === 'scene' && it.scene?.family === 'fullscreen'));
  for (const it of list) {
    if (it.noHost) continue;
    const d = r3(it.e - it.s);
    // 子母畫面：只有聲音的區間不放、接點（cut）切開；沒有這些時就是整段一支（和舊版相同）
    const pieces = [];
    if (it.pip) {
      for (const p of it.pipPieces || [{ s: it.start, e: it.end, ms: it.start }]) {
        const s = test ? r3(p.s - t0) : p.s;
        const e = test ? r3(Math.min(p.e - t0, DUR)) : p.e;
        if (s >= DUR - 1e-6 || e - s < 1e-3) continue;
        pieces.push({ s, d: r3(e - s), ms: p.ms, sfx: pieces.length ? `-${pieces.length + 1}` : '', enter: p.enter ?? 'fade', exit: p.exit ?? 'layer', exitDur: p.exitDur || 0, full: !test || p.e - t0 <= DUR + 1e-6 });
      }
    }
    const ids = (p) => [`#pip-${it.id}${p.sfx}`, `#pipf-${it.id}${p.sfx}`];
    // 出場 layer 的片段跟幕一起淡出（三層一起，不做放大回原位）
    const layerPip = pieces.filter((p) => p.exit === 'layer').flatMap(ids);
    const st = stageOf(it), bd = st && (it.type !== 'fx' || it.opaque);
    const sel = bd ? `#el-${it.id}, #bd-${it.id}` : `#el-${it.id}`;   // 不透明幕的進退場（直式連底一起）
    if (it.type === 'media') {
      const mp = mediaParts({ ...rolled(it, t0), pipIds: [] }, { off: t0, lim: t0 + DUR, base, nextTrack: () => track++, mediaDb: editFx?.mediaDb ?? 0, edit: editFx, outDur: videoDur, ...(portrait ? { canvas: C } : {}) });
      hosts.push(mp.html);
      tl.push(...mp.tl);
      // 相鄰兩段 media：後一段疊化進來
      if (it.xfade) tl.push(`tl.fromTo('#el-${it.id}', { opacity: 0 }, { opacity: 1, duration: ${it.xfade}, ease: 'sine.inOut' }, ${n3(it.s)});`);
      if (layerPip.length && it.fullEnd && it.exitFx && it.exitFx !== 'cut') tl.push(`tl.fromTo('${layerPip.join(', ')}', { opacity: 1 }, { opacity: 0, duration: ${EXIT.fade}, ease: 'sine.in', immediateRender: false }, ${n3(it.e - EXIT.fade)});`);
    } else {
      const varAttr = it.type === 'fx' ? `\n       data-variable-values='${attrJson(it.vars)}'` : '';
      // 換卡不換景：舊的幕多留 0.3s、疊在新的幕上面（z＋連鎖深度）擦掉舊卡
      const swapOut = it.txOut === 'swap' && it.fullEnd ? r3(Math.min(V2TX.swapOut, DUR - it.e)) : 0;
      if (it.txIn === 'chapter' && it.fadeIn) hosts.push(`  <i id="txc-${it.id}" class="v2-tx-ch" style="position:absolute;left:0;top:0;width:${W}px;height:${H}px;background:var(--v2-tx-a);z-index:${it.z};pointer-events:none"></i>`);
      // 直式：舞台縮放的幕下面墊整張畫布的純色底（縮放後露出的頂端；spike D-1：同一張背景圖兩種比例會出現兩次裝飾線，所以不用圖）
      if (bd) hosts.push(`  <div id="bd-${it.id}" class="clip" data-start="${n3(it.s)}" data-duration="${n3(d)}" data-track-index="${track++}" style="position:absolute;left:0;top:0;width:${W}px;height:${H}px;background:${it.type === 'fx' ? FX_BG[it.bg] : it.key === 'chapter' ? 'var(--sc-ch-bg)' : 'var(--sc-fs-bg)'};z-index:${it.z - 1}"></div>`);
      const [hw, hh] = portrait && !st ? [W, H] : [1920, 1080];
      hosts.push(`  <div id="el-${it.id}" data-composition-id="${it.compId}" data-composition-src="${it.file}"${varAttr}
       data-start="${n3(it.s)}" data-duration="${n3(d + swapOut)}" data-track-index="${track++}" data-width="${hw}" data-height="${hh}"${it.prev ? ` data-prev="${it.prev}"` : ''}${st ? ` ${st.attr}` : ''} style="z-index:${it.z + swapDepth(it)}${st ? `; ${st.css}` : ''}"${pieces.length ? ' data-ambient="off"' : wideOf(it, pieces) ? ' data-wide' : ''}></div>`);   // 子母畫面的段不要背景環境（kit P.ambient）；沒有小窗的全畫面段用全寬版型（kit widen）
      if (swapOut > 0) {
        tl.push(`tl.fromTo('#el-${it.id}', { clipPath: 'inset(0px 0px 0px 0px)' }, { clipPath: '${SWAP_KEEP}', duration: 0.001, ease: 'none', immediateRender: false }, ${n3(it.e)});`);
        tl.push(`tl.fromTo('#el-${it.id}', { clipPath: '${SWAP_KEEP}' }, { clipPath: '${SWAP_GONE}', duration: ${swapOut}, ease: 'power2.in', immediateRender: false }, ${n3(it.e + 0.001)});`);
      }
    }
    for (const p of pieces) {
      const ps = pip.style, vTrack = track++;
      // 直式的講者面板外框：上緣一條 6px 主色線（CSS，跟著 --brand；不用 png）
      const frame = portrait ? `<div id="pipf-${it.id}${p.sfx}" class="clip pip-frame" data-start="${n3(p.s)}" data-duration="${n3(p.d)}" data-track-index="${track++}"
       style="position:absolute;left:${PB[0]}px;top:${PB[1] - 3}px;width:${PB[2]}px;height:6px;background:var(--brand)"></div>`
        : `<img id="pipf-${it.id}${p.sfx}" class="clip pip-frame" src="${base}kit/pip-frame.png" alt=""
       data-start="${n3(p.s)}" data-duration="${n3(p.d)}" data-track-index="${track++}">`;
      pips.push(`  <div class="pip" id="pip-${it.id}${p.sfx}" data-layout-allow-overflow>
    <video id="pipv-${it.id}${p.sfx}" src="${base}assets/rough.mp4" data-start="${n3(p.s)}" data-duration="${n3(p.d)}" data-media-start="${n3(p.ms)}"
           data-track-index="${vTrack}" muted playsinline style="left:${ps.left}px;top:${ps.top}px;width:${ps.width}px;height:${ps.height}px"></video>
  </div>
  ${frame}`);
      const [P, F] = ids(p);
      if (p.enter === 'fly') {
        // 講者由原位飛進子母畫面（0.75s power3.inOut），0.62s 外框淡入（不縮放）
        const ff = FLY;
        tl.push(`tl.fromTo('${P}', { x: ${ff.x}, y: ${ff.y}, scale: ${ff.k}, transformOrigin: '0 0' }, { x: 0, y: 0, scale: 1, duration: ${V2TX.fly}, ease: 'power3.inOut' }, ${n3(p.s)});`);
        tl.push(`tl.fromTo('${F}', { opacity: 0 }, { opacity: 1, duration: ${V2TX.pop}, ease: 'sine.out' }, ${n3(p.s + V2TX.land)});`);
      } else if (p.enter === 'fade') tl.push(`tl.fromTo('${P}, ${F}', { opacity: 0 }, { opacity: 1, duration: ${PIP_FADE}, ease: 'sine.out' }, ${n3(p.s)});`);
      if (p.exit === 'fade' && p.full) tl.push(`tl.fromTo('${P}, ${F}', { opacity: 1 }, { opacity: 0, duration: ${p.exitDur}, ease: 'sine.in', immediateRender: false }, ${n3(Math.max(p.s, p.s + p.d - p.exitDur))});`);
    }
    if (it.opaque && it.type !== 'media') {
      if (it.fadeIn && it.txIn === 'wipe') {
        tl.push(`tl.fromTo('${sel}', { clipPath: 'inset(0% 0% 0% ${EDGE}%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: ${V2TX.wipe}, ease: 'expo.inOut' }, ${n3(it.s)});`);
        bandPair(it.s, 'in');
      } else if (it.fadeIn && it.txIn === 'chapter') {
        tl.push(`tl.fromTo('#txc-${it.id}', { clipPath: '${TRI0}' }, { clipPath: '${TRI1}', duration: ${V2TX.chapter}, ease: 'expo.inOut' }, ${n3(it.s)});`);
        tl.push(`tl.fromTo('${sel}', { clipPath: '${TRI0}' }, { clipPath: '${TRI1}', duration: ${V2TX.chapter}, ease: 'expo.inOut' }, ${n3(it.s + V2TX.chapterLag)});`);
        tl.push(`tl.set('#txc-${it.id}', { opacity: 0 }, ${n3(it.s + V2TX.chapterLag + V2TX.chapter)});`);
      } else if (it.fadeIn) tl.push(`tl.fromTo('${sel}', { opacity: 0 }, { opacity: 1, duration: ${FADE}, ease: 'sine.out' }, ${n3(it.s)});`);
      if (it.fadeOut && it.fullEnd && it.txOut === 'retract') {
        const at = Math.max(it.s, it.e - V2TX.retract);
        tl.push(`tl.fromTo('${sel}', { clipPath: 'inset(0% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% ${EDGE}%)', duration: ${V2TX.retract}, ease: 'expo.inOut', immediateRender: false }, ${n3(at)});`);
        bandPair(at, 'out');
        if (layerPip.length) tl.push(`tl.fromTo('${layerPip.join(', ')}', { opacity: 1 }, { opacity: 0, duration: ${V2TX.pipOut}, ease: 'sine.in', immediateRender: false }, ${n3(at)});`);
      } else if (it.fadeOut && it.fullEnd) {
        // 片尾的段（plan.mjs 的 tailFade：原本是色帶收回）：淡出在片尾前一格做完，最後一格不會停在半透明
        const end = it.tailFade ? Math.min(it.e, r3(videoDur - t0 - 1 / FPS)) : it.e;
        tl.push(`tl.to('${[sel, ...layerPip].join(', ')}', { opacity: 0, duration: ${FADE}, ease: 'sine.in' }, ${n3(Math.max(it.s, end - FADE))});`);
      }
    }
    // 旁白段擦入擦出：host 的 clip-path（z 31，壓在錄影上面）
    if (it.wipeIn) tl.push(`tl.fromTo('#el-${it.id}', { clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: ${WIPE}, ease: 'sine.out' }, ${n3(it.s)});`);
    if (it.wipeOut && it.fullEnd) tl.push(`tl.fromTo('#el-${it.id}', { clipPath: 'inset(0% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 100%)', duration: ${WIPE}, ease: 'sine.in', immediateRender: false }, ${n3(Math.max(it.s, it.e - WIPE))});`);
    if (it.side && sideShift > 0) {
      footTweens.push({ at: it.s, kind: 'in' });
      if (it.exitFade && it.fullEnd) footTweens.push({ at: r3(it.e - PUSH), kind: 'out' });
      else if (it.footageReset != null && it.footageReset - t0 < DUR) footTweens.push({ at: r3(it.footageReset - t0), kind: 'reset' });
    }
  }
  // 常駐章節角標（z 25：在一般情境 20 之上、不透明幕 30 之下）
  const badgeEls = [];
  for (const b of badges) {
    // 章節擦過（plan.mjs 的 badge.sweep：由 02 起頭的章）：色帶擦開那一對色帶，只掃過、後面沒有新的幕，角標同時由右擦開
    if (b.sweep && b.start - t0 >= 0 && b.start - t0 < DUR) bandPair(r3(b.start - t0), 'in');
    const bp = badgeParts(b, { t0, DUR, C });
    if (!bp) continue;
    badgeEls.push(bp.html);
    tl.push(...bp.tl);
  }
  // 側邊欄：底片層右移 sideShift，和面板 P.sideIn 同一條 9 點曲線、0.7 秒（§B.6）
  footTweens.sort((a, b) => a.at - b.at).forEach((f, i) => {
    const ir = i === 0 ? '' : ', immediateRender: false';
    if (f.kind === 'in') tl.push(`tl.fromTo('#footage', { x: 0 }, { x: ${sideShift}, duration: ${PUSH}, ease${ir} }, ${n3(f.at)});`);
    else if (f.kind === 'out') tl.push(`tl.fromTo('#footage', { x: ${sideShift} }, { x: 0, duration: ${PUSH}, ease${ir} }, ${n3(f.at)});`);
    else tl.push(`tl.set('#footage', { x: 0 }, ${n3(f.at)});`);
  });

  // 剪輯台（edit）：punch 放大跳接、dip 過黑、整支淡入淡出（畫面用 GSAP；聲音在 <video>／<audio> 的 data-fade-*）
  const overlays = [];
  let footCss = '';
  if (editFx) {
    if (editFx.punches.length) footCss = `    #footage { transform-origin: ${editFx.origin}; }\n`;
    for (const p of editFx.punches) {
      const a = r3(p.a - t0), b = r3(p.b - t0);
      if (b <= 0 || a >= DUR) continue;
      tl.push(`tl.set('#footage', { scale: ${editFx.scale} }, ${n3(Math.max(0, a))});`);
      if (b < DUR) tl.push(`tl.set('#footage', { scale: 1 }, ${n3(b)});`);
    }
    let dips = 0;
    for (const dp of editFx.dips) {
      const h = r3(dp.dur / 2), a = r3(dp.at - h - t0);
      if (a < 0 || a >= DUR) continue;
      tl.push(`tl.fromTo('#edit-dip', { opacity: 0 }, { opacity: 1, duration: ${h}, ease: 'sine.in', immediateRender: false }, ${n3(a)});`);
      tl.push(`tl.fromTo('#edit-dip', { opacity: 1 }, { opacity: 0, duration: ${h}, ease: 'sine.out', immediateRender: false }, ${n3(a + h)});`);
      dips++;
    }
    if (dips) overlays.push('  <div id="edit-dip"></div>');
    let fades = 0;
    if (editFx.fadeIn > 0 && t0 < editFx.fadeIn) {
      tl.push(`tl.fromTo('#edit-fade', { opacity: ${n3(1 - t0 / editFx.fadeIn)} }, { opacity: 0, duration: ${n3(editFx.fadeIn - t0)}, ease: 'none' }, 0);`);
      fades++;
    }
    if (editFx.fadeOut > 0) {
      const st = r3(videoDur - editFx.fadeOut - t0);
      if (st < DUR) {
        const from = st >= 0 ? 0 : r3(-st / editFx.fadeOut);
        tl.push(`tl.fromTo('#edit-fade', { opacity: ${from} }, { opacity: 1, duration: ${n3(editFx.fadeOut + Math.min(0, st))}, ease: 'none'${fades ? ', immediateRender: false' : ''} }, ${n3(Math.max(0, st))});`);
        fades++;
      }
    }
    if (fades) overlays.push('  <div id="edit-fade"></div>');
  }
  const needCss = hasMedia || overlays.length > 0;

  const sfx = [];
  for (const it of items) {
    const cues = [[`sfx-${it.id}`, it.sfx], ...(it.sfxExtra || []).map((c, n) => [`sfx-${it.id}-e${n + 1}`, c])];
    for (const [id, c] of cues) {
      if (!c) continue;
      const at = r3(c.at - t0);
      if (at < 0 || at >= DUR) continue;
      sfx.push(`  <audio id="${id}" src="${base}assets/sfx/${c.name}.wav" data-start="${n3(at)}" data-track-index="${track++}" data-volume="${c.volume}"></audio>`);
    }
  }
  // 結尾配樂（--test 的片段從中間開始時用 data-media-start 接上）
  if (outro) {
    const at = r3(outro.at - t0);
    if (at < DUR) {
      const ms = at < 0 ? r3(-at) : 0, st = Math.max(0, at), du = r3(Math.min(outro.dur - ms, DUR - st));
      if (du > 0) sfx.push(`  <audio id="bgm-outro" src="${base}${outro.file}" data-start="${n3(st)}" data-duration="${n3(du)}"${ms ? ` data-media-start="${n3(ms)}"` : ''} data-track-index="${track++}" data-volume="1"></audio>`);
    }
  }
  // 情境動畫綁句：句子時間＋每個 custom 段的起點、段長、預先算好的 P.at 秒數（和 host data-start 同一基準）
  let cueScript = '';
  const customs = list.filter((it) => it.type === 'custom');
  if (customs.length && cues) {
    const obj = {
      v: 1,
      cues: Object.fromEntries(cues.map((c) => [String(c.n), [r3(c.start - t0), r3(c.end - t0)]])),
      segs: Object.fromEntries(customs.map((it) => [it.id, { comp: it.compId, start: r3(it.s), D: r3(it.end - it.start), ...(it.prev ? { prev: it.prev } : {}), refs: Object.fromEntries(Object.entries(it.cueRefs || {}).map(([k, v]) => [k, r3(v - t0)])) }])),
    };
    cueScript = `  <script>window.__cues = ${JSON.stringify(obj).replace(/</g, '\\u003c')};</script>\n`;
  }
  // 底片：沒有 edit 時整支一個 <video>；有 cuts／dip 時切成幾支（data-media-start 跳過剪掉的範圍）
  let footVideo;
  if (segCut && !cut.keepFootage) footVideo = '';
  else if (!footage) {
    footVideo = `    <video id="rough" src="${base}assets/rough.mp4" data-start="0" data-duration="${n3(DUR)}"${test ? ` data-media-start="${n3(t0)}"` : ''}
           data-track-index="0" data-has-audio="true" playsinline></video>`;
  } else {
    const v = [];
    for (const c of footage.clips) {
      const s = Math.max(c.s, t0), e = Math.min(c.e, t0 + DUR);
      if (e - s < 1e-3) continue;
      const fi = Math.abs(s - c.s) < 1e-6 && c.fadeIn > 0 ? ` data-fade-in="${n3(c.fadeIn)}"` : '';
      const fo = Math.abs(e - c.e) < 1e-6 && c.fadeOut > 0 ? ` data-fade-out="${n3(c.fadeOut)}"` : '';
      const vol = c.volume != null ? ` data-volume="${c.volume}"` : '';
      v.push(`    <video id="rough${v.length ? `-${v.length + 1}` : ''}" src="${base}assets/rough.mp4" data-start="${n3(s - t0)}" data-duration="${n3(e - s)}" data-media-start="${n3(c.ms + (s - c.s))}"
           data-track-index="0" data-has-audio="true"${vol}${fi}${fo} playsinline></video>`);
    }
    footVideo = v.join('\n');
  }
  // 側邊欄段的底片只是畫面：聲音留給主軌
  if (segCut && footVideo) footVideo = footVideo.replace(/ data-has-audio="true"/g, ' muted');
  const capTrack = captions ? track++ : null;
  const bgColor = segCut ? 'transparent' : '#000';
  const html = `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=${W}, height=${H}">
  <title>${segCut ? `剪映素材 ${cut.id}（${t0}s 起 ${DUR}s）` : mainCut ? '剪映主軌' : test ? `測試片段 ${t0}s 起 ${DUR}s` : '成片'}</title>
  <script src="${base}kit/gsap.min.js"></script>
${KIT_LINKS.map((l) => `  <link rel="stylesheet" href="${base}${l}">`).join('\n')}${needCss ? `\n  <link rel="stylesheet" href="${base}kit/media.css">` : ''}
${cueScript}${portrait ? `  ${regionsScript(C)}\n` : ''}  <script src="${base}kit/scene-motion.js"></script>
  <script src="${base}kit/illus.js"></script>
  <script src="${base}kit/scene-layout.js"></script>${hasLens ? `\n  <script src="${base}kit/media.js"></script>` : ''}
  <style>
    ${segCut ? 'html, ' : ''}body { margin: 0; background: ${bgColor}; }
    #${rootId} { position: relative; width: ${W}px; height: ${H}px; overflow: hidden; background: ${bgColor}; }
    #footage { position: absolute; inset: 0; z-index: 0; }
${footCss}    #footage video { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; object-fit: cover; }
${portrait ? `    /* 講者面板 x 0–1080、y 900–1920（lib/canvas.mjs 的 pip.box，決定 1：分割線 y 900） */
    .pip { position: absolute; left: ${PB[0]}px; top: ${PB[1]}px; width: ${PB[2]}px; height: ${PB[3]}px; overflow: hidden; z-index: 40; }`
    : `    /* 子母畫面本體 x 1424–1856、y 594–918（432×324，4:3），和 lib/media.mjs 的 PIP_ZONE、pip-frame.png 同一組數字 */
    .pip { position: absolute; left: 1424px; top: 594px; width: 432px; height: 324px; overflow: hidden; border-radius: 6px; z-index: 40; }`}
    .pip video { position: absolute; }
    .pip-frame { z-index: 41; }
${bg ? indent(bgCss(`${base}assets/`, bg), 4) + '\n' : ''}  </style>
</head>
<body>
<!-- build.mjs 產生；要改請改 plan.json 再重跑 build（手改會被雜湊保護擋下）-->
<div id="${rootId}" data-composition-id="${compName}" data-start="0" data-duration="${n3(DUR)}" data-width="${W}" data-height="${H}" data-fps="30">

  <!-- L0 底片 -->
  <div id="footage">
${footVideo}
  </div>

  <!-- L1／L2 情境與字卡動態（z-index：一般 20、不透明 30、透明字卡動態 50）-->
${hosts.join('\n')}

${bands.length ? `  <!-- v2 轉場色帶（色帶擦開／收回）-->\n${bands.join('\n')}\n\n` : ''}${badgeEls.length ? `  <!-- 章節角標（常駐；plan.json "chapterBadge": false 可關）-->\n  <div id="chb">\n${badgeEls.join('\n')}\n  </div>\n\n` : ''}  <!-- 子母畫面：靜音主軌複本＋外框 png -->
${pips.join('\n')}

${captions ? `  <!-- L3 字幕 -->
  <div id="el-captions" data-composition-id="${captions.compId}" data-composition-src="${captions.file}"
       data-track-kind="captions" data-start="0" data-duration="${n3(DUR)}" data-track-index="${capTrack}"
       data-width="${W}" data-height="${H}" style="z-index:60"></div>
` : ''}${overlays.length ? `\n  <!-- 剪輯台：dip 過黑（字幕下面）、整支淡入淡出（連字幕一起）-->\n${overlays.join('\n')}\n` : ''}
  <!-- L4 音效 -->
${sfx.join('\n')}
</div>
<script>
(function () {
  window.__timelines = window.__timelines || {};
  const tl = gsap.timeline({ paused: true });
  const ease = SceneMotion.pushEase;
${badgeEls.length ? "  const P = SceneMotion(tl, document.getElementById('chb'));\n" : ''}${indent(tl.join('\n'), 2)}
  tl.set({}, {}, ${n3(DUR)});
  window.__timelines['${compName}'] = tl;
})();
</script>
</body>
</html>
`;
  return { html, skipped, duration: DUR };
}

// ---------- 預覽頁（--gallery）----------

export function buildPreview({ scene, parts, D, sub, pipStyle, cues = [], wide = false }) {
  const opaque = ['fullscreen', 'chapter'].includes(scene.family);
  const pip = scene.family === 'fullscreen' && !wide;   // wide：全寬版型示意（只有聲音的段：沒有講者小窗、主卡 1680）
  const side = scene.key === 'side-panel';
  const tl = [];
  if (opaque) {
    tl.push(`tl.fromTo('#scene${pip ? ', #pip, #pipf' : ''}', { opacity: 0 }, { opacity: 1, duration: ${FADE}, ease: 'sine.out' }, 0);`);
    tl.push(`tl.to('#scene${pip ? ', #pip, #pipf' : ''}', { opacity: 0, duration: ${FADE}, ease: 'sine.in' }, ${n3(D - FADE)});`);
  }
  if (side) {
    tl.push(`tl.fromTo('#footage', { x: 0 }, { x: 480, duration: ${PUSH}, ease: SceneMotion.pushEase }, 0);`);
    tl.push(`tl.fromTo('#footage', { x: 480 }, { x: 0, duration: ${PUSH}, ease: SceneMotion.pushEase, immediateRender: false }, ${n3(D - PUSH)});`);
  }
  const st = pipStyle;
  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(`${scene.num} ${scene.zh}${wide ? '（全寬）' : ''}｜預覽`)}</title>
<!-- build.mjs --gallery 產生：用 scene.json 的 sample 填模板，講者是 speaker.jpg；換主色或放 ../bg-fs.jpg、../bg-side.jpg、../bg-ch.jpg（或單一 ../bg.jpg）後重新整理就會更新 -->
${KIT_LINKS.map((l) => `<link rel="stylesheet" href="../${l}">`).join('\n')}
<script src="../kit/style-switch.js"></script>
<script src="../kit/gsap.min.js"></script>
<script src="../kit/scene-motion.js"></script>
<script src="../kit/illus.js"></script>
<script src="../kit/scene-layout.js"></script>
<style>
  html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
  #stage { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; overflow: hidden; background: #000; transform-origin: 0 0; }
  #footage { position: absolute; inset: 0; }
  #footage img { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; object-fit: cover; }
  .fill { position: absolute; inset: 0; }
  #scene { position: absolute; inset: 0; z-index: ${opaque ? 30 : 20}; }
  #pip { position: absolute; left: 1424px; top: 594px; width: 432px; height: 324px; overflow: hidden; border-radius: 6px; z-index: 40; }
  #pip img { position: absolute; left: ${st.left}px; top: ${st.top}px; width: ${st.width}px; height: ${st.height}px; }
  #pipf { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; z-index: 41; }
  #cap { z-index: 60; }
  /* 背景圖：各版面先用自己的 ../bg-*.jpg，沒有就用 ../bg.jpg，都沒有只顯示底紋（不必重新產生預覽頁） */
  .sc-surface-fs { background-image: url("../bg-fs.jpg"), url("../bg.jpg"), var(--sc-fs-pattern); background-size: cover, cover, 1920px 1080px; background-position: center, center, 0 0; background-repeat: no-repeat; }
  .sc-surface-ch { background-image: url("../bg-ch.jpg"), url("../bg.jpg"), var(--sc-ch-pattern); background-size: cover, cover, 1920px 1080px; background-position: center, center, 0 0; background-repeat: no-repeat; }
  .sc-surface-side { background-image: url("../bg-side.jpg"), url("../bg.jpg"), var(--sc-side-pattern); background-size: cover, 1920px auto, 960px 1080px; background-position: center, 0 50%, 0 0; background-repeat: no-repeat; }
${indent(parts.style, 2)}
</style>
</head>
<body>
<div id="stage">
  <div id="footage"><img src="speaker.jpg" alt=""></div>
  <div id="scene"${wide ? ' data-wide' : ''}>
    <div id="${parts.compId}" class="fill">
${indent(parts.body, 6)}
    </div>
  </div>
${pip ? `  <div id="pip"><img src="speaker.jpg" alt=""></div>\n  <img id="pipf" src="../kit/pip-frame.png" alt="">\n` : ''}  <div class="cg" id="cap"><span>${esc(sub || '')}</span></div>
</div>
<script>
window.__PREVIEW = ${JSON.stringify({ key: scene.key, duration: r3(D), cues: [...cues].sort((a, b) => a.at - b.at) })};
</script>
<script>
(function () {
  var stage = document.getElementById('stage');
  function fit() { var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080); stage.style.transform = 'scale(' + s + ')'; }
  window.addEventListener('resize', fit); fit();
  var $q = function (s) { return typeof s === 'string' ? Array.prototype.slice.call(document.querySelectorAll(s)) : s; };
  var start = function () {
    const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.2 });
    var pv = window.__PREVIEW;
${parts.body.includes('data-illus') ? `    ILLUS.mount(document.getElementById('${parts.compId}'));\n` : ''}    const P = SceneMotion(tl, document.getElementById('${parts.compId}'));
${indent(SCOPE_P, 4)}
    const D = ${n3(D)};
${indent(parts.timeline, 4)}
${indent(tl.join('\n'), 4)}
    P.end(D);
    // 截圖用：網址加 ?t=秒數 就停在那一刻（例：03-side-panel.html?t=3）
    var t = Number(new URLSearchParams(location.search).get('t'));
    if (t > 0) tl.pause(t);
    // 重播協定：父頁（音效預覽）送 hf-preview-replay → 從頭播，並回 hf-preview-started
    window.addEventListener('message', function (e) {
      if (!e.data || e.data.type !== 'hf-preview-replay') return;
      tl.restart();
      (e.source || parent).postMessage({ type: 'hf-preview-started', key: pv.key }, '*');
    });
    parent.postMessage({ type: 'hf-preview-ready', key: pv.key, duration: pv.duration, cues: pv.cues }, '*');
  };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(start); else start();
})();
</script>
</body>
</html>
`;
}
