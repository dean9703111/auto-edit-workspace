// capcut.mjs draft（剪映草稿）：清單.json、分軌、草稿 JSON（軌道數、起點／長度微秒、畫布、字幕則數）、註冊 root_meta_info.json、
// 剪映開著／同名／剪映存過的草稿都拒絕。草稿根目錄一律是暫存資料夾，量素材用假的 probe（不用 ffprobe）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { imp, tmpDir, makeSrt } from './helpers.mjs';

const C = await imp('capcut.mjs');
const J = await imp('lib/jianying-draft.mjs');

// 直式、主軌 20 秒、三支 mov（第 2、3 支時間重疊）、字幕 4 句
const CC = { duration: 20, format: 'portrait', main: { duration: 20 },
  segs: [{ id: 's01', start: 0, duration: 5 }, { id: 's02', start: 5, duration: 6.5 }, { id: 'm03', start: 11, duration: 4.25 }] };
CC.segs.push({ id: 's04', start: 10.5, duration: 2 });   // 和 s02（到 11.5）重疊 → 第 2 條軌；m03 和兩條都重疊 → 第 3 條軌

function setup(t, { probe } = {}) {
  const base = tmpDir(t, 'capcut-draft-');
  const dir = path.join(base, 'ppa-短影片1', 'output', 'capcut');
  const root = path.join(base, 'drafts');
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(root);
  const list = C.listJson(CC, { project: 'ppa-短影片1' });
  fs.writeFileSync(path.join(dir, '清單.json'), JSON.stringify(list));
  for (const f of list.檔案) if (!f.檔名.endsWith('.srt')) fs.writeFileSync(path.join(dir, f.檔名), '');
  fs.writeFileSync(path.join(dir, '字幕.srt'), makeSrt({ n: 4 }));
  const rootMeta = { all_draft_store: [{ draft_name: '既有', draft_fold_path: path.join(root, '既有') }], draft_ids: 3, root_path: root };
  fs.writeFileSync(path.join(root, 'root_meta_info.json'), JSON.stringify(rootMeta));
  const byName = Object.fromEntries(list.檔案.map((f) => [f.檔名, f]));
  const logs = [];
  const opts = {
    dir, root, name: 'ppa-短影片1', running: () => false, cover: () => true, log: (s) => logs.push(s), cmd: 'node shared/template/tools/capcut.mjs --project projects/ppa-短影片1',
    probe: probe ?? ((f) => ({ durUs: J.us(byName[path.basename(f)].長度 + (f.endsWith('.mov') ? 1 / 30 : 0)), width: 1080, height: 1920, hasAudio: true })),
  };
  return { dir, root, opts, logs, list };
}
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

test('清單.json：主軌、每支 mov（開始秒、長度、疊加 N＝時間重疊就分軌）、字幕', () => {
  const l = C.listJson(CC, { project: 'p' });
  assert.equal(l.寬, 1080); assert.equal(l.高, 1920); assert.equal(l.fps, 30);
  assert.deepEqual(l.檔案[0], { 檔名: '主軌.mp4', 開始秒: 0, 長度: 20, 軌道建議: '主軌' });
  assert.deepEqual(l.檔案.slice(1, -1).map((f) => [f.檔名, f.開始秒, f.長度, f.軌道建議]), [
    ['01_s01_0m00.00s.mov', 0, 5, '疊加 1'], ['02_s02_0m05.00s.mov', 5, 6.5, '疊加 1'], ['03_m03_0m11.00s.mov', 11, 4.25, '疊加 3'], ['04_s04_0m10.50s.mov', 10.5, 2, '疊加 2'],
  ]);
  assert.equal(l.檔案.at(-1).軌道建議, '字幕');
  assert.equal(C.listJson({ ...CC, format: 'landscape' }, { project: 'p' }).寬, 1920);
});

test('laneOf：剛好接上的同一軌，重疊的分開', () => {
  assert.deepEqual(J.laneOf([{ start: 0, end: 5 }, { start: 5, end: 8 }, { start: 7, end: 9 }, { start: 8, end: 10 }]), [0, 0, 1, 0]);
  assert.deepEqual(J.laneOf([]), []);
});

test('參數：draft 子指令、--name；--name 只用在 draft；draft 不收 render 的參數', () => {
  assert.deepEqual(C.parseCapcutArgs(['draft', '--project', 'p', '--name', 'x', '--force']), { cmd: 'draft', project: 'p', name: 'x', force: true });
  assert.throws(() => C.parseCapcutArgs(['--project', 'p', '--name', 'x']), /--name 只用在 draft/);
  assert.throws(() => C.parseCapcutArgs(['draft', '--project', 'p', '--only', 's01']), /draft 不用 --only/);
});

test('產生草稿：畫布、軌道數、每段起點／長度（微秒）、字幕則數，註冊進 root_meta_info.json 並先備份', (t) => {
  const { root, opts, logs } = setup(t);
  assert.equal(J.makeDraft(opts), 0, logs.join('\n'));
  const dst = path.join(root, 'ppa-短影片1');
  const d = readJson(path.join(dst, 'draft_info.json'));
  assert.deepEqual(d.canvas_config, { height: 1920, ratio: 'original', width: 1080 });
  assert.equal(d.fps, 30); assert.equal(d.version, 360000); assert.equal(d.new_version, '107.0.0');
  assert.equal(d.duration, 20_000_000);
  assert.deepEqual(d.tracks.map((x) => [x.type, x.flag, x.segments.length]), [['video', 0, 1], ['video', 2, 2], ['video', 2, 1], ['video', 2, 1], ['text', 1, 4]]);
  const span = (x) => x.segments.map((s) => [s.target_timerange.start, s.target_timerange.duration]);
  assert.deepEqual(span(d.tracks[0]), [[0, 20_000_000]]);
  assert.deepEqual(span(d.tracks[1]), [[0, 5_000_000], [5_000_000, 6_500_000]]);
  assert.deepEqual(span(d.tracks[2]), [[10_500_000, 2_000_000]]);
  assert.deepEqual(span(d.tracks[3]), [[11_000_000, 4_250_000]]);
  assert.deepEqual(span(d.tracks[4]).slice(0, 2), [[1_000_000, 3_000_000], [4_500_000, 3_000_000]]);
  // 素材：絕對路徑指回 output/capcut/；mov 的素材長度是檔案長度（比清單多 1 格），片段照清單長度
  const mats = Object.fromEntries(Object.values(d.materials).flat().map((m) => [m.id, m]));
  const mv = mats[d.tracks[1].segments[1].material_id];
  assert.equal(mv.path, path.join(opts.dir, '02_s02_0m05.00s.mov'));
  assert.equal(mv.duration, J.us(6.5 + 1 / 30));
  assert.equal(d.tracks[1].segments[1].source_timerange.duration, 6_500_000);
  // 字幕：type subtitle、白字黑邊、直式字級 8、置中偏下
  const sub = d.tracks[4].segments[0];
  const tm = mats[sub.material_id];
  assert.equal(tm.type, 'subtitle');
  const c = JSON.parse(tm.content);
  assert.equal(c.text, '第 1 句字幕內容');
  assert.deepEqual(c.styles[0].fill.content.solid.color, [1, 1, 1]);
  assert.deepEqual(c.styles[0].strokes[0].content.solid.color, [0, 0, 0]);
  assert.equal(c.styles[0].size, 8);
  assert.ok(sub.clip.transform.y < -0.3 && sub.clip.transform.x === 0);
  // 每個引用都找得到素材、id 不重複
  const ids = Object.values(d.materials).flat().map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const x of d.tracks) for (const s of x.segments) for (const r of [s.material_id, ...s.extra_material_refs]) assert.ok(mats[r], r);
  // 註冊：放在最前面、id 一致、原本的那筆還在；備份在 <根目錄上層>/backups
  const rm = readJson(path.join(root, 'root_meta_info.json'));
  assert.deepEqual(rm.all_draft_store.map((e) => e.draft_name), ['ppa-短影片1', '既有']);
  assert.equal(rm.all_draft_store[0].draft_id, d.id);
  assert.equal(rm.all_draft_store[0].draft_fold_path, dst);
  assert.equal(readJson(path.join(dst, 'draft_meta_info.json')).draft_id, d.id);
  const bks = fs.readdirSync(path.join(path.dirname(root), 'backups'));
  assert.ok(bks.some((f) => /^root_meta_info-\d{8}-\d{6}\.json$/.test(f)), bks.join());
  assert.equal(logs.at(-1), '→ 打開剪映，首頁找『ppa-短影片1』');
});

test('橫式：畫布 1920×1080、字級 7', (t) => {
  const { root, opts, dir } = setup(t);
  const l = readJson(path.join(dir, '清單.json'));
  fs.writeFileSync(path.join(dir, '清單.json'), JSON.stringify({ ...l, 寬: 1920, 高: 1080 }));
  assert.equal(J.makeDraft(opts), 0);
  const d = readJson(path.join(root, 'ppa-短影片1', 'draft_info.json'));
  assert.deepEqual(d.canvas_config, { height: 1080, ratio: 'original', width: 1920 });
  assert.equal(JSON.parse(d.materials.texts[0].content).styles[0].size, 7);
});

test('剪映開著：拒絕，草稿資料夾和 root_meta_info.json 都不動', (t) => {
  const { root, opts, logs } = setup(t);
  const before = fs.readFileSync(path.join(root, 'root_meta_info.json'), 'utf8');
  assert.equal(J.makeDraft({ ...opts, running: () => true }), 1);
  assert.match(logs.join('\n'), /✖ 剪映開著.*→ 關掉剪映/);
  assert.ok(!fs.existsSync(path.join(root, 'ppa-短影片1')));
  assert.equal(fs.readFileSync(path.join(root, 'root_meta_info.json'), 'utf8'), before);
});

test('同名草稿：沒 --force 拒絕；--force 先整個備份再換；剪映存過（加密）的 --force 也不換', (t) => {
  const { root, opts, logs } = setup(t);
  const dst = path.join(root, 'ppa-短影片1');
  assert.equal(J.makeDraft(opts), 0);
  const id1 = readJson(path.join(dst, 'draft_info.json')).id;
  assert.equal(J.makeDraft(opts), 1);
  assert.match(logs.at(-1), /✖ 剪映已經有叫「ppa-短影片1」的草稿 → 要換掉舊的加 --force/);
  assert.equal(readJson(path.join(dst, 'draft_info.json')).id, id1);

  assert.equal(J.makeDraft({ ...opts, force: true }), 0, logs.join('\n'));
  const id2 = readJson(path.join(dst, 'draft_info.json')).id;
  assert.notEqual(id2, id1);
  const bdir = path.join(path.dirname(root), 'backups');
  const old = fs.readdirSync(bdir).find((f) => f.startsWith('ppa-短影片1-'));
  assert.equal(readJson(path.join(bdir, old, 'draft_info.json')).id, id1);
  assert.equal(readJson(path.join(root, 'root_meta_info.json')).all_draft_store.filter((e) => e.draft_fold_path === dst).length, 1, '同一個草稿只註冊一筆');

  fs.writeFileSync(path.join(dst, 'draft_info.json'), 'ENCRYPTED-BYTES');
  assert.equal(J.makeDraft({ ...opts, force: true }), 1);
  assert.match(logs.at(-1), /剪映存過的草稿（加密），--force 也不換/);
  assert.equal(fs.readFileSync(path.join(dst, 'draft_info.json'), 'utf8'), 'ENCRYPTED-BYTES');
});

test('素材沒做完、沒有清單.json、草稿名不合法：拒絕並給下一步', (t) => {
  const { dir, root, opts, logs } = setup(t);
  fs.rmSync(path.join(dir, '03_m03_0m11.00s.mov'));
  assert.equal(J.makeDraft(opts), 1);
  assert.match(logs.at(-1), /✖ 剪映素材還沒做完，缺 1 個檔：03_m03_0m11\.00s\.mov → 先做剪映素材：node /);
  fs.rmSync(path.join(dir, '清單.json'));
  assert.equal(J.makeDraft(opts), 1);
  assert.match(logs.at(-1), /✖ 還沒有 capcut\/清單\.json.*→ 先做剪映素材/);
  assert.equal(J.makeDraft({ ...opts, name: '../x' }), 1);
  assert.match(logs.at(-1), /不能有 \/ 或/);
  assert.deepEqual(fs.readdirSync(root), ['root_meta_info.json']);
});

// 091 Windows 的 CapCut：Mac 格式的草稿放進 CapCut 打開會「專案來自異常路徑」（作者 2026-11-27）
test('091 draftTarget：Windows 先找 CapCut 再找剪映、版本取安裝資料夾裡最大的；JIANYING_DRAFT_ROOT 照路徑認是哪一個；Mac 照舊', (t) => {
  const local = tmpDir(t, 'capcut-local-');
  assert.equal(J.draftTarget({ platform: 'win32', env: { LOCALAPPDATA: local } }), null, '兩個都沒有草稿資料夾');
  const cc = path.join(local, 'CapCut');
  fs.mkdirSync(path.join(cc, 'User Data', 'Projects', 'com.lveditor.draft'), { recursive: true });
  for (const v of ['9.8.1.100', '9.9.0.4254', 'Apps']) fs.mkdirSync(path.join(cc, v));
  const a = J.draftTarget({ platform: 'win32', env: { LOCALAPPDATA: local } });
  assert.equal(a.id, 'capcut-win');
  assert.equal(a.label, 'CapCut');
  assert.deepEqual(a.files, ['draft_content.json', 'draft_info.json']);
  assert.equal(a.font, '');
  assert.deepEqual([a.platform.os, a.platform.app_source, a.platform.app_id, a.platform.app_version], ['windows', 'cc', 359289, '9.9.0']);
  assert.equal(J.draftTarget({ platform: 'win32', env: { LOCALAPPDATA: local, JIANYING_DRAFT_ROOT: 'D:\\JianyingPro Drafts\\com.lveditor.draft' } }).id, 'jianying-win');
  assert.equal(J.draftTarget({ platform: 'win32', env: { LOCALAPPDATA: local, JIANYING_DRAFT_ROOT: 'D:/x/CapCut/User Data/Projects/com.lveditor.draft' } }).root, 'D:\\x\\CapCut\\User Data\\Projects\\com.lveditor.draft', '指定的路徑也換成反斜線');
  const m = J.draftTarget({ platform: 'darwin', env: { JIANYING_DRAFT_ROOT: '/tmp/drafts' } });
  assert.deepEqual([m.id, m.root, m.files], ['jianying-mac', '/tmp/drafts', ['draft_info.json']]);
});

test('091 Windows 的 CapCut 草稿：draft_content.json、平台是 CapCut Windows、字幕不帶 Mac 字體；路徑照 CapCut 自己存的寫法', { skip: process.platform !== 'win32' && '路徑是 Windows 的寫法' }, (t) => {
  const { dir, root, opts, logs } = setup(t);
  const local = tmpDir(t, 'capcut-local-');
  fs.mkdirSync(path.join(local, 'CapCut', '9.9.0.4254'), { recursive: true });
  const target = { ...J.draftTarget({ platform: 'win32', env: { LOCALAPPDATA: local, JIANYING_DRAFT_ROOT: path.join(path.dirname(root), 'CapCut', 'com.lveditor.draft') } }) };
  fs.mkdirSync(target.root, { recursive: true });
  fs.copyFileSync(path.join(root, 'root_meta_info.json'), path.join(target.root, 'root_meta_info.json'));
  assert.equal(J.makeDraft({ ...opts, root: undefined, target }), 0, logs.join('\n'));
  assert.match(logs.join('\n'), /✓ CapCut草稿：.*\n[\s\S]*→ 打開CapCut，首頁找『ppa-短影片1』/);
  const dst = path.join(target.root, 'ppa-短影片1');
  const content = readJson(path.join(dst, 'draft_content.json'));
  assert.deepEqual(readJson(path.join(dst, 'draft_info.json')), content, 'draft_info.json 是同一份');
  assert.deepEqual([content.platform.os, content.platform.app_source, content.platform.app_version], ['windows', 'cc', '9.9.0']);
  assert.deepEqual(content.last_modified_platform, content.platform);
  assert.ok(content.materials.texts.every((x) => x.font_path === '' && JSON.parse(x.content).styles[0].font.path === ''), '字幕不帶 /Applications/… 的 Mac 字體');
  const fwd = (p) => p.replace(/\\/g, '/');
  const meta = readJson(path.join(dst, 'draft_meta_info.json'));
  assert.equal(meta.draft_root_path, path.win32.resolve(target.root), 'draft_root_path 是反斜線（CapCut 自己存的寫法）');
  assert.equal(meta.draft_fold_path, `${fwd(target.root)}/ppa-短影片1`, 'draft_fold_path 是正斜線');
  assert.ok(meta.draft_materials[0].value.every((x) => !x.file_Path.includes('\\') && x.file_Path.startsWith(fwd(dir))), '素材路徑是正斜線');
  const rm = readJson(path.join(target.root, 'root_meta_info.json'));
  const e = rm.all_draft_store[0];
  assert.deepEqual([e.draft_fold_path, e.draft_root_path, e.draft_json_file, e.draft_cover], [`${fwd(target.root)}/ppa-短影片1`, fwd(target.root), `${fwd(target.root)}/ppa-短影片1\\draft_content.json`, `${fwd(target.root)}/ppa-短影片1\\draft_cover.jpg`]);
  // 同一個草稿再做一次（--force）：照正斜線比對，不會註冊兩筆
  assert.equal(J.makeDraft({ ...opts, root: undefined, target, force: true }), 0, logs.join('\n'));
  assert.equal(readJson(path.join(target.root, 'root_meta_info.json')).all_draft_store.filter((x) => x.draft_name === 'ppa-短影片1').length, 1);
});
