#!/usr/bin/env node
// 情境總覽示範片（作者維護用）：把 18 個字卡模板、40 張字卡動態、全部情境動畫模板排進同一個專案，
// 講稿照每個情境的範例內容寫，用 macOS 內建語音（say）合成旁白，講者畫面借 projects/example 的示範口播循環播放。
// 產出的是一個完整的專案（講稿.md、assets/camera、work/rough.mp4、rough.srt、plan.json），之後照一般指令 build、audit、deliver。
//
//   node dev/tools/showcase.mjs [--project projects/showcase] [--voice Meijia] [--rate 185] [--only scenes,fx,custom] [--pick x-wall,…] [--clean]
//
// 旁白是合成語音、嘴型對不上（畫面是另一段口播）：這支片是用來看「每個情境實際輸出長什麼樣」，不是成品示範。
// 講稿：字卡模板用 scene.json 的 sample.sub，字卡動態唸它的名稱，情境動畫在 dev/tools/showcase-lines.json（每句要有畫面綁定的詞）。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WS = path.resolve(HERE, '..', '..');
const TPL = path.join(WS, 'shared', 'template');
const SR = 48000;
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const PROJECT = path.resolve(WS, arg('project', 'projects/showcase'));
const VOICE = arg('voice', 'Meijia'), RATE = arg('rate', '185');
const ONLY = arg('only', 'scenes,fx,custom').split(',');
const PICK = arg('pick', '').split(',').filter(Boolean);   // 只排這幾支情境動畫（例 --only custom --pick x-wall,x-magazine）
const CLEAN = process.argv.includes('--clean');   // 乾淨版：講者畫面換成素色底、不放小視窗、沒有章節角標，給展示片切素材用；要講者的段（講者介紹、疊在講者上的情境動畫）不排
const fail = (m) => { console.error(`✖ ${m}`); process.exit(1); };
const r3 = (n) => Math.round(n * 1000) / 1000;
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const textW = (s) => [...s].reduce((n, ch) => n + (/[\u0000-ÿ]/.test(ch) ? 0.5 : 1), 0);

if (process.platform !== 'darwin') fail('這支工具用 macOS 內建的 say 合成旁白 → 在 Mac 上跑，或自己照 projects/showcase/講稿.md 錄音');
const EX = path.join(WS, 'projects', 'example');
const CAM = path.join(EX, 'assets', 'camera', '示範口播.mp4');
if (!fs.existsSync(CAM)) fail('找不到 projects/example/assets/camera/示範口播.mp4（講者畫面要借它）');

// ---------- 語音 ----------
const ttsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'showcase-tts-'));
let ttsN = 0;
const CACHE = path.join(os.tmpdir(), 'showcase-tts-cache');   // 同一句不重講（重跑快很多）
fs.mkdirSync(CACHE, { recursive: true });
function speak(text) {
  const key = path.join(CACHE, `${createHash('sha1').update(`${VOICE}:${RATE}:${text}`).digest('hex')}.pcm`);
  if (fs.existsSync(key)) { const b = fs.readFileSync(key); return new Int16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); }
  const out = speak0(text);
  fs.writeFileSync(key, Buffer.from(out.buffer, out.byteOffset, out.byteLength));
  return out;
}
function speak0(text) {
  const aiff = path.join(ttsDir, `${ttsN++}.aiff`);
  const say = text.replace(/[*「」]/g, '').replace(/NG/g, 'N G');
  let r = spawnSync('say', ['-v', VOICE, '-r', String(RATE), '-o', aiff, say], { encoding: 'utf8' });
  if (r.status !== 0) fail(`say 失敗：${r.stderr} → 跑 say -v '?' 看有沒有 ${VOICE}（系統設定 > 輔助使用 > 語音內容 可下載）`);
  r = spawnSync('ffmpeg', ['-v', 'error', '-i', aiff, '-af', 'silenceremove=start_periods=1:start_threshold=-50dB', '-f', 's16le', '-ar', String(SR), '-ac', '1', 'pipe:1'], { maxBuffer: 1 << 28 });
  if (r.status !== 0) fail(`ffmpeg 解碼失敗：${r.stderr}`);
  const pcm = new Int16Array(r.stdout.buffer.slice(r.stdout.byteOffset, r.stdout.byteOffset + r.stdout.length - (r.stdout.length % 2)));
  let end = pcm.length; while (end > 0 && Math.abs(pcm[end - 1]) < 200) end--;
  return pcm.subarray(0, Math.min(pcm.length, end + SR * 0.05));
}

// ---------- 排時間 ----------
const cues = [];        // { n, a, b, text, pcm }
const scenes = [];      // plan.json scenes
const sections = [];
const script = [];      // 講稿.md
const boards = [];      // storyboard.md（情境動畫的拍表）
let T = 1.0, NEXT = 1001, SEG = 0;
const segId = (p) => `${p}${String(++SEG).padStart(3, '0')}`;
// 放一句：start 不早於 T；slot＝這一句至少佔多久（字幕也顯示這麼久）
function put(text, { n = NEXT++, at = T, slot = 0 } = {}) {
  const pcm = speak(text), dur = pcm.length / SR, a = r3(Math.max(at, T)), b = r3(a + dur + 0.12);
  cues.push({ n, a, b, text, pcm });   // 字幕只到講完（工具照字幕長度估「講到那個詞」的時間）；段落要更長就用 to 的 +秒數
  const hold = r3(Math.max(0, slot - (b - a)));
  T = r3(b + hold + 0.12);
  return { n, a, b, dur, e: `#${n}e${hold > 0 ? `+${hold}` : ''}` };   // 字幕顯示時不帶句中標點（寫檔時去掉）
}
function chapter(num, title, sub, icon) {
  script.push('', `## ${title}`, '');
  const c = put(`第${'一二三'[num - 1]}部分，${title}`, { slot: 3.2 });
  script.push(`第${'一二三'[num - 1]}部分，${title}。`);
  T += 3.0;   // 章節幕放在停頓裡，不壓到人聲
  const n = put('我們一個一個看');
  script.push('我們一個一個看。');
  scenes.push({ id: segId('c'), scene: 'chapter', at: `#${n.n}`, slots: { num: String(num).padStart(2, '0'), title, sub, icon } });
  sections.push({ at: `#${n.n}`, name: title });
  T += 1.0;
  void c;
}

// 開場：講者介紹
script.push('# 情境總覽示範片', '', '> 由 dev/tools/showcase.mjs 產生：每一段對到一個情境。旁白是合成語音。', '');
{
  const c = put('嗨，大家好'), c2 = put('這支影片會把每一種情境都跑一遍', { slot: 4 });
  script.push('嗨，大家好，這支影片會把每一種情境都跑一遍。');
  if (!CLEAN) scenes.push({ id: segId('s'), scene: 'speaker', from: `#${c.n}`, to: c2.e, slots: readJson(path.join(TPL, 'scenes', '14-speaker', 'scene.json')).sample.slots });
  T += 0.4;
}

if (ONLY.includes('scenes')) {
  chapter(1, '字卡模板', '十八種版面', 'layout-template');
  // 範例台詞沒有先講到卡上標題的幾張：旁白改成從標題的字開始（不然字卡比講到的詞早出現，--check 會擋）
  const SUB = { 'side-panel': 'AI 照規則剪，我只負責把關', tips: '文字寫錯，先用 Plan 模式就好改', summary: '把剪輯習慣寫成文件，AI 每一集都照著做', 'title-list': '三道關卡，每一關都要看過' };
  for (const d of fs.readdirSync(path.join(TPL, 'scenes')).sort()) {
    const sc = readJson(path.join(TPL, 'scenes', d, 'scene.json'));
    if (['chapter', 'speaker', 'chapter-tag'].includes(sc.key)) continue;   // 章節、講者介紹、角標在這支片裡本來就有用到
    const a = put(`${sc.zh}`);
    T += 0.9;   // 先唸名稱（看得到講者），字卡跟著範例那一句出現
    const sub = SUB[sc.key] || sc.sample.sub;
    const b = put(sub.replace(/[：:]/g, '，'), { slot: sc.duration.default || 5 });
    script.push(`### ${String(sc.no).padStart(2, '0')} ${sc.zh}`, '', `${sc.zh}。`, `${sub}。`, '');
    scenes.push({ id: segId('s'), scene: sc.key, from: `#${b.n}`, to: b.e, slots: sc.sample.slots });
    T += 1.0;
    void a;
  }
}

if (ONLY.includes('fx')) {
  chapter(2, '字卡動態', '四十種文字動畫', 'type');
  const fx = readJson(path.join(TPL, 'fx', 'catalog.json')).effects;
  const FXV = { '05': { items: '動態|堆疊' }, 14: { text: '跑馬看板', items: '限時|公告|促銷|快訊' }, 23: { text: '文字方塊', items: '快|穩|省|簡單' }, 29: { label: '數字計數', number: '29', unit: '支' } };
  for (const f of fx) {
    const c = put(`${f.zh}`, { slot: 4.6 });
    script.push(`### 字卡動態 ${f.id} ${f.zh}`, '', `${f.zh}。`, '');
    scenes.push({ id: segId('f'), type: 'fx', fx: Number(f.id), from: `#${c.n}`, to: c.e, vars: FXV[f.id] || { text: f.zh } });
    T += 1.0;
  }
}

if (ONLY.includes('custom')) {
  chapter(3, '情境動畫', '照內容填資料的動畫模板', 'clapperboard');
  const LINES = readJson(path.join(HERE, 'showcase-lines.json'));
  const comps = path.join(PROJECT, 'work', 'hyperframes', 'compositions');
  fs.mkdirSync(comps, { recursive: true });
  for (const f of fs.readdirSync(path.join(TPL, 'custom')).filter((x) => /^x-.*\.html$/.test(x)).sort()) {
    const name = f.slice(0, -5), html = fs.readFileSync(path.join(TPL, 'custom', f), 'utf8');
    if (PICK.length && !PICK.includes(name)) continue;
    const sample = JSON.parse(html.match(/data-cues-sample='([^']+)'/)[1]);
    const title = (html.match(/<title>\s*x-[\w-]+\s+([^<]+?)\s*<\/title>/) || [])[1] || name;
    const nums = Object.keys(sample.cues).map(Number).sort((a, b) => a - b);
    const lines = LINES[name];
    if (!lines || lines.length !== nums.length + 1) fail(`showcase-lines.json 的 ${name} 要有 ${nums.length + 1} 句（1 句開場＋${nums.length} 句綁句），現在 ${lines ? lines.length : 0} 句`);
    const wordOf = {};
    for (const ref of Object.keys(sample.refs || {})) { const m = ref.match(/^#(\d+)@(.+)$/); if (m) wordOf[m[1]] = { word: m[2], t: sample.refs[ref] }; }
    for (const [i, n] of nums.entries()) if (wordOf[n] && !lines[i + 1].includes(wordOf[n].word)) fail(`${name} 第 ${i + 2} 句「${lines[i + 1]}」要有「${wordOf[n].word}」（畫面綁這個詞）`);
    script.push(`### ${name} ${title}`, '', ...lines.map((l) => `${l}。`), '');
    // 段起點 S：開場句講完剛好接到範例第一句的時間
    const open = nums[0] - 1, o = put(lines[0], { n: open });
    let S = r3(Math.max(o.a, o.b + 0.1 - sample.cues[nums[0]][0]));
    for (const [i, n] of nums.entries()) {
      const text = lines[i + 1], w = wordOf[n];
      const pcm = speak(text), dur = pcm.length / SR;
      let a = Math.max(T, S + sample.cues[n][0]);
      if (w) a = Math.max(a, S + w.t - textW(text.slice(0, text.indexOf(w.word))) / textW(text) * (dur + 0.12));   // 詞落在範例的時間之後（不早於【D 下限】）
      a = r3(a);
      S = r3(Math.max(S, a - sample.cues[n][0]));   // 這一句比範例晚，後面整組跟著往後（拍和拍之間的間隔不縮短）
      const b = r3(i === nums.length - 1 ? Math.max(a + dur + 0.12, S + sample.D) : a + dur + 0.12);
      cues.push({ n, a, b, text, pcm });
      T = r3(b + 0.1);
    }
    fs.copyFileSync(path.join(TPL, 'custom', f), path.join(comps, f));
    const fill = fs.existsSync(path.join(TPL, 'custom', `${name}.fill.json`)) ? readJson(path.join(TPL, 'custom', `${name}.fill.json`)) : {};
    const id = segId('x');
    const overlay = fill.layout === 'overlay' || /data-layout="overlay"/.test(html);
    if (CLEAN && overlay) { fs.rmSync(path.join(comps, f), { force: true }); T += 1.1; continue; }
    const seg = { id, type: 'custom', src: `compositions/${f}`, layout: fill.layout === 'overlay' || /data-layout="overlay"/.test(html) ? 'overlay' : 'fullscreen', from: `#${open}`, to: `#${nums[nums.length - 1]}e` };
    if (name === 'x-ui-mock') seg.clicks = ['#73@匯出'];
    scenes.push(seg);
    const code = html.slice(html.lastIndexOf('<script>'));
    const rows = [...code.matchAll(/\bP\.at\(\s*'([^']+)'\s*(?:,\s*(-?[\d.]+)\s*)?\)/g)].map((m, k) => `| ${k + 1} | \`${m[1]}\`${m[2] && Number(m[2]) ? (Number(m[2]) > 0 ? `＋${m[2]}` : `−${-Number(m[2])}`) : ''} | 範例 | — | — | — |`);
    boards.push(`#### 動畫分鏡 ${id}\n\n| 拍 | 講到（綁句） | 畫面上出現什麼 | 動態（設計系統語彙） | 焦點 | 音效拍點 |\n|---|---|---|---|---|---|\n${rows.join('\n')}\n`);
    T += 1.1;
  }
}

// 結尾金句
{
  const a = put('以上就是全部的情境');
  T += 0.9;
  const b = put('把解決問題的經驗變成可以重複使用的資產', { slot: 5 }), b0 = b;
  script.push('', '## 結尾', '', '以上就是全部的情境。', '把解決問題的經驗，變成可以重複使用的資產。');
  scenes.push({ id: segId('s'), scene: 'quote', from: `#${b0.n}`, to: b.e, slots: { text: '把解決問題的經驗//變成可以重複使用的資產' } });
  void a;
}
const DUR = Math.ceil(T + 1.5);

// ---------- 寫檔 ----------
for (const d of ['assets/camera', 'assets/voice', 'assets/screen', 'assets/images', 'work/hyperframes/compositions', 'output']) fs.mkdirSync(path.join(PROJECT, d), { recursive: true });
const mix = new Int16Array(DUR * SR);
for (const c of cues) mix.set(c.pcm.subarray(0, Math.max(0, mix.length - Math.round(c.a * SR))), Math.round(c.a * SR));
const wav = Buffer.alloc(44 + mix.length * 2);
wav.write('RIFF', 0); wav.writeUInt32LE(36 + mix.length * 2, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(mix.length * 2, 40);
Buffer.from(mix.buffer).copy(wav, 44);
const voice = path.join(ttsDir, 'voice.wav');
fs.writeFileSync(voice, wav);
const cam = path.join(PROJECT, 'assets', 'camera', 'showcase.mp4');
const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...(CLEAN ? ['-f', 'lavfi', '-i', 'color=c=0x232838:s=1920x1080:r=30'] : ['-stream_loop', '-1', '-i', CAM]), '-i', voice, '-map', '0:v:0', '-map', '1:a:0', '-t', String(DUR), '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', cam], { encoding: 'utf8' });
if (r.status !== 0) fail(`ffmpeg 合成講者影片失敗：${r.stderr}`);
fs.copyFileSync(cam, path.join(PROJECT, 'work', 'rough.mp4'));
fs.rmSync(ttsDir, { recursive: true, force: true });

const stamp = (t) => { const ms = Math.round(t * 1000), q = (n, w = 2) => String(n).padStart(w, '0'); return `${q(Math.floor(ms / 3600000))}:${q(Math.floor(ms / 60000) % 60)}:${q(Math.floor(ms / 1000) % 60)},${q(ms % 1000, 3)}`; };
cues.sort((x, y) => x.a - y.a);
fs.writeFileSync(path.join(PROJECT, 'work', 'rough.srt'), cues.map((c) => `${c.n}\n${stamp(c.a)} --> ${stamp(c.b)}\n${c.text.replace(/[，。；：]/g, ' ')}\n`).join('\n'));
fs.writeFileSync(path.join(PROJECT, 'work', 'cutpoints.json'), JSON.stringify({ cuts: [] }, null, 2));
fs.writeFileSync(path.join(PROJECT, 'work', 'storyboard.md'), boards.join('\n'));
fs.writeFileSync(path.join(PROJECT, '講稿.md'), script.join('\n') + '\n');
const ex = readJson(path.join(EX, 'work', 'hyperframes', 'plan.json'));
fs.writeFileSync(path.join(PROJECT, 'work', 'hyperframes', 'plan.json'), JSON.stringify(CLEAN ? { version: 1, chapterBadge: false, scenes: scenes.map((x) => (x.layout === 'fullscreen' || /^fs-/.test(x.scene || '') ? { ...x, pip: false } : x)) } : { version: 1, frame: ex.frame, speakerBox: ex.speakerBox, sections, scenes }, null, 2));
const rel = path.relative(WS, PROJECT);
console.log(`✓ ${rel}：${scenes.length} 段、${cues.length} 句字幕、${Math.floor(DUR / 60)} 分 ${DUR % 60} 秒`);
console.log(`→ 下一步：\nnode shared/template/tools/build.mjs --project ${rel}\nnode shared/template/tools/audit.mjs --project ${rel}\nnode shared/template/tools/deliver.mjs --project ${rel}`);
