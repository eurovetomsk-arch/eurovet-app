'use strict';
/* ====== 2.0 · Поздравление с днём рождения (слово Михаила 17.11, REMARKS п.18) ======
   Сотрудник входит в свой день рождения — на ВЕСЬ ЭКРАН поздравление от имени Михаила, анимация в палитре приложения (без оранжевого и золотого),
   внизу крупная кнопка «Спасибо!»; экран сам не гаснет, пока её не нажали; после — главная.
   Данные (решение Михаила 17.11: дни рождения в облаке, день и месяц БЕЗ года): ev_birthday_today(token) САМА определяет «сегодня день рождения вошедшего?» -> {today, variant_id, text, theme} ТОЛЬКО для него;
   ev_birthday_ack(token) — «прочитал». Тексты — файл Штаба «Поздравления-сотрудников-2.0» (без эмодзи: они жёлтые/оранжевые).
   prefers-reduced-motion — статичная карточка без анимации. Предпросмотр для руководителя: «Меню → Пример поздравления». */
const BD_TEXTS={"f": ["{Имя}, с днём рождения! Желаю вам чувствовать себя счастливой, уверенной и по-настоящему вдохновлённой тем, что вы делаете. Пусть рядом будут хорошие люди, в работе будет больше приятных побед, а вне работы — время на себя, отдых и всё, что делает жизнь ярче. Рад, что вы с нами. С теплом, Михаил Растиславович и ваш ЕВРОВЕТ.", "{Имя}, сегодня ваш день — пусть он начнётся с улыбки! Желаю вам лёгкости, внутреннего спокойствия, новых возможностей и побольше моментов, которыми хочется наслаждаться. Пусть ваши идеи находят поддержку, планы складываются удачно, а каждый новый год жизни приносит что-то по-настоящему хорошее. С днём рождения! Михаил Растиславович и ваш ЕВРОВЕТ.", "{Имя}, поздравляю вас с днём рождения! Пусть у вас хватает сил на важное, смелости на новое и времени на то, что радует именно вас. Желаю быть окружённой заботой, уважением и людьми, с которыми тепло и спокойно. Спасибо, что вы часть нашей команды. Михаил Растиславович и ваш ЕВРОВЕТ.", "{Имя}, желаю вам прекрасного дня рождения и такого же прекрасного года впереди. Пусть работа приносит радость и смысл, дома ждут уют и поддержка, а в жизни будет больше неожиданных радостей, путешествий, встреч и добрых новостей. Оставайтесь такой же живой, сильной и открытой новому. С праздником! Михаил Растиславович и ваш ЕВРОВЕТ.", "{Имя}, с вашим праздником! Хочу пожелать вам не только успехов, но и удовольствия от каждого дня: спокойно двигаться к своим целям, видеть результат своих усилий и обязательно находить время на мечты. Пусть этот год будет щедрым на события, которыми вы будете гордиться. Рад работать вместе с вами. Михаил Растиславович и ваш ЕВРОВЕТ."], "m": ["{Имя}, с днём рождения! Желаю вам быть счастливым, уверенным в себе и с интересом двигаться дальше. Пусть работа приносит сильные результаты и уважение, а вне работы остаётся достаточно времени для близких, отдыха и собственных планов. Рад, что вы в нашей команде. Михаил Растиславович и ваш ЕВРОВЕТ.", "{Имя}, поздравляю! Пусть новый год жизни даст вам больше возможностей, хороших решений и поводов сказать себе: «Вот это получилось здорово». Желаю энергии, крепкого здоровья, надёжных людей рядом и настоящего удовольствия от того, что вы создаёте. С днём рождения! Михаил Растиславович и ваш ЕВРОВЕТ.", "{Имя}, сегодня отличный повод остановиться на минуту и почувствовать, сколько всего уже получилось. Желаю вам не терять азарт, спокойно проходить сложные этапы и всегда видеть следующий интересный горизонт. Пусть дома поддерживают, коллеги ценят, а жизнь приятно удивляет. С праздником! Михаил Растиславович и ваш ЕВРОВЕТ.", "{Имя}, с днём рождения! Желаю вам крепкой внутренней опоры, смелых целей и достаточного количества времени, чтобы жить не только задачами. Пусть этот год принесёт яркие впечатления, новые места и много хороших дней рядом с теми, кто вам дорог. Спасибо, что вы с нами. Михаил Растиславович и ваш ЕВРОВЕТ.", "{Имя}, поздравляю с вашим днём! Пусть в работе будут сильные победы, а в жизни — свободе, интересу и радости от простых вещей. Желаю оставаться энергичным, открытым новому и уверенно идти к тому, что для вас действительно важно. Рад работать вместе. Михаил Растиславович и ваш ЕВРОВЕТ."], "n": ["{Имя}, с днём рождения! Пусть впереди будет много добрых событий, интересных задач, тёплых встреч и поводов гордиться собой. Желаю сил на важное, времени на любимое и людей рядом, с которыми можно быть собой. Рад, что вы в команде ЕВРОВЕТ. Михаил Растиславович и ваш ЕВРОВЕТ.", "{Имя}, поздравляю с вашим днём! Желаю, чтобы новый год жизни принёс больше свободы, вдохновения и приятных неожиданностей. Пусть работа приносит удовольствие, отдых возвращает силы, а каждый месяц добавляет что-то хорошее и запоминающееся. С теплом, Михаил Растиславович и ваш ЕВРОВЕТ.", "{Имя}, пусть этот день начнётся с хорошего настроения и ощущения, что вас ценят. Желаю здоровья, спокойствия, ярких планов и настоящей радости от жизни. Спасибо за ваш вклад в ЕВРОВЕТ — впереди ещё много интересного. С днём рождения! Михаил Растиславович и ваш ЕВРОВЕТ."]};
const BD_GROUPS={f:'женский',m:'мужской',n:'нейтральный'};
const BD_COLORS=['#4AA0B4','#9FD8E3','#FFFFFF','#BFF0E0','#E0457F','#2FBF8F','#4F7BFF','#2A7D90'];
function bdVariant(id){const m=String(id||'').match(/^([fmn])(\d)$/);const g=m?m[1]:'n',i=m?Number(m[2])-1:0,arr=BD_TEXTS[g]||BD_TEXTS.n;return{group:g,index:Math.min(Math.max(i,0),arr.length-1),text:arr[Math.min(Math.max(i,0),arr.length-1)]}}
function bdName(){try{return (typeof stageGreetingName==='function'?stageGreetingName(S.person):'')||(S.person&&(S.person.short_name||S.person.name))||'Коллега'}catch(e){return 'Коллега'}}
const bdReduced=()=>{try{return window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches}catch(e){return false}};
const bdRnd=(a,b)=>a+Math.random()*(b-a);
function bdPawSvg(c,o){return '<svg viewBox="0 0 64 64" width="100%" height="100%" fill="'+c+'" fill-opacity="'+o+'" aria-hidden="true"><ellipse cx="32" cy="42" rx="14" ry="11"/><ellipse cx="14" cy="26" rx="6.5" ry="8.5"/><ellipse cx="26" cy="15" rx="6.5" ry="8.5"/><ellipse cx="40" cy="15" rx="6.5" ry="8.5"/><ellipse cx="52" cy="26" rx="6.5" ry="8.5"/></svg>'}
function bdBalloonSvg(c){return '<svg viewBox="0 0 60 130" width="100%" height="100%" aria-hidden="true"><ellipse cx="30" cy="32" rx="24" ry="30" fill="'+c+'"/><ellipse cx="21" cy="21" rx="6" ry="9" fill="#fff" fill-opacity=".35"/><path d="M26 61 L30 67 L34 61 Z" fill="'+c+'"/><path d="M30 67 C 22 85, 38 100, 30 128" stroke="#EAF6F8" stroke-opacity=".6" stroke-width="1.6" fill="none"/></svg>'}
function bdDecor(){
  if(bdReduced())return '<div class="bd-glow"></div>';
  let h='<div class="bd-glow"></div>';
  for(let i=0;i<46;i++){const c=BD_COLORS[i%BD_COLORS.length],w=bdRnd(6,12),hh=bdRnd(8,16),left=bdRnd(0,100),dur=bdRnd(5,10),del=-bdRnd(0,10),rot=bdRnd(240,720),dx=bdRnd(-40,40),round=i%3===0;
    h+='<i class="bd-conf" style="left:'+left.toFixed(1)+'%;width:'+w.toFixed(1)+'px;height:'+(round?w:hh).toFixed(1)+'px;background:'+c+';border-radius:'+(round?'50%':'2px')+';animation-duration:'+dur.toFixed(2)+'s;animation-delay:'+del.toFixed(2)+'s;--r:'+rot.toFixed(0)+'deg;--dx:'+dx.toFixed(0)+'px"></i>'}
  for(let i=0;i<8;i++){const left=bdRnd(2,92),s=bdRnd(34,58),dur=bdRnd(9,16),del=-bdRnd(0,14);
    h+='<i class="bd-paw" style="left:'+left.toFixed(1)+'%;width:'+s.toFixed(0)+'px;height:'+s.toFixed(0)+'px;animation-duration:'+dur.toFixed(1)+'s;animation-delay:'+del.toFixed(1)+'s">'+bdPawSvg(i%2?'#9FD8E3':'#FFFFFF',i%2?'.55':'.4')+'</i>'}
  const bc=['#E0457F','#2FBF8F','#4F7BFF','#4AA0B4','#BFF0E0','#9FD8E3'];
  for(let i=0;i<6;i++){const left=6+i*15+bdRnd(-3,3),dur=bdRnd(11,17),del=-bdRnd(0,12),s=bdRnd(40,56);
    h+='<i class="bd-ball" style="left:'+left.toFixed(1)+'%;width:'+s.toFixed(0)+'px;height:'+(s*2.1).toFixed(0)+'px;animation-duration:'+dur.toFixed(1)+'s;animation-delay:'+del.toFixed(1)+'s">'+bdBalloonSvg(bc[i%bc.length])+'</i>'}
  return h;
}
let bdAck=null;
/* убираем обращение «{Имя},» и повтор «с днём рождения!» в начале — они уже в заголовке; первая буква заглавная */
function bdBody(t){let b=String(t).replace(/^[^,]+,\s*/,'').replace(/^с днём рождения!\s*/i,'');return b.charAt(0).toUpperCase()+b.slice(1)}
function bdShow(variantId,opts){
  opts=opts||{};bdClose(true);
  const v=bdVariant(variantId),name=bdName(),text=String(opts.text||v.text).replace('{Имя}',name);
  const wrap=document.createElement('div');wrap.id='bdwrap';wrap.className='bd'+(bdReduced()?' bd-static':'');wrap.setAttribute('role','dialog');wrap.setAttribute('aria-modal','true');wrap.setAttribute('aria-label','Поздравление с днём рождения');
  wrap.innerHTML=bdDecor()
    +'<div class="bd-card"><div class="bd-mark"><svg viewBox="0 0 153 153" width="64" height="64" fill="currentColor" aria-hidden="true"><use href="#evro"/></svg></div>'
    +'<h1 class="bd-title">С днём рождения!</h1><div class="bd-sub">'+esc(name)+'</div><p class="bd-text">'+esc(bdBody(text))+'</p></div>'
    +'<div class="bd-foot"><button class="bd-btn" data-act="bdok">'+(opts.preview?'Закрыть пример':'Спасибо!')+'</button></div>';
  document.body.appendChild(wrap);document.body.classList.add('bd-open');bdAck=opts.preview?null:true;
  setTimeout(()=>{const b=wrap.querySelector('.bd-btn');if(b)b.focus({preventScroll:true})},50);
}
function bdClose(silent){const w=document.getElementById('bdwrap');if(w)w.remove();document.body.classList.remove('bd-open');if(!silent)bdAck=null}
async function bdThanks(){
  try{if(navigator.vibrate)navigator.vibrate(18)}catch(e){}
  const ack=bdAck;bdClose();
  if(ack&&S.token){try{await rpc('ev_birthday_ack',{p_token:S.token},8000)}catch(e){}}
}
/* вызывается после входа и при запуске с сохранённой сессией: один раз в сутки на человека на устройстве, пока не нажато «Спасибо!» — показывается снова */
let bdCheckedKey='';
async function birthdayCheck(){
  if(!S.token||!S.person)return;
  const key=String(S.person.id)+'|'+omskToday();if(bdCheckedKey===key)return;bdCheckedKey=key;
  try{const r=await rpc('ev_birthday_today',{p_token:S.token},8000);
    if(r&&r.ok&&r.today&&!r.acked)bdShow(r.variant_id||r.variant,{text:r.text});
  }catch(e){}
}
function bdPreviewMenu(){
  overlay('<h2>Пример поздравления</h2><p class="hint">Так увидит сотрудник в свой день рождения. Данные не подключены: это только пример.</p>'
    +['f','m','n'].map(g=>'<button class="btn sec" style="margin:6px 0" data-act="bdprev" data-g="'+g+'">'+({f:'Женский вариант',m:'Мужской вариант',n:'Нейтральный вариант'}[g])+'</button>').join('')
    +'<button class="btn sec" style="margin:12px 0 0" data-act="ovclose">Закрыть</button>');
}
const bdPrevIx={f:0,m:0,n:0};
function bdPreview(g){const arr=BD_TEXTS[g]||BD_TEXTS.n;const i=bdPrevIx[g]%arr.length;bdPrevIx[g]++;closeOv();bdShow(g+(i+1),{preview:true})}
