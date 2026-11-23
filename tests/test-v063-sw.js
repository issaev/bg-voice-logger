// Simulate service-worker install with a stale cached HTML shell. The new build
// must still warm the correct versioned JS/CSS and retain exact-query keys.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(__dirname+'/../assets/sw.js','utf8');
const listeners={};const entries=new Map();const BV_CACHE='bgvl-0.6.3-test-assets';
const nextJs='https://site.example/wp-content/plugins/bg-voice-logger/assets/app.js?ver=0.6.3-new';
const oldJs='https://site.example/wp-content/plugins/bg-voice-logger/assets/app.js?ver=0.6.2-old';
const nextCss='https://site.example/wp-content/plugins/bg-voice-logger/assets/app.css?ver=0.6.3-new';
const fakeResponse=(body)=>({ok:true,status:200,clone(){return fakeResponse(body);},async text(){return body;}});
const cacheStore=name=>{
 if(!entries.has(name))entries.set(name,new Map());
 const map=entries.get(name);
 return {async put(key,value){map.set(typeof key==='string'?key:key.url,value);},
   async match(key){return map.get(typeof key==='string'?key:key.url)||null;}};
};
const caches={open:async name=>cacheStore(name),keys:async()=>Array.from(entries.keys()),
  delete:async name=>entries.delete(name),
  async match(key){for(const m of entries.values()){const got=m.get(key.url||key);if(got)return got;}return null;}};
let networkOn=true;
const fetch=async (request)=>{
 if(!networkOn)throw Error('offline');
 const url=request.url||request;
 if(url==='https://site.example/dka/')return fakeResponse(`<html><script src="${nextJs}"></script></html>`);
 return fakeResponse('JS or CSS bytes');
};
const self={BVLOG_CACHE_ID:BV_CACHE,BVLOG_APP_URL:'https://site.example/dka/',BVLOG_REQUIRED_ASSETS:[nextJs,nextCss],
 location:{origin:'https://site.example'},clients:{claim:async()=>{}},skipWaiting:async()=>{},
 addEventListener:(event,handler)=>listeners[event]=handler};
vm.runInNewContext(source,{self,URL,caches,fetch,Response:{error:()=>({ok:false})},console});
(async()=>{
 await new Promise((resolve,reject)=>listeners.install({waitUntil:p=>p.then(resolve,reject)}));
 const store=entries.get(BV_CACHE);
 assert.ok(store.has(nextJs),'New JS URL not cached despite stale HTML');
 assert.ok(store.has(nextCss),'New CSS URL not cached despite stale HTML');
 assert.ok(!store.has(oldJs),'Stale JS must not be cached as part of new build');
 assert.ok(store.has(nextJs),'New JS must be cached under its full URL');
 const assetReq={method:'GET',url:nextJs,mode:'no-cors'};
 let responded;
 networkOn=false;
 listeners.fetch({request:assetReq,respondWith:p=>responded=p});
 assert.ok(await responded,'Offline exact-query asset should resolve from cache');
 const missingReq={method:'GET',url:nextJs.replace('new','some-other-build'),mode:'no-cors'};
 responded=undefined;listeners.fetch({request:missingReq,respondWith:p=>responded=p});
 const result=await responded;
 assert.strictEqual(result.ok,false,'Cache must not ignore query params for unknown build');
 console.log('PASS v0.6.3 SW: exact-query matching, stale HTML defense, offline fallback.');
})().catch(e=>{console.error(e);process.exit(1);});
