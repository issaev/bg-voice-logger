<?php
if (!defined('ABSPATH')) { exit; }

/** Strict staging-only direct field, row and LOG change planner.
 * The document must be exclusively edited via this writer during the pilot.
 * Google Sheets REST has no general cell CAS against independent UI writers.
 */
final class BVLOG_Sheet_Conflict extends RuntimeException {
    public $current,$row;
    public function __construct($code,$current=null,$row=null){parent::__construct($code);$this->current=$current;$this->row=$row;}
}
final class BVLOG_Direct_Sheet_Plan {
    const OPS='__BVLOG_OPS';
    const HISTORY='__BVLOG_HISTORY';
    private static function fail($code='write_shape'){throw new BVLOG_Log_Plan_Error($code);}
    public static function target($p){
        $kind=$p['kind']??'';
        if($kind==='log_change')return 'LOG';
        $tab=$p['sheet']??'';
        if($kind==='field'&&in_array($tab,array('INFO','TEAM','TECH'),true))return $tab;
        if($kind==='add_row'&&in_array($tab,array('TEAM','TECH'),true))return $tab;
        self::fail('write_unsupported');
    }
    public static function payload($p){
        self::target($p);
        if(!BVLOG_Direct_Log_Plan::valid_uuid($p['op_id']??null)||
            !BVLOG_Direct_Log_Plan::valid_hash($p['payload_hash']??null))self::fail('log_input');
        self::text($p['author']??null,80);
        return array('op_id'=>$p['op_id'],'hash'=>$p['payload_hash']);
    }
    private static function text($s,$max=3000){
        if(!is_string($s)||!preg_match('//u',$s)||strlen($s)>4*$max||
            preg_match('/[\x00-\x08\x0b\x0c\x0e-\x1f]/',$s)||preg_match_all('/./us',$s,$unused)>$max)
            self::fail('log_input');
        return $s;
    }
    private static function norm($s){
        if(!function_exists('mb_strtolower'))self::fail();
        return mb_strtolower(trim(preg_replace('/\s+/u',' ',$s)),'UTF-8');
    }
    private static function col($s){
        if(!is_string($s)||!preg_match('/^[A-Z]{1,2}$/D',$s))self::fail('protected_range');
        $n=0;foreach(str_split($s) as $ch)$n=$n*26+ord($ch)-64;
        return $n-1;
    }
    private static function str($cell){
        $v=$cell['formattedValue']??'';
        if(!is_string($v))self::fail();
        return $v;
    }
    private static function cell($value){
        return array('userEnteredValue'=>is_int($value)?array('numberValue'=>$value):array('stringValue'=>$value));
    }
    private static function append($id,$values){
        return array('appendCells'=>array('sheetId'=>$id,
            'rows'=>array(array('values'=>array_map(array(__CLASS__,'cell'),$values))),
            'fields'=>'userEnteredValue'));
    }
    private static function set($id,$r,$c,$cell,$fields='userEnteredValue'){
        return array('updateCells'=>array('start'=>array('sheetId'=>$id,'rowIndex'=>$r,'columnIndex'=>$c),
            'rows'=>array(array('values'=>array($cell))),'fields'=>$fields));
    }
    private static function values($s,$r,$width){
        $v=array();for($c=0;$c<$width;$c++)$v[]=self::str($s['cells'][$r][$c]??array());return $v;
    }
    public static function decode($raw,$doc,$p){
        $tab=self::target($p);$needed=array($tab,self::OPS);
        if(($p['kind']??'')==='log_change')$needed[]=self::HISTORY;
        if(($raw['spreadsheetId']??'')!==$doc||!is_array($raw['sheets']??null)||
            count($raw['sheets'])!==count($needed))self::fail();
        $out=array();$ids=array();
        foreach($raw['sheets'] as $sh){
            $props=$sh['properties']??array();$name=$props['title']??'';$id=$props['sheetId']??null;
            $rows=$props['gridProperties']['rowCount']??null;$cols=$props['gridProperties']['columnCount']??null;
            $width=array('LOG'=>8,'TEAM'=>9,'TECH'=>6,'INFO'=>4,self::OPS=>5,self::HISTORY=>8)[$name]??0;
            if(!in_array($name,$needed,true)||isset($out[$name])||!is_int($id)||$id<0||isset($ids[$id])||
                ($props['sheetType']??'')!=='GRID'||!is_int($rows)||$rows<2||$rows>20000||
                !is_int($cols)||$cols<$width||$cols>64||$rows*$cols>300000)self::fail();
            $data=$sh['data']??array();if(count($data)!==1)self::fail();
            $b=$data[0];$records=$b['rowData']??array();
            if(($b['startRow']??0)!==0||($b['startColumn']??0)!==0||!is_array($records)||count($records)>$rows)self::fail();
            $cells=array();
            foreach($records as $r=>$record){
                $cs=$record['values']??array();
                if(!is_array($cs)||count($cs)>$cols)self::fail();
                foreach($cs as $c=>$cell){
                    if(!is_array($cell))self::fail();
                    self::str($cell);
                    // Technical indexes must be literal, including immutable receipts.
                    if(in_array($name,array(self::OPS,self::HISTORY),true)&&
                        isset($cell['userEnteredValue']['formulaValue']))self::fail();
                }
                $cells[]=$cs;
            }
            $ids[$id]=true;$out[$name]=array('id'=>$id,'cells'=>$cells,'rows'=>$rows,'cols'=>$cols,
                'merges'=>$sh['merges']??array(),'raw'=>$sh);
        }
        if(self::values($out[self::OPS],0,5)!==array('op_id','kind','timestamp','author','result'))self::fail('write_headers');
        if($tab==='LOG'&&(self::str($out[$tab]['cells'][0][6]??array())!=='BVLOG_ID'||
            self::str($out[$tab]['cells'][0][7]??array())!=='BVLOG_STATUS'))self::fail('write_headers');
        if(in_array($tab,array('TEAM','TECH'),true)&&
            self::str($out[$tab]['cells'][1][$tab==='TEAM'?8:5]??array())!=='BVLOG_ID')self::fail('write_headers');
        if(isset($out[self::HISTORY])&&self::values($out[self::HISTORY],0,8)!==
            array('operation','log_id','action','timestamp','author','before','after','row'))self::fail('write_headers');
        return $out;
    }
    public static function receipt($snap,$p){
        $id=$p['op_id'];$hash=$p['payload_hash'];$kind=$p['kind'];$hits=array();
        foreach($snap[self::OPS]['cells'] as $r=>$unused){
            if($r>0){$v=self::values($snap[self::OPS],$r,5);if(strtolower($v[0])===$id)$hits[]=$v;}
        }
        if(count($hits)>1)self::fail('write_review');
        if(!$hits){
            $tab=self::target($p);
            // An ID-bearing row or history entry without its immutable receipt
            // is not safe to replay (including legacy GAS partial commits).
            if($kind==='add_row')foreach($snap[$tab]['cells'] as $r=>$unused){
                if($r>=2&&strtolower(self::str($snap[$tab]['cells'][$r][$tab==='TEAM'?8:5]??array()))===$id)self::fail('write_review');
            }
            if($kind==='log_change')foreach($snap[self::HISTORY]['cells'] as $r=>$unused){
                if($r>0&&strtolower(self::str($snap[self::HISTORY]['cells'][$r][0]??array()))===$id)self::fail('write_review');
            }
            return null;
        }
        $v=$hits[0];$stored=json_decode($v[4],true);
        if($v[1]!==$kind||!is_array($stored)||($stored['ok']??null)!==true||
            !BVLOG_Direct_Log_Plan::valid_hash($stored['payload_hash']??null)||!hash_equals($hash,$stored['payload_hash']))self::fail('write_review');
        return array('ok'=>true,'deduplicated'=>true);
    }
    /** Reject formula, rich link, merge, or unsupported validation on target.
     * Never rewrite validation, formatting, or unrelated cells.
     */
    private static function writable($s,$r,$c,$value){
        if($r<0||$r>=$s['rows']||$c<0||$c>=$s['cols'])self::fail('protected_range');
        $cell=$s['cells'][$r][$c]??array();
        if(isset($cell['userEnteredValue']['formulaValue'])||!empty($cell['hyperlink'])||
            !empty($cell['textFormatRuns'])||isset($cell['userEnteredFormat']['textFormat']['link']))self::fail('protected_range');
        foreach($s['merges'] as $m)if($r>=($m['startRowIndex']??0)&&$r<($m['endRowIndex']??$s['rows'])&&
            $c>=($m['startColumnIndex']??0)&&$c<($m['endColumnIndex']??$s['cols'])&&
            ($r!==($m['startRowIndex']??0)||$c!==($m['startColumnIndex']??0)))self::fail('protected_range');
        $rule=$cell['dataValidation']['condition']??null;
        if($rule!==null){
            if(($rule['type']??'')!=='ONE_OF_LIST')self::fail('validation_type');
            $allowed=array();foreach(($rule['values']??array()) as $v)if(is_string($v['userEnteredValue']??null))$allowed[]=$v['userEnteredValue'];
            if(!in_array($value,$allowed,true))self::fail('validation_choice');
        }
    }
    private static function info_target($s,$doc,$p){
        $schema=BVLOG_Read_Projection::info(array('spreadsheetId'=>$doc,'sheets'=>array($s['raw'])),
            array('INFO'=>array('rows'=>$s['rows'],'cols'=>$s['cols'],'type'=>'GRID')),$doc);
        $section=$schema['INFO_SECTIONS'][$p['section']??0]??null;
        $label=trim($p['field_label']??'');$header=trim($p['header_label']??'');
        // Old clients lacking the semantic INFO identity must refresh.
        if(!$section||$label===''||$header==='')throw new BVLOG_Sheet_Conflict('row_moved');
        $matches=array_values(array_filter($section['rows'],function($r)use($label){return self::norm($r['label'])===self::norm($label);}));
        if(count($matches)!==1)throw new BVLOG_Sheet_Conflict('row_moved');
        $record=$matches[0];$fields=array_values(array_filter($record['fields'],function($f)use($header){return self::norm($f['header'])===self::norm($header);}));
        if(count($fields)!==1)throw new BVLOG_Sheet_Conflict('row_moved');
        return array($record['row']-1,self::col($fields[0]['col']));
    }
    private static function field($snap,$p,$doc){
        $tab=self::target($p);$s=$snap[$tab];$value=self::text($p['value']??null);
        $base=self::text($p['force_base']??($p['base']??null));$r=($p['row']??0)-1;$c=self::col($p['col']??'');
        if($tab==='INFO'){list($r,$c)=self::info_target($s,$doc,$p);}
        else{
            $width=$tab==='TEAM'?9:6;$last=$width-1;
            if($r<2||$r>=min($s['rows'],5000)||$c<1||$c>=$last)self::fail('protected_range');
            $v=self::values($s,$r,$width);$key=$v[$last]!==''?$v[$last]:'m:'.$v[1].'|'.$v[$tab==='TEAM'?2:3];
            if(($p['row_key']??'')===''||$key!==$p['row_key'])throw new BVLOG_Sheet_Conflict('row_moved',self::str($s['cells'][$r][$c]??array()),$r+1);
            $hits=0;foreach($s['cells'] as $i=>$unused)if($i>=2){$w=self::values($s,$i,$width);
                $k=$w[$last]!==''?$w[$last]:'m:'.$w[1].'|'.$w[$tab==='TEAM'?2:3];
                if($k===$key)$hits++;}
            if($hits!==1)throw new BVLOG_Sheet_Conflict('row_moved');
        }
        $current=self::str($s['cells'][$r][$c]??array());
        self::writable($s,$r,$c,$value);
        if($current!==$base&&$current!==$value)throw new BVLOG_Sheet_Conflict('conflict',$current,$r+1);
        return array('ack'=>array('ok'=>true,'row'=>$r+1,'unchanged'=>$current===$value),
            'requests'=>$current===$value?array():array(self::set($s['id'],$r,$c,self::cell($value))));
    }
    private static function add($snap,$p){
        $tab=self::target($p);$s=$snap[$tab];$n=$tab==='TEAM'?7:4;
        $values=$p['values']??null;if(!is_array($values)||count($values)>$n)self::fail('log_input');
        $values=array_pad(array_values($values),$n,'');
        foreach($values as $v)self::text($v);
        if(!array_filter($values,function($v){return trim($v)!=='';}))self::fail('log_input');
        $last=1;
        foreach($s['cells'] as $i=>$row){
            foreach($row as $j=>$cell)if(!empty($cell['userEnteredValue'])||self::str($cell)!==''){
                if($i>=2&&$j>$n+1)self::fail('write_shape');
                if($i>=2)$last=max($last,$i);
            }
        }
        $r=$last+1;if($r>=$s['rows'])self::fail('write_shape');
        // Append only into an explicitly prepared blank, unmerged row.
        for($i=0;$i<$n+2;$i++)self::writable($s,$r,$i,(string)($i===0?$r-1:($i===$n+1?$p['op_id']:$values[$i-1])));
        return array('ack'=>array('ok'=>true),'requests'=>array(self::append($s['id'],array_merge(array($r-1),$values,array($p['op_id'])))));
    }
    private static function log_change($snap,$p,$now){
        $s=$snap['LOG'];$id=$p['log_op_id']??'';$action=$p['action']??'';
        if(!BVLOG_Direct_Log_Plan::valid_uuid($id)||!in_array($action,array('edit','cancel'),true))self::fail('write_unsupported');
        $matches=array();
        foreach($s['cells'] as $r=>$unused)if($r>=2&&self::str($s['cells'][$r][6]??array())===$id)$matches[]=$r;
        if(count($matches)!==1)throw new BVLOG_Sheet_Conflict('row_moved');
        $r=$matches[0];$v=self::values($s,$r,8);$before=$v[3];
        if($before===''||strpos($before,BVLOG_Direct_Log_Plan::DATE)===0||$v[7]==='cancelled')self::fail('protected_range');
        $base=self::text($p['force_base']??($p['expected_text']??null));
        if($before!==$base)throw new BVLOG_Sheet_Conflict('conflict',$before,$r+1);
        $after=$action==='edit'?self::text($p['text']??null):$before;
        if(trim($after)==='')self::fail('log_input');
        $ack=array('ok'=>true,'row'=>$r+1,'log_op_id'=>$id,'action'=>$action);
        if($action==='edit'&&$before===$after)return array('ack'=>$ack+array('unchanged'=>true),'requests'=>array());
        $stamp=$now->format('Y-m-d\TH:i:s\Z');
        $requests=array(self::append($snap[self::HISTORY]['id'],array($p['op_id'],$id,$action,$stamp,$p['author'],$before,$after,$r+1)));
        if($action==='edit'){
            self::writable($s,$r,3,$after);
            $requests[]=self::set($s['id'],$r,3,self::cell($after));
        }else{
            self::writable($s,$r,7,'cancelled');
            $requests[]=self::set($s['id'],$r,7,self::cell('cancelled'));
            $requests[]=array('repeatCell'=>array('range'=>array('sheetId'=>$s['id'],'startRowIndex'=>$r,'endRowIndex'=>$r+1,
                'startColumnIndex'=>0,'endColumnIndex'=>6),'cell'=>array('userEnteredFormat'=>array('textFormat'=>array('strikethrough'=>true),
                    'backgroundColor'=>array('red'=>0.945,'green'=>0.945,'blue'=>0.945))),
                'fields'=>'userEnteredFormat.textFormat.strikethrough,userEnteredFormat.backgroundColor'));
        }
        return array('ack'=>$ack,'requests'=>$requests);
    }
    public static function build($snap,$p,$now){
        self::payload($p);$old=self::receipt($snap,$p);
        if($old!==null)return array('ack'=>$old,'requests'=>array());
        $kind=$p['kind'];
        if($kind==='field')$plan=self::field($snap,$p,$p['doc_id']);
        elseif($kind==='add_row')$plan=self::add($snap,$p);
        else $plan=self::log_change($snap,$p,$now);
        $receipt=$plan['ack']+array('payload_hash'=>$p['payload_hash'],'write_backend'=>'direct_sheet_v1');
        $json=json_encode($receipt,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
        if(!is_string($json)||strlen($json)>1000)self::fail();
        $plan['requests'][]=self::append($snap[self::OPS]['id'],array($p['op_id'],$kind,
            $now->format('Y-m-d\TH:i:s\Z'),$p['author'],$json));
        return $plan;
    }
}
