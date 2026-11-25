<?php
// Self-contained synthetic tests: pure projection, scoped transport, encryption,
// freshness guards. No WordPress installation, actual Google account, or network.
define('ABSPATH',__DIR__);
require __DIR__.'/../includes/class-bvlog-read-projection.php';
require __DIR__.'/../includes/class-bvlog-google-read.php';
require __DIR__.'/../includes/class-bvlog-direct-read.php';
function test($ok,$message){if(!$ok)throw new RuntimeException($message);}
function reject($fn,$type,$message){$ok=false;try{$fn();}catch(Throwable $e){$ok=$e instanceof $type;}test($ok,$message);}
function wp_salt($kind){return 'synthetic-key-only-for-test';}
class BVLOG_Auth {public static function mode(){return 'google';}}
class WP_Error {}
function is_wp_error($v){return $v instanceof WP_Error;}
$GLOBALS['transients']=array();$GLOBALS['queue']=array();$GLOBALS['calls']=array();
function get_transient($key){return $GLOBALS['transients'][$key]??false;}
function set_transient($key,$value,$ttl){$GLOBALS['transients'][$key]=$value;return true;}
function delete_transient($key){unset($GLOBALS['transients'][$key]);}
function wp_remote_retrieve_response_code($r){return $r['status'];}
function wp_remote_retrieve_body($r){return $r['body'];}
function wp_remote_retrieve_header($r,$name){return $r['headers'][$name]??'';}
function fake_response($v,$status=200){return array('status'=>$status,'body'=>json_encode($v),'headers'=>array());}
function fake_http($url,$args,$method){
    $GLOBALS['calls'][]=array('url'=>$url,'args'=>$args,'method'=>$method);
    test($args['sslverify']===true&&$args['redirection']===0,'fixed HTTPS transport');
    test(count($GLOBALS['queue'])>0,'unexpected HTTP request');
    return array_shift($GLOBALS['queue']);
}
function wp_safe_remote_get($url,$args){return fake_http($url,$args,'GET');}
function wp_safe_remote_post($url,$args){return fake_http($url,$args,'POST');}
$doc='SYNTHETIC_DOCUMENT_0001';$folder='SYNTHETIC_FOLDER_000001';$template='SYNTHETIC_TEMPLATE_0001';
$p=function($rows=1000,$cols=26){return array('rows'=>$rows,'cols'=>$cols,'type'=>'GRID');};
$sheets=array('LOG'=>$p(),'INFO'=>$p(),'TEAM'=>$p(),'TECH'=>$p(),
    BVLOG_Read_Projection::PHOTO=>$p(),BVLOG_Read_Projection::AUDIO=>$p(),BVLOG_Read_Projection::HISTORY=>$p());
$plan=BVLOG_Read_Projection::plan($sheets,'LOG');
test(count($plan['ranges'])===4&&$plan['ranges']['LOG']==="'LOG'!A2:H1000",'batch LOG and indexes');
$empty=BVLOG_Read_Projection::plan(array(),'LOG');test($empty['ranges']===array(),'missing tab plan');
$large=$sheets;$large['LOG']=$p(20001);
reject(function()use($large){BVLOG_Read_Projection::plan($large,'LOG');},'BVLOG_Read_Unsupported','bounded scan');
$raw=array('spreadsheetId'=>$doc,'valueRanges'=>array());
foreach($plan['ranges'] as $range)$raw['valueRanges'][]=array('range'=>$range,'majorDimension'=>'ROWS','values'=>array(array('1')));
$values=BVLOG_Read_Projection::decode_values($raw,$plan,$doc);
test($values['LOG'][0]===array('1','','','','','','',''),'trailing blanks padded');
$wrong=$raw;$wrong['valueRanges'][0]['range']='OTHER!A2:H1000';
reject(function()use($wrong,$plan,$doc){BVLOG_Read_Projection::decode_values($wrong,$plan,$doc);},'BVLOG_Read_Unsupported','wrong range fails closed');

$logs=array();
for($i=0;$i<130;$i++)$logs[]=array((string)$i,'12:00','Operator','Event '.$i,'Text','','id-'.$i,'');
$logs[129][5]='📷';$logs[129][7]='cancelled';
$photos=array(array('photo-a','id-129','','','','Image','','','',''),array('photo-old','id-0','','','','Old','','','',''));
$audios=array(array('audio-a','id-129','log','','audio/webm','','','','123','','',''),
    array('audio-b','id-1','field','','audio/webm','','','','456','INFO','3','B'));
$history=array();for($i=0;$i<10;$i++)$history[]=array('op-'.$i,'id-129','edit','time','Operator','old','new-'.$i,'');
$data=BVLOG_Read_Projection::project('LOG',$sheets,array('LOG'=>$logs,
    BVLOG_Read_Projection::PHOTO=>$photos,BVLOG_Read_Projection::AUDIO=>$audios,BVLOG_Read_Projection::HISTORY=>$history));
test(count($data['LOG'])===120&&$data['LOG'][0]['row']===12,'last 120 LOG physical rows');
$last=$data['LOG'][119];
test($last['row']===131&&$last['status']==='cancelled'&&$last['audio']['bytes']===123,'audio, original row and status');
test($last['photos']===array(array('id'=>'photo-a','text'=>'Image','url'=>'','managed'=>true)),'managed private media projection');
test(count($last['history'])===8&&$last['history'][0]['after']==='new-2','last eight history records');
test((array)$data['FIELD_AUDIO']===array(),'LOG excludes unrelated field audio');
$team=BVLOG_Read_Projection::project('TEAM',$sheets,array('TEAM'=>array(
    array('','Header','','','','','','',''),array('','Person','Phone','','','','','','row-id'),
    array('','','','','','','','','id-only'))));
test(count($team['TEAM'])===2&&$team['TEAM'][1]['row_key']==='row-id','TEAM row identity and filtering');
$missing=BVLOG_Read_Projection::project('TECH',array(),array());
test($missing['TECH']===array()&&$missing['MISSING_TABS']===array('INFO','LOG','TEAM','TECH'),'missing tabs retained');

$range=BVLOG_Read_Projection::legacy_range($logs);
test($range==="'LOG'!F12:F131",'bounded rich-text range');
$rich=array('spreadsheetId'=>$doc,'sheets'=>array(array('properties'=>array('title'=>'LOG'),'data'=>array(array(
    'startRow'=>11,'startColumn'=>5,'rowData'=>array_fill(0,120,array('values'=>array(array('formattedValue'=>'')))))))));
$rich['sheets'][0]['data'][0]['rowData'][119]['values'][0]['formattedValue']='📷';
BVLOG_Read_Projection::check_legacy($rich,$doc,$logs);
$bad=$rich;$bad['sheets'][0]['data'][0]['rowData'][119]['values'][0]['hyperlink']='https://drive.google.com/example';
reject(function()use($bad,$doc,$logs){BVLOG_Read_Projection::check_legacy($bad,$doc,$logs);},'BVLOG_Read_Unsupported','legacy linked cell delegates');
$bad=$rich;unset($bad['sheets'][0]['data']);
reject(function()use($bad,$doc,$logs){BVLOG_Read_Projection::check_legacy($bad,$doc,$logs);},'BVLOG_Read_Unsupported','missing rich grid fails closed');

$cell=function($s){return array('formattedValue'=>$s,'userEnteredValue'=>array('stringValue'=>$s));};
$rows=array();
$rows[]=array('values'=>array($cell('ДАТА: 25.11.2026')));
$rows[]=array('values'=>array($cell(''),$cell('Колона 1'),$cell('Инфо'),$cell('Коментар / телефон')));
$rows[]=array('values'=>array($cell(''),$cell('Акция'),$cell('Издирване'),$cell('')));
$rows[2]['values'][2]['dataValidation']=array('condition'=>array('type'=>'ONE_OF_LIST','values'=>array(
    array('userEnteredValue'=>'Издирване'),array('userEnteredValue'=>'Наводение'),array('userEnteredValue'=>'Издирване'))));
$rows[]=array('values'=>array($cell(''),$cell('Координатор'),$cell('Operator'),$cell('+359880000001')));
$rows[]=array('values'=>array($cell('ДАТА: 26.11.2026')));
$rows[]=array('values'=>array($cell('Колона 1'),$cell('Инфо'),$cell('Коментар')));
$rows[]=array('values'=>array($cell('Координатор'),$cell('Second'),$cell('Phone')));
$info=array('spreadsheetId'=>$doc,'sheets'=>array(array('properties'=>array('title'=>'INFO'),'data'=>array(array('rowData'=>$rows)))));
$projection=BVLOG_Read_Projection::info($info,$sheets,$doc);
test(count($projection['INFO'])===34&&count($projection['INFO_SECTIONS'])===2,'legacy INFO and two sections');
$section=$projection['INFO_SECTIONS'][0];
test($section['labelCol']===2&&$section['columns'][0]['letter']==='C'&&$section['date']==='ДАТА: 25.11.2026','dynamic INFO column and date');
test($section['rows'][0]['fields'][0]['choices']===array('Издирване','Наводнение'),'actual dropdown and normalization');
$rangeInfo=$info;$rangeInfo['sheets'][0]['data'][0]['rowData'][2]['values'][2]['dataValidation']['condition']['type']='ONE_OF_RANGE';
reject(function()use($rangeInfo,$sheets,$doc){BVLOG_Read_Projection::info($rangeInfo,$sheets,$doc);},'BVLOG_Read_Unsupported','range-backed validation delegates');

$file=array('id'=>$doc,'mimeType'=>'application/vnd.google-apps.spreadsheet','trashed'=>false,'parents'=>array($folder),'version'=>'123','name'=>'Synthetic');
test(BVLOG_Google_Read_Transport::check_metadata($file,$doc,$folder,$template)['version']==='123','authorized Drive metadata');
foreach(array(array('parents'=>array('OTHER')),array('trashed'=>true),array('mimeType'=>'application/octet-stream'),
    array('name'=>'BVLOG_CREATE_PENDING_550e8400-e29b-41d4-a716-446655440000'),array('id'=>$template)) as $patch){
    $x=array_replace($file,$patch);
    reject(function()use($x,$doc,$folder,$template){BVLOG_Google_Read_Transport::check_metadata($x,$doc,$folder,$template);},'BVLOG_Direct_Error','invalid Drive scope');
}
reject(function()use($file,$doc,$folder){BVLOG_Google_Read_Transport::check_metadata($file,$doc,$folder,$doc);},'BVLOG_Direct_Error','template excluded');
try{
    BVLOG_Google_Read_Transport::check_metadata(array_replace($file,array('parents'=>array('OTHER'))),$doc,$folder,$template);
    test(false,'wrong parent denied');
}catch(BVLOG_Direct_Error $e){test($e->status===403&&$e->getMessage()==='scope_denied'&&$e->scope_reason==='parent_mismatch','stable external error and specific admin reason');}
$sealed=BVLOG_Direct_Crypto::seal(array('value'=>'private'),'scope1');
test(BVLOG_Direct_Crypto::open($sealed,'scope1')===array('value'=>'private'),'sealed cache roundtrip');
test(BVLOG_Direct_Crypto::open($sealed,'scope2')===null,'cross-scope cache rejected');
$bad=$sealed;$bad[20]=$bad[20]==='A'?'B':'A';
test(BVLOG_Direct_Crypto::open($bad,'scope1')===null,'tampered encrypted cache rejected');
$state=array('pending'=>false,'generation'=>str_repeat('a',32));
$row=array('kind'=>'cache','generation'=>$state['generation'],'source_version'=>'123','created'=>100,'expires'=>120);
test(BVLOG_Read_Cache::usable($row,$state,'123',119),'warm valid cache');
test(!BVLOG_Read_Cache::usable($row,$state,'123',120)&&!BVLOG_Read_Cache::usable($row,$state,'124',119),'TTL and version invalidation');
test(!BVLOG_Read_Cache::usable($row,array_replace($state,array('pending'=>true)),'123',119),'active writer cache blocked');
test(!BVLOG_Read_Cache::stable($state,array_replace($state,array('generation'=>str_repeat('b',32)))),'old read cannot publish after write');
test(BVLOG_Direct_Read::differences(array('FIELD_AUDIO'=>(object)array(),'LOG'=>array('1')),array('FIELD_AUDIO'=>array(),'LOG'=>array('1')))===array(),'normalized parity');
test(BVLOG_Direct_Read::differences(array('LOG'=>array('1')),array('LOG'=>array(1)))===array('LOG'),'strict comparison');
test(BVLOG_Direct_Read::mode()==='off'&&BVLOG_Direct_Read::document($doc,'LOG')===null,'default GAS route unchanged');
test(!BVLOG_Direct_Read::approved($doc,'LOG'),'explicit per-tab approval required');

$pk=openssl_pkey_new(array('private_key_bits'=>2048,'private_key_type'=>OPENSSL_KEYTYPE_RSA));
test($pk!==false&&openssl_pkey_export($pk,$pem),'synthetic test signing key');
$cfg=array('folder'=>$folder,'template'=>$template,'credential'=>array('email'=>'fixture@fixture.iam.gserviceaccount.com',
    'private_key'=>$pem,'kid'=>'','fingerprint'=>str_repeat('f',64)));
$transport=new BVLOG_Google_Read_Transport($cfg);
$GLOBALS['queue']=array(fake_response(array('access_token'=>'synthetic-token-only','token_type'=>'Bearer','expires_in'=>3600)),fake_response($file),
    fake_response(array('spreadsheetId'=>$doc,'sheets'=>array(array('properties'=>array('title'=>'TECH','sheetType'=>'GRID','gridProperties'=>array('rowCount'=>1000,'columnCount'=>26)))))),
    fake_response(array('spreadsheetId'=>$doc,'valueRanges'=>array(array('range'=>"'TECH'!A2:F151",'majorDimension'=>'ROWS','values'=>array(array('','Equipment'),array('','Radio','1','Working')))))));
$meta=$transport->metadata($doc);$read=$transport->read($doc,'TECH',$meta);
test($read['data']['TECH'][1]['cells'][1]==='Radio','real transport projection with mocked Google HTTP');
test($transport->metrics['token_calls']===1&&$transport->metrics['drive_calls']===1&&$transport->metrics['sheets_calls']===2,'request counts');
$requests=$GLOBALS['calls'];test(count($requests)===4&&$requests[0]['url']==='https://oauth2.googleapis.com/token','fixed token endpoint');
$jwt=explode('.',$requests[0]['args']['body']['assertion']);
$claims=json_decode(base64_decode(strtr($jwt[1],'-_','+/')),true);
test($claims['scope']===BVLOG_Google_Read_Transport::SCOPES&&!isset($claims['sub'])&&$claims['aud']==='https://oauth2.googleapis.com/token','read-only non-delegated credentials');
foreach(array_slice($requests,1) as $r)test($r['method']==='GET'&&$r['args']['headers']['Authorization']==='Bearer synthetic-token-only','only read API calls');
$GLOBALS['queue']=array(fake_response(array(),403));$denied=false;
try{$transport->metadata($doc);}catch(BVLOG_Direct_Error $e){$denied=$e->status===403&&$e->getMessage()==='google_access_denied';}
test($denied,'denied API access is not an unsupported fallback');
echo "PASS direct read projection, scope, cache guards, crypto, strict parity and mocked Google transport\n";
