'use strict';
/* ====== 2.0 · Контроль денег по Vetmanager (К1) ======
   После сдачи отчёта: ev_vm_check_request (сервер сам вызывает проверку; без сети — позже, отчёт не блокируется), затем несколько раз читаем ev_vm_check_status.
   При mismatch/no_data администратор видит «В Vetmanager X, у вас Y. Исправьте или напишите причину». «Контроль» руководителя: красные флаги ev_vm_check_flags + «Решить» с причиной (ev_vm_check_resolve).
   Вердикт считает сервер (жёсткое правило, порог 10 ₽). Здесь только показ. Токен Vetmanager в клиент не попадает. */
const VMC={flags:null,err:null,loading:false,acc:null};
const VMC_FIELD={total:'итог клиники',cash:'наличные',cashless:'безнал'};
const VMC_QKEY='ev_vmq';
const vmcRub=n=>n==null?'—':String(Number(n).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2}))+' ₽';
const vmcDate=d=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(d||''));return m?m[3]+'.'+m[2]:String(d||'')};
const vmcBranch=b=>((typeof BRANCHES!=='undefined'&&BRANCHES.find(x=>x.id===b))||{title:b}).title;
function vmcQ(){try{const a=JSON.parse(localStorage.getItem(VMC_QKEY)||'[]');return Array.isArray(a)?a.filter(x=>x&&typeof x.branch==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x.date||'')):[]}catch(e){return[]}}
function vmcQSave(a){try{localStorage.setItem(VMC_QKEY,JSON.stringify(a.slice(-20)))}catch(e){}}
function vmcMessage(rows){
  const bad=(rows||[]).filter(r=>r.verdict==='mismatch'||r.verdict==='no_data');if(!bad.length)return '';
  return bad.map(r=>r.verdict==='mismatch'
    ?'В Vetmanager '+vmcRub(r.vm)+', у вас '+vmcRub(r.report)+' ('+VMC_FIELD[r.field]+'). Исправьте отчёт или напишите причину руководителю.'
    :'Не удалось сверить: '+VMC_FIELD[r.field]+' ('+esc(r.reason||'нет данных')+'). Отчёт сохранён.').join('<br>');
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
  try{const r=await rpc('ev_access_flags',{p_token:S.token},10000);if(r&&r.ok)VMC.acc=r.flags||[]}catch(e){}
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
  const who=esc(f.who||'#'+f.person_id),d=f.detail||{};
  if(f.kind==='night'){const a=(d.after||[]).map(x=>esc(x.action)).join(', ');return '<b>Ночной вход · '+who+' · '+vmcHm(f.at)+'</b>'+(d.money?' <b>(деньги)</b>':'')+(a?'<br>После входа: '+a:'')}
  if(f.kind==='pin')return '<b>Неверный PIN ×'+Number(d.count)+' · '+who+' · '+esc(vmcDate(d.date))+'</b>';
  if(f.kind==='device')return '<b>Новое устройство · '+who+' · '+vmcHm(f.at)+'</b>';
  if(f.kind==='money')return '<b>Ночное денежное действие · '+who+' · '+vmcHm(f.at)+'</b><br>'+esc(d.action||'');
  return esc(f.kind);
}
function vmcAccHtml(){
  const a=VMC.acc;if(!a||!a.length)return '';
  return '<div class="card vmc-flags"><h2>Входы и деньги</h2>'+a.map(f=>'<div class="chk bad"><i>!</i><div>'+vmcAccLine(f)+'<br><button class="btn sec small" data-vmact="accres" data-key="'+esc(f.key)+'">Это я / знаю</button></div></div>').join('')+'</div>';
}
function vmFlagsHtml(){
  return vmcAccHtml()+vmVmHtml();
}
function vmVmHtml(){
  if(VMC.err)return '<div class="card"><p class="hint">'+esc(VMC.err)+'</p></div>';
  const f=VMC.flags;if(!f||!f.length)return '';
  return '<div class="card vmc-flags"><h2>Сверка с Vetmanager</h2>'+f.map(x=>'<div class="chk bad"><i>!</i><div><b>'+esc(vmcBranch(x.branch))+' · '+esc(vmcDate(x.date))+' · '+esc(VMC_FIELD[x.field]||x.field)+'</b><br>'
    +(x.verdict==='mismatch'?'В отчёте '+vmcRub(x.report)+', в Vetmanager '+vmcRub(x.vm)+', разница '+vmcRub(x.diff):'Не удалось сверить: '+esc(x.reason||'нет данных'))
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
