// v0.8.2 acceptance-unit checks, no live accounts or operational data.
async function runV082(app,gas,sw,css,php){
  const passed=[];
  const check=(condition,message)=>{if(!condition)throw Error(message);};
  const eq=(a,b,message)=>check(JSON.stringify(a)===JSON.stringify(b),message);
  const extract=(s,a,b)=>{const i=s.indexOf(a),j=s.indexOf(b,i+a.length);check(i>=0&&j>i,'extract '+a);return s.slice(i,j);};
  const F='FOLDER_TEST_123456789',T='TEMPLATE_TEST_123456789',D='DOC_TEST_1234567890';
  function readFixture(){
    const counts={},access=[];
    const data={
      INFO:[['','Колона 1','Инфо','Коментар'],['','Акция','Издирване','']], 
      LOG:[['','12:00','Operator','Synthetic','Text','','log-id',''],['','12:01','Operator','Second','Text','','log-2','']],
      TEAM:[['','header','','','','','','',''],['','Person','123','','','','','','team-id']],
      TECH:[['','header','','','',''],['','Vehicle','1','','','tech-id']],
      photos:[['photo-1','log-id','','','','Test photo','','','',''],['photo-other','unseen','','','','Other','','','','']],
      audios:[['audio-1','log-id','log','','audio/webm','','','',100,'','',''],['audio-info','field-1','field','','audio/webm','','','',50,'INFO','3','B'],['audio-team','field-2','field','','audio/webm','','','',60,'TEAM','3','C']],
      history:[['op-1','log-id','edit','2026-11-24','Operator','old','new','3']]
    };
    const mk=name=>({
      getLastRow:()=>data[name].length+1,getLastColumn:()=>15,
      getRange:(row,col,height,width)=>({
        getDisplayValues:()=>{counts[name]=(counts[name]||0)+1;
          return Array.from({length:height},(_,i)=>Array.from({length:width},(_,j)=>data[name][row-2+i]?.[col-1+j]||''));},
        getRichTextValues:()=>Array.from({length:height},()=>[null]),
        getDataValidation:()=>null
      })
    });
    const sheets=Object.fromEntries(Object.keys(data).map(name=>[name,mk(name)]));
    const code=gas+'\n'+
      "bvlDoc_=(_f,_t,_d,m)=>{if(m)m.name='Synthetic';return sheet;}; "+
      "bvlEnd_=(sh)=>sh.getLastRow(); "+
      "bvlInfoSections_=(info,options)=>{if(options)options.legacy=info.getRange(2,1,2,4).getDisplayValues();return [];}; "+
      "return {read:bvlRead_,index:bvlIndexedRows_,names:BVL};";
    let symbols;
    const sheet={getUrl:()=> 'https://example.invalid/sheet',getSheetByName:n=>{
      access.push(n);return sheets[n]||sheets[symbols&&n===symbols.PHOTOS?'photos':symbols&&n===symbols.AUDIOS?'audios':symbols&&n===symbols.HISTORY?'history':'none']||null;
    }};
    const g=new Function('sheet','console',code)(sheet,{log:()=>{}});symbols=g.names;
    return {g,counts,access,reset:()=>{Object.keys(counts).forEach(k=>delete counts[k]);access.length=0;},read:tab=>g.read(F,T,D,'abcdef123456',tab)};
  }
  let fixture=readFixture(),full=fixture.read();
  for(const tab of ['LOG','INFO','TEAM','TECH']){
    fixture.reset();const part=fixture.read(tab);
    check(part.ok&&part.loaded_tabs.length===1&&part.loaded_tabs[0]===tab,'tab response marker');
    eq(part.data[tab],full.data[tab],'tab projection '+tab);
    for(const other of ['LOG','INFO','TEAM','TECH'].filter(x=>x!==tab)){
      check(!(other in part.data),'must not return unrelated '+other);
      check(!fixture.counts[other],'must not read unrelated '+other);
    }
    if(tab!=='LOG')check(!fixture.counts.photos&&!fixture.counts.history,'no LOG indices on field tabs');
    if(tab==='LOG')check(Object.keys(part.data.FIELD_AUDIO).length===0,'no field audio in LOG');
    if(tab==='INFO')eq(part.data.FIELD_AUDIO['INFO:B3'],full.data.FIELD_AUDIO['INFO:B3'],'INFO field audio');
    if(tab==='TEAM')eq(part.data.FIELD_AUDIO['TEAM:C3'],full.data.FIELD_AUDIO['TEAM:C3'],'TEAM field audio');
  }
  passed.push('four tab projections equal legacy full result; unrelated grids not read');
  check(!('loaded_tabs' in full),'legacy full response shape retained');passed.push('legacy all-tab compatibility');
  // Sparse lookup reads matching disjoint blocks; fallback on unsupported search.
  const records=Array.from({length:1000},(_,i)=>['media-'+i,'other-'+i,'content']);
  records[20][1]='wanted';records[21][1]='wanted';records[900][1]='wanted';
  let rowsFetched=0;
  function sparseSheet(breakFinder=false){return {getLastRow:()=>1001,getRange:(r,c,h,w)=>({
      getDisplayValues:()=>{rowsFetched+=h;return records.slice(r-2,r-2+h).map(x=>x.slice(c-1,c-1+w));},
      createTextFinder:pattern=>{if(breakFinder)throw Error('unsupported');const finder={useRegularExpression:()=>finder,matchEntireCell:()=>finder,matchCase:()=>finder,
        findAll:()=>records.flatMap((x,i)=>new RegExp(pattern).test(x[1])?[{getRow:()=>i+2}]:[])};return finder;}
    })};}
  const sparse=fixture.g.index(sparseSheet(),3,2,new Set(['wanted']));
  eq(sparse,records.filter(r=>r[1]==='wanted'),'sparse lookup result');
  check(rowsFetched===3,'three rows instead of 1000');passed.push('sparse index exact lookup with reduced row fetch');
  rowsFetched=0;const fallback=fixture.g.index(sparseSheet(true),3,2,new Set(['wanted']));
  check(rowsFetched===1000&&fallback.filter(r=>r[1]==='wanted').length===3,'full scan fallback preserves matches');passed.push('index finder unavailable: full range fallback');
  // Cache is only an advisory chooser optimization; live create bypasses it.
  let time=1,opens=0,types=['Synthetic A'],cache={};
  const cacheImpl={get:k=>cache[k]||null,put:(k,v,ttl)=>{check(ttl===60,'bounded TTL');cache[k]=v;}};
  const typeFn=new Function('DriveApp','CacheService','SpreadsheetApp','getTypes',gas+'\n'+
    "bvlInfoSections_=()=>[{rows:[{label:'Акция',fields:[{choices:getTypes()}]}]}];return bvlTypeOptions_;")(
    {getFileById:()=>({getLastUpdated:()=>new Date(time)})},{getScriptCache:()=>cacheImpl},
    {openById:()=>{opens++;return{getSheetByName:()=>({})};}},()=>types);
  eq(typeFn(T,true),['Synthetic A'],'cache initial');eq(typeFn(T,true),['Synthetic A'],'cache hit');check(opens===1,'chooser cache hit');
  types=['Synthetic B'];eq(typeFn(T,false),['Synthetic B'],'live create bypasses cache');check(opens===2,'live validation');
  time=2;eq(typeFn(T,true),['Synthetic B'],'version changed invalidates chooser');passed.push('versioned chooser cache + live validation');
  // Bootstrap only after releasing the lock and only when creation succeeded.
  let held=false,reads=0,fail=false,duplicate=false;
  const dispatch=new Function('LockService','checkRead','createResult','console',gas+'\n'+
    "bvlCreate_=()=>createResult();bvlRead_=(_f,_t,id,_r,tab)=>checkRead(id,tab);return bvlDispatch_;")(
    {getScriptLock:()=>({tryLock:ms=>{check(ms===8000,'lock bound');held=true;return true;},releaseLock:()=>{held=false;}})},
    (id,tab)=>{check(!held,'bootstrap outside lock');check(tab==='LOG','bootstrap LOG only');reads++;if(fail)throw Error('read failed');return {ok:true,id,loaded_tabs:['LOG'],data:{LOG:[]}};},
    ()=>({ok:true,document:{id:D},deduplicated:duplicate}),{log:()=>{}});
  const req={folder_id:F,template_id:T,action:'create',payload:{bootstrap:true}};
  let result=dispatch(req);check(result.ok&&result.bootstrap.id===D&&reads===1&&!held,'real LOG bootstrap');
  fail=true;result=dispatch(req);check(result.ok&&!result.bootstrap,'bootstrap failure cannot undo create');
  fail=false;duplicate=true;result=dispatch(req);check(!result.bootstrap&&reads===2,'dedup does not recreate/bootstrap');passed.push('create bootstrap and fallback outside lock');
  // Audio: actual server function, mocked Drive parts and index. Old chunk
  // filenames/limits remain unchanged, final missing index resumes exactly.
  function audioFixture(){
    const files=new Map(),indexed=new Map(),saved=[],lookups=[];
    const iter=v=>({hasNext:()=>!!v,next:()=>v});
    const folder={getId:()=> 'PRIVATE_AUDIO_FOLDER',getFilesByName:n=>{lookups.push(n);return iter(files.get(n));},
      createFile:blob=>{const name=blob.name,file={getId:()=>name,getBlob:()=>blob,setTrashed:()=>files.delete(name)};files.set(name,file);return file;}};
    const utilities={base64Decode:s=>s.split(',').map(Number),newBlob:(bytes,mime,name)=>({name,bytes,mime,getBytes:()=>bytes})};
    const index={appendRow:r=>{indexed.set(r[0],r);saved.push(r);}};
    const code=gas+'\n'+"bvlAudioIndex_=()=>index;bvlAudioEntry_=(i,id)=>entries.get(id)||null;bvlFindId_=()=>3;bvlAudioFolder_=()=>folder;return bvlAudioPart_;";
    // For testing only, decode a base64-like token into known deterministic bytes.
    utilities.base64Decode=s=>Array.from(s,c=>c.charCodeAt(0));
    const fn=new Function('Utilities','index','entries','folder','console',code)(utilities,index,indexed,folder,{log:()=>{}});
    const op='12345678-1234-1234-1234-1234567890ab',target='12345678-1234-1234-1234-1234567890ac';
    const send=(n,s,seq=true)=>fn(F,{getSheetByName:()=>({})},{op_id:op,target_id:target,target_kind:'log',mime:'audio/webm',part_index:n,part_count:3,base64:s,sequential:seq});
    return {send,files,saved,lookups,op};
  }
  let af=audioFixture();
  result=af.send(0,'AAA');check(result.ok&&!result.complete&&af.lookups.length===1,'intermediate chunk no full scan');
  result=af.send(2,'CCC');check(result.ok&&!result.complete&&result.next_part===1,'missing part returned');
  af.send(1,'BBB');result=af.send(2,'CCC');
  check(result.ok&&result.complete&&af.saved.length===1,'one final media index');
  eq(af.files.get(af.op+'.webm').getBlob().getBytes(),Array.from('AAABBBCCC',c=>c.charCodeAt(0)),'byte ordering');
  result=af.send(2,'CCC');check(result.deduplicated&&af.saved.length===1,'duplicate ACK');
  passed.push('sequential chunk skip, missing-part recovery, exact ordering, dedup');
  af=audioFixture();af.send(2,'CCC',false);af.send(0,'AAA',false);result=af.send(1,'BBB',false);
  check(result.complete&&af.saved.length===1,'legacy out-of-order completion retained');passed.push('legacy non-sequential upload compatibility');
  // Frontend actual read function: in-flight switch supersedes old response,
  // no data crosses incident/operator, offline legacy snapshot is labeled cached.
  const readCode=extract(app,'    function tabSnapshotKey(','    async function newDocument()');
  const pending=[],store=new Map(),views=[],statuses=[];
  let currentDB='operatorA',online=true;
  const viewRef={current:{id:D,tab:'LOG',hasData:false}},pageRef={current:'LOG'},docRef={current:{id:D}},
    documentRequestRef={current:0},documentReadInFlightRef={current:null},readBackoffRef={current:{}};
  const navigator={get onLine(){return online;}};
  const deps={CFG:{api:'/wp-json/bvlog/v1/'},viewRef,pageRef,docRef,documentRequestRef,documentReadInFlightRef,readBackoffRef,navigator,
    setData:d=>views.push(d),setCachedView:v=>statuses.push(['cached',v]),setLastFreshAt:v=>statuses.push(['fresh',v]),
    setDocLoadError:v=>statuses.push(['error',v]),setDocLoading:v=>statuses.push(['loading',v]),setNotice:()=>{},
    clearReadRetry:()=>{},scheduleReadRetry:()=>false,
    database:async(action,storeName,v)=>action==='get'?store.get(v):store.set(v.id,v),
    api:async(path)=>new Promise(resolve=>pending.push({path,resolve})),
    dbName:()=>currentDB};
  const exposed=readCode.replaceAll('scope=DB','scope=dbName()').replaceAll('scope===DB','scope===dbName()');
  const read=new Function(...Object.keys(deps),exposed+'\nreturn {load:loadDocument,reset:resetView};')(...Object.values(deps));
  const tick=()=>Promise.resolve().then(()=>Promise.resolve()).then(()=>Promise.resolve());
  store.set(D+':LOG',{data:{LOG:['cached']}});
  const p1=read.load(D,false,'LOG');await tick();
  check(views.some(x=>x?.LOG?.[0]==='cached')&&statuses.some(x=>x[0]==='cached'&&x[1]),'cached LOG shown');
  pageRef.current='INFO';read.reset(D,'INFO');
  const p2=read.load(D,false,'INFO');await tick();
  check(pending.length===2&&pending[1].path.endsWith('?tab=INFO'),'INFO request only');
  pending[1].resolve({ok:true,id:D,loaded_tabs:['INFO'],data:{INFO:['fresh-info']}});await p2;
  pending[0].resolve({ok:true,id:D,loaded_tabs:['LOG'],data:{LOG:['stale-result']}});await p1;
  eq(views[views.length-1],{INFO:['fresh-info']},'late LOG response ignored');check(!store.get(D+':LOG').data.LOG.includes('stale-result'),'stale result not cached');
  passed.push('cached-first view, fresh tab and out-of-order guard');
  pageRef.current='TECH';read.reset(D,'TECH');const p3=read.load(D,false,'TECH');await tick();
  currentDB='operatorB';pending[2].resolve({ok:true,id:D,loaded_tabs:['TECH'],data:{TECH:['private-A']}});await p3;
  check(!store.has(D+':TECH')&&!views.some(x=>x?.TECH?.includes('private-A')),'old identity response ignored');passed.push('identity scope guard');
  online=false;pageRef.current='TEAM';read.reset(D,'TEAM');store.set(D,{data:{TEAM:['legacy']}});
  await read.load(D,false,'TEAM');eq(views[views.length-1],{TEAM:['legacy']},'legacy offline copy');check(statuses[statuses.length-2][0]==='cached','cached label');passed.push('offline legacy snapshot fallback');
  check(app.includes("className:'bv-install-label'},'Инсталирай'")&&app.includes("!installedPwa&&h('section',{className:'bv-install-footer'")&&css.includes('.bv-install-glyph'),'new icon and label + standalone guard');
  check(app.includes("viewBox:'0 0 24 24',fill:'currentColor',focusable:'false'")&&app.includes("M17,18H7V6h7V1H7C5.9,1,5,1.9,5,3v18c0,1.1,0.9,2,2,2h10c1.1,0,2-0.9,2-2v-5h-2V18z")&&app.includes("M18.71,13.29l3.59-3.59c0.39-0.39,0.39-1.02,0-1.41l0,0c-0.39-0.39-1.02-0.39-1.41,0L19,10.17V4c0-0.55-0.45-1-1-1h0 c-0.55,0-1,0.45-1,1v6.17l-1.89-1.88c-0.39-0.39-1.02-0.39-1.41,0l0,0c-0.39,0.39-0.39,1.02,0,1.41l3.59,3.59 C17.69,13.68,18.32,13.68,18.71,13.29z")&&css.includes('.bv-install-accent{fill:#ff7474}'),'official rounded icon path and palette');
  check(app.includes('sequential:true')&&sw.includes('sequential:true')&&php.includes("'sequential'=>($p['sequential']??false)===true"),'wire propagation');
  check(app.includes('response.next_part')&&sw.includes('result.next_part'),'foreground + SW recovery');passed.push('install icon and upload wire guards');
  return passed;
}

const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
runV082(read('assets/app.js'),read('apps-script/Code.gs'),read('assets/sw.js'),read('assets/app.css'),read('includes/class-bvlog-api.php')).then(x=>console.log('PASS',x)).catch(e=>{console.error(e);process.exitCode=1});
