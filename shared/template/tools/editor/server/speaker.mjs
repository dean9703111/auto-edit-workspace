// 講者設定（輸出前的確認、分鏡表與剪輯頁的提醒）：畫面上還是示範人物時給使用者填姓名與頭銜，寫 shared/setting.json（brand.mjs speaker 同一份格式）。
// 測試用 ctx.speakerTemplate 指到暫存的 shared/template，不動真的 shared/setting.json。
import fs from 'node:fs';
import path from 'node:path';
import { speakerGate, saveSpeaker } from '../../lib/speaker.mjs';

const templateOf = (ctx) => ctx.speakerTemplate || ctx.P.templateDir;
const readPlan = (ctx) => { try { return JSON.parse(fs.readFileSync(ctx.P.plan, 'utf8')); } catch { return null; } };

// 分鏡截圖有那一段就附上，確認時看得到畫面上到底寫了什麼
function shotOf(ctx, ids) {
  const dir = path.join(ctx.P.project, 'work', 'storyboard-preview');
  for (const id of ids) {
    for (const name of [`${id}.png`, `${id}-1.png`]) {
      try { return `/storyboard-preview/${encodeURIComponent(name)}?v=${Math.floor(fs.statSync(path.join(dir, name)).mtimeMs).toString(36)}`; } catch { /* 試下一個 */ }
    }
  }
  return null;
}

export function speakerInfo(ctx, plan = readPlan(ctx)) {
  const gate = speakerGate(templateOf(ctx), plan);
  return { ...gate, shot: gate.needed ? shotOf(ctx, gate.segments) : null };
}

export function doSpeakerSave(ctx, body) {
  const { errors } = saveSpeaker(templateOf(ctx), body || {});
  if (errors.length) return [400, { error: 'speaker', message: errors.join('；'), errors }];
  return [200, { ok: true, speaker: speakerInfo(ctx) }];
}
