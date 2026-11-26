const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const pw=require(process.env.EVROVET_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
const server=http.createServer((q,s)=>{const rel=decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, '')||'index.html',f=path.resolve(root,rel);if(!f.startsWith(root)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){s.writeHead(404).end();return}s.writeHead(200,{'content-type':mime[path.extname(f)]||'application/octet-stream','cache-control':'no-store'});s.end(fs.readFileSync(f))});
const data={ok:true,today:'2026-11-26',low_total:4,missing_today:[],items:[
  {id:1,name:'Вакцина А',grp:'Основные',grp_sort:1,species:'',note:'',min:5,sort:1},
  {id:2,name:'Вакцина Б',grp:'Основные',grp_sort:1,species:'',note:'',min:5,sort:2}
],branches:[
  {branch:'70let',title:'ЕВРОВЕТ 70 лет Октября, 5',stock_date:'2026-11-25',entered_at:'2026-11-25T15:00:00Z',by:'X',qty:{1:1,2:8},low:[1]},
  {branch:'marksa',title:'ЕВРОВЕТ Маркса, 45',stock_date:'2026-11-25',entered_at:'2026-11-25T15:00:00Z',by:'X',qty:{1:0,2:0},low:[1,2]},
  {branch:'pereleta',title:'ЕВРОВЕТ Перелёта, 8',stock_date:'2026-11-25',entered_at:'2026-11-25T15:00:00Z',by:'X',qty:{1:9,2:1},low:[2]}
]};
let origin;
(async()=>{
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));origin='http://127.0.0.1:'+server.address().port+'/';
  for(const engine of ['chromium','firefox','webkit']){
    const browser=await pw[engine].launch({headless:true});
    for(const viewport of [{width:390,height:844},{width:1366,height:900}]){
      const page=await browser.newPage({viewport});await page.goto(origin,{waitUntil:'domcontentloaded'});
      await page.evaluate(d=>{S.person={id:1,full_name:'Руководитель',roles:['head'],head:true};S.token='t';VX.data=d;VX.at=Date.now();VX.branch='70let';VX.mode='list';S.view='branch';render()},data);
      const tile=page.locator('[data-v="vac"]');await tile.first().waitFor();assert.doesNotMatch(await tile.first().innerText(),/мало\s*:/i,engine+': no home counter');
      await page.evaluate(()=>{S.view='vac';render()});
      assert.equal(await page.locator('.vac-lowcard').count(),0,engine+': no network summary');
      assert.equal(await page.locator('.chk.bad').count(),0,engine+': no global red card');
      assert.equal(await page.locator('.vac-row.low').count(),1,engine+': only selected branch current low row');
      assert.equal(await page.locator('.vac-row.low em').innerText(),'мало');
      assert.equal(await page.locator('#vacbr .chip').count(),3);
      assert.ok(await page.locator('[data-act="vachist"]').count(),engine+': history button remains');
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);assert.ok(overflow<=0,engine+': no horizontal overflow');
    }
    await browser.close();console.log(engine,'vaccine UI PASS');
  }
  server.close();
})().catch(e=>{console.error(e);server.close();process.exit(1)});
