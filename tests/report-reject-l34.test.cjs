// L34: отказ сервера возвращает в форму; сверка состава с графиком; офлайн, двойное нажатие, исправление.
// Запуск (нужен node и playwright-core):
//   EVROVET_PLAYWRIGHT_MODULE=<путь>/playwright-core node tests/report-reject-l34.test.cjs
// Сервер базы ПОДСТАВНОЙ (page.route на /rest/v1/rpc/**), люди вымышленные, PIN поддельный. Любой другой внешний запрос обрывается.
// OUT=<папка> — куда сложить снимки (по умолчанию не снимаем).
const fs=require('fs'),http=require('http'),path=require('path');
const pw=require(process.env.EVROVET_PLAYWRIGHT_MODULE||'playwright-core');
const root=path.resolve(__dirname,'..'),OUT=process.env.OUT||'';
if(OUT)fs.mkdirSync(OUT,{recursive:true});
const DAY='2026-11-24';
const PEOPLE={16:'Фёдорова Т.В.',4:'Орлов И.П.',11:'Семёнова А.Р.',34:'Кривогузова А.А.'};
const FULL={34:'Кривогузова Анна Андреевна'};
const ADMIN={id:16,full_name:'Фёдорова Татьяна Владимировна',short_name:'Фёдорова Т.В.',admin:true,roles:['admin']};
const BR=[{id:'marksa',title:'Маркса, 45'},{id:'70let',title:'70 лет Октября, 20'},{id:'pereleta',title:'Перелёта, 19'}];
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.json':'application/json','.webmanifest':'application/manifest+json'};
const server=http.createServer((q,s)=>{const rel=decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/,'')||'index.html';const f=path.resolve(root,rel);
  if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){s.writeHead(404).end();return}
  s.writeHead(200,{'Content-Type':mime[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(s)});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const res=[];const ok=(c,m)=>{res.push([!!c,m]);console.log((c?'PASS ':'FAIL ')+m)};

/* ---- подставная база ---- */
function makeDb(){
  return{reports:[],calls:{},mode:'online',lostOnce:false,
    shifts:[{date:DAY,branch:'70let',slot:'admin',name:PEOPLE[16],full:ADMIN.full_name},{date:DAY,branch:'70let',slot:'doctor',name:PEOPLE[4],full:'Орлов Илья Петрович'},
            {date:DAY,branch:'70let',slot:'assistant',name:'Семёнова',full:'Семёнова'} /* строка без сопоставления: только фамилия */,{date:DAY,branch:'marksa',slot:'assistant',name:PEOPLE[34],full:FULL[34]}]};
}
const ids=d=>[].concat(d.admins||[],d.doctors||[],d.assistants||[]).map(x=>String(x.id));
function latestOther(db,branch,date){const m=new Map();db.reports.filter(r=>r.date===date&&r.branch!==branch).forEach(r=>{const p=m.get(r.branch);if(!p||p.version<r.version)m.set(r.branch,r)});return[...m.values()]}
function rpc(db,name,a){
  db.calls[name]=(db.calls[name]||0)+1;
  switch(name){
    case'ev_login_number':return{ok:true,token:'qa-token',person:ADMIN};
    case'ev_select_branch':return{ok:true,date:DAY};
    case'ev_context':{const cur=db.reports.filter(r=>r.branch===a.p_branch&&r.date===a.p_date).sort((x,y)=>y.version-x.version)[0];
      return{ok:true,branches:BR,admins:[{id:16,name:PEOPLE[16]}],doctors:[{id:4,name:PEOPLE[4],vm_id:104}],
        assistants:[{id:11,role:'assistant_clinical',name:PEOPLE[11]},{id:34,role:'assistant_clinical',name:PEOPLE[34]}],
        prev:null,current:cur?{version:cur.version,data:cur.data,submitted_at:'2026-11-24T14:00:00Z',by:PEOPLE[16]}:null,articles:['Хозтовары','Другое','Инкассация МР','Возврат клиника','Возврат аптека']}}
    case'ev_whos_where':return{ok:true,shifts:db.shifts.filter(s=>s.date>=a.p_from&&s.date<=a.p_to)};
    case'ev_cash_handover_context':return{ok:true,mode:'off'};
    case'ev_submit':{
      const mine=new Set(ids(a.p_data||{}));
      const clash=latestOther(db,a.p_branch,a.p_date).flatMap(r=>ids(r.data).filter(x=>mine.has(x)));
      if(clash.length)return{ok:false,error:'person_two_branches',people:[...new Set(clash)].map(x=>PEOPLE[x])};
      const dup=db.reports.find(r=>r.uid===a.p_client_uid);if(dup)return{ok:true,duplicate:true,report_id:dup.id,version:dup.version};
      const v=db.reports.filter(r=>r.branch===a.p_branch&&r.date===a.p_date).length+1;
      if(v>1&&String(a.p_reason||'').trim().length<3)return{ok:false,error:'reason_required',version:v};
      const r={id:db.reports.length+1,branch:a.p_branch,date:a.p_date,version:v,data:a.p_data,uid:a.p_client_uid,reason:a.p_reason};db.reports.push(r);
      return{ok:true,version:v,report_id:r.id};
    }
    case'ev_report_conflicts':{
      if(db.noL34)return{__http:404};
      const want=new Set((a.p_ids||[]).map(String));const out=[];
      latestOther(db,a.p_branch,a.p_date).forEach(r=>ids(r.data).filter(x=>want.has(x)).forEach(x=>out.push({id:Number(x),name:FULL[x]||PEOPLE[x],branch:r.branch,branch_title:(BR.find(b=>b.id===r.branch)||{}).title})));
      return{ok:true,people:out};
    }
    case'ev_flags_overview':return{ok:true,flags:[],coverage:[]};
    default:return{ok:true,rows:[],items:[],flags:[],shifts:[]};
  }
}

async function session(browser,db,url){
  const ctx=await browser.newContext({viewport:{width:375,height:812},deviceScaleFactor:2,serviceWorkers:'block'});
  const page=await ctx.newPage();const errs=[];page.on('pageerror',e=>errs.push(e.message));
  const escaped=[];
  await ctx.route('**/*',async route=>{
    const u=route.request().url();
    if(u.startsWith(url))return route.continue();
    if(!/\/rest\/v1\/rpc\//.test(u)){escaped.push(u);return route.abort()} // наружу ничего не уходит
    const name=u.split('/').pop().split('?')[0];let a={};try{a=JSON.parse(route.request().postData()||'{}')}catch(e){}
    if(name==='ev_submit'&&db.mode==='offline'){db.calls.ev_submit_offline=(db.calls.ev_submit_offline||0)+1;return route.abort('internetdisconnected')}
    const body=rpc(db,name,a);
    if(name==='ev_submit'&&db.lostOnce&&body.ok){db.lostOnce=false;return route.abort('connectionreset')} // ответ потерян: отчёт записан, клиент не знает
    if(body&&body.__http)return route.fulfill({status:body.__http,contentType:'application/json',body:'{}'});
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto(url,{waitUntil:'domcontentloaded'});await wait(300);
  await page.evaluate(()=>{try{localStorage.clear()}catch(e){}});
  await page.locator('[data-act="loginstart"]').click();
  for(const n of '123123456')await page.locator(`[data-act="logindigit"][data-n="${n}"]`).click();
  await wait(800);
  return{page,ctx,errs,escaped};
}
const FORM=(extra)=>Object.assign({admins:{16:{left:'',came:''}},doctors:{4:{val:'1000'}},others:[],total:'1000',cash:'600',cashless:'400',ph_val:'100',ph_cash:'100',ph_cashless:'0',
  open:'0',expenses:[],close:'700',assistants:{'assistant_clinical:11':{fn:2,fx:1,left:'',came:''}},no_assistant:false,note:'тест L34',adv_cash:'',adv_cashless:'',adv_out:'',comp:'',cert:'',nc_comment:'',debt:'',debt_comment:'',repaid:'',diff_reason:'',corr_reason:''},extra||{});
async function openForm(page,branch,form){
  await page.evaluate(async([b,f])=>{S.date='2026-11-24';S.dateManual=true;await openBranch(b);Object.assign(S.form,f);saveDraftNow();render()},[branch,form]);
  await wait(400);
}
const shot=async(page,name)=>{if(!OUT)return;await wait(500);await page.screenshot({path:path.join(OUT,name+'.png')})};
const st=page=>page.evaluate(()=>({view:S.view,q:S.queue.length,done:S.done&&{sent:S.done.sent,rej:S.done.rejected&&S.done.rejected.text},form:S.form&&JSON.parse(JSON.stringify(S.form)),ov:document.getElementById('ovwrap').innerText}));

(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
  const browser=await pw.chromium.launch({headless:true});
  /* 1. Сверка с графиком + отказ person_two_branches → назад в форму → убрали → ровно один отчёт */
  {
    const db=makeDb();
    db.reports.push({id:1,branch:'marksa',date:DAY,version:1,data:{admins:[{id:99}],assistants:[{id:34,role:'assistant_clinical'}]},uid:'pre-1'});
    const{page,errs,escaped}=await session(browser,db,url);
    const f=FORM({assistants:{'assistant_clinical:11':{fn:2,fx:1,left:'',came:''},'assistant_clinical:34':{fn:1,fx:0,left:'',came:''}},expenses:[{article:'Хозтовары',amount:'0',comment:'перчатки',method:'cash'}]});
    await openForm(page,'70let',f);
    await page.locator('[data-act="submit"]').first().click();await wait(600);
    let s=await st(page);
    ok(/По графику Кривогузова А\.А\. 24\.11 работает на Маркса, 45\. Это замена\?/.test(s.ov)&&/Да, замена/.test(s.ov)&&/Убрать/.test(s.ov),'график: человек на другом филиале → вопрос «Это замена?» с «Да, замена» / «Убрать»');
    ok((db.calls.ev_submit||0)===0,'до ответа на вопрос отчёт не уходит');
    await shot(page,'l34-1-zamena');
    await page.locator('[data-act="trap-subst-yes"]').click();await wait(900);
    s=await st(page);
    ok(s.view==='done'&&s.done&&s.done.rej&&s.done.rej.includes('Кривогузова Анна Андреевна уже указан(а) в отчёте филиала Маркса, 45 за 24.11.2026')&&s.done.rej.includes('Вернитесь к составу смены и исправьте его либо исправьте отчёт другого филиала'),'отказ person_two_branches: текст с ФИО, филиалом и датой (L34)');
    ok(!/администратор/i.test(s.done.rej||''),'в тексте отказа не сказано, что это администратор');
    const html=await page.locator('#app').innerHTML();
    ok(html.includes('Вернуться к отчёту и исправить')&&!html.includes('data-act="flush"'),'на экране отказа есть «Вернуться к отчёту и исправить», нет «Отправить сейчас»');
    ok(s.q===0,'отказанный отчёт убран из очереди');
    const n0=db.calls.ev_submit;await wait(9000);ok(db.calls.ev_submit===n0,'содержательный отказ сам не повторяется (ждали 9 с)');
    const dr=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('ev_draft2:')));
    ok(dr.length===1,'черновик после отказа один и на месте');
    await shot(page,'l34-2-otkaz');
    await page.locator('[data-act="repback"]').click();await wait(600);
    s=await st(page);
    ok(s.view==='form'&&s.form.total==='1000'&&s.form.cash==='600'&&s.form.cashless==='400'&&s.form.close==='700'&&s.form.ph_val==='100'&&s.form.doctors['4'].val==='1000'&&s.form.expenses.length===1&&s.form.expenses[0].comment==='перчатки'&&s.form.note==='тест L34'&&!!s.form.assistants['assistant_clinical:34']&&(s.form.sched_subst||[]).includes('Кривогузова А.А.'),'«Вернуться к отчёту»: все поля на месте');
    await shot(page,'l34-3-forma');
    await page.evaluate(()=>{delete S.form.assistants['assistant_clinical:34'];S.form.sched_subst=[];saveDraftNow();render()});
    await page.locator('[data-act="submit"]').first().click();await wait(1200);
    s=await st(page);
    const mine=db.reports.filter(r=>r.branch==='70let');
    ok(s.done&&s.done.sent&&mine.length===1&&mine[0].version===1&&!ids(mine[0].data).includes('34')&&s.q===0,'убрали человека → отправили → ровно один отчёт, очередь пуста');
    const dr2=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('ev_draft2:')).length);
    ok(dr2===0,'после принятия черновик удалён');
    ok(errs.length===0,'ошибок JS нет'+(errs.length?': '+errs.join('; '):''));ok(escaped.length===0,'наружу запросов нет');
    await page.context().close();
  }
  /* 2. «Убрать» из вопроса по графику; без L34 текст отказа без филиала */
  {
    const db=makeDb();db.noL34=true;
    db.reports.push({id:1,branch:'marksa',date:DAY,version:1,data:{assistants:[{id:34}]},uid:'pre-1'});
    const{page,errs}=await session(browser,db,url);
    await openForm(page,'70let',FORM({assistants:{'assistant_clinical:11':{fn:2,fx:1,left:'',came:''},'assistant_clinical:34':{fn:1,fx:0,left:'',came:''}}}));
    await page.locator('[data-act="submit"]').first().click();await wait(600);
    await page.locator('[data-act="trap-subst-drop"]').click();await wait(400);
    let s=await st(page);
    ok(s.view==='form'&&!s.form.assistants['assistant_clinical:34']&&!!s.form.assistants['assistant_clinical:11']&&(db.calls.ev_submit||0)===0,'«Убрать»: человек убран из состава, отчёт не ушёл, остальное на месте');
    // без L34: вернём человека и ответим «Да, замена» → отказ без филиала
    await page.evaluate(()=>{S.form.assistants['assistant_clinical:34']={fn:1,fx:0,left:'',came:''};render()});
    await page.locator('[data-act="submit"]').first().click();await wait(600);
    await page.locator('[data-act="trap-subst-yes"]').click();await wait(900);
    s=await st(page);
    ok(s.done&&s.done.rej&&s.done.rej.startsWith('Кривогузова А.А. уже указан(а) в отчёте другого филиала за 24.11.2026'),'без L34 (функции нет) — текст отказа без филиала');
    // графика нет → молчим
    db.shifts=[];await page.locator('[data-act="repback"]').click();await wait(400);
    await page.evaluate(()=>{TRAP_SCHED.key='';delete S.form.assistants['assistant_clinical:34'];S.form.sched_subst=[];render()});
    await page.locator('[data-act="submit"]').first().click();await wait(900);
    s=await st(page);ok(s.done&&s.done.sent,'графика нет — вопроса нет, отчёт принят');
    ok(errs.length===0,'ошибок JS нет'+(errs.length?': '+errs.join('; '):''));
    await page.context().close();
  }
  /* 3. Офлайн → одна отправка после связи; потерянный ответ → без дубля */
  {
    const db=makeDb();db.mode='offline';
    const{page,errs}=await session(browser,db,url);
    await openForm(page,'70let',FORM());
    await page.locator('[data-act="submit"]').first().click();await wait(900);
    let s=await st(page);
    ok(s.q===1&&!s.done.sent&&db.reports.length===0,'нет связи: отчёт в очереди, не отправлен');
    ok(await page.evaluate(()=>Object.keys(localStorage).some(k=>k.startsWith('ev_draft2:'))),'нет связи: черновик не удалён');
    await page.evaluate(async()=>{const d=S.done;await openBranch('70let');S.view='done';S.done=d});
    s=await st(page);ok(s.form&&s.form.total===''&&s.q===1,'отчёт в очереди: при повторном открытии копия отправленного в форму не подставляется');
    db.mode='online';db.lostOnce=true;            // связь есть, но первый ответ теряется после записи
    await page.evaluate(()=>{S.online=true;kick()});await wait(900);
    await page.evaluate(()=>{kick()});await wait(1200);
    s=await st(page);
    ok(db.reports.length===1&&s.q===0&&s.done.sent,'после связи — ровно один отчёт (потерянный ответ не дал дубля), очередь пуста');
    ok(errs.length===0,'ошибок JS нет'+(errs.length?': '+errs.join('; '):''));
    await page.context().close();
  }
  /* 4. Двойное нажатие → один отчёт */
  {
    const db=makeDb();
    const{page,errs}=await session(browser,db,url);
    await openForm(page,'70let',FORM());
    const t1=await page.evaluate(()=>{const keep=TRAP_SCHED.rows;TRAP_SCHED.rows=[{name:'Петров П.П.'}];const a=trapSchedMissing();TRAP_SCHED.rows=[{name:'Семёнова'},{name:'Орлов И.П.'}];const b=trapSchedMissing();TRAP_SCHED.rows=keep;TRAP_SCHED.key='';return[a&&a.name,b]});
    ok(t1[0]==='Петров П.П.'&&t1[1]===null,'ловушка 1: по графику есть, в отчёте нет → вопрос; фамилия без инициалов совпадает с человеком отчёта');
    await page.locator('[data-act="submit"]').first().dblclick();
    await page.evaluate(()=>{submit();submit()});await wait(1500);
    const s=await st(page);
    ok(db.reports.length===1&&db.calls.ev_submit===1&&s.q===0,'двойное нажатие → один отчёт, один вызов ev_submit');
    ok(errs.length===0,'ошибок JS нет'+(errs.length?': '+errs.join('; '):''));
    await page.context().close();
  }
  /* 5. Исправление уже сданного → версия 2 с причиной */
  {
    const db=makeDb();
    db.reports.push({id:1,branch:'70let',date:DAY,version:1,data:{schema:1,admins:[{id:16}],doctors:[{id:4,val:900}],assistants:[{id:11,role:'assistant_clinical',fix_normal:2,fix_xray:1}],total:900,cash:500,cashless:400,pharmacy:{val:100,cash:100,cashless:0},cashbox:{opening:0,expenses:[],closing:600}},uid:'pre-v1'});
    const{page,errs}=await session(browser,db,url);
    await openForm(page,'70let',{total:'1000',cash:'600',doctors:{4:{val:'1000'}},close:'700',corr_reason:'исправила вал врача'});
    await page.locator('[data-act="submit"]').first().click();await wait(1200);
    const s=await st(page);const v2=db.reports.find(r=>r.version===2);
    ok(v2&&v2.reason==='исправила вал врача'&&db.reports.length===2&&s.done.sent&&s.q===0,'исправление: версия 2 с причиной');
    ok(errs.length===0,'ошибок JS нет'+(errs.length?': '+errs.join('; '):''));
    await page.context().close();
  }
  await browser.close();server.close();
  const fail=res.filter(x=>!x[0]).length;
  console.log((fail?'FAIL':'PASS')+' '+(res.length-fail)+'/'+res.length);
  process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
