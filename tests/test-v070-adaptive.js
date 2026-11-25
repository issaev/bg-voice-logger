// BG Voice Logger v0.7.0 - adaptive INFO and strict dropdown preservation.
const assert=require('assert');
const fs=require('fs');const vm=require('vm');
const code=fs.readFileSync(__dirname+'/../apps-script/Code.gs','utf8');
const ctx={
  SpreadsheetApp:{DataValidationCriteria:{VALUE_IN_LIST:'LIST',VALUE_IN_RANGE:'RANGE'},CopyPasteType:{PASTE_FORMAT:'FORMAT'}},
  console,
};vm.createContext(ctx);vm.runInContext(code,ctx);
const proper='\u041d\u0430\u0432\u043e\u0434\u043d\u0435\u043d\u0438\u0435';
const misspelled='\u041d\u0430\u0432\u043e\u0434\u0435\u043d\u0438\u0435';
function validated(allowed){
  let value='',updates=0;
  return {getDataValidation:()=>({getCriteriaType:()=>ctx.SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST,
    getCriteriaValues:()=>[allowed]}),setDataValidation:()=>{updates++;},setValue:x=>{value=x;},
    values:()=>({value,updates})};
}
let cell=validated(['\u041f\u043e\u0436\u0430\u0440',proper,'\u0418\u0437\u0434\u0438\u0440\u0432\u0430\u043d\u0435']);
assert.strictEqual(ctx.bvlValidationAwareSet_(cell,proper).ok,true);
assert.deepStrictEqual(cell.values(),{value:proper,updates:0},'Validation and chip colours must not be rewritten');
cell=validated([misspelled]);
assert.strictEqual(ctx.bvlValidationAwareSet_(cell,proper).ok,true);
assert.deepStrictEqual(cell.values(),{value:misspelled,updates:0},'Legacy spelling must be selected without changing dropdown rule');
cell=validated(['\u041f\u043e\u0436\u0430\u0440']);
assert.strictEqual(ctx.bvlValidationAwareSet_(cell,proper).code,'validation_choice');
assert.deepStrictEqual(cell.values(),{value:'',updates:0},'Unrecognized options must be rejected');

class Sheet {
  constructor(){this.grid=Array.from({length:44},()=>Array(5).fill(''));
    this.grid[1]=['\u041a\u043e\u043b\u043e\u043d\u0430 1','\u0418\u043d\u0444\u043e','\u041a\u043e\u043c\u0435\u043d\u0442\u0430\u0440 / \u043b\u0438\u043d\u043a','\u0414\u043e\u043f\u044a\u043b\u043d\u0438\u0442\u0435\u043b\u043d\u0430 \u0438\u043d\u0444\u043e\u0440\u043c\u0430\u0446\u0438\u044f',''];
    this.grid[2][0]='\u0410\u043a\u0446\u0438\u044f';
    this.grid[3][0]='\u041b\u043e\u043a\u0430\u0446\u0438\u044f';
    this.grid[24][0]='\u041c\u0435\u0434\u0438\u0446\u0438\u043d\u0441\u043a\u0438 \u043a\u043e\u043e\u0440\u0434\u0438\u043d\u0430\u0442\u043e\u0440';
    this.grid[26][1]='\u0414\u0410\u0422\u0410:';
    this.grid[27]=this.grid[1].slice();this.grid[28][0]='\u0410\u043a\u0446\u0438\u044f';
    this.grid[29][0]='\u041b\u043e\u043a\u0430\u0446\u0438\u044f';
  }
  getLastRow(){return this.grid.length;}
  getLastColumn(){return 5;}
  getMaxRows(){return this.grid.length+200;}
  getRange(a,b,c=1,d=1){
    let row=a,col=b;
    if(typeof a==='string'){const m=a.match(/^([A-Z]+)(\d+)$/);col=m[1].split('').reduce((n,x)=>n*26+x.charCodeAt(0)-64,0);row=Number(m[2]);}
    const sheet=this;
    return {getDisplayValues(){return Array.from({length:c},(_,i)=>Array.from({length:d},(_,j)=>String(sheet.grid[row+i-1]?.[col+j-1]||'')));},
      getDataValidation(){return row===3||row===29?{getCriteriaType:()=>ctx.SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST,getCriteriaValues:()=>[['\u0418\u0437\u0431\u0435\u0440\u0438 \u043e\u0442 \u043c\u0435\u043d\u044e\u0442\u043e',proper]]}:null;},
      clearDataValidations(){},copyTo(){},setValue(value){sheet.grid[row-1][col-1]=value;}};
  }
  insertRowsBefore(row,count){for(let i=0;i<count;i++)this.grid.splice(row-1,0,Array(5).fill(''));}
}
const sh=new Sheet();
const sections=ctx.bvlInfoSections_(sh);
assert.strictEqual(sections.length,2,'INFO must recognize repeated date blocks');
assert.ok(sections[0].rows.some(x=>x.label==='\u041c\u0435\u0434\u0438\u0446\u0438\u043d\u0441\u043a\u0438 \u043a\u043e\u043e\u0440\u0434\u0438\u043d\u0430\u0442\u043e\u0440'),'Manual roles must appear');
assert.ok(sections[0].columns.some(x=>x.label.indexOf('\u041a\u043e\u043c\u0435\u043d\u0442\u0430\u0440')>=0));
assert.ok(sections[0].rows.find(x=>x.label==='\u0410\u043a\u0446\u0438\u044f').fields[0].choices.includes(proper));
const target=ctx.bvlFindInfoField_(sh,{section:0,row:21,col:'B',field_label:'\u041c\u0435\u0434\u0438\u0446\u0438\u043d\u0441\u043a\u0438 \u043a\u043e\u043e\u0440\u0434\u0438\u043d\u0430\u0442\u043e\u0440',header_label:'\u0418\u043d\u0444\u043e'});
assert.strictEqual(target.row,25,'Manual moved row must be resolved by its label');
ctx.bvlEnsureRows_=()=>{};
const out=ctx.bvlInfoAddRow_({getSheetByName:name=>name==='INFO'?sh:null},{section:0,role:'\u041a\u043e\u043e\u0440\u0434\u0438\u043d\u0430\u0442\u043e\u0440 3',values:['\u0418\u0432\u0430\u043d', '0888']});
assert.strictEqual(out.ok,true);
assert.strictEqual(sh.grid[out.row-1][0],'\u041a\u043e\u043e\u0440\u0434\u0438\u043d\u0430\u0442\u043e\u0440 3');
assert.strictEqual(sh.grid[out.row-1][1],'\u0418\u0432\u0430\u043d');
assert.strictEqual(sh.grid[out.row][1],'\u0414\u0410\u0422\u0410:','Date divider must remain intact after adding role');
// INFO labels and values may be moved to different physical columns.
const moved=new Sheet();
for(let i=2;i<moved.grid.length;i++){
  const label=moved.grid[i][0];
  if(label){moved.grid[i][0]='';moved.grid[i][1]=label;}
}
moved.grid[1]=['\u041a\u043e\u043c\u0435\u043d\u0442\u0430\u0440','\u041a\u043e\u043b\u043e\u043d\u0430 1','\u0418\u043d\u0444\u043e','\u0414\u043e\u043f\u044a\u043b\u043d\u0438\u0442\u0435\u043b\u043d\u0430 \u0438\u043d\u0444\u043e\u0440\u043c\u0430\u0446\u0438\u044f',''];
moved.grid[27]=moved.grid[1].slice();
const reordered=ctx.bvlInfoSections_(moved);
assert.strictEqual(reordered[0].labelCol,2,'Moved label column must be found by header');
assert.strictEqual(reordered[0].columns[0].letter,'C','INFO value must remain primary after column movement');
assert.strictEqual(ctx.bvlFindInfoField_(moved,{section:0,row:3,col:'B',field_label:'\u0410\u043a\u0446\u0438\u044f',header_label:'\u0418\u043d\u0444\u043e'}).col,'C');
// Missing unrelated tabs must not block a LOG-only operation.
const headers={};
const logOnly={getSheetByName:name=>name==='LOG'?{getRange:ref=>({getDisplayValue:()=>headers[ref]||'',getDisplayValues:()=>[['G1','H1','I1','J1'].map(k=>headers[k]||'')],setValues:rows=>{rows[0].forEach((v,i)=>headers[['G1','H1','I1','J1'][i]]=v);},setValue:v=>{headers[ref]=v;}}),hideColumns:()=>{}}:null};
ctx.bvlMeta_=()=>({});
assert.ok(ctx.bvlPrepare_(logOnly,'LOG'));
assert.strictEqual(headers.G1,'BVLOG_ID');
assert.throws(()=>ctx.bvlPrepare_(logOnly,'TEAM'),/TEAM tab was removed/);
const php=fs.readFileSync(__dirname+'/../bg-voice-logger.php','utf8');
assert.ok(php.includes("defined('BVLOG_DEFAULT_TEMPLATE_ID')"), 'Template ID must be configurable in the public source');
const js=fs.readFileSync(__dirname+'/../assets/app.js','utf8');
assert.ok(js.includes("B('Otvori tablitsata')"));
assert.ok(js.includes('INFO_SECTIONS')&&js.includes('addInfoRole'));
console.log('PASS v0.7.0: strict dropdown retains native colours; legacy alias; dynamic INFO sections, manual roles and insertion; correct template and sheet link.');
