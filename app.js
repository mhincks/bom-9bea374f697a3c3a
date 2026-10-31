import { setIconPath, allDefined } from './wa/webawesome.loader.js';
import * as A from './anchor.js';
setIconPath(new URL('icons/fa/svgs', location.href).pathname.replace(/\/$/,''));

const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const te=new TextEncoder(), td=new TextDecoder();
const wide=()=>matchMedia('(min-width: 768px)').matches;
const S={ cfg:null, key:null, cat:null, byId:new Map(), tab:'lib', lib:{book:null,ch:0,src:'',topic:''}, q:'', doc:null, anns:[], shard:{}, art:new Map() };

/* ---------- IndexedDB ---------- */
let _db;
function db(){ return _db||(_db=new Promise((res,rej)=>{ const r=indexedDB.open('bomstudy',1);
  r.onupgradeneeded=()=>{ const d=r.result; d.createObjectStore('kv'); const s=d.createObjectStore('ann',{keyPath:'id'}); s.createIndex('doc','doc'); };
  r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); })); }
async function tx(store,mode,fn){ const d=await db(); return new Promise((res,rej)=>{ const t=d.transaction(store,mode); const st=t.objectStore(store); let out; Promise.resolve(fn(st)).then(v=>out=v); t.oncomplete=()=>res(out); t.onerror=()=>rej(t.error); }); }
const req=r=>new Promise((res,rej)=>{r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});
const kvGet=k=>tx('kv','readonly',s=>req(s.get(k)));
const kvSet=(k,v)=>tx('kv','readwrite',s=>{s.put(v,k);});
const kvDel=k=>tx('kv','readwrite',s=>{s.delete(k);});
const annAll=()=>tx('ann','readonly',s=>req(s.getAll()));
const annPut=a=>tx('ann','readwrite',s=>{ (Array.isArray(a)?a:[a]).forEach(x=>s.put(x)); });

/* ---------- Crypto ---------- */
const hex=h=>new Uint8Array(h.match(/../g).map(x=>parseInt(x,16)));
async function deriveKey(pass){ const base=await crypto.subtle.importKey('raw',te.encode(pass),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt:hex(S.cfg.salt),iterations:S.cfg.iter,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']); }
async function decRaw(buf,key=S.key){ buf=new Uint8Array(buf); return crypto.subtle.decrypt({name:'AES-GCM',iv:buf.slice(0,12)},key,buf.slice(12)); }
async function inflateJSON(ab){ const s=new Blob([ab]).stream().pipeThrough(new DecompressionStream('deflate-raw')); return JSON.parse(await new Response(s).text()); }
async function getEnc(path){ const r=await fetch(path); if(!r.ok) throw new Error(path+' '+r.status); return inflateJSON(await decRaw(await r.arrayBuffer())); }
async function encText(str){ const iv=crypto.getRandomValues(new Uint8Array(12)); const ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},S.key,te.encode(str))); const o=new Uint8Array(12+ct.length); o.set(iv); o.set(ct,12); return o; }
const b64=u8=>{ let s=''; for(let i=0;i<u8.length;i+=0x8000) s+=String.fromCharCode(...u8.subarray(i,i+0x8000)); return btoa(s); };
const unb64=s=>Uint8Array.from(atob(s.replace(/\s/g,'')),c=>c.charCodeAt(0));

/* ---------- Settings ---------- */
const prefs=Object.assign({size:19,fam:'serif',theme:'auto',lh:1.65},JSON.parse(localStorage.getItem('prefs')||'{}'));
function applyPrefs(){ const h=document.documentElement; h.style.setProperty('--reader-size',prefs.size+'px'); h.style.setProperty('--reader-lh',prefs.lh);
  h.classList.toggle('sans',prefs.fam==='sans');
  const dark=prefs.theme==='dark'||(prefs.theme==='auto'&&matchMedia('(prefers-color-scheme: dark)').matches);
  h.classList.toggle('wa-dark',dark); h.classList.toggle('wa-light',!dark); h.classList.toggle('sepia',prefs.theme==='sepia');
  const m=$$('meta[name=theme-color]'); m.forEach(x=>x.setAttribute('content',dark?'#14161a':prefs.theme==='sepia'?'#f4ecd8':'#f7f4ee')); }
function savePrefs(){ localStorage.setItem('prefs',JSON.stringify(prefs)); applyPrefs(); }
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',applyPrefs);
applyPrefs();

/* ---------- Boot ---------- */
async function boot(){
  if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
  S.cfg=await (await fetch('config.json',{cache:'no-cache'}).catch(()=>fetch('config.json'))).json();
  await Promise.race([allDefined(),new Promise(r=>setTimeout(r,2500))]);
  document.documentElement.classList.remove('wa-cloak');
  const k=await kvGet('key').catch(()=>null);
  if(k && await checkKey(k)){ S.key=k; return start(); }
  showGate();
}
async function checkKey(k){ try{ const pt=await decRaw(unb64(S.cfg.check),k); return (await inflateJSON(pt)).ok===true; }catch(e){ return false; } }
function showGate(){ $('#gate').hidden=false; $('#app').hidden=true;
  let busy=false;
  $('#gateForm').onsubmit=async e=>{ e.preventDefault(); const p=$('#pass').value.trim(); if(!p||busy) return; busy=true; $('#unlockBtn').loading=true; $('#gateErr').hidden=true;
    const k=await deriveKey(p); if(await checkKey(k)){ S.key=k; await kvSet('key',k); $('#gate').hidden=true; start(); } else { $('#gateErr').hidden=false; } $('#unlockBtn').loading=false; busy=false; };
  $('#pass').addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); $('#gateForm').requestSubmit(); } }); }

let started=false;
async function start(){ if(started) return; started=true;
  $('#app').hidden=false;
  $('#pane').innerHTML='<div class="empty"><wa-spinner style="font-size:28px"></wa-spinner></div>';
  const c=await getEnc('catalog.bin');
  S.books=c.books; S.srcNames=c.src; S.topics=c.topics;
  S.cat=c.items.map((r,n)=>({n,id:r[0],src:r[1],title:r[2],author:r[3],year:r[4],books:r[5],ch:r[6],tg:r[7],sum:r[8],k:r[9],txt:r[10],ref:r[11],venue:r[12]}));
  S.cat.forEach(i=>S.byId.set(i.id,i));
  S.anns=(await annAll()).filter(a=>!a.deleted);
  S.annCount=countAnns();
  bindUI(); route(); syncSoon(500);
}
function countAnns(){ const m=new Map(); for(const a of S.anns) m.set(a.doc,(m.get(a.doc)||0)+1); return m; }

/* ---------- Routing ---------- */
// #/lib  #/lib/alma  #/lib/alma/32  #/search  #/notes  #/settings  #/read/<id>[/<annId>]
function go(h,replace){ if(replace) history.replaceState(history.state,'',h); else history.pushState({inApp:true},'',h); route(); }
window.addEventListener('popstate',route);
function route(){
  const h=decodeURIComponent(location.hash.slice(2)||'lib'); const p=h.split('/');
  if(p[0]==='read'){ document.body.classList.add('reading'); document.body.classList.remove('no-doc'); openDoc(p[1],p[2]); if(wide()&&!S.sideDrawn) drawSide(); return; }
  document.body.classList.remove('reading');
  if(p[0]==='lib'){ S.tab='lib'; S.lib.book=p[1]||null; S.lib.ch=+(p[2]||0); }
  else S.tab=p[0];
  if(!S.doc) document.body.classList.add('no-doc');
  drawSide();
}
function drawSide(){ S.sideDrawn=true; $$('#tabs button').forEach(b=>b.classList.toggle('on',b.dataset.tab===S.tab));
  ({lib:drawLib,search:drawSearch,notes:drawNotes,settings:drawSettings}[S.tab]||drawLib)(); }

/* ---------- Library ---------- */
const bookName=c=>(S.books.find(b=>b[0]===c)||[c,c])[1];
function filtered(){ const {src,topic}=S.lib; return S.cat.filter(i=>(!src||i.src===src)&&(topic===''||i.tg.includes(+topic))); }
function filterControls(){
  return `<div class="filters">
  <wa-select id="fSrc" size="s" placeholder="All sources" with-clear value="${esc(S.lib.src)}">${Object.entries(S.srcNames).map(([k,v])=>`<wa-option value="${k}">${esc(v)}</wa-option>`).join('')}</wa-select>
  <wa-select id="fTopic" size="s" placeholder="All topics" with-clear value="${esc(S.lib.topic)}">${S.topics.map((t,i)=>`<wa-option value="${i}">${esc(t)}</wa-option>`).join('')}</wa-select></div>`; }
function bindFilters(redraw){ const f=(id,k)=>{ const el=$(id); if(!el) return; el.addEventListener('change',()=>{ S.lib[k]=el.value||''; redraw(); }); el.addEventListener('wa-clear',()=>{ S.lib[k]=''; redraw(); }); };
  f('#fSrc','src'); f('#fTopic','topic'); }
function setBar(title,actions=''){ $('#sideTitle').textContent=title; $('#sideActions').innerHTML=actions; }
function drawLib(){
  const items=filtered(); const {book,ch}=S.lib;
  if(!book){
    setBar('Library');
    const cnt=new Map(); items.forEach(i=>i.books.forEach(b=>cnt.set(b,(cnt.get(b)||0)+1)));
    $('#pane').innerHTML=filterControls()+`<div class="sec-h">Books · ${items.length.toLocaleString()} items</div><div class="books">${
      S.books.map(([c,n])=>`<div class="book" data-b="${c}"><span>${esc(n)}</span><small>${cnt.get(c)||0}</small></div>`).join('')}</div>`;
    $$('.book').forEach(el=>el.onclick=()=>go('#/lib/'+el.dataset.b));
    bindFilters(drawLib); $('#pane').scrollTop=S.libScroll||0; return;
  }
  setBar(bookName(book),`<wa-button appearance="plain" size="s" id="libBack"><wa-icon name="chevron-left" label="Books"></wa-icon></wa-button>`);
  $('#libBack').onclick=()=>go('#/lib');
  let inBook=items.filter(i=>i.books.includes(book));
  const max=(S.books.find(b=>b[0]===book)||[0,0,0])[2];
  const chCount=new Map(); inBook.forEach(i=>{ if(i.books[0]===book) i.ch.forEach(c=>chCount.set(c,(chCount.get(c)||0)+1)); });
  let list=ch?inBook.filter(i=>i.books[0]===book&&i.ch.includes(ch)):inBook;
  list=[...list].sort((a,b)=>(b.books[0]===book)-(a.books[0]===book)||(b.year-a.year)||a.title.localeCompare(b.title));
  $('#pane').innerHTML=filterControls()+(max?`<div class="sec-h">Chapters</div><div class="chaps"><button data-c="0" class="${ch?'':'on'}">All</button>${
    Array.from({length:max},(_,k)=>k+1).map(c=>`<button data-c="${c}" class="${c===ch?'on':''}">${c}<span class="n">${chCount.get(c)||''}</span></button>`).join('')}</div>`:'')+
    `<div class="sec-h">${ch?esc(bookName(book))+' '+ch+' · ':''}${list.length} items</div><div class="list" id="list"></div>`;
  $$('.chaps button').forEach(b=>b.onclick=()=>go('#/lib/'+book+(+b.dataset.c?'/'+b.dataset.c:''),true));
  bindFilters(drawLib); renderList($('#list'),list);
}
function srcBadge(s){ const v={knowhy:'brand',evidence:'success',bti:'warning',interpreter:'neutral'}[s]||'neutral'; return `<wa-badge variant="${v}" appearance="filled-outlined">${esc(S.srcNames[s]||s)}</wa-badge>`; }
function rowHTML(i,snip){ const n=S.annCount.get(i.id);
  return `<div class="row${S.doc&&S.doc.id===i.id?' active':''}" data-id="${esc(i.id)}"><h3>${esc(i.title)}</h3><div class="meta">${srcBadge(i.src)}<span>${esc(i.author)}${i.year?' · '+i.year:''}</span>${i.txt?'':'<wa-badge variant="neutral" appearance="outlined">link only</wa-badge>'}${n?`<span title="Notes">✎ ${n}</span>`:''}</div>${snip?`<p class="snip">${snip}</p>`:i.sum?`<p>${esc(i.sum)}</p>`:''}</div>`; }
function renderList(el,list,snips){
  let shown=0; const step=40;
  const more=()=>{ const chunk=list.slice(shown,shown+step); el.insertAdjacentHTML('beforeend',chunk.map(i=>rowHTML(i,snips&&snips.get(i.id))).join('')); shown+=chunk.length;
    const m=el.parentNode.querySelector('.more'); if(m) m.remove();
    if(shown<list.length){ el.insertAdjacentHTML('afterend',`<div class="more"><wa-button size="s" appearance="outlined">Show more (${list.length-shown})</wa-button></div>`); const mb=el.parentNode.querySelector('.more wa-button'); mb.onclick=more; io.observe(mb); } };
  const io=new IntersectionObserver(es=>es.forEach(e=>{ if(e.isIntersecting){ io.unobserve(e.target); more(); } }),{root:$('#pane'),rootMargin:'400px'});
  if(!list.length) el.innerHTML='<div class="empty">Nothing here with these filters.</div>';
  more();
  el.onclick=e=>{ const r=e.target.closest('.row'); if(r){ S.libScroll=$('#pane').scrollTop; go('#/read/'+encodeURIComponent(r.dataset.id)); } };
}

/* ---------- Search ---------- */
const STOP=new Set('the of and to in a is that for it as was with be by on not he this are or his from at which but they have an were their had one all we there been has will would who more its so can them these may than other into some what when only also our such any about those then out up do no shall unto ye thee thou thy hath'.split(' '));
const norm=s=>s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[’']/g,'');
const tokens=s=>(norm(s).match(/[a-z0-9]+/g)||[]);
async function shard(p){ if(!S.cfg.shards.includes(p)) return {}; return S.shard[p]||(S.shard[p]=getEnc('s/'+p+'.bin').catch(e=>{ delete S.shard[p]; throw e; })); }
async function runSearch(q){
  const phrases=[...q.matchAll(/"([^"]+)"/g)].map(m=>norm(m[1]).replace(/[^a-z0-9]+/g,' ').trim()).filter(Boolean);
  const terms=[...new Set(tokens(q))].filter(t=>t.length>=2&&!STOP.has(t)); if(!terms.length) return {res:[],terms};
  const N=S.cat.length; const per=[];
  for(const t of terms){ const sh=await shard(t.slice(0,2)); const m=new Map(); let keys=sh[t]?[t]:[];
    if(t.length>=3){ const pre=Object.keys(sh).filter(k=>k!==t&&k.startsWith(t)).sort((a,b)=>sh[b][0].length-sh[a][0].length).slice(0,40); keys=keys.concat(pre); }
    for(const k of keys){ const [dl,ws]=sh[k]; const idf=Math.log(1+N/dl.length)*(k===t?1:0.6); let x=0; for(let j=0;j<dl.length;j++){ x+=dl[j]; const v=ws[j]*idf; if(v>(m.get(x)||0)) m.set(x,v); } }
    per.push(m); }
  per.sort((a,b)=>a.size-b.size);
  let docs=[...per[0].keys()].filter(d=>per.every(m=>m.has(d))); let partial=false;
  if(!docs.length&&per.length>1){ partial=true; const all=new Set(); per.forEach(m=>m.forEach((_,d)=>all.add(d))); docs=[...all]; }
  let res=docs.map(d=>({i:S.cat[d],s:per.reduce((a,m)=>a+(m.get(d)||0),0)}));
  if(S.lib.src) res=res.filter(r=>r.i.src===S.lib.src);
  if(S.lib.topic!=='') res=res.filter(r=>r.i.tg.includes(+S.lib.topic));
  if(S.searchBook) res=res.filter(r=>r.i.books.includes(S.searchBook));
  res.sort((a,b)=>b.s-a.s);
  if(phrases.length){ const cand=res.slice(0,120); const ok=new Set(); await pool(cand,8,async r=>{ const a=await article(r.i); const t=norm(metaText(a)+' '+a.paras.join(' ')).replace(/[^a-z0-9]+/g,' '); if(phrases.every(p=>t.includes(p))) ok.add(r.i.id); }); res=cand.filter(r=>ok.has(r.i.id)); }
  return {res:res.map(r=>r.i),terms,partial,phrases};
}
const metaText=a=>[a.title,a.summary,a.author,(a.tags||[]).join(' ')].join(' ');
async function pool(arr,n,fn){ let i=0; await Promise.all(Array.from({length:n},async()=>{ while(i<arr.length){ const x=arr[i++]; try{ await fn(x); }catch(e){} } })); }
function snippet(a,terms,phrases){ const txt=a.paras.length?a.paras.join(' '):a.summary; const low=norm(txt);
  let pos=-1; for(const p of (phrases||[])){ pos=low.indexOf(p.split(' ')[0]); if(pos>=0) break; }
  if(pos<0) for(const t of terms){ const m=new RegExp('\\b'+t).exec(low); if(m){ pos=m.index; break; } }
  if(pos<0) return esc(a.summary.slice(0,200));
  const s=Math.max(0,pos-80); let out=esc((s?'…':'')+txt.slice(s,pos+180)+'…');
  for(const t of terms) out=out.replace(new RegExp('\\b('+t+'\\w*)','gi'),'<mark>$1</mark>'); return out; }
function drawSearch(){
  setBar('Search');
  $('#pane').innerHTML=`<div class="searchbox"><wa-input id="q" type="search" placeholder="Search all article text" with-clear value="${esc(S.q)}" autocapitalize="off" enterkeyhint="search"><wa-icon slot="start" name="magnifying-glass"></wa-icon></wa-input>
  <div class="filters"><wa-select id="fBook" size="s" placeholder="Any book" with-clear value="${esc(S.searchBook||'')}">${S.books.map(([c,n])=>`<wa-option value="${c}">${esc(n)}</wa-option>`).join('')}</wa-select>
  <wa-select id="fSrc" size="s" placeholder="All sources" with-clear value="${esc(S.lib.src)}">${Object.entries(S.srcNames).map(([k,v])=>`<wa-option value="${k}">${esc(v)}</wa-option>`).join('')}</wa-select></div></div>
  <div id="sres"><div class="empty small">Searches the full text of ${S.cat.filter(i=>i.txt).length.toLocaleString()} articles plus titles, summaries and tags.<br>Use "quotes" for an exact phrase.</div></div>`;
  const qi=$('#q'); let t;
  const doit=()=>{ clearTimeout(t); t=setTimeout(()=>doSearch(qi.value),250); };
  qi.addEventListener('input',doit); qi.addEventListener('wa-clear',()=>{ S.q=''; drawSearch(); });
  qi.addEventListener('keydown',e=>{ if(e.key==='Enter'){ qi.blur(); doSearch(qi.value);} });
  $('#fBook').addEventListener('change',e=>{ S.searchBook=e.target.value||''; doSearch(qi.value); });
  $('#fSrc').addEventListener('change',e=>{ S.lib.src=e.target.value||''; doSearch(qi.value); });
  if(S.q) doSearch(S.q); else setTimeout(()=>qi.focus(),50);
}
let searchSeq=0;
async function doSearch(q){ S.q=q; const my=++searchSeq; const box=$('#sres'); if(!box) return;
  if(!q.trim()){ box.innerHTML=''; return; }
  box.innerHTML='<div class="empty"><wa-spinner></wa-spinner></div>';
  let r; try{ r=await runSearch(q); }catch(e){ box.innerHTML=`<div class="empty">Search needs a connection the first time for these words.<br><span class="small">${esc(e.message)}</span></div>`; return; }
  if(my!==searchSeq) return;
  box.innerHTML=`<div class="sec-h">${r.res.length.toLocaleString()} results${r.partial?' (matching some words)':''}</div><div class="list" id="list"></div>`;
  const snips=new Map(); renderList($('#list'),r.res,snips);
  await pool(r.res.slice(0,25),6,async i=>{ const a=await article(i); if(my!==searchSeq) return; const s=snippet(a,r.terms,r.phrases); snips.set(i.id,s); const row=$(`#list .row[data-id="${CSS.escape(i.id)}"]`); if(row){ let p=row.querySelector('p'); if(!p){ p=document.createElement('p'); row.appendChild(p);} p.className='snip'; p.innerHTML=s; } });
}

/* ---------- Articles ---------- */
async function article(i){ if(S.art.has(i.id)) return S.art.get(i.id); const p=getEnc('a/'+i.k+'.bin'); S.art.set(i.id,p); p.catch(()=>S.art.delete(i.id)); return p; }
async function openDoc(id,annId){
  const i=S.byId.get(id); if(!i){ $('#doc').innerHTML='<div class="empty">Not found.</div>'; return; }
  if(!(S.doc&&S.doc.id===id)){
    $('#readTitle').textContent=''; $('#doc').innerHTML='<div class="empty"><wa-spinner style="font-size:28px"></wa-spinner></div>';
    let a; try{ a=await article(i); }catch(e){ $('#doc').innerHTML=`<div class="empty">This article isn't saved on this device yet. Connect to the internet to open it.</div>`; return; }
    S.doc={id,i,a,plain:a.paras.join(A.SEP),bases:A.paraBases(a.paras)};
    renderDoc(); $('#docWrap').scrollTop=0; updateSaveIcon();
    $$('#pane .row').forEach(r=>r.classList.toggle('active',r.dataset.id===id));
  }
  if(annId){ const m=$(`#doc mark[data-ids~="${CSS.escape(annId)}"]`); if(m){ m.scrollIntoView({block:'center'}); m.classList.add('flash'); setTimeout(()=>m.classList.remove('flash'),3500); } }
}
function renderDoc(){
  const {i,a}=S.doc; $('#readTitle').textContent=i.title;
  const orig=a.orig||a.url; $('#origBtn').href=orig;
  const isH=p=>p.length<70&&!/[.?!,;:”"]$/.test(p)&&/^[A-Z“"]/.test(p);
  const anns=docAnns();
  $('#doc').innerHTML=`<div class="hd"><div class="src">${esc(S.srcNames[i.src]||i.src)}${a.ref?' · '+esc(a.ref):''}</div><h1>${esc(a.title)}</h1>
   <div class="by">${esc(a.author)}${a.venue?`<br><i>${esc(a.venue)}</i>`:''}${a.year?' · '+esc(a.year):''}</div>
   <div class="tags">${i.books.map(b=>`<wa-tag size="s" variant="brand">${esc(bookName(b))}${b===i.books[0]&&i.ch.length?' '+i.ch.slice(0,6).join(', '):''}</wa-tag>`).join('')}${(a.tags||[]).slice(0,6).map(t=>`<wa-tag size="s">${esc(t)}</wa-tag>`).join('')}</div>
   <div class="links"><wa-button size="s" appearance="outlined" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer"><wa-icon slot="start" name="arrow-up-right-from-square"></wa-icon>Original</wa-button>${a.pdf?`<wa-button size="s" appearance="outlined" href="${esc(a.pdf)}" target="_blank" rel="noopener noreferrer"><wa-icon slot="start" name="file-pdf" variant="regular"></wa-icon>PDF</wa-button>`:''}</div></div>
   ${a.paras.length?(a.summary&&i.src!=='knowhy'?`<details class="summary"><summary>Summary</summary>${esc(a.summary)}</details>`:'')
     :`<wa-callout variant="${i.src==='bti'?'warning':'neutral'}" class="nobody"><wa-icon slot="icon" name="circle-info"></wa-icon>${i.src==='bti'?'This is a paid book from the Maxwell Institute, so only the citation and description are included. Use <b>Original</b> to buy or read it.':'Full text isn\'t saved for this item. Use <b>Original</b> or <b>PDF</b> to read it.'}</wa-callout>
      ${a.summary?`<p class="summary">${esc(a.summary)}</p>`:''}${a.quote?`<blockquote class="summary">${esc(a.quote)}</blockquote>`:''}${a.access?`<p class="summary quiet">${esc(a.access)}</p>`:''}`}
   <div class="body">${a.paras.map((p,k)=>`<p data-i="${k}"${isH(p)?' class="h"':''}>${paraHTML(k,anns)}</p>`).join('')}</div>
   <div class="foot">Source: <a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">${esc(a.url.replace(/^https?:\/\//,''))}</a>. Saved for personal study.</div>`;
}
function docAnns(){ const {id,plain}=S.doc; const out=[];
  for(const a of S.anns){ if(a.doc!==id||a.deleted) continue; const r=A.resolve(plain,a); a.orphan=!r; if(r){ a.rs=r.start; a.re=r.end; out.push(a);} } return out; }
function paraHTML(k,anns){ const {a,bases}=S.doc; const text=a.paras[k], base=bases[k];
  const mine=anns.filter(x=>x.re>base&&x.rs<base+text.length);
  if(!mine.length) return esc(text);
  return A.segments(text,base,mine).map(sg=>{ if(!sg.anns.length) return esc(sg.t);
    const col=[...sg.anns].reverse().find(x=>x.color&&x.color!=='none'); const u=sg.anns.some(x=>x.underline);
    const nend=sg.anns.some(x=>x.note&&x.re===base+sg.e);
    return `<mark class="a${col?' c-'+col.color:''}${u?' u':''}${nend?' nend':''}" data-ids="${sg.anns.map(x=>x.id).join(' ')}">${esc(sg.t)}</mark>`; }).join(''); }
function rerenderParas(){ const anns=docAnns(); $$('#doc p[data-i]').forEach(p=>{ p.innerHTML=paraHTML(+p.dataset.i,anns); }); }

/* ---------- Selection & annotations ---------- */
let selCache=null, selT;
function onSel(){ clearTimeout(selT); selT=setTimeout(()=>{
  const s=getSelection(); const doc=$('#doc');
  if(!S.doc||!s||s.isCollapsed||!s.rangeCount||!doc.contains(s.getRangeAt(0).commonAncestorContainer)){ if(!selKeep) { $('#selbar').hidden=true; selCache=null; } return; }
  const o=A.rangeToOffsets(s.getRangeAt(0),doc,S.doc.bases,S.doc.a.paras);
  if(!o){ $('#selbar').hidden=true; return; }
  selCache={doc:S.doc.id,...A.makeSelector(S.doc.plain,o.start,o.end)};
  // trim whitespace at edges
  const q=selCache.quote, l=q.length-q.trimStart().length, r=q.length-q.trimEnd().length;
  if(l||r) selCache={doc:S.doc.id,...A.makeSelector(S.doc.plain,o.start+l,o.end-r)};
  $('#selbar').hidden=!selCache.quote;
 },120); }
let selKeep=false;
document.addEventListener('selectionchange',onSel);
function uid(){ return Date.now().toString(36)+'-'+crypto.getRandomValues(new Uint32Array(1))[0].toString(36); }
async function createAnn(opts){ if(!selCache) return null; const now=Date.now();
  const a={id:uid(),doc:selCache.doc,start:selCache.start,end:selCache.end,quote:selCache.quote,prefix:selCache.prefix,suffix:selCache.suffix,color:opts.color||'none',underline:!!opts.underline,note:opts.note||'',created:now,updated:now,deleted:false};
  S.anns.push(a); await annPut(strip(a)); S.annCount=countAnns(); getSelection().removeAllRanges(); selCache=null; $('#selbar').hidden=true; rerenderParas(); syncSoon(); return a; }
const strip=a=>{ const {rs,re,orphan,...x}=a; return x; };
async function updateAnn(a,ch){ Object.assign(a,ch,{updated:Date.now()}); if(a.deleted) S.anns=S.anns.filter(x=>x!==a); await annPut(strip(a)); S.annCount=countAnns(); if(S.doc&&a.doc===S.doc.id) rerenderParas(); syncSoon(); }
function bindSelbar(){ const bar=$('#selbar');
  bar.addEventListener('pointerdown',e=>{ e.preventDefault(); selKeep=true; });
  bar.addEventListener('mousedown',e=>e.preventDefault());
  bar.addEventListener('click',async e=>{ const b=e.target.closest('button'); selKeep=false; if(!b||!selCache) return;
    if(b.dataset.color) await createAnn({color:b.dataset.color});
    else if(b.dataset.act==='underline') await createAnn({underline:true});
    else if(b.dataset.act==='note'){ const a=await createAnn({color:'yellow'}); if(a) openAnn(a,true); }
    else if(b.dataset.act==='copy'){ try{ await navigator.clipboard.writeText(selCache.quote); toast('Copied'); }catch(_){} } });
  $('#doc').addEventListener('click',e=>{ const m=e.target.closest('mark.a'); if(!m) return; const s=getSelection(); if(s&&!s.isCollapsed) return;
    const ids=m.dataset.ids.split(' '); const a=S.anns.find(x=>x.id===ids[ids.length-1]); if(a) openAnn(a); }); }
let dlgAnn=null;
function openAnn(a,focusNote){ dlgAnn=a; const d=$('#annDlg'); $('#annQuote').textContent=a.quote; $('#annNote').value=a.note||''; $('#annUnderline').checked=!!a.underline;
  $$('#annColors .sw').forEach(s=>s.classList.toggle('on',s.dataset.color===(a.color||'none')));
  d.label=a.note?'Note':'Highlight'; d.open=true; if(focusNote) setTimeout(()=>$('#annNote').focus(),350); }
function bindAnnDlg(){ const d=$('#annDlg');
  $('#annColors').addEventListener('click',e=>{ const b=e.target.closest('.sw'); if(!b||!dlgAnn) return; $$('#annColors .sw').forEach(s=>s.classList.toggle('on',s===b)); updateAnn(dlgAnn,{color:b.dataset.color}); });
  $('#annUnderline').addEventListener('change',e=>dlgAnn&&updateAnn(dlgAnn,{underline:e.target.checked}));
  $('#annDone').onclick=()=>d.open=false;
  d.addEventListener('wa-hide',e=>{ if(e.target!==d) return; if(dlgAnn&&($('#annNote').value!==(dlgAnn.note||''))) updateAnn(dlgAnn,{note:$('#annNote').value}); });
  $('#annDelete').onclick=async()=>{ if(dlgAnn){ const a=dlgAnn; dlgAnn=null; await updateAnn(a,{deleted:true}); } d.open=false; if(S.tab==='notes'&&!document.body.classList.contains('reading')) drawNotes(); }; }

/* ---------- Notes page ---------- */
function drawNotes(){
  setBar('Notes & Highlights');
  const f=S.notesFilter||'all', q=S.notesQ||'';
  let list=S.anns.filter(a=>!a.deleted&&(f==='all'||(f==='notes'?a.note:!a.note)));
  if(q) list=list.filter(a=>norm(a.quote+' '+a.note+' '+(S.byId.get(a.doc)?.title||'')).includes(norm(q)));
  const groups=new Map(); list.sort((a,b)=>b.updated-a.updated).forEach(a=>{ if(!groups.has(a.doc)) groups.set(a.doc,[]); groups.get(a.doc).push(a); });
  $('#pane').innerHTML=`<div class="toolbar"><wa-radio-group id="nf" orientation="horizontal" size="s" value="${f}"><wa-radio appearance="button" value="all">All</wa-radio><wa-radio appearance="button" value="notes">Notes</wa-radio><wa-radio appearance="button" value="hl">Highlights</wa-radio></wa-radio-group></div>
   <wa-input id="nq" size="s" type="search" placeholder="Filter notes" with-clear value="${esc(q)}"></wa-input>
   <div class="sec-h">${list.length} item${list.length===1?'':'s'} in ${groups.size} article${groups.size===1?'':'s'}</div>
   ${groups.size?[...groups].map(([doc,as])=>{ const i=S.byId.get(doc); return `<div class="ngroup"><h4 data-doc="${esc(doc)}">${esc(i?i.title:doc)}</h4>${as.sort((x,y)=>x.start-y.start).map(a=>`<div class="nitem" data-doc="${esc(doc)}" data-ann="${a.id}"><div class="bar-c c-${a.color}"></div><div><q class="${a.underline?'u':''}">${esc(a.quote.length>320?a.quote.slice(0,320)+'…':a.quote)}</q>${a.note?`<div class="note">${esc(a.note)}</div>`:''}<div class="when">${new Date(a.updated).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}${a.orphan?' · couldn\'t place in text':''}</div></div></div>`).join('')}</div>`; }).join('')
     :'<div class="empty">Select text in any article to highlight, underline or add a note. Everything you mark shows up here.</div>'}`;
  $('#nf').addEventListener('change',e=>{ S.notesFilter=e.target.value; drawNotes(); });
  $('#nq').addEventListener('input',e=>{ S.notesQ=e.target.value; clearTimeout(S.nqT); S.nqT=setTimeout(()=>{ drawNotes(); const el=$('#nq'); el.focus(); },300); });
  $('#nq').addEventListener('wa-clear',()=>{ S.notesQ=''; drawNotes(); });
  $('#pane').onclick=e=>{ const n=e.target.closest('[data-doc]'); if(!n) return; go('#/read/'+encodeURIComponent(n.dataset.doc)+(n.dataset.ann?'/'+n.dataset.ann:'')); };
}

/* ---------- Backup ---------- */
async function exportNotes(){ const all=await annAll(); const data={app:'bom-study',version:1,exported:new Date().toISOString(),annotations:all.map(a=>({...a,title:S.byId.get(a.doc)?.title}))};
  const name=`bom-study-notes-${new Date().toISOString().slice(0,10)}.json`; const file=new File([JSON.stringify(data,null,1)],name,{type:'application/json'});
  if(navigator.canShare&&navigator.canShare({files:[file]})){ try{ await navigator.share({files:[file],title:'Study notes backup'}); return; }catch(e){ if(e.name==='AbortError') return; } }
  const u=URL.createObjectURL(file); const l=document.createElement('a'); l.href=u; l.download=name; document.body.appendChild(l); l.click(); l.remove(); setTimeout(()=>URL.revokeObjectURL(u),5000); }
async function mergeIn(list){ const local=new Map((await annAll()).map(a=>[a.id,a])); const put=[]; let added=0,updated=0;
  for(const r of list){ if(!r||!r.id||!r.doc) continue; const {title,...a}=r; const l=local.get(a.id); if(!l){ put.push(a); added++; } else if((a.updated||0)>(l.updated||0)){ put.push(a); updated++; } }
  if(put.length) await annPut(put); S.anns=(await annAll()).filter(a=>!a.deleted); S.annCount=countAnns(); if(S.doc) rerenderParas(); return {added,updated}; }
async function importNotes(file){ try{ const d=JSON.parse(await file.text()); const r=await mergeIn(d.annotations||d); toast(`Imported: ${r.added} new, ${r.updated} updated`); syncSoon(); if(S.tab==='notes') drawNotes(); }catch(e){ toast('That file could not be read'); } }

/* ---------- Sync (private GitHub repo, encrypted) ---------- */
let syncT, syncing=false;
function syncSoon(ms=3000){ clearTimeout(syncT); syncT=setTimeout(()=>sync().catch(()=>{}),ms); }
async function syncCfg(){ return (await kvGet('sync'))||null; }
async function sync(manual){ const c=await syncCfg(); if(!c||!c.token||!c.repo) return manual&&setSyncStatus('Sync is not set up on this device.');
  if(syncing||!navigator.onLine) return; syncing=true; setSyncStatus('Syncing…');
  try{ for(let attempt=0;attempt<3;attempt++){
      const url=`https://api.github.com/repos/${c.repo}/contents/notes.enc`; const H={Authorization:'Bearer '+c.token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
      const r=await fetch(url+'?t='+Date.now(),{headers:H,cache:'no-store'}); let sha, remote=[];
      if(r.status===200){ const j=await r.json(); sha=j.sha; const pt=await decRaw(unb64(j.content)); remote=JSON.parse(td.decode(pt)).annotations||[]; }
      else if(r.status!==404) throw new Error('GitHub '+r.status+(r.status===401?' (token rejected)':r.status===403?' (no access to repo)':''));
      await mergeIn(remote);
      const all=await annAll(); const rm=new Map(remote.map(a=>[a.id,a.updated]));
      const changed=all.length!==remote.length||all.some(a=>rm.get(a.id)!==a.updated);
      if(!changed){ break; }
      const body={message:'sync '+new Date().toISOString(),content:b64(await encText(JSON.stringify({v:1,annotations:all})))}; if(sha) body.sha=sha;
      const p=await fetch(url,{method:'PUT',headers:{...H,'Content-Type':'application/json'},body:JSON.stringify(body)});
      if(p.ok) break; if(p.status===409||p.status===422) continue; throw new Error('GitHub '+p.status);
    }
    await kvSet('lastSync',Date.now()); setSyncStatus('Synced '+new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}));
    if(S.tab==='notes'&&!document.body.classList.contains('reading')&&!$('#nq:focus-within')) drawNotes();
  }catch(e){ setSyncStatus('Sync failed: '+e.message); } finally{ syncing=false; } }
function setSyncStatus(t){ S.syncStatus=t; const el=$('#syncStatus'); if(el) el.textContent=t; }
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible') syncSoon(300); else if(S.key) sync().catch(()=>{}); });
window.addEventListener('online',()=>syncSoon(500));

/* ---------- Settings ---------- */
async function drawSettings(){
  setBar('Settings'); const c=await syncCfg()||{}; const est=navigator.storage?.estimate?await navigator.storage.estimate():null;
  const saved=await savedCount();
  $('#pane').innerHTML=`<div class="settings">
  <wa-card><div class="stack"><strong>Sync between iPhone and iPad</strong>
    <div class="small quiet">Notes and highlights are encrypted on this device with your library passphrase, then stored in your private GitHub repository. Paste the same access token on each device.</div>
    <wa-input id="sRepo" label="Repository" size="s" value="${esc(c.repo||S.cfg.syncRepo||'')}" autocapitalize="off" autocorrect="off"></wa-input>
    <wa-input id="sTok" label="Access token" type="password" password-toggle size="s" value="${esc(c.token||'')}" autocapitalize="off" autocorrect="off" spellcheck="false"></wa-input>
    <div class="row2"><wa-button id="sSave" size="s" variant="brand">Save &amp; sync now</wa-button>${c.token?'<wa-button id="sOff" size="s" appearance="outlined">Turn off</wa-button>':''}</div>
    <div class="small quiet" id="syncStatus">${esc(S.syncStatus||(c.token?'Ready':'Not set up'))}</div></div></wa-card>
  <wa-card><div class="stack"><strong>Backup</strong>
    <div class="small quiet">${S.anns.length} notes and highlights on this device. Export a JSON file (AirDrop or Files works), and import it on another device to merge.</div>
    <div class="row2"><wa-button id="bExp" size="s" appearance="outlined"><wa-icon slot="start" name="file-export"></wa-icon>Export</wa-button><wa-button id="bImp" size="s" appearance="outlined"><wa-icon slot="start" name="file-import"></wa-icon>Import</wa-button></div></div></wa-card>
  <wa-card><div class="stack"><strong>Offline</strong>
    <div class="small quiet">Articles you open are kept for offline reading. ${saved} saved articles${est?` · ${(est.usage/1e6).toFixed(0)} MB used`:''}.</div>
    <div class="row2"><wa-button id="oAll" size="s" appearance="outlined"><wa-icon slot="start" name="cloud-arrow-down"></wa-icon>Download whole library (~${Math.round((S.cfg.size||64e6)/1e6)} MB)</wa-button></div>
    <wa-progress-bar id="oProg" value="0" hidden></wa-progress-bar></div></wa-card>
  <wa-card><div class="stack"><strong>Reading</strong><wa-button id="tOpen" size="s" appearance="outlined"><wa-icon slot="start" name="font"></wa-icon>Text size, font and theme</wa-button></div></wa-card>
  <wa-card><div class="stack"><strong>About</strong><div class="small quiet">${S.cat.length.toLocaleString()} items · ${S.cat.filter(i=>i.txt).length.toLocaleString()} with full text. Sources: Scripture Central (Book of Mormon Central) KnoWhys, Evidence and archive; Journal of Book of Mormon Studies; Interpreter; Maxwell Institute; FARMS-era book chapters; Mormon Studies Review; Insights; Encyclopedia of Mormonism. Brief Theological Introductions are citation and summary only. Library version ${esc(S.cfg.v)}.</div>
   <wa-button id="lock" size="s" appearance="outlined" variant="danger">Lock this device</wa-button></div></wa-card></div>`;
  $('#sSave').onclick=async()=>{ const repo=$('#sRepo').value.trim(), token=$('#sTok').value.trim(); if(!repo||!token){ toast('Enter the repository and token'); return; } await kvSet('sync',{repo,token}); await sync(true); };
  $('#sOff')&&($('#sOff').onclick=async()=>{ await kvDel('sync'); setSyncStatus('Not set up'); drawSettings(); });
  $('#bExp').onclick=exportNotes; $('#bImp').onclick=()=>$('#importFile').click();
  $('#oAll').onclick=downloadAll; $('#tOpen').onclick=openType;
  $('#lock').onclick=async()=>{ await kvDel('key'); location.reload(); };
}
async function savedCount(){ try{ const c=await caches.open('bom-articles'); return (await c.keys()).length; }catch(e){ return 0; } }
async function downloadAll(){ const btn=$('#oAll'), pr=$('#oProg'); btn.loading=true; pr.hidden=false; const c=await caches.open('bom-articles'); const have=new Set((await c.keys()).map(r=>new URL(r.url).pathname));
  const urls=S.cat.map(i=>new URL('a/'+i.k+'.bin',location.href)).filter(u=>!have.has(u.pathname)).concat(S.cfg.shards.map(s=>new URL('s/'+s+'.bin',location.href)));
  let done=0; await pool(urls,6,async u=>{ const r=await fetch(u); if(r.ok&&!u.pathname.includes('/s/')) await c.put(u,r.clone()); done++; if(done%20===0||done===urls.length){ pr.value=Math.round(100*done/urls.length); } });
  btn.loading=false; toast('Library downloaded for offline use'); drawSettings(); }

/* ---------- Reader chrome ---------- */
async function updateSaveIcon(){ if(!S.doc) return; const c=await caches.open('bom-saved'); const hit=await c.match(new URL('a/'+S.doc.i.k+'.bin',location.href)); $('#saveIcon').setAttribute('variant',hit?'solid':'regular'); $('#saveIcon').label=hit?'Saved offline':'Save offline'; }
async function toggleSave(){ if(!S.doc) return; const u=new URL('a/'+S.doc.i.k+'.bin',location.href); const c=await caches.open('bom-saved');
  if(await c.match(u)){ await c.delete(u); toast('Removed from saved'); } else { await c.add(u); toast('Saved for offline'); } updateSaveIcon(); }
function openType(){ $('#fontSize').value=prefs.size; $('#lineH').value=prefs.lh; $('#fontFam').value=prefs.fam; $('#themeSel').value=prefs.theme; $('#typeDrawer').open=true; }
function toast(msg){ let t=$('#toastEl'); if(!t){ t=document.createElement('wa-callout'); t.id='toastEl'; t.setAttribute('variant','brand'); t.style.cssText='position:fixed;z-index:60;left:50%;transform:translateX(-50%);top:calc(var(--sat) + 60px);max-width:90vw;box-shadow:0 8px 24px rgba(0,0,0,.18)'; document.body.appendChild(t);} t.textContent=msg; t.hidden=false; clearTimeout(t._t); t._t=setTimeout(()=>t.hidden=true,2200); }
function bindUI(){
  $$('#tabs button').forEach(b=>b.onclick=()=>{ const t=b.dataset.tab; if(t==='lib') go(S.tab==='lib'&&!document.body.classList.contains('reading')?'#/lib':(S.lib.book?'#/lib/'+S.lib.book+(S.lib.ch?'/'+S.lib.ch:''):'#/lib')); else go('#/'+t); });
  $('#backBtn').onclick=()=>{ if(history.state&&history.state.inApp) history.back(); else go(S.tab==='lib'&&S.lib.book?'#/lib/'+S.lib.book:'#/'+S.tab,true); };
  $('#typeBtn').onclick=openType; $('#saveBtn').onclick=toggleSave;
  $('#fontSize').addEventListener('input',e=>{ prefs.size=+e.target.value; savePrefs(); });
  $('#lineH').addEventListener('input',e=>{ prefs.lh=+e.target.value; savePrefs(); });
  $('#fontFam').addEventListener('change',e=>{ prefs.fam=e.target.value; savePrefs(); });
  $('#themeSel').addEventListener('change',e=>{ prefs.theme=e.target.value; savePrefs(); });
  $('#importFile').addEventListener('change',e=>{ const f=e.target.files[0]; if(f) importNotes(f); e.target.value=''; });
  bindSelbar(); bindAnnDlg();
  matchMedia('(min-width: 768px)').addEventListener('change',()=>{ if(document.body.classList.contains('reading')&&wide()) drawSide(); });
}
window.__app={S,A,runSearch,sync,mergeIn,annAll};
boot();
