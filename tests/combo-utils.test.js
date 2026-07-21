const test = require('node:test');
const assert = require('node:assert/strict');
const { parseScorePicks, crsKeyForScore, crsOddLookup, scoreOddsLabel, comboMetrics, normalizeComboItems, splitOptionValue, schemePrizeRange, enforceSingleMarketPerMatch, passTypeLabel } = require('../combo-utils.js');

test('比分字符串可按中文顿号、逗号和空格拆成多个比分并去重', () => {
  assert.deepEqual(parseScorePicks('2:1、1:1, 0:2  2:1'), ['2:1', '1:1', '0:2']);
});

test('比分可映射为中国体彩网比分赔率字段', () => {
  assert.equal(crsKeyForScore('2:1'), 's02s01');
  assert.equal(crsKeyForScore('0:0'), 's00s00');
  assert.equal(crsKeyForScore('胜其他'), 's-1sh');
});

test('非固定比分根据胜平负自动映射到其他比分赔率', () => {
  assert.equal(crsKeyForScore('4:3'), 's-1sh');
  assert.equal(crsKeyForScore('4:4'), 's-1sd');
  assert.equal(crsKeyForScore('3:4'), 's-1sa');
  assert.equal(scoreOddsLabel('4:3'), '胜其他');
  assert.equal(scoreOddsLabel('4:4'), '平其他');
  assert.equal(scoreOddsLabel('3:4'), '负其他');
  assert.equal(scoreOddsLabel('2:1'), '');
});

test('比分其他项兼容官方s-1s*与旧版s1s*字段', () => {
  assert.equal(crsOddLookup({'s-1sh':'35.00'}, '4:3'), 35);
  assert.equal(crsOddLookup({'s1sh':'28.00'}, '4:3'), 28);
  assert.equal(crsOddLookup({'s02s01':'9.5'}, '2:1'), 9.5);
  assert.equal(crsOddLookup({}, '2:1'), 0);
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

test('同一场可同时保留胜平负和让球胜平负，并排除进球数与比分', () => {
  const result=enforceSingleMarketPerMatch([{matchId:'1',options:[
    {market:'spf',pick:'h',odd:1.8},{market:'spf',pick:'a',odd:4.2},
    {market:'hhad',pick:'h',odd:3.1},{market:'hhad',pick:'d',odd:3.5},
    {market:'goals',pick:'2',odd:3.1},{market:'scores',pick:'2:1',odd:7}
  ]}]);
  assert.deepEqual(result[0].options.map(x=>`${x.market}:${x.pick}`),['spf:h','spf:a','hhad:h','hhad:d']);
});

test('映射到同一个其他比分赔率的多个输入只计为一个投注选项', () => {
  const result=enforceSingleMarketPerMatch([{matchId:'1',options:[
    {market:'scores',pick:'4:3',odd:35},{market:'scores',pick:'5:3',odd:35}
  ]}]);
  assert.equal(result[0].options.length,1);
});

test('单场方案保留所选注数并显示为单场而不是一串一', () => {
  const items=[{matchId:'1',options:[{market:'spf',pick:'h',odd:2},{market:'spf',pick:'d',odd:3}]}];
  assert.equal(comboMetrics(items).tickets,2);
  assert.equal(schemePrizeRange(items,2).cost,4);
  assert.equal(passTypeLabel(1),'单场');
  assert.equal(passTypeLabel(3),'3串1');
});

test('方案倍投会同步放大投注金额和理论最低最高返奖', () => {
  const items=[{matchId:'1',options:[{market:'spf',pick:'h',odd:2}]}];
  const base=schemePrizeRange(items,2,1),triple=schemePrizeRange(items,2,3);
  assert.equal(triple.multiple,3);
  assert.equal(triple.cost,base.cost*3);
  assert.equal(triple.minPrize,base.minPrize*3);
  assert.equal(triple.maxPrize,base.maxPrize*3);
});

test('小数赔率的倍投严格按已显示的一倍金额同比缩放', () => {
  const items=[{matchId:'1',options:[{market:'spf',pick:'h',odd:1.337}]}];
  const base=schemePrizeRange(items,2,1),triple=schemePrizeRange(items,2,3);
  assert.equal(base.minPrize,2.67);
  assert.equal(triple.minPrize,base.minPrize*3);
  assert.equal(triple.maxPrize,base.maxPrize*3);
});

test('方案倍数兼容旧数据并归一化异常输入', () => {
  const items=[{matchId:'1',options:[{market:'spf',pick:'h',odd:2}]}];
  assert.equal(schemePrizeRange(items,2).multiple,1);
  assert.equal(schemePrizeRange(items,2,'').multiple,1);
  assert.equal(schemePrizeRange(items,2,-3).multiple,1);
  assert.equal(schemePrizeRange(items,2,2.9).multiple,2);
  assert.equal(schemePrizeRange(items,2,100000).multiple,99999);
});

test('整个方案金额等于选项笛卡尔积注数乘固定2元', () => {
  const result = schemePrizeRange([
    {options:[{market:'spf',pick:'h',odd:1.8},{market:'spf',pick:'d',odd:3.2}]},
    {options:[{market:'spf',pick:'d',odd:3},{market:'spf',pick:'a',odd:4}]}
  ]);
  assert.equal(result.tickets, 4);
  assert.equal(result.cost, 8);
  assert.equal(result.minPrize, 10.8);
  assert.equal(result.maxPrize, 25.6);
});

test('同场多个玩法同时命中时整个方案最高返奖为所有中奖票奖金之和', () => {
  const result = schemePrizeRange([
    {options:[
      {market:'spf',pick:'h',odd:1.8},
      {market:'goals',pick:'2',odd:3},
      {market:'scores',pick:'2:0',odd:7}
    ]},
    {options:[{market:'spf',pick:'h',odd:2}]}
  ]);
  assert.equal(result.tickets, 3);
  assert.equal(result.cost, 6);
  assert.equal(result.minPrize, 7.2);
  assert.equal(result.maxPrize, 47.2);
});

test('让球结果参与整个方案理论返奖计算', () => {
  const result = schemePrizeRange([
    {options:[
      {market:'hhad',pick:'h',goalLine:-1,odd:3.3},
      {market:'hhad',pick:'d',goalLine:-1,odd:3.6}
    ]},
    {options:[{market:'spf',pick:'h',odd:2}]}
  ]);
  assert.equal(result.minPrize, 13.2);
  assert.equal(result.maxPrize, 14.4);
});

test('比分选项值只按第一个冒号拆分，保留完整比分', () => {
  assert.deepEqual(splitOptionValue('scores:2:1'), ['scores', '2:1']);
});

test('旧版让球选项可从标签恢复让球数', () => {
  const next = normalizeComboItems([{matchId:'1',num:'201',home:'甲',away:'乙',market:'hhad',pick:'d',label:'-1 让平 3.6',odd:3.6}]);
  assert.equal(next[0].options[0].goalLine, -1);
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
