const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),rd=f=>fs.readFileSync(path.join(root,f),'utf8');
const vaccines=rd('scripts/vaccines.js'),home=rd('scripts/home.js'),html=rd('index.html'),common=rd('scripts/common.js'),sw=rd('sw.js');

assert.doesNotMatch(vaccines,/function vacLowList\(/,'network-wide low list must not be built in the client');
assert.doesNotMatch(vaccines,/function vacLowCard\(/,'network-wide red summary must be removed');
assert.doesNotMatch(vaccines,/function vacTileBadge\(/,'home low-count badge must be removed');
assert.doesNotMatch(home,/vacTileBadge\(/,'home tile must not render the cumulative low-count badge');
assert.match(vaccines,/const low=new Set\(\(b\.low\|\|\[\]\)\.map\(Number\)\)/,'selected branch keeps its current low set');
assert.match(vaccines,/isLow\?'?<em>мало<\/em>/,'individual current low rows stay visible');
assert.match(vaccines,/data-act="vachist"/,'daily history remains a separate explicit screen');
assert.match(vaccines,/Остатки вакцин не внесены/,'missing-today reminder remains intact');
assert.match(html,/content="2\.0\.15"/);
assert.match(common,/appVer:'2\.0\.15'/);
assert.match(html,/scripts\/home\.js\?v=215/);
assert.match(html,/scripts\/vaccines\.js\?v=215/);
assert.match(sw,/const V='ev2-shell-30'/);

console.log('vaccine current-low UI v2.0.15 PASS');
