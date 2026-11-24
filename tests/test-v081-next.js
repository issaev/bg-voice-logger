// Isolated v0.8.1 regressions, using actual source and fake Drive/browser.
function runV081(app,gas,css){
  const check=(value,msg)=>{if(!value)throw new Error(msg);};
  const tests=[];
  const extract=(s,a,b)=>{const i=s.indexOf(a),j=s.indexOf(b,i+a.length);check(i>=0&&j>i,'extract '+a);return s.slice(i,j);};
  const F='FOLDER_1234567890123',T='TEMPLATE_1234567890123';
  function fixture(){
    let made=0,prepared=0,fault='',stamp=0;const files=[],props={};
    const iterator=a=>{let i=0;return{hasNext:()=>i<a.length,next:()=>a[i++]};};
    const folder={getFilesByName:n=>iterator(files.filter(x=>x.getName()===n&&!x.isTrashed()))};
    const template={makeCopy:name=>{
      if(fault==='beforeCopy')throw Error('before copy');
      const id='SYNTHETIC_DOCUMENT_'+(++made),f={name,dead:false};
      Object.assign(f,{getId:()=>id,getName:()=>f.name,setName:n=>{f.name=n;if(fault==='afterRename')throw Error('rename ACK lost');return f;},
        getDateCreated:()=>new Date(),getUrl:()=> 'https://example.invalid/document',isTrashed:()=>f.dead,
        getMimeType:()=> 'application/vnd.google-apps.spreadsheet',getParents:()=>iterator([{getId:()=>F}])});
      files.push(f);if(fault==='afterCopy')throw Error('copy ACK lost');return f;
    }};
    const info={getMaxColumns:()=>10,getRange:()=>({setValue:()=>{},clearContent:()=>{}})},log={getRange:()=>({setValue:()=>{}})};
    const ss={getSheetByName:n=>({INFO:info,LOG:log,TECH:{},TEAM:{}})[n]};
    const drive={getFolderById:()=>folder,getFileById:id=>id===T?template:files.find(f=>f.getId()===id)||(()=>{throw Error('missing');})()};
    const sheets={openById:()=>ss,flush:()=>{if(fault==='flush')throw Error('flush failed');}};
    const properties={getScriptProperties:()=>({getProperty:k=>props[k]||null,setProperty:(k,v)=>{props[k]=v;}})};
    const injected=gas+'\n'+"bvlTypeOptions_=()=>['Издирване']; bvlInfoSections_=()=>[{headerRow:2,rows:[{label:'Акция',row:3,fields:[{col:'B'}]},{label:'Локация',row:4,fields:[{col:'B'}]}]}]; bvlValidationAwareSet_=()=>({ok:true}); bvlPrepare_=()=>onPrepare(); return {create:bvlCreate_,trace:bvlTrace_,post:doPost};";
    const g=new Function('DriveApp','SpreadsheetApp','PropertiesService','onPrepare','console',injected)(drive,sheets,properties,()=>prepared++,{log:()=>{}});
    const req={type:'Издирване',place:'Test',incident_date:'2026-11-24',create_id:'12345678-1234-1234-1234-1234567890ab'};
    return {g,req,files,props,make:()=>g.create(F,T,req,'abcdef123456'),fault:x=>fault=x,count:()=>made,prep:()=>prepared};
  }
  let f=fixture();let r=f.make();check(r.ok&&f.count()===1&&f.prep()===1,'fresh create');
  check(f.make().document.id===r.document.id&&f.count()===1&&f.prep()===1,'confirmed retry deduplication');tests.push('fresh + confirmed duplicate');
  f=fixture();f.fault('afterCopy');try{f.make();}catch(e){};check(f.count()===1&&f.files[0].getName().startsWith('BVLOG_CREATE_PENDING_'),'pending copy after lost ACK');
  f.fault('');r=f.make();check(r.ok&&f.count()===1&&f.prep()===1,'recover lost copy ACK');tests.push('recover copied-but-unacknowledged document');
  f=fixture();f.fault('flush');try{f.make();}catch(e){};f.fault('');r=f.make();check(r.ok&&f.count()===1,'resume initialization');tests.push('resume interrupted initialization');
  f=fixture();f.fault('afterRename');try{f.make();}catch(e){};f.fault('');r=f.make();check(r.ok&&f.count()===1&&f.prep()===1,'rename ACK lost must not reinitialize visible file');tests.push('recover published document without rewriting');
  f=fixture();f.fault('beforeCopy');try{f.make();}catch(e){};f.fault('');r=f.make();check(!r.ok&&r.code==='create_unknown'&&f.count()===0,'ambiguous absent copy fails closed');tests.push('uncertain copy fails closed');
  f=fixture();r=f.make();f.files[0].dead=true;r=f.make();check(!r.ok&&r.code==='create_missing'&&f.count()===1,'moved/deleted previous result must not recreate');tests.push('missing confirmed document fails closed');
  const create=extract(app,'    async function newDocument() {','    async function enqueue(op)');
  check(!create.includes('await loadDocs(')&&create.includes('docsRequestRef.current++')&&create.includes('await startSession(r.document,r.bootstrap)'),'no blocking LIST, invalidate stale list');
  check(create.indexOf('localStorage.setItem(key,JSON.stringify(payload))')<create.indexOf("api('documents','POST',Object.assign({},payload,{bootstrap:true}))"),'persist before send');
  tests.push('create critical path and durable request markers');
  const picker=extract(app,'  function PhotoSourcePicker(','  // A Google popup');
  const h=(type,props,...children)=>({type,props:props||{},children}),refs=[];let open=false,ri=0,chosen=0,received=0;
  const render=()=>{ri=0;return new Function('h','useState','useRef','useEffect','icon',picker+'\nreturn PhotoSourcePicker({disabled:false,compact:true,onFiles:files=>onFiles(files)});'.replace('onFiles(files)','h.onFiles(files)'))(h,()=>[open,v=>open=typeof v==='function'?v(open):v],()=>refs[ri++]|| (refs[ri-1]={current:null}),()=>{},()=>null);};
  h.onFiles=files=>received=files.length;
  let node=render();check(!node.children[3],'source options hidden until tap');node.children[0].props.onClick();node=render();
  check(node.children[3]&&node.children[1].props.multiple&&node.children[2].props.capture==='environment','two native pickers, explicit choice');
  node.children[2].props.ref.current={click:()=>chosen++};node.children[3].children[0].props.onClick();check(chosen===1&&!open,'camera click synchronous, menu closed');
  node.children[2].props.onChange({target:{files:[{name:'test'}],value:'x'}});check(received===1,'forward selected file');tests.push('photo chooser explicit native action');
  check(css.includes('grid-column:1/-1')&&app.includes("className:'bv-event-controls'")&&app.includes("className:'bv-install-footer'"),'mobile layout markers');
  check(app.indexOf("className:'bv-install-footer'")>app.indexOf("className:'bv-queue-link'"),'install icon after chooser controls');tests.push('mobile layout and bottom install markers');
  return tests;
}

const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
console.log('PASS',runV081(read('assets/app.js'),read('apps-script/Code.gs'),read('assets/app.css')));
