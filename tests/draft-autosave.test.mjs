import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');

test('单场玩法和信心点选后立即自动保存',()=>{
  assert.match(app,/function persistDraft/);
  assert.match(app,/data-market[\s\S]*persistDraft\(\)/);
  assert.match(app,/data-confidence[\s\S]*persistDraft\(\)/);
});

test('比分增删和分析理由都会自动保存',()=>{
  assert.match(app,/addScore[\s\S]*persistDraft\(\)/);
  assert.match(app,/data-remove-score[\s\S]*persistDraft\(\)/);
  assert.match(app,/noteInput[\s\S]*oninput/);
});

test('不再要求滚到底部点击保存本场研究',()=>{
  assert.doesNotMatch(app,/id="saveDraftBtn"/);
  assert.match(app,/id="draftAutoSaveStatus"/);
  assert.match(app,/dlg\.onclose/);
});
