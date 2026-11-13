// 032 W5 維護設施：dev/README.md 列得到 dev/tools/ 的每個檔（新增工具時順手寫一列，維護者才找得到）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('dev/tools/ 底下每個檔都出現在 dev/README.md（寫成 tools/<檔名>）', () => {
  const readme = fs.readFileSync(path.join(ROOT, 'dev', 'README.md'), 'utf8');
  const tools = path.join(ROOT, 'dev', 'tools');
  const files = fs.readdirSync(tools, { recursive: true })
    .filter((f) => fs.statSync(path.join(tools, f)).isFile() && !path.basename(f).startsWith('.'))
    .map((f) => f.split(path.sep).join('/'));
  const missing = files.filter((f) => !readme.includes(`tools/${f}`));
  assert.deepEqual(missing, [], `dev/README.md 沒寫到：${missing.join('、')} → 在第一張表加一列：路徑寫 \`tools/<檔名>\`、用途一句、怎麼跑（讀檔頭）`);
});
