/**
 * Local comparative STT benchmark: user-supplied Bulgarian audio + corrected transcript.
 * NO data is included, and this script never prints raw transcripts or API keys.
 * Usage: GROQ_API_KEY=... CF_ACCOUNT_ID=... CF_API_TOKEN=... node tools/benchmark-stt.mjs data/manifest.json
 * manifest.json: [{"file":"audio/01.webm", "reference":"..."}, ...]
 * Requires Node.js 20+. Run only with consent and approved provider data processing terms.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const [,,manifestPath] = process.argv;
if(!manifestPath){console.error('Usage: node tools/benchmark-stt.mjs /path/to/manifest.json');process.exit(2);}
const rows=JSON.parse(await fs.readFile(manifestPath,'utf8'));
if(!Array.isArray(rows)||!rows.length)throw new Error('Manifest must contain at least one audio/transcript pair.');
function norm(s){return String(s).toLocaleLowerCase('bg-BG').replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();}
function editDistance(a,b){
 let prev=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){let curr=[i];for(let j=1;j<=b.length;j++)curr[j]=Math.min(curr[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));prev=curr;}
 return prev[b.length];
}
function metrics(reference,text){
 const ref=norm(reference).split(' ').filter(Boolean),got=norm(text).split(' ').filter(Boolean);
 const numbers=ref.filter(w=>/\d/.test(w)),numbersGot=got.filter(w=>/\d/.test(w));
 return {words:ref.length,errors:editDistance(ref,got),critical_numbers_match:JSON.stringify(numbers)===JSON.stringify(numbersGot)};
}
const mime=file=>({webm:'audio/webm',ogg:'audio/ogg',m4a:'audio/mp4',mp4:'audio/mp4',mp3:'audio/mpeg',wav:'audio/wav',flac:'audio/flac'})[path.extname(file).slice(1).toLowerCase()]||'application/octet-stream';
async function groq(filename,bytes){
 const form=new FormData();form.set('file',new Blob([bytes],{type:mime(filename)}),path.basename(filename));
 form.set('model','whisper-large-v3');form.set('language','bg');form.set('response_format','json');
 const resp=await fetch('https://api.groq.com/openai/v1/audio/transcriptions',{method:'POST',headers:{Authorization:'Bearer '+process.env.GROQ_API_KEY},body:form});
 if(!resp.ok)throw new Error('Groq HTTP '+resp.status);const payload=await resp.json();return payload.text;
}
async function cloudflare(filename,bytes){
 const url='https://api.cloudflare.com/client/v4/accounts/'+process.env.CF_ACCOUNT_ID+'/ai/run/@cf/openai/whisper-large-v3-turbo';
 const resp=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+process.env.CF_API_TOKEN,'Content-Type':'application/json'},
  body:JSON.stringify({audio:bytes.toString('base64'),language:'bg',task:'transcribe'})});
 if(!resp.ok)throw new Error('Cloudflare HTTP '+resp.status);const payload=await resp.json();return payload.result?.text||payload.text||'';
}
const providers=[];
if(process.env.GROQ_API_KEY)providers.push(['Groq Large V3',groq]);
if(process.env.CF_ACCOUNT_ID&&process.env.CF_API_TOKEN)providers.push(['Cloudflare V3 Turbo',cloudflare]);
if(!providers.length)throw new Error('No provider keys configured in environment.');
const totals=Object.fromEntries(providers.map(([name])=>[name,{words:0,errors:0,numberHits:0,numberSamples:0,errorsApi:0}]));
for(let i=0;i<rows.length;i++){
 const entry=rows[i];
 if(!entry.file||typeof entry.reference!=='string')throw new Error('Invalid entry '+i);
 const filename=path.resolve(path.dirname(manifestPath),entry.file);
 const bytes=await fs.readFile(filename);
 if(bytes.length>2*1024*1024)console.warn('Sample '+(i+1)+' exceeds CF Worker fallback limit; benchmark REST API may still support it.');
 for(const [name,fn] of providers){
  const out=totals[name];try{
   const guess=await fn(filename,bytes),score=metrics(entry.reference,guess);out.words+=score.words;out.errors+=score.errors;
   if(/\d/.test(entry.reference)){out.numberSamples++;if(score.critical_numbers_match)out.numberHits++;}
  }catch(e){out.errorsApi++;console.error('Sample '+(i+1)+' '+name+': '+e.message);}
 }
 console.log('Processed sample '+(i+1)+'/'+rows.length);
}
console.log('\nSUMMARY (raw transcripts are not shown)');
for(const [name,o] of Object.entries(totals))console.log(name+': WER='+(o.words?(o.errors/o.words*100).toFixed(1):'N/A')+'%, number sequences='+o.numberHits+'/'+o.numberSamples+', failed API samples='+o.errorsApi);
