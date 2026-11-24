// v0.8.0-A: compare legacy and bounded read paths using isolated fake Sheets.
// All fixture values are synthetic and no live Google APIs are called.
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const root=__dirname+'/..';
const source=fs.readFileSync(root+'/apps-script/Code.gs','utf8');
function fixture(last, entries={}) {
  const writes=[];
  const stats={calls:[],cells:0,sheets:[],driveCalls:0};
  function sheet(name, upper, colCount, data){
    return {
      getLastRow:()=>upper,
      getLastColumn:()=>colCount,
      getRange:(row,col,height=1,width=1)=>{
        if(typeof row==='string')throw Error('Unexpected string range: '+row);
        assert.ok(Number.isInteger(row)&&row>=1, 'invalid start '+row);
        assert.ok(Number.isInteger(height)&&height>=1,'invalid height '+height);
        stats.calls.push({sheet:name,row,col,height,width});stats.cells+=height*width;
        const values=()=>Array.from({length:height},(_,i)=>Array.from({length:width},(_,j)=>{
          const full=data[row+i]||[];
          return full[col+j-1]||'';
        }));
        return {
          getDisplayValues:values,
          getRichTextValues:()=>values().map(v=>v.map(x=>({getRuns:()=>x?[]:[]})))
        };
      }
    };
  }
  const logData=entries.LOG||{};
  const tabs={
    INFO:sheet('INFO',34,4,entries.INFO||{}),
    LOG:sheet('LOG',last,8,logData),
    TEAM:sheet('TEAM',2,9,{}),
    TECH:sheet('TECH',2,6,{})
  };
  const ss={getSheetByName:n=>{stats.sheets.push(n);return tabs[n]||null;},getUrl:()=> 'https://google.example/test'};
  const file={getMimeType:()=> 'application/vnd.google-apps.spreadsheet',
    isTrashed:()=>false,getParents:()=>({next:()=>({getId:()=> 'FOLDER_00000000001'}),hasNext:(()=>{let n=0;return()=>++n===1;})()}),
    getName:()=> 'Synthetic Test',getId:()=> 'DOC_00000000000001'};
  const logs=[];
  const env={Date,Math,JSON,console:{log:x=>logs.push(String(x))},
    SpreadsheetApp:{openById:()=>ss},
    DriveApp:{getFileById:()=>{stats.driveCalls++;return file;}}};
  return {env,stats,writes,logs};
}
function load(code,fx){vm.createContext(fx.env);vm.runInContext(code,fx.env);
  fx.env.bvlInfoSections_=()=>[];return fx.env;}
function eq(a,b,msg){assert.equal(JSON.stringify(a),JSON.stringify(b),msg);}
// Reference the preexisting implementation, do not assume getLastRow equals the
// last data row in the operational columns: data outside those columns counts.
const rows={
  2:['','','','DATE: 2026-11-24'],
  9500:['', '12:34','Operator','Team arrived','Voice','','op-9500'],
  10000:['','','','','','','','metadata only']
};
for(const [last,expected,maxCells,maxCalls] of [
  [1,1,0,0],
  [9500,9500,256*6,1],
  [10000,9500,768*6,2],
  [100000,9500,100000*6,31]
]){
  const fx=fixture(last,{LOG:rows});const code=load(source,fx);
  const got=code.bvlEnd_(fx.env.SpreadsheetApp.openById().getSheetByName('LOG'),2,2,6);
  assert.equal(got,expected,'last '+last);
  const calls=fx.stats.calls.filter(x=>x.sheet==='LOG');
  assert.ok(calls.every(x=>x.height<=4096),'unbounded full-grid range');
  assert.ok(fx.stats.cells<=maxCells,'too many cells read, last '+last+' cells '+fx.stats.cells);
  assert.ok(calls.length<=maxCalls,'too many network-sized reads '+calls.length);
}
// Cover all-empty and mixed empty/whitespace cells without changing end logic.
const empty=fixture(600,{LOG:{600:['','','','','','','','outside-only']}});
let v=load(source,empty);
assert.equal(v.bvlEnd_(empty.env.SpreadsheetApp.openById().getSheetByName('LOG'),2,2,6),1);
for(let seed=1;seed<=75;seed++) {
  const values={};let last=300+seed*7,expected=1;
  for(let j=0;j<24;j++){
    let r=((seed*131+j*43)%last)+1;
    let c=(seed+j)%8;
    let a=values[r]||Array(8).fill('');a[c]=(j%3===0?'  ':(j%2?'DATA':'0'));values[r]=a;
    if(r>=2 && c>=1 && c<=6 && a[c].trim())expected=Math.max(expected,r);
  }
  const fx=fixture(last,{LOG:values});const code=load(source,fx);
  const got=code.bvlEnd_(fx.env.SpreadsheetApp.openById().getSheetByName('LOG'),2,2,6);
  assert.equal(got,expected,'case seed '+seed);
}
// Compare the entire JSON data projection on old vs candidate code. A long
// LOG read should return identical remote row IDs/text/media/history fields.
const fullRows={2:['','','','DATE: 2026-11-24'],10000:[1,'12:34','Operator','Synthetic event','Voice','','op-test-1','']};
const newFX=fixture(10000,{LOG:fullRows});
const now=load(source,newFX);
const args=['FOLDER_00000000001','TEMPLATE_00000001','DOC_00000000000001','abcdef123456'];
const golden=JSON.parse(fs.readFileSync(root+'/tests/fixtures/v080a-read-v0721-golden.json','utf8'));
const after=now.bvlRead_(...args);
eq(golden,after,'read payload must remain identical to the v0.7.2.1 golden fixture');
assert.equal(after.data.LOG.length,1);
assert.equal(after.data.LOG[0].cells[6],'op-test-1');
assert.ok(newFX.stats.cells<6000,
  'large scan not bounded: '+newFX.stats.cells+' cells vs >60000 baseline LOG scan');
assert.equal(newFX.stats.driveCalls,1,'candidate should reuse authorized Drive handle');
assert.equal(newFX.stats.sheets.length,7,'duplicate tab lookups not removed');
const entries=newFX.logs.map(x=>JSON.parse(x));
for(const stage of ['document_opened','info_schema_loaded','log_end_scanned','log_values_loaded',
    'log_richtext_loaded','history_loaded','team_tech_loaded','read_complete']){
  const event=entries.find(x=>x.stage===stage);
  assert.ok(event,'missing read phase '+stage);
  assert.ok(Number.isFinite(event.phase_ms)&&event.phase_ms>=0,'phase duration missing: '+stage);
  assert.equal(event.request_id,'abcdef123456');
}
for(const sensitive of ['DOC_00000000000001','Synthetic event','Synthetic Test','Operator']) {
  assert.ok(!newFX.logs.join('\n').includes(sensitive),'private data leaked to logs: '+sensitive);
}
console.log('PASS v0.8.0-A: bounded backwards scanning, semantic equivalence, fewer Google lookups, phase timing privacy.');
