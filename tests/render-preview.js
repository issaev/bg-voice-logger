const fs=require('fs'),vm=require('vm');
const path=require('path');
const base=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(base,'assets/app.js'),'utf8');
let output;let n=0;const override={};
if(process.argv[2]==='session'){
 override[0]='session';override[1]={id:'TESTDOCUMENT123456',name:'2026.11.10 - DKA - Search - Samokov'};
 override[2]='LOG';override[3]={LOG:[{row:2,cells:['','','','DATE: 10.11.2026','','','']},{row:3,cells:['1','14:32','Operator','Team Alpha reached the base','Voice','','']},{row:4,cells:['2','14:40','Operator','Searching sector 2','Voice','','']}],INFO:[],TEAM:[],TECH:[]};override[11]=true;
 override[13]={kind:'google',sub:'12345',name:'Оператор'};override[14]=false;override[22]=[{kind:'log',state:'pending',doc_id:'TESTDOCUMENT123456',text:'New report awaiting sync',event_at:new Date().toISOString(),op_id:'test-uuid',created:new Date().toISOString()}];
}
const H=(type,props,...children)=>({type,props:props||{},children});
const context={wp:{element:{createElement:H,useState:initial=>[Object.prototype.hasOwnProperty.call(override,n)?override[n++]:((n++),initial),()=>{}],useEffect:()=>{},useRef:v=>({current:v}),createRoot:()=>({render:x=>output=x})}},window:{BVLOG_CONFIG:{api:'/wp-json/',user:{id:1}}},navigator:{onLine:true},document:{getElementById:()=>({})},indexedDB:{},localStorage:{},console,setTimeout};
vm.createContext(context);vm.runInContext(source,context);
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function render(x){
 if(x===undefined||x===null||x===false)return '';
 if(Array.isArray(x))return x.map(render).join('');
 if(typeof x==='string'||typeof x==='number')return escape(x);
 if(typeof x.type==='function')return render(x.type(Object.assign({},x.props,{children:x.children})));
 const tag=x.type;const attrs=[];
 for(const [k,v] of Object.entries(x.props||{})){
  if(k==='children'||k==='key'||k.startsWith('on')||v===null||v===undefined||typeof v==='object')continue;
  const name=k==='className'?'class':k==='htmlFor'?'for':k;
  if(typeof v==='boolean'){if(v)attrs.push(name);continue;}
  attrs.push(name+'="'+escape(v)+'"');
 }
 if(tag==='input'||tag==='meta'||tag==='link')return '<'+tag+' '+attrs.join(' ')+'>';
 if(tag==='textarea')return '<textarea '+attrs.join(' ')+'>'+escape(x.props.value||'')+'</textarea>';
 return '<'+tag+' '+attrs.join(' ')+'>'+x.children.map(render).join('')+'</'+tag+'>';
}
const css=fs.readFileSync(path.join(base,'assets/app.css'),'utf8');
const html='<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:#e7eaf0}body{padding:8px}</style><style>'+css+'</style></head><body><div id="bvlog-root">'+render(output)+'</div></body></html>';
const out=path.join(base,'tests','preview-'+(process.argv[2]||'choose')+'.html');fs.writeFileSync(out,html);console.log(out);
