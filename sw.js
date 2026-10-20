/* Brik Sales Hub, GitHub copy. Everything under app/ is stored encrypted in m/; this worker
   unlocks each file in the browser with the key the passcode opened (kept on this device only). */
const SCOPE=self.registration.scope,APP=new URL('app/',SCOPE).pathname;
const TYPES={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',mjs:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',json:'application/json; charset=utf-8',txt:'text/plain; charset=utf-8',md:'text/plain; charset=utf-8',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',svg:'image/svg+xml',gif:'image/gif',pdf:'application/pdf',woff2:'font/woff2'};
const enc=s=>new TextEncoder().encode(s);
let KEY=null;

self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('message',e=>{if(e.data==='lock'||e.data==='key')KEY=null});

function idb(){return new Promise((res,rej)=>{const r=indexedDB.open('brik-vault',1);r.onupgradeneeded=()=>r.result.createObjectStore('k');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function idbDo(mode,fn){const db=await idb();try{return await new Promise((res,rej)=>{const t=db.transaction('k',mode);const q=fn(t.objectStore('k'));t.oncomplete=()=>res(q&&q.result);t.onerror=()=>rej(t.error)})}finally{db.close()}}
async function getKey(){if(KEY)return KEY;KEY=(await idbDo('readonly',s=>s.get('priv')))||null;return KEY}
async function forget(){KEY=null;try{await idbDo('readwrite',s=>s.delete('priv'))}catch(_){}}

async function nameOf(p){const h=new Uint8Array(await crypto.subtle.digest('SHA-256',enc('brik:'+p)));return [...h].map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,32)}
async function open(buf,key,p){
 if(buf.length<288||String.fromCharCode(...buf.slice(0,4))!=='BRK1')throw new Error('not a sealed file');
 const raw=await crypto.subtle.decrypt({name:'RSA-OAEP'},key,buf.slice(4,260));
 const ak=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['decrypt']);
 return crypto.subtle.decrypt({name:'AES-GCM',iv:buf.slice(260,272),additionalData:enc(p)},ak,buf.slice(272))}

self.addEventListener('fetch',e=>{
 const u=new URL(e.request.url);
 if(u.origin!==location.origin||!u.pathname.startsWith(APP)||e.request.method!=='GET')return;
 let p=decodeURIComponent(u.pathname.slice(APP.length));if(p===''||p.endsWith('/'))p+='index.html';
 e.respondWith(serve(p,e.request))});

async function serve(p,req){
 const nav=req.mode==='navigate',back=()=>Response.redirect(SCOPE+(nav?'':'?locked'),302);
 let key=null;try{key=await getKey()}catch(_){}
 if(!key)return nav?back():new Response('Locked',{status:401});
 let r;try{r=await fetch(SCOPE+'m/'+(await nameOf(p))+'.bin',{cache:'no-cache'})}catch(_){return new Response('Offline',{status:503})}
 if(!r.ok)return new Response('Not found',{status:404});
 try{const plain=await open(new Uint8Array(await r.arrayBuffer()),key,p);
  const ext=(p.split('.').pop()||'').toLowerCase();
  return new Response(plain,{headers:{'Content-Type':TYPES[ext]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})}
 catch(_){/* the passcode was changed since this device unlocked: ask for it again */
  if(p==='index.html'){await forget();return Response.redirect(SCOPE+'?changed',302)}
  return new Response('Could not unlock',{status:403})}}
