// status.mjs：只讀檔判斷做到哪一步、停點紀錄、下一輪回饋編號（specs/contracts/cli-002.md §5）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { TOOLS, imp } from './helpers.mjs';

const { projectStatus, readStopLog } = await imp('status.mjs');
const mk = () => {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-status-'));
  for (const d of ['真人錄影', '聲音', '螢幕錄影', '圖片']) fs.mkdirSync(path.join(p, '素材', d), { recursive: true });
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

test('判斷表：S0–S14 由上往下第一個符合', () => {
  const p = mk();
  const st = () => projectStatus(p).stage;
  assert.equal(st(), 'S0');
  touch(p, '素材/真人錄影/a.mp4');
  touch(p, '素材/聲音/b.m4a');
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
  touch(p, 'work/構圖預覽-套卡.jpg');
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
  touch(p, '成片/final.mp4');
  assert.equal(st(), 'S13');
  touch(p, '成片/驗收截圖/qc-sheet.jpg');
  assert.equal(st(), 'S14');
  fs.rmSync(p, { recursive: true });
});

test('停點紀錄：同一停點以最後一列為準；待回覆的停點蓋過判斷表；r 編號；不寫任何檔', () => {
  const p = mk();
  touch(p, '素材/真人錄影/a.mp4');
  touch(p, 'work/cuts.md');
  const log = ['# 製作進度', '', '## 停點紀錄', '', '| 時間 | 停點 | 狀態 | 使用者原話 | 寫回哪裡 |', '|---|---|---|---|---|',
    '| 2026-11-02 14:10 | ① 剪輯清單 | 待回覆 | — | — |', '| 2026-11-02 14:20 | ① 剪輯清單 | 通過 | 「清單沒問題，繼續」 | work/cuts.md |', '| 2026-11-02 15:30 | ③ 分鏡表 | 待回覆 | — | — |', ''].join('\n');
  touch(p, 'work/製作進度.md', log);
  touch(p, 'work/回饋/r1.md');
  touch(p, 'work/回饋/r3.md');
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
  const lines = r.stdout.trim().split('\n');
  assert.deepEqual(lines.map((l) => l.split('：')[0]), ['版式', '專案', '目前在', '下一步', '下一個停點', '待回覆停點', '下一輪回饋編號', '依據']);
  assert.match(lines[0], /^版式：橫式 1920×1080（來源：/);
  const j = JSON.parse(spawnSync(process.execPath, [path.join(TOOLS, 'status.mjs'), '--project', p, '--json'], { encoding: 'utf8' }).stdout);
  assert.deepEqual(Object.keys(j), ['project', 'stage', 'at', 'next', 'cmd', 'nextStop', 'waiting', 'feedback', 'evidence', 'format', 'formatSource']);
  assert.deepEqual(snapshot(p), before, '跑完前後檔案與修改時間不變');
  fs.rmSync(p, { recursive: true });
});

test('A-02：srt-split 的備份（rough.srt.split-*）不算 snap-srt 跑過，停在 S6；有 rough.srt.bak-* 才往下', () => {
  const p = mk();
  touch(p, '素材/真人錄影/a.mp4');
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
  touch(p, '素材/真人錄影/a.mp4');
  for (const f of ['work/cuts.md', 'work/rough.mp4', 'work/transcript.json']) touch(p, f);
  touch(p, 'work/rough.srt', '1\n00:00:01,000 --> 00:00:02,000\n短句\n');
  const s = projectStatus(p);
  assert.equal(s.stage, 'S5');
  assert.match(s.next, /media\.mjs srt-align --dry-run/);
  touch(p, 'work/rough.srt.align-20261031-120000');
  assert.equal(projectStatus(p).stage, 'S7');
});

test('C-01：構圖預覽（S8）前講者調光瘦臉還沒好 → 下一步＝lookNextStep 的說明，指令另外一行（cmd）', async () => {
  const { lookNextStep } = await imp('lib/look.mjs');
  const p = mk();
  touch(p, '素材/真人錄影/a.mp4');
  for (const f of ['work/cuts.md', 'work/rough.mp4', 'work/rough.srt.align-1', 'work/rough.srt.bak-1', 'work/cutpoints.json']) touch(p, f);
  touch(p, 'work/rough.srt', '1\n00:00:01,000 --> 00:00:02,000\n短句\n');
  const ns = lookNextStep({ projectDir: p, plan: {} });
  const s = projectStatus(p);
  assert.equal(s.stage, 'S8');
  if (ns.done) assert.equal(s.cmd, null);
  else { assert.equal(s.next, ns.note); assert.equal(s.cmd, ns.cmd); }
});
