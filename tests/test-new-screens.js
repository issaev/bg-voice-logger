const fs=require('fs'),vm=require('vm'),assert=require('assert');
const code=fs.readFileSync(__dirname+'/../assets/app.js','utf8');
function renderScreen(overrides={}){
 let output, index=0;
 const initial=[];
 const ctx={
  wp:{element:{createElement:(type,props,...children)=>({type,props:props||{},children}),
    useState:init=>{const i=index++;initial.push(init);return [i in overrides?overrides[i]:init,()=>{}]},
    useRef:v=>({current:v}),useEffect:()=>{},createRoot:()=>({render:x=>output=x})}},
  window:{BVLOG_CONFIG:{api:'/wp-json/bvlog/v1/',auth_mode:'google',google_client_id:'demo.apps.googleusercontent.com',
    user:{id:0,name:''},logo_url:'/logo.webp',app_url:'https://site.example/dka/'}},
  navigator:{onLine:true},document:{getElementById:()=>({})},indexedDB:{},localStorage:{getItem:()=>'',setItem:()=>{}},
  console,setTimeout,fetch:()=>{throw Error('Network is not expected in static render')}
 };
 ctx.window.navigator=ctx.navigator;
 vm.createContext(ctx);vm.runInContext(code,ctx);
 function walk(n){
   if(n===null||n===false||n===undefined)return '';
   if(typeof n==='string'||typeof n==='number')return String(n);
   if(Array.isArray(n))return n.map(walk).join(' ');
   if(typeof n.type==='function')return walk(n.type({...n.props,children:n.children}));
   return walk(n.children);
 }
 const txt=walk(output);
 return {txt,initial};
}
// Render initial auth pending + Google login + active session without external services.
const wait=renderScreen();
assert.ok(wait.txt.includes('Проверка на Google сесията'),wait.txt);
// useState indices are checked here to reveal accidental hook-order changes.
assert.equal(wait.initial[0],'choose'); // mode
assert.equal(wait.initial[13],null); // auth
assert.equal(wait.initial[14],true); // authLoading
const login=renderScreen({14:false});
assert.ok(login.txt.includes('Влез с одобрен Google акаунт'),login.txt);
const sample={LOG:[{row:3,cells:[1,'14:35','Иван','Екипът пристигна','Глас през приложението','Снимка 1','uuid'],photos:[{text:'Снимка 1',url:'https://drive.google.com'}]}]};
const session=renderScreen({0:'session',1:{id:'test',name:'2026.11.10 - ДКА - Издирване - Самоков'},2:'LOG',3:sample,
  13:{kind:'google',sub:'1234567',name:'Тест',email:'test@example.org'},14:false});
assert.ok(session.txt.includes('Качи снимка'),session.txt);
assert.ok(session.txt.includes('Прикачи снимка'),session.txt);
assert.ok(session.txt.includes('Снимки ( 1 )'),session.txt);
const info=renderScreen({0:'session',1:{id:'test',name:'Action'},2:'INFO',3:{INFO:[[],[],['Акция'],['Локация']].concat(Array(30).fill([]))},
  13:{kind:'google',sub:'123',name:'Test',email:'test@example.org'},14:false});
assert.ok(info.txt.includes('GPS от телефона'),info.txt);
console.log('PASS: app renders auth gate, Google login, LOG photo controls, INFO GPS control.');
