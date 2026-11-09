// 檢查結果的白話與歸併（純函式，沒有 DOM）：工具的訊息是寫給 AI 修的（有指令、有欄位名），給作者看的要分開。
//   groupIssues(errors, warnings) → { errors: [...], author: [群組], ai: [群組], counts }
//   群組：{ key, level, title, hint, ids: [段號], cues: [字幕句號], raw: [原文], action }
//   author＝作者要看一眼或能自己改的；ai＝給 AI 的技術細節、作者不用懂的（工具改得好的產生時已經改掉；一樣留著原文，可以整份複製給 AI）

const RULES = [
  { key: 'speaker', re: /示範人物/, who: 'author', action: 'speaker', title: () => '講者介紹還是示範人物', hint: '填你的姓名和頭銜，影片裡才不會是別人的名字' },
  { key: 'cover', re: /大約會蓋到講者框/, who: 'author', title: (n) => `${n} 段字卡可能蓋到講者`, hint: '點段號跳過去看有沒有擋到臉或手勢；擋到就寫進修改單，沒擋到不用管' },
  { key: 'empty', re: /沒有畫面的區間/, who: 'author', title: (_, g) => `有些地方只有講者、沒有字卡${(/共\s*\d+\s*段、[\d.]+\s*s/.exec(g.raw[0]) || [''])[0].replace(/^共\s*/, '（').replace(/\s*s$/, ' 秒）')}`, hint: '時間軸「字卡／動畫」那一軌的灰色斜線就是；想補畫面請寫進修改單，留給講者就不用管' },
  { key: 'short-cap', re: /字幕.*不到\s*[\d.]+\s*秒/, who: 'author', cues: true, title: (_, g) => { const n = Math.max(g.cues.length, ...g.raw.map((s) => Number(/等\s*(\d+)\s*則/.exec(s)?.[1] || 0))); return `${n ? `${n} 句` : '有'}字幕太短，會閃一下就沒了`; }, hint: '點句號跳到那一句，在「屬性」和下一句合併或把時間拉長' },
  { key: 'hold', re: /到退場只停/, who: 'author', title: (n) => `${n} 段的字停留太短`, hint: '觀眾可能來不及看完；要拉長請寫進修改單' },
  { key: 'layout', re: /版面|超出|擠到/, who: 'author', title: (n) => `${n} 處版面有問題`, hint: '通常是字太長：改短一點，或寫進修改單請 AI 重排' },
  { key: 'timing', re: /文字對時/, who: 'ai', title: (n) => `${n} 處文字比講到的時間早或晚` },
  { key: 'beat', re: /動畫分鏡/, who: 'ai', title: (n) => `${n} 段動畫的收尾時間偏短` },
  { key: 'sfx-many', re: /音效密度/, who: 'ai', title: () => '有些地方音效偏多' },
  { key: 'sfx-few', re: /音效稀疏/, who: 'ai', title: () => '有些地方很久沒有音效' },
  { key: 'sfx-near', re: /音效.*只差|已拿掉/, who: 'ai', title: (n) => `${n} 顆音效太靠近，已自動拿掉` },
  { key: 'word', re: /#N@詞|字數比例估/, who: 'ai', title: () => '部分文字的出現時間是估的' },
  { key: 'chapter', re: /章節.*(?:空檔|壓到)|壓到.*人聲/, who: 'ai', title: (n) => `${n} 處章節轉場會蓋到講話` },
];

// 段號：「[s0101 speaker] …」「文字對時：s0116 的 …」「…（0:52–2:48，116 秒：x0108、d0110…）」只拿開頭那個
export function issueId(text) {
  const s = String(text);
  return (/^\[([A-Za-z_][\w-]*)/.exec(s) || /^文字對時：([A-Za-z_][\w-]*)\s*的/.exec(s) || [])[1] || null;
}
// 給作者看的一句：拿掉段號標頭、「→」後面寫給 AI 的修法
export function issueText(text) {
  return String(text).replace(/^\[[^\]]*\]\s*/, '').split('→')[0].trim();
}

export function groupIssues(errors = [], warnings = []) {
  const author = new Map(), ai = new Map();
  for (const raw of warnings) {
    const s = String(raw);
    const rule = RULES.find((r) => r.re.test(s));
    const key = rule?.key || `other:${issueText(s).replace(/[\d.]+/g, '#').slice(0, 24)}`;
    const bucket = rule?.who === 'author' ? author : ai;
    const g = bucket.get(key) || { key, level: 'warn', rule, ids: [], cues: [], raw: [], action: rule?.action || null };
    g.raw.push(s);
    const id = issueId(s);
    if (id && !g.ids.includes(id)) g.ids.push(id);
    // 字幕的句號（#50）：作者點了跳到那一句；只看「→」前面，修法裡的不算
    if (rule?.cues) for (const m of issueText(s).matchAll(/#(\d+)/g)) { const n = Number(m[1]); if (!g.cues.includes(n)) g.cues.push(n); }
    bucket.set(key, g);
  }
  const done = (m) => [...m.values()].map(({ rule, ...g }) => {
    const n = g.ids.length || g.raw.length;
    return { ...g, title: rule ? rule.title(n, g) : issueText(g.raw[0]), hint: rule?.hint || '' };
  });
  const a = done(author), b = done(ai);
  return { errors: errors.map(String), author: a, ai: b, counts: { errors: errors.length, author: a.length, ai: b.reduce((t, g) => t + g.raw.length, 0) } };
}
