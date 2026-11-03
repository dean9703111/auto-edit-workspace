// 影片編輯器的字幕增刪與句號重新對應（shared/template/tools/editor/subtitles.mjs，頁面與 server 共用的純函式）
// 契約第 5 節：分割 #k 不變、#ke→#(k+1)e、>k +1；新增 >k +1；合併 #(k+1)→#k+Δ、#ke→#k+Δ、#(k+1)e→#ke、>k+1 −1；刪除依選擇改綁、>k −1
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imp } from './helpers.mjs';

const S = await imp('editor/subtitles.mjs');
const T = await imp('editor/text.mjs');

// 5 句：#N 起點 (N−1)×3.5＋1、長 3 秒、句間 0.5 秒
const cues = () => [1, 2, 3, 4, 5].map((n) => ({ n, start: (n - 1) * 3.5 + 1, end: (n - 1) * 3.5 + 4, text: `第${n}句字幕的內容，示範用` }));
const plan = () => ({
  version: 1,
  scenes: [
    { id: 's01', scene: 'concept', from: '#2', to: '#3e', anchor: '第2句', slots: { text: '#1 名：**重點**', tag: '第 #3 名' } },
    { id: 's02', scene: 'side-panel', from: '#3+0.5', to: '#4e-0.2', beats: { aAt: '#4', bAt: '+1.2' },
      slots: { title: '標題', items: ['第一項', { text: '第二項', at: '#4' }, '第三項 ｜icon=file-text at=#5', '寫著 #2 的項目'] } },
    { id: 's03', type: 'fx', fx: 29, from: '#5', to: '#5e', vars: { text: '#1', label: '第 #5 名' } },
    { id: 'm01', type: 'media', src: 'assets/screen/a.mp4', from: '#4', to: 20.5, in: 1,
      moves: [{ at: '#4', to: 'full', dur: 0.6 }], marks: [{ at: '#4e', until: '#5', box: [0, 0, 10, 10] }], lens: [{ at: '+1', until: '+2', box: [0, 0, 1, 1], zoom: 2 }] },
    { id: 'c01', scene: 'chapter', at: '#3', slots: { num: '01', title: '開場' } },
  ],
});
const seg = (p, id) => p.scenes.find((s) => s.id === id);

test('時間寫法：parseRef／fmtRef／refTime（#N、#Ne、#N±秒、秒數）', () => {
  assert.deepEqual(S.parseRef('#12'), { n: 12, end: false, off: 0 });
  assert.deepEqual(S.parseRef('#12e-0.2'), { n: 12, end: true, off: -0.2 });
  assert.deepEqual(S.parseRef(' #3 + 1.5 '), { n: 3, end: false, off: 1.5 });
  assert.equal(S.parseRef('+1.2'), null);
  assert.equal(S.parseRef(12.5), null);
  assert.equal(S.parseRef('第 #1 名'), null);
  assert.equal(S.fmtRef({ n: 3, end: false, off: 3.5 }), '#3+3.5');
  assert.equal(S.fmtRef({ n: 3, end: true, off: -0.25 }), '#3e-0.25');
  assert.equal(S.fmtRef({ n: 7, end: true, off: 0 }), '#7e');
  assert.equal(S.refTime('#2e+0.5', cues()), 8);
  assert.equal(S.refTime(9.5, cues()), 9.5);
  assert.equal(S.refTime('#9', cues()), null);
});

test('分割第 k 句：#k 不變、#ke → #(k+1)e、> k 的 +1；#N±秒、清單 at（含字串的 ｜at=）、beats、media 的 moves／marks 都跟著改；slots／vars 文字不動', () => {
  const r = S.replay(cues(), plan(), [{ op: 'split', n: 3, at: 9.0, pos: 3 }]);
  assert.deepEqual(r.errors, []);
  assert.equal(r.structural, true);
  assert.deepEqual(r.cues.map((c) => [c.n, c.start, c.end]), [[1, 1, 4], [2, 4.5, 7.5], [3, 8, 9], [4, 9, 11], [5, 11.5, 14.5], [6, 15, 18]]);
  assert.equal(r.cues[2].text, '第3句');
  assert.equal(r.cues[3].text, '字幕的內容，示範用');
  const p = r.plan;
  assert.equal(seg(p, 's01').from, '#2');
  assert.equal(seg(p, 's01').to, '#4e', '#3e（被切的那句的結尾）→ 後半句的結尾 #4e');
  assert.equal(seg(p, 's02').from, '#3+0.5', '#3 的起點不變');
  assert.equal(seg(p, 's02').to, '#5e-0.2');
  assert.deepEqual(seg(p, 's02').beats, { aAt: '#5', bAt: '+1.2' });
  assert.deepEqual(seg(p, 's02').slots.items, ['第一項', { text: '第二項', at: '#5' }, '第三項 ｜icon=file-text at=#6', '寫著 #2 的項目']);
  assert.equal(seg(p, 's03').from, '#6');
  assert.equal(seg(p, 'm01').from, '#5');
  assert.equal(seg(p, 'm01').to, 20.5, '秒數不動');
  assert.deepEqual(seg(p, 'm01').moves, [{ at: '#5', to: 'full', dur: 0.6 }]);
  assert.deepEqual(seg(p, 'm01').marks[0], { at: '#5e', until: '#6', box: [0, 0, 10, 10] });
  assert.deepEqual(seg(p, 'm01').lens, plan().scenes[3].lens, '+秒（本段起點後）不動');
  assert.equal(seg(p, 'c01').at, '#3');
  // 文字裡的「#1」「#3」「#5」一個字都不能動
  assert.deepEqual(seg(p, 's01').slots, { text: '#1 名：**重點**', tag: '第 #3 名' });
  assert.deepEqual(seg(p, 's03').vars, { text: '#1', label: '第 #5 名' });
  // 沒變的段落原樣回傳
  const p0 = plan();
  const r0 = S.replay(cues(), p0, [{ op: 'split', n: 5, at: 16, pos: 2 }]);
  assert.equal(r0.plan.scenes[4], p0.scenes[4], '只有 #3 的段落：分割第 5 句時不用動');
});

test('在第 k 句後新增：> k 的 +1；只能放在 ≥ 0.5 秒的空檔、不能壓到前後句', () => {
  const r = S.replay(cues(), plan(), [{ op: 'insert', after: 3, start: 11.05, end: 11.45, text: '新的一句' }]);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.cues.map((c) => c.n), [1, 2, 3, 4, 5, 6]);
  assert.equal(r.cues[3].text, '新的一句');
  assert.equal(seg(r.plan, 's01').to, '#3e', '≤ k 不動');
  assert.equal(seg(r.plan, 's02').to, '#5e-0.2');
  assert.equal(seg(r.plan, 'm01').marks[0].at, '#5e');
  // 最前面新增（after 0）：全部 +1
  const r1 = S.replay(cues(), plan(), [{ op: 'insert', after: 0, start: 0.2, end: 0.9, text: '開頭' }]);
  assert.deepEqual(r1.errors, []);
  assert.equal(seg(r1.plan, 's01').from, '#3');
  // 沒空間、壓到前後句、太短、空字
  const c = cues();
  c[3] = { ...c[3], end: 14.7 };   // 第 4、5 句之間只剩 0.3 秒
  assert.equal(S.canInsert(c, 4).ok, false);
  assert.match(S.canInsert(c, 4).why, /只有 0\.30 秒空檔（要 ≥ 0\.5 秒才能新增）/);
  assert.match(S.replay(c, plan(), [{ op: 'insert', after: 4, start: 14.7, end: 15, text: 'x' }]).errors[0], /不能新增字幕/);
  assert.match(S.replay(cues(), plan(), [{ op: 'insert', after: 3, start: 10.9, end: 11.4, text: 'x' }]).errors[0], /會壓到前後句/);
  assert.match(S.replay(cues(), plan(), [{ op: 'insert', after: 3, start: 11.1, end: 11.2, text: 'x' }]).errors[0], /至少要 0\.3 秒/);
  assert.match(S.replay(cues(), plan(), [{ op: 'insert', after: 3, start: 11.05, end: 11.45, text: '  ' }]).errors[0], /不能是空的/);
  assert.equal(S.canInsert(cues(), 3).ok, true);
});

test('合併 k、k+1：#(k+1) → #k+（起點差）、#ke → #k+（k 的長度）、#(k+1)e → #ke、> k+1 的 −1（時間點不變）', () => {
  const r = S.replay(cues(), plan(), [{ op: 'merge', n: 3 }]);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.cues.map((c) => [c.n, c.start, c.end]), [[1, 1, 4], [2, 4.5, 7.5], [3, 8, 14.5], [4, 15, 18]]);
  assert.equal(r.cues[2].text, '第3句字幕的內容，示範用第4句字幕的內容，示範用');
  const p = r.plan;
  assert.equal(seg(p, 's01').to, '#3+3', '#3e → #3+3（原本第 3 句的結尾）');
  assert.equal(seg(p, 's02').from, '#3+0.5');
  assert.equal(seg(p, 's02').to, '#3e-0.2', '#4e-0.2 → #3e-0.2');
  assert.deepEqual(seg(p, 's02').beats, { aAt: '#3+3.5', bAt: '+1.2' }, '#4 → #3+3.5（第 4 句起點）');
  assert.deepEqual(seg(p, 's02').slots.items[1], { text: '第二項', at: '#3+3.5' });
  assert.equal(seg(p, 's02').slots.items[2], '第三項 ｜icon=file-text at=#4');
  assert.equal(seg(p, 's03').from, '#4');
  assert.equal(seg(p, 'm01').from, '#3+3.5');
  assert.deepEqual(seg(p, 'm01').marks[0], { at: '#3e', until: '#4', box: [0, 0, 10, 10] }, '#4e → #3e、#5 → #4');
  // 時間點真的不變
  for (const [orig, now] of [['#3e', '#3+3'], ['#4', '#3+3.5'], ['#4e-0.2', '#3e-0.2'], ['#5', '#4']]) {
    assert.equal(S.refTime(now, r.cues), S.refTime(orig, cues()), `${orig} → ${now}`);
  }
  // 英數相接補空白；最後一句不能合併
  const en = [{ n: 1, start: 0, end: 1, text: 'Claude' }, { n: 2, start: 1.2, end: 2, text: 'Code 很好用' }];
  assert.equal(S.replay(en, { scenes: [] }, [{ op: 'merge', n: 1 }]).cues[0].text, 'Claude Code 很好用');
  assert.match(S.canMerge(cues(), 5).why, /最後一句/);
});

test('刪除：有時間綁著要選改綁前一句或後一句；之後 > k 的 −1；沒綁就直接刪', () => {
  const noBind = S.replay(cues(), plan(), [{ op: 'delete', n: 4 }]);
  assert.match(noBind.errors[0], /第 4 句字幕有 plan\.json 的時間綁著：s02（#4e-0\.2）、s02（#4）.*m01（#4）.*bind/);
  const prev = S.replay(cues(), plan(), [{ op: 'delete', n: 4, bind: 'prev' }]);
  assert.deepEqual(prev.errors, []);
  assert.deepEqual(prev.cues.map((c) => c.n), [1, 2, 3, 4]);
  assert.equal(seg(prev.plan, 's02').to, '#3e-0.2');
  assert.equal(seg(prev.plan, 'm01').from, '#3');
  assert.equal(seg(prev.plan, 'm01').marks[0].until, '#4', '#5 → #4');
  assert.equal(seg(prev.plan, 's03').from, '#4');
  const next = S.replay(cues(), plan(), [{ op: 'delete', n: 4, bind: 'next' }]);
  assert.equal(seg(next.plan, 's02').to, '#4e-0.2', '改綁後一句：原本的 #5 變成 #4');
  assert.equal(seg(next.plan, 'm01').from, '#4');
  assert.equal(S.refTime(seg(next.plan, 'm01').from, next.cues), 15, '原本第 5 句的起點');
  // 第一句沒有前一句、最後一句沒有後一句
  assert.match(S.replay(cues(), plan(), [{ op: 'delete', n: 5, bind: 'next' }]).errors[0], /最後一句，沒有後一句/);
  const one = [{ n: 1, start: 0, end: 1, text: 'a' }, { n: 2, start: 2, end: 3, text: 'b' }];
  assert.match(S.replay(one, { scenes: [{ id: 'x', from: '#1' }] }, [{ op: 'delete', n: 1, bind: 'prev' }]).errors[0], /第一句，沒有前一句/);
  // 沒有綁：直接刪
  const free = S.replay(cues(), { scenes: [{ id: 'a', from: '#1', to: '#5e' }] }, [{ op: 'delete', n: 3 }]);
  assert.deepEqual(free.errors, []);
  assert.equal(free.plan.scenes[0].to, '#4e');
  assert.deepEqual(S.refsTo(plan(), 3).map((x) => `${x.id} ${x.ref}`), ['s01 #3e', 's02 #3+0.5', 'c01 #3']);
});

test('anchor：起點那句本來對得上、改完對不上 → 換成新起點那句的開頭；本來就對不上的不動', () => {
  const c = [{ n: 1, start: 0, end: 2, text: '大家好' }, { n: 2, start: 2.5, end: 6, text: '先講場地設定的重點' }, { n: 3, start: 6.5, end: 9, text: '一份文件' }];
  const p = { scenes: [{ id: 's01', from: '#2', anchor: '設定的重點' }, { id: 's02', from: '#3', anchor: '不相干' }] };
  const r = S.replay(c, p, [{ op: 'split', n: 2, at: 4, pos: 4 }]);
  assert.deepEqual(r.anchors, ['s01']);
  assert.equal(r.plan.scenes[0].from, '#2');
  assert.equal(r.plan.scenes[0].anchor, '先講場地');
  assert.equal(r.plan.scenes[1].anchor, '不相干', '本來就對不上的留給 build 提醒');
  // 改字幕文字也一樣
  const r2 = S.replay(c, p, [{ op: 'set', n: 2, text: '接著講場地' }]);
  assert.equal(r2.plan.scenes[0].anchor, '接著講場地');
  assert.equal(S.anchorFor('大家好，今天示範影片編輯器'), '大家好');
  assert.equal(S.anchorFor('然後切到螢幕錄影的畫面'), '然後切到螢幕錄影');
});

test('改字幕文字與時間：不可重疊、至少 0.3 秒、不能空；分割兩半各 ≥ 0.3 秒；多步驟照順序重播', () => {
  assert.match(S.replay(cues(), plan(), [{ op: 'set', n: 2, start: 3.9 }]).errors[0], /比上一句的結束（4s）還早/);
  assert.match(S.replay(cues(), plan(), [{ op: 'set', n: 2, end: 8.2 }]).errors[0], /比下一句的開始（8s）還晚/);
  assert.match(S.replay(cues(), plan(), [{ op: 'set', n: 2, end: 4.6 }]).errors[0], /至少要 0\.3 秒/);
  assert.match(S.replay(cues(), plan(), [{ op: 'set', n: 2, text: ' ' }]).errors[0], /不能是空的/);
  assert.match(S.replay(cues(), plan(), [{ op: 'set', n: 2, color: 'red' }]).errors[0], /不能改「color」/);
  assert.match(S.canSplit(cues()[1], 4.6).why, /有一半不到 0\.3 秒/);
  assert.match(S.canSplit(cues()[1], 9).why, /播放頭不在第 2 句裡/);
  const r = S.replay(cues(), plan(), [{ op: 'set', n: 1, text: '改過的第一句' }, { op: 'split', n: 1, at: 2, pos: 3 }, { op: 'merge', n: 2 }]);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.cues.map((c) => c.text).slice(0, 2), ['改過的', '第一句第2句字幕的內容，示範用']);
  assert.equal(seg(r.plan, 's01').from, '#2+2.5', '分割後 #2→#3，再合併 2、3 → #2+（4.5−2）');
  assert.equal(S.splitPos('先講場地，設定重點', 0.5), 5, '往標點後面靠');
});

test('清單項目字串：拆欄、保留｜屬性；新增項目不帶 at；情境定義用 key／中文名／編號都找得到', () => {
  assert.deepEqual(T.splitItem('第三項 ｜icon=file-text at=#5'), { cols: ['第三項'], tail: ' ｜icon=file-text at=#5' });
  assert.deepEqual(T.splitItem('A / B / C', 3), { cols: ['A', 'B', 'C'], tail: '' });
  assert.equal(T.joinItem(['新字'], ' ｜icon=x at=#5'), '新字 ｜icon=x at=#5');
  assert.deepEqual(T.parseAttrs(' ｜icon=file-text at=#5'), { icon: 'file-text', at: '#5' });
  assert.equal(T.tailWithoutAt(' ｜icon=file-text at=#5'), ' ｜icon=file-text');
  assert.equal(T.tailWithoutAt(' ｜at=#5'), '');
  assert.equal(T.visibleLen('**Whisper** 轉字幕//好'), 8);
  const scenes = [{ key: 'concept', no: 6, num: '06', zh: '一般字卡', aliases: ['字卡'] }];
  for (const ref of ['concept', '一般字卡', '06', 6, '字卡']) assert.equal(T.findSceneDef(scenes, ref)?.key, 'concept', String(ref));
  assert.equal(T.findFxDef([{ no: 29, id: '29' }], '29')?.no, 29);
});
