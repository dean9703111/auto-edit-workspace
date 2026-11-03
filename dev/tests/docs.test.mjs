// 文件一致性測試（001 skills-docs；憲法 IV「單一真相」）：node --test dev/tests/docs.test.mjs
// 零依賴、不呼叫 shell；工具 --help 用 process.execPath 直接跑。
// 每個失敗訊息最後都有「→ 怎麼改」（憲法 III.4）；所有斷言都經過 check()，T21 會檢查這件事。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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

// ---------- 停點（specs/contracts/stop-points.md §2.1；執行期的真相是 AGENTS.md「停點總表」） ----------
const STOPS = [
  { n: '①', name: '剪輯清單', skill: 'auto-edit-rough', line: '⏸ 停點 ① 剪輯清單｜請看：work/cuts.md｜請回：「可以」或要改的列' },
  { n: '②', name: '構圖', skill: 'auto-edit-storyboard', line: '⏸ 停點 ② 構圖｜請看：<構圖台網址>、work/look-preview.jpg｜請回：拖好框按「儲存」後說「調好了」，或說「用建議的」' },
  { n: '③', name: '分鏡表', skill: 'auto-edit-storyboard', line: '⏸ 停點 ③ 分鏡表｜請看：work/storyboard.md｜請回：「可以」或要改的地方' },
  { n: '④', name: '影片編輯器', skill: 'auto-edit-review', line: '⏸ 停點 ④ 影片編輯器｜請看：<影片編輯器網址>｜請回：要改的段落（例：s05 往左移）、調完按「儲存」後說「調好了」，或「可以了，輸出成片」' },
  { n: '⑤', name: '背景預覽', skill: 'auto-edit-style', line: '⏸ 停點 ⑤ 背景預覽｜請看：<暫存資料夾>/preview.jpg、<暫存資料夾>/zones-fs.jpg｜請回：「可以」或「重做」' },
];
// 停點 ③ 的改版變體（014；停點仍是五個，stop-points.md §2.1 最後一列）
const STOP_VARIANTS = [
  { n: '③ 改版', skill: 'auto-edit-review', line: '⏸ 停點 ③ 分鏡表（<段> v<N>）｜請看：work/versions/<段>/v<N>/分鏡.md｜請回：「可以」或要改的拍' },
];

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

test('T4 skills：骨架（開頭兩行、一覽表頭、必要標題、每步三件事、自我核對 5–8 項）', () => {
  const L1 = '規則在 AGENTS.md；本檔只寫這一階段的指令、判準、停點、退路。';
  const L2 = '衝突時：使用者當下的話 > AGENTS.md > shared/style.md > USAGE.md > USAGE-reference.md > 本 Skill；派工時派工訊息 > 本 Skill。';
  const HEAD = '| 輸入 | 指令 | 產出 | 完成判準 | 停點 |';
  const H2 = ['## 步驟', '## 自我核對', '## 退路表', '## 工具呼叫預算', '## 回報格式'];
  const bad = [];
  for (const n of SKILLS.filter((x) => exists(skillMd(x)))) {
    const f = skillMd(n);
    const text = read(f);
    const body = text.replace(/^---\n[\s\S]*?\n---\n/, '').split('\n');
    const t = body.findIndex((l) => l.startsWith('# '));
    const after = body.slice(t + 1).filter((l) => l.trim());
    if (after[0] !== L1 || after[1] !== L2) bad.push(`${f}：標題下第一段不是固定的兩行（規則在 AGENTS.md…／衝突時：…）`);
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
    const nErr = (steps.match(/常見錯誤：[^\n]*→/g) || []).length;
    if (!nSteps) bad.push(`${f}：「## 步驟」裡找不到 **1. …** 這種步驟標題`);
    if (nCode < nSteps || nDone < nSteps || nErr < nSteps) bad.push(`${f}：${nSteps} 個步驟，但指令區塊 ${nCode}、「完成判準：」${nDone}、「常見錯誤：…→…」${nErr}（每步都要三件事）`);
    const selfCheck = section(text, '## 自我核對') || '';
    const items = (selfCheck.match(/^- \[ \]/gm) || []).length;
    if (items < 5 || items > 8) bad.push(`${f}：自我核對 ${items} 項（要 5–8 項）`);
    const fallback = section(text, '## 退路表') || '';
    if (!fallback.includes('| 症狀（工具原文） | 做法 | 第二次還失敗 |')) bad.push(`${f}：退路表表頭要是「| 症狀（工具原文） | 做法 | 第二次還失敗 |」`);
    const budget = section(text, '## 工具呼叫預算') || '';
    if (!/\d+ 次/.test(budget) || !budget.includes('停')) bad.push(`${f}：工具呼叫預算要寫「N 次」和「超過就停下來回報」`);
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

test('T6 停點：AGENTS.md「停點總表」恰好 5 列、①–⑤', () => {
  const sec = section(read('AGENTS.md'), '## 停點總表');
  check(sec != null, 'AGENTS.md 沒有「## 停點總表」這一節 → 照 specs/contracts/stop-points.md §1 新增');
  const ls = sec.split('\n');
  const start = ls.findIndex((l) => l.startsWith('|'));
  const rows = [];
  for (let i = start + 2; i < ls.length && ls[i].startsWith('|'); i++) rows.push(ls[i].split('|')[1].trim());
  const want = STOPS.map((s) => `${s.n} ${s.name}`);
  check(JSON.stringify(rows) === JSON.stringify(want), `停點總表第一張表的第一欄是 ${JSON.stringify(rows)}，要是 ${JSON.stringify(want)} → 照 stop-points.md §1，只有五列（④ 影片編輯器合併了舊的 ④ Studio 預覽、⑤ 剪輯台）`);
});

test('T7 停點：五行（＋③ 改版）最後一行原文都在 AGENTS.md 與對應的 SKILL.md', () => {
  const agents = read('AGENTS.md');
  const bad = [];
  for (const s of [...STOPS, ...STOP_VARIANTS]) {
    if (!agents.includes(s.line)) bad.push(`AGENTS.md 少了停點 ${s.n} 的原文`);
    if (exists(skillMd(s.skill)) && !read(skillMd(s.skill)).includes(s.line)) bad.push(`${skillMd(s.skill)} 少了停點 ${s.n} 的原文`);
  }
  noProblems(bad, '停點最後一行和契約不一致', '逐字照 specs/contracts/stop-points.md §2.1 貼上（<…> 保留原樣）');
});

test('T8 停點：所有「⏸ 停點」都是五行之一', () => {
  const allowed = new Set([...STOPS, ...STOP_VARIANTS].map((s) => s.line));
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
  noProblems(bad, '有自創格式的停點行', '只用 AGENTS.md「停點總表」的五行原文；要提到停點時寫「停點 ③」，不要加 ⏸');
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
    const r = spawnSync(process.execPath, [abs(tool), '--help'], { cwd: ROOT, encoding: 'utf8', timeout: 20000 });
    helpCache.set(tool, `${r.stdout || ''}\n${r.stderr || ''}`);
  }
  return helpCache.get(tool);
};

test('T10 數字找得到出處（AGENTS.md、style.md、USAGE.md、USAGE-reference.md、工具 --help）', () => {
  const sources = new Set();
  for (const f of have(['AGENTS.md', STYLE, U, R])) for (const l of stripForNumbers(read(f)).split('\n')) for (const p of pairsIn(l, { comparatorOnly: false })) sources.add(p);
  for (const t of TOOLS) for (const l of helpOf(t).split('\n')) for (const p of pairsIn(l, { comparatorOnly: false })) sources.add(p);
  const allowAll = JSON.parse(read('dev/tests/docs-allow.json'));
  const allow = allowAll.filter((a) => !a.test || a.test === 'T10');
  const badAllow = allow.filter((a) => !a.file || !a.text || !a.reason).map((a) => JSON.stringify(a));
  noProblems(badAllow, 'docs-allow.json 有缺欄位的項目', '每筆都要有 file、text、reason');
  check(allowAll.length <= 40, `docs-allow.json 有 ${allowAll.length} 筆（上限 40）→ 把數字搬進 style.md 或 AGENTS.md，不要一直加白名單`);
  const bad = [];
  for (const f of have([...SKILL_FILES, SITU, REVIEW, BEATS])) {
    stripForNumbers(read(f)).split('\n').forEach((l, i) => {
      for (const p of pairsIn(l, { comparatorOnly: true })) {
        if (sources.has(p)) continue;
        if (allow.some((a) => f.endsWith(a.file) && l.includes(a.text))) continue;
        bad.push(`${f}:${i + 1} ${p}`);
      }
    });
  }
  noProblems(bad, '門檻數字在 AGENTS.md、style.md、USAGE*.md、工具 --help 都找不到（FR-091）', '寫進 style.md 或 AGENTS.md，或加進 dev/tests/docs-allow.json 並寫理由');
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
  const allowT12 = JSON.parse(read('dev/tests/docs-allow.json')).filter((a) => a.test === 'T12').map((a) => a.text);
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
        if (contracts.includes(p) || allowT12.includes(p)) pending.add(p); else bad.push(`${f}:${i + 1} ${p}`);
      }
      if (skillDir) for (const m of l.matchAll(/references\/([\w.-]+\.md)/g)) if (!exists(`${skillDir}/references/${m[1]}`)) bad.push(`${f}:${i + 1} references/${m[1]}`);
    });
  }
  if (pending.size) t.diagnostic(`契約或 docs-allow.json（test: T12）列了、還沒實作的檔（做好後刪掉 allow 那筆）：${[...pending].join('、')}`);
  noProblems(bad, '文件寫到的檔案不存在（FR-093）', '改成存在的路徑；新工具要先寫進 specs/contracts/cli-00N.md');
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
  const walk = (d, out = []) => { for (const e of fs.readdirSync(abs(d), { withFileTypes: true })) { const p = `${d}/${e.name}`; if (e.isDirectory()) { if (!/node_modules|vendor/.test(p)) walk(p, out); } else if (/\.(mjs|js)$/.test(e.name)) out.push(p); } return out; };
  const src = walk('shared/template/tools').map(read).join('\n');
  const SKR = skillMd('auto-edit-rough');
  const pairs = [
    [U, '是全黑，但素材沒有純聲音檔 → 初剪壞了：跑 node shared/template/tools/media.mjs verify-rough --project'],
    [SKR, '✓ work/rough.mp4 沒有黑畫面'],
    [SKR, '原片同位置不黑 → 初剪壞了'],
    [SKR, '原片同位置也是黑的'],
    [U, 'chtag：不用寫，角標現在自動常駐 → 刪掉 "chtag": true（要舊的附件角標，plan.json 第一層寫 "chapterBadge": false）'],
    [U, 'chapterBadge 只能是 true 或 false（不寫＝true：章節角標自動常駐右上角），現在是 '],
    [U, '個用字數比例估（'],
    [U, '對 rough.mp4 重轉詞級逐字稿：npx hyperframes transcribe'],
    [U, '文字對時：'],
    [U, '就講到了，晚了 '],
    [U, '（上限：任一分鐘 ≤ '],
    [U, '清掉同一段的舊截圖（這次張數變了）：'],
    [U, '是全黑（原始素材不是）→ 初剪壞了，跑 node shared/template/tools/media.mjs verify-rough --project'],
    [skillMd('auto-edit-storyboard'), '選表上最小的；最後由使用者選）'],
    [skillMd('auto-edit-motion'), '才講到、不是 #'],
    [U, '抽樣 12 格都沒偵測到臉 → 這支只調光；確定有講者就跑 node shared/template/tools/look.mjs run --project'],
    [U, 'build 會停下來：'],
    [U, 'rhythm 只能是 "continuous"（預設，照 style.md 連續覆蓋）或 "spaced"（要留露臉空檔），現在是 '],
    [U, '→ 改成清單裡的名稱（跑 build.mjs --list 看每顆的用途），或寫 null 不放音效'],
    [U, '→ 中間換一段情境動畫（style.md「情境動畫優先」）或別的版面'],
    ['AGENTS.md', '→ 下一步：'],
    [SKR, '在逐字稿裡對不上，時間用前後句內插：'],
    [SKR, '：時間是整則按字數比例估的 → 寫回後要跑 node shared/template/tools/media.mjs snap-srt --project'],
    [SKR, 'work/hyperframes/plan.json 已經用到句號（#N），重新斷句後句號會全部位移 → 加 --remap-plan 再跑一次'],
    [U, '→ 字幕不顯示這四種標點（保留「、！？」），跑 media.mjs srt-align 或在影片編輯器改'],
    [U, ' → 在影片編輯器和前後句合併，或把起迄拉長'],
    [skillMd('auto-edit-motion'), '找不到對應的 P.at'],
    [skillMd('auto-edit-motion'), '不在分鏡表'],
    [skillMd('auto-edit-motion'), '不在語彙表'],
    [skillMd('auto-edit-motion'), '沒有動畫分鏡：'],
    [skillMd('auto-edit-motion'), '分鏡表表頭不對'],
    [skillMd('auto-edit-motion'), '分鏡用了「'],
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
// 字幕數字：style.md「字幕」＝AGENTS.md「剪乾淨的數字」的字幕列＝kit/captions.css（F8）
test('T25 字幕數字一致：style.md「字幕」＝AGENTS.md＝kit/captions.css（F8）', (t) => {
  const pick = (text) => {
    const s = String(text || '').replace(/\*\*/g, '');
    const g = (re) => { const m = s.match(re); return m ? Number(m[1]) : null; };
    return { 字級: g(/字級\s*(\d+)\s*px/), 字重: g(/字重\s*(\d+)/), 底板高: g(/底板高\s*(\d+)\s*px/), 內距上下: g(/內距上下\s*(\d+)\s*px/), 內距左右: g(/左右\s*(\d+)\s*px/), 距畫面底: g(/距畫面底\s*(\d+)\s*px/), 每則字數: g(/每則最多\s*(\d+)\s*個?字/) };
  };
  const st = pick(section(read(STYLE), '## 字幕'));
  const ag = pick((section(read('AGENTS.md'), '## 剪乾淨（初剪）') || '').split('\n').filter((l) => /^\| 字幕/.test(l)).join('\n')); // 只看「剪乾淨的數字」（「版式」節的直式表另由 T30 對）
  const bad = [];
  for (const k of Object.keys(st)) {
    if (st[k] === null) bad.push(`style.md「字幕」找不到「${k}」`);
    else if (ag[k] !== st[k]) bad.push(`${k}：style.md ${st[k]}、AGENTS.md ${ag[k] ?? '（沒寫）'}`);
  }
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
  noProblems(bad, '字幕數字三處不一致（F8：style.md 為準）', 'style.md「字幕」、AGENTS.md「剪乾淨的數字」的字幕列、kit/captions.css 改成同一組數字（captions.css 歸 002；底板高＝line-height＋上內距＋下內距）');
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

// AGENTS.md 與 Skill 引用的工具指令：要嘛工具 --help 有，要嘛在 cli-00N.md 契約裡；只在 cli.md 索引標了的算「待寫」
test('T27 AGENTS.md、Skill 引用的工具指令在 --help 或 cli 契約裡', (t) => {
  const cdir = 'specs/contracts';
  const cFiles = exists(cdir) ? fs.readdirSync(abs(cdir)).filter((f) => /^cli-\d+\.md$/.test(f)).map((f) => read(`${cdir}/${f}`)) : [];
  const index = exists(`${cdir}/cli.md`) ? read(`${cdir}/cli.md`) : '';
  const tokRe = (tok) => new RegExp(`(^|[\\s\`"(／/])${tok.replace(/[-]/g, '\\-')}(?![\\w-])`);
  const inText = (text, base, tok) => text.split('\n').some((l) => l.includes(base) && tokRe(tok).test(l));
  const bad = [];
  const pending = new Set();
  for (const f of have(['AGENTS.md', ...SKILL_FILES])) {
    lines(f).forEach((l, i) => {
      for (const m of l.matchAll(/node\s+shared\/template\/tools\/([\w-]+\.mjs)((?:[ \t]+[^\s`|；，）]+)*)/g)) {
        const base = m[1];
        if (!exists(`shared/template/tools/${base}`)) continue;
        const toks = m[2].trim().split(/\s+/).filter(Boolean);
        let tok = '';
        for (let k = 0; k < toks.length; k++) { if (toks[k] === '--project') { k++; continue; } if (/^(--[\w-]+|[a-z][\w-]*)$/.test(toks[k])) tok = toks[k]; break; }
        if (!tok) continue;
        if (tokRe(tok).test(helpOf(`shared/template/tools/${base}`)) || cFiles.some((c) => inText(c, base, tok))) continue;
        if (inText(index, base, tok)) pending.add(`${base} ${tok}`); else bad.push(`${f}:${i + 1} ${base} ${tok}`);
      }
    });
  }
  if (pending.size) t.diagnostic(`cli.md 索引標了、還沒寫進 cli-00N.md 的指令（交件後自動轉成要存在）：${[...pending].join('、')}`);
  noProblems([...new Set(bad)], '文件寫的工具指令在 --help 與 cli 契約都找不到', '改成存在的子指令；新指令先請擁有者寫進 specs/contracts/cli-00N.md（或在 cli.md 索引標「待寫」）');
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
  const pendingAllow = JSON.parse(read('dev/tests/docs-allow.json')).filter((a) => a.test === 'T29').map((a) => a.text);
  const bad = [], pending = new Set();
  const files = have([STYLE, BEATS, U, R, SITU, ...SKILL_FILES]);
  for (const f of files) {
    lines(f).forEach((l, i) => {
      for (const m of l.matchAll(/(?<![\w-])(layout-[a-z]+(?:-[a-z]+)*)/g)) {
        if (rules.has(m[1])) continue;
        if (pendingAllow.includes(m[1])) pending.add(m[1]); else bad.push(`${f}:${i + 1} 規則 ${m[1]} 不在 ${AUD}`);
      }
      for (const m of l.matchAll(/data-(layout|gap|align|justify)="([\w-]+)"/g)) {
        const words = attrLine(m[1]);
        if (new RegExp(`(^|[\\s（／(、])${m[2]}(?![\\w-])`).test(words)) continue;
        if (pendingAllow.includes(m[0])) pending.add(m[0]); else bad.push(`${f}:${i + 1} ${m[0]} 不在 ${HELP} 檔頭`);
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
});

// 009 直式：AGENTS.md「版式」的直式數字表＝style.md「直式」＝tools/lib/canvas.mjs CANVAS.portrait（FR-155）
test('T30 直式數字一致：AGENTS.md「版式」＝style.md「直式」＝canvas.mjs（009）', async (t) => {
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
  const ag = pick(section(read('AGENTS.md'), '## 版式（橫式／直式）'));
  const st = pick(section(read(STYLE), '## 直式'));
  const bad = [];
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  for (const k of Object.keys(st)) {
    if (!st[k]) bad.push(`style.md「直式」找不到「${k}」`);
    else if (!eq(ag[k], st[k])) bad.push(`${k}：style.md ${st[k]}、AGENTS.md「版式」${ag[k] ?? '（沒寫）'}`);
  }
  const CV = 'shared/template/tools/lib/canvas.mjs';
  if (exists(CV)) {
    const { CANVAS } = await import(abs(CV));
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
    const { stageTransform } = await import(abs(CV));
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
  noProblems(bad, '直式數字三處不一致（style.md「直式」為準）', 'AGENTS.md「版式」的直式表、style.md「直式」、tools/lib/canvas.mjs 的 CANVAS.portrait 改成同一組數字（canvas.mjs 歸 002）');
});
