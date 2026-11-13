// 長片切直式短片（025）：從剪好的長片（work/rough.mp4＋work/rough.srt）列出可以單獨成片的候選段，選定後把那一段裁成 9:16、開成新專案。
// 新專案的 assets/camera/ 是直的影片，後面照一般的直式流程剪（剪乾淨 → 做出完成影片），所以橫拍的長片也能做直式短片。
//
//   shortCandidates(cues, { min, max, target, pause }) → [{ a, z, start, end, dur, first, last, flags }]
//       起點：前面有停頓（字幕空隙 ≥ pause 秒，或那裡是剪接點）而且不是連接詞開頭；終點：後面有停頓、長度最接近 target；
//       同一個起點只留一個；flags＝看得到的特徵（開頭是問句、有數字…），給 AI 照 references/shorts.md 的判準評分用
//   shortsMarkdown(list, { project }) → work/shorts.md 的內容（候選表）
//   cropFor({ width, height, speakerBox }) → { x, y, w, h }：來源畫面裡 9:16 的直條，水平置中在講者身上；已經是直的就不裁
//   pickRange(cues, spec) → { a, z, start, end }：spec 寫 "#12-#25"
//   makeShort({ project, name, range, root, log }) → 建 projects/<name>/（assets 四個資料夾、assets/camera/<name>.mp4、講稿.md）
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseSrt } from './srt.mjs';
import { probeMedia } from './ff.mjs';
import { next } from './say.mjs';
import { r3Round as r3 } from './time.mjs';

export const SHORTS = { min: 20, max: 75, target: 45, pause: 0.35, pad: 0.15, keep: 24 };
const clock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const CONNECT = /^(然後|接著|所以|因為|但是|不過|而且|另外|那|那麼|再來|最後|其次|因此|也就是|或者|或是|並且|這樣|這個|它|他|她)/;
const clean = (s) => String(s).replace(/\s+/g, ' ').trim();

function flagsOf(seg) {
  const text = seg.map((c) => c.text).join(''), first = clean(seg[0].text), last = clean(seg[seg.length - 1].text), out = [];
  if (/[？?]$|嗎$|呢$|什麼|為什麼|怎麼/.test(first)) out.push('開頭是問句');
  if (/\d|[一二三四五六七八九十百千萬]+(個|支|次|倍|分鐘|小時|天|年|步|種)/.test(first)) out.push('開頭有數字');
  if (/\d/.test(text)) out.push('有數字');
  if (/不是.*而是|其實|沒想到|結果/.test(text)) out.push('有轉折');
  if (/下一|等一下|待會|前面|剛剛|上一/.test(first)) out.push('⚠ 開頭提到前後文');
  if (/下一|等一下|待會|接下來/.test(last)) out.push('⚠ 結尾在預告下一段');
  return out;
}

// breaks＝原本有停頓的時間點（work/cutpoints.json 的剪接點：初剪把停頓剪掉了，字幕之間看不出空隙，剪接點就是停頓的位置）。
// 既沒有空隙也沒有剪接點的片：每一句的邊界都算（只靠「不是連接詞開頭」篩）
export function shortCandidates(cues, { min = SHORTS.min, max = SHORTS.max, target = SHORTS.target, pause = SHORTS.pause, keep = SHORTS.keep, breaks = [] } = {}) {
  const out = [];
  const near = (t) => breaks.some((b) => Math.abs(b - t) <= 0.3);
  const anyGap = cues.some((c, i) => i && c.start - cues[i - 1].end >= pause), free = !anyGap && !breaks.length;
  const gapBefore = (i) => (i === 0 || free || near(cues[i].start) ? Infinity : cues[i].start - cues[i - 1].end);
  const gapAfter = (i) => (i === cues.length - 1 || free || near(cues[i].end) ? Infinity : cues[i + 1].start - cues[i].end);
  for (let i = 0; i < cues.length; i++) {
    if (gapBefore(i) < pause || CONNECT.test(clean(cues[i].text))) continue;
    let best = -1;
    for (let j = i + 1; j < cues.length; j++) {
      const d = cues[j].end - cues[i].start;
      if (d > max) break;
      if (d < min || gapAfter(j) < pause) continue;
      if (best < 0 || Math.abs(d - target) < Math.abs(cues[best].end - cues[i].start - target)) best = j;
    }
    if (best < 0) continue;
    const seg = cues.slice(i, best + 1);
    out.push({ a: cues[i].n, z: cues[best].n, start: r3(cues[i].start), end: r3(cues[best].end), dur: r3(cues[best].end - cues[i].start), first: clean(cues[i].text), last: clean(cues[best].text), flags: flagsOf(seg) });
  }
  // 候選太多：照時間平均留 keep 個（每一段話題都留得到）；有 ⚠ 的排後面先被拿掉
  if (out.length <= keep) return out;
  const ok = out.filter((c) => !c.flags.some((f) => f.startsWith('⚠'))), pool = ok.length >= keep ? ok : out;
  const step = pool.length / keep;
  return Array.from({ length: keep }, (_, k) => pool[Math.floor(k * step)]);
}

export function shortsMarkdown(list, { project = '<專案>' } = {}) {
  const L = ['# 短片候選（media.mjs shorts 產生）', '',
    '每一列是一段可以單獨剪成直式短片的話（開頭和結尾都落在停頓上）。「評分」「理由」兩欄給 AI 照 auto-edit-longform 的 references/shorts.md 填；使用者看完說要哪幾段。', '',
    '| # | 句號 | 時間 | 長度 | 第一句 | 最後一句 | 看得到的特徵 | 評分 | 理由 |', '|---|---|---|---|---|---|---|---|---|'];
  list.forEach((c, i) => L.push(`| ${i + 1} | #${c.a}-#${c.z} | ${clock(c.start)}–${clock(c.end)} | ${Math.round(c.dur)} 秒 | ${c.first.slice(0, 22)} | ${c.last.slice(0, 22)} | ${c.flags.join('、') || '—'} |  |  |`));
  L.push('', '選定之後（句號照上表抄，名稱自己取）：', '', '```', `node shared/template/tools/media.mjs shorts --project ${project} --pick "#${list[0]?.a ?? 'N'}-#${list[0]?.z ?? 'M'}" --name <新專案名稱>`, '```', '');
  return L.join('\n');
}

export function pickRange(cues, spec) {
  const m = /^#?(\d+)\s*[-–~]\s*#?(\d+)e?$/.exec(String(spec ?? '').trim());
  if (!m) throw new Error(`--pick 要寫句號範圍，例 --pick "#12-#25"（現在是「${spec}」）`);
  const a = cues.find((c) => c.n === Number(m[1])), z = cues.find((c) => c.n === Number(m[2]));
  if (!a || !z || z.start < a.start) throw new Error(`字幕裡找不到 #${m[1]} 到 #${m[2]} 這一段 → 句號照 work/shorts.md 的表抄`);
  return { a: a.n, z: z.n, start: a.start, end: z.end };
}

// 9:16 的直條：高度用整個來源高度（解析度最高），寬＝高 × 9/16，水平中心放在講者身上
// speakerBox＝[x1, y1, x2, y2]，來源畫面換成 1920×1080 的座標（和 plan.json 的 frame 無關：frame 只是完成影片要不要放大）
export function cropFor({ width, height, speakerBox = null }) {
  if (width <= height) return null;   // 已經是直的
  const w = Math.round((height * 9) / 16 / 2) * 2;
  let cx = 0.5;
  if (speakerBox) {
    cx = (speakerBox[0] + speakerBox[2]) / 2 / 1920;
  }
  const x = Math.round(Math.min(Math.max(cx * width - w / 2, 0), width - w) / 2) * 2;
  return { x, y: 0, w, h: height };
}

export function makeShort({ project, name, range, root, log = console.log }) {
  if (!name || !/^[^\\/:*?"<>|\s.][^\\/:*?"<>|]*$/.test(name)) throw new Error(`--name 要寫新專案的資料夾名稱（不能有 / \\ : * ? " < > |），現在是「${name ?? ''}」`);
  const dst = path.join(root, 'projects', name);
  if (fs.existsSync(dst)) throw new Error(`projects/${name} 已經有了 → 換一個名稱（不會覆寫既有的專案）`);
  const rough = path.join(project, 'work', 'rough.mp4'), srt = path.join(project, 'work', 'rough.srt');
  if (!fs.existsSync(rough) || !fs.existsSync(srt)) throw new Error('這個專案還沒有 work/rough.mp4 和 work/rough.srt → 先「剪乾淨」，再切短片');
  const cues = parseSrt(fs.readFileSync(srt, 'utf8'));
  const r = pickRange(cues, range);
  const info = probeMedia(rough);
  let plan = null;
  try { plan = JSON.parse(fs.readFileSync(path.join(project, 'work', 'hyperframes', 'plan.json'), 'utf8')); } catch { plan = null; }
  const crop = cropFor({ width: info.width, height: info.height, speakerBox: plan?.speakerBox || null });
  const start = Math.max(0, r.start - SHORTS.pad), dur = r3(Math.min(info.duration, r.end + SHORTS.pad) - start);
  for (const d of ['assets/camera', 'assets/voice', 'assets/screen', 'assets/images']) fs.mkdirSync(path.join(dst, d), { recursive: true });
  const out = path.join(dst, 'assets', 'camera', `${name}.mp4`);
  // 裁成直條後放大到 1080×1920（來源不夠大時會偏軟）；聲音原樣重新編碼
  const vf = crop ? `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y},scale=1080:1920:flags=lanczos` : 'scale=1080:1920:force_original_aspect_ratio=decrease:flags=lanczos,pad=1080:1920:(ow-iw)/2:(oh-ih)/2';
  const ff = spawnSync('ffmpeg', ['-y', '-v', 'error', '-ss', String(r3(start)), '-i', rough, '-t', String(dur), '-vf', vf, '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', out], { encoding: 'utf8' });
  if (ff.status !== 0) { fs.rmSync(dst, { recursive: true, force: true }); throw new Error(`切不出這一段：${String(ff.stderr).trim().slice(-300)}`); }
  const lines = cues.filter((c) => c.start >= r.start - 1e-6 && c.end <= r.end + 1e-6).map((c) => clean(c.text));
  fs.writeFileSync(path.join(dst, '講稿.md'), `${lines.join('\n')}\n`);
  const soft = crop && crop.h < 1920 ? `來源高 ${info.height}，放大 ${(1920 / crop.h).toFixed(1)} 倍${1920 / crop.h > 1.9 ? '（會偏軟；有 4K 原檔的話用原檔重做比較清楚）' : ''}` : '來源已經是直的，沒有裁切';
  log(`✓ 短片專案：projects/${name}（#${r.a}–#${r.z}，${Math.round(dur)} 秒，${lines.length} 句；${crop ? `裁來源 x ${crop.x}–${crop.x + crop.w} 的直條，` : ''}${soft}）`);
  log(`→ assets/camera/${name}.mp4（1080×1920）、講稿.md（這一段的字幕，一行一句）`);
  // 「用 auto-edit-longform 剪 …」是給 AI 的說法、不是指令：寫進說明那一行（「→ 下一步」下面只放整行能跑的指令）
  for (const l of next(`請使用者看一眼講者有沒有在畫面中間；沒問題就照一般流程剪這個新專案（直式）：用 auto-edit-longform 剪 projects/${name}`)) log(l);
  return { dir: dst, file: out, range: r, crop, lines: lines.length };
}
