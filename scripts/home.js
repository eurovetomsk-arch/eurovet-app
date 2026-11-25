'use strict';
function homeTab(){const t=S.homeTab||LS.get('ev_htab');return t==='cc'?'cc':'adm'}
function homeTabs(){const t=homeTab();return '<div class="chips tabs" style="margin:0 0 10px">'+[['adm','Администраторы'],['cc','Колл-центр']].map(x=>'<button class="chip'+(t===x[0]?' on':'')+'" data-act="htab" data-t="'+x[0]+'">'+x[1]+'</button>').join('')+'</div>'}
function stageGreetingWord(h=(new Date()).getHours()){return h>=5&&h<12?'Доброе утро':h>=12&&h<17?'Добрый день':h>=17&&h<23?'Добрый вечер':'Здравствуйте';}
function stageGreetingName(p){
  const full=String(p?.full_name||p?.name||'').trim(),a=full.split(/\s+/).filter(Boolean);
  if(a.length>=3)return a[1]+' '+a[2];
  /* c20: «Имя Отчество» только из полного ФИО в 3 слова; из 2 слов (или только короткого имени) приветствие без имени */
  return '';
}
function stageGreeting(p){const n=stageGreetingName(p);return stageGreetingWord()+(n?', '+n:'');}
function stageRole(p){
  const labels=UI2.roleLabels||{};
  const rs=personRoles(p);if(rs.includes('head'))return labels.head||'Руководитель'; /* 2.0: у руководителя только «Руководитель» */
  return rs.map(r=>labels[r]||r).join(' · ');
}

const HOME_WHO={key:'',loading:false,rows:null,error:null};
function homeWhoKey(){return String(S.token||'')+'|'+omskToday()}
async function loadHomeWho(){
  const key=homeWhoKey();
  if(!S.token||HOME_WHO.loading||(HOME_WHO.key===key&&(HOME_WHO.rows||HOME_WHO.error)))return;
  HOME_WHO.key=key;HOME_WHO.loading=true;HOME_WHO.rows=null;HOME_WHO.error=null;
  try{
    const r=await rpc('ev_whos_where',{p_token:S.token,p_from:omskToday(),p_to:omskToday()},8000);
    if(!r||!r.ok)HOME_WHO.error='Сегодняшняя смена пока не загрузилась.';
    else HOME_WHO.rows=Array.isArray(r.shifts)?r.shifts:(Array.isArray(r.rows)?r.rows:[]); /* 2.0: сервер отдаёт shifts */
  }catch(e){HOME_WHO.error=e.net?'Нет связи: сегодняшняя смена пока не загрузилась.':'Сегодняшняя смена пока не загрузилась.'}
  HOME_WHO.loading=false;if(S.view==='branch')paint();
}
function homeBranchTitle(id){
  const b=BRANCHES.find(x=>String(x.id)===String(id));
  return b?b.title.replace(/,\s*\d+$/,''):String(id||'филиале');
}
/* 2.0, п.15: у колл-центра две разные вещи — ГРАФИК (плановые дни) и ОТМЕТКА ВЫХОДА (от неё начисляется зарплата) */
const CC_TODAY={key:'',loading:false,r:null,err:null};
async function loadCCToday(force){
  const key=String(S.token||'')+'|'+omskToday();
  if(!S.token||CC_TODAY.loading||(!force&&CC_TODAY.key===key&&(CC_TODAY.r||CC_TODAY.err)))return;
  CC_TODAY.key=key;CC_TODAY.loading=true;CC_TODAY.err=null;
  try{const r=await rpc('ev_cc_today',{p_token:S.token},8000);if(r&&r.ok)CC_TODAY.r=r;else CC_TODAY.err='Не удалось загрузить отметку.'}
  catch(e){CC_TODAY.err=e.net?'Нет связи: отметка пока не загрузилась.':'Не удалось загрузить отметку.'}
  CC_TODAY.loading=false;if(S.view==='branch')paint();
}
function ccMarkHtml(){
  const c=CC_TODAY,tm=t=>{try{return new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Omsk',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(t))}catch(e){return ''}};
  if(c.loading&&!c.r)return '<div class="glass ui2-today"><span class="pin">⌛</span><div>Загружаю отметку…</div></div>';
  if(!c.r)return '<div class="glass ui2-today calm"><span class="pin">○</span><div>'+esc(c.err||'Отметка пока недоступна.')+'</div></div>';
  if(c.r.me)return '<div class="glass ui2-markdone"><span class="pin">✓</span><div><b>Отмечено сегодня в '+esc(tm(c.r.marked_at))+' ✓</b><br><small>От отметки начисляется зарплата за день.</small></div><button class="btn sec small" data-act="ccmark" data-dt="'+omskToday()+'" data-on="0">Снять</button></div>';
  if(Number(c.r.ops||0)>=2)return '<div class="chk warn"><i>!</i><div>На сегодня уже отмечены два оператора: '+esc((c.r.others||[]).join(', '))+'</div></div>';
  return '<button class="btn big ui2-markbtn" data-act="ccmark" data-dt="'+omskToday()+'" data-on="1">Отметить: я сегодня работаю</button><p class="hint" style="margin:6px 4px 0">Отметка — не то же самое, что график: от неё начисляется зарплата.</p>';
}
/* 2.0, п.21: человек с двумя ролями экрана — администратор + колл-центр — один экран: строка состояния обеих ролей, «Отметить» в блоке «Работа» */
const isAdminCC=()=>!isHead()&&isCC()&&hasRole('admin');
function bothTodayHtml(){
  const rows=HOME_WHO.rows,pid=String(S.person?.id??S.person?.person_id??''),c=CC_TODAY,tm=t=>{try{return new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Omsk',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(t))}catch(e){return ''}};
  const cc=c.r?(c.r.me?'отмечено сегодня в '+esc(tm(c.r.marked_at))+' ✓':'смена не отмечена'):(c.loading?'загружаю…':'отметка пока недоступна');
  const mine=(rows||[]).find(r=>r&&r.slot==='admin'&&((r.mine===true)||String(r.person_id??r.id??'')===pid));
  const adm=HOME_WHO.error?'смена пока не загрузилась':!rows?'загружаю…':mine?('сегодня на <b>'+esc(homeBranchTitle(mine.branch||mine.branch_id))+'</b>'):'выберите филиал';
  return '<div class="glass ui2-today"><span class="pin">📍</span><div><b>Колл-центр:</b> '+cc+'<br><b>Администратор:</b> '+adm+'</div></div>';
}
function homeTodayHtml(){
  const rows=HOME_WHO.rows;
  if(HOME_WHO.loading||(!rows&&!HOME_WHO.error))return '<div class="glass ui2-today"><span class="pin">⌛</span><div>Загружаю сегодняшнюю смену…</div></div>';
  if(HOME_WHO.error)return '<div class="glass ui2-today calm"><span class="pin">○</span><div>'+esc(HOME_WHO.error)+'</div></div>';
  const pid=String(S.person?.id??S.person?.person_id??'');
  const mine=(rows||[]).find(r=>r&&((r.mine===true)||String(r.person_id??r.id??'')===pid));
  if(isCC()&&!isHead()){return '<div class="glass ui2-today"><span class="pin">📅</span><div><b>По графику сегодня:</b> '+(mine?'вы в колл-центре':'вас в графике нет')+'</div></div>'+ccMarkHtml()}
  if(!mine)return '<div class="glass ui2-today"><span class="pin">📍</span><div>На сегодня ваша смена в графике не отмечена.</div></div>';
  const branch=mine.branch||mine.branch_id||mine.clinic||mine.clinic_id;
  const start=mine.start||mine.time_from||mine.from||'',end=mine.end||mine.time_to||mine.to||'';
  const peers=(rows||[]).filter(r=>r!==mine&&String(r.branch||r.branch_id||r.clinic||r.clinic_id||'')===String(branch||'')).map(r=>r.short_name||r.name||r.full_name).filter(Boolean).slice(0,3);
  /* 2.0: у смены колл-центра нет филиала — «Сегодня у вас смена в колл-центре» */
  let line=(!branch&&mine.slot==='callcenter')?'Сегодня у вас смена <b>в колл-центре</b>':'Сегодня вы на <b>'+esc(homeBranchTitle(branch))+'</b>'+(start&&end?', '+esc(start)+'–'+esc(end):'')+'.';
  if(peers.length)line+='<br>С вами: '+peers.map(n=>esc(String(n).trim().replace(/\s+/g,' ').replace(/\.?$/,'.'))).join(', ');
  return '<div class="glass ui2-today"><span class="pin">📍</span><div>'+line+'</div></div>';
}
function headTodayHtml(){
  const d=S.day;
  if(!d||d.date!==omskToday())return '<div class="glass ui2-today"><span class="pin">⌛</span><div>Загружаю статус отчётов…</div></div>';
  const list=Array.isArray(d.list)?d.list:[],done=list.filter(x=>x.submitted).length,waiting=list.filter(x=>!x.submitted).map(x=>brTitle(x.branch));
  /* 2.0, п.10: строка кликабельна → три филиала со статусом → нажал на филиал → отчёт. До 20:00 «0 из 3» не тревожит. */
  const hm=new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Omsk',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date()),late=hm>='22:00'&&waiting.length,early=hm<'20:00'&&waiting.length;
  const txt=early?'<b>Отчёты сегодня: '+done+' из '+list.length+'</b><br>Ещё идёт день — отчёты сдают вечером':'<b>Отчёты сегодня: '+done+' из '+list.length+'.</b><br>'+(waiting.length?(late?'Не сдан к 22:00: ':'Ждём: ')+waiting.map(esc).join(', '):'Все филиалы сдали отчёты');
  return '<button class="glass ui2-today'+(late?' bad':'')+'" data-act="repstatus"><span class="pin">'+(late?'!':early?'☀':'✓')+'</span><div>'+txt+' ›</div></button>';
}
function repStatusOverlay(){
  const d=S.day,today=omskToday();if(!d||d.date!==today){toast('Статус отчётов ещё загружается');return}
  const flags=(S.ctl||[]).filter(f=>String(f.date||'')===today&&!f.accepted&&f.code!=='vm_not_checked');
  const tm=t=>{try{return new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Omsk',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(t))}catch(e){return ''}};
  const rows=(d.list||[]).map(x=>{
    const bf=flags.filter(f=>String(f.branch||'')===String(x.branch)),n=Math.max(Number(x.open_flags||0),bf.length);
    let st,cls;
    if(!x.submitted){st='не сдан';cls='wait'}
    else if(n){st='сдан в '+tm(x.submitted_at)+' — есть замечания: '+n+(bf.length?'<br><small>'+bf.slice(0,3).map(f=>esc(f.title||f.code)).join('; ')+(bf.length>3?'…':'')+'</small>':'');cls='bad'}
    else{st='сдан в '+tm(x.submitted_at)+' — всё сходится';cls='ok'}
    return '<button class="chk '+cls+' repbr" style="width:100%;text-align:left;font:inherit;margin:6px 0" data-act="branch" data-id="'+esc(x.branch)+'"><i>'+(cls==='ok'?'✓':cls==='bad'?'!':'…')+'</i><div><b>'+esc(brTitle(x.branch))+'</b><br>'+st+'</div></button>'}).join('');
  overlay('<h2>Отчёты сегодня</h2><p class="hint">Нажмите на филиал — откроется его отчёт.</p>'+rows+'<button class="btn sec" style="margin-top:10px" data-act="ovclose">Закрыть</button>');
}
function homeIcon(name){
  const files={card_vtb:'icons/24-card-vtb.svg',evening_report:'icons/01-evening-report.png',cash_acceptance:'icons/03-cash-acceptance.png',appointments:'icons/10-my-appointments.png',callcenter_shift:'icons/08-my-schedule.png',where_i_work:'icons/07-who-is-where.png',my_accruals:'icons/09-my-accruals.png',my_schedule:'icons/08-my-schedule.png',vaccines:'icons/05-vaccines.png',vaccines_all_branches:'icons/05-vaccines.png',dose_calculator:'icons/20-dose-calc.png',supplies:'icons/21-order.png',supplies_all_requests:'icons/06-drug-request.png',supply_order:'icons/21-order.png',head_money:'icons/14-revenue-director-only.png',analytics:'icons/14-revenue-director-only.png',head_reports:'icons/04-audit.png',head_cash_safe:'icons/19-safe.png',head_payroll:'icons/09-my-accruals.png',people_roles:'icons/15-access-permissions.png',head_collections:'icons/02-cash-register.png',head_schedule:'icons/08-my-schedule.png',birthdays:'icons/23-greetings.png'};
  if(files[name])return '<img src="'+files[name]+'" alt="" width="56" height="56" decoding="sync">';
  return '';
}
const HOME_TILE_META={
  evening_report:{section:'finance',size:'wide',title:'Вечерний отчёт',sub:'Закройте день — это пара минут',act:'homebranches'},
  cash_acceptance:{section:'finance',size:'wide',title:'Приём кассы',sub:'Утром: пересчитать и подтвердить',act:'homebranches'},
  appointments:{section:'clinic',size:'main',title:'Мои записи',sub:'Ближайшие приёмы и пациенты',view:'sched'},
  callcenter_shift:{section:'clinic',size:'wide',title:'Мои выходы',sub:'Отметки по дням и итог',view:'cc'},
  my_schedule:{section:'clinic',size:'sm',title:'График',sub:'Мои смены и кто где',view:'sched'},
  my_accruals:{section:'clinic',size:'sm',title:'Мои начисления',sub:'Начислено за период',view:'work'},
  where_i_work:{section:'work',size:'wide',title:'Где я работаю',sub:'Мои смены и кто где сегодня',view:'sched'},
  vaccines:{section:'preparations',size:'sm',title:'Вакцины',sub:'Остатки по филиалам',view:'vac',prepare:'Здесь будут остатки вакцин и их движение по филиалам.'},
  vaccines_all_branches:{section:'preparations',size:'sm',title:'Вакцины по филиалам',sub:'Остатки во всех клиниках',view:'vac',prepare:'Здесь будут остатки вакцин по всем филиалам.'},
  dose_calculator:{section:'preparations',size:'sm',title:'Расчёт дозы',sub:'Быстрый расчёт препарата',prepare:'Здесь будет безопасный расчёт дозы препарата.'},
  supplies:{section:'preparations',size:'sm',title:'Врачебная заявка',sub:'Препараты и расходники',view:'med',prepare:'Скоро: заявка препаратов и расходников — здесь же будут остатки.'},
  supplies_all_requests:{section:'preparations',size:'sm',title:'Врачебные заявки',sub:'Сводная по филиалам',view:'med',prepare:'Здесь будут заявки филиалов на препараты и расходники.'},
  card_vtb:{section:'finance',size:'sm',title:'Карта ВТБ',sub:'Остаток на карте закупщика',view:'card'},
  supply_order:{section:'preparations',size:'sm',title:'Заказ снабжения',sub:'Собрать и отметить заказ',prepare:'Здесь можно будет собрать и отметить заказ снабжения.'},
  head_money:{section:'finance',size:'main',title:'Выручка',sub:'Выручка и врачи по дням',view:'rev'},
  analytics:{section:'finance',size:'sm',title:'Аналитика',sub:'Выручка, чек, рост по сети',view:'an'},
  head_cash_safe:{section:'finance',size:'sm',title:'Сейф и наличные',sub:'Остаток, выемки, мои наличные',view:'safe'},
  head_payroll:{section:'finance',size:'sm',title:'Зарплата',sub:'Начисления и выплаты',view:'ppl'},
  head_reports:{section:'finance',size:'sm',title:'Отчёты филиалов',sub:'Что требует внимания',view:'ctl'},
  head_collections:{section:'finance',size:'sm',title:'Касса и инкассации',sub:'Забрал с филиала — в пути',act:'transitpickup'},
  head_schedule:{section:'clinic',size:'sm',title:'График',sub:'Смены и кто где',view:'sched'},
  people_roles:{section:'clinic',size:'sm',title:'Люди и доступы',sub:'Сотрудники, PIN, доступы',act:'mupinopen'},
  birthdays:{section:'clinic',size:'wide',title:'Поздравления',sub:'С днём рождения сотрудников',prepare:'Здесь будут поздравления сотрудников с днём рождения — от вашего имени, по-доброму.'}
};
function homeTileKeys(){
  const map=UI2.roleTiles||{},seen=new Set(),out=[];
  /* 2.0: у руководителя главная — только плитки руководителя (даже если он ещё и врач) */
  (isHead()?['head']:personRoles()).forEach(role=>(map[role]||[]).forEach(k=>{if(!seen.has(k)&&HOME_TILE_META[k]){seen.add(k);out.push(k)}}));
  if(typeof cardProbe==='function'){cardProbe();if((isHead()||CARD.ok===true)&&!seen.has('card_vtb'))out.splice(Math.max(0,out.indexOf('head_collections')+1)||out.length,0,'card_vtb')}   /* Карта ВТБ: только руководитель и закупщик; у руководителя — рядом с «Касса и инкассации» */
  return out;
}
function homeTileHtml(k){
  if(k==='card_vtb'&&typeof cardTileHtml==='function')return cardTileHtml();
  const m=HOME_TILE_META[k],built=(UI2.moduleBuilt||{})[k]===true,attrs=built?(m.act?' data-act="'+m.act+'"':' data-act="go" data-v="'+m.view+'"'):' data-act="prepare" data-k="'+k+'"';
  return '<button class="glass ui2-role-tile '+m.size+'"'+attrs+'><span class="ic">'+homeIcon(k)+'</span><span><span class="t">'+esc(m.title)+'</span><span class="sub">'+esc(m.sub)+'</span>'+((k==='supplies'||k==='supplies_all_requests')&&typeof medTileBadge==='function'?medTileBadge():'')+((k==='vaccines'||k==='vaccines_all_branches')?vacTileBadge():'')+'</span></button>';
}
/* свод §17: у не-руководителей разделы — Работа → Препараты → Клиника; у руководителя — Финансы → Препараты → Клиника (§15/«главная на плитках») */
const HOME_NH_SECTION={card_vtb:'work',cash_acceptance:'work',evening_report:'work',appointments:'work',where_i_work:'clinic'};
function homeTileSection(k){return isHead()?HOME_TILE_META[k].section:(HOME_NH_SECTION[k]||HOME_TILE_META[k].section)}
/* сетка главной без дыр (все роли): сначала крупная плитка «main», затем маленькие парами, широкие — целой строкой ниже пар; нечётная последняя маленькая растягивается на всю ширину */
function homeOrderTiles(a){
  const sz=k=>HOME_TILE_META[k].size,mains=a.filter(k=>sz(k)==='main'),sm=a.filter(k=>sz(k)==='sm'),wides=a.filter(k=>sz(k)!=='sm'&&sz(k)!=='main');
  return {keys:mains.concat(sm,wides),fullKey:sm.length%2===1?sm[sm.length-1]:null};
}
function homeSectionsHtml(){
  const names={finance:'Финансы',work:'Работа',preparations:'Препараты',clinic:'Клиника'},keys=homeTileKeys();
  return (isHead()?['finance','preparations','clinic']:['work','preparations','clinic','finance']).map(sec=>{const a=keys.filter(k=>homeTileSection(k)===sec);if(!a.length)return '';const o=homeOrderTiles(a);return '<div class="ui2-group-title">'+names[sec]+'</div>'+(sec==='work'&&isAdminCC()?ccMarkHtml():'')+'<div class="ui2-role-tiles'+(a.length===1?' single':'')+'">'+o.keys.map(k=>{const t=homeTileHtml(k);return k===o.fullKey?t.replace('ui2-role-tile sm','ui2-role-tile sm full'):t}).join('')+'</div>'}).join('');
}
function showHomeBranches(){
  const buttons=BRANCHES.filter(b=>!b.testOnly).map(b=>'<button class="ui2-branch branch-'+b.id+'" data-act="branch" data-id="'+b.id+'"'+(S.busy?' disabled':'')+'><span>'+esc(b.title)+'</span><small>Открыть отчёт и приём кассы</small></button>').join('');
  overlay('<h2>'+(isAdminCC()?'Я сегодня на филиале…':'Выберите филиал')+'</h2><p class="hint">Откроется сегодняшний отчёт. Утром сначала показывается приём кассы.</p>'+buttons+'<button class="btn sec small" data-act="ovclose">Отмена</button>');
}
function viewBranch(){
  loadVacOverview();
  if(isCC()&&!isHead())loadCCToday();
  if(isHead()){loadDayStatus();if(S.mr==null&&S.lv==null)loadMr();if(!S.revStatus||Date.now()-(S.revStatusAt||0)>60000)loadRevStatus()}else loadHomeWho();
  let h='<section class="ui2-home-screen"><div class="ui2-greeting"><small>'+esc(stageRole(S.person))+'</small><h1>'+esc(stageGreeting(S.person))+'</h1></div>'+(isHead()?headDayLineHtml()+headTodayHtml():isAdminCC()?bothTodayHtml():homeTodayHtml())+vacReminderHtml()+homeSectionsHtml();
  if(isHead())h+='<div class="mrbox">'+mrHtml0()+lvHtml()+'</div>'; /* ждущие подтверждения инкассации и отпуска — только если есть */
  if(S.queue.length)h+='<div class="card quiet"><p class="hint">Не отправлено отчётов: '+S.queue.length+'. Нажмите «'+(S.online?'онлайн':'нет связи')+'» вверху.</p></div>';
  return h+'</section>';
}
/* строка дня на главной руководителя: 🟢 всё сходится / 🔴 требует внимания (бывший «Контроль») */
function headDayLineHtml(){return revStatusHtml()}
function headReportHtml(){
  return '<div class="card"><h2>Отчёт филиала</h2><label class="f"><span>Дата</span><input id="dt" type="date" value="'+esc(S.date)+'"></label>'+BRANCHES.filter(b=>!b.testOnly).map(b=>'<button class="ui2-branch branch-'+b.id+'" data-act="branch" data-id="'+b.id+'"><span>'+esc(b.title)+'</span><small>Открыть отчёт</small></button>').join('')+'</div>';
}
function prepareHtml(){
  const m=HOME_TILE_META[S.prepareKey]||{title:'Раздел',prepare:'Этот раздел появится в одной из следующих тестовых сборок.'};
  return '<section class="ui2-home-screen"><div class="ui2-greeting"><small>'+esc(stageRole(S.person))+'</small><h1>Раздел готовится</h1></div><div class="glass ui2-prepare"><span class="ic">'+homeIcon(S.prepareKey)+'</span><h2>'+esc(m.title)+'</h2><p>'+esc(m.prepare||'Этот раздел появится в одной из следующих тестовых сборок.')+'</p><button class="btn" data-act="go" data-v="branch">На главную</button></div></section>';
}
