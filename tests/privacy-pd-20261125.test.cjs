// Приватность 25.11.2026 (Б2): номера людей «не входит в наличные сейфа» и фамилии ассистентов убраны из кода.
// Проверяем, что расчёт сейфа даёт те же цифры, что и прежняя формула с тем же списком, только теперь список приходит с сервера.
// Запуск: node tests/privacy-pd-20261125.test.cjs   (браузер не нужен; все люди и номера вымышленные)
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),rd=f=>fs.readFileSync(path.join(root,f),'utf8');
const acc=rd('scripts/accruals.js'),sch=rd('scripts/schedule.js'),cfg=rd('config.js');
let n=0;const ok=(c,m)=>{assert.ok(c,m);n++;console.log('PASS '+m)};

// 1. в коде больше нет списка номеров и фамилий
ok(!/cashExcludePersonIds/.test(cfg+acc),'config.js/accruals.js: cashExcludePersonIds удалён');
ok(/rpc\('ev_cash_exclusions'/.test(acc),'сейф берёт список с сервера (ev_cash_exclusions)');
const atLine=(sch.match(/const SCH_AT=\{[^}]*\}/)||[''])[0];
ok(atLine&&!/[А-ЯЁ]/.test(atLine.replace(/'клинический'|'технический'/g,'')),'schedule.js: в SCH_AT только типы, без фамилий');
ok(!fs.existsSync(path.join(root,'tests/db-shadow-drill.sh')),'tests/db-shadow-drill.sh убран из репозитория');

// 2. новая функция safeTotals == прежняя формула (для того же списка)
const src=(acc.match(/function safeTotals\(rows,excl,c\)\{.*\}\n/)||[''])[0];
ok(src,'safeTotals найдена в accruals.js');
const safeTotals=new Function(src+';return safeTotals')();
function oldFormula(rows,CFG_IDS,c){ // копия строки из accruals.js до 25.11 (список был в config.js)
  const N=v=>Number(v||0);
  const CASH_SKIP=(CFG_IDS||[]).map(Number),skipRows=rows.filter(x=>CASH_SKIP.includes(Number(x.id))),skip=skipRows.reduce((q,x)=>q+Math.max(0,N(x.to_pay)),0),need=rows.filter(x=>!CASH_SKIP.includes(Number(x.id))).reduce((q,x)=>q+Math.max(0,N(x.to_pay)),0),bal=c?(c.balance!=null?N(c.balance):N(c.on_hand)):null,short=bal==null?null:need-bal;
  return{skipRows,skip,need,bal,short};
}
const EX=[901,906,917]; // вымышленные номера
const ROWS=[{id:901,name:'Пример 1',to_pay:12000.5},{id:902,name:'Пример 2',to_pay:'8400'},{id:906,name:'Пример 3',to_pay:-300},
  {id:'917',name:'Пример 4',to_pay:5000},{id:903,name:'Пример 5',to_pay:null},{id:904,name:'Пример 6',to_pay:'1999.99'},{id:905,name:'Пример 7',to_pay:-50}];
const CASES=[[ROWS,{balance:20000,on_hand:30000}],[ROWS,{balance:null,on_hand:9000}],[ROWS,{on_hand:'15000.25'}],[ROWS,null],[[],{balance:0}],[ROWS.slice(1,2),{balance:-500}]];
for(const [rows,c] of CASES){
  const a=oldFormula(rows,EX,c),b=safeTotals(rows,EX.map(String),c);
  assert.deepEqual({skip:b.skip,need:b.need,bal:b.bal,short:b.short,ids:b.skipRows.map(x=>x.id)},{skip:a.skip,need:a.need,bal:a.bal,short:a.short,ids:a.skipRows.map(x=>x.id)});
}
ok(true,'цифры сейфа (остаток к выплате, не входит, остаток в сейфе, нехватка) совпадают со старой формулой: '+CASES.length+' наборов');
const t=safeTotals(ROWS,EX,{balance:20000});
ok(Math.abs(t.need-(8400+1999.99))<1e-9&&Math.abs(t.skip-(12000.5+5000))<1e-9&&Math.abs(t.short-(8400+1999.99-20000))<1e-9,'контрольные суммы на вымышленных данных');
// 3. если список не загрузился (null) — остаток к выплате и «хватает/не хватает» НЕ считаются (ТЗ-2, п.3)
const f=safeTotals(ROWS,null,{balance:20000});
ok(f.failed==='load'&&f.need===null&&f.short===null&&f.skipRows.length===0&&f.bal===20000,'список не загрузился → остаток к выплате и нехватка не считаются, остаток в сейфе виден');
{const e=safeTotals(ROWS,[],{balance:1});ok(e.failed==='empty'&&e.need===null&&e.short===null,'пустой список с сервера = ошибка: остаток и нехватка не считаются');}
// 3a. экран сейфа целиком (safeBody) с подставными зависимостями
function grab(name){const i=acc.indexOf((name.startsWith('async ')?'':'function ')+name+'(');assert.ok(i>=0,name);let d=0,j=acc.indexOf('{',i);for(let k=j;k<acc.length;k++){if(acc[k]==='{')d++;else if(acc[k]==='}'){d--;if(!d)return acc.slice(i,k+1)}}}
const env='const money=v=>String(Math.round(Number(v)*100)/100)+" ₽",esc=v=>String(v),ruDate=v=>String(v),omskToday=()=>"2026-11-25",uid=()=>"u1";let painted=0;const paint=()=>{painted++};';
const mk=(S,rpc)=>new Function('S','rpc',env+'const LS={del(){}},toast=()=>{};'+src+grab('safeBody')+grab('async function retrySafeExcl')+grab('async function loadSafe')+';return{safeBody,retrySafeExcl,loadSafe,get painted(){return painted}}')(S,rpc);
const PAY={rows:ROWS,total:{accrued:100,paid:50}},CASH={ok:true,balance:20000,on_hand:30000,taken:10000,from:'2026-11-01'};
const S1={pay:PAY,cash:CASH,cashExcl:null,view:'pay',paySafe:true};
let h=mk(S1,null).safeBody();
ok(h.includes('Список исключений не загрузился — остаток не показан')&&h.includes('data-act="safeexclretry"')&&h.includes('>Повторить<'),'экран: сообщение «Список исключений не загрузился — остаток не показан» и кнопка «Повторить»');
ok(!h.includes('Кэша хватает')&&!h.includes('Не хватает кэша')&&!h.includes(String(8400+1999.99+12000.5+5000)),'экран: ни «хватает/не хватает», ни остатка по всем людям');
const S2={pay:PAY,cash:CASH,cashExcl:EX,view:'pay',paySafe:true};h=mk(S2,null).safeBody();
{const S5={pay:PAY,cash:CASH,cashExcl:[],view:'pay',paySafe:true};const h5=mk(S5,null).safeBody();
ok(h5.includes('Список исключений пуст — остаток не показан')&&h5.includes('data-act="safeexclretry"')&&/Остаток к выплате<\/span><b>—/.test(h5)&&!h5.includes('Кэша хватает')&&!h5.includes('Не хватает кэша'),'экран: пустой список → «—», «Список исключений пуст — остаток не показан», «Повторить», без «хватает/не хватает»');}
ok(!h.includes('не загрузился')&&/Остаток к выплате<\/span><b>10399\.99 ₽/.test(h)&&h.includes('Не хватает кэша')===false&&h.includes('Кэша хватает'),'экран: список есть → остаток 10399.99 и вердикт как раньше');
(async()=>{
  const calls=[];const S3={pay:PAY,cash:CASH,cashExcl:null,view:'pay',paySafe:true,token:'t'};
  const m=mk(S3,async(n,b)=>{calls.push(n);return{ok:true,person_ids:EX}});await m.retrySafeExcl();
  ok(calls.join()==='ev_cash_exclusions'&&JSON.stringify(S3.cashExcl)===JSON.stringify(EX)&&m.painted===2,'«Повторить» запрашивает только ev_cash_exclusions и перерисовывает');
  const S4={pay:PAY,cash:CASH,cashExcl:null,view:'pay',paySafe:true,token:'t'};await mk(S4,async()=>{throw{net:true}}).retrySafeExcl();
  ok(S4.cashExcl===null,'«Повторить» без связи → снова «не загрузился», остаток не показан');
  const S6={pay:PAY,cash:CASH,cashExcl:EX.slice(),view:'pay',paySafe:true,token:'t'};
  await mk(S6,async(n)=>{if(n==='ev_cash_exclusions')throw{net:true};return{ok:true}}).loadSafe();
  ok(S6.cashExcl===null,'загрузка сейфа: список не пришёл (нет связи) → прежний список НЕ используется, «не загрузился»');
  const S7={pay:PAY,cash:CASH,cashExcl:EX.slice(),view:'pay',paySafe:true,token:'t'};
  await mk(S7,async()=>{throw{net:true}}).loadSafe();
  ok(S7.cashExcl===null,'загрузка сейфа: нет связи совсем → прежний список НЕ используется');
  const S8={pay:PAY,cash:CASH,cashExcl:EX.slice(),view:'pay',paySafe:true,token:'t'};
  await mk(S8,async(n)=>n==='ev_cash_exclusions'?{ok:false,error:'forbidden'}:{ok:true}).loadSafe();
  ok(S8.cashExcl===null,'загрузка сейфа: сервер отказал → прежний список НЕ используется');
  ok(/case'safeexclretry':retrySafeExcl\(\)/.test(rd('scripts/view.js')),'кнопка подключена в обработчике data-act');
  ok(/const V='ev2-shell-15'/.test(rd('sw.js')),'sw.js: кэш ev2-shell-15');
  rest();
})().catch(e=>{console.error(e);process.exit(1)});
function rest(){
// 4. подпись ассистента берётся из поля сервера atype
const r0=sch.match(/const SCH_R=\{[^}]*\};/)[0],at=atLine+';',rl=(sch.match(/const schRole=r=>\{[^\n]*\};/)||[''])[0];
const schRole=new Function(r0+at+rl+';return schRole')();
ok(schRole({slot:'assistant',atype:'clinical',name:'Пример'})==='Ассистент клинический','atype clinical → «Ассистент клинический»');
ok(schRole({slot:'assistant',atype:'tech'})==='Ассистент технический','atype tech → «Ассистент технический»');
ok(schRole({slot:'assistant'})==='Ассистент'&&schRole({slot:'assistant',atype:null})==='Ассистент','нет поля (старый сервер) → просто «Ассистент», без ошибки');
ok(schRole({slot:'doctor',atype:'tech'})==='Врач','у врача тип ассистента не дописывается');
console.log('ALL PASS '+n);
}
