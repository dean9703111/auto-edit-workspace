// 087 生圖路線：每個 Agent 走哪條路記在 shared/setting.json 的 image；caps.mjs 印「這次生圖走」、brand.mjs image 看與設定。
// 不呼叫真的 codex／mmx／agy（caps 用假的執行器），設定寫在暫存的 shared/setting.json。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { imp, TOOLS, WORKSPACE, tmpDir } from './helpers.mjs';

const { detectAgent, imageRoute, saveImageRoute, resolveImageRoute, routeLine, ROUTE_DEFAULTS, ROUTE_DOC, ROUTE_SECTION } = await imp('lib/image-route.mjs');
const { probeCaps, formatCaps } = await imp('caps.mjs');

const shared = (t, setting) => {
  const root = tmpDir(t, 'img-route-'), dir = path.join(root, 'shared');
  fs.mkdirSync(path.join(dir, 'template', 'kit'), { recursive: true });
  if (setting !== undefined) fs.writeFileSync(path.join(dir, 'setting.json'), JSON.stringify(setting, null, 2));
  return { root, dir, kit: path.join(dir, 'template', 'kit'), read: () => JSON.parse(fs.readFileSync(path.join(dir, 'setting.json'), 'utf8')) };
};

test('detectAgent：Claude Code、Codex 認得出來；都沒有、兩個都有、只有 Codex 外掛的記號＝認不出來或照另一個', () => {
  assert.equal(detectAgent({ CLAUDECODE: '1' }), 'claude');
  assert.equal(detectAgent({ CODEX_THREAD_ID: 'abc' }), 'codex');
  assert.equal(detectAgent({ CODEX_SANDBOX: 'seatbelt' }), 'codex');
  assert.equal(detectAgent({}), null);
  assert.equal(detectAgent({ CLAUDECODE: '1', CODEX_THREAD_ID: 'abc' }), null, '一個 Agent 叫另一個跑，分不出是誰');
  assert.equal(detectAgent({ CLAUDECODE: '1', CODEX_COMPANION_SESSION_ID: 'x' }), 'claude', 'Claude Code 的 Codex 外掛不算 Codex');
});

test('imageRoute：沒設定用預設（Claude Code＝html）；設定了照設定；寫錯給 problem、先照預設；選到自己＝native', (t) => {
  const a = shared(t);
  assert.deepEqual(ROUTE_DEFAULTS, { claude: 'html', codex: 'native', minimax: 'mmx', antigravity: 'native', other: 'native' });
  assert.deepEqual(imageRoute(a.dir, 'claude'), { agent: 'claude', route: 'html', from: 'default', problem: null });
  const b = shared(t, { image: { claude: 'codex', minimax: 'gpt', codex: 'codex' } });
  assert.deepEqual(imageRoute(b.dir, 'claude'), { agent: 'claude', route: 'codex', from: 'setting', problem: null });
  assert.equal(imageRoute(b.dir, 'antigravity').from, 'default');
  const bad = imageRoute(b.dir, 'minimax');
  assert.equal(bad.route, 'mmx');
  assert.match(bad.problem, /^shared\/setting\.json 的 image\.minimax 只能是 html｜native｜codex｜antigravity｜mmx，現在是 "gpt"（先照預設走）→ 重新設定：node shared\/template\/tools\/brand\.mjs image <路線>$/);
  assert.equal(imageRoute(b.dir, 'codex').route, 'native', 'Codex 裡選 codex＝用自己的生圖工具');
  assert.match(imageRoute(shared(t, { image: 'codex' }).dir, 'claude').problem, /image 要是物件/);
});

test('saveImageRoute：只改那個 Agent 那一格，其他設定留著；off 拿掉，空了整個 image 拿掉；寫錯丟錯', (t) => {
  const a = shared(t, { speaker: { name: '林大寶' }, agents: 6 });
  assert.equal(saveImageRoute(a.dir, 'claude', 'codex').route, 'codex');
  saveImageRoute(a.dir, 'minimax', 'html');
  assert.deepEqual(a.read(), { speaker: { name: '林大寶' }, agents: 6, image: { claude: 'codex', minimax: 'html' } });
  assert.equal(saveImageRoute(a.dir, 'antigravity', 'antigravity').route, 'native');
  saveImageRoute(a.dir, 'antigravity', 'off');
  assert.equal(saveImageRoute(a.dir, 'claude', 'off').route, 'html', '回到預設');
  assert.deepEqual(a.read().image, { minimax: 'html' });
  saveImageRoute(a.dir, 'minimax', 'off');
  assert.deepEqual(a.read(), { speaker: { name: '林大寶' }, agents: 6 });
  assert.throws(() => saveImageRoute(a.dir, 'claude', 'dalle'), /生圖路線只能是 html｜native｜codex｜antigravity｜mmx（或 off＝回到預設），現在是「dalle」/);
  assert.throws(() => saveImageRoute(a.dir, 'gemini', 'html'), /--agent 只能是 claude｜codex｜minimax｜antigravity｜other/);
});

test('resolveImageRoute＋routeLine：能用照走；不能用退到 HTML 並說原因；HTML 也不行＝無；native 交給 Agent 自己判斷', () => {
  const ok = { html: 'ok', codex: 'ok', antigravity: 'ok', mmx: 'ok' };
  const line = (pick, state, o) => routeLine(resolveImageRoute({ problem: null, ...pick }, state), o);
  assert.equal(line({ agent: 'claude', route: 'html', from: 'default' }, ok), `HTML（Claude Code 的預設）→ 指令在 ${ROUTE_DOC} 第 4 節`);
  assert.equal(line({ agent: 'claude', route: 'codex', from: 'setting' }, ok), `Codex（shared/setting.json 的 image.claude）→ 指令在 ${ROUTE_DOC} 第 2 節`);
  assert.equal(line({ agent: 'claude', route: 'antigravity', from: 'setting' }, ok), `Antigravity（shared/setting.json 的 image.claude）→ 指令在 ${ROUTE_DOC} 第 6 節`);
  assert.equal(line({ agent: 'claude', route: 'codex', from: 'setting' }, { ...ok, codex: 'not-logged-in' }),
    `HTML（shared/setting.json 的 image.claude 設的是 Codex，但 Codex 未登入，先改走 HTML）→ 指令在 ${ROUTE_DOC} 第 4 節`);
  assert.equal(line({ agent: 'minimax', route: 'mmx', from: 'default' }, { ...ok, mmx: 'missing' }, { brief: true }), 'HTML（預設是 mmx，但 mmx 沒有安裝或壞掉，先改走 HTML）→ 指令在第 4 節');
  assert.equal(line({ agent: 'minimax', route: 'mmx', from: 'default' }, { ...ok, mmx: 'missing', html: 'missing' }),
    '無（MiniMax Code 的預設是 mmx，但 mmx 沒有安裝或壞掉，HTML 截圖也不能用）→ 背景圖只能用使用者上傳的圖');
  assert.equal(line({ agent: 'claude', route: 'html', from: 'default' }, { ...ok, html: 'missing' }), '無（HTML 截圖不能用：npx hyperframes browser ensure）→ 背景圖只能用使用者上傳的圖');
  assert.equal(line({ agent: 'codex', route: 'native', from: 'default' }, ok),
    `自己的生圖工具（Codex 的預設）→ 做好的圖用 ${ROUTE_DOC} 第 1 節那一條轉；工具清單裡沒有生圖工具就改走 HTML（第 4 節）`);
  assert.equal(line({ agent: 'other', route: 'native', from: 'default' }, { ...ok, html: 'missing' }, { brief: true }),
    '自己的生圖工具（預設）→ 做好的圖用第 1 節那一條轉；工具清單裡沒有生圖工具→ 背景圖只能用使用者上傳的圖');
});

test('工具印的「第 N 節」對得到 image-routing.md 的標題（節號改了這裡會抓到）', () => {
  const doc = fs.readFileSync(path.join(WORKSPACE, ...ROUTE_DOC.split('/')), 'utf8');
  const title = { native: '使用者給的圖', codex: 'Codex', mmx: 'MiniMax CLI', html: 'HTML', antigravity: 'Antigravity' };
  for (const [route, n] of Object.entries(ROUTE_SECTION)) assert.match(doc, new RegExp(`^## ${n}\\. ${title[route]}`, 'm'), `${route} → 第 ${n} 節`);
});

// caps.mjs：假的執行器
const runner = (table) => (cmd, args) => {
  const v = table[[cmd, ...args].join(' ')];
  return v === undefined ? { code: null, stdout: '', stderr: '', error: `spawn ${cmd} ENOENT` } : { code: 0, stdout: '', stderr: '', error: null, ...v };
};
const capsTable = (t) => {
  const chrome = path.join(tmpDir(t, 'img-route-chrome-'), 'chrome-headless-shell');
  fs.writeFileSync(chrome, '');
  return {
    'codex --version': { stdout: 'codex-cli 0.171.0\n' }, 'codex login status': { stdout: 'Logged in using ChatGPT\n' },
    'mmx --version': { stdout: 'mmx 1.0.28\n' }, 'mmx auth status': { stdout: '{"method":"oauth"}' }, 'agy --version': { stdout: '1.5.17\n' },
    'npx --no -- hyperframes browser path': { stdout: `${chrome}\n` }, 'ffmpeg -version': { stdout: 'ffmpeg version 8.1\n' }, 'ffprobe -version': { stdout: 'ffprobe version 8.1\n' },
  };
};

test('caps.mjs：認得出 Agent 印一行「這次生圖走」；照設定；設定的路不能用退到 HTML；--agent 蓋過偵測；寫錯的設定 ⚠', (t) => {
  const T = capsTable(t), last = (r) => formatCaps(r).split('\n').pop();
  const a = shared(t);
  let r = probeCaps({ root: a.root, run: runner(T), env: { CLAUDECODE: '1' } });
  assert.equal(r.agent, 'claude');
  assert.equal(last(r), `這次生圖走：HTML（Claude Code 的預設）→ 指令在 ${ROUTE_DOC} 第 4 節`, '有 codex 也不自動用它：不是每個人都有 Codex');
  assert.deepEqual(r.imageRoutes, ['codex', 'mmx', 'antigravity', 'html']);
  assert.match(formatCaps(r), /\| Antigravity（agy） \| 可用 \| agy --version：1\.5\.17（有沒有登入查不到） \|/);
  const b = shared(t, { image: { claude: 'codex', minimax: 'dalle' } });
  r = probeCaps({ root: b.root, run: runner(T), env: { CLAUDECODE: '1' } });
  assert.equal(last(r), `這次生圖走：Codex（shared/setting.json 的 image.claude）→ 指令在 ${ROUTE_DOC} 第 2 節`);
  r = probeCaps({ root: b.root, run: runner({ ...T, 'codex login status': { code: 1, stdout: 'Not logged in\n' } }), env: { CLAUDECODE: '1' } });
  assert.equal(last(r), `這次生圖走：HTML（shared/setting.json 的 image.claude 設的是 Codex，但 Codex 未登入，先改走 HTML）→ 指令在 ${ROUTE_DOC} 第 4 節`);
  r = probeCaps({ root: b.root, run: runner(T), env: { CLAUDECODE: '1' }, agent: 'minimax' });
  assert.equal(r.agent, 'minimax');
  const text = formatCaps(r).split('\n');
  assert.match(text.at(-2), /^⚠ shared\/setting\.json 的 image\.minimax 只能是/);
  assert.equal(text.at(-1), `這次生圖走：mmx（MiniMax Code 的預設）→ 指令在 ${ROUTE_DOC} 第 3 節`);
});

test('caps.mjs：認不出 Agent 就每個 Agent 各印一行（已經照設定與這台能用的算好），最後一行教怎麼只印自己的', (t) => {
  const T = capsTable(t), a = shared(t, { image: { claude: 'antigravity' } });
  delete T['agy --version'];
  const r = probeCaps({ root: a.root, run: runner(T), env: {} });
  assert.equal(r.agent, null);
  assert.deepEqual(r.image.map((x) => [x.agent, x.use]), [['claude', 'html'], ['codex', 'native'], ['minimax', 'mmx'], ['antigravity', 'native'], ['other', 'native']]);
  assert.deepEqual(formatCaps(r).split('\n').slice(-7), [
    `認不出現在是哪個 Agent（工具只認得出 Claude Code、Codex），你是哪一個就走那一行（節＝${ROUTE_DOC} 的第幾節）：`,
    '  Claude Code：HTML（shared/setting.json 的 image.claude 設的是 Antigravity，但 Antigravity 沒有安裝或壞掉，先改走 HTML）→ 指令在第 4 節',
    '  Codex：自己的生圖工具（預設）→ 做好的圖用第 1 節那一條轉；工具清單裡沒有生圖工具就改走 HTML（第 4 節）',
    '  MiniMax Code：mmx（預設）→ 指令在第 3 節',
    '  Antigravity：自己的生圖工具（預設）→ 做好的圖用第 1 節那一條轉；工具清單裡沒有生圖工具就改走 HTML（第 4 節）',
    '  其他 Agent：自己的生圖工具（預設）→ 做好的圖用第 1 節那一條轉；工具清單裡沒有生圖工具就改走 HTML（第 4 節）',
    '只印自己那一行：node shared/template/tools/caps.mjs --agent <claude｜codex｜minimax｜antigravity｜other>',
  ]);
});

test('brand.mjs image：看、設定（認得出 Agent 不用 --agent）、認不出來 ✖ 並印要加什麼、--agent 替別的 Agent 設、off、寫錯 ✖', (t) => {
  const a = shared(t, { agents: 6 });
  const run = (env, ...args) => {
    const clean = { ...process.env };
    for (const k of ['CLAUDECODE', 'CODEX_THREAD_ID', 'CODEX_SANDBOX']) delete clean[k];
    return spawnSync(process.execPath, [path.join(TOOLS, 'brand.mjs'), 'image', ...args, '--kit', a.kit], { encoding: 'utf8', env: { ...clean, ...env } });
  };
  const CLAUDE = { CLAUDECODE: '1' };
  let r = run(CLAUDE);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^生圖路線（生成背景圖時走哪條路；shared\/setting\.json 的 image，每個 Agent 各記一條）：\n {2}▸ Claude Code（claude）：HTML（預設）\n {4}Codex（codex）：自己的生圖工具（預設）\n/);
  assert.match(r.stdout, /換路線：node shared\/template\/tools\/brand\.mjs image <路線>（現在這個 Agent 是 Claude Code）/);
  r = run(CLAUDE, 'codex');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^✓ Claude Code 以後生圖走：Codex（shared\/setting\.json 的 image\.claude）\n→ 這台現在能不能用這條路：node shared\/template\/tools\/caps\.mjs/);
  assert.deepEqual(a.read(), { agents: 6, image: { claude: 'codex' } });
  assert.match(run(CLAUDE).stdout, / {2}▸ Claude Code（claude）：Codex\n/);
  r = run({}, 'html');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^✖ 認不出現在是哪個 Agent → 加 --agent：node shared\/template\/tools\/brand\.mjs image html --agent <claude｜codex｜minimax｜antigravity｜other>/);
  assert.match(run({}).stdout, /認不出現在是哪個 Agent，要加 --agent </);
  r = run({}, 'antigravity', '--agent', 'minimax');
  assert.match(r.stdout, /^✓ MiniMax Code 以後生圖走：Antigravity（shared\/setting\.json 的 image\.minimax）/);
  r = run(CLAUDE, 'off');
  assert.match(r.stdout, /^✓ Claude Code 以後生圖走：HTML（拿掉 shared\/setting\.json 的 image\.claude，回到預設）/);
  assert.deepEqual(a.read().image, { minimax: 'antigravity' });
  r = run(CLAUDE, 'dalle');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^✖ 生圖路線只能是 html｜native｜codex｜antigravity｜mmx（或 off＝回到預設），現在是「dalle」 → 例：node shared\/template\/tools\/brand\.mjs image codex/);
  assert.match(run(CLAUDE, 'html', '--agent', 'gemini').stderr, /^✖ --agent 只能是 claude｜codex｜minimax｜antigravity｜other/);
  assert.deepEqual(a.read().image, { minimax: 'antigravity' }, '寫錯的不會寫進去');
});
