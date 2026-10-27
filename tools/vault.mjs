/* Makes vault.json, the lock on the Hub copy. Each person has their own passcode; every passcode
   unlocks the same private key, so the sealed files in m/ never need sealing twice.
   Holds no secret itself: passcodes are given on the command line and never written down.

   node tools/vault.mjs new --force charlie="..." andy="..." ...
        new key pair with these people (then reseal the Hub page and the data: see README)
   node tools/vault.mjs add <name> "<their passcode>" --with "<anyone's current passcode>"
        give one more person their own passcode (nothing to reseal)
   node tools/vault.mjs rewrap <name> "<old passcode>" "<new passcode>"
        change one person's passcode (nothing to reseal)
   node tools/vault.mjs remove <name>
        stop that passcode working on any new device (see README for shutting someone out for good)
   node tools/vault.mjs list
        who has a passcode

   Passcodes ignore capitals, spaces and punctuation: "Copper-Heron" and "copper heron" are the same. */
import {webcrypto as C} from 'node:crypto';import fs from 'node:fs';
const enc=s=>new TextEncoder().encode(s),b64=b=>Buffer.from(b).toString('base64'),unb=s=>Uint8Array.from(Buffer.from(s,'base64'));
const ITER=600000,V=new URL('../vault.json',import.meta.url),today=()=>new Date().toISOString().slice(0,10);
const norm=pw=>String(pw).toLowerCase().replace(/[^a-z0-9]/g,'');
const NAMES={charlie:'Charlie',andy:'Andy',james:'James',jawaad:'Jawaad',asha:'Asha'};
const label=id=>NAMES[id]||id.charAt(0).toUpperCase()+id.slice(1);
const die=m=>{console.error('vault: '+m);process.exit(1)};
async function kek(pw,salt,use){const p=norm(pw);if(p.length<8)die('passcodes need at least 8 letters or digits');
 const base=await C.subtle.importKey('raw',enc(p),'PBKDF2',false,['deriveKey']);
 return C.subtle.deriveKey({name:'PBKDF2',salt,iterations:ITER,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,[use])}
async function wrap(pk8,pw,id){const salt=C.getRandomValues(new Uint8Array(16)),iv=C.getRandomValues(new Uint8Array(12));
 const ct=await C.subtle.encrypt({name:'AES-GCM',iv},await kek(pw,salt,'encrypt'),pk8);
 return {name:label(id),salt:b64(salt),iv:b64(iv),priv:b64(new Uint8Array(ct)),made:today()}}
async function unwrap(v,pw){for(const e of Object.values(v.people||{})){
 try{return new Uint8Array(await C.subtle.decrypt({name:'AES-GCM',iv:unb(e.iv)},await kek(pw,unb(e.salt),'decrypt'),unb(e.priv)))}catch(_){}}
 die('that passcode does not open the vault')}
const load=()=>{const v=JSON.parse(fs.readFileSync(V,'utf8'));if(v.v!==1||!v.pub||!v.people)die('vault.json is not a per-person vault');return v};
const save=v=>{v.made=today();fs.writeFileSync(V,JSON.stringify(v,null,1)+'\n')};
const okId=id=>{if(!/^[a-z][a-z0-9-]{1,23}$/.test(id||''))die('names are lower case, like andy');return id};

const [mode,...a]=process.argv.slice(2);
if(mode==='new'){
 if(fs.existsSync(V)&&!a.includes('--force'))die('vault.json exists. A new key pair locks every device out until the Hub page and its data are sealed again. Add --force if that is what you want.');
 const ppl=a.filter(x=>x.includes('=')).map(x=>{const i=x.indexOf('=');return [okId(x.slice(0,i)),x.slice(i+1)]});
 if(!ppl.length)die('give at least one person, like andy="copper heron lantern"');
 if(new Set(ppl.map(p=>norm(p[1]))).size!==ppl.length)die('two people have the same passcode');
 const kp=await C.subtle.generateKey({name:'RSA-OAEP',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['encrypt','decrypt']);
 const pk8=new Uint8Array(await C.subtle.exportKey('pkcs8',kp.privateKey)),spki=await C.subtle.exportKey('spki',kp.publicKey);
 const v={v:1,kdf:'PBKDF2-SHA256',iter:ITER,norm:'lower case, letters and digits only',pub:b64(new Uint8Array(spki)),people:{}};
 for(const [id,pw] of ppl)v.people[id]=await wrap(pk8,pw,id);
 save(v);console.log('new vault for '+ppl.map(p=>p[0]).join(', ')+'. Now reseal the Hub page and the data.')}
else if(mode==='add'){const [id,pw]=a,w=a.indexOf('--with');if(w<0||!a[w+1])die('usage: add <name> "<passcode>" --with "<anyone\'s current passcode>"');
 const v=load();okId(id);if(v.people[id])die(id+' already has a passcode; use rewrap to change it');
 v.people[id]=await wrap(await unwrap(v,a[w+1]),pw,id);save(v);console.log('added '+id)}
else if(mode==='rewrap'){const [id,oldpw,newpw]=a;const v=load();if(!v.people[id])die('no one called '+id);
 const e=v.people[id];let pk8;try{pk8=new Uint8Array(await C.subtle.decrypt({name:'AES-GCM',iv:unb(e.iv)},await kek(oldpw,unb(e.salt),'decrypt'),unb(e.priv)))}catch(_){die('that is not '+id+'\'s current passcode')}
 v.people[id]=await wrap(pk8,newpw,id);save(v);console.log('changed the passcode for '+id)}
else if(mode==='remove'){const [id]=a;const v=load();if(!v.people[id])die('no one called '+id);if(Object.keys(v.people).length<2)die('cannot remove the last person');
 delete v.people[id];save(v);console.log('removed '+id+'. Devices they already opened keep working until the key pair is changed (README).')}
else if(mode==='list'){const v=load();for(const [id,e] of Object.entries(v.people))console.log(id.padEnd(10),e.name.padEnd(10),'since',e.made)}
else console.log('usage: node tools/vault.mjs new --force name="passcode" ... | add | rewrap | remove | list');
