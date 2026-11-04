// 構圖頁的單集風格。所有草稿與套用記錄留在 work/design，不覆寫共用模板。
import fs from 'node:fs';
import path from 'node:path';

export function appliedDesign(project) {
  if (!project) return null;
  try {
    const data = JSON.parse(fs.readFileSync(path.join(project, 'work', 'design', 'applied.json'), 'utf8'));
    const plan = JSON.parse(fs.readFileSync(path.join(project, 'work', 'hyperframes', 'plan.json'), 'utf8'));
    if ((data.style || '') !== (plan.style || '')) return null;
    if (!/^[a-f0-9-]{36}$/.test(data.id)) return null;
    const dir = path.join(project, 'work', 'design', 'drafts', data.id);
    return fs.existsSync(path.join(dir, 'brand.css')) ? { ...data, dir } : null;
  } catch { return null; }
}
