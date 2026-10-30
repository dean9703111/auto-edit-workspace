// 精簡版 Mustache（零依賴）。契約：references/template-format.md §2
//   {{x}} 跳脫、{{{x}}} 原樣、{{#x}}…{{/x}}（陣列逐項、物件／真值一次、假值略過）、{{^x}}…{{/x}}（反向）、
//   點號 a.b、項目內找不到的名字往外層找；陣列項目自動帶 n（1 起）／i（0 起）／first／last。
//   單獨佔一行的區段標籤（{{#x}}、{{^x}}、{{/x}}）整行移除，不留空行。

export const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const TAG = /\{\{\{\s*([^}]+?)\s*\}\}\}|\{\{\s*([#^/]?)\s*([^}]+?)\s*\}\}/g;

function parse(tpl) {
  const src = tpl.replace(/^[ \t]*(\{\{[#^/][^}]+\}\})[ \t]*\r?\n/gm, '$1');
  const root = { type: 'root', children: [] };
  const stack = [root];
  let last = 0, m;
  TAG.lastIndex = 0;
  while ((m = TAG.exec(src))) {
    const top = stack[stack.length - 1];
    if (m.index > last) top.children.push({ type: 'text', value: src.slice(last, m.index) });
    last = TAG.lastIndex;
    if (m[1] !== undefined) top.children.push({ type: 'raw', name: m[1] });
    else if (m[2] === '#' || m[2] === '^') {
      const node = { type: m[2] === '#' ? 'sec' : 'inv', name: m[3], children: [] };
      top.children.push(node);
      stack.push(node);
    } else if (m[2] === '/') {
      const node = stack.pop();
      if (stack.length === 0 || node.name !== m[3]) throw new Error(`Mustache：區段 {{/${m[3]}}} 沒有對應的開頭`);
    } else top.children.push({ type: 'var', name: m[3] });
  }
  if (stack.length !== 1) throw new Error(`Mustache：區段 {{#${stack[stack.length - 1].name}}} 沒有結尾`);
  if (last < src.length) root.children.push({ type: 'text', value: src.slice(last) });
  return root;
}

const has = (o, k) => o !== null && o !== undefined && (typeof o === 'object' || typeof o === 'function') && k in Object(o);

function lookup(stack, name) {
  if (name === '.') { const f = stack[stack.length - 1]; return has(f, '.') ? f['.'] : f; }
  const parts = name.split('.');
  for (let s = stack.length - 1; s >= 0; s--) {
    const frame = stack[s];
    if (!has(frame, parts[0])) continue;
    let v = frame;
    for (const p of parts) {
      if (!has(v, p)) return undefined;
      v = v[p];
    }
    return v;
  }
  return undefined;
}

const truthy = (v) => !(v === undefined || v === null || v === false || v === '' || v === 0 || (Array.isArray(v) && v.length === 0));

function renderNodes(nodes, stack) {
  let out = '';
  for (const n of nodes) {
    if (n.type === 'text') out += n.value;
    else if (n.type === 'var') { const v = lookup(stack, n.name); out += v === undefined || v === null ? '' : escapeHtml(v); }
    else if (n.type === 'raw') { const v = lookup(stack, n.name); out += v === undefined || v === null ? '' : String(v); }
    else if (n.type === 'inv') { if (!truthy(lookup(stack, n.name))) out += renderNodes(n.children, stack); }
    else if (n.type === 'sec') {
      const v = lookup(stack, n.name);
      if (!truthy(v)) continue;
      if (Array.isArray(v)) {
        v.forEach((item, i) => {
          const meta = { n: i + 1, i, first: i === 0, last: i === v.length - 1 };
          const frame = item !== null && typeof item === 'object' ? { ...meta, ...item } : { ...meta, '.': item };
          out += renderNodes(n.children, [...stack, frame]);
        });
      } else if (typeof v === 'object') out += renderNodes(n.children, [...stack, v]);
      else out += renderNodes(n.children, stack);
    }
  }
  return out;
}

export function render(template, context = {}) {
  return renderNodes(parse(template).children, [context]);
}
