'use strict';
/* ====== 2.0 · L36: врачебная заявка — частичная доставка (слово Михаила 25.11, макеты v3) ======
   Закупщик: у строки три действия — ✓ привезли всё / число (привезли меньше) / «Не везём» с причиной. Остаток по умолчанию «Ждёт доставки».
   «Закрыть заявку» (ev_med_close_order) атомарно сохраняет отметки и создаёт «ждёт» на остаток. «Ждёт доставки» — по филиалам, свёрнуто;
   давние (> 4 дней) сверху и подсвечены (ev_med_wait_list, ev_med_wait_mark).
   Врач: свёрнутая плашка «Ждёт доставки: N · давно K» над заявкой своего филиала, только просмотр; повтор — предупреждение, не запрет;
   в истории закрытой заявки — серая пометка «Привезено 5 из 10 · остальное …» (ev_med_history).
   Нет функций L36 на сервере (SQL ещё не применён) — блоки «ждёт» и история просто не показываются. */
const MDD={wait:null,waitOpen:false,repOk:{},all:null,tab:'open',brOpen:null,wm:{},dm:{},hist:null,busy:false};
/* подписи кнопок (коды в базе прежние): «Нет на складе» = no_supplier, «Заказали лишнее» = extra, «Другое» = other (с текстом) */
const MDD_REASON={no_supplier:'Нет на складе',extra:'Заказали лишнее',other:'Другое'};
const mddDm=s=>{const m=/^\d{4}-(\d{2})-(\d{2})/.exec(String(s||''));return m?m[2]+'.'+m[1]:''};
const mddUnit=r=>r&&r.unit?' '+esc(r.unit):' шт.';
/* ---- данные ---- */
async function mddWaitLoad(branch){ // врач: «ждёт» своего филиала
  MDD.wait=null;
  try{const r=await rpc('ev_med_wait_list',{p_token:S.token,p_branch:branch},8000);if(r&&r.ok&&MD.branch===branch)MDD.wait=r}catch(e){}
}
async function mddAllLoad(){ // закупщик: все филиалы
  try{const r=await rpc('ev_med_wait_list',{p_token:S.token,p_branch:null},8000);MDD.all=(r&&r.ok)?r:null}catch(e){MDD.all=null}
}
const mddWaitOf=item=>((MDD.wait&&MDD.wait.rows)||[]).filter(w=>Number(w.item)===Number(item));
/* ---- врач: плашка «Ждёт доставки» (в1 свёрнута, в2 раскрыта) ---- */
function mddPlashka(){
  const rows=(MDD.wait&&MDD.wait.rows)||[];if(!rows.length)return '';
  const old=rows.filter(w=>w.old).length,olds=old?' <small class="mdd-old"><span class="mdd-dot"></span>'+old+' давно</small>':'';
  if(!MDD.waitOpen)return '<button class="mdd-pl" data-dact="wtoggle"><span>Ждёт доставки: '+rows.length+olds+'</span><span class="mdd-r">›</span></button>';
  return '<div class="mdd-card mdd-wait"><button class="mdd-brr open" data-dact="wtoggle"><span>Ждёт доставки: '+rows.length+olds+'</span><span class="mdd-r">›</span></button>'
    +'<p class="mdd-hint">Уже заказано, ещё не привезли. Только для просмотра.</p>'
    +rows.map(w=>'<div class="mdd-it"><span>'+esc(w.name)+' — <b>'+w.qty+mddUnit(w)+'</b>'+(w.old?' <span class="mdd-badge">давно</span>':'')+'</span><span class="mdd-ro">с '+mddDm(w.since)+'</span></div>').join('')+'</div>';
}
/* повтор: позиция уже ждёт — спросить, не запрещать. true — можно ставить сразу */
function mddRepeatAsk(id,q){
  const w=mddWaitOf(id);if(!w.length||MDD.repOk[id])return true;
  const n=w.reduce((a,x)=>a+Number(x.qty||0),0),nm=w[0].name;
  overlay('<h2>'+esc(nm)+' уже ждёт доставки</h2><p class="hint">'+esc(nm)+' уже ждёт доставки: '+n+mddUnit(w[0])+', с '+mddDm(w[0].since)+'. Заказать ещё?</p>'
    +'<button class="btn" data-dact="repyes" data-id="'+Number(id)+'" data-q="'+Number(q)+'">Да, ещё</button><button class="btn sec" style="margin-top:8px" data-dact="repno">Не надо</button>');
  return false;
}
/* ---- врач: история закрытых заявок (д) ---- */
async function mddHistOpen(){
  MD.step='hist';MDD.hist=null;paint();window.scrollTo(0,0);
  try{const r=await rpc('ev_med_history',{p_token:S.token,p_branch:MD.branch},8000);MDD.hist=(r&&r.ok)?r:{err:'История пока недоступна.'}}catch(e){MDD.hist={err:e.net?'Нет связи.':'История пока недоступна.'}}
  paint();
}
/* причина «не везём» для врача: «нет на складе» / «заказали лишнее» / текст «другого» */
const mddWhy=(r,note)=>r==='other'?((note||'').trim()||'другое'):(MDD_REASON[r]||'').toLowerCase();
function mddLineNote(l){
  if(l.delivered==null)return '';                                     // старая заявка без отметок — как раньше
  const u=mddUnit(l);
  if(l.delivered>=l.qty)return '<div class="mdd-gm ok">Привезено всё: '+l.qty+u+'</div>';
  const head='Привезено '+l.delivered+' из '+l.qty;
  if(l.rest==='drop')return '<div class="mdd-gm">'+head+' · остальное не везём: '+esc(mddWhy(l.reason,l.note))+'</div>';
  if(l.wait_status==='dropped')return '<div class="mdd-gm">'+head+' · остальное не везём: '+esc(mddWhy(l.wait_reason,l.wait_note))+'</div>';
  if(l.wait_status==='done')return '<div class="mdd-gm">'+head+' · остальное привезли позже</div>';
  return '<div class="mdd-gm">'+head+' · остальное ждёт доставки</div>';
}
function mddHistHtml(){
  let h='<button class="md-back" data-mact="back">‹ Назад к заявке</button><h1 class="screen-title">Закрытые заявки</h1><div class="mute">'+esc(mdBrTitle(MD.branch))+'</div>';
  const s=MDD.hist;if(!s)return h+'<p class="mute">Загрузка…</p>';if(s.err)return h+'<p class="mute">'+esc(s.err)+'</p>';
  if(!(s.orders||[]).length)return h+'<p class="mute">Закрытых заявок пока нет.</p>';
  return h+s.orders.map(o=>'<div class="mdd-card"><h2>Заявка от '+mddDm(o.opened_at)+' <small>закрыта '+mddDm(o.closed_at)+'</small></h2>'
    +(o.lines||[]).map(l=>'<div class="mdd-it2"><div class="nm">'+esc(l.name)+' — '+l.qty+mddUnit(l)+'</div>'+mddLineNote(l)+'</div>').join('')+'</div>').join('');
}
/* ---- закупщик: вкладки сводной ---- */
function mddTabs(openN){
  if(!MDD.all)return '';
  const n=(MDD.all.rows||[]).length;
  return '<div class="mdd-tabs"><button class="mdd-tab'+(MDD.tab==='open'?' on':'')+'" data-dact="tab" data-id="open">Открытые ('+openN+')</button><button class="mdd-tab'+(MDD.tab==='wait'?' on':'')+'" data-dact="tab" data-id="wait">Ждёт доставки ('+n+')</button></div>';
}
/* (а/а2) отметки привоза и закрытие заявки филиала */
function mddDeliverRows(){const b=MD.sumBranch;return ((MD.sum&&MD.sum.rows)||[]).filter(r=>Number((r.qty||{})[b])>0).map(r=>({item:r.item,name:r.name,unit:r.unit,qty:Number(r.qty[b])}))}
const mddDm0=item=>MDD.dm[item]||(MDD.dm[item]={d:'',rest:'wait',reason:'',note:''});
/* выбор одним нажатием: opts — [[код, подпись]], cur — выбранный код; «Другое» открывает поле текста */
function mddOpts(opts,cur,act,attr,note){
  return '<div class="mdd-opts'+(opts.length===3?' n3':'')+'">'+opts.map(o=>'<button class="mdd-op'+(cur===o[0]?(o[0]==='wait'?' on':' on no'):'')+'" data-dact="'+act+'" '+attr+' data-v="'+o[0]+'">'+o[1]+'</button>').join('')+'</div>'
    +(cur==='other'?'<input class="mdd-note" '+attr+' maxlength="200" placeholder="Причина словами" value="'+esc(note||'')+'">':'');
}
const MDD_OPTS_REST=[['wait','Ждём на склад'],['no_supplier','Нет на складе'],['extra','Заказали лишнее'],['other','Другое']];
const MDD_OPTS_DROP=[['no_supplier','Нет на складе'],['extra','Заказали лишнее'],['other','Другое']];
function mddDeliverHtml(){
  const rows=mddDeliverRows();let full=0,part=0,none=0;
  let h='<button class="md-back" data-mact="back">‹ Назад</button><h1 class="screen-title">Заявка · '+esc(mdBrTitle(MD.sumBranch))+'</h1><div class="mute">'+rows.length+' поз.</div>';
  if(!rows.length)return h+'<p class="mute">В заявке нет позиций.</p>';
  h+='<div class="mdd-card"><p class="mdd-hint">✓ — привезли всё. Число — привезли меньше. Остаток: «Ждём на склад» или почему не везём.</p>';
  rows.forEach(r=>{
    const m=mddDm0(r.item),d=m.d===''?null:Number(m.d),all=d===r.qty,left=r.qty-(d||0),a='data-item="'+r.item+'"';
    if(all)full++;else if(d>0)part++;else none++;
    h+='<div class="mdd-row"><div><div class="nm">'+esc(r.name)+'</div><div class="mdd-mt">заказано '+r.qty+mddUnit(r)+'</div></div>'
      +'<div class="mdd-ctl"><input class="mdd-qty'+(d!=null&&!all?' v':'')+'" inputmode="numeric" '+a+' data-max="'+r.qty+'" value="'+(d!=null&&!all?d:'')+'" placeholder="—" aria-label="Сколько привезли"><span class="mdd-of">из '+r.qty+'</span>'
      +'<button class="mdd-chk'+(all?' on':'')+'" data-dact="dfull" '+a+' data-max="'+r.qty+'" aria-label="Привезли всё">'+(all?'✓':'')+'</button></div>';
    if(all)h+='<div class="mdd-st ok">Привезли всё</div>';
    else h+='<div class="mdd-rest"><div class="mdd-rl">'+(d>0?'Остальные ':'Не привезли ')+left+mddUnit(r)+':</div>'
      +mddOpts(MDD_OPTS_REST,m.rest==='drop'?m.reason:'wait','opt',a,m.note)+'</div>';
    h+='</div>';
  });
  h+='</div><div class="mdd-sum">Привезли полностью: '+full+' · частично: '+part+' · не привезли: '+none+'</div>';
  return h+'<button class="btn mdd-go" data-dact="close"'+(MDD.busy?' disabled':'')+'>Закрыть заявку</button>';
}
function mddMarksOk(list){return list.every(m=>m.rest!=='drop'||(m.reason&&(m.reason!=='other'||(m.note||'').trim())))}
async function mddClose(){
  if(MDD.busy)return;const rows=mddDeliverRows();
  const marks=rows.map(r=>{const m=mddDm0(r.item),d=m.d===''?0:Math.max(0,Math.min(r.qty,Number(m.d)||0));const left=r.qty-d;
    return {item:r.item,qty:r.qty,delivered:d,rest:left>0?m.rest:null,reason:left>0&&m.rest==='drop'?m.reason:null,note:left>0&&m.rest==='drop'&&m.reason==='other'?(m.note||'').trim():null}});
  if(!mddMarksOk(marks)){toast('Для «Другое» напишите причину словами',6000);return}
  const w=marks.filter(m=>m.rest==='wait').length;
  if(!confirm('Закрыть заявку '+mdBrTitle(MD.sumBranch)+'?'+(w?' В «Ждёт доставки» уйдёт позиций: '+w+'.':'')))return;
  MDD.busy=true;paint();
  let r=null;try{r=await rpc('ev_med_close_order',{p_token:S.token,p_branch:MD.sumBranch,p_marks:marks},12000)}catch(e){r=e.net?{error:'net'}:null}
  MDD.busy=false;
  if(r&&r.ok){toast(r.closed?'Заявка закрыта.'+(r.wait?' В «Ждёт доставки»: '+r.wait+'.':''):'Заявка уже была закрыта.',6000);MDD.dm={};MD.step='sum';MD.sum=null;await mdSumLoad();await mddAllLoad();paint();return}
  if(r&&r.error==='conflict'){toast('Заявку только что изменили — список обновлён. Проверьте отметки и закройте снова.',7000);MD.sum=null;await mdSumLoad();MD.step='deliver';paint();return}
  toast(r&&r.error==='net'?'Нет связи. Заявка не закрыта — повторите.':r&&r.error==='forbidden'?'Закрывает заявку закупщик.':r&&r.error==='qty'?'Привезли больше, чем заказано — проверьте число.':r&&r.error==='reason'?'Выберите причину «Не везём».':'Не удалось закрыть заявку.',6000);paint();
}
/* (б1/б2/б3) «Ждёт доставки» по всем филиалам */
const mddWm0=id=>MDD.wm[id]||(MDD.wm[id]={d:'',drop:false,reason:'',note:''});
function mddWaitAllHtml(){
  const s=MDD.all,rows=(s&&s.rows)||[];
  if(!rows.length)return '<div class="mdd-card"><p class="mute">Ничего не ждёт доставки.</p></div>';
  let h='<div class="mdd-card">';
  MD_BR.forEach(b=>{
    const rs=rows.filter(w=>w.branch===b.id);if(!rs.length)return;
    const old=rs.filter(w=>w.old).length,open=MDD.brOpen===b.id;
    h+='<button class="mdd-brr'+(open?' open':'')+'" data-dact="br" data-id="'+b.id+'"><span>'+esc(b.title)+' · '+rs.length+(old?' <small class="mdd-old"><span class="mdd-dot"></span>'+old+' давно</small>':'')+'</span><span class="mdd-r">›</span></button>';
    if(!open)return;
    rs.slice().sort((x,y)=>(y.old?1:0)-(x.old?1:0)).forEach(w=>{
      const m=mddWm0(w.id),d=m.d===''?null:Number(m.d),all=d===Number(w.qty),a='data-wid="'+w.id+'"';
      h+='<div class="mdd-row'+(w.old?' old':'')+'"><div><div class="nm">'+esc(w.name)+(w.old?' <span class="mdd-badge">давно</span>':'')+'</div><div class="mdd-mt">ждёт '+w.qty+mddUnit(w)+' · с '+mddDm(w.since)+'</div></div>'
        +'<div class="mdd-ctl"><input class="mdd-wq'+(d!=null&&!all?' v':'')+'" inputmode="numeric" '+a+' data-max="'+w.qty+'" value="'+(d!=null&&!all?d:'')+'" placeholder="—" aria-label="Сколько привезли"'+(m.drop?' disabled':'')+'><span class="mdd-of">из '+w.qty+'</span>'
        +'<button class="mdd-chk'+(all?' on':'')+'" data-dact="wfull" '+a+' data-max="'+w.qty+'" aria-label="Привезли всё"'+(m.drop?' disabled':'')+'>'+(all?'✓':'')+'</button></div>'
        +(all?'<div class="mdd-st ok">Привезли всё</div>':d>0?'<div class="mdd-st part">Привезли '+d+' из '+w.qty+' — '+(w.qty-d)+mddUnit(w)+' ещё ждёт</div>':'')
        +'<div class="mdd-rest"><div class="mdd-rl">Не везём:</div>'+mddOpts(MDD_OPTS_DROP,m.drop?m.reason:'','wopt',a,m.note)+'</div></div>';
    });
  });
  h+='</div><div class="mdd-hint mdd-out">Оранжевым — ждёт больше 4 дней. «Нет на складе», «Заказали лишнее», «Другое» — строка уйдёт из «Ждёт доставки», у врача она пропадёт.</div>';
  return h+'<button class="btn mdd-go" data-dact="wsave"'+(MDD.busy?' disabled':'')+'>Сохранить отметки</button>';
}
async function mddWaitSave(){
  if(MDD.busy)return;
  const marks=Object.keys(MDD.wm).map(id=>{const m=MDD.wm[id];return m.drop?{id:Number(id),drop:true,reason:m.reason||null,note:m.reason==='other'?(m.note||'').trim():null}:(Number(m.d)>0?{id:Number(id),delivered:Number(m.d)}:null)}).filter(Boolean);
  if(!marks.length){toast('Нет отметок: поставьте галочку, число или «Не везём».');return}
  if(marks.some(m=>m.drop&&(!m.reason||(m.reason==='other'&&!m.note)))){toast('Для «Другое» напишите причину словами',6000);return}
  MDD.busy=true;paint();
  let r=null;try{r=await rpc('ev_med_wait_mark',{p_token:S.token,p_marks:marks},12000)}catch(e){r=e.net?{error:'net'}:null}
  MDD.busy=false;
  if(r&&r.ok){toast('Сохранено отметок: '+r.marked);MDD.wm={};await mddAllLoad();paint();return}
  toast(r&&r.error==='net'?'Нет связи. Отметки не сохранены — повторите.':r&&r.error==='forbidden'?'Отмечает закупщик.':'Не удалось сохранить отметки.',6000);paint();
}
/* ---- события ---- */
document.addEventListener('click',async ev=>{
  const el=ev.target.closest&&ev.target.closest('[data-dact]');if(!el||S.view!=='med')return;
  const a=el.dataset.dact,item=el.dataset.item,wid=el.dataset.wid;
  if(a==='wtoggle'){MDD.waitOpen=!MDD.waitOpen;paint()}
  else if(a==='repyes'){MDD.repOk[el.dataset.id]=true;closeOv();await mdSet(el.dataset.id,Number(el.dataset.q))}
  else if(a==='repno')closeOv();
  else if(a==='tab'){MDD.tab=el.dataset.id;paint();if(MDD.tab==='wait'){await mddAllLoad();paint()}}
  else if(a==='br'){MDD.brOpen=MDD.brOpen===el.dataset.id?null:el.dataset.id;paint()}
  else if(a==='dfull'){const m=mddDm0(item);m.d=(Number(m.d)===Number(el.dataset.max))?'':String(el.dataset.max);paint()}
  else if(a==='opt'){const m=mddDm0(item),v=el.dataset.v;if(v==='wait'){m.rest='wait';m.reason='';m.note=''}else{m.rest='drop';if(m.reason!==v)m.note='';m.reason=v}paint()}
  else if(a==='wfull'){const m=mddWm0(wid);m.d=(Number(m.d)===Number(el.dataset.max))?'':String(el.dataset.max);paint()}
  else if(a==='wopt'){const m=mddWm0(wid),v=el.dataset.v;if(m.drop&&m.reason===v){m.drop=false;m.reason='';m.note=''}else{m.drop=true;m.d='';if(m.reason!==v)m.note='';m.reason=v}paint()} /* повторное нажатие снимает выбор */
  else if(a==='close')await mddClose();
  else if(a==='wsave')await mddWaitSave();
});
document.addEventListener('change',ev=>{
  const t=ev.target;if(S.view!=='med'||!t||!t.classList)return;
  const clamp=v=>{const n=String(v).replace(/\D/g,'').slice(0,3);return n===''?'':String(Math.min(Number(t.dataset.max)||0,Number(n)))};
  if(t.classList.contains('mdd-qty')){mddDm0(t.dataset.item).d=clamp(t.value);paint()}
  else if(t.classList.contains('mdd-wq')){mddWm0(t.dataset.wid).d=clamp(t.value);paint()}
  else if(t.classList.contains('mdd-note')){const m=t.dataset.item?mddDm0(t.dataset.item):mddWm0(t.dataset.wid);m.note=t.value.slice(0,200)}
});
document.addEventListener('input',ev=>{const t=ev.target;if(S.view==='med'&&t&&t.classList&&(t.classList.contains('mdd-qty')||t.classList.contains('mdd-wq')))t.value=t.value.replace(/\D/g,'').slice(0,3)});
