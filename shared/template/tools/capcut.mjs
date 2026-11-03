#!/usr/bin/env node
// 剪映素材：把成片拆成「主軌＋每段一支透明 MOV＋字幕 SRT」，放進 projects/<專案>/output/capcut/，在剪映（CapCut）照清單排回時間軸
//   build.mjs --capcut 產生合成（compositions/capcut-*.html、capcut.json、capcut.srt）→ 這支逐支 render、寫清單
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pathsFrom } from './build.mjs';
import { hfArgs } from './lib/hf.mjs';

const SELF = fileURLToPath(import.meta.url);
const HERE = path.dirname(SELF);
const HELP = `剪映素材（主軌＋每段一支透明 MOV＋字幕 SRT；要 Node 22、ffmpeg、HyperFrames）

  node shared/template/tools/capcut.mjs --project projects/<專案>               產生全部：output/capcut/ 的主軌.mp4、每段 .mov、字幕.srt、清單.md
  node shared/template/tools/capcut.mjs --project projects/<專案> --background  同上，改在背景跑（每段約 30 秒，整集常常超過 5 分鐘；進度用 status 看）
  node shared/template/tools/capcut.mjs status --project projects/<專案>        背景跑到哪一支、做完的有哪些
  node shared/template/tools/capcut.mjs --project projects/<專案> --dry-run     只產生合成和清單，不 render（先看會出幾支、多長）

選項：--only s05,s12（只做這幾段，不做主軌）、--no-main（不做主軌）、--force（已經做過、沒變的也重做）
每段 .mov 是 ProRes 4444（有透明通道，帶這段的音效）：疊加卡只有卡片；子母畫面、全幕、半畫面整格都有（含講者小窗）。
主軌.mp4 是講者畫面＋人聲＋片尾配樂（調光、瘦臉、影片編輯器的跳接放大與過黑都在裡面）；沒有字卡、字幕、段落音效。
字幕.srt 是成片畫面上實際顯示的字幕（剪映：文本 → 本地字幕 → 匯入）。章節角標不輸出（剪映用文字貼）。`;

const VALUE_FLAGS = ['project', 'only', 'template'];
const BOOL_FLAGS = ['background', 'dry-run', 'no-main', 'force', 'help'];

export function parseCapcutArgs(argv) {
  const flags = { cmd: 'run' };
  const rest = [...argv];
  if (rest[0] === 'status') { flags.cmd = 'status'; rest.shift(); }
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) throw new Error(`看不懂的參數「${a}」→ 看用法：node shared/template/tools/capcut.mjs --help`);
    const [k, inline] = a.slice(2).split('=');
    if (VALUE_FLAGS.includes(k)) {
      const v = inline ?? rest[++i];
      if (v == null) throw new Error(`--${k} 後面要接值 → 看用法：node shared/template/tools/capcut.mjs --help`);
      flags[k] = v;
    } else if (BOOL_FLAGS.includes(k)) flags[k] = true;
    else throw new Error(`沒有 --${k} 這個參數 → 看用法：node shared/template/tools/capcut.mjs --help`);
  }
  return flags;
}

// 0m31.68s：檔名裡的起點（剪映照這個時間放）
export const stampName = (t) => `${Math.floor(t / 60)}m${(t % 60).toFixed(2).padStart(5, '0')}s`;
export const mmss = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
export const segFile = (s, i) => `${String(i + 1).padStart(2, '0')}_${s.id}_${stampName(s.start)}.mov`;

const hashFile = (f) => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex').slice(0, 12);
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };

export function listMd(cc, { files, project }) {
  const L = [];
  L.push(`# 剪映素材清單（${project}）`, '');
  L.push(`成片長度 ${mmss(cc.duration)}，${cc.format === 'portrait' ? '直式 1080×1920' : '橫式 1920×1080'}、30fps。`, '');
  L.push('## 怎麼排', '');
  L.push('1. 新草稿的比例照上面的版式；把 `主軌.mp4` 拖到主軌道，從 0 秒開始。');
  L.push('2. 每支 `.mov` 拖到主軌道上面的畫中畫軌道，起點對齊下表的「放在」（檔名也寫了起點，例 `0m31.68s`＝0 分 31.68 秒）。');
  L.push('3. 文本 → 本地字幕 → 匯入 `字幕.srt`，再套你的字幕樣式。');
  L.push('4. `.mov` 有透明通道：疊加卡只有卡片；子母畫面、全幕、半畫面整格都有畫面（講者小窗在裡面），蓋住主軌是對的。每支都帶自己那段的音效，不要可以在剪映把那支的音量關掉。', '');
  L.push('## 檔案', '');
  L.push('| 檔名 | 放在 | 長度 | 版面 | 內容 | 音效 |');
  L.push('|---|---|---|---|---|---|');
  if (files.main) L.push(`| ${files.main} | 0:00.00 | ${mmss(cc.main.duration)} | 主軌 | 講者＋人聲＋片尾配樂 | — |`);
  for (const s of cc.segs) if (files[s.id]) L.push(`| ${files[s.id]} | ${mmss(s.start)} | ${s.duration.toFixed(2)} 秒 | ${s.layoutZh}${s.footage ? '（含講者）' : ''} | ${String(s.label).replace(/\|/g, '｜')} | ${s.sfx ? `${s.sfx} 顆` : '無'} |`);
  L.push('| 字幕.srt | 0:00.00 | — | 字幕 | 畫面上實際顯示的字幕 | — |', '');
  L.push('沒有輸出：章節角標（剪映用文字貼）。', '');
  return L.join('\n');
}

function render(hfDir, comp, out, args, logFd) {
  const r = spawnSync(process.execPath, hfArgs(['render', '-c', comp, ...args, '--quiet', '-o', out]), { cwd: hfDir, stdio: ['ignore', logFd, logFd] });
  return r.status === 0 && fs.existsSync(out);
}

function probe(f) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,pix_fmt', '-of', 'compact=p=0:nk=1', f], { encoding: 'utf8' });
  return String(r.stdout || '').trim().split('\n').filter(Boolean).join('；');
}

function statusCmd(dir, rel) {
  const st = readJson(path.join(dir, '.capcut-state.json'), null);
  if (!st) { console.log(`還沒跑過 → node shared/template/tools/capcut.mjs --project ${rel}`); return 0; }
  const alive = st.pid && (() => { try { process.kill(st.pid, 0); return true; } catch { return false; } })();
  console.log(`${st.done ? '✔ 做完了' : alive ? '🔄 進行中' : '✖ 中斷了'}：${st.made.length}／${st.total} 支${st.current ? `（現在：${st.current}）` : ''}${st.failed.length ? `；失敗 ${st.failed.join('、')}` : ''}`);
  if (st.done) console.log(`→ 清單：${rel}/output/capcut/清單.md`);
  else if (!alive) console.log(`→ 接著做（做過的會略過）：node shared/template/tools/capcut.mjs --project ${rel} --background`);
  else console.log(`log：${rel}/output/capcut/render.log（背景跑時另有 capcut.log）；30 秒後再跑一次 status`);
  return 0;
}

async function main() {
  const flags = parseCapcutArgs(process.argv.slice(2));
  if (flags.help) { console.log(HELP); return 0; }
  const P = pathsFrom(flags);
  const rel = path.relative(process.cwd(), P.project).split(path.sep).join('/') || '.';
  const dir = path.join(P.project, 'output', 'capcut');
  fs.mkdirSync(dir, { recursive: true });
  if (flags.cmd === 'status') return statusCmd(dir, rel);
  if (flags.background && !process.env.AUTO_EDIT_CAPCUT_CHILD) {
    const fd = fs.openSync(path.join(dir, 'capcut.log'), 'w');
    const child = spawn(process.execPath, [SELF, ...process.argv.slice(2).filter((a) => a !== '--background')], { cwd: process.cwd(), detached: true, stdio: ['ignore', fd, fd], windowsHide: true, env: { ...process.env, AUTO_EDIT_CAPCUT_CHILD: '1' } });
    child.unref();
    console.log(`在背景做剪映素材（pid ${child.pid}），log：${rel}/output/capcut/capcut.log`);
    console.log('→ 下一步：30 秒後看進度');
    console.log(`node shared/template/tools/capcut.mjs status --project ${rel}`);
    return 0;
  }

  // 1. build --capcut（失敗就停：plan.json 有 ✖）
  console.log('產生剪映素材的合成（build.mjs --capcut）…');
  const b = spawnSync(process.execPath, [path.join(HERE, 'build.mjs'), '--project', P.project, '--capcut', ...(flags.template ? ['--template', flags.template] : [])], { encoding: 'utf8' });
  const blines = String(b.stdout || '').split('\n');
  for (const l of blines) if (/^(✖|產生：|風格包：|主題：)/.test(l)) console.log(`  ${l}`);
  if (b.status !== 0) { console.log(String(b.stderr || '').trim()); console.log('✖ build 沒過，沒有產生剪映素材 → 照上面 ✖ 的 → 改 plan.json，再跑一次這個指令'); return 1; }
  const cc = readJson(path.join(P.out, 'capcut.json'), null);
  if (!cc) { console.log('✖ build 沒有寫出 capcut.json → 回報這一行'); return 1; }

  const only = flags.only ? String(flags.only).split(/[,，]/).map((s) => s.trim()).filter(Boolean) : null;
  if (only) {
    const bad = only.filter((id) => !cc.segs.some((s) => s.id === id));
    if (bad.length) { console.log(`✖ --only 的 ${bad.join('、')} 不在這一集的段落裡 → 現有：${cc.segs.map((s) => s.id).join('、')}`); return 1; }
  }
  const jobs = [];
  const files = {};
  if (!only && !flags['no-main']) { jobs.push({ key: 'main', comp: cc.main.file, out: '主軌.mp4', args: ['--quality', 'standard'] }); files.main = '主軌.mp4'; }
  cc.segs.forEach((s, i) => {
    files[s.id] = segFile(s, i);
    if (!only || only.includes(s.id)) jobs.push({ key: s.id, comp: s.file, out: files[s.id], args: ['--format', 'mov'] });
  });
  // 字幕與清單（不用 render，先寫）
  fs.copyFileSync(path.join(P.out, 'capcut.srt'), path.join(dir, '字幕.srt'));
  const projName = path.basename(P.project);
  console.log(`段落 ${cc.segs.length} 支 MOV${files.main ? '＋主軌' : ''}；這次要做 ${jobs.length} 支`);
  if (flags['dry-run']) {
    fs.writeFileSync(path.join(dir, '清單.md'), listMd(cc, { files, project: projName }));
    for (const j of jobs) console.log(`  ${j.out}（${j.comp}）`);
    console.log(`→ 清單：${rel}/output/capcut/清單.md、字幕：${rel}/output/capcut/字幕.srt（--dry-run 沒有 render）`);
    return 0;
  }

  // 2. 逐支 render（合成沒變、檔還在就略過）
  const cacheFile = path.join(dir, '.capcut-cache.json');
  const cache = readJson(cacheFile, {});
  const stateFile = path.join(dir, '.capcut-state.json');
  const state = { pid: process.pid, total: jobs.length, made: [], skipped: [], failed: [], current: null, done: false };
  const save = () => fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n');
  const logFd = fs.openSync(path.join(dir, 'render.log'), 'a');
  const foot = path.join(P.out, 'assets', 'rough.mp4');
  const footStamp = fs.existsSync(foot) ? (({ size, mtimeMs }) => `${size}.${Math.round(mtimeMs)}`)(fs.statSync(foot)) : 'none';
  save();
  for (const [n, j] of jobs.entries()) {
    const out = path.join(dir, j.out);
    // 合成內容＋底片（調光、瘦臉重做時合成不變，底片會變）
    const h = `${hashFile(path.join(P.out, j.comp))}-${footStamp}`;
    if (!flags.force && cache[j.out] === h && fs.existsSync(out)) { state.skipped.push(j.out); state.made.push(j.out); save(); console.log(`  [${n + 1}/${jobs.length}] ${j.out} 沒變，略過`); continue; }
    state.current = j.out; save();
    const t = Date.now();
    const ok = render(P.out, j.comp, out, j.args, logFd);
    const sec = ((Date.now() - t) / 1000).toFixed(0);
    if (ok) { cache[j.out] = h; fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2) + '\n'); state.made.push(j.out); console.log(`  [${n + 1}/${jobs.length}] ✔ ${j.out}（${sec} 秒）`); }
    else { state.failed.push(j.out); console.log(`  [${n + 1}/${jobs.length}] ✖ ${j.out} render 失敗 → 看 ${rel}/output/capcut/render.log 最後幾行`); }
    save();
  }
  fs.closeSync(logFd);
  state.current = null; state.done = true; save();

  // 3. 清單＋驗證
  fs.writeFileSync(path.join(dir, '清單.md'), listMd(cc, { files, project: projName }));
  const first = jobs.find((j) => j.out.endsWith('.mov') && fs.existsSync(path.join(dir, j.out)));
  if (fs.existsSync(path.join(dir, '主軌.mp4'))) console.log(`驗證 主軌.mp4：${probe(path.join(dir, '主軌.mp4'))}`);
  if (first) console.log(`驗證 ${first.out}：${probe(path.join(dir, first.out))}（yuva＝有透明通道）`);
  console.log(`${state.failed.length ? `✖ ${state.failed.length} 支失敗：${state.failed.join('、')}` : `✔ ${state.made.length} 支都好了${state.skipped.length ? `（${state.skipped.length} 支沒變、略過）` : ''}`}`);
  console.log(`→ 清單：${rel}/output/capcut/清單.md（照「放在」排進剪映）、字幕：${rel}/output/capcut/字幕.srt`);
  return state.failed.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === SELF) {
  main().then((c) => { process.exitCode = c; }, (e) => { console.error(`✖ ${e.message}`); process.exitCode = 1; });
}
