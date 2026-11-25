/**
 * BG Voice Logger - Google Apps Script bridge v0.8.0 (draft).
 * Deploy as Web App: Execute as Me, access Anyone. HTTPS access is protected
 * by a long random shared secret kept only in WordPress and Script Properties.
 * Never put this secret into browser JavaScript or a public spreadsheet.
 */
const BVL = {
  TZ: 'Europe/Sofia',
  MIME: 'application/vnd.google-apps.spreadsheet',
  DKA: '\u0414\u041a\u0410',
  DATE: '\u0414\u0410\u0422\u0410:',
  VOICE: '\u0413\u043b\u0430\u0441 \u043f\u0440\u0435\u0437 \u043f\u0440\u0438\u043b\u043e\u0436\u0435\u043d\u0438\u0435\u0442\u043e',
  TEXT: '\u041f\u0440\u0435\u0437 \u043f\u0440\u0438\u043b\u043e\u0436\u0435\u043d\u0438\u0435\u0442\u043e',
  PHOTOS: '__BVLOG_PHOTOS',
  AUDIOS: '__BVLOG_AUDIO',
  HISTORY: '__BVLOG_HISTORY',
  OPS: '__BVLOG_OPS',
  TYPES: [
    '\u041f\u043e\u0436\u0430\u0440',
    '\u041d\u0430\u0432\u043e\u0434\u043d\u0435\u043d\u0438\u0435',
    '\u0418\u0437\u0434\u0438\u0440\u0432\u0430\u043d\u0435',
    '\u0414\u0440\u0443\u0433\u043e \u0431\u0435\u0434\u0441\u0442\u0432\u0438\u0435',
    '\u0422\u0440\u0435\u043d\u0438\u0440\u043e\u0432\u043a\u0430'
  ]
};

// Emit only a short random request identifier, a fixed action name, phase and
// elapsed time. Never log payloads, document IDs, names, secrets or transcripts.
let bvlTraceBuffer_=null;
function bvlTrace_(requestId, action, stage, started, phaseMs) {
  const rid=/^[a-f0-9]{12}$/.test(String(requestId||'')) ? String(requestId) : 'untracked';
  const act=['read','list','operation','create','audio_read','photo_read','ping'].includes(action)
    ? action : 'other';
  const safeStage=/^[a-z0-9_]{1,48}$/.test(String(stage||'')) ? stage : 'untracked';
  const report={request_id:rid,action:act,stage:safeStage,
    elapsed_ms:Math.max(0,Date.now()-started)};
  if(Number.isFinite(phaseMs) && phaseMs>=0)report.phase_ms=Math.floor(phaseMs);
  if(bvlTraceBuffer_&&rid===bvlTraceBuffer_.request_id&&safeStage!=='untracked'){
    const phases=bvlTraceBuffer_.phases_ms;
    if(Object.keys(phases).length<40){
      if(safeStage==='lock_acquired'||safeStage==='lock_busy')phases.lock_wait=Math.min(360000,report.elapsed_ms);
      else if(Number.isFinite(report.phase_ms))phases[safeStage]=Math.min(360000,report.phase_ms);
    }
  }
  try { console.log(JSON.stringify(report)); } catch(ignore) {}
}

// A phase represents the time spent since the previous marker, in addition to
// cumulative elapsed time. Each tracer is local to one Apps Script execution.
// Its stage names are fixed code literals; never attach user or sheet content.
function bvlPhaseTracer_(requestId, action) {
  const started=Date.now();
  let previous=started;
  return function(stage) {
    const now=Date.now();
    bvlTrace_(requestId,action,stage,started,Math.max(0,now-previous));
    previous=now;
  };
}

function doPost(e) {
  const start=Date.now();
  let traceId='', traceAction='other';
  bvlTraceBuffer_=null;
  let result;
  try {
    const req = JSON.parse(e && e.postData && e.postData.contents || '{}');
    traceId=String(req.request_id||'');
    traceAction=String(req.action||'');
    bvlTrace_(traceId,traceAction,'received',start);
    const expected = PropertiesService.getScriptProperties().getProperty('BVLOG_SHARED_SECRET');
    if (!expected || expected.length < 24 || !req.secret || req.secret !== expected) {
      result = {ok: false, code: 'unauthorized', message: 'Invalid bridge credential.'};
    } else {
      bvlTraceBuffer_={request_id:/^[a-f0-9]{12}$/.test(traceId)?traceId:'untracked',phases_ms:{}};
      result = bvlDispatch_(req);
    }
  } catch (err) {
    result = {ok: false, code: 'script_error', message: String(err && err.message || err).slice(0, 250)};
  } finally {
    bvlTrace_(traceId,traceAction,result&&result.ok===false?'completed_error':'completed',start);
  }
  if(bvlTraceBuffer_&&result&&typeof result==='object'){
    result.diagnostics={request_id:bvlTraceBuffer_.request_id,gas_ms:Math.min(360000,Math.max(0,Date.now()-start)),phases_ms:bvlTraceBuffer_.phases_ms};
  }
  bvlTraceBuffer_=null;
  const json=JSON.stringify(result);
  bvlTrace_(traceId,traceAction,'response_serialized',start);
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

// A configured direct-write incident must never receive a legacy GAS
// mutation. The script lock covers both fence checks and legacy writes.
function bvlWriteFence_(docId) {
  const raw=PropertiesService.getScriptProperties().getProperty('BVLOG_DIRECT_WRITE_FENCES');
  if(!raw)return '';
  const map=JSON.parse(raw);
  if(!map||typeof map!=='object'||Array.isArray(map)||Object.keys(map).length>16)
    throw new Error('Invalid direct writer fence configuration.');
  for(const key of Object.keys(map)){
    if(!bvlValidId_(key)||typeof map[key]!=='string'||!/^[A-Za-z0-9_-]{8,64}$/.test(map[key]))
      throw new Error('Invalid direct writer fence configuration.');
  }
  return Object.prototype.hasOwnProperty.call(map,docId)?map[docId]:'';
}

function bvlDispatch_(request) {
  const folderId = bvlValidId_(request.folder_id);
  const templateId = bvlValidId_(request.template_id);
  const payload = request.payload || {};
  if (!folderId || !templateId) return {ok:false, code:'configuration', message:'Invalid folder/template identifier.'};
  const action = String(request.action || '');
  if (action === 'ping') {
    const folder = DriveApp.getFolderById(folderId);
    const template = DriveApp.getFileById(templateId);
    if (template.getMimeType() !== BVL.MIME) throw new Error('Template is not a Google spreadsheet.');
    return {ok:true, folder:folder.getName(), template:template.getName(), version:'0.8.3'};
  }
  if (action === 'list') return bvlList_(folderId, templateId, request.request_id);
  if (action === 'read') return bvlRead_(folderId, templateId, payload.doc_id, request.request_id, payload.tab);
  if (action === 'photo_read') return bvlPhotoRead_(folderId, templateId, payload);
  if (action === 'audio_read') return bvlAudioRead_(folderId, templateId, payload);
  if (action === 'create' || action === 'operation' || action === 'writer_policy') {
    // The write lock is not involved in read operations. Log its wait
    // separately to distinguish busy writes from slow Sheets/Drive calls.
    const requestStart=Date.now();
    bvlTrace_(request.request_id,action,'lock_wait_start',requestStart);
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(8000)) {
      bvlTrace_(request.request_id,action,'lock_busy',requestStart);
      return {ok:false, code:'busy', message:'Google is processing another operator; retry safely.'};
    }
    bvlTrace_(request.request_id,action,'lock_acquired',requestStart);
    let result;
    try {
      if(action==='writer_policy'){
        const docId=bvlValidId_(payload.doc_id);
        bvlDoc_(folderId,templateId,docId);
        return {ok:true,policy:'direct_log_only_v1',fence_rollout:bvlWriteFence_(docId)};
      }
      if(action==='operation'&&bvlWriteFence_(bvlValidId_(payload.doc_id)))
        return {ok:false,code:'writer_fenced',message:'This incident is reserved for the direct LOG writer.'};
      result=action==='create'?bvlCreate_(folderId,templateId,payload,request.request_id):
        bvlOperation_(folderId,templateId,payload,request.request_id);
    } finally { lock.releaseLock(); }
    // Optional real LOG bootstrap, outside the global write lock. A successful
    // create must stay successful even if its initial read fails or is too large.
    if(action==='create'&&result.ok&&payload.bootstrap===true&&!result.deduplicated&&Date.now()-requestStart<8000){
      try{
        const started=Date.now(),initial=bvlRead_(folderId,templateId,result.document.id,request.request_id,'LOG');
        if(initial.ok&&JSON.stringify(initial.data).length<=180000)
          result.bootstrap={id:initial.id,loaded_tabs:initial.loaded_tabs,data:initial.data};
        bvlTrace_(request.request_id,'create','create_bootstrap',started,Date.now()-started);
      }catch(ignore){ /* Client performs its ordinary LOG read. */ }
    }
    return result;
  }
  return {ok:false, code:'unsupported_action', message:'Unsupported bridge action.'};
}
function bvlValidId_(s) { return /^[A-Za-z0-9_-]{15,200}$/.test(String(s||'')) ? String(s) : ''; }
function bvlSafeText_(s, max) {
  return String(s === null || s === undefined ? '' : s).trim().slice(0, max || 3000);
}
function bvlCell_(s) {
  const x = bvlSafeText_(s, 3000);
  return /^[=+@]/.test(x) ? "'" + x : x;
}
function bvlDate_(d) { return Utilities.formatDate(d, BVL.TZ, 'dd.MM.yyyy'); }
function bvlISODate_(d) { return Utilities.formatDate(d, BVL.TZ, 'yyyy.MM.dd'); }
function bvlTime_(d) { return Utilities.formatDate(d, BVL.TZ, 'HH:mm'); }
/** Validate a calendar-only incident date without timezone conversions. */
function bvlIncidentDate_(raw) {
  const input=String(raw===null||raw===undefined?'':raw);
  if(input===''){
    const now=new Date();
    return {filename:bvlISODate_(now),display:bvlDate_(now)};
  }
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if(!match)throw new Error('Invalid incident date: expected YYYY-MM-DD.');
  const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
  const d=new Date(Date.UTC(year,month-1,day));
  if(d.getUTCFullYear()!==year||d.getUTCMonth()!==month-1||d.getUTCDate()!==day)
    throw new Error('Invalid incident calendar day.');
  return {filename:match[1]+'.'+match[2]+'.'+match[3],display:match[3]+'.'+match[2]+'.'+match[1]};
}
function bvlDoc_(folderId, templateId, docId, metadata) {
  if (!bvlValidId_(docId) || docId === templateId) throw new Error('Invalid operation document.');
  const file = DriveApp.getFileById(docId);
  if (file.getMimeType() !== BVL.MIME || file.isTrashed()) throw new Error('Not a live Google spreadsheet.');
  const parents = file.getParents();
  let inFolder = false;
  while (parents.hasNext()) if (parents.next().getId() === folderId) inFolder = true;
  if (!inFolder) throw new Error('This spreadsheet does not belong to the configured folder.');
  // Reuse the already-authorized Drive handle instead of looking up the file
  // again when a read needs its name. The optional argument is read-only output.
  if(metadata)metadata.name=file.getName();
  return SpreadsheetApp.openById(docId);
}
function bvlList_(folderId, templateId, requestId) {
  const phase=bvlPhaseTracer_(requestId,'list');
  phase('list_start');
  const folder = DriveApp.getFolderById(folderId);
  const iter = folder.getFilesByType(MimeType.GOOGLE_SHEETS);
  const files = [];
  while (iter.hasNext()) {
    const file = iter.next();
    if (file.getId() === templateId || file.isTrashed()) continue;
    const name=file.getName();
    // A recoverable incomplete create is never shown as an operational incident.
    if(/^BVLOG_CREATE_PENDING_[a-f0-9-]{32,50}$/i.test(name))continue;
    files.push({id:file.getId(), name:name, created:file.getDateCreated().toISOString(), url:file.getUrl()});
  }
  files.sort((a,b) => b.created.localeCompare(a.created));
  phase('list_files_loaded');
  const types=bvlTypeOptions_(templateId,true);
  phase('list_types_loaded');
  return {ok:true, documents:files, action_types:types};
}
/** Schema adapters. A spreadsheet copied from a template remains user-editable. */
function bvlNorm_(text) {
  return String(text || '').replace(/\s+/g,' ').trim().toLowerCase();
}
function bvlColLetter_(col) {
  let out='';
  for(let x=Number(col);x>0;x=Math.floor((x-1)/26))out=String.fromCharCode(65+(x-1)%26)+out;
  return out;
}
function bvlCanonicalType_(text) {
  const value=bvlSafeText_(text,60);
  // Historical typo in the supplied template: Navodenie -> Navodnenie.
  return bvlNorm_(value)===bvlNorm_('\u041d\u0430\u0432\u043e\u0434\u0435\u043d\u0438\u0435') ?
    '\u041d\u0430\u0432\u043e\u0434\u043d\u0435\u043d\u0438\u0435' : value;
}
function bvlInfoSections_(sheet,options) {
  if(!sheet){if(options)options.legacy=[];return [];}
  const lastRow=sheet.getLastRow();
  const height=Math.min(Math.max(lastRow,45),750);
  const width=Math.min(Math.max(sheet.getLastColumn(),4),15);
  const grid=sheet.getRange(1,1,height,width).getDisplayValues();
  // INFO legacy projection and adaptive schema use the same server read.
  if(options)options.legacy=grid.slice(0,Math.min(Math.max(lastRow,34),150)).map(row=>row.slice(0,4));
  const sections=[];
  for(let i=0;i<grid.length;i++) {
    const row=grid[i];
    const dataIndex=row.findIndex(x=>bvlNorm_(x)==='\u0438\u043d\u0444\u043e');
    const labelIndex=row.findIndex(x=>bvlNorm_(x)==='\u043a\u043e\u043b\u043e\u043d\u0430 1');
    const hasComment=row.some(x=>bvlNorm_(x).indexOf('\u043a\u043e\u043c\u0435\u043d\u0442\u0430\u0440')>=0);
    if(dataIndex<0 && (labelIndex<0 || !hasComment))continue;
    if(dataIndex>=0 && labelIndex<0 && !hasComment)continue;
    const labelCol=labelIndex>=0?labelIndex+1:Math.max(1,dataIndex);
    const columns=row.map((text,index)=>({col:index+1,letter:bvlColLetter_(index+1),label:String(text||'').trim()}))
      .filter(x=>x.col!==labelCol && x.label && !/^BVLOG_/i.test(x.label));
    // The operational value column remains primary even if columns are moved.
    columns.sort((a,b)=>a.col===dataIndex+1?-1:b.col===dataIndex+1?1:a.col-b.col);
    columns.splice(10);
    if(!columns.length)continue;
    sections.push({headerRow:i+1,labelCol:labelCol,columns:columns,rows:[],date:'',section:sections.length});
  }
  for(let n=0;n<sections.length;n++) {
    const section=sections[n];
    const next=sections[n+1];
    const end=next?next.headerRow-1:grid.length;
    if(section.headerRow>=2){
      const above=grid[section.headerRow-2]||[];
      const dateCell=above.find(c=>String(c||'').trim().indexOf(BVL.DATE)===0);
      section.date=dateCell||'';
    }
    section.nextHeader=next?next.headerRow:0;
    for(let r=section.headerRow+1;r<=end;r++){
      const cells=grid[r-1]||[];
      const label=String(cells[section.labelCol-1]||'').trim();
      if(!label || label.startsWith(BVL.DATE))continue;
      // Never interpret a repeated header row as a role.
      if(bvlNorm_(label)==='\u043a\u043e\u043b\u043e\u043d\u0430 1')continue;
      section.rows.push({row:r,label:label,section:n,fields:section.columns.map(f=>({
        col:f.letter,header:f.label,value:String(cells[f.col-1]||''),
        choices:[]
      }))});
    }
  }
  // Read dropdown rules only for actual action-type rows; avoid large per-cell calls.
  if(!options||options.includeChoices!==false)for(const section of sections)for(const row of section.rows){
    if(bvlNorm_(row.label)!==bvlNorm_('\u0410\u043a\u0446\u0438\u044f'))continue;
    const f=row.fields[0];
    const rule=sheet.getRange(f.col+row.row).getDataValidation();
    let raw=[];
    if(rule){
      const kind=rule.getCriteriaType();
      const args=rule.getCriteriaValues();
      if(kind===SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST && Array.isArray(args[0]))raw=args[0];
      else if(kind===SpreadsheetApp.DataValidationCriteria.VALUE_IN_RANGE && args[0] && args[0].getDisplayValues)
        raw=args[0].getDisplayValues().reduce((a,b)=>a.concat(b),[]);
    }
    f.choices=Array.from(new Set(raw.map(bvlCanonicalType_).filter(Boolean)));
  }
  return sections;
}
function bvlTypeOptions_(templateId,useCache) {
  // Only the chooser may use a short-lived versioned cache; CREATE and every
  // actual field write always validate the current sheet's dropdown.
  let cache=null,key='';
  if(useCache)try{
    const stamp=DriveApp.getFileById(templateId).getLastUpdated().getTime();
    if(Number.isFinite(stamp)){
      key='bvlog-type-v1:'+templateId+':'+stamp;
      if(key.length<=240){cache=CacheService.getScriptCache();
        const value=JSON.parse(cache.get(key)||'null');
        if(Array.isArray(value)&&value.length&&value.every(x=>typeof x==='string'&&x.length<=60))return value;
      }
    }
  }catch(ignore){cache=null;}
  const source=SpreadsheetApp.openById(templateId);
  const info=source.getSheetByName('INFO');
  const first=bvlInfoSections_(info)[0];
  const row=first&&first.rows.find(r=>bvlNorm_(r.label)===bvlNorm_('\u0410\u043a\u0446\u0438\u044f'));
  const menu=row&&row.fields[0]&&row.fields[0].choices || [];
  const placeholder=bvlNorm_('\u0418\u0437\u0431\u0435\u0440\u0438 \u043e\u0442 \u043c\u0435\u043d\u044e\u0442\u043e');
  const types=menu.length ? menu.filter(x=>bvlNorm_(x)!==placeholder) : BVL.TYPES.map(bvlCanonicalType_);
  if(cache&&key)try{cache.put(key,JSON.stringify(types),60);}catch(ignore){}
  return types;
}
function bvlValidationAwareSet_(range, value) {
  const target=bvlSafeText_(value,3000);
  const rule=range.getDataValidation();
  let allowed=null;
  if(rule && rule.getCriteriaType()===SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST){
    allowed=(rule.getCriteriaValues()[0]||[]).map(String);
  }else if(rule && rule.getCriteriaType()===SpreadsheetApp.DataValidationCriteria.VALUE_IN_RANGE){
    const source=rule.getCriteriaValues()[0];
    allowed=source.getDisplayValues().reduce((acc,row)=>acc.concat(row),[]).map(String);
  }
  let selected=target;
  if(allowed){
    // Do not rebuild validations: doing so removes custom option chip colours.
    // Existing documents may still use an older misspelling for this value.
    if(!allowed.includes(target)){
      const equivalent=allowed.filter(v=>bvlNorm_(bvlCanonicalType_(v))===bvlNorm_(bvlCanonicalType_(target)));
      if(equivalent.length!==1)return {ok:false,code:'validation_choice',
        message:'The current dropdown does not allow this value. Update the sheet dropdown or choose an existing option.',
        choices:allowed};
      selected=equivalent[0];
    }
  }
  range.setValue(bvlCell_(selected));
  return {ok:true,appliedValue:selected};
}

function bvlFindInfoField_(sheet,p) {
  const sections=bvlInfoSections_(sheet);
  const index=Number.isInteger(Number(p.section))?Number(p.section):0;
  const section=sections[index];
  if(!section)return {error:'INFO section was removed. Refresh before editing.'};
  let row=Number(p.row);
  const label=String(p.field_label||'').trim();
  if(label){
    const matches=section.rows.filter(r=>bvlNorm_(r.label)===bvlNorm_(label));
    if(matches.length===1)row=matches[0].row;
    else if(matches.length>1 && !matches.some(r=>r.row===row))return {error:'Duplicate INFO role labels. Refresh and choose a specific row.'};
    else if(!matches.length)return {error:'This INFO role was removed or renamed. Refresh before editing.'};
  }
  const record=section.rows.find(r=>r.row===row);
  if(!record)return {error:'The INFO row was removed or moved. Refresh before editing.'};
  const requestedCol=String(p.col||'').toUpperCase();
  const header=String(p.header_label||'');
  let field=section.columns.find(f=>f.letter===requestedCol);
  if(header){
    const matches=section.columns.filter(f=>bvlNorm_(f.label)===bvlNorm_(header));
    if(matches.length!==1)return {error:'The INFO column was moved or renamed ambiguously. Refresh.'};
    field=matches[0];
  }
  if(!field)return {error:'The INFO column is missing. Refresh before editing.'};
  return {row:row,col:field.letter,record:record,section:section};
}
function bvlInfoAddRow_(ss,p) {
  const sh=ss.getSheetByName('INFO');
  if(!sh)return {ok:false,code:'missing_info',message:'INFO tab does not exist.'};
  const sections=bvlInfoSections_(sh);
  const section=sections[Number(p.section)||0];
  if(!section)return {ok:false,code:'missing_section',message:'INFO section is missing.'};
  const role=bvlSafeText_(p.role,120);
  if(!role || role.indexOf('\n')>=0 || bvlNorm_(role)===bvlNorm_('BVLOG_ID'))
    return {ok:false,code:'invalid_role',message:'Enter a role or field name.'};
  const values=Array.isArray(p.values)?p.values:[];
  const insertAt=section.nextHeader?Math.max(section.headerRow+1,section.nextHeader-1):
    Math.max(section.headerRow+1,sh.getLastRow()+1);
  if(insertAt>sh.getMaxRows())bvlEnsureRows_(sh,insertAt);
  if(section.nextHeader)sh.insertRowsBefore(insertAt,1);
  const width=Math.min(Math.max(sh.getLastColumn(),4),15);
  const row=sh.getRange(insertAt,1,1,width);
  // Copy only the normal row presentation, never its values, links or dropdowns.
  const exemplar=sh.getRange(Math.max(section.headerRow+1,insertAt-1),1,1,width);
  exemplar.copyTo(row,SpreadsheetApp.CopyPasteType.PASTE_FORMAT,false);
  row.clearDataValidations(); // Roles must not inherit action-type dropdowns.
  sh.getRange(insertAt,section.labelCol).setValue(bvlCell_(role));
  section.columns.forEach((f,i)=>{if(values[i])sh.getRange(insertAt,f.col).setValue(bvlCell_(values[i]));});
  return {ok:true,row:insertAt,role:role,section:section.section};
}

// Only a prepared and flushed copy receives its final incident name.
// Reservation is durable before makeCopy. An uncertain copy is never blindly repeated.
function bvlCreateFile_(folderId,templateId,id){
  if(!bvlValidId_(id)||id===templateId)throw new Error('Invalid created document.');
  const file=DriveApp.getFileById(id);
  if(file.isTrashed()||file.getMimeType()!==BVL.MIME||!bvlParentIs_(file,folderId))
    throw new Error('Created document is no longer in the configured folder.');
  return file;
}
function bvlCreateReply_(file,deduplicated){
  return {ok:true,document:{id:file.getId(),name:file.getName(),created:file.getDateCreated().toISOString(),url:file.getUrl()},deduplicated:!!deduplicated};
}
function bvlUniqueName_(folder,base){
  let name=base,suffix=2;
  while(folder.getFilesByName(name).hasNext())name=base+' ('+(suffix++)+')';
  return name;
}
function bvlCreate_(folderId, templateId, payload, traceId) {
  const phase=bvlPhaseTracer_(traceId,'create');
  phase('create_start');
  const requestId=String(payload.create_id||'').toLowerCase();
  if(!/^[a-f0-9-]{32,50}$/.test(requestId))return {ok:false,code:'create_id',message:'A stable creation identifier is required.'};
  const chosenDate=bvlIncidentDate_(payload.incident_date);
  const type=bvlSafeText_(payload.type,60),place=bvlSafeText_(payload.place,100);
  if(!place||/[\r\n\\\/<>]/.test(place))return {ok:false,code:'place',message:'Location is required; avoid path separators.'};
  const base=chosenDate.filename+' - '+BVL.DKA+' - '+bvlCanonicalType_(type)+' - '+place;
  const key='BVLOG_CREATE_'+requestId,props=PropertiesService.getScriptProperties();
  const existing=props.getProperty(key),folder=DriveApp.getFolderById(folderId);
  let job=null,copy=null,wasExisting=!!existing;
  if(existing){
    // Legacy successful creates (including v0.8.0.1) store only the file ID.
    if(bvlValidId_(existing)){
      try{return bvlCreateReply_(bvlCreateFile_(folderId,templateId,existing),true);}
      catch(ignore){return {ok:false,code:'create_missing',message:'Previously created document cannot be located. Ask an administrator; no new copy was made.'};}
    }
    try{job=JSON.parse(existing);}catch(ignore){}
    if(!job||job.v!==1||job.folder!==folderId||job.template!==templateId||job.base!==base||
      job.temp!=='BVLOG_CREATE_PENDING_'+requestId||!['copying','prepared'].includes(job.phase))
      return {ok:false,code:'create_conflict',message:'Creation request already exists with different or invalid parameters. No new copy was made.'};
    if(job.id){
      try{copy=bvlCreateFile_(folderId,templateId,job.id);}
      catch(ignore){return {ok:false,code:'create_missing',message:'Pending copy is unavailable. Ask an administrator; no new copy was made.'};}
    }else{
      // A previous makeCopy may have committed despite a lost response.
      const found=folder.getFilesByName(job.temp);
      if(!found.hasNext())return {ok:false,code:'create_unknown',message:'Previous copy outcome is uncertain. Retry later or ask an administrator to inspect the reserved copy; no duplicate was created.'};
      const candidate=found.next();
      if(found.hasNext())return {ok:false,code:'create_unknown',message:'More than one pending copy exists. Administrator review required.'};
      copy=bvlCreateFile_(folderId,templateId,candidate.getId());
      job.id=copy.getId();props.setProperty(key,JSON.stringify(job));
    }
    phase('create_recovered');
  }else{
    if(!bvlTypeOptions_(templateId).includes(bvlCanonicalType_(type)))return {ok:false,code:'action_type',message:'Choose a valid action type from the current template.'};
    phase('create_validated');
    const temp='BVLOG_CREATE_PENDING_'+requestId;
    // If the reservation was removed manually but a pending copy remains,
    // fail closed instead of accidentally copying a second time.
    if(folder.getFilesByName(temp).hasNext())return {ok:false,code:'create_unknown',message:'An existing pending copy needs administrator review.'};
    job={v:1,folder:folderId,template:templateId,base:base,temp:temp,phase:'copying',id:''};
    props.setProperty(key,JSON.stringify(job));
    phase('create_reserved');
    const template=DriveApp.getFileById(templateId);
    copy=template.makeCopy(temp,folder);
    job.id=copy.getId();props.setProperty(key,JSON.stringify(job));
    phase('create_copied');
  }
  if(job.phase==='copying'){
    if(copy.getName()!==job.temp)return {ok:false,code:'create_unknown',message:'Pending copy was renamed before initialization. Administrator review required.'};
    const ss=SpreadsheetApp.openById(copy.getId());
    const info=ss.getSheetByName('INFO'),log=ss.getSheetByName('LOG');
    if(!info||!log||!ss.getSheetByName('TECH')||!ss.getSheetByName('TEAM'))
      throw new Error('The template must contain INFO, LOG, TECH, TEAM tabs.');
    // The copied cell is validated below against its actual dropdown; no duplicate dropdown reads.
    const first=bvlInfoSections_(info,{includeChoices:false})[0];
    const action=first&&first.rows.find(r=>bvlNorm_(r.label)===bvlNorm_('\u0410\u043a\u0446\u0438\u044f'));
    if(!action)throw new Error('Template INFO action type row is missing.');
    const valid=bvlValidationAwareSet_(info.getRange(action.fields[0].col+action.row),bvlCanonicalType_(type));
    if(!valid.ok)throw new Error(valid.message);
    const placeRow=first.rows.find(r=>bvlNorm_(r.label)===bvlNorm_('\u041b\u043e\u043a\u0430\u0446\u0438\u044f'));
    if(placeRow)info.getRange(placeRow.fields[0].col+placeRow.row).clearContent();
    info.getRange(Math.max(1,first.headerRow-1),Math.min(3,info.getMaxColumns())).setValue(chosenDate.display);
    log.getRange('D2').setValue(BVL.DATE+' '+chosenDate.display);
    phase('create_fields_set');
    bvlPrepare_(ss);
    phase('create_prepared');
    SpreadsheetApp.flush();
    phase('create_flushed');
    job.phase='prepared';props.setProperty(key,JSON.stringify(job));
  }
  // Once preparation is recorded, a lost rename or final-property ACK is recoverable.
  // Never reinitialize a visible document or overwrite its manually edited cells.
  if(copy.getName()===job.temp){
    copy.setName(bvlUniqueName_(folder,base));
    phase('create_published');
  }
  props.setProperty(key,copy.getId());
  phase('create_confirmed');
  return bvlCreateReply_(copy,wasExisting);
}
function bvlEnsureRows_(sheet, lastRowNeeded) {
  if (lastRowNeeded > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), lastRowNeeded - sheet.getMaxRows());
}
function bvlPrepare_(ss, needed) {
  // A manually removed or changed tab must not disable unrelated operations.
  const tabs=needed && needed!=='all'?[String(needed)]:['LOG','TEAM','TECH'];
  for(const name of tabs){
    const sh=ss.getSheetByName(name);
    if(!sh)throw new Error(name+' tab was removed. Restore it to use this operation.');
    if(name==='INFO')continue;
    const header=name==='LOG'?1:2;
    const technical=name==='LOG'?[['G','BVLOG_ID'],['H','BVLOG_STATUS']]:
      name==='TEAM'?[['I','BVLOG_ID']]:[['F','BVLOG_ID']];
    const start=name==='LOG'?7:name==='TEAM'?9:6;
    const range=sh.getRange(header,start,1,technical.length);
    const existing=range.getDisplayValues()[0];
    const formulas=typeof range.getFormulas==='function'?range.getFormulas()[0]:[];
    for(let i=0;i<technical.length;i++){
      const pair=technical[i],current=existing[i];
      if((current&&current!==pair[1])||(!current&&formulas[i]))throw new Error(name+' '+pair[0]+header+
        ' is already in use. Refusing to overwrite manually added data.');
    }
    // Fill only empty cells, retaining existing cell formatting and formulas.
    if(existing.every(x=>!x))range.setValues([technical.map(pair=>pair[1])]);
    else for(let i=0;i<technical.length;i++)if(!existing[i])sh.getRange(technical[i][0]+header).setValue(technical[i][1]);
    const hidden=typeof sh.isColumnHiddenByUser==='function'&&technical.every((_,i)=>sh.isColumnHiddenByUser(start+i));
    if(!hidden)sh.hideColumns(start,technical.length);
  }
  return bvlMeta_(ss);
}

function bvlMeta_(ss) {
  let meta = ss.getSheetByName(BVL.OPS);
  if (!meta) {
    meta = ss.insertSheet(BVL.OPS);
    meta.appendRow(['op_id','kind','timestamp','author','result']);
    meta.hideSheet();
  }
  return meta;
}
function bvlDone_(meta, opId) {
  if (meta.getLastRow() < 2) return false;
  return !!meta.getRange(2,1,meta.getLastRow()-1,1).createTextFinder(String(opId)).matchEntireCell(true).findNext();
}
function bvlFindId_(sheet, idCol, fromRow, opId) {
  const last = sheet.getLastRow();
  if (last < fromRow) return 0;
  const found = sheet.getRange(fromRow,idCol,last-fromRow+1,1).createTextFinder(String(opId)).matchEntireCell(true).findNext();
  return found ? found.getRow() : 0;
}
function bvlStamp_(meta, p, result) {
  const receipt=Object.assign({},result);
  if(p.kind==='log'&&/^[a-f0-9]{64}$/.test(String(p.payload_hash||'')))
    receipt.payload_hash=p.payload_hash;
  if(p.kind==='log'&&p.transport==='sms'){receipt.transport='sms';receipt.source=p.source;}
  meta.appendRow([p.op_id, p.kind, new Date().toISOString(), p.author || '', JSON.stringify(receipt).slice(0,1000)]);
}
function bvlOriginalLogHash_(meta,opId) {
  const row=bvlFindId_(meta,1,2,opId);
  if(!row)return '';
  try{
    const receipt=JSON.parse(meta.getRange(row,5).getDisplayValue());
    return /^[a-f0-9]{64}$/.test(String(receipt.payload_hash||''))?receipt.payload_hash:'';
  }catch(ignore){return '';}
}
function bvlSmsConflict_(meta,payload,opId){
  if(payload.kind!=='log')return false;
  const incoming=String(payload.payload_hash||'');
  if(!incoming&&payload.transport!=='sms')return false;
  const stored=bvlOriginalLogHash_(meta,opId);
  return (stored&&stored!==incoming)||(!stored&&payload.transport==='sms');
}
// Find the last nonempty operational row without fetching the entire history.
// The reference implementation scanned all rows from firstRow to getLastRow().
// Work backwards in bounded chunks, preserving the same result even when
// trailing rows contain values in columns outside the operational range.
function bvlEnd_(sheet, firstRow, firstCol, columnCount) {
  const last=sheet.getLastRow();
  if(last<firstRow)return firstRow-1;
  let batch=256;
  for(let end=last;end>=firstRow;){
    const start=Math.max(firstRow,end-batch+1);
    const rows=sheet.getRange(start,firstCol,end-start+1,columnCount).getDisplayValues();
    for(let i=rows.length-1;i>=0;i--){
      if(rows[i].some(v=>String(v).trim()!==''))return start+i;
    }
    end=start-1;
    // Sparse trailing metadata can produce a very long empty tail. Increase
    // the block size gradually, capped at 4096 rows per request.
    batch=Math.min(4096,batch*2);
  }
  return firstRow-1;
}
function bvlOperation_(folderId, templateId, payload, requestId) {
  const phase=bvlPhaseTracer_(requestId,'operation');
  phase('operation_start');
  const docId = bvlValidId_(payload.doc_id);
  const opId = String(payload.op_id || '');
  if (!/^[a-f0-9-]{32,50}$/i.test(opId)) return {ok:false,code:'bad_id',message:'Invalid operation ID.'};
  const ss = bvlDoc_(folderId, templateId, docId);
  phase('operation_doc_opened');
  const needed=payload.kind==='field'||payload.kind==='add_row' ? String(payload.sheet||'') :
    payload.kind==='audio_part'&&payload.target_kind==='field' ? String(payload.field_sheet||'') : 'LOG';
  const meta = bvlPrepare_(ss,needed);
  phase('operation_prepared');
  if (bvlDone_(meta, opId)) {
    if(bvlSmsConflict_(meta,payload,opId))
      return {ok:false,code:'sms_conflict',message:'Original LOG payload cannot be verified; review without overwriting.'};
    phase('operation_deduplicated');
    return {ok:true,deduplicated:true,complete:payload.kind==='audio_part'};
  }
  phase('operation_dedup_checked');
  let existingRow = 0;
  if (payload.kind === 'log') existingRow = bvlFindId_(ss.getSheetByName('LOG'), 7, 3, opId);
  if (payload.kind === 'add_row' && payload.sheet === 'TEAM') existingRow = bvlFindId_(ss.getSheetByName('TEAM'), 9, 3, opId);
  if (payload.kind === 'add_row' && payload.sheet === 'TECH') existingRow = bvlFindId_(ss.getSheetByName('TECH'), 6, 3, opId);
  if (existingRow) {
    // Existing legacy/unacknowledged row without an immutable receipt: do not
    // claim a different SMS payload was confirmed or stamp an invented hash.
    if(payload.kind==='log'&&payload.transport==='sms')
      return {ok:false,code:'sms_conflict',message:'Existing LOG row has no verified original payload; review.'};
    const dedup = {ok:true,deduplicated:true,row:existingRow};
    const legacy=Object.assign({},payload);delete legacy.payload_hash;
    bvlStamp_(meta,legacy,dedup);
    phase('operation_existing_row');
    return dedup;
  }
  let result;
  if (payload.kind === 'log') result = bvlLog_(ss, payload);
  else if (payload.kind === 'field') result = bvlField_(ss, payload);
  else if (payload.kind === 'add_row') result = payload.sheet==='INFO' ? bvlInfoAddRow_(ss,payload) : bvlAddRow_(ss, payload);
  else if (payload.kind === 'photo') result = bvlAttachPhoto_(folderId, ss, payload);
  else if (payload.kind === 'audio_part') result = bvlAudioPart_(folderId,ss,payload);
  else if (payload.kind === 'log_change') result = bvlLogChange_(ss,payload);
  else return {ok:false,code:'kind',message:'Unsupported operation type.'};
  phase('operation_applied');
  if (result.ok && (payload.kind !== 'audio_part' || result.complete)) bvlStamp_(meta, payload, result);
  phase('operation_stamp_checked');
  SpreadsheetApp.flush();
  phase('operation_flushed');
  return result;
}
function bvlLog_(ss, p) {
  const sheet = ss.getSheetByName('LOG');
  const text = bvlSafeText_(p.text, 3000);
  const eventAt = new Date(p.event_at);
  if (!text || isNaN(eventAt.getTime())) return {ok:false,code:'log_input',message:'Log entry or timestamp is invalid.'};
  const end = bvlEnd_(sheet, 2, 2, 6);
  let lastDate = '';
  let serial = 0;
  const grid = sheet.getRange(2,1,Math.max(1,end-1),7).getDisplayValues();
  for (let i=0;i<grid.length;i++) {
    const row = grid[i], d = String(row[3]||'').trim();
    if (d.startsWith(BVL.DATE)) lastDate = d.slice(BVL.DATE.length).trim();
    const isData = row.slice(1,6).some(v => String(v).trim()) && !d.startsWith(BVL.DATE);
    if (isData && i > 0) serial += 1;
  }
  const date = bvlDate_(eventAt);
  let nextRow = Math.max(3, end+1);
  if (!lastDate && end === 2 && String(sheet.getRange('D2').getDisplayValue()).trim() === BVL.DATE) {
    sheet.getRange('D2').setValue(BVL.DATE + ' ' + date);
    lastDate = date;
  }
  const needsDivider = date !== lastDate;
  if (needsDivider) {
    bvlEnsureRows_(sheet,nextRow+1);
    sheet.getRange(nextRow,1,1,7).setValues([['','','', BVL.DATE + ' ' + date,'','','']]);
    sheet.getRange(nextRow,1,1,6).setBackground('#e0f2fe').setFontWeight('bold').setBorder(true,false,true,false,false,false,'#2563eb',SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    nextRow++;
  }
  bvlEnsureRows_(sheet,nextRow);
  const isLate = !!lastDate && date !== lastDate && bvlISODate_(eventAt) < bvlISODate_(new Date());
  sheet.getRange(nextRow,1,1,8).setValues([[
    serial+1, bvlTime_(eventAt), bvlCell_(p.author||''), bvlCell_(text), p.transport === 'sms' ? 'SMS \u043f\u0440\u0435\u0437 \u043f\u0440\u0438\u043b\u043e\u0436\u0435\u043d\u0438\u0435\u0442\u043e' : (p.source === 'text' ? BVL.TEXT : BVL.VOICE), '', String(p.op_id), ''
  ]]);
  return {ok:true, row:nextRow, date:date, late:isLate};
}
function bvlField_(ss,p) {
  const name=String(p.sheet||'');
  if(!['INFO','TEAM','TECH'].includes(name))return {ok:false,code:'protected_range',message:'Unknown editable sheet.'};
  const sheet=ss.getSheetByName(name);
  if(!sheet)return {ok:false,code:'sheet_missing',message:name+' was removed. Other tabs remain available.'};
  let row=Number(p.row),col=String(p.col||'').toUpperCase();
  let isAction=false;
  if(name==='INFO'){
    const target=bvlFindInfoField_(sheet,p);
    if(target.error)return {ok:false,code:'row_moved',message:target.error};
    row=target.row;col=target.col;
    isAction=bvlNorm_(target.record.label)===bvlNorm_('\u0410\u043a\u0446\u0438\u044f') &&
      !!(target.record.fields[0]&&target.record.fields[0].col===col);
  }else if(!Number.isInteger(row)||row<3||row>5000||!/^[B-Z]{1,2}$/.test(col)){
    return {ok:false,code:'protected_range',message:'Invalid sheet row or column.'};
  }
  const ref=sheet.getRange(col+row);
  const current=ref.getDisplayValue();
  const base=bvlSafeText_(p.force_base===null||p.force_base===undefined?p.base:p.force_base,3000);
  const value=bvlSafeText_(p.value,3000);
  if(current===value)return {ok:true,unchanged:true,row:row,col:col};
  if(name!=='INFO'&&p.row_key){
    const idcol=name==='TEAM'?9:6;
    const rec=sheet.getRange(row,1,1,idcol).getDisplayValues()[0];
    const key=rec[idcol-1]||'m:'+rec[1]+'|'+rec[name==='TEAM'?2:3];
    if(String(key)!==String(p.row_key))return {ok:false,code:'row_moved',message:'Row changed or moved in Google Sheets. Refresh before editing.',current:current,row:row};
  }
  if(current!==base)return {ok:false,code:'conflict',message:'Google Sheets value changed since you edited it.',current:current,row:row,col:col};
  // Read the live validation of the target cell, without rebuilding its rule.
  const rule=ref.getDataValidation();
  if(rule && ![SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST,
      SpreadsheetApp.DataValidationCriteria.VALUE_IN_RANGE].includes(rule.getCriteriaType())){
    return {ok:false,code:'validation_type',message:'This field has a different validation rule. Edit it in Google Sheets.'};
  }
  const result=bvlValidationAwareSet_(ref,isAction?bvlCanonicalType_(value):value);
  if(!result.ok)return result;
  return {ok:true,row:row,col:col};
}

function bvlAddRow_(ss, p) {
  const name = String(p.sheet||'');
  if (name !== 'TEAM' && name !== 'TECH') return {ok:false,code:'row_type',message:'Rows can only be added to TEAM/TECH.'};
  const sheet = ss.getSheetByName(name);
  const count = name === 'TEAM' ? 7 : 4;
  const v = Array.isArray(p.values) ? p.values : [];
  const entries = Array.from({length:count},(_,i)=>bvlCell_(v[i]||''));
  if (!entries.some(Boolean)) return {ok:false,code:'blank',message:'Row is empty.'};
  const end = bvlEnd_(sheet,3,2,name === 'TEAM'?8:5);
  const next = Math.max(3,end+1);
  bvlEnsureRows_(sheet,next);
  sheet.getRange(next,1,1,count+2).setValues([[next-2].concat(entries,[String(p.op_id)])]);
  return {ok:true,row:next};
}
// For a sparse active tab, find exact index keys first and fetch only a few
// contiguous blocks. Fall back to the old full range for dense or unsupported
// searches. Never use a cached media mapping or discard a matching history row.
function bvlIndexedRows_(sheet,width,keyColumn,keys){
  if(!sheet)return [];
  const last=sheet.getLastRow();
  if(last<2)return [];
  const all=()=>sheet.getRange(2,1,last-1,width).getDisplayValues();
  if(!keys)return all();
  const values=Array.from(keys);
  if(!values.length)return [];
  if(last<=257||values.length>120)return all();
  // Exact identifiers only; irregular manually entered IDs use the full scan.
  if(values.some(x=>!/^[A-Za-z0-9_-]{1,200}$/.test(x)))return all();
  const pattern='^('+values.join('|')+')$';
  if(pattern.length>12000)return all();
  try{
    const matches=sheet.getRange(2,keyColumn,last-1,1).createTextFinder(pattern)
      .useRegularExpression(true).matchEntireCell(true).matchCase(true).findAll();
    const rows=Array.from(new Set(matches.map(x=>x.getRow()))).sort((a,b)=>a-b);
    if(!rows.length)return [];
    const runs=[];
    for(const row of rows){
      if(row<2||row>last)return all();
      const prev=runs[runs.length-1];
      if(prev&&row<=prev.end+2)prev.end=row;
      else runs.push({start:row,end:row});
      if(runs.length>8)return all();
    }
    const size=runs.reduce((n,x)=>n+x.end-x.start+1,0);
    if(size>(last-1)*0.5)return all();
    const wanted=new Set(values),out=[];
    for(const run of runs){
      const part=sheet.getRange(run.start,1,run.end-run.start+1,width).getDisplayValues();
      for(const record of part)if(wanted.has(String(record[keyColumn-1]||'')))out.push(record);
    }
    return out;
  }catch(ignore){return all();}
}
function bvlRead_(folderId, templateId, docId, requestId, requestedTab) {
  const tabs=['LOG','INFO','TEAM','TECH'];
  const tab=tabs.includes(requestedTab)?requestedTab:'';
  const want=name=>!tab||tab===name;
  const phase=bvlPhaseTracer_(requestId,'read');
  phase('read_start');
  const metadata={};
  const ss = bvlDoc_(folderId,templateId,docId,metadata);
  phase('document_opened');
  const info = ss.getSheetByName('INFO'), log = ss.getSheetByName('LOG');
  const team = ss.getSheetByName('TEAM'), tech = ss.getSheetByName('TECH');
  const data = {};
  // Reuse these handles: getSheetByName for each tab has already been called.
  data.MISSING_TABS=['INFO','LOG','TEAM','TECH'].filter((name,i)=>![info,log,team,tech][i]);
  phase('sheet_handles_loaded');
  if(want('INFO')){
    const projection={};
    data.INFO_SECTIONS=bvlInfoSections_(info,projection);
    phase('info_schema_loaded');
    // Legacy test/adapter fallback; production uses the same schema grid.
    data.INFO=projection.legacy||(info?info.getRange(1,1,Math.min(Math.max(info.getLastRow(),34),150),4).getDisplayValues():[]);
    phase('info_loaded');
  }
  let logStart=2,lr=[],photoRich=[];
  if(want('LOG')&&log){
    const logEnd=bvlEnd_(log,2,2,6);
    phase('log_end_scanned');
    logStart=Math.max(2,logEnd-119);
    lr=log.getRange(logStart,1,Math.max(1,logEnd-logStart+1),8).getDisplayValues();
    phase('log_values_loaded');
    // Reads must not change image anchors; any maintenance needs its own explicit write operation.
    photoRich=log.getRange(logStart,6,Math.max(1,logEnd-logStart+1),1).getRichTextValues();
    phase('log_richtext_loaded');
  }
  phase('log_loaded');
  const byLogId = {};
  const visibleIds=new Set(lr.map(v=>String(v[6]||'')).filter(Boolean));
  const gallery = want('LOG')&&(!tab||visibleIds.size)?ss.getSheetByName(BVL.PHOTOS):null;
  if (gallery) {
    const stored = bvlIndexedRows_(gallery,10,2,tab?visibleIds:null);
    stored.forEach(record => {
      const logId = String(record[1] || '');
      const mediaId = String(record[0] || '');
      if (!logId || !mediaId || (tab&&!visibleIds.has(logId))) return;
      if (!byLogId[logId]) byLogId[logId] = [];
      byLogId[logId].push({id:mediaId, text:record[5] || 'Снимка', url:'', managed:true});
    });
  }
  phase('photos_loaded');
  const byAudio = {}, byFieldAudio = {};
  const audioIndex = (!tab||tab!=='LOG'||visibleIds.size)?ss.getSheetByName(BVL.AUDIOS):null;
  if (audioIndex) {
    bvlIndexedRows_(audioIndex,12,tab&&tab!=='LOG'?10:2,tab?(tab==='LOG'?visibleIds:new Set([tab])):null).forEach(r => {
      if(want('LOG')&&r[2] === 'log' && r[1] && r[0]&&(!tab||visibleIds.has(String(r[1]))))byAudio[String(r[1])] = {id:String(r[0]),mime:String(r[4]||''),bytes:Number(r[8]||0)};
      if(r[2] === 'field' && r[9] && r[10] && r[11]&&(!tab||String(r[9])===tab)){
        const fieldKey=String(r[9])+':'+String(r[11])+String(r[10]);
        if (!byFieldAudio[fieldKey]) byFieldAudio[fieldKey] = [];
        byFieldAudio[fieldKey].push({id:String(r[0]),mime:String(r[4]||''),bytes:Number(r[8]||0)});
      }
    });
  }
  data.FIELD_AUDIO=byFieldAudio;
  phase('audio_index_loaded');
  const byHistory = {};
  const audit = want('LOG')&&(!tab||visibleIds.size)?ss.getSheetByName(BVL.HISTORY):null;
  if (audit) {
    bvlIndexedRows_(audit,8,2,tab?visibleIds:null).forEach(r => {
      const key = String(r[1]||'');
      if (!key || (tab&&!visibleIds.has(key))) return;
      if (!byHistory[key]) byHistory[key] = [];
      byHistory[key].push({at:String(r[3]||''),author:String(r[4]||''),action:String(r[2]||''),before:String(r[5]||''),after:String(r[6]||'')});
      if(byHistory[key].length>8)byHistory[key].shift();
    });
  }
  phase('history_loaded');
  if(want('LOG'))data.LOG = lr.map((v,i) => {
    // Old v0.4.x hyperlinks continue to display without making files public.
    const legacy = photoRich[i] && photoRich[i][0] ? photoRich[i][0].getRuns()
      .filter(run => run.getLinkUrl() && /^https:\/\/drive\.google\.com\//.test(run.getLinkUrl()))
      .map(run=>({text:run.getText(),url:run.getLinkUrl(),managed:false})) : [];
    return {row:logStart+i,cells:v.slice(0,7),status:String(v[7]||''),
      audio:byAudio[String(v[6]||'')]||null, history:(byHistory[String(v[6]||'')]||[]).slice(-8),
      photos:(byLogId[String(v[6] || '')] || []).concat(legacy)};
  }).filter(x => x.cells.slice(1,7).some(Boolean));
  phase('log_assembled');
  for (const name of ['TEAM','TECH']) {
    if(!want(name))continue;
    const sheet=name==='TEAM'?team:tech;
    if(!sheet){data[name]=[];continue;}
    const end=bvlEnd_(sheet,3,2,name==='TEAM'?8:5);
    const n=Math.max(1,Math.min(end,151)-1);
    const rows=sheet.getRange(2,1,n,name==='TEAM'?9:6).getDisplayValues();
    data[name]=rows.map((v,i)=>({
      row:i+2,cells:v,
      row_key:v[name==='TEAM'?8:5]||'m:'+(v[1]||'')+'|'+(v[name==='TEAM'?2:3]||'')
    })).filter(x=>x.row===2||x.cells.slice(1,name==='TEAM'?8:5).some(Boolean));
  }

  phase('team_tech_loaded');
  const result={ok:true,id:docId,name:metadata.name,url:ss.getUrl(),data:data};
  if(tab)result.loaded_tabs=[tab];
  if(tab==='INFO')result.backend_version='0.8.3';
  phase('read_complete');
  return result;
}


/** Immutable edit history; cancelled records remain in LOG and their media stays intact. */
function bvlHistory_(ss) {
  let tab=ss.getSheetByName(BVL.HISTORY);
  if(!tab) {tab=ss.insertSheet(BVL.HISTORY);tab.appendRow(['operation','log_id','action','timestamp','author','before','after','row']);tab.hideSheet();}
  return tab;
}
function bvlLogChange_(ss,p) {
  const log=ss.getSheetByName('LOG'), action=String(p.action||'');
  if(!['edit','cancel'].includes(action))return {ok:false,code:'action',message:'Unsupported LOG change.'};
  let row=0, id=String(p.log_op_id||'');
  if(id)row=bvlFindId_(log,7,3,id);
  else {
    row=Number(p.target_row||0);
    if(!Number.isInteger(row)||row<3||row>log.getLastRow())return {ok:false,code:'row_moved',message:'LOG row not found.'};
  }
  if(!row)return {ok:false,code:'row_moved',message:'LOG event moved or is missing. Refresh first.'};
  const cells=log.getRange(row,1,1,8).getDisplayValues()[0];
  const before=String(cells[3]||'');
  if(!before||before.startsWith(BVL.DATE))return {ok:false,code:'protected',message:'Cannot modify a date divider.'};
  const state=String(cells[7]||'');
  if(state==='cancelled')return {ok:false,code:'already_cancelled',message:'This event was already annulled.'};
  const currentTime=String(cells[1]||'');
  if(!id && (currentTime!==String(p.expected_time||'')))return {ok:false,code:'row_moved',message:'Target row changed. Refresh first.',current:before};
  const base=bvlSafeText_(p.force_base===undefined||p.force_base===null?p.expected_text:p.force_base,3000);
  if(before!==base)return {ok:false,code:'conflict',message:'This event changed in Google Sheets. Refresh before editing.',current:before,row:row};
  const after=action==='cancel'?before:bvlSafeText_(p.text,3000);
  if(action==='edit'&&!after)return {ok:false,code:'empty_text',message:'Text cannot be empty.'};
  if(action==='edit'&&before===after)return {ok:true,unchanged:true,row:row};
  if(!id){id=String(cells[6]||p.op_id);log.getRange(row,7).setValue(id);}
  // Audit before mutation so a failed history append never silently rewrites a record.
  bvlHistory_(ss).appendRow([String(p.op_id),id,action,new Date().toISOString(),String(p.author||''),before,after,row]);
  if(action==='edit'){log.getRange(row,4).setValue(bvlCell_(after));}
  else{
    log.getRange(row,8).setValue('cancelled');
    log.getRange(row,1,1,6).setFontLine('line-through').setBackground('#f1f1f1');
    log.getRange(row,4).setNote('АНУЛИРАНО от '+String(p.author||'')+' на '+new Date().toISOString());
  }
  return {ok:true,row:row,log_op_id:id,action:action};
}
function bvlAudioIndex_(ss){
  let tab=ss.getSheetByName(BVL.AUDIOS);
  if(!tab){tab=ss.insertSheet(BVL.AUDIOS);tab.appendRow(['audio_op_id','target_id','target_kind','filename','mime','file_id','folder_id','time','bytes','sheet','row','column']);tab.hideSheet();}
  return tab;
}
function bvlAudioEntry_(index,opId){
  if(!index||index.getLastRow()<2)return null;
  const hit=index.getRange(2,1,index.getLastRow()-1,1).createTextFinder(String(opId)).matchEntireCell(true).findNext();
  return hit?index.getRange(hit.getRow(),1,1,12).getDisplayValues()[0]:null;
}
function bvlAudioFolder_(rootId,ss){
  const root=DriveApp.getFolderById(rootId);
  const name=DriveApp.getFileById(ss.getId()).getName()+' - Аудио';
  const key='BVLOG_AUDIO_FOLDER_'+ss.getId();
  const props=PropertiesService.getScriptProperties(),savedId=props.getProperty(key);
  if(savedId){try{const f=DriveApp.getFolderById(savedId);if(!f.isTrashed()&&bvlParentIs_(f,rootId)){if(f.getName()!==name)f.setName(name);return f;}}catch(e){}}
  const found=root.getFoldersByName(name);let f=null;
  while(found.hasNext()){const candidate=found.next();if(candidate.getDescription()==='BVLOG_AUDIO_FOR:'+ss.getId()){f=candidate;break;}}
  if(!f)f=root.createFolder(name);
  f.setDescription('BVLOG_AUDIO_FOR:'+ss.getId());props.setProperty(key,f.getId());return f;
}
/** Upload in <=256 KiB parts so the PHP/GAS bridge never carries a huge JSON body. */
function bvlAudioPart_(rootId,ss,p){
  const opId=String(p.op_id||''), target=String(p.target_id||''), targetKind=String(p.target_kind||'');
  const mime=String(p.mime||''), number=Number(p.part_index), count=Number(p.part_count);
  const allowed=['audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav','audio/x-wav'];
  if(!/^[a-f0-9-]{32,50}$/i.test(opId)||!/^[a-f0-9-]{32,50}$/i.test(target)||
     !['log','field'].includes(targetKind)||!allowed.includes(mime)||
     !Number.isInteger(number)||!Number.isInteger(count)||count<1||count>36||number<0||number>=count)
    return {ok:false,code:'audio_input',message:'Invalid audio upload request.'};
  const encoded=String(p.base64||'');
  if(!encoded||encoded.length>375000||!/^[A-Za-z0-9+/=]+$/.test(encoded))
    return {ok:false,code:'audio_size',message:'Invalid audio chunk size.'};
  const bytes=Utilities.base64Decode(encoded);
  if(bytes.length<1||bytes.length>262144)return {ok:false,code:'audio_size',message:'Audio chunk is too large.'};
  const fieldSheet=String(p.field_sheet||''),fieldRow=Number(p.field_row||0),fieldCol=String(p.field_col||'');
  if(targetKind==='field'&&(!['INFO','TEAM','TECH'].includes(fieldSheet)||
    !Number.isInteger(fieldRow)||fieldRow<3||fieldRow>5000||!/^[B-I]$/.test(fieldCol)))
    return {ok:false,code:'audio_target',message:'Invalid field audio reference.'};
  const index=bvlAudioIndex_(ss),old=bvlAudioEntry_(index,opId);
  if(old)return {ok:true,complete:true,deduplicated:true,audio_id:opId};
  if(targetKind==='log'&&!bvlFindId_(ss.getSheetByName('LOG'),7,3,target))
    return {ok:false,code:'waiting_for_log',message:'Related LOG entry has not been saved yet.'};
  const folder=bvlAudioFolder_(rootId,ss),name=opId+'.part.'+String(number).padStart(3,'0');
  const existing=folder.getFilesByName(name);
  if(!existing.hasNext())folder.createFile(Utilities.newBlob(bytes,'application/octet-stream',name));
  if(p.sequential===true&&number<count-1)return {ok:true,complete:false,part_index:number};
  const all=[];let size=0;
  for(let i=0;i<count;i++){
    const partName=opId+'.part.'+String(i).padStart(3,'0'),parts=folder.getFilesByName(partName);
    if(!parts.hasNext())return {ok:true,complete:false,part_index:number,next_part:i};
    // Check existence first. Do not reread already uploaded bytes on every part.
    all.push({file:parts.next()});
  }
  const content=[];
  for(const part of all){
    const segment=part.file.getBlob().getBytes();
    size+=segment.length;
    if(size>8*1024*1024)return {ok:false,code:'audio_size',message:'Audio is over 8 MB.'};
    segment.forEach(b=>content.push(b));
  }
  const ext=({'audio/webm':'.webm','audio/ogg':'.ogg','audio/mp4':'.m4a','audio/mpeg':'.mp3','audio/wav':'.wav','audio/x-wav':'.wav'})[mime];
  const finalName=opId+ext,found=folder.getFilesByName(finalName);
  const saved=found.hasNext()?found.next():folder.createFile(Utilities.newBlob(content,mime,finalName));
  index.appendRow([opId,target,targetKind,finalName,mime,saved.getId(),folder.getId(),new Date().toISOString(),size,fieldSheet,fieldRow||'',fieldCol]);
  all.forEach(part=>part.file.setTrashed(true));
  return {ok:true,complete:true,audio_id:opId,size:size};
}
/** Authenticated, paged binary read of private Drive audio. */
function bvlAudioRead_(rootId,templateId,p){
  const ss=bvlDoc_(rootId,templateId,bvlValidId_(p.doc_id));
  const audioId=String(p.audio_id||''),offset=Number(p.offset||0);
  if(!/^[a-f0-9-]{32,50}$/i.test(audioId)||!Number.isInteger(offset)||offset<0)
    return {ok:false,code:'audio_id',message:'Invalid audio reference.'};
  const record=bvlAudioEntry_(ss.getSheetByName(BVL.AUDIOS),audioId);
  if(!record)return {ok:false,code:'audio_not_found',message:'Original audio unavailable.'};
  const f=DriveApp.getFileById(bvlValidId_(record[5]));
  const dir=DriveApp.getFolderById(bvlValidId_(record[6]));
  if(f.isTrashed()||dir.isTrashed()||!bvlParentIs_(f,dir.getId())||!bvlParentIs_(dir,rootId))
    return {ok:false,code:'audio_missing',message:'Audio file was moved.'};
  const total=Number(f.getSize());
  if(!Number.isInteger(total)||total<1||total>8*1024*1024||offset>total)
    return {ok:false,code:'audio_size',message:'Audio exceeds supported read limit.'};
  const mime=String(record[4]);
  if(!['audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav','audio/x-wav'].includes(mime))
    return {ok:false,code:'audio_format',message:'Unsupported audio format.'};
  if(p.meta_only===true)return {ok:true,mime:mime,size:total,audio_id:audioId};
  const requested=p.length==null?524288:Number(p.length);
  if(!Number.isInteger(requested)||requested<1||requested>524288)
    return {ok:false,code:'audio_size',message:'Invalid audio range length.'};
  const end=Math.min(total,offset+requested);
  const slice=end===offset?[]:bvlDriveAudioRange_(f,offset,end,total);
  if(slice.length!==end-offset)return {ok:false,code:'audio_size',message:'Audio changed during read.'};
  return {ok:true,mime:String(record[4]),size:total,offset:offset,next:offset+slice.length,
    base64:Utilities.base64Encode(slice),audio_id:audioId};
}

/** Private Drive range. Never return an OAuth token, URL, or Drive ID to clients.
 * A legacy full-blob fallback preserves playback if the Drive API is disabled.
 * Strictly validate Content-Range and byte count before returning a partial response.
 */
function bvlDriveAudioRange_(file,start,end,total){
  try {
    const response=UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(file.getId())+'?alt=media&supportsAllDrives=true',{
      headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken(),Range:'bytes='+start+'-'+(end-1),'Accept-Encoding':'identity'},
      muteHttpExceptions:true,followRedirects:false
    });
    const status=response.getResponseCode();
    const bytes=response.getContent();
    if(status===206){
      const headers=response.getAllHeaders();
      const key=Object.keys(headers).find(k=>k.toLowerCase()==='content-range');
      if(key&&String(headers[key])==='bytes '+start+'-'+(end-1)+'/'+total&&bytes.length===end-start)return bytes;
    }
    if(status===200&&bytes.length===total)return bytes.slice(start,end);
  }catch(ignore){/* Compatibility fallback, without exposing provider credentials. */}
  const bytes=file.getBlob().getBytes();
  if(bytes.length!==total)return [];
  return bytes.slice(start,end);
}

/** Keep private thumbnails attached to their LOG ID after row sorting/movement. */
function bvlRepairPhotoAnchors_(log, index) {
  if (!index || index.getLastRow() < 2 || log.getLastRow() < 3) return;
  const images = log.getImages().filter(im =>
    /^BVLOG_PHOTO:/.test(String(im.getAltTextTitle() || '')));
  if (!images.length) return;
  const links = {};
  index.getRange(2,1,index.getLastRow()-1,2).getDisplayValues().forEach(row => {
    if (row[0] && row[1]) links[String(row[0])] = String(row[1]);
  });
  const currentRows = {};
  log.getRange(3,7,log.getLastRow()-2,1).getDisplayValues().forEach((row,i) => {
    if (row[0]) currentRows[String(row[0])] = i+3;
  });
  images.forEach(img => {
    const mediaId = String(img.getAltTextTitle()).slice('BVLOG_PHOTO:'.length);
    const row = currentRows[links[mediaId]];
    if (row && img.getAnchorCell().getRow() !== row) img.setAnchorCell(log.getRange(row,6));
  });
}

/** Per-document image index. Never store original image data or public links in Sheets. */
function bvlPhotoIndex_(ss) {
  let tab = ss.getSheetByName(BVL.PHOTOS);
  if (!tab) {
    tab = ss.insertSheet(BVL.PHOTOS);
    tab.appendRow(['media_op_id','log_entry_id','row_at_upload','original_id','preview_id','filename','timestamp','original_time','original_text','folder_id']);
    tab.hideSheet();
  }
  return tab;
}
function bvlPhotoRecord_(index, photoOpId) {
  if (!index || index.getLastRow() < 2) return null;
  const found = index.getRange(2,1,index.getLastRow()-1,1)
    .createTextFinder(String(photoOpId)).matchEntireCell(true).findNext();
  if (!found) return null;
  return index.getRange(found.getRow(),1,1,10).getDisplayValues()[0];
}
function bvlParentIs_(fileOrFolder, rootId) {
  const parents = fileOrFolder.getParents();
  while (parents.hasNext()) if (parents.next().getId() === rootId) return true;
  return false;
}
function bvlPhotoFolder_(folderId, ss) {
  const root = DriveApp.getFolderById(folderId);
  const props = PropertiesService.getScriptProperties();
  const propKey = 'BVLOG_PHOTO_FOLDER_' + ss.getId();
  const name = DriveApp.getFileById(ss.getId()).getName();
  const oldId = props.getProperty(propKey);
  if (oldId) {
    try {
      const saved = DriveApp.getFolderById(oldId);
      if (bvlParentIs_(saved, folderId) && !saved.isTrashed()) {
        if (saved.getName() !== name) saved.setName(name);
        return saved;
      }
    } catch (err) { /* The folder was removed; recreate safely. */ }
  }
  let result = null;
  // Migrate the original v0.4.x folder instead of splitting existing photos.
  const legacy = root.getFoldersByName('Снимки - ' + ss.getId());
  if (legacy.hasNext()) result = legacy.next();
  if (!result) {
    const named = root.getFoldersByName(name);
    while (named.hasNext()) {
      const candidate = named.next();
      if (candidate.getDescription() === 'BVLOG_PHOTOS_FOR:' + ss.getId()) {
        result = candidate; break;
      }
    }
  }
  if (!result) result = root.createFolder(name);
  if (result.getName() !== name) result.setName(name);
  result.setDescription('BVLOG_PHOTOS_FOR:' + ss.getId());
  props.setProperty(propKey, result.getId());
  return result;
}
function bvlSaveImage_(folder, filename, blob, status) {
  const current = folder.getFilesByName(filename);
  if(current.hasNext()){if(status)status.created=false;return current.next();}
  const file=folder.createFile(blob);if(status)status.created=true;return file;
}
function bvlInlineThumbnail_(log, row, blob, photoOpId) {
  // Blob-based overlay images are supported for private Drive files. Public IMAGE()
  // or CellImage source URLs would expose private operational photos.
  const already = log.getImages().some(im => {
    const cell = im.getAnchorCell();
    return cell.getColumn() === 6 && cell.getRow() === row &&
      /^BVLOG_PHOTO:/.test(String(im.getAltTextTitle() || ''));
  });
  if (already) return;
  log.setColumnWidth(6, 154);
  log.setRowHeight(row, Math.max(log.getRowHeight(row), 104));
  const image = log.insertImage(blob, 6, row, 8, 7);
  image.setWidth(135).setHeight(90)
    .setAltTextTitle('BVLOG_PHOTO:' + photoOpId)
    .setAltTextDescription('Снимка към LOG ' + row + ' (останалите са в BG Voice Logger)');
}
/** Upload image only after verifying its exact LOG row. Retry safe and folder lazy. */
function bvlAttachPhoto_(folderId, ss, p) {
  const log = ss.getSheetByName('LOG');
  const opId = String(p.op_id || '');
  if (!/^[a-f0-9-]{32,50}$/i.test(opId)) return {ok:false,code:'bad_id',message:'Invalid media ID.'};
  const mime = String(p.mime || '');
  if (!['image/jpeg','image/png','image/webp'].includes(mime)) return {ok:false,code:'media_type',message:'Unsupported image type.'};
  const encoded = String(p.base64 || '');
  if (!encoded || encoded.length > 3400000 || !/^[A-Za-z0-9+/=]+$/.test(encoded))
    return {ok:false,code:'media_size',message:'Image exceeds size limit.'};
  const data = Utilities.base64Decode(encoded);
  if (data.length < 20 || data.length > 2500000) return {ok:false,code:'media_size',message:'Image is too large.'};
  const previewEncoded = String(p.preview_base64 || '');
  if (previewEncoded && (previewEncoded.length > 500000 || !/^[A-Za-z0-9+/=]+$/.test(previewEncoded)))
    return {ok:false,code:'preview_size',message:'Preview exceeds size limit.'};
  const previewData = previewEncoded ? Utilities.base64Decode(previewEncoded) : null;
  if (previewData && (previewData.length < 20 || previewData.length > 350000))
    return {ok:false,code:'preview_size',message:'Invalid preview image.'};
  // On old queued uploads without a preview, a small original can be used.
  const thumbBlob = previewData ? Utilities.newBlob(previewData,'image/jpeg',opId+'-preview.jpg') :
    (data.length <= 1900000 ? Utilities.newBlob(data,mime,opId+'-preview') : null);
  if (!thumbBlob) return {ok:false,code:'preview_required',message:'Photo has no small preview. Retry from the current application.'};

  let row = 0;
  if (p.log_op_id) {
    row = bvlFindId_(log, 7, 3, String(p.log_op_id));
    if (!row) return {ok:false,code:'waiting_for_log',message:'The related LOG entry has not been saved yet.'};
  } else {
    row = Number(p.target_row || 0);
    if (!Number.isInteger(row) || row < 3 || row > 5000) return {ok:false,code:'media_target',message:'Invalid LOG row.'};
    const present = log.getRange(row,2,1,3).getDisplayValues()[0];
    if (String(p.expected_time || '') !== present[0] || String(p.expected_text || '') !== present[2])
      return {ok:false,code:'conflict',message:'The target LOG row was changed or moved. Refresh and choose it again.'};
    if (!present[2] || present[2].startsWith(BVL.DATE))
      return {ok:false,code:'media_target',message:'Cannot attach a photo to a date separator.'};
  }
  const logId = String(log.getRange(row,7).getDisplayValue() || p.log_op_id || opId);
  const index = bvlPhotoIndex_(ss);
  const earlier = bvlPhotoRecord_(index,opId);
  if (earlier) return {ok:true,photo_id:opId,row:row,deduplicated:true};

  const photoFolder = bvlPhotoFolder_(folderId,ss);
  const ext = mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : '.jpg';
  const name = opId + ext;
  const original = bvlSaveImage_(photoFolder,name,Utilities.newBlob(data,mime,name));
  const previewStatus={};
  const preview = bvlSaveImage_(photoFolder,opId+'-preview.jpg',thumbBlob,previewStatus);
  // Use exactly the bytes just saved; on retry use the already persisted file.
  bvlInlineThumbnail_(log,row,previewStatus.created?thumbBlob:preview.getBlob(),opId);
  if (!log.getRange(row,7).getDisplayValue()) log.getRange(row,7).setValue(logId);
  const cell = log.getRange(row,6);
  if (!cell.getDisplayValue()) cell.setValue('📷');
  const oldTime = String(p.expected_time || log.getRange(row,2).getDisplayValue());
  const oldText = String(p.expected_text || log.getRange(row,4).getDisplayValue());
  index.appendRow([opId,logId,row,original.getId(),preview.getId(),bvlSafeText_(p.filename||name,100),new Date().toISOString(),oldTime,oldText,photoFolder.getId()]);
  const count = index.getRange(2,2,index.getLastRow()-1,1).getDisplayValues().filter(x=>x[0] === logId).length;
  cell.setNote(count + ' снимки; първата е показана тук, всички са достъпни през приложението.');
  return {ok:true,row:row,photo_id:opId,count:count,folder_id:photoFolder.getId()};
}
/** Private authenticated image loading; only a photo indexed for that doc is served. */
function bvlPhotoRead_(folderId,templateId,p) {
  const ss = bvlDoc_(folderId,templateId,bvlValidId_(p.doc_id));
  const photoId = String(p.photo_id || '');
  if (!/^[a-f0-9-]{32,50}$/i.test(photoId))
    return {ok:false,code:'photo_id',message:'Invalid photo ID.'};
  const index = ss.getSheetByName(BVL.PHOTOS);
  const record = bvlPhotoRecord_(index, photoId);
  if (!record) return {ok:false,code:'photo_not_found',message:'Photo is not indexed for this action.'};
  const fileId = bvlValidId_(p.variant === 'original' ? record[3] : record[4]);
  if (!fileId) return {ok:false,code:'photo_missing',message:'Photo file ID is invalid.'};
  const file = DriveApp.getFileById(fileId);
  if (file.isTrashed() || !bvlParentIs_(file,String(record[9] || '')))
    return {ok:false,code:'photo_missing',message:'Photo was moved or removed from the incident folder.'};
  const folder = DriveApp.getFolderById(String(record[9] || ''));
  if (!bvlParentIs_(folder,folderId))
    return {ok:false,code:'photo_moved',message:'Photo folder is no longer inside the configured Drive directory.'};
  const blob=file.getBlob();
  const bytes=blob.getBytes();
  if (bytes.length > 2500000) return {ok:false,code:'photo_size',message:'Photo exceeds preview limit.'};
  return {ok:true,photo_id:photoId,mime:blob.getContentType(),base64:Utilities.base64Encode(bytes),filename:String(record[5]||'photo.jpg')};
}
