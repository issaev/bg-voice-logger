// Summarize only sanitized Apps Script trace records. NEVER print a raw line,
// request ID, document ID, payload, location, name or transcript.
import fs from 'node:fs';

const file=process.argv[2];
if(!file){
  console.error('Usage: node tools/analyze-gas-traces.mjs sanitized-gas-traces.jsonl');
  process.exit(2);
}
const allowed=new Set(['read','list','operation','create','audio_read','photo_read','ping']);
const requests=new Map();
const median=(values)=>{
  if(!values.length)return null;
  const sorted=[...values].sort((a,b)=>a-b);
  return Math.round((sorted[(sorted.length-1)>>1]+sorted[sorted.length>>1])/2);
};
const input=fs.readFileSync(file,'utf8').split(/\r?\n/);
let skipped=0;
for(const line of input){
  if(!line.trim())continue;
  let e;
  try{e=JSON.parse(line);}catch{skipped++;continue;}
  if(!e||!(/^[a-f0-9]{12}$/.test(e.request_id||''))||
    !allowed.has(e.action)|| !/^[a-z0-9_]{1,48}$/.test(e.stage||'')||
    !Number.isFinite(e.elapsed_ms)||e.elapsed_ms<0||e.elapsed_ms>3600000){skipped++;continue;}
  let op=requests.get(e.request_id);
  if(!op){op={action:e.action,stages:[],outcome:null};requests.set(e.request_id,op);}
  if(op.action!==e.action){skipped++;continue;}
  const stage={name:e.stage,total:e.elapsed_ms,
    duration:Number.isFinite(e.phase_ms)&&e.phase_ms>=0&&e.phase_ms<=3600000?e.phase_ms:null};
  op.stages.push(stage);
  if(e.stage==='response_serialized')op.outcome={total:e.elapsed_ms,ok:op.outcome?.ok!==false};
  if(e.stage==='completed_error')op.outcome={total:e.elapsed_ms,ok:false};
  if(e.stage==='completed'&&!op.outcome)op.outcome={total:e.elapsed_ms,ok:true};
}
const report={sample_requests:requests.size,skipped_lines:skipped,actions:{}};
for(const action of allowed){
  const items=[...requests.values()].filter(x=>x.action===action);
  if(!items.length)continue;
  const finished=items.filter(x=>x.outcome);
  const durations=finished.map(x=>x.outcome.total);
  const phases={};
  for(const item of items)for(const stage of item.stages){
    if(stage.duration===null)continue;
    (phases[stage.name]??=[]).push(stage.duration);
  }
  const phaseSummary={};
  for(const [name,values] of Object.entries(phases).sort((a,b)=>a[0].localeCompare(b[0]))){
    phaseSummary[name]={n:values.length,median_ms:median(values),max_ms:Math.max(...values)};
  }
  report.actions[action]={requests:items.length,finished:finished.length,
    incomplete:items.length-finished.length,reported_errors:items.filter(x=>x.outcome?.ok===false).length,
    median_total_ms:median(durations),max_total_ms:durations.length?Math.max(...durations):null,
    ...(durations.length>=40?{p95_total_ms:[...durations].sort((a,b)=>a-b)[Math.ceil(.95*durations.length)-1]}:{}),
    phases:phaseSummary};
}
// Never print the input data or request IDs. JSON includes aggregate metrics only.
process.stdout.write(JSON.stringify(report,null,2)+'\n');
