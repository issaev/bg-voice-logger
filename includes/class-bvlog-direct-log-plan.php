<?php
if (!defined('ABSPATH')) { exit; }

/**
 * #50: pure append-only LOG planner for prepared synthetic incidents.
 * Never targets an existing operational row by index. LOG/date and immutable
 * operation receipt are appended in ONE Sheets spreadsheets.batchUpdate.
 * This is not a general compare-and-swap engine for manual Sheets edits.
 */
final class BVLOG_Log_Plan_Error extends RuntimeException {}
final class BVLOG_Direct_Log_Plan {
    const OPS = '__BVLOG_OPS';
    const DATE = 'ДАТА:';
    const MAX_ROWS = 20000;
    const MAX_COLS = 64;
    private static function fail($code){throw new BVLOG_Log_Plan_Error($code);}
    public static function valid_uuid($s){
        return is_string($s)&&preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/D',$s);
    }
    public static function valid_hash($s){return is_string($s)&&preg_match('/^[a-f0-9]{64}$/D',$s);}
    private static function date_string($s){
        if(!is_string($s)||!preg_match('/^(\d{2})\.(\d{2})\.(\d{4})$/D',$s,$m))return false;
        return checkdate((int)$m[2],(int)$m[1],(int)$m[3]);
    }
    private static function text($s,$max){
        if(!is_string($s)||!preg_match('//u',$s)||strlen($s)>$max*4||
           preg_match('/[\x00-\x08\x0b\x0c\x0e-\x1f]/',$s))self::fail('log_input');
        if(preg_match_all('/./us',$s,$unused)>$max)self::fail('log_input');
        return $s;
    }
    public static function payload($p){
        if(!is_array($p)||($p['kind']??'')!=='log'||
           !self::valid_uuid($p['op_id']??null)||!self::valid_hash($p['payload_hash']??null))
            self::fail('log_input');
        $text=self::text($p['text']??null,3000);
        $author=self::text($p['author']??null,80);
        $source=$p['source']??'';
        $transport=$p['transport']??'internet';
        if(trim($text)===''||trim($author)===''||!in_array($source,array('text','voice'),true)||
           !in_array($transport,array('internet','sms'),true))self::fail('log_input');
        $when=$p['event_at']??'';
        if(!is_string($when)||!preg_match('/^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,3})?Z$/D',$when,$m)||
           !checkdate((int)$m[2],(int)$m[3],(int)$m[1]))self::fail('log_input');
        $utc=new DateTimeImmutable($when,new DateTimeZone('UTC'));
        return array('op_id'=>$p['op_id'],'hash'=>$p['payload_hash'],'text'=>$text,'author'=>$author,
            'source'=>$source,'transport'=>$transport,'time'=>$utc);
    }
    /** Strict bounded snapshot; any unexpected schema, formula, or spill is
     * unsupported in this first pilot. Reject instead of initializing sheets.
     */
    public static function decode($raw,$doc){
        if(!is_array($raw)||($raw['spreadsheetId']??'')!==$doc||
           !is_array($raw['sheets']??null)||count($raw['sheets'])!==2)self::fail('write_shape');
        $out=array();$ids=array();
        foreach($raw['sheets'] as $sheet){
            $p=$sheet['properties']??array();$title=$p['title']??'';
            $id=$p['sheetId']??null;$grid=$p['gridProperties']??array();
            $rows=$grid['rowCount']??null;$cols=$grid['columnCount']??null;
            $width=$title==='LOG'?8:5;
            if(!in_array($title,array('LOG',self::OPS),true)||isset($out[$title])||
               !is_int($id)||$id<0||isset($ids[$id])||($p['sheetType']??'')!=='GRID'||
               !is_int($rows)||$rows<2||$rows>self::MAX_ROWS||
               !is_int($cols)||$cols<$width||$cols>self::MAX_COLS)
                self::fail('write_shape');
            $blocks=$sheet['data']??null;
            if(!is_array($blocks)||count($blocks)!==1)self::fail('write_shape');
            $b=$blocks[0];$data=$b['rowData']??null;
            if(($b['startRow']??0)!==0||($b['startColumn']??0)!==0||
               !is_array($data)||count($data)>$rows)self::fail('write_shape');
            $records=array();
            foreach($data as $r){
                $values=$r['values']??array();
                if(!is_array($values)||count($values)>$cols)self::fail('write_shape');
                $row=array_fill(0,$width,'');
                foreach($values as $i=>$c){
                    if(!is_array($c)||!is_int($i)||$i<0)self::fail('write_shape');
                    $u=$c['userEnteredValue']??array();$f=$c['formattedValue']??'';
                    if(!is_array($u)||!is_string($f)||count($u)>1)self::fail('write_shape');
                    if(!$u){if($f!=='')self::fail('write_shape');continue;}
                    if(array_key_exists('stringValue',$u)&&is_string($u['stringValue']))$s=$u['stringValue'];
                    elseif(array_key_exists('numberValue',$u)&&(is_int($u['numberValue'])||is_float($u['numberValue'])))$s=$f!==''?$f:(string)$u['numberValue'];
                    elseif(array_key_exists('boolValue',$u)&&is_bool($u['boolValue']))$s=$f!==''?$f:($u['boolValue']?'TRUE':'FALSE');
                    else self::fail('write_shape'); // formula/error/unknown cell
                    if($i>=$width){if($s!==''||$f!=='')self::fail('write_shape');continue;}
                    $row[$i]=$s;
                }
                $records[]=$row;
            }
            $out[$title]=array('id'=>$id,'rows'=>$records);
            $ids[$id]=true;
        }
        if(!isset($out['LOG'],$out[self::OPS])||
           ($out['LOG']['rows'][0][6]??'')!=='BVLOG_ID'||
           ($out['LOG']['rows'][0][7]??'')!=='BVLOG_STATUS'||
           ($out[self::OPS]['rows'][0]??null)!==array('op_id','kind','timestamp','author','result'))
            self::fail('write_headers');
        return $out;
    }
    /** A matching immutable receipt is authoritative, including when a
     * confirmed LOG row was manually removed. A row without one is REVIEW.
     */
    public static function receipt($snap,$op,$hash){
        $matches=array();$rows=array();
        foreach(array_slice($snap[self::OPS]['rows'],1) as $r){
            if(strtolower($r[0])===$op)$matches[]=$r;
        }
        foreach(array_slice($snap['LOG']['rows'],2) as $i=>$r){
            if(strtolower($r[6])===$op)$rows[]=$i+3;
        }
        if(count($matches)>1||count($rows)>1)self::fail('write_review');
        if(!$matches){if($rows)self::fail('write_review');return null;}
        $r=$matches[0];$stored=json_decode($r[4],true);
        if($r[1]!=='log'||!is_array($stored)||($stored['ok']??null)!==true||
           !self::valid_hash($stored['payload_hash']??null)||!hash_equals($hash,$stored['payload_hash']))
            self::fail('write_review');
        $ack=array('ok'=>true,'deduplicated'=>true);
        if($rows)$ack['row']=$rows[0];
        if(self::date_string($stored['date']??null))$ack['date']=$stored['date'];
        return $ack;
    }
    private static function cell($v){
        return array('userEnteredValue'=>is_int($v)?array('numberValue'=>$v):array('stringValue'=>$v));
    }
    private static function append($id,$values,$fields='userEnteredValue'){
        return array('appendCells'=>array('sheetId'=>$id,'rows'=>array(array('values'=>$values)),'fields'=>$fields));
    }
    public static function build($snap,$p,$now){
        $p=self::payload($p);
        $existing=self::receipt($snap,$p['op_id'],$p['hash']);
        if($existing!==null)return array('ack'=>$existing,'requests'=>array());
        if(!$now instanceof DateTimeImmutable)self::fail('log_input');
        $tz=new DateTimeZone('Europe/Sofia');$local=$p['time']->setTimezone($tz);
        $date=$local->format('d.m.Y');$last='';$serial=0;
        $records=$snap['LOG']['rows'];
        // Only a prepared LOG with a real first date is supported.
        $first=trim($records[1][3]??'');
        if(strpos($first,self::DATE)!==0||!self::date_string(trim(substr($first,strlen(self::DATE)))))
            self::fail('write_headers');
        foreach(array_slice($records,1) as $i=>$r){
            $d=trim($r[3]);
            if(strpos($d,self::DATE)===0){
                $last=trim(substr($d,strlen(self::DATE)));
                if(!self::date_string($last))self::fail('write_shape');
                continue;
            }
            $occupied=false;
            foreach(array_slice($r,1,5) as $v)if(trim($v)!==''){$occupied=true;break;}
            if($i>0&&$occupied)$serial++;
        }
        $log=$snap['LOG']['id'];$requests=array();
        if($date!==$last){
            $divider=array();
            $border=array('style'=>'SOLID_MEDIUM','color'=>array('red'=>0.145,'green'=>0.388,'blue'=>0.922));
            for($i=0;$i<6;$i++){
                $c=self::cell($i===3?self::DATE.' '.$date:'');
                $c['userEnteredFormat']=array('backgroundColor'=>array('red'=>0.878,'green'=>0.949,'blue'=>0.996),
                    'textFormat'=>array('bold'=>true),'borders'=>array('top'=>$border,'bottom'=>$border));
                $divider[]=$c;
            }
            $requests[]=self::append($log,$divider,'userEnteredValue,userEnteredFormat.backgroundColor,userEnteredFormat.textFormat.bold,userEnteredFormat.borders.top,userEnteredFormat.borders.bottom');
        }
        $channel=$p['transport']==='sms'?'SMS през приложението':
            ($p['source']==='text'?'През приложението':'Глас през приложението');
        // Explicit stringValue, never USER_ENTERED/formulaValue, including =/+/@.
        $requests[]=self::append($log,array_map(array(__CLASS__,'cell'),array(
            $serial+1,$local->format('H:i'),$p['author'],$p['text'],$channel,'',$p['op_id'],'')));
        // The API does not return the final row index for appendCells. Do not
        // guess one from a snapshot; later reads locate the stable LOG UUID.
        $ack=array('ok'=>true,'date'=>$date,'late'=>$last!==''&&$date!==$last&&
            $local->format('Y-m-d')<$now->setTimezone($tz)->format('Y-m-d'));
        $receipt=$ack+array('payload_hash'=>$p['hash'],'source'=>$p['source'],
            'transport'=>$p['transport'],'write_backend'=>'direct_log_v1');
        $json=json_encode($receipt,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
        if(!is_string($json)||strlen($json)>1000)self::fail('write_shape');
        $requests[]=self::append($snap[self::OPS]['id'],array_map(array(__CLASS__,'cell'),array(
            $p['op_id'],'log',$now->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s\Z'),$p['author'],$json)));
        return array('ack'=>$ack,'requests'=>$requests);
    }
}
