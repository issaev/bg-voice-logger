/* global wp, BVLOG_CONFIG */
(function () {
  'use strict';
  const h = wp.element.createElement;
  const {useState, useEffect, useRef} = wp.element;
  const CFG = window.BVLOG_CONFIG || {};
  // Generated from this JS source with the build marker normalized.
  const BVLOG_RUNNING_BUILD = '0.7.2.1-613947b7e695';
  window.BVLOG_RUNNING_BUILD = BVLOG_RUNNING_BUILD;
  let DB = 'bg-voice-logger-queue-v2-user-' + String(CFG.user && CFG.user.id || '0');
  const ANONYMOUS = CFG.auth_mode === 'public' && !(CFG.user && CFG.user.id);
  function initialOperator() { try { return (localStorage.getItem('bvlog-operator-name')||'').slice(0,80); } catch(e) { return ''; } }
  let dbPromise;
  // Cache belongs to the signed-in operator, not to every visitor of this device.
  function localCacheKey(kind) { return 'bvlog-v3-' + kind + '-' + DB; }

  // ASCII-authored, readable Bulgarian labels at runtime (q = hard sign).
  function bg(text) {
    const m = {a:'\u0430',b:'\u0431',v:'\u0432',g:'\u0433',d:'\u0434',e:'\u0435',z:'\u0437',i:'\u0438',y:'\u0439',k:'\u043a',l:'\u043b',m:'\u043c',n:'\u043d',o:'\u043e',p:'\u043f',r:'\u0440',s:'\u0441',t:'\u0442',u:'\u0443',f:'\u0444',h:'\u0445',q:'\u044a',w:'\u044c',c:'\u043a',j:'\u0434\u0436'};
    const pairs = {sht:'\u0449',zh:'\u0436',ch:'\u0447',sh:'\u0448',ts:'\u0446',ya:'\u044f',yu:'\u044e',yo:'\u0439\u043e'};
    return String(text).replace(/sht|zh|ch|sh|ts|ya|yu|yo|[a-z]/gi, function(t){
      const val = pairs[t.toLowerCase()] || m[t.toLowerCase()] || t;
      return t[0]===t[0].toUpperCase()?val.slice(0,1).toUpperCase()+val.slice(1):val;
    });
  }
  function B(text) { return bg(text); }
  const TYPES = ['Pozhar','Navodnenie','Izdirvane','Drugo bedstvie','Trenirovka'].map(bg);
  function icon(name, size) {
    const paths = {
      mic: ['M12 18v4','M8 22h8','M19 10v2a7 7 0 0 1-14 0v-2','M12 15a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v7a3 3 0 0 0 3 3z'],
      check: ['M20 6L9 17l-5-5'],
      alert: ['M10.3 3.9 2.1 18a2 2 0 0 0 1.7 3h16.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z','M12 9v4','M12 17h.01'],
      cloud: ['M20 16.5A4.5 4.5 0 0 0 18 8a6 6 0 0 0-11.7 1.7A4 4 0 0 0 7 17h11'],
      offline: ['M3 3l18 18','M17.5 17.5A4.5 4.5 0 0 0 18 8a6 6 0 0 0-11.7 1.7A4 4 0 0 0 7 17h8'],
      list: ['M8 6h13','M8 12h13','M8 18h13','M3 6h.01','M3 12h.01','M3 18h.01'],
      info: ['M12 17v-5','M12 8h.01','M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z'],
      truck: ['M1 5h14v12H1z','M15 9h4l3 4v4h-7','M5 17a2 2 0 1 0 4 0a2 2 0 0 0-4 0','M17 17a2 2 0 1 0 4 0a2 2 0 0 0-4 0'],
      users: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2','M9 11a4 4 0 1 0 0-8a4 4 0 0 0 0 8','M22 21v-2a4 4 0 0 0-3-3.87','M16 3.13a4 4 0 0 1 0 7.75'],
      plus: ['M12 5v14','M5 12h14'],
      arrow: ['M5 12h14','M12 5l7 7-7 7'],
      back: ['M19 12H5','M12 19l-7-7 7-7'],
      close: ['M18 6L6 18','M6 6l12 12'],
      edit: ['M12 20h9','M16.5 3.5a2.1 2.1 0 0 1 3 3L9 17l-4 1 1-4z'],
      clock: ['M12 8v4l3 2','M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20'],
      refresh: ['M20 11a8 8 0 0 0-14-5L3 9','M3 3v6h6','M4 13a8 8 0 0 0 14 5l3-3','M21 21v-6h-6'],
      logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4','M16 17l5-5-5-5','M21 12H9'],
      save: ['M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z','M17 21v-8H7v8','M7 3v5h8'],
      play: ['M8 5l11 7-11 7z'],
      stop: ['M6 6h12v12H6z'],
      image: ['M3 3h18v18H3z','M7 7h.01','m3 17 4-4 3 3 3-5 5 6'],
      camera: ['M3 7h4l2-3h6l2 3h4v13H3z','M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8'],
      trash: ['M3 6h18','M8 6V4h8v2','M5 6l1 15h12l1-15','M10 10v7','M14 10v7'],
      map: ['M12 22s8-7 8-13a8 8 0 0 0-16 0c0 6 8 13 8 13z','M12 9a2 2 0 1 0 0 4 2 2 0 0 0 0-4'],
      shield: ['M12 2l9 4v6c0 6-4 9-9 10C7 21 3 18 3 12V6z','M9 12l2 2 4-4'],
      upload: ['M12 16V3','M7 8l5-5 5 5','M3 16v5h18v-5'],
      settings: ['M12 2v2','M12 20v2','M2 12h2','M20 12h2','M4.9 4.9l1.4 1.4','M17.7 17.7l1.4 1.4','M19.1 4.9l-1.4 1.4','M6.3 17.7l-1.4 1.4','M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8'],
      more:['M5 12h.01','M12 12h.01','M19 12h.01']
    };
    return h('svg',{'className':'bv-icon','width':size||20,'height':size||20,'viewBox':'0 0 24 24','fill':'none','stroke':'currentColor','strokeWidth':1.8,'strokeLinecap':'round','strokeLinejoin':'round','aria-hidden':'true'},
      (paths[name]||paths.info).map((d,i)=>h('path',{d:d,key:i})));
  }
  // v0.6.2: media bytes are stored separately from mutable queue metadata.
  // Safari may reject structured-cloning a Blob into IndexedDB; use ArrayBuffer instead.
  const DB_SCHEMA = 2;
  const MEDIA_FIELDS = ['blob','preview_blob'];
  function hasQueueMedia(item, field) {
    const name=field||'blob';
    return !!(item && ((item[name] && item[name].size) || item[name+'_media_id']));
  }
  function openDB() {
    if (!dbPromise) {
      const name=DB;
      dbPromise=new Promise((resolve,reject)=>{
        const r=indexedDB.open(name,DB_SCHEMA);
        r.onupgradeneeded=()=>{
          const db=r.result;
          if(!db.objectStoreNames.contains('queue'))db.createObjectStore('queue',{keyPath:'op_id'});
          if(!db.objectStoreNames.contains('snapshots'))db.createObjectStore('snapshots',{keyPath:'id'});
          if(!db.objectStoreNames.contains('media'))db.createObjectStore('media',{keyPath:'media_id'});
        };
        r.onblocked=()=>reject(new Error('Локалната база е отворена в друг прозорец. Затвори другите табове на приложението.'));
        r.onerror=()=>reject(r.error||new Error('Не може да се отвори локалната база.'));
        r.onsuccess=()=>{
          const db=r.result;
          db.onversionchange=()=>{db.close();if(DB===name)dbPromise=null;};
          resolve(db);
        };
      });
      dbPromise.catch(()=>{if(DB===name)dbPromise=null;});
    }
    return dbPromise;
  }
  async function prepareQueueRecord(item) {
    const value=Object.assign({},item), media=[], discard=[];
    for(const field of MEDIA_FIELDS){
      const idKey=field+'_media_id';
      if(value.state==='synced'){
        if(value[idKey])discard.push(value[idKey]);
        delete value[field];delete value[idKey];
        delete value[field+'_size'];delete value[field+'_mime'];
        continue;
      }
      if(value[field] instanceof Blob){
        const blob=value[field];
        if(!blob.size)throw new Error('Празен медиен файл: '+field);
        // Read the Blob completely BEFORE opening a transaction; no await inside a transaction.
        const bytes=await blob.arrayBuffer();
        if(bytes.byteLength!==blob.size)throw new Error('Непълен локален файл: '+field);
        const id=value[idKey]||value.op_id+':'+field;
        value[idKey]=id;
        value[field+'_size']=bytes.byteLength;
        value[field+'_mime']=blob.type||value.mime||'application/octet-stream';
        media.push({media_id:id,bytes:bytes,mime:value[field+'_mime'],size:bytes.byteLength});
        delete value[field];
      }
    }
    return {value,media,discard};
  }
  async function writeQueueGroup(items) {
    // All queue changes (and any new media bytes) commit in one atomic IDB transaction.
    const prepared=[];
    for(const item of items)prepared.push(await prepareQueueRecord(item));
    const db=await openDB();
    return new Promise((resolve,reject)=>{
      let settled=false;
      const tx=db.transaction(['queue','media'],'readwrite');
      const queueStore=tx.objectStore('queue'),mediaStore=tx.objectStore('media');
      tx.oncomplete=()=>{settled=true;resolve(prepared.map(x=>x.value));};
      tx.onabort=()=>{if(!settled)reject(tx.error||new Error('Записът в локалната база е прекъснат.'));};
      tx.onerror=()=>{}; // onabort reports the final transaction failure
      try{
        for(const item of prepared){
          for(const media of item.media)mediaStore.put(media);
          queueStore.put(item.value);
          for(const id of item.discard)mediaStore.delete(id);
        }
      }catch(e){try{tx.abort();}catch(ignore){}reject(e);}
    });
  }
  async function database(action, store, payload) {
    if(store==='queue' && action==='put')return (await writeQueueGroup([payload]))[0];
    const db=await openDB();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(store,action==='get'||action==='getAll'||action==='getAllKeys'?'readonly':'readwrite');
      const st=tx.objectStore(store);
      let result;
      tx.oncomplete=()=>resolve(result);
      tx.onabort=()=>reject(tx.error||new Error('Локалната транзакция е прекъсната.'));
      tx.onerror=()=>{};
      try{
        const r=action==='getAll'?st.getAll():action==='getAllKeys'?st.getAllKeys():action==='get'?st.get(payload):
          action==='put'?st.put(payload):action==='delete'?st.delete(payload):null;
        if(!r)throw new Error('Непозната операция с локалната база.');
        r.onsuccess=()=>{result=r.result;};
      }catch(e){try{tx.abort();}catch(ignore){}reject(e);}
    });
  }
  async function queueBlob(item, field) {
    const name=field||'blob';
    if(!item)return null;
    if(item[name] instanceof Blob)return item[name]; // read-only legacy compatibility
    const id=item[name+'_media_id'];
    if(!id)return null;
    const record=await database('get','media',id);
    if(!record||!(record.bytes instanceof ArrayBuffer))return null;
    if(record.bytes.byteLength!==record.size)throw new Error('Локалният аудио/снимков файл е непълен.');
    return new Blob([record.bytes],{type:record.mime||item[name+'_mime']||item.mime||'application/octet-stream'});
  }
  async function reclaimOrphanMedia(){
    const db=await openDB();
    return new Promise((resolve,reject)=>{
      // A single readwrite transaction serializes cleanup with queue+media writes.
      const tx=db.transaction(['queue','media'],'readwrite');
      const queueStore=tx.objectStore('queue'),mediaStore=tx.objectStore('media');
      let removed=0;
      tx.oncomplete=()=>resolve(removed);
      tx.onabort=()=>reject(tx.error||new Error('Orphan cleanup transaction aborted.'));
      tx.onerror=()=>{};
      try {
        const readQueue=queueStore.getAll();
        readQueue.onsuccess=()=>{
          const referenced=new Set();
          for(const op of readQueue.result||[]){
            for(const field of MEDIA_FIELDS)if(op[field+'_media_id'])referenced.add(op[field+'_media_id']);
          }
          const readKeys=mediaStore.getAllKeys();
          readKeys.onsuccess=()=>{
            for(const id of readKeys.result||[]){
              if(!referenced.has(id)){mediaStore.delete(id);removed++;}
            }
          };
        };
      }catch(e){try{tx.abort();}catch(ignore){}reject(e);}
    });
  }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{
      const v = Math.floor(Math.random()*16);
      return (c==='x'?v:(v&3|8)).toString(16);
    });
  }
  const READ_RETRY_DELAYS_MS = [5000,15000,30000];
  const MAX_TRANSIENT_WRITE_ATTEMPTS = 5;
  function isTransientRequestError(error) {
    if (!error || error.name==='AbortError') return false;
    if (error.retryable===true) return true;
    if (error.retryable===false) return false;
    const status=Number(error.status||0);
    if (status) return [408,424,429,500,502,503,504].includes(status)||status>=500;
    return /failed to fetch|networkerror|network request failed|load failed|timed? ?out/i.test(String(error.message||''));
  }
  function writeRetryDelayMs(attempt) {
    // Jitter prevents many reconnecting phones from retrying together.
    const base=Math.min(300000,5000*Math.pow(2,Math.max(0,attempt-1)));
    return Math.round(base*(0.8+0.4*Math.random()));
  }
  async function api(path, method, data, signal) {
    const opts = {method:method||'GET',headers:{},credentials:'same-origin'};
    if(signal)opts.signal=signal;
    if (CFG.nonce && CFG.user && CFG.user.id) opts.headers['X-WP-Nonce']=CFG.nonce;
    if (CFG.csrf) opts.headers['X-BVLOG-CSRF']=CFG.csrf;
    if (path==='auth/google' && CFG.login_challenge) opts.headers['X-BVLOG-LOGIN']=CFG.login_challenge;
    if (method && method!=='GET') {
      opts.headers['Content-Type']='application/json';
      opts.body=JSON.stringify(data||{});
    }
    const fetchSafe=async(url,options)=>{
      try { return await fetch(url,options); }
      catch (cause) {
        if(cause&&cause.name==='AbortError')throw cause;
        const error=new Error('Временен проблем с връзката (Failed to fetch).');
        error.code='network';error.retryable=true;error.name='BvlogNetworkError';
        throw error;
      }
    };
    let r = await fetchSafe(CFG.api+path,opts);
    if (r.status===403 && CFG.nonce && CFG.user && CFG.user.id && navigator.onLine) {
      const reset = await fetchSafe(CFG.nonce_url,{credentials:'same-origin'});
      const answer = await reset.json();
      if (answer.success && answer.data && answer.data.nonce) {
        CFG.nonce = answer.data.nonce;
        opts.headers['X-WP-Nonce']=CFG.nonce;
        r = await fetchSafe(CFG.api+path,opts);
      }
    }
    let out;
    try { out = await r.json(); } catch (err) {
      const error=new Error('Невалиден отговор от сървъра (HTTP '+r.status+').');
      error.status=r.status;error.code='invalid_json';
      error.retryable=[408,424,429,500,502,503,504].includes(r.status)||r.status>=500;
      throw error;
    }
    if (!r.ok) {
      const error=new Error(out.message||'HTTP '+r.status);
      error.status=r.status;error.code=String(out.code||'');
      error.retryable=[408,424,429,500,502,503,504].includes(r.status)||r.status>=500;
      throw error;
    }
    return out;
  }
  function today(time) {
    return new Date(time||Date.now()).toLocaleString('bg-BG',{dateStyle:'short',timeZone:'Europe/Sofia'});
  }
  function timeOf(time) {
    return new Date(time||Date.now()).toLocaleTimeString('bg-BG',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Sofia'});
  }
  // One journal feed: an operation keeps the same identity from a local voice
  // recording through confirmation, upload and the first successful Sheets read.
  function journalEntries(queue,logs,docId,limit) {
    const remote=(Array.isArray(logs)?logs:[]).filter(x=>x&&x.row>=2).slice().reverse();
    const serverIds=new Set(remote.map(x=>String((x.cells||[])[6]||'')).filter(Boolean));
    const local=(Array.isArray(queue)?queue:[]).filter(o=>o&&o.doc_id===docId &&
      o.state!=='cancelled' && (o.kind==='log'||(o.kind==='audio'&&
        !(o.target&&o.target.kind==='field'))) && !serverIds.has(String(o.op_id||'')))
      .slice().sort((a,b)=>String(b.event_at||b.created||'').localeCompare(String(a.event_at||a.created||'')));
    // The same React key is used when a local op becomes a server-backed row.
    return local.map(o=>({key:'log:'+o.op_id,local:o})).concat(remote.map(x=>({
      key:(x.cells||[])[6]?'log:'+String(x.cells[6]):'legacy-row:'+x.row,remote:x
    }))).slice(0,limit||35);
  }
  function isLocalJournalOp(o,docId) {
    return !!(o&&docId&&o.doc_id===docId&&
      (o.kind==='log'||(o.kind==='audio'&&!(o.target&&o.target.kind==='field'))));
  }
  function EntryStatus({status}) {
    const m = {
      synced:['check',B('Sinhronizirano'),'good'], pending:['clock',B('V opashkata'),'wait'],
      sending:['refresh',B('Izprashta se'),'wait'], local_error:['alert','Проблем с локалното аудио','bad'], conflict:['alert',B('Konflikt'),'bad'],
      audio:['mic',B('Chaka transkriptsiya'),'wait'], transcribing:['refresh',B('Transkribira se'),'wait'],
      voice_review:['edit','За потвърждение','wait'], review:['edit',B('Proveri poleto'),'wait'],
      photo:['image',B('Chaka kachvane'),'wait'], cancelled:['close',B('Otkazano'),'muted']
    };
    const x = m[status]||['alert',B('Greshka'),'bad'];
    return h('span',{className:'bv-status '+x[2]},icon(x[0],14),x[1]);
  }
  function Button({children,onClick,secondary,disabled,className,type}) {
    return h('button',{type:type||'button',className:'bv-btn '+(secondary?'secondary ':'')+(className||''),disabled:!!disabled,onClick:onClick},children);
  }
  function loadGIS() {
    if(window.google && google.accounts && google.accounts.id) return Promise.resolve();
    if(window.__bvlogGISPromise) return window.__bvlogGISPromise;
    window.__bvlogGISPromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';
      script.async=true;script.defer=true;script.onload=resolve;script.onerror=()=>reject(new Error('Не може да се зареди Google вход.'));
      document.head.appendChild(script);
    });
    return window.__bvlogGISPromise;
  }
  function photoBase64(blob) {
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();reader.onerror=()=>reject(reader.error);
      reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');
      reader.readAsDataURL(blob);
    });
  }
  async function preparePhoto(file) {
    if(!file||!file.type.startsWith('image/')) throw new Error('Избери снимка (JPEG, PNG или WebP).');
    if(file.size>20*1024*1024) throw new Error('Снимката е над 20 MB.');
    let bmp,temporaryUrl='';
    if(typeof createImageBitmap==='function'){try{bmp=await createImageBitmap(file);}catch(e){bmp=null;}}
    if(!bmp){
      temporaryUrl=URL.createObjectURL(file);
      bmp=await new Promise((resolve,reject)=>{
        const image=new Image();image.onload=()=>resolve(image);
        image.onerror=()=>reject(new Error('Браузърът не може да прочете снимката.'));
        image.src=temporaryUrl;
      });
    }
    const scale=Math.min(1,1600/Math.max(bmp.width,bmp.height));
    const cv=document.createElement('canvas');cv.width=Math.max(1,Math.round(bmp.width*scale));cv.height=Math.max(1,Math.round(bmp.height*scale));
    cv.getContext('2d').drawImage(bmp,0,0,cv.width,cv.height);
    if(bmp.close)bmp.close();
    if(temporaryUrl)URL.revokeObjectURL(temporaryUrl);
    const blob=await new Promise(resolve=>cv.toBlob(resolve,'image/jpeg',0.76));
    // Private Sheets overlay and gallery preview. Never create a public Drive URL.
    const preview=document.createElement('canvas');preview.width=640;preview.height=480;
    const pctx=preview.getContext('2d');pctx.fillStyle='#f3f6f9';pctx.fillRect(0,0,640,480);
    const fit=Math.min(640/cv.width,480/cv.height);
    const w=Math.round(cv.width*fit),hh=Math.round(cv.height*fit);
    pctx.drawImage(cv,Math.round((640-w)/2),Math.round((480-hh)/2),w,hh);
    let previewBlob=await new Promise(resolve=>preview.toBlob(resolve,'image/jpeg',0.7));
    if(previewBlob&&previewBlob.size>350000)previewBlob=await new Promise(resolve=>preview.toBlob(resolve,'image/jpeg',0.42));
    preview.width=0;preview.height=0;cv.width=0;cv.height=0;
    if(!blob||blob.size>2400000)throw new Error('Снимката е твърде голяма след компресиране.');
    if(!previewBlob||previewBlob.size>350000)throw new Error('Неуспешно създаване на миниатюра.');
    return {blob:blob,previewBlob:previewBlob,name:(file.name||'photo.jpg').replace(/[^A-Za-z0-9_.-]/g,'_').slice(0,80),mime:'image/jpeg'};
  }
  // Capture a calendar day in Sofia, not a UTC timestamp.
  function sofiaTodayISO(){return new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Sofia'});}
  function isIncidentDate(value){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))return false;
    const [year,month,day]=value.split('-').map(Number);
    const utc=new Date(Date.UTC(year,month-1,day));
    return utc.getUTCFullYear()===year&&utc.getUTCMonth()===month-1&&utc.getUTCDate()===day;
  }
  function App() {
    const [mode,setMode]=useState('choose');
    const [doc,setDoc]=useState(null);
    const [page,setPage]=useState('LOG');
    const [data,setData]=useState(null);
    const [docs,setDocs]=useState([]);
    const [docsLoading,setDocsLoading]=useState(false);
    const [creating,setCreating]=useState(false);
    const [newType,setNewType]=useState(TYPES[2]);
    const [actionTypes,setActionTypes]=useState(TYPES);
    const [newPlace,setNewPlace]=useState('');
    const [incidentDate,setIncidentDate]=useState(sofiaTodayISO);
    const [createId,setCreateId]=useState(uuid());
    const [selectedDoc,setSelectedDoc]=useState('');
    const docsRequestRef=useRef(0);
    const [operatorName,setOperatorName]=useState(initialOperator());
    const [online,setOnline]=useState(navigator.onLine);
    const [auth,setAuth]=useState(null);
    const [authLoading,setAuthLoading]=useState(true);
    const [loginChallenge,setLoginChallenge]=useState('');
    const [loginError,setLoginError]=useState('');
    const [queueOpen,setQueueOpen]=useState(false);
    const [showCompletedQueue,setShowCompletedQueue]=useState(false);
    const [photos,setPhotos]=useState([]);
    const [photoBusy,setPhotoBusy]=useState(false);
    const [gpsBusy,setGpsBusy]=useState(false);
    const [voiceIssue,setVoiceIssue]=useState('');
    const [voiceReviewDrafts,setVoiceReviewDrafts]=useState({});
    const [queue,setQueue]=useState([]);
    const [busy,setBusy]=useState(false);
    const [error,setError]=useState(''); // Audio, media and other action-level errors.
    const [docsError,setDocsError]=useState('');
    const [syncError,setSyncError]=useState('');
    const [localStoreError,setLocalStoreError]=useState('');
    const [notice,setNotice]=useState('');
    const [microphoneMenu,setMicrophoneMenu]=useState(false);
    const [microphones,setMicrophones]=useState([]);
    const [chosenMicrophone,setChosenMicrophone]=useState(()=>{try{return localStorage.getItem('bvlog-microphone-id')||'default';}catch(e){return 'default';}});
    const [microphoneTest,setMicrophoneTest]=useState(false);
    const [micLevel,setMicLevel]=useState(0);
    const [logEditor,setLogEditor]=useState(null);
    const [eventMenu,setEventMenu]=useState(null);
    const [expandedHistory,setExpandedHistory]=useState(null);
    const [logEditText,setLogEditText]=useState('');
    const [logSaving,setLogSaving]=useState(false);
    const [audioBusy,setAudioBusy]=useState('');
    const [unsavedAudio,setUnsavedAudio]=useState(null);
    const [docLoading,setDocLoading]=useState(false);
    const [docLoadError,setDocLoadError]=useState('');
    const [lastFreshAt,setLastFreshAt]=useState('');
    const documentRequestRef=useRef(0);
    const documentReadInFlightRef=useRef(null);
    const readBackoffRef=useRef({id:'',attempts:0,nextAt:0});
    const readRetryRef=useRef({id:'',attempts:0,nextAt:0,timer:null,exhausted:false});
    const writeRetryTimerRef=useRef(null);
    const [draft,setDraft]=useState('');
    const [liveText,setLiveText]=useState('');
    const [recording,setRecording]=useState(false);
    const [editing,setEditing]=useState(null);
    const [editValue,setEditValue]=useState('');
    const [rowAdd,setRowAdd]=useState(false);
    const [rowSaving,setRowSaving]=useState(false);
    const [rowFields,setRowFields]=useState([]);
    const [secondInfo,setSecondInfo]=useState(false);
    const [infoAdding,setInfoAdding]=useState(-1);
    const [infoRole,setInfoRole]=useState('');
    const [infoValues,setInfoValues]=useState([]);
    const [gallery,setGallery]=useState(null);
    const [galleryImage,setGalleryImage]=useState('');
    const [galleryBusy,setGalleryBusy]=useState(false);
    const [galleryError,setGalleryError]=useState('');
    const [audioPlayer,setAudioPlayer]=useState(null);
    const [audioPlayerMessage,setAudioPlayerMessage]=useState('');
    const [audioLoadingMessage,setAudioLoadingMessage]=useState('');
    const galleryRequestRef=useRef(0);
    const photoDataCacheRef=useRef(new Map());
    const audioBlobCacheRef=useRef(new Map());
    const audioElementRef=useRef(null);
    const audioUrlRef=useRef('');
    const audioFetchRef=useRef(null);
    const audioSequenceRef=useRef(0);
    const recordingRef=useRef(null);
    const fieldRecordingRef=useRef(null);
    const micTestRef=useRef(null);
    const [fieldRecording,setFieldRecording]=useState(false);
    const syncingRef=useRef(false);
    const transcribingRef=useRef(false);
    const refreshRef=useRef(null);
    const docRef=useRef(null);
    const authRef=useRef(null);
    const newPhotoFileRef=useRef(null);
    const newCameraFileRef=useRef(null);
    useEffect(()=>{authRef.current=auth;},[auth]);
    useEffect(()=>()=>{
      if(audioFetchRef.current)audioFetchRef.current.abort();
      if(audioUrlRef.current)URL.revokeObjectURL(audioUrlRef.current);
    },[]);
    function storePhotoCache(key, value){
      if(!value || value.length>4000000)return;
      const cache=photoDataCacheRef.current;
      cache.delete(key);cache.set(key,value);
      let total=0;cache.forEach(v=>{total+=v.length;});
      while(cache.size>14 || total>9000000){
        const oldest=cache.keys().next().value;
        if(oldest===undefined)break;
        total-=cache.get(oldest).length;cache.delete(oldest);
      }
    }
    useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),3200);return()=>clearTimeout(timer);},[notice]);
    useEffect(()=>{
      if(!microphoneMenu||!navigator.mediaDevices||!navigator.mediaDevices.enumerateDevices)return;
      let live=true;
      const update=async()=>{
        try{
          const all=await navigator.mediaDevices.enumerateDevices();
          if(!live)return;
          const audio=all.filter(x=>x.kind==='audioinput');setMicrophones(audio);
          if(chosenMicrophone!=='default' && audio.every(x=>x.deviceId!==chosenMicrophone)){
            setChosenMicrophone('default');try{localStorage.removeItem('bvlog-microphone-id');}catch(e){}
            setNotice('Избраният микрофон е изключен. Използва се системният.');
          }
        }catch(e){if(live)setVoiceIssue('Списък микрофони: '+e.message);}
      };
      update();
      navigator.mediaDevices.addEventListener&&navigator.mediaDevices.addEventListener('devicechange',update);
      return()=>{live=false;navigator.mediaDevices.removeEventListener&&navigator.mediaDevices.removeEventListener('devicechange',update);};
    },[microphoneMenu,chosenMicrophone]);
    useEffect(()=>{docRef.current=doc;},[doc]);
    useEffect(()=>{
      if(!gallery||!gallery.photos||!gallery.photos.length)return;
      const photo=gallery.photos[gallery.index];
      const requestId=++galleryRequestRef.current;
      let active=true;
      setGalleryImage('');setGalleryError('');
      if(photo && photo.local && photo.src){setGalleryImage(photo.src);setGalleryBusy(false);return;}
      if(!photo || !photo.id)return;
      const cacheKey=gallery.doc_id+':'+photo.id+':preview';
      const cached=photoDataCacheRef.current.get(cacheKey);
      if(cached){setGalleryImage(cached);setGalleryBusy(false);return;}
      setGalleryBusy(true);
      const path='photo-view?doc_id='+encodeURIComponent(gallery.doc_id)+'&photo_id='+encodeURIComponent(photo.id)+'&variant=preview';
      api(path).then(result=>{
        if(!active||requestId!==galleryRequestRef.current)return;
        if(!result.ok||!result.base64)throw new Error(result.message||'Снимката не може да бъде прочетена.');
        const src='data:'+(result.mime||'image/jpeg')+';base64,'+result.base64;
        storePhotoCache(cacheKey,src);
        setGalleryImage(src);
      }).catch(err=>{if(active&&requestId===galleryRequestRef.current)setGalleryError(err.message);})
        .finally(()=>{if(active&&requestId===galleryRequestRef.current)setGalleryBusy(false);});
      return()=>{active=false;};
    },[gallery]);
    function openGallery(entry,index){
      if(!entry.photos||!entry.photos.length)return;
      setGallery({doc_id:doc.id,photos:entry.photos,index:index||0,local:false});
    }
    async function openLocalGallery(logEntry){
      const related=queue.filter(item=>item.kind==='photo'&&item.log_op_id===logEntry.op_id&&hasQueueMedia(item)&&item.state!=='cancelled');
      if(!related.length)return;
      try{
        const photos=[];
        for(const item of related){
          const blob=await queueBlob(item);
          if(blob)photos.push({local:true,src:URL.createObjectURL(blob),text:item.filename||'Снимка'});
        }
        if(photos.length)setGallery({doc_id:logEntry.doc_id,photos,index:0,local:true});
        else setError('Локалните снимки не могат да бъдат прочетени.');
      }catch(e){setError('Локална снимка: '+e.message);} 
    }
    function closeGallery(){
      galleryRequestRef.current++;
      if(gallery&&gallery.local)gallery.photos.forEach(x=>{if(x.src)URL.revokeObjectURL(x.src);});
      setGallery(null);setGalleryImage('');setGalleryError('');
    }
    async function loadFullPhoto(){
      if(!gallery||!gallery.photos[gallery.index]||!gallery.photos[gallery.index].id)return;
      const photo=gallery.photos[gallery.index];
      const requestId=++galleryRequestRef.current;
      const cacheKey=gallery.doc_id+':'+photo.id+':original';
      const cached=photoDataCacheRef.current.get(cacheKey);
      if(cached){setGalleryImage(cached);setGalleryError('');setGalleryBusy(false);return;}
      setGalleryBusy(true);setGalleryError('');
      try {
        const result=await api('photo-view?doc_id='+encodeURIComponent(gallery.doc_id)+'&photo_id='+encodeURIComponent(photo.id)+'&variant=original');
        if(requestId!==galleryRequestRef.current)return;
        if(!result.ok||!result.base64)throw new Error(result.message||'Снимката не може да бъде прочетена.');
        const src='data:'+(result.mime||'image/jpeg')+';base64,'+result.base64;
        storePhotoCache(cacheKey,src);
        setGalleryImage(src);
      }catch(err){if(requestId===galleryRequestRef.current)setGalleryError(err.message);}finally{if(requestId===galleryRequestRef.current)setGalleryBusy(false);}
    }
    async function checkAuth() {
      setAuthLoading(true);
      try {
        const response=await api('auth/session');
        CFG.login_challenge=response.login_challenge||'';
        CFG.csrf=response.csrf||'';
        setLoginChallenge(CFG.login_challenge);
        if(response.authenticated)await bindUserQueue(response.identity);
        setAuth(response.authenticated?response.identity:null);
        if(response.authenticated){
          try{localStorage.setItem('bvlog-last-identity',JSON.stringify({identity:response.identity,time:Date.now()}));}catch(e){}
        }
      } catch(e) {
        // A cached recent identity only permits offline local capture, never online server access.
        if(!navigator.onLine){
          try{const saved=JSON.parse(localStorage.getItem('bvlog-last-identity')||'null');
            if(saved&&Date.now()-saved.time<12*3600000){
              await bindUserQueue(saved.identity);
              setAuth(Object.assign({},saved.identity,{offline_only:true}));
            }
          }catch(ignore){}
        } else setLoginError(e.message);
      } finally {setAuthLoading(false);}
    }
    useEffect(()=>{checkAuth();},[]);
    useEffect(()=>{
      if(!auth || CFG.auth_mode==='public')return;
      if(!auth.offline_only && navigator.onLine){loadDocs();syncAll();processAudioQueue();}
    },[auth&&auth.email]);
    useEffect(()=>{
      if(auth || authLoading || CFG.auth_mode!=='google' || !CFG.google_client_id || !loginChallenge)return;
      let active=true;
      loadGIS().then(()=>{
        if(!active)return;
        const mount=document.getElementById('bvlog-google-signin');
        if(!mount)return;
        mount.innerHTML='';
        google.accounts.id.initialize({client_id:CFG.google_client_id,ux_mode:'popup',callback:async ({credential})=>{
          try{
            setLoginError('');
            const data=await api('auth/google','POST',{credential});
            if(!data.ok)throw new Error(data.message||'Google login failed');
            CFG.csrf=data.csrf||'';
            await bindUserQueue(data.identity);
            try {localStorage.setItem('bvlog-last-identity',JSON.stringify({identity:data.identity,time:Date.now()}));} catch(e) {}
            setAuth(data.identity);
          }catch(e){setLoginError(e.message);}
        }});
        google.accounts.id.renderButton(mount,{theme:'outline',size:'large',shape:'pill',text:'signin_with',width:260});
      }).catch(e=>{if(active)setLoginError(e.message);});
      return()=>{active=false;};
    },[authLoading,loginChallenge,auth]);
    async function googleLogout(){
      try{await api('auth/logout','POST',{});}catch(e){}
      closeAudioPlayer();photoDataCacheRef.current.clear();audioBlobCacheRef.current.clear();
      docsRequestRef.current++;
      CFG.csrf='';setAuth(null);setMode('choose');setDoc(null);setData(null);setDocs([]);setSelectedDoc('');setQueueOpen(false);setQueue([]);
      try{localStorage.removeItem('bvlog-last-identity');}catch(e){}
      if(window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect();
      await checkAuth();
    }


    async function bindUserQueue(identity){
      if(!identity)return;
      const newDB=identity.kind==='google'&&identity.sub
        ? 'bg-voice-logger-queue-v3-google-'+identity.sub
        : 'bg-voice-logger-queue-v2-user-'+String(CFG.user&&CFG.user.id||'0');
      if(DB!==newDB){
        docsRequestRef.current++;
        DB=newDB;dbPromise=null;
      }
      try {
        const cached=JSON.parse(localStorage.getItem(localCacheKey('docs'))||'null');
        const ownDocs=Array.isArray(cached)?cached:[];
        setDocs(ownDocs);setSelectedDoc(ownDocs[0]?ownDocs[0].id:'');
      } catch(e) {setDocs([]);setSelectedDoc('');}
      await refreshQueue();
    }
    async function importLegacyQueue(){
      if(!auth || auth.kind!=='google')return;
      if(!window.confirm('Импорт от старата локална опашка? Прави се копие, без да се изтриват старите данни. Продължи само ако това са твоите записи.'))return;
      const legacy='bg-voice-logger-queue-v2-user-0';
      if(legacy===DB)return;
      try{
        const old=await new Promise((resolve,reject)=>{
          const r=indexedDB.open(legacy,1);
          r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('queue'))r.result.createObjectStore('queue',{keyPath:'op_id'});};
          r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
        });
        const items=await new Promise((resolve,reject)=>{
          const t=old.transaction('queue','readonly');const r=t.objectStore('queue').getAll();
          r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
        });old.close();
        let count=0;
        for(const item of items){
          if(item.state==='synced'||item.state==='cancelled')continue;
          if(!await database('get','queue',item.op_id)){
            await database('put','queue',Object.assign({},item,{state:item.state==='sending'?'pending':item.state}));count++;
          }
        }
        await refreshQueue();setNotice('Импортирани '+count+' неприключени записи; старите данни са запазени.');
      }catch(e){setError('Неуспешен импорт: '+e.message);}
    }
    function changeOperatorName(value) {
      const name=String(value).slice(0,80);
      setOperatorName(name);
      try { localStorage.setItem('bvlog-operator-name',name); } catch(e) { /* storage unavailable */ }
    }
    function checkOperatorName() {
      if (!ANONYMOUS || operatorName.trim()) return true;
      setError(B('Vqvedi svoeto ime v nachaloto na ekrana.'));
      return false;
    }
    async function refreshQueue() {
      try {
        setQueue((await database('getAll','queue')).sort((a,b)=>(a.created||'').localeCompare(b.created||'')));
        setLocalStoreError('');
        return true;
      }catch(e){setLocalStoreError(B('Nedostqpno lokalno hranilishte: ')+e.message);return false;}
    }
    async function loadDocs() {
      if(CFG.auth_mode!=='public' && !authRef.current)return;
      const request=++docsRequestRef.current,scope=DB;
      setDocsLoading(true);
      try {
        const r=await api('documents');
        if(request!==docsRequestRef.current || scope!==DB)return;
        if(!r.ok)throw new Error(r.message||'Google error');
        const fresh=r.documents||[];
        setDocs(fresh);
        if(Array.isArray(r.action_types) && r.action_types.length){
          const types=r.action_types.filter(x=>typeof x==='string' && x.length && x!==B('Izberi ot menyuto'));
          if(types.length){setActionTypes(types);setNewType(old=>types.includes(old)?old:types[0]);}
        }
        // Never override a selection made while this async request was pending.
        setSelectedDoc(previous=>fresh.some(x=>x.id===previous)?previous:(fresh[0]?fresh[0].id:''));
        localStorage.setItem(localCacheKey('docs'),JSON.stringify(fresh));
        setDocsError('');
      }catch(e){if(request===docsRequestRef.current && scope===DB)setDocsError(e.message);}
      finally{if(request===docsRequestRef.current && scope===DB)setDocsLoading(false);}
    }
    // These timers only retry transport failures. Never create a second write
    // because a post-write document refresh failed.
    function clearReadRetry() {
      if(readRetryRef.current.timer!=null)window.clearTimeout(readRetryRef.current.timer);
      readRetryRef.current={id:'',attempts:0,nextAt:0,timer:null,exhausted:false};
    }
    function runScheduledReadRetry() {
      const job=readRetryRef.current;
      job.timer=null;
      if(!job.id||job.exhausted)return;
      if(job.id!==docRef.current?.id){clearReadRetry();return;}
      if(!navigator.onLine||document.hidden)return; // resume on online/visibility.
      if(Date.now()<job.nextAt){scheduleReadRetryTimer();return;}
      const active=refreshRef.current;
      if(!active||active.id!==job.id||!active.ready||syncingRef.current||documentReadInFlightRef.current){
        job.nextAt=Date.now()+15000;
        scheduleReadRetryTimer();return;
      }
      active.load(job.id,true);
    }
    function scheduleReadRetryTimer() {
      const job=readRetryRef.current;
      if(!job.id||job.exhausted)return;
      if(job.timer!=null)window.clearTimeout(job.timer);
      job.timer=window.setTimeout(runScheduledReadRetry,Math.max(200,job.nextAt-Date.now()));
    }
    function scheduleReadRetry(id,error,automatic) {
      if(!isTransientRequestError(error)||id!==docRef.current?.id)return false;
      const previous=readRetryRef.current;
      const attempts=(automatic&&previous.id===id?previous.attempts:0)+1;
      if(previous.timer!=null)window.clearTimeout(previous.timer);
      if(attempts>READ_RETRY_DELAYS_MS.length){
        readRetryRef.current={id,attempts:READ_RETRY_DELAYS_MS.length,nextAt:0,timer:null,exhausted:true};
        return false;
      }
      readRetryRef.current={id,attempts,nextAt:Date.now()+READ_RETRY_DELAYS_MS[attempts-1],timer:null,exhausted:false};
      scheduleReadRetryTimer();return true;
    }
    function scheduleWriteRetry(items) {
      if(writeRetryTimerRef.current!=null)window.clearTimeout(writeRetryTimerRef.current);
      writeRetryTimerRef.current=null;
      const dates=items.filter(o=>{
        if(o.state!=='pending'||!o.next_retry)return false;
        const parentId=o.kind==='audio_upload'?o.target_id:o.kind==='photo'?o.log_op_id:null;
        const parent=parentId&&items.find(x=>x.op_id===parentId);
        return !parent||parent.state==='synced'; // never spin waiting on a blocked parent.
      }).map(o=>Date.parse(o.next_retry)).filter(Number.isFinite);
      if(!dates.length)return;
      writeRetryTimerRef.current=window.setTimeout(()=>{
        writeRetryTimerRef.current=null;
        if(navigator.onLine&&!document.hidden)syncAll();
      },Math.max(250,Math.min(...dates)-Date.now()));
    }
    async function loadDocument(id,automaticRetry=false) {
      // A manual refresh and the 120s poll must not launch the same read twice.
      if(documentReadInFlightRef.current?.id===id)return false;
      if(!automaticRetry)clearReadRetry();
      const request=++documentRequestRef.current;
      documentReadInFlightRef.current={id,request};
      setDocLoading(true);setDocLoadError('');
      try{
        if(!navigator.onLine){
          const snap=await database('get','snapshots',id);
          if(request!==documentRequestRef.current)return;
          setData(snap?snap.data:null);
          if(!snap)setDocLoadError('Няма офлайн копие на този документ. Свържи се с интернет.');
          return;
        }
        const r=await api('document/'+encodeURIComponent(id));
        if(!r.ok)throw new Error(r.message||'Document read failed');
        if(request!==documentRequestRef.current)return;
        setData(r.data);
        setLastFreshAt(new Date().toISOString());
        readBackoffRef.current={id,attempts:0,nextAt:0};
        clearReadRetry();
        try{await database('put','snapshots',{id,data:r.data,updated:new Date().toISOString()});}
        catch(localError){setNotice('Данните са заредени, но офлайн копието не е обновено.');}
      }catch(e){
        if(request!==documentRequestRef.current)return;
        try{const snap=await database('get','snapshots',id);if(snap)setData(snap.data);}
        catch(ignore){}
        const scheduled=scheduleReadRetry(id,e,automaticRetry);
        setDocLoadError('Документът не е обновен: '+(e.message||'Неуспешно обновяване.')+
          (lastFreshAt?' Показани са последните потвърдени данни от '+timeOf(lastFreshAt)+'.':'')+
          (scheduled?' Автоматичен повторен опит е планиран.':''));
        const previous=readBackoffRef.current;
        const attempts=(previous.id===id?previous.attempts:0)+1;
        readBackoffRef.current={id,attempts,
          nextAt:Date.now()+Math.min(15*60000,120000*Math.pow(2,Math.min(attempts-1,3)))};
      }finally{
        if(documentReadInFlightRef.current?.request===request)documentReadInFlightRef.current=null;
        if(request===documentRequestRef.current)setDocLoading(false);
      }
    }
    async function startSession(chosen) {
      if (!chosen || !checkOperatorName()) return;
      clearReadRetry();
      setDoc(chosen); docRef.current=chosen;
      readBackoffRef.current={id:chosen.id,attempts:0,nextAt:0};
      setPage('LOG');setMode('session');setData(null);setError('');setSecondInfo(false);setLastFreshAt('');
      localStorage.setItem(localCacheKey('last-doc'),JSON.stringify(chosen));
      await loadDocument(chosen.id);
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(()=>{});
    }
    async function newDocument() {
      if (!newPlace.trim() || !checkOperatorName()) return;
      if(!isIncidentDate(incidentDate)){setError('Избери валидна дата на акцията.');return;}
      setBusy(true);setError('');
      try {
        const r=await api('documents','POST',{type:newType,place:newPlace.trim(),incident_date:incidentDate,create_id:createId});
        if (!r.ok) throw new Error(r.message||'Create failed');
        await loadDocs();
        setSelectedDoc(r.document.id);
        setCreating(false);setCreateId(uuid());
        await startSession(r.document);
      } catch(e) { setError(e.message); }
      finally { setBusy(false); }
    }
    async function enqueue(op) {
      const item=Object.assign({op_id:uuid(),state:'pending',created:new Date().toISOString(),author:ANONYMOUS ? operatorName.trim() : ((authRef.current && authRef.current.name) || (CFG.user && CFG.user.name || ''))},op);
      // Only the transaction's completion determines whether the local save worked.
      try {
        item.doc_name=item.doc_name || (docRef.current && docRef.current.id===item.doc_id ? docRef.current.name : (docs.find(d=>d.id===item.doc_id)||{}).name) || '';
        await database('put','queue',item);
      }catch(e){setLocalStoreError(B('NE e zapazeno: ')+e.message);return false;}
      // A failed UI refresh does not undo a durable IndexedDB commit.
      try {
        const refreshed=await refreshQueue();
        if(!refreshed)setNotice('Записът е запазен локално, но списъкът не е обновен.');
        else if(item.kind==='audio')setNotice('Аудиото е запазено локално.');
        if(navigator.onLine && item.kind==='audio' && CFG.stt_mode==='cloud' && CFG.stt_cloud)
          window.setTimeout(()=>processAudioQueue(),30);
        else if(navigator.onLine && item.kind!=='audio')window.setTimeout(()=>syncAll(),20);
      }catch(e){setNotice('Записът е запазен локално; опресни списъка.');}
      return true;
    }
    // Offline-first cloud STT: the blob is saved before this function can run.
    // Only a short-lived, scoped ticket crosses the WordPress boundary.
    async function processAudioQueue() {
      if (transcribingRef.current || !navigator.onLine || CFG.stt_mode!=='cloud' || !CFG.stt_cloud ||
          !authRef.current || authRef.current.offline_only ||
          !['google','wordpress'].includes(authRef.current.kind)) return;
      const scope=DB;
      transcribingRef.current=true;
      try {
        const items=(await database('getAll','queue')).sort((a,b)=>(a.created||'').localeCompare(b.created||''));
        for (const entry of items) {
          if(DB!==scope)return;
          if(entry.kind!=='audio')continue;
          // Recover interrupted uploads on reopen (but never start duplicate active requests).
          if(entry.state==='transcribing' && Date.now()-Date.parse(entry.stt_started||entry.created)>180000){
            entry.state='audio';await database('put','queue',entry);
          }
          if(entry.state!=='audio'||(entry.stt_retry_at && Date.now()<Date.parse(entry.stt_retry_at)))continue;
          if((entry.stt_attempts||0)>=4)continue;
          let audioBlob;
          try{audioBlob=await queueBlob(entry);}catch(e){
            setError('Не може да се прочете локалното аудио: '+e.message);
            continue; // Keep the old record untouched for manual recovery.
          }
          if(!audioBlob || !audioBlob.size){
            const bad=Object.assign({},entry,{stt_error:'Липсва локалният аудиофайл.',stt_attempts:4});
            await database('put','queue',bad);continue;
          }
          if(audioBlob.size>8*1024*1024){
            const bad=Object.assign({},entry,{stt_error:'Аудиото е над 8 MB.',stt_attempts:4});
            await database('put','queue',bad);continue;
          }
          const active=Object.assign({},entry,{state:'transcribing',stt_started:new Date().toISOString(),stt_error:''});
          await database('put','queue',active);await refreshQueue();
          try {
            const ticket=await api('stt/token','POST',{op_id:entry.op_id,doc_id:entry.doc_id});
            if(!ticket.ok || !ticket.token || !ticket.endpoint)throw new Error('STT gateway не е конфигуриран.');
            const baseMime=(audioBlob.type||'audio/webm').split(';')[0];
            const ext=baseMime==='audio/mp4'?'.m4a':baseMime==='audio/ogg'?'.ogg':
              baseMime==='audio/wav'?'.wav':baseMime==='audio/mpeg'?'.mp3':'.webm';
            const data=new FormData();
            data.append('audio',audioBlob,'voice-'+entry.op_id+ext);
            if(entry.mic_signal&&typeof entry.mic_signal.activity==='number')
              data.append('mic_activity',String(entry.mic_signal.activity));
            const abort=new AbortController();
            const t=window.setTimeout(()=>abort.abort(),65000);
            let response;
            try {response=await fetch(ticket.endpoint,{method:'POST',headers:{Authorization:'Bearer '+ticket.token},body:data,signal:abort.signal});}
            finally {window.clearTimeout(t);}
            let result;
            try {result=await response.json();}catch(e){throw new Error('Неочакван отговор от STT услугата (HTTP '+response.status+').');}
            if(!response.ok || !result.ok || !result.text){
              const code=result.code||('HTTP_'+response.status);
              const e=new Error('STT: '+code+(result.message?' - '+result.message:''));
              e.permanent=result.retryable===false || [400,401,403,413,415,422].includes(response.status);
              throw e;
            }
            if(result.op_id && result.op_id!==entry.op_id)throw new Error('STT отговорът е за различен запис.');
            if(DB!==scope)return;
            const latest=await database('get','queue',entry.op_id);
            if(latest && latest.kind==='audio' && latest.state==='transcribing'){
              await audioToText(Object.assign({},latest,{stt_provider:result.provider||''}),result.text,result.quality||null);
              if(result.quality&&result.quality.status==='suspicious')setNotice('Транскрипцията е за проверка.');
            }
          } catch(err) {
            if(DB!==scope)return;
            const latest=await database('get','queue',entry.op_id);
            if(latest && latest.kind==='audio'){
              const attempts=(latest.stt_attempts||0)+1;
              latest.state='audio';latest.stt_attempts=err.permanent?4:attempts;
              latest.stt_error=err.message;
              latest.stt_retry_at=err.permanent?null:new Date(Date.now()+Math.min(300000,10000*Math.pow(3,Math.min(attempts-1,3)))).toISOString();
              await database('put','queue',latest);
            }
            // Preserve the audio; do not send an empty text entry to Sheets.
            if(err.permanent)continue;
            break;
          }
          await refreshQueue();
        }
      } catch(e){setError('STT опашка: '+e.message);}
      finally{transcribingRef.current=false;await refreshQueue();}
    }
    async function retryAudio(entry) {
      const latest=await database('get','queue',entry.op_id);
      if(!latest||latest.state==='transcribing')return;
      await database('put','queue',Object.assign({},latest,{state:'audio',stt_attempts:0,stt_retry_at:null,stt_error:''}));
      await refreshQueue();processAudioQueue();
    }

    async function syncAll() {
      if (syncingRef.current || !navigator.onLine ||
        (CFG.auth_mode!=='public' && (!authRef.current||authRef.current.offline_only)))return;
      const scope=DB;
      syncingRef.current=true;
      try {
        const items=(await database('getAll','queue')).sort((a,b)=>(a.created||'').localeCompare(b.created||''));
        let touchedCurrent=false;
        for(const o of items){
          if(DB!==scope)return;
          if(!['pending','sending'].includes(o.state)||o.kind==='audio')continue;
          if(o.next_retry && Date.now()<Date.parse(o.next_retry))continue;
          const work=Object.assign({},o,{state:'sending',upload_started:new Date().toISOString()});
          try {
            // A failed local commit must not be interpreted as a failed server request.
            await database('put','queue',work);
            await refreshQueue();
            const payload=Object.assign({},o);
            for(const key of ['state','audio','error','created','current','mic_signal','quality',
              'blob','preview_blob','blob_media_id','preview_blob_media_id',
              'blob_size','preview_blob_size','blob_mime','preview_blob_mime','parts_done'])delete payload[key];
            let r;
            if(o.kind==='audio_upload'){
              const parent=items.find(x=>x.op_id===o.target_id);
              if(parent && parent.state!=='synced'){
                work.state='pending';await database('put','queue',work);continue;
              }
              const blob=await queueBlob(o);
              if(!blob||!blob.size)throw new Error('Липсва оригиналният аудиофайл в локалното хранилище.');
              if(blob.size>8*1024*1024)throw new Error('Аудиото е над 8 MB.');
              const total=Math.ceil(blob.size/262144);
              if(total>36)throw new Error('Аудиото надвишава допустимия размер.');
              let completed=false;
              // Resume only from acknowledged pieces; re-send the last piece if all were
              // acknowledged but the final Drive commit was never confirmed.
              const acknowledged=Math.max(0,Math.min(total,Math.floor(Number(o.parts_done)||0)));
              const startPart=acknowledged>=total?total-1:acknowledged;
              for(let part=startPart;part<total;part++){
                if(DB!==scope)return;
                const piece=blob.slice(part*262144,(part+1)*262144);
                const response=await api('audio','POST',{doc_id:o.doc_id,op_id:o.op_id,
                  target_id:o.target_id,target_kind:o.target_kind,mime:o.mime,
                  field_sheet:o.field_sheet,field_row:o.field_row,field_col:o.field_col,
                  part_index:part,part_count:total,base64:await photoBase64(piece)});
                if(!response.ok)throw new Error(response.message||'Неуспешно качване на аудиото.');
                work.parts_done=part+1;
                await database('put','queue',work);
                if(response.complete){completed=true;break;}
              }
              r={ok:completed,code:completed?'':'incomplete_upload',
                message:completed?'':'Аудиото още не е потвърдено в Google Drive.'};
            }else if(o.kind==='photo'){
              if(o.log_op_id){
                const parent=items.find(x=>x.op_id===o.log_op_id);
                if(parent&&parent.state!=='synced'){
                  work.state='pending';await database('put','queue',work);continue;
                }
              }
              const blob=await queueBlob(o);
              if(!blob)throw new Error('Липсва локалният файл за снимката.');
              let preview=await queueBlob(o,'preview_blob');
              if(!preview){
                const recovered=await preparePhoto(blob);
                preview=recovered.previewBlob;
                const saved=await database('put','queue',Object.assign({},work,{preview_blob:preview}));
                Object.assign(work,saved);
              }
              payload.base64=await photoBase64(blob);
              payload.preview_base64=await photoBase64(preview);
              r=await api('photo','POST',payload);
            }else{
              r=await api('operation','POST',payload);
            }
            if(r.ok){
              work.state='synced';work.error='';work.url=r.url||'';
              delete work.blob;delete work.preview_blob;delete work.next_retry;
              if(docRef.current&&o.doc_id===docRef.current.id)touchedCurrent=true;
            }else if(['waiting_for_log','busy','incomplete_upload'].includes(r.code)){
              work.state='pending';work.error=r.message||'Изчаква се потвърждение.';
              work.attempts=(work.attempts||0)+1;
              work.next_retry=new Date(Date.now()+10000).toISOString();
            }else if(r.code==='conflict'||r.code==='row_moved'){
              work.state=o.kind==='photo'?'error':'conflict';work.current=r.current;work.error=r.message;
            }else{work.state='error';work.error=r.message||B('Greshka pri zapis');}
          }catch(e){
            work.state='pending';work.error=e.message;
            work.attempts=(work.attempts||0)+1;
            work.next_retry=new Date(Date.now()+Math.min(600000,5000*Math.pow(2,Math.min(work.attempts-1,6)))).toISOString();
            try{await database('put','queue',work);}
            catch(localError){
              setError('Неуспешно локално запазване на опашката: '+localError.message);
            }
            await refreshQueue();
            break;
          }
          try{await database('put','queue',work);}
          catch(localError){setError('Локална база: '+localError.message);break;}
          o.state=work.state;
        }
        await refreshQueue();
        // Coalesce all acknowledged LOG/INFO/media changes into one fresh read.
        if(touchedCurrent && docRef.current && DB===scope)await loadDocument(docRef.current.id);
        const latest=await database('getAll','queue');
        const ready=latest.some(op=>op.state==='pending' && !op.next_retry &&
          ((op.kind!=='photo'&&op.kind!=='audio_upload')||
           (op.kind==='photo'&&(!op.log_op_id||latest.some(x=>x.op_id===op.log_op_id&&x.state==='synced')))||
           (op.kind==='audio_upload'&&latest.some(x=>x.op_id===op.target_id&&x.state==='synced'))));
        if(ready)window.setTimeout(()=>syncAll(),650);
        setSyncError('');
      }catch(e){setSyncError('Синхронизация: '+e.message);}
      finally{syncingRef.current=false;}
    }
    useEffect(()=>{
      // Recover interrupted uploads in the same user queue without changing their UUIDs.
      // syncAll retries 'sending' as well as 'pending', but only after the page is reopened.
      if(CFG.auth_mode==='public'){
        try {const arr=JSON.parse(localStorage.getItem(localCacheKey('docs'))||'null');
          if(Array.isArray(arr)){setDocs(arr);setSelectedDoc(arr[0]?arr[0].id:'');}
        } catch(e) { /* ignore invalid cache */ }
        refreshQueue();loadDocs();
      }
      if ('serviceWorker' in navigator && CFG.sw_url && window.isSecureContext) {
        navigator.serviceWorker.register(CFG.sw_url,{updateViaCache:'none',scope:(()=>{const path=new URL(CFG.app_url,location.href).pathname;return path.endsWith('/')?path:path+'/';})()}).catch(()=>{});
      }
      const connection=()=>{setOnline(navigator.onLine);if (navigator.onLine && (authRef.current || CFG.auth_mode==='public')) {loadDocs();syncAll();processAudioQueue();}};
      const visibility=()=>{if (!document.hidden&&navigator.onLine){syncAll();processAudioQueue();}};
      window.addEventListener('online',connection);window.addEventListener('offline',connection);
      document.addEventListener('visibilitychange',visibility);
      const timer=window.setInterval(()=>{if(navigator.onLine){syncAll();processAudioQueue();}},45000);
      return ()=>{window.removeEventListener('online',connection);window.removeEventListener('offline',connection);document.removeEventListener('visibilitychange',visibility);clearInterval(timer);};
    },[]);

    // Keep the timer stable across queue state changes and UI re-renders.
    // A fresh guard snapshot prevents a 45s queue refresh from endlessly postponing polling.
    refreshRef.current={id:doc&&doc.id,ready:mode==='session'&&online&&!docLoading&&
      !recording&&!fieldRecording&&!editing&&!logEditor&&!rowAdd&&infoAdding<0&&
      !unsavedAudio&&!draft.trim()&&!photos.length&&!queueOpen&&!gallery&&!logSaving&&
      !rowSaving&&!photoBusy&&
      !queue.some(o=>doc&&o.doc_id===doc.id&&!['synced','cancelled'].includes(o.state)),
      load:loadDocument};
    useEffect(()=>{
      if(mode!=='session'||!doc||!online)return;
      const id=doc.id;
      const timer=window.setInterval(()=>{
        const fresh=refreshRef.current;
        if(document.hidden||!navigator.onLine||syncingRef.current||
           !fresh||fresh.id!==id||!fresh.ready||docRef.current?.id!==id||
           documentReadInFlightRef.current ||
           (readBackoffRef.current.id===id && Date.now()<readBackoffRef.current.nextAt))return;
        fresh.load(id);
      },120000);
      return()=>window.clearInterval(timer);
    },[mode,doc&&doc.id,online]);

    function closeSession() { if(recording)return;clearReadRetry();documentRequestRef.current++;setDocLoading(false);setDocLoadError('');setLastFreshAt('');closeAudioPlayer();setDoc(null);docRef.current=null;setData(null);setMode('choose');setCreating(false);setEditing(null);setError('');if(navigator.onLine)loadDocs(); }
    function openEdit(sheet,row,col,label,base,rowKey,metadata) {
      setEditing(Object.assign({sheet,row,col,label,base:base||'',row_key:rowKey||''},metadata||{}));
      setEditValue(base||'');
    }
    async function saveEdit() {
      if (!doc||!editing) return;
      const o={kind:'field',op_id:uuid(),doc_id:doc.id,sheet:editing.sheet,row:editing.row,col:editing.col,
        base:editing.base,value:editValue,row_key:editing.row_key,
        field_label:editing.field_label||'',header_label:editing.header_label||'',section:editing.section||0};
      const items=await database('getAll','queue');
      const same=items.find(q=>q.kind==='field' && q.doc_id===o.doc_id && q.sheet===o.sheet&&q.row===o.row&&q.col===o.col&&q.state==='pending');
      if(editing.audio_op_id){
        const original=await database('get','queue',editing.audio_op_id);
        if(!original || original.state!=='review'){setError('Аудиозаписът вече е променен.');return;}
        const changed=Object.assign({},original,o,{op_id:original.op_id,created:original.created,state:'pending'});
        delete changed.blob;delete changed.blob_media_id;delete changed.blob_size;delete changed.blob_mime;
        await preserveAudioWithParent(original,'field',changed);
      }else if (same) {
        o.op_id=same.op_id;
        if(editing.voice_clip)await preserveAudioChild({op_id:o.op_id,doc_id:o.doc_id,
          doc_name:doc.name,blob:editing.voice_clip,event_at:editing.voice_time,
          target:{sheet:editing.sheet,row:editing.row,col:editing.col}},'field');
        await database('put','queue',Object.assign({},same,{value:editValue}));
      } else {
        if(editing.voice_clip)await preserveAudioChild({op_id:o.op_id,doc_id:o.doc_id,
          doc_name:doc.name,blob:editing.voice_clip,event_at:editing.voice_time,
          target:{sheet:editing.sheet,row:editing.row,col:editing.col}},'field');
        await enqueue(o);
      }
      await refreshQueue();setEditing(null);setEditValue('');
      if (navigator.onLine)syncAll();
    }
    async function addInfoRole(section) {
      if(!doc || !String(infoRole).trim())return;
      const ok=await enqueue({kind:'add_row',op_id:uuid(),doc_id:doc.id,
        sheet:'INFO',section:section,role:String(infoRole).trim(),values:infoValues});
      if(ok){setInfoAdding(-1);setInfoRole('');setInfoValues([]);
        setNotice('Новото INFO поле е добавено към опашката за синхронизация.');
        if(navigator.onLine)syncAll();}
    }
    async function submitText() {
      if (!doc||!draft.trim()||!checkOperatorName()) return;
      const log={kind:'log',source:'text',doc_id:doc.id,op_id:uuid(),text:draft.trim(),event_at:new Date().toISOString()};
      const ok=await enqueue(log);
      if(ok){
        setDraft('');
        try{await queuePhotosAfterLog(log,photos);setPhotos([]);}catch(e){setError(e.message);}
      }
    }
    async function onSelectPhotos(fileList) {
      setPhotoBusy(true);
      try {
        const added=[];
        for(const file of Array.from(fileList||[]).slice(0,4))added.push(await preparePhoto(file));
        if(photos.length+added.length>4)throw new Error('Максимум четири снимки към нов запис.');
        setPhotos(old=>old.concat(added));setNotice(added.length+' снимки са подготвени. Ще се изпратят заедно със събитието.');
      } catch(e){setError(e.message);} finally {setPhotoBusy(false);}
    }
    async function queuePhotosAfterLog(logOp,selected) {
      for(const photo of selected){
        const ok=await enqueue({kind:'photo',doc_id:logOp.doc_id,doc_name:doc.name,
          log_op_id:logOp.op_id,blob:photo.blob,preview_blob:photo.previewBlob,filename:photo.name,mime:photo.mime});
        if(!ok)throw new Error('Снимката не е запазена локално.');
      }
    }
    async function uploadExistingPhoto(entry,files) {
      try {
        if(!doc)return;
        for(const file of Array.from(files||[]).slice(0,3)){
          const image=await preparePhoto(file);
          await enqueue({kind:'photo',doc_id:doc.id,doc_name:doc.name,
            target_row:entry.row,expected_time:entry.cells[1],expected_text:entry.cells[3],
            blob:image.blob,preview_blob:image.previewBlob,filename:image.name,mime:image.mime});
        }
      }catch(e){setError(e.message);}
    }
    function canDiscardInterruptedAudio(o){
      return o && o.kind==='audio_upload' && o.state==='sending' &&
        !syncingRef.current &&
        Date.now()-Date.parse(o.upload_started||o.created||new Date().toISOString())>15*60000;
    }
    async function dropQueued(o) {
      // Always check IndexedDB instead of relying on a potentially stale rendered state.
      const stored=await database('get','queue',o.op_id);
      if(!stored){await refreshQueue();return;}
      if(['sending','transcribing','synced'].includes(stored.state)&&!canDiscardInterruptedAudio(stored)){
        setError('Изпратен или активно изпращащ се запис не може да бъде изтрит от опашката.');return;
      }
      const target=queueTarget(stored);
      const warning=(stored.attempts||stored.error||stored.state==='sending')?' ВНИМАНИЕ: части от аудиото може вече да са достигнали Google. Оригиналът няма да се възстанови от този браузър.':'';
      if(!window.confirm('Изтриване на непратената операция от '+target+'?'+warning+' Това действие е необратимо.'))return;
      // A background STT/sync job may have started while the confirmation dialog was open.
      const current=await database('get','queue',o.op_id);
      if(!current){await refreshQueue();return;}
      if(['sending','transcribing','synced'].includes(current.state)&&!canDiscardInterruptedAudio(current)){
        setError('Записът вече се обработва или е изпратен. Не е изтрит.');return;
      }
      await database('delete','queue',o.op_id);
      // If a LOG entry has attached photos still waiting, remove those child jobs too.
      if(current.kind==='log'||current.kind==='audio'){
        const attached=(await database('getAll','queue')).filter(x=>
          ((x.kind==='photo'&&x.log_op_id===o.op_id)||(x.kind==='audio_upload'&&x.target_id===o.op_id))&&
          x.state!=='synced'&&x.state!=='sending');
        for(const x of attached)await database('delete','queue',x.op_id);
      }
      await refreshQueue();
      reclaimOrphanMedia().catch(()=>{});
      setNotice('Непратеният запис е изтрит от устройството.');
    }
    function audioContextMeter(stream, onLevel) {
      const AudioContextClass=window.AudioContext||window.webkitAudioContext;
      if(!AudioContextClass)return {stop:()=>{},summary:()=>({activity:undefined,peak:0})};
      let context,source,analyser,timer,peak=0,active=0,count=0;
      try {
        context=new AudioContextClass();source=context.createMediaStreamSource(stream);
        analyser=context.createAnalyser();analyser.fftSize=1024;source.connect(analyser);
        const arr=new Uint8Array(analyser.fftSize),freq=new Uint8Array(analyser.frequencyBinCount);
        timer=setInterval(()=>{
          if(context.state==='closed')return;
          analyser.getByteTimeDomainData(arr);
          let sum=0;for(const b of arr){const n=(b-128)/128;sum+=n*n;}
          const rms=Math.sqrt(sum/arr.length);peak=Math.max(peak,rms);count++;
          // Lightweight VAD precheck: signal level plus energy in the 250-3800 Hz speech band.
          // This is only a risk flag, never proof of speech or silence.
          analyser.getByteFrequencyData(freq);
          let band=0,all=0;
          for(let k=1;k<freq.length;k++){
            const hz=k*context.sampleRate/analyser.fftSize;
            const energy=Math.max(0,freq[k]-12);
            if(hz<=6500)all+=energy;
            if(hz>=250&&hz<=3800)band+=energy;
          }
          if(rms>0.018 && band/(all||1)>0.40)active++;
          if(onLevel)onLevel(Math.min(100,Math.round(rms*700)));
        },220);
      }catch(e){if(context)context.close().catch(()=>{});return {stop:()=>{},summary:()=>({activity:undefined,peak:0})};}
      return {stop:()=>{if(timer)clearInterval(timer);try{source.disconnect();}catch(e){}context.close().catch(()=>{});if(onLevel)onLevel(0);},
        summary:()=>({activity:count?active/count:undefined,peak})};
    }
    async function selectedMicrophoneStream(){
      if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)throw new Error('Браузърът не поддържа микрофон.');
      const base={echoCancellation:true,noiseSuppression:true};
      const audio=chosenMicrophone==='default'?base:Object.assign({},base,{deviceId:{exact:chosenMicrophone}});
      try{return await navigator.mediaDevices.getUserMedia({audio});}
      catch(e){
        if(chosenMicrophone!=='default' && ['NotFoundError','OverconstrainedError'].includes(e.name)){
          setChosenMicrophone('default');try{localStorage.removeItem('bvlog-microphone-id');}catch(err){}
          setNotice('Избраният микрофон липсва. Използва се системният.');
          return navigator.mediaDevices.getUserMedia({audio:base});
        }
        throw e;
      }
    }
    function chooseMic(value){setChosenMicrophone(value);try{localStorage.setItem('bvlog-microphone-id',value);}catch(e){}}
    async function testSelectedMicrophone(){
      if(micTestRef.current)return;
      if(!window.MediaRecorder){setError('Този браузър не поддържа тестов запис.');return;}
      try{
        const stream=await selectedMicrophoneStream();const recorder=new MediaRecorder(stream),chunks=[];
        const meter=audioContextMeter(stream,setMicLevel);
        const session={stream,recorder,meter};micTestRef.current=session;setMicrophoneTest(true);
        recorder.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data);};
        recorder.onstop=()=>{
          meter.stop();stream.getTracks().forEach(t=>t.stop());micTestRef.current=null;setMicrophoneTest(false);
          const blob=new Blob(chunks,{type:recorder.mimeType||'audio/webm'});
          if(blob.size>0)playAudio(blob);
          else setError('Не е записан звук от избрания микрофон.');
        };
        recorder.start(200);
        session.timer=setTimeout(()=>{if(recorder.state!=='inactive')recorder.stop();},4000);
      }catch(e){setMicrophoneTest(false);setError('Тест на микрофона: '+e.message);}
    }
    function queueTarget(o){
      return o.doc_name || (docs.find(d=>d.id===o.doc_id)||{}).name || ('Документ '+String(o.doc_id).slice(0,12));
    }
    async function usePhoneGPS() {
      if(!doc||!data||!data.INFO)return;
      if(!navigator.geolocation){setError('Устройството не поддържа GPS местоположение.');return;}
      setGpsBusy(true);setError('');
      navigator.geolocation.getCurrentPosition(pos=>{
        setGpsBusy(false);
        const coords=pos.coords.latitude.toFixed(6)+', '+pos.coords.longitude.toFixed(6);
        const first=(data.INFO_SECTIONS||[])[0];
        const location=first&&first.rows&&first.rows.find(x=>String(x.label||'').trim().toLowerCase()===B('Lokatsiya').toLowerCase());
        const cell=location&&location.fields&&location.fields[0];
        const current=cell?cell.value:(data.INFO[3]&&data.INFO[3][1]||'');
        openEdit('INFO',location?location.row:4,cell?cell.col:'B','GPS координати (WGS84)',current,'',
          location&&cell?{field_label:location.label,header_label:cell.header,section:location.section}:{});
        setEditValue(coords);
        setNotice('GPS точност ±'+Math.round(pos.coords.accuracy)+' м. Провери координатите и натисни Запази.');
      },e=>{setGpsBusy(false);setError('GPS: '+e.message);},{enableHighAccuracy:true,timeout:18000,maximumAge:0});
    }
    async function submitPhotoOnly(){
      if(!doc||photos.length===0||!checkOperatorName())return;
      const log={kind:'log',source:'text',doc_id:doc.id,op_id:uuid(),text:'Снимка от акцията',event_at:new Date().toISOString()};
      if(await enqueue(log)){
        try{await queuePhotosAfterLog(log,photos);setPhotos([]);}catch(e){setError(e.message);}
      }
    }
    async function saveAudioClip(docForRecording,blob,when,fieldTarget,signal,opId) {
      if(!blob||!blob.size)return false;
      // Retry must reuse the same operation ID, even after an ambiguous local error.
      const stableId=opId||uuid();
      if(opId){
        try {
          const existing=await database('get','queue',stableId);
          if(existing){
            setUnsavedAudio(null);
            await refreshQueue();
            setNotice('Аудиото вече е запазено локално.');
            return true;
          }
        }catch(e){setError('Локална база: '+e.message);return false;}
      }
      const audio={kind:'audio',doc_id:docForRecording.id,doc_name:docForRecording.name,
        op_id:stableId,blob,event_at:when,state:'audio',mic_signal:signal||null};
      if(fieldTarget)audio.target=Object.assign({kind:'field'},fieldTarget);
      if(await enqueue(audio)){
        setUnsavedAudio(null);
        if(!fieldTarget)try{await queuePhotosAfterLog(audio,photos);setPhotos([]);}catch(e){setError(e.message);}
        return true;
      }
      // Keep in-memory bytes and the same operation ID for an explicit retry.
      setUnsavedAudio({blob,docForRecording,when,fieldTarget,signal,op_id:stableId});
      setError('Аудиото НЕ е съхранено. Изтегли резервно копие преди затваряне на страницата.');
      return false;
    }
    async function retryUnsavedAudio(){
      if(!unsavedAudio)return;
      await saveAudioClip(unsavedAudio.docForRecording,unsavedAudio.blob,
        unsavedAudio.when,unsavedAudio.fieldTarget,unsavedAudio.signal,unsavedAudio.op_id);
    }
    function downloadBlob(blob,when){
      if(!blob||!blob.size)return;
      const file=URL.createObjectURL(blob);
      const a=document.createElement('a');a.href=file;
      a.download='voice-log-'+(when||'unknown').replace(/[:.]/g,'-')+
        (blob.type.includes('mp4')?'.m4a':blob.type.includes('ogg')?'.ogg':'.webm');
      a.click();setTimeout(()=>URL.revokeObjectURL(file),30000);
    }
    async function startRecording() {
      if(!doc || !checkOperatorName())return;
      if(!window.isSecureContext){setError('За микрофон е необходим HTTPS адрес.');return;}
      const cloudMode=CFG.stt_mode==='cloud';
      const Speech=cloudMode?null:(window.SpeechRecognition||window.webkitSpeechRecognition);
      setError('');setNotice('');setVoiceIssue('');setLiveText('');
      let stream=null, media=null;
      try {
        if(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder) {
          stream=await selectedMicrophoneStream();
          media=new MediaRecorder(stream);
        }
      }catch(e){
        setVoiceIssue('Микрофон/аудио: '+e.message);
        if(stream)stream.getTracks().forEach(t=>t.stop());
        if(!Speech){setError('Микрофонът е недостъпен. Разреши достъпа през иконата до адреса.');return;}
        stream=null;media=null;
      }
      if(!media && (cloudMode || !Speech || !navigator.onLine)){
        setError('Браузърът не позволява аудиозапис или разпознаване в този режим. Използвай текстовото поле.');return;
      }
      const session={doc:doc,at:new Date().toISOString(),media,stream,chunks:[],recognized:'',
        meter:stream?audioContextMeter(stream,setMicLevel):null,
        recognizer:null,stopping:false,recognitionEnded:false,restarts:0,committed:'',voiceError:'',resolveSpeech:null};
      if(media){
        media.ondataavailable=e=>{if(e.data&&e.data.size)session.chunks.push(e.data);};
        media.start(400);
      }
      if(Speech && navigator.onLine && !cloudMode){
        try {
          const sr=new Speech();session.recognizer=sr;
          sr.lang='bg-BG';sr.interimResults=true;sr.continuous=true;sr.maxAlternatives=1;
          sr.onresult=e=>{
            let finalParts=[], interimParts=[];
            for(let i=0;i<e.results.length;i++){
              const transcript=e.results[i][0] && e.results[i][0].transcript || '';
              (e.results[i].isFinal?finalParts:interimParts).push(transcript);
            }
            const words=finalParts.concat(interimParts).join(' ').trim();
            if(words){session.recognized=(session.committed+' '+words).trim();setLiveText(session.recognized);}
          };
          sr.onerror=e=>{
            session.voiceError=e.error||'unknown';
            const reason={notAllowed:'няма разрешение', 'not-allowed':'няма разрешение',
              'service-not-allowed':'услугата е блокирана',network:'проблем с мрежата',
              'language-not-supported':'български не се поддържа',audioCapture:'микрофонът е недостъпен',
              'audio-capture':'микрофонът е недостъпен',noSpeech:'няма разпозната реч',
              'no-speech':'няма разпозната реч'}[session.voiceError]||session.voiceError;
            setVoiceIssue('Разпознаване: '+reason+'. Ако няма текст, аудиото ще остане за ръчна транскрипция.');
          };
          sr.onend=()=>{
            session.recognitionEnded=true;
            if(session.resolveSpeech)session.resolveSpeech();
            if(!session.stopping && recordingRef.current===session && session.restarts<2 &&
               !['not-allowed','service-not-allowed','audio-capture'].includes(session.voiceError)){
              session.restarts++;
              session.committed=session.recognized;
              window.setTimeout(()=>{if(recordingRef.current===session&&!session.stopping){
                try{sr.start();session.recognitionEnded=false;}catch(e){setVoiceIssue('Разпознаването спря: '+e.message);}
              }},300);
            }
          };
          sr.start();
          setNotice('Разпознаване на български: активно. Ако не се появява текст, отвори „Опашка“ след края.');
        }catch(e){session.voiceError=e.message;setVoiceIssue('Неуспешно стартиране на транскрипцията: '+e.message);}
      }else{
        if(cloudMode && !CFG.stt_cloud)setVoiceIssue('STT не е настроен. Аудиото ще остане в опашката.');
      }
      recordingRef.current=session;setRecording(true);
      session.stopTimer=window.setTimeout(()=>{
        if(recordingRef.current===session){
          setNotice('Максимум 3 минути на запис. Аудиото се запазва локално.');
          stopRecording().catch(e=>setError(e.message));
        }
      },180000);
      if(navigator.vibrate)navigator.vibrate(50);
    }
    async function stopRecording() {
      const r=recordingRef.current;
      if(!r)return;
      r.stopping=true;recordingRef.current=null;setRecording(false);
      if(r.stopTimer)window.clearTimeout(r.stopTimer);
      if(navigator.vibrate)navigator.vibrate([70,40,70]);
      // Wait for the recognizer final result/onend, not an arbitrary fixed delay.
      if(r.recognizer){
        const ended=new Promise(resolve=>{
          r.resolveSpeech=resolve;
          if(r.recognitionEnded)resolve();
          else window.setTimeout(resolve,1400);
        });
        try{r.recognizer.stop();}catch(e){}
        await ended;
      }
      let blob=null;
      if(r.media){
        blob=await new Promise(resolve=>{
          r.media.onstop=()=>resolve(new Blob(r.chunks,{type:r.media.mimeType||'audio/webm'}));
          if(r.media.state!=='inactive')r.media.stop();
          else resolve(new Blob(r.chunks,{type:r.media.mimeType||'audio/webm'}));
        });
      }
      const signal=r.meter?r.meter.summary():null;
      if(r.meter)r.meter.stop();
      if(r.stream)r.stream.getTracks().forEach(t=>t.stop());
      if(CFG.stt_mode==='cloud' && blob && blob.size){
        await saveAudioClip(r.doc,blob,r.at,null,signal);
      }else if(r.recognized.trim()){
        const log={kind:'log',source:'voice',doc_id:r.doc.id,op_id:uuid(),text:r.recognized.trim(),event_at:r.at};
        if(blob&&blob.size)await preserveAudioChild(Object.assign({},log,{blob,doc_name:r.doc.name}),'log');
        const saved=await enqueue(log);
        if(saved){try{await queuePhotosAfterLog(log,photos);setPhotos([]);}catch(e){setError(e.message);}}
      }else if(blob && blob.size){
        await saveAudioClip(r.doc,blob,r.at,null,signal);
      }else{
        setError('Няма разпознат текст или аудиозапис. Опитай отново или въведи текст.');
      }
      setLiveText('');
    }
    // Stable child ID prevents duplicate audio attachments after a crash/retry.
    function childAudioOpId(parentId){
      const id=String(parentId||'');
      return (id[0]==='a'?'b':'a')+id.slice(1);
    }
    async function makeAudioChild(o,targetKind){
      if(!hasQueueMedia(o))return null;
      const old=(await database('getAll','queue')).find(x=>x.kind==='audio_upload'&&x.target_id===o.op_id&&x.target_kind===targetKind);
      if(old)return old;
      const item={kind:'audio_upload',doc_id:o.doc_id,doc_name:o.doc_name,
        op_id:childAudioOpId(o.op_id),target_id:o.op_id,target_kind:targetKind,
        field_sheet:targetKind==='field'&&o.target?o.target.sheet:'',
        field_row:targetKind==='field'&&o.target?o.target.row:0,
        field_col:targetKind==='field'&&o.target?o.target.col:'',
        mime:(o.blob_mime||(o.blob&&o.blob.type)||'audio/webm').split(';')[0],
        event_at:o.event_at,created:new Date().toISOString(),state:'pending',
        author:o.author||((authRef.current&&authRef.current.name)||'')};
      if(o.blob_media_id){
        item.blob_media_id=o.blob_media_id;
        item.blob_size=o.blob_size;
        item.blob_mime=o.blob_mime;
      }else item.blob=o.blob; // Legacy record, converted before the group transaction.
      return item;
    }
    async function preserveAudioChild(o,targetKind){
      const child=await makeAudioChild(o,targetKind);
      if(child)await database('put','queue',child);
      return child;
    }
    async function preserveAudioWithParent(o,targetKind,parent){
      const child=await makeAudioChild(o,targetKind);
      if(!child)throw new Error('Оригиналното аудио не е налично локално.');
      // No await between creating the child and removing the audio reference from the parent.
      await writeQueueGroup([child,parent]);
    }
    async function audioToText(o,text,quality) {
      if(!text||!text.trim())return;
      const clean=text.trim();let newer;
      if(clean.length>3000){
        newer=Object.assign({},o,{state:'audio',transcript:clean,stt_attempts:4,
          stt_error:'Транскрипцията е над 3000 символа. Съкрати текста ръчно; аудиото е запазено.'});
      }else if(o.target&&o.target.kind==='field'){
        newer=Object.assign({},o,{state:'review',transcript:clean,stt_error:'',quality:quality||null});
      }else if(quality&&quality.status==='suspicious'){
        newer=Object.assign({},o,{state:'voice_review',transcript:clean,quality:quality,
          stt_attempts:4,stt_error:'Провери аудиото преди запис в LOG.'});
      }else{
        newer=Object.assign({},o,{kind:'log',source:'voice',text:clean,state:'pending',stt_error:'',quality:quality||null});
        delete newer.blob;delete newer.blob_media_id;
        delete newer.blob_size;delete newer.blob_mime;
        await preserveAudioWithParent(o,'log',newer);
        await refreshQueue();
        if(navigator.onLine)syncAll();
        return;
      }
      await database('put','queue',newer);await refreshQueue();
    }
    function voiceDraft(o) {
      return Object.prototype.hasOwnProperty.call(voiceReviewDrafts,o.op_id)?
        voiceReviewDrafts[o.op_id]:(o.transcript||'');
    }
    function updateVoiceDraft(o,text) {
      setVoiceReviewDrafts(old=>Object.assign({},old,{[o.op_id]:text}));
    }
    function clearVoiceDraft(opId) {
      setVoiceReviewDrafts(old=>{const next=Object.assign({},old);delete next[opId];return next;});
    }
    async function approveVoice(o){
      try {
        const stored=await database('get','queue',o.op_id);
        if(!stored||stored.state!=='voice_review')return;
        const text=voiceDraft(stored).trim();
        if(!text){setError('Потвърди текста на гласовия запис.');return;}
        await audioToText(Object.assign({},stored,{state:'audio'}),text,null);
        const updated=await database('get','queue',o.op_id);
        if(updated&&updated.kind==='log'){
          clearVoiceDraft(o.op_id);
          setNotice('Провереният текст е добавен за синхронизация.');
        }
      }catch(e){setError('Потвърждение на диктовката: '+e.message);}
    }
    async function saveAudioText(o){
      try {
        const text=voiceDraft(o).trim();
        if(!text)return;
        await audioToText(o,text,null);
        const updated=await database('get','queue',o.op_id);
        if(updated&&updated.kind==='log')clearVoiceDraft(o.op_id);
      }catch(e){setError('Ръчна транскрипция: '+e.message);}
    }
    function voiceInputControls(o) {
      const text=voiceDraft(o);
      return h('div',{className:'bv-inline-voice-review'},
        o.state==='voice_review'&&h('p',{className:'bv-voice-issue'},
          'Провери транскрипцията и прослушай оригинала преди изпращане.'),
        h('textarea',{className:'bv-textarea',value:text,maxLength:3000,
          'aria-label':'Транскрипция за проверка',
          placeholder:'Въведи или поправи текста на гласовия запис...',
          onChange:e=>updateVoiceDraft(o,e.target.value)}),
        h(Button,{disabled:!text.trim(),onClick:()=>o.state==='voice_review'?approveVoice(o):saveAudioText(o)},
          o.state==='voice_review'?'Потвърди и запиши':'Запиши текста'));
    }

    async function toggleFieldVoice() {
      const existing=fieldRecordingRef.current;
      if (existing) {
        fieldRecordingRef.current=null;setFieldRecording(false);
        if(existing.stopTimer)window.clearTimeout(existing.stopTimer);
        try {if (existing.recognizer) existing.recognizer.stop();}catch(e){}
        const clip=await new Promise(resolve=>{
          existing.media.onstop=()=>resolve(new Blob(existing.chunks,{type:existing.media.mimeType||'audio/webm'}));
          if(existing.media.state!=='inactive')existing.media.stop();else resolve(new Blob(existing.chunks));
        });
        existing.stream.getTracks().forEach(t=>t.stop());
        await new Promise(resolve=>setTimeout(resolve,550));
        if(CFG.stt_mode==='cloud' && clip.size){
          await saveAudioClip(existing.doc,clip,existing.at,existing.target);
          setNotice('Аудиото е в локалната опашка. След транскрипция провери стойността преди запис.');
        }else if (existing.recognized.trim()) {
          if(clip.size)setEditing(old=>old?Object.assign({},old,{voice_clip:clip,voice_time:existing.at}):old);
          setEditValue(existing.recognized.trim());
          setNotice(B('Transkriptsiyata e gotova. Proveri i zapazi poleto.'));
        } else if (clip.size) {
          await enqueue({kind:'audio',doc_id:existing.doc.id,doc_name:existing.doc.name,
            blob:clip,event_at:existing.at,state:'audio',target:Object.assign({kind:'field'},existing.target)});
          setNotice(B('Audio e zapazeno oflayn. Mozhesh da go transkribirash po-kqsno.'));
        }
        return;
      }
      if (!editing || !doc) return;
      if (!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia||!window.MediaRecorder) {
        setError(B('Brauzqrqt ne pozvolyava zapis ot mikrofona.'));return;
      }
      let stream;
      try {stream=await selectedMicrophoneStream();}
      catch(e){setError(B('Mikrofon: ')+e.message);return;}
      const media=new MediaRecorder(stream);
      const current={stream,media,chunks:[],recognized:'',doc:doc,at:new Date().toISOString(),target:{
        sheet:editing.sheet,row:editing.row,col:editing.col,base:editing.base,row_key:editing.row_key
      },recognizer:null};
      media.ondataavailable=e=>{if(e.data&&e.data.size)current.chunks.push(e.data);};
      media.start(400);
      const Speech=CFG.stt_mode==='cloud'?null:(window.SpeechRecognition||window.webkitSpeechRecognition);
      if(Speech&&navigator.onLine){
        try {const sr=new Speech();sr.lang='bg-BG';sr.interimResults=true;sr.continuous=true;
          sr.onresult=e=>{let txt='';for(let i=0;i<e.results.length;i++)txt+=e.results[i][0].transcript+' ';current.recognized=txt.trim();setEditValue(txt.trim());};
          sr.onerror=e=>setVoiceIssue('Диктовка на поле: '+(e.error||'неизвестна грешка'));
          sr.start();current.recognizer=sr;
        }catch(e){}
      }
      fieldRecordingRef.current=current;setFieldRecording(true);
      current.stopTimer=window.setTimeout(()=>{
        if(fieldRecordingRef.current===current){
          setNotice('Максимум 3 минути на поле. Аудиото се запазва локално.');
          toggleFieldVoice().catch(e=>setError(e.message));
        }
      },180000);
    }
    function reviewAudioField(o) {
      if(!o.target || o.state!=='review')return;
      setEditing(Object.assign({},o.target,{audio_op_id:o.op_id,label:'Провери гласовата транскрипция'}));
      setEditValue(o.transcript||'');setQueueOpen(false);
    }
    function disposeCurrentAudioUrl(){
      if(audioElementRef.current)audioElementRef.current.pause();
      if(audioUrlRef.current){URL.revokeObjectURL(audioUrlRef.current);audioUrlRef.current='';}
    }
    function stopAudioPlayback(){
      const player=audioElementRef.current;
      if(!player)return;
      player.pause();
      try{player.currentTime=0;}catch(e){}
      setAudioPlayerMessage('Възпроизвеждането е спряно.');
    }
    function closeAudioPlayer(){
      audioSequenceRef.current++;
      if(audioFetchRef.current){audioFetchRef.current.abort();audioFetchRef.current=null;}
      disposeCurrentAudioUrl();
      setAudioPlayer(null);setAudioPlayerMessage('');setAudioLoadingMessage('');setAudioBusy('');
    }
    function showAudioBlob(blob,label){
      if(!blob || !blob.size){setError('Оригиналното аудио е празно.');return;}
      disposeCurrentAudioUrl();
      const url=URL.createObjectURL(blob);
      audioUrlRef.current=url;
      setAudioPlayer({url:url,label:label||'Оригинално аудио'});
      setAudioPlayerMessage('');setAudioLoadingMessage('');
    }
    // Browser media playback may require a second tap after a long network load.
    useEffect(()=>{
      if(!audioPlayer || !audioPlayer.url || !audioElementRef.current)return;
      const el=audioElementRef.current;
      try{
        const started=el.play();
        if(started && started.catch)started.catch(err=>{
          if(err && err.name==='NotAllowedError')setAudioPlayerMessage('Натисни Play, за да започне прослушването.');
          else if(err && err.name!=='AbortError')setAudioPlayerMessage('Неуспешно възпроизвеждане. Опитай Play или друг браузър.');
        });
      }catch(e){setAudioPlayerMessage('Натисни Play, за да прослушаш аудиото.');}
    },[audioPlayer && audioPlayer.url]);
    async function playRemoteAudio(entry){
      if(!doc || !entry.audio || !entry.audio.id)return;
      const id=entry.audio.id,cacheKey=doc.id+':'+id;
      // Cancelling a download must not overwrite a newer player's state.
      closeAudioPlayer();
      const cached=audioBlobCacheRef.current.get(cacheKey);
      if(cached){showAudioBlob(cached,'Оригинално аудио');return;}
      const task=++audioSequenceRef.current;
      const controller=new AbortController();audioFetchRef.current=controller;
      setAudioBusy(id);setAudioPlayer({url:'',label:'Зареждане на оригиналното аудио'});
      setAudioLoadingMessage('Свързване с Google Drive...');setError('');
      try{
        const buffers=[];let offset=0,total=null,mime='audio/webm';
        for(let attempt=0;attempt<45;attempt++){
          const answer=await api('audio-view?doc_id='+encodeURIComponent(doc.id)+
            '&audio_id='+encodeURIComponent(id)+'&offset='+offset,'GET',null,controller.signal);
          if(controller.signal.aborted||task!==audioSequenceRef.current)return;
          if(!answer.ok || !answer.base64)throw new Error(answer.message||'Не може да се прочете оригиналното аудио.');
          const size=Number(answer.size),next=Number(answer.next);
          if(!Number.isInteger(size)||size<1||size>8*1024*1024 ||
             !Number.isInteger(next)||next<=offset||next>size)throw new Error('Невалиден аудио фрагмент.');
          const raw=atob(answer.base64),bytes=new Uint8Array(raw.length);
          if(bytes.length!==next-offset)throw new Error('Размерът на аудио фрагмента не съвпада.');
          for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
          buffers.push(bytes);mime=answer.mime||mime;total=size;offset=next;
          setAudioLoadingMessage('Изтегляне: '+Math.min(100,Math.round(100*offset/total))+'%');
          if(offset>=total)break;
        }
        if(offset!==total)throw new Error('Аудиофайлът е непълен.');
        const blob=new Blob(buffers,{type:mime});
        const cache=audioBlobCacheRef.current;
        cache.delete(cacheKey);cache.set(cacheKey,blob);
        while(cache.size>3)cache.delete(cache.keys().next().value);
        showAudioBlob(blob,'Оригинално аудио');
      }catch(e){
        if(!controller.signal.aborted && task===audioSequenceRef.current){
          setAudioPlayer(null);setError('Оригинално аудио: '+e.message);
        }
      }finally{
        if(task===audioSequenceRef.current){audioFetchRef.current=null;setAudioBusy('');setAudioLoadingMessage('');}
      }
    }
    async function saveLogChange(entry,action,text){
      if(!doc||!entry)return;
      const cells=entry.cells||[];
      if(action==='edit' && !String(text||'').trim()){setError('Текстът не може да е празен.');return;}
      if(action==='cancel'&&!window.confirm('Анулиране на събитието? То ще остане в журнала и в историята, но ще бъде маркирано като анулирано.'))return;
      setLogSaving(true);
      try{
        const ok=await enqueue({kind:'log_change',doc_id:doc.id,op_id:uuid(),
          log_op_id:cells[6]||'',target_row:entry.row,expected_time:cells[1]||'',expected_text:cells[3]||'',
          action:action,text:action==='edit'?String(text).trim():'',event_at:new Date().toISOString()});
        if(ok){setLogEditor(null);setEventMenu(null);setNotice(action==='edit'?'Редакцията чака синхронизация.':'Анулирането чака синхронизация.');}
      }finally{setLogSaving(false);}
    }
    async function downloadAudio(o) {
      try{const blob=await queueBlob(o);if(!blob)throw new Error('Аудиофайлът липсва.');
        downloadBlob(blob,o.event_at||'unknown');}
      catch(e){setError('Локално аудио: '+e.message);}
    }
    function playAudio(blob) {
      closeAudioPlayer();
      showAudioBlob(blob,'Локален аудиозапис');
    }
    async function playQueueAudio(o){
      try{const blob=await queueBlob(o);if(!blob)throw new Error('Аудиофайлът липсва.');playAudio(blob);}
      catch(e){setError('Локално аудио: '+e.message);}
    }
    async function resolveConflict(o,takeMine) {
      if (takeMine) {
        await database('put','queue',Object.assign({},o,{state:'pending',force_base:o.current,error:''}));
        await refreshQueue();syncAll();
      } else {
        await database('put','queue',Object.assign({},o,{state:'cancelled',error:''}));
        await refreshQueue();if(doc)loadDocument(doc.id);
      }
    }
    const waiting=queue.filter(o=>o.state!=='synced'&&o.state!=='cancelled').length;
    const localSaveFailed=!!unsavedAudio;
    const queueAccessible=!!auth||CFG.auth_mode==='public';
    const requiresReview=o=>['conflict','review','voice_review','error','local_error'].includes(o.state)||
      (o.state==='audio'&&((o.stt_attempts||0)>=4||!!o.stt_error));
    const needsReview=queue.filter(requiresReview).length+(localSaveFailed?1:0);
    const completedCount=queue.filter(o=>o.state==='synced'||o.state==='cancelled').length;
    const displayedQueue=queue.filter(o=>showCompletedQueue||!['synced','cancelled'].includes(o.state))
      .slice().sort((a,b)=>Number(requiresReview(b))-Number(requiresReview(a))
        || String(b.created||'').localeCompare(String(a.created||'')));
    const myQueue=queue.filter(o=>!doc||o.doc_id===doc.id).slice().reverse();
    const logs=data&&data.LOG||[];
    const journalFeed=journalEntries(queue,logs,doc&&doc.id,35);
    const title=doc&&doc.name||'Документ за координация на акция';
    function loadingRows(label){
      return h('div',{className:'bv-loading-rows',role:'status','aria-live':'polite'},
        h('p',null,label||'Зареждане на данните от Google Sheets...'),
        [0,1,2].map(i=>h('div',{className:'bv-skeleton-card',key:i,'aria-hidden':'true'},
          h('span',{className:'bv-skeleton-short'}),
          h('span',{className:'bv-skeleton-long'}),
          h('span',{className:'bv-skeleton-mid'}))));
    }
    return h('div',{className:'bv-shell '+((audioPlayer||audioBusy)?'bv-has-audio':'')},
      h('header',{className:'bv-header'},
        h('div',{className:'bv-brand'},h('span',{className:'bv-brand-icon'},h('img',{src:CFG.logo_url||'',alt:'СКБ'})),
          h('div',null,h('strong',null,'Документ за координация на акция'),h('small',null,'Спасителен клуб за бъдеще'),
            h('small',{className:'bv-build-id',title:'Running JavaScript build (not the HTML-configured version)'},
              'WP '+(CFG.plugin_version||'?')+' / JS '+BVLOG_RUNNING_BUILD))),
        h('div',{className:'bv-top-controls'},
          queueAccessible&&h('button',{type:'button',className:'bv-queue-toggle'+(needsReview?' has-alert':''),
            onClick:()=>{setShowCompletedQueue(false);setQueueOpen(true);},
            title:needsReview?needsReview+' операции изискват проверка':'Виж локалната опашка',
            'aria-label':'Опашка: '+waiting+' чакащи, '+needsReview+' за проверка'},
            icon(needsReview?'alert':'clock',17),h('span',{className:'bv-queue-label'},'Опашка'),
            h('span',{className:'bv-queue-count'},waiting)),
          auth&&auth.kind==='google'&&h('button',{className:'bv-logout-top',onClick:googleLogout,title:'Изход от Google сесията'},icon('logout',16)),
          h('div',{className:'bv-connect '+(online?'connected':'disconnected')},icon(online?'cloud':'offline',17),online?B('Onlayn'):B('Oflayn')))),
      error&&h('div',{className:'bv-banner error'},icon('alert',18),h('span',null,error),h('button',{onClick:()=>setError(''),'aria-label':'Close'},icon('close',16))),
      localStoreError&&h('div',{className:'bv-banner error',role:'alert'},icon('alert',18),
        h('span',null,'Локално съхранение: '+localStoreError),
        h('button',{onClick:()=>setLocalStoreError(''),'aria-label':'Затвори предупреждението'},icon('close',16))),
      syncError&&h('div',{className:'bv-banner error',role:'alert'},icon('alert',18),
        h('span',null,syncError),h('button',{onClick:()=>setSyncError(''),'aria-label':'Затвори'},icon('close',16))),
      CFG.expected_build && CFG.expected_build!==BVLOG_RUNNING_BUILD && h('div',{className:'bv-banner error',role:'alert'},'Несъответствие между заредения JavaScript и версията на сайта. Презареди, когато не записваш.'),
      notice&&h('div',{className:'bv-banner info'},icon('info',16),h('span',null,notice),h('button',{onClick:()=>setNotice(''),'aria-label':'Close'},icon('close',14))),
      (audioPlayer||audioBusy)&&h('section',{className:'bv-audio-dock',role:'region','aria-label':'Прослушване на оригинално аудио'},
        h('div',{className:'bv-audio-dock-title'},h('strong',null,(audioPlayer&&audioPlayer.label)||'Оригинално аудио'),
          h('button',{type:'button',onClick:closeAudioPlayer,'aria-label':'Затвори аудио плейъра'},icon('close',18))),
        (audioPlayer && audioPlayer.url)
          ?h('div',{className:'bv-audio-dock-actions'},
            h('audio',{ref:audioElementRef,src:audioPlayer.url,controls:true,preload:'metadata',
              onError:()=>setAudioPlayerMessage('Този аудиоформат не може да се възпроизведе в браузъра.')}),
            h('button',{type:'button',onClick:stopAudioPlayback,className:'bv-audio-stop'},icon('stop',17),' Стоп'))
          :h('div',{className:'bv-audio-loading'},h('span',null,audioLoadingMessage||'Зарежда се...'),
            h('button',{type:'button',onClick:closeAudioPlayer},'Откажи')),
        audioPlayerMessage&&h('small',{className:'bv-audio-message'},audioPlayerMessage)),
      (authLoading && CFG.auth_mode==='google') ? h('main',{className:'bv-content'},h('p',null,'Проверка на Google сесията...')) :
      (!auth && CFG.auth_mode==='google') ? h('main',{className:'bv-content bv-login'},
        h('div',{className:'bv-card bv-login-card'},
          h('img',{src:CFG.logo_url||'',alt:'Спасителен клуб за бъдеще',className:'bv-login-logo'}),
          h('h1',null,'Документ за координация на акция'),
          h('p',null,'Влез с одобрен Google акаунт, без WordPress регистрация.'),
          CFG.google_client_id ? h('div',{id:'bvlog-google-signin'}) : h('p',{className:'bv-banner error'},'Администраторът трябва да настрои Google OAuth Client ID.'),
          loginError&&h('p',{className:'bv-banner error'},loginError))) :
      !auth && CFG.auth_mode==='wordpress' ? h('main',{className:'bv-content'},h('div',{className:'bv-card'},
        'Необходим е WordPress вход.', h('a',{href:'/wp-login.php?redirect_to='+encodeURIComponent(location.href)},'Вход'))) :
      mode==='choose' ? h('main',{className:'bv-content'},
        h('div',{className:'bv-headline'},h('h1',null,B('Izbor na aktsiya')),h('p',null,B('Izberi dokument ili sqzday nov ot shablona.'))),
        ANONYMOUS&&h('div',{className:'bv-card bv-operator-card'},
          h('label',null,B('Ime na operatora'),
            h('input',{className:'bv-input',type:'text',autoComplete:'name',value:operatorName,maxLength:80,required:true,placeholder:B('Dve imena'),onChange:e=>changeOperatorName(e.target.value)})),
          h('p',{className:'bv-muted'},B('Popqlva se vednqzh na tova ustroystvo i se zapisva v zhurnala. Nqma proverka na samolichnostta.'))),
        h('div',{className:'bv-card'},
          h('div',{className:'bv-row spread'},h('strong',null,B('Sqshtestvuvashta aktsiya')),h('button',{className:'bv-icon-btn',onClick:loadDocs,disabled:docsLoading},icon('refresh',18))),
          docsError&&h('div',{className:'bv-load-error',role:'alert'},
            'Списъкът с акции не е обновен: '+docsError,
            h('button',{type:'button',onClick:loadDocs,disabled:docsLoading},'Опитай отново')),
          docs.length ? h('select',{className:'bv-input',value:selectedDoc,onChange:e=>setSelectedDoc(e.target.value)},docs.map((d,i)=>h('option',{key:d.id,value:d.id},(i===0?'* ':'')+d.name)))
          : h('p',{className:'bv-muted'},docsLoading?B('Zarezhdane...'):B('Nyama drugi dokumenti v papkata.')),
          h(Button,{disabled:!selectedDoc,onClick:()=>startSession(docs.find(d=>d.id===selectedDoc))},icon('arrow',18),' ',B('Otvori aktsiyata'))),
        h('div',{className:'bv-or'},B('ILI')),
        h('div',{className:'bv-card'},
          h('button',{className:'bv-row spread bv-switch',onClick:()=>{if(!creating)setIncidentDate(sofiaTodayISO());setCreating(!creating);}},h('strong',null,B('Sqzday nova aktsiya')),icon(creating?'close':'plus',20)),
          creating&&h('div',{className:'bv-form'},
            h('label',null,B('Tip aktsiya'),h('select',{value:newType,onChange:e=>{setNewType(e.target.value);setCreateId(uuid());},className:'bv-input'},actionTypes.map(v=>h('option',{key:v,value:v},v)))),
            h('label',null,B('Naseleno myasto'),h('input',{className:'bv-input',value:newPlace,maxLength:100,placeholder:B('napr. gr. Samokov'),onChange:e=>{setNewPlace(e.target.value);setCreateId(uuid());}})),
            h('label',null,'Дата на акцията',h('input',{className:'bv-input',type:'date',value:incidentDate,
              onChange:e=>{setIncidentDate(e.target.value);setCreateId(uuid());},required:true})),
            h('div',{className:'bv-preview'},B('Ime na dokumenta')+': ',(incidentDate||'YYYY-MM-DD').replaceAll('-','.'),' - ',B('DKA'),' - ',newType,' - ',newPlace||'...'),
            h(Button,{disabled:busy||!newPlace.trim()||!isIncidentDate(incidentDate)||!online,onClick:newDocument},busy?B('Sqzdava se...'):B('Sqzday i otvori')))),
        !online&&h('div',{className:'bv-card bv-offline-last'},h('p',null,B('Oflayn: mozhe da prodqlzhish poslednata aktsiya.')),
          h(Button,{secondary:true,onClick:()=>{try{const d=JSON.parse(localStorage.getItem(localCacheKey('last-doc'))||'null');if(d)startSession(d);}catch(e){}}},B('Posledna aktsiya'))),
        queueAccessible&&h('button',{className:'bv-queue-link',onClick:()=>setQueueOpen(true)},icon('clock',16),waiting+' '+B('neizprateni operatsii'),' · Виж')
      ) : h('main',{className:'bv-content bv-session'},
        h('div',{className:'bv-action-top'},
          h('div',null,h('span',{className:'bv-kicker'},B('AKTIVNA AKTSIYA')),h('h1',null,title),
            doc&&doc.id&&h('a',{className:'bv-sheet-link',target:'_blank',rel:'noopener noreferrer',
              href:doc.url||('https://docs.google.com/spreadsheets/d/'+encodeURIComponent(doc.id)+'/edit')},
              icon('list',16),' ',B('Otvori tablitsata'))),
          h('div',{className:'bv-action-buttons'},
            h('div',{className:'bv-fresh-label',role:'status'},
              !online?'Офлайн копие':docLoadError?'Обновяването е неуспешно':
              docLoading?'Обновяване...':lastFreshAt?'Обновено '+timeOf(lastFreshAt):'Няма потвърдено обновяване',
              h('small',null,'Автоматично: на 2 мин. при безопасни условия')),
            h('button',{className:'bv-icon-btn',type:'button',onClick:()=>loadDocument(doc.id),
              title:'Обнови данните от Google Sheets',disabled:docLoading||!online},icon('refresh',20)),
            h('button',{className:'bv-icon-btn',onClick:closeSession,title:B('Smeni aktsiyata'),disabled:recording},icon('logout',20)))),
        h('nav',{className:'bv-tabs','aria-label':'Tabs'},[
          ['LOG','list',B('Zhurnal')],['INFO','info',B('Info')],['TECH','truck',B('Tehnika')],['TEAM','users',B('Ekip')]
        ].map(x=>h('button',{key:x[0],className:page===x[0]?'selected':'',onClick:()=>{if(!recording){setPage(x[0]);setEditing(null);}}},icon(x[1],19),h('span',null,x[2])))),
        data&&Array.isArray(data.MISSING_TABS)&&data.MISSING_TABS.length>0&&
          h('div',{className:'bv-banner error',role:'alert'},
            'Липсващи листове в Google Sheets: '+data.MISSING_TABS.join(', ')+
            '. Наличните раздели остават достъпни; не записвай в липсващ лист.'),
        docLoading&&h('div',{className:'bv-loading-inline',role:'status','aria-live':'polite'},
          h('span',{className:'bv-loading-spinner','aria-hidden':'true'}),data?'Обновяване на данните...':'Зареждане от Google Sheets...'),
        docLoadError&&!docLoading&&h('div',{className:'bv-load-error',role:'alert'},
          h('span',null,docLoadError),
          h('button',{type:'button',onClick:()=>loadDocument(doc.id)},'Опитай отново')),
        page==='LOG' ? h('section',{className:'bv-log-page'},
          h('div',{className:'bv-recorder'},
            h('div',{className:'bv-recorder-controls'},
              h('button',{className:'bv-mic '+(recording?'active':''),onClick:recording?stopRecording:startRecording,
                'aria-label':recording?B('Stop na zapis'):B('Zapochni zapis')},icon(recording?'close':'mic',46)),
              h('button',{type:'button',className:'bv-mic-settings',onClick:()=>setMicrophoneMenu(v=>!v),
                title:'Настройки на микрофона','aria-expanded':microphoneMenu,'aria-label':'Избор и тест на микрофона'},icon('settings',21))),
            microphoneMenu&&h('div',{className:'bv-mic-menu'},
              h('label',null,'Микрофон',h('select',{className:'bv-input',value:chosenMicrophone,
                disabled:recording||microphoneTest,onChange:e=>chooseMic(e.target.value)},
                h('option',{value:'default'},'Системен (по подразбиране)'),
                microphones.filter(x=>x.deviceId&&x.deviceId!=='default').map((x,i)=>
                  h('option',{key:x.deviceId,value:x.deviceId},x.label||'Микрофон '+(i+1))))),
              h('div',{className:'bv-mic-meter','aria-label':'Ниво на входящия звук'},
                h('span',{style:{width:micLevel+'%'}})),
              h('button',{type:'button',className:'bv-test-mic',disabled:recording||microphoneTest,
                onClick:testSelectedMicrophone},microphoneTest?'Записва тест (4 секунди)...':'Тествай и прослушай')),
            h('h2',null,recording?B('Spri zapisa'):B('Novo sqbitie')),
            h('p',null,recording?B('Dokosni za kray i avtomatichno zapazvane'):B('Dokosni, diktuvay, dokosni za kray')),
            null,
            liveText&&h('p',{className:'bv-live'},liveText),
            voiceIssue&&h('p',{className:'bv-voice-issue'},voiceIssue),
            CFG.stt_mode==='cloud'&&!CFG.stt_cloud&&h('p',{className:'bv-voice-issue'},'Cloud STT не е настроен. Аудиото ще се запази локално за по-късно.')),
          unsavedAudio&&h('div',{className:'bv-unsaved-audio',role:'alert'},
            h('strong',null,'Аудиозаписът не е запазен в браузъра!'),
            h('p',null,'Изтегли резервно копие, преди да затвориш страницата.'),
            h('div',{className:'bv-row'},
              h('button',{type:'button',onClick:()=>downloadBlob(unsavedAudio.blob,unsavedAudio.when)},'Изтегли аудиото'),
              h('button',{type:'button',onClick:retryUnsavedAudio},'Повтори запазването'))),
          h('div',{className:'bv-quick'},
            h('label',null,B('Bqrz tekstov zapis (rezerven variant)')),
            h('div',{className:'bv-quick-row'},
              h('textarea',{value:draft,onChange:e=>setDraft(e.target.value),rows:2,maxLength:3000,placeholder:B('Vqvedi sqbitie...')}),
              h('button',{onClick:submitText,disabled:!draft.trim(),title:B('Zapishi')},icon('arrow',20)))),
          h('div',{className:'bv-photo-tools'},
            h('label',{className:'bv-photo-pick'},icon('image',17),' Качи снимка',
              h('input',{type:'file',accept:'image/*',multiple:true,onChange:e=>{onSelectPhotos(e.target.files);e.target.value='';}})),
            h('label',{className:'bv-photo-pick'},icon('camera',17),' Снимай',
              h('input',{type:'file',accept:'image/*',capture:'environment',onChange:e=>{onSelectPhotos(e.target.files);e.target.value='';}})),
            photoBusy&&h('small',null,'Обработва снимката...'),
            photos.length>0&&h('button',{className:'bv-photo-pick',onClick:submitPhotoOnly},icon('upload',16),' Запиши само снимка'),
            photos.map((p,i)=>h('span',{className:'bv-photo-chip',key:i},p.name,
              h('button',{title:'Премахни снимката',onClick:()=>setPhotos(q=>q.filter((_,j)=>j!==i))},icon('close',13))))),
          h('div',{className:'bv-section-head'},h('h3',null,B('Posledni sqbitiya')),
            h('button',{className:'bv-icon-btn',onClick:()=>loadDocument(doc.id),title:B('Obnovi')},icon('refresh',18))),
          h('div',{className:'bv-events'},
            !data&&docLoading&&loadingRows('Зареждане на последните събития...'),
            journalFeed.map(item=>{
              if(item.local){
                const o=item.local;
                const child=queue.find(q=>q.kind==='audio_upload'&&q.target_id===o.op_id&&hasQueueMedia(q));
                const playable=hasQueueMedia(o)?o:child;
                const photoCount=queue.filter(q=>q.kind==='photo'&&q.log_op_id===o.op_id&&
                  hasQueueMedia(q)&&q.state!=='cancelled').length;
                return h('div',{className:'bv-event bv-local-event',key:item.key},
                  h('span',{className:'bv-event-time'},timeOf(o.event_at||o.created)),
                  h('div',{className:'bv-event-body'},
                    h('strong',null,o.text||o.transcript||'Гласов запис — очаква транскрипция'),
                    o.state==='synced'?
                      h('span',{className:'bv-status wait'},icon('refresh',14),
                        'Записано в Google · очаква опресняване'):
                      h(EntryStatus,{status:o.state}),
                    (o.state==='audio'||o.state==='voice_review')&&voiceInputControls(o),
                    playable&&h(Button,{secondary:true,onClick:()=>playQueueAudio(playable)},
                      icon('play',15),' Чуй оригинала'),
                    photoCount>0&&h('div',{className:'bv-event-photos'},
                      h('button',{className:'bv-photo-indicator pending',onClick:()=>openLocalGallery(o)},
                        icon('image',16),' Чакащи снимки (',photoCount,')')),
                    o.error&&h('small',{className:'bv-voice-issue'},'Последна грешка: '+o.error),
                    o.state==='error'&&h(Button,{secondary:true,onClick:async()=>{
                      await database('put','queue',Object.assign({},o,{state:'pending'}));
                      await refreshQueue();syncAll();
                    }},'Повтори изпращането')));
              }
              const x=item.remote;
              const c=x.cells,divider=String(c[3]||'').startsWith('ДАТА:');
              if(divider)return h('div',{key:item.key,className:'bv-day-divider'},c[3]);
              const cancelled=x.status==='cancelled';
              return h('div',{className:'bv-event '+(cancelled?'bv-event-cancelled':''),key:item.key},
                h('span',{className:'bv-event-time'},c[1]||'--:--'),
                h('div',{className:'bv-event-body'},
                  h('strong',null,c[3]||''),
                  h('small',null,(cancelled?'АНУЛИРАНО · ':'')+(c[2]||'')+(c[4]?' | '+c[4]:'')),
                  !cancelled&&c[6]&&queue.some(o=>o.op_id===c[6]&&o.kind==='log')&&
                    h('span',{className:'bv-status good'},icon('check',14),'Синхронизирано'),
                  h('div',{className:'bv-event-photos'},
                    (x.photos||[]).length>0&&h('button',{className:'bv-photo-indicator',type:'button',
                      title:'Преглед на снимките към този LOG запис',onClick:()=>openGallery(x,0)},
                      icon('image',16),' Снимки (',(x.photos||[]).length,')'),
                    x.audio&&h('button',{type:'button',className:'bv-photo-indicator',
                      disabled:audioBusy===x.audio.id,onClick:()=>playRemoteAudio(x)},icon('play',15),
                      audioBusy===x.audio.id?' Зарежда аудиото...':' Чуй оригинала'),
                    !cancelled&&h('label',{className:'bv-attach-inline'},icon('image',15),' Прикачи снимка',
                      h('input',{type:'file',accept:'image/*',multiple:true,onChange:e=>{uploadExistingPhoto(x,e.target.files);e.target.value='';}})),
                    !cancelled&&h('button',{type:'button',className:'bv-event-menu-button',
                      'aria-label':'Действия за събитието','aria-expanded':eventMenu===x.row,
                      onClick:()=>setEventMenu(eventMenu===x.row?null:x.row)},icon('more',20))),
                  eventMenu===x.row&&!cancelled&&h('div',{className:'bv-event-actions'},
                    h('button',{type:'button',onClick:()=>{setLogEditor(x);setLogEditText(c[3]||'');setEventMenu(null);}},icon('edit',15),' Редактирай'),
                    h('button',{type:'button',className:'danger',onClick:()=>saveLogChange(x,'cancel','')},icon('trash',15),' Анулирай')),
                  (x.history||[]).length>0&&h('div',{className:'bv-event-history'},
                    h('button',{type:'button',onClick:()=>setExpandedHistory(expandedHistory===x.row?null:x.row)},
                      'История на промените ('+x.history.length+')'),
                    expandedHistory===x.row&&x.history.map((v,i)=>h('small',{key:i},
                      (v.at||'')+' · '+(v.author||'')+' · '+(v.action==='cancel'?'Анулиране':'Редакция')+': '+(v.before||'')+' → '+(v.after||''))))));
            }),
            data&&!journalFeed.length&&!docLoading&&h('p',{className:'bv-muted'},B('Oshte nyama zapisi.')))

        ) : page==='INFO' ? h('section',{className:'bv-form-screen'},
          h('h2',null,B('Osnovni danni')),h('p',{className:'bv-muted'},B('Izberi pole, za da go promenish.')),
          h(Button,{secondary:true,disabled:gpsBusy,onClick:usePhoneGPS},icon('map',17),' ',gpsBusy?'Определя GPS...':'GPS от телефона -> INFO / Локация'),
          data && Array.isArray(data.INFO_SECTIONS) && data.INFO_SECTIONS.length ?
            data.INFO_SECTIONS.map((section,sectionIndex)=>h('div',{className:'bv-info-section',key:sectionIndex},
              sectionIndex>0&&h('h3',null,'Допълнителен блок '+(sectionIndex+1)+(section.date?' - '+section.date:'')),
              h('div',{className:'bv-fields'},
                section.rows.map(record=>infoRow(record))),
              h('button',{className:'bv-outline-full',onClick:()=>{setInfoAdding(infoAdding===sectionIndex?-1:sectionIndex);
                setInfoRole('');setInfoValues([]);}},icon('plus',18),' Добави роля / поле'),
              infoAdding===sectionIndex&&h('div',{className:'bv-card bv-new-row bv-info-add'},
                h('label',null,'Наименование на роля или поле',h('input',{className:'bv-input',value:infoRole,maxLength:120,
                  placeholder:'Напр. Координатор 3',onChange:e=>setInfoRole(e.target.value)})),
                section.columns.map((c,i)=>h('label',{key:c.letter},c.label,
                  h('input',{className:'bv-input',value:infoValues[i]||'',
                    onChange:e=>setInfoValues(old=>{const a=old.slice();a[i]=e.target.value;return a;})}))),
                h('div',{className:'bv-row'},
                  h(Button,{secondary:true,onClick:()=>setInfoAdding(-1)},'Отказ'),
                  h(Button,{disabled:!infoRole.trim(),onClick:()=>addInfoRole(sectionIndex)},'Добави в INFO')))))
          : data&&data.INFO ? h('div',{className:'bv-fields'},
              data.INFO.slice(2,26).map((r,i)=>infoLegacyRow(3+i,r)))
            :docLoading?loadingRows('Зареждане на информацията...'):
              h('p',{className:'bv-muted'},docLoadError?'Информацията не е достъпна.':'Данните не са заредени.')

        ) : h('section',{className:'bv-form-screen'},
          h('div',{className:'bv-row spread'},h('h2',null,page==='TEAM'?B('Uchastnitsi'):B('Tehnika')),
            h(Button,{secondary:true,onClick:()=>{setRowAdd(!rowAdd);setRowFields([]);}},icon('plus',17),' ',B('Nov red'))),
          rowAdd&&h('div',{className:'bv-card bv-new-row'},
            (page==='TEAM'?['Dve imena','Telefon','Transport','Momentna lokatsiya','Predvaritelen chas','Realno pristigane','Priklyuchvane']:['Avtomobili i ekipirovka','Broi','Otgovornik','Informatsiya']).map((label,i)=>h('label',{key:i},B(label),h('input',{className:'bv-input',value:rowFields[i]||'',onChange:e=>setRowFields(old=>{const x=old.slice();x[i]=e.target.value;return x;})}))),
            h(Button,{disabled:rowSaving||!rowFields.some(v=>v&&v.trim()),onClick:async()=>{
              if(rowSaving)return;
              setRowSaving(true);
              try {
                const ok=await enqueue({kind:'add_row',doc_id:doc.id,sheet:page,values:rowFields});
                if(ok){setRowAdd(false);setRowFields([]);}
              }finally{setRowSaving(false);}
            }},B('Dobavi'))),
          !data&&docLoading&&loadingRows('Зареждане на '+(page==='TEAM'?'екипа':'техниката')+'...'),
          data&&data[page]&&data[page].filter(r=>r.row>2).map(record=>h('div',{className:'bv-card bv-record',key:record.row},
            h('button',{className:'bv-record-title',onClick:()=>openEdit(page,record.row,'B',page==='TEAM'?B('Dve imena'):B('Ekipirovka'),record.cells[1],record.row_key)},record.cells[1]||B('Red ')+record.row,icon('edit',15)),
            record.cells.slice(2,page==='TEAM'?8:5).map((v,i)=>h('div',{className:'bv-record-row',key:i},
              h('span',null,(page==='TEAM'?['Telefon','Transport','Lokatsiya','Gotovnost','Pristigane','Priklyuchvane']:['Broi','Otgovornik','Informatsiya']).map(B)[i]),
              h('button',{onClick:()=>openEdit(page,record.row,String.fromCharCode(67+i),'',v,record.row_key)},v||B('Popqlni'),icon('edit',14)),
              (data.FIELD_AUDIO&&data.FIELD_AUDIO[page+':'+String.fromCharCode(67+i)+record.row]||[]).map(a=>
                h('button',{key:a.id,type:'button',className:'bv-photo-indicator',
                  disabled:audioBusy===a.id,onClick:()=>playRemoteAudio({audio:a})},icon('play',15)))))))
        ),
        h('footer',{className:'bv-bottom'},
          h('div',{className:'bv-row spread'},
            h('span',{className:'bv-footer-status',role:localSaveFailed?'alert':'status'},
              icon(localSaveFailed?'alert':waiting?'clock':'check',17),
              localSaveFailed?B('Audioto NE e zapazeno lokalno'):waiting?waiting+' '+B('chakashti operatsii'):B('Vsichko e sinhronizirano')),
            h('button',{className:'bv-plain',onClick:syncAll,disabled:!online},icon('refresh',16),' ',B('Sinhroniziray'))),
          h('button',{className:'bv-plain',onClick:closeSession,disabled:recording},icon('back',16),' ',B('Smeni aktsiyata')))),
      (myQueue.some(o=>['conflict','audio','transcribing','review','voice_review','error','local_error'].includes(o.state) &&
        !isLocalJournalOp(o,doc&&doc.id)))&&h('section',{className:'bv-pending'},
        h('h3',null,B('Operatsii za proverka')),
        myQueue.filter(o=>['conflict','audio','transcribing','review','voice_review','error','local_error'].includes(o.state) &&
          !isLocalJournalOp(o,doc&&doc.id)).map(o=>h('div',{className:'bv-card',key:o.op_id},
          h(EntryStatus,{status:o.state}),
          h('p',{className:'bv-muted'},'Акция: '+queueTarget(o)+(o.target&&o.target.kind==='field'?' · '+(o.target.sheet||'')+' '+(o.target.col||'')+(o.target.row||''):'')),
          h('p',null,o.kind==='field'?(o.sheet+' '+o.col+o.row+' : '+o.value):o.kind==='audio'?B('Audio zapis ot ')+timeOf(o.event_at):o.error),
          o.state==='conflict'&&h('div',null,
            h('p',null,'Google Sheets: '+(o.current||B('(prazno)'))),
            h('p',null,B('Tvoeto: ')+(o.value||'')),
            h('div',{className:'bv-row'},h(Button,{secondary:true,onClick:()=>resolveConflict(o,false)},B('Ostavi') + ' Google'),
              h(Button,{onClick:()=>resolveConflict(o,true)},B('Prilozhi moeto')))),
          o.stt_error&&h('p',{className:'bv-voice-issue'},o.stt_error),
          o.state==='review'&&h(Button,{onClick:()=>reviewAudioField(o)},'Прегледай транскрипцията и запази полето'),
          o.state==='voice_review'&&h('div',{className:'bv-audio-review'},
            h('p',{className:'bv-voice-issue'},'Разпознаването е съмнително: '+((o.quality&&o.quality.reasons)||[]).join(', ')+'. Прослушай оригинала.'),
            hasQueueMedia(o)&&h(Button,{secondary:true,onClick:()=>playQueueAudio(o)},icon('play',16),' Чуй оригинала'),
            h('textarea',{id:'bv-audio-review-'+o.op_id,className:'bv-textarea',defaultValue:o.transcript||'',maxLength:3000}),
            h(Button,{onClick:()=>approveVoice(o)},'Потвърди и запиши')),
          o.state==='audio'&&h('div',null,
            h(Button,{secondary:true,onClick:()=>playQueueAudio(o)},icon('play',16),' ',B('Chuy zapisa')),
            h(Button,{secondary:true,onClick:()=>downloadAudio(o)},B('Svali audio kopie')),
            h('textarea',{className:'bv-textarea',defaultValue:o.transcript||'',placeholder:B('Vqvedi transkriptsiyata tuk...'),id:'audio-'+o.op_id}),
            h(Button,{onClick:()=>{const el=document.getElementById('audio-'+o.op_id);audioToText(o,el?el.value:'');}},B('Zapishi teksta')),
            CFG.stt_mode==='cloud'&&CFG.stt_cloud&&h(Button,{secondary:true,onClick:()=>retryAudio(o)},'Опитай облачно STT')),
          o.state==='error'&&h(Button,{secondary:true,onClick:async()=>{await database('put','queue',Object.assign({},o,{state:'pending'}));syncAll();}},B('Opitay otnovo')),
          ['audio','review','voice_review','conflict','error','local_error'].includes(o.state)&&
            h('button',{type:'button',className:'bv-delete-op',onClick:()=>dropQueued(o),
              'aria-label':'Изтрий непратения запис от '+queueTarget(o)},icon('trash',15),' Изтрий записа')
        ))),
      gallery&&h('div',{className:'bv-modal-backdrop',onClick:closeGallery},
        h('div',{className:'bv-modal bv-gallery',onClick:e=>e.stopPropagation(),role:'dialog','aria-modal':'true','aria-label':'Снимки към LOG запис'},
          h('div',{className:'bv-row spread'},
            h('h3',null,'Снимки към записа (',gallery.photos.length,')'),
            h('button',{type:'button',className:'bv-icon-btn',onClick:closeGallery,'aria-label':'Затвори'},icon('close',21))),
          h('div',{className:'bv-gallery-preview'},
            galleryImage?h('img',{src:galleryImage,alt:gallery.photos[gallery.index].text||'Снимка'}):
              h('p',{className:'bv-muted'},galleryBusy?'Зарежда снимката...':galleryError?'Снимката не е заредена.':
                gallery.photos[gallery.index].url?'Стара снимка — отвори я чрез Google Drive.':'Няма локален преглед.')),
          galleryError&&h('p',{className:'bv-voice-issue'},galleryError),
          h('div',{className:'bv-gallery-nav'},
            h('button',{type:'button',disabled:gallery.index===0,onClick:()=>setGallery(Object.assign({},gallery,{index:gallery.index-1}))},'← Предишна'),
            h('span',null,(gallery.index+1)+' / '+gallery.photos.length),
            h('button',{type:'button',disabled:gallery.index>=gallery.photos.length-1,onClick:()=>setGallery(Object.assign({},gallery,{index:gallery.index+1}))},'Следваща →')),
          h('p',{className:'bv-gallery-hint'},gallery.photos[gallery.index].text||'Снимка'),
          h('div',{className:'bv-row'},
            gallery.photos[gallery.index].id&&h(Button,{secondary:true,onClick:loadFullPhoto,disabled:galleryBusy},'Виж оригинала'),
            gallery.photos[gallery.index].url&&h('a',{href:gallery.photos[gallery.index].url,target:'_blank',rel:'noopener noreferrer'},'Отвори в Google Drive'),
            h(Button,{secondary:true,onClick:closeGallery},'Затвори')))),
      queueOpen&&queueAccessible&&h('div',{className:'bv-modal-backdrop',onClick:()=>setQueueOpen(false)},
        h('div',{className:'bv-modal bv-queue-modal',onClick:e=>e.stopPropagation(),role:'dialog','aria-modal':'true'},
          h('div',{className:'bv-row spread'},h('h3',null,'Локална опашка — '+waiting+' чакащи'),
            h('button',{className:'bv-icon-btn',onClick:()=>setQueueOpen(false)},icon('close',20))),
          h('p',{className:'bv-muted'},'Всеки запис е свързан с конкретен документ. Синхронизираните записи не могат да се изтрият оттук.'),
          CFG.auth_mode==='google'&&h('button',{className:'bv-retry-op',onClick:importLegacyQueue},'Импорт на стари записи от v0.2.2'),
          localSaveFailed&&h('div',{className:'bv-unsaved-audio',role:'alert'},
            h('strong',null,'Има незапазено аудио!'),
            h('button',{type:'button',onClick:()=>downloadBlob(unsavedAudio.blob,unsavedAudio.when)},'Изтегли резервно копие'),
            h('button',{type:'button',onClick:retryUnsavedAudio},'Повтори запазването')),
          needsReview>0&&h('p',{className:'bv-queue-review-count'},needsReview+' записи изискват проверка'),
          displayedQueue.length===0&&h('p',null,'Няма чакащи операции.'),
          displayedQueue.map(o=>h('div',{className:'bv-queue-card',key:o.op_id},
            h('div',{className:'bv-row spread'},h('strong',null,queueTarget(o)),h(EntryStatus,{status:o.state})),
            h('small',null,(o.kind==='field'?o.sheet+' '+o.col+o.row:o.kind==='photo'?'Снимка':o.kind==='audio'?'Аудиозапис':o.kind==='audio_upload'?'Оригинално аудио':o.kind==='log_change'?'Промяна на събитие':o.kind==='log'?'Събитие':o.kind)+' · '+timeOf(o.event_at||o.created)),
            h('p',null,o.kind==='photo'?(o.filename||'Снимка'):o.kind==='audio'?(o.state==='review'||o.state==='voice_review'?(o.transcript||'Провери транскрипцията'):'Аудиофайл'):o.kind==='audio_upload'?'Качва оригиналния запис':(o.text||o.value||o.error||'')),
            o.stt_provider&&h('small',{className:'bv-muted'},'STT: '+o.stt_provider),
            o.stt_error&&h('p',{className:'bv-voice-issue'},o.stt_error),
            o.state==='review'&&h(Button,{onClick:()=>reviewAudioField(o)},'Прегледай и запиши полето'),
            o.state==='voice_review'&&h('div',null,
              hasQueueMedia(o)&&h(Button,{secondary:true,onClick:()=>playQueueAudio(o)},'Чуй оригинала'),
              voiceInputControls(o)),
            o.state==='audio'&&hasQueueMedia(o)&&h('div',{className:'bv-row'},
              h(Button,{secondary:true,onClick:()=>playQueueAudio(o)},'Прослушай'),
              voiceInputControls(o),
              CFG.stt_mode==='cloud'&&CFG.stt_cloud&&h(Button,{secondary:true,onClick:()=>retryAudio(o)},'Повтори STT')),
            h('div',{className:'bv-row'},
              ['pending','error','audio','review','voice_review','conflict','cancelled','local_error'].includes(o.state)&&h('button',{className:'bv-delete-op',onClick:()=>dropQueued(o)},icon('trash',15),' Изтрий от телефона'),
              o.error&&h('small',{className:'bv-voice-issue'},'Последна грешка: '+o.error),
              canDiscardInterruptedAudio(o)&&h('button',{className:'bv-delete-op',
                onClick:()=>dropQueued(o)},'Изтрий прекъснатото аудио'),
              o.state==='error'&&h('button',{className:'bv-retry-op',onClick:async()=>{await database('put','queue',Object.assign({},o,{state:'pending'}));await refreshQueue();syncAll();}},'Опитай отново')))),
          completedCount>0&&h('button',{className:'bv-retry-op',onClick:()=>setShowCompletedQueue(v=>!v)},
            showCompletedQueue?'Скрий приключените':'Покажи приключените ('+completedCount+')'),
          h(Button,{secondary:true,onClick:()=>setQueueOpen(false)},'Затвори'))),
      logEditor&&h('div',{className:'bv-modal-backdrop',onClick:()=>setLogEditor(null)},
        h('div',{className:'bv-modal',onClick:e=>e.stopPropagation(),role:'dialog','aria-modal':'true','aria-label':'Редакция на LOG събитие'},
          h('h3',null,'Редактирай събитието'),
          h('p',{className:'bv-muted'},'Оригиналното аудио и историята остават непроменени.'),
          h('textarea',{className:'bv-textarea',rows:5,maxLength:3000,value:logEditText,onChange:e=>setLogEditText(e.target.value)}),
          h('div',{className:'bv-row'},
            h(Button,{secondary:true,onClick:()=>setLogEditor(null)},'Отказ'),
            h(Button,{disabled:logSaving||!logEditText.trim(),onClick:()=>saveLogChange(logEditor,'edit',logEditText)},'Запази промяната')))),
      editing&&h('div',{className:'bv-modal-backdrop',onClick:()=>setEditing(null)},
        h('div',{className:'bv-modal',onClick:e=>e.stopPropagation(),role:'dialog','aria-modal':'true'},
          h('div',{className:'bv-row spread'},h('h3',null,B('Promeni pole')+' '+(editing.label||editing.col+editing.row)),
            h('button',{className:'bv-icon-btn',onClick:()=>setEditing(null)},icon('close',20))),
          h('p',{className:'bv-muted'},B('Predishna stoynost: ')+(editing.base||B('(prazno)'))),
          (editing.sheet==='INFO' && (editing.is_action_primary || (Array.isArray(editing.choices) && editing.choices.length>0)))
            ?h('select',{className:'bv-input',value:editValue,onChange:e=>setEditValue(e.target.value)},
              [editValue].concat(editing.choices&&editing.choices.length?editing.choices:actionTypes)
                .filter((v,i,a)=>v&&a.indexOf(v)===i).map(v=>h('option',{key:v,value:v},v)))
            :h('textarea',{className:'bv-textarea',rows:3,value:editValue,onChange:e=>setEditValue(e.target.value),autoFocus:true}),
          h('div',{className:'bv-row'},
            h(Button,{secondary:true,onClick:toggleFieldVoice},icon('mic',17),' ',fieldRecording?B('Spri diktovkata'):B('Diktuvay')),
            h(Button,{secondary:true,onClick:()=>setEditing(null),disabled:fieldRecording},B('Otkaz')),
            h(Button,{onClick:saveEdit,disabled:fieldRecording},icon('save',17),' ',B('Zapazi'))))));

    function infoRow(record) {
      if(!record||!record.label)return null;
      const rowNum=record.row;
      return h('div',{className:'bv-info-row',key:rowNum},h('strong',null,record.label),
        (record.fields||[]).map((field,j)=>{
          const cell=String(field.value||'');
          const key='INFO:'+field.col+rowNum;
          const audios=data&&data.FIELD_AUDIO&&data.FIELD_AUDIO[key];
          return h('div',{className:'bv-info-col',key:field.col},
            h('button',{className:'bv-info-val',onClick:()=>openEdit('INFO',rowNum,field.col,record.label,cell,'',
              {field_label:record.label,header_label:field.header,section:record.section,
                choices:field.choices||[],is_action_primary:record.label===B('Aktsiya')&&j===0})},
              h('span',null,field.header||B('Stoynost')),
              h('span',{className:'bv-value'},cell||B('Popqlni'),icon('edit',15))),
            (Array.isArray(audios)?audios:[]).map(a=>h('button',{key:a.id,type:'button',
              className:'bv-photo-indicator',disabled:audioBusy===a.id,
              onClick:()=>playRemoteAudio({audio:a})},icon('play',15),' Чуй оригинала')));
        }));
    }
    // Read-only compatibility for snapshots captured before the adaptive INFO API.
    function infoLegacyRow(rowNum,row){
      if(!Array.isArray(row)||!row[0])return null;
      return infoRow({row:rowNum,label:String(row[0]),section:0,
        fields:['B','C','D'].map((col,i)=>({col:col,header:['Инфо','Коментар / линк / телефон','Допълнителна информация'][i],value:row[i+1]||''}))});
    }

  }
  const ReactComponent=wp.element.Component;
  class BVLOGErrorBoundary extends (ReactComponent||class {}) {
    constructor(props) {
      super(props);
      this.state={error:null,retry:0};
    }
    static getDerivedStateFromError(error) { return {error:error}; }
    componentDidCatch(error) {
      // Report only the exception type, not operational records or media contents.
      if(typeof console!=='undefined')console.error('BG Voice Logger rendering error:',error&&error.name||'Error');
    }
    render() {
      if(this.state.error) {
        return h('div',{className:'bv-render-recovery',role:'alert'},
          h('h2',null,'Грешка при показване на екрана'),
          h('p',null,'Приложението не можа да покаже този раздел. Локалната опашка не е изтрита.'),
          h('p',null,'Тип: '+(this.state.error.name||'Error')+'. Не презареждай, ако записът още е активен.'),
          h('button',{type:'button',onClick:()=>this.setState(old=>({error:null,retry:old.retry+1}))},
            'Възстанови интерфейса'));
      }
      return h(App,{key:this.state.retry});
    }
  }
  const root=document.getElementById('bvlog-root');
  if (root) {
    const app=ReactComponent?h(BVLOGErrorBoundary):h(App);
    if (wp.element.createRoot) wp.element.createRoot(root).render(app);
    else wp.element.render(app,root);
  }
})();
