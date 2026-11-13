// build 印的「六行摘要」（人聲響度、音效比例…）怎麼認：只有這一份。build.mjs 印的字頭改了，這裡跟著改，
// versions.mjs（回饋輪只留 ✖、⚠、摘要）、deliver.mjs（回報段）、lib/flow.mjs（--review 回報段）都從這裡匯入。零依賴。
//   SUMMARY_HEADS            → 六個字頭
//   isSummaryLine(line)      → 這一行是不是摘要
//   isSfxWarn(line)          → 音效次數／密度／稀疏／比例的 ⚠（deliver 的回報段也要帶）
//   summaryLines(text)       → 一段輸出裡的摘要行（去掉前後空白、照原順序、不重複）
export const SUMMARY_HEADS = Object.freeze(['人聲響度', '音效比例', '剪接點微淡化', '講者調光', '講者瘦臉', '結尾配樂']);
const HEAD_RE = new RegExp(`^(?:${SUMMARY_HEADS.join('|')})`);
const SFX_WARN_RE = /^⚠ .*音效(?:次數|密度|稀疏|比例)/;

export const isSummaryLine = (line) => HEAD_RE.test(String(line).trim());
export const isSfxWarn = (line) => SFX_WARN_RE.test(String(line).trim());

export function summaryLines(text) {
  const seen = new Set();
  return String(text ?? '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && isSummaryLine(l) && !seen.has(l) && seen.add(l));
}
