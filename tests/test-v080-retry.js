// Self-contained fault-injection tests, no production access or external calls.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../assets/app.js','utf8');
const extract=(start,end)=>{
  const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,'Source section missing: '+start);
  return source.slice(a,b);
};
const helpers=extract('  const READ_RETRY_DELAYS_MS =','  async function api(');
const clock={now:Date.UTC(2026,10,24,11,0,0),tasks:[],next:0};
class FakeDate extends Date {constructor(...args){super(...(args.length?args:[clock.now]));}static now(){return clock.now;}}
function wait(fn,delay){const id=++clock.next;clock.tasks.push({id,fn,at:clock.now+delay});return id;}
function clear(id){clock.tasks=clock.tasks.filter(x=>x.id!==id);}
async function settle(){for(let i=0;i<12;i++)await Promise.resolve();}
async function advance(ms){const end=clock.now+ms;let guard=0;
  while(true){const task=clock.tasks.filter(x=>x.at<=end).sort((a,b)=>a.at-b.at)[0];
    if(!task)break;
    assert.ok(++guard<200,'Timeout loop');clock.tasks=clock.tasks.filter(x=>x.id!==task.id);
    clock.now=task.at;task.fn();await settle();
  }
  clock.now=end;await settle();
}
const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
const names=Array.from(source.matchAll(/const \[([A-Za-z][A-Za-z0-9]*),\s*set[A-Za-z0-9]+\]=useState\(/g)).map(m=>m[1]);
const h=(type,props,...children)=>({type,props:props||{},children});
async function testRead(){
  const state={},refs={};let si=0,ri=0,tree=null;
  const idx=n=>{const i=names.indexOf(n);assert.ok(i>=0,n);return i;};
  const set=(k,v)=>{state[idx(k)]=v;},get=k=>state[idx(k)];
  const network=[],calls=[];const effects=[];
  const win={BVLOG_CONFIG:{api:'/api/',auth_mode:'public',stt_mode:'none',user:{id:0}},
    setTimeout:wait,clearTimeout:clear,setInterval:()=>1,clearInterval:()=>{}};
  const ctx={window:win,wp:{element:{createElement:h,
    useState:init=>{let k=si++;if(!(k in state))state[k]=typeof init==='function'?init():init;
      return [state[k],v=>{state[k]=typeof v==='function'?v(state[k]):v;}];},
    useRef:init=>{let k=ri++;if(!(k in refs))refs[k]={current:init};return refs[k];},
    useEffect:(fn,deps)=>effects.push({fn,deps}),createRoot:()=>({render:v=>tree=v})}},
    navigator:{onLine:true},document:{getElementById:()=>({}),hidden:false},
    indexedDB:{open:()=>{throw new Error('No test IndexedDB');}},
    localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},
    fetch:async(path)=>{calls.push(path);assert.ok(network.length,'Unexpected fetch: '+path);
      const next=network.shift();if(next instanceof Error)throw next;return next;},
    Date:FakeDate,Math,Promise,Response,URL,Blob,ArrayBuffer,Uint8Array,console,setTimeout:wait,clearTimeout:clear};
  const injection="    window.__test={loadDocument,clearReadRetry,scheduleReadRetryTimer,readRetryRef,docRef,refreshRef,documentReadInFlightRef};\n    const waiting=queue.filter(o=>o.state";
  assert.ok(source.includes('    const waiting=queue.filter(o=>o.state'));
  vm.createContext(ctx);vm.runInContext(source.replace('    const waiting=queue.filter(o=>o.state',injection),ctx);
  function render(){si=0;ri=0;effects.length=0;tree.type();}
  set('doc',{id:'D1',name:'SYNTHETIC'});set('mode','session');set('page','LOG');set('online',true);set('queue',[]);
  render();win.__test.docRef.current=get('doc');render();
  const fail=()=>new TypeError('Failed to fetch');
  // Initial browser rejection schedules retry at 5s, then 15s, then 30s.
  network.push(fail(),fail(),fail(),response({ok:true,data:{LOG:[],INFO:[],TEAM:[],TECH:[]}}));
  await win.__test.loadDocument('D1');await settle();
  assert.match(get('docLoadError'),/Failed to fetch/);
  assert.match(get('docLoadError'),/Автоматичен/);
  assert.equal(win.__test.readRetryRef.current.attempts,1);
  assert.equal(clock.tasks.filter(x=>x.at===clock.now+5000).length,1);
  render();await advance(5000);render();
  assert.equal(win.__test.readRetryRef.current.attempts,2);
  await advance(15000);render();
  assert.equal(win.__test.readRetryRef.current.attempts,3);
  await advance(30000);render();
  assert.equal(get('docLoadError'),'');
  assert.ok(get('lastFreshAt'));
  assert.equal(win.__test.readRetryRef.current.id,'');
  assert.equal(calls.length,4,'3 automatic reads + initial');
  // Non-retryable authorization error must not start timer.
  network.push(response({message:'Not authorized',code:'forbidden'},403));
  await win.__test.loadDocument('D1');await settle();
  assert.equal(win.__test.readRetryRef.current.id,'');
  assert.match(get('docLoadError'),/Not authorized/);
  // Proxy 502 HTML (non-JSON response) is also transient and recoverable.
  network.push(new Response('<html>Bad Gateway</html>',{status:502}),
    response({ok:true,data:{LOG:[],INFO:[],TEAM:[],TECH:[]}}));
  await win.__test.loadDocument('D1');await settle();
  assert.match(get('docLoadError'),/HTTP 502/);
  assert.equal(win.__test.readRetryRef.current.attempts,1);
  render();await advance(5000);render();
  assert.equal(get('docLoadError'),'');
  // A manual retry can restore the session and preserve the last confirmed data.
  network.push(response({ok:true,data:{LOG:[{row:3,cells:[]}],INFO:[],TEAM:[],TECH:[]}}));
  await win.__test.loadDocument('D1');await settle();
  assert.equal(get('docLoadError'),'');
  assert.equal(get('data').LOG.length,1);
  // An OS-suspended browser must pause, then recover on foreground without an extra write.
  ctx.document.hidden=true;
  network.push(fail(),response({ok:true,data:{LOG:[],INFO:[],TEAM:[],TECH:[]}}));
  await win.__test.loadDocument('D1');await settle();
  let before=calls.length;
  await advance(5000);assert.equal(calls.length,before,'Hidden tab must not retry');
  ctx.document.hidden=false;render();win.__test.scheduleReadRetryTimer();
  await advance(200);render();assert.equal(calls.length,before+1);
  assert.equal(win.__test.readRetryRef.current.id,'');
  // Offline pauses the queued retry until connectivity is restored.
  network.push(fail(),response({ok:true,data:{LOG:[],INFO:[],TEAM:[],TECH:[]}}));
  await win.__test.loadDocument('D1');await settle();
  ctx.navigator.onLine=false;before=calls.length;
  await advance(5000);assert.equal(calls.length,before,'Offline tab must not retry');
  ctx.navigator.onLine=true;render();win.__test.scheduleReadRetryTimer();
  await advance(200);render();assert.equal(calls.length,before+1);
  // No read retry from a retired incident: changing document cancels pending work.
  network.push(fail());await win.__test.loadDocument('D1');await settle();
  before=calls.length;win.__test.docRef.current={id:'D2'};
  await advance(5000);assert.equal(calls.length,before);
  assert.equal(win.__test.readRetryRef.current.id,'');
  console.log('PASS v0.8 read: 5/15/30s auto recovery, stale data preservation, 403 no retry, manual retry, no cross-document fetch.');
}
async function testWrite(){
  const sync=extract('    async function syncAll() {','    useEffect(()=>{\n      // Recover interrupted uploads');
  const schedule=extract('    function scheduleWriteRetry(items) {','    async function loadDocument(');
  const prepared=helpers+schedule+sync+'\nthis.syncAll=syncAll;';
  const records=new Map(),server=new Set(),errors=[],readCalls=[],timers=[];
  let state=[],apiCalls=[],mode='transient';
  const DB='D0',docRef={current:{id:'D2'}},syncingRef={current:false};
  const db=async(method,store,arg)=>{
    if(store!=='queue')throw Error('Store '+store);
    if(method==='getAll')return state.map(x=>({...x}));
    if(method==='put'){let i=state.findIndex(x=>x.op_id===arg.op_id);if(i<0)state.push({...arg});else state[i]={...arg};return arg;}
    throw Error('Unexpected DB op '+method);
  };
  const ctx={DB,database:db,syncingRef,navigator:{onLine:true},CFG:{auth_mode:'public'},authRef:{current:{}},
    docRef,refreshQueue:async()=>true,loadDocument:async id=>{readCalls.push(id);if(mode==='read_failed')throw Error('Failed to fetch');},
    B:x=>x,setSyncError:x=>errors.push(x),setError:x=>errors.push(x),window:{setTimeout:(fn,ms)=>{timers.push(ms);return wait(fn,ms);},clearTimeout:clear},
    writeRetryTimerRef:{current:null},uuid:()=> 'test-lease',syncLease:async()=>true,requestBackgroundSync:()=>{},
    api:async(path,method,payload)=>{
      apiCalls.push({id:payload.op_id,doc_id:payload.doc_id,path});
      if(mode==='transient'){
        const e=new Error('Failed to fetch');e.retryable=true;throw e;
      }
      if(mode==='403'){
        const e=new Error('Unauthorized');e.status=403;e.retryable=false;throw e;
      }
      if(mode==='ambiguous'){
        if(!server.has(payload.op_id)){server.add(payload.op_id);const e=new Error('Failed to fetch');e.retryable=true;throw e;}
        return{ok:true,deduplicated:true};
      }
      server.add(payload.op_id);return {ok:true};
    },Date:FakeDate,Math,console};
  vm.createContext(ctx);vm.runInContext(prepared,ctx);
  state=[{op_id:'op-a',kind:'log',doc_id:'D1',state:'pending',created:new FakeDate().toISOString(),text:'SYNTHETIC'}];
  for(let attempt=1;attempt<=5;attempt++){
    await ctx.syncAll();
    assert.equal(state[0].op_id,'op-a');
    assert.equal(state[0].attempts,attempt);
    if(attempt<5){
      assert.equal(state[0].state,'pending');assert.ok(state[0].next_retry);
      const when=Date.parse(state[0].next_retry);assert.ok(when>clock.now);
      clock.now=when+1;
    }else{
      assert.equal(state[0].state,'error');assert.equal(state[0].next_retry,undefined);
      assert.match(state[0].error,/изчерпани/);
    }
  }
  assert.equal(apiCalls.length,5);
  await ctx.syncAll();assert.equal(apiCalls.length,5,'No automatic resend of exhausted item');
  // Manual Retry resets only this existing operation: no new UUID or wrong incident.
  state[0]={...state[0],state:'pending',attempts:0,next_retry:null,error:''};
  mode='ambiguous';await ctx.syncAll();
  assert.equal(state[0].state,'pending');
  assert.ok(server.has('op-a'));
  clock.now=Date.parse(state[0].next_retry)+1;
  await ctx.syncAll();
  assert.equal(state[0].state,'synced');assert.equal(server.size,1);
  assert.equal(apiCalls.at(-1).id,'op-a');assert.equal(apiCalls.at(-1).doc_id,'D1');
  // Refresh can fail AFTER a successful write; it must not queue another write.
  state=[{op_id:'op-b',kind:'log',doc_id:'D2',state:'pending',created:new FakeDate().toISOString(),text:'SYNTHETIC B'}];
  mode='read_failed';await ctx.syncAll();
  assert.equal(state[0].state,'synced');
  const after=apiCalls.length;await ctx.syncAll();assert.equal(apiCalls.length,after);
  assert.ok(errors.some(x=>/Синхронизация/.test(x)));
  // 403 => no auto-retry. Error remains visible for manual intervention.
  state=[{op_id:'op-c',kind:'log',doc_id:'D2',state:'pending',created:new FakeDate().toISOString(),text:'SYNTHETIC C'}];
  mode='403';await ctx.syncAll();
  assert.equal(state[0].state,'error');assert.equal(state[0].next_retry,undefined);
  // A blocked child media operation must not spin every 250ms while parent is failed.
  const pendingParent={op_id:'failed-parent',kind:'log',state:'error',doc_id:'D2'};
  const waitingChild={op_id:'media-child',kind:'photo',log_op_id:'failed-parent',doc_id:'D2',
    state:'pending',next_retry:new FakeDate(clock.now-60000).toISOString()};
  const startTimers=clock.tasks.length;
  ctx.scheduleWriteRetry([pendingParent,waitingChild]);
  assert.equal(clock.tasks.length,startTimers,'Blocked attachment started a retry storm');
  console.log('PASS v0.8 write: capped attempts, stable op_id, duplicate ACK dedup, saved write survives failed refresh, 403 stops, cross-incident safe.');
}
(async()=>{await testRead();await testWrite()})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
