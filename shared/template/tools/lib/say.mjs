// 工具訊息的單一出口：符號、「→ 下一步」、可以照貼的指令與回報。零依賴。
//   ok(msg)／warn(msg, fix)／fail(msg, fix)   → '✓ …'／'⚠ … → fix'／'✖ … → fix'
//   quote(s)                                  → 指令裡的一個參數（有空白、括號、# 這類字元才加雙引號）
//   cmdLine(tool, args)                       → 'node shared/template/tools/<tool> …'（args 逐個 quote；{ raw } 原樣放）
//   next(note, ...cmds)                       → ['→ 下一步：note', ...cmds]；cmds 只能是指令（AGENTS.md：下面那幾行整行複製執行；測試時放錯會丟錯）
//   dispatch(note, ...msgs)                   → ['→ 派工：note', '  msg', …]；每一行是一則照抄給子代理的派工訊息（不是指令）
//   assetsLine(files)                       → '<deliver-assets><media type="video" src="/絕對路徑" /></deliver-assets>'
//   report(lines, { assets, stop })           → 回報段（最多 15 行）：標題、內容、附件、停點那兩行（一定在最後）
import path from 'node:path';

const TOOLS = 'shared/template/tools';
export const REPORT_HEAD = '── 回報（照貼；要你判斷的另外補一行）──';
export const REPORT_MAX = 15;

export const ok = (msg) => `✓ ${msg}`;
export const warn = (msg, fix) => `⚠ ${msg}${fix ? ` → ${fix}` : ''}`;
export const fail = (msg, fix) => `✖ ${msg}${fix ? ` → ${fix}` : ''}`;

// 不用引號的字元：英數、路徑與旗標常見的符號、中日韓文字；其他（空白、括號、#、&、引號…）一律加雙引號
const SAFE = /^[\w./:@=,+\-\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff\uff10-\uff19\uff21-\uff3a\uff41-\uff5a]+$/;
export const quote = (s) => (SAFE.test(String(s)) ? String(s) : `"${String(s).replace(/(["\\$`])/g, '\\$1')}"`);

export function cmdLine(tool, args = []) {
  return [`node ${TOOLS}/${tool}`, ...args.map((a) => (a && typeof a === 'object' ? a.raw : quote(a)))].join(' ');
}

// 測試時（node --test 會設 NODE_TEST_CONTEXT，被測的工具子行程也會繼承）放錯就丟錯，讓測試抓到；
// 正式剪片時不能因為一句訊息就讓工具當掉：不是指令的行併進說明那一行
const IS_CMD = /^(node |npx |\(cd )/;
const STRICT = () => !!(process.env.NODE_TEST_CONTEXT || process.env.AUTO_EDIT_STRICT);
export function next(note, ...cmds) {
  const bad = cmds.filter((c) => !IS_CMD.test(c));
  if (bad.length && STRICT()) throw new Error(`「→ 下一步：」下面只能放指令（整行複製就能跑），這一行不是：${bad[0]}`);
  return [`→ 下一步：${[note, ...bad].join('；')}`, ...cmds.filter((c) => IS_CMD.test(c))];
}

// 派工訊息不是指令，不放在「→ 下一步」下面：「→ 派工：說明」下面每一行（縮排兩格）是一則要原樣送給子代理的派工訊息
export function dispatch(note, ...msgs) {
  return [`→ 派工：${note}`, ...msgs.map((m) => `  ${String(m).replace(/^\s+/, '')}`)];
}

const TYPES = ['video', 'image', 'audio', 'file'];
export function assetsLine(files = []) {
  const list = [].concat(files).filter(Boolean).map((f) => (typeof f === 'string' ? { path: f } : f));
  if (!list.length) return '';
  const typeOf = (p) => (/\.(mp4|mov|webm|mkv)$/i.test(p) ? 'video' : /\.(jpe?g|png|webp|gif)$/i.test(p) ? 'image' : /\.(mp3|m4a|wav|aac)$/i.test(p) ? 'audio' : 'file');
  const media = list.map((f) => {
    const abs = path.resolve(f.path);
    const type = TYPES.includes(f.type) ? f.type : typeOf(abs);
    return `<media type="${type}" src="${abs.split(path.sep).join('/')}" />`;
  });
  return `<deliver-assets>${media.join('')}</deliver-assets>`;
}

export function report(lines = [], { assets = [], stop = '' } = {}) {
  const body = [].concat(lines).flatMap((l) => String(l).split('\n')).filter((l) => l.trim());
  const tail = [assetsLine(assets), ...String(stop || '').split('\n')].filter((l) => l.trim());
  const room = REPORT_MAX - 1 - tail.length;
  const kept = body.length > room ? [...body.slice(0, Math.max(0, room - 1)), `（其餘 ${body.length - Math.max(0, room - 1)} 行看上面的輸出）`] : body;
  return [REPORT_HEAD, ...kept, ...tail];
}
