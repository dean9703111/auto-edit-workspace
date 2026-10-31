// 重截 shared/template/kit/illus-gallery.jpg（kit/illus-gallery.html 的整頁截圖，寬 1920）
//   node dev/tools/illus-gallery-shot.mjs
// illus.js／illus.css 改了、或換了主色（截圖是當下的 --brand）之後重跑。要 HyperFrames 的 Chrome（npx hyperframes browser ensure）與 ffmpeg。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const KIT = path.join(ROOT, 'shared', 'template', 'kit');
const OUT = path.join(KIT, 'illus-gallery.jpg');
const { findChrome, startServer } = await import(path.join(ROOT, 'shared', 'template', 'tools', 'lib', 'audit-browser.mjs'));

const chrome = findChrome();
if (!chrome) { console.error('✖ 找不到 HyperFrames 的 Chrome → npx hyperframes browser ensure'); process.exit(1); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'illus-shot-'));
const run = (args) => new Promise((resolve, reject) => {
  const cp = spawn(chrome, ['--headless', '--hide-scrollbars', '--force-device-scale-factor=1', '--no-first-run', `--user-data-dir=${path.join(tmp, 'u')}`, '--virtual-time-budget=8000', ...args]);
  let out = '';
  cp.stdout.on('data', (d) => { out += d; });
  cp.on('error', reject);
  cp.on('exit', (code) => (code === 0 ? resolve(out) : reject(new Error(`Chrome exit ${code}`))));
});

const { server, port } = await startServer(KIT, path.join(KIT, 'illus.js'));
try {
  const url = `http://127.0.0.1:${port}/illus-gallery.html`;
  const dom = await run(['--dump-dom', url]);
  const h = +((dom.match(/<html[^>]*\bdata-h="(\d+)"/) || [])[1] || 0);
  if (!h) throw new Error('頁面沒有回報高度（兩欄 iframe 都要送出 illusGallery 訊息）');
  const png = path.join(tmp, 'gallery.png');
  await run([`--screenshot=${png}`, `--window-size=1920,${h}`, url]);
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', png, '-q:v', '3', OUT], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg：${r.stderr}`);
  console.log(`✓ ${path.relative(ROOT, OUT)}（1920×${h}）`);
} finally {
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
