// Synthetic, private-free comparator fixture with safe output.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const cp=require('node:child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bvlog-bench-'));
try{
 const file=(kind,n,latency)=>{
   const items=[];
   for(let i=0;i<n;i++)items.push(JSON.stringify({kind:'bvlog_staging_read',variant:kind,status:'ok',
     request_id:(i+1).toString(16).padStart(12,'0'),elapsed_ms:latency+i*10,
     payload_bytes:16384,log_rows:40,private_text:'TEST SECRET OPERATION'}));
   const dest=path.join(dir,kind+'.jsonl');fs.writeFileSync(dest,items.join('\n')+'\n');return dest;
 };
 const a=file('base_0721',10,1000),b=file('candidate_080a',10,600);
 const out=cp.execFileSync('node',[path.join(__dirname,'../tools/compare-staging-reads.mjs'),a,b],{encoding:'utf8'});
 const result=JSON.parse(out);
 assert.equal(result.base.successful,10);
 assert.equal(result.candidate.successful,10);
 assert.equal(result.base.median_ms,1045);
 assert.equal(result.candidate.median_ms,645);
 assert.equal(result.comparison.provisional_median_change_percent,38.3);
 assert.equal(result.comparison.comparable_without_fixture_review,false);
 assert.equal(result.base.p95_ms,undefined);
 for(const token of ['TEST SECRET OPERATION','private_text',path.basename(a),'000000000001'])
   assert.ok(!out.includes(token),'Comparator leaked private inputs');
 console.log('PASS v0.8.0-A comparator: medians, no p95 for n=10 and no private output.');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
