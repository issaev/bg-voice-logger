<?php
// Exercise WordPress STT HMAC ticket minting with in-process stubs only.
define('ABSPATH','/tmp/');
define('MINUTE_IN_SECONDS',60);define('DAY_IN_SECONDS',86400);
$GLOBALS['opts']=['bvlog_settings'=>['auth_mode'=>'google','stt_mode'=>'cloud','stt_worker_url'=>'https://bvlog-stt.example/stt/transcribe'],
    'bvlog_stt_signing_secret'=>'test-only-secret-at-least-32-characters-value'];
$GLOBALS['cached']=[];$GLOBALS['identity']=['kind'=>'google','sub'=>'123456789012345','name'=>'Demo'];
function bvlog_settings(){return $GLOBALS['opts']['bvlog_settings'];}
function get_option($key,$default=''){return $GLOBALS['opts'][$key]??$default;}
function get_transient($key){return $GLOBALS['cached'][$key]??false;}
function set_transient($key,$val,$ttl){$GLOBALS['cached'][$key]=$val;}
function sanitize_text_field($v){return (string)$v;}
function get_current_user_id(){return 123;}
function home_url(){return 'https://spasitelenclub.com/';}
function wp_generate_uuid4(){return '11111111-2222-4333-8444-555555555555';}
function wp_json_encode($v){return json_encode($v);}
function rest_ensure_response($v){return $v;}
function esc_url_raw($v){return $v;}
class WP_Error{public $code,$message,$data;function __construct($a,$b,$c){$this->code=$a;$this->message=$b;$this->data=$c;}}
class BVLOG_Auth{static function identity(){return $GLOBALS['identity'];}}
class Request{function get_json_params(){return ['op_id'=>'00000000-0000-4000-8000-000000000001','doc_id'=>str_repeat('a',25)];}}
require __DIR__.'/../includes/class-bvlog-stt.php';
function check($x,$what){if(!$x){fwrite(STDERR,"FAIL $what\n");exit(1);}}
$reply=BVLOG_STT::token(new Request());check($reply['ok']===true,'ticket minted');
$parts=explode('.',$reply['token']);check(count($parts)===3,'JWT structure');
$sig=rtrim(strtr(base64_encode(hash_hmac('sha256',$parts[0].'.'.$parts[1],$GLOBALS['opts']['bvlog_stt_signing_secret'],true)),'+/','-_'),'=');
check(hash_equals($sig,$parts[2]),'HMAC matches');
$claims=json_decode(base64_decode(strtr($parts[1],'-_','+/')),true);
check($claims['aud']==='bg-voice-logger-stt','audience scoped');
check($claims['exp']-$claims['iat']===150,'short expiry');
check($claims['sub']===substr(hash('sha256',$GLOBALS['identity']['sub']),0,40),'opaque user ID');
$GLOBALS['identity']=['kind'=>'public'];
check(BVLOG_STT::token(new Request()) instanceof WP_Error,'public user rejected');
$GLOBALS['identity']=null;
check(BVLOG_STT::token(new Request()) instanceof WP_Error,'anonymous user rejected');
echo "PASS: WordPress ticket signatures, scopes, expiration and public access rejected.\n";
