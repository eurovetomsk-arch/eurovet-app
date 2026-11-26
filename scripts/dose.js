'use strict';
/* Калькулятор доз 2.0.13: клинический пилот без записи в Supabase.
   Каталог и структурированные правила загружаются только при открытии модуля. */
const DOSE={
  state:'idle',data:null,rules:null,error:null,species:'dog',weight:'',doseValue:'',route:'',query:'',group:'all',status:'calc',selected:null,lastItem:null,patientCarried:false,limit:24,listScroll:0,scrollTimer:null,
  feedback:LS.get('ev_dose_feedback_test_v1',{})
};
const DOSE_STATUS={
  'ПРОЕКТ СХЕМЫ':{key:'draft',label:'Проект схемы',help:'Есть структурированная схема для тестирования врачами.'},
  'РУЧНОЙ РЕЖИМ':{key:'manual',label:'Только вручную',help:'Нужны дополнительные клинические параметры, титрование или мониторинг.'},
  'ЗАБЛОКИРОВАНО':{key:'blocked',label:'Заблокировано',help:'Не хватает точной формы, концентрации или надёжного основания.'},
  'НЕ ПРИМЕНЯЕТСЯ':{key:'na',label:'Без расчёта',help:'Это материал, среда или процедура без универсальной лекарственной дозы.'},
  'HARD STOP':{key:'stop',label:'Стоп',help:'Позиция исключена из обычного калькулятора по критическому ограничению.'}
};
function doseStatus(x){return DOSE_STATUS[x]||{key:'blocked',label:x||'Не определено',help:'Статус требует проверки.'}}
const DOSE_ALIASES={
  'алервет':'аллервет','аллерветт':'аллервет','allervet':'аллервет',
  'пиростоп':'пиро стоп','pirostop':'пиро стоп','лидокоин':'лидокаин',
  'metoclopramide':'метоклопрамид','gabapentin':'габапентин',
  'tramadol':'трамвет','ondansetron':'ондансетрон'
};
function doseNorm(s){return String(s||'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/(\d)[,.](?=\d)/g,'$1.').replace(/[^a-zа-я0-9%+.]+/gi,' ').trim()}
function doseQuery(s){const q=doseNorm(s);return q.split(' ').filter(Boolean).map(x=>DOSE_ALIASES[x]||x).join(' ')}
function doseMatch(item,q){
  const query=doseQuery(q);if(!query)return true;
  const hay=doseNorm([item.source_name,item.name,item.concentration].join(' ')),compact=hay.replace(/\s+/g,'');
  return query.split(' ').filter(Boolean).every(p=>hay.includes(p)||compact.includes(p.replace(/\s+/g,'')));
}
function doseResetPatient(){DOSE.species='dog';DOSE.weight='';DOSE.doseValue='';DOSE.route='';DOSE.patientCarried=false}
function doseOpen(){closeOv();doseResetPatient();DOSE.selected=null;DOSE.lastItem=null;DOSE.query='';DOSE.group='all';DOSE.status='calc';DOSE.limit=24;DOSE.listScroll=0;S.view='dose';render();window.scrollTo(0,0);doseLoad()}
async function doseLoad(){
  if(DOSE.state==='loading'||DOSE.state==='ready')return;
  DOSE.state='loading';DOSE.error=null;if(S.view==='dose')render();
  try{
    const [catalogRes,rulesRes]=await Promise.all([
      fetch('data/dose-v1.json',{cache:'no-cache'}),
      fetch('data/dose-rules-v1.json',{cache:'no-cache'})
    ]);
    if(!catalogRes.ok||!rulesRes.ok)throw Error('HTTP '+catalogRes.status+'/'+rulesRes.status);
    const [d,rr]=await Promise.all([catalogRes.json(),rulesRes.json()]);
    if(!d||d.schema!=='evrovet.dose_catalog_test/v1'||d.test_only!==true||!Array.isArray(d.items)||d.items.length!==107)throw Error('catalog contract');
    if(!rr||rr.schema!=='evrovet.dose_rules_test/v1'||rr.test_only!==true||!Array.isArray(rr.rules)||rr.rules.length!==14)throw Error('rules contract');
    DOSE.data=d;DOSE.rules=rr;DOSE.state='ready';
  }catch(e){DOSE.state='error';DOSE.error='Калькулятор не загрузился. Проверьте связь и попробуйте ещё раз.'}
  if(S.view==='dose')render();
}
function doseRulesFor(item,species){return !DOSE.rules?[]:DOSE.rules.rules.filter(r=>r.item_id===item.id&&(!species||r.species===species))}
function doseItems(){
  if(!DOSE.data)return[];
  return DOSE.data.items.filter(x=>{
    if(DOSE.group!=='all'&&x.group!==DOSE.group)return false;
    if(DOSE.status==='calc'&&!doseRulesFor(x).length)return false;
    if(DOSE.status!=='all'&&DOSE.status!=='calc'&&doseStatus(x.release_status).key!==DOSE.status)return false;
    return doseMatch(x,DOSE.query);
  });
}
function doseCatalogMatches(){return !DOSE.data||!DOSE.query?[]:DOSE.data.items.filter(x=>doseMatch(x,DOSE.query))}
function doseFeedbackCount(){return Object.keys(DOSE.feedback||{}).length}
function doseTop(){
  return '<section class="dose-head"><button class="dose-back" data-act="go" data-v="branch">‹ Назад</button><span class="dose-test">ПИЛОТ</span><h1>Расчёт дозы</h1><p>Быстрый расчёт на одно введение. Препарат, дозу и путь введения подтверждает врач.</p></section>';
}
function doseLoading(){return doseTop()+'<div class="card dose-loading" aria-live="polite"><span></span><b>Открываю калькулятор…</b><small>Каталог загружается только на этом экране.</small></div>'}
function doseFilters(){
  const gs=[['all','Все 107'],['Медицинские','Медицинские 78'],['Ветеринарные','Ветеринарные 29']];
  const ss=[['calc','Расчёт доступен · 8'],['all','Весь справочник'],['manual','Только вручную'],['blocked','Заблокировано'],['na','Без расчёта']];
  return '<div class="card dose-search"><label for="dose-q">Найти препарат</label><input id="dose-q" class="srch" data-dose-input="search" type="search" autocomplete="off" enterkeyhint="search" placeholder="Название или концентрация" value="'+esc(DOSE.query)+'">'
    +'<div class="dose-filter-scroll" aria-label="Группа">'+gs.map(x=>'<button data-dose-act="group" data-value="'+esc(x[0])+'" class="chip'+(DOSE.group===x[0]?' on':'')+'">'+esc(x[1])+'</button>').join('')+'</div>'
    +'<div class="dose-filter-scroll dose-status-filter" aria-label="Статус">'+ss.map(x=>'<button data-dose-act="status" data-value="'+esc(x[0])+'" class="chip'+(DOSE.status===x[0]?' on':'')+'">'+esc(x[1])+'</button>').join('')+'</div></div>';
}
function doseSpeciesLabel(rules){
  const species=new Set(rules.map(r=>r.species));
  return species.size===2?'Собака · кошка':species.has('dog')?'Только собака':'Только кошка';
}
function doseList(){
  const all=doseItems(),shown=all.slice(0,DOSE.limit);
  if(!all.length){const elsewhere=doseCatalogMatches();return '<div class="card dose-empty"><b>По текущему фильтру ничего не найдено</b>'+(elsewhere.length?'<p>В полном справочнике найдено: '+elsewhere.length+'.</p><button class="btn" data-dose-act="show-all">Показать в справочнике</button>':'<p>Проверьте название или попробуйте другую формулировку.</p>')+'</div>'}
  return '<div class="dose-list-head"><b>Найдено: '+all.length+'</b><small>Отзывов на этом устройстве: '+doseFeedbackCount()+'</small></div><div class="dose-list">'
    +shown.map(x=>{const s=doseStatus(x.release_status),fb=DOSE.feedback[x.id],rules=doseRulesFor(x);return '<button class="dose-row" data-dose-act="open" data-id="'+esc(x.id)+'"><span class="dose-row-main"><b>'+esc(x.source_name)+'</b>'+(x.name&&x.name!==x.source_name?'<small>'+esc(x.name)+'</small>':'')+'<em>'+esc(x.concentration||'Концентрация не указана')+'</em></span><span class="dose-row-side">'+(rules.length?'<i class="dose-badge calc">Рассчитать</i><small>'+esc(doseSpeciesLabel(rules))+'</small>':'<i class="dose-badge '+s.key+'">'+esc(s.label)+'</i>')+(fb?'<small class="dose-reviewed">✓ отзыв</small>':'')+'</span></button>'}).join('')+'</div>'
    +(shown.length<all.length?'<button class="btn sec dose-more" data-dose-act="more">Показать ещё '+Math.min(24,all.length-shown.length)+'</button>':'');
}
function doseSpeciesControls(){
  return '<div class="dose-patient card"><div class="dose-patient-head"><h2>Пациент</h2><button data-dose-act="new-patient">Новый пациент</button></div><div class="dose-species"><button data-dose-act="species" data-value="dog" class="'+(DOSE.species==='dog'?'on':'')+'">Собака</button><button data-dose-act="species" data-value="cat" class="'+(DOSE.species==='cat'?'on':'')+'">Кошка</button></div><label for="dose-weight">Масса пациента, кг</label><div class="dose-weight-wrap"><input id="dose-weight" data-dose-input="weight" inputmode="decimal" autocomplete="off" placeholder="Например, 4,5" value="'+esc(DOSE.weight)+'"><span>кг</span></div><div id="dose-weight-warning">'+doseWeightWarning()+'</div></div>';
}
function doseTextBlock(title,text,cls){return text?'<section class="dose-info '+(cls||'')+'"><h3>'+esc(title)+'</h3><p>'+esc(text).replace(/\n/g,'<br>')+'</p></section>':''}
function doseDecimal(value){
  const s=String(value==null?'':value).trim().replace(',','.');if(s.length>12||!/^\d+(?:\.\d+)?$/.test(s))return null;
  const p=s.split('.'),den=10n**BigInt((p[1]||'').length),num=BigInt(p[0]+(p[1]||''));return num>0n?{num,den}:null;
}
function doseMul(a,b){return{num:a.num*b.num,den:a.den*b.den}}
function doseDiv(a,b){return{num:a.num*b.den,den:a.den*b.num}}
function doseCmp(a,b){const x=a.num*b.den,y=b.num*a.den;return x<y?-1:x>y?1:0}
function doseCeilDiv(a,b){const n=a.num*b.den,d=a.den*b.num;return Number((n+d-1n)/d)}
function doseFmt(frac,max=3){
  const scale=10n**BigInt(max),scaled=(frac.num*scale+frac.den/2n)/frac.den,whole=scaled/scale;
  let dec=String(scaled%scale).padStart(max,'0').replace(/0+$/,'');return String(whole)+(dec?','+dec:'');
}
function doseActiveRule(item){return doseRulesFor(item,DOSE.species)[0]||null}
function doseChosenDose(rule){return rule&&rule.dose_min_mg_kg===rule.dose_max_mg_kg?rule.dose_min_mg_kg:DOSE.doseValue}
function doseChosenRoute(rule){return rule&&rule.routes.length===1?rule.routes[0].id:DOSE.route}
function doseWeightWarning(){
  const w=doseDecimal(DOSE.weight);if(!w)return'';
  const out=[];if(DOSE.patientCarried)out.push('Вид и вес '+esc(DOSE.weight)+' кг перенесены из предыдущей карточки — подтвердите, что пациент тот же.');
  const unusual=DOSE.species==='cat'?doseCmp(w,doseDecimal('25'))>0:doseCmp(w,doseDecimal('150'))>0;
  if(unusual)out.push('Необычная масса для выбранного вида — перепроверьте значение.');
  return out.map(x=>'<p class="dose-soft-warning">'+x+'</p>').join('');
}
function doseCalculation(rule){
  if(!rule)return{ok:false,reason:'Для выбранного вида быстрый расчёт пока не подготовлен.'};
  const w=doseDecimal(DOSE.weight),wMin=doseDecimal('0.05'),wMax=doseDecimal('200');if(!w||doseCmp(w,wMin)<0||doseCmp(w,wMax)>0)return{ok:false,reason:'Введите массу пациента от 0,05 до 200 кг.'};
  const dose=doseDecimal(doseChosenDose(rule));if(!dose)return{ok:false,reason:'Выберите дозу в разрешённом диапазоне.'};
  const min=doseDecimal(rule.dose_min_mg_kg),max=doseDecimal(rule.dose_max_mg_kg);
  if(!min||!max||doseCmp(dose,min)<0||doseCmp(dose,max)>0)return{ok:false,reason:'Доза должна быть от '+rule.dose_min_mg_kg.replace('.',',')+' до '+rule.dose_max_mg_kg.replace('.',',')+' мг/кг.'};
  const routeId=doseChosenRoute(rule),route=rule.routes.find(x=>x.id===routeId);if(!route)return{ok:false,reason:'Выберите место введения.'};
  const mg=doseMul(w,dose),ml=doseDiv(mg,doseDecimal(rule.concentration_mg_ml));
  return{ok:true,weight:doseFmt(w),dose:doseFmt(dose),mg:doseFmt(mg),ml:doseFmt(ml),mlExact:ml,route};
}
function doseImmediateWarnings(rule){
  if(!rule||!['high','controlled'].includes(rule.risk)||!(rule.warnings_short||[]).length)return'';
  const title=rule.risk==='controlled'?'Контролируемый препарат':'Критически важно перед расчётом';
  return '<section class="dose-immediate-warning '+esc(rule.risk)+'"><b>'+esc(title)+'</b>'+rule.warnings_short.map(x=>'<p>• '+esc(x)+'</p>').join('')+'</section>';
}
function doseResultHtml(rule){
  const c=doseCalculation(rule);
  if(!c.ok)return '<div class="dose-result pending" id="dose-calc-result" aria-live="polite"><b>Чтобы получить объём</b><p>'+esc(c.reason)+'</p></div>';
  const extras=[];
  if(rule.max_per_site_ml){const max=doseDecimal(rule.max_per_site_ml),sites=doseCmp(c.mlExact,max)>0?doseCeilDiv(c.mlExact,max):1;extras.push(sites>1?'Превышает предел '+rule.max_per_site_ml.replace('.',',')+' мл в одно место — разделите минимум на '+sites+' места':'Не более '+rule.max_per_site_ml.replace('.',',')+' мл в одно место')}
  if(rule.max_daily_mg_kg)extras.push('Суточный предел: '+String(rule.max_daily_mg_kg).replace('.',',')+' мг/кг');
  return '<div class="dose-result ready" id="dose-calc-result" aria-live="polite"><small>НА ОДНО ВВЕДЕНИЕ</small><strong>'+esc(c.ml)+' мл</strong><h3>'+esc(c.route.label)+'</h3><p class="dose-frequency">'+esc(rule.frequency)+'</p>'
    +'<p class="dose-trace">'+esc(c.dose)+' мг/кг × '+esc(c.weight)+' кг = '+esc(c.mg)+' мг<br>'+esc(c.mg)+' мг ÷ '+esc(rule.concentration_mg_ml.replace('.',','))+' мг/мл = '+esc(c.ml)+' мл</p>'
    +(extras.length?'<div class="dose-result-warn">'+extras.map(esc).join('<br>')+'</div>':'')+'</div>';
}
function doseCalcPanel(item,rule){
  if(!rule){const s=doseStatus(item.release_status),other=doseRulesFor(item),only=other.length?doseSpeciesLabel(other):'',reason=only?'Подготовлен расчёт: '+only.toLocaleLowerCase('ru-RU')+'. Выберите поддерживаемый вид пациента.':item.release_status==='ПРОЕКТ СХЕМЫ'?'Правило быстрого расчёта пока не подготовлено.':s.help;return '<section class="dose-calc-locked"><b>Для '+(DOSE.species==='cat'?'кошки':'собаки')+' расчёт недоступен</b><p>'+esc(reason)+'</p></section>'}
  const fixed=rule.dose_min_mg_kg===rule.dose_max_mg_kg;
  const routes=rule.routes.map(r=>'<button data-dose-act="route" data-value="'+esc(r.id)+'" class="'+(doseChosenRoute(rule)===r.id?'on':'')+'">'+esc(r.label)+'</button>').join('');
  return '<section class="dose-calc"><div class="dose-indication"><small>СХЕМА</small><b>'+esc(rule.indication)+'</b></div>'
    +'<div class="dose-choice"><label for="dose-dose">Доза, мг/кг</label>'+(fixed?'<div class="dose-fixed">'+esc(rule.dose_min_mg_kg.replace('.',','))+' мг/кг</div>':'<div class="dose-dose-wrap"><input id="dose-dose" data-dose-input="dose" inputmode="decimal" autocomplete="off" placeholder="'+esc(rule.dose_min_mg_kg.replace('.',','))+'–'+esc(rule.dose_max_mg_kg.replace('.',','))+'" value="'+esc(DOSE.doseValue)+'"><span>мг/кг</span></div><small>Выберите от '+esc(rule.dose_min_mg_kg.replace('.',','))+' до '+esc(rule.dose_max_mg_kg.replace('.',','))+'</small>')+'</div>'
    +doseImmediateWarnings(rule)
    +'<div class="dose-route"><label>Место введения</label><div>'+routes+'</div></div>'
    +doseResultHtml(rule)
    +'<p class="dose-guard">Пилотный расчёт. Дозу, показание и форму препарата подтверждает врач.</p></section>';
}
function doseDetails(item,scheme,rule){
  const warnings=rule&&rule.warnings_short||[];
  return '<details class="dose-details"><summary>Ограничения и подробности</summary><div>'
    +(warnings.length?'<section class="dose-quick-warnings"><h3>Важно</h3>'+warnings.map(x=>'<p>• '+esc(x)+'</p>').join('')+'</section>':'')
    +doseTextBlock(DOSE.species==='cat'?'Исходная схема для кошки':'Исходная схема для собаки',scheme)
    +doseTextBlock('Диапазон и пределы',item.min_max)+doseTextBlock('Путь введения',item.route)+doseTextBlock('Кратность',item.frequency)
    +doseTextBlock('Ограничения и противопоказания',item.restrictions,'warning')+doseTextBlock('Основание черновика',item.evidence)+doseTextBlock('On-label / off-label',item.label_status)
    +'</div></details>';
}
function doseFeedbackSection(item){
  const fb=DOSE.feedback[item.id];return '<details class="dose-review"><summary>Дать отзыв по карточке</summary><div class="dose-feedback"><p>Отзыв сохраняется только на тестовом устройстве.</p><div><button data-dose-act="feedback" data-value="correct" class="btn">Всё верно</button><button data-dose-act="feedback" data-value="fix" class="btn sec">Нужно исправить</button><button data-dose-act="feedback" data-value="unused" class="btn sec">Не используем</button></div>'+(fb?'<p class="dose-feedback-saved">✓ Сохранено: '+esc({correct:'верно',fix:'нужно исправить',unused:'не используем'}[fb.verdict]||fb.verdict)+(fb.note?' — '+esc(fb.note):'')+'</p>':'')+'</div></details>'}
function doseSearchBack(bottom){return '<button class="dose-search-back'+(bottom?' bottom':'')+'" data-dose-act="close"><span aria-hidden="true">‹</span><b>К результатам поиска</b><small>Вернуться к списку без сброса</small></button>'}
function doseDetail(item){
  const s=doseStatus(item.release_status),scheme=DOSE.species==='cat'?item.cat:item.dog,rule=doseActiveRule(item),allRules=doseRulesFor(item);
  return doseTop()+doseSearchBack(false)+doseSpeciesControls()
    +'<article class="card dose-card"><div class="dose-title"><span><small>'+esc(item.group)+'</small><h2>'+esc(item.source_name)+'</h2>'+(item.name&&item.name!==item.source_name?'<p>'+esc(item.name)+'</p>':'')+'</span>'+(rule?'<i class="dose-badge calc">Расчёт доступен</i>':allRules.length?'<i class="dose-badge blocked">Для этого вида нет</i>':'<i class="dose-badge '+s.key+'">'+esc(s.label)+'</i>')+'</div>'
    +'<div class="dose-concentration"><span>Рабочая концентрация</span><b>'+esc(item.concentration||'Не указана')+'</b></div>'
    +doseCalcPanel(item,rule)+doseDetails(item,scheme,rule)+doseFeedbackSection(item)+'</article>'+doseSearchBack(true);
}
function doseHtml(){
  if(DOSE.state==='idle'){setTimeout(doseLoad,0);return doseLoading()}
  if(DOSE.state==='loading')return doseLoading();
  if(DOSE.state==='error')return doseTop()+'<div class="card dose-empty"><b>'+esc(DOSE.error)+'</b><button class="btn" data-dose-act="retry">Повторить</button></div>';
  const selected=DOSE.selected&&DOSE.data.items.find(x=>x.id===DOSE.selected);
  return '<main class="dose-screen">'+(selected?doseDetail(selected):doseTop()+doseFilters()+'<div id="dose-results">'+doseList()+'</div>')+'</main>';
}
function doseOpenCard(id){
  DOSE.listScroll=window.scrollY;DOSE.patientCarried=!!(DOSE.weight&&DOSE.lastItem&&DOSE.lastItem!==id);DOSE.lastItem=id;DOSE.selected=id;DOSE.doseValue='';DOSE.route='';
  history.pushState({evrovet:evNavSnapshot(),dose:{selected:id}},'',location.href);render();window.scrollTo(0,0);
}
function doseRestoreHistory(state){DOSE.selected=state&&state.selected||null}
function doseAfterHistory(){const y=DOSE.selected?0:DOSE.listScroll;setTimeout(()=>window.scrollTo(0,y),0)}
function doseReturnToList(){
  if(history.state&&history.state.dose&&history.state.dose.selected){history.back();return}
  DOSE.selected=null;render();doseAfterHistory();
}
function dosePaintList(){
  if(S.view!=='dose'||DOSE.selected){render();return}
  const root=document.getElementById('dose-results');if(!root){render();return}root.innerHTML=doseList();
}
function dosePaintResult(shouldScroll){
  if(!DOSE.selected||!DOSE.data)return;
  const item=DOSE.data.items.find(x=>x.id===DOSE.selected),root=document.getElementById('dose-calc-result');if(!item||!root)return;
  const box=document.createElement('div');box.innerHTML=doseResultHtml(doseActiveRule(item));const next=box.firstElementChild;root.replaceWith(next);
  const warning=document.getElementById('dose-weight-warning');if(warning)warning.innerHTML=doseWeightWarning();
  if(shouldScroll&&next&&next.classList.contains('ready')){clearTimeout(DOSE.scrollTimer);DOSE.scrollTimer=setTimeout(()=>document.getElementById('dose-calc-result')?.scrollIntoView({behavior:'smooth',block:'center'}),120)}
}
function doseFeedbackForm(verdict){
  const x=DOSE.data&&DOSE.data.items.find(i=>i.id===DOSE.selected);if(!x)return;
  const label={correct:'Доза и ограничения верны',fix:'Нужно исправить',unused:'Не используем в клинике'}[verdict]||verdict;
  overlay('<h2>'+esc(label)+'</h2><p class="hint">'+esc(x.source_name)+'</p><label class="f"><span>Комментарий'+(verdict==='correct'?' (необязательно)':'')+'</span><textarea id="dose-fb-note" rows="4" maxlength="600" placeholder="Что именно проверить или исправить"></textarea></label><button class="btn" data-dose-act="feedback-save" data-value="'+esc(verdict)+'">Сохранить отзыв</button><button class="btn sec" style="margin-top:8px" data-act="ovclose">Отмена</button>');
}
function doseSaveFeedback(verdict){
  const note=String((document.getElementById('dose-fb-note')||{}).value||'').trim();
  if(verdict!=='correct'&&note.length<3){toast('Напишите коротко, что нужно проверить');return}
  DOSE.feedback[DOSE.selected]={verdict,note,at:new Date().toISOString()};LS.set('ev_dose_feedback_test_v1',DOSE.feedback);closeOv();render();toast('Отзыв сохранён на тестовом устройстве');
}
function doseInputValue(el){
  const value=el.value.replace(/\./g,',').replace(/\s/g,'');if(el.value!==value)el.value=value;
  el.setAttribute('aria-invalid',value&&!doseDecimal(value)?'true':'false');return value;
}
document.addEventListener('input',e=>{
  const k=e.target&&e.target.dataset&&e.target.dataset.doseInput;if(!k)return;
  if(k==='search'){DOSE.query=e.target.value;DOSE.limit=24;dosePaintList()}
  else if(k==='weight'){DOSE.weight=doseInputValue(e.target);DOSE.patientCarried=false;dosePaintResult(false)}
  else if(k==='dose'){DOSE.doseValue=doseInputValue(e.target);dosePaintResult(false)}
});
document.addEventListener('change',e=>{const k=e.target&&e.target.dataset&&e.target.dataset.doseInput;if(k==='weight'||k==='dose')dosePaintResult(true)});
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-dose-act]');if(!b)return;
  const a=b.dataset.doseAct,v=b.dataset.value;
  if(a==='group'){DOSE.group=v;DOSE.limit=24;document.querySelectorAll('[data-dose-act="group"]').forEach(x=>x.classList.toggle('on',x.dataset.value===v));dosePaintList()}
  else if(a==='status'){DOSE.status=v;DOSE.limit=24;document.querySelectorAll('[data-dose-act="status"]').forEach(x=>x.classList.toggle('on',x.dataset.value===v));dosePaintList()}
  else if(a==='show-all'){DOSE.status='all';DOSE.group='all';DOSE.limit=24;render();setTimeout(()=>document.getElementById('dose-q')?.focus(),0)}
  else if(a==='more'){DOSE.limit+=24;dosePaintList()}
  else if(a==='open')doseOpenCard(b.dataset.id)
  else if(a==='close')doseReturnToList()
  else if(a==='new-patient'){doseResetPatient();render();setTimeout(()=>document.getElementById('dose-weight')?.focus(),0)}
  else if(a==='species'){DOSE.species=v;DOSE.doseValue='';DOSE.route='';render()}
  else if(a==='route'){DOSE.route=v;document.querySelectorAll('[data-dose-act="route"]').forEach(x=>x.classList.toggle('on',x.dataset.value===v));dosePaintResult(true)}
  else if(a==='retry'){DOSE.state='idle';doseLoad()}
  else if(a==='feedback')doseFeedbackForm(v)
  else if(a==='feedback-save')doseSaveFeedback(v)
});
