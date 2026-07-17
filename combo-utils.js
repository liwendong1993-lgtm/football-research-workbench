(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root) root.ComboUtils=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  function parseScorePicks(value){
    const seen=new Set();
    return String(value||'').split(/[、,，/\s]+/).map(x=>x.trim()).filter(x=>x&&!seen.has(x)&&seen.add(x));
  }

  function crsKeyForScore(score){
    const special={'胜其他':'s1sh','平其他':'s1sd','负其他':'s1sa'};
    if(special[score]) return special[score];
    const m=String(score||'').match(/^(\d+):(\d+)$/);
    if(!m) return '';
    return `s${m[1].padStart(2,'0')}s${m[2].padStart(2,'0')}`;
  }

  function splitOptionValue(value){
    const text=String(value||''),index=text.indexOf(':');
    return index<0?[text,'']:[text.slice(0,index),text.slice(index+1)];
  }

  function normalizeComboItems(items){
    const normalizeOption=o=>{const next={...o};if(next.market==='hhad'&&next.goalLine==null){const m=String(next.label||'').match(/^([+-]?\d+(?:\.\d+)?)/);next.goalLine=m?Number(m[1]):0}return next};
    const groups=[];const byId=new Map();
    (items||[]).forEach(item=>{
      if(Array.isArray(item.options)){
        const next={...item,options:item.options.map(normalizeOption)};groups.push(next);byId.set(item.matchId,next);return;
      }
      let group=byId.get(item.matchId);
      if(!group){group={matchId:item.matchId,num:item.num,home:item.home,away:item.away,options:[]};byId.set(item.matchId,group);groups.push(group)}
      group.options.push(normalizeOption({market:item.market,pick:item.pick,label:item.label,odd:Number(item.odd)||0}));
    });
    return groups;
  }

  function optionWins(option,homeGoals,awayGoals){
    if(!(Number(option.odd)>0)) return false;
    const result=homeGoals>awayGoals?'h':homeGoals===awayGoals?'d':'a';
    if(option.market==='spf') return option.pick===result;
    if(option.market==='hhad'){
      const adjusted=homeGoals+(Number(option.goalLine)||0),handicapResult=adjusted>awayGoals?'h':adjusted===awayGoals?'d':'a';
      return option.pick===handicapResult;
    }
    if(option.market==='goals') return option.pick==='7+'?homeGoals+awayGoals>=7:String(homeGoals+awayGoals)===String(option.pick);
    if(option.market==='scores'){
      if(/^\d+:\d+$/.test(option.pick)) return option.pick===`${homeGoals}:${awayGoals}`;
      const standardHome=new Set(['1:0','2:0','2:1','3:0','3:1','3:2','4:0','4:1','4:2','5:0','5:1','5:2']);
      const standardDraw=new Set(['0:0','1:1','2:2','3:3']);
      const standardAway=new Set(['0:1','0:2','1:2','0:3','1:3','2:3','0:4','1:4','2:4','0:5','1:5','2:5']);
      const score=`${homeGoals}:${awayGoals}`;
      return (option.pick==='胜其他'&&result==='h'&&!standardHome.has(score))||(option.pick==='平其他'&&result==='d'&&!standardDraw.has(score))||(option.pick==='负其他'&&result==='a'&&!standardAway.has(score));
    }
    return false;
  }

  function legWinningSums(item){
    const options=(item?.options||[]).filter(o=>Number(o.odd)>0),exactMax=options.filter(o=>o.market==='scores'&&/^\d+:\d+$/.test(o.pick)).flatMap(o=>o.pick.split(':').map(Number));
    const maxScore=Math.max(10,...exactMax);
    const sums=new Set();
    for(let h=0;h<=maxScore;h++)for(let a=0;a<=maxScore;a++){
      const sum=options.filter(o=>optionWins(o,h,a)).reduce((n,o)=>n+Number(o.odd),0);
      if(sum>0)sums.add(Math.round(sum*1000000)/1000000);
    }
    return [...sums];
  }

  function schemePrizeRange(items,stake=2){
    const groups=normalizeComboItems(items).filter(x=>x.options.length),metrics=comboMetrics(groups);
    if(!groups.length)return {tickets:0,cost:0,minPrize:0,maxPrize:0,complete:false};
    const ranges=groups.map(legWinningSums);
    const possible=ranges.every(x=>x.length>0);
    const roundMoney=n=>Math.round(n*100)/100;
    const minPrize=possible?roundMoney(Number(stake)*ranges.reduce((n,x)=>n*Math.min(...x),1)):0;
    const maxPrize=possible?roundMoney(Number(stake)*ranges.reduce((n,x)=>n*Math.max(...x),1)):0;
    return {tickets:metrics.tickets,cost:roundMoney(metrics.tickets*Number(stake)),minPrize,maxPrize,complete:metrics.complete&&possible};
  }

  function comboMetrics(items){
    const groups=normalizeComboItems(items).filter(x=>x.options.length);
    if(!groups.length) return {legs:0,tickets:0,minOdd:0,maxOdd:0,complete:false};
    let tickets=1,minOdd=1,maxOdd=1,complete=true;
    groups.forEach(group=>{
      tickets*=group.options.length;
      const odds=group.options.map(o=>Number(o.odd)).filter(n=>n>0);
      if(odds.length!==group.options.length) complete=false;
      if(odds.length){minOdd*=Math.min(...odds);maxOdd*=Math.max(...odds)}else{minOdd=0;maxOdd=0}
    });
    return {legs:groups.length,tickets,minOdd,maxOdd,complete};
  }

  return {parseScorePicks,crsKeyForScore,splitOptionValue,normalizeComboItems,comboMetrics,schemePrizeRange};
});
