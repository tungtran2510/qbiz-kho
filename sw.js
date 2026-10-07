const CACHE='qbiz-kho-v24-20261007-image-file-optimizer';
const ASSETS=['./','./index.html','./styles.css?v=20261003-v22-brand-refresh','./manifest.webmanifest','./src/app.js?v=20261003-v22-brand-refresh','./src/config.js','./src/db.js','./src/engine.js','./src/sync.js','./src/backup-drive.js','./src/auth.js','./src/prefetcher.js','./src/image-optimizer.js','./src/storage-monitor.js','./src/ai/index.js','./src/ai/vietnamese-nlp.js','./src/ai/context.js','./src/ai/policy.js','./src/ai/proposals.js','./src/ai/tools.js','./src/ai/skills.js','./src/ai/providers.js','./src/ai/router.js','./src/ai/memory.js','./src/ai/audit.js','./src/ai/ui.js','./vendor/qr-code-styling.js','./icons/icon-192.png','./icons/icon-512.png','./icons/logo-master.svg','./icons/apple-touch-icon.png','./icons/favicon-32x32.png','./favicon.ico'];
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
