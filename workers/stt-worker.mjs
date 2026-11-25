/**
 * BG Voice Logger STT gateway - Cloudflare Workers Free.
 * Groq whisper-large-v3 primary; Cloudflare Workers AI whisper-large-v3-turbo fallback.
 * Receives signed, short-lived, one-use tickets from the authenticated WordPress API.
 * IMPORTANT: never log tokens, audio, transcripts, or provider API credentials.
 */
const MAX_UPLOAD = 8 * 1024 * 1024;
const FALLBACK_MAX = 2 * 1024 * 1024;
const STT_MODEL = '@cf/openai/whisper-large-v3-turbo';
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/audio/transcriptions';
// Reviewed Bulgarian SAR vocabulary, below Whisper's 224-token prompt limit.
// Only a spelling hint, never an instruction to invent words or transcribe silence.
const CONTEXT = "Спасителна акция. Термини: Алфа, Браво, Чарли, офроуд, ДКА, НИМ, ЕТА, CalTopo, ретранслатор, САК, К9, СКБ, ПСС, чекпойнт, трак, Селимица, Черни връх, Боерица, Кумата, Алеко, щаб, разчистване, издирване, обход, заслон, сборен пункт, доброволец, маршрут, екипировка, отводняване, евакуация, резачка, шланг, смукател.";
const HALLUCINATED_CONTEXT = 'сар к9 caltopo витоша сектор екип алфа координати сборен пункт';
const encoder = new TextEncoder();

function json(data, status = 200, origin = '') {
  const headers = {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff', 'Vary':'Origin'};
  if(origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    headers['Access-Control-Max-Age'] = '600';
  }
  return new Response(status===204?null:JSON.stringify(data), {status, headers});
}
function fromBase64Url(value) {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error('Malformed ticket');
  const raw = atob(value.replace(/-/g,'+').replace(/_/g,'/') + '='.repeat((4-value.length%4)%4));
  return Uint8Array.from(raw, c=>c.charCodeAt(0));
}
async function verifyTicket(ticket, env) {
  if(!env.STT_HMAC_SECRET || env.STT_HMAC_SECRET.length < 32) throw new Error('STT gateway signing secret is not configured');
  if(!ticket || ticket.length > 4000) throw new Error('Missing or invalid ticket');
  const parts = ticket.split('.');
  if(parts.length !== 3) throw new Error('Invalid ticket structure');
  const header = JSON.parse(new TextDecoder().decode(fromBase64Url(parts[0])));
  if(header.alg !== 'HS256' || header.typ !== 'JWT') throw new Error('Unsupported ticket algorithm');
  const data = encoder.encode(parts[0]+'.'+parts[1]);
  const signature = fromBase64Url(parts[2]);
  const key = await crypto.subtle.importKey('raw',encoder.encode(env.STT_HMAC_SECRET),
    {name:'HMAC',hash:'SHA-256'},false,['verify']);
  const valid = await crypto.subtle.verify('HMAC',key,signature,data);
  if(!valid) throw new Error('Incorrect ticket signature');
  const p = JSON.parse(new TextDecoder().decode(fromBase64Url(parts[1])));
  const now = Math.floor(Date.now()/1000);
  if(p.aud!=='bg-voice-logger-stt' || p.iss!==env.EXPECTED_ISSUER ||
     !Number.isSafeInteger(p.exp) || !Number.isSafeInteger(p.iat) ||
     p.exp < now || p.iat > now+30 || p.exp-p.iat>180 ||
     typeof p.sub!=='string' || !/^[a-f0-9]{40}$/.test(p.sub) ||
     typeof p.op_id!=='string' || !/^[a-f0-9-]{32,50}$/i.test(p.op_id) ||
     typeof p.jti!=='string' || !/^[a-f0-9-]{32,50}$/i.test(p.jti)) {
    throw new Error('Expired or incorrectly scoped ticket');
  }
  return p;
}
function asExtension(type) {
  const mime = (type||'').split(';')[0].toLowerCase();
  return ({'audio/webm':'.webm','audio/ogg':'.ogg','audio/mp4':'.m4a',
    'audio/mpeg':'.mp3','audio/wav':'.wav','audio/x-wav':'.wav','audio/flac':'.flac'})[mime] || '';
}
function encodeBase64(buffer) {
  const bytes=new Uint8Array(buffer);let binary='';
  for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(binary);
}
// Normalize Cyrillic, Latin, numbers and punctuation before comparing to the hint.
function normalizeEcho(value) {
  return String(value||'').toLocaleLowerCase('bg-BG')
    .replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
}
// Reject glossary recitation rather than presenting it as actual radio traffic.
// A couple of matching SAR terms are expected in legitimate speech and are NOT rejected.
function promptEcho(text,prompt) {
  const value=normalizeEcho(text),hint=normalizeEcho(prompt);
  if(!value || !hint)return false;
  if(value.includes('спасителна акция термини'))return true;
  if(value===hint || (value.length>=40 && hint.includes(value)))return true;
  const terms=String(prompt).split(':').slice(1).join(':').split(',')
    .map(normalizeEcho).filter(Boolean);
  const wrapped=' '+value+' ';
  let matches=0;
  for(const term of terms)if(wrapped.includes(' '+term+' '))matches++;
  if(matches>=6 && value.split(' ').length<=matches*2.5)return true;
  for(let i=0;i<=terms.length-5;i++){
    if(wrapped.includes(' '+terms.slice(i,i+5).join(' ')+' '))return true;
  }
  return false;
}
// These Groq verbose_json indicators are only a conservative all-segments filter.
// Do not discard legitimate speech because one segment alone is noisy.
function segmentsIndicateSilence(segments) {
  return Array.isArray(segments)&&segments.length>0&&segments.every(s=>
    typeof s.no_speech_prob==='number'&&s.no_speech_prob>0.6&&
    typeof s.avg_logprob==='number'&&s.avg_logprob< -1.0);
}
/** Quality flags indicate review, never a calibrated probability of transcription correctness. */
function transcriptQuality(text, segments, duration, micActivity, prompt = '') {
  const reasons = [];
  const plain = String(text||'').toLocaleLowerCase('bg-BG').replace(/[.,!?;:\-]/g,' ').replace(/\s+/g,' ').trim();
  const legacy = HALLUCINATED_CONTEXT.split(' ');
  const tokens = plain.split(' ').filter(Boolean);
  const matching = legacy.filter(x => tokens.includes(x)).length;
  if (matching >= 5 && tokens.length <= 35) reasons.push('prompt_echo');
  if (prompt && promptEcho(text,prompt)) reasons.push('prompt_echo');
  if (/\b(.{5,35})\s+\1\s+\1\b/iu.test(plain)) reasons.push('repetition');
  if (tokens.length>=7 && new Set(tokens).size <= Math.max(2,Math.floor(tokens.length*0.25))) reasons.push('repetition');
  const segs = Array.isArray(segments)?segments:[];
  let weak = 0, silent = 0, compressed = 0;
  for(const x of segs){
    if(typeof x.avg_logprob==='number' && x.avg_logprob < -1.0)weak++;
    if(typeof x.no_speech_prob==='number' && x.no_speech_prob > 0.6 &&
       typeof x.avg_logprob==='number' && x.avg_logprob < -1.0)silent++;
    if(typeof x.compression_ratio==='number' && x.compression_ratio > 2.4)compressed++;
  }
  if(silent>0) reasons.push('possible_silence');
  if(weak>0) reasons.push('low_confidence');
  if(compressed>0) reasons.push('compression_anomaly');
  if(typeof duration==='number'&&duration>0&&tokens.length/duration>5.5)reasons.push('implausible_speech_rate');
  if(typeof micActivity==='number'&&micActivity<0.015)reasons.push('low_microphone_signal');
  if(/(?:\b\d{3,}\b|\b\d{2}[.,]\d{3,}\b)/.test(plain))reasons.push('verify_numbers');
  return {status:reasons.length?'suspicious':'normal',reasons:Array.from(new Set(reasons)),
    segments:segs.length};
}
async function viaGroq(file, env, micActivity) {
  if(!env.GROQ_API_KEY) return {ok:false, fallback:true, code:'groq_not_configured'};
  const form=new FormData();
  form.append('file',file,'recording'+asExtension(file.type));
  form.append('model','whisper-large-v3');
  form.append('language','bg');
  form.append('prompt',CONTEXT);
  form.append('response_format','verbose_json');
  form.append('temperature','0');
  try {
    const r=await fetch(GROQ_ENDPOINT,{
      method:'POST',headers:{Authorization:'Bearer '+env.GROQ_API_KEY},body:form,
      signal:AbortSignal.timeout(45000)
    });
    if(!r.ok){
      const fallback=r.status===429 || [500,502,503,504].includes(r.status);
      return {ok:false,fallback,code:r.status===429?'groq_rate_limited':'groq_http_'+r.status};
    }
    const v=await r.json();
    const text=typeof v.text==='string'?v.text.trim():'';
    if(!text)return {ok:false,fallback:false,code:'no_speech'};
    const quality=transcriptQuality(text,v.segments,v.duration,micActivity,CONTEXT);
    // No invented glossary or all-silent segment transcript may reach LOG/review.
    // A no_speech response leaves the original recording available on the device.
    if(quality.reasons.includes('prompt_echo')||segmentsIndicateSilence(v.segments))
      return {ok:false,fallback:false,code:'no_speech'};
    return {ok:true,text,provider:'groq',model:'whisper-large-v3',quality};
  }catch(e){return {ok:false,fallback:true,code:'groq_transport'};}
}
async function viaCloudflare(file,env,micActivity) {
  if(!env.AI || file.size>FALLBACK_MAX) return {ok:false,code:'cloudflare_not_available'};
  try {
    const buffer=await file.arrayBuffer();
    const result=await env.AI.run(STT_MODEL,{
      audio:encodeBase64(buffer),task:'transcribe',language:'bg',
      condition_on_previous_text:false
    });
    const text=typeof result?.text==='string'?result.text.trim():'';
    if(!text)return {ok:false,code:'no_speech'};
    const quality=transcriptQuality(text,[],undefined,micActivity,CONTEXT);
    if(quality.reasons.includes('prompt_echo'))return {ok:false,code:'no_speech'};
    return {ok:true,text,provider:'cloudflare',model:STT_MODEL,quality};
  }catch(e){return {ok:false,code:'cloudflare_unavailable'};}
}
// Per-ticket SQLite-backed Durable Object. Synchronous transactions serialize
// check + reservation across isolates. Never fall back to eventually-consistent KV.
export class STTNonceGuard {
  constructor(state){this.storage=state.storage;}
  async fetch(request){
    if(request.method!=='POST'||new URL(request.url).pathname!=='/reserve')
      return new Response(null,{status:405});
    const now=Date.now();
    // Install the cleanup alarm before the reservation; failure is fail-closed.
    // Each object is named by a single jti, and tickets expire within 180s.
    await this.storage.setAlarm(now+300000);
    const accepted=this.storage.transactionSync(()=>{
      const used=this.storage.kv.get('used');
      if(used!==undefined)return false;
      this.storage.kv.put('used',now);
      return true;
    });
    return new Response(null,{status:accepted?204:409});
  }
  async alarm(){await this.storage.deleteAll();}
}
async function reserveSttNonce(env,jti){
  if(!env.STT_NONCE_GUARD)throw Error('Atomic nonce storage unavailable');
  // During migration, reject tickets already consumed by the old KV worker.
  // KV is NOT used as an authorization grant and is not the new write path.
  if(env.STT_NONCES&&await env.STT_NONCES.get('stt:'+jti))return false;
  const id=env.STT_NONCE_GUARD.idFromName('stt:'+jti);
  const response=await env.STT_NONCE_GUARD.get(id).fetch('https://nonce.internal/reserve',{method:'POST'});
  if(response.status===409)return false;
  if(response.status!==204)throw Error('Atomic nonce reservation failed');
  return true;
}
export default {
  async fetch(request,env) {
    const origin=request.headers.get('Origin')||'';
    const allowed=String(env.ALLOWED_ORIGIN||'');
    const endpoint=new URL(request.url);
    if(endpoint.pathname==='/health' && request.method==='GET') {
      return json({ok:true,version:'0.6.2',prompt_profile:'sar-bg-v1',primary:!!env.GROQ_API_KEY,
        fallback:!!env.AI,nonce_storage:!!env.STT_NONCE_GUARD,nonce_mode:'durable-object'},200,'');
    }
    if(endpoint.pathname!=='/stt/transcribe')return json({ok:false,code:'not_found'},404);
    if(!allowed || origin!==allowed)return json({ok:false,code:'origin_forbidden'},403);
    if(request.method==='OPTIONS')return json({ok:true},204,origin);
    if(request.method!=='POST')return json({ok:false,code:'method_not_allowed'},405,origin);
    if(!env.STT_NONCE_GUARD || !env.STT_RATE_LIMIT) {
      return json({ok:false,code:'worker_not_configured'},503,origin);
    }
    let claims;
    try {
      const authorization=request.headers.get('Authorization')||'';
      if(!authorization.startsWith('Bearer '))throw new Error('Missing authentication');
      claims=await verifyTicket(authorization.slice(7),env);
    }catch(e){return json({ok:false,code:'unauthorized',message:'Authentication expired; try again.'},401,origin);}
    const size=Number(request.headers.get('Content-Length')||0);
    if(size>MAX_UPLOAD+100000)return json({ok:false,code:'too_large',message:'Recording is larger than 8 MB.'},413,origin);
    const limiter=await env.STT_RATE_LIMIT.limit({key:claims.sub});
    if(!limiter.success)return json({ok:false,code:'rate_limited',retryable:true},429,origin);
    try{
      if(!await reserveSttNonce(env,claims.jti))
        return json({ok:false,code:'ticket_reused'},409,origin);
    }catch(e){return json({ok:false,code:'nonce_store_unavailable',retryable:true},503,origin);}
    let file, incomingMicActivity;
    try {
      const incoming=await request.formData();
      file=incoming.get('audio');
      incomingMicActivity=incoming.get('mic_activity');
      if(!file || typeof file.size!=='number' || typeof file.arrayBuffer!=='function')throw new Error('Missing audio');
      if(file.size<500)return json({ok:false,code:'audio_too_short'},422,origin);
      if(file.size>MAX_UPLOAD)return json({ok:false,code:'too_large'},413,origin);
      if(!asExtension(file.type))return json({ok:false,code:'unsupported_audio_format'},415,origin);
    }catch(e){return json({ok:false,code:'invalid_audio_payload'},400,origin);}
    const activityRaw=incomingMicActivity===null||incomingMicActivity===''?NaN:Number(incomingMicActivity);
    const micActivity=Number.isFinite(activityRaw)&&activityRaw>=0&&activityRaw<=1?activityRaw:undefined;
    const primary=await viaGroq(file,env,micActivity);
    if(primary.ok)return json({...primary,ok:true,op_id:claims.op_id},200,origin);
    if(primary.code==='no_speech')return json({ok:false,code:'no_speech',retryable:false},422,origin);
    if(!primary.fallback)return json({ok:false,code:primary.code,retryable:false},422,origin);
    const reserve=await viaCloudflare(file,env,micActivity);
    if(reserve.ok)return json({...reserve,ok:true,op_id:claims.op_id},200,origin);
    if(reserve.code==='no_speech')return json({ok:false,code:'no_speech',retryable:false},422,origin);
    return json({ok:false,code:'providers_unavailable',retryable:true,
      message:'Audio was not transcribed. It is safe in the device queue.'},503,origin);
  }
};
