// v0.7.2 voice-event continuity: no WordPress/Google calls and no real incident data.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../assets/app.js','utf8');
function extract(start,end){
  const i=source.indexOf(start),j=source.indexOf(end,i+start.length);
  assert.ok(i>=0&&j>i,'Missing '+start);
  return source.slice(i,j);
}
const pure=extract('  function journalEntries(queue,logs,docId,limit) {','  function EntryStatus({status}) {');
const test={};vm.createContext(test);vm.runInContext(pure+'\nthis.project=journalEntries;this.isLog=isLocalJournalOp;',test);
const op='stable-voice-uuid';
const base={op_id:op,doc_id:'current',kind:'audio',state:'audio',event_at:'2026-11-24T10:11:13Z'};
const states=[
  {...base},
  {...base,state:'transcribing'},
  {...base,state:'voice_review',transcript:'Съмнително разпознаване'},
  {...base,kind:'log',state:'pending',text:'Потвърдено събитие'},
  {...base,kind:'log',state:'sending',text:'Потвърдено събитие'},
  {...base,kind:'log',state:'synced',text:'Потвърдено събитие'}
];
for(const item of states){
  const feed=test.project([item],[],'current');
  assert.equal(feed.length,1,'Queue stage disappeared: '+item.state);
  assert.equal(feed[0].key,'log:'+op,'React key changed at '+item.state);
  assert.equal(feed[0].local.op_id,op);
}
// A POST succeeded, but a subsequent read failed: local row MUST remain visible.
const stale=test.project([states.at(-1)],[],'current');
assert.equal(stale.length,1);
assert.equal(stale[0].local.state,'synced');
// The first fresh Sheets read replaces the queue representation without a second row.
const remote={row:9,cells:['','12:11','Operator','Потвърдено събитие','Глас','',op]};
const confirmed=test.project([states.at(-1)],[remote],'current');
assert.equal(confirmed.length,1,'Duplicate when server row arrived');
assert.equal(confirmed[0].key,stale[0].key,'React key changed from local to server');
assert.equal(confirmed[0].remote.row,9);
// Do not accidentally render audio intended for INFO or another incident as LOG.
assert.equal(test.project([{...base,target:{kind:'field',sheet:'INFO'}},
  {...base,op_id:'foreign',doc_id:'other'}],[],'current').length,0);
// Correct local order when several new events arrive without a server response.
const older={...base,op_id:'older',event_at:'2026-11-24T10:10:00Z'};
assert.deepEqual(Array.from(test.project([older,base],[],'current')).map(x=>x.key),
  ['log:'+op,'log:older']);
assert.equal(test.project(Array.from({length:50},(_,i)=>({...base,op_id:'op'+i})),[],'current').length,35);
assert.equal(test.project([{...base,state:'cancelled'}],[],'current').length,0);
assert.ok(test.isLog(base,'current'));
assert.ok(!test.isLog({...base,target:{kind:'field'}},'current'));

// Real component projection: row is present in one .bv-events container throughout.
const exposed=source.replace('  const ReactComponent=wp.element.Component;',
  '  window.__App=App;\n  const ReactComponent=wp.element.Component;');
assert.notEqual(exposed,source);
const names=Array.from(source.matchAll(/const \[([A-Za-z][A-Za-z0-9]*),\s*set[A-Za-z0-9]+\]=useState\(/g)).map(x=>x[1]);
const data={};const refs={};let hookIndex=0,refIndex=0;
function index(name){const i=names.indexOf(name);assert.ok(i>=0,name);return i;}
function setState(name,value){data[index(name)]=value;}
const h=(type,props,...children)=>({type,props:props||{},children});
function flatten(v,out=[]){
  if(v==null||typeof v==='string'||typeof v==='number'||typeof v==='boolean')return out;
  if(Array.isArray(v)){for(const x of v)flatten(x,out);return out;}
  if(typeof v.type==='function')return flatten(v.type({...v.props,children:v.children}),out);
  out.push(v);for(const c of v.children||[])flatten(c,out);return out;
}
const w={BVLOG_CONFIG:{api:'/wp-json/',auth_mode:'public',stt_mode:'none',user:{id:0},plugin_version:'0.7.2'},setTimeout:()=>{},setInterval:()=>1,clearInterval:()=>{}};
const ui={window:w,wp:{element:{createElement:h,
 useState:init=>{const i=hookIndex++;if(!(i in data))data[i]=typeof init==='function'?init():init;
   return[data[i],fn=>{data[i]=typeof fn==='function'?fn(data[i]):fn;}];},
 useRef:init=>{const i=refIndex++;if(!(i in refs))refs[i]={current:init};return refs[i];},
 useEffect:()=>{},createRoot:()=>({render:()=>{}})}},
 navigator:{onLine:true},document:{getElementById:()=>null,hidden:false},
 indexedDB:{open:()=>({})},localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},
 Blob,ArrayBuffer,Uint8Array,Response,URL,console,setTimeout,clearTimeout,Date,Promise,Math};
vm.createContext(ui);vm.runInContext(exposed,ui);
setState('mode','session');setState('doc',{id:'current',name:'Test incident'});
setState('page','LOG');setState('auth',{kind:'public',name:'Operator'});
setState('authLoading',false);setState('online',true);
setState('data',{LOG:[],INFO:[],TECH:[],TEAM:[],FIELD_AUDIO:{}});
function render(){hookIndex=0;refIndex=0;return flatten(w.__App());}
function eventRows(tree){return tree.filter(n=>n.props.key==='log:'+op);}
for(const item of states){
 setState('queue',[item]);const tree=render(),rows=eventRows(tree);
 assert.equal(rows.length,1,'No/duplicate visible row during '+item.state);
 assert.ok(tree.some(n=>n.props.className==='bv-events'),'Missing single unified event list');
 assert.ok(!tree.some(n=>n.props.className==='bv-local-entries'),'Old split list still exists');
 if(item.state==='voice_review'){
   const textarea=tree.find(n=>n.type==='textarea'&&n.props['aria-label']==='Транскрипция за проверка');
   assert.ok(textarea,'Voice confirmation must be available inline');
   textarea.props.onChange({target:{value:'Коригиран текст'}});
   const updated=render().find(n=>n.type==='textarea'&&n.props['aria-label']==='Транскрипция за проверка');
   assert.equal(updated.props.value,'Коригиран текст','Queue refresh must not overwrite draft');
 }
}
setState('queue',[states.at(-1)]);setState('data',{LOG:[remote],INFO:[],TECH:[],TEAM:[],FIELD_AUDIO:{}});
assert.equal(eventRows(render()).length,1,'Refreshed server version must replace the same row');
console.log('PASS voice journal continuity: audio/review/pending/sending/synced/remote keep one stable visible row; draft and legacy rows preserved.');
