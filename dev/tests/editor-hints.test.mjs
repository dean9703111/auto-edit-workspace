// 提示卡只跳第一次（044）：看過的記在 shared/setting.json 的 editor.seen，所有專案、所有 port 的剪輯台讀同一份；
// 只加這一個代號，其他設定留著；設定檔壞了不蓋掉、頁面拿到錯誤（退回瀏覽器自己記）；測試沒有指到暫存資料夾時動不到真的設定檔。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { TEMPLATE, WORKSPACE, imp, tmpDir } from './helpers.mjs';

const { startEditor } = await imp('editor.mjs');
const get = async (ed) => { const r = await fetch(new URL('/api/hints', ed.url)); return [r.status, await r.json()]; };
const post = async (ed, body) => { const r = await fetch(new URL('/api/hints', ed.url), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return [r.status, await r.json()]; };

// 兩個暫存專案、各開一個剪輯台（各佔一個 port），共用一個暫存的 shared/
async function twoEditors(t) {
  const root = tmpDir(t, 'hf-editor-hints-');
  const shared = path.join(root, 'shared'), setting = path.join(shared, 'setting.json');
  fs.mkdirSync(path.join(shared, 'template'), { recursive: true });
  const opened = [];
  t.after(() => Promise.all(opened.map((ed) => ed.close())));
  for (const name of ['alpha', 'beta']) {
    const project = path.join(root, 'projects', name);
    fs.mkdirSync(path.join(project, 'work'), { recursive: true });
    opened.push(await startEditor({ flags: { project, template: TEMPLATE }, cwd: root, port: 0, writeState: false, speakerTemplate: path.join(shared, 'template') }));
  }
  return { a: opened[0], b: opened[1], setting, read: () => JSON.parse(fs.readFileSync(setting, 'utf8')) };
}

test('/api/hints：在 A 專案的剪輯台關掉提示卡，另一個 port 的 B 專案也讀到；只加這一個代號，其他設定和 editor 底下別的欄位都留著', async (t) => {
  const { a, b, setting, read } = await twoEditors(t);
  assert.notEqual(a.port, b.port);
  assert.deepEqual(await get(a), [200, { seen: [] }], '還沒有設定檔：沒看過任何一張');
  assert.deepEqual(await get(b), [200, { seen: [] }]);

  const other = { speaker: { name: '測試講者', titles: ['工程師'] }, agents: 7, captions: { look: 'outline' }, editor: { later: { keep: true } } };
  fs.writeFileSync(setting, JSON.stringify(other));
  assert.deepEqual(await post(a, { seen: 'coach-final.v1' }), [200, { ok: true, seen: ['coach-final.v1'] }]);
  assert.deepEqual(await get(b), [200, { seen: ['coach-final.v1'] }], 'B 是另一個 port，讀同一份設定');
  assert.deepEqual(read(), { ...other, editor: { later: { keep: true }, seen: ['coach-final.v1'] } });

  // 同一張再關一次不重複；別張接在後面；從 B 寫，A 也讀得到
  assert.deepEqual(await post(b, { seen: 'coach-final.v1' }), [200, { ok: true, seen: ['coach-final.v1'] }]);
  assert.deepEqual(await post(b, { seen: 'coach.v2' }), [200, { ok: true, seen: ['coach-final.v1', 'coach.v2'] }]);
  assert.deepEqual(await get(a), [200, { seen: ['coach-final.v1', 'coach.v2'] }]);
  assert.deepEqual(read(), { ...other, editor: { later: { keep: true }, seen: ['coach-final.v1', 'coach.v2'] } });

  // 不像代號的不收，設定檔不動
  const before = fs.readFileSync(setting, 'utf8');
  for (const bad of [{}, { seen: '' }, { seen: 7 }, { seen: ['coach.v2'] }, { seen: '../x' }, { seen: 'Coach' }, { seen: 'a'.repeat(41) }]) {
    const [status, out] = await post(a, bad);
    assert.equal(status, 400, JSON.stringify(bad));
    assert.equal(out.error, 'badhint');
  }
  assert.equal(fs.readFileSync(setting, 'utf8'), before);
});

test('/api/hints：設定檔壞了、editor 不是物件都不蓋掉，讀的時候當成沒看過；手改進去的怪值不會回給頁面', async (t) => {
  const { a, b, setting, read } = await twoEditors(t);
  // 不是合法的 JSON：讀＝沒看過（頁面照舊跳一次）；寫＝回錯誤，檔案原封不動
  fs.writeFileSync(setting, '{ "speaker": { "name": "測試講者" }, ');
  assert.deepEqual(await get(a), [200, { seen: [] }]);
  let [status, out] = await post(a, { seen: 'coach.v2' });
  assert.equal(status, 500);
  assert.match(out.message, /不是合法的 JSON.*不會蓋掉它/);
  assert.equal(fs.readFileSync(setting, 'utf8'), '{ "speaker": { "name": "測試講者" }, ');

  // editor 被手改成不是物件：不蓋掉
  fs.writeFileSync(setting, JSON.stringify({ agents: 3, editor: '亂寫的' }));
  assert.deepEqual(await get(b), [200, { seen: [] }]);
  [status, out] = await post(b, { seen: 'coach.v2' });
  assert.equal(status, 409);
  assert.equal(out.error, 'badsettings');
  assert.deepEqual(read(), { agents: 3, editor: '亂寫的' });

  // seen 裡手改進去的怪值、重複的：回給頁面的只有像代號的，寫的時候順手整理掉
  fs.writeFileSync(setting, JSON.stringify({ agents: 3, editor: { seen: ['coach.v2', 7, null, '<b>', 'coach.v2', 'coach-rough.v1'] } }));
  assert.deepEqual(await get(a), [200, { seen: ['coach.v2', 'coach-rough.v1'] }]);
  assert.deepEqual(await post(a, { seen: 'coach-final.v1' }), [200, { ok: true, seen: ['coach.v2', 'coach-rough.v1', 'coach-final.v1'] }]);
  assert.deepEqual(read(), { agents: 3, editor: { seen: ['coach.v2', 'coach-rough.v1', 'coach-final.v1'] } });
});

test('/api/hints：測試沒有指到暫存的 shared 時不讀也不寫，真的 shared/setting.json 原封不動', async (t) => {
  assert.equal(process.env.AUTO_EDIT_NO_LOCAL_BRAND, '1', 'helpers.mjs 會設這個環境變數');
  const real = path.join(WORKSPACE, 'shared', 'setting.json');
  const snap = () => (fs.existsSync(real) ? fs.readFileSync(real, 'utf8') : null);
  const before = snap();
  const root = tmpDir(t, 'hf-editor-hints-');
  const project = path.join(root, 'projects', 'solo');
  fs.mkdirSync(path.join(project, 'work'), { recursive: true });
  const ed = await startEditor({ flags: { project, template: TEMPLATE }, cwd: root, port: 0, writeState: false });
  try {
    assert.deepEqual(await get(ed), [200, { seen: [] }]);
    const [status, out] = await post(ed, { seen: 'coach.v2' });
    assert.equal(status, 503);
    assert.equal(out.error, 'nosettings');
    assert.equal(snap(), before);
  } finally { await ed.close(); }
});
