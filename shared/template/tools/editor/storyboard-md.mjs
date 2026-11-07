// 分鏡表 Markdown 的解析與修改（不用 Node、不碰檔案）：剪輯服務（editor/server/storyboard.mjs）和官網示範頁（dev/site/demo/）共用同一份。
const fail = (message, status = 400, extra = {}) => Object.assign(new Error(message), { status, extra });

const SEG_ID = /^([a-z]+-?\d+[a-z0-9-]*)(?=$|[\s｜|（(：:])/i;
const HEADING = /^(#{1,6})\s+(.*?)\s*$/;
const IMAGE = /^\s*!\[([^\]]*)\]\(([^)\s]+)\)\s*$/;
const LIST = /^(\s*(?:[-*]|\d+\.)\s+)(.*)$/;
const FENCE = /^\s*(```|~~~)/;
const RULE = /^\s*(-{3,}|\*{3,})\s*$/;
const TABLE_LINE = /^\s*\|/;
const TABLE_SEP = /^\s*\|?(\s*:?-{3,}:?\s*\|)+\s*:?-*:?\s*$/;
// 「版面：疊加」「**結尾要不要配樂**：…」：冒號前的欄名不開放改，工具和 AI 認這幾個字
const LABEL = /^((?:\*\*[^*]{1,20}\*\*|[^：「」`|*]{1,16})：)(.*)$/;

// 表格一列的每一格在這一行的位置（只改那一格，其他格的空白原樣保留）
function cellSpans(line) {
  const bars = [];
  for (let i = 0; i < line.length; i++) if (line[i] === '|' && line[i - 1] !== '\\') bars.push(i);
  if (!bars.length) return [];
  const spans = [];
  for (let k = 0; k < bars.length; k++) {
    const end = k + 1 < bars.length ? bars[k + 1] : line.trimEnd().length;
    if (k + 1 === bars.length && end <= bars[k] + 1) break;   // 行尾的 |
    spans.push([bars[k] + 1, end]);
  }
  return spans;
}
const cellText = (line, [a, b]) => line.slice(a, b).replace(/\\\|/g, '|').trim();
const rowCells = (line) => cellSpans(line).map((s) => cellText(line, s));

const PREVIEW_DIR = 'storyboard-preview';
function imageBlock(imageUrl, lineNo, alt, src) {
  const name = src.startsWith(`${PREVIEW_DIR}/`) ? src.slice(PREVIEW_DIR.length + 1) : null;
  return { type: 'image', line: lineNo, alt, src, url: name && !name.includes('/') ? imageUrl(name) : null };
}

// 一份檔 → 段（## 標題、或 ### <段 id>）→ 區塊；每個區塊記住自己在第幾行（0 起算）
export function parseStoryboard(text, imageUrl = () => null) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const sections = [];
  let title = '', cur = null, fence = null;
  const open = (start, level, heading) => {
    const m = heading && heading.match(SEG_ID);
    cur = { key: m ? m[1] : heading ? `sec-${sections.length}` : 'head', id: m ? m[1] : null, title: heading || '', level, start, end: start, blocks: [] };
    sections.push(cur);
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (fence) {
      fence.lines.push(l);
      if (FENCE.test(l)) fence = null;
      continue;
    }
    if (FENCE.test(l)) {
      if (!cur) open(i, 0, '');
      fence = { type: 'code', line: i, lines: [l] };
      cur.blocks.push(fence);
      continue;
    }
    const h = l.match(HEADING);
    if (h) {
      const level = h[1].length;
      if (level === 1 && !title) { title = h[2]; continue; }
      if (level === 2 || (level === 3 && SEG_ID.test(h[2]))) { open(i, level, h[2]); continue; }
      if (!cur) open(i, 0, '');
      cur.blocks.push({ type: 'heading', line: i, level, text: h[2] });
      continue;
    }
    if (!l.trim()) continue;
    if (!cur) open(i, 0, '');
    if (TABLE_LINE.test(l) && TABLE_SEP.test(lines[i + 1] || '')) {
      const t = { type: 'table', line: i, sep: i + 1, head: rowCells(l), rows: [] };
      for (i += 2; i < lines.length && TABLE_LINE.test(lines[i]); i++) t.rows.push({ line: i, cells: rowCells(lines[i]) });
      i--;
      cur.blocks.push(t);
      continue;
    }
    const img = l.match(IMAGE);
    if (img) { cur.blocks.push(imageBlock(imageUrl, i, img[1], img[2])); continue; }
    if (RULE.test(l)) { cur.blocks.push({ type: 'rule', line: i }); continue; }
    const li = l.match(LIST);
    const body = li ? li[2] : l;
    const lab = body.match(LABEL);
    cur.blocks.push({
      type: li ? 'item' : 'para', line: i, ordered: !!li && /\d/.test(li[1]),
      prefix: (li ? li[1] : '') + (lab ? lab[1] : ''), label: lab ? lab[1].slice(0, -1) : '', value: lab ? lab[2] : body,
    });
  }
  // 每段的範圍：標題到下一段之前，去掉結尾空行（原始 Markdown 模式整段替換用）
  sections.forEach((s, k) => {
    let end = k + 1 < sections.length ? sections[k + 1].start : lines.length;
    while (end > s.start + 1 && !lines[end - 1].trim()) end--;
    s.end = end;
    s.raw = lines.slice(s.start, end).join('\n');
  });
  return { title, lines, sections: sections.filter((s) => s.blocks.length || s.id) };
}

function overviewOf(sections) {
  const out = {};
  for (const s of sections) {
    for (const b of s.blocks) {
      if (b.type !== 'table' || !b.head.includes('一句話摘要')) continue;
      const at = (name) => b.head.indexOf(name);
      for (const r of b.rows) {
        out[r.cells[at('段')]] = { time: r.cells[at('時間碼')] || '', layout: r.cells[at('版面')] || '', card: r.cells[at('卡片類型')] || '', summary: r.cells[at('一句話摘要')] || '', chapter: at('章') >= 0 ? r.cells[at('章')] || '' : '' };
      }
    }
  }
  return out;
}

// 工具看得懂才算數：動畫分鏡、插圖清單的表頭 audit 會逐字讀；段號重複 versions.mjs 會找錯段
function warningsOf(sections, beatHeaders) {
  const out = [], seen = new Set();
  const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  for (const s of sections) {
    if (s.id) {
      if (seen.has(s.id)) out.push(`段號 ${s.id} 出現兩次，請改掉其中一個`);
      seen.add(s.id);
    }
    s.blocks.forEach((b, k) => {
      if (b.type !== 'heading' || !/^動畫分鏡\s/.test(b.text)) return;
      const t = s.blocks[k + 1];
      if (t?.type !== 'table' || !beatHeaders.some((h) => same(t.head, h))) out.push(`${b.text} 的表頭被改到了，動畫檢查會讀不到；請還原成「${beatHeaders[0].join('｜')}」`);
    });
  }
  return out;
}

// 頁面要的整份狀態；hash 由呼叫端給（服務用 sha1，示範頁用簡單的雜湊）
export function storyboardDocState(text, { hash, imageUrl, beatHeaders }) {
  const doc = parseStoryboard(text, imageUrl);
  return {
    hash: hash(text), title: doc.title, sections: doc.sections, overview: overviewOf(doc.sections), warnings: warningsOf(doc.sections, beatHeaders),
    // 結構（哪一行是什麼區塊）有變，頁面才要整頁重畫
    sig: hash(doc.sections.map((s) => `${s.key}:${s.blocks.map((b) => `${b.type}${b.line}${b.rows ? b.rows.length : ''}`).join(',')}`).join(';')),
  };
}

const oneLine = (s) => String(s ?? '').replace(/\r?\n/g, ' ').trim();
const needInt = (n, what) => { if (!Number.isInteger(n) || n < 0) throw fail(`${what}要是行號`); return n; };
// expect＝頁面上這一格改之前的內容：對不上就是頁面和檔案的行號錯開了，不能寫（寫下去會蓋到別行）
const MOVED = '這一行的內容和頁面上的不一樣，已重新載入';
const checkExpect = (body, now) => { if (body.expect != null && String(body.expect) !== now) throw fail(MOVED, 409, { moved: true }); };

function findBlock(doc, line) {
  for (const s of doc.sections) {
    for (const b of s.blocks) {
      if (b.type === 'table') {
        if (b.line === line) return { table: b, part: 'head' };
        if (b.sep === line) return { table: b, part: 'sep' };
        const r = b.rows.find((x) => x.line === line);
        if (r) return { table: b, part: 'row', row: r };
      } else if (b.line === line) return { block: b };
    }
  }
  return {};
}

// 使用者能動的只有畫面上要呈現的文字，其他欄位是工具和 AI 在用的
const TEXT_LABEL = '畫面文字';
const TEXT_COLUMN = /^(畫面上出現什麼|卡上文字)|☐/;
// 段落的選擇與補充說明：想換成＝希望 AI 改用的情境、補充說明＝不滿意時的文字；AI 處理完會刪掉這兩行（auto-edit-storyboard）
const FIELD_LABELS = { 想換成: 'segment', 音效: 'segment', 補充說明: 'any' };

export const isDecideSection = (s) => /需要.*決定/.test(s.title || '');

// 這一段「第一個小標題之前」的最後一行（新欄位加在這裡）
function fieldInsertAt(lines, section) {
  const head = section.blocks.find((b) => b.type === 'heading');
  let end = head ? head.line : section.end;
  while (end > section.start + 1 && !lines[end - 1].trim()) end--;
  return end;
}

function setField(doc, lines, body) {
  const label = String(body.label ?? '');
  const scope = FIELD_LABELS[label];
  if (!scope) throw fail('這個欄位不能改');
  const s = doc.sections.find((x) => x.key === body.key);
  if (!s) throw fail(`找不到「${body.key}」這一段`);
  if (!s.id && !(scope === 'any' && isDecideSection(s))) throw fail('這一段不能加這個欄位');
  const value = oneLine(body.value);
  const found = s.blocks.find((b) => b.type === 'item' && b.label === label);
  checkExpect(body, found?.value ?? '');
  const empty = !value || (label === '音效' && value === '預設' && !found);
  if (found) {
    if (value) { lines[found.line] = found.prefix + value; return lines; }
    // 拿掉這一行；前後都是空行就順便收一行
    const blankAround = !lines[found.line - 1]?.trim() && !lines[found.line + 1]?.trim();
    lines.splice(blankAround ? found.line - 1 : found.line, blankAround ? 2 : 1);
    return lines;
  }
  if (empty) return lines;
  const at = fieldInsertAt(lines, s);
  const row = `- ${label}：${value}`;
  // 前一行不是清單就空一行，Markdown 才會是新的清單
  lines.splice(at, 0, ...(LIST.test(lines[at - 1] || '') ? [row] : ['', row]));
  return lines;
}

// 「需要我決定的事」的一項（數字清單）底下的回答：`   - 回答：…`，空的就拿掉那一行
const ANSWER = /^\s+-\s*回答：(.*)$/;
function setAnswer(doc, lines, body) {
  const line = needInt(body.line, '要回答的那行');
  const s = doc.sections.find((x) => isDecideSection(x) && x.blocks.some((b) => b.line === line));
  const q = s?.blocks.find((b) => b.line === line);
  if (q?.type !== 'item' || !q.ordered) throw fail('只有「需要我決定的事」的項目可以回答');
  const has = ANSWER.exec(lines[line + 1] || '');
  checkExpect(body, has ? has[1] : '');
  const value = oneLine(body.text);
  if (has && value) lines[line + 1] = `   - 回答：${value}`;
  else if (has) lines.splice(line + 1, 1);
  else if (value) lines.splice(line + 1, 0, `   - 回答：${value}`);
  return lines;
}

// body 的 op：text 改「畫面文字」那一行／cell 改一格要呈現的文字或金句勾選／field 設定想換成、音效、補充說明／answer 回答「需要我決定的事」的一項
export function applyStoryboardOp(doc, body) {
  const lines = doc.lines.slice();
  switch (body?.op) {
    case 'text': {
      const line = needInt(body.line, '要改的那行');
      const { block } = findBlock(doc, line);
      if (block?.type !== 'item' || block.label !== TEXT_LABEL) throw fail('只有畫面上要呈現的文字可以改；其他想調整的，寫在這一段的補充說明');
      checkExpect(body, block.value);
      lines[line] = block.prefix + oneLine(body.text);
      return lines;
    }
    case 'cell': {
      const line = needInt(body.line, '要改的那列');
      const col = needInt(body.col, '要改的那格');
      const { part, table, row } = findBlock(doc, line);
      if (part !== 'row') throw fail(`第 ${line + 1} 行不是表格的一列`);
      if (col >= table.head.length) throw fail(`這張表只有 ${table.head.length} 欄`);
      if (!TEXT_COLUMN.test(table.head[col])) throw fail('只有畫面上要呈現的文字可以改；其他想調整的，寫在這一段的補充說明');
      checkExpect(body, row.cells[col] ?? '');
      const value = oneLine(body.text).replace(/\|/g, '\\|');
      let l = lines[line];
      // 這一列的格數比表頭少：先補到夠
      for (let n = row.cells.length; n <= col; n++) l = `${l.trimEnd().replace(/\|?$/, '')} |  |`;
      const [a, b] = cellSpans(l)[col];
      lines[line] = `${l.slice(0, a)} ${value} ${l.slice(b)}`;
      return lines;
    }
    case 'field':
      return setField(doc, lines, body);
    case 'answer':
      return setAnswer(doc, lines, body);
    default:
      throw fail('看不懂要改什麼');
  }
}

// 把一次修改套到文字上，保留 BOM 與換行符號
export function applyStoryboardEdit(text, body, imageUrl) {
  const bom = text.startsWith('\uFEFF') ? '\uFEFF' : '';
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  return bom + applyStoryboardOp(parseStoryboard(text, imageUrl), body).join(eol);
}
