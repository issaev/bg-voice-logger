const fs=require("node:fs"),path=require("node:path");
function testFence(source){
    const doc="SYNTHETIC_DOCUMENT_0001",other="SYNTHETIC_DOCUMENT_0002",folder="SYNTHETIC_FOLDER_000001",template="SYNTHETIC_TEMPLATE_0001";
    const rollout="synthetic-rollout";
    let raw="",held=false,busy=false,mutations=0,locks=0,releases=0,reads=0;
    const assert=(x,m)=>{if(!x)throw Error(m);};
    const props={getScriptProperties:()=>({getProperty:k=>{assert(k==="BVLOG_DIRECT_WRITE_FENCES","property");return raw;}})};
    const lock={getScriptLock:()=>({tryLock:()=>{if(busy)return false;assert(!held,"not recursive");held=true;locks++;return true;},releaseLock:()=>{assert(held,"lock held");held=false;releases++;}})};
    const mock={doc:()=>{assert(held,"policy check under lock");return {};},write:()=>{assert(held,"legacy write under lock");mutations++;return {ok:true};},read:()=>{reads++;return {ok:true};}};
    const dispatch=new Function("PropertiesService","LockService","mock",source+"\nbvlTrace_=()=>{};bvlDoc_=mock.doc;bvlOperation_=mock.write;bvlRead_=mock.read;return bvlDispatch_;")(props,lock,mock);
    const req=(action,id=doc)=>dispatch({action,folder_id:folder,template_id:template,payload:{doc_id:id}});
    assert(req("operation").ok&&mutations===1,"legacy behavior unchanged with no fence");
    raw=JSON.stringify({[doc]:rollout});
    assert(req("operation").code==="writer_fenced"&&mutations===1,"fenced doc not mutated");
    assert(req("operation",other).ok&&mutations===2,"other incidents unaffected");
    let r=req("writer_policy");assert(r.ok&&r.policy==="direct_log_only_v1"&&r.fence_rollout===rollout,"verified rollout proof");
    r=req("writer_policy",other);assert(r.ok&&r.fence_rollout==="","no false fence proof");
    assert(req("read").ok&&reads===1,"read remains available");
    raw="not JSON";let rejected=false;try{req("operation");}catch(e){rejected=true;}assert(rejected&&mutations===2,"malformed fence fails closed");
    raw=JSON.stringify({[doc]:rollout});busy=true;assert(req("writer_policy").code==="busy","policy cannot pass during legacy lock contention");
    assert(!held&&locks===releases,"all acquired locks released");
    return "PASS 8 GAS fence scenarios; legacy write/read, fenced write, other doc, proof, malformed config, lock contention";
}

console.log(testFence(fs.readFileSync(path.join(__dirname,"../apps-script/Code.gs"),"utf8")));
