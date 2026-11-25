<?php
if (!defined('ABSPATH')) { exit; }

/** Opt-in read-only architecture pilot. Existing GAS writer remains authoritative. */
final class BVLOG_Direct_Read {
    public static function mode(){
        $mode=defined('BVLOG_DIRECT_READ_MODE')?BVLOG_DIRECT_READ_MODE:'off';
        return in_array($mode,array('shadow','direct'),true)&&BVLOG_Auth::mode()!=='public'?$mode:'off';
    }
    public static function docs(){
        $ids=defined('BVLOG_DIRECT_TEST_DOCS')&&is_array(BVLOG_DIRECT_TEST_DOCS)?BVLOG_DIRECT_TEST_DOCS:array();
        // A bounded, explicit synthetic-incident allowlist, never every real incident.
        if(count($ids)>16)return array();
        return array_values(array_unique(array_filter($ids,array('BVLOG_Google_Read_Transport','valid_id'))));
    }
    public static function selected($doc){
        return self::mode()!=='off'&&in_array($doc,self::docs(),true);
    }
    public static function approved($doc,$tab){
        $approved=defined('BVLOG_DIRECT_APPROVED_TABS')&&is_array(BVLOG_DIRECT_APPROVED_TABS)?BVLOG_DIRECT_APPROVED_TABS:array();
        return isset($approved[$doc])&&is_array($approved[$doc])&&in_array($tab,$approved[$doc],true);
    }
    public static function install(){
        if(self::mode()!=='off'&&self::docs()&&current_user_can('manage_options')){
            BVLOG_Read_Cache::install();BVLOG_Read_Cache::cleanup();
        }
    }
    private static function config(){
        if(!BVLOG_Read_Cache::installed())throw new BVLOG_Direct_Error('cache_install');
        $s=bvlog_settings();
        $folder=$s['folder_id']??'';$template=$s['template_id']??'';
        if(!BVLOG_Google_Read_Transport::valid_id($folder)||!BVLOG_Google_Read_Transport::valid_id($template)||$folder===$template)
            throw new BVLOG_Direct_Error('configuration');
        $rollout=defined('BVLOG_DIRECT_ROLLOUT')?BVLOG_DIRECT_ROLLOUT:'';
        if(!is_string($rollout)||!preg_match('/^[A-Za-z0-9_-]{8,64}$/D',$rollout))
            throw new BVLOG_Direct_Error('rollout_required');
        $c=BVLOG_Google_Read_Transport::credentials(defined('BVLOG_DIRECT_SERVICE_ACCOUNT_FILE')?BVLOG_DIRECT_SERVICE_ACCOUNT_FILE:'');
        $ttl=defined('BVLOG_DIRECT_CACHE_TTL')?BVLOG_DIRECT_CACHE_TTL:20;
        if(!is_int($ttl)||$ttl<0||$ttl>30)throw new BVLOG_Direct_Error('cache_ttl');
        // Current DKA policy grants every admitted operator access to documents
        // in the configured folder. Do not use this shared cache if that model
        // is changed to per-document/operator permissions without updating it.
        $scope=hash('sha256',BVLOG_Direct_Crypto::json(array('v1',get_current_blog_id(),$rollout,$folder,$template,
            $c['fingerprint'],$ttl,BVLOG_Auth::mode(),$s['google_allow_any']??0,$s['google_allowed_emails']??'',$s['roles']??'')));
        return array('folder'=>$folder,'template'=>$template,'credential'=>$c,'ttl'=>$ttl,'scope'=>$scope);
    }
    private static function error($e){
        $status=$e instanceof BVLOG_Direct_Error?$e->status:503;
        $code=$e instanceof BVLOG_Direct_Error?$e->getMessage():($e instanceof BVLOG_Read_Unsupported?'unsupported_shape':'internal');
        $code=preg_replace('/[^a-z0-9_]/','_',$code);
        return new WP_Error('bvlog_direct_'.$code,'Google read pilot: '.$code.'. See administrator diagnostics.',array('status'=>$status));
    }
    public static function begin_mutation($doc){
        if(!self::selected($doc)||!BVLOG_Read_Cache::installed())return null;
        try{return BVLOG_Read_Cache::begin_write($doc);}
        catch(Throwable $e){return self::error($e);}
    }
    public static function end_mutation($guard,$result){
        if(!is_array($guard))return;
        $ok=!is_wp_error($result)&&is_object($result)&&method_exists($result,'get_data')&&!empty($result->get_data()['ok']);
        try{BVLOG_Read_Cache::end_write($guard,$ok);}
        catch(Throwable $e){
            // Do not turn a confirmed write into a failed ACK. A retained writer
            // marker prevents the experimental read cache from being reused.
            try{update_option('bvlog_direct_last_guard_error',gmdate('c'),false);}catch(Throwable $ignore){}
        }
    }
    private static function decorated($result,$backend,$created,$reason=''){
        $result['read_meta']=array('backend'=>$backend,'fetched_at'=>gmdate('c',$created),'verified_at'=>gmdate('c'));
        if($reason!=='')$result['read_meta']['reason']=$reason;
        return $result;
    }
    private static function valid_result($result,$doc,$tab){
        return is_array($result)&&!empty($result['ok'])&&($result['id']??'')===$doc&&
            ($result['loaded_tabs']??null)===array($tab)&&is_array($result['data'][$tab]??null);
    }
    private static function cached_result($cached,$doc,$tab){
        if(!$cached||!self::valid_result($cached['result'],$doc,$tab))return null;
        $r=$cached['result'];
        // json_decode(..., true) collapses empty objects; restore the map.
        $r['data']['FIELD_AUDIO']=(object)($r['data']['FIELD_AUDIO']??array());
        return self::decorated($r,'server_cache',$cached['created']);
    }
    private static function checked_state($key,$before){
        if(!BVLOG_Read_Cache::stable($before,BVLOG_Read_Cache::state($key)))
            throw new BVLOG_Direct_Error('changed_during_read');
    }
    /** Fetch a strict direct result. The caller alone decides whether a safe
     * fallback is appropriate. A permission failure is never a fallback signal.
     */
    private static function direct($doc,$tab,$cfg,$google,$useCache,$force){
        $meta=$google->metadata($doc);
        $key=BVLOG_Read_Cache::doc_key($doc);$state=BVLOG_Read_Cache::state($key);
        if($state['pending'])throw new BVLOG_Direct_Error('write_pending');
        if($useCache&&!$force&&$cfg['ttl']>0){
            $cached=self::cached_result(BVLOG_Read_Cache::get($key,$tab,$cfg['scope'],$state,$meta['version']),$doc,$tab);
            if($cached){self::checked_state($key,$state);return $cached;}
        }
        $lock=BVLOG_Read_Cache::lock($key);
        try{
            $state=BVLOG_Read_Cache::state($key);
            if($state['pending'])throw new BVLOG_Direct_Error('write_pending');
            if($useCache&&!$force&&$cfg['ttl']>0){
                $cached=self::cached_result(BVLOG_Read_Cache::get($key,$tab,$cfg['scope'],$state,$meta['version']),$doc,$tab);
                if($cached){
                    $again=$google->metadata($doc);
                    if($again['version']===$meta['version']){
                        self::checked_state($key,$state);return $cached;
                    }
                    $meta=$again;
                }
            }
            $result=$google->read($doc,$tab,$meta);
            if(!self::valid_result($result,$doc,$tab))BVLOG_Read_Projection::unsupported();
            if(strlen(BVLOG_Direct_Crypto::json($result))>1000000)BVLOG_Read_Projection::unsupported();
            $after=$google->metadata($doc);
            if($meta['version']!==$after['version'])throw new BVLOG_Direct_Error('changed_during_read');
            self::checked_state($key,$state);
            $created=time();
            if($useCache){
                BVLOG_Read_Cache::put($key,$tab,$cfg['scope'],$state,$meta['version'],$result,$created,$cfg['ttl']);
                self::checked_state($key,$state);
            }
            return self::decorated($result,'sheets_api',$created);
        }finally{BVLOG_Read_Cache::unlock($lock);}
    }
    public static function document($doc,$tab,$force=false){
        if(self::mode()!=='direct'||!self::selected($doc)||!in_array($tab,BVLOG_Read_Projection::TABS,true)||!self::approved($doc,$tab))return null;
        if(!BVLOG_Auth::identity())return new WP_Error('bvlog_login_required','Login required.',array('status'=>401));
        // The per-operator SMS grant is produced by the verified GAS INFO path.
        // It must never be stored in a shared cache.
        if($tab==='INFO'&&class_exists('BVLOG_SMS')&&BVLOG_SMS::test_doc($doc))return null;
        try{
            $cfg=self::config();$google=new BVLOG_Google_Read_Transport($cfg);
            // Opportunistically remove expired pilot snapshots/markers, never
            // the original application queue or operational data.
            if(random_int(1,20)===1)BVLOG_Read_Cache::cleanup();
            try{$r=self::direct($doc,$tab,$cfg,$google,true,$force);}
            catch(Throwable $e){
                $reason=$e instanceof BVLOG_Read_Unsupported?'unsupported_shape':
                    ($e instanceof BVLOG_Direct_Error&&$e->getMessage()==='write_pending'?'write_pending':'');
                if($reason==='')throw $e;
                // Re-authorize against live Drive before the only two allowed
                // fallbacks. Do not cache the fallback response.
                $google->metadata($doc);
                $fallback=BVLOG_API::forward('read',array('doc_id'=>$doc,'tab'=>$tab));
                if(is_wp_error($fallback))return $fallback;
                $r=$fallback->get_data();
                if(empty($r['ok']))return $fallback;
                if(!self::valid_result($r,$doc,$tab))throw new BVLOG_Direct_Error('fallback_shape');
                $r=self::decorated($r,'gas_fallback',time(),$reason);
            }
            $response=rest_ensure_response($r);
            $response->header('Cache-Control','private, no-store, max-age=0');
            return $response;
        }catch(Throwable $e){return self::error($e);}
    }
    private static function ordered($v){
        if(is_object($v))$v=(array)$v;
        if(!is_array($v))return $v;
        // Empty arrays/objects normalize for comparisons. List order is
        // significant; map property insertion order is not.
        if($v&&array_keys($v)!==range(0,count($v)-1))ksort($v,SORT_STRING);
        foreach($v as $k=>$x)$v[$k]=self::ordered($x);
        return $v;
    }
    public static function differences($a,$b){
        $keys=array_unique(array_merge(array_keys($a),array_keys($b)));$different=array();
        foreach($keys as $key){
            if(!array_key_exists($key,$a)||!array_key_exists($key,$b)||self::ordered($a[$key])!==self::ordered($b[$key]))
                $different[]=in_array($key,array('LOG','INFO','INFO_SECTIONS','TECH','TEAM','FIELD_AUDIO','MISSING_TABS'),true)?$key:'other';
        }
        return array_values(array_unique($different));
    }
    private static function gas($doc,$tab){
        $started=microtime(true);
        $res=BVLOG_API::forward('read',array('doc_id'=>$doc,'tab'=>$tab));
        $ms=(int)round((microtime(true)-$started)*1000);
        if(is_wp_error($res))throw new BVLOG_Direct_Error('gas_read_error');
        $data=$res->get_data();
        if(!self::valid_result($data,$doc,$tab))throw new BVLOG_Direct_Error('gas_read_error');
        return array('result'=>$data,'metrics'=>array_merge(array('elapsed_ms'=>$ms),BVLOG_API::bridge_metrics()));
    }
    public static function register_routes(){
        register_rest_route('bvlog/v1','/performance-probe',array('methods'=>'POST',
            'permission_callback'=>array(__CLASS__,'authorize_probe'),'callback'=>array(__CLASS__,'probe')));
    }
    public static function authorize_probe($request){
        if(self::mode()==='off'||!current_user_can('manage_options')||!BVLOG_Auth::wp_identity()||
            !wp_verify_nonce($request->get_header('X-WP-Nonce'),'wp_rest'))
            return new WP_Error('bvlog_direct_admin','Administrator test mode required.',array('status'=>403));
        return true;
    }
    public static function probe($request){
        $p=(array)$request->get_json_params();$doc=$p['doc']??'';$tab=$p['tab']??'';$mode=$p['mode']??'';
        if(!self::selected($doc)||!in_array($tab,BVLOG_Read_Projection::TABS,true)||
            !in_array($mode,array('check','gas','direct','cache','compare'),true))
            return new WP_Error('bvlog_direct_probe','Invalid isolated test request.',array('status'=>400));
        $started=microtime(true);$google=null;$gasMetrics=array();
        $out=array('ok'=>false,'mode'=>$mode,'tab'=>$tab,'wp_version'=>BVLOG_VERSION,'utc'=>gmdate('c'));
        try{
            $cfg=self::config();$google=new BVLOG_Google_Read_Transport($cfg,$mode==='compare'?60:18);
            if($mode==='check'){
                $google->metadata($doc);$google->check_sheet_access($doc);
                $lease=BVLOG_Read_Cache::lock(BVLOG_Read_Cache::doc_key($doc));
                BVLOG_Read_Cache::unlock($lease);
                $ping=BVLOG_API::forward('ping');
                $version=!is_wp_error($ping)?($ping->get_data()['version']??''):'';
                if(!in_array($version,array('0.8.2','0.8.3'),true))throw new BVLOG_Direct_Error('verify_gas_revision');
                $out['gas_version']=$version;$out['ok']=true;
            }elseif($mode==='gas'){
                $google->metadata($doc);
                $g=self::gas($doc,$tab);$gasMetrics=$g['metrics'];$out['ok']=true;
                $out['backend']='gas';$out['result_bytes']=strlen(BVLOG_Direct_Crypto::json($g['result']));
            }else{
                $initial=$mode==='compare'?$google->metadata($doc):null;
                $r=self::direct($doc,$tab,$cfg,$google,$mode==='cache',false);
                $out['backend']=$r['read_meta']['backend'];$out['result_bytes']=strlen(BVLOG_Direct_Crypto::json($r));
                if($mode==='compare'){
                    $g=self::gas($doc,$tab);$gasMetrics=$g['metrics'];
                    $after=$google->metadata($doc);
                    if($initial['version']!==$after['version'])throw new BVLOG_Direct_Error('comparison_changed');
                    $out['different_fields']=self::differences($r['data'],$g['result']['data']);
                    $out['parity']=!$out['different_fields'];
                }
                $out['ok']=true;
            }
        }catch(Throwable $e){
            $err=self::error($e);$out['error']=$err->get_error_code();$out['http_status']=$err->get_error_data()['status'];
            // This route is admin-only; never add identifiers, names or metadata values.
            if($e instanceof BVLOG_Direct_Error&&$e->getMessage()==='scope_denied'&&$e->scope_reason!=='')
                $out['scope_reason']=$e->scope_reason;
        }
        $out['elapsed_ms']=(int)round((microtime(true)-$started)*1000);
        if($google)$out['google']=$google->metrics;
        if($gasMetrics)$out['gas']=$gasMetrics;
        // Deliberately no raw cells, document ID, identity, token, or URLs.
        $response=rest_ensure_response($out);$response->header('Cache-Control','private, no-store, max-age=0');
        return $response;
    }
    public static function admin_panel(){
        if(!current_user_can('manage_options'))return;
        echo '<h2>Direct Google read pilot (#46)</h2>';
        echo '<p>Mode: <strong>'.esc_html(self::mode()).'</strong>. No write or media backend replacement. Synthetic incidents only.</p>';
        if(self::mode()==='off'||!self::docs()){
            echo '<p>Disabled. Configure a private read-only service account, a synthetic document allowlist and rollout ID. See docs/UPGRADE_V090_ALPHA_BG.md.</p>';
            return;
        }
        if(!BVLOG_Read_Cache::installed()){echo '<p>Cache table not ready.</p>';return;}
        if(get_option('bvlog_direct_last_guard_error',''))echo '<p>Cache write guard reported an error. Review the pilot before use.</p>';
        echo '<div id="bvlog-perf-probe"><p>Run Check first for individual probes. All-tab parity runs Check and compares LOG, INFO, TECH and TEAM. Paired benchmark checks the selected tab before measuring GAS, Direct and Cache. Use stable synthetic fixtures; neither suite enables Direct mode.</p>';
        echo '<label>Test document <select id="bvlog-perf-doc">';
        foreach(self::docs() as $i=>$doc)echo '<option value="'.esc_attr($doc).'">Test slot '.($i+1).'</option>';
        echo '</select></label> <label>Tab <select id="bvlog-perf-tab">';
        foreach(BVLOG_Read_Projection::TABS as $tab)echo '<option>'.esc_html($tab).'</option>';
        echo '</select></label> <label>Mode <select id="bvlog-perf-mode"><option>check</option><option>compare</option><option>gas</option><option>direct</option><option>cache</option><option value="parity_all">All-tab parity</option><option value="benchmark_pair">Paired benchmark</option></select></label> ';
        echo '<label>Samples <select id="bvlog-perf-n"><option>1</option><option>10</option><option>40</option></select></label> ';
        echo '<label>Concurrent requests <select id="bvlog-perf-c"><option>1</option><option>5</option><option>10</option></select></label> ';
        echo '<button type="button" class="button" id="bvlog-perf-run">Run probe</button> <button type="button" class="button" id="bvlog-perf-export" disabled>Export JSON</button>';
        echo '<p id="bvlog-perf-status" role="status"></p><pre id="bvlog-perf-summary" style="white-space:pre-wrap"></pre><textarea readonly id="bvlog-perf-output" rows="12" style="width:100%"></textarea></div>';
        $config=array('url'=>rest_url('bvlog/v1/performance-probe'),'nonce'=>wp_create_nonce('wp_rest'));
        echo '<script>(function(cfg){"use strict";
const by=id=>document.getElementById("bvlog-perf-"+id),run=by("run"),out=by("output"),status=by("status"),exp=by("export");
let results=[],checked="";
const tabs=["LOG","INFO","TECH","TEAM"],sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const blocked=r=>!r.ok&&[401,403,429].includes(r.http_status);
function report(){
out.value=JSON.stringify(results,null,2);exp.disabled=!results.length;
const groups={};for(const r of results){const k=[r.slot,r.tab,r.mode,r.concurrency,r.backend||"error"].join(" / ");(groups[k]||(groups[k]=[])).push(r);}
const summary=[];for(const [k,rs] of Object.entries(groups)){
const good=rs.filter(x=>x.ok&&Number.isFinite(x.client_ms)),v=good.map(x=>x.client_ms).sort((a,b)=>a-b);
const median=v.length?(v[Math.floor((v.length-1)/2)]+v[Math.ceil((v.length-1)/2)])/2:null;
const row={group:k,n:rs.length,errors:rs.length-good.length,p50_client_ms:median,max_client_ms:v.length?v[v.length-1]:null,
p95_client_ms:v.length>=40?v[Math.ceil(v.length*0.95)-1]:null,
mean_sheets_calls:good.length?good.reduce((s,x)=>s+(x.google?.sheets_calls||0),0)/good.length:null,
mean_drive_calls:good.length?good.reduce((s,x)=>s+(x.google?.drive_calls||0),0)/good.length:null};
if(rs[0].mode==="compare"){row.parity_pass=rs.filter(x=>x.ok&&x.parity===true).length;row.parity_fail=rs.filter(x=>x.ok&&x.parity===false).length;row.parity_unavailable=rs.length-row.parity_pass-row.parity_fail;}
summary.push(row);}
by("summary").textContent=JSON.stringify(summary,null,2);
}
exp.onclick=()=>{const blob=new Blob([JSON.stringify(results,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);
const a=document.createElement("a");a.href=url;a.download="bvlog-direct-benchmark.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
async function probe(doc,tab,mode,slot,concurrency){const t=performance.now();
const context=()=>({mode,tab,slot,concurrency,client_ms:Math.round(performance.now()-t)});
try{const response=await fetch(cfg.url,{method:"POST",credentials:"same-origin",cache:"no-store",
headers:{"Content-Type":"application/json","X-WP-Nonce":cfg.nonce},body:JSON.stringify({doc,tab,mode})});
const value=await response.json();
if(!response.ok)return {ok:false,...context(),http_status:response.status,error:"http_error"};
if(!value||typeof value.ok!=="boolean"||value.mode!==mode||value.tab!==tab||(mode==="compare"&&value.ok&&typeof value.parity!=="boolean"))
return {ok:false,...context(),error:"invalid_probe_response"};
return {...value,...context()};
}catch(e){return {ok:false,...context(),error:"client_transport"};}}
async function one(doc,tab,mode,slot){const r=await probe(doc,tab,mode,slot,1);results.push(r);report();return r;}
run.onclick=async()=>{
if(run.disabled)return;
const doc=by("doc").value,tab=by("tab").value,mode=by("mode").value,slot=by("doc").selectedIndex+1;
const suite=mode==="parity_all"||mode==="benchmark_pair";
if(!suite&&mode!=="check"&&checked!==doc){status.textContent="Run Check for this test document first.";return;}
const selectedN=Number(by("n").value),selectedC=Number(by("c").value);
if(![1,10,40].includes(selectedN)||![1,5,10].includes(selectedC)){status.textContent="Invalid sample count.";return;}
const n=selectedN,c=Math.min(n,selectedC);
run.disabled=true;try{
if(mode==="check"||suite){
checked="";status.textContent="Checking test document...";
const check=await one(doc,tab,"check",slot);
if(!check.ok){status.textContent="Check failed; no further requests. Review the diagnostic code.";return;}
checked=doc;if(mode==="check"){status.textContent="Check passed.";return;}
}
if(mode==="compare"||suite){
const plan=mode==="parity_all"?tabs:[tab];let passed=0,failed=0,unavailable=0,done=0;
for(const target of plan){
status.textContent="Comparing "+target+" ("+(done+1)+"/"+plan.length+")";
const r=await one(doc,target,"compare",slot);done++;
if(!r.ok)unavailable++;else if(r.parity)passed++;else failed++;
if(blocked(r))break;
if(done<plan.length)await sleep(1500);
}
status.textContent="Parity: "+passed+" passed, "+failed+" mismatched, "+unavailable+" unavailable, "+(plan.length-done)+" not run.";
if(mode!=="benchmark_pair"||passed!==plan.length)return;
}
const modes=mode==="benchmark_pair"?["gas","direct","cache"]:[mode];
const total=n*modes.length;let done=0,errors=0;
for(let i=0;i<n;i+=c){
for(const variant of modes){
const group=await Promise.all(Array.from({length:Math.min(c,n-i)},()=>probe(doc,tab,variant,slot,c)));
results.push(...group);done+=group.length;errors+=group.filter(x=>!x.ok).length;report();
status.textContent="Completed "+done+"/"+total+"; "+errors+" errors.";
if(group.some(blocked)){status.textContent+=" Stopped after an access or quota denial.";return;}
if(done<total)await sleep(1500);
}}
}finally{run.disabled=false;}};
})('.wp_json_encode($config,JSON_HEX_TAG|JSON_HEX_AMP|JSON_HEX_APOS|JSON_HEX_QUOT).');</script>';
    }
}
