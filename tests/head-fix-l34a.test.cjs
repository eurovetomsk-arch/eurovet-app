// L34a: руководитель сам исправляет и пересдаёт сданный отчёт (version+1, причина от 15 знаков); админ после окна — нет.
// Запуск (нужен node и playwright-core):
//   EVROVET_PLAYWRIGHT_MODULE=<путь>/playwright-core node tests/head-fix-l34a.test.cjs
// Сервер базы ПОДСТАВНОЙ (page.route на /rest/v1/rpc/**), люди вымышленные, PIN поддельный. Любой другой внешний запрос обрывается.
// OUT=<папка> — куда сложить снимки (по умолчанию не снимаем).
const fs=require('fs'),http=require('http'),path=require('path');
const pw=require(process.env.EVROVET_PLAYWRIGHT_MODULE||'playwright-core');
const root=path.resolve(__dirname,'..'),OUT=process.env.OUT||'';
if(OUT)fs.mkdirSync(OUT,{recursive:true});
const DAY='2026-11-24';
const PEOPLE={16:'Фёдорова Т.В.',4:'Орлов И.П.',11:'Семёнова А.Р.',34:'Кривогузова А.А.'};
const FULL={34:'Кривогузова Анна Андреевна'};
const HEAD={id:1,full_name:'Таслицкий Тест',short_name:'Таслицкий Т.',head:true,roles:['head']};
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
    case'ev_login_number':return{ok:true,token:'qa-token',person:db.who||ADMIN};
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
      const isHead=!!(db.who&&db.who.head);
      if(db.windowClosed&&!isHead)return{ok:false,error:'window_closed'};
      if(v>1&&String(a.p_reason||'').trim().length<(isHead?15:3))return{ok:false,error:'reason_required',version:v,min_len:isHead?15:3};
      const r={id:db.reports.length+1,branch:a.p_branch,date:a.p_date,version:v,data:a.p_data,uid:a.p_client_uid,reason:a.p_reason,is_correction:v>1};db.reports.push(r);
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
const st=page=>page.evaluate(()=>({view:S.view,ro:!!S.roHead,q:S.queue.length,done:S.done&&{sent:S.done.sent,version:S.done.version},form:S.form&&JSON.parse(JSON.stringify(S.form)),ov:document.getElementById('ovwrap').innerText}));

(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
  const browser=await pw.chromium.launch({headless:true});
  const V1={schema:1,admins:[{id:16}],doctors:[{id:4,val:900}],assistants:[{id:11,role:'assistant_clinical',fix_normal:2,fix_xray:1}],total:900,cash:500,cashless:400,pharmacy:{val:100,cash:100,cashless:0},cashbox:{opening:0,expenses:[],closing:600}};
  /* 1. Руководитель: просмотр → «Исправить отчёт» → причина < 15 не пускает → 15+ → версия 2 */
  {
    const db=makeDb();db.who=HEAD;db.windowClosed=true;db.shifts=[];
    db.reports.push({id:1,branch:'70let',date:DAY,version:1,data:V1,uid:'pre-v1'});
    const{page,errs,escaped}=await session(browser,db,url);
    await page.evaluate(async()=>{S.date='2026-11-24';S.dateManual=true;await openBranch('70let')});await wait(500);
    let s=await st(page);
    ok(s.view==='form'&&s.ro,'руководитель: сданный отчёт открывается для просмотра');
    ok(await page.locator('[data-act="headfix"]').isVisible(),'в просмотре видна кнопка «Исправить отчёт»');
    await page.locator('[data-act="headfix"]').click();await wait(400);
    s=await st(page);
    ok(!s.ro&&s.form.total==='900'&&s.form.doctors['4'].val==='900'&&s.form.close==='600','«Исправить отчёт»: форма редактируется, данные текущей версии');
    ok(await page.locator('[data-p="total"]').isEnabled(),'поля не заблокированы');
    await page.evaluate(()=>{Object.assign(S.form,{total:'1000',cash:'600',close:'700',corr_reason:'короткая'});S.form.doctors['4'].val='1000';saveDraftNow();render()});
    await page.locator('[data-act="submit"]').first().click();await wait(500);
    s=await st(page);
    ok(s.view==='form'&&(db.calls.ev_submit||0)===0&&/не короче 15 знаков \(сейчас 8\)/.test(await page.locator('#form-errors').innerText()),'причина короче 15 знаков — понятная ошибка, отчёт не уходит');
    const keys=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('ev_draft2:')));
    ok(keys.length===1&&keys[0].startsWith('ev_draft2:h1:70let:'),'черновик правки руководителя под отдельным ключом (ev_draft2:h…)');
    await page.evaluate(()=>{S.form.corr_reason='исправил вал врача по кассе';render()});
    await page.locator('[data-act="submit"]').first().click();await wait(1200);
    s=await st(page);const v2=db.reports.find(r=>r.version===2);
    ok(v2&&v2.is_correction&&v2.reason==='исправил вал врача по кассе'&&v2.data.total===1000&&s.done&&s.done.sent&&String(s.done.version)==='2','принято: версия 2, исправление, причина записана');
    await shot(page,'l34a-2-prinyat');
    ok(errs.length===0,'ошибок JS нет'+(errs.length?': '+errs.join('; '):''));ok(escaped.length===0,'наружу запросов нет');
    await page.context().close();
  }
  /* 2. Снимок экрана правки */
  if(OUT){
    const db=makeDb();db.who=HEAD;db.shifts=[];db.reports.push({id:1,branch:'70let',date:DAY,version:1,data:V1,uid:'pre-v1'});
    const{page}=await session(browser,db,url);
    await page.evaluate(async()=>{S.date='2026-11-24';S.dateManual=true;await openBranch('70let')});await wait(500);
    await shot(page,'l34a-0-prosmotr');
    await page.locator('[data-act="headfix"]').click();await wait(400);
    await page.evaluate(()=>{S.form.corr_reason='короткая';render()});await page.locator('[data-act="submit"]').first().click();await wait(400);
    await page.evaluate(()=>{const e=document.getElementById('form-errors');if(e)e.scrollIntoView({block:'start'})});
    await shot(page,'l34a-1-pravka');
    await page.context().close();
  }
  /* 3. Админ (не руководитель) после окна — правка не проходит; кнопки «Исправить отчёт» у админа нет */
  {
    const db=makeDb();db.windowClosed=true;db.shifts=[];
    db.reports.push({id:1,branch:'70let',date:DAY,version:1,data:V1,uid:'pre-v1'});
    const{page,errs}=await session(browser,db,url);
    await page.evaluate(async()=>{S.date='2026-11-24';S.dateManual=true;await openBranch('70let')});await wait(500);
    ok(await page.locator('[data-act="headfix"]').count()===0,'у администратора кнопки «Исправить отчёт» нет');
    await page.evaluate(()=>{S.form.corr_reason='исправила';S.form.total='1000';S.form.cash='600';S.form.close='700';S.form.doctors['4'].val='1000';render()});
    await page.locator('[data-act="submit"]').first().click();await wait(1000);
    ok(db.reports.length===1,'админ после 12:00: правка не принята (window_closed), версия не добавилась');
    ok(errs.length===0,'ошибок JS нет'+(errs.length?': '+errs.join('; '):''));
    await page.context().close();
  }
  /* 4. Несданный отчёт: руководитель за админа не сдаёт — формы нет */
  {
    const db=makeDb();db.who=HEAD;db.shifts=[];
    const{page}=await session(browser,db,url);
    await page.evaluate(async()=>{S.date='2026-11-24';S.dateManual=true;await openBranch('70let')});await wait(500);
    const s=await page.evaluate(()=>({nosub:!!S.nosub,form:!!S.form,fix:!!document.querySelector('[data-act="headfix"]')}));
    ok(s.nosub&&!s.form&&!s.fix,'несданный отчёт: у руководителя карточка «не сдан», формы и «Исправить» нет');
    await page.context().close();
  }
  await browser.close();server.close();
  const fail=res.filter(x=>!x[0]).length;
  console.log((fail?'FAIL':'PASS')+' '+(res.length-fail)+'/'+res.length);
  process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
