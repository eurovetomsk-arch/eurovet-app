'use strict';
/* Мой ЕВРОВЕТ 2.0: работа без интернета (обязательное требование Михаила, 18.11.2026).
   Как у 1.92: сеть первой (чтобы обновления приходили сразу), если сети нет или она молчит 4 секунды — берём сохранённую копию.
   Оболочка (страница, скрипты, стили, шрифты, иконки, xlsx) сохраняется при установке, остальное — по мере открытия.
   Тот же адрес sw.js, что у 1.92: клиенты со старым sw.js получают этот файл сами, без повторной установки приложения.
   Версия V меняется, только когда меняется список файлов; содержимое файлов обновляется само при каждом удачном запросе.
   Тест tests/offline-c21.test.cjs сверяет список с файлами проекта. Данные (Supabase) не кэшируются: другой домен, запросы POST. */
const V='ev2-shell-1';
const SHELL=[
 "./",
 "index.html",
 "config.js",
 "manifest.webmanifest",
 "styles/view.css",
 "ui2-common.css",
 "xlsx.core.min.js",
 "icon-v3.svg",
 "mark.svg",
 "icon-v3-180.png",
 "icon-v3-192.png",
 "icon-v3-512.png",
 "scripts/accruals.js",
 "scripts/birthday.js",
 "scripts/bootstrap.js",
 "scripts/common.js",
 "scripts/home.js",
 "scripts/login.js",
 "scripts/report.js",
 "scripts/schedule.js",
 "scripts/traps.js",
 "scripts/vaccines.js",
 "scripts/view.js",
 "fonts/montserrat-cyrillic-600-800.woff2",
 "fonts/montserrat-latin-600-800.woff2"
];
const OPTIONAL=[
 "icons/01-evening-report.png",
 "icons/02-cash-register.png",
 "icons/03-cash-acceptance.png",
 "icons/04-audit.png",
 "icons/05-vaccines.png",
 "icons/06-drug-request.png",
 "icons/07-who-is-where.png",
 "icons/08-my-schedule.png",
 "icons/09-my-accruals.png",
 "icons/10-my-appointments.png",
 "icons/11-vacation.png",
 "icons/12-employees.png",
 "icons/13-branches.png",
 "icons/14-revenue-director-only.png",
 "icons/15-access-permissions.png",
 "icons/16-settings.png",
 "icons/17-help.png",
 "icons/18-logout.png",
 "icons/19-safe.png",
 "icons/20-dose-calc.png",
 "icons/21-order.png",
 "icons/22-modules.png",
 "icons/23-greetings.png",
 "help/02_pin.jpg",
 "help/03_branch.jpg",
 "help/04_shift_doctors.jpg",
 "help/05_clinic_pharmacy.jpg",
 "help/06_advance_comp.jpg",
 "help/07_cash.jpg",
 "help/08_assistants_note.jpg",
 "help/09_check_green.jpg",
 "help/10_check_red.jpg",
 "help/11_hint.jpg",
 "help/12_done.jpg",
 "help/13_menu.jpg",
 "help/14_offline.jpg"
];
let badUntil=0;
self.addEventListener('install',e=>{
  e.waitUntil(caches.open(V).then(async c=>{
    await c.addAll(SHELL.map(u=>new Request(u,{cache:'reload'})));
    await Promise.all(OPTIONAL.map(u=>c.add(new Request(u,{cache:'reload'})).catch(()=>{})));
  }).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin)return;
  const net=fetch(e.request,{cache:'no-cache'}).then(r=>{if(r&&r.ok){const cp=r.clone();caches.open(V).then(c=>c.put(e.request,cp)).catch(()=>{})}return r});
  const saved=()=>caches.match(e.request,{ignoreSearch:true}).then(r=>r||(e.request.mode==='navigate'?caches.match('./',{ignoreSearch:true}):undefined));
  /* ждём сеть 4 с; если недавно сеть уже подвела (молчала или оборвалась) — только 0,8 с, иначе 12 файлов оболочки грузились бы по 4 с подряд */
  const wait=Date.now()<badUntil?800:4000;
  const slow=new Promise(res=>setTimeout(()=>{badUntil=Date.now()+60000;res(saved().then(r=>r||net))},wait));
  e.respondWith(Promise.race([net.catch(()=>{badUntil=Date.now()+60000;return saved()}),slow]).then(r=>r||net));
});
