<?php
// Minimal WordPress stubs: verify anonymous opt-in and permission paths.
define('ABSPATH', '/tmp/');
function plugin_dir_path($file) { return dirname($file) . '/'; }
function plugin_dir_url($file) { return 'https://example.org/plugin/'; }
function add_action(...$args) {}
function add_filter(...$args) {}
function add_shortcode(...$args) {}
function get_option($name, $fallback = false) { return $GLOBALS['options'][$name] ?? $fallback; }
function wp_parse_args($args, $defaults) { return array_merge($defaults, $args); }
function is_user_logged_in() { return $GLOBALS['logged_in']; }
function current_user_can($what) { return $GLOBALS['admin']; }
function wp_get_current_user() { return (object)['ID'=>1, 'user_email'=>'demo@example.com', 'roles'=>($GLOBALS['logged_in'] ? ['editor'] : []), 'display_name'=>($GLOBALS['logged_in'] ? 'Logged In' : '')]; }
function get_transient($key) { return $GLOBALS['transient'][$key] ?? false; }
function set_transient($key, $val, $expires) { $GLOBALS['transient'][$key] = $val; }
function is_wp_error($v) { return $v instanceof WP_Error; }
class WP_Error { public $code; public $data; public function __construct($code, $message, $data) {$this->code=$code;$this->data=$data;} }
class Stub_Request {private $method;private $route;public function __construct($m,$r){$this->method=$m;$this->route=$r;}public function get_method(){return $this->method;}public function get_route(){return $this->route;}}
$GLOBALS['options'] = ['bvlog_settings'=>['auth_mode'=>'public']];
$GLOBALS['logged_in'] = false;
$GLOBALS['admin'] = false;
$GLOBALS['transient'] = [];
require dirname(__DIR__) . '/bg-voice-logger.php';
function check($condition, $message) { if(!$condition){fwrite(STDERR,"FAIL: $message\n");exit(1);} }
check(bvlog_allowed(), 'Anonymous access enabled by default');
$req=new Stub_Request('GET','/bvlog/v1/documents');
check(BVLOG_API::authorize($req)===true,'Anonymous can list documents');
$req=new Stub_Request('POST','/bvlog/v1/operation');
check(BVLOG_API::authorize($req)===true,'Anonymous can send operations');
for ($i=0;$i<44;$i++) check(BVLOG_API::authorize($req)===true,'Allowed under 45 writes/min');
$error=BVLOG_API::authorize($req);
check($error instanceof WP_Error && $error->data['status']===429,'Limits public write bursts');
$GLOBALS['options']['bvlog_settings']=['auth_mode'=>'google'];
check(!bvlog_allowed(),'Anonymous access disabled in Google login mode');
check(BVLOG_API::authorize($req) instanceof WP_Error,'No anonymous access when Google login selected');
$GLOBALS['logged_in'] = true;
check(bvlog_allowed(),'Logged in editor still allowed');
check(BVLOG_API::authorize($req)===true,'Logged-in editor bypasses anonymous throttling');
echo "PASS: explicit public mode, rate limiting, Google-only default, WordPress editor fallback.\n";
