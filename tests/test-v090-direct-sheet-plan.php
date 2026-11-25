<?php
define('ABSPATH',__DIR__);
require __DIR__.'/../includes/class-bvlog-direct-log-plan.php';
require __DIR__.'/../includes/class-bvlog-read-projection.php';
require __DIR__.'/../includes/class-bvlog-direct-sheet-plan.php';
function check($ok,$msg){if(!$ok)throw new RuntimeException($msg);}
function cell($s){return array('formattedValue'=>$s,'userEnteredValue'=>array('stringValue'=>$s));}
function row($v){return array('values'=>array_map('cell',$v));}
function sh($name,$id,$rows,$cols,$data){
    return array('properties'=>array('title'=>$name,'sheetId'=>$id,'sheetType'=>'GRID',
        'gridProperties'=>array('rowCount'=>$rows,'columnCount'=>$cols)),
        'data'=>array(array('rowData'=>array_map('row',$data))));
}
function fail($fn,$expected){
    try{$fn();}catch(RuntimeException $e){check($e->getMessage()===$expected,$expected.' != '.$e->getMessage());return;}
    throw new RuntimeException('expected '.$expected);
}
$doc='SYNTHETIC_DOCUMENT_0001';
$id='550e8400-e29b-41d4-a716-446655440000';
$rid='550e8400-e29b-41d4-a716-446655440001';
$base=array('doc_id'=>$doc,'op_id'=>$id,'payload_hash'=>str_repeat('a',64),'author'=>'Operator');
$now=new DateTimeImmutable('2026-11-25T12:00:00Z');
$ops=sh('__BVLOG_OPS',44,100,8,array(array('op_id','kind','timestamp','author','result')));
$team=sh('TEAM',12,200,10,array(array(''),array('','','','','','','','','BVLOG_ID'),array('1','Alice','Lead','','','','','',$rid)));
$p=$base+array('kind'=>'field','sheet'=>'TEAM','row'=>3,'col'=>'C','row_key'=>$rid,'base'=>'Lead','value'=>'=1+1');
$raw=array('spreadsheetId'=>$doc,'sheets'=>array($team,$ops));
$s=BVLOG_Direct_Sheet_Plan::decode($raw,$doc,$p);
$a=BVLOG_Direct_Sheet_Plan::build($s,$p,$now);
check(count($a['requests'])===2,'field and atomic receipt');
check($a['requests'][0]['updateCells']['rows'][0]['values'][0]['userEnteredValue']===array('stringValue'=>'=1+1'),'literal not formula');
fail(function()use($s,$p,$now){BVLOG_Direct_Sheet_Plan::build($s,array_replace($p,array('base'=>'old')),$now);},'conflict');
fail(function()use($s,$p,$now){BVLOG_Direct_Sheet_Plan::build($s,array_replace($p,array('row_key'=>'wrong')),$now);},'row_moved');
fail(function()use($s,$p,$now){BVLOG_Direct_Sheet_Plan::build($s,array_replace($p,array('col'=>'I')),$now);},'protected_range');
$bad=$s;$bad['TEAM']['cells'][2][2]['userEnteredValue']=array('formulaValue'=>'=1+1');
fail(function()use($bad,$p,$now){BVLOG_Direct_Sheet_Plan::build($bad,$p,$now);},'protected_range');
$rule=$s;$rule['TEAM']['cells'][2][2]['dataValidation']=array('condition'=>array('type'=>'ONE_OF_LIST','values'=>array(array('userEnteredValue'=>'Lead'))));
fail(function()use($rule,$p,$now){BVLOG_Direct_Sheet_Plan::build($rule,$p,$now);},'validation_choice');
$add=$base+array('kind'=>'add_row','sheet'=>'TEAM','values'=>array('Bob','Member'));
$b=BVLOG_Direct_Sheet_Plan::build($s,$add,$now);
check(count($b['requests'])===2&&$b['requests'][0]['appendCells']['rows'][0]['values'][8]['userEnteredValue']['stringValue']===$id,'row append keeps stable ID');
$log=sh('LOG',1,100,8,array(array('','','','','','','BVLOG_ID','BVLOG_STATUS'),array('','','','ДАТА: 25.11.2026'),array('1','14:00','Alice','Old','Text','',$rid,'')));
$history=sh('__BVLOG_HISTORY',55,100,8,array(array('operation','log_id','action','timestamp','author','before','after','row')));
$edit=$base+array('kind'=>'log_change','log_op_id'=>$rid,'action'=>'edit','expected_text'=>'Old','text'=>'New');
$ls=BVLOG_Direct_Sheet_Plan::decode(array('spreadsheetId'=>$doc,'sheets'=>array($log,$ops,$history)),$doc,$edit);
$e=BVLOG_Direct_Sheet_Plan::build($ls,$edit,$now);
check(count($e['requests'])===3&&$e['requests'][1]['updateCells']['start']['columnIndex']===3,'history + edit + receipt');
$c=BVLOG_Direct_Sheet_Plan::build($ls,array_replace($edit,array('action'=>'cancel')),$now);
check(count($c['requests'])===4&&isset($c['requests'][2]['repeatCell']),'cancel preserves row with history');
$receipt=$e['requests'][2]['appendCells']['rows'][0]['values'];
$done=$ls;$done['__BVLOG_OPS']['cells'][]=array_map(function($x){return cell($x['userEnteredValue']['stringValue']);},$receipt);
check(BVLOG_Direct_Sheet_Plan::receipt($done,$edit)['deduplicated']===true,'same immutable receipt dedup');
fail(function()use($done,$edit){BVLOG_Direct_Sheet_Plan::receipt($done,array_replace($edit,array('payload_hash'=>str_repeat('b',64))));},'write_review');
$info=sh('INFO',2,100,5,array(array(''),array('Колона 1','Инфо','Телефон','Коментар'),array('Координатор','Alice','+359000000000','')));
$ip=$base+array('kind'=>'field','sheet'=>'INFO','row'=>3,'col'=>'C','section'=>0,'field_label'=>'Координатор','header_label'=>'Телефон','base'=>'+359000000000','value'=>'+359111111111');
$is=BVLOG_Direct_Sheet_Plan::decode(array('spreadsheetId'=>$doc,'sheets'=>array($info,$ops)),$doc,$ip);
$i=BVLOG_Direct_Sheet_Plan::build($is,$ip,$now);
check($i['requests'][0]['updateCells']['start']===array('sheetId'=>2,'rowIndex'=>2,'columnIndex'=>2),'semantic INFO row and header');
echo "PASS direct Sheet planner: field, stale base, row identity, protected cells, formula, dropdown, append, history, cancel, dedup, INFO\n";
