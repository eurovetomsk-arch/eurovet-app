const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const pw=require(process.env.EVROVET_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
const shots=process.env.SHOTS?path.resolve(process.env.SHOTS):null;if(shots)fs.mkdirSync(shots,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
const server=http.createServer((q,s)=>{
  const rel=decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, '')||'index.html',f=path.resolve(root,rel);
  if(!f.startsWith(root)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){s.writeHead(404).end();return}
  s.writeHead(200,{'content-type':mime[path.extname(f)]||'application/octet-stream','cache-control':'no-store'});s.end(fs.readFileSync(f));
});
const sizes=[{name:'phone-320',width:320,height:700},{name:'phone-390',width:390,height:844},{name:'tablet',width:768,height:1024},{name:'desktop',width:1366,height:900}];
const engines=(process.env.ENGINES||'chromium,firefox,webkit').split(',');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const setInput=(page,selector,value)=>page.evaluate(({selector,value})=>{const el=document.querySelector(selector);if(!el)throw Error('missing '+selector);el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}))},{selector,value});
const blockBackend=context=>context.route('https://*.supabase.co/**',route=>route.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"rows":[],"items":[],"shifts":[]}'}));
async function enter(page){
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>{S.person={id:901,full_name:'Тестовый Врач',roles:['doctor'],doctor:true};S.token='test-token';S.view='branch';HOME_WHO.rows=[];HOME_WHO.key=homeWhoKey();render()});
  const tile=page.locator('[data-v="dose"]');await tile.waitFor();
  const t=Date.now();await tile.click();
  try{await page.locator('#dose-results .dose-row').first().waitFor({timeout:5000})}
  catch(e){const diag=await page.evaluate(()=>({view:S.view,state:typeof DOSE==='undefined'?null:DOSE.state,error:typeof DOSE==='undefined'?null:DOSE.error,text:document.getElementById('app')?.innerText}));throw Error('dose load: '+JSON.stringify(diag)+' | '+e.message)}
  return Date.now()-t;
}
async function backToSearch(page){
  await page.locator('.dose-search-back').first().dispatchEvent('click');
  await page.waitForFunction(()=>S.view==='dose'&&!DOSE.selected&&!!document.querySelector('#dose-q'));
}
let origin;
(async()=>{
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));origin='http://127.0.0.1:'+server.address().port+'/';
  const report=[];
  for(const engine of engines){
    const browser=await pw[engine].launch({headless:true});
    for(const size of sizes){
      const context=await browser.newContext({viewport:{width:size.width,height:size.height},locale:'ru-RU',serviceWorkers:'block'});
      await blockBackend(context);
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      const ms=await enter(page);
      assert.ok(ms<2000,engine+' '+size.name+': открытие '+ms+' мс');
      assert.equal(await page.locator('#dose-results .dose-row').count(),24,engine+' '+size.name+': первая страница полного справочника');
      const geom=await page.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,bar:!!document.querySelector('.ui2-bottom-nav'),h1:document.querySelector('.dose-head h1')?.textContent,items:DOSE.data.items.length,status:DOSE.status,chipMin:Math.min(...[...document.querySelectorAll('.dose-filter-scroll .chip')].map(x=>x.getBoundingClientRect().height))}));
      assert.ok(geom.sw<=geom.cw+1,engine+' '+size.name+': горизонтальный скролл '+geom.sw+'/'+geom.cw);
      assert.equal(geom.bar,true,engine+' '+size.name+': нижняя навигация');assert.equal(geom.h1,'Препараты и расчёт дозы');assert.equal(geom.items,107);assert.equal(geom.status,'all');assert.ok(geom.chipMin>=44,engine+' '+size.name+': чипы должны быть не ниже 44 px, получено '+geom.chipMin);
      assert.deepEqual(errors,[],engine+' '+size.name+': '+errors.join('|'));
      if(shots&&(size.name==='phone-320'||size.name==='desktop'))await page.screenshot({path:path.join(shots,engine+'-'+size.name+'.png'),fullPage:true});
      report.push({engine,viewport:size.name,open_ms:ms});await context.close();
    }
    /* Боевой тестовый сценарий — конкретный расчёт, крупный результат, locked-карточка и отзыв. */
    let context=await browser.newContext({viewport:{width:390,height:844},locale:'ru-RU',serviceWorkers:'block'});await blockBackend(context);let page=await context.newPage();await enter(page);
    await page.locator('#dose-q').fill('Аллервет');await page.locator('#dose-results .dose-row').first().dispatchEvent('click');
    await page.locator('[data-dose-act="species"][data-value="cat"]').dispatchEvent('click');
    await page.locator('#dose-weight').fill('2');
    await page.locator('#dose-dose').fill('2');
    await page.waitForFunction(()=>DOSE.weight==='2'&&DOSE.doseValue==='2');
    await page.locator('[data-dose-act="route"][data-value="SC"]').click();
    await wait(250);const resultRect=await page.evaluate(()=>{const x=document.querySelector('.dose-result.ready'),p=document.querySelector('.dose-result.pending'),r=x&&x.getBoundingClientRect();return{ready:!!x,pending:p&&p.innerText,weight:DOSE.weight,dose:DOSE.doseValue,route:DOSE.route,selected:DOSE.selected,resultIds:document.querySelectorAll('#dose-calc-result').length,appTail:document.getElementById('app')?.innerHTML.slice(-500),top:r&&r.top,bottom:r&&r.bottom,y:scrollY,h:innerHeight}});assert.equal(resultRect.ready,true,'готовый результат не появился: '+JSON.stringify(resultRect));assert.ok(resultRect.top>=0&&resultRect.top<resultRect.h,'телефон должен прокрутить готовый результат в видимую область: '+JSON.stringify(resultRect));assert.ok(resultRect.y>0,'расчёт ниже первого экрана должен вызвать прокрутку');
    assert.match(await page.locator('.dose-result.ready').innerText(),/0,4 мл/);
    assert.match(await page.locator('.dose-result.ready').innerText(),/Подкожно/);
    assert.match(await page.locator('.dose-result.ready').innerText(),/2–3 раза в сутки/);
    assert.equal(await page.locator('.dose-details').evaluate(x=>x.open),false,'подробности закрыты по умолчанию');
    if(shots)await page.screenshot({path:path.join(shots,engine+'-detail.png'),fullPage:true});
    assert.equal(await page.locator('.dose-search-back').count(),2,'возврат к результатам доступен сверху и снизу');
    const back=page.locator('.dose-search-back').first();assert.match(await back.innerText(),/К результатам поиска/);assert.ok((await back.boundingBox()).height>=60,'кнопка возврата должна быть крупной');
    await backToSearch(page);assert.equal(await page.locator('#dose-q').inputValue(),'Аллервет','возврат сохраняет поиск');
    await page.locator('#dose-q').fill('Пиро-Стоп');await page.locator('#dose-results .dose-row').first().dispatchEvent('click');await page.waitForFunction(()=>!!DOSE.selected&&DOSE.patientCarried===true);
    assert.match(await page.locator('.dose-soft-warning').innerText(),/Вид и вес.*перенесены из предыдущей карточки/,'перенесённые вид и вес явно помечены');await page.evaluate(()=>{DOSE.species='dog';DOSE.doseValue='';DOSE.route='';render()});await page.locator('#dose-weight').fill('10');await page.locator('[data-dose-act="route"][data-value="SC"]').dispatchEvent('click');
    assert.match(await page.locator('.dose-result.ready').innerText(),/0,5 мл/);assert.match(await page.locator('.dose-result.ready').innerText(),/Не более 2 мл/);
    await page.locator('#dose-weight').fill('50');await page.locator('#dose-weight').dispatchEvent('change');assert.match(await page.locator('.dose-result.ready').innerText(),/2,5 мл/);assert.match(await page.locator('.dose-result.ready').innerText(),/разделите минимум на 2 места/);
    await page.locator('[data-dose-act="species"][data-value="cat"]').dispatchEvent('click');assert.match(await page.locator('.dose-calc-locked').innerText(),/Подготовлен расчёт: только собака/);assert.match(await page.locator('.dose-badge.blocked').innerText(),/Для этого вида нет/);
    const reset=await page.evaluate(()=>{doseResetPatient();render();return{weight:DOSE.weight,species:DOSE.species,route:DOSE.route}});assert.deepEqual(reset,{weight:'',species:'dog',route:''},'новый пациент сбрасывает вес, вид и путь');assert.match(await page.locator('[data-dose-act="new-patient"]').innerText(),/Новый пациент/);
    await backToSearch(page);await page.locator('#dose-q').fill('metoclopramide');assert.equal(await page.locator('#dose-results .dose-row').count(),1,'латинский синоним находит Метоклопрамид');await page.locator('#dose-results .dose-row').first().dispatchEvent('click');
    await page.locator('#dose-weight').fill('10');await page.locator('#dose-dose').fill('5,5');await page.locator('[data-dose-act="route"][data-value="IM"]').dispatchEvent('click');assert.match(await page.locator('.dose-result.pending').innerText(),/от 0,1 до 0,5/,'5,5 мг/кг выше диапазона отклоняется');
    await setInput(page,'#dose-dose','50,0');assert.match(await page.locator('.dose-result.pending').innerText(),/от 0,1 до 0,5/,'50,0 мг/кг выше диапазона отклоняется');
    await setInput(page,'#dose-dose','0,05');assert.match(await page.locator('.dose-result.pending').innerText(),/от 0,1 до 0,5/,'0,05 мг/кг ниже диапазона отклоняется');
    await setInput(page,'#dose-dose','-5');assert.equal(await page.locator('#dose-dose').inputValue(),'-5','ошибочный знак не превращается молча в положительное число');assert.match(await page.locator('.dose-result.pending').innerText(),/разрешённом диапазоне/);
    await setInput(page,'#dose-dose','0,5');assert.match(await page.locator('.dose-result.ready').innerText(),/1 мл/,'граничная дробная доза с запятой принимается');
    await setInput(page,'#dose-dose','0,50000000001');assert.equal(await page.locator('#dose-dose').inputValue(),'0,50000000001','длинная доза не должна молча обрезаться');assert.match(await page.locator('.dose-result.pending').innerText(),/разрешённом диапазоне/,'чрезмерно длинная доза отклоняется');
    await setInput(page,'#dose-weight','1e2');assert.equal(await page.locator('#dose-weight').inputValue(),'1e2','экспонента не переписывается молча');assert.match(await page.locator('.dose-result.pending').innerText(),/массу пациента/);await setInput(page,'#dose-weight','10');
    await page.evaluate(()=>history.back());await page.waitForFunction(()=>!!document.querySelector('#dose-q'));assert.equal(await page.locator('#dose-q').inputValue(),'metoclopramide','системное «Назад» возвращает к тому же поиску');
    const aliases=await page.evaluate(()=>['алервет','алервет 1%','аллерветт','пиростоп','pirostop','лидокоин','metoclopramide','gabapentin','allervet','tramadol','ondansetron'].map(q=>({q,n:DOSE.data.items.filter(x=>doseMatch(x,q)).length})));assert.ok(aliases.every(x=>x.n>0),'частые опечатки, дефисы и латинские названия находят препарат: '+JSON.stringify(aliases));
    await context.close();context=await browser.newContext({viewport:{width:390,height:844},locale:'ru-RU',serviceWorkers:'block'});await blockBackend(context);page=await context.newPage();await enter(page);
    await setInput(page,'#dose-q','пропофол');assert.ok(await page.locator('#dose-results .dose-row').count()>0,'позиция без быстрого расчёта сразу видна в полном справочнике');const afterAll=await page.evaluate(()=>({view:S.view,selected:DOSE.selected,hasSearch:!!document.querySelector('#dose-q'),status:DOSE.status}));assert.ok(afterAll.view==='dose'&&!afterAll.selected&&afterAll.hasSearch&&afterAll.status==='all','полный справочник остаётся активным: '+JSON.stringify(afterAll));await page.locator('#dose-results .dose-row').first().dispatchEvent('click');assert.match(await page.locator('.dose-calc-locked').innerText(),/Правило быстрого расчёта пока не подготовлено/);await backToSearch(page);
    await setInput(page,'#dose-q','Прозерин');await page.locator('#dose-results .dose-row').first().dispatchEvent('click');assert.match(await page.locator('.dose-immediate-warning').innerText(),/Критически важно/);assert.match(await page.locator('.dose-immediate-warning').innerText(),/атропина\/гликопирролата/);const warningStyle=await page.locator('.dose-immediate-warning').evaluate(x=>({bg:getComputedStyle(x).backgroundColor,border:getComputedStyle(x).borderTopColor}));assert.equal(warningStyle.bg,'rgb(255, 240, 237)','high-risk предупреждение должно иметь красный фон');assert.equal(warningStyle.border,'rgb(196, 58, 43)','high-risk предупреждение должно иметь красную рамку');
    await backToSearch(page);await setInput(page,'#dose-q','Анестофол 5%');await page.locator('#dose-results .dose-row').first().dispatchEvent('click');
    assert.match(await page.locator('.dose-badge.stop').innerText(),/Стоп/);assert.match(await page.locator('.dose-calc-locked').innerText(),/расчёт недоступен/i);
    await page.locator('.dose-review summary').dispatchEvent('click');const feedback=page.locator('[data-dose-act="feedback"][data-value="fix"]');await feedback.dispatchEvent('click');await page.locator('#dose-fb-note').waitFor();await page.locator('#dose-fb-note').fill('Проверить формулировку');await page.locator('[data-dose-act="feedback-save"]').dispatchEvent('click');
    assert.match(await page.locator('.dose-feedback-saved').textContent(),/нужно исправить/);
    console.log(engine,'functional PASS');await context.close();await browser.close();
  }
  console.log('dose ui PASS',JSON.stringify(report));server.close();
})().catch(e=>{console.error(e);server.close();process.exit(1)});
