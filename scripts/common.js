'use strict';
/* ====== Настройки (публичные по замыслу: доступ к данным только через функции с PIN) ====== */
const CFG={
  url:window.STAGE1.url,
  key:window.STAGE1?.key||'',
  tol:10,                // допустимая погрешность включительно, ₽
  appVer:'2.0'
};
const BRANCHES=[
  {id:'marksa',title:'Маркса, 45'},
  {id:'70let',title:'70 лет Октября, 20'},
  {id:'pereleta',title:'Перелёта, 19'},
  {id:'test',title:'ТЕСТ (не настоящий филиал)',testOnly:true}
];
const isHead=()=>!!(S.person&&S.person.head===true);
const isCC=()=>!!(S.person&&S.person.cc===true); // оператор колл-центра (с 1.34)
const canReport=()=>!!(S.person&&(S.person.head===true||S.person.admin===true||personRoles(S.person).includes('admin')));
const ccOnly=()=>isCC()&&!canReport();
const isWork=()=>!!(S.person&&S.person.work===true); // врач или курьер: вкладка «Моя работа» (с 1.46)
const workOnly=()=>isWork()&&!canReport()&&!isCC();
const UI2=window.EVROVET_UI2_CONFIG||{};
const normRole=r=>({adm:'admin',cc:'callcenter',doc:'doctor',asst:'assistant_clinical',assistant:'assistant_clinical',aho:'courier',cour:'courier'}[r]||r);
function personRoles(p=S.person){
  if(!p)return[];
  const roles=new Set();
  const add=r=>{r=normRole(String(r||'').trim().toLowerCase());if(r)roles.add(r)};
  if(Array.isArray(p.roles))p.roles.forEach(add);
  if(p.role)add(p.role);
  if(p.head===true)add('head');
  if(p.admin===true||p.adm===true)add('admin');
  if(p.cc===true||p.callcenter===true)add('callcenter');
  if(p.doc===true||p.doctor===true)add('doctor');
  if(p.asst===true||p.assistant===true||p.assistant_clinical===true)add('assistant_clinical');
  if(p.assistant_tech===true)add('assistant_tech');
  if(p.cour===true||p.courier===true||p.aho===true)add('courier');
  return[...roles];
}
const hasRole=r=>personRoles().includes(r);
const isCourier=()=>hasRole('courier');
const homeView=()=> 'branch';

/* ====== Утилиты ====== */
const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const LS={
  get(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(e){return d}},
  set(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true}catch(e){return false}},
  del(k){try{localStorage.removeItem(k)}catch(e){}}
};
const uid=()=>(window.crypto&&crypto.randomUUID)?crypto.randomUUID():(Date.now().toString(36)+Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2));
const omskToday=()=>{ // сегодня по Омску (UTC+6, без перехода на летнее время), формат ГГГГ-ММ-ДД на любом браузере
  try{const p=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Omsk',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const g=t=>(p.find(x=>x.type===t)||{}).value;const v=g('year')+'-'+g('month')+'-'+g('day');if(/^\d{4}-\d{2}-\d{2}$/.test(v))return v}catch(e){}
  return new Date(Date.now()+6*36e5).toISOString().slice(0,10)
};
const nf=new Intl.NumberFormat('ru-RU',{minimumFractionDigits:0,maximumFractionDigits:2});
const nf2=new Intl.NumberFormat('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2});
/* 2.0: целые рубли без копеек (13 750 ₽), дробные — всегда два знака (1 082,70 ₽) */
const money=x=>{const v=Math.round(x*100)/100;return (Number.isInteger(v)?nf:nf2).format(v)+' ₽'};
const r2=x=>Math.round(x*100)/100;
function num(s){ // null — пусто; NaN — некорректно
  if(s==null)return null;
  const t=String(s).replace(/[\s ]/g,'').replace(',','.');
  if(t==='')return null;
  if(!/^-?\d+(\.\d{0,2})?$/.test(t))return NaN;
  return Number(t);
}
function fmtNum(s){ // пробелы между тысячами: 12 332,50 (хранится как введено, разбор — num())
  let v=String(s==null?'':s);const neg=v.trim().charAt(0)==='-';
  v=v.replace(/[^\d.,]/g,'');
  const m=v.search(/[.,]/);
  let ip=m<0?v:v.slice(0,m),dp=m<0?'':v.slice(m+1).replace(/[^\d]/g,'').slice(0,2);
  const sep=m<0?'':v.charAt(m);
  ip=ip.replace(/^0+(?=\d)/,'').replace(/\B(?=(\d{3})+(?!\d))/g,'\u00A0');
  return (neg?'-':'')+ip+(m<0?'':sep+dp);
}
const N=s=>{const v=num(s);return(v==null||isNaN(v))?0:v};
const ruDate=d=>d.split('-').reverse().join('.');
const hmOmsk=t=>{try{return new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Omsk',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(t))}catch(e){return ''}};
const DEV=(()=>{let d=LS.get('ev_dev');if(!d){d=uid();LS.set('ev_dev',d)}return d})();

/* ====== API ====== */
async function rpc(name,body,ms,ref){
  const ctl=new AbortController();const t=setTimeout(()=>ctl.abort(),ms||20000);if(ref)ref.c=ctl;
  let r;
  try{
    r=await fetch(CFG.url+'/rest/v1/rpc/'+name,{method:'POST',headers:{'apikey':CFG.key,'Authorization':'Bearer '+CFG.key,'Content-Type':'application/json'},body:JSON.stringify(body),signal:ctl.signal});
  }catch(e){throw{net:true}}finally{clearTimeout(t)}
  if(r.status>=500)throw{net:true,status:r.status};
  if(!r.ok)throw{http:r.status};
  return r.json();
}

for(const k of Object.keys(localStorage))if(['ev_token','ev_person','ev_loginlist','ev_last','ev_tab','ev_act'].includes(k)||k.startsWith('ev_handover_ctx:')||k.startsWith('ev_ctx:'))localStorage.removeItem(k);
/* ====== Состояние ====== */
const S={
  view:'login',
  loginScreen:'start',loginStep:'number',loginNumber:'',loginPin:'',loginShared:false,
  token:null,
  person:null,
  branch:null,date:omskToday(),dateManual:false,ctx:null,ctxOffline:false,
  form:null,loginList:[],pick:null,shared:false,
  queue:LS.get('ev_queue',[]),handoverQueue:LS.get('ev_handover_queue',[]),handover:null,
  transit:null,transitUid:null,myCash:null,
  online:navigator.onLine,done:null,busy:false,
  ccVal:null,ccValRange:null,ccValLoad:false,ccValErr:null,ccValUid:null
};
const saveQueue=()=>LS.set('ev_queue',S.queue);
const saveHandoverQueue=()=>LS.set('ev_handover_queue',S.handoverQueue);
(function cleanDrafts(){ // старые форматы и черновики старше 8 дней (сдать их уже нельзя)
  try{
    const lim=new Date(Date.now()-8*864e5).toISOString().slice(0,10);
    Object.keys(localStorage).forEach(k=>{
      if(k.indexOf('ev_draft:')===0)localStorage.removeItem(k);
      else if(k.indexOf('ev_draft2:')===0){const d=k.split(':').pop();if(d<lim)localStorage.removeItem(k)}
    });
  }catch(e){}
})();

function toast(msg,ms=4000){
  const w=$('#toastwrap');w.innerHTML='<div class="toast">'+esc(msg)+'</div>';
  clearTimeout(toast.t);toast.t=setTimeout(()=>{w.innerHTML=''},ms);
}
