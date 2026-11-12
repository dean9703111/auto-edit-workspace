// 自備音效（030）：shared/sfx-local/<名稱>.wav（不進版控，每個人放自己有權使用的音效）。
// 名稱和 kit/sfx.json 的一樣（ding、impact、chapter…）就蓋過內建的那一顆；kit 沒有的名稱（例 tick、checkin、question、wow）＝多一顆可以用的音效。
// 每顆的峰值位置（音效要對準畫面那一格）和響度由工具量，音量照 kit 那個名稱的 targetDb（比人聲小幾 dB）算，所以換了檔，和人聲的比例還是原本設計的。
// 量過的結果記在 shared/sfx-local/sfx.json（檔案大小、修改時間沒變就不重量）；想自己定音量：在那一筆寫 "volume": 0.5, "manual": true。
//
//   localSfxDir(sharedDir)                          → shared/sfx-local 的路徑
//   syncLocalSfx(sharedDir, { kit, log })           → { <名稱>: 音效設定 }（合併進 lib.sfx；沒有資料夾、或環境變數 AUTO_EDIT_NO_LOCAL_SFX=1 → {}）
//   measureWav(file)                                → { peak（秒；第一次到達最大聲 70% 的地方）, lufs（最響的 150 ms，約略的 LUFS）, seconds } | null
//   volumeFor(lufs, targetDb)                       → 音量倍數（人聲 −14 LUFS；最大 1）
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const LOCAL_SFX_DIR = 'sfx-local';
export const LOCAL_DEFAULT_DB = -6;        // kit 沒有的名稱：比人聲小 6 dB
const VOICE_LUFS = -14, CAP_DB = -3, RATE = 48000, WIN = Math.round(0.15 * RATE);
const r3 = (n) => Math.round(n * 1000) / 1000;

export const localSfxDir = (sharedDir) => path.join(sharedDir, LOCAL_SFX_DIR);

export function measureWav(file) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  if (r.status !== 0 || !r.stdout?.length) return null;
  const n = Math.floor(r.stdout.length / 4), x = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, n);
  let peakAt = 0, peak = 0;
  for (let i = 0; i < n; i++) { const a = Math.abs(x[i]); if (a > peak) { peak = a; peakAt = i; } }
  if (!(peak > 0)) return null;
  // 對準點：第一次到達最大聲 70% 的地方。「咚咚」這種敲兩下的，對到第一下；先鋪墊再亮起來的（閃亮登場）鋪墊不到 70%，對到亮起來那一下
  for (let i = 0; i < n; i++) if (Math.abs(x[i]) >= 0.7 * peak) { peakAt = i; break; }
  // 最響的 150 ms 的均方根（檔案比 150 ms 短就整檔）
  const w = Math.min(WIN, n);
  let sum = 0, best = 0;
  for (let i = 0; i < n; i++) { sum += x[i] * x[i]; if (i >= w) sum -= x[i - w] * x[i - w]; if (i >= w - 1 && sum > best) best = sum; }
  const lufs = 10 * Math.log10(Math.max(best / w, 1e-12)) - 0.691;
  return { peak: r3(peakAt / RATE), lufs: Math.round(lufs * 10) / 10, seconds: r3(n / RATE) };
}

export function volumeFor(lufs, targetDb) {
  const t = Math.min(targetDb, CAP_DB);
  return r3(Math.min(1, 10 ** ((t - (lufs - VOICE_LUFS)) / 20)));
}

export function syncLocalSfx(sharedDir, { kit = {}, log = null } = {}) {
  const dir = localSfxDir(sharedDir);
  if (process.env.AUTO_EDIT_NO_LOCAL_SFX === '1' || !fs.existsSync(dir)) return {};
  const stateFile = path.join(dir, 'sfx.json');
  let state = {};
  try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { state = {}; }
  const out = {}, next = {};
  let changed = false;
  for (const f of fs.readdirSync(dir).filter((x) => /^[a-z][a-z0-9-]*\.wav$/.test(x)).sort()) {
    const name = f.slice(0, -4), st = fs.statSync(path.join(dir, f));
    let e = state[name];
    if (!e || e.size !== st.size || Math.round(e.mtimeMs) !== Math.round(st.mtimeMs)) {
      const m = measureWav(path.join(dir, f));
      if (!m) { if (log) log(`⚠ 自備音效 ${f} 讀不了（不是聲音檔，或整段沒有聲音）→ 這顆照內建的`); continue; }
      e = { ...(e?.manual ? { volume: e.volume, manual: true } : {}), ...(e?.zh ? { zh: e.zh } : {}), ...(e?.use ? { use: e.use } : {}), ...m, size: st.size, mtimeMs: Math.round(st.mtimeMs) };
      changed = true;
    }
    next[name] = e;
    const base = kit[name] && kit[name].kind !== 'bgm' ? kit[name] : null;
    const targetDb = base?.targetDb ?? LOCAL_DEFAULT_DB;
    const volume = e.manual && e.volume > 0 ? e.volume : volumeFor(e.lufs, targetDb);
    out[name] = {
      ...(base || { kind: 'sfx', zh: e.zh || name, use: e.use || '自備音效', event: '', additive: false, maxPerVideo: null }),
      peak: e.peak, volume, targetDb: Math.round((e.lufs - VOICE_LUFS + 20 * Math.log10(volume)) * 10) / 10, variants: [], local: true,
    };
  }
  if (changed || Object.keys(state).some((k) => !next[k])) {
    try { fs.writeFileSync(stateFile, `${JSON.stringify(next, null, 1)}\n`); } catch { /* 唯讀的工作區：下次再量 */ }
  }
  return out;
}
