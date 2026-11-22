// 085 改字幕不用懂句號：刪句不用選改綁、改字把詞改掉不會讓 build ✖、第一層與錄影段的時間欄位都跟著換（editor/subtitles.mjs stepRef）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imp } from './helpers.mjs';

const S = await imp('editor/subtitles.mjs');
const { opsMapper } = await imp('lib/beat-remap.mjs');
const { applySave } = await imp('editor/server/write.mjs');
const stamp = (t) => { const ms = Math.round(t * 1000), p = (x, w = 2) => String(x).padStart(w, '0'); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; };
const srtOf = (cs) => cs.map((c) => `${c.n}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`).join('\n');
// 存檔（剪輯台按存檔走的那一條）：回傳寫進 plan.json 的物件和文字
const save = (ops, p = plan()) => {
  const text = JSON.stringify(p, null, 2) + '\n';
  const r = applySave(text, { srt: { ops } }, { srtText: srtOf(cues()), videoDur: 300 });
  assert.deepEqual(r.errors, []);
  return { plan: JSON.parse(r.text ?? text), text: r.text, cues: r.cues };
};
// minimax-ep1 的真實情況：第 2、3 句重複（「最多可以讀到一百萬」「可以讀到一百萬」）、第 5 句之後改了字
const cues = () => [
  { n: 1, start: 236.38, end: 237.79, text: '像「上下文長度」' },
  { n: 2, start: 237.79, end: 238.4, text: '最多可以讀到一百萬' },
  { n: 3, start: 238.4, end: 239.58, text: '可以讀到一百萬' },
  { n: 4, start: 239.58, end: 241.67, text: '還有「思考深度」可以調整' },
  { n: 5, start: 241.67, end: 243.4, text: '剪輯的成本和能力門檻' },
];
const plan = () => ({
  version: 1,
  moods: [{ at: '#3@讀到', kind: 'land' }],
  outro: { from: '#5', music: 'x' },
  sections: [{ at: '#4', name: 'STEP 4' }, { at: '#1', name: 'STEP 1' }],
  scenes: [
    { id: 'm01', type: 'media', src: 'assets/screen/a.mp4', from: '#1', to: '#5e', clicks: ['#4+0.2', '#5e-0.1'], sfx: { at: '#4@思考', sound: 'ding' },
      arrows: [{ at: '#3+0.1', until: '#4', to: [1, 2] }] },
    { id: 'x01', type: 'custom', src: 'compositions/x.html', from: '#5@剪輯的成', to: '#5e' },
  ],
});

test('刪掉重複的那一則：綁詞的改綁隔壁有這個詞的句子；其他留在原本那一刻；第一層 outro／sections、錄影段的 clicks、sfx 物件都跟著 −1', () => {
  const r = S.replay(cues(), plan(), [{ op: 'delete', n: 3 }]);
  assert.deepEqual(r.errors, []);
  assert.equal(r.plan.moods[0].at, '#2@讀到', '前一句也有「讀到」');
  const m = r.plan.scenes[0];
  assert.equal(S.refTime(m.arrows[0].at, r.cues), 238.5, '箭頭留在原本那一刻');
  assert.equal(m.arrows[0].until, '#3');
  assert.deepEqual(m.clicks, ['#3+0.2', '#4e-0.1']);
  assert.equal(m.sfx.at, '#3@思考');
  assert.equal(m.sfx.sound, 'ding');
  assert.equal(r.plan.outro.from, '#4');
  assert.deepEqual(r.plan.sections.map((s) => s.at), ['#3', '#1']);
  assert.equal(r.plan.scenes[1].from, '#4@剪輯的成');
  assert.deepEqual(S.refsTo(plan(), 5).map((x) => x.id).sort(), ['m01', 'm01', 'outro', 'x01', 'x01'].sort());
});

test('改字把綁的詞改掉（存檔）：還留著開頭幾個字就綁那幾個字；整個詞都沒了就綁在原本那一刻（不會讓 build 找不到詞）', () => {
  assert.equal(save([{ op: 'set', n: 5, text: '剪輯的門檻' }]).plan.scenes[1].from, '#5@剪輯的');
  const t0 = S.refTime('#4@思考', cues());
  const r2 = save([{ op: 'set', n: 4, text: '還有推理強度可以調整' }]);
  assert.equal(r2.plan.scenes[0].sfx.at, `#4+${Math.round((t0 - 239.58) * 1000) / 1000}`);
  assert.equal(S.refTime(r2.plan.scenes[0].sfx.at, r2.cues), t0);
  // 同一次存檔裡先刪掉詞、下一步才在隔壁句打上：照 074 跟過去，不會半路就換成秒數
  const r3 = save([{ op: 'set', n: 4, text: '還有可以調整' }, { op: 'set', n: 5, text: '思考深度剪輯的成本和能力門檻' }]);
  assert.equal(r3.plan.scenes[0].sfx.at, '#5@思考');
});

test('存檔寫回 plan.json：第一層 outro、sections、moods 原地換，其他行原封不動（不整份重排）', () => {
  const p = plan();
  const text = JSON.stringify(p, null, 2) + '\n';
  const r = save([{ op: 'delete', n: 3 }], p);
  assert.equal(r.plan.outro.from, '#4');
  assert.deepEqual(r.plan.sections.map((x) => x.at), ['#3', '#1']);
  assert.equal(r.plan.moods[0].at, '#2@讀到');
  // 原地換（surgicalText），不是退回整份 JSON.stringify：沒動到的第一層鍵（version）那一行原封不動、鍵的順序不變
  assert.notEqual(r.text, JSON.stringify(r.plan, null, 2) + '\n', '不是整份重排');
  assert.ok(r.text.startsWith('{\n  "version": 1,\n  "moods": '));
  assert.deepEqual(Object.keys(r.plan), Object.keys(p));
  void text;
});

test('鏡位腳本、動畫檔的 P.at 用同一套（opsMapper）：一個字一個字打和一次改完結果一樣', () => {
  const ref = S.parseRef('#5@剪輯的成');
  const once = opsMapper(cues(), [{ op: 'set', n: 5, text: '剪輯的門檻' }]).map(ref);
  assert.equal(S.fmtRef(once), '#5@剪輯的');
  const del = opsMapper(cues(), [{ op: 'delete', n: 3 }, { op: 'set', n: 4, text: '剪輯的門檻' }]).map(ref);
  assert.equal(S.fmtRef(del), '#4@剪輯的');
});
