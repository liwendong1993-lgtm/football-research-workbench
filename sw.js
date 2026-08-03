const CACHE='football-workbench-v26';
const POSTER_CACHE='football-poster-temp-v1';
const ASSETS=['./','./index.html','./styles.css?v=20260803-quark-http3','./combo-utils.js?v=20260803-quark-http3','./scan-utils.js?v=20260803-quark-http3','./review-utils.js?v=20260803-quark-http3','./app.js?v=20260803-quark-http3','./manifest.webmanifest','./icon.svg'];

self.addEventListener('install',event=>event.waitUntil(
  caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())
));

self.addEventListener('activate',event=>event.waitUntil(
  caches.keys().then(keys=>Promise.all(
    keys.filter(key=>key!==CACHE&&key!==POSTER_CACHE).map(key=>caches.delete(key))
  )).then(()=>self.clients.claim())
));

function posterStableUrl(urlPath){
  const abs=new URL(urlPath||'./__poster__/save.jpg',self.registration.scope);
  return abs.origin+abs.pathname;
}

self.addEventListener('message',event=>{
  const data=event.data||{};
  if(data.type!=='STORE_POSTER')return;
  event.waitUntil((async()=>{
    try{
      const contentType=data.contentType||'image/jpeg';
      const filename=String(data.filename||'poster.jpg').replace(/[^\w.\-\u4e00-\u9fff]+/g,'_');
      if(!data.buffer)throw new Error('missing buffer');
      const stable=posterStableUrl(data.urlPath||`./__poster__/${filename}`);
      const base=posterStableUrl('./__poster__/save.jpg');
      const body=data.buffer instanceof ArrayBuffer?data.buffer:await new Response(data.buffer).arrayBuffer();
      const headers={
        'Content-Type':contentType,
        'Content-Length':String(body.byteLength),
        'Cache-Control':'no-store, no-cache, must-revalidate',
        'Content-Disposition':`inline; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
      };
      const response=new Response(body,{status:200,headers});
      const cache=await caches.open(POSTER_CACHE);
      await cache.put(stable,response.clone());
      await cache.put(base,response.clone());
      const reply={type:'POSTER_STORED',url:stable,ok:true};
      if(event.ports&&event.ports[0])event.ports[0].postMessage(reply);
      else if(event.source)event.source.postMessage(reply);
    }catch(error){
      const reply={type:'POSTER_STORED',ok:false,error:String(error&&error.message||error)};
      if(event.ports&&event.ports[0])event.ports[0].postMessage(reply);
      else if(event.source)event.source.postMessage(reply);
    }
  })());
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;

  if(url.pathname.includes('/__poster__/')){
    event.respondWith((async()=>{
      const cache=await caches.open(POSTER_CACHE);
      const stable=url.origin+url.pathname;
      let res=await cache.match(stable);
      if(!res)res=await cache.match(request);
      if(!res){
        const keys=await cache.keys();
        const hit=keys.find(k=>{
          try{return new URL(k.url).pathname===url.pathname}catch(_){return false}
        });
        if(hit)res=await cache.match(hit);
      }
      if(!res){
        const keys=await cache.keys();
        if(keys[0])res=await cache.match(keys[0]);
      }
      if(res)return res;
      return new Response('Poster not ready',{status:404,headers:{'Content-Type':'text/plain; charset=utf-8'}});
    })());
    return;
  }

  event.respondWith(
    fetch(request,{cache:'no-store'}).then(response=>{
      if(response.ok)caches.open(CACHE).then(cache=>cache.put(request,response.clone()));
      return response;
    }).catch(async()=>await caches.match(request)||(request.mode==='navigate'?await caches.match('./index.html'):Response.error()))
  );
});
