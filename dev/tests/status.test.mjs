// status.mjs：判斷做到哪一步、完整可貼的下一條指令、停點紀錄、下一輪回饋編號；--mark 記停點、--init 填開工決策表
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { TOOLS, imp, fixture, tmpDir } from './helpers.mjs';

const { projectStatus, readStopLog, initProgress, markStop, normalizeStop, hasCamera, inventoryTodo, actionLines, editorUrls, readFacts, mainKindText } = await imp('status.mjs');
const { progressFile } = await imp('lib/progress.mjs');
const mk = () => {
  const p = tmpDir(null, 'hf-status-');   // 掛在呼叫它的那個 test 結束時清（測試裡自己先清的照舊）
  for (const d of ['camera', 'voice', 'screen', 'images']) fs.mkdirSync(path.join(p, 'assets', d), { recursive: true });
  return p;
};
const touch = (p, rel, text = 'x', ageSec = 0) => {
  const f = path.join(p, ...rel.split('/'));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
  const t = new Date(Date.now() - ageSec * 1000);
  fs.utimesSync(f, t, t);
};
const snapshot = (p) => fs.readdirSync(p, { recursive: true }).map(String).sort().map((f) => { const s = fs.statSync(path.join(p, f)); return `${f}:${s.mtimeMs}`; });
const STOP_TABLE = (...rows) => ['# 製作進度', '', '## 停點紀錄', '', '| 時間 | 停點 | 狀態 | 使用者原話 | 寫回哪裡 |', '|---|---|---|---|---|', ...rows, ''].join('\n');
const STATUS = (...a) => spawnSync(process.execPath, [path.join(TOOLS, 'status.mjs'), ...a], { encoding: 'utf8' });

test('判斷表：S0–S14 由上往下第一個符合', () => {
  const p = mk();
  const st = () => projectStatus(p).stage;
  assert.equal(st(), 'S0');
  touch(p, 'assets/camera/a.mp4');
  touch(p, 'assets/voice/b.m4a');
  assert.equal(st(), 'S1');
  touch(p, 'work/main.mp4');
  assert.equal(st(), 'S2');
  touch(p, 'work/cuts.md');
  assert.equal(st(), 'S3');
  touch(p, 'work/rough.mp4');
  assert.equal(st(), 'S4');
  touch(p, 'work/rough.srt', '1\n00:00:01,000 --> 00:00:02,000\n短句\n');
  assert.equal(st(), 'S5', 'F8：srt-align 還沒跑');
  touch(p, 'work/rough.srt.align-20261031-115900');
  assert.equal(st(), 'S6', '沒有 transcript.json → 要 snap-srt');
  touch(p, 'work/rough.srt.bak-20261031-120000');
  assert.equal(st(), 'S7');
  touch(p, 'work/cutpoints.json');
  assert.equal(st(), 'S8');
  touch(p, 'work/構圖預覽.jpg');
  assert.equal(st(), 'S9');
  touch(p, 'work/storyboard.md', 'x', 0);
  assert.equal(st(), 'S10');
  touch(p, 'work/hyperframes/plan.json', '{}', 60);
  assert.equal(st(), 'S10', 'storyboard.md 比 plan.json 新');
  touch(p, 'work/hyperframes/plan.json', '{}', 0);
  touch(p, 'work/storyboard.md', 'x', 60);
  assert.equal(st(), 'S11');
  touch(p, 'work/hyperframes/index.html', 'x', 0);
  assert.equal(st(), 'S12');
  touch(p, 'output/final.mp4');
  assert.equal(st(), 'S13');
  touch(p, 'output/qc/qc-sheet.jpg');
  assert.equal(st(), 'S14');
  fs.rmSync(p, { recursive: true });
});

test('停點紀錄：同一停點以最後一列為準；待回覆的停點蓋過判斷表；r 編號；不寫任何檔', () => {
  const p = mk();
  touch(p, 'assets/camera/a.mp4');
  touch(p, 'work/cuts.md');
  const log = ['# 製作進度', '', '## 停點紀錄', '', '| 時間 | 停點 | 狀態 | 使用者原話 | 寫回哪裡 |', '|---|---|---|---|---|',
    '| 2026-11-02 14:10 | ① 剪輯清單 | 待回覆 | — | — |', '| 2026-11-02 14:20 | ① 剪輯清單 | 通過 | 「清單沒問題，繼續」 | work/cuts.md |', '| 2026-11-02 15:30 | ③ 分鏡表 | 待回覆 | — | — |', ''].join('\n');
  touch(p, 'work/製作進度.md', log);
  touch(p, 'work/feedback/r1.md');
  touch(p, 'work/feedback/r3.md');
  const before = snapshot(p);
  const s = projectStatus(p);
  assert.deepEqual(s.waiting, ['③ 分鏡表']);
  assert.equal(s.at, '剪好看／停點 ③ 分鏡表（待回覆）');
  assert.equal(s.nextStop, '③ 分鏡表');
  assert.equal(s.feedback, 'r4');
  assert.match(s.evidence[0], /停點紀錄最後一列「2026-11-02 15:30｜③ 分鏡表｜待回覆」/);
  assert.equal(readStopLog(log).last.get('① 剪輯清單').state, '通過');
  const r = spawnSync(process.execPath, [path.join(TOOLS, 'status.mjs'), '--project', p], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  // 講者那一行看這台機器有沒有 shared/setting.json，不算在內
  const lines = r.stdout.trim().split('\n').filter((l) => !l.startsWith('講者：'));
  assert.deepEqual(lines.slice(0, 8).map((l) => l.split('：')[0]), ['版式', '專案', '目前在', 'Skill', '下一個停點', '待回覆停點', '下一輪回饋編號', '依據']);
  assert.match(lines[0], /^版式：橫式 1920×1080（來源：/);
  assert.ok(r.stdout.includes('⏸ 停點 ③ 分鏡表｜請看 <分鏡表網址>\n請回：改好後說「可以」，或要改的地方\n'), '重貼停點那兩行（照 AGENTS.md）');
  assert.match(lines.at(-1), /editor\.mjs --project /, '剪輯台沒開：最後一行是開剪輯台的指令');
  const j = JSON.parse(spawnSync(process.execPath, [path.join(TOOLS, 'status.mjs'), '--project', p, '--json'], { encoding: 'utf8' }).stdout);
  assert.deepEqual(Object.keys(j), ['project', 'stage', 'at', 'skill', 'next', 'cmd', 'cmds', 'dispatch', 'nextStop', 'waiting', 'stopLine', 'after', 'needEditor', 'round', 'job', 'camera', 'feedback', 'evidence', 'format', 'formatSource', 'speaker', 'summary']);
  assert.ok(['set', 'off', 'unset', 'bad'].includes(j.speaker));
  assert.deepEqual(snapshot(p), before, '跑完前後檔案與修改時間不變');
  fs.rmSync(p, { recursive: true });
});

test('A-02：srt-split 的備份（rough.srt.split-*）不算 snap-srt 跑過，停在 S6；有 rough.srt.bak-* 才往下', () => {
  const p = mk();
  touch(p, 'assets/camera/a.mp4');
  for (const f of ['work/cuts.md', 'work/rough.mp4']) touch(p, f);
  touch(p, 'work/rough.srt', '1\n00:00:01,000 --> 00:00:02,000\n短句\n');
  touch(p, 'work/rough.srt.split-20261031-120000');
  touch(p, 'work/rough.srt.align-20261031-115900');
  const s = projectStatus(p);
  assert.equal(s.stage, 'S6');
  assert.match(s.evidence.join('；'), /沒有 work\/rough\.srt\.bak-\*（snap-srt 還沒跑；srt-split 的備份叫 rough\.srt\.split-\*，不算）/);
  touch(p, 'work/rough.srt.bak-20261031-120500');
  assert.equal(projectStatus(p).stage, 'S7');
});

test('F8：有 transcript.json 時 srt-align 已是詞級時間，不用 snap-srt（S5 → S7）', () => {
  const p = mk();
  touch(p, 'assets/camera/a.mp4');
  for (const f of ['work/cuts.md', 'work/rough.mp4', 'work/transcript.json']) touch(p, f);
  touch(p, 'work/rough.srt', '1\n00:00:01,000 --> 00:00:02,000\n短句\n');
  const s = projectStatus(p);
  assert.equal(s.stage, 'S5');
  assert.match(s.cmd, /media\.mjs rough --project /, 'rough 中途被打斷：再跑一次接著做');
  touch(p, 'work/cutpoints.json');
  const late = projectStatus(p);
  assert.equal(late.stage, 'S5');
  assert.match(late.next, /media\.mjs srt-align --dry-run/);
  assert.match(late.cmd, /media\.mjs srt-align --project .* --dry-run$/, 'rough、rough.srt、cutpoints 都在時 rough 算做完，只能單獨跑 srt-align');
  fs.rmSync(path.join(p, 'work', 'cutpoints.json'));
  touch(p, 'work/rough.srt.align-20261031-120000');
  assert.equal(projectStatus(p).stage, 'S7');
});

test('C-01：構圖預覽（S8）前講者調光瘦臉還沒好 → 下一步＝lookNextStep 的說明，指令另外一行（cmd）', async () => {
  const { lookNextStep } = await imp('lib/look.mjs');
  const p = mk();
  touch(p, 'assets/camera/a.mp4');
  for (const f of ['work/cuts.md', 'work/rough.mp4', 'work/rough.srt.align-1', 'work/rough.srt.bak-1', 'work/cutpoints.json']) touch(p, f);
  touch(p, 'work/rough.srt', '1\n00:00:01,000 --> 00:00:02,000\n短句\n');
  const ns = lookNextStep({ projectDir: p, plan: {} });
  const s = projectStatus(p);
  assert.equal(s.stage, 'S8');
  if (ns.done) {
    assert.match(s.cmd, /build\.mjs --project .* --framing$/);
    assert.equal(s.cmds.length, 1, '032 A2：build.mjs --framing 一條做完量構圖、開構圖台、記停點 ②');
    assert.match(s.next, /不用等使用者說「剪好看」/);
  } else { assert.equal(s.next, ns.note); assert.equal(s.cmd, ns.cmd); }
});

test('--timeline：產物照第一次出現排；停點等待＝待回覆到同一停點的下一列，其餘算 AI 做事；最久的幾段；不寫任何檔', async () => {
  const S = await imp('status.mjs');
  const p = mk();
  // 3 小時前接主軌、2 小時前剪輯清單、1 小時前初剪；停點 ① 從 2 小時前等到 1.5 小時前
  touch(p, 'work/main.mp4', 'x', 3 * 3600);
  touch(p, 'work/cuts.md', 'x', 2 * 3600);
  touch(p, 'work/rough.mp4', 'x', 3600);
  touch(p, 'work/hyperframes/compositions/x-flow.html', 'x', 1800);
  const at = (sec) => { const d = new Date(Date.now() - sec * 1000), z = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`; };
  touch(p, 'work/製作進度.md', `## 停點紀錄\n\n| 時間 | 停點 | 狀態 | 使用者原話 | 寫回哪裡 |\n|---|---|---|---|---|\n| ${at(2 * 3600)} | ① 剪輯清單 | 待回覆 | | |\n| ${at(1.5 * 3600)} | ① 剪輯清單 | 通過 | 「可以」 | cuts.md |\n`, 5 * 3600);
  const before = fs.readdirSync(path.join(p, 'work'), { recursive: true }).sort();
  const tl = S.projectTimeline(p);
  assert.deepEqual(tl.events.filter((e) => e.kind === 'file').map((e) => e.what), ['work/main.mp4', 'work/cuts.md', 'work/rough.mp4', 'work/hyperframes/compositions/x-flow.html']);
  assert.equal(tl.events.filter((e) => e.kind === 'stop').length, 2);
  assert.ok(Math.abs(tl.total - 2.5 * 3600e3) < 120e3, `總時長 ${tl.total}`);
  assert.ok(Math.abs(tl.wait - 0.5 * 3600e3) < 120e3, `等待 ${tl.wait}`);
  assert.equal(tl.work, tl.total - tl.wait);
  assert.equal(tl.longest[0].from.what, 'work/main.mp4', '最久的一段是接主軌 → 停點 ①');
  const r = spawnSync(process.execPath, [path.join(TOOLS, 'status.mjs'), '--project', p, '--timeline'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /總時長 2:3\d；等使用者回覆 0:\d\d；AI 在做事 /);
  assert.match(r.stdout, /停點等待：① 剪輯清單 0:3\d/);
  assert.deepEqual(fs.readdirSync(path.join(p, 'work'), { recursive: true }).sort(), before, '不寫任何檔');
});

test('時間軸：沒記「通過」的停點用下一個產物估等待；停下來前後 2 分鐘內的檔不算回覆；最久的幾段不含等待；後面沒產物才是還在等', async () => {
  const S = await imp('status.mjs');
  const p = mk();
  const at = (sec) => { const d = new Date(Date.now() - sec * 1000), z = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`; };
  const log = (sec) => `## 停點紀錄\n\n| 時間 | 停點 | 狀態 | 使用者原話 | 寫回哪裡 |\n|---|---|---|---|---|\n| ${at(sec)} | ② 構圖 | 待回覆 | | |\n`;
  touch(p, 'work/cutpoints.json', 'x', 3 * 3600);
  touch(p, 'work/構圖預覽.jpg', 'x', 2 * 3600 - 30);       // 和停下來同一分鐘：停下來之前做的
  touch(p, 'work/製作進度.md', log(2 * 3600), 5 * 3600);
  let tl = S.projectTimeline(p);
  assert.equal(tl.waits[0].ms, null, '後面沒有產物：還在等');
  touch(p, 'work/hyperframes/plan.json', '{}', 3600);       // 使用者一小時後存了構圖台
  tl = S.projectTimeline(p);
  assert.equal(tl.waits[0].estimated, true);
  assert.ok(Math.abs(tl.wait - 3600e3) < 120e3, `等待 ${tl.wait}`);
  assert.equal(tl.work, tl.total - tl.wait);
  assert.ok(tl.longest.every((g) => g.to.what !== 'work/hyperframes/plan.json'), '等使用者的那一段不算最久');
  const r = spawnSync(process.execPath, [path.join(TOOLS, 'status.mjs'), '--project', p, '--timeline'], { encoding: 'utf8' });
  assert.match(r.stdout, /② 構圖 約 1:0\d（沒記「通過」，用下一個產物的時間估）/);
});

test('018 舊專案停點紀錄的「④ Studio 預覽」照認，印成現在的名稱', () => {
  const log = ['## 停點紀錄', '', '| 時間 | 停點 | 狀態 | 使用者原話 | 寫回哪裡 |', '|---|---|---|---|---|', '| 2026-11-01 10:00 | ④ Studio 預覽 | 待回覆 | — | — |', ''].join('\n');
  const r = readStopLog(log).last.get('④ 完成影片預覽');
  assert.equal(r.state, '待回覆');
  assert.equal(r.label, '④ 完成影片預覽');
});

// ---------- 預設輸出：完整可貼的下一條指令 ----------

test('下一步的指令：開工 prep → ① 通過 rough → 初剪好 framing＋editor → ② 通過 speaker＋scaffold → 草稿 → 合併 → --storyboard → ③ 通過 apply → --review → ④ 通過 deliver', () => {
  const p = mk();
  const st = () => projectStatus(p);
  const at = '2026-11-02 10:00';
  const log = (...rows) => touch(p, 'work/製作進度.md', STOP_TABLE(...rows));
  touch(p, 'assets/camera/a.mp4');
  assert.equal(st().stage, 'S1', '只有一支主軌也要先接主軌（多支、一支都一樣）');
  assert.match(st().cmd, /^node shared\/template\/tools\/media\.mjs prep --project /);
  assert.equal(st().nextStop, '① 剪輯清單');
  assert.equal(st().skill, 'auto-edit-rough 步驟 1');
  touch(p, 'work/main.mp4');
  assert.match(st().cmd, /media\.mjs prep --project /);
  touch(p, 'work/cuts.md');
  assert.match(st().cmd, /media\.mjs prep --project /, '① 還沒記：prep 重開網址、記停點（cuts.md 不重寫）');
  log(`| ${at} | ① 剪輯清單 | 待回覆 | — | — |`);
  assert.equal(st().after[0].cmds.length, 1);
  assert.match(st().after[0].cmds[0], /media\.mjs rough --project .* --said "<使用者原話>"$/, '回覆後只要一條：rough 自己記 ① 通過');
  log(`| ${at} | ① 剪輯清單 | 待回覆 | — | — |`, `| ${at} | ① 剪輯清單 | 通過 | 「可以」 | work/cuts.md |`);
  assert.deepEqual(st().waiting, []);
  assert.match(st().cmd, /^node shared\/template\/tools\/media\.mjs rough --project /);
  touch(p, 'work/rough.mp4');
  assert.match(st().cmd, /media\.mjs rough --project /, 'S4：rough 中途被打斷，再跑一次接著做');
  for (const f of ['work/rough.srt.align-1', 'work/transcript.json', 'work/cutpoints.json']) touch(p, f);
  touch(p, 'work/rough.srt', '1\n00:00:01,000 --> 00:00:02,000\n短句\n');
  assert.equal(st().stage, 'S8');
  assert.deepEqual(st().cmds.map((c) => c.split(' ').slice(1).join(' ').replace(/--project \S+ /, '')), ['shared/template/tools/build.mjs --framing']);
  touch(p, 'work/構圖預覽.jpg');
  assert.equal(st().stage, 'S9');
  assert.match(st().cmd, /build\.mjs --project .* --framing$/, '構圖預覽做好了、② 還沒記：開構圖台、記停點（032 A2）');
  log(`| ${at} | ① 剪輯清單 | 通過 | 「可以」 | work/cuts.md |`, `| ${at} | ② 構圖 | 待回覆 | — | — |`);
  assert.deepEqual(st().after.map((a) => a.cmds.map((c) => c.replace(/--project \S+ /, ''))), [['node shared/template/tools/build.mjs --framing-done --said "<使用者原話>"'], ['node shared/template/tools/build.mjs --framing-done --use suggested --said "<使用者原話>"'], ['node shared/template/tools/build.mjs --framing-done --use <倍率> --said "<使用者原話>"']]);
  log(`| ${at} | ① 剪輯清單 | 通過 | 「可以」 | work/cuts.md |`, `| ${at} | ② 構圖 | 通過 | 「調好了」 | plan.json |`);
  assert.equal(st().at, '剪好看／② 通過，量講者框');
  assert.deepEqual(st().cmds.map((c) => c.replace(/--project \S+ /, '')), ['node shared/template/tools/build.mjs --framing-done'], '② 通過還沒量講者框：--framing-done 接著做完');
  touch(p, 'work/hyperframes/plan.json', JSON.stringify({ version: 1, speakerBox: [1, 2, 3, 4] }), 600);
  assert.match(st().cmd, /build\.mjs --project .* --scaffold$/, '講者框有了：只差分鏡素材');
  touch(p, 'work/分鏡素材/index.json', JSON.stringify({ parts: [{ key: 'ch01' }, { key: 'ch02' }] }));
  touch(p, 'work/drafts/ch01.json', '{}');
  assert.match(st().at, /寫分鏡草稿（還缺 ch02）/);
  assert.match(st().next, /chapter-worker\.md/);
  assert.match(st().cmd, /--merge-drafts$/);
  touch(p, 'work/drafts/ch02.json', '{}');
  assert.equal(st().at, '剪好看／合併分鏡草稿');
  touch(p, 'work/hyperframes/plan.json', JSON.stringify({ version: 1, speakerBox: [1, 2, 3, 4], scenes: [{ id: 's01' }, { id: 's02', design: true, story: { idea: '構想' } }] }), 600);
  touch(p, 'work/drafts/_merged.json', '{}', -5);
  assert.match(st().next, /設計師子代理寫鏡位腳本.*s02/);
  assert.match(st().cmd, /--storyboard$/);
  touch(p, 'work/designs/s02.md', '# 鏡位');
  assert.match(st().next, /截圖、產生分鏡表/);
  touch(p, 'work/storyboard.md', 'x', 0);
  assert.equal(st().stage, 'S10');
  assert.match(st().cmd, /--storyboard$/, '③ 還沒記：--storyboard 會開網址、記停點');
  log(`| ${at} | ② 構圖 | 通過 | 「調好了」 | plan.json |`, `| ${at} | ③ 分鏡表 | 待回覆 | — | — |`);
  assert.equal(st().after[0].cmds.length, 1);
  assert.match(st().after[0].cmds[0], /--apply-storyboard --said "<使用者原話>"$/, '回覆後只要一條：--apply-storyboard 自己記 ③ 通過');
  log(`| ${at} | ② 構圖 | 通過 | 「調好了」 | plan.json |`, `| ${at} | ③ 分鏡表 | 通過 | 「可以」 | plan.json |`);
  assert.match(st().cmd, /--apply-storyboard$/, '③ 通過、分鏡表比 plan.json 新：套回去');
  touch(p, 'work/hyperframes/.cache/storyboard.json', JSON.stringify({ hash: 'x', at: Date.now() + 2000 }));
  assert.notEqual(st().stage, 'S10', '--apply-storyboard 沒改到字時 plan.json 的時間不變，不能一直叫它重跑');
  assert.match(st().at, /做動畫（還沒做：s02）/, '內容設計動畫還沒做');
  assert.match(st().cmd, /--review$/);
  assert.equal(st().skill, 'auto-edit-motion 步驟 1–2');
  const motionL = actionLines(st());
  assert.match(motionL[0], /^→ 派工：做 1 段動畫：一段派一個子代理/, '派工訊息走「→ 派工」');
  assert.match(motionL[1], /^  （s02）你是設計師/);
  assert.match(motionL.at(-2), /^→ 下一步：1 段動畫照上面「→ 派工：」派出，全部回來才跑下一行$/);
  assert.match(motionL.at(-1), /--review$/);
  touch(p, 'work/hyperframes/compositions/x-design-s02.html', '<template>做好了</template>');
  assert.equal(st().stage, 'S11');
  assert.match(st().cmd, /--review$/);
  touch(p, 'work/hyperframes/index.html', 'x', -5);
  assert.equal(st().stage, 'S12');
  assert.match(st().cmd, /--review$/, '④ 還沒記：--review 會記 ④ 待回覆');
  log(`| ${at} | ③ 分鏡表 | 通過 | 「可以」 | plan.json |`, `| ${at} | ④ 完成影片預覽 | 待回覆 | — | — |`);
  assert.match(st().after[0].cmds[0], /deliver\.mjs --project .* --said "<使用者原話>"$/, '輸出：deliver 自己記 ④ 通過');
  assert.match(st().after[1].cmds[0], /versions\.mjs begin --project .* --seg <段 id> --say "<使用者原話>"$/);
  assert.deepEqual(st().after.slice(2).map((a) => a.cmds.map((c) => c.replace(/--project \S+ /, ''))), [['node shared/template/tools/versions.mjs new --seg <段 id> --note "<使用者原話>"'], ['node shared/template/tools/versions.mjs use --seg <段 id> --ver v<N> --said "<使用者原話>"']], '重新設計、退回一版：各一條（new、use 沒開輪會自己開）');
  log(`| ${at} | ③ 分鏡表 | 通過 | 「可以」 | plan.json |`, `| ${at} | ④ 完成影片預覽 | 通過 | 「可以了」 | output/final.mp4 |`);
  assert.match(st().cmd, /^node shared\/template\/tools\/deliver\.mjs --project /);
  assert.equal(st().skill, 'auto-edit-deliver');
  touch(p, 'output/final.mp4', 'x', -5);
  assert.equal(st().stage, 'S13');
  assert.match(st().cmd, /deliver\.mjs --project /);
  touch(p, 'output/qc/qc-sheet.jpg', 'x', -5);
  assert.equal(st().stage, 'S14');
  assert.deepEqual(st().cmds, []);
  fs.rmSync(p, { recursive: true });
});

test('純聲音專案：hasCamera 假（main.json 全是聲音或邊錄邊講的錄影；沒有 main.json 看 assets/camera）→ 跳過 ② 和講者框，直接分鏡素材；混用照常走 ②', () => {
  const p = mk();
  assert.equal(hasCamera(p), false, '什麼都沒有');
  touch(p, 'assets/voice/a.m4a');
  assert.equal(hasCamera(p), false);
  for (const f of ['work/main.mp4', 'work/cuts.md', 'work/rough.mp4', 'work/rough.srt.align-1', 'work/transcript.json', 'work/cutpoints.json']) touch(p, f);
  touch(p, 'work/rough.srt', '1\n00:00:01,000 --> 00:00:02,000\n短句\n');
  touch(p, 'work/main.json', JSON.stringify({ clips: [{ file: 'assets/voice/a.m4a', kind: 'voice', start: 0, end: 5 }] }));
  assert.equal(hasCamera(p), false);
  const s = projectStatus(p);
  assert.equal(s.stage, 'S9', '沒有 S8 構圖');
  assert.equal(s.camera, false);
  assert.match(s.at, /沒有講者：跳過 ② 構圖和講者框/);
  assert.deepEqual(s.cmds.length, 1);
  assert.match(s.cmd, /build\.mjs --project .* --scaffold$/);
  assert.equal(s.nextStop, '③ 分鏡表');
  // 邊錄邊講的螢幕錄影也只取聲音（rough.mp4 全黑）
  touch(p, 'work/main.json', JSON.stringify({ clips: [{ file: 'assets/screen/s.mp4', kind: 'screen', start: 0, end: 5 }] }));
  assert.equal(hasCamera(p), false);
  // 混用：有一段真人就照常走 ②
  touch(p, 'work/main.json', JSON.stringify({ clips: [{ file: 'assets/camera/a.mp4', kind: 'camera', start: 0, end: 5 }, { file: 'assets/voice/a.m4a', kind: 'voice', start: 5, end: 9 }] }));
  assert.equal(hasCamera(p), true);
  assert.equal(projectStatus(p).stage, 'S8');
  // 舊的 main.json 沒寫 kind：看路徑
  touch(p, 'work/main.json', JSON.stringify({ clips: [{ file: 'assets/camera/a.mp4', start: 0, end: 5 }] }));
  assert.equal(hasCamera(p), true);
  // 還沒接主軌：看 assets/camera
  fs.rmSync(path.join(p, 'work', 'main.json'));
  assert.equal(hasCamera(p), false);
  touch(p, 'assets/camera/a.mp4');
  assert.equal(hasCamera(p), true);
  fs.rmSync(p, { recursive: true });
});

test('素材盤點：assets/screen、assets/images 有檔、work/media/notes/ 缺筆記 → 排在 ② 之前；盤點完才接 framing（純聲音接 scaffold）', () => {
  const p = mk();
  touch(p, 'assets/camera/a.mp4');
  for (const f of ['work/main.mp4', 'work/cuts.md', 'work/rough.mp4', 'work/rough.srt.align-1', 'work/transcript.json', 'work/cutpoints.json']) touch(p, f);
  touch(p, 'work/rough.srt', '1\n00:00:01,000 --> 00:00:02,000\n短句\n');
  assert.deepEqual(inventoryTodo(p), [], '沒有素材就不用盤點');
  assert.equal(projectStatus(p).stage, 'S8');
  touch(p, 'assets/screen/錄影 1.mp4');
  touch(p, 'assets/images/a.png');
  touch(p, 'assets/images/b.jpg');
  touch(p, 'assets/images/說明.txt');
  touch(p, 'assets/images/.DS_Store');
  assert.deepEqual(inventoryTodo(p), ['錄影 1.mp4', 'a.png', 'b.jpg'], '只算影片和圖片');
  let s = projectStatus(p);
  assert.equal(s.stage, 'S7m');
  assert.match(s.next, /^素材盤點：每支錄影、每批圖片派一個子代理寫 work\/media\/notes\/<檔名>\.json（auto-edit-screen 步驟 1）/);
  assert.match(s.next, /還缺 3 個：錄影 1\.mp4、a\.png、b\.jpg/);
  assert.equal(s.skill, 'auto-edit-screen 步驟 1');
  assert.equal(s.nextStop, '② 構圖');
  assert.match(s.cmd, /media\.mjs scan --project /, '還沒有 work/media/index.md 先掃');
  touch(p, 'work/media/index.md', '# 素材清單');
  s = projectStatus(p);
  assert.deepEqual(s.cmds, [], '子代理的事，沒有指令');
  assert.deepEqual(actionLines(s).length, 1);
  touch(p, 'work/media/notes/錄影 1.mp4.json', '{"file":"assets/screen/錄影 1.mp4"}');
  assert.deepEqual(inventoryTodo(p), ['a.png', 'b.jpg'], '<檔名>.json 算');
  touch(p, 'work/media/notes/錄影 1.json', '{}');
  touch(p, 'work/media/notes/圖片批次1.json', '[{"file":"assets/images/a.png"},{"file":"assets/images/b.jpg"}]');
  assert.deepEqual(inventoryTodo(p), [], '每批圖片一份筆記：寫到檔名就算');
  assert.equal(projectStatus(p).stage, 'S8', '盤點完接 ②');
  // 純聲音：盤點完接 scaffold；盤點的下一個停點是 ③
  fs.rmSync(path.join(p, 'assets', 'camera', 'a.mp4'));
  touch(p, 'assets/voice/a.m4a');
  touch(p, 'work/main.json', JSON.stringify({ clips: [{ file: 'assets/voice/a.m4a', kind: 'voice', start: 0, end: 5 }] }));
  assert.match(projectStatus(p).cmd, /--scaffold$/);
  touch(p, 'assets/images/c.png');
  s = projectStatus(p);
  assert.equal(s.stage, 'S7m');
  assert.equal(s.nextStop, '③ 分鏡表');
  // 分鏡表寫好就不回頭盤點
  touch(p, 'work/storyboard.md', 'x');
  assert.notEqual(projectStatus(p).stage, 'S7m');
  fs.rmSync(p, { recursive: true });
});

test('有停點在等：重貼 AGENTS.md 那一行；剪輯台開著填網址、沒開先印開剪輯台的指令；修改後重停也算在等', () => {
  const p = mk();
  touch(p, 'assets/camera/a.mp4');
  touch(p, 'work/cuts.md');
  const at = '2026-11-02 10:00';
  touch(p, 'work/製作進度.md', STOP_TABLE(`| ${at} | ① 剪輯清單 | 待回覆 | — | — |`));
  let s = projectStatus(p);
  assert.equal(s.stopLine, '⏸ 停點 ① 剪輯清單｜請看 <剪輯清單網址>\n請回：勾好後說「可以」，或要改的列');
  assert.equal(s.needEditor, true);
  assert.match(s.cmd, /editor\.mjs --project /);
  let L = actionLines(s);
  assert.match(L.at(-2), /^→ 下一步：剪輯台沒開/);
  assert.match(L.at(-1), /editor\.mjs --project /, '「→ 下一步」後面最後一行是可貼的指令');
  assert.ok(L.includes(s.stopLine));
  // 剪輯台開著（server.json 的 pid 活著）：網址填好、最後一行是停點
  touch(p, 'work/hyperframes/.editor/server.json', JSON.stringify({ pid: process.pid, url: 'http://127.0.0.1:4412/' }));
  assert.equal(editorUrls(p).final, 'http://127.0.0.1:4412/?view=final');
  s = projectStatus(p);
  assert.equal(s.needEditor, false);
  assert.equal(s.stopLine, '⏸ 停點 ① 剪輯清單｜請看 http://127.0.0.1:4412/cuts\n請回：勾好後說「可以」，或要改的列');
  L = actionLines(s);
  assert.equal(L.at(-1), s.stopLine, '停點那兩行是最後兩行');
  assert.equal(L.at(-2), '等使用者回覆：回覆的最後兩行照抄下面這兩行', '上面是一般說明，不是「→ 下一步」（下面接的不是指令）');
  assert.ok(!L.some((l) => l.startsWith('→ 下一步')), '停點在等、剪輯台開著：沒有「→ 下一步」');
  // 死掉的 pid：當作沒開
  touch(p, 'work/hyperframes/.editor/server.json', JSON.stringify({ pid: 2 ** 30, url: 'http://127.0.0.1:4412/' }));
  assert.equal(editorUrls(p), null);
  // 修改後重停＝又停下來等
  touch(p, 'work/製作進度.md', STOP_TABLE(`| ${at} | ① 剪輯清單 | 待回覆 | — | — |`, `| ${at} | ① 剪輯清單 | 修改後重停 | 「第 3 列不要剪」 | work/cuts.md |`));
  assert.deepEqual(projectStatus(p).waiting, ['① 剪輯清單']);
  // ② 有 look-preview.jpg 才列
  touch(p, 'work/製作進度.md', STOP_TABLE(`| ${at} | ② 構圖 | 待回覆 | — | — |`));
  assert.match(projectStatus(p).stopLine, /^⏸ 停點 ② 構圖｜請看 <構圖台網址>\n請回：拖好框說「調好了」（會自動存），或說「用建議的」$/);
  touch(p, 'work/look-preview.jpg');
  assert.match(projectStatus(p).stopLine, /^⏸ 停點 ② 構圖｜請看 <構圖台網址> 和 work\/look-preview\.jpg\n請回：/);
  for (const [row, re] of [['③ 分鏡表', /^⏸ 停點 ③ 分鏡表｜請看 <分鏡表網址>\n請回：改好後說「可以」，或要改的地方$/],
    ['④ 完成影片預覽', /^⏸ 停點 ④ 完成影片預覽｜請看 <完成影片預覽網址>\n請回：要改的段落（例：s05 往左移）或「可以了，輸出完成影片」$/],
    ['⑤ 剪輯台', /^⏸ 停點 ⑤ 剪輯台｜請看 <剪輯台網址>\n請回：調完說「調好了」（會自動存）$/],
    ['⑥ 背景預覽', /^⏸ 停點 ⑥ 背景預覽｜請看 <暫存資料夾>\/preview\.jpg 和 <暫存資料夾>\/zones-fs\.jpg\n請回：「可以」或「重做」$/],
    ['③ 分鏡表（s12 v2）', /^⏸ 停點 ③ 分鏡表（s12 v2）｜請看 work\/versions\/s12\/v2\/分鏡\.md\n請回：「可以」或要改的拍$/]]) {
    touch(p, 'work/製作進度.md', STOP_TABLE(`| ${at} | ${row} | 待回覆 | — | — |`));
    assert.match(projectStatus(p).stopLine, re);
  }
  fs.rmSync(p, { recursive: true });
});

test('背景工作：prep、rough、deliver 還在跑 → 下一步是同一條指令；prepare、prerender 是順便做的，不擋流程', () => {
  const p = mk();
  touch(p, 'assets/camera/a.mp4');
  const tool = path.join(TOOLS, 'media.mjs');
  touch(p, 'work/.jobs/prepare.json', JSON.stringify({ name: 'prepare', pid: process.pid, state: 'running', argv: [tool, '--prepare'] }));
  assert.equal(projectStatus(p).job, null);
  touch(p, 'work/.jobs/prep.json', JSON.stringify({ name: 'prep', pid: process.pid, state: 'running', argv: [tool, 'prep', '--project', 'projects/我的 影片'] }));
  let s = projectStatus(p);
  assert.equal(s.job, 'prep');
  assert.match(s.at, /背景工作 prep 還在跑/);
  assert.match(s.next, /接著等，不會重跑/);
  assert.match(s.cmd, /^node .*media\.mjs prep --project "projects\/我的 影片"$/);
  // 做完了、結果還沒印：一樣跑同一條
  touch(p, 'work/.jobs/prep.json', JSON.stringify({ name: 'prep', pid: process.pid, state: 'done', code: 0, reported: false, argv: [tool, 'prep', '--project', 'x'] }));
  assert.match(projectStatus(p).next, /印出結果/);
  touch(p, 'work/.jobs/prep.json', JSON.stringify({ name: 'prep', pid: process.pid, state: 'done', code: 0, reported: true, argv: [tool, 'prep'] }));
  assert.equal(projectStatus(p).job, null);
  // 中途被砍（pid 不在了）：不接著等，照判斷表
  touch(p, 'work/.jobs/prep.json', JSON.stringify({ name: 'prep', pid: 2 ** 30, state: 'running', argv: [tool, 'prep'] }));
  assert.equal(projectStatus(p).job, null);
  fs.rmSync(p, { recursive: true });
});

// ---------- --mark ----------

test('--mark：加一列、時間工具蓋、印那一列；停點寫法都認；錯誤有 →；舊專案有「## 階段」照常', () => {
  assert.equal(normalizeStop('②'), '② 構圖');
  assert.equal(normalizeStop('構圖'), '② 構圖');
  assert.equal(normalizeStop('② 構圖'), '② 構圖');
  assert.equal(normalizeStop('③ 分鏡表（s12 v2）'), '③ 分鏡表（s12 v2）');
  assert.equal(normalizeStop('分鏡表（s12 v2）'), '③ 分鏡表（s12 v2）');
  assert.equal(normalizeStop('④ Studio 預覽'), '④ 完成影片預覽');
  assert.throws(() => normalizeStop('構圖台'), /看不懂的停點「構圖台」→ 只有 ① 剪輯清單/);
  const p = mk();
  const r = STATUS('--project', p, '--mark', '② 構圖', '--state', '待回覆');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout.trim(), /^\| \d{4}-\d{2}-\d{2} \d{2}:\d{2} \| ② 構圖 \| 待回覆 \| — \| — \|$/);
  const r2 = STATUS('--project', p, '--mark', '②', '--state', '修改後重停', '--said', '「把框放大一點」', '--back', 'plan.json', '--json');
  const j = JSON.parse(r2.stdout);
  assert.match(j.row, /\| ② 構圖 \| 修改後重停 \| 「把框放大一點」 \| plan\.json \|$/, '原話已經有「」不要包兩層');
  const bad = STATUS('--project', p, '--mark', '② 構圖', '--state', '完成');
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /沒有「完成」這個狀態 → 只有 待回覆、通過、修改後重停、略過/);
  assert.match(STATUS('--project', p, '--mark', '② 構圖').stderr, /--mark 要加 --state →/);
  assert.match(STATUS('--project', p, '--state', '通過').stderr, /--mark 要寫哪一個停點 →/);
  const log = readStopLog(fs.readFileSync(progressFile(p), 'utf8'));
  assert.equal(log.rows.length, 2, '錯的不寫');
  assert.equal(log.last.get('② 構圖').state, '修改後重停');
  fs.rmSync(p, { recursive: true });
  // 舊專案：有「## 階段」、開工決策表四欄
  const q = mk();
  const old = ['# 製作進度：old', '', '## 開工決策表', '', '| 欄 | 值 | 怎麼看 | 會影響什麼 |', '|---|---|---|---|', '| 主軌種類 | 1 支 | x | y |', '| 版式 | 橫式（x） | x | y |', '| 構圖 | 待停點 ② | x | y |', '',
    '## 階段', '', '| 階段 | Skill | 狀態 | 產物 |', '|---|---|---|---|', '| 剪乾淨 | auto-edit-rough | ✅ | work/cuts.md |', '',
    '## 停點紀錄', '', '| 時間 | 停點 | 狀態 | 使用者原話 | 寫回哪裡 |', '|---|---|---|---|---|', '| 2026-11-06 16:05 | ① 剪輯清單 | 待回覆 | — | — |', '',
    '## 回饋輪', '', '| 輪 | 時間 | 檔案 | 改了哪幾段 | 備份 |', '|---|---|---|---|---|', ''].join('\n');
  touch(q, 'work/製作進度.md', old);
  touch(q, 'work/hyperframes/plan.json', JSON.stringify({ version: 1, frame: [128, 72, 1536, 864] }));
  const row = markStop(q, { stop: '② 構圖', state: '通過', said: '調好了', back: 'plan.json' });
  assert.match(row, /② 構圖 \| 通過 \| 「調好了」 \| plan\.json \|$/);
  const text = fs.readFileSync(progressFile(q), 'utf8');
  assert.match(text, /## 階段\n\n\| 階段 \| Skill \| 狀態 \| 產物 \|/, '「## 階段」不動');
  assert.match(text, /\| ① 剪輯清單 \| 待回覆 \| — \| — \|\n\| .* \| ② 構圖 \| 通過 \|/);
  assert.equal(readFacts(q).構圖, '1.25 倍', '② 通過：構圖跟著填');
  markStop(q, { stop: '② 構圖', state: '通過' });
  fs.writeFileSync(path.join(q, 'work', 'hyperframes', 'plan.json'), JSON.stringify({ version: 1 }));
  markStop(q, { stop: '②', state: '略過' });
  assert.equal(readFacts(q).構圖, '不裁切');
  fs.rmSync(q, { recursive: true });
});

// ---------- --init ----------

const ffmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
// 同樣的素材這一輪只做一次（檔名帶副檔名：ffmpeg 照副檔名選格式），各專案複製一份
const clip = (f, size, secs = 2) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.copyFileSync(fixture(`status-clip-${size}-${secs}s${path.extname(f)}`, (o) => {
    const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `testsrc=size=${size}:rate=10`, '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=16000', '-t', String(secs), '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', o]);
    assert.equal(r.status, 0, String(r.stderr));
  }), f);
};
const voice = (f, secs = 3) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.copyFileSync(fixture(`status-voice-${secs}s${path.extname(f)}`, (o) => {
    const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=16000', '-t', String(secs), '-c:a', 'aac', o]);
    assert.equal(r.status, 0, String(r.stderr));
  }), f);
};

test('mainKindText：只有真人／真人＋聲音（混用）／只有聲音，並寫各幾支', () => {
  const c = (kind, file = `assets/x/${kind}.mp4`) => ({ kind, file });
  assert.equal(mainKindText([]), '待主軌素材');
  assert.equal(mainKindText([c('camera', 'assets/camera/a.mp4')]), '只有真人：真人 1 支（assets/camera/a.mp4）');
  assert.equal(mainKindText([c('camera'), c('camera')]), '只有真人：真人 2 支（多支：停點 ① 確認順序）');
  assert.equal(mainKindText([c('camera'), c('voice'), c('voice')]), '真人＋聲音（混用）：真人 1 支、聲音 2 支（多支：停點 ① 確認順序）');
  assert.equal(mainKindText([c('camera'), c('screen')]), '真人＋聲音（混用）：真人 1 支、邊錄邊講的螢幕錄影 1 支（多支：停點 ① 確認順序）');
  assert.equal(mainKindText([c('voice', 'assets/voice/a.m4a')]), '只有聲音：聲音 1 支（assets/voice/a.m4a）');
  assert.equal(mainKindText([c('voice'), c('screen')]), '只有聲音：聲音 1 支、邊錄邊講的螢幕錄影 1 支（多支：停點 ① 確認順序）');
});

test('initProgress：自動填開工決策表；canvas 讀得到版式；第二次只補空的；--format 蓋掉', { skip: !ffmpeg && '沒有 ffmpeg' }, async () => {
  const { resolveFormat } = await imp('lib/canvas.mjs');
  // 還沒放素材：不寫版式（寫了之後放直拍素材會對不上）
  const p = mk();
  let r = initProgress(p);
  assert.equal(r.created, true);
  assert.equal(r.facts.主軌種類, '待主軌素材');
  assert.equal(r.facts.版式, '待主軌素材');
  assert.equal(r.facts['長度（秒）'], '待主軌素材');
  assert.equal(r.facts.有沒有講稿, '沒有');
  assert.equal(r.facts['有沒有螢幕錄影／圖片'], '沒有');
  assert.equal(r.facts.有沒有業配段, '未知（沒有講稿）');
  assert.equal(r.facts.構圖, '待停點 ②');
  assert.equal(resolveFormat({ projectDir: p }).source, 'default', '「待」不算版式');
  // 放了素材（直拍）：第二次把「待」補上
  clip(path.join(p, 'assets/camera/a.mp4'), '360x640');
  touch(p, '講稿.md', '# 標題\n今天的影片由 XX 贊助\n');
  touch(p, 'assets/images/a.png');
  touch(p, 'assets/images/b.png');
  r = initProgress(p);
  assert.equal(r.created, false);
  assert.equal(r.facts.主軌種類, '只有真人：真人 1 支（assets/camera/a.mp4）');
  assert.match(r.facts.版式, /^直式（主軌 assets\/camera\/a\.mp4 360×640，寬 < 高；使用者沒指定）$/);
  assert.equal(r.facts['長度（秒）'], '2');
  assert.equal(r.facts.有沒有講稿, '有（講稿.md）', '上次還沒有的講稿現在有了');
  assert.equal(r.facts['有沒有螢幕錄影／圖片'], '圖片 2 張');
  assert.equal(r.facts.有沒有業配段, '可能有，待確認（講稿提到「贊助」）');
  // 有人決定過的不蓋：問過使用者「沒有業配」、構圖定了
  const { setFact } = await imp('lib/progress.mjs');
  setFact(p, '有沒有業配段', '沒有（使用者確認）');
  setFact(p, '構圖', '1.15 倍');
  setFact(p, '版式', '直式（使用者說做 Shorts）');
  r = initProgress(p);
  assert.equal(r.facts.有沒有業配段, '沒有（使用者確認）');
  assert.equal(r.facts.構圖, '1.15 倍');
  assert.equal(r.facts.版式, '直式（使用者說做 Shorts）');
  assert.deepEqual(r.warnings, []);
  fs.rmSync(p, { recursive: true });
});

test('initProgress：橫式、多支混用、只有聲音、業配字眼、plan.json 的 format、--format 蓋掉已經寫的', { skip: !ffmpeg && '沒有 ffmpeg' }, async () => {
  const { resolveFormat } = await imp('lib/canvas.mjs');
  const a = mk();
  clip(path.join(a, 'assets/camera/a.mp4'), '640x360');
  voice(path.join(a, 'assets/voice/b.m4a'));
  clip(path.join(a, 'assets/screen/s.mp4'), '640x360');
  touch(a, '講稿.md', '這段是業配\n');
  let r = initProgress(a);
  assert.equal(r.created, true);
  assert.equal(r.facts.主軌種類, '真人＋聲音（混用）：真人 1 支、聲音 1 支（多支：停點 ① 確認順序）');
  assert.match(r.facts.版式, /^橫式（主軌 assets\/camera\/a\.mp4 640×360，寬 ≥ 高；使用者沒指定）$/);
  assert.match(r.facts['長度（秒）'], /^5(\.\d)?（各支相加）$/);
  assert.equal(r.facts['有沒有螢幕錄影／圖片'], '螢幕錄影 1 支');
  assert.equal(r.facts.有沒有業配段, '可能有，待確認（講稿提到「業配」）');
  assert.equal(resolveFormat({ projectDir: a }).source, 'progress');
  assert.equal(resolveFormat({ projectDir: a }).format, 'landscape', 'canvas.mjs 讀得到開頭兩個字');
  // 接過主軌：看 main.json
  touch(a, 'work/main.json', JSON.stringify({ clips: [{ file: 'assets/voice/b.m4a', kind: 'voice', start: 0, end: 3 }] }));
  // --format 蓋掉已經寫的版式；直拍素材才能做直式：formatErrors 的 ✖ 訊息放進 warnings
  r = initProgress(a, { format: 'portrait' });
  assert.equal(r.facts.版式, '直式（使用者指定）');
  assert.equal(resolveFormat({ projectDir: a }).format, 'portrait');
  fs.rmSync(a, { recursive: true });
  // 只有聲音：沒有寬高，橫式
  const v = mk();
  voice(path.join(v, 'assets/voice/a.m4a'));
  r = initProgress(v);
  assert.equal(r.facts.主軌種類, '只有聲音：聲音 1 支（assets/voice/a.m4a）');
  assert.match(r.facts.版式, /^橫式（主軌 只有聲音/);
  assert.equal(hasCamera(v), false);
  fs.rmSync(v, { recursive: true });
  // plan.json 寫了 format：跟 plan.json（不然 build 會報兩邊不一致）
  const q = mk();
  clip(path.join(q, 'assets/camera/a.mp4'), '640x360');
  touch(q, 'work/hyperframes/plan.json', JSON.stringify({ version: 1, format: 'portrait' }));
  r = initProgress(q);
  assert.equal(r.facts.版式, '直式（plan.json 的 format）');
  assert.ok(r.warnings.some((w) => /直式專案的主軌是橫的/.test(w)), '橫拍素材不能做直式：formatErrors 的訊息要讓 agent 看到');
  fs.rmSync(q, { recursive: true });
});

test('--init CLI：印開工決策表與下一步；壞掉的主軌不會整個失敗', () => {
  const p = mk();
  touch(p, 'assets/camera/a.mp4', '不是影片');
  const r = STATUS('--project', p, '--init');
  assert.equal(r.status, 0, r.stderr);
  const L = r.stdout.trim().split('\n');
  assert.match(L[0], /^製作進度：.*work\/製作進度\.md（新建）$/);
  assert.match(r.stdout, /主軌種類：只有真人：真人 1 支/);
  assert.match(r.stdout, /版式：待確認（ffprobe 讀不到主軌的寬高）/);
  assert.match(r.stdout, /長度（秒）：待確認（ffprobe 讀不到長度）/);
  assert.match(L.at(-2), /^→ 下一步：/);
  assert.match(L.at(-1), /media\.mjs prep --project /);
  const j = JSON.parse(STATUS('--project', p, '--init', '--json').stdout);
  assert.equal(j.created, false);
  assert.equal(j.facts.構圖, '待停點 ②');
  assert.match(STATUS('--project', p, '--init', '--format', 'square').stderr, /--format 只能是 landscape/);
  assert.match(STATUS('--project', p, '--nope').stderr, /沒有 --nope 這個參數/);
  fs.rmSync(p, { recursive: true });
});

test('--help 印檔頭：有 --mark、--init、--timeline', () => {
  const out = STATUS('--help').stdout;
  for (const s of ['--mark', '--init', '--timeline', '→ 下一步']) assert.ok(out.includes(s), s);
});

test('024 語意地圖：第一回合缺地圖 → --map-merge；全片校正沒過（沒有 _map.json 或地圖比它新）→ 再跑 --map-merge；過了才寫草稿（第二回合）；舊的包照舊', () => {
  const p = mk();
  const st = () => projectStatus(p);
  const at = '2026-11-02 10:00';
  touch(p, 'assets/camera/a.mp4');
  for (const f of ['work/main.mp4', 'work/cuts.md', 'work/rough.mp4', 'work/rough.srt.align-1', 'work/transcript.json', 'work/cutpoints.json', 'work/構圖預覽.jpg']) touch(p, f);
  touch(p, 'work/rough.srt', '1\n00:00:01,000 --> 00:00:02,000\n短句\n');
  touch(p, 'work/製作進度.md', STOP_TABLE(`| ${at} | ① 剪輯清單 | 通過 | 「可以」 | work/cuts.md |`, `| ${at} | ② 構圖 | 通過 | 「調好了」 | plan.json |`));
  touch(p, 'work/hyperframes/plan.json', JSON.stringify({ version: 1, speakerBox: [1, 2, 3, 4] }), 600);
  touch(p, 'work/分鏡素材/index.json', JSON.stringify({ parts: [{ key: 'ch01' }, { key: 'ch02' }], semanticMap: true }));
  touch(p, 'work/drafts/ch01.map.md', '#1–#3 | 步驟 | B | x | —', 60);
  assert.match(st().at, /第一回合：語意地圖（還缺 ch02）/);
  assert.match(st().next, /chapter-worker\.md 第一回合/);
  assert.match(st().cmd, /--map-merge$/);
  touch(p, 'work/drafts/ch02.map.md', '#4–#6 | 步驟 | B | x | —', 60);
  assert.equal(st().at, '剪好看／全片校正語意地圖');
  assert.match(st().next, /語意地圖\.md/);
  touch(p, 'work/drafts/_map.json', JSON.stringify({ passed: true }), 30);
  assert.match(st().at, /第二回合：寫分鏡草稿（還缺 ch01、ch02）/);
  assert.match(st().cmd, /--merge-drafts$/);
  touch(p, 'work/drafts/ch02.map.md', '#4–#6 | 步驟 | A | x | 理由', 0);
  assert.equal(st().at, '剪好看／全片校正語意地圖', '校正之後又改地圖：再跑一次 --map-merge');
  touch(p, 'work/drafts/_map.json', JSON.stringify({ passed: true }), 0);
  touch(p, 'work/drafts/ch01.json', '{}');
  touch(p, 'work/drafts/ch02.json', '{}');
  assert.equal(st().at, '剪好看／合併分鏡草稿');
  touch(p, 'work/分鏡素材/index.json', JSON.stringify({ parts: [{ key: 'ch01' }, { key: 'ch02' }, { key: 'ch03' }] }));
  assert.match(st().at, /^剪好看／寫分鏡草稿（還缺 ch03）/, '舊的包（沒有 semanticMap）照舊直接寫草稿');
});

test('025 跨集偏好：收集各專案 r<N>.md 的「建議改規則」（無、工具提示不算、同一句只問一次）→ --prefs-add／--prefs-skip 寫 shared/偏好.md → 不再問；--prefs-drop 拿掉', async () => {
  const S = await imp('status.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-prefs-'));
  const fb = (proj, n, line, extra = '') => { const d = path.join(root, 'projects', proj, 'work', 'feedback'); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, `r${n}.md`), `# 回饋 r${n}\n\n## 分類\n\n建議改規則：${line}\n${extra}\n## 改了哪幾段\n`); };
  fs.mkdirSync(path.join(root, 'shared'), { recursive: true });
  fb('ep1', 1, '無');
  fb('ep1', 2, '以後金句都放左邊');
  fb('ep2', 1, '（原話有「以後」：這集照做，這裡寫一條建議，不改 shared/、AGENTS.md）');
  fb('ep2', 2, '', '- 以後金句都放左邊。\n- 章節轉場一律不要音效\n');
  const notes = S.collectRuleNotes(root);
  assert.deepEqual(notes.map((n) => `${n.from}|${n.text}`), ['projects/ep1 r2|以後金句都放左邊', 'projects/ep2 r2|以後金句都放左邊。', 'projects/ep2 r2|章節轉場一律不要音效']);
  const pend = S.pendingPrefs(root);
  assert.deepEqual(pend.map((x) => `${x.id} ${x.text}`), ['a1 以後金句都放左邊', 'a2 章節轉場一律不要音效'], '同一句（差標點）只問一次');
  assert.match(S.prefsLines(root).join('\n'), /--prefs-add "a1,a2"/);
  const add = S.prefsApply(root, 'add', 'a1');
  assert.equal(add.added[0].text, '以後金句都放左邊');
  S.prefsApply(root, 'skip', 'a1');   // 編號重排：剩下那條變 a1
  const prefs = S.readPrefs(root);
  assert.deepEqual(prefs.keep.map((x) => x.text), ['以後金句都放左邊']);
  assert.match(prefs.keep[0].from, /^projects\/ep1 r2，\d{4}-\d\d-\d\d$/);
  assert.deepEqual(prefs.skip.map((x) => x.text), ['章節轉場一律不要音效']);
  assert.deepEqual(S.pendingPrefs(root), [], '都問過了');
  S.prefsApply(root, 'add', '字卡不要用紅色');
  assert.equal(S.readPrefs(root).keep.length, 2);
  assert.throws(() => S.prefsApply(root, 'add', 'a9'), /沒有 a9 這一條/);
  assert.equal(S.prefsDrop(root, '1').gone.text, '以後金句都放左邊');
  assert.throws(() => S.prefsDrop(root, '5'), /沒有第 5 條/);
  const md = fs.readFileSync(S.prefsFile(root), 'utf8');
  assert.match(md, /## 照做\n\n- 字卡不要用紅色（使用者說的，\d{4}-\d\d-\d\d）\n\n## 不採用\n\n- 章節轉場一律不要音效（/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('子代理一次最多派幾個：shared/setting.json 的 agents（沒有檔、格式不對＝10）；--agents 只收 1–16 的整數，不動檔裡其他設定', async () => {
  const A = await imp('lib/agents.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-agents-'));
  assert.equal(A.agentLimit(dir), 10, '沒有設定檔：預設 10');
  fs.writeFileSync(path.join(dir, A.SETTINGS_FILE), '{"agents": 99, "other": true}');
  assert.equal(A.agentLimit(dir), 10, '超出範圍：當成沒設定');
  assert.equal(A.saveAgentLimit(dir, '6').n, 6);
  assert.equal(A.agentLimit(dir), 6);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, A.SETTINGS_FILE), 'utf8')), { agents: 6, other: true }, '其他設定留著');
  for (const bad of ['0', '17', '2.5', 'abc']) assert.throws(() => A.saveAgentLimit(dir, bad), /1–16 的整數/);
  assert.equal(A.agentLimit(dir), 6, '寫錯不會蓋掉原本的值');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('影片摘要 work/摘要.md：300 字內、一到兩句描述＋2–6 個列點；字數不算空白和記號；--summary 驗、status 在有初剪又沒寫時提醒', async () => {
  const M = await imp('lib/summary.mjs');
  const p = mk();
  assert.equal(M.readSummary(p).state, 'none');
  const good = '# 影片摘要\n\n用 AI 把重複的工作做成小工具，講給上班族聽。\n\n- 痛點：手動整理留言\n- **解法**：隔離環境\n';
  touch(p, 'work/摘要.md', good);
  const ok = M.readSummary(p);
  assert.equal(ok.state, 'ok');
  assert.equal(ok.text, '用 AI 把重複的工作做成小工具，講給上班族聽。\n- 痛點：手動整理留言\n- **解法**：隔離環境');
  assert.equal(ok.chars, M.summaryChars('用AI把重複的工作做成小工具，講給上班族聽。痛點：手動整理留言解法：隔離環境'));
  touch(p, 'work/摘要.md', `# 影片摘要\n\n${'字'.repeat(301)}\n\n- 一\n- 二\n`);
  assert.match(M.readSummary(p).errors.join(), /最多 300 字/);
  touch(p, 'work/摘要.md', '- 一\n- 二\n');
  assert.match(M.readSummary(p).errors.join(), /少了開頭的描述/);
  touch(p, 'work/摘要.md', `描述\n\n${Array.from({ length: 7 }, (_, i) => `- 第 ${i} 點`).join('\n')}\n`);
  assert.match(M.readSummary(p).errors.join(), /最多 6 個/);
  const run = (...a) => spawnSync(process.execPath, [path.join(TOOLS, 'status.mjs'), '--project', p, ...a], { encoding: 'utf8' });
  assert.equal(run('--summary').status, 1);
  touch(p, 'work/摘要.md', good);
  const r = run('--summary');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^✓ 摘要：\d+ 字/);
  // status：沒有初剪不提醒；有初剪、沒摘要才提醒
  fs.rmSync(path.join(p, 'work', '摘要.md'));
  assert.doesNotMatch(run().stdout, /^摘要：/m);
  touch(p, 'work/rough.srt', '1\n00:00:00,000 --> 00:00:01,000\n測試\n');
  assert.match(run().stdout, /^摘要：⚠ 還沒寫 work\/摘要\.md/m);
  touch(p, 'work/摘要.md', good);
  assert.doesNotMatch(run().stdout, /^摘要：/m);
  fs.rmSync(p, { recursive: true, force: true });
});
