// Real nonce reservation function + Durable Object with an isolated storage mock.
// Does not represent a deployed Cloudflare isolate or a real Groq request.
async function runNonceTests(worker){
  const check=(x,m)=>{if(!x)throw Error(m);};
  const code=worker.replace('export class STTNonceGuard','class STTNonceGuard').replace('export default {','const workerDefault = {');
  class FakeResponse{constructor(body,opts){this.status=opts.status;}}
  const TextEncoder=class{encode(){return new Uint8Array();}};
  const result=new Function('TextEncoder','Response','URL',code+'\nreturn {STTNonceGuard,reserveSttNonce};')(TextEncoder,FakeResponse,URL);
  const objects=new Map();
  const binding={idFromName:n=>n,get:id=>{
    if(!objects.has(id)){
      const records=new Map();
      const storage={kv:{get:k=>records.get(k),put:(k,v)=>records.set(k,v)},setAlarm:async()=>{},
        transactionSync:fn=>fn(),deleteAll:async()=>records.clear()};
      objects.set(id,new result.STTNonceGuard({storage}));
    }
    return{fetch:(url,opts)=>objects.get(id).fetch({url,method:opts.method})};
  }};
  const env={STT_NONCE_GUARD:binding,STT_NONCES:{get:async()=>null}};
  const same=await Promise.all(Array.from({length:20},()=>result.reserveSttNonce(env,'same-ticket')));
  check(same.filter(Boolean).length===1,'20 concurrent same-ticket reservations must accept once');
  const distinct=await Promise.all(['one','two','three'].map(x=>result.reserveSttNonce(env,x)));
  check(distinct.every(Boolean),'distinct tickets independent');
  check(!await result.reserveSttNonce({...env,STT_NONCES:{get:async()=>true}},'legacy'),'legacy consumed ticket rejected');
  let failed=false;try{await result.reserveSttNonce({},'missing');}catch(e){failed=true;}
  check(failed,'missing DO fails closed');
  failed=false;try{await result.reserveSttNonce({...env,STT_NONCE_GUARD:{idFromName:x=>x,get:()=>({fetch:async()=>({status:500})})}},'down');}catch(e){failed=true;}
  check(failed,'storage failure fails closed');
  check(worker.includes("if(!await reserveSttNonce(env,claims.jti))")&&!worker.includes('STT_NONCES.put('),'actual worker uses atomic gate');
  return ['20 same-ticket reservations: one accepted','distinct tickets','old KV replay rejected','missing storage fail closed','storage failure fail closed','production handler wired'];
}

const fs=require('node:fs'),path=require('node:path');runNonceTests(fs.readFileSync(path.join(__dirname,'../workers/stt-worker.mjs'),'utf8')).then(x=>console.log('PASS',x)).catch(e=>{console.error(e);process.exitCode=1});
