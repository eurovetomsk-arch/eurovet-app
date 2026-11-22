'use strict';
/* ====== 2.0 · Модуль «Врачебная заявка» (L11, слова Михаила 18.11 и 22.11) ======
   Путь: плитка -> «На каком вы филиале?» -> список позиций (поиск, три раздела) -> «Проверьте заявку».
   Заявка открыта, пока закупщик (руководитель) её не закроет; время подачи не фиксируется. Любой вошедший правит заявку любого филиала.
   Число сохраняется на сервере сразу (ev_med_line_set); устаревшее изменение сервер отклоняет и показывает текущее число.
   Руководитель: сводная (ev_med_summary: филиалы + итог, копия, Excel, закрыть) и правка справочника (ev_med_item_upsert).
   Модуль выключен настройкой UI2.moduleBuilt.supplies до применения L11. */
const MD={sumCounts:null,fromSum:false,etab:'med',eq:'',hl:null,buyer:undefined,cat:null,err:null,step:'branch',branch:null,tab:'med',q:'',lines:{},prev:{},meta:{},ok:{},sum:null,sumBranch:null,busy:false,edit:null};
const MD_SEC={med:'Медицинские',vet:'Ветеринарные',supply:'Расходка',household:'Хозяйственные нужды'};
const MD_BR=[{id:'marksa',title:'Маркса'},{id:'pereleta',title:'Перелёта'},{id:'70let',title:'70 лет'}];
const mdBrTitle=id=>(MD_BR.find(b=>b.id===id)||{title:id}).title;
/* сервер отдаёт порядок sort,id (новая позиция оказывалась в конце раздела); на экране всегда по алфавиту внутри раздела */
const mdByName=(a,b)=>String(a.name).localeCompare(String(b.name),'ru',{sensitivity:'base'});
const mdSorted=a=>(a||[]).slice().sort(mdByName);
const mdItems=()=>(MD.cat&&MD.cat.items)||[];
/* название с единицей: «Адреналин · ампула» (единица может быть пустой) */
const mdUnitOf=i=>i&&i.unit?' · '+esc(i.unit):'';
const mdLabel=id=>{const i=mdItems().find(x=>Number(x.id)===Number(id));return i?esc(i.name)+mdUnitOf(i):'#'+id};
const mdName=id=>{const i=mdItems().find(x=>Number(x.id)===Number(id));return i?i.name:'#'+id};
const mdShiftBranch=()=>{const m=(typeof HOME_WHO!=='undefined'&&HOME_WHO.rows||[]).find(r=>r&&r.mine===true&&(r.branch||r.branch_id));return m?(m.branch||m.branch_id):null};
const mdHead=()=>{try{return !!isHead()}catch(e){return false}};
/* ---- офлайн-очередь (только item, qty, branch, время и число, которое человек видел; без PIN, токена и имён) ---- */
const MDQ_KEY='ev_medq';
/* who = те же 3 цифры номера входа, что приложение уже хранит; запись уходит только при том же входе, чужие не удаляются и не отправляются */
function mdWho(){const n=(S.loginNumber&&/^\d{3}$/.test(S.loginNumber))?S.loginNumber:(typeof LOGIN_NUM_KEY!=='undefined'?(function(){try{return localStorage.getItem(LOGIN_NUM_KEY)||''}catch(e){return ''}})():'');return /^\d{3}$/.test(n)?n:''}
function mdQ(){try{const a=JSON.parse(localStorage.getItem(MDQ_KEY)||'[]');return Array.isArray(a)?a.filter(x=>x&&Number.isInteger(x.item)&&Number.isInteger(x.qty)&&x.qty>=0&&x.qty<=999&&Number.isInteger(x.exp)&&x.exp>=0&&x.exp<=999&&typeof x.branch==='string'&&/^\d{3}$/.test(x.who||'')):[]}catch(e){return[]}}
function mdQSave(a){try{localStorage.setItem(MDQ_KEY,JSON.stringify(a))}catch(e){}}
function mdQPut(branch,item,qty,exp){
  item=Number(item);const w=mdWho();if(!w)return;const a=mdQ(),i=a.findIndex(x=>x.branch===branch&&x.item===item&&x.who===w);
  if(qty===exp){if(i>=0)a.splice(i,1)}
  else if(i>=0){a[i].qty=qty;a[i].at=Date.now();delete a[i].conflict}
  else a.push({item,qty,branch,exp,at:Date.now(),who:w});
  mdQSave(a);
}
const mdQHere=()=>mdQ().filter(x=>x.branch===MD.branch&&x.who===mdWho());
const mdQForeign=()=>mdQ().filter(x=>x.who!==mdWho()).length;
function mdApply(id,q){if(q)MD.lines[id]=q;else delete MD.lines[id]}
let mdFlushing=false;
async function mdFlush(){
  const who=mdWho();if(mdFlushing||!S.token||!S.person||!who)return;mdFlushing=true;let changed=false;
  try{
    for(const e of mdQ().filter(x=>x.who===who)){
      if(e.conflict)continue;
      let r;try{r=await rpc('ev_med_line_set',{p_token:S.token,p_branch:e.branch,p_item:e.item,p_qty:e.qty,p_expect:e.exp},8000)}catch(x){break}
      const a=mdQ(),i=a.findIndex(y=>y.branch===e.branch&&y.item===e.item&&y.who===who);
      if(r&&r.ok){if(i>=0){if(a[i].qty===e.qty)a.splice(i,1);else a[i].exp=e.qty}changed=true} /* пока шёл запрос, число могли изменить: тогда новое значение ждёт с exp=ушедшее */
      else if(r&&r.error==='conflict'){if(i>=0){a[i].conflict={cur:Number(r.current)||0};changed=true}}
      else if(r&&r.error==='session'){break}
      else{if(i>=0)a.splice(i,1);changed=true}
      mdQSave(a);
    }
  }finally{mdFlushing=false}
  if(changed&&S.view==='med'){if(MD.branch&&MD.step!=='branch'&&MD.step!=='sum'&&MD.step!=='edit')await mdLoadOrder();paint()}
}
async function mdResolve(id,keep){
  const a=mdQ(),i=a.findIndex(x=>x.branch===MD.branch&&x.item===Number(id)&&x.who===mdWho());if(i<0)return;
  if(keep){a[i].exp=a[i].conflict?a[i].conflict.cur:a[i].exp;delete a[i].conflict;mdQSave(a);await mdFlush()}
  else{a.splice(i,1);mdQSave(a);await mdLoadOrder();paint()}
}
window.addEventListener('online',()=>{mdFlush()});
setInterval(()=>{if(mdQHere().length||mdQ().some(x=>x.who===mdWho()))mdFlush()},30000);
/* справочник перечитывается при каждом входе в модуль и после каждой правки; пока грузится новый, показывается прежний (кэш). Возвращает true, если загрузилось. */
async function mdLoadCat(all){
  try{const r=await rpc('ev_med_catalog',{p_token:S.token,p_all:!!all},8000);
    if(r&&r.ok){r.items=mdSorted(r.items);MD.cat=r;MD.err=null;return true}else MD.err=(r&&r.error==='session')?'Сессия закончилась, войдите заново.':'Справочник пока недоступен.'}
  catch(e){MD.err=e.net?'Нет связи: справочник не загрузился.':'Справочник пока недоступен.'}
  return false;
}
/* закупщик (не руководитель) узнаётся у сервера: ev_med_summary отвечает ok только руководителю и людям из ev_med_buyers */
async function mdProbeBuyer(){
  if(mdHead()||MD.buyer!==undefined||!S.token)return;
  try{const r=await rpc('ev_med_summary',{p_token:S.token,p_branch:null},10000);MD.buyer=!!(r&&r.ok)}catch(e){return}
  if(S.view==='med')paint();
}
/* закупщик и руководитель: плитка открывает сразу «Сводную заявок» (открытые заявки по филиалам и итог); остальные роли — выбор филиала */
const mdPriv=()=>mdHead()||MD.buyer===true;
async function showMed(){
  closeOv();S.view='med';MD.q='';MD.edit=null;MD.fromSum=false;
  const priv=mdPriv();MD.step=priv?'sum':'branch';if(priv){MD.sum=null;MD.sumBranch=null}
  paint();window.scrollTo(0,0);
  await mdLoadCat(false);paint();mdFlush();
  if(priv)await mdSumLoad();
  else{await mdProbeBuyer();if(MD.buyer===true&&MD.step==='branch'&&S.view==='med'){MD.step='sum';MD.sum=null;MD.sumBranch=null;paint();await mdSumLoad()}}
}
const mdCounts=rows=>{const c={};MD_BR.forEach(b=>{c[b.id]=(rows||[]).filter(r=>Number((r.qty||{})[b.id])>0).length});return c};
async function mdPickBranch(id){
  const shift=mdShiftBranch();
  if(shift&&shift!==id&&!confirm('Сегодня у вас смена на '+mdBrTitle(shift)+'. Заполнить заявку '+mdBrTitle(id)+'?'))return;
  MD.branch=id;MD.step='list';MD.q='';MD.tab='med';MD.ok={};await mdLoadOrder();paint();window.scrollTo(0,0);
}
async function mdLoadOrder(){
  try{const r=await rpc('ev_med_order_get',{p_token:S.token,p_branch:MD.branch},8000);
    if(r&&r.ok){MD.lines={};MD.meta={};(r.lines||[]).forEach(l=>{MD.lines[l.item]=l.qty;MD.meta[l.item]={by:l.by,at:l.at}});MD.prev=r.prev||{};mdQHere().forEach(e=>mdApply(e.item,e.qty));MD.err=null}
    else MD.err=(r&&r.error==='session')?'Сессия закончилась, войдите заново.':'Заявка не загрузилась.'}
  catch(e){MD.err=e.net?'Нет связи: заявка не загрузилась.':'Заявка не загрузилась.'}
}
async function mdSet(id,q){
  q=Math.max(0,Math.min(999,Number(q)||0));const was=MD.lines[id]||0;if(q===was||MD.busy)return;
  const pend=mdQHere().find(x=>x.item===Number(id));
  if(pend){mdQPut(MD.branch,id,q,pend.exp);mdApply(id,q);paint();mdFlush();return}
  MD.busy=true;
  try{const r=await rpc('ev_med_line_set',{p_token:S.token,p_branch:MD.branch,p_item:Number(id),p_qty:q,p_expect:was},8000);
    if(r&&r.ok){if(q)MD.lines[id]=q;else delete MD.lines[id];delete MD.ok[id];
      if(q===0&&was>0){mdUndo={id,qty:was};toast('«'+mdName(id)+'» убрано. Нажмите «Отменить» внизу',6000)}}
    else if(r&&r.error==='conflict'){if(r.current)MD.lines[id]=r.current;else delete MD.lines[id];toast('Число уже изменил другой сотрудник: сейчас '+(r.current||0),6000)}
    else if(r&&r.error==='session')toast('Сессия закончилась, войдите заново.');
    else toast('Не удалось сохранить.')}
  catch(e){if(e.net){mdQPut(MD.branch,id,q,was);mdApply(id,q);toast('Нет связи. Число сохранено на телефоне и уйдёт само.',6000)}else toast('Ошибка сервера. Число не сохранено.')}
  MD.busy=false;paint();
}
let mdUndo=null;
const mdUnusual=id=>{const q=MD.lines[id]||0,p=Number(MD.prev[id]||0);return q>10||(p>0&&q>p*3)};
function mdBranchHtml(){
  const shift=mdShiftBranch(),list=MD_BR.slice().sort((a,b)=>(a.id===shift?-1:0)-(b.id===shift?-1:0));
  return '<h1 class="screen-title">Врачебная заявка</h1><p class="mute">На каком вы филиале?</p>'
    +list.map(b=>'<button class="glass md-br" data-mact="branch" data-id="'+b.id+'"><b>'+esc(b.title)+'</b>'+(b.id===shift?'<small>ваша смена сегодня</small>':'')+'</button>').join('')
    +((mdHead()||MD.buyer)?'<div class="md-adm"><button class="chip" data-mact="sum">Сводная заявок</button>'+(mdHead()?'<button class="chip" data-mact="edit">Справочник</button>':'')+'</div>':'');
}
function mdRow(i,withSec){
  const q=MD.lines[i.id]||0,pd=mdQHere().find(x=>x.item===Number(i.id));
  return '<div class="md-it'+(q?' on':'')+(pd?' pend':'')+'"><div class="nm">'+esc(i.name)+mdUnitOf(i)+(i.grp?'<small class="md-grp">'+esc(i.grp)+'</small>':'')+(withSec?'<span class="md-chip">'+MD_SEC[i.section]+'</span>':'')+(pd?'<small class="md-pendtxt">не отправлено</small>':'')+'</div>'
    +'<div class="st"><button class="md-b" data-mact="step" data-id="'+i.id+'" data-s="-1" aria-label="Меньше">−</button>'
    +'<input class="md-q" inputmode="numeric" data-id="'+i.id+'" value="'+q+'" aria-label="Количество">'
    +'<button class="md-b p" data-mact="step" data-id="'+i.id+'" data-s="1" aria-label="Больше">+</button></div></div>';
}
function mdConflictHtml(){
  return mdQHere().filter(e=>e.conflict).map(e=>'<div class="md-ask">«'+esc(mdName(e.item))+'»: число изменил другой: было '+e.exp+', стало '+e.conflict.cur+'. Ваше: '+e.qty+'.<div><button class="go sm" data-mact="keepmine" data-id="'+e.item+'">Оставить моё</button><button class="chip" data-mact="takenew" data-id="'+e.item+'">Взять новое</button></div></div>').join('');
}
function mdListHtml(){
  const q=MD.q.trim().toLowerCase(),items=mdItems(),n=Object.keys(MD.lines).length,np=mdQHere().length;
  let rows;
  if(q){const hit=items.filter(i=>i.active!==false&&i.name.toLowerCase().startsWith(q));rows='<div class="mute">Найдено '+hit.length+' во всех разделах</div>'+hit.map(i=>mdRow(i,true)).join('')}
  else{let cur='';rows=items.filter(i=>i.section===MD.tab&&i.active!==false).map(i=>{const l=i.name[0].toUpperCase();const h=l!==cur?'<div class="md-lt">'+esc(l)+'</div>':'';cur=l;return h+mdRow(i)}).join('')}
  const tabs=Object.keys(MD_SEC).map(s=>'<button class="chip'+(MD.tab===s&&!q?' on':'')+'" data-mact="tab" data-id="'+s+'">'+MD_SEC[s]+' '+items.filter(i=>i.section===s&&i.active!==false).length+'</button>').join('');
  return '<button class="md-back" data-mact="back">‹ Назад</button><h1 class="screen-title">Врачебная заявка</h1><div class="mute">'+esc(mdBrTitle(MD.branch))+' · заявка открыта</div>'
    +mdConflictHtml()+(mdQForeign()?'<div class="mute md-pendtxt">Есть неотправленные числа другого входа: '+mdQForeign()+'</div>':'')+'<input class="md-search" id="mdsearch" placeholder="Найти: первые буквы названия" value="'+esc(MD.q)+'">'+'<div class="chips">'+tabs+'</div>'+rows
    +(mdUndo?'<div class="md-undo"><button class="chip" data-mact="undo">Отменить: вернуть «'+esc(mdName(mdUndo.id))+'»</button></div>':'')
    +'<div class="md-bar"><div><b>В заявке: '+n+' поз.</b>'+(np?'<small class="md-pendtxt">Не отправлено: '+np+'. Появится связь — уйдёт само.</small>':'')+'</div><button class="go" data-mact="review"'+(n&&!np?'':' disabled')+'>Проверить</button></div>';
}
function mdReviewHtml(){
  const ids=Object.keys(MD.lines),odd=ids.filter(mdUnusual);let h='<button class="md-back" data-mact="list">‹ Назад к списку</button><h1 class="screen-title">Проверьте заявку</h1><div class="mute">'+esc(mdBrTitle(MD.branch))+' · '+ids.length+' поз.'+(odd.length?' · необычных: '+odd.length:'')+'</div>';
  Object.keys(MD_SEC).forEach(s=>{const rs=ids.filter(id=>(mdItems().find(i=>String(i.id)===id)||{}).section===s);if(!rs.length)return;
    h+='<div class="md-sec">'+MD_SEC[s]+'</div>'+rs.map(id=>{const u=mdUnusual(id)&&!MD.ok[id],m=MD.meta[id];
      return '<div class="md-rr'+(u?' wr':'')+'"><span>'+mdLabel(id)+(m&&m.by?'<small>'+esc(m.by)+'</small>':'')+'</span><b>'+MD.lines[id]+'</b></div>'
        +(u?'<div class="md-ask">Поставили '+MD.lines[id]+'. Верно?<div><button class="go sm" data-mact="ok" data-id="'+id+'">Да, '+MD.lines[id]+'</button><button class="chip" data-mact="fix" data-id="'+id+'">Исправить</button></div></div>':'')}).join('')});
  return h+'<div class="md-bar"><button class="chip" data-mact="list">Изменить</button><button class="go" data-mact="done">Отправить</button></div>';
}
async function mdSumLoad(){
  try{const r=await rpc('ev_med_summary',{p_token:S.token,p_branch:MD.sumBranch},10000);MD.sum=(r&&r.ok)?Object.assign(r,{rows:mdSorted(r.rows)}):{err:(r&&r.error==='forbidden')?'Сводная — только у руководителя.':'Сводная пока недоступна.'}}
  catch(e){MD.sum={err:e.net?'Нет связи.':'Сводная пока недоступна.'}}
  if(MD.sum&&!MD.sum.err&&!MD.sumBranch)MD.sumCounts=mdCounts(MD.sum.rows);
  paint();
}
function mdSumHtml(){
  const s=MD.sum;let h='<button class="md-back" data-mact="back">‹ Назад</button><h1 class="screen-title">Врачебные заявки</h1>';
  if(!s)return h+'<p class="mute">Загрузка…</p>';if(s.err)return h+'<p class="mute">'+esc(s.err)+'</p>';
  const f=['','marksa','pereleta','70let'],fl=['Все филиалы','Маркса','Перелёта','70 лет'],cn=MD.sumCounts||mdCounts(s.rows),open=MD_BR.filter(b=>cn[b.id]>0);
  h+='<div class="md-open"><b>Открытых заявок: '+open.length+'</b>'+(open.length?' · '+open.map(b=>esc(b.title)+' '+cn[b.id]).join(', '):'')+'</div>';
  h+='<div class="chips">'+f.map((b,i)=>'<button class="chip'+((MD.sumBranch||'')===b?' on':'')+'" data-mact="sumbr" data-id="'+b+'">'+fl[i]+(b&&cn[b]?' '+cn[b]:'')+'</button>').join('')+(mdHead()?'<button class="chip" data-mact="edit">Справочник</button>':'')+'</div>';
  let t='<table class="md-t"><thead><tr><th>Позиция</th>'+MD_BR.map(b=>'<th>'+esc(b.title)+'</th>').join('')+'<th class="tot">Итого</th></tr></thead><tbody>';
  Object.keys(MD_SEC).forEach(sec=>{const rs=(s.rows||[]).filter(r=>r.section===sec);if(!rs.length)return;
    t+='<tr class="sh"><td colspan="5">'+MD_SEC[sec]+' · '+rs.length+'</td></tr>'+rs.map(r=>{ /* история «было → стало» в сводной не показывается (слово Михаила 22.11); в базе журнал остаётся */
      return '<tr><td>'+esc(r.name)+(r.unit?' · '+esc(r.unit):'')+'</td>'+MD_BR.map(b=>'<td>'+((r.qty||{})[b.id]||'—')+'</td>').join('')+'<td class="tot">'+r.total+'</td></tr>'}).join('')});
  return h+t+'</tbody></table><button class="go md-mk" data-mact="mkorder">Сделать заявку филиала</button><div class="md-bar"><button class="chip" data-mact="copy">Копировать</button><button class="chip" data-mact="xls">Excel</button><button class="go" data-mact="close">Закрыть заявки</button></div>';
}
function mdSumRows(){const rows=[['Раздел','Позиция','Ед.','Маркса','Перелёта','70 лет','Итого']];(MD.sum.rows||[]).forEach(r=>rows.push([MD_SEC[r.section],r.name,r.unit||'',...MD_BR.map(b=>(r.qty||{})[b.id]||0),r.total]));return rows}
function mdSecSel(cur,cls,id){return '<select class="'+cls+'"'+(id!=null?' data-id="'+id+'"':'')+'>'+Object.keys(MD_SEC).map(k=>'<option value="'+k+'"'+(k===cur?' selected':'')+'>'+MD_SEC[k]+'</option>').join('')+'</select>'}
function mdEditHtml(){
  const tab=MD.etab||'med',q=(MD.eq||'').trim().toLowerCase();
  let h='<button class="md-back" data-mact="back">‹ Назад</button><h1 class="screen-title">Справочник</h1><p class="mute">Правит только руководитель. Скрытая позиция остаётся в прошлых заявках.</p>';
  h+='<div class="md-new">'+mdSecSel(tab,'md-ns')+'<input id="mdnname" placeholder="Новая позиция"><input id="mdnunit" placeholder="Единица (ампула, мл, шт)"><input id="mdngrp" placeholder="Группа (необязательно)"><button class="go sm" data-mact="add">Добавить</button></div>';
  h+='<div class="chips">'+Object.keys(MD_SEC).map(k=>'<button class="chip'+(k===tab?' on':'')+'" data-mact="etab" data-id="'+k+'">'+MD_SEC[k]+' '+mdItems().filter(i=>i.section===k).length+'</button>').join('')+'</div>';
  h+='<input class="md-search" id="mdesearch" placeholder="Найти: первые буквы названия" value="'+esc(MD.eq||'')+'">';
  const rows=mdItems().filter(i=>i.section===tab&&(!q||i.name.toLowerCase().startsWith(q)));
  h+=rows.length?rows.map(i=>'<div id="mded'+i.id+'" class="md-ed2'+(i.active===false?' off':'')+(MD.hl===i.id?' md-hl':'')+'"><input data-id="'+i.id+'" class="md-en" value="'+esc(i.name)+'"><div class="md-ed3">'+mdSecSel(i.section,'md-es',i.id)+'<input data-id="'+i.id+'" class="md-eu" placeholder="ед." value="'+esc(i.unit||'')+'"><input data-id="'+i.id+'" class="md-eg" placeholder="группа" value="'+esc(i.grp||'')+'"></div><div class="md-ed3"><button class="chip" data-mact="save" data-id="'+i.id+'">Сохранить</button><button class="chip" data-mact="vis" data-id="'+i.id+'">'+(i.active===false?'Вернуть':'Скрыть')+'</button></div></div>').join(''):'<p class="mute">В этом разделе ничего не найдено.</p>';
  return h;
}
function medHtml(){
  if(MD.err&&!MD.cat)return '<button class="md-back" data-mact="back">‹ На главную</button><h1 class="screen-title">Врачебная заявка</h1><p class="mute">'+esc(MD.err)+'</p>';
  if(!MD.cat)return '<h1 class="screen-title">Врачебная заявка</h1><p class="mute">Загрузка…</p>';
  return MD.step==='list'?mdListHtml():MD.step==='review'?mdReviewHtml():MD.step==='sum'?mdSumHtml():MD.step==='edit'?mdEditHtml():mdBranchHtml();
}
async function mdUpsert(id,section,name,active,unit,grp){
  const r=await rpc('ev_med_item_upsert',{p_token:S.token,p_item:id,p_section:section,p_name:name,p_active:active,p_unit:unit||null,p_grp:grp||null},8000).catch(e=>null);
  if(r&&r.ok){
    const fresh=await mdLoadCat(true);
    if(!fresh&&MD.cat&&MD.cat.items){ /* список не перечитался: показываем сохранённое локально, чтобы правка не «пропадала» */
      const it=MD.cat.items.find(x=>Number(x.id)===Number(r.item));const row={id:Number(r.item),section,name,unit:unit||null,grp:grp||null,active:active!==false,note:null};
      if(it)Object.assign(it,row);else MD.cat.items.push(row);MD.cat.items=mdSorted(MD.cat.items);
      toast('Сохранено, но список не обновился с сервера: откройте раздел заново');
    }else toast('Справочник обновлён');
    if(id==null&&r.item){MD.etab=section;MD.eq='';MD.hl=Number(r.item)}
    paint();
    if(MD.hl){const el=document.getElementById('mded'+MD.hl);if(el&&el.scrollIntoView)el.scrollIntoView({block:'center'});setTimeout(()=>{MD.hl=null;if(S.view==='med'&&MD.step==='edit')paint()},4000)}
  }else toast(r&&r.error==='forbidden'?'Справочник правит только руководитель.':'Не удалось сохранить.');
}
document.addEventListener('click',async ev=>{
  const el=ev.target.closest&&ev.target.closest('[data-mact]');if(!el||S.view!=='med')return;
  const a=el.dataset.mact,id=el.dataset.id;
  if(a==='branch')await mdPickBranch(id);
  else if(a==='tab'){MD.tab=id;MD.q='';paint()}
  else if(a==='step')await mdSet(id,(MD.lines[id]||0)+Number(el.dataset.s));
  else if(a==='undo'){const u=mdUndo;mdUndo=null;if(u)await mdSet(u.id,u.qty)}
  else if(a==='keepmine')await mdResolve(id,true);
  else if(a==='takenew')await mdResolve(id,false);
  else if(a==='review'){if(mdQHere().length)return;MD.step='review';paint();window.scrollTo(0,0)}
  else if(a==='list'){MD.step='list';paint();window.scrollTo(0,0)}
  else if(a==='ok'){MD.ok[id]=true;paint()}
  else if(a==='fix'){MD.step='list';MD.q=mdName(id).slice(0,3);paint()}
  else if(a==='done'){toast('Заявка отправлена. Её можно менять, пока закупщик не закрыл.');MD.step='branch';paint();window.scrollTo(0,0)}
  else if(a==='mkorder'){MD.step='branch';MD.fromSum=true;paint();window.scrollTo(0,0)}
  else if(a==='back'){
    if(MD.step==='branch'){if(MD.fromSum){MD.fromSum=false;MD.step='sum';paint()}else goHome()}
    else if(MD.step==='sum')goHome();
    else{const was=MD.step;MD.step=(mdPriv()&&was==='edit')?'sum':'branch';paint();if(was==='edit'){await mdLoadCat(false);paint()}}
  }
  else if(a==='sum'){MD.step='sum';MD.sum=null;MD.sumBranch=null;paint();await mdSumLoad()}
  else if(a==='sumbr'){MD.sumBranch=id||null;await mdSumLoad()}
  else if(a==='copy'){try{await navigator.clipboard.writeText(mdSumRows().map(r=>r.join('\t')).join('\n'));toast('Скопировано')}catch(e){toast('Не удалось скопировать')}}
  else if(a==='xls'){if(typeof XLSX==='undefined'){toast('Excel пока недоступен');return}const wb=XLSX.utils.book_new();Object.keys(MD_SEC).forEach(sec=>{const rows=[['Позиция','Ед.','Маркса','Перелёта','70 лет','Итого']];(MD.sum.rows||[]).filter(r=>r.section===sec).forEach(r=>rows.push([r.name,r.unit||'',...MD_BR.map(b=>(r.qty||{})[b.id]||0),r.total]));XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),MD_SEC[sec])});XLSX.writeFile(wb,'Врачебные_заявки.xlsx')}
  else if(a==='close'){if(!confirm('Закрыть открытые заявки'+(MD.sumBranch?' филиала '+mdBrTitle(MD.sumBranch):' всех филиалов')+'? Новая откроется при первом числе.'))return;
    const r=await rpc('ev_med_close',{p_token:S.token,p_branch:MD.sumBranch},8000).catch(e=>null);toast(r&&r.ok?'Закрыто заявок: '+r.closed:'Не удалось закрыть');await mdSumLoad()}
  else if(a==='etab'){MD.etab=id;MD.eq='';paint()}
  else if(a==='edit'){MD.step='edit';MD.etab=MD.tab||'med';MD.eq='';paint();await mdLoadCat(true);paint()}
  else if(a==='add'){const n=document.getElementById('mdnname').value.trim();if(n)await mdUpsert(null,document.querySelector('.md-ns').value,n,true,document.getElementById('mdnunit').value.trim(),document.getElementById('mdngrp').value.trim())}
  else if(a==='save'||a==='vis'){const it=mdItems().find(x=>String(x.id)===id);if(!it)return;const q=c=>document.querySelector(c+'[data-id="'+id+'"]');
    await mdUpsert(it.id,a==='save'?q('.md-es').value:it.section,a==='save'?q('.md-en').value.trim():it.name,a==='vis'?it.active===false:it.active!==false,a==='save'?q('.md-eu').value.trim():it.unit,a==='save'?q('.md-eg').value.trim():it.grp)}
});
function goHome(){S.view='branch';render();window.scrollTo(0,0)}
document.addEventListener('input',ev=>{
  const t=ev.target;if(S.view!=='med'||!t)return;
  if(t.id==='mdsearch'){MD.q=t.value;const pos=t.selectionStart;paint();const n=document.getElementById('mdsearch');if(n){n.focus();n.setSelectionRange(pos,pos)}}
  else if(t.id==='mdesearch'){MD.eq=t.value;const pos=t.selectionStart;paint();const n=document.getElementById('mdesearch');if(n){n.focus();n.setSelectionRange(pos,pos)}}
  else if(t.classList&&t.classList.contains('md-q')){t.value=t.value.replace(/\D/g,'').slice(0,3)}
});
/* нажали на число — оно выделяется целиком, и первая же цифра заменяет «0» (стирать вручную не нужно) */
document.addEventListener('focusin',ev=>{const t=ev.target;if(S.view==='med'&&t&&t.classList&&t.classList.contains('md-q'))setTimeout(()=>{try{t.select()}catch(e){}},0)});
document.addEventListener('change',ev=>{const t=ev.target;if(S.view==='med'&&t&&t.classList&&t.classList.contains('md-q'))mdSet(t.dataset.id,Number(t.value)||0)});

/* ====== красная цифра на плитке «Врачебные заявки»: число отправленных и не закрытых заявок (закупщик и руководитель) ====== */
const MDB={count:0,ok:undefined,at:0,busy:false,changed:false};
async function mdBadgeLoad(force){
  if(!S.token||MDB.busy||MDB.ok===false||(UI2.moduleBuilt||{}).supplies!==true)return;
  if(!force&&Date.now()-MDB.at<5000)return;
  MDB.busy=true;
  try{const r=await rpc('ev_med_pending_count',{p_token:S.token},8000);
    if(r&&r.ok){const was=MDB.count;MDB.ok=true;MDB.count=Number(r.count)||0;MDB.changed=(was!==MDB.count)}
    else if(r&&r.error==='forbidden'){MDB.ok=false;MDB.count=0}
  }catch(e){}
  MDB.busy=false;MDB.at=Date.now();
  if(MDB.changed&&S.view==='branch'&&typeof paint==='function'){MDB.changed=false;paint()}
}
/* на плитке: вызывается при каждой отрисовке главной (обновление при входе на главную); не закупщикам запрос один раз и больше не повторяется */
function medTileBadge(){mdBadgeLoad(false);return MDB.ok&&MDB.count>0?'<span class="med-pend" aria-label="Не закрытых заявок">'+MDB.count+'</span>':''}
setInterval(()=>{if(S.token&&S.view==='branch')mdBadgeLoad(true)},60000);
