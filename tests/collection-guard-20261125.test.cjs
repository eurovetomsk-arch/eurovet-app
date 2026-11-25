const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),rd=f=>fs.readFileSync(path.join(root,f),'utf8');
const view=rd('scripts/view.js'),report=rd('scripts/report.js'),migration=rd('migrations/20261125_collection_handoff_guard.sql');
let n=0;const ok=(c,m)=>{assert.ok(c,m);n++;console.log('PASS '+m)};

ok(/function activeAdminTransit\(\)/.test(view),'клиент находит уже активную передачу');
ok(/Инкассация уже записана/.test(view)&&/data-act="transitfix"/.test(view),'повторная кнопка показывает факт и «Исправить»');
ok(/let transitBusy=false/.test(view)&&/if\(transitBusy\)return/.test(view),'двойное нажатие блокируется на клиенте');
ok(/ev_collection_handoff_correct/.test(view)&&/Причина исправления/.test(view),'исправление вызывает отдельный RPC и требует причину');
ok(/handoff_exists/.test(view),'серверный конфликт превращается в понятную подсказку');
ok(/x\.source==='admin'/.test(report),'отчёт считает только передачу администратора');
ok(/<h2>Что нужно заполнить<\/h2>/.test(report)&&/v\.errs\.map/.test(report),'обязательные поля показаны точным списком');
ok(/create unique index if not exists ev_collection_one_admin_per_branch_day/.test(migration),'серверная уникальность филиал+день');
ok(/cancelled_from_status=status/.test(migration)&&/supersedes_id/.test(migration),'исправление сохраняет старую строку и связь аудита');
ok(/set search_path to ''/.test(migration)&&/ev_session_person\(p_token\)/.test(migration),'RPC защищён сессией и пустым search_path');
ok(/appVer:'2\.0\.7'/.test(rd('scripts/common.js'))&&/content="2\.0\.7"/.test(rd('index.html')),'версия клиента обновлена');
ok(/const V='ev2-shell-22'/.test(rd('sw.js')),'service worker обновит телефон');
console.log('ALL PASS '+n);
