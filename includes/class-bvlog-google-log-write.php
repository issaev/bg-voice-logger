<?php
if (!defined('ABSPATH')) { exit; }

/** Explicit write-scoped transport. No Drive file mutation in this first slice. */
final class BVLOG_Google_Log_Write_Transport extends BVLOG_Google_Read_Transport {
    const WRITE_SCOPES='https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.metadata.readonly';
    protected function scopes(){return self::WRITE_SCOPES;}
    public function log_snapshot($doc){
        if(!self::valid_id($doc))throw new BVLOG_Direct_Error('scope_denied',403);
        $raw=$this->get('sheets','https://sheets.googleapis.com/v4/spreadsheets/'.rawurlencode($doc),
            array('fields'=>'spreadsheetId,sheets(properties(sheetId,title,sheetType,gridProperties(rowCount,columnCount)),data(startRow,startColumn,rowData(values(userEnteredValue,formattedValue))))'),
            array("'LOG'","'__BVLOG_OPS'"));
        return BVLOG_Direct_Log_Plan::decode($raw,$doc);
    }
    /** The caller must have a durable dispatch reservation. Once called,
     * ANY exception is treated as an uncertain commit. Never retry here.
     */
    public function append_batch($doc,$requests){
        if(!self::valid_id($doc)||!is_array($requests)||count($requests)<2||count($requests)>3)
            throw new BVLOG_Direct_Error('write_shape');
        foreach($requests as $r)if(!is_array($r)||array_keys($r)!==array('appendCells'))
            throw new BVLOG_Direct_Error('write_shape');
        $body=BVLOG_Direct_Crypto::json(array('requests'=>$requests,'includeSpreadsheetInResponse'=>false));
        if(strlen($body)>64000)throw new BVLOG_Direct_Error('write_shape');
        $token=$this->token();
        $url='https://sheets.googleapis.com/v4/spreadsheets/'.rawurlencode($doc).':batchUpdate';
        $start=microtime(true);$this->metrics['sheets_calls']++;
        try{
            $r=wp_safe_remote_post($url,array('timeout'=>$this->budget(),'redirection'=>0,'sslverify'=>true,
                'httpversion'=>'1.1','limit_response_size'=>self::MAX_BYTES,
                'headers'=>array('Authorization'=>'Bearer '.$token,'Content-Type'=>'application/json','Accept'=>'application/json'),
                'body'=>$body));
        }finally{$this->metrics['sheets_ms']+=(int)round((microtime(true)-$start)*1000);}
        if(is_wp_error($r))throw new BVLOG_Direct_Error('write_unknown');
        $raw=(string)wp_remote_retrieve_body($r);$this->metrics['response_bytes']+=strlen($raw);
        if((int)wp_remote_retrieve_response_code($r)!==200||strlen($raw)>=self::MAX_BYTES)
            throw new BVLOG_Direct_Error('write_unknown');
        $ack=json_decode($raw,true);
        if(!is_array($ack)||($ack['spreadsheetId']??'')!==$doc||
           !is_array($ack['replies']??null)||count($ack['replies'])!==count($requests))
            throw new BVLOG_Direct_Error('write_unknown');
        return true;
    }
}
