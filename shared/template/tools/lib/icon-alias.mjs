// 圖示常用詞（中文）對 lucide 名稱：--icons 查詢、找不到圖示時的建議都用這張表
//   ICON_ALIAS                       → { 中文詞: lucide 名稱 }
//   iconHint(value, names, nearest)  → 找不到圖示時接在錯誤後面的建議：寫成中文的給英文名稱，英文的給名稱相近的
export const ICON_ALIAS = { 手機: 'smartphone', 電腦: 'laptop', 筆電: 'laptop', 螢幕: 'monitor', 雲端: 'cloud', 雲: 'cloud', 影片: 'video', 攝影機: 'video', 相機: 'camera', 字幕: 'captions', 聲音: 'volume', 音效: 'volume', 麥克風: 'mic', 剪刀: 'scissors', 剪輯: 'scissors', 資料夾: 'folder', 檔案: 'file', 下載: 'download', 上傳: 'upload', 設定: 'settings', 安裝: 'download', 鎖: 'lock', 權限: 'shield', 保護: 'shield', 打勾: 'check', 勾: 'check', 完成: 'circle-check', 警告: 'triangle-alert', 注意: 'triangle-alert', 時間: 'clock', 計時: 'timer', 人: 'user', 使用者: 'user', 團隊: 'users', 星: 'star', 重點: 'star', 燈泡: 'lightbulb', 想法: 'lightbulb', 搜尋: 'search', 連結: 'link', 網頁: 'globe', 程式: 'code', 終端機: 'terminal', 書: 'book', 說明書: 'book-open', 筆記: 'notebook', 清單: 'list-checks', 播放: 'play', 暫停: 'pause', 電池: 'battery', 額度: 'gauge', 速度: 'gauge', 機器人: 'bot', AI: 'bot', 畫面: 'image', 圖片: 'image', 訊息: 'message-circle', 聊天: 'message-circle', 錢: 'wallet', 目標: 'target', 火箭: 'rocket', 工具: 'wrench', 垃圾桶: 'trash-2', 刪除: 'trash-2', 複製: 'copy', 分享: 'share-2', 按讚: 'thumbs-up' };

export function iconHint(value, names = [], nearest = null) {
  const v = String(value);
  if (/[\u3400-\u9fff]/.test(v)) {
    const hits = [...new Set(Object.entries(ICON_ALIAS).filter(([k]) => v.includes(k)).map(([, n]) => n))].filter((n) => !names.length || names.includes(n));
    return `圖示要寫英文名稱（lucide）${hits.length ? `，可以用：${hits.join('、')}` : ''}；不確定就查 build.mjs --icons ${[...v].slice(0, 4).join('')}`;
  }
  return nearest ? `相近：${nearest(v, names).join('、')}` : '換一個名稱';
}
