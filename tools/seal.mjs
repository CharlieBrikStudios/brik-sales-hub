#!/usr/bin/env node
/* Brik Sales Hub, GitHub copy: seals files so only someone with the passcode can open them.
   It needs no secret: it encrypts with the public key in vault.json. Only the passcode unlocks
   the private key, and that only happens in the browser (index.html).

   node tools/seal.mjs hub  <dir>    the Hub page and its pictures: every file under <dir>
                                     (index.html is made view-only for this copy first)
   node tools/seal.mjs data <dir>    the Hub's database, exported as <dir>/<collection>/<id>.json
   node tools/seal.mjs check         prints what is in m/ and whether vault.json is readable

   Output goes to m/ next to this folder. Never commit <dir>: it holds the readable copies. */
import {webcrypto as C} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const OUT=path.join(ROOT,'m');
const enc=s=>new TextEncoder().encode(s);
const b64=s=>Uint8Array.from(Buffer.from(s,'base64'));
const hex=b=>Buffer.from(b).toString('hex');
const die=m=>{console.error('seal: '+m);process.exit(1)};

const NAME=async p=>hex(await C.subtle.digest('SHA-256',enc('brik:'+p))).slice(0,32);
async function pub(){const v=JSON.parse(fs.readFileSync(path.join(ROOT,'vault.json'),'utf8'));if(v.v!==1||!v.pub)die('vault.json is not a v1 vault');
 return C.subtle.importKey('spki',b64(v.pub),{name:'RSA-OAEP',hash:'SHA-256'},false,['encrypt'])}
async function seal(key,p,plain){const raw=C.getRandomValues(new Uint8Array(32)),iv=C.getRandomValues(new Uint8Array(12));
 const ak=await C.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt']);
 const ct=new Uint8Array(await C.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc(p)},ak,plain));
 const wk=new Uint8Array(await C.subtle.encrypt({name:'RSA-OAEP'},key,raw));if(wk.length!==256)die('expected a 2048-bit key');
 const out=new Uint8Array(4+256+12+ct.length);out.set(enc('BRK1'),0);out.set(wk,4);out.set(iv,260);out.set(ct,272);
 const n=await NAME(p);fs.mkdirSync(OUT,{recursive:true});fs.writeFileSync(path.join(OUT,n+'.bin'),out);return n}
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);

/* the view-only patches for the Hub page */
function mirrorPage(html){
 const shim=fs.readFileSync(path.join(ROOT,'tools','mirror-shim.js'),'utf8').trim();
 if(html.includes('/*brik-mirror*/'))die('this index.html is already the GitHub copy; seal the Hub\'s own page');
 const rep=[
  ['<title>','<script>/*brik-mirror*/\n'+shim+'\n</script>\n<title>'],
  ['async function equip(k,ch,quiet){','async function equip(k,ch,quiet){if(window.BRIK_MIRROR){ping(\'View-only copy\',\'Change your look in the Hub on Claude.\');return}'],
  ['async function buyManor(id){','async function buyManor(id){if(window.BRIK_MIRROR){ping(\'View-only copy\',\'Buy manors in the Hub on Claude.\');return}'],
  ['View only. Ask Charlie for contributor access to log sales.','View-only copy. Log sales in the Hub on Claude.'],
 ];
 for(const [a,b] of rep){const i=html.indexOf(a);if(i<0)die('the Hub page has changed: could not find '+JSON.stringify(a.slice(0,50)));html=html.slice(0,i)+b+html.slice(i+a.length)}
 return html}

const [mode,dir]=process.argv.slice(2);
if(mode==='hub'){
 if(!dir||!fs.existsSync(path.join(dir,'index.html')))die('give the folder holding the Hub index.html and its pictures');
 const key=await pub();const keep=new Set();
 for(const f of walk(dir)){const p=path.relative(dir,f).split(path.sep).join('/');if(p==='data.json'||p.startsWith('.'))continue;
  let buf=fs.readFileSync(f);if(p==='index.html')buf=Buffer.from(mirrorPage(buf.toString('utf8')),'utf8');
  keep.add(await seal(key,p,buf))}
 keep.add(await NAME('data.json'));
 for(const f of fs.existsSync(OUT)?fs.readdirSync(OUT):[])if(f.endsWith('.bin')&&!keep.has(f.slice(0,-4)))fs.unlinkSync(path.join(OUT,f));
 console.log(`sealed ${keep.size-1} Hub files into m/`);
}else if(mode==='data'){
 if(!dir||!fs.existsSync(dir))die('give the folder the database was exported to');
 const c={};let n=0;
 for(const col of fs.readdirSync(dir,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>e.name)){
  c[col]={};for(const f of fs.readdirSync(path.join(dir,col)).filter(f=>f.endsWith('.json'))){
   try{c[col][f.slice(0,-5)]=JSON.parse(fs.readFileSync(path.join(dir,col,f),'utf8'));n++}catch(e){die(`${col}/${f} is not valid JSON`)}}}
 for(const need of [['game','live'],['town','live'],['units',null]])if(!c[need[0]]||(need[1]?!c[need[0]][need[1]]:!Object.keys(c[need[0]]).length))die(`the export has no ${need[0]}${need[1]?'/'+need[1]:''}; not sealing a half-empty copy`);
 const sorted=o=>Object.fromEntries(Object.keys(o).sort().map(k=>[k,o[k]&&typeof o[k]==='object'&&!Array.isArray(o[k])?sorted(o[k]):o[k]]));
 const body=JSON.stringify(sorted(c));const stamp=hex(await C.subtle.digest('SHA-256',enc(body)));
 const sf=path.join(OUT,'data.stamp');
 if(fs.existsSync(sf)&&fs.readFileSync(sf,'utf8').trim()===stamp){console.log('unchanged: nothing to commit');process.exit(0)}
 const data=JSON.stringify({at:Date.now(),c:JSON.parse(body)});
 await seal(await pub(),'data.json',enc(data));fs.writeFileSync(sf,stamp+'\n');
 console.log(`sealed data.json (${n} documents, ${Object.keys(c).length} collections, ${Math.round(data.length/1024)} KB)`);
}else if(mode==='check'){
 await pub();const fl=fs.existsSync(OUT)?fs.readdirSync(OUT).filter(f=>f.endsWith('.bin')):[];
 console.log(`vault.json ok; ${fl.length} sealed files; data.json ${fl.includes((await NAME('data.json'))+'.bin')?'present':'missing'}`);
}else die('usage: node tools/seal.mjs hub <dir> | data <dir> | check');
