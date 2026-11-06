// 分鏡表頁的下拉選單：情境、情境動畫、音效都從工作區現有的檔案讀，新增情境不用改這裡。
// 只用 Node 內建模組：官網組建（dev/tools/build-site.mjs）也用它產生示範頁的選項。
import fs from 'node:fs';
import path from 'node:path';

const LAYOUT = { chapter: '全幕', fullscreen: '子母畫面', panel: '半畫面' };
const GROUPS = ['疊加', '半畫面', '子母畫面', '全幕', '情境動畫', '內容設計'];
const GROUP_HINT = { 疊加: '講者滿版，卡片疊在上面', 半畫面: '講者在一邊，另一邊是面板', 子母畫面: '資訊占滿畫面，講者在小視窗', 全幕: '整張蓋住，看不到講者', 情境動畫: '會動的圖解，講者在小視窗', 內容設計: '不套模板，專門為這段內容設計畫面' };
const HIDDEN_CUSTOM = /-example-/;   // 範例檔，不是可以選的情境
const CUSTOM_NAME = /^x-[\w-]+$/;

const NICE_NAME = { 'x-scene': '插圖示意' };

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

export function storyboardOptions(templateDir, { portrait = false } = {}) {
  const groups = new Map(GROUPS.map((g) => [g, []]));
  const scenesDir = path.join(templateDir, 'scenes');
  for (const dir of fs.readdirSync(scenesDir).sort()) {
    const j = readJson(path.join(scenesDir, dir, 'scene.json'));
    if (!j?.zh || (portrait && j.portrait === 'none')) continue;
    const no = String(j.no).padStart(2, '0') + (dir.match(/^\d+([a-z])-/)?.[1] ?? '');
    groups.get(LAYOUT[j.family] || '疊加').push({ id: no, value: `${no} ${j.zh}`, label: j.zh, when: String(j.when || '').split('；')[0], preview: `${dir}.html` });
  }
  const customDir = path.join(templateDir, 'custom');
  for (const f of fs.readdirSync(customDir).filter((x) => x.endsWith('.html')).sort()) {
    const id = f.slice(0, -5);
    if (!CUSTOM_NAME.test(id) || HIDDEN_CUSTOM.test(id)) continue;
    const raw = (fs.readFileSync(path.join(customDir, f), 'utf8').match(/<title>([^<]*)<\/title>/i)?.[1] || id).trim();
    const title = NICE_NAME[id] || raw.replace(id, '').trim() || id;
    groups.get('情境動畫').push({ id, value: `${id} ${title}`, label: title, when: '', preview: `${id}.html` });
  }
  groups.get('內容設計').push({ id: 'design', value: '內容設計動畫', label: '內容設計動畫', when: '不套模板，專門為這段內容設計畫面', preview: null });
  const sfx = readJson(path.join(templateDir, 'kit', 'sfx.json')) || {};
  return {
    scenes: GROUPS.map((name) => ({ name, hint: GROUP_HINT[name], items: groups.get(name) })).filter((g) => g.items.length),
    sfx: [{ value: '預設', label: '預設（依情境自動配）' }, { value: '無', label: '不要音效' },
      ...Object.entries(sfx).filter(([, v]) => v?.kind === 'sfx').map(([value, v]) => ({ value, label: v.zh || value }))],
  };
}
