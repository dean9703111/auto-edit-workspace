// 官網示範頁（020）：用真正的介面，只換 API。這裡確保模擬層算出來的和剪輯服務一樣，真正的服務改了就會在這裡發現。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { TEMPLATE, imp } from './helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEMO = path.join(ROOT, 'dev', 'site', 'demo');
const { cutsDemoState, setDemoCut, BEAT_HEADERS } = await import(path.join(DEMO, 'demo-core.mjs'));
const { cutsState } = await imp('editor/server/cuts.mjs');
const { storyboardState } = await imp('editor/server/storyboard.mjs');
const { BEAT_HEADER, BEAT_HEADER_ILLUS } = await imp('lib/audit-beats.mjs');
const md = (f) => fs.readFileSync(path.join(DEMO, f), 'utf8');
function project(file) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-site-demo-'));
  fs.mkdirSync(path.join(dir, 'work'));
  fs.writeFileSync(path.join(dir, 'work', file), md(path.basename(file)));
  return dir;
}

test('示範：剪輯清單的狀態和真正的服務一樣；勾選只改那一列', () => {
  const dir = project('cuts.md');
  const real = cutsState({ P: { project: dir } });
  const demo = cutsDemoState(md('cuts.md'));
  for (const k of ['hasNg', 'hasCutCol', 'errors', 'ng', 'sections']) assert.deepEqual(demo[k], real[k], k);
  const next = setDemoCut(md('cuts.md'), 3, false);
  assert.deepEqual(next.split('\n').filter((l, i) => l !== md('cuts.md').split('\n')[i]), ['| [ ] | 2:30.00–2:31.20 | 我們先看… | 逐字稿和講稿對不上 | 講稿沒有這句，可能是 whisper 補的 |']);
  assert.equal(cutsDemoState(next).ng[2].cut, false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('示範：分鏡表能被真正的服務解析、沒有警告；表頭和動畫檢查一致；截圖都在情境庫', () => {
  assert.deepEqual(BEAT_HEADERS, [BEAT_HEADER, [...BEAT_HEADER, ...BEAT_HEADER_ILLUS]]);
  const dir = project('storyboard.md');
  const s = storyboardState({ P: { project: dir, plan: path.join(dir, 'work', 'plan.json'), templateDir: TEMPLATE } });
  assert.deepEqual(s.warnings, []);
  assert.deepEqual(s.sections.filter((x) => x.id).map((x) => x.id), ['s01', 'x01']);
  for (const m of md('storyboard.md').matchAll(/storyboard-preview\/([^)]+)/g)) assert.ok(fs.existsSync(path.join(ROOT, 'shared/template/gallery', m[1])), m[1]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('示範：官網組好後頁面只用相對路徑，有接模擬層，工具程式不上網站', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-site-out-'));
  const site = path.join(out, 'site');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'dev/tools/build-site.mjs'), '--out', site], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  for (const page of ['cuts', 'storyboard']) {
    const html = fs.readFileSync(path.join(site, 'demo', `${page}.html`), 'utf8');
    assert.doesNotMatch(html, /(?:src|href)="\//, `${page}.html 還有絕對路徑`);
    assert.ok(html.indexOf('demo-api.js') < html.indexOf(`${page}.js`), '模擬層要先載入');
    for (const m of html.matchAll(/(?:src|href)="([^"#]+)"/g)) assert.ok(fs.existsSync(path.join(site, 'demo', m[1])), `${page}.html 連到的 ${m[1]} 不在網站上`);
  }
  for (const f of ['demo-api.js', 'demo-core.mjs', 'storyboard-md.mjs', 'cuts.js', 'storyboard.js', 'editor.css', 'main.mp4', 'cuts.md', 'storyboard.md', 'options.json']) assert.ok(fs.existsSync(path.join(site, 'demo', f)), f);
  assert.ok(!fs.existsSync(path.join(site, 'shared/template/tools')), 'tools 不上網站');
  const options = JSON.parse(fs.readFileSync(path.join(site, 'demo/options.json'), 'utf8'));
  for (const i of options.scenes.flatMap((g) => g.items)) if (i.preview) assert.ok(fs.existsSync(path.join(site, 'shared/template/preview', i.preview)), `範例 ${i.preview} 不在網站上`);
  fs.rmSync(out, { recursive: true, force: true });
});
