// L35: аналитика «Месяц» в 375 px — три строки у показателя, без горизонтальной прокрутки; снимок (OUT).
// Запуск (нужен node и playwright-core):
//   EVROVET_PLAYWRIGHT_MODULE=<путь>/playwright-core node tests/analytics-375-l35.test.cjs
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
const C=(rev,inv,pr,pi,ph,pph,x)=>Object.assign({revenue:rev,invoices:inv,avg_check:Math.round(rev/inv*100)/100,pharmacy:ph,prev_revenue:pr,prev_invoices:pi,prev_avg_check:Math.round(pr/pi*100)/100,prev_pharmacy:pph,
  revenue_pct:Math.round((rev/pr-1)*1000)/10,invoices_pct:Math.round((inv/pi-1)*1000)/10,avg_check_pct:Math.round(((rev/inv)/(pr/pi)-1)*1000)/10,pharmacy_pct:Math.round((ph/pph-1)*1000)/10,days:23,prev_days:23,clinic_complete:true,pharmacy_complete:true},x||{});
const AN_MONTH={ok:true,period:'month',anchor:'2026-11-23',from:'2026-11-01',to:'2026-11-23',prev_from:'2026-10-01',prev_to:'2026-10-23',alt_from:'2025-11-01',alt_to:'2025-11-23',partial:true,open:false,can_next:false,closed_through:'2026-11-23',
  network:C(3560788,1182,3796225,1240,412300,398700,{alt:C(3560788,1182,2396225,905,412300,301200)}),
  branches:[Object.assign({id:'marksa',title:'Маркса'},C(1520400,498,1611800,530,180200,171000,{alt:C(1520400,498,1010500,380,180200,130100)})),
            Object.assign({id:'70let',title:'70 лет Октября'},C(1101388,371,1190425,388,121100,120300,{alt:C(1101388,371,745725,290,121100,91100)})),
            Object.assign({id:'pereleta',title:'Перелёта'},C(939000,313,994000,322,111000,107400,{alt:C(939000,313,640000,235,111000,80000)}))],
  doctors:[]};
const MONS=Array.from({length:12},(_,i)=>{const m=i+1,mm=String(m).padStart(2,'0');if(m===12)return{month:12,empty:true};const last=m===11?23:new Date(Date.UTC(2026,m,0)).getUTCDate();
  return Object.assign({month:m,empty:false,from:'2026-'+mm+'-01',to:'2026-'+mm+'-'+last,prev_from:'2025-'+mm+'-01',prev_to:'2025-'+mm+'-'+last,partial:m===11},C(3400000+m*37000,1100+m*7,2500000+m*30000,900+m*5,400000,380000))});
const AN_YEAR={ok:true,period:'months',anchor:'2026-11-23',from:'2026-01-01',to:'2026-11-23',prev_from:'2025-01-01',prev_to:'2025-11-23',alt_from:null,alt_to:null,partial:true,open:false,can_next:false,closed_through:'2026-11-23',
  network:C(40210000,13100,29050000,10350,4400000,4100000),branches:[],doctors:[],months:MONS};
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
    case'ev_analytics_overview':return a.p_period==='months'?AN_YEAR:AN_MONTH;
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
  const db=makeDb();db.who=HEAD;
  const{page,errs,escaped}=await session(browser,db,url);
  await page.evaluate(async()=>{AN.period='month';await showAnalytics()});await wait(700);
  const txt=await page.locator('#app').innerText();
  ok(/Сейчас \(1–23 нояб 2026\)\s*3\s560\s788 ₽/.test(txt)&&/Октябрь \(1–23 окт 2026\)\s*3\s796\s225 ₽\s*▼ −6,2%/.test(txt)&&/Год назад \(1–23 нояб 2025\)\s*2\s396\s225 ₽\s*▲ \+48,6%/.test(txt),'Итог сети «Месяц»: Сейчас / Октябрь / Год назад, цифры и %');
  const w=await page.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,wide:[...document.querySelectorAll('#app *')].filter(e=>e.getBoundingClientRect().right>document.documentElement.clientWidth+0.5).length}));
  ok(w.sw<=w.cw&&w.wide===0,'375 px: без горизонтальной прокрутки ('+w.sw+'/'+w.cw+', вылезающих '+w.wide+')');
  await shot(page,'l35-1-mesyac-375');
  await page.locator('details.an-br summary').first().click();await wait(300);
  const w2=await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth);
  ok(w2,'филиал раскрыт: без горизонтальной прокрутки');
  await page.evaluate(()=>{const e=document.querySelector('details.an-br[open]');if(e)e.scrollIntoView({block:'start'})});
  await shot(page,'l35-2-filial-375');
  if(OUT){await page.setViewportSize({width:375,height:2400});await wait(300);await page.screenshot({path:path.join(OUT,'l35-0-mesyac-375-full.png'),fullPage:true})}
  await page.setViewportSize({width:375,height:812});
  await page.evaluate(async()=>{AN.period='year';AN.data=null;await loadAnalytics();window.scrollTo(0,0)});await wait(600);
  const ty=await page.locator('#app').innerText();
  ok(/Год назад \(1 янв – 23 нояб 2025\)/.test(ty)&&/По месяцам/.test(ty)&&/Январь\s+2026 \(1–31 янв 2026\)/.test(ty)&&/2025 \(1–31 янв 2025\)/.test(ty)&&!/Помесячно/.test(ty),'«Год»: итог года к прошлому году и 12 месяцев; вкладки «Помесячно» нет');
  ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),'«Год» 375 px: без горизонтальной прокрутки');
  await shot(page,'l35-3-god-375');
  await page.evaluate(()=>{const e=[...document.querySelectorAll('h2')].find(x=>x.textContent==='По месяцам');if(e)e.scrollIntoView({block:'start'})});
  await shot(page,'l35-4-god-mesyacy-375');
  ok(errs.length===0,'ошибок JS нет'+(errs.length?': '+errs.join('; '):''));ok(escaped.length===0,'наружу запросов нет');
  await browser.close();server.close();
  const fail=res.filter(x=>!x[0]).length;
  console.log((fail?'FAIL':'PASS')+' '+(res.length-fail)+'/'+res.length);
  process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
