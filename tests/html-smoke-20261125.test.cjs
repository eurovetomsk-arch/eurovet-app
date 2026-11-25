// Собирает существующие браузерные HTML-тесты в один локальный smoke-прогон.
const fs=require('fs'),http=require('http'),path=require('path');
const pw=require(process.env.EVROVET_PLAYWRIGHT_MODULE||'playwright-core');
const root=path.resolve(__dirname,'..');
const files=['homegrid.test.html','medorder.test.html','analytics.test.html','apptcard.test.html','cardvtb.test.html','vmcheck.test.html','vmwait.test.html'];
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.json':'application/json'};
const server=http.createServer((q,s)=>{const rel=decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/,'')||'index.html',f=path.resolve(root,rel);if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){s.writeHead(404).end();return}s.writeHead(200,{'Content-Type':mime[path.extname(f)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(f).pipe(s)});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/tests/`,browser=await pw.chromium.launch({headless:true});let fail=0;
  for(const file of files){const ctx=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await ctx.route('**/*',r=>r.request().url().startsWith(base.replace('/tests/','/'))?r.continue():r.abort());await page.goto(base+file,{waitUntil:'load'});await page.waitForTimeout(500);const result=await page.locator('#o').textContent().catch(()=>null);const pass=!!result&&/^RESULT PASS\b/.test(result)&&errors.length===0;console.log((pass?'PASS ':'FAIL ')+file+': '+(result||'нет RESULT')+(errors.length?' | '+errors.join('; '):''));if(!pass)fail++;await ctx.close()}
  await browser.close();server.close();console.log((fail?'FAIL':'PASS')+' '+(files.length-fail)+'/'+files.length);process.exit(fail?1:0)
})().catch(e=>{console.error(e);server.close();process.exit(1)});
