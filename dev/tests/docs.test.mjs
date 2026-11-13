// 文件一致性測試（001 skills-docs；憲法 IV「單一真相」）：node --test dev/tests/docs.test.mjs
// 零依賴、不呼叫 shell；工具 --help 用 process.execPath 直接跑。
// 每個失敗訊息最後都有「→ 怎麼改」（憲法 III.4）；所有斷言都經過 check()，T21 會檢查這件事。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), '..', '..');
const abs = (p) => path.join(ROOT, ...p.split('/'));
const exists = (p) => fs.existsSync(abs(p));
const read = (p) => fs.readFileSync(abs(p), 'utf8').replace(/\r\n/g, '\n');
const lines = (p) => read(p).split('\n');

function check(cond, msg) {
  if (!String(msg).includes('→')) throw new Error(`測試訊息沒有修法：${msg} → 在訊息最後加「→ 怎麼改」`);
  assert.ok(cond, msg);
}
const noProblems = (list, what, fix) =>
  check(list.length === 0, `${what}（${list.length} 處）\n  ${list.slice(0, 40).join('\n  ')}${list.length > 40 ? '\n  …' : ''}\n→ ${fix}`);

// ---------- 檔案清單 ----------
const SKILLS = ['auto-edit-longform', 'auto-edit-setup', 'auto-edit-rough', 'auto-edit-storyboard', 'auto-edit-screen',
  'auto-edit-motion', 'auto-edit-review', 'auto-edit-deliver', 'auto-edit-style'];
const SK = '.agents/skills';
const skillMd = (n) => `${SK}/${n}/SKILL.md`;
const refsOf = (n) => {
  const d = `${SK}/${n}/references`;
  return exists(d) ? fs.readdirSync(abs(d)).filter((f) => f.endsWith('.md')).sort().map((f) => `${d}/${f}`) : [];
};
const SKILL_FILES = SKILLS.filter((n) => exists(skillMd(n))).flatMap((n) => [skillMd(n), ...refsOf(n)]);
const U = 'shared/template/USAGE.md';
const R = 'shared/template/USAGE-reference.md';
const STYLE = 'shared/style.md';
const SITU = 'shared/template/SITUATIONS.md';
const REVIEW = 'shared/template/REVIEW.md';
const EDITOR = 'shared/template/EDITOR.md';
const BEATS = 'shared/template/BEATS.md';
const SETUP_MD = fs.readdirSync(abs('setup')).filter((f) => f.endsWith('.md')).map((f) => `setup/${f}`);
const have = (list) => list.filter(exists);

// ---------- 停點（032 D9：名稱與兩行原文只從 tools/lib/stops.mjs 讀，這裡不再手列；這裡只寫每個停點歸哪支 Skill、文件用的占位） ----------
const { STOP, stopLines } = await import(pathToFileURL(abs('shared/template/tools/lib/stops.mjs')).href);
const STOPS = [
  { n: STOP.cuts, skill: 'auto-edit-rough', line: stopLines.cuts('<剪輯清單網址>') },
  { n: STOP.framing, skill: 'auto-edit-storyboard', line: stopLines.framing('<構圖台網址>', { look: true }) },
  { n: STOP.storyboard, skill: 'auto-edit-storyboard', line: stopLines.storyboard('<分鏡表網址>') },
  { n: STOP.final, skill: 'auto-edit-review', line: stopLines.final('<完成影片預覽網址>') },
  { n: STOP.editor, skill: 'auto-edit-review', line: stopLines.editor('<剪輯台網址>') },
  { n: STOP.bg, skill: 'auto-edit-style', line: stopLines.bg('<暫存資料夾>') },
];
// 停點 ③ 的改版變體（014）、⑥ 的配樂變體（2026-11-11 作者定：沿用 ⑥，不新增停點）；停點仍是六個
const STOP_VARIANTS = [
  { n: `${STOP.storyboard} 改版`, skill: 'auto-edit-review', line: stopLines.revise(`${STOP.storyboard}（<段> v<N>）`, 'work/versions/<段>/v<N>/分鏡.md') },
  { n: STOP.music, skill: 'auto-edit-style', line: stopLines.music('<候選資料夾>/試聽.html') },
];

// ---------- 白名單（dev/tests/docs-allow.json）：每一筆都要真的用到（032 D9），沒用到就紅 ----------
const ALLOW = JSON.parse(read('dev/tests/docs-allow.json'));
const allowOf = (id) => ALLOW.filter((a) => (a.test || 'T10') === id);
const unusedAllow = (list, used) => list.filter((a) => !used.has(a))
  .map((a) => `docs-allow.json 這一筆沒用到（${a.test || 'T10'}｜${a.file || '—'}｜${a.text}）：對應的文字已經改掉或程式已經做好，刪掉這一筆`);

// ---------- 工具原始碼（T24、T31、T35 用；node_modules、vendor 不算） ----------
const walkSrc = (d, out = []) => { for (const e of fs.readdirSync(abs(d), { withFileTypes: true })) { const p = `${d}/${e.name}`; if (e.isDirectory()) { if (!/node_modules|vendor/.test(p)) walkSrc(p, out); } else if (/\.(mjs|js)$/.test(e.name)) out.push(p); } return out; };
const TOOL_SRC_FILES = exists('shared/template/tools') ? walkSrc('shared/template/tools') : [];

// ---------- 小工具 ----------
const stripFences = (text) => text.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, (m) => m.replace(/[^\n]/g, ''));
const section = (text, title) => {
  const ls = text.split('\n');
  const i = ls.findIndex((l) => l.trim() === title);
  if (i < 0) return null;
  const level = title.match(/^#+/)[0].length;
  let j = i + 1;
  while (j < ls.length && !(new RegExp(`^#{1,${level}} `).test(ls[j]))) j++;
  return ls.slice(i + 1, j).join('\n');
};
const frontmatter = (text) => {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return null;
  const out = {};
  for (const l of m[1].split('\n')) { const k = l.match(/^([A-Za-z_-]+):\s?(.*)$/); if (k) out[k[1]] = k[2]; else if (l.trim()) out.__bad = l; }
  return out;
};

// ===================================================================================
test('T1 skills：9 支 auto-edit Skill 都在', () => {
  const found = exists(SK) ? fs.readdirSync(abs(SK)).filter((d) => d.startsWith('auto-edit-')).sort() : [];
  const missing = SKILLS.filter((n) => !exists(skillMd(n)));
  const extra = found.filter((d) => !SKILLS.includes(d));
  noProblems([...missing.map((n) => `少了 ${skillMd(n)}`), ...extra.map((d) => `多了 ${SK}/${d}`)],
    '.agents/skills/ 的 auto-edit Skill 和固定的 9 支不一致', '照 specs/001-skills-docs/skill-outline.md §1 的名稱建立或改名');
});

test('T2 skills：frontmatter 只有 name／description／version', () => {
  const bad = [];
  for (const n of SKILLS.filter((x) => exists(skillMd(x)))) {
    const fm = frontmatter(read(skillMd(n)));
    if (!fm) { bad.push(`${skillMd(n)}：沒有 --- frontmatter`); continue; }
    const keys = Object.keys(fm).filter((k) => k !== '__bad');
    for (const k of keys) if (!['name', 'description', 'version'].includes(k)) bad.push(`${skillMd(n)}：不允許的欄位 ${k}`);
    if (fm.__bad) bad.push(`${skillMd(n)}：frontmatter 有看不懂的行「${fm.__bad}」（description 要單行）`);
    if (fm.name !== n) bad.push(`${skillMd(n)}：name 是「${fm.name}」，要等於資料夾名稱`);
    if (!/^\d+\.\d+\.\d+$/.test(fm.version || '')) bad.push(`${skillMd(n)}：version 要像 0.1.0`);
    const d = fm.description || '';
    if (!d.includes('時使用') || !d.includes('不要用')) bad.push(`${skillMd(n)}：description 要依序寫做什麼、「當使用者說…時使用」、「…時不要用（改用 …）」`);
  }
  noProblems(bad, 'SKILL.md frontmatter 不符 FR-002', '只留 name、description（單行）、version 三個欄位');
});

test('T3 skills：每支 SKILL.md 最多 200 行', () => {
  const bad = SKILLS.filter((n) => exists(skillMd(n))).map((n) => [n, lines(skillMd(n)).length]).filter(([, c]) => c > 200)
    .map(([n, c]) => `${skillMd(n)}：${c} 行`);
  noProblems(bad, 'SKILL.md 超過 200 行', '細節搬進 references/，SKILL.md 只留步驟、判準、停點、退路');
});

test('T4 skills：骨架（開頭一行、一覽表頭、必要標題、每步有指令和完成判準、自我核對 5–8 項）', () => {
  const L1 = '規則在 AGENTS.md；本檔只寫這一階段的指令、判準、停點、退路。';
  const HEAD = '| 輸入 | 指令 | 產出 | 完成判準 | 停點 |';
  const H2 = ['## 步驟', '## 自我核對', '## 退路表', '## 工具呼叫預算', '## 回報格式'];
  const bad = [];
  for (const n of SKILLS.filter((x) => exists(skillMd(x)))) {
    const f = skillMd(n);
    const text = read(f);
    const body = text.replace(/^---\n[\s\S]*?\n---\n/, '').split('\n');
    const t = body.findIndex((l) => l.startsWith('# '));
    const after = body.slice(t + 1).filter((l) => l.trim());
    if (after[0] !== L1) bad.push(`${f}：標題下第一行不是「${L1}」`);
    // 032 D9：優先序只寫在 AGENTS.md「怎麼用這份檔」一處；Skill 再抄一份會落後
    if (body.some((l) => l.startsWith('衝突時：'))) bad.push(`${f}：還有「衝突時：…」那一行（優先序只留 AGENTS.md 那一份，刪掉）`);
    const firstTable = after.find((l) => l.startsWith('|'));
    if (firstTable !== HEAD) bad.push(`${f}：第一張表的表頭不是「${HEAD}」`);
    for (const h of H2) if (!body.includes(h)) bad.push(`${f}：少了標題「${h}」`);
    const refs = refsOf(n);
    if (refs.length) {
      const sec = section(text, '## 什麼時候讀 references/');
      if (sec == null) bad.push(`${f}：有 references/ 卻沒有「## 什麼時候讀 references/」`);
      else for (const r of refs) if (!sec.includes(path.basename(r))) bad.push(`${f}：「什麼時候讀 references/」沒寫 ${path.basename(r)} 做到哪一步才讀`);
    }
    const steps = section(text, '## 步驟') || '';
    const nSteps = (steps.match(/^\*\*([A-Z]\d*|\d+)\.\s/gm) || []).length;
    const nCode = (steps.match(/^```/gm) || []).length / 2;
    const nDone = (steps.match(/完成判準：/g) || []).length;
    // 026：「常見錯誤」不再每步必填。工具訊息自己會說怎麼改的不重抄；和工具訊息不一樣的判斷寫在退路表
    if (!nSteps) bad.push(`${f}：「## 步驟」裡找不到 **1. …** 這種步驟標題`);
    if (nCode < nSteps || nDone < nSteps) bad.push(`${f}：${nSteps} 個步驟，但指令區塊 ${nCode}、「完成判準：」${nDone}（每步都要有指令和完成判準）`);
    const selfCheck = section(text, '## 自我核對') || '';
    const items = (selfCheck.match(/^- \[ \]/gm) || []).length;
    if (items < 5 || items > 8) bad.push(`${f}：自我核對 ${items} 項（要 5–8 項）`);
    const fallback = section(text, '## 退路表') || '';
    if (!fallback.includes('| 症狀（工具原文） | 做法 | 第二次還失敗 |')) bad.push(`${f}：退路表表頭要是「| 症狀（工具原文） | 做法 | 第二次還失敗 |」`);
    const budget = section(text, '## 工具呼叫預算') || '';
    // 032 A4：次數由工具數（lib/tries.mjs 的 MAIN_TRY_MAX），預算節一律寫「工具印「→ 停手」就停」，不再要求抄數字
    if (!budget.includes('→ 停手')) bad.push(`${f}：工具呼叫預算要寫「工具印「→ 停手」就停」（次數由工具數，不用寫數字）`);
  }
  noProblems(bad, 'SKILL.md 骨架不符 FR-004–FR-006、FR-009、FR-013、FR-014', '照 specs/001-skills-docs/skill-outline.md §0 的共用骨架補齊');
});

test('T5 skills：hyperframes 指令用子殼、不寫絕對路徑', () => {
  const bad = [];
  for (const f of SKILL_FILES) {
    const setup = f.includes('auto-edit-setup');
    lines(f).forEach((l, i) => {
      if (/npx hyperframes (snapshot|preview|render|check)\b/.test(l) && !l.includes('(cd projects/<專案>/work/hyperframes && ')) bad.push(`${f}:${i + 1} ${l.trim().slice(0, 80)}`);
      if (/\/Users\/|[A-Za-z]:\\\\|C:\\/.test(l)) bad.push(`${f}:${i + 1} 絕對路徑`);
      if (!setup && /(^|[\s`"(])~\//.test(l)) bad.push(`${f}:${i + 1} 用了 ~/`);
    });
  }
  noProblems(bad, 'Skill 的指令寫法不符 FR-007', 'hyperframes 指令寫成 (cd projects/<專案>/work/hyperframes && npx hyperframes …)；路徑一律相對工作區根目錄');
});

test('T6 停點：AGENTS.md「停點總表」恰好 6 列、①–⑥', () => {
  const sec = section(read('AGENTS.md'), '## 停點總表');
  check(sec != null, 'AGENTS.md 沒有「## 停點總表」這一節 → 照 specs/contracts/stop-points.md §1 新增');
  const ls = sec.split('\n');
  const start = ls.findIndex((l) => l.startsWith('|'));
  const rows = [];
  for (let i = start + 2; i < ls.length && ls[i].startsWith('|'); i++) rows.push(ls[i].split('|')[1].trim());
  const want = STOPS.map((s) => s.n);
  check(JSON.stringify(rows) === JSON.stringify(want), `停點總表第一張表的第一欄是 ${JSON.stringify(rows)}，要是 ${JSON.stringify(want)}（shared/template/tools/lib/stops.mjs 的 STOP）→ 只有六列，名稱照 lib/stops.mjs`);
});

test('T7 停點：六個（＋③ 改版）最後兩行原文都在 AGENTS.md 與對應的 SKILL.md', () => {
  const agents = read('AGENTS.md');
  const bad = [];
  for (const s of [...STOPS, ...STOP_VARIANTS]) {
    if (!agents.includes(s.line)) bad.push(`AGENTS.md 少了停點 ${s.n} 的原文`);
    if (exists(skillMd(s.skill)) && !read(skillMd(s.skill)).includes(s.line)) bad.push(`${skillMd(s.skill)} 少了停點 ${s.n} 的原文`);
  }
  noProblems(bad, '停點最後兩行和 shared/template/tools/lib/stops.mjs 不一致', '逐字照 lib/stops.mjs 的 stopLines 印出來的兩行貼上（<…> 保留原樣）；要改字先改 lib/stops.mjs');
});

// 018：預覽與修改都在剪輯台，Studio 不再出現在給使用者的流程；只留相容舊專案、舊說法的那幾句
test('018 給使用者的流程不再提 Studio', () => {
  const bad = [];
  for (const f of have(['README.md', 'PROMPTS.md', 'dev/site/index.html', ...SKILL_FILES])) {
    if (/Studio/.test(read(f).replace(/VisualStudio/g, ''))) bad.push(f);
  }
  noProblems(bad, '這些檔還提到 Studio', '停點 ④ 是完成影片預覽（editor.mjs 印的網址），改段落說段號或秒數');
});

test('T8 停點：所有「⏸ 停點」都是六個停點的第一行之一', () => {
  const allowed = new Set([...STOPS, ...STOP_VARIANTS].map((s) => s.line.split('\n')[0]));
  const bad = [];
  for (const f of have(['AGENTS.md', U, R, ...SKILL_FILES])) {
    lines(f).forEach((l, i) => {
      let k = l.indexOf('⏸ 停點');
      while (k >= 0) {
        const rest = l.slice(k).split('`')[0].trim();
        if (!allowed.has(rest)) bad.push(`${f}:${i + 1} ${rest.slice(0, 60)}`);
        k = l.indexOf('⏸ 停點', k + 1);
      }
    });
  }
  noProblems(bad, '有自創格式的停點行', '只用 AGENTS.md「停點總表」的六行原文；要提到停點時寫「停點 ③」，不要加 ⏸');
});

test('T9 Plan 模式只能出現在否定句', () => {
  const bad = [];
  for (const f of have(['AGENTS.md', 'PROMPTS.md', 'README.md', U, R, ...SKILL_FILES])) {
    lines(f).forEach((l, i) => { if (l.includes('Plan 模式') && !/不用|不需要|不要/.test(l)) bad.push(`${f}:${i + 1} ${l.trim().slice(0, 70)}`); });
  }
  noProblems(bad, '有要求使用 Plan 模式的句子（G06）', '改成「不用 Plan 模式，AI 會在停點 ② ③ 自己停」，或刪掉那一句');
});

// ---------- T10 數字出處 ----------
const UNIT = '(毫秒|秒|ms(?![A-Za-z])|s(?![A-Za-z])|px|字|句|段|則|張|顆|次|倍|dBTP|dB|LUFS|%|行)';
const NUM = '(\\d+(?:\\.\\d+)?)';
const normUnit = (u) => (u === 's' ? '秒' : u === 'ms' ? '毫秒' : u);
const key = (n, u) => `${String(parseFloat(n))} ${normUnit(u)}`;
const stripForNumbers = (text) => stripFences(text)
  .replace(/`[^`\n]*`/g, ' ')
  .replace(/\]\([^)]*\)/g, ']')
  .replace(/[\w./-]+\.(md|mjs|js|json|html|css|sh|ps1|py):\d+(-\d+)?/g, ' ')
  .replace(/\b[A-Z]{1,3}\d+(\.\d+)*\b/g, ' ')
  .replace(/§\s*\d+(\.\d+)*/g, ' ')
  .replace(/#\d+[a-z]?/g, ' ')
  .replace(/\d+:\d{2}(\.\d+)?/g, ' ')
  .replace(/\d+\s*[×x]\s*\d+/g, ' ')
  .replace(/\d+\.\d+\.\d+/g, ' ')
  .replace(/\d{4}-\d{2}-\d{2}/g, ' ');
function pairsIn(line, { comparatorOnly }) {
  const out = [];
  if (comparatorOnly) {
    for (const m of line.matchAll(new RegExp(`(?:≥|≤|<|>|最多|至少|超過|不到|上限|下限)\\s*(?:是\\s*)?${NUM}\\s*(?:個\\s*)?${UNIT}`, 'g'))) out.push(key(m[1], m[2]));
    for (const m of line.matchAll(new RegExp(`${NUM}\\s*(?:個\\s*)?${UNIT}\\s*(?:以內|以上|以下)`, 'g'))) out.push(key(m[1], m[2]));
  } else {
    for (const m of line.matchAll(new RegExp(`${NUM}\\s*(?:個\\s*)?${UNIT}`, 'g'))) out.push(key(m[1], m[2]));
  }
  for (const m of line.matchAll(new RegExp(`${NUM}\\s*[–~～]\\s*${NUM}\\s*(?:個\\s*)?${UNIT}`, 'g'))) out.push(key(m[1], m[3]), key(m[2], m[3]));
  return out;
}
const TOOLS = [...(exists('shared/template/tools') ? fs.readdirSync(abs('shared/template/tools')).filter((f) => f.endsWith('.mjs')).map((f) => `shared/template/tools/${f}`) : []),
  'setup/install-skills.mjs'].filter(exists);
const helpCache = new Map();
const helpOf = (tool) => {
  if (!helpCache.has(tool)) {
    const r = spawnSync(process.execPath, [abs(tool), '--help', ...(tool.endsWith('tools/media.mjs') ? ['--all'] : [])], { cwd: ROOT, encoding: 'utf8', timeout: 20000 });
    helpCache.set(tool, `${r.stdout || ''}\n${r.stderr || ''}`);
  }
  return helpCache.get(tool);
};

test('T10 數字找得到出處（AGENTS.md、style.md、USAGE.md、USAGE-reference.md、工具 --help）', () => {
  const sources = new Set();
  for (const f of have(['AGENTS.md', STYLE, U, R])) for (const l of stripForNumbers(read(f)).split('\n')) for (const p of pairsIn(l, { comparatorOnly: false })) sources.add(p);
  for (const t of TOOLS) for (const l of helpOf(t).split('\n')) for (const p of pairsIn(l, { comparatorOnly: false })) sources.add(p);
  const allow = allowOf('T10');
  const badAllow = ALLOW.filter((a) => !a.text || !a.reason || ((a.test || 'T10') === 'T10' && !a.file)).map((a) => JSON.stringify(a));
  noProblems(badAllow, 'docs-allow.json 有缺欄位的項目', '每筆都要有 text、reason（T10、T31、T35 還要有 file）');
  const KNOWN = new Set(['T10', 'T12', 'T29', 'T31', 'T35']);
  noProblems(ALLOW.filter((a) => !KNOWN.has(a.test || 'T10')).map((a) => JSON.stringify(a)), 'docs-allow.json 有 test 欄位認不得的項目', `test 只能是 ${[...KNOWN].join('、')}（不寫＝T10）`);
  check(ALLOW.length <= 40, `docs-allow.json 有 ${ALLOW.length} 筆（上限 40）→ 把數字搬進 style.md 或 AGENTS.md，不要一直加白名單`);
  const bad = [];
  const used = new Set();
  for (const f of have([...SKILL_FILES, SITU, REVIEW, BEATS])) {
    stripForNumbers(read(f)).split('\n').forEach((l, i) => {
      for (const p of pairsIn(l, { comparatorOnly: true })) {
        if (sources.has(p)) continue;
        if (/ 次$/.test(p) && /最多|預算|上限/.test(l)) continue; // 工具呼叫預算：每支 Skill 自己定義，不是全域門檻
        const a = allow.find((x) => f.endsWith(x.file) && l.includes(x.text));
        if (a) { used.add(a); continue; }
        bad.push(`${f}:${i + 1} ${p}`);
      }
    });
  }
  noProblems(bad, '門檻數字在 AGENTS.md、style.md、USAGE*.md、工具 --help 都找不到（FR-091）', '寫進 style.md 或 AGENTS.md，或加進 dev/tests/docs-allow.json 並寫理由');
  noProblems(unusedAllow(allow, used), 'docs-allow.json（T10）有用不到的項目', '刪掉這幾筆（白名單只留真的在擋的數字）');
});

test('T11 工具 --help 的每個子指令在文件裡都出現過', () => {
  const corpus = have(['AGENTS.md', U, R, EDITOR, ...SETUP_MD, ...SKILL_FILES]).map(read).join('\n').split('\n');
  const bad = [];
  for (const t of TOOLS) {
    const base = path.basename(t);
    for (const l of helpOf(t).split('\n')) {
      if (/作者用|測試用/.test(l)) continue;
      const m = l.match(/node\s+\S*?([\w-]+\.mjs)\s*(.*)$/);
      if (!m || m[1] !== base) continue;
      const toks = m[2].trim().split(/\s+/).filter(Boolean);
      let tok = '';
      for (let i = 0; i < toks.length; i++) {
        if (toks[i] === '--project') { i++; continue; }
        if (/^(--[\w-]+|[a-z][\w-]*)$/.test(toks[i])) tok = toks[i].replace(/[[\]]/g, '');
        break;
      }
      const ok = corpus.some((c) => c.includes(base) && (!tok || new RegExp(`(^|[\\s\`"(])${tok.replace(/[-]/g, '\\-')}(?![\\w-])`).test(c)));
      if (!ok) bad.push(`${base} ${tok || '（不帶子指令）'}`);
    }
  }
  noProblems([...new Set(bad)], '工具 --help 列的指令在 AGENTS.md、USAGE*.md、EDITOR.md、setup/*.md、SKILL.md 都沒出現（FR-092）', '在用到它的那一步寫出完整指令');
});

test('T12 文件裡的指令與檔案都存在', (t) => {
  const contracts = exists('specs/contracts') ? fs.readdirSync(abs('specs/contracts')).map((f) => read(`specs/contracts/${f}`)).join('\n') : '';
  const files = have(['AGENTS.md', 'PROMPTS.md', 'README.md', U, R, EDITOR, SITU, REVIEW, BEATS, ...SETUP_MD, ...SKILL_FILES]);
  const allowT12 = allowOf('T12');
  const used = new Set();
  const bad = [];
  const pending = new Set();
  for (const f of files) {
    const skillDir = f.startsWith(`${SK}/`) ? f.split('/').slice(0, 3).join('/') : null;
    lines(f).forEach((l, i) => {
      const refs = [];
      for (const m of l.matchAll(/\bnode\s+([\w./-]+\.mjs)/g)) refs.push(m[1]);
      for (const m of l.matchAll(/\bbash\s+([\w./-]+\.sh)/g)) refs.push(m[1]);
      for (const m of l.matchAll(/shared\/template\/custom\/(x-[\w-]+\.html)/g)) refs.push(`shared/template/custom/${m[1]}`);
      for (const p of refs) {
        if (p.includes('<') || exists(p)) continue;
        const a = allowT12.find((x) => x.text === p);
        if (a) used.add(a);
        if (contracts.includes(p) || a) pending.add(p); else bad.push(`${f}:${i + 1} ${p}`);
      }
      if (skillDir) for (const m of l.matchAll(/(\.agents\/skills\/[\w-]+\/)?references\/([\w.-]+\.md)/g)) if (!exists(`${m[1] ? m[1].slice(0, -1) : skillDir}/references/${m[2]}`)) bad.push(`${f}:${i + 1} ${m[0]}`);
    });
  }
  if (pending.size) t.diagnostic(`契約或 docs-allow.json（test: T12）列了、還沒實作的檔（做好後刪掉 allow 那筆）：${[...pending].join('、')}`);
  noProblems(bad, '文件寫到的檔案不存在（FR-093）', '改成存在的路徑；新工具要先寫進 specs/contracts/cli-00N.md');
  noProblems(unusedAllow(allowT12, used), 'docs-allow.json（T12）有用不到的項目', '檔案已經做好或文件不再提：刪掉這幾筆');
});

// ---------- T13–T20：G04 八項矛盾（style.md 為準） ----------
const g04 = (name, { gone = [], present = [] }) => test(name, () => {
  const bad = [];
  for (const [f, s] of gone) if (exists(f) && read(f).includes(s)) bad.push(`${f} 還有「${s}」`);
  for (const [f, s] of present) if (!exists(f) || !read(f).includes(s)) bad.push(`${f} 少了「${s}」`);
  noProblems(bad, `${name} 沒有清掉`, '照 specs/001-skills-docs/spec.md FR-060–FR-067 改：舊數字刪掉、改寫「照 style.md」');
});
g04('T13 G04① 開場張數', { gone: [[R, '前 30 秒最多一張'], [U, '短片在前 30 秒只放角標或只放一張卡']], present: [[STYLE, '開場 30 秒不限張數']] });
g04('T14 G04② 密度', { gone: [[R, '每 3–8 句']], present: [[STYLE, '每 1–4 句一段']] });
g04('T15 G04③ 露臉', { gone: [[U, '兩段之間留 ≥ 3 秒露臉'], [R, '露臉 ≥ 3 秒']], present: [[STYLE, '不用留露臉空檔']] });
g04('T16 G04④ 動作秒數（010 動態 v2：style.md「節奏」）', { gone: [[STYLE, '進場 0.3–0.5 秒、出場 0.3 秒'], [R, '進場 0.3–0.5 秒'], [STYLE, '出場 0.4 秒'], [R, '進場 0.5、出場 0.4'], [R, '位移 8–16px']], present: [[STYLE, '進場 0.5 秒（卡片外殼 0.55–0.8 秒）、強調 0.2 秒、退場 0.28–0.3 秒']] });
g04('T17 G04⑤ 條列進場', { gone: [[STYLE, '同一張卡的標題、條列項目一起出現']], present: [[STYLE, '絕不整組同時出現']] });
g04('T18 G04⑥ 情境動畫數量', { gone: [[R, '越多越好'], [R, '不設上限'], [STYLE, '越多越好']], present: [[STYLE, '同時符合三條才做情境動畫']] });
test('T18b G04⑥ custom 範例檔頭（003 已刪「已經有 2 段 custom」）', () => {
  const bad = ['shared/template/custom/x-before-after.html', 'shared/template/custom/x-numbers.html'].filter((f) => exists(f) && read(f).includes('已經有 2 段 custom'));
  noProblems(bad, 'custom 範例檔頭還有「已經有 2 段 custom：改回第一層」', '請 003 刪那一行（判準照 style.md「情境動畫優先」）');
});
g04('T19 G04⑦ 停點數', { gone: [[U, '兩個地方一定要停下來']], present: [[U, '停點照 `AGENTS.md`「停點總表」']] });
g04('T20 G04⑧ 分鏡表存檔', { gone: [[U, '分鏡表只寫在回覆裡']], present: [[U, '分鏡表一律存成 `work/storyboard.md`']] });

test('T21 失敗訊息都帶修法（所有斷言都走 check()）', () => {
  const src = fs.readFileSync(SELF, 'utf8');
  const calls = (src.match(/\bassert\.\w+\(/g) || []).length;
  check(calls === 1, `docs.test.mjs 有 ${calls} 個直接的 assert 呼叫（只能有 check() 裡那一個）→ 改用 check(條件, '原因 → 修法')`);
});

test('T22 剪乾淨的 auto-editor 指令都帶 --margin 0.15sec', () => {
  const bad = [];
  for (const f of have(['AGENTS.md', skillMd('auto-edit-rough')])) {
    lines(f).forEach((l, i) => {
      for (const m of l.matchAll(/auto-editor\s+"[^"]+"[^`]*/g)) if (!m[0].includes('--margin 0.15sec')) bad.push(`${f}:${i + 1} ${m[0].slice(0, 70)}`);
    });
  }
  noProblems(bad, 'auto-editor 指令沒帶 --margin 0.15sec（FR-098）', '加上 --margin 0.15sec（002 FR-063）；最好直接照 media.mjs ng-snap 印的三行');
});

test('T23 剪片時讀的文件不叫 AI 去讀 specs/ 或 dev/（review-r1 A-03）', () => {
  const bad = [];
  for (const f of have([U, R, STYLE, SITU, REVIEW, EDITOR, BEATS, ...SKILL_FILES])) {
    lines(f).forEach((l, i) => { if (/(^|[\s`(（「])(specs|dev)\//.test(l)) bad.push(`${f}:${i + 1} ${l.trim().slice(0, 70)}`); });
  }
  noProblems(bad, '剪片時讀的文件提到 specs/ 或 dev/（AGENTS.md：剪片時不要讀）', '改指向 AGENTS.md、USAGE*.md 或對應的 Skill；作者用的說明搬到 dev/README.md');
});

// 文件引用的工具原文：每一組的字串要同時出現在那份文件與工具原始碼裡（工具改了字，這裡會紅，提醒改文件）
test('T24 文件引用的工具原文和程式一字不差（第 2 輪對齊）', () => {
  const src = TOOL_SRC_FILES.map(read).join('\n');
  const SKR = skillMd('auto-edit-rough');
  const pairs = [
    [U, '是全黑，但素材沒有純聲音檔 → 初剪壞了：跑 node shared/template/tools/media.mjs verify-rough --project'],
    [SKR, '原片同位置不黑 → 初剪壞了'],
    [U, 'chtag：不用寫，角標現在自動常駐 → 刪掉 "chtag": true（要舊的附件角標，plan.json 第一層寫 "chapterBadge": false）'],
    [U, 'chapterBadge 只能是 true 或 false（不寫＝true：章節角標自動常駐右上角），現在是 '],
    [U, '個用字數比例估（'],
    [U, '對 rough.mp4 重轉詞級逐字稿：npx hyperframes transcribe'],
    [U, '文字對時：'],
    [U, '就講到了，晚了 '],
    [U, '（上限：任一分鐘 ≤ '],
    [U, '清掉同一段的舊截圖（這次張數變了）：'],
    [U, '是全黑（原始素材不是）→ 初剪壞了，跑 node shared/template/tools/media.mjs verify-rough --project'],
    [R, '才講到、不是 #'],
    [U, '講者瘦臉略過：抽樣 12 格都沒偵測到臉 → 這支只調光；確定有講者就跑 '],
    [U, 'build 會停下來：'],
    [U, 'rhythm 只能是 "continuous"（預設，照 style.md 連續覆蓋）或 "spaced"（要留露臉空檔），現在是 '],
    [U, '→ 改成清單裡的名稱（跑 build.mjs --list 看每顆的用途），或寫 null 不放音效'],
    [U, '→ 中間換一段情境動畫（style.md「情境動畫優先」）或別的版面'],
    ['AGENTS.md', '→ 下一步：'],
    [U, '→ 字幕不顯示這四種標點（保留「、！？」），跑 media.mjs srt-align 或在剪輯台改'],
    [U, ' → 在剪輯台和前後句合併，或把起迄拉長'],
    [skillMd('auto-edit-motion'), '不在語彙表'],
    [skillMd('auto-edit-motion'), '分鏡表表頭不對'],
    [U, '：音效名與 ref 要寫成字串字面值、off 寫數字（例 P.sfx(\'success\', \'#38@兩支\')、P.sfx(\'ding\', \'#41\', 0.2)；音效名只有小寫英數字與 -），build 才排得出音效 → 不要用變數或 + 組字串'],
    [U, ' 不存在，先用亮色那張 → 換風格時暗色三張一起放進 shared/template/'],
    [U, '｜主題：'],
    [skillMd('auto-edit-style'), '暗色主題標題列的白字對比只有'],
  ];
  const bad = [];
  for (const [f, s] of pairs) {
    if (!exists(f) || !read(f).includes(s)) bad.push(`${f} 少了「${s}」`);
    if (!src.includes(s)) bad.push(`工具原始碼找不到「${s}」（${f} 引用的）`);
  }
  noProblems(bad, '文件引用的工具原文和程式對不上', '照工具現在印的字改文件（或改這張對照表）；工具改字時先通知 001');
});

// ---------- 010 動態 v2／F8 字幕：三處一致性 ----------
// 字幕數字：style.md「字幕」＝auto-edit-rough「剪乾淨的數字」的字幕列＝kit/captions.css（F8）
test('T25 字幕數字一致：style.md「字幕」＝kit/captions.css，auto-edit-rough 的每則字數也一樣（F8）', (t) => {
  const pick = (text) => {
    const s = String(text || '').replace(/\*\*/g, '');
    const g = (re) => { const m = s.match(re); return m ? Number(m[1]) : null; };
    return { 字級: g(/字級\s*(\d+)\s*px/), 字重: g(/字重\s*(\d+)/), 底板高: g(/底板高\s*(\d+)\s*px/), 內距上下: g(/內距上下\s*(\d+)\s*px/), 內距左右: g(/左右\s*(\d+)\s*px/), 距畫面底: g(/距畫面底\s*(\d+)\s*px/), 每則字數: g(/每則最多\s*(\d+)\s*個?字/) };
  };
  const st = pick(section(read(STYLE), '## 字幕'));
  // 026：auto-edit-rough 不再抄一份字幕的數字（工具排的，數字只留在 style.md）；哪天又寫了就要和 style.md 一樣
  const ag = pick(read(skillMd('auto-edit-rough')).split('\n').filter((l) => /每則最多/.test(l)).join('\n'));
  const bad = [];
  for (const k of Object.keys(st)) if (st[k] === null) bad.push(`style.md「字幕」找不到「${k}」`);
  if (ag.每則字數 != null && ag.每則字數 !== st.每則字數) bad.push(`每則字數：style.md ${st.每則字數}、auto-edit-rough ${ag.每則字數 ?? '（沒寫）'}`);
  const CSS = 'shared/template/kit/captions.css';
  if (exists(CSS)) {
    const css = read(CSS);
    const blk = (sel) => { const m = css.match(new RegExp(`${sel.replace(/[.>]/g, (c) => `\\${c}`)}\\s*\\{([^}]*)\\}`)); return m ? m[1] : ''; };
    const span = blk('.cg > span');
    const num = (b, prop) => { const m = b.match(new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*(\\d+)`)); return m ? Number(m[1]) : null; };
    const p = ((span.match(/padding\s*:\s*([\d\spx]+)/) || [])[1] || '').match(/\d+/g)?.map(Number) || [];
    const [pt, ph, pb] = p.length === 1 ? [p[0], p[0], p[0]] : p.length === 2 ? [p[0], p[1], p[0]] : [p[0], p[1], p[2]];
    const lh = num(span, 'line-height');
    const c = { 字級: num(span, 'font-size'), 字重: num(span, 'font-weight'), 內距上下: pt ?? null, 內距左右: ph ?? null, 距畫面底: num(blk('.cg'), 'bottom') };
    c.底板高 = lh === null || pt === undefined || pb === undefined ? null : lh + pt + pb;
    if (c.字級 === 54) t.diagnostic('kit/captions.css 還是 F8 之前的 54 px（002 改完會自動轉成要一致）');
    else for (const k of ['字級', '字重', '底板高', '內距上下', '內距左右', '距畫面底']) if (c[k] !== st[k]) bad.push(`${k}：style.md ${st[k]}、captions.css ${c[k] ?? '（讀不到）'}`);
  }
  noProblems(bad, '字幕數字三處不一致（F8：style.md 為準）', 'style.md「字幕」、kit/captions.css 改成同一組數字，auto-edit-rough「判準與數字」的每則字數也要一樣（captions.css 歸 002；底板高＝line-height＋上內距＋下內距）');
});

// BEATS.md 的動作名稱只能用 010 設計系統 §14.1 的名稱；動畫分鏡的表頭各處一字不差；表裡的動態欄只用語彙表的名稱
test('T26 BEATS.md：動作名稱 ⊆ 010 design-system §14.1、動畫分鏡表頭一字不差、動態欄只用語彙名稱', (t) => {
  const HDR = '| 拍 | 講到（綁句） | 畫面上出現什麼 | 動態（設計系統語彙） | 焦點 | 音效拍點 |';
  const HDR8 = `${HDR} 插圖元件（狀態） | 位置 |`; // 示意動畫（x-scene）多兩欄
  const names = (text) => {
    const out = []; let on = false;
    for (const l of text.split('\n')) {
      if (/^\| 類 \| 名稱 \|/.test(l)) { on = true; continue; }
      if (on && /^\|---/.test(l)) continue;
      if (on && l.startsWith('|')) out.push(l.split('|')[2].trim()); else on = false;
    }
    return out;
  };
  check(exists(BEATS), 'shared/template/BEATS.md 不存在 → 新增語彙表與六種預設拍型（010 階段 B，001）');
  const mine = names(read(BEATS));
  check(mine.length > 0, 'BEATS.md 找不到語彙表（表頭「| 類 | 名稱 | …」）→ 照 design-system §14.1 的欄位寫');
  const bad = [];
  const DS = 'specs/010-motion-v2/design-system.md';
  if (exists(DS)) {
    const ref = new Set(names(read(DS)));
    for (const n of mine) if (!ref.has(n)) bad.push(`BEATS.md 的「${n}」不在 design-system §14.1`);
  } else t.diagnostic('沒有 specs/010-motion-v2/design-system.md，略過名稱子集檢查');
  const vocab = new Set(mine);
  const acts = (cell) => cell.replace(/（[^（）]*）/g, '').split(/[；＋或]/).map((s) => s.trim().replace(/^[\d.−-]+\s*/, '').trim()).filter((s) => s && s !== '—');
  const tmpl = `${SK}/auto-edit-storyboard/references/storyboard-template.md`;
  for (const f of [BEATS, U, tmpl]) if (exists(f) && !read(f).includes(HDR)) bad.push(`${f} 沒有動畫分鏡表頭`);
  for (const f of [BEATS, tmpl]) if (exists(f) && !read(f).includes(HDR8)) bad.push(`${f} 沒有示意動畫的八欄表頭`);
  let rows = 0;
  for (const f of have(['AGENTS.md', U, R, SITU, BEATS, ...SKILL_FILES])) {
    let on = false;
    lines(f).forEach((l, i) => {
      const s = l.trim();
      if (/^\| 拍 \|/.test(s)) { on = s === HDR || s === HDR8; if (!on) bad.push(`${f}:${i + 1} 表頭和固定表頭不同：${s.slice(0, 60)}`); return; }
      if (on && /^\|---/.test(s)) return;
      if (on && s.startsWith('|')) {
        const cell = s.split('|')[4] || '';
        if (cell.includes('<')) return;
        rows++;
        for (const a of acts(cell)) if (!vocab.has(a) && a !== '開場') bad.push(`${f}:${i + 1} 動態欄「${a}」不是語彙表的名稱`);
      } else on = false;
    });
  }
  check(rows > 0, '找不到任何動畫分鏡的列 → BEATS.md §3 的拍型表要用固定表頭');
  noProblems(bad, '動畫分鏡的語彙或表頭不一致', '動態欄只寫 BEATS.md §2 的名稱（括號寫對象）；表頭照抄 BEATS.md §1；新名稱先進 design-system §14.1 再進 BEATS.md');
});

// 文件裡每段 node shared/template/tools/<工具>.mjs …：子指令與每個 --旗標都要在那支工具的 --help（media.mjs 看那個子指令自己的 --help）；
// 不在 --help 的，要嘛 cli-00N.md 契約有（工具名緊接子指令那一行），要嘛 cli.md 索引標了「待寫」（032 D5）
test('T27 文件寫的工具指令：子指令與每個 --旗標都在那支工具的 --help（或 cli 契約）裡', (t) => {
  const cdir = 'specs/contracts';
  const cFiles = exists(cdir) ? fs.readdirSync(abs(cdir)).filter((f) => /^cli-\d+\.md$/.test(f)).map((f) => read(`${cdir}/${f}`)) : [];
  const index = exists(`${cdir}/cli.md`) ? read(`${cdir}/cli.md`) : '';
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tokRe = (tok) => new RegExp(`(^|[\\s\`"(／/\\[|｜,，、])${esc(tok)}(?![\\w-])`);
  // 契約比對：工具名後面緊接子指令；旗標要在同一行、工具名（和子指令）之後
  const inText = (text, base, sub, flag) => {
    const re = flag ? new RegExp(`${esc(base)}\\s+${sub ? `${esc(sub)}\\s` : ''}.*?${esc(flag)}(?![\\w-])`) : new RegExp(`${esc(base)}\\s+${esc(sub)}(?![\\w-])`);
    return text.split('\n').some((l) => re.test(l));
  };
  // 指令到哪裡結束：反引號、表格的 |、中文標點（引號裡的不算）
  const END = new Set(['`', '|', '；', '，', '（', '）', '、', '。', '「', '」', '：']);
  const cmdAt = (l, i) => { let q = false, out = ''; for (; i < l.length; i++) { const c = l[i]; if (c === '"') q = !q; if (!q && END.has(c)) break; out += c; } return out; };
  const subHelp = new Map();
  const helpFor = (base, sub) => {
    const tool = `shared/template/tools/${base}`;
    if (base !== 'media.mjs' || !sub) return helpOf(tool);
    if (!subHelp.has(sub)) { const r = spawnSync(process.execPath, [abs(tool), sub, '--help'], { cwd: ROOT, encoding: 'utf8', timeout: 20000 }); subHelp.set(sub, `${r.stdout || ''}\n${r.stderr || ''}`); }
    return subHelp.get(sub);
  };
  const bad = [];
  const pending = new Set();
  const judge = (where, base, sub, flag, help) => {
    const tok = flag || sub;
    if (tokRe(tok).test(help) || cFiles.some((c) => inText(c, base, sub, flag))) return;
    const name = `${base}${sub ? ` ${sub}` : ''}${flag ? ` ${flag}` : ''}`;
    if (inText(index, base, sub, flag)) pending.add(name); else bad.push(`${where} ${name}${flag ? '' : '（子指令）'}`);
  };
  for (const f of have(['AGENTS.md', 'PROMPTS.md', 'README.md', U, R, EDITOR, ...SETUP_MD, ...SKILL_FILES])) {
    lines(f).forEach((l, i) => {
      for (const m of l.matchAll(/node\s+shared\/template\/tools\/([\w-]+\.mjs)/g)) {
        const base = m[1];
        if (!exists(`shared/template/tools/${base}`)) continue;
        const toks = cmdAt(l, m.index + m[0].length).match(/"[^"]*"?|\S+/g) || [];
        let k = 0;
        while (toks[k] === '--project') k += 2;
        const sub = toks[k] && /^[a-z][\w-]*$/.test(toks[k]) ? toks[k] : '';
        if (sub) judge(`${f}:${i + 1}`, base, sub, '', helpOf(`shared/template/tools/${base}`));
        for (const tk of toks) {
          if (tk.startsWith('"')) continue;
          for (const part of tk.replace(/^[[(]+|[\])]+$/g, '').split(/[|｜]/)) {
            const fm = part.match(/^(--[A-Za-z][\w-]*)/);
            if (fm && fm[1] !== '--help') judge(`${f}:${i + 1}`, base, sub, fm[1], helpFor(base, sub));
          }
        }
      }
    });
  }
  if (pending.size) t.diagnostic(`cli.md 索引標了、還沒寫進 cli-00N.md 的指令（交件後自動轉成要存在）：${[...pending].join('、')}`);
  noProblems([...new Set(bad)], '文件寫的工具指令（子指令或旗標）在那支工具的 --help 與 cli 契約都找不到',
    '改成 --help 列的寫法；工具真的有這個子指令或旗標，就請那支工具的擁有者補進檔頭的 --help（media.mjs 補在那個子指令的說明）');
});

// 012 版面：style.md「版面」的 token 表＝kit/scene.css :root 的 --sc-*（scene.css 歸 003）
test('T28 版面 token 一致：style.md「版面」＝kit/scene.css :root（012）', (t) => {
  const sec = section(read(STYLE), '## 版面');
  const doc = new Map([...sec.matchAll(/^\|\s*`(--sc-[\w-]+)`\s*\|\s*(\d+)\s*\|/gm)].map((m) => [m[1], Number(m[2])]));
  const bad = [];
  if (!doc.size) bad.push('style.md 沒有「## 版面」的 token 表（| `--sc-…` | 值 | 用在 |）');
  const CSS = 'shared/template/kit/scene.css';
  const css = exists(CSS) ? read(CSS) : '';
  const missing = [];
  for (const [k, v] of doc) {
    const m = css.match(new RegExp(`${k}\\s*:\\s*(\\d+)px`));
    if (!m) missing.push(k); else if (Number(m[1]) !== v) bad.push(`${k}：style.md ${v}、scene.css ${m[1]}`);
  }
  if (missing.length) t.diagnostic(`scene.css 還沒有的 token（003 加了就自動要一致）：${missing.join('、')}`);
  noProblems(bad, '版面 token 數字不一致（style.md 為準）', 'style.md「版面」token 表和 kit/scene.css :root 改成同一組數字（scene.css 歸 003）');
});

// 012 版面：文件寫到的 audit 規則名（layout-*）、data-layout／data-gap／data-align／data-justify 的值都要在程式裡；分鏡「位置」欄不寫像素
test('T29 版面規則名與屬性值在程式裡、「位置」欄寫排法（012）', (t) => {
  const AUD = 'shared/template/tools/lib/audit-layout.mjs', HELP = 'shared/template/kit/scene-layout.js';
  const rules = new Set(exists(AUD) ? [...read(AUD).matchAll(/'(layout-[a-z-]+)'/g)].map((m) => m[1]) : []);
  const head = exists(HELP) ? (read(HELP).match(/^\/\*[\s\S]*?\*\//) || [''])[0] : '';
  const attrLine = (a) => { // 那個屬性的說明行＋縮排的續行
    const ls = head.split('\n'), out = [];
    for (let k = 0; k < ls.length; k++) if (new RegExp(`^\\s*\\*\\s+data-${a}\\s`).test(ls[k])) { out.push(ls[k]); while (k + 1 < ls.length && /^\s*\*\s{6,}\S/.test(ls[k + 1])) out.push(ls[++k]); }
    return out.join(' ');
  };
  const allowT29 = allowOf('T29'), used = new Set();
  const isPending = (s) => { const a = allowT29.find((x) => x.text === s); if (a) used.add(a); return !!a; };
  const bad = [], pending = new Set();
  const files = have([STYLE, BEATS, U, R, SITU, ...SKILL_FILES]);
  for (const f of files) {
    lines(f).forEach((l, i) => {
      for (const m of l.matchAll(/(?<![\w-])(layout-[a-z]+(?:-[a-z]+)*)/g)) {
        if (rules.has(m[1])) continue;
        if (isPending(m[1])) pending.add(m[1]); else bad.push(`${f}:${i + 1} 規則 ${m[1]} 不在 ${AUD}`);
      }
      for (const m of l.matchAll(/data-(layout|gap|align|justify)="([\w-]+)"/g)) {
        const words = attrLine(m[1]);
        if (new RegExp(`(^|[\\s（／(、])${m[2]}(?![\\w-])`).test(words)) continue;
        if (isPending(m[0])) pending.add(m[0]); else bad.push(`${f}:${i + 1} ${m[0]} 不在 ${HELP} 檔頭`);
      }
    });
  }
  const HDR8 = '| 拍 | 講到（綁句） | 畫面上出現什麼 | 動態（設計系統語彙） | 焦點 | 音效拍點 | 插圖元件（狀態） | 位置 |';
  const tmpl = '.agents/skills/auto-edit-storyboard/references/storyboard-template.md';
  for (const f of have([BEATS, U, tmpl])) {
    let on = false;
    lines(f).forEach((l, i) => {
      const s = l.trim();
      if (/^\| 拍 \|/.test(s)) { on = s === HDR8; return; }
      if (!on || !s.startsWith('|')) { on = on && s.startsWith('|'); return; }
      const c = s.replace(/^\||\|$/g, '').split('|').map((x) => x.trim());
      if (/x\s*\d+\s*[–-]\s*\d+|y\s*\d+\s*[–-]\s*\d+/.test(c[7] || '')) bad.push(`${f}:${i + 1} 「位置」寫了像素：${c[7]}`);
    });
  }
  if (pending.size) t.diagnostic(`docs-allow.json（test: T29）列了、程式還沒有的（做好後刪掉 allow 那筆）：${[...pending].join('、')}`);
  noProblems(bad, '版面規則名、屬性值和程式對不上，或「位置」欄寫了像素', '規則名照 lib/audit-layout.mjs、屬性值照 kit/scene-layout.js 檔頭；「位置」寫 <區域>｜<排法> <第幾個>（style.md「版面」）');
  noProblems(unusedAllow(allowT29, used), 'docs-allow.json（T29）有用不到的項目', '程式已經有了或文件不再提：刪掉這幾筆');
});

// 009 直式：auto-edit-rough、auto-edit-storyboard 的直式數字＝style.md「直式」＝tools/lib/canvas.mjs CANVAS.portrait（FR-155）
test('T30 直式數字一致：style.md「直式」＝canvas.mjs，Skill 的字幕字數、頭頂也一樣（009）', async (t) => {
  const pick = (s) => {
    s = String(s || '');
    const g = (re) => { const m = s.match(re); return m ? m.slice(1).map(Number) : null; };
    return {
      畫布: g(/(\d+)×(\d+)、30fps/),
      字數: g(/每則最多\s*\**(\d+)\**\s*個?字/),
      字幕帶: g(/字幕帶\s*y\s*(\d+)–(\d+)/),
      安全區: g(/y\s*(\d+)–(\d+)；y\s*(\d+)\s*以下右緣\s*(\d+)/),
      卡片帶: g(/卡片帶[^y]*y\s*(\d+)–(\d+)/),
      角標: g(/左上[^y]*y\s*(\d+)/),
      頭頂: g(/頭頂(?:落在)?\s*y\s*(\d+)–(\d+)、下巴\s*≤\s*(\d+)/),
    };
  };
  const ag = { 字數: (read(skillMd('auto-edit-rough')).match(/每則最多[^|\n]*?直式\s*(\d+)\s*字/) || []).slice(1).map(Number), 頭頂: pick(read(skillMd('auto-edit-storyboard'))).頭頂 };
  const st = pick(section(read(STYLE), '## 直式'));
  const bad = [];
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  for (const k of Object.keys(st)) {
    if (!st[k]) bad.push(`style.md「直式」找不到「${k}」`);
    else if (k in ag && ag[k]?.length && !eq(ag[k], st[k])) bad.push(`${k}：style.md ${st[k]}、Skill ${ag[k]?.length ? ag[k] : '（沒寫）'}`);
  }
  const CV = 'shared/template/tools/lib/canvas.mjs';
  if (exists(CV)) {
    const { CANVAS } = await import(pathToFileURL(abs(CV)).href);
    const p = CANVAS.portrait, ts = p.textSafe;
    const cv = {
      畫布: [p.W, p.H],
      字數: [p.caption.maxChars],
      字幕帶: [p.caption.zone[1], p.caption.zone[3]],
      安全區: [Math.min(...ts.map((r) => r[1])), Math.max(...ts.map((r) => r[3])), ts[1]?.[1], ts[1]?.[2]],
      卡片帶: [p.lowerThird.rect[1], p.lowerThird.rect[3]],
      角標: [p.badge.rect[1]],
      頭頂: [...p.framing.headTop, p.framing.chinMax],
    };
    for (const k of Object.keys(cv)) if (st[k] && !eq(cv[k], st[k])) bad.push(`${k}：style.md ${st[k]}、canvas.mjs ${cv[k]}`);
    // 直式 audit 的數字出處：字級下限＝ceil(32 ÷ 縮放倍率)、鏡頭推看得到的範圍＝上半面板換回子合成座標（canvas.mjs stage）
    const { stageTransform } = await import(pathToFileURL(abs(CV)).href);
    const sec = section(read(STYLE), '## 直式') || '';
    const num = (re) => { const m = sec.match(re); return m ? m.slice(1).map(Number) : null; };
    const min = p.minTextPx, need = (k) => { const s = stageTransform(k, p); return s ? Math.ceil(min / s.s) : null; };
    const fsS = stageTransform('fs', p), panel = p.regions.panelTop;
    const r1 = (v) => Math.round(v * 10) / 10;
    const want = {
      字級下限: [need('fs'), need('ch'), need('fx'), min],
      鏡頭範圍: [r1((panel[0] - fsS.tx) / fsS.s), r1((panel[0] + panel[2] - fsS.tx) / fsS.s), r1((p.textSafe[0][1] - fsS.ty) / fsS.s), r1((panel[1] + panel[3] - fsS.ty) / fsS.s)],
    };
    const got = {
      字級下限: (() => { const a = num(/04 家族\s*≥\s*(\d+)\s*px/), b = num(/01 章節\s*≥\s*(\d+)\s*px/), c = num(/大字\s*≥\s*(\d+)\s*px/), d = num(/下方字卡）字級\s*≥\s*(\d+)\s*px/); return a && b && c && d ? [a[0], b[0], c[0], d[0]] : null; })(),
      鏡頭範圍: num(/子合成座標\s*x\s*([\d.]+)–([\d.]+)、y\s*([\d.]+)–([\d.]+)/),
    };
    for (const k of Object.keys(want)) if (!eq(got[k], want[k])) bad.push(`${k}：style.md「直式」${got[k] ?? '（找不到）'}、canvas.mjs 算出 ${want[k]}`);
    // 決定 2：直式字幕和橫式同一套（字級、字重）；canvas.mjs 還是舊的 60 px 時只提醒（002 改完自動要一致）
    const L = CANVAS.landscape.caption;
    if (p.caption.font !== L.font || p.caption.weight !== L.weight) t.diagnostic(`canvas.mjs 直式字幕還是 ${p.caption.font} px／字重 ${p.caption.weight}（決定 2：和橫式同一套 ${L.font} px／${L.weight}；002 改）`);
  }
  noProblems(bad, '直式數字三處不一致（style.md「直式」為準）', 'style.md「直式」、tools/lib/canvas.mjs 的 CANVAS.portrait 改成同一組數字，auto-edit-rough 的字幕字數、auto-edit-storyboard 的頭頂也要一樣（canvas.mjs 歸 002）');
});

// ---------- 032 架構優化：文件和程式、文件和文件之間的對照 ----------
// D1：文件與工具原始碼裡的「auto-edit-<名稱> 步驟 X」「流程 X」「步驟 X–Y」要是那支 SKILL.md 的步驟標題（**X. ）；
// 「AGENTS.md 規則 N」「AGENTS.md「標題」」也要存在。只寫在內文、沒有自己標題的（例：流程 F）列在 docs-allow.json（test: T31）
test('T31 指到的步驟、規則、AGENTS.md 章節都存在（032 D1）', () => {
  const stepsOf = new Map(SKILLS.filter((n) => exists(skillMd(n)))
    .map((n) => [n, new Set([...(section(read(skillMd(n)), '## 步驟') || '').matchAll(/^\*\*([A-Z]\d*|\d+)\.\s/gm)].map((m) => m[1]))]));
  const agents = read('AGENTS.md');
  const heads = new Set([...agents.matchAll(/^#{2,} (.+)$/gm)].map((m) => m[1].trim()));
  const rules = new Set([...(section(agents, '## 規則') || '').matchAll(/^(\d+)\. /gm)].map((m) => m[1]));
  const allow = allowOf('T31'), used = new Set();
  const bad = [];
  const T = '([A-Z]\\d*|\\d+)';
  const QUAL = new RegExp(`auto-edit-([a-z]+)(?:/SKILL\\.md)?\`?\\s*(?:的\\s*)?(?:(步驟|流程)\\s*${T}|([A-Z]\\d+))(?:\\s*[–~-]\\s*${T})?`, 'g');
  const BARE = new RegExp(`(?<![\\w-])(步驟|流程)\\s*${T}(?:\\s*[–~-]\\s*${T})?`, 'g');
  const verify = (where, skill, kw, ids, local = new Set()) => {
    const steps = stepsOf.get(skill);
    if (!steps) { bad.push(`${where} 沒有 ${skill} 這支 Skill`); return; }
    for (const id of ids) {
      if (steps.has(id) || local.has(id)) continue;
      const a = allow.find((x) => x.file === skill && x.text === `${kw || '步驟'} ${id}`);
      if (a) { used.add(a); continue; }
      bad.push(`${where} ${skill} ${kw || ''}${kw ? ' ' : ''}${id}（這支只有 ${[...steps].join('、')}）`);
    }
  };
  const scan = (f, own) => {
    const text = read(f);
    const local = new Set([...text.matchAll(/^#+ (?:步驟|流程) ([A-Z]\d*|\d+)\b/gm)].map((m) => m[1]));   // references 自己的「## 步驟 A」
    text.split('\n').forEach((l, i) => {
      const where = `${f}:${i + 1}`;
      const spans = [];
      for (const m of l.matchAll(QUAL)) {
        spans.push([m.index, m.index + m[0].length]);
        verify(where, `auto-edit-${m[1]}`, m[2], [m[3] || m[4], m[5]].filter(Boolean));
      }
      if (own && !/^#+ /.test(l)) {
        for (const m of l.matchAll(BARE)) {
          if (spans.some(([a, b]) => m.index >= a && m.index < b)) continue;
          const before = l.slice(0, m.index);
          const doc = before.match(/([\w./-]+\.md)`?\s*(?:的\s*)?$/);
          if (doc && doc[1] !== 'SKILL.md') continue;   // 「setup/README.md 步驟 3」：指別份文件的步驟
          if (/(手冊|共用)$/.test(before)) continue;
          verify(where, own, m[1], [m[2], m[3]].filter(Boolean), local);
        }
      }
      for (const m of l.matchAll(/AGENTS\.md`?\s*(?:的\s*)?規則\s*(\d+)/g)) if (!rules.has(m[1])) bad.push(`${where} AGENTS.md 規則 ${m[1]}（只有 1–${rules.size}）`);
      for (const m of l.matchAll(/AGENTS\.md`?\s*(?:的\s*)?「([^」]+)」/g)) if (!heads.has(m[1])) bad.push(`${where} AGENTS.md「${m[1]}」不是 AGENTS.md 的標題`);
    });
  };
  const docs = have(['AGENTS.md', 'PROMPTS.md', 'README.md', 'CONTENTS.md', U, R, STYLE, SITU, REVIEW, EDITOR, BEATS, ...SETUP_MD]);
  for (const f of docs) scan(f, null);
  for (const f of SKILL_FILES) scan(f, f.split('/')[2]);
  for (const f of TOOL_SRC_FILES) scan(f, null);
  noProblems(bad, '指到不存在的步驟、規則或 AGENTS.md 章節', '改成那支 SKILL.md 真的有的步驟標題（**X. ）、AGENTS.md 真的有的規則與標題；只寫在內文的流程，加進 docs-allow.json（test: T31，file 寫 Skill 名稱）並寫理由');
  noProblems(unusedAllow(allow, used), 'docs-allow.json（T31）有用不到的項目', '刪掉這幾筆');
});

// D2：程式常數 → 文件句型。同一個句型在文件（含範例）裡出現別的數字就紅；句型一次都找不到也紅（文件改了說法，這張表要跟著改）
test('T32 音效數字和 lib/audio.mjs 的 SFX_RULES 一樣（032 D2）', async () => {
  const { SFX_RULES: S } = await import(pathToFileURL(abs('shared/template/tools/lib/audio.mjs')).href);
  const N = '(\\d+(?:\\.\\d+)?)';
  const RULES = [
    ['SFX_RULES.perMinute', S.perMinute, [`任一分鐘最多\\s*${N}\\s*顆`, `一分鐘超過\\s*${N}\\s*顆主音效`, `某一分鐘主音效超過\\s*${N}\\s*顆`, `任一分鐘\\s*≤\\s*${N}\\s*顆`, `每分鐘留最重要的\\s*${N}\\s*顆`, `[這那]一分鐘已經\\s*${N}\\s*顆`]],
    ['SFX_RULES.avgPerMinute', S.avgPerMinute, [`平均不超過每分鐘\\s*${N}\\s*顆`, `平均每分鐘不超過\\s*${N}\\s*顆`]],
    ['SFX_RULES.gapSec', S.gapSec, [`主音效、?相距(?:不到|至少)\\s*${N}\\s*秒`, `離前一顆不到\\s*${N}\\s*秒`, `${N}\\s*秒間隔只比主音效`, `只差 [\\d.]+s（<\\s*${N}\\s*s）`]],
    ['SFX_RULES.extraGapSec', S.extraGapSec, [`附加音效的起點相距不到\\s*${N}\\s*秒`]],
    ['SFX_RULES.sparseSec', S.sparseSec, [`超過\\s*${N}\\s*秒沒有主音效`]],
  ];
  const files = have(['AGENTS.md', 'PROMPTS.md', 'README.md', STYLE, U, R, SITU, REVIEW, EDITOR, BEATS, ...SETUP_MD, ...SKILL_FILES]);
  const bad = [];
  for (const [name, want, pats] of RULES) {
    let hits = 0;
    for (const f of files) lines(f).forEach((l, i) => {
      for (const p of pats) for (const m of l.matchAll(new RegExp(p, 'g'))) {
        hits++;
        if (Number(m[1]) !== want) bad.push(`${f}:${i + 1} 寫 ${m[1]}，${name} 是 ${want}：${m[0]}`);
      }
    });
    if (!hits) bad.push(`${name}：文件裡一個句型都找不到（${pats.join('｜')}）`);
  }
  noProblems(bad, '音效數字和程式常數不一致', '照 shared/template/tools/lib/audio.mjs 的 SFX_RULES 改文件（工具印的原文以 lib/audio.mjs、lib/plan.mjs 為準）；文件換了說法就更新 T32 的句型表');
});

// D2：USAGE.md 的 --check 範例只能出現 kit/sfx.json 有的音效（音效改名、拿掉之後範例不能還留著舊名字）
test('T33 USAGE.md 範例裡的音效名都在 kit/sfx.json（032 D2）', () => {
  const kit = new Set(Object.keys(JSON.parse(read('shared/template/kit/sfx.json'))));
  const names = [];
  read(U).split('\n').forEach((l, i) => {
    const add = (n) => names.push([n, i + 1]);
    for (const m of l.matchAll(/音效 ([a-z][\w-]*)（/g)) add(m[1]);
    for (const m of l.matchAll(/（([a-z][\w-]*) 已拿掉）/g)) add(m[1]);
    for (const m of l.matchAll(/＋([a-z][\w-]*)×\d/g)) add(m[1]);
    if (l.startsWith('音效次數：')) for (const m of l.slice(5).matchAll(/([a-z][\w-]*) \d+/g)) add(m[1]);
    const cells = l.split('｜');
    if (cells.length >= 6) for (const m of cells[4].matchAll(/(?:^|＋)([a-z][\w-]*)(?= \d+:\d\d|×\d)/g)) add(m[1]);
  });
  check(names.length > 0, 'USAGE.md 找不到任何 --check 範例裡的音效名 → 範例格式改了，更新 T33 的抓法');
  noProblems(names.filter(([n]) => !kit.has(n)).map(([n, ln]) => `${U}:${ln} ${n}`), 'USAGE.md 範例裡有 kit/sfx.json 沒有的音效',
    `換成 kit/sfx.json 有的（${[...kit].join('、')}）；範例最好重跑 build.mjs --check 貼實際輸出`);
});

// D4：AGENTS.md 路由表每一列的觸發語都要寫在那一列 Skill 的 description；同一句觸發語不能出現在兩支 Skill 的 description
test('T34 路由表的觸發語都在 Skill 的 description，而且不重複（032 D4）', () => {
  const sec = section(read('AGENTS.md'), '## 怎麼用這份檔') || '';
  const desc = new Map(SKILLS.filter((n) => exists(skillMd(n))).map((n) => [n, frontmatter(read(skillMd(n)))?.description || '']));
  const bad = [];
  let rows = 0;
  for (const l of sec.split('\n')) {
    if (!/^\|/.test(l) || /^\|---|^\| 我說 /.test(l)) continue;
    const [say, to] = l.split('|').slice(1, 3);
    const skill = (to.match(/`(auto-edit-[a-z]+)`/) || [])[1];
    if (!skill) continue;
    rows++;
    for (const m of say.matchAll(/「([^」]+)」/g)) if (!desc.get(skill)?.includes(`「${m[1]}」`)) bad.push(`${skillMd(skill)} 的 description 少了「${m[1]}」（AGENTS.md 路由表）`);
  }
  check(rows > 0, 'AGENTS.md「怎麼用這份檔」找不到路由表（| 我說 | Skill |）→ 路由表改了格式就更新 T34');
  const owner = new Map();
  for (const [n, d] of desc) for (const m of d.matchAll(/「([^」]+)」/g)) { if (!owner.has(m[1])) owner.set(m[1], new Set()); owner.get(m[1]).add(n); }
  for (const [q, set] of owner) if (set.size > 1) bad.push(`「${q}」同時在 ${[...set].join('、')} 的 description`);
  noProblems(bad, 'Skill 的 description 和 AGENTS.md 路由表不一致', '觸發語照路由表寫進那一列的 Skill 的 description（「當使用者說…時使用」那一句）；同一句只留在路由表指定的那一支，別支改成不會搶的說法');
});

// D5：9 支 Skill 退路表第一欄用反引號引的工具原文，切掉 …、<…>、N／M 這類占位後每一段都要在工具原始碼找得到；
// 原始碼的 ${…} 當萬用字元（固定的字要佔六成以上），或由兩段以上原始碼的字串接起來（每段至少 6 個字）。
// 開頭的 ✖／⚠ 由印的地方統一加，不算。不是工具印的（npm 的訊息）、程式組字組得太碎的，列在 docs-allow.json（test: T35，text 是第一欄裡的字）
test('T35 退路表的工具原文在工具原始碼裡找得到（032 D5）', () => {
  const setupSrc = fs.readdirSync(abs('setup')).filter((f) => f.endsWith('.mjs')).map((f) => `setup/${f}`);
  const src = [...TOOL_SRC_FILES, ...setupSrc].map(read).join('\n');
  const W = '\u0001';
  const unwrap = (l) => { let out = '', i = 0; while (i < l.length) { if (l[i] === '$' && l[i + 1] === '{') { let d = 0, j = i + 1; for (; j < l.length; j++) { if (l[j] === '{') d++; else if (l[j] === '}' && --d === 0) break; } out += W; i = j + 1; } else out += l[i++]; } return out; };
  const wild = src.split('\n').filter((l) => l.includes('${')).map(unwrap);
  // p 對上 t 的某一段（W＝任意字串）時，最多有幾個字是 t 的固定字對上的；對不上回 -1
  const lit = (p, t) => {
    let cur = new Int16Array(t.length + 1).fill(0);
    for (let i = 0; i < p.length; i++) {
      const nxt = new Int16Array(t.length + 1).fill(-1);
      for (let k = 0; k < t.length; k++) { const v = cur[k]; if (v < 0) continue; if (t[k] === W) nxt[k] = Math.max(nxt[k], v); else if (t[k] === p[i]) nxt[k + 1] = Math.max(nxt[k + 1], v + 1); }
      for (let k = 0; k < t.length; k++) if (nxt[k] >= 0 && t[k] === W) nxt[k + 1] = Math.max(nxt[k + 1], nxt[k]);
      cur = nxt;
    }
    return Math.max(...cur);
  };
  const found = (p) => {
    if (src.includes(p)) return true;
    const need = Math.max(4, Math.ceil(p.length * 0.55));
    const grams = []; for (let i = 0; i + 3 <= p.length; i++) grams.push(p.slice(i, i + 3));
    if (wild.some((l) => grams.some((g) => l.includes(g)) && lit(p, l) >= need)) return true;
    let i = 0, n = 0;
    while (i < p.length) { let j = i; while (j < p.length && src.includes(p.slice(i, j + 1))) j++; if (j - i < 6 && !(j === p.length && j - i >= 3 && n)) return false; i = j; n++; }
    return true;
  };
  const PH = /→|…|\.\.\.|<[^>]*>|(?<![A-Za-z0-9])(?:[NM]s?|W×H)(?![A-Za-z0-9])/g;
  const allow = allowOf('T35'), used = new Set();
  const bad = [];
  for (const n of SKILLS.filter((x) => exists(skillMd(x)))) {
    const f = skillMd(n);
    const ls = lines(f);
    const start = ls.indexOf('## 退路表');
    for (let i = start + 1; start >= 0 && i < ls.length && !/^## /.test(ls[i]); i++) {
      const l = ls[i];
      if (!l.startsWith('|') || /^\|---|^\| 症狀/.test(l)) continue;
      const cell = l.split('|')[1];
      const a = allow.find((x) => f.endsWith(x.file) && cell.includes(x.text));
      if (a) { used.add(a); continue; }
      for (const m of cell.matchAll(/`([^`]+)`/g)) {
        const miss = m[1].split(PH).map((s) => s.trim().replace(/^[✖⚠✓✔⏳]\s*/, '')).filter((s) => s.length >= 2 && !found(s));
        if (miss.length) bad.push(`${f}:${i + 1} \`${m[1].slice(0, 70)}\` 找不到：${miss.map((s) => `「${s}」`).join('')}`);
      }
    }
  }
  noProblems(bad, '退路表第一欄的工具原文在 shared/template/tools/、setup/*.mjs 的原始碼找不到', '照工具現在印的字改（變動的部分寫 …、<段>、N），做法欄也照工具 → 後面的建議改；確定不是工具印的，加進 docs-allow.json（test: T35）並寫理由');
  noProblems(unusedAllow(allow, used), 'docs-allow.json（T35）有用不到的項目', '刪掉這幾筆');
});
