// 059 設計師提速：驗收最後一行只給一個下一步（改／看拼圖／交件／停手）、每段驗收的紀錄（次數、分鐘）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { imp } from './helpers.mjs';

const A = await imp('audit.mjs');
const T = await imp('lib/tries.mjs');
const F = await imp('lib/flow.mjs');

const rep = (o = {}) => ({ only: ['d01'], segments: [{ id: 'd01', samples: [] }], errors: [], warnings: [], notes: [], findings: [], sheets: [{ file: 'work/audit-shots/sheet-d01.jpg' }], ...o });
const err = { id: 'd01', level: 'error', rule: 'overflow' }, sparse = { id: 'd01', level: 'warn', rule: 'design-sparse' }, other = { id: 'd01', level: 'warn', rule: 'sla' };

test('驗收最後一行：有 ✖ → 改（帶第幾次）；第一次通過 → 看拼圖（點名要修的 ⚠）；第二次通過 → 交件；到上限 → 停手', () => {
  assert.equal(A.AUDIT_TRY_MAX, 4);
  assert.equal(A.nextLine(rep({ only: null })), null, '主代理（沒帶 --only）不印');
  assert.match(A.nextLine(rep({ findings: [err], tries: 2 })), /^→ 改：用 edit 改上面 ✖ 那幾處（不要整份重寫），再跑同一條驗收（這是第 2 次；第 4 次還有 ✖ 就停手）。$/);
  const first = A.nextLine(rep({ findings: [other], nth: 1 }));
  assert.match(first, /^→ 看拼圖：用看圖的工具打開 work\/audit-shots\/sheet-d01\.jpg 看一次：/);
  assert.match(first, /上面的 ⚠ 不用修/);
  assert.match(first, /都對就交件/);
  assert.doesNotMatch(first, /修掉/, '一般的 ⚠ 不用修');
  assert.match(A.nextLine(rep({ findings: [sparse, other], nth: 1 })), /用 edit 修掉「畫面太空」.*改完再跑同一條驗收（下一次就是交件）/);
  assert.match(A.nextLine(rep({ findings: [sparse], nth: 2 })), /^→ 交件：⚠ 不用再修，也不要再跑驗收。/);
  assert.match(A.nextLine(rep({ findings: [err], stop: 4 })), /^→ 停手：這一段已經驗收 4 次還有 ✖/);
  // formatReport：--only 的最後一行就是它，停手不重複印
  const out = A.formatReport(rep({ findings: [err], stop: 4 })).split('\n');
  assert.equal(out.filter((l) => l.startsWith('→ 停手')).length, 1);
  assert.match(out.at(-1), /^→ 停手/);
});

test('每段驗收的紀錄：派工之後的次數與分鐘，給 --design-status、--review、finish 印', (t) => {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-059-'));
  t.after(() => fs.rmSync(p, { recursive: true, force: true }));
  const P = { project: p, out: path.join(p, 'work', 'hyperframes') };
  const t0 = Date.now() - 10 * 60000;
  T.logAudit(p, 'd01', { e: 3, w: 1 }, t0 - 60000);   // 上一次派工之前的，不算
  fs.mkdirSync(path.join(p, 'work', '.jobs'), { recursive: true });
  fs.writeFileSync(path.join(p, 'work', '.jobs', 'dispatch.json'), JSON.stringify({ d01: { n: 2, at: t0 } }));
  T.logAudit(p, 'd01', { e: 2, w: 0 }, t0 + 3 * 60000);
  T.logAudit(p, 'd01', { e: 0, w: 2 }, t0 + 7 * 60000);
  assert.deepEqual(F.designTiming(P, 'd01'), { n: 2, e: 0, w: 2, min: 7 });
  assert.equal(F.designTiming(P, 'd02'), null);
  assert.equal(F.designTimingLine(P, ['d01', 'd02']), '內容設計動畫：d01 驗收 2 次、7 分鐘（派工到最後一次驗收）');
  assert.equal(F.designTimingLine(P, ['d02']), '');
});

test('brief 列出字幕講到、圖庫裡有的物件（照講到的順序、最多 8 個、整行寫法照抄就能用）', async () => {
  const { TEMPLATE } = await import('./helpers.mjs');
  const P = { templateDir: TEMPLATE, project: 'projects/x' };
  const out = F.briefPics(P, '我需要在兩支手機間走來走去，我上網搜尋了許多電腦控制手機');
  const rows = out.split('\n').filter((l) => l.startsWith('- '));
  assert.match(out, /^## 圖庫裡有的物件/);
  assert.match(rows[0], /^- 「手機」→ 手機：<div data-illus-src="kit\/pics\/device\/phone\.svg" style="width:320px;height:320px"><\/div>$/);
  assert.ok(rows.some((l) => l.includes('kit/pics/device/laptop.svg')), '電腦 → 筆電');
  assert.ok(rows.length <= 8);
  assert.match(out, /--pics <詞>/);
  assert.equal(F.briefPics(P, '嗯嗯對'), '', '沒講到實物就不放這一節');
});
