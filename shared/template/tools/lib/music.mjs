// 配樂（選用）：曲庫、整支片的底樂、ACE-Step 1.5 生成（零依賴，只用 Node 22 與 ffmpeg）
//
// 曲庫＝登錄檔＋同資料夾的 wav：
//   工作區  shared/music/music.json、shared/music/<曲名>.wav          每一集都能用（music.mjs gen、music.mjs add 寫）
//   這一集  projects/<專案>/work/music/music.json、…/<曲名>.wav       只有這一集能用（music.mjs gen --project）
//   登錄檔一筆：{ "<曲名>": { "kind": "bgm", "zh", "volume", "targetDb", "fadeIn", "fadeOut", "credit"?, "source": { engine, model, prompt, seed, … } } }
//   欄位和 kit/sfx.json 的配樂一樣（volume＝片尾配樂的音量、targetDb＝比人聲小幾 dB），所以 plan.json 的 outro.music、bed.music 都能寫曲名
//
//   loadMusic({ sharedDir, projectDir })      → { "<曲名>": { …登錄檔那一筆, file: <wav 絕對路徑>, scope: 'shared'|'project' } }（這一集的蓋過工作區同名的）
//   musicDirs({ sharedDir, projectDir })      → { shared, project }
//   registerTrack(dir, name, entry)           寫登錄檔（已經有的曲名不覆寫，丟錯）
//   normalizeTrack(src, dst, opts)            去頭尾靜音、響度調到 LIB_LUFS、48 kHz 立體聲 16-bit → { dur, lufs }
//   bedPlan(bed, { outDur, outroAt })          → { at: 0, dur, fadeIn, fadeOut }
//   renderBedClip(src, dstDir, opts)          底樂：接成無縫循環、鋪滿 dur、音量 gainDb、照人聲壓低（key＝主軌檔，沒給就整段固定音量）、限幅、淡入淡出 → { file, dur }
//   bedLine(bed, clip)                        build 報告那一行
//   BED.volume                                plan.json 的 bed.volume 範圍（dB；0＝曲庫檔原本的音量，最小值＝靜音）
//   bedDucks(cues, pauses)                    講話時壓低的區間（rough.mp4 秒數；剪輯台的背景音樂軌畫比較低、比較暗）
//   bedJson(bed, clip, { tm, volume, ducked, ducks }) → build --check --json 的 bed（剪輯台的背景音樂軌，057）
//   writeBedInfo(outDir, info)／readBedInfo(outDir)  上一次 build 做進 index.html 的底樂（work/hyperframes/.cache/bed.json；剪輯台即時試聽只補差的 dB）
//
// ACE-Step 1.5 的本機 API（https://github.com/ace-step/ACE-Step-1.5，docs/en/API.md）：
//   aceHealth(url)                            → { ok, modelsReady } 或 { ok: false, why }
//   aceGenerate(url, { prompt, seconds, n, seed, steps }, onTick) → [{ file: <伺服器上的下載路徑>, seed }]（純音樂、wav）
//   aceDownload(url, filePath, dst)
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { run, probeDuration } from './ff.mjs';
import { r3 } from './time.mjs';
import { LOUD } from './audio.mjs';

export const MUSIC_FILE = 'music.json';
export const LIB_LUFS = -20;              // 曲庫的檔一律調到這個響度（true peak ≤ −2），之後各種用途只要乘一個固定倍數
export const OUTRO_DB = -11;              // 片尾配樂比人聲（−14 LUFS）小幾 dB：和內建的 bgm-cylinder-five 一樣
export const BED = {
  volume: [-40, 6],                       // plan.json 的 bed.volume（dB）：0＝曲庫檔原本的音量（LIB_LUFS，約比人聲小 6 dB），−40＝靜音（不放進完成影片；057 第二輪）
  lift: 6,                                // 講話時壓低幾 dB（sidechain：講話一開始 30 ms 內壓下去、停 0.6 秒後慢慢回來；沒人講話＝曲庫檔＋bed.volume）
  tp: -1,                                 // 輸出的 true peak 上限（dBTP）：曲庫檔 true peak ≤ −2，調大超過就限幅
  fadeIn: 2, fadeOut: 3, cross: 3,        // 片頭淡入、片尾（或接片尾配樂前）淡出、循環接點交叉淡化的秒數
  minLen: 20,                             // 曲子至少幾秒才能當底樂（太短循環聽得出來）
  liftGap: 1,                             // 剪輯台畫「壓低」：停頓至少幾秒才畫成回升（壓縮器 600 ms 才放開，太短的停頓聽不出來）
};
const RATE = 48000;
const DUCK_RATIO = 1.32;
const dB = (d) => Math.pow(10, d / 20);
const isObj = (j) => j && typeof j === 'object' && !Array.isArray(j);
export const NAME_RE = /^[a-z][a-z0-9-]{1,39}$/;

export function musicDirs({ sharedDir, projectDir = null }) {
  return { shared: path.join(sharedDir, 'music'), project: projectDir ? path.join(projectDir, 'work', 'music') : null };
}

function readRegistry(dir) {
  const f = path.join(dir, MUSIC_FILE);
  if (!fs.existsSync(f)) return {};
  try { const j = JSON.parse(fs.readFileSync(f, 'utf8')); return isObj(j) ? j : {}; } catch { return {}; }
}

export function loadMusic({ sharedDir, projectDir = null }) {
  const d = musicDirs({ sharedDir, projectDir });
  const out = {};
  for (const [scope, dir] of [['shared', d.shared], ['project', d.project]]) {
    if (!dir) continue;
    for (const [name, e] of Object.entries(readRegistry(dir))) {
      if (!isObj(e) || !NAME_RE.test(name)) continue;
      out[name] = { fadeIn: 3, fadeOut: 2, volume: +dB(OUTRO_DB - (LIB_LUFS - LOUD.I)).toFixed(3), targetDb: OUTRO_DB, ...e, kind: 'bgm', file: path.join(dir, `${name}.wav`), scope };
    }
  }
  return out;
}

export function registerTrack(dir, name, entry) {
  if (!NAME_RE.test(name)) throw new Error(`曲名「${name}」要是小寫英文開頭、只用小寫英數和 -（2–40 個字）→ 例 bed-calm-tech`);
  const reg = readRegistry(dir);
  if (reg[name]) throw new Error(`曲庫已經有「${name}」→ 換一個曲名（已經有的不覆寫）`);
  fs.mkdirSync(dir, { recursive: true });
  reg[name] = entry;
  fs.writeFileSync(path.join(dir, MUSIC_FILE), `${JSON.stringify(reg, null, 2)}\n`);
  return path.join(dir, MUSIC_FILE);
}

// 量整體響度（LUFS）；量不到（全靜音）回 null
export function measureLufs(file) {
  const r = run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vn', '-af', 'ebur128=framelog=quiet', '-f', 'null', '-']);
  const m = String(r.stderr).match(/Integrated loudness:\s*\n\s*I:\s*(-?[\d.]+) LUFS/);
  return m ? Number(m[1]) : null;
}

export function normalizeTrack(src, dst, { lufs = LIB_LUFS } = {}) {
  const tmp = `${dst}.tmp.wav`;
  // 去頭尾靜音（−50 dB 以下），頭尾各留 20 ms 淡化避免喀一聲
  const trim = 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02,areverse';
  let r = run('ffmpeg', ['-y', '-v', 'error', '-i', src, '-vn', '-af', trim, '-ac', '2', '-ar', String(RATE), '-c:a', 'pcm_s16le', tmp]);
  if (r.status !== 0) throw new Error(`ffmpeg 讀不了 ${src}：${String(r.stderr).trim().slice(-200)} → 確認它是聲音檔（wav、mp3、flac）`);
  const before = measureLufs(tmp);
  if (before == null) { fs.rmSync(tmp, { force: true }); throw new Error(`${src} 聽起來是靜音，量不到響度 → 換一首`); }
  const dur0 = probeDuration(tmp);
  const g = lufs - before;
  r = run('ffmpeg', ['-y', '-v', 'error', '-i', tmp, '-af', `volume=${g.toFixed(2)}dB,alimiter=limit=${dB(-2).toFixed(3)}:level=false,afade=t=in:st=0:d=0.02,afade=t=out:st=${r3(Math.max(0, dur0 - 0.02))}:d=0.02`, '-ac', '2', '-ar', String(RATE), '-c:a', 'pcm_s16le', dst]);
  fs.rmSync(tmp, { force: true });
  if (r.status !== 0) throw new Error(`ffmpeg 調響度失敗：${String(r.stderr).trim().slice(-200)}`);
  return { dur: r3(probeDuration(dst)), lufs: measureLufs(dst) };
}

// 底樂鋪到哪：片頭到片尾（outDur＝含片尾卡的總長）；有片尾配樂就在它起播的地方淡出（兩首不疊在一起）
export function bedPlan(bed, { outDur, outroAt = null }) {
  if (!bed?.music) return null;
  const end = outroAt != null && outroAt > 0 ? Math.min(outDur, outroAt + BED.fadeOut) : outDur;
  const dur = r3(end);
  if (!(dur > 1)) return null;
  return { at: 0, dur, fadeIn: r3(Math.min(BED.fadeIn, dur / 3)), fadeOut: r3(Math.min(BED.fadeOut, dur / 3)) };
}

// src：曲庫的 wav（LIB_LUFS）；gainDb：沒人講話時的音量（套在曲庫檔上的 dB）；key：主軌（有人聲）的檔，給了就照人聲壓低 lift dB，沒給＝整段固定音量
export function renderBedClip(src, dstDir, { dur, gainDb, lift = BED.lift, key = null, fadeIn = BED.fadeIn, fadeOut = BED.fadeOut, cross = BED.cross } = {}) {
  if (!(dur > 0)) throw new Error(`renderBedClip：dur 要是正數，現在是 ${dur}`);
  const st = fs.statSync(src), len = probeDuration(src);
  if (!(len >= BED.minLen)) throw new Error(`${path.basename(src)} 只有 ${r3(len)} 秒，當底樂至少要 ${BED.minLen} 秒 → 換一首長一點的`);
  const ks = key && fs.existsSync(key) ? fs.statSync(key) : null;
  const p = { v: 2, dur: r3(dur), gainDb: +Number(gainDb).toFixed(2), lift: ks ? lift : 0, fadeIn: r3(fadeIn), fadeOut: r3(fadeOut), cross,
    src: [path.basename(src), st.size, Math.round(st.mtimeMs)], key: ks ? [ks.size, Math.round(ks.mtimeMs)] : null };
  const h = createHash('sha1').update(JSON.stringify(p)).digest('hex').slice(0, 12);
  const file = path.join(dstDir, `bed-${path.basename(src, path.extname(src))}-${h}.wav`);
  if (fs.existsSync(file)) return { file, dur: p.dur, ducked: !!ks };
  fs.mkdirSync(dstDir, { recursive: true });
  const fc = [];
  let cur = '[0:a]';
  if (len < dur + 0.5) {
    // 無縫循環的一圈＝「尾巴交叉淡化進開頭」＋中段；一圈接一圈時，中段的結尾剛好接上尾巴
    const x = Math.min(cross, len / 4), unit = Math.round((len - x) * RATE);
    fc.push(`[0:a]aresample=${RATE},asplit=3[a][b][c]`,
      `[a]atrim=start=${r3(len - x)}:end=${r3(len)},asetpts=PTS-STARTPTS[tail]`, `[b]atrim=start=0:end=${r3(x)},asetpts=PTS-STARTPTS[head]`,
      `[c]atrim=start=${r3(x)}:end=${r3(len - x)},asetpts=PTS-STARTPTS[body]`,
      `[tail][head]acrossfade=d=${r3(x)}:c1=tri:c2=tri[x]`, `[x][body]concat=n=2:v=0:a=1[unit]`, `[unit]aloop=loop=-1:size=${unit}[loop]`);
    cur = '[loop]';
  }
  // 先放在沒人講話時的音量（曲庫檔＋gainDb）；有 key 時人聲一出現就壓低 lift dB，沒有 key＝整段固定音量
  fc.push(`${cur}atrim=duration=${p.dur},asetpts=PTS-STARTPTS,volume=${p.gainDb.toFixed(2)}dB[lvl]`);
  cur = '[lvl]';
  const args = ['-y', '-v', 'error', '-i', src];
  if (ks) {
    args.push('-i', key);
    // 壓縮器用人聲當 key：門檻 −36 dB、壓縮比 1.32。主軌的人聲已經調到 −14 LUFS（講話時 RMS 約 −18 dB），高出門檻約 18 dB → 壓掉約 6 dB（＝lift）；
    // 30 ms 壓下去、600 ms 慢慢回來（句子之間的短停頓不會忽大忽小）。講得大聲壓多一點、小聲壓少一點
    // apad：主軌比底樂短（片尾卡接在影片後面，033）時補靜音到同長，後面沒人講話＝回升 lift dB
    fc.push(`[1:a]aresample=${RATE},apad=whole_dur=${p.dur},atrim=duration=${p.dur},asetpts=PTS-STARTPTS[k]`,
      `[lvl][k]sidechaincompress=threshold=${dB(-36).toFixed(4)}:ratio=${DUCK_RATIO}:attack=30:release=600:makeup=1:detection=rms[duck0]`);
    cur = '[duck0]';
  }
  // 限幅：調大（最多 +6）時曲庫檔的 true peak（≤ −2）會超過；4 倍取樣後限在 BED.tp − 0.5，輸出的 true peak ≤ BED.tp（沒超過的地方不動）
  const tail = [`aresample=${RATE * 4}`, `alimiter=limit=${dB(BED.tp - 0.5).toFixed(4)}:attack=5:release=50:level=0:latency=1`];
  if (p.fadeIn > 0) tail.push(`afade=t=in:st=0:d=${p.fadeIn}`);
  if (p.fadeOut > 0) tail.push(`afade=t=out:st=${r3(Math.max(0, p.dur - p.fadeOut))}:d=${p.fadeOut}`);
  tail.push(`aresample=${RATE}`);
  fc.push(`${cur}${tail.join(',')}[out]`);
  args.push('-filter_complex', fc.join(';'), '-map', '[out]', '-ac', '2', '-ar', String(RATE), '-c:a', 'pcm_s16le', file);
  const r = run('ffmpeg', args);
  if (r.status !== 0) { fs.rmSync(file, { force: true }); throw new Error(`ffmpeg 產生底樂失敗：${String(r.stderr).trim().slice(-300)}`); }
  return { file, dur: p.dur, ducked: !!ks };
}

const fmtDb = (d) => `${d > 0 ? '+' : d < 0 ? '−' : ''}${String(+Math.abs(d).toFixed(1))} dB`;
export function bedLine(bed, clip, { ducked = true } = {}) {
  if (!bed) return '底樂：沒配（選用；要整支片墊音樂就在 plan.json 第一層寫 "bed": { "music": "<曲名>" }，曲名用 node shared/template/tools/music.mjs list 看）';
  if (!bed.music) return '底樂：這一集不配（plan.json 的 bed.music 寫了 null）';
  if (bed.muted) return `底樂：${bed.music} 靜音（bed.volume ${fmtDb(bed.volume)}＝靜音），完成影片不放；要放回來：剪輯台背景音樂軌的 🔇，或 --set bed.volume=0`;
  if (!clip) return `底樂：${bed.music} 沒放（影片太短）`;
  const mm = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const v = bed.volume ?? 0, rel = bed.relDb;
  const vsVoice = Math.abs(rel) < 0.5 ? '約和人聲一樣大' : `約比人聲${rel > 0 ? '大' : '小'} ${String(+Math.abs(rel).toFixed(1))} dB`;
  const vol = v ? `音量 ${fmtDb(v)}（${vsVoice}）` : `音量 0 dB（原本的音量，${vsVoice}）`;
  return `底樂：${bed.music}${bed.from === 'plan.json' ? '' : `（${bed.from}）`} 鋪 0:00–${mm(clip.dur)}，${vol}，${ducked ? `講話時壓低 ${BED.lift} dB` : '整段固定音量（這一集有剪輯台的剪段）'}，淡入 ${clip.fadeIn} 秒、淡出 ${clip.fadeOut} 秒`;
}

// 講話時壓低的區間（rough.mp4 秒數）：第一句字幕開頭到最後一句結尾，扣掉至少 BED.liftGap 秒的停頓
// （pauses＝build 量的說話停頓 cues.pauses；量不到就用字幕之間的空檔）
export function bedDucks(cues = [], pauses = null) {
  const list = (cues || []).filter((c) => Number.isFinite(c?.start) && Number.isFinite(c?.end) && c.end > c.start).sort((x, y) => x.start - y.start);
  if (!list.length) return [];
  const a = list[0].start, b = list.reduce((m, c) => Math.max(m, c.end), a);
  const gaps = (Array.isArray(pauses) ? pauses : list.slice(1).map((c, i) => [list[i].end, c.start]))
    .map(([x, y]) => [Math.max(a, x), Math.min(b, y)]).filter(([x, y]) => y - x >= BED.liftGap).sort((p, q) => p[0] - q[0]);
  const out = [];
  let t = a;
  for (const [x, y] of gaps) { if (x > t) out.push([r3(t), r3(x)]); t = Math.max(t, y); }
  if (b > t) out.push([r3(t), r3(b)]);
  return out;
}

// build --check --json 的 bed（057 剪輯台的背景音樂軌）：沒設定＝null；這一集不配＝{ music: null }；影片太短沒鋪＝{ …, short: true }；
// volume＝plan.json 的 bed.volume（0＝曲庫檔原本的音量）、relDb＝沒人講話時比人聲大幾 dB（負＝小）、muted＝靜音（volume 是最小值，完成影片不放；範圍照樣給，剪輯台畫暗的）；
// 有鋪＝start／end（rough.mp4 秒數，時間軸畫的範圍；片尾卡那段在 rough.mp4 外面）、outStart／outEnd（完成影片秒數）、fadeIn／fadeOut（秒）、
// ducked（講話時壓低；有剪輯台的剪段時整段固定音量＝false）、ducks（壓低的區間，rough.mp4 秒數）
export function bedJson(bed, clip, { tm = null, ducked = true, ducks = [] } = {}) {
  if (!bed) return null;
  if (!bed.music) return { music: null };
  const out = { music: bed.music, from: bed.from, volume: bed.volume ?? 0, relDb: bed.relDb, muted: !!bed.muted, ducked: !!(clip && ducked) };
  if (!clip) return { ...out, short: true };
  const back = (t, end) => (!tm || tm.identity ? r3(t) : end ? tm.unmapEnd(t) : tm.unmapStart(t));
  const outEnd = r3(clip.at + clip.dur);
  return { ...out, start: back(clip.at), end: back(Math.min(outEnd, tm?.outDur ?? outEnd), true), outStart: clip.at, outEnd, fadeIn: clip.fadeIn, fadeOut: clip.fadeOut, ducks: out.ducked ? ducks : [] };
}

// 上一次 build 做進 index.html 的底樂：{ v: 2, file（相對 work/hyperframes）, music, volume（做進 wav 的 bed.volume）, at, dur }（v：bed.volume 的刻度，057 第二輪改成 0＝原本的音量；舊的不算）；
// 這次沒配就刪掉（靜音不動它：取消靜音時快速試聽還有上一條可以播）。剪輯台拖音量時，即時試聽只補「現在」和這裡記的差（下次 build 重混之後差＝0，不會疊兩次）
const BED_INFO = path.join('.cache', 'bed.json'), BED_INFO_V = 2;
export function writeBedInfo(outDir, info) {
  const f = path.join(outDir, BED_INFO);
  if (!info) { fs.rmSync(f, { force: true }); return; }
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, `${JSON.stringify({ v: BED_INFO_V, ...info })}\n`);
}
export function readBedInfo(outDir) {
  try { const j = JSON.parse(fs.readFileSync(path.join(outDir, BED_INFO), 'utf8')); return isObj(j) && j.v === BED_INFO_V && typeof j.file === 'string' ? j : null; } catch { return null; }
}

// ---------- ACE-Step 1.5 ----------
export const ACE = { url: 'http://127.0.0.1:8001', steps: 8, poll: 3000 };

async function post(url, pathname, body, ms = 30000) {
  const r = await fetch(`${url}${pathname}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(ms) });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j) throw new Error(`ACE-Step ${pathname} 回 ${r.status}${j?.error ? `：${j.error}` : ''}`);
  return j;
}

export async function aceHealth(url = ACE.url) {
  try {
    const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(4000) });
    const j = await r.json();
    return j?.data?.status === 'ok' ? { ok: true, modelsReady: !!j.data.models_initialized, model: j.data.loaded_model || null } : { ok: false, why: `回應不對（${r.status}）` };
  } catch (e) { return { ok: false, why: e.cause?.code === 'ECONNREFUSED' || /fetch failed/.test(e.message) ? '連不上' : e.message }; }
}

// 一律純音樂；回傳每一首在伺服器上的下載路徑。onTick(秒數) 每次查進度時呼叫
export async function aceGenerate(url, { prompt, seconds = 60, n = 3, seed = null, steps = ACE.steps, timeout = 3600 }, onTick = null) {
  const body = { prompt, lyrics: '[Instrumental]', instrumental: true, audio_duration: seconds, batch_size: n, inference_steps: steps, thinking: false, audio_format: 'wav',
    use_random_seed: seed == null, ...(seed == null ? {} : { seed }) };
  const sub = await post(url, '/release_task', body);
  const id = sub?.data?.task_id;
  if (!id) throw new Error(`ACE-Step 沒有給 task_id：${JSON.stringify(sub).slice(0, 200)}`);
  const t0 = Date.now();
  for (;;) {
    await new Promise((res) => setTimeout(res, ACE.poll));
    const secs = Math.round((Date.now() - t0) / 1000);
    if (onTick) onTick(secs);
    if (secs > timeout) throw new Error(`ACE-Step 生成超過 ${timeout} 秒還沒好 → 看 ACE-Step 的視窗有沒有錯誤，或把長度調短再試`);
    const q = await post(url, '/query_result', { task_id_list: [id] });
    const d = Array.isArray(q?.data) ? q.data[0] : null;
    if (!d || d.status === 0) continue;
    let res = d.result;
    if (typeof res === 'string') { try { res = JSON.parse(res); } catch { res = []; } }
    const list = (Array.isArray(res) ? res : []).filter((x) => x && x.file);
    if (d.status === 2 || !list.length) throw new Error(`ACE-Step 生成失敗：${JSON.stringify(d).slice(0, 300)}`);
    return list.map((x) => ({ file: x.file, seed: x.seed_value ?? null, model: x.dit_model ?? null, secs }));
  }
}

export async function aceDownload(url, filePath, dst) {
  const u = /^https?:/.test(filePath) ? filePath : `${url}${filePath.startsWith('/') ? '' : '/v1/audio?path='}${filePath.startsWith('/') ? filePath : encodeURIComponent(filePath)}`;
  const r = await fetch(u, { signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error(`ACE-Step 下載 ${filePath} 回 ${r.status}`);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, Buffer.from(await r.arrayBuffer()));
  return dst;
}
