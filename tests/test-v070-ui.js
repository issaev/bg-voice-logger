// Regression: INFO column scope, audio buttons, visible build and error boundary.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const code=fs.readFileSync(__dirname+'/../assets/app.js','utf8');
const marker=code.match(/const BVLOG_RUNNING_BUILD = '([^']+)'/)[1];
assert.match(marker,/^0\.7\.1-[a-f0-9]{12}$/);
let output,hook=0;
const stateNames=Array.from(code.matchAll(/const \[([A-Za-z][A-Za-z0-9]*),\s*set[A-Za-z0-9]+\]=useState\(/g)).map(x=>x[1]);
const states={};
const slot=n=>{const i=stateNames.indexOf(n);assert.ok(i>=0,'Missing '+n);return i;};
const infoRows=Array.from({length:35},()=>[]);
infoRows[2]=['Тип акция','Издирване','ДКА','Район 3'];
infoRows[3]=['GPS координати',42.6,'23.3','']; // Numeric cells must not crash the render.
infoRows[20]=['Втори ден','', '', ''];
states[slot('mode')]='session';states[slot('doc')]={id:'DOCUMENT_01234567890123',name:'DKA Test',url:'https://docs.google.com/spreadsheets/d/DOCUMENT_01234567890123/edit'};
states[slot('page')]='INFO';
states[slot('data')]={INFO:infoRows,INFO_SECTIONS:[{headerRow:2,date:'',columns:[{col:2,letter:'B',label:'Инфо'},{col:3,letter:'C',label:'Коментар / линк / телефон'},{col:4,letter:'D',label:'Допълнителна информация'}],rows:[{row:3,label:'Акция',section:0,fields:[{col:'B',header:'Инфо',value:'Наводнение',choices:['Наводнение','Издирване']},{col:'C',header:'Коментар / линк / телефон',value:'test',choices:[]},{col:'D',header:'Допълнителна информация',value:'',choices:[]}]},{row:7,label:'Координатор 3',section:0,fields:[{col:'B',header:'Инфо',value:'Иван',choices:[]},{col:'C',header:'Коментар / линк / телефон',value:'',choices:[]},{col:'D',header:'Допълнителна информация',value:'',choices:[]}]}]}],FIELD_AUDIO:{'INFO:B3':[{id:'audio1'}],'INFO:C3':[{id:'audio2'}]}};
states[slot('auth')]={kind:'google',name:'Operator'};states[slot('authLoading')]=false;
const h=(type,props,...children)=>({type,props:props||{},children});
const ctx={wp:{element:{createElement:h,useState:init=>{const i=hook++;if(!(i in states))states[i]=typeof init==='function'?init():init;
return [states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v;}];},useEffect:()=>{},useRef:v=>({current:v}),
createRoot:()=>({render:x=>output=x})}},
window:{BVLOG_CONFIG:{api:'/wp-json/',auth_mode:'google',stt_mode:'cloud',user:{id:0,name:''},
plugin_version:'0.7.1',expected_build:marker,logo_url:'/logo.webp'},setTimeout},navigator:{onLine:true},
document:{getElementById:()=>({})},indexedDB:{},localStorage:{getItem:()=>'',setItem:()=>{}},console,setTimeout};
vm.createContext(ctx);vm.runInContext(code,ctx);
assert.strictEqual(ctx.window.BVLOG_RUNNING_BUILD,marker);
function walk(n,seen=[]){if(!n||typeof n==='string'||typeof n==='number')return seen;
 if(Array.isArray(n)){n.forEach(v=>walk(v,seen));return seen;}
 if(typeof n.type==='function')return walk(n.type({...n.props,children:n.children}),seen);
 seen.push(n);(n.children||[]).forEach(v=>walk(v,seen));return seen;
}
function render(){hook=0;return walk(output.type());}
const nodes=render();
const audioBtns=nodes.filter(n=>n.type==='button'&&n.props.className==='bv-photo-indicator');
assert.strictEqual(audioBtns.length,2,'INFO audio buttons should render for B3/C3');
assert.ok(nodes.some(n=>n.props.className==='bv-build-id'),'Expected visible running JS build');
assert.ok(!nodes.some(n=>n.props.className==='bv-banner error'),'Unexpected build warning');
assert.ok(nodes.some(n=>n.props.className==='bv-info-col'),'INFO grouping class missing');
assert.ok(nodes.some(n=>n.props.className==='bv-sheet-link'&&n.props.href.includes('DOCUMENT_01234567890123')),'Direct link to active Sheet is missing');
assert.ok(nodes.some(n=>n.type==='button'&&n.children.some(x=>typeof x==='string'&&x.includes('Добави роля'))),'Add INFO role button is missing');
// With an unexpected server build the UI must clearly show a mismatch.
ctx.window.BVLOG_CONFIG.expected_build='0.7.1-oldcachebad';
assert.ok(render().some(n=>n.props.role==='alert'),'Build mismatch not visible');
// Error boundary is present when React's Component is available.
const wpComponent=class {constructor(props){this.props=props;this.state={};} setState(updater){this.state=Object.assign({},this.state,typeof updater==='function'?updater(this.state):updater);}};
const reactSource=code.replace('  const ReactComponent=wp.element.Component;',
  '  window.__boundary_class = BVLOGErrorBoundary_PLACEHOLDER;\n  const ReactComponent=wp.element.Component;');
// Check the public boundary implementation without creating another App context.
assert.ok(code.includes('class BVLOGErrorBoundary extends (ReactComponent||class {})'));
assert.ok(code.includes('static getDerivedStateFromError(error)'));
assert.ok(code.includes('this.setState(old=>({error:null,retry:old.retry+1}))'));
console.log('PASS v0.7.1 UI: INFO columns and audio buttons, numeric cells, running JS build, error boundary.');
