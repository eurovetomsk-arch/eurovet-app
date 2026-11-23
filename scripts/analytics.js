'use strict';
/* ====== 2.0 · Экран «Аналитика» (К3, только руководитель) ======
   Выручка, число счетов и средний чек по сети, филиалам и врачам; клиника (Vetmanager) и аптека (из отчётов) отдельно; рост/падение в % к сопоставимому периоду.
   Правила сравнения (слова Михаила 23.11) считает сервер (ev_analytics_overview, L24): день — вчера к позавчера и к тому же дню прошлой недели; неделя — полная пн–вс к полной;
   месяц и год — «с начала по вчера» к тем же датам прошлого периода; произвольный период — к такому же отрезку перед ним. Процент только при полных данных обоих отрезков.
   Здесь только показ. */
const AN={period:'day',anchor:null,custom:null,showCustom:false,data:null,err:null,loading:false};
const AN_PER=[['day','День'],['week','Неделя'],['month','Месяц'],['months','Помесячно'],['year','Год'],['custom','Свой период']];
const AN_MON=['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const AN_GEN=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const anOmskToday=()=>{try{return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Omsk'}).format(new Date())}catch(e){return new Date().toISOString().slice(0,10)}};
const anRub=n=>n==null?'—':Number(n).toLocaleString('ru-RU',{minimumFractionDigits:0,maximumFractionDigits:0})+' ₽';
const anInt=n=>n==null?'—':Number(n).toLocaleString('ru-RU');
const anD=s=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(s||''));return m?{y:+m[1],m:+m[2],d:+m[3]}:null};
const anDMY=s=>{const x=anD(s);return x?String(x.d).padStart(2,'0')+'.'+String(x.m).padStart(2,'0')+'.'+x.y:''};
const anDM=s=>{const x=anD(s);return x?String(x.d).padStart(2,'0')+'.'+String(x.m).padStart(2,'0'):''};
const anLast=(y,m)=>new Date(Date.UTC(y,m,0)).getUTCDate();
/* понятная подпись отрезка: «Ноябрь 2026» (месяц целиком), «2026» (год целиком), «1–23 ноября 2026», «1 января – 23 ноября 2026» */
function anRange(from,to){
  const f=anD(from),t=anD(to);if(!f||!t)return '';
  if(f.y===t.y&&f.m===1&&f.d===1&&t.m===12&&t.d===31)return String(f.y);
  if(f.y===t.y&&f.m===t.m&&f.d===1&&t.d===anLast(t.y,t.m))return AN_MON[f.m-1]+' '+f.y;
  if(f.y===t.y&&f.m===t.m)return (f.d===t.d?String(f.d):f.d+'–'+t.d)+' '+AN_GEN[f.m-1]+' '+f.y;
  if(f.y===t.y)return f.d+' '+AN_GEN[f.m-1]+' – '+t.d+' '+AN_GEN[t.m-1]+' '+f.y;
  return anDMY(from)+' – '+anDMY(to);
}
/* подписи: основной период, сравнение, дополнительное сравнение */
function anLabels(d){
  const p=d.period,part=!!d.partial;let main,cmp,alt='';
  if(p==='day'){main=d.open?'Сегодня, '+anDMY(d.from):anDMY(d.from);cmp='к предыдущему дню, '+anDMY(d.prev_from);alt='к тому же дню прошлой недели, '+anDMY(d.alt_from)}
  else if(p==='week'){
    if(part){main='пн–вчера: '+anDM(d.from)+' – '+anDMY(d.to);cmp='к тем же дням прошлой недели: '+anDM(d.prev_from)+' – '+anDMY(d.prev_to)}
    else{main=anDM(d.from)+' – '+anDMY(d.to);cmp='к '+anDM(d.prev_from)+' – '+anDMY(d.prev_to)}
  }
  else if(p==='month'){main=anRange(d.from,d.to);cmp='к '+(part?'тем же дням: ':'')+anRange(d.prev_from,d.prev_to);alt='к тем же дням прошлого года: '+anRange(d.alt_from,d.alt_to)}
  else if(p==='months'){main='Помесячно · '+(anD(d.from)||{}).y;cmp='каждый месяц к тому же месяцу прошлого года (текущий — на ту же дату)'}
  else if(p==='year'){main=anRange(d.from,d.to);cmp='к '+(part?'тому же отрезку: ':'')+anRange(d.prev_from,d.prev_to)}
  else{main=anDMY(d.from)+' – '+anDMY(d.to);cmp='к такому же отрезку перед ним: '+anDMY(d.prev_from)+' – '+anDMY(d.prev_to)}
  return {main,cmp,alt};
}
/* процент: рост ▲ зелёный, падение ▼ красный; нет процента — причина (день не закрыт / нет полных данных / нет базы) */
function anPct(p,ok,open){
  if(open)return '<span class="an-pct na">день не закрыт</span>';
  if(p==null)return '<span class="an-pct na">'+(ok===false?'нет полных данных':'нет базы')+'</span>';
  const n=Number(p),s=Math.abs(n).toLocaleString('ru-RU',{minimumFractionDigits:1,maximumFractionDigits:1});
  if(n>0)return '<span class="an-pct up">▲ +'+s+'%</span>';
  if(n<0)return '<span class="an-pct down">▼ −'+s+'%</span>';
  return '<span class="an-pct zero">0,0%</span>';
}
const anPctTxt=(p,ok)=>p==null?(ok===false?'нет полных данных':'нет базы'):(Number(p)>0?'▲ +':Number(p)<0?'▼ −':'')+Math.abs(Number(p)).toLocaleString('ru-RU',{minimumFractionDigits:1,maximumFractionDigits:1})+'%';
function anShift(d,dir){
  const base=d.period==='day'?d.anchor:d.from,x=anD(base)||anD(anOmskToday());const t=new Date(Date.UTC(x.y,x.m-1,x.d));
  if(d.period==='day')t.setUTCDate(t.getUTCDate()+dir);
  else if(d.period==='week')t.setUTCDate(t.getUTCDate()+7*dir);
  else if(d.period==='month'){t.setUTCDate(1);t.setUTCMonth(t.getUTCMonth()+dir)}
  else{t.setUTCMonth(0,1);t.setUTCFullYear(t.getUTCFullYear()+dir)}
  return t.toISOString().slice(0,10);
}
async function loadAnalytics(){
  if(!S.token||AN.loading)return;AN.loading=true;AN.err=null;
  const body={p_token:S.token,p_period:AN.period,p_anchor:AN.period==='custom'?null:AN.anchor,p_from:AN.period==='custom'&&AN.custom?AN.custom.from:null,p_to:AN.period==='custom'&&AN.custom?AN.custom.to:null};
  try{const r=await rpc('ev_analytics_overview',body,15000);
    if(r&&r.ok){AN.data=r}
    else AN.err=(r&&r.error==='forbidden')?'Аналитика — только у руководителя.':(r&&r.error==='session')?'Сессия закончилась, войдите заново.':(r&&r.error==='range')?'Проверьте даты: «с» не позже «по».':'Аналитика пока недоступна.'}
  catch(e){AN.err=e.net?'Нет связи.':'Аналитика пока недоступна.'}
  AN.loading=false;if(S.view==='an')paint();
}
async function showAnalytics(){closeOv();S.view='an';AN.data=null;paint();window.scrollTo(0,0);await loadAnalytics()}
function anMetric(label,val,pct,ok,open,sub){return '<div class="an-m"><span class="an-ml">'+label+'</span><span class="an-mv">'+val+(sub?'<small>'+sub+'</small>':'')+'</span>'+anPct(pct,ok,open)+'</div>'}
function anBlock(b,title,d){
  let h='<div class="card an-card"><h2>'+esc(title)+'</h2>';
  if(!b||(!b.days&&!b.revenue&&!b.invoices)){return h+'<p class="hint">Данных за этот период ещё нет.</p></div>'}
  const o=!!d.open,ok=b.clinic_complete,was=x=>(b.prev_days?'было '+x:'');
  h+='<div class="an-sec">Клиника</div>'
    +anMetric('Выручка',anRub(b.revenue),b.revenue_pct,ok,o,was(anRub(b.prev_revenue)))
    +anMetric('Счетов',anInt(b.invoices),b.invoices_pct,ok,o,was(anInt(b.prev_invoices)))
    +anMetric('Средний чек',anRub(b.avg_check),b.avg_check_pct,ok,o,b.prev_avg_check!=null?was(anRub(b.prev_avg_check)):'');
  const a=b.alt,al=anLabels(d).alt;
  if(a&&al&&!o)h+='<div class="an-alt">'+esc(al)+': выручка '+anPctTxt(a.revenue_pct,a.clinic_complete)+' · счетов '+anPctTxt(a.invoices_pct,a.clinic_complete)+' · чек '+anPctTxt(a.avg_check_pct,a.clinic_complete)+'</div>';
  h+='<div class="an-sec">Аптека <small>из отчётов</small></div>'+anMetric('Выручка',anRub(b.pharmacy),b.pharmacy_pct,b.pharmacy_complete,o,was(anRub(b.prev_pharmacy)));
  return h+'</div>';
}
function anDoctors(list,d){
  if(!list||!list.length)return '';
  const ok=d.network&&d.network.clinic_complete;
  return '<div class="card an-card"><h2>Врачи</h2>'+list.map(x=>'<div class="an-doc"><div class="an-dn">'+esc(x.name)+'</div><div class="an-dr"><b>'+anRub(x.revenue)+'</b> '+anPct(x.revenue_pct,ok,d.open)+'</div><div class="an-ds">счетов '+anInt(x.invoices)+'</div><div class="an-dc">Средний чек <b>'+anRub(x.avg_check)+'</b> · рост среднего чека '+anPct(x.avg_check_pct,ok,d.open)+'</div></div>').join('')+'</div>';
}
/* вид «Помесячно»: 12 месяцев года, у каждого выручка, счета, чек и тот же месяц прошлого года с %; будущие месяцы пустые */
function anMonths(list,d){
  if(!list||!list.length)return '';
  return '<div class="card an-card"><h2>По месяцам</h2>'+list.map(m=>{
    const name=AN_MON[(m.month||1)-1];
    if(m.empty)return '<div class="an-mon off"><b>'+name+'</b><span class="an-ms">ещё не наступил</span></div>';
    const ok=m.clinic_complete,f=anD(m.from),t=anD(m.to);
    return '<div class="an-mon"><div class="an-mh"><b>'+name+(m.partial?' <small>1–'+t.d+'</small>':'')+'</b>'+anPct(m.revenue_pct,ok,false)+'</div>'
      +'<div class="an-mr"><span>'+anRub(m.revenue)+'</span><small>прошлый год '+(m.prev_days?anRub(m.prev_revenue):'—')+'</small></div>'
      +'<div class="an-ms">счетов '+anInt(m.invoices)+' '+anPct(m.invoices_pct,ok,false)+' · чек '+anRub(m.avg_check)+' '+anPct(m.avg_check_pct,ok,false)+'</div></div>';
  }).join('')+'</div>';
}
function analyticsHtml(){
  let h='<button class="md-back" data-anact="home">‹ На главную</button><h1 class="screen-title">Аналитика</h1>';
  h+='<div class="chips">'+AN_PER.map(p=>'<button class="chip'+(AN.period===p[0]?' on':'')+'" data-anact="period" data-id="'+p[0]+'">'+p[1]+'</button>').join('')+'</div>';
  if(AN.period==='custom'){
    const c=AN.custom||{};
    h+='<div class="an-custom"><label>с<input type="date" id="an-from" value="'+esc(c.from||'')+'"></label><label>по<input type="date" id="an-to" value="'+esc(c.to||'')+'"></label><button class="go sm" data-anact="apply">Показать</button></div>';
  }
  const d=AN.data;
  if(AN.err)return h+'<p class="mute">'+esc(AN.err)+'</p>';
  if(!d)return h+'<p class="mute">'+(AN.period==='custom'&&!AN.custom?'Выберите две даты.':'Загрузка…')+'</p>';
  const L=anLabels(d),nav=AN.period!=='custom';
  h+='<div class="an-nav">'+(nav?'<button class="chip" data-anact="prev" aria-label="Назад">‹</button>':'<span></span>')+'<div class="an-pl"><b>'+esc(L.main)+'</b>'+(d.open?'<small>день не закрыт, процентов нет</small>':'<small>'+esc(L.cmp)+'</small>')+'</div>'+(nav?'<button class="chip" data-anact="next" aria-label="Вперёд"'+(d.can_next?'':' disabled')+'>›</button>':'<span></span>')+'</div>';
  if(d.period==='months'){h+=anMonths(d.months,d);h+=anDoctors(d.doctors,d);return h}
  h+=anBlock(d.network,'Вся сеть',d);
  (d.branches||[]).forEach(b=>{h+=anBlock(b,b.title,d)});
  h+=anDoctors(d.doctors,d);
  return h;
}
document.addEventListener('click',async ev=>{
  const el=ev.target.closest&&ev.target.closest('[data-anact]');if(!el||S.view!=='an')return;
  const a=el.dataset.anact;
  if(a==='home'){S.view='branch';render();window.scrollTo(0,0)}
  else if(a==='period'){AN.period=el.dataset.id;AN.anchor=null;AN.data=null;AN.err=null;paint();if(AN.period!=='custom'||AN.custom)await loadAnalytics()}
  else if(a==='apply'){const f=document.getElementById('an-from'),t=document.getElementById('an-to');if(!f||!t||!f.value||!t.value||f.value>t.value){AN.err='Проверьте даты: «с» не позже «по».';paint();return}AN.err=null;AN.custom={from:f.value,to:t.value};AN.data=null;paint();await loadAnalytics()}
  else if(a==='prev'||a==='next'){if(!AN.data||(a==='next'&&!AN.data.can_next))return;AN.anchor=anShift(AN.data,a==='next'?1:-1);AN.data=null;paint();await loadAnalytics()}
});
