// 語意地圖（specs/024）：分章子代理第一回合寫 work/drafts/<份>.map.md，一組句子一行
//   「句號範圍 | 語意 | 級 | 在講什麼 | 特徵或 A 的理由」
// 主代理只讀合併後的 work/分鏡素材/語意地圖.md 做全片校正（挑 A、統一標法），第二回合子代理照地圖挑模板、填字。純函式，不讀檔、不寫檔。
//   parseMap(md)                                  → [{ line, raw, a, z, sem, tier, say, note }]
//   checkMap(rows, { part, cues, types, syncSpans }) → { errors, warns, rows（語意補成全名、照句號排） }
//   mapOptions(rows, sitRows, specNames, { secsOf, minOf }) → 每行可以用的模板（照語意縮好的 SITUATIONS §3 列；有寫法.md 的名稱就印能直接寫進大綱的名稱；
//                                                   給了秒數就只列放得下的，放不下的另列最短秒數）
//   mapBudget(rows)                               → { eligible, target, cap }：A 的預算（沿用 022：可設計段的三成，上限再加三分之一）
//   mergeMaps(parts, rowsByKey, { videoDur, hasVision }) → { md, errors, warns, stats }
//   designVsMap(items, rows)                      → 大綱、草稿的候選構想和地圖上的 A 對不對得上（⚠ 文字）
import { designTargetOf, designCap } from './scaffold.mjs';

export const TIERS = { A: '亮點', B: '結構', C: '串場' };
// 一行大約就是一段畫面（shared/style.md「分章」）：超過就 ⚠ 拆開；A 佔太多行也 ⚠（024 MiniMax 試跑：一行塞 10–28 句、A 佔一半）
export const ROW_MAX_CUES = 10;
export const ROW_MAX_SECONDS = 30;
export const A_MAX_SHARE = 0.4;
const NONE = /^(—|-|–|無)?$/;

export function parseMap(md) {
  const rows = [];
  String(md ?? '').split(/\r?\n/).forEach((l, i) => {
    if (!l.includes('|')) return;
    const c = l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((x) => x.trim());
    if (c.length < 3 || /^:?-+:?$/.test(c[0]) || /^(句號|範圍)/.test(c[0])) return;
    const m = c[0].match(/^#(\d+)e?\s*(?:[–—~-]+\s*#?(\d+)e?)?$/);
    const t = String(c[2] ?? '').trim().toUpperCase().charAt(0);
    rows.push({ line: i + 1, raw: c[0], a: m ? Number(m[1]) : null, z: m ? Number(m[2] ?? m[1]) : null, sem: c[1] || '', tier: TIERS[t] ? t : (c[2] || ''), say: c[3] || '', note: NONE.test(c[4] || '') ? '' : (c[4] || '') });
  });
  return rows;
}

// 語意名稱：全名或「／」前後任一半都認（「定義」→「定義／比喻」）
function semOf(name, types) {
  const s = String(name).trim();
  return types.find((t) => t.name === s) || types.find((t) => t.name.split('／').includes(s)) || null;
}

export function checkMap(rows, { part, cues = [], types = [], syncSpans = [] } = {}) {
  const errors = [], warns = [];
  if (!rows.length) return { errors: ['地圖沒有讀到任何一行（格式：句號範圍 | 語意 | 級 | 在講什麼 | 特徵或 A 的理由）'], warns, rows };
  const names = types.map((t) => t.name).join('、');
  for (const r of rows) {
    const at = `第 ${r.line} 行「${r.raw}」`;
    if (r.a == null) { errors.push(`${at}看不懂 → 寫 #N–#M（第 N 句到第 M 句）`); continue; }
    if (r.z < r.a) errors.push(`${at}結尾在起點前面`);
    if (part && (r.a < part.firstN || r.z > part.lastN)) errors.push(`${at}不在這一份的範圍（#${part.firstN}–#${part.lastN}）`);
    const t = semOf(r.sem, types);
    if (!t) errors.push(`${at}的語意「${r.sem}」不在清單裡 → 只能用：${names}`);
    else r.sem = t.name;
    if (!TIERS[r.tier]) errors.push(`${at}的級「${r.tier}」→ 寫 A、B 或 C`);
    else if (r.tier === 'A' && !r.note) warns.push(`${at}是 A，沒寫理由 → 第 5 欄寫為什麼值得專門設計（主代理全片排序要看）`);
  }
  const ok = rows.filter((r) => r.a != null).sort((x, y) => x.a - y.a);
  const startOf = new Map(cues.map((c) => [c.n, c.start]));
  const synced = (n) => syncSpans.some(([x, y]) => (startOf.get(n) ?? -1) >= x && (startOf.get(n) ?? -1) < y);
  const hole = (x, y) => { const miss = []; for (let n = x; n <= y; n++) if (!synced(n)) miss.push(n); return miss; };
  if (part) {
    let next = part.firstN;
    for (const r of ok) {
      if (r.a > next) { const miss = hole(next, r.a - 1); if (miss.length) warns.push(`#${miss[0]}–#${miss[miss.length - 1]} 不在地圖上 → 併進前後一行，或補一行`); }
      else if (r.a < next) warns.push(`第 ${r.line} 行從 #${r.a} 開始，和上一行重疊 → 從 #${next} 開始`);
      next = Math.max(next, r.z + 1);
    }
    if (next <= part.lastN) { const miss = hole(next, part.lastN); if (miss.length) warns.push(`#${miss[0]}–#${miss[miss.length - 1]} 不在地圖上（這一份到 #${part.lastN}）→ 補一行`); }
  }
  const singles = ok.filter((r) => r.a === r.z).length;
  if (ok.length > 4 && singles * 2 > ok.length) warns.push(`${singles} 行只有一句 → 講同一件事的幾句併成一行（一行大約就是之後的一段畫面）`);
  const long = ok.filter((r) => { const s = rowSeconds(r, cues); return r.z - r.a + 1 > ROW_MAX_CUES || (s != null && s > ROW_MAX_SECONDS); });
  if (long.length) warns.push(`${long.length} 行太長（${long.slice(0, 4).map((r) => `#${r.a}–#${r.z} ${r.z - r.a + 1} 句${rowSeconds(r, cues) != null ? `／${rowSeconds(r, cues)} 秒` : ''}`).join('、')}${long.length > 4 ? '…' : ''}）→ 一行大約就是一段畫面，超過 ${ROW_MAX_CUES} 句或 ${ROW_MAX_SECONDS} 秒就照話題換的地方拆成幾行（每 1–4 句要有一次畫面變化）`);
  const nA = ok.filter((r) => r.tier === 'A').length;
  if (ok.length >= 5 && nA > ok.length * A_MAX_SHARE) warns.push(`A 有 ${nA} 行，占 ${ok.length} 行的 ${Math.round((nA / ok.length) * 100)}% → 全片約三成，只留最值得專門設計的，其他改 B`);
  return { errors, warns, rows: ok };
}

// 首選欄的名稱：拿掉括號裡的說明、反引號
const optName = (first) => {
  const t = String(first).replace(/（[^）]*）|\([^)]*\)/g, '').replace(/`/g, '').split(/[：；，]/)[0].replace(/\s+/g, ' ').trim();
  return t.length > 24 ? `${t.slice(0, 24)}…` : t;
};

// 首選欄 → 寫法.md 的名稱（大綱的模板欄直接寫得進去）：反引號裡的 x-*、開頭的代號（08、04c、fx 29）、media、不下卡；對不到才印原文
export function specKeys(first, specNames = []) {
  const t = String(first), out = [];
  const byName = (k) => specNames.find((n) => { const x = n.toLowerCase(), y = k.toLowerCase(); return x === y || x.split(/\s+/).includes(y); });
  const byCode = (c) => specNames.find((n) => n.toLowerCase().startsWith(`${c.toLowerCase()} `));
  for (const m of t.matchAll(/`([^`]+)`/g)) { const n = byName(m[1].replace(/\.html$/, '').replace(/^custom\s+/, '')); if (n) out.push(n); }
  const lead = t.match(/^(fx \d{2}|\d{2}[a-d]?)(?=[\s／])/);
  if (!out.length && lead) { const n = byCode(lead[1]); if (n) out.push(n); }
  if (!out.length && /^media/.test(t)) out.push('media');
  if (!out.length) { const fx = t.match(/fx \d{2}/); if (fx) { const n = byCode(fx[0]); if (n) out.push(n); } }
  if (!out.length) for (const m of t.matchAll(/(?:→|或)\s*(\d{2}[a-d]?)(?![\d.])/g)) { const n = byCode(m[1]); if (n) out.push(n); }   // 「回顧 → 11；金句 → 15」「沒有範例 → 06 或 10」
  if (!out.length && /^不下卡/.test(t)) out.push('不下卡');
  return out;
}

// 字卡動態的候選（025）：這一行的語意適合的幾張（catalog 的 sem），照「同一種語意第幾次出現」輪流給 2 張，整集不會都是同幾張
// fx＝[{ id, zh, sem }]（已經照版式篩過）；回傳 (row) → 'fx 05 動態堆疊｜fx 23 文字方塊' 或 ''
export const FX_ROW_MAX = 8;   // 字卡動態是短的：超過 8 秒的行不推薦（一張卡 3–6 秒）
export function fxPicker(fx = [], per = 2) {
  const bySem = new Map(), seen = new Map();
  for (const f of fx) for (const s of f.sem || []) { if (!bySem.has(s)) bySem.set(s, []); bySem.get(s).push(f); }
  return (r) => {
    const list = bySem.get(r.sem) || [];
    if (!list.length) return '';
    const k = seen.get(r.sem) || 0;
    seen.set(r.sem, k + 1);
    const n = Math.min(per, list.length);
    return Array.from({ length: n }, (_, i) => list[(k * n + i) % list.length]).map((f) => `fx ${f.id} ${f.zh}`).join('｜');
  };
}

export function mapOptions(rows, sitRows = [], specNames = [], { secsOf = null, minOf = null, fullOf = null, fx = null } = {}) {
  const bySem = new Map();
  for (const r of sitRows) for (const sem of String(r.sem || '').split('、').filter(Boolean)) {   // 一列可以掛好幾個語意（去背三招：同一句常被標成問答、情境／故事）
    if (!bySem.has(sem)) bySem.set(sem, []);
    const keys = specNames.length ? specKeys(r.first, specNames) : [];
    // 有代號卻對不到寫法.md：這個版式不能用（沒有講者不能用疊加字卡、直式不提供 03），不列
    const coded = /^(fx \d{2}|\d{2}[a-d]?)(?=[\s／])|`|(?:→|或)\s*\d{2}/.test(r.first);
    bySem.get(sem).push(...(keys.length ? keys : specNames.length && coded ? [] : [optName(r.first)]));
  }
  // 秒數（024 試跑：挑了放不下時間下限的模板，到 --outline 才發現，換模板、併段、重跑佔掉第二回合大半時間）
  const pickFx = fx ? fxPicker(fx) : null;
  return rows.map((r) => {
    let opts = [...new Set(bySem.get(r.sem) || [])];
    const secs = secsOf ? secsOf(r) : null;
    const need = (o) => (minOf ? Number(minOf(o)) || 0 : 0);
    const short = secs == null ? [] : opts.filter((o) => need(o) > secs + 0.05);
    if (short.length) opts = opts.filter((o) => !short.includes(o));
    // 最少項目放得下、全部項目放不下：照列，但標出來（試跑時子代理看到「全用上要 13.8 秒」就自己換掉了）
    if (secs != null && fullOf) opts = opts.map((o) => { const f = Number(fullOf(o)) || 0; return f > secs + 0.05 ? `${o}（項目全用上要 ${f} 秒，這裡只放得下幾項）` : o; });
    const head = `#${r.a}–#${r.z} ${r.sem} ${r.tier}${secs == null ? '' : `（${secs} 秒）`}`;
    const tail = short.length ? `；放不下：${short.map((o) => `${o} ≥ ${need(o)} 秒`).join('、')}（真的要用就和前後一行併成一段）` : '';
    // 字卡動態：短的行（≤ FX_ROW_MAX 秒）才列；每一行給的那兩張不一樣（輪流），大綱的模板欄直接寫「fx 05」
    const fxs = pickFx && (secs == null || secs <= FX_ROW_MAX + 0.05) ? pickFx(r) : '';
    const fxTail = fxs ? `；只有一個詞或一句短話就用字卡動態：${fxs}` : '';
    if (r.tier === 'C') return `${head}：串場用最便宜的（${fxs ? `字卡動態 ${fxs}` : '字卡動態：照寫法.md「適合的語意」挑一張'}；或 12 keywords；或併進前後那一行。同一張字卡動態一集最多用 2 次）${opts.length ? `；這一型的列：${opts.join('｜')}` : ''}${tail}`;
    const none = short.length ? '這一行太短，這一型的模板都放不下 → 和前後一行併成一段，或用字卡動態' : '這一型的模板這個版式都不能用 → 照共用.md 第 3 節的替換表換全畫面';
    return `${head}：${opts.length ? opts.join('｜') : none}${r.tier === 'A' ? '（A：一樣先套模板，候選構想寫理由）' : ''}${fxTail}${tail}`;
  });
}

// 一行地圖大約幾秒：從第一句開口到下一句開口（--outline 會把段與段的空檔接上，照接好的算）
export function rowSeconds(r, cues = []) {
  const k = cues.findIndex((c) => c.n === r.a), z = cues.findIndex((c) => c.n === r.z);
  if (k < 0 || z < 0) return null;
  const end = cues[z + 1] ? cues[z + 1].start : cues[z].end;
  return Math.round((end - cues[k].start) * 10) / 10;
}

export function mapBudget(rows) {
  const eligible = rows.filter((r) => r.sem !== '介紹').length, target = designTargetOf(eligible);
  return { eligible, target, cap: designCap(target) };
}

const line = (r) => `${r.raw.startsWith('#') ? `#${r.a}–#${r.z}` : r.raw} | ${r.sem} | ${r.tier} | ${r.say} | ${r.note || '—'}`;

export function mergeMaps(parts, rowsByKey, { videoDur = 0, hasVision = false, visionFile = 'work/分鏡素材/視覺語言.md' } = {}) {
  const errors = [], warns = [];
  const all = parts.flatMap((p) => (rowsByKey.get(p.key) || []).map((r) => ({ ...r, part: p.key })));
  const { target, cap } = mapBudget(all);
  const A = all.filter((r) => r.tier === 'A'), count = (t) => all.filter((r) => r.tier === t).length;
  if (cap && A.length > cap) errors.push(`A ${A.length} 段，全片最多 ${cap} 段 → 全片排序，留最值得設計的 ${cap} 段，其他在那一份的地圖改成 B，再跑一次`);
  if (target && A.length < target) warns.push(`A ${A.length} 段，全片約 ${target} 段 → 從 B 裡找值得專門設計的時刻升成 A；真的沒有就照現狀，不用湊數`);
  if (videoDur >= 300 && !hasVision) errors.push(`還沒有 ${visionFile} → 讀完這份地圖寫：這集在講什麼、貫穿全片的主題（第一次在哪、之後在哪回來）、配色（照 auto-edit-storyboard 的 references/director.md）`);
  if (all.length >= 6) {
    if (!all.slice(0, 3).some((r) => r.tier === 'A')) warns.push(`開場（${all[0].part} 前 3 行）沒有 A → 開場是最多人看的地方，挑最能勾住人的那一行升成 A`);
    if (!all.slice(-3).some((r) => r.tier === 'A')) warns.push(`結尾（${all[all.length - 1].part} 最後 3 行）沒有 A → 挑收尾那一行升成 A`);
  }
  const perPart = parts.map((p) => [p.key, A.filter((r) => r.part === p.key).length]);
  const [topKey, topN] = perPart.reduce((x, y) => (y[1] > x[1] ? y : x), ['', 0]);
  if (A.length >= 4 && topN * 2 > A.length) warns.push(`${topKey} 占了 A 的一半以上（${topN}／${A.length}）→ 確認別份沒有漏掉值得設計的時刻`);
  let run = [];
  const runs = [];
  for (const r of [...all, { tier: '' }]) { if (r.tier === 'C') run.push(r); else { if (run.length >= 4) runs.push(run); run = []; } }
  for (const x of runs) warns.push(`連續 ${x.length} 行都是 C（${x[0].part} #${x[0].a}–#${x[x.length - 1].z}）→ 確認是不是真的只是串場；有一行在講結構就改 B`);
  const sems = [...new Set(all.map((r) => r.sem))].map((s) => {
    const by = parts.map((p) => [p.key, all.filter((r) => r.part === p.key && r.sem === s)]).filter(([, rs]) => rs.length);
    const tc = (t) => all.filter((r) => r.sem === s && r.tier === t).length;
    // A 是挑時刻，同一型有 A 有 B 很正常；B、C 都有才可能是標法不一（同樣在講結構，一份當串場）
    return `- ${s}：${by.map(([k, rs]) => `${k} ${rs.length}`).join('、')}（A ${tc('A')}、B ${tc('B')}、C ${tc('C')}）${tc('B') && tc('C') ? '：B、C 都有，確認是不是同樣的內容標法不一' : ''}`;
  });
  const L = [];
  L.push('# 語意地圖（build.mjs --map-merge 產生；要改就改各份的 work/drafts/<份>.map.md，再跑一次 --map-merge）', '');
  L.push(`全片 ${all.length} 行：A ${count('A')}、B ${count('B')}、C ${count('C')}；A 預算約 ${target} 段、最多 ${cap} 段（停點 ③ 使用者勾了才做）`, '');
  L.push('## 主代理要做的三件事', '');
  L.push('1. **A 名單**：全片排序，留最值得專門設計的（開場、結尾一定要有）；不要的在那一份的地圖改成 B。', `2. **貫穿主題**：寫 \`${visionFile}\`（這集在講什麼、2–5 個貫穿全片的主題、配色）。`, '3. **統一標法**：同樣的內容在不同份要標同一個語意、同一級（看下面「各語意」有沒有級不一樣的）。', '');
  L.push('## 各語意（照份數）', '', ...sems, '');
  L.push('## A 提名', '');
  for (const r of A) L.push(`- ${r.part} #${r.a}–#${r.z} ${r.sem}：${r.say}${r.note ? `｜${r.note}` : ''}`);
  if (!A.length) L.push('- （沒有）');
  L.push('');
  for (const p of parts) {
    L.push(`## ${p.key}｜${p.title}（#${p.firstN}–#${p.lastN}）`, '');
    for (const r of rowsByKey.get(p.key) || []) L.push(line(r));
    L.push('');
  }
  return { md: `${L.join('\n')}\n`, errors, warns, stats: { rows: all.length, A: count('A'), B: count('B'), C: count('C'), target, cap } };
}

// 候選構想（大綱的第 6 欄、草稿的 story.designIdea）只給地圖上的 A：items 是 [{ id, n（起點句號）, idea }]
export function designVsMap(items, rows) {
  const warns = [];
  const A = rows.filter((r) => r.tier === 'A');
  for (const r of A) if (!items.some((x) => x.idea && x.n >= r.a && x.n <= r.z)) warns.push(`地圖上 #${r.a}–#${r.z} 是 A（${r.say}）→ 那一段寫候選構想（一句話：畫面上發生什麼事）`);
  for (const x of items) if (x.idea && x.n && !A.some((r) => x.n >= r.a && x.n <= r.z)) warns.push(`${x.id} 寫了候選構想，但 #${x.n} 在地圖上不是 A → 寫 —（A 名單主代理全片定好了；覺得該做寫進 decide）`);
  return warns;
}
