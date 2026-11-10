// dev/bench/draft-bench.mjs（specs/022-pipeline-speed FR-109）：量測的純函式、--dry 跑得完
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BENCH = path.join(ROOT, 'dev', 'bench', 'draft-bench.mjs');
const B = await import(BENCH);

test('draftMetrics：模板動畫比例、候選比例只算非 media、非章節／講者段；相鄰同模板不算 media 和章節角標', () => {
  const segs = [
    { id: 's1', scene: 'chapter-tag', from: '#1' }, { id: 's2', scene: 'speaker', from: '#1' },
    { id: 'x1', template: 'x-scene', from: '#3', story: { designIdea: '跑來跑去' } }, { id: 'x2', template: 'x-scene', from: '#5' },
    { id: 'm1', type: 'media', from: '#7' }, { id: 'm2', type: 'media', from: '#8' },
    { id: 'f1', type: 'fx', fx: 1, from: '#9' }, { id: 'k1', scene: 'key-point', from: '#10' },
  ];
  assert.deepEqual(B.draftMetrics(segs), { segs: 8, body: 4, kinds: 3, animRatio: 0.75, candRatio: 0.25, adjacent: 1 });
  assert.deepEqual(B.draftMetrics([]), { segs: 0, body: 0, kinds: 0, animRatio: 0, candRatio: 0, adjacent: 0 });
  // 024 一致性：步驟 3 段（x-process 2、08 1）、列舉 2 段（都是 fs-list）、只有 1 段的數字不算 → (2 + 2) / 5
  const rows = [{ a: 1, z: 9, sem: '步驟' }, { a: 10, z: 19, sem: '列舉' }, { a: 20, z: 25, sem: '數字' }];
  const seg2 = [{ template: 'x-process', from: '#1' }, { scene: 'steps', from: '#4' }, { template: 'x-process', from: '#7' }, { scene: 'fs-list', from: '#10' }, { scene: 'fs-list', from: '#15' }, { type: 'fx', fx: 29, from: '#20' }, { type: 'media', from: '#22' }];
  assert.equal(B.semanticConsistency(seg2, rows), 0.8);
  assert.equal(B.semanticConsistency(seg2, []), null);
});

test('parseCheck／jsonFrom／median', () => {
  assert.deepEqual(B.parseCheck('⚠ a\n未通過：2 個 ✖、5 個 ⚠'), { errors: 2, warns: 5 });
  assert.deepEqual(B.parseCheck('通過：16 段，12 個 ⚠。可以交件'), { errors: 0, warns: 12 });
  assert.deepEqual(B.parseCheck('✖ 還沒填：x\n未通過：3 格還沒填'), { errors: 3, warns: 0 });
  assert.deepEqual(B.jsonFrom('```json\n{"a":1}\n```'), { a: 1 });
  assert.equal(B.jsonFrom('沒有 JSON'), null);
  assert.equal(B.median([3, 1, 2]), 2);
  assert.equal(B.median([1, 2, 3, 4]), 2.5);
  assert.equal(B.median([]), null);
});

test('--dry：不呼叫 mmx，兩種寫法都組得出提示；沒有分鏡素材就 ✖', () => {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-dry-'));
  const D = path.join(p, 'work', '分鏡素材');
  fs.mkdirSync(D, { recursive: true });
  fs.writeFileSync(path.join(D, '共用.md'), '# 共用\n\n## 6. 時間\n\n#N\n\n## 7. 格式\n\nJSON\n');
  fs.writeFileSync(path.join(D, 'ch01.md'), '#1 第一句\n');
  fs.writeFileSync(path.join(D, '寫法.md'), '## 字卡\n\n**07 key-point**（重點字卡，最短 3.5 秒）：重點\n\n```json\n{"id":"s01","scene":"key-point","from":"#N","to":"#Me","slots":{"key":"<≤12 字>"}}\n```\n');
  const out = path.join(p, 'r.json');
  const r = spawnSync(process.execPath, [BENCH, '--project', p, '--runs', '1', '--dry', '--out', out], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /\| 一次寫整份 \|[\s\S]*\| 大綱 → 骨架 \|/);
  assert.match(r.stdout, /提示長度：一次寫整份 第 1 次 \d+ 字/);
  assert.equal(JSON.parse(fs.readFileSync(out, 'utf8')).rows.length, 2);
  fs.rmSync(D, { recursive: true });
  assert.match(spawnSync(process.execPath, [BENCH, '--project', p, '--dry'], { encoding: 'utf8' }).stdout, /✖ .*沒有 work\/分鏡素材/);
  fs.rmSync(p, { recursive: true });
});
