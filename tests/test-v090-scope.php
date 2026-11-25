<?php
// Pure metadata tests: no real identifiers, Google network, or WordPress runtime.
define('ABSPATH',__DIR__);
require __DIR__.'/../includes/class-bvlog-direct-scope.php';
$doc='SYNTHETIC_DOCUMENT_0001';$folder='SYNTHETIC_FOLDER_000001';$template='SYNTHETIC_TEMPLATE_0001';
$file=array('id'=>$doc,'mimeType'=>'application/vnd.google-apps.spreadsheet','trashed'=>false,'parents'=>array($folder),'name'=>'Synthetic');
function expect_reason($expected,$actual){
    if($expected!==$actual)throw new RuntimeException('Expected '.$expected.', got '.$actual);
}
expect_reason('',BVLOG_Direct_Scope::metadata_reason($file,$doc,$folder,$template));
expect_reason('invalid_document_id',BVLOG_Direct_Scope::document_reason('bad',$template));
expect_reason('template_document',BVLOG_Direct_Scope::document_reason($template,$template));
expect_reason('metadata_missing',BVLOG_Direct_Scope::metadata_reason(null,$doc,$folder,$template));
foreach(array(
    array('id_mismatch',array('id'=>$template)),
    array('not_spreadsheet',array('mimeType'=>'application/vnd.google-apps.shortcut')),
    array('trash_state_missing',array('trashed'=>null)),
    array('trash_state_missing',array('trashed'=>'false')),
    array('trashed',array('trashed'=>true)),
    array('parents_missing',array('parents'=>null)),
    array('parents_missing',array('parents'=>array())),
    array('parent_mismatch',array('parents'=>array('SYNTHETIC_NESTED_FOLDER'))),
    array('name_missing',array('name'=>null)),
    array('pending_create',array('name'=>'BVLOG_CREATE_PENDING_550e8400-e29b-41d4-a716-446655440000'))
) as $case){
    expect_reason($case[0],BVLOG_Direct_Scope::metadata_reason(array_replace($file,$case[1]),$doc,$folder,$template));
}
echo "PASS 14 fail-closed Drive metadata scope checks\n";
