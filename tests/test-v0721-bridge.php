<?php
// Transport fixture: WordPress/GAS calls are mocked. No real operations or uploads.
define('ABSPATH','/');
define('BVLOG_SHARED_SECRET', str_repeat('S',32));
class WP_Error {
    private $code; private $message;
    function __construct($code,$message,$data=null) {$this->code=$code;$this->message=$message;}
    function get_error_code(){return $this->code;}
    function get_error_message(){return $this->message;}
}
function is_wp_error($x){return $x instanceof WP_Error;}
function wp_generate_uuid4(){static $n=0;$n++;return sprintf('aaaaaaaa-bbbb-cccc-dddd-%012d',$n);}
function wp_parse_url($url){return parse_url($url);}
function wp_json_encode($a){return json_encode($a);}
function sanitize_key($s){return preg_replace('/[^a-z0-9_\-]/','',strtolower((string)$s));}
function sanitize_text_field($s){return strip_tags((string)$s);}
function rest_ensure_response($x){return $x;}
function bvlog_settings(){return ['script_url'=>'https://script.google.com/macros/s/'.str_repeat('a',36).'/exec','folder_id'=>'FOLDERID123456789','template_id'=>'TEMPLATEID123456789'];}
$GLOBALS['test_options']=[];
function update_option($name,$v,$autoload=false){$GLOBALS['test_options'][$name]=$v;return true;}
function get_option($name,$fallback=null){return $GLOBALS['test_options'][$name]??$fallback;}
$GLOBALS['networkQueue']=[];$GLOBALS['calls']=[];
function wp_remote_post($url,$options){
    $GLOBALS['calls'][]=['method'=>'POST','timeout'=>$options['timeout'],'redirects'=>$options['redirection'],
      'body'=>json_decode($options['body'],true)];
    if(!$GLOBALS['networkQueue'])throw new Exception('Unexpected POST');
    return array_shift($GLOBALS['networkQueue']);
}
function wp_safe_remote_get($url,$options){
    $GLOBALS['calls'][]=['method'=>'GET','timeout'=>$options['timeout'],'redirects'=>$options['redirection']];
    if(!$GLOBALS['networkQueue'])throw new Exception('Unexpected GET');
    return array_shift($GLOBALS['networkQueue']);
}
function wp_remote_retrieve_response_code($r){return $r['code']??0;}
function wp_remote_retrieve_body($r){return $r['body']??'';}
function wp_remote_retrieve_header($r,$h){return $r['headers'][$h]??'';}
function okResponse(){return ['code'=>200,'body'=>'{"ok":true,"data":{"LOG":[]}}'];}
function failFast(){return new WP_Error('http_request_failed','cURL error 28: Operation timed out after 15009 milliseconds');}
function check($condition,$message){if(!$condition)throw new Exception($message);}
require __DIR__.'/../includes/class-bvlog-api.php';
// Failed read must keep its own transport error, 35s limit and no redirect credentials.
$GLOBALS['networkQueue']=[failFast()];
$failure=BVLOG_API::forward('read',['doc_id'=>'DOCUMENT0123456789012']);
check($failure instanceof WP_Error,'Read timeout must return WP_Error');
check($GLOBALS['calls'][0]['timeout']===35,'read POST needs 35s timeout');
check($GLOBALS['calls'][0]['redirects']===0,'POST must not follow redirect carrying credentials');
check(preg_match('/^[a-f0-9]{12}$/',$GLOBALS['calls'][0]['body']['request_id'])===1,
  'Missing short request correlation ID');
$history=get_option('bvlog_bridge_request_history');
check(count($history)===1 && $history[0]['action']==='read' && $history[0]['stage']==='post_transport_error',
  'Failed read must be retained as sanitized history');
// A newer success should overwrite last diagnostics, but NOT erase the failed read.
$GLOBALS['networkQueue']=[['code'=>302,'headers'=>['location'=>'https://script.googleusercontent.com/macros/echo?nonce=PRIVATE']],okResponse()];
$success=BVLOG_API::forward('read',['doc_id'=>'DOCUMENT0123456789012']);
check($success['ok']===true,'Read through Google redirect failed');
check($GLOBALS['calls'][1]['timeout']===35,'success read lost 35s POST budget');
check($GLOBALS['calls'][2]['timeout']===15,'Google redirect GET timeout not constrained');
check($GLOBALS['calls'][2]['redirects']===0,'Redirect GET should not follow new redirects');
check(count(get_option('bvlog_bridge_request_history'))===2,
  'The successful request must not erase the prior failure');
check(get_option('bvlog_bridge_diagnostics')['stage']==='complete','Most recent snapshot must be success');
// LIST remains 15s; operation POST is deliberately 30s.
$GLOBALS['networkQueue']=[okResponse()];BVLOG_API::forward('list');
check(end($GLOBALS['calls'])['timeout']===15,'List timeout changed unexpectedly');
$GLOBALS['networkQueue']=[okResponse()];BVLOG_API::forward('operation',['kind'=>'log','text'=>'SENSITIVE INCIDENT TEXT']);
check(end($GLOBALS['calls'])['timeout']===30,'Operation write timeout must allow 30s');
// Bound the history and check that no PII or secret was included.
for($i=0;$i<36;$i++){$GLOBALS['networkQueue']=[failFast()];BVLOG_API::forward('read',['doc_id'=>'DOCUMENT0123456789012']);}
$history=get_option('bvlog_bridge_request_history');
check(count($history)===30,'History must have a bounded 30-entry ring');
$json=json_encode($history,JSON_UNESCAPED_UNICODE);
check(!str_contains($json,'SENSITIVE INCIDENT TEXT'),'Operation content leaked into history');
check(!str_contains($json,'DOCUMENT0123456789012'),'Document ID leaked into history');
check(!str_contains($json,str_repeat('S',32)),'Shared secret leaked into history');
check(!str_contains($json,'PRIVATE'),'Google redirect credential leaked into history');
check(str_contains(file_get_contents(__DIR__.'/../includes/class-bvlog-admin.php'),'bvlog_bridge_request_history'),
  'No WordPress admin UI for request history');
echo "PASS v0.7.2.1 PHP bridge: read 35s, list 15s/write 30s, 15s redirect, redacted capped history, safe correlation.\n";
