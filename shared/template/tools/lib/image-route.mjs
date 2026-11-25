// 生圖路線（087，零依賴）：每個 Agent 生成背景圖時走哪條路。記在 shared/setting.json 的 image（lib/settings.mjs），沒寫的用下面的預設。
//
//   "image": { "claude": "codex" }      Claude Code 改用 Codex 生圖；沒寫到的 Agent 照預設
//
//   Agent：claude（Claude Code）、codex（Codex）、minimax（MiniMax Code）、antigravity（Antigravity）、other（其他）
//   路線：html（寫網頁＋SVG，Chrome 截圖；每台都能用，所以是退路）、native（Agent 自己的生圖工具）、
//         codex（呼叫 codex exec）、antigravity（呼叫 agy）、mmx（MiniMax CLI）
//   預設：claude＝html（不是每個人都有 Codex）、codex＝native、minimax＝mmx、antigravity＝native、other＝native
//
//   detectAgent(env)                        → 'claude'｜'codex'｜null。MiniMax Code、Antigravity 跑指令時沒有留下可以認的環境變數（2026-11-25 實測），
//                                             認不出來就是 null，由呼叫的人帶 --agent
//   imageRoute(sharedDir, agent)            → { agent, route, from: 'setting'｜'default', problem }；設定寫錯＝problem 有字、route 用預設
//   saveImageRoute(sharedDir, agent, route) → { agent, route, file }；route 是 'off' 就拿掉那一格（回到預設）
//   resolveImageRoute(pick, state)          → { ...pick, use, blocked }：設定的路線這台不能用就退到 html（use），html 也不行是 null；
//                                             state＝{ html, codex, antigravity, mmx } 各是 caps.mjs 的結果（'ok'、'not-logged-in'、'missing'）
//   routeLine(resolved, { brief })          → 給人和 AI 看的那一行（不含開頭的「這次生圖走：」）；brief＝每個 Agent 各印一行時用，不重複寫 Agent 名稱與文件路徑
import { readSettings, writeSetting } from './settings.mjs';

export const AGENTS = { claude: 'Claude Code', codex: 'Codex', minimax: 'MiniMax Code', antigravity: 'Antigravity', other: '其他 Agent' };
export const ROUTES = { html: 'HTML', native: '自己的生圖工具', codex: 'Codex', antigravity: 'Antigravity', mmx: 'mmx' };
export const ROUTE_NOTES = {
  html: '寫網頁＋SVG，用 Chrome 截圖（每台都能用）',
  native: '這個 Agent 自己的生圖工具（沒有就改走 HTML）',
  codex: '呼叫 Codex CLI（要裝好、登入）',
  antigravity: '呼叫 Antigravity CLI（agy，要裝好、登入）',
  mmx: '呼叫 MiniMax CLI（要裝好、登入）',
};
export const ROUTE_DEFAULTS = { claude: 'html', codex: 'native', minimax: 'mmx', antigravity: 'native', other: 'native' };
// 每條路的指令在 .agents/skills/auto-edit-style/references/image-routing.md 的第幾節（native 的成品用第 1 節那一條轉）
export const ROUTE_DOC = '.agents/skills/auto-edit-style/references/image-routing.md';
export const ROUTE_SECTION = { native: 1, codex: 2, mmx: 3, html: 4, antigravity: 6 };
export const IMAGE_CMD = 'node shared/template/tools/brand.mjs image <路線>';
const AGENT_IDS = Object.keys(AGENTS), ROUTE_IDS = Object.keys(ROUTES);
const isObj = (j) => j && typeof j === 'object' && !Array.isArray(j);
const list = (ids) => ids.join('｜');
// Agent 選到「自己」（Codex 裡選 codex）＝用自己的生圖工具，不是自己再叫自己一次
const own = (agent, route) => (route === agent && (agent === 'codex' || agent === 'antigravity') ? 'native' : route);

export function detectAgent(env = process.env) {
  const claude = !!env.CLAUDECODE;
  const codex = !!(env.CODEX_THREAD_ID || env.CODEX_SANDBOX);   // 不看 CODEX_COMPANION_SESSION_ID：那是 Claude Code 的 Codex 外掛設的
  if (claude && !codex) return 'claude';
  if (codex && !claude) return 'codex';
  return null;   // 都沒有，或兩個都有（一個 Agent 叫另一個跑，分不出是誰）
}

export function checkAgent(agent) {
  if (!AGENT_IDS.includes(agent)) throw new Error(`--agent 只能是 ${list(AGENT_IDS)}（${AGENT_IDS.map((a) => `${a}＝${AGENTS[a]}`).join('、')}），現在是「${agent}」`);
  return agent;
}

export function imageRoute(sharedDir, agent) {
  const set = readSettings(sharedDir).data.image;
  const fallback = { agent, route: ROUTE_DEFAULTS[agent], from: 'default' };
  if (set === undefined) return { ...fallback, problem: null };
  if (!isObj(set)) return { ...fallback, problem: `shared/setting.json 的 image 要是物件（例 { "claude": "codex" }）→ 重新設定：${IMAGE_CMD}` };
  const v = set[agent];
  if (v === undefined) return { ...fallback, problem: null };
  if (!ROUTE_IDS.includes(v)) return { ...fallback, problem: `shared/setting.json 的 image.${agent} 只能是 ${list(ROUTE_IDS)}，現在是 ${JSON.stringify(v)}（先照預設走）→ 重新設定：${IMAGE_CMD}` };
  return { agent, route: own(agent, v), from: 'setting', problem: null };
}

export function saveImageRoute(sharedDir, agent, route) {
  checkAgent(agent);
  if (route !== 'off' && !ROUTE_IDS.includes(route)) throw new Error(`生圖路線只能是 ${list(ROUTE_IDS)}（或 off＝回到預設），現在是「${route}」`);
  const cur = readSettings(sharedDir).data.image;
  const next = { ...(isObj(cur) ? cur : {}) };
  if (route === 'off') delete next[agent]; else next[agent] = own(agent, route);
  const file = writeSetting(sharedDir, 'image', Object.keys(next).length ? next : undefined);
  return { agent, route: route === 'off' ? ROUTE_DEFAULTS[agent] : next[agent], file };
}

export function resolveImageRoute(pick, state) {
  const html = state.html === 'ok';
  if (pick.route === 'native') return { ...pick, use: 'native', html, blocked: null };
  if (state[pick.route] === 'ok') return { ...pick, use: pick.route, html, blocked: null };
  return { ...pick, use: pick.route !== 'html' && html ? 'html' : null, html, blocked: state[pick.route] || 'missing' };
}

const WHY = { 'not-logged-in': '未登入', missing: '沒有安裝或壞掉', 'version-mismatch': '版本不符' };
export function routeLine(r, { brief = false } = {}) {
  const src = r.from === 'setting' ? `shared/setting.json 的 image.${r.agent}` : brief ? '預設' : `${AGENTS[r.agent]} 的預設`;
  const sec = (route) => (brief ? `第 ${ROUTE_SECTION[route]} 節` : ` ${ROUTE_DOC} 第 ${ROUTE_SECTION[route]} 節`);
  const upload = '背景圖只能用使用者上傳的圖';
  if (r.use === 'native') {
    return `${ROUTES.native}（${src}）→ 做好的圖用${sec('native')}那一條轉；工具清單裡沒有生圖工具${r.html ? `就改走 HTML（第 ${ROUTE_SECTION.html} 節）` : `→ ${upload}`}`;
  }
  if (!r.blocked) return `${ROUTES[r.use]}（${src}）→ 指令在${sec(r.use)}`;
  if (r.route === 'html') return `無（HTML 截圖不能用：npx hyperframes browser ensure）→ ${upload}`;
  const why = `${src}${r.from === 'setting' ? ' 設的' : ''}是 ${ROUTES[r.route]}，但 ${ROUTES[r.route]} ${WHY[r.blocked] || r.blocked}`;
  if (r.use === 'html') return `HTML（${why}，先改走 HTML）→ 指令在${sec('html')}`;
  return `無（${why}，HTML 截圖也不能用）→ ${upload}`;
}
