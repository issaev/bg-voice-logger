const fs=require('fs'),vm=require('vm'),assert=require('assert');
const code=fs.readFileSync(__dirname+'/../assets/app.js','utf8');
const slot=n=>require('./fixture-contract').slot(code,n);
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
// Semantic state contract: unrelated hook additions must not break these scenarios.
assert.equal(wait.initial[slot('mode')],'choose'); // mode
assert.equal(wait.initial[slot('auth')],null); // auth
assert.equal(wait.initial[slot('authLoading')],true); // authLoading
const login=renderScreen({[slot('authLoading')]:false});
assert.ok(login.txt.includes('Влез с одобрен Google акаунт'),login.txt);
const sample={LOG:[{row:3,cells:[1,'14:35','Иван','Екипът пристигна','Глас през приложението','Снимка 1','uuid'],photos:[{text:'Снимка 1',url:'https://drive.google.com'}]}]};
const session=renderScreen({[slot('mode')]:'session',[slot('doc')]:{id:'test',name:'2026.11.10 - ДКА - Издирване - Самоков'},[slot('page')]:'LOG',[slot('data')]:sample,
  [slot('auth')]:{kind:'google',sub:'1234567',name:'Тест',email:'test@example.org'},[slot('authLoading')]:false});
assert.equal((session.txt.match(/Добави снимка/g)||[]).length,2,'Photo actions available both for new and existing LOG');
assert.ok(session.txt.includes('Снимки ( 1 )'),session.txt);
const info=renderScreen({[slot('mode')]:'session',[slot('doc')]:{id:'test',name:'Action'},[slot('page')]:'INFO',[slot('data')]:{INFO:[[],[],['Акция'],['Локация']].concat(Array(30).fill([]))},
  [slot('auth')]:{kind:'google',sub:'123',name:'Test',email:'test@example.org'},[slot('authLoading')]:false});
assert.ok(info.txt.includes('GPS от телефона'),info.txt);
console.log('PASS: app renders auth gate, Google login, LOG photo controls, INFO GPS control.');
