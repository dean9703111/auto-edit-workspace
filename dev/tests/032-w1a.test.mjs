// 032 W1a 分鏡流程：C1 failLines、C2 次數一個 key 一個檔、B2 停點不重複、B1 容差與照抄的改法、B5 派工紀錄、
// A4 連續沒過停手、A8 ② 閘門、B7 檢查不改草稿、B4 每拍的詞與草稿階段同等級、自動併拍／延 to
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { TOOLS, TEMPLATE, makeSrt, imp } from './helpers.mjs';

const F = await imp('lib/flow.mjs');
const G = await imp('lib/progress.mjs');
const T = await imp('lib/tries.mjs');
const { pathsFrom } = await imp('build.mjs');

const tmp = (t, prefix) => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix)); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; };
const put = (root, rel, text, minAgo = null) => {
  const f = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
  if (minAgo != null) { const d = new Date(Date.now() - minAgo * 60000); fs.utimesSync(f, d, d); }
  return f;
};
const build = (proj, ...a) => spawnSync(process.execPath, [path.join(TOOLS, 'build.mjs'), '--project', proj, ...a], { encoding: 'utf8' });
const hasFfmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;

test('C1 failLines：stdout 和 stderr 的 ✖、Error 都收；--review 的 build 是 throw 的錯也印出來（不是只有「build 沒過」）', (t) => {
  assert.deepEqual(F.failLines({ stdout: '專案：x\n✖ a → b\n', stderr: '✖ boom\n    at y (z.mjs:1)\nTypeError: bad' }), ['✖ a → b', '✖ boom', 'TypeError: bad']);
  assert.deepEqual(F.failLines({ out: '✖ x', err: '' }), ['✖ x'], 'runAsync 的 { out, err } 也收');
  const p = tmp(t, 'w1a-c1-');
  put(p, 'work/rough.srt', makeSrt({ n: 12 }));
  put(p, 'work/hyperframes/plan.json', '{"version": 1, "scenes": [');
  const r = build(p, '--review');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^✖ .*plan\.json 不是合法的 JSON/m, r.stdout + r.stderr);
  assert.match(r.stdout, /✖ build 沒過/);
});

test('A4 主代理的指令連續沒過由工具數：--review 第 6 次印「→ 停手」；過了歸零', (t) => {
  const p = tmp(t, 'w1a-a4-');
  put(p, 'work/rough.srt', makeSrt({ n: 12 }));
  put(p, 'work/hyperframes/plan.json', '{"version": 1, "scenes": [');
  for (let i = 1; i <= 5; i++) assert.doesNotMatch(build(p, '--review').stdout, /→ 停手/, `第 ${i} 次還不停`);
  const r = build(p, '--review');
  assert.match(r.stdout, /→ 停手：build\.mjs --review 已經連續 6 次沒過/);
  assert.equal(r.stdout.trim().split('\n').pop().startsWith('→ 停手'), true, '停手那一行在最後');
  assert.equal(T.readTry(T.mainTriesDir(p), 'main:review'), 6);
});

test('A8 --storyboard 的 ② 閘門：有講者的專案 ② 沒過、沒有 speakerBox 就 ✖，下一步是 --framing／--framing-done；不跑 build', (t) => {
  const p = tmp(t, 'w1a-a8-');
  put(p, 'work/rough.srt', makeSrt({ n: 12 }));
  put(p, 'assets/camera/a.mp4', '');
  put(p, 'work/hyperframes/plan.json', JSON.stringify({ version: 1, scenes: [] }));
  let r = build(p, '--storyboard');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /✖ 停點 ② 構圖還沒通過（work\/製作進度\.md 的 ② 沒有紀錄）/);
  assert.match(r.stdout, /✖ plan\.json 沒有 speakerBox/);
  assert.match(r.stdout, /^node shared\/template\/tools\/build\.mjs --project \S+ --framing$/m, '還沒給使用者看構圖台：--framing');
  G.appendStop(p, { stop: '② 構圖', state: '待回覆' });
  r = build(p, '--storyboard');
  assert.match(r.stdout, /最後是「待回覆」/);
  assert.match(r.stdout, /^node shared\/template\/tools\/build\.mjs --project \S+ --framing-done --said "<使用者原話>"$/m);
  assert.match(r.stdout, /--storyboard$/m);
  G.appendStop(p, { stop: '② 構圖', state: '通過', said: '可以' });
  const P = pathsFrom({ project: p });
  assert.match(F.framingGate(P, { scenes: [] }).join('\n'), /--framing-done$/m, '② 過了、只缺講者框：--framing-done 不帶原話');
  assert.equal(F.framingGate(P, { scenes: [], speakerBox: [700, 100, 1200, 900] }), null, '都有了就放行');
  const voice = tmp(t, 'w1a-a8v-');
  put(voice, 'assets/voice/a.wav', '');
  assert.equal(F.framingGate(pathsFrom({ project: voice }), { scenes: [] }), null, '只有聲音的專案沒有 ②');
});

test('C2 runCount／resetRuns：一個 key 一個檔（work/hyperframes/.cache/tries），不再寫 check-runs.json；舊檔還在就一起清', (t) => {
  const p = tmp(t, 'w1a-c2-');
  const P = { out: path.join(p, 'work', 'hyperframes') };
  assert.equal(F.runCount(P, 'audit:d1'), 1);
  assert.equal(F.runCount(P, 'audit:d1'), 2);
  assert.equal(F.runCount(P, 'draft:ch01.json'), 1);
  assert.ok(fs.existsSync(path.join(P.out, '.cache', 'tries', `${encodeURIComponent('audit:d1')}.json`)));
  assert.ok(!fs.existsSync(path.join(P.out, '.cache', 'check-runs.json')), '不再擠在同一個檔');
  put(p, 'work/hyperframes/.cache/check-runs.json', JSON.stringify({ 'audit:d2': 3, 'audit:d3': 1 }));
  assert.deepEqual(F.resetRuns(P, ['d1', 'd2', 'd9']), ['d1', 'd2']);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(P.out, '.cache', 'check-runs.json'), 'utf8')), { 'audit:d3': 1 });
  assert.equal(F.runCount(P, 'audit:d1'), 1, '歸零後從 1 算起');
  assert.equal(F.runCount(P, 'draft:ch01.json'), 2, '別的 key 不動');
});

test('B2 appendStop：同一個停點最後一列已經是同一個狀態（又沒帶原話）不重複加；lastStopOf 認改版、不混 ⑥ 兩種', (t) => {
  const p = tmp(t, 'w1a-b2-');
  const rows = () => fs.readFileSync(G.progressFile(p), 'utf8').split('\n').filter((l) => /^\| \d{4}-/.test(l));
  G.appendStop(p, { stop: '③ 分鏡表', state: '待回覆' });
  const again = G.appendStop(p, { stop: '③ 分鏡表', state: '待回覆' });
  assert.equal(rows().length, 1, '連跑兩次 --storyboard 只記一列');
  assert.match(again, /\| ③ 分鏡表 \| 待回覆 \|/, '回傳原本那一列');
  G.appendStop(p, { stop: '③ 分鏡表', state: '待回覆', said: '再看一次' });
  assert.equal(rows().length, 2, '帶了原話照記');
  G.appendStop(p, { stop: '③ 分鏡表（s12 v2）', state: '通過' });
  assert.deepEqual(G.lastStopOf(p, '③ 分鏡表'), { label: '③ 分鏡表（s12 v2）', state: '通過' });
  G.appendStop(p, { stop: '③ 分鏡表', state: '待回覆' });
  assert.equal(rows().length, 4, '最後一筆是改版：不算同一列，照記');
  G.appendStop(p, { stop: '⑥ 背景預覽', state: '通過' });
  assert.equal(G.lastStopOf(p, '⑥ 配樂試聽'), null);
  assert.equal(G.lastStopOf(p, '② 構圖'), null);
});

test('B1 只有一份不報「占了 A 的一半以上」；版面節奏留 0.5 秒容差；不過時的改法可以照抄（延哪一段的 to、併哪幾段）', async () => {
  const M = await imp('lib/semantic-map.mjs'), L = await imp('lib/layout-rhythm.mjs');
  const rows = (k) => Array.from({ length: 6 }, (_, i) => ({ a: i * 3 + 1, z: i * 3 + 3, raw: '#', sem: '步驟', tier: i < 5 ? 'A' : 'B', say: 's', note: 'n', part: k }));
  const one = M.mergeMaps([{ key: 'ch01', title: 't', firstN: 1, lastN: 18 }], new Map([['ch01', rows('ch01')]]), {});
  assert.ok(!one.warns.some((w) => /占了 A 的一半以上/.test(w)), one.warns.join('\n'));
  const two = M.mergeMaps([{ key: 'ch01', title: 't', firstN: 1, lastN: 18 }, { key: 'ch02', title: 'u', firstN: 19, lastN: 20 }], new Map([['ch01', rows('ch01')], ['ch02', [{ a: 19, z: 20, raw: '#', sem: '步驟', tier: 'B', say: 's', note: '', part: 'ch02' }]]]), {});
  assert.ok(two.warns.some((w) => /ch01 占了 A 的一半以上/.test(w)), '兩份以上照報');
  assert.equal(L.TOL, 0.5);
  assert.deepEqual(L.layoutFindings([{ id: 'a', start: 0, end: 30, mode: 'card' }, { id: 'b', start: 30, end: 74.6, mode: 'pip' }]), [], '44.6 秒不報');
  const segs = [{ id: 'a', start: 0, end: 30, mode: 'card', from: '#1', to: '#10e' }, { id: 'b', start: 30, end: 60, mode: 'pip', from: '#11', to: '#20e' },
    { id: 'c', start: 60, end: 70, mode: 'card', from: '#21', to: '#24e' }, { id: 'd', start: 70, end: 90, mode: 'card', from: '#25', to: '#30e' }];
  const [f] = L.layoutFindings(segs);
  assert.match(f.fix, /把 b 的 to 改成 #30e（併進 c、d，那幾行從大綱刪掉），子母畫面就連續 60 秒/);
  assert.match(f.fix, /把 c、d 也換成全畫面的模板/);
  assert.doesNotMatch(f.fix, /from 改成 #1/, '不往前併進開頭 30 秒的字卡區');
  assert.match(L.layoutFindings(segs.map(({ from, to, ...s }) => s))[0].fix, /把前後相鄰的段也換成全畫面的模板/, '沒有句號（--check）照舊用通用的說法');
});

test('B5 派工紀錄：dispatchLines 記 work/.jobs/dispatch.json；--design-status 用這次派工之後的心跳與檔案時間，印派工、最後活動', (t) => {
  const p = tmp(t, 'w1a-b5-');
  put(p, 'work/hyperframes/plan.json', JSON.stringify({ version: 1, scenes: [{ id: 'd1', design: true }, { id: 'd2', design: true }] }));
  put(p, 'work/hyperframes/compositions/x-design-d1.html', '<template><div>做一半</div></template>', 30);
  put(p, 'work/briefs/d1.md', '# d1', 40);
  put(p, 'work/hyperframes/compositions/x-design-d2.html', '<template><div>做一半</div></template>', 30);
  put(p, 'work/designs/d2.md', '# d2', 30);
  const P = pathsFrom({ project: p });
  assert.equal(F.designStatus(P)[0].stalled, true, '沒有派工紀錄：照舊看檔案時間，30 分鐘沒動＝卡住');
  const lines = F.dispatchLines(P, ['d1', 'd2']);
  assert.match(lines[0], /^→ 派工：內容設計動畫一段派一個設計師.*d1、d2/);
  assert.match(lines.join('\n'), /（d2）你是設計師[^\n]*鏡位腳本已經寫好/);
  assert.match(lines.join('\n'), /（d1）你是設計師[^\n]*寫鏡位腳本、接著做動畫/);
  const disp = F.readDispatch(P);
  assert.equal(disp.d1.n, 1);
  assert.ok(Math.abs(disp.d1.at - Date.now()) < 5000);
  let d1 = F.designStatus(P)[0];
  assert.equal(d1.stalled, false, '剛派工：舊的檔案時間不算');
  assert.equal(d1.since, '第 1 次派工 0 分鐘、最後活動 0 分鐘前');
  T.touchBeat(p, 'd1', Date.now() + 10 * 60000);   // 派工後 10 分鐘驗收過一次
  d1 = F.designStatus(P, Date.now() + 25 * 60000)[0];
  assert.equal(d1.stalled, false, '派工 25 分鐘，但 15 分鐘前還在驗收');
  assert.equal(d1.since, '第 1 次派工 25 分鐘、最後活動 15 分鐘前');
  assert.equal(F.designStatus(P, Date.now() + 31 * 60000)[0].stalled, true, '最後活動 21 分鐘前才算卡住');
  const log = console.log; console.log = () => {};
  try { F.designCanvasCmd(P, 'd2', { reset: true }); } finally { console.log = log; }
  assert.equal(F.readDispatch(P).d2.n, 2, '--design-canvas --reset 算重派');
});

test('B1／B4／B7 端到端：--outline 不報開場章節疊講者介紹、列每一拍的詞；--check-draft 不改草稿、和 audit 同等級、自動併拍／延 to；改了 AI 的檔印「已改檔」', { skip: hasFfmpeg ? false : '要 ffmpeg', timeout: 300000 }, (t) => {
  const root = tmp(t, 'w1a-e2e-');
  const proj = path.join(root, 'p'), work = path.join(proj, 'work');
  put(proj, 'work/rough.srt', makeSrt({ n: 12 }));
  put(proj, 'assets/camera/a.mp4', '');
  put(proj, 'work/hyperframes/plan.json', JSON.stringify({ version: 1, speakerBox: [700, 100, 1200, 900] }));
  const ff = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=25', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '44', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', path.join(work, 'rough.mp4')]);
  assert.equal(ff.status, 0, String(ff.stderr));
  let r = build(proj, '--scaffold');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const outline = (last) => put(proj, 'work/drafts/ch01.outline.md', `s0101 | #1 | #2e | chapter | 開場章節 | —\ns0102 | #1 | #3e | speaker | 自我介紹 | —\nx0103 | #4 | #7e | x-tags | 重點 | —\ns0104 | #8 | ${last} | key-point | 收尾 | —\n`);
  outline('#12e');
  r = build(proj, '--outline', 'ch01');
  assert.equal(r.status, 0, r.stdout);
  assert.doesNotMatch(r.stdout, /s0101（到 #2e）和 s0102（從 #1）重疊/, 'B1：開場章節和講者介紹綁同一句是常態');
  assert.match(r.stdout, /照 2 拍排，詞的第一個字在「」裡就過得了下限、拍距、段尾：第 1 拍 #4「[^」]+」[^｜]*｜第 2 拍 [^\n]*#6（整句）/, 'B4：每一拍列出可以綁的字');
  assert.doesNotMatch(r.stdout, /已改檔/, '第一次產生骨架不算改 AI 的檔');
  const dj = path.join(work, 'drafts', 'ch01.json');
  const fill = (a0, a1) => {
    const d = JSON.parse(fs.readFileSync(dj, 'utf8'));
    d.segments[0].slots.title = '開場';
    d.segments[2].slots.items = [{ text: '字幕內容', at: a0 }, { text: '第六', at: a1 }];
    d.segments[3].slots.key = '記住這一句';
    d.segments[3].beats.keyAt = '#9@字幕';
    const text = `${JSON.stringify(d, null, 2)}\n`;
    fs.writeFileSync(dj, text);
    return text;
  };
  // B7：auto 只印、不寫回
  let text = fill('auto', '#6@字幕');
  r = build(proj, '--check-draft', 'ch01');
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /auto 對到 1 格（合併時才寫進草稿，草稿不用改）：x0103\.slots\.items\[0\]\.at → #4@字幕內容/);
  assert.equal(fs.readFileSync(dj, 'utf8'), text, '檢查不改草稿');
  // B4 自動修：最後一拍到段尾不夠 → 延 to；兩拍只隔 1.4 秒 → 併拍
  fill('auto', '#7@容');
  assert.match(build(proj, '--check-draft', 'ch01').stdout, /合併時工具會自動修 \d+ 處（[^）]*最後一幕太短 1/);
  fill('#5@第', '#5@字幕');
  r = build(proj, '--check-draft', 'ch01');
  assert.match(r.stdout, /合併時工具會自動修 \d+ 處（[^）]*拍距不足（併拍） 1/);
  assert.doesNotMatch(r.stdout, /只隔 1\.40s/, '併好了就不再報');
  // B7：--outline 更新了填過的草稿 → 已改檔
  text = fill('auto', '#6@字幕');
  outline('#11e');
  r = build(proj, '--outline', 'ch01');
  assert.match(r.stdout, /^已改檔：\S*work\/drafts\/ch01\.json（要再改先重新讀）$/m);
  assert.notEqual(fs.readFileSync(dj, 'utf8'), text);
  // B7：--merge-drafts 把 auto 落地 → 已改檔
  r = build(proj, '--merge-drafts', '--no-storyboard');
  assert.match(r.stdout, /^已改檔：\S*work\/drafts\/ch01\.json（要再改先重新讀）$/m);
  assert.match(fs.readFileSync(dj, 'utf8'), /"at": "#4@字幕內容"/);
  // B4：第一拍來不及做完開場：--check 是 ⚠、audit 是 ✖ → 草稿階段當 ✖（範例檔頭的下限要有動畫檔才量得到）
  put(proj, 'work/hyperframes/compositions/x-tags-x0103.html', fs.readFileSync(path.join(TEMPLATE, 'custom', 'x-tags.html'), 'utf8'));
  fill('#4@第', '#6@字幕');
  r = build(proj, '--check-draft', 'ch01');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^✖ \[x0103[^\]]*\] 動畫分鏡：第一拍 #4@第 在段內 /m);
  assert.doesNotMatch(r.stdout, /^⚠ .*動畫分鏡：第一拍/m);
});
