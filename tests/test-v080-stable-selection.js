// Regression for issue #11: exact document selection survives late list refresh.
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const raw=fs.readFileSync(__dirname+'/../assets/app.js','utf8');
const anchor='    const waiting=queue.filter(o=>o.state';
assert.ok(raw.includes(anchor));
const app=raw.replace(anchor,
  '    window.__choiceTest={loadDocs,selectExistingDocument,selectedDocRef,selectedDocManualRef,docsRequestRef};\n'+anchor);
const names=Array.from(app.matchAll(/const \[([A-Za-z][A-Za-z0-9]*),\s*set[A-Za-z0-9]+\]=useState\(/g)).map(x=>x[1]);
const state={},refs={};let hook=0,ref=0,rendered;
const idx=n=>{const i=names.indexOf(n);assert.ok(i>=0,n);return i;};
const get=n=>state[idx(n)],set=(n,v)=>state[idx(n)]=v;
const requests=[];
const h=(type,props,...children)=>({type,props:props||{},children});
const context={window:{BVLOG_CONFIG:{api:'/wp-json/',auth_mode:'public',stt_mode:'none',user:{id:0},plugin_version:'0.7.2.1'}},
 wp:{element:{createElement:h,useState:init=>{const i=hook++;if(!(i in state))state[i]=typeof init==='function'?init():init;
   return [state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v;}];},
   useRef:init=>{const i=ref++;if(!(i in refs))refs[i]={current:init};return refs[i];},
   useEffect:()=>{},createRoot:()=>({render:v=>rendered=v})}},
 navigator:{onLine:true},document:{getElementById:()=>({})},
 indexedDB:{},localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},
 fetch:()=>new Promise(resolve=>requests.push(resolve)),
 console,URL,Response,Date,Math,Promise,Blob,ArrayBuffer,Uint8Array,setTimeout,clearTimeout};
vm.createContext(context);vm.runInContext(app,context);
function nodes(x,result=[]){
 if(x==null||typeof x==='string'||typeof x==='number'||typeof x==='boolean')return result;
 if(Array.isArray(x)){x.forEach(y=>nodes(y,result));return result;}
 if(typeof x.type==='function')return nodes(x.type({...x.props,children:x.children}),result);
 result.push(x);(x.children||[]).forEach(y=>nodes(y,result));return result;
}
function render(){hook=0;ref=0;return nodes(rendered.type());}
const data=docs=>new Response(JSON.stringify({ok:true,documents:docs,action_types:['Издирване']}),{status:200});
const docs=[{id:'newest',name:'Най-нова акция'},{id:'older',name:'Стара акция'}];
(async()=>{
 set('mode','choose');set('authLoading',false);render();
 // Initial load defaults to the newest only while no user choice exists.
 let task=context.window.__choiceTest.loadDocs();requests.shift()(data(docs));await task;
 assert.equal(get('selectedDoc'),'newest');
 let tree=render();let chooser=tree.find(n=>n.type==='select'&&n.children.flat(Infinity).some(o=>o.props?.value==='older'));
 assert.ok(chooser,'Incident chooser missing');
 // User selection happens DURING an HTTP request: latest response must not overwrite it.
 task=context.window.__choiceTest.loadDocs();chooser.props.onChange({target:{value:'older'}});
 assert.equal(get('selectedDoc'),'older');requests.shift()(data(docs));await task;
 assert.equal(get('selectedDoc'),'older');
 assert.equal(context.window.__choiceTest.selectedDocRef.current,'older');
 // Two overlapping fetches; ignore the stale response, even when it arrives last.
 const first=context.window.__choiceTest.loadDocs(),second=context.window.__choiceTest.loadDocs();
 const reply1=requests.shift(),reply2=requests.shift();
 reply2(data(docs));await second;
 reply1(data([{id:'stale',name:'Old cached response'}]));await first;
 assert.equal(get('selectedDoc'),'older');assert.equal(get('docs').length,2);
 // Deleted/revoked document: do NOT silently move selection to newest.
 task=context.window.__choiceTest.loadDocs();requests.shift()(data([docs[0]]));await task;
 assert.equal(get('selectedDoc'),'');assert.match(get('docsError'),/вече не е налична/);
 tree=render();const open=tree.find(n=>n.type==='button' && n.children.flat(Infinity).some(c=>typeof c==='string'&&c.includes('Отвори')));
 assert.ok(open && open.props.disabled,'Must block opening a different action after removal');
 // An explicit new selection is accepted; default remains disabled until then.
 chooser=tree.find(n=>n.type==='select'&&n.children.flat(Infinity).some(o=>o.props?.value==='newest'));
 chooser.props.onChange({target:{value:'newest'}});
 assert.equal(get('selectedDoc'),'newest');assert.equal(get('docsError'),'');
 // Another list request preserves this new explicit selection.
 task=context.window.__choiceTest.loadDocs();requests.shift()(data([docs[0]]));await task;
 assert.equal(get('selectedDoc'),'newest');
 console.log('PASS v0.8 selection: late responses, racing requests, removed document fallback and explicit re-selection.');
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
