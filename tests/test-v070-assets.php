<?php
// WordPress-enqueue integration in a read-only fake environment. No network.
define('ABSPATH','/');
$actions = array(); $shortcodes=array();$enqueued=array();$inline=array();
function plugin_dir_path($f){return dirname($f).'/';}
function plugin_dir_url($f){return 'https://site.example/wp-content/plugins/bg-voice-logger/';}
function add_action($name,$callback,$priority=10){global $actions;$actions[$name][]=$callback;}
function add_filter($name,$callback,$priority=10,$args=1){}
function add_shortcode($name,$callback){global $shortcodes;$shortcodes[$name]=$callback;}
function wp_parse_args($a,$b){return array_merge($b,$a);}
function get_option($key,$default=array()){return $default;}
function is_singular(){return true;}
function get_post(){return (object)array('post_content'=>'[bg_voice_logger]');}
function has_shortcode($text,$name){return strpos($text,'['.$name.']')!==false;}
function wp_enqueue_style($handle,$url,$deps,$version){global $enqueued;$enqueued[]=['kind'=>'css','handle'=>$handle,'url'=>$url,'deps'=>$deps,'version'=>$version];}
function wp_enqueue_script($handle,$url,$deps,$version,$footer){global $enqueued;$enqueued[]=['kind'=>'js','handle'=>$handle,'url'=>$url,'deps'=>$deps,'version'=>$version,'footer'=>$footer];}
function wp_add_inline_script($handle,$code,$where){global $inline;$inline[]=['handle'=>$handle,'code'=>$code,'where'=>$where];}
function wp_json_encode($x){return json_encode($x);}
function rest_url($s){return 'https://site.example/wp-json/'.$s;}
function admin_url($s){return 'https://site.example/wp-admin/'.$s;}
function home_url($s='/'){return 'https://site.example'.$s;}
function add_query_arg($args,$url){return $url . (strpos($url,'?')!==false?'&':'?').http_build_query($args);}
function is_user_logged_in(){return false;}
function wp_create_nonce($s){return 'nonce';}
function get_current_user_id(){return 0;}
function wp_get_current_user(){return (object)['display_name'=>''];}
function esc_url_raw($s){return $s;}
require dirname(__DIR__).'/bg-voice-logger.php';
function check($cond,$why){if(!$cond)throw new Exception($why);}
$jsfile=dirname(__DIR__).'/assets/app.js';$cssfile=dirname(__DIR__).'/assets/app.css';
check(BVLOG_VERSION==='0.8.2','Version mismatch');
check(bvlog_asset_version('assets/app.js')==='0.8.2-'.substr(hash_file('sha256',$jsfile),0,12),'JS hash mismatch');
check(bvlog_asset_version('assets/app.css')==='0.8.2-'.substr(hash_file('sha256',$cssfile),0,12),'CSS hash mismatch');
check(bvlog_asset_version('assets/does-not-exist')===BVLOG_VERSION,'Missing file should fallback');
check(bvlog_asset_version('../wp-config.php')===BVLOG_VERSION,'Invalid path should fallback');
$source=file_get_contents($jsfile);
$canonical=preg_replace("~const BVLOG_RUNNING_BUILD = '[A-Za-z0-9._-]+';~","const BVLOG_RUNNING_BUILD = '__BUILD_PLACEHOLDER__';",$source,1);
check(bvlog_expected_js_build()==='0.8.2-'.substr(hash('sha256',$canonical),0,12),'Runtime marker differs from canonical JS');
preg_match("~const BVLOG_RUNNING_BUILD = '([^']+)';~",$source,$matches);
check($matches[1]===bvlog_expected_js_build(),'Embedded JS ID mismatch');
check(strpos(bvlog_service_worker_build(),'0.8.2-')===0,'Service-worker cache must track release');
foreach($actions['wp_enqueue_scripts'] as $fn)$fn();
$shortcodes['bg_voice_logger']();
$css=array_values(array_filter($enqueued,fn($x)=>$x['kind']==='css'));
$js=array_values(array_filter($enqueued,fn($x)=>$x['kind']==='js'));
check(count($css)===2&&count($js)===1,'Missing WordPress asset enqueues');
foreach($css as $x)check($x['version']===bvlog_asset_version('assets/app.css'),'CSS enqueue must use content hash');
check($js[0]['version']===bvlog_asset_version('assets/app.js'),'JS enqueue must use content hash');
check($js[0]['deps']===['wp-element'],'React dependency order changed');
check(strpos($inline[0]['code'],bvlog_expected_js_build())!==false,'HTML config missing expected build');
check(strpos($inline[0]['code'],'bvlog_sw=1')!==false,'Missing SW registration URL');
check(strpos($inline[0]['code'],'build=0.8.2-')!==false,'Missing SW content-version URL');
echo "PASS v0.8.2 PHP: hashed assets, fallback, same enqueues, SW version and running build.\n";
