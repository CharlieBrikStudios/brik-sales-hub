/* GitHub copy of the Sales Hub: a read-only stand-in for the Hub's database, fed by data.json
   (refreshed from the real Hub a few times a day). Writes are refused, so nothing a viewer does here changes the Hub. */
(()=>{window.BRIK_MIRROR=true;
 let D=null,at=0;const subs=[];
 const copy=d=>d==null?d:JSON.parse(JSON.stringify(d));
 const snapC=c=>({docs:Object.entries((D&&D.c[c])||{}).map(([id,d])=>({id,exists:true,data:()=>copy(d)})),size:Object.keys((D&&D.c[c])||{}).length});
 const snapD=(c,id)=>{const d=D&&D.c[c]?D.c[c][id]:undefined;return{id,exists:d!=null,data:()=>copy(d)}};
 const fire=s=>{try{s.f(s.id!=null?snapD(s.c,s.id):snapC(s.c))}catch(e){console.error(e)}};
 async function load(){try{const r=await fetch('data.json',{cache:'no-cache'});if(!r.ok)return;const j=await r.json();
  if(j&&j.c&&j.at!==at){at=j.at;D=j;window.BRIK_DATA_AT=at;subs.forEach(fire);dispatchEvent(new CustomEvent('brik-data',{detail:at}))}}catch(e){}}
 const ready=load();setInterval(load,120000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});
 const ro=()=>Promise.reject(Object.assign(new Error('This is the view-only copy of the Sales Hub.'),{code:'read_only'}));
 const sub=s=>{subs.push(s);ready.then(()=>{if(D)fire(s)});return()=>{const i=subs.indexOf(s);if(i>=0)subs.splice(i,1)}};
 const docRef=(c,id)=>({id,async get(){await ready;return snapD(c,id)},onSnapshot(f){return sub({c,id,f})},set:ro,update:ro,delete:ro});
 const colRef=c=>{const q={doc:id=>docRef(c,id),async get(){await ready;return snapC(c)},onSnapshot(f){return sub({c,f})},add:ro,where:()=>q,orderBy:()=>q,limit:()=>q};return q};
 const db={doc(p){const s=String(p).split('/');return docRef(s[0],s[1])},collection:colRef};
 const user={isOwner:()=>false,canEdit:()=>false,can:()=>false,async id(){return 'github-copy'},async me(){return{id:'github-copy',name:''}},async profiles(){return{}},async search(){return[]}};
 window.claude={use:async k=>k==='db'?db:k==='user'?user:null};
})();
