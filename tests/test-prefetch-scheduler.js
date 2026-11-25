// Execute the actual timer callback with controlled guards; no network.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const app=fs.readFileSync(__dirname+'/../assets/app.js','utf8');
const start=app.indexOf('      const warm=()=>{'),end=app.indexOf('      const warmTimer=',start);
assert(start>=0&&end>start,'Scheduler extraction anchors');
let calls=[];
const fresh={id:'D1',backgroundReady:true,ready:true,applyDeferred:id=>calls.push(['paint',id]),prefetch:()=> 'INFO',load:(...args)=>calls.push(['read',...args])};
const ctx={id:'D1',document:{hidden:false},navigator:{onLine:true},syncingRef:{current:false},refreshRef:{current:fresh},docRef:{current:{id:'D1'}},documentReadInFlightRef:{current:null},readRetryRef:{current:{}},Date};
vm.createContext(ctx);vm.runInContext(app.slice(start,end)+'this.tick=warm;',ctx);
function checkBlocked(set,reset){calls=[];set();ctx.tick();assert.equal(calls.filter(x=>x[0]==='read').length,0);reset();}
ctx.tick();assert.deepEqual(calls,[['paint','D1'],['read','D1',false,'INFO',false,true]]);
checkBlocked(()=>ctx.document.hidden=true,()=>ctx.document.hidden=false);
checkBlocked(()=>ctx.navigator.onLine=false,()=>ctx.navigator.onLine=true);
checkBlocked(()=>ctx.syncingRef.current=true,()=>ctx.syncingRef.current=false);
checkBlocked(()=>fresh.backgroundReady=false,()=>fresh.backgroundReady=true);
checkBlocked(()=>ctx.docRef.current={id:'D2'},()=>ctx.docRef.current={id:'D1'});
checkBlocked(()=>ctx.documentReadInFlightRef.current={},()=>ctx.documentReadInFlightRef.current=null);
checkBlocked(()=>ctx.readRetryRef.current={id:'D1',exhausted:false,nextAt:0},()=>ctx.readRetryRef.current={});
calls=[];ctx.tick();assert.equal(calls.filter(x=>x[0]==='read').length,1,'Resume after blockers clear');
assert.match(app.slice(end,end+220),/\[mode,doc&&doc.id,online\]/,'Queue/draft rerenders must not recreate scheduler');
console.log('PASS: actual prefetch timer guards, foreground priority, resume and stable dependencies.');
