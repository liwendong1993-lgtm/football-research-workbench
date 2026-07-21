import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const manifest=fs.readFileSync(new URL('../manifest.webmanifest',import.meta.url),'utf8');

test('网站与扫盘图使用老花鉴足品牌文案',()=>{
  assert.match(html,/<title>老花鉴足<\/title>/);
  assert.match(html,/<h1>老花鉴足<\/h1>/);
  assert.match(app,/fillText\('老花今日',42,88\)/);
  const manifestData=JSON.parse(manifest);
  assert.equal(manifestData.name,'老花鉴足');
  assert.equal(manifestData.short_name,'老花鉴足');
});

test('方案卡片提供倍数输入并实时更新金额和返奖',()=>{
  assert.match(app,/data-combo-multiple/);
  assert.match(app,/schemePrizeRange\(items,2,c\.multiple/);
  assert.match(app,/multiple:.*comboMultiple/);
  assert.match(app,/data-combo-cost/);
  assert.match(app,/data-combo-min-prize/);
  assert.match(app,/data-combo-max-prize/);
});

test('首页研究概览压缩为单行',()=>{
  assert.match(html,/hero-summary-line/);
  assert.doesNotMatch(html,/progress-ring/);
  assert.match(css,/\.hero-summary-line/);
});

test('比赛卡片采用两行紧凑布局',()=>{
  assert.match(app,/class="match-line"/);
  assert.match(app,/class="match-detail-line"/);
  assert.match(css,/\.match-line/);
  assert.match(css,/\.match-detail-line/);
});

test('比赛卡片的已选胜平负标签只显示具体选择',()=>{
  assert.match(app,/if\(d\.spf\.length\) summary\.push\(d\.spf\.map\(x=>pickLabel\('spf',x\)\)\.join\('\/'\)\)/);
  assert.doesNotMatch(app,/summary\.push\(`胜平负 /);
  assert.match(app,/<div class="pick-group"><h4>胜平负<\/h4>/);
  assert.match(app,/function marketLabel\(market\)\{return \{spf:'胜平负'/);
  assert.match(app,/\{x:588,w:120,l:'胜平负'\}/);
  assert.match(html,/复盘/);
  assert.match(html,/id="reviewDateStrip"/);
  assert.match(app,/function reviewMatchCard\(/);
  assert.match(app,/getUniformMatchResultV1\.qry/);
});

test('紧凑卡片保留完整队名提示并限制标签区域溢出',()=>{
  assert.match(app,/class="compact-team" title="\$\{esc\(m\.home\)\}"/);
  assert.match(app,/class="compact-team" title="\$\{esc\(m\.away\)\}"/);
  assert.match(css,/\.match-detail-line \.pick-summary\{[^}]*overflow-x:auto/);
});

test('倍投保存、海报和自动保存共用持久化数据',()=>{
  assert.match(app,/nextMultiple=normalizeMultiple\(input\.value\)[\s\S]*combo\.multiple=nextMultiple/);
  assert.match(app,/drawSingleComboPoster[\s\S]*schemePrizeRange\(items,2,combo\?\.multiple\)/);
  assert.match(app,/drawPoster[\s\S]*schemePrizeRange\(items,2,c\.multiple\)/);
  assert.match(app,/function persistDraft\(\)/);
});

test('方案卡片倍数保存失败时恢复原值并就地提示',()=>{
  assert.match(app,/previousMultiple=normalizeMultiple\(combo\.multiple\)/);
  assert.match(app,/catch\(error\)\{[\s\S]*combo\.multiple=previousMultiple[\s\S]*input\.value=previousMultiple[\s\S]*倍数保存失败/);
  assert.match(css,/\.combo-calc-note\.error/);
});

test('超长联赛名不会撑宽或增加比赛卡片行数',()=>{
  assert.match(css,/\.match-line \.league\{[^}]*max-width:[^;}]+;[^}]*overflow:hidden[^}]*white-space:nowrap/);
  assert.match(css,/\.match-line \.match-no\{[^}]*white-space:nowrap/);
});

test('夸克海报预览失败时回退Canvas',()=>{
  assert.match(html,/<div id="posterDialog"/);
  assert.doesNotMatch(html,/<dialog id="posterDialog"/);
  assert.match(app,/image\.onerror=.*canvas\.hidden=false/);
});

test('发布缓存版本在应用外壳中保持一致',()=>{
  const release='20260721-review2';
  for(const asset of ['styles.css','combo-utils.js','scan-utils.js','review-utils.js','app.js']){
    const escapedAsset=asset.replace('.','\\.');
    assert.match(html,new RegExp(`${escapedAsset}\\?v=${release}`));
    assert.match(sw,new RegExp(`${escapedAsset}\\?v=${release}`));
  }
  assert.match(app,new RegExp(`sw\\.js\\?v=${release}`));
  assert.match(sw,/football-workbench-v16/);
});
