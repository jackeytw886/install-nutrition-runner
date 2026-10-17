const VERSION='nutri-motion-v2.0.2',PREFIX='nutri-motion-';
const ROOT=new URL('./',self.location).href,MP='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/';
const MODEL='https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const LOCAL=['./','index.html','style.css?v=2.0.2','camera.css?v=2.0.2','engine.js?v=2.0.2','core.js?v=2.0.2','game.js?v=2.0.2','pose-core.js?v=2.0.2','camera.js?v=2.0.2','pose-worker.js?v=2.0.2'];
const ASSETS=[...LOCAL.map(p=>new URL(p,ROOT).href),MP+'vision_bundle.mjs',...['vision_wasm_internal.js','vision_wasm_internal.wasm','vision_wasm_nosimd_internal.js','vision_wasm_nosimd_internal.wasm'].map(p=>MP+'wasm/'+p),MODEL];
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith(PREFIX)&&key!==VERSION)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('fetch',event=>{const req=event.request;if(req.method!=='GET'||!ASSETS.includes(req.url))return;
  event.respondWith((async()=>{const cache=await caches.open(VERSION),isPage=req.mode==='navigate',isLocal=new URL(req.url).origin===self.location.origin;if(!isPage&&!isLocal){const saved=await cache.match(req.url);if(saved)return saved;}
    try{const response=await fetch(req);if(response.ok&&response.type!=='opaque'){
      if(!isPage)await cache.put(req.url,response.clone());else{const text=await response.clone().text();if(text.includes('id="game-canvas"'))await cache.put(req.url,response.clone());}}
      return response;
    }catch(error){const saved=await cache.match(req.url);if(saved)return saved;throw error;}
  })());
});
self.addEventListener('message',event=>{if(event.data?.type!=='prepare')return;const port=event.ports[0];event.waitUntil((async()=>{try{const cache=await caches.open(VERSION);for(let i=0;i<ASSETS.length;i++){const url=ASSETS[i];let response=await cache.match(url);if(!response){response=await fetch(url,{credentials:new URL(url).origin===self.location.origin?'same-origin':'omit',cache:'reload'});if(!response.ok||response.type==='opaque')throw new Error('download');if(url===ROOT||url.endsWith('/index.html')){const text=await response.clone().text();if(!text.includes('id="game-canvas"'))throw new Error('signin');}await cache.put(url,response);}port.postMessage({done:i+1,total:ASSETS.length});}port.postMessage({ready:true});}catch(error){port.postMessage({error:String(error.message||error)});}})());});
