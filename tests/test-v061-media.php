<?php
// Read-only transport policy tests. No real Google/WordPress network traffic.
define('ABSPATH','/');
require_once dirname(__DIR__) . '/includes/class-bvlog-api.php';
class WP_Error {private $code;private $message;function __construct($code,$message){$this->code=$code;$this->message=$message;}function get_error_code(){return $this->code;}function get_error_message(){return $this->message;}}
$opts=[];$last_post=null;$last_get=null;$response_mode='timeout';
function bvlog_settings(){return ['script_url'=>'https://script.google.com/macros/s/TESTDEMO12345678901234567890/exec','folder_id'=>'FOLDERTEST123456','template_id'=>'TEMPLATETEST123456'];}
function wp_generate_uuid4(){static $n=0;$n++;return sprintf('%08x-0000-4000-8000-%012d',$n,$n);}
function wp_parse_url($x){return parse_url($x);}
function wp_json_encode($x){return json_encode($x);}
function is_wp_error($x){return $x instanceof WP_Error;}
function sanitize_key($s){return preg_replace('/[^a-z0-9_\-]/','',strtolower($s));}
function update_option($key,$value,$autoload=false){global $opts;$opts[$key]=$value;return true;}
function get_option($key,$default=false){global $opts;return $opts[$key]??$default;}
function wp_remote_post($url,$args){global $last_post,$response_mode;$last_post=$args;
    if($response_mode==='timeout')return new WP_Error('http_request_failed','cURL error 28: Operation timed out after 45001 milliseconds: https://private.example/?secret=do-not-log');
    return ['response'=>['code'=>302],'headers'=>['location'=>'https://script.googleusercontent.com/macros/echo?private=1'],'body'=>''];}
function wp_safe_remote_get($url,$args){global $last_get;$last_get=$args;return ['response'=>['code'=>200],'headers'=>[],'body'=>'{"ok":true}'];}
function wp_remote_retrieve_response_code($r){return $r['response']['code'];}
function wp_remote_retrieve_header($r,$header){return $r['headers'][$header]??null;}
function wp_remote_retrieve_body($r){return $r['body'];}
function rest_ensure_response($x){return $x;}
define('BVLOG_SHARED_SECRET','dummy_secret_more_than_24_characters_for_test');
function check($expr,$label){if(!$expr)throw new Exception($label);}
BVLOG_API::forward('audio_read',['doc_id'=>'DOCUMENTTEST123456']);
check($last_post['timeout']===45,'audio read POST must allow 45 seconds');
check(strpos($opts['bvlog_bridge_diagnostics']['detail'],'curl_28')!==false,'curl error classification missing');
check(strpos(json_encode($opts),'do-not-log')===false,'transport leaked credentials');
check(count($opts['bvlog_bridge_media_history'])===1,'media history error not recorded');
BVLOG_API::forward('photo_read',['doc_id'=>'DOCUMENTTEST123456']);
check($last_post['timeout']===35,'photo read POST must allow 35 seconds');
BVLOG_API::forward('operation',['kind'=>'photo']);
check($last_post['timeout']===35,'photo write POST must allow 35 seconds');
BVLOG_API::forward('operation',['kind'=>'audio_part']);
check($last_post['timeout']===35,'audio part POST must allow 35 seconds');
BVLOG_API::forward('operation',['kind'=>'log']);
check($last_post['timeout']===15,'normal LOG writes keep 15 seconds');
$response_mode='redirect';
BVLOG_API::forward('audio_read',['doc_id'=>'DOCUMENTTEST123456']);
check($last_get['timeout']===25,'audio read redirect GET must allow 25 seconds');
check($opts['bvlog_bridge_diagnostics']['stage']==='complete','audio read redirect success');
check(count($opts['bvlog_bridge_media_history'])===5,'media history keeps only media operations');
check($opts['bvlog_bridge_media_history'][0]['request_id']!==$opts['bvlog_bridge_media_history'][1]['request_id'],'request IDs differ');
echo "PASS v0.6.1: media timeouts, diagnostics, redirect, redaction, bounded history.\n";
