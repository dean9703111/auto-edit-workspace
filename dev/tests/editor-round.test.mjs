// 068 修改單「已改完」：只列最近一輪回饋的修改紀錄；每段可以用上一版（versions.mjs use），檢查沒過就換回原本那一版
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseChanged, latestRound, roundInfo, startUse } from '../../shared/template/tools/editor/server/rounds.mjs';
import { TEMPLATE } from './helpers.mjs';

const R5 = '# 回饋 r5（2026-11-19 12:12）\n\n## 原話\n\n「全片優化」\n\n## 改了哪幾段\n\n'
  + '- m0207：retime：8 項 → 9 項（v1 → v2）\n- x0209：x-design-x0209.html 改了（v2 → v3）\n- m0504：新的段（→ v1）\n- x0502：這段從 plan.json 拿掉了\n\n## 驗證\n\n- ok\n';
const roundMd = (n, rows) => `# 回饋 r${n}（2026-11-19 13:00）\n\n## 原話\n\n「x」\n\n## 改了哪幾段\n\n${rows}\n\n## 驗證\n`;

function mk(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-round-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const project = path.join(root, 'projects', 'ex');
  for (const d of ['work/feedback', 'work/hyperframes', 'work/versions']) fs.mkdirSync(path.join(project, d), { recursive: true });
  const plan = path.join(project, 'work/hyperframes/plan.json');
  fs.writeFileSync(plan, '{}');
  fs.writeFileSync(path.join(project, 'work/feedback/r5.md'), R5);
  return { root, project, plan, templateDir: TEMPLATE };
}
// 假的 versions.mjs：list 回每段現在用哪一版；use 可以設定成檢查沒過（開著一輪、印 ✖）
function fake(P, cur, { failUse = false } = {}) {
  const calls = [];
  const run = async (args) => {
    const a = args.slice(1, args.indexOf('--project'));
    calls.push(a.join(' '));
    if (a[0] === 'list') {
      const ids = a[a.indexOf('--seg') + 1].split(',');
      return { code: 0, out: JSON.stringify({ segs: ids.map((id) => ({ id, versions: cur[id] ? [{ v: cur[id], current: true }] : [] })) }) };
    }
    if (a[0] === 'use' && a.includes('--said')) {
      await new Promise((r) => setTimeout(r, 50));   // 真的 use 要跑 build、audit：跑的時候不能再換別段
      fs.writeFileSync(path.join(P.project, 'work/feedback/r6.md'), roundMd(6, `- ${a[2]}：退回（v2 → v1）`));
      if (failUse) {
        fs.writeFileSync(path.join(P.project, 'work/versions/.state.json'), JSON.stringify({ round: { open: true, n: 6 } }));
        return { code: 1, out: '回饋 r6\n✖ [m0207] 和 m0208 時間重疊 → to 往前\n' };
      }
      cur[a[2]] = a[4];
    }
    if (a[0] === 'finish') fs.writeFileSync(path.join(P.project, 'work/versions/.state.json'), JSON.stringify({ round: { open: false, n: 6 } }));
    return { code: 0, out: '' };
  };
  return { calls, run };
}
const done = () => { let f; const p = new Promise((r) => { f = r; }); return [p, f]; };

test('parseChanged：改過（vA → vB）、新的段、拿掉的段；還沒收尾的佔位字不算', () => {
  assert.deepEqual(parseChanged(R5), [
    { id: 'm0207', kind: 'changed', note: 'retime：8 項 → 9 項', before: 'v1', after: 'v2' },
    { id: 'x0209', kind: 'changed', note: 'x-design-x0209.html 改了', before: 'v2', after: 'v3' },
    { id: 'm0504', kind: 'new', note: '新的段' },
    { id: 'x0502', kind: 'removed', note: '這段從 plan.json 拿掉了' },
  ]);
  assert.deepEqual(parseChanged('## 改了哪幾段\n\n（versions.mjs finish 會填）\n'), []);
});

test('latestRound：最近一輪＝編號最大、不是剪輯台退回開的、不是還沒收尾的、有改段紀錄', (t) => {
  const P = mk(t), fb = path.join(P.project, 'work/feedback');
  fs.writeFileSync(path.join(fb, 'r4.md'), roundMd(4, '- s01：改字（v1 → v2）'));
  fs.writeFileSync(path.join(fb, 'r6.md'), roundMd(6, '- m0207：退回（v2 → v1）'));
  fs.writeFileSync(path.join(fb, 'r7.md'), roundMd(7, '（versions.mjs finish 會填）'));
  assert.equal(latestRound(P.project).round, 'r6', '別人開的回饋輪照算');
  fs.writeFileSync(path.join(fb, 'editor-reverts.json'), JSON.stringify({ r6: { seg: 'm0207', ver: 'v1', of: 'r5' } }));
  const r = latestRound(P.project, 7);
  assert.equal(r.round, 'r5', '剪輯台退回開的 r6 跳過，「已改完」還是 r5 那一輪');
  assert.equal(r.time, '2026-11-19 12:12');
  assert.equal(r.rows.length, 4);
});

test('roundInfo＋startUse：每段現在用哪一版；用上一版走 versions.mjs use，記成剪輯台退回的那一輪；跑完「已改完」還是同一輪', async (t) => {
  const P = mk(t);
  const cur = { m0207: 'v2', x0209: 'v2' };
  const f = fake(P, cur);
  const info = await roundInfo(P, { run: f.run });
  assert.equal(info.round, 'r5');
  assert.deepEqual(info.rows.map((r) => [r.id, r.state ?? r.kind]), [['m0207', 'kept'], ['x0209', 'reverted'], ['m0504', 'new'], ['x0502', 'removed']]);
  // 不能換：不是這一輪的版本、不是改過的段
  assert.equal((await startUse(P, { seg: 'm0207', ver: 'v9' }, { run: f.run }))[0], 400);
  assert.equal((await startUse(P, { seg: 'm0504', ver: 'v1' }, { run: f.run }))[0], 400);
  assert.equal((await startUse(P, { seg: 'x0209', ver: 'v2' }, { run: f.run }))[0], 409, '現在就是 v2');
  const [fin, ok] = done();
  const [s, o] = await startUse(P, { seg: 'm0207', ver: 'v1' }, { run: f.run, onDone: ok });
  assert.equal(s, 202);
  assert.equal(o.job.state, 'running');
  assert.equal((await startUse(P, { seg: 'x0209', ver: 'v3' }, { run: f.run }))[0], 409, '一次換一段');
  const j = await fin;
  assert.equal(j.state, 'done', j.message);
  assert.ok(f.calls.includes('use --seg m0207 --ver v1 --said 剪輯台：m0207 不採納 r5 的修改，用上一版 v1'), f.calls.join('\n'));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(P.project, 'work/feedback/editor-reverts.json'), 'utf8')).r6, { seg: 'm0207', ver: 'v1', of: 'r5', at: j.at });
  const after = await roundInfo(P, { run: f.run });
  assert.equal(after.round, 'r5', '退回開的 r6 不會蓋掉已改完');
  assert.equal(after.rows[0].state, 'reverted');
  // 退回後可以改回這一輪改的版本
  const [fin2, ok2] = done();
  assert.equal((await startUse(P, { seg: 'm0207', ver: 'v2' }, { run: f.run, onDone: ok2 }))[0], 202);
  assert.equal((await fin2).state, 'done');
  assert.ok(f.calls.includes('use --seg m0207 --ver v2 --said 剪輯台：m0207 改回 r5 改的版本 v2'), f.calls.join('\n'));
});

test('startUse：換了之後檢查沒過 → 換回原本那一版、finish --no-change 收掉那一輪，回報 ✖ 原文；AI 還在改時不能換', async (t) => {
  const P = mk(t);
  const f = fake(P, { m0207: 'v2', x0209: 'v3' }, { failUse: true });
  const [fin, ok] = done();
  assert.equal((await startUse(P, { seg: 'm0207', ver: 'v1' }, { run: f.run, onDone: ok }))[0], 202);
  const j = await fin;
  assert.equal(j.state, 'failed');
  assert.match(j.message, /m0207 換成 v1 之後檢查沒過，已換回原本的 v2：✖ \[m0207\] 和 m0208 時間重疊/);
  assert.deepEqual(f.calls.slice(-2), ['use --seg m0207 --ver v2', 'finish --no-change']);
  // AI 開著一輪（還沒收尾）時不能換
  fs.writeFileSync(path.join(P.project, 'work/versions/.state.json'), JSON.stringify({ round: { open: true, n: 6 } }));
  const [s, o] = await startUse(P, { seg: 'x0209', ver: 'v2' }, { run: f.run });
  assert.equal(s, 409);
  assert.match(o.message, /AI 正在改（r6 還沒收尾）/);
});
