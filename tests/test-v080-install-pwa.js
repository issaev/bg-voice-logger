// v0.8.0 install button: Android prompt, iOS/manual fallback, installed-state
// gating, manifest metadata. No browser network or real user data.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../assets/app.js'),'utf8');
const php=fs.readFileSync(path.join(__dirname,'../bg-voice-logger.php'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../assets/app.css'),'utf8');
assert.match(php,/\x27start_url\x27\s*=>\s*bvlog_app_url\(\),\s*\x27display\x27\s*=>\s*\x27standalone\x27/);
assert.match(php,/\x27id\x27\s*=>\s*wp_parse_url/);
assert.match(php,/\x27scope\x27\s*=>\s*wp_parse_url/);
assert.match(php,/apple-touch-icon/);
assert.match(css,/\.bv-install-btn\s*\{/);
assert.match(source,/beforeinstallprompt/);
assert.match(source,/appinstalled/);
assert.ok(!source.includes('navigator.share('),'Do not trigger Safari share sheet without user intent');
const code=source.replace('  const ReactComponent=wp.element.Component;',
  '  window.__App=App;\n  const ReactComponent=wp.element.Component;');
assert.notEqual(code,source,'App extraction anchor missing');
const stateNames=Array.from(code.matchAll(/const \[([A-Za-z][A-Za-z0-9]*),\s*set[A-Za-z0-9]+\]=useState\(/g)).map(x=>x[1]);
const h=(type,props,...children)=>({type,props:props||{},children});
function flatten(v,out=[]){
  if(v===null||v===undefined||typeof v==='string'||typeof v==='number'||typeof v==='boolean')return out;
  if(Array.isArray(v)){for(const x of v)flatten(x,out);return out;}
  if(typeof v.type==='function')return flatten(v.type({...v.props,children:v.children}),out);
  out.push(v);for(const x of v.children||[])flatten(x,out);return out;
}
function textOf(v){
 if(v==null||typeof v==='boolean')return '';
 if(Array.isArray(v))return v.map(textOf).join(' ');
 if(typeof v==='object')return textOf(v.children);
 return String(v);
}
function appFixture(ua,standalone){
 const states={},refs={},effects=[],events={};let sx=0,rx=0;
 const mediaHandlers={};const media={matches:standalone,addEventListener:(n,f)=>mediaHandlers[n]=f,removeEventListener:(n,f)=>{if(mediaHandlers[n]===f)delete mediaHandlers[n]}};
 const win={BVLOG_CONFIG:{auth_mode:'public',api:'/wp-json/',user:{id:0},stt_mode:'none',plugin_version:'0.9.0-alpha.1'},
   isSecureContext:true,matchMedia:()=>media,setTimeout:()=>1,clearTimeout:()=>{},setInterval:()=>1,clearInterval:()=>{},
   addEventListener:(name,handler)=>events[name]=handler,
   removeEventListener:(name,handler)=>{if(events[name]===handler)delete events[name]}};
 const context={window:win,wp:{element:{createElement:h,useState:init=>{
   const i=sx++;if(!(i in states))states[i]=typeof init==='function'?init():init;
   return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v];
  },useRef:init=>{const i=rx++;if(!(i in refs))refs[i]={current:init};return refs[i]},
  useEffect:(fn,deps)=>effects.push({fn,deps}),createRoot:()=>({render:()=>{}})}},
  navigator:{onLine:true,userAgent:ua,standalone},document:{getElementById:()=>({}),hidden:false},
  indexedDB:{open:()=>{throw new Error('Queue must not be opened by install flow')}},
  localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},
  Blob,URL,Date,Math,Promise,ArrayBuffer,Uint8Array,Response,console,setTimeout,clearTimeout};
 vm.createContext(context);vm.runInContext(code,context);
 function render(){sx=0;rx=0;effects.length=0;return flatten(win.__App());}
 function set(name,value){const i=stateNames.indexOf(name);assert.ok(i>=0,'Missing state '+name);states[i]=value;}
 function get(name){const i=stateNames.indexOf(name);assert.ok(i>=0,name);return states[i];}
 function installButton(nodes){return nodes.find(n=>n.type==='button'&&n.props['aria-label']==='Инсталирай приложението на телефона');}
 set('mode','choose');set('authLoading',false);set('auth',{kind:'public',name:'Synthetic'});set('queue',[]);
 return {win,media,mediaHandlers,events,render,set,get,installButton,effects};
}
async function run(){
 // Android: only show the OS prompt on a real click, not on install event or render.
 const android=appFixture('Mozilla/5.0 (Linux; Android 16) Chrome/139',false);
 let nodes=android.render();assert.ok(android.installButton(nodes),'Install button absent on Android chooser');
 const hook=android.effects.find(x=>x.fn.toString().includes('beforeinstallprompt'));
 assert.ok(hook,'Missing install prompt effect');const cleanup=hook.fn();
 assert.equal(typeof android.events.beforeinstallprompt,'function');
 let prevented=false,prompts=0;
 const deferred={preventDefault:()=>{prevented=true;},
  prompt:()=>{prompts++;return Promise.resolve({outcome:'accepted'})},
  userChoice:Promise.resolve({outcome:'accepted'})};
 android.events.beforeinstallprompt(deferred);
 assert.equal(prevented,true);assert.equal(prompts,0,'Install prompt fired without user gesture');
 nodes=android.render();assert.equal(android.get('installReady'),true);
 await android.installButton(nodes).props.onClick();
 assert.equal(prompts,1,'Expected a single install prompt on click');
 assert.match(android.get('installStatus'),/приета от браузъра/);
 android.events.appinstalled();nodes=android.render();
 assert.equal(android.installButton(nodes),undefined,'Installed PWA must not offer reinstallation');
 cleanup();assert.equal(android.events.appinstalled,undefined,'Event listener was not cleaned up');
 // iOS: no beforeinstallprompt, show instructions and never claim installed.
 const ios=appFixture('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) Safari/605.1',false);
 nodes=ios.render();await ios.installButton(nodes).props.onClick();nodes=ios.render();
 assert.ok(ios.get('installHelpOpen'),'iOS manual instructions not opened');
 const advice=nodes.find(n=>n.props.id==='bvlog-install-help');
 assert.ok(advice);assert.match(textOf(advice),/Safari/);
 assert.match(textOf(advice),/Споделяне/);
 assert.match(textOf(advice),/Добави/);
 assert.equal(ios.get('installedPwa'),false,'Guidance must not falsely claim installation');
 // Android without a prompt falls back to help instead of a disabled button.
 const fallback=appFixture('Android Chrome',false);
 nodes=fallback.render();await fallback.installButton(nodes).props.onClick();nodes=fallback.render();
 assert.match(textOf(nodes.find(n=>n.props.id==='bvlog-install-help')),/Android/);
 // A home-screen PWA hides the install action on first render.
 const installed=appFixture('Android Chrome',true);
 assert.equal(installed.installButton(installed.render()),undefined);
 console.log('PASS v0.8 PWA install: native user-gesture prompt, iOS/Android fallback, installed-state, manifest and cleanup.');
}
run().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
