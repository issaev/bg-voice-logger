import assert from 'node:assert/strict';
import {createHmac,webcrypto} from 'node:crypto';
import worker from '../../workers/stt-worker.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const secret='test-only-secret-at-least-32-characters-value';
const origin='https://spasitelenclub.com';
const issuer=origin;
const nonce=new Map();
let count=0,groqStatus=200,groqText='Екип Алфа достигна сборния пункт.',fallbackText='Екип Бета се завърна.';
let groqSegments=[];
let fallbackCalls=0;
const env={ALLOWED_ORIGIN:origin,EXPECTED_ISSUER:issuer,STT_HMAC_SECRET:secret,
 GROQ_API_KEY:'fake-groq-key',
 STT_NONCES:{get:async key=>{const value=nonce.get(key)||null;await new Promise(r=>setTimeout(r,10));return value;},put:async(key,val)=>{nonce.set(key,val);}},
 STT_RATE_LIMIT:{limit:async()=>({success:true})},
 AI:{run:async (model,payload)=>{fallbackCalls++;assert.equal(model,'@cf/openai/whisper-large-v3-turbo');assert.equal(payload.language,'bg');return {text:fallbackText};}}
};
const originalFetch=globalThis.fetch;
globalThis.fetch=async (url,options)=>{
 assert.equal(url,'https://api.groq.com/openai/v1/audio/transcriptions');
 assert.equal(options.headers.Authorization,'Bearer fake-groq-key');
 const m=options.body;assert.equal(m.get('language'),'bg');assert.equal(m.get('model'),'whisper-large-v3');
 const glossary=m.get('prompt');assert.ok(glossary&&glossary.includes('СКБ')&&glossary.includes('CalTopo'));
 assert.ok(!glossary.includes('Севлиево')&&!glossary.includes('Дряново')&&!glossary.includes('Люботрън'));
 assert.ok(!glossary.includes('Джеймс Баучер')&&!glossary.includes('Лозенец'));
 assert.equal(glossary.split(': ')[1].split(', ').length,34);
 count++;
 return new Response(JSON.stringify(groqStatus===200?{text:groqText,segments:groqSegments}:{error:{type:'rate_limit'}}),{status:groqStatus,headers:{'Content-Type':'application/json'}});
};
function b64(raw){return Buffer.from(raw).toString('base64url');}
function ticket(overrides={}){
 const now=Math.floor(Date.now()/1000),head=b64(JSON.stringify({alg:'HS256',typ:'JWT'}));
 const body=b64(JSON.stringify({iss:issuer,aud:'bg-voice-logger-stt',sub:'a'.repeat(40),
  op_id:'00000000-0000-4000-8000-000000000001',doc_id:'a'.repeat(25),
  jti:crypto.randomUUID(),iat:now,exp:now+150,...overrides}));
 const signed=head+'.'+body;
 return signed+'.'+createHmac('sha256',secret).update(signed).digest('base64url');
}
function request(t,opts={}){
 const form=new FormData();form.set('audio',new Blob([opts.bytes||Buffer.alloc(3000,5)],{type:'audio/webm'}),'voice.webm');
 const headers={Origin:opts.origin||origin,Authorization:'Bearer '+t};
 return new Request('https://bvlog-stt.test/stt/transcribe',{method:'POST',headers,body:form});
}
// This asserts the REQUIRED behavior, not the observed bug. Expected to fail until #48 is fixed.
try {
 const t=ticket();const responses=await Promise.all([worker.fetch(request(t),env),worker.fetch(request(t),env)]);
 console.log(JSON.stringify({issue:48,statuses:responses.map(r=>r.status),providerCalls:count}));
 assert.equal(count,1,'#48: same ticket must never invoke the provider twice');
 assert.equal(responses.filter(r=>r.status===200).length,1);
} finally {globalThis.fetch=originalFetch;}
