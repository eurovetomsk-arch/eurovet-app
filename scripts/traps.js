'use strict';
/* ====== 2.0 · Ловушки отчёта администратора (свод §14). Карточка cards/004.
   Не трогает compute() и validate() (они байт-в-байт как в 1.92). Срабатывает при нажатии «Отправить отчёт»,
   после validate() и «В смене не было ассистента?». Ответы админа сохраняются в данных отчёта и видны руководителю. ====== */
const TRAP_SCHED={key:'',rows:null,err:null};
const trapNorm=s=>String(s||'').toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я]/g,'');
function trapReportNames(){
  const f=S.form,c=S.ctx||{},by=(arr,id)=>(arr||[]).find(x=>String(x.id)===String(id))||{};
  const names=[];
  Object.keys(f.admins||{}).forEach(id=>names.push(by(c.admins,id).name));
  Object.keys(f.doctors||{}).forEach(id=>names.push(by(c.doctors,id).name));
  Object.keys(f.assistants||{}).forEach(k=>{const[role,id]=k.split(':');const a=(c.assistants||[]).find(x=>x.role===role&&String(x.id)===id)||{};names.push(a.name)});
  return names.filter(Boolean).map(trapNorm);
}
async function trapLoadSched(){
  const key=S.branch+'|'+S.date;
  if(TRAP_SCHED.key===key&&(TRAP_SCHED.rows||TRAP_SCHED.err))return;
  TRAP_SCHED.key=key;TRAP_SCHED.rows=null;TRAP_SCHED.err=null;
  try{const r=await rpc('ev_whos_where',{p_token:S.token,p_from:S.date,p_to:S.date},8000);
    if(r&&r.ok)TRAP_SCHED.rows=(r.shifts||r.rows||[]).filter(x=>String(x.branch)===String(S.branch)&&String(x.date)===String(S.date));
    else TRAP_SCHED.err='нет графика';
  }catch(e){TRAP_SCHED.err='нет связи'}
}
/* Ловушка 1: по графику работает, а в отчёте нет. Возвращает первого неотвеченного. График недоступен — проверка пропускается
   (график — отдельный контур, отчёт и деньги от него не зависят). */
function trapSchedMissing(){
  if(!TRAP_SCHED.rows)return null;
  const inRep=new Set(trapReportNames()),answered=new Set((S.form.sched_absent||[]).map(trapNorm));
  return TRAP_SCHED.rows.find(x=>x.name&&!inRep.has(trapNorm(x.name))&&!answered.has(trapNorm(x.name)))||null;
}
/* Ловушка 6: расход из кассы без комментария (кроме «Инкассация МР» — её сверяет ловушка 5) */
function trapExpenseErrors(){
  return (S.form.expenses||[]).map((e,i)=>e.article&&e.article!=='Инкассация МР'&&(e.comment||'').trim().length<3?'Расход №'+(i+1)+' «'+e.article+'»: напишите в комментарии, на что потрачено':null).filter(Boolean);
}
/* Ловушка 7: аптека с нулём при открытом филиале */
function trapPharmZero(){return N(S.form.ph_val)===0&&S.form.pharmacy_closed!==true}
/* Возвращает true — можно отправлять; false — показан вопрос или ошибки */
async function trapGate(){
  const errs=trapExpenseErrors();
  if(errs.length){S.formErrors=errs;render();setTimeout(()=>{const e=document.getElementById('form-errors');if(e)e.scrollIntoView({behavior:'smooth',block:'start'})},0);toast('Исправьте перед отправкой',5000);return false}
  if(trapPharmZero()){
    overlay('<h2>Аптека не работала?</h2><p class="hint">В отчёте вал аптеки 0 ₽. Подтвердите, что аптека сегодня не работала, или внесите выручку аптеки.</p><button class="btn" data-act="trap-pharm-closed">Да, аптека не работала</button><button class="btn sec" style="margin-top:8px" data-act="trap-pharm-fill">Внести выручку аптеки</button>');
    return false;
  }
  await trapLoadSched();
  const miss=trapSchedMissing();
  if(miss){
    overlay('<h2>Работал по графику?</h2><p class="hint">По графику сегодня работает <b>'+esc(miss.name)+'</b>, его нет в отчёте. Работал?</p><button class="btn" data-act="trap-sched-add">Да, работал — добавлю в отчёт</button><button class="btn sec" style="margin-top:8px" data-act="trap-sched-absent" data-name="'+esc(miss.name)+'">Нет, не работал</button>');
    return false;
  }
  return true;
}
/* Что добавить в данные отчёта (деньги не меняет: функции расчёта эти поля не читают) */
function trapData(){
  const d={};
  if(S.form.pharmacy_closed===true&&N(S.form.ph_val)===0)d.pharmacy_closed=true;
  if((S.form.sched_absent||[]).length)d.sched_absent=S.form.sched_absent.slice();
  return d;
}
async function trapAct(act,b){
  switch(act){
    case'trap-pharm-closed':S.form.pharmacy_closed=true;saveDraft();closeOv();await submit();return true;
    case'trap-pharm-fill':closeOv();setTimeout(()=>{const e=document.querySelector('.k-pharm');if(e)e.scrollIntoView({behavior:'smooth',block:'start'})},0);return true;
    case'trap-sched-absent':(S.form.sched_absent=S.form.sched_absent||[]).push(b.dataset.name||'');saveDraft();closeOv();await submit();return true;
    case'trap-sched-add':closeOv();setTimeout(()=>{const e=document.querySelector('.k-staff');if(e)e.scrollIntoView({behavior:'smooth',block:'start'})},0);return true;
  }
  return false;
}
/* Строки для руководителя в отчёте дня */
function trapSummaryLines(d){
  const L=[];
  if(d&&d.pharmacy_closed)L.push('Аптека не работала — подтверждено администратором');
  if(d&&Array.isArray(d.sched_absent)&&d.sched_absent.length)L.push('По графику, но не работали (ответ администратора): '+d.sched_absent.join(', '));
  return L;
}
