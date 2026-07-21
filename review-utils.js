(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root) root.ReviewUtils=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const SPF_LABELS={h:'胜',d:'平',a:'负'};
  const HHAD_LABELS={h:'让胜',d:'让平',a:'让负'};

  function pad(n){return String(n).padStart(2,'0')}
  function toDateKey(date){
    if(typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
    const d=date instanceof Date?date:new Date(date);
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }
  function chinaDateKey(date=new Date()){
    try{
      return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
    }catch{
      return toDateKey(date);
    }
  }
  function addDays(dateKey,delta){
    const d=new Date(`${dateKey}T12:00:00`);
    d.setDate(d.getDate()+delta);
    return toDateKey(d);
  }
  function recentDateKeys(days=3,today=new Date()){
    const end=typeof today==='string'?toDateKey(today):chinaDateKey(today);
    const keys=[];
    for(let i=days-1;i>=0;i-=1) keys.push(addDays(end,-i));
    return keys;
  }
  // 竞彩编号里的“周一/周二…”对应开售日，不是自然开赛日。
  const WEEKDAY_INDEX={'周日':0,'周一':1,'周二':2,'周三':3,'周四':4,'周五':5,'周六':6};
  function saleDateFromMatchNum(num,matchDate){
    const label=String(num||'').match(/周[日一二三四五六]/)?.[0];
    const base=toDateKey(matchDate||'');
    if(!label||!base||!(label in WEEKDAY_INDEX)) return base||'';
    const target=WEEKDAY_INDEX[label];
    const d=new Date(`${base}T12:00:00`);
    for(let i=0;i<7;i+=1){
      const candidate=new Date(d);
      candidate.setDate(d.getDate()-i);
      if(candidate.getDay()===target) return toDateKey(candidate);
    }
    return base;
  }
  function matchSaleDate(match={}){
    const num=match.num||match.matchNumStr||'';
    const matchDate=match.matchDate||'';
    const fromNum=saleDateFromMatchNum(num,matchDate||match.businessDate);
    // 在售列表通常已带正确 businessDate；赛果接口常把 matchDate 当成 businessDate，需按编号回推。
    if(match.businessDate&&fromNum&&match.businessDate!==fromNum&&/周[日一二三四五六]/.test(num)) return fromNum;
    if(match.businessDate&&!match.fromResult) return match.businessDate;
    return fromNum||match.businessDate||matchDate||'';
  }
  function parseScore(value){
    const m=String(value||'').trim().match(/^(\d+)\s*[:：-]\s*(\d+)$/);
    if(!m) return null;
    return {home:Number(m[1]),away:Number(m[2]),text:`${Number(m[1])}:${Number(m[2])}`};
  }
  function isFinishedResult(result={}){
    const score=parseScore(result.score||result.sectionsNo999);
    if(!score) return false;
    const status=String(result.resultStatus??result.matchResultStatus??'');
    if(status==='0') return false;
    if(result.scoreText==='取消'||result.sectionsNo999==='-1:-1') return false;
    return true;
  }
  function resultStatusLabel(result={}){
    if(result.scoreText==='取消'||result.sectionsNo999==='-1:-1') return '取消';
    const status=String(result.resultStatus??result.matchResultStatus??'');
    if(status==='0') return '未开赛';
    if(status==='1') return parseScore(result.score||result.sectionsNo999)?'待开奖':'进行中';
    if(status==='3') return '暂停兑奖';
    if(status==='2'||isFinishedResult(result)) return '已完赛';
    if(parseScore(result.score||result.sectionsNo999)) return '有比分';
    return '未开赛';
  }
  function normalizeResultRecord(raw={}){
    const score=parseScore(raw.sectionsNo999||raw.score||raw.finalScore);
    const half=parseScore(raw.sectionsNo1||raw.halfScore);
    const winFlag=String(raw.winFlag||'').toUpperCase();
    const num=raw.matchNumStr||raw.num||'';
    const matchDate=raw.matchDate||'';
    const businessDate=saleDateFromMatchNum(num,matchDate||raw.businessDate)||raw.businessDate||matchDate||'';
    return {
      matchId:String(raw.matchId||raw.id||''),
      matchDate:matchDate||businessDate||'',
      businessDate,
      num,
      league:raw.leagueNameAbbr||raw.leagueAbbName||raw.leagueName||raw.league||'',
      home:raw.homeTeam||raw.allHomeTeam||raw.home||'',
      away:raw.awayTeam||raw.allAwayTeam||raw.away||'',
      goalLine:raw.goalLine!=null&&raw.goalLine!==''?String(raw.goalLine).replace(/\.00$/,''):'',
      score:score?score.text:'',
      halfScore:half?half.text:'',
      winFlag:winFlag==='H'||winFlag==='D'||winFlag==='A'?winFlag:'',
      matchResultStatus:String(raw.matchResultStatus??raw.resultStatus??''),
      poolStatus:raw.poolStatus||'',
      sectionsNo999:raw.sectionsNo999||score?.text||'',
      sectionsNo1:raw.sectionsNo1||half?.text||'',
      fromResult:true
    };
  }
  function evaluateDraft(match={},draft={},optionWins){
    const score=parseScore(match.score||match.sectionsNo999||match.result?.score);
    const finished=isFinishedResult({
      score:score?.text,
      sectionsNo999:match.sectionsNo999||score?.text,
      matchResultStatus:match.matchResultStatus??match.resultStatus??match.result?.matchResultStatus
    });
    const d=draft||{};
    const picks={
      spf:[...(d.spf||[])],
      hhad:[...(d.hhad||[])],
      goals:[...(d.goals||[])],
      scores:String(d.scores||'').split(/[、,，/\s]+/).map(x=>x.trim()).filter(Boolean)
    };
    const hitKeys=[];
    const detail={spf:[],hhad:[],goals:[],scores:[]};
    if(!finished||!score||typeof optionWins!=='function'){
      return {finished:false,score:score?.text||'',homeGoals:score?.home??null,awayGoals:score?.away??null,anyHit:false,hitCount:0,pickCount:picks.spf.length+picks.hhad.length+picks.goals.length+picks.scores.length,hitKeys,detail,picks};
    }
    const goalLine=Number(match.hhad?.goalLine??match.goalLine??match.result?.goalLine);
    picks.spf.forEach(pick=>{
      const hit=optionWins({market:'spf',pick,odd:1},score.home,score.away);
      detail.spf.push({pick,label:SPF_LABELS[pick]||pick,hit});
      if(hit) hitKeys.push(`spf:${pick}`);
    });
    picks.hhad.forEach(pick=>{
      const hit=optionWins({market:'hhad',pick,goalLine:Number.isFinite(goalLine)?goalLine:0,odd:1},score.home,score.away);
      detail.hhad.push({pick,label:HHAD_LABELS[pick]||pick,hit});
      if(hit) hitKeys.push(`hhad:${pick}`);
    });
    picks.goals.forEach(pick=>{
      const hit=optionWins({market:'goals',pick,odd:1},score.home,score.away);
      detail.goals.push({pick,label:`${pick}球`,hit});
      if(hit) hitKeys.push(`goals:${pick}`);
    });
    picks.scores.forEach(pick=>{
      const hit=optionWins({market:'scores',pick,odd:1},score.home,score.away);
      detail.scores.push({pick,label:pick,hit});
      if(hit) hitKeys.push(`scores:${pick}`);
    });
    return {
      finished:true,
      score:score.text,
      homeGoals:score.home,
      awayGoals:score.away,
      anyHit:hitKeys.length>0,
      hitCount:hitKeys.length,
      pickCount:picks.spf.length+picks.hhad.length+picks.goals.length+picks.scores.length,
      hitKeys,
      detail,
      picks
    };
  }
  function summarizeDay(matches,drafts,optionWins){
    const list=matches||[];
    let finished=0,pending=0,researched=0,hitMatches=0,hitPicks=0;
    list.forEach(match=>{
      const draft=drafts?.[match.id]||{};
      const evalResult=evaluateDraft(match,draft,optionWins);
      const edited=Boolean((draft.spf||[]).length||(draft.hhad||[]).length||(draft.goals||[]).length||draft.scores||draft.confidence||draft.note);
      if(edited) researched+=1;
      if(evalResult.finished){
        finished+=1;
        if(edited&&evalResult.anyHit) hitMatches+=1;
        hitPicks+=evalResult.hitCount;
      }else pending+=1;
    });
    return {
      total:list.length,
      finished,
      pending,
      researched,
      hitMatches,
      hitPicks,
      allFinished:list.length>0&&pending===0
    };
  }
  function formatReviewScanRow(match,draft,optionWins){
    const d=draft||{};
    const evalResult=evaluateDraft(match,d,optionWins);
    const spf=(d.spf||[]).map(pick=>({pick,label:SPF_LABELS[pick]||pick,hit:evalResult.detail.spf.some(x=>x.pick===pick&&x.hit)}));
    const hhad=(d.hhad||[]).map(pick=>({pick,label:HHAD_LABELS[pick]||pick,hit:evalResult.detail.hhad.some(x=>x.pick===pick&&x.hit)}));
    const goals=(d.goals||[]).map(pick=>({pick,label:`${pick}球`,hit:evalResult.detail.goals.some(x=>x.pick===pick&&x.hit)}));
    const scores=String(d.scores||'').split(/[、,，/\s]+/).map(x=>x.trim()).filter(Boolean).map(pick=>({pick,label:pick,hit:evalResult.detail.scores.some(x=>x.pick===pick&&x.hit)}));
    const edited=Boolean(spf.length||hhad.length||goals.length||scores.length||d.confidence||d.note);
    return {
      num:String(match?.num||'').replace(/\D/g,'').slice(-3)||'—',
      time:match?.time||'—',
      league:match?.league||'—',
      teams:`${match?.home||'—'} VS ${match?.away||'—'}`,
      score:evalResult.score||'—',
      status:resultStatusLabel(match),
      spf,hhad,goals,scores,
      handicapLine:match?.hhad?.goalLine||match?.goalLine||'',
      confidence:d.confidence||'',
      edited,
      finished:evalResult.finished,
      anyHit:evalResult.anyHit
    };
  }

  return {
    toDateKey,chinaDateKey,addDays,recentDateKeys,saleDateFromMatchNum,matchSaleDate,
    parseScore,isFinishedResult,resultStatusLabel,
    normalizeResultRecord,evaluateDraft,summarizeDay,formatReviewScanRow,
    SPF_LABELS,HHAD_LABELS
  };
});
