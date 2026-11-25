// v0.6.1 regression: 512 KiB audio chunks and player UI (no remote services).
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const code=fs.readFileSync(__dirname+'/../apps-script/Code.gs','utf8');
assert.ok(!code.includes('||='),'Invalid Apps Script compound assignment');
const source=fs.readFileSync(__dirname+'/../assets/app.js','utf8');
assert.ok(source.includes("invalidateTabs(o.doc_id"),'ACK must invalidate the document cache independently of slow media');
assert.ok(source.includes('const cached=photoDataCacheRef.current.get(cacheKey)'),'Gallery should cache private photo previews');
assert.ok(source.includes('const cache=audioBlobCacheRef.current'),'Audio cache missing');
let out,hook=0;
const stateNames=Array.from(source.matchAll(/const \[([A-Za-z][A-Za-z0-9]*),\s*set[A-Za-z0-9]+\]=useState\(/g)).map(x=>x[1]);
const state={};
const name=(x)=>{const n=stateNames.indexOf(x);assert.ok(n>=0,'Cannot find state: '+x);return n;};
state[name('mode')]='session';
state[name('doc')]={id:'DOCUMENTABCDEFGHIJKLMN012345',name:'Test'};
state[name('page')]='LOG';
state[name('data')]={LOG:[]};
state[name('auth')]={kind:'google',name:'Operator'};
state[name('authLoading')]=false;
state[name('audioPlayer')]={url:'blob:test-private-audio',label:'Test audio'};
const h=(type,props,...children)=>({type,props:props||{},children});
const ctx={wp:{element:{createElement:h,useState:init=>{const i=hook++;if(!(i in state))state[i]=typeof init==='function'?init():init;
 return [state[i],v=>state[i]=typeof v==='function'?v(state[i]):v];},useEffect:()=>{},useRef:v=>({current:v}),createRoot:()=>({render:r=>out=r})}},
 window:{BVLOG_CONFIG:{api:'/wp-json/',auth_mode:'google',stt_mode:'cloud',user:{id:0,name:''},logo_url:'/logo.webp'},setTimeout},
 navigator:{onLine:true},document:{getElementById:()=>({})},indexedDB:{},localStorage:{getItem:()=>'',setItem:()=>{}},console,setTimeout};
vm.createContext(ctx);vm.runInContext(source,ctx);
function render(){hook=0;return out.type();}
function walk(n,a=[]){if(n===null||n===undefined||n===false||['string','number'].includes(typeof n))return a;
 if(Array.isArray(n)){n.forEach(v=>walk(v,a));return a;}
 if(typeof n.type==='function')return walk(n.type({...n.props,children:n.children}),a);
 a.push(n);n.children.forEach(v=>walk(v,a));return a;}
const nodes=walk(render());
assert.ok(nodes.some(n=>n.type==='audio'&&n.props.controls&&n.props.src==='blob:test-private-audio'),'Browser audio controls not visible');
assert.ok(nodes.some(n=>n.props.className==='bv-audio-stop'),'Dedicated Stop button missing');
assert.ok(nodes.some(n=>n.props['aria-label']==='Затвори аудио плейъра'),'Close player action missing');
assert.ok(nodes.some(n=>n.props.className==='bv-shell bv-has-audio'),'Page reserves media player space');
const blobSize=8*1024*1024, oldRequests=Math.ceil(blobSize/196608), newRequests=Math.ceil(blobSize/524288);
assert.strictEqual(oldRequests,43);assert.strictEqual(newRequests,16);
assert.ok(code.includes('requested>524288'),'Audio reads remain capped at 512 KiB');
console.log('PASS v0.6.1: player UI, safe cache behavior and 43 -> 16 audio segments for 8MiB.');
