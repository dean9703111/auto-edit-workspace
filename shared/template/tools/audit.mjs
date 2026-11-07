#!/usr/bin/env node
/**
 * 版面量測：在瀏覽器裡把 work/hyperframes/ 跳到每一段的中點、完成態（段尾前 0.6 秒）與每個靜止畫面，量出破版與節奏問題（零依賴，只用 Node 22 與 HyperFrames 的 Chrome）
 *
 *   node shared/template/tools/audit.mjs --project projects/<專案>               只量第二層 custom（x 開頭、type: "custom"）
 *   node shared/template/tools/audit.mjs --project projects/<專案> --all         連情境模板一起量（字卡動態、media 段不量）
 *   node shared/template/tools/audit.mjs --project projects/<專案> --only x01,s03 只量這幾段（字卡動態要量就用這個指名）
 *   node shared/template/tools/audit.mjs --project projects/<專案> --json        stdout 只印一個 JSON
 *   node shared/template/tools/audit.mjs --project projects/<專案> --format portrait  照直式量（不寫就照 plan.json 的 format、製作進度.md 的「版式」列、主軌寬高比；第一行印版式與來源）
 *   node shared/template/tools/audit.mjs --project projects/<專案> --only x03 --shots --sheet  工人自查只跑這一條：這段的 --check 一行、⚠，加量測與截圖拼圖
 *     --only：其他段的 ✖ 只印一行「其他段有 N 個 ✖（不影響這段）」，只有這段自己的 ✖ 與全域的 ✖ 才量不了（平行工人互相不擋）
 *     --shots：每個取樣時刻（中點、靜止、完成態）存一張 work/audit-shots/<段 id>-<秒>.jpg（重跑先清掉這段的舊圖）
 *     --sheet：再把每段的截圖拼成一張 work/audit-shots/sheet-<段 id>.jpg，每格標時間，只印這張的路徑（--sheet 自動開 --shots）
 *   --jobs N：同時開幾個 Chrome 量（預設 4、最多 8；每 3 段開一個，段少就少開）；順序與結果和 --jobs 1 一樣
 *   --verbose：多印全表（每段的量測時間與結果）、每張截圖的路徑、節奏備註；預設只印 ✖、⚠ 與統計
 *
 * 先 build（audit 量的是 build 產生的 work/hyperframes/index.html；只改了 custom 檔不用重 build，改了 plan.json 要先 build）。
 * 段落起迄取自 build.mjs --check（完成影片秒數，和完成影片預覽、snapshot 的秒數一樣）。完成態那一刻全部還在動（退場比 0.6 秒長）時，每次往前 0.3 秒找靜止的畫面。
 * custom 段另外讀時間軸，在每個停 ≥ 0.4 秒的靜止畫面再量一次（每段最多 8 次），並檢查節奏。
 * 和 npx hyperframes snapshot／check 用同一個 runtime 與 seek（__player.renderSeek），所以量到的就是 render 的版面；約 2–5 秒一段。
 *
 * ✖ 錯誤（一定要修，結束碼 1）
 *   文字撐破容器   文字超出最近的有底有框盒（卡片、膠囊、節點）
 *   內容被裁掉     文字或卡片超出 overflow:hidden／固定寬高的框，被切掉
 *   超出畫面       內容超出 1920×1080
 *   進字幕區       內容下緣 y > 920（R4.1；滿版底、從頂撐到底的面板不算）
 *   壓到子母畫面   全畫面版型（layout: "fullscreen"、04 家族）、這一刻有子母畫面時，內容進到 x 1424–1888、y 581–951
 *   ── 直式（版式是直式時；全畫面 custom、04 家族、01、字卡動態縮放進上半面板，量縮放前的 1920×1080 座標；其他段用 1080×1920 量）──
 *   直式會被切到   portrait-window：縮放的段裡帶 id 的絕對定位元素超出舞台窗 x 120–1300、y 130–880（01 是 x 160–1760、y 260–870）
 *   直式被介面蓋住 unsafe：不縮放的段，內容進到上方 y < 240、下方 y > 1440、右側按鈕列 x 940–1080 × y 840–1440
 *   進字幕區       不縮放的段改量直式字幕保留帶 y 1280–1420（超出畫面改量 1080×1920；不量子母畫面）
 *   ⚠ 鏡頭推會切到 portrait-cam：縮放的段裡 P.cam 每個停點（倍率＋位移）換算的鏡頭容器外框，超出舞台看得到的範圍 x 73–1347、y 130–909（完成態判一次）
 *   ⚠ 垂直不平衡   縮放的段內容區改成舞台窗 y 130–880
 *   script 出錯    custom 的 <script> 丟錯（時間軸沒建好，畫面停在初始狀態）
 *   對不上         index.html 的段落起點和 plan.json 不同（改了 plan.json 沒重跑 build）
 *   未定位頂層     custom 的 root 或 .fill 直接底下的元素不是 position: absolute（R7.3 骨架）
 *   標題壓到內容   custom 的標題列（.sc-wcard__bar、.sc-pill、data-audit-title）下緣蓋到下面的內容
 *   綁句失敗       custom 的 P.at 找不到句子、詞或這段的 cue 表
 *   拍在段尾之後   custom 的 P.at 落在淡出（沒有淡出就是段尾）之後，播出時看不到
 *   開場來不及     custom 檔頭【D 下限】的第一拍下限（例 T1 ≥ 3.1）不成立：開場的主卡、骨架還沒做完，站就先出來（換了開場就把檔頭那一行改成新的下限）
 *   示意元件讀不到 data-illus-src 的檔不在 work/hyperframes/illus-local/、data-illus 不是畫廊的 20 個元件也沒 ILLUS.register（畫面上是空的）
 * ⚠ 提醒
 *   壓到講者       透明版型（layout: "overlay"、下方字卡等）的內容蓋到 plan.json 的 speakerBox（面積比例；custom 與用 css 移位的段 ≥ 2%、
 *                  沒移位的模板 ≥ 15%，和 build 的碰撞提醒同門檻；03 側邊欄期間講者框加上 sideShift）
 *   字太小         文字 < 30px（直式：縮放的段 字級 × 縮放倍率 < 32px，全畫面 custom 是 0.8475；不縮放的段 < 32px）
 *   半像素邊       有底或有框的元素邊緣離整數 px ≥ 0.2（直邊與框線會糊，R8.4）
 *   段長不符       custom 檔寫死的 data-duration／const D 和 --check 報告的段長不同（結尾用 P.end() 不帶參數就不檢查）
 *   ── 下面只量 custom（R8 #6、style.md〈節奏〉）──
 *   間距不足       標題到下面的內容 < 24px（目標 ≥ 40px）
 *   區塊重疊       兩個有底或有框的區塊（或圖片）互相蓋到（svg 線稿與連接線不算區塊）
 *   nowrap 餘裕不足 不換行的文字離框 < 7px
 *   右側空白過多   框裡內容最右緣到框內緣 > 80px（置中、撐滿父層的橫條、同一欄等寬的、data-width-shared 不算）
 *   垂直不平衡     全畫面的內容在 y 120–870 裡，上下留白差 > 40px
 *   內距不足       文字框內距：左右 < max(24, 0.45×字級)、上下 < max(14, 0.28×字級)，容許 2px（圓形、≤ 2 字的徽章、kit 元件不算）
 *   行高不足       文字框裡 line-height < 1.25×字級（字級 ≥ 100px 的數字不算）
 *   同一秒新元素太多 任何 1 秒內新出現 > 2 個元素（亮框、同位置換內容、跟著卡片 0.6 秒內一起出現的不算）
 *   間隔太短       兩個新元素出現的時間差 < 0.12 秒
 *   完成態停太短   兩個 P.at 綁句點之間，畫面最長的靜止 < 1.2 秒（拍前就開始的動作算到它結束為止）
 *   最後一幕太短   最後一個動作結束到淡出（或收尾退場）< 1.5 秒（段長以 plan.json 為準，排到段尾之後的動作不算）
 *   段尾不夠       custom 檔頭【D 下限】的「D ≥ T4 + 5.2」不成立（回均衡這類排在最後一拍之後的動作會落到段外；拍點常數照 P.at 算，用到的名字不是 P.at 就不驗）
 *   下限改過       custom 檔頭【D 下限】的開場、段長下限比範例原檔小或被刪掉（範例用 <title> 的說明對回 shared/template/custom/）
 *   字級比範例小   custom 的元素（id／class 去掉前綴對回範例）字級比範例小（sc-tNN、style、<style> 的 font-size）：字放不下要縮文案或加寬容器
 *   綁句對不上     custom 的 P.at('#N')、P.at('#N@詞') 那一拍出現的字（站名、項目），在這段的另一句才講到（數字、英文整個詞比，中文取 2–4 字；刪除線、底線、位移不算出現；找不到不報）
 *   畫面沒有變化   custom 段裡連續 > 6 秒沒有任何動作（進場、點亮、焦點切換、描線、數字變化、位移都算動作），而那段時間有字幕句在講
 *   沒有動畫分鏡   work/storyboard.md 沒有「#### 動畫分鏡 <段 id>」表（拍型照 shared/template/BEATS.md §3）
 *   分鏡用了沒做的動作 分鏡「動態」欄寫了某個動作，custom 檔裡沒有對應的 P.*（例：寫「漣漪」卻沒有 P.ripple）
 *   分鏡沒寫的動作 custom 檔裡有 P.spot／P.dim／P.idle／P.cam，分鏡表一拍都沒寫聚焦、退焦、漂浮、鏡頭（多半是範例沒改到的殘留）
 *   ── 下面只量有示意插圖元件（kit/illus.js 的 .il）的段；量元件邊緣時描邊外擴 2px ──
 *   標籤太長       示意動畫裡標題列以外的字 > 10 字（字只當標籤，完整句子交給字幕）
 *   插圖太小       完成態所有元件的外框聯集 < 卡片內部（扣標題列）面積 50%（主角是圖）
 *   閃爍           同一個元素出現 → 退場 → 再出現超過 1 次（狀態依序換，不明滅來回）
 *   線比節點早     連接線開始描的時候還有元件在進場（先有節點再畫線）
 *   ── 版面（012；data-layout 容器，kit/scene-layout.js 的 SceneLayout.measure，版面座標、只量完成態；free 也量）──
 *   同一列沒對齊   layout-row-align：同列（上下範圍重疊）沒有標籤的元件，插圖中線 y 差 > 4px ⚠、> 16px ✖（data-align="middle" 全部量；沒有 data-layout 的段量手排的插圖，只報 ⚠）
 *   間距不一樣     layout-gap：同列（欄）≥ 3 個元件，相鄰間距最大差 > 8px
 *   內容群沒置中   layout-center：內容群在內容區左右留白差 > 16px（data-justify="start"／"end"：左／右留白不是 48±8px），或 data-align=center 時上下留白差 > 24px
 *   內距不夠       layout-pad：內容群到內容區邊 < 40px（左右）／< 32px（上下）
 *   標籤沒對齊插圖 layout-label：標籤中心和插圖中心差 > 4px（標籤在右邊的量上下）
 *   標籤不在同一條線 layout-label-row：同一列有標籤的元件，標籤上緣差 > 4px（row 預設底對齊；data-align="middle" 不量）
 *   連接線不對     layout-link：data-links 產生的與手寫的線（兩端各靠一個元件 ≤ 48px），端點離元件外框 < 4 或 > 32px、離邊中點（直線看兩個插圖重疊段的正中）> 8px、穿過別的元件
 * ✖ 分鏡對齊（custom，有「#### 動畫分鏡 <段 id>」表的段）
 *   分鏡表表頭不對 表頭要是「| 拍 | 講到（綁句） | 畫面上出現什麼 | 動態（設計系統語彙） | 焦點 | 音效拍點 |」（示意動畫段後面多「插圖元件（狀態） | 位置 |」兩欄）
 *   缺拍           分鏡某一拍的綁句（#N@詞＋偏移；同一個句號的幾拍算一組）±0.5 秒內沒有 P.at（「段起點 #N」那一拍是開場，不用 P.at）
 *   多出來的 P.at  檔裡用句號的 P.at 不在分鏡任何一拍 ±0.5 秒內
 *   語彙不存在     「動態」欄的動作不在 shared/template/BEATS.md §2 的 47 個名稱裡（括號裡的對象與參數、＋0.15 這類時間、「同拍 N」不算）
 *   插圖元件不存在 示意動畫的「插圖元件（狀態）」欄不是畫廊的 20 個、沒有 ILLUS.register、illus-local/ 也沒有那個 svg
 *   插圖清單不對   「#### 插圖清單 <段 id>」的來源不是畫廊／圖示組合／新建 SVG、寫畫廊但畫廊沒有、新建 SVG 還沒畫（illus-local/ 沒有檔）
 *   分鏡綁句算不出 分鏡的 #N@詞 在這段字幕裡找不到
 * v2 微動（漂浮、呼吸、虛線流動、背景環境、慢推）不算「動作」：完成態停留、最後一幕、畫面沒有變化、靜止取樣都排除；
 * 同一個 P.* 呼叫（錯拍群組、逐字）算 1 個新元素；彗星頭、漣漪、聚焦光、光澤、螢光筆、劃線、背景層不量版面。
 * 正在補間的元素（進場、退場途中）不判；刻意的例外標 data-layout-allow-overflow／data-layout-allow-caption-zone／data-layout-ignore
 * （和 npx hyperframes check 同一組標記），以及 data-layout-allow-overlap／data-layout-allow-slack／data-layout-allow-tight／data-width-shared（只有 audit 認得）。
 *
 * 選填：--chrome <路徑>（預設用 HyperFrames 下載的 chrome-headless-shell）、--runtime <hyperframe.runtime.iife.js>；測試用：--template <shared/template 資料夾>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build, pathsFrom, projectLabel } from './build.mjs';
import { findChrome, findRuntime, openSessions, openBrowser, freshRefsScript } from './lib/audit-browser.mjs';
import { createHash } from 'node:crypto';
import { groupWarnings, runCount } from './lib/flow.mjs';
import { contactSheet, poolOn } from './lib/raster.mjs';
import { FULL, gateCheck, pickItems, sampleTimes, layoutOf, pipOnAt, speakerWarnOf, judgeSample, mergeFindings, formatFinding, customDuration, fmtT, CANVAS, portraitPlan,
  judgeLayout, judgeMotion, stillTimes, cueFindings, motionUnits, busySpans, cueTextFindings, atNames, staticFindings, floorFindings, fontShrinkFindings } from './lib/audit-rules.mjs';
import { templateFor, formatReport as checkTable } from './lib/plan.mjs';
import { parseBeatSheets, beatFindings, noSheetFinding, parseIllusLists, illusListFindings } from './lib/audit-beats.mjs';
import { judgeIllus, illusMotionFindings, illusNameFindings, illusSrcOwners } from './lib/audit-illus.mjs';
import { judgeLayoutRules } from './lib/audit-layout.mjs';
import { resolveFormat, formatLine, canvasOf } from './lib/canvas.mjs';

const VALUE_FLAGS = ['project', 'only', 'chrome', 'runtime', 'template', 'format', 'jobs'];
export const JOBS = { default: 4, max: 8 };
const rel = (p) => path.relative(process.cwd(), p) || '.';
const r3 = (n) => Math.round(n * 1000) / 1000;

// --shots：量的每個取樣時刻（中點、靜止、完成態）各存一張截圖到 work/audit-shots/<段 id>-<秒>.jpg（子代理看不到 snapshot，用這個看自己那段；改完 x 檔不用 build）。用法寫在 auto-edit-motion 步驟 6、worker-brief
export function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`看不懂的參數「${a}」（用 --help 看用法）`);
    const [k, inline] = a.slice(2).split('=');
    if (VALUE_FLAGS.includes(k)) {
      const v = inline ?? argv[++i];
      if (v == null) throw new Error(`--${k} 後面要接值`);
      flags[k] = v;
    } else if (['all', 'json', 'help', 'shots', 'sheet', 'verbose', 'review'].includes(k)) flags[k] = true;
    else throw new Error(`沒有 --${k} 這個參數（用 --help 看用法）`);
  }
  return flags;
}

export function jobsOf(v) {
  if (v == null) return JOBS.default;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > JOBS.max) throw new Error(`--jobs 要是 1–${JOBS.max} 的整數，現在是「${v}」→ 改成 1–${JOBS.max}，或不寫（預設 ${JOBS.default}）`);
  return n;
}

// custom 檔寫死的長度要等於段長；不等時時間軸不是短了（最後一段沒被取樣）就是多了。結尾寫 P.end()（不帶參數）或用 P.dur() 的檔不檢查（長度自動等於段長）
export function durationWarnings(items, outDir) {
  const out = [];
  for (const it of items) {
    if (it.type !== 'custom' || !it.file) continue;
    const f = path.join(outDir, it.file);
    if (!fs.existsSync(f)) continue;
    const { duration, constD, autoEnd } = customDuration(fs.readFileSync(f, 'utf8'));
    if (autoEnd) continue;
    const bad = [['data-duration', duration], ['const D', constD]].filter(([, v]) => v != null && Math.abs(v - it.D) > 0.05);
    if (bad.length) out.push({ id: it.id, label: it.label, level: 'warn', rule: 'duration', el: null, at: [], t: null,
      msg: `段長不符：${it.file} 寫 ${bad.map(([k, v]) => `${k} ${v}`).join('、')}，--check 報告的段長是 ${it.D}s`, fix: `把結尾改成 P.end()（不帶參數，長度自動等於段長）並刪掉 const D；或把 data-duration 與 const D 都改成 ${it.D}` });
  }
  return out;
}

// 頁面的 JS 錯誤：量的那幾段的子合成出錯 → 那一段 ✖（時間軸沒建好，量到的是沒有動畫的初始狀態）；其他 → ⚠
// 011：「[ILLUS] 讀不到 data-illus-src=…」→ 用到那個檔的段 ✖（htmlOf(item) 回那段 custom 檔原文；契約 illus.md §4、§5.7）
export function scriptErrors(errors, items, htmlOf = () => '') {
  const findings = [], warnings = [];
  const seen = new Set();
  for (const e of errors) {
    const il = illusSrcOwners(e.text, items, htmlOf);
    if (il && il.items.length) {
      for (const it of il.items) {
        if (seen.has(`${it.id}|illus|${il.src}`)) continue;
        seen.add(`${it.id}|illus|${il.src}`);
        findings.push({ id: it.id, label: it.label, level: 'error', rule: 'illus-src', el: null, at: [], t: null, kind: 'illus',
          msg: `${it.file || it.compId} 的 data-illus-src="${il.src}" 讀不到（畫面上那個元件是空的）`, fix: `檔案放在 work/hyperframes/${il.src}（路徑相對主合成 index.html），照 shared/template/kit/illus-style.md 畫；或改用畫廊的元件 data-illus="…"` });
      }
      continue;
    }
    const m = String(e.text).match(/composition script error:\s*(\S+)\s+(.*)$/);
    const it = m && items.find((x) => x.compId === m[1]);
    const key = `${it ? it.id : ''}|${e.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (it) findings.push({ id: it.id, label: it.label, level: 'error', rule: 'script', el: null, at: [], t: null, kind: 'done',
      msg: `${it.file || it.compId} 的 script 出錯：${m[2]}（時間軸沒建好，畫面停在沒有動畫的初始狀態）`, fix: `修好 ${it.file || it.compId} 的 <script>（npx hyperframes check 會列出行號），再重跑 audit` });
    else warnings.push(`頁面 JS 錯誤：${e.text}${e.url && !e.url.includes('__audit') ? `（${e.url.replace(/^https?:\/\/[^/]+\//, '')}${e.line != null ? `:${e.line + 1}` : ''}）` : ''} → 跑 npx hyperframes check 看是哪一段`);
  }
  return { findings, warnings };
}

// --only：頁面上其他段的錯誤不算這段的（工人 A 的 x 檔改到一半丟錯，不要讓工人 B 看到）。回傳留下的錯誤與被濾掉的個數
export function splitPageErrors({ errors = [], cueErrs = [], others = [], htmlOf = () => '' }) {
  const hit = new Set();
  const owner = (name) => others.find((x) => x.id === name || x.compId === name);
  const keepE = errors.filter((e) => {
    const t = String(e.text);
    const m = t.match(/composition script error:\s*(\S+)\s/);
    const it = m && owner(m[1]);
    const il = !it && illusSrcOwners(t, others, htmlOf);
    const who = it || (il && il.items.length ? il.items[0] : null);
    if (who) hit.add(`${who.id}|${t}`);
    return !who;
  });
  const keepC = cueErrs.filter((raw) => {
    const m = String(raw).match(/^(\S+) P\.(?:at|dur)\(/);
    const it = m && owner(m[1]);
    if (it) hit.add(`${it.id}|${raw}`);
    return !it;
  });
  return { errors: keepE, cueErrs: keepC, others: hit.size, otherIds: [...new Set([...hit].map((k) => k.split('|')[0]))] };
}

const SHOT_KIND = { done: '完成態', still: '靜止', mid: '中點' };

// 一段的截圖拼成一張（每格標時間與取樣種類）：平行工人各寫各的檔
async function shotSheets(G, P, shots, cv) {
  const byId = new Map();
  for (const s of shots) { if (!byId.has(s.id)) byId.set(s.id, []); byId.get(s.id).push(s); }
  const out = [];
  const fontsCss = pathToFileURL(path.join(P.templateDir, 'kit', 'fonts.css')).href;
  for (const [id, all] of byId) {
    // 連續相同的畫面只留一格（靜止取樣常常一模一樣）：看圖的 token 省下來
    const list = [];
    let last = null;
    for (const x of all) {
      let h = null;
      try { h = createHash('md5').update(fs.readFileSync(x.file)).digest('hex'); } catch { /* 讀不到就照放 */ }
      if (h && h === last) continue;
      last = h;
      list.push(x);
    }
    const n = list.length, portrait = cv.H > cv.W;
    // 固定欄寬（和定稿拼圖同級）：格子數少時整張圖就小，不會 2 格也 1920 寬
    const cols = portrait ? Math.max(4, Math.min(6, n)) : Math.min(4, Math.max(1, n));
    const tw = portrait ? Math.floor((1920 - (cols - 1) * 8) / cols) : 474, th = Math.round((tw * cv.H) / cv.W);
    const dir = path.dirname(list[0].file);
    const page = contactSheet({ fontsCss, title: `${id}｜${n} 張（中點、靜止、完成態）`, cols, tile: [tw, th], label: 34, fontSize: 20,
      cells: list.map((s) => ({ src: pathToFileURL(s.file).href, time: fmtT(s.t), id: null, text: SHOT_KIND[s.kind] || s.kind })) });
    const hf = path.join(dir, `.sheet-${id}.html`), jpg = path.join(dir, `sheet-${id}.jpg`);
    fs.writeFileSync(hf, page.html);
    try { await G.shot({ file: hf, out: jpg, width: page.width, height: page.height, quality: 85 }); } finally { fs.rmSync(hf, { force: true }); }
    out.push({ id, file: rel(jpg), count: n });
  }
  return out;
}

export async function audit(flags, { log = console.log } = {}) {
  const P = pathsFrom(flags);
  const project = P.project ? projectLabel(P, P.project) : rel(P.out);
  const index = path.join(P.out, 'index.html');
  // 009：版式（--format > plan.json format > 製作進度.md「版式」列 > 主軌寬高比）；直式時舞台縮放的段量子合成座標、其他段用 1080×1920 量
  let planJson = null;
  try { planJson = JSON.parse(fs.readFileSync(P.plan, 'utf8')); } catch { planJson = null; }
  const fmt = resolveFormat({ projectDir: P.project, plan: planJson, flag: flags.format });
  const cv = canvasOf(fmt.format), portrait = fmt.format === 'portrait';
  const only = flags.only ? flags.only.split(',').map((x) => x.trim()).filter(Boolean) : null;
  const jobs = jobsOf(flags.jobs), wantShots = !!(flags.shots || flags.sheet);
  const report = { ok: false, project, format: fmt.format, canvas: [cv.W, cv.H], only, errors: [], warnings: [], notes: [], segments: [], findings: [], chrome: null, runtime: null };
  log(formatLine(fmt));
  if (!fs.existsSync(index)) { report.errors.push(`找不到 ${rel(index)} → 先跑 node shared/template/tools/build.mjs --project ${project}`); return report; }

  const chk = build({ project: flags.project, template: flags.template, check: true, json: true }, { log: () => {} });
  // 有 --only：其他段的 ✖ 不擋（平行工人各改各的）；這段自己的 ✖、全域的 ✖ 才量不了
  const gate = gateCheck(chk.res, only);
  report.others = { errors: gate.others, ids: gate.otherIds };
  if (gate.fatal.length) {
    report.errors.push(...gate.fatal.map((e) => `build --check：${e}`), only
      ? `--only ${only.join(',')} 量不了（上面是這段或全域的 ✖）→ 照 → 後面的建議改；custom 檔的問題改完直接重跑這條（不用 build），要動 plan.json 的改完重跑 build（子代理交回主代理）`
      : `build --check 有 ✖ → 先照 → 後面的建議改好 plan.json、重跑 build，再 audit`);
    return report;
  }
  const res = chk.res;
  const pick = pickItems(res.items, { only, all: !!flags.all });
  report.errors.push(...pick.errors);
  report.notes.push(...pick.skipped.map((s) => `不量 ${s}`));
  if (pick.errors.length) return report;
  // 工人只跑這一條：這段在 --check 表上那一行（段長、綁句）與它的 ⚠
  if (only) {
    const named = res.items.filter((x) => only.includes(x.id));
    report.checkRows = named.length ? checkTable({ ...res, items: named }, {}).split('\n').slice(1, 1 + named.length) : [];
    report.cueTimes = named.map((it) => ({ id: it.id, refs: Object.entries(it.cueRefs || {}).map(([ref, t]) => [ref, Math.round((t - it.start) * 100) / 100]) })).filter((x) => x.refs.length);
    report.checkWarnings = (res.allItems || res.items).filter((x) => only.includes(x.id)).flatMap((x) => x.warnings || []);
  }
  if (!pick.list.length) {
    report.ok = true;
    report.notes.push(flags.all ? 'plan.json 沒有可以量的段' : 'plan.json 沒有 custom 段（type: "custom"）→ 要量情境模板加 --all');
    return report;
  }
  if (fs.existsSync(P.plan) && fs.statSync(P.plan).mtimeMs > fs.statSync(index).mtimeMs + 1) report.warnings.push(`plan.json 比 index.html 新 → 先重跑 build，量到的才是最新版`);
  const root = fs.readFileSync(index, 'utf8').match(/data-width="(\d+)"[^>]*data-height="(\d+)"/);
  if (root && (+root[1] !== cv.W || +root[2] !== cv.H)) report.warnings.push(`index.html 是 ${root[1]}×${root[2]}，版式是${portrait ? '直式' : '橫式'} ${cv.W}×${cv.H} → 用同一個版式重跑 build 再 audit（這次照 ${cv.W}×${cv.H} 的規則量）`);

  const dur = durationWarnings(pick.list, P.out);
  const chrome = findChrome({ chrome: flags.chrome });
  const rt = findRuntime({ runtime: flags.runtime });
  report.chrome = chrome;
  report.runtime = rt.version;
  const nPages = Math.max(1, Math.min(jobs, Math.ceil(pick.list.length / 3)));   // 開一頁要載整支片：段少時不值得多開
  log(`專案：${project}`);
  log(`量 ${pick.list.length} 段（${flags.only ? `--only ${flags.only}` : flags.all ? '情境模板與 custom' : 'custom'}）；HyperFrames runtime ${rt.version}${nPages > 1 ? `；${nPages} 個 Chrome 併發` : ''}`);

  const segs = new Map(pick.list.map((it) => [it.id, { id: it.id, type: it.type, label: it.label, layout: layoutOf(it), start: it.start, end: it.end, samples: [] }]));
  const fresh = Object.fromEntries(res.items.filter((it) => it.type === 'custom' && it.cueRefs).map((it) => [it.id, it.cueRefs]));
  const G = await openSessions({ dir: P.out, chrome, runtime: rt.file, W: cv.W, H: cv.H, extraHead: freshRefsScript(fresh), count: nPages });
  const S0 = G.sessions[0];
  const plans = new Map();
  // custom 段：先讀時間軸（子合成掛上之後才有；第一次 seek 到第一段的起點），排靜止取樣、之後判節奏
  const motions = new Map();
  const customs = pick.list.filter((it) => it.type === 'custom' && it.compId);
  let cueErrs = [];
  try {
    if (portrait) {
      const regions = JSON.parse(await S0.evaluate('JSON.stringify(window.__regions || null)'));
      for (const it of pick.list) plans.set(it.id, portraitPlan(it, cv, regions));
    }
    if (customs.length) {
      await S0.seek(customs[0].start + 0.01);
      for (const it of customs) {
        let mo = await S0.motion({ hostId: `el-${it.id}`, compId: it.compId });
        if (!mo) { await S0.seek(it.start + 0.01); mo = await S0.motion({ hostId: `el-${it.id}`, compId: it.compId }); }
        motions.set(it.id, mo);
      }
    }
  } catch (e) { await G.close(); throw e; }
  // 每段一組取樣（同一段都在同一頁量，段內照時間先後）；全部量完照時間排回去，順序和內容都和 --jobs 1 一樣
  const groups = pick.list.map((it) => {
    const ts = sampleTimes(it);
    const still = it.type === 'custom' ? stillTimes(motions.get(it.id), it) : [];
    return { it, jobs: [...ts.map((s) => ({ it, ...s, floor: ts[0].kind === 'mid' && s.kind === 'done' ? ts[0].t : it.start })), ...still.map((s) => ({ it, ...s, floor: it.start }))].sort((a, b) => a.t - b.t) };
  });
  // 「有靜止的內容」：背景層（滿版底、側邊欄面板）不算
  const hasStill = (m) => (m.els || []).some((e) => !e.moving && !e.bg && (e.text || e.painted || e.media));
  const shotsDir = path.join(P.project || P.out, 'work', 'audit-shots');
  // 重跑時先清掉這幾段的舊截圖（時間變了舊檔不會被蓋掉，工人會看到過期的圖）
  if (wantShots && fs.existsSync(shotsDir)) {
    const ids = new Set(pick.list.map((it) => it.id));
    for (const f of fs.readdirSync(shotsDir)) { const m = f.match(/^(.+)-\d+\.\d\d\.jpg$/); if (m && ids.has(m[1])) fs.rmSync(path.join(shotsDir, f), { force: true }); }
  }
  const measureJob = async (S, j) => {
    const pl = plans.get(j.it.id), seg = segs.get(j.it.id), out = { t0: j.t, shot: null, sample: null, raw: [] };
    const measureAt = async (t) => { await S.seek(t); return S.measure({ hostId: `el-${j.it.id}`, W: pl ? pl.W : CANVAS[0], H: pl ? pl.H : CANVAS[1], ...(pl && pl.unstage ? { unstage: true } : {}) }); };
    let m = await measureAt(j.t), at = j.t;
    // 完成態那一刻全部都在動（退場動畫比 0.6 秒長，例如 03 側邊欄推回 0.7 秒）：每次往前 0.3 秒找最後一個靜止的畫面，最多退到中點
    for (let k = 1; j.kind === 'done' && !m.missingHost && (m.els || []).length && !hasStill(m) && k <= 6; k++) {
      const t = r3(j.t - 0.3 * k);
      if (t <= j.floor + 0.05) break;
      const m2 = await measureAt(t);
      at = t;
      if (hasStill(m2)) { m = m2; j.t = t; }
    }
    if (wantShots) {
      if (at !== j.t) await S.seek(j.t);   // 往前找過但都還在動：截回取樣那一刻
      const f = path.join(shotsDir, `${j.it.id}-${j.t.toFixed(2)}.jpg`);
      await S.screenshot(f);
      out.shot = { file: f, id: j.it.id, t: j.t, kind: j.kind };
    }
    const still = (m.els || []).filter((e) => !e.moving);
    out.sample = { t: j.t, kind: j.kind, measured: still.length, moving: (m.els || []).length - still.length };
    out.id = j.it.id;
    if (!m.missingHost && Math.abs(m.host.start - j.it.start) > 0.02) {
      out.raw.push({ id: j.it.id, label: j.it.label, level: 'error', rule: 'stale', el: null, t: j.t, kind: j.kind,
        msg: `index.html 和 plan.json 對不上：#el-${j.it.id} 在 index.html 從 ${m.host.start}s 開始，plan.json 算出來是 ${j.it.start}s`, fix: `重跑 node shared/template/tools/build.mjs --project ${project}` });
      return out;
    }
    out.raw.push(...judgeSample(m, { item: j.it, t: j.t, kind: j.kind, layout: seg.layout, pipOn: !pl && pipOnAt(j.it, j.t), badgeBox: pl ? null : j.it.badgeBox ?? null, speakerBox: res.globals.speakerBox, sideShift: res.globals.sideShift, speakerWarn: speakerWarnOf(j.it),
      W: pl ? pl.W : CANVAS[0], H: pl ? pl.H : CANVAS[1], ...(pl && pl.geo ? { geo: pl.geo } : {}), ...(pl && pl.stage ? { stage: pl.stage } : {}) }));
    out.raw.push(...judgeLayout(m, { item: j.it, t: j.t, kind: j.kind, layout: seg.layout, ...(pl && pl.stage && pl.stage.window ? { contentY: [pl.stage.window[1], pl.stage.window[3]] } : j.it.wide && j.it.seg?.design ? { contentY: FULL.y } : {}) }));
    // 012 版面：完成態量 data-layout 容器（SceneLayout.measure，版面座標）；有容器時 illus 的手排對齊交給它
    let lay = null;
    if (j.kind === 'done' && !m.missingHost) {
      const js = await S.evaluate(`(() => { const h = document.getElementById(${JSON.stringify(`el-${j.it.id}`)}); return h && window.SceneLayout ? JSON.stringify(window.SceneLayout.measure(h)) : 'null'; })()`);
      lay = JSON.parse(js || 'null');
      out.raw.push(...judgeLayoutRules(lay, { item: j.it, t: j.t }));
    }
    out.raw.push(...judgeIllus(m, { item: j.it, t: j.t, kind: j.kind, hasLayout: !!(lay && lay.containers.length) }));
    if (j.kind === 'done' && !m.missingHost && !hasStill(m)) {
      out.raw.push({ id: j.it.id, label: j.it.label, level: 'warn', rule: 'empty', el: null, t: j.t, kind: j.kind,
        msg: `完成態沒有量到任何內容（${(m.els || []).length ? '全部還在動畫中' : '畫面上是空的'}）`, fix: `用 npx hyperframes snapshot --at ${j.t} 看這一刻的畫面；內容要在段尾前 0.6 秒停在完成態（R6）` });
    }
    return out;
  };
  const raw = [], shots = [];
  try {
    const done = await poolOn(G.sessions, groups, async (S, g) => { const out = []; for (const j of g.jobs) out.push(await measureJob(S, j)); return out; });
    for (const r of done.flat().sort((a, b) => a.t0 - b.t0)) {
      segs.get(r.id).samples.push(r.sample);
      raw.push(...r.raw);
      if (r.shot) shots.push(r.shot);
    }
    if (shots.length) report.shots = shots.map((s) => rel(s.file));
    cueErrs = [...new Set((await Promise.all(G.sessions.map((S) => S.cueErrors()))).flat().map(String))].sort();
  } finally { await G.close(); }
  const htmlOf = (it) => { const f = it.file && path.join(P.out, it.file); return f && fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : ''; };
  // 每頁都會遇到同一批頁面錯誤：去重、照字排，順序才和 --jobs 1 一樣
  const seenErr = new Set();
  let pageErrors = G.sessions.flatMap((S) => S.errors).filter((e) => { const k = `${e.text}|${e.url}|${e.line}`; if (seenErr.has(k)) return false; seenErr.add(k); return true; }).sort((a, b) => (String(a.text) < String(b.text) ? -1 : String(a.text) > String(b.text) ? 1 : 0));
  if (only) {
    // 有 --only：其他段的頁面錯誤（工人 A 的 x 檔改到一半）不算這段的，併進「其他段有 N 個 ✖」
    const notMine = res.items.filter((x) => !only.includes(x.id));
    const sp = splitPageErrors({ errors: pageErrors, cueErrs, others: notMine, htmlOf });
    pageErrors = sp.errors; cueErrs = sp.cueErrs;
    // --check 已經算到的段不重複算（同一個綁句錯誤，頁面上也會報一次）
    const added = sp.otherIds.filter((id) => !report.others.ids.includes(id));
    report.others = { errors: report.others.errors + added.length, ids: [...report.others.ids, ...added] };
  }
  const pageErrs = scriptErrors(pageErrors, pick.list, htmlOf);
  const ilDir = path.join(P.out, 'illus-local');
  const local = fs.existsSync(ilDir) ? fs.readdirSync(ilDir).filter((f) => /^[A-Za-z0-9]+\.svg$/.test(f)).map((f) => f.slice(0, -4)) : [];
  report.warnings.push(...pageErrs.warnings);
  const cue = cueFindings(cueErrs, pick.list);
  report.warnings.push(...cue.warnings);
  const motion = [];
  const sbFile = path.join(path.dirname(P.out), 'storyboard.md');
  const sbText = fs.existsSync(sbFile) ? fs.readFileSync(sbFile, 'utf8') : '';
  const sheets = parseBeatSheets(sbText), lists = parseIllusLists(sbText);
  for (const it of customs) {
    const r = judgeMotion(motions.get(it.id), { item: it, fadeOut: !!it.fadeOut });
    motion.push(...r.findings);
    const src = it.file && path.join(P.out, it.file);
    motion.push(...cueTextFindings(motions.get(it.id), { item: it, cuesOut: res.cuesOut || [], names: src && fs.existsSync(src) ? atNames(fs.readFileSync(src, 'utf8')) : {} }));
    motion.push(...staticFindings(motions.get(it.id), { item: it, cuesOut: res.cuesOut || [] }));
    // 分鏡對齊：work/storyboard.md 的「#### 動畫分鏡 <段 id>」表和檔裡的 P.at 逐拍比（cli-003 §2.3d）
    const sheet = sheets.get(it.id) ?? (it.seg?.__sheet ? parseBeatSheets(it.seg.__sheet).get(it.id) : null), mo = motions.get(it.id), html = htmlOf(it);
    // 範例檔頭【D 下限】：第一拍離段起點、段長；和範例原檔比：下限被改小、字級被縮小
    const tpl = (templateFor(html, path.join(P.templateDir, 'custom')) || {}).html || '';
    motion.push(...floorFindings({ item: it, html, cuesOut: res.cuesOut || [], file: it.file, tpl }));
    motion.push(...fontShrinkFindings({ item: it, html, tpl, file: it.file }));
    if (!sheet) motion.push(noSheetFinding(it, it.file));
    else if (mo) motion.push(...beatFindings({ item: it, sheet, marks: mo.marks || [], cuesOut: res.cuesOut || [], html, file: it.file, local }));
    // 011 示意動畫：元件名與 illus-local 檔、閃爍、先有節點再畫線
    motion.push(...illusNameFindings({ item: it, html, file: it.file, local }));
    if (lists.has(it.id)) motion.push(...illusListFindings({ item: it, list: lists.get(it.id), html, local }));
    motion.push(...illusMotionFindings(mo, { item: it }));
    report.notes.push(...r.notes);
    const seg = segs.get(it.id);
    // cli-003 §5：units＝新元素個數；marks、busy 都是段內秒數
    if (mo && seg) seg.motion = { units: motionUnits(mo).length, marks: mo.marks, busy: busySpans(mo) };
  }
  const findings = [...pageErrs.findings, ...cue.findings, ...mergeFindings(raw), ...dur, ...motion];
  const order = [...segs.keys()];
  findings.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id) || (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1));
  report.findings = findings;
  report.segments = [...segs.values()].map((s) => ({ ...s, errors: findings.filter((f) => f.id === s.id && f.level === 'error').length, warns: findings.filter((f) => f.id === s.id && f.level === 'warn').length }));
  report.ok = !report.errors.length && !findings.some((f) => f.level === 'error');
  // 還有 ✖ 就不出拼圖：先修到過，交件前才看圖（一張圖約 2 千 token，每輪都看很貴）
  if (flags.sheet && shots.length) {
    if (!report.ok) report.notes.push('還有 ✖：修完再跑一次才出拼圖');
    else {
      const B = await openBrowser({ chrome, W: cv.W, H: cv.H });
      try { report.sheets = await shotSheets(B, P, shots, cv); } finally { await B.close(); }
    }
  }
  // ⚠ 只修一輪：同一段第 2 次起 0 個 ✖ 就可以交件，追 ⚠ 常常越改越多
  if (only && report.ok && P.out && !flags.review) {   // --review：build --review 只重量變了的段時帶，不算工人交件的次數
    const nth = Math.max(...only.map((id) => runCount(P, `audit:${id}`)));
    if (nth >= 2 && findings.length) report.settled = true;
  }
  return report;
}

// 預設只印 ✖、⚠ 與統計；verbose 才印全表、每張截圖、節奏備註（長片一段一行也有上百行）
export function formatReport(r, { verbose = false } = {}) {
  const L = [];
  for (const e of r.errors) L.push(`✖ ${e}`);
  // 長片一段一行太多：範例原文、節奏沒檢查的段各併成一行
  const notes = r.notes || [], tempo = /^\S+：(讀不到 window\.__timelines|沒有 P\.at 綁句)/;
  const samples = verbose ? [] : notes.filter((n) => /^不量 .*還是範例原文/.test(n));
  const unpaced = verbose ? [] : notes.filter((n) => tempo.test(n));
  for (const n of notes) if (!samples.includes(n) && !unpaced.includes(n)) L.push(n);
  if (samples.length) L.push(`不量 ${samples.length} 段（還是範例原文、還沒做）：${samples.map((n) => n.replace(/^不量 (\S+?)（.*$/, '$1')).join('、')}`);
  if (unpaced.length) L.push(`節奏沒檢查 ${unpaced.length} 段（${unpaced.map((n) => n.split('：')[0]).join('、')}）→ --verbose 看原因`);
  if (r.others?.errors) L.push(`其他段有 ${r.others.errors} 個 ✖（不影響這段）`);
  for (const row of r.checkRows || []) L.push(row);
  for (const c of r.cueTimes || []) L.push(`${c.id} 綁句（段內秒數）：${c.refs.map(([ref, t]) => `${ref} ${t.toFixed(2)}`).join('、')}`);
  for (const w of r.warnings) L.push(`⚠ ${w}`);
  for (const w of r.checkWarnings || []) L.push(`⚠ ${w}`);
  const lines = r.findings.map((f) => ({ f, text: formatFinding(f) }));
  for (const x of lines) if (x.f.level === 'error') L.push(x.text);
  const warnLines = lines.filter((x) => x.f.level !== 'error').map((x) => x.text.replace(/^\s*⚠\s*/, ''));
  for (const w of verbose || r.only ? warnLines : groupWarnings(warnLines)) L.push(`⚠ ${w}`);
  if (r.segments.length && verbose) {
    L.push('', 'id｜情境｜版型｜量測時間｜結果');
    for (const s of r.segments) {
      const times = s.samples.map((x) => `${fmtT(x.t)} ${x.kind === 'done' ? '完成態' : x.kind === 'still' ? '靜止' : '中點'}${x.moving ? `（${x.moving} 個在動畫中，不判）` : ''}`).join('、');
      L.push(`${s.id}｜${s.label}｜${s.layout}｜${times}｜${s.errors || s.warns ? [s.errors ? `✖ ${s.errors}` : '', s.warns ? `⚠ ${s.warns}` : ''].filter(Boolean).join(' ') : '✓'}`);
    }
  }
  const ne = r.errors.length + r.findings.filter((f) => f.level === 'error').length, nw = r.warnings.length + (r.checkWarnings || []).length + r.findings.filter((f) => f.level === 'warn').length;
  if (r.segments.length) {
    const looks = r.shots?.length ? '' : r.only ? '要看畫面：這條加 --shots --sheet。' : '要看畫面：qc.mjs storyboard --sheet。';
    L.push('', ne ? `未通過：${ne} 個錯誤（✖），${nw} 個提醒（⚠）。照 → 後面的改法改 custom 檔（或 plan.json 後重跑 build），再跑一次 audit。` : `通過：${r.segments.length} 段，${nw} 個提醒（⚠）。${r.settled ? '可以交件，⚠ 不用再修。' : ''}audit 量的是幾何，畫面對不對還要看圖。${looks}`);
    const bad = [...new Set(r.findings.flatMap((f) => f.at || []))].sort((a, b) => a - b).slice(0, 12);
    // 有 --only 的是工人（不能跑 snapshot）：看圖用 --shots --sheet
    if (bad.length && !r.only && !r.shots?.length) L.push(`看畫面：cd ${r.project}/work/hyperframes && npx hyperframes snapshot --at ${bad.map((t) => r3(t)).join(',')} --no-end -o ../../output/qc`);
  } else if (ne) L.push('', `未通過：${ne} 個錯誤（✖）。`);
  if (r.sheets?.length) {
    L.push('', `截圖拼成${r.sheets.length === 1 ? '一張' : ` ${r.sheets.length} 張`}（每格標時間；用看圖的工具打開，對照分鏡看每個動作有沒有真的看得到）：`, ...(verbose || r.sheets.length <= 12 ? r.sheets.map((s) => `  ${s.file}（${s.count} 格）`) : [`  ${r.sheets[0].file} …（共 ${r.sheets.length} 張，每段一張 sheet-<段 id>.jpg，都在 ${path.dirname(r.sheets[0].file)}）`]));
    if (verbose && r.shots?.length) L.push(...r.shots.map((f) => `  ${f}`));
  } else if (r.shots?.length) L.push('', `截圖 ${r.shots.length} 張（用看圖的工具打開，對照分鏡看每個動作有沒有真的看得到）：`, ...(verbose || r.shots.length <= 12 ? r.shots : [...r.shots.slice(0, 3), `…（共 ${r.shots.length} 張，都在 ${path.dirname(r.shots[0])}；--verbose 全列，或加 --sheet 拼成一張）`]).map((f) => `  ${f}`));
  return L.join('\n');
}

async function cli() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*\n?/, '').replace(/^ \* ?/gm, '')); return 0; }
  const t0 = Date.now();
  const r = await audit(flags, { log: flags.json ? () => {} : console.log });
  r.elapsed = r3((Date.now() - t0) / 1000);
  if (flags.json) console.log(JSON.stringify(r, null, 2));
  else console.log(`${formatReport(r, { verbose: !!flags.verbose })}\n（${r.elapsed}s）`);
  return r.ok ? 0 : 1;
}

const isMain = () => {
  try { return !!process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
};
if (isMain()) {
  const wantJson = process.argv.includes('--json');
  cli().then((code) => { process.exitCode = code; }, (e) => {
    if (wantJson) console.log(JSON.stringify({ ok: false, errors: [e.message], warnings: [], segments: [], findings: [] }, null, 2));
    else console.error(`✖ ${e.message}`);
    process.exitCode = 1;
  });
}
