'use strict';
/* ====== Форма ====== */
const emptyForm=()=>({admins:{},doctors:{},others:[],total:'',cash:'',cashless:'',ph_val:'',ph_cash:'',ph_cashless:'',
  open:'',expenses:[],close:'',assistants:{},no_assistant:false,note:'',adv_cash:'',adv_cashless:'',adv_out:'',comp:'',cert:'',nc_comment:'',debt:'',debt_comment:'',repaid:'',diff_reason:'',corr_reason:''});
/* L34a: черновик правки руководителя — отдельный ключ (буква h), не смешивается с черновиком админа на том же телефоне */
const draftKey=()=>'ev_draft2:'+(S.headFix?'h':'')+(S.person?S.person.id:0)+':'+S.branch+':'+S.date;
const HEAD_REASON_MIN=15; // сервер: руководитель после окна — причина от 15 знаков
const corrMin=()=>S.headFix?HEAD_REASON_MIN:3;
/* L34a: «Исправить отчёт» — руководитель открывает сданную версию в обычной форме */
// сервер (ev_submit, date_range) принимает отчёт не старше 7 дней — и от руководителя тоже
function headFixDateOk(){const t=new Date(omskToday()+'T00:00:00Z');t.setUTCDate(t.getUTCDate()-7);return S.date>=t.toISOString().slice(0,10)}
function headFix(){
  if(!isHead()||!S.ctx||!S.ctx.current||!headFixDateOk())return;
  S.roHead=false;S.headFix=true;S.formErrors=[];
  /* черновик правки берём, только если он моложе сданной версии; иначе он сделан по старой версии — выбрасываем */
  let d=LS.get(draftKey());const sub=Date.parse(S.ctx.current.submitted_at||'')||0;
  if(d&&!(d.ts>sub)){LS.del(draftKey());d=null}
  if(d&&d.form){S.form=Object.assign(emptyForm(),d.form);S.draftTs=d.ts||Date.now()}
  else{S.form=formFromReport(S.ctx.current.data);S.draftTs=null}
  render();
  setTimeout(()=>{const e=document.querySelector('[data-p="corr_reason"]');if(e)e.scrollIntoView({behavior:'smooth',block:'center'})},0);
}
let draftT;
function freshForm(){
  const f=emptyForm(),ctx=S.ctx;
  if(ctx&&ctx.prev&&ctx.prev.closing!=null)f.open=String(ctx.prev.closing);
  if(S.person&&ctx&&ctx.admins.some(a=>a.id===S.person.id))f.admins[S.person.id]={left:'',came:''};
  return f;
}
function saveDraft(){clearTimeout(draftT);draftT=setTimeout(()=>{if(S.form&&S.view==='form')LS.set(draftKey(),{ts:Date.now(),form:S.form})},300)}

function formFromReport(d){ // загрузка ранее сданной версии для исправления
  const f=emptyForm(),s=v=>(v==null?'':String(v));
  (d.admins||[]).forEach(a=>f.admins[a.id]={left:a.left||'',came:a.came||''});
  (d.doctors||[]).forEach(x=>f.doctors[x.id]={val:s(x.val)});
  f.others=(d.others||[]).map(o=>({title:o.title||'',val:s(o.val)}));
  f.total=s(d.total);f.cash=s(d.cash);f.cashless=s(d.cashless);
  f.ph_val=s(d.pharmacy&&d.pharmacy.val);f.ph_cash=s(d.pharmacy&&d.pharmacy.cash);f.ph_cashless=s(d.pharmacy&&d.pharmacy.cashless);
  f.open=s(d.cashbox&&d.cashbox.opening);f.close=s(d.cashbox&&d.cashbox.closing);
  f.expenses=((d.cashbox&&d.cashbox.expenses)||[]).map(e=>({article:e.article||'',amount:s(e.amount),comment:e.comment||'',method:e.method||(isRet(e.article||'')?'cash':'')}));
  (d.assistants||[]).forEach(a=>f.assistants[a.role+':'+a.id]={fn:a.fix_normal||0,fx:a.fix_xray||0,left:a.left||'',came:a.came||''});
  f.no_assistant=!!d.no_assistant&&!Object.keys(f.assistants).length;
  f.note=d.note||'';f.adv_cash=s(d.advance_cash);f.adv_cashless=s(d.advance_cashless);f.adv_out=s(d.advance_out);f.comp=s(d.noncash&&d.noncash.bonus);f.cert=s(d.noncash&&d.noncash.certificate);f.nc_comment=(d.noncash&&d.noncash.comment)||'';f.debt=s(d.debt);f.debt_comment=d.debt_comment||'';f.repaid=s(d.debt_repaid);f.diff_reason=d.diff_reason||'';
  return f;
}

/* v1.29: возврат клиенту бывает наличными (из кассы) и безналичным (из кассы не вычитается) */
const isRet=a=>a==='Возврат клиника'||a==='Возврат аптека';
const isNcRet=e=>isRet(e.article)&&e.method==='noncash';
/* ====== Проверки (только подсвечивают, числа никогда не правят) ====== */
function compute(){
  const f=S.form,c=S.ctx;
  const sumDocs=r2(Object.values(f.doctors).reduce((a,d)=>a+N(d.val),0)+f.others.reduce((a,o)=>a+N(o.val),0));
  const total=N(f.total),cash=N(f.cash),cashless=N(f.cashless);
  const phv=N(f.ph_val),phc=N(f.ph_cash),phn=N(f.ph_cashless);
  const exp=r2(f.expenses.filter(e=>!isNcRet(e)).reduce((a,e)=>a+N(e.amount),0));
  const expNc=r2(f.expenses.filter(isNcRet).reduce((a,e)=>a+N(e.amount),0));
  const comp=N(f.comp),cert=N(f.cert),nc=r2(comp+cert);
  const open=N(f.open);
  /* v1.45: с 29.10 «нал» и «безнал» — факт денег за день (касса и терминал), аванс принят/списан отдельно */
  const advNew=S.date>='2026-10-29';
  const advc=advNew?0:N(f.adv_cash);
  const advAdj=advNew?r2(N(f.adv_cash)+N(f.adv_cashless)-N(f.adv_out)):0;
  const expected=r2(open-exp+cash+phc+advc-nc);
  const checks=[];
  const add=(id,label,diff,ready,detail,miss='')=>checks.push({id,label,ready,diff:r2(diff),ok:ready&&Math.abs(diff)<=CFG.tol,detail,miss});
  const ms=a=>a.filter(Boolean).join(', ');
  add('docs','Сумма врачей = Клиника общая',sumDocs-total,f.total!==''&&(Object.keys(f.doctors).length>0||f.others.length>0),'врачи '+money(sumDocs)+' vs общая '+money(total),
    ms([f.total===''&&'«Клиника общая»',!(Object.keys(f.doctors).length>0||f.others.length>0)&&'отметьте врачей и введите их вал']));
  const repaid=N(f.repaid);
  add('pay','Нал + безнал'+(advNew?' − аванс принят + аванс списан':'')+(repaid>0?' − погашенный долг':'')+' = Клиника общая',cash+cashless-repaid-advAdj-total,f.total!==''&&(f.cash!==''||f.cashless!==''),'нал '+money(cash)+' + безнал '+money(cashless)+(advNew?' − аванс принят '+money(N(f.adv_cash)+N(f.adv_cashless))+' + списан '+money(N(f.adv_out)):'')+(repaid>0?' − погашение долга '+money(repaid):'')+' vs общая '+money(total),
    ms([f.total===''&&'«Клиника общая»',(f.cash===''&&f.cashless==='')&&'«Нал» и «Безнал»']));
  const phAny=f.ph_val!==''||f.ph_cash!==''||f.ph_cashless!=='';
  add('pharm','Аптека: нал + безнал = вал аптеки',phc+phn-phv,phAny,'нал '+money(phc)+' + безнал '+money(phn)+' vs вал '+money(phv),
    'вал, нал и безнал аптеки (если аптека не работала, оставьте пустыми — пункт можно не учитывать)');
  add('box','Итог инкассации = начало − расходы + нал (клиника+аптека) + аванс наличными − компенсации и сертификаты',N(f.close)-expected,f.close!==''&&f.open!=='','по расчёту '+money(expected)+(advc||nc?' (аванс наличными '+money(advc)+(nc?', без денег −'+money(nc):'')+')':'')+', введено '+money(N(f.close)),
    ms([f.open===''&&'«Начало смены»',f.close===''&&'«Итог инкассации» (сколько наличных в кассе)']));
  if(nc>0)add('nc','Компенсации и сертификаты не больше нал + аванс наличными',Math.max(0,nc-(cash+phc+advc)),true,'без денег '+money(nc)+' vs нал клиники+аптеки+аванс '+money(cash+phc+advc));
  const prev=c&&c.prev&&c.prev.closing!=null?Number(c.prev.closing):null;
  if(prev!=null)add('prev','Начало = итог за '+ruDate(c.prev.date),open-prev,f.open!=='','вчера итог '+money(prev)+', принято на начало '+money(open),'«Начало смены»');
  return{checks,sumDocs,exp,expNc,expected,total,cash,cashless};
}

function validate(){
  const f=S.form,errs=[];
  const need=(k,l)=>{const v=num(f[k]);if(v==null||isNaN(v))errs.push(l)};
  if(!Object.keys(f.admins).length)errs.push('Отметьте, кто работал администратором');
  need('total','«Клиника общая»');need('cash','«Нал клиники»');need('cashless','«Безнал клиники»');need('open','«Начало смены»');need('close','«Итог инкассации»');
  // 2872: an unavailable handover must not prevent the daily report.
  const LBL={ph_val:'Вал аптеки',ph_cash:'Нал аптеки',ph_cashless:'Безнал аптеки',adv_cash:'Аванс принят наличными',debt:'Долг клиентов',repaid:'Погашен прошлый долг',adv_cashless:'Аванс принят безналично',adv_out:'Аванс списан',comp:'Компенсация клиенту',cert:'Оплата сертификатом'};
  Object.keys(LBL).forEach(k=>{if(isNaN(num(f[k])))errs.push('Некорректное число в поле «'+LBL[k]+'»')});
  Object.entries(f.doctors).forEach(([id,d])=>{const v=num(d.val);if(v==null||isNaN(v))errs.push('Не заполнен вал врача: '+(docName(id)||id))});
  f.others.forEach((o,i)=>{const v=num(o.val);if(!o.title.trim()||v==null||isNaN(v))errs.push('Строка «не из списка» №'+(i+1)+': нужно название и сумма')});
  f.expenses.forEach((e,i)=>{const v=num(e.amount);if(!e.article||v==null||isNaN(v))errs.push('Расход №'+(i+1)+': выберите статью и введите сумму');
    if(isRet(e.article)&&e.method!=='cash'&&e.method!=='noncash')errs.push('Расход №'+(i+1)+': выберите, как вернули деньги — наличными или безналично');
    if(e.article==='Другое'&&(e.comment||'').trim().length<3)errs.push('Расход №'+(i+1)+' «Другое»: напишите в комментарии, на что потрачено')});
  if((N(f.comp)>0||N(f.cert)>0)&&!(f.nc_comment||'').trim())errs.push('Компенсация / сертификат: укажите причину (без ФИО клиента)');
  Object.entries(f.assistants).forEach(([k,a])=>{if(!isFinite(a.fn)||!isFinite(a.fx))errs.push('Фиксации ассистента')});
  const calc=compute();
  const red=calc.checks.filter(c=>c.ready&&!c.ok);
  if(red.length&&!f.diff_reason.trim())errs.push('Есть расхождения — напишите причину внизу формы');
  if(S.ctx.current&&f.corr_reason.trim().length<corrMin())errs.push(S.headFix?'Причина исправления — не короче '+HEAD_REASON_MIN+' знаков (сейчас '+f.corr_reason.trim().length+'): что исправили и почему':'Отчёт уже сдан — укажите причину исправления');
  return{errs,calc,red};
}
const aNm=n=>String(n==null?'':n).replace(/\s+[А-ЯЁ]\.(?:\s?[А-ЯЁ]\.)?$/,'');
const docName=id=>{const d=S.ctx&&S.ctx.doctors.find(x=>String(x.id)===String(id));return d&&d.name};

function buildData(calc){
  const f=S.form,c=S.ctx;
  const byId=(arr,id)=>arr.find(x=>String(x.id)===String(id));
  const admins=Object.keys(f.admins).map(id=>({id:Number(id),name:(byId(c.admins,id)||{}).name,left:f.admins[id].left||null,came:f.admins[id].came||null}));
  const doctors=Object.keys(f.doctors).map(id=>{const d=byId(c.doctors,id)||{};return{id:Number(id),name:d.name,vm_id:d.vm_id,val:N(f.doctors[id].val)}});
  const assistants=Object.keys(f.assistants).map(k=>{const[role,id]=k.split(':');const a=c.assistants.find(x=>x.role===role&&String(x.id)===id)||{};const v=f.assistants[k];
    return{id:Number(id),name:aNm(a.name),role,fix_normal:v.fn|0,fix_xray:v.fx|0,left:v.left||null,came:v.came||null}});
  return{
    schema:1,app:CFG.appVer,branch:S.branch,date:S.date,
    admins,doctors,
    others:f.others.map(o=>({title:o.title.trim(),val:N(o.val)})),
    total:N(f.total),cash:N(f.cash),cashless:N(f.cashless),
    pharmacy:{val:N(f.ph_val),cash:N(f.ph_cash),cashless:N(f.ph_cashless)},
    cashbox:{opening:N(f.open),
      expenses:f.expenses.map(e=>({article:e.article,amount:N(e.amount),comment:(e.comment||'').trim()||null,method:isRet(e.article)?e.method:'cash'})),
      closing:N(f.close),expected_closing:calc.expected,prev_closing:(c.prev&&c.prev.closing!=null)?Number(c.prev.closing):null},
    assistants,no_assistant:assistants.length===0&&f.no_assistant===true,
    fix_totals:{normal:assistants.reduce((a,x)=>a+x.fix_normal,0),xray:assistants.reduce((a,x)=>a+x.fix_xray,0)},
    debt:f.debt===''?null:N(f.debt),debt_comment:(f.debt_comment||'').trim()||null,debt_repaid:f.repaid===''?null:N(f.repaid),
    advance_cash:f.adv_cash===''?null:N(f.adv_cash),advance_cashless:f.adv_cashless===''?null:N(f.adv_cashless),advance_out:f.adv_out===''?null:N(f.adv_out),
    noncash:(N(f.comp)>0||N(f.cert)>0)?{bonus:N(f.comp),certificate:N(f.cert),comment:(f.nc_comment||'').trim()}:null,
    note:f.note.trim()||null,diff_reason:f.diff_reason.trim()||null,
    checks:calc.checks.filter(x=>x.ready).map(x=>({id:x.id,ok:x.ok,diff:x.diff}))
  };
}

/* ====== Отправка и очередь ====== */
let flushing=false,wantAgain=false;const flushRef={c:null};
async function flush(auto){
  if(flushing||!S.queue.length)return;
  if(!S.token){if(!auto)render();return} // 1.64: фоновая отправка без входа НЕ перерисовывает экран входа (раньше раз в 8 с стирала PIN)
  flushing=true;
  const sig=()=>S.queue.map(x=>x.uid+(x.status==='new'?'offline':x.status)).join()+S.online;const sig0=sig();
  try{
    for(const it of S.queue.slice()){
      if(it.status==='needs_reason')continue;
      if(auto&&it.status==='error')continue; // ошибки сервера сами не повторяем, только по кнопке
      let res;
      try{
        res=await rpc('ev_submit',{p_token:S.token,p_branch:it.branch,p_date:it.date,p_data:it.data,p_device:DEV,p_client_time:it.client_time,p_client_uid:it.uid,p_reason:it.reason||null},12000,flushRef);
      }catch(e){
        if(e.net){it.status='offline';if(S.online){S.online=false;setHeader()}break}
        it.status='error';it.err='HTTP '+e.http;continue;
      }
      if(!S.online){S.online=true;setHeader()}
      if(res.ok){
        S.queue=S.queue.filter(x=>x.uid!==it.uid);saveQueue();
        if(S.done&&S.done.uid===it.uid&&typeof vmwStart==='function'){vmwStart(it.branch,it.date,Number(res.version)||0,!!(it.data&&Array.isArray(it.data.doctors)&&it.data.doctors.length))}   /* 2.0: экран «Ожидайте сверки» */
        else{try{vmcAfterSubmit(it.branch,it.date,Number(res.version)||0)}catch(e){}}
        if(S.done&&S.done.uid===it.uid){S.done.sent=true;S.done.version=res.version||S.done.version;S.flags=null;loadFlags(it.branch,it.date)}
      }else if(res.error==='session'){
        S.token=null;LS.del('ev_token');S.view='login';it.status='need_login';break;
      }else if(res.error==='reason_required'){it.status='needs_reason';it.minLen=Number(res.min_len)||null} /* L34a: сервер говорит, сколько знаков нужно */
      else if(res.error==='conflict'){it.status='offline'}
      else{it.status='error';it.err=res.error==='date_range'?'дата старше 7 дней, такой отчёт подать нельзя, напишите руководителю':res.error==='window_closed'?'Время правки вышло (до 12:00 следующего дня). Напишите руководителю':res.error==='person_two_branches'?'Один человек не может быть в отчётах двух филиалов в один день: '+((res.people||[]).join(', ')||'проверьте состав смены')+'. Исправьте состав и отправьте снова':res.error}
    }
  }finally{
    flushing=false;saveQueue();
    // автоповтор не должен перерисовывать форму, пока человек печатает: рисуем только если что-то изменилось
    if(!auto||sig()!==sig0)render();
    if(wantAgain){wantAgain=false;setTimeout(()=>{resetOffline();flush()},300)}
  }
}
function resetOffline(){S.queue.forEach(x=>{if(x.status==='offline')x.status='new'})}
// «пнуть» отправку: вернулась связь, приложение снова на экране, нажата кнопка
function kick(){
  if(S.queue.length){
    if(flushing){wantAgain=true;try{flushRef.c&&flushRef.c.abort()}catch(e){}}
    else{resetOffline();flush()}
  }
  kickHandover();
}

async function submit(){
  const v=validate();
  if(v.errs.length){S.formErrors=v.errs.slice();render();setTimeout(()=>{const e=document.getElementById('form-errors');if(e)e.scrollIntoView({behavior:'smooth',block:'start'})},0);toast('Проверьте обязательные поля',5000);return}
  S.formErrors=[];
  if(!Object.keys(S.form.assistants).length&&S.form.no_assistant!==true){
    overlay('<h2>В смене не было ассистента?</h2><p class="hint">Подтвердите это отдельно или вернитесь к форме и добавьте ассистента. Без выбора отчёт не отправится.</p><button class="btn" data-act="assistantnone">Да, не было</button><button class="btn sec" style="margin-top:8px" data-act="assistantadd">Добавить ассистента</button>');
    return;
  }
  if(!(await trapGate()))return; /* 2.0: ловушки отчёта (traps.js) */
  const data=Object.assign(buildData(v.calc),trapData());
  const it={uid:uid(),branch:S.branch,date:S.date,data,reason:S.ctx.current?S.form.corr_reason.trim():null,
    client_time:new Date().toISOString(),status:'new',branchTitle:(BRANCHES.find(b=>b.id===S.branch)||{}).title,
    summary:summaryText(data)};
  S.queue.push(it);
  if(!saveQueue()){toast('Не удалось сохранить на устройстве! Скопируйте итоги вручную.',8000)}
  LS.del(draftKey());
  S.done={uid:it.uid,sent:false,version:null,summary:it.summary,branch:it.branchTitle,date:S.date};
  S.view='done';render();
  await flush();
}

function summaryText(d){
  const L=[];const bt=(BRANCHES.find(b=>b.id===d.branch)||{}).title;
  L.push('ЕВРОВЕТ '+bt+' — '+ruDate(d.date));
  L.push('Админ: '+d.admins.map(a=>a.name+(a.came?' (пришёл '+a.came+')':'')+(a.left?' (ушёл '+a.left+')':'')).join(', '));
  d.doctors.forEach(x=>L.push(x.name+': '+x.val));
  d.others.forEach(x=>L.push(x.title+': '+x.val));
  L.push('Клиника общая: '+d.total);L.push('Нал: '+d.cash+'  Безнал: '+d.cashless);
  L.push('Аптека: вал '+d.pharmacy.val+', нал '+d.pharmacy.cash+', безнал '+d.pharmacy.cashless);
  L.push('Касса на начало смены: '+d.cashbox.opening);
  d.cashbox.expenses.forEach(e=>L.push('Расход '+e.article+': '+e.amount+(isRet(e.article)?(e.method==='noncash'?' безналично (из кассы не вычитается)':' наличными'):'')+(e.comment?' ('+e.comment+')':'')));
  if(d.debt>0||d.debt_repaid>0)L.push('Долги клиентов: не оплачено '+(d.debt||0)+(d.debt_comment?' ('+d.debt_comment+')':'')+', погашено прошлых '+(d.debt_repaid||0));
  if(d.noncash)L.push('Без денег в кассе: компенсации '+d.noncash.bonus+', сертификаты '+d.noncash.certificate+' ('+d.noncash.comment+')');
  if(d.advance_cash!=null||d.advance_cashless!=null||d.advance_out!=null)L.push('Аванс: принят нал '+(d.advance_cash||0)+', безнал '+(d.advance_cashless||0)+', списан '+(d.advance_out||0));
  L.push('Инкасс. итог: '+d.cashbox.closing);
  d.assistants.forEach(a=>L.push('Ассистент '+aNm(a.name)+': фикс. '+a.fix_normal+', рентген '+a.fix_xray+(a.came?', пришёл '+a.came:'')+(a.left?', ушёл '+a.left:'')));
  if(d.no_assistant)L.push('Ассистентов в смене не было — подтверждено администратором');
  if(typeof trapSummaryLines==='function')trapSummaryLines(d).forEach(x=>L.push(x));
  if(d.note)L.push('Примечание: '+d.note);
  if(d.diff_reason)L.push('Причина расхождений: '+d.diff_reason);
  return L.join('\n');
}


/*HELP_START*/const HELP_HTML="<p class=\"hint\">Имена и цифры на картинках вымышленные. У вас будут свои. Ниже те же шаги, что в бумажной инструкции. Кружок «?» рядом с полем объяснит каждое поле.</p><a class=\"btn sec\" style=\"display:block;text-align:center;text-decoration:none;margin:8px 0\" href=\"help/instruktsiya.pdf\" target=\"_blank\" rel=\"noopener\">Открыть PDF для печати</a><section class=\"hs\"><h3>Что это и зачем</h3><p>Раньше отчёт за день нужно было считать вручную и вносить в таблицу. Теперь его можно заполнить один раз в телефоне. Приложение само сложит суммы, проверит кассу и покажет, где что-то не сходится. Вашу зарплату за период оно тоже считает само.</p><ul><li>Вы вводите цифры так же, как раньше: вал врачей, нал и безнал, аптеку, кассу.</li><li>Приложение ничего не меняет в ваших цифрах. Оно только показывает зелёным «сходится» или красным «не сходится».</li><li>Первое время вы заполняете и старую форму, и это приложение. Это нужно, чтобы вместе убедиться, что всё работает. Ошибка в новой программе никого не наказывает.</li></ul></section><section class=\"hs\"><h3>Шаг 1. Поставьте приложение на телефон</h3><p>Приложение открывается по адресу в интернете: https://eurovetomsk-arch.github.io/eurovet-app/ . Чтобы значок был на экране, как у обычной программы, добавьте его на главный экран. Это делается один раз.</p><ul><li>iPhone: откройте адрес в браузере Safari (синий компас). Внизу нажмите кнопку «Поделиться» (квадрат со стрелкой вверх). Пролистайте список и выберите «На экран “Домой”». Нажмите «Добавить».</li><li>Android: откройте адрес в Chrome. Нажмите три точки в правом верхнем углу. Выберите «Установить приложение» или «Добавить на главный экран». Подтвердите.</li><li>Компьютер: откройте адрес в Chrome или Edge. Установка не нужна: просто добавьте страницу в закладки (Ctrl+D). Работает точно так же.</li><li>Если не получилось установить: ничего страшного. Просто открывайте адрес в браузере каждый раз. Все функции те же.</li><li>Значок с бирюзовой эмблемой появится среди приложений. Дальше открывайте приложение с него.</li></ul><div class=\"htip\">Яндекс Браузер и Samsung Internet тоже подойдут: ищите в меню браузера пункт «Добавить на главный экран».</div></section><section class=\"hs\"><h3>Шаг 2. Войдите</h3><p>PIN вам выдал Руководитель. Он только ваш: никому его не говорите и не пишите на бумажках в клинике.</p><img src=\"help/02_pin.jpg\" alt=\"Пример экрана: Шаг 2. Войдите\" loading=\"lazy\"><ol class=\"hl2\"><li><b>1</b><span>Нажмите на свою фамилию. Она станет цветной.</span></li><li><b>2</b><span>Введите свой PIN: 6 цифр. Он показывается точками.</span></li><li><b>3</b><span>Нажмите «Войти».</span></li><li><b>4</b><span>Кнопка «Как заполнять отчёт»: эта инструкция открывается без PIN, если вы забыли, что куда вносить.</span></li></ol><ul><li>Выберите свою фамилию, введите PIN и нажмите «Войти».</li><li>Если ошиблись PIN 5 раз подряд, вход закроется на 15 минут. Подождите и попробуйте снова.</li><li>Забыли PIN: напишите руководителю, он выдаст новый.</li><li>Сменить PIN на свой можно в любой момент: «Меню» → «Сменить PIN».</li></ul></section><section class=\"hs\"><h3>Шаг 3. Выберите дату и клинику</h3><p>Это нужно, чтобы отчёт попал в нужный день и в нужную клинику.</p><img src=\"help/03_branch.jpg\" alt=\"Пример экрана: Шаг 3. Выберите дату и клинику\" loading=\"lazy\"><ol class=\"hl2\"><li><b>1</b><span>Дата отчёта. По умолчанию сегодня. Если вносите отчёт за прошлый день, поставьте нужную дату (можно до 7 дней назад).</span></li><li><b>2</b><span>Нажмите на клинику, где вы работали.</span></li></ol><ul><li>Проверьте дату. Для сегодняшнего отчёта её менять не нужно.</li><li>Нажмите на название клиники.</li></ul></section><section class=\"hs\"><h3>Шаг 4. Смена и вал врачей</h3><p>Вал врача — это сумма его проведённых и полностью оплаченных счетов за день в Vetmanager. Цифры берите оттуда, откуда брали для старой формы.</p><img src=\"help/04_shift_doctors.jpg\" alt=\"Пример экрана: Шаг 4. Смена и вал врачей\" loading=\"lazy\"><ol class=\"hl2\"><li><b>1</b><span>Нажмите на себя в блоке «Смена». Если вы вошли в приложение, вы уже отмечены.</span></li><li><b>2</b><span>Время «Ушёл в» заполняйте только если ушли позже 21:00. Переработку считает приложение.</span></li><li><b>3</b><span>Нажмите на врачей, которые работали в этот день. Они станут цветными с галочкой.</span></li><li><b>4</b><span>Введите вал каждого врача из Vetmanager (в рублях).</span></li><li><b>5</b><span>Врач-замена или сумма, которой нет в списке: нажмите эту кнопку и впишите, кто это и сколько.</span></li></ol><ul><li>В блоке «Смена» должны быть отмечены вы. В смене один администратор.</li><li>В блоке «Вал врачей» отметьте работавших врачей и введите вал каждого.</li><li>Внизу блока приложение само покажет «Сумма врачей».</li></ul><div class=\"htip\">Не уверены, что значит поле? Нажмите на кружок «?» рядом с названием: появится короткое объяснение.</div></section><section class=\"hs\"><h3>Шаг 5. Клиника и аптека</h3><p>Эти числа приложение потом сверит с суммой по врачам и с оплатами. Нал и безнал вместе должны давать общий вал.</p><img src=\"help/05_clinic_pharmacy.jpg\" alt=\"Пример экрана: Шаг 5. Клиника и аптека\" loading=\"lazy\"><ol class=\"hl2\"><li><b>1</b><span>Общий вал клиники за день по Vetmanager.</span></li><li><b>2</b><span>Сколько из него оплатили наличными.</span></li><li><b>3</b><span>Сколько оплатили безналично (карты, переводы).</span></li><li><b>4</b><span>Вал аптеки за день.</span></li><li><b>5</b><span>Из него наличными.</span></li><li><b>6</b><span>Из него безналично.</span></li></ol><ul><li>Введите вал клиники, затем нал и безнал.</li><li>Введите вал аптеки, нал аптеки и безнал аптеки. Если аптека сегодня не работала, оставьте поля пустыми.</li><li>В вал клиники входят все услуги за день, в том числе оплаченные с аванса. Деньги, положенные на аванс, в вал не входят.</li></ul></section><section class=\"hs\"><h3>Шаг 6. Авансы, компенсации и сертификаты</h3><p>Если в этот день не было авансов, компенсаций и сертификатов, просто пропустите весь шаг: поля оставьте пустыми.</p><img src=\"help/06_advance_comp.jpg\" alt=\"Пример экрана: Шаг 6. Авансы, компенсации и сертификаты\" loading=\"lazy\"><ol class=\"hl2\"><li><b>1</b><span>Аванс, принятый наличными.</span></li><li><b>2</b><span>Аванс, принятый безналично.</span></li><li><b>3</b><span>Сколько из авансов ушло на оплату счетов.</span></li><li><b>4</b><span>Компенсация или бонус клиенту от клиники: в Vetmanager наличные есть, а денег в кассе нет.</span></li><li><b>5</b><span>Оплата подарочным сертификатом, в Vetmanager проходит как наличные.</span></li><li><b>6</b><span>Причина. Пишите без фамилии клиента.</span></li></ol><ul><li>Авансы вносите так, как они показаны в Vetmanager.</li><li>Блок «Компенсации и сертификаты» нужен, когда Vetmanager показал наличные, а настоящих денег в кассе нет. Сумму оставьте и в «Нал», и в авансе, как в Vetmanager: приложение само вычтет её из кассы.</li><li>Если вписали сумму, обязательно напишите причину.</li></ul></section><section class=\"hs\"><h3>Шаг 7. Касса (инкассация)</h3><p>Приложение считает, сколько наличных должно быть в кассе, и сравнивает с тем, что вы насчитали руками. Если числа разные, оно покажет, на сколько.</p><img src=\"help/07_cash.jpg\" alt=\"Пример экрана: Шаг 7. Касса (инкассация)\" loading=\"lazy\"><ol class=\"hl2\"><li><b>1</b><span>Начальная инкассация: сколько наличных лежало в кассе утром. Приложение подставляет итог вчерашнего отчёта само. Если на деле иначе, исправьте.</span></li><li><b>2</b><span>Расходы из кассы: нажмите «+ Расход».</span></li><li><b>3</b><span>Выберите статью, введите сумму и комментарий.</span></li><li><b>4</b><span>Итог инкассации: сколько наличных в кассе на самом деле сейчас. Пересчитайте деньги и введите число по факту.</span></li></ol><ul><li>Проверьте «Начальную инкассацию». Обычно она уже верная.</li><li>Добавьте все расходы за день: по одной строке на каждый. Выбираете статью, пишете сумму.</li><li>Пересчитайте наличные в кассе и введите «Итог инкассации». Не подгоняйте число под расчёт приложения: вводите то, что есть в кассе.</li><li>Расхождения не бойтесь. Это нормально: главное честно ввести факт.</li></ul><div class=\"htip\">Ошиблись и добавили лишний расход? Нажмите «Удалить расход» в этой строке.</div></section><section class=\"hs\"><h3>Шаг 8. Ассистенты и примечание</h3><p>Это нужно для расчёта доплаты ассистентам.</p><img src=\"help/08_assistants_note.jpg\" alt=\"Пример экрана: Шаг 8. Ассистенты и примечание\" loading=\"lazy\"><ol class=\"hl2\"><li><b>1</b><span>Нажмите на ассистентов, которые работали.</span></li><li><b>2</b><span>Кнопками «+» и «−» поставьте число обычных фиксаций.</span></li><li><b>3</b><span>Так же поставьте число фиксаций на рентгене.</span></li><li><b>4</b><span>Примечание: любое важное замечание по смене, например сломался принтер.</span></li></ol><ul><li>Отметьте ассистентов смены и поставьте им число фиксаций.</li><li>Если ассистент ушёл позже 21:00, впишите время.</li><li>В «Прочее» напишите, если было что-то необычное. Если нет, оставьте пустым.</li></ul></section><section class=\"hs\"><h3>Шаг 9. Проверка: зелёное и красное</h3><p>Блок «Проверка» внизу страницы показывает, сходятся ли ваши цифры друг с другом. Он только подсвечивает, а ваши числа не меняет.</p><img src=\"help/09_check_green.jpg\" alt=\"Пример экрана: Шаг 9. Проверка: зелёное и красное\" loading=\"lazy\"><ol class=\"hl2\"><li><b>1</b><span>Каждая строка проверки. Зелёная галочка: сходится.</span></li><li><b>2</b><span>Внизу слева видно итог: «Расхождений нет» или сколько красных строк.</span></li><li><b>3</b><span>Кнопка «Отправить отчёт».</span></li></ol><ul><li>Зелёная галочка: всё сходится (разница до 10 рублей включительно).</li><li>Красный крестик: не сходится. Под строкой написано, на сколько. Сначала поищите опечатку в своих цифрах.</li><li>Серая строка: пока не хватает данных, под ней написано, чего именно.</li><li>Если красное осталось, потому что цифры верны (так бывает), напишите в «Причине расхождения», почему. Без причины отчёт с красным не отправится.</li></ul></section><section class=\"hs\"><h3>Если есть красная строка</h3><p>Красное не значит, что вы что-то сделали не так. Иногда это опечатка, иногда пересчитали позже, иногда деньги правда не сошлись. Важно написать причину.</p><img src=\"help/10_check_red.jpg\" alt=\"Пример экрана: Если есть красная строка\" loading=\"lazy\"><ol class=\"hl2\"><li><b>1</b><span>Красная строка: итог кассы не сходится, разница −500 ₽.</span></li><li><b>2</b><span>Причина расхождения. Напишите коротко и честно.</span></li></ol><ul><li>Перепроверьте цифры в блоках выше. Если нашли опечатку, исправьте: красное станет зелёным.</li><li>Если не нашли, напишите причину своими словами: «ошибся при пересчёте, пересчитаю утром» или «выдали сдачу из кассы, не записал».</li><li>Нажмите «Отправить отчёт».</li></ul></section><section class=\"hs\"><h3>Кружок «?» с подсказкой</h3><p>Рядом почти с каждым полем есть кружок с вопросом.</p><img src=\"help/11_hint.jpg\" alt=\"Пример экрана: Кружок «?» с подсказкой\" loading=\"lazy\"><ul><li>Нажмите на него: откроется объяснение, что сюда вносить и откуда брать цифру.</li><li>Чтобы закрыть, нажмите «Понятно» или в любое место вне окошка.</li></ul></section><section class=\"hs\"><h3>Шаг 10. Отправьте отчёт</h3><p>Нажмите «Отправить отчёт». Появится зелёное окно «Отчёт принят». Это значит, что отчёт сохранён и дошёл.</p><img src=\"help/12_done.jpg\" alt=\"Пример экрана: Шаг 10. Отправьте отчёт\" loading=\"lazy\"><ol class=\"hl2\"><li><b>1</b><span>«Отчёт принят» с зелёной галочкой, клиникой, датой и версией. Значит, всё сохранилось.</span></li></ol><ul><li>Если на экране написано «Отчёт принят», больше ничего делать не нужно.</li><li>Кнопка «Скопировать итоги» нужна на случай, если связь пропала: можно переслать цифры руководителю сообщением.</li><li>Кнопка «Готово» возвращает на начало.</li></ul></section><section class=\"hs\"><h3>Если пропал интернет</h3><p>Вверху справа есть значок «онлайн» (зелёная точка) или «нет связи» (красная).</p><img src=\"help/14_offline.jpg\" alt=\"Пример экрана: Если пропал интернет\" loading=\"lazy\"><ul><li>Ничего не потеряется: отчёт сохранится на телефоне и сам отправится, когда связь вернётся.</li><li>Пока отчёт не ушёл, вверху будет написано «ждёт: 1». Нажмите на эту надпись, чтобы посмотреть.</li><li>Откройте приложение, когда связь появится, и подождите несколько секунд: отчёт уйдёт сам.</li></ul></section><section class=\"hs\"><h3>Как исправить отправленный отчёт</h3><p>Ошибиться не страшно. Отчёт можно исправить в любой момент, старая версия при этом остаётся в истории.</p><ul><li>Войдите, выберите ту же дату и ту же клинику. Откроется отчёт с вашими прежними цифрами и пометкой, что он уже сдан.</li><li>Исправьте нужные цифры.</li><li>В блоке «Проверка» заполните «Причину исправления отчёта»: коротко, что поменяли и почему.</li><li>Нажмите «Отправить отчёт». Появится «версия 2».</li></ul></section><section class=\"hs\"><h3>Меню</h3><p>Кнопка «Меню» вверху справа.</p><img src=\"help/13_menu.jpg\" alt=\"Пример экрана: Меню\" loading=\"lazy\"><ul><li>«Как заполнять отчёт»: эта инструкция, всегда под рукой.</li><li>«Сменить PIN»: поставьте свой новый PIN из 6 цифр.</li><li>«Выйти»: выйти из приложения. Если телефон только ваш, выходить не обязательно.</li><li>Внизу меню написана версия приложения: если вам нужно что-то спросить, назовите её.</li></ul></section><section class=\"hs\"><h3>Частые вопросы</h3><p><b>Я ввёл цифру неправильно, а уже перешёл дальше.</b><br>Пролистайте вверх и исправьте. Приложение пересчитывает всё само.</p><p><b>Закрыл приложение, не отправив. Всё пропало?</b><br>Нет. Введённые цифры сохраняются на телефоне. При входе приложение предложит восстановить черновик.</p><p><b>Не хватает врача или ассистента в списке.</b><br>Для врача-замены нажмите «+ Врач-замена…» в блоке «Вал врачей». Если человека нет в списках постоянно, напишите руководителю.</p><p><b>Приложение показывает красное, а я уверен, что всё верно.</b><br>Напишите причину и отправьте. Красное никого не наказывает: Руководитель увидит и разберётся.</p><p><b>Вчерашний итог кассы подставился неправильный.</b><br>Исправьте «Начальную инкассацию» вручную. Приложение подсветит разницу, и Руководитель её разберёт.</p><p><b>Нужно внести отчёт за прошлый день.</b><br>На втором экране поставьте нужную дату (до 7 дней назад) и выберите клинику.</p></section><section class=\"hs\"><h3>Первое время: два отчёта сразу</h3><ul><li>Сейчас вы заполняете отчёт в двух местах: по-старому и в этом приложении. Это временно. Когда убедимся, что всё работает без сбоев, Руководитель скажет, что старую форму можно отключить.</li><li>Если в приложении что-то получилось не так, это нормально. Для этого мы и работаем параллельно. Красные строки нужны, чтобы вместе быстро найти причину, а не чтобы кого-то ругать.</li><li>Первое задание: внести в приложение отчёты за 16–24 октября за смены, которые вы отработали. По каждой дате отдельно, начиная с 16-го.</li></ul></section><section class=\"hs\"><h3>Обратная связь</h3><ul><li>Пишите руководителю всё, что мешает или чего не хватает: «кнопка не там», «непонятная подсказка», «хочу, чтобы это считалось само».</li><li>Приложение дорабатывается быстро, вместе с искусственным интеллектом. Ваше замечание может превратиться в улучшение уже на следующей неделе.</li><li>Если что-то сломалось, пришлите скриншот и версию приложения (она внизу меню).</li></ul></section><section class=\"hs\"><h3>Памятка: всё ли вы сделали</h3><ul class=\"hchk\"><li>Вошёл, выбрал дату и клинику.</li><li>Отметил смену, врачей, ввёл вал каждого.</li><li>Ввёл клинику и аптеку: общий вал, нал, безнал.</li><li>Ввёл авансы, компенсации, сертификаты (если были).</li><li>Проверил начало кассы, добавил расходы, ввёл итог инкассации по факту.</li><li>Отметил ассистентов и фиксации.</li><li>Проверил «Проверку»: зелёное или написана причина.</li><li>Нажал «Отправить отчёт», увидел «Отчёт принят».</li></ul></section>";
/*HELP_END*/
const HINTS={
  admins:['Администраторы смены','Отметьте тех, кто работал администратором в этот день. Смена считается с 9:00 до 21:00. Время прихода и ухода вписывайте, только если было иначе, например подмена: пришёл не в 9:00 или ушёл не в 21:00. Вычет или добавку считает система, самому считать не нужно. Добавку за поздний уход руководитель подтверждает отдельно.'],
  docs:['Вал врачей','Вал врача — сумма, которую клиенты реально оплатили по проведённым счетам этого врача за день в Vetmanager. Если счёт оплачен частично, берите только оплаченную часть, остаток вписывается в блок «Долги клиентов». Отметьте работавших врачей и введите вал каждого. Врач-замена или сумма не по списку добавляются отдельной строкой внизу.'],
  others:['Строка не из списка','Нужна, если был врач-замена или есть сумма, которой нет среди врачей выше. Напишите, кто или за что, и сумму. Она войдёт в «Сумма врачей».'],
  total:['Клиника общая','Общий вал клиники за день по Vetmanager: сколько клиенты оплатили по проведённым счетам. Должна совпадать с суммой вала врачей и с «Нал + Безнал». Аванс и неоплаченные долги сюда не входят.'],
  pay:['Деньги клиники','«Наличные клиники» и «Безнал клиники» — все деньги клиники за сегодня, вместе с суммами, положенными на аванс, но без аптеки. Приложение отдельно учтёт, сколько положили на аванс, сколько сняли с аванса и сколько погасили прошлого долга.'],
  pharm:['Аптека','Вал аптеки за день. Нал аптеки + безнал аптеки должны давать вал аптеки. Если аптека сегодня не работала, оставьте поля пустыми.'],
  debt:['Долги клиентов','«Клиника общая» — это то, что клиенты реально оплатили за день. Если по счёту оплачена только часть, в «Клиника общая» и в вал врача идёт оплаченная часть, а неоплаченный остаток впишите в «Не оплачено клиентами за день» (общей суммой по всем клиентам за день). Если клиент в этот день внёс деньги в погашение старого долга, впишите эту сумму в «Клиенты погасили прошлый долг»: она входит в «Нал» или «Безнал», но не в «Клиника общая».'],
  adv:['Авансы клиентов','Клиент дал деньги на аванс — пишем два раза: в наличные или безнал и в «Положили на аванс». Клиент заплатил авансом — пишем один раз: в «Сняли с аванса». В наличные и безнал ничего. Когда аванс был внесён — не важно.'],
  advcash:['Положили на аванс сегодня','Клиент дал деньги на аванс — пишем два раза: в наличные или безнал и в «Положили на аванс». Клиент заплатил авансом — пишем один раз: в «Сняли с аванса». В наличные и безнал ничего. Когда аванс был внесён — не важно.'],
  advout:['Сняли с аванса сегодня','Клиент дал деньги на аванс — пишем два раза: в наличные или безнал и в «Положили на аванс». Клиент заплатил авансом — пишем один раз: в «Сняли с аванса». В наличные и безнал ничего. Когда аванс был внесён — не важно.'],
  comp:['Компенсации и сертификаты','Заполняйте, когда в Vetmanager есть наличные (аванс или оплата), а денег в кассе нет: например, бонус клиенту от клиники или оплата подарочным сертификатом. Сумму оставьте в «Наличные клиники» и, если это аванс, в поле «Положили на аванс сегодня наличными»: страница сама учтёт её. Причину пишите без фамилии клиента.'],
  open:['Начало смены','Сколько наличных администратор фактически принял утром. Для нового отчёта сумма подставляется автоматически из блока «Утренний приём кассы» — повторно вводить её не нужно. В уже сданном отчёте поле можно исправить отдельной версией.'],
  exp:['Расходы','Деньги, которые взяли из кассы за день: инкассация, возвраты, хозяйственные расходы и т. п. Для каждого расхода выберите статью и введите сумму. Если подходящей статьи нет, выберите «Другое» и напишите в комментарии, на что потрачено.'],
  retm:['Возврат: наличными или безналично','Если вернули деньги клиенту наличными из кассы, выберите «Наличными из кассы»: сумма вычтется из кассы. Если вернули на карту или переводом, выберите «Безналично»: деньги из кассы не уходили, поэтому в расчёте кассы эта сумма не вычитается. Выбрать нужно обязательно.'],
  close:['Итог инкассации','Сколько наличных реально лежит в кассе на конец дня. Введите это число по факту. Страница сравнит его с уже рассчитанным движением денег за смену.'],
  assist:['Ассистенты','Отметьте, кто работал. Для каждого введите число фиксаций: обычных и на рентгене. Время ухода нужно, только если ушёл позже 21:00.'],
  checks:['Проверка','Страница только подсвечивает расхождения, ваши цифры она не меняет. Зелёный: сходится (разница до 10 ₽ включительно). Красный: расхождение больше 10 ₽, нужна причина. Серый: пока не хватает данных, под ним написано, чего именно.'],
  diff:['Причина расхождения','Если есть красные пункты, напишите, почему не сходится (например, ошибка ввода или сумма не из списка). Без причины отчёт с расхождением не отправится.']
};
const hbtn=k=>'<button type="button" class="q" data-act="hint" data-h="'+k+'" aria-label="Подсказка">?</button>';
const nfield=(p,label,val,extra='',hk='')=>'<label class="f"><span>'+label+(hk?hbtn(hk):'')+'</span><input data-p="'+p+'" inputmode="decimal" autocomplete="off" value="'+esc(fmtNum(val))+'" '+extra+'></label>';
const moneyField=(p,title,sub,val,hk='')=>'<div class="mf"><label class="mf-copy" for="mf-'+p.replace(/[^a-z0-9_-]/gi,'-')+'"><span class="mf-title"><b>'+title+'</b>'+(hk?hbtn(hk):'')+'</span><small>'+sub+'</small></label><div class="num"><input id="mf-'+p.replace(/[^a-z0-9_-]/gi,'-')+'" data-p="'+p+'" inputmode="decimal" autocomplete="off" value="'+esc(fmtNum(val))+'" aria-label="'+esc(title)+'"></div></div>';

function handoverHtml(){
  const s=handoverHere();if(!s)return '';
  if(s.loading)return '<div class="card"><h2>Приёмка кассы</h2><p class="hint">Проверяем ожидаемый переходящий остаток…</p></div>';
  const h=s.ctx;if(!h||!h.ok||h.mode==='off')return '';
  const p=handoverPending(S.branch,S.date);
  const sourceOk=!!(h.source&&h.source.report_date&&h.source.fingerprint);
  let x='<div class="card"><h2>Приёмка кассы</h2>'+
    '<p class="hint">Пересчитайте наличные и укажите, сколько приняли</p>';
  if(sourceOk&&h.expected!=null&&isFinite(Number(h.expected)))x+='<div class="sum"><span>Должно быть в кассе</span><b>'+money(Number(h.expected))+'</b></div><p class="hint">Источник: итог отчёта за '+ruDate(h.source.report_date)+', версия '+h.source.report_version+'.</p>';
  else x+='<div class="chk warn"><i>!</i><div>Нет подтверждённого предыдущего отчёта — ожидаемую сумму определить нельзя.</div></div>';
  if(s.offline||h.cached)x+='<div class="chk warn"><i>!</i><div>Показан последний сохранённый источник. При отправке сервер заново проверит его версию; устаревшую приёмку не примет.</div></div>';
  if(h.current){
    const bad=h.current.status==='discrepancy'&&Math.abs(Number(h.current.diff))>CFG.tol;
    x+='<div class="chk '+(bad?'bad':'ok')+'"><i>'+(bad?'!':'✓')+'</i><div><b>'+(bad?'Есть расхождение':'Касса принята')+'</b><br>Фактически: '+money(Number(h.current.actual))+(h.current.diff!=null?' · разница '+money(Number(h.current.diff)):'')+'<br><small>'+esc(h.current.accepted_by)+' · '+new Date(h.current.accepted_at).toLocaleString('ru-RU',{timeZone:'Asia/Omsk'})+' · сумма уже перенесена в отчёт</small></div></div>';
    if(h.can_correct)x+='<button class="btn sec small" data-act="hocorrect">Исправить отдельной записью</button>';
  }else if(h.can_accept&&sourceOk){
    x+='<label class="f"><span>Фактически принято</span><input id="ho-actual" inputmode="decimal" autocomplete="off" placeholder="Введите сумму руками"></label>'+
      '<p class="hint">Укажите фактическую сумму принятых денег. Вводить нужно всегда, даже если сумма совпала.</p>'+
      '<p class="hint">Принимает: <b>'+esc(S.person&&S.person.name)+'</b>. Нажатие — ваша персональная отметка о фактически принятой сумме.</p>'+
      '<button class="btn" data-act="hoaccept"'+(p?' disabled':'')+'>'+(p?'Ждёт отправки':'Подтвердить приём кассы')+'</button>';
  }
  if(p)x+='<p class="hint">'+(p.status==='wrong_actor'?'Запись ждёт входа того сотрудника, который её создал'+(p.actor_name?': '+esc(p.actor_name):'')+'. Подпись другого сотрудника не используется.':'Запись сохранена на устройстве и будет отправлена один раз после восстановления связи.')+'</p>';
  if(s.error)x+='<div class="chk bad"><i>!</i><div>'+esc(s.error)+'</div></div>';
  return x+'</div>';
}

function transitExpected(){return ((S.transit&&S.transit.items)||[]).filter(x=>String(x.branch)===String(S.branch)&&String(x.date)===String(S.date)&&x.status!=='cancelled').reduce((q,x)=>q+Number(x.amount||0),0)}
function transitDeclared(){return (S.form.expenses||[]).filter(x=>/инкассац/i.test(String(x.article||''))).reduce((q,x)=>q+N(x.amount),0)}
function updateTransitCheck(){
  const e=$('#transit-check');if(!e)return;
  const expected=transitExpected(),declared=transitDeclared(),ready=declared>0,diff=r2(declared-expected),ok=ready&&Math.abs(diff)<=CFG.tol;
  e.className='chk '+(!ready?'wait':ok?'ok':'bad');
  e.innerHTML='<i>'+(!ready?'…':ok?'✓':'!')+'</i><div><b>'+(!ready?'Ожидается сумма в отчёте':ok?'Инкассация сошлась':'Инкассация не сошлась')+'</b><br><small>Ожидается '+money(expected)+' · в отчёте '+money(declared)+(ready?' · разница '+money(diff):'')+'</small></div>';
}

function viewForm(){
  if(S.nosub)return nosubHtml();
  if(handoverGate())return handoverHtml()||'<div class="card"><h2>Приёмка кассы</h2><p class="hint">Проверяем принятую сумму…</p></div>';
  const f=S.form,c=S.ctx;let h='';
  if(!(c&&c.current))h+='<button class="btn sec small" data-act="back" style="margin:0 0 8px">‹ На главную</button>'; /* c26: видимый выход из формы без нижней панели; черновик сохраняется */
  if(S.subAdmin&&isHead())h+='<div class="chk warn" id="subadm"><i>!</i><div><b>Вы заполняете отчёт за администратора.</b> Сдача пойдёт от вашего имени.</div></div>';
  if(S.roHead)h+='<div class="chk ok" id="rohead"><i>👁</i><div><b>Просмотр отчёта</b> — только для чтения. Сдан'+(c.current&&c.current.submitted_at?' в '+hmOmsk(c.current.submitted_at):'')+(c.current?', версия '+c.current.version:'')+'.'+(headFixDateOk()?'<br><button class="btn small" style="margin-top:8px" data-act="headfix">Исправить отчёт</button>':' Исправить можно за последние 7 дней.')+'</div></div>';
  if(S.formErrors&&S.formErrors.length)h+='<div class="chk bad" id="form-errors"><i>!</i><div><b>Исправьте перед отправкой: '+S.formErrors.map(esc).join('; ')+'</b></div></div>';
  if(S.draftTs){const dt=new Date(S.draftTs);const hm=dt.toLocaleString('ru-RU',{timeZone:'Asia/Omsk',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
    h+='<div class="chk warn"><i>!</i><div>Восстановлен ваш несохранённый черновик от '+hm+'. Если это не сегодняшние цифры — очистите форму.<br><button class="btn sec small" style="margin-top:8px" data-act="clearDraft">Очистить форму и начать заново</button></div></div>';}
  if(S.ctxOffline)h+='<div class="chk warn"><i>!</i><div><b>Нет связи с сервером.</b> Утренний приём кассы и вчерашний итог сейчас недоступны. Впишите начало смены по факту. Отчёт сохранится на устройстве и уйдёт при появлении интернета.<br><button class="btn sec small" style="margin-top:8px" data-act="reloadctx">Обновить с сервера</button></div></div>';
  if(c.current&&!S.roHead)h+='<div class="chk warn"><i>!</i><div>За эту дату отчёт уже сдан (версия '+c.current.version+'). Изменения сохраняются как исправление — нужна причина.</div></div>';
  if(c.current)h+='<button class="btn sec small" data-act="back" style="margin:0 0 8px">Выбрать другую дату</button>';
  if(c.current)h+='<div id="flagbox">'+flagsHtml()+'</div>';

  h+=handoverHtml();

  h+='<div class="card k-staff"><h2>Смена'+hbtn('admins')+'</h2><h3>Администраторы</h3><div class="tiles">'+
    c.admins.map(a=>'<button class="tile'+(f.admins[a.id]?' on':'')+'" data-act="tog" data-g="admins" data-id="'+a.id+'">'+esc(a.name)+'</button>').join('')+'</div>';
  Object.keys(f.admins).forEach(id=>{
    const a=c.admins.find(x=>String(x.id)===id);
    h+='<div class="person"><b>'+esc(a?a.name:id)+'</b><label class="f"><span>Пришёл в (только если не в 9:00)</span><input type="time" data-p="admins.'+id+'.came" value="'+esc(f.admins[id].came||'')+'"></label><label class="f"><span>Ушёл в (только если не в 21:00)</span><input type="time" data-p="admins.'+id+'.left" value="'+esc(f.admins[id].left||'')+'"></label></div>';
  });
  h+='</div>';

  h+='<div class="card k-docs"><h2>Вал врачей'+hbtn('docs')+'</h2><p class="hint">Отметьте врачей, которые работали, и введите вал каждого.</p><div class="tiles">'+
    c.doctors.map(d=>'<button class="tile'+(f.doctors[d.id]?' on':'')+'" data-act="tog" data-g="doctors" data-id="'+d.id+'">'+esc(d.name)+(d.note?'<small>'+esc(d.note)+'</small>':'')+'</button>').join('')+'</div>';
  Object.keys(f.doctors).forEach(id=>{h+=nfield('doctors.'+id+'.val',esc(docName(id)||id)+' — вал, ₽',f.doctors[id].val)});
  f.others.forEach((o,i)=>{
    h+='<div class="person"><b>Не из списка'+hbtn('others')+'</b><label class="f"><span>Кто или за что (например, врач-замена)</span><input data-p="others.'+i+'.title" value="'+esc(o.title)+'"></label>'+nfield('others.'+i+'.val','Сумма, ₽',o.val)+'<button class="btn sec small" data-act="delOther" data-i="'+i+'">Удалить строку</button></div>';
  });
  h+='<button class="btn sec small" style="margin-top:8px" data-act="addOther">+ Врач-замена или другая сумма не из списка</button>';
  h+='<div class="sum" style="margin-top:10px"><span>Сумма врачей</span><b id="s-docs"></b></div></div>';

  h+='<div class="card k-clinic money-card"><div class="chead money-head"><h2>Деньги клиники<small>только за сегодня</small></h2>'+hbtn('pay')+'</div>'+
    '<p class="money-lead">Аптеку сюда не добавляйте — она заполняется отдельно ниже.</p>'+
    moneyField('total','Вал клиники','итог клиники из Vetmanager, без аптеки',f.total,'total')+
    moneyField('cash','Наличные клиники','все наличные клиники за сегодня, вместе с авансами, без аптеки',f.cash)+
    moneyField('cashless','Безнал клиники','весь безнал клиники за сегодня, вместе с авансами, без аптеки',f.cashless)+'</div>';

  h+='<div class="card quiet k-adv money-card"><div class="chead money-head"><h2>Авансы клиентов<small>только за сегодня</small></h2>'+hbtn('adv')+'</div>'+
    moneyField('adv_cash','Положили на аванс сегодня наличными','входит в наличные клиники',f.adv_cash,'advcash')+
    moneyField('adv_cashless','Положили на аванс сегодня безналом','входит в безнал клиники',f.adv_cashless,'advcash')+
    moneyField('adv_out','Сняли с аванса сегодня','в оплату счетов',f.adv_out,'advout')+
    '<div class="advance-note"><span>i</span><div>Клиент дал деньги на аванс — пишем два раза: в наличные или безнал и в «Положили на аванс».<br>Клиент заплатил авансом — пишем один раз: в «Сняли с аванса». В наличные и безнал ничего.<br>Когда аванс был внесён — не важно.</div></div>'+
    '<div id="money-status" class="money-status wait"><span class="ms-icon">…</span><div><div class="money-summary">Заполните суммы выше.</div></div></div></div>';

  h+='<div class="card k-pharm money-card"><div class="chead money-head"><h2>Аптека<small>считается отдельно</small></h2>'+hbtn('pharm')+'</div>'+
    '<p class="money-lead">Только продажи аптеки. Не переносите эти суммы в «Деньги клиники».</p>'+
    moneyField('ph_cash','Наличные аптеки','только наличные продажи аптеки',f.ph_cash)+
    moneyField('ph_cashless','Безналичные аптеки','карта и переводы за товары аптеки',f.ph_cashless)+
    moneyField('ph_val','Вал аптеки','общая сумма продаж аптеки',f.ph_val)+
    '<div id="pharm-status" class="money-status wait"><span class="ms-icon">…</span><div><b class="ms-title">Заполните суммы аптеки</b><div class="money-formula"></div></div></div></div>';

  h+='<div class="card k-debt"><h2>Долги клиентов'+hbtn('debt')+'</h2><p class="hint">Заполняйте, только если клиент оплатил счёт не полностью или погасил старый долг. Если долгов нет, оставьте пустым.</p>'+
    nfield('debt','Не оплачено клиентами за день, ₽',f.debt)+
    '<label class="f"><span>Пояснение (необязательно, без ФИО клиента)</span><input data-p="debt_comment" value="'+esc(f.debt_comment)+'"></label>'+
    nfield('repaid','Клиенты погасили прошлый долг за день, ₽',f.repaid)+'</div>';

  h+='<div class="card k-comp"><h2>Компенсации и сертификаты'+hbtn('comp')+'</h2><p class="hint">Заполняйте, когда Vetmanager показал наличные (аванс или оплату), а денег в кассе нет. Сумму оставьте в «Наличные клиники» и, если это аванс, в поле «Положили на аванс сегодня наличными» — страница сама учтёт её.</p>'+
    nfield('comp','Компенсация / бонус клиенту от клиники (аванс без денег), ₽',f.comp)+nfield('cert','Оплата сертификатом (в Vetmanager как нал), ₽',f.cert)+
    '<label class="f"><span>Причина (обязательно, если есть суммы; без ФИО клиента)</span><input data-p="nc_comment" value="'+esc(f.nc_comment)+'"></label></div>';

  const op=openingState();
  h+='<div class="card k-cash"><h2>Касса (инкассация)</h2>';
  if(op.mode==='linked')h+='<div class="cash-opening"><i>✓</i><div><b>Начало смены</b><small>'+(op.pending?'Утренний приём сохранён и будет отправлен при появлении связи.':'Взято из подтверждённого утреннего приёма кассы.')+' Повторно вводить не нужно.</small></div><strong>'+money(Number(op.actual))+'</strong></div>';
  else if(op.mode==='waiting'){
    const known=op.actual!=null&&isFinite(Number(op.actual)),expected=known?money(Number(op.actual)):'';
    h+=nfield('open','Фактически принято на начало смены, ₽',f.open)+'<div class="cash-opening wait"><i>!</i><div><b>Начало смены ещё не подтверждено</b><small>'+(known?'Ожидается '+expected+'. ':'Ожидаем подтверждение утренней приёмки. ')+'Пересчитайте наличные и подтвердите фактическую сумму в верхнем блоке.</small></div>'+(known?'<strong>'+expected+'</strong>':'')+'</div>';
  }
  else h+=nfield('open','Начало смены, ₽',f.open,'','open');
  if(op.mode==='manual'&&c.prev&&c.prev.closing!=null){
    const yd=addDays(S.date,-1),gap=c.prev.date!==yd;
    h+='<p class="hint">Подставлено из итога смены за '+ruDate(c.prev.date)+(c.prev.by?' ('+esc(c.prev.by)+')':'')+': '+money(Number(c.prev.closing))+'. Касса переходящая: берём итог предыдущей смены этого филиала, кто бы её ни сдавал. Если на деле иначе — исправьте, система подсветит расхождение.</p>';
    if(gap)h+='<div class="chk warn"><i>!</i><div>В системе нет отчёта за '+ruDate(yd)+(c.prev.date<addDays(S.date,-2)?' и предыдущие дни до '+ruDate(c.prev.date):'')+'. Остаток взят из последнего сданного — за '+ruDate(c.prev.date)+'. Сверьте с реальной кассой; если отчёт за пропущенный день ещё не сдан — сдайте его.</div></div>';
  }else if(op.mode==='manual'&&!S.ctxOffline)h+='<p class="hint">Утренний приём кассы недоступен или предыдущего отчёта нет — впишите начало смены по факту.</p>';
  h+='<h3>Расходы'+hbtn('exp')+'</h3>';
  const tx=transitExpected();
  h+='<div class="sum"><span>Передано в инкассацию сегодня</span><b>'+money(tx)+'</b></div><p class="hint">Сумму в расходе введите сами: приложение не подставляет её за вас.</p><div id="transit-check" class="chk wait"></div><button class="btn sec small" data-act="transitgive">Отдал инкассацию</button>';
  f.expenses.forEach((e,i)=>{
    h+='<div class="person"><label class="f"><span>Статья</span><select data-p="expenses.'+i+'.article"><option value="">— выберите —</option>'+
      c.articles.map(a=>'<option'+(e.article===a.title?' selected':'')+'>'+esc(a.title)+'</option>').join('')+'</select></label>'+
      (isRet(e.article)?'<div class="f"><span>Как вернули деньги клиенту'+hbtn('retm')+'</span><div class="tiles"><button type="button" class="tile'+(e.method==='cash'?' on':'')+'" data-act="expm" data-i="'+i+'" data-m="cash">Наличными из кассы</button><button type="button" class="tile'+(e.method==='noncash'?' on':'')+'" data-act="expm" data-i="'+i+'" data-m="noncash">Безналично (карта, перевод)</button></div></div>':'')+
      nfield('expenses.'+i+'.amount','Сумма, ₽',e.amount)+
      '<label class="f"><span>Комментарий</span><input data-p="expenses.'+i+'.comment" value="'+esc(e.comment)+'"></label>'+
      '<button class="btn sec small" data-act="delExp" data-i="'+i+'">Удалить расход</button></div>';
  });
  h+='<button class="btn sec small" data-act="addExp">+ Расход</button>';
  h+=nfield('close','Итог инкассации (сколько наличных в кассе сейчас), ₽',f.close,'','close');
  h+='<div class="sum"><span>Расходы из кассы</span><b id="s-exp"></b></div><div class="sum" id="s-expn-row" hidden><span>Возвраты безналично (не из кассы)</span><b id="s-expn"></b></div><div class="sum"><span>Итог по расчёту системы</span><b id="s-exp2"></b></div></div>';

  h+='<div class="card k-assist"><h2>Ассистенты'+hbtn('assist')+'</h2><p class="hint">Отметьте, кто работал, и сколько фиксаций сделал.</p><div class="tiles">'+
    c.assistants.map(a=>{const k=a.role+':'+a.id;return '<button class="tile'+(f.assistants[k]?' on':'')+'" data-act="tog" data-g="assistants" data-id="'+k+'">'+esc(aNm(a.name))+'<small>'+(a.role==='assistant_tech'?'технический':'клинический')+'</small></button>'}).join('')+'</div>';
  Object.keys(f.assistants).forEach(k=>{
    const[role,id]=k.split(':');const a=c.assistants.find(x=>x.role===role&&String(x.id)===id)||{name:id};const v=f.assistants[k];
    h+='<div class="person"><b>'+esc(aNm(a.name))+' <small style="font-weight:400;color:var(--mute)">'+(role==='assistant_tech'?'технический':'клинический')+'</small></b>'+
      '<div class="step"><span>Фиксации обычные</span><button data-act="inc" data-p="assistants.'+k+'.fn" data-d="-1">−</button><output id="o-'+k+'-fn">'+v.fn+'</output><button data-act="inc" data-p="assistants.'+k+'.fn" data-d="1">+</button></div>'+
      '<div class="step"><span>Фиксации на рентгене</span><button data-act="inc" data-p="assistants.'+k+'.fx" data-d="-1">−</button><output id="o-'+k+'-fx">'+v.fx+'</output><button data-act="inc" data-p="assistants.'+k+'.fx" data-d="1">+</button></div>'+
      '<label class="f"><span>Пришёл в (только если не в 9:00)</span><input type="time" data-p="assistants.'+k+'.came" value="'+esc(v.came||'')+'"></label><label class="f"><span>Ушёл в (только если не в 21:00)</span><input type="time" data-p="assistants.'+k+'.left" value="'+esc(v.left||'')+'"></label></div>';
  });
  if(!Object.keys(f.assistants).length&&f.no_assistant===true)h+='<div class="chk ok"><i>✓</i><div><b>Ассистента не было (отметил админ)</b><br><small>Отметка сохранена в отчёте дня и видна руководителю.</small></div></div>';
  h+='</div>';

  h+='<div class="card k-misc"><h2>Прочее</h2><label class="f"><span>Примечание</span><textarea data-p="note" rows="2">'+esc(f.note)+'</textarea></label>'+
    '</div>';

  h+='<div class="card k-check" id="chkcard"><h2>Проверка'+hbtn('checks')+'</h2><div id="checks"></div>'+
    '<label class="f"><span>Причина расхождения (обязательно, если есть красные пункты)'+hbtn('diff')+'</span><textarea data-p="diff_reason" rows="2">'+esc(f.diff_reason)+'</textarea></label>';
  if(c.current)h+='<label class="f"><span>Причина исправления отчёта'+(S.headFix?' (не короче '+HEAD_REASON_MIN+' знаков)':'')+'</span><textarea data-p="corr_reason" rows="2">'+esc(f.corr_reason)+'</textarea></label>';
  h+='</div>';
  return h;
}
function viewBar(){
  if(S.nosub||S.roHead||handoverGate())return '';
  return '<div class="bar"><div class="in"><div class="st" id="barst" data-act="tochecks"></div><button class="btn" data-act="submit">Отправить отчёт</button></div></div>';
}
function updateChecks(){
  if(S.view!=='form')return;
  const calc=compute();
  const el=$('#checks');
  if(el)el.innerHTML=calc.checks.map(c=>{
    const cls=!c.ready?'wait':(c.ok?'ok':'bad');
    const mark=!c.ready?'…':(c.ok?'✓':'✗');
    const diff=c.ready&&!c.ok?'<br><b>Разница: '+money(c.diff)+'</b>':'';
    return '<div class="chk '+cls+'"><i>'+mark+'</i><div>'+esc(c.label)+(c.ready?'<br><small>'+esc(c.detail)+'</small>':(c.miss?'<small class="need">Не хватает: '+esc(c.miss)+'</small>':''))+diff+'</div></div>';
  }).join('');
  const set=(id,t)=>{const e=$(id);if(e)e.textContent=t};
  set('#s-docs',money(calc.sumDocs));set('#s-exp',money(calc.exp));set('#s-expn',money(calc.expNc));{const r=$('#s-expn-row');if(r)r.hidden=!(calc.expNc>0)}set('#s-exp2',money(calc.expected));
  const moneyStatus=(id,c,rows)=>{const e=$(id);if(!e)return;const ready=!!(c&&c.ready),ok=ready&&c.ok;e.className='money-status '+(!ready?'wait':ok?'ok':'bad');
    e.innerHTML='<span class="ms-icon">'+(!ready?'…':ok?'✓':'!')+'</span><div><b class="ms-title">'+(!ready?'Заполните все суммы':ok?'Сходится':'Проверьте суммы')+'</b><div class="money-formula">'+rows+(ready&&!ok?'<div class="srow diff"><span>Разница</span><b>'+money(c.diff)+'</b></div>':'')+'</div></div>'};
  const pay=calc.checks.find(x=>x.id==='pay'),ph=calc.checks.find(x=>x.id==='pharm'),f=S.form;
  const got=r2(N(f.cash)+N(f.cashless)),advIn=r2(N(f.adv_cash)+N(f.adv_cashless)),advOut=N(f.adv_out),repaid=N(f.repaid);
  const payStatus=$('#money-status');
  if(payStatus){
    const ready=!!(pay&&pay.ready),ok=ready&&pay.ok;
    payStatus.className='money-status '+(!ready?'wait':ok?'ok':'bad');
    let summary='Заполните суммы выше.';
    if(ready){
      summary='Работы сегодня на '+money(N(f.total))+'. ';
      if(ok)summary+='Денег пришло '+money(got)+'. ';
      else summary+='Денег и аванса набралось '+money(r2(N(f.total)+pay.diff))+'. ';
      if(advIn>0)summary+='Из них '+money(advIn)+' положили на аванс. ';
      if(advOut>0)summary+='Из аванса оплачено '+money(advOut)+'. ';
      if(repaid>0)summary+='Из них '+money(repaid)+' погасили прошлый долг. ';
      summary+=ok?'Сходится.':(pay.diff<0?'Не хватает ':'Лишних ')+money(Math.abs(pay.diff))+'. Проверьте суммы.';
    }
    payStatus.innerHTML='<span class="ms-icon">'+(!ready?'…':ok?'✓':'!')+'</span><div><div class="money-summary">'+summary+'</div></div>';
  }
  const phRows='<div class="srow"><span>Наличные + безналичные</span><b>'+money(r2(N(f.ph_cash)+N(f.ph_cashless)))+'</b></div><div class="srow total"><span>= Вал аптеки</span><b>'+money(N(f.ph_val))+'</b></div>';
  moneyStatus('#pharm-status',ph,phRows);
  updateTransitCheck();
  const bad=calc.checks.filter(c=>c.ready&&!c.ok).length;
  const st=$('#barst');
  if(st)st.innerHTML=bad?'<b style="color:var(--bad)">Расхождений: '+bad+'</b>':(calc.checks.some(c=>c.ready)?'<b style="color:var(--ok)">Расхождений нет</b>':'<span style="color:var(--mute)">Заполните отчёт</span>');
}
function viewDone(){
  const d=S.done;
  const it=S.queue.find(x=>x.uid===d.uid)||{};const st=it.status||'';
  const needR=!d.sent&&st==='needs_reason';
  let h='<div class="card"><h2>'+(d.sent?'Отчёт принят':needR?'Нужна причина исправления':'Отчёт сохранён на устройстве')+'</h2>';
  if(d.sent){
    h+='<div class="chk ok"><i>✓</i><div>'+esc(d.branch)+' · '+ruDate(d.date)+(d.version?' · версия '+d.version:'')+'</div></div>';
    h+='<div id="flagbox">'+flagsHtml()+'</div>';
  }else if(needR){
    h+='<div class="chk warn"><i>!</i><div>За '+ruDate(d.date)+' ('+esc(d.branch)+') отчёт уже сдан. Этот будет исправлением. Впишите, что исправили и почему, и отправьте.</div></div>'
      +'<label class="f"><span>Причина исправления'+(it.minLen>3?' (не короче '+it.minLen+' знаков)':'')+'</span><input id="rs-'+it.uid+'" autocomplete="off"></label>'
      +'<button class="btn" data-act="setReason" data-id="'+it.uid+'" style="margin:0 0 8px">Отправить с причиной</button>';
  }else if(st==='error'){
    h+='<div class="chk bad"><i>✗</i><div>Сервер не принял отчёт ('+esc(it.err||'ошибка')+'). Отчёт цел на устройстве. Нажмите «Отправить сейчас»; если не получится, скопируйте итоги и сообщите руководителю.</div></div>';
  }else if(st==='need_login'){
    h+='<div class="chk warn"><i>!</i><div>Сессия закончилась. Войдите заново, отчёт уйдёт сам.</div></div>';
  }else{
    h+='<div class="chk warn"><i>!</i><div>Пока не отправлен'+((S.online&&st!=='offline')?' (идёт отправка…)':' — нет связи с сервером. Отправится сам, когда появится интернет (проверка каждые 8 секунд). Не очищайте данные браузера.')+'</div></div>';
  }
  if(!d.sent&&!needR&&(st==='offline'||!S.online))h+='<div class="chk warn"><i>…</i><div>Сверка будет после связи.</div></div>';
  if(!d.sent&&!needR)h+='<button class="btn" data-act="flush" style="margin:8px 0 0">Отправить сейчас</button>';
  h+='<button class="btn sec" data-act="copy" style="margin:8px 0">Скопировать итоги (на случай, если нет связи)</button>';
  h+='<button class="btn" data-act="newrep">Готово</button></div>';
  return h;
}
