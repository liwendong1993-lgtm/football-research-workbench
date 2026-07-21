const CACHE='football-workbench-v17';
const ASSETS=['./','./index.html','./styles.css?v=20260721-review3','./combo-utils.js?v=20260721-review3','./scan-utils.js?v=20260721-review3','./review-utils.js?v=20260721-review3','./app.js?v=20260721-review3','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin)return;
  event.respondWith(fetch(request,{cache:'no-store'}).then(response=>{
    if(response.ok)caches.open(CACHE).then(cache=>cache.put(request,response.clone()));
    return response;
  }).catch(async()=>await caches.match(request)||(request.mode==='navigate'?await caches.match('./index.html'):Response.error())));
});
