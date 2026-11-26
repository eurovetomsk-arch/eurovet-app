const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),rd=f=>fs.readFileSync(path.join(root,f),'utf8');
const report=rd('scripts/report.js'),view=rd('scripts/view.js'),traps=rd('scripts/traps.js');
let n=0;const ok=(c,m)=>{assert.ok(c,m);n++;console.log('PASS '+m)};
function fn(src,name){
  const start=src.indexOf('function '+name+'(');assert.notEqual(start,-1,'missing '+name);
  const open=src.indexOf('{',start);let depth=0,q='',esc=false;
  for(let i=open;i<src.length;i++){const c=src[i];if(q){if(esc)esc=false;else if(c==='\\')esc=true;else if(c===q)q='';continue}
    if(c==='"'||c==="'"||c==='\x60'){q=c;continue}if(c==='{')depth++;else if(c==='}'&&--depth===0)return src.slice(start,i+1)}
  throw new Error('unterminated '+name);
}
const form={admins:{1:{left:'',came:''}},doctors:{},no_doctor:true,others:[],total:'0',cash:'0',cashless:'0',
  ph_val:'1000',ph_cash:'1000',ph_cashless:'0',open:'36832',expenses:[],close:'37832',assistants:{},no_assistant:true,
  note:'',adv_cash:'',adv_cashless:'',adv_out:'',comp:'',cert:'',nc_comment:'',debt:'',debt_comment:'',repaid:'',diff_reason:'',corr_reason:''};
const sandbox={result:null,Intl,Math,Number,String,Object,Array,JSON,isNaN,isFinite};
vm.runInNewContext(`
  const CFG={appVer:'2.0.10',tol:10},S={form:${JSON.stringify(form)},ctx:{admins:[{id:1,name:'Администратор'}],doctors:[],assistants:[],prev:null},branch:'70let',date:'2026-11-25'};
  const r2=x=>Math.round(x*100)/100,num=s=>{if(s==null)return null;const t=String(s).replace(/[\\s ]/g,'').replace(',','.');if(t==='')return null;return /^-?\\d+(\\.\\d{0,2})?$/.test(t)?Number(t):NaN},N=s=>{const v=num(s);return v==null||isNaN(v)?0:v};
  const money=x=>String(x)+' ₽',ruDate=x=>x,isRet=a=>a==='Возврат клиника'||a==='Возврат аптека',isNcRet=e=>isRet(e.article)&&e.method==='noncash',aNm=x=>String(x||'');
  ${fn(report,'compute')}
  ${fn(report,'buildData')}
  const calc=compute();result={check:calc.checks.find(x=>x.id==='docs'),data:buildData(calc)};
`,sandbox);
const out=JSON.parse(JSON.stringify(sandbox.result));
ok(out.check.ready&&out.check.ok,'нулевой день без врача проходит проверку врачебного вала');
ok(out.data.no_doctor===true&&out.data.doctors.length===0,'payload хранит no_doctor без фиктивного врача');
ok(/data-act="doctorflag"/.test(report)&&/День без врача/.test(report),'в форме есть явная кнопка «День без врача»');
ok(/data-act="doctornone"/.test(report)&&/Подтвердить: день без врача/.test(report),'отправка предлагает отдельное честное подтверждение');
ok(!/if\(S\.form&&!Object\.keys\(S\.form\.doctors\|\|\{\}\)\.length\)\{S\.form\.no_doctor=true/.test(report),'пустой список врачей не превращается автоматически в день без врача');
ok(/case'doctornone'/.test(view)&&/case'doctorflag'/.test(view),'обработчики сохраняют подтверждение');
ok(/g==='doctors'&&f\[g\]\[id\]\)f\.no_doctor=false/.test(view),'выбор реального врача снимает признак');
ok(/x\.slot==='doctor'&&S\.form\.no_doctor===true/.test(traps),'график не заставляет добавлять отсутствующего врача');
ok(/x\.slot==='assistant'&&S\.form\.no_assistant===true/.test(traps),'подтверждённое отсутствие ассистента не требует фиктивной строки');
const login=rd('scripts/login.js');
ok(!/rescue2511|Фактическая инкассация 15 500 ₽/.test(login),'разовый сценарий закрытого отчёта удалён из клиента');
ok(/appVer:'2\.0\.13'/.test(rd('scripts/common.js'))&&/content="2\.0\.13"/.test(rd('index.html')),'версия приложения обновлена');
ok(/scripts\/report\.js\?v=208/.test(rd('index.html'))&&/scripts\/login\.js\?v=210/.test(rd('index.html')),'изменённые файлы имеют принудительно новый URL');
ok(/const V='ev2-shell-28'/.test(rd('sw.js')),'телефон получит новый service worker');
ok(/clients\.matchAll\(\{type:'window',includeUncontrolled:true\}\)/.test(rd('sw.js'))&&/c\.navigate\(u\.href\)/.test(rd('sw.js')),'открытое приложение само перезагрузится после активации');
console.log('ALL PASS '+n);
