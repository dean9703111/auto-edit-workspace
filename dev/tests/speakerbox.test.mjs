// 講者框座標：底片不是 1080p 時，抓「直接用底片像素量」的常見錯誤
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imp } from './helpers.mjs';

const { speakerBoxScaleWarning } = await imp('build.mjs');

test('640×360 底片、講者框整個在 640×360 內 → 提醒乘 3，附換算後的框', () => {
  const w = speakerBoxScaleWarning([250, 70, 420, 300], { width: 640, height: 360 });
  assert.match(w, /整個落在 640×360 以內/);
  assert.match(w, /每個數字乘 3（例：\[750,210,1260,900\]）/);
});

test('框已經是 1920×1080 座標、底片是 1080p 或 4K、沒寫框 → 不提醒', () => {
  assert.equal(speakerBoxScaleWarning([750, 236, 1260, 880], { width: 640, height: 360 }), null);
  assert.equal(speakerBoxScaleWarning([250, 70, 420, 300], { width: 1920, height: 1080 }), null);
  assert.equal(speakerBoxScaleWarning([250, 70, 420, 300], { width: 3840, height: 2160 }), null);
  assert.equal(speakerBoxScaleWarning(null, { width: 640, height: 360 }), null);
});
