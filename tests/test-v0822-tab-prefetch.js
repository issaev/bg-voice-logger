// Targeted v0.8.2.2 prefetch regression using the actual browser read functions.
async function runV0822(app,css){
  const check=(x,m)=>{if(!x)throw Error(m);},eq=(a,b,m)=>check(JSON.stringify(a)===JSON.stringify(b),m);
  const results=[];
  const begin=app.indexOf('    function tabSnapshotKey('),end=app.indexOf('    async function newDocument()',begin);
  check(begin>=0&&end>begin,'read function anchors');
  const freshness=app.slice(app.indexOf('  function readSnapshotStamp('),app.indexOf('  function today(time)'));
  const code=freshness+'\n'+app.slice(begin,end).replace(/\bDB\b/g,'scopeName()');
  let now=Date.UTC(2026,10,24,16),scope='operatorA',online=true,editing=false;
  class Clock extends Date{constructor(...x){super(...(x.length?x:[now]));}static now(){return now;}}
  const docRef={current:{id:'D1'}},pageRef={current:'LOG'},viewRef={current:{id:'D1',tab:'LOG',hasData:false}},
    documentRequestRef={current:0},documentReadInFlightRef={current:null},tabCacheRef={current:new Map()},
    refreshRef={current:{safeToPaint:true}},readRetryRef={current:{}},readBackoffRef={current:{}};
  const stores=new Map(),calls=[],views=[],states=[],pending=[];
  let shown=null;
  const deps={scopeName:()=>scope,Date:Clock,CFG:{api:'/wp-json/bvlog/v1/'},docRef,pageRef,viewRef,documentRequestRef,documentReadInFlightRef,tabCacheRef,refreshRef,readRetryRef,readBackoffRef,
    prefetchOrder:['LOG','INFO','TECH','TEAM'],tabRefreshMs:120000,navigator:{get onLine(){return online;}},
    smsRequestRef:{current:0},setSmsDialog:()=>{},setSmsPreparing:()=>{},
    clearReadRetry:()=>{readRetryRef.current={};},scheduleReadRetry:()=>false,
    setData:v=>{shown=v;views.push(v);},setCachedView:v=>states.push(['cache',v]),setLastFreshAt:v=>states.push(['fresh',v]),
    setDocLoadError:v=>states.push(['error',v]),setDocLoading:v=>states.push(['loading',v]),setReadActivity:v=>states.push(['activity',v]),
    setNotice:()=>{},setPage:()=>{},setError:()=>{},recording:false,fieldRecording:false,logSaving:false,rowSaving:false,
    editing:null,logEditor:null,rowAdd:false,infoAdding:-1,
    database:async(action,store,v)=>action==='get'?stores.get(scope+':'+v):stores.set(scope+':'+v.id,v),
    api:async(path,method,body,signal)=>new Promise((resolve,reject)=>{calls.push(path);pending.push({resolve,reject,path,signal});})};
  const x=new Function(...Object.keys(deps),code+'\nreturn {load:loadDocument,reset:resetView,switchTab,next:nextPrefetchTab,remember:rememberTab,entry:currentTabEntry,invalidate:invalidateTabs,resetSession:resetSessionReads,apply:applyDeferredTab};')(...Object.values(deps));
  const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
  function response(tab,value,id='D1'){return {ok:true,id,loaded_tabs:[tab],data:{[tab]:[value]}};}
  async function finish(tab,val,background=true){const p=x.load('D1',false,tab,false,background);await settle();pending.shift().resolve(response(tab,val));await p;}
  // Open LOG, then only one background read at a time in visible nav order.
  eq(x.next('D1'),'LOG','first LOG');
  await finish('LOG','log1',false);eq(shown,{LOG:['log1']},'LOG shown');
  for(const tab of ['INFO','TECH','TEAM']){
    eq(x.next('D1'),tab,'warm order '+tab);
    const p=x.load('D1',false,tab,false,true);await settle();
    const before=calls.length;await x.load('D1',false,'TEAM',false,true);check(calls.length===before,'one speculative read at a time');
    pending.shift().resolve(response(tab,tab+'1'));await p;eq(shown,{LOG:['log1']},'inactive read does not replace LOG');
    now+=1000;
  }
  eq(x.next('D1'),'','all warm');results.push('LOG-first warm order, serialized background requests and no inactive paint');
  // Warm tabs appear synchronously and cause no network requests.
  let before=calls.length;x.switchTab('INFO');eq(shown,{INFO:['INFO1']},'warm INFO immediate');x.switchTab('TEAM');eq(shown,{TEAM:['TEAM1']},'warm TEAM immediate');check(calls.length===before,'warm switch no extra read');
  results.push('immediate warm tab navigation');
  // Each tab becomes due, including when a different tab is active.
  now+=121000;
  for(const tab of ['LOG','INFO','TECH','TEAM']){eq(x.next('D1'),tab,'periodic due '+tab);await finish(tab,tab+'2');now+=1000;}
  eq(x.next('D1'),'','cycle completed');eq(shown,{TEAM:['TEAM2']},'active TEAM refreshed in background');results.push('all four tabs refresh on their own cadence');
  // The response from an in-flight visible refresh cannot replace a row being edited.
  const p=x.load('D1',false,'TEAM',false,true);await settle();refreshRef.current.safeToPaint=false;
  pending.shift().resolve(response('TEAM','edit-safe'));await p;eq(shown,{TEAM:['TEAM2']},'edit protected');
  refreshRef.current.safeToPaint=true;x.apply('D1');eq(shown,{TEAM:['edit-safe']},'deferred data applied');results.push('defer active repaint while editing');
  // Click an uncached tab that is already loading; adopt the same request.
  x.resetSession();pageRef.current='LOG';x.reset('D1','LOG');
  await finish('LOG','log3',false);
  const warming=x.load('D1',false,'INFO',false,true);await settle();before=calls.length;
  x.switchTab('INFO');check(calls.length===before,'adopt same in-flight INFO');
  pending.shift().resolve(response('INFO','warm-info'));await warming;eq(shown,{INFO:['warm-info']},'adopted result appears');results.push('adopt in-flight tab without duplicate request');
  // A confirmed write invalidates the in-flight old result and forces revalidation.
  const stale=x.load('D1',false,'INFO',false,true);await settle();
  x.invalidate('D1',['INFO']);check(x.entry('D1','INFO').dirty,'dirty on ACK');
  pending.shift().resolve(response('INFO','stale-before-write'));await stale;eq(shown,{INFO:['warm-info']},'discard pre-ACK result');
  await finish('INFO','after-write',false);eq(shown,{INFO:['after-write']},'authoritative post-write refresh');results.push('write invalidation and stale-response rejection');
  // Failed speculative read has a backoff; another eligible tab is not blocked.
  const fail=x.load('D1',false,'TECH',false,true);await settle();pending.shift().reject(Error('simulated failure'));await fail;
  check(x.entry('D1','TECH').retryAt>now&&x.next('D1')==='TEAM','failed tab backoff and no starvation');eq(shown,{INFO:['after-write']},'background failure isolated');
  results.push('isolated background error with bounded retry');
  // Previous incident/operator results are discarded, including snapshot writes.
  const retired=x.load('D1',false,'TEAM',false,true);await settle();scope='operatorB';x.resetSession();docRef.current={id:'D2'};pageRef.current='LOG';x.reset('D2','LOG');
  pending.shift().resolve(response('TEAM','private-old'));await retired;
  check(!x.entry('D2','TEAM')&&!stores.has('operatorB:D1:TEAM')&&shown===null,'no cross-scope data');results.push('identity and incident isolation');
  // Offline snapshots still work on first opening a tab.
  online=false;stores.set('operatorB:D2:LOG',{data:{LOG:['offline']}});await x.load('D2',false,'LOG');eq(shown,{LOG:['offline']},'offline snapshot');check(states.some(s=>s[0]==='cache'&&s[1]),'offline labeled');results.push('offline legacy behavior retained');
  check(app.includes("className:'bv-read-indicator'+(readActivity?' active':'')")&&!app.includes("className:'bv-loading-inline'")&&css.includes('.bv-read-indicator.active{opacity:1}'),'quiet spinner only');
  check(app.includes('window.setInterval(warm,1000)')&&app.includes('const tabRefreshMs=120000'),'single local scheduler and per-tab cadence');
  results.push('compact spinner and single scheduler source guards');
  return results;
}

const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
runV0822(read('assets/app.js'),read('assets/app.css')).then(x=>console.log('PASS',x)).catch(e=>{console.error(e);process.exitCode=1});
