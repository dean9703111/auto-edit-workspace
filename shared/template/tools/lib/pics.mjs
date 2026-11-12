// 圖庫（028）：shared/template/kit/pics/ 的常用物件線稿（約 400 個），目錄分三層，用到哪一層讀哪一層：
//   catalog.json            總目錄：有哪幾類、每一類什麼時候翻（categories[].when）
//   <類別>.json             這一類的項目：{ id, zh, when（使用時機）, tags（講者可能說的詞）, file, from（來源） }
//   <類別>/<id>.svg         圖本身（線稿畫風同 kit/illus-style.md：白色主體、墨線 4px 不隨縮放變粗、主色淡影；顏色都是 --il-* token）
// 掛到畫面：<div data-illus-src="kit/pics/<類別>/<id>.svg" style="width:320px;height:320px"></div>（都是正方形）
//
//   loadPics(kitDir)                 → { cats: [{ id, zh, when, count }], items: [{ id, cat, zh, when, tags, file, from }], byId: Map } | null（沒有圖庫）
//   findPics(lib, query, { limit })  → 照符合程度排好的項目（比對 id、中文名、關鍵字、使用時機；中文詞互相包含就算）
//   picSrc(item)                     → 'kit/pics/<類別>/<id>.svg'（data-illus-src 的值，相對主合成 index.html）
//   picsCmd(words, { kitDir })       → build.mjs --pics 的輸出（不帶詞＝印目錄；帶類別 id＝印那一類；帶詞＝找符合的）
import fs from 'node:fs';
import path from 'node:path';

export const PICS_DIR = 'pics';
export const PIC_SIZE = 320;   // 建議的顯示大小（主角長邊 300–480）

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

const CACHE = new Map();
export function loadPics(kitDir) {
  if (CACHE.has(kitDir)) return CACHE.get(kitDir);
  const dir = path.join(kitDir, PICS_DIR), cat = readJson(path.join(dir, 'catalog.json'));
  let lib = null;
  if (cat?.categories) {
    const cats = [], items = [];
    for (const c of cat.categories) {
      const idx = readJson(path.join(dir, c.index || `${c.id}.json`));
      if (!idx?.items) continue;
      cats.push({ id: c.id, zh: c.zh, when: c.when, count: idx.items.length });
      for (const it of idx.items) items.push({ ...it, cat: c.id, catZh: c.zh });
    }
    lib = { cats, items, byId: new Map(items.map((it) => [it.id, it])) };
  }
  CACHE.set(kitDir, lib);
  return lib;
}

export const picSrc = (item) => `kit/${PICS_DIR}/${item.file}`;
// data-illus-src 的值是不是圖庫的路徑 → 項目（不是或沒有這個檔回 null）
export function picOfSrc(lib, src) {
  const m = String(src || '').match(/^kit\/pics\/([\w-]+)\/([\w-]+)\.svg$/);
  if (!m || !lib) return null;
  const it = lib.byId.get(m[2]);
  return it && it.cat === m[1] ? it : null;
}

const norm = (s) => String(s || '').toLowerCase().replace(/[\s_]+/g, '-');
function score(it, q) {
  const id = norm(it.id), zh = it.zh || '', tags = it.tags || [];
  if (id === q || zh === q) return 100;
  if (tags.includes(q)) return 90;
  if (id.split('-').includes(q)) return 80;
  if (zh.includes(q) || (q.length >= 2 && q.includes(zh))) return 70;
  if (tags.some((t) => norm(t).includes(q) || (q.length >= 2 && t.length >= 2 && q.includes(norm(t))))) return 60;
  if (id.includes(q)) return 50;
  if (id.length >= 3 && q.includes(id)) return 40;   // 打多了（phones → phone）
  if ((it.when || '').toLowerCase().includes(q)) return 30;
  return 0;
}
export function findPics(lib, query, { limit = 6 } = {}) {
  const q = norm(query);
  if (!lib || !q) return [];
  return lib.items.map((it) => ({ it, s: score(it, q) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s || a.it.id.length - b.it.id.length).slice(0, limit).map((x) => x.it);
}

const line = (it) => `  ${it.id}（${it.zh}｜${it.catZh}）：${it.when} → data-illus-src="${picSrc(it)}"`;
export function picsCmd(words, { kitDir, log = console.log } = {}) {
  const lib = loadPics(kitDir);
  if (!lib) { log('✖ 這個工作區沒有圖庫（shared/template/kit/pics/catalog.json）'); return 1; }
  const list = String(words === true ? '' : words || '').split(/[,，、\s]+/).filter(Boolean);
  if (!list.length) {
    log(`圖庫：${lib.items.length} 個常用物件的線稿，分 ${lib.cats.length} 類。先看是哪一類，再查那一類（--pics <類別>），或直接用詞找（--pics 手機,雲端）`);
    for (const c of lib.cats) log(`  ${c.id}（${c.zh}，${c.count} 個）：${c.when}`);
    log(`掛到畫面：<div data-illus-src="kit/pics/<類別>/<id>.svg" style="width:${PIC_SIZE}px;height:${PIC_SIZE}px"></div>（都是正方形；主角 300–480px）`);
    return 0;
  }
  for (const w of list) {
    const cat = lib.cats.find((c) => c.id === w || c.zh === w);
    if (cat) {
      log(`${cat.id}（${cat.zh}）：${cat.when}`);
      for (const it of lib.items.filter((x) => x.cat === cat.id)) log(line(it));
      continue;
    }
    const hits = findPics(lib, w);
    if (!hits.length) { log(`${w}：圖庫沒有 → 換一個詞（物件的名稱，例 手機、雲端、獎盃），或看目錄（--pics 不帶詞）；真的沒有再用圖示（--icons）或照 kit/illus-style.md 新畫`); continue; }
    log(`${w}：`);
    for (const it of hits) log(line(it));
  }
  return 0;
}
