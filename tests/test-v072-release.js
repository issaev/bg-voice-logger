// v0.7.2 controlled regression suite; no live WordPress, Sheets, Drive or user data.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');
const gas=fs.readFileSync(path.join(root,'apps-script/Code.gs'),'utf8');
const php=fs.readFileSync(path.join(root,'includes/class-bvlog-api.php'),'utf8');
const marker=source.match(/const BVLOG_RUNNING_BUILD = '([^']+)'/)[1];
assert.match(marker,/^0\.8\.2\.2-[a-f0-9]{12}$/);
function extract(s,a,b){const x=s.indexOf(a),y=s.indexOf(b,x+a.length);assert(x>=0&&y>x,'Extraction failed: '+a);return s.slice(x,y);}
function flatten(v,out=[]){if(v==null||typeof v==='string'||typeof v==='number'||typeof v==='boolean')return out;if(Array.isArray(v)){v.forEach(x=>flatten(x,out));return out;}if(typeof v.type==='function')return flatten(v.type({...v.props,children:v.children}),out);out.push(v);(v.children||[]).forEach(x=>flatten(x,out));return out;}
function textOf(v){if(v==null||typeof v==='boolean')return '';if(Array.isArray(v))return v.map(textOf).join('');if(typeof v==='object')return textOf(v.children);return String(v);}
async function run(){
  // PERF-05: three acknowledged entries (two current and one other) trigger exactly ONE document refresh.
  const syncSource=extract(source,'    async function syncAll() {','    useEffect(()=>{\n      // Recover interrupted uploads');
  let reads=[],ops=[];let items=[
    {op_id:'log1',state:'pending',kind:'log',doc_id:'current',created:'2026-11-24T10:00:00Z',text:'Alpha'},
    {op_id:'log2',state:'pending',kind:'log',doc_id:'current',created:'2026-11-24T10:00:01Z',text:'Bravo'},
    {op_id:'other',state:'pending',kind:'log',doc_id:'another',created:'2026-11-24T10:00:02Z',text:'Charlie'}
  ];
  const sctx={syncingRef:{current:false},navigator:{onLine:true},CFG:{auth_mode:'public'},authRef:{current:null},
    DB:'user0',database:async(method,store,arg)=>{if(method==='getAll')return items.map(x=>({...x}));if(method==='put'){let idx=items.findIndex(x=>x.op_id===arg.op_id);items[idx]={...arg};return arg;}throw Error(method);},
    refreshQueue:async()=>true,loadDocument:async id=>reads.push(id),docRef:{current:{id:'current'}},
    prefetchOrder:['LOG','INFO','TECH','TEAM'],pageRef:{current:'LOG'},invalidateTabs:(id,tabs)=>reads.push(id+':'+tabs.join(',')),setCachedView:()=>{},scheduleWriteRetry:()=>{},
    uuid:()=> 'test-lease',syncLease:async()=>true,requestBackgroundSync:()=>{},
    api:async(path,method,payload)=>{ops.push({path,id:payload.op_id});return {ok:true};},
    window:{setTimeout:()=>{}},setError:()=>{},setSyncError:()=>{},B:x=>x,Date,Math,console};
  vm.createContext(sctx);vm.runInContext(syncSource+'\nthis.syncAll=syncAll;',sctx);
  await sctx.syncAll();
  assert.equal(ops.length,3);assert.deepEqual(reads,['current:LOG','current:LOG']);
  assert.deepEqual(items.map(x=>x.state),['synced','synced','synced']);
  await sctx.syncAll();assert.deepEqual(reads,['current:LOG','current:LOG'],'empty queue must not invalidate document');
  items=[{op_id:'onlyother',state:'pending',kind:'log',doc_id:'another',created:'2026-11-24T10:01:00Z'}];
  await sctx.syncAll();assert.deepEqual(reads,['current:LOG','current:LOG'],'other-incident sync must not invalidate current incident');

  // Validate GAS date-only conversion and actual creation metadata.
  const gctx={Date,console,Utilities:{formatDate:(date,tz,pattern)=>{
    const p=new Intl.DateTimeFormat('en-GB',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
    const parts=Object.fromEntries(p.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
    return pattern==='yyyy.MM.dd'?parts.year+'.'+parts.month+'.'+parts.day:parts.day+'.'+parts.month+'.'+parts.year;
  }}};
  vm.createContext(gctx);vm.runInContext(gas,gctx);
  const chosen=gctx.bvlIncidentDate_('2024-02-29');
  assert.equal(chosen.filename,'2024.02.29');assert.equal(chosen.display,'29.02.2024');
  for(const invalid of ['2026-02-30','2026-13-01','2026-00-12','2026-1-02','2026-01-05T12:00:00Z','']){
    if(invalid===''){assert.ok(gctx.bvlIncidentDate_(invalid).filename);continue;}
    assert.throws(()=>gctx.bvlIncidentDate_(invalid),/Invalid incident/);
  }
  assert.match(php,/incident_date/);assert.match(php,/checkdate/);
  let createdName='',infoDate='',logDate='',created=0,prepared=0;
  const info={getMaxColumns:()=>10,getRange:(row,col)=>({setValue:v=>{infoDate=v;return this;},clearContent:()=>{}})};
  const log={getRange:label=>({setValue:v=>{if(label==='D2')logDate=v;}})};
  const ss={getSheetByName:n=>({INFO:info,LOG:log,TECH:{},TEAM:{}})[n]};
  const folder={getFilesByName:()=>({hasNext:()=>false})};
  const properties={getProperty:()=>null,setProperty:()=>{}};
  gctx.DriveApp={getFolderById:()=>folder,getFileById:()=>({makeCopy:(name)=>{
    created++;createdName=name;return {getId:()=> 'NEW_DOC_ID',getUrl:()=> 'https://docs.google.com/test',getName:()=>createdName,setName:n=>{createdName=n;},getDateCreated:()=>new Date(),setTrashed:()=>{}};
  }})};
  gctx.SpreadsheetApp={openById:()=>ss,flush:()=>{}};
  gctx.PropertiesService={getScriptProperties:()=>properties};
  gctx.bvlTypeOptions_=()=>['Издирване'];
  gctx.bvlInfoSections_=()=>[{headerRow:2,rows:[
    {label:'Акция',row:3,fields:[{col:'B'}]},
    {label:'Локация',row:4,fields:[{col:'B'}]}]}];
  gctx.bvlValidationAwareSet_=()=>({ok:true});
  gctx.bvlPrepare_=()=>{prepared++;};
  const res=gctx.bvlCreate_('FOLDER','TEMPLATE',{type:'Издирване',place:'Самоков',incident_date:'2024-02-29',create_id:'12345678-1234-1234-1234-1234567890ab'});
  assert.equal(res.ok,true);assert.ok(createdName.startsWith('2024.02.29 - ДКА - '));
  assert.equal(infoDate,'29.02.2024');assert.equal(logDate,'ДАТА: 29.02.2024');
  assert.equal(created,1);assert.equal(prepared,1);
  assert.ok(new Date(res.document.created).getTime()>Date.now()-60000,'creation time must be real, not backdated');
  assert.throws(()=>gctx.bvlCreate_('FOLDER','TEMPLATE',{type:'Издирване',place:'Самоков',incident_date:'2026-02-30',create_id:'12345678-1234-1234-1234-1234567890ac'}),/Invalid incident/);
  assert.equal(created,1,'bad date cannot create a spreadsheet');
  const read=extract(gas,'function bvlRead_(folderId, templateId, docId, requestId, requestedTab) {','function bvlLogChange_');
  assert.ok(!read.includes('bvlRepairPhotoAnchors_('),'periodic read must not mutate image positions');

  // Render a real App component with mocked React and transport: queue navigation, date preview and refresh timer.
  const injected=source.replace('    const waiting=queue.filter(o=>o.state',
    '    window.__v072test={newDocument,loadDocument,refreshRef,syncingRef,docRef,resetSessionReads};\n    const waiting=queue.filter(o=>o.state');
  assert.notEqual(injected,source);
  const names=Array.from(source.matchAll(/const \[([A-Za-z][A-Za-z0-9]*),\s*set[A-Za-z0-9]+\]=useState\(/g)).map(x=>x[1]);
  const state={},refs={};let ix=0,rx=0,rootNode=null,arrEffects=[],polls=[],network=[],isHidden=false;
  const index=n=>{const i=names.indexOf(n);assert(i>=0,n);return i;};
  const setState=(n,v)=>{state[index(n)]=v;};
  const getState=n=>state[index(n)];
  const h=(type,props,...children)=>({type,props:props||{},children});
  const win={BVLOG_CONFIG:{api:'/wp-json/',auth_mode:'public',stt_mode:'none',user:{id:0},plugin_version:'0.7.2'},
    setInterval:(fn,delay)=>{polls.push({fn,delay});return polls.length;},clearInterval:()=>{},setTimeout:(fn)=>{}};
  const ui={window:win,wp:{element:{createElement:h,useState:init=>{const i=ix++;if(!(i in state))state[i]=typeof init==='function'?init():init;
    return[state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v;}];},
    useRef:init=>{const i=rx++;if(!(i in refs))refs[i]={current:init};return refs[i];},
    useEffect:(fn,deps)=>arrEffects.push({fn,deps}),createRoot:()=>({render:x=>rootNode=x})}},
    navigator:{onLine:true},document:{getElementById:()=>({}),get hidden(){return isHidden;}},
    indexedDB:{open:()=>{let req={error:Error('offline fixture')};setTimeout(()=>req.onerror&&req.onerror(),0);return req;}},
    localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},Blob,ArrayBuffer,Uint8Array,console,
    setTimeout,clearTimeout,Date,Promise,Math,URL,Response,
    fetch:async(url,opts)=>{network.push({url,opts});const name=String(url);
      let answer={ok:true};
      if(name.endsWith('documents')&&opts.method==='POST')answer={ok:true,document:{id:'NEW_DOC_ID',name:'New test',url:'https://docs.google.com/...'}};
      else if(name.endsWith('documents'))answer={ok:true,documents:[],action_types:['Издирване']};
      else if(name.includes('document/'))answer={ok:true,data:{LOG:[],INFO:[],TEAM:[],TECH:[],FIELD_AUDIO:{}}};
      return new Response(JSON.stringify(answer),{status:200});}}
  vm.createContext(ui);vm.runInContext(injected,ui);
  function render(){ix=0;rx=0;arrEffects=[];return flatten(rootNode.type());}
  setState('mode','choose');setState('creating',true);setState('incidentDate','2024-02-29');
  setState('newType','Издирване');setState('newPlace','Самоков');setState('operatorName','Test Operator');
  setState('queue',[{op_id:'pending1',state:'pending',kind:'log',doc_id:'DOC',created:'2026-11-24T00:00:00Z',text:'New'},
    {op_id:'error1',state:'error',kind:'log',doc_id:'DOC',created:'2026-11-24T00:00:01Z',text:'Failure'},
    {op_id:'synced1',state:'synced',kind:'log',doc_id:'DOC',created:'2026-11-24T00:00:02Z',text:'Old'}]);
  let tree=render();
  const dateInput=tree.find(n=>n.type==='input'&&n.props.type==='date');
  assert.ok(dateInput);assert.equal(dateInput.props.value,'2024-02-29');
  assert.ok(tree.some(n=>n.props.className==='bv-preview'&&textOf(n).includes('2024.02.29')));
  const topQueue=tree.find(n=>n.type==='button'&&n.props.className?.includes('bv-queue-toggle'));
  assert.ok(topQueue,'queue header must be visible in public mode');
  topQueue.props.onClick();tree=render();
  assert.ok(tree.some(n=>n.props.className==='bv-modal bv-queue-modal'));
  assert.equal(tree.filter(n=>n.props.className==='bv-queue-card').length,2,'completed entries hidden by default');
  assert.ok(tree.some(n=>n.props.className==='bv-queue-review-count'),'error review indicator missing');
  tree.find(n=>n.type==='button'&&textOf(n).includes('Покажи приключените')).props.onClick();
  tree=render();assert.equal(tree.filter(n=>n.props.className==='bv-queue-card').length,3);
  setState('queueOpen',false);
  dateInput.props.onChange({target:{value:'2026-11-25'}});
  render();await win.__v072test.newDocument();
  const post=network.find(x=>x.url.endsWith('documents')&&x.opts.method==='POST');
  assert.ok(post);assert.equal(JSON.parse(post.opts.body).incident_date,'2026-11-25');

  // Stable scheduler despite unrelated queue and draft re-renders.
  const current={id:'TEST_DOC',name:'Test incident'};
  setState('mode','session');setState('doc',current);setState('data',{LOG:[],INFO:[],TEAM:[],TECH:[],FIELD_AUDIO:{}});
  setState('draft','');setState('queue',[]);setState('docLoading',false);
  setState('auth',{kind:'public',name:'Tester'});setState('authLoading',false);
  render();win.__v072test.docRef.current=current;win.__v072test.resetSessionReads();render();
  const effect=arrEffects.find(x=>x.fn.toString().includes('window.setInterval(warm,1000)'));
  assert.ok(effect,'missing background scheduler');
  const baseDeps=effect.deps;
  const countRead=()=>network.filter(x=>x.url.includes('document/')).length;
  const before=countRead();effect.fn();await new Promise(setImmediate);
  const timer=polls.find(x=>x.delay===1000);assert.ok(timer);
  render();timer.fn();await new Promise(setImmediate);
  assert.equal(countRead(),before+2,'initial LOG and next tab');
  setState('draft','draft in progress');render();timer.fn();await new Promise(setImmediate);
  assert.equal(countRead(),before+3,'draft remains while inactive tabs warm');
  assert.deepEqual(Array.from(arrEffects.find(x=>x.fn.toString().includes('window.setInterval(warm,1000)')).deps),Array.from(baseDeps),
    'queue/draft updates must not restart polling interval');
  setState('draft','');setState('recording',true);render();timer.fn();await new Promise(setImmediate);
  assert.equal(countRead(),before+3,'recording must pause background requests');
  setState('recording',false);render();isHidden=true;timer.fn();await new Promise(setImmediate);
  assert.equal(countRead(),before+3,'hidden page must pause background requests');
  isHidden=false;win.__v072test.syncingRef.current=true;timer.fn();await new Promise(setImmediate);
  assert.equal(countRead(),before+3,'in-flight sync must block background requests');
  win.__v072test.syncingRef.current=false;timer.fn();await new Promise(setImmediate);
  assert.equal(countRead(),before+4,'eligible page warms fourth tab');

  console.log('PASS v0.7.2: write ACK invalidation; calendar-date propagation; read-only GAS; queue mobile/public access; background warm scheduler.');
}
run().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
