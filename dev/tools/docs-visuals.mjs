// 文件圖解與介面截圖。只在系統暫存建立示範專案，不讀寫使用者專案與 shared/。
// node dev/tools/docs-visuals.mjs（需現有 ffmpeg、HyperFrames Chrome、puppeteer-core）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { startEditor } from '../../shared/template/tools/editor.mjs';
import { findChrome } from '../../shared/template/tools/lib/audit-browser.mjs';
const WS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TPL = path.join(WS, 'shared/template'), OUT = path.join(WS, 'dev/site/guides');
fs.mkdirSync(OUT, { recursive: true });
const C = { bg:'#090D17', card:'#121A2B', line:'#2D3950', text:'#F4F5F8', muted:'#B6C1D5', orange:'#FF791F', green:'#82D9B0' };
const text = (x,y,t,size=24,fill=C.text,weight=500) => `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-weight="${weight}">${t}</text>`;
const box = (x,y,w,h,fill=C.card,r=16,stroke=C.line) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}"/>`;
const line = (x1,y1,x2,y2,color=C.line,width=2) => `<path d="M${x1} ${y1}L${x2} ${y2}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`;
const svg = (w,h,title,body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="title"><title id="title">${title}</title><rect width="100%" height="100%" rx="24" fill="${C.bg}"/><g font-family="Noto Sans TC, PingFang TC, Microsoft JhengHei, sans-serif">${body}</g></svg>`;
const num = (x,y,n) => `<circle cx="${x}" cy="${y}" r="18" fill="${C.orange}"/>${text(x-7,y+7,n,21,C.bg,800)}`;
const arrow = (x,y,vertical=false) => `<path d="${vertical?`M${x} ${y-13}v26m-7-7 7 7 7-7`:`M${x-13} ${y}h26m-7-7 7 7-7 7`}" fill="none" stroke="${C.orange}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
function mini(kind,x,y) {
  let b=box(x,y,350,112,'#0B111E',10);
  if(kind===0) for(let i=0;i<4;i++) b+=box(x+16+i*82,y+16,72,78,'#1B2940',8)+text(x+24+i*82,y+45,['講解','旁白','錄影','圖片'][i],18)+line(x+28+i*82,y+61,x+69+i*82,y+61,C.orange,3)+line(x+28+i*82,y+73,x+58+i*82,y+73,C.muted,2);
  if(kind===1) {for(let i=0;i<28;i++){let h=12+(i*17%48); b+=line(x+18+i*11,y+53-h/2,x+18+i*11,y+53+h/2,i>8&&i<15?'#EF7D83':C.orange,5);} b+=box(x+109,y+17,76,70,'none',6,'#EF7D83')+text(x+120,y+101,'NG 剪掉，留下完整一句',16,C.muted);}
  if(kind===2){b+=box(x+15,y+12,155,86,'#293449',5)+box(x+30,y+20,123,69,'none',0,C.orange); b+=`<circle cx="${x+94}" cy="${y+44}" r="13" fill="#C3CEDF"/><path d="M${x+66} ${y+83}q0-32 28-32t28 32" fill="#C3CEDF"/>`; b+=arrow(x+192,y+56)+box(x+216,y+17,113,78,'#EFE8DB',5)+box(x+226,y+30,58,15,C.orange,3)+box(x+297,y+66,23,22,'#354058',3)+text(x+229,y+66,'動畫預覽',14,'#323C4E');}
  if(kind===3){for(let i=0;i<3;i++)b+=box(x+15+i*109,y+15,100,63,i===1?'#F6ECE0':'#26344C',5)+box(x+25+i*109,y+25,45,8,C.orange,2)+line(x+25+i*109,y+49,x+93+i*109,y+49,i===1?'#A8A093':C.muted,3)+text(x+34+i*109,y+100,['s01 開場','s02 流程','s03 重點'][i],15,C.muted);}
  if(kind===4){b+=box(x+15,y+12,155,74,'#F4EADC',5)+box(x+28,y+25,78,15,C.orange,3)+box(x+121,y+55,36,23,'#314563',3); for(let i=0;i<3;i++) b+=box(x+190,y+14+i*27,140-i*18,14,i===1?C.orange:'#38577D',3); b+=text(x+22,y+103,'預覽 → 修改 → 再確認',16,C.muted);}
  if(kind===5){b+=box(x+18,y+16,132,80,'#253950',6)+`<path d="M${x+70} ${y+38}l28 18-28 18z" fill="${C.orange}"/>`+arrow(x+184,y+56)+text(x+216,y+48,'final.mp4',23,C.text,700)+text(x+216,y+77,'也能帶去剪映',17,C.muted);}
  return b;
}
const stages=[['放好素材','影片、聲音、錄影、圖片','有講稿也一起放進來'],['剪乾淨','找 NG、縮停頓、上字幕','① 看剪輯清單'],['構圖與風格','拖框、選主色與背景','② 看動畫，儲存並套用'],['確認分鏡','每段要配什麼畫面','③ 看分鏡表與截圖'],['預覽與修改','看完成影片，說一句話或自己調','④ Studio；需要時開 ⑤ 剪輯'],['輸出與驗收','確認後輸出 MP4','選用：主軌＋透明 MOV＋SRT']];
function workflow(mobile=false){
  const w=mobile?440:1320,h=mobile?2040:890;let b=text(32,48,'從素材到完成影片',mobile?31:38,C.text,800)+text(32,82,'先看整體流程，再跟 AI 一步一步做',mobile?19:23,C.muted);
  stages.forEach(([title,desc,stop],i)=>{const x=mobile?24:32+(i%3)*426,y=mobile?110+i*313:116+Math.floor(i/3)*354;
    b+=box(x,y,392,292)+num(x+33,y+37,String(i+1))+text(x+64,y+46,title,27,C.text,800)+mini(i,x+21,y+64)+text(x+21,y+211,desc,21)+text(x+21,y+253,stop,18,C.green);
    if(mobile&&i<5)b+=arrow(220,y+302,true);
    if(!mobile&&i%3<2)b+=arrow(x+409,y+146);
  });
  b+=text(32,h-42,'換共用背景時，另看 ⑥ 背景預覽',mobile?18:22,C.muted);
  return svg(w,h,'素材、初剪、構圖、分鏡、預覽修改、輸出的六步流程',b);
}
function pattern(x,y,w,h,variant){let b=box(x,y,w,h,['#E6DDCC','#DCE5EF','#E0E9E1'][variant],8,'none');const color=['#D57935','#4676A1','#528667'][variant];for(let i=0;i<4;i++)b+=line(x+w-44+i*10,y+9,x+w-44+i*10,y+h-9,color,1);b+=`<circle cx="${x+w-24}" cy="${y+h-20}" r="14" fill="none" stroke="${color}" stroke-width="2"/>`;return b;}
function backgrounds(mobile=false){
  const w=mobile?440:1320,h=mobile?1270:720;let b=text(32,48,'AI 畫背景，你來挑搭配',mobile?27:38,C.text,800)+text(32,84,'流程示意 · 每組都有三種用途',mobile?18:22,C.muted);
  const x1=mobile?24:32,y1=mobile?110:126,x2=mobile?24:428,y2=mobile?390:126,x3=mobile?24:918,y3=mobile?868:126;
  b+=box(x1,y1,mobile?392:338,236)+num(x1+32,y1+33,'1')+text(x1+61,y1+42,'給 AI 設計方向',25,C.text,800);
  b+=text(x1+24,y1+88,'主色',20,C.muted)+`<circle cx="${x1+99}" cy="${y1+81}" r="12" fill="${C.orange}"/>`+text(x1+24,y1+126,'參考圖 ＋ 風格 ＋ 描述',20)+box(x1+24,y1+156,mobile?344:290,50,C.orange,8)+text(x1+45,y1+189,'複製生圖指令 → 貼給 AI',20,C.bg,800);
  const midW=mobile?392:432;b+=box(x2,y2,midW,424)+num(x2+32,y2+33,'2')+text(x2+61,y2+42,'三組，共 9 張',25,C.text,800);
  const cols=['全畫面','側邊欄','章節'];cols.forEach((t,i)=>b+=text(x2+66+i*102,y2+83,t,18,C.muted));
  for(let row=0;row<3;row++){b+=text(x2+20,y2+137+row*92,['A','B','C'][row],23,C.orange,800);for(let col=0;col<3;col++)b+=pattern(x2+60+col*102,y2+100+row*92,92,65,row);}
  b+=text(x2+23,y2+399,'每組改變結構、造型或材質',18,C.muted);
  b+=box(x3,y3,mobile?392:370,372)+num(x3+32,y3+33,'3')+text(x3+61,y3+42,'各選各的，可以混搭',24,C.text,800);
  [['全畫面','A',0],['側邊欄','B',1],['章節','C',2]].forEach(([label,v,i])=>{b+=pattern(x3+22,y3+68+i*67,92,54,i)+text(x3+130,y3+103+i*67,`${label} → 選 ${v}`,22);});
  b+=box(x3+22,y3+284,mobile?348:326,55,C.orange,8)+text(x3+73,y3+320,'儲存並套用',24,C.bg,800);
  if(mobile){b+=arrow(220,y1+255,true)+arrow(220,y2+443,true);}else b+=arrow(399,238)+arrow(890,238);
  if(!mobile)b+=box(32,588,1256,84,'#15251F',12,'#365C49')+text(57,623,'先在同頁動畫看效果，滿意再套用這一集。',24,C.green,700)+text(57,653,'原本背景也能選回來；這裡的小圖是選圖邏輯示意，實際圖片由 AI 依需求生成。',19,C.muted);
  return svg(w,h,'複製設計指令給 AI，生成三組九張背景，按用途混搭再儲存並套用',b);
}
for(const [name,body] of [['workflow.svg',workflow()],['workflow-mobile.svg',workflow(true)],['background-flow.svg',backgrounds()],['background-flow-mobile.svg',backgrounds(true)]])fs.writeFileSync(path.join(OUT,name),body);
const root=fs.mkdtempSync(path.join(os.tmpdir(),'auto-edit-docs-'));
const work=path.join(root,'projects','操作示範','work');fs.mkdirSync(path.join(work,'hyperframes'),{recursive:true});fs.mkdirSync(path.join(root,'shared'));fs.symlinkSync(TPL,path.join(root,'shared/template'));
fs.writeFileSync(path.join(work,'hyperframes/plan.json'),JSON.stringify({version:1,look:false,rhythm:'spaced',frame:[144,81,1632,918],scenes:[]}));
fs.writeFileSync(path.join(work,'rough.srt'),'1\n00:00:00,100 --> 00:00:03,800\n用自己的畫面預覽動畫\n');
// 輕微平移讓工具能量出動作範圍；示範圖本身不變。
const result=spawnSync('ffmpeg',['-y','-v','error','-loop','1','-i',path.join(TPL,'preview/speaker.jpg'),'-f','lavfi','-i','anullsrc=r=48000:cl=mono','-t','4','-r','30','-vf','crop=1888:1062:16+12*sin(t*3):9+6*cos(t*3),scale=1920:1080','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac',path.join(work,'rough.mp4')],{encoding:'utf8'});
if(result.status!==0)throw Error(result.stderr);
// 剪輯清單（停點 ①）：另一個示範專案，只有 main.mp4 與 cuts.md（還沒初剪，頁面才能勾選）
const cutsWork=path.join(root,'projects','剪輯清單示範','work');fs.mkdirSync(cutsWork,{recursive:true});
const cutsVideo=spawnSync('ffmpeg',['-y','-v','error','-loop','1','-i',path.join(TPL,'preview/speaker.jpg'),'-f','lavfi','-i','anullsrc=r=48000:cl=mono','-t','160','-r','10','-vf','scale=960:540','-c:v','libx264','-preset','ultrafast','-tune','stillimage','-pix_fmt','yuv420p','-c:a','aac','-shortest',path.join(cutsWork,'main.mp4')],{encoding:'utf8'});
if(cutsVideo.status!==0)throw Error(cutsVideo.stderr);
fs.writeFileSync(path.join(cutsWork,'cuts.md'),['# 剪輯清單','','## NG','','| 剪 | 時間碼 | 內容 | 原因 | 待確認 |','|---|---|---|---|---|',
  '| [x] | 0:12.40–0:15.10 | 今天要介紹… | 同一句講兩次，留後面那次 | — |',
  '| [ ] | 1:03.00–1:05.80 | 這個設定要…呃… | 卡住重講 | — |',
  '| [x] | 2:30.00–2:31.20 | 我們先看… | 逐字稿和講稿對不上 | 講稿沒有這句，可能是 whisper 補的 |','',
  '## 需要你決定','','- 第 3 列（2:30.00–2:31.20）待確認：講稿沒有這句，可能是 whisper 補的',''].join('\n'));
// 分鏡表（停點 ③）：另一個示範專案，截圖用內建情境庫的底圖（不讀使用者專案）
const sbWork=path.join(root,'projects','分鏡表示範','work');fs.mkdirSync(path.join(sbWork,'storyboard-preview'),{recursive:true});
for(const [from,to] of [['14-speaker','s01'],['04c-fs-flow','x01-1'],['08-steps','x01-2']])fs.copyFileSync(path.join(TPL,'gallery',`${from}.jpg`),path.join(sbWork,'storyboard-preview',`${to}.jpg`));
const sbBeat=['| 拍 | 講到（綁句） | 畫面上出現什麼 | 動態（設計系統語彙） | 焦點 | 音效拍點 |','|---|---|---|---|---|---|',
  '| 0 | 段起點 | 主卡＋標題「先做這三步」 | 色帶擦開；＋0.5 逐字上浮（標題） | 標題 | — |',
  '| 1 | `#6@錄影` | 第 1 站：錄影 | 進度推進；彈出（站卡） | 第 1 站 | — |',
  '| 2 | `#7@逐字稿` | 第 2 站：轉逐字稿 | 進度推進；彈出（站卡） | 第 2 站 | — |',
  '| 3 | `#8@初剪` | 第 3 站：初剪 | 進度推進；彈出（站卡） | 第 3 站 | pop |'];
fs.writeFileSync(path.join(sbWork,'storyboard.md'),['# 分鏡表：示範（草稿）','',
  '## 總覽','','| 段 | 章 | 句號 | 時間碼 | 版面 | 卡片類型 | 一句話摘要 |','|---|---|---|---|---|---|---|',
  '| s01 | — | #1–3e | 0:00.00–0:06.20 | 疊加 | 14 講者介紹 | 自我介紹，秀出頭銜 |','| x01 | 01 開始 | #4–9e | 0:06.20–0:21.40 | 子母畫面 | x-process（拍型 A） | 先做這三步：錄影、逐字稿、初剪 |','',
  '## s01（#1–3e，0:00.00–0:06.20）','','![s01](storyboard-preview/s01.jpg)','','- 起點那句字幕：我是大寶，歡迎來到我的頻道','- 版面：疊加（14 講者介紹）','- 畫面文字：名字「林大寶」＋頭銜「影音創作者」「科技部落客」','- 音效：預設','- 理由：第一次出現講者名字，疊加版面不遮臉','',
  '## x01（#4–9e，0:06.20–0:21.40）','','![x01-1](storyboard-preview/x01-1.jpg)','![x01-2](storyboard-preview/x01-2.jpg)','','- 起點那句字幕：開始之前先做這三步','- 版面：子母畫面（情境動畫 `x-process`）','- 畫面文字：標題「先做這三步」；站名「錄影」「逐字稿」「初剪」','- 理由：流程有先後，用站點帶著觀眾走','','#### 動畫分鏡 x01','',...sbBeat,'',
  '## 需要我決定的事','','1. **結尾要不要配樂**：要的話從最後一句開始配','','### 金句候選（勾了才上，每集最多 6 則）','','| 候選 | 句號 | 原句 | 卡上文字（≤ 14 字） | 情緒（正／負／中） | 要不要 ☐ |','|---|---|---|---|---|---|','| 1 | #8 | 先做完初剪再談包裝 | 先初剪再包裝 | 正 | ☑ |','| 2 | #12 | 手動對時間最花力氣 | 對時間最花力氣 | 負 | ☐ |',''].join('\n'));
let editor,cutsEditor,sbEditor,browser;
try{
  editor=await startEditor({flags:{project:path.dirname(work),template:TPL},cwd:root,port:0,writeState:false,previewDir:path.join(root,'preview')});
  const framingResponse=await fetch(new URL('/api/framing',editor.url));
  if(!framingResponse.ok)throw Error(`構圖分析：${await framingResponse.text()}`);
  console.log('✔ 暫存示範專案與構圖分析就緒');
  browser=await puppeteer.launch({executablePath:findChrome(),headless:true});
  const page=await browser.newPage();await page.setViewport({width:1600,height:1060,deviceScaleFactor:1});
  page.on('pageerror',e=>console.error(`頁面：${e.message}`));
  await page.goto(new URL('/framing',editor.url).href);await page.waitForSelector('#main:not([hidden])',{timeout:30000}).catch(async e=>{throw Error(`${e.message}：${await page.$eval('#loading',e=>e.textContent)}`);});
  await page.waitForFunction(()=>window.framingImage && document.querySelector('#video').readyState>=2,{timeout:30000});
  await page.evaluate(()=>document.fonts.ready);
  await page.addStyleTag({content:'html { scroll-behavior:auto !important; }'});
  await page.click('#btnSuggest');
  // 番號只用於文件截圖，介面與專案設定不變。
  const mark=async(selector,n)=>page.$eval(selector,(e,n)=>{const r=e.getBoundingClientRect(),b=document.createElement('span');b.textContent=n;Object.assign(b.style,{position:'absolute',left:`${r.left+scrollX+8}px`,top:`${r.top+scrollY+8}px`,width:'32px',height:'32px',borderRadius:'50%',background:'#FF791F',color:'#090D17',font:'800 20px sans-serif',display:'grid',placeItems:'center',zIndex:99,boxShadow:'0 0 0 3px white'});b.className='docs-marker';document.body.append(b);},n);
  await mark('#stage','1');await mark('#preview','2');
  await page.$eval('#btnSave',e=>{const r=e.getBoundingClientRect(),b=document.createElement('span');b.textContent='3';Object.assign(b.style,{position:'absolute',left:`${r.left+scrollX-42}px`,top:`${r.top+scrollY}px`,width:'32px',height:'32px',borderRadius:'50%',background:'#FF791F',color:'#090D17',font:'800 20px sans-serif',display:'grid',placeItems:'center',zIndex:99,boxShadow:'0 0 0 3px white'});b.className='docs-marker';document.body.append(b);});
  const bounds=await page.$eval('#main',e=>{const r=e.getBoundingClientRect();return {bottom:r.bottom+scrollY};});
  await page.screenshot({path:path.join(OUT,'framing.jpg'),type:'jpeg',quality:88,clip:{x:0,y:0,width:1600,height:Math.ceil(bounds.bottom+16)}});
  await page.evaluate(()=>document.querySelectorAll('.docs-marker').forEach(e=>e.remove()));
  await page.click('[data-category="custom"]');await page.waitForSelector('#designPreviews iframe');
  for(const frame of page.frames().filter(f=>f.url().includes('/gallery/preview/')))await frame.waitForFunction(()=>window.gsap,{timeout:15000}).catch(()=>{});
  await page.$eval('#design',e=>e.scrollIntoView());
  await page.mouse.move(0,0);
  for(const frame of page.frames().filter(f=>f.url().includes('/gallery/preview/')))await frame.waitForFunction(()=>window.gsap?.globalTimeline.getChildren(false,false,true).some(t=>t.duration()>0&&t.paused()&&Math.abs(t.time()-(t.duration()-1.8))<.05),{timeout:15000});
  await mark('.design-controls','1');await mark('#designPreviews','2');
  const design=await page.$eval('#design',e=>{const r=e.getBoundingClientRect();return {x:Math.floor(r.x),y:Math.floor(r.y+scrollY),width:Math.floor(r.width),height:Math.ceil(r.height)};});
  // 取完整設定與前六個動畫，避免截斷操作區。
  await page.screenshot({path:path.join(OUT,'design.jpg'),type:'jpeg',quality:88,clip:design,captureBeyondViewport:true});
  await page.evaluate(()=>document.querySelectorAll('.docs-marker').forEach(e=>e.remove()));
  cutsEditor=await startEditor({flags:{project:path.dirname(cutsWork),template:TPL},cwd:root,port:0,writeState:false,previewDir:path.join(root,'preview')});
  await page.goto(new URL('/cuts',cutsEditor.url).href);await page.waitForSelector('.ct-row',{timeout:15000});
  await page.waitForFunction(()=>document.querySelector('#video').readyState>=2,{timeout:15000});
  await page.evaluate(()=>document.fonts.ready);
  // 第 1 列試聽到「會剪掉的部分」就暫停，截進度條與「正在播」那一刻
  await page.click('.ct-row[data-row="1"] .ct-play');
  await page.waitForFunction(()=>document.querySelector('#video').currentTime>13.2,{timeout:15000});
  await page.evaluate(()=>document.querySelector('#video').pause());
  await page.mouse.move(0,0);
  // 番號放在文字後面或區塊右側，不蓋住勾選框與文字
  const badge=async(selector,n,mode)=>page.$eval(selector,(e,n,mode)=>{const r=mode==='after'?(()=>{const g=document.createRange();g.selectNodeContents(e);return g.getBoundingClientRect();})():e.getBoundingClientRect(),b=document.createElement('span');b.className='docs-marker';b.textContent=n;Object.assign(b.style,{position:'absolute',left:`${(mode==='after'?r.right+10:r.right-46)+scrollX}px`,top:`${r.top+scrollY+(r.height-32)/2}px`,width:'32px',height:'32px',borderRadius:'50%',background:'#FF791F',color:'#090D17',font:'800 20px sans-serif',display:'grid',placeItems:'center',zIndex:99,boxShadow:'0 0 0 3px white'});document.body.append(b);},n,mode);
  await badge('#listTitle','1','after');await badge('.ct-player h2','2','after');await badge('#next','3','inside');
  const cutsBottom=await page.$eval('.ct-main',e=>Math.ceil(e.getBoundingClientRect().bottom+scrollY));
  await page.screenshot({path:path.join(OUT,'cuts.jpg'),type:'jpeg',quality:88,clip:{x:0,y:0,width:1600,height:cutsBottom},captureBeyondViewport:true});
  await page.evaluate(()=>document.querySelectorAll('.docs-marker').forEach(e=>e.remove()));
  sbEditor=await startEditor({flags:{project:path.dirname(sbWork),template:TPL},cwd:root,port:0,writeState:false,previewDir:path.join(root,'preview')});
  await page.goto(new URL('/storyboard',sbEditor.url).href);await page.waitForSelector('#sec-x01 .sb-edit',{timeout:15000});
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>{i.loading='eager';return i.complete?0:new Promise(r=>{i.onload=i.onerror=r;});}));});
  // 把畫面文字那一格點進編輯中，截到實際的編輯框
  await page.click('#sec-s01 .sb-field:nth-child(3) .sb-edit');
  await page.mouse.move(0,0);
  // 番號貼在區塊右上或左側，不蓋字
  const pin=async(selector,n,side)=>page.$eval(selector,(e,n,side)=>{const r=e.getBoundingClientRect(),b=document.createElement('span');b.className='docs-marker';b.textContent=n;Object.assign(b.style,{position:'absolute',left:`${(side==='left'?r.left-40:side==='below'?r.left+(r.width-32)/2:r.right+8)+scrollX}px`,top:`${(side==='below'?r.bottom+8:r.top+(r.height-32)/2)+scrollY}px`,width:'32px',height:'32px',borderRadius:'50%',background:'#FF791F',color:'#090D17',font:'800 20px sans-serif',display:'grid',placeItems:'center',zIndex:99,boxShadow:'0 0 0 3px white'});document.body.append(b);},n,side);
  await pin('#sec-s01 .sb-field:nth-child(3) .sb-label','1','left');
  await pin('#sec-x01 .sb-addrow','2','right');
  await pin('td.check input','3','left');
  await pin('#next','4','below');
  const sbBottom=await page.$eval('.sb-shell',e=>Math.ceil(e.getBoundingClientRect().bottom+scrollY));
  await page.screenshot({path:path.join(OUT,'storyboard.jpg'),type:'jpeg',quality:88,clip:{x:0,y:0,width:1600,height:sbBottom},captureBeyondViewport:true});
  const dimensions={storyboard:{width:1600,height:sbBottom},cuts:{width:1600,height:cutsBottom},framing:{width:1600,height:Math.ceil(bounds.bottom+16)},design:{width:design.width,height:design.height}};
  fs.writeFileSync(path.join(OUT,'dimensions.json'),JSON.stringify(dimensions,null,2)+'\n');
  console.log(JSON.stringify(dimensions));
  console.log(`✔ 文件圖解 4 張、介面截圖 4 張：${path.relative(WS,OUT)}`);
  console.log('介面截圖使用內建示範講者；未讀寫使用者專案、共用模板或個人參考圖。');
}finally{if(browser)await browser.close();if(editor)await editor.close();if(cutsEditor)await cutsEditor.close();if(sbEditor)await sbEditor.close();}
