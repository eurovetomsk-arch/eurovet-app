// 2.0.19: обновление PWA не навигирует из activate; PIN и плитки стабильны.
// Только локальный HTTP и подставные RPC, наружу запросы запрещены.
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const pw=require(process.env.EVROVET_PLAYWRIGHT_MODULE||'playwright-core');
const root=path.resolve(__dirname,'..'),rd=f=>fs.readFileSync(path.join(root,f),'utf8');
const sw=rd('sw.js'),view=rd('scripts/view.js'),boot=rd('scripts/bootstrap.js'),login=rd('scripts/login.js');

assert.doesNotMatch(sw,/\.navigate\(/,'activate must never navigate a client');
assert.match(sw,/postMessage\(\{type:'EV_UPDATE_READY'/,'activate notifies the page after claim');
assert.match(sw,/const V='ev2-shell-34'/,'candidate gets a fresh complete shell cache');
assert.doesNotMatch(sw,/if\(keys\.includes\(V\)\)return/,'install never accepts an old or partially filled cache as complete');
assert.match(sw,/caches\.open\(V\)[\s\S]+c\.addAll\(SHELL/,'install fills the complete shell before activation');
assert.match(sw,/const saved=\(\)=>caches\.open\(V\)/,'offline fallback is restricted to the current release cache');
assert.doesNotMatch(sw,/const saved=\(\)=>caches\.match/,'offline fallback never searches stale caches globally');
assert.match(view,/numberActive=S\.view==='login'.+S\.loginStep==='number'.+S\.loginNumber\.length>0/,'personal number keypad protects itself from auto reload');
assert.match(view,/pinActive=S\.view==='login'&&S\.loginScreen==='keypad'/,'PIN keypad protects itself from auto reload');
assert.match(view,/const calm=S\.view==='login'&&!S\.token/,'automatic update is allowed only before authentication');
assert.match(boot,/EV_UPDATE_READY/,'page listens for the non-blocking update message');
assert.match(login,/ev_login_number[^\n]+,10000\)/,'login has a bounded 10 second wait');

const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'application/javascript','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.json':'application/json','.webmanifest':'application/manifest+json'};
let swBuild='2.0.19',swCache='ev2-shell-34',servedVersion='2.0.19',rootGets=0;
const server=http.createServer((q,s)=>{
  const clean=decodeURIComponent(q.url.split('?')[0]);if((clean==='/'||clean==='/index.html')&&q.headers['sec-fetch-mode']==='navigate')rootGets++;
  const rel=clean.replace(/^\/+/,'')||'index.html',f=path.resolve(root,rel);
  if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){s.writeHead(404).end();return}
  let body=fs.readFileSync(f);if(rel==='index.html')body=Buffer.from(body.toString().replace('content="2.0.19"','content="'+servedVersion+'"'));if(rel==='scripts/common.js')body=Buffer.from(body.toString().replace("appVer:'2.0.19'","appVer:'"+servedVersion+"'"));if(rel==='sw.js')body=Buffer.from(body.toString().replace("const BUILD='2.0.19'","const BUILD='"+swBuild+"'").replace("const V='ev2-shell-34'","const V='"+swCache+"'"));
  s.writeHead(200,{'Content-Type':mime[path.extname(f)]||'application/octet-stream','Cache-Control':'no-store'});s.end(body);
});
const HEAD={id:1,person_id:1,full_name:'Руководитель Тест Тестович',short_name:'Руководитель Т.',head:true,roles:['head']};
const delay={ev_day_status:120,ev_flags_pending:260,ev_vaccines_overview:380,ev_med_pending_count:500,ev_card_state:650};
function answer(n){
  if(n==='ev_login_number')return{ok:true,token:'qa-token',person:HEAD};
  if(n==='ev_day_status')return{ok:true,branches:[]};
  if(n==='ev_flags_pending')return{ok:true,pending:[],accepted:[],coverage:[]};
  if(n==='ev_vaccines_overview')return{ok:true,today:'2026-11-26',items:[],branches:[],missing_today:[]};
  if(n==='ev_med_pending_count')return{ok:true,count:2};
  if(n==='ev_card_state')return{ok:true,role:'head',balance:15570,threshold:5000,ops:[]};
  if(n==='ev_collection_transit_list')return{ok:true,items:[]};
  if(n==='ev_mr_list'||n==='ev_leave_pending')return{ok:true,items:[]};
  if(n==='ev_cash_on_hand')return{ok:true,on_hand:0,by_branch:{},pending:0,from:'2026-11-01'};
  return{ok:true,rows:[],items:[],branches:[],pending:[],accepted:[],coverage:[]};
}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const out=[],ok=(x,m)=>{out.push([!!x,m]);console.log((x?'PASS ':'FAIL ')+m)};

async function exercise(kind,browser,url){
  servedVersion='2.0.19';swBuild='2.0.19';swCache='ev2-shell-34';
  const ctx=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await ctx.newPage(),calls={},escaped=[],errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await ctx.route('**/*',async route=>{const u=route.request().url();if(u.startsWith(url))return route.continue();if(!/\/rest\/v1\/rpc\//.test(u)){escaped.push(u);return route.abort()}const n=u.split('/').pop().split('?')[0];calls[n]=(calls[n]||0)+1;await wait(delay[n]||20);return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(answer(n))})});
  await page.goto(url,{waitUntil:'domcontentloaded'});await page.evaluate(()=>localStorage.clear());await page.reload({waitUntil:'domcontentloaded'});
  await page.evaluate(()=>{window.__homeReplace=0;const old=stableHtml;stableHtml=function(el,html,keep){const changed=old(el,html,keep);if(changed&&el&&el.id==='app'&&S.view==='branch')window.__homeReplace++;return changed}});
  await page.locator('[data-act="loginstart"]').click();
  await page.evaluate(()=>{const seq='123123456',b={};document.querySelectorAll('[data-act="logindigit"]').forEach(x=>b[x.dataset.n]=x);for(const n of seq)b[n].dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerType:'touch'}))});
  await page.waitForFunction(()=>S.view==='branch');const first=await page.evaluateHandle(()=>document.querySelector('.ui2-role-tile img'));
  await wait(1300);
  const st=await page.evaluate(img=>{const before=window.__homeReplace;render();render();render();return{replaced:before,extra:window.__homeReplace-before,same:img===document.querySelector('.ui2-role-tile img'),version:CFG.appVer}},first);
  ok(st.version==='2.0.19',kind+': candidate version loaded');
  ok(st.replaced<=2,kind+': staggered home data caused at most one post-login rebuild ('+st.replaced+')');
  ok(st.extra===0,kind+': identical renders including NBSP do not rebuild the home');
  ok(st.same,kind+': first decoded tile icon survives background data loads');
  ok((calls.ev_day_status||0)===1&&(calls.ev_flags_pending||0)===1,kind+': day status and flags load once');
  const pin=await page.evaluate(async()=>{S.token=null;S.view='login';S.loginScreen='keypad';S.loginStep='pin';S.loginPin='123';S.busy=false;render();let reloads=0;reloadNew=()=>{reloads++};const old=fetch;fetch=async u=>String(u).includes('index.html?u=')?{ok:true,text:async()=>'<meta name="evrovet-version" content="9.9.9">'}:old(u);await checkUpdate(true);return{reloads,banner:document.getElementById('updwrap').innerText,pin:S.loginPin}});
  ok(pin.reloads===0&&pin.pin==='123'&&pin.banner.includes('9.9.9'),kind+': update waits while PIN is being typed');
  const number=await page.evaluate(async()=>{S.token=null;S.view='login';S.loginScreen='keypad';S.loginStep='number';S.loginNumber='12';S.loginPin='';document.getElementById('updwrap').innerHTML='';let reloads=0;reloadNew=()=>{reloads++};await checkUpdate(true);return{reloads,banner:document.getElementById('updwrap').innerText,number:S.loginNumber}});
  ok(number.reloads===0&&number.number==='12'&&number.banner.includes('9.9.9'),kind+': update waits while personal number is being typed');
  const signed=await page.evaluate(async()=>{S.token='qa-token';S.view='branch';S.loginNumber='123';S.loginPin='';document.getElementById('updwrap').innerHTML='';let reloads=0;reloadNew=()=>{reloads++};await checkUpdate(true);return{reloads,banner:document.getElementById('updwrap').innerText}});
  ok(signed.reloads===0&&signed.banner.includes('9.9.9'),kind+': authenticated session is never silently reloaded');
  ok(errors.length===0,kind+': no JavaScript errors');ok(escaped.length===0,kind+': no external requests');await ctx.close();
}

async function swUpdate(browser,url){
  servedVersion='2.0.18';swBuild='2.0.18';swCache='ev2-shell-33';rootGets=0;
  const ctx=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'allow'}),page=await ctx.newPage();
  await page.goto(url+'?sw=1',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>navigator.serviceWorker.controller,{timeout:10000});const before=rootGets;servedVersion='2.0.19';swBuild='2.0.19';swCache='ev2-shell-34';
  const ms=await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration(),t=performance.now();await r.update();await new Promise((resolve,reject)=>{const end=setTimeout(()=>reject(new Error('controller timeout')),5000);navigator.serviceWorker.addEventListener('controllerchange',()=>{clearTimeout(end);resolve()},{once:true})});return performance.now()-t});
  await wait(300);ok(ms<5000,'chromium: service worker update activates without minute-long wait ('+Math.round(ms)+' ms)');ok(rootGets===before,'chromium: activate does not navigate the open page');
  const cachesAfter=await page.evaluate(()=>caches.keys());ok(cachesAfter.includes('ev2-shell-34'),'chromium: complete ev2-shell-34 exists after update ('+cachesAfter.join(', ')+')');
  await ctx.setOffline(true);const offline=await ctx.newPage();await offline.goto(url+'?offline=1',{waitUntil:'domcontentloaded'});const version=await offline.locator('meta[name="evrovet-version"]').getAttribute('content');ok(version==='2.0.19','chromium: offline after update opens the candidate shell, not 2.0.18');await ctx.close();
}

(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
  for(const kind of ['chromium','webkit','firefox']){let b;try{b=await pw[kind].launch({headless:true});await exercise(kind,b,url)}catch(e){ok(false,kind+': '+e.message)}finally{if(b)await b.close()}}
  let b;try{b=await pw.chromium.launch({headless:true});await swUpdate(b,url)}catch(e){ok(false,'chromium service worker: '+e.message)}finally{if(b)await b.close()}
  server.close();const bad=out.filter(x=>!x[0]).length;console.log((bad?'FAIL':'PASS')+' '+(out.length-bad)+'/'+out.length);process.exit(bad?1:0)
})().catch(e=>{console.error(e);server.close();process.exit(1)});
