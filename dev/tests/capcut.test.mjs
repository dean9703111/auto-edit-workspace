// capcut.mjs（剪映素材）：參數、檔名、清單；合成本身在 build.test 的 --capcut
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imp } from './helpers.mjs';

const C = await imp('capcut.mjs');

test('參數：status 子指令、--only／--dry-run／--no-main；看不懂的參數帶 → 用法', () => {
  assert.deepEqual(C.parseCapcutArgs(['--project', 'p', '--only', 's05,s12', '--dry-run']), { cmd: 'run', project: 'p', only: 's05,s12', 'dry-run': true });
  assert.deepEqual(C.parseCapcutArgs(['status', '--project=p']), { cmd: 'status', project: 'p' });
  assert.throws(() => C.parseCapcutArgs(['--zzz']), /沒有 --zzz 這個參數 → 看用法：node shared\/template\/tools\/capcut\.mjs --help/);
  assert.throws(() => C.parseCapcutArgs(['x']), /看不懂的參數「x」 → |看不懂的參數「x」→ /);
  assert.throws(() => C.parseCapcutArgs(['--only']), /--only 後面要接值/);
});

test('檔名：序號_段_起點（剪映照檔名排、看得出放哪一秒）；清單有主軌、每段放在哪一秒、字幕', () => {
  assert.equal(C.stampName(31.68), '0m31.68s');
  assert.equal(C.stampName(73.04), '1m13.04s');
  assert.equal(C.stampName(5), '0m05.00s');
  assert.equal(C.segFile({ id: 's06', start: 31.68 }, 5), '06_s06_0m31.68s.mov');
  const cc = { duration: 155.5, format: 'landscape', main: { duration: 155.5 },
    segs: [{ id: 's01', start: 0, duration: 4.5, layoutZh: '疊加', label: '14 講者介紹', sfx: 1 }, { id: 's03', start: 20, duration: 6, layoutZh: '半畫面', footage: true, label: '03 半版|側邊欄', sfx: 0 }] };
  const md = C.listMd(cc, { project: '範例', files: { main: '主軌.mp4', s01: '01_s01_0m00.00s.mov', s03: '02_s03_0m20.00s.mov' } });
  assert.match(md, /^# 剪映素材清單（範例）/);
  assert.match(md, /成片長度 2:35.50，橫式 1920×1080、30fps。/);
  assert.match(md, /\| 主軌\.mp4 \| 0:00\.00 \| 2:35\.50 \| 主軌 \|/);
  assert.match(md, /\| 02_s03_0m20\.00s\.mov \| 0:20\.00 \| 6\.00 秒 \| 半畫面（含講者） \| 03 半版｜側邊欄 \| 無 \|/);
  assert.match(md, /\| 字幕\.srt \|/);
});
