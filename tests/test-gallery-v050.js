// Static React state/interactions: per-LOG photo icon opens in-app gallery.
const fs=require('fs');
const vm=require('vm');
const assert=require('assert');
const code=fs.readFileSync(__dirname+'/../assets/app.js','utf8');
let output,hook=0;
const slot=n=>require('./fixture-contract').slot(code,n);
const values={
  [slot('mode')]:'session',
  [slot('doc')]:{id:'DOCUMENTABCDEFGHIJKLMN012345',name:'2026.11.11 - ДКА - Издирване - Витоша'},
  [slot('page')]:'LOG',
  [slot('data')]:{LOG:[{row:3,cells:[1,'14:32','Operator','Съобщение','През приложението','📷','log-id'],
    photos:[{id:'11111111-1111-4111-8111-111111111111',managed:true,text:'first.jpg'},
      {id:'22222222-2222-4222-8222-222222222222',managed:true,text:'second.jpg'}]}]},
  [slot('auth')]:{kind:'google',sub:'123456789',name:'Operator'},[slot('authLoading')]:false
};
const make=(type,props,...children)=>({type,props:props||{},children});
const ctx={wp:{element:{createElement:make,useState:init=>{
  const idx=hook++;
  if(!(idx in values))values[idx]=init;
  return [values[idx],v=>{values[idx]=typeof v==='function'?v(values[idx]):v;}];
},useEffect:()=>{},useRef:v=>({current:v}),createRoot:()=>({render:x=>output=x})}},
window:{BVLOG_CONFIG:{api:'/wp-json/bvlog/v1/',auth_mode:'google',user:{id:0,name:''},logo_url:'/logo.webp'},setTimeout},
navigator:{onLine:true},document:{getElementById:()=>({})},indexedDB:{},localStorage:{getItem:()=>'',setItem:()=>{}},console,setTimeout};
vm.createContext(ctx);vm.runInContext(code,ctx);
function render(){hook=0;return output.type();}
function collect(node,into=[]){
 if(node===null||node===undefined||typeof node==='string'||typeof node==='number'||node===false)return into;
 if(Array.isArray(node)){node.forEach(n=>collect(n,into));return into;}
 if(typeof node.type==='function')return collect(node.type({...node.props,children:node.children}),into);
 into.push(node);node.children.forEach(n=>collect(n,into));return into;
}
function label(node){if(node==null)return '';if(['string','number'].includes(typeof node))return String(node);
 if(Array.isArray(node))return node.map(label).join(' ');
 if(typeof node.type==='function')return label(node.type({...node.props,children:node.children}));
 return label(node.children);
}
let nodes=collect(render());
const photoButton=nodes.find(n=>n.type==='button'&&n.props.className==='bv-photo-indicator');
assert.ok(photoButton,'Photo count button is missing from LOG record');
assert.ok(label(photoButton).includes('Снимки ( 2 )'));
photoButton.props.onClick();
nodes=collect(render());
assert.ok(nodes.find(n=>n.type==='div'&&n.props.className==='bv-modal bv-gallery'));
assert.ok(label(nodes).includes('1 / 2'));
const next=nodes.find(n=>n.type==='button'&&label(n).includes('Следваща'));
assert.ok(next && !next.props.disabled);next.props.onClick();
nodes=collect(render());
assert.ok(label(nodes).includes('2 / 2'));
const close=nodes.find(n=>n.type==='button'&&n.props['aria-label']==='Затвори');
assert.ok(close);close.props.onClick();
assert.ok(!collect(render()).some(n=>n.props.className==='bv-modal bv-gallery'));
console.log('PASS: LOG photo indicator, count, in-app gallery, next image and close interaction.');
