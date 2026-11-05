// 剪輯 editor.mjs：讀狀態、只寫允許的欄位、拒絕其他欄位、修改時間衝突、Range、port 被佔用、背景執行與關閉；
// v2：字幕增刪與句號重新對應（plan.json＋rough.srt 一起寫）、rough.srt 衝突、gains／sfxVolume／音效靜音還原、media 拖曳欄位、卡片文字、響度與縮圖
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { spawnSync, spawn } from 'node:child_process';
import { TOOLS, TEMPLATE, makeSrt, imp } from './helpers.mjs';

const EDITOR = path.join(TOOLS, 'editor.mjs');
const E = await imp('editor.mjs');
const BASE_PORT = 47000 + (process.pid % 900) * 2;
let root, proj, work, out, planFile, ed, url;

const PLAN_TEXT = `{
  "version": 1,
  "speakerBox": [700, 200, 1220, 1000],
  "scenes": [
    { "id": "s01", "scene": "concept", "from": "#2", "to": "#3e", "slots": { "text": "**場地設定**：一份文件" } },
    { "id": "m01", "type": "media", "src": "assets/screen/demo.mp4", "from": "#4", "to": "#5e", "in": 1 }
  ]
}
`;
const S01_LINE = '    { "id": "s01", "scene": "concept", "from": "#2", "to": "#3e", "slots": { "text": "**場地設定**：一份文件" } },';

const get = (p, headers = {}) => fetch(new URL(p, url), { headers });
const post = (p, body, headers = {}) => fetch(new URL(p, url), { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const planNow = () => fs.readFileSync(planFile, 'utf8');
async function base() { const s = await (await get('/api/state')).json(); return { mtime: s.plan.mtime, hash: s.plan.hash }; }

// 假工作區：shared/template 用 symlink 指到真的模板；專案有 6 秒的 rough.mp4、字幕、剪接點、plan.json、一支螢幕錄影
before(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-editor-'));
  fs.mkdirSync(path.join(root, 'shared'), { recursive: true });
  fs.symlinkSync(TEMPLATE, path.join(root, 'shared', 'template'), 'dir');
  proj = path.join(root, 'projects', 'example');
  work = path.join(proj, 'work');
  out = path.join(work, 'hyperframes');
  fs.mkdirSync(out, { recursive: true });
  fs.mkdirSync(path.join(proj, 'assets', 'screen'), { recursive: true });
  const v = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=160x90:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
    '-t', '6', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(work, 'rough.mp4')]);
  assert.equal(v.status, 0, String(v.stderr));
  fs.copyFileSync(path.join(work, 'rough.mp4'), path.join(proj, 'assets', 'screen', 'demo.mp4'));
  fs.writeFileSync(path.join(work, 'rough.srt'), makeSrt({ n: 2 }));
  fs.writeFileSync(path.join(work, 'cutpoints.json'), JSON.stringify({ cuts: [{ at: 2.2, kind: 'pause' }, { at: 4.1, kind: 'ng' }] }));
  planFile = path.join(out, 'plan.json');
  fs.writeFileSync(planFile, PLAN_TEXT);
  ed = await E.startEditor({ flags: { project: proj, template: path.join(root, 'shared', 'template') }, cwd: root, port: BASE_PORT });
  url = ed.url;
});
after(async () => { await ed?.close(); });

test('讀狀態：專案、plan、影片資訊、字幕、剪接點、media 段；波形；只綁 127.0.0.1', async () => {
  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
  assert.equal(ed.server.address().address, '127.0.0.1');
  const s = await (await get('/api/state')).json();
  assert.equal(s.project.name, 'example');
  assert.equal(s.project.dir, 'projects/example');
  assert.equal(s.plan.exists, true);
  assert.equal(s.plan.data.scenes.length, 2);
  assert.equal(s.edit, null);
  assert.ok(Math.abs(s.video.dur - 6) < 0.1, `影片長度 ${s.video.dur}`);
  assert.equal(s.video.fps, 30);
  assert.equal(s.video.hasAudio, true);
  assert.equal(s.captions.length, 2);
  assert.equal(s.srt.exists, true);
  assert.match(s.srt.hash, /^[0-9a-f]{40}$/);
  assert.equal(s.srt.eol, 'LF');
  assert.ok(s.schema && s.schema.scenes.length >= 18 && s.schema.fx.length >= 40, '情境與字卡動態的欄位定義（--list --json）');
  assert.ok(s.schema.scenes.find((x) => x.key === 'concept').slots.text.max > 0);
  assert.ok(Math.abs(s.media[0].info.dur - 6) < 0.1, 'media 素材長度（拖曳裁剪的上限）');
  assert.deepEqual(s.cutpoints, [{ at: 2.2, kind: 'pause' }, { at: 4.1, kind: 'ng' }]);
  assert.deepEqual(s.media.map((m) => [m.id, m.kind, m.in, m.enter, m.volume]), [['m01', 'video', 1, null, null]]);
  assert.equal(typeof s.preview.player.available, 'boolean');
  assert.ok(!('file' in s.preview.player), '播放器的本機路徑不要送給頁面');
  const w = await (await get('/api/waveform')).json();
  assert.equal(w.rate, 100);
  assert.ok(Math.abs(w.peaks.length - 600) <= 5, `波形 ${w.peaks.length} 點`);
  assert.ok(Math.max(...w.peaks) > 100, '有聲音的地方峰值要夠大');
  assert.ok(fs.existsSync(path.join(out, '.editor', 'waveform.json')), '波形要快取在 work/hyperframes/.editor/');
  const page = await get('/');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /剪輯/);
});

test('只寫允許的欄位：edit 補齊預設、cuts 排序合併、joins 去掉 none；media 段只改 enter／exit／volume；其他文字原封不動', async () => {
  const r = await post('/api/save', {
    base: await base(),
    edit: { cuts: [[3, 3.5], [1, 1.5], [1.4, 2]], fadeIn: 0.5, volume: { voice: -6 }, joins: [{ at: 1, type: 'dip' }, { at: 2.2, type: 'none' }, { at: 4.1, type: 'punch' }] },
    media: { m01: { enter: 'slide', volume: -3 } },
  });
  assert.equal(r.status, 200, await r.clone().text());
  const j = await r.json();
  assert.equal(j.ok, true);
  assert.ok(j.plan.mtime && j.plan.hash);
  assert.ok(j.report && j.report.ready, '存完要附上檢查結果');
  const plan = JSON.parse(planNow());
  assert.deepEqual(plan.edit, {
    cuts: [[1, 2], [3, 3.5]], fadeIn: 0.5, fadeOut: 0, volume: { voice: -6, sfx: 0, media: 0 }, gains: [],
    joins: [{ at: 1, type: 'dip', dur: 0.3 }, { at: 4.1, type: 'punch' }],
  });
  assert.deepEqual(Object.keys(plan), ['version', 'speakerBox', 'edit', 'scenes'], 'edit 插在 scenes 前面');
  assert.deepEqual(plan.scenes[1], { id: 'm01', type: 'media', src: 'assets/screen/demo.mp4', from: '#4', to: '#5e', in: 1, enter: 'slide', volume: -3 });
  const text = planNow();
  assert.ok(text.includes(S01_LINE), '沒改到的段落要保留原本的排版');
  assert.ok(text.includes('"speakerBox": [700, 200, 1220, 1000],'));
  // 第二次存：edit 原地替換、media 改回靜音
  const r2 = await post('/api/save', { base: j.plan, edit: { cuts: [] }, media: { m01: { volume: null } } });
  assert.equal(r2.status, 200);
  const p2 = JSON.parse(planNow());
  assert.deepEqual(p2.edit.cuts, []);
  assert.equal(p2.scenes[1].volume, null);
  assert.equal(p2.scenes[1].enter, 'slide');
});

test('拒絕其他欄位：plan 的其他 key、edit／joins 的未知欄位、改 media 段的 src、不是 media 的段、超出範圍的數字；被拒絕時檔案不動', async () => {
  const before = planNow();
  const b = await base();
  const cases = [
    [{ base: b, scenes: [] }, /不能寫「scenes」/],
    [{ base: b, edit: { cuts: [], speed: 2 } }, /edit 不能有「speed」/],
    [{ base: b, edit: { joins: [{ at: 1, type: 'wipe' }] } }, /type 要是 none、dip、punch/],
    [{ base: b, edit: { joins: [{ at: 1, type: 'dip', color: 'red' }] } }, /不能有「color」/],
    [{ base: b, edit: { volume: { voice: 20 } } }, /−60～\+12/],
    [{ base: b, edit: { volume: { music: 0 } } }, /edit\.volume 不能有「music」/],
    [{ base: b, edit: { fadeIn: -1 } }, /fadeIn 要是 0–10 的秒數/],
    [{ base: b, edit: { cuts: [[3, 2]] } }, /終點要大於起點/],
    [{ base: b, media: { m01: { src: 'assets/images/x.png' } } }, /不能改「src」/],
    [{ base: b, media: { m01: { enter: 'spin' } } }, /enter 要是 cut、fade、slide、zoom/],
    [{ base: b, media: { s01: { enter: 'fade' } } }, /找不到 media 段「s01」/],
  ];
  for (const [body, re] of cases) {
    const r = await post('/api/save', body);
    assert.equal(r.status, 400, `${JSON.stringify(body)} 應該被拒絕`);
    const j = await r.json();
    assert.match(j.message, re);
  }
  assert.equal(planNow(), before);
  // 不是剪輯頁面送的（不是 JSON、別的網站、別的 Host）
  const r1 = await fetch(new URL('/api/save', url), { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' });
  assert.equal(r1.status, 403);
  const r2 = await post('/api/save', { base: b, edit: {} }, { Origin: 'http://evil.example' });
  assert.equal(r2.status, 403);
  const hostStatus = await new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: ed.port, path: '/api/state', headers: { Host: 'evil.example' } }, (res) => { res.resume(); resolve(res.statusCode); }).on('error', reject);
  });
  assert.equal(hostStatus, 403);
  assert.equal(planNow(), before);
});

test('修改時間衝突：plan.json 在打開之後被改過就回 409、不覆寫；用新的 mtime／hash 再存就可以', async () => {
  const old = await base();
  await new Promise((r) => setTimeout(r, 20));
  const aiText = planNow().replace('"version": 1', '"version": 1, "avoid": []');
  fs.writeFileSync(planFile, aiText);
  const r = await post('/api/save', { base: old, edit: { fadeOut: 1 } });
  assert.equal(r.status, 409);
  const j = await r.json();
  assert.equal(j.error, 'conflict');
  assert.match(j.message, /被改過.*重新載入/);
  assert.equal(planNow(), aiText, '衝突時不能覆寫');
  // 只送 mtime（舊的）也要擋
  const r2 = await post('/api/save', { base: { mtime: old.mtime }, edit: { fadeOut: 1 } });
  assert.equal(r2.status, 409);
  // 重新載入後再存：AI 的修改和剪輯的設定都在
  const r3 = await post('/api/save', { base: await base(), edit: { fadeOut: 1 } });
  assert.equal(r3.status, 200);
  const p = JSON.parse(planNow());
  assert.deepEqual(p.avoid, []);
  assert.equal(p.edit.fadeOut, 1);
});

test('Range：影片可以分段讀（206／416）、ETag；只開放素材資料夾；完成影片預覽的路徑不能跳出 work/hyperframes', async () => {
  const size = fs.statSync(path.join(work, 'rough.mp4')).size;
  const r = await get('/media/rough.mp4', { Range: 'bytes=0-99' });
  assert.equal(r.status, 206);
  assert.equal(r.headers.get('content-range'), `bytes 0-99/${size}`);
  assert.equal(r.headers.get('accept-ranges'), 'bytes');
  assert.equal((await r.arrayBuffer()).byteLength, 100);
  const tail = await get('/media/rough.mp4', { Range: 'bytes=-10' });
  assert.equal(tail.status, 206);
  assert.equal(tail.headers.get('content-range'), `bytes ${size - 10}-${size - 1}/${size}`);
  assert.equal((await tail.arrayBuffer()).byteLength, 10);
  const open = await get('/media/rough.mp4', { Range: `bytes=${size - 5}-` });
  assert.equal(open.status, 206);
  assert.equal((await open.arrayBuffer()).byteLength, 5);
  const bad = await get('/media/rough.mp4', { Range: `bytes=${size + 10}-` });
  assert.equal(bad.status, 416);
  assert.equal(bad.headers.get('content-range'), `bytes */${size}`);
  await bad.arrayBuffer();
  const full = await get('/media/rough.mp4');
  assert.equal(full.status, 200);
  assert.equal(Number(full.headers.get('content-length')), size);
  const etag = full.headers.get('etag');
  await full.arrayBuffer();
  assert.equal((await get('/media/rough.mp4', { 'If-None-Match': etag })).status, 304);
  const m = await get('/file/assets/screen/demo.mp4', { Range: 'bytes=0-9' });
  assert.equal(m.status, 206);
  await m.arrayBuffer();
  assert.equal((await get('/file/work/hyperframes/plan.json')).status, 403);
  assert.equal((await get('/file/assets/screen/../../work/rough.srt')).status, 403);
  assert.equal((await get('/composition/..%2F..%2Frough.srt')).status, 404);
  assert.equal((await get('/composition/.editor/server.json')).status, 404);
  assert.equal((await get('/editor/..%2F..%2Fbuild.mjs')).status, 404);
});

test('port 被佔用：自動改用下一個；全部被佔用時說明怎麼改', async () => {
  const blocker = net.createServer();
  const p = BASE_PORT + 400;
  await new Promise((r) => blocker.listen(p, '127.0.0.1', r));
  try {
    const e2 = await E.startEditor({ flags: { project: proj, template: path.join(root, 'shared', 'template') }, cwd: root, port: p, writeState: false });
    try {
      assert.equal(e2.port, p + 1);
      assert.equal(e2.url, `http://127.0.0.1:${p + 1}/`);
      assert.equal((await fetch(new URL('/api/ping', e2.url))).status, 200);
    } finally { await e2.close(); }
    const s = http.createServer();
    await assert.rejects(E.listenOnFreePort(s, p, '127.0.0.1', 1), /都被佔用了 → 加 --port/);
  } finally { blocker.close(); }
});

test('CLI：非互動 shell 自動轉背景、印出網址；--status 查得到；重複啟動不會開第二個；--stop 關掉', async () => {
  const proj2 = path.join(root, 'projects', 'EP2');
  fs.mkdirSync(path.join(proj2, 'work', 'hyperframes'), { recursive: true });
  fs.copyFileSync(path.join(work, 'rough.mp4'), path.join(proj2, 'work', 'rough.mp4'));
  const args = [EDITOR, '--project', 'projects/EP2', '--template', 'shared/template', '--port', String(BASE_PORT + 600)];
  const run = (...extra) => spawnSync(process.execPath, [...args, ...extra], { cwd: root, encoding: 'utf8', timeout: 30000 });
  const r = run();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const m = r.stdout.match(/剪輯：(http:\/\/127\.0\.0\.1:(\d+)\/)/);
  assert.ok(m, r.stdout);
  assert.match(r.stdout, /已在背景執行.*--stop --project projects\/EP2/);
  const u = m[1];
  try {
    assert.equal((await fetch(new URL('/api/ping', u))).status, 200);
    const st = run('--status');
    assert.match(st.stdout, new RegExp(`剪輯開著：${u.replace(/[.]/g, '\\.')}`));
    const again = run();
    assert.match(again.stdout, /剪輯已經開著/);
  } finally {
    const stop = run('--stop');
    assert.match(stop.stdout, /已關閉剪輯/);
  }
  await assert.rejects(fetch(new URL('/api/ping', u), { signal: AbortSignal.timeout(1000) }));
  assert.match(run('--status').stdout, /剪輯沒有開/);
  assert.ok(!fs.existsSync(path.join(proj2, 'work', 'hyperframes', '.editor', 'server.json')));
});

test('純函式：surgical 寫入保留 CRLF 與排版；檢查報告（契約 3.3 的假報告）與文字報告的降級解析；播放器從 npx 快取動態找最新版', () => {
  const crlf = PLAN_TEXT.replace(/\n/g, '\r\n');
  const s = E.applySave(crlf, { edit: { fadeIn: 1 } });
  assert.deepEqual(s.errors, []);
  assert.ok(!/[^\r]\n/.test(s.text), '原本是 CRLF 就維持 CRLF');
  assert.ok(s.text.includes(S01_LINE.replace(/\n/g, '\r\n')));
  // 契約 3.3 格式（前面混了別的輸出也讀得到）
  const mock = { ok: true, errors: [], warnings: ['⚠ 示範'], videoDur: 107.5, outputDur: 103, voiceOnly: [[41, 58.2]], cutpoints: [{ at: 12.34, kind: 'ng' }],
    items: [{ id: 's01', type: 'scene', label: '06 一般字卡', start: 12.5, end: 18, sfx: [{ name: 'pop', at: 12.6 }], warnings: 0 }],
    edit: { cuts: [], fadeIn: 0, fadeOut: 0, volume: { voice: 0, sfx: 0, media: 0 }, joins: [] }, paths: { project: 'projects/example' } };
  assert.deepEqual(E.parseReport(`專案：projects/example\n${JSON.stringify(mock)}\n`), mock);
  assert.equal(E.parseReport('通過：3 段，2 個提醒（⚠）。'), null);
  assert.deepEqual(E.issuesFromText('✖ [s01] 錯 → 改\n⚠ [s02] 提醒\n通過'), { errors: ['[s01] 錯 → 改'], warnings: ['[s02] 提醒'] });
  const items = E.itemsFromText('id｜情境｜起–迄｜長度｜音效時間｜警告\ns01｜06 一般字卡｜0:04.50–0:11.00｜6.5s｜pop 0:04.62｜⚠ 1（rough 0:07.00–0:13.50）\ns02｜fx 29｜0:15.00–0:18.00｜3s｜—｜—',
    { scenes: [{ id: 's01' }, { id: 's02', type: 'fx' }] });
  assert.deepEqual(items.map((i) => [i.id, i.type, i.start, i.end, i.warnings]), [['s01', 'scene', 7, 13.5, 1], ['s02', 'fx', 15, 18, 0]]);
  // 播放器只用 roots（工作區、專案）的 node_modules，照順序第一個找到的；不比版本新舊、不掃 npx 快取
  const roots = ['ws', 'out', 'proj'].map((n) => fs.mkdtempSync(path.join(os.tmpdir(), `hf-${n}-`)));
  for (const [r, ver] of [[roots[0], '0.8.221'], [roots[1], '0.9.3'], [roots[2], '0.9.9']]) {
    const d = path.join(r, 'node_modules', 'hyperframes');
    fs.mkdirSync(path.join(d, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ version: ver }));
    fs.writeFileSync(path.join(d, 'dist', 'hyperframes-player.global.js'), '//');
    fs.writeFileSync(path.join(d, 'dist', 'hyperframe.runtime.iife.js'), '//');
  }
  assert.equal(E.findPlayer({ roots }).version, '0.8.221', '第一個 root（工作區）優先，即使後面有更新的版本');
  fs.rmSync(path.join(roots[0], 'node_modules', 'hyperframes', 'dist', 'hyperframe.runtime.iife.js'));
  assert.equal(E.findPlayer({ roots }).version, '0.9.3', '缺 runtime 的不算');
  assert.equal(E.findPlayer({ roots: [fs.mkdtempSync(path.join(os.tmpdir(), 'hf-empty-'))] }), null);
});

// ---------- v2：字幕與新欄位（另一個專案：4 句 CRLF 字幕、資訊卡、清單、字卡動態、media）----------

const CRLF = (t) => t.replace(/\n/g, '\r\n');
const SRT2 = CRLF(`1
00:00:00,200 --> 00:00:01,200
第一句，開場白

2
00:00:01,400 --> 00:00:02,400
第二句說明

3
00:00:03,000 --> 00:00:04,000
第三句重點

4
00:00:04,600 --> 00:00:05,600
第四句結尾
`);
const PLAN2 = `{
  "version": 1,
  "scenes": [
    { "id": "s01", "scene": "concept", "from": "#1", "to": "#2e", "anchor": "第一句", "slots": { "text": "**#1** 重點" } },
    { "id": "s02", "scene": "title-list", "from": "#3", "to": "#4e", "slots": { "title": "清單", "items": ["一", { "text": "二", "at": "#4" }, "三 ｜at=#4+0.2"] } },
    { "id": "f01", "type": "fx", "fx": 29, "from": "#2", "to": "#2e", "vars": { "number": "18", "label": "第 #1 名" } },
    { "id": "m01", "type": "media", "src": "assets/screen/demo.mp4", "from": "#3", "to": "#4e", "in": 1, "sfx": "whoosh" }
  ]
}
`;
let ed2, url2, proj2dir, plan2File, srt2File;
const get2 = (p) => fetch(new URL(p, url2));
const post2 = (p, body) => fetch(new URL(p, url2), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const base2 = async () => { const s = await (await get2('/api/state')).json(); return { hash: s.plan.hash, mtime: s.plan.mtime, srtHash: s.srt.hash }; };
async function setup2() {
  if (ed2) return;
  proj2dir = path.join(root, 'projects', '字幕');
  fs.mkdirSync(path.join(proj2dir, 'work', 'hyperframes'), { recursive: true });
  fs.mkdirSync(path.join(proj2dir, 'assets', 'screen'), { recursive: true });
  fs.copyFileSync(path.join(work, 'rough.mp4'), path.join(proj2dir, 'work', 'rough.mp4'));
  fs.copyFileSync(path.join(work, 'rough.mp4'), path.join(proj2dir, 'assets', 'screen', 'demo.mp4'));
  srt2File = path.join(proj2dir, 'work', 'rough.srt');
  plan2File = path.join(proj2dir, 'work', 'hyperframes', 'plan.json');
  ed2 = await E.startEditor({ flags: { project: proj2dir, template: path.join(root, 'shared', 'template') }, cwd: root, port: BASE_PORT + 800, writeState: false });
  url2 = ed2.url;
}
function reset2() { fs.writeFileSync(srt2File, SRT2); fs.writeFileSync(plan2File, PLAN2); }
after(async () => { await ed2?.close(); });

test('字幕分割＋合併一起存：plan.json 的 #N 照規則重新對應（文字裡的 #1 不動）、rough.srt 重新編號、CRLF 保留、沒改的句子原封不動', async () => {
  await setup2(); reset2();
  const r = await post2('/api/save', { base: await base2(), srt: { ops: [{ op: 'split', n: 2, at: 1.9, pos: 2 }, { op: 'merge', n: 4 }] } });
  assert.equal(r.status, 200, await r.clone().text());
  const j = await r.json();
  assert.deepEqual(j.wrote, { plan: true, srt: true });
  assert.deepEqual(j.captions.map((c) => [c.n, c.start, c.end, c.text]), [[1, 0.2, 1.2, '第一句，開場白'], [2, 1.4, 1.9, '第二'], [3, 1.9, 2.4, '句說明'], [4, 3, 5.6, '第三句重點第四句結尾']]);
  const srt = fs.readFileSync(srt2File, 'utf8');
  assert.ok(!/[^\r]\n/.test(srt), 'CRLF 要保留');
  assert.ok(srt.startsWith('1\r\n00:00:00,200 --> 00:00:01,200\r\n第一句，開場白\r\n\r\n2\r\n00:00:01,400 --> 00:00:01,900\r\n第二\r\n\r\n3\r\n00:00:01,900 --> 00:00:02,400\r\n句說明'), srt);
  assert.ok(srt.includes('4\r\n00:00:03,000 --> 00:00:05,600\r\n第三句重點第四句結尾\r\n'));
  const p = JSON.parse(fs.readFileSync(plan2File, 'utf8'));
  const by = Object.fromEntries(p.scenes.map((x) => [x.id, x]));
  assert.equal(by.s01.to, '#3e', '分割第 2 句：#2e → #3e');
  assert.deepEqual(by.s01.slots, { text: '**#1** 重點' });
  assert.equal(by.s01.anchor, '第一句');
  assert.equal(by.s02.from, '#4');
  assert.equal(by.s02.to, '#4e', '合併 4、5：#5e → #4e');
  assert.deepEqual(by.s02.slots.items, ['一', { text: '二', at: '#4+1.6' }, '三 ｜at=#4+1.8']);
  assert.deepEqual([by.f01.from, by.f01.to], ['#2', '#3e']);
  assert.deepEqual(by.f01.vars, { number: '18', label: '第 #1 名' });
  assert.deepEqual([by.m01.from, by.m01.to], ['#4', '#4e']);
  assert.ok(fs.readFileSync(plan2File, 'utf8').includes('"version": 1,\n  "scenes": ['), '沒改到的地方保留原本排版');
});

test('rough.srt 被改過：回 409，plan.json 和字幕都不寫；刪除有綁定的句子要選改綁；沒空間不能新增', async () => {
  await setup2(); reset2();
  const b = await base2();
  await new Promise((r) => setTimeout(r, 20));
  const aiSrt = SRT2.replace('第四句結尾', '第四句結尾（AI 改）');
  fs.writeFileSync(srt2File, aiSrt);
  for (const body of [{ base: b, srt: { ops: [{ op: 'set', n: 1, text: '改字' }] } }, { base: b, edit: { fadeIn: 1 } }]) {
    const r = await post2('/api/save', body);
    assert.equal(r.status, 409);
    const j = await r.json();
    assert.equal(j.file, 'srt');
    assert.match(j.message, /rough\.srt.*被改過.*plan\.json 和字幕都沒有存/);
  }
  assert.equal(fs.readFileSync(srt2File, 'utf8'), aiSrt);
  assert.equal(fs.readFileSync(plan2File, 'utf8'), PLAN2);
  const b2 = await base2();
  const del = await post2('/api/save', { base: b2, srt: { ops: [{ op: 'delete', n: 4 }] } });
  assert.equal(del.status, 400);
  assert.match((await del.json()).message, /第 4 句字幕有 plan\.json 的時間綁著：s02（#4e）、s02（#4）、s02（#4\+0\.2）、m01（#4e）.*bind/);
  const ins = await post2('/api/save', { base: b2, srt: { ops: [{ op: 'insert', after: 1, start: 1.2, end: 1.4, text: '擠' }] } });
  assert.equal(ins.status, 400);
  assert.match((await ins.json()).message, /只有 0\.20 秒空檔（要 ≥ 0\.5 秒才能新增）/);
  assert.equal(fs.readFileSync(plan2File, 'utf8'), PLAN2);
  // 改綁前一句再刪
  const ok = await post2('/api/save', { base: b2, srt: { ops: [{ op: 'delete', n: 4, bind: 'prev' }] } });
  assert.equal(ok.status, 200, await ok.clone().text());
  const p = JSON.parse(fs.readFileSync(plan2File, 'utf8'));
  assert.deepEqual(p.scenes[1].slots.items, ['一', { text: '二', at: '#3' }, '三 ｜at=#3+0.2']);
  assert.equal(p.scenes[3].to, '#3e');
  assert.equal((await (await get2('/api/state')).json()).captions.length, 3);
});

test('新欄位：gains、sfxVolume、音效靜音與還原（記在 .editor/memory.json）、media 拖曳的 from／to／in／anchor（超過素材長度擋下）', async () => {
  await setup2(); reset2();
  const ovl = await post2('/api/save', { base: await base2(), edit: { gains: [{ from: 1, to: 2, db: 3 }, { from: 1.5, to: 3, db: -2 }] } });
  assert.equal(ovl.status, 400);
  assert.match((await ovl.json()).message, /edit\.gains 的範圍重疊了/);
  let r = await post2('/api/save', {
    base: await base2(), edit: { gains: [{ from: 1, to: 2, db: 3 }], volume: { voice: -2.5 } },
    segments: { s01: { sfxVolume: -6 }, f01: { sfx: null }, m01: { sfx: null, from: 3.2, in: 1.5, anchor: null } },
  });
  assert.equal(r.status, 200, await r.clone().text());
  let p = JSON.parse(fs.readFileSync(plan2File, 'utf8'));
  assert.deepEqual(p.edit.gains, [{ from: 1, to: 2, db: 3 }]);
  assert.equal(p.edit.volume.voice, -2.5);
  assert.equal(p.scenes[0].sfxVolume, -6);
  assert.equal(p.scenes[2].sfx, null);
  assert.deepEqual([p.scenes[3].from, p.scenes[3].in, 'anchor' in p.scenes[3], p.scenes[3].sfx], [3.2, 1.5, false, null]);
  const mem = JSON.parse(fs.readFileSync(path.join(proj2dir, 'work', 'hyperframes', '.editor', 'memory.json'), 'utf8'));
  assert.deepEqual(mem.sfx.m01, { had: true, value: 'whoosh' });
  assert.deepEqual(mem.sfx.f01, { had: false, value: null });
  // 還原：m01 換回 AI 原本寫的 whoosh；f01 原本沒寫 → 拿掉 sfx（情境預設音效）
  r = await post2('/api/save', { base: await base2(), segments: { m01: { sfx: { restore: true } }, f01: { sfx: { restore: true } }, s01: { sfxVolume: null } } });
  assert.equal(r.status, 200, await r.clone().text());
  p = JSON.parse(fs.readFileSync(plan2File, 'utf8'));
  assert.equal(p.scenes[3].sfx, 'whoosh');
  assert.ok(!('sfx' in p.scenes[2]));
  assert.ok(!('sfxVolume' in p.scenes[0]));
  // media：拖到字幕邊界寫 #N／#Ne＋anchor；素材從 4 秒開始播 2.4 秒會超過 6 秒長的素材
  r = await post2('/api/save', { base: await base2(), segments: { m01: { from: '#2', to: '#3e', anchor: '第二句', in: 0 } } });
  assert.equal(r.status, 200, await r.clone().text());
  p = JSON.parse(fs.readFileSync(plan2File, 'utf8'));
  assert.deepEqual([p.scenes[3].from, p.scenes[3].to, p.scenes[3].anchor], ['#2', '#3e', '第二句']);
  r = await post2('/api/save', { base: await base2(), segments: { m01: { from: 3.2, to: 5.6, in: 4 } } });
  assert.equal(r.status, 400);
  assert.match((await r.json()).message, /超過素材長度/);
  r = await post2('/api/save', { base: await base2(), segments: { m01: { to: '#9e' } } });
  assert.equal(r.status, 400);
  assert.match((await r.json()).message, /字幕沒有第 9 句/);
});

test('卡片文字：slots／vars 只改文字（可以加字）；欄位增減、加項目、改清單的 at、改非文字欄位都被擋', async () => {
  await setup2(); reset2();
  const b = await base2();
  const ok = await post2('/api/save', { base: b, segments: {
    s01: { slots: { text: '**場地**設定好了' } },
    s02: { slots: { title: '重點', items: ['壹壹', { text: '貳貳', at: '#4' }, '參 ｜at=#4+0.2'] } },
    f01: { vars: { number: '290', label: '支影片' } },
  } });
  assert.equal(ok.status, 200, await ok.clone().text());
  const p = JSON.parse(fs.readFileSync(plan2File, 'utf8'));
  assert.deepEqual(p.scenes[1].slots.items, ['壹壹', { text: '貳貳', at: '#4' }, '參 ｜at=#4+0.2']);
  assert.deepEqual(p.scenes[2].vars, { number: '290', label: '支影片' });
  const b2 = await base2();
  const cases = [
    [{ s01: { slots: { text: 'a', tag: '新欄位' } } }, /欄位不能增減/],
    [{ s02: { slots: { title: 'x', items: ['1', '2', '3', '4'] } } }, /有 4 項，比原本多（原本 3 項）→ 剪輯不能加項目/],
    [{ s02: { slots: { title: 'x', items: ['1'] } } }, /有 1 項，至少要 2 項/],
    [{ s02: { slots: { title: 'x', items: ['一', { text: '二', at: '#1' }, '三 ｜at=#4+0.2'] } } }, /「at」不是文字，只能沿用原本的值/],
    [{ s02: { slots: { title: 'x', items: ['一', { text: '二', at: '#4' }, '三 ｜at=#1'] } } }, /「at=#1」不是原本就有的值/],
    [{ f01: { vars: { number: '1', label: 'x', accent: '#ff0000' } } }, /欄位不能增減/],
    [{ s01: { scene: 'quote' } }, /不能改「scene」/],
    [{ s01: { vars: { text: 'x' } } }, /不能改「vars」/],
    [{ s01: { sfxVolume: 20 } }, /sfxVolume 要是 −60～\+12/],
  ];
  const before = fs.readFileSync(plan2File, 'utf8');
  for (const [segments, re] of cases) {
    const r = await post2('/api/save', { base: b2, segments });
    assert.equal(r.status, 400, JSON.stringify(segments));
    assert.match((await r.json()).message, re);
  }
  assert.equal(fs.readFileSync(plan2File, 'utf8'), before);
});

test('修改單：/api/requests 整份覆寫 work/feedback/editor-requests.md（空的擋下）；改字後的 audit 結果變成 [id] 開頭的檢查清單', async () => {
  await setup2();
  const f = path.join(proj2dir, 'work', 'feedback', 'editor-requests.md');
  let r = await post2('/api/requests', { markdown: '  ' });
  assert.equal(r.status, 400);
  assert.match((await r.json()).message, /修改單是空的/);
  r = await post2('/api/requests', { markdown: '# 剪輯修改單\n\n## 1. s01' });
  assert.equal(r.status, 200, await r.clone().text());
  assert.match((await r.json()).file, /work\/feedback\/editor-requests\.md$/);
  assert.equal(fs.readFileSync(f, 'utf8'), '# 剪輯修改單\n\n## 1. s01\n');
  r = await post2('/api/requests', { markdown: '第二次\n' });
  assert.equal(r.status, 200);
  assert.equal(fs.readFileSync(f, 'utf8'), '第二次\n');
  const a = E.auditIssues(JSON.stringify({ errors: [], warnings: ['w'], findings: [
    { id: 's02', level: 'error', msg: '文字超出卡片', fix: '改短' }, { id: 's02', level: 'warn', msg: '行距太擠' }] }));
  assert.deepEqual(a, { errors: ['[s02] 版面：文字超出卡片 → 改短'], warnings: ['版面檢查：w', '[s02] 版面：行距太擠'] });
  assert.match(E.auditIssues('not json').errors[0], /audit.*沒有產出結果/);
});

test('修改單改完了沒（requestsInfo）：比修改單新的 r<N>.md「改了哪幾段」裡「- <段 id>：…」＝已改；舊的 rN、修改單沒有的段、其他小節不算', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rq-done-'));
  const fb = path.join(dir, 'work', 'feedback');
  fs.mkdirSync(fb, { recursive: true });
  assert.equal(E.requestsInfo(dir), null, '還沒有修改單');
  const put = (f, text, sec) => { const p = path.join(fb, f); fs.writeFileSync(p, text); const t = new Date(Date.UTC(2026, 10, 3, 12, 0, sec)); fs.utimesSync(p, t, t); };
  put('r3.md', '## 改了哪幾段\n- s03：舊的一輪\n', 0);
  put('editor-requests.md', '# 剪輯修改單\n\n## 1. x05　custom x-a.html\n- 要改：更有質感\n\n## 2. s03　07 重點字卡\n', 10);
  put('r4.md', '# 回饋 r4\n\n## 分類\n- s03：個案\n\n## 改了哪幾段\n- x05：補方案拍、刪漂浮\n- 其他：plan.json 沒改\n- m09：不在修改單\n\n## 驗證\n- s03：audit 0 ✖\n', 20);
  const q = E.requestsInfo(dir);
  assert.deepEqual(q.ids, ['x05', 's03']);
  assert.deepEqual(q.done, { x05: { round: 'r4', note: '補方案拍、刪漂浮' } });
  fs.rmSync(dir, { recursive: true, force: true });
});

test('修改單狀態 API：複製僅存檔；AI 逐段回報開始、失敗、完成；版本與段落驗證後整批寫入', async () => {
  await setup2();
  const saved = await (await post2('/api/requests', { markdown: '# 修改單\n\n## 1. s01\n\n## 2. x02\n' })).json();
  const revision = saved.requests.revision;
  assert.match(revision, /^[a-f0-9]{40}$/);
  assert.deepEqual(saved.requests.states, {}, '存檔不代表 AI 開始');
  assert.deepEqual((await (await get2('/api/requests/status')).json()).requests, saved.requests);
  const update = (body) => post2('/api/requests/status', { revision, ...body });
  let r = await update({ ids: ['s01'], state: 'generating' });
  assert.equal(r.status, 200);
  let q = (await r.json()).requests;
  assert.equal(q.states.s01.state, 'generating');
  assert.equal(q.states.x02, undefined, '另一段仍待改');
  const stateFile = path.join(proj2dir, 'work/feedback/editor-requests-status.json');
  const before = fs.readFileSync(stateFile, 'utf8');
  for (const body of [
    { ids: ['s01'], state: 'generating', revision: 'old' },
    { ids: ['s01', 'unknown'], state: 'done' },
    { ids: [], state: 'done' },
    { ids: ['s01'], state: 'unknown' },
    { ids: ['s01'], state: 'failed', message: {} },
  ]) {
    r = await update(body);
    assert.equal(r.status, body.revision ? 409 : 400);
    assert.equal(fs.readFileSync(stateFile, 'utf8'), before, '不合法請求整批不寫');
  }
  r = await update({ ids: ['x02'], state: 'failed', message: '動畫檢查未通過' });
  q = (await r.json()).requests;
  assert.equal(q.states.x02.message, '動畫檢查未通過');
  assert.equal(q.states.s01.state, 'generating');
  // 即使 rN 已先寫了完成紀錄，API 的生成中／失敗仍優先。
  fs.writeFileSync(path.join(proj2dir, 'work/feedback/r999.md'), '## 改了哪幾段\n- s01：提前寫的紀錄\n- x02：提前寫的紀錄\n');
  assert.deepEqual(E.requestsInfo(proj2dir).done, {});
  r = await update({ ids: ['s01'], state: 'done', round: 'r999', message: '已重做並通過 build、audit' });
  q = (await r.json()).requests;
  assert.deepEqual(q.done.s01, { round: 'r999', note: '已重做並通過 build、audit' });
  assert.equal(q.done.x02, undefined);
  assert.deepEqual(E.requestsInfo(proj2dir), q, '狀態從磁碟讀取，重啟仍保留');
  const cli = spawnSync(process.execPath, [EDITOR, '--project', proj2dir, '--requests-state', 'generating', '--request-revision', revision, '--ids', 'x02'], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(JSON.parse(cli.stdout).requests.states.x02.state, 'generating');
  const latest = await (await post2('/api/requests', { markdown: '# 修改單新版\n\n## 1. s01\n' })).json();
  assert.notEqual(latest.requests.revision, revision);
  assert.deepEqual(latest.requests.states, {}, '新修改單不沿用舊狀態');
  assert.equal((await update({ ids: ['s01'], state: 'done' })).status, 409);
});

test('人聲響度（ebur128，剪掉的範圍不算）與縮圖條（ffmpeg sprite，快取在 .editor/thumbs/）', async () => {
  await setup2(); reset2();
  const r = await post2('/api/loudness', { cuts: [[0, 1]] });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.ok(Number.isFinite(j.integrated) && j.integrated < 0, `量到 ${j.integrated} LUFS`);
  assert.equal(j.target, -14);
  assert.equal(j.suggest, Math.max(-60, Math.min(12, Math.round((-14 - j.integrated) * 10) / 10)));
  assert.deepEqual(E.parseLoudness('Summary:\n  Integrated loudness:\n    I:         -20.3 LUFS\n  Loudness range:\n    LRA:         5.1 LU\n  True peak:\n    Peak:       -1.2 dBFS'), { integrated: -20.3, truePeak: -1.2, lra: 5.1 });
  assert.deepEqual(E.thumbPlan(6), { interval: 1, count: 6, cols: 6, rows: 1, w: 160, h: 90 });
  assert.equal(E.thumbPlan(3600).count <= 400, true);
  let t = null;
  for (let i = 0; i < 60; i++) { t = await (await get2('/api/thumbs?src=main')).json(); if (!t.pending) break; await new Promise((res) => setTimeout(res, 200)); }
  assert.ok(t.url, JSON.stringify(t));
  const img = await get2(t.url);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/jpeg');
  assert.ok((await img.arrayBuffer()).byteLength > 1000);
  assert.ok(fs.existsSync(path.join(proj2dir, 'work', 'hyperframes', '.editor', 'thumbs', 'main.jpg')));
  assert.equal((await get2('/sfx/..%2F..%2Fbuild.mjs')).status, 404);
  assert.equal((await get2('/editor-cache/thumbs/../server.json')).status, 404);
});

// ---------- 講者（調光、瘦臉；contracts/look.md §7） ----------

const FACE58 = [[1.5,62.1],[1.3,30.7],[0.7,21.6],[-0.9,-18.3],[-4.2,-97.9],[1.7,72],[2.6,90.5],[2.8,108.1],[3.9,110.2],[-91.7,-51.4],
  [-56.7,-21.4],[-84.4,-68.1],[-80.2,73.3],[-27.8,80.2],[-52.3,-91.2],[-79.7,-44.4],[-93.5,27.4],[-72,-81.7],[-60.1,-61.7],[-30.4,-95.9],
  [-97.1,-13],[-88.7,49.5],[-24.4,-20],[-58.3,103.8],[-11.6,135],[-35.6,122.1],[-45.9,114.5],[5.7,136.5],[-95.7,-33.8],[-1.3,-30.7],
  [-69.3,91.4],[5.3,131.5],[-24.7,129.2],[4.7,124.2],[4.3,116.4],[-95.7,6.8],[92.7,-60.1],[57.5,-26.9],[82.5,-76.2],[93.1,65.8],
  [35.1,79.7],[45.4,-95.9],[77.9,-51.1],[103.7,19],[67.4,-88.6],[54.8,-66.6],[22.4,-98.6],[103.1,-22],[100.5,41.5],[25.6,-21.7],
  [72.1,98.8],[23.8,134.2],[49.2,119.8],[59.7,111],[99.2,-43],[82.8,85.1],[37.7,127.8],[104.1,-1.9]];

test('講者：/api/state 的 look 區塊；存 look（插入、取代、恢復預設、擋錯），rhythm／outro 原樣保留；配樂不列進音效清單', async () => {
  const s = await (await get('/api/state')).json();
  assert.deepEqual(s.look.kit, { color: 0, slim: 0, beauty: 0 }, '工作區預設：不調光、不瘦臉、不美顏（使用者要求才開）');
  assert.equal(s.look.plan, null);
  assert.deepEqual(s.look.effective, { color: 0, slim: 0, beauty: 0, source: 'kit' });
  assert.deepEqual(s.look.limits, { color: [0, 1], slim: [0, 1.2], beauty: [0, 1], step: 0.05 });
  assert.equal(s.look.lines.length, 2);
  assert.match(s.look.lines[0], /^講者調光：關/);
  assert.ok(s.schema.sounds.includes('ding') && !s.schema.sounds.includes('bgm-cylinder-five'), s.schema.sounds.join(','));
  const orig = planNow();
  const withExtra = orig.replace('  "speakerBox":', '  "rhythm": { "pace": "normal" },\n  "outro": "#2",\n  "speakerBox":');
  assert.notEqual(withExtra, orig);
  fs.writeFileSync(planFile, withExtra);
  let r = await post('/api/save', { base: await base(), look: { color: 0.5, slim: 0.3 } });
  assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
  let j = await r.json();
  assert.deepEqual(j.look.effective, { color: 0.5, slim: 0.3, beauty: 0, source: 'plan' });
  const t1 = planNow();
  assert.match(t1, /\n  "look": \{ "color": 0\.5, "slim": 0\.3 \},\n  "(edit|scenes)": /);
  assert.equal(t1.replace(/  "look": \{[^}]*\},\n/, ''), withExtra);
  r = await post('/api/save', { base: await base(), look: { color: 0.6, slim: 0.3 } });
  assert.equal(r.status, 200);
  assert.equal(planNow(), t1.replace('"color": 0.5', '"color": 0.6'));
  for (const [look, re] of [[{ color: 2, slim: 0 }, /look\.color 要是 0–1 的數字，現在是 2/], [false, /look 要是/], [{ color: 0.5 }, /look\.slim 要是 0–1\.2 的數字/], [{ color: 0.5, slim: 0.5, eyes: 1 }, /look 不能有「eyes」/]]) {
    const before = planNow();
    r = await post('/api/save', { base: await base(), look });
    assert.equal(r.status, 400, JSON.stringify(look));
    assert.match((await r.json()).message, re);
    assert.equal(planNow(), before);
  }
  r = await post('/api/save', { base: await base(), look: null });
  assert.equal(r.status, 200);
  assert.equal(planNow(), withExtra);
  assert.match(planNow(), /"rhythm": \{ "pace": "normal" \},\n  "outro": "#2",\n  "speakerBox"/);
  // 一行寫好幾個鍵、look 後面接換行：恢復預設只拿掉「, "look": {…}」，換行與縮排留給下一個鍵（C-10）
  const compact = orig.replace('"speakerBox": [700, 200, 1220, 1000],\n', '"speakerBox": [700, 200, 1220, 1000], "look": { "slim": 0.6, "color": 0.5 },\n');
  assert.notEqual(compact, orig);
  fs.writeFileSync(planFile, compact);
  r = await post('/api/save', { base: await base(), look: null });
  assert.equal(r.status, 200);
  assert.equal(planNow(), orig);
  fs.writeFileSync(planFile, orig);
});

test('主題（010 §10）：存 theme 插入／原地換／拿掉、選亮又本來沒寫＝不動、擋錯；和 look 一起新插時順序 look、theme', async () => {
  const W = await imp('editor/server/write.mjs');
  assert.deepEqual(W.sanitizeTheme('dark'), { theme: 'dark', errors: [] });
  assert.deepEqual(W.sanitizeTheme(null), { theme: null, errors: [] });
  assert.deepEqual(W.sanitizeTheme('blue').errors, ['theme 只能是 "light"（亮，預設）或 "dark"（暗），現在是 "blue"']);
  const orig = planNow();
  assert.ok(!orig.includes('"theme"'));
  // 本來沒寫又選亮：不寫檔
  let r = await post('/api/save', { base: await base(), theme: 'light' });
  assert.equal(r.status, 200);
  assert.equal(planNow(), orig);
  // 暗：插在 edit（或 scenes）前面，其他文字逐字相同
  r = await post('/api/save', { base: await base(), theme: 'dark' });
  assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
  assert.equal((await r.json()).plan.data.theme, 'dark');
  const t1 = planNow();
  assert.match(t1, /\n  "theme": "dark",\n  "(edit|scenes)": /);
  assert.equal(t1.replace('  "theme": "dark",\n', ''), orig);
  // 換回亮：原地換值
  r = await post('/api/save', { base: await base(), theme: 'light' });
  assert.equal(r.status, 200);
  assert.equal(planNow(), t1.replace('"theme": "dark"', '"theme": "light"'));
  // null：拿掉，回到原文
  r = await post('/api/save', { base: await base(), theme: null });
  assert.equal(r.status, 200);
  assert.equal(planNow(), orig);
  // 擋錯：檔案不動
  for (const bad of ['blue', 1, { v: 'dark' }]) {
    r = await post('/api/save', { base: await base(), theme: bad });
    assert.equal(r.status, 400, JSON.stringify(bad));
    assert.match((await r.json()).message, /theme 只能是 "light"（亮，預設）或 "dark"（暗）/);
    assert.equal(planNow(), orig);
  }
  // 和 look 一起新插：look、theme 的順序（和 withTop 的物件順序一樣，才是局部改寫）
  r = await post('/api/save', { base: await base(), theme: 'dark', look: { color: 0.5, slim: 0.3 } });
  assert.equal(r.status, 200);
  const t2 = planNow();
  assert.match(t2, /\n  "look": \{ "color": 0\.5, "slim": 0\.3 \},\n  "theme": "dark",\n  "(edit|scenes)": /);
  assert.equal(t2.replace('  "look": { "color": 0.5, "slim": 0.3 },\n  "theme": "dark",\n', ''), orig);
  r = await post('/api/save', { base: await base(), theme: null, look: null });
  assert.equal(r.status, 200);
  assert.equal(planNow(), orig);
});

test('字幕預覽（F8）：頁面直接載 kit/captions.css、字幕放在畫布大小的圖層，剪輯不自己寫字幕的數字', async () => {
  const page = await (await get('/')).text();
  assert.match(page, /<link rel="stylesheet" href="\/kit\/captions\.css">/);
  assert.match(page, /<div id="simCapLayer" class="cap-layer"><div id="simCaption" class="cg off"><span><\/span><\/div><\/div>/);
  const css = await get('/kit/captions.css');
  assert.equal(css.status, 200);
  assert.match(await css.text(), /\.cg > span \{[^}]*font-size: 76px/);
  const ed = await (await get('/editor/editor.css')).text();
  assert.ok(!/\.cg[^{]*\{[^}]*(font-size|bottom|padding)/.test(ed), '剪輯的 css 不能另外寫字幕的字級、位置、內距');
  assert.ok(!ed.includes('.sim-caption'));
  assert.match(ed, /\.cap-layer \{[^}]*width: calc\(var\(--cw\) \* 1px\); height: calc\(var\(--ch\) \* 1px\)/);
});

// ---------- 直式（009 FR-120）：預覽框 9:16、字數提醒 12、存檔保留 format、縮圖直的 ----------

test('直式（009 FR-120）：/api/state 的 canvas 讀 lib/canvas.mjs；預覽框比例是 CSS 變數；字數提醒 12；存檔不動 format；縮圖每格 90×160', async () => {
  const { CANVAS } = await imp('lib/canvas.mjs');
  const P = CANVAS.portrait;
  // 橫式（範例沒寫 format、沒有主軌）：1920×1080、18 字
  const s1 = await (await get('/api/state')).json();
  assert.deepEqual([s1.canvas.format, s1.canvas.W, s1.canvas.H, s1.canvas.maxChars], ['landscape', 1920, 1080, 18]);
  // 直式專案：plan.json 寫 "format": "portrait"、rough.mp4 是直的
  const dir = path.join(root, 'projects', '直式'), w3 = path.join(dir, 'work');
  fs.mkdirSync(path.join(w3, 'hyperframes'), { recursive: true });
  const v = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=90x160:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
    '-t', '3', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(w3, 'rough.mp4')]);
  assert.equal(v.status, 0, String(v.stderr));
  fs.writeFileSync(path.join(w3, 'rough.srt'), makeSrt({ n: 1 }));
  const plan3 = path.join(w3, 'hyperframes', 'plan.json');
  const text3 = '{\n  "version": 1,\n  "format": "portrait",\n  "speakerBox": [200, 1000, 880, 1800],\n  "scenes": [\n    { "id": "s01", "scene": "concept", "from": "#1", "to": "#1e", "slots": { "text": "直式" } }\n  ]\n}\n';
  fs.writeFileSync(plan3, text3);
  const ed3 = await E.startEditor({ flags: { project: dir, template: path.join(root, 'shared', 'template') }, cwd: root, port: BASE_PORT + 1000, writeState: false });
  try {
    const u = (p) => new URL(p, ed3.url);
    const s = await (await fetch(u('/api/state'))).json();
    assert.deepEqual(s.canvas, { format: 'portrait', source: 'plan.json', W: 1080, H: 1920, maxChars: P.caption.maxChars, captionBottom: P.caption.bottom, pip: P.pip.box,
      media: { panel: { contain: [0, 240, 1080, 660], cover: [0, 0, 1080, 900] }, full: { contain: [0, 240, 1080, 1020], cover: [0, 0, 1080, 1920] }, side: null } });
    assert.equal(s.canvas.W / s.canvas.H, 9 / 16, '預覽框 9:16');
    // 頁面：預覽框的比例、講者框、字數提醒都讀 canvas，不再寫死 16:9／1920／18
    const css = await (await fetch(u('/editor/editor.css'))).text();
    assert.match(css, /\.stage-box \{ --cw: 1920; --ch: 1080;[^}]*width: min\(100cqw, calc\(100cqh \* var\(--cw\) \/ var\(--ch\)\)\); aspect-ratio: var\(--cw\) \/ var\(--ch\);/);
    const js = await (await fetch(u('/editor/app.js'))).text();
    assert.match(js, /box\.style\.setProperty\('--cw', String\(c\.W\)\)/);
    assert.match(js, /left: `\$\{\(x1 \/ W\) \* 100\}%`, top: `\$\{\(y1 \/ H\) \* 100\}%`/);
    assert.equal(js.split('RULES.capMax').length - 1, 1, '字數提醒要用 canvas 的 maxChars（RULES.capMax 只剩還沒載入時的預設）');
    assert.ok(!/\/ 1920\b|\/ 1080\b/.test(js + await (await fetch(u('/editor/preview.js'))).text()), 'app.js／preview.js 不再除以 1920／1080');
    // 存檔：只插 edit，format 原封不動；body 帶 format 被擋
    const b = { mtime: s.plan.mtime, hash: s.plan.hash };
    let r = await fetch(u('/api/save'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base: b, edit: { cuts: [[0, 0.5]] } }) });
    assert.equal(r.status, 200, await r.clone().text());
    const after1 = fs.readFileSync(plan3, 'utf8');
    assert.ok(after1.startsWith('{\n  "version": 1,\n  "format": "portrait",\n  "speakerBox": [200, 1000, 880, 1800],\n'), after1);
    assert.equal(JSON.parse(after1).format, 'portrait');
    const s2 = await (await fetch(u('/api/state'))).json();
    r = await fetch(u('/api/save'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base: { mtime: s2.plan.mtime, hash: s2.plan.hash }, format: 'landscape' }) });
    assert.equal(r.status, 400);
    assert.match((await r.json()).message, /不能寫「format」/);
    assert.equal(fs.readFileSync(plan3, 'utf8'), after1);
    // 縮圖條：直拍每格 90×160（橫的還是 160×90）
    assert.deepEqual([E.thumbPlan(6, { width: 1080, height: 1920 }).w, E.thumbPlan(6, { width: 1080, height: 1920 }).h], [90, 160]);
    assert.deepEqual([E.thumbPlan(6, { width: 1920, height: 1080 }).w, E.thumbPlan(6).h], [160, 90]);
    let t = null;
    for (let i = 0; i < 60; i++) { t = await (await fetch(u('/api/thumbs?src=main'))).json(); if (!t.pending) break; await new Promise((res) => setTimeout(res, 200)); }
    assert.deepEqual([t.w, t.h], [90, 160], JSON.stringify(t));
  } finally { await ed3.close(); }
});

test('講者：lookCss 係數與比值', async () => {
  const M = await imp('editor/model.mjs');
  assert.equal(M.lookCss(0.8, 0), 'brightness(1.066) contrast(1.016) saturate(1.0568)');
  assert.equal(M.lookCss(0.8, 0.8), 'none');
  assert.equal(M.lookCss(0, 0), 'none');
  assert.equal(M.lookCss(0, 0.8), 'brightness(0.9381) contrast(0.9843) saturate(0.9463)');
});

test('講者：/api/look/face 沒有 landmark 回 nolandmarks；有就回 360×360 JPEG；沒偵測到的格回 noface', async () => {
  let r = await get('/api/look/face?t=1&slim=0.6');
  assert.equal(r.status, 404);
  assert.equal((await r.json()).error, 'nolandmarks');
  const p = FACE58.flatMap(([x, y]) => [80 + x * 0.2, 45 + y * 0.2]);
  const frames = Array.from({ length: 180 }, (_, i) => (i === 60 ? null : { p, b: [60, 25, 100, 75], n: 1 }));
  fs.writeFileSync(path.join(work, 'face-landmarks.json'), JSON.stringify({ version: 1, frames, summary: { rate: 0.99, medianFaceWidth: 40, slimOk: false, reason: 'small' } }));
  r = await get('/api/look/face?t=1&slim=0.6');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'image/jpeg');
  const buf = Buffer.from(await r.arrayBuffer());
  assert.deepEqual([buf[0], buf[1]], [0xff, 0xd8]);
  const f = path.join(work, 'face.jpg');
  fs.writeFileSync(f, buf);
  assert.equal(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f], { encoding: 'utf8' }).stdout.trim(), '360,360');
  r = await get('/api/look/face?t=2&slim=0.6');
  assert.equal(r.status, 404);
  assert.equal((await r.json()).error, 'noface');
  fs.rmSync(path.join(work, 'face-landmarks.json'));
  fs.rmSync(f);
});

// ---------- 構圖（停點 ②、之後在剪輯改構圖）----------
test('構圖：sanitizeFrame（比例、出界、最多 2 倍、整個畫面＝null）；remapToFrame 換框來回不變、pipCrop 出界交回 auto', async () => {
  const Wm = await imp('editor/server/write.mjs'), cv = { W: 1920, H: 1080 };
  assert.deepEqual(Wm.sanitizeFrame([182, 144, 1664, 936], cv), { frame: [182, 144, 1664, 936], errors: [] });
  assert.deepEqual(Wm.sanitizeFrame([0, 0, 1920, 1080], cv), { frame: null, errors: [] });
  assert.match(Wm.sanitizeFrame([0, 0, 1000, 1000], cv).errors.join(), /寬高比要和畫面一樣/);
  assert.match(Wm.sanitizeFrame([1000, 0, 1664, 936], cv).errors.join(), /要整個在畫面裡/);
  assert.match(Wm.sanitizeFrame([0, 0, 800, 450], cv).errors.join(), /最多放大 2 倍/);
  assert.match(Wm.sanitizeFrame('1.15', cv).errors.join(), /要是 \[x, y, w, h\]/);
  const F = [182, 144, 1664, 936], box = [600, 200, 1400, 1000];
  const full = Wm.remapToFrame(box, F, null, cv);
  assert.deepEqual(full, [702, 317, 1395, 1011]);
  assert.deepEqual(Wm.remapToFrame(full, null, F, cv), box);
  assert.equal(Wm.remapToFrame([0, 0, 432, 324], null, F, cv, 'rect'), 'auto', '放大後左上角跑出畫面');
  assert.deepEqual(Wm.remapToFrame([800, 400, 432, 324], null, F, cv, 'rect'), [713, 295, 498, 374]);
});

test('構圖（server）：/framing 頁、沒裁切的 /media/source.mp4、/api/framing 分析；還沒有 plan.json 時只存 frame 會新建；換框時 speakerBox 跟著換算；舊的 hash 409、比例不對 400', async () => {
  const dir = path.join(root, 'projects', '構圖'), w = path.join(dir, 'work'), plan = path.join(w, 'hyperframes', 'plan.json');
  fs.mkdirSync(w, { recursive: true });
  const v = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30', '-t', '4', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', path.join(w, 'rough.mp4')]);
  assert.equal(v.status, 0, String(v.stderr));
  const ed4 = await E.startEditor({ flags: { project: dir, template: path.join(root, 'shared', 'template') }, cwd: root, port: BASE_PORT + 1200, writeState: false });
  try {
    const u = (p) => new URL(p, ed4.url);
    const save = (body) => fetch(u('/api/save'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.match(await (await fetch(u('/framing'))).text(), /<title>構圖<\/title>/);
    assert.equal((await fetch(u('/media/source.mp4'))).status, 200);
    const a = await (await fetch(u('/api/framing'))).json();
    assert.deepEqual([a.canvas.format, a.canvas.W, a.canvas.H, a.srcSize[0], a.plan.exists, a.limits.maxZoom], ['landscape', 1920, 1080, 320, false, 2], JSON.stringify(a).slice(0, 300));
    assert.equal(a.suggestion.frame.length, 4);
    assert.match(a.video.url, /^\/media\/source\.mp4\?v=/);
    // 還沒有 plan.json：存 frame 以外的東西還是 404；只存 frame 就新建
    assert.equal((await save({ base: {}, edit: { cuts: [] } })).status, 404);
    let r = await save({ base: { hash: null }, frame: [182, 144, 1664, 936] });
    assert.equal(r.status, 200, await r.clone().text());
    assert.deepEqual(JSON.parse(fs.readFileSync(plan, 'utf8')), { version: 1, frame: [182, 144, 1664, 936] });
    const j = await r.json();
    assert.deepEqual(j.plan.frame, [182, 144, 1664, 936]);
    assert.equal((await save({ base: { hash: null }, frame: null })).status, 409, '頁面以為還沒有 plan.json，其實已經有了');
    // 已經量過 speakerBox：換成不裁切，speakerBox 換算成同一塊畫面、拿掉 frame
    fs.writeFileSync(plan, '{\n  "version": 1,\n  "frame": [182, 144, 1664, 936],\n  "speakerBox": [600, 200, 1400, 1000],\n  "scenes": []\n}\n');
    const st = await (await fetch(u('/api/framing'))).json();
    r = await save({ base: { hash: st.plan.hash }, frame: null });
    assert.equal(r.status, 200, await r.clone().text());
    assert.deepEqual((await r.json()).notes, ['speakerBox 跟著新的框換算：[600, 200, 1400, 1000] → [702, 317, 1395, 1011]']);
    assert.equal(fs.readFileSync(plan, 'utf8'), '{\n  "version": 1,\n  "speakerBox": [702, 317, 1395, 1011],\n  "scenes": []\n}\n', '只動 frame 與 speakerBox，其他排版不變');
    const st2 = await (await fetch(u('/api/framing'))).json();
    r = await save({ base: { hash: st2.plan.hash }, frame: [0, 0, 1000, 1000] });
    assert.equal(r.status, 400);
    assert.match((await r.json()).message, /寬高比要和畫面一樣/);
  } finally { await ed4.close(); }
});

test('構圖（server）：一起存講者調光瘦臉（look，還沒有 plan.json 也行）；瘦臉關著不能偵測；/api/look/status；用這一格當預覽參考圖（裁切、縮放到畫布）', async () => {
  const dir = path.join(root, 'projects', '構圖二'), w = path.join(dir, 'work'), plan = path.join(w, 'hyperframes', 'plan.json');
  const prev = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-editor-prev-'));
  fs.mkdirSync(w, { recursive: true });
  const v = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30', '-t', '3', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', path.join(w, 'rough.mp4')]);
  assert.equal(v.status, 0, String(v.stderr));
  const ed5 = await E.startEditor({ flags: { project: dir, template: path.join(root, 'shared', 'template') }, cwd: root, port: BASE_PORT + 1210, writeState: false, previewDir: prev });
  try {
    const u = (p) => new URL(p, ed5.url);
    const post5 = (p, body) => fetch(u(p), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const a = await (await fetch(u('/api/framing'))).json();
    assert.deepEqual([a.look.running, a.look.look.landmarks.ready, a.ref.exists], [false, false, false]);
    let r = await post5('/api/save', { base: { hash: null }, frame: null, look: { color: 0.8, slim: 0 } });
    assert.equal(r.status, 200, await r.clone().text());
    assert.deepEqual(JSON.parse(fs.readFileSync(plan, 'utf8')).look, { color: 0.8, slim: 0 });
    assert.equal((await r.json()).look.look.effective.color, 0.8);
    r = await post5('/api/look/run', {});
    assert.equal(r.status, 400);
    assert.match((await r.json()).message, /瘦臉、美顏都是關的/);
    assert.equal((await (await fetch(u('/api/look/status'))).json()).running, false);
    assert.equal((await post5('/api/refframe', { t: -1 })).status, 400);
    r = await post5('/api/refframe', { t: 1, frame: [182, 144, 1664, 936], color: 0.8 });
    assert.equal(r.status, 200, await r.clone().text());
    const j = await r.json(), f = path.join(prev, 'speaker-local.jpg');
    assert.equal(j.ref.exists, true);
    const p = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f], { encoding: 'utf8' });
    assert.equal(p.stdout.trim(), '1920,1080', '裁切後縮放到畫布大小');
    assert.equal((await (await fetch(u('/api/framing'))).json()).ref.exists, true);
  } finally { await ed5.close(); fs.rmSync(prev, { recursive: true, force: true }); }
});
