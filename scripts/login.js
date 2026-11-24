'use strict';
/* ====== Вход / контекст ====== */
async function loadLoginList(){}
/* c28 (слово Михаила 19.11): запоминаем на устройстве ТОЛЬКО личный номер (3 цифры). PIN, токен сессии и имя не хранятся; окно сессии 30 минут не меняется.
   Номер подставляется при открытии приложения и после выхода; «Это не я» стирает его. */
const LOGIN_NUM_KEY='ev_login_number';
function savedLoginNumber(){try{const v=localStorage.getItem(LOGIN_NUM_KEY);return /^\d{3}$/.test(v||'')?v:''}catch(e){return ''}}
function applySavedNumber(){const n=savedLoginNumber();if(n){S.loginScreen='keypad';S.loginStep='pin';S.loginNumber=n;S.loginPin='';S.loginRemembered=true;return true}S.loginRemembered=false;return false}
async function doLogin(pin){
  const number=S.loginNumber||'';const shared=false; /* 2.0: галочки «общее устройство» нет — автовыход у всех, кроме руководителя */
  if(!/^\d{3}$/.test(number)){toast('Личный номер — 3 цифры');return}
  if(!/^\d{6}$/.test(pin)){toast('PIN — 6 цифр');return}
  S.busy=true;render();
  try{
    const r=await rpc('ev_login_number',{p_number:number,p_pin:pin,p_device:DEV,p_shared:shared});
    // 2.0 deliberately opens the role-aware home for every authenticated role.
    // The former showCC/showWork redirects hid the new main screen from those roles.
    /* c20: роль без экрана (например, аутсорс; screen_access/список ролей экрана пуст) — приложение для неё не строится */
    if(r.ok&&personRoles(r.person).length===0){rpc('ev_logout',{p_token:r.token}).catch(()=>{});S.loginPin='';S.busy=false;toast('Для вашей роли экран в приложении не предусмотрен.',7000);render();return}
    if(r.ok){try{localStorage.setItem(LOGIN_NUM_KEY,number)}catch(e){}S.loginRemembered=true;S.token=r.token;S.person=r.person;S.shared=shared;touchAct();S.busy=false;S.view='branch';render();flush();birthdayCheck();return}
    const m={bad_pin:'Неверный PIN'+(r.attempts_left!=null?'. Осталось попыток: '+r.attempts_left:''),locked:'Слишком много ошибок. Вход закрыт на 15 минут.',expired:'Срок PIN истёк — обратитесь к руководителю.',no_access:'Нет доступа. Обратитесь к руководителю.'};
    toast(m[r.error]||'Ошибка входа',6000);
  }catch(e){toast(e.net?'Нет связи с сервером. Проверьте интернет.':'Ошибка сервера ('+e.http+')',6000)}
  S.loginPin='';S.busy=false;render();
}
function logout(){if(S.token)rpc('ev_logout',{p_token:S.token}).catch(()=>{});S.sch=null;apptReset();S.token=null;S.person=null;S.form=null;S.ctx=null;S.handover=null;S.transit=null;S.transitUid=null;S.myCash=null;S.sal=null;S.rev=null;S.revSal=null;S.ctl=null;S.salTab=null;S.salPay=null;S.salPayKey=null;S.salPayErr=null;S.salPayLoad=false;S.ccVal=null;S.ccValRange=null;S.ccValLoad=false;S.ccValErr=null;S.ccValUid=null;S.revBranch=null;S.cc=null;S.mySal=null;S.work=null;S.wkAdm=null;S.wkHist=false;S.wkHistData=null;S.pay=null;S.day=null;S.loginScreen='start';S.loginStep='number';S.loginNumber='';S.loginPin='';S.loginShared=false;HOME_WHO.key='';HOME_WHO.loading=false;HOME_WHO.rows=null;HOME_WHO.error=null;LS.del('ev_token');LS.del('ev_person');S.view='login';render();loadLoginList().then(()=>{if(S.view==='login')render()})}

/* ====== Приёмка переходящей кассы (v1.86: одно начало смены без повторного ввода) ====== */
const handoverCacheKey=(branch,date)=>'ev_handover_ctx:'+branch+':'+date;
let handoverFlushing=false;
function handoverPending(branch,date){return S.handoverQueue.find(x=>x.branch===branch&&x.date===date)}
function handoverHere(){return S.handover&&S.handover.branch===S.branch&&S.handover.date===S.date?S.handover:null}
function handoverGate(){
  const s=handoverHere(),h=s&&s.ctx;
  return !!(!isHead()&&s&&(s.loading||(h&&h.ok&&h.mode!=='off'&&!h.current)));
}
function handoverOpening(){
  const p=handoverPending(S.branch,S.date);
  if(p&&String(p.actor_id)===String(S.person?.id)&&(p.kind==='accept'||p.kind==='correction')&&(p.status==='new'||p.status==='offline')&&isFinite(Number(p.actual)))return{actual:r2(Number(p.actual)),pending:true};
  const s=handoverHere(),h=s&&s.ctx;
  if(h&&h.current&&isFinite(Number(h.current.actual)))return{actual:r2(Number(h.current.actual)),pending:false,current:h.current};
  return null;
}
function openingState(){
  if(!S.ctx||S.ctx.current)return{mode:'manual'};
  if(!isHead()){
    const h=handoverHere()?.ctx,a=h?.current?.actual;
    return h?.current&&a!=null&&isFinite(Number(a))?{mode:'linked',actual:r2(Number(a)),pending:false}:{mode:'waiting'};
  }
  const o=handoverOpening();if(o)return Object.assign({mode:'linked'},o);
  const s=handoverHere(),h=s&&s.ctx;
  if(s&&s.loading&&S.ctx.prev&&S.ctx.prev.closing!=null&&isFinite(Number(S.ctx.prev.closing)))return{mode:'waiting',actual:r2(Number(S.ctx.prev.closing))};
  if(h&&h.ok&&h.mode!=='off'&&h.source&&h.expected!=null&&isFinite(Number(h.expected)))return{mode:'waiting',actual:r2(Number(h.expected))};
  return{mode:'manual'};
}
function syncOpeningFromHandover(){
  if(!S.form||!S.ctx||S.ctx.current)return false;
  const st=openingState();if(st.mode!=='linked')return false;
  const next=String(st.actual);if(S.form.open===next)return false;
  S.form.open=next;saveDraft();return true;
}
async function loadHandover(){
  const branch=S.branch,date=S.date;
  S.handover={branch,date,loading:true,ctx:null,actual:'',error:null,offline:false};
  if(S.view==='form')render();
  let h=null;
  try{
    h=await rpc('ev_cash_handover_context',{p_token:S.token,p_branch:branch,p_date:date},8000);
    // Cash state stays in memory only.
  }catch(e){
    if(!e.net){h={ok:false,error:'server'};}
    else{h=null;}
  }
  if(S.branch!==branch||S.date!==date||S.view!=='form')return;
  if(!h){S.handover={branch,date,loading:false,ctx:null,actual:'',error:'Нет связи: ожидаемая сумма не подтверждена сервером.',offline:true};}
  else if(!h.ok){S.handover={branch,date,loading:false,ctx:null,actual:'',error:h.error==='forbidden'?null:'Контроль приёмки временно недоступен.',offline:false};}
  else S.handover={branch,date,loading:false,ctx:h,actual:'',error:null,offline:!!h.cached};
  syncOpeningFromHandover();
  render();
}
async function flushHandover(auto){
  if(handoverFlushing||!S.handoverQueue.length||!S.token)return;
  handoverFlushing=true;let changed=false;
  try{
    for(const it of S.handoverQueue.slice()){
      if(auto&&it.status==='error')continue;
      const actorId=S.person&&S.person.id!=null?String(S.person.id):'';
      if(!it.actor_id||String(it.actor_id)!==actorId){it.status='wrong_actor';it.error='wrong_actor';continue}
      let res;
      try{
        if(it.kind==='correction')res=await rpc('ev_cash_handover_correct',{p_token:S.token,p_event_id:it.event_id,p_actual:it.actual,p_reason:it.reason,p_client_uid:it.uid,p_client_time:it.client_time,p_device:DEV},12000);
        else res=await rpc('ev_cash_handover_accept',{p_token:S.token,p_branch:it.branch,p_date:it.date,p_actual:it.actual,p_source_fingerprint:it.source_fingerprint,p_client_uid:it.uid,p_client_time:it.client_time,p_device:DEV},12000);
      }catch(e){if(e.net){it.status='offline';break}it.status='error';it.error='server';continue}
      if(res.ok){changed=true;S.handoverQueue=S.handoverQueue.filter(x=>x.uid!==it.uid);saveHandoverQueue();if(S.handover)S.handover.receipt=res;}
      else{
        it.status='error';it.error=res.error;
        if(S.handover)S.handover.error=res.error==='source_changed'?'Вчерашний отчёт изменился. Обновите экран и пересчитайте кассу.':res.error==='already_accepted'?'Касса уже принята другим подтверждённым действием. Обновите экран.':res.error==='stale_event'?'Эта запись уже исправлена. Обновите экран.':'Не удалось сохранить приёмку: '+res.error;
      }
    }
  }finally{
    handoverFlushing=false;saveHandoverQueue();
    if(S.view==='form'){if(changed)await openBranch(S.branch);else{syncOpeningFromHandover();render();}}
  }
}
function kickHandover(){S.handoverQueue.forEach(x=>{if(x.status==='offline')x.status='new'});flushHandover()}
function acceptHandover(){
  const h=S.handover&&S.handover.ctx,el=document.getElementById('ho-actual');
  const actual=num(el&&el.value);
  if(!h||h.mode==='off'){toast('Контроль приёмки ещё не включён');return}
  if(!h.can_accept){toast('Приёмку подписывает администратор под своей фамилией');return}
  if(actual==null||isNaN(actual)||actual<0){toast('Впишите фактически принятую сумму');return}
  if(!h.source){toast('Нет подтверждённого итога предыдущего отчёта. Приёмку пока нельзя подписать.',6000);return}
  if(handoverPending(S.branch,S.date)){toast('Эта приёмка уже ждёт отправки');return}
  S.handoverQueue.push({kind:'accept',uid:uid(),actor_id:String(S.person.id),actor_name:S.person.name||'',branch:S.branch,date:S.date,actual:r2(actual),source_fingerprint:h.source.fingerprint,client_time:new Date().toISOString(),status:'new'});
  saveHandoverQueue();syncOpeningFromHandover();render();flushHandover();
}
function handoverCorrectForm(){
  const h=S.handover&&S.handover.ctx,c=h&&h.current;if(!c||!h.can_correct)return;
  overlay('<h2>Исправить принятую сумму</h2><p class="hint">Старая подпись не удаляется. Будет добавлена новая запись с причиной.</p><label class="f"><span>Фактически принято, ₽</span><input id="ho-correct-actual" inputmode="decimal" autocomplete="off" value=""></label><label class="f"><span>Причина исправления</span><textarea id="ho-correct-reason" rows="2"></textarea></label><button class="btn" data-act="hocorrectgo" data-id="'+c.id+'">Сохранить исправление</button><button class="btn sec" style="margin-top:8px" data-act="ovclose">Отмена</button>');
}
function handoverCorrectGo(eventId){
  const actual=num((document.getElementById('ho-correct-actual')||{}).value),reason=((document.getElementById('ho-correct-reason')||{}).value||'').trim();
  if(actual==null||isNaN(actual)||actual<0){toast('Впишите фактически принятую сумму');return}
  if(reason.length<3){toast('Напишите причину исправления');return}
  S.handoverQueue.push({kind:'correction',uid:uid(),actor_id:String(S.person.id),actor_name:S.person.name||'',branch:S.branch,date:S.date,event_id:Number(eventId),actual:r2(actual),reason,client_time:new Date().toISOString(),status:'new'});
  saveHandoverQueue();syncOpeningFromHandover();closeOv();render();flushHandover();
}

/* c13 (REMARKS п.19): любое окно-шторка закрывается при переходе в филиал. Руководитель по умолчанию НЕ заполняет отчёт администратора:
   «сдан» → просмотр (только чтение), «не сдан» → карточка «Отчёт не сдан. Сегодня на смене: …». Заполнить за администратора — только
   Меню → «Заменить администратора» с подтверждением (opts.asAdmin). */
async function openBranch(id,opts){
  closeOv();
  const asAdmin=!!(opts&&opts.asAdmin),headView=isHead()&&!asAdmin;
  S.roHead=false;S.headFix=false;S.nosub=false;S.nosubInfo=null;S.subAdmin=asAdmin;
  if(!isHead()){S.date=omskToday();S.dateManual=false;}
  S.branch=id;S.busy=true;render();
  let ctx=null;S.ctxOffline=false;
  try{
    const selection=await rpc('ev_select_branch',{p_token:S.token,p_branch:id});if(!selection.ok){toast(selection.error==='session'?'Сессия закончилась. Возможно, выполнен вход с другого устройства.':'Нет доступа к филиалу');S.busy=false;render();return;}
    if(!isHead())S.date=selection.date;
    const t0=Date.now();
    try{ctx=await rpc('ev_context',{p_token:S.token,p_branch:id,p_date:S.date},8000)}
    catch(e1){if(!e1.net||Date.now()-t0>3000)throw e1;ctx=await rpc('ev_context',{p_token:S.token,p_branch:id,p_date:S.date},6000)} // быстрый сбой сети — одна повторная попытка; зависание не удваиваем
    if(!ctx.ok){
      if(ctx.error==='session'){S.busy=false;S.token=null;LS.del('ev_token');S.view='login';toast('Сессия закончилась. Войдите заново.');render();return}
      toast('Ошибка: '+ctx.error);S.busy=false;render();return;
    }
    {const keep=Object.assign({},ctx);keep.prev=null;keep.current=null;LS.set('ev_ctx:'+id,keep)} // в запас — только списки; остаток и сданный отчёт не храним
  }catch(e){
    if(!e.net){toast('Ошибка сервера ('+e.http+')');S.busy=false;render();return}
    ctx=LS.get('ev_ctx:'+id);
    if(!ctx){toast('Нет связи, и для этого филиала нет сохранённого списка. Подключитесь к интернету.',7000);S.busy=false;render();return}
    S.ctxOffline=true;
    ctx.current=null;ctx.prev=null; // сданные версии и вчерашний остаток без связи неизвестны — не подставляем чужое/старое
  }
  S.ctx=ctx;
  if(headView&&(S.ctxOffline||!ctx.current)){
    /* не сдан (или нет связи): карточка без формы; кто на смене — из графика */
    S.nosub=true;S.form=null;S.handover=null;S.nosubInfo={loading:!S.ctxOffline,admins:[],offline:S.ctxOffline};S.busy=false;S.view='form';render();window.scrollTo(0,0);
    if(!S.ctxOffline)loadNoSubAdmins(id,S.date);
    return;
  }
  if(headView){
    S.roHead=true;S.handover=null;S.form=formFromReport(ctx.current.data);S.draftTs=null;S.busy=false;S.view='form';S.flags=null;render();window.scrollTo(0,0);
    loadFlags(id,S.date);
    return;
  }
  S.handover=S.ctxOffline?null:{branch:id,date:S.date,loading:true,ctx:null,actual:'',error:null,offline:false};
  const draft=LS.get(draftKey());
  S.draftTs=null;
  if(draft&&draft.form){S.form=Object.assign(emptyForm(),draft.form);S.draftTs=draft.ts||Date.now()}
  else if(ctx.current){S.form=formFromReport(ctx.current.data)}
  else S.form=freshForm();
  S.busy=false;S.view='form';S.flags=null;render();
  if(!S.ctxOffline)loadTransit(id,S.date);
  if(ctx.current&&!S.ctxOffline)loadFlags(id,S.date);
  if(!S.ctxOffline)loadHandover();
}

async function loadNoSubAdmins(id,date){
  try{
    const r=await rpc('ev_whos_where',{p_token:S.token,p_from:date,p_to:date},8000);
    const rows=r&&r.ok?(Array.isArray(r.shifts)?r.shifts:(Array.isArray(r.rows)?r.rows:[])):null;
    if(S.nosubInfo&&S.branch===id&&S.date===date)S.nosubInfo={loading:false,error:!rows,admins:(rows||[]).filter(x=>String(x.branch||x.branch_id||'')===String(id)&&(x.slot==='admin'||x.role==='admin')).map(x=>x.short_name||x.name||x.full).filter(Boolean)};
  }catch(e){if(S.nosubInfo&&S.branch===id)S.nosubInfo={loading:false,error:true,admins:[]}}
  if(S.nosub&&S.view==='form')render();
}
function nosubHtml(){
  const i=S.nosubInfo||{loading:true,admins:[]},bt=brTitle(S.branch),dt=S.date===omskToday()?'сегодня':ruDate(S.date);
  let who;
  if(i.offline)who='Нет связи: статус отчёта неизвестен. Подключитесь к интернету и откройте филиал снова.';
  else if(i.loading)who='Смотрю, кто сегодня на смене…';
  else if(i.error)who='Кто на смене — пока не загрузилось.';
  else who=i.admins.length?(S.date===omskToday()?'Сегодня на смене':'На смене в этот день')+': <b>'+i.admins.map(esc).join(', ')+'</b>':'Администратор на смене по графику не назначен.';
  return '<div class="card" id="nosub"><h2>Отчёт не сдан</h2><p style="margin:0 0 8px"><b>'+esc(bt)+'</b>, '+esc(dt)+'</p><p style="margin:0 0 12px">'+who+'</p>'
    +'<p class="hint">Отчёт заполняет администратор филиала. Если администратора нет и отчёт нужно внести за него — «Меню → Заменить администратора».</p>'
    +'<button class="btn sec" data-act="back" style="margin-top:8px">Назад к филиалам</button></div>';
}

const LCATS=[['head','Руководитель'],['adm','Администратор'],['asst','Ассистент'],['doc','Врач'],['cc','Колл-центр'],['oth','Другие']];
const inCat=(p,c)=>{
  if(c==='head')return p.head===true; // 1.66: отдельный вход руководителя (флаг head отдаёт ev_login_list после миграции ev_v155)
  if(!('doc' in p)&&(c==='doc'||c==='asst'||c==='oth')) return c==='doc'&&p.work===true&&p.adm!==true&&p.cc!==true; // список со старой страницы 1.46: врачи и ассистенты вместе
  return c==='adm'?p.adm===true:c==='cc'?p.cc===true:c==='doc'?p.doc===true:c==='asst'?p.asst===true:p.cour===true;
};
function loginCats(){return LCATS.filter(c=>S.loginList.some(p=>inCat(p,c[0])))}
function loginRole(){ // выбранная или запомненная на устройстве роль (только слово, ни PIN, ни сумм)
  const cs=loginCats().map(c=>c[0]);
  if(S.loginTab&&cs.includes(S.loginTab))return S.loginTab;
  const t=LS.get('ev_tab');return cs.includes(t)?t:null;
}
const loginTab=loginRole;
function evroMark(cls,label){return '<svg class="'+(cls||'evro-mark')+'" viewBox="0 0 153 153"'+(label?' aria-label="'+esc(label)+'"':' aria-hidden="true"')+'><use href="#evro"></use></svg>'}
function loginWordmark(size){return '<div class="ui2-wordmark '+(size||'')+'"><span>МОЙ</span><span class="gap"></span><span>ЕВР</span>'+evroMark('evro-mark','О')+'<span>ВЕТ</span></div>'}
function deviceDayOfYear(d=new Date()){return Math.floor((Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())-Date.UTC(d.getFullYear(),0,0))/86400000)}
function loginSlogan(d=new Date()){
  const a=Array.isArray(UI2.slogans)?UI2.slogans:[];
  if(!a.length)return '';
  return UI2.sloganRotate===false?a[0]:a[deviceDayOfYear(d)%a.length];
}
function loginBoxes(){
  if(S.loginStep==='number')return '<div class="ui2-field-label">Личный номер — 3 цифры</div><div class="ui2-digits" aria-label="Введено цифр: '+S.loginNumber.length+'">'+[0,1,2].map(i=>'<span class="'+(i===S.loginNumber.length?'cur':'')+'">'+esc(S.loginNumber[i]||'')+'</span>').join('')+'</div>';
  return '<div class="ui2-field-label">PIN — 6 цифр</div><div class="ui2-dots" aria-label="Введено цифр PIN: '+S.loginPin.length+'">'+[0,1,2,3,4,5].map(i=>'<i class="'+(i<S.loginPin.length?'on':'')+'"></i>').join('')+'</div><div class="ui2-numrow">номер <b>'+esc(S.loginNumber)+'</b> '+(S.loginRemembered?'<button data-act="loginnotme">Это не я</button>':'<button data-act="loginchange">изменить</button>')+'</div>'
    +'<div class="ui2-field-label" style="margin-top:10px;opacity:.7;font-weight:600">Автоматический выход через 30 минут без действий (кроме руководителя).</div>';
}
function loginPad(){return '<div class="ui2-pad">'+['1','2','3','4','5','6','7','8','9'].map(n=>'<button data-act="logindigit" data-n="'+n+'">'+n+'</button>').join('')+'<button class="blank" tabindex="-1" aria-hidden="true"></button><button data-act="logindigit" data-n="0">0</button><button class="del" data-act="logindel" aria-label="Стереть">⌫</button></div>'}
/* c21: без сети войти нельзя (вход проверяет сервер), но данные не потеряны — говорим об этом прямо */
function loginNetNote(){
  const q=(S.queue||[]).length,hq=(S.handoverQueue||[]).length;
  if(S.online&&!q&&!hq)return '';
  let t='';
  if(!S.online)t+='Нет интернета: войти сейчас нельзя. ';
  if(q||hq)t+='На этом устройстве сохранено и ждёт отправки: '+[q?'отчётов '+q:'',hq?'приёмок кассы '+hq:''].filter(Boolean).join(', ')+'. Данные не потеряются. Войдите, когда появится интернет, и они отправятся сами.';
  return t?'<p class="ui2-login-net" role="status">'+esc(t.trim())+'</p>':'';
}
function viewLogin(){
  if(S.loginScreen==='start')return '<section class="ui2-login-shell ui2-start"><div class="ui2-login-spacer"></div><div class="ui2-halo">'+evroMark('evro-mark')+'</div>'+loginWordmark('lg')+'<p class="ui2-login-lead">'+esc(loginSlogan())+'</p>'+loginNetNote()+'<div class="ui2-login-spacer"></div><button class="btn ui2-login-btn" data-act="loginstart">Войти</button></section>';
  return '<section class="ui2-login-shell ui2-key-login">'+loginWordmark('sm')+'<h2>'+(S.loginStep==='number'?'Ваш личный номер':'Введите PIN')+'</h2><div class="ui2-login-entry">'+loginBoxes()+'</div><div class="ui2-login-spacer"></div>'+loginPad()+''+loginNetNote()+'<p class="ui2-login-fine">Номер и PIN — ваша подпись. Никому не передавайте</p>'+(S.busy?'<div class="ui2-login-busy">Входим…</div>':'')+'</section>';
}
