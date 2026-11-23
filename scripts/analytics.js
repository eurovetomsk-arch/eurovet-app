'use strict';
/* ====== 2.0 · Экран «Аналитика» (К3, только руководитель) ======
   Открыл — и сразу понятно: сверху одна строка «что с чем сравниваем», «Итог сети» из трёх чисел (выручка, счета, средний чек),
   филиалы одной строкой (раскрываются), врачи списком по росту среднего чека. Цифра крупно, рядом ▲▼ % цветом, под ней мелко «было …».
   Все правила сравнения и полноты данных считает сервер (ev_analytics_overview, L24); здесь только показ.
   Нет данных для сравнения — серо «нет данных за прошлый период», без процентов. */
const AN={period:'day',anchor:null,custom:null,data:null,err:null,loading:false,docsOpen:false};
const AN_PER=[['day','День'],['week','Неделя'],['month','Месяц'],['months','Помесячно'],['year','Год'],['custom','Свой период']];
const AN_MON=['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const AN_GEN=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const AN_PRE=['январе','феврале','марте','апреле','мае','июне','июле','августе','сентябре','октябре','ноябре','декабре'];
const anOmskToday=()=>{try{return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Omsk'}).format(new Date())}catch(e){return new Date().toISOString().slice(0,10)}};
const anRub=n=>n==null?'—':Number(n).toLocaleString('ru-RU',{minimumFractionDigits:0,maximumFractionDigits:0})+' ₽';
const anInt=n=>n==null?'—':Number(n).toLocaleString('ru-RU');
const anD=s=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(s||''));return m?{y:+m[1],m:+m[2],d:+m[3]}:null};
const anLast=(y,m)=>new Date(Date.UTC(y,m,0)).getUTCDate();
const anDay=s=>{const x=anD(s);return x?x.d+' '+AN_GEN[x.m-1]:''};
/* отрезок словами: «1–23 ноября», «Ноябрь 2026», «2026», «1 января – 23 ноября» */
function anRange(from,to){
  const f=anD(from),t=anD(to);if(!f||!t)return '';
  if(f.y===t.y&&f.m===1&&f.d===1&&t.m===12&&t.d===31)return String(f.y);
  if(f.y===t.y&&f.m===t.m&&f.d===1&&t.d===anLast(t.y,t.m))return AN_MON[f.m-1]+' '+f.y;
  if(f.y===t.y&&f.m===t.m)return (f.d===t.d?String(f.d):f.d+'–'+t.d)+' '+AN_GEN[f.m-1];
  if(f.y===t.y)return f.d+' '+AN_GEN[f.m-1]+' – '+t.d+' '+AN_GEN[t.m-1];
  return anDay(from)+' '+f.y+' – '+anDay(to)+' '+t.y;
}
const anMonday=iso=>{const x=anD(iso),t=new Date(Date.UTC(x.y,x.m-1,x.d));const w=(t.getUTCDay()+6)%7;t.setUTCDate(t.getUTCDate()-w);return t.toISOString().slice(0,10)};
const anAdd=(iso,n)=>{const x=anD(iso),t=new Date(Date.UTC(x.y,x.m-1,x.d));t.setUTCDate(t.getUTCDate()+n);return t.toISOString().slice(0,10)};
/* одна понятная строка над экраном: что с чем сравниваем */
function anTitle(d){
  const p=d.period,part=!!d.partial,y=d.closed_through||'';
  if(p==='day'){
    if(d.open)return 'Сегодня, '+anDay(d.from)+' — день не закрыт, сравнения нет';
    return (d.from===y?'Вчера, ':'')+anDay(d.from)+', против '+anDay(d.prev_from);
  }
  if(p==='week'){
    const last=!part&&y&&d.from===anAdd(anMonday(anAdd(y,1)),-7);
    if(part)return 'Эта неделя, '+anRange(d.from,d.to)+', против тех же дней прошлой недели ('+anRange(d.prev_from,d.prev_to)+')';
    return (last?'Прошлая неделя ':'Неделя ')+anRange(d.from,d.to)+' против '+anRange(d.prev_from,d.prev_to);
  }
  if(p==='month'){
    const f=anD(d.from);
    return part?AN_MON[f.m-1]+', '+anRange(d.from,d.to)+', против тех же дней: '+anRange(d.prev_from,d.prev_to):anRange(d.from,d.to)+' против '+anRange(d.prev_from,d.prev_to);
  }
  if(p==='months'){const f=anD(d.from);return 'По месяцам '+f.y+' года против тех же месяцев '+(f.y-1)}
  if(p==='year'){const f=anD(d.from);return part?f.y+' год, '+anRange(d.from,d.to)+', против того же отрезка '+(f.y-1):f.y+' год против '+(f.y-1)}
  return 'С '+anDay(d.from)+' по '+anDay(d.to)+', против '+anRange(d.prev_from,d.prev_to);
}
/* мелкая вторая строка (если есть второе сравнение) */
function anAltTitle(d){
  if(d.period==='day'&&d.alt_from)return 'Тот же день прошлой недели: '+anDay(d.alt_from);
  if(d.period==='month'&&d.alt_from)return 'Тот же период прошлого года: '+anRange(d.alt_from,d.alt_to)+' '+anD(d.alt_from).y;
  return '';
}
/* процент: рост ▲ зелёный, падение ▼ красный; нет данных для сравнения — серо */
const anNoData='<span class="an-pct na">нет данных за прошлый период</span>';
function anPct(p,open){
  if(open)return '<span class="an-pct na">день не закрыт</span>';
  if(p==null)return anNoData;
  const n=Number(p),s=Math.abs(n).toLocaleString('ru-RU',{minimumFractionDigits:0,maximumFractionDigits:1});
  if(n>0)return '<span class="an-pct up">▲ +'+s+'%</span>';
  if(n<0)return '<span class="an-pct down">▼ −'+s+'%</span>';
  return '<span class="an-pct zero">0%</span>';
}
const anPctTxt=p=>p==null?'нет данных':(Number(p)>0?'▲ +':Number(p)<0?'▼ −':'')+Math.abs(Number(p)).toLocaleString('ru-RU',{minimumFractionDigits:0,maximumFractionDigits:1})+'%';
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
/* строка показателя: крупная цифра, рядом ▲▼ %, под ней мелко «было …» */
function anRow(label,val,pct,prev,open){
  const was=(prev!=null&&pct!=null&&!open)?'<small>было '+prev+'</small>':'';
  return '<div class="an-m"><span class="an-ml">'+label+'</span><span class="an-mv">'+val+was+'</span>'+anPct(pct,open)+'</div>';
}
function anHasData(b){return b&&(b.days||b.revenue||b.invoices)}
/* «Итог сети»: три числа */
function anSummary(b,d){
  let h='<div class="card an-card"><h2>Итог сети</h2>';
  if(!anHasData(b))return h+'<p class="an-nodata">Данных за этот период ещё нет.</p></div>';
  const o=!!d.open;
  h+=anRow('Выручка',anRub(b.revenue),b.revenue_pct,anRub(b.prev_revenue),o)+anRow('Счетов',anInt(b.invoices),b.invoices_pct,anInt(b.prev_invoices),o)+anRow('Средний чек',anRub(b.avg_check),b.avg_check_pct,b.prev_avg_check!=null?anRub(b.prev_avg_check):null,o);
  const a=b.alt,al=anAltTitle(d);
  if(a&&al&&!o)h+='<div class="an-alt">'+esc(al)+': выручка '+anPctTxt(a.revenue_pct)+' · счетов '+anPctTxt(a.invoices_pct)+' · чек '+anPctTxt(a.avg_check_pct)+'</div>';
  h+='<div class="an-ph"><span>Аптека <small>по отчётам</small></span><span class="an-phv">'+anRub(b.pharmacy)+'</span>'+anPct(b.pharmacy_pct,o)+'</div>';
  return h+'</div>';
}
/* филиал одной строкой «выручка · чек · %», раскрывается нажатием */
function anBranch(b,d){
  const o=!!d.open;
  if(!anHasData(b))return '<details class="an-br"><summary><b>'+esc(b.title)+'</b><span class="an-sline">нет данных</span></summary></details>';
  const line=anRub(b.revenue)+' · чек '+(b.avg_check!=null?anRub(b.avg_check):'—')+' · '+(o?'<span class="an-pct na">день не закрыт</span>':anPct(b.revenue_pct,false));
  return '<details class="an-br"><summary><b>'+esc(b.title)+'</b><span class="an-sline">'+line+'</span></summary><div class="an-brd">'
    +anRow('Выручка',anRub(b.revenue),b.revenue_pct,anRub(b.prev_revenue),o)+anRow('Счетов',anInt(b.invoices),b.invoices_pct,anInt(b.prev_invoices),o)+anRow('Средний чек',anRub(b.avg_check),b.avg_check_pct,b.prev_avg_check!=null?anRub(b.prev_avg_check):null,o)
    +'<div class="an-ph"><span>Аптека <small>по отчётам</small></span><span class="an-phv">'+anRub(b.pharmacy)+'</span>'+anPct(b.pharmacy_pct,o)+'</div></div></details>';
}
/* врачи: одна строка на каждого «Имя — чек X ▲ +8%», по росту среднего чека; в «Месяц», «Год», «Помесячно» и «Свой период» свёрнуты под «Врачи» */
const anDocsMain=p=>p==='day'||p==='week';
function anDocList(list,d){
  const o=!!d.open,rows=list.slice().sort((a,b)=>{const x=a.avg_check_pct==null?-Infinity:Number(a.avg_check_pct),y=b.avg_check_pct==null?-Infinity:Number(b.avg_check_pct);return y-x||Number(b.revenue)-Number(a.revenue)});
  return '<div class="card an-card an-docs"><h2>Врачи <small>по росту среднего чека</small></h2>'+rows.map(x=>'<div class="an-doc"><div class="an-dl"><b>'+esc(x.name)+'</b> — чек '+anRub(x.avg_check)+' '+anPct(x.avg_check_pct,o)+'</div><div class="an-ds">выручка '+anRub(x.revenue)+' · счетов '+anInt(x.invoices)+'</div></div>').join('')+'</div>';
}
function anDoctors(list,d){
  if(!list||!list.length)return '';
  if(anDocsMain(d.period))return anDocList(list,d);
  const btn='<div class="an-docwrap"><button class="chip an-docbtn" data-anact="docs">'+(AN.docsOpen?'Врачи ▴':'Врачи ▾')+' <small>'+list.length+'</small></button></div>';
  return btn+(AN.docsOpen?anDocList(list,d):'');
}
/* вид «Помесячно»: 12 месяцев года, у каждого выручка, чек, счета, тот же месяц прошлого года и % */
function anMonths(list){
  if(!list||!list.length)return '';
  return '<div class="card an-card"><h2>По месяцам</h2>'+list.map(m=>{
    const name=AN_MON[(m.month||1)-1];
    if(m.empty)return '<div class="an-mon off"><b>'+name+'</b><span class="an-ms">ещё не наступил</span></div>';
    const t=anD(m.to),pct=anPct(m.revenue_pct,false);
    return '<div class="an-mon"><div class="an-mh"><b>'+name+(m.partial?' <small>1–'+t.d+'</small>':'')+'</b>'+pct+'</div>'
      +'<div class="an-mr"><span>'+anRub(m.revenue)+'</span><small>'+(m.revenue_pct!=null?'было '+anRub(m.prev_revenue)+' год назад':'')+'</small></div>'
      +'<div class="an-ms">счетов '+anInt(m.invoices)+' '+(m.invoices_pct!=null?anPct(m.invoices_pct,false):'')+' · чек '+anRub(m.avg_check)+' '+(m.avg_check_pct!=null?anPct(m.avg_check_pct,false):'')+'</div></div>';
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
  const nav=AN.period!=='custom';
  h+='<div class="an-nav">'+(nav?'<button class="chip" data-anact="prev" aria-label="Назад">‹</button>':'<span></span>')+'<div class="an-pl"><b>'+esc(anTitle(d))+'</b>'+(anAltTitle(d)&&!d.open?'<small>'+esc(anAltTitle(d))+'</small>':'')+'</div>'+(nav?'<button class="chip" data-anact="next" aria-label="Вперёд"'+(d.can_next?'':' disabled')+'>›</button>':'<span></span>')+'</div>';
  if(d.period==='months'){h+=anMonths(d.months);h+=anDoctors(d.doctors,d);return h}
  h+=anSummary(d.network,d);
  if((d.branches||[]).length)h+='<div class="card an-card an-brs"><h2>Филиалы</h2>'+d.branches.map(b=>anBranch(b,d)).join('')+'</div>';
  h+=anDoctors(d.doctors,d);
  return h;
}
document.addEventListener('click',async ev=>{
  const el=ev.target.closest&&ev.target.closest('[data-anact]');if(!el||S.view!=='an')return;
  const a=el.dataset.anact;
  if(a==='home'){S.view='branch';render();window.scrollTo(0,0)}
  else if(a==='docs'){AN.docsOpen=!AN.docsOpen;paint()}
  else if(a==='period'){AN.period=el.dataset.id;AN.anchor=null;AN.data=null;AN.err=null;AN.docsOpen=false;paint();if(AN.period!=='custom'||AN.custom)await loadAnalytics()}
  else if(a==='apply'){const f=document.getElementById('an-from'),t=document.getElementById('an-to');if(!f||!t||!f.value||!t.value||f.value>t.value){AN.err='Проверьте даты: «с» не позже «по».';paint();return}AN.err=null;AN.custom={from:f.value,to:t.value};AN.data=null;paint();await loadAnalytics()}
  else if(a==='prev'||a==='next'){if(!AN.data||(a==='next'&&!AN.data.can_next))return;AN.anchor=anShift(AN.data,a==='next'?1:-1);AN.data=null;paint();await loadAnalytics()}
});
