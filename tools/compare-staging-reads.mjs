// Aggregate *only* synthetic, sanitized v0.8.0 staging benchmark samples.
// Never output raw lines, request identifiers, names, cell content or URLs.
import fs from 'node:fs';

if(process.argv.length!==4){
  console.error('Usage: node tools/compare-staging-reads.mjs base.jsonl candidate.jsonl');
  process.exit(2);
}
const knownVariants=['base_0721','candidate_080a'];
function percentile(values,p){
  const a=[...values].sort((x,y)=>x-y);
  return a[Math.max(0,Math.ceil(a.length*p)-1)];
}
function median(values){
  const a=[...values].sort((x,y)=>x-y);
  return (a[Math.floor((a.length-1)/2)]+a[Math.floor(a.length/2)])/2;
}
function measure(filename,variant){
  let skipped=0;const hits=[];const seen=new Set();
  for(const line of fs.readFileSync(filename,'utf8').split(/\r?\n/)){
    if(!line.trim())continue;
    let x;
    try{x=JSON.parse(line)}catch{skipped++;continue}
    if(x?.kind!=='bvlog_staging_read'||x.variant!==variant||
       !['ok','rejected','exception'].includes(x.status)||
       !/^[a-f0-9]{12}$/.test(x.request_id||'')||
       !Number.isFinite(x.elapsed_ms)||x.elapsed_ms<0||x.elapsed_ms>3600000||
       seen.has(x.request_id)){skipped++;continue}
    seen.add(x.request_id);hits.push(x);
  }
  const success=hits.filter(x=>x.status==='ok');
  const durations=success.map(x=>x.elapsed_ms);
  return {variant,samples:hits.length,successful:success.length,
    errors:hits.length-success.length,skipped,
    min_ms:durations.length?Math.min(...durations):null,
    median_ms:durations.length?median(durations):null,
    max_ms:durations.length?Math.max(...durations):null,
    ...(durations.length>=40?{p95_ms:percentile(durations,0.95)}:{}),
    mean_ms:durations.length?Math.round(durations.reduce((a,b)=>a+b,0)/durations.length):null,
    payload_bytes_median:success.some(x=>Number.isFinite(x.payload_bytes))?
      median(success.filter(x=>Number.isFinite(x.payload_bytes)).map(x=>x.payload_bytes)):null};
}
const base=measure(process.argv[2],knownVariants[0]);
const candidate=measure(process.argv[3],knownVariants[1]);
const comparable=base.successful>=10&&candidate.successful>=10 &&
   base.errors===0&&candidate.errors===0&&base.payload_bytes_median===candidate.payload_bytes_median;
const percent=comparable&&base.median_ms>0?
  Math.round(1000*(base.median_ms-candidate.median_ms)/base.median_ms)/10:null;
process.stdout.write(JSON.stringify({base,candidate,comparison:{
  at_least_ten_successes_each:base.successful>=10&&candidate.successful>=10,
  zero_errors:base.errors===0&&candidate.errors===0,
  equal_payload_size_median:base.payload_bytes_median===candidate.payload_bytes_median,
  comparable_without_fixture_review:false,
  provisional_median_change_percent:percent,
  note:'Provisional GAS-only timing. Review exact same fixture, device, runtime and conditions manually. No WP POST/redirect timing included.'
}},null,2)+'\n');
