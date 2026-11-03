// 重截 shared/template/gallery/<情境>.jpg（情境庫卡片與官網預覽 iframe 載入前的底圖、官網 og:image；1280×720）
//   node dev/tools/gallery-shot.mjs [01-chapter,14-speaker]
// 截 preview/<情境>.html?t=<完成態>（段長 − 1.8 秒，在內容淡出、面板收回之前；短段取段長 60%）。換了講者示意圖（preview/speaker.jpg）、主色、背景圖或改了模板之後重跑。
// 要 HyperFrames 的 Chrome（npx hyperframes browser ensure）與 ffmpeg。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TPL = path.join(ROOT, 'shared', 'template');
const PREVIEW = path.join(TPL, 'preview'), OUT = path.join(TPL, 'gallery');
const { findChrome } = await import(path.join(TPL, 'tools', 'lib', 'audit-browser.mjs'));

const only = process.argv[2] ? process.argv[2].split(',') : null;
const scenes = fs.readdirSync(path.join(TPL, 'scenes')).flatMap((d) => [d, `${d}-wide`]).filter((d) => fs.existsSync(path.join(PREVIEW, `${d}.html`)) && (!only || only.includes(d))).sort();   // -wide：全寬版型示意（04 家族）
if (!scenes.length) { console.error(`✖ 沒有可截的情境${only ? `（${only.join('、')}）` : ''}`); process.exit(1); }

const chrome = findChrome();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gallery-shot-'));
const shot = (url, png) => new Promise((resolve, reject) => {
  const cp = spawn(chrome, ['--headless', '--hide-scrollbars', '--force-device-scale-factor=1', '--no-first-run', `--user-data-dir=${path.join(tmp, 'u')}`,
    '--allow-file-access-from-files', '--virtual-time-budget=8000', '--window-size=1280,720', `--screenshot=${png}`, url], { stdio: 'ignore' });
  cp.on('error', reject);
  cp.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`Chrome exit ${code}`))));
});

try {
  for (const key of scenes) {
    const file = path.join(PREVIEW, `${key}.html`);
    const pv = JSON.parse((fs.readFileSync(file, 'utf8').match(/window\.__PREVIEW = (\{.*?\});/) || [])[1] || '{}');
    if (!pv.duration) { console.error(`✖ ${key}：預覽頁沒有 window.__PREVIEW.duration`); process.exitCode = 1; continue; }
    const t = +Math.max(pv.duration * 0.6, pv.duration - 1.8).toFixed(2);
    const png = path.join(tmp, `${key}.png`), jpg = path.join(OUT, `${key}.jpg`);
    await shot(`${pathToFileURL(file).href}?t=${t}`, png);
    const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', png, '-q:v', '3', jpg], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`ffmpeg：${r.stderr}`);
    console.log(`✓ ${path.relative(ROOT, jpg)}（t=${t}）`);
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
