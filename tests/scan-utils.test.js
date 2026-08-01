const test=require('node:test');
const assert=require('node:assert/strict');
const {formatScanRow,sortMatchesBySequence}=require('../scan-utils.js');

test('扫盘图按比赛序号而不是开赛时间排列',()=>{
  const matches=[
    ...Array.from({length:9},(_,index)=>({num:`周六${String(index+8).padStart(3,'0')}`,time:index<2?'00:00':'08:00'})),
    ...Array.from({length:7},(_,index)=>({num:`周六${String(index+1).padStart(3,'0')}`,time:`${String(18+index).padStart(2,'0')}:00`})),
    {num:'自定义',time:'17:00'}
  ];
  assert.deepEqual(
    sortMatchesBySequence(matches).map(match=>match.num),
    [...Array.from({length:16},(_,index)=>`周六${String(index+1).padStart(3,'0')}`),'自定义']
  );
  assert.equal(matches[0].num,'周六008');
});

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
