// Uses actual browser SMS functions and actual Apps Script receipt functions.
// No SMS, Google, WordPress or provider network calls.
async function runSmsTests(app,gas,sign){
  const check=(v,m)=>{if(!v)throw Error(m);};const passed=[];
  const start=app.indexOf('  // SMS pilot protocol DK1.'),end=app.indexOf('  // One journal feed:',start);
  check(start>=0&&end>start,'protocol extraction');
  const p=new Function(app.slice(start,end)+'\nreturn {smsB64,smsBytes,smsUuid,smsUnits,smsFits,makeSmsPlan,smsComposerUrl};')();
  const key=Uint8Array.from({length:32},(_,i)=>i),entry={doc_id:'SYNTHETIC_DOCUMENT_0001',op_id:'550e8400-e29b-41d4-a716-446655440000',
    event_at:'2026-11-24T12:35:00.999Z',source:'text',text:'Team 2 arrived.'};
  const grant={doc_id:entry.doc_id,phone:'+359880000001',alias:'AbCd0123',expires:Math.floor(Date.now()/1000)+86400,key:p.smsB64(key)};
  const one=await p.makeSmsPlan(entry,grant,sign);check(one.parts.length===1&&p.smsFits(one.parts[0]),'one ASCII message');
  check(one.parts[0].slice(11,33)==='VQ6EAOKbQdSnFkRmVUQAAA','UUID canonical 22 chars');
  check(p.smsBytes(p.smsUuid(entry.op_id)).length===16,'UUID not truncated');
  passed.push('single GSM message + reversible UUID');
  const text='Екип 2 достигна контролна точка 4. Продължаваме на север.\nСледващ ред: | кавички " и emoji 👨‍👩‍👧‍👦.';
  const long=await p.makeSmsPlan({...entry,text},grant,sign);
  const split=long.parts.map(s=>s.slice(s.indexOf('\n')+1));
  check(long.parts.length>=3&&long.parts.every(p.smsFits)&&split.join('')===text,'independent SMS and exact Unicode reconstruction');
  for(const part of split)check(part.length>0,'every independently delivered part has readable content');
  check(long.parts[0].split('\n')[0].length===60&&long.parts[1].split('\n')[0].length===37,'compact headers');
  passed.push('readable independent Unicode fragments and exact reassembly');
  const reverse=long.parts.slice().reverse();
  const collected=new Map();for(const wire of reverse.concat(reverse[0]))collected.set(parseInt(wire.slice(33,35),36),wire.slice(wire.indexOf('\n')+1));
  check([...collected.keys()].sort((a,b)=>a-b).map(i=>collected.get(i)).join('')===text,'reverse order and repeated fragment fixture');
  collected.delete(2);check(collected.size===long.parts.length-1,'incomplete group not complete');
  passed.push('out-of-order and missing-part fixtures');
  check(p.smsUnits('^{}[]~|').units===14&&p.smsUnits('😀').units===2,'GSM extensions and UTF16 accounting');
  const full=await p.makeSmsPlan({...entry,text:'а'.repeat(3000)},grant,sign);
  check(full.parts.length<=96&&full.parts.every(p.smsFits),'maximum text bounded');passed.push('GSM-7 extension, Unicode and max length');
  const again=await p.makeSmsPlan({...entry,text},grant,sign);check(JSON.stringify(again.parts)===JSON.stringify(long.parts),'deterministic retry');
  const altered=await p.makeSmsPlan({...entry,text:text+' X'},grant,sign);
  check(altered.parts[0].slice(44,60)!==long.parts[0].slice(44,60),'HMAC changes on modified text');
  let rejected=false;try{await p.makeSmsPlan(entry,{...grant,expires:0},sign);}catch(e){rejected=true;}check(rejected,'expired grant refused');
  rejected=false;try{await p.makeSmsPlan(entry,{...grant,doc_id:'OTHER'},sign);}catch(e){rejected=true;}check(rejected,'cross-incident refused');
  passed.push('deterministic signing, changed text, expired and cross-incident grant');
  check(p.smsComposerUrl(grant.phone,one.parts[0],false).includes('?body=')&&p.smsComposerUrl(grant.phone,one.parts[0],true).includes('&body='),'platform composer variants');
  check(app.includes('smsAction(o)')&&app.includes("CFG.sms_pilot")&&app.includes('smsRequestRef.current++'),'gated UI + identity cancellation');passed.push('gated manual composer UI');
  const stored=[];const meta={appendRow:row=>stored.push(row),getLastRow:()=>stored.length+1,getRange:(r,c,n,w)=>({
    createTextFinder:value=>({matchEntireCell:()=>({findNext:()=>{let k=stored.findIndex(row=>row[c-1]===value);return k<0?null:{getRow:()=>k+2};}})}),
    getDisplayValue:()=>String(stored[r-2]?.[c-1]||'')})};
  const g=new Function(gas+'\nreturn {stamp:bvlStamp_,conflict:bvlSmsConflict_};')();
  const payload={kind:'log',op_id:entry.op_id,payload_hash:'a'.repeat(64),transport:'sms',source:'text',author:'Synthetic'};
  g.stamp(meta,payload,{ok:true,row:3});
  check(!g.conflict(meta,payload,entry.op_id),'identical SMS receipt dedup');
  check(g.conflict(meta,{...payload,payload_hash:'b'.repeat(64)},entry.op_id),'conflicting original rejected');
  check(g.conflict(meta,payload,'legacy-id'),'unknown legacy original fails closed for SMS');
  check(!g.conflict(meta,{kind:'log',op_id:'old'},'old'),'normal legacy receipt stays compatible');
  const receipt=JSON.parse(stored[0][4]);check(receipt.transport==='sms'&&receipt.source==='text','source and transport in receipt');
  passed.push('GAS immutable hash and legacy compatibility');
  return {passed,fixture:{entry:{...entry,text},key:grant.key,alias:grant.alias,parts:long.parts}};
}

const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');const root=path.join(__dirname,'..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');runSmsTests(read('assets/app.js'),read('apps-script/Code.gs'),(key,text)=>crypto.createHmac('sha256',key).update(text,'utf8').digest()).then(x=>console.log('PASS',x.passed)).catch(e=>{console.error(e);process.exitCode=1});
