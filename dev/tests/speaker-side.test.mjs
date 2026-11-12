// 027 講者位置：speakerSide 決定字卡靠哪邊、半螢幕面板從哪邊推入、講者移多少（lib/speaker-side.mjs）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imp } from './helpers.mjs';

const S = await imp('lib/speaker-side.mjs');

test('講者在左、中、右：字卡、半螢幕面板、講者移多少都由同一個參數推出來', () => {
  const C = { W: 1920 };
  // 中：和以前一樣（面板在左、講者右移 480）
  assert.deepEqual(S.sideLayout([700, 100, 1220, 1000], C), { side: 'center', cx: 960, cardSide: 'left', panelSide: 'left', shift: 480, zh: '講者位置：中（中心 x 960）→ 字卡靠左、半螢幕面板在左、講者右移 480' });
  // 右：只移到右半的中間，不用移那麼多
  const r = S.sideLayout([1050, 100, 1570, 1000], C);
  assert.deepEqual([r.side, r.cardSide, r.panelSide, r.shift], ['right', 'left', 'left', 128]);
  assert.equal(S.sideLayout([1300, 100, 1800, 1000], C).shift, 0, '已經在右半的中間再右邊：不用移');
  // 左：面板從右邊推入、字卡靠右、講者往左移到左半的中間
  const l = S.sideLayout([300, 100, 820, 1000], C);
  assert.deepEqual([l.side, l.cardSide, l.panelSide, l.shift], ['left', 'right', 'right', -80]);
  assert.match(l.zh, /講者位置：左（中心 x 560）→ 字卡靠右、半螢幕面板在右、講者左移 80/);
  // plan.json 寫死：speakerSide、sideShift
  assert.equal(S.sideLayout([700, 100, 1220, 1000], C, { side: 'left' }).panelSide, 'right');
  assert.equal(S.sideLayout([700, 100, 1220, 1000], C, { shift: 300 }).shift, 300);
  assert.equal(S.sideLayout([300, 100, 820, 1000], C, { shift: 300 }).shift, -300);
  // 沒有講者框：當成中間
  assert.deepEqual([S.speakerSideOf(null), S.sideLayout(null, C).shift], ['center', 480]);
  assert.deepEqual([S.speakerSideOf([100, 0, 1700, 1000]), S.speakerSideOf([806, 0, 1500, 1000])], ['center', 'right']);
});
