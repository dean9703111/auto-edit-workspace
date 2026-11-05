import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { brandColors, rewriteBrandCss, drawPipFrame, drawPipFrameV } from '../../brand.mjs';
import { packDir, PACK_KIT, PACK_BG, templatePathOf } from '../../lib/styles.mjs';
import { appliedDesign } from '../../lib/project-design.mjs';
import { resolveFormat } from '../../lib/canvas.mjs';

export const KINDS = { fs: [1920, 1080], side: [960, 1080], ch: [1920, 1080] };
const ID = /^[a-f0-9-]{36}$/;
const read = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const root = (ctx) => path.join(ctx.P.project, 'work', 'design');
const draftDir = (ctx, id) => ID.test(id || '') ? path.join(root(ctx), 'drafts', id) : null;
const stateFile = (ctx) => path.join(root(ctx), 'state.json');
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const state = (ctx) => {
  const s = read(stateFile(ctx)) || { draft: null, reference: null, job: null };
  if (s.draft && (s.draft.style || '') !== (plan(ctx).style || '')) s.draft = null;
  return s;
};
function write(ctx, data) {
  fs.mkdirSync(root(ctx), { recursive: true });
  fs.writeFileSync(stateFile(ctx) + '.tmp', JSON.stringify(data, null, 2));
  fs.renameSync(stateFile(ctx) + '.tmp', stateFile(ctx));
}
function plan(ctx) { return read(ctx.P.plan) || {}; }
function originalSource(ctx, file) {
  let pack;
  try { pack = plan(ctx).style ? packDir(ctx.P.templateDir, plan(ctx).style) : null; } catch { pack = null; }
  if (pack && fs.existsSync(path.join(pack, file))) return path.join(pack, file);
  return path.join(ctx.P.templateDir, templatePathOf(file));
}
function source(ctx, file) {
  const s = state(ctx), local = draftDir(ctx, s.draft?.id) || appliedDesign(ctx.P.project)?.dir;
  if (local && fs.existsSync(path.join(local, file))) return path.join(local, file);
  return originalSource(ctx, file);
}
export function designAsset(ctx, view, file) {
  if (![...PACK_KIT, ...PACK_BG, 'reference.jpg'].includes(file)) return null;
  if (view === 'original') return PACK_BG.includes(file) ? originalSource(ctx, file) : null;
  if (view === 'draft') return file === 'reference.jpg' ? referenceFile(ctx, state(ctx).reference) : source(ctx, file);
  const dir = draftDir(ctx, view);
  return dir ? path.join(dir, file) : null;
}
function referenceFile(ctx, ref) {
  return ref && /^[a-f0-9-]{36}\.(?:png|jpg|webp)$/.test(ref.file || '') ? path.join(root(ctx), 'uploads', ref.file) : null;
}
function descriptor(ctx, draft) {
  const color = draft?.color || (fs.existsSync(source(ctx, 'brand.css')) ? fs.readFileSync(source(ctx, 'brand.css'), 'utf8').match(/--brand\s*:\s*(#[\da-f]{6})/i)?.[1] : null) || '#F6630F';
  return { ...draft, color: color.toUpperCase() };
}
export function designState(ctx) {
  const s = state(ctx), applied = appliedDesign(ctx.P.project);
  const stamp = s.draft?.id || applied?.id || 'base';
  return { draft: descriptor(ctx, s.draft), applied: applied ? { id: applied.id, color: applied.color } : null,
    dirty: !!s.draft && s.draft.id !== applied?.id, request: requestState(ctx, s.request?.id), reference: s.reference ? { name: s.reference.name, url: `/design/draft/reference.jpg?v=${s.reference.file}` } : null,
    originals: Object.keys(KINDS).map((kind) => {
      const dark = plan(ctx).theme === 'dark';
      const fileFor = (lookup) => `bg-${kind}${dark && fs.existsSync(lookup(ctx, `bg-${kind}-dark.jpg`)) ? '-dark' : ''}.jpg`;
      const file = fileFor(originalSource), original = originalSource(ctx, file), active = source(ctx, fileFor(source));
      const exists = fs.existsSync(original), activeExists = fs.existsSync(active);
      const selected = exists === activeExists && (!exists || fs.readFileSync(original).equals(fs.readFileSync(active)));
      return { kind, exists, selected, thumb: exists ? `/design/original/${file}?v=${fs.statSync(original).mtimeMs}&style=${encodeURIComponent(plan(ctx).style || '')}` : null };
    }),
    theme: plan(ctx).theme || 'light', backgrounds: Object.keys(KINDS).map((kind) => {
      const dark = plan(ctx).theme === 'dark', file = `bg-${kind}${dark && fs.existsSync(source(ctx, `bg-${kind}-dark.jpg`)) ? '-dark' : ''}.jpg`;
      return { kind, size: KINDS[kind], exists: fs.existsSync(source(ctx, file)), url: `/design/draft/${file}?v=${stamp}` };
    }) };
}
function makeDraft(ctx, color) {
  const id = randomUUID(), dir = draftDir(ctx, id);
  fs.mkdirSync(dir, { recursive: true });
  for (const file of [...PACK_KIT, ...PACK_BG]) { const src = source(ctx, file); if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dir, file)); }
  const colors = brandColors(color || descriptor(ctx, state(ctx).draft).color);
  fs.writeFileSync(path.join(dir, 'brand.css'), rewriteBrandCss(fs.readFileSync(source(ctx, 'brand.css'), 'utf8'), colors));
  fs.writeFileSync(path.join(dir, 'pip-frame.png'), drawPipFrame(colors.brand));
  fs.writeFileSync(path.join(dir, 'pip-frame-v.png'), drawPipFrameV(colors.brand));
  return { id, color: colors.brand, style: plan(ctx).style || '', createdAt: Date.now() };
}
function unlocked(ctx) { if (ctx.designBusy) throw fail('背景正在處理，完成後就能繼續調整。', 409); }
export function setDesignColor(ctx, body) {
  unlocked(ctx);
  if (!/^#[\da-f]{6}$/i.test(body.color || '')) throw fail('請輸入六位色碼，例如 #F6630F。');
  const s = state(ctx); s.draft = makeDraft(ctx, body.color); s.job = null; write(ctx, s);
  return designState(ctx);
}
export function discardDesign(ctx) {
  unlocked(ctx);
  const applied = appliedDesign(ctx.P.project), s = state(ctx);
  s.draft = applied ? { id: applied.id, color: applied.color, style: applied.style || '', createdAt: applied.createdAt } : null;
  s.job = null; write(ctx, s); return designState(ctx);
}
export function removeReference(ctx) {
  unlocked(ctx); const s = state(ctx); s.reference = null; s.job = null; write(ctx, s); return designState(ctx);
}
async function run(cmd, args, { timeout = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    const cp = spawn(cmd, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    const timer = setTimeout(() => { cp.kill(); reject(new Error('處理超時，請重試。')); }, timeout);
    cp.on('error', (e) => { clearTimeout(timer); reject(e); });
    cp.stdout.on('data', (d) => { if (output.length < 1000000) output += d; });
    cp.stderr.on('data', () => {});
    cp.stdin.on('error', () => {});
    cp.stdin.end();
    cp.on('close', (code) => { clearTimeout(timer); code === 0 ? resolve(output) : reject(new Error(`${cmd} 處理失敗，請重試。`)); });
  });
}
async function normalize(src, dest, kind) {
  const [w, h] = KINDS[kind];
  await run('ffmpeg', ['-v', 'error', '-nostdin', '-y', '-i', src, '-frames:v', '1', '-vf', `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`, '-q:v', '2', dest]);
}
export async function uploadDesign(ctx, body) {
  unlocked(ctx);
  if (body.role !== 'reference' && !Object.hasOwn(KINDS, body.kind)) throw fail('請選擇要替換的背景版型。');
  const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(body.image || '');
  if (!m) throw fail('請上傳 JPG、PNG 或 WebP 圖片。');
  const bytes = Buffer.from(m[2], 'base64');
  if (!bytes.length || bytes.length > 12 * 1024 * 1024) throw fail('圖片請小於 12 MB。');
  ctx.designBusy = true;
  try {
    const ext = m[1] === 'jpeg' ? 'jpg' : m[1], file = `${randomUUID()}.${ext}`, dir = path.join(root(ctx), 'uploads');
    fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, file), bytes);
    // 先用 ffmpeg 解碼驗圖，不信任副檔名或瀏覽器送來的 MIME。
    await run('ffmpeg', ['-v', 'error', '-nostdin', '-i', path.join(dir, file), '-frames:v', '1', '-f', 'null', '-']);
    const s = state(ctx);
    if (body.role === 'reference') s.reference = { file, name: path.basename(String(body.name || '參考圖')).slice(0, 100) };
    else {
      s.draft = makeDraft(ctx);
      const suffix = plan(ctx).theme === 'dark' ? '-dark' : '';
      await normalize(path.join(dir, file), path.join(draftDir(ctx, s.draft.id), `bg-${body.kind}${suffix}.jpg`), body.kind);
    }
    s.job = null; write(ctx, s); return designState(ctx);
  } finally { ctx.designBusy = false; }
}
export function applyDesign(ctx, id) {
  unlocked(ctx);
  const s = state(ctx);
  if (!ID.test(id || '') || id !== s.draft?.id) throw fail('背景草稿有更新，請重新看過預覽後再儲存。', 409);
  fs.writeFileSync(path.join(root(ctx), 'applied.json.tmp'), JSON.stringify(s.draft, null, 2));
  fs.renameSync(path.join(root(ctx), 'applied.json.tmp'), path.join(root(ctx), 'applied.json'));
  return designState(ctx);
}
export function designPreviews(ctx, format) {
  const html = fs.readFileSync(path.join(ctx.P.templateDir, 'index.html'), 'utf8');
  const available = new Set(fs.readdirSync(path.join(ctx.P.templateDir, 'preview')));
  return [...html.matchAll(/<iframe src="preview\/([^"?]+\.html)"[^>]*title="([^"]+)"/g)].flatMap((m) => {
    const file = format === 'portrait' ? m[1].replace('.html', '-v.html') : m[1];
    if (!available.has(file)) return [];
    const kind = file.startsWith('03-') || file.startsWith('05-') ? 'side' : /^0[12]-/.test(file) ? 'ch' : 'fs';
    return [{ file, title: m[2].replace(/\s*預覽$/, ''), kind, category: file.startsWith('x-') ? 'custom' : /^(0[1-5]|14)-/.test(file) ? 'layout' : 'text' }];
  });
}
const VARIANTS = ['A', 'B', 'C'];
const requestDir = (ctx, id) => ID.test(id || '') ? path.join(root(ctx), 'requests', id) : null;
function requestData(ctx, id) {
  const dir = requestDir(ctx, id), data = dir && read(path.join(dir, 'request.json'));
  return data && Array.isArray(data.targets) && data.targets.length && data.targets.every((k) => Object.hasOwn(KINDS, k)) ? { ...data, dir } : null;
}
function candidateFile(dir, variant, kind) {
  for (const ext of ['png', 'jpg', 'webp']) { const file = path.join(dir, variant, `bg-${kind}.${ext}`); if (fs.existsSync(file) && fs.statSync(file).isFile()) return file; }
  return null;
}
export function candidateAsset(ctx, id, variant, kind) {
  const req = requestData(ctx, id);
  return req && VARIANTS.includes(variant) && req.targets.includes(kind) ? candidateFile(req.dir, variant, kind) : null;
}
function requestState(ctx, id) {
  const req = requestData(ctx, id);
  if (!req) return null;
  const selection = read(path.join(req.dir, 'selection.json'));
  const current = selection && selection.draftId === state(ctx).draft?.id;
  const selectedByKind = current ? selection.choices || Object.fromEntries(req.targets.map((k) => [k, selection.variant])) : {};
  let foundCount = 0;
  const candidates = VARIANTS.map((variant) => {
    const backgrounds = Object.fromEntries(req.targets.map((kind) => {
      const file = candidateFile(req.dir, variant, kind);
      if (file) foundCount++;
      return [kind, { ready: !!file, thumb: file ? `/design/request/${id}/${variant}/${kind}?v=${fs.statSync(file).mtimeMs}` : null }];
    }));
    return { variant, backgrounds, ready: req.targets.every((k) => backgrounds[k].ready), thumb: Object.values(backgrounds).find((b) => b.thumb)?.thumb || null };
  });
  const selected = req.targets.every((k) => selectedByKind[k] && selectedByKind[k] === selectedByKind[req.targets[0]]) ? selectedByKind[req.targets[0]] : null;
  const reported = read(path.join(req.dir, 'progress.json'));
  const progress = reported || { state: foundCount === req.targets.length * VARIANTS.length ? 'done' : 'waiting', message: '', at: null };
  return { id, prompt: fs.readFileSync(path.join(req.dir, 'request.md'), 'utf8'), savedTo: path.relative(ctx.P.root, req.dir).split(path.sep).join('/'),
    description: req.description || '', direction: req.direction || 'auto', scope: 'all', kind: req.targets[0], selected, selectedByKind, foundCount, expectedCount: req.targets.length * VARIANTS.length, candidates, progress };
}
export function designRequestStatus(ctx) { return { request: requestState(ctx, state(ctx).request?.id) }; }
export function setDesignRequestStatus(ctx, body) {
  const s = state(ctx), req = requestData(ctx, body.requestId);
  if (!req || req.id !== s.request?.id) throw fail('背景生圖需求已更新，請重新讀取目前的生圖指令。', 409);
  if ((req.style || '') !== (plan(ctx).style || '') || req.theme !== (plan(ctx).theme || 'light') || req.color !== descriptor(ctx, s.draft).color
    || req.spec.reference !== (s.reference?.file || null)) throw fail('背景設定已更換，請重新複製生圖指令。', 409);
  if (!['generating', 'done', 'failed'].includes(body.state) || (body.message !== undefined && (typeof body.message !== 'string' || body.message.length > 2000))) throw fail('請提供有效的 state（generating／done／failed）與文字訊息。');
  const current = requestState(ctx, req.id);
  if (body.state === 'done' && current.foundCount !== current.expectedCount) throw fail(`背景尚未全部存檔（${current.foundCount}/${current.expectedCount} 張），不能回報完成。`, 409);
  const file = path.join(req.dir, 'progress.json');
  fs.writeFileSync(file + '.tmp', JSON.stringify({ state: body.state, message: body.message || '', at: Date.now() }, null, 2));
  fs.renameSync(file + '.tmp', file);
  return designRequestStatus(ctx);
}
const DIRECTIONS = {
  auto: ['依參考圖與描述', ''],
  technical: ['科技線稿', '精準工程線條、清楚節點與結構，使用主色作重點；A 正交網格、B 電路節點、C 等角線框'],
  editorial: ['編輯平面', '印刷紙感、俐落分割與明確色塊；A 細線版式、B 大色塊編排、C 半色調網點'],
  paper: ['紙雕拼貼', '可辨識的紙張纖維、切邊與層次陰影；A 分層紙雕、B 撕紙拼貼、C 折紙結構'],
  geometric3d: ['幾何 3D', '輪廓清楚的實體幾何、可信的材質與光影；A 霧面積木、B 陶瓷曲面、C 金屬浮雕'],
  photo: ['自然實景', '真實攝影質感、細節對焦清楚；A 木石材質、B 植物光影、C 建築空間'],
};
export function prepareDesignRequest(ctx, body) {
  unlocked(ctx);
  const targets = Object.keys(KINDS);
  const s = state(ctx), color = descriptor(ctx, s.draft).color;
  const description = String(body.description || '').trim().slice(0, 1500);
  const direction = Object.hasOwn(DIRECTIONS, body.direction || 'auto') ? body.direction || 'auto' : 'auto';
  const theme = plan(ctx).theme || 'light', style = plan(ctx).style || '';
  const format = resolveFormat({ projectDir: ctx.P.project, plan: plan(ctx) }).format;
  const spec = { mode: 'generate-all-v4', color, description, direction, theme, style, format, targets, reference: s.reference?.file || null };
  if (JSON.stringify(requestData(ctx, s.request?.id)?.spec) === JSON.stringify(spec)) return designState(ctx);
  const id = randomUUID(), dir = requestDir(ctx, id);
  fs.mkdirSync(dir, { recursive: true });
  for (const variant of VARIANTS) fs.mkdirSync(path.join(dir, variant));
  const sourceRef = referenceFile(ctx, s.reference);
  const ref = sourceRef && fs.existsSync(sourceRef) ? path.join(dir, 'reference' + path.extname(sourceRef)) : null;
  if (ref) fs.copyFileSync(sourceRef, ref);
  const zones = { fs: '全畫面主卡 x 120–1380、y 150–862；講者小窗 x 1424–1888、y 581–951；字幕帶 y ≥ 920', side: '側邊欄文字區 x 0–816、y 86–864', ch: '章名卡 x 160–1760、y 260–870' };
  const visualDirection = direction !== 'auto' ? `指定風格：${DIRECTIONS[direction][0]}。${DIRECTIONS[direction][1]}。` : ref || description
    ? '以使用者描述與參考圖決定視覺語言，沿用其具體造型、材質、輪廓與配色。A 著重線條結構、B 著重形狀編排、C 著重材質層次，三組都須符合指定風格。'
    : 'A 科技工程線稿（正交網格、精準細線）；B 編輯平面設計（紙感、明確幾何色塊）；C 立體幾何（實體造型、清楚材質與投影）。';
  const prompt = `直接用生圖工具生成並儲存 9 張影片背景：A、B、C 三個可明確區別的設計方向，每組都生成以下三張。\n主色 ${color}；${theme === 'dark' ? '深色' : '亮色'}。${description ? `使用者風格：${description}。` : ''}${format === 'portrait' ? '直式使用，中央取景區保持乾淨。' : ''}\n${visualDirection}\n參考圖：${ref || '無'}${ref ? '；讀取圖片，依其設計語言生成；不要只取顏色。' : ''}\n每組三張保持同一套造型、材質與配色；A/B/C 必須在結構、形狀或材質上有明顯差異，不可只是換色或移動同一片光暈。輪廓、紋理清晰；除非使用者明確要求，不使用失焦、模糊光斑、霧化漸層或泛光作為主要設計。\n${targets.map((k) => `- bg-${k}.png：${KINDS[k].join('×')}；內容安全區：${zones[k]}`).join('\n')}\n圖片不含文字、標誌、卡片。內容安全區維持易讀的單純底面；清晰裝飾安排在區域外，不以整張模糊代替留白。\n儲存至 ${dir} 下的 A/、B/、C/，每個資料夾各三張 PNG。全部生成並存檔後，回報圖片路徑。\n`;
  const statusCommand = `node shared/template/tools/editor.mjs --project ${JSON.stringify(path.relative(ctx.P.root, ctx.P.project).split(path.sep).join('/'))} --design-request ${id} --design-state`;
  const progressPrompt = `\n狀態回報（在工作區根目錄執行）：開始生圖前執行 ${statusCommand} generating；九張圖片全部存檔後執行 ${statusCommand} done；任何生成或存檔失敗，執行 ${statusCommand} failed --message "失敗原因"。生圖途中可用 generating --message "目前進度" 更新說明。需求衝突時停止，重新讀取最新指令，不要把舊任務回報到新需求。\n`;
  fs.writeFileSync(path.join(dir, 'request.md'), prompt + progressPrompt);
  fs.writeFileSync(path.join(dir, 'request.json'), JSON.stringify({ id, targets, color, theme, style, direction, description, spec, createdAt: Date.now() }, null, 2));
  s.request = { id }; s.job = null; write(ctx, s);
  return designState(ctx);
}
export function restoreOriginalBackground(ctx, body) {
  unlocked(ctx);
  if (!Object.hasOwn(KINDS, body.kind)) throw fail('請選擇要還原的背景版型。');
  const s = state(ctx), req = requestData(ctx, s.request?.id);
  const previous = req && read(path.join(req.dir, 'selection.json'));
  const choices = previous?.draftId === s.draft?.id ? { ...(previous.choices || {}) } : {};
  const draft = makeDraft(ctx), dir = draftDir(ctx, draft.id);
  for (const suffix of ['', '-dark']) {
    const file = `bg-${body.kind}${suffix}.jpg`, original = originalSource(ctx, file), dest = path.join(dir, file);
    if (fs.existsSync(original)) fs.copyFileSync(original, dest);
    else fs.rmSync(dest, { force: true });
  }
  s.draft = draft; write(ctx, s);
  if (req) {
    choices[body.kind] = 'original';
    fs.writeFileSync(path.join(req.dir, 'selection.json'), JSON.stringify({ variant: null, choices, draftId: draft.id, selectedAt: Date.now() }, null, 2));
  }
  return designState(ctx);
}
export async function importDesignCandidate(ctx, body) {
  unlocked(ctx);
  const s = state(ctx), req = requestData(ctx, body.requestId), variant = body.variant;
  if (!req || req.id !== s.request?.id || !VARIANTS.includes(variant)) throw fail('請重新載入圖片後再選擇。', 409);
  if ((req.style || '') !== (plan(ctx).style || '') || req.theme !== (plan(ctx).theme || 'light')) throw fail('本集風格或主題已更換，請重新準備設計提示詞。', 409);
  const targets = body.kind === undefined ? req.targets : req.targets.filter((k) => k === body.kind);
  if (!targets.length || !targets.every((k) => candidateFile(req.dir, variant, k))) throw fail('這張背景還沒生成完成，請載入圖片後再選擇。');
  const previous = read(path.join(req.dir, 'selection.json'));
  const choices = previous?.draftId === s.draft?.id && previous ? { ...(previous.choices || Object.fromEntries(req.targets.map((k) => [k, previous.variant]))) } : {};
  ctx.designBusy = true;
  try {
    const draft = makeDraft(ctx), suffix = req.theme === 'dark' ? '-dark' : '';
    for (const kind of targets) await normalize(candidateFile(req.dir, variant, kind), path.join(draftDir(ctx, draft.id), `bg-${kind}${suffix}.jpg`), kind);
    s.draft = draft; write(ctx, s);
    for (const kind of targets) choices[kind] = variant;
    const whole = req.targets.every((k) => choices[k] === variant) ? variant : null;
    fs.writeFileSync(path.join(req.dir, 'selection.json'), JSON.stringify({ variant: whole, choices, draftId: draft.id, selectedAt: Date.now() }, null, 2));
    return designState(ctx);
  } finally { ctx.designBusy = false; }
}
