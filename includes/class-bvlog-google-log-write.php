<?php
if (!defined('ABSPATH')) { exit; }

/** Explicit write-scoped transport. No Drive file mutation in this first slice. */
// Proven pre-dispatch or structured atomic rejection, not a lost ACK.
final class BVLOG_Write_Rejected extends BVLOG_Direct_Error {}
final class BVLOG_Google_Log_Write_Transport extends BVLOG_Google_Read_Transport {
    const WRITE_SCOPES='https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.metadata.readonly';
    protected function scopes(){return self::WRITE_SCOPES;}
    public function metadata($doc){
        $reason=BVLOG_Direct_Scope::document_reason($doc,$this->cfg['template']);
        if($reason!=='')throw new BVLOG_Direct_Error('scope_denied',403,$reason);
        $file=$this->get('drive','https://www.googleapis.com/drive/v3/files/'.rawurlencode($doc),
            array('fields'=>'id,name,mimeType,trashed,parents,version,capabilities(canEdit)','supportsAllDrives'=>'true'));
        $meta=self::check_metadata($file,$doc,$this->cfg['folder'],$this->cfg['template']);
        if(($file['capabilities']['canEdit']??false)!==true)
            throw new BVLOG_Direct_Error('write_permission',403);
        return $meta;
    }
    public function log_snapshot($doc){
        if(!self::valid_id($doc))throw new BVLOG_Direct_Error('scope_denied',403);
        $raw=$this->get('sheets','https://sheets.googleapis.com/v4/spreadsheets/'.rawurlencode($doc),
            array('fields'=>'spreadsheetId,sheets(properties(sheetId,title,sheetType,gridProperties(rowCount,columnCount)),data(startRow,startColumn,rowData(values(userEnteredValue,formattedValue))))'),
            array("'LOG'","'__BVLOG_OPS'"));
        return BVLOG_Direct_Log_Plan::decode($raw,$doc);
    }
    public function mutation_snapshot($doc,$p){
        if(!self::valid_id($doc))throw new BVLOG_Direct_Error('scope_denied',403);
        $tab=BVLOG_Direct_Sheet_Plan::target($p);
        $ranges=array("'".$tab."'","'__BVLOG_OPS'");
        if(($p['kind']??'')==='log_change')$ranges[]="'__BVLOG_HISTORY'";
        $raw=$this->get('sheets','https://sheets.googleapis.com/v4/spreadsheets/'.rawurlencode($doc),
            array('fields'=>'spreadsheetId,sheets(properties(sheetId,title,sheetType,gridProperties(rowCount,columnCount)),merges,data(startRow,startColumn,rowData(values(userEnteredValue,formattedValue,dataValidation(condition(type,values(userEnteredValue)),strict),hyperlink,textFormatRuns(format(link)),userEnteredFormat(textFormat(link))))))'),$ranges);
        return BVLOG_Direct_Sheet_Plan::decode($raw,$doc,$p);
    }
    /** The caller must have a durable dispatch reservation. Once called,
     * Only proven non-dispatch or a structured atomic rejection is definite.
     * Never retry a dispatched batch here.
     */
    public function append_batch($doc,$requests){
        if(!self::valid_id($doc)||!is_array($requests)||count($requests)<1||count($requests)>5)
            throw new BVLOG_Write_Rejected('write_shape',400);
        foreach($requests as $r)if(!is_array($r)||count($r)!==1||!in_array(array_key_first($r),array('appendCells','updateCells','repeatCell'),true))
            throw new BVLOG_Write_Rejected('write_shape',400);
        $body=BVLOG_Direct_Crypto::json(array('requests'=>$requests,'includeSpreadsheetInResponse'=>false));
        if(strlen($body)>64000)throw new BVLOG_Write_Rejected('write_shape',400);
        try{$token=$this->token();$timeout=$this->budget();}
        catch(BVLOG_Direct_Error $e){throw new BVLOG_Write_Rejected($e->getMessage(),$e->status);}
        $url='https://sheets.googleapis.com/v4/spreadsheets/'.rawurlencode($doc).':batchUpdate';
        $start=microtime(true);$this->metrics['sheets_calls']++;
        try{
            $r=wp_safe_remote_post($url,array('timeout'=>$timeout,'redirection'=>0,'sslverify'=>true,
                'httpversion'=>'1.1','limit_response_size'=>self::MAX_BYTES,
                'headers'=>array('Authorization'=>'Bearer '.$token,'Content-Type'=>'application/json','Accept'=>'application/json'),
                'body'=>$body));
        }finally{$this->metrics['sheets_ms']+=(int)round((microtime(true)-$start)*1000);}
        if(is_wp_error($r))throw new BVLOG_Direct_Error('write_unknown');
        $raw=(string)wp_remote_retrieve_body($r);$this->metrics['response_bytes']+=strlen($raw);
        $status=(int)wp_remote_retrieve_response_code($r);
        if(strlen($raw)>=self::MAX_BYTES)throw new BVLOG_Direct_Error('write_unknown');
        $ack=json_decode($raw,true);
        // Invalid/unauthorized atomic batch requests are rejected as a whole.
        // A transport failure, malformed response or 5xx is NOT proof of rejection.
        $rejections=array(400=>'INVALID_ARGUMENT',401=>'UNAUTHENTICATED',403=>'PERMISSION_DENIED',404=>'NOT_FOUND',429=>'RESOURCE_EXHAUSTED');
        if(isset($rejections[$status])&&is_array($ack)&&
            ($ack['error']['code']??null)===$status&&($ack['error']['status']??'')===$rejections[$status])
            throw new BVLOG_Write_Rejected('write_rejected_'.$status,$status);
        if($status!==200)throw new BVLOG_Direct_Error('write_unknown');
        if(!is_array($ack)||($ack['spreadsheetId']??'')!==$doc||
           !is_array($ack['replies']??null)||count($ack['replies'])!==count($requests))
            throw new BVLOG_Direct_Error('write_unknown');
        return true;
    }
}
