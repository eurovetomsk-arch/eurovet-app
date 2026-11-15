Исходный текстОцените этот переводВаш отзыв поможет нам улучшить Google Переводчикconst assert=require('node:assert/strict');
const fs=require('node:fs');
const cp=require('node:child_process');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
const sql=fs.readFileSync(path.join(root,'migrations/20261115_report_tolerance_10_rubles.sql'),'utf8');
const base=cp.execFileSync('git',['show','625ca9a1:index.html'],{cwd:root,encoding:'utf8'});

function fn(src,name){
  const start=src.indexOf('function '+name+'(');
  assert.notEqual(start,-1,'missing '+name);
  const open=src.indexOf('{',start);let depth=0,quote='',esc=false;
  for(let i=open;i<src.length;i++){
    const c=src[i];
    if(quote){if(esc)esc=false;else if(c==='\\\\')esc=true;else if(c===quote)quote='';continue}
    if(c==='"'||c==="'"||c==='`'){quote=c;continue}
    if(c==='{')depth++;else if(c==='}'&&--depth===0)return src.slice(start,i+1);
  }
  throw new Error('unterminated '+name);
}

assert.match(html,/tol:10,\s+\/\/ допустимая погрешность включительно, ₽/);
const appVersion=Number((html.match(/appVer:'([^']+)'/)||[])[1]);
const shellVersion=Number((sw.match(/const V='ev-shell-v(\d+)'/)||[])[1]);
assert.ok(appVersion>=1.89,'app version regressed below 1.89');
assert.ok(shellVersion>=89,'service-worker cache regressed below v89');
assert.match(html,/function handoverGate\(\)/,'cash-first gate retained');
assert.match(html,/h\.current\.status==='discrepancy'&&Math\.abs\(Number\(h\.current\.diff\)\)>CFG\.tol/,'saved small cash difference must render as matched');
assert.doesNotMatch(html,/ev_login_number|employee-number/,'stage 1 login must not ship');
assert.equal(fn(html,'compute'),fn(base,'compute'),'financial formulas changed');
assert.equal(fn(html,'buildData'),fn(base,'buildData'),'report payload changed');

const tolerance=Number(html.match(/tol:(\d+(?:\.\d+)?),/)[1]);
for(const [difference,ok] of [[-10,true],[10,true],[-10.01,false],[10.01,false]]){
  assert.equal(Math.abs(difference)<=tolerance,ok,'boundary '+difference);
}

assert.match(sql,/abs\(v_diff\) <= 10\.00/);
assert.match(sql,/set local ev\.allow_ddl = 'on'/);
assert.doesNotMatch(sql,/update public\.ev_cash_handover_events/,'cash handover ledger is append-only');
console.log('release 1.89 tolerance: OK');
