const test = require('node:test');
const assert = require('node:assert/strict');
const { parseScorePicks, crsKeyForScore, comboMetrics, normalizeComboItems, splitOptionValue } = require('../combo-utils.js');

test('比分字符串可按中文顿号、逗号和空格拆成多个比分并去重', () => {
  assert.deepEqual(parseScorePicks('2:1、1:1, 0:2  2:1'), ['2:1', '1:1', '0:2']);
});

test('比分可映射为中国体彩网比分赔率字段', () => {
  assert.equal(crsKeyForScore('2:1'), 's02s01');
  assert.equal(crsKeyForScore('0:0'), 's00s00');
  assert.equal(crsKeyForScore('胜其他'), 's1sh');
});

test('多选组合计算注数及最低最高参考赔率而不是错误地相乘所有选项', () => {
  const items = [
    { options: [{ odd: 2 }, { odd: 3 }] },
    { options: [{ odd: 4 }, { odd: 5 }] }
  ];
  assert.deepEqual(comboMetrics(items), { legs: 2, tickets: 4, minOdd: 8, maxOdd: 15, complete: true });
});

test('缺少赔率的比分或进球选择仍计算注数但标记赔率不完整', () => {
  const result = comboMetrics([{options:[{odd:2},{odd:0}]},{options:[{odd:3}]}]);
  assert.equal(result.tickets, 2);
  assert.equal(result.complete, false);
  assert.equal(result.minOdd, 6);
  assert.equal(result.maxOdd, 6);
});

test('比分选项值只按第一个冒号拆分，保留完整比分', () => {
  assert.deepEqual(splitOptionValue('scores:2:1'), ['scores', '2:1']);
});

test('旧版每场单选组合自动迁移为新版多选结构', () => {
  const old = [
    { matchId:'1', num:'201', home:'甲', away:'乙', market:'spf', pick:'d', label:'平 3.2', odd:3.2 },
    { matchId:'2', num:'202', home:'丙', away:'丁', market:'hhad', pick:'h', label:'让胜 2.1', odd:2.1 }
  ];
  const next = normalizeComboItems(old);
  assert.equal(next.length, 2);
  assert.equal(next[0].options[0].label, '平 3.2');
});
