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
