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
    const groups=[];const byId=new Map();
    (items||[]).forEach(item=>{
      if(Array.isArray(item.options)){
        const next={...item,options:item.options.map(o=>({...o}))};groups.push(next);byId.set(item.matchId,next);return;
      }
      let group=byId.get(item.matchId);
      if(!group){group={matchId:item.matchId,num:item.num,home:item.home,away:item.away,options:[]};byId.set(item.matchId,group);groups.push(group)}
      group.options.push({market:item.market,pick:item.pick,label:item.label,odd:Number(item.odd)||0});
    });
    return groups;
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

  return {parseScorePicks,crsKeyForScore,splitOptionValue,normalizeComboItems,comboMetrics};
});
