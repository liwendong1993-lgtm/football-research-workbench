import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../styles.css',import.meta.url),'utf8');

test('海报弹窗不用夸克触控异常的原生dialog并强制静态资源同版本',()=>{
  assert.doesNotMatch(html,/<dialog id="posterDialog"/);
  assert.match(html,/<div id="posterDialog"/);
  assert.match(html,/styles\.css\?v=/);
  assert.match(html,/app\.js\?v=/);
  assert.match(app,/posterDialog'\)\.hidden/);
});

test('图片预览失败时隐藏破图并回退显示Canvas',()=>{
  assert.match(app,/posterImage.*onerror/s);
  assert.match(app,/toDataURL\(/);
  assert.match(app,/posterCanvas.*hidden/s);
});

test('海报保存提供真实图片预览供安卓浏览器长按保存',()=>{
  assert.match(html,/id="posterImage"/);
  assert.match(html,/id="openPosterBtn"/);
  assert.match(app,/canvas\.toBlob/);
});

test('单场组合可保存且组合弹窗内显示错误状态',()=>{
  assert.match(app,/id="comboSaveStatus"/);
  assert.match(app,/if\(!items\.length\)/);
  assert.doesNotMatch(app,/items\.length<2/);
  assert.match(app,/saveCombo\.addEventListener\(['"]click['"]/);
});

test('非夸克路径仍支持系统文件分享',()=>{
  assert.match(app,/navigator\.canShare/);
  assert.match(app,/navigator\.share/);
  assert.match(app,/new File/);
  assert.match(app,/if\(!quark&&typeof File==='function'&&navigator\.share/);
});

test('提供 roundRect 与超高画布保护',()=>{
  assert.match(app,/function ensureRoundRect/);
  assert.match(app,/function preparePosterCanvas/);
  assert.match(app,/POSTER_MAX_EDGE/);
  assert.match(app,/revokePosterPreviewUrl/);
  assert.match(app,/生成扫盘图失败/);
  assert.match(app,/生成方案图失败/);
});

test('夸克保存避开伪分享并提供 dataURL 长按保存层',()=>{
  assert.match(app,/isQuarkLike\s*=/);
  assert.match(app,/function openPosterSaveLayer/);
  assert.match(app,/exportPosterAsset/);
  assert.match(app,/image\/jpeg/);
  assert.match(app,/posterSaveLayer/);
  assert.match(app,/openPosterSaveLayer\(asset\)/);
  assert.match(html,/保存到相册|新页面打开图片/);
  assert.match(css,/\.poster-save-layer/);
});

test('夸克相册保存走 Service Worker 同源 HTTP 图片',()=>{
  assert.match(app,/publishPosterHttp/);
  assert.match(app,/ensureAlbumAsset/);
  assert.match(app,/STORE_POSTER/);
  assert.match(app,/__poster__/);
  const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');
  assert.match(sw,/STORE_POSTER/);
  assert.match(sw,/__poster__/);
  assert.match(sw,/POSTER_CACHE/);
});

test('保存页用原生链接打开并预填 URL，避免 await 后 window.open 被夸克拦截',()=>{
  assert.match(app,/posterSaveOpenLink/);
  assert.match(app,/openUrlInNewContext/);
  assert.match(app,/posterSaveReady/);
  assert.match(app,/系统下载\/打开/);
});

test('夸克保存一键直达系统下载，不强制多步保存页',()=>{
  assert.match(app,/if\(quark\)\{[\s\S]*openUrlInNewContext\(href,filename\)/);
  assert.doesNotMatch(app,/if\(quark\)\{\s*await openPosterSaveLayer\(asset\)/);
});

test('夸克生成预览后自动触发一次系统保存',()=>{
  assert.match(app,/posterAutoSaved/);
  assert.match(app,/已自动开始保存/);
});
