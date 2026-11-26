'use strict';
/* ====== Отрисовка ====== */
function setHeader(){
  const h=$('#hdr');
  document.body.classList.toggle('login-mode',S.view==='login');
  if(S.view==='login'){h.className='login-head';stableHtml(h,'');return}
  h.className=S.view==='form'?'form-head':'';
  if(S.view==='help'&&!S.person){stableHtml(h,'<div class="hl"><img class="logo" src="mark.svg" alt=""><div><b>Мой ЕВРОВЕТ</b><small>Всё о вашей работе — в одном месте</small></div></div>'+netBadge(),true);return}
  stableHtml(h,'<div class="hl"><img class="logo" src="mark.svg" alt=""><div><b>'+esc(S.person?(S.person.short_name||S.person.name):'')+'</b><small>'+esc(stageRole(S.person))+'</small></div></div><div class="hb">'+netBadge()+
    (S.view==='form'?'<button class="pill" data-act="back" aria-label="Назад на главную">‹ Назад</button>':'')+(S.view==='cc'&&canReport()&&!isHead()?'<button class="pill" data-act="back">Отчёт</button>':'')+'</div>',true); /* 2.0: «Меню» только внизу */
}
function netBadge(){
  const q=S.queue.length+S.handoverQueue.length;
  const action=S.queue.filter(x=>x.status==='error'||x.status==='needs_reason').length+S.handoverQueue.filter(x=>x.status==='error').length;
  const lab=action?('нужно действие: '+action):(q?('ждёт: '+q):(S.online?'онлайн':'нет связи'));
  return '<button class="pill" data-act="queue" title="'+(S.online?'Связь есть':'Нет связи')+'"><span class="net'+(S.online?'':' off')+'"></span>'+lab+'</button>';
}

let evHistoryReady=false,evHistoryApplying=false,evHistoryView=null;
function evNavSnapshot(){return{view:S.view,branch:S.branch,date:S.date,wkFrom:S.wkFrom||null,wkTo:S.wkTo||null,sch:S.sch?{m:S.sch.m,tab:S.sch.tab,day:S.sch.day,flt:S.sch.flt}:null}}
function evSyncHistory(){
  const snap=evNavSnapshot();
  if(evHistoryApplying){evHistoryView=snap.view;return}
  if(!evHistoryReady){history.replaceState({evrovet:snap},'',location.href);evHistoryReady=true}
  else if(evHistoryView!==snap.view)history.pushState({evrovet:snap},'',location.href);
  evHistoryView=snap.view;
}
let _renderedView=null;
/* Не трогаем уже нарисованный узел, если разметка не изменилась. При изменении
   переносим совпадающие картинки в новую разметку: декодированные иконки не
   исчезают между несколькими фоновыми обновлениями одного экрана. */
function stableHtml(el,html,keepImages){
  if(!el||el.innerHTML===html)return false;
  if(!keepImages){el.innerHTML=html;return true}
  const t=document.createElement('template');t.innerHTML=html;
  const pool={};el.querySelectorAll('img[src]').forEach(img=>{const k=img.getAttribute('src');(pool[k]||(pool[k]=[])).push(img)});
  t.content.querySelectorAll('img[src]').forEach(img=>{const a=pool[img.getAttribute('src')];if(a&&a.length&&a[0].outerHTML===img.outerHTML)img.replaceWith(a.shift())});
  el.replaceChildren(t.content);return true;
}
/* Активная вкладка меняет только класс кнопки. Не удаляем саму панель и SVG:
   iOS иначе заново композитит все иконки и они заметно мигают. */
function stableBottomBar(el,html){
  if(!el||!html)return stableHtml(el,html);
  const old=el.firstElementChild;
  if(!old||el.children.length!==1||!old.matches('nav.ui2-bottom-nav'))return stableHtml(el,html);
  const t=document.createElement('template');t.innerHTML=html;
  const fresh=t.content.firstElementChild,ob=[...old.querySelectorAll(':scope > button')],nb=fresh?[...fresh.querySelectorAll(':scope > button')]:[];
  const same=fresh&&fresh.matches('nav.ui2-bottom-nav')&&ob.length===nb.length&&ob.every((b,i)=>b.innerHTML===nb[i].innerHTML&&b.dataset.act===nb[i].dataset.act&&b.dataset.v===nb[i].dataset.v);
  if(!same)return stableHtml(el,html);
  ob.forEach((b,i)=>b.className=nb[i].className);return false;
}
function roLock(){
  const a=$('#app');if(!a)return;a.classList.toggle('ro',!!(S.view==='form'&&S.roHead));
  if(!(S.view==='form'&&S.roHead))return;
  a.querySelectorAll('input,select,textarea').forEach(e=>{e.disabled=true});
}
function render(){
  /* c13: шторка не должна переживать смену экрана (REMARKS п.19) */
  if(_renderedView!==null&&_renderedView!==S.view&&$('#ovwrap')&&$('#ovwrap').innerHTML&&!S.keepOv)closeOv();
  _renderedView=S.view;
  evSyncHistory();
  setHeader();
  const app=$('#app'),bar=$('#barwrap');let html='',barHtml='';
  app.classList.toggle('ro',S.view==='form'&&!!S.roHead); /* c32: «только чтение» держится только на экране просмотра, на других экранах не прячет кнопки */
  if(S.view==='login')html=viewLogin();
  else if(S.view==='branch')html=viewBranch();
  else if(S.view==='form'){html=viewForm();barHtml=viewBar()}
  else if(S.view==='done')html=viewDone();
  else if(S.view==='vmw')html=vmwHtml();
  else if(S.view==='help')html=viewHelp();
  else if(S.view==='ctl')html=ctlHtml();
  else if(S.view==='rev')html=revHtml()+revDoctorsHtml();
  else if(S.view==='sal')html=salHtml();
  else if(S.view==='cc')html=ccHtml();
  else if(S.view==='work')html=workHtml();
  else if(S.view==='pay')html=payHtml();
  else if(S.view==='mu')html=muHtml();
  else if(S.view==='sched')html=schedHtml();
  else if(S.view==='prepare')html=prepareHtml();
  else if(S.view==='vac')html=vacHtml();
  else if(S.view==='med')html=medHtml();
  else if(S.view==='dose')html=doseHtml();
  else if(S.view==='an')html=analyticsHtml();
  else if(S.view==='card')html=cardHtml();
  stableHtml(app,html,true);
  if(S.view==='form'){if(!S.nosub)updateChecks();roLock()}
  if(S.person&&['branch','ctl','rev','sal','cc','work','pay','sched','prepare','vac','med','dose','an','card'].includes(S.view))barHtml=navHtml();
  stableBottomBar(bar,barHtml);
  document.body.classList.toggle('has-bottom-bar',!!barHtml);
}
window.addEventListener('popstate',e=>{
  if(typeof vmwBlockBack==='function'&&vmwBlockBack())return; /* экран «Ожидайте сверки»: назад не выводит */
  const x=e.state&&e.state.evrovet;if(!x)return;
  evHistoryApplying=true;
  S.view=x.view||homeView();S.branch=x.branch||null;S.date=x.date||omskToday();
  if(S.view==='dose'&&typeof doseRestoreHistory==='function')doseRestoreHistory(e.state&&e.state.dose);
  if(x.wkFrom){S.wkFrom=x.wkFrom;S.wkTo=x.wkTo}
  if(x.sch){const s=schEnsure();s.m=x.sch.m;s.tab=x.sch.tab;s.day=x.sch.day;s.flt=x.sch.flt||''}
  closeOv();render();if(S.view==='dose'&&typeof doseAfterHistory==='function')doseAfterHistory();else window.scrollTo(0,0);evHistoryApplying=false;evHistoryView=S.view;
});
function currentHelpHtml(){return HELP_HTML
  .replace('разница до 10 рублей включительно','разница до 10 рублей включительно')
  .replace('Эти числа приложение потом сверит с суммой по врачам и с оплатами. Нал и безнал вместе должны давать общий вал.','Вал клиники приложение сверит с суммой по врачам. Наличные и безналичные показывают все деньги клиники за сегодня, включая суммы, положенные на аванс; приложение учтёт действия с авансами отдельно.')
  .replace('Сколько из него оплатили наличными.','Все наличные клиники за сегодня, вместе с суммами, положенными на аванс, без аптеки.')
  .replace('Сколько оплатили безналично (карты, переводы).','Весь безнал клиники за сегодня, вместе с суммами, положенными на аванс, без аптеки.')

  .replace('Аванс, принятый наличными.','Сколько сегодня положили на аванс наличными.')
  .replace('Аванс, принятый безналично.','Сколько сегодня положили на аванс безналом.')
  .replace('Сколько из авансов ушло на оплату счетов.','Сколько сегодня сняли с аванса в оплату счетов.')
  .replace('Авансы вносите так, как они показаны в Vetmanager.','Клиент дал деньги на аванс — пишем два раза: в наличные или безнал и в «Положили на аванс». Клиент заплатил авансом — пишем один раз: в «Сняли с аванса». В наличные и безнал ничего. Когда аванс был внесён — не важно.')
  .replace('Сумму оставьте и в «Нал», и в авансе, как в Vetmanager: приложение само вычтет её из кассы.','Сумму оставьте в «Наличные клиники» и в поле «Положили на аванс сегодня наличными», как в Vetmanager: приложение само учтёт её в проверке.')
  .replace('Начальная инкассация: сколько наличных лежало в кассе утром. Приложение подставляет итог вчерашнего отчёта само. Если на деле иначе, исправьте.','Начало смены: сколько наличных фактически приняли утром. После подтверждения в блоке «Утренний приём кассы» приложение подставит сумму само — повторно вводить её не нужно.')
  .replace('Проверьте «Начальную инкассацию». Обычно она уже верная.','Утром подтвердите фактически принятую кассу. Вечером проверьте, что сумма автоматически показана как «Начало смены».')
  .replace('Исправьте «Начальную инкассацию» вручную. Приложение подсветит разницу, и Руководитель её разберёт.','Исправьте утренний приём кассы отдельной записью. Новая сумма автоматически попадёт в начало смены.')}
function viewHelp(){return '<div class="card"><button class="btn sec small" data-act="helpback" style="margin:0 0 10px">← Назад</button><h2>Как заполнять отчёт</h2>'+currentHelpHtml()+'<button class="btn" data-act="helpback">Назад</button></div>'}
function openHelp(){closeOv();S.helpFrom=S.view==='help'?(S.helpFrom||'login'):S.view;S.view='help';render();window.scrollTo(0,0)}
function closeHelp(){S.view=S.helpFrom||(S.person?homeView():'login');S.helpFrom=null;render();window.scrollTo(0,0)}


/* ====== Окна ====== */
/* ====== Расхождения сверки: автору отчёта и руководителю ====== */
const addDays=(iso,n)=>{const p=iso.split('-').map(Number);return new Date(Date.UTC(p[0],p[1]-1,p[2]+n)).toISOString().slice(0,10)};
const sgn=x=>(x>0?'+':x<0?'−':'')+money(Math.abs(x));
/* ====== Инкассация МР: подтверждение руководителем ====== */
function cashHtml(){
  const c=S.cash;if(!isHead()||!c||!c.ok)return'';
  const by=c.by_branch||{},ks=Object.keys(by).filter(k=>Number(by[k]));
  return '<div class="card k-safe"><h2>Наличные в сейфе</h2><div class="srow big"><span>'+(c.balance!=null?'Остаток':'Подтверждённые инкассации')+' с '+ruDate(c.from)+'</span><b'+(Number(c.balance!=null?c.balance:c.on_hand)<0?' style="color:var(--bad,#c0392b)"':'')+'>'+money(Number(c.balance!=null?c.balance:c.on_hand))+'</b></div>'
    +(c.balance!=null?'<div class="srow sub"><span>инкассации подтверждены</span><b>'+money(Number(c.on_hand))+'</b></div><div class="srow sub"><span>взято на выплаты</span><b>−'+money(Number(c.taken||0))+'</b></div>':'')
    +ks.map(k=>'<div class="srow sub"><span>'+esc(brTitle(k))+'</span><b>'+money(Number(by[k]))+'</b></div>').join('')
    +(Number(c.pending)?'<p class="hint">Ещё не подтверждено вами: '+money(Number(c.pending))+' (в сумму не входит).</p>':'')
    +(Number(c.excluded_from_cash)?'<p class="hint">Не в сейфе (ушло на зарплату): '+money(Number(c.excluded_from_cash))+'.</p>':'')
    +'<p class="hint">Считаются только инкассации, которые вы подтвердили'+(c.balance!=null?', минус то, что вы отметили как взятое из сейфа.':'. Расходы и выдачи не вычитаются.')+'</p></div>';
}
function mrHtml(){return cashHtml()+mrHtml0()+lvHtml()}
async function loadTransit(branch,date){
  if(!S.token)return;
  try{const r=await rpc('ev_collection_transit_list',{p_token:S.token,p_branch:branch||null,p_date:date||omskToday()},8000);if(r&&r.ok){S.transit=r;if(S.view==='form'||S.view==='branch')paint()}}catch(e){}
}
function activeAdminTransit(){return((S.transit&&S.transit.items)||[]).find(x=>String(x.branch)===String(S.branch)&&String(x.date)===String(S.date)&&x.source==='admin'&&x.status!=='cancelled')||null}
function transitGiveForm(){
  const cur=activeAdminTransit();
  if(cur){
    overlay('<h2>Инкассация уже записана</h2><p>Передано <b>'+money(Number(cur.amount))+'</b>'+(cur.recipient?' · '+esc(cur.recipient):'')+'.</p><p class="hint">Повторная запись не создаётся. Если сумма или получатель указаны неверно, исправьте запись с обязательной причиной.</p><button class="btn" data-act="transitfix">Исправить</button><button class="btn sec" style="margin-top:8px" data-act="ovclose">Закрыть</button>');
    return;
  }
  S.transitUid=S.transitUid||uid();overlay('<h2>Отдал инкассацию</h2><p class="hint">Запишем факт передачи сейчас. В отчёте сумму введите отдельно.</p><label class="f"><span>Сумма, ₽</span><input id="tra" inputmode="decimal"></label><label class="f"><span>Кому</span><input id="trr" maxlength="80" value="Михаил"></label><button class="btn" data-act="transitgo" data-source="admin">Отдал</button><button class="btn sec" style="margin-top:8px" data-act="ovclose">Отмена</button>')
}
function transitFixForm(){
  const cur=activeAdminTransit();
  if(!cur){closeOv();toast('Активная инкассация не найдена',5000);return}
  S.transitUid=uid();
  overlay('<h2>Исправить инкассацию</h2><p class="hint">Старая запись '+money(Number(cur.amount))+' останется в истории как отменённая. Будет создана новая запись.</p><label class="f"><span>Правильная сумма, ₽</span><input id="tra" inputmode="decimal" value="'+esc(cur.amount)+'"></label><label class="f"><span>Кому</span><input id="trr" maxlength="80" value="'+esc(cur.recipient||'Михаил')+'"></label><label class="f"><span>Причина исправления</span><input id="trwhy" maxlength="300" placeholder="что было указано неверно"></label><button class="btn" data-act="transitfixgo">Сохранить исправление</button><button class="btn sec" style="margin-top:8px" data-act="ovclose">Отмена</button>');
}
function transitPickupForm(){S.transitUid=S.transitUid||uid();overlay('<h2>Забрал с филиала</h2><label class="f"><span>Филиал</span><select id="trb">'+BRANCHES.filter(x=>!x.testOnly).map(x=>'<option value="'+esc(x.id)+'">'+esc(x.title)+'</option>').join('')+'</select></label><label class="f"><span>Сумма, ₽</span><input id="tra" inputmode="decimal"></label><button class="btn" data-act="transitgo" data-source="head">Забрал</button><button class="btn sec" style="margin-top:8px" data-act="ovclose">Отмена</button>')}
let transitBusy=false;
async function doTransit(source,correct){
  if(transitBusy)return;
  const amount=num((($('#tra')||{}).value)),branch=source==='admin'?S.branch:(($('#trb')||{}).value),recipient=(($('#trr')||{}).value||'').trim();
  if(amount==null||amount<=0){toast('Введите сумму');return}
  const reason=correct?((($('#trwhy')||{}).value||'').trim()):'';
  if(correct&&reason.length<5){toast('Напишите причину исправления',5000);return}
  transitBusy=true;
  const btn=document.querySelector('[data-act="'+(correct?'transitfixgo':'transitgo')+'"]');if(btn)btn.disabled=true;
  try{
    const fn=correct?'ev_collection_handoff_correct':source==='admin'?'ev_collection_handoff':'ev_collection_pickup';
    const args=source==='admin'?{p_token:S.token,p_branch:branch,p_amount:amount,p_recipient:recipient,p_uid:S.transitUid}:{p_token:S.token,p_branch:branch,p_amount:amount,p_uid:S.transitUid};
    if(correct)args.p_reason=reason;
    const r=await rpc(fn,args,10000);
    if(!r||!r.ok){
      if(r&&r.error==='handoff_exists'){await loadTransit(branch,omskToday());closeOv();toast('Инкассация уже записана. Для изменения нажмите «Исправить».',7000);return}
      if(r&&r.error==='no_change'){toast('Сумма и получатель не изменились',5000);return}
      toast('Не удалось: '+(r&&r.error),6000);return
    }
    S.transitUid=null;closeOv();toast(correct?'Исправление сохранено':source==='admin'?(r.already_recorded?'Инкассация уже была записана':'Передача записана'):'Получение записано');await loadTransit(branch,omskToday())
  }catch(e){toast(e.net?'Нет связи':'Ошибка сервера',6000)}finally{transitBusy=false;if(btn)btn.disabled=false}
}
/* 1.57: «ушёл позже / пришёл раньше» ждёт подтверждения руководителя (ev_leave_pending / ev_leave_decide) */
function lvHtml(){
  if(!isHead()||!S.lv||!S.lv.length)return'';
  return '<div class="card k-mr"><h2>Подтвердите время: '+S.lv.length+'</h2><p class="hint">Добавка за ранний приход или поздний уход начисляется только после вашего решения. Пока не решили, в зарплате она равна нулю. Если время вписано по ошибке, нажмите «Это ошибка».</p>'
    +S.lv.map((x,i)=>'<div class="chk warn"><i>!</i><div><b>'+esc(brTitle(x.branch))+' · '+ruDate(x.date)+'</b><br>'+esc(x.name||'?')+': '+esc(String(x.comment||''))+'<br><span style="font-size:20px;font-weight:700">'+sgn(Number(x.amount))+'</span>'
      +'<br><button class="btn small" style="margin:8px 6px 0 0" data-act="lvok" data-i="'+i+'">Подтверждаю</button><button class="btn sec small" style="margin-top:8px" data-act="lvno" data-i="'+i+'">Это ошибка</button></div></div>').join('')+'</div>';
}
async function lvDecide(i,dec){
  const x=(S.lv||[])[i];if(!x)return;
  if(!confirm((dec==='confirmed'?'Подтверждаете: ':'Отклоняете (ошибка в отчёте): ')+(x.name||'?')+', '+ruDate(x.date)+', '+sgn(Number(x.amount))+'?'))return;
  try{
    const r=await rpc('ev_leave_decide',{p_token:S.token,p_branch:x.branch,p_date:x.date,p_person:Number(x.person_id),p_decision:dec,p_note:null},10000);
    if(!r||!r.ok){toast(r&&r.error==='session'?'Сессия закончилась, войдите заново':'Не удалось: '+(r&&r.error),5000);loadMr();return}
    toast(dec==='confirmed'?'Подтверждено':'Отклонено',3000);loadMr();
  }catch(e){toast(e.net?'Нет связи':'Ошибка сервера',5000)}
}
function mrHtml0(){
  if(!isHead()||!S.mr)return'';
  const pend=S.mr.filter(x=>x.status==='pending'),done=S.mr.filter(x=>x.status!=='pending').slice(0,5);
  if(!pend.length&&!done.length)return'';
  let h='<div class="card k-mr">';
  if(pend.length){
    h+='<h2>Подтвердите инкассацию: '+pend.length+'</h2><p class="hint">Администратор записал, что МР забрал эти деньги. Пока вы не ответили, строка висит в сверке как «ждёт подтверждения».</p>';
    h+=pend.map(x=>{
      const hrs=Math.max(0,Math.round((Date.now()-new Date(x.created_at).getTime())/3600000));
      return '<div class="chk warn"><i>!</i><div><b>'+esc(brTitle(x.branch))+' · '+ruDate(x.date)+'</b><br>Админ: '+esc(x.admin||'?')+'<br><span style="font-size:20px;font-weight:700">'+money(Number(x.declared))+'</span><small> · ждёт '+hrs+' ч</small>'
        +'<br><button class="btn small" style="margin:8px 0 6px" data-act="mrok" data-id="'+x.id+'">Подтверждаю</button>'
        +'<div class="row" style="align-items:flex-end;gap:6px"><label class="f" style="flex:1;margin:0"><span>Не подтверждаю, фактически ₽</span><input id="mra-'+x.id+'" inputmode="decimal" placeholder="сколько на самом деле"></label>'
        +'<button class="btn sec small" data-act="mrno" data-id="'+x.id+'">Отправить</button></div></div></div>';
    }).join('');
  }
  if(done.length)h+='<h3 style="margin-top:12px">Недавние решения</h3>'+done.map(x=>'<div class="chk '+(x.status==='confirmed'?'ok':'bad')+'"><i>'+(x.status==='confirmed'?'✓':'✗')+'</i><div><small>'+esc(brTitle(x.branch))+' · '+ruDate(x.date)+' · '+esc(x.admin||'?')+'</small><br>'
    +(x.status==='confirmed'?'подтверждено '+money(Number(x.declared)):'заявлено '+money(Number(x.declared))+', фактически '+money(Number(x.actual)))+'</div></div>').join('');
  return h+'</div>';
}
function paintMr(){document.querySelectorAll('.mrbox').forEach(el=>{el.innerHTML=S.view==='branch'?mrHtml0()+lvHtml():mrHtml()})} /* 2.0: на главной руководителя — только то, что ждёт подтверждения */
async function loadMr(){
  if(!S.token||!isHead())return;
  try{const r=await rpc('ev_mr_list',{p_token:S.token},8000);if(r&&r.ok){S.mr=r.items||[];paintMr()}}catch(e){}
  try{const r=await rpc('ev_cash_on_hand',{p_token:S.token},8000);S.cash=(r&&r.ok)?r:null;paintMr()}catch(e){}
  try{const r=await rpc('ev_leave_pending',{p_token:S.token},8000);if(r&&r.ok){S.lv=r.items||[];paintMr()}}catch(e){}
}
async function mrDecide(id,decision,actual){
  const x=(S.mr||[]).find(i=>String(i.id)===String(id));if(!x)return;
  const q=decision==='confirm'?'Подтверждаете, что МР забрал '+money(Number(x.declared))+'?\n'+brTitle(x.branch)+', '+ruDate(x.date)+', админ '+(x.admin||'?')
    :'Не подтверждаете. Фактически забрали '+money(actual)+' вместо '+money(Number(x.declared))+'?\nРазница '+money(Number(x.declared)-actual)+' уйдёт в журнал как красная находка.';
  if(!confirm(q))return;
  try{
    const r=await rpc('ev_mr_decide',{p_token:S.token,p_id:Number(id),p_decision:decision,p_actual:decision==='dispute'?actual:null,p_note:null},10000);
    if(!r||!r.ok){toast(r&&r.error==='not_pending'?'Уже решено, обновляю':(r&&r.error==='session'?'Сессия закончилась, войдите заново':'Не удалось: '+(r&&r.error)),5000);loadMr();return}
    toast(r.status==='confirmed'?'Подтверждено':'Записано: расхождение',4000);loadMr();
  }catch(e){toast(e.net?'Нет связи':'Ошибка сервера',5000)}
}
/* 1.52: в «Контроле» вместо «ID врача 102» — ФИО (ev_vm_names, только руководитель) */
function nameDetail(d){
  const m=S.vmNames,t=String(d);
  const mt=/^ID врача (\d+)$/.exec(t);
  if(mt&&m&&m[mt[1]])return '<b>'+esc(m[mt[1]])+'</b> (ID '+mt[1]+')';
  return esc(t);
}
async function loadVmNames(){
  if(!isHead()||S.vmNames||S.vmNamesBusy)return;
  S.vmNamesBusy=true;
  try{const r=await rpc('ev_vm_names',{p_token:S.token},6000);if(r&&r.ok){S.vmNames=r.names||{};if(S.view==='ctl'||S.view==='form')paint()}}catch(e){}
  S.vmNamesBusy=false;
}
const FLAG_HINT={late_edit:'Отчёт изменён после 12:00 следующего дня: проверьте автора и причину.',locked_edit:'Изменён отчёт закрытого периода, по которому зарплата уже рассчитана: цифры могли разойтись с выплатой.'};
const VM_COVERAGE_GAPS=[
  ['invoices_complete','не подтверждены счета'],
  ['revenue_summary_complete','не подтверждена выручка'],
  ['payments_complete','не подтверждены наличные и безналичные платежи'],
  ['cashbox_complete','не получено закрытие кассы Vetmanager']
];
/* 1.92 (2059c1b): причина неполной сверки — перенесено в 2.0 без изменений */
function vmCoverageText(x){
  if(!x||!x.coverage)return'';
  const c=x&&x.coverage||{};
  const gaps=VM_COVERAGE_GAPS.filter(g=>c[g[0]]!==true).map(g=>g[1]);
  return gaps.length?'Нужно разобрать: '+gaps.join(', ')+'.':'Причина неполноты не указана в результате сверки.';
}
function vmCoverageForFlag(f){
  return (S.ctlCoverage||[]).find(x=>
    String(x.branch)===String(f.branch||S.branch)
    &&String(x.date)===String(f.date||S.date)
    &&Number(x.version)===Number(f.version)
  );
}
function flagLine(f,where){
  const bad=f.level==='red';
  let nums='';
  if(f.expected!=null&&f.actual!=null)nums='в отчёте '+money(Number(f.actual))+', ожидалось '+money(Number(f.expected))+(f.diff!=null?', разница '+sgn(Number(f.diff)):'');
  else if(f.actual!=null)nums=String(Number(f.actual));
  const bid=f.branch||S.branch,dt=f.date||S.date;
  const bt=(BRANCHES.find(b=>b.id===bid)||{}).title||bid;
  const who=where==='ctl'?'<small>'+esc(bt)+' · '+ruDate(dt)+'</small><br>':'';
  const vmDetail=f.code==='vm_partial'?vmCoverageText(vmCoverageForFlag(f)):'';
  return '<div class="chk '+(f.accepted?'wait':bad?'bad':'warn')+'"><i>'+(f.accepted?'✓':'!')+'</i><div>'+who+'<b>'+esc(f.title)+'</b>'
    +(nums?'<br><small>'+esc(nums)+'</small>':'')
    +(isHead()&&FLAG_HINT[f.code]?'<br><small>'+FLAG_HINT[f.code]+'</small>':'')+(isHead()&&(vmDetail||f.detail)?'<br><small>'+nameDetail(vmDetail||f.detail)+'</small>':'')
    +(f.accepted?'<br><small>принято руководителем</small>':'')
    +(where==='ctl'&&!f.accepted&&(f.blocked||['vm_not_checked','vm_partial'].includes(f.code))?'<br><small><b>Ждёт сверку Штаба</b></small>':'')
    +(where==='ctl'&&f.accepted&&f.accepted_by?'<br><small>принял: '+esc(f.accepted_by)+(f.accepted_at?' · '+omskAt(f.accepted_at):'')+'</small>':'')
    +(isHead()&&!f.accepted&&!['vm_not_checked','vm_partial'].includes(f.code)?'<br><span class="fbtns"><button class="btn sec small" data-act="'+(where==='ctl'?'ctlquick':'accept')+'" data-bid="'+esc(bid)+'" data-dt="'+esc(dt)+'" data-code="'+esc(f.code)+'" data-ver="'+(Number(f.version)||0)+'">Принять</button><button class="btn sec small" data-act="fdet" data-bid="'+esc(bid)+'" data-dt="'+esc(dt)+'" data-code="'+esc(f.code)+'" data-ver="'+(Number(f.version)||0)+'">Подробнее</button></span>':'')
    +'</div></div>';
}
function flagsHtml(){
  const all=S.flags||[];if(!all.length)return'';
  const open=all.filter(f=>!f.accepted);
  return '<div class="card k-flags"><h2>Расхождения по отчёту: '+open.length+'</h2><p class="hint">'
    +(isHead()?'Так их видите вы. «Принять» значит: разобрался, вопросов нет.':'Эти расхождения видите вы и руководитель. Проверьте цифры; если нашли ошибку, исправьте отчёт и укажите причину.')
    +'</p>'+all.map(f=>flagLine(f,'form')).join('')+'</div>';
}
async function loadFlags(branch,date){
  if(!S.token)return;
  const key=branch+'|'+date;S.flagsFor=key;
  try{
    const r=await rpc('ev_my_flags',{p_token:S.token,p_branch:branch,p_date:date},6000);
    if(S.flagsFor!==key||!r||!r.ok)return;
    S.flags=r.flags||[];loadVmNames();
    const fb=$('#flagbox');if(fb)fb.innerHTML=flagsHtml();
  }catch(e){}
}
function paint(){const y=window.scrollY;render();window.scrollTo(0,y)}
/* 2.0: одна нижняя навигация из утверждённого макета; разделы главной здесь не дублируются. */
const uiNew=()=>true;
const NAV_ICON={
  home:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 11L12 4l8.5 7"/><path d="M6 9.5V20h12V9.5"/></svg>',
  schedule:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  accruals:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 20V4h5.5a4 4 0 010 8H6M6 16h8"/></svg>',
  menu:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  rev:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/></svg>',
  safe:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="12" cy="12" r="3"/><path d="M12 9v1M15 12h-1"/></svg>',
  ppl:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.8-3.2 3-5 5.5-5s4.7 1.8 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M16 14c2.4 0 4 1.6 4.6 4"/></svg>'
};
function bottomNavItems(){
  /* 2.0 §15: у руководителя 5 вкладок — Выручка, График, Сейф, Люди, Меню (config.js navByRole.head) */
  const keys=(UI2.navByRole||{})[isHead()?'head':isCourier()?'courier':'default']||['home','schedule','accruals','menu'];
  return keys.map(k=>({
    key:k,
    label:{home:'Главная',schedule:'График',accruals:isHead()?'Зарплата':'Начисления',menu:'Меню',rev:'Выручка',safe:'Сейф',ppl:'Люди'}[k],
    view:k==='home'?'branch':k==='schedule'?'sched':k==='accruals'?(isHead()?'ppl':'work'):k==='rev'?'rev':k==='safe'?'safe':k==='ppl'?'ppl':'menu'
  }));
}
function navHtml(){
  const cur=S.view==='branch'?'home':S.view==='sched'?'schedule':S.view==='pay'&&isHead()&&S.paySafe?'':(S.view==='work'||S.view==='pay'||S.view==='sal')?'accruals':'';
  return '<nav class="nv ui2-bottom-nav">'+bottomNavItems().map(n=>'<button '+(n.key==='menu'?'data-act="menu"':'data-act="go" data-v="'+n.view+'"')+' class="'+(cur===n.key?'on':'')+'"><i>'+NAV_ICON[n.key]+'</i>'+n.label+'</button>').join('')+'</nav>';
}
async function showControl(){
  S.view='ctl';S.ctlLoad=true;S.ctlErr=null;paint();window.scrollTo(0,0);loadMr();loadVmNames();loadVmFlags();
  try{
    const r=await rpc('ev_flags_pending',{p_token:S.token},20000);
    if(!r||!r.ok)S.ctlErr=(r&&r.error==='session'?'Сессия закончилась, войдите заново.':'Нет доступа.');
    else{S.ctl=r.pending||[];S.ctlCoverage=r.coverage||[];S.ctlAccepted=r.accepted||[]}
  }catch(e){S.ctlErr=e.net?'Нет связи.':'Ошибка сервера.'}
  S.ctlLoad=false;if(S.view==='ctl')paint();
}
function ctlReady(fl){return (fl||[]).filter(f=>!f.accepted&&!f.blocked&&!['vm_not_checked','vm_partial'].includes(f.code))}
function ctlPayload(f){return{branch:f.branch||S.branch,date:f.date||S.date,code:f.code,version:Number(f.version)||0,confirm_money:true}}
async function ctlAccept(items){
  if(S.ctlBusy||!items.length)return;S.ctlBusy=true;closeOv();if(S.view==='ctl')paint();
  try{
    const r=await rpc('ev_accept_quick',{p_token:S.token,p_items:items.slice(0,500)},30000);
    if(!r||!r.ok)toast(r&&r.error==='awaiting_shtab_check'?'Сначала нужна сверка Штаба':r&&r.error==='session'?'Сессия закончилась, войдите заново':'Не удалось принять',5000);
    else toast(r.accepted?'Принято: '+r.accepted:'Уже было принято');
  }catch(e){toast(e.net?'Нет связи':'Ошибка сервера',5000)}
  S.ctlBusy=false;S.revStatusAt=0;if(S.view==='ctl')await showControl();
}
/* c30: список старых дней для раздела «Старые, сверка невозможна»: по одной строке на филиал и дату (находка и строка сверки за один день не дублируются) */
function ctlOldRows(flAll,cv){
  const m=new Map(),bt=b=>(BRANCHES.find(x=>x.id===b)||{}).title||b;
  (cv||[]).filter(ctlOldCov).forEach(x=>{
    const why={pending:'Сверка не проводилась.',missing:'Данных сверки нет.'}[x.status]||'Сверка не завершена.';
    m.set(x.branch+'|'+x.date,{branch:x.branch,title:bt(x.branch),date:x.date,reason:(why+' '+vmCoverageText(x)).trim()});
  });
  (flAll||[]).filter(ctlOldFlag).forEach(f=>{const k=(f.branch||'')+'|'+f.date;if(!m.has(k))m.set(k,{branch:f.branch,title:bt(f.branch),date:f.date,reason:String(f.title||'Сверка Vetmanager не проведена.')})});
  return [...m.values()].sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:String(a.branch).localeCompare(String(b.branch)));
}
function ctlHtml(){
  let h='<div class="mrbox">'+mrHtml()+'</div>'+vmFlagsHtml()+'<div class="card"><h2>Контроль · с 27.10</h2>';
  if(S.ctlErr)h+='<p>'+esc(S.ctlErr)+'</p><button class="btn sec small" data-act="go" data-v="ctl">Повторить</button>';
  else if(S.ctlLoad&&!S.ctl)h+='<p class="hint">Загружаю…</p>';
  else{
    const flAll=S.ctl||[],fl=flAll.filter(f=>!ctlOldFlag(f)),open=fl,cv=S.ctlCoverage||[],cvLive=cv.filter(x=>!ctlOldCov(x)),ready=ctlReady(fl),done=S.ctlAccepted||[];
    const oldRows=ctlOldRows(flAll,cv);
    const complete=cv.filter(x=>x.status==='complete').length;
    const waiting=cvLive.filter(x=>['pending','missing'].includes(x.status));
    const pending=waiting.length;
    const incompleteRows=cvLive.filter(x=>!['complete','pending','missing'].includes(x.status)),incomplete=incompleteRows.length;
    const staleDays=waiting.reduce((n,x)=>Math.max(n,Math.max(0,Math.floor((Date.parse(omskToday()+'T00:00:00Z')-Date.parse(String(x.date||'')+'T00:00:00Z'))/86400000))),0);
    h+='<p class="hint">Ждут решения: '+open.length+'. Vetmanager подтвердил '+complete+' из '+cv.length+' текущих версий отчётов.</p>';
    if(pending)h+=staleDays>2
      ?'<div class="chk warn"><i>!</i><div><b>Сверка Vetmanager не проводилась '+staleDays+' '+(staleDays%10===1&&staleDays%100!==11?'день':([2,3,4].includes(staleDays%10)&&![12,13,14].includes(staleDays%100)?'дня':'дней'))+'</b><br><small>Ожидание длится больше двух суток. Строка видна только руководителю; отчёты и суммы она не меняет.</small></div></div>'
      :'<div class="chk wait"><i>…</i><div><b>Ожидают плановой сверки: '+pending+'</b><br><small>Сегодняшние отчёты проверятся автоматически после закрытия смен. Ничего принимать вручную не нужно.</small></div></div>';
    if(incomplete){const details=incompleteRows.map(x=>{const bt=(BRANCHES.find(b=>b.id===x.branch)||{}).title||x.branch;return bt+' · '+ruDate(x.date)+': '+vmCoverageText(x)}).join(' ');h+='<div class="chk bad"><i>!</i><div><b>Сверка Vetmanager не завершена: '+incomplete+'</b><br><small>'+esc(details)+'</small></div></div>'}
    if(ready.length)h+='<button class="btn ctl-all" data-act="ctlall"'+(S.ctlBusy?' disabled':'')+'>Принять всё ('+ready.length+')</button><p class="hint">Красные сверху. Деньги и отчёты не меняются.</p>';
    h+=fl.length?fl.map(f=>flagLine(f,'ctl')).join(''):(cvLive.length&&complete+pending===cvLive.length?(pending?'<p>Подтверждённых расхождений сейчас нет. Идёт плановая сверка сегодняшних отчётов.</p>':'<p>Расхождений нет. Все текущие версии отчётов подтверждены Vetmanager.</p>'):'<p>Нет подтверждённых данных для вывода «расхождений нет».</p>');
    if(oldRows.length)h+='<details class="ctl-old"><summary>Старые, сверка невозможна ('+oldRows.length+')</summary><p class="hint">Эти дни старше 14 дней: сверку Vetmanager за них записать уже нельзя. Решения от вас не требуются.</p>'+oldRows.map(o=>'<div class="ctl-old-row"><b>'+esc(o.title)+' · '+ruDate(o.date)+'</b><br><small>'+esc(o.reason)+'</small></div>').join('')+'</details>';
    h+='<details class="ctl-done"><summary>Принято ('+done.length+')</summary>'+(done.length?done.map(f=>flagLine(f,'ctl')).join(''):'<p class="hint">Пока ничего не принято.</p>')+'</details>';
  }
  return h+'</div>';
}

/* 1.58: «Подробнее» к находке контроля (только руководитель; данные ev_flag_detail, при её отсутствии — только то, что уже на экране) */
const FDET_WHY={
  many_edits:'Отчёт за день отправляли несколько раз. Каждая версия сохраняется: ниже видно, кто и что менял. Само по себе не ошибка; смотрите, менялись ли деньги.',
  two_authors:'Отчёт подавали или правили разные люди (администратор, другой администратор или руководитель). Проверьте, что каждая правка законная.',
  correction_money:'Исправление изменило суммы относительно предыдущей версии. Строки «что изменилось» ниже показывают, что именно.',
  vm_doctor:'Вал врача в отчёте не равен счетам в Vetmanager. Частая причина: смешанный счёт (в шапке один врач, в строках ответственный другой) или перенос суммы между врачами.',
  pay_split:'Наличные + безнал не равны «Клиника общая»: где-то неверно разнесена оплата.',
  box:'Остаток кассы не равен ожидаемому по отчёту (нал, расходы, инкассация, аванс).',
  no_report:'За этот день отчёт не подан.',
  late_edit:FLAG_HINT.late_edit,locked_edit:FLAG_HINT.locked_edit
};
const omskAt=t=>{try{return new Date(t).toLocaleString('ru-RU',{timeZone:'Asia/Omsk',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}catch(e){return ''}};
const fnum=x=>(x==null||x==='')?'—':(isNaN(Number(x))?esc(String(x)):money(Number(x)));
function fdetBody(ds,r,fallback){
  const f0=((S.ctl||[]).concat(S.flags||[])).find(f=>(f.branch||S.branch)===ds.bid&&(f.date||S.date)===ds.dt&&f.code===ds.code&&(Number(f.version)||0)===(Number(ds.ver)||0))||{};
  const bt=(BRANCHES.find(b=>b.id===ds.bid)||{}).title||ds.bid;
  let h='<div class="fdet"><h2>'+esc(f0.title||ds.code)+'</h2><p class="hint">'+esc(bt)+' · '+ruDate(ds.dt)+(Number(ds.ver)?' · версия отчёта '+Number(ds.ver):'')+'</p>';
  h+='<h3>Что это значит</h3><p style="margin:0">'+esc(FDET_WHY[ds.code]||'Описание для этого типа находки не заготовлено: смотрите цифры ниже.')+'</p>';
  const nums=[];
  if(f0.expected!=null&&f0.actual!=null)nums.push('в отчёте '+money(Number(f0.actual))+', ожидалось '+money(Number(f0.expected))+(f0.diff!=null?', разница '+sgn(Number(f0.diff)):''));
  else if(f0.actual!=null)nums.push(({many_edits:'версий отчёта: ',two_authors:'разных авторов: '}[ds.code]||'значение: ')+esc(String(f0.actual)));
  if(f0.detail)nums.push(nameDetail(f0.detail));
  if(nums.length)h+='<h3>Цифры находки</h3><p style="margin:0">'+nums.join('<br>')+'</p>';
  if(r&&r.ok){
    const vs=r.versions||[];
    if(vs.length){
      h+='<h3>Кто и что подавал и правил</h3>';
      vs.forEach(v=>{
        h+='<div class="vr"><b>v'+v.version+'</b> · '+(v.by_shtab?'внесено Штабом по команде руководителя':esc(v.by||'?'))+' · '+omskAt(v.at)+(v.correction?' · правка':' · первая подача')+' · итог '+fnum(v.total)
          +(v.reason?'<br><small>Причина: '+esc(v.reason)+'</small>':'')
          +((v.changes||[]).length?(v.changes).map(c=>'<span class="chg">'+esc(c.field)+': '+fnum(c.from)+' → '+fnum(c.to)+'</span>').join(''):(v.version>1?'<small>Цифры не менялись (только текст/состав).</small>':''))+'</div>';
      });
    }
    const sib=(r.findings||[]).filter(x=>!(x.code===ds.code&&(Number(x.version)||0)===(Number(ds.ver)||0)));
    if(sib.length)h+='<h3>Другие находки за этот день</h3>'+sib.map(x=>'<div class="vr"><b>'+esc(x.title)+'</b> (v'+(x.version||'?')+', '+(x.level==='red'?'красная':'жёлтая')+')'+(x.detail?'<br><small>'+nameDetail(x.detail)+'</small>':'')+'</div>').join('');
    if((r.accepted||[]).length)h+='<h3>Что уже принималось</h3>'+r.accepted.map(a=>'<div class="vr"><b>'+esc(a.code)+'</b> v'+(a.version||0)+' · '+esc(a.by||'')+' · '+omskAt(a.at)+(a.note?'<br><small>'+esc(a.note)+'</small>':'')+'</div>').join('');
    if((r.agent_notes||[]).length)h+='<h3>Записи агентов</h3>'+r.agent_notes.map(a=>'<div class="vr"><b>'+esc(a.agent)+'</b> · '+omskAt(a.at)+'<br><small>'+esc(a.summary)+'</small></div>').join('');
    h+='<p class="hint" style="margin-top:12px">Пояснение выше шаблонное, а не расследование: причину устанавливаете вы по версиям и записям.</p>';
  }else{
    const sib=(S.ctl||[]).filter(x=>(x.branch||S.branch)===ds.bid&&(x.date||S.date)===ds.dt&&x!==f0);
    if(sib.length)h+='<h3>Другие находки за этот день</h3>'+sib.map(x=>'<div class="vr"><b>'+esc(x.title)+'</b>'+(x.detail?'<br><small>'+nameDetail(x.detail)+'</small>':'')+'</div>').join('');
    h+='<p class="hint" style="margin-top:12px">'+(fallback==='load'?'Загружаю версии и авторов…':'Версии отчёта и авторы сейчас недоступны'+(fallback==='net'?' (нет связи).':'.'))+'</p>';
  }
  const open=!f0.accepted;
  h+=(open?'<button class="btn" style="margin-top:8px" data-act="ctlquick" data-bid="'+esc(ds.bid)+'" data-dt="'+esc(ds.dt)+'" data-code="'+esc(ds.code)+'" data-ver="'+(Number(ds.ver)||0)+'">Принять</button>':'<p class="hint">Уже принято руководителем.</p>')
    +'<button class="btn sec" style="margin-top:8px" data-act="ovclose">Назад</button></div>';
  return h;
}
async function showFlagDetail(ds){
  if(!isHead())return;
  overlay(fdetBody(ds,null,'load'));
  let r=null,fb='err';
  try{r=await rpc('ev_flag_detail',{p_token:S.token,p_branch:ds.bid,p_date:ds.dt,p_code:ds.code},10000);if(r&&r.error==='session'){toast('Сессия закончилась, войдите заново',5000);return}}catch(e){fb=e&&e.net?'net':'err'}
  if(!$('#ovwrap .fdet'))return; /* закрыли или открыли другое окно */
  overlay(fdetBody(ds,r&&r.ok?r:null,fb));
}
function acceptForm(ds){
  S.accDs=ds;
  overlay('<h2>Принять расхождение</h2><p class="hint">'+esc(ds.bid)+', '+esc(ds.dt)+'. Напишите причину (не короче 15 символов): она сохранится в журнале.</p><label class="f"><span>Причина</span><input id="accnote" maxlength="300" autocomplete="off" placeholder="например: исправлено в Vetmanager, в отчёте верно"></label><button class="btn" data-act="acceptgo" style="margin-top:8px">Принять</button><button class="btn sec" style="margin-top:8px" data-act="ovclose">Отмена</button>');
}
async function doAccept(ds,note){
  const ver=Number(ds.ver)||0;
  if(note!==undefined&&note.trim().length<15){toast('Причина слишком короткая: нужно минимум 15 символов',4000);return}
  try{
    const r=await rpc('ev_accept',{p_token:S.token,p_branch:ds.bid,p_date:ds.dt,p_code:ds.code,p_version:ver,p_note:note===undefined?null:note.trim()},8000);
    if(!r||!r.ok){toast(r&&r.error==='session'?'Сессия закончилась, войдите заново':'Не удалось принять: '+(r&&r.error),5000);return}
    closeOv();
    const mark=f=>{if((f.branch||S.branch)===ds.bid&&(f.date||S.date)===ds.dt&&f.code===ds.code&&(Number(f.version)||0)===ver)f.accepted=true};
    (S.ctl||[]).forEach(mark);(S.flags||[]).forEach(mark);
    if(S.view==='ctl')paint();
    const fb=$('#flagbox');if(fb)fb.innerHTML=flagsHtml();
    toast('Принято');
  }catch(e){toast(e.net?'Нет связи':'Ошибка сервера',5000)}
}


function overlay(html){S.ctlOpen=false;$('#ovwrap').innerHTML='<div class="ov" data-act="ovclose"><div class="card" data-stop="1">'+html+'</div></div>'}
function closeOv(){S.ctlOpen=false;$('#ovwrap').innerHTML=''}
function showMenu(){
  if(isHead()){
    /* 2.0, решение Михаила 17.11: меню руководителя — только редкое */
    overlay('<h2>Меню</h2><button class="btn sec" style="margin:6px 0" data-act="muopen">Ручная загрузка (врачи, банк, графики)</button><button class="btn sec" style="margin:6px 0" data-act="mupinopen">Доступы и PIN</button><button class="btn sec" style="margin:6px 0" data-act="subadmin">Заменить администратора</button><button class="btn sec" style="margin:6px 0" data-act="bdprevmenu">Пример поздравления</button><button class="btn sec" style="margin:14px 0 6px" data-act="logout">Выйти</button><button class="btn sec" style="margin:6px 0" data-act="ovclose">Закрыть</button>');
    return;
  }
  overlay('<h2>Меню</h2>'+(isHead()?'<button class="btn sec" style="margin:6px 0" data-act="go" data-v="branch">Модули клиники (вакцины, препараты, доступы)</button><button class="btn sec" style="margin:6px 0" data-act="go" data-v="ctl">Контроль: что требует внимания</button>'+'<button class="btn sec" style="margin:6px 0" data-act="workopen">Мои начисления</button><button class="btn sec" style="margin:6px 0" data-act="schedopen">График смен</button><button class="btn sec" style="margin:6px 0" data-act="cchead">Колл-центр: смены и оплата</button><button class="btn sec" style="margin:6px 0" data-act="muopen">Ручная загрузка (начисления, банк, PIN)</button><button class="btn sec" style="margin:6px 0" data-act="testbr">Тестовый филиал (для проверок)</button>':'')+(isCC()&&!isHead()&&S.view!=='cc'?'<button class="btn sec" style="margin:6px 0" data-act="ccopen">Колл-центр: мои смены</button>':'')+(canReport()&&S.view==='cc'&&!isHead()?'<button class="btn sec" style="margin:6px 0" data-act="back">Отчёт филиала</button>':'')+(canReport()?'<button class="btn sec" style="margin:6px 0" data-act="help">Как заполнять отчёт</button>':'')+(isCC()&&!isHead()?'<a class="btn sec" style="margin:6px 0" href="help/instruktsiya_callcenter.pdf" target="_blank" rel="noopener">Инструкция оператора (PDF)</a>':'')+'<button class="btn sec" style="margin:6px 0" data-act="chpin">Сменить PIN</button><button class="btn sec" style="margin:6px 0" data-act="logout">Выйти</button><button class="btn sec" style="margin:6px 0" data-act="ovclose">Закрыть</button><p class="hint">Версия '+CFG.appVer+'</p>');
}
/* c13: руководитель заполняет отчёт за администратора ТОЛЬКО так: Меню → «Заменить администратора» → филиал → подтверждение */
function subAdminPick(){
  overlay('<h2>Заменить администратора</h2><p class="hint">Выберите филиал. Отчёт за этот день внесёте вы, от своего имени.</p>'
    +BRANCHES.filter(b=>!b.testOnly).map(b=>'<button class="btn sec" style="margin:6px 0" data-act="subadminpick" data-id="'+esc(b.id)+'">'+esc(b.title)+'</button>').join('')
    +'<button class="btn sec" style="margin:10px 0 0" data-act="ovclose">Отмена</button>');
}
function subAdminConfirm(id){
  overlay('<h2>Подтвердите замену</h2><p style="margin:0 0 10px">Вы заполняете отчёт за администратора: <b>'+esc(brTitle(id))+'</b>, '+esc(S.date===omskToday()?'сегодня':ruDate(S.date))+'.</p><p class="hint">Отчёт будет сдан от вашего имени и виден в «Кто внёс».</p>'
    +'<button class="btn" data-act="subadminyes" data-id="'+esc(id)+'">Да, заполнять отчёт</button><button class="btn sec" style="margin:8px 0 0" data-act="ovclose">Отмена</button>');
}
function showQueue(){
  let h='<h2>Отправка данных</h2><p class="hint">'+(S.online?'Связь есть.':'Связи нет — записи ждут на устройстве.')+'</p>';
  if(S.queue.some(x=>x.status==='error'))h+='<p class="hint"><b>Старая ошибочная отправка сама больше не повторяется.</b> Сначала можно скопировать итоги, затем убрать её из очереди. Это не удаляет уже принятые отчёты и не затрагивает сегодняшний отчёт.</p>';
  if(!S.queue.length&&!S.handoverQueue.length)h+='<p>Всё отправлено, очередь пуста.</p>';
  S.queue.forEach(it=>{
    h+='<div class="person"><b>'+esc(it.branchTitle)+' · '+ruDate(it.date)+'</b><small style="color:var(--mute)">'+esc({new:'ожидает',offline:'нет связи, повторим',error:'не отправится само: '+(it.err||'ошибка'),needs_reason:'нужна причина исправления',need_login:'нужно войти заново'}[it.status]||it.status)+'</small>';
    if(it.status==='needs_reason')h+='<label class="f"><span>Причина исправления</span><input id="rs-'+it.uid+'"></label><button class="btn small" data-act="setReason" data-id="'+it.uid+'">Отправить с причиной</button>';
    h+=' <button class="btn sec small" data-act="copyq" data-id="'+it.uid+'">Копировать итоги</button>';
    if(it.status==='error')h+=' <button class="btn small" data-act="retryq" data-id="'+it.uid+'">Повторить один раз</button>';
    if(it.status==='error'||it.status==='need_login'||it.status==='needs_reason')h+=' <button class="btn sec small" data-act="dropq" data-id="'+it.uid+'">'+(it.status==='error'?'Убрать старую отправку':'Убрать из очереди')+'</button>';
    h+='</div>';
  });
  S.handoverQueue.forEach(it=>{
    h+='<div class="person"><b>Приём кассы · '+esc((BRANCHES.find(b=>b.id===it.branch)||{}).title||it.branch)+' · '+ruDate(it.date)+'</b><small style="color:var(--mute)">'+esc(it.status==='error'?'ошибка: '+(it.error||''):it.status==='offline'?'нет связи, повторим':'ожидает отправки')+'</small>';
    if(it.status==='error')h+=' <button class="btn sec small" data-act="drophq" data-id="'+it.uid+'">Убрать из очереди</button>';
    h+='</div>';
  });
  const retryable=S.queue.some(x=>x.status==='new'||x.status==='offline'||x.status==='need_login')||S.handoverQueue.some(x=>x.status!=='error');
  if(retryable)h+='<button class="btn" style="margin:6px 0" data-act="flush">Отправить сейчас</button>';
  h+='<button class="btn sec" data-act="ovclose">Закрыть</button>';
  overlay(h);
}
function showPin(){
  overlay('<h2>Смена PIN</h2><label class="f"><span>Текущий PIN</span><input id="p0" type="password" inputmode="numeric" maxlength="6"></label><label class="f"><span>Новый PIN (6 цифр)</span><input id="p1" type="password" inputmode="numeric" maxlength="6"></label><label class="f"><span>Новый PIN ещё раз</span><input id="p2" type="password" inputmode="numeric" maxlength="6"></label><button class="btn" data-act="dopin">Сменить</button><button class="btn sec" style="margin-top:8px" data-act="ovclose">Отмена</button>');
}
async function clip(t){
  try{await navigator.clipboard.writeText(t);toast('Скопировано')}
  catch(e){overlay('<h2>Скопируйте вручную</h2><pre>'+esc(t)+'</pre><button class="btn" data-act="ovclose">Закрыть</button>')}
}

/* ====== События ====== */
function setPath(o,p,v){const k=p.split('.');let t=o;for(let i=0;i<k.length-1;i++){if(t[k[i]]==null)t[k[i]]={};t=t[k[i]]}t[k[k.length-1]]=v}
function getPath(o,p){return p.split('.').reduce((t,k)=>t==null?t:t[k],o)}

document.addEventListener('input',e=>{
  const t=e.target;if(!t.dataset||!t.dataset.p||!S.form)return;
  if(t.inputMode==='decimal'){
    const pos=t.selectionStart==null?t.value.length:t.selectionStart;
    const keep=t.value.slice(0,pos).replace(/[^\d.,]/g,'').length;
    const nv=fmtNum(t.value);
    if(nv!==t.value){
      t.value=nv;
      let c=0,np=0;while(np<nv.length&&c<keep){if(/[\d.,]/.test(nv.charAt(np)))c++;np++}
      try{t.setSelectionRange(np,np)}catch(e){}
    }
  }
  setPath(S.form,t.dataset.p,t.value);
  if(t.inputMode==='decimal'){const v=num(t.value);t.classList.toggle('bad',isNaN(v))}
  saveDraft();updateChecks();
});
/* нижняя плашка: прячется только пока идёт набор, и сама возвращается через 4 с паузы; тап мимо поля убирает курсор */
let typT;
const isField=el=>!!(el&&el.matches&&el.matches('input,textarea,select'));
const showBar=()=>{clearTimeout(typT);document.body.classList.remove('typing')};
document.addEventListener('input',e=>{
  const t=e.target;
  if(t&&t.id==='paysr'){S.paySearch=t.value;const pos=t.selectionStart;paint();const n=document.getElementById('paysr');if(n){n.focus();try{n.setSelectionRange(pos,pos)}catch(_){}}return}
  if(t&&t.id==='sasr'){const q=t.value.trim().toLowerCase(),sel=document.getElementById('saw');if(sel){[...sel.options].forEach(o=>{o.hidden=!!q&&!o.textContent.toLowerCase().includes(q)});const f=[...sel.options].find(o=>!o.hidden);if(f)sel.value=f.value}}
});
document.addEventListener('input',e=>{if(!isField(e.target))return;document.body.classList.add('typing');clearTimeout(typT);typT=setTimeout(showBar,4000)},true);
document.addEventListener('focusout',()=>{setTimeout(()=>{if(!isField(document.activeElement))showBar()},150)});
document.addEventListener('keydown',e=>{
  const t=e.target;
  if(e.key!=='Enter'||S.view!=='form'||!t||!t.matches('input,select')||t.id==='pin')return;
  e.preventDefault();
  const fields=[...document.querySelectorAll('#app input:not([disabled]),#app select:not([disabled]),#app textarea:not([disabled])')].filter(x=>x.offsetParent!==null);
  const next=fields[fields.indexOf(t)+1];
  if(next){next.focus({preventScroll:true});next.scrollIntoView({block:'center',behavior:'smooth'});if(next.select&&next.tagName==='INPUT')next.select()}
  else{t.blur();showBar()}
});
document.addEventListener('pointerdown',e=>{const a=document.activeElement;if(isField(a)&&!e.target.closest('input,textarea,select,label,button'))a.blur()});
document.addEventListener('change',e=>{
  const t=e.target;
  if(t.classList&&t.classList.contains('schfile')){schPickFile(t);return}
  if(t.classList&&t.classList.contains('schmap')){if(S.mu&&S.mu.sch)S.mu.sch.map[t.dataset.n]=t.value;return}
  if(t.classList&&t.classList.contains('mufile')){if(t.dataset.k==='bank')muPickBank(t);else muPickVM(t);return}
  if(t.classList&&t.classList.contains('mubr')&&S.mu){const f=S.mu.files[Number(t.dataset.i)];if(f){f.branch=t.value;paint()}return}
  if(t.id==='mubper'&&S.mu&&S.mu.bank){S.mu.bank.period=t.value.split('|');paint();return}
  if(t.id==='mupinp'&&S.mu){S.mu.pinPerson=t.value;S.mu.pin=null;return}
  if(t.id==='dt'){S.date=t.value||omskToday();S.dateManual=S.date!==omskToday();return}
  if(t.dataset&&t.dataset.p&&S.form&&t.tagName==='SELECT'){setPath(S.form,t.dataset.p,t.value);
    const mm=/^expenses\.(\d+)\.article$/.exec(t.dataset.p);
    if(mm){const e=S.form.expenses[Number(mm[1])];if(e){e.method=isRet(e.article)?(e.method==='cash'||e.method==='noncash'?e.method:''):''}saveDraft();const y=window.scrollY;render();window.scrollTo(0,y);return}
    saveDraft();updateChecks()}
});
let loginPointerUntil=0;
/* На сенсорном экране принимаем цифру уже на pointerdown. Это убирает
   задержку/слипание быстрых касаний Safari; последующий click игнорируется. */
document.addEventListener('pointerdown',e=>{
  const b=e.target.closest&&e.target.closest('.ui2-pad button[data-act]');if(!b)return;
  e.preventDefault();loginPointerUntil=performance.now()+900;
  loginKeyPress(b.dataset.act,b.dataset.n);
},{capture:true});
document.addEventListener('click',async e=>{
  const ov=e.target.closest('.ov');
  if(ov&&!e.target.closest('[data-stop]')){closeOv();return}
  const b=e.target.closest('[data-act]');if(!b||b.classList.contains('ov'))return;
  const a=b.dataset.act,d=b.dataset;
  if(b.closest('.ui2-pad')&&performance.now()<loginPointerUntil)return;
  switch(a){
    case'wkper':showWork(d.from,d.to);break;
    case'wktab':S.wkTab=d.k;paint();break;
    case'wkshift':{const f=S.wkFrom,t=S.wkTo;if(!f)break;let a,b;if(d.d==='-1'){b=addDays(f,-1);a=perStart(b)}else{a=addDays(t,1);b=perEnd(a)}if(a<PAY_START||a>perStart(omskToday()))break;showWork(a,b);break}
    case'wkhist':{if(d.reload||!S.wkHist){S.wkHist=true;paint();loadHist()}else{S.wkHist=false;paint()}break}
    case'sakind':{const k=document.getElementById('sak');if(k)k.value=d.k;document.querySelectorAll('#sakc .chip').forEach(c=>c.classList.toggle('on',c.dataset.k===d.k));break}
    case'paytab':S.payTab=d.k;paint();break;
    case'paysel':{const m=S.paySel||(S.paySel={});m[d.id]=b.checked;paint();break}
    case'payxlsx':payXlsx();break;
    case'bdok':bdThanks();break;
    case'bdprevmenu':bdPreviewMenu();break;
    case'bdprev':bdPreview(d.g);break;
    case'bankkind':if(S.mu){S.mu.bankKind=d.k;paint()}break;
    case'mucancelvac':muCancel('vac',d.k);break;
    case'repstatus':repStatusOverlay();break;
    case'vacbranch':VX.branch=d.id;paint();break;
    case'vacentry':vacEntryStart();break;
    case'vacstep':{const e=VX.entry;if(!e)break;const n=Math.max(0,Math.min(9999,(parseInt(e.qty[d.id],10)||0)+Number(d.s)));e.qty[d.id]=String(n);e.savedAt=null;const inp=document.querySelector('.vq[data-id="'+d.id+'"]');if(inp)inp.value=n;break}
    case'vacday':{if(VX.entry){VX.entry.date=d.d;VX.entry.savedAt=null;paint()}break}
    case'vacsave':vacSave();break;
    case'vachist':vacHistStart();break;
    case'vachistbr':VX.branch=d.id;vacHistStart();break;
    case'vacback':VX.mode='list';VX.entry=null;paint();window.scrollTo(0,0);break;
    case'subadmin':subAdminPick();break;
    case'subadminpick':subAdminConfirm(d.id);break;
    case'subadminyes':openBranch(d.id,{asAdmin:true});break;
    case'schtemplate':schTemplateDownload();break;
    case'schimport':schImport();break;
    case'schpublish':schPublish();break;
    case'mupinopen':showMU();setTimeout(()=>{const e=document.getElementById('mupinp');if(e)e.scrollIntoView({behavior:'smooth',block:'center'})},600);break;
    case'paystat':S.payStat=d.k;paint();break;
    case'pplpayout':S.pplMode=!S.pplMode;S.pplId=null;paint();window.scrollTo(0,0);break;
    case'pplsalk':S.salPre=d.id;S.salKind=d.k;salAddForm();break;
    case'pplpin':S.muPre=d.id;showMU();break;
    case'payonly':S.payOnly=!S.payOnly;paint();break;
    case'payselall':{const m=S.paySel=S.paySel||{};const vis=new Set((S.payVisible||[]).map(String));((S.pay&&S.pay.rows)||[]).forEach(x=>{if(vis.has(String(x.id))&&!x.closed&&Number(x.to_pay)>0.005)m[x.id]=true});paint();break}
    case'payclose1':payCloseForm([d.id]);break;
    case'payclosesel':payCloseForm(Object.keys(S.paySel||{}).filter(k=>S.paySel[k]));break;
    case'payclosego':doPayClose();break;
    case'paycard':payCard(d.id);break;
    case'payaddform':payAddForm(d.id);break;
    case'payaddgo':doPayAdd(d.id);break;
    case'safeadd':doSafeAdd();break;
    case'transitgive':transitGiveForm();break;
    case'transitfix':transitFixForm();break;
    case'transitfixgo':doTransit('admin',true);break;
    case'transitpickup':transitPickupForm();break;
    case'safeexclretry':retrySafeExcl();break;
    case'transitgo':doTransit(d.source);break;
    case'safecancel':doSafeCancel(d.id);break;
    case'advform':advForm(d.id);break;
    case'advgo':doAdvAdd(d.id);break;
    case'advsettle':doAdvSettle(d.adv,d.debt,d.id);break;
    case'paycancel':doPayCancel(d.id,d.pid);break;
    case'payunclose':doPayUnclose(d.id);break;
    case'payprint':payPrint();break;
    case'paycardback':closeOv();break;
    case'paymeth':{const k=document.getElementById('pam');if(k)k.value=d.k;b.parentNode.querySelectorAll('.chip').forEach(c=>c.classList.toggle('on',c.dataset.k===d.k));break}
    case'payopenp':S.payOpen=S.payOpen===d.id?null:d.id;paint();break;
    case'paydates':S.payDates=!S.payDates;paint();break;
    case'paydatesgo':payDatesGo();break;
    case'payopen':closeOv();S.pplMode=false;S.paySafe=false;showPay();break;
    case'pplopen':S.pplId=d.id;paint();window.scrollTo(0,0);break;
    case'pplback':S.pplId=null;paint();window.scrollTo(0,0);break;
    case'pplgrp':S.pplTab=d.k;paint();break;
    case'pplsal':S.salPre=d.id;salAddForm();break;
    case'uitoggle':closeOv();if(uiNew())LS.set('ev_ui','old');else LS.del('ev_ui');S.pplMode=false;S.view='branch';render();window.scrollTo(0,0);toast(uiNew()?'Новый вид':'Прежний вид');break;
    case'salpayopen':{S.pplMode=false;const rg=salPayRange(S.salFrom,S.salTo);closeOv();if(rg)showPay(rg[0],rg[1]);else showPay();break}
    case'workopen':closeOv();showWork();break;
    case'muopen':showMU();break;
    case'muback':S.mu=null;S.view=homeView();render();window.scrollTo(0,0);break;
    case'muvmgo':muLoadVMFile(Number(d.i));break;
    case'muvmdrop':if(S.mu){S.mu.files.splice(Number(d.i),1);paint()}break;
    case'mubankgo':muLoadBank();break;
    case'mubankdrop':if(S.mu){S.mu.bank=null;paint()}break;
    case'mucancel':muCancel(d.kind,d.key);break;
    case'mupin':muIssuePin();break;
    case'mupinhide':if(S.mu){S.mu.pin=null;paint()}break;
    case'mupincopy':{const t=S.mu&&S.mu.pin?S.mu.pin.pin:'';try{await navigator.clipboard.writeText(t);toast('PIN скопирован')}catch(e){toast('Не удалось скопировать')}break}
    case'payper':showPay(d.from,d.to);break;
    case'paydefault':showPay();break;
    case'paycopy':copyPayroll();break;
    case'mrok':mrDecide(d.id,'confirm');break;
    case'hoaccept':acceptHandover();break;
    case'hocorrect':handoverCorrectForm();break;
    case'hocorrectgo':handoverCorrectGo(d.id);break;
    case'lvok':lvDecide(Number(d.i),'confirmed');break;
    case'lvno':lvDecide(Number(d.i),'rejected');break;
    case'mrno':{const inp=document.getElementById('mra-'+d.id),v=inp?Number(String(inp.value).replace(/\s/g,'').replace(',','.')):NaN;if(!inp||inp.value.trim()===''||!isFinite(v)||v<0){toast('Впишите, сколько на самом деле забрали (0 тоже можно)',5000);break}mrDecide(d.id,'dispute',v);break}
    case'testbr':if(isHead()){closeOv();S.dateManual=S.date!==omskToday();openBranch('test')}break;
    case'homebranches':showHomeBranches();break;
    case'prepare':S.prepareKey=d.k;S.view='prepare';render();window.scrollTo(0,0);break;
    case'htab':S.homeTab=d.t;LS.set('ev_htab',d.t);render();break;
    case'ltab':if(d.t===''){S.loginTab=null;S.notMe=true}else{S.loginTab=d.t;LS.set('ev_tab',d.t)}S.pick=null;render();break;
    case'notme':S.loginTab=null;S.notMe=true;S.pick=null;render();break;
    case'pick':S.pick=Number(d.id);render();setTimeout(()=>{const p=$('#pin');if(p)p.focus()},0);break;
    case'loginstart':if(!applySavedNumber()){S.loginScreen='keypad';S.loginStep='number';S.loginNumber='';S.loginPin=''}render();break;
    case'loginnotme':try{localStorage.removeItem(LOGIN_NUM_KEY)}catch(e){}S.loginRemembered=false;S.loginStep='number';S.loginNumber='';S.loginPin='';render();break;
    case'loginchange':S.loginStep='number';S.loginNumber='';S.loginPin='';render();break;
    case'logindel':loginKeyPress(a);break;
    case'logindigit':loginKeyPress(a,d.n);break;
    case'branch':{const dt=$('#dt');if(dt&&dt.value)S.date=dt.value;S.dateManual=S.date!==omskToday();openBranch(d.id);break}
    case'reloadctx':openBranch(S.branch);break;
    case'back':closeOv();saveDraftNow();S.view='branch';S.form=null;S.roHead=false;S.headFix=false;S.nosub=false;S.subAdmin=false;render();break;
    case'ccopen':closeOv();showCC();break;
    case'ccper':showCC(d.from,d.to);break;
    case'ccmark':ccMarkAsk(d.dt,d.on==='1');break;
    case'ccmarkgo':doCCMark();break;
    case'ccfor':ccForForm();break;
    case'ccforgo':doCCFor();break;
    case'tog':{
      const g=d.g,id=d.id,f=S.form;
      if(f[g][id])delete f[g][id];
      else f[g][id]=g==='doctors'?{val:''}:g==='admins'?{left:'',came:''}:{fn:0,fx:0,left:'',came:''};
      if(g==='doctors'&&f[g][id])f.no_doctor=false;
      if(g==='assistants')f.no_assistant=false;
      saveDraft();render();break}
    case'inc':{
      const cur=Number(getPath(S.form,d.p))||0;const nv=Math.max(0,Math.min(99,cur+Number(d.d)));
      setPath(S.form,d.p,nv);const k=d.p.split('.');const o=document.getElementById('o-'+k[1]+'-'+k[2]);if(o)o.textContent=nv;saveDraft();break}
    case'clearDraft':if(confirm('Очистить все введённые цифры в этой форме?')){LS.del(draftKey());S.draftTs=null;S.form=S.ctx.current?formFromReport(S.ctx.current.data):freshForm();syncOpeningFromHandover();render()}break;
    case'addExp':S.form.expenses.push({article:'',amount:'',comment:'',method:''});saveDraft();render();break;
    case'expm':{const e=S.form.expenses[Number(d.i)];if(e){e.method=d.m;saveDraft();const y=window.scrollY;render();window.scrollTo(0,y)}break}
    case'delExp':S.form.expenses.splice(Number(d.i),1);saveDraft();render();break;
    case'addOther':S.form.others.push({title:'',val:''});saveDraft();render();break;
    case'delOther':S.form.others.splice(Number(d.i),1);saveDraft();render();break;
    case'submit':if(!S.busy)submit();break;
    case'trap-pharm-closed':case'trap-pharm-fill':case'trap-sched-absent':case'trap-sched-add':case'trap-subst-yes':case'trap-subst-drop':await trapAct(a,b);break;
    case'assistantnone':S.form.no_assistant=true;saveDraft();closeOv();await submit();break;
    case'assistantadd':closeOv();setTimeout(()=>{const e=document.querySelector('.k-assist');if(e)e.scrollIntoView({behavior:'smooth',block:'start'})},0);break;
    case'doctornone':S.form.no_doctor=true;saveDraft();closeOv();await submit();break;
    case'doctoradd':closeOv();setTimeout(()=>{const e=document.querySelector('.k-docs');if(e)e.scrollIntoView({behavior:'smooth',block:'start'})},0);break;
    case'doctorflag':S.form.no_doctor=!S.form.no_doctor;if(S.form.no_doctor)S.form.doctors={};saveDraft();render();break;
    case'copy':if(S.done)clip(S.done.summary);break;
    case'headfix':headFix();break; /* L34a */
    case'repback':repBackToForm();break; /* L34 */
    case'copyq':{const it=S.queue.find(x=>x.uid===d.id);if(it)clip(it.summary);break}
    case'dropq':{const it=S.queue.find(x=>x.uid===d.id);if(!it)break;if(!confirm('Убрать старую отправку ('+it.branchTitle+', '+ruDate(it.date)+') из очереди на этом устройстве? Уже принятые отчёты и сегодняшний отчёт не изменятся. Итоги можно сначала скопировать.'))break;S.queue=S.queue.filter(x=>x.uid!==d.id);if(S.done&&S.done.uid===it.uid){S.done=null;if(S.view==='done')S.view='branch'}clearTimeout(toast.t);$('#toastwrap').innerHTML='';saveQueue();showQueue();render();break}
    case'retryq':{const it=S.queue.find(x=>x.uid===d.id);if(!it)break;it.status='new';it.err='';saveQueue();closeOv();await flush(false,it.uid);break}
    case'drophq':{const it=S.handoverQueue.find(x=>x.uid===d.id);if(!it)break;if(!confirm('Убрать неотправленную приёмку кассы из очереди?'))break;S.handoverQueue=S.handoverQueue.filter(x=>x.uid!==d.id);saveHandoverQueue();showQueue();render();break}
    case'vmwfix':{S.vmw=null;S.done=null;S.form=null;openBranch(d.branch);break}
    case'vmwhome':S.vmw=null;
    case'newrep':S.done=null;S.form=null;S.view='branch';S.date=omskToday();S.dateManual=false;if(!isHead()&&!S.queue.length&&!S.handoverQueue.length){logout();break}render();break; // 1.65: после сданного отчёта админ выходит сам
    case'menu':showMenu();break;
    case'schappt':{const s=schEnsure();s.apptDay=d.d;if(apptAllowed()&&apptInWindow(d.d)&&APPT.status==='idle')loadAppointments();else paint();break}
    case'schedopen':showSched();break;
    case'schtab':schEnsure().tab=d.t;paint();break;
    case'schday':{const s=schEnsure();s.day=d.d;const mm=d.d.slice(0,7);if(mm!==s.m&&!s.demo){s.m=mm;s.apptDay=null;if(s.data[mm])paint();else loadSched(mm)}else paint();break}
    case'schcal':{const s=schEnsure();s.calOpen=!s.calOpen;paint();break}
    case'schp':{const r=(schEnsure().pp||[])[Number(d.i)];if(!r||!r.full)break;const f=String(r.full||r.name||'').trim();
      /* 2.0, п.14: «Фамилия Имя Отчество» крупно, роль, где сегодня; без денег, телефона, PIN, доступов */
      const sc=schEnsure(),today=omskToday(),all=Object.values(sc.data||{}).flat(),nm=String(r.name||'').trim();
      const wh=[...new Set(all.filter(x=>x.date===today&&String(x.name||'').trim()===nm).map(x=>(schBk(x)==='cc'?'колл-центр':(SCH_B[schBk(x)]||[schBk(x)])[0])))];
      overlay('<div class="sch-pc"><h3 class="pcname">'+esc(f)+'</h3><p class="pcrole"><i class="rdot" style="background:'+schRoleColor(r.slot)+'"></i>'+esc(schRole(r))+'</p><p class="pcwhere">'+(wh.length?'Сегодня работает: '+esc(wh.join(', ')):'Сегодня в графике не отмечен(а)')+'</p><button class="btn sec" style="margin-top:14px" data-act="ovclose">Закрыть</button></div>');break}
    case'schflt':schEnsure().flt=d.f;paint();break;
    case'schretry':loadSched(schEnsure().m);break;
    case'schdemo':{const s=schEnsure();if(isHead()){s.demo=!s.demo;paint()}break}
    case'schmon':{const s=schEnsure();s.m=schShift(s.m,Number(d.n));s.day=s.m===omskToday().slice(0,7)?omskToday():s.m+'-01';s.apptDay=null;if(s.demo)paint();else if(s.data[s.m])paint();else loadSched(s.m);break}
    case'help':openHelp();break;
    case'helpback':closeHelp();break;
    case'queue':showQueue();break;
    case'toastclose':clearTimeout(toast.t);$('#toastwrap').innerHTML='';break;
    case'ovclose':closeOv();break;
    case'tochecks':{const e=$('#chkcard');if(e)e.scrollIntoView({behavior:'smooth',block:'start'});break}
    case'hint':{const h=HINTS[d.h];if(!h)break;if(isField(document.activeElement))document.activeElement.blur();
      overlay('<h2>'+esc(h[0])+'</h2><p style="margin:0 0 14px">'+esc(h[1])+'</p><button class="btn" data-act="ovclose">Понятно</button>');break}
    case'logout':closeOv();if((S.queue.length||S.handoverQueue.length)&&!confirm('Есть неотправленные данные. Они останутся на устройстве и уйдут после следующего входа. Выйти?'))break;logout();break;
    case'flush':if(S.queue.length&&S.queue.every(x=>x.status==='needs_reason'||x.status==='error')&&!S.handoverQueue.length){toast('Выберите действие у конкретной записи: причину, однократный повтор или удаление',5000);break}S.queue.forEach(x=>{if(x.status==='offline')x.status='new'});S.handoverQueue.forEach(x=>{if(x.status==='offline')x.status='new'});closeOv();kick(false);break;
    case'setReason':{const v=(($('#rs-'+d.id)||{}).value||'').trim(),it=S.queue.find(x=>x.uid===d.id),mn=(it&&it.minLen)||3;if(v.length<mn){toast(mn>3?'Причина — не короче '+mn+' знаков':'Напишите причину');break}if(it){it.reason=v;it.status='new'}saveQueue();closeOv();await flush();break}
    case'doUpdate':reloadNew();break;
    case'go':{closeOv();const v=d.v;if(v==='work')showWork(S.wkFrom,S.wkTo);else if(v==='cc')showCC();else if(v==='sched')showSched();else if(v==='branch'){S.view='branch';render();window.scrollTo(0,0)}else if(v==='ctl')showControl();else if(v==='vac')showVac();else if(v==='dose')doseOpen();else if(v==='med')showMed();else if(v==='an')showAnalytics();else if(v==='rev')showRevenue();else if(v==='pay'){S.pplMode=false;S.paySafe=false;showPay()}else if(v==='safe'){S.pplMode=false;S.paySafe=true;showPay(S.payFrom,S.payTo);loadSafe()}else if(v==='ppl'){S.pplMode=true;S.paySafe=false;S.pplId=null;showPay()}else if(v==='sal')showSalary(S.salFrom,S.salTo);break}
    case'salcopy':copyPay();break;
    case'salper':showSalary(d.from,d.to);break;
    case'saldates':S.salDates=!S.salDates;paint();break;
    case'saltab':S.salTab=d.t;paint();window.scrollTo(0,0);break;
    case'cchead':closeOv();S.salTab='cc';showSalary(S.salFrom,S.salTo);break;
    case'ccvalsave':doCCVal(false);break;
    case'ccvalcancel':if(confirm('Вернуть расчёт вала колл-центра по отчётам? Старые записи сохранятся.'))doCCVal(true);break;
    case'salgo':{const f=($('#salf')||{}).value,t=($('#salt')||{}).value;if(!f||!t||t<f){toast('Проверьте даты периода');break}showSalary(f,t);break}
    case'saladd':salAddForm();break;
    case'saladdgo':doSalAdd();break;
    case'salback':closeOv();break;
    case'salcancel':doSalCancel(d.id);break;
    case'revper':showRevenue(d.from,d.to);break;
    case'revdates':S.revDates=!S.revDates;paint();break;
    case'revbr':S.revBranch=d.b;paint();window.scrollTo(0,0);break;
    case'revgo':{const f=($('#revf')||{}).value,t=($('#revt')||{}).value;if(!f||!t||t<f){toast('Проверьте даты периода');break}showRevenue(f,t);break}
    case'accept':acceptForm(d);break;
    case'ctlquick':ctlAccept([{branch:d.bid,date:d.dt,code:d.code,version:Number(d.ver)||0,confirm_money:true}]);break;
    case'ctlall':ctlAccept(ctlReady(S.ctl).map(ctlPayload));break;
    case'fdet':showFlagDetail(d);break;
    case'acceptgo':doAccept(S.accDs,($('#accnote')||{}).value||'');break;
    case'chpin':showPin();break;
    case'dopin':{
      const p0=$('#p0').value,p1=$('#p1').value,p2=$('#p2').value;
      if(!/^\d{6}$/.test(p1)){toast('Новый PIN — ровно 6 цифр');break}
      if(p1!==p2){toast('Новые PIN не совпадают');break}
      if(/^(\d)\1{5}$/.test(p1)||p1==='123456'||p1==='654321'){toast('Слишком простой PIN');break}
      try{const r=await rpc('ev_change_pin',{p_token:S.token,p_old:p0,p_new:p1});
        if(r.ok){closeOv();toast('PIN изменён')}else toast(r.error==='bad_pin'?'Текущий PIN неверный. Осталось попыток: '+(r.attempts_left==null?'?':r.attempts_left):r.error==='locked'?'Слишком много ошибок. Подождите 15 минут':r.error==='session'?'Сессия закончилась, войдите заново':'Не удалось: '+r.error)}
      catch(er){toast(er.net?'Нет связи':'Ошибка сервера')}
      break}
  }
});
document.addEventListener('keydown',e=>{
  if(S.view!=='login'||S.loginScreen!=='keypad'||S.busy)return;
  if(/^\d$/.test(e.key)){e.preventDefault();document.querySelector('[data-act="logindigit"][data-n="'+e.key+'"]')?.click()}
  else if(e.key==='Backspace'){e.preventDefault();document.querySelector('[data-act="logindel"]')?.click()}
});

window.addEventListener('online',()=>{S.online=true;setHeader();if(S.view==='login')render();kick()});
window.addEventListener('offline',()=>{S.online=false;setHeader();if(S.view==='login')render()});
function syncDate(){ // приложение могло неделю висеть открытым: если дату руками не меняли — всегда сегодняшняя
  if(!S.dateManual&&S.date!==omskToday()){S.date=omskToday();if(S.view==='branch'&&S.token)render()}
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){syncDate();kick()}});
window.addEventListener('pageshow',()=>{syncDate();kick()});
window.addEventListener('focus',()=>{syncDate();kick()});
// пока в очереди есть отчёт — пробуем каждые 8 секунд (не полагаясь на navigator.onLine: на iPhone он врёт)
setInterval(()=>{if(S.queue.length&&!flushing){resetOffline();flush(true)}},8000);
setInterval(()=>{if(S.handoverQueue.length&&!handoverFlushing)flushHandover(true)},8000);

/* ====== Обновление страницы без переустановки ====== */
let updLast=0;
function saveDraftNow(){try{clearTimeout(draftT);if(S.form&&S.view==='form')LS.set(draftKey(),{ts:Date.now(),form:S.form})}catch(e){}}
function reloadNew(){
  saveDraftNow();
  const go=()=>location.reload();
  try{navigator.serviceWorker.getRegistration().then(r=>r?r.update():0).then(go,go)}catch(e){go()}
}
async function checkUpdate(force){
  const now=Date.now();
  if(!force&&now-updLast<45000)return;
  updLast=now;
  try{
    const r=await fetch('index.html?u='+now,{cache:'no-store'});
    if(!r.ok)return;
    const m=(await r.text()).match(/name="evrovet-version"\s+content="([^"]+)"/);
    if(!m||m[1]===CFG.appVer)return;
    S.newVer=m[1];
    const calm=(S.view==='branch'||S.view==='login'||S.view==='cc'||S.view==='work')&&!$('#ovwrap').innerHTML&&!flushing&&!(($('#pin')||{}).value);
    let last=0;try{last=+sessionStorage.getItem('ev_upd_try')||0}catch(e){}
    if(calm&&now-last>120000){try{sessionStorage.setItem('ev_upd_try',String(now))}catch(e){}reloadNew();return}
    $('#updwrap').innerHTML='<div class="upd"><span>Вышла новая версия '+esc(m[1])+'. Данные сохранены.</span><button data-act="doUpdate">Обновить</button></div>';
  }catch(e){}
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkUpdate()});
setInterval(()=>{if(document.visibilityState==='visible')checkUpdate()},300000);

/* ====== 1.65: автовыход по простою (не руководитель): следующий человек на этом устройстве увидит только вход по PIN ====== */
const IDLE_MS=30*60*1000; /* 2.0 (слово Михаила 17.11): автовыход через 30 минут бездействия у ВСЕХ ролей, кроме руководителя */
let accessLastAct=Date.now(),accessLastTouch=0;
function touchAct(){accessLastAct=Date.now();if(S.token&&Date.now()-accessLastTouch>30000){accessLastTouch=Date.now();rpc('ev_session_touch',{p_token:S.token}).then(r=>{if(!r.ok){logout();toast('Сессия закончилась. Возможно, выполнен вход с другого устройства.');}}).catch(()=>{});}}
function idleCheck(){if(S.token&&!isHead()&&Date.now()-accessLastAct>IDLE_MS){try{if(S.view==='form'&&S.form)saveDraftNow()}catch(e){}closeOv();logout();toast('Вы вышли: 30 минут без действий. Черновик отчёта сохранён.',6000)}}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)idleCheck()});
['click','keydown','touchstart','input'].forEach(ev=>document.addEventListener(ev,()=>{if(S.token)touchAct()},{passive:true,capture:true}));
setInterval(idleCheck,10000);
window.addEventListener('pagehide',()=>{if(S.token){const token=S.token;S.token=null;S.person=null;fetch(CFG.url+'/rest/v1/rpc/ev_logout',{method:'POST',headers:{apikey:CFG.key,Authorization:'Bearer '+CFG.key,'Content-Type':'application/json'},body:JSON.stringify({p_token:token}),keepalive:true}).catch(()=>{});}});
