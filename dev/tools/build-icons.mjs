// 合併 scenes 與 overlay 兩個 icons 資料夾成 icons.json；svg 處理方式同 scenes-lib.mjs 的 loadIcon
// 用法：node build-icons.mjs <out.json> <dir1> <dir2> ...（先出現的資料夾優先，與 iconDirs() 順序一致）
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [out, ...dirs] = process.argv.slice(2);
const result = {};
const conflicts = [];
for (const d of dirs) {
  for (const f of readdirSync(d).filter((x) => x.endsWith('.svg')).sort()) {
    const name = f.slice(0, -4);
    let svg = readFileSync(path.join(d, f), 'utf8').replace(/<!--[\s\S]*?-->/g, '').trim();
    svg = svg.replace(/<svg\b([^>]*)>/, (m, attrs) => `<svg${attrs.replace(/\s+(?:class|width|height)\s*=\s*"[^"]*"/g, '')}>`);
    svg = svg.replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').replace(/<svg\s+/, '<svg ').replace(/\s+>/g, '>');
    if (name in result) {
      if (result[name] !== svg) conflicts.push(name);
      continue;
    }
    result[name] = svg;
  }
}
const sorted = Object.fromEntries(Object.entries(result).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
writeFileSync(out, JSON.stringify(sorted));
console.log(`entries=${Object.keys(sorted).length} conflicts(same name, different svg; first dir wins)=${conflicts.length}`, conflicts.slice(0, 20));
