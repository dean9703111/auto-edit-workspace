// 官網示範頁的資料邏輯（不用 Node、不碰檔案）。dev/tests/site-demo.test.mjs 檢查它算出來的和真正的剪輯服務一樣。
export const BEAT_HEADER = ['拍', '講到（綁句）', '畫面上出現什麼', '動態（設計系統語彙）', '焦點', '音效拍點'];
export const BEAT_HEADERS = [BEAT_HEADER, [...BEAT_HEADER, '插圖元件（狀態）', '位置']];

export function hashText(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

const clock = (t) => { const [m, s] = t.split(':'); return Number(m) * 60 + Number(s); };
const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const NG_HEAD = /^\|\s*剪\s*\|\s*時間碼/;

// 和 editor/server/cuts.mjs 的 cutsState 同樣的欄位（ng、sections、errors、hasNg、hasCutCol）
export function cutsDemoState(text) {
  const lines = text.split('\n');
  const ng = [], sections = [];
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^##\s+/.test(l)) { cur = { title: l.replace(/^##\s+/, '').trim(), ng: false, md: [] }; sections.push(cur); continue; }
    if (/^#\s+/.test(l) || !cur) continue;
    if (NG_HEAD.test(l)) {
      cur.ng = true;
      for (i += 2; i < lines.length && lines[i].trim().startsWith('|'); i++) {
        const [check, time, content, reason, pending] = cells(lines[i]);
        const [start, end] = time.split('–').map(clock);
        ng.push({ row: ng.length + 1, start, end, text: content, reason, note: pending && pending !== '—' ? pending : '', cut: /\[x\]/i.test(check) });
      }
      i--;
      continue;
    }
    cur.md.push(l);
  }
  return { hasNg: ng.length > 0, hasCutCol: true, errors: [], ng, sections: sections.map((s) => ({ ...s, md: s.md.join('\n').trim() })) };
}

// 只改第 N 列的「剪」欄（和真正的服務一樣，其他字元不動）
export function setDemoCut(text, row, on) {
  let n = 0, inTable = false;
  return text.split('\n').map((l) => {
    if (NG_HEAD.test(l)) { inTable = true; return l; }
    if (!inTable) return l;
    if (!l.trim().startsWith('|')) { inTable = false; return l; }
    if (/^\|\s*-/.test(l)) return l;
    n++;
    return n === Number(row) ? l.replace(/^\|\s*\[[ xX]?\]/, `| [${on ? 'x' : ' '}]`) : l;
  }).join('\n');
}
