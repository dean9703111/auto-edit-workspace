// 切換影片（039）：頁首的下拉選單要列什麼、選了要去哪。瀏覽器和測試共用，沒有 DOM。
//   switchOptions(editors)    /api/editors 的 editors → 選單要列的項目；回空陣列＝不顯示
//   switchUrl(href, target)   現在的網址、要去的剪輯台網址 → 那個專案的同一頁、同一個檢視

// 開著的剪輯台不到兩個、或清單裡沒有這一個（回傳的不是清單）就不顯示
export function switchOptions(editors) {
  const list = (Array.isArray(editors) ? editors : []).filter((e) => e && typeof e.name === 'string' && typeof e.url === 'string');
  return list.length >= 2 && list.some((e) => e.current) ? list : [];
}

// 路徑和 view 這類 query 留著；seg、t 和 # 指的是這支影片裡的位置，不帶過去
const HERE_ONLY = ['seg', 't'];
export function switchUrl(href, target) {
  const from = new URL(href), to = new URL(target);
  const query = new URLSearchParams(from.search);
  for (const k of HERE_ONLY) query.delete(k);
  to.pathname = from.pathname;
  to.search = query.toString();
  return to.href;
}
