// matte-setup（下載人物去背模型）
// 032 C9：從 media.mjs 搬過來（只搬移，輸出不變）；media.mjs 照舊匯出原本那些名稱
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { matteWeights, MATTE } from '../matte.mjs';
import { run } from '../ff.mjs';
import { next } from '../say.mjs';

// ---------- matte-setup（下載人物去背模型） ----------
// 對一張 64×64 的圖跑一次 npx hyperframes remove-background：第一次會下載模型；之後 build 就能做去背（lib/matte.mjs）
export function matteSetup({ log = console.log, root = process.cwd() } = {}) {
  const before = matteWeights();
  if (before.cached) { log(`✓ 去背模型已經下載過了：${before.file}`); return { ok: true, downloaded: false }; }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-matte-'));
  try {
    const png = path.join(tmp, 'probe.png'), out = path.join(tmp, 'out.png');
    const mk = run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=gray:s=64x64', '-frames:v', '1', png]);
    if (mk.status !== 0) throw new Error(`ffmpeg 做不出測試圖：${String(mk.stderr).trim().slice(-200)}`);
    log(`下載去背模型（約 ${MATTE.sizeMb} MB，只下載一次）…`);
    const r = run('npx', ['hyperframes', 'remove-background', png, '-o', out], { cwd: root, shell: process.platform === 'win32' });
    const after = matteWeights();
    if (!after.cached) throw new Error(`模型沒有下載成功：${String(r.stderr || r.stdout).trim().split('\n').slice(-2).join(' ')} → 確認網路後再跑一次；看狀態跑 npx hyperframes remove-background --info`);
    log(`✓ 去背模型下載好了：${after.file}`);
    for (const l of next('重跑剛剛那條 build')) log(l);
    return { ok: true, downloaded: true };
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
