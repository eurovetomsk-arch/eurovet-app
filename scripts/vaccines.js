'use strict';
/* ====== 2.0 · Модуль «Вакцины» (REMARKS п.24а–д) ======
   Общий справочник из 9 позиций (набор одинаков на всех филиалах), остатки по филиалам: видят ВСЕ роли, вносит администратор вечером (сегодня/вчера).
   Красным — остаток МЕНЬШЕ порога позиции (порог на сервере, меняет руководитель); «Вакцины для кроликов» без порога — не подсвечиваются.
   Сервер: ev_vaccines_overview / ev_vaccines_history / ev_vaccines_save (миграция 15 / L09). Напоминание «не внесено» после 21:30 — на главной админа и руководителя. */
const VX={data:null,err:null,loading:false,at:0,branch:null,mode:'list',entry:null,hist:null};
const vacHm=t=>{try{return new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Omsk',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(t))}catch(e){return ''}};
const vacCanEnter=()=>!!(S.person&&(isHead()||personRoles().includes('admin')||canReport()));
async function loadVacOverview(force){
  if(!S.token||VX.loading||(UI2.moduleBuilt||{}).vaccines!==true)return; /* модуль выключен настройкой (в живом — до миграции L09) */
  if(!force&&VX.data&&Date.now()-VX.at<120000)return;
  VX.loading=true;
  try{
    const r=await rpc('ev_vaccines_overview',{p_token:S.token},8000);
    if(r&&r.ok){VX.data=r;VX.err=null;VX.at=Date.now()}
    else VX.err=(r&&r.error==='session')?'Сессия закончилась, войдите заново.':'Остатки пока недоступны.';
  }catch(e){VX.err=e.net?'Нет связи: остатки пока не загрузились.':'Остатки пока недоступны.'}
  VX.loading=false;
  if(S.view==='vac')paint();else if(S.view==='branch')(typeof homePaint==='function'?homePaint():paint());
}
const vacItems=()=>(VX.data&&VX.data.items)||[];
const vacBranches=()=>(VX.data&&VX.data.branches)||[];
const vacItemName=id=>{const i=vacItems().find(x=>Number(x.id)===Number(id));return i?i.name:'#'+id};
const vacShortTitle=t=>String(t||'').replace(/,\s*\d+$/,'');
/* после 21:30: напоминание «остатки не внесены» (админ и руководитель) */
function vacReminderHtml(){
  if(!VX.data||!(vacCanEnter()))return '';
  const hm=new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Omsk',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());
  const miss=(VX.data.missing_today||[]).map(id=>{const b=vacBranches().find(x=>x.branch===id);return b?vacShortTitle(b.title):id});
  if(hm<'21:30'||!miss.length)return '';
  return '<button class="glass ui2-today bad" data-act="go" data-v="vac"><span class="pin">!</span><div><b>Остатки вакцин не внесены</b><br>'+miss.map(esc).join(', ')+' ›</div></button>';
}
async function showVac(){
  closeOv();S.view='vac';VX.mode='list';VX.entry=null;
  if(!VX.branch){const mine=(typeof HOME_WHO!=='undefined'&&HOME_WHO.rows||[]).find(r=>r&&r.mine===true&&(r.branch||r.branch_id));VX.branch=mine?(mine.branch||mine.branch_id):null}
  paint();window.scrollTo(0,0);await loadVacOverview(true);
  if(!VX.branch&&vacBranches().length){VX.branch=vacBranches()[0].branch;paint()}
}
function vacGroups(items){
  const g=[];items.forEach(i=>{let x=g.find(y=>y.name===i.grp);if(!x){x={name:i.grp,sort:i.grp_sort,items:[]};g.push(x)}x.items.push(i)});
  return g.sort((a,b)=>a.sort-b.sort);
}
function vacBranchChips(act){
  return '<div class="chips" id="vacbr">'+vacBranches().map(b=>'<button class="chip'+(VX.branch===b.branch?' on':'')+'" data-act="'+act+'" data-id="'+esc(b.branch)+'" style="--bd:'+({marksa:'#e0457f','70let':'#2fbf8f',pereleta:'#4f7bff'}[b.branch]||'var(--line)')+'">'+esc(vacShortTitle(b.title))+'</button>').join('')+'</div>';
}
function vacListHtml(){
  const b=vacBranches().find(x=>x.branch===VX.branch);
  let h='<h1 class="screen-title">Вакцины</h1>'+vacBranchChips('vacbranch');
  if(!b)return h;
  const when=b.stock_date?('на вечер '+ruDate(b.stock_date)+' · внесено в '+vacHm(b.entered_at)+(b.by?' · '+esc(b.by):'')):'пока не внесены';
  h+='<div class="card"><h2>'+esc(b.title)+'</h2><p class="hint" style="margin:0 0 8px">Остатки '+when+'</p>';
  if(!b.stock_date)h+='<p class="hint">Администратор вносит остатки каждый вечер.</p>';
  const low=new Set((b.low||[]).map(Number));
  vacGroups(vacItems()).forEach(g=>{
    h+='<div class="vac-grp">'+esc(g.name)+'</div>';
    g.items.forEach(i=>{const q=(b.qty||{})[i.id],isLow=low.has(Number(i.id));
      h+='<div class="vac-row'+(isLow?' low':'')+'"><span>'+esc(i.name)+(i.species?'<small>'+esc(i.species)+(i.note?' · '+esc(i.note):'')+'</small>':(i.note?'<small>'+esc(i.note)+'</small>':''))+'</span><b>'+(q==null?'—':q)+'</b>'+(isLow?'<em>мало</em>':'')+'</div>'});
  });
  h+='</div>';
  if(vacCanEnter())h+='<button class="btn" data-act="vacentry">Внести остатки на вечер</button>';
  h+='<button class="btn sec" style="margin-top:8px" data-act="vachist">История по дням</button>';
  return h;
}
function vacEntryStart(){
  const b=vacBranches().find(x=>x.branch===VX.branch);if(!b)return;
  const qty={};vacItems().forEach(i=>{const q=(b.qty||{})[i.id];qty[i.id]=q==null?'0':String(q)});
  VX.mode='entry';VX.entry={branch:b.branch,date:VX.data.today,qty,busy:false,savedAt:null,err:null};paint();window.scrollTo(0,0);
}
function vacEntryHtml(){
  const e=VX.entry,b=vacBranches().find(x=>x.branch===e.branch);
  let h='<h1 class="screen-title">Внести остатки на вечер</h1><div class="card"><h2>'+esc(b?b.title:e.branch)+'</h2><div class="chips" id="vacday">'
    +[[VX.data.today,'Сегодня'],[addDays(VX.data.today,-1),'За вчера']].map(x=>'<button class="chip'+(e.date===x[0]?' on':'')+'" data-act="vacday" data-d="'+x[0]+'">'+x[1]+' · '+ruDate(x[0]).slice(0,5)+'</button>').join('')+'</div>';
  vacGroups(vacItems()).forEach(g=>{
    h+='<div class="vac-grp">'+esc(g.name)+'</div>';
    g.items.forEach(i=>{h+='<div class="vac-edit"><span>'+esc(i.name)+(i.note?'<small>'+esc(i.note)+'</small>':'')+'</span><div class="vac-step"><button class="vac-b" data-act="vacstep" data-id="'+i.id+'" data-s="-1" aria-label="Минус">−</button><input class="vq" inputmode="numeric" pattern="[0-9]*" maxlength="4" data-id="'+i.id+'" value="'+esc(e.qty[i.id])+'"><button class="vac-b" data-act="vacstep" data-id="'+i.id+'" data-s="1" aria-label="Плюс">+</button></div></div>'});
  });
  h+='</div>';
  if(e.err)h+='<div class="chk bad"><i>!</i><div>'+esc(e.err)+'</div></div>';
  if(e.savedAt)h+='<div class="chk ok"><i>✓</i><div><b>Остатки внесены в '+esc(vacHm(e.savedAt))+'</b></div></div>';
  h+='<button class="btn" data-act="vacsave"'+(e.busy?' disabled':'')+'>'+(e.busy?'Сохраняю…':'Сохранить остатки')+'</button><button class="btn sec" style="margin-top:8px" data-act="vacback">Назад</button>';
  return h;
}
async function vacHistStart(){
  VX.mode='hist';VX.hist={branch:VX.branch,loading:true,days:[],err:null};paint();window.scrollTo(0,0);
  try{const r=await rpc('ev_vaccines_history',{p_token:S.token,p_branch:VX.branch,p_days:14},8000);if(r&&r.ok)VX.hist.days=r.days||[];else VX.hist.err='История недоступна.'}catch(e){VX.hist.err=e.net?'Нет связи.':'История недоступна.'}
  VX.hist.loading=false;if(S.view==='vac')paint();
}
function vacHistHtml(){
  const hs=VX.hist,b=vacBranches().find(x=>x.branch===hs.branch);
  let h='<h1 class="screen-title">История остатков</h1>'+vacBranchChips('vachistbr')+'<div class="card"><h2>'+esc(b?b.title:hs.branch)+'</h2>';
  if(hs.loading)h+='<p class="hint">Загружаю…</p>';else if(hs.err)h+='<p class="hint">'+esc(hs.err)+'</p>';else if(!hs.days.length)h+='<p class="hint">Остатки за последние 14 дней не вносились.</p>';
  hs.days.forEach(d=>{h+='<div class="vac-day"><b>'+ruDate(d.date)+'</b><small>внесено в '+vacHm(d.entered_at)+(d.by?' · '+esc(d.by):'')+'</small><div class="vac-dq">'+vacItems().filter(i=>d.qty&&d.qty[i.id]!=null).map(i=>'<span>'+esc(i.name)+' <b>'+d.qty[i.id]+'</b></span>').join('')+'</div></div>'});
  return h+'</div><button class="btn sec" data-act="vacback">Назад</button>';
}
function vacHtml(){
  let h='';
  if(S.person)h+='<p class="hello">'+esc(stageGreeting(S.person))+'</p>';
  if(!VX.data){h+='<h1 class="screen-title">Вакцины</h1><div class="card"><p class="hint">'+esc(VX.err||'Загружаю остатки…')+'</p></div>';return h}
  return h+(VX.mode==='entry'?vacEntryHtml():VX.mode==='hist'?vacHistHtml():vacListHtml());
}
async function vacSave(){
  const e=VX.entry;if(!e||e.busy)return;
  const rows=vacItems().map(i=>({item_id:Number(i.id),qty:String(e.qty[i.id]).replace(/\D/g,'')}));
  if(rows.some(r=>r.qty===''||Number(r.qty)>9999)){e.err='Впишите остаток цифрами по каждой позиции (0 — если нет).';paint();return}
  e.busy=true;e.err=null;paint();
  try{
    const r=await rpc('ev_vaccines_save',{p_token:S.token,p_branch:e.branch,p_date:e.date,p_rows:rows.map(x=>({item_id:x.item_id,qty:Number(x.qty)}))},12000);
    if(r&&r.ok){e.savedAt=r.entered_at||new Date().toISOString();e.busy=false;await loadVacOverview(true);toast('Остатки внесены')}
    else{e.busy=false;e.err=({forbidden:'Вносить остатки может администратор.',date:'Можно вносить за сегодня или вчера.',session:'Сессия закончилась, войдите заново.'}[r&&r.error])||'Не удалось сохранить. Проверьте цифры.'}
  }catch(x){e.busy=false;e.err=x.net?'Нет связи. Остатки не сохранены — попробуйте ещё раз.':'Ошибка сервера. Остатки не сохранены.'}
  if(S.view==='vac')paint();
}
document.addEventListener('input',ev=>{
  const t=ev.target;if(!(t&&t.classList&&t.classList.contains('vq')&&VX.entry))return;
  const v=t.value.replace(/\D/g,'').slice(0,4);if(v!==t.value)t.value=v;VX.entry.qty[t.dataset.id]=v;VX.entry.savedAt=null;
});
