/* BG Voice Logger PWA: cache app shell, local plugin assets and core React deps.
 * No REST/Google API operation is ever cached as a successful write.
 * IndexedDB stores offline operations separately from the service-worker cache.
 */
const BV_CACHE = self.BVLOG_CACHE_ID || 'bgvl-fallback-assets';
const BV_APP = new URL(self.BVLOG_APP_URL || '/', self.location.origin);
const BV_APP_PATH = BV_APP.pathname.endsWith('/') ? BV_APP.pathname : BV_APP.pathname + '/';
const BV_CORE = /\/wp-includes\/js\/(dist|vendor)\//;
function allowedAsset(url) {
  return url.origin === self.location.origin &&
    (url.pathname.includes('/wp-content/plugins/bg-voice-logger/assets/') || BV_CORE.test(url.pathname));
}
async function warmApp() {
  const cache = await caches.open(BV_CACHE);
  try {
    const response = await fetch(BV_APP.href,{credentials:'include',cache:'no-store'});
    if (!response.ok) return false;
    const html = await response.clone().text();
    const urls = Array.from(html.matchAll(/(?:src|href)=["']([^"']+)["']/g))
      .map(x=>new URL(x[1],BV_APP.href))
      .filter(allowedAsset);
    const required = (self.BVLOG_REQUIRED_ASSETS||[])
      .map(value=>new URL(value,BV_APP.href)).filter(allowedAsset);
    // If a CDN returned an old HTML shell, do not label it as the new offline
    // build. Older caches remain available until an up-to-date shell arrives.
    if(required.length && !urls.some(u=>u.href===required[0].href)) return false;
    for(const u of required){
      if(!urls.some(existing=>existing.href===u.href))urls.push(u);
    }
    await Promise.all(urls.map(async u=>{
      try {const r=await fetch(u.href,{credentials:'same-origin',cache:'no-cache'});if(r.ok)await cache.put(u.href,r);}catch(e){}
    }));
    for(const u of required){if(!await cache.match(u.href,{ignoreSearch:false}))return false;}
    await cache.put(BV_APP_PATH,response);
    return true;
  } catch (e) { return false; }
}
self.addEventListener('install', e => e.waitUntil(warmApp().then(()=>self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil((async () => {
  const keys = await caches.keys();
  const current = await caches.open(BV_CACHE);
  // If the new shell could not be cached (e.g. offline during update), keep
  // older caches so that existing offline app pages remain available.
  if (await current.match(BV_APP_PATH)) {
    await Promise.all(keys.filter(k => k.startsWith('bgvl-') && k !== BV_CACHE).map(k => caches.delete(k)));
  }
  await self.clients.claim();
})()));
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/wp-json/') || url.pathname.startsWith('/wp-admin/')) return;
  if (req.mode === 'navigate' && (url.pathname === BV_APP_PATH || url.pathname === BV_APP.pathname)) {
    e.respondWith(fetch(req,{cache:'no-store'}).then(async response => {
      if (response.ok) {const cache=await caches.open(BV_CACHE);await cache.put(BV_APP_PATH,response.clone());}
      return response;
    }).catch(async () => {
      const cache=await caches.open(BV_CACHE);
      if (await cache.match(BV_APP_PATH)) return cache.match(BV_APP_PATH);
      for(const name of (await caches.keys()).filter(k=>k.startsWith('bgvl-')&&k!==BV_CACHE)) {
        const older=await caches.open(name);const page=await older.match(BV_APP_PATH);if(page)return page;
      }
      return new Response('BG Voice Logger offline page is not cached. Open it once while online.',{status:503,headers:{'Content-Type':'text/plain'}});
    }));
    return;
  }
  if (allowedAsset(url)) {
    e.respondWith(fetch(req).then(async response => {
      if (response.ok) {const cache=await caches.open(BV_CACHE);await cache.put(req,response.clone());}
      return response;
    }).catch(async()=> (await caches.match(req,{ignoreSearch:false})) || Response.error()));
  }
});
