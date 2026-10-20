/* Makes vault.json, the passcode lock. Holds no secret itself: run it with the passcode.
   node tools/vault.mjs new <passcode> --force    new key pair (then reseal everything)
   node tools/vault.mjs rewrap <old> <new>        same key pair, new passcode (nothing to reseal) */
import {webcrypto as C} from 'node:crypto';import fs from 'node:fs';
const enc=s=>new TextEncoder().encode(s),b64=b=>Buffer.from(b).toString('base64'),unb=s=>Uint8Array.from(Buffer.from(s,'base64'));
const ITER=600000,V=new URL('../vault.json',import.meta.url);
async function kek(pw,salt,use){const base=await C.subtle.importKey('raw',enc(pw.trim().toLowerCase()),'PBKDF2',false,['deriveKey']);
 return C.subtle.deriveKey({name:'PBKDF2',salt,iterations:ITER,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,[use])}
async function wrap(pk8,pw,pub){const salt=C.getRandomValues(new Uint8Array(16)),iv=C.getRandomValues(new Uint8Array(12));
 const ct=await C.subtle.encrypt({name:'AES-GCM',iv},await kek(pw,salt,'encrypt'),pk8);
 return {v:1,kdf:'PBKDF2-SHA256',iter:ITER,salt:b64(salt),iv:b64(iv),priv:b64(new Uint8Array(ct)),pub,made:new Date().toISOString().slice(0,10)}}
const [mode,a,b]=process.argv.slice(2);
if(mode==='new'){if(fs.existsSync(V)&&b!=='--force'){console.log('vault.json exists. A new key pair locks out every sealed file until the whole Hub and its data are sealed again. Add --force if that is what you want.');process.exit(1)}
 const kp=await C.subtle.generateKey({name:'RSA-OAEP',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['encrypt','decrypt']);
 const pk8=await C.subtle.exportKey('pkcs8',kp.privateKey),spki=await C.subtle.exportKey('spki',kp.publicKey);
 fs.writeFileSync(V,JSON.stringify(await wrap(pk8,a,b64(new Uint8Array(spki))),null,1)+'\n');console.log('new vault written')}
else if(mode==='rewrap'){const v=JSON.parse(fs.readFileSync(V,'utf8'));
 const pk8=await C.subtle.decrypt({name:'AES-GCM',iv:unb(v.iv)},await kek(a,unb(v.salt),'decrypt'),unb(v.priv));
 fs.writeFileSync(V,JSON.stringify(await wrap(pk8,b,v.pub),null,1)+'\n');console.log('passcode changed')}
else console.log('usage: node tools/vault.mjs new <passcode> | rewrap <old> <new>');
