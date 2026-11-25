// Interactive React tree smoke test for v0.6.0 (no browser/network).
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(__dirname+'/../assets/app.js','utf8');
let output,hook=0;
const slot=n=>require('./fixture-contract').slot(source,n);
const values={
  [slot('mode')]:'session',[slot('doc')]:{id:'DOCUMENTABCDEFGHIJKLMN012345',name:'Тестова акция'},[slot('page')]:'LOG',
  [slot('data')]:{LOG:[{row:3,cells:[1,'14:32','Оператор','Екипът пристигна','Глас през приложението','','aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'],
    status:'',audio:{id:'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',mime:'audio/webm',bytes:1000},photos:[],history:[]}]},
  [slot('auth')]:{kind:'google',sub:'123456789',name:'Оператор'},[slot('authLoading')]:false
};
const h=(type,props,...children)=>({type,props:props||{},children});
const ctx={wp:{element:{createElement:h,useState:init=>{
 const i=hook++;if(!(i in values))values[i]=typeof init==='function'?init():init;
 return [values[i],update=>{values[i]=typeof update==='function'?update(values[i]):update;}];
},useEffect:()=>{},useRef:value=>({current:value}),createRoot:()=>({render:x=>output=x})}},
 window:{BVLOG_CONFIG:{api:'/wp-json/bvlog/v1/',auth_mode:'google',stt_mode:'cloud',
    user:{id:0,name:''},logo_url:'/logo.webp'},setTimeout},
 navigator:{onLine:true},document:{getElementById:()=>({})},indexedDB:{},
 localStorage:{getItem:()=>'',setItem:()=>{}},console,setTimeout};
vm.createContext(ctx);vm.runInContext(source,ctx);
function render(){hook=0;return output.type();}
function walk(node,arr=[]){
 if(node===undefined||node===null||node===false||typeof node==='string'||typeof node==='number')return arr;
 if(Array.isArray(node)){node.forEach(x=>walk(x,arr));return arr;}
 if(typeof node.type==='function')return walk(node.type({...node.props,children:node.children}),arr);
 arr.push(node);node.children.forEach(x=>walk(x,arr));return arr;
}
function content(n){if(n==null)return '';if(Array.isArray(n))return n.map(content).join(' ');
 if(typeof n==='string'||typeof n==='number')return String(n);
 if(typeof n.type==='function')return content(n.type({...n.props,children:n.children}));
 return content(n.children);
}
let nodes=walk(render());
const mic=nodes.find(x=>x.props['aria-label']==='Избор и тест на микрофона');
assert.ok(mic,'Mic settings menu toggle not found');mic.props.onClick();
nodes=walk(render());assert.ok(content(nodes).includes('Тествай и прослушай'));
const eventToggle=nodes.find(x=>x.props['aria-label']==='Действия за събитието');
assert.ok(eventToggle);eventToggle.props.onClick();nodes=walk(render());
assert.ok(content(nodes).includes('Анулирай'));assert.ok(content(nodes).includes('Редактирай'));
const edit=nodes.find(x=>x.type==='button'&&content(x).includes('Редактирай'));
assert.ok(edit);edit.props.onClick();nodes=walk(render());
assert.ok(nodes.find(x=>x.props['aria-label']==='Редакция на LOG събитие'));
assert.ok(content(nodes).includes('Оригиналното аудио и историята остават непроменени.'));
assert.ok(nodes.find(x=>x.type==='button'&&content(x).includes('Чуй оригинала')));
// A cancelled event becomes read-only and remains visible.
values[slot('data')].LOG[0].status='cancelled';values[slot('logEditor')]=null;
nodes=walk(render());
assert.ok(nodes.some(x=>x.props.className==='bv-event bv-event-cancelled'));
assert.ok(!nodes.some(x=>x.props['aria-label']==='Действия за събитието'));
console.log('PASS v0.6.0: mic menu, LOG action menu, edit modal, original audio button, cancelled read-only state.');
