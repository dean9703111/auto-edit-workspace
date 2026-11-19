// 修改單的標籤與文字格式：剪輯台（editor/app.js）和手機確認頁（versions.mjs site → work/site/index.html）共用這一份，
// 兩邊複製給 AI 的修改單一字不差（開頭「# 剪輯台修改單」，auto-edit-review 流程 F 照它改）。
// 沒有 import、只用瀏覽器和 Node 都有的語法：剪輯台從 /lib/requests-md.mjs 載入；手機確認頁把整支去掉 export 內嵌進頁面。

// 想怎麼改：動畫段一組、錄影段一組、只有講者的地方（想加畫面）一組
export const RQ_TAGS = {
  anim: ['流程更細節', '以圖像展示為主', '文字少一點', '畫出關係（箭頭、引線）', '換一種動畫', '動作慢一點', '跟講的話對齊', '更有質感'],
  media: ['播太快', '播太慢', '標註更清楚', '推近到操作區', '加步驟清單', '換成動畫', '換一段錄影', '跟講的話對齊'],
  gap: ['加一張字卡', '加一段動畫', '放錄影或圖片'],
};
export const RQ_HEAD = '# 剪輯台修改單';
export const RQ_REDO = '重新設計這一段（從空白重畫，比較久）';
export const RQ_REDO_NOTE = '沒勾：AI 在現有的動畫上改。勾了：另外請設計師從空白畫布重畫，比較貼講解，一段要多花幾分鐘。';

// 段的種類（plan.json 的 type；沒有段＝只有講者的地方）→ 用哪一組標籤
export const rqKindOf = (type) => (!type ? 'gap' : type === 'media' ? 'media' : 'anim');
const IMAGE_RE = /\.(png|jpe?g|webp|gif|avif|svg)$/i;
export const rqIsImage = (src) => IMAGE_RE.test(String(src || ''));

// 分:秒.十分之一（給 AI 看，不用格數）
export const rqMs = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
export const rqTime = (out) => (out ? `${rqMs(out[0])}–${rqMs(out[1])}` : '—');
const r2 = (n) => Math.round(n * 100) / 100;
const fmtRef = (v) => (typeof v === 'string' ? v : Number.isFinite(v) ? `${r2(v)} 秒` : '—');
// plan.json 那一段的起訖（原文：#N、#N@詞、秒數）
export const rqSpan = (sc) => `${fmtRef(sc.from ?? sc.at)} → ${fmtRef(sc.to ?? (sc.duration != null ? `+${sc.duration} 秒` : '預設長度'))}`;
// 這段在講什麼（分鏡寫的那一句）
export const rqTitle = (sc) => String(sc?.story?.say || sc?.story?.idea || '').trim();

// 動畫是什麼：what 寫給 AI（內部名稱），shown 給人看。names＝{ zh（情境或字卡動態的中文名）, customZh（模板動畫的中文名）, image（素材是圖片） }
export function rqWhat(sc, names = {}) {
  const type = sc?.type ?? 'scene', zh = names.zh ? `（${names.zh}）` : '';
  if (type === 'scene') return `資訊卡 ${sc.scene}${zh}`;
  if (type === 'fx') return `字卡動態 ${sc.fx}${zh}`;
  if (type === 'custom') return sc.template ? `模板動畫 ${sc.template}（${names.customZh || ''}）` : rqCustomKind(sc, names);
  return `${names.image ?? rqIsImage(sc.src) ? '圖片' : '螢幕錄影'} ${String(sc.src || '').split('/').pop()}`;
}
export const rqCustomKind = (sc, names = {}) => (sc?.design ? '動畫（為這段設計）' : sc?.template ? `動畫：${names.customZh || sc.template}` : '動畫');
export function rqShown(sc, names = {}) {
  const type = sc?.type ?? 'scene';
  if (type === 'custom') return rqCustomKind(sc, names);
  if (type === 'media') return `素材：${String(sc.src || '').split('/').pop()}`;
  return `字卡${names.zh ? `：${names.zh}` : ''}`;
}
// 檔案（自訂動畫、錄影）：從工作區根目錄寫起（AI 在根目錄執行，不用猜相對誰）；custom 的 src 相對 work/hyperframes，media 的 src 相對專案
export function rqFile(sc, project) {
  const type = sc?.type ?? 'scene';
  if (!sc?.src) return null;
  return type === 'custom' ? `${project}/work/hyperframes/${sc.src}` : type === 'media' ? `${project}/${sc.src}` : null;
}

// 複製給 AI 的那一行。pending：[{ id, redo }]。pasted：整份貼給 AI（手機確認頁不能寫檔），先叫 AI 把它存成修改單檔
export function rqCommand(project, pending, { pasted = false } = {}) {
  const file = `${project}/work/feedback/editor-requests.md`;
  const progress = `${pasted ? '存好之後' : ''}第一步跑 node shared/template/tools/versions.mjs begin --project ${JSON.stringify(project)} --requests`;
  const redo = pending.filter((r) => r.redo).map((r) => r.id);
  // 哪幾段要重新設計寫清楚：派設計師從空白重畫；其他段在現有的動畫上改
  const how = redo.length ? `其中 ${redo.length} 段要重新設計（${redo.join(',')}）：這幾段派設計師照 design.md 從空白畫布重畫；其他段在現有的動畫上改。` : '這次沒有要重新設計的段：都在現有的動畫上改。';
  const save = pasted ? `這份是從手機確認頁複製的整份修改單：先把整份原文存成 ${file}（覆寫），再` : '';
  return `照剪輯台修改單改這 ${pending.length} 段（${file}）：${save}照 auto-edit-review 流程 F 做（.agents/skills/auto-edit-review/references/editor-requests.md），不用先出提案，停在停點 ④。${how}${progress}`;
}

// 整份修改單。items：[{ id, label, what, file, out: [起, 迄]（完成影片秒數）|null, span, gap, kind, missing, redo, tags, note, subs: [{ n, text }] }]
// stamp：「YYYY-MM-DD HH:MM」；source：從哪裡複製（剪輯台、手機確認頁）
export function rqMarkdown({ project, stamp, items, source = '剪輯台', pasted = false }) {
  const L = [RQ_HEAD, '', rqCommand(project, items, { pasted }), '', `（${stamp} 從${source}複製）`];
  items.forEach((r, k) => {
    L.push('', `## ${k + 1}. ${r.id}${!r.missing && r.label ? `　${r.label}` : ''}`);
    if (r.missing) { L.push('- plan.json 裡找不到這段（可能被改名或刪掉了）'); }
    else L.push(`- 動畫：${r.what}`, ...(r.file ? [`- 檔案：${r.file}`] : []), `- 完成影片時間：${rqTime(r.out)}（${project}/work/hyperframes/plan.json：${r.span}）`);
    if (!r.missing && r.gap) L.push('- 這裡現在沒有段落：照時間和字幕新增一段（段號自己取），不是改既有的段；回報狀態時用上面的段號');
    if (!r.missing && !r.gap && r.kind === 'anim') L.push(r.redo
      ? '- 做法：重新設計（使用者勾的）。這段改成 "design": true，派設計師子代理照 design.md 從空白畫布重畫'
      : '- 做法：在現有的動畫上改（沒勾「重新設計」）。改 plan.json 的資料、換模板或手改那支檔；不要改成 "design": true');
    if (r.tags?.length) L.push(`- 要改：${r.tags.join('、')}`);
    if (String(r.note || '').trim()) L.push(`- 描述：${r.note.trim().replace(/\s*\n\s*/g, '／')}`);
    if (!r.missing && r.subs?.length) { L.push('- 對應字幕：'); for (const c of r.subs) L.push(`  - #${c.n} ${c.text}`); }
  });
  return L.join('\n') + '\n';
}

// 「YYYY-MM-DD HH:MM」
export const rqStamp = (d = new Date()) => {
  const p2 = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
};
