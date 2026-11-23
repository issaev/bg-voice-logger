/**
 * BG Voice Logger - Google Apps Script bridge v0.7.0.
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

function doPost(e) {
  let result;
  try {
    const req = JSON.parse(e && e.postData && e.postData.contents || '{}');
    const expected = PropertiesService.getScriptProperties().getProperty('BVLOG_SHARED_SECRET');
    if (!expected || expected.length < 24 || !req.secret || req.secret !== expected) {
      result = {ok: false, code: 'unauthorized', message: 'Invalid bridge credential.'};
    } else {
      result = bvlDispatch_(req);
    }
  } catch (err) {
    result = {ok: false, code: 'script_error', message: String(err && err.message || err).slice(0, 250)};
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
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
    return {ok:true, folder:folder.getName(), template:template.getName(), version:'0.7.0'};
  }
  if (action === 'list') return bvlList_(folderId, templateId);
  if (action === 'read') return bvlRead_(folderId, templateId, payload.doc_id);
  if (action === 'photo_read') return bvlPhotoRead_(folderId, templateId, payload);
  if (action === 'audio_read') return bvlAudioRead_(folderId, templateId, payload);
  if (action === 'create' || action === 'operation') {
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(25000)) return {ok:false, code:'busy', message:'Google is processing another operator; retry safely.'};
    try {
      if (action === 'create') return bvlCreate_(folderId, templateId, payload);
      return bvlOperation_(folderId, templateId, payload);
    } finally { lock.releaseLock(); }
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
function bvlDoc_(folderId, templateId, docId) {
  if (!bvlValidId_(docId) || docId === templateId) throw new Error('Invalid operation document.');
  const file = DriveApp.getFileById(docId);
  if (file.getMimeType() !== BVL.MIME || file.isTrashed()) throw new Error('Not a live Google spreadsheet.');
  const parents = file.getParents();
  let inFolder = false;
  while (parents.hasNext()) if (parents.next().getId() === folderId) inFolder = true;
  if (!inFolder) throw new Error('This spreadsheet does not belong to the configured folder.');
  return SpreadsheetApp.openById(docId);
}
function bvlList_(folderId, templateId) {
  const folder = DriveApp.getFolderById(folderId);
  const iter = folder.getFilesByType(MimeType.GOOGLE_SHEETS);
  const files = [];
  while (iter.hasNext()) {
    const file = iter.next();
    if (file.getId() === templateId || file.isTrashed()) continue;
    files.push({id:file.getId(), name:file.getName(), created:file.getDateCreated().toISOString(), url:file.getUrl()});
    if (files.length >= 250) break;
  }
  files.sort((a,b) => b.created.localeCompare(a.created));
  return {ok:true, documents:files, action_types:bvlTypeOptions_(templateId)};
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
function bvlInfoSections_(sheet) {
  if(!sheet)return [];
  const height=Math.min(Math.max(sheet.getLastRow(),45),750);
  const width=Math.min(Math.max(sheet.getLastColumn(),4),15);
  const grid=sheet.getRange(1,1,height,width).getDisplayValues();
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
  for(const section of sections)for(const row of section.rows){
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
function bvlTypeOptions_(templateId) {
  const source=SpreadsheetApp.openById(templateId);
  const info=source.getSheetByName('INFO');
  const first=bvlInfoSections_(info)[0];
  const row=first&&first.rows.find(r=>bvlNorm_(r.label)===bvlNorm_('\u0410\u043a\u0446\u0438\u044f'));
  const menu=row&&row.fields[0]&&row.fields[0].choices || [];
  const placeholder=bvlNorm_('\u0418\u0437\u0431\u0435\u0440\u0438 \u043e\u0442 \u043c\u0435\u043d\u044e\u0442\u043e');
  return menu.length ? menu.filter(x=>bvlNorm_(x)!==placeholder) : BVL.TYPES.map(bvlCanonicalType_);
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

function bvlCreate_(folderId, templateId, payload) {
  const folder = DriveApp.getFolderById(folderId);
  const requestId = String(payload.create_id || '');
  const idempotentKey = /^[a-f0-9-]{32,50}$/i.test(requestId) ? 'BVLOG_CREATE_' + requestId : '';
  if (idempotentKey) {
    const existing = PropertiesService.getScriptProperties().getProperty(idempotentKey);
    if (existing) {
      try {
        const earlier = bvlDoc_(folderId,templateId,existing);
        return {ok:true,document:{id:existing,name:DriveApp.getFileById(existing).getName(),url:earlier.getUrl()},deduplicated:true};
      } catch(err) { /* Deleted file or moved folder; proceed with a new copy. */ }
    }
  }
  const type = bvlSafeText_(payload.type, 60);
  const place = bvlSafeText_(payload.place, 100);
  if (!bvlTypeOptions_(templateId).includes(bvlCanonicalType_(type))) return {ok:false,code:'action_type',message:'Choose a valid action type from the current template.'};
  if (!place || /[\r\n\\/<>]/.test(place)) return {ok:false,code:'place',message:'Location is required; avoid path separators.'};
  const now = new Date();
  const base = bvlISODate_(now) + ' - ' + BVL.DKA + ' - ' + bvlCanonicalType_(type) + ' - ' + place;
  let name = base, suffix = 2;
  while (folder.getFilesByName(name).hasNext()) { name = base + ' (' + suffix++ + ')'; }
  const template = DriveApp.getFileById(templateId);
  const copy = template.makeCopy(name, folder);
  try {
    const ss = SpreadsheetApp.openById(copy.getId());
    const info = ss.getSheetByName('INFO'), log = ss.getSheetByName('LOG');
    if (!info || !log || !ss.getSheetByName('TECH') || !ss.getSheetByName('TEAM')) {
      throw new Error('The template must contain INFO, LOG, TECH, TEAM tabs.');
    }
    const first=bvlInfoSections_(info)[0];
    const action=first&&first.rows.find(r=>bvlNorm_(r.label)===bvlNorm_('\u0410\u043a\u0446\u0438\u044f'));
    if(!action)throw new Error('Template INFO action type row is missing.');
    const valueCell=info.getRange(action.fields[0].col+action.row);
    const valid=bvlValidationAwareSet_(valueCell,bvlCanonicalType_(type));
    if(!valid.ok)throw new Error(valid.message);
    // Location remains empty until an operator explicitly records actual GPS/location.
    const placeRow=first.rows.find(r=>bvlNorm_(r.label)===bvlNorm_('\u041b\u043e\u043a\u0430\u0446\u0438\u044f'));
    if(placeRow)info.getRange(placeRow.fields[0].col+placeRow.row).clearContent();
    info.getRange(Math.max(1,first.headerRow-1),Math.min(3,info.getMaxColumns())).setValue(bvlDate_(now));
    log.getRange('D2').setValue(BVL.DATE + ' ' + bvlDate_(now));
    bvlPrepare_(ss);
    SpreadsheetApp.flush();
    if (idempotentKey) PropertiesService.getScriptProperties().setProperty(idempotentKey,copy.getId());
    return {ok:true, document:{id:copy.getId(),name:name,created:now.toISOString(),url:copy.getUrl()}};
  } catch (err) {
    try {copy.setTrashed(true);}catch(ignore){}
    throw err;
  }
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
    for(const pair of technical){
      const address=pair[0]+header;
      const current=sh.getRange(address).getDisplayValue();
      if(current&&current!==pair[1])throw new Error(name+' '+address+
        ' is already in use. Refusing to overwrite manually added data.');
      if(!current)sh.getRange(address).setValue(pair[1]);
    }
    if(name==='LOG')sh.hideColumns(7,2);
    else sh.hideColumns(name==='TEAM'?9:6);
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
  meta.appendRow([p.op_id, p.kind, new Date().toISOString(), p.author || '', JSON.stringify(result).slice(0,1000)]);
}
function bvlEnd_(sheet, firstRow, firstCol, columnCount) {
  const last = sheet.getLastRow();
  if (last < firstRow) return firstRow - 1;
  const range = sheet.getRange(firstRow,firstCol,last-firstRow+1,columnCount).getDisplayValues();
  let end = firstRow - 1;
  for (let i=0;i<range.length;i++) {
    if (range[i].some(v => String(v).trim() !== '')) end = firstRow + i;
  }
  return end;
}
function bvlOperation_(folderId, templateId, payload) {
  const docId = bvlValidId_(payload.doc_id);
  const opId = String(payload.op_id || '');
  if (!/^[a-f0-9-]{32,50}$/i.test(opId)) return {ok:false,code:'bad_id',message:'Invalid operation ID.'};
  const ss = bvlDoc_(folderId, templateId, docId);
  const needed=payload.kind==='field'||payload.kind==='add_row' ? String(payload.sheet||'') :
    payload.kind==='audio_part'&&payload.target_kind==='field' ? String(payload.field_sheet||'') : 'LOG';
  const meta = bvlPrepare_(ss,needed);
  if (bvlDone_(meta, opId)) return {ok:true,deduplicated:true,complete:payload.kind==='audio_part'};
  let existingRow = 0;
  if (payload.kind === 'log') existingRow = bvlFindId_(ss.getSheetByName('LOG'), 7, 3, opId);
  if (payload.kind === 'add_row' && payload.sheet === 'TEAM') existingRow = bvlFindId_(ss.getSheetByName('TEAM'), 9, 3, opId);
  if (payload.kind === 'add_row' && payload.sheet === 'TECH') existingRow = bvlFindId_(ss.getSheetByName('TECH'), 6, 3, opId);
  if (existingRow) {
    const dedup = {ok:true,deduplicated:true,row:existingRow};
    bvlStamp_(meta,payload,dedup);
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
  if (result.ok && (payload.kind !== 'audio_part' || result.complete)) bvlStamp_(meta, payload, result);
  SpreadsheetApp.flush();
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
    serial+1, bvlTime_(eventAt), bvlCell_(p.author||''), bvlCell_(text), p.source === 'text' ? BVL.TEXT : BVL.VOICE, '', String(p.op_id), ''
  ]]);
  return {ok:true, row:nextRow, date:date, late:isLate};
}
function bvlField_(ss,p) {
  const name=String(p.sheet||'');
  if(!['INFO','TEAM','TECH'].includes(name))return {ok:false,code:'protected_range',message:'Unknown editable sheet.'};
  const sheet=ss.getSheetByName(name);
  if(!sheet)return {ok:false,code:'sheet_missing',message:name+' was removed. Other tabs remain available.'};
  let row=Number(p.row),col=String(p.col||'').toUpperCase();
  if(name==='INFO'){
    const target=bvlFindInfoField_(sheet,p);
    if(target.error)return {ok:false,code:'row_moved',message:target.error};
    row=target.row;col=target.col;
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
  const isAction=name==='INFO'&&bvlNorm_(p.field_label)===bvlNorm_('\u0410\u043a\u0446\u0438\u044f');
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
function bvlRead_(folderId, templateId, docId) {
  const ss = bvlDoc_(folderId,templateId,docId);
  const info = ss.getSheetByName('INFO'), log = ss.getSheetByName('LOG');
  const team = ss.getSheetByName('TEAM'), tech = ss.getSheetByName('TECH');
  const data = {};
  data.MISSING_TABS=['INFO','LOG','TEAM','TECH'].filter(name=>!ss.getSheetByName(name));
  const infoSections=bvlInfoSections_(info);
  data.INFO_SECTIONS=infoSections;
  data.INFO=info?info.getRange(1,1,Math.min(Math.max(info.getLastRow(),34),150),4).getDisplayValues():[];
  let logStart=2,lr=[],photoRich=[];
  if(log){
    const logEnd=bvlEnd_(log,2,2,6);
    logStart=Math.max(2,logEnd-119);
    lr=log.getRange(logStart,1,Math.max(1,logEnd-logStart+1),8).getDisplayValues();
    // Repair only photos owned by the application, preserving manual changes.
    bvlRepairPhotoAnchors_(log, ss.getSheetByName(BVL.PHOTOS));
    photoRich=log.getRange(logStart,6,Math.max(1,logEnd-logStart+1),1).getRichTextValues();
  }
  const byLogId = {};
  const gallery = ss.getSheetByName(BVL.PHOTOS);
  if (gallery && gallery.getLastRow() >= 2) {
    const stored = gallery.getRange(2,1,gallery.getLastRow()-1,10).getDisplayValues();
    stored.forEach(record => {
      const logId = String(record[1] || '');
      const mediaId = String(record[0] || '');
      if (!logId || !mediaId) return;
      if (!byLogId[logId]) byLogId[logId] = [];
      byLogId[logId].push({id:mediaId, text:record[5] || 'Снимка', url:'', managed:true});
    });
  }
  const byAudio = {}, byFieldAudio = {};
  const audioIndex = ss.getSheetByName(BVL.AUDIOS);
  if (audioIndex && audioIndex.getLastRow() >= 2) {
    audioIndex.getRange(2,1,audioIndex.getLastRow()-1,12).getDisplayValues().forEach(r => {
      if(r[2] === 'log' && r[1] && r[0])byAudio[String(r[1])] = {id:String(r[0]),mime:String(r[4]||''),bytes:Number(r[8]||0)};
      if(r[2] === 'field' && r[9] && r[10] && r[11]){
        const fieldKey=String(r[9])+':'+String(r[11])+String(r[10]);
        if (!byFieldAudio[fieldKey]) byFieldAudio[fieldKey] = [];
        byFieldAudio[fieldKey].push({id:String(r[0]),mime:String(r[4]||''),bytes:Number(r[8]||0)});
      }
    });
  }
  data.FIELD_AUDIO=byFieldAudio;
  const byHistory = {};
  const audit = ss.getSheetByName(BVL.HISTORY);
  if (audit && audit.getLastRow() >= 2) {
    audit.getRange(2,1,audit.getLastRow()-1,8).getDisplayValues().forEach(r => {
      const key = String(r[1]||'');
      if (!key) return;
      if (!byHistory[key]) byHistory[key] = [];
      byHistory[key].push({at:String(r[3]||''),author:String(r[4]||''),action:String(r[2]||''),before:String(r[5]||''),after:String(r[6]||'')});
    });
  }
  data.LOG = lr.map((v,i) => {
    // Old v0.4.x hyperlinks continue to display without making files public.
    const legacy = photoRich[i] && photoRich[i][0] ? photoRich[i][0].getRuns()
      .filter(run => run.getLinkUrl() && /^https:\/\/drive\.google\.com\//.test(run.getLinkUrl()))
      .map(run=>({text:run.getText(),url:run.getLinkUrl(),managed:false})) : [];
    return {row:logStart+i,cells:v.slice(0,7),status:String(v[7]||''),
      audio:byAudio[String(v[6]||'')]||null, history:(byHistory[String(v[6]||'')]||[]).slice(-8),
      photos:(byLogId[String(v[6] || '')] || []).concat(legacy)};
  }).filter(x => x.cells.slice(1,7).some(Boolean));
  for (const name of ['TEAM','TECH']) {
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

  return {ok:true,id:docId,name:DriveApp.getFileById(docId).getName(),url:ss.getUrl(),data:data};
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
  const all=[];let size=0;
  for(let i=0;i<count;i++){
    const partName=opId+'.part.'+String(i).padStart(3,'0'),parts=folder.getFilesByName(partName);
    if(!parts.hasNext())return {ok:true,complete:false,part_index:number};
    const part=parts.next(),segment=part.getBlob().getBytes();all.push({file:part,bytes:segment});size+=segment.length;
    if(size>8*1024*1024)return {ok:false,code:'audio_size',message:'Audio is over 8 MB.'};
  }
  const content=[];all.forEach(p=>p.bytes.forEach(b=>content.push(b)));
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
  const bytes=f.getBlob().getBytes(),total=bytes.length;
  if(total>8*1024*1024||offset>total)return {ok:false,code:'audio_size',message:'Audio exceeds supported read limit.'};
  // 512 KiB per response: 16 requests for 8 MiB rather than 43.
  // Base64 stays below WordPress' 1 MiB response limit.
  const slice=bytes.slice(offset,Math.min(total,offset+524288));
  return {ok:true,mime:String(record[4]),size:total,offset:offset,next:offset+slice.length,
    base64:Utilities.base64Encode(slice),audio_id:audioId};
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
function bvlSaveImage_(folder, filename, blob) {
  const current = folder.getFilesByName(filename);
  return current.hasNext() ? current.next() : folder.createFile(blob);
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
  const preview = bvlSaveImage_(photoFolder,opId+'-preview.jpg',thumbBlob);
  // Do not overwrite legacy linked photo cells; new photos remain fully indexed.
  bvlInlineThumbnail_(log,row,preview.getBlob(),opId);
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
