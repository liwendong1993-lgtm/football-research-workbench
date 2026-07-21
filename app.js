const API_HOST='https://webapi.sporttery.cn/gateway/uniform/football';
const MATCH_LIST_URL=`${API_HOST}/getMatchListV1.qry?clientCode=3001`;
const FIXED_BONUS_URL=`${API_HOST}/getFixedBonusV1.qry?clientCode=3001&matchId=`;
const LEGACY_CALC_URL=`${API_HOST}/getMatchCalculatorV1.qry?channel=c&poolCode=`;
const RESULT_URL=`${API_HOST}/getUniformMatchResultV1.qry`;
const STORE_KEY='football-workbench-v1';
const {parseScorePicks,crsKeyForScore,crsOddLookup,scoreOddsLabel,splitOptionValue,normalizeComboItems,enforceSingleMarketPerMatch,optionWins,comboMetrics,schemePrizeRange,passTypeLabel}=ComboUtils;
const {formatScanRow}=ScanUtils;
const {recentDateKeys,normalizeResultRecord,evaluateDraft,summarizeDay,formatReviewScanRow,resultStatusLabel,parseScore}=ReviewUtils;
const DEFAULT_STATE={matches:[],drafts:{},combos:{},reports:[],activeDate:'',settings:{author:'足球研究员',disclaimer:'仅代表个人足球研究观点，请理性看待比赛，不提供投注、代购或跟单服务。'},lastSync:'',lastResultSync:''};
let state=loadState();
let activeFilter='all';
let editingId=null;
let posterMode='detail';
let posterReviewDate='';

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
function deepClone(value){return typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value))}

function loadState(){try{return {...deepClone(DEFAULT_STATE),...JSON.parse(localStorage.getItem(STORE_KEY)||'{}')}}catch{return deepClone(DEFAULT_STATE)}}
function saveState(){localStorage.setItem(STORE_KEY,JSON.stringify(state))}
function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),2200)}
function weekday(date){return ['周日','周一','周二','周三','周四','周五','周六'][new Date(date+'T12:00:00').getDay()]}
function fmtDate(date){const [,m,d]=date.split('-');return `${Number(m)}月${Number(d)}日`}
function draftFor(id){return state.drafts[id]||{spf:[],hhad:[],goals:[],scores:'',confidence:'',note:''}}
function isEdited(d){return d.spf.length||d.hhad.length||d.goals.length||d.scores||d.confidence||d.note}
function pickLabel(market,pick){const maps={spf:{h:'胜',d:'平',a:'负'},hhad:{h:'让胜',d:'让平',a:'让负'}};return maps[market]?.[pick]||pick}
function marketLabel(market){return {spf:'胜平负',hhad:'让球胜平负',goals:'总进球',scores:'比分'}[market]||'玩法'}
function itemMarketLabel(item){return [...new Set((item?.options||[]).map(o=>marketLabel(o.market)))].join('＋')}
function oddFor(match,market,pick){const pool=market==='spf'?'had':market,v=match?.[pool]?.[pick];return v&&v!=='--'?Number(v):0}
function selectedMatches(){return state.matches.filter(m=>m.businessDate===state.activeDate&&isEdited(draftFor(m.id)))}

function applyResultToMatch(match,result){
  if(!match||!result) return match;
  match.score=result.score||match.score||'';
  match.halfScore=result.halfScore||match.halfScore||'';
  match.sectionsNo999=result.sectionsNo999||match.sectionsNo999||match.score||'';
  match.sectionsNo1=result.sectionsNo1||match.sectionsNo1||match.halfScore||'';
  match.matchResultStatus=result.matchResultStatus||match.matchResultStatus||'';
  match.winFlag=result.winFlag||match.winFlag||'';
  match.poolStatus=result.poolStatus||match.poolStatus||'';
  if(result.goalLine){
    match.hhad=match.hhad||{};
    if(!match.hhad.goalLine) match.hhad.goalLine=result.goalLine;
    match.goalLine=match.goalLine||result.goalLine;
  }
  if(!match.matchDate&&result.matchDate) match.matchDate=result.matchDate;
  if(!match.businessDate) match.businessDate=result.businessDate||result.matchDate||match.matchDate||'';
  return match;
}
function matchDayKey(match){return match?.businessDate||match?.matchDate||''}
function reviewDateKeys(){return recentDateKeys(3)}
function matchesForReviewDate(date){
  const map=new Map();
  state.matches.forEach(m=>{
    const days=new Set([m.businessDate,m.matchDate].filter(Boolean));
    if(days.has(date)) map.set(m.id,m);
  });
  return [...map.values()].sort((a,b)=>{
    const ta=`${a.matchDate||''} ${a.time||''}`,tb=`${b.matchDate||''} ${b.time||''}`;
    return ta.localeCompare(tb)||String(a.num||'').localeCompare(String(b.num||''));
  });
}
function preserveMatchMeta(previous=[],nextList=[]){
  const prevMap=new Map(previous.map(m=>[m.id,m]));
  const merged=nextList.map(match=>{
    const prev=prevMap.get(match.id);
    if(!prev) return match;
    const next={...match};
    ['score','halfScore','sectionsNo999','sectionsNo1','matchResultStatus','winFlag','poolStatus','goalLine'].forEach(key=>{
      if(prev[key]!=null&&prev[key]!=='') next[key]=prev[key];
    });
    if(prev.hhad?.goalLine&&!next.hhad?.goalLine){
      next.hhad={...(next.hhad||{}),goalLine:prev.hhad.goalLine};
    }
    return next;
  });
  const keepDays=new Set(reviewDateKeys());
  previous.forEach(prev=>{
    if(merged.some(m=>m.id===prev.id)) return;
    if(prev.manual||prev.score||prev.sectionsNo999||keepDays.has(prev.businessDate)||keepDays.has(prev.matchDate)){
      merged.push(prev);
    }
  });
  return merged;
}
async function fetchMatchResults(){
  const dates=reviewDateKeys();
  const begin=dates[0],end=dates[dates.length-1];
  let pageNo=1,pages=1,records=[];
  while(pageNo<=pages&&pageNo<=5){
    const url=`${RESULT_URL}?matchBeginDate=${begin}&matchEndDate=${end}&leagueId=&pageSize=100&pageNo=${pageNo}&isFix=0&matchPage=1&pcOrWap=1`;
    const json=await fetchJsonWithFallback(url);
    if(!json?.success) throw new Error(json?.errorMessage||'赛果接口返回失败');
    const value=json.value||{};
    pages=Math.max(1,Number(value.pages)||1);
    records=records.concat(value.matchResult||[]);
    pageNo+=1;
  }
  const normalized=records.map(normalizeResultRecord).filter(r=>r.matchId);
  const byId=new Map(state.matches.map(m=>[m.id,m]));
  normalized.forEach(result=>{
    const existing=byId.get(result.matchId);
    if(existing){
      applyResultToMatch(existing,result);
    }else{
      const created={
        id:result.matchId,
        businessDate:result.businessDate||result.matchDate,
        matchDate:result.matchDate||result.businessDate,
        time:'',
        num:result.num||'',
        league:result.league||'足球',
        home:result.home||'',
        away:result.away||'',
        had:{},hhad:{goalLine:result.goalLine||''},ttg:{},crs:{},
        manual:false,fromResult:true
      };
      applyResultToMatch(created,result);
      state.matches.push(created);
      byId.set(created.id,created);
    }
  });
  state.lastResultSync=new Date().toISOString();
  return normalized.length;
}
function pickOddsFields(source={}){
  const out={};
  for(const key of ['h','d','a']){
    const value=source[key];
    if(value!=null&&value!==''&&value!=='--') out[key]=String(value);
  }
  if(source.goalLine!=null&&source.goalLine!=='') out.goalLine=String(source.goalLine).replace(/\.00$/,'');
  return out;
}
function oddsFromList(oddsList=[]){
  const byCode=new Map((oddsList||[]).map(item=>[String(item.poolCode||'').toUpperCase(),item]));
  return {
    had:pickOddsFields(byCode.get('HAD')||{}),
    hhad:pickOddsFields(byCode.get('HHAD')||{}),
    ttg:{},
    crs:{}
  };
}
function latestBonusItem(list){
  return Array.isArray(list)&&list.length?list[list.length-1]:null;
}
function normalizeBonusPool(item,keys){
  if(!item) return {};
  const out={};
  keys.forEach(key=>{
    const value=item[key];
    if(value!=null&&value!==''&&value!=='--'&&Number(value)>0) out[key]=String(value);
  });
  if(item.goalLine!=null&&item.goalLine!=='') out.goalLine=String(item.goalLine).replace(/\.00$/,'');
  return out;
}
function normalizeCrsPool(item){
  if(!item) return {};
  const out={};
  Object.keys(item).forEach(key=>{
    if(key==='goalLine'||key.endsWith('f')||key==='updateDate'||key==='updateTime') return;
    const value=item[key];
    if(value!=null&&value!==''&&value!=='--'&&Number(value)>0) out[key]=String(value);
  });
  // Keep both official s-1s* and legacy s1s* aliases for 胜其他/平其他/负其他.
  [['s-1sh','s1sh'],['s-1sd','s1sd'],['s-1sa','s1sa']].forEach(([a,b])=>{
    if(out[a]&&!out[b]) out[b]=out[a];
    if(out[b]&&!out[a]) out[a]=out[b];
  });
  return out;
}
function mergeOdds(base,bonus){
  const next={
    had:{...(base.had||{})},
    hhad:{...(base.hhad||{})},
    ttg:{...(base.ttg||{})},
    crs:{...(base.crs||{})}
  };
  if(bonus?.had&&Object.keys(bonus.had).length) next.had={...next.had,...bonus.had};
  if(bonus?.hhad&&Object.keys(bonus.hhad).length) next.hhad={...next.hhad,...bonus.hhad};
  if(bonus?.ttg&&Object.keys(bonus.ttg).length) next.ttg={...next.ttg,...bonus.ttg};
  if(bonus?.crs&&Object.keys(bonus.crs).length) next.crs={...next.crs,...bonus.crs};
  return next;
}
async function fetchJson(url,timeoutMs=12000){
  const controller=typeof AbortController==='function'?new AbortController():null;
  const timer=controller?setTimeout(()=>controller.abort(),timeoutMs):null;
  try{
    const res=await fetch(url,{cache:'no-store',signal:controller?.signal});
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }finally{
    if(timer) clearTimeout(timer);
  }
}
async function fetchJsonWithFallback(url){
  try{
    return await fetchJson(url,10000);
  }catch(error){
    // Some WebViews/WAFs block the result endpoint directly; try a public CORS mirror as last resort.
    const proxies=[
      `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
      `https://corsproxy.io/?${encodeURIComponent(url)}`
    ];
    let lastError=error;
    for(const proxyUrl of proxies){
      try{
        return await fetchJson(proxyUrl,8000);
      }catch(proxyError){
        lastError=proxyError;
      }
    }
    throw lastError;
  }
}
async function mapPool(items,limit,worker){
  const results=new Array(items.length);let cursor=0;
  async function run(){
    while(cursor<items.length){
      const index=cursor++;
      results[index]=await worker(items[index],index);
    }
  }
  await Promise.all(Array.from({length:Math.min(limit,items.length||1)},()=>run()));
  return results;
}
function mapLegacyMatch(m,goalMap,scoreMap){
  return {
    id:String(m.matchId),businessDate:m.businessDate,matchDate:m.matchDate,time:(m.matchTime||'').slice(0,5),
    num:m.matchNumStr||`${m.matchWeek||''}${String(m.matchNum||'').slice(-3)}`,league:m.leagueAbbName||m.leagueAllName,
    home:m.homeTeamAbbName||m.homeTeamAllName,away:m.awayTeamAbbName||m.awayTeamAllName,
    homeRank:m.homeRank||'',awayRank:m.awayRank||'',status:m.matchStatus,
    had:pickOddsFields(m.had||{}),hhad:pickOddsFields(m.hhad||{}),
    ttg:goalMap.get(String(m.matchId))?.ttg||{},crs:normalizeCrsPool(scoreMap.get(String(m.matchId))?.crs||{}),manual:false
  };
}
async function fetchLegacyCalculatorMatches(){
  const loadPool=async pool=>{
    const json=await fetchJson(LEGACY_CALC_URL+pool);
    if(!json?.success) throw new Error(json?.errorMessage||`${pool} 接口返回失败`);
    return json;
  };
  const json=await loadPool('hhad,had');
  const stopMessage=json?.value?.vtoolsConfig?.onLineStopMessage||json?.value?.vtoolsConfig?.offLineStopMessage||'';
  const groups=json?.value?.matchInfoList;
  if(!Array.isArray(groups)||!groups.length){
    const err=new Error(stopMessage||'竞彩计算器暂无比赛');
    err.code='CALCULATOR_EMPTY';
    throw err;
  }
  const [goalsJson,scoresJson]=await Promise.all([loadPool('ttg').catch(()=>null),loadPool('crs').catch(()=>null)]);
  const poolMap=data=>new Map((data?.value?.matchInfoList||[]).flatMap(g=>g.subMatchList||[]).map(m=>[String(m.matchId),m]));
  const goalMap=poolMap(goalsJson),scoreMap=poolMap(scoresJson);
  return groups.flatMap(g=>g.subMatchList||[]).map(m=>mapLegacyMatch(m,goalMap,scoreMap));
}
async function fetchMatchListMatches(){
  const json=await fetchJson(MATCH_LIST_URL);
  if(!json?.success) throw new Error(json?.errorMessage||'比赛列表接口返回失败');
  const groups=json?.value?.matchInfoList;
  if(!Array.isArray(groups)) throw new Error('比赛列表格式异常');
  const baseList=groups.flatMap(g=>g.subMatchList||[]).map(m=>{
    const odds=oddsFromList(m.oddsList||[]);
    return {
      id:String(m.matchId),businessDate:m.businessDate,matchDate:m.matchDate||m.businessDate,time:(m.matchTime||'').slice(0,5),
      num:m.matchNumStr||`${m.matchWeek||''}${String(m.matchNum||'').slice(-3)}`,league:m.leagueAbbName||m.leagueAllName,
      home:m.homeTeamAbbName||m.homeTeamAllName,away:m.awayTeamAbbName||m.awayTeamAllName,
      homeRank:m.homeRank||'',awayRank:m.awayRank||'',status:m.matchStatus,
      had:odds.had,hhad:odds.hhad,ttg:odds.ttg,crs:odds.crs,manual:false
    };
  });
  // Enrich with fixed-bonus detail (goals/score odds) when available. Failures are ignored per match.
  const bonusList=await mapPool(baseList,6,async match=>{
    try{
      const bonusJson=await fetchJson(FIXED_BONUS_URL+match.id);
      const history=bonusJson?.value?.oddsHistory;
      const value=bonusJson?.value||{};
      if(!bonusJson?.success) return null;
      const scoreInfo=normalizeResultRecord({
        matchId:match.id,
        matchDate:match.matchDate,
        businessDate:match.businessDate,
        matchNumStr:match.num,
        homeTeam:match.home,
        awayTeam:match.away,
        leagueNameAbbr:match.league,
        sectionsNo999:value.sectionsNo999,
        sectionsNo1:value.sectionsNo1,
        matchResultStatus:value.sectionsNo999? '2':'',
        goalLine:latestBonusItem(history?.hhadList)?.goalLine,
        winFlag:(value.matchResultList||[]).find(x=>String(x.code||'').toUpperCase()==='HAD')?.combination||''
      });
      return {
        had:normalizeBonusPool(latestBonusItem(history?.hadList),['h','d','a']),
        hhad:normalizeBonusPool(latestBonusItem(history?.hhadList),['h','d','a']),
        ttg:normalizeBonusPool(latestBonusItem(history?.ttgList),['s0','s1','s2','s3','s4','s5','s6','s7']),
        crs:normalizeCrsPool(latestBonusItem(history?.crsList)),
        result:scoreInfo.score?scoreInfo:null,
        matchResultList:value.matchResultList||[]
      };
    }catch(error){
      console.warn('固定奖金读取失败',match.id,error);
      return null;
    }
  });
  return baseList.map((match,index)=>{
    const bonus=bonusList[index];
    if(!bonus) return match;
    const merged=mergeOdds(match,bonus);
    const next={...match,...merged};
    if(bonus.result) applyResultToMatch(next,bonus.result);
    if(bonus.matchResultList?.length) next.matchResultList=bonus.matchResultList;
    return next;
  });
}
async function fetchMatches(show=true){
  if(show) $('#dataStatus').textContent='正在读取比赛...';
  try{
    let list=[],source='list';
    try{
      list=await fetchMatchListMatches();
    }catch(listError){
      console.warn('比赛列表同步失败，尝试计算器接口',listError);
      list=await fetchLegacyCalculatorMatches();
      source='calculator';
    }
    const previous=state.matches.slice();
    state.matches=preserveMatchMeta(previous,list);
    state.lastSync=new Date().toISOString();saveState();
    const withOdds=list.filter(m=>m.had?.h||m.hhad?.h||m.ttg?.s0||Object.keys(m.crs||{}).length).length;
    if(!list.length){
      $('#dataStatus').textContent='暂无在售比赛';
      if(show) toast('当前没有在售竞彩足球，可手动添加');
    }else{
      $('#dataStatus').textContent=`${list.length}场已同步`;
      if(show) toast(withOdds?`已同步 ${list.length} 场（${withOdds} 场含赔率）`:`已同步 ${list.length} 场比赛`);
    }
    const dates=[...new Set(state.matches.map(m=>m.businessDate||m.matchDate).filter(Boolean))].sort();
    if(!state.activeDate||!dates.includes(state.activeDate)) state.activeDate=dates.find(d=>reviewDateKeys().includes(d))||dates[dates.length-1]||new Date().toISOString().slice(0,10);
    renderAll();
    // Pull results after first paint so score refresh never blocks match list.
    try{
      const resultCount=await fetchMatchResults();
      if(resultCount){
        saveState();
        $('#dataStatus').textContent=`${list.length||state.matches.length}场·赛果${resultCount}`;
        renderAll();
      }
    }catch(resultError){
      console.warn('赛果同步失败',resultError);
    }
  }catch(err){
    const localCount=state.matches.filter(m=>!m.manual).length;
    $('#dataStatus').textContent=localCount?'本地缓存':'同步失败';
    toast(localCount?'读取失败，已保留本地数据':'读取失败，请稍后重试或手动添加');
    console.error(err);renderAll();
  }
}

function renderAll(){renderDates();renderMatches();renderCombos();renderReview();renderSettings();}
function renderDates(){
  const dates=[...new Set(state.matches.map(m=>m.businessDate).filter(Boolean))].sort();
  $('#dateStrip').innerHTML=dates.length?dates.map(d=>`<button class="date-pill ${d===state.activeDate?'active':''}" data-date="${d}">${weekday(d)} · ${fmtDate(d)}</button>`).join(''):'<span class="section-note">暂无在线比赛，可手动添加</span>';
  $('#heroTitle').textContent=state.activeDate?`${weekday(state.activeDate)} · ${fmtDate(state.activeDate)}`:'今日比赛';
}
function renderMatches(){
  const all=state.matches.filter(m=>m.businessDate===state.activeDate);let list=all;
  if(activeFilter==='edited') list=list.filter(m=>isEdited(draftFor(m.id)));
  if(activeFilter==='primary') list=list.filter(m=>draftFor(m.id).confidence==='主推');
  const edited=all.filter(m=>isEdited(draftFor(m.id))).length;
  $('#editedCount').textContent=edited;$('#totalCount').textContent=all.length;
  $('#matchList').innerHTML=list.length?list.map(matchCard).join(''):`<div class="empty">${activeFilter==='all'?'暂时没有比赛<br>可点击“手动添加”录入':'没有符合筛选条件的比赛'}</div>`;
  $$('.match-card').forEach(el=>el.addEventListener('click',()=>openEdit(el.dataset.id)));
}
function matchCard(m){
  const d=draftFor(m.id),summary=[],hit=evaluateDraft(m,d,optionWins);
  if(d.spf.length) summary.push(...d.spf.map(x=>({text:pickLabel('spf',x),hit:hit.detail.spf.some(i=>i.pick===x&&i.hit)})));
  if(d.hhad.length) summary.push({text:`${m.hhad?.goalLine||'让球'} ${d.hhad.map(x=>pickLabel('hhad',x)).join('/')}`,hit:hit.detail.hhad.some(i=>i.hit)});
  if(d.goals.length) summary.push(...d.goals.map(x=>({text:`进球${x}`,hit:hit.detail.goals.some(i=>i.pick===x&&i.hit)})));
  if(d.scores) summary.push(...parseScorePicks(d.scores).map(x=>({text:`比分${x}`,hit:hit.detail.scores.some(i=>i.pick===x&&i.hit)})));
  if(d.confidence) summary.unshift({text:d.confidence,hit:false});
  const scoreText=m.score||m.sectionsNo999||'';
  return `<article class="match-card ${isEdited(d)?'edited':''} ${d.confidence==='主推'?'primary-card':''} ${hit.anyHit?'hit-card':''}" data-id="${m.id}">
    <div class="match-line"><span class="league">${esc(m.league)}</span><span class="match-no">${esc(m.num)}</span><strong class="compact-team" title="${esc(m.home)}">${esc(m.home)}</strong><span class="vs">${scoreText?esc(scoreText):'VS'}</span><strong class="compact-team" title="${esc(m.away)}">${esc(m.away)}</strong><span class="match-time">${esc((m.matchDate||'').slice(5))} ${esc(m.time)}</span></div>
    <div class="match-detail-line"><div class="odds-inline"><span>胜 <b>${m.had?.h||'--'}</b></span><span>平 <b>${m.had?.d||'--'}</b></span><span>负 <b>${m.had?.a||'--'}</b></span></div><div class="pick-summary">${summary.length?summary.map((x,i)=>`<span class="tag ${x.hit?'hit':''} ${i===0&&d.confidence==='主推'?'primary':''} ${d.confidence==='风险'?'risk':''}">${esc(x.text)}</span>`).join(''):'<span class="tag">点选研究</span>'}</div></div>
  </article>`;
}

function toggleArr(arr,val){return arr.includes(val)?arr.filter(x=>x!==val):[...arr,val]}
function scoreOddMeta(match,score){const category=scoreOddsLabel(score),key=crsKeyForScore(score),odd=crsOddLookup(match?.crs,score);return {category,key,odd}}
function scorePickHtml(match,score,hit=false){const meta=scoreOddMeta(match,score),binding=meta.category?`<small>自动绑定 ${esc(meta.category)}</small>`:'<small>固定比分</small>';return `<div class="score-pick-item ${hit?'hit':''}"><div><strong>${esc(score)}</strong>${binding}</div><span class="score-odd">赔率 ${meta.odd?meta.odd.toFixed(2):'--'}</span><button type="button" data-remove-score="${esc(score)}" aria-label="删除比分">×</button></div>`}
function pickButtons(market,items,selected,hitSet){return items.map(([v,label,odd])=>`<button type="button" class="pick-btn ${selected.includes(v)?'selected':''} ${hitSet?.has(`${market}:${v}`)?'hit':''}" data-market="${market}" data-value="${v}">${label}${odd?`<em>${odd}</em>`:''}</button>`).join('')}
function openEdit(id){
  editingId=id;const m=state.matches.find(x=>x.id===id),d=deepClone(draftFor(id)),scorePoolKeys=new Set();let scorePicks=parseScorePicks(d.scores).filter(score=>{const key=crsKeyForScore(score);if(scorePoolKeys.has(key))return false;scorePoolKeys.add(key);return true});
  const hit=evaluateDraft(m,d,optionWins),hitSet=new Set(hit.hitKeys);
  const scoreText=m.score||m.sectionsNo999||'';
  const statusText=resultStatusLabel(m);
  $('#editContent').innerHTML=`<div class="sheet-handle"></div><div class="dialog-head"><div><p class="eyebrow">${esc(m.league)} · ${esc(m.num)}</p><h2>${esc(m.home)} vs ${esc(m.away)}</h2><p class="dialog-score-badge">${scoreText?`<b>${esc(scoreText)}</b>`:'暂无比分'} · ${esc(statusText)}${hit.finished&&hit.anyHit?' · 有命中':''}</p><p id="draftAutoSaveStatus" class="autosave-status" aria-live="polite">点选后自动保存</p></div><button value="cancel">×</button></div>
  <div class="pick-group"><h4>胜平负</h4><div class="pick-grid">${pickButtons('spf',[['h','胜',m.had?.h],['d','平',m.had?.d],['a','负',m.had?.a]],d.spf,hitSet)}</div></div>
  <div class="pick-group"><h4>让球胜平负 <span class="match-no">${esc(m.hhad?.goalLine||'')}</span></h4><div class="pick-grid">${pickButtons('hhad',[['h','让胜',m.hhad?.h],['d','让平',m.hhad?.d],['a','让负',m.hhad?.a]],d.hhad,hitSet)}</div></div>
  <div class="pick-group"><h4>进球数</h4><div class="pick-grid goals">${pickButtons('goals',['0','1','2','3','4','5','6','7+'].map(x=>[x,x,m.ttg?.[`s${x==='7+'?'7':x}`]]),d.goals,hitSet)}</div></div>
  <div class="pick-group score-group"><h4>比分</h4><p class="section-note">输入主队和客队进球数，冒号固定；可添加多个比分。完赛后命中项会标红。</p><div class="score-builder"><input id="scoreHomeInput" type="number" inputmode="numeric" min="0" max="99" placeholder="主"><span>:</span><input id="scoreAwayInput" type="number" inputmode="numeric" min="0" max="99" placeholder="客"><button type="button" id="addScoreBtn">添加</button></div><div id="scorePicksList" class="score-picks-list"></div></div>
  <div class="pick-group"><h4>信心标签</h4><div class="confidence-grid">${['主推','次选','冷门','风险','放弃'].map(x=>`<button type="button" class="pick-btn ${d.confidence===x?'selected':''}" data-confidence="${x}">${x}</button>`).join('')}</div></div>
  <label>分析理由<textarea class="field-input" id="noteInput" rows="4" placeholder="记录信息、赔率变化和判断理由">${esc(d.note)}</textarea></label>`;
  const dlg=$('#editDialog');dlg.showModal();let noteSaveTimer;
  function currentHitSet(){return new Set(evaluateDraft(m,{...d,scores:scorePicks.join('、')},optionWins).hitKeys)}
  function refreshHitStyles(){
    const set=currentHitSet();
    $$('#editContent .pick-btn[data-market]').forEach(btn=>btn.classList.toggle('hit',set.has(`${btn.dataset.market}:${btn.dataset.value}`)));
  }
  function persistDraft(){d.scores=scorePicks.join('、');const note=$('#noteInput');if(note)d.note=note.value.trim();state.drafts[id]=deepClone(d);const status=$('#draftAutoSaveStatus');try{saveState();if(status){status.textContent=`已自动保存 ${new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}`;status.className='autosave-status success'}refreshHitStyles()}catch(error){console.error('自动保存本场研究失败',error);if(status){status.textContent='自动保存失败，请勿关闭并截图反馈';status.className='autosave-status error'}}}
  const renderScorePicks=()=>{
    const set=currentHitSet();
    $('#scorePicksList').innerHTML=scorePicks.length?scorePicks.map(score=>{
      const key=crsKeyForScore(score);
      const hit=set.has(`scores:${score}`)||[...set].some(k=>k.startsWith('scores:')&&crsKeyForScore(k.slice(7))===key);
      return scorePickHtml(m,score,hit);
    }).join(''):'<div class="score-empty">尚未添加比分</div>';
  };
  const addScore=()=>{const home=$('#scoreHomeInput').value,away=$('#scoreAwayInput').value;if(!/^\d+$/.test(home)||!/^\d+$/.test(away)){toast('请填写主队和客队进球数');return}const score=`${Number(home)}:${Number(away)}`,samePool=scorePicks.find(x=>crsKeyForScore(x)===crsKeyForScore(score));if(samePool){toast(samePool===score?'这个比分已经添加':`已添加同一赔率项：${scoreOddsLabel(score)}`);return}scorePicks.push(score);$('#scoreHomeInput').value='';$('#scoreAwayInput').value='';renderScorePicks();persistDraft();$('#scoreHomeInput').focus()};
  renderScorePicks();$('#addScoreBtn').onclick=addScore;$('#scorePicksList').onclick=e=>{const btn=e.target.closest('[data-remove-score]');if(btn){scorePicks=scorePicks.filter(x=>x!==btn.dataset.removeScore);renderScorePicks();persistDraft()}};[$('#scoreHomeInput'),$('#scoreAwayInput')].forEach(input=>input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();addScore()}});
  $$('#editContent .pick-btn[data-market]').forEach(btn=>btn.onclick=()=>{d[btn.dataset.market]=toggleArr(d[btn.dataset.market],btn.dataset.value);btn.classList.toggle('selected');persistDraft();renderScorePicks()});
  $$('#editContent [data-confidence]').forEach(btn=>btn.onclick=()=>{d.confidence=d.confidence===btn.dataset.confidence?'':btn.dataset.confidence;$$('#editContent [data-confidence]').forEach(b=>b.classList.toggle('selected',b.dataset.confidence===d.confidence));persistDraft()});
  $('#noteInput').oninput=()=>{clearTimeout(noteSaveTimer);const status=$('#draftAutoSaveStatus');status.textContent='正在自动保存…';noteSaveTimer=setTimeout(persistDraft,500)};
  dlg.onclose=()=>{clearTimeout(noteSaveTimer);persistDraft();renderAll()};
}

function availableOptions(m,d){
  const opts=[];
  d.spf.forEach(p=>opts.push({market:'spf',pick:p,label:`${pickLabel('spf',p)} ${m.had?.[p]||'--'}`,odd:oddFor(m,'had',p)}));
  d.hhad.forEach(p=>opts.push({market:'hhad',pick:p,goalLine:Number(m.hhad?.goalLine)||0,label:`${m.hhad?.goalLine||'让球'} ${pickLabel('hhad',p)} ${m.hhad?.[p]||'--'}`,odd:oddFor(m,'hhad',p)}));
  d.goals.forEach(p=>{const key=`s${p==='7+'?'7':p}`,odd=Number(m.ttg?.[key])||0;opts.push({market:'goals',pick:p,label:`进球${p} ${odd||'--'}`,odd})});
  const scoreKeys=new Set();parseScorePicks(d.scores).forEach(p=>{const key=crsKeyForScore(p);if(scoreKeys.has(key))return;scoreKeys.add(key);const odd=crsOddLookup(m.crs,p),category=scoreOddsLabel(p);opts.push({market:'scores',pick:p,label:`比分${p}${category?`（${category}）`:''} ${odd||'--'}`,odd})});
  return opts;
}
function optionText(label){return String(label||'').replace(/\s+(?:\d+(?:\.\d+)?|--)$/,'')}
function normalizeMultiple(value){return Math.max(1,Math.min(99999,Math.floor(Number(value)||1)))}
function renderCombos(){
  const list=state.combos[state.activeDate]||[];
  $('#comboList').innerHTML=list.length?list.map(c=>{const items=enforceSingleMarketPerMatch(c.items),metrics=comboMetrics(items),prize=schemePrizeRange(items,2,c.multiple),range=metrics.minOdd===metrics.maxOdd?metrics.minOdd.toFixed(2):`${metrics.minOdd.toFixed(2)}–${metrics.maxOdd.toFixed(2)}`;return `<article class="combo-card" data-combo-card="${c.id}"><h3>${esc(c.name)}</h3><p class="combo-meta">${metrics.legs}场 · ${passTypeLabel(metrics.legs)} · ${prize.tickets}注 · 每注2元 · 创建于 ${esc(c.time||'')}</p><div class="combo-items">${items.map(x=>`<div class="combo-item"><span>${esc(x.num)} ${esc(x.home)}</span><span class="combo-selection"><em>${esc(itemMarketLabel(x))}</em>${x.options.map(o=>`<b class="tag">${esc(optionText(o.label))}</b>`).join('')}</span></div>`).join('')}</div><div class="combo-stake-row"><label class="multiple-field">倍投 <input type="number" inputmode="numeric" min="1" max="99999" value="${prize.multiple}" data-combo-multiple="${c.id}"> 倍</label><div class="combo-cost"><span>方案投注金额</span><strong data-combo-cost>¥${prize.cost.toFixed(2)}</strong></div></div><div class="prize-grid"><div><span>理论最低总返奖</span><strong data-combo-min-prize>¥${prize.minPrize.toFixed(2)}</strong></div><div><span>理论最高总返奖</span><strong data-combo-max-prize>¥${prize.maxPrize.toFixed(2)}</strong></div></div><p class="combo-calc-note">金额与理论返奖已按 ${prize.multiple} 倍计算。</p><div class="combo-odds-small">${metrics.complete?`单票参考赔率 ${range}`:'部分选项暂无赔率'}</div><div class="combo-actions"><button class="primary" data-poster-combo="${c.id}">生成方案图</button><button class="secondary" data-edit-combo="${c.id}">编辑</button><button class="secondary" data-delete-combo="${c.id}">删除</button></div></article>`}).join(''):'<div class="empty">还没有组合方案<br>先编辑比赛，再创建方案</div>';
  $$('[data-combo-multiple]').forEach(input=>{const combo=list.find(c=>c.id===input.dataset.comboMultiple),card=input.closest('[data-combo-card]');if(!combo||!card)return;const showPrize=(multiple,message='',type='')=>{const items=enforceSingleMarketPerMatch(combo.items),prize=schemePrizeRange(items,2,multiple),note=card.querySelector('.combo-calc-note');card.querySelector('[data-combo-cost]').textContent=`¥${prize.cost.toFixed(2)}`;card.querySelector('[data-combo-min-prize]').textContent=`¥${prize.minPrize.toFixed(2)}`;card.querySelector('[data-combo-max-prize]').textContent=`¥${prize.maxPrize.toFixed(2)}`;note.textContent=message||`金额与理论返奖已按 ${prize.multiple} 倍计算。`;note.className=`combo-calc-note ${type}`};const apply=()=>{if(input.value==='')return;const previousMultiple=normalizeMultiple(combo.multiple),nextMultiple=normalizeMultiple(input.value);combo.multiple=nextMultiple;try{saveState()}catch(error){console.error('保存方案倍数失败',error);combo.multiple=previousMultiple;input.value=previousMultiple;showPrize(previousMultiple,'倍数保存失败，已恢复原值。','error');return}showPrize(nextMultiple)};input.oninput=apply;input.onblur=()=>{input.value=normalizeMultiple(input.value);apply()}});
  $$('[data-poster-combo]').forEach(b=>b.onclick=()=>{const combo=list.find(c=>c.id===b.dataset.posterCombo);showSingleComboPoster(combo)});
  $$('[data-edit-combo]').forEach(b=>b.onclick=()=>openCombo(b.dataset.editCombo));
  $$('[data-delete-combo]').forEach(b=>b.onclick=()=>{state.combos[state.activeDate]=list.filter(c=>c.id!==b.dataset.deleteCombo);saveState();renderCombos()});
}
function openCombo(id){
  const matches=selectedMatches().filter(m=>availableOptions(m,draftFor(m.id)).length);
  if(!matches.length){toast('请先编辑至少一场比赛选择');return}
  const existing=(state.combos[state.activeDate]||[]).find(c=>c.id===id),existingItems=enforceSingleMarketPerMatch(existing?.items||[]);
  const selected=new Map(existingItems.map(x=>[x.matchId,new Set(x.options.map(o=>`${o.market}:${o.pick}`))]));
  $('#comboContent').innerHTML=`<div class="sheet-handle"></div><div class="dialog-head"><div><p class="eyebrow">PLAN BUILDER</p><h2>${existing?'编辑':'新建'}组合方案</h2></div><button value="cancel">×</button></div><div class="combo-basic-fields"><label>方案名称<input id="comboName" class="field-input" value="${esc(existing?.name||'稳健方案')}" /></label><label>投注倍数<input id="comboMultiple" class="field-input" type="number" inputmode="numeric" min="1" max="99999" value="${normalizeMultiple(existing?.multiple)}" /></label></div><div class="pick-group"><h4>每场选择玩法</h4><p class="section-note">胜平负与让球胜平负可以同时选择；进球数或比分为独立玩法，改选后会自动替换。</p>${matches.map(m=>{const opts=availableOptions(m,draftFor(m.id)),set=selected.get(m.id)||new Set(),markets=['spf','hhad','goals','scores'];return `<div class="combo-match-select" data-match="${m.id}"><div class="combo-match-title">${esc(m.num)} ${esc(m.home)} vs ${esc(m.away)}</div>${markets.map(market=>{const marketOpts=opts.filter(o=>o.market===market);if(!marketOpts.length)return '';return `<div class="combo-market-group" data-market-group="${market}"><div class="combo-market-title">${esc(marketLabel(market))}</div><div class="combo-option-grid">${marketOpts.map(o=>`<label class="combo-option-label"><input type="checkbox" class="combo-option" data-id="${m.id}" data-market="${o.market}" data-value="${o.market}:${o.pick}" ${set.has(`${o.market}:${o.pick}`)?'checked':''}><span>${esc(o.label)}</span></label>`).join('')}</div></div>`}).join('')}</div>`}).join('')}</div><p id="comboSaveStatus" class="dialog-status" aria-live="polite"></p><button type="button" id="saveCombo" class="primary full">保存组合方案</button>`;
  const dlg=$('#comboDialog');dlg.showModal();
  const refreshMarketState=box=>box.querySelectorAll('.combo-market-group').forEach(group=>group.classList.toggle('selected',Boolean(group.querySelector('.combo-option:checked'))));
  $$('.combo-match-select').forEach(refreshMarketState);
  $('#comboContent').onchange=e=>{const input=e.target.closest('.combo-option');if(!input||!input.checked)return;const box=input.closest('.combo-match-select'),family=market=>market==='spf'||market==='hhad'?'result':market;box.querySelectorAll('.combo-option:checked').forEach(other=>{if(family(other.dataset.market)!==family(input.dataset.market))other.checked=false});refreshMarketState(box)};
  const saveCombo=$('#saveCombo'),setComboStatus=(message,type='')=>{const status=$('#comboSaveStatus');status.textContent=message;status.className=`dialog-status ${type}`};
  saveCombo.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();saveCombo.disabled=true;setComboStatus('正在保存…');try{const raw=[];$$('#comboContent .combo-match-select').forEach(box=>{const m=matches.find(match=>match.id===box.dataset.match),checked=[...box.querySelectorAll('.combo-option:checked')];if(!m||!checked.length)return;const opts=availableOptions(m,draftFor(m.id)),options=checked.map(ch=>{const [market,pick]=splitOptionValue(ch.dataset.value);return opts.find(o=>o.market===market&&o.pick===pick)}).filter(Boolean);if(options.length)raw.push({matchId:m.id,num:m.num,home:m.home,away:m.away,options})});const items=enforceSingleMarketPerMatch(raw);if(!items.length){setComboStatus('请至少选择一场比赛的一个选项','error');return}const all=state.combos[state.activeDate]||[],combo={id:existing?.id||uid(),name:$('#comboName').value.trim()||'未命名方案',multiple:normalizeMultiple($('#comboMultiple').value),items,time:new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})};state.combos[state.activeDate]=existing?all.map(c=>c.id===existing.id?combo:c):[...all,combo];saveState();setComboStatus('组合方案已保存','success');renderCombos();try{dlg.close()}catch(closeError){console.warn('组合弹窗关闭失败',closeError);dlg.removeAttribute('open')}toast('组合方案已保存')}catch(error){console.error('保存组合方案失败',error);setComboStatus(`保存失败：${error?.message||'浏览器存储异常，请截图反馈'}`,'error')}finally{saveCombo.disabled=false}});
}

function openManual(){
  $('#manualContent').innerHTML=`<div class="sheet-handle"></div><div class="dialog-head"><div><p class="eyebrow">MANUAL MATCH</p><h2>手动添加比赛</h2></div><button value="cancel">×</button></div>
  <label>日期<input id="manualDate" type="date" class="field-input" value="${state.activeDate||new Date().toISOString().slice(0,10)}"></label><label>比赛编号<input id="manualNum" class="field-input" placeholder="周五201"></label><label>联赛<input id="manualLeague" class="field-input" placeholder="英超"></label><label>主队<input id="manualHome" class="field-input"></label><label>客队<input id="manualAway" class="field-input"></label><label>开赛时间<input id="manualTime" type="time" class="field-input"></label><button type="button" id="saveManual" class="primary full">添加比赛</button>`;
  const dlg=$('#manualDialog');dlg.showModal();$('#saveManual').onclick=()=>{const date=$('#manualDate').value,home=$('#manualHome').value.trim(),away=$('#manualAway').value.trim();if(!date||!home||!away){toast('请填写日期和对阵双方');return}state.matches.push({id:'manual-'+uid(),businessDate:date,matchDate:date,time:$('#manualTime').value,num:$('#manualNum').value.trim()||'自定义',league:$('#manualLeague').value.trim()||'足球',home,away,had:{},hhad:{},manual:true});state.activeDate=date;saveState();dlg.close();renderAll();toast('比赛已添加')};
}

function saveReport(){
  // Legacy hook kept for old backups; 复盘页已改为自动对照最近3天研究。
  toast('复盘页会自动对照最近3天研究，无需手动保存历史');
}
function renderReview(){
  const root=$('#reviewList');
  if(!root) return;
  const dates=reviewDateKeys().slice().reverse();
  root.innerHTML=dates.map(date=>{
    const matches=matchesForReviewDate(date);
    const summary=summarizeDay(matches,state.drafts,optionWins);
    const cards=matches.length?matches.map(m=>{
      const d=draftFor(m.id),hit=evaluateDraft(m,d,optionWins);
      const tags=[];
      if(d.spf.length) d.spf.forEach(p=>tags.push({text:pickLabel('spf',p),hit:hit.detail.spf.some(x=>x.pick===p&&x.hit)}));
      if(d.hhad.length) tags.push({text:`${m.hhad?.goalLine||m.goalLine||'让球'} ${d.hhad.map(p=>pickLabel('hhad',p)).join('/')}`,hit:hit.detail.hhad.some(x=>x.hit)});
      if(d.goals.length) d.goals.forEach(p=>tags.push({text:`进球${p}`,hit:hit.detail.goals.some(x=>x.pick===p&&x.hit)}));
      if(d.scores) parseScorePicks(d.scores).forEach(p=>tags.push({text:p,hit:hit.detail.scores.some(x=>x.pick===p&&x.hit)}));
      if(d.confidence) tags.unshift({text:d.confidence,hit:false});
      const score=m.score||m.sectionsNo999||'—';
      return `<article class="review-match-card ${hit.anyHit?'hit-card':''}" data-review-match="${m.id}">
        <div class="review-match-top"><span class="league">${esc(m.league||'')}</span><span class="match-no">${esc(m.num||'')}</span><span class="teams">${esc(m.home)} vs ${esc(m.away)}</span><span class="review-score">${esc(score)}</span></div>
        <div class="review-match-bottom"><span class="review-status">${esc(resultStatusLabel(m))}${hit.finished&&hit.anyHit?' · 命中':''}</span><div class="pick-summary">${tags.length?tags.map(t=>`<span class="tag ${t.hit?'hit':''}">${esc(t.text)}</span>`).join(''):'<span class="tag">未研究</span>'}</div></div>
      </article>`;
    }).join(''):'<div class="review-empty">这一天暂无比赛或赛果</div>';
    return `<section class="review-day-card" data-review-date="${date}">
      <div class="review-day-head">
        <div>
          <h3>${weekday(date)} · ${fmtDate(date)}</h3>
          <p class="review-day-meta">${summary.total}场 · 完赛${summary.finished} · 研究${summary.researched} · 命中${summary.hitMatches}${summary.allFinished?' · 已全部完赛':''}</p>
        </div>
        <button type="button" class="primary small" data-review-poster="${date}">生成复盘图</button>
      </div>
      <div class="review-match-list">${cards}</div>
    </section>`;
  }).join('');
  $$('[data-review-match]').forEach(el=>el.onclick=()=>openEdit(el.dataset.reviewMatch));
  $$('[data-review-poster]').forEach(btn=>btn.onclick=()=>showReviewPoster(btn.dataset.reviewPoster));
}
function renderHistory(){renderReview()}

function wrapText(ctx,text,maxWidth){const chars=[...String(text)],lines=[];let line='';for(const c of chars){if(ctx.measureText(line+c).width>maxWidth&&line){lines.push(line);line=c}else line+=c}if(line)lines.push(line);return lines}
function posterPrefix(){return posterMode==='scan'?'全部扫盘':posterMode==='review'?'复盘对照':posterMode==='combo'?'单条方案':'足球研究'}
function posterFilename(){return `${posterPrefix()}-${posterMode==='review'?(posterReviewDate||state.activeDate):state.activeDate}.png`}
function canvasToBlob(){const canvas=$('#posterCanvas');return new Promise((resolve,reject)=>{if(typeof canvas.toBlob==='function')canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('图片转换失败')),'image/png');else try{const data=atob(canvas.toDataURL('image/png').split(',')[1]),bytes=new Uint8Array(data.length);for(let i=0;i<data.length;i++)bytes[i]=data.charCodeAt(i);resolve(new Blob([bytes],{type:'image/png'}))}catch(error){reject(error)}})}
function refreshPosterPreview(){const canvas=$('#posterCanvas'),image=$('#posterImage'),status=$('#posterSaveStatus');canvas.hidden=false;image.hidden=true;image.onload=()=>{image.hidden=false;canvas.hidden=true};image.onerror=()=>{image.removeAttribute('src');image.hidden=true;canvas.hidden=false;status.textContent='夸克未能加载图片预览，已自动回退显示海报；请使用下方保存按钮。';status.className='poster-save-status error'};try{image.src=canvas.toDataURL('image/png')}catch(error){console.error('生成图片预览失败',error);image.onerror()}}
function showPosterDialog(title){$('#posterDialog .modal-head h3').textContent=title;$('#posterSaveStatus').textContent='安卓夸克用户可直接长按上方图片保存，或使用下方系统分享。';$('#posterSaveStatus').className='poster-save-status';$('#posterDialog').hidden=false;document.body.style.overflow='hidden';refreshPosterPreview()}
function closePosterDialog(){$('#posterDialog').hidden=true;document.body.style.overflow=''}
function drawFitText(ctx,text,x,y,maxWidth,startSize=24,minSize=14,weight=700){let size=startSize;do{ctx.font=`${weight} ${size}px sans-serif`;if(ctx.measureText(String(text)).width<=maxWidth)break;size-=1}while(size>minSize);ctx.fillText(String(text),x,y)}
function comboPosterGroups(item,match){
  const order=['spf','hhad','goals','scores'];
  return order.filter(market=>item.options.some(o=>o.market===market)).map(market=>{
    const selected=new Set(item.options.filter(o=>o.market===market).map(o=>o.pick));
    const options=(market==='spf'||market==='hhad')?['h','d','a'].map(p=>({label:pickLabel('spf',p),odd:oddFor(match,market,p),selected:selected.has(p)})):item.options.filter(o=>o.market===market).map(o=>({label:optionText(o.label),odd:Number(o.odd)||0,selected:true}));
    const cols=(market==='spf'||market==='hhad')?3:Math.min(4,Math.max(1,options.length));
    return {market,options,cols,lines:Math.ceil(options.length/cols),lineLabel:market==='spf'?'0':market==='hhad'?String(item.options.find(o=>o.market==='hhad')?.goalLine??match.hhad?.goalLine??0):market==='goals'?'球':'比分'};
  });
}
function drawSingleComboPoster(combo){
  const items=enforceSingleMarketPerMatch(combo?.items||[]);if(!items.length){toast('方案没有可生成的比赛');return false}
  const prize=schemePrizeRange(items,2,combo?.multiple),metrics=comboMetrics(items),rows=items.map(item=>{const match=state.matches.find(m=>m.id===item.matchId)||{},groups=comboPosterGroups(item,match);return {item,match,groups,height:120+groups.reduce((n,g)=>n+g.lines*72,0)}});
  const canvas=$('#posterCanvas'),ctx=canvas.getContext('2d'),width=1080,height=430+rows.reduce((n,r)=>n+r.height,0)+190;canvas.width=width;canvas.height=height;
  const head=ctx.createLinearGradient(0,0,width,260);head.addColorStop(0,'#b90f1c');head.addColorStop(1,'#e62b32');ctx.fillStyle='#f6f7f9';ctx.fillRect(0,0,width,height);ctx.fillStyle=head;ctx.fillRect(0,0,width,260);
  ctx.save();ctx.globalAlpha=.13;ctx.strokeStyle='#fff';ctx.lineWidth=4;for(const [x,y,r] of [[60,220,95],[880,65,125],[980,235,70]]){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke()}ctx.restore();
  ctx.fillStyle='#fff';ctx.font='800 30px sans-serif';ctx.fillText(state.settings.author||'足球研究员',48,58);ctx.font='900 58px sans-serif';drawFitText(ctx,combo.name||'单条方案',48,142,800,58,34,900);ctx.font='26px sans-serif';ctx.fillStyle='rgba(255,255,255,.88)';ctx.fillText(`${fmtDate(state.activeDate)} · 方案生成 ${new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}`,50,194);
  ctx.fillStyle='#fff';ctx.fillRect(0,260,width,170);ctx.fillStyle='#188dbd';ctx.font='900 32px sans-serif';ctx.fillText('竞彩足球组合方案',48,312);ctx.fillStyle='#30343b';ctx.font='700 29px sans-serif';ctx.fillText(`${metrics.legs}场 · ${passTypeLabel(metrics.legs)} · ${prize.tickets}注 · ${prize.multiple}倍`,48,365);ctx.fillStyle='#777';ctx.font='24px sans-serif';ctx.fillText(`每注2元  投注金额`,48,407);ctx.fillStyle='#cf1421';ctx.font='900 36px sans-serif';ctx.fillText(`¥${prize.cost.toFixed(2)}`,205,408);ctx.textAlign='right';ctx.fillStyle='#777';ctx.font='24px sans-serif';ctx.fillText('理论总返奖',1032,340);ctx.fillStyle='#cf1421';ctx.font='900 38px sans-serif';ctx.fillText(prize.complete?`¥${prize.minPrize.toFixed(2)}–¥${prize.maxPrize.toFixed(2)}`:'赔率不完整',1032,393);ctx.textAlign='left';
  let y=430;rows.forEach(({item,match,groups,height:rowH})=>{ctx.fillStyle='#fff';ctx.fillRect(0,y,width,rowH-3);ctx.strokeStyle='#e5e7eb';ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(width,y);ctx.stroke();ctx.fillStyle='#3192bd';roundRect(ctx,38,y+28,132,52,7);ctx.fillStyle='#fff';ctx.font='900 30px sans-serif';ctx.textAlign='center';ctx.fillText(String(item.num||'').replace(/\D/g,'').slice(-3)||item.num,104,y+64);ctx.fillStyle='#7b818a';ctx.font='22px sans-serif';ctx.fillText(match.league||'足球',104,y+108);ctx.textAlign='left';ctx.fillStyle='#25282d';ctx.font='800 31px sans-serif';drawFitText(ctx,`${item.home}  VS  ${item.away}`,210,y+48,815,31,20,800);ctx.fillStyle='#8a9098';ctx.font='22px sans-serif';ctx.fillText(`${match.time||''}  ·  ${itemMarketLabel(item)}`,210,y+82);let groupY=y+100;groups.forEach(group=>{const gap=8,totalW=755,boxW=(totalW-gap*(group.cols-1))/group.cols,badgeColor=group.market==='spf'?'#cfd2d5':group.market==='hhad'?(Number(group.lineLabel)>0?'#70c978':'#ef8a8d'):'#3192bd';ctx.fillStyle=badgeColor;ctx.beginPath();ctx.roundRect(210,groupY,58,58,29);ctx.fill();ctx.fillStyle='#fff';ctx.font='900 19px sans-serif';ctx.textAlign='center';drawFitText(ctx,group.lineLabel,239,groupY+37,48,19,12,900);group.options.forEach((o,i)=>{const row=Math.floor(i/group.cols),col=i%group.cols,x=278+col*(boxW+gap),oy=groupY+row*72;ctx.fillStyle=o.selected?'#d80e19':'#f7f7f7';ctx.strokeStyle=o.selected?'#d80e19':'#d8dadd';ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(x,oy,boxW,58,5);ctx.fill();ctx.stroke();ctx.fillStyle=o.selected?'#fff':'#42464c';ctx.font='800 24px sans-serif';const odd=o.odd>0?o.odd.toFixed(2):'--';drawFitText(ctx,`${o.label}  ${odd}`,x+boxW/2,oy+38,boxW-14,24,16,800)});ctx.textAlign='left';groupY+=group.lines*72});y+=rowH});
  ctx.fillStyle='#fff3e8';ctx.fillRect(0,y,width,height-y);ctx.fillStyle='#6f6259';ctx.font='23px sans-serif';wrapText(ctx,state.settings.disclaimer,980).slice(0,3).forEach((line,i)=>ctx.fillText(line,48,y+56+i*34));ctx.fillStyle='#b90f1c';ctx.font='800 22px sans-serif';ctx.fillText('胜平负与让球可同场组合 · 进球数/比分独立 · 请理性研究',48,height-40);return true
}
function showSingleComboPoster(combo){posterMode='combo';if(!drawSingleComboPoster(combo))return;showPosterDialog('单条方案图预览')}
function drawScanPoster(){
  const matches=state.matches.filter(m=>m.businessDate===state.activeDate).sort((a,b)=>(a.time||'').localeCompare(b.time||''));
  if(!matches.length){toast('当前日期没有比赛');return false}
  const rows=matches.map(m=>formatScanRow(m,draftFor(m.id))),edited=rows.filter(r=>r.edited).length;
  const canvas=$('#posterCanvas'),ctx=canvas.getContext('2d'),width=1200,rowH=104,tableY=390,height=tableY+62+rows.length*rowH+240;
  canvas.width=width;canvas.height=height;
  const bg=ctx.createLinearGradient(0,0,0,height);bg.addColorStop(0,'#061528');bg.addColorStop(.32,'#092a36');bg.addColorStop(1,'#053224');ctx.fillStyle=bg;ctx.fillRect(0,0,width,height);
  ctx.save();ctx.globalAlpha=.12;ctx.strokeStyle='#79d8ff';ctx.lineWidth=3;for(let i=-300;i<1500;i+=170){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i+440,350);ctx.stroke()}ctx.beginPath();ctx.arc(930,125,150,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.arc(930,125,86,0,Math.PI*2);ctx.stroke();ctx.restore();
  ctx.fillStyle='#ff6f3d';ctx.font='900 58px sans-serif';ctx.fillText('老花今日',42,88);ctx.fillStyle='#f6c851';ctx.font='700 28px sans-serif';ctx.fillText(`${fmtDate(state.activeDate)} ${weekday(state.activeDate)}`,850,78);
  ctx.fillStyle='#fff';ctx.font='900 78px sans-serif';ctx.fillText('全部扫盘推荐',42,190);ctx.fillStyle='#7ed6ff';ctx.font='800 30px sans-serif';ctx.fillText('综合研究一览',46,242);
  ctx.fillStyle='rgba(255,255,255,.08)';roundRect(ctx,42,278,1116,70,18);ctx.fillStyle='#dce9f6';ctx.font='700 24px sans-serif';ctx.fillText(state.settings.author||'足球研究员',68,322);ctx.textAlign='right';ctx.fillStyle=edited===rows.length?'#67e2ae':'#f6c851';ctx.fillText(`已研究 ${edited} / 共 ${rows.length} 场`,1130,322);ctx.textAlign='left';
  const cols=[{x:42,w:72,l:'编号'},{x:114,w:92,l:'时间'},{x:206,w:100,l:'赛事'},{x:306,w:282,l:'主队 VS 客队'},{x:588,w:120,l:'胜平负'},{x:708,w:160,l:'让球'},{x:868,w:132,l:'总进球'},{x:1000,w:158,l:'比分'}];
  ctx.fillStyle='#081725';ctx.fillRect(30,tableY,1140,62);ctx.strokeStyle='rgba(255,255,255,.12)';ctx.lineWidth=1;cols.forEach(c=>{ctx.fillStyle='#fff';ctx.textAlign='center';drawFitText(ctx,c.l,c.x+c.w/2,tableY+39,c.w-10,25,14,800);ctx.beginPath();ctx.moveTo(c.x+c.w,tableY);ctx.lineTo(c.x+c.w,tableY+62+rows.length*rowH);ctx.stroke()});ctx.textAlign='left';
  rows.forEach((r,i)=>{const y=tableY+62+i*rowH;ctx.fillStyle=i%2?'rgba(6,65,46,.9)':'rgba(5,77,53,.82)';ctx.fillRect(30,y,1140,rowH-2);if(r.confidence==='主推'){ctx.fillStyle='#f6c851';ctx.fillRect(30,y,7,rowH-2)}if(!r.edited){ctx.fillStyle='rgba(5,15,25,.52)';ctx.fillRect(30,y,1140,rowH-2)}const values=[r.num,r.time,r.league,r.teams,r.result,r.handicap,r.goals,r.scores];cols.forEach((c,j)=>{ctx.fillStyle=r.edited?(j===0?'#f6c851':'#f3d6b3'):'#8293a6';ctx.textAlign=j===3?'left':'center';const x=j===3?c.x+12:c.x+c.w/2;drawFitText(ctx,values[j],x,y+61,c.w-(j===3?22:10),j===3?25:23,13,j===0?900:700)});ctx.textAlign='left'});
  const footerY=tableY+62+rows.length*rowH+46;ctx.strokeStyle='rgba(255,255,255,.15)';ctx.beginPath();ctx.moveTo(42,footerY-14);ctx.lineTo(1158,footerY-14);ctx.stroke();ctx.fillStyle='#fff';ctx.font='italic 900 38px sans-serif';ctx.fillText('看赛事 · 做记录 · 理性研究',42,footerY+45);ctx.fillStyle='#9fb8b0';ctx.font='22px sans-serif';wrapText(ctx,state.settings.disclaimer,1080).slice(0,2).forEach((line,i)=>ctx.fillText(line,42,footerY+92+i*30));ctx.fillStyle='#f6c851';ctx.font='700 19px sans-serif';ctx.fillText(`生成时间 ${new Date().toLocaleString('zh-CN')}`,42,height-34);
  return true;
}
function showScanPoster(){posterMode='scan';posterReviewDate='';if(!drawScanPoster())return;showPosterDialog('全部扫盘图预览')}
function drawColoredTokens(ctx,tokens,x,y,maxWidth,align='center'){
  const parts=(tokens&&tokens.length)?tokens:[{text:'—',hit:false}];
  const gap=6;let size=23;
  const widths=()=>parts.map(p=>{ctx.font=`${p.hit?900:700} ${size}px sans-serif`;return ctx.measureText(p.text).width});
  let ws=widths(),total=ws.reduce((n,w)=>n+w,0)+gap*Math.max(0,parts.length-1);
  while(total>maxWidth&&size>13){size-=1;ws=widths();total=ws.reduce((n,w)=>n+w,0)+gap*Math.max(0,parts.length-1)}
  let cursor=align==='left'?x:x-total/2;
  parts.forEach((p,i)=>{ctx.font=`${p.hit?900:700} ${size}px sans-serif`;ctx.fillStyle=p.hit?'#ff4d4f':(p.muted?'#8293a6':'#f3d6b3');ctx.textAlign='left';ctx.fillText(p.text,cursor,y);cursor+=ws[i]+gap});
  ctx.textAlign='left';
}
function drawReviewPoster(date){
  const matches=matchesForReviewDate(date);
  if(!matches.length){toast('这一天没有可复盘的比赛');return false}
  const rows=matches.map(m=>formatReviewScanRow(m,draftFor(m.id),optionWins));
  const summary=summarizeDay(matches,state.drafts,optionWins);
  const canvas=$('#posterCanvas'),ctx=canvas.getContext('2d'),width=1200,rowH=112,tableY=390,height=tableY+62+rows.length*rowH+240;
  canvas.width=width;canvas.height=height;
  const bg=ctx.createLinearGradient(0,0,0,height);bg.addColorStop(0,'#1a0a10');bg.addColorStop(.3,'#2a0f14');bg.addColorStop(1,'#12080c');ctx.fillStyle=bg;ctx.fillRect(0,0,width,height);
  ctx.fillStyle='#ff4d4f';ctx.font='900 58px sans-serif';ctx.fillText('老花复盘',42,88);ctx.fillStyle='#f6c851';ctx.font='700 28px sans-serif';ctx.fillText(`${fmtDate(date)} ${weekday(date)}`,850,78);
  ctx.fillStyle='#fff';ctx.font='900 72px sans-serif';ctx.fillText('赛果对照扫盘',42,190);ctx.fillStyle='#ffb4b4';ctx.font='800 28px sans-serif';ctx.fillText('命中选项红色高亮',46,242);
  ctx.fillStyle='rgba(255,255,255,.08)';roundRect(ctx,42,278,1116,70,18);ctx.fillStyle='#f0d7d7';ctx.font='700 24px sans-serif';ctx.fillText(state.settings.author||'足球研究员',68,322);ctx.textAlign='right';ctx.fillStyle=summary.hitMatches?'#ff7d7d':'#f6c851';ctx.fillText(`命中 ${summary.hitMatches} 场 · 完赛 ${summary.finished}/${summary.total}`,1130,322);ctx.textAlign='left';
  const cols=[{x:42,w:72,l:'编号'},{x:114,w:92,l:'时间'},{x:206,w:88,l:'赛事'},{x:294,w:250,l:'主队 VS 客队'},{x:544,w:86,l:'比分'},{x:630,w:120,l:'胜平负'},{x:750,w:150,l:'让球'},{x:900,w:120,l:'总进球'},{x:1020,w:138,l:'比分项'}];
  ctx.fillStyle='#2a1014';ctx.fillRect(30,tableY,1140,62);ctx.strokeStyle='rgba(255,255,255,.12)';ctx.lineWidth=1;cols.forEach(c=>{ctx.fillStyle='#fff';ctx.textAlign='center';drawFitText(ctx,c.l,c.x+c.w/2,tableY+39,c.w-10,24,14,800);ctx.beginPath();ctx.moveTo(c.x+c.w,tableY);ctx.lineTo(c.x+c.w,tableY+62+rows.length*rowH);ctx.stroke()});ctx.textAlign='left';
  rows.forEach((r,i)=>{
    const y=tableY+62+i*rowH;
    ctx.fillStyle=r.anyHit?'rgba(120,18,28,.92)':(i%2?'rgba(40,14,18,.9)':'rgba(48,16,22,.82)');
    ctx.fillRect(30,y,1140,rowH-2);
    if(r.anyHit){ctx.fillStyle='#ff4d4f';ctx.fillRect(30,y,7,rowH-2)}
    if(!r.edited){ctx.fillStyle='rgba(10,8,10,.45)';ctx.fillRect(30,y,1140,rowH-2)}
    const base=[{text:r.num,hit:false},{text:r.time,hit:false},{text:r.league,hit:false},{text:r.teams,hit:false,left:true},{text:r.score,hit:r.finished&&r.anyHit}];
    base.forEach((item,j)=>{
      const c=cols[j];
      ctx.fillStyle=item.hit?'#ff6b6b':(r.edited?'#f3d6b3':'#8293a6');
      ctx.textAlign=item.left?'left':'center';
      const x=item.left?c.x+12:c.x+c.w/2;
      drawFitText(ctx,item.text,x,y+61,c.w-(item.left?22:10),j===3?24:22,13,j===0||item.hit?900:700);
    });
    const tokenCols=[
      {c:cols[5],tokens:r.edited?(r.spf.length?r.spf:[{text:'—',hit:false}]):[{text:'待研究',hit:false,muted:true}]},
      {c:cols[6],tokens:r.hhad.length?[{text:r.handicapLine||'',hit:false},...r.hhad]:[{text:'—',hit:false}]},
      {c:cols[7],tokens:r.goals.length?r.goals:[{text:'—',hit:false}]},
      {c:cols[8],tokens:r.scores.length?r.scores:[{text:'—',hit:false}]}
    ];
    tokenCols.forEach(({c,tokens})=>{
      const normalized=tokens.map(t=>typeof t==='string'?{text:t,hit:false}:{text:t.text||t.label||'—',hit:!!t.hit,muted:!!t.muted}).filter(t=>t.text!=='');
      drawColoredTokens(ctx,normalized,c.x+c.w/2,y+61,c.w-12,'center');
    });
    ctx.textAlign='left';
  });
  const footerY=tableY+62+rows.length*rowH+46;ctx.strokeStyle='rgba(255,255,255,.15)';ctx.beginPath();ctx.moveTo(42,footerY-14);ctx.lineTo(1158,footerY-14);ctx.stroke();ctx.fillStyle='#fff';ctx.font='italic 900 36px sans-serif';ctx.fillText('复盘对照 · 命中标红 · 理性研究',42,footerY+45);ctx.fillStyle='#c7a0a0';ctx.font='22px sans-serif';wrapText(ctx,state.settings.disclaimer,1080).slice(0,2).forEach((line,i)=>ctx.fillText(line,42,footerY+92+i*30));ctx.fillStyle='#f6c851';ctx.font='700 19px sans-serif';ctx.fillText(`生成时间 ${new Date().toLocaleString('zh-CN')}`,42,height-34);
  return true;
}
function showReviewPoster(date){posterMode='review';posterReviewDate=date;if(!drawReviewPoster(date))return;showPosterDialog(`${fmtDate(date)} 复盘图预览`)}
function drawPoster(report){
  posterMode='detail';$('#posterDialog .modal-head h3').textContent='详细研究长图预览';
  const date=report?.date||state.activeDate,matches=report?.matches||selectedMatches(),drafts=report?.drafts||state.drafts,combos=report?.combos||state.combos[date]||[];
  const rows=matches.map(m=>{const d=drafts[m.id]||draftFor(m.id);let parts=[];if(d.spf?.length)parts.push(`胜平负 ${d.spf.map(x=>pickLabel('spf',x)).join('/')}`);if(d.hhad?.length)parts.push(`${m.hhad?.goalLine||'让球'} ${d.hhad.map(x=>pickLabel('hhad',x)).join('/')}`);if(d.goals?.length)parts.push(`进球 ${d.goals.join('/')}`);if(d.scores)parts.push(`比分 ${d.scores}`);return {m,d,parts}});
  const height=480+rows.reduce((n,r)=>n+180+(r.d.note?70:0),0)+combos.length*200+180;
  const canvas=$('#posterCanvas'),ctx=canvas.getContext('2d');canvas.width=1080;canvas.height=height;
  const grad=ctx.createLinearGradient(0,0,1080,height);grad.addColorStop(0,'#091523');grad.addColorStop(1,'#102b45');ctx.fillStyle=grad;ctx.fillRect(0,0,1080,height);
  ctx.fillStyle='#f6c851';ctx.fillRect(64,60,72,8);ctx.font='700 28px sans-serif';ctx.fillText('FOOTBALL RESEARCH',64,120);ctx.fillStyle='#ffffff';ctx.font='900 66px sans-serif';ctx.fillText(state.settings.author||'足球研究员',64,205);ctx.fillStyle='#9fb1c7';ctx.font='34px sans-serif';ctx.fillText(`${date}  ${weekday(date)}足球研究`,64,265);
  let y=345;rows.forEach(({m,d,parts},idx)=>{ctx.fillStyle='rgba(255,255,255,.06)';roundRect(ctx,48,y-40,984,140+(d.note?70:0),24);ctx.fillStyle=d.confidence==='主推'?'#f6c851':'#6faeff';ctx.font='800 27px sans-serif';ctx.fillText(`${m.num} · ${m.league}${d.confidence?` · ${d.confidence}`:''}`,76,y);ctx.fillStyle='#fff';ctx.font='900 35px sans-serif';ctx.fillText(`${m.home}  VS  ${m.away}`,76,y+50);ctx.fillStyle='#c4d1e1';ctx.font='28px sans-serif';ctx.fillText(parts.join('　')||'已记录分析',76,y+94);if(d.note){ctx.fillStyle='#8fa1b8';ctx.font='24px sans-serif';const lines=wrapText(ctx,d.note,900).slice(0,2);lines.forEach((line,i)=>ctx.fillText(line,76,y+137+i*31))}y+=180+(d.note?70:0)});
  if(combos.length){ctx.fillStyle='#f6c851';ctx.font='900 34px sans-serif';ctx.fillText('今日组合',64,y+10);y+=65;combos.forEach(c=>{const items=enforceSingleMarketPerMatch(c.items),prize=schemePrizeRange(items,2,c.multiple),selection=items.map(x=>`${x.num}[${itemMarketLabel(x)}：${x.options.map(o=>optionText(o.label)).join('/')}]`).join(' × ');ctx.fillStyle='rgba(246,200,81,.10)';roundRect(ctx,48,y-35,984,165,20);ctx.fillStyle='#fff';ctx.font='800 29px sans-serif';ctx.fillText(c.name,72,y+5);ctx.fillStyle='#c4d1e1';ctx.font='24px sans-serif';wrapText(ctx,selection,880).slice(0,2).forEach((line,i)=>ctx.fillText(line,72,y+43+i*29));ctx.fillStyle='#f6c851';ctx.font='700 22px sans-serif';ctx.fillText(`${prize.tickets}注 · ${prize.multiple}倍 · 每注2元 · 投注金额 ¥${prize.cost.toFixed(2)}`,72,y+91);ctx.fillStyle='#fff';ctx.fillText(`理论总返奖 ¥${prize.minPrize.toFixed(2)}–¥${prize.maxPrize.toFixed(2)}`,72,y+121);y+=200})}
  ctx.strokeStyle='rgba(255,255,255,.15)';ctx.beginPath();ctx.moveTo(64,height-155);ctx.lineTo(1016,height-155);ctx.stroke();ctx.fillStyle='#9fb1c7';ctx.font='23px sans-serif';wrapText(ctx,state.settings.disclaimer,940).slice(0,2).forEach((line,i)=>ctx.fillText(line,64,height-105+i*32));ctx.fillStyle='#f6c851';ctx.font='700 20px sans-serif';ctx.fillText(`生成时间 ${new Date().toLocaleString('zh-CN')}`,64,height-36);
}
function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill()}
function showPoster(){if(!selectedMatches().length){toast('请先编辑比赛');return}drawPoster();showPosterDialog('详细研究长图预览')}
async function downloadPoster(){const button=$('#downloadPosterBtn'),status=$('#posterSaveStatus');button.disabled=true;button.textContent='正在生成PNG…';try{const blob=await canvasToBlob(),filename=posterFilename();if(typeof File==='function'&&navigator.share&&navigator.canShare){const file=new File([blob],filename,{type:'image/png'});let canShare=false;try{canShare=navigator.canShare({files:[file]})}catch(error){console.warn('文件分享能力检测失败',error)}if(canShare){try{await navigator.share({files:[file],title:posterPrefix()});status.textContent='已打开系统分享面板，可保存到相册或发送给朋友。';status.className='poster-save-status success';return}catch(error){if(error?.name==='AbortError'){status.textContent='已取消分享，仍可长按上方图片保存。';return}console.warn('系统分享失败，改用下载方式',error)}}}const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.rel='noopener';a.style.display='none';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);status.textContent='已发起PNG下载；如果夸克没有弹出下载，请点击“打开大图 / 长按保存”。';status.className='poster-save-status success'}catch(error){console.error('保存PNG失败',error);status.textContent=`保存失败：${error?.message||'请使用长按图片保存'}`;status.className='poster-save-status error'}finally{button.disabled=false;button.textContent='保存或分享PNG'}}
async function openPosterImage(){const status=$('#posterSaveStatus'),popup=window.open('about:blank','_blank');try{const blob=await canvasToBlob(),url=URL.createObjectURL(blob);if(popup){popup.document.open();popup.document.write(`<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(posterPrefix())}</title><style>body{margin:0;background:#111;color:#fff;font-family:sans-serif;text-align:center}p{padding:12px;margin:0}img{display:block;width:100%;height:auto;-webkit-touch-callout:default}</style><p>请长按下方图片，选择“保存图片”</p><img src="${url}" alt="${esc(posterPrefix())}">`);popup.document.close();status.textContent='已打开大图，请在新页面长按图片保存。';status.className='poster-save-status success'}else{$('#posterImage').scrollIntoView({behavior:'smooth',block:'center'});status.textContent='夸克拦截了新页面，请直接长按上方图片，选择“保存图片”。';status.className='poster-save-status error'}}catch(error){if(popup)popup.close();console.error('打开大图失败',error);status.textContent='打开失败，请直接长按上方图片保存。';status.className='poster-save-status error'}}

function renderSettings(){$('#authorInput').value=state.settings.author||'';$('#disclaimerInput').value=state.settings.disclaimer||''}
function exportData(){const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`足球研究工作台备份-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href);toast('备份已导出')}
async function importData(file){try{const data=JSON.parse(await file.text());if(!data||!Array.isArray(data.matches))throw new Error('格式不正确');state={...deepClone(DEFAULT_STATE),...data};saveState();renderAll();toast('备份导入成功')}catch{toast('导入失败：文件格式不正确')}}

function bind(){
  $('#refreshBtn').onclick=()=>fetchMatches();$('#manualAddBtn').onclick=openManual;$('#addComboBtn').onclick=()=>openCombo();$('#scanPosterBtn').onclick=showScanPoster;$('#posterBtn').onclick=showPoster;$('#closePosterBtn').onclick=closePosterDialog;$('[data-close-poster]').onclick=closePosterDialog;$('#downloadPosterBtn').onclick=downloadPoster;$('#openPosterBtn').onclick=openPosterImage;
  $('#dateStrip').onclick=e=>{const b=e.target.closest('[data-date]');if(b){state.activeDate=b.dataset.date;saveState();renderAll()}};
  $('#filterBar').onclick=e=>{const b=e.target.closest('[data-filter]');if(b){activeFilter=b.dataset.filter;$$('#filterBar button').forEach(x=>x.classList.toggle('active',x===b));renderMatches()}};
  $$('.bottom-nav button').forEach(b=>b.onclick=()=>{$$('.bottom-nav button').forEach(x=>x.classList.toggle('active',x===b));$$('.page').forEach(p=>p.classList.toggle('active',p.id===b.dataset.page));if(b.dataset.page==='plansPage')renderCombos();if(b.dataset.page==='reviewPage')renderReview()});
  $('#saveSettingsBtn').onclick=()=>{state.settings.author=$('#authorInput').value.trim()||'足球研究员';state.settings.disclaimer=$('#disclaimerInput').value.trim();saveState();toast('设置已保存')};
  $('#exportBtn').onclick=exportData;$('#importInput').onchange=e=>e.target.files[0]&&importData(e.target.files[0]);$('#clearBtn').onclick=()=>{if(confirm('确定清空本机的全部比赛、方案和复盘数据吗？')){state=deepClone(DEFAULT_STATE);saveState();renderAll();toast('本机数据已清空')}};
}

bind();renderAll();fetchMatches(false);
if('serviceWorker' in navigator&&location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js?v=20260721-review1',{updateViaCache:'none'}).then(registration=>registration.update()).catch(console.error);
