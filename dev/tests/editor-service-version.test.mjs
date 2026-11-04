import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { TEMPLATE, TOOLS, imp } from './helpers.mjs';

const { SERVER_REVISION } = await imp('editor.mjs');

test('重新開啟舊版服務會更新後端並保留原網址；新 API 正常回傳 JSON', { timeout: 60000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-editor-version-'));
  const project = path.join(root, 'projects', 'version');
  const dir = path.join(project, 'work', 'hyperframes', '.editor');
  fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(path.join(root, 'shared'));
  fs.symlinkSync(TEMPLATE, path.join(root, 'shared', 'template'));
  const stateFile = path.join(dir, 'server.json');
  const legacy = path.join(root, 'legacy.mjs');
  fs.writeFileSync(legacy, `import fs from 'node:fs'; import http from 'node:http';
const project=process.argv[2], file=process.argv[3];
const server=http.createServer((req,res)=>{
  if(req.url==='/api/ping'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,app:'auto-edit-editor',project,pid:process.pid}));}
  else if(req.url==='/api/shutdown'){res.end('{}');server.close(()=>process.exit(0));}
  else {res.writeHead(404,{'Content-Type':'text/plain'});res.end('找不到這個頁面');}
});
server.listen(0,'127.0.0.1',()=>{const port=server.address().port;fs.writeFileSync(file,JSON.stringify({pid:process.pid,port,url:'http://127.0.0.1:'+port+'/',project,token:'test'}));});`);
  const child = spawn(process.execPath, [legacy, project, stateFile], { stdio: 'ignore' });
  const cli = (...extra) => spawnSync(process.execPath, [path.join(TOOLS, 'editor.mjs'), '--project', project, '--template', TEMPLATE, ...extra], { cwd: root, encoding: 'utf8', timeout: 30000 });
  try {
    const deadline = Date.now() + 5000;
    while (!fs.existsSync(stateFile) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 30));
    assert.ok(fs.existsSync(stateFile));
    const old = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    assert.equal((await fetch(new URL('/api/design', old.url))).status, 404);
    const started = cli('--background'); assert.equal(started.status, 0, started.stdout + started.stderr);
    assert.match(started.stdout, /已有新版.*更新並重新啟動/);
    const current = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    assert.equal(current.url, old.url, '原分頁仍使用同一個網址'); assert.notEqual(current.pid, old.pid);
    const ping = await (await fetch(new URL('/api/ping', current.url))).json();
    assert.equal(ping.revision, SERVER_REVISION);
    const design = await fetch(new URL('/api/design', current.url));
    assert.equal(design.status, 200); assert.ok((await design.json()).previews.length > 30);
    const unknown = await fetch(new URL('/api/missing-feature', current.url));
    assert.equal(unknown.status, 404); assert.equal((await unknown.json()).error, 'notfound');
    assert.match(cli('--background').stdout, /剪輯已經開著/, '同版本繼續使用原服務');
  } finally { cli('--stop'); child.kill(); }
});
