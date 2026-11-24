// v0.6.2 offline media regression with an asynchronous IndexedDB transaction mock.
// Real iPhone Safari testing is still required: this checks our data contract and state transitions.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const raw=fs.readFileSync(__dirname+'/../assets/app.js','utf8');
const source=raw.replace('  function uuid() {',
  '  window.__v062db={openDB,database,queueBlob,hasQueueMedia,writeQueueGroup,reclaimOrphanMedia};\n  function uuid() {')
  .replace('    const waiting=queue.filter(o=>o.state!==\'synced\'',
  '    window.__v062app={audioToText,preserveAudioChild,preserveAudioWithParent,saveAudioClip};\n    const waiting=queue.filter(o=>o.state!==\'synced\'');
assert.ok(source.includes('window.__v062db')&&source.includes('window.__v062app'),'test entry points missing');
function fakeIndexedDB(){
  const databases=new Map();
  return {open(name,version){
    const req={result:null,error:null};
    setTimeout(()=>{
      let data=databases.get(name),upgrade=false;
      if(!data){data={version:0,tables:new Map()};databases.set(name,data);upgrade=true;}
      if(version>data.version){data.version=version;upgrade=true;}
      const db={version:data.version,onversionchange:null,close(){},
        objectStoreNames:{contains:k=>data.tables.has(k)},
        createObjectStore(k){if(!data.tables.has(k))data.tables.set(k,new Map());},
        transaction(names,mode){
          const keys=Array.isArray(names)?names:[names];
          const staged=new Map(keys.map(k=>[k,new Map(data.tables.get(k))]));
          let operations=0,done=false;
          const tx={error:null,oncomplete:null,onabort:null,onerror:null,abort(){if(done)return;done=true;setTimeout(()=>tx.onabort&&tx.onabort(),0);},
            objectStore(key){
              if(!staged.has(key))throw new Error('store outside transaction: '+key);
              const map=staged.get(key);
              const doReq=fn=>{
                const r={result:null,error:null,onsuccess:null,onerror:null};operations++;
                setTimeout(()=>{
                  if(done)return;
                  try{r.result=fn();if(r.onsuccess)r.onsuccess();}
                  catch(e){r.error=e;tx.error=e;done=true;if(r.onerror)r.onerror();if(tx.onabort)tx.onabort();return;}
                  operations--;
                  if(operations===0)setTimeout(()=>{
                    if(done)return;done=true;
                    if(mode==='readwrite')for(const k of keys)data.tables.set(k,staged.get(k));
                    if(tx.oncomplete)tx.oncomplete();
                  },0);
                },0);
                return r;
              };
              return {
                get:k=>doReq(()=>structuredClone(map.get(k))),
                getAll:()=>doReq(()=>Array.from(map.values()).map(x=>structuredClone(x))),
                getAllKeys:()=>doReq(()=>Array.from(map.keys())),
                put:o=>doReq(()=>{const key=o.op_id||o.media_id||o.id;if(!key)throw new Error('missing key');map.set(key,structuredClone(o));return key;}),
                delete:k=>doReq(()=>{map.delete(k);return undefined;})
              };
            }
          };
          return tx;
        }};
      req.result=db;
      if(upgrade&&req.onupgradeneeded)req.onupgradeneeded();
      if(req.onsuccess)req.onsuccess();
    },0);
    return req;
  }};
}
let appFunctions,dbFunctions;
const w={BVLOG_CONFIG:{user:{id:812,name:'Test Operator'},auth_mode:'google',stt_mode:'cloud',stt_cloud:false,api:'/wp-json/'},setTimeout};
const wp={element:{createElement:(type,props,...children)=>({type,props:props||{},children}),
  useState:init=>[typeof init==='function'?init():init,()=>{}],useEffect:()=>{},useRef:x=>({current:x}),
  createRoot:()=>({render:e=>e.type()})}};
const ctx={window:w,wp,indexedDB:fakeIndexedDB(),localStorage:{getItem:()=>'',setItem:()=>{},removeItem:()=>{}},
  document:{getElementById:()=>({})},navigator:{onLine:false},Blob,ArrayBuffer,Uint8Array,
  structuredClone,console,setTimeout,clearTimeout,URL,Date,Promise,Math};
vm.createContext(ctx);vm.runInContext(source,ctx,{filename:'app.js'});
appFunctions=w.__v062app;dbFunctions=w.__v062db;
assert.ok(appFunctions&&dbFunctions,'app+DB not initialized');
(async()=>{
  const db=await dbFunctions.openDB();
  assert.strictEqual(db.version,2);
  assert.ok(db.objectStoreNames.contains('media'));
  const op='98765432-1234-4123-8123-123456789abc';
  const audio=new Uint8Array([1,2,3,4,5,6,7,250,255]);
  const p={op_id:op,kind:'audio',state:'audio',doc_id:'DOCUMENT_TEST_123456789',
    doc_name:'Test',created:'2026-11-17T20:46:00Z',event_at:'2026-11-17T20:46:00Z',
    blob:new Blob([audio],{type:'audio/mp4'})};
  const inserted=await dbFunctions.database('put','queue',p);
  assert.ok(inserted.blob_media_id && !inserted.blob,'Blob leaked to the queue store');
  let stored=await dbFunctions.database('get','queue',op);
  assert.ok(stored.blob_media_id && !stored.blob,'queue content unexpectedly has Blob');
  let received=await dbFunctions.queueBlob(stored);
  assert.strictEqual(received.type,'audio/mp4');
  assert.deepStrictEqual(Array.from(new Uint8Array(await received.arrayBuffer())),Array.from(audio));
  await dbFunctions.database('put','queue',Object.assign({},stored,{state:'transcribing'}));
  stored=await dbFunctions.database('get','queue',op);
  assert.strictEqual(stored.state,'transcribing');
  assert.strictEqual((await dbFunctions.queueBlob(stored)).size,audio.length);
  await appFunctions.audioToText(stored,'Тест на новата версия',null);
  stored=await dbFunctions.database('get','queue',op);
  assert.strictEqual(stored.kind,'log');
  assert.strictEqual(stored.state,'pending');
  assert.ok(!stored.blob_media_id);
  let all=await dbFunctions.database('getAll','queue');
  let child=all.find(x=>x.kind==='audio_upload'&&x.target_id===op);
  assert.ok(child,'lost audio child');
  assert.strictEqual(child.blob_media_id,inserted.blob_media_id,'child copied media unnecessarily');
  const childId=child.op_id;
  assert.strictEqual(childId,'a'+op.slice(1),'audio child is not deterministic');
  // A retry with the same original data cannot create a second child.
  await appFunctions.audioToText(Object.assign({},p,{blob_media_id:inserted.blob_media_id,blob_size:audio.length,blob_mime:'audio/mp4'}),'Тест на новата версия',null);
  all=await dbFunctions.database('getAll','queue');
  assert.strictEqual(all.filter(x=>x.kind==='audio_upload'&&x.target_id===op).length,1,'duplicate audio children');
  await dbFunctions.database('put','queue',Object.assign({},child,{state:'sending',parts_done:1}));
  child=await dbFunctions.database('get','queue',childId);
  assert.strictEqual(child.parts_done,1);
  assert.strictEqual((await dbFunctions.queueBlob(child)).size,audio.length,'status lost audio');
  await dbFunctions.database('put','queue',Object.assign({},child,{state:'synced'}));
  child=await dbFunctions.database('get','queue',childId);
  assert.strictEqual(child.state,'synced');
  assert.strictEqual(child.blob_media_id,undefined);
  assert.strictEqual(await dbFunctions.database('get','media',inserted.blob_media_id),undefined,'remote ack retained bytes');
  const photoOp='12345678-1234-4123-8123-123456789abc';
  await dbFunctions.database('put','queue',{
    op_id:photoOp,kind:'photo',state:'pending',blob:new Blob([Uint8Array.from([10,11,12])],{type:'image/jpeg'}),
    preview_blob:new Blob([Uint8Array.from([31,32])],{type:'image/jpeg'})});
  const photo=await dbFunctions.database('get','queue',photoOp);
  assert.ok(!photo.blob&&!photo.preview_blob&&photo.preview_blob_media_id&&photo.blob_media_id);
  assert.strictEqual((await dbFunctions.queueBlob(photo)).size,3);
  assert.strictEqual((await dbFunctions.queueBlob(photo,'preview_blob')).size,2);
  // v0.7.1 orphan cleanup must lock BOTH stores so new references cannot race its scan.
  const orphanId='v071-unreferenced-blob';
  await dbFunctions.database('put','media',{
    media_id:orphanId,bytes:new ArrayBuffer(2),mime:'image/jpeg',size:2});
  const originalTransaction=db.transaction.bind(db),cleanupScopes=[];
  db.transaction=(names,mode)=>{
    if(mode==='readwrite')cleanupScopes.push(Array.isArray(names)?names.slice():[names]);
    return originalTransaction(names,mode);
  };
  await dbFunctions.reclaimOrphanMedia();
  assert.ok(cleanupScopes.some(v=>v.includes('queue')&&v.includes('media')),
    'orphan cleanup must use a shared queue+media write lock');
  assert.strictEqual(await dbFunctions.database('get','media',orphanId),undefined,
    'unreferenced media must be reclaimed');
  assert.ok(await dbFunctions.database('get','media',photo.blob_media_id),
    'cleanup removed media still referenced by a queued photo');
  assert.ok(await dbFunctions.database('get','media',photo.preview_blob_media_id),
    'cleanup removed queued photo preview');
  db.transaction=originalTransaction;
  // Readable records written by v0.6.1 (with a Blob directly in 'queue') remain usable.
  const legacyId='abababab-1234-4123-8123-123456789abc';
  await new Promise((resolve,reject)=>{
    const tx=db.transaction('queue','readwrite');
    tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||new Error('legacy seed aborted'));
    tx.objectStore('queue').put({op_id:legacyId,kind:'audio',state:'audio',blob:new Blob(['legacy'],{type:'audio/mp4'})});
  });
  const legacy=await dbFunctions.database('get','queue',legacyId);
  assert.ok(legacy.blob instanceof Blob,'legacy entry missing');
  await dbFunctions.database('put','queue',Object.assign({},legacy,{state:'transcribing'}));
  const upgradedLegacy=await dbFunctions.database('get','queue',legacyId);
  assert.ok(upgradedLegacy.blob_media_id&&!upgradedLegacy.blob,'legacy Blob failed to migrate safely');
  assert.strictEqual(await (await dbFunctions.queueBlob(upgradedLegacy)).text(),'legacy');
  // A batch with an invalid key aborts all updates instead of committing half of them.
  const before=await dbFunctions.database('get','queue',op);
  let batchRejected=false;
  try{await dbFunctions.writeQueueGroup([Object.assign({},before,{text:'WRONG'}),{kind:'field',state:'pending'}]);}
  catch(e){batchRejected=true;}
  assert.ok(batchRejected,'batch failure was not surfaced');
  assert.strictEqual((await dbFunctions.database('get','queue',op)).text,before.text,'partial batch committed');
  // Conversion failure must not be acknowledged as a successful durable write.
  class FailedBlob extends Blob{async arrayBuffer(){throw new Error('simulated Safari read error');}}
  let rejected=false;
  try{await dbFunctions.database('put','queue',{op_id:'abcdabcd-1234-4123-8123-123456789abc',kind:'audio',state:'audio',blob:new FailedBlob(['bad'])});}
  catch(e){rejected=/Safari read error/.test(e.message);}
  assert.ok(rejected,'failed conversion not surfaced');
  assert.strictEqual(await dbFunctions.database('get','queue','abcdabcd-1234-4123-8123-123456789abc'),undefined);
  console.log('PASS v0.6.2: IndexedDB transaction commit, separate media, deterministic audio child, retries, photos and failure behavior (simulated IDB).');
})().catch(e=>{console.error(e);process.exitCode=1;});
