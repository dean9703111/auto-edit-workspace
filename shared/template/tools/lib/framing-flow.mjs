// 停點 ② 構圖一條做完（032 A2）：build.mjs --framing、--framing-done。
// 原本是 look.mjs status／run → qc.mjs framing → editor.mjs → status.mjs --mark，回覆後再 status.mjs --mark → qc.mjs speaker --write → build.mjs --scaffold，
// 主代理要照 Skill 的表依回覆挑前置步驟（用建議的、倍率數字、改了瘦臉），弱模型常漏一步。零依賴。
//
//   framingCmd(P, flags, { label, scaffold })       → 結束碼；最後印回報段＋停點 ② 那兩行（沒有講者：印「不用構圖」、直接切章）
//   framingDoneCmd(P, flags, { label, scaffold })   → 結束碼（瘦臉還在背景跑：75，再跑同一條）；最後是 --scaffold 印的下一步
//                                                     （分鏡素材已經切好、構圖框沒變：不重切，只量講者框，下一步 status.mjs）
//   parseUse(v)                                     → { kind: 'editor'｜'suggested'｜'zoom', zoom }；看不懂丟 Error
//   scaffold：() => 結束碼（build.mjs 傳進來：runScaffold 要 build.mjs 的 loadLib 等函式，這裡不 import build.mjs，免得循環）
import fs from 'node:fs';
import path from 'node:path';
import { lookNextStep, ensureLook } from './look.mjs';
import { STOP, stopLines } from './stops.mjs';
import { ok, warn, fail, next, cmdLine, report } from './say.mjs';
import { saidOf } from './cli.mjs';
import { mainTry, stopLine } from './tries.mjs';
import { DEFAULT_WAIT, STILL_RUNNING } from './job.mjs';
import { lastStopOf } from './progress.mjs';
import { editorUrlsSync } from './editor-urls.mjs';

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tplArgs = (flags) => (flags.template ? ['--template', flags.template] : []);
// qc.mjs、status.mjs、look.mjs 都 import build.mjs：用到時才載入（build.mjs 自己也 import 這支）
const qc = () => import('../qc.mjs');
const status = () => import('../status.mjs');
const look = () => import('../look.mjs');
const STATUS = /^\s*[✓⚠✖]/;   // 工具的狀態行

export function parseUse(v) {
  if (v == null || v === true) return { kind: 'editor' };
  const s = String(v).trim();
  if (['suggested', 'suggest', '建議', '建議的'].includes(s)) return { kind: 'suggested' };
  const z = Number(s.replace(/\s*(x|X|倍)$/, ''));
  // 構圖分析只算 1–2 倍（qc.mjs framing 的 --zooms 同一個範圍）
  if (Number.isFinite(z) && z >= 1 && z <= 2) return { kind: 'zoom', zoom: z };
  throw new Error(`--use 只能是 suggested（用建議的）或 1–2 的倍率（例 1.15），現在是「${s}」→ 使用者說「調好了」就不要帶 --use`);
}

// 講者調光瘦臉：構圖台要看套好的樣子、講者框也要量套好的。過期就跑 look.mjs run；還在背景跑就等，等太久回 75（再跑同一條會接著等）
async function lookReady(P, flags, again) {
  const stepOf = () => lookNextStep({ projectDir: P.project, plan: readJson(P.plan) || {}, templateDir: P.templateDir });
  let ns = stepOf();
  if (ns.step === 'run' || ns.step === 'retry') {
    console.log(`講者瘦臉要先做：${ns.note}`);
    // 行程內跑 look.mjs run（它的 main 收 out），輸出先收著：look 自己最後印的下一步不能照印（下一步是這一條），
    // 所以做完只印狀態行（✓、⚠、✖：完成、偵測率太低、位移太大這些）；沒做完全部印（原因都在裡面）；還在跑只留 ⚠（卡住的提醒）
    const L = await look();
    const lines = [];
    const code = await L.main(['run', '--project', P.project, ...tplArgs(flags)], { out: (l) => lines.push(...String(l).split('\n')) });
    const shown = code === 0 ? lines.filter((l) => STATUS.test(l)) : code === STILL_RUNNING ? lines.filter((l) => /^\s*⚠/.test(l)) : lines;
    for (const l of shown) if (l.trim()) console.log(l);
    if (code === STILL_RUNNING) return still(P, again);
    if (code !== 0) { console.log(fail('講者瘦臉沒有做完', '照上面 look.mjs 印的 ✖ 做，再跑同一條')); return 1; }
    ns = stepOf();
  }
  if (ns.step === 'wait') {
    const waitSec = flags.wait != null ? Number(flags.wait) : DEFAULT_WAIT;
    const until = Date.now() + (Number.isFinite(waitSec) && waitSec >= 0 ? waitSec : DEFAULT_WAIT) * 1000;
    while (ns.step === 'wait' && Date.now() < until) { await sleep(2000); ns = stepOf(); }
    if (ns.step === 'wait') return still(P, again);
  }
  if (ns.step === 'retry') { console.log(fail(`講者瘦臉失敗了：${ns.note}`, '原因在 work/.look/run.log 最後幾行；再跑同一條會重做一次')); return 1; }
  if (ns.step === 'fix') { console.log(fail(ns.note, '改好再跑同一條')); return 1; }
  // 少偵測的檔或 Chrome：要使用者同意才下載（AGENTS.md 規則 3）；這次只調光，不擋構圖
  if (ns.step === 'ensure' || ns.step === 'chrome') console.log(warn(`這次先不瘦臉：${ns.note}`, ns.cmd));
  return 0;
}

function still(P, again) {
  console.log(`\n⏳ 講者瘦臉還在背景跑（背景繼續，不用重開；看進度：look.mjs status）`);
  for (const l of next('再跑一次同一條指令會接著等，不會重跑', again)) console.log(l);
  return STILL_RUNNING;
}

const countIn = (P, d, re) => { try { return fs.readdirSync(path.join(P.project, 'assets', d)).filter((f) => !f.startsWith('.') && re.test(f)).length; } catch { return 0; } };

// 開剪輯台拿「構圖」那一頁的網址（和 lib/flow.mjs 的 startEditor 同一個做法：沒開就在背景開，網址直接拿，不比對 editor.mjs 印的字）
function framingUrl(P, flags) {
  const u = editorUrlsSync(P.project, { template: flags.template });
  if (u?.framing) return u.framing;
  console.log(warn(`剪輯台沒有開起來（原因：單獨跑 ${cmdLine('editor.mjs', ['--project', path.relative(process.cwd(), P.project) || '.', ...tplArgs(flags)])} 看）`, '停點改請使用者看 work/構圖預覽.jpg，回「用建議的」或倍率'));
  return null;
}

async function audioOnly(P, flags, deps) {
  const S = await status();
  if (S.hasCamera(P.project)) return null;
  console.log(ok('只有聲音：不用構圖（沒有講者，不量講者框），直接產生分鏡素材'));
  return deps.scaffold();
}

// A4：連續沒過幾次由工具數（還在跑的 75 不算）
function finish(P, code, what) {
  if (code === STILL_RUNNING || !P.project) return code;
  const t = mainTry(P.project, 'framing', code === 0);
  if (t.stop) console.log(stopLine(t.n, what));
  return code;
}

export async function framingCmd(P, flags, deps) {
  const again = cmdLine('build.mjs', ['--project', deps.label, '--framing', ...tplArgs(flags)]);
  let code;
  try { code = await framingRun(P, flags, deps, again); } catch (e) { console.log(String(e.message).startsWith('✖') ? e.message : fail(e.message)); code = 1; }
  return finish(P, code, 'build.mjs --framing ');
}

async function framingRun(P, flags, deps, again) {
  if (!P.project) throw new Error('--framing 要指定專案 → 加 --project projects/<專案>');
  const pure = await audioOnly(P, flags, deps);
  if (pure != null) return pure;
  const lk = await lookReady(P, flags, again);
  if (lk !== 0) return lk;
  const Q = await qc();
  const r = Q.framingPreview(P, { format: flags.format });
  for (const l of Q.framingLines(P, r)) console.log(l);
  const url = framingUrl(P, flags);
  // 構圖台網址開好才記待回覆（工具記，不用 AI 另外跑 status.mjs --mark）
  const S = await status();
  S.markStop(P.project, { stop: STOP.framing, state: '待回覆' });
  const plan = readJson(P.plan) || {};
  const lookLine = ensureLook({ projectDir: P.project, plan, templateDir: P.templateDir, strict: false }).report.join('；');
  const nScreen = countIn(P, 'screen', /\.(mp4|mov|m4v|webm|mkv)$/i), nImage = countIn(P, 'images', /\.(jpe?g|png|webp|heic)$/i);
  const todo = nScreen || nImage ? S.inventoryTodo(P.project).length : 0;
  const assets = nScreen || nImage
    ? `素材盤點：${nScreen} 支錄影、${nImage} 張圖${todo ? `（${todo} 個還沒有筆記：media.mjs scan，照 auto-edit-screen 步驟 1 派子代理寫，不用等使用者）` : ''}`
    : '素材盤點：沒有螢幕錄影和圖片';
  const look = fs.existsSync(path.join(P.project, 'work', 'look-preview.jpg'));
  console.log('');
  for (const l of report([`構圖台開好了：建議 ${Q.suggestionText(r)}`, lookLine, assets], { stop: stopLines.framing(url || 'work/構圖預覽.jpg', { look }) })) console.log(l);
  return 0;
}

export async function framingDoneCmd(P, flags, deps) {
  let use;
  try { use = parseUse(flags.use); } catch (e) { console.log(fail(e.message)); return finish(P, 1, 'build.mjs --framing-done '); }
  const said = saidOf(flags);
  const again = cmdLine('build.mjs', ['--project', deps.label, '--framing-done', ...(use.kind === 'editor' ? [] : ['--use', String(flags.use)]), ...(said ? ['--said', said] : []), ...tplArgs(flags)]);
  let code;
  try { code = await framingDoneRun(P, flags, deps, { use, said, again }); } catch (e) { console.log(String(e.message).startsWith('✖') ? e.message : fail(e.message)); code = 1; }
  return finish(P, code, 'build.mjs --framing-done ');
}

async function framingDoneRun(P, flags, deps, { use, said, again }) {
  if (!P.project) throw new Error('--framing-done 要指定專案 → 加 --project projects/<專案>');
  const pure = await audioOnly(P, flags, deps);
  if (pure != null) return pure;
  const Q = await qc(), S = await status();
  // 1. 構圖：「調好了」構圖台已經存進 plan.json；「用建議的」、倍率數字由這裡寫 frame
  const before = readJson(P.plan)?.frame ?? null;
  if (use.kind === 'editor') console.log(ok(`構圖：照構圖台存的（${before ? `frame [${before.join(', ')}]` : '不裁切'}）`));
  else {
    const r = Q.framingAnalysis(P, { format: flags.format, ...(use.kind === 'zoom' ? { zooms: String(use.zoom) } : {}) });
    const pickOne = use.kind === 'zoom' ? { ...r, suggestion: { zoom: r.cands[0].zoom } } : r;
    const w = Q.writeFrame(P, pickOne);
    console.log(ok(w.frame ? `plan.json 的 frame → [${w.frame.join(', ')}]（${w.zoom.toFixed(2)}x；${use.kind === 'zoom' ? '使用者指定的倍率' : '建議倍率'}）` : `構圖：不裁切（${use.kind === 'zoom' ? '使用者指定 1 倍' : '建議 1.00x'}）：plan.json 不寫 frame`));
  }
  const after = readJson(P.plan)?.frame ?? null;
  // 2. 記 ② 通過（開工決策表的「構圖」跟著填）。② 最後一筆已經是通過（或略過）就不再記，帶了 --said 也一樣：
  //    再跑同一條（瘦臉還在跑回 75 之後）、分鏡階段只缺講者框時 ② 閘門叫它來量（032）
  const st = lastStopOf(P.project, STOP.framing)?.state;
  if (!['通過', '略過'].includes(st)) S.markStop(P.project, { stop: STOP.framing, state: '通過', said, back: 'plan.json frame' });
  // 3. 瘦臉過期（使用者在構圖台改了瘦臉）就先跑；還在背景跑回 75
  const lk = await lookReady(P, flags, again);
  if (lk !== 0) return lk;
  // 4. 量講者框（套好構圖與 look 之後）；構圖框換了（這一次 --use 寫的，或和切分鏡素材那時的不一樣），舊的 speakerBox 是舊框的座標，重量
  const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const cut = packFrame(P);
  const moved = !same(before, after) || (cut !== undefined && !same(cut, after));
  const sm = Q.speakerMaps(P, { format: flags.format });
  const w = Q.writeSpeakerBox(P, sm.suggest, { force: moved });
  for (const l of Q.speakerWriteLines(P, w)) console.log(l);
  if (w.reason === 'none') return 1;
  // 5. 切章（--scaffold 印的下一步就是這一條的下一步）。分鏡素材已經切好、構圖框沒變就不重切：
  //    重切會重寫分鏡素材、印「寫語意地圖」那一步，分鏡階段跑這一條不該有這種副作用（032）
  if (fs.existsSync(path.join(packDir(P), 'index.json')) && !moved) {
    console.log(ok('分鏡素材已經切好、構圖框沒變：不重切章（work/分鏡素材/ 沒動）'));
    for (const l of next('接著做原本那一步；不確定做到哪就跑這一條', cmdLine('status.mjs', ['--project', deps.label]))) console.log(l);
    return 0;
  }
  console.log('');
  return deps.scaffold();
}

const packDir = (P) => path.join(P.project, 'work', '分鏡素材');
// 切分鏡素材那時的構圖框：共用.md「構圖：」那一行（lib/scaffold.mjs 寫的）。null＝不裁切；讀不到回 undefined（只比這一次有沒有改框）
function packFrame(P) {
  let md;
  try { md = fs.readFileSync(path.join(packDir(P), '共用.md'), 'utf8'); } catch { return undefined; }
  const v = md.match(/；構圖：(.+)$/m)?.[1]?.trim();
  if (v == null) return undefined;
  if (v === '不裁切') return null;
  try { return JSON.parse(v); } catch { return undefined; }
}
