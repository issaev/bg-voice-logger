// Guarded Apps Script staging harness never logs sheet data or calls writes.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../apps-script/STAGING_READ_BENCHMARK.gs','utf8');
const privateTitle='BVLOG_BENCHMARK_Synthetic_Test_001';
const id='TEST_DOC_1234567890';
const settings={
  BVLOG_BENCHMARK_ENABLED:'STAGING_READ_ONLY',
  BVLOG_BENCHMARK_VARIANT:'candidate_080a',
  BVLOG_BENCHMARK_FOLDER_ID:'TEST_FOLDER_1234567890',
  BVLOG_BENCHMARK_TEMPLATE_ID:'TEST_TEMPLATE_1234567890',
  BVLOG_BENCHMARK_DOC_ID:id
};
const output=[];const calls={read:0,write:0,open:0};
const ctx={
 Date,JSON,console:{log:s=>output.push(s)},
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>settings[k]})},
 DriveApp:{getFileById:(x)=>{calls.open++;assert.equal(x,id);
   return {getName:()=>privateTitle,getMimeType:()=>
     'application/vnd.google-apps.spreadsheet',isTrashed:()=>false};}},
 Utilities:{getUuid:()=> 'aabbccdd-1234-5678-9012-000000000000',
  newBlob:s=>({getSize:()=>Buffer.byteLength(s,'utf8')})},
 bvlValidId_:s=>/^[A-Za-z0-9_-]{15,200}$/.test(String(s))?s:'',
 bvlRead_:(folder,template,doc,requestId)=>{calls.read++;
   assert.equal(folder,settings.BVLOG_BENCHMARK_FOLDER_ID);
   assert.equal(template,settings.BVLOG_BENCHMARK_TEMPLATE_ID);
   assert.equal(doc,id);assert.equal(requestId,'aabbccdd1234');
   return {ok:true,data:{LOG:[{cells:[1,'12:00','Test','SENSITIVE CELL TEXT']}]}};}
};
vm.createContext(ctx);vm.runInContext(source,ctx);
let result=ctx.runBvlogStagingReadBenchmark();
assert.equal(result.status,'ok');assert.equal(result.log_rows,1);
assert.equal(calls.read,1);assert.equal(calls.open,1);
assert.equal(output.length,1);
for(const secret of ['SENSITIVE CELL TEXT',id,privateTitle,settings.BVLOG_BENCHMARK_TEMPLATE_ID])
 assert.ok(!output.join('\n').includes(secret),'benchmark leaked private data');
function denied(change,expected){
 const beforeRead=calls.read,beforeOutput=output.length;
 const back={...settings};Object.assign(settings,change);
 assert.throws(()=>ctx.bvlStageBenchmarkRead_(),expected);
 assert.equal(calls.read,beforeRead,'Forbidden execution reached document read');
 assert.equal(output.length,beforeOutput,'Forbidden execution logged anything');
 Object.assign(settings,back);
}
denied({BVLOG_BENCHMARK_ENABLED:''},/disabled/);
denied({BVLOG_BENCHMARK_VARIANT:'production'},/variant/);
denied({BVLOG_BENCHMARK_DOC_ID:'!!'},/identifiers/);
ctx.DriveApp.getFileById=()=>({getName:()=> '2026 Actual Rescue',
 getMimeType:()=> 'application/vnd.google-apps.spreadsheet',isTrashed:()=>false});
assert.throws(()=>ctx.bvlStageBenchmarkRead_(),/designated staging/);
assert.equal(calls.read,1);
ctx.DriveApp.getFileById=()=>({getName:()=>privateTitle,
 getMimeType:()=> 'application/vnd.google-apps.spreadsheet',isTrashed:()=>false});
ctx.bvlRead_=()=>{throw new Error('SENSITIVE DOC TITLE / LOCATION');};
assert.throws(()=>ctx.bvlStageBenchmarkRead_(),/no document details/);
assert.equal(JSON.parse(output.at(-1)).status,'exception');
assert.ok(!output.join('\n').includes('LOCATION'));
console.log('PASS v0.8.0-A staging runner: strict opt-in, test-only title, read-only and redacted logs.');
