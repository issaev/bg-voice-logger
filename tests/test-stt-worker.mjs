import assert from 'node:assert/strict';
import {createHmac,webcrypto} from 'node:crypto';
import worker from '../workers/stt-worker.mjs';
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
 STT_NONCES:{get:async key=>nonce.get(key)||null,put:async(key,val)=>{nonce.set(key,val);}},
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
 assert.equal(glossary.split(': ')[1].replace(/\\.$/,'').split(', ').length,34);
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
try{
 let r=await worker.fetch(new Request('https://bvlog-stt.test/health'),env);let data=await r.json();assert.equal(data.ok,true);
 r=await worker.fetch(new Request('https://bvlog-stt.test/stt/transcribe',{method:'OPTIONS',headers:{Origin:origin}}),env);
 assert.equal(r.status,204);assert.equal(await r.text(),'');
 r=await worker.fetch(request(ticket(),{origin:'https://attacker.example'}),env);assert.equal(r.status,403);
 r=await worker.fetch(request(ticket({aud:'attacker'})),env);assert.equal(r.status,401);
 r=await worker.fetch(request(ticket({exp:Math.floor(Date.now()/1000)-10})),env);assert.equal(r.status,401);
 r=await worker.fetch(request('abc.def.ghi'),env);assert.equal(r.status,401);
 let good=ticket();r=await worker.fetch(request(good),env);data=await r.json();
 assert.equal(r.status,200);assert.equal(data.provider,'groq');assert.equal(data.text,groqText);
 assert.equal(data.op_id,'00000000-0000-4000-8000-000000000001');assert.equal(count,1);
 r=await worker.fetch(request(good),env);assert.equal(r.status,409);assert.equal(count,1);
 groqStatus=429;r=await worker.fetch(request(ticket()),env);data=await r.json();
 assert.equal(data.provider,'cloudflare');assert.equal(data.text,fallbackText);assert.equal(fallbackCalls,1);
 groqStatus=200;groqText='  ';r=await worker.fetch(request(ticket()),env);data=await r.json();
 assert.equal(r.status,422);assert.equal(data.code,'no_speech');assert.equal(fallbackCalls,1);
 // A whole glossary or a contiguous glossary recitation must never be a LOG entry.
 groqText='Спасителна акция. Термини: Алфа, Браво, Чарли, офроуд, ДКА, НИМ, ЕТА, CalTopo, ретранслатор, САК, К9, СКБ, ПСС, чекпойнт, трак, Селимица, Черни връх, Боерица, Кумата, Алеко, щаб, разчистване, издирване, обход, заслон, сборен пункт, доброволец, маршрут, екипировка, отводняване, евакуация, резачка, шланг, смукател.';
 r=await worker.fetch(request(ticket()),env);data=await r.json();
 assert.equal(r.status,422);assert.equal(data.code,'no_speech');
 groqText='Алфа, Браво, Чарли, офроуд, ДКА, НИМ';
 r=await worker.fetch(request(ticket()),env);data=await r.json();
 assert.equal(r.status,422);assert.equal(data.code,'no_speech');
 // No-speech metrics across all segments must reject hallucinations despite nonempty text.
 groqText='Екип Алфа пристигна.';groqSegments=[{no_speech_prob:0.98,avg_logprob:-1.8}];
 r=await worker.fetch(request(ticket()),env);data=await r.json();
 assert.equal(r.status,422);assert.equal(data.code,'no_speech');
 // A single noisy segment among clear segments should be reviewable, not discarded.
 groqSegments.push({no_speech_prob:0.01,avg_logprob:-0.2});
 r=await worker.fetch(request(ticket()),env);data=await r.json();
 assert.equal(r.status,200);assert.equal(data.text,groqText);
 assert.equal(data.quality.status,'suspicious');
 // Clear short rescue report using terms from the prompt remains valid.
 groqSegments=[];groqText='Екип Алфа достигна сборния пункт.';
 r=await worker.fetch(request(ticket()),env);data=await r.json();
 assert.equal(r.status,200);assert.equal(data.text,groqText);
 const huge=Buffer.alloc(8*1024*1024+1,5);
 r=await worker.fetch(request(ticket(),{bytes:huge}),env);assert.equal(r.status,413);
 const prev=env.STT_RATE_LIMIT;env.STT_RATE_LIMIT={limit:async()=>({success:false})};
 r=await worker.fetch(request(ticket()),env);assert.equal(r.status,429);env.STT_RATE_LIMIT=prev;
 const missingNonce={...env,STT_NONCES:undefined};r=await worker.fetch(request(ticket()),missingNonce);assert.equal(r.status,503);
 console.log('PASS: STT Worker HMAC, CORS, Groq context, prompt echo guard, no-speech segments, fallback, replay, quota, size, no-secrets.');
}finally{globalThis.fetch=originalFetch;}
