// L36: врачебная заявка — частичная доставка (закупщик: ✓/число/«Не везём», «Ждёт доставки»; врач: плашка, повтор, история).
// Запуск (нужен node и playwright-core):
//   EVROVET_PLAYWRIGHT_MODULE=<путь>/playwright-core node tests/med-delivery-l36.test.cjs
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

/* ---- подставная база (логика L36 повторяет SQL: остаток по умолчанию ждёт, повтор закрытия без дублей, отметки только у закупщика) ---- */
const ITEMS=[{id:101,section:'vet',name:'Кетамин 10 мл',unit:'шт.',active:true},{id:102,section:'vet',name:'Дексаметазон 4 мг',unit:'уп.',active:true},{id:103,section:'vet',name:'Золетил 100',unit:'шт.',active:true},{id:104,section:'vet',name:'Пропофол 20 мл',unit:'фл.',active:true},{id:105,section:'supply',name:'Шприц 2 мл',unit:'шт.',active:true}];
const TODAY='2026-11-25';const dd=(s)=>Math.round((Date.parse(TODAY)-Date.parse(s))/864e5);
function makeDb(){return{who:null,calls:{},seq:10,
  orders:[{id:1,branch:'marksa',status:'open',lines:{101:10,102:8,103:3}},{id:2,branch:'pereleta',status:'closed',lines:{104:3},marks:{104:{delivered:0,rest:'wait'}}}],
  wait:[{id:1,branch:'pereleta',item:104,qty:3,since:'2026-11-19',from:2,status:'wait'},{id:2,branch:'marksa',item:105,qty:50,since:'2026-11-24',from:0,status:'wait'}]}}
const isBuyer=db=>!!(db.who&&db.who.head);
function rowsOf(db,branch){return db.wait.filter(w=>w.status==='wait'&&(!branch||w.branch===branch)).map(w=>{const i=ITEMS.find(x=>x.id===w.item);return{id:w.id,branch:w.branch,item:w.item,name:i.name,unit:i.unit,qty:w.qty,since:w.since,days:dd(w.since),old:dd(w.since)>4}})}
function rpc(db,name,a){
  db.calls[name]=(db.calls[name]||0)+1;
  switch(name){
    case'ev_login_number':return{ok:true,token:'qa-token',person:db.who};
    case'ev_med_catalog':return{ok:true,items:ITEMS};
    case'ev_med_summary':{if(!isBuyer(db))return{ok:false,error:'forbidden'};const rows={};db.orders.filter(o=>o.status==='open'&&(!a.p_branch||o.branch===a.p_branch)).forEach(o=>Object.keys(o.lines).forEach(k=>{const i=ITEMS.find(x=>x.id==k);const r=rows[k]||(rows[k]={item:i.id,section:i.section,name:i.name,unit:i.unit,qty:{},total:0});r.qty[o.branch]=o.lines[k];r.total+=o.lines[k]}));return{ok:true,rows:Object.values(rows)}}
    case'ev_med_order_get':{const o=db.orders.find(x=>x.branch===a.p_branch&&x.status==='open');return{ok:true,branch:a.p_branch,order_id:o?o.id:null,lines:o?Object.keys(o.lines).map(k=>({item:Number(k),qty:o.lines[k],by:'Тест'})):[],prev:{}}}
    case'ev_med_line_set':{let o=db.orders.find(x=>x.branch===a.p_branch&&x.status==='open');if(!o){o={id:++db.seq,branch:a.p_branch,status:'open',lines:{}};db.orders.push(o)}if(a.p_qty)o.lines[a.p_item]=a.p_qty;else delete o.lines[a.p_item];return{ok:true,qty:a.p_qty,order_id:o.id}}
    case'ev_med_wait_list':{if(!a.p_branch&&!isBuyer(db))return{ok:false,error:'forbidden'};const rs=rowsOf(db,a.p_branch);const c={};rs.forEach(w=>{const x=c[w.branch]||(c[w.branch]={wait:0,old:0});x.wait++;if(w.old)x.old++});return{ok:true,today:TODAY,rows:rs,counts:c}}
    case'ev_med_close_order':{if(!isBuyer(db))return{ok:false,error:'forbidden'};const o=db.orders.find(x=>x.branch===a.p_branch&&x.status==='open');if(!o)return{ok:true,closed:0,wait:0,dropped:0};
      for(const k of Object.keys(o.lines)){const m=(a.p_marks||[]).find(x=>String(x.item)===k);if(!m||m.qty!==o.lines[k])return{ok:false,error:'conflict',item:Number(k)}}
      let nw=0,nd=0;o.marks={};for(const k of Object.keys(o.lines)){const m=(a.p_marks||[]).find(x=>String(x.item)===k)||{};const d=m.delivered||0;if(d<0||d>o.lines[k])return{ok:false,error:'qty'};const left=o.lines[k]-d;const rest=left>0?(m.rest||'wait'):null;
        if(rest==='drop'&&!['extra','no_supplier','other'].includes(m.reason))return{ok:false,error:'reason'};
        o.marks[k]={delivered:d,rest,reason:rest==='drop'?m.reason:null};if(rest==='wait'&&!db.wait.some(w=>w.from===o.id&&w.item==k)){db.wait.push({id:++db.seq,branch:o.branch,item:Number(k),qty:left,since:TODAY,from:o.id,status:'wait'});nw++}if(rest==='drop')nd++}
      o.status='closed';return{ok:true,closed:1,order_id:o.id,wait:nw,dropped:nd}}
    case'ev_med_wait_mark':{if(!isBuyer(db))return{ok:false,error:'forbidden'};let n=0;for(const m of a.p_marks){const w=db.wait.find(x=>x.id===m.id);if(!w||w.status!=='wait')continue;if(m.drop){w.status='dropped';w.reason=m.reason;n++}else if(m.delivered>0){if(m.delivered>=w.qty)w.status='done';else w.qty-=m.delivered;n++}}return{ok:true,marked:n}}
    case'ev_med_history':return{ok:true,orders:db.orders.filter(o=>o.branch===a.p_branch&&o.status==='closed').map(o=>({id:o.id,opened_at:'2026-11-24T08:00:00Z',closed_at:'2026-11-25T08:00:00Z',lines:Object.keys(o.lines).map(k=>{const i=ITEMS.find(x=>x.id==k),m=(o.marks||{})[k],w=db.wait.find(x=>x.from===o.id&&x.item==k);return{item:i.id,name:i.name,unit:i.unit,qty:o.lines[k],delivered:m?m.delivered:null,rest:m?m.rest:null,reason:m?m.reason:null,wait_status:w?w.status:null,wait_reason:w?w.reason||null:null}})}))}
    case'ev_med_pending_count':return{ok:true,count:0,branches:[]};
    default:return{ok:true,rows:[],items:[],flags:[],shifts:[]};
  }
}
const HEAD={id:1,full_name:'Белова Елена',short_name:'Белова Е.',head:true,roles:['head']};
const DOC={id:16,full_name:'Аристова Анна',short_name:'Аристова А.',admin:true,roles:['admin','doctor']};
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
const shot=async(page,name)=>{if(!OUT)return;await wait(500);await page.screenshot({path:path.join(OUT,name+'.png')})};
const st=page=>page.evaluate(()=>({step:MD.step,dm:JSON.parse(JSON.stringify(MDD.dm)),ov:(document.getElementById('ovwrap')||{}).innerText||'',app:document.getElementById('app').innerText}));
const noWide=page=>page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth);
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
  const browser=await pw.chromium.launch({headless:true});
  /* 1. Закупщик: заявка Маркса — 5 из 10 (ждёт), 5 из 8 «Не везём: лишнее», Золетил ✓ → закрыть; двойное нажатие — один вызов */
  {
    const db=makeDb();db.who=HEAD;
    const{page,errs,escaped}=await session(browser,db,url);page.on('dialog',d=>d.accept());
    await page.evaluate(async()=>{await showMed()});await wait(700);
    let s=await st(page);
    ok(s.step==='sum'&&/Открытые \(1\)/.test(s.app)&&/Ждёт доставки \(2\)/.test(s.app),'закупщик: вкладки «Открытые (1) / Ждёт доставки (2)»');
    await page.locator('[data-mact="sumbr"][data-id="marksa"]').click();await wait(500);
    await page.locator('[data-mact="deliver"]').click();await wait(300);
    await page.fill('.mdd-qty[data-item="101"]','5');await page.locator('.mdd-qty[data-item="101"]').dispatchEvent('change');await wait(200);
    await page.fill('.mdd-qty[data-item="102"]','5');await page.locator('.mdd-qty[data-item="102"]').dispatchEvent('change');await wait(200);
    await page.locator('[data-dact="rest"][data-item="102"][data-v="drop"]').click();await wait(200);
    await page.locator('[data-dact="reason"][data-item="102"][data-r="extra"]').click();await wait(200);
    await page.locator('[data-dact="dfull"][data-item="103"]').click();await wait(200);
    s=await st(page);
    ok(/Остальные 5 шт\./.test(s.app)&&/Остальные 3 уп\./.test(s.app)&&/Привезли всё/.test(s.app)&&/Привезли полностью: 1 · частично: 2 · не привезли: 0/.test(s.app),'(а2) 5 из 10 → «Остальные 5 шт.», выбор «Ждёт / Не везём», ✓ — «Привезли всё»');
    ok(await noWide(page),'(а2) 375 px без прокрутки');
    await shot(page,'l36-a2-zakupshik-ostatok');
    db.orders[0].lines[105]=50; /* врач добавил строку, пока закупщик отмечал → сервер: conflict, список обновлён, заявка не закрыта */
    await page.locator('[data-dact="close"]').click();await wait(1200);
    s=await st(page);
    ok(db.orders[0].status==='open'&&s.step==='deliver'&&/Шприц 2 мл/.test(s.app)&&s.dm['101']&&s.dm['101'].d==='5','заявку изменили во время отметок → не закрыта, список обновлён, отметки на месте');
    await page.locator('[data-dact="dfull"][data-item="105"]').click();await wait(200);
    db.calls.ev_med_close_order=0;
    await page.locator('[data-dact="close"]').dblclick();await wait(1200);
    ok(db.calls.ev_med_close_order===1,'двойное нажатие «Закрыть заявку» → один вызов');
    const o=db.orders.find(x=>x.id===1),w=db.wait.filter(x=>x.from===1);
    ok(o.status==='closed'&&w.length===1&&o.marks[105].delivered===50&&w[0].item===101&&w[0].qty===5&&o.marks[102].rest==='drop'&&o.marks[102].reason==='extra'&&o.marks[103].delivered===3,'закрыто: «ждёт» только на остаток Кетамина 5 шт., Дексаметазон — не везём (лишнее)');
    const r2=await page.evaluate(async()=>await rpc('ev_med_close_order',{p_token:S.token,p_branch:'marksa',p_marks:[]},8000));
    ok(r2.closed===0&&db.wait.filter(x=>x.from===1).length===1,'повторное закрытие → closed 0, без дублей «ждёт»');
    /* 2. «Ждёт доставки»: свёрнуто → раскрыто → «Не везём» с причиной → строка ушла */
    await page.locator('[data-dact="tab"][data-id="wait"]').click();await wait(500);
    s=await st(page);
    ok(/Маркса · 2/.test(s.app)&&/Перелёта · 1\s*1 давно/.test(s.app)&&!/Кетамин/.test(s.app),'(б1) филиалы свёрнуты: «Маркса · 2», «Перелёта · 1 · 1 давно»');
    await shot(page,'l36-b1-zhdet-svernuto');
    await page.locator('[data-dact="br"][data-id="pereleta"]').click();await wait(300);
    ok(/Пропофол 20 мл\s*давно/.test((await st(page)).app),'(б2) раскрыт Перелёта: давняя строка с пометкой «давно»');
    await page.locator('[data-dact="br"][data-id="marksa"]').click();await wait(300);
    await shot(page,'l36-b2-zhdet-raskryto');
    await page.locator('[data-dact="br"][data-id="pereleta"]').click();await wait(300);
    const pid=db.wait.find(x=>x.item===104).id;
    await page.locator(`[data-dact="wdrop"][data-wid="${pid}"]`).click();await wait(200);
    await page.locator(`[data-dact="reason"][data-wid="${pid}"][data-r="no_supplier"]`).click();await wait(200);
    await shot(page,'l36-b3-ne-vezem');
    await page.locator('[data-dact="wsave"]').click();await wait(900);
    s=await st(page);
    ok(db.wait.find(x=>x.id===pid).status==='dropped'&&db.wait.find(x=>x.id===pid).reason==='no_supplier'&&!/Пропофол/.test(s.app),'(б3) «Не везём: нет у поставщика» → строка ушла из «Ждёт доставки»');
    const kid=db.wait.find(x=>x.from===1).id;
    await page.locator('[data-dact="br"][data-id="marksa"]').click();await wait(300);
    await page.fill(`.mdd-wq[data-wid="${kid}"]`,'2');await page.locator(`.mdd-wq[data-wid="${kid}"]`).dispatchEvent('change');await wait(200);
    await page.locator('[data-dact="wsave"]').click();await wait(900);
    ok(db.wait.find(x=>x.id===kid).qty===3&&db.wait.find(x=>x.id===kid).status==='wait','частичный привоз из «ждёт»: 2 из 5 → ждёт 3');
    ok(errs.length===0,'ошибок JS нет'+(errs.length?': '+errs.join('; '):''));ok(escaped.length===0,'наружу запросов нет');
    await page.context().close();
  }
  /* 3. Врач: плашка свёрнута/раскрыта, повтор, история; отмечать не может */
  {
    const db=makeDb();db.who=DOC;
    db.orders[0].status='closed';db.orders[0].marks={101:{delivered:5,rest:'wait'},102:{delivered:5,rest:'drop',reason:'extra'},103:{delivered:3,rest:null}};
    db.wait.push({id:50,branch:'marksa',item:101,qty:5,since:'2026-11-25',from:1,status:'wait'},{id:51,branch:'marksa',item:103,qty:2,since:'2026-11-19',from:0,status:'wait'});
    const{page,errs}=await session(browser,db,url);page.on('dialog',d=>d.accept());
    await page.evaluate(async()=>{await showMed()});await wait(700);
    await page.evaluate(async()=>{await mdPickBranch('marksa')});await wait(500);
    let s=await st(page);
    ok(/Ждёт доставки: 3\s*1 давно/.test(s.app)&&!/Кетамин 10 мл —/.test(s.app),'(в1) врач: свёрнутая плашка «Ждёт доставки: 3 · 1 давно»');
    await shot(page,'l36-v1-vrach-plashka');
    await page.locator('[data-dact="wtoggle"]').first().click();await wait(300);
    s=await st(page);
    ok(/Золетил 100 — 2 шт\.\s*давно/.test(s.app)&&/Кетамин 10 мл — 5 шт\./.test(s.app)&&!(await page.locator('.mdd-wait input,.mdd-wait .mdd-chk').count()),'(в2) раскрыто: список своего филиала, только просмотр (нет галочек и чисел)');
    await shot(page,'l36-v2-vrach-raskryto');
    await page.locator('[data-dact="wtoggle"]').first().click();await wait(200);
    const n0=db.calls.ev_med_line_set||0;
    await page.evaluate(async()=>{await mdSet(101,2)});await wait(300);
    s=await st(page);
    ok(/Кетамин 10 мл уже ждёт доставки: 5 шт\., с 25\.11\. Заказать ещё\?/.test(s.ov)&&(db.calls.ev_med_line_set||0)===n0,'(г) повтор: «Кетамин уже ждёт доставки… Заказать ещё?», без ответа не ставится');
    await shot(page,'l36-g-vrach-povtor');
    await page.locator('[data-dact="repno"]').click();await wait(200);
    ok((db.calls.ev_med_line_set||0)===n0,'«Не надо» — в заявку не добавлено');
    await page.evaluate(async()=>{await mdSet(101,2)});await wait(300);
    await page.locator('[data-dact="repyes"]').click();await wait(500);
    ok((db.calls.ev_med_line_set||0)===n0+1&&db.orders.find(o=>o.branch==='marksa'&&o.status==='open').lines[101]===2,'«Да, ещё» — добавлено (подсказка, не запрет)');
    await page.locator('[data-mact="hist"]').click();await wait(500);
    s=await st(page);
    ok(/Привезено 5 из 10 · остальное ждёт доставки/.test(s.app)&&/Привезено 5 из 8 · остальное не везём: лишнее количество/.test(s.app)&&/Привезено всё: 3 шт\./.test(s.app),'(д) история закрытой заявки: серые пометки «Привезено 5 из 8 · остальное не везём: лишнее количество»');
    ok(await noWide(page),'(д) 375 px без прокрутки');
    await shot(page,'l36-d-vrach-istoriya');
    ok(!(await page.locator('[data-dact="close"],[data-dact="wsave"],[data-mact="deliver"]').count()),'врач: кнопок отметок и закрытия нет');
    const f=await page.evaluate(async()=>[(await rpc('ev_med_wait_mark',{p_token:S.token,p_marks:[{id:50,delivered:1}]},8000)).error,(await rpc('ev_med_close_order',{p_token:S.token,p_branch:'marksa',p_marks:[]},8000)).error]);
    ok(f[0]==='forbidden'&&f[1]==='forbidden','врач не может отмечать: сервер отвечает forbidden');
    ok(errs.length===0,'ошибок JS нет'+(errs.length?': '+errs.join('; '):''));
    await page.context().close();
  }
  await browser.close();server.close();
  const fail=res.filter(x=>!x[0]).length;
  console.log((fail?'FAIL':'PASS')+' '+(res.length-fail)+'/'+res.length);
  process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
