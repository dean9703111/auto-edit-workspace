// 剪輯清單頁（016，停點 ①）：/cuts 頁面、/api/cuts 讀、/api/cuts/save 只寫 cuts.md 的「剪」欄、衝突與唯讀。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TEMPLATE, imp } from './helpers.mjs';

const { startEditor } = await imp('editor.mjs');
let root, work, editor;
const api = (route, body, headers = {}) => fetch(new URL(route, editor.url), body ? { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) } : undefined);
const MD = ['# 剪輯清單', '', '## NG', '', '| 剪 | 時間碼 | 內容 | 原因 | 待確認 |', '|---|---|---|---|---|',
  '| [x] | 0:01.00–0:02.00 | 今天要介紹… | 同一句講兩次 | — |', '| [x] | 0:05.00–0:06.50 | 我們先看… | 講稿外 | 可能是 whisper 補的 |', '',
  '## 需要你決定', '', '- 第 2 列待確認：可能是 whisper 補的', ''].join('\n');

before(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-editor-cuts-'));
  fs.mkdirSync(path.join(root, 'shared'), { recursive: true });
  fs.symlinkSync(TEMPLATE, path.join(root, 'shared', 'template'), 'dir');
  const project = path.join(root, 'projects', 'cuts');
  work = path.join(project, 'work');
  fs.mkdirSync(work, { recursive: true });
  editor = await startEditor({ flags: { project, template: TEMPLATE }, cwd: root, port: 0, writeState: false });
});
after(async () => { await editor?.close(); fs.rmSync(root, { recursive: true, force: true }); });

test('剪輯清單：還沒有 cuts.md 時說還在找；頁面與主軌試聽的路由', async () => {
  const s = await (await api('/api/cuts')).json();
  assert.equal(s.exists, false);
  assert.equal(s.video, null);
  assert.equal(s.project, 'cuts');
  const page = await api('/cuts');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<title>剪輯清單<\/title>/);
  assert.equal((await api('/media/main.mp4')).status, 404);
  fs.writeFileSync(path.join(work, 'main.mp4'), Buffer.alloc(2048));
  const s2 = await (await api('/api/cuts')).json();
  assert.match(s2.video.url, /^\/media\/main\.mp4\?v=/);
  const part = await fetch(new URL(s2.video.url, editor.url), { headers: { Range: 'bytes=0-99' } });
  assert.equal(part.status, 206);
});

test('剪輯清單：勾選只改那一列的「剪」欄；cuts.md 被改過擋下並回新內容；壞輸入與別的網站送來的擋下；有 rough.mp4 後只能看', async () => {
  const file = path.join(work, 'cuts.md');
  fs.writeFileSync(file, MD);
  const s = await (await api('/api/cuts')).json();
  assert.equal(s.exists, true);
  assert.equal(s.readOnly, false);
  assert.deepEqual(s.ng.map((r) => [r.row, r.cut, r.note]), [[1, true, ''], [2, true, '可能是 whisper 補的']]);
  assert.deepEqual(s.sections.map((x) => [x.title, x.ng]), [['NG', true], ['需要你決定', false]]);
  assert.equal(s.sections[0].md, '');

  const ok = await api('/api/cuts/save', { hash: s.hash, cut: { 2: false } });
  assert.equal(ok.status, 200, await ok.clone().text());
  const after1 = await ok.json();
  assert.deepEqual(after1.ng.map((r) => r.cut), [true, false]);
  const lines = fs.readFileSync(file, 'utf8').split('\n'), was = MD.split('\n');
  assert.deepEqual(lines.filter((l, i) => l !== was[i]), ['| [ ] | 0:05.00–0:06.50 | 我們先看… | 講稿外 | 可能是 whisper 補的 |']);

  const stale = await api('/api/cuts/save', { hash: s.hash, cut: { 1: false } });
  assert.equal(stale.status, 409);
  const sb = await stale.json();
  assert.match(sb.message, /work\/cuts\.md 剛被改過/);
  assert.equal(sb.state.hash, after1.hash);
  assert.equal((await api('/api/cuts/save', { hash: after1.hash, cut: { 9: true } })).status, 400);
  assert.equal((await api('/api/cuts/save', { hash: after1.hash, cut: { 1: 'no' } })).status, 400);
  assert.equal((await api('/api/cuts/save', { hash: after1.hash, cut: { 1: false } }, { Origin: 'http://evil.example' })).status, 403);

  fs.writeFileSync(path.join(work, 'rough.mp4'), '');
  const ro = await (await api('/api/cuts')).json();
  assert.equal(ro.readOnly, true);
  const locked = await api('/api/cuts/save', { hash: ro.hash, cut: { 1: false } });
  assert.equal(locked.status, 409);
  assert.match((await locked.json()).message, /初剪已經輸出/);
  assert.equal(fs.readFileSync(file, 'utf8').split('\n').filter((l, i) => l !== was[i]).length, 1);
});
