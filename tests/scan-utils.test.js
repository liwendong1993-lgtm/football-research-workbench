const test=require('node:test');
const assert=require('node:assert/strict');
const {formatScanRow}=require('../scan-utils.js');

test('扫盘行把多选胜平负、让球、进球数和比分格式化为紧凑文本',()=>{
  const match={num:'周五201',time:'01:00',league:'瑞超',home:'哥德堡',away:'布鲁马波',hhad:{goalLine:'-1'}};
  const draft={spf:['h','d'],hhad:['h','d'],goals:['3','4'],scores:'2:1、3:0',confidence:'主推'};
  assert.deepEqual(formatScanRow(match,draft),{
    num:'201',time:'01:00',league:'瑞超',teams:'哥德堡 VS 布鲁马波',result:'胜/平',handicap:'-1 让胜/让平',goals:'3球/4球',scores:'2:1/3:0',confidence:'主推',edited:true
  });
});

test('未编辑场次在扫盘图显示待研究',()=>{
  const row=formatScanRow({num:'周五202',time:'02:00',league:'英超',home:'甲',away:'乙',hhad:{}},{spf:[],hhad:[],goals:[],scores:'',confidence:''});
  assert.equal(row.result,'待研究');
  assert.equal(row.edited,false);
});
