/* Regression: audio review cards expose deletion and cannot delete active STT work. */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const source = fs.readFileSync(__dirname + '/../assets/app.js', 'utf8');
const {Blob} = require('buffer');

async function exercise(preventDeletion) {
  const ids = new Map();
  const recording = {op_id:'audio-op-001',kind:'audio',doc_id:'document-001',doc_name:'Издирване — Самоков',
    created:'2026-11-11T11:32:00Z',event_at:'2026-11-11T11:32:00Z',state:'audio',blob:new Blob(['sample audio'])};
  ids.set(recording.op_id, recording);
  let confirmCount = 0;
  let output;
  let hookIndex = 0;
  const db = {
    objectStoreNames:{contains:()=>true},
    transaction:()=>({objectStore:()=>({
      get:(id)=>makeRequest(()=>ids.get(id)),
      getAll:()=>makeRequest(()=>Array.from(ids.values())),
      delete:(id)=>makeRequest(()=>{ids.delete(id);return undefined;}),
      put:(entry)=>makeRequest(()=>{ids.set(entry.op_id,entry);return entry;})
    })})
  };
  function makeRequest(action) {
    const req={result:undefined,onsuccess:null,onerror:null};
    queueMicrotask(()=>{try{req.result=action();req.onsuccess&&req.onsuccess();}catch(e){req.error=e;req.onerror&&req.onerror();}});
    return req;
  }
  const ctx={
    wp:{element:{createElement:(type,props,...children)=>({type,props:props||{},children}),
      useState:init=>{const index=hookIndex++;
        const overrides={0:'session',1:{id:'document-001',name:'Издирване — Самоков'},
          2:'LOG',3:{LOG:[]},13:{kind:'google',sub:'u1',name:'Тест'},14:false,22:[recording]};
        return [index in overrides?overrides[index]:init,()=>{}];},
      useRef:v=>({current:v}),useEffect:()=>{},createRoot:()=>({render:x=>output=x})}},
    window:{BVLOG_CONFIG:{api:'/wp-json/bvlog/v1/',auth_mode:'google',user:{id:0,name:''},stt_mode:'cloud',stt_cloud:false},
      confirm:()=>{confirmCount++;if(preventDeletion)ids.set(recording.op_id,{...recording,state:'transcribing'});return true;},
      setTimeout},
    navigator:{onLine:false},
    document:{getElementById:()=>({})},
    indexedDB:{open:()=>{const req={result:db};queueMicrotask(()=>req.onsuccess&&req.onsuccess());return req;}},
    localStorage:{getItem:()=>'',setItem:()=>{}},
    console,Blob,Date,setTimeout,clearTimeout,crypto:undefined
  };
  ctx.window.navigator=ctx.navigator;
  vm.createContext(ctx);
  vm.runInContext(source,ctx);
  const nodes=[];
  function visit(node) {
    if(!node||typeof node==='string'||typeof node==='number')return;
    if(Array.isArray(node)){node.forEach(visit);return;}
    if(typeof node.type==='function'){visit(node.type({...node.props,children:node.children}));return;}
    nodes.push(node);
    visit(node.children);
  }
  const rendered=output.type();
  visit(rendered);
  const text=node=>{
    if(!node||node===false)return '';
    if(typeof node==='string'||typeof node==='number')return String(node);
    if(Array.isArray(node))return node.map(text).join(' ');
    if(typeof node.type==='function')return text(node.type({...node.props,children:node.children}));
    return text(node.children);
  };
  const allText=text(rendered);
  assert.ok(allText.includes('Акция: Издирване — Самоков'),allText);
  assert.ok(allText.includes('Чака транскрипция'),allText);
  const del=nodes.find(n=>n.type==='button'&&n.props.className==='bv-delete-op'&&text(n).includes('Изтрий записа'));
  assert.ok(del,'Delete button missing from inline audio review card');
  assert.equal(del.props.type,'button');
  await del.props.onClick();
  assert.equal(confirmCount,1);
  assert.equal(ids.has('audio-op-001'),preventDeletion,'Unexpected deletion behavior');
}
(async()=>{
  await exercise(false);
  await exercise(true);
  console.log('PASS: inline audio deletion, target label, confirmation and in-flight STT protection.');
})().catch(e=>{console.error(e);process.exit(1);});
