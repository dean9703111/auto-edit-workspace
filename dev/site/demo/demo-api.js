// 官網示範頁：頁面本身就是工作區真正的介面（build-site.mjs 從 shared/template/tools/editor/ 複製過來），
// 這支把它要打的 API 改成在瀏覽器裡回應。修改只留在記憶體，重新整理就還原，不會送到任何伺服器。
import { storyboardDocState, applyStoryboardEdit } from './storyboard-md.mjs';
import { BEAT_HEADERS, hashText, cutsDemoState, setDemoCut } from './demo-core.mjs';

const PAGE = location.pathname.includes('cuts') ? 'cuts' : 'storyboard';
const FILE = '瀏覽器（示範）';
const realFetch = window.fetch.bind(window);
let text = null;
const ready = realFetch(`${PAGE}.md`).then((r) => r.text()).then((t) => { text = t; });

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const imageUrl = (name) => `../shared/template/gallery/${encodeURIComponent(name)}`;
const base = { project: '示範專案', file: FILE, exists: true, readOnly: false };
const storyboard = () => ({ ...base, ...storyboardDocState(text, { hash: hashText, imageUrl, beatHeaders: BEAT_HEADERS }) });
const cuts = () => ({ ...base, hash: hashText(text), video: { url: 'main.mp4' }, ...cutsDemoState(text) });

function saveStoryboard(body) {
  if (body.hash !== hashText(text)) return json(409, { message: '內容剛被改過，已重新載入', state: storyboard() });
  try { text = applyStoryboardEdit(text, body, imageUrl); } catch (e) { return json(e.status || 400, { message: e.message }); }
  renderMarkdown();
  return json(200, storyboard());
}
function saveCuts(body) {
  for (const [row, on] of Object.entries(body.cut || {})) text = setDemoCut(text, row, on);
  renderMarkdown();
  return json(200, cuts());
}

window.fetch = async (input, init = {}) => {
  const route = String(input?.url ?? input);
  if (!route.startsWith('/api/')) return realFetch(input, init);
  await ready;
  const body = init.body ? JSON.parse(init.body) : {};
  if (route === '/api/storyboard') return json(200, storyboard());
  if (route === '/api/storyboard/save') return saveStoryboard(body);
  if (route === '/api/cuts') return json(200, cuts());
  if (route === '/api/cuts/save') return saveCuts(body);
  return json(404, { message: '示範版沒有這個功能' });
};

// ---------- 示範列：說清楚這是示範，也讓人看到背後真的是 Markdown ----------
const style = document.createElement('style');
style.textContent = `
  .demo-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; padding: 8px 16px; font-size: 13.5px; line-height: 1.5; background: color-mix(in srgb, var(--accent) 18%, var(--bg2)); border-bottom: 1px solid color-mix(in srgb, var(--accent) 55%, transparent); color: var(--ink); }
  .demo-bar b { color: var(--accent-text); }
  .demo-bar span { flex: 1 1 280px; }
  .demo-md { width: min(860px, calc(100vw - 32px)); max-height: 84vh; padding: 0; border: 1px solid var(--line2); border-radius: 10px; background: var(--bg2); color: var(--ink); }
  .demo-md::backdrop { background: rgba(0, 0, 0, .6); }
  .demo-md header { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--line); font-size: 14px; }
  .demo-md pre { margin: 0; padding: 14px 16px; max-height: calc(84vh - 60px); overflow: auto; font-family: var(--mono); font-size: 12.5px; line-height: 1.65; white-space: pre-wrap; overflow-wrap: anywhere; }`;
document.head.append(style);
const bar = document.createElement('div');
bar.className = 'demo-bar';
const fileName = PAGE === 'cuts' ? 'work/cuts.md' : 'work/storyboard.md';
bar.innerHTML = `<span><b>示範版</b>：這是工作區真正的介面，資料是示範內容。${PAGE === 'cuts' ? '示範影片沒有聲音。' : ''}修改只留在你的瀏覽器，重新整理就還原。</span><button type="button" id="demoMdBtn">看背後的 Markdown</button>`;
document.body.prepend(bar);
const dlg = document.createElement('dialog');
dlg.className = 'demo-md';
dlg.innerHTML = `<header><strong>實際使用時，這份內容就存在 ${fileName}</strong><button type="button" id="demoMdClose">關閉</button></header><pre id="demoMdText"></pre>`;
document.body.append(dlg);
function renderMarkdown() { document.getElementById('demoMdText').textContent = text ?? ''; }
document.getElementById('demoMdBtn').addEventListener('click', async () => { await ready; renderMarkdown(); dlg.showModal(); });
document.getElementById('demoMdClose').addEventListener('click', () => dlg.close());
