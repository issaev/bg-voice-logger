// Isolated v0.8.2 mobile UX and free-name Sheets regression, no live data.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
const path=require('node:path');
const root=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'assets/app.css'),'utf8');
const gas=fs.readFileSync(path.join(root,'apps-script/Code.gs'),'utf8');
const title='\u0414\u043e\u043a\u0443\u043c\u0435\u043d\u0442 \u0437\u0430 \u041a\u043e\u043e\u0440\u0434\u0438\u043d\u0430\u0446\u0438\u044f \u043d\u0430 \u0410\u043a\u0446\u0438\u044f';
const forbidden='\u0418\u043c\u043f\u043e\u0440\u0442 \u043d\u0430 \u0441\u0442\u0430\u0440\u0438 \u0437\u0430\u043f\u0438\u0441\u0438 \u043e\u0442 v0.2.2';
assert.ok(app.includes("className:'bv-brand-title'},'"+title+"'"),'Exact new title is missing');
assert.ok(!app.includes("onClick:importLegacyQueue},'"+forbidden),'Legacy queue button still visible');
assert.ok(app.includes('async function importLegacyQueue()'),'Legacy import data handler must remain for safe recovery');
assert.ok(app.includes("capture:'environment'"),'Native camera capture input is missing');
assert.ok(app.includes("preview.toDataURL('image/jpeg',0.65)"),'Prepared photo preview missing');
assert.ok(!app.includes('getUserMedia({video:'),'Do not launch camera without an explicit user gesture');
// Embedded hash must match canonicalized JS source, not the complete file hash.
const match=app.match(/const BVLOG_RUNNING_BUILD = '([^']+)'/);assert.ok(match);
const canonical=app.replace(/const BVLOG_RUNNING_BUILD = '[A-Za-z0-9._-]+';/,
  "const BVLOG_RUNNING_BUILD = '__BUILD_PLACEHOLDER__';");
const expected=require('./fixture-contract').version+'-'+crypto.createHash('sha256').update(canonical).digest('hex').slice(0,12);
assert.equal(match[1],expected,'Incorrect embedded JS build marker');
// The specified bright red must remain readable against the dark-blue header.
const rgb=hex=>hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
const lum=hex=>rgb(hex).reduce((s,c,i)=>s+c*[.2126,.7152,.0722][i],0);
const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
const red=css.match(/\.bv-header \.bv-brand \.bv-brand-title \{ color:(#[a-fA-F0-9]{6})/);
const navy=css.match(/--bv-navy:(#[a-fA-F0-9]{6})/);
assert.ok(red&&navy,'Missing explicit brand red or background navy');
assert.ok(ratio(red[1],navy[1])>=4.5,'Brand title red lacks WCAG AA contrast');
function extract(source,a,b){const i=source.indexOf(a),j=source.indexOf(b,i+a.length);
 assert.ok(i>=0&&j>i,'Extraction failed: '+a);return source.slice(i,j)}
// Use the actual React element tree: camera is available for BOTH new and existing LOG items.
const exposed=app.replace('  const ReactComponent=wp.element.Component;',
  '  window.__App=App;\n  const ReactComponent=wp.element.Component;');
assert.notEqual(exposed,app);
const names=Array.from(app.matchAll(/const \[([A-Za-z][A-Za-z0-9]*),\s*set[A-Za-z0-9]+\]=useState\(/g)).map(m=>m[1]);
const slots={},refs={};let stateIndex=0,refIndex=0;const h=(type,props,...children)=>({type,props:props||{},children});
const put=(name,value)=>{let i=names.indexOf(name);assert.ok(i>=0,name);slots[i]=value};
function flatten(v,out=[]){if(v==null||typeof v==='string'||typeof v==='number'||typeof v==='boolean')return out;
 if(Array.isArray(v)){for(const item of v)flatten(item,out);return out;}
 if(typeof v.type==='function')return flatten(v.type({...v.props,children:v.children}),out);
 out.push(v);for(const item of v.children||[])flatten(item,out);return out;}
function textValue(v){if(v==null||typeof v==='boolean')return '';if(typeof v==='string'||typeof v==='number')return String(v);
 if(Array.isArray(v))return v.map(textValue).join(' ');return textValue(v.children||[])}
const w={BVLOG_CONFIG:{api:'/wp-json/',auth_mode:'public',stt_mode:'none',user:{id:0},plugin_version:require('./fixture-contract').version,expected_build:match[1],logo_url:'/logo.png'},
 setTimeout:()=>{},setInterval:()=>1,clearInterval:()=>{}};
const ctx={window:w,wp:{element:{createElement:h,
 useState:init=>{const i=stateIndex++;if(!(i in slots))slots[i]=typeof init==='function'?init():init;
  return[slots[i],val=>{slots[i]=typeof val==='function'?val(slots[i]):val}]},
 useRef:initial=>{const i=refIndex++;if(!(i in refs))refs[i]={current:initial};return refs[i]},
 useEffect:()=>{},createRoot:()=>({render:()=>{}})}},navigator:{onLine:true},
 document:{getElementById:()=>null,hidden:false},indexedDB:{open:()=>({})},
 localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},
 Blob,ArrayBuffer,Uint8Array,Response,URL,Date,Math,Promise,console,setTimeout,clearTimeout};
vm.createContext(ctx);vm.runInContext(exposed,ctx);
const render=()=>{stateIndex=0;refIndex=0;return flatten(w.__App())};
const docs=[
 {id:'DOC_A',name:'\u0422\u0435\u0441\u0442\u043e\u0432\u0430 \u0430\u043a\u0446\u0438\u044f'},
 {id:'DOC_B',name:'Rescue Practice 2026'},
 {id:'DOC_C',name:'One-word-title'}
];
put('mode','choose');put('docs',docs);put('selectedDoc','DOC_B');put('auth',{kind:'public',name:'Operator'});
put('authLoading',false);put('online',true);put('queue',[]);
let nodes=render();
let chooser=nodes.find(n=>n.type==='select'&&n.props.value==='DOC_B');assert.ok(chooser,'Selected free-named document missing');
let options=flatten(chooser);assert.deepEqual(options.filter(n=>n.type==='option').map(n=>n.props.value),docs.map(d=>d.id));
assert.ok(textValue(chooser).includes('One-word-title'),'Original filename must be displayed as supplied');
put('mode','session');put('doc',{id:'DOC_B',name:'Rescue Practice 2026'});put('page','LOG');
put('data',{LOG:[{row:3,cells:['','12:12','Test','Synthetic event','Voice','', 'op-1'],photos:[]}],INFO:[],TEAM:[],TECH:[],FIELD_AUDIO:{}});
put('photos',[{name:'camera.jpg',previewSrc:'data:image/jpeg;base64,AA==',blob:new Blob(['x']),previewBlob:new Blob(['y']),mime:'image/jpeg'}]);
nodes=render();
const brand=nodes.find(n=>n.type==='strong'&&n.props.className==='bv-brand-title');
assert.ok(brand&&textValue(brand)===title,'Brand title is wrong');
const inputCameras=nodes.filter(n=>n.type==='input'&&n.props.type==='file'&&n.props.capture==='environment');
assert.equal(inputCameras.length,2,'Need direct camera capture for new and existing events');
assert.ok(inputCameras.every(n=>n.props.accept==='image/*'&&typeof n.props.onChange==='function'));
const galleryInputs=nodes.filter(n=>n.type==='input'&&n.props.type==='file'&&n.props.multiple===true);
assert.equal(galleryInputs.length,2,'Gallery uploads must remain available for both contexts');
assert.ok(nodes.some(n=>n.type==='img'&&n.props.className==='bv-photo-chip-preview'&&
 n.props.src.startsWith('data:image/jpeg;')),'Selected image preview not shown');
put('queueOpen',true);nodes=render();
assert.ok(nodes.some(n=>String(n.props.className||'').includes('bv-queue-modal')),'Queue modal did not render');
assert.ok(!textValue(nodes).includes(forbidden),'Old import button is still present in modal');
// The real uploader places camera captures in the existing durable photo queue with row guard.
const uploadCode=extract(app,'    async function uploadExistingPhoto(entry,files) {','    function canDiscardInterruptedAudio(');
const writes=[],busy=[],errors=[],notice=[];const upload={
 doc:{id:'DOC_B',name:'Rescue Practice 2026'},docRef:{current:{id:'DOC_B'}},
 setPhotoBusy:x=>busy.push(x),setError:x=>errors.push(x),setNotice:x=>notice.push(x),
 preparePhoto:async f=>({blob:new Blob(['x']),previewBlob:new Blob(['y']),name:f.name,mime:'image/jpeg'}),
 enqueue:async o=>{writes.push(o);return true},console,Array,Promise};
vm.createContext(upload);vm.runInContext(uploadCode+'\nthis.uploadExistingPhoto=uploadExistingPhoto;',upload);
(async()=>{
 const entry={row:3,cells:['','12:12','Operator','Synthetic event']};
 await upload.uploadExistingPhoto(entry,[{name:'camera.jpg'}]);
 assert.equal(writes.length,1);assert.equal(writes[0].doc_id,'DOC_B');
 assert.equal(writes[0].target_row,3);assert.equal(writes[0].expected_time,'12:12');
 assert.equal(writes[0].expected_text,'Synthetic event');
 assert.equal(writes[0].kind,'photo');assert.deepEqual(busy,[true,false]);
 upload.docRef.current.id='OTHER';await upload.uploadExistingPhoto(entry,[{name:'next.jpg'}]);
 assert.equal(writes.length,1,'Camera must not attach to wrong active incident');
 assert.ok(errors.length>0,'Document-switch warning missing');
 // GAS already accepts any spreadsheet name inside the configured folder. Check exact source behavior.
 const gasSource=extract(gas,'function bvlDoc_(folderId, templateId, docId, metadata) {','/** Schema adapters.');
 const items=[{id:'ONE_LONG_DOC_ID_12345',name:'One-word-title',stamp:'2026-11-22T10:00:00.000Z',trashed:false},
   {id:'TWO_LONG_DOC_ID_12345',name:'2026.11.24 - DKA - Synthetic',stamp:'2026-11-24T10:00:00.000Z',trashed:false},
   {id:'TEMPLATE_DOC_ID_12345',name:'Template',stamp:'2026-11-23T10:00:00.000Z',trashed:false},
   {id:'TRASHED_DOC_ID_12345',name:'Old',stamp:'2026-11-21T10:00:00.000Z',trashed:true}];
 const mk=i=>({getId:()=>i.id,getName:()=>i.name,getDateCreated:()=>new Date(i.stamp),
   isTrashed:()=>i.trashed,getUrl:()=> 'https://example.invalid/no-credentials',
   getMimeType:()=> 'application/vnd.google-apps.spreadsheet',getParents:()=>{let hasParent=true;return {hasNext:()=>hasParent,next:()=>{hasParent=false;return {getId:()=> 'TEST_FOLDER_ID_123456'}}}}});
 const gasCtx={DriveApp:{getFolderById:()=>({getFilesByType:()=>{let p=0;return {hasNext:()=>p<items.length,next:()=>mk(items[p++])}}}),
 getFileById:id=>mk(items.find(x=>x.id===id)||items[0])},
 MimeType:{GOOGLE_SHEETS:'application/vnd.google-apps.spreadsheet'},
 SpreadsheetApp:{openById:id=>({id})},
 BVL:{MIME:'application/vnd.google-apps.spreadsheet'},
 bvlValidId_:id=>id,bvlTypeOptions_:()=>['Synthetic'],bvlPhaseTracer_:()=>()=>{}};
 vm.createContext(gasCtx);vm.runInContext(gasSource+'\nthis.list=bvlList_;this.open=bvlDoc_;',gasCtx);
 const listed=gasCtx.list('TEST_FOLDER_ID_123456','TEMPLATE_DOC_ID_12345');
 assert.equal(listed.ok,true);
 assert.deepEqual(Array.from(listed.documents).map(x=>x.id),['TWO_LONG_DOC_ID_12345','ONE_LONG_DOC_ID_12345']);
 assert.equal(gasCtx.open('TEST_FOLDER_ID_123456','TEMPLATE_DOC_ID_12345','ONE_LONG_DOC_ID_12345').id,'ONE_LONG_DOC_ID_12345');
 assert.throws(()=>gasCtx.open('OTHER_FOLDER_ID_12345','TEMPLATE_DOC_ID_12345','ONE_LONG_DOC_ID_12345'),/configured folder/);
 console.log('PASS v0.8 UI: direct camera x2, local photo durability, exact accessible red header, free-name folder documents, no legacy queue button.');
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
