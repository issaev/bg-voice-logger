// Smoke-test the initial React tree without a browser or any network requests.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(__dirname+'/../assets/app.js','utf8');
let output;
const context={
  wp:{element:{createElement:(type,props,...children)=>({type,props:props||{},children}),useState:initial=>[initial,()=>{}],useEffect:()=>{},useRef:v=>({current:v}),createRoot:()=>({render:x=>{output=x;}})}},
  window:{BVLOG_CONFIG:{api:'/wp-json/',auth_mode:'public',user:{id:1}}},
  navigator:{onLine:false},document:{getElementById:()=>({})},indexedDB:{},localStorage:{},console,setTimeout,
  fetch:()=>{throw new Error('Unexpected network request')}
};
context.window.navigator=context.navigator;
vm.createContext(context);vm.runInContext(source,context);
assert.ok(output,'React root did not render');
assert.equal(typeof output.type,'function');
const tree=output.type();assert.equal(tree.type,'div');
function flatten(node){if(!node)return '';if(typeof node==='string')return node;if(typeof node==='number')return String(node);if(Array.isArray(node))return node.map(flatten).join(' ');if(typeof node.type==='function')return flatten(node.type({...node.props,children:node.children}));return flatten(node.children);}
const text=flatten(tree);assert.ok(text.includes('Документ за координация на акция'));assert.ok(text.includes('Избор на акция'),text);
console.log('PASS: React initial screen creates a Bulgarian session chooser without network access.');
