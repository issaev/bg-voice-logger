// Synthetic logs only: analyzer never echoes payload, IDs or secret material.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const cp=require('node:child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gas-trace-test-'));
const file=path.join(dir,'traces.jsonl');
const req='abc123abc123';
const entries=[
 {request_id:req,action:'read',stage:'received',elapsed_ms:0},
 {request_id:req,action:'read',stage:'read_start',elapsed_ms:1,phase_ms:0},
 {request_id:req,action:'read',stage:'log_end_scanned',elapsed_ms:15,phase_ms:14},
 {request_id:req,action:'read',stage:'completed',elapsed_ms:28},
 {request_id:req,action:'read',stage:'response_serialized',elapsed_ms:29},
 {request_id:'abc123abc124',action:'read',stage:'received',elapsed_ms:0},
 {request_id:'abc123abc124',action:'read',stage:'completed_error',elapsed_ms:201},
 {request_id:'abc123abc124',action:'read',stage:'response_serialized',elapsed_ms:202},
 {request_id:'abc123abc125',action:'operation',stage:'lock_wait_start',elapsed_ms:0},
 {request_id:'abc123abc125',action:'operation',stage:'lock_acquired',elapsed_ms:21},
 {request_id:'abc123abc125',action:'operation',stage:'completed',elapsed_ms:50}
];
const input=entries.map(x=>JSON.stringify({...x,ignored_secret:'PRIVATE_ABC_123',doc_id:'PRIVATE_DOC_123'}));
input.push(JSON.stringify({request_id:'requestIdInject',action:'read',stage:'evil',elapsed_ms:1}));
fs.writeFileSync(file,input.join('\n'));
try{
 const got=cp.spawnSync(process.execPath,[path.join(__dirname,'../tools/analyze-gas-traces.mjs'),file],{encoding:'utf8'});
 assert.equal(got.status,0,got.stderr);
 const report=JSON.parse(got.stdout);
 assert.equal(report.sample_requests,3);
 assert.equal(report.actions.read.requests,2);
 assert.equal(report.actions.read.reported_errors,1);
 assert.equal(report.actions.read.median_total_ms,116);
 assert.equal(report.actions.read.phases.log_end_scanned.median_ms,14);
 assert.equal(report.actions.operation.max_total_ms,50);
 assert.equal(report.skipped_lines,1);
 for(const secret of ['PRIVATE_ABC_123','PRIVATE_DOC_123',req])assert.ok(!got.stdout.includes(secret));
 assert.ok(!got.stdout.includes('p95_total_ms'),'Do not invent p95 from small sample');
 console.log('PASS v0.8.0-A: redacted GAS trace analysis and medians without leaking identifiers.');
}finally{
 fs.rmSync(dir,{recursive:true,force:true});
}
