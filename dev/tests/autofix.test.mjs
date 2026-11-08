// 產生時自動修（lib/autofix.mjs、build.mjs --autofix）：工具知道答案的 ⚠／✖ 一處一處試、重跑檢查，沒變好就退回；
// --merge-drafts 寫完 plan.json 自動跑；剪輯台用的 --check／build 不跑（使用者改的時間要算數）；蓋到講者只在擋到臉或蓋住四成以上才報
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { lib, imp, TOOLS, TEMPLATE } from './helpers.mjs';

const { resolvePlan } = await imp('lib/plan.mjs');
const { autofixPlan, summaryLines, shiftTime, issueKey } = await imp('lib/autofix.mjs');
const R = await imp('lib/audit-rules.mjs');
const L = await lib();
const r3 = (x) => Math.round(x * 1000) / 1000;

// 8 句、每句 3 秒、句間 0.5 秒（#N 起點＝1＋(N−1)×3.5）；詞級逐字稿一個字一個詞、平均分配（#N@詞 用得到真的秒數）
const TEXTS = ['大家好我是講者', '今天來聊剪輯工作流程', '我們先安裝工具再開始', '接著設定專案資料夾', '然後匯入素材檔案', '最後輸出完成影片', '謝謝大家收看', '我們下次見'];
function mkCues({ words = true } = {}) {
  const cues = TEXTS.map((text, i) => ({ n: i + 1, start: r3(1 + i * 3.5), end: r3(4 + i * 3.5), text }));
  if (words) {
    const w = [];
    for (const c of cues) { const chs = [...c.text]; const d = (c.end - c.start) / chs.length; chs.forEach((ch, k) => w.push({ text: ch, start: r3(c.start + k * d), end: r3(c.start + (k + 1) * d) })); }
    cues.words = w;
  } else cues.wordsWhy = '沒有 work/transcript.json（rough.mp4 的詞級逐字稿）';
  cues.approx = new Set();
  return cues;
}
const mkCheck = (cues, VD = 30) => (plan) => { cues.approx = new Set(); const res = resolvePlan({ plan, cues, videoDur: VD, lib: L, outDir: os.tmpdir() }); return { errors: res.errors, warnings: res.warnings, res }; };
const SB = [572, 118, 1398, 904];   // EP1 的講者框：模板固定的版位只壓到下半身
const P = (scenes, extra = {}) => ({ version: 1, speakerBox: SB, scenes, ...extra });
const seg = (plan, id) => plan.scenes.find((s) => s.id === id);
const fix = (plan, opts, cues = mkCues()) => { const check = mkCheck(cues); return { ...autofixPlan(plan, check, opts), before: check(plan) }; };
const has = (list, re) => list.some((w) => re.test(w));

test('shiftTime：時間寫法往後挪，句號、@詞、秒數都保留寫法', () => {
  assert.equal(shiftTime('#49e', 0.25), '#49e+0.25');
  assert.equal(shiftTime('#407+0.3', 0.1), '#407+0.4');
  assert.equal(shiftTime('#130@這次會裝', 0.3), '#130@這次會裝+0.3');
  assert.equal(shiftTime('#94', -0.25), '#94-0.25');
  assert.equal(shiftTime('#5+0.1', -0.1), '#5');
  assert.equal(shiftTime(12.5, 0.25), 12.75);
  assert.equal(shiftTime('+1.2', 1), null, '+x 是段內時間，from／to 不能用');
  assert.equal(issueKey('[s0301 fs-list] 最後一個內容在第 5.56s，到退場只停 1.26s'), '[s0301 fs-list] 最後一個內容在第 #s，到退場只停 #s');
});

test('文字對時：from（前一段 0 秒相接一起改）、清單 at、beats 都寫 #N@詞；講到的秒數用估的不改', () => {
  const plan = P([
    { id: 's00', scene: 'concept', from: '#1', to: '#2', slots: { text: '開場白一句' } },
    { id: 's01', scene: 'concept', from: '#2', to: '#3', slots: { text: '一般說明文字' } },
    { id: 's02', scene: 'fs-list', from: '#3', to: '#5e', slots: { title: '安裝工具', items: ['甲乙丙丁', '戊己庚辛', { text: '匯入素材', at: '#5' }] } },
    { id: 's03', scene: 'key-point', from: '#5e', to: '#8e', slots: { lead: '最後一步', key: '完成影片' } },
  ]);
  const r = fix(plan);
  const sync = (x) => [...x.errors, ...x.warnings].filter((w) => w.startsWith('文字對時：'));
  assert.equal(sync(r.before).length, 3, sync(r.before).join('\n'));
  assert.ok(r.before.errors.some((e) => e.startsWith('文字對時：s03 的 key')), '差 1.85 秒是 ✖，也照修');
  assert.equal(seg(r.plan, 's02').from, '#3@安裝工具');
  assert.equal(seg(r.plan, 's01').to, '#3@安裝工具', '前一段原本 0 秒相接：to 一起改');
  assert.equal(seg(r.plan, 's02').slots.items[2].at, '#5@匯入素材');
  assert.equal(seg(r.plan, 's03').beats.keyAt, '#6@完成影片');
  assert.deepEqual(sync(r.result), []);
  assert.deepEqual(r.result.errors, []);
  assert.equal(r.fixes.filter((f) => f.kind === 'textSync').length, 3);
  assert.equal(seg(plan, 's02').from, '#3', '傳進來的 plan 不改');
  assert.match(summaryLines(r.fixes)[0], /^自動修好 3 處：文字對時 3$/);
  // 沒有詞級逐字稿：講到的秒數是用字數估的（可能差 1 秒），不自動改
  const est = fix(plan, {}, mkCues({ words: false }));
  assert.equal(sync(est.before).length, 3);
  assert.equal(est.fixes.filter((f) => f.kind === 'textSync').length, 0);
});

test('from 換到別句：anchor 不在新的那一句就換成那一句的開頭', () => {
  const plan = P([
    { id: 's01', scene: 'fs-list', from: '#4', to: '#5e', anchor: '接著設定', slots: { title: '安裝工具', items: ['甲乙丙丁', '戊己庚辛', '壬癸子丑'] } },
  ]);
  // 標題在 #4 開頭出現，「安裝工具」在 #3 就講了（晚了 3.6 秒）：整段挪到 #3@安裝工具，anchor 跟著換
  const r = fix(plan);
  assert.equal(seg(r.plan, 's01').from, '#3@安裝工具');
  assert.equal(seg(r.plan, 's01').anchor, '我們先安裝工具再');
  assert.ok(!has(r.result.warnings, /anchor/), r.result.warnings.join('\n'));
});

test('重疊 ≤ 0.5s：前一段的 to 改成後一段的 from；前一段有最短長度就改後一段的 from', () => {
  const a = fix(P([
    { id: 's01', scene: 'keywords', from: '#1', to: '#3+0.3', slots: { items: ['甲乙', '丙丁'] } },
    { id: 's02', scene: 'concept', from: '#3', to: '#8e', slots: { text: '一般說明文字' } },
  ]));
  assert.ok(has(a.before.warnings, /^\[s02 concept\] 和 s01 時間重疊 0\.3s/));
  assert.equal(seg(a.plan, 's01').to, '#3');
  assert.ok(!has(a.result.warnings, /時間重疊/));
  // 14 講者介紹最短 4.5 秒：縮 to 會 ✖ → 退回，改把後一段的 from 接在它的結尾
  const b = fix(P([
    { id: 's01', scene: 'speaker', from: '#1', to: '#2+1', slots: { name: '甲乙', titles: [{ text: '丙丁' }] } },
    { id: 's02', scene: 'keywords', from: '#2+0.6', to: '#8e', slots: { items: ['甲乙', '丙丁'] } },
  ]));
  assert.equal(seg(b.plan, 's01').to, '#2+1');
  assert.equal(seg(b.plan, 's02').from, '#2+1');
  assert.deepEqual(b.result.errors, []);
});

test('清單第一項比標題早：拿掉那個 at（用預設）', () => {
  const r = fix(P([{ id: 's01', scene: 'side-panel', from: '#1', to: '#8e', slots: { title: '甲乙丙丁', items: [{ text: '甲乙丙丁', at: '+0.3' }, '戊己庚辛', '壬癸子丑'] } }]));
  assert.ok(has(r.before.warnings, /slots\.items\[0\]\.at：第 0\.3s 出現，比 beats\.head/));
  assert.deepEqual(seg(r.plan, 's01').slots.items[0], { text: '甲乙丙丁' });
  assert.ok(!has(r.result.warnings, /還早，會在標題前冒出來/));
});

test('停留太短：後面有空就延 to；後一段 0 秒相接就連它的 from 一起延；延了會把下一張卡藏在幕底下就不修', () => {
  const items = [{ text: '甲乙丙丁', at: '+5' }, { text: '戊己庚辛', at: '+5' }, { text: '壬癸子丑', at: '+5' }];
  const a = fix(P([{ id: 's01', scene: 'fs-list', from: '#2', to: '#3e', slots: { title: '甲乙丙', items } }]));
  assert.ok(has(a.before.warnings, /^\[s01 fs-list\] 最後一個內容在第 5s，到退場只停 1\.2s，建議 ≥ 1\.5s/), a.before.warnings.join('\n'));
  assert.equal(seg(a.plan, 's01').to, '#3e+0.3');
  assert.ok(!has(a.result.warnings, /到退場只停/));
  const b = fix(P([
    { id: 's01', scene: 'fs-list', from: '#2', to: '#3e', slots: { title: '甲乙丙', items } },
    { id: 's02', scene: 'concept', from: '#3e', to: '#8e', slots: { text: '一般說明文字' } },
  ]));
  assert.equal(seg(b.plan, 's01').to, '#3e+0.3');
  assert.equal(seg(b.plan, 's02').from, '#3e+0.3', '後一段 0 秒相接：from 一起延');
  // 只延 to、不挪後一段（不透明幕壓到透明字卡的開頭）：verify 的「被幕蓋住」會擋下來
  const plan = P([
    { id: 's01', scene: 'fs-list', from: '#2', to: '#3e', slots: { title: '甲乙丙', items } },
    { id: 's02', scene: 'key-point', from: '#3e', to: '#8e', slots: { lead: '甲乙丙', key: '丁戊己' } },
  ]);
  const check = mkCheck(mkCues());
  const base = check(plan);
  const pushed = structuredClone(plan);
  seg(pushed, 's01').to = '#3e+0.3';
  const after = check(pushed);
  const hidden = (res) => res.items.filter((t) => !t.opaque).reduce((s, t) => s + Math.max(0, ...res.items.filter((x) => x.opaque && x.start <= t.start && x.end > t.start).map((x) => Math.min(x.end, t.end) - t.start)), 0);
  assert.ok(hidden(after.res) > hidden(base.res), '延 to 會蓋住下一張字卡的開頭');
  const r = autofixPlan(plan, check, {});
  assert.ok(!(seg(r.plan, 's01').to === '#3e+0.3' && seg(r.plan, 's02').from === '#3e'), '不能只延 to');
});

test('空檔：講者會閃一下、≤ 3 秒的沒有畫面的區間接起來；空檔裡有章節角標、rhythm spaced、超過 3 秒的不修', () => {
  const flash = fix(P([
    { id: 's01', scene: 'concept', from: '#1', to: '#2e', slots: { text: '一般說明文字' } },
    { id: 's02', scene: 'concept', from: '#3', to: '#8e', slots: { text: '另一段說明' } },
  ]));
  assert.ok(has(flash.before.warnings, /講者會閃一下/));
  assert.equal(seg(flash.plan, 's01').to, '#3');
  const two = [
    { id: 's01', scene: 'concept', from: '#1', to: '#2e', slots: { text: '一般說明文字' } },
    { id: 's02', scene: 'concept', from: '#3+2', to: '#8e', slots: { text: '另一段說明' } },
  ];
  const gap = fix(P(two));
  assert.ok(has(gap.before.warnings, /^沒有畫面的區間共 1 段、2\.50s/));
  assert.equal(seg(gap.plan, 's01').to, '#3+2');
  assert.ok(!has(gap.result.warnings, /沒有畫面的區間/));
  assert.equal(fix(P(two, { rhythm: 'spaced' })).fixes.length, 0, 'spaced＝刻意留露臉空檔');
  const tagged = fix(P([two[0], { id: 'c1', scene: 'chapter-tag', from: '#2e', to: '#3e', slots: { num: '01', name: '開始' } }, two[1]]));
  assert.equal(tagged.fixes.length, 0, '章節角標那段本來就讓講者露臉');
  const far = fix(P([two[0], { ...two[1], from: '#4' }]));
  assert.ok(has(far.before.warnings, /^沒有畫面的區間共 1 段、4\.00s/));
  assert.equal(far.fixes.filter((f) => f.kind === 'gap').length, 0, '超過 3 秒要人決定補什麼');
});

test('音效太密：拿掉最不重要、最後面的那顆（寫 "sfx": null）；keepSfx 的段不動', () => {
  const plan = P([
    { id: 's01', scene: 'concept', from: '#1', to: '#3', slots: { text: '一般說明文字' }, sfx: { name: 'success', at: '#2' } },
    { id: 's02', scene: 'keywords', from: '#3', to: '#5', slots: { items: ['甲乙', '丙丁'] }, sfx: { name: 'ding', at: '#4' } },
    { id: 's03', scene: 'concept', from: '#5', to: '#8e', slots: { text: '第三段說明' }, sfx: { name: 'alert', at: '#6' } },
  ]);
  const r = fix(plan);
  assert.ok(has(r.before.warnings, /^音效密度：1 個一分鐘超過 2 顆主音效/));
  assert.equal(seg(r.plan, 's02').sfx, null, 'ding 不在保留名單，先拿掉');
  assert.deepEqual(seg(r.plan, 's01').sfx, { name: 'success', at: '#2' });
  assert.ok(!has(r.result.warnings, /^音效密度/));
  const kept = fix(plan, { keepSfx: ['s02'] });
  assert.deepEqual(seg(kept.plan, 's02').sfx, { name: 'ding', at: '#4' });
  assert.equal(seg(kept.plan, 's01').sfx, null, '保留名單裡 success 比 alert 先拿掉');
});

test('驗證不過就退回：改了會多出提醒的修法不留；only 以外的段不動', () => {
  const plan = P([{ id: 's01', scene: 'fs-list', from: '#2', to: '#3e', slots: { title: '甲乙丙', items: [{ text: '甲乙丙丁', at: '+5' }, '戊己庚辛', '壬癸子丑'] } }]);
  const cues = mkCues(), inner = mkCheck(cues);
  // 假裝 to 一改就冒出一則新的 ⚠（例：壓到別段）→ 停留太短的修法要退回
  const check = (pl) => { const r = inner(pl); if (seg(pl, 's01').to !== '#3e') r.warnings = [...r.warnings, '[s09 concept] 新冒出來的提醒']; return r; };
  const r = autofixPlan(plan, check, {});
  assert.deepEqual(r.fixes, []);
  assert.equal(seg(r.plan, 's01').to, '#3e');
  assert.ok(r.tried >= 1, '有試過');
  const only = autofixPlan(plan, inner, { only: ['s99'] });
  assert.deepEqual(only.fixes, []);
  assert.equal(autofixPlan(plan, inner, { only: ['s01'] }).fixes.length, 1);
});

test('蓋到講者：模板只壓到講者框下半身不報；蓋到臉的位置、或蓋住四成以上才報（build 與 audit 同門檻）', () => {
  const run = (speakerBox, scene = 'concept', slots = { text: '一般說明文字' }) => resolvePlan({ plan: { version: 1, speakerBox, scenes: [{ id: 's01', scene, from: '#2', to: '#4e', slots }] }, cues: mkCues(), videoDur: 30, lib: L, outDir: os.tmpdir() }).warnings.filter((w) => w.includes('蓋到講者框'));
  assert.deepEqual(run(SB), [], 'EP1：下方字卡壓到講者框 22%，只到身體');
  const face = run([400, 500, 1100, 1080]);
  assert.equal(face.length, 1);
  assert.match(face[0], /^\[s01 concept\] 「一般字卡」大約會蓋到講者框 \d+%，臉的位置也蓋到 \d+% → /);
  const big = run(SB, 'summary', { text: '一般說明文字' });
  assert.equal(big.length, 1);
  assert.match(big[0], /大約會蓋到講者框 41%（超過四成，手勢多半會被擋）/);
  // faceZone：框上緣往下約三成、中間一段
  assert.deepEqual(R.faceZone(SB).map(Math.round), [733, 118, 1237, 410]);
  assert.equal(R.coverWarn(0.22, 0), false);
  assert.equal(R.coverWarn(0.41, 0), true);
  assert.equal(R.coverWarn(0.05, 0.2), true);
  assert.equal(R.coverWarn(0.03, 0, R.SPEAKER_WARN), true, 'custom 與 css 移位的段照舊 ≥ 2% 就報');
});

test('audit 壓到講者：模板段只壓到身體不報、壓到臉要報', () => {
  // 量測資料的形狀同 audit.test.mjs
  const el = (o) => ({ i: 0, tag: 'div', desc: { id: 'card', cls: '', text: '', near: '' }, rect: o.rect, inner: o.rect, text: false, textRect: null, inkRect: null, fontSize: 52, scale: 1, whiteSpace: 'normal',
    painted: true, box: false, media: false, full: false, bg: false, shaped: false, clipX: false, clipY: false, sw: 0, cw: 0, sh: 0, ch: 0, constraint: -1, clips: [], parent: -1, moving: false, allowOverflow: false, allowCaption: false });
  const item = { id: 's01', type: 'scene', label: '06 一般字卡', start: 10, end: 18, D: 8, opaque: false, pip: false, seg: {} };
  const judge = (els, ctx) => R.judgeSample({ host: { start: 10 }, els }, { item, t: 17.4, kind: 'done', layout: 'overlay', pipOn: false, sideShift: 0, ...ctx });
  const body = el({ rect: [120, 536, 1020, 860] });
  assert.ok(!judge([body], { speakerBox: SB, speakerWarn: R.speakerWarnOf({ type: 'scene', seg: {} }) }).some((x) => x.rule === 'speaker'));
  const head = el({ rect: [700, 150, 1100, 400] });
  const f = judge([head], { speakerBox: SB, speakerWarn: R.speakerWarnOf({ type: 'scene', seg: {} }) }).find((x) => x.rule === 'speaker');
  assert.ok(f, '壓到臉');
  assert.match(f.msg, /臉的位置 \d+%/);
  assert.ok(f.data.face > 0.05);
});

// ---------- CLI：--autofix 寫回、備份；剪輯台用的 --check／build 不自動修；--merge-drafts 會跑 ----------

let proj;
const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
const tool = (args) => spawnSync(process.execPath, [path.join(TOOLS, 'build.mjs'), ...args, '--template', TEMPLATE], { encoding: 'utf8', maxBuffer: 1 << 26 });
const srt = (cues) => cues.map((c) => { const t = (x) => { const ms = Math.round(x * 1000); const p = (n, w = 2) => String(n).padStart(w, '0'); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; }; return `${c.n}\n${t(c.start)} --> ${t(c.end)}\n${c.text}\n`; }).join('\n');
const FLASH = [
  { id: 's01', scene: 'concept', from: '#1', to: '#2e', slots: { text: '一般說明文字' } },
  { id: 's02', scene: 'concept', from: '#3', to: '#8e', slots: { text: '另一段說明' } },
];
before(() => {
  if (!hasFfmpeg) return;
  proj = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-autofix-'));
  const work = path.join(proj, 'work');
  fs.mkdirSync(path.join(work, 'hyperframes'), { recursive: true });
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=gray:size=320x180:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
    '-t', '30', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', path.join(work, 'rough.mp4')]);
  assert.equal(r.status, 0, String(r.stderr));
  fs.writeFileSync(path.join(work, 'rough.srt'), srt(mkCues({ words: false })));
});
after(() => { if (proj) fs.rmSync(proj, { recursive: true, force: true }); });
const planFile = () => path.join(proj, 'work', 'hyperframes', 'plan.json');
const writePlan = (scenes) => fs.writeFileSync(planFile(), `${JSON.stringify({ version: 1, speakerBox: SB, scenes }, null, 2)}\n`);
const backups = () => fs.readdirSync(path.dirname(planFile())).filter((f) => f.startsWith('plan.json.bak-autofix-'));

test('剪輯台用的 --check --json 與 build 都不自動修（使用者在剪輯台改的時間要算數）', { skip: hasFfmpeg ? false : '要 ffmpeg' }, () => {
  writePlan(FLASH);
  const before = fs.readFileSync(planFile(), 'utf8');
  const j = JSON.parse(tool(['--project', proj, '--check', '--json']).stdout);
  assert.ok(j.warnings.some((w) => w.includes('講者會閃一下')), j.warnings.join('\n'));
  const b = tool(['--project', proj]);
  assert.equal(b.status, 0, b.stdout + b.stderr);
  assert.equal(fs.readFileSync(planFile(), 'utf8'), before, 'plan.json 沒被改');
  assert.deepEqual(backups(), []);
  // 剪輯台叫 build 的地方都沒有 --autofix
  const src = fs.readFileSync(path.join(TOOLS, 'editor.mjs'), 'utf8');
  assert.ok(/runNode\(\[BUILD/.test(src) && !src.includes('--autofix'));
});

test('build.mjs --autofix：改了才備份、寫回；--only 以外不動；再跑一次沒有要改的', { skip: hasFfmpeg ? false : '要 ffmpeg' }, () => {
  writePlan(FLASH);
  let r = tool(['--project', proj, '--autofix', '--only', 's02']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /沒有工具能自己修的提醒/);
  assert.deepEqual(backups(), []);
  r = tool(['--project', proj, '--autofix']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^自動修好 1 處：空檔 1\n  空檔：s01 的 to 接到 s02 的起點 "#3"/m);
  assert.equal(JSON.parse(fs.readFileSync(planFile(), 'utf8')).scenes[0].to, '#3');
  assert.equal(backups().length, 1);
  const j = JSON.parse(tool(['--project', proj, '--check', '--json']).stdout);
  assert.ok(!j.warnings.some((w) => w.includes('講者會閃一下')));
  r = tool(['--project', proj, '--autofix']);
  assert.match(r.stdout, /沒有工具能自己修的提醒/);
  assert.equal(backups().length, 1);
});

test('--merge-drafts 寫完 plan.json 自動修，合併紀錄記修過的版本（之後草稿改了還能再合併）', { skip: hasFfmpeg ? false : '要 ffmpeg' }, () => {
  fs.rmSync(planFile(), { force: true });
  const drafts = path.join(proj, 'work', 'drafts');
  fs.mkdirSync(drafts, { recursive: true });
  fs.writeFileSync(path.join(drafts, 'ch01.json'), JSON.stringify({ segments: FLASH }));
  let r = tool(['--project', proj, '--merge-drafts']);
  assert.match(r.stdout, /自動修好 1 處：空檔 1/, r.stdout + r.stderr);
  assert.equal(JSON.parse(fs.readFileSync(planFile(), 'utf8')).scenes[0].to, '#3');
  fs.writeFileSync(path.join(drafts, 'ch01.json'), JSON.stringify({ segments: [FLASH[0], { ...FLASH[1], slots: { text: '草稿改過的字' } }] }));
  r = tool(['--project', proj, '--merge-drafts']);
  assert.doesNotMatch(r.stdout, /上次合併之後改過/, r.stdout);
  assert.equal(JSON.parse(fs.readFileSync(planFile(), 'utf8')).scenes[1].slots.text, '草稿改過的字');
});

test('--apply-storyboard 定稿後自動修；使用者在分鏡表改過音效的段，音效不拿掉', { skip: hasFfmpeg ? false : '要 ffmpeg' }, () => {
  writePlan([
    { id: 's01', scene: 'concept', from: '#1', to: '#3', slots: { text: '一般說明文字' }, sfx: { name: 'success', at: '#2' } },
    { id: 's02', scene: 'keywords', from: '#3', to: '#5', slots: { items: ['甲乙', '丙丁'] }, sfx: { name: 'alert', at: '#4' } },
    { id: 's03', scene: 'concept', from: '#5', to: '#8e', slots: { text: '第三段說明' }, sfx: { name: 'alert', at: '#6' } },
  ]);
  fs.writeFileSync(path.join(proj, 'work', 'storyboard.md'), '# 分鏡表\n\n### s02｜關鍵詞\n\n- 音效：ding\n');
  const r = tool(['--project', proj, '--apply-storyboard']);
  assert.match(r.stdout, /改：s02 音效：alert → ding/, r.stdout + r.stderr);
  assert.match(r.stdout, /自動修好 1 處：音效太密 1\n  音效太密：s01：拿掉音效 success/);
  const p = JSON.parse(fs.readFileSync(planFile(), 'utf8'));
  assert.equal(seg(p, 's01').sfx, null);
  assert.deepEqual(seg(p, 's02').sfx, { name: 'ding', at: '#4' }, '使用者剛選的 ding 不動（不然照優先序會先拿掉它）');
  assert.deepEqual(seg(p, 's03').sfx, { name: 'alert', at: '#6' });
});

test('--check-draft：合併時工具會自動修的（這裡是講者會閃一下）不列成 ⚠ 要分章的 AI 改，只說一行「合併時工具會自動修」；草稿本身不動', { skip: hasFfmpeg ? false : '要 ffmpeg' }, () => {
  const drafts = path.join(proj, 'work', 'drafts');
  fs.mkdirSync(drafts, { recursive: true });
  const file = path.join(drafts, 'ch09.json');
  fs.writeFileSync(file, JSON.stringify({ segments: FLASH }));
  const before = fs.readFileSync(file, 'utf8');
  const r = tool(['--project', proj, '--check-draft', 'ch09']);
  assert.match(r.stdout, /合併時工具會自動修 1 處（空檔 1），草稿不用改/, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /講者會閃一下/, '不用分章的 AI 改');
  assert.match(r.stdout, /^通過：2 段/m);
  assert.equal(fs.readFileSync(file, 'utf8'), before, '草稿本身不動（合併時才真的改進 plan.json）');
  fs.rmSync(file);
});
