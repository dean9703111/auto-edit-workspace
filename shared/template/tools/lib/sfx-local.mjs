// 自備音效（030）：shared/sfx-local/<名稱>.wav（不進版控，每個人放自己有權使用的音效）。
// 名稱和 kit/sfx.json 的一樣（ding、impact、chapter…）就蓋過內建的那一顆；kit 沒有的名稱（例 tick、checkin、question、wow）＝多一顆可以用的音效。
// 每顆的峰值位置（音效要對準畫面那一格）和響度由工具量，音量照那個角色「比人聲大幾 dB」算（kit 的 roleDb，沒有就是 targetDb），所以換了檔，和人聲的比例還是原本設計的。
// 角色的大小照作者五支剪映定剪的中位數（那一顆的響度＋他設的音量−那支片的人聲響度；specs/031-sfx-roles/brief.md）。
// 量過的結果記在 shared/sfx-local/sfx.json（檔案大小、修改時間沒變就不重量）；想自己定音量：在那一筆寫 "volume": 0.5, "manual": true。
//
//   localSfxDir(sharedDir)                          → shared/sfx-local 的路徑
//   syncLocalSfx(sharedDir, { kit, log })           → { <名稱>: 音效設定 }（合併進 lib.sfx；沒有資料夾、或環境變數 AUTO_EDIT_NO_LOCAL_SFX=1 → {}）
//   measureWav(file)                                → { peak（秒；第一次到達最大聲 70% 的地方）, lufs（M max：EBU R128 momentary 的最大值，和 kit/sfx.json、dev/tools/make-sfx.mjs 同一種量法）, seconds } | null
//   volumeFor(lufs, targetDb)                       → 音量倍數（人聲 −14 LUFS；最大 1）
//   LOCAL_ROLES                                     → 自備才有的角色（checkin、question、wow、tick）：用途、音量、每集上限、沒放時改用誰
//   sfxActual(name, sfxConf)                        → 實際會響的名稱：有這顆就是它；自備角色沒放 → 它的 fallback（null＝不出聲）；不認得的名稱 → undefined
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const LOCAL_SFX_DIR = 'sfx-local';
export const LOCAL_DEFAULT_DB = -6;        // kit 沒有的名稱：比人聲小 6 dB
// 自備才有的角色（031）：repo 不內建，shared/sfx-local/ 放了 <名稱>.wav 才有。plan.json、情緒點、P.sfx 寫這些名稱都不會報錯：
// 沒放的時候改用 fallback 那一顆內建的（null＝不出聲）。用途、音量照作者的剪映定剪（specs/031-sfx-roles/brief.md）。
export const LOCAL_ROLES = Object.freeze({
  checkin: { zh: '過關音', use: '步驟做完、畫面上看得到成了（配對完成、上傳成功、版號正確）', event: '結果出現那一格', targetDb: -6, maxPerVideo: 5, fallback: 'success' },
  question: { zh: '疑問「啊？」', use: '傻眼、結果和預期相反；一集最多一次', event: '那句話講完', targetDb: 3.6, maxPerVideo: 1, fallback: null },
  wow: { zh: '哇嗚', use: '結果比預期好的驚喜；一集最多一次', event: '結果出現那一格', targetDb: -3.5, maxPerVideo: 1, fallback: 'success' },
  tick: { zh: '秒針', use: '錄影的等待快轉（那幾秒沒人講話）：工具自動配，響到結果出現前 0.2 秒、接一顆 ding；不用自己寫', event: '快轉開始', targetDb: -16.6, maxPerVideo: null, fallback: null, auto: true },
});
export function sfxActual(name, sfxConf = {}) {
  if (name == null) return null;
  if (sfxConf[name]) return name;
  if (!(name in LOCAL_ROLES)) return undefined;
  const fb = LOCAL_ROLES[name].fallback;
  return fb && sfxConf[fb] ? fb : null;
}

const VOICE_LUFS = -14, RATE = 48000, WIN = Math.round(0.15 * RATE), STATE_VER = 2;   // STATE_VER：量法改了就加 1，舊的量測結果重量
const r3 = (n) => Math.round(n * 1000) / 1000;

export const localSfxDir = (sharedDir) => path.join(sharedDir, LOCAL_SFX_DIR);

// wav 檔有幾秒（讀檔頭：fmt 的 byteRate、data 的長度）；不是 wav、讀不到回 null
export function wavSeconds(file) {
  try {
    const b = fs.readFileSync(file);
    if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') return null;
    let rate = 0;
    for (let p = 12; p + 8 <= b.length;) {
      const id = b.toString('ascii', p, p + 4), size = b.readUInt32LE(p + 4);
      if (id === 'fmt ') rate = b.readUInt32LE(p + 16);
      if (id === 'data') return rate > 0 ? r3(Math.min(size, b.length - p - 8) / rate) : null;
      p += 8 + size + (size % 2);
    }
  } catch { /* 讀不到 */ }
  return null;
}

export function measureWav(file) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  if (r.status !== 0 || !r.stdout?.length) return null;
  const n = Math.floor(r.stdout.length / 4), x = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, n);
  let peakAt = 0, peak = 0;
  for (let i = 0; i < n; i++) { const a = Math.abs(x[i]); if (a > peak) { peak = a; peakAt = i; } }
  if (!(peak > 0)) return null;
  // 對準點：第一次到達最大聲 70% 的地方。「咚咚」這種敲兩下的，對到第一下；先鋪墊再亮起來的（閃亮登場）鋪墊不到 70%，對到亮起來那一下
  for (let i = 0; i < n; i++) if (Math.abs(x[i]) >= 0.7 * peak) { peakAt = i; break; }
  // 響度：M max（前後補 1 秒靜音、當成立體聲播；和 kit/sfx.json 的 targetDb 同一種量法，自備的和內建的才比得起來）
  const e = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'aformat=channel_layouts=stereo,adelay=1000:all=1,apad=pad_dur=1,ebur128=metadata=1,ametadata=print:key=lavfi.r128.M:file=-', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  let lufs = -Infinity;
  for (const m of String(e.stdout || '').matchAll(/lavfi\.r128\.M=(-?[\d.]+)/g)) lufs = Math.max(lufs, Number(m[1]));
  if (!Number.isFinite(lufs)) {
    // 這台的 ffmpeg 量不了：退回最響的 150 ms 的均方根（短的聲音會偏大聲一點）
    const w = Math.min(WIN, n);
    let sum = 0, best = 0;
    for (let i = 0; i < n; i++) { sum += x[i] * x[i]; if (i >= w) sum -= x[i - w] * x[i - w]; if (i >= w - 1 && sum > best) best = sum; }
    lufs = 10 * Math.log10(Math.max(best / w, 1e-12)) - 0.691;
  }
  return { peak: r3(peakAt / RATE), lufs: Math.round(lufs * 10) / 10, seconds: r3(n / RATE) };
}

// 檔案的響度 lufs、要比人聲大 targetDb dB（負的＝比人聲小）→ 音量倍數；最多 1 倍（再放大會破音）
export function volumeFor(lufs, targetDb) {
  return r3(Math.min(1, 10 ** ((targetDb - (lufs - VOICE_LUFS)) / 20)));
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
    if (!e || e.v !== STATE_VER || e.size !== st.size || Math.round(e.mtimeMs) !== Math.round(st.mtimeMs)) {
      const m = measureWav(path.join(dir, f));
      if (!m) { if (log) log(`⚠ 自備音效 ${f} 讀不了（不是聲音檔，或整段沒有聲音）→ 這顆照內建的`); continue; }
      e = { ...(e?.manual ? { volume: e.volume, manual: true } : {}), ...(e?.zh ? { zh: e.zh } : {}), ...(e?.use ? { use: e.use } : {}), ...m, size: st.size, mtimeMs: Math.round(st.mtimeMs), v: STATE_VER };
      changed = true;
    }
    next[name] = e;
    const base = kit[name] && kit[name].kind !== 'bgm' ? kit[name] : null;
    const role = base ? null : LOCAL_ROLES[name];
    const targetDb = base?.roleDb ?? base?.targetDb ?? role?.targetDb ?? LOCAL_DEFAULT_DB;   // roleDb：這個角色想要的大小（內建檔放到 1 倍還不夠大時才有）
    const volume = e.manual && e.volume > 0 ? e.volume : volumeFor(e.lufs, targetDb);
    out[name] = {
      ...(base || { kind: 'sfx', zh: e.zh || role?.zh || name, use: e.use || role?.use || '自備音效', event: role?.event || '', additive: false, maxPerVideo: role?.maxPerVideo ?? null }),
      peak: e.peak, seconds: e.seconds, volume, targetDb: Math.round((e.lufs - VOICE_LUFS + 20 * Math.log10(volume)) * 10) / 10, variants: [], local: true,
    };
  }
  if (changed || Object.keys(state).some((k) => !next[k])) {
    try { fs.writeFileSync(stateFile, `${JSON.stringify(next, null, 1)}\n`); } catch { /* 唯讀的工作區：下次再量 */ }
  }
  return out;
}
