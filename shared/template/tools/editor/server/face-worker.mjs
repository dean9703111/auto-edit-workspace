// 講者瘦臉、美顏的單格預覽（/api/look/face）在這個 worker 裡算：抽格、變形、轉 JPEG 都是同步的，
// 放在影片編輯器的主執行緒會擋住影片串流（構圖台、影片編輯器的畫面跟著卡住）。一次算一張，照收到的順序回。
import { parentPort } from 'node:worker_threads';
import { faceImage } from '../../lib/look.mjs';

const cache = {};
parentPort.on('message', ({ id, args }) => {
  let msg;
  try {
    const out = faceImage({ ...args, cache, withBox: true });
    msg = out.jpg ? { id, jpg: out.jpg, box: out.box } : { id, miss: out };
  } catch (e) { msg = { id, error: e.message }; }
  parentPort.postMessage(msg);
});
