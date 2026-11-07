// HDR 素材（iPhone 預設的 HLG、部分手機與相機的 PQ）轉成 SDR BT.709。零依賴（這台 ffmpeg 不一定有 zscale，所以用 3D LUT：lut3d 內建）。
// 流程照 BT.2100／BT.2408：解訊號 → 顯示光（HLG 經 OOTF，峰值 1000 nit）→ 以參考白 203 nit 當 SDR 的白 → 亮部用 knee 收進來（看亮度、不動色相）→ BT.2020 換 BT.709 → γ2.4 編碼。
//
//   hdrKind(transfer)        ffprobe 的 color_transfer → 'hlg'｜'pq'｜null
//   hdrToSdr(kind, r, g, b)  一個顏色（R′G′B′，0–1）→ SDR 的 R′G′B′（給 LUT 與測試用）
//   hdrCube(kind)            寫好（或沿用）LUT，回傳檔案路徑（放系統暫存資料夾：專案路徑可能有濾鏡不能用的字元）
// 濾鏡片段（hdrChain、HDR_OUT）在 ff.mjs：ffmpeg 解碼 → RGB → 這張 LUT → 轉回 BT.709 的 yuv420p
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const VERSION = 2, SIZE = 65;
const PEAK = { hlg: 1000, pq: 4000 };   // 顯示峰值（nit）：HLG 參考顯示器 1000；PQ 實際內容多半在 4000 以下
const REF_WHITE = 203, KNEE = 0.75, GAMMA_HLG = 1.2, GAMMA_SDR = 2.4;
const HLG = { a: 0.17883277, b: 0.28466892, c: 0.55991073 };
const PQ = { m1: 2610 / 16384, m2: 2523 / 32, c1: 3424 / 4096, c2: 2413 / 128, c3: 2392 / 128 };
const Y2020 = [0.2627, 0.678, 0.0593];
const TO709 = [[1.660491, -0.587641, -0.07285], [-0.124551, 1.132900, -0.008349], [-0.018151, -0.100579, 1.118730]];

export const hdrKind = (transfer) => (transfer === 'arib-std-b67' ? 'hlg' : transfer === 'smpte2084' ? 'pq' : null);

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const hlgToScene = (e) => (e <= 0.5 ? (e * e) / 3 : (Math.exp((e - HLG.c) / HLG.a) + HLG.b) / 12);
const pqToNits = (e) => { const p = Math.max(e, 0) ** (1 / PQ.m2); return 10000 * (Math.max(p - PQ.c1, 0) / (PQ.c2 - PQ.c3 * p)) ** (1 / PQ.m1); };

// 亮度曲線：參考白以下幾乎不動，到峰值平滑收進 1（一階連續）
function toneY(y, peak) {
  if (y <= KNEE) return y;
  if (y >= peak) return 1;
  const p = (peak - KNEE) / (1 - KNEE);
  return KNEE + (1 - KNEE) * (1 - (1 - (y - KNEE) / (peak - KNEE)) ** p);
}

export function hdrToSdr(kind, r, g, b) {
  // 顯示光，以參考白＝1
  let rgb;
  if (kind === 'hlg') {
    const sc = [hlgToScene(r), hlgToScene(g), hlgToScene(b)];
    const ys = Math.max(dot(Y2020, sc), 0);
    const k = PEAK.hlg * ys ** (GAMMA_HLG - 1) / REF_WHITE;
    rgb = sc.map((v) => v * k);
  } else rgb = [pqToNits(r), pqToNits(g), pqToNits(b)].map((v) => v / REF_WHITE);
  // 亮度壓到 SDR 範圍，顏色比例不動
  const y = dot(Y2020, rgb), peak = PEAK[kind] / REF_WHITE;
  const s = y > 0 ? toneY(y, peak) / y : 0;
  rgb = rgb.map((v) => v * s);
  // BT.2020 → BT.709：負的（比 BT.709 更飽和）切到 0；超過 1 的（又亮又鮮豔）三個通道一起縮，不往灰拉：往灰拉會把鮮豔的紅、綠洗成粉色
  let out = TO709.map((row) => Math.max(dot(row, rgb), 0));
  const hi = Math.max(...out);
  if (hi > 1) out = out.map((v) => v / hi);
  return out.map((v) => clamp01(v) ** (1 / GAMMA_SDR));
}

export function hdrCube(kind) {
  const file = path.join(os.tmpdir(), `auto-edit-${kind}-to-sdr-v${VERSION}.cube`);
  if (fs.existsSync(file)) return file;
  const lines = [`TITLE "${kind} to SDR BT.709"`, `LUT_3D_SIZE ${SIZE}`, 'DOMAIN_MIN 0 0 0', 'DOMAIN_MAX 1 1 1'];
  const n = SIZE - 1;
  for (let b = 0; b <= n; b++) for (let g = 0; g <= n; g++) for (let r = 0; r <= n; r++) lines.push(hdrToSdr(kind, r / n, g / n, b / n).map((v) => v.toFixed(6)).join(' '));
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${lines.join('\n')}\n`);
  fs.renameSync(tmp, file);
  return file;
}
