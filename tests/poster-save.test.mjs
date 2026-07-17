import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');

test('海报弹窗不用夸克触控异常的原生dialog并强制静态资源同版本',()=>{
  assert.doesNotMatch(html,/<dialog id="posterDialog"/);
  assert.match(html,/<div id="posterDialog"/);
  assert.match(html,/styles\.css\?v=/);
  assert.match(html,/app\.js\?v=/);
  assert.match(app,/posterDialog'\)\.hidden/);
});

test('图片预览失败时隐藏破图并回退显示Canvas',()=>{
  assert.match(app,/posterImage.*onerror/s);
  assert.match(app,/toDataURL\('image\/png'\)/);
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

test('支持文件分享时优先调用安卓系统分享面板',()=>{
  assert.match(app,/navigator\.canShare/);
  assert.match(app,/navigator\.share/);
  assert.match(app,/new File/);
});
