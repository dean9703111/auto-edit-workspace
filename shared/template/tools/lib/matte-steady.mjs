// 去背穩定（043）：模型是一格一格判斷的，貼著人的東西（椅背、扶手、桌緣）會整塊「這幾格算進人、下幾格不算」來回跳，看起來就是閃。
// 做法：那些東西自己沒在動。先縮到約 320 px 寬決定「哪一塊、哪幾格要換」（縮小了雜訊少，判斷才穩）——
//   1. 這個位置「不算人」的那些格長什麼樣（亮度的中位數）＝這裡的背景。從來沒有不算人過的位置（身體）不碰。
//   2. 畫面上是背景的那些格裡，有幾成被算成人。幾乎都算或幾乎都不算＝本來就穩；
//      不上不下＝會跳：相連的一整塊一起決定，整塊平均不到七成算人就整塊不算（免得留下零碎的殘塊）。
//      只處理夠厚實的塊；輪廓邊緣一兩格寬的細條是人自己在晃，不碰
//   3. 每一格看模型把那一塊算成什麼。真的會跳的東西是整塊同一格一起變；人在動（頭、手晃過深色背景）是每個位置各變各的：
//      和整塊的走向對不上的位置剔掉，整塊不是「幾乎全算／幾乎全不算」兩種狀態來回切的就放棄，完全不碰。
//      通過的塊，只有和決定相反的格（模型判錯的格）才換；模型本來就判對的格完全不碰
//   4. 「整塊不算」的那一塊旁邊，有的位置在判對的格裡一直被人擋著（手肘），沒看過背景。判錯的格裡，這種位置如果
//      長得像隔壁那一塊的背景、又和「人擋在那裡時」差很多（兩個條件都要過），就從那一塊一路連過去一起拿掉
//   5. 換完之後，緊貼著換掉的地方、又和人分開的小碎塊一起拿掉
// 再用大一點的尺寸（最寬 960 px）決定「換到哪一個像素」，三個條件都要過：
//   a. 在要換的範圍裡（上面決定的那幾塊，往外多一圈）
//   b. 這個像素現在長得像這裡的背景：亮度、色彩都要像（膚色和灰椅子的色彩差很多，手經過時不會被切）
//   c. 參考「模型判對的那些格」：整塊不算的，這個像素在判對的格裡多半不是人才拿掉（判對的格裡一直是人的像素＝身體，永遠不動，
//      深色袖子貼著深色椅子也不會被切）；整塊算的，反過來
// 只改遮罩，不改顏色；沒有要改的地方就不重新編碼（原檔照用）。零依賴（ffmpeg）。
//
//   analyzeMatte({ alpha, luma, w, h, n })  → { med, weights, lend, force, bgMap, src, owner, wrong, changed }（純計算，測試用得到）
//       alpha、luma＝n 格 w×h 的灰階（一格接一格）。med＝每個位置決定的遮罩值（0 或 255）；weights＝每格每個位置可以換多少（0–255，要過 b、c）；
//       lend＝第 4 點借背景的位置（只過 b）；force＝第 5 點的小碎塊（直接換）；bgMap＝每個位置的背景亮度；src＝背景是看哪個位置的（−1＝沒有）；
//       owner＝每個位置跟著哪一塊（−1＝沒有）；wrong[塊][格]＝1 是模型判錯的格；changed＝有換的格數占比（0＝本來就穩）
//   referenceAlpha({ alpha, rw, rh, n, owner, w, h, wrong }) → rw×rh 的參考遮罩：每個像素在「它那一塊判對的格」裡算人的比例（0–255）；沒有塊的＝255
//   steadyMatte({ clip, matte, out })       → { ok, changed, message }：changed 是 false 時沒有寫 out
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// version：算法改了就加一（lib/matte.mjs 的指紋會跟著變，舊的去背檔自動重做）
export const STEADY = {
  version: 3, size: 320, refSize: 960, off: 64, minOff: 0.03, still: [8, 20], differ: [48, 96], minStill: 0.1, flip: [0.08, 0.92], gap: 3, minSize: 20, sync: 0.85, mixed: 0.2, both: 0.05, keep: 0.7, minSeen: 0.2,
  reach: 10, lendBg: 24, lendStep: 14, lendApart: 40, lendNotPerson: 30, island: 0.01, minChanged: 0.002,
  fine: [26, 52], fineChroma: [10, 20], crf: 20,   // fine：亮度和背景差多少以內才換（26 以內全換、52 以上不換）；fineChroma：色彩（U、V 的差加起來）
};

// 一個位置 n 個值的中位數（256 格計數，不排序）
function medianOf(hist, count) {
  let acc = 0;
  const half = (count + 1) >> 1;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= half) return v; }
  return 255;
}
const around = (p, w, px) => { const x = p % w; return [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w >= 0 ? p - w : -1, p + w < px ? p + w : -1]; };

// 這一格換完之後還算人的位置（遮罩 ≥ 128）分成相連的幾塊：不是最大的那一塊、很小、又緊貼著被拿掉的地方 → 也拿掉
function dropIslands({ alpha, gone, weights, force, med, o, w, px }) {
  const stays = (p) => alpha[o + p] >= 128 && !gone[p];
  const label = new Int32Array(px).fill(-1), stack = new Int32Array(px), sizes = [], touch = [];
  for (let p0 = 0; p0 < px; p0++) {
    if (label[p0] >= 0 || !stays(p0)) continue;
    const id = sizes.length;
    let top = 0, size = 0, near = 0;
    stack[top++] = p0; label[p0] = id;
    while (top) {
      const p = stack[--top];
      size++;
      for (const q of around(p, w, px)) {
        if (q < 0) continue;
        if (gone[q] || weights[o + q] > 127) near = 1;
        if (label[q] < 0 && stays(q)) { label[q] = id; stack[top++] = q; }
      }
    }
    sizes.push(size); touch.push(near);
  }
  if (sizes.length < 2) return;
  let biggest = 0;
  for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[biggest]) biggest = i;
  for (let p = 0; p < px; p++) { const id = label[p]; if (id >= 0 && id !== biggest && touch[id] && sizes[id] <= px * STEADY.island && med[p] === 0) force[o + p] = 255; }
}

export function analyzeMatte({ alpha, luma, w, h, n }) {
  const px = w * h, [s1, s2] = STEADY.still, [d1, d2] = STEADY.differ, [f1, f2] = STEADY.flip;
  const bg = new Uint8Array(px), med = new Uint8Array(px), usable = new Uint8Array(px), frac = new Float32Array(px);
  const hist = new Uint32Array(256);
  for (let p = 0; p < px; p++) {
    hist.fill(0);
    let off = 0;
    for (let t = 0; t < n; t++) if (alpha[t * px + p] < STEADY.off) { hist[luma[t * px + p]]++; off++; }
    if (off < Math.max(3, n * STEADY.minOff)) continue;
    bg[p] = medianOf(hist, off);
    let like = 0, on = 0;
    for (let t = 0; t < n; t++) if (Math.abs(luma[t * px + p] - bg[p]) <= s1) { like++; if (alpha[t * px + p] >= 128) on++; }
    if (like < n * STEADY.minStill) continue;
    usable[p] = 1; frac[p] = on / like; med[p] = frac[p] >= 0.5 ? 255 : 0;
  }
  // 會跳的位置連成一塊的一起決定：blobOf＝每個位置屬於哪一塊（−1＝不會跳）。中間隔著 gap 格以內不會跳的位置也算同一塊
  // （同一張椅子常被陰影、縫線切成好幾片；各自決定的話，每一片判錯的格不一樣，又會零零碎碎地閃）
  // 只看夠厚實的地方（椅背、扶手）。人自然晃動時，輪廓邊緣那一兩格寬的細條也會「有時算人有時不算」，那是真的在動，不能當成會跳的東西去改
  // （深色外套配深色背景時亮度分不出來，改了會在邊緣咬出缺口）。做法：上下左右都會跳的位置才算核心，只留核心和緊貼核心的位置
  const jumpy = (p) => usable[p] === 1 && frac[p] > f1 && frac[p] < f2;
  const thick = new Uint8Array(px);
  for (let p = 0; p < px; p++) if (jumpy(p) && around(p, w, px).every((q) => q >= 0 && jumpy(q))) { thick[p] = 1; for (const q of around(p, w, px)) thick[q] = 1; }
  const flips = (p) => thick[p] === 1;
  const bridge = new Uint8Array(px);
  {
    let front = [];
    for (let p = 0; p < px; p++) if (flips(p)) { bridge[p] = 1; front.push(p); }
    for (let step = 0; step < STEADY.gap && front.length; step++) {
      const next = [];
      for (const p of front) for (const q of around(p, w, px)) if (q >= 0 && !bridge[q]) { bridge[q] = 1; next.push(q); }
      front = next;
    }
  }
  const blobOf = new Int32Array(px).fill(-1), seen = new Uint8Array(px), stack = new Int32Array(px), blobs = [];
  for (let p0 = 0; p0 < px; p0++) {
    if (seen[p0] || !bridge[p0]) continue;
    const id = blobs.length;
    let top = 0, sum = 0, size = 0;
    stack[top++] = p0; seen[p0] = 1;
    while (top) {
      const p = stack[--top];
      if (flips(p)) { blobOf[p] = id; size++; sum += frac[p]; }
      for (const q of around(p, w, px)) if (q >= 0 && !seen[q] && bridge[q]) { seen[q] = 1; stack[top++] = q; }
    }
    blobs.push({ size, value: sum / size >= STEADY.keep ? 255 : 0 });
  }
  // 每一格模型把每一塊算成什麼。真的會跳的東西（椅子）是整塊同一格一起變；人在動（頭、手晃過深色背景）是每個位置各變各的。
  // 所以：① 每個位置和整塊的走向對不上（同步率不到 sync）就剔掉，剔完重算一次；② 整塊大多數的格要嘛幾乎全算、要嘛幾乎全不算
  // （不上不下的格超過 mixed 就整塊放棄）；③ 兩種狀態都要出現過；④ 剩下的位置太少（minSize）也放棄。放棄的塊完全不碰。
  const cells = blobs.map(() => []);
  for (let p = 0; p < px; p++) if (blobOf[p] >= 0) cells[blobOf[p]].push(p);
  const looks = (t, p) => Math.abs(luma[t * px + p] - bg[p]) <= (s1 + s2) / 2;
  const wrong = blobs.map(() => new Uint8Array(n));
  const share = new Float32Array(n);   // 這一格這一塊有幾成被算成人（−1＝看得到背景的位置太少，不知道）
  const signalOf = (list) => {
    for (let t = 0; t < n; t++) {
      let like = 0, on = 0;
      for (const p of list) if (looks(t, p)) { like++; if (alpha[t * px + p] >= 128) on++; }
      share[t] = like >= list.length * STEADY.minSeen ? on / like : -1;
    }
  };
  for (let b = 0; b < blobs.length; b++) {
    let list = cells[b];
    signalOf(list);
    list = list.filter((p) => {
      let seen = 0, agree = 0;
      for (let t = 0; t < n; t++) if (share[t] >= 0 && looks(t, p)) { seen++; if ((alpha[t * px + p] >= 128) === (share[t] > 0.5)) agree++; }
      return seen >= 3 && agree >= seen * STEADY.sync;
    });
    let known = 0, mixed = 0, high = 0, low = 0;
    if (list.length >= STEADY.minSize) {
      signalOf(list);
      for (let t = 0; t < n; t++) { if (share[t] < 0) continue; known++; if (share[t] > 0.8) high++; else if (share[t] < 0.2) low++; else mixed++; }
    }
    const ok = list.length >= STEADY.minSize && known >= n * 0.5 && mixed <= known * STEADY.mixed && high >= known * STEADY.both && low >= known * STEADY.both;
    const keepers = new Set(ok ? list : []);
    let sum = 0;
    for (const p of cells[b]) { if (keepers.has(p)) sum += frac[p]; else blobOf[p] = -1; }
    if (!ok) continue;
    blobs[b].size = list.length;
    blobs[b].value = sum / list.length >= STEADY.keep ? 255 : 0;
    for (let t = 0; t < n; t++) wrong[b][t] = share[t] < 0 ? 0 : (blobs[b].value === 0 ? share[t] > 0.5 : share[t] < 0.5) ? 1 : 0;
  }
  for (let p = 0; p < px; p++) if (blobOf[p] >= 0) med[p] = blobs[blobOf[p]].value;
  // owner＝每個位置跟著哪一塊（那一塊往外 reach 格以內）；near＝最近的那一塊裡的位置（借背景亮度用）
  const owner = new Int32Array(px).fill(-1), near = new Int32Array(px).fill(-1);
  {
    let front = [];
    for (let p = 0; p < px; p++) if (blobOf[p] >= 0) { owner[p] = blobOf[p]; near[p] = p; front.push(p); }
    for (let step = 0; step < STEADY.reach && front.length; step++) {
      const next = [];
      for (const p of front) for (const q of around(p, w, px)) if (q >= 0 && owner[q] < 0) { owner[q] = owner[p]; near[q] = near[p]; next.push(q); }
      front = next;
    }
  }
  // bgMap：每個位置的背景亮度（自己看過的；沒有就用最近那一塊的，src 記是看哪個位置）。跟著某一塊、自己不在塊裡的位置，決定值跟那一塊一樣
  const bgMap = Buffer.alloc(px), src = new Int32Array(px).fill(-1);
  for (let p = 0; p < px; p++) {
    src[p] = usable[p] || blobOf[p] >= 0 ? p : near[p];
    bgMap[p] = src[p] >= 0 ? bg[src[p]] : 0;
    if (owner[p] >= 0 && blobOf[p] < 0) med[p] = blobs[owner[p]].value;
  }
  // 第 4 點：可以借背景的位置（canLend）和人擋在那裡時的亮度（person）
  const canLend = new Uint8Array(px), person = new Uint8Array(px);
  for (let p = 0; p < px; p++) {
    const b = owner[p];
    if (b < 0 || blobOf[p] >= 0 || usable[p] || blobs[b].value !== 0) continue;
    hist.fill(0);
    let cnt = 0;
    for (let t = 0; t < n; t++) if (!wrong[b][t] && alpha[t * px + p] >= 128) { hist[luma[t * px + p]]++; cnt++; }
    if (cnt < 3) continue;
    const who = medianOf(hist, cnt);
    if (Math.abs(who - bgMap[p]) > STEADY.lendApart) { canLend[p] = 1; person[p] = who; }
  }
  const weights = Buffer.alloc(n * px), lend = Buffer.alloc(n * px), force = Buffer.alloc(n * px);
  const raw = new Uint8Array(px), gone = new Uint8Array(px), queue = new Int32Array(px);
  let changedFrames = 0;
  for (let t = 0; t < n; t++) {
    const o = t * px;
    let any = 0, tail = 0;
    gone.fill(0);
    for (let p = 0; p < px; p++) {
      raw[p] = 0;
      const b = blobOf[p];
      if (b < 0 || !wrong[b][t]) continue;
      const dy = Math.abs(luma[o + p] - bg[p]), da = Math.abs(alpha[o + p] - med[p]);
      raw[p] = Math.round(255 * (dy <= s1 ? 1 : dy >= s2 ? 0 : (s2 - dy) / (s2 - s1)) * (da <= d1 ? 0 : da >= d2 ? 1 : (da - d1) / (d2 - d1)));
      if (raw[p] > 127) { any++; if (med[p] === 0) { gone[p] = 1; queue[tail++] = p; } }
    }
    if (any >= px * STEADY.minChanged) changedFrames++;
    if (!any) continue;
    // 第 4 點：從拿掉的地方往旁邊連
    for (let i = 0; i < tail; i++) {
      const p = queue[i], b = owner[p];
      for (const q of around(p, w, px)) {
        if (q < 0 || gone[q] || !canLend[q] || owner[q] !== b || alpha[o + q] < 128) continue;
        // 長得像隔壁的背景，或和剛拿掉的那個相鄰位置差不多亮（同一張椅子上亮度是慢慢變的）；而且不像人擋在這裡時的樣子
        if (Math.abs(luma[o + q] - bgMap[q]) > STEADY.lendBg && Math.abs(luma[o + q] - luma[o + p]) > STEADY.lendStep) continue;
        if (Math.abs(luma[o + q] - person[q]) <= STEADY.lendNotPerson) continue;
        lend[o + q] = 255; gone[q] = 1; queue[tail++] = q;
      }
    }
    // 要換的範圍往外多一圈：交界落在這一圈裡，換到哪個像素交給 b、c 兩個條件
    for (let p = 0; p < px; p++) {
      if (!raw[p]) continue;
      if (raw[p] > weights[o + p]) weights[o + p] = raw[p];
      if (raw[p] <= 127) continue;
      const x = p % w, y = (p - x) / w;
      for (let yy = Math.max(0, y - 1); yy <= Math.min(h - 1, y + 1); yy++) for (let xx = Math.max(0, x - 1); xx <= Math.min(w - 1, x + 1); xx++) {
        const q = yy * w + xx;
        if (owner[q] === owner[p] && weights[o + q] < raw[p]) weights[o + q] = raw[p];
      }
    }
    dropIslands({ alpha, gone, weights, force, med, o, w, px });
  }
  return { med, weights, lend, force, bgMap, src, owner, wrong, changed: n ? changedFrames / n : 0 };
}

export function referenceAlpha({ alpha, rw, rh, n, owner, w, h, wrong }) {
  const rpx = rw * rh, ref = Buffer.alloc(rpx, 255);
  const good = wrong.map((row) => { const list = []; for (let t = 0; t < n; t++) if (!row[t]) list.push(t); return list; });
  for (let ry = 0; ry < rh; ry++) {
    const cy = Math.min(h - 1, Math.floor(ry * h / rh));
    for (let rx = 0; rx < rw; rx++) {
      const b = owner[cy * w + Math.min(w - 1, Math.floor(rx * w / rw))];
      if (b < 0 || !good[b].length) continue;
      const p = ry * rw + rx;
      let on = 0;
      for (const t of good[b]) if (alpha[t * rpx + p] >= 128) on++;
      ref[p] = Math.round(255 * on / good[b].length);
    }
  }
  return ref;
}

// 某一個色彩平面（U 或 V）每個位置的背景值：自己看過背景的位置取「不算人的那些格」的中位數，其他照 src 抄
function planeBackground({ plane, alpha, src, px, n }) {
  const out = Buffer.alloc(px, 128), hist = new Uint32Array(256);
  for (let p = 0; p < px; p++) {
    if (src[p] !== p) continue;
    hist.fill(0);
    let cnt = 0;
    for (let t = 0; t < n; t++) if (alpha[t * px + p] < STEADY.off) { hist[plane[t * px + p]]++; cnt++; }
    if (cnt) out[p] = medianOf(hist, cnt);
  }
  for (let p = 0; p < px; p++) if (src[p] >= 0 && src[p] !== p) out[p] = out[src[p]];
  return out;
}

const ff = (args, opt = {}) => spawnSync('ffmpeg', ['-nostdin', '-v', 'error', ...args], { maxBuffer: 2 ** 31 - 1, ...opt });
const probe = (file) => {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  const [W, H, fps] = String(r.stdout).trim().split(',');
  return r.status === 0 && Number(W) > 0 && Number(H) > 0 && fps ? { W: Number(W), H: Number(H), fps } : null;
};
const fit = (W, H, size) => { const k = Math.min(1, size / Math.max(W, H)); return [Math.max(2, Math.round(W * k / 2) * 2), Math.max(2, Math.round(H * k / 2) * 2)]; };

export function steadyMatte({ clip, matte, out }) {
  const info = probe(clip);
  if (!info) return { ok: false, changed: false, message: `讀不到 ${path.basename(clip)} 的寬高` };
  const [w, h] = fit(info.W, info.H, STEADY.size), px = w * h;
  const gray = (file, vf, decode = []) => ff([...decode, '-i', file, '-vf', `${vf},format=gray`, '-f', 'rawvideo', '-']);
  const a = gray(matte, `alphaextract,scale=${w}:${h}:flags=area`, ['-c:v', 'libvpx-vp9']);
  const y = gray(clip, `scale=${w}:${h}:flags=area`);
  if (a.status !== 0 || y.status !== 0) return { ok: false, changed: false, message: String((a.status !== 0 ? a : y).stderr).trim().split('\n').pop() };
  const n = Math.min(Math.floor(a.stdout.length / px), Math.floor(y.stdout.length / px));
  if (n < 3) return { ok: true, changed: false, message: '' };
  const A = analyzeMatte({ alpha: a.stdout, luma: y.stdout, w, h, n });
  if (!A.changed) return { ok: true, changed: false, message: '' };
  // 參考遮罩：用大一點的尺寸算（越長的段縮越小，一次讀進來的量不超過約 400 MB）
  const [rw, rh] = fit(info.W, info.H, Math.max(STEADY.size, Math.min(STEADY.refSize, Math.floor(Math.sqrt(4e8 / n * Math.max(info.W, info.H) / Math.min(info.W, info.H))))));
  const ra = gray(matte, `alphaextract,scale=${rw}:${rh}:flags=area`, ['-c:v', 'libvpx-vp9']);
  if (ra.status !== 0) return { ok: false, changed: false, message: String(ra.stderr).trim().split('\n').pop() };
  const ref = referenceAlpha({ alpha: ra.stdout, rw, rh, n: Math.min(n, Math.floor(ra.stdout.length / (rw * rh))), owner: A.owner, w, h, wrong: A.wrong });
  const u = gray(clip, `extractplanes=u,scale=${w}:${h}:flags=area`), v = gray(clip, `extractplanes=v,scale=${w}:${h}:flags=area`);
  if (u.status !== 0 || v.status !== 0) return { ok: false, changed: false, message: String((u.status !== 0 ? u : v).stderr).trim().split('\n').pop() };
  const bgU = planeBackground({ plane: u.stdout, alpha: a.stdout, src: A.src, px, n }), bgV = planeBackground({ plane: v.stdout, alpha: a.stdout, src: A.src, px, n });
  const dir = path.dirname(out), tmp = (name) => path.join(dir, `.steady-${name}-${process.pid}.gray`);
  const files = { m: tmp('m'), b: tmp('b'), w: tmp('w'), l: tmp('l'), f: tmp('f'), r: tmp('r'), u: tmp('u'), v: tmp('v') };
  try {
    const still = (map) => { const all = Buffer.alloc(n * map.length); for (let t = 0; t < n; t++) all.set(map, t * map.length); return all; };
    fs.writeFileSync(files.m, still(A.med));
    fs.writeFileSync(files.b, still(A.bgMap));
    fs.writeFileSync(files.w, A.weights);
    fs.writeFileSync(files.l, A.lend);
    fs.writeFileSync(files.f, A.force);
    fs.writeFileSync(files.r, still(ref));
    fs.writeFileSync(files.u, still(bgU));
    fs.writeFileSync(files.v, still(bgV));
    const raw = (f, size = `${w}x${h}`) => ['-f', 'rawvideo', '-pix_fmt', 'gray', '-s', size, '-framerate', info.fps, '-i', f];
    const up = `scale=${info.W}:${info.H}:flags=bilinear,format=gray`, [f1, f2] = STEADY.fine, [c1, c2] = STEADY.fineChroma;
    const graph = [
      '[1:v]alphaextract,format=gray[a]',
      `[2:v]${up},split[m][m2]`, `[3:v]${up}[b]`, `[4:v]${up}[w]`, `[5:v]${up}[l]`, `[6:v]${up}[f]`, `[7:v]${up}[r]`, `[8:v]${up}[bu]`, `[9:v]${up}[bv]`,
      '[0:v]format=yuv420p,split=3[c0][c1][c2]',
      // b：現在的亮度、色彩都像這裡的背景
      '[c1]extractplanes=y,gblur=sigma=1.5[y]',
      `[y][b]blend=all_mode=difference,lutyuv=y='clip(255*(${f2}-val)/${f2 - f1},0,255)'[wy]`,
      `[c2]extractplanes=u+v[cu][cv]`, `[cu]${up},gblur=sigma=2[u]`, `[cv]${up},gblur=sigma=2[v]`,
      '[u][bu]blend=all_mode=difference[du]', '[v][bv]blend=all_mode=difference[dv]',
      `[du][dv]blend=all_mode=addition,lutyuv=y='clip(255*(${c2}-val)/${c2 - c1},0,255)'[wc]`,
      '[wy][wc]blend=all_mode=darken,split[ws][ws2]',
      // c：整塊不算的（決定值 0）→ 參考遮罩不是人才換；整塊算的（255）→ 參考遮罩是人才換
      '[m2]negate[mn]', '[r][mn]blend=all_mode=difference[g]',
      '[w][ws]blend=all_mode=darken[w1]', '[w1][g]blend=all_mode=darken[w2]',
      '[l][ws2]blend=all_mode=darken[l1]',
      '[w2][l1]blend=all_mode=lighten[w3]', '[w3][f]blend=all_mode=lighten,gblur=sigma=1[wf]',
      '[a][m][wf]maskedmerge[a2]',
      '[c0][a2]alphamerge,format=yuva420p[v_out]',
    ].join(';');
    const r = ff(['-y', '-i', clip, '-c:v', 'libvpx-vp9', '-i', matte, ...raw(files.m), ...raw(files.b), ...raw(files.w), ...raw(files.l), ...raw(files.f), ...raw(files.r, `${rw}x${rh}`), ...raw(files.u), ...raw(files.v),
      '-filter_complex', graph, '-map', '[v_out]', '-an', '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', String(STEADY.crf), '-deadline', 'good', '-cpu-used', '4', '-row-mt', '1', '-auto-alt-ref', '0', out], { encoding: 'utf8' });
    const ok = r.status === 0 && fs.existsSync(out) && fs.statSync(out).size > 0;
    return { ok, changed: ok, message: ok ? '' : String(r.stderr || '').trim().split('\n').pop() };
  } finally {
    for (const f of Object.values(files)) fs.rmSync(f, { force: true });
  }
}
