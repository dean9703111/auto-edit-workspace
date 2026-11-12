// 圖庫（028）：shared/template/kit/pics/ 的目錄、每一張 SVG 的畫風規則、查詢、x-scene 的 pic、audit 認得圖庫路徑
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { TEMPLATE, WORKSPACE as ROOT, imp } from './helpers.mjs';

const { loadPics, findPics, picSrc, picOfSrc, picsCmd } = await imp('lib/pics.mjs');
const KIT = path.join(TEMPLATE, 'kit'), DIR = path.join(KIT, 'pics');
const cat = JSON.parse(fs.readFileSync(path.join(DIR, 'catalog.json'), 'utf8'));
const lib = loadPics(KIT);

test('目錄三層對得上：catalog.json → <類別>.json → <類別>/<id>.svg；每個項目都有中文名、使用時機、關鍵字、來源', () => {
  assert.ok(lib && lib.items.length >= 400, `圖庫至少 400 個，現在 ${lib?.items.length}`);
  assert.equal(cat.count, lib.items.length);
  assert.equal(new Set(lib.items.map((x) => x.id)).size, lib.items.length, 'id 全庫不重複');
  for (const c of cat.categories) {
    assert.ok(c.zh && c.when, `${c.id} 要有中文名和「什麼時候翻這一類」`);
    const idx = JSON.parse(fs.readFileSync(path.join(DIR, c.index), 'utf8'));
    assert.equal(idx.items.length, c.count, `${c.id} 的 count`);
    for (const it of idx.items) {
      assert.match(it.id, /^[a-z][a-z0-9-]*$/);
      assert.ok(it.zh && it.when && it.tags.length >= 1, `${it.id} 要有中文名、使用時機、關鍵字`);
      assert.match(it.when, /^講到/, `${it.id} 的使用時機寫「講到…」`);
      assert.equal(it.file, `${c.id}/${it.id}.svg`);
      assert.ok(fs.existsSync(path.join(DIR, it.file)), `${it.file} 不在`);
      assert.match(it.from, /^(tabler|lucide):[\w-]+$/);
    }
  }
  // 資料夾裡沒有目錄沒列的圖
  for (const c of cat.categories) assert.deepEqual(fs.readdirSync(path.join(DIR, c.id)).sort(), lib.items.filter((x) => x.cat === c.id).map((x) => `${x.id}.svg`).sort());
});

test('來源與授權：Tabler（MIT）的授權檔跟著圖庫走、Lucide 用 kit 既有的那一份；來源清單（dev/pics/catalog.tsv）和目錄一致', () => {
  assert.match(fs.readFileSync(path.join(DIR, 'LICENSE-tabler.txt'), 'utf8'), /MIT License[\s\S]*Paweł Kuna/);
  assert.ok(fs.existsSync(path.join(KIT, 'LICENSE-lucide.txt')));
  assert.deepEqual(cat.sources.map((s) => s.license), ['MIT', 'ISC']);
  const tsv = fs.readFileSync(path.join(ROOT, 'dev', 'pics', 'catalog.tsv'), 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('#')).map((l) => l.split('|')[0].trim());
  assert.deepEqual([...tsv].sort(), lib.items.map((x) => x.id).sort(), '改了清單要重跑 node dev/tools/pics-build.mjs');
});

test('每一張的畫風規則（同 kit/illus-style.md）：只有基本形狀、顏色只用 --il-* token、線 4px 不隨縮放變粗、不寫 id／style／text', () => {
  const bad = [];
  for (const it of lib.items) {
    const svg = fs.readFileSync(path.join(DIR, it.file), 'utf8');
    if (!svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 26" fill="none">')) bad.push(`${it.id}：最外層`);
    for (const m of svg.matchAll(/<([a-zA-Z]+)\b/g)) if (!['svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon'].includes(m[1])) bad.push(`${it.id}：不能用 <${m[1]}>`);
    for (const m of svg.matchAll(/\b(fill|stroke)="([^"]*)"/g)) if (m[2] !== 'none' && !/^var\(--il-[a-z-]+\)$/.test(m[2])) bad.push(`${it.id}：${m[1]}="${m[2]}"`);
    for (const m of svg.matchAll(/<[a-z]+\b[^>]*\bstroke="var[^>]*>/g)) if (!/stroke-width="4"/.test(m[0]) || !/vector-effect="non-scaling-stroke"/.test(m[0])) bad.push(`${it.id}：線要 4px、non-scaling-stroke`);
    if (/\b(id|style|href|on[a-z]+)=|<text|<image|<use|<style|<script/.test(svg)) bad.push(`${it.id}：有 id／style／text 之類`);
    if (!/stroke="var\(--il-line\)"/.test(svg)) bad.push(`${it.id}：沒有任何線`);
  }
  assert.deepEqual(bad.slice(0, 10), []);
});

test('findPics：中文名、關鍵字、英文 id 都找得到；找不到回空陣列；picSrc／picOfSrc 來回對得上', () => {
  assert.equal(findPics(lib, '手機')[0].id, 'phone');
  assert.equal(findPics(lib, '獎盃')[0].id, 'trophy');
  assert.equal(findPics(lib, 'rocket')[0].id, 'rocket');
  assert.ok(findPics(lib, '存錢').some((x) => x.id === 'pig-money'), '關鍵字');
  assert.deepEqual(findPics(lib, '不存在的東西'), []);
  assert.ok(findPics(lib, '雲端', { limit: 3 }).length <= 3);
  const it = lib.byId.get('camera');
  assert.equal(picSrc(it), 'kit/pics/device/camera.svg');
  assert.equal(picOfSrc(lib, 'kit/pics/device/camera.svg').id, 'camera');
  assert.equal(picOfSrc(lib, 'kit/pics/money/camera.svg'), null, '類別不對不認');
  assert.equal(picOfSrc(lib, 'illus-local/router.svg'), null);
});

test('build.mjs --pics：不帶詞印目錄（一類一行）；帶類別印那一類；帶詞印符合的整行寫法；找不到有下一步', () => {
  const out = (w) => { const L = []; picsCmd(w, { kitDir: KIT, log: (s) => L.push(s) }); return L; };
  const top = out(true);
  assert.equal(top.length, cat.categories.length + 2);
  assert.match(top[0], new RegExp(`${lib.items.length} 個`));
  assert.ok(out('device').length === 1 + lib.items.filter((x) => x.cat === 'device').length);
  assert.ok(out('手機,獎盃').some((l) => l.includes('data-illus-src="kit/pics/work/trophy.svg"')));
  assert.match(out('不存在的東西')[0], /圖庫沒有 → /);
});

test('x-scene 的 parts 可以寫 pic：產生 data-illus-src="kit/pics/…"、正方形；id 寫錯列出相近的', async () => {
  const F = await imp('lib/custom-fill.mjs');
  const { loadIcons } = await imp('lib/scenes.mjs');
  const spec = F.readFillSpec(path.join(TEMPLATE, 'custom'), 'x-scene'), html = fs.readFileSync(path.join(TEMPLATE, 'custom', 'x-scene.html'), 'utf8');
  const slots = { title: '以前的傳檔流程', parts: [{ id: 'a', pic: 'phone', label: '手機' }, { id: 'b', pic: 'cloud-upload', label: '雲端' }], links: ['a>b'],
    beats: [{ at: '#182@手機', in: ['a'], focus: 'a' }, { at: '#183@雲端', in: ['b'], line: 'a-b', focus: 'b' }] };
  const r = F.fillTemplate({ spec, html, id: 'x1', slots, icons: loadIcons(TEMPLATE), kitDir: KIT });
  assert.deepEqual(r.errors, []);
  const m = r.html.match(/<div data-illus-src="kit\/pics\/device\/phone\.svg" style="width:(\d+)px;height:(\d+)px">/);
  assert.ok(m && m[1] === m[2] && Number(m[1]) >= 300, `圖庫的圖是正方形、主角夠大（${m && m[1]}×${m && m[2]}）`);
  assert.match(F.renderSheet(spec, slots, 'x1'), /`pic:phone`/, '分鏡表的插圖欄寫 pic:<id>');
  const bad = F.validateScene({ ...slots, parts: [{ id: 'a', pic: 'phones' }, slots.parts[1]] }, { kitDir: KIT });
  assert.match(bad.join('\n'), /圖庫沒有「phones」（相近的：.*phone（手機）/);
});

test('audit：data-illus-src 是圖庫路徑不報 ✖；分鏡表插圖欄的 pic:<id> 認得，id 不存在照報', async () => {
  const { illusNameFindings } = await imp('lib/audit-illus.mjs');
  const item = { id: 's1', label: 's1' };
  const html = '<div data-illus-src="kit/pics/device/phone.svg"></div><div data-illus-src="kit/pics/device/nope.svg"></div>';
  const f = illusNameFindings({ item, html, local: [], isPic: (s) => !!picOfSrc(lib, s) });
  assert.equal(f.length, 1);
  assert.match(f[0].msg, /nope\.svg/);
  assert.match(f[0].fix, /kit\/pics\/<類別>\/<id>\.svg/);
});

test('圖庫頁（kit/pics-gallery.html）：每一張都在、可以搜尋、點了複製寫法', () => {
  const page = fs.readFileSync(path.join(KIT, 'pics-gallery.html'), 'utf8');
  assert.equal((page.match(/class="pic"/g) || []).length, lib.items.length);
  assert.match(page, /id="q" type="search"/);
  assert.match(page, /navigator\.clipboard\.writeText/);
  assert.match(page, /Tabler Icons<\/a>（MIT）/);
});
