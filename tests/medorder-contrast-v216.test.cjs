// Regression: Android/Samsung dark mode must not render item names dark on dark cards.
// Local-only: no Supabase writes, no external requests.
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const pw=require(process.env.EVROVET_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
const css=fs.readFileSync(path.join(root,'styles/view.css'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');

assert.match(css,/\.md-it \.nm\{color:var\(--ink\);-webkit-text-fill-color:var\(--ink\)\}/);
assert.match(css,/\.md-grp\{[^}]*color:var\(--mute\);-webkit-text-fill-color:var\(--mute\)/);
assert.match(html,/name="evrovet-version" content="2\.0\.16"/);
assert.match(html,/styles\/view\.css\?v=216/);
assert.match(sw,/const V='ev2-shell-31'/);

const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
const server=http.createServer((q,s)=>{const rel=decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, '')||'index.html',f=path.resolve(root,rel);if(!f.startsWith(root)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){s.writeHead(404).end();return}s.writeHead(200,{'content-type':mime[path.extname(f)]||'application/octet-stream','cache-control':'no-store'});s.end(fs.readFileSync(f))});
const ITEMS=[
  {id:1,section:'supply',name:'Перчатки смотровые XS',unit:'пачка',grp:'Расходные материалы',active:true},
  {id:2,section:'supply',name:'Бинт стерильный 7×14',unit:'шт',grp:'Расходные материалы',active:true},
  {id:3,section:'supply',name:'Воротник защитный №10',unit:'шт',grp:'Расходные материалы',active:true}
];
function rgb(s){const m=String(s).match(/[\d.]+/g);return m?m.slice(0,3).map(Number):[0,0,0]}
function lum(c){return c.map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0)}
function contrast(a,b){const x=lum(rgb(a)),y=lum(rgb(b));return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}

(async()=>{
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  const origin='http://127.0.0.1:'+server.address().port+'/';
  for(const engine of ['chromium','firefox','webkit']){
    const browser=await pw[engine].launch({headless:true});
    for(const colorScheme of ['light','dark'])for(const viewport of [{width:320,height:568},{width:390,height:844},{width:1366,height:900}]){
      const ctx=await browser.newContext({viewport,colorScheme,serviceWorkers:'block'}),page=await ctx.newPage(),escaped=[];
      await ctx.route('**/*',route=>{if(route.request().url().startsWith(origin))return route.continue();escaped.push(route.request().url());return route.abort()});
      await page.goto(origin,{waitUntil:'domcontentloaded'});
      await page.evaluate(items=>{S.person={id:38,full_name:'Сотрудник',roles:['assistant_tech'],head:false};S.token='local';S.view='med';MD.cat={ok:true,items};MD.step='list';MD.branch='marksa';MD.tab='supply';MD.lines={};MD.q='';render()},ITEMS);
      await page.locator('.md-it .nm').first().waitFor();
      const got=await page.evaluate(()=>{const row=document.querySelector('.md-it'),name=row.querySelector('.nm'),grp=row.querySelector('.md-grp'),minus=row.querySelector('.md-b'),qty=row.querySelector('.md-q'),plus=row.querySelector('.md-b.p'),cs=e=>{const x=getComputedStyle(e);return{color:x.color,fill:x.webkitTextFillColor||x.color,bg:x.backgroundColor}};return{text:name.childNodes[0].textContent.trim(),name:cs(name),grp:cs(grp),row:cs(row),minus:cs(minus),qty:cs(qty),plus:cs(plus),overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,rows:document.querySelectorAll('.md-it').length}});
      const tag=`${engine} ${colorScheme} ${viewport.width}x${viewport.height}`;
      assert.equal(got.text,'Перчатки смотровые XS · пачка',tag+': item name and unit remain present');
      assert.equal(got.rows,3,tag+': all items remain visible');
      assert.ok(contrast(got.name.color,got.row.bg)>=4.5,tag+': item name contrast '+contrast(got.name.color,got.row.bg).toFixed(2));
      assert.ok(contrast(got.grp.color,got.row.bg)>=4.5,tag+': group contrast '+contrast(got.grp.color,got.row.bg).toFixed(2));
      assert.equal(got.name.fill,got.name.color,tag+': WebKit text fill follows explicit foreground');
      assert.ok(contrast(got.minus.color,got.minus.bg)>=4.5,tag+': minus button contrast');
      assert.ok(contrast(got.qty.color,got.qty.bg)>=4.5,tag+': quantity contrast');
      assert.ok(contrast(got.plus.color,got.plus.bg)>=4.5,tag+': plus button contrast');
      assert.ok(got.overflow<=0,tag+': no horizontal overflow');
      assert.equal(escaped.length,0,tag+': no external requests');
      if(process.env.MEDORDER_SCREENSHOT&&engine==='chromium'&&colorScheme==='dark'&&viewport.width===390)await page.screenshot({path:process.env.MEDORDER_SCREENSHOT,fullPage:false});
      await ctx.close();
    }
    await browser.close();
    console.log(engine,'medorder contrast PASS');
  }
  server.close();console.log('PASS medorder contrast v2.0.16 (3 engines × 2 themes × 3 viewports)');
})().catch(e=>{console.error(e);server.close();process.exit(1)});
