// Isolated UI regression: scope errors to the right source and bound read polling.
// No live Google/WordPress calls, no changes to real storage.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../assets/app.js','utf8');
assert.match(source,/const BVLOG_RUNNING_BUILD = '[0-9]+(?:\.[0-9]+){2,3}-[a-f0-9]{12}'/);
const exposed=source.replace('    const waiting=queue.filter(o=>o.state',
 '    window.__h={loadDocs,loadDocument,readBackoffRef,documentReadInFlightRef,docRef,syncingRef};\n    const waiting=queue.filter(o=>o.state');
assert.notEqual(exposed,source,'Failed to expose component helpers');
const names=Array.from(source.matchAll(/const \[([A-Za-z][A-Za-z0-9]*),\s*set[A-Za-z0-9]+\]=useState\(/g)).map(x=>x[1]);
const s={},refs={};let ix=0,rx=0,tree=null,effects=[],intervals=[],pending=[];
const idx=n=>{let i=names.indexOf(n);assert.ok(i>=0,n);return i;};
const put=(n,x)=>s[idx(n)]=x,get=n=>s[idx(n)];
const h=(type,props,...children)=>({type,props:props||{},children});
const result=(body,status=200)=>new Response(JSON.stringify(body),{status});
const browser={
  BVLOG_CONFIG:{api:'/wp-json/bvlog/v1/',auth_mode:'public',stt_mode:'none',user:{id:0},plugin_version:require('./fixture-contract').version},
  setInterval:(fn,ms)=>{intervals.push({fn,ms});return intervals.length;},clearInterval:()=>{},setTimeout:()=>{}
};
const calls=[],network=[];
const ui={window:browser,wp:{element:{createElement:h,
  useState:init=>{let k=ix++;if(!(k in s))s[k]=typeof init==='function'?init():init;
    return [s[k],v=>{s[k]=typeof v==='function'?v(s[k]):v;}];},
  useRef:init=>{let k=rx++;if(!(k in refs))refs[k]={current:init};return refs[k];},
  useEffect:(fn,deps)=>effects.push({fn,deps}),createRoot:()=>({render:v=>{tree=v;}})}},
  navigator:{onLine:true},document:{getElementById:()=>({}),hidden:false},
  indexedDB:{open:()=>{throw Error('Test storage unavailable');}},
  localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},
  fetch:async(path,options)=>{calls.push(String(path));assert.ok(network.length,'Unexpected fetch: '+path);
    let item=network.shift();if(item.path)assert.ok(String(path).includes(item.path),'Wrong request '+path);
    if(item.deferred)return new Promise(resolve=>{pending.push(resolve)});
    return item.response;},
  Blob,ArrayBuffer,Uint8Array,Response,URL,Date,Math,Promise,console,setTimeout,clearTimeout
};
vm.createContext(ui);vm.runInContext(exposed,ui);
function flatten(v,out=[]){if(v==null||typeof v==='string'||typeof v==='number'||typeof v==='boolean')return out;
 if(Array.isArray(v)){for(let c of v)flatten(c,out);return out;}
 if(typeof v.type==='function')return flatten(v.type({...v.props,children:v.children}),out);
 out.push(v);for(let c of v.children||[])flatten(c,out);return out;}
function render(){ix=0;rx=0;effects=[];return flatten(tree.type());}
const queueRequest=(path,r)=>network.push({path,response:r});
async function check(){
  put('mode','session');put('doc',{id:'D1',name:'Test action'});put('page','LOG');
  put('auth',{kind:'public',name:'Operator'});put('authLoading',false);put('online',true);
  put('queue',[]);put('data',{LOG:[],TEAM:[],TECH:[],FIELD_AUDIO:{}});
  render();browser.__h.docRef.current=get('doc');
  // 1. A list error is ONLY a list error; a successful incident read must not inherit it.
  queueRequest('documents',result({ok:false,message:'List fetch failed'},424));
  await browser.__h.loadDocs();
  assert.equal(get('docsError'),'List fetch failed');
  assert.equal(get('error'),'');
  queueRequest('document/D1',result({ok:true,data:{LOG:[],INFO:[],TEAM:[],TECH:[],FIELD_AUDIO:{}}}));
  await browser.__h.loadDocument('D1');
  assert.equal(get('docLoadError'),'');assert.ok(get('lastFreshAt'));
  assert.equal(get('docsError'),'List fetch failed','Document success must not silently suppress list failure');
  assert.ok(!render().some(x=>x.props.className==='bv-banner error'),
    'Stale list failure became global session banner despite fresh document');
  put('mode','choose');assert.ok(render().some(x=>x.props.className==='bv-load-error'),
    'List failure not visible in list context');
  // 2. A list success clears ONLY its own error; local queue and sync alerts persist.
  put('localStoreError','IndexedDB quota');put('syncError','Sync failure');
  queueRequest('documents',result({ok:true,documents:[],action_types:[]}));
  await browser.__h.loadDocs();
  assert.equal(get('docsError'),'');
  assert.equal(get('localStoreError'),'IndexedDB quota');
  assert.equal(get('syncError'),'Sync failure');
  put('mode','session');render();
  // 3. A read fails after a previously successful read; old content remains.
  const oldData=get('data'),oldFresh=get('lastFreshAt');
  queueRequest('document/D1',result({message:'HTTP 424: Google timeout'},424));
  await browser.__h.loadDocument('D1');
  assert.strictEqual(get('data'),oldData,'A failed read must retain cached content');
  assert.equal(get('lastFreshAt'),oldFresh,'A failed read must not lie about freshness');
  assert.match(get('docLoadError'),/Неуспешно|timeout|Google/);
  assert.ok(browser.__h.readBackoffRef.current.nextAt>Date.now(),'No bounded backoff after read error');
  // Failed refresh must render as an inline document error, not overwrite local error.
  assert.ok(render().some(x=>x.props.className==='bv-load-error'));
  assert.equal(get('localStoreError'),'IndexedDB quota');
  // Backoff state is asserted above; scheduler timing is covered by
  // test-v080-retry.js and test-v0822-tab-prefetch.js. Manual retry bypasses backoff.
  put('localStoreError','');put('syncError','');
  render();browser.__h.docRef.current=get('doc');
  queueRequest('document/D1',result({ok:true,data:{LOG:[],INFO:[],TEAM:[],TECH:[],FIELD_AUDIO:{}}}));
  await browser.__h.loadDocument('D1');
  assert.equal(get('docLoadError'),'');
  assert.equal(browser.__h.readBackoffRef.current.attempts,0);
  assert.equal(get('localStoreError'),'');
  // 5. Two overlapping reads for the SAME incident must coalesce.
  network.push({path:'document/D1',deferred:true});
  const first=browser.__h.loadDocument('D1');
  const second=await browser.__h.loadDocument('D1');
  assert.equal(second,false,'Parallel read was not blocked');
  assert.equal(pending.length,1,'Two in-flight Google reads');
  pending.shift()(result({ok:true,data:{LOG:[],INFO:[],TEAM:[],TECH:[],FIELD_AUDIO:{}}}));
  await first;assert.equal(browser.__h.documentReadInFlightRef.current,null);
  console.log('PASS v0.7.2.1 UI: scoped list/doc/local/sync errors, freshness, cached result on failure, bounded read backoff, manual retry and in-flight dedupe.');
}
check().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
