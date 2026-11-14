// 截圖欄位（036）：情境動畫的 slot 可以是 "type": "shot"，值寫圖片檔或這一集某一段的 id，模板裡換成 <img>。
//
//   圖片檔   "assets/images/調光前.png"（也可以 assets/screen/ 底下的圖片）→ 縮到 1920×1080 以內
//   段 id    "s0106" → 那一段的完成態截圖：work/storyboard-preview/<段>.png（一段有好幾張取最後一張 <段>-N.png，分鏡表停點 ③ 時工具截好的）；
//            橫式切掉字幕帶（y 940 以下）再取 16:9 → 960×540。還沒截過 ⚠，先用一張空白圖
//   產生的檔一律是 work/hyperframes/assets/shots/<鍵>.jpg（鍵只看值，custom-fill 填模板時不用知道檔案在不在）
//
//   SHOT_DIR、isShotImage(v)、isShotSeg(v)、shotRel(v)  → 'assets/shots/<鍵>.jpg'
//   shotSlots(spec, slots)                           → [{ key: 'items[1].shot', value, from }]（規格裡 type shot 的欄位，清單逐項展開）
//   checkShots({ plan, lib, projectDir })            → { errors, warnings, jobs }：檔在不在、段 id 對不對（build、--check 共用，不跑 ffmpeg）
//   prepareShots({ jobs, out, log })                 → 這次做了幾張（ffmpeg；來源沒變就不重做，沒用到的舊檔刪掉）
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { run } from './ff.mjs';
import { readFillSpec } from './custom-fill.mjs';

export const SHOT_DIR = 'assets/shots';
const IMG_RE = /^assets\/(images|screen)\/.+\.(png|jpe?g|webp)$/i;
export const isShotImage = (v) => typeof v === 'string' && IMG_RE.test(v);
export const isShotSeg = (v) => typeof v === 'string' && /^[A-Za-z][\w-]*$/.test(v);
const slug = (s) => s.replace(/\.[^.]+$/, '').replace(/[^\w一-鿿-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'shot';
export function shotRel(v) {
  if (isShotSeg(v)) return `${SHOT_DIR}/seg-${v}.jpg`;
  const h = createHash('sha1').update(String(v)).digest('hex').slice(0, 8);
  return `${SHOT_DIR}/img-${slug(path.basename(String(v)))}-${h}.jpg`;
}

// 欄位說明（--list、--spec、草稿範本共用）
export const shotHint = (d) => (d?.from === 'segment' ? '截圖：前面某一段的 id（例 s0106）' : d?.from === 'image' ? '截圖：圖片檔 assets/images/… 或 assets/screen/…' : '截圖：前面某一段的 id 或圖片檔');
export const shotHolder = (d) => (d?.from === 'segment' ? '<前面某一段的 id，例 s0106>' : d?.from === 'image' ? '<圖片檔 assets/images/…>' : '<前面某一段的 id 或 assets/images/… 圖片檔>');

export function shotSlots(spec, slots) {
  const out = [];
  const s = slots && typeof slots === 'object' ? slots : {};
  for (const [k, d] of Object.entries(spec?.slots || {})) {
    if (d.type === 'shot' && s[k] != null && s[k] !== '') out.push({ key: k, value: s[k], from: d.from || 'any' });
    if (d.type === 'list' && Array.isArray(s[k])) {
      s[k].forEach((it, i) => {
        for (const [f, fd] of Object.entries(d.item || {})) if (fd.type === 'shot' && it?.[f] != null && it[f] !== '') out.push({ key: `${k}[${i + 1}].${f}`, value: it[f], from: fd.from || 'any' });
      });
    }
  }
  return out;
}

// 那一段的完成態截圖（分鏡表的截圖，最後一張）
function segPreview(projectDir, id) {
  const dir = path.join(projectDir, 'work', 'storyboard-preview');
  if (!fs.existsSync(dir)) return null;
  const one = path.join(dir, `${id}.png`);
  const many = fs.readdirSync(dir).map((f) => f.match(new RegExp(`^${id}-(\\d+)\\.png$`))).filter(Boolean).sort((a, b) => Number(a[1]) - Number(b[1]));
  if (many.length) return path.join(dir, many[many.length - 1][0]);
  return fs.existsSync(one) ? one : null;
}

export function checkShots({ plan, lib, projectDir }) {
  const errors = [], warnings = [], jobs = new Map();
  const segs = Array.isArray(plan?.scenes) ? plan.scenes : [];
  const order = new Map(segs.map((x, i) => [x?.id, i]));
  const portrait = plan?.format === 'portrait';
  for (const seg of segs) {
    if (!seg || seg.type !== 'custom' || !seg.template) continue;
    const spec = readFillSpec(lib.customDir, seg.template);
    for (const sh of shotSlots(spec, seg.slots)) {
      const where = `[${seg.id} custom ${seg.template}] slots.${sh.key}`;
      const v = sh.value;
      if (isShotImage(v)) {
        if (sh.from === 'segment') { errors.push(`${where}：要寫這一集前面某一段的 id（例 "s0106"），現在是圖片檔「${v}」→ 圖片要放就換 x-relay 或 x-slider`); continue; }
        const abs = projectDir ? path.join(projectDir, v) : null;
        if (abs && !fs.existsSync(abs)) { errors.push(`${where}：找不到 ${v} → 檔名照 work/media/index.md 寫（相對專案資料夾）`); continue; }
        if (abs) jobs.set(shotRel(v), { kind: 'image', src: abs, label: v });
      } else if (isShotSeg(v)) {
        if (sh.from === 'image') { errors.push(`${where}：要寫圖片檔（assets/images/…、assets/screen/… 的 .png .jpg .webp），現在是「${v}」`); continue; }
        if (!order.has(v)) { errors.push(`${where}：這一集沒有「${v}」這一段 → 寫前面某一段的 id`); continue; }
        if (v === seg.id || order.get(v) > order.get(seg.id)) { errors.push(`${where}：「${v}」不在這一段前面 → 只能放已經出現過的段`); continue; }
        const src = projectDir ? segPreview(projectDir, v) : null;
        if (projectDir && !src) warnings.push(`${where}：「${v}」還沒有截圖（work/storyboard-preview/${v}*.png），先放空白圖 → 跑 node shared/template/tools/qc.mjs storyboard --project <專案> 後重新 build`);
        if (projectDir) jobs.set(shotRel(v), { kind: 'segment', src, crop: !portrait, label: v });
      } else {
        errors.push(`${where}：寫圖片檔（assets/images/…、assets/screen/… 的 .png .jpg .webp）或這一集某一段的 id（例 "s0106"），現在是 ${JSON.stringify(v)}`);
      }
    }
  }
  return { errors, warnings, jobs };
}

const sig = (f) => { try { const st = fs.statSync(f); return `${st.size}:${Math.round(st.mtimeMs)}`; } catch { return null; } };

export function prepareShots({ jobs, out, log = () => {} }) {
  const dir = path.join(out, SHOT_DIR);
  const idxFile = path.join(dir, 'index.json');
  if (!jobs.size && !fs.existsSync(dir)) return 0;
  fs.mkdirSync(dir, { recursive: true });
  let idx = {};
  try { idx = JSON.parse(fs.readFileSync(idxFile, 'utf8')); } catch { idx = {}; }
  const next = {};
  let made = 0;
  for (const [rel, job] of jobs) {
    const name = path.basename(rel), dst = path.join(out, rel);
    const key = `${job.kind}|${job.src ?? 'blank'}|${job.src ? sig(job.src) : ''}|${job.crop ? 'crop' : ''}`;
    next[name] = { key };
    if (idx[name]?.key === key && fs.existsSync(dst)) continue;
    // 段的截圖：橫式切掉字幕帶（y 940 以下），中間取 16:9（1671×940）；圖片：縮到 1920×1080 以內，不放大
    const vf = !job.src ? null : job.kind === 'segment' ? (job.crop ? 'crop=1671:940:124:0,scale=960:540' : 'scale=960:-2') : "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease";
    const args = job.src ? ['-y', '-v', 'error', '-i', job.src, '-vf', vf, '-frames:v', '1', '-q:v', '3', dst]
      : ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=0xE8E2D8:s=960x540', '-frames:v', '1', '-q:v', '3', dst];
    const r = run('ffmpeg', args);
    if (r.status !== 0) throw new Error(`截圖 ${job.label} 轉不了：${String(r.stderr || '').trim().split('\n').pop()}`);
    log(`截圖 ${job.label} → ${rel}${job.src ? '' : '（還沒有截圖，先放空白）'}`);
    made++;
  }
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.jpg') && !next[f]) fs.rmSync(path.join(dir, f), { force: true });
  const text = JSON.stringify(next, null, 2) + '\n';
  if (!fs.existsSync(idxFile) || fs.readFileSync(idxFile, 'utf8') !== text) fs.writeFileSync(idxFile, text);   // 沒變不重寫（局部重算看檔案簽名）
  return made;
}
