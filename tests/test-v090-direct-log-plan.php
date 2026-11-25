<?php
define('ABSPATH',__DIR__);
require __DIR__.'/../includes/class-bvlog-direct-log-plan.php';
function check($v,$m){if(!$v)throw new RuntimeException($m);}
function rejects($fn,$code){try{$fn();}catch(BVLOG_Log_Plan_Error $e){check($e->getMessage()===$code,$code);return;}throw new RuntimeException('Expected '.$code);}
function row($values){return array('values'=>array_map(function($v){return array('userEnteredValue'=>is_int($v)?array('numberValue'=>$v):array('stringValue'=>$v),'formattedValue'=>(string)$v);},$values));}
function sheet($title,$id,$rows){return array('properties'=>array('title'=>$title,'sheetId'=>$id,'sheetType'=>'GRID','gridProperties'=>array('rowCount'=>1000,'columnCount'=>12)),'data'=>array(array('rowData'=>array_map('row',$rows))));}
$doc='SYNTHETIC_DOCUMENT_0001';$op='550e8400-e29b-41d4-a716-446655440000';$hash=str_repeat('a',64);
$now=new DateTimeImmutable('2026-11-25T12:00:00Z');
$p=array('kind'=>'log','op_id'=>$op,'payload_hash'=>$hash,'author'=>'Operator','text'=>'=1+1 Тест 🚑','event_at'=>'2026-11-25T10:00:00.123Z','source'=>'voice');
$raw=array('spreadsheetId'=>$doc,'sheets'=>array(
    sheet('LOG',0,array(array('№','Time','Author','Event','Channel','Media','BVLOG_ID','BVLOG_STATUS'),array('','','','ДАТА: 25.11.2026'),array(1,'10:00','Manual','Existing','Radio'))),
    sheet('__BVLOG_OPS',44,array(array('op_id','kind','timestamp','author','result')))));
$s=BVLOG_Direct_Log_Plan::decode($raw,$doc);
$a=BVLOG_Direct_Log_Plan::build($s,$p,$now);
check(count($a['requests'])===2&&$a['ack']['ok']&&!isset($a['ack']['row']),'append + receipt; no guessed row');
$l=$a['requests'][0]['appendCells'];$v=$l['rows'][0]['values'];
check($l['sheetId']===0&&$v[0]['userEnteredValue']['numberValue']===2&&$v[1]['userEnteredValue']['stringValue']==='12:00','serial and Sofia time');
check($v[3]['userEnteredValue']===array('stringValue'=>$p['text']),'literal Unicode and formula-like text');
check($v[4]['userEnteredValue']['stringValue']==='Глас през приложението','voice channel');
$ops=$a['requests'][1]['appendCells'];$receipt=json_decode($ops['rows'][0]['values'][4]['userEnteredValue']['stringValue'],true);
check($ops['sheetId']===44&&$receipt['payload_hash']===$hash,'immutable receipt in same batch');
$sms=array_replace($p,array('transport'=>'sms','event_at'=>'2026-11-24T23:30:00Z'));
$b=BVLOG_Direct_Log_Plan::build($s,$sms,$now);
check(count($b['requests'])===2&&$b['requests'][0]['appendCells']['rows'][0]['values'][4]['userEnteredValue']['stringValue']==='SMS през приложението','SMS channel and local date');
$old=array_replace($sms,array('event_at'=>'2026-11-24T10:00:00Z'));
$c=BVLOG_Direct_Log_Plan::build($s,$old,$now);
check(count($c['requests'])===3&&$c['ack']['late']&&$c['requests'][0]['appendCells']['rows'][0]['values'][3]['userEnteredValue']['stringValue']==='ДАТА: 24.11.2026','late divider append, not reorder');
$s['__BVLOG_OPS']['rows'][]=array($op,'log','','',json_encode($receipt));
$d=BVLOG_Direct_Log_Plan::build($s,$p,$now);
check($d['ack']['deduplicated']&&$d['requests']===array(),'receipt-only retry must never restore deleted row');
$s['LOG']['rows'][]=array('2','12:00','Operator','Edited manually','','',$op,'');
$d=BVLOG_Direct_Log_Plan::build($s,$p,$now);
check($d['ack']['row']===4&&!$d['requests'],'edited row preserved, dedup by original hash');
rejects(function()use($s,$p,$now){BVLOG_Direct_Log_Plan::build($s,array_replace($p,array('payload_hash'=>str_repeat('b',64))),$now);},'write_review');
$legacy=$s;array_pop($legacy['__BVLOG_OPS']['rows']);
rejects(function()use($legacy,$p,$now){BVLOG_Direct_Log_Plan::build($legacy,$p,$now);},'write_review');
$dup=$s;$dup['__BVLOG_OPS']['rows'][]=$dup['__BVLOG_OPS']['rows'][1];
rejects(function()use($dup,$p,$now){BVLOG_Direct_Log_Plan::build($dup,$p,$now);},'write_review');
$bad=$raw;$bad['sheets'][0]['data'][0]['rowData'][0]['values'][6]['userEnteredValue']['stringValue']='Manual';
rejects(function()use($bad,$doc){BVLOG_Direct_Log_Plan::decode($bad,$doc);},'write_headers');
$bad=$raw;$bad['sheets'][0]['data'][0]['rowData'][2]['values'][3]['userEnteredValue']=array('formulaValue'=>'=A1');
rejects(function()use($bad,$doc){BVLOG_Direct_Log_Plan::decode($bad,$doc);},'write_shape');
$bad=$raw;$bad['sheets'][0]['data'][0]['rowData'][2]['values'][9]=array('userEnteredValue'=>array('stringValue'=>'Manual outside LOG'));
rejects(function()use($bad,$doc){BVLOG_Direct_Log_Plan::decode($bad,$doc);},'write_shape');
$bad=$raw;$bad['spreadsheetId']='WRONG';
rejects(function()use($bad,$doc){BVLOG_Direct_Log_Plan::decode($bad,$doc);},'write_shape');
rejects(function()use($p){BVLOG_Direct_Log_Plan::payload(array_replace($p,array('event_at'=>'2026-02-30T10:00:00Z')));},'log_input');
echo "PASS direct LOG planner: append, date, receipt, Unicode, dedup, scope and strict layout\n";
