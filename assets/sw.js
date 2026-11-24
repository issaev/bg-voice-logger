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

/* v0.8.0: one-shot Background Sync. The worker independently obtains the current
 * same-origin session; no secret, cookie value, CSRF, document data or user ID is
 * ever passed via postMessage, stored in CacheStorage or written to logs.
 * Browser scheduling is best-effort; iOS/Safari have no SyncManager support.
 */
const BV_SYNC_TAG = 'bvlog-outbox-v1';
const BV_SYNC_DB_VERSION = 2;
const BV_LOCK_DB = 'bg-voice-logger-sync-leases-v1';
const BV_SYNC_LEASE_MS = 180000;
const BV_BG_MAX_ATTEMPTS = 5;
const BV_BG_MAX_OPS = 3;
const BV_BG_MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const BV_BG_CHUNK = 262144;

function bgUrl(value) {
  if (!value) return null;
  const url = new URL(value, self.location.origin);
  if (url.origin !== self.location.origin || url.protocol !== 'https:') return null;
  return url;
}
function bgDBName(session) {
  if (!session || !session.authenticated || !session.identity) return null;
  const identity = session.identity;
  if (session.mode === 'google' && identity.kind === 'google' &&
      /^[0-9]{6,40}$/.test(String(identity.sub || '')))
    return 'bg-voice-logger-queue-v3-google-' + identity.sub;
  if (identity.kind === 'wordpress' && /^wp:[0-9]{1,12}$/.test(String(identity.sub || '')))
    return 'bg-voice-logger-queue-v2-user-' + identity.sub.slice(3);
  if (session.mode === 'public' && identity.kind === 'public')
    return 'bg-voice-logger-queue-v2-user-0';
  return null;
}
async function bgSession() {
  const base = bgUrl(self.BVLOG_API_ROOT);
  if (!base) return null;
  const response = await fetch(new URL('auth/session?background=1', base).href,
    {credentials:'same-origin',cache:'no-store',redirect:'error'});
  if (!response.ok) return null;
  const session = await response.json();
  const dbName = bgDBName(session);
  if (!dbName) return null;
  const headers = {'Content-Type':'application/json'};
  if (session.identity.kind === 'google') {
    if (!/^[a-f0-9]{48}$/.test(String(session.csrf || ''))) return null;
    headers['X-BVLOG-CSRF'] = session.csrf;
  } else if (session.identity.kind === 'wordpress') {
    const url = bgUrl(self.BVLOG_NONCE_URL);
    if (!url) return null;
    const nonceResponse = await fetch(url.href,{credentials:'same-origin',cache:'no-store',redirect:'error'});
    if (!nonceResponse.ok) return null;
    const reply = await nonceResponse.json();
    if (reply.success !== true || !/^[A-Za-z0-9]+$/.test(String(reply.data?.nonce || ''))) return null;
    headers['X-WP-Nonce'] = reply.data.nonce;
  }
  return {base,headers,dbName};
}
function bgOpenDB(name) {
  return new Promise((resolve,reject)=>{
    const req = indexedDB.open(name,BV_SYNC_DB_VERSION);
    req.onblocked=()=>reject(new Error('DB version blocked'));
    req.onerror=()=>reject(req.error || new Error('DB open failed'));
    req.onupgradeneeded=()=>{
      const db=req.result;
      for(const [store,key] of [['queue','op_id'],['media','media_id'],['snapshots','id']])
        if(!db.objectStoreNames.contains(store))db.createObjectStore(store,{keyPath:key});
    };
    req.onsuccess=()=>resolve(req.result);
  });
}
function bgGetAll(db,store) {
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(store,'readonly');
    let result=[];
    const req=tx.objectStore(store).getAll();
    req.onsuccess=()=>{result=req.result || [];};
    tx.oncomplete=()=>resolve(result);
    tx.onabort=()=>reject(tx.error || new Error('DB read aborted'));
  });
}
function bgGet(db,store,key) {
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(store,'readonly');
    let result;
    const req=tx.objectStore(store).get(key);
    req.onsuccess=()=>{result=req.result;};
    tx.oncomplete=()=>resolve(result);
    tx.onabort=()=>reject(tx.error || new Error('DB read aborted'));
  });
}
async function bgLease(scope,owner,release=false) {
  const db=await new Promise((resolve,reject)=>{
    const req=indexedDB.open(BV_LOCK_DB,1);
    req.onupgradeneeded=()=>{
      if(!req.result.objectStoreNames.contains('locks'))req.result.createObjectStore('locks',{keyPath:'id'});
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error('Sync lock unavailable'));
    req.onblocked=()=>reject(new Error('Sync lock blocked'));
  });
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('locks','readwrite');
    const store=tx.objectStore('locks');
    let held=false;
    const req=store.get(scope);
    req.onsuccess=()=>{
      const old=req.result;
      if(release){
        if(old && old.owner===owner){store.delete(scope);held=true;}
      }else if(!old || old.owner===owner || Number(old.expires||0)<Date.now()){
        store.put({id:scope,owner,expires:Date.now()+BV_SYNC_LEASE_MS});held=true;
      }
    };
    tx.oncomplete=()=>{db.close();resolve(held);};
    tx.onabort=()=>{db.close();reject(tx.error || new Error('Sync lease aborted'));};
  });
}
function bgSaveWork(db,work) {
  // State and associated media deletion are one atomic transaction, as in app.js.
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(['queue','media'],'readwrite');
    const q=tx.objectStore('queue'),media=tx.objectStore('media');
    let saved=false;
    const req=q.get(work.op_id);
    req.onsuccess=()=>{
      const current=req.result;
      if(!current || current.kind!==work.kind || current.doc_id!==work.doc_id ||
         ['cancelled','synced','error','conflict','voice_review','review'].includes(current.state))return;
      // Respect newer user edits made while a network request was in flight.
      if(current.text!==work.__original_text || current.value!==work.__original_value)return;
      const value={...work};
      delete value.__original_text;delete value.__original_value;
      if(value.state==='synced'){
        for(const field of ['blob','preview_blob']){
          const key=field+'_media_id';
          if(value[key])media.delete(value[key]);
          delete value[field];delete value[key];delete value[field+'_size'];delete value[field+'_mime'];
        }
      }
      q.put(value);saved=true;
    };
    tx.oncomplete=()=>resolve(saved);
    tx.onabort=()=>reject(tx.error || new Error('Sync queue update aborted'));
  });
}
function bgPayload(work) {
  const payload={...work};
  for(const key of ['state','audio','error','created','current','mic_signal','quality',
    'blob','preview_blob','blob_media_id','preview_blob_media_id','blob_size',
    'preview_blob_size','blob_mime','preview_blob_mime','parts_done',
    'attempts','next_retry','upload_started','__original_text','__original_value',
    'doc_name','stt_provider','stt_started','stt_error','stt_retry_at',
    'stt_attempts','transcript','voice_clip'])delete payload[key];
  return payload;
}
async function bgBytes(db,work,field='blob') {
  if(work[field] instanceof Blob)return new Uint8Array(await work[field].arrayBuffer());
  if(!work[field+'_media_id'])return null;
  const saved=await bgGet(db,'media',work[field+'_media_id']);
  if(!saved || !(saved.bytes instanceof ArrayBuffer) || saved.bytes.byteLength!==saved.size)return null;
  return new Uint8Array(saved.bytes);
}
function bgBase64(bytes) {
  let text='';
  for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(text);
}
async function bgPost(session,path,payload) {
  const endpoint=new URL(path,session.base);
  if(endpoint.origin !== self.location.origin)throw new Error('Invalid API origin');
  const response=await fetch(endpoint.href,{method:'POST',credentials:'same-origin',cache:'no-store',
    redirect:'error',headers:session.headers,body:JSON.stringify(payload)});
  let data;
  try{data=await response.json();}catch(e){
    const error=new Error('Server response invalid');error.status=response.status;throw error;
  }
  if(!response.ok){
    const error=new Error('Server refused upload');error.status=response.status;
    throw error;
  }
  return data;
}
function bgTransient(error) {
  const status=Number(error&&error.status||0);
  return !status || [408,424,429,500,502,503,504].includes(status) || status>=500;
}
async function bgDrain() {
  const session=await bgSession();
  if(!session)return false; // No active operator. Never replay another user's outbox.
  const db=await bgOpenDB(session.dbName);
  const owner='sw-'+Math.random().toString(16).slice(2)+Date.now().toString(16);
  let acquired=false,changed=false;
  try{
    acquired=await bgLease(session.dbName,owner);
    if(!acquired)throw new Error('A page is already draining the queue');
    const items=(await bgGetAll(db,'queue')).sort((a,b)=>String(a.created||'').localeCompare(String(b.created||'')));
    let count=0;
    for(const original of items){
      if(count>=BV_BG_MAX_OPS)break;
      if(!['pending','sending'].includes(original.state) || original.kind==='audio')continue;
      if(original.next_retry && Date.now()<Date.parse(original.next_retry))continue;
      if(!['log','field','add_row','log_change','photo','audio_upload'].includes(original.kind))continue;
      if(!await bgLease(session.dbName,owner))throw new Error('Sync lease lost');
      const parentId=original.kind==='photo'?original.log_op_id:
        original.kind==='audio_upload'?original.target_id:null;
      if(parentId && items.find(o=>o.op_id===parentId)?.state!=='synced')continue;
      const payload=bgPayload(original);
      let media=null,preview=null;
      if(original.kind==='photo'){
        media=await bgBytes(db,original);
        preview=await bgBytes(db,original,'preview_blob');
        // If unsupported or incomplete, leave bytes for foreground recovery.
        if(!media||!preview||media.length>BV_BG_MAX_PHOTO_BYTES)continue;
        payload.base64=bgBase64(media);payload.preview_base64=bgBase64(preview);
      }else if(original.kind==='audio_upload'){
        media=await bgBytes(db,original);
        if(!media || media.length>8*1024*1024 || media.length===0)continue;
        const total=Math.ceil(media.length/BV_BG_CHUNK);
        if(total>36)continue;
        const acknowledged=Math.max(0,Math.min(total,Math.floor(Number(original.parts_done)||0)));
        const part=acknowledged>=total?total-1:acknowledged;
        Object.assign(payload,{doc_id:original.doc_id,op_id:original.op_id,
          target_id:original.target_id,target_kind:original.target_kind,mime:original.mime,
          field_sheet:original.field_sheet,field_row:original.field_row,field_col:original.field_col,
          part_index:part,part_count:total,base64:bgBase64(media.subarray(part*BV_BG_CHUNK,(part+1)*BV_BG_CHUNK))});
      }
      // Login/logout can occur after a sync event was scheduled. Never replay
      // another operator's queue against the current signed-in session.
      const currentSession=await bgSession();
      if(!currentSession||currentSession.dbName!==session.dbName)return false;
      session.headers=currentSession.headers;
      const work={...original,__original_text:original.text,__original_value:original.value,
        state:'sending',upload_started:new Date().toISOString()};
      if(!await bgSaveWork(db,work))continue;
      count++;
      let result;
      try{
        result=await bgPost(session,original.kind==='photo'?'photo':
          original.kind==='audio_upload'?'audio':'operation',payload);
        if(result&&result.ok===true && original.kind==='audio_upload' && !result.complete){
          const total=payload.part_count;
          work.parts_done=Math.min(total,payload.part_index+1);
          work.state='pending';work.error='';delete work.next_retry;
        }else if(result&&result.ok===true){
          if(original.kind==='audio_upload')work.parts_done=payload.part_index+1;
          work.state='synced';work.error='';work.url=result.url||'';
          delete work.next_retry;
        }else if(result&&['busy','waiting_for_log','incomplete_upload'].includes(result.code)){
          work.attempts=(work.attempts||0)+1;
          work.state=work.attempts>=BV_BG_MAX_ATTEMPTS?'error':'pending';
          work.error='Изчаква се потвърждение от сървъра.';
          if(work.state==='pending')work.next_retry=new Date(Date.now()+15000).toISOString();
        }else{
          work.state=result&&['conflict','row_moved'].includes(result.code)?'conflict':'error';
          work.error='Записът изисква ръчна проверка.';delete work.next_retry;
        }
      }catch(error){
        work.attempts=(work.attempts||0)+1;
        const retry=bgTransient(error) && work.attempts<BV_BG_MAX_ATTEMPTS;
        work.state=retry?'pending':'error';
        work.error=retry?'Временно прекъсване на връзката.':'Нужна е ръчна проверка на записа.';
        if(retry)work.next_retry=new Date(Date.now()+Math.min(300000,5000*2**(work.attempts-1))).toISOString();
        else delete work.next_retry;
      }
      if(!await bgSaveWork(db,work))continue;
      const idx=items.findIndex(x=>x.op_id===work.op_id);
      if(idx>=0)items[idx]=work;
      changed=true;
      // A failed request cannot be replayed in the same SW event.
      if(work.error)break;
    }
    // If a bounded batch stopped mid-queue, request another browser-managed
    // event. Do not spin when every remaining item has a future retry time,
    // missing media, or an unresolved parent.
    if(changed && self.registration?.sync?.register){
      const pending=await bgGetAll(db,'queue');
      const ready=pending.some(o=>{
        if(o.state!=='pending'||(o.next_retry&&Date.parse(o.next_retry)>Date.now()))return false;
        if(!['log','field','add_row','log_change','audio_upload','photo'].includes(o.kind))return false;
        const parent=o.kind==='photo'?o.log_op_id:o.kind==='audio_upload'?o.target_id:null;
        return !parent||pending.some(p=>p.op_id===parent&&p.state==='synced');
      });
      if(ready)try{await self.registration.sync.register(BV_SYNC_TAG);}catch(e){}
    }
  } finally {
    if(acquired)try{await bgLease(session.dbName,owner,true);}catch(e){}
    db.close();
    if(changed){
      const pages=await self.clients.matchAll({type:'window',includeUncontrolled:true});
      for(const page of pages)if(new URL(page.url).origin===self.location.origin)
        page.postMessage({type:'BVLOG_SYNC_UPDATED'});
    }
  }
  return changed;
}
self.addEventListener('sync',event=>{
  if(event.tag===BV_SYNC_TAG)event.waitUntil(bgDrain());
});
