// v0.8.0 mobile UI regression. Synthetic data only; no network or Drive writes.
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../assets/app.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../assets/app.css'),'utf8');
const gas=fs.readFileSync(path.join(__dirname,'../apps-script/Code.gs'),'utf8');
const title='\u0414\u043e\u043a\u0443\u043c\u0435\u043d\u0442 \u0437\u0430 \u041a\u043e\u043e\u0440\u0434\u0438\u043d\u0430\u0446\u0438\u044f \u043d\u0430 \u0410\u043a\u0446\u0438\u044f';
const importText='\u0418\u043c\u043f\u043e\u0440\u0442 \u043d\u0430 \u0441\u0442\u0430\u0440\u0438 \u0437\u0430\u043f\u0438\u0441\u0438 \u043e\u0442 v0.2.2';
assert.ok(app.includes("className:'bv-brand-title'},'"+title+"'"));
assert.ok(!app.includes("onClick:importLegacyQueue},'"+importText));
assert.ok(app.includes('async function importLegacyQueue()'),'Legacy records/handler must remain untouched');
assert.ok(app.includes("preview.toDataURL('image/jpeg',0.65)"),'No new-photo preview');
assert.equal((app.match(/capture:'environment'/g)||[]).length,2,'New and existing LOG need camera capture');
const marker=app.match(/const BVLOG_RUNNING_BUILD = '([^']+)'/);
assert.ok(marker);
const canonical=app.replace(/const BVLOG_RUNNING_BUILD = '[A-Za-z0-9._-]+';/,
  "const BVLOG_RUNNING_BUILD = '__BUILD_PLACEHOLDER__';");
assert.equal(marker[1],'0.7.2.1-'+crypto.createHash('sha256').update(canonical).digest('hex').slice(0,12));
const color=css.match(/\.bv-header \.bv-brand \.bv-brand-title \{ color:(#[a-fA-F0-9]{6})/);
const navy=css.match(/--bv-navy:(#[a-fA-F0-9]{6})/);
assert.ok(color&&navy);
const lum=hex=>hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255)
 .map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4)
 .reduce((v,c,i)=>v+c*[.2126,.7152,.0722][i],0);
assert.ok((lum(color[1])+.05)/(lum(navy[1])+.05)>=4.5,'Red title not WCAG AA readable');
// Test the actual upload function with camera-like File and a document-switch fault.
function extract(s,a,b){const x=s.indexOf(a),y=s.indexOf(b,x+a.length);assert.ok(x>=0&&y>x);return s.slice(x,y)}
const uploader=extract(app,'    async function uploadExistingPhoto(entry,files) {','    function canDiscardInterruptedAudio(');
const commits=[],errors=[],busy=[];
const env={doc:{id:'DOC_ONE',name:'Synthetic'},docRef:{current:{id:'DOC_ONE'}},
 setPhotoBusy:v=>busy.push(v),setError:v=>errors.push(v),setNotice:()=>{},
 preparePhoto:async f=>({blob:new Blob(['x']),previewBlob:new Blob(['y']),name:f.name,mime:'image/jpeg'}),
 enqueue:async o=>{commits.push(o);return true},Blob,Array,Promise};
vm.createContext(env);vm.runInContext(uploader+'\nthis.upload=uploadExistingPhoto;',env);
(async()=>{
 const row={row:9,cells:['','12:00','Op','Synthetic event']};
 await env.upload(row,[{name:'camera.jpg'}]);
 assert.equal(commits.length,1);
 assert.equal(commits[0].kind,'photo');
 assert.equal(commits[0].doc_id,'DOC_ONE');
 assert.equal(commits[0].target_row,9);
 assert.equal(commits[0].expected_time,'12:00');
 assert.equal(commits[0].expected_text,'Synthetic event');
 assert.deepEqual(busy,[true,false]);
 env.docRef.current.id='OTHER';
 await env.upload(row,[{name:'more.jpg'}]);
 assert.equal(commits.length,1,'Never attach to another incident');
 assert.ok(errors.length,'Missing document switch warning');
 // GAS already lists all same-folder Sheets without any name template matching.
 const part=extract(gas,'function bvlDoc_(folderId, templateId, docId) {','/** Schema adapters.');
 const items=[
  {id:'ARBITRARY_DOC_ID_12345',name:'One word',date:'2026-11-22T00:00:00Z',trash:false},
  {id:'DATED_DOC_ID_1234567',name:'2026.11.24 - Synthetic',date:'2026-11-24T00:00:00Z',trash:false},
  {id:'TEMPLATE_DOC_ID_12345',name:'Template',date:'2026-11-23T00:00:00Z',trash:false},
  {id:'TRASHED_DOC_ID_12345',name:'Removed',date:'2026-11-20T00:00:00Z',trash:true}
 ];
 const file=x=>({getId:()=>x.id,getName:()=>x.name,isTrashed:()=>x.trash,
   getDateCreated:()=>new Date(x.date),getUrl:()=> 'https://example.invalid/test',
   getMimeType:()=> 'application/vnd.google-apps.spreadsheet',
   getParents:()=>{let n=0;return{hasNext:()=>n++===0,next:()=>({getId:()=> 'FOLDER_ID_123456'})}}});
 const ctx={DriveApp:{getFolderById:()=>({getFilesByType:()=>{let j=0;return{
   hasNext:()=>j<items.length,next:()=>file(items[j++])}}}),
   getFileById:id=>file(items.find(x=>x.id===id))},
  MimeType:{GOOGLE_SHEETS:'application/vnd.google-apps.spreadsheet'},
  BVL:{MIME:'application/vnd.google-apps.spreadsheet'},bvlValidId_:x=>x,
  bvlTypeOptions_:()=>['Test'],SpreadsheetApp:{openById:id=>({id})}};
 vm.createContext(ctx);vm.runInContext(part+'\nthis.list=bvlList_;this.open=bvlDoc_;',ctx);
 const listed=ctx.list('FOLDER_ID_123456','TEMPLATE_DOC_ID_12345');
 assert.deepEqual(Array.from(listed.documents).map(x=>x.name),['2026.11.24 - Synthetic','One word']);
 assert.equal(ctx.open('FOLDER_ID_123456','TEMPLATE_DOC_ID_12345','ARBITRARY_DOC_ID_12345').id,'ARBITRARY_DOC_ID_12345');
 assert.throws(()=>ctx.open('OTHER_FOLDER','TEMPLATE_DOC_ID_12345','ARBITRARY_DOC_ID_12345'),/configured folder/);
 console.log('PASS v0.8 mobile UI: camera, stable local attachment, safe folder name handling, red title contrast, legacy button removal.');
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
