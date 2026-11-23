'use strict';
/* ====== 2.0 · Экран «Аналитика» (К3, только руководитель) ======
   Выручка, число счетов и средний чек по сети, филиалам и врачам; клиники (Vetmanager) и аптека (из отчётов) отдельно; рост/падение в % к сопоставимому периоду.
   Периоды: день / неделя / месяц / год со стрелками. Все формулы считает сервер (ev_analytics_overview), здесь только показ. */
const AN={period:'day',anchor:null,data:null,err:null,loading:false};
const AN_PER=[['day','День'],['week','Неделя'],['month','Месяц'],['year','Год']];
const AN_MON=['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const anOmskToday=()=>{try{return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Omsk'}).format(new Date())}catch(e){return new Date().toISOString().slice(0,10)}};
const anRub=n=>n==null?'—':Number(n).toLocaleString('ru-RU',{minimumFractionDigits:0,maximumFractionDigits:0})+' ₽';
const anRub2=n=>n==null?'—':Number(n).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' ₽';
const anInt=n=>n==null?'—':Number(n).toLocaleString('ru-RU');
const anD=s=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(s||''));return m?{y:+m[1],m:+m[2],d:+m[3]}:null};
const anDMY=s=>{const x=anD(s);return x?String(x.d).padStart(2,'0')+'.'+String(x.m).padStart(2,'0')+'.'+x.y:''};
const anDM=s=>{const x=anD(s);return x?String(x.d).padStart(2,'0')+'.'+String(x.m).padStart(2,'0'):''};
function anLabel(period,from,to){
  const f=anD(from),t=anD(to);if(!f||!t)return '';
  if(period==='day')return anDMY(from);
  if(period==='week')return anDM(from)+' – '+anDMY(to);
  if(period==='month')return AN_MON[f.m-1]+' '+f.y;
  return String(f.y);
}
/* знак и цвет процента: рост зелёный ▲, падение красное ▼, нет прошлого периода — прочерк */
function anPct(p){
  if(p==null)return '<span class="an-pct na">нет базы</span>';
  const n=Number(p),s=Math.abs(n).toLocaleString('ru-RU',{minimumFractionDigits:1,maximumFractionDigits:1});
  if(n>0)return '<span class="an-pct up">▲ +'+s+'%</span>';
  if(n<0)return '<span class="an-pct down">▼ −'+s+'%</span>';
  return '<span class="an-pct zero">0,0%</span>';
}
function anShift(period,a,dir){
  const x=anD(a)||anD(anOmskToday());const t=new Date(Date.UTC(x.y,x.m-1,x.d));
  if(period==='day')t.setUTCDate(t.getUTCDate()+dir);
  else if(period==='week')t.setUTCDate(t.getUTCDate()+7*dir);
  else if(period==='month'){t.setUTCDate(1);t.setUTCMonth(t.getUTCMonth()+dir)}
  else{t.setUTCMonth(0,1);t.setUTCFullYear(t.getUTCFullYear()+dir)}
  return t.toISOString().slice(0,10);
}
async function loadAnalytics(){
  if(!S.token||AN.loading)return;AN.loading=true;AN.err=null;
  try{const r=await rpc('ev_analytics_overview',{p_token:S.token,p_period:AN.period,p_anchor:AN.anchor},15000);
    if(r&&r.ok){AN.data=r;AN.anchor=r.anchor}
    else AN.err=(r&&r.error==='forbidden')?'Аналитика — только у руководителя.':(r&&r.error==='session')?'Сессия закончилась, войдите заново.':'Аналитика пока недоступна.'}
  catch(e){AN.err=e.net?'Нет связи.':'Аналитика пока недоступна.'}
  AN.loading=false;if(S.view==='an')paint();
}
async function showAnalytics(){
  closeOv();S.view='an';if(!AN.anchor)AN.anchor=anOmskToday();AN.data=null;paint();window.scrollTo(0,0);await loadAnalytics();
}
function anMetric(label,val,pct,sub){return '<div class="an-m"><span class="an-ml">'+label+'</span><span class="an-mv">'+val+(sub?'<small>'+sub+'</small>':'')+'</span>'+anPct(pct)+'</div>'}
function anBlock(b,title,withPharmacy){
  let h='<div class="card an-card"><h2>'+esc(title)+'</h2>';
  if(!b.days&&!b.revenue&&!b.invoices){return h+'<p class="hint">Данных за этот период ещё нет.</p></div>'}
  h+='<div class="an-sec">Клиника</div>'
    +anMetric('Выручка',anRub(b.revenue),b.revenue_pct,b.prev_days?'было '+anRub(b.prev_revenue):'')
    +anMetric('Счетов',anInt(b.invoices),b.invoices_pct,b.prev_days?'было '+anInt(b.prev_invoices):'')
    +anMetric('Средний чек',anRub(b.avg_check),b.avg_check_pct,b.prev_days&&b.prev_avg_check!=null?'было '+anRub(b.prev_avg_check):'');
  if(withPharmacy!==false)h+='<div class="an-sec">Аптека <small>из отчётов</small></div>'+anMetric('Выручка',anRub(b.pharmacy),b.pharmacy_pct,b.prev_days?'было '+anRub(b.prev_pharmacy):'');
  return h+'</div>';
}
function anDoctors(list){
  if(!list||!list.length)return '';
  return '<div class="card an-card"><h2>Врачи</h2>'+list.map(d=>'<div class="an-doc"><div class="an-dn">'+esc(d.name)+'</div><div class="an-dr"><b>'+anRub(d.revenue)+'</b> '+anPct(d.revenue_pct)+'</div><div class="an-ds">счетов '+anInt(d.invoices)+' · чек '+anRub(d.avg_check)+' '+anPct(d.avg_check_pct)+'</div></div>').join('')+'</div>';
}
function analyticsHtml(){
  let h='<button class="md-back" data-anact="home">‹ На главную</button><h1 class="screen-title">Аналитика</h1>';
  h+='<div class="chips">'+AN_PER.map(p=>'<button class="chip'+(AN.period===p[0]?' on':'')+'" data-anact="period" data-id="'+p[0]+'">'+p[1]+'</button>').join('')+'</div>';
  const d=AN.data;
  if(AN.err)return h+'<p class="mute">'+esc(AN.err)+'</p>';
  if(!d)return h+'<p class="mute">Загрузка…</p>';
  h+='<div class="an-nav"><button class="chip" data-anact="prev" aria-label="Назад">‹</button><div class="an-pl"><b>'+esc(anLabel(d.period,d.from,d.to))+'</b><small>сравнение с '+esc(anLabel(d.period,d.prev_from,d.prev_to))+'</small></div><button class="chip" data-anact="next" aria-label="Вперёд"'+(d.can_next?'':' disabled')+'>›</button></div>';
  h+=anBlock(d.network,'Вся сеть');
  (d.branches||[]).forEach(b=>{h+=anBlock(b,b.title)});
  h+=anDoctors(d.doctors);
  return h;
}
document.addEventListener('click',async ev=>{
  const el=ev.target.closest&&ev.target.closest('[data-anact]');if(!el||S.view!=='an')return;
  const a=el.dataset.anact;
  if(a==='home'){S.view='branch';render();window.scrollTo(0,0)}
  else if(a==='period'){AN.period=el.dataset.id;AN.data=null;paint();await loadAnalytics()}
  else if(a==='prev'||a==='next'){if(a==='next'&&AN.data&&!AN.data.can_next)return;AN.anchor=anShift(AN.period,AN.anchor,a==='next'?1:-1);AN.data=null;paint();await loadAnalytics()}
});
