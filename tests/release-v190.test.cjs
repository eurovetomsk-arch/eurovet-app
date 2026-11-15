const assert=require('node:assert/strict');
const fs=require('node:fs');
const cp=require('node:child_process');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
const base=cp.execFileSync('git',['show','625ca9a1:index.html'],{cwd:root,encoding:'utf8'});

function fn(src,name){
  const start=src.indexOf('function '+name+'(');
  assert.notEqual(start,-1,'missing '+name);
  const open=src.indexOf('{',start);let depth=0,quote='',escaped=false;
  for(let i=open;i<src.length;i++){
    const c=src[i];
    if(quote){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c===quote)quote='';continue}
    if(c==='"'||c==="'"||c==='`'){quote=c;continue}
    if(c==='{')depth++;else if(c==='}'&&--depth===0)return src.slice(start,i+1);
  }
  throw new Error('unterminated '+name);
}

function baseForm(values={}){
  return Object.assign({
    admins:{1:{left:'',came:''}},doctors:{11:{val:'60000'}},others:[],total:'60000',cash:'10000',cashless:'50000',
    ph_val:'',ph_cash:'',ph_cashless:'',open:'0',expenses:[],close:'10000',assistants:{},note:'',
    adv_cash:'',adv_cashless:'',adv_out:'',comp:'',cert:'',nc_comment:'',debt:'',debt_comment:'',repaid:'',
    diff_reason:'',corr_reason:''
  },values);
}

function run(src,form,date='2026-11-15',withUi=false){
  const app=(src.match(/appVer:'([^']+)'/)||[])[1];
  const tol=Number((src.match(/tol:(\d+(?:\.\d+)?),/)||[])[1]);
  const ctx={admins:[{id:1,name:'Администратор'}],doctors:[{id:11,name:'Врач',vm_id:111}],assistants:[],prev:null};
  const nodes={'#money-status':{className:'',innerHTML:''}};
  const prelude=`
    const CFG=${JSON.stringify({appVer:app,tol})};
    const S={view:'form',form:${JSON.stringify(form)},ctx:${JSON.stringify(ctx)},branch:'pereleta',date:${JSON.stringify(date)}};
    const nf=new Intl.NumberFormat('ru-RU',{minimumFractionDigits:0,maximumFractionDigits:2});
    const money=x=>nf.format(Math.round(x*100)/100)+' ₽';
    const r2=x=>Math.round(x*100)/100;
    function num(s){if(s==null)return null;const t=String(s).replace(/[\\s ]/g,'').replace(',','.');if(t==='')return null;if(!/^-?\\d+(\\.\\d{0,2})?$/.test(t))return NaN;return Number(t)}
    const N=s=>{const v=num(s);return(v==null||isNaN(v))?0:v};
    const isRet=a=>a==='Возврат клиника'||a==='Возврат аптека';
    const isNcRet=e=>isRet(e.article)&&e.method==='noncash';
    const ruDate=d=>d.split('-').reverse().join('.');
    const aNm=n=>String(n==null?'':n).replace(/\\s+[А-ЯЁ]\\.(?:\\s?[А-ЯЁ]\\.)?$/,'');
    const $=s=>nodes[s]||null;
  `;
  const sandbox={nodes,result:null,Intl,Math,Number,String,Object,Array,JSON,isNaN,isFinite};
  const code=prelude+'\n'+fn(src,'compute')+'\n'+fn(src,'buildData')+(withUi?'\n'+fn(src,'updateChecks'):'')+
    `\nconst calc=compute();${withUi?'updateChecks();':''}result={calc,data:buildData(calc),status:nodes['#money-status']};`;
  vm.runInNewContext(code,sandbox);
  return JSON.parse(JSON.stringify(sandbox.result));
}

assert.match(html,/appVer:'1\.90'/);
assert.match(sw,/const V='ev-shell-v90'/);
assert.match(html,/tol:10,/,'10-ruble tolerance changed');
assert.equal(fn(html,'compute'),fn(base,'compute'),'compute must be byte-identical to live 1.89');
assert.equal(fn(html,'buildData'),fn(base,'buildData'),'buildData must be byte-identical to live 1.89');
assert.equal(fn(html,'formFromReport'),fn(base,'formFromReport'),'saved report mapping changed');

const view=fn(html,'viewForm');
const clinicAt=view.indexOf('k-clinic'),advanceAt=view.indexOf('k-adv'),pharmacyAt=view.indexOf('k-pharm');
assert.ok(clinicAt>=0&&advanceAt>clinicAt&&pharmacyAt>advanceAt,'advance block must follow clinic money immediately');
for(const key of ['adv_cash','adv_cashless','adv_out'])assert.equal((view.match(new RegExp("moneyField\\('"+key+"'",'g'))||[]).length,1,key+' must render once');
for(const phrase of ['Новые авансы сегодня','Списано старого аванса','новый аванс укажите дважды'])assert.doesNotMatch(view,new RegExp(phrase,'i'));
for(const phrase of ['Положили на аванс сегодня наличными','Положили на аванс сегодня безналом','Сняли с аванса сегодня','в оплату счетов'])assert.match(view,new RegExp(phrase));
const wording2914=[
  'Клиент дал деньги на аванс — пишем два раза: в наличные или безнал и в «Положили на аванс».',
  'Клиент заплатил авансом — пишем один раз: в «Сняли с аванса». В наличные и безнал ничего.',
  'Когда аванс был внесён — не важно.'
];
for(const phrase of wording2914){
  assert.match(view,new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')),'2914 wording missing from advance block');
  assert.ok((html.split(phrase).length-1)>=5,'2914 wording must be in block, three hints and displayed help');
}

const scenarios=[
  ['без авансов',baseForm()],
  ['положили наличными',baseForm({cash:'20000',cashless:'50000',adv_cash:'10000'})],
  ['положили безналом',baseForm({cash:'10000',cashless:'60000',adv_cashless:'10000'})],
  ['сняли давний аванс при нуле денег',baseForm({doctors:{11:{val:'10000'}},total:'10000',cash:'0',cashless:'0',adv_out:'10000',close:'0'})],
  ['положили и сняли 20000',baseForm({cash:'20000',cashless:'40000',adv_cash:'20000',adv_out:'20000'})],
  ['положили 50000 и сняли 10000',baseForm({cash:'50000',cashless:'50000',adv_cash:'50000',adv_out:'10000',close:'50000'})]
];

const scenarioResults=[];
for(const [name,form] of scenarios){
  const before=run(base,form),after=run(html,form);
  assert.deepEqual(after.calc,before.calc,name+': checks changed');
  assert.equal(before.data.app,'1.89');
  assert.equal(after.data.app,'1.90');
  const beforeData={...before.data,app:'VERSION'},afterData={...after.data,app:'VERSION'};
  assert.deepEqual(afterData,beforeData,name+': submitted report changed beyond app version');
  scenarioResults.push({name,pay:after.calc.checks.find(x=>x.id==='pay'),payload_equal_except_app:true});
}

const oldDay=baseForm({cash:'20000',cashless:'50000',adv_cash:'10000'});
assert.deepEqual(run(html,oldDay,'2026-10-28').calc,run(base,oldDay,'2026-10-28').calc,'pre-29.10 calculation changed');

const paidFromAdvance=run(html,baseForm({total:'60000',cash:'50000',cashless:'0',adv_out:'10000',close:'50000'}),'2026-11-15',true).status.innerHTML;
assert.match(paidFromAdvance,/Работы сегодня на 60[\s ]000 ₽/);
assert.match(paidFromAdvance,/Денег пришло 50[\s ]000 ₽/);
assert.match(paidFromAdvance,/Из аванса оплачено 10[\s ]000 ₽/);
assert.match(paidFromAdvance,/Сходится\./);

const placedAdvance=run(html,baseForm({total:'10000',doctors:{11:{val:'10000'}},cash:'50000',cashless:'0',adv_cash:'40000',close:'50000'}),'2026-11-15',true).status.innerHTML;
assert.match(placedAdvance,/Работы сегодня на 10[\s ]000 ₽/);
assert.match(placedAdvance,/Денег пришло 50[\s ]000 ₽/);
assert.match(placedAdvance,/Из них 40[\s ]000 ₽ положили на аванс/);
assert.match(placedAdvance,/Сходится\./);

const mismatch=run(html,baseForm({total:'60000',cash:'58000',cashless:'0',close:'58000'}),'2026-11-15',true).status.innerHTML;
assert.match(mismatch,/Работы сегодня на 60[\s ]000 ₽/);
assert.match(mismatch,/Денег и аванса набралось 58[\s ]000 ₽/);
assert.match(mismatch,/Не хватает 2[\s ]000 ₽/);
assert.match(mismatch,/Проверьте суммы\./);

const helpExpr=html.slice(html.indexOf('/*HELP_START*/const HELP_HTML=')+'/*HELP_START*/const HELP_HTML='.length,html.indexOf(';\n/*HELP_END*/'));
const helpSandbox={result:null};
vm.runInNewContext('const HELP_HTML='+helpExpr+';'+fn(html,'currentHelpHtml')+';result=currentHelpHtml();',helpSandbox);
const help=helpSandbox.result;
for(const phrase of ['старый аванс','новый аванс','укажите дважды','Наличный аванс лежит в кассе'])assert.doesNotMatch(help,new RegExp(phrase,'i'));
assert.match(help,/разница до 10 рублей включительно/);

assert.match(html,/@media\(max-width:340px\)\{\.money-field\{grid-template-columns:1fr\}/,'320px fields must stack');
fs.writeFileSync(path.join(root,'artifacts','scenarios-v190.json'),JSON.stringify({schema:'evrovet.release_candidate_tests/v1',base:'625ca9a1',candidate:'1.90',scenarios:scenarioResults},null,2)+'\n');
console.log('release 1.90 advances: OK (6/6 scenarios)');
