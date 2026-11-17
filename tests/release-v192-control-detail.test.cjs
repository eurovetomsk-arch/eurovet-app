const fs=require('fs');
const path=require('path');
const assert=require('assert');
const vm=require('vm');

const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const sw=fs.readFileSync(path.join(__dirname,'..','sw.js'),'utf8');

assert.match(html,/\['cashbox_complete','не получено закрытие кассы Vetmanager'\]/);
assert.match(html,/const vmDetail=f\.code==='vm_partial'\?vmCoverageText\(vmCoverageForFlag\(f\)\):''/);
assert.match(html,/const details=incompleteRows\.map/);
assert.match(html,/Нужно разобрать:/);
assert.doesNotMatch(html,/Это требует разбора\./);
assert.match(sw,/ev-shell-v92c/);

const start=html.indexOf('const VM_COVERAGE_GAPS=');
const end=html.indexOf('function flagLine',start);
assert.ok(start>=0&&end>start);
const sandbox={S:{ctlCoverage:[]}};
vm.runInNewContext(html.slice(start,end),sandbox);
assert.equal(
  sandbox.vmCoverageText({coverage:{
    invoices_complete:true,
    revenue_summary_complete:true,
    payments_complete:true,
    cashbox_complete:false
  }}),
  'Нужно разобрать: не получено закрытие кассы Vetmanager.'
);
assert.equal(
  sandbox.vmCoverageText({coverage:{
    invoices_complete:false,
    revenue_summary_complete:false,
    payments_complete:false,
    cashbox_complete:false
  }}),
  'Нужно разобрать: не подтверждены счета, не подтверждена выручка, не подтверждены наличные и безналичные платежи, не получено закрытие кассы Vetmanager.'
);
assert.equal(sandbox.vmCoverageText(undefined),'причина не передана');
assert.doesNotMatch(html,/\['doctor_lines_complete'/,'SHT-13: doctors by line are not part of completeness');

for(const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new Function(m[1]);

console.log('release-v192-control-detail: PASS');
