// 072 修改單清單存在專案裡（work/feedback/editor-requests-list.json）：只送改了的段，每段帶 base；
//   專案裡那段被別的分頁改過就不套（舊分頁不會蓋掉新寫的草稿），回傳現在的整份
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { imp, tmpDir } from './helpers.mjs';

const R = await imp('editor/server/requests.mjs');

test('修改單清單：沒有檔＝空的；新增、換掉、拿掉照 base 套；別的分頁改過的段不套、列進 skipped；格式不對 400', (t) => {
  const project = tmpDir(t, 'rq-list-'), ctx = { P: { project } };
  assert.deepEqual(R.requestsList(project), { exists: false, rev: 0, list: [] });
  const a = { id: 's01', tags: [], note: '草稿一', t: 1 }, b = { id: 's02', tags: ['更有質感'], note: '', t: 2 };
  let [s, o] = R.doRequestsList(ctx, { ops: [{ id: 's01', item: a, base: null }, { id: 's02', item: b, base: null }] });
  assert.equal(s, 200);
  assert.deepEqual(o.list, [a, b]);
  assert.deepEqual(o.skipped, []);
  const file = path.join(project, 'work/feedback/editor-requests-list.json');
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).list, [a, b]);
  const rev1 = o.rev;
  assert.equal(R.requestsList(project).rev, rev1);
  // 分頁 A 改 s01（base 是它看到的那一份）
  const a2 = { ...a, note: '草稿一（改過）', t: 3 };
  [s, o] = R.doRequestsList(ctx, { ops: [{ id: 's01', item: a2, base: JSON.stringify(a) }] });
  assert.deepEqual(o.list, [a2, b]);
  assert.ok(o.rev > rev1);
  // 舊分頁 B 還拿著改之前的 s01：它的改動不套，回傳現在的整份；同一次送的 s02 照套
  const stale = { ...a, done: { round: 'r7', note: '改好了' }, note: '', t: 1 };
  [s, o] = R.doRequestsList(ctx, { ops: [{ id: 's01', item: stale, base: JSON.stringify(a) }, { id: 's02', item: null, base: JSON.stringify(b) }] });
  assert.deepEqual(o.skipped, ['s01']);
  assert.deepEqual(o.list, [a2], '舊分頁不會蓋掉新寫的草稿；s02 拿掉了');
  // 新增的段專案裡已經有（別的分頁先加了）也不套
  [s, o] = R.doRequestsList(ctx, { ops: [{ id: 's01', item: { id: 's01', tags: [], note: 'x', t: 9 }, base: null }] });
  assert.deepEqual(o.skipped, ['s01']);
  // 什麼都沒變：rev 不動、不重寫
  const rev2 = R.requestsList(project).rev;
  [s, o] = R.doRequestsList(ctx, { ops: [] });
  assert.equal(o.rev, rev2);
  for (const bad of [null, {}, { ops: 'x' }, { ops: [{ id: '' }] }, { ops: [{ id: 's01', item: { id: 's09' } }] }, { ops: [{ id: 's01', base: 3 }] }]) assert.equal(R.doRequestsList(ctx, bad)[0], 400, JSON.stringify(bad));
});
