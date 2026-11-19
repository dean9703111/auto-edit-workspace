// 062：剪輯台輸出過完成影片之後，「整理這集的調整給 AI」寫 work/feedback/learn.md、複製一行指令（和 deliver.mjs 回報裡的同一行）
import { test as nodeTest } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { startEditor } from '../../shared/template/tools/editor.mjs';
import { findChrome } from '../../shared/template/tools/lib/audit-browser.mjs';
import { learnLine } from '../../shared/template/tools/lib/learn.mjs';
import { TEMPLATE, missingTools, skipAll, tmpDir } from './helpers.mjs';

const noUi = await missingTools('chrome', 'ffmpeg', 'puppeteer');
const test = skipAll(nodeTest, noUi);
const puppeteer = noUi ? null : (await import('puppeteer-core')).default;

test('整理這集的調整給 AI：還沒輸出不出現；輸出過之後在預覽上方出現，按了寫 learn.md、複製那一行；剪貼簿不行時說要怎麼跟 AI 講', async (t) => {
  const root = tmpDir(t, 'editor-learn-ui-');
  const project = path.join(root, 'projects/example'), work = path.join(project, 'work');
  fs.mkdirSync(path.join(work, 'hyperframes'), { recursive: true });
  fs.mkdirSync(path.join(work, 'feedback'), { recursive: true });
  fs.mkdirSync(path.join(root, 'shared'));
  fs.symlinkSync(TEMPLATE, path.join(root, 'shared/template'), 'dir');
  fs.writeFileSync(path.join(work, 'hyperframes/plan.json'), JSON.stringify({ version: 1, scenes: [
    { id: 's01', scene: 'concept', from: '#1', to: '#1e', slots: { text: '第一段' } },
  ] }));
  fs.writeFileSync(path.join(work, 'rough.srt'), '1\n00:00:00,500 --> 00:00:02,500\n第一段字幕\n');
  fs.writeFileSync(path.join(work, 'feedback/r1.md'), '# 回饋 r1（2026-11-19 10:00）\n\n## 原話\n\n「s01 字太多，以後都短一點」\n\n## 分類\n\n| # | 原話節錄 | 規則／個案 | 改哪一段 | 改法 |\n|---|---|---|---|---|\n| 1 | s01 字太多 | 規則 | s01 | 縮短 |\n\n建議改規則：\n- 資訊卡一張最多 8 個字（文件）\n\n## 改了哪幾段\n\n- s01：縮短（v1 → v2）\n');
  const media = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=navy:size=320x180:rate=30', '-t', '3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(work, 'rough.mp4')]);
  assert.equal(media.status, 0, String(media.stderr));
  const editor = await startEditor({ cwd: root, flags: { project, template: path.join(root, 'shared/template') }, port: 0, writeState: false });
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: findChrome(), headless: true });
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewport({ width: 1600, height: 1000 });
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => { window.copiedLine = text; } } });
    });
    await page.goto(editor.url);
    await page.waitForSelector('#modeNote');
    await new Promise((r) => setTimeout(r, 800));
    assert.equal(await page.$('[data-learn]'), null, '還沒輸出完成影片：不出現');
    // 輸出過：output/final.mp4 在了（剪輯台輪詢輸出狀態時看得到）
    fs.mkdirSync(path.join(project, 'output'), { recursive: true });
    fs.copyFileSync(path.join(work, 'rough.mp4'), path.join(project, 'output/final.mp4'));
    await page.reload();
    await page.waitForSelector('[data-learn]', { timeout: 15000 });
    await page.evaluate(() => { const c = document.querySelector('#coach'); if (c) c.hidden = true; });
    await page.click('[data-learn]');
    await page.waitForFunction(() => window.copiedLine);
    assert.equal(await page.evaluate(() => window.copiedLine), learnLine('projects/example'));
    const md = fs.readFileSync(path.join(work, 'feedback/learn.md'), 'utf8');
    assert.match(md, /「s01 字太多，以後都短一點」/);
    assert.match(md, /- 資訊卡一張最多 8 個字（文件）（1 次：r1）/);
    await page.waitForFunction(() => /整理好了（回饋 1 輪.*指令已複製/.test(document.body.textContent));
    // 剪貼簿不行：說要怎麼跟 AI 講
    await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error('denied'); }; document.execCommand = () => false; });
    await page.click('[data-learn]');
    await page.waitForFunction(() => document.body.textContent.includes('跟 AI 說「照這集的調整紀錄學我的習慣」'));
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await editor.close();
  }
});
