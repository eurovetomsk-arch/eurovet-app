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
// 3. если список не загрузился (null) — в остаток входят все, сумма не занижается
const f=safeTotals(ROWS,null,{balance:20000}),all=oldFormula(ROWS,[],{balance:20000});
ok(f.skipRows.length===0&&f.need===all.need&&f.need>=t.need,'список не загрузился → никто не исключён, «остаток к выплате» не меньше');
ok(/S\.cashExcl===null\?'<p class="hint">/.test(acc),'при незагруженном списке показывается подсказка');

// 4. подпись ассистента берётся из поля сервера atype
const r0=sch.match(/const SCH_R=\{[^}]*\};/)[0],at=atLine+';',rl=(sch.match(/const schRole=r=>\{[^\n]*\};/)||[''])[0];
const schRole=new Function(r0+at+rl+';return schRole')();
ok(schRole({slot:'assistant',atype:'clinical',name:'Пример'})==='Ассистент клинический','atype clinical → «Ассистент клинический»');
ok(schRole({slot:'assistant',atype:'tech'})==='Ассистент технический','atype tech → «Ассистент технический»');
ok(schRole({slot:'assistant'})==='Ассистент'&&schRole({slot:'assistant',atype:null})==='Ассистент','нет поля (старый сервер) → просто «Ассистент», без ошибки');
ok(schRole({slot:'doctor',atype:'tech'})==='Врач','у врача тип ассистента не дописывается');
console.log('ALL PASS '+n);
