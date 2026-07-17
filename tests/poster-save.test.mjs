import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');

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
