const V='20774c86c3';
const SHELL=["./", "index.html", "app.js", "anchor.js", "app.css", "manifest.webmanifest", "config.json", "catalog.bin", "icons/icon-180.png", "icons/icon-192.png", "icons/fa/svgs/solid/arrow-up-right-from-square.svg", "icons/fa/svgs/solid/book-bible.svg", "icons/fa/svgs/regular/bookmark.svg", "icons/fa/svgs/solid/bookmark.svg", "icons/fa/svgs/solid/check.svg", "icons/fa/svgs/solid/chevron-down.svg", "icons/fa/svgs/solid/chevron-left.svg", "icons/fa/svgs/solid/circle-info.svg", "icons/fa/svgs/regular/circle-xmark.svg", "icons/fa/svgs/solid/circle-xmark.svg", "icons/fa/svgs/solid/cloud-arrow-down.svg", "icons/fa/svgs/regular/copy.svg", "icons/fa/svgs/solid/eye.svg", "icons/fa/svgs/solid/eye-slash.svg", "icons/fa/svgs/solid/file-export.svg", "icons/fa/svgs/solid/file-import.svg", "icons/fa/svgs/regular/file-pdf.svg", "icons/fa/svgs/solid/font.svg", "icons/fa/svgs/solid/gear.svg", "icons/fa/svgs/solid/highlighter.svg", "icons/fa/svgs/solid/magnifying-glass.svg", "icons/fa/svgs/regular/note-sticky.svg", "icons/fa/svgs/solid/underline.svg", "icons/fa/svgs/solid/xmark.svg"];
const SHELL_CACHE='bom-shell-'+V;
self.addEventListener('install',e=>{ e.waitUntil(caches.open(SHELL_CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())); });
self.addEventListener('activate',e=>{ e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('bom-shell-')&&k!==SHELL_CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
async function fromCaches(req,names){ for(const n of names){ const r=await (await caches.open(n)).match(req,{ignoreSearch:true}); if(r) return r; } return null; }
async function cacheFirst(req,store,also=[]){ const hit=await fromCaches(req,[...also,store]); if(hit) return hit; const r=await fetch(req); if(r.ok) (await caches.open(store)).put(req,r.clone()); return r; }
async function swr(req,store){ const c=await caches.open(store); const hit=await c.match(req,{ignoreSearch:true}); const net=fetch(req).then(r=>{ if(r.ok) c.put(req,r.clone()); return r; }).catch(()=>null); return hit||(await net)||new Response('offline',{status:503}); }
async function netFirst(req,store,key){ try{ const r=await fetch(req,{cache:'no-cache'}); if(r.ok) (await caches.open(store)).put(key||req,r.clone()); return r; }catch(e){ const hit=await (await caches.open(store)).match(key||req,{ignoreSearch:true}); return hit||new Response('offline',{status:503}); } }
self.addEventListener('fetch',e=>{
  const req=e.request; if(req.method!=='GET') return; const u=new URL(req.url); if(u.origin!==location.origin) return;
  const scope=new URL(self.registration.scope).pathname; const p=u.pathname.slice(scope.length);
  if(req.mode==='navigate') return e.respondWith(netFirst(req,SHELL_CACHE,new URL('index.html',self.registration.scope).href));
  if(p==='config.json') return e.respondWith(netFirst(req,SHELL_CACHE));
  if(p.startsWith('a/')) return e.respondWith(cacheFirst(req,'bom-articles',['bom-saved']));
  if(p.startsWith('s/')) return e.respondWith(cacheFirst(req,'bom-search'));
  e.respondWith(swr(req,SHELL_CACHE));
});
