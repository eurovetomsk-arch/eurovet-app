const V='ev-shell-v26';
const SHELL=['./','index.html','manifest.webmanifest','icon-v2.svg','mark.svg','icon-v2-180.png','icon-v2-192.png','icon-v2-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin)return;
  // сеть первой (чтобы обновления приходили); если сети нет или она молчит 4 секунды — берём сохранённую копию
  const net=fetch(e.request,{cache:'no-cache'}).then(r=>{if(r&&r.ok){const cp=r.clone();caches.open(V).then(c=>c.put(e.request,cp)).catch(()=>{})}return r});
  const saved=()=>caches.match(e.request,{ignoreSearch:true}).then(r=>r||caches.match('./',{ignoreSearch:true}));
  const slow=new Promise(res=>setTimeout(()=>res(saved().then(r=>r||net)),4000));
  e.respondWith(Promise.race([net.catch(()=>saved()),slow]).then(r=>r||net));
});
