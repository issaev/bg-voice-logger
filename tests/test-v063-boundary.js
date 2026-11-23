// Simulated React boundary lifecycle: render failure is visible and retry is manual.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(__dirname+'/../assets/app.js','utf8');
let rendered;
class BaseComponent {constructor(props){this.props=props;this.state={};}
 setState(updater){this.state=Object.assign({},this.state,typeof updater==='function'?updater(this.state):updater);}}
const h=(type,props,...children)=>({type,props:props||{},children});
const ctx={wp:{element:{Component:BaseComponent,createElement:h,createRoot:()=>({render:x=>rendered=x}),
useState:x=>[x,()=>{}],useEffect:()=>{},useRef:x=>({current:x})}},
window:{BVLOG_CONFIG:{}},document:{getElementById:()=>({})},navigator:{onLine:true},
localStorage:{getItem:()=>''},console};
vm.createContext(ctx);vm.runInContext(source,ctx);
assert.ok(rendered&&rendered.type.name==='BVLOGErrorBoundary','Root lacks error boundary');
const boundary=new rendered.type({});
assert.strictEqual(boundary.render().type.name,'App','Boundary should render app initially');
const failure=new ReferenceError('Test crash in INFO');
boundary.state=Object.assign(boundary.state,rendered.type.getDerivedStateFromError(failure));
let fallback=boundary.render();
assert.strictEqual(fallback.props.role,'alert','Render failure should be visible');
const recovery=fallback.children.find(x=>x.type==='button');
assert.ok(recovery&&recovery.children.includes('Възстанови интерфейса'));
recovery.props.onClick();
assert.strictEqual(boundary.state.error,null,'Manual recovery should clear error');
assert.strictEqual(boundary.state.retry,1,'Manual recovery must remount App');
assert.strictEqual(boundary.render().type.name,'App');
console.log('PASS v0.6.3 error boundary: visible fallback, manual recovery, no automatic reload.');
