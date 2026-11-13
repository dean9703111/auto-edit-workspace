// 剪輯清單頁（停點 ①，/cuts）：讀 work/cuts.md 給頁面顯示，勾選寫回 NG 表的「剪」欄。
// cuts.md 仍是唯一的真相：頁面只改「剪」欄，AI 照舊讀檔跑 ng-snap。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseCutsMd, setCutChecks } from '../../lib/rough/cuts.mjs';
import { writeAtomic } from '../../lib/atomic.mjs';

const fail = (message, status = 400, extra = {}) => Object.assign(new Error(message), { status, extra });
const sha = (s) => crypto.createHash('sha1').update(s).digest('hex');
const statOf = (f) => { try { return fs.statSync(f); } catch { return null; } };
const files = (ctx) => ({ cuts: path.join(ctx.P.project, 'work', 'cuts.md'), main: path.join(ctx.P.project, 'work', 'main.mp4'), rough: path.join(ctx.P.project, 'work', 'rough.mp4') });

// 以「## 標題」切段；NG 表那一段標 ng（頁面畫成勾選清單），其他段原文給頁面排版
function sectionsOf(text, cm) {
  const ngLines = new Set(cm.ngTables.flatMap((t) => [t.head, t.head + 1, ...t.lines]));
  const out = [];
  let cur = null, fence = false;
  text.replace(/^\uFEFF/, '').split(/\r?\n/).forEach((l, i) => {
    if (/^\s*(```|~~~)/.test(l)) fence = !fence;
    if (!fence && /^##\s+/.test(l)) { cur = { title: l.replace(/^##\s+/, '').trim(), ng: false, md: [] }; out.push(cur); return; }
    if (!fence && /^#\s+/.test(l)) return;
    if (!cur) { cur = { title: '', ng: false, md: [] }; out.push(cur); }
    if (ngLines.has(i)) { cur.ng = true; return; }
    cur.md.push(l);
  });
  return out.map((s) => ({ ...s, md: s.md.join('\n').trim() })).filter((s) => s.ng || s.md || s.title);
}

export function cutsState(ctx) {
  const f = files(ctx);
  const project = path.basename(ctx.P.project);
  const main = statOf(f.main);
  const base = {
    project, file: 'work/cuts.md',
    video: main ? { url: `/media/main.mp4?v=${Math.floor(main.mtimeMs).toString(36)}${main.size.toString(36)}` } : null,
    readOnly: !!statOf(f.rough),
  };
  if (!statOf(f.cuts)) return { ...base, exists: false, hash: null, ng: [], sections: [], errors: [] };
  const text = fs.readFileSync(f.cuts, 'utf8');
  const cm = parseCutsMd(text);
  return {
    ...base, exists: true, hash: sha(text), hasNg: cm.hasNg, hasCutCol: cm.hasCutCol, errors: cm.errors,
    ng: cm.ng.map((r) => ({ row: r.row, start: r.start, end: r.end, text: r.text, reason: r.reason, note: r.pending ? r.raw : '', cut: r.cut })),
    sections: sectionsOf(text, cm),
  };
}

// body：{ hash, cut: { "<NG 列號>": true|false } } → 只改那幾列的「剪」欄
export function saveCuts(ctx, body) {
  const f = files(ctx);
  if (statOf(f.rough)) throw fail('初剪已經輸出（work/rough.mp4），這份清單現在只能看；要重剪請在對話跟 AI 說', 409);
  if (!statOf(f.cuts)) throw fail('還沒有 work/cuts.md', 404);
  const text = fs.readFileSync(f.cuts, 'utf8');
  if (body?.hash !== sha(text)) throw fail('work/cuts.md 剛被改過（可能是 AI 在改），已重新載入，請再勾一次', 409, { state: cutsState(ctx) });
  const cut = body?.cut && typeof body.cut === 'object' ? body.cut : null;
  if (!cut || !Object.keys(cut).length) throw fail('沒有要改的列');
  const rows = new Set(parseCutsMd(text).ng.map((r) => String(r.row)));
  for (const [k, v] of Object.entries(cut)) {
    if (!rows.has(k)) throw fail(`NG 表沒有第 ${k} 列`);
    if (typeof v !== 'boolean') throw fail(`第 ${k} 列要給 true 或 false`);
  }
  const next = setCutChecks(text, cut);
  if (next !== text) writeAtomic(f.cuts, next);   // AI 可能同時在讀這個檔：寫完才換上，不讀到半個檔
  return cutsState(ctx);
}
