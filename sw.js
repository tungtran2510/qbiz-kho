const CACHE='qbiz-kho-v18-20260927-pos-discount';
const ASSETS=['./','./index.html','./styles.css?v=20260927-v18-pos-discount','./manifest.webmanifest','./src/app.js?v=20260927-v18-pos-discount','./src/config.js','./src/db.js','./src/engine.js','./src/sync.js','./src/ai/index.js','./src/ai/vietnamese-nlp.js','./src/ai/context.js','./src/ai/policy.js','./src/ai/proposals.js','./src/ai/tools.js','./src/ai/skills.js','./src/ai/providers.js','./src/ai/router.js','./src/ai/memory.js','./src/ai/audit.js','./src/ai/ui.js','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url);
  const isCode=url.pathname.endsWith('.html')||url.pathname.endsWith('.js')||url.pathname.endsWith('.css')||url.pathname==='/'||url.search.includes('v=');
  if(isCode){
    e.respondWith(fetch(e.request).then(r=>{if(r&&r.status===200){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return r;}).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html'))));
    return;
  }
  e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r;})));
});
