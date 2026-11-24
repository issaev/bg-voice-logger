// Synthetic tests for private service-worker background sync; no real network.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const sw=fs.readFileSync(__dirname+'/../assets/sw.js','utf8');
const app=fs.readFileSync(__dirname+'/../assets/app.js','utf8');
const php=fs.readFileSync(__dirname+'/../bg-voice-logger.php','utf8');
assert.ok(php.includes('self.BVLOG_API_ROOT')&&php.includes('self.BVLOG_NONCE_URL'),
  'PHP must bootstrap only same-origin SW endpoint URLs');
assert.ok(!sw.includes('localStorage')&&!sw.includes('sessionStorage'),
  'SW cannot rely on foreground secrets or persistent browser tokens');
const old=fs.readFileSync(__dirname+'/test-v062-media.js','utf8');
const start=old.indexOf('function fakeIndexedDB(){'),end=old.indexOf('\nlet appFunctions',start);
assert.ok(start>=0&&end>start);
const factory={Map,structuredClone,setTimeout};vm.createContext(factory);
vm.runInContext(old.slice(start,end)+'\nthis.fakeIndexedDB=fakeIndexedDB;',factory);
const indexedDB=factory.fakeIndexedDB();
const leaseSource=app.slice(app.indexOf('  async function syncLease(owner,'),app.indexOf('  function requestBackgroundSync()'));
assert.ok(leaseSource.includes('async function syncLease'));
const appLeaseCtx={indexedDB,Date,Promise};vm.createContext(appLeaseCtx);
vm.runInContext('const SYNC_LEASE_MS = 180000;\n'+leaseSource+'\nthis.appLease=syncLease;',appLeaseCtx);
const events={};const sessions=[];const sent=[];const ack=new Set();
const messages=[];const scheduled=[];
let user='111111111111',unauth=false,changeOnWrite=false,failAfterAck=false,switchAfterSession=false,authMode='google';
const csrf='a'.repeat(48);
const self={BVLOG_CACHE_ID:'bgvl-test-assets',BVLOG_APP_URL:'https://site.example/dka/',
  BVLOG_API_ROOT:'https://site.example/wp-json/bvlog/v1/',
  BVLOG_NONCE_URL:'https://site.example/wp-admin/admin-ajax.php?action=bvlog_nonce',
  BVLOG_REQUIRED_ASSETS:[],location:{origin:'https://site.example'},
  registration:{sync:{register:async tag=>{scheduled.push(tag);}}},
  clients:{claim:async()=>{},matchAll:async()=>[{url:'https://site.example/dka/',postMessage:x=>messages.push(x)}]},
  skipWaiting:async()=>{},addEventListener:(type,fn)=>events[type]=fn};
const j=(data,status=200)=>new Response(JSON.stringify(data),{status});
const fetch=async(url,opts={})=>{
  const path=new URL(url.url||url).pathname;
  if(path.endsWith('/auth/session')){
    sessions.push(user);
    const initialUser=user;
    if(switchAfterSession){user='222222222222';switchAfterSession=false;}
    return j(unauth?{authenticated:false,identity:null,mode:authMode}:
      authMode==='google'?{authenticated:true,identity:{kind:'google',sub:initialUser},mode:authMode,csrf}:
      authMode==='wordpress'?{authenticated:true,identity:{kind:'wordpress',sub:'wp:77'},mode:authMode}:
      {authenticated:true,identity:{kind:'public',sub:'public'},mode:authMode});
  }
  if(path.endsWith('/admin-ajax.php'))return j({success:true,data:{nonce:'abcdef12345'}});
  assert.ok(path.endsWith('/operation')||path.endsWith('/photo')||path.endsWith('/audio'),path);
  assert.equal(opts.credentials,'same-origin');
  if(authMode==='google')assert.equal(opts.headers['X-BVLOG-CSRF'],csrf);
  else if(authMode==='wordpress')assert.equal(opts.headers['X-WP-Nonce'],'abcdef12345');
  else assert.equal(opts.headers['X-BVLOG-CSRF'],undefined);
  assert.equal(opts.cache,'no-store');
  const data=JSON.parse(opts.body);sent.push({path,kind:data.kind,op_id:data.op_id,doc_id:data.doc_id,
    part:data.part_index,part_count:data.part_count,bytes:data.base64?atob(data.base64).length:0});
  if(changeOnWrite){user='222222222222';changeOnWrite=false;}
  if(path.endsWith('/audio'))return j({ok:true,complete:data.part_index+1===data.part_count});
  const duplicate=ack.has(data.op_id);ack.add(data.op_id);
  if(failAfterAck){failAfterAck=false;throw new TypeError('connection dropped after server ACK');}
  return j({ok:true,deduplicated:duplicate});
};
const ctx={self,URL,Date,Math,Promise,Response,Blob,ArrayBuffer,Uint8Array,btoa,atob,
  indexedDB,fetch,caches:{open:async()=>({}),keys:async()=>[]},console};
vm.createContext(ctx);vm.runInContext(sw+'\nself.__test={bgDrain,bgOpenDB,bgGet,bgGetAll,bgSaveWork,bgLease,bgDBName};',ctx);
async function open(name){return ctx.self.__test.bgOpenDB(name);}
async function save(db,store,value){return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');
  tx.objectStore(store).put(value);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});}
async function patch(db,id,changes){const op=await ctx.self.__test.bgGet(db,'queue',id);await save(db,'queue',{...op,...changes});}
const dbName=id=>'bg-voice-logger-queue-v3-google-'+id;
const log=(id,doc='TEST_DOC_123456789ABC')=>({op_id:id,kind:'log',doc_id:doc,
  state:'pending',created:'2026-11-24T11:00:00Z',text:'SYNTHETIC ONLY',event_at:'2026-11-24T11:00:00Z'});
const uuid=i=>`aaaa0000-0000-4000-8000-${String(i).padStart(12,'0')}`;
(async()=>{
  const a=await open(dbName(user));const b=await open(dbName('222222222222'));
  const id=uuid(1);await save(a,'queue',log(id));await save(b,'queue',log(uuid(9)));
  assert.equal(a.version,2,'Rollback-compatible queue schema must remain v2');
  // A tab holding the lease prevents parallel SW sending the same operation.
  assert.equal(await appLeaseCtx.appLease('page',false,dbName(user)),true);
  await assert.rejects(ctx.self.__test.bgDrain(),/already draining/);
  assert.equal(sent.length,0);
  assert.equal(await appLeaseCtx.appLease('page',true,dbName(user)),true);
  await new Promise((resolve,reject)=>events.sync({tag:'bvlog-outbox-v1',waitUntil:p=>p.then(resolve,reject)}));
  assert.equal(sent.length,1);assert.equal(sent[0].op_id,id);
  assert.equal((await ctx.self.__test.bgGet(a,'queue',id)).state,'synced');
  assert.equal((await ctx.self.__test.bgGet(b,'queue',uuid(9))).state,'pending','Other user must be isolated');
  assert.deepEqual(Array.from(messages.map(m=>m.type)),['BVLOG_SYNC_UPDATED']);
  assert.ok(!JSON.stringify(await ctx.self.__test.bgGetAll(a,'queue')).includes(csrf),'CSRF must not be stored');
  // Server commits, client gets a transport failure. Next replay must reuse op_id.
  const lost=uuid(2);await save(a,'queue',log(lost));failAfterAck=true;
  await ctx.self.__test.bgDrain();
  let pending=await ctx.self.__test.bgGet(a,'queue',lost);
  assert.equal(pending.state,'pending');assert.ok(pending.next_retry);assert.ok(ack.has(lost));
  await patch(a,lost,{next_retry:new Date(Date.now()-1).toISOString()});
  await ctx.self.__test.bgDrain();pending=await ctx.self.__test.bgGet(a,'queue',lost);
  assert.equal(pending.state,'synced');
  assert.equal(sent.filter(x=>x.op_id===lost).length,2);
  assert.equal(ack.size,2,'Server must dedup replay for same op_id');
  // A photo has a separate original and preview; both are deleted after ACK.
  const photo=uuid(3),origId=photo+':blob',previewId=photo+':preview_blob';
  const orig=Uint8Array.of(1,2,3,4).buffer,preview=Uint8Array.of(5,6).buffer;
  await save(a,'media',{media_id:origId,bytes:orig,mime:'image/jpeg',size:4});
  await save(a,'media',{media_id:previewId,bytes:preview,mime:'image/jpeg',size:2});
  await save(a,'queue',{op_id:photo,kind:'photo',doc_id:log(id).doc_id,log_op_id:id,
    state:'pending',created:'2026-11-24T11:02:00Z',mime:'image/jpeg',filename:'synthetic.jpg',
    blob_media_id:origId,preview_blob_media_id:previewId});
  await ctx.self.__test.bgDrain();
  assert.equal((await ctx.self.__test.bgGet(a,'queue',photo)).state,'synced');
  assert.equal(await ctx.self.__test.bgGet(a,'media',origId),undefined);
  assert.equal(await ctx.self.__test.bgGet(a,'media',previewId),undefined);
  // One 300KB audio needs two independently acknowledged chunks.
  const audio=uuid(4),audioId=audio+':blob',bytes=new Uint8Array(300000);
  for(let i=0;i<bytes.length;i++)bytes[i]=i%251;
  await save(a,'media',{media_id:audioId,bytes:bytes.buffer,mime:'audio/webm',size:bytes.length});
  await save(a,'queue',{op_id:audio,kind:'audio_upload',doc_id:log(id).doc_id,
    target_id:id,target_kind:'log',state:'pending',created:'2026-11-24T11:03:00Z',
    mime:'audio/webm',blob_media_id:audioId,parts_done:0});
  await ctx.self.__test.bgDrain();
  let current=await ctx.self.__test.bgGet(a,'queue',audio);
  assert.equal(current.state,'pending');assert.equal(current.parts_done,1);
  assert.ok(await ctx.self.__test.bgGet(a,'media',audioId),'Incomplete audio must retain original bytes');
  await ctx.self.__test.bgDrain();
  current=await ctx.self.__test.bgGet(a,'queue',audio);
  assert.equal(current.state,'synced');assert.equal(current.parts_done,2);
  assert.equal(await ctx.self.__test.bgGet(a,'media',audioId),undefined);
  assert.deepEqual(sent.filter(x=>x.op_id===audio).map(x=>x.part),[0,1]);
  // Auth lost: never send, preserve queue intact.
  const noAuth=uuid(5);await save(a,'queue',log(noAuth));unauth=true;
  const before=sent.length;assert.equal(await ctx.self.__test.bgDrain(),false);
  assert.equal(sent.length,before);assert.equal((await ctx.self.__test.bgGet(a,'queue',noAuth)).state,'pending');
  unauth=false;
  // Session changes after the initial authenticated read: abort before POST.
  const shifted=uuid(6);await save(a,'queue',log(shifted));
  user='111111111111';switchAfterSession=true;const sentBefore=sent.length;
  await ctx.self.__test.bgDrain();
  assert.equal(sent.length,sentBefore);
  assert.equal((await ctx.self.__test.bgGet(a,'queue',shifted)).state,'pending');
  // Re-login as another Google operator must never drain prior account's queue.
  user='222222222222';await ctx.self.__test.bgDrain();
  assert.equal((await ctx.self.__test.bgGet(a,'queue',noAuth)).state,'pending');
  assert.equal((await ctx.self.__test.bgGet(b,'queue',uuid(9))).state,'synced');
  // WordPress auth requires a fresh REST nonce, never one stored in IndexedDB.
  authMode='wordpress';
  const wpDB=await open('bg-voice-logger-queue-v2-user-77');
  const wpId=uuid(7);await save(wpDB,'queue',log(wpId));
  await ctx.self.__test.bgDrain();
  assert.equal((await ctx.self.__test.bgGet(wpDB,'queue',wpId)).state,'synced');
  // Anonymous public mode uses its isolated public DB, without a privileged header.
  authMode='public';
  const pubDB=await open('bg-voice-logger-queue-v2-user-0');
  const pubId=uuid(8);await save(pubDB,'queue',log(pubId));
  await ctx.self.__test.bgDrain();
  assert.equal((await ctx.self.__test.bgGet(pubDB,'queue',pubId)).state,'synced');
  wpDB.close();pubDB.close();a.close();b.close();
  console.log('PASS v0.8 SW: shared lease, Google-session isolation, ambiguous ACK, private photo and resumable audio, unauthenticated safety.');
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
