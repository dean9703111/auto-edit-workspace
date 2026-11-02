// 專案資料夾：--project 解析、預設路徑、成片資料夾、測試片段的 render 指令
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { TOOLS, TEMPLATE, makeSrt, imp } from './helpers.mjs';

const BUILD = path.join(TOOLS, 'build.mjs');
const { pathsFrom, findProject } = await imp('build.mjs');
let root, tpl;

// 假工作區：shared/template 用 symlink 指到真的模板，shared/sfx 放 12 個音效
before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-proj-'));
  fs.mkdirSync(path.join(root, 'shared', 'sfx'), { recursive: true });
  tpl = path.join(root, 'shared', 'template');
  fs.symlinkSync(TEMPLATE, tpl, 'dir');
  for (const n of Object.keys(JSON.parse(fs.readFileSync(path.join(TEMPLATE, 'kit', 'sfx.json'), 'utf8')))) fs.copyFileSync(path.join(TEMPLATE, '..', 'sfx', 'ding.wav'), path.join(root, 'shared', 'sfx', `${n}.wav`));
  fs.mkdirSync(path.join(root, 'projects', 'example', 'work', 'hyperframes'), { recursive: true });
});

test('只有一個專案：不寫 --project 也找得到；預設路徑都在專案的 work/，音效在 shared/sfx', () => {
  const P = pathsFrom({ template: tpl }, root);
  const proj = path.join(root, 'projects', 'example');
  assert.equal(P.project, proj);
  assert.equal(P.out, path.join(proj, 'work', 'hyperframes'));
  assert.equal(P.plan, path.join(proj, 'work', 'hyperframes', 'plan.json'));
  assert.equal(P.srt, path.join(proj, 'work', 'rough.srt'));
  assert.equal(P.video, path.join(proj, 'work', 'rough.mp4'));
  assert.equal(P.sfx, path.join(root, 'shared', 'sfx'));
});

test('--project 可以寫路徑或只寫名稱；目前資料夾在專案裡就用那個專案', () => {
  fs.mkdirSync(path.join(root, 'projects', 'EP2', 'work'), { recursive: true });
  const ep2 = path.join(root, 'projects', 'EP2');
  assert.equal(findProject({ project: 'projects/EP2' }, root, root), ep2);
  assert.equal(findProject({ project: 'EP2' }, root, root), ep2);
  assert.equal(findProject({}, root, path.join(ep2, 'work')), ep2);
  assert.throws(() => findProject({}, root, root), /要指定專案：加 --project projects\/<專案> → 現有專案：.*projects\/EP2/);
  assert.throws(() => findProject({ project: 'EP9' }, root, root), /找不到專案「EP9」→ 現有專案：/);
  // --plan／--srt／--video／--out 全給時不需要專案（舊用法與測試）
  assert.equal(findProject({ plan: 'a', srt: 'b', video: 'c', out: 'd' }, root, root), null);
  fs.rmSync(ep2, { recursive: true });
});

test('--list 不需要專案（projects/ 有好幾個也不報錯）', () => {
  fs.mkdirSync(path.join(root, 'projects', 'EP3'), { recursive: true });
  const r = spawnSync(process.execPath, [BUILD, '--template', tpl, '--list'], { encoding: 'utf8', cwd: root });
  assert.equal(r.status, 0, r.stderr);
  const P = pathsFrom({ template: tpl, list: true }, root, { needProject: false });
  assert.equal(P.project, null);
  fs.rmSync(path.join(root, 'projects', 'EP3'), { recursive: true });
});

test('build --project：產生到專案的 work/hyperframes，建好 output/、output/test-clips/、output/qc/，測試片段指令寫進 output/test-clips/', () => {
  const proj = path.join(root, 'projects', 'example');
  const work = path.join(proj, 'work');
  const v = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
    '-t', '20', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', path.join(work, 'rough.mp4')]);
  assert.equal(v.status, 0, String(v.stderr));
  fs.writeFileSync(path.join(work, 'rough.srt'), makeSrt({ n: 5 }));
  fs.writeFileSync(path.join(work, 'hyperframes', 'plan.json'), JSON.stringify({ version: 1, speakerBox: [700, 200, 1220, 1000], look: false,
    scenes: [{ id: 's01', scene: 'concept', from: '#2', to: '#3e', slots: { text: '**場地設定**：一份文件' } }] }));
  const r = spawnSync(process.execPath, [BUILD, '--template', tpl, '--project', 'projects/example', '--test', '4,3'], { encoding: 'utf8', cwd: root });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /專案：projects\/example/);
  assert.ok(fs.existsSync(path.join(work, 'hyperframes', 'index.html')));
  for (const d of ['output', 'output/test-clips', 'output/qc']) assert.ok(fs.statSync(path.join(proj, d)).isDirectory(), `少了 ${d}/`);
  assert.match(r.stdout, /npx hyperframes render -c compositions\/test-clip\.html --quality draft -o \.\.\/\.\.\/output\/test-clips\/test-clip\.mp4/);
});
