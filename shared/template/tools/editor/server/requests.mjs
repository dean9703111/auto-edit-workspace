// 剪輯台的修改單（work/feedback/editor-requests.md）與每段的處理狀態（editor-requests-status.json）。
// 獨立成一支輕的檔：versions.mjs（begin --requests、finish 自己回報狀態）也要用，不用載入整支 editor.mjs（它會連帶載入 status.mjs，形成循環）。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const sha = (s) => crypto.createHash('sha1').update(s).digest('hex');
const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
function readJson(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } }

// 修改單（剪輯左側「複製給 AI」）：整份覆寫 work/feedback/editor-requests.md；AI 聽到「照修改單改」就讀這個檔
// 修改單改完了沒：editor-requests.md 上次複製的時間與裡面的段；AI 照修改單改完，r<N>.md「改了哪幾段」每段寫一列
//   「- <段 id>：<做了什麼>」（auto-edit-review references/editor-requests.md）。比修改單新的 r<N>.md 寫到的段＝已改，剪輯標「已改」、可以點「看結果」
export function requestsInfo(project) {
  const fb = path.join(project, 'work', 'feedback'), file = path.join(fb, 'editor-requests.md');
  let at;
  try { at = fs.statSync(file).mtimeMs; } catch { return null; }
  const markdown = fs.readFileSync(file, 'utf8');
  const revision = sha(`${at}:${markdown}`);
  const ids = [...markdown.matchAll(/^## \d+\. (\S+)/gm)].map((m) => m[1]);
  const saved = readJson(path.join(fb, 'editor-requests-status.json'));
  // 每段的狀態記著它屬於哪一版修改單（舊檔沒寫就是檔頭那一版）。這一版的照舊；
  // AI 還在改的時候使用者又複製了新的修改單：不在新修改單、還在生成中的段帶著走（carried），
  // 剪輯台照樣顯示生成中、不會算回待改，AI 改完用開輪時那一版回報也記得到
  const states = {}, carried = [];
  for (const [id, st] of Object.entries(isObj(saved?.states) ? saved.states : {})) {
    if (!isObj(st)) continue;
    const rev = st.revision || saved.revision;
    if (rev === revision) states[id] = { ...st, revision: rev };
    else if (!ids.includes(id) && (st.state === 'generating' || st.carried)) { states[id] = { ...st, revision: rev, carried: true }; carried.push(id); }
  }
  const all = [...ids, ...carried];
  const rounds = fs.readdirSync(fb).filter((f) => /^r\d+\.md$/.test(f)).map((f) => ({ f, t: fs.statSync(path.join(fb, f)).mtimeMs }))
    .filter((x) => x.t > at).sort((a, b) => a.t - b.t);
  const done = {};
  for (const { f } of rounds) {
    const sec = fs.readFileSync(path.join(fb, f), 'utf8').split(/^## 改了哪幾段[ \t]*$/m)[1]?.split(/^## /m)[0] || '';
    for (const m of sec.matchAll(/^- (\S+?)：(.+)$/gm)) if (all.includes(m[1])) done[m[1]] = { round: f.slice(0, -3), note: m[2].trim() };
  }
  // 有明確回報的段以 API 為準，避免回饋紀錄尚在撰寫就提早顯示完成。
  for (const id of all) if (Object.hasOwn(states, id)) {
    if (states[id].state === 'done') done[id] = { round: states[id].round || done[id]?.round || 'AI', note: states[id].message || done[id]?.note || '生成完成，已通過 build、audit' };
    else delete done[id];
  }
  return { at: Math.round(at), revision, ids, carried, done, states };
}

// AI 明確回報才顯示生成中；版本必填，舊任務不能改到使用者重新複製的修改單。
export function doRequestsStatus(ctx, body) {
  const q = requestsInfo(ctx.P.project);
  if (!q) return [404, { message: '還沒有修改單，請先在剪輯複製給 AI' }];
  const { state, ids, message = '', round = '' } = body || {};
  // 舊版修改單帶著走的段（carried）用它自己那一版回報；其他段要用目前這一版
  const old = body?.revision !== q.revision && Array.isArray(ids) && ids.length > 0 && ids.every((id) => q.carried.includes(id) && q.states[id]?.revision === body.revision);
  if (body?.revision !== q.revision && !old) return [409, { message: '修改單版本已更新，請重新讀取最新修改單' }];
  if (!['generating', 'done', 'failed'].includes(state) || !Array.isArray(ids) || !ids.length || ids.some((id) => typeof id !== 'string' || !(old ? q.carried : q.ids).includes(id))
    || typeof message !== 'string' || message.length > 2000 || typeof round !== 'string' || round.length > 80) return [400, { message: '請提供有效的 state（generating／done／failed）、修改單段落 ids 與文字訊息' }];
  const now = Date.now();
  const states = { ...q.states, ...Object.fromEntries(ids.map((id) => [id, { state, message, round, at: now, revision: body.revision, ...(old ? { carried: true } : {}) }])) };
  const file = path.join(ctx.P.project, 'work', 'feedback', 'editor-requests-status.json');
  fs.writeFileSync(`${file}.tmp`, JSON.stringify({ revision: q.revision, states }, null, 2) + '\n');
  fs.renameSync(`${file}.tmp`, file);
  return [200, { ok: true, requests: requestsInfo(ctx.P.project) }];
}

export function doRequests(ctx, body) {
  const md = body?.markdown;
  if (typeof md !== 'string' || !md.trim()) return [400, { error: 'empty', message: '修改單是空的' }];
  if (md.length > 200000) return [400, { error: 'toolong', message: '修改單太長（超過 20 萬字）' }];
  const dir = path.join(ctx.P.project, 'work', 'feedback');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'editor-requests.md');
  fs.writeFileSync(`${file}.tmp`, md.endsWith('\n') ? md : `${md}\n`);
  fs.renameSync(`${file}.tmp`, file);
  return [200, { ok: true, file: path.relative(ctx.P.root, file).split(path.sep).join('/'), requests: requestsInfo(ctx.P.project) }];
}

// 072 修改單清單本身（每段的標籤、描述、送出過哪一版、已改完）存在專案裡：work/feedback/editor-requests-list.json（{ rev, list }）。
//   作者：「修改單只有草稿的，應該有紀錄吧？為何重新進入後就沒有顯示了？」：072 之前只存在打開剪輯台的那個瀏覽器
//   （localStorage 跟著網址走），換瀏覽器、剪輯台換了埠號、舊分頁整份寫回去都會看不到剛寫的草稿。
//   存檔只送改了的段：{ id, item }＝整段換成 item、{ id, item: null }＝拿掉；每段帶著這個分頁上次看到的那一份（base，JSON 字串，新的段是 null）。
//   專案裡那一段已經被別的分頁改過（和 base 不一樣）就不套、列進 skipped；回傳現在的整份，頁面換上
export function requestsList(project) {
  const d = readJson(path.join(project, 'work', 'feedback', 'editor-requests-list.json'));
  if (!isObj(d) || !Array.isArray(d.list)) return { exists: false, rev: 0, list: [] };
  return { exists: true, rev: Number(d.rev) || 0, list: d.list.filter((x) => isObj(x) && typeof x.id === 'string' && x.id) };
}
export function doRequestsList(ctx, body) {
  const ops = body?.ops;
  if (!Array.isArray(ops) || ops.length > 5000 || ops.some((o) => !isObj(o) || typeof o.id !== 'string' || !o.id
    || (o.item != null && (!isObj(o.item) || o.item.id !== o.id)) || (o.base != null && typeof o.base !== 'string'))) return [400, { message: '修改單的存檔格式不對（要 ops：[{ id, item, base }]）' }];
  const cur = requestsList(ctx.P.project), list = [...cur.list], skipped = [];
  for (const o of ops) {
    const i = list.findIndex((x) => x.id === o.id);
    if ((i < 0 ? null : JSON.stringify(list[i])) !== (o.base ?? null)) { skipped.push(o.id); continue; }
    if (o.item) { if (i < 0) list.push(o.item); else list[i] = o.item; } else if (i >= 0) list.splice(i, 1);
  }
  const text = JSON.stringify(list);
  if (text.length > 2000000) return [400, { message: '修改單太長（超過 200 萬字）' }];
  let rev = cur.rev;
  if (!cur.exists || text !== JSON.stringify(cur.list)) {
    rev = Math.max(Date.now(), cur.rev + 1);
    const dir = path.join(ctx.P.project, 'work', 'feedback'), file = path.join(dir, 'editor-requests-list.json');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(`${file}.tmp`, JSON.stringify({ rev, list }, null, 2) + '\n');
    fs.renameSync(`${file}.tmp`, file);
  }
  return [200, { ok: true, exists: true, rev, list, skipped }];
}
