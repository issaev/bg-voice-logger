<?php
// Synthetic cross-language parser/transport vectors; no WordPress or Sheets writes.
define('ABSPATH', __DIR__);
require __DIR__.'/../includes/class-bvlog-sms.php';
function check_sms($condition,$message){if(!$condition)throw new RuntimeException($message);}
$f=json_decode(file_get_contents(__DIR__.'/fixtures/v083-sms.json'),true);
$parts=array();
foreach(array_reverse($f['parts']) as $wire){
    $p=BVLOG_SMS::parse($wire);
    check_sms(is_array($p),'parse independent fragment');
    check_sms($p['op_id']===$f['entry']['op_id']&&$p['alias']===$f['alias'],'original identity');
    $parts[$p['part']]=$p;
}
ksort($parts);$text=implode('',array_column($parts,'text'));
check_sms($text===$f['entry']['text'],'exact text reconstruction');
$first=$parts[1];$ts=substr($first['meta'],0,6);$source=substr($first['meta'],6,1);$tag=substr($first['meta'],7);
$canonical='DK1|'.$first['alias'].'|'.$first['id'].'|'.$ts.'|'.$source.'|'.$first['count36'].'|'.$text;
$key=base64_decode(strtr($f['key'],'-_','+/'),true);
$expected=rtrim(strtr(base64_encode(substr(hash_hmac('sha256',$canonical,$key,true),0,12)),'+/','-_'),'=');
check_sms(hash_equals($expected,$tag),'JS/PHP HMAC interoperability');
check_sms(BVLOG_SMS::parse('ordinary personal SMS')===null,'non-DKA rejected');
check_sms(BVLOG_SMS::parse(substr_replace($f['parts'][0],'00',33,2))===null,'invalid part rejected');
check_sms(BVLOG_SMS::parse(substr_replace($f['parts'][0],'zz',35,2))===null,'unbounded part count rejected');
$info=array('INFO_SECTIONS'=>array(array('rows'=>array(
  array('label'=>'Координатор','fields'=>array(array('header'=>'Коментар / линк / телефон','value'=>'0888 000 001')))
))));
check_sms(BVLOG_SMS::coordinator($info)==='+359888000001','BG E164 mapping');
$info['INFO_SECTIONS'][0]['rows'][]=$info['INFO_SECTIONS'][0]['rows'][0];
check_sms(BVLOG_SMS::coordinator($info)==='','ambiguous role rejected');
echo "PASS SMS PHP protocol and coordinator vectors\n";
