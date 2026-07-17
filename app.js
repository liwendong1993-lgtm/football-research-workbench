const API_BASE='https://webapi.sporttery.cn/gateway/uniform/football/getMatchCalculatorV1.qry?channel=c&poolCode=';
const STORE_KEY='football-workbench-v1';
const {parseScorePicks,crsKeyForScore,splitOptionValue,normalizeComboItems,comboMetrics,schemePrizeRange}=ComboUtils;
const DEFAULT_STATE={matches:[],drafts:{},combos:{},reports:[],activeDate:'',settings:{author:'足球研究员',disclaimer:'仅代表个人足球研究观点，请理性看待比赛，不提供投注、代购或跟单服务。'},lastSync:''};
let state=loadState();
let activeFilter='all';
let editingId=null;

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);

function loadState(){try{return {...structuredClone(DEFAULT_STATE),...JSON.parse(localStorage.getItem(STORE_KEY)||'{}')}}catch{return structuredClone(DEFAULT_STATE)}}
function saveState(){localStorage.setItem(STORE_KEY,JSON.stringify(state))}
function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),2200)}
function weekday(date){return ['周日','周一','周二','周三','周四','周五','周六'][new Date(date+'T12:00:00').getDay()]}
function fmtDate(date){const [,m,d]=date.split('-');return `${Number(m)}月${Number(d)}日`}
function draftFor(id){return state.drafts[id]||{spf:[],hhad:[],goals:[],scores:'',confidence:'',note:''}}
function isEdited(d){return d.spf.length||d.hhad.length||d.goals.length||d.scores||d.confidence||d.note}
function pickLabel(market,pick){const maps={spf:{h:'胜',d:'平',a:'负'},hhad:{h:'让胜',d:'让平',a:'让负'}};return maps[market]?.[pick]||pick}
function oddFor(match,market,pick){const v=match?.[market]?.[pick];return v&&v!=='--'?Number(v):0}
function selectedMatches(){return state.matches.filter(m=>m.businessDate===state.activeDate&&isEdited(draftFor(m.id)))}

async function fetchMatches(show=true){
  if(show) $('#dataStatus').textContent='正在读取比赛...';
  try{
    const loadPool=async pool=>{const r=await fetch(API_BASE+pool,{cache:'no-store'});if(!r.ok)throw new Error(`${pool} HTTP ${r.status}`);return r.json()};
    const res=await fetch(API_BASE+'hhad,had',{cache:'no-store'}); if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const json=await res.json(); if(!json.success) throw new Error(json.errorMessage||'接口返回失败');
    const [goalsJson,scoresJson]=await Promise.all([loadPool('ttg').catch(()=>null),loadPool('crs').catch(()=>null)]);
    const poolMap=data=>new Map((data?.value?.matchInfoList||[]).flatMap(g=>g.subMatchList).map(m=>[String(m.matchId),m]));
    const goalMap=poolMap(goalsJson),scoreMap=poolMap(scoresJson);
    const list=json.value.matchInfoList.flatMap(g=>g.subMatchList).map(m=>({
      id:String(m.matchId),businessDate:m.businessDate,matchDate:m.matchDate,time:(m.matchTime||'').slice(0,5),
      num:m.matchNumStr||`${m.matchWeek||''}${String(m.matchNum||'').slice(-3)}`,league:m.leagueAbbName||m.leagueAllName,
      home:m.homeTeamAbbName||m.homeTeamAllName,away:m.awayTeamAbbName||m.awayTeamAllName,
      homeRank:m.homeRank||'',awayRank:m.awayRank||'',status:m.matchStatus,had:m.had||{},hhad:m.hhad||{},
      ttg:goalMap.get(String(m.matchId))?.ttg||{},crs:scoreMap.get(String(m.matchId))?.crs||{},manual:false
    }));
    const manual=state.matches.filter(m=>m.manual);
    state.matches=[...list,...manual.filter(x=>!list.some(m=>m.id===x.id))];
    const dates=[...new Set(state.matches.map(m=>m.businessDate))].sort();
    if(!state.activeDate||!dates.includes(state.activeDate)) state.activeDate=dates[0]||new Date().toISOString().slice(0,10);
    state.lastSync=new Date().toISOString();saveState();
    $('#dataStatus').textContent=`已同步 ${list.length} 场比赛`;
    renderAll();
  }catch(err){
    $('#dataStatus').textContent='在线数据读取失败，可手动添加';
    toast('读取失败，已保留本地数据');
    console.error(err);renderAll();
  }
}

function renderAll(){renderDates();renderMatches();renderCombos();renderHistory();renderSettings();}
function renderDates(){
  const dates=[...new Set(state.matches.map(m=>m.businessDate))].sort();
  $('#dateStrip').innerHTML=dates.length?dates.map(d=>`<button class="date-pill ${d===state.activeDate?'active':''}" data-date="${d}">${weekday(d)} · ${fmtDate(d)}</button>`).join(''):'<span class="section-note">暂无在线比赛，可手动添加</span>';
  $('#heroTitle').textContent=state.activeDate?`${weekday(state.activeDate)}研究`:'今日研究';
  $('#heroSubtitle').textContent=state.activeDate?`${fmtDate(state.activeDate)} · 赛前观点记录`:'选择比赛并记录你的判断';
}
function renderMatches(){
  let list=state.matches.filter(m=>m.businessDate===state.activeDate);
  if(activeFilter==='edited') list=list.filter(m=>isEdited(draftFor(m.id)));
  if(activeFilter==='primary') list=list.filter(m=>draftFor(m.id).confidence==='主推');
  const edited=state.matches.filter(m=>m.businessDate===state.activeDate&&isEdited(draftFor(m.id))).length;
  $('#editedCount').textContent=edited;
  $('#matchList').innerHTML=list.length?list.map(matchCard).join(''):`<div class="empty">${activeFilter==='all'?'暂时没有比赛<br>可点击“手动添加”录入':'没有符合筛选条件的比赛'}</div>`;
  $$('.match-card').forEach(el=>el.addEventListener('click',()=>openEdit(el.dataset.id)));
}
function matchCard(m){
  const d=draftFor(m.id),summary=[];
  if(d.spf.length) summary.push(`胜平负 ${d.spf.map(x=>pickLabel('spf',x)).join('/')}`);
  if(d.hhad.length) summary.push(`${m.hhad?.goalLine||'让球'} ${d.hhad.map(x=>pickLabel('hhad',x)).join('/')}`);
  if(d.goals.length) summary.push(`进球 ${d.goals.join('/')}`);
  if(d.scores) summary.push(`比分 ${d.scores}`);
  if(d.confidence) summary.unshift(d.confidence);
  return `<article class="match-card ${isEdited(d)?'edited':''} ${d.confidence==='主推'?'primary-card':''}" data-id="${m.id}">
    <div class="match-top"><span class="league">${esc(m.league)}</span><span class="match-no">${esc(m.num)}</span><span class="match-time">${esc(m.matchDate.slice(5))} ${esc(m.time)}</span></div>
    <div class="teams"><span>${esc(m.home)}</span><span class="vs">VS</span><span>${esc(m.away)}</span></div>
    <div class="odds-row"><div class="odd">胜<strong>${m.had?.h||'--'}</strong></div><div class="odd">平<strong>${m.had?.d||'--'}</strong></div><div class="odd">负<strong>${m.had?.a||'--'}</strong></div></div>
    <div class="pick-summary">${summary.length?summary.map((x,i)=>`<span class="tag ${i===0&&d.confidence==='主推'?'primary':''} ${d.confidence==='风险'?'risk':''}">${esc(x)}</span>`).join(''):'<span class="tag">点击开始研究</span>'}</div>
  </article>`;
}

function toggleArr(arr,val){return arr.includes(val)?arr.filter(x=>x!==val):[...arr,val]}
function pickButtons(market,items,selected){return items.map(([v,label,odd])=>`<button type="button" class="pick-btn ${selected.includes(v)?'selected':''}" data-market="${market}" data-value="${v}">${label}${odd?`<em>${odd}</em>`:''}</button>`).join('')}
function openEdit(id){
  editingId=id;const m=state.matches.find(x=>x.id===id),d=structuredClone(draftFor(id));
  $('#editContent').innerHTML=`<div class="sheet-handle"></div><div class="dialog-head"><div><p class="eyebrow">${esc(m.league)} · ${esc(m.num)}</p><h2>${esc(m.home)} vs ${esc(m.away)}</h2></div><button value="cancel">×</button></div>
  <div class="pick-group"><h4>胜平负</h4><div class="pick-grid">${pickButtons('spf',[['h','胜',m.had?.h],['d','平',m.had?.d],['a','负',m.had?.a]],d.spf)}</div></div>
  <div class="pick-group"><h4>让球胜平负 <span class="match-no">${esc(m.hhad?.goalLine||'')}</span></h4><div class="pick-grid">${pickButtons('hhad',[['h','让胜',m.hhad?.h],['d','让平',m.hhad?.d],['a','让负',m.hhad?.a]],d.hhad)}</div></div>
  <div class="pick-group"><h4>进球数</h4><div class="pick-grid goals">${pickButtons('goals',['0','1','2','3','4','5','6','7+'].map(x=>[x,x,'']),d.goals)}</div></div>
  <div class="pick-group"><h4>信心标签</h4><div class="confidence-grid">${['主推','次选','冷门','风险','放弃'].map(x=>`<button type="button" class="pick-btn ${d.confidence===x?'selected':''}" data-confidence="${x}">${x}</button>`).join('')}</div></div>
  <label>比分参考<input class="field-input" id="scoreInput" value="${esc(d.scores)}" placeholder="例如：2:1、1:1、2:0" /></label>
  <label>分析理由<textarea class="field-input" id="noteInput" rows="4" placeholder="记录信息、赔率变化和判断理由">${esc(d.note)}</textarea></label>
  <button type="button" class="primary full" id="saveDraftBtn">保存本场研究</button>`;
  const dlg=$('#editDialog');dlg.showModal();
  $$('#editContent .pick-btn[data-market]').forEach(btn=>btn.onclick=()=>{d[btn.dataset.market]=toggleArr(d[btn.dataset.market],btn.dataset.value);btn.classList.toggle('selected')});
  $$('#editContent [data-confidence]').forEach(btn=>btn.onclick=()=>{d.confidence=d.confidence===btn.dataset.confidence?'':btn.dataset.confidence;$$('#editContent [data-confidence]').forEach(b=>b.classList.toggle('selected',b.dataset.confidence===d.confidence))});
  $('#saveDraftBtn').onclick=()=>{d.scores=$('#scoreInput').value.trim();d.note=$('#noteInput').value.trim();state.drafts[id]=d;saveState();dlg.close();renderAll();toast('已保存本场研究')};
}

function availableOptions(m,d){
  const opts=[];
  d.spf.forEach(p=>opts.push({market:'spf',pick:p,label:`${pickLabel('spf',p)} ${m.had?.[p]||'--'}`,odd:oddFor(m,'had',p)}));
  d.hhad.forEach(p=>opts.push({market:'hhad',pick:p,goalLine:Number(m.hhad?.goalLine)||0,label:`${m.hhad?.goalLine||'让球'} ${pickLabel('hhad',p)} ${m.hhad?.[p]||'--'}`,odd:oddFor(m,'hhad',p)}));
  d.goals.forEach(p=>{const key=`s${p==='7+'?'7':p}`,odd=Number(m.ttg?.[key])||0;opts.push({market:'goals',pick:p,label:`进球${p} ${odd||'--'}`,odd})});
  parseScorePicks(d.scores).forEach(p=>{const odd=Number(m.crs?.[crsKeyForScore(p)])||0;opts.push({market:'scores',pick:p,label:`比分${p} ${odd||'--'}`,odd})});
  return opts;
}
function optionText(label){return String(label||'').replace(/\s+(?:\d+(?:\.\d+)?|--)$/,'')}
function renderCombos(){
  const list=state.combos[state.activeDate]||[];
  $('#comboList').innerHTML=list.length?list.map(c=>{const items=normalizeComboItems(c.items),metrics=comboMetrics(items),prize=schemePrizeRange(items,2),range=metrics.minOdd===metrics.maxOdd?metrics.minOdd.toFixed(2):`${metrics.minOdd.toFixed(2)}–${metrics.maxOdd.toFixed(2)}`;return `<article class="combo-card"><h3>${esc(c.name)}</h3><p class="combo-meta">${metrics.legs}场 · ${prize.tickets}注 · 每注2元 · 创建于 ${esc(c.time||'')}</p><div class="combo-items">${items.map(x=>`<div class="combo-item"><span>${esc(x.num)} ${esc(x.home)}</span><span class="combo-selection">${x.options.map(o=>`<b class="tag">${esc(optionText(o.label))}</b>`).join('')}</span></div>`).join('')}</div><div class="combo-cost"><span>方案投注金额</span><strong>¥${prize.cost.toFixed(2)}</strong></div><div class="prize-grid"><div><span>理论最低总返奖</span><strong>¥${prize.minPrize.toFixed(2)}</strong></div><div><span>理论最高总返奖</span><strong>¥${prize.maxPrize.toFixed(2)}</strong></div></div><p class="combo-calc-note">命中时理论值；同场多个玩法同时命中时，按全部中奖组合票奖金相加。</p><div class="combo-odds-small">${metrics.complete?`单票参考赔率 ${range}`:'部分选项暂无赔率'}</div><div class="combo-actions"><button class="secondary" data-edit-combo="${c.id}">编辑</button><button class="secondary" data-delete-combo="${c.id}">删除</button></div></article>`}).join(''):'<div class="empty">还没有组合方案<br>先编辑比赛，再创建方案</div>';
  $$('[data-edit-combo]').forEach(b=>b.onclick=()=>openCombo(b.dataset.editCombo));
  $$('[data-delete-combo]').forEach(b=>b.onclick=()=>{state.combos[state.activeDate]=list.filter(c=>c.id!==b.dataset.deleteCombo);saveState();renderCombos()});
}
function openCombo(id){
  const matches=selectedMatches().filter(m=>availableOptions(m,draftFor(m.id)).length);
  if(!matches.length){toast('请先编辑至少一场比赛选择');return}
  const existing=(state.combos[state.activeDate]||[]).find(c=>c.id===id),existingItems=normalizeComboItems(existing?.items||[]);
  const selected=new Map(existingItems.map(x=>[x.matchId,new Set(x.options.map(o=>`${o.market}:${o.pick}`))]));
  $('#comboContent').innerHTML=`<div class="sheet-handle"></div><div class="dialog-head"><div><p class="eyebrow">PLAN BUILDER</p><h2>${existing?'编辑':'新建'}组合方案</h2></div><button value="cancel">×</button></div><label>方案名称<input id="comboName" class="field-input" value="${esc(existing?.name||'稳健方案')}" /></label><div class="pick-group"><h4>每场可多选</h4><p class="section-note">胜平负、让球、进球数和比分都可以同时勾选多个。</p>${matches.map(m=>{const opts=availableOptions(m,draftFor(m.id)),set=selected.get(m.id)||new Set();return `<div class="combo-match-select" data-match="${m.id}"><div class="combo-match-title">${esc(m.num)} ${esc(m.home)} vs ${esc(m.away)}</div><div class="combo-option-grid">${opts.map(o=>`<label class="combo-option-label"><input type="checkbox" class="combo-option" data-id="${m.id}" data-value="${o.market}:${o.pick}" ${set.has(`${o.market}:${o.pick}`)?'checked':''}><span>${esc(o.label)}</span></label>`).join('')}</div></div>`}).join('')}</div><button type="button" id="saveCombo" class="primary full">保存组合方案</button>`;
  const dlg=$('#comboDialog');dlg.showModal();
  $('#saveCombo').onclick=()=>{const items=[];matches.forEach(m=>{const checked=[...document.querySelectorAll(`.combo-option[data-id="${m.id}"]:checked`)];if(!checked.length)return;const opts=availableOptions(m,draftFor(m.id)),options=checked.map(ch=>{const [market,pick]=splitOptionValue(ch.dataset.value);return opts.find(o=>o.market===market&&o.pick===pick)}).filter(Boolean);items.push({matchId:m.id,num:m.num,home:m.home,away:m.away,options})});if(items.length<2){toast('组合方案至少选择两场');return}const all=state.combos[state.activeDate]||[],combo={id:existing?.id||uid(),name:$('#comboName').value.trim()||'未命名方案',items,time:new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})};state.combos[state.activeDate]=existing?all.map(c=>c.id===existing.id?combo:c):[...all,combo];saveState();dlg.close();renderCombos();toast('多选组合方案已保存')};
}

function openManual(){
  $('#manualContent').innerHTML=`<div class="sheet-handle"></div><div class="dialog-head"><div><p class="eyebrow">MANUAL MATCH</p><h2>手动添加比赛</h2></div><button value="cancel">×</button></div>
  <label>日期<input id="manualDate" type="date" class="field-input" value="${state.activeDate||new Date().toISOString().slice(0,10)}"></label><label>比赛编号<input id="manualNum" class="field-input" placeholder="周五201"></label><label>联赛<input id="manualLeague" class="field-input" placeholder="英超"></label><label>主队<input id="manualHome" class="field-input"></label><label>客队<input id="manualAway" class="field-input"></label><label>开赛时间<input id="manualTime" type="time" class="field-input"></label><button type="button" id="saveManual" class="primary full">添加比赛</button>`;
  const dlg=$('#manualDialog');dlg.showModal();$('#saveManual').onclick=()=>{const date=$('#manualDate').value,home=$('#manualHome').value.trim(),away=$('#manualAway').value.trim();if(!date||!home||!away){toast('请填写日期和对阵双方');return}state.matches.push({id:'manual-'+uid(),businessDate:date,matchDate:date,time:$('#manualTime').value,num:$('#manualNum').value.trim()||'自定义',league:$('#manualLeague').value.trim()||'足球',home,away,had:{},hhad:{},manual:true});state.activeDate=date;saveState();dlg.close();renderAll();toast('比赛已添加')};
}

function saveReport(){
  const matches=selectedMatches();if(!matches.length){toast('当前日期还没有研究内容');return}
  const report={id:uid(),date:state.activeDate,createdAt:new Date().toISOString(),matches:structuredClone(matches),drafts:Object.fromEntries(matches.map(m=>[m.id,structuredClone(draftFor(m.id))])),combos:structuredClone(state.combos[state.activeDate]||[])};
  state.reports=state.reports.filter(r=>r.date!==state.activeDate);state.reports.unshift(report);saveState();renderHistory();toast('已保存到历史记录');
}
function renderHistory(){
  $('#historyList').innerHTML=state.reports.length?state.reports.map(r=>`<article class="history-card"><div><p class="eyebrow">${weekday(r.date)} · ${fmtDate(r.date)}</p><h3>${r.matches.length}场研究 · ${r.combos.length}个方案</h3><span class="combo-meta">发布 ${new Date(r.createdAt).toLocaleString('zh-CN')}</span></div><button data-history-poster="${r.id}">生成图片</button></article>`).join(''):'<div class="empty">还没有历史报告<br>在“方案”页保存后会出现在这里</div>';
  $$('[data-history-poster]').forEach(b=>b.onclick=()=>{const r=state.reports.find(x=>x.id===b.dataset.historyPoster);drawPoster(r);$('#posterDialog').showModal()});
}

function wrapText(ctx,text,maxWidth){const chars=[...String(text)],lines=[];let line='';for(const c of chars){if(ctx.measureText(line+c).width>maxWidth&&line){lines.push(line);line=c}else line+=c}if(line)lines.push(line);return lines}
function drawPoster(report){
  const date=report?.date||state.activeDate,matches=report?.matches||selectedMatches(),drafts=report?.drafts||state.drafts,combos=report?.combos||state.combos[date]||[];
  const rows=matches.map(m=>{const d=drafts[m.id]||draftFor(m.id);let parts=[];if(d.spf?.length)parts.push(`胜平负 ${d.spf.map(x=>pickLabel('spf',x)).join('/')}`);if(d.hhad?.length)parts.push(`${m.hhad?.goalLine||'让球'} ${d.hhad.map(x=>pickLabel('hhad',x)).join('/')}`);if(d.goals?.length)parts.push(`进球 ${d.goals.join('/')}`);if(d.scores)parts.push(`比分 ${d.scores}`);return {m,d,parts}});
  const height=480+rows.reduce((n,r)=>n+180+(r.d.note?70:0),0)+combos.length*200+180;
  const canvas=$('#posterCanvas'),ctx=canvas.getContext('2d');canvas.width=1080;canvas.height=height;
  const grad=ctx.createLinearGradient(0,0,1080,height);grad.addColorStop(0,'#091523');grad.addColorStop(1,'#102b45');ctx.fillStyle=grad;ctx.fillRect(0,0,1080,height);
  ctx.fillStyle='#f6c851';ctx.fillRect(64,60,72,8);ctx.font='700 28px sans-serif';ctx.fillText('FOOTBALL RESEARCH',64,120);ctx.fillStyle='#ffffff';ctx.font='900 66px sans-serif';ctx.fillText(state.settings.author||'足球研究员',64,205);ctx.fillStyle='#9fb1c7';ctx.font='34px sans-serif';ctx.fillText(`${date}  ${weekday(date)}足球研究`,64,265);
  let y=345;rows.forEach(({m,d,parts},idx)=>{ctx.fillStyle='rgba(255,255,255,.06)';roundRect(ctx,48,y-40,984,140+(d.note?70:0),24);ctx.fillStyle=d.confidence==='主推'?'#f6c851':'#6faeff';ctx.font='800 27px sans-serif';ctx.fillText(`${m.num} · ${m.league}${d.confidence?` · ${d.confidence}`:''}`,76,y);ctx.fillStyle='#fff';ctx.font='900 35px sans-serif';ctx.fillText(`${m.home}  VS  ${m.away}`,76,y+50);ctx.fillStyle='#c4d1e1';ctx.font='28px sans-serif';ctx.fillText(parts.join('　')||'已记录分析',76,y+94);if(d.note){ctx.fillStyle='#8fa1b8';ctx.font='24px sans-serif';const lines=wrapText(ctx,d.note,900).slice(0,2);lines.forEach((line,i)=>ctx.fillText(line,76,y+137+i*31))}y+=180+(d.note?70:0)});
  if(combos.length){ctx.fillStyle='#f6c851';ctx.font='900 34px sans-serif';ctx.fillText('今日组合',64,y+10);y+=65;combos.forEach(c=>{const items=normalizeComboItems(c.items),prize=schemePrizeRange(items,2),selection=items.map(x=>`${x.num}[${x.options.map(o=>optionText(o.label)).join('/')}]`).join(' × ');ctx.fillStyle='rgba(246,200,81,.10)';roundRect(ctx,48,y-35,984,165,20);ctx.fillStyle='#fff';ctx.font='800 29px sans-serif';ctx.fillText(c.name,72,y+5);ctx.fillStyle='#c4d1e1';ctx.font='24px sans-serif';wrapText(ctx,selection,880).slice(0,2).forEach((line,i)=>ctx.fillText(line,72,y+43+i*29));ctx.fillStyle='#f6c851';ctx.font='700 22px sans-serif';ctx.fillText(`${prize.tickets}注 · 每注2元 · 投注金额 ¥${prize.cost.toFixed(2)}`,72,y+91);ctx.fillStyle='#fff';ctx.fillText(`理论总返奖 ¥${prize.minPrize.toFixed(2)}–¥${prize.maxPrize.toFixed(2)}`,72,y+121);y+=200})}
  ctx.strokeStyle='rgba(255,255,255,.15)';ctx.beginPath();ctx.moveTo(64,height-155);ctx.lineTo(1016,height-155);ctx.stroke();ctx.fillStyle='#9fb1c7';ctx.font='23px sans-serif';wrapText(ctx,state.settings.disclaimer,940).slice(0,2).forEach((line,i)=>ctx.fillText(line,64,height-105+i*32));ctx.fillStyle='#f6c851';ctx.font='700 20px sans-serif';ctx.fillText(`生成时间 ${new Date().toLocaleString('zh-CN')}`,64,height-36);
}
function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill()}
function showPoster(){if(!selectedMatches().length){toast('请先编辑比赛');return}drawPoster();$('#posterDialog').showModal()}
function downloadPoster(){const a=document.createElement('a');a.download=`足球研究-${state.activeDate}.png`;a.href=$('#posterCanvas').toDataURL('image/png');a.click();toast('图片已生成')}

function renderSettings(){$('#authorInput').value=state.settings.author||'';$('#disclaimerInput').value=state.settings.disclaimer||''}
function exportData(){const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`足球研究工作台备份-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href);toast('备份已导出')}
async function importData(file){try{const data=JSON.parse(await file.text());if(!data||!Array.isArray(data.matches))throw new Error('格式不正确');state={...structuredClone(DEFAULT_STATE),...data};saveState();renderAll();toast('备份导入成功')}catch{toast('导入失败：文件格式不正确')}}

function bind(){
  $('#refreshBtn').onclick=()=>fetchMatches();$('#manualAddBtn').onclick=openManual;$('#addComboBtn').onclick=()=>openCombo();$('#posterBtn').onclick=showPoster;$('#saveReportBtn').onclick=saveReport;$('#closePosterBtn').onclick=()=>$('#posterDialog').close();$('#downloadPosterBtn').onclick=downloadPoster;
  $('#dateStrip').onclick=e=>{const b=e.target.closest('[data-date]');if(b){state.activeDate=b.dataset.date;saveState();renderAll()}};
  $('#filterBar').onclick=e=>{const b=e.target.closest('[data-filter]');if(b){activeFilter=b.dataset.filter;$$('#filterBar button').forEach(x=>x.classList.toggle('active',x===b));renderMatches()}};
  $$('.bottom-nav button').forEach(b=>b.onclick=()=>{$$('.bottom-nav button').forEach(x=>x.classList.toggle('active',x===b));$$('.page').forEach(p=>p.classList.toggle('active',p.id===b.dataset.page));if(b.dataset.page==='plansPage')renderCombos()});
  $('#saveSettingsBtn').onclick=()=>{state.settings.author=$('#authorInput').value.trim()||'足球研究员';state.settings.disclaimer=$('#disclaimerInput').value.trim();saveState();toast('设置已保存')};
  $('#exportBtn').onclick=exportData;$('#importInput').onchange=e=>e.target.files[0]&&importData(e.target.files[0]);$('#clearBtn').onclick=()=>{if(confirm('确定清空本机的全部比赛、方案和历史记录吗？')){state=structuredClone(DEFAULT_STATE);saveState();renderAll();toast('本机数据已清空')}};
}

bind();renderAll();fetchMatches(false);
if('serviceWorker' in navigator&&location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(console.error);
