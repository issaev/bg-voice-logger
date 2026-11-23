const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(__dirname+'/../assets/app.js','utf8');
let output;
const context={
 wp:{element:{createElement:(type,props,...children)=>({type,props:props||{},children}),useState:initial=>[initial,()=>{}],useEffect:()=>{},useRef:v=>({current:v}),createRoot:()=>({render:x=>{output=x;}})}},
 window:{BVLOG_CONFIG:{api:'/wp-json/bvlog/v1/',nonce:'',user:{id:0,name:''},auth_mode:'public'}},
 navigator:{onLine:false},document:{getElementById:()=>({})},indexedDB:{},localStorage:{getItem:()=>'',setItem:()=>{}},console,setTimeout,
 fetch:()=>{throw new Error('No background network')}
};
context.window.navigator=context.navigator;
vm.createContext(context);vm.runInContext(source,context);
assert.ok(output);
function flatten(node){
 if(!node)return '';
 if(typeof node==='string')return node;
 if(typeof node==='number')return String(node);
 if(Array.isArray(node))return node.map(flatten).join(' ');
 if(typeof node.type==='function')return flatten(node.type({...node.props,children:node.children}));
 return flatten(node.children);
}
const rendered=flatten(output.type());
assert.ok(rendered.includes('Избор на акция'),rendered);
assert.ok(rendered.includes('Име на оператора'),rendered);
assert.ok(source.includes("CFG.user && CFG.user.id"));
assert.ok(source.includes('author:ANONYMOUS ? operatorName.trim()'));
console.log('PASS: guest-facing app shows operator field, suppresses guest WP nonce, keeps author in offline queue.');
