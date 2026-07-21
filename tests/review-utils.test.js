const test = require('node:test');
const assert = require('node:assert/strict');
const { optionWins } = require('../combo-utils.js');
const {
  recentDateKeys, parseScore, isFinishedResult, normalizeResultRecord,
  evaluateDraft, summarizeDay, formatReviewScanRow
} = require('../review-utils.js');

test('最近3天日期包含今天并向前共3天', () => {
  assert.deepEqual(recentDateKeys(3, '2026-07-21'), ['2026-07-19','2026-07-20','2026-07-21']);
});

test('复盘日期默认按北京时间，避免海外时区少一天', () => {
  const { chinaDateKey } = require('../review-utils.js');
  // 2026-07-21 01:30 UTC = 北京时间 09:30，仍是 21 日
  assert.equal(chinaDateKey(new Date('2026-07-21T01:30:00Z')), '2026-07-21');
});

test('比分解析支持冒号和中文冒号', () => {
  assert.deepEqual(parseScore('2:1'), {home:2,away:1,text:'2:1'});
  assert.deepEqual(parseScore('0：0'), {home:0,away:0,text:'0:0'});
  assert.equal(parseScore(''), null);
});

test('完赛判定要求有效比分且非未开赛', () => {
  assert.equal(isFinishedResult({sectionsNo999:'2:1',matchResultStatus:'2'}), true);
  assert.equal(isFinishedResult({sectionsNo999:'2:1',matchResultStatus:'1'}), true);
  assert.equal(isFinishedResult({sectionsNo999:'',matchResultStatus:'0'}), false);
  assert.equal(isFinishedResult({sectionsNo999:'-1:-1',matchResultStatus:'2'}), false);
});

test('赛果记录标准化', () => {
  const row=normalizeResultRecord({
    matchId:2040569,matchDate:'2026-07-21',matchNumStr:'周一204',homeTeam:'卡尔马',awayTeam:'马尔默',
    sectionsNo999:'2:2',sectionsNo1:'2:1',winFlag:'D',matchResultStatus:'2',goalLine:'-1',leagueNameAbbr:'瑞超'
  });
  assert.equal(row.matchId,'2040569');
  assert.equal(row.score,'2:2');
  assert.equal(row.halfScore,'2:1');
  assert.equal(row.winFlag,'D');
  assert.equal(row.goalLine,'-1');
});

test('研究命中：胜平负部分命中会标记 anyHit', () => {
  const match={score:'2:1',matchResultStatus:'2',hhad:{goalLine:'-1'}};
  const draft={spf:['h','d'],hhad:['a'],goals:['3'],scores:'2:1、1:1'};
  const result=evaluateDraft(match,draft,optionWins);
  assert.equal(result.finished,true);
  assert.equal(result.anyHit,true);
  assert.deepEqual(result.hitKeys.sort(),['goals:3','scores:2:1','spf:h'].sort());
  assert.equal(result.detail.spf.find(x=>x.pick==='h').hit,true);
  assert.equal(result.detail.spf.find(x=>x.pick==='d').hit,false);
});

test('未完赛不计算命中高亮', () => {
  const result=evaluateDraft({matchResultStatus:'0'},{spf:['h']},optionWins);
  assert.equal(result.finished,false);
  assert.equal(result.anyHit,false);
  assert.deepEqual(result.hitKeys,[]);
});

test('日汇总统计完赛与命中场次', () => {
  const matches=[
    {id:'1',score:'1:0',matchResultStatus:'2',hhad:{goalLine:0}},
    {id:'2',score:'0:0',matchResultStatus:'2',hhad:{goalLine:0}},
    {id:'3',matchResultStatus:'0'}
  ];
  const drafts={
    '1':{spf:['h']},
    '2':{spf:['h']},
    '3':{spf:['d']}
  };
  const summary=summarizeDay(matches,drafts,optionWins);
  assert.equal(summary.total,3);
  assert.equal(summary.finished,2);
  assert.equal(summary.pending,1);
  assert.equal(summary.researched,3);
  assert.equal(summary.hitMatches,1);
  assert.equal(summary.allFinished,false);
});

test('复盘扫盘行标记正确选项', () => {
  const row=formatReviewScanRow(
    {num:'周二201',time:'18:30',league:'韩职',home:'甲',away:'乙',score:'2:1',matchResultStatus:'2',hhad:{goalLine:'-1'}},
    {spf:['h','d'],hhad:['a'],goals:['3'],scores:'2:1'},
    optionWins
  );
  assert.equal(row.edited,true);
  assert.equal(row.anyHit,true);
  assert.equal(row.spf.find(x=>x.pick==='h').hit,true);
  assert.equal(row.spf.find(x=>x.pick==='d').hit,false);
  assert.equal(row.scores[0].hit,true);
});
