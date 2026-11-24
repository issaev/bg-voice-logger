// Isolated privacy-safe Apps Script trace test, no external Google services.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const gas=fs.readFileSync(__dirname+'/../apps-script/Code.gs','utf8');
const captured=[];
const secret='O'.repeat(32);
const context={console:{log:x=>captured.push(String(x))},Date,JSON,
  PropertiesService:{getScriptProperties:()=>({getProperty:()=>secret})},
  ContentService:{MimeType:{JSON:'application/json'},createTextOutput:val=>({value:val,setMimeType(type){this.mime=type;return this;}})}
};
vm.createContext(context);vm.runInContext(gas,context);
context.bvlDispatch_=(req)=>({ok:true});
const req={secret,action:'operation',request_id:'abcdef012345',payload:{text:'PRIVATE voice log event',doc_id:'SECRET_ID_123456789'}};
const out=context.doPost({postData:{contents:JSON.stringify(req)}});
assert.equal(JSON.parse(out.value).ok,true);
assert.equal(out.mime,'application/json');
assert.equal(captured.length,3);
const logs=captured.map(JSON.parse);
assert.deepEqual(logs.map(x=>x.stage),['received','completed','response_serialized']);
assert.ok(logs.every(x=>x.request_id==='abcdef012345'&&x.action==='operation'));
const str=captured.join('\n');
for(const value of [secret,req.payload.text,req.payload.doc_id])assert.ok(!str.includes(value),'Sensitive text leaked in log');
// Diagnostic ID must be validated: never blindly log a caller-provided arbitrary string.
captured.length=0;
context.doPost({postData:{contents:JSON.stringify({secret,action:'read',request_id:'INJECTED_SECRET_DOC_ID',payload:{}})}});
assert.ok(captured.every(x=>JSON.parse(x).request_id==='untracked'));
// A real mocked bvlRead_ should report cumulative phase timings without logging private cell contents.
captured.length=0;
const docId='PRIVATE_SHEET_ID_123456789';
const emptyRange={getDisplayValues:()=>[[]],getRichTextValues:()=>[[{getRuns:()=>[]}]]};
const mkSheet=()=>({getLastRow:()=>2,getRange:()=>emptyRange});
const sheets={INFO:mkSheet(),LOG:mkSheet(),TEAM:mkSheet(),TECH:mkSheet()};
const ss={getSheetByName:n=>sheets[n]||null,getUrl:()=> 'https://docs.google.com/spreadsheets/d/'+docId};
context.bvlDoc_=()=>ss;
context.bvlInfoSections_=()=>[];
context.bvlEnd_=()=>2;
context.DriveApp={getFileById:()=>({getName:()=> 'PRIVATE OPERATION'})};
const read=context.bvlRead_('FOLDER','TEMPLATE',docId,'aabbccddeeff');
assert.equal(read.ok,true);
const phases=captured.map(x=>JSON.parse(x).stage);
for(const p of ['read_start','document_opened','info_loaded','log_loaded','photos_loaded',
  'audio_index_loaded','history_loaded','team_tech_loaded','read_complete'])
  assert.ok(phases.includes(p),'Missing GAS diagnostic phase '+p);
assert.ok(!captured.join('\n').includes(docId));
assert.ok(!captured.join('\n').includes('PRIVATE OPERATION'));
console.log('PASS v0.7.2.1 GAS: safe request ID, redacted action logging and read phases, no content/secret leaks.');
