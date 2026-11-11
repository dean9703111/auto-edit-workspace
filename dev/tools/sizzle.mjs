#!/usr/bin/env node
// 展示片（作者維護用）：把情境總覽的實際輸出剪成一支約 36 秒、資訊很密的短片。
// 素材來源（都是工具真的算出來的畫面，不是另外畫的）：
//   projects/showcase-clean/output/clean.mp4   dev/tools/showcase.mjs --clean 的整支輸出（沒有字幕、角標、小視窗）
//   projects/showcase/work/hyperframes/assets/matte/*.webm   正式流程做的講者去背層
//
//   node dev/tools/sizzle.mjs [--out projects/showcase-reel] [--mattes <去背三招片段的資料夾>] [--no-render]
//
// 結構：開場大字 → 字卡動態牆（4×4 同時播，三頁）＋講者去背站在前面 → 去背三招（--mattes 有給才有）→ 去背快切（講者不動，背後每 0.9 秒換一種情境）
//      → 情境動畫九宮格 → 結尾數字。配樂是 sizzle-music.mjs 合成的節拍，換頁都落在拍點上。
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeMusic } from './sizzle-music.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WS = path.resolve(HERE, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const OUT = path.resolve(WS, arg('out', 'projects/showcase-reel'));
const CLEAN = path.join(WS, 'projects', 'showcase-clean');
const SRC = path.join(CLEAN, 'output', 'clean.mp4');
const MATTE = path.join(WS, 'projects', 'showcase', 'work', 'hyperframes', 'assets', 'matte');
const fail = (m) => { console.error(`✖ ${m}`); process.exit(1); };
if (!fs.existsSync(SRC)) fail('還沒有 projects/showcase-clean/output/clean.mp4 → 先跑 node dev/tools/showcase.mjs --project projects/showcase-clean --clean，build --nocaps 後 render compositions/final-nocaps.html');
const r3 = (n) => Math.round(n * 1000) / 1000;
const ff = (args) => { const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...args], { encoding: 'utf8', maxBuffer: 1 << 26 }); if (r.status !== 0) fail(`ffmpeg：${String(r.stderr).slice(-400)}`); };

// ---------- 每一段在 clean.mp4 的時間 ----------
const srt = fs.readFileSync(path.join(CLEAN, 'work', 'rough.srt'), 'utf8'), T = {};
for (const m of srt.matchAll(/(\d+)\n(\d+):(\d+):(\d+),(\d+) --> (\d+):(\d+):(\d+),(\d+)/g)) { const g = m.slice(1).map(Number); T[g[0]] = [g[1] * 3600 + g[2] * 60 + g[3] + g[4] / 1000, g[5] * 3600 + g[6] * 60 + g[7] + g[8] / 1000]; }
const plan = JSON.parse(fs.readFileSync(path.join(CLEAN, 'work', 'hyperframes', 'plan.json'), 'utf8'));
const segs = plan.scenes.filter((s) => s.from).map((s) => {
  const a = T[Number(s.from.match(/#(\d+)/)[1])][0], m = s.to.match(/#(\d+)e(?:\+([\d.]+))?/), e = T[Number(m[1])][1] + Number(m[2] || 0);
  return { kind: s.type === 'fx' ? 'fx' : s.type === 'custom' ? 'custom' : 'scene', name: s.type === 'fx' ? `fx${s.fx}` : s.type === 'custom' ? path.basename(s.src, '.html') : s.scene, a, e };
});
const fx = segs.filter((s) => s.kind === 'fx'), custom = segs.filter((s) => s.kind === 'custom'), scene = segs.filter((s) => s.kind === 'scene' && s.name !== 'quote');
// 取哪一段：字卡動態從頭（動作在前面）；情境動畫取後半（東西都出來了、還在動）；字卡取中間
const pick = (s, d) => (s.kind === 'fx' ? s.a + 0.25 : s.kind === 'custom' ? Math.max(s.a + 0.6, Math.min(s.e - d - 1.2, s.a + (s.e - s.a) * 0.55)) : s.a + 0.9);

// ---------- 切素材 ----------
const A = path.join(OUT, 'assets');
fs.mkdirSync(A, { recursive: true });
function grid(file, list, cols, rows, dur) {
  const w = 1920 / cols, h = 1080 / rows, ins = [], f = [];
  list.forEach((s, i) => { ins.push('-ss', String(r3(pick(s, dur))), '-t', String(dur), '-i', SRC); f.push(`[${i}:v]scale=${w - 8}:${h - 8},pad=${w}:${h}:4:4:color=0x0b0d12,setsar=1[t${i}]`); });
  const layout = list.map((_, i) => `${(i % cols) * w}_${Math.floor(i / cols) * h}`).join('|');
  ff([...ins, '-filter_complex', `${f.join(';')};${list.map((_, i) => `[t${i}]`).join('')}xstack=inputs=${list.length}:layout=${layout}[v]`, '-map', '[v]', '-an', '-r', '30', '-c:v', 'libx264', '-preset', 'fast', '-crf', '17', '-pix_fmt', 'yuv420p', path.join(A, file)]);
}
const BEAT = 0.45;                                   // 133.3 BPM：每一次換頁都落在拍點上，配樂（sizzle-music.mjs）照同一個拍子
const FXD = BEAT * 8, MOD = BEAT * 5, RAP = BEAT * 2, MTD = BEAT * 4;
const fxPages = [fx.slice(0, 16), fx.slice(16, 32), [...fx.slice(32, 40), ...scene.slice(0, 8)]];
fxPages.forEach((p, i) => grid(`fx-${i + 1}.mp4`, p, 4, 4, FXD));
const RAPID = ['x-receipt', 'x-terminal', 'x-timeline', 'x-trend', 'x-ring', 'x-versus', 'x-folder', 'x-crowd', 'x-process-trace', 'x-news'].map((n) => custom.find((s) => s.name === n)).filter(Boolean);
RAPID.forEach((s, i) => ff(['-ss', String(r3(pick(s, RAP + 0.2))), '-t', String(RAP + 0.2), '-i', SRC, '-an', '-r', '30', '-c:v', 'libx264', '-preset', 'fast', '-crf', '17', '-pix_fmt', 'yuv420p', path.join(A, `rapid-${i + 1}.mp4`)]));
const rest = custom.filter((s) => !RAPID.includes(s));
const moPages = [0, 1, 2, 3].map((k) => rest.slice(k * 9, k * 9 + 9)).filter((p) => p.length === 9);
moPages.forEach((p, i) => grid(`mosaic-${i + 1}.mp4`, p, 3, 3, MOD));
// 去背三招（整面詞牆、雜誌封面、破框）：從含講者的示範專案另外算的片段（--mattes <資料夾>，裡面是 matte-wall.mp4 這類）
const MT_DIR = arg('mattes', null);
const MT = MT_DIR ? ['wall', 'magazine', 'breakout'].filter((n) => fs.existsSync(path.join(MT_DIR, `matte-${n}.mp4`))) : [];
const MT_FROM = { wall: 0.4, magazine: 2.6, breakout: 2.2 };
MT.forEach((n) => ff(['-ss', String(MT_FROM[n]), '-t', String(MTD + 0.1), '-i', path.join(MT_DIR, `matte-${n}.mp4`), '-an', '-r', '30', '-c:v', 'libx264', '-preset', 'fast', '-crf', '16', '-pix_fmt', 'yuv420p', path.join(A, `trick-${n}.mp4`)]));
const mattes = fs.existsSync(MATTE) ? fs.readdirSync(MATTE).filter((f) => f.endsWith('.webm')).sort() : [];
if (!mattes.length) fail('找不到講者去背層 → 先跑 node shared/template/tools/build.mjs --project projects/showcase（會做 x-wall、x-magazine、x-breakout 的去背層）');
mattes.forEach((f, i) => fs.copyFileSync(path.join(MATTE, f), path.join(A, `matte-${i + 1}.webm`)));
fs.mkdirSync(path.join(A, 'sfx'), { recursive: true });
for (const f of ['impact', 'impact-2', 'impact-3', 'ding', 'ding-2', 'ding-3', 'chapter', 'shine', 'success']) fs.copyFileSync(path.join(WS, 'shared', 'sfx', `${f}.wav`), path.join(A, 'sfx', `${f}.wav`));
fs.cpSync(path.join(WS, 'shared', 'template', 'kit'), path.join(OUT, 'kit'), { recursive: true, filter: (p) => !/illus-gallery|\/look(\/|$)/.test(p) });

// ---------- 時間表 ----------
const t0 = BEAT * 6;                              // 開場大字
const tFx = t0, tMt = r3(tFx + fxPages.length * FXD), tRap = r3(tMt + MT.length * MTD), tMo = r3(tRap + RAPID.length * RAP), tEnd = r3(tMo + moPages.length * MOD), DUR = r3(tEnd + 6.3);
let track = 1;
const vid = (id, src, at, dur, extra = '') => `    <video id="${id}" class="clip full" src="assets/${src}" data-start="${at}" data-duration="${dur}" data-media-start="0" data-track-index="${track++}" muted playsinline ${extra}></video>`;
const bg = [
  ...fxPages.map((_, i) => vid(`fx${i + 1}`, `fx-${i + 1}.mp4`, r3(tFx + i * FXD), FXD)),
  ...MT.map((n, i) => vid(`mt${i + 1}`, `trick-${n}.mp4`, r3(tMt + i * MTD), MTD)),
  ...RAPID.map((_, i) => vid(`rp${i + 1}`, `rapid-${i + 1}.mp4`, r3(tRap + i * RAP), RAP)),
  ...moPages.map((_, i) => vid(`mo${i + 1}`, `mosaic-${i + 1}.mp4`, r3(tMo + i * MOD), MOD)),
];
// 講者去背層：字卡動態牆和去背快切兩段都在；一支不夠長就接下一支
const sp = [];
{ let k = 0; for (const [from, to] of [[tFx, tMt], [tRap, tMo]]) { let t = from; while (t < to - 0.01) { const d = Math.min(9.5, r3(to - t)); sp.push(vid(`sp${k + 1}`, `matte-${(k % mattes.length) + 1}.webm`, r3(t), d)); t = r3(t + d); k++; } } }
const sfx = [];
const hit = (name, at, vol) => sfx.push(`  <audio id="a${sfx.length + 1}" src="assets/sfx/${name}.wav" data-start="${r3(Math.max(0, at))}" data-track-index="${track++}" data-volume="${vol}"></audio>`);
// 配樂自己有鼓和換段的 crash；音效只留換情境的提示音和結尾
RAPID.forEach((_, i) => i && hit(['ding', 'ding-2', 'ding-3'][i % 3], tRap + i * RAP - 0.01, 0.22));
makeMusic({ out: path.join(A, 'music.wav'), beat: BEAT, drop: t0, end: tEnd, total: DUR,
  sections: [{ at: tFx, level: 0.8 }, ...(MT.length ? [{ at: tMt, level: 1 }] : []), { at: tRap, level: 1.2 }, { at: tMo, level: 1.2 }] });
sfx.push(`  <audio id="music" src="assets/music.wav" data-start="0" data-duration="${DUR}" data-track-index="${track++}" data-volume="0.7"></audio>`);
hit('shine', tEnd + 0.1, 0.5);

const html = `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=1920, height=1080">
  <title>展示片</title>
  <script src="kit/gsap.min.js"></script>
  <link rel="stylesheet" href="kit/fonts.css">
  <link rel="stylesheet" href="kit/brand.css">
  <style>
    html, body { margin: 0; background: #0b0d12; }
    #reel { position: relative; width: 1920px; height: 1080px; overflow: hidden; background: #0b0d12; font-family: "Noto Sans TC", "Google Sans Flex", sans-serif; color: #fff; }
    .full { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; object-fit: cover; }
    #stage { position: absolute; inset: 0; transform-origin: 50% 50%; }
    #speaker { position: absolute; inset: 0; transform-origin: 50% 100%; filter: drop-shadow(0 0 0 #fff) drop-shadow(6px 0 0 #fff) drop-shadow(-6px 0 0 #fff) drop-shadow(0 -6px 0 #fff) drop-shadow(0 30px 60px rgba(0,0,0,.6)); }
    #dim { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 60%, rgba(11,13,18,.0) 30%, rgba(11,13,18,.55) 100%); }
    #flash { position: absolute; inset: 0; background: #fff; opacity: 0; }
    .big { position: absolute; left: 0; width: 1920px; text-align: center; font-weight: 900; line-height: 1; letter-spacing: -.02em; }
    #i1 { top: 300px; font-size: 200px; }
    #i2 { top: 540px; font-size: 240px; color: var(--brand); }
    .tag { position: absolute; left: 70px; bottom: 70px; display: flex; align-items: baseline; gap: 22px; padding: 18px 34px 22px; background: rgba(11,13,18,.88); border-left: 12px solid var(--brand); border-radius: 6px; opacity: 0; }
    .tag b { font-size: 150px; font-weight: 900; line-height: 1; color: var(--brand); font-variant-numeric: tabular-nums; font-family: "Google Sans Flex", "Noto Sans TC", sans-serif; }
    .tag span { font-size: 64px; font-weight: 900; }
    #end { position: absolute; inset: 0; background: #0b0d12; opacity: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 70px; }
    #nums { display: flex; gap: 110px; align-items: flex-end; }
    .num { text-align: center; }
    .num b { display: block; font-size: 260px; font-weight: 900; line-height: 1; color: var(--brand); font-variant-numeric: tabular-nums; font-family: "Google Sans Flex", "Noto Sans TC", sans-serif; }
    .num span { display: block; margin-top: 18px; font-size: 54px; font-weight: 800; }
    .x { font-size: 110px; font-weight: 300; color: #5a6072; padding-bottom: 110px; }
    #line { font-size: 84px; font-weight: 900; }
    #line em { font-style: normal; color: var(--brand-ink); background: var(--brand); padding: 0 .16em .04em; border-radius: .08em; }
  </style>
</head>
<body>
<div id="reel" data-composition-id="reel" data-start="0" data-duration="${DUR}" data-width="1920" data-height="1080" data-fps="30">
  <div id="stage">
${bg.join('\n')}
    <div id="dim"></div>
  </div>
  <div id="speaker">
${sp.join('\n')}
  </div>
  <div class="big" id="i1">一句話</div>
  <div class="big" id="i2">剪完一支片</div>
  <div class="tag" id="tg1"><b id="n1">0</b><span>張字卡動態</span></div>
  <div class="tag" id="tg2"><span>講者去背 ×</span><b style="font-size:110px">任何情境</b></div>
  <div class="tag" id="tg3"><b id="n3">0</b><span>支情境動畫</span></div>
  <div id="end">
    <div id="nums">
      <div class="num"><b id="e1">0</b><span>種字卡版面</span></div><div class="x">×</div>
      <div class="num"><b id="e2">0</b><span>張字卡動態</span></div><div class="x">×</div>
      <div class="num"><b id="e3">0</b><span>支情境動畫</span></div>
    </div>
    <div id="line">全部，<em>說一句話</em>就能用</div>
  </div>
  <div id="flash"></div>
${sfx.join('\n')}
</div>
<script>
(function () {
  window.__timelines = window.__timelines || {};
  const tl = gsap.timeline({ paused: true });
  const $ = (s) => document.querySelector(s);
  const count = (el, to, at, dur) => { const o = { v: 0 }; tl.to(o, { v: to, duration: dur, ease: 'power2.out', onUpdate: () => { $(el).textContent = Math.round(o.v); } }, at); };
  const punch = (at) => { tl.fromTo('#stage', { scale: 1.12 }, { scale: 1, duration: 0.5, ease: 'power3.out', immediateRender: false }, at); tl.fromTo('#flash', { opacity: 0.55 }, { opacity: 0, duration: 0.22, ease: 'power1.out', immediateRender: false }, at); };
  // 開場
  tl.fromTo('#i1', { scale: 2.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.32, ease: 'power4.out' }, 0.1);
  tl.fromTo('#i2', { scale: 2.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.32, ease: 'power4.out' }, 1.0);
  tl.to(['#i1', '#i2'], { scale: 6, opacity: 0, duration: 0.3, ease: 'power3.in' }, ${r3(t0 - 0.3)});
  // 字卡動態牆
  tl.set('#speaker', { opacity: 0, scale: 0.8, x: 0 }, 0);
  tl.to('#speaker', { opacity: 1, scale: 0.92, duration: 0.45, ease: 'back.out(1.6)' }, ${r3(tFx + 0.15)});
  ${fxPages.map((_, i) => `punch(${r3(tFx + i * FXD)});`).join(' ')}
  tl.to('#tg1', { opacity: 1, duration: 0.2 }, ${r3(tFx + 0.3)});
  tl.fromTo('#tg1', { x: -120 }, { x: 0, duration: 0.4, ease: 'power3.out' }, ${r3(tFx + 0.3)});
  count('#n1', 40, ${r3(tFx + 0.4)}, ${r3(fxPages.length * FXD - 2.6)});
  tl.to('#tg1', { opacity: 0, duration: 0.2 }, ${r3(tMt - 0.2)});
  // 去背三招：片段裡本來就有講者，疊上去的那一層先收起來
  ${MT.length ? `tl.to('#speaker', { opacity: 0, duration: 0.15 }, ${r3(tMt - 0.15)}); tl.to('#dim', { opacity: 0, duration: 0.15 }, ${r3(tMt - 0.15)}); tl.to('#dim', { opacity: 1, duration: 0.15 }, ${tRap}); tl.set('#speaker', { opacity: 1 }, ${tRap});` : ''}
  ${MT.map((_, i) => `punch(${r3(tMt + i * MTD)});`).join(' ')}
  // 去背快切：講者不動，背後換情境；講者左右各站一半時間
  tl.to('#speaker', { scale: 1.04, x: -360, duration: 0.45, ease: 'power3.inOut' }, ${r3(tRap - 0.1)});
  tl.to('#speaker', { x: 360, duration: 0.5, ease: 'power3.inOut' }, ${r3(tRap + RAPID.length * RAP / 2 - 0.25)});
  ${RAPID.map((_, i) => `tl.fromTo('#stage', { scale: 1.06 }, { scale: 1, duration: 0.35, ease: 'power2.out', immediateRender: false }, ${r3(tRap + i * RAP)});`).join(' ')}
  tl.to('#tg2', { opacity: 1, duration: 0.2 }, ${r3((MT.length ? tMt : tRap) + 0.2)});
  tl.to('#tg2', { opacity: 0, duration: 0.2 }, ${r3(tMo - 0.2)});
  tl.to('#speaker', { opacity: 0, scale: 1.3, duration: 0.25, ease: 'power2.in' }, ${r3(tMo - 0.25)});
  // 九宮格
  ${moPages.map((_, i) => `punch(${r3(tMo + i * MOD)});`).join(' ')}
  tl.to('#tg3', { opacity: 1, duration: 0.2 }, ${r3(tMo + 0.3)});
  tl.fromTo('#tg3', { x: -120 }, { x: 0, duration: 0.4, ease: 'power3.out' }, ${r3(tMo + 0.3)});
  count('#n3', 44, ${r3(tMo + 0.4)}, ${r3(moPages.length * MOD - 1.4)});
  tl.to('#tg3', { opacity: 0, duration: 0.2 }, ${r3(tEnd - 0.2)});
  // 結尾
  tl.to('#end', { opacity: 1, duration: 0.25 }, ${r3(tEnd - 0.1)});
  tl.fromTo('#flash', { opacity: 0.7 }, { opacity: 0, duration: 0.3, immediateRender: false }, ${tEnd});
  tl.fromTo('.num', { y: 80, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: 'back.out(1.5)', stagger: 0.18 }, ${r3(tEnd + 0.15)});
  tl.fromTo('.x', { opacity: 0 }, { opacity: 1, duration: 0.3, stagger: 0.18 }, ${r3(tEnd + 0.35)});
  count('#e1', 18, ${r3(tEnd + 0.2)}, 1.0); count('#e2', 40, ${r3(tEnd + 0.38)}, 1.0); count('#e3', 44, ${r3(tEnd + 0.56)}, 1.0);
  tl.fromTo('#line', { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out' }, ${r3(tEnd + 1.7)});
  tl.set({}, {}, ${DUR});
  window.__timelines['reel'] = tl;
})();
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(OUT, 'index.html'), html);
fs.writeFileSync(path.join(OUT, 'hyperframes.json'), fs.readFileSync(path.join(CLEAN, 'work', 'hyperframes', 'hyperframes.json')));
console.log(`✓ ${path.relative(WS, OUT)}：${DUR} 秒（字卡動態牆 ${fxPages.length} 頁、去背快切 ${RAPID.length} 種、九宮格 ${moPages.length} 頁）`);
if (process.argv.includes('--no-render')) process.exit(0);
const out = path.join(OUT, 'reel.mp4');
const r = spawnSync('npx', ['hyperframes', 'render', '-o', out], { cwd: OUT, stdio: 'inherit' });
if (r.status !== 0 || !fs.existsSync(out)) fail('render 失敗 → 看上面的訊息');
console.log(`✓ ${path.relative(WS, out)}`);
