const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'..'),file=path.join(root,'data/dose-rules-v1.json');
const raw=fs.readFileSync(file),data=JSON.parse(raw),catalog=JSON.parse(fs.readFileSync(path.join(root,'data/dose-v1.json')));

assert.equal(data.schema,'evrovet.dose_rules/v1');
assert.equal(data.test_only,false);
assert.equal(data.clinical_status,'WORKING_RELEASE_FOR_PHYSICIAN_FEEDBACK');
assert.equal(data.rules.length,14);
assert.equal(new Set(data.rules.map(x=>x.item_id)).size,8);
assert.equal(new Set(data.rules.map(x=>x.id)).size,14);
assert.equal(data.calculation_policy.select_dose_by_physician,true);
assert.equal(data.calculation_policy.no_default_for_ranges,true);
assert.equal(data.calculation_policy.no_device_rounding,true);
assert.equal(data.calculation_policy.one_administration_only,true);
assert.deepEqual(data.source_hashes,{
  'medical-41-78.json':'3b4a07bfe5f9056940951a7f3dedd43c6d9c029e7a6cd1e097ff9a3dc95a217a',
  'veterinary-1-29.json':'7e82e05ce1a5534397c4f2f4fcc8f041f39f6c74f3980a7b16a8e0e598c9b97b'
});
const ids=new Set(catalog.items.map(x=>x.id));
for(const r of data.rules){
  assert.ok(ids.has(r.item_id),r.id+': item missing from catalog');
  assert.ok(['dog','cat'].includes(r.species),r.id+': species');
  assert.ok(Number(r.concentration_mg_ml)>0,r.id+': concentration');
  assert.ok(Number(r.dose_min_mg_kg)>0,r.id+': min dose');
  assert.ok(Number(r.dose_max_mg_kg)>=Number(r.dose_min_mg_kg),r.id+': range');
  assert.ok(r.routes.length&&r.frequency&&r.indication,r.id+': incomplete quick card');
  assert.equal('default_dose_mg_kg' in r,false,r.id+': range must not have default dose');
}
assert.ok(raw.length<16000,'rules must stay lightweight');
assert.ok(zlib.gzipSync(raw).length<4000,'rules gzip must stay lightweight');
assert.ok(!fs.readFileSync(path.join(root,'sw.js'),'utf8').includes('data/dose-rules-v1.json'),'rules must remain lazy-loaded');

function dec(s){const p=String(s).split('.'),den=10n**BigInt((p[1]||'').length);return{n:BigInt(p[0]+(p[1]||'')),d:den}}
function mul(a,b){return{n:a.n*b.n,d:a.d*b.d}}
function div(a,b){return{n:a.n*b.d,d:a.d*b.n}}
function exact(item,species,weight,dose){
  const r=data.rules.find(x=>x.item_id===item&&x.species===species);assert.ok(r,item+'/'+species);
  const mg=mul(dec(weight),dec(dose)),ml=div(mg,dec(r.concentration_mg_ml));return{mg,ml};
}
function eq(frac,value){const want=dec(value);assert.equal(frac.n*want.d,want.n*frac.d)}
let x=exact('VET-001','cat','2','2');eq(x.mg,'4');eq(x.ml,'0.4');
x=exact('VET-023','dog','10','6');eq(x.mg,'60');eq(x.ml,'0.5');
x=exact('MED-051','dog','10','0.1');eq(x.mg,'1');eq(x.ml,'0.5');
x=exact('VET-026','cat','4','7.5');eq(x.mg,'30');eq(x.ml,'0.6');

console.log('dose rules v214 PASS',JSON.stringify({rules:data.rules.length,items:new Set(data.rules.map(x=>x.item_id)).size,bytes:raw.length,gzip:zlib.gzipSync(raw).length}));
