// Pure mock integration checks for Apps Script range behavior (no Google writes).
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const code=fs.readFileSync(__dirname+'/../apps-script/Code.gs','utf8');
class Range {
  constructor(sh,r,c,n,m){this.sh=sh;this.r=r;this.c=c;this.n=n;this.m=m;}
  getValues(){return Array.from({length:this.n},(_,i)=>Array.from({length:this.m},(_,j)=>this.sh.get(this.r+i,this.c+j)));}
  getDisplayValues(){return this.getValues().map(row=>row.map(x=>x==null?'':String(x)));}
  getDisplayValue(){return String(this.sh.get(this.r,this.c)||'');}
  setValues(grid){for(let i=0;i<this.n;i++)for(let j=0;j<this.m;j++)this.sh.set(this.r+i,this.c+j,grid[i][j]);return this;}
  setValue(val){this.sh.set(this.r,this.c,val);return this;}
  clearContent(){for(let i=0;i<this.n;i++)for(let j=0;j<this.m;j++)this.sh.set(this.r+i,this.c+j,'');return this;}
  getRichTextValue(){const t=this.getDisplayValue();return this.sh.rich&&this.sh.rich[this.r+':'+this.c]||{getText:()=>t,getRuns:()=>[]};}
  getRichTextValues(){return Array.from({length:this.n},(_,i)=>Array.from({length:this.m},(_,j)=>new Range(this.sh,this.r+i,this.c+j,1,1).getRichTextValue()));}
  setRichTextValue(val){this.sh.set(this.r,this.c,val.getText());this.sh.rich[this.r+':'+this.c]=val;return this;}
  setBackground(){return this;}setFontWeight(){return this;}setBorder(){return this;}setNumberFormat(){return this;}
  createTextFinder(s){const range=this;return {matchEntireCell(){return this;},findNext(){for(let i=0;i<range.n;i++)for(let j=0;j<range.m;j++)if(String(range.sh.get(range.r+i,range.c+j))===String(s))return {getRow:()=>range.r+i};return null;}};}
}
class Sheet {
  constructor(name){this.name=name;this.grid=Array.from({length:1000},()=>Array(30).fill(''));this.hidden=false;this.rich={};}
  set(r,c,v){this.grid[r-1][c-1]=v;}get(r,c){return this.grid[r-1]?.[c-1]??'';}
  getRange(a,b,n,m){let r,c;if(typeof a==='string'){const x=a.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);if(!x)throw Error('bad A1 '+a);c=x[1].split('').reduce((v,t)=>v*26+t.charCodeAt(0)-64,0);r=Number(x[2]);n=x[4]?Number(x[4])-r+1:1;const to=x[3]?x[3].split('').reduce((v,t)=>v*26+t.charCodeAt(0)-64,0):c;m=to-c+1;}else{r=a;c=b;n=n||1;m=m||1;}return new Range(this,r,c,n,m);}
  getLastRow(){let end=0;for(let i=0;i<this.grid.length;i++)if(this.grid[i].some(v=>v!==''&&v!==null))end=i+1;return end;}
  getMaxRows(){return this.grid.length;}
  getMaxColumns(){return 30;}
  insertRowsAfter(idx,count){for(let i=0;i<count;i++)this.grid.splice(idx,0,Array(30).fill(''));}
  hideColumns(){}
  appendRow(row){let r=this.getLastRow()+1;row.forEach((v,i)=>this.set(r,i+1,v));}
  hideSheet(){this.hidden=true;}
}
function makeSS(){const obj={};for(const n of ['LOG','INFO','TEAM','TECH'])obj[n]=new Sheet(n);
  obj.LOG.set(1,1,'#');obj.LOG.set(1,2,'Time');obj.LOG.set(1,4,'Info');obj.LOG.set(2,4,'\u0414\u0410\u0422\u0410: 10.11.2026');
  for(let i=3;i<=110;i++)obj.LOG.set(i,1,i-2);
  obj.INFO.set(3,1,'Action');obj.INFO.set(3,2,'Old');obj.INFO.set(5,1,'Lead');obj.INFO.set(5,2,'Ivan');
  obj.TEAM.set(2,1,'Number');obj.TECH.set(2,1,'Number');
  return {getSheetByName:n=>obj[n]||null,insertSheet:n=>(obj[n]=new Sheet(n)),sheets:obj};
}
const props = {BVLOG_SHARED_SECRET:'X'.repeat(48)};
const copies = {};
const folderId = 'FOLDERIDENTIFIER123456789';
const templateId = 'TEMPLATEIDENTIFIER1234567';
const copiesMade=[];
const mediaFolders={};
const folder = {getName:()=> 'Test folder',getFilesByName:(n)=>({hasNext:()=>copiesMade.some(x=>x.name===n)}),
  getFoldersByName:(n)=>{const folder=mediaFolders[n];return {hasNext:()=>!!folder,next:()=>folder};},
  createFolder:(n)=>{const files=[];const d={files,getFilesByName:(name)=>{const matches=files.filter(x=>x.getName()===name);return {hasNext:()=>!!matches.length,next:()=>matches[0]};},createFile:(blob)=>{const index=files.length+1;const file={getId:()=>n+index,getName:()=>blob.name,getUrl:()=>`https://drive.google.com/file/d/IMAGE${index}/view`};files.push(file);return file;}};mediaFolders[n]=d;return d;}};
const template = {getMimeType:()=> 'application/vnd.google-apps.spreadsheet', makeCopy(name,dest){assert.equal(dest,folder);const id='COPYDOCUMENT'+String(copiesMade.length+1).padStart(20,'0');const ss=makeSS();ss.getId=()=>id;ss.getUrl=()=> 'https://docs.google.com/spreadsheets/d/'+id;copies[id]=ss;const file={id,name,getId:()=>id,getName:()=>name,getUrl:()=>ss.getUrl(),getMimeType:()=> 'application/vnd.google-apps.spreadsheet',isTrashed:()=>false,getParents:()=>{let i=0;return {hasNext:()=>i++<1,next:()=>({getId:()=>folderId})};},setTrashed(){}};copiesMade.push(file);return file;}};
const ctx={
  console, Date, JSON, String, Number, Array, Math, Error,
  DriveApp:{getFolderById:()=>folder,getFileById:id=>id===templateId?template:copiesMade.find(x=>x.id===id)},
  Utilities:{newBlob(data,mime,name){return {data,mime,name};},base64Decode:b64=>Buffer.from(b64,'base64'),formatDate(d,tz,fmt){const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d).map(p=>[p.type,p.value]));return fmt.replace('yyyy',parts.year).replace('MM',parts.month).replace('dd',parts.day).replace('HH',parts.hour).replace('mm',parts.minute);}},
  SpreadsheetApp:{BorderStyle:{SOLID_MEDIUM:'solid'},flush(){},openById(id){return copies[id];},
   newRichTextValue(){let text='',links=[];return {setText(t){text=t;return this;},setLinkUrl(a,b,url){links.push({start:a,end:b,url});return this;},build(){return {getText:()=>text,getRuns:()=>links.map(x=>({getLinkUrl:()=>x.url,getStartIndex:()=>x.start,getEndIndex:()=>x.end,getText:()=>text.slice(x.start,x.end)}))};}};}},
  MimeType:{GOOGLE_SHEETS:'application/vnd.google-apps.spreadsheet'},
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k],setProperty:(k,v)=>{props[k]=v;}})},
  ContentService:{MimeType:{JSON:'JSON'},createTextOutput(txt){return {text:txt,setMimeType(){return this;}}}},
  LockService:{getScriptLock(){return {tryLock(){return true;},releaseLock(){}}}}
};
vm.createContext(ctx);vm.runInContext(code,ctx);
const ss=makeSS();
const p1={kind:'log',op_id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',author:'Operator',text:'Alpha at base',event_at:'2026-11-10T14:32:00+02:00'};
const r1=ctx.bvlLog_(ss,p1);assert.equal(r1.ok,true);assert.equal(r1.row,3);assert.equal(ss.sheets.LOG.get(3,1),1);assert.equal(ss.sheets.LOG.get(3,4),'Alpha at base');assert.equal(ss.sheets.LOG.get(3,5),'\u0413\u043b\u0430\u0441 \u043f\u0440\u0435\u0437 \u043f\u0440\u0438\u043b\u043e\u0436\u0435\u043d\u0438\u0435\u0442\u043e');
const p2={kind:'log',op_id:'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',author:'Operator',text:'Another day',event_at:'2026-11-11T00:12:00+02:00'};
const r2=ctx.bvlLog_(ss,p2);assert.equal(r2.row,5);assert.equal(ss.sheets.LOG.get(4,1),'');assert.equal(ss.sheets.LOG.get(4,4),'\u0414\u0410\u0422\u0410:'+' 11.11.2026');assert.equal(ss.sheets.LOG.get(5,1),2);
const p3={kind:'log',op_id:'cccccccc-cccc-4ccc-cccc-cccccccccccc',author:'Operator',text:'Same day',event_at:'2026-11-11T00:15:00+02:00'};
const r3=ctx.bvlLog_(ss,p3);assert.equal(r3.row,6);assert.equal(ss.sheets.LOG.get(6,1),3);
let changed=ctx.bvlField_(ss,{sheet:'INFO',row:5,col:'B',base:'Ivan',value:'Petar'});assert.equal(changed.ok,true);assert.equal(ss.sheets.INFO.get(5,2),'Petar');
changed=ctx.bvlField_(ss,{sheet:'INFO',row:5,col:'B',base:'Ivan',value:'Maria'});assert.equal(changed.ok,false);assert.equal(changed.code,'conflict');assert.equal(ss.sheets.INFO.get(5,2),'Petar');
const row=ctx.bvlAddRow_(ss,{sheet:'TEAM',op_id:'dddddddd-dddd-4ddd-dddd-dddddddddddd',values:['Some Name','0899','Car','Base','10:00','','']});assert.equal(row.ok,true);assert.equal(row.row,3);assert.equal(ss.sheets.TEAM.get(3,2),'Some Name');assert.equal(ss.sheets.TEAM.get(3,9),'dddddddd-dddd-4ddd-dddd-dddddddddddd');
const meta=ctx.bvlPrepare_(ss);ctx.bvlStamp_(meta,p1,r1);assert.equal(ctx.bvlDone_(meta,p1.op_id),true);assert.equal(ctx.bvlDone_(meta,'ffffffff-ffff-4fff-ffff-ffffffffffff'),false);
const actionType='\u0418\u0437\u0434\u0438\u0440\u0432\u0430\u043d\u0435';
const created=ctx.bvlCreate_(folderId,templateId,{type:actionType,place:'gr. Samokov',create_id:'ffffffff-ffff-4fff-ffff-ffffffffffff'});
assert.equal(created.ok,true);assert.ok(/^\d{4}\.\d{2}\.\d{2} - /.test(created.document.name));
assert.ok(created.document.name.includes('\u0414\u041a\u0410'));
assert.equal(copies[created.document.id].sheets.INFO.get(3,2),actionType);
assert.equal(copies[created.document.id].sheets.INFO.get(4,2),'');
assert.ok(copies[created.document.id].sheets.LOG.get(2,4).startsWith('\u0414\u0410\u0422\u0410: '));
const again=ctx.bvlCreate_(folderId,templateId,{type:actionType,place:'gr. Samokov',create_id:'ffffffff-ffff-4fff-ffff-ffffffffffff'});
assert.equal(again.document.id,created.document.id);assert.equal(copiesMade.length,1);
// New photo management is covered by test-media-v050.js with Drive/image mocks.
const imageLog='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const copySS=copies[created.document.id];
const createdLog=ctx.bvlLog_(copySS,{kind:'log',source:'text',op_id:imageLog,text:'Manual entry',author:'Test',event_at:'2026-11-10T14:32:00+02:00'});
assert.equal(copySS.sheets.LOG.get(createdLog.row,5),'През приложението');
assert.equal(ss.sheets.LOG.get(3,5),'Глас през приложението');
console.log('PASS: new file title and type, GPS B4 deliberately empty, creation retry idempotency.');
console.log('PASS: date transitions, serials, voice/text source markers, append placement, field conflicts, TEAM insert, idempotency metadata.');
