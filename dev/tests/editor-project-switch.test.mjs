// 切換影片（039）：/api/editors 列出同一個 projects/ 底下開著剪輯台的專案（過期的狀態檔不算）；四頁都載入選單；選單的判斷與導向（純函式）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { TEMPLATE, imp, tmpDir } from './helpers.mjs';

const { startEditor } = await imp('editor.mjs');
const { switchOptions, switchUrl } = await imp('editor/project-switch.mjs');

test('/api/editors：兩個專案的剪輯台都開著時兩邊都列出兩個、current 是自己；過期的狀態檔不列也不刪；關掉一個只剩一個', async (t) => {
  const root = tmpDir(t, 'hf-editor-switch-');
  const dirOf = (name) => path.join(root, 'projects', name);
  const stateOf = (name) => path.join(dirOf(name), 'work', 'hyperframes', '.editor', 'server.json');
  const opened = [];
  const open = async (name) => { const ed = await startEditor({ flags: { project: dirOf(name), template: TEMPLATE }, cwd: root, port: 0 }); opened.push(ed); return ed; };
  const list = async (ed) => { const r = await fetch(new URL('/api/editors', ed.url)); assert.equal(r.status, 200); return (await r.json()).editors; };
  for (const name of ['alpha', 'beta', 'copied', 'dead']) fs.mkdirSync(path.dirname(stateOf(name)), { recursive: true });
  fs.writeFileSync(path.join(root, 'projects', '筆記.txt'), '不是專案資料夾');
  try {
    const a = await open('alpha');
    const alone = [{ project: 'projects/alpha', name: 'alpha', url: a.url, current: true }];
    assert.deepEqual(await list(a), alone, '只開一個：只有自己');

    const b = await open('beta');
    const both = (cur) => [{ project: 'projects/alpha', name: 'alpha', url: a.url, current: cur === 'alpha' }, { project: 'projects/beta', name: 'beta', url: b.url, current: cur === 'beta' }];
    assert.deepEqual(await list(a), both('alpha'));
    assert.deepEqual(await list(b), both('beta'));

    // 過期的狀態檔：整個專案資料夾複製來的（行程、網址都活著，但回應的是 alpha）、行程已經不在的
    fs.copyFileSync(stateOf('alpha'), stateOf('copied'));
    const gone = spawnSync(process.execPath, ['-e', '']).pid;
    fs.writeFileSync(stateOf('dead'), JSON.stringify({ pid: gone, port: b.port, url: b.url, project: dirOf('dead') }));
    assert.deepEqual(await list(a), both('alpha'));
    assert.deepEqual(await list(b), both('beta'));
    assert.ok(fs.existsSync(stateOf('copied')) && fs.existsSync(stateOf('dead')), '別的專案的狀態檔只看不刪');

    await b.close();
    assert.deepEqual(await list(a), alone, '關掉一個：只剩自己');
  } finally { await Promise.all(opened.map((ed) => ed.close())); }
});

test('四個頁面都載入切換影片的選單，服務供應那支程式', async (t) => {
  const root = tmpDir(t, 'hf-editor-switch-');
  const project = path.join(root, 'projects', 'solo');
  fs.mkdirSync(path.join(project, 'work'), { recursive: true });
  const ed = await startEditor({ flags: { project, template: TEMPLATE }, cwd: root, port: 0, writeState: false });
  try {
    for (const page of ['/', '/cuts', '/framing', '/storyboard']) {
      const html = await (await fetch(new URL(page, ed.url))).text();
      assert.match(html, /<script type="module" src="\/editor\/project-switch\.js"><\/script>/, page);
      assert.match(html, /<div class="sub" id="projName">/, `${page}：專案名稱那一行就是切換鈕要用的元素`);
      assert.doesNotMatch(html, /proj-switch|projMenu|projList/, `${page}：有第二個剪輯台時才由程式把專案名稱變成切換鈕、加上選單，HTML 裡不佔位`);
    }
    for (const f of ['project-switch.js', 'project-switch.mjs']) {
      const r = await fetch(new URL(`/editor/${f}`, ed.url));
      assert.equal(r.status, 200, f);
      assert.match(r.headers.get('content-type'), /^text\/javascript/, f);
    }
  } finally { await ed.close(); }
});

test('switchOptions：不到兩個、清單裡沒有自己、回傳的不是清單都不顯示；兩個以上照原順序列', () => {
  const a = { project: 'projects/a', name: 'a', url: 'http://127.0.0.1:4409/', current: true };
  const b = { project: 'projects/b', name: 'b', url: 'http://127.0.0.1:4413/', current: false };
  const c = { project: 'projects/c', name: 'c', url: 'http://127.0.0.1:4414/', current: false };
  assert.deepEqual(switchOptions([a]), []);
  assert.deepEqual(switchOptions([]), []);
  assert.deepEqual(switchOptions([a, b]), [a, b]);
  assert.deepEqual(switchOptions([b, a, c]), [b, a, c]);
  assert.deepEqual(switchOptions([b, c]), [], '沒有 current：不知道自己是哪一個');
  assert.deepEqual(switchOptions([a, null, { name: 'x' }]), [], '壞掉的項目不算一個');
  for (const bad of [undefined, null, {}, 'x', { message: '示範版沒有這個功能' }]) assert.deepEqual(switchOptions(bad), []);
});

test('switchUrl：到另一個剪輯台的同一頁、同一個檢視；seg、t、# 不帶過去', () => {
  const to = 'http://127.0.0.1:4413/';
  assert.equal(switchUrl('http://127.0.0.1:4409/?view=final', to), 'http://127.0.0.1:4413/?view=final');
  assert.equal(switchUrl('http://127.0.0.1:4409/', to), 'http://127.0.0.1:4413/');
  assert.equal(switchUrl('http://127.0.0.1:4409/cuts.html', to), 'http://127.0.0.1:4413/cuts.html');
  assert.equal(switchUrl('http://127.0.0.1:4409/framing', to), 'http://127.0.0.1:4413/framing');
  assert.equal(switchUrl('http://127.0.0.1:4409/storyboard#sec-s05', to), 'http://127.0.0.1:4413/storyboard');
  assert.equal(switchUrl('http://127.0.0.1:4409/?view=final&seg=x0410', to), 'http://127.0.0.1:4413/?view=final');
  assert.equal(switchUrl('http://127.0.0.1:4409/?t=12:30&view=sim', to), 'http://127.0.0.1:4413/?view=sim');
  assert.equal(switchUrl('http://localhost:4409/?view=final', to), 'http://127.0.0.1:4413/?view=final');
});
