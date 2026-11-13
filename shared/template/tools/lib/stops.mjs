// 六個停點的名稱與那兩行原文：只有這一份（AGENTS.md「停點總表」照它寫，dev/tests/docs.test.mjs 會對）。零依賴。
//   STOP.<鍵>                 → 停點名稱（寫進 work/製作進度.md 的那個字串）
//   stopLines.<鍵>(…)         → 「⏸ 停點 …｜請看 …\n請回：…」兩行（回覆的最後兩行照抄）

export const STOP = Object.freeze({
  cuts: '① 剪輯清單', framing: '② 構圖', storyboard: '③ 分鏡表', final: '④ 完成影片預覽', editor: '⑤ 剪輯台', bg: '⑥ 背景預覽', music: '⑥ 配樂試聽',
});

export const ASK = Object.freeze({
  cuts: '勾好後說「可以」，或要改的列',
  framing: '拖好框說「調好了」（會自動存），或說「用建議的」',
  storyboard: '改好後說「可以」，或要改的地方',
  revise: '「可以」或要改的拍',
  final: '要改的段落（例：s05 往左移）或「可以了，輸出完成影片」',
  editor: '調完說「調好了」（會自動存）',
  bg: '「可以」或「重做」',
  music: '「用第 N 首」或「重做」',
});

const two = (name, see, ask) => `⏸ 停點 ${name}｜請看 ${see}\n請回：${ask}`;

export const stopLines = Object.freeze({
  cuts: (url) => two(STOP.cuts, url, ASK.cuts),
  // look：有 work/look-preview.jpg（開了調光瘦臉）才帶後半句
  framing: (url, { look = false } = {}) => two(STOP.framing, `${url}${look ? ' 和 work/look-preview.jpg' : ''}`, ASK.framing),
  storyboard: (url) => two(STOP.storyboard, url, ASK.storyboard),
  // label 例：「③ 分鏡表（s12 v2）」；files＝每份提案的 分鏡.md
  revise: (label, files) => two(label, [].concat(files).join(' 和 '), ASK.revise),
  final: (url) => two(STOP.final, url, ASK.final),
  editor: (url) => two(STOP.editor, url, ASK.editor),
  bg: (dir) => two(STOP.bg, `${dir}/preview.jpg 和 ${dir}/zones-fs.jpg`, ASK.bg),
  music: (file) => two(STOP.music, file, ASK.music),
});
