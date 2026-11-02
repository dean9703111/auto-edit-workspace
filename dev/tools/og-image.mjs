// 重截官網分享預覽圖 dev/site/og-image.jpg（1200×630；og:image、twitter:image、JSON-LD 的 screenshot、GitHub 的 Social preview）
//   node dev/tools/og-image.mjs
// 來源是 dev/tools/og/og-image.html（右邊的截圖用 shared/template/gallery/03-side-panel.jpg；重截情境庫縮圖後跟著重跑）。
// 要 HyperFrames 的 Chrome（npx hyperframes browser ensure）與 ffmpeg。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = path.join(ROOT, 'dev', 'tools', 'og', 'og-image.html');
const OUT = path.join(ROOT, 'dev', 'site', 'og-image.jpg');
const { findChrome } = await import(path.join(ROOT, 'shared', 'template', 'tools', 'lib', 'audit-browser.mjs'));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'og-image-'));
try {
  const png = path.join(tmp, 'og.png');
  const c = spawnSync(findChrome(), ['--headless', '--hide-scrollbars', '--force-device-scale-factor=1', '--no-first-run', `--user-data-dir=${path.join(tmp, 'u')}`,
    '--allow-file-access-from-files', '--virtual-time-budget=5000', '--window-size=1200,630', `--screenshot=${png}`, pathToFileURL(SRC).href], { stdio: 'ignore' });
  if (c.status !== 0 || !fs.existsSync(png)) throw new Error(`Chrome 截圖失敗（exit ${c.status}）`);
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', png, '-q:v', '2', OUT], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg：${r.stderr}`);
  console.log(`✓ ${path.relative(ROOT, OUT)}（1200×630）`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
