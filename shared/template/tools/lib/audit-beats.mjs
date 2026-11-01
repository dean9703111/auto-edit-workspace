// 003 v2：動畫分鏡（beat sheet）對齊（specs/contracts/cli-003.md §2.3d；brief「補充」、design-system.md §14）
//   parseBeatSheets(md)                 → Map(段 id → { line, header, rows: [{ beat, said, refs: [{ ref, off }], moves: [詞], note, line }] })
//     「講到」欄只取第一個 #N（後面的「講 #36–#37」是說明）；「拍」欄整格包在（）裡的列（例「（交棒）」）是說明列，不比對
//   對齊（beatFindings）：同一個句號的幾拍（#35、#35＋0.7、#35＋1.2）是一組，檔裡有一個 P.at 落在其中任一拍 ±0.5 s 就算對上
//     （組內其他拍用「上一拍 + 秒數」接，和「完成態停太短」的建議一致）；每個用句號的 P.at 都要落在某一拍 ±0.5 s 內，不然算多出來
//   movesOf(cell)                       → 「動態」欄拆出的動作名（拿掉括號、＋0.15 這類時間、「同拍 N」）
//   beatFindings({ item, sheet, marks, cuesOut, html, file }) → [finding]（✖ 缺拍／多出來的 P.at／語彙不存在；⚠ 用了動作但檔裡沒有那個原語）
//   noSheetFinding(item)                → ⚠ 沒有動畫分鏡
//   「講到」欄寫「段起點 #N」的那一拍是隱含的一拍（開場由 ENTER／build 做，不必有 P.at）：#N 在段首 ±0.5 s 內就算對上
//   示意動畫（x-scene）的分鏡多兩欄「插圖元件（狀態）」「位置」：插圖元件只能是畫廊的 20 個、ILLUS.register 過的、illus-local/ 有檔的（契約 illus.md §5.6）；「—」＝圖示組合，不查
//   parseIllusLists(md)                 → Map(段 id → { line, rows: [{ name, source, how, line }] })：「#### 插圖清單 <段 id>」（舊名「素材清單」也認）
//   illusListFindings({ item, list, html, local }) → ✖ 來源不是三種之一、「畫廊」的元件畫廊沒有、「新建 SVG」還沒畫（illus-local/ 沒有那個檔）
import { parseTime, cueSeconds } from './time.mjs';
import { fmtT } from './audit-rules.mjs';
import { ILLUS_BUILTIN, illusOf } from './audit-illus.mjs';

export const BEAT_TOL = 0.5;   // 分鏡的綁句和 P.at 差 ≤ 0.5 s 算對上
export const BEAT_HEADER = ['拍', '講到（綁句）', '畫面上出現什麼', '動態（設計系統語彙）', '焦點', '音效拍點'];
export const BEAT_HEADER_ILLUS = ['插圖元件（狀態）', '位置'];   // 示意動畫段接在 BEAT_HEADER 後面的兩欄
export const BEAT_TITLE = '#### 動畫分鏡';
// shared/template/BEATS.md §2（＝design-system.md §14.1）的 47 個具名動作 → 對應的 P.*（build＝main.mjs 內建，custom 檔裡不會出現）
export const VOCAB = [
  ['進場', '擦開', 'wipe'], ['進場', '滑入', 'drift'], ['進場', '彈出', 'pop'], ['進場', '錯拍彈出', 'pop'], ['進場', '長出', 'grow'], ['進場', '抽屜抽出', 'slide'], ['進場', '淡入', 'in'],
  ['字', '逐字上浮', 'chars'], ['字', '逐字彈出', 'chars'], ['字', '逐字落下', 'chars'], ['字', '打字', 'type'], ['字', '數字滾動', 'count'],
  ['線', '描線', 'stroke'], ['線', '彗星描線', 'comet'], ['線', '圖示描線', 'icon'], ['線', '描圈打勾', 'check'], ['線', '劃掉', 'strike'], ['線', '進度推進', 'bar'], ['線', '量條', 'bar'], ['線', '虛線流動', 'flow'],
  ['強調', '光澤掃過', 'sheen'], ['強調', '螢光筆', 'marker'], ['強調', '重拍', 'punch'], ['強調', '漣漪', 'ripple'], ['強調', '蓋章', 'stamp'],
  ['焦點', '聚焦', 'spot'], ['焦點', '預覽態', 'spot'], ['焦點', '走過', 'spot'], ['焦點', '退焦', 'dim'], ['焦點', '回均衡', 'spot'],
  ['鏡頭', '鏡頭慢推', 'cam'], ['鏡頭', '鏡頭跟焦點', 'cam'], ['鏡頭', '鏡頭回正', 'cam'],
  ['移動', '游標移動', 'morph'],
  ['微動', '漂浮', 'idle'], ['微動', '呼吸', 'idle'], ['微動', '背景環境', 'ambient'], ['微動', '講者慢推', 'build'],
  ['退場', '擦掉', 'wipeOut'], ['退場', '抽屜收回', 'slideOut'], ['退場', '淡出', 'out'],
  ['轉場', '色帶擦開', 'build'], ['轉場', '子母畫面飛入', 'build'], ['轉場', '色帶收回', 'build'], ['轉場', '換卡不換景', 'wipe'], ['轉場', '章節色塊擦入', 'wipe'], ['轉場', '章號重拍', 'pop'],
].map(([kind, name, prim]) => ({ kind, name, prim }));
// 拍型表的縮寫：「開場（依前段）」＝從講者來的色帶擦開＋子母畫面飛入＋長出，或從全畫面來的換卡不換景（§14.2）
export const VOCAB_EXTRA = [{ kind: '轉場', name: '開場', prim: 'build' }];
const BY_NAME = new Map([...VOCAB, ...VOCAB_EXTRA].map((v) => [v.name, v]));
// 「對應」欄第一個 P.* 以外也算做到的寫法（⚠ 用了沒做的動作時一起找）：沒有聚焦組的段，回均衡＝P.dim(…, {to: 1})；聚焦組裡的退焦＝P.spot 的預覽態或 dim
export const VOCAB_ALT = { 回均衡: ['dim'], 退焦: ['spot'] };

const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const norm = (s) => s.replace(/（[^（）]*）|\([^()]*\)/g, '').replace(/\s+/g, '');   // 「焦點（觀眾看哪）」這種補充說明不算錯

export function movesOf(cell) {
  let s = String(cell || '').replace(/`/g, '');
  for (let k = 0; k < 3; k++) s = s.replace(/（[^（）]*）|\([^()]*\)/g, '');            // 對象、參數、說明
  s = s.replace(/[＋+−-]\s*\d+(?:\.\d+)?\s*s?/g, '；');                                  // 「＋0.15 圖示描線」的時間
  return s.split(/[；;、，,＋+或]/).map((x) => x.replace(/^.*[：:]/, '').trim())               // 「到站：聚焦」只取冒號後
    .filter((x) => x && !/^[—–-]+$/.test(x) && !/^同拍\s*\d/.test(x));
}

// 「講到」欄：`#38@兩支`、`#38@兩支`+0.3、#15e、#12@錄影 −0.2；段起點、拍 2＋1.2 這種相對寫法不算綁句
const REF_RE = /#(\d+)(e?)(?:@([^`\s＋+−\-（(｜|，,；;]+))?`?\s*(?:([＋+−-])\s*(\d+(?:\.\d+)?))?/g;
export function refsOf(cell) {
  for (const m of String(cell || '').matchAll(REF_RE)) {
    const ref = `#${m[1]}${m[2]}${m[3] ? `@${m[3]}` : ''}`;
    const off = m[5] ? (m[4] === '+' || m[4] === '＋' ? 1 : -1) * Number(m[5]) : 0;
    return [{ ref, off }];
  }
  return [];
}

export function parseBeatSheets(md) {
  const lines = String(md || '').split(/\r?\n/), out = new Map();
  for (let i = 0; i < lines.length; i++) {
    const h = lines[i].match(/^####\s*動畫分鏡\s+(\S+)\s*$/);
    if (!h) continue;
    const id = h[1], sheet = { line: i + 1, header: null, rows: [] };
    let j = i + 1;
    while (j < lines.length && !lines[j].trim()) j++;
    if (j < lines.length && lines[j].trim().startsWith('|')) {
      sheet.header = cells(lines[j]);
      const wide = sheet.header.length > BEAT_HEADER.length;
      j += 1;
      if (j < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[j])) j++;
      for (; j < lines.length && lines[j].trim().startsWith('|'); j++) {
        const c = cells(lines[j]);
        const note = /^[（(][^（）()]*[）)]$/.test(c[0] || '');
        sheet.rows.push({ beat: c[0] || '', said: c[1] || '', what: c[2] || '', moves: note ? [] : movesOf(c[3]), focus: c[4] || '', sfx: c[5] || '', refs: note ? [] : refsOf(c[1]), note, line: j + 1,
          start: /段起點/.test(c[1] || ''), ...(wide ? { illus: c[6] || '', pos: c[7] || '' } : {}) });
      }
    }
    out.set(id, sheet);
  }
  return out;
}

// 「插圖元件（狀態）」欄：phoneTripod（rec）、badge（check）；router → 名稱（拿掉括號裡的狀態；— 是沒有）
export function illusNamesOf(cell) {
  let s = String(cell || '').replace(/`/g, '');
  for (let k = 0; k < 3; k++) s = s.replace(/（[^（）]*）|\([^()]*\)/g, '');
  return s.split(/[；;、，,＋+／\/\s]+/).map((x) => x.trim()).filter((x) => x && !/^[—–-]+$/.test(x));
}

// 插圖清單（BEATS.md §5.3）：| 元件 | 來源 | 怎麼來 |；來源只有「畫廊」「圖示組合」「新建 SVG」；新建 SVG 的名稱取「怎麼來」欄的「規格：<名稱>」
export const ILLUS_SOURCES = ['畫廊', '圖示組合', '新建 SVG'];
export function parseIllusLists(md) {
  const lines = String(md || '').split(/\r?\n/), out = new Map();
  for (let i = 0; i < lines.length; i++) {
    const h = lines[i].match(/^####\s*(?:插圖清單|素材清單)\s+(\S+)\s*$/);
    if (!h) continue;
    const list = { line: i + 1, rows: [] };
    let j = i + 1;
    while (j < lines.length && !lines[j].trim()) j++;
    if (j < lines.length && lines[j].trim().startsWith('|')) {
      j += 1;
      if (j < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[j])) j++;
      for (; j < lines.length && lines[j].trim().startsWith('|'); j++) {
        const c = cells(lines[j]);
        const source = (c[1] || '').replace(/[`✓✔\s]/g, '').replace(/^新建SVG$/, '新建 SVG');
        const spec = (c[2] || '').match(/規格[：:]\s*`?([A-Za-z][A-Za-z0-9]*)/);
        list.rows.push({ name: spec ? spec[1] : (illusNamesOf(c[0])[0] || ''), source, how: c[2] || '', line: j + 1 });
      }
    }
    out.set(h[1], list);
  }
  return out;
}

export function illusListFindings({ item, list, html = '', local = [] }) {
  const out = [];
  const base = { id: item.id, label: item.label, kind: 'beats', el: null, at: [], t: null, level: 'error' };
  const reg = illusOf(html).registered;
  for (const r of list.rows) {
    if (!ILLUS_SOURCES.includes(r.source)) { out.push({ ...base, rule: 'illus-list', msg: `插圖清單（storyboard.md 第 ${r.line} 行）的來源「${r.source}」不是畫廊、圖示組合、新建 SVG 之一`, fix: '照 shared/template/kit/illus-style.md §1 的順序選：畫廊有就寫「畫廊」，圖示能表達寫「圖示組合」，都不行寫「新建 SVG」', data: { name: r.name } }); continue; }
    if (r.source === '畫廊' && !ILLUS_BUILTIN.includes(r.name)) out.push({ ...base, rule: 'illus-list', msg: `插圖清單（第 ${r.line} 行）寫畫廊的「${r.name}」，畫廊沒有這個元件`, fix: '改成 shared/template/kit/illus-gallery.jpg 裡的元件名（大小寫照抄），或來源改「新建 SVG」照 shared/template/kit/illus-style.md 畫', data: { name: r.name } });
    if (r.source === '新建 SVG' && !(local.includes(r.name) || reg.includes(r.name))) out.push({ ...base, rule: 'illus-list', msg: `插圖清單（第 ${r.line} 行）的新建 SVG「${r.name || '（沒寫規格：名稱）'}」還沒畫：work/hyperframes/illus-local/${r.name || '<名稱>'}.svg 不存在`, fix: `照 shared/template/kit/illus-style.md 畫好存成 work/hyperframes/illus-local/${r.name || '<名稱>'}.svg（「怎麼來」欄寫「規格：<名稱>，建議尺寸 W×H，狀態 a／b」），再跑 media.mjs illus-lint`, data: { name: r.name } });
  }
  return out;
}

const closest = (w) => {
  let best = null, score = 0;
  for (const v of VOCAB) { const s = [...v.name].filter((ch) => w.includes(ch)).length / Math.max(v.name.length, w.length); if (s > score) { score = s; best = v.name; } }
  return best || '彈出';
};

export function noSheetFinding(item, file) {
  return { id: item.id, label: item.label, level: 'warn', rule: 'beats-none', el: null, t: item.start, kind: 'beats',
    msg: `沒有動畫分鏡：work/storyboard.md 沒有「${BEAT_TITLE} ${item.id}」（${file || item.label}）`,
    fix: `照 shared/template/BEATS.md §3 這個情境的預設拍型，在 storyboard.md 這段底下寫一張表，表頭固定「| ${BEAT_HEADER.join(' | ')} |」，給人在停點 ③ 確認後再做動畫` };
}

// sheet＝parseBeatSheets 的一段；marks＝collectMotionInPage 的 marks（段內秒數）；cuesOut＝build --check 的成片秒數字幕；html＝x-*.html 原文
export function beatFindings({ item, sheet, marks = [], cuesOut = [], html = '', file = '', local = [] }) {
  const out = [];
  const base = { id: item.id, label: item.label, kind: 'beats', el: null };
  const err = (rule, t, msg, fix, data = {}) => out.push({ ...base, level: 'error', rule, t: Math.round((item.start + t) * 1000) / 1000, msg, fix, data });
  const warn = (rule, t, msg, fix, data = {}) => out.push({ ...base, level: 'warn', rule, t: Math.round((item.start + t) * 1000) / 1000, msg, fix, data });
  const name = file || item.label;
  const okHeader = sheet.header && [BEAT_HEADER, [...BEAT_HEADER, ...BEAT_HEADER_ILLUS]].some((h) => norm(sheet.header.join('|')) === norm(h.join('|')));
  if (!okHeader) {
    err('beats-header', 0, `分鏡表表頭不對（storyboard.md 第 ${sheet.line} 行「${BEAT_TITLE} ${item.id}」底下）：${sheet.header ? `「| ${sheet.header.join(' | ')} |」` : '標題下面沒有表格'}`,
      `表頭固定寫「| ${BEAT_HEADER.join(' | ')} |」（示意動畫段後面再加「 ${BEAT_HEADER_ILLUS.join(' | ')} |」兩欄），標題和表格之間只能有空行`);
    return out;
  }
  const ms = [];
  for (const m of marks) if (typeof m.ref === 'string' && !ms.some((x) => Math.abs(x.t - m.t) < 1e-6)) ms.push(m);
  const cueSec = (ref, off) => {
    const t = parseTime(ref);
    if (t.error) return { error: t.error };
    const r = cueSeconds(t, cuesOut);
    return r.error ? { error: r.error } : { t: r.sec + off - item.start };
  };
  const lit = (ref, off) => `${ref}${off ? (off > 0 ? `+${off}` : `${off}`) : ''}`;
  const rows = [], groups = new Map();
  sheet.rows.forEach((row, k) => {
    const beat = row.beat || String(k + 1);
    for (const w of row.moves) {
      if (BY_NAME.has(w)) continue;
      err('beats-vocab', 0, `分鏡第 ${beat} 拍的動態「${w}」不在語彙表（shared/template/BEATS.md §2）`, `改成語彙表的名稱，例如「${closest(w)}」；括號裡寫對象與參數，例「彈出（站）」`, { beat, word: w });
    }
    for (const { ref, off } of row.refs) {
      const r = cueSec(ref, off);
      if (r.error) { err('beats-cue', 0, `分鏡第 ${beat} 拍的綁句 ${lit(ref, off)} 算不出時間：${r.error}`, '改成這段字幕裡真的有的句號與詞（build.mjs --check 的報告列出每段的句子）', { beat, ref }); continue; }
      const x = { beat, ref, off, t: r.t, k, start: row.start };
      rows.push(x);
      if (!groups.has(ref)) groups.set(ref, []);
      groups.get(ref).push(x);
    }
  });
  const near = (t) => { let best = null; for (const m of ms) { const d = Math.abs(m.t - t); if (!best || d < best.d) best = { m, d }; } return best; };
  for (const [ref, g] of groups) {
    if (g.some((x) => { const b = near(x.t); return b && b.d <= BEAT_TOL + 1e-6; })) continue;
    if (g.some((x) => x.start && Math.abs(x.t) <= BEAT_TOL + 1e-6)) continue;   // 「段起點 #N」：開場那一拍隱含在段首（ENTER／build），不必有 P.at
    const x = g.slice().sort((a, b) => Math.abs(a.off) - Math.abs(b.off) || a.k - b.k)[0], b = near(x.t);
    const offLit = x.off ? `, ${x.off}` : '';
    err('beats-missing', x.t, `分鏡第 ${x.beat} 拍 ${lit(ref, x.off)}（${fmtT(item.start + x.t)}）在 ${name} 找不到對應的 P.at${b ? `（最近的 P.at('${b.m.ref}') 差 ${b.d.toFixed(2)}s，> ${BEAT_TOL}s）` : '（檔裡沒有任何用句號的 P.at）'}`,
      `在 script 開頭加 const T${x.k + 1} = P.at('${ref}'${offLit})，照分鏡「動態」欄做這一拍；或把分鏡表這一列改成檔裡實際綁的句號`, { beat: x.beat, ref, off: x.off, t: Math.round(x.t * 1000) / 1000 });
  }
  for (const m of ms) {
    if (rows.some((x) => Math.abs(x.t - m.t) <= BEAT_TOL + 1e-6)) continue;
    const g = groups.get(m.ref);
    err('beats-extra', m.t, `${name} 的 P.at('${m.ref}')（${fmtT(item.start + m.t)}）不在分鏡表${g ? `（分鏡表的 ${m.ref} 在第 ${g.map((x) => x.beat).join('、')} 拍，差 > ${BEAT_TOL}s）` : ''}`,
      '分鏡表加一拍（寫出講到、出現什麼、動態），或刪掉這個 P.at；分鏡表改過要在停點 ③ 給人重看', { ref: m.ref, t: m.t });
  }
  const code = String(html).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
  const seen = new Set();
  for (const row of sheet.rows) for (const w of row.moves) {
    const v = BY_NAME.get(w);
    if (!v || v.prim === 'build' || seen.has(v.name) || (v.prim === 'ambient' && /\bP\.end\(/.test(code))) continue;
    seen.add(v.name);
    const prims = [v.prim, ...(VOCAB_ALT[v.name] || [])];
    if (!prims.some((p) => new RegExp(`\\bP\\.${p}\\(`).test(code))) warn('beats-prim', 0, `分鏡用了「${w}」，${name} 裡沒有 ${prims.map((p) => `P.${p}(…)`).join('／')}`, `照分鏡在那一拍加 P.${v.prim}(…)（shared/template/BEATS.md §2 的「對應」欄），或把分鏡的動態改成檔裡實際做的動作`, { word: w, prim: v.prim });
  }
  // 插圖元件欄（示意動畫）：畫廊 20 個、ILLUS.register 過的、work/hyperframes/illus-local/<名稱>.svg 有檔的
  const reg = illusOf(html).registered;
  for (const row of sheet.rows) {
    if (row.illus == null || row.note) continue;
    for (const n of illusNamesOf(row.illus)) {
      if (ILLUS_BUILTIN.includes(n) || reg.includes(n) || local.includes(n)) continue;
      err('beats-illus', 0, `分鏡第 ${row.beat} 拍的插圖元件「${n}」不在畫廊（shared/template/kit/illus-gallery.jpg 的 20 個）、沒有 ILLUS.register，work/hyperframes/illus-local/ 也沒有 ${n}.svg`,
        `改成畫廊的元件名（大小寫照抄，例 phoneTripod），或照 shared/template/kit/illus-style.md 畫好存成 work/hyperframes/illus-local/${n}.svg；圖示（kit/icons.json）寫在「畫面上出現什麼」欄`, { beat: row.beat, name: n });
    }
  }
  return out;
}
