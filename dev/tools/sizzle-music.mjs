// 展示片的配樂（作者維護用）：用程式合成的電子節拍，不用下載素材、不經過外部服務（跟 make-sfx.mjs 的 AI 生成音效一樣以 CC0 釋出）。
// 133.3 BPM（一拍 0.45 秒）：展示片的每一次換頁都落在拍點上，所以節拍和畫面一起走。
//
//   makeMusic({ out, beat, drop, sections: [{ at, bars, level }], end, total }) → 寫 48 kHz 立體聲 wav
//     drop＝鼓進來的時間（開場大字之後）；sections＝每一段的起點（開頭放一顆 crash、前面一拍放上升的噪音）；
//     end＝結尾數字出現的時間（鼓停、留和弦）；total＝整首長度
import fs from 'node:fs';

const SR = 48000, TAU = 2 * Math.PI;
const N = (s) => Math.round(s * SR);
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const lp = (x, fc) => { const a = 1 - Math.exp(-TAU * fc / SR); let y = 0; const o = new Float64Array(x.length); for (let i = 0; i < x.length; i++) { y += a * (x[i] - y); o[i] = y; } return o; };
const hp = (x, fc) => { const l = lp(x, fc); return x.map((v, i) => v - l[i]); };
const midi = (m) => 440 * 2 ** ((m - 69) / 12);

export function makeMusic({ out, beat = 0.45, drop, sections = [], end, total }) {
  const len = N(total), L = new Float64Array(len), R = new Float64Array(len), duck = new Float64Array(len).fill(1);
  const rnd = rng(20261111);
  const add = (buf, at, gain = 1, pan = 0) => { const s = N(at), gl = gain * Math.min(1, 1 - pan), gr = gain * Math.min(1, 1 + pan); for (let i = 0; i < buf.length && s + i < len; i++) if (s + i >= 0) { L[s + i] += buf[i] * gl; R[s + i] += buf[i] * gr; } };
  // 音色
  const kick = (() => { const n = N(0.32), o = new Float64Array(n); let ph = 0; for (let i = 0; i < n; i++) { const t = i / SR, f = 46 + 110 * Math.exp(-t / 0.035); ph += TAU * f / SR; o[i] = Math.sin(ph) * Math.exp(-t / 0.13) + (i < 96 ? (rnd() * 2 - 1) * 0.3 * (1 - i / 96) : 0); } return o; })();
  const noise = (sec, tau) => { const n = N(sec), o = new Float64Array(n); for (let i = 0; i < n; i++) o[i] = (rnd() * 2 - 1) * Math.exp(-i / SR / tau); return o; };
  const hat = hp(noise(0.06, 0.012), 7000), hatO = hp(noise(0.18, 0.05), 6000);
  const clap = (() => { const o = new Float64Array(N(0.22)); for (const d of [0, 0.011, 0.023]) { const b = lp(hp(noise(0.19, 0.06), 900), 5500); for (let i = 0; i < b.length && N(d) + i < o.length; i++) o[N(d) + i] += b[i]; } return o; })();
  const crash = hp(noise(1.6, 0.42), 3500);
  const riser = (sec) => { const n = N(sec), w = new Float64Array(n); for (let i = 0; i < n; i++) w[i] = rnd() * 2 - 1; const o = new Float64Array(n); let y = 0; for (let i = 0; i < n; i++) { const u = i / n, a = 1 - Math.exp(-TAU * (300 + 9000 * u * u) / SR); y += a * (w[i] - y); o[i] = (w[i] - y) * u * u; } return o; };
  const saw = (f, sec, tau, cutoff) => { const n = N(sec), o = new Float64Array(n); for (let i = 0; i < n; i++) { const t = i / SR; let s = 0; for (let k = 1; k * f < 9000 && k < 24; k++) s += Math.sin(TAU * k * f * t) / k; o[i] = s * 0.6 * Math.exp(-t / tau) * Math.min(1, i / 64); } return lp(o, cutoff); };
  const sub = (f, sec) => { const n = N(sec), o = new Float64Array(n); for (let i = 0; i < n; i++) { const t = i / SR; o[i] = (Math.sin(TAU * f * t) + 0.35 * Math.sin(TAU * 2 * f * t)) * Math.min(1, i / 200) * Math.min(1, (n - i) / 400); } return o; };
  // 和聲：A 小調 Am–F–C–G，一小節（4 拍）換一個
  const CH = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], ROOT = [33, 29, 36, 31];
  const bars = Math.ceil((end - drop) / (beat * 4));
  const levelAt = (t) => { let l = 1; for (const s of sections) if (t >= s.at - 1e-6) l = s.level ?? 1; return l; };
  for (let b = 0; b < bars; b++) {
    const ch = CH[b % 4], root = ROOT[b % 4];
    for (let q = 0; q < 4; q++) {
      const t = drop + (b * 4 + q) * beat;
      if (t >= end - 1e-6) break;
      const lv = levelAt(t);
      add(kick, t, 0.95);
      for (let i = N(t), k = 0; k < N(beat) && i < len; i++, k++) duck[i] = Math.min(duck[i], 0.35 + 0.65 * Math.min(1, k / N(beat * 0.55)));   // 大鼓下去時其他聲音讓開
      add(hatO, t + beat / 2, 0.16 * lv, 0.2);
      if (lv >= 1) for (const e of [0.25, 0.75]) add(hat, t + beat * e, 0.12, -0.25);
      if (q % 2 === 1) add(clap, t, 0.42);
      add(sub(midi(root), beat * 0.42), t + beat / 2, 0.5);
      // 琶音：十六分音符走和弦音，越後面的段落越亮
      for (let s16 = 0; s16 < 4; s16++) { const note = ch[(q * 4 + s16) % 3] + (s16 % 2 ? 12 : 0) + (lv >= 1.2 ? 12 : 0); add(saw(midi(note), beat * 0.5, 0.09, 1400 + 1800 * lv), t + s16 * beat / 4, 0.16 * lv, s16 % 2 ? 0.45 : -0.45); }
    }
    add(saw(midi(ch[0] - 12), beat * 4, 1.4, 700), drop + b * 4 * beat, 0.16);   // 墊底的長音
  }
  // 開場：兩下重拍（對到兩行大字）＋上升的噪音接到鼓進來
  add(kick, 0.2, 1); add(crash, 0.2, 0.18); add(kick, 1.1, 1); add(crash, 1.1, 0.18);
  add(riser(drop - 1.2), 1.2, 0.5);
  for (const s of sections) { add(crash, s.at, 0.3); if (s.at - beat * 2 > drop) add(riser(beat * 2), s.at - beat * 2, 0.32); }
  // 結尾：鼓停，Am 和弦拉長，最後淡出
  add(crash, end, 0.4); add(kick, end, 1);
  for (const m of [45, 57, 60, 64, 69]) add(saw(midi(m), total - end, 2.2, 2200), end, 0.2, (m % 3 - 1) * 0.4);
  // 讓開（sidechain）只作用在鼓進來之後；總音量：軟限幅＋正規化到 −1 dBFS
  const dN = N(drop), eN = N(end);
  let pk = 0;
  for (let i = 0; i < len; i++) {
    const g = i >= dN && i < eN ? 0.55 + 0.45 * duck[i] : 1, fade = Math.min(1, (len - i) / N(1.2));
    L[i] = Math.tanh(L[i] * g * 1.3) * fade; R[i] = Math.tanh(R[i] * g * 1.3) * fade;
    pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
  }
  const k = 0.89 / (pk || 1), wav = Buffer.alloc(44 + len * 4);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + len * 4, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22);
  wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(len * 4, 40);
  for (let i = 0; i < len; i++) { wav.writeInt16LE(Math.round(L[i] * k * 32767), 44 + i * 4); wav.writeInt16LE(Math.round(R[i] * k * 32767), 46 + i * 4); }
  fs.writeFileSync(out, wav);
  return out;
}
