// v0.7.1: isolated regression tests; no live site, Drive or Safari operations.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../assets/app.js','utf8');
const gas=fs.readFileSync(__dirname+'/../apps-script/Code.gs','utf8');
const action='\u0410\u043a\u0446\u0438\u044f';
const value='\u0418\u0437\u0434\u0438\u0440\u0432\u0430\u043d\u0435';
const comment='\u041a\u043e\u043c\u0435\u043d\u0442\u0430\u0440 / \u043b\u0438\u043d\u043a / \u0442\u0435\u043b\u0435\u0444\u043e\u043d';
const extra='\u0414\u043e\u043f\u044a\u043b\u043d\u0438\u0442\u0435\u043b\u043d\u0430 \u0438\u043d\u0444\u043e\u0440\u043c\u0430\u0446\u0438\u044f';
function extract(text,start,end){
 const from=text.indexOf(start),to=text.indexOf(end,from+start.length);
 assert.ok(from>=0&&to>from,'Failed to extract '+start);
 return text.slice(from,to);
}
function nodes(v,out=[]){
 if(v==null||typeof v==='string'||typeof v==='number'||typeof v==='boolean')return out;
 if(Array.isArray(v)){for(const c of v)nodes(c,out);return out;}
 if(typeof v.type==='function')return nodes(v.type({...v.props,children:v.children}),out);
 out.push(v);for(const c of v.children||[])nodes(c,out);return out;
}
function hasText(v,txt){
 if(v===txt)return true;
 if(v==null||typeof v==='boolean')return false;
 if(Array.isArray(v))return v.some(x=>hasText(x,txt));
 if(typeof v==='object')return (v.children||[]).some(x=>hasText(x,txt));
 return typeof v==='string'&&v.includes(txt);
}
async function run(){
 // A successful commit remains success even if the follow-up refresh crashes.
 const enqueueText=extract(source,'    async function enqueue(op) {','    // Offline-first cloud STT:');
 let commits=0,saves=[],uiNotices=[];
 const context={
   uuid:()=> 'stable-uuid',ANONYMOUS:true,operatorName:'Operator',authRef:{current:null},
   CFG:{user:null,stt_mode:'none',stt_cloud:false},docRef:{current:null},docs:[],
   database:async()=>{commits++;return true;},refreshQueue:async()=>{throw Error('UI read failed');},
   setError:s=>saves.push(s),setLocalStoreError:s=>saves.push(s),setNotice:s=>uiNotices.push(s),B:s=>s,
   navigator:{onLine:false},window:{setTimeout:()=>{}},requestBackgroundSync:()=>{},console
 };
 vm.createContext(context);
 vm.runInContext(enqueueText+'\nthis.enqueue=enqueue;',context);
 let result=await context.enqueue({kind:'log',doc_id:'D',op_id:'stable-uuid'});
 assert.equal(result,true);assert.equal(commits,1);assert.equal(saves.length,0);
 assert.ok(uiNotices.some(s=>s.includes('\u0437\u0430\u043f\u0430\u0437\u0435\u043d')), 'should report saved state despite UI refresh failure');
 context.database=async()=>{throw Error('quota')};
 result=await context.enqueue({kind:'log',doc_id:'D'});
 assert.equal(result,false);assert.equal(commits,1);

 // Identical operation ID must be retained across a local retry.
 const audioText=extract(source,'    async function saveAudioClip(docForRecording,blob,when,fieldTarget,signal,opId) {','    function downloadBlob(blob,when){');
 let persisted=new Map(),unsaved=null,idCounter=0;
 const audioCtx={Blob,uuid:()=> 'audio-'+(++idCounter),database:async(type,store,id)=>persisted.get(id),
   enqueue:async rec=>false,setUnsavedAudio:x=>{unsaved=x;},setError:()=>{},setNotice:()=>{},
   refreshQueue:async()=>true,queuePhotosAfterLog:async()=>{},setPhotos:()=>{},photos:[],console};
 vm.createContext(audioCtx);vm.runInContext(audioText+'\nthis.saveAudioClip=saveAudioClip;this.retryUnsavedAudio=retryUnsavedAudio;',audioCtx);
 const f=new Blob(['test'],{type:'audio/webm'});
 result=await audioCtx.saveAudioClip({id:'D',name:'Test'},f,'2026-11-24T00:00:00Z',null,null);
 assert.equal(result,false);const stableId=unsaved.op_id;assert.ok(stableId);
 audioCtx.unsavedAudio=unsaved;
 result=await audioCtx.retryUnsavedAudio();
 assert.equal(result,undefined);assert.equal(unsaved.op_id,stableId,'retry must reuse UUID');
 persisted.set(stableId,{op_id:stableId,kind:'audio',state:'audio'});
 audioCtx.unsavedAudio=unsaved;
 await audioCtx.retryUnsavedAudio();
 assert.equal(unsaved,null,'existing durable record should end unsaved warning without overwrite');

 // Component tests: selectedDoc, free text on adjacent INFO columns, and footer warning.
 const patched=source.replace('    const waiting=queue.filter(o=>o.state!==\'synced\'',
   '    window.__test={loadDocs,selectExistingDocument};\n    const waiting=queue.filter(o=>o.state!==\'synced\'');
 assert.notEqual(patched,source,'UI instrument anchor missing');
 const stateNames=Array.from(source.matchAll(/const \[([A-Za-z][A-Za-z0-9]*),\s*set[A-Za-z0-9]+\]=useState\(/g)).map(x=>x[1]);
 const state={};const refs={};let slot=0,refSlot=0,rendered=null;
 function setState(name,v){const index=stateNames.indexOf(name);assert.ok(index>=0);state[index]=v;}
 function getState(name){return state[stateNames.indexOf(name)];}
 const requests=[];
 const win={BVLOG_CONFIG:{api:'/wp-json/',auth_mode:'public',stt_mode:'cloud',user:{id:0},plugin_version:'0.7.1'},setTimeout};
 const ui={window:win,wp:{element:{createElement:(type,props,...children)=>({type,props:props||{},children}),
   useState:init=>{const i=slot++;if(!(i in state))state[i]=typeof init==='function'?init():init;
      return[state[i],up=>{state[i]=typeof up==='function'?up(state[i]):up;}];},
   useRef:init=>{const i=refSlot++;if(!(i in refs))refs[i]={current:init};return refs[i];},
   useEffect:()=>{},createRoot:()=>({render:x=>{rendered=x;}})}},
  navigator:{onLine:true},localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},
  indexedDB:{open:()=>{const req={error:Error('quota')};setTimeout(()=>req.onerror&&req.onerror(),0);return req;}},
  document:{getElementById:()=>({})},Blob,ArrayBuffer,Uint8Array,console,setTimeout,clearTimeout,
  fetch:()=>new Promise(resolve=>requests.push(resolve)),Response,URL,Date,Promise,Math};
 vm.createContext(ui);vm.runInContext(patched,ui);
 const render=()=>{slot=0;refSlot=0;return nodes(rendered.type());};
 setState('mode','choose');setState('auth',{kind:'public',name:'Operator'});
 setState('authLoading',false);
 let tree=render();
 const refresh=win.__test.loadDocs();
 win.__test.selectExistingDocument('older');
 assert.equal(getState('selectedDoc'),'older');
 requests.shift()(new Response(JSON.stringify({ok:true,documents:[{id:'newest',name:'New'}, {id:'older',name:'Old'}]}),{status:200}));
 await refresh;
 assert.equal(getState('selectedDoc'),'older','async document load overrode explicit operator selection');
 const first=win.__test.loadDocs(),second=win.__test.loadDocs();
 const req1=requests.shift(),req2=requests.shift();
 req2(new Response(JSON.stringify({ok:true,documents:[{id:'newest',name:'New'}, {id:'older',name:'Old'}]}),{status:200}));
 await second;
 req1(new Response(JSON.stringify({ok:true,documents:[{id:'stale',name:'Stale'}]}),{status:200}));
 await first;
 assert.equal(getState('selectedDoc'),'older','stale response reset selection');
 assert.equal(getState('docs').length,2,'stale list overwrote fresh response');

 setState('mode','session');setState('page','INFO');setState('doc',{id:'D',name:'Action'});
 setState('data',{INFO_SECTIONS:[{columns:[{letter:'B',label:'Info'},{letter:'C',label:comment},{letter:'D',label:extra}],rows:[{row:3,label:action,section:0,fields:[
   {col:'B',header:'Info',value:value,choices:[value]},
   {col:'C',header:comment,value:'',choices:[]},
   {col:'D',header:extra,value:'',choices:[]}]}]}],FIELD_AUDIO:{},LOG:[]});
 setState('unsavedAudio',{blob:f,when:'now'});setState('queue',[]);
 tree=render();
 const footer=tree.find(n=>n.props.className==='bv-footer-status');
 assert.ok(footer);assert.equal(footer.props.role,'alert');
 assert.ok(hasText(footer,'\u041d\u0415 \u0435 \u0437\u0430\u043f\u0430\u0437\u0435\u043d\u043e'),'missing explicit unsaved warning');
 const fields=tree.filter(n=>n.type==='button'&&n.props.className==='bv-info-val');
 assert.equal(fields.length,3);
 fields[1].props.onClick();
 tree=render();
 assert.ok(tree.some(n=>n.type==='textarea'&&n.props.className==='bv-textarea'),'comment not a textarea');
 assert.equal(tree.filter(n=>n.type==='select').length,0,'comment opened a dropdown');
 setState('editing',null);
 tree=render();
 const primary=tree.filter(n=>n.type==='button'&&n.props.className==='bv-info-val')[0];
 primary.props.onClick();
 tree=render();
 assert.ok(tree.some(n=>n.type==='select'),'primary action must keep dropdown');

 // Failure to enqueue TEAM/TECH must not close the add form or erase fields.
 setState('editing',null);setState('page','TEAM');setState('rowAdd',true);setState('rowFields',['Alice']);
 tree=render();
 const add=tree.find(n=>n.type==='button'&&hasText(n,'\u0414\u043e\u0431\u0430\u0432\u0438'));
 assert.ok(add,'missing add button');
 await add.props.onClick();
 assert.equal(getState('rowAdd'),true);
 assert.equal(getState('rowFields')[0],'Alice');

 // On the GAS side, type canonicalization must only apply to primary action field.
 assert.ok(gas.includes('isAction=bvlNorm_(target.record.label)'));
 assert.ok(gas.includes('target.record.fields[0].col===col'));
 // Apps Script must store long comments untruncated and leave primary type behavior intact.
 const gasCtx={SpreadsheetApp:{DataValidationCriteria:{VALUE_IN_LIST:'LIST',VALUE_IN_RANGE:'RANGE'}},console};
 vm.createContext(gasCtx);vm.runInContext(gas,gasCtx);
 const values=[],mockSheet={getRange:ref=>({getDisplayValue:()=>'',getDataValidation:()=>null,
   setValue:v=>values.push({ref,v})})};
 gasCtx.bvlFindInfoField_=(sh,p)=>({row:3,col:p.col,
   record:{label:action,fields:[{col:'B'},{col:'C'},{col:'D'}]},section:{section:0}});
 const longText='Detailed comment in rescue coordination: '.repeat(5);
 const r=gasCtx.bvlField_({getSheetByName:()=>mockSheet},{sheet:'INFO',row:3,col:'C',
   value:longText,base:'',field_label:action,header_label:comment,section:0});
 assert.equal(r.ok,true);assert.equal(values[0].v,longText.trim(),
   'GAS must not truncate non-primary cells to 60-character action types');

 console.log('PASS v0.7.1: durable save separation, stable audio retry, selected document, INFO editing, unsaved footer, add-row failure, GAS primary action scope.');
}
run().catch(err=>{console.error(err);process.exitCode=1;});
