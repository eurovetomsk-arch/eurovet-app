'use strict';
/* ====== Зарплата: только руководитель (ставки приходят с сервера и в код страницы не зашиты) ====== */
const perStart=d=>d.slice(0,8)+(Number(d.slice(8,10))<=15?'01':'16');
const perEnd=d=>Number(d.slice(8,10))<=15?d.slice(0,8)+'15':new Date(Date.UTC(Number(d.slice(0,4)),Number(d.slice(5,7)),0)).toISOString().slice(0,10);
const SAL_ERR={session:'Сессия закончилась, войдите заново',forbidden:'Нет доступа',period:'Период указан неверно (не больше 46 дней)',rates:'Не найдены ставки в базе'};
const SAL_KIND={taxi:'Такси',manual:'Доплата',other:'Вычет',recurring:'Постоянная доплата'};
const SAL_ROLE={assistant_clinical:'клинический ассистент',assistant_tech:'технический ассистент',admin:'администратор',callcenter:'оператор колл-центра',doctor:'врач',courier:'курьер'};
const srow=(a,b)=>'<div class="srow"><span>'+a+'</span><b>'+b+'</b></div>';
const brTitle=id=>((BRANCHES.find(b=>b.id===id)||{}).title||id).replace(/^ЕВРОВЕТ\s*/,'');
/* ведомость: один человек = одна строка с расшифровкой (если он и админ, и ассистент — суммы складываются) */
function payList(r){
  const rt=r.rates||{},pc=Math.round(Number(rt.admin_pharmacy_pct)*10000)/100;
  const m=new Map();
  const get=a=>{const k=a.id!=null?a.id:a.name;let o=m.get(k);if(!o){o={name:a.name,roles:[],total:0,items:[]};m.set(k,o)}return o};
  const role=(o,x)=>{if(!o.roles.includes(x))o.roles.push(x)};
  const adj=(o,a)=>(a.adj_items||[]).filter(i=>!i.is_cancel&&!i.cancelled).forEach(i=>o.items.push({l:(SAL_KIND[i.kind]||i.kind)+' '+ruDate(i.date)+(i.comment?' · '+i.comment:''),v:Number(i.amount),sg:true}));
  (r.admins||[]).forEach(a=>{const o=get(a);o.total+=Number(a.total||0);role(o,'администратор');
    o.items.push({l:'За смены: '+a.shifts+' × '+money(Number(a.shift_rate)),v:Number(a.shift_pay)});
    o.items.push({l:'Процент '+pc+'% от выручки аптеки ('+money(Number(a.pharm_val))+')',v:Number(a.pct_pay)});
    o.items.push({l:Number(a.late_hours)>0?'Переработка: '+a.late_hours+' ч × '+money(Number(rt.hour)):'Переработка: нет',v:Number(a.late_pay)});
    adj(o,a)});
  (r.assistants||[]).forEach(a=>{const o=get(a);o.total+=Number(a.total||0);role(o,'ассистент');
    o.items.push({l:'За смены: '+a.shifts,v:Number(a.shift_pay)});
    o.items.push({l:'Фиксации: обычные '+a.fix_normal+' × '+money(Number(rt.fix_normal))+', рентген '+a.fix_xray+' × '+money(Number(rt.fix_xray)),v:Number(a.fix_pay)});
    adj(o,a)});
  (r.callcenter||[]).forEach(a=>{if(!Number(a.shifts||0)&&!(a.adj_items||[]).some(i=>!i.is_cancel&&!i.cancelled))return;const o=get(a);o.total+=Number(a.total||0);role(o,'колл-центр');
    o.items.push({l:'За выходы: '+a.shifts+' × '+money(Number(a.shift_rate)),v:Number(a.shift_pay)});
    o.items.push({l:'Доля фонда периода по дням смен'+((r.cc_days||[]).some(d=>d.provisional)?' (предварительно)':''),v:Number(a.pct_pay)});
    adj(o,a)});
  (r.extra||[]).forEach(a=>{if(!Number(a.total||0)&&!(a.adj_items||[]).some(i=>!i.is_cancel&&!i.cancelled))return;const o=get(a);o.total+=Number(a.total||0);role(o,'только добавки');adj(o,a)});
  const ord=o=>o.roles.includes('администратор')?0:o.roles.includes('ассистент')?1:o.roles.includes('колл-центр')?2:3;
  return [...m.values()].map(o=>({name:o.name,role:o.roles.join(' и '),total:o.total,items:o.items,_o:ord(o)})).sort((a,b)=>a._o-b._o||a.name.localeCompare(b.name,'ru'));
}
function payText(r,g){
  const rr=g==='adm'?Object.assign({},r,{assistants:[],extra:[],callcenter:[]}):g==='ast'?Object.assign({},r,{admins:[],extra:[],callcenter:[]}):g==='cc'?Object.assign({},r,{admins:[],assistants:[],extra:[]}):r;
  const ttl=g==='adm'?' (администраторы)':g==='ast'?' (ассистенты)':g==='cc'?' (колл-центр)':'';
  if(g==='add'){
    const al=(r.adj||[]).filter(i=>!i.is_cancel&&!i.cancelled);
    return 'Добавки '+ruDate(r.from)+' — '+ruDate(r.to)+'\n'+(al.length?al.map(i=>i.name+' — '+(SAL_KIND[i.kind]||i.kind)+' '+ruDate(i.date)+(i.comment?' · '+i.comment:'')+' — '+sgn(Number(i.amount))).join('\n'):'нет');
  }
  if(g==='cc'){
    const L=r.callcenter||[],rt=r.cc_rates||{};
    return 'Колл-центр '+ruDate(r.from)+' — '+ruDate(r.to)+'\n'+L.map(a=>a.name+' — '+money(Number(a.total))+'\n   Выходов: '+a.shifts+' × '+money(Number(a.shift_rate))+' — '+money(Number(a.shift_pay))+'\n   Доля фонда периода'+((r.cc_days||[]).some(d=>d.provisional)?' (предварительно)':'')+' — '+money(Number(a.pct_pay))+(a.adj_items||[]).filter(i=>!i.is_cancel&&!i.cancelled).map(i=>'\n   '+(SAL_KIND[i.kind]||i.kind)+' '+ruDate(i.date)+' — '+sgn(Number(i.amount))).join('')).join('\n')+'\nВсего: '+money(L.reduce((q,a)=>q+Number(a.total||0),0))+'\n(фонд = '+(Math.round(Number(rt.cc_pct_pool||0)*10000)/100)+'% вала клиник периода ÷ календарные дни; день: одному целиком, двоим пополам'+((r.cc_days||[]).some(d=>d.provisional)?'; период не закрыт, цифры предварительные':'')+')';
  }
  const pay=payList(rr);
  const all=pay.reduce((s,p)=>s+p.total,0);
  return 'Зарплата'+ttl+' '+ruDate(r.from)+' — '+ruDate(r.to)+'\n'+pay.map(p=>p.name+' ('+p.role+') — '+money(p.total)+p.items.map(i=>'\n   '+i.l+' — '+(i.sg?sgn(i.v):money(i.v))).join('')).join('\n')+'\nВсего: '+money(all);
}
async function copyPay(){
  if(!S.sal)return;
  const sp=(S.salTab==='sum'||S.salTab==='doc')?salPayInfo():null;
  let tx=S.salTab==='doc'?(sp?'Врачи '+ruDate(S.sal.from)+' — '+ruDate(S.sal.to):''):payText(S.sal,S.salTab);
  if(S.salTab==='doc'&&!sp)return;
  if(sp)tx+='\nВрачи: '+(sp.docs.length?sp.docs.map(x=>'\n   '+x.name+' — '+money(x.doctor+x.sur)).join(''):'нет данных')+'\nВрачи всего: '+money(sp.docSum)+(Math.abs(sp.rest)>=0.5?'\nОклады и постоянные доплаты: '+money(sp.rest):'')+'\nВсего начислено с врачами и окладами: '+money(sp.total)+'\nВыплачено: '+money(sp.paid)+'\nОстаток к выплате: '+money(sp.toPay);
  try{await navigator.clipboard.writeText(tx);toast('Ведомость скопирована');return}catch(e){}
  try{const ta=document.createElement('textarea');ta.value=tx;ta.setAttribute('readonly','');ta.style.cssText='position:fixed;left:-999px;top:0';document.body.appendChild(ta);ta.select();const ok=document.execCommand('copy');ta.remove();toast(ok?'Ведомость скопирована':'Не удалось скопировать',4000)}catch(e){toast('Не удалось скопировать',4000)}
}
async function showSalary(from,to){
  const today=omskToday();
  if(!from){from=perStart(today);to=today}
  S.salFrom=from;S.salTo=to;if(!S.salTab)S.salTab='sum';
  closeOv();S.view='sal';S.sal=null;S.salErr=null;S.salLoad=true;paint();
  try{
    const r=await rpc('ev_salary',{p_token:S.token,p_from:from,p_to:to,p_test:false},15000);
    if(S.salFrom!==from||S.salTo!==to)return;
    if(!r||!r.ok)S.salErr=SAL_ERR[r&&r.error]||'Не удалось посчитать';else S.sal=r;
  }catch(e){if(S.salFrom!==from||S.salTo!==to)return;S.salErr=e.net?'Нет связи.':'Ошибка сервера.'}
  S.salLoad=false;if(S.view==='sal')paint();
  if(S.sal&&!S.salErr){loadSalPay(from,to);loadCCVal(from,to)}
}

function ccValPeriod(f,t){
  if(!f||!t)return null;
  const a=perStart(f),b=perEnd(a);
  return perStart(t)===a&&t>=a&&f<=b?[a,b]:null;
}
const ccManualPool=(amount,pct)=>Math.round(Number(amount)*Number(pct)*100)/100;
async function loadCCVal(f,t){
  const rg=ccValPeriod(f,t);S.ccVal=null;S.ccValRange=rg;S.ccValErr=null;
  if(!rg)return;
  const key=rg.join('|');S.ccValLoad=true;
  try{
    const r=await rpc('ev_cc_val_state',{p_token:S.token,p_from:rg[0],p_to:rg[1]},10000);
    if(!S.ccValRange||S.ccValRange.join('|')!==key)return;
    if(r&&r.ok)S.ccVal=r;else S.ccValErr='Не удалось получить источник вала';
  }catch(e){if(!S.ccValRange||S.ccValRange.join('|')!==key)return;S.ccValErr=e.net?'Нет связи: источник вала не проверен.':'Ошибка сервера.'}
  S.ccValLoad=false;if(S.view==='sal'&&S.salTab==='cc')paint();
}
function ccValTime(v){
  if(!v)return'';
  try{return new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Omsk',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(v))}catch(e){return String(v)}
}
function ccValEditor(){
  const rg=S.ccValRange,st=S.ccVal||{},manual=st.manual===true;
  if(!rg)return '<div class="card"><h3 style="margin-top:2px">Вал за период</h3><p class="hint">Выберите даты внутри одного периода: 1–15 или 16–последний день месяца.</p></div>';
  let h='<div class="card"><h3 style="margin:2px 0">Вал за период, ₽</h3><p class="hint" style="margin:4px 0 12px">'+ruDate(rg[0])+' — '+ruDate(rg[1])+'</p>';
  if(S.ccValLoad)h+='<p class="hint">Проверяю источник…</p>';
  else if(S.ccValErr)h+='<div class="chk warn"><i>!</i><div>'+esc(S.ccValErr)+'</div></div>';
  else if(manual)h+='<div class="chk good"><i>✓</i><div><b>Введено вручную</b><br><small>'+esc(st.created_by_name||'руководитель')+' · '+esc(ccValTime(st.created_at))+'</small></div></div>';
  else h+='<div class="chk"><i>↻</i><div><b>Сейчас берётся из отчётов</b><br><small>Пустое поле оставляет действующий автоматический расчёт.</small></div></div>';
  h+='<label class="f"><span>Сумма за весь период</span><input id="ccval" inputmode="decimal" placeholder="например 1 000 000" value="'+(manual?esc(fmtNum(st.amount)):'')+'"></label>';
  if(st.closed)h+='<p class="hint">Период закрыт: изменить источник вала уже нельзя.</p>';
  else h+='<button class="btn" data-act="ccvalsave">Сохранить новый вал</button>'+(manual?'<button class="btn sec" style="margin-top:8px" data-act="ccvalcancel">Отменить ручной вал</button>':'');
  return h+'<p class="hint" style="margin:10px 0 0">Каждое сохранение добавляет новую запись. Предыдущие значения не удаляются.</p></div>';
}
async function doCCVal(cancel){
  if(S.salBusy||!S.ccValRange)return;
  const rg=S.ccValRange,raw=(($('#ccval')||{}).value||''),v=cancel?null:num(raw);
  if(!cancel&&(v==null||isNaN(v)||v<0)){toast('Введите вал за весь период');return}
  if(S.ccVal&&S.ccVal.closed){toast('Период закрыт, изменить вал нельзя',6000);return}
  S.salBusy=true;S.ccValUid=S.ccValUid||uid();
  try{
    const r=await rpc('ev_mu_cc_val',{p_token:S.token,p_from:rg[0],p_to:rg[1],p_amount:v,p_uid:S.ccValUid,p_cancel:!!cancel},12000);
    if(!r||!r.ok){const m={closed:'Период уже закрыт',period:'Допустим только период 1–15 или 16–конец месяца',amount:'Проверьте сумму',not_manual:'Ручного значения уже нет',session:'Сессия закончилась, войдите заново',forbidden:'Нет доступа'};toast(m[r&&r.error]||'Не удалось сохранить',6000);return}
    S.ccValUid=null;toast(cancel?'Снова считаем по отчётам':'Вал сохранён для этого периода');
    await showSalary(S.salFrom,S.salTo);
  }catch(e){toast(e.net?'Нет связи, ничего не сохранено':'Ошибка сервера',6000)}
  finally{S.salBusy=false}
}
/* 1.48: врачи, оклады и постоянные доплаты в «Зарплата»: берутся из ведомости за период целиком (ev_payroll_statement) */
function salPayRange(f,t){
  const today=omskToday();
  if(!f||!t||f<PAY_START||perStart(f)!==f)return null;
  if(t===perEnd(f)||(f===perStart(today)&&t===today))return[f,perEnd(f)];
  return null;
}
async function loadSalPay(f,t){
  S.salPay=null;S.salPayKey=null;S.salPayErr=null;
  const rg=salPayRange(f,t);if(!rg)return;
  const key=f+'|'+t;S.salPayKey=key;S.salPayLoad=true;
  try{
    const r=await rpc('ev_payroll_statement',{p_token:S.token,p_from:rg[0],p_to:rg[1]},20000);
    if(S.salPayKey!==key)return;
    if(r&&r.ok)S.salPay=r;else S.salPayErr='Не удалось загрузить врачей';
  }catch(e){if(S.salPayKey!==key)return;S.salPayErr=e.net?'Нет связи: врачи не загружены.':'Ошибка сервера: врачи не загружены.'}
  S.salPayLoad=false;if(S.view==='sal')paint();
}
function salPayInfo(){
  const r=S.salPay,sl=S.sal;
  if(!r||!sl||S.salPayKey!==S.salFrom+'|'+S.salTo)return null;
  const tt=sl.totals||{},base=Number(tt.admins||0)+Number(tt.assistants||0)+Number(tt.callcenter||0)+Number(tt.extra||0);
  const docs=(r.rows||[]).filter(x=>x.parts&&Number(x.parts.doctor)).map(x=>({name:x.name,doctor:Number(x.parts.doctor||0),sur:Number(x.parts.surcharge||0)}));
  const docSum=docs.reduce((a,x)=>a+x.doctor+x.sur,0),total=Number(r.total.accrued||0),rest=Math.round((total-docSum-base)*100)/100;
  const own=new Set((sl.warnings||[]).map(String));
  return{docs,docSum,total,paid:Number(r.total.paid||0),toPay:Number(r.total.to_pay||0),rest,warns:(r.warnings||[]).filter(w=>!own.has(String(w))),prov:!!r.provisional};
}
function adjItems(items){
  const it=(items||[]).filter(i=>!i.is_cancel&&!i.cancelled);
  return it.map(i=>'<div class="srow sub"><span>'+esc(SAL_KIND[i.kind]||i.kind)+' '+ruDate(i.date)+(i.comment?' · '+esc(i.comment):'')+'</span><b>'+sgn(Number(i.amount))+'</b></div>').join('');
}
function salHtml(){
  const r=S.sal,today=omskToday(),cs=perStart(today),prevEnd=addDays(cs,-1),prevStart=perStart(prevEnd),yest=addDays(today,-1);
  const f=S.salFrom,t=S.salTo,on=(a,b)=>(f===a&&t===b)?' on':'';
  const chip=(l,a,b)=>'<button class="chip'+on(a,b)+'" data-act="salper" data-from="'+a+'" data-to="'+b+'">'+l+'</button>';
  let h='<div class="card"><h2>Зарплата</h2><div class="chips">'+chip('Сегодня',today,today)+chip('Вчера',yest,yest)+chip('Этот период',cs,today)+chip('Прошлый период',prevStart,prevEnd)+'<button class="chip'+(S.salDates?' on':'')+'" data-act="saldates">Даты ▾</button></div>';
  if(S.salDates)h+='<div style="display:flex;gap:8px;align-items:flex-end;margin:6px 0"><label class="f" style="flex:1;min-width:0;margin:0"><span>С</span><input id="salf" type="date" value="'+esc(f)+'"></label><label class="f" style="flex:1;min-width:0;margin:0"><span>По</span><input id="salt" type="date" value="'+esc(t)+'"></label><button class="btn small" data-act="salgo">Показать</button></div>';
  h+='<p class="hint" style="margin:6px 0">'+(f===t?ruDate(f):ruDate(f)+' — '+ruDate(t))+'</p>';
  h+='<div class="chips tabs">'+[['sum','Сводка'],['doc','Врачи'],['adm','Админы'],['ast','Ассистенты'],['cc','Колл-центр'],['add','Добавки']].map(x=>'<button class="chip'+(S.salTab===x[0]?' on':'')+'" data-act="saltab" data-t="'+x[0]+'">'+x[1]+'</button>').join('')+'</div></div>';
  if(S.salErr)return h+'<div class="card"><p>'+esc(S.salErr)+'</p><button class="btn sec small" data-act="salper" data-from="'+f+'" data-to="'+t+'">Повторить</button></div>';
  if(!r)return h+'<div class="card"><p class="hint">Считаю…</p></div>';
  const rt=r.rates||{},pct=Math.round(Number(rt.admin_pharmacy_pct)*10000)/100,tt=r.totals||{};
  const all=Number(tt.admins||0)+Number(tt.assistants||0)+Number(tt.callcenter||0)+Number(tt.extra||0);
  const tab=S.salTab;
  if(tab==='sum'){
    (r.warnings||[]).forEach(w=>{h+='<div class="chk warn"><i>!</i><div>'+esc(w)+'</div></div>'});
    const sp=salPayInfo();
    if(sp)sp.warns.forEach(w=>{h+='<div class="chk warn"><i>!</i><div>'+esc(w)+'</div></div>'});
    h+='<div class="card pay"><h3 style="margin-top:2px">'+(sp?'Всего начислено (с врачами и окладами)':'Всего к выплате')+'</h3><div class="srow big" style="font-size:24px"><span></span><b>'+money(sp?sp.total:all)+'</b></div>';
    if(sp)h+=srow('− Выплачено',money(sp.paid))+srow('= Остаток к выплате',money(sp.toPay))+'<p class="hint" style="margin:4px 0 0">Тот же итог, что в «Ведомости» за период'+(sp.prov?' (предварительно)':'')+'.</p>';
    else if(S.salPayLoad)h+='<p class="hint">Загружаю врачей и оклады…</p>';
    else if(S.salPayErr)h+='<p class="hint">'+esc(S.salPayErr)+' Итог ниже без врачей и окладов.</p>';
    else if(!salPayRange(S.salFrom,S.salTo))h+='<p class="hint">Врачи и оклады считаются за период целиком: выберите «Этот период» или «Прошлый период». Итог ниже без них.</p>';
    const pay=payList(r);
    if(!pay.length)h+='<p class="hint">За этот период пока никому не начислено: нет отчётов со сменами.</p>';
    else h+='<button class="btn sec small" data-act="salcopy">Скопировать ведомость</button>';
    h+='</div>';
    h+='<div class="card"><h3 style="margin-top:2px">По группам</h3>'
      +(sp?'<button class="srow grow" data-act="saltab" data-t="doc"><span>Врачи ›</span><b>'+money(sp.docSum)+'</b></button>':'')
      +'<button class="srow grow" data-act="saltab" data-t="adm"><span>Администраторы ›</span><b>'+money(Number(tt.admins||0))+'</b></button>'
      +'<button class="srow grow" data-act="saltab" data-t="ast"><span>Ассистенты ›</span><b>'+money(Number(tt.assistants||0))+'</b></button>'
      +'<button class="srow grow" data-act="saltab" data-t="cc"><span>Колл-центр ›</span><b>'+money(Number(tt.callcenter||0))+'</b></button>'
      +'<button class="srow grow" data-act="saltab" data-t="add"><span>Только добавки ›</span><b>'+money(Number(tt.extra||0))+'</b></button>'
      +(sp&&Math.abs(sp.rest)>=0.5?'<div class="srow"><span>Оклады и постоянные доплаты</span><b>'+money(sp.rest)+'</b></div>':'')
      +'<p class="hint" style="margin:4px 0 0">Добавки админов, ассистентов и колл-центра уже внутри их сумм.</p></div>';
    const by=new Map();dayPays(r).forEach(p=>by.set(p.b,(by.get(p.b)||0)+p.pay));
    const adjAll=[].concat(r.admins||[],r.assistants||[],r.callcenter||[],r.extra||[]).reduce((s,a)=>s+Number(a.adj||0),0);
    const ccPay=(r.callcenter||[]).reduce((s,a)=>s+Number(a.shift_pay||0)+Number(a.pct_pay||0),0);
    h+='<div class="card"><h3 style="margin-top:2px">По филиалам</h3>'+BRANCHES.filter(b=>!b.testOnly).map(b=>'<div class="srow"><span>'+esc(brTitle(b.id))+'</span><b>'+money(by.get(b.id)||0)+'</b></div>').join('')
      +(ccPay?'<div class="srow"><span>Колл-центр (вся сеть)</span><b>'+money(ccPay)+'</b></div>':'')
      +(adjAll?'<div class="srow"><span>Такси, доплаты, вычеты</span><b>'+sgn(adjAll)+'</b></div>':'')+'</div>';
    return h;
  }
  if(tab==='doc'){
    const sp=salPayInfo();
    if(!sp){
      const why=S.salPayLoad?'Загружаю врачей…':S.salPayErr?S.salPayErr:!salPayRange(S.salFrom,S.salTo)?'Врачи считаются за период целиком: выберите «Этот период» или «Прошлый период».':'Нет данных по врачам.';
      return h+'<div class="card"><p class="hint">'+esc(why)+'</p></div>';
    }
    sp.warns.forEach(w=>{h+='<div class="chk warn"><i>!</i><div>'+esc(w)+'</div></div>'});
    h+='<div class="card"><div class="srow big"><span>Врачи</span><b>'+money(sp.docSum)+'</b></div>';
    if(!sp.docs.length)h+='<p class="hint">За этот период начисления врачей не загружены (файл Vetmanager).</p>';
    sp.docs.slice().sort((a,b)=>a.name.localeCompare(b.name,'ru')).forEach(x=>{
      h+='<div class="person"><div class="srow big"><span>'+esc(x.name)+'</span><b>'+money(x.doctor+x.sur)+'</b></div><small style="color:var(--mute)">'+(x.doctor?'расчёт Vetmanager':'')+(x.doctor&&x.sur?' + ':'')+(x.sur?'доплата с файла другого врача':'')+'</small></div>';
    });
    h+='<p class="hint">Проценты врачей берутся из файлов Vetmanager (1-го и 16-го числа). Подробности, оклады и остаток к выплате по каждому: «Ведомость».</p><button class="btn sec small" data-act="salpayopen">Открыть ведомость</button> <button class="btn sec small" data-act="salcopy">Скопировать список</button></div>';
    return h;
  }
  if(tab==='adm'||tab==='ast'){
    const list=tab==='adm'?(r.admins||[]):(r.assistants||[]);
    const sum=list.reduce((s,a)=>s+Number(a.total||0),0);
    h+='<div class="card"><div class="srow big"><span>'+(tab==='adm'?'Администраторы':'Ассистенты')+'</span><b>'+money(sum)+'</b></div>';
    if(!list.length)h+='<p class="hint">Нет отчётов со сменами за этот период.</p>';
    list.forEach(a=>{
      if(tab==='adm'){
        h+='<div class="person"><div class="srow big"><span>'+esc(a.name)+'</span><b>'+money(Number(a.total))+'</b></div><small style="color:var(--mute)">Смен: '+a.shifts+'</small>'
          +'<details><summary>Расшифровка и дни</summary>'
          +srow('Смен: '+a.shifts+' × '+money(Number(a.shift_rate)),money(Number(a.shift_pay)))
          +srow('Вал аптеки '+money(Number(a.pharm_val))+' × '+pct+'%',money(Number(a.pct_pay)))
          +(Number(a.late_hours)>0?srow('Задержка: '+a.late_hours+' ч × '+money(Number(rt.hour)),money(Number(a.late_pay))):'')
          +adjItems(a.adj_items)
          +(a.days||[]).map(d=>'<div class="srow sub"><span>'+ruDate(d.date)+' · '+esc(brTitle(d.branch))+(d.left?' · ушёл '+esc(d.left):'')+(Number(d.late_hours)>0?' · '+d.late_hours+' ч':'')+'</span><b>аптека '+money(Number(d.pharm))+'</b></div>').join('')+'</details></div>';
      }else{
        h+='<div class="person"><div class="srow big"><span>'+esc(a.name)+'</span><b>'+money(Number(a.total))+'</b></div><small style="color:var(--mute)">'+esc(SAL_ROLE[a.role]||'')+' · смен: '+a.shifts+'</small>'
          +'<details><summary>Расшифровка и дни</summary>'
          +srow('Смен: '+a.shifts,money(Number(a.shift_pay)))
          +srow('Фиксации: обычные '+a.fix_normal+' × '+money(Number(rt.fix_normal))+', рентген '+a.fix_xray+' × '+money(Number(rt.fix_xray)),money(Number(a.fix_pay)))
          +adjItems(a.adj_items)
          +(a.days||[]).map(d=>'<div class="srow sub"><span>'+ruDate(d.date)+' · '+esc(brTitle(d.branch))+'</span><b>'+d.fix_normal+' + '+d.fix_xray+' рентген</b></div>').join('')+'</details></div>';
      }
    });
    if(list.length)h+='<button class="btn sec small" style="margin-top:6px" data-act="salcopy">Скопировать ведомость</button>';
    return h+'</div>';
  }
  if(tab==='cc')return h+ccSalHtml(r);
  /* добавки */
  h+='<div class="card"><button class="btn sec" style="margin:0 0 8px" data-act="saladd">+ Такси, доплата или вычет</button>';
  const al=(r.adj||[]).filter(i=>!i.is_cancel);
  if(!al.length)h+='<p class="hint">Добавок за этот период нет.</p>';
  al.forEach(i=>{
    h+='<div class="person"'+(i.cancelled?' style="opacity:.55"':'')+'><div class="srow"><span><b'+(i.cancelled?' style="text-decoration:line-through"':'')+'>'+esc(i.name)+'</b><br><small>'+esc(SAL_KIND[i.kind]||i.kind)+' · '+ruDate(i.date)+(i.comment?' · '+esc(i.comment):'')+'</small></span><b>'+sgn(Number(i.amount))+'</b></div>'
      +(i.cancelled?'<small>отменено</small>':'<button class="btn sec small" style="margin-top:6px" data-act="salcancel" data-id="'+i.id+'">Отменить</button>')+'</div>';
  });
  h+='<p class="hint">Расчёт по последним версиям отчётов, без тестового филиала. Задержка: первый час с 21:35, дальше каждый час в :35. Проценты и доплаты выплачиваются за полмесяца.</p>';
  if(al.length)h+='<button class="btn sec small" data-act="salcopy">Скопировать список</button>';
  return h+'</div>';
}

/* ====== Мои начисления: часть «Администратор» по дням (ev_my_salary, только владелец токена) ====== */
function admDaysHtml(r){
  if(!r||!(r.days||[]).length)return '';
  return '<div style="margin-top:6px"><small style="color:var(--mute)">По дням</small>'+(r.days||[]).map(d=>{const dp=Number(r.shift_rate)+Math.round(Number(d.pharm)*Number(r.pharm_pct)*100)/100+Number(d.late_hours||0)*Number(r.shift_rate)/12;
    return '<div class="srow sub"><span>'+ruDate(d.date)+' · '+esc(brTitle(d.branch))+'<br><small style="color:var(--mute)">смена '+money(Number(r.shift_rate))+' + '+(Math.round(Number(r.pharm_pct)*10000)/100)+'% от аптеки '+money(Number(d.pharm))+(Number(d.late_hours)>0?' + переработка '+d.late_hours+' ч':'')+'</small></span><b>'+money(dp)+'</b></div>'}).join('')+'</div>';
}
/* ====== Моя работа (врач/курьер, с 1.46): вал по дням и начисления по периодам; ev_my_work по токену ====== */
const WK_ERR={session:'Сессия закончилась, войдите заново',forbidden:'Нет доступа',period:'Период указан неверно'};
async function showWork(from,to){
  const today=omskToday();
  if(!from){from=perStart(today);to=perEnd(today)}
  S.wkFrom=from;S.wkTo=to;closeOv();S.view='work';S.work=null;S.wkErr=null;paint();window.scrollTo(0,0);loadPayouts();
  try{
    const r=await rpc('ev_my_work',{p_token:S.token,p_from:from,p_to:to},12000);
    if(S.wkFrom!==from||S.wkTo!==to)return;
    if(r&&r.error==='session'){S.token=null;S.work=null;S.wkAdm=null;S.wkHist=false;S.wkHistData=null;S.pay=null;LS.del('ev_token');S.view='login';toast('Сессия закончилась. Войдите заново.');render();loadLoginList().then(render);return}
    if(!r||!r.ok)S.wkErr=WK_ERR[r&&r.error]||'Не удалось загрузить';else{S.work=r;S.wkAdm=null;if(r.own&&r.own.admin){const f0=from,t0=to;rpc('ev_my_salary',{p_token:S.token,p_from:f0,p_to:t0},12000).then(x=>{if(x&&x.ok&&S.wkFrom===f0&&S.wkTo===t0){S.wkAdm=x;if(S.view==='work')paint()}}).catch(()=>{})}}
  }catch(e){if(S.wkFrom!==from||S.wkTo!==to)return;S.wkErr=e.net?'Нет связи.':'Ошибка сервера.'}
  if(S.view==='work')paint();
}
function wkDetails(d){
  if(!d||!Array.isArray(d.lines)||!d.lines.length)return '';
  return '<div style="margin:4px 0 8px 10px">'+d.lines.map(l=>{
    const nm=esc(String(l.title||l.name||l.svc||l.service||'')),pc=l.pct!=null?' · '+esc(String(l.pct))+'%':'';
    const am=l.amount!=null&&isFinite(Number(l.amount))?money(Number(l.amount)):'';
    return '<div class="srow sub"><span>'+nm+pc+'</span><b>'+am+'</b></div>'}).join('')+'</div>';
}
/* единые названия частей начисления: у сотрудника и в ведомости */
const PART_NAME={admin:'Администратор',assistant:'Ассистент',callcenter:'Колл-центр',doctor:'Врач (проценты)',fixed:'Оклад',surcharge:'Доплата за продажи',extra:'Доплаты и вычеты',outsource:'Аутсорс: описания снимков'};
const PAY_PART=PART_NAME;
const PAY_START='2026-10-16'; /* учёт зарплат врачей в приложении с 16.10.2026, раньше считалось вручную */
const WK_PARTS=[['admin',PART_NAME.admin],['assistant',PART_NAME.assistant],['callcenter',PART_NAME.callcenter],['percent',PART_NAME.doctor],['fixed',PART_NAME.fixed],['surcharge',PART_NAME.surcharge],['adj',PART_NAME.extra]];
async function loadHist(){
  S.wkHistData=null;S.wkHistErr=null;
  try{const r=await rpc('ev_my_history',{p_token:S.token,p_limit:72},20000);
    if(r&&r.error==='session'){S.token=null;S.work=null;LS.del('ev_token');S.view='login';toast('Сессия закончилась. Войдите заново.');render();loadLoginList().then(render);return}
    if(!r||!r.ok)S.wkHistErr='Не удалось загрузить историю';else S.wkHistData=r}
  catch(e){S.wkHistErr=e.net?'Нет связи.':'Ошибка сервера.'}
  if(S.view==='work'&&S.wkHist)paint();
}
function histHtml(){
  const d=S.wkHistData;
  if(S.wkHistErr)return '<div class="card"><p>'+esc(S.wkHistErr)+'</p><button class="btn sec small" data-act="wkhist" data-reload="1">Повторить</button></div>';
  if(!d)return '<div class="card"><p class="hint">Загружаю историю…</p></div>';
  const M=['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'],g=new Map();
  (d.periods||[]).forEach(p=>{const k=p.from.slice(0,7);if(!g.has(k))g.set(k,[]);g.get(k).push(p)});
  let h='<div class="card"><h3 style="margin-top:2px">История начислений</h3>';
  g.forEach((ps,k)=>{
    const tot=ps.reduce((q,p)=>q+Number(p.total),0);
    h+='<div class="srow big" style="margin-top:10px"><span><b>'+M[Number(k.slice(5))-1]+' '+k.slice(0,4)+'</b></span><b>'+money(tot)+'</b></div>';
    ps.forEach(p=>{h+='<button class="hrow'+(S.wkFrom===p.from?' on':'')+'" data-act="wkper" data-from="'+p.from+'" data-to="'+p.to+'"><span>'+Number(p.from.slice(8))+'–'+Number(p.to.slice(8))+(p.closed?'':' · не закрыт')+'</span><b>'+money(Number(p.total))+'</b></button>'});
  });
  if(!(d.periods||[]).length)h+='<p class="hint">Начислений пока нет.</p>';
  h+='<p class="hint" style="margin:8px 0 0">'+(d.more?'Показаны последние периоды. ':'')+'До 16.10.2026 начисления считались вручную и в приложении не показываются.</p></div>';
  return h;
}
function perLabel(f,t){const M=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'],d=new Date(f+'T00:00:00Z');return Number(f.slice(8))+'–'+Number(t.slice(8))+' '+M[d.getUTCMonth()]+' '+d.getUTCFullYear()}
function workHtml(){
  const today=omskToday(),cs=perStart(today),f=S.wkFrom||cs,t=S.wkTo||perEnd(cs),r=S.work;
  const canPrev=f>PAY_START,canNext=f<cs,isCur=f===cs;
  let h=(S.person?'<p class="hello">'+esc(stageGreeting(S.person))+'</p>':'')+'<h1 class="screen-title">Мои начисления</h1>'
    +'<div class="period"><button class="pn" data-act="wkshift" data-d="-1"'+(canPrev?'':' disabled')+' aria-label="Предыдущий период">‹</button><div class="pc"><b>'+perLabel(f,t)+'</b><small>'+(isCur?'текущий период':ruDate(f)+' — '+ruDate(t))+'</small></div><button class="pn" data-act="wkshift" data-d="1"'+(canNext?'':' disabled')+' aria-label="Следующий период">›</button></div>'
    +'<div class="dseg"><button class="'+(S.wkHist?'':'on')+'" data-act="wkper" data-from="'+cs+'" data-to="'+perEnd(cs)+'">Текущий период</button><button class="'+(S.wkHist?'on':'')+'" data-act="wkhist">История</button></div>'
    +(isHead()?'<button class="btn sec small" data-act="go" data-v="branch" style="margin:0 0 12px">← На главную</button>':'')
    +(canPrev?'':'<p class="hint" style="color:rgba(234,246,248,.72);margin:6px 2px 12px">Начисления до 16.10.2026 считались вручную и в приложении не показываются.</p>');
  if(S.wkHist)h+=histHtml();
  if(S.wkErr)return h+'<div class="card"><p>'+esc(S.wkErr)+'</p><button class="btn sec small" data-act="wkper" data-from="'+f+'" data-to="'+t+'">Повторить</button></div>';
  if(!r)return h+'<div class="card"><p class="hint">Загружаю…</p></div>';
  const sm=r.summary||{},own=r.own||{},ps2=r.periods||[];
  const docShow=!!(r.doctor&&(Number(r.val_total)||ps2.some(x=>x.source==='vetmanager')));
  const present=WK_PARTS.filter(p=>Number(sm[p[0]])||(p[0]==='percent'&&docShow)||(p[0]==='adj'&&(r.adj||[]).length));
  let tab=S.wkTab||'all';if(tab!=='all'&&!present.some(p=>p[0]===tab))tab='all';
  const show=k=>tab==='all'||tab===k;
  /* общий итог на одном экране + переключатель частей */
  h+='<div class="card pay"><div class="srow big"><span>Итого начислено'+(r.provisional?'<br><small style="color:var(--mute)">предварительно, период не закрыт</small>':'')+'</span><b>'+money(Number(sm.total!=null?sm.total:0))+'</b></div>';
  if(present.length>1){
    h+='<div class="wktabs"><button class="chip'+(tab==='all'?' on':'')+'" data-act="wktab" data-k="all">Всё</button>'+present.map(p=>'<button class="chip'+(tab===p[0]?' on':'')+'" data-act="wktab" data-k="'+p[0]+'"><span>'+p[1]+'</span> <b>'+(p[0]==='adj'?sgn(Number(sm.adj||0)):money(Number(sm[p[0]]||0)))+'</b></button>').join('')+'</div>';
  }else if(present.length===1)h+='<p class="hint" style="margin:4px 0 0">'+present[0][1]+'</p>';
  h+='</div>';
  if(r.provisional&&docShow&&show('percent'))h+='<div class="chk warn"><i>!</i><div>Период не закрыт или отчёты администраторов за последние дни ещё не внесены. Сумма изменится.</div></div>';
  /* врач: вал и проценты */
  if(docShow&&show('percent')){
    h+='<div class="card"><h3 style="margin-top:2px">'+PART_NAME.doctor+' · вал за период</h3><div class="srow big"><span>Итого вал</span><b>'+money(Number(r.val_total))+'</b></div>';
    if(!(r.days||[]).length)h+='<p class="hint">За этот период в отчётах нет вашего вала.</p>';
    (r.days||[]).forEach(d=>{h+='<div class="srow"><span><b>'+ruDate(d.date)+'</b>'+((d.branches||[]).length?'<br><small style="color:var(--mute)">'+(d.branches||[]).map(esc).join(', ')+'</small>':'')+'</span><b>'+money(Number(d.val))+'</b></div>'});
    h+='<p class="hint" style="margin:6px 0 0">Вал берётся из вечерних отчётов администраторов. Проценты с услуг считает Vetmanager, они появляются ниже после расчёта.</p></div>';
  }
  /* начисления по источникам */
  const srcKey={vetmanager:'percent',fixed:'fixed',surcharge:'surcharge'},srcName={fixed:PART_NAME.fixed,surcharge:PART_NAME.surcharge+' (по расчёту Vetmanager)',vetmanager:PART_NAME.doctor+', расчёт Vetmanager'};
  const pshow=ps2.filter(p=>show(srcKey[p.source]||'percent'));
  if(pshow.length||(docShow&&show('percent'))){
    h+='<div class="card"><h3 style="margin-top:2px">Начисления по периодам</h3>';
    if(!pshow.length)h+='<p class="hint">Начисление за период появится после расчёта зарплаты врачей.</p>';
    pshow.forEach(p=>{
      h+='<div class="srow big"><span><b>'+ruDate(p.from)+' — '+ruDate(p.to)+'</b><br><small style="color:var(--mute)">'+(srcName[p.source]||srcName.vetmanager)+(p.closed?'':' · период не закрыт')+'</small></span><b>'+money(Number(p.amount))+'</b></div>'
        +((p.parts||[]).length>1?(p.parts||[]).map(x=>'<div class="srow sub"><span>'+esc(String(x.branch).replace(/^ЕВРОВЕТ\s*/,''))+'</span><b>'+money(Number(x.amount))+'</b></div>').join(''):'')+wkDetails(p.details);
    });
    h+='<p class="hint" style="margin:6px 0 0">Возможны поправки до выплаты. Вопросы по расчёту — руководителю.</p></div>';
  }
  /* смены администратора и ассистента */
  [['admin',PART_NAME.admin],['assistant',PART_NAME.assistant],['callcenter',PART_NAME.callcenter]].forEach(([k,l])=>{
    const o=own[k];if(!o||!show(k))return;
    h+='<div class="card"><h3 style="margin-top:2px">'+l+'</h3><div class="srow big"><span>Смен: '+Number(o.shifts||0)+'</span><b>'+money(Number(o.total))+'</b></div>'
      +(Number(o.shift_pay)?'<div class="srow sub"><span>за смены</span><b>'+money(Number(o.shift_pay))+'</b></div>':'')
      +(Number(o.pharm_pay)?'<div class="srow sub"><span>процент с аптеки</span><b>'+money(Number(o.pharm_pay))+'</b></div>':'')
      +(Number(o.late_pay)?'<div class="srow sub"><span>переработка</span><b>'+money(Number(o.late_pay))+'</b></div>':'')
      +(k==='callcenter'&&Number(o.pct_pay)?'<div class="srow sub"><span>процент (пул)</span><b>'+money(Number(o.pct_pay))+'</b></div>':'')
      +(k==='admin'?admDaysHtml(S.wkAdm):'')
      +(k==='callcenter'?'<button class="btn sec small" style="margin-top:8px" data-act="go" data-v="cc">Мои смены и отметки</button>':'')
      +(Number(o.fix_pay)?'<div class="srow sub"><span>фиксации</span><b>'+money(Number(o.fix_pay))+'</b></div>':'')+'</div>';
  });
  if((r.adj||[]).length&&show('adj')){
    h+='<div class="card"><h3 style="margin-top:2px">Доплаты и вычеты за период</h3>'+r.adj.map(i=>srow(ruDate(i.date)+' · '+esc(SAL_KIND[i.kind]||i.kind)+(i.comment?'<br><small style="color:var(--mute)">'+esc(i.comment)+'</small>':''),sgn(Number(i.amount)))).join('')
      +'<div class="srow big"><span>Итого за период</span><b>'+sgn(Number(r.adj_total))+'</b></div></div>';
  }
  if(S.wkFrom)loadVacation(S.wkFrom,S.wkTo);
  if(S.person&&VAC.key===S.wkFrom+'|'+S.wkTo)h+=vacPersonHtml(S.person.id);
  h+=payoutsHtml();
  return h;
}

/* ====== Ведомость руководителя (с 1.46): начислено, выплачено, остаток к выплате; с 1.49 расчёт, наличные, авансы, печать ======= */
function payrollDefaultPeriod(today,periods){
  const open=muDefaultPeriod(today,periods);
  return open||[perStart(today),perEnd(today)];
}
async function showPay(from,to){
  const today=omskToday();
  if(!from){
    try{
      const b=await rpc('ev_mu_batches',{p_token:S.token},15000);
      if(b&&b.error==='session'){S.token=null;S.work=null;S.wkAdm=null;S.wkHist=false;S.wkHistData=null;S.pay=null;LS.del('ev_token');S.view='login';toast('Сессия закончилась. Войдите заново.');render();loadLoginList().then(render);return}
      if(!b||!b.ok)throw new Error('periods');
      [from,to]=payrollDefaultPeriod(today,b.periods);
    }catch(e){
      const rg=payrollDefaultPeriod(today,[]);from=rg[0];to=rg[1];
      S.payFrom=from;S.payTo=to;S.payMulti=null;S.payPeriodLookupError=true;closeOv();S.view='pay';S.pay=null;S.payErr='Не удалось определить первый невыплаченный период. Повторите загрузку.';paint();window.scrollTo(0,0);return;
    }
  }
  S.payFrom=from;S.payTo=to;S.payMulti=null;S.payPeriodLookupError=false;closeOv();S.view='pay';S.pay=null;S.payErr=null;paint();window.scrollTo(0,0);
  if(S.pplMode&&uiNew())loadExtras(from,to);
  try{
    const r=await rpc('ev_payroll_statement',{p_token:S.token,p_from:from,p_to:to},20000);
    if(S.payFrom!==from||S.payTo!==to)return;
    if(r&&r.error==='session'){S.token=null;S.work=null;S.wkAdm=null;S.wkHist=false;S.wkHistData=null;S.pay=null;LS.del('ev_token');S.view='login';toast('Сессия закончилась. Войдите заново.');render();loadLoginList().then(render);return}
    if(!r||!r.ok)S.payErr=SAL_ERR[r&&r.error]||'Не удалось загрузить';else S.pay=r;
  }catch(e){if(S.payFrom!==from||S.payTo!==to)return;S.payErr=e.net?'Нет связи.':'Ошибка сервера.'}
  if(S.view==='pay')paint();
}

/* ====== Сейф (1.56): начислено, выплачено, остаток к выплате, остаток в сейфе, нехватка ====== */
/* Кто не входит в «Остаток к выплате» сейфа (свод §14): список приходит с сервера (ev_cash_exclusions), в коде номеров нет.
   excl: массив номеров; null — список не загрузился: остаток к выплате и нехватку НЕ считаем (failed), показываем «Повторить». */
function safeTotals(rows,excl,c){const N=v=>Number(v||0),E=(excl||[]).map(Number),skipRows=rows.filter(x=>E.includes(Number(x.id))),skip=skipRows.reduce((q,x)=>q+Math.max(0,N(x.to_pay)),0),need=rows.filter(x=>!E.includes(Number(x.id))).reduce((q,x)=>q+Math.max(0,N(x.to_pay)),0),bal=c?(c.balance!=null?N(c.balance):N(c.on_hand)):null;if(excl===null)return{skipRows:[],skip:0,need:null,bal,short:null,failed:true};const short=bal==null?null:need-bal;return{skipRows,skip,need,bal,short,failed:false}}
async function retrySafeExcl(){ // кнопка «Повторить»: запросить только список исключений
  S.cashExcl=undefined;if(S.view==='pay'&&S.paySafe)paint();let x=null;
  try{x=await rpc('ev_cash_exclusions',{p_token:S.token},8000)}catch(e){}
  S.cashExcl=(x&&x.ok&&Array.isArray(x.person_ids))?x.person_ids.map(Number):null;
  if(S.view==='pay'&&S.paySafe)paint();
}
async function loadSafe(){
  try{const [r,m,x]=await Promise.all([rpc('ev_cash_on_hand',{p_token:S.token},8000),rpc('ev_my_cash_today',{p_token:S.token},8000),rpc('ev_cash_exclusions',{p_token:S.token},8000).catch(()=>null)]);S.cashExcl=(x&&x.ok&&Array.isArray(x.person_ids))?x.person_ids.map(Number):null;S.cash=(r&&r.ok)?r:null;S.myCash=(m&&m.ok)?m:null;S.safeErr=(r&&r.ok)?null:(r&&r.error==='forbidden'?'Нет доступа':'Не удалось загрузить сейф')}
  catch(e){if(S.cashExcl===undefined)S.cashExcl=null;S.safeErr=e.net?'Нет связи.':'Ошибка сервера.'}
  if(S.view==='pay'&&S.paySafe)paint();
}
function safeBody(){
  const r=S.pay,c=S.cash,N=v=>Number(v||0);let h='';
  if(S.payErr)return '<div class="card"><p>'+esc(S.payErr)+'</p></div>';
  if(!r)return '<div class="card"><p class="hint">Загружаю…</p></div>';
  const rows=r.rows||[],tot=r.total||{};
  const {skipRows,skip,need,bal,short,failed:exclFail}=safeTotals(rows,S.cashExcl,c),exclWait=S.cashExcl===undefined;
  const prov=!!r.provisional||(r.warnings||[]).some(w=>/не закрыт|не загружен/i.test(String(w)));
  h+='<div class="card"><h3 style="margin-top:2px">Зарплата за период</h3>'
    +'<div class="srow"><span>Начислено</span><b>'+money(N(tot.accrued))+'</b></div>'
    +'<div class="srow"><span>Выплачено</span><b>'+money(N(tot.paid))+'</b></div>'
    +'<div class="srow big"><span>Остаток к выплате</span><b>'+(exclWait?'…':exclFail?'—':money(need))+'</b></div>'+(exclFail?'<p class="hint" data-safe-excl-fail>Список исключений не загрузился — остаток не показан</p><div class="chips"><button class="btn" data-act="safeexclretry">Повторить</button></div>':'')+(skipRows.length?'<div class="srow sub"><span>не входит в общую выдачу: '+skipRows.map(x=>esc(x.name)).join(', ')+' (расчёт ведётся отдельно)</span><b>'+money(skip)+'</b></div>':'')
    +((r.warnings||[]).length?'<p class="hint" style="margin-top:8px">'+r.warnings.map(esc).join('<br>')+'</p>':'')+'</div>';
  h+='<div class="card"><h3 style="margin-top:2px">Сейф</h3>';
  if(!c||exclWait)h+='<p class="hint">'+esc(S.safeErr||'Загружаю…')+'</p>';
  else{
    const lack=short>0.005;
    h+='<div class="srow"><span>Подтверждённые инкассации с '+ruDate(c.from)+'</span><b>'+money(N(c.on_hand))+'</b></div>'
      +'<div class="srow"><span>Взято из сейфа на выплаты</span><b>−'+money(N(c.taken))+'</b></div>'
      +'<div class="srow big"><span>Остаток в сейфе</span><b'+(bal<0?' style="color:var(--bad)"':'')+'>'+money(bal)+'</b></div>'
      /* 1.68: крупная цветная строка-вердикт: красная «не хватает», зелёная «хватает» */
      +(exclFail?'<p class="hint">Хватает ли кэша — не показано: нет списка исключений.</p>':'<div class="srow" style="margin-top:10px;padding:12px 14px;border-radius:12px;font-size:21px;font-weight:800;background:var(--'+(lack?'badbg':'okbg')+');color:var(--'+(lack?'bad':'ok')+')"><span>'+(lack?'Не хватает кэша':'Кэша хватает')+'</span><b>'+money(Math.abs(short))+'</b></div>')
      +'<p class="hint">'+(prov?'Предварительно: период не закрыт. ':'')+(bal<0?'Минус: взято больше, чем подтверждено инкассаций. ':'')+(N(c.pending)?'Не подтверждено вами: '+money(N(c.pending))+' (не входит). ':'')+'</p>';
    if(S.myCash)h+='<div class="person"><h3>Мои наличные сегодня</h3><div class="srow"><span>Забрано с филиалов</span><b>'+money(N(S.myCash.collections))+'</b></div><div class="srow"><span>Взято из сейфа</span><b>'+money(N(S.myCash.safe_out))+'</b></div><div class="srow"><span>Выдано из кассы сотрудникам</span><b>−'+money(N(S.myCash.cash_payroll))+'</b></div><div class="srow big"><span>Должно быть на руках</span><b>'+money(N(S.myCash.on_hand))+'</b></div></div>';
    S.safeUid=S.safeUid||uid();
    h+='<h3>Деньги в моменте</h3><div class="chips" style="margin-bottom:8px"><button class="btn" data-act="transitpickup">Забрал с филиала</button></div><p class="hint" style="margin:0 0 10px">Филиал и сумма — запись сразу «в пути». Когда администратор сдаст вечерний отчёт, суммы сверятся.</p>'
    +'<h3>Взял из сейфа</h3><label class="f"><span>Сумма, ₽</span><input id="soa" inputmode="decimal"></label>'
      +'<label class="f"><span>Дата</span><input id="sod" type="date" min="2026-10-16" value="'+esc(omskToday())+'"></label>'
      +'<label class="f"><span>Назначение</span><select id="sop"><option value="salary">Зарплата</option><option value="other">Другое</option></select></label>'
      +'<label class="f"><span>Комментарий</span><input id="son" maxlength="300" placeholder="например, выплата админам"></label>'
      +'<button class="btn" data-act="safeadd">Отметить</button>';
    const outs=c.outs||[];
    if(outs.length)h+='<h3>Что взято</h3>'+outs.map(o=>'<div class="srow"><span>'+ruDate(o.date)+(o.note?'<br><small style="color:var(--mute)">'+esc(o.note)+'</small>':'')+'</span><span><b>'+money(N(o.amount))+'</b> <button class="btn sec small" data-act="safecancel" data-id="'+o.id+'">Отменить</button></span></div>').join('');
  }
  return h+'</div>';
}
async function doSafeAdd(){
  if(S.safeBusy)return;
  const v=num(($('#soa')||{}).value),dt=($('#sod')||{}).value,p=(($('#sop')||{}).value||'other'),n=(($('#son')||{}).value||'').trim();
  if(v==null||isNaN(v)||v<=0){toast('Введите сумму больше нуля');return}if(!dt){toast('Укажите дату');return}
  S.safeBusy=true;
  try{
    const r=await rpc('ev_safe_out_add_v2',{p_token:S.token,p_amount:v,p_date:dt,p_purpose:p,p_note:n||null,p_uid:S.safeUid||uid()},10000);
    if(!r||!r.ok){toast(r&&r.error==='input'?'Проверьте сумму и дату (не раньше 16.10, не в будущем)':'Не удалось: '+(r&&r.error),7000);return}
    S.safeUid=null;toast('Отмечено');await loadSafe();
  }catch(e){toast(e.net?'Нет связи, ничего не сохранено':'Ошибка сервера',6000)}
  finally{S.safeBusy=false}
}
async function doSafeCancel(id){
  if(S.safeBusy||!confirm('Отменить эту отметку?'))return;
  S.safeBusy=true;
  try{const r=await rpc('ev_safe_out_cancel',{p_token:S.token,p_id:Number(id)},10000);if(!r||!r.ok){toast('Не удалось отменить',6000);return}toast('Отменено');await loadSafe()}
  catch(e){toast(e.net?'Нет связи':'Ошибка сервера',6000)}
  finally{S.safeBusy=false}
}
function payPeriods(today){
  const out=[];let a=PAY_START;
  while(a<=today){const b=perEnd(a);out.push([a,b]);a=addDays(b,1)}
  return out;
}
function mergeStatements(rs,list){
  const m=new Map(),warn=[],N=v=>Number(v||0);
  rs.forEach((r,i)=>{
    (r.rows||[]).forEach(x=>{
      let o=m.get(x.id);if(!o){o={id:x.id,name:x.name,accrued:0,parts:{},paid:0,paid_card:0,paid_cash:0,paid_adv:0,to_pay:0,over_paid:false,closed:true,diff:0,adv_debt:0};m.set(x.id,o)}
      o.accrued+=N(x.accrued);o.paid+=N(x.paid);o.paid_card+=N(x.paid_card);o.paid_cash+=N(x.paid_cash);o.paid_adv+=N(x.paid_adv);o.to_pay+=N(x.to_pay);
      Object.keys(x.parts||{}).forEach(k=>{o.parts[k]=(o.parts[k]||0)+N(x.parts[k])});
      if(!x.closed)o.closed=false;else o.diff+=N(x.diff);
      o.adv_debt=Math.max(o.adv_debt,N(x.adv_debt));o.over_paid=o.over_paid||!!x.over_paid;
    });
    (r.warnings||[]).forEach(w=>{warn.push(ruDate(list[i][0]).slice(0,5)+'–'+ruDate(list[i][1]).slice(0,5)+': '+w)});
  });
  const rows=[...m.values()].sort((a,b)=>String(a.name).localeCompare(String(b.name),'ru'));
  const sum=k=>rows.reduce((q,x)=>q+N(x[k]),0);
  return{ok:true,multi:true,from:list[0][0],to:list[list.length-1][1],provisional:rs.some(r=>r.provisional),rows,adj:[],people:[],
    total:{accrued:sum('accrued'),paid:sum('paid'),to_pay:sum('to_pay'),diff:rows.reduce((q,x)=>q+(x.closed?N(x.diff):0),0),closed_n:rows.filter(x=>x.closed).length,people_n:rows.length,adv_debt:sum('adv_debt')},warnings:warn.slice(0,12)};
}
async function showPayMulti(list){
  S.payFrom=list[0][0];S.payTo=list[list.length-1][1];S.payMulti=list;S.paySel={};closeOv();S.view='pay';S.pay=null;S.payErr=null;paint();window.scrollTo(0,0);
  try{
    const rs=await Promise.all(list.map(q=>rpc('ev_payroll_statement',{p_token:S.token,p_from:q[0],p_to:q[1]},25000)));
    if(S.payMulti!==list)return;
    const bad=rs.find(r=>!r||!r.ok);
    if(bad)S.payErr=SAL_ERR[bad&&bad.error]||'Не удалось загрузить';else S.pay=mergeStatements(rs,list);
  }catch(e){if(S.payMulti!==list)return;S.payErr=e.net?'Нет связи.':'Ошибка сервера.'}
  if(S.view==='pay')paint();
}
function payDatesGo(){
  const f=($('#pdf')||{}).value,t=($('#pdt')||{}).value;
  if(!f||!t||t<f){toast('Проверьте даты');return}
  if(f<PAY_START){toast('Учёт в приложении с 16.10.2026');return}
  const today=omskToday(),list=[];let a=perStart(f);
  while(a<=t&&a<=today&&list.length<13){list.push([a,perEnd(a)]);a=addDays(perEnd(a),1)}
  if(!list.length){toast('В этих датах нет периодов');return}
  S.payDates=false;
  if(list.length===1)showPay(list[0][0],list[0][1]);else showPayMulti(list);
}
function payrollDoctorRows(r,rows){
  const people=r.people||[],byId=new Map(rows.map(x=>[String(x.id),x]));
  const out=people.filter(x=>x.role==='doctor').map(p=>{
    const x=byId.get(String(p.id));
    if(x)return {...x,_doctorMissing:!(r.doctor_files||[]).length&&!Number((x.parts||{}).doctor)};
    return {id:Number(p.id),name:p.name,accrued:0,parts:{},paid:0,to_pay:0,over_paid:false,paid_card:0,paid_cash:0,paid_adv:0,closed:false,diff:0,adv_debt:0,_doctorMissing:!(r.doctor_files||[]).length};
  });
  rows.filter(x=>x.parts&&Number(x.parts.doctor)&&!out.some(d=>String(d.id)===String(x.id))).forEach(x=>out.push(x));
  return out;
}
function payrollAllRows(rows,doctorRows){
  const out=(rows||[]).slice(),seen=new Set(out.map(x=>String(x.id)));
  (doctorRows||[]).forEach(x=>{if(!seen.has(String(x.id))){seen.add(String(x.id));out.push(x)}});
  return out;
}
function payHtml(){
  const today=omskToday(),cs=perStart(today),pe=addDays(cs,-1),ps=perStart(pe),f=S.payFrom||(ps>=PAY_START?ps:cs),t=S.payTo||(ps>=PAY_START?pe:perEnd(cs)),r=S.pay;
  const mu=!!(r&&r.multi)||!!S.payMulti;
  const chip=(l,a,b)=>'<button class="chip'+((!mu&&f===a&&t===b)?' on':'')+'" data-act="payper" data-from="'+a+'" data-to="'+b+'">'+l+'</button>';
  const pers=payPeriods(today),lastP=pers.length-1;
  const chips=pers.slice().reverse().slice(0,8).map((q,i)=>chip(i===0?'Этот период':i===1?'Прошлый период':ruDate(q[0]).slice(0,5)+' — '+ruDate(q[1]).slice(0,5),q[0],q[1])).join('');
  if(S.pplMode&&uiNew())return pplHtml();
  const pi=pers.findIndex(q=>q[0]===f&&q[1]===t),prev=pi>0?pers[pi-1]:null,next=pi>=0&&pi<lastP?pers[pi+1]:null;
  const newPayHead=uiNew()&&!S.paySafe&&!mu
    ?'<h1 class="screen-title">Зарплата за '+perLabel(f,t).replace(/\s+\d{4}$/,'')+'</h1><div class="pay-period-switch"><button class="btn sec small" data-act="payper"'+(prev?' data-from="'+prev[0]+'" data-to="'+prev[1]+'"':' disabled')+'>‹ прошлый</button><span aria-hidden="true">|</span><button class="btn sec small" data-act="payper"'+(next?' data-from="'+next[0]+'" data-to="'+next[1]+'"':' disabled')+'>следующий ›</button></div>'
    :'';
  let h=(isHead()&&uiNew()&&!S.paySafe&&!mu?'<div class="card">'+pplSwitchHtml('pay')+'</div>':'')+newPayHead+'<div class="card">'+(uiNew()?'':'<button class="btn sec small" data-act="go" data-v="branch" style="margin:0 0 10px">← На главную</button>')+(newPayHead?'':'<h2>'+(S.paySafe&&uiNew()?'Сейф':uiNew()?'Зарплата':'Ведомость')+'</h2>')+(newPayHead?'':'<div class="chips">'+chips+'</div>')+'<div class="chips"><button class="chip'+((mu||S.payDates)?' on':'')+'" data-act="paydates">'+(newPayHead?'Другой период ▾':'Даты ▾')+'</button></div>'
    +(S.payDates?'<div style="display:flex;gap:8px;align-items:flex-end;margin:6px 0"><label class="f" style="flex:1;min-width:0;margin:0"><span>С</span><input id="pdf" type="date" min="'+PAY_START+'" value="'+esc(f)+'"></label><label class="f" style="flex:1;min-width:0;margin:0"><span>По</span><input id="pdt" type="date" min="'+PAY_START+'" value="'+esc(t)+'"></label><button class="btn small" data-act="paydatesgo">Показать</button></div>':'')
    +(newPayHead&&!S.payDates&&!mu?'':'<p class="hint" style="margin:6px 0">'+ruDate(f)+' — '+ruDate(t))+(newPayHead&&!S.payDates&&!mu?'':'')+(mu?' · несколько периодов, только просмотр: «Рассчитан», выплаты и авансы вносятся по одному периоду':'')+(newPayHead&&!S.payDates&&!mu?'':'</p>')+(ps<PAY_START&&pers.length<2?'<p class="hint" style="margin:0">Учёт в приложении идёт с 16.10.2026; прошлый период появится после 1.11.</p>':'')+'</div>';
  if(S.paySafe&&uiNew())return h+safeBody();
  if(S.payErr)return h+'<div class="card"><p>'+esc(S.payErr)+'</p><button class="btn sec small" data-act="'+(S.payPeriodLookupError?'paydefault':'payper')+'"'+(S.payPeriodLookupError?'':' data-from="'+f+'" data-to="'+t+'"')+'>Повторить</button></div>';
  if(!r)return h+'<div class="card"><p class="hint">Загружаю…</p></div>';
  const tt=r.total||{};
  /* 1.63: сводка закрытия периода */
  if(!r.provisional){
    const open=(r.rows||[]).filter(x=>!x.closed),pn=Number(tt.people_n||0);
    if(pn&&!open.length)h+='<div class="chk ok"><i>✓</i><div><b>Период закрыт</b>: рассчитано '+pn+' из '+pn+(Number(tt.diff)?', разница '+sgn(Number(tt.diff)):'')+'</div></div>';
    else if(open.length)h+='<div class="chk warn"><i>!</i><div><b>Период не закрыт</b>: не рассчитано '+open.length+' из '+pn+'<br><small>'+open.map(x=>esc(x.name)).slice(0,12).join(', ')+(open.length>12?' и ещё '+(open.length-12):'')+'</small></div></div>';
  }
  h+='<div class="card pay"><h3 style="margin-top:2px">Итого по ведомости'+(r.provisional?' · предварительно':'')+'</h3>'
    +srow('К выплате всего (начислено)',money(Number(tt.accrued)))+srow('− Выплачено',money(Number(tt.paid)))
    +(!r.provisional&&Number(tt.people_n)&&Number(tt.closed_n)===Number(tt.people_n)
      ?'<div class="srow big"><span>Выдано полностью ✓</span><b></b></div>'+(Math.abs(Number(tt.to_pay))>=0.005?'<div class="srow sub"><span>перенос разниц '+sgn(Number(tt.to_pay))+' в '+esc(nextPerLabel(r.to))+'</span><b></b></div>':'')
      :'<div class="srow big"><span>= Остаток к выплате</span><b>'+money(Number(tt.to_pay))+'</b></div>')
    +'<div class="srow sub"><span>Рассчитано сотрудников</span><b>'+Number(tt.closed_n||0)+' из '+Number(tt.people_n||0)+'</b></div>'
    +(Number(tt.diff)?'<div class="srow sub"><span>Разница округлений и переплат</span><b>'+sgn(Number(tt.diff))+'</b></div>':'')
    +(Number(tt.adv_debt)?'<div class="srow sub"><span>Выдано в долг, не удержано</span><b>'+money(Number(tt.adv_debt))+'</b></div>':'')
    +vacPeriodLine(r)
    +'</div>';
  if(!r.multi)h+='<div class="card"><button class="btn" data-act="saladd">+ Такси, доплата или вычет</button></div>';
  (r.warnings||[]).forEach(w=>{h+='<div class="chk warn"><i>!</i><div>'+esc(w)+'</div></div>'});
  /* 2.0 §15 «Выплата»: два фильтра вместе — группа (по основной роли, человек в одной группе) и статус (по умолчанию «не выплачено») */
  const GRP=[['admin','Администраторы'],['doctor','Врачи'],['assistant','Ассистенты'],['callcenter','Колл-центр'],['outsource','Аутсорс']];
  const rows=r.rows||[],doctorRows=payrollDoctorRows(r,rows),allRows=payrollAllRows(rows,doctorRows);
  const mainOf=new Map(pplRows({rows:allRows,people:r.people||[]}).map(x=>[String(x.id),pplMainGroup(x)]));
  const grp=x=>mainOf.get(String(x.id))||(x._doctorMissing?'doctor':null);
  const has=g=>allRows.filter(x=>grp(x)===g).length;
  let pt=S.payTab||'all';const q=(S.paySearch||'').trim().toLowerCase();if(pt!=='all'&&!has(pt))pt='all';
  const st=S.payStat||'unpaid',isPaid=x=>!!x.closed||Number(x.to_pay)<=0.005;
  const shown=allRows.filter(x=>(pt==='all'||grp(x)===pt)&&(!q||String(x.name).toLowerCase().includes(q)));
  const list=shown.filter(x=>st==='all'||(st==='paid'?isPaid(x):!isPaid(x)));
  S.payVisible=list.map(x=>x.id);
  const left=list.filter(x=>!isPaid(x)).reduce((q2,x)=>q2+Math.max(0,Number(x.to_pay)),0);
  h+='<div class="card"><h3 style="margin-top:2px">По сотрудникам</h3><div class="wktabs"><button class="chip'+(pt==='all'?' on':'')+'" data-act="paytab" data-k="all"><span>Все</span> <b>'+allRows.length+'</b></button>'+GRP.filter(g=>has(g[0])).map(g=>'<button class="chip'+(pt===g[0]?' on':'')+'" data-act="paytab" data-k="'+g[0]+'"><span>'+g[1]+'</span> <b>'+has(g[0])+'</b></button>').join('')+'</div>';
  const sel=S.paySel||(S.paySel={});const canClose=!r.provisional&&!r.multi;
  h+='<div class="wktabs" style="margin-top:6px">'+[['unpaid','Не выплачено'],['paid','Выплачено'],['all','Все']].map(k=>'<button class="chip'+(st===k[0]?' on':'')+'" data-act="paystat" data-k="'+k[0]+'">'+k[1]+'</button>').join('')+'</div>';
  h+='<div class="srow big"><span>Осталось выдать</span><b>'+money(left)+'</b></div>';
  h+='<div class="chips" style="margin:4px 0">'+(canClose?'<button class="chip" data-act="payselall">Выбрать всех с остатком</button>':'')+'<button class="chip" data-act="payprint">Печать ведомости</button></div>';
  list.forEach(x=>{
    const ks=Object.keys(x.parts||{}).filter(k=>Number(x.parts[k])),op=String(S.payOpen)===String(x.id);
    const tp=Number(x.to_pay),tcls=x.closed?' zero':x.over_paid?' over':(tp<=0.005?' zero':''),tlab=x.closed?(Math.abs(tp)>=0.005?'Выдано · разница в след. период':'Выдано полностью ✓'):x.over_paid?'Переплата (проверить)':(tp<=0.005?'Выплачено полностью ✓':'К выплате сейчас');
    h+='<div class="person pc'+(x.closed?' done':'')+'" style="cursor:pointer"><div class="pcrow"><div><div class="srow" data-act="payopenp" data-id="'+x.id+'"><span>'+(canClose&&!x.closed&&!x._doctorMissing?'<input type="checkbox" data-act="paysel" data-id="'+x.id+'"'+(sel[x.id]?' checked':'')+' style="width:20px;height:20px;vertical-align:middle;margin-right:8px">':'')+'<b>'+esc(x.name)+'</b><br><small style="color:var(--mute)">'+(x._doctorMissing?'Начисления врача за период не загружены':ks.length>1?ks.map(k=>PAY_PART[k]||k).join(' + '):esc(PAY_PART[ks[0]]||''))+'</small></span></div>'
      +'<div class="two"><span>начислено <b>'+money(Number(x.accrued))+'</b></span><span>выплачено <b>'+money(Number(x.paid))+'</b></span></div></div>'
      +'<div class="topay'+tcls+'"><span>'+tlab+'</span><b>'+money(tp)+'</b></div></div>'
      +(x.closed?'<div class="srow sub"><span>✓ Рассчитан, разница</span><b>'+sgn(Number(x.diff||0))+'</b></div>':'')
      +(Number(x.adv_debt)?'<div class="srow sub"><span>долг по авансу</span><b style="color:var(--red,#c0392b)">'+money(Number(x.adv_debt))+'</b></div>':'')
      +(op?ks.map(k=>'<div class="srow sub"><span>· '+esc(PAY_PART[k]||k)+'</span><b>'+money(Number(x.parts[k]))+'</b></div>').join(''):(ks.length>1?'<small style="color:var(--mute)">нажмите на имя, чтобы раскрыть состав</small>':''))
      +'<div class="chips" style="margin-top:8px">'+(canClose&&!x.closed&&!x._doctorMissing?'<button class="btn small" data-act="payclose1" data-id="'+x.id+'">Рассчитан</button>':'')
      +'<button class="btn small sec" data-act="paycard" data-id="'+x.id+'">История и выплаты</button></div></div>';
  });
  const nsel=Object.keys(sel).filter(k=>sel[k]).length;
  if(canClose&&nsel)h+='<div style="position:sticky;bottom:8px"><button class="btn" data-act="payclosesel">Рассчитать выбранных ('+nsel+')</button></div>';
  if(pt!=='all')h+='<div class="srow big"><span>Итого по группе</span><b>'+money(shown.reduce((q,x)=>q+Number(x.accrued),0))+'</b></div>';
  h+='</div><div class="card">';
  const al=(r.adj||[]).filter(i=>!i.is_cancel);
  if(r.multi)h+='<p class="hint">Доплаты и вычеты вносятся и видны по одному периоду.</p>';else if(!al.length)h+='<p class="hint">Доплат и вычетов за этот период нет.</p>';
  al.forEach(i=>{h+='<div class="person"'+(i.cancelled?' style="opacity:.55"':'')+'><div class="srow"><span><b'+(i.cancelled?' style="text-decoration:line-through"':'')+'>'+esc(i.name)+'</b><br><small>'+esc(SAL_KIND[i.kind]||i.kind)+' · '+ruDate(i.date)+(i.comment?' · '+esc(i.comment):'')+'</small></span><b>'+sgn(Number(i.amount))+'</b></div>'+(i.cancelled?'<small>отменено</small>':'<button class="btn sec small" style="margin-top:6px" data-act="salcancel" data-id="'+i.id+'">Отменить</button>')+'</div>'});
  h+='</div><div class="card"><button class="btn sec small" data-act="paycopy">Скопировать ведомость</button><button class="btn sec small" data-act="payxlsx" style="margin-left:8px">Скачать ведомость (Excel)</button></div>';
  return h;
}

/* ====== Люди (1.52): всё о человеке за период; сумма та же, что в «Зарплате» (ev_payroll_statement) ====== */
const PPL_PART={admin:'Администратор: смены и аптека',assistant:'Ассистент',callcenter:'Колл-центр',doctor:'Проценты Vetmanager',fixed:'Оклад',surcharge:'Доплата за продажи (Vetmanager)',extra:'Доплаты и вычеты',outsource:'Аутсорс: описания снимков'};
const PPL_ORDER=['admin','assistant','callcenter','doctor','outsource','fixed','surcharge','extra'];
const PPL_GRP=[['doctor','Врачи'],['admin','Админы'],['assistant','Ассистенты'],['callcenter','Колл-центр'],['outsource','Аутсорс']];
/* Люди - состав команды за период, включая сотрудников до первого начисления.
   Дополняем только справочник; финансовые rows и итоги не меняются. */
const PPL_ROLE_PART={doctor:'doctor',admin:'admin',assistant_clinical:'assistant',assistant_tech:'assistant',callcenter:'callcenter'};
const PPL_ROLE_NAME={doctor:'Врач',courier:'Курьер',admin:'Администратор',assistant_clinical:'Клинический ассистент',assistant_tech:'Технический ассистент',callcenter:'Колл-центр'};
function pplRows(r){
  const byId=new Map((r.rows||[]).map(x=>[String(x.id),{...x}]));
  (r.people||[]).forEach(p=>{
    const key=String(p.id),x=byId.get(key);
    if(x){x.roster_roles=[...new Set([...(x.roster_roles||[]),p.role])].sort();x.roster_role=x.roster_roles[0];return}
    byId.set(key,{id:p.id,name:p.name,roster_role:p.role,roster_roles:[p.role],roster_only:true,parts:{},accrued:0,paid:0,to_pay:0});
  });
  return [...byId.values()].sort((a,b)=>String(a.name).localeCompare(String(b.name),'ru'));
}
/* 2.0 (свод §13): человек стоит в ОДНОЙ группе — по основной роли. Порядок и исключения — настройка config.js (primaryRoleOrder, primaryRoleByPerson). */
function pplMainGroup(x){
  const cfg=window.EVROVET_UI2_CONFIG||{},over=(cfg.primaryRoleByPerson||{})[String(x.id)];
  if(over)return PPL_ROLE_PART[over]||over;
  const groups=[...new Set((x.roster_roles||[x.roster_role]).map(r=>PPL_ROLE_PART[r]).filter(Boolean))];
  const order=cfg.primaryRoleOrder||['callcenter','admin','doctor','assistant','outsource'];
  for(const g of order)if(groups.includes(g))return g;
  const pr=x.parts||{};let best=null,bv=0;['admin','assistant','callcenter','doctor','outsource'].forEach(g=>{const v=Math.abs(Number(pr[g]||0));if(v>bv){bv=v;best=g}});
  return best||groups[0]||null;
}
const pplHasGroup=(x,g)=>pplMainGroup(x)===g;
async function loadExtras(from,to){
  const key=from+'|'+to;S.pplExKey=key;S.pplEx=null;
  try{const r=await rpc('ev_payroll_extras',{p_token:S.token,p_from:from,p_to:to},10000);
    if(S.pplExKey!==key)return;
    S.pplEx=(r&&r.ok)?(r.items||[]):[];
  }catch(e){if(S.pplExKey!==key)return;S.pplEx=[]}
  if(S.view==='pay'&&S.pplMode)paint();
}
/* 2.0, п.14: полное «Фамилия Имя Отчество» руководителю — из графика (там оно уже есть); график подгружаем тихо */
function schFullByShort(name){const s=S.sch;if(!s)return '';const all=Object.values(s.data||{}).flat();const k=String(name||'').trim();const r=all.find(z=>String(z.name||'').trim()===k&&z.full);return r?r.full:''}
function schWarmFull(){const s=schEnsure();const m=omskToday().slice(0,7);if(!s.data[m]&&!s.load&&!s.err)loadSched(m).then(()=>{if(S.view==='pay')paint()})}
function pplCard(x){
  schWarmFull();
  const r=S.pay,N=v=>Number(v||0),parts=x.parts||{};
  const ex=(S.pplEx||[]).filter(i=>String(i.person)===String(x.id)),exSum=ex.reduce((q,i)=>q+N(i.amount),0);
  let h='<div class="card"><button class="btn sec small" data-act="pplback" style="margin:0 0 10px">← Люди</button><h2>'+esc(x.name)+(S.person&&String(x.id)===String(S.person.id)?' <span class="chip on" style="padding:1px 8px;font-size:12px">это вы</span>':'')+'</h2>'+(schFullByShort(x.name)?'<p class="hint" style="margin:2px 0 0;font-weight:700">'+esc(schFullByShort(x.name))+'</p>':'')+'<p class="hint" style="margin:0">'+ruDate(r.from)+' — '+ruDate(r.to)+(r.provisional?' · предварительно':'')+'</p></div>';
  if(x.roster_only)return h+'<div class="card"><h3>'+esc(PPL_ROLE_NAME[x.roster_role]||'Сотрудник')+'</h3><p>Начислений и выплат за выбранный период пока нет.</p><p class="hint">'+(PPL_ROLE_PART[x.roster_role]==='assistant'?'Смены и фиксации вносит администратор в отчёт филиала. После сохранения отчёта они попадут в расчёт.':'Начисления появятся после внесения рабочих данных за период.')+'</p></div>';
  h+='<div class="card"><div class="chips"><button class="btn small" data-act="pplsalk" data-k="manual" data-id="'+x.id+'">+ Доплата</button><button class="btn small sec" data-act="pplsalk" data-k="other" data-id="'+x.id+'">− Вычет</button>'+(r.multi?'':'<button class="btn small sec" data-act="payaddform" data-id="'+x.id+'">Выплатить</button>')+'</div></div>';
  h+='<div class="card pay"><div class="srow big"><span>Начислено</span><b>'+money(N(x.accrued))+'</b></div>'
    +'<div class="srow"><span>− Выплачено</span><span>'+money(N(x.paid))+'</span></div>'
    +(x.closed
      ?(Math.abs(N(x.to_pay))>=0.005?'<div class="srow sub"><span>✓ Выдано. Разница '+sgn(N(x.to_pay))+' перенесена в '+esc(nextPerLabel(r.to))+'</span><b></b></div>':'<div class="srow sub"><span>✓ Выдано полностью</span><b></b></div>')
      :'<div class="srow big"><span>= '+(x.over_paid?'Переплата (проверить)':'Остаток к выплате')+'</span><b'+(x.over_paid?' style="color:var(--bad)"':'')+'>'+money(N(x.to_pay))+'</b></div>')
    +(N(x.adv_debt)?'<div class="srow sub"><span>долг по авансу</span><b style="color:var(--bad)">'+money(N(x.adv_debt))+'</b></div>':'')+'</div>';
  h+='<div class="card"><h3 style="margin-top:2px">Почему столько</h3>';
  const why=pplWhyRows(x);
  if(why){h+=why}else PPL_ORDER.filter(k=>N(parts[k])).forEach(k=>{
    if(k==='extra'&&ex.length){
      ex.forEach(i=>{h+='<div class="srow"><span>Постоянная доплата<br><small style="color:var(--mute)">'+esc(i.label||'')+' · '+ruDate(i.date)+'</small></span><b>'+money(N(i.amount))+'</b></div>'});
      const rest=Math.round((N(parts.extra)-exSum)*100)/100;
      if(Math.abs(rest)>=0.5)h+='<div class="srow"><span>Разовые доплаты и вычеты</span><b>'+sgn(rest)+'</b></div>';
    }else h+='<div class="srow"><span>'+esc(PPL_PART[k]||k)+'</span><b>'+(k==='extra'?sgn(N(parts[k])):money(N(parts[k])))+'</b></div>';
  });
  if(!PPL_ORDER.some(k=>N(parts[k])))h+='<p class="hint">Начислений за период нет.</p>';
  if(S.pplEx===null&&N(parts.extra))h+='<p class="hint">Загружаю причины доплат…</p>';
  h+='<p class="hint" style="margin:6px 0 0">Те же суммы видит сам сотрудник в «Моих начислениях». Доплата за продажи подписана без чужого имени.</p></div>';
  const canClose=!r.provisional&&!r.multi;
  h+='<div class="card"><div class="chips">'+(canClose&&!x.closed?'<button class="btn small" data-act="payclose1" data-id="'+x.id+'">Рассчитан</button>':'')
    +'<button class="btn small sec" data-act="paycard" data-id="'+x.id+'">История и выплаты</button>'
    +'</div></div>';
  h+=vacPersonHtml(x.id);
  h+=pplShiftsHtml(x);
  h+='<details class="card"><summary><b>Доступ и PIN</b></summary><p class="hint">Новый PIN выдаётся в разделе загрузок и доступов. Старый перестанет работать.</p><button class="btn small sec" data-act="pplpin" data-id="'+x.id+'">Выдать новый PIN</button></details>';
  return h;
}
/* 2.0 (свод §13): «Смены по дням» в карточке — дата, филиал, роль, ставка, кто внёс (администратор, сдавший отчёт).
   Источник: ev_salary (дни админов/ассистентов/колл-центра — тот же расчёт) и ev_revenue (кто сдал отчёт дня, вал врачей). */
async function loadPplShifts(from,to){
  const key=from+'|'+to;if(S.pplShKey===key&&S.pplSh)return;S.pplShKey=key;S.pplSh=null;
  try{const [sal,rev]=await Promise.all([rpc('ev_salary',{p_token:S.token,p_from:from,p_to:to,p_test:false},12000),rpc('ev_revenue',{p_token:S.token,p_from:from,p_to:to},12000)]);
    if(S.pplShKey!==key)return;S.pplSh={sal:(sal&&sal.ok)?sal:null,rev:(rev&&rev.ok)?rev:null};
  }catch(e){if(S.pplShKey!==key)return;S.pplSh={sal:null,rev:null,err:true}}
  if(S.view==='pay'&&S.pplMode)paint();
}
function nextPerLabel(to){const a=addDays(to,1);return perLabel(a,perEnd(a)).replace(/\s+\d{4}$/,'')}
/* 2.0 §15 «Почему столько»: раскладка начисления по строкам из того же расчёта (ev_salary + ведомость) */
function pplWhyRows(x){
  const sal=S.pplSh&&S.pplSh.sal,r=S.pay,N=v=>Number(v||0),parts=x.parts||{},id=String(x.id);if(!sal||!r)return '';
  const row=(l,v,sub)=>'<div class="srow'+(sub?' sub':'')+'"><span>'+l+'</span><b>'+v+'</b></div>',rt=sal.rates||{};let h='';
  const adjRows=items=>(items||[]).filter(i=>!i.is_cancel&&!i.cancelled).map(i=>row(esc(/^Перенос разницы/i.test(i.comment||'')?'Перенос разницы':i.kind==='other'&&N(i.amount)>0?'Корректировка':(SAL_KIND[i.kind]||i.kind))+' · '+ruDate(i.date).slice(0,5)+(i.comment?'<br><small style="color:var(--mute)">'+esc(i.comment)+'</small>':''),sgn(N(i.amount)),true)).join('');
  const a=(sal.admins||[]).find(z=>String(z.id)===id);
  if(a){h+='<h4 style="margin:10px 0 4px">Администратор</h4>'+row('Смены '+a.shifts+' × '+money(N(a.shift_rate)),money(N(a.shift_pay)))
    +row(Math.round(N(a.pct)*10000)/100+' % с аптеки (вал '+money(N(a.pharm_val))+')',money(N(a.pct_pay)))+(N(a.late_pay)?row('Переработка '+a.late_hours+' ч',money(N(a.late_pay))):'')+adjRows(a.adj_items)}
  const s=(sal.assistants||[]).find(z=>String(z.id)===id);
  if(s){h+='<h4 style="margin:10px 0 4px">Ассистент</h4>'+row('Смены '+s.shifts,money(N(s.shift_pay)))
    +((N(s.fix_normal)||N(s.fix_xray))?row('Фиксации: обычные '+N(s.fix_normal)+' × '+money(N(rt.fix_normal))+', рентген '+N(s.fix_xray)+' × '+money(N(rt.fix_xray)),money(N(s.fix_pay))):'')+adjRows(s.adj_items)}
  const c=(sal.callcenter||[]).find(z=>String(z.id)===id);
  if(c){h+='<h4 style="margin:10px 0 4px">Колл-центр</h4>'+row('Смены '+c.shifts+' × '+money(N(c.shift_rate)),money(N(c.shift_pay)))+row('Доля фонда от вала клиник',money(N(c.pct_pay)))+adjRows(c.adj_items)}
  if(N(parts.doctor))h+=row('Проценты Vetmanager',money(N(parts.doctor)));
  if(N(parts.surcharge))h+=row('Доплата за продажи (Vetmanager)',money(N(parts.surcharge)));
  if(N(parts.fixed))h+=row('Оклад',money(N(parts.fixed)));
  if(N(parts.outsource))h+=row('Аутсорс: описания снимков',money(N(parts.outsource)));
  if(N(parts.extra)){const ex=(sal.extra||[]).find(z=>String(z.id)===id);const rec=(S.pplEx||[]).filter(i=>String(i.person)===id);
    h+='<h4 style="margin:10px 0 4px">Доплаты и вычеты</h4>'+rec.map(i=>row('Постоянная доплата · '+esc(i.label||''),money(N(i.amount)),true)).join('')+(ex?adjRows(ex.adj_items):'')+row('Итого доплаты и вычеты',sgn(N(parts.extra)))}
  if(!h)return '';
  return h+'<div class="srow big"><span>Итого начислено</span><b>'+money(N(x.accrued))+'</b></div>';
}
async function payXlsx(){
  const r=S.pay;if(!r||!r.rows){toast('Ведомость ещё загружается');return}
  try{await muLoadX()}catch(e){toast('Не загрузился модуль Excel',5000);return}
  const N=v=>Math.round(Number(v||0)*100)/100;
  const data=pplRows(r).filter(x=>!x.roster_only).map(x=>({'Сотрудник':x.name,'Группа':{admin:'Администраторы',doctor:'Врачи',assistant:'Ассистенты',callcenter:'Колл-центр',outsource:'Аутсорс'}[pplMainGroup(x)]||'','Начислено':N(x.accrued),'Выплачено':N(x.paid),'Остаток к выплате':N(x.to_pay),'Выдано':x.closed?'да':'нет'}));
  const ws=XLSX.utils.json_to_sheet(data),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Ведомость');
  XLSX.writeFile(wb,'Ведомость_'+r.from+'_'+r.to+'.xlsx');
}
function pplShiftsHtml(x){
  const r=S.pay;if(!r)return '';
  if(!S.pplSh||S.pplShKey!==r.from+'|'+r.to){loadPplShifts(r.from,r.to);return '<div class="card"><h3 style="margin-top:2px">Смены по дням</h3><p class="hint">Загружаю…</p></div>'}
  const sal=S.pplSh.sal,rev=S.pplSh.rev,id=String(x.id),rows=[];
  const who=(b,d)=>{const q=((rev&&rev.reports)||[]).find(z=>String(z.branch)===String(b)&&String(z.date)===String(d));return q?q.by:''};
  const rate=(sal&&sal.rates)||{};
  ((sal&&sal.admins)||[]).filter(a=>String(a.id)===id).forEach(a=>(a.days||[]).forEach(d=>rows.push({date:d.date,branch:d.branch,role:'Администратор',rate:a.shift_rate,by:who(d.branch,d.date)})));
  ((sal&&sal.assistants)||[]).filter(a=>String(a.id)===id).forEach(a=>(a.days||[]).forEach(d=>rows.push({date:d.date,branch:d.branch,role:d.role==='assistant_tech'?'Техн. ассистент':'Клин. ассистент',rate:d.rate,by:who(d.branch,d.date),fix:(Number(d.fix_normal)||0)+(Number(d.fix_xray)||0)})));
  ((sal&&sal.callcenter)||[]).filter(a=>String(a.id)===id).forEach(a=>(a.days||[]).forEach(d=>rows.push({date:d.date,branch:'',role:'Колл-центр',rate:d.pay,by:'отметка в смене'})));
  ((rev&&rev.reports)||[]).forEach(q=>(q.doctors||[]).forEach(dd=>{if(String(dd.name||'').trim()===String(x.name||'').trim())rows.push({date:q.date,branch:q.branch,role:'Врач',rate:null,by:q.by,val:dd.val})}));
  rows.sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.branch).localeCompare(String(b.branch)));
  let h='<div class="card"><h3 style="margin-top:2px">Смены по дням</h3>';
  if(!sal&&!rev)return h+'<p class="hint">Не удалось загрузить смены. Суммы выше от этого не меняются.</p></div>';
  if(!rows.length)return h+'<p class="hint">За период смен в отчётах нет.</p></div>';
  h+=rows.map(z=>'<div class="srow"><span><b>'+ruDate(z.date).slice(0,5)+'</b> · '+esc(z.branch?brTitle(z.branch):'—')+' · '+esc(z.role)
    +'<br><small style="color:var(--mute)">'+(z.by?'внёс: '+esc(z.by):'')+(z.fix?' · фиксаций '+z.fix:'')+(z.val!=null?' · вал '+money(Number(z.val)):'')+'</small></span><b>'+(z.rate!=null?money(Number(z.rate)):'')+'</b></div>').join('');
  return h+'<p class="hint" style="margin:6px 0 0">Смен: '+rows.length+'. Ставка — за смену; у врача начисление считает Vetmanager.</p></div>';
}
/* 2.0 §15: переключатель «Люди | Выплата» в шапке */
function pplSwitchHtml(cur){return '<div class="chips" style="margin:8px 0"><button class="chip'+(cur==='ppl'?' on':'')+'" data-act="'+(cur==='ppl'?'noop':'pplpayout')+'">Люди</button><button class="chip'+(cur==='pay'?' on':'')+'" data-act="'+(cur==='pay'?'noop':'pplpayout')+'">Выплата</button></div>'}
function pplHtml(){
  if(S.pay&&S.pay.from)loadVacation(S.pay.from,S.pay.to);
  const today=omskToday(),cs=perStart(today),pe=addDays(cs,-1),ps=perStart(pe),r=S.pay;
  const f=S.payFrom||(ps>=PAY_START?ps:cs),t=S.payTo||(ps>=PAY_START?pe:perEnd(cs));
  const chip=(l,a,b)=>'<button class="chip'+((f===a&&t===b)?' on':'')+'" data-act="payper" data-from="'+a+'" data-to="'+b+'">'+l+'</button>';
  const chips=payPeriods(today).slice().reverse().slice(0,4).map((q,i)=>chip(i===0?'Этот период':i===1?'Прошлый период':ruDate(q[0]).slice(0,5)+' — '+ruDate(q[1]).slice(0,5),q[0],q[1])).join('');
  if(S.payErr)return '<div class="card"><h2>Люди</h2><p>'+esc(S.payErr)+'</p><button class="btn sec small" data-act="payper" data-from="'+f+'" data-to="'+t+'">Повторить</button></div>';
  const x0=r&&S.pplId!=null?pplRows(r).find(x=>String(x.id)===String(S.pplId)):null;
  if(x0)return pplCard(x0);
  let h='<div class="card"><div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><h2 style="margin:0">Люди</h2><button class="btn small" data-act="saladd" aria-label="Доплата, вычет или такси" style="min-width:48px">+</button></div>'+pplSwitchHtml('ppl')+'<div class="chips">'+chips+'</div><p class="hint" style="margin:6px 0 0">'+ruDate(f)+' — '+ruDate(t)+'</p></div>';
  if(!r)return h+'<div class="card"><p class="hint">Загружаю…</p></div>';
  h+=vacPeriodLine(r)?'<div class="card">'+vacPeriodLine(r)+'</div>':'';
  const rows=pplRows(r),has=g=>rows.some(x=>pplHasGroup(x,g));
  let pt=S.pplTab||'all';if(pt!=='all'&&!has(pt))pt='all';
  const q=(S.paySearch||'').trim().toLowerCase();
  const shown=rows.filter(x=>(pt==='all'||pplHasGroup(x,pt))&&(!q||String(x.name).toLowerCase().includes(q)));
  h+='<div class="card"><label class="f" style="margin:0 0 6px"><input id="paysr" class="srch" placeholder="Фамилия" autocomplete="off" value="'+esc(S.paySearch||'')+'"></label><div class="wktabs"><button class="chip'+(pt==='all'?' on':'')+'" data-act="pplgrp" data-k="all"><span>Все</span> <b>'+rows.length+'</b></button>'
    +PPL_GRP.filter(g=>has(g[0])).map(g=>'<button class="chip'+(pt===g[0]?' on':'')+'" data-act="pplgrp" data-k="'+g[0]+'"><span>'+g[1]+'</span></button>').join('')+'</div>';
  shown.forEach(x=>{
    const pr=x.parts||{},N=v=>Number(v||0),dop=N(pr.surcharge)+N(pr.extra);
    const kinds=PPL_ORDER.filter(k=>N(pr[k])&&k!=='surcharge'&&k!=='extra').map(k=>({admin:'админ',assistant:'ассистент',callcenter:'колл-центр',doctor:'врач',outsource:'аутсорс',fixed:'оклад'}[k]));
    h+='<button class="srow grow" data-act="pplopen" data-id="'+x.id+'"><span><b>'+esc(x.name)+'</b>'+(S.person&&String(x.id)===String(S.person.id)?' <small>· это вы</small>':'')+'<br><small style="color:var(--mute)">'+(kinds.join(' + ')||esc(PPL_ROLE_NAME[x.roster_role]||''))+(dop?(kinds.length?' · ':'')+'доплаты '+money(dop):'')+(x.closed?' · ✓ рассчитан':'')+'</small></span><b>'+(x.roster_only?'Пока без начислений':money(N(x.accrued)))+' ›</b></button>';
  });
  if(!shown.length)h+='<p class="hint">Никого не найдено.</p>';
  return h+'</div><p class="hint">Состав команды показан за выбранный период, включая сотрудников без начислений. Суммы совпадают с «Зарплатой»: расчёт один.</p>';
}
const PAY_ERR={forbidden:'Нет доступа',session:'Сессия закончилась, войдите заново',input:'Проверьте данные',closed:'Сотрудник уже рассчитан за этот период: сначала снимите отметку',period_open:'Период ещё не закончился: рассчитать можно после его конца',already:'Уже рассчитан',not_in_statement:'Нет в ведомости',over_debt:'Сумма больше долга',not_found:'Не найдено'};
const payRow=id=>((S.pay&&S.pay.rows)||[]).find(z=>String(z.id)===String(id));
function payCloseForm(ids){
  ids=ids.filter(i=>payRow(i));if(!ids.length){toast('Никто не выбран');return}
  S.payUid=uid();
  const rows=ids.map(i=>{const x=payRow(i),def=Math.max(0,Math.round(Number(x.to_pay)));
    return '<div class="person" data-pid="'+x.id+'"><div class="srow"><span><b>'+esc(x.name)+'</b><br><small style="color:var(--mute)">начислено '+money(Number(x.accrued))+', выплачено '+money(Number(x.paid))+'</small></span><b>'+money(Number(x.to_pay))+'</b></div>'
      +'<label class="f"><span>Выплачиваю сейчас, ₽</span><input class="pcash" data-pid="'+x.id+'" data-to="'+Number(x.to_pay)+'" data-paid="'+Number(x.paid)+'" data-acc="'+Number(x.accrued)+'" inputmode="decimal" value="'+def+'"></label>'
      +'<div class="srow sub"><span>разница по периоду</span><b class="pdiff">'+sgn(Math.round((Number(x.paid)+def-Number(x.accrued))*100)/100)+'</b></div></div>'}).join('');
  overlay('<h2>Рассчитан за период</h2><p class="hint">'+ruDate(S.payFrom)+' — '+ruDate(S.payTo)+'. Укажите сумму текущей выплаты (0, если уже всё выплачено). Разница с начисленным запишется автоматически; сотрудник её не видит.</p>'+rows
    +'<button class="btn" data-act="payclosego" style="margin-top:8px">Отметить: рассчитан</button><button class="btn sec" style="margin-top:8px" data-act="paycardback">Назад</button>');
  document.querySelectorAll('.pcash').forEach(el=>el.addEventListener('input',()=>{const v=num(el.value)||0,d=Math.round((Number(el.dataset.paid)+v-Number(el.dataset.acc))*100)/100;const o=el.closest('.person').querySelector('.pdiff');if(o)o.textContent=sgn(d)}));
}
async function doPayClose(){
  if(S.payBusy)return;
  const items=[];let bad=false;
  document.querySelectorAll('.pcash').forEach(el=>{const v=el.value.trim()===''?0:num(el.value);if(v==null||isNaN(v)||v<0){bad=true;return}items.push({person_id:Number(el.dataset.pid),cash:v})});
  if(bad||!items.length){toast('Проверьте суммы');return}
  S.payBusy=true;
  try{
    const r=await rpc('ev_payroll_close',{p_token:S.token,p_from:S.payFrom,p_to:S.payTo,p_items:items,p_uid:S.payUid},20000);
    if(!r||!r.ok){toast(PAY_ERR[r&&r.error]||'Не удалось: '+(r&&r.error),7000);return}
    S.paySel={};toast('Рассчитано: '+items.length);closeOv();await showPay(S.payFrom,S.payTo);
  }catch(e){toast(e.net?'Нет связи, ничего не сохранено. Нажмите ещё раз':'Ошибка сервера',6000)}
  finally{S.payBusy=false}
}
async function payCard(id){
  const x=payRow(id)||{name:''};
  overlay('<h2>'+esc(x.name)+'</h2><p class="hint">Загружаю…</p>');
  try{
    const r=await rpc('ev_payroll_person',{p_token:S.token,p_person:Number(id)},12000);
    if(!r||!r.ok){overlay('<h2>'+esc(x.name)+'</h2><p>'+esc(PAY_ERR[r&&r.error]||'Не удалось загрузить')+'</p><button class="btn sec" data-act="paycardback">Закрыть</button>');return}
    const MT={card:'Выплата',cash:'Выплата',other:'Прочая выплата',advance:'Зачтённый аванс'};
    let h='<h2>'+esc(x.name)+'</h2><div class="srow big"><span>Накопленная разница (с 16.10)</span><b>'+sgn(Number(r.diff_total))+'</b></div>';
    h+='<h3>Периоды</h3>'+((r.closures||[]).length?(r.closures).map(c=>'<div class="srow"><span>'+ruDate(c.from)+' — '+ruDate(c.to)+'<br><small style="color:var(--mute)">начислено '+money(Number(c.accrued))+', выплачено '+money(Number(c.paid_total))+'</small></span><b>'+sgn(Number(c.diff))+'</b></div>').join(''):'<p class="hint">Рассчитанных периодов нет.</p>');
    if(x.closed)h+='<button class="btn sec small" data-act="payunclose" data-id="'+id+'">Снять отметку «Рассчитан» за текущий период</button>';
    h+='<h3>Выплаты</h3>'+((r.payments||[]).length?(r.payments).map(p=>'<div class="srow"'+(p.cancelled?' style="opacity:.5;text-decoration:line-through"':'')+'><span>'+ruDate(p.date)+' · '+(MT[p.method]||p.method)+'<br><small style="color:var(--mute)">за '+ruDate(p.from)+' — '+ruDate(p.to)+(p.note?' · '+esc(p.note):'')+'</small></span><b>'+money(Number(p.amount))+(p.source==='manual'&&p.method!=='advance'&&!p.cancelled?' <button class="chip" data-act="paycancel" data-id="'+p.id+'" data-pid="'+id+'">✕</button>':'')+'</b></div>').join(''):'<p class="hint">Выплат нет.</p>');
    h+='<h3>Авансы и долги</h3>'+((r.advances||[]).length?(r.advances).map(a=>'<div class="srow"><span>'+ruDate(a.given_on)+(a.comment?' · '+esc(a.comment):'')+'<br><small style="color:var(--mute)">выдано '+money(Number(a.amount))+'</small></span><b>'+(Number(a.debt)>0.005?'долг '+money(Number(a.debt))+' <button class="chip" data-act="advsettle" data-adv="'+a.id+'" data-debt="'+Number(a.debt)+'" data-id="'+id+'">удержать</button>':'погашен')+'</b></div>').join(''):'<p class="hint">Авансов нет.</p>');
    h+='<div class="chips" style="margin-top:8px"><button class="btn small" data-act="payaddform" data-id="'+id+'">+ Внести выплату</button><button class="btn small sec" data-act="advform" data-id="'+id+'">+ Выдал в долг / аванс</button></div><button class="btn sec" style="margin-top:8px" data-act="paycardback">Закрыть</button>';
    if(S.pay&&S.pay.multi)h=h.replace(/<button[^>]*data-act="(payaddform|advform|payunclose|advsettle|paycancel)"[\s\S]*?<\/button>/g,'');
    overlay(h);
  }catch(e){overlay('<h2>'+esc(x.name)+'</h2><p>'+(e.net?'Нет связи.':'Ошибка сервера.')+'</p><button class="btn sec" data-act="paycardback">Закрыть</button>')}
}
function payAddForm(id){
  const x=payRow(id)||{name:''},td=omskToday(),dt=td<S.payFrom?S.payFrom:td;S.payUid=uid();
  overlay('<h2>Внести выплату</h2><p class="hint">'+esc(x.name)+', период '+ruDate(S.payFrom)+' — '+ruDate(S.payTo)+'. Выплаты из реестра банка загружаются отдельно. Здесь — прочие выплаты.</p>'
    +'<div class="f"><span>Вид записи</span><div class="chips"><button type="button" class="chip on" data-act="paymeth" data-k="cash">Обычная выплата</button><button type="button" class="chip" data-act="paymeth" data-k="other">Другая выплата</button></div><input type="hidden" id="pam" value="cash"></div>'
    +'<label class="f"><span>Сумма, ₽</span><input id="paa" inputmode="decimal" value="'+Math.max(0,Math.round(Number(x.to_pay||0)))+'"></label>'
    +'<label class="f"><span>Дата выдачи</span><input id="pad" type="date" value="'+esc(dt)+'"></label>'
    +'<label class="f"><span>Комментарий</span><input id="pan" maxlength="300"></label>'
    +'<button class="btn" data-act="payaddgo" data-id="'+id+'" style="margin-top:8px">Внести</button><button class="btn sec" style="margin-top:8px" data-act="paycard" data-id="'+id+'">Назад</button>');
}
async function doPayAdd(id){
  if(S.payBusy)return;
  const v=num(($('#paa')||{}).value),dt=($('#pad')||{}).value,m=($('#pam')||{}).value||'cash',n=(($('#pan')||{}).value||'').trim();
  if(v==null||isNaN(v)||v<=0){toast('Введите сумму больше нуля');return}if(!dt){toast('Укажите дату');return}
  S.payBusy=true;
  try{
    const r=await rpc('ev_payroll_pay_add',{p_token:S.token,p_person:Number(id),p_from:S.payFrom,p_to:S.payTo,p_amount:v,p_method:m,p_date:dt,p_note:n||null,p_uid:S.payUid},10000);
    if(!r||!r.ok){toast(PAY_ERR[r&&r.error]||'Не удалось: '+(r&&r.error),7000);return}
    toast('Выплата внесена');closeOv();await showPay(S.payFrom,S.payTo);
  }catch(e){toast(e.net?'Нет связи, ничего не сохранено':'Ошибка сервера',6000)}
  finally{S.payBusy=false}
}
function advForm(id){
  const x=payRow(id)||{name:''};S.payUid=uid();
  overlay('<h2>Выдал в долг / аванс</h2><p class="hint">'+esc(x.name)+'. Сумма удерживается из зарплаты за период '+ruDate(S.payFrom)+' — '+ruDate(S.payTo)+' (остаток к выплате уменьшится). Если зарплаты не хватит или удерживаете частями, поставьте меньшую сумму удержания: остаток останется долгом и будет виден.</p>'
    +'<label class="f"><span>Сколько выдали, ₽</span><input id="ava" inputmode="decimal"></label>'
    +'<label class="f"><span>Удержать в этом периоде, ₽ (пусто = всю сумму)</span><input id="avd" inputmode="decimal"></label>'
    +'<label class="f"><span>Дата выдачи</span><input id="avt" type="date" value="'+esc(omskToday())+'"></label>'
    +'<label class="f"><span>Комментарий</span><input id="avc" maxlength="300"></label>'
    +'<button class="btn" data-act="advgo" data-id="'+id+'" style="margin-top:8px">Записать</button><button class="btn sec" style="margin-top:8px" data-act="paycard" data-id="'+id+'">Назад</button>');
}
async function doAdvAdd(id){
  if(S.payBusy)return;
  const v=num(($('#ava')||{}).value),dr=(($('#avd')||{}).value||'').trim(),dd=dr===''?v:num(dr),dt=($('#avt')||{}).value,c=(($('#avc')||{}).value||'').trim();
  if(v==null||isNaN(v)||v<1){toast('Введите сумму');return}if(dd==null||isNaN(dd)||dd<0||dd>v){toast('Удержание от 0 до суммы аванса');return}if(!dt){toast('Укажите дату');return}
  S.payBusy=true;
  try{
    const r=await rpc('ev_payroll_advance_add',{p_token:S.token,p_person:Number(id),p_given:dt,p_amount:v,p_comment:c||null,p_from:S.payFrom,p_to:S.payTo,p_deduct:dd,p_uid:S.payUid},10000);
    if(!r||!r.ok){toast(PAY_ERR[r&&r.error]||'Не удалось: '+(r&&r.error),7000);return}
    toast('Аванс записан');closeOv();await showPay(S.payFrom,S.payTo);
  }catch(e){toast(e.net?'Нет связи, ничего не сохранено':'Ошибка сервера',6000)}
  finally{S.payBusy=false}
}
async function doAdvSettle(adv,debt,pid){
  if(S.payBusy)return;
  const raw=prompt('Сколько удержать в периоде '+ruDate(S.payFrom)+' — '+ruDate(S.payTo)+'? Долг: '+Number(debt),String(Number(debt)));if(raw==null)return;
  const v=num(raw);if(v==null||isNaN(v)||v<=0){toast('Введите сумму');return}
  S.payBusy=true;
  try{
    const r=await rpc('ev_payroll_advance_settle',{p_token:S.token,p_adv:Number(adv),p_from:S.payFrom,p_to:S.payTo,p_amount:v,p_uid:uid()},10000);
    if(!r||!r.ok){toast(PAY_ERR[r&&r.error]||'Не удалось: '+(r&&r.error),7000);return}
    toast('Удержано');closeOv();await showPay(S.payFrom,S.payTo);
  }catch(e){toast(e.net?'Нет связи':'Ошибка сервера',6000)}
  finally{S.payBusy=false}
}
async function doPayCancel(id,pid){
  if(S.payBusy)return;if(!confirm('Отменить эту выплату? Она останется в списке отмеченной как отменённая.'))return;
  S.payBusy=true;
  try{
    const r=await rpc('ev_payroll_pay_cancel',{p_token:S.token,p_id:Number(id),p_note:null},10000);
    if(!r||!r.ok){toast(PAY_ERR[r&&r.error]||'Не удалось: '+(r&&r.error),7000);return}
    toast('Отменено');closeOv();await showPay(S.payFrom,S.payTo);
  }catch(e){toast(e.net?'Нет связи':'Ошибка сервера',6000)}
  finally{S.payBusy=false}
}
async function doPayUnclose(id){
  if(S.payBusy)return;if(!confirm('Снять отметку «Рассчитан»? Сотрудник перестанет видеть эту выплату, пока вы не отметите заново.'))return;
  S.payBusy=true;
  try{
    const r=await rpc('ev_payroll_unclose',{p_token:S.token,p_person:Number(id),p_from:S.payFrom,p_to:S.payTo},10000);
    if(!r||!r.ok){toast(PAY_ERR[r&&r.error]||'Не удалось: '+(r&&r.error),7000);return}
    toast('Отметка снята');closeOv();await showPay(S.payFrom,S.payTo);
  }catch(e){toast(e.net?'Нет связи':'Ошибка сервера',6000)}
  finally{S.payBusy=false}
}
function payPrint(){
  const r=S.pay;if(!r)return;
  const rows=(r.rows||[]).filter(x=>Number(x.accrued)||Number(x.paid));
  const f2=v=>Number(v).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2});
  let n=0,tr=rows.map(x=>'<tr><td>'+(++n)+'</td><td>'+esc(x.name)+'</td><td class="r">'+f2(x.accrued)+'</td><td class="r">'+f2(x.paid)+'</td><td class="r"><b>'+f2(x.to_pay)+'</b></td><td class="r">'+(x.closed?'рассчитан':'')+'</td><td class="b">&#9744;</td><td class="s"></td></tr>').join('');
  const t=r.total||{};
  const doc='<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ведомость '+ruDate(r.from)+' — '+ruDate(r.to)+'</title><style>body{font:13px Arial,sans-serif;margin:16px;color:#000}h1{font-size:17px;margin:0 0 4px}table{border-collapse:collapse;width:100%;margin-top:10px}th,td{border:1px solid #444;padding:5px 6px}th{background:#eee;text-align:left}.r{text-align:right;white-space:nowrap}.b{text-align:center;font-size:20px;width:36px}.s{width:120px}.tot td{font-weight:bold;background:#f5f5f5}button{font-size:16px;padding:8px 16px;margin-bottom:10px}@media print{button{display:none}body{margin:8mm}}@page{size:A4 landscape;margin:8mm}</style></head><body><button onclick="window.print()">Печать</button><h1>Ведомость выплат зарплаты: '+ruDate(r.from)+' — '+ruDate(r.to)+(r.provisional?' (предварительно)':'')+'</h1><div>Сформирована '+ruDate(omskToday())+'. ЕВРОВЕТ. Конфиденциально.</div><table><thead><tr><th>№</th><th>Сотрудник</th><th>Начислено, ₽</th><th>Выплачено, ₽</th><th>Остаток к выплате, ₽</th><th>Статус</th><th>Выдано</th><th>Подпись</th></tr></thead><tbody>'+tr+'<tr class="tot"><td></td><td>ИТОГО</td><td class="r">'+f2(t.accrued)+'</td><td class="r">'+f2(t.paid)+'</td><td class="r">'+f2(t.to_pay)+'</td><td></td><td></td><td></td></tr></tbody></table></body></html>';
  try{const u=URL.createObjectURL(new Blob([doc],{type:'text/html;charset=utf-8'}));const w=window.open(u,'_blank');if(!w)toast('Разрешите всплывающие окна для печати',6000)}catch(e){toast('Не удалось открыть печать')}
}
/* «Мои выплаты» у сотрудника: только его рассчитанные периоды и авансы (ev_my_payouts по токену) */
async function loadPayouts(){
  try{
    const r=await rpc('ev_my_payouts',{p_token:S.token},12000);
    if(!r||!r.ok){S.payouts=null;return}
    S.payouts=r;if(S.view==='work')paint();
    if(Number(r.new)>0)rpc('ev_my_payouts_seen',{p_token:S.token},8000).catch(()=>{});
  }catch(e){}
}
function payoutsHtml(){
  const o=S.payouts;if(!o||!((o.periods||[]).length||(o.advances||[]).length))return '';
  let h='<div class="card"><h3 style="margin-top:2px">Мои выплаты</h3>';
  (o.periods||[]).slice(0,12).forEach(p=>{
    h+='<div class="srow big"><span><b>'+ruDate(p.from)+' — '+ruDate(p.to)+'</b>'+(p.is_new?' <span class="chip on" style="padding:1px 8px">новое</span>':'')+'<br><small style="color:var(--mute)">выплачено '+ruDate(String(p.issued_at).slice(0,10))+'</small></span><b>'+money(Number(p.paid_total))+'</b></div>'
      +(Number(p.advance)?'<div class="srow sub"><span>в том числе удержан аванс</span><b>'+money(Number(p.advance))+'</b></div>':'');
  });
  (o.advances||[]).forEach(a=>{
    h+='<div class="srow"><span>Выдано в счёт зарплаты, '+ruDate(a.given_on)+(a.comment?'<br><small style="color:var(--mute)">'+esc(a.comment)+'</small>':'')+'</span><b>'+money(Number(a.amount))+'</b></div>'
      +(Number(a.debt)>0.005?'<div class="srow sub"><span>осталось удержать</span><b>'+money(Number(a.debt))+'</b></div>':'');
  });
  return h+'</div>';
}

function copyPayroll(){
  const r=S.pay;if(!r)return;
  const L=['Ведомость '+ruDate(r.from)+' — '+ruDate(r.to)+(r.provisional?' (предварительно)':''),'Сотрудник; начислено; выплачено; остаток к выплате'];
  (r.rows||[]).forEach(x=>L.push(x.name+'; '+Number(x.accrued)+'; '+Number(x.paid)+'; '+Number(x.to_pay)));
  L.push('ИТОГО; '+Number(r.total.accrued)+'; '+Number(r.total.paid)+'; '+Number(r.total.to_pay));
  const txt=L.join('\n');
  try{navigator.clipboard.writeText(txt).then(()=>toast('Скопировано'),()=>toast('Не удалось скопировать'))}catch(e){toast('Не удалось скопировать')}
}
/* ====== Руководитель: статус отчётов «Сегодня» (ev_day_status, только чтение) ====== */
async function loadDayStatus(){
  const dt=omskToday();
  if(S.day&&S.day.date===dt&&Date.now()-S.day.at<60000)return;
  try{const r=await rpc('ev_day_status',{p_token:S.token,p_date:dt},6000);
    if(r&&r.ok){S.day={date:dt,at:Date.now(),list:r.branches||[]};if(S.view==='branch')paint()}}catch(e){}
}
function dayStatusHtml(){
  const d=S.day;if(!d||d.date!==omskToday())return '';
  return '<div class="card"><h3 style="margin-top:2px">Сегодня, '+ruDate(d.date)+'</h3>'+d.list.map(b=>'<div class="srow"><span>'+esc(brTitle(b.branch))+'</span><b style="color:var(--'+(b.submitted?(Number(b.open_flags)>0?'warn':'ok'):'bad')+')">'+(b.submitted?'сдан'+(Number(b.open_flags)>0?' · расхождений: '+b.open_flags:''):'отчёта нет')+'</b></div>').join('')+'<p class="hint" style="margin:4px 0 0">Днём отчёта ещё может не быть: админы сдают вечером.</p></div>';
}
/* ====== Выручка и зарплата за день по филиалу: только руководитель, из последних версий отчётов ====== */
function dayPays(r){
  const rt=r.rates||{},o=[],hr=Number(rt.admin_shift)/12;
  (r.admins||[]).forEach(a=>(a.days||[]).forEach(d=>{const lh=Number(d.late_hours)||0;o.push({b:d.branch,date:d.date,id:a.id,name:a.name,kind:'adm',late:lh,pay:Number(rt.admin_shift)+Number(d.pharm||0)*Number(rt.admin_pharmacy_pct)+lh*hr})}));
  (r.assistants||[]).forEach(a=>(a.days||[]).forEach(d=>{const fn=Number(d.fix_normal)||0,fx=Number(d.fix_xray)||0;o.push({b:d.branch,date:d.date,id:a.id,name:a.name,kind:'ast',fn:fn,fx:fx,pay:Number(d.rate||0)+fn*Number(rt.fix_normal)+fx*Number(rt.fix_xray)})}));
  return o;
}
function staffOf(sal,bid){
  if(!sal)return null;
  const map=new Map();
  dayPays(sal).filter(p=>p.b===bid).forEach(p=>{const k=p.kind+':'+p.id;let o=map.get(k);if(!o){o={kind:p.kind,name:p.name,pay:0,n:0,late:0,fn:0,fx:0};map.set(k,o)}o.pay+=p.pay;o.n++;o.late+=p.late||0;o.fn+=p.fn||0;o.fx+=p.fx||0});
  return [...map.values()].sort((a,b)=>(a.kind==='adm'?0:1)-(b.kind==='adm'?0:1)||a.name.localeCompare(b.name,'ru'));
}
function revAgg(reps){
  const a={n:reps.length,total:0,cash:0,cashless:0,pv:0,pc:0,pl:0,debt:0,repaid:0,dc:[],docs:new Map()};
  reps.forEach(r=>{a.total+=Number(r.total);a.cash+=Number(r.cash);a.cashless+=Number(r.cashless);a.pv+=Number(r.pharm_val);a.pc+=Number(r.pharm_cash);a.pl+=Number(r.pharm_cashless);a.debt+=Number(r.debt||0);a.repaid+=Number(r.repaid||0);if(r.debt_comment)a.dc.push(r.debt_comment);
    (r.doctors||[]).forEach(d=>a.docs.set(d.name,(a.docs.get(d.name)||0)+Number(d.val)))});
  return a;
}
async function showRevenue(from,to){
  const today=omskToday();
  /* 2.0: по умолчанию — последний день, где есть хоть один отчёт (утром это вчера, после сдачи всех — сегодня) */
  if(!from&&!S.revFrom&&isHead()){
    S.revFrom=S.revTo=today;if(!S.revBranch)S.revBranch='all';S.view='rev';S.rev=null;S.revLoad=true;paint();
    try{const r=await rpc('ev_revenue',{p_token:S.token,p_from:addDays(today,-10),p_to:today},12000);
      const ds=((r&&r.ok&&r.reports)||[]).map(x=>String(x.date)).sort();if(ds.length){from=to=ds[ds.length-1]}}catch(e){}
  }
  if(!from){from=S.revFrom||today;to=S.revTo||from}
  S.revFrom=from;S.revTo=to;if(!S.revBranch)S.revBranch='all';
  S.view='rev';S.rev=null;S.revSal=null;S.revErr=null;S.revLoad=true;paint();
  try{
    const [rv,sl]=await Promise.all([rpc('ev_revenue',{p_token:S.token,p_from:from,p_to:to},12000),rpc('ev_salary',{p_token:S.token,p_from:from,p_to:to,p_test:false},15000).catch(()=>null)]);
    if(S.revFrom!==from||S.revTo!==to)return;
    if(!rv||!rv.ok)S.revErr=SAL_ERR[rv&&rv.error]||'Не удалось загрузить';
    else{S.rev=rv;S.revSal=(sl&&sl.ok)?sl:null}
  }catch(e){if(S.revFrom!==from||S.revTo!==to)return;S.revErr=e.net?'Нет связи.':'Ошибка сервера.'}
  S.revLoad=false;if(S.view==='rev')paint();
  loadRevStatus();loadRevDoctors(from,to);
}
/* 2.0: «Врачи» за выбранный день по филиалам — из последней сверки Vetmanager (ev_vm_runs.metrics.doctors, функция ev_vm_doctors).
   Деньги не считает: только показывает. Нет данных — спокойная строка. Сумма врачей ≠ invoice_amount филиала — 🔴. */
async function loadRevDoctors(from,to){
  S.revDoc=null;if(!isHead()||from!==to)return;const key=from;S.revDocKey=key;
  try{const r=await rpc('ev_vm_doctors',{p_token:S.token,p_date:from},10000);if(S.revDocKey!==key)return;S.revDoc=(r&&r.ok)?r:{none:true}}
  catch(e){if(S.revDocKey!==key)return;S.revDoc={none:true}}
  if(S.view==='rev')paint();
}
function revDoctorsHtml(){
  if(!isHead()||S.revFrom!==S.revTo)return '';
  const d=S.revDoc,N=v=>Number(v||0);
  let h='<div class="card"><h2>Врачи · '+ruDate(S.revFrom)+'</h2>';
  if(!d)return h+'<p class="hint">Загружаю…</p></div>';
  const brs=(d.branches||[]).filter(b=>Array.isArray(b.doctors)&&b.doctors.length&&(S.revBranch==='all'||!S.revBranch||b.branch===S.revBranch));
  if(d.none||!brs.length)return h+'<p class="hint">Врачи появятся после вечерней сверки с Vetmanager.</p></div>';
  brs.forEach(b=>{
    const rows=b.doctors.map(x=>{const amt=N(x.amount??x.revenue??x.sum??x.invoice_amount),cnt=N(x.invoices??x.count??x.invoice_count);return{name:x.name||x.doctor||x.short_name||'—',amt,cnt,chk:N(x.check??x.avg_check)||(cnt?amt/cnt:0)}}).sort((a,c)=>c.amt-a.amt);
    const sum=Math.round(rows.reduce((q,x)=>q+x.amt,0)*100)/100,inv=b.invoice_amount==null?null:N(b.invoice_amount),bad=inv!=null&&Math.abs(sum-inv)>0.5;
    h+='<h3 style="margin:12px 0 4px">'+esc(brTitle(b.branch))+'</h3>'
      +rows.map(x=>'<div class="srow"><span>'+esc(x.name)+'<br><small style="color:var(--mute)">счетов '+x.cnt+' · чек '+money(Math.round(x.chk))+'</small></span><b>'+money(x.amt)+'</b></div>').join('')
      +(bad?'<div class="chk bad"><i>!</i><div><b>🔴 Врачи не сходятся с выручкой</b><br><small>врачи '+money(sum)+', счета Vetmanager '+money(inv)+'</small></div></div>'
           :'<div class="srow sub"><span>Итого врачи'+(inv!=null?' = счета Vetmanager':'')+'</span><b>'+money(sum)+'</b></div>');
  });
  return h+'<p class="hint" style="margin-top:8px">По данным сверки Vetmanager. Начисления врачей считает Vetmanager — здесь только выручка.</p></div>';
}
/* 2.0 §15: над выручкой одна строка статуса (бывший «Контроль»): 🟢 всё сходится / 🔴 требует внимания: N */
/* c30 (слово Михаила 19.11): сверка Vetmanager за дни старше 14 дней (граница ev_today()-14, как в ev_record_vm_run) уже невозможна — такие находки не красные и уходят в свёрнутый раздел «Старые, сверка невозможна» в Контроле */
const CTL_VM_CODES=['vm_not_checked','vm_partial'];
const ctlOldDate=d=>/^\d{4}-\d{2}-\d{2}$/.test(String(d||''))&&String(d)<addDays(omskToday(),-14);
const ctlOldFlag=f=>CTL_VM_CODES.includes(f&&f.code)&&ctlOldDate(f.date);
const ctlOldCov=x=>!!x&&x.status!=='complete'&&ctlOldDate(x.date);
async function loadRevStatus(){
  if(!isHead())return;
  try{const r=await rpc('ev_flags_pending',{p_token:S.token},20000);
    if(r&&r.ok){S.ctl=r.pending||[];S.ctlAccepted=r.accepted||[];S.ctlCoverage=r.coverage||[];const cv=S.ctlCoverage;
      S.revStatus={open:(S.ctl||[]).filter(f=>!f.blocked&&!['vm_not_checked','vm_partial'].includes(f.code)).length,incomplete:cv.filter(x=>!['complete','pending','missing'].includes(x.status)&&!ctlOldCov(x)).length}}
    else S.revStatus={err:true}}catch(e){S.revStatus={err:true}}
  S.revStatusAt=Date.now();if(S.view==='rev'||S.view==='branch')paint();
}
function revStatusHtml(){
  const s=S.revStatus;if(!isHead())return '';
  if(!s)return '<div class="glass ui2-today"><span class="pin">⌛</span><div>Проверяю отчёты и сверку…</div></div>';
  if(s.err)return '<button class="glass ui2-today calm" data-act="go" data-v="ctl"><span class="pin">○</span><div>Статус дня не загрузился. Открыть «Контроль» ›</div></button>';
  const n=(s.open||0)+(s.incomplete||0);
  return n?'<button class="glass ui2-today bad" data-act="go" data-v="ctl"><span class="pin">🔴</span><div><b>Требует внимания: '+n+'</b><br>Открыть разбор ›</div></button>'
    :'<button class="glass ui2-today" data-act="go" data-v="ctl"><span class="pin">🟢</span><div><b>Всё сходится</b><br>Отчёты и сверка с 27.10 без расхождений ›</div></button>';
}
function staffLine(o,rt){
  const pct=Math.round(Number(rt.admin_pharmacy_pct)*10000)/100;
  let d=o.kind==='adm'?'ставка + '+pct+'% аптеки'+(o.late>0?' + задержка '+o.late+' ч':''):'ставка'+((o.fn||o.fx)?' + фиксации: '+o.fn+(o.fx?' + '+o.fx+' рентген':''):'');
  if(o.n>1)d=o.n+' смен: '+d;
  return '<div class="srow"><span>'+esc(o.name)+'<br><small style="color:var(--mute)">'+esc(d)+'</small></span><b>'+money(o.pay)+'</b></div>';
}
function revBranchCard(bid){
  const rv=S.rev,f=S.revFrom,t=S.revTo,single=f===t;
  const reps=(rv.reports||[]).filter(r=>r.branch===bid);
  let h='<div class="card"><h2>'+esc(brTitle(bid))+'</h2>';
  if(!reps.length)return h+'<p class="hint">'+(single?'Отчёта за '+ruDate(f)+' ещё нет.':'Отчётов за этот период нет.')+'</p></div>';
  const a=revAgg(reps);
  h+='<h3>Выручка'+(single?'':' ('+a.n+' '+(a.n===1?'отчёт':'отч.')+')')+'</h3>';
  h+='<div class="srow big"><span>Клиника, вал</span><b>'+money(a.total)+'</b></div>'
    +'<div class="srow sub"><span>наличные</span><b>'+money(a.cash)+'</b></div><div class="srow sub"><span>безнал</span><b>'+money(a.cashless)+'</b></div>'
    +'<div class="srow big" style="margin-top:6px"><span>Аптека, вал</span><b>'+money(a.pv)+'</b></div>'
    +'<div class="srow sub"><span>наличные</span><b>'+money(a.pc)+'</b></div><div class="srow sub"><span>безнал</span><b>'+money(a.pl)+'</b></div>';
  const ob=Number(((S.rev.debt_open||{})[bid])||0);
  if(a.debt||a.repaid||ob){
    h+='<h3>Долги клиентов</h3>'+(a.debt?'<div class="srow"><span>Не оплачено клиентами</span><b>'+money(a.debt)+'</b></div>':'')+(a.repaid?'<div class="srow"><span>Погашено прошлых долгов</span><b>'+money(a.repaid)+'</b></div>':'')
      +(a.dc.length?'<p class="hint" style="margin:2px 0">'+a.dc.map(esc).join('; ')+'</p>':'')
      +'<div class="srow big"><span>Остаток долгов по отчётам</span><b>'+money(ob)+'</b></div><p class="hint">Считается по отчётам администраторов с 24.10.2026: записано как «не оплачено» минус погашено.</p>';
  }
  const docs=[...a.docs.entries()].sort((x,y)=>y[1]-x[1]);
  h+='<h3>Врачи, вал</h3>'+(docs.length?docs.map(d=>'<div class="srow"><span>'+esc(d[0])+'</span><b>'+money(d[1])+'</b></div>').join(''):'<p class="hint">Врачей в отчёте нет.</p>');
  const st=staffOf(S.revSal,bid);
  h+='<h3>Зарплата '+(single?'за день':'за период')+'</h3>';
  if(st===null)h+='<p class="hint">Зарплата не загрузилась. Откройте вкладку «Зарплата».</p>';
  else if(!st.length)h+='<p class="hint">Смен в отчётах нет.</p>';
  else{h+=st.map(o=>staffLine(o,S.revSal.rates||{})).join('')+'<div class="srow big paytot"><span>Итого</span><b>'+money(st.reduce((s,o)=>s+o.pay,0))+'</b></div><p class="hint">Без такси, доплат и вычетов: они во вкладке «Зарплата».</p>'}
  const last=reps[0];
  h+='<p class="hint">'+(single?('Отчёт подан '+ruDate(last.at.slice(0,10))+' в '+esc(last.at.slice(11))+', версия '+last.version+(last.by?', '+esc(last.by):'')+(last.correction?' (исправление)':'')+'.').replace(/\.\.$/,'.'):'Последний отчёт: '+ruDate(last.date)+'.')+'</p>';
  return h+'</div>';
}
function revHtml(){
  const today=omskToday(),cs=perStart(today),pe=addDays(cs,-1),ps=perStart(pe),yest=addDays(today,-1),f=S.revFrom,t=S.revTo;
  const on=(a,b)=>(f===a&&t===b)?' on':'';
  const chip=(l,a,b)=>'<button class="chip'+on(a,b)+'" data-act="revper" data-from="'+a+'" data-to="'+b+'">'+l+'</button>';
  let h=revStatusHtml()+'<div class="card"><h2>Выручка</h2><div class="chips rvper">'+chip('Сегодня',today,today)+chip('Вчера',yest,yest)+chip('Этот период',cs,today)+chip('Прошлый период',ps,pe)+'<button class="chip'+(S.revDates?' on':'')+'" data-act="revdates">Даты ▾</button></div>';
  if(S.revDates)h+='<div style="display:flex;gap:8px;align-items:flex-end;margin:6px 0"><label class="f" style="flex:1;min-width:0;margin:0"><span>С</span><input id="revf" type="date" value="'+esc(f)+'"></label><label class="f" style="flex:1;min-width:0;margin:0"><span>По</span><input id="revt" type="date" value="'+esc(t)+'"></label><button class="btn small" data-act="revgo">Показать</button></div>';
  const perTxt=f===t?ruDate(f):ruDate(f)+' — '+ruDate(t),allMode=!S.revErr&&!!S.rev&&!(S.revBranch!=='all'&&BRANCHES.some(b=>!b.testOnly&&b.id===S.revBranch));
  if(!allMode)h+='<p class="hint" style="margin:6px 0">'+perTxt+'</p>';
  h+='<div class="chips">'+[['all','Все']].concat(BRANCHES.filter(b=>!b.testOnly).map(b=>[b.id,brTitle(b.id)])).map(x=>'<button class="chip'+(S.revBranch===x[0]?' on':'')+'" data-act="revbr" data-b="'+esc(x[0])+'">'+esc(x[1])+'</button>').join('')+'</div></div>';
  if(S.revErr)return h+'<div class="card"><p>'+esc(S.revErr)+'</p><button class="btn sec small" data-act="revper" data-from="'+f+'" data-to="'+t+'">Повторить</button></div>';
  if(!S.rev)return h+'<div class="card"><p class="hint">Загружаю…</p></div>';
  const bids=BRANCHES.filter(b=>!b.testOnly).map(b=>b.id);
  if(S.revBranch!=='all'&&bids.includes(S.revBranch))return h+revBranchCard(S.revBranch);
  /* все филиалы: одна строка на филиал, нажатие открывает филиал */
  let tot={c:0,p:0,s:0,n:0,d:0},rows='';
  bids.forEach(bid=>{
    const reps=(S.rev.reports||[]).filter(r=>r.branch===bid),a=revAgg(reps),st=staffOf(S.revSal,bid),sp=st?st.reduce((s,o)=>s+o.pay,0):0;
    const ob=Number(((S.rev.debt_open||{})[bid])||0);tot.c+=a.total;tot.p+=a.pv;tot.s+=sp;tot.n+=a.n;tot.d+=ob;
    rows+='<button class="person revrow" data-act="revbr" data-b="'+esc(bid)+'"><b>'+esc(brTitle(bid))+' ›</b>'+(a.n?'<div class="srow"><span>Клиника</span><b>'+money(a.total)+'</b></div><div class="srow"><span>Аптека</span><b>'+money(a.pv)+'</b></div><div class="srow"><span>Зарплата</span><b>'+(st?money(sp):'—')+'</b></div>':'<small style="color:var(--mute)">отчёта нет</small>')+(ob?'<div class="srow"><span>Долги клиентов, остаток</span><b>'+money(ob)+'</b></div>':'')+'</button>';
  });
  h+='<div class="card revtop"><div class="revtop-per">'+perTxt+'</div><div class="srow big revtop-all"><span>Всего</span><b>'+money(tot.c+tot.p)+'</b></div><div class="srow sub"><span>клиника</span><b>'+money(tot.c)+'</b></div><div class="srow sub"><span>аптека</span><b>'+money(tot.p)+'</b></div><div class="srow sub"><span>зарплата по сменам</span><b>'+money(tot.s)+'</b></div>'+(tot.d?'<div class="srow big" style="margin-top:6px"><span>Долги клиентов, остаток</span><b>'+money(tot.d)+'</b></div><p class="hint">По отчётам администраторов с 24.10.2026: не оплачено минус погашено.</p>':'')+'</div>';
  h+='<div class="card"><h2>Все филиалы</h2>'+rows+'</div>';
  return h;
}

/* ====== Колл-центр (с 1.34): оператор сам отмечает смены; ставка за выход и процент вала клиник дня (делится на число операторов) берутся из базы ====== */
const CC_ERR={session:'Сессия закончилась, войдите заново',forbidden:'Нет доступа',full:'На эту дату уже отмечены два оператора',admin_same_day:'В этот день вы стоите администратором в отчёте филиала',date_range:'Эту дату отметить нельзя: она вне разрешённого окна',already:'Вы уже отмечены на эту дату',duplicate:'Эта отметка уже сохранена',comment:'Напишите причину',not_marked:'Отметки на эту дату нет',person:'Это не оператор колл-центра',period:'Период указан неверно'};
async function showCC(from,to){
  const today=omskToday();
  if(!from){from=perStart(today);to=today}
  S.ccFrom=from;S.ccTo=to;closeOv();S.view='cc';S.cc=null;S.ccErr=null;paint();
  try{
    const r=await rpc('ev_cc_my',{p_token:S.token,p_from:from,p_to:to},12000);
    if(S.ccFrom!==from||S.ccTo!==to)return;
    if(r&&r.error==='session'){S.token=null;LS.del('ev_token');S.view='login';toast('Сессия закончилась. Войдите заново.');render();loadLoginList().then(render);return}
    if(!r||!r.ok)S.ccErr=CC_ERR[r&&r.error]||'Не удалось загрузить';else S.cc=r;
  }catch(e){if(S.ccFrom!==from||S.ccTo!==to)return;S.ccErr=e.net?'Нет связи.':'Ошибка сервера.'}
  if(S.view==='cc')paint();
}
/* ====== 1.79 «Мои записи» в цветном дне смены: только действующие врачи.
   Читает отдельный серверный снимок; не вызывает Vetmanager из браузера и не обращается к финансам. ====== */
const APPT={rows:null,status:'idle',error:null,updatedAt:null,day:null};
/* c29: роль врача берём из входа по номеру (person.roles), а не из списка людей: S.loginList в 2.0 всегда пуст, из-за чего «Мои записи» не показывались никому. Права всё равно проверяет сервер (ev_my_appointments). */
const apptAllowed=()=>!!S.person&&hasRole('doctor');
function apptReset(){APPT.rows=null;APPT.status='idle';APPT.error=null;APPT.updatedAt=null;APPT.day=null}
const apptInWindow=dt=>dt>=omskToday()&&dt<=addDays(omskToday(),7);
async function loadAppointments(){
  if(!apptAllowed())return;
  APPT.status='loading';APPT.error=null;paint();
  try{
    const from=omskToday(),to=addDays(from,7);
    const r=await rpc('ev_my_appointments',{p_token:S.token,p_from:from,p_to:to},8000);
    if(r&&r.error==='session'){logout();toast('Сессия закончилась. Войдите заново.');return}
    if(!r||!r.ok||r.error==='forbidden'){APPT.status='unavailable';APPT.error='Записи для этой учётной записи недоступны.'}
    else{
      const allowed=new Set(['id','date','time','end','branch','status','pet_id','alias','species','reason','visit_type']);
      const states=new Set(['booked','unconfirmed','cancelled','waiting','in_treatment','completed','overdue','reschedule_requested']);
      /* c30: снимок может содержать «сырые» статусы Vetmanager — приводим к словарю приложения; deleted и неизвестные пропускаем, а не роняем весь снимок */
      const rawSt={save:'booked',directed:'waiting',accepted:'completed',delayed:'reschedule_requested',not_approved:'unconfirmed',not_confirmed:'unconfirmed'};
      const src=(Array.isArray(r.rows)?r.rows:[]).map(x=>(x&&typeof x==='object'&&rawSt[x.status])?Object.assign({},x,{status:rawSt[x.status]}):x).filter(x=>!(x&&typeof x==='object'&&(x.status==='deleted'||(typeof x.status==='string'&&!states.has(x.status)))));
      const rows=src.map(x=>{
        if(!x||Object.keys(x).some(k=>!allowed.has(k))||!x.id||!/^\d{4}-\d{2}-\d{2}$/.test(x.date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(x.time)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(x.end)||!['marksa','70let','pereleta'].includes(x.branch)||!states.has(x.status))throw Error('contract');
        const row={};Object.keys(x).forEach(k=>{if(x[k]!=null&&typeof x[k]!=='string'&&typeof x[k]!=='number')throw Error('contract');row[k]=x[k]});return row
      });
      if(new Set(rows.map(x=>String(x.id))).size!==rows.length)throw Error('contract');
      APPT.rows=rows;APPT.updatedAt=Number(r.updated_at)||null;APPT.status=r.status||'complete';APPT.error=r.error||null;
    }
  }catch(e){APPT.status='unavailable';APPT.error=e.net?'Нет связи.':'Не удалось загрузить снимок записей.'}
  if(S.view==='sched')paint();
}
function appointmentsHtml(day){
  const br={marksa:'Маркса, 45','70let':'70 лет Октября, 20',pereleta:'Перелёта, 19'};
  const st={booked:'запланирован',unconfirmed:'не подтверждён',cancelled:'отменён',waiting:'ожидает',in_treatment:'у врача',completed:'завершён',overdue:'просрочен',reschedule_requested:'перенос'};
  let h='<div style="margin:12px 0 4px;padding-top:10px;border-top:1px solid var(--line)"><h3 style="margin:0">Мои записи · '+ruDate(day)+'</h3><p class="hint">Нажмите другой цветной день своей смены, чтобы посмотреть его. Данные обновляются в 11:00, 15:00, 18:00 и 21:30 по Омску.</p>';
  if(APPT.status==='loading')return h+'<p class="hint">Загружаю сохранённый снимок…</p></div>';
  if(APPT.status==='unavailable')return h+'<p class="hint" style="color:var(--bad)">'+esc(APPT.error||'Записи недоступны')+'</p></div>';
  if(APPT.updatedAt)h+='<p class="hint">Данные на '+new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Omsk',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(APPT.updatedAt))+' по Омску</p>';
  const rows=(APPT.rows||[]).filter(x=>x.status!=='cancelled'&&x.date===day);
  if(!rows.length)return h+'<p>На этот день записей пока нет.</p></div>';
  rows.forEach(x=>{
    h+='<div class="person"><div class="srow"><span><b>'+esc(x.time)+'–'+esc(x.end)+' · '+esc(x.alias||'Служебная запись')+'</b><br><small>'+esc([x.species,br[x.branch]].filter(Boolean).join(' · '))+'</small></span></div>'+(x.visit_type?'<p style="margin:8px 0 0"><b>Цель визита:</b> '+esc(x.visit_type)+'</p>':'')+'<p class="hint" style="margin:5px 0 0">Запись №'+esc(x.id)+'</p></div>';
  });
  return h+'</div>';
}


function ccHtml(){
  if(!S.ccFrom){S.ccFrom=perStart(omskToday());S.ccTo=omskToday()}
  const today=omskToday(),cs=perStart(today),pe=addDays(cs,-1),ps=perStart(pe),f=S.ccFrom,t=S.ccTo,r=S.cc;
  const chip=(l,a,b)=>'<button class="chip'+((f===a&&t===b)?' on':'')+'" data-act="ccper" data-from="'+a+'" data-to="'+b+'">'+l+'</button>';
  let h='<div class="card"><h2>Колл-центр · мои смены</h2><div class="chips">'+chip('Этот период',cs,today)+chip('Прошлый период',ps,pe)+'</div><p class="hint" style="margin:6px 0">'+ruDate(f)+' — '+ruDate(t)+'</p></div>';
  if(S.ccErr)return h+'<div class="card"><p>'+esc(S.ccErr)+'</p><button class="btn sec small" data-act="ccper" data-from="'+f+'" data-to="'+t+'">Повторить</button></div>';
  if(!r)return h+'<div class="card"><p class="hint">Загружаю…</p></div>';
  const days=r.days||[],td=days.find(d=>d.date===today);
  const rt=r.rates||{},pool=Math.round(Number(rt.cc_pct_pool||0)*10000)/100;
  h+='<div class="card pay"><h3 style="margin-top:2px">Моя зарплата за период</h3><p class="hint" style="margin:0 0 6px">'+ruDate(f)+' — '+ruDate(t)+'</p>'
    +srow('Выходов: '+r.shifts+' × '+money(Number(rt.cc_shift||0)),money(Number(r.shift_pay||0)))
    +srow('Доля фонда периода'+(r.provisional?' (предварительно)':''),money(Number(r.pct_pay||0)))
    +(td&&td.me&&td.pay!=null?srow('Из них за сегодня ('+ruDate(today)+')',money(Number(td.pay))):'')
    +srow('Вал клиник за период (все дни)',money(days.reduce((q,d)=>q+Number(d.val||0),0)))
    +(Number(r.adj||0)?srow('Такси, доплаты, вычеты',sgn(Number(r.adj))):'')
    +'<div class="srow big"><span>Итого</span><b>'+money(Number(r.total||0))+'</b></div>'
    +'<p class="hint" style="margin:4px 0 0">Фонд периода — '+pool+'% вала клиник за весь период (1–15 или 16–конец месяца). Стоимость дня = фонд ÷ дни периода; одному оператору день целиком, двоим пополам. Вал — «Клиника общая» трёх филиалов из вечерних отчётов.'+(r.provisional?' <b>Период не закрыт: сумма предварительная и изменится, пока идут дни и отчёты.</b>':'')+'</p></div>';
  if(t>=today&&f<=today){
    h+='<div class="card">';
    if(td&&td.me)h+='<div class="chk ok"><i>✓</i><div>Сегодня вы на смене'+(td.others&&td.others.length?' вместе с '+esc(td.others.join(', ')):'')+'</div></div><button class="btn sec small" data-act="ccmark" data-dt="'+today+'" data-on="0">Снять отметку за сегодня</button>';
    else if(td&&Number(td.ops)>=2)h+='<div class="chk warn"><i>!</i><div>На сегодня уже отмечены два оператора: '+esc((td.others||[]).join(', '))+'</div></div>';
    else h+='<button class="btn big" data-act="ccmark" data-dt="'+today+'" data-on="1">Я сегодня на смене</button>';
    h+='</div>';
  }
  h+='<div class="card"><h3 style="margin-top:2px">По дням</h3>';
  if(!days.length)h+='<p class="hint">Дней в периоде пока нет.</p>';
  days.forEach(d=>{
    const ops=Number(d.ops)||0,who=d.me?(ops>1?'вдвоём с '+(d.others||[]).join(', '):'только вы'):(ops?'на смене: '+(d.others||[]).join(', '):'никто не отмечен');
    h+='<div class="person"'+(d.me?' style="border-color:var(--ok)"':'')+'><div class="srow"><span><b>'+ruDate(d.date)+'</b>'+(d.me?' · вы на смене':'')+'<br><small style="color:var(--mute)">'+esc(who)+'</small></span><b>'+(d.me&&d.pay!=null?money(Number(d.pay)):'')+'</b></div>'
      +'<div class="srow sub"><span>Вал клиник за день</span><b>'+(d.missing&&!Number(d.val)?'отчётов ещё нет':money(Number(d.val||0)))+'</b></div>'
      +(d.missing&&Number(d.val)?'<div class="srow sub"><span>Нет отчёта: '+esc(d.missing)+'</span><b></b></div>':'')
      +(d.editable?(d.me?'<button class="btn sec small" style="margin-top:6px" data-act="ccmark" data-dt="'+d.date+'" data-on="0">Снять отметку</button>':(ops<2?'<button class="btn sec small" style="margin-top:6px" data-act="ccmark" data-dt="'+d.date+'" data-on="1">Отметить смену</button>':'')):'')
      +'</div>';
  });
  return h+'<p class="hint">Отметить или снять смену можно '+(r.edit_from?'с '+ruDate(r.edit_from)+' по сегодня':'за сегодня и до 7 дней назад')+'. Ошиблись раньше — напишите руководителю.</p><a class="btn sec small" style="margin-top:8px" href="help/instruktsiya_callcenter.pdf" target="_blank" rel="noopener">Инструкция оператора (PDF)</a></div>';
}
function ccMarkAsk(dt,on){
  S.ccMark={dt:dt,on:on,uid:uid()};
  if(on){doCCMark();return}
  overlay('<h2>Снять отметку за '+ruDate(dt)+'</h2><label class="f"><span>Причина (обязательно)</span><input id="ccr" maxlength="300" placeholder="например: ошиблась датой"></label><button class="btn" data-act="ccmarkgo" style="margin-top:8px">Снять</button><button class="btn sec" style="margin-top:8px" data-act="ovclose">Отмена</button>');
}
async function doCCMark(){
  const m=S.ccMark;if(!m||S.ccBusy)return;
  const cm=m.on?null:((($('#ccr')||{}).value||'').trim());
  if(!m.on&&cm.length<3){toast('Напишите причину');return}
  S.ccBusy=true;
  try{
    const r=await rpc('ev_cc_mark',{p_token:S.token,p_date:m.dt,p_on:m.on,p_uid:m.uid,p_person:null,p_comment:cm},10000);
    if(!r||!r.ok){toast(CC_ERR[r&&r.error]||'Не удалось: '+(r&&r.error),6000);return}
    S.ccMark=null;closeOv();toast(m.on?'Смена '+ruDate(m.dt)+' отмечена':'Отметка снята');
    if(S.view==='branch'){loadCCToday(true)}else await showCC(S.ccFrom,S.ccTo);
  }catch(e){toast(e.net?'Нет связи, ничего не сохранено. Нажмите ещё раз':'Ошибка сервера',6000)}
  finally{S.ccBusy=false}
}
/* руководитель: экран «Зарплата» → «Колл-центр» */
function ccSalHtml(r){
  const list=r.callcenter||[],days=(r.cc_days||[]),rt=r.cc_rates||{};
  const sum=list.reduce((s,a)=>s+Number(a.total||0),0);
  let h=ccValEditor()+'<div class="card"><div class="srow big"><span>Колл-центр</span><b>'+money(sum)+'</b></div>';
  if(!list.length)h+='<p class="hint">Операторов в этом периоде нет.</p>';
  list.forEach(a=>{
    h+='<div class="person"><div class="srow big"><span>'+esc(a.name)+'</span><b>'+money(Number(a.total))+'</b></div><small style="color:var(--mute)">Выходов: '+a.shifts+'</small>'
      +'<details><summary>Расшифровка и дни</summary>'
      +srow('Выходов: '+a.shifts+' × '+money(Number(a.shift_rate)),money(Number(a.shift_pay)))
      +srow('Доля фонда периода'+(days.some(d=>d.provisional)?' (предварительно)':''),money(Number(a.pct_pay)))
      +adjItems(a.adj_items)
      +(a.days||[]).map(d=>'<div class="srow sub"><span>'+ruDate(d.date)+' · '+(Number(d.ops)>1?'вдвоём':'одна')+' · стоимость дня '+money(Number(d.pct_pay)*Number(d.ops))+(Number(d.ops)>1?' ÷ 2':'')+'</span><b>'+money(Number(d.pay))+'</b></div>').join('')+'</details></div>';
  });
  if(list.length)h+='<button class="btn sec small" style="margin-top:6px" data-act="salcopy">Скопировать ведомость</button>';
  h+=(days.some(d=>d.provisional)?'<p class="hint">Период не закрыт: суммы предварительные (стоимость дня = 3% вала прошедших дней ÷ их число), итог — после последнего дня периода.</p>':'')+'</div><div class="card"><h3 style="margin-top:2px">По дням</h3><button class="btn sec small" style="margin:0 0 8px" data-act="ccfor">Отметить или снять смену за оператора</button>';
  days.forEach(d=>{
    const ops=Number(d.ops)||0;
    h+='<div class="srow"><span>'+ruDate(d.date)+'<br><small style="color:var(--mute)">'+(ops?esc((d.names||[]).join(', ')):(d.no_shift?'<span style="color:var(--bad)"><b>ОШИБКА: никто не отмечен, доля дня не выплачена</b></span>':'никто не отмечен'))+' · вал '+(d.missing&&!Number(d.val)?'отчётов нет':money(Number(d.val||0)))+(d.missing&&Number(d.val)?' (нет: '+esc(d.missing)+')':'')+'</small></span><b>'+(ops?money(Number(d.pay_each))+(ops>1?' × '+ops:''):'—')+'</b></div>';
  });
  return h+'<p class="hint">Ставки из базы: выход '+money(Number(rt.cc_shift||0))+', '+(Math.round(Number(rt.cc_pct_pool||0)*10000)/100)+'% вала клиник периода — фонд; стоимость дня = фонд ÷ календарные дни периода, двоим пополам.</p></div>';
}
function ccForForm(){
  S.ccForUid=uid();
  const ops=((S.sal||{}).callcenter||[]).map(p=>'<option value="'+p.id+'">'+esc(p.name)+'</option>').join('');
  overlay('<h2>Смена за оператора</h2><label class="f"><span>Оператор</span><select id="cfw">'+ops+'</select></label>'
    +'<label class="f"><span>Что сделать</span><select id="cfo"><option value="1">Отметить смену</option><option value="0">Снять отметку</option></select></label>'
    +'<label class="f"><span>Дата</span><input id="cfd" type="date" min="2026-10-16" max="'+esc(omskToday())+'" value="'+esc(omskToday())+'"></label>'
    +'<label class="f"><span>Комментарий (обязателен)</span><input id="cfc" maxlength="300"></label>'
    +'<button class="btn" data-act="ccforgo" style="margin-top:8px">Сохранить</button><button class="btn sec" style="margin-top:8px" data-act="ovclose">Назад</button>');
}
async function doCCFor(){
  if(S.ccBusy)return;
  const pid=Number(($('#cfw')||{}).value),on=($('#cfo')||{}).value==='1',dt=($('#cfd')||{}).value,cm=(($('#cfc')||{}).value||'').trim();
  if(!pid){toast('Выберите оператора');return}
  if(!dt){toast('Укажите дату');return}
  if(cm.length<3){toast('Напишите комментарий');return}
  S.ccBusy=true;
  try{
    const r=await rpc('ev_cc_mark',{p_token:S.token,p_date:dt,p_on:on,p_uid:S.ccForUid,p_person:pid,p_comment:cm},10000);
    if(!r||!r.ok){toast((CC_ERR[r&&r.error]||'Не удалось: '+(r&&r.error)).replace('вы стоите','оператор стоит'),6000);return}
    S.ccForUid=null;closeOv();toast(r.already?'Смена уже была отмечена':on?'Отмечено':'Снято');
    await showSalary(S.salFrom,S.salTo);
  }catch(e){toast(e.net?'Нет связи, ничего не сохранено. Нажмите ещё раз':'Ошибка сервера',6000)}
  finally{S.ccBusy=false}
}

function salAddForm(){
  S.salUid=S.salUid||uid();
  const r=(S.view==='pay'?S.pay:S.sal)||{};
  const opts=(r.people||[]).map(p=>'<option value="'+p.id+'">'+esc(p.name)+' — '+esc(SAL_ROLE[p.role]||'')+'</option>').join('');
  overlay('<h2>Такси, доплата или вычет</h2>'
    +'<label class="f"><span>Кому</span><input id="sasr" class="srch" placeholder="Начните вводить фамилию" autocomplete="off"><select id="saw" size="4">'+opts+'</select></label>'
    +'<div class="f"><span>Что</span><div class="chips" id="sakc">'+[['taxi','Такси'],['manual','Доплата'],['other','Вычет']].map((k,i)=>'<button type="button" class="chip'+(i===1?' on':'')+'" data-act="sakind" data-k="'+k[0]+'">'+k[1]+'</button>').join('')+'</div><input type="hidden" id="sak" value="manual"></div>'
    +'<label class="f"><span>Сумма, ₽ (всегда положительная)</span><input id="saa" inputmode="decimal" placeholder="например 450"></label>'
    +'<label class="f"><span>За какое число</span><input id="sad" type="date" value="'+esc(S.view==='pay'?(omskToday()<S.payFrom?S.payFrom:omskToday()>S.payTo?S.payTo:omskToday()):omskToday())+'"></label>'
    +'<label class="f"><span>Комментарий (для доплаты и вычета обязателен)</span><input id="sac" maxlength="300"></label>'
    +'<button class="btn" data-act="saladdgo" style="margin-top:8px">Добавить</button><button class="btn sec" style="margin-top:8px" data-act="salback">Назад</button>');
  if(S.salPre!=null){const el=$('#saw');if(el)el.value=String(S.salPre);S.salPre=null}
  if(S.salKind){const k=$('#sak');if(k)k.value=S.salKind;document.querySelectorAll('#sakc .chip').forEach(c=>c.classList.toggle('on',c.dataset.k===S.salKind));S.salKind=null}
}
async function doSalAdd(){
  if(S.salBusy)return;
  const pid=Number(($('#saw')||{}).value),kind=($('#sak')||{}).value,raw=($('#saa')||{}).value,dt=($('#sad')||{}).value,cm=(($('#sac')||{}).value||'').trim();
  const v=num(raw);
  if(!pid){toast('Выберите сотрудника');return}
  if(v==null||isNaN(v)||v<=0){toast('Введите сумму больше нуля');return}
  if(kind!=='taxi'&&cm.length<3){toast('Напишите комментарий');return}
  if(!dt){toast('Укажите дату');return}
  S.salBusy=true;
  try{
    const r=await rpc('ev_salary_add',{p_token:S.token,p_person:pid,p_date:dt,p_kind:kind,p_amount:kind==='other'?-v:v,p_comment:cm||null,p_uid:S.salUid},10000);
    if(!r||!r.ok){toast(r&&r.error==='session'?'Сессия закончилась, войдите заново':r&&r.error==='date'?'Дата должна быть с 01.10.2026 и не позже завтра':'Не удалось добавить: '+(r&&r.error),6000);return}
    S.salUid=null;toast('Добавлено на '+ruDate(dt));
    if(S.view==='pay')await showPay(S.payFrom,S.payTo);else await showSalary(S.salFrom,S.salTo);
  }catch(e){toast(e.net?'Нет связи, ничего не добавлено. Нажмите ещё раз':'Ошибка сервера',6000)}
  finally{S.salBusy=false}
}
async function doSalCancel(id){
  if(S.salBusy)return;
  if(!confirm('Отменить эту добавку? В списке она останется отмеченной как отменённая.'))return;
  S.salBusy=true;
  try{
    const r=await rpc('ev_salary_cancel',{p_token:S.token,p_id:Number(id),p_uid:uid()},10000);
    if(!r||!r.ok){toast('Не удалось отменить: '+(r&&r.error),6000);return}
    toast('Отменено');if(S.view==='pay')await showPay(S.payFrom,S.payTo);else await showSalary(S.salFrom,S.salTo);
  }catch(e){toast(e.net?'Нет связи':'Ошибка сервера',6000)}
  finally{S.salBusy=false}
}


/* ====== 1.69: «Ручная загрузка руководителя» (меню → только руководитель). Начисления врачей из Vetmanager (xls), выплаты банка, выдача PIN ====== */
/*MU-PARSE-BEGIN*/
const MU_LAT={A:'А',a:'а',B:'В',C:'С',c:'с',E:'Е',e:'е',H:'Н',K:'К',k:'к',M:'М',O:'О',o:'о',P:'Р',p:'р',T:'Т',X:'Х',x:'х',y:'у'};
const muWords=s=>String(s==null?'':s).replace(/[AaBCcEeHKkMOoPpTXxy]/g,c=>MU_LAT[c]).replace(/ё/g,'е').replace(/Ё/g,'Е').toLowerCase().match(/[а-я]+/g)||[];
const muKey=s=>{const t=muWords(s);return t.length>1?t[0]+'|'+t[1][0]:t.length?t[0]+'|':null};
function muIndex(people){const m={};(people||[]).forEach(p=>{[p.full_name,p.short_name].forEach(n=>{const k=n?muKey(n):null;if(k){(m[k]=m[k]||new Set()).add(p.id)}})});return m}
function muMatch(idx,fio){const ids=idx[muKey(fio)];if(!ids||!ids.size)return{err:'нет в списке сотрудников'};if(ids.size>1)return{err:'несколько совпадений'};return{id:[...ids][0]}}
const muR2=x=>Math.round(x*100)/100;
const muPeriodEnd=d=>Number(d.slice(8,10))<=15?d.slice(0,8)+'15':new Date(Date.UTC(Number(d.slice(0,4)),Number(d.slice(5,7)),0)).toISOString().slice(0,10);
const muPeriodStart=d=>Number(d.slice(8,10))<=15?d.slice(0,8)+'01':d.slice(0,8)+'16';
const muPeriodOk=(f,t)=>/^\d{4}-\d{2}-\d{2}$/.test(f)&&/^\d{4}-\d{2}-\d{2}$/.test(t)&&muPeriodStart(f)===f&&muPeriodEnd(f)===t;
/* rows2d: массив строк листа (массивы ячеек). Ожидаются колонки «Период», «ФИО», «Сумма ЗП». */
function muParseVM(rows2d,idx){
  const out={period:null,rows:[],issues:[],total:0,fatal:null};
  if(!rows2d||!rows2d.length){out.fatal='Файл пустой';return out}
  const head=(rows2d[0]||[]).slice(0,3).map(x=>String(x==null?'':x).trim());
  if(head[0]!=='Период'||head[1]!=='ФИО'||head[2]!=='Сумма ЗП'){out.fatal='Это не файл начислений Vetmanager: ожидаются колонки «Период», «ФИО», «Сумма ЗП». Нашёл: '+head.join(' | ');return out}
  const periods=new Set(),seen=new Set();
  rows2d.slice(1).forEach(r=>{
    const per=String(r[0]==null?'':r[0]).trim(),fio=String(r[1]==null?'':r[1]).trim(),amt=r[2];
    if(!per&&!fio&&(amt===''||amt==null))return;
    const m=/^(\d{4}-\d{2}-\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})$/.exec(per);
    if(!m){out.issues.push('«'+fio+'»: период не распознан ('+per+')');return}
    periods.add(m[1]+'|'+m[2]);
    if(typeof amt!=='number'||!isFinite(amt)){out.issues.push(fio+': сумма не число ('+amt+')');return}
    if(amt<0)out.issues.push(fio+': отрицательная сумма '+amt);
    const mt=muMatch(idx,fio);
    if(mt.err){out.issues.push(fio+': '+mt.err+' (строка пропущена)');return}
    if(seen.has(mt.id)){out.issues.push(fio+': дубль строки в файле (пропущена)');return}
    seen.add(mt.id);out.rows.push({person_id:mt.id,amount:muR2(amt),name_in_file:fio});
  });
  if(periods.size!==1){out.fatal='В файле '+(periods.size?'несколько периодов: '+[...periods].join('; '):'нет распознанных периодов');return out}
  const p=[...periods][0].split('|');out.period=p;
  if(!muPeriodOk(p[0],p[1]))out.fatal='Период '+p[0]+' — '+p[1]+' не 1–15 и не 16–конец месяца';
  out.total=muR2(out.rows.reduce((s,r)=>s+r.amount,0));
  return out;
}
const muNum=s=>{const t=String(s==null?'':s).replace(/[\s ]/g,'').replace(',','.');return/^-?\d+(\.\d+)?$/.test(t)?Number(t):null};
const MU_FIO=/[А-ЯЁA-Z][а-яёa-z\-]+(?:\s+[А-ЯЁA-Z][а-яёa-z\-]+){1,2}/;
const MU_DATE=/(\d{2})[.\-\/](\d{2})[.\-\/](\d{4})|(\d{4})-(\d{2})-(\d{2})/;
const MU_CARD=/\b\d{13,20}\b/;
function muIso(s){const m=MU_DATE.exec(s||'');if(!m)return null;return m[1]?m[3]+'-'+m[2]+'-'+m[1]:m[4]+'-'+m[5]+'-'+m[6]}
/* Текст реестра банка: START;ддммгггг;...;CREDIT / счёт;сумма;ФИО;СНИЛС;1 / END;строк;сумма;RUR; либо 1С; либо таблица. Номера счетов и карт не сохраняются. */
function muParseBankText(text){
  const res={rows:[],issues:[],format:''};
  const T=String(text).replace(/^﻿/,'');
  if(/^\s*START;/.test(T)){
    res.format='банк (START/END)';
    const L=T.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
    const st=L[0].split(';'),en=L[L.length-1].split(';'),d=st[1]||'';
    const date=/^\d{8}$/.test(d)?d.slice(4)+'-'+d.slice(2,4)+'-'+d.slice(0,2):null;
    L.slice(1,-1).forEach(l=>{const c=l.split(';');res.rows.push({fio:(c[2]||'').trim(),amount:muNum(c[1]),date})});
    const cnt=Number(en[1]),tot=muNum(en[2]);
    const ssum=muR2(res.rows.reduce((s,r)=>s+(r.amount||0),0));
    if(en[0]!=='END')res.issues.push('Нет строки END в конце файла');
    else if(res.rows.length!==cnt||(tot!=null&&Math.abs(ssum-tot)>0.005))res.issues.push('Итог файла не сходится: строк '+res.rows.length+' (в END '+cnt+'), сумма '+ssum+' (в END '+tot+')');
    return res;
  }
  if(/СекцияДокумент/.test(T)){
    res.format='1С';
    (T.match(/СекцияДокумент[\s\S]*?КонецДокумента/g)||[]).forEach(blk=>{
      const d={};blk.split(/\r?\n/).forEach(l=>{const i=l.indexOf('=');if(i>0)d[l.slice(0,i)]=l.slice(i+1)});
      const pur=d['НазначениеПлатежа']||'',name=d['Получатель']||d['Получатель1']||'';
      const m=MU_FIO.exec(name)||MU_FIO.exec(pur);
      res.rows.push({fio:m?m[0]:name.trim(),amount:muNum(d['Сумма']),date:muIso(d['ДатаПлатежа']||d['ДатаДокумента']||d['Дата'])});
    });
    return res;
  }
  res.format='таблица';
  const lines=T.split(/\r?\n/).filter(l=>l.trim());
  const delim=[';','\t','|'].find(c=>lines.slice(0,20).every(l=>l.includes(c)))||',';
  lines.forEach(l=>{
    const cells=(l.split(delim).length>1?l.split(delim):l.split(/\s{2,}/)).map(c=>c.trim().replace(/^"|"$/g,''));
    const fc=cells.find(c=>MU_FIO.test(c));if(!fc)return;
    const fio=MU_FIO.exec(fc)[0];
    const cand=cells.filter(c=>/^[\d\s .,]+$/.test(c)&&!MU_CARD.test(c.replace(/\s/g,''))&&!MU_DATE.test(c)&&muNum(c)!=null);
    const dec=cand.filter(c=>/[.,]\d{1,2}$/.test(c)).map(muNum);
    const nums=dec.length?dec:cand.map(muNum);
    res.rows.push({fio,amount:nums.length?Math.max(...nums):null,date:muIso(l)});
  });
  return res;
}
function muMatchBank(rows,idx){
  return rows.map(r=>{
    const o={fio:r.fio,amount:r.amount,date:r.date,person_id:null,err:null};
    if(r.amount==null||!(r.amount>0))o.err='сумма не распознана';
    else{const m=muMatch(idx,r.fio);if(m.err)o.err=m.err;else o.person_id=m.id}
    return o;
  });
}
/* Сервер возвращает только открытые периоды с готовыми начислениями. Дата платежа лишь отсекает будущие. */
function muEligiblePeriods(payDate,periods){
  return(periods||[]).map(p=>Array.isArray(p)?{from:p[0],to:p[1]}:p)
    .filter(p=>p&&p.from&&p.to&&p.from<=payDate)
    .sort((a,b)=>String(a.from).localeCompare(String(b.from)))
    .map(p=>[p.from,p.to]);
}
function muDefaultPeriod(payDate,periods){return muEligiblePeriods(payDate,periods)[0]||null}
function muBankPayDate(b){const dates=(b&&b.rows||[]).map(r=>r.date).filter(Boolean).sort();return dates.length?dates[dates.length-1]:omskToday()}
function muSyncBankPeriod(){
  const b=S.mu&&S.mu.bank;if(!b)return;
  b.openPeriods=muEligiblePeriods(muBankPayDate(b),(S.mu.batches||{}).periods);
  if(!b.period||!b.openPeriods.some(p=>p[0]===b.period[0]&&p[1]===b.period[1]))b.period=b.openPeriods[0]||null;
}
const muGuessBranch=n=>/маркс|marks/i.test(n)?'marksa':/перел|perel/i.test(n)?'pereleta':/70|октябр/i.test(n)?'70let':'';
function muDecode(buf){
  const u=new Uint8Array(buf);
  for(const enc of['utf-8','windows-1251','ibm866']){try{return{text:new TextDecoder(enc,{fatal:true}).decode(u),enc}}catch(e){}}
  return{text:new TextDecoder('windows-1251').decode(u),enc:'windows-1251?'};
}
function muRandPin(){
  for(;;){
    const a=new Uint32Array(6);crypto.getRandomValues(a);const p=Array.from(a,x=>x%10).join('');
    if(/^(\d)\1{5}$/.test(p))continue;
    if('0123456789'.includes(p)||'9876543210'.includes(p))continue;
    return p;
  }
}
/* «Состояние системы»: пороги в часах. Красное = давно не было события. */
function muHealthRows(h,nowMs,tt){tt=tt||(x=>x);
  const age=t=>t?Math.max(0,(nowMs-new Date(t).getTime())/36e5):null;
  const row=(label,t,lim,note)=>{const a=age(t);return{label,age:a,lim,bad:a==null||a>lim,note:note||''}};
  const rows=[];
  (h.branches||[]).forEach(x=>rows.push(row('Последний отчёт: '+tt(x.branch),x.last,30)));
  rows.push(row('Последняя сверка отчётов (печать)',h.last_seal,30,'запускают агенты'));
  rows.push(row('Копия базы на Mac с проверкой восстановления',h.last_copy,14));
  rows.push(row('Последняя запись агентов Claude',h.last_agent,26,'если красное, контроль идёт без агентов'));
  return rows;
}
const muAgeTxt=a=>a==null?'нет данных':a<1?'меньше часа назад':a<48?Math.round(a)+' ч назад':Math.round(a/24)+' дн назад';
/*MU-PARSE-END*/
const muF=n=>Number(n||0).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2});
const MU_ERR={session:'Сессия закончилась. Войдите заново.',forbidden:'Раздел только для руководителя.',duplicate_file:'Этот файл уже загружен.',period_or_kind:'Период должен быть 1–15 или 16–конец месяца.',period_issued:'Период уже выдан. Выберите другой',period_not_ready:'Для периода ещё не загружены начисления трёх филиалов',period_future:'Период начинается позже даты платежа. Выберите другой',before_start:'Учёт в системе начинается с 16.10.2026.',row:'В файле есть сотрудник, которого нет в списке.',duplicate_person:'Один сотрудник дважды в файле.',branch:'Выберите филиал.',branch_already_loaded:'По этому филиалу и периоду файл уже загружен. Сначала отмените прежнюю загрузку.',input:'Файл не прошёл проверку.',pin_format:'PIN: ровно 6 цифр.',person:'Сотрудник не найден.'};
const muBrTitle=id=>(BRANCHES.find(b=>b.id===id)||{title:id||'—'}).title;
function muLoadX(){
  if(window.XLSX)return Promise.resolve();
  return new Promise((res,rej)=>{const s=document.createElement('script');s.src='xlsx.core.min.js';s.onload=()=>res();s.onerror=()=>rej(new Error('xlsx'));document.head.appendChild(s)});
}
async function muSha(buf){
  if(!(window.crypto&&crypto.subtle))throw new Error('nocrypto');
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buf)),b=>b.toString(16).padStart(2,'0')).join('');
}
async function showMU(){
  if(!isHead())return;
  closeOv();S.view='mu';S.mu={files:[],bank:null,people:[],idx:{},batches:null,pin:null,pinPerson:S.muPre!=null?String(S.muPre):'',busy:false,msg:null,err:null};S.muPre=null;
  paint();window.scrollTo(0,0);
  try{
    const [p,b,hl]=await Promise.all([rpc('ev_mu_people',{p_token:S.token},15000),rpc('ev_mu_batches',{p_token:S.token},15000),rpc('ev_mu_health',{p_token:S.token},15000).catch(()=>null)]);
    if(S.mu&&hl&&hl.ok)S.mu.health=hl;
    if(!S.mu)return;
    if((p&&p.error==='session')||(b&&b.error==='session')){S.mu=null;S.token=null;LS.del('ev_token');S.view='login';toast(MU_ERR.session);render();return}
    if(!p||!p.ok){S.mu.err=MU_ERR[p&&p.error]||'Не удалось загрузить список сотрудников';}
    else{S.mu.people=p.people;S.mu.idx=muIndex(p.people)}
    if(b&&b.ok){S.mu.batches=b;muSyncBankPeriod()}
    loadVacation('2026-10-16',addDays(omskToday(),7),true);
  }catch(e){if(S.mu)S.mu.err=e.net?'Нет связи.':'Ошибка сервера.'}
  if(S.view==='mu')paint();
}
async function muReloadBatches(){loadVacation('2026-10-16',addDays(omskToday(),7),true);try{const b=await rpc('ev_mu_batches',{p_token:S.token},15000);if(S.mu&&b&&b.ok){S.mu.batches=b;muSyncBankPeriod()}}catch(e){}if(S.view==='mu')paint()}
function muBatchDupVM(f){ // предупреждение до отправки
  const b=S.mu.batches;if(!b||!f.parsed||!f.parsed.period)return'';
  const hit=(b.vm||[]).find(x=>!x.cancelled&&x.branch===f.branch&&x.from===f.parsed.period[0]&&x.to===f.parsed.period[1]);
  return hit?'По этому филиалу и периоду уже есть загрузка №'+hit.id+' ('+hit.rows+' строк, '+muF(hit.total)+' ₽). Сначала отмените её ниже.':'';
}
async function muPickVM(input){
  const files=Array.from(input.files||[]);input.value='';
  if(!files.length||!S.mu)return;
  S.mu.msg=null;paint();
  try{await muLoadX()}catch(e){S.mu.err='Не загрузился модуль чтения Excel (xlsx.core.min.js). Проверьте связь и повторите.';paint();return}
  for(const file of files){
    const f={name:file.name,branch:muGuessBranch(file.name),hash:null,parsed:null,done:null,err:null};
    try{
      const buf=await file.arrayBuffer();
      f.hash=await muSha(buf);
      const wb=XLSX.read(new Uint8Array(buf),{type:'array'});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const rows=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:''});
      f.parsed=muParseVM(rows,S.mu.idx);
    }catch(e){f.err=e&&e.message==='nocrypto'?'Нужно открывать приложение по https.':'Не удалось прочитать файл.'}
    S.mu.files.push(f);
  }
  paint();
}
async function muLoadVMFile(i){
  const f=S.mu.files[i];if(!f||!f.parsed||f.parsed.fatal||!f.branch||S.mu.busy)return;
  const dup=muBatchDupVM(f);if(dup){toast(dup,6000);return}
  const p=f.parsed;
  const warn=p.issues.length?('\n\nБудут пропущены строки ('+p.issues.length+'):\n'+p.issues.slice(0,6).join('\n')):'';
  if(!confirm('Загрузить начисления врачей?\n'+muBrTitle(f.branch)+', '+ruDate(p.period[0])+' — '+ruDate(p.period[1])+'\nСтрок: '+p.rows.length+', итого '+muF(p.total)+' ₽'+warn))return;
  S.mu.busy=true;paint();
  try{
    const r=await rpc('ev_mu_load_vm',{p_token:S.token,p_from:p.period[0],p_to:p.period[1],p_branch:f.branch,p_hash:f.hash,p_file:f.name.slice(0,120),p_rows:p.rows.map(x=>({person_id:x.person_id,amount:x.amount})),p_note:null},25000);
    if(r&&r.ok){f.done='Загружено: загрузка №'+r.batch+', строк '+r.rows;S.mu.msg='Начисления загружены. Ведомость и «Мои начисления» обновятся сами.'}
    else{f.err=MU_ERR[r&&r.error]||'Не загружено'+(r&&r.error?' ('+r.error+')':'');if(r&&r.error==='session'){S.mu=null;S.token=null;LS.del('ev_token');S.view='login';render();return}}
  }catch(e){f.err=e.net?'Нет связи. Ничего не загружено, повторите.':'Ошибка сервера.'}
  S.mu.busy=false;await muReloadBatches();
}
async function muPickBank(input){
  const file=(input.files||[])[0];input.value='';
  if(!file||!S.mu)return;
  S.mu.msg=null;
  const b={name:file.name,hash:null,format:'',rows:[],issues:[],period:null,done:null,err:null,enc:''};
  try{
    const buf=await file.arrayBuffer();
    b.hash=await muSha(buf);
    const dec=muDecode(buf);b.enc=dec.enc;
    const pr=muParseBankText(dec.text);
    b.format=pr.format;b.issues=pr.issues.slice();
    b.rows=muMatchBank(pr.rows,S.mu.idx);
    if(!b.rows.length)b.issues.push('В файле не найдено ни одной строки с ФИО. Формат не распознан.');
  }catch(e){b.err=e&&e.message==='nocrypto'?'Нужно открывать приложение по https.':'Не удалось прочитать файл.'}
  S.mu.bank=b;muSyncBankPeriod();paint();
}
async function muLoadVacation(){
  const b=S.mu.bank;if(!b||S.mu.busy)return;
  const ok=b.rows.filter(r=>!r.err&&r.date);if(!ok.length)return;
  const miss=b.rows.filter(r=>r.err);const tot=muR2(ok.reduce((s,r)=>s+r.amount,0));
  if(!confirm('Загрузить ОТПУСКНЫЕ?\nСтрок: '+ok.length+', итого '+muF(tot)+' ₽.\nОни не вычитаются из зарплаты и не входят в «Выплачено».'+(miss.length?'\n\nБудут пропущены ('+miss.length+'): '+miss.slice(0,5).map(r=>r.fio+' ('+r.err+')').join(', '):'')))return;
  S.mu.busy=true;paint();
  try{
    const r=await rpc('ev_mu_load_vacation',{p_token:S.token,p_hash:b.hash,p_rows:ok.map(x=>({person_id:x.person_id,amount:x.amount,date:x.date}))},25000);
    if(r&&r.ok){b.done='Отпускные загружены. Строк: '+r.rows+', итого '+muF(Number(r.total||0))+' ₽.';S.mu.msg='Отпускные загружены.'}
    else{b.err=MU_ERR[r&&r.error]||'Не загружено'+(r&&r.error?' ('+r.error+')':'');if(r&&r.error==='session'){S.mu=null;S.token=null;LS.del('ev_token');S.view='login';render();return}}
  }catch(e){b.err=e.net?'Нет связи. Ничего не загружено, повторите.':'Ошибка сервера.'}
  S.mu.busy=false;await muReloadBatches();
}
async function muLoadBank(){
  if(S.mu&&S.mu.bankKind==='vacation')return muLoadVacation();
  const b=S.mu.bank;if(!b||S.mu.busy)return;
  if(!b.period){toast('Нет открытого периода с готовыми начислениями',6000);return}
  const ok=b.rows.filter(r=>!r.err);if(!ok.length)return;
  const miss=b.rows.filter(r=>r.err);
  const tot=muR2(ok.reduce((s,r)=>s+r.amount,0));
  const sel=document.getElementById('mubper');const per=sel?sel.value.split('|'):b.period;
  b.period=per;
  if(!confirm('Загрузить выплаты банка за период '+ruDate(per[0])+' — '+ruDate(per[1])+'?\nСтрок: '+ok.length+', итого '+muF(tot)+' ₽'+(miss.length?'\n\nБудут пропущены ('+miss.length+'): '+miss.slice(0,5).map(r=>r.fio+' ('+r.err+')').join(', '):'')))return;
  S.mu.busy=true;paint();
  try{
    const r=await rpc('ev_mu_load_bank',{p_token:S.token,p_from:per[0],p_to:per[1],p_hash:b.hash,p_rows:ok.map(x=>({person_id:x.person_id,amount:x.amount,date:x.date}))},25000);
    if(r&&r.ok){
      const ns=(r.not_salary||[]).length,sk=(r.skipped||[]).length;
      b.done='Загружено строк: '+r.rows+(sk?'; уже были (пропущены): '+sk:'')+(ns?'; переводы не за зарплату (не учтены): '+ns:'');
      S.mu.msg='Выплаты загружены.';
    }else{b.err=MU_ERR[r&&r.error]||'Не загружено'+(r&&r.error?' ('+r.error+')':'');if(r&&r.error==='session'){S.mu=null;S.token=null;LS.del('ev_token');S.view='login';render();return}}
  }catch(e){b.err=e.net?'Нет связи. Ничего не загружено, повторите.':'Ошибка сервера.'}
  S.mu.busy=false;await muReloadBatches();
}
async function muCancel(kind,key){
  if(S.mu.busy)return;
  if(kind==='vac'){if(!confirm('Отменить загрузку отпускных (все строки этого файла)?'))return;S.mu.busy=true;paint();
    try{const r=await rpc('ev_mu_cancel_vacation',{p_token:S.token,p_hash:key},20000);S.mu.msg=r&&r.ok?'Отпускные отменены.':(MU_ERR[r&&r.error]||'Не отменено')}catch(e){S.mu.msg=e.net?'Нет связи.':'Ошибка сервера.'}
    S.mu.busy=false;await muReloadBatches();return}
  if(!confirm(kind==='vm'?'Отменить загрузку начислений №'+key+'? Расчёт зарплаты по ней пересчитается.':'Отменить загрузку выплат банка (все строки этого файла)?'))return;
  S.mu.busy=true;paint();
  try{
    const r=kind==='vm'?await rpc('ev_mu_cancel_vm',{p_token:S.token,p_batch:Number(key)},20000):await rpc('ev_mu_cancel_bank',{p_token:S.token,p_hash:key},20000);
    S.mu.msg=r&&r.ok?'Отменено.':(MU_ERR[r&&r.error]||'Не отменено'+(r&&r.error?' ('+r.error+')':''));
  }catch(e){S.mu.msg=e.net?'Нет связи.':'Ошибка сервера.'}
  S.mu.busy=false;await muReloadBatches();
}
async function muIssuePin(){
  const m=S.mu;if(!m||m.busy||!m.pinPerson)return;
  const pe=m.people.find(p=>String(p.id)===String(m.pinPerson));if(!pe)return;
  if(!confirm('Выдать новый PIN сотруднику «'+pe.short_name+'»?\nСтарый PIN перестанет работать.'))return;
  const pin=muRandPin();m.busy=true;m.pin=null;paint();
  try{
    const r=await rpc('ev_mu_set_pin',{p_token:S.token,p_person:pe.id,p_pin:pin},15000);
    if(r&&r.ok){m.pin={name:pe.short_name,pin}}
    else m.msg=MU_ERR[r&&r.error]||'PIN не выдан';
  }catch(e){m.msg=e.net?'Нет связи. PIN не менялся.':'Ошибка сервера.'}
  m.busy=false;paint();
}

/* ====== 2.0 · Ручная загрузка графика из Excel по шаблону (без ИИ) ======
   Шаблон: одна таблица «Дата | Филиал | Роль | Сотрудник». Сервер — существующие функции графика (те же, что у Штаба):
   ev_sched_import (черновик версии) -> ev_sched_map_name (сопоставление имён) -> ev_sched_publish (публикация).
   Роль -> тип графика: администратор=admin, врач/ассистент=clinical, колл-центр=callcenter. */
const SCH_ROLE_MAP=[[/админ/i,'admin','admin'],[/врач/i,'clinical','doctor'],[/ассист/i,'clinical','assistant'],[/колл/i,'callcenter','callcenter']];
const SCH_BR_MAP=[[/маркс|marksa/i,'marksa'],[/70|октябр|70let/i,'70let'],[/перел|pereleta/i,'pereleta']];
const SCH_KIND_NAME={admin:'Администраторы',clinical:'Врачи и ассистенты',callcenter:'Колл-центр'};
const schNorm=s=>String(s||'').toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]/g,'');
function schTemplateDownload(){
  muLoadX().then(()=>{
    const m=S.mu||{},ppl=(m.people||[]).filter(p=>p.short_name).map(p=>[p.short_name]);
    const next=addDays(omskToday().slice(0,7)+'-01',32).slice(0,7);
    const rows=[['Дата','Филиал','Роль','Сотрудник'],[next+'-01','Маркса','Администратор','Фамилия И.О.'],[next+'-01','70 лет','Врач','Фамилия И.О.'],[next+'-01','Перелёта','Ассистент','Фамилия И.О.'],[next+'-01','','Колл-центр','Фамилия И.О.']];
    const ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=[{wch:12},{wch:14},{wch:16},{wch:24}];
    const ws2=XLSX.utils.aoa_to_sheet([['Как заполнять'],['Одна строка = одна смена одного человека.'],['Дата: ГГГГ-ММ-ДД или ДД.ММ.ГГГГ. Все даты одного месяца (можно несколько месяцев — загрузятся отдельно).'],['Филиал: Маркса / 70 лет / Перелёта. Для колл-центра филиал пустой.'],['Роль: Администратор / Врач / Ассистент / Колл-центр.'],['Сотрудник: Фамилия И.О., как в списке на листе «Люди». Если имени нет в списке — приложение предложит выбрать человека.'],['Пример-строки удалите перед загрузкой.']]);
    ws2['!cols']=[{wch:110}];
    const ws3=XLSX.utils.aoa_to_sheet([['Люди (Фамилия И.О.)'],...ppl]);ws3['!cols']=[{wch:28}];
    const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'График');XLSX.utils.book_append_sheet(wb,ws2,'Как заполнять');XLSX.utils.book_append_sheet(wb,ws3,'Люди');
    XLSX.writeFile(wb,'Шаблон_графика.xlsx');
  }).catch(()=>toast('Не загрузился модуль Excel',5000));
}
function schCellDate(v){
  const s=String(v==null?'':v).trim();let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);if(m)return m[1]+'-'+m[2]+'-'+m[3];
  m=s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/);if(m)return m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');
  return null;
}
async function schPickFile(inp){
  const f=inp.files&&inp.files[0];if(!f||!S.mu)return;const m=S.mu;m.err=null;m.msg=null;m.sch=null;
  try{
    await muLoadX();const buf=await f.arrayBuffer(),sha=await muSha(buf);
    const wb=XLSX.read(buf,{type:'array',cellDates:false,raw:false,dateNF:'yyyy-mm-dd'});
    const ws=wb.Sheets[wb.SheetNames.find(n=>/график/i.test(n))||wb.SheetNames[0]];
    const arr=XLSX.utils.sheet_to_json(ws,{header:1,raw:false,dateNF:'yyyy-mm-dd',defval:''});
    const head=(arr[0]||[]).map(schNorm),ix={d:head.findIndex(x=>x.startsWith('дата')),b:head.findIndex(x=>x.startsWith('филиал')),r:head.findIndex(x=>x.startsWith('роль')),n:head.findIndex(x=>x.startsWith('сотрудник')||x.startsWith('фио'))};
    if(ix.d<0||ix.r<0||ix.n<0){m.err='Не тот файл: в первой строке нужны колонки «Дата», «Филиал», «Роль», «Сотрудник». Скачайте шаблон.';paint();return}
    const rows=[],bad=[];
    arr.slice(1).forEach((r,i)=>{
      if(r.every(c=>String(c).trim()===''))return;const line=i+2;
      const date=schCellDate(r[ix.d]),role=SCH_ROLE_MAP.find(x=>x[0].test(String(r[ix.r]))),name=String(r[ix.n]).trim();
      const br=ix.b>=0&&String(r[ix.b]).trim()?(SCH_BR_MAP.find(x=>x[0].test(String(r[ix.b])))||[])[1]:null;
      if(!date)return bad.push('строка '+line+': не понял дату «'+r[ix.d]+'»');
      if(!role)return bad.push('строка '+line+': не понял роль «'+r[ix.r]+'»');
      if(!name)return bad.push('строка '+line+': пустой сотрудник');
      if(role[1]==='callcenter'&&ix.b>=0&&String(r[ix.b]).trim()&&br)return bad.push('строка '+line+': у колл-центра филиал должен быть пустым');
      if(role[1]!=='callcenter'&&!br)return bad.push('строка '+line+': не понял филиал «'+(ix.b>=0?r[ix.b]:'')+'»');
      rows.push({date,kind:role[1],slot:role[2],branch:role[1]==='callcenter'?'':br,name,src:'График!R'+line});
    });
    if(!rows.length){m.err='В файле нет ни одной смены.'+(bad.length?' '+bad.slice(0,3).join('; '):'');paint();return}
    const dup=new Set(),seen=new Set();rows.forEach(r=>{const k=[r.date,r.branch,r.slot,schNorm(r.name)].join('|');if(seen.has(k))dup.add(k);seen.add(k)});
    /* автосопоставление имён: Фамилия И.О. по справочнику людей (без регистра, ё/е, точек) */
    const byShort=new Map();(m.people||[]).forEach(p=>{byShort.set(schNorm(p.short_name),p);byShort.set(schNorm(p.full_name),p)});
    const names=[...new Set(rows.map(r=>r.name))],map={},unknown=[];
    names.forEach(n=>{const p=byShort.get(schNorm(n));if(p)map[n]=p.id;else unknown.push(n)});
    const months=[...new Set(rows.map(r=>r.date.slice(0,7)))].sort();
    m.sch={file:f.name,sha,rows,bad,dup:[...dup].length,months,map,unknown,stage:'preview',res:[]};paint();
  }catch(e){m.err='Не удалось прочитать файл: '+(e&&e.message||'ошибка');paint()}
}
async function schImport(){
  const m=S.mu,sc=m&&m.sch;if(!sc||m.busy)return;
  if(sc.unknown.some(n=>!sc.map[n])){toast('Выберите сотрудника для каждого незнакомого имени');return}
  m.busy=true;m.err=null;m.msg=null;paint();sc.res=[];
  try{
    /* 1) сопоставление имён (запоминается на сервере: следующий месяц сопоставится само) — по видам графика, где имя встречается */
    const needMap=new Set();sc.rows.forEach(r=>needMap.add(r.kind+'|'+r.name));
    for(const k of needMap){const[kind,name]=[k.slice(0,k.indexOf('|')),k.slice(k.indexOf('|')+1)];const pid=sc.map[name];if(!pid)continue;
      const r=await rpc('ev_sched_map_name',{p_token:S.token,p_kind:kind,p_name:name,p_person:pid},15000);if(!r||!r.ok)throw new Error('map '+(r&&r.error||''))}
    /* 2) черновики версий по месяцу и виду */
    for(const month of sc.months)for(const kind of ['admin','clinical','callcenter']){
      const rs=sc.rows.filter(r=>r.date.slice(0,7)===month&&r.kind===kind);if(!rs.length)continue;
      const r=await rpc('ev_sched_import',{p_token:S.token,p_month:month+'-01',p_kind:kind,p_file:sc.file,p_sha:sc.sha,p_rows:rs.map(x=>({date:x.date,branch:x.branch,slot:x.slot,name:x.name,src:x.src})),p_note:'ручная загрузка руководителя из приложения'},30000);
      if(!r||!r.ok)throw new Error((r&&r.error)+(r&&r.detail?': '+r.detail:''));
      sc.res.push({month,kind,version_id:r.version_id,version:r.version,rows:r.rows,unmatched:r.unmatched||[]});
    }
    sc.stage='draft';m.msg='Черновик графика загружен. Проверьте и опубликуйте.';
  }catch(e){m.err='Не получилось загрузить график: '+(e&&e.message||'ошибка')+'. Ничего не опубликовано.'}
  m.busy=false;paint();
}
async function schPublish(){
  const m=S.mu,sc=m&&m.sch;if(!sc||m.busy||sc.stage!=='draft')return;
  if(sc.res.some(x=>x.unmatched.length)){toast('Есть несопоставленные имена — публикация закрыта');return}
  if(!confirm('Опубликовать график? Он заменит опубликованный график этого месяца и сразу станет виден сотрудникам.'))return;
  m.busy=true;m.err=null;paint();
  try{for(const x of sc.res){const r=await rpc('ev_sched_publish',{p_token:S.token,p_version:x.version_id},15000);if(!r||!r.ok)throw new Error(r&&r.error||'publish')}
    sc.stage='done';m.msg='График опубликован: '+sc.res.map(x=>SCH_KIND_NAME[x.kind]+' '+x.month+' (версия '+x.version+')').join(', ');S.sch=null;
  }catch(e){m.err='Публикация не удалась: '+(e&&e.message||'ошибка')+'. Черновик сохранён, можно повторить.'}
  m.busy=false;paint();
}
function schUploadHtml(){
  const m=S.mu||{},sc=m.sch;
  let h='<div class="card"><h2>5. График (Excel по шаблону)</h2><p class="hint">Врачи, ассистенты, администраторы и колл-центр — одним файлом, без ИИ. Шаблон: колонки «Дата», «Филиал», «Роль», «Сотрудник».</p>'
    +'<button class="btn sec small" data-act="schtemplate">Скачать шаблон</button>'
    +'<label class="btn sec" style="display:block;text-align:center;margin:8px 0">Выбрать файл с графиком<input type="file" class="schfile" accept=".xlsx,.xls" style="display:none"></label>';
  if(!sc)return h+'</div>';
  h+='<div style="border:1px solid var(--line);border-radius:10px;padding:10px;margin:8px 0"><b>'+esc(sc.file)+'</b><br><small style="color:var(--mute)">месяц: '+sc.months.join(', ')+' · смен: '+sc.rows.length+'</small>'
    +['admin','clinical','callcenter'].map(k=>{const n=sc.rows.filter(r=>r.kind===k).length;return n?'<div class="srow sub"><span>'+SCH_KIND_NAME[k]+'</span><b>'+n+'</b></div>':''}).join('');
  if(sc.bad.length)h+='<div class="chk bad"><i>!</i><div><b>Строки не поняты: '+sc.bad.length+'</b><br><small>'+sc.bad.slice(0,5).map(esc).join('<br>')+(sc.bad.length>5?'<br>…':'')+'</small></div></div>';
  if(sc.dup)h+='<div class="chk warn"><i>!</i><div><b>Повторы: '+sc.dup+'</b><br><small>Одна и та же смена записана дважды.</small></div></div>';
  if(sc.stage==='preview'){
    if(sc.unknown.length){h+='<p class="hint" style="margin:8px 0 4px">Этих имён нет в списке сотрудников — выберите человека:</p>'
      +sc.unknown.map((n,i)=>'<label class="f"><span>'+esc(n)+'</span><select class="schmap" data-n="'+esc(n)+'"><option value="">— выберите —</option>'+(m.people||[]).map(p=>'<option value="'+p.id+'"'+(String(sc.map[n])===String(p.id)?' selected':'')+'>'+esc(p.short_name)+'</option>').join('')+'</select></label>').join('')}
    h+=sc.bad.length?'<p class="hint">Исправьте файл и загрузите снова: пока есть непонятые строки, загрузка закрыта.</p>':'<button class="btn" data-act="schimport"'+(m.busy?' disabled':'')+'>Загрузить как черновик</button><p class="hint">Ничего не опубликуется, пока вы не нажмёте «Опубликовать».</p>';
  }else{
    h+=sc.res.map(x=>'<div class="srow"><span>'+SCH_KIND_NAME[x.kind]+' · '+x.month+'<br><small style="color:var(--mute)">версия '+x.version+', смен '+x.rows+(x.unmatched.length?' · не сопоставлено: '+x.unmatched.map(u=>esc(u.name)).join(', '):'')+'</small></span><b>'+(sc.stage==='done'?'опубликовано':'черновик')+'</b></div>').join('');
    if(sc.stage==='draft')h+='<button class="btn" data-act="schpublish"'+(m.busy||sc.res.some(x=>x.unmatched.length)?' disabled':'')+'>Опубликовать</button>';
  }
  return h+'</div></div>';
}
/* ====== 2.0 c11 · ОТПУСКНЫЕ (слово Михаила 17.11, 12а) ======
   Банковский файл «Отпускные» привязывается к ДАТЕ платежа, период не нужен. НЕ входит в «Выплачено» и «Остаток к выплате»
   (отдельная таблица на сервере: ev_mu_load_vacation / ev_mu_cancel_vacation / ev_vacation_list). */
const VAC={key:'',items:null,total:0,loads:null,err:null,loading:false};
async function loadVacation(from,to,force){
  if(!S.token)return;const key=from+'|'+to;
  if(VAC.loading||(!force&&VAC.key===key&&(VAC.items||VAC.err)))return;
  VAC.key=key;VAC.loading=true;VAC.err=null;
  try{const r=await rpc('ev_vacation_list',{p_token:S.token,p_person:null,p_from:from,p_to:to},10000);
    if(r&&r.ok){VAC.items=r.items||[];VAC.total=Number(r.total||0);VAC.loads=r.loads||null}else{VAC.items=[];VAC.total=0;VAC.err=(r&&r.error)||'err'}
  }catch(e){VAC.items=[];VAC.total=0;VAC.err='net'}
  VAC.loading=false;if(['pay','work','mu'].includes(S.view))paint();
}
function vacLinesHtml(items){return (items||[]).map(i=>'<div class="srow sub"><span>'+ruDate(i.date)+'</span><b>'+money(Number(i.amount))+'</b></div>').join('')}
function vacPeriodLine(r){
  if(!r||!r.from||VAC.key!==r.from+'|'+r.to||!(VAC.total>0))return '';
  return '<div class="srow sub"><span>Отпускные за период<br><small style="color:var(--mute)">отдельная выплата, не входит в «Выплачено» и «Остаток к выплате»</small></span><b>'+money(VAC.total)+'</b></div>';
}
function vacPersonHtml(pid){
  const it=(VAC.items||[]).filter(i=>String(i.person)===String(pid));if(!it.length)return '';
  const sum=it.reduce((q,i)=>q+Number(i.amount||0),0);
  return '<div class="card"><h3 style="margin-top:2px">Отпускные</h3>'+it.map(i=>'<div class="srow"><span>Отпускные · '+ruDate(i.date)+'<br><small style="color:var(--mute)">не вычитаются из зарплаты</small></span><b>'+money(Number(i.amount))+'</b></div>').join('')+(it.length>1?'<div class="srow sub"><span>Всего</span><b>'+money(sum)+'</b></div>':'')+'</div>';
}
function muHtml(){
  const m=S.mu||{};let h='<div class="card"><button class="btn sec small" data-act="muback" style="margin:0 0 10px">← Назад</button><h2>Ручная загрузка</h2><p class="hint">Раздел только для руководителя. Сюда загружаются файлы Vetmanager (начисления врачей), выплаты из банка и выдаются PIN. Файлы разбираются на вашем устройстве, в базу уходят только ФИО-сопоставленные суммы. Номера карт и счетов не сохраняются.</p>';
  if(m.err)h+='<div class="note bad" style="color:var(--bad)">'+esc(m.err)+'</div>';
  if(m.msg)h+='<div style="margin:6px 0;padding:8px 10px;border-radius:8px;background:var(--okbg);color:var(--ok)">'+esc(m.msg)+'</div>';
  h+='</div>';
  if(m.health){const hr=muHealthRows(m.health,Date.now(),muBrTitle);const bad=hr.filter(x=>x.bad).length;
    h+='<div class="card"><h2>Состояние системы</h2><div style="margin:4px 0 8px;padding:8px 10px;border-radius:8px;font-weight:700;background:var(--'+(bad?'badbg':'okbg')+');color:var(--'+(bad?'bad':'ok')+')">'+(bad?'Есть что проверить: '+bad:'Всё в норме')+'</div>'
      +hr.map(x=>'<div class="srow"><span>'+esc(x.label)+(x.note&&x.bad?'<br><small style="color:var(--mute)">'+esc(x.note)+'</small>':'')+'</span><b style="color:var(--'+(x.bad?'bad':'ok')+')">'+muAgeTxt(x.age)+'</b></div>').join('')
      +(m.health.no_pin>0?'<div class="srow"><span>Сотрудников без PIN</span><b style="color:var(--bad)">'+m.health.no_pin+'</b></div>':'')
      +'<p class="hint">Красное: событие давнее порога (отчёты и сверка 30 ч, копия Mac 14 ч, агенты 26 ч). Только чтение, ничего не меняет.</p></div>';}
  /* A. начисления врачей */
  h+='<div class="card"><h2>1. Начисления врачей (Vetmanager)</h2><p class="hint">Файлы .xls, по одному на филиал, колонки «Период», «ФИО», «Сумма ЗП». Можно выбрать сразу три файла.</p>'
    +'<label class="btn sec" style="display:block;text-align:center;margin:6px 0">Выбрать файлы<input type="file" class="mufile" data-k="vm" accept=".xls,.xlsx" multiple style="display:none"></label>';
  (m.files||[]).forEach((f,i)=>{
    h+='<div style="border:1px solid var(--line);border-radius:10px;padding:10px;margin:8px 0"><b>'+esc(f.name)+'</b>';
    if(f.err)h+='<div style="color:var(--bad);margin-top:4px">'+esc(f.err)+'</div>';
    const p=f.parsed;
    if(p&&p.fatal)h+='<div style="color:var(--bad);margin-top:4px">'+esc(p.fatal)+'</div>';
    if(p&&!p.fatal){
      h+='<div class="srow"><span>Период</span><b>'+ruDate(p.period[0])+' — '+ruDate(p.period[1])+'</b></div>'
        +'<label class="f"><span>Филиал</span><select class="mubr" data-i="'+i+'"><option value="">— выберите —</option>'+BRANCHES.filter(b=>!b.testOnly).map(b=>'<option value="'+b.id+'"'+(f.branch===b.id?' selected':'')+'>'+esc(b.title)+'</option>').join('')+'</select></label>'
        +'<div class="srow"><span>Строк / итого</span><b>'+p.rows.length+' / '+muF(p.total)+' ₽</b></div>';
      h+='<details><summary>Состав ('+p.rows.length+')</summary>'+p.rows.map(r=>'<div class="srow sub"><span>'+esc(((m.people||[]).find(x=>x.id===r.person_id)||{}).short_name||r.name_in_file)+'</span><b>'+muF(r.amount)+'</b></div>').join('')+'</details>';
      if(p.issues.length)h+='<div style="color:var(--warn);margin-top:4px;font-size:13px">Замечания ('+p.issues.length+'):<br>'+p.issues.map(esc).join('<br>')+'</div>';
      const dup=f.branch&&!f.done?muBatchDupVM(f):'';
      if(dup)h+='<div style="color:var(--bad);margin-top:4px;font-size:13px">'+esc(dup)+'</div>';
    }
    if(f.done)h+='<div style="color:var(--ok);margin-top:6px;font-weight:700">'+esc(f.done)+'</div>';
    else if(p&&!p.fatal)h+='<button class="btn" style="margin-top:8px" data-act="muvmgo" data-i="'+i+'"'+((!f.branch||m.busy||muBatchDupVM(f))?' disabled':'')+'>'+(m.busy?'Загрузка…':'Загрузить')+'</button>';
    h+=' <button class="btn sec small" data-act="muvmdrop" data-i="'+i+'">Убрать из списка</button></div>';
  });
  h+='</div>';
  /* B. банк */
  h+='<div class="card"><h2>2. Выплаты из банка</h2><div class="srow big" style="margin:6px 0 2px"><span>Тип файла</span><b>'+(m.bankKind==='vacation'?'Отпускные':'Зарплата')+'</b></div><div class="chips" style="margin-bottom:8px"><button class="chip'+(m.bankKind!=='vacation'?' on':'')+'" data-act="bankkind" data-k="salary">Зарплата</button><button class="chip'+(m.bankKind==='vacation'?' on':'')+'" data-act="bankkind" data-k="vacation">Отпускные</button></div>'+(m.bankKind==='vacation'?'<p class="hint" style="margin:0 0 8px">Отпускные не вычитаются из зарплаты и не входят в «Выплачено». Период не нужен: привязываются к дате платежа из файла.</p>':'')+(m.bankKind==='vacation'?'<p class="hint">Файл переводов (реестр банка, 1С, txt или csv) с отпускными. Проверьте строки и даты платежа перед загрузкой.</p>':'<p class="hint">Файл переводов (реестр банка, 1С, txt или csv). Приложение показывает только открытые периоды с готовыми начислениями, начавшиеся не позже даты платежа. Если их несколько, сначала выбран самый ранний. Перед загрузкой обязательно проверьте и подтвердите период.</p>')
    +'<label class="btn sec" style="display:block;text-align:center;margin:6px 0">Выбрать файл<input type="file" class="mufile" data-k="bank" accept=".txt,.csv,.tsv,.xml,.1c,.dat,text/*" style="display:none"></label>';
  const bk=m.bank;
  if(bk){
    h+='<div style="border:1px solid var(--line);border-radius:10px;padding:10px;margin:8px 0"><b>'+esc(bk.name)+'</b>';
    if(bk.err)h+='<div style="color:var(--bad);margin-top:4px">'+esc(bk.err)+'</div>';
    else{
      const ok=bk.rows.filter(r=>!r.err),bad=bk.rows.filter(r=>r.err);
      h+='<div class="srow sub"><span>Формат: '+esc(bk.format)+', кодировка '+esc(bk.enc)+'</span></div>';
      const sel=bk.openPeriods||[],vac=m.bankKind==='vacation',noDate=bk.rows.filter(r=>!r.err&&!r.date).length;
      if(vac){h+='<div class="srow big" style="margin:10px 0"><span>Тип файла</span><b>Отпускные</b></div>'+(noDate?'<div class="chk bad"><i>!</i><div><b>В файле нет даты платежа у строк: '+noDate+'</b><br>Для отпускных дата обязательна: загрузка закрыта.</div></div>':'')}
      else if(bk.period)h+='<div class="srow big" style="margin:10px 0"><span>Период</span><b>'+ruDate(bk.period[0])+' — '+ruDate(bk.period[1])+'</b></div>'
        +'<label class="f"><span>Проверьте период</span><select id="mubper">'+sel.map(p=>'<option value="'+p[0]+'|'+p[1]+'"'+(p[0]===bk.period[0]?' selected':'')+'>'+ruDate(p[0])+' — '+ruDate(p[1])+'</option>').join('')+'</select></label>';
      else if(!vac)h+='<div class="chk warn"><i>!</i><div><b>Нет открытого периода с готовыми начислениями</b><br>Сначала загрузите начисления врачей по трём филиалам. Уже выданные периоды в списке не показываются.</div></div>';
      h+='<div class="srow"><span>Распознано / итого</span><b>'+ok.length+' / '+muF(ok.reduce((s,r)=>s+r.amount,0))+' ₽</b></div>';
      h+='<details open><summary>Строки ('+bk.rows.length+')</summary>'+bk.rows.map(r=>{const pe=r.person_id?(m.people||[]).find(x=>x.id===r.person_id):null;return'<div class="srow sub"><span>'+esc(pe?pe.short_name:r.fio)+(r.date?' · '+ruDate(r.date):'')+(r.err?'<br><span style="color:var(--bad)">'+esc(r.err)+' — будет пропущена</span>':'')+'</span><b>'+(r.amount!=null?muF(r.amount):'—')+'</b></div>'}).join('')+'</details>';
      if(bk.issues.length)h+='<div style="color:var(--bad);margin-top:4px;font-size:13px">'+bk.issues.map(esc).join('<br>')+'</div>';
      if(bad.length)h+='<div style="color:var(--warn);margin-top:4px;font-size:13px">Не сопоставлено строк: '+bad.length+'. Они не загрузятся.</div>';
      if(bk.done)h+='<div style="color:var(--ok);margin-top:6px;font-weight:700">'+esc(bk.done)+'</div>';
      else h+='<button class="btn" style="margin-top:8px" data-act="mubankgo"'+((!ok.length||(!vac&&!bk.period)||(vac&&noDate)||m.busy||bk.issues.length)?' disabled':'')+'>'+(m.busy?'Загрузка…':(vac?'Подтвердить и загрузить отпускные':'Подтвердить и загрузить выплаты'))+'</button>';
    }
    h+=' <button class="btn sec small" data-act="mubankdrop">Убрать из списка</button></div>';
  }
  h+='</div>';
  /* C. загруженное */
  const bt=m.batches;
  h+='<div class="card"><h2>3. Что уже загружено</h2>';
  if(!bt)h+='<p class="hint">Загрузка списка…</p>';
  else{
    h+='<h3>Начисления врачей</h3>'+((bt.vm||[]).length?bt.vm.map(x=>'<div class="srow"><span'+(x.cancelled?' style="text-decoration:line-through;color:var(--mute)"':'')+'><b>№'+x.id+'</b> '+esc(muBrTitle(x.branch))+'<br><small>'+ruDate(x.from)+' — '+ruDate(x.to)+' · '+x.rows+' стр. · '+muF(x.total)+' ₽</small></span>'+(x.cancelled?'<small>отменена</small>':'<button class="btn sec small" data-act="mucancel" data-kind="vm" data-key="'+x.id+'"'+(m.busy?' disabled':'')+'>Отменить</button>')+'</div>').join(''):'<p class="hint">Пока ничего.</p>');
    h+='<h3>Отпускные</h3>'+((VAC.loads||[]).length?VAC.loads.map(x=>'<div class="srow"><span'+(x.cancelled?' style="text-decoration:line-through;color:var(--mute)"':'')+'><small>платёж '+ruDate(x.date)+'</small><br>'+x.rows+' стр. · '+muF(Number(x.total))+' ₽</span>'+(x.cancelled?'<small>отменена</small>':'<button class="btn sec small" data-act="mucancelvac" data-k="'+esc(x.hash)+'">Отменить</button>')+'</div>').join(''):'<p class="hint">Отпускные пока не загружались.</p>')
    +'<h3>Выплаты банка</h3>'+((bt.bank||[]).length?bt.bank.map(x=>'<div class="srow"><span'+(x.cancelled?' style="text-decoration:line-through;color:var(--mute)"':'')+'><small>'+ruDate(x.from)+' — '+ruDate(x.to)+(x.date?' · платёж '+ruDate(x.date):'')+'</small><br>'+esc((x.who||[]).join(', '))+(x.rows>(x.who||[]).length?' и др.':'')+' · '+x.rows+' стр. · '+muF(x.total)+' ₽</span>'+(x.cancelled?'<small>отменена</small>':'<button class="btn sec small" data-act="mucancel" data-kind="bank" data-key="'+esc(x.hash)+'"'+(m.busy?' disabled':'')+'>Отменить</button>')+'</div>').join(''):'<p class="hint">Пока ничего.</p>');
  }
  h+='</div>';
  /* D. PIN */
  h+=schUploadHtml();
  h+='<div class="card"><h2>4. Выдать PIN сотруднику</h2><p class="hint">PIN из 6 цифр создаётся случайно и показывается один раз. Старый PIN перестаёт работать, блокировка входа снимается.</p>'
    +'<label class="f"><span>Сотрудник</span><select id="mupinp"><option value="">— выберите —</option>'+(m.people||[]).map(p=>'<option value="'+p.id+'"'+(String(m.pinPerson)===String(p.id)?' selected':'')+'>'+esc(p.short_name)+(p.has_pin?'':' (PIN не выдан)')+'</option>').join('')+'</select></label>'
    +'<button class="btn" style="margin-top:8px" data-act="mupin"'+(m.busy?' disabled':'')+'>Выдать новый PIN</button>';
  if(m.pin)h+='<div style="margin-top:10px;padding:12px;border-radius:10px;background:var(--okbg);color:var(--ok);text-align:center"><div>'+esc(m.pin.name)+'</div><div style="font-size:34px;font-weight:800;letter-spacing:6px">'+esc(m.pin.pin)+'</div><div class="hint" style="color:var(--ink)">Покажется только сейчас. Передайте сотруднику лично.</div><button class="btn sec small" data-act="mupincopy">Скопировать</button> <button class="btn sec small" data-act="mupinhide">Скрыть</button></div>';
  h+='</div>';
  return h;
}
