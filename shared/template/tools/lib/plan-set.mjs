// plan.json 第一層設定的單點寫入（032 A1）：build.mjs --set／--unset、--to-design，status.mjs --init --format 也呼叫 setPlan。
// AI 手改 plan.json 常常整份重寫、蓋掉剪輯台剛存的修改，或把 "theme": "暗" 這種值寫進去：改由工具每次重新讀檔、只動那個鍵、檢查值。零依賴。
//
//   setPlan(project, { <鍵>: <值>, … }, opts)   → [{ key, from, to }]（只回傳有變的鍵；鍵或值不對丟 Error，訊息以 ✖ 開頭、附「→ 能寫的：…」）
//   unsetPlan(project, [<鍵>, …], opts)         → 同上（to 是 undefined）
//   parsePairs('theme=dark;look.slim=0.6')      → { theme: 'dark', 'look.slim': '0.6' }
//   planSetCmd(P, flags, { label })             → build.mjs --set／--unset：印每一個改動和下一步，回傳結束碼
//   toDesignCmd(P, spec, { label, templateArg }) → build.mjs --to-design：換成內容設計動畫、補 brief、驗收次數歸零、build、印派工
//   opts：{ templateDir（預設這份 shared/template）, plan（plan.json 路徑，預設 <專案>/work/hyperframes/plan.json） }
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeAtomic } from './atomic.mjs';
import { listPacks } from './styles.mjs';
import { loadMusic } from './music.mjs';
import { LOOK_LIMITS } from './look.mjs';
import { readSettings } from './settings.mjs';
import { ok, fail, next, cmdLine } from './say.mjs';
import { runToolUntilDoneSync } from './job.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOLS = path.resolve(HERE, '..');
const DEFAULT_TEMPLATE = path.resolve(TOOLS, '..');
export const planFileOf = (project) => path.join(project, 'work', 'hyperframes', 'plan.json');

const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const readOpt = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const BAD = Symbol('bad');

const num = (lo, hi) => (v) => {
  const s = String(v).trim();
  const n = typeof v === 'number' ? v : s === '' ? NaN : Number(s);
  return Number.isFinite(n) && n >= lo && n <= hi ? n : BAD;
};
const pick = (list, alias = {}) => (v) => { const s = String(v).trim(); const m = alias[s] ?? s; return list.includes(m) ? m : BAD; };
const track = (v, c) => (v === null || v === 'none' ? null : c.bgm().includes(String(v).trim()) ? String(v).trim() : BAD);
const trackHint = (c) => [...c.bgm(), 'none'].join('／');

// early：還沒有 plan.json 時也能寫（構圖台、換風格這幾步在分鏡之前；剪輯台構圖台也是先建 { "version": 1 }）
const KEYS = {
  theme: { hint: () => 'light／dark', parse: pick(['light', 'dark']), early: true },
  style: { hint: (c) => c.packs().join('／') || '（shared/template/styles/ 是空的）', parse: (v, c) => (c.packs().includes(String(v).trim()) ? String(v).trim() : BAD), early: true },
  format: { hint: () => 'portrait／landscape', parse: pick(['portrait', 'landscape'], { 直式: 'portrait', 橫式: 'landscape' }), early: true },
  speakerSide: { hint: () => 'left／center／right', parse: pick(['left', 'center', 'right']) },
  chapterBadge: { hint: () => 'true／false', parse: (v) => (v === true || v === 'true' ? true : v === false || v === 'false' ? false : BAD) },
  look: { hint: () => 'off', parse: (v) => (v === false || v === 'off' ? false : BAD), early: true },
  'look.color': { hint: () => `${LOOK_LIMITS.color.join('–')}`, parse: num(...LOOK_LIMITS.color), early: true },
  'look.slim': { hint: () => `${LOOK_LIMITS.slim.join('–')}`, parse: num(...LOOK_LIMITS.slim), early: true },
  'look.beauty': { hint: () => `${LOOK_LIMITS.beauty.join('–')}`, parse: num(...LOOK_LIMITS.beauty), early: true },
  'bed.music': { hint: trackHint, parse: track },
  'bed.volume': { hint: () => '−12–12 dB', parse: num(-12, 12) },
  'outro.from': { hint: () => '#N＝結語金句講完後那一句（不寫＝只播片尾最後 30 秒）', parse: (v) => (/^#\d+(@\S+)?$/.test(String(v).trim()) ? String(v).trim() : BAD) },
  'outro.music': { hint: trackHint, parse: track },
  // 片尾模板（033，lib/ending.mjs）：工作區在 shared/setting.json 設定，這裡只做這一集的例外
  ending: { hint: () => 'false＝這一集不要片尾', parse: (v) => (v === false || v === 'false' || v === 'off' ? false : BAD) },
  'ending.quote': { hint: () => '片尾金句的字／none＝這一集不放', parse: (v) => (v === null || v === 'none' ? null : String(v).trim() ? String(v).trim() : BAD) },
  'ending.subscribe': { hint: () => '#N＝講到「訂閱」的那一句／none＝這一集不放', parse: (v) => (v === null || v === 'none' ? null : /^#\d+$/.test(String(v).trim()) ? String(v).trim() : BAD) },
};
// --unset 另外收整個 bed、outro（回到工作區預設的底樂、片尾配樂）；ending 本身就在 KEYS（--unset ending＝回到工作區的片尾設定）
const UNSET_ONLY = ['bed', 'outro'];

function context(templateDir, project) {
  let packs = null, bgm = null;
  return {
    packs: () => (packs ??= listPacks(templateDir).map((p) => p.dir)),
    // 曲庫：kit/sfx.json 的 kind: "bgm"＋工作區與這一集的 music.json（和 build 的 loadLib 同一套）
    bgm: () => (bgm ??= Object.entries({ ...(readJson(path.join(templateDir, 'kit', 'sfx.json')) || {}), ...loadMusic({ sharedDir: path.resolve(templateDir, '..'), projectDir: project }) })
      .filter(([, v]) => v?.kind === 'bgm').map(([k]) => k)),
  };
}
const allowed = (c, keys = Object.keys(KEYS)) => keys.map((k) => `${k}（${KEYS[k].hint(c)}）`).join('、');

export function parsePairs(text) {
  const out = {};
  for (const part of String(text ?? '').split(/[;；]/).map((s) => s.trim()).filter(Boolean)) {
    const i = part.search(/[=＝]/);
    if (i <= 0) throw new Error(`✖ 「${part}」要寫成「鍵=值」，多個用分號隔開（例 --set "theme=dark;look.slim=0.6"）→ 能寫的：${Object.keys(KEYS).join('、')}`);
    out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}
const splitKeys = (text) => String(text ?? '').split(/[;；,，]/).map((s) => s.trim()).filter(Boolean);

const getPath = (plan, key) => {
  const [p, c] = key.split('.');
  if (!c) return plan[p];
  return isObj(plan[p]) ? plan[p][c] : undefined;
};
// 新的第一層鍵放在 scenes 前面（scenes 很長，放後面人和 --show 都找不到）
function setTop(plan, key, value) {
  if (key in plan || !('scenes' in plan)) { plan[key] = value; return plan; }
  const out = {};
  for (const [k, v] of Object.entries(plan)) { if (k === 'scenes') out[key] = value; out[k] = v; }
  return out;
}
function setPath(plan, key, value) {
  const [p, c] = key.split('.');
  if (!c) return setTop(plan, p, value);
  return setTop(plan, p, { ...(isObj(plan[p]) ? plan[p] : {}), [c]: value });
}
function delPath(plan, key) {
  const [p, c] = key.split('.');
  if (!c) { delete plan[p]; return; }
  if (!isObj(plan[p])) return;
  delete plan[p][c];
  if (!Object.keys(plan[p]).length) delete plan[p];   // 空的 bed／outro 不留：{} 的意思和沒寫不一樣
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function applyPlan(project, { set = {}, unset = [] }, { templateDir = DEFAULT_TEMPLATE, plan: file = planFileOf(project) } = {}) {
  const c = context(templateDir, project);
  // 先全部檢查完，一個不對就整個不寫
  for (const k of unset) if (!KEYS[k] && !UNSET_ONLY.includes(k)) throw new Error(`✖ plan.json 沒有「${k}」這個設定可以拿掉 → 能寫的：${[...Object.keys(KEYS), ...UNSET_ONLY].join('、')}`);
  const raw = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  const vals = {};
  for (const [k, v] of Object.entries(set)) {
    if (!KEYS[k]) throw new Error(`✖ plan.json 沒有「${k}」這個設定可以寫 → 能寫的：${allowed(c)}`);
    const p = KEYS[k].parse(v, c);
    if (p === BAD) throw new Error(`✖ ${k} 不能是「${v}」→ 能寫的：${allowed(c, [k])}`);
    if (raw == null && !KEYS[k].early) throw new Error(`✖ 還沒有 plan.json，${k} 要等產生分鏡素材（build.mjs --scaffold）之後才能寫 → 能寫的：${allowed(c, Object.keys(KEYS).filter((x) => KEYS[x].early))}`);
    vals[k] = p;
  }
  let plan;
  if (raw == null) { if (!Object.keys(vals).length) return []; plan = { version: 1 }; }
  else {
    try { plan = JSON.parse(raw); } catch (e) { throw new Error(`✖ ${path.basename(file)} 不是合法的 JSON：${e.message} → 修好再跑（JSON 不能有註解、最後一項後面不能有逗號）`); }
    if (!isObj(plan)) throw new Error(`✖ ${path.basename(file)} 要是一個物件 { … } → 修好再跑`);
  }
  const changes = [];
  for (const k of unset) {
    const from = getPath(plan, k);
    if (from === undefined) continue;
    delPath(plan, k);
    changes.push({ key: k, from, to: undefined });
  }
  for (const [k, v] of Object.entries(vals)) {
    const from = getPath(plan, k);
    if (same(from, v)) continue;
    plan = setPath(plan, k, v);
    changes.push({ key: k, from, to: v });
  }
  // plan.json 的 bed 整個蓋過預設：只寫音量會把工作區預設的底樂關掉，這裡先補齊或擋下（outro 只寫音量照樣用工作區預設的曲名，033）
  if ('bed.volume' in vals && isObj(plan.bed) && plan.bed.music === undefined) {
    const dflt = readSettings(path.resolve(templateDir, '..')).data?.music?.bed;
    if (!dflt) throw new Error(`✖ 這一集還沒有底樂，bed.volume 沒有對象 → 能寫的：先寫 ${allowed(c, ['bed.music'])}，例 --set "bed.music=<曲名>;bed.volume=3"`);
    plan.bed = { music: dflt, ...plan.bed };
    changes.push({ key: 'bed.music', from: undefined, to: dflt });
  }
  if (!changes.length) return [];
  // 縮排、換行照原檔（和 build.mjs --autofix 寫回同一套）
  const indent = (raw?.match(/\n([ \t]+)"/) || [])[1] || '  ';
  const nl = raw?.includes('\r\n') ? '\r\n' : '\n';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeAtomic(file, `${JSON.stringify(plan, null, indent).replace(/\n/g, nl)}${nl}`);
  return changes;
}

export const setPlan = (project, pairs, opts = {}) => applyPlan(project, { set: pairs || {} }, opts);
export const unsetPlan = (project, keys, opts = {}) => applyPlan(project, { unset: [].concat(keys || []) }, opts);

const show = (v) => (v === undefined ? '沒寫' : v === null ? 'null（不配）' : typeof v === 'string' ? v : JSON.stringify(v));
export const changeLine = (c) => ok(c.to === undefined ? `plan.json：拿掉 ${c.key}（原本 ${show(c.from)}）` : `plan.json：${c.key}＝${show(c.to)}（原本 ${show(c.from)}）`);

export function planSetCmd(P, flags, { label }) {
  if (!P.project) { console.log(fail('--set／--unset 要指定專案', '加 --project projects/<專案>')); return 1; }
  const opts = { templateDir: P.templateDir, plan: P.plan };
  let changes;
  try {
    const set = flags.set ? parsePairs(flags.set) : {};
    const unset = flags.unset ? splitKeys(flags.unset) : [];
    if (!Object.keys(set).length && !unset.length) throw new Error(`✖ --set／--unset 後面沒有鍵 → 例 --set "theme=dark"、--unset "style"；能寫的：${allowed(context(P.templateDir, P.project))}`);
    changes = applyPlan(P.project, { set, unset }, opts);
  } catch (e) { console.log(e.message); return 1; }
  for (const c of changes) console.log(changeLine(c));
  if (!changes.length) { console.log('plan.json 沒有改（值和原本一樣）'); return 0; }
  const plan = readJson(P.plan) || {};
  const fmt = changes.find((c) => c.key === 'format');
  // 版式有兩個來源（plan.json、開工決策表），不一樣 build 會 ✖：決策表交給 status.mjs --init 改
  if (fmt) for (const l of next('開工決策表的「版式」跟著改', cmdLine('status.mjs', ['--project', label, '--init', '--format', plan.format || 'landscape']))) console.log(l);
  else if (Array.isArray(plan.scenes) && plan.scenes.length) for (const l of next('重跑 build，改的設定才會生效', cmdLine('build.mjs', ['--project', label]))) console.log(l);
  else for (const l of next('還沒有段落：設定先存著，之後 build 時生效；照專案進度往下', cmdLine('status.mjs', ['--project', label]))) console.log(l);
  return 0;
}

// ---------- --to-design：換成內容設計動畫（③ 勾選、修改單「重新設計」、revise 流程原本都要手改 plan.json） ----------

// 真的產生檔案的 build：底片要重新編碼時走背景工作，結束碼 75 就再等（和 lib/flow.mjs 的 buildTool 一樣；總等待有上限，lib/job.mjs）
const buildQuiet = (P, templateArg) => runToolUntilDoneSync(path.join(TOOLS, 'build.mjs'), ['--project', P.project, ...templateArg]);

export async function toDesignCmd(P, spec, { label, templateArg = [] }) {
  const F = await import('./flow.mjs');
  const { toDesign } = await import('./storyboard-gen.mjs');
  const { designFileOf, isBlankDesign } = await import('./custom-fill.mjs');
  const ids = [...new Set(String(spec ?? '').split(/[,，]/).map((s) => s.trim()).filter(Boolean))];
  if (!ids.length) { console.log(fail('--to-design 要寫段 id', '例 --to-design s05,s12（段 id 看 build.mjs --check 的報告）')); return 1; }
  const raw = fs.existsSync(P.plan) ? fs.readFileSync(P.plan, 'utf8') : '';
  let plan;
  try { plan = JSON.parse(raw); } catch (e) { console.log(fail(`plan.json 讀不到或不是合法的 JSON：${e.message}`, '修好再跑')); return 1; }
  if (!Array.isArray(plan?.scenes) || !plan.scenes.length) { console.log(fail('plan.json 還沒有段落', '先照分鏡流程合併草稿（build.mjs --merge-drafts）')); return 1; }
  const designsDir = path.join(P.project, 'work', 'designs');
  const notStarted = (s) => !fs.existsSync(path.join(designsDir, `${s.id}.md`)) && isBlankDesign(readOpt(path.join(P.out, designFileOf(s))));
  const conv = [], todo = [], bad = [];
  for (const id of ids) {
    const k = plan.scenes.findIndex((s) => s?.id === id), seg = plan.scenes[k];
    if (!seg) bad.push(fail(`plan.json 沒有「${id}」`, '段 id 看 build.mjs --check 的報告'));
    else if (seg.design) {
      // 不重做；上次換好、還沒派出去的（例：build 沒過）照樣派
      if (notStarted(seg)) { console.log(`${id} 已經是內容設計動畫（不重做）；還沒開始做，一起派工`); todo.push(id); }
      else console.log(`${id} 已經是內容設計動畫，不重做（要整段從空白重畫：build.mjs --project ${label} --design-canvas ${id} --reset）`);
    } else if (seg.type === 'media') bad.push(fail(`${id} 是插入素材（螢幕錄影／圖片），不能換成內容設計動畫`, '要換畫面就改 plan.json 那一段的 media，或請使用者決定拿掉這段'));
    else if (!seg.from || !seg.to) bad.push(fail(`${id} 沒有 from／to，換不成內容設計動畫`, '先補這一段的起訖句（from、to）再跑'));
    else conv.push(k);
  }
  if (bad.length) { for (const l of bad) console.log(l); return 1; }
  if (conv.length) {
    const { retireScript } = await import('./beat-source.mjs');
    for (const k of conv) {
      const seg = plan.scenes[k];
      // 032 B6：手改過的模板段有工具建的鏡位腳本（拍點正本）：重新設計要從空白想，先搬到 .old/，不然會被當成「腳本已經寫好」
      const old = retireScript(P, seg.id);
      if (old) console.log(`${seg.id} 原本的拍點表搬到 ${old}（重新設計從空白開始）`);
      // toDesign 讀 story.designIdea（③ 的候選才有）；直接指名的段用草稿的 idea／say 當構想，設計師可以推翻
      const story = { ...(seg.story || {}), designIdea: seg.story?.designIdea || seg.story?.idea || seg.story?.say || '' };
      plan.scenes[k] = toDesign({ ...seg, story });
      console.log(ok(`plan.json：${seg.id} 換成內容設計動畫（原本 ${seg.template || seg.scene || seg.fx || seg.type || '—'}）`));
      todo.push(seg.id);
    }
    const bak = F.backupPlan(P.plan, 'to-design');
    const indent = (raw.match(/\n([ \t]+)"/) || [])[1] || '  ', nl = raw.includes('\r\n') ? '\r\n' : '\n';
    writeAtomic(P.plan, `${JSON.stringify(plan, null, indent).replace(/\n/g, nl)}${nl}`);
    console.log(`（改之前的 plan.json 備份在 ${path.relative(process.cwd(), bak)}）`);
  }
  if (!todo.length) return 0;
  // 設計師照 brief 的畫布和段內秒數做；接手的人換了，驗收次數歸零（第一次 0 個 ✖ 不該就印「可以交件」）
  for (const b of F.ensureBriefs(P, plan)) console.log(`補寫 ${b.brief}`);
  F.resetRuns(P, todo);
  // 032 B6：分鏡表那幾段的動畫分鏡從正本重產（模板的拍換成「拍點正本」那一行，等設計師寫 work/designs/<段>.md）；
  // 使用者在網頁改到一半（dirty）就不寫，印一行
  const { refreshStoryboard } = await import('./beat-source.mjs');
  const rf = refreshStoryboard(P, plan, { only: todo });
  if (rf.skipped === 'dirty') console.log(rf.line);
  // 設計師（子代理）不跑 build：先 build，他們 audit 量到的才是新的畫面
  const b = buildQuiet(P, templateArg);
  if (b.status !== 0) {
    for (const l of `${b.stdout || ''}\n${b.stderr || ''}`.split('\n')) if (/^✖|Error/.test(l)) console.log(l);
    for (const l of next('照 ✖ 改 plan.json，再跑同一條（換好的段不會重換，會接著派工）', cmdLine('build.mjs', ['--project', label, '--to-design', todo.join(','), ...templateArg]))) console.log(l);
    return 1;
  }
  console.log(ok('build 好了（設計師驗收量的是新的畫面）'));
  // 派工那一行：和 --apply-storyboard 同一份（lib/flow.mjs dispatchLines；它也會記派工的那一刻，B5）
  for (const l of F.dispatchLines(P, todo)) console.log(l);
  // 回饋輪開著（修改單、改版）：做完用 versions.mjs finish 收；不然是分鏡之後的定稿
  const { openRound } = await import('../versions.mjs');
  if (openRound(P.project)) { console.log('全部回來後收這一輪（build、量、存版本）：'); console.log(cmdLine('versions.mjs', ['finish', '--project', label])); }
  else { console.log('全部回來後定稿：'); console.log(cmdLine('build.mjs', ['--project', label, '--review'])); }
  return 0;
}
