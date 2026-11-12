// 027 版面節奏：開頭 30 秒字卡、半螢幕 ≥ 15 秒、子母畫面 ≥ 45 秒（lib/layout-rhythm.mjs，純函式）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imp } from './helpers.mjs';

const L = await imp('lib/layout-rhythm.mjs');

test('版面類型：規格第一行、--check 的 layout 換成 字卡／半螢幕／子母畫面', () => {
  assert.equal(L.modeOfHead('**07 key-point**（重點字卡，疊加，最短 3.5 秒）：…'), 'card');
  assert.equal(L.modeOfHead('**03 side-panel**（半版側邊欄，半畫面，最短 5 秒）'), 'half');
  assert.equal(L.modeOfHead('**04a fs-list**（全畫面清單，子母畫面，最短 5 秒）'), 'pip');
  assert.equal(L.modeOfHead('**x-scene**（拍型 S，子母畫面）：講解在描述…'), 'pip');
  assert.equal(L.modeOfHead('**x-tags**（拍型 D，疊加）：講者露臉…'), 'card');
  assert.equal(L.modeOfHead('**01 chapter**（章節轉場，全幕，固定 2.5 秒）'), 'full');
  assert.equal(L.modeOfHead('**fx 03 印章蓋印**：判決句'), 'card');
  assert.equal(L.modeOfHead('**media**：螢幕錄影、圖片'), 'pip');
  assert.equal(L.modeOfHead('**x-old**（拍型 S）：舊的分鏡素材沒有標版面'), null);
  assert.deepEqual(['overlay', 'side', 'pip', 'full'].map((x) => L.modeOfLayout(x)), ['card', 'half', 'pip', 'pip']);
  assert.equal(L.modeOfLayout('full', 'chapter'), null, '章節幕不算切版面');
});

test('三條規則：開頭 30 秒不是字卡、子母畫面不到 45 秒、半螢幕不到 15 秒都報；連續的段合起來算；只有聲音的區間不算', () => {
  const seg = (id, start, end, mode) => ({ id, start, end, mode });
  // 今天早上的樣子：0:11 就進子母畫面、之後 30 秒切一次
  const bad = L.layoutFindings([seg('s1', 0, 11, 'card'), seg('s3', 11, 17, 'pip'), seg('s4', 17, 44, 'pip'), seg('s6', 44, 53, 'card'), seg('s8', 53, 83, 'pip'), seg('s9', 90, 100, 'half')]);
  assert.deepEqual(bad.map((f) => [f.rule, f.ids.join(','), f.secs]), [['intro', 's3,s4', null], ['pip', 's3,s4', 33], ['pip', 's8', 30], ['half', 's9', 10]]);
  assert.match(bad[1].msg, /子母畫面只連續 33 秒（s3、s4，0:11–0:44），至少要 45 秒/);
  assert.match(bad[1].fix, /換成全畫面的模板.*連續 ≥ 45 秒；湊不到就把這幾段改成疊在講者上的字卡/);
  // 合規：30 秒後進子母畫面、連續 50 秒（中間 0.5 秒的縫算連續）、半螢幕 16 秒
  assert.deepEqual(L.layoutFindings([seg('a', 0, 30, 'card'), seg('b', 30, 55, 'pip'), seg('c', 55.5, 80, 'pip'), seg('d', 80, 90, 'card'), seg('e', 90, 106, 'half')]), []);
  // 只有聲音的區間（那裡沒有講者，一定要蓋住）不算；mode 是 null（章節幕）不算
  assert.deepEqual(L.layoutFindings([seg('v', 5, 20, 'pip'), seg('ch', 40, 42.5, null)], { voice: [[4, 21]] }), []);
  assert.deepEqual(L.layoutRuns([seg('a', 0, 5, 'pip'), seg('b', 5, 9, 'pip'), seg('c', 12, 20, 'pip')]).map((r) => [r.start, r.end, r.ids.length]), [[0, 9, 2], [12, 20, 1]]);
});

test('排版面：開頭 30 秒字卡；有全畫面模板的行連成 ≥ 45 秒才進子母畫面，中間的重點行併進去；湊不到就全部字卡', () => {
  const rows = (list) => list.map(([a, t, d, first, any]) => ({ a, z: a, t, d, m: { first, any } }));
  const opt = { startOf: (r) => r.t, secsOf: (r) => r.d, modesOf: (r) => r.m };
  const P = ['pip'], C = ['card'];
  // 0–12 開場（字卡）、12–30 步驟（30 秒內：字卡）、30–42 列舉、42–48 重點（夾在中間，併）、48–62 情境、62–80 對比 → 30–80 子母畫面
  const r1 = rows([[1, 0, 12, 'card', C], [2, 12, 18, 'pip', P], [3, 30, 12, 'pip', P], [4, 42, 6, 'card', C], [5, 48, 14, 'pip', P], [6, 62, 18, 'pip', P], [7, 80, 8, 'card', C]]);
  const p1 = L.planLayout(r1, opt);
  assert.deepEqual(p1.map((x) => x.mode), ['card', 'card', 'pip', 'pip', 'pip', 'pip', 'card']);
  assert.deepEqual(p1.map((x) => x.merge), [false, false, false, true, false, false, false]);
  assert.equal(L.layoutPlanLine(r1, p1, opt), '0:00–0:30 字卡｜0:30–1:20 子母畫面（#3–#6）｜1:20–1:28 字卡');
  // 全畫面的內容只有 20 秒：不進子母畫面
  assert.deepEqual(L.planLayout(rows([[1, 0, 30, 'card', C], [2, 30, 20, 'pip', P], [3, 50, 30, 'card', C]]), opt).map((x) => x.mode), ['card', 'card', 'card']);
  // 夾在中間的字卡行連續超過 10 秒：區塊在那裡斷掉
  assert.deepEqual(L.planLayout(rows([[1, 30, 30, 'pip', P], [2, 60, 12, 'card', C], [3, 72, 30, 'pip', P]]), opt).map((x) => x.mode), ['card', 'card', 'card']);
  // 首選是半螢幕、自己就夠 15 秒 → 半螢幕
  assert.deepEqual(L.planLayout(rows([[1, 0, 30, 'card', C], [2, 30, 16, 'half', ['half', 'card']], [3, 46, 10, 'half', ['half']]]), opt).map((x) => x.mode), ['card', 'half', 'card']);
  assert.deepEqual([L.RHYTHM.intro, L.RHYTHM.half, L.RHYTHM.pip], [30, 15, 45]);
});
