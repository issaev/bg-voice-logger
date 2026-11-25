const fs=require("node:fs"),path=require("node:path");
async function testSuite(source){
    const start=source.indexOf('const by=id=>document.getElementById("bvlog-perf-"+id)'),end=source.indexOf("})('.wp_json_encode",start);
    if(start<0||end<0)throw Error("Probe script missing");
    const boot=new Function("cfg","document","fetch","performance","setTimeout",source.slice(start,end));
    const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error(m+": "+JSON.stringify(a));};
    const env=(mode,handler,n="1",c="1")=>{
        const nodes={},calls=[];for(const k of ["run","output","status","export","summary","doc","tab","mode","n","c"])nodes[k]={};
        Object.assign(nodes.doc,{value:"synthetic-fixture",selectedIndex:0});nodes.tab.value="LOG";nodes.mode.value=mode;nodes.n.value=n;nodes.c.value=c;
        const document={getElementById:id=>nodes[id.replace("bvlog-perf-","")]};
        const fetch=async(url,options)=>{const p=JSON.parse(options.body);calls.push(p);const result=handler(p,calls.length);return {ok:true,status:200,json:async()=>({mode:p.mode,tab:p.tab,...result})};};
        boot({url:"/mock",nonce:"mock"},document,fetch,{now:()=>1},fn=>fn());return {nodes,calls};
    };
    const check=p=>p.mode==="check"?{ok:true}:{ok:true,parity:true,backend:"sheets_api"};
    const a=env("parity_all",p=>p.mode==="compare"&&p.tab==="INFO"?{ok:true,parity:false}:check(p));await a.nodes.run.onclick();
    eq(a.calls.map(p=>[p.mode,p.tab]),[["check","LOG"],["compare","LOG"],["compare","INFO"],["compare","TECH"],["compare","TEAM"]],"all-tab ordering");
    eq(a.nodes.status.textContent,"Parity: 3 passed, 1 mismatched, 0 unavailable, 0 not run.","mismatch status");
    const summary=JSON.parse(a.nodes.summary.textContent);eq(summary.find(r=>r.group.includes("INFO / compare")).parity_fail,1,"mismatch visible in summary");
    const b=env("parity_all",()=>({ok:false,http_status:403,error:"bvlog_direct_scope_denied",scope_reason:"parent_mismatch"}));await b.nodes.run.onclick();
    eq(b.calls.length,1,"failed preflight stops suite");eq(JSON.parse(b.nodes.output.value)[0].scope_reason,"parent_mismatch","reason retained");
    const c=env("benchmark_pair",p=>p.mode==="compare"?{ok:true,parity:false}:check(p));await c.nodes.run.onclick();
    eq(c.calls.map(p=>p.mode),["check","compare"],"mismatch blocks benchmark");
    const d=env("benchmark_pair",p=>p.mode==="check"?{ok:true}:p.mode==="compare"?{ok:true,parity:true}:{ok:true,backend:p.mode==="cache"?"server_cache":p.mode==="direct"?"sheets_api":"gas"},"10","5");await d.nodes.run.onclick();
    eq(d.calls.length,32,"paired sample count");for(const m of ["gas","direct","cache"])eq(d.calls.filter(p=>p.mode===m).length,10,"samples per backend");
    eq(d.nodes.status.textContent,"Completed 30/30; 0 errors.","paired completion");
    const e=env("parity_all",p=>p.mode==="check"?{ok:true}:{ok:false,http_status:429,error:"bvlog_direct_google_backoff"});await e.nodes.run.onclick();
    eq(e.calls.length,2,"quota stops all-tab suite");eq(e.nodes.status.textContent,"Parity: 0 passed, 0 mismatched, 1 unavailable, 3 not run.","unattempted tabs explicit");
    const f=env("benchmark_pair",p=>p.mode==="check"?{ok:true}:p.mode==="compare"?{ok:true,parity:true}:p.mode==="gas"?{ok:false,http_status:403}:{ok:true});await f.nodes.run.onclick();
    eq(f.calls.map(p=>p.mode),["check","compare","gas"],"paired access denial stops further backends");
    const g=env("compare",check);await g.nodes.run.onclick();eq(g.calls.length,0,"manual check required");g.nodes.mode.value="check";await g.nodes.run.onclick();g.nodes.mode.value="compare";await g.nodes.run.onclick();eq(g.calls.map(p=>p.mode),["check","compare"],"manual modes preserved");
    const h=env("benchmark_pair",p=>p.mode==="check"?{ok:true}:{ok:true});await h.nodes.run.onclick();eq(h.calls.length,2,"malformed parity blocks measurement");eq(JSON.parse(h.nodes.output.value)[1].error,"invalid_probe_response","malformed result rejected");
    return "PASS 8 admin probe scenarios (ordering, mismatches, scope denial, paired counts, quota/access, manual mode, malformed response)";
}

testSuite(fs.readFileSync(path.join(__dirname,"../includes/class-bvlog-direct-read.php"),"utf8")).then(console.log).catch(e=>{console.error(e);process.exitCode=1;});
