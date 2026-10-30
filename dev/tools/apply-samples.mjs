#!/usr/bin/env node
// 把 samples.json 的範例文案套到 workspace/shared/template/scenes/*/scene.json 的 sample。
// 只覆寫 sample.title／sample.sub／sample.slots；sample.duration 與 sample.beats（以及 scene.json 其他欄位）保留原值。
// 用法：node dev/tools/apply-samples.mjs [--dry-run]（在 auto-edit-workspace 根目錄；舊位置 video/minimax/素材/tools/ 也能跑）
//   --dry-run  只印出每個情境改了什麼，不寫檔。
// 重新同步 skill 模板之後：整包複製 scenes → 重跑本腳本。零依賴。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const here = path.dirname(fileURLToPath(import.meta.url));
// 兩種擺法：agent-skills 的 video/minimax/素材/tools/（工作區在 ../workspace）、獨立 repo 的 dev/tools/（工作區就是 ../..）
const legacy = path.resolve(here, '../workspace');
const WS = fs.existsSync(path.join(legacy, 'shared', 'template')) ? legacy : path.resolve(here, '../..');
const SCENES = path.join(WS, 'shared', 'template', 'scenes');
const SAMPLES = path.join(here, 'samples.json');
const dryRun = process.argv.includes('--dry-run');

// 單行序列化：陣列 [a, b]、物件 { "k": v }，風格對齊 scene.json 既有的 sample 區塊
const ser = (v) => {
  if (Array.isArray(v)) return `[${v.map(ser).join(', ')}]`;
  if (v && typeof v === 'object') {
    const e = Object.entries(v);
    return e.length ? `{ ${e.map(([k, x]) => `${JSON.stringify(k)}: ${ser(x)}`).join(', ')} }` : '{}';
  }
  return JSON.stringify(v);
};

// 找出頂層 "sample": { … } 的文字範圍（字串感知的大括號配對）
function findSampleBlock(text) {
  const m = /\n {2}"sample":\s*\{/.exec(text);
  if (!m) return null;
  const start = m.index + 1;
  let i = m.index + m[0].length, depth = 1, inStr = false;
  for (; i < text.length && depth > 0; i++) {
    const c = text[i];
    if (inStr) { if (c === '\\') i++; else if (c === '"') inStr = false; }
    else if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') depth--;
  }
  return { start, end: i };
}

function renderSample(s) {
  const lines = Object.entries(s).map(([k, v]) => {
    if (k === 'slots') {
      const slots = Object.entries(v).map(([sk, sv]) => `      ${JSON.stringify(sk)}: ${ser(sv)}`).join(',\n');
      return `    "slots": {\n${slots}\n    }`;
    }
    return `    ${JSON.stringify(k)}: ${ser(v)}`;
  });
  return `  "sample": {\n${lines.join(',\n')}\n  }`;
}

const samples = JSON.parse(fs.readFileSync(SAMPLES, 'utf8'));
const errors = [];
const used = new Set();
let changed = 0;

for (const dir of fs.readdirSync(SCENES).sort()) {
  const file = path.join(SCENES, dir, 'scene.json');
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  const scene = JSON.parse(text);
  const src = samples[scene.key];
  if (!src) { errors.push(`${dir}：samples.json 沒有「${scene.key}」`); continue; }
  used.add(scene.key);
  if (typeof src.title !== 'string' || typeof src.sub !== 'string' || !src.slots || typeof src.slots !== 'object') {
    errors.push(`${dir}：samples.json 的「${scene.key}」需要 title(字串)、sub(字串)、slots(物件)`);
    continue;
  }

  const old = scene.sample || {};
  const next = { ...old, title: src.title, sub: src.sub, slots: src.slots };

  // 印差異
  const diffLines = [];
  for (const k of ['title', 'sub']) if (old[k] !== next[k]) diffLines.push(`  - ${k}: ${ser(old[k])}`, `  + ${k}: ${ser(next[k])}`);
  for (const k of new Set([...Object.keys(old.slots || {}), ...Object.keys(next.slots)])) {
    const a = (old.slots || {})[k], b = next.slots[k];
    if (!isDeepStrictEqual(a, b)) {
      if (a !== undefined) diffLines.push(`  - slots.${k}: ${ser(a)}`);
      if (b !== undefined) diffLines.push(`  + slots.${k}: ${ser(b)}`);
    }
  }
  console.log(`${dir} (${scene.key})${diffLines.length ? '' : '：無變更'}`);
  if (diffLines.length) console.log(diffLines.join('\n'));
  if (!diffLines.length) continue;
  changed++;
  if (dryRun) continue;

  const blk = findSampleBlock(text);
  if (!blk || !/^\s*\}\s*$/.test(text.slice(blk.end))) { errors.push(`${dir}：scene.json 的 sample 不是最後一個頂層欄位，無法安全改寫`); continue; }
  const out = text.slice(0, blk.start) + renderSample(next) + text.slice(blk.end);
  const re = JSON.parse(out);
  // 自檢：除了 sample.title／sub／slots 之外，其餘（含 duration、beats）要和原本一模一樣
  const same = isDeepStrictEqual({ ...re, sample: { ...re.sample, title: 0, sub: 0, slots: 0 } }, { ...scene, sample: { ...old, title: 0, sub: 0, slots: 0 } });
  if (!same || !isDeepStrictEqual(re.sample.slots, src.slots)) { errors.push(`${dir}：改寫後自檢失敗，未寫檔`); continue; }
  fs.writeFileSync(file, out);
}

for (const k of Object.keys(samples)) if (!used.has(k)) errors.push(`samples.json 的「${k}」沒有對應的情境`);

console.log(`\n${dryRun ? '[dry-run] ' : ''}${changed} 個情境有變更，${errors.length} 個錯誤`);
if (errors.length) { console.error(errors.map((e) => `✖ ${e}`).join('\n')); process.exit(1); }
