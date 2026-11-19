'use strict';
/* ====== Запуск ====== */
(async()=>{
  idleCheck();
  if(!S.token)applySavedNumber(); /* c28: запомненный номер — сразу экран PIN */
  if(S.token&&S.person)setTimeout(birthdayCheck,600);
  if(S.token&&S.person)S.view=homeView();
  if(S.view==='cc')showCC();else if(S.view==='work')showWork();else render();
  /* c21: работа без интернета (слово Михаила 18.11): service worker оболочки, как у 1.92 (sw.js, сеть первой, 4 с, копия). Раньше 2.0 его снимала. */
  /* под автоматизацией (navigator.webdriver: тесты Playwright и сквозные прогоны) sw не ставится, иначе WebKit перестаёт отдавать подменённые ответы route; тест офлайна открывает адрес с ?sw=1 */
  if('serviceWorker' in navigator&&(!navigator.webdriver||/[?&]sw=1\b/.test(location.search)))navigator.serviceWorker.register('sw.js').catch(()=>{});
  if(S.view==='login'){await loadLoginList();render()}
  else if(S.queue.length)flush();
  setTimeout(()=>checkUpdate(true),2500);
})();
