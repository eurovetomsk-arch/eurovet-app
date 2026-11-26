'use strict';
/* ====== 2.0 · «Карта ВТБ»: остаток на карте закупщика (слово Михаила 23.11) ======
   Руководитель кладёт («Положил»), закупщик (ev_med_buyers) тратит («Потратил»). Остаток и история — с сервера (ev_card_state), у обоих одинаковые.
   Всё идёт через RPC по токену; другие роли получают forbidden и плитки не видят. Номер карты, CVV и логины банка не хранятся и не спрашиваются.
   Офлайн: операция кладётся в очередь localStorage ev_cardq (uid ключ идемпотентности) и уходит при связи; остаток показывается с учётом очереди. */
const CARD={ok:undefined,role:null,st:null,err:null,busy:false,q:null,probing:false};
const CARD_QKEY='ev_cardq';
const cardRub=n=>String(Math.round(Number(n||0))).replace(/\B(?=(\d{3})+(?!\d))/g,' ')+' ₽';
const cardRubS=n=>(Number(n)>=0?'+':'−')+cardRub(Math.abs(Number(n)));
const cardWhen=iso=>{const d=new Date(iso);if(isNaN(d))return'';const f=new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Omsk',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(d).reduce((o,x)=>(o[x.type]=x.value,o),{});return f.day+'.'+f.month+' '+f.hour+':'+f.minute};
const cardUid=()=>'c'+Date.now().toString(36)+Math.random().toString(36).slice(2,8);
function cardQ(){try{const a=JSON.parse(localStorage.getItem(CARD_QKEY)||'[]');return Array.isArray(a)?a.filter(x=>x&&x.uid&&x.fn):[]}catch(e){return[]}}
function cardQSave(a){try{localStorage.setItem(CARD_QKEY,JSON.stringify(a.slice(-50)))}catch(e){}}
/* показываемый остаток = серверный ± ожидающие в очереди */
function cardShown(){
  const base=CARD.st?Number(CARD.st.balance||0):0;
  return cardQ().reduce((b,x)=>x.fn==='add'?b+(x.args.kind==='deposit'?1:-1)*Number(x.args.amount||0):b,base);
}
const cardLow=()=>!!CARD.st&&cardShown()<Number(CARD.st.threshold||0);
const cardRoleOk=()=>(typeof isHead==='function'&&isHead())||CARD.ok===true;
async function cardCall(fn,args){
  const t=S.token;
  if(fn==='add')return rpc('ev_card_add',{p_token:t,p_kind:args.kind,p_amount:args.amount,p_at:args.at||null,p_uid:args.uid},12000);
  if(fn==='fix')return rpc('ev_card_fix',{p_token:t,p_op:args.op,p_uid:args.uid},12000);
  if(fn==='check')return rpc('ev_card_bank_check',{p_token:t,p_actual:args.actual,p_uid:args.uid},12000);
  if(fn==='thr')return rpc('ev_card_threshold_set',{p_token:t,p_value:args.value},12000);
  return rpc('ev_card_state',{p_token:t},12000);
}
/* проверка роли и загрузка (плитка появляется только у руководителя и закупщика) */
async function cardProbe(){
  if(!S.token||CARD.ok!==undefined||CARD.probing)return;
  CARD.probing=true;
  try{const r=await cardCall('state');if(r&&r.ok){CARD.ok=true;CARD.role=r.role;CARD.st=r}else if(r&&(r.error==='forbidden')){CARD.ok=false}}catch(e){}
  CARD.probing=false;
  if(CARD.ok===true&&S.view==='card')paint();else if(CARD.ok===true&&S.view==='branch')(typeof homePaint==='function'?homePaint():paint());
}
async function cardLoad(){
  try{const r=await cardCall('state');if(r&&r.ok){CARD.st=r;CARD.err=null}else CARD.err=r&&r.error==='session'?'Сессия закончилась. Войдите заново.':'Нет доступа.'}
  catch(e){CARD.err=e.net?'Нет связи. Показан последний остаток.':'Ошибка сервера.'}
}
/* очередь: отправляем по порядку; сетевая ошибка — остаёмся в очереди, отказ сервера — снимаем и сообщаем */
async function cardFlush(){
  if(CARD.busy||!S.token)return;
  const a=cardQ();if(!a.length)return;
  CARD.busy=true;let sent=false;
  for(const x of a.slice()){
    let r;
    try{r=await cardCall(x.fn,Object.assign({},x.args,{uid:x.uid}))}catch(e){if(e.net||e.status)break;r={ok:false,error:'http'}}
    const rest=cardQ().filter(y=>y.uid!==x.uid);cardQSave(rest);
    if(r&&r.ok){CARD.st=r;sent=true}else{try{toast('Операция не принята: '+(({amount:'сумма',date:'дата',forbidden:'нет доступа',already_fixed:'уже исправлено'})[r&&r.error]||'ошибка'),6000)}catch(e){}}
  }
  CARD.busy=false;if(S.view==='card')paint();else if(S.view==='branch')(typeof homePaint==='function'?homePaint():paint());
  return sent;
}
async function cardSubmit(fn,args){
  const a=cardQ();a.push({uid:cardUid(),fn,args});cardQSave(a);
  if(S.view==='card')paint();
  await cardFlush();
}
function cardTileHtml(){
  /* обычная плитка сетки: значок слева, «Карта ВТБ», остаток под подписью; без логотипа и цветов банка */
  const low=cardLow(),has=!!CARD.st;
  return '<button class="glass ui2-role-tile sm card-tile'+(low?' low':'')+'" data-cardact="open"><span class="ic"><img src="icons/24-card-vtb.svg" alt=""></span><span><span class="t">Карта ВТБ</span><span class="sub card-sub'+(low?' low':'')+'">'+(has?'Остаток '+cardRub(cardShown()):'Остаток …')+'</span>'+(low?'<span class="sub card-warn">Остаток меньше '+cardRub(CARD.st.threshold)+'</span>':'')+'</span></button>';
}
const cardKindText=o=>({opening:'Стартовый остаток',deposit:'Положил',spend:'Потратил',fix:'Исправление',bank_check:'Сверка с банком'})[o.kind]||o.kind;
function cardOpHtml(o){
  const amt=o.kind==='opening'||o.kind==='deposit'?Number(o.amount):o.kind==='spend'?-Number(o.amount):Number(o.amount);
  const title=o.kind==='opening'?'Стартовый остаток '+cardRub(o.amount):o.kind==='bank_check'?'Сверка с банком '+cardRubS(o.amount):cardKindText(o)+' '+cardRubS(amt);
  const cm=o.kind==='bank_check'?('в банке '+cardRub(o.actual)):o.kind==='opening'?'':(o.comment||'');
  return '<div class="person card-op"><div class="srow"><span><b'+(o.kind==='bank_check'||o.kind==='fix'?'':' class="'+(amt>=0?'plus':'minus')+'"')+'>'+esc(title)+'</b><br><small>'+esc(o.at?cardWhen(o.at):vmcDate(o.date))+' · '+esc(o.who||'')+(cm?' · '+esc(cm):'')+(o.fixed?' · исправлено':'')+'</small></span>'
    +((o.kind==='deposit'||o.kind==='spend'||o.kind==='bank_check')&&o.mine&&!o.fixed?'<button class="chip" data-cardact="fix" data-id="'+Number(o.id)+'">Исправить</button>':'')+'</div></div>';
}
function cardHtml(){
  const st=CARD.st,q=cardQ(),low=cardLow();
  let h='<div class="card card-main'+(low?' low':'')+'"><h2>Карта ВТБ</h2>';
  if(CARD.err&&!st)return h+'<p>'+esc(CARD.err)+'</p><button class="btn sec" data-cardact="reload">Повторить</button></div>';
  if(!st)return h+'<p class="hint">Загружаю…</p></div>';
  h+='<div class="card-big'+(low?' low':'')+'">Остаток '+cardRub(cardShown())+'</div>';
  if(low)h+='<div class="chk bad"><i>!</i><div><b>Остаток меньше '+cardRub(st.threshold)+'</b></div></div>';
  if(CARD.err)h+='<p class="hint">'+esc(CARD.err)+'</p>';
  if(q.length)h+='<p class="hint">Ждут отправки: '+q.length+'. Остаток показан с учётом этих операций.</p>';
  h+=(CARD.role==='head'?'<button class="btn card-bigbtn" data-cardact="deposit">Положил</button>':'<button class="btn card-bigbtn" data-cardact="spend">Потратил</button>');
  const weekOld=!st.last_check||(Date.now()-Date.parse(st.last_check))>=7*86400000;
  if(CARD.role==='head')h+='<button class="btn'+(weekOld?'':' sec')+'" data-cardact="check">Сверить с банком</button>'+(weekOld?'<p class="hint">Раз в неделю: введите фактический остаток из банка.</p>':'');   /* сверка с банком — только руководитель */
  if(CARD.role==='head')h+='<button class="chip" data-cardact="thr">Порог «мало денег»: '+cardRub(st.threshold)+'</button>';
  h+='</div><div class="card"><h3 style="margin-top:2px">История</h3>'+((st.ops||[]).length?st.ops.map(cardOpHtml).join(''):'<p class="hint">Операций пока нет.</p>')+'</div>';
  return h;
}
function cardFormOverlay(kind){
  overlay('<h2>'+(kind==='spend'?'Потратил':'Положил')+'</h2><label class="f"><span>Сумма, ₽</span><input id="card-amt" type="text" inputmode="numeric" pattern="[0-9 ]*" autocomplete="off" enterkeyhint="done"></label><p class="hint">Дата и время запишутся сами.</p><button class="btn" data-cardact="send" data-kind="'+kind+'">Сохранить</button><button class="btn sec small" data-act="ovclose">Отмена</button>');
}
document.addEventListener('click',async ev=>{
  const el=ev.target.closest&&ev.target.closest('[data-cardact]');if(!el)return;
  const a=el.dataset.cardact;
  if(a==='open'){S.view='card';paint();await cardLoad();await cardFlush();paint();return}
  if(a==='reload'){await cardLoad();paint();return}
  if(a==='deposit'||a==='spend'){cardFormOverlay(a);return}
  if(a==='send'){
    const amt=Number(String(document.getElementById('card-amt').value).replace(/\s/g,'').replace(',','.')),kind=el.dataset.kind;
    if(!(amt>0)){toast('Введите сумму');return}
    closeOv();await cardSubmit('add',{kind,amount:amt,at:new Date().toISOString()});return
  }
  if(a==='fix'){if(confirm('Исправить запись? Будет добавлена обратная запись, сама запись останется в истории.')){await cardSubmit('fix',{op:Number(el.dataset.id)})}return}
  if(a==='check'){
    overlay('<h2>Сверка с банком</h2><p class="hint">Введите остаток, который сейчас показывает банк. Разница запишется отдельной строкой.</p><label class="f"><span>Остаток в банке, ₽</span><input id="card-act" inputmode="decimal" autocomplete="off"></label><button class="btn" data-cardact="checksend">Записать</button><button class="btn sec small" data-act="ovclose">Отмена</button>');return}
  if(a==='checksend'){const v=Number(String(document.getElementById('card-act').value).replace(/\s/g,'').replace(',','.'));if(!(v>=0)||document.getElementById('card-act').value===''){toast('Введите остаток');return}closeOv();await cardSubmit('check',{actual:v});return}
  if(a==='thr'){overlay('<h2>Порог «мало денег»</h2><label class="f"><span>Сумма, ₽</span><input id="card-thr" inputmode="decimal" value="'+Math.round(Number(CARD.st.threshold||5000))+'"></label><button class="btn" data-cardact="thrsend">Сохранить</button><button class="btn sec small" data-act="ovclose">Отмена</button>');return}
  if(a==='thrsend'){const v=Number(String(document.getElementById('card-thr').value).replace(/\s/g,'').replace(',','.'));if(!(v>=0)){toast('Введите сумму');return}closeOv();try{const r=await cardCall('thr',{value:v});if(r&&r.ok)CARD.st=r}catch(e){toast('Нет связи')}paint();return}
});
window.addEventListener('online',()=>{cardFlush()});
