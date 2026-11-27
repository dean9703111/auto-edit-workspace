// 038 重點字幕（specs/038-caption-highlight）：plan.json 第一層 captionMarks 指到的幾則字幕用重點樣式（主色底、粗體），其他照整支的字幕樣式。
// 這一支不碰 ffmpeg、Chrome：欄位檢查與訊息、class 與 CSS、沒標時輸出不變、--set／--unset、增刪字幕時標記跟著走、剪輯台存檔、qc 不誤判。
// 剪輯台的開關（要瀏覽器）在 editor-caption-marks-ui.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lib, imp, makeSrt, tmpDir, TEMPLATE } from './helpers.mjs';

const C = await imp('lib/caption-style.mjs');
const CAPS = await imp('lib/captions.mjs');
const { buildCaptions } = CAPS;
const { resolvePlan, formatReport } = await imp('lib/plan.mjs');
const { parseSrt } = await imp('lib/srt.mjs');
const PS = await imp('lib/plan-set.mjs');
const S = await imp('editor/subtitles.mjs');
const W = await imp('editor/server/write.mjs');
const A = await imp('lib/rough/align.mjs');
const Q = await imp('qc.mjs');
const L = await lib();

const srt = makeSrt({ n: 12 });
const cues = parseSrt(srt);
const VD = 44;
const SCENES = [{ id: 's01', scene: 'concept', from: '#2', to: '#3e', slots: { text: '一般字卡' } }];
const run = (extra = {}, scenes = SCENES) => resolvePlan({ plan: { version: 1, speakerBox: [700, 200, 1220, 1000], scenes, ...extra }, cues, videoDur: VD, lib: L, outDir: os.tmpdir(), projectRel: 'projects/demo' });
const about = (list) => list.filter((m) => /captionMarks|重點字幕/.test(m));
const SET = 'node shared/template/tools/build.mjs --project projects/demo --set "captionMarks=#N,#N,#N"';

test('格式：["#6", "#7"] → [6, 7]（去重、照句號排）；不是陣列、不是 "#N" ✖，訊息寫怎麼改', () => {
  assert.deepEqual(C.parseCaptionMarks(['#13', '#6', '#7', '#6']), { marks: [6, 7, 13], words: [], errors: [] });
  assert.deepEqual(C.parseCaptionMarks(undefined), { marks: [], words: [], errors: [] });
  assert.deepEqual(C.parseCaptionMarks([]), { marks: [], words: [], errors: [] });
  assert.deepEqual(C.fmtCaptionMarks([6, 7, 13]), ['#6', '#7', '#13']);
  assert.equal(C.describeCaptionMarks([6, 7, 13]), '3 則（#6、#7、#13）');
  assert.equal(C.parseCaptionMarks('#6').errors[0], 'captionMarks 要寫成字幕句號的陣列，例 ["#6", "#7@關鍵詞", "#13"]（"#N"＝整則用重點樣式、"#N@詞"＝只有那幾個字），現在是 "#6"');
  assert.equal(C.parseCaptionMarks(['#6', 7, '6', '#0', '#6e']).errors[0], 'captionMarks 要寫成字幕句號的陣列，例 ["#6", "#7@關鍵詞", "#13"]（"#N"＝整則用重點樣式、"#N@詞"＝只有那幾個字），這幾個不是 "#N" 或 "#N@詞"：7、"6"、"#0"、"#6e"');
});

test('build：格式不對 ✖（問題 → 怎麼改）；句號不在字幕裡 ⚠ 並略過；resolvePlan 回傳整理好的句號、報告多一行', () => {
  const ok = run({ captionMarks: ['#6', '#2', '#6'] });
  assert.deepEqual(about(ok.errors), []);
  assert.deepEqual(ok.captionMarks, [2, 6]);
  assert.match(formatReport(ok, { videoDur: VD }), /^重點字幕：2 則（#2、#6）$/m);
  const bad = run({ captionMarks: '#6,#7' });
  assert.deepEqual(about(bad.errors), [`captionMarks 要寫成字幕句號的陣列，例 ["#6", "#7@關鍵詞", "#13"]（"#N"＝整則用重點樣式、"#N@詞"＝只有那幾個字），現在是 "#6,#7" → 改好，或刪掉這個欄位（＝都不標）；用指令寫比較不會錯：${SET}`]);
  assert.deepEqual(bad.captionMarks, []);
  const gone = run({ captionMarks: ['#2', '#40', '#41'] });
  assert.deepEqual(gone.captionMarks, [2]);
  assert.deepEqual(about(gone.warnings), ['captionMarks 的 #40、#41 不在字幕裡（字幕是 #1–#12），這幾則略過 → 從 captionMarks 拿掉，或換成現在的句號（剪輯台「字幕」分頁點「重點」會整份重寫）']);
  assert.deepEqual(about(run({ captionMarks: ['#99'] }).warnings).length, 1, '只有一則不在：也只有那一行（橫式不催）');
});

test('build：沒寫 captionMarks 時橫式什麼都不多（回傳空陣列、報告沒有那一行、沒有 ⚠）', () => {
  const res = run();
  assert.deepEqual(res.captionMarks, []);
  assert.deepEqual(about([...res.errors, ...res.warnings]), []);
  assert.doesNotMatch(formatReport(res, { videoDur: VD }), /重點字幕/);
});

test('build 的提醒：直式一則都沒標 ⚠（附 --set 指令，排了段落才提醒）；直式超過 6 則、連續超過 2 則各一行 ⚠', () => {
  const none = run({ format: 'portrait' });
  assert.deepEqual(about(none.warnings), [`直式還沒標重點字幕 → 照 style.md「重點字幕」挑 3–6 則（開場鉤子的關鍵句、每個要點的標題句、結論或金句、行動呼籲），跑 ${SET}（#N 換成那幾則的句號）；剪輯台「字幕」分頁也可以點「重點」`]);
  assert.deepEqual(about(run({ format: 'portrait' }, []).warnings), [], '還沒排段落（寫分鏡之前）不催');
  assert.deepEqual(about(run({ format: 'portrait', captionMarks: ['#1', '#5', '#9'] }).warnings), [], '標了 3 則、沒有連續：沒有提醒');
  const many = run({ format: 'portrait', captionMarks: ['#1', '#3', '#5', '#7', '#9', '#11', '#12'] });
  assert.deepEqual(about(many.warnings), [`重點字幕標了 7 則，直式一支最多 6 則（style.md「重點字幕」）→ 留最重要的 6 則：${SET}，或在剪輯台「字幕」分頁點掉`]);
  assert.deepEqual(about(run({ captionMarks: ['#1', '#3', '#5', '#7', '#9', '#11', '#12'] }).warnings), [], '橫式不限則數');
  const runs = run({ captionMarks: ['#2', '#3', '#4', '#8', '#9'] });
  assert.deepEqual(about(runs.warnings), [`重點字幕連續超過 2 則：#2–#4（3 則），整段都是重點就沒有重點 → 每一串留最多 2 則：${SET}，或在剪輯台「字幕」分頁點掉`]);
  assert.deepEqual(C.markRuns([2, 3, 4, 8, 9, 10, 11], cues), [[2, 3, 4], [8, 9, 10, 11]]);
});

test('剪輯台「檢查」分頁：重點字幕的提醒算作者自己改得掉的（不放進「給 AI 的細節」），連續太多的那一則帶句號可以點過去', async () => {
  const { groupIssues } = await imp('editor/issues.mjs');
  const none = about(run({ format: 'portrait' }).warnings), runs = about(run({ captionMarks: ['#2', '#3', '#4'] }).warnings);
  const many = about(run({ format: 'portrait', captionMarks: ['#1', '#3', '#5', '#7', '#9', '#11', '#12'] }).warnings);
  const G = groupIssues([], [...none, ...runs, ...many]);
  assert.deepEqual(G.author.map((g) => [g.key, g.title, g.raw.length]), [['marks-none', '短影片還沒標重點字幕', 1], ['marks-many', '重點字幕標太多或擠在一起', 2]]);
  assert.deepEqual(G.author[1].cues, [2, 4]);
  assert.deepEqual(G.ai, []);
});

const body = (html) => html.replace(/^<!-- auto-edit:.*\n/m, '');
test('畫面：標到的那幾則 div 多 class cg--em，其他一個字都不變；沒標（不給、空的）時輸出和以前逐位元相同', () => {
  const base = buildCaptions(cues, { duration: VD });
  assert.equal(buildCaptions(cues, { duration: VD, marks: null }).html, base.html);
  assert.equal(buildCaptions(cues, { duration: VD, marks: [] }).html, base.html);
  assert.doesNotMatch(base.html, /cg--em/);
  assert.deepEqual(base.marks, []);
  const em = buildCaptions(cues, { duration: VD, marks: [2, 7] });
  assert.deepEqual([...em.html.matchAll(/<div class="cg cg--em" id="cg-(\d+)"/g)].map((m) => Number(m[1])), [2, 7]);
  assert.equal((em.html.match(/<div class="cg" id="cg-/g) || []).length, 10);
  assert.equal(body(em.html).replaceAll(' cg--em', ''), body(base.html), '只多了 class：時間、文字、開關都一樣（同一時間只顯示一則、沒有進出場動畫）');
  assert.deepEqual(em.marks, [2, 7]);
  // 測試片段、直式、035 的整支樣式一起用也只多 class
  const st = { look: 'outline', font: 'wenkai', size: 84, weight: 400, lift: 0 };
  assert.equal(body(buildCaptions(cues, { duration: VD, style: st, marks: [2] }).html).replaceAll(' cg--em', ''), body(buildCaptions(cues, { duration: VD, style: st }).html));
  assert.deepEqual(buildCaptions(cues, { duration: 6, offset: 20, compId: 'captions-test', marks: [2, 7] }).marks, [7], '回傳畫面上真的有的那幾則');
});

test('CSS：cg--em 只換底板、字色、字重（主色底、--brand-ink、700），不寫字級、行高、內距、位置；outline／yellow 照樣有底、拿掉描邊；主色底的樣式改成 #111111 底白字', () => {
  const css = fs.readFileSync(path.join(TEMPLATE, 'kit', 'captions.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => [m[1].trim(), m[2].trim()]).filter(([sel]) => sel.includes('cg--em'));
  assert.equal(rules.length, 2);
  const [[sel, decl], [selBrand, declBrand]] = rules;
  assert.equal(sel, '.cg.cg--em > span, [data-cap] .cg.cg--em > span', '帶 [data-cap] 的那一個要蓋得過 035 每種樣式的規則');
  assert.match(decl, /background: var\(--brand\);/);
  assert.match(decl, /color: var\(--brand-ink\);/);
  assert.match(decl, /font-weight: 700;/);
  assert.match(decl, /font-synthesis: none;/, '字體沒有 700 時不做假粗體');
  assert.match(decl, /-webkit-text-stroke: 0;/, '白字黑框、黃字黑框的描邊拿掉');
  assert.equal(selBrand, '[data-cap="brand"] .cg.cg--em > span');
  assert.match(declBrand, /background: #111111; color: #FFFFFF;/);
  for (const d of [decl, declBrand]) assert.doesNotMatch(d, /font-size|line-height|padding|bottom|border-radius|white-space|font-family/, '其餘照一般字幕');
  // 這兩條要排在 035 的規則後面（同權重時後面的贏）
  assert.ok(css.indexOf('cg--em') > css.indexOf('[data-cap="brand"] .cg > span'));
});

test('字型檔：有重點字幕時，字體另外有 700 的檔（霞鶩文楷）一起帶；只有一般的字體不多帶', () => {
  const wk = { ...C.CAP_DEFAULT, font: 'wenkai' };
  assert.deepEqual(C.fontFiles(wk).map((x) => x.file), ['LXGWWenKaiTC-Regular.ttf'], '沒有重點字幕：和以前一樣');
  assert.deepEqual(C.fontFiles(wk, { bold: true }).map((x) => x.file), ['LXGWWenKaiTC-Regular.ttf', 'LXGWWenKaiTC-Bold.ttf']);
  assert.deepEqual(C.fontFiles({ ...wk, weight: 700 }, { bold: true }).map((x) => x.file), ['LXGWWenKaiTC-Bold.ttf']);
  assert.deepEqual(C.fontFiles({ ...C.CAP_DEFAULT, font: 'huninn' }, { bold: true }).map((x) => x.file), ['Huninn-Regular.ttf']);
  assert.deepEqual(C.fontFiles(C.CAP_DEFAULT, { bold: true }), [], '思源黑體是可變字型，本來就有 700');
  assert.equal(C.captionFontFace(wk, 'kit/fonts/', { bold: true }).split('\n').length, 2);
});

function project(t, plan) {
  const proj = path.join(tmpDir(t, 'caption-marks-'), 'projects', 'demo');
  const planFile = path.join(proj, 'work', 'hyperframes', 'plan.json');
  fs.mkdirSync(path.dirname(planFile), { recursive: true });
  if (plan) fs.writeFileSync(planFile, `${JSON.stringify(plan, null, 2)}\n`);
  return { proj, planFile, read: () => JSON.parse(fs.readFileSync(planFile, 'utf8')) };
}
test('--set "captionMarks=#6,#7,#13"：整份換掉、去重排序、放在 scenes 前面；寫錯 ✖；--unset 拿掉', (t) => {
  const p = project(t, { version: 1, scenes: [] });
  assert.deepEqual(PS.parsePairs('captionMarks=#6,#7,#13'), { captionMarks: '#6,#7,#13' });
  assert.deepEqual(PS.setPlan(p.proj, PS.parsePairs('captionMarks=#13, #6,#7,#6')), [{ key: 'captionMarks', from: undefined, to: ['#6', '#7', '#13'] }]);
  assert.deepEqual(Object.keys(p.read()), ['version', 'captionMarks', 'scenes']);
  assert.deepEqual(PS.setPlan(p.proj, { captionMarks: '6、7、13' }), [], '不寫 # 也收；值一樣就不寫');
  assert.deepEqual(PS.setPlan(p.proj, { captionMarks: '#2' }), [{ key: 'captionMarks', from: ['#6', '#7', '#13'], to: ['#2'] }]);
  assert.equal(PS.changeLine({ key: 'captionMarks', from: undefined, to: ['#6', '#7'] }), '✓ plan.json：captionMarks＝["#6","#7"]（原本 沒寫）');
  for (const v of ['', 'none', '#6e', '#0', '6.5', '#6x']) {
    assert.throws(() => PS.setPlan(p.proj, { captionMarks: v }), (e) => e.message.startsWith(`✖ captionMarks 不能是「${v}」→ 能寫的：captionMarks（字幕句號，逗號隔開，例 #6,#7@關鍵詞,#13`), `captionMarks=${v}`);
  }
  assert.deepEqual(p.read().captionMarks, ['#2'], '寫錯的不動檔案');
  assert.deepEqual(PS.unsetPlan(p.proj, ['captionMarks']), [{ key: 'captionMarks', from: ['#2'], to: undefined }]);
  assert.deepEqual(p.read(), { version: 1, scenes: [] });
  const q = project(t);
  assert.throws(() => PS.setPlan(q.proj, { captionMarks: '#1' }), /還沒有 plan\.json，captionMarks 要等產生分鏡素材/);
});

// 5 句：#N 起點 (N−1)×3.5＋1、長 3 秒、句間 0.5 秒
const five = () => [1, 2, 3, 4, 5].map((n) => ({ n, start: (n - 1) * 3.5 + 1, end: (n - 1) * 3.5 + 4, text: `第${n}句字幕的內容，示範用` }));
test('增刪字幕時標記跟著走：分割 → 兩半都是；合併 → 任一則是就是；刪除 → 拿掉；插入 → 後面順延', () => {
  const m = [2, 4];
  assert.deepEqual(S.remapMarks(m, { op: 'split', n: 2, at: 6 }, five()), [2, 3, 5], '分割第 2 句：兩半都是重點，後面 +1');
  assert.deepEqual(S.remapMarks(m, { op: 'split', n: 1, at: 2.5 }, five()), [3, 5], '分割前面的句子：順延');
  assert.deepEqual(S.remapMarks(m, { op: 'merge', n: 1 }, five()), [1, 3], '合併 1、2（後面那句是重點）：合併後是重點');
  assert.deepEqual(S.remapMarks(m, { op: 'merge', n: 2 }, five()), [2, 3], '合併 2、3（前面那句是重點）');
  assert.deepEqual(S.remapMarks([2, 3], { op: 'merge', n: 2 }, five()), [2], '兩句都是重點：合併後一則');
  assert.deepEqual(S.remapMarks(m, { op: 'merge', n: 4 }, five()), [2, 4]);
  assert.deepEqual(S.remapMarks(m, { op: 'delete', n: 2 }, five()), [3], '刪掉重點字幕：標記拿掉，後面 −1');
  assert.deepEqual(S.remapMarks(m, { op: 'delete', n: 3 }, five()), [2, 3]);
  assert.deepEqual(S.remapMarks(m, { op: 'insert', after: 2, start: 7.05, end: 7.45, text: '新' }, five()), [2, 5], '在第 2 句後插入：後面順延');
  assert.deepEqual(S.remapMarks(m, { op: 'insert', after: 0, start: 0.1, end: 0.9, text: '新' }, five()), [3, 5]);
  assert.equal(S.remapMarks(m, { op: 'set', n: 2, text: '改字' }, five()), m, '改字、改時間：不動（同一個陣列）');
  assert.equal(S.remapMarks(m, { op: 'insert', after: 5, start: 18.6, end: 19, text: '新' }, five()), m, '沒影響到的也回同一個陣列');
  assert.deepEqual(S.remapMarks([2, 9], { op: 'delete', n: 1 }, five()), [1, 9], '本來就不在字幕裡的句號不動');
});

test('remapPlan／replay：plan.json 的 captionMarks 和其他句號一起換；全部刪掉時拿掉欄位；格式不對的不動', () => {
  const plan = { version: 1, captionMarks: ['#2', '#4'], scenes: [{ id: 's01', scene: 'concept', from: '#4', to: '#4e', slots: { text: 'x' } }] };
  const sp = S.remapPlan(plan, { op: 'split', n: 2, at: 6 }, five());
  assert.deepEqual(sp.captionMarks, ['#2', '#3', '#5']);
  assert.equal(sp.scenes[0].from, '#5');
  assert.deepEqual(Object.keys(sp), ['version', 'captionMarks', 'scenes'], '欄位的位置不變');
  const r = S.replay(five(), plan, [{ op: 'merge', n: 1 }, { op: 'delete', n: 3, bind: 'prev' }], { videoDur: 20 });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.plan.captionMarks, ['#1'], '合併 1、2 → [1, 3]；刪掉第 3 句（原本的 #4）→ [1]');
  const none = S.remapPlan({ version: 1, captionMarks: ['#2'], scenes: [] }, { op: 'delete', n: 2 }, five());
  assert.equal('captionMarks' in none, false);
  const odd = { version: 1, captionMarks: ['#2', 7], scenes: [] };
  assert.equal(S.remapPlan(odd, { op: 'delete', n: 1 }, five()), odd);
  // 還沒排段落（只有字幕）也照換
  assert.deepEqual(S.remapPlan({ version: 1, captionMarks: ['#3'] }, { op: 'delete', n: 1 }, five()).captionMarks, ['#2']);
});

test('srt-align --remap-plan（照時間換句號）：拆開兩則都是、併起來也是、只微調起迄照舊、舊句號不在的拿掉', () => {
  const old = [{ n: 1, start: 0, end: 2 }, { n: 2, start: 2, end: 6 }, { n: 3, start: 6, end: 8 }, { n: 4, start: 8, end: 10 }];
  const split = [{ n: 1, start: 0, end: 2 }, { n: 2, start: 2, end: 4 }, { n: 3, start: 4, end: 6 }, { n: 4, start: 6, end: 8 }, { n: 5, start: 8, end: 10 }];
  assert.deepEqual(A.remapMarksByTime([2], old, split), [2, 3]);
  const merged = [{ n: 1, start: 0, end: 6 }, { n: 2, start: 6, end: 10 }];
  assert.deepEqual(A.remapMarksByTime([1], old, merged), [1], '短的那句是重點，併進長的：併完也是');
  assert.deepEqual(A.remapMarksByTime([3], old, merged), [2]);
  const nudged = [{ n: 1, start: 0, end: 2.2 }, { n: 2, start: 2.2, end: 5.9 }, { n: 3, start: 5.9, end: 8 }, { n: 4, start: 8, end: 10 }];
  assert.deepEqual(A.remapMarksByTime([2, 4], old, nudged), [2, 4]);
  assert.deepEqual(A.remapMarksByTime([9], old, nudged), []);
  const text = (c, i) => ({ ...c, text: `第${i + 1}句` });
  const out = A.remapPlanByTime({ version: 1, captionMarks: ['#2'], scenes: [] }, old.map(text), split.map(text));
  assert.deepEqual(out.plan.captionMarks, ['#2', '#3']);
  assert.equal('captionMarks' in A.remapPlanByTime({ version: 1, captionMarks: ['#9'], scenes: [] }, old.map(text), split.map(text)).plan, false);
});

const PLAN_TEXT = `{
  "version": 1,
  "captionMarks": ["#2", "#4"],
  "scenes": [
    { "id": "s01", "scene": "concept", "from": "#4", "to": "#4e", "slots": { "text": "一般字卡" } }
  ]
}
`;
test('剪輯台存檔（applySave）：只動 captionMarks 那一個鍵；送整份清單、不在字幕裡的不寫、空的拿掉欄位；格式不對擋下來', () => {
  const ctx = { srtText: srt, videoDur: VD };
  const a = W.applySave(PLAN_TEXT, { captionMarks: ['#7', '#2', '#99'] }, ctx);
  assert.deepEqual(a.errors, []);
  assert.equal(a.text, PLAN_TEXT.replace('["#2", "#4"]', '["#2", "#7"]'), '其他地方（排版）一個字都不動');
  assert.equal(W.applySave(PLAN_TEXT, { captionMarks: ['#4', '#2'] }, ctx).text, null, '沒變就不寫');
  const off = W.applySave(PLAN_TEXT, { captionMarks: [] }, ctx);
  assert.equal(off.text, PLAN_TEXT.replace('  "captionMarks": ["#2", "#4"],\n', ''));
  assert.equal('captionMarks' in off.plan, false);
  const fresh = W.applySave(PLAN_TEXT.replace('  "captionMarks": ["#2", "#4"],\n', ''), { captionMarks: ['#3'] }, ctx);
  assert.equal(fresh.text, PLAN_TEXT.replace('["#2", "#4"]', '["#3"]'), '原本沒有：插在 scenes（有 edit 就 edit）前面');
  assert.match(W.applySave(PLAN_TEXT, { captionMarks: [3] }, ctx).errors[0], /captionMarks 要寫成字幕句號的陣列/);
  assert.match(W.applySave(PLAN_TEXT, { captionMark: ['#3'] }, ctx).errors[0], /不能寫「captionMark」/);
});

test('剪輯台存檔：增刪字幕時 plan.json 的 captionMarks 一起換句號（頁面沒送清單也換）；頁面有送就照頁面的（新句號）', () => {
  const ctx = { srtText: srt, videoDur: VD };
  // 分割第 2 句（起點 4.5、長 3 秒）：#2 → #2、#3；#4 → #5
  const ops = [{ op: 'split', n: 2, at: 6, pos: 3 }];
  const a = W.applySave(PLAN_TEXT, { srt: { ops } }, ctx);
  assert.deepEqual(a.errors, []);
  assert.deepEqual(a.plan.captionMarks, ['#2', '#3', '#5']);
  assert.match(a.text, /"captionMarks": \["#2", "#3", "#5"\],\n {2}"scenes"/);
  assert.match(a.text, /"from": "#5", "to": "#5e"/);
  assert.equal(a.cues.length, 13);
  // 分割之後使用者又把後半（新的 #3）點掉：頁面送新句號的整份清單
  const b = W.applySave(PLAN_TEXT, { srt: { ops }, captionMarks: ['#2', '#5'] }, ctx);
  assert.deepEqual(b.plan.captionMarks, ['#2', '#5']);
  // 刪掉唯一的重點字幕：欄位拿掉
  const one = PLAN_TEXT.replace('["#2", "#4"]', '["#7"]');
  const c = W.applySave(one, { srt: { ops: [{ op: 'delete', n: 7 }] } }, ctx);
  assert.deepEqual(c.errors, []);
  assert.equal('captionMarks' in c.plan, false);
  assert.doesNotMatch(c.text, /captionMarks/);
});

test('驗收（qc final）：重點字幕另外一行；有套重點樣式、位置和一般字幕一樣 ✓；頁面上是一般樣式、位置不對 ⚠；沒燒字幕、沒量照實寫', () => {
  const marks = [6, 7, 13];
  const ok = Q.captionMarkChecks({ marks, burned: true, samples: [{ n: 6, text: '第一 先講結論', top: 956, bottom: 1074, em: true }, { n: 13, text: '記得訂閱', top: 957, bottom: 1073.5, em: true }] });
  assert.deepEqual(ok, [{ level: 'ok', text: '重點字幕 3 則（#6、#7、#13）：主色底的重點樣式，位置和一般字幕一樣（量 2 則：#6、#13）；字幕樣式的抽樣不含這幾則' }]);
  const stale = Q.captionMarkChecks({ marks, burned: true, samples: [{ n: 6, text: 'a', top: 956, bottom: 1074, em: false }] });
  assert.deepEqual(stale, [{ level: 'warn', text: '重點字幕 3 則（#6、#7、#13）：#6 在 build 好的頁面上是一般樣式，沒有套重點樣式 → 標完還沒重新產生：跑 build.mjs、重新 render 再驗收' }]);
  const moved = Q.captionMarkChecks({ marks, burned: true, samples: [{ n: 6, text: '第一 先講結論', top: 900, bottom: 1018, em: true }] });
  assert.equal(moved[0].level, 'warn');
  assert.match(moved[0].text, /#6「第一 先講結論」底板 y 900–1018，和一般字幕（y 956–1074 ± 4）不一樣/);
  assert.equal(Q.captionMarkChecks({ marks, burned: false, samples: null })[0].text, '重點字幕 3 則（#6、#7、#13）：這支沒有把字幕燒進影片，重點樣式不會出現（字幕檔只有字和時間）');
  assert.equal(Q.captionMarkChecks({ marks, burned: true, samples: null })[0].text, '重點字幕 3 則（#6、#7、#13）（沒量樣式）');
  assert.equal(Q.captionMarkChecks({ marks, burned: true, samples: [] })[0].level, 'warn');
  // 直式、035 換過位置的樣式：照那個樣式的底板位置比
  const lifted = Q.captionSpec(null, { ...C.CAP_DEFAULT, lift: 120 });
  assert.equal(Q.captionMarkChecks({ marks: [2], burned: true, samples: [{ n: 2, text: 'a', top: 836, bottom: 954, em: true }] }, lifted)[0].level, 'ok');
});

test('驗收：judge 只在有重點字幕時多那一行；字幕樣式的抽樣拿掉重點字幕（底板顏色不同會誤判）；captionMarksOf 讀 plan.json', (t) => {
  const p = project(t, { version: 1, captionMarks: ['#3', '#1', '#3'], scenes: [] });
  assert.deepEqual(Q.captionMarksOf({ plan: p.planFile }), [1, 3]);
  fs.writeFileSync(p.planFile, JSON.stringify({ version: 1, captionMarks: 'x' }));
  assert.deepEqual(Q.captionMarksOf({ plan: p.planFile }), [], '格式不對當成沒標（build 會報 ✖）');
  assert.deepEqual(Q.captionMarksOf({ plan: path.join(p.proj, 'nope.json') }), []);
  // 量字幕樣式抽哪幾則：先拿掉重點字幕再抽（finalCheck 的做法）
  const zh = Array.from({ length: 6 }, (_, i) => ({ n: i + 1, start: i * 2, end: i * 2 + 1.8, text: '這是一則中文字幕' }));
  const skip = new Set([2, 5]);
  assert.deepEqual(Q.captionSamples(zh.filter((c) => !skip.has(c.n))).map((c) => c.n), [1, 3, 4, 6]);
  const facts = { width: 1920, height: 1080, fps: 30, hasAudio: true, dur: 12, expected: 12, items: [], cuts: [], cues: zh };
  const keys = (f) => Q.judge(f).checks.map((c) => c.key);
  assert.ok(!keys(facts).includes('capmarks'));
  const withMarks = Q.judge({ ...facts, captionMarks: { marks: [2, 5], burned: true, samples: [{ n: 2, text: 'a', top: 956, bottom: 1074, em: true }] } });
  const line = withMarks.checks.find((c) => c.key === 'capmarks');
  assert.equal(line.level, 'ok');
  assert.match(line.text, /^重點字幕 2 則（#2、#5）/);
});

// ---------- 047 只標幾個字（"#N@詞"）----------

test('047 格式："#N@詞" 和 "#N" 寫在同一份；同一則又寫整則又寫幾個字 → 整則為準；重複的去掉；@ 後面空的 ✖；fmt 照句號排回一份', () => {
  const p = C.parseCaptionMarks(['#7@關鍵詞', '#6', '#3@字幕', '#3@內容', '#3@字幕', '#6@句']);
  assert.deepEqual(p, { marks: [6], words: [{ n: 3, word: '字幕' }, { n: 3, word: '內容' }, { n: 7, word: '關鍵詞' }], errors: [] });
  assert.deepEqual(C.fmtCaptionMarks(p.marks, p.words), ['#3@字幕', '#3@內容', '#6', '#7@關鍵詞']);
  assert.deepEqual(C.fmtCaptionMarks([6, 7]), ['#6', '#7'], '只有整則的寫法和以前一樣');
  assert.deepEqual(C.parseCaptionMarks(['#4@AI Coding']).words, [{ n: 4, word: 'AI Coding' }], '詞裡可以有空白');
  assert.match(C.parseCaptionMarks(['#6@', '#7@ ']).errors[0], /這幾個不是 "#N" 或 "#N@詞"："#6@"、"#7@ "$/);
  assert.equal(C.describeCaptionMarks([6], p.words), '1 則（#6）；只標幾個字 2 則（#3「字幕」、#3「內容」、#7「關鍵詞」）');
  assert.equal(C.describeCaptionMarks([], [{ n: 7, word: '關鍵詞' }]), '只標幾個字 1 則（#7「關鍵詞」）');
});

test('047 build：那幾個字要在那一則字幕裡（照抄原文），找不到 ⚠ 並略過；句號不在字幕裡照舊 ⚠；直式只標幾個字也算有標；報告多一段', () => {
  const ok = run({ captionMarks: ['#2@字幕', '#4', '#5@沒有的字', '#99@字幕'] });
  assert.deepEqual(ok.errors, []);
  assert.deepEqual([ok.captionMarks, ok.captionWords], [[4], [{ n: 2, word: '字幕' }]]);
  const w = about(ok.warnings);
  assert.equal(w.length, 2);
  assert.match(w[0], /^captionMarks 的 "#5@沒有的字"（第 5 則是「第 5 句字幕內容」）：字幕裡沒有這幾個字，略過 → @ 後面照抄那一則字幕裡的字（一字不差），或拿掉$/);
  assert.match(w[1], /^captionMarks 的 #99 不在字幕裡/);
  assert.match(formatReport(ok, { videoDur: VD }), /^重點字幕：1 則（#4）；只標幾個字 1 則（#2「字幕」）$/m);
  const V = { W: 1080, H: 1920, format: 'portrait' };
  const port = C.resolveCaptionMarks(['#2@字幕'], cues, { portrait: true, hasScenes: true });
  assert.deepEqual([port.words, port.warnings], [[{ n: 2, word: '字幕' }], []], '直式：只標幾個字也算標過，不催');
  void V;
});

test('047 畫面：那幾個字包成 <em class="cw">，那一則的 class、其他則、時間都不變；整則已經是重點的不包；文字照樣跳脫', () => {
  const base = buildCaptions(cues, { duration: VD });
  const w = buildCaptions(cues, { duration: VD, marks: [7], words: [{ n: 2, word: '字幕' }, { n: 2, word: '第 2 句' }, { n: 7, word: '內容' }] });
  assert.match(w.html, /<div class="cg" id="cg-2" style="opacity:0;visibility:hidden"><span><em class="cw">第 2 句字幕<\/em>內容<\/span><\/div>/, '緊鄰的兩個詞併成一塊');
  assert.match(w.html, /<div class="cg cg--em" id="cg-7" style="opacity:0;visibility:hidden"><span>第 7 句字幕內容<\/span><\/div>/, '整則是重點：裡面不再包');
  assert.equal(body(w.html).replaceAll(' cg--em', '').replaceAll('<em class="cw">', '').replaceAll('</em>', ''), body(base.html), '只多了標記');
  assert.deepEqual([w.marks, w.words], [[7], [2]]);
  assert.equal(buildCaptions(cues, { duration: VD, words: [] }).html, base.html, '空的＝和以前逐位元相同');
  const { markWords } = CAPS;
  assert.equal(markWords('A<B 與 C&D', ['B 與 C']), 'A&lt;<em class="cw">B 與 C</em>&amp;D');
  assert.equal(markWords('提示詞怎麼寫', ['提示詞', '示詞怎麼']), '<em class="cw">提示詞怎麼</em>寫', '重疊的併成一段');
  assert.equal(markWords('用對的人很少', ['很多']), '用對的人很少', '找不到就不包');
});

test('047 CSS：em.cw 和整則的重點同一套顏色（主色底、--brand-ink、700、不描邊），色塊大小用 em（跟著字級）；主色底的樣式改成 #111111 底白字', () => {
  const css = fs.readFileSync(path.join(TEMPLATE, 'kit', 'captions.css'), 'utf8');
  const rule = css.match(/\.cg > span > em\.cw \{([^}]*)\}/)[1];
  for (const d of ['display: inline-block', 'font-style: normal', 'background: var(--brand)', 'color: var(--brand-ink)', 'font-weight: 700', 'font-synthesis: none', '-webkit-text-stroke: 0', 'padding: 0.12em 0.06em', 'margin: -0.12em 0']) assert.ok(rule.includes(d), d);
  assert.doesNotMatch(rule, /font-size|line-height|\dpx/);
  assert.match(css, /\[data-cap="brand"\] \.cg > span > em\.cw \{ background: #111111; color: #FFFFFF; \}/);
});

test('047 --set：#N 和 #N@詞 一起寫，有 @ 的時候用逗號（或頓號）分開、詞裡可以有空白；整份換掉；寫錯 ✖', (t) => {
  const p = project(t, { version: 1, scenes: [] });
  assert.deepEqual(PS.setPlan(p.proj, { captionMarks: '#13, #6@AI Coding,7@關鍵詞、#2' }), [{ key: 'captionMarks', from: undefined, to: ['#2', '#6@AI Coding', '#7@關鍵詞', '#13'] }]);
  assert.deepEqual(PS.setPlan(p.proj, { captionMarks: '#6 #7 #13' }), [{ key: 'captionMarks', from: ['#2', '#6@AI Coding', '#7@關鍵詞', '#13'], to: ['#6', '#7', '#13'] }], '沒有 @ 時空白照舊可以分開');
  for (const v of ['#6@', '@詞', '#0@詞']) assert.throws(() => PS.setPlan(p.proj, { captionMarks: v }), /✖ captionMarks 不能是/, v);
  assert.deepEqual(p.read().captionMarks, ['#6', '#7', '#13']);
});

test('047 增刪字幕：只標幾個字的跟著文字走（分割跟到有那幾個字的那一半）、插入順延、合併併過去、刪掉那一句就拿掉；整則的照舊', () => {
  // five() 的第 2 句是「第2句字幕的內容，示範用」（12 個字）：pos 5 切成「第2句字幕」「的內容，示範用」
  const plan = { version: 1, captionMarks: ['#2', '#2@不算', '#2@示範', '#3@字幕', '#4'], scenes: [] };
  const sp = S.remapPlan({ version: 1, captionMarks: ['#2@示範', '#2@字幕', '#4'], scenes: [] }, { op: 'split', n: 2, at: 6, pos: 5 }, five());
  assert.deepEqual(sp.captionMarks, ['#2@字幕', '#3@示範', '#5']);
  assert.deepEqual(S.remapPlan(plan, { op: 'insert', after: 1, start: 4.05, end: 4.45, text: '新' }, five()).captionMarks, ['#3', '#3@不算', '#3@示範', '#4@字幕', '#5']);
  assert.deepEqual(S.remapPlan(plan, { op: 'merge', n: 2 }, five()).captionMarks, ['#2', '#2@不算', '#2@示範', '#2@字幕', '#3']);
  assert.deepEqual(S.remapPlan(plan, { op: 'delete', n: 3 }, five()).captionMarks, ['#2', '#2@不算', '#2@示範', '#3']);
  assert.equal(S.remapPlan(plan, { op: 'insert', after: 5, start: 18.6, end: 19, text: '新' }, five()), plan, '沒影響到的不動');
  assert.equal('captionMarks' in S.remapPlan({ version: 1, captionMarks: ['#2@字幕'], scenes: [] }, { op: 'delete', n: 2 }, five()), false);
  assert.deepEqual(S.remapWordMark({ n: 9, word: '字幕' }, { op: 'delete', n: 1 }, five()), { n: 9, word: '字幕' }, '本來就不在字幕裡的不動');
});

test('047 srt-align --remap-plan：只標幾個字的換到附近、文字裡有那幾個字的新字幕；找不到就拿掉', () => {
  const old = [{ n: 1, start: 0, end: 2, text: '開場白' }, { n: 2, start: 2, end: 6, text: '透過系統化的整理' }, { n: 3, start: 6, end: 8, text: '收尾' }];
  const split = [{ n: 1, start: 0, end: 2, text: '開場白' }, { n: 2, start: 2, end: 4, text: '透過系統化' }, { n: 3, start: 4, end: 6, text: '的整理' }, { n: 4, start: 6, end: 8, text: '收尾' }];
  assert.deepEqual(A.remapWordsByTime([{ n: 2, word: '系統化' }, { n: 2, word: '整理' }, { n: 3, word: '收尾' }], old, split), [{ n: 2, word: '系統化' }, { n: 3, word: '整理' }, { n: 4, word: '收尾' }]);
  assert.deepEqual(A.remapWordsByTime([{ n: 2, word: '系統化' }], old, split.map((c) => ({ ...c, text: '改過了' }))), []);
  const out = A.remapPlanByTime({ version: 1, captionMarks: ['#2@整理', '#3'], scenes: [] }, old, split);
  assert.deepEqual(out.plan.captionMarks, ['#3@整理', '#4']);
});

test('091 剪輯台存檔：頁面送整份清單（整則的和只標幾個字的），照頁面的寫；增刪字幕時一起換句號；不在字幕裡的不寫', () => {
  const ctx = { srtText: srt, videoDur: VD };
  const withWords = PLAN_TEXT.replace('["#2", "#4"]', '["#2", "#3@字幕", "#4"]');
  const a = W.applySave(withWords, { captionMarks: ['#7', '#2', '#3@字幕'] }, ctx);
  assert.deepEqual(a.errors, []);
  assert.deepEqual(a.plan.captionMarks, ['#2', '#3@字幕', '#7']);
  assert.equal(W.applySave(withWords, { captionMarks: ['#4', '#3@字幕', '#2'] }, ctx).text, null, '沒變就不寫');
  const drop = W.applySave(withWords, { captionMarks: ['#2', '#4'] }, ctx);
  assert.deepEqual(drop.plan.captionMarks, ['#2', '#4'], '頁面取消了 #3@字幕：拿掉');
  const add = W.applySave(withWords, { captionMarks: ['#2', '#3@字幕', '#4', '#4@4'] }, ctx);
  assert.deepEqual(add.plan.captionMarks, ['#2', '#3@字幕', '#4'], '同一則又寫整則又寫幾個字：整則為準');
  const off = W.applySave(withWords, { captionMarks: [] }, ctx);
  assert.equal('captionMarks' in off.plan, false, '都取消：欄位拿掉');
  // 分割第 2 句（pos 3）：頁面送新句號的整份清單
  const b = W.applySave(withWords, { srt: { ops: [{ op: 'split', n: 2, at: 6, pos: 3 }] }, captionMarks: ['#2', '#4@字幕', '#5'] }, ctx);
  assert.deepEqual(b.errors, []);
  assert.deepEqual(b.plan.captionMarks, ['#2', '#4@字幕', '#5']);
  // 頁面沒送 captionMarks（只有字幕操作）：檔案裡的照字幕操作換句號
  const c = W.applySave(withWords, { srt: { ops: [{ op: 'delete', n: 3 }] } }, ctx);
  assert.deepEqual(c.plan.captionMarks, ['#2', '#3'], '刪掉第 3 句：那一則的標記拿掉，#4 → #3');
  assert.deepEqual(W.applySave(withWords, { captionMarks: ['#2', '#99@字幕'] }, ctx).plan.captionMarks, ['#2'], '不在字幕裡的句號不寫');
});

test('047 驗收：只標幾個字的那幾則也不拿來量一般字幕的樣式；captionWordsOf 讀 plan.json', (t) => {
  const p = project(t, { version: 1, captionMarks: ['#2', '#3@字幕'], scenes: [] });
  assert.deepEqual(Q.captionMarksOf({ plan: path.join(p.proj, 'work', 'hyperframes', 'plan.json') }), [2]);
  assert.deepEqual(Q.captionWordsOf({ plan: path.join(p.proj, 'work', 'hyperframes', 'plan.json') }), [{ n: 3, word: '字幕' }]);
});

