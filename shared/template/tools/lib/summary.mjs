// 影片摘要（零依賴）：projects/<專案>/work/摘要.md＝這支影片在講什麼，300 字內：一小段描述＋2–6 個列點。
// 初剪完成後由 AI 讀字幕寫（auto-edit-rough 步驟 3）；之後生成這一集的背景圖時拿來參考（構圖台「參考這支影片的重點摘要」，預設勾選）。
//
//   # 影片摘要
//
//   <一到兩句：在講什麼、講給誰聽、語氣>
//
//   - <重點>
//   - <重點>
//
//   summaryFile(projectDir)  → work/摘要.md 的路徑
//   readSummary(projectDir)  → { state: 'none'|'ok'|'bad', file, text, chars, errors }；text＝去掉標題的內文（給生圖指令用）
import fs from 'node:fs';
import path from 'node:path';

export const SUMMARY_FILE = '摘要.md';
export const SUMMARY_MAX = 300;
export const SUMMARY_BULLETS = [2, 6];
export const summaryFile = (projectDir) => path.join(projectDir, 'work', SUMMARY_FILE);
// 字數：不算空白和 Markdown 的記號（標題的 #、列點的 -、粗體的 **）
export const summaryChars = (text) => String(text ?? '').replace(/^\s*(#+|[-*])\s+/gm, '').replace(/\*\*/g, '').replace(/\s/g, '').length;

export function readSummary(projectDir) {
  const file = summaryFile(projectDir);
  if (!fs.existsSync(file)) return { state: 'none', file, text: '', chars: 0, errors: [] };
  const lines = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const body = lines.filter((l) => !/^#+\s/.test(l));
  const bullets = body.filter((l) => /^[-*]\s+\S/.test(l)), prose = body.filter((l) => !/^[-*]\s/.test(l));
  const text = body.join('\n'), chars = summaryChars(text), errors = [];
  if (!prose.length) errors.push('少了開頭的描述 → 列點前面先寫一到兩句：這支影片在講什麼、講給誰聽');
  if (bullets.length < SUMMARY_BULLETS[0]) errors.push(`列點只有 ${bullets.length} 個 → 寫 ${SUMMARY_BULLETS[0]}–${SUMMARY_BULLETS[1]} 個重點，一行一個、用「- 」開頭`);
  if (bullets.length > SUMMARY_BULLETS[1]) errors.push(`列點 ${bullets.length} 個 → 最多 ${SUMMARY_BULLETS[1]} 個，只留最重要的`);
  if (chars > SUMMARY_MAX) errors.push(`${chars} 字 → 最多 ${SUMMARY_MAX} 字（不算空白和記號），刪掉次要的重點`);
  return { state: errors.length ? 'bad' : 'ok', file, text, chars, errors };
}
