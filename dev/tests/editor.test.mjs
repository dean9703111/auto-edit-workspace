// 剪輯台 editor.mjs：讀狀態、只寫允許的欄位、拒絕其他欄位、修改時間衝突、Range、port 被佔用、背景執行與關閉；
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
    { "id": "m01", "type": "media", "src": "素材/螢幕錄影/demo.mp4", "from": "#4", "to": "#5e", "in": 1 }
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
  proj = path.join(root, 'projects', '範例');
  work = path.join(proj, 'work');
  out = path.join(work, 'hyperframes');
  fs.mkdirSync(out, { recursive: true });
  fs.mkdirSync(path.join(proj, '素材', '螢幕錄影'), { recursive: true });
  const v = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=160x90:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
    '-t', '6', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(work, 'rough.mp4')]);
  assert.equal(v.status, 0, String(v.stderr));
  fs.copyFileSync(path.join(work, 'rough.mp4'), path.join(proj, '素材', '螢幕錄影', 'demo.mp4'));
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
  assert.equal(s.project.name, '範例');
  assert.equal(s.project.dir, 'projects/範例');
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
  assert.match(await page.text(), /剪輯台/);
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
  assert.deepEqual(plan.scenes[1], { id: 'm01', type: 'media', src: '素材/螢幕錄影/demo.mp4', from: '#4', to: '#5e', in: 1, enter: 'slide', volume: -3 });
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
    [{ base: b, media: { m01: { src: '素材/圖片/x.png' } } }, /不能改「src」/],
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
  // 不是剪輯台頁面送的（不是 JSON、別的網站、別的 Host）
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
  // 重新載入後再存：AI 的修改和剪輯台的設定都在
  const r3 = await post('/api/save', { base: await base(), edit: { fadeOut: 1 } });
  assert.equal(r3.status, 200);
  const p = JSON.parse(planNow());
  assert.deepEqual(p.avoid, []);
  assert.equal(p.edit.fadeOut, 1);
});

test('Range：影片可以分段讀（206／416）、ETag；只開放素材資料夾；成片預覽的路徑不能跳出 work/hyperframes', async () => {
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
  const m = await get('/file/素材/螢幕錄影/demo.mp4', { Range: 'bytes=0-9' });
  assert.equal(m.status, 206);
  await m.arrayBuffer();
  assert.equal((await get('/file/work/hyperframes/plan.json')).status, 403);
  assert.equal((await get('/file/素材/螢幕錄影/../../work/rough.srt')).status, 403);
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
  const m = r.stdout.match(/剪輯台：(http:\/\/127\.0\.0\.1:(\d+)\/)/);
  assert.ok(m, r.stdout);
  assert.match(r.stdout, /已在背景執行.*--stop --project projects\/EP2/);
  const u = m[1];
  try {
    assert.equal((await fetch(new URL('/api/ping', u))).status, 200);
    const st = run('--status');
    assert.match(st.stdout, new RegExp(`剪輯台開著：${u.replace(/[.]/g, '\\.')}`));
    const again = run();
    assert.match(again.stdout, /剪輯台已經開著/);
  } finally {
    const stop = run('--stop');
    assert.match(stop.stdout, /已關閉剪輯台/);
  }
  await assert.rejects(fetch(new URL('/api/ping', u), { signal: AbortSignal.timeout(1000) }));
  assert.match(run('--status').stdout, /剪輯台沒有開/);
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
    edit: { cuts: [], fadeIn: 0, fadeOut: 0, volume: { voice: 0, sfx: 0, media: 0 }, joins: [] }, paths: { project: 'projects/範例' } };
  assert.deepEqual(E.parseReport(`專案：projects/範例\n${JSON.stringify(mock)}\n`), mock);
  assert.equal(E.parseReport('通過：3 段，2 個提醒（⚠）。'), null);
  assert.deepEqual(E.issuesFromText('✖ [s01] 錯 → 改\n⚠ [s02] 提醒\n通過'), { errors: ['[s01] 錯 → 改'], warnings: ['[s02] 提醒'] });
  const items = E.itemsFromText('id｜情境｜起–迄｜長度｜音效時間｜警告\ns01｜06 一般字卡｜0:04.50–0:11.00｜6.5s｜pop 0:04.62｜⚠ 1（rough 0:07.00–0:13.50）\ns02｜fx 29｜0:15.00–0:18.00｜3s｜—｜—',
    { scenes: [{ id: 's01' }, { id: 's02', type: 'fx' }] });
  assert.deepEqual(items.map((i) => [i.id, i.type, i.start, i.end, i.warnings]), [['s01', 'scene', 7, 13.5, 1], ['s02', 'fx', 15, 18, 0]]);
  // 每台電腦的 npx 快取雜湊都不一樣：掃 _npx/*/node_modules/hyperframes，取版本最新的
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-home-'));
  for (const [hash, ver] of [['aaa111', '0.8.145'], ['bbb222', '0.8.214'], ['ccc333', '0.7.107']]) {
    const d = path.join(home, '.npm', '_npx', hash, 'node_modules', 'hyperframes');
    fs.mkdirSync(path.join(d, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ version: ver }));
    fs.writeFileSync(path.join(d, 'dist', 'hyperframes-player.global.js'), '//');
    fs.writeFileSync(path.join(d, 'dist', 'hyperframe.runtime.iife.js'), '//');
  }
  fs.rmSync(path.join(home, '.npm', '_npx', 'bbb222', 'node_modules', 'hyperframes', 'dist', 'hyperframe.runtime.iife.js'));
  const found = E.findPlayer({ home, env: {} });
  assert.equal(found.version, '0.8.145', '缺 runtime 的版本不算');
  assert.match(found.player, /aaa111/);
  assert.equal(E.findPlayer({ home: fs.mkdtempSync(path.join(os.tmpdir(), 'hf-empty-')), env: {} }), null);
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
    { "id": "m01", "type": "media", "src": "素材/螢幕錄影/demo.mp4", "from": "#3", "to": "#4e", "in": 1, "sfx": "whoosh" }
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
  fs.mkdirSync(path.join(proj2dir, '素材', '螢幕錄影'), { recursive: true });
  fs.copyFileSync(path.join(work, 'rough.mp4'), path.join(proj2dir, 'work', 'rough.mp4'));
  fs.copyFileSync(path.join(work, 'rough.mp4'), path.join(proj2dir, '素材', '螢幕錄影', 'demo.mp4'));
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

test('卡片文字：slots／vars 只能改文字值；欄位增減、清單超過上限、改清單的 at、改非文字欄位都被擋', async () => {
  await setup2(); reset2();
  const b = await base2();
  const ok = await post2('/api/save', { base: b, segments: {
    s01: { slots: { text: '**場地**設定' } },
    s02: { slots: { title: '三個重點', items: ['一一', { text: '二二', at: '#4' }, '三三 ｜at=#4+0.2', '四四'] } },
    f01: { vars: { number: '29', label: '支影片' } },
  } });
  assert.equal(ok.status, 200, await ok.clone().text());
  const p = JSON.parse(fs.readFileSync(plan2File, 'utf8'));
  assert.deepEqual(p.scenes[1].slots.items, ['一一', { text: '二二', at: '#4' }, '三三 ｜at=#4+0.2', '四四']);
  assert.deepEqual(p.scenes[2].vars, { number: '29', label: '支影片' });
  const b2 = await base2();
  const cases = [
    [{ s01: { slots: { text: 'a', tag: '新欄位' } } }, /欄位不能增減/],
    [{ s02: { slots: { title: 'x', items: ['1', '2', '3', '4', '5'] } } }, /有 5 項，要在 2–4 項之間/],
    [{ s02: { slots: { title: 'x', items: ['一', { text: '二', at: '#1' }, '三 ｜at=#4+0.2', '四'] } } }, /「at」不是文字，只能沿用原本的值/],
    [{ s02: { slots: { title: 'x', items: ['一', { text: '二', at: '#4' }, '三 ｜at=#1', '四'] } } }, /「at=#1」不是原本就有的值/],
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
