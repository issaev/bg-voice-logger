// Mock integration test: private incident photo folder, Sheets thumbnail,
// persistent photo index and authenticated-read bridge. No Google services are called.
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const source = fs.readFileSync(__dirname + '/../apps-script/Code.gs', 'utf8');
const rootId = 'FOLDERROOTABCDEFGHIJK';
const docId = 'DOCUMENTABCDEFGHIJKLMN012345';
const templateId = 'TEMPLATEABCDEFGHIJKLMN0123';
const photoFiles = new Map();
const folderMap = new Map();
let folderCount = 0;
let fileCount = 0;
class Range {
  constructor(sh,row,col,n=1,m=1) {Object.assign(this,{sh,row,col,n,m});}
  getRow(){return this.row;}
  getColumn(){return this.col;}
  getDisplayValues(){return Array.from({length:this.n},(_,i)=>Array.from({length:this.m},(_,j)=>String(this.sh.get(this.row+i,this.col+j)||'')));}
  getValues(){return this.getDisplayValues();}
  getDisplayValue(){return String(this.sh.get(this.row,this.col)||'');}
  setValue(x){this.sh.set(this.row,this.col,x);return this;}
  setValues(rows){rows.forEach((r,i)=>r.forEach((x,j)=>this.sh.set(this.row+i,this.col+j,x)));return this;}
  getRichTextValue(){return {getText:()=>this.getDisplayValue(),getRuns:()=>[]};}
  getRichTextValues(){return Array.from({length:this.n},(_,i)=>Array.from({length:this.m},(_,j)=>new Range(this.sh,this.row+i,this.col+j).getRichTextValue()));}
  setNote(note){this.sh.notes.set(this.row+':'+this.col,note);return this;}
  setBackground(){return this;}setFontWeight(){return this;}setFontLine(){return this;}setBorder(){return this;}setNumberFormat(){return this;}
  clearContent(){this.sh.set(this.row,this.col,'');return this;}
  createTextFinder(value){const r=this;return {matchEntireCell(){return this;},findNext(){for(let i=0;i<r.n;i++)for(let j=0;j<r.m;j++){
    if(String(r.sh.get(r.row+i,r.col+j))===String(value))return {getRow:()=>r.row+i};
  }return null;}};}
}
class Sheet {
  constructor(name){this.name=name;this.grid=Array.from({length:220},()=>Array(16).fill(''));this.images=[];this.notes=new Map();this.hidden=false;this.rowHeights=new Map();}
  get(r,c){return this.grid[r-1]&&this.grid[r-1][c-1]||'';}
  set(r,c,v){this.grid[r-1][c-1]=v;}
  getRange(a,b,n,m){if(typeof a==='string'){
    const match=a.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);assert.ok(match,a);
    const col=match[1].split('').reduce((v,x)=>v*26+x.charCodeAt(0)-64,0),row=Number(match[2]);
    const colEnd=match[3]?match[3].split('').reduce((v,x)=>v*26+x.charCodeAt(0)-64,0):col;
    return new Range(this,row,col,match[4]?Number(match[4])-row+1:1,colEnd-col+1);
  }return new Range(this,a,b,n,m);}
  getLastColumn(){return this.grid.reduce((max,row)=>Math.max(max,row.reduce((last,v,i)=>v!==''&&v!==null?i+1:last,0)),0);}
  getLastRow(){for(let r=this.grid.length;r>=1;r--)if(this.grid[r-1].some(x=>x!==''&&x!==null))return r;return 0;}
  getMaxRows(){return this.grid.length;}
  insertRowsAfter(at,n){for(let i=0;i<n;i++)this.grid.splice(at,0,Array(16).fill(''));}
  appendRow(r){const row=this.getLastRow()+1;r.forEach((x,i)=>this.set(row,i+1,x));return this;}
  hideColumns(){}hideSheet(){this.hidden=true;}
  getImages(){return this.images;}
  getRowHeight(row){return this.rowHeights.get(row)||25;}
  setRowHeight(row,px){this.rowHeights.set(row,px);}
  setColumnWidth(col,px){this.lastColumnWidth={col,px};}
  insertImage(blob,col,row,x,y){const item={blob,col,row,x,y,title:'',height:0,width:0,
    anchor:{row,col},getAnchorCell(){return new Range(this.sheet,this.anchor.row,this.anchor.col);},sheet:this,
    setAnchorCell(cell){this.anchor={row:cell.getRow(),col:cell.getColumn()};return this;},getAltTextTitle(){return this.title;},
    setWidth(w){this.width=w;return this;},setHeight(h){this.height=h;return this;},
    setAltTextTitle(t){this.title=t;return this;},setAltTextDescription(d){this.description=d;return this;}};
    this.images.push(item);return item;}
}
const sheets={};for(const name of ['LOG','INFO','TECH','TEAM'])sheets[name]=new Sheet(name);
sheets.LOG.set(1,1,'No');sheets.LOG.set(1,2,'Time');sheets.LOG.set(1,4,'Log');sheets.LOG.set(2,4,'ДАТА: 11.11.2026');
const ss={getId:()=>docId,getUrl:()=>`https://docs.google.com/spreadsheets/d/${docId}`,getSheetByName:n=>sheets[n]||null,
  insertSheet:n=>(sheets[n]=new Sheet(n))};
const name='2026.11.11 - ДКА - Издирване - Витоша';
const docFile={getId:()=>docId,getName:()=>name,getUrl:()=>ss.getUrl(),getMimeType:()=> 'application/vnd.google-apps.spreadsheet',isTrashed:()=>false,
  getParents:()=>iter([{getId:()=>rootId}])};
const templateFile={getMimeType:()=> 'application/vnd.google-apps.spreadsheet'};
function iter(items){let i=0;return {hasNext:()=>i<items.length,next:()=>items[i++]};}
const root={getId:()=>rootId,getName:()=> 'Root',getFoldersByName:search=>iter([...folderMap.values()].filter(f=>f.getName()===search)),
  createFolder(folderName){const id='FOLDERIMAGE'+String(++folderCount).padStart(20,'0'),folderFiles=[];
    const folder={getId:()=>id,getName:()=>folderName,getDescription:()=>folder.description||'',setName(n){folderName=n;},setDescription(d){folder.description=d;},
      getParents:()=>iter([{getId:()=>rootId}]),isTrashed:()=>false,
      getFilesByName:n=>iter(folderFiles.filter(f=>f.getName()===n&&!f.isTrashed())),
      createFile(blob){const fileId='PHOTOFILE'+String(++fileCount).padStart(25,'0');const file={getId:()=>fileId,getName:()=>blob.name,
        getUrl:()=>`https://drive.google.com/file/d/${fileId}/view`,getSize:()=>blob.getBytes().length,getBlob:()=>blob,isTrashed(){return !!this.trashed;},setTrashed(v){this.trashed=!!v;},
        getParents:()=>iter([{getId:()=>id}])};
        photoFiles.set(fileId,file);folderFiles.push(file);return file;},
      get fileCount(){return folderFiles.length;}}
    folderMap.set(id,folder);return folder;}};
const props={};
const ctx={console,Date,JSON,String,Number,Array,Math,Error,
  MimeType:{GOOGLE_SHEETS:'application/vnd.google-apps.spreadsheet'},
  Utilities:{base64Decode:encoded=>Buffer.from(encoded,'base64'),base64Encode:bytes=>Buffer.from(bytes).toString('base64'),
    newBlob:(bytes,mime,name)=>({name,mime,getBytes:()=>Buffer.from(bytes),getContentType:()=>mime}),
    formatDate:(date,tz,format)=>{
      const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).map(x=>[x.type,x.value]));
      return format.replace('yyyy',parts.year).replace('MM',parts.month).replace('dd',parts.day).replace('HH',parts.hour).replace('mm',parts.minute);
    }},
  DriveApp:{getFolderById:id=>id===rootId?root:folderMap.get(id),
    getFileById:id=>id===docId?docFile:id===templateId?templateFile:photoFiles.get(id)},
  SpreadsheetApp:{openById:id=>id===docId?ss:null,flush(){},BorderStyle:{SOLID_MEDIUM:'x'}},
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k],setProperty:(k,v)=>{props[k]=v;}})}
};
vm.createContext(ctx);vm.runInContext(source,ctx);
const logId='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const logResult=ctx.bvlLog_(ss,{kind:'log',op_id:logId,author:'Екип А',source:'voice',text:'Екипът пристигна',event_at:'2026-11-11T14:32:00+02:00'});
assert.equal(logResult.ok,true);assert.equal(folderCount,0,'No folder before first photo');
const firstPhoto='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const preview=Buffer.from('ffd8ff'+ '11'.repeat(100),'hex');
const original=Buffer.from('ffd8ff'+ '22'.repeat(900),'hex');
const upload={op_id:firstPhoto,log_op_id:logId,mime:'image/jpeg',base64:original.toString('base64'),preview_base64:preview.toString('base64'),filename:'team.jpg'};
const first=ctx.bvlAttachPhoto_(rootId,ss,upload);
assert.equal(first.ok,true);assert.equal(first.row,logResult.row);assert.equal(folderCount,1);
const folder=folderMap.get(first.folder_id);
assert.equal(folder.getName(),name,'Incident folder must have exact spreadsheet name');
assert.equal(folder.getDescription(),'BVLOG_PHOTOS_FOR:'+docId);
assert.equal(folder.fileCount,2,'Stores original and preview in same incident folder');
assert.equal(sheets.LOG.images.length,1,'One private thumbnail attached to column F');
assert.equal(sheets.LOG.images[0].col,6);assert.equal(sheets.LOG.images[0].row,logResult.row);
assert.ok(sheets.LOG.get(logResult.row,6).includes('📷'));
assert.equal(sheets.LOG.notes.get(logResult.row+':6').includes('1 снимки'),true);
const dup=ctx.bvlAttachPhoto_(rootId,ss,upload);
assert.equal(dup.deduplicated,true);assert.equal(folder.fileCount,2);assert.equal(sheets.LOG.images.length,1);
const secondPhoto='cccccccc-cccc-4ccc-aaaa-cccccccccccc';
const second=ctx.bvlAttachPhoto_(rootId,ss,{...upload,op_id:secondPhoto});
assert.equal(second.count,2);assert.equal(folderCount,1);assert.equal(folder.fileCount,4);
assert.equal(sheets.LOG.images.length,1,'Only the first image is shown in Sheets cell F');
const fetched=ctx.bvlRead_(rootId,templateId,docId);
const event=fetched.data.LOG.find(x=>x.row===logResult.row);
assert.ok(event);assert.equal(event.photos.length,2);assert.equal(event.photos[0].id,firstPhoto);
const seen=ctx.bvlPhotoRead_(rootId,templateId,{doc_id:docId,photo_id:firstPhoto,variant:'preview'});
assert.equal(seen.ok,true);assert.equal(seen.mime,'image/jpeg');assert.equal(seen.base64,preview.toString('base64'));
const full=ctx.bvlPhotoRead_(rootId,templateId,{doc_id:docId,photo_id:firstPhoto,variant:'original'});
assert.equal(full.base64,original.toString('base64'));
const denied=ctx.bvlPhotoRead_(rootId,templateId,{doc_id:docId,photo_id:'dddddddd-dddd-4ddd-aaaa-dddddddddddd'});
assert.equal(denied.code,'photo_not_found');
// A manual row without a hidden LOG UUID also gets a persistent anchor ID.
sheets.LOG.set(4,2,'15:17');sheets.LOG.set(4,4,'Събитие, добавено ръчно');
const existing='ffffffff-ffff-4fff-aaaa-ffffffffffff';
const manual=ctx.bvlAttachPhoto_(rootId,ss,{...upload,op_id:existing,log_op_id:'',target_row:4,
  expected_time:'15:17',expected_text:'Събитие, добавено ръчно'});
assert.equal(manual.ok,true);assert.equal(folderCount,1);
assert.equal(sheets.LOG.get(4,7),existing,'Assign hidden stable anchor to manual LOG row');
const moved=ctx.bvlRead_(rootId,templateId,docId);
assert.equal(moved.data.LOG.find(x=>x.row===4).photos.length,1);
// Simulate a sort that moves the original LOG record from row 3 to row 8.
for(let c=1;c<=7;c++){sheets.LOG.set(8,c,sheets.LOG.get(3,c));sheets.LOG.set(3,c,'');}
const sorted=ctx.bvlRead_(rootId,templateId,docId);
assert.equal(sorted.data.LOG.find(x=>x.row===8).photos.length,2,'Photo association follows stable LOG ID after sorting');
assert.equal(sheets.LOG.images[0].getAnchorCell().getRow(),3,'Read must not mutate spreadsheet image anchors');
const noTarget=ctx.bvlAttachPhoto_(rootId,ss,{...upload,op_id:'eeeeeeee-eeee-4eee-aaaa-eeeeeeeeeeee',log_op_id:'11111111-1111-4111-8111-111111111111'});
assert.equal(noTarget.code,'waiting_for_log');assert.equal(folderCount,1);
console.log('PASS: lazy incident folder naming, original + thumbnail, F anchored image, multi-photo count, retries, private image read, manual rows, sort rebinding and target validation.');

// v0.6.0 - edit/annul with stable ID, private chunked audio and audit history.
const audioId='12121212-1212-4121-8121-121212121212';
const voice=Buffer.from('a'.repeat(270000));
const firstChunk=voice.subarray(0,262144),secondChunk=voice.subarray(262144);
const base={kind:'audio_part',op_id:audioId,target_id:logId,target_kind:'log',mime:'audio/webm',part_count:2,doc_id:docId,author:'Екип А'};
let part1=ctx.bvlOperation_(rootId,templateId,{...base,part_index:0,base64:firstChunk.toString('base64')});
assert.equal(part1.ok,true);assert.equal(part1.complete,false);
let part2=ctx.bvlOperation_(rootId,templateId,{...base,part_index:1,base64:secondChunk.toString('base64')});
assert.equal(part2.complete,true);assert.equal(part2.size,voice.length);
assert.equal(folderCount,2,'Audio gets separate per-incident folder on first upload only');
const reupload=ctx.bvlOperation_(rootId,templateId,{...base,part_index:0,base64:firstChunk.toString('base64')});
assert.equal(reupload.deduplicated,true);assert.equal(reupload.complete,true);
const audio=ctx.bvlAudioRead_(rootId,templateId,{doc_id:docId,audio_id:audioId,offset:0});
assert.equal(audio.ok,true);assert.equal(audio.mime,'audio/webm');assert.equal(audio.size,voice.length);
const secondRead=ctx.bvlAudioRead_(rootId,templateId,{doc_id:docId,audio_id:audioId,offset:audio.next});
assert.equal(secondRead.ok,true);
assert.equal(Buffer.concat([Buffer.from(audio.base64,'base64'),Buffer.from(secondRead.base64,'base64')]).toString(),voice.toString());
assert.equal(ctx.bvlAudioRead_(rootId,templateId,{doc_id:docId,audio_id:'11111111-1111-4111-8111-111111111111'}).code,'audio_not_found');
const saved=ctx.bvlRead_(rootId,templateId,docId);
assert.equal(saved.data.LOG.find(e=>e.cells[6]===logId).audio.id,audioId);
const editOp='22222222-2222-4222-8222-222222222222';
const edit=ctx.bvlOperation_(rootId,templateId,{kind:'log_change',op_id:editOp,doc_id:docId,author:'Координатор',
 action:'edit',log_op_id:logId,target_row:3,expected_text:'Екипът пристигна',text:'Екипът е на сектор 2'});
assert.equal(edit.ok,true);assert.equal(edit.row,8,'Stable ID follows manual row movement');
assert.equal(sheets.LOG.get(8,4),'Екипът е на сектор 2');
const conflict=ctx.bvlOperation_(rootId,templateId,{kind:'log_change',op_id:'33333333-3333-4333-8333-333333333333',doc_id:docId,author:'Друг оператор',
 action:'edit',log_op_id:logId,expected_text:'Екипът пристигна',text:'Заменен запис'});
assert.equal(conflict.code,'conflict','Concurrent stale edits must never overwrite newer text');
const cancel=ctx.bvlOperation_(rootId,templateId,{kind:'log_change',op_id:'44444444-4444-4444-8444-444444444444',doc_id:docId,
 author:'Координатор',action:'cancel',log_op_id:logId,expected_text:'Екипът е на сектор 2'});
assert.equal(cancel.ok,true);assert.equal(sheets.LOG.get(8,8),'cancelled');
assert.equal(ctx.bvlRead_(rootId,templateId,docId).data.LOG.find(e=>e.cells[6]===logId).status,'cancelled');
assert.equal(ctx.bvlRead_(rootId,templateId,docId).data.LOG.find(e=>e.cells[6]===logId).history.length,2);
assert.equal(ctx.bvlRead_(rootId,templateId,docId).data.LOG.find(e=>e.cells[6]===logId).audio.id,audioId,'Annulment preserves original audio');
console.log('PASS v0.6.0: chunked audio upload, replay safety, folder isolation, authenticated read, row-stable LOG edit, conflicts, annulment and audit history.');
const fieldAudioId='55555555-5555-4555-8555-555555555555';
const fieldData=Buffer.from('FIELDVOICE'.repeat(150));
const fieldStore=ctx.bvlOperation_(rootId,templateId,{kind:'audio_part',op_id:fieldAudioId,doc_id:docId,
 target_id:'66666666-6666-4666-8666-666666666666',target_kind:'field',field_sheet:'INFO',field_row:4,field_col:'B',
 mime:'audio/mp4',part_count:1,part_index:0,base64:fieldData.toString('base64'),author:'Координатор'});
assert.equal(fieldStore.complete,true);
const fieldView=ctx.bvlRead_(rootId,templateId,docId);
assert.equal(fieldView.data.FIELD_AUDIO['INFO:B4'][0].id,fieldAudioId);
const fieldRead=ctx.bvlAudioRead_(rootId,templateId,{doc_id:docId,audio_id:fieldAudioId,offset:0});
assert.equal(fieldRead.mime,'audio/mp4');assert.equal(Buffer.from(fieldRead.base64,'base64').toString(),fieldData.toString());
console.log('PASS v0.6.0: field dictation original audio is indexed to INFO B4 and privately readable.');
