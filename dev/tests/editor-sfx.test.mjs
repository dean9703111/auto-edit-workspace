// 050 剪輯台的音效（純函式，不開瀏覽器、不開服務）：
//   存檔規則（editor/server/write.mjs）：edit.sfx＝使用者自己加的音效；段落的 sfx 可以寫名稱（換一顆）、null（靜音）、{ restore: true }（還原成原本的）
//   頁面的資料（editor/model.mjs）：normEdit 帶 sfx、ownSfx、ownSfxView
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imp } from './helpers.mjs';

const { sanitizeEdit, sanitizeSegments, applySave } = await imp('editor/server/write.mjs');
const { normEdit, defaultEdit, ownSfx, sortOwnSfx, ownSfxView } = await imp('editor/model.mjs');

const SCHEMA = { sfx: [{ name: 'ding', zh: '提示「滴」', volume: 0.733, peak: 0.01 }, { name: 'impact', zh: '綜藝「咚咚」', volume: 0.617, peak: 0.134 }, { name: 'success', zh: '完成音', volume: 0.692, peak: 0.137 }] };
const PLAN = `{
  "version": 1,
  "scenes": [
    { "id": "s01", "scene": "key-point", "from": "#1", "to": "#2e", "slots": { "lead": "前句", "key": "重點" } },
    { "id": "s02", "scene": "concept", "from": "#3", "to": "#3e", "sfx": "impact", "slots": { "text": "一般字卡" } },
    { "id": "s03", "scene": "concept", "from": "#4", "to": "#4e", "sfx": null, "slots": { "text": "AI 設定不放" } },
    { "id": "m01", "type": "media", "src": "assets/screen/a.mp4", "from": "#5", "to": "#5e", "sfx": { "name": "success", "at": "#5e-0.1" } }
  ]
}
`;
const ctx = (memory = {}) => ({ videoDur: 40, schema: SCHEMA, memory });

test('edit.sfx 存檔：照時間排、db 0 不寫、音量一位小數；一顆都沒有就不寫這個欄位；名稱要在音效清單裡', () => {
  const ok = sanitizeEdit({ sfx: [{ at: 30.0004, sound: 'impact', db: -3.04 }, { at: 12.5, sound: 'ding', db: 0 }] }, ctx());
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.edit.sfx, [{ at: 12.5, sound: 'ding' }, { at: 30, sound: 'impact', db: -3 }]);
  assert.ok(!('sfx' in sanitizeEdit({ sfx: [] }, ctx()).edit), '空的不寫');
  assert.ok(!('sfx' in sanitizeEdit({ cuts: [] }, ctx()).edit), '沒送＝沒有（edit 每次整個寫，拿掉最後一顆就是這樣）');
  const bad = sanitizeEdit({ sfx: [{ at: 5, sound: 'whoosh' }, { at: -1, sound: 'ding' }, { at: 99, sound: 'ding' }, { at: 5, sound: 'ding', db: 20 }, { at: 5, sound: 'ding', loop: 1 }, 'ding', { at: 5 }] }, ctx()).errors.join('\n');
  for (const re of [/edit\.sfx 第 1 項的 sound「whoosh」不在音效清單裡 → 只能用 ding、impact、success/, /第 2 項的 at 要是影片範圍內的秒數/, /第 3 項的 at 要是影片範圍內的秒數/, /第 4 項的 db 要是 −60～\+12/, /第 5 項不能有「loop」/, /第 6 項要是物件/, /第 7 項的 sound 要是音效名稱/]) assert.match(bad, re);
  assert.match(sanitizeEdit({ sfx: 'ding' }, ctx()).errors.join('\n'), /edit\.sfx 要是陣列/);
  // 讀不到音效清單（build.mjs --list --json 跑不出來）：新的名稱不收、講清楚；檔案裡原本就有的照留（不擋別的修改存檔）
  const none = { videoDur: 40, schema: { sfx: [] } };
  assert.match(sanitizeEdit({ sfx: [{ at: 5, sound: 'ding' }] }, none).errors.join('\n'), /現在讀不到音效清單/);
  assert.deepEqual(sanitizeEdit({ sfx: [{ at: 5, sound: 'ding' }] }, { ...none, keepSounds: ['ding'] }).errors, []);
});

test('edit.sfx 存檔：只動 plan.json 的 edit 那一塊，其他文字原封不動；全部移除＝欄位拿掉', () => {
  const a = applySave(PLAN, { edit: { sfx: [{ at: 20, sound: 'ding' }, { at: 8, sound: 'success', db: -6 }] } }, ctx());
  assert.deepEqual(a.errors, []);
  assert.deepEqual(a.plan.edit.sfx, [{ at: 8, sound: 'success', db: -6 }, { at: 20, sound: 'ding' }]);
  assert.deepEqual(Object.keys(a.plan.edit), ['cuts', 'fadeIn', 'fadeOut', 'volume', 'gains', 'joins', 'sfx']);
  assert.ok(a.text.includes('"sfx": [{ "at": 8, "sound": "success", "db": -6 }, { "at": 20, "sound": "ding" }]'), a.text);
  assert.equal(a.text.replace(/  "edit": \{[\s\S]*?\n  \},\n  /, '  '), PLAN, '除了多一塊 edit，一個字都沒變');
  // 這台機器後來沒有 success 了（自備音效拿掉）：原本就在檔案裡的照留，改別的還是存得進去
  const b = applySave(a.text, { edit: { ...a.plan.edit, fadeIn: 1 } }, { videoDur: 40, schema: { sfx: [{ name: 'ding' }] }, memory: {} });
  assert.deepEqual(b.errors, []);
  assert.equal(b.plan.edit.sfx.length, 2);
  const c = applySave(a.text, { edit: { cuts: [], fadeIn: 0, fadeOut: 0, volume: { voice: 0, sfx: 0, media: 0 }, gains: [], joins: [] } }, ctx());
  assert.ok(!('sfx' in c.plan.edit) && !c.text.includes('"sound"'));
});

test('段落的音效：換一顆寫名稱（要在清單裡）；AI 指定了落點（{ name, at }）只換名稱；靜音、還原照舊', () => {
  const plan = JSON.parse(PLAN);
  // 換一顆：s02 impact → success；s01 沒寫（照情境預設）→ ding；m01 { name, at } → 只換 name
  const r = sanitizeSegments({ s02: { sfx: 'success' }, s01: { sfx: 'ding' }, m01: { sfx: { name: 'ding', at: '#5e-0.1' } } }, plan, ctx());
  assert.deepEqual(r.errors, []);
  assert.deepEqual(Object.fromEntries(r.updates.map(([id, set]) => [id, set.sfx])), { s02: 'success', s01: 'ding', m01: { name: 'ding', at: '#5e-0.1' } });
  assert.deepEqual(r.memory, {
    s02: { had: true, value: 'impact', set: 'success' },
    s01: { had: false, value: null, set: 'ding' },
    m01: { had: true, value: { name: 'success', at: '#5e-0.1' }, set: { name: 'ding', at: '#5e-0.1' } },
  }, '記著剪輯台動手之前的值（還原用）和剪輯台寫的值');
  const bad = sanitizeSegments({ s02: { sfx: 'whoosh' }, s01: { sfx: 'bgm-cylinder-five' }, m01: { sfx: { name: 'ding', at: '#1' } }, s03: { sfx: { name: 'ding', at: '#4' } } }, plan, ctx()).errors.join('\n');
  for (const re of [/段 s02 的 sfx「whoosh」不在音效清單裡 → 只能用 ding、impact、success/, /段 s01 的 sfx「bgm-cylinder-five」不在音效清單裡/, /段 m01 的 sfx\.at 不能在剪輯台改/, /段 s03 的 sfx\.at 不能在剪輯台改/]) assert.match(bad, re);
  assert.match(sanitizeSegments({ s02: { sfx: 5 } }, plan, ctx()).errors.join('\n'), /段 s02 的 sfx 只能設成音效名稱（換一顆）、null（靜音）或 \{ "restore": true \}/);
  assert.match(sanitizeSegments({ s02: { sfx: 'ding' } }, plan, { videoDur: 40, schema: { sfx: [] }, memory: {} }).errors.join('\n'), /現在讀不到音效清單/);
  // 和現在一樣的值：不用查清單、不記
  const same = sanitizeSegments({ s02: { sfx: 'impact' } }, plan, { videoDur: 40, schema: { sfx: [] }, memory: {} });
  assert.deepEqual([same.errors, same.memory], [[], {}]);
});

test('段落的音效：換了再換、再靜音，還原都回到 AI 原本寫的；還原之後不再記；AI 之後又改過，舊的紀錄不算數', () => {
  const step = (text, segments, memory) => { const r = applySave(text, { segments }, ctx(memory)); assert.deepEqual(r.errors, []); return { text: r.text ?? text, memory: r.memory, seg: (id) => r.plan.scenes.find((s) => s.id === id) }; };
  // s02：impact → success → ding → 靜音 → 還原＝impact
  let s = step(PLAN, { s02: { sfx: 'success' } }, {});
  s = step(s.text, { s02: { sfx: 'ding' } }, s.memory);
  assert.deepEqual([s.seg('s02').sfx, s.memory.s02], ['ding', { had: true, value: 'impact', set: 'ding' }]);
  s = step(s.text, { s02: { sfx: null } }, s.memory);
  assert.deepEqual([s.seg('s02').sfx, s.memory.s02], [null, { had: true, value: 'impact' }], '靜音：原本的還是 impact（不是剛換的 ding）');
  s = step(s.text, { s02: { sfx: { restore: true } } }, s.memory);
  assert.deepEqual([s.seg('s02').sfx, s.memory], ['impact', {}]);
  assert.equal(s.text, PLAN, '繞一圈回來，plan.json 一個字都沒變');
  // s01 原本沒寫：換了再還原＝欄位拿掉（照情境預設）
  s = step(PLAN, { s01: { sfx: 'ding' } }, {});
  s = step(s.text, { s01: { sfx: { restore: true } } }, s.memory);
  assert.ok(!('sfx' in s.seg('s01')) && !s.memory.s01);
  // s03 原本是 null（AI 設定不放）：選一顆 → 還原＝回到 null；選一顆再靜音＝就是原本的樣子，不用記
  s = step(PLAN, { s03: { sfx: 'ding' } }, {});
  assert.deepEqual(s.memory.s03, { had: true, value: null, set: 'ding' });
  const back = step(s.text, { s03: { sfx: { restore: true } } }, s.memory);
  assert.deepEqual([back.seg('s03').sfx, back.memory], [null, {}]);
  const muted = step(s.text, { s03: { sfx: null } }, s.memory);
  assert.deepEqual([muted.seg('s03').sfx, muted.memory], [null, {}]);
  // 改回原本的值（不走還原）：也不用記了
  s = step(PLAN, { s02: { sfx: 'success' } }, {});
  s = step(s.text, { s02: { sfx: 'impact' } }, s.memory);
  assert.deepEqual(s.memory, {});
  // 舊的紀錄（靜音時記的 impact）之後 AI 把 s02 改成 success：紀錄對不上現在的值 → 以現在的當原本的
  const stale = { s02: { had: true, value: 'ding' } };
  const ai = PLAN.replace('"sfx": "impact"', '"sfx": "success"');
  s = step(ai, { s02: { sfx: 'ding' } }, stale);
  assert.deepEqual(s.memory.s02, { had: true, value: 'success', set: 'ding' });
  assert.equal(step(ai, { s02: { sfx: { restore: true } } }, stale).seg('s02').sfx, 'success', '沒有算數的紀錄、現在也不是靜音：還原不動它');
  // 舊版剪輯台記的（沒有 set＝靜音時記的）：照舊還原
  const old = step(PLAN.replace('"sfx": "impact"', '"sfx": null'), { s02: { sfx: { restore: true } } }, { s02: { had: true, value: 'impact' } });
  assert.deepEqual([old.seg('s02').sfx, old.memory], ['impact', {}]);
});

test('頁面的資料：normEdit 帶 sfx（照時間排、不合格的丟掉）；ownSfx、ownSfxView（從哪裡開始播、多大聲）', () => {
  assert.deepEqual(defaultEdit().sfx, []);
  assert.deepEqual(normEdit({ cuts: [[1, 2]] }).sfx, []);
  assert.deepEqual(normEdit({ sfx: [{ at: 5.00049, sound: 'ding', db: 0 }, { at: 1, sound: 'impact', db: -3.04 }, { at: 'x', sound: 'a' }, { at: 2 }, null, { at: 3, sound: 'ding', db: 99 }] }).sfx,
    [{ at: 1, sound: 'impact', db: -3 }, { at: 3, sound: 'ding', db: 12 }, { at: 5, sound: 'ding' }]);
  assert.deepEqual(ownSfx(12.3456, 'ding'), { at: 12.346, sound: 'ding' });
  assert.deepEqual(ownSfx(12, 'ding', -6), { at: 12, sound: 'ding', db: -6 });
  // 就地排：拖曳中的那一顆還是同一個物件（選取才跟得上）
  const a = { at: 9, sound: 'ding' }, b = { at: 3, sound: 'impact' }, list = [a, b];
  assert.equal(sortOwnSfx(list), list);
  assert.ok(list[0] === b && list[1] === a);
  // at 是聽到的那一刻：檔案提早 peak 秒開始播；音量＝那一顆的預設＋這一顆的 db＋整支的音效音量
  const conf = SCHEMA.sfx[1];
  assert.deepEqual(ownSfxView({ at: 10, sound: 'impact' }, conf, 0), { start: 9.866, db: Math.round(20 * Math.log10(0.617) * 10) / 10 });
  assert.equal(ownSfxView({ at: 10, sound: 'impact', db: -6 }, conf, -3).db, Math.round((20 * Math.log10(0.617) - 9) * 10) / 10);
  assert.equal(ownSfxView({ at: 0.05, sound: 'impact' }, conf).start, 0, '不會排到 0 秒之前');
  assert.deepEqual(ownSfxView({ at: 4, sound: 'gone' }, null), { start: 4, db: -6 }, '這台機器沒有這顆：當 0.5 倍、峰值 0');
});
