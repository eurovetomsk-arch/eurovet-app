'use strict';
/* ====== 2.0 · Контроль денег по Vetmanager (К1) ======
   После сдачи отчёта: ev_vm_check_request (сервер сам вызывает проверку; без сети — позже, отчёт не блокируется), затем несколько раз читаем ev_vm_check_status.
   При mismatch/no_data администратор видит «В Vetmanager X, у вас Y. Исправьте или напишите причину». «Контроль» руководителя: красные флаги ev_vm_check_flags + «Решить» с причиной (ev_vm_check_resolve).
   Вердикт считает сервер (жёсткое правило, порог 10 ₽). Здесь только показ. Токен Vetmanager в клиент не попадает. */
const VMC={flags:null,err:null,loading:false,acc:null,info:null};
const VMC_FIELD={total:'Вал клиники',cash:'Наличные клиники',cashless:'Безнал клиники',fix_normal:'Фиксация животного (обычная)',fix_xray:'Фиксация на R-снимке'};
const vmcIsDoc=f=>/^doctor:\d+$/.test(String(f||''));
/* К3: расхождение по врачу (основа зарплаты). reason = «Фамилия — причина» */
const vmcDocName=r=>String(r||'').split(' — ')[0]||'врач';
const vmcDocWhy=r=>String(r||'').split(' — ').slice(1).join(' — ');
const vmcLabel=f=>vmcIsDoc(f)?'Зарплатная база':(VMC_FIELD[f]||String(f||''));
const vmcIsFix=f=>String(f||'').startsWith('fix_');
/* пояснение к расхождению фиксаций: report — в отчёте, vm — в счетах Vetmanager */
const vmcFixNote=(rep,vm)=>Number(rep)<Number(vm)?(Number(rep)===0?'в счёте есть фиксация, в отчёте её нет':'в счетах фиксаций больше, чем в отчёте'):'в отчёте больше, чем в счетах';
/* суммы в рублях, фиксации в штуках */
const vmcVal=(f,n)=>n==null?'—':(vmcIsFix(f)?String(Math.round(Number(n)))+' шт.':vmcRub(n));
const VMC_QKEY='ev_vmq';
const vmcRub=n=>n==null?'—':String(Number(n).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2}))+' ₽';
const vmcDate=d=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(d||''));return m?m[3]+'.'+m[2]:String(d||'')};
const vmcBranch=b=>((typeof BRANCHES!=='undefined'&&BRANCHES.find(x=>x.id===b))||{title:b}).title;
function vmcQ(){try{const a=JSON.parse(localStorage.getItem(VMC_QKEY)||'[]');return Array.isArray(a)?a.filter(x=>x&&typeof x.branch==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x.date||'')):[]}catch(e){return[]}}
function vmcQSave(a){try{localStorage.setItem(VMC_QKEY,JSON.stringify(a.slice(-20)))}catch(e){}}
function vmcMessage(rows){
  const bad=(rows||[]).filter(r=>r.verdict==='mismatch'||r.verdict==='no_data');if(!bad.length)return '';
  return bad.map(r=>r.verdict==='mismatch'
    ?(vmcIsFix(r.field)
      ?'<b>'+vmcLabel(r.field)+'.</b> В отчёте '+vmcVal(r.field,r.report)+', в Vetmanager '+vmcVal(r.field,r.vm)+' — '+vmcFixNote(r.report,r.vm)+'. Исправьте отчёт или напишите причину руководителю.'
      :'<b>'+vmcLabel(r.field)+'.</b> В Vetmanager '+vmcVal(r.field,r.vm)+', у вас '+vmcVal(r.field,r.report)+'. '+(r.reason?esc(r.reason)+'. ':'')+'Исправьте отчёт или напишите причину руководителю.')
    :'<b>'+vmcLabel(r.field)+'.</b> Не удалось сверить ('+esc(r.reason||'нет данных')+'). Отчёт сохранён.').join('<br>');
}
async function vmcStatus(branch,date,minVersion){
  try{const r=await rpc('ev_vm_check_status',{p_token:S.token,p_branch:branch,p_date:date},10000);
    if(r&&r.ok&&(r.rows||[]).length&&(!minVersion||Math.max(...r.rows.map(x=>x.version||0))>=minVersion))return r.rows}catch(e){}
  return null;
}
async function vmcAfterSubmit(branch,date,version){
  if(!S.token)return;
  let queued=false;
  try{const r=await rpc('ev_vm_check_request',{p_token:S.token,p_branch:branch,p_date:date},10000);queued=!!(r&&r.ok&&r.queued)}
  catch(e){if(e.net){const a=vmcQ();if(!a.some(x=>x.branch===branch&&x.date===date)){a.push({branch,date});vmcQSave(a)}}return}
  if(!queued)return;
  for(const wait of [8000,15000,25000]){
    await new Promise(r=>setTimeout(r,wait));
    const rows=await vmcStatus(branch,date,version);
    if(rows){const m=vmcMessage(rows);if(m)vmcShow(m);return}
  }
}
function vmcShow(html){
  const old=document.getElementById('vmcbox');if(old)old.remove();
  const d=document.createElement('div');d.id='vmcbox';d.className='vmc-box';d.innerHTML='<div class="vmc-card"><b>Сверка с Vetmanager</b><p>'+html+'</p><button class="go" data-vmact="close">Понятно</button></div>';
  document.body.appendChild(d);
}
async function vmcFlushQueue(){
  if(!S.token)return;const a=vmcQ();if(!a.length)return;vmcQSave([]);
  for(const x of a){await vmcAfterSubmit(x.branch,x.date,0)}
}
window.addEventListener('online',()=>{vmcFlushQueue()});
async function loadAccFlags(){
  try{const r=await rpc('ev_access_flags',{p_token:S.token},10000);if(r&&r.ok){VMC.acc=r.flags||[];VMC.info=r.info||[]}}catch(e){}
  if(S.view==='ctl')paint();
}
async function loadVmFlags(){
  if(!S.token||VMC.loading)return;VMC.loading=true;loadAccFlags();
  try{const r=await rpc('ev_vm_check_flags',{p_token:S.token},10000);
    if(r&&r.ok){VMC.flags=r.flags||[];VMC.err=null}else VMC.err=(r&&r.error==='forbidden')?null:'Сверка с Vetmanager пока недоступна.'}
  catch(e){VMC.err=e.net?'Нет связи: сверка с Vetmanager не загрузилась.':'Сверка с Vetmanager пока недоступна.'}
  VMC.loading=false;if(S.view==='ctl')paint();
}
const vmcHm=t=>{try{return new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Omsk',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(t))}catch(e){return ''}};
function vmcAccLine(f){
  const who=esc(f.who||(f.person_id?'#'+f.person_id:'разные люди')),d=f.detail||{},red=f.level==='red';
  if(f.kind==='night')return '<b>Ночной вход · '+who+' · '+vmcHm(f.at)+'</b>'+((d.after||[]).length?'<br>После входа: '+(d.after||[]).map(x=>esc(x.action)).join(', '):'');
  if(f.kind==='pin'){
    if(d.device)return '<b>Подбор PIN с одного устройства по разным людям · '+esc(vmcDate(d.date))+' '+vmcHm(f.at)+'</b>';
    return '<b>'+(red?'Подбор PIN: ':'Неверный PIN ')+'×'+Number(d.count)+(red?' (5 и больше за час)':'')+' · '+who+' · '+esc(vmcDate(d.date))+'</b>';
  }
  if(f.kind==='device')return '<b>'+(red?'Новое устройство и неудачные входы · ':'Новое устройство · ')+who+' · '+vmcHm(f.at)+'</b>';
  if(f.kind==='money')return '<b>Ночное денежное действие (не руководитель) · '+who+' · '+vmcHm(f.at)+'</b><br>'+esc(d.action||'');
  return esc(f.kind);
}
/* красное: требует кнопки; серое «К сведению» (7 дней): без кнопки */
function vmcAccHtml(){
  let h='';const a=VMC.acc,i=VMC.info;
  if(a&&a.length)h+='<div class="card vmc-flags"><h2>Входы и деньги</h2>'+a.map(f=>'<div class="chk bad"><i>!</i><div>'+vmcAccLine(f)+'<br><button class="btn sec small" data-vmact="accres" data-key="'+esc(f.key)+'">Это я / знаю</button></div></div>').join('')+'</div>';
  if(i&&i.length)h+='<div class="card vmc-info"><h2>К сведению</h2><p class="hint">Не требует решения, только за 7 дней.</p>'+i.map(f=>'<div class="vmc-infoline">'+vmcAccLine(f)+'</div>').join('')+'</div>';
  return h;
}
function vmFlagsHtml(){
  return vmcAccHtml()+vmVmHtml();
}
function vmVmHtml(){
  if(VMC.err)return '<div class="card"><p class="hint">'+esc(VMC.err)+'</p></div>';
  const f=VMC.flags;if(!f||!f.length)return '';
  return '<div class="card vmc-flags"><h2>Сверка с Vetmanager</h2>'+f.map(x=>vmcIsDoc(x.field)?'<div class="chk bad"><i>!</i><div><b>'+esc(vmcBranch(x.branch))+' · '+esc(vmcDate(x.date))+' · Зарплатная база</b><br>Врач '+esc(vmcDocName(x.reason))+', разница '+vmcRub(Math.abs(Number(x.diff||0)))+(vmcDocWhy(x.reason)?'<br><small>'+esc(vmcDocWhy(x.reason))+'</small>':'')+'<br><button class="btn sec small" data-vmact="resolve" data-id="'+Number(x.id)+'">Решить с причиной</button></div></div>':'<div class="chk bad"><i>!</i><div><b>'+esc(vmcBranch(x.branch))+' · '+esc(vmcDate(x.date))+' · '+esc(vmcLabel(x.field))+'</b><br>'
    +(x.verdict==='mismatch'?(vmcIsFix(x.field)?'В отчёте '+vmcVal(x.field,x.report)+', в Vetmanager '+vmcVal(x.field,x.vm)+' — '+vmcFixNote(x.report,x.vm):'В отчёте '+vmcVal(x.field,x.report)+', в Vetmanager '+vmcVal(x.field,x.vm)+', разница '+vmcVal(x.field,x.diff))+(x.reason?'<br>'+esc(x.reason):''):'Не удалось сверить: '+esc(x.reason||'нет данных'))
    +'<br><button class="btn sec small" data-vmact="resolve" data-id="'+Number(x.id)+'">Решить с причиной</button></div></div>').join('')+'</div>';
}
document.addEventListener('click',async ev=>{
  const el=ev.target.closest&&ev.target.closest('[data-vmact]');if(!el)return;
  if(el.dataset.vmact==='close'){const b=document.getElementById('vmcbox');if(b)b.remove();return}
  if(el.dataset.vmact==='accres'){
    const why=prompt('Причина (не короче 5 знаков): почему это нормально');if(!why||why.trim().length<5){if(why!==null)toast('Причина слишком короткая');return}
    try{const r=await rpc('ev_access_resolve',{p_token:S.token,p_key:el.dataset.key,p_reason:why.trim()},10000);toast(r&&r.ok?'Записано':'Не удалось записать');if(r&&r.ok)await loadAccFlags()}
    catch(e){toast(e.net?'Нет связи':'Ошибка сервера')}
    return;
  }
  if(el.dataset.vmact==='resolve'){
    const why=prompt('Причина (не короче 5 знаков): почему это расхождение допустимо');if(!why||why.trim().length<5){if(why!==null)toast('Причина слишком короткая');return}
    try{const r=await rpc('ev_vm_check_resolve',{p_token:S.token,p_check_id:Number(el.dataset.id),p_reason:why.trim()},10000);
      toast(r&&r.ok?'Решение записано':r&&r.error==='stale'?'Данные уже обновились, откройте Контроль заново':'Не удалось записать');if(r&&r.ok)await loadVmFlags()}
    catch(e){toast(e.net?'Нет связи':'Ошибка сервера')}
  }
});

/* ====== Экран «Ожидайте сверки» после сдачи отчёта (ТЗ 23.11) ======
   Клиент только читает итог К1 по ТЕКУЩЕЙ версии отчёта (ev_vm_check_status, раз в 5 с, до 3 минут). Расчёт К1, деньги и права не меняются.
   Исходы: green (деньги ok/no_clinic_activity, фиксации ok) → можно домой; red_money (mismatch по деньгам) → «Исправить отчёт»; red_fix (расхождение только по фиксациям) → красным, домой можно;
   yellow (нет ответа 3 минуты или Vetmanager не ответил) → «Руководитель увидит в Контроле», выход разрешён; offline (нет связи) → «Сверка будет после связи». Закрыть экран кнопкой нельзя, пока идёт ожидание. */
const VMW_POLL=5000,VMW_TIMEOUT=180000,VMW_MONEY=['total','cash','cashless'];
let vmwTick=null;
function vmwEval(rows,version,needDocs){
  const cur=(rows||[]).filter(r=>Number(r.version||0)>=Number(version||0));
  const by={};cur.forEach(r=>{by[r.field]=r});
  if(!VMW_MONEY.every(f=>by[f]))return{state:'wait',rows:[]};
  const money=VMW_MONEY.map(f=>by[f]),fixes=cur.filter(r=>vmcIsFix(r.field));
  const mm=money.filter(r=>r.verdict==='mismatch'),dm=cur.filter(r=>vmcIsDoc(r.field)&&r.verdict==='mismatch');
  if(mm.length||dm.length)return{state:'red_money',rows:mm.concat(dm,fixes.filter(r=>r.verdict==='mismatch'))};   /* К3: расхождение по врачу — красное как по деньгам */
  if(money.some(r=>r.verdict==='no_data'))return{state:'yellow',rows:money.filter(r=>r.verdict==='no_data')};
  if(!money.every(r=>r.verdict==='ok'||r.verdict==='no_clinic_activity'))return{state:'wait',rows:[]};
  if(needDocs&&!cur.some(r=>vmcIsDoc(r.field)))return{state:'wait',rows:[]};   /* К3: зелёный/красный по фиксациям только когда по этой версии есть результат врачей (гонка: деньги приходят раньше) */
  const fm=fixes.filter(r=>r.verdict==='mismatch');
  return fm.length?{state:'red_fix',rows:fm}:{state:'green',rows:[]};
}
function vmwLine(r){
  if(vmcIsDoc(r.field))return'<b>Врач '+esc(vmcDocName(r.reason))+':</b> в отчёте '+vmcRub(r.report||0)+', в Vetmanager '+vmcRub(r.vm||0)+'.'+(vmcDocWhy(r.reason)?' <small>'+esc(vmcDocWhy(r.reason))+'.</small>':'');
  if(vmcIsFix(r.field))return'<b>'+esc(vmcLabel(r.field))+'.</b> В отчёте '+vmcVal(r.field,r.report)+', в Vetmanager '+vmcVal(r.field,r.vm)+' — '+vmcFixNote(r.report,r.vm)+'.';
  return'<b>'+esc(vmcLabel(r.field))+'.</b> В отчёте '+vmcRub(r.report)+', в Vetmanager '+vmcRub(r.vm)+'.';
}
function vmwHtml(){
  const w=S.vmw;if(!w)return'';
  const home='<button class="btn" data-act="vmwhome">На главную</button>';
  if(w.state==='wait')return'<div class="card vmw"><h2 class="vmw-blink">Ожидайте сверки финансовых данных</h2><p class="hint">Прошло <b id="vmwsec">'+Math.floor((Date.now()-w.t0)/1000)+'</b> с. Не закрывайте приложение: сверка с Vetmanager занимает до минуты.</p></div>';
  if(w.state==='green')return'<div class="card vmw"><div class="chk ok"><i>✓</i><div><b>Сверено с Vetmanager. Можно идти домой</b><br><small>'+esc(vmcBranch(w.branch))+' · '+esc(vmcDate(w.date))+'</small></div></div>'+home+'</div>';
  if(w.state==='red_money')return'<div class="card vmw"><div class="chk bad"><i>!</i><div><b>Деньги не сошлись с Vetmanager</b><br>'+w.rows.map(vmwLine).join('<br>')+'</div></div>'
    +(w.rows.some(r=>vmcIsDoc(r.field))?'<p class="hint">В Vetmanager врач выбирается в шапке счёта — проверь, кто указан.</p>':'')
    +'<button class="btn" data-act="vmwfix" data-branch="'+esc(w.branch)+'">Исправить отчёт</button></div>';
  if(w.state==='red_fix')return'<div class="card vmw"><div class="chk bad"><i>!</i><div><b>Фиксации не сошлись с Vetmanager</b><br>'+w.rows.map(vmwLine).join('<br>')+'<br><small>Деньги совпали. Руководитель увидит это в «Контроле».</small></div></div>'+home+'</div>';
  if(w.state==='offline')return'<div class="card vmw"><div class="chk warn"><i>…</i><div><b>Сверка будет после связи</b><br><small>Отчёт сохранён. Проверка Vetmanager пройдёт, когда появится интернет.</small></div></div>'+home+'</div>';
  return'<div class="card vmw"><div class="chk warn"><i>!</i><div><b>Сверка не ответила. Руководитель увидит в Контроле</b></div></div>'+home+'</div>';
}
function vmwSet(w,state,rows){if(S.vmw!==w)return;w.state=state;w.rows=rows||[];if(vmwTick){clearInterval(vmwTick);vmwTick=null}if(S.view==='vmw')render()}
async function vmwStart(branch,date,version,needDocs){
  const w=S.vmw={branch,date,version:Number(version)||0,needDocs:!!needDocs,t0:Date.now(),state:'wait',rows:[]};
  S.view='vmw';render();
  if(vmwTick)clearInterval(vmwTick);
  vmwTick=setInterval(()=>{const e=document.getElementById('vmwsec');if(e)e.textContent=String(Math.floor((Date.now()-w.t0)/1000))},1000);
  let q=false;
  try{const r=await rpc('ev_vm_check_request',{p_token:S.token,p_branch:branch,p_date:date},10000);
    if(!r||!r.ok){S.vmw=null;if(vmwTick){clearInterval(vmwTick);vmwTick=null}S.view='done';render();return}   /* филиал без сверки: прежний экран «Отчёт принят» */
    q=!!r.queued}
  catch(e){if(e.net){const a=vmcQ();if(!a.some(x=>x.branch===branch&&x.date===date)){a.push({branch,date});vmcQSave(a)}vmwSet(w,'offline');return}
    vmwSet(w,'yellow');return}
  if(!q){vmwSet(w,'yellow');return}
  while(S.vmw===w&&w.state==='wait'){
    const rows=await vmcStatus(branch,date,w.version);
    if(S.vmw!==w)return;
    const ev=vmwEval(rows,w.version,w.needDocs);
    if(ev.state!=='wait'){vmwSet(w,ev.state,ev.rows);return}
    if(Date.now()-w.t0>=VMW_TIMEOUT){vmwSet(w,'yellow');return}
    await new Promise(r=>setTimeout(r,VMW_POLL));
    if(Date.now()-w.t0>=VMW_TIMEOUT&&S.vmw===w&&w.state==='wait'){vmwSet(w,'yellow');return}
  }
}
/* «Назад» браузера/жест не выводит с экрана ожидания и с красного по деньгам: возвращаем запись в историю и остаёмся (ТЗ 23.11) */
function vmwBlockBack(){
  if(S.view==='vmw'&&S.vmw&&(S.vmw.state==='wait'||S.vmw.state==='red_money')){
    try{history.pushState({evrovet:typeof evNavSnapshot==='function'?evNavSnapshot():{view:'vmw'}},'',location.href)}catch(e){}
    return true;
  }
  return false;
}
