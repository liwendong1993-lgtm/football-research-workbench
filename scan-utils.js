(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ScanUtils=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const labels={spf:{h:'胜',d:'平',a:'负'},hhad:{h:'让胜',d:'让平',a:'让负'}};
  const splitScores=value=>String(value||'').split(/[、,，/\s]+/).map(x=>x.trim()).filter(Boolean);
  function formatScanRow(match,draft){
    const d=draft||{},spf=d.spf||[],hhad=d.hhad||[],goals=d.goals||[],scores=splitScores(d.scores);
    const edited=Boolean(spf.length||hhad.length||goals.length||scores.length||d.confidence||d.note);
    return {
      num:String(match?.num||'').replace(/\D/g,'').slice(-3)||'—',
      time:match?.time||'—',league:match?.league||'—',teams:`${match?.home||'—'} VS ${match?.away||'—'}`,
      result:edited?(spf.length?spf.map(x=>labels.spf[x]||x).join('/'):'—'):'待研究',
      handicap:hhad.length?`${match?.hhad?.goalLine||''} ${hhad.map(x=>labels.hhad[x]||x).join('/')}`.trim():'—',
      goals:goals.length?goals.map(x=>`${x}球`).join('/'):'—',scores:scores.length?scores.join('/'):'—',
      confidence:d.confidence||'',edited
    };
  }
  return {formatScanRow};
});
