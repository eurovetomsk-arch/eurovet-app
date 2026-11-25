// UI 2.0.10: мобильная/настольная геометрия, быстрый PIN, стабильные иконки и справочник.
// Только локальный HTTP и подставные RPC; наружу запросы запрещены.
const fs=require('fs'),http=require('http'),path=require('path');
const pw=require(process.env.EVROVET_PLAYWRIGHT_MODULE||'playwright-core');
const root=path.resolve(__dirname,'..'),OUT=process.env.OUT||path.join(root,'artifacts','ui-polish-20261125');
fs.mkdirSync(OUT,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.json':'application/json','.webmanifest':'application/manifest+json'};
const server=http.createServer((q,s)=>{const rel=decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/,'')||'index.html',f=path.resolve(root,rel);if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){s.writeHead(404).end();return}s.writeHead(200,{'Content-Type':mime[path.extname(f)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(f).pipe(s)});
const HEAD={id:1,person_id:1,full_name:'Руководитель Тест',short_name:'Руководитель Т.',head:true,roles:['head']};
const ITEMS=Array.from({length:78},(_,i)=>({id:1000+i,section:'med',name:(i?'Позиция медицинская ':'Адреналин 1мг/мл 1мл №5 амп')+(i||''),unit:i%3?'ампула':'мл',grp:i%2?'Препараты':'Расходные материалы',active:true}));
function rpc(name){
  if(name==='ev_login_number')return{ok:true,token:'qa-token',person:HEAD};
  if(name==='ev_med_catalog')return{ok:true,items:ITEMS};
  if(name==='ev_med_summary')return{ok:true,rows:[],open:[]};
  if(name==='ev_whos_where')return{ok:true,shifts:[]};
  if(name==='ev_day_status')return{ok:true,date:'2026-11-25',list:[]};
  if(name==='ev_cash_summary'||name==='ev_safe_balance')return{ok:true,rows:[]};
  return{ok:true,rows:[],items:[],flags:[],coverage:[],accepted:[],pending:[],shifts:[]};
}
const profiles=[
  ['phone-320',320,568],['phone-360',360,800],['iphone-375',375,812],['phone-390',390,844],['phone-430',430,932],
  ['tablet-portrait',768,1024],['tablet-landscape',1024,768],['desktop',1440,900]
];
const results=[];const ok=(v,m)=>{results.push([!!v,m]);console.log((v?'PASS ':'FAIL ')+m)};
async function runEngine(kind,browser,url){
  for(const [name,width,height] of profiles){
    const ctx=await browser.newContext({viewport:{width,height},deviceScaleFactor:width<500?2:1,serviceWorkers:'block'}),page=await ctx.newPage(),escaped=[],errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await ctx.route('**/*',async route=>{const u=route.request().url();if(u.startsWith(url))return route.continue();if(!/\/rest\/v1\/rpc\//.test(u)){escaped.push(u);return route.abort()}const n=u.split('/').pop().split('?')[0];return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(rpc(n))})});
    await page.goto(url,{waitUntil:'domcontentloaded'});await page.evaluate(()=>localStorage.clear());await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('[data-act="loginstart"]').click();
    /* Ссылки на кнопки берём один раз и шлём быстрые pointerdown как реальный
       телефон: тест ловит потерю касаний и удаление клавиатуры между цифрами. */
    await page.evaluate(()=>{const seq='123123456',buttons={};document.querySelectorAll('[data-act="logindigit"]').forEach(b=>buttons[b.dataset.n]=b);for(const n of seq)buttons[n].dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerType:'touch',isPrimary:true}))});
    await page.waitForTimeout(250);
    const entered=await page.evaluate(()=>({view:S.view,number:S.loginNumber,pin:S.loginPin,busy:S.busy}));
    ok(entered.view==='branch'&&entered.number==='123',kind+' '+name+': быстрый 3+6-значный ввод принят без потери цифр');
    const home=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,imgs:[...document.querySelectorAll('.ui2-role-tile img')],first:document.querySelector('.ui2-role-tile img')}));
    ok(home.overflow<=0,kind+' '+name+': главная без горизонтального выезда');
    const stable=await page.evaluate(()=>{const bar=document.getElementById('barwrap'),head=document.getElementById('hdr'),img=document.querySelector('.ui2-role-tile img');let bm=0,hm=0;const bo=new MutationObserver(x=>bm+=x.length),ho=new MutationObserver(x=>hm+=x.length);bo.observe(bar,{childList:true,subtree:true});ho.observe(head,{childList:true,subtree:true});render();render();render();bo.disconnect();ho.disconnect();return{bm,hm,same:img===document.querySelector('.ui2-role-tile img')}});
    ok(stable.bm===0&&stable.hm===0&&stable.same,kind+' '+name+': повторные фоновые отрисовки не пересоздают навигацию, шапку и иконку');
    const navStable=await page.evaluate(()=>{const nav=document.querySelector('.ui2-bottom-nav'),icons=[...nav.querySelectorAll('svg')];S.view='med';render();return{nav:nav===document.querySelector('.ui2-bottom-nav'),icons:icons.every((x,i)=>x===document.querySelectorAll('.ui2-bottom-nav svg')[i])}});
    ok(navStable.nav&&navStable.icons,kind+' '+name+': переход между экранами не пересоздаёт нижнюю панель и SVG');
    await page.evaluate(items=>{S.view='med';MD.step='edit';MD.cat={ok:true,items};MD.etab='med';MD.eq='';render();scrollTo(0,0)},ITEMS);
    const med=await page.evaluate(()=>{const card=document.querySelector('.md-ed2'),sel=card&&card.querySelector('.md-es'),grp=card&&card.querySelector('.md-ef-group');return{overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,select:sel&&sel.options[sel.selectedIndex].text,selectWidth:sel&&sel.getBoundingClientRect().width,groupWidth:grp&&grp.getBoundingClientRect().width,cardWidth:card&&card.getBoundingClientRect().width,labels:[...card.querySelectorAll('.md-ef>span')].map(x=>x.textContent)}});
    ok(med.overflow<=0&&med.select==='Медицинские'&&med.selectWidth>=120&&med.groupWidth>med.selectWidth*1.8&&['Название','Раздел','Единица','Группа'].every(x=>med.labels.includes(x)),kind+' '+name+': справочник ровный, «Медицинские» помещается, поля подписаны');
    const bottom=await page.evaluate(()=>{scrollTo(0,document.documentElement.scrollHeight);const card=[...document.querySelectorAll('.md-ed2')].at(-1),nav=document.querySelector('.ui2-bottom-nav'),cr=card.getBoundingClientRect(),nr=nav.getBoundingClientRect();return{cardBottom:cr.bottom,navTop:nr.top,scrollY,scrollMax:document.documentElement.scrollHeight-innerHeight}});
    ok(bottom.scrollY>=bottom.scrollMax-2&&bottom.cardBottom<=bottom.navTop-8,kind+' '+name+': последняя карточка полностью прокручивается выше нижней панели');
    if((kind==='chromium'||kind==='webkit')&&(name==='phone-390'||name==='desktop')){await page.evaluate(()=>document.querySelector('.md-ed2')?.scrollIntoView({block:'center'}));await page.screenshot({path:path.join(OUT,kind+'-'+name+'-med.png'),fullPage:false})}
    ok(errors.length===0,kind+' '+name+': нет ошибок JavaScript'+(errors.length?' — '+errors.join('; '):''));
    ok(escaped.length===0,kind+' '+name+': нет внешних запросов');
    await ctx.close();
  }
}
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
  for(const kind of ['chromium','webkit','firefox']){let browser;try{browser=await pw[kind].launch({headless:true});ok(true,kind+': движок запущен');await runEngine(kind,browser,url)}catch(e){ok(false,kind+': движок не прошёл — '+e.message)}finally{if(browser)await browser.close()}}
  server.close();const fail=results.filter(x=>!x[0]).length;console.log((fail?'FAIL':'PASS')+' '+(results.length-fail)+'/'+results.length);process.exit(fail?1:0)
})().catch(e=>{console.error(e);server.close();process.exit(1)});
