'use strict';
/* ====== 1.71 График: «Мои смены» и «Кто где». Отдельно от финансов: читает только ev_whos_where, в ответе нет ни денег, ни часов ====== */
const SCH_B={marksa:['Маркса, 45','Маркса','Марк.'], '70let':['70 лет Октября, 20','70 лет','70 л.'],pereleta:['Перелёта, 19','Перелёта','Перел.'],cc:['Колл-центр','КЦ','КЦ']};
const SCH_BO=['marksa','70let','pereleta','cc'];
const SCH_R={admin:'Администратор',doctor:'Врач',assistant:'Ассистент',callcenter:'Колл-центр'};
const SCH_RO={admin:0,doctor:1,assistant:2,callcenter:3};
const SCH_AT={clinical:'клинический',tech:'технический'}; // тип ассистента приходит с сервера: ev_whos_where → atype (из справочника ролей ev_person_roles на дату смены)
const schRole=r=>{let t=SCH_R[r.slot]||'';if(r.slot==='assistant'&&SCH_AT[r.atype])t+=' '+SCH_AT[r.atype];return t};
const schBranchColor=k=>({marksa:'var(--ev-marksa)', '70let':'var(--ev-70let)',pereleta:'var(--ev-pereleta)',cc:'var(--ev-role-callcenter)'}[k]||'var(--ev-role-callcenter)');
const schRoleColor=k=>({admin:'var(--ev-role-admin)',doctor:'var(--ev-role-doctor)',assistant:'var(--ev-role-assistant)',callcenter:'var(--ev-role-callcenter)'}[k]||'var(--ev-role-callcenter)');
const schShort=v=>{const a=String(v||'').trim().split(/\s+/).filter(Boolean);if(a.length<2)return String(v||'');const ini=a.slice(1).map(x=>(x.replace(/[^А-ЯЁA-Z]/gi,'')[0]||'').toUpperCase()).filter(Boolean).slice(0,2);return a[0]+(ini.length?' '+ini.map(x=>x+'.').join(' '):'')};
const schInitials=v=>{const a=String(v||'').trim().split(/\s+/).filter(Boolean),tail=a.slice(1).map(x=>(x.replace(/[^А-ЯЁA-Z]/gi,'')[0]||'').toUpperCase()).filter(Boolean);return ((tail[0]||a[0]?.[0]||'')+(tail[1]||a[0]?.[1]||'')).slice(0,2)};
const schPill=r=>'<span class="role-pill" style="background:'+schRoleColor(r.slot)+'">'+esc(schRole(r))+'</span>';
function schCcToday(rows){const t=omskToday(),n=rows.filter(r=>r.date===t&&schBk(r)==='cc').map(r=>r.name);
  return '<section class="card quiet"><div class="cc"><span><i class="rdot" style="background:'+schRoleColor('callcenter')+'"></i> Колл-центр сегодня: <b>'+(n.length?esc(n.map(schShort).join(', ')):'в графике никого нет')+'</b></span></div></section>'}
const SCH_MN=['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const SCH_DW=['пн','вт','ср','чт','пт','сб','вс'];
const schBk=r=>r.branch||'cc';
function schEnsure(){if(!S.sch){const t=omskToday();S.sch={m:t.slice(0,7),tab:'my',day:t,flt:'',data:{},err:null,load:false,demo:false}}return S.sch}
const schLast=m=>{const p=m.split('-').map(Number);return new Date(Date.UTC(p[0],p[1],0)).getUTCDate()};
const schDow=iso=>{const p=iso.split('-').map(Number);return (new Date(Date.UTC(p[0],p[1]-1,p[2])).getUTCDay()+6)%7};
const schShift=(m,n)=>{const p=m.split('-').map(Number),d=new Date(Date.UTC(p[0],p[1]-1+n,1));return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')};
const schTitle=m=>SCH_MN[Number(m.slice(5,7))-1]+' '+m.slice(0,4);
function schDemo(m){ // выдуманные данные для просмотра внешнего вида (только руководитель)
  const out=[],n=schLast(m);
  for(let d=1;d<=n;d++){const dt=m+'-'+String(d).padStart(2,'0');
    out.push({date:dt,branch:'marksa',slot:'admin',name:'Пример А'+(d%3),mine:d%3===0});
    out.push({date:dt,branch:'marksa',slot:'doctor',name:'Пример врач '+(d%4),mine:false});
    out.push({date:dt,branch:'marksa',slot:'assistant',name:'Пример ассистент '+(d%2),mine:false});
    out.push({date:dt,branch:'pereleta',slot:'admin',name:'Пример А'+((d+1)%3),mine:false});
    out.push({date:dt,branch:'pereleta',slot:'doctor',name:'Пример врач '+((d+1)%4),mine:false});
    if(d%4)out.push({date:dt,branch:'70let',slot:'doctor',name:'Пример врач 70',mine:d%5===0});
    out.push({date:dt,branch:'70let',slot:'admin',name:'Пример А'+((d+2)%3),mine:false});
    out.push({date:dt,branch:null,slot:'callcenter',name:'Пример оператор '+(d%3),mine:false});}
  return out}
const schRows=m=>{const s=schEnsure();return s.demo?schDemo(m):(s.data[m]||null)};
async function showSched(){closeOv();schEnsure();S.view='sched';paint();window.scrollTo(0,0);loadSched(S.sch.m)}
async function loadSched(m){
  const s=schEnsure();s.load=true;s.err=null;paint();
  try{
    const r=await rpc('ev_whos_where',{p_token:S.token,p_from:m+'-01',p_to:m+'-'+String(schLast(m)).padStart(2,'0')},12000);
    if(r&&r.error==='session'){S.token=null;LS.del('ev_token');S.view='login';toast('Сессия закончилась. Войдите заново.');render();loadLoginList().then(render);return}
    if(!r||!r.ok)s.err=r&&r.error==='forbidden'?'График для вашей роли недоступен.':'Не удалось загрузить';else s.data[m]=r.shifts||[];
  }catch(e){s.err=e.net?'Нет связи.':'Ошибка сервера.'}
  s.load=false;if(S.view==='sched')paint();
}
function schCal(m,cell){
  const n=schLast(m),lead=schDow(m+'-01'),today=omskToday();let h=SCH_DW.map(x=>'<div class="h">'+x+'</div>').join('');
  const pm=schShift(m,-1),pn=schLast(pm);
  for(let i=lead-1;i>=0;i--)h+='<div class="d o">'+(pn-i)+'</div>';
  for(let d=1;d<=n;d++)h+=cell(m+'-'+String(d).padStart(2,'0'),d,today);
  const tail=(7-(lead+n)%7)%7;for(let j=1;j<=tail;j++)h+='<div class="d o">'+j+'</div>';
  return '<div class="cal">'+h+'</div>'}
function schHead(s){
  return '<div class="period"><button class="pn" data-act="schmon" data-n="-1" aria-label="Предыдущий месяц">‹</button><div class="pc"><b>'+schTitle(s.m)+'</b><small>график опубликован</small></div><button class="pn" data-act="schmon" data-n="1" aria-label="Следующий месяц">›</button></div>'
   +'<div class="dseg"><button class="'+(s.tab==='my'?'on':'')+'" data-act="schtab" data-t="my">Мои смены</button><button class="'+(s.tab==='all'?'on':'')+'" data-act="schtab" data-t="all">Кто где</button></div>'}
/* 2.0: «Мой день» — смена, филиал, с кем работаю; записи пациентов — для врачей (окно 7 дней, снимок Vetmanager) */
function schMyDayHtml(s,rows,mine,dt){
  s.pp=[];
  const SLOT={admin:'администратор',doctor:'врач',assistant:'ассистент',callcenter:'колл-центр'};
  let h='<div style="margin:12px 0 4px;padding-top:10px;border-top:1px solid var(--line)"><h3 style="margin:0">Мой день · '+ruDate(dt)+'</h3>';
  [...new Set(mine.map(r=>r.branch||'cc'))].forEach(k=>{
    const my=mine.filter(r=>(r.branch||'cc')===k),peers=rows.filter(r=>r.date===dt&&(r.branch||'cc')===k&&!r.mine);
    h+='<div class="person"><div class="srow"><span><b>'+esc(k==='cc'?'Колл-центр':SCH_B[k]?SCH_B[k][0]:k)+'</b><br><small>'+esc(my.map(r=>SLOT[r.slot]||r.slot).join(', '))+'</small></span></div>'
      +(peers.length?'<p class="hint" style="margin:6px 0 2px">С вами:</p>'+peers.map(r=>'<'+(r.full?'button':'div')+' class="whorow"'+(r.full?' data-act="schp" data-i="'+(s.pp.push(r)-1)+'"':'')+'><i class="rdot" style="background:'+schRoleColor(r.slot)+'"></i><span class="wn"><b>'+esc(schNameOne(r.full||r.name))+'</b><small>'+esc(schRole(r))+'</small></span></'+(r.full?'button':'div')+'>').join(''):'<p class="hint" style="margin:4px 0 0">В графике на этот день больше никого.</p>')+'</div>';
  });
  return h+'<p class="hint">Записи пациентов на день показываются врачам в ближайшие 7 дней.</p></div>';
}
function schMy(s,rows){
  const today=omskToday(),mine=rows.filter(r=>r.mine);
  const cnt={};mine.forEach(r=>{const k=schBk(r);cnt[k]=(cnt[k]||0)+1});
  const by={};mine.forEach(r=>{(by[r.date]=by[r.date]||[]).push(r)});
  let h='<section class="card"><div class="stats"><div class="stat"><b>'+mine.length+'</b><small>смен в месяце</small></div><div class="stat"><b>'+mine.filter(r=>r.date>=today).length+'</b><small>ещё впереди</small></div></div>';
  h+='<div class="leg">'+SCH_BO.filter(k=>k!=='cc'||cnt[k]).map(k=>'<span><i style="background:'+schBranchColor(k)+'"></i>'+esc(SCH_B[k][0])+(cnt[k]?' · '+cnt[k]:'')+'</span>').join('')+'</div>'+(mine.length?'':'<p class="hint">В этом месяце у вас нет смен</p>')+'</section>';
  h+='<section class="card"><div class="chead"><h2>Мои смены</h2><span class="tag">'+esc(SCH_MN[Number(s.m.slice(5))-1])+'</span></div>';
  h+=schCal(s.m,(dt,d,t)=>{const l=by[dt];const cl='d'+(dt===t?' today':'')+(s.apptDay===dt?' sel':'');
    if(!l)return '<div class="'+cl+'">'+d+'</div>';
    const ks=[...new Set(l.map(schBk))];
    const tap=true,tag='button',act=' data-act="schappt" data-d="'+dt+'" aria-label="Мой день '+ruDate(dt)+'"'; /* 2.0: нажатие на свой день работает у всех ролей */
    if(ks.length===1)return '<'+tag+' class="'+cl+' f" style="background:'+schBranchColor(ks[0])+'"'+act+'>'+d+'<small>'+esc(SCH_B[ks[0]][2])+'</small></'+tag+'>';
    return '<'+tag+' class="'+cl+'"'+act+'>'+d+'<span class="dots">'+ks.map(k=>'<i style="background:'+schBranchColor(k)+'"></i>').join('')+'</span></'+tag+'>'});
  h+='<p class="hint" style="margin:12px 0 0">Нажмите на свою смену — откроется ваш день: филиал, с кем работаете, у врачей — записи пациентов.</p>';
  if(s.apptDay&&by[s.apptDay]){
    if(apptAllowed()&&apptInWindow(s.apptDay))h+=appointmentsHtml(s.apptDay);
    else h+=schMyDayHtml(s,rows,by[s.apptDay],s.apptDay);
  }
  h+='</section>';
  const up=mine.filter(r=>r.date>=today).sort((a,b)=>a.date<b.date?-1:1);
  if(up.length)h+='<section class="card"><div class="chead"><h2>Ближайшие смены</h2></div>'+up.map(r=>{const k=schBk(r),dw=SCH_DW[schDow(r.date)];return '<div class="srow schedule"><span class="sbar" style="background:'+schBranchColor(k)+'"></span><span class="t"><b>'+(r.date===today?'Сегодня, ':'')+dw+', '+ruDate(r.date)+'</b><small>'+esc(SCH_B[k][0])+'</small></span>'+schPill(r)+'</div>'}).join('')+'</section>';
  return h+schCcToday(rows)}
/* 2.0 · «Кто где» (замечание Михаила 17.11, п.11): день сверху (Сегодня / Завтра / Выбрать день), карточка на филиал с цветом филиала,
   внутри Врачи / Ассистенты / Администраторы; строка: круглый аватар 40 px цвета роли, «Фамилия И.О.» в одну строку, роль мелко. */
const schNbsp=' ';
const schNameOne=v=>{const a=String(v||'').trim().split(/\s+/).filter(Boolean);if(a.length<2)return String(v||'');const ini=a.slice(1).map(x=>(x.replace(/[^А-ЯЁA-Z]/gi,'')[0]||'').toUpperCase()).filter(Boolean).slice(0,2);return a[0]+(ini.length?schNbsp+ini.map(x=>x+'.').join(''):'')};
const SCH_GRP=[['doctor','Врачи'],['assistant','Ассистенты'],['admin','Администраторы'],['callcenter','Сотрудники колл-центра']];
function schAll(s,rows){
  const today=omskToday(),tomorrow=addDays(today,1),f=s.flt;
  let h='<div class="dayseg" role="group" aria-label="День">'
    +[[today,'Сегодня'],[tomorrow,'Завтра']].map(x=>'<button class="'+(s.day===x[0]?'on':'')+'" data-act="schday" data-d="'+x[0]+'">'+x[1]+'</button>').join('')
    +'<button class="'+(s.day!==today&&s.day!==tomorrow?'on':'')+'" data-act="schcal">Выбрать день '+(s.calOpen?'▴':'▾')+'</button></div>';
  if(s.calOpen){
    const vis=rows.filter(r=>!f||schBk(r)===f),by={};vis.forEach(r=>{(by[r.date]=by[r.date]||[]).push(r)});
    h+='<section class="card"><div class="chead"><h2>'+esc(SCH_MN[Number(s.m.slice(5))-1])+'</h2></div>'
      +schCal(s.m,(dt,d,t)=>{const l=by[dt]||[];const c={};l.forEach(r=>{const k=schBk(r);c[k]=(c[k]||0)+1});
        const dots=SCH_BO.filter(k=>c[k]&&(k!=='cc'||f==='cc')).map(k=>'<i style="background:'+schBranchColor(k)+'"></i>').join('');
        return '<button class="d'+(dt===t?' today':'')+(dt===s.day?' sel':'')+'" data-act="schday" data-d="'+dt+'" aria-label="'+ruDate(dt)+'">'+d+'<span class="dots">'+dots+'</span></button>'})+'</section>';
  }
  h+='<div class="fchips">'+[['','Все'],['marksa','Маркса'],['70let','70 лет'],['pereleta','Перелёта'],['cc','Колл-центр']].map(x=>'<button class="pchip'+(f===x[0]?' on':'')+'" data-act="schflt" data-f="'+x[0]+'">'+x[1]+'</button>').join('')+'</div>';
  s.pp=[];
  const dayRows=(s.data[s.day.slice(0,7)]||(s.demo?schDemo(s.day.slice(0,7)):null));
  const dl=(dayRows||[]).filter(r=>r.date===s.day);
  const dw=SCH_DW[schDow(s.day)];
  const DWL=['Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье'],MG=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'],dp=s.day.split('-').map(Number);
  h+='<div class="dayhead"><h2>'+DWL[schDow(s.day)]+', '+dp[2]+' '+MG[dp[1]-1]+'</h2>'+(s.day===today?'<span class="tag">сегодня</span>':s.day===tomorrow?'<span class="tag">завтра</span>':'')+'</div>';
  if(!dayRows)return h+'<section class="card"><p class="hint">Загружаем график этого месяца…</p></section>';
  SCH_BO.filter(k=>!f||k===f).forEach(k=>{
    const rr=dl.filter(r=>schBk(r)===k);
    if(k==='cc'&&!rr.length)return;
    const col=schBranchColor(k);
    h+='<section class="card whocard" style="border-top:5px solid '+col+'"><div class="whohead"><i style="background:'+col+'"></i><h3>'+esc(SCH_B[k][0])+'</h3></div>';
    if(!rr.length)h+='<div class="empty">В этот день в графике никого нет</div>';
    SCH_GRP.forEach(g=>{
      const gr=rr.filter(r=>r.slot===g[0]).sort((a,b)=>(a.name<b.name?-1:1));
      if(k==='cc'&&g[0]!=='callcenter')return;if(k!=='cc'&&g[0]==='callcenter')return;
      if(!gr.length){if(g[0]==='doctor'&&k!=='cc'&&rr.length)h+='<div class="whogrp">'+g[1]+'</div><div class="empty calm">'+(k==='70let'||true?'Врача сегодня нет':'')+'</div>';return}
      h+='<div class="whogrp">'+g[1]+'</div>'+gr.map(r=>'<'+(r.full?'button':'div')+' class="whorow'+(r.mine?' me':'')+'"'+(r.full?' data-act="schp" data-i="'+(s.pp.push(r)-1)+'"':'')+'><i class="rdot" style="background:'+schRoleColor(r.slot)+'"></i><span class="wn"><b>'+esc(schNameOne(r.full||r.name))+'</b><small>'+esc(schRole(r))+(r.mine?' · это вы':'')+'</small></span></'+(r.full?'button':'div')+'>').join('');
    });
    h+='</section>';
  });
  if(!dl.length)h+='<section class="card"><p class="hint">На этот день график не опубликован или в нём никого нет.</p></section>';
  return h}
function schedHtml(){
  const s=schEnsure(),rows=schRows(s.m);
  let h=(S.person?'<p class="hello">'+esc(stageGreeting(S.person))+'</p>':'')+'<h1 class="screen-title">График</h1>'+schHead(s);
  if(isHead())h+='<button class="btn sec small" data-act="go" data-v="branch" style="margin:0 0 12px">← На главную</button>';
  if(s.demo)h+='<p class="hint" style="background:var(--warnbg);color:var(--warn);border-radius:10px;padding:8px 10px">ПРИМЕР с выдуманными данными. Показывается только вам, настоящий график не загружен. <button class="pill" data-act="schdemo">Выключить пример</button></p>';
  if(s.load&&!rows)h+='<section class="card"><p class="hint">Загружаем…</p></section>';
  else if(s.err&&!rows)h+='<section class="card"><p class="hint" style="color:var(--bad)">'+esc(s.err)+'</p><button class="btn sec" data-act="schretry">Повторить</button></section>';
  else if(!rows||!rows.length){h+='<section class="card"><p class="hint">График на '+schTitle(s.m).toLowerCase()+' ещё не опубликован.</p>';if(isHead())h+='<button class="btn sec" data-act="schdemo">Показать пример (выдуманные данные)</button>';h+='</section>'}
  else h+=s.tab==='my'?schMy(s,rows):schAll(s,rows);
  return h}
