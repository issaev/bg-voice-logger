// v0.6.2 loading skeleton, refresh/error and unsaved voice fallback regression.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(__dirname+'/../assets/app.js','utf8');
let output,hook=0;
const stateNames=Array.from(source.matchAll(/const \[([A-Za-z][A-Za-z0-9]*),\s*set[A-Za-z0-9]+\]=useState\(/g)).map(x=>x[1]);
const states={};
const stateSlot=n=>{const i=stateNames.indexOf(n);assert.ok(i>=0,'Missing state '+n);return i;};
states[stateSlot('mode')]='session';
states[stateSlot('doc')]={id:'DOCUMENT_01234567890123',name:'Test DKA'};
states[stateSlot('page')]='LOG';
states[stateSlot('data')]=null;
states[stateSlot('docLoading')]=true;
states[stateSlot('authLoading')]=false;
states[stateSlot('auth')]={kind:'google',name:'Test Operator'};
const h=(type,props,...children)=>({type,props:props||{},children});
const wp={element:{createElement:h,useState:init=>{const i=hook++;if(!(i in states))states[i]=typeof init==='function'?init():init;
  return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v];},useEffect:()=>{},useRef:v=>({current:v}),createRoot:()=>({render:x=>output=x})}};
const ctx={window:{BVLOG_CONFIG:{api:'/wp-json/',auth_mode:'google',stt_mode:'cloud',stt_cloud:false,
  user:{id:0,name:''},logo_url:'/logo.webp'},setTimeout},wp,navigator:{onLine:true},
  document:{getElementById:()=>({})},indexedDB:{},localStorage:{getItem:()=>'',setItem:()=>{}},console,setTimeout,Blob};
vm.createContext(ctx);vm.runInContext(source,ctx);
function walk(n,seen=[]){
  if(n==null||n===false||typeof n==='string'||typeof n==='number')return seen;
  if(Array.isArray(n)){for(const x of n)walk(x,seen);return seen;}
  if(typeof n.type==='function')return walk(n.type({...n.props,children:n.children}),seen);
  seen.push(n);for(const x of n.children||[])walk(x,seen);return seen;
}
function render(){hook=0;return walk(output.type());}
function hasText(nodes,part){return nodes.some(n=>n.children.some(c=>typeof c==='string'&&c.includes(part)));}
let nodes=render();
assert.ok(nodes.some(n=>n.props.className==='bv-loading-spinner'),'spinner missing');
assert.ok(nodes.some(n=>n.props.className==='bv-skeleton-card'),'LOG skeleton absent');
assert.ok(hasText(nodes,'Зареждане на последните събития'),'LOG loading caption absent');
for(const page of ['INFO','TECH','TEAM']){
  states[stateSlot('page')]=page;nodes=render();
  assert.ok(nodes.some(n=>n.props.className==='bv-skeleton-card'),'Missing '+page+' skeleton');
}
states[stateSlot('docLoading')]=false;
states[stateSlot('docLoadError')]='Timeout from Google';
nodes=render();
assert.ok(nodes.some(n=>n.props.className==='bv-load-error'),'retry panel absent');
assert.ok(hasText(nodes,'Опитай отново'),'retry action absent');
states[stateSlot('page')]='LOG';
states[stateSlot('unsavedAudio')]={blob:new Blob(['voice'],{type:'audio/mp4'}),when:'2026-11-17T20:00:00Z'};
nodes=render();
assert.ok(nodes.some(n=>n.props.className==='bv-unsaved-audio'),'missing unsaved recording warning');
assert.ok(hasText(nodes,'Изтегли аудиото'),'missing local download fallback');
console.log('PASS v0.6.2 UI: LOG/INFO/TECH/TEAM skeletons, retry and unsaved-audio recovery.');
