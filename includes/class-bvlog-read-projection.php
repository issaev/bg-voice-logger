<?php
if (!defined('ABSPATH')) { exit; }

/** Pure read projection for the v0.8.3 selected-tab REST contract.
 * Unsupported or oversized shapes must use the existing GAS reader; never
 * silently drop fields, links, indexes or validation choices.
 */
final class BVLOG_Read_Unsupported extends RuntimeException {}
final class BVLOG_Read_Projection {
    const TABS = array('INFO','LOG','TEAM','TECH');
    const PHOTO = '__BVLOG_PHOTOS';
    const AUDIO = '__BVLOG_AUDIO';
    const HISTORY = '__BVLOG_HISTORY';
    const DATE = 'ДАТА:';
    public static function unsupported() { throw new BVLOG_Read_Unsupported('unsupported_shape'); }
    private static function s($v) {
        if ($v===null) return '';
        if (!is_string($v)) self::unsupported(); // FORMATTED_VALUE must be a string
        return $v;
    }
    private static function pad($v,$width) {
        if (!is_array($v)||count($v)>$width) self::unsupported();
        return array_pad(array_map(array(__CLASS__,'s'),array_values($v)),$width,'');
    }
    private static function any($v,$trim=false) {
        foreach($v as $x) if(($trim?trim($x):$x)!=='') return true;
        return false;
    }
    private static function norm($s) {
        if (!function_exists('mb_strtolower')) self::unsupported();
        return mb_strtolower(trim(preg_replace('/\s+/u',' ',$s)),'UTF-8');
    }
    private static function col($n) {
        $s='';for(;$n>0;$n=intdiv($n-1,26))$s=chr(65+($n-1)%26).$s;return $s;
    }
    /** Metadata comes from spreadsheets.get, not a caller-supplied tab list. */
    public static function sheets($raw,$doc) {
        if (($raw['spreadsheetId']??'')!==$doc||!is_array($raw['sheets']??null)) self::unsupported();
        $out=array();
        foreach($raw['sheets'] as $sheet){
            $p=$sheet['properties']??array();$title=$p['title']??'';
            if(!is_string($title)||$title===''||isset($out[$title]))self::unsupported();
            $rows=$p['gridProperties']['rowCount']??0;$cols=$p['gridProperties']['columnCount']??0;
            $out[$title]=array('rows'=>(int)$rows,'cols'=>(int)$cols,'type'=>(string)($p['sheetType']??'GRID'));
        }
        return $out;
    }
    /** One values.batchGet for the requested tab and associated private indexes.
     * Bounded whole LOG/index scan in this alpha, not a claim of optimal latency
     * for unbounded sheets. Do not truncate when a bound is exceeded.
     */
    public static function plan($sheets,$tab) {
        if(!in_array($tab,self::TABS,true))self::unsupported();
        $ranges=array();$widths=array();$cells=0;
        $add=function($name,$width,$end=null)use($sheets,&$ranges,&$widths,&$cells){
            if(!isset($sheets[$name]))return;
            $p=$sheets[$name];$rows=$p['rows'];
            if($p['type']!=='GRID'||$rows<2||$p['cols']<$width)self::unsupported();
            if($end!==null)$rows=min($end,$rows);
            elseif($rows>20000)self::unsupported();
            $cells+=($rows-1)*$width;
            if($cells>200000)self::unsupported();
            // Only fixed sheet names are passed here.
            $ranges[$name]="'".$name."'!A2:".self::col($width).$rows;
            $widths[$name]=$width;
        };
        if($tab==='LOG'){
            $add('LOG',8);if(isset($sheets['LOG'])){$add(self::PHOTO,10);$add(self::HISTORY,8);$add(self::AUDIO,12);}
        }elseif($tab==='TEAM'){$add('TEAM',9,151);$add(self::AUDIO,12);}
        elseif($tab==='TECH'){$add('TECH',6,151);$add(self::AUDIO,12);}
        else{$add(self::AUDIO,12);}
        return array('ranges'=>$ranges,'widths'=>$widths);
    }
    public static function decode_values($raw,$plan,$doc) {
        if(($raw['spreadsheetId']??'')!==$doc||!is_array($raw['valueRanges']??null)||
            count($raw['valueRanges'])!==count($plan['ranges']))self::unsupported();
        $out=array();$i=0;
        foreach($plan['ranges'] as $name=>$range){
            $v=$raw['valueRanges'][$i++];$actual=$v['range']??'';
            // Google may omit quotes around a simple sheet title, but must
            // return the requested sheet and exact A1 row/column interval.
            if(str_replace("'","",$actual)!==str_replace("'","",$range)||
                ($v['majorDimension']??'ROWS')!=='ROWS')self::unsupported();
            $rows=$v['values']??array();
            if(!is_array($rows))self::unsupported();
            preg_match('/(\d+)$/D',$range,$m);
            if(count($rows)>(int)$m[1]-1)self::unsupported();
            $out[$name]=array_map(function($r)use($plan,$name){return self::pad($r,$plan['widths'][$name]);},$rows);
        }
        return $out;
    }
    private static function tail($rows) {
        $end=0;
        foreach($rows as $i=>$v)if(self::any(array_slice($v,1,6),true))$end=$i+1;
        $start=max(0,$end-120);
        return array('row'=>$start+2,'rows'=>array_slice($rows,$start,max(1,$end-$start)));
    }
    public static function legacy_range($rows) {
        $tail=self::tail($rows);
        foreach($tail['rows'] as $v)if($v[5]!=='')
            return "'LOG'!F".$tail['row'].":F".($tail['row']+count($tail['rows'])-1);
        return null;
    }
    /** Managed media are projected from the indexes. Legacy linked rich text
     * is deliberately delegated to GAS until exact run-level parity is proven.
     */
    private static function grid_sheet($raw,$doc,$title){
        if(($raw['spreadsheetId']??'')!==$doc||!is_array($raw['sheets']??null))self::unsupported();
        $matches=array_values(array_filter($raw['sheets'],function($s)use($title){return ($s['properties']['title']??'')===$title;}));
        if(count($matches)!==1)self::unsupported();
        return $matches[0];
    }
    public static function check_legacy($raw,$doc,$rows) {
        $tail=self::tail($rows);
        $sheet=self::grid_sheet($raw,$doc,'LOG');$blocks=$sheet['data']??array();
        if(count($blocks)!==1)self::unsupported();
        $block=$blocks[0];
        if(($block['startRow']??0)!==$tail['row']-1||($block['startColumn']??0)!==5||
            count($block['rowData']??array())>count($tail['rows']))self::unsupported();
        foreach($tail['rows'] as $i=>$r){
            $cells=$block['rowData'][$i]['values']??array();
            if(count($cells)>1)self::unsupported();
            $c=$cells[0]??array();
            if(self::s($c['formattedValue']??'')!==$r[5])self::unsupported();
            if(!empty($c['hyperlink'])||!empty($c['userEnteredFormat']['textFormat']['link'])||
                !empty($c['userEnteredValue']['formulaValue']))self::unsupported();
            foreach(($c['textFormatRuns']??array()) as $run)
                if(!empty($run['format']['link']))self::unsupported();
        }
    }
    public static function info_range($sheets) {
        if(!isset($sheets['INFO']))return null;
        $p=$sheets['INFO'];
        if($p['type']!=='GRID'||$p['rows']<45||$p['rows']>2000||$p['cols']<4||
            $p['cols']>60||$p['rows']*$p['cols']>100000)self::unsupported();
        // Include cells outside the visible INFO projection to reproduce
        // getLastRow/getLastColumn, including formulas displaying empty text.
        return "'INFO'!A1:".self::col($p['cols']).$p['rows'];
    }
    public static function info($raw,$sheets,$doc) {
        if(!isset($sheets['INFO']))return array('INFO'=>array(),'INFO_SECTIONS'=>array());
        $sheet=self::grid_sheet($raw,$doc,'INFO');
        $blocks=$sheet['data']??array();
        if(count($blocks)>1)self::unsupported();
        $block=$blocks[0]??array();
        if(($block['startRow']??0)!==0||($block['startColumn']??0)!==0)self::unsupported();
        $grid=array();$rules=array();$lastRow=0;$lastCol=0;$p=$sheets['INFO'];
        $rows=$block['rowData']??array();
        if(!is_array($rows)||count($rows)>$p['rows'])self::unsupported();
        foreach($rows as $r=>$row){
            $cells=$row['values']??array();
            if(!is_array($cells)||count($cells)>$p['cols'])self::unsupported();
            foreach($cells as $c=>$cell){
                $value=self::s($cell['formattedValue']??'');
                if($value!==''||!empty($cell['userEnteredValue'])){$lastRow=max($lastRow,$r+1);$lastCol=max($lastCol,$c+1);}
                if($r<750&&$c<15){$grid[$r][$c]=$value;if(isset($cell['dataValidation']))$rules[$r][$c]=$cell['dataValidation'];}
            }
        }
        $height=min(max($lastRow,45),750);$width=min(max($lastCol,4),15);
        // GAS may attempt to read outside an unusually small physical grid.
        if($height>$p['rows']||$width>$p['cols'])self::unsupported();
        $g=array();
        for($r=0;$r<$height;$r++){for($c=0;$c<$width;$c++)$g[$r][$c]=$grid[$r][$c]??'';}
        $legacy=array_map(function($r){return array_slice($r,0,4);},array_slice($g,0,min(max($lastRow,34),150)));
        $sections=array();
        foreach($g as $i=>$row){
            $normal=array_map(array(__CLASS__,'norm'),$row);
            $data=array_search('инфо',$normal,true);$label=array_search('колона 1',$normal,true);
            $comment=false;foreach($normal as $v)if(strpos($v,'коментар')!==false){$comment=true;break;}
            if($data===false&&($label===false||!$comment))continue;
            if($data!==false&&$label===false&&!$comment)continue;
            $labelCol=$label!==false?$label+1:max(1,(int)$data);
            $cols=array();
            foreach($row as $j=>$v)if($j+1!==$labelCol&&trim($v)!==''&&!preg_match('/^BVLOG_/i',$v))
                $cols[]=array('col'=>$j+1,'letter'=>self::col($j+1),'label'=>trim($v));
            if(!$cols)continue;
            if($data!==false)usort($cols,function($a,$b)use($data){return $a['col']===$data+1?-1:($b['col']===$data+1?1:$a['col']<=>$b['col']);});
            $sections[]=array('headerRow'=>$i+1,'labelCol'=>$labelCol,'columns'=>array_slice($cols,0,10),
                'rows'=>array(),'date'=>'','section'=>count($sections));
        }
        foreach($sections as $n=>&$section){
            $next=$sections[$n+1]['headerRow']??0;$end=$next?$next-1:count($g);$section['nextHeader']=$next;
            foreach(($g[$section['headerRow']-2]??array()) as $v)if(strpos(trim($v),self::DATE)===0){$section['date']=$v;break;}
            for($r=$section['headerRow']+1;$r<=$end;$r++){
                $label=trim($g[$r-1][$section['labelCol']-1]??'');
                if($label===''||strpos($label,self::DATE)===0||self::norm($label)==='колона 1')continue;
                $fields=array();
                foreach($section['columns'] as $j=>$f){
                    $choices=array();$col=$f['col']-1;
                    if($j===0&&self::norm($label)==='акция'){
                        $condition=$rules[$r-1][$col]['condition']??array();
                        $type=$condition['type']??'';
                        // Range-backed dropdowns and unusual validation types
                        // are intentionally read through GAS in this alpha.
                        if($type==='ONE_OF_RANGE')self::unsupported();
                        if($type==='ONE_OF_LIST')foreach(($condition['values']??array()) as $v){
                            $choice=trim(self::s($v['userEnteredValue']??''));
                            if(!function_exists('mb_substr'))self::unsupported();
                            $choice=mb_substr($choice,0,60,'UTF-8');
                            if(self::norm($choice)==='наводение')$choice='Наводнение';
                            if($choice!==''&&!in_array($choice,$choices,true))$choices[]=$choice;
                        }
                    }
                    $fields[]=array('col'=>$f['letter'],'header'=>$f['label'],'value'=>$g[$r-1][$col]??'','choices'=>$choices);
                }
                $section['rows'][]=array('row'=>$r,'label'=>$label,'section'=>$n,'fields'=>$fields);
            }
        }unset($section);
        return array('INFO'=>$legacy,'INFO_SECTIONS'=>$sections);
    }
    public static function project($tab,$sheets,$values,$info=array()) {
        $data=array('MISSING_TABS'=>array_values(array_filter(self::TABS,function($t)use($sheets){return !isset($sheets[$t]);})));
        if($tab==='INFO')$data=array_merge($data,$info);
        $tail=$tab==='LOG'?self::tail($values['LOG']??array()):array('row'=>2,'rows'=>array());
        $ids=array();foreach($tail['rows'] as $v)if($v[6]!=='')$ids[$v[6]]=true;
        $photos=array();$audio=array();$fields=array();$history=array();
        if($tab==='LOG')foreach(($values[self::PHOTO]??array()) as $r)
            if($r[0]!==''&&$r[1]!==''&&isset($ids[$r[1]]))
                $photos[$r[1]][]=array('id'=>$r[0],'text'=>$r[5]!==''?$r[5]:'Снимка','url'=>'','managed'=>true);
        foreach(($values[self::AUDIO]??array()) as $r){
            $bytes=$r[8]===''?0:(is_numeric($r[8])?0+$r[8]:null);
            $entry=array('id'=>$r[0],'mime'=>$r[4],'bytes'=>$bytes);
            if($tab==='LOG'&&$r[2]==='log'&&$r[0]!==''&&isset($ids[$r[1]]))$audio[$r[1]]=$entry;
            if($r[2]==='field'&&$r[9]===$tab&&$r[10]!==''&&$r[11]!=='')$fields[$r[9].':'.$r[11].$r[10]][]=$entry;
        }
        $data['FIELD_AUDIO']=(object)$fields;
        if($tab==='LOG'){
            foreach(($values[self::HISTORY]??array()) as $r)if(isset($ids[$r[1]])){
                $history[$r[1]][]=array('at'=>$r[3],'author'=>$r[4],'action'=>$r[2],'before'=>$r[5],'after'=>$r[6]);
                if(count($history[$r[1]])>8)array_shift($history[$r[1]]);
            }
            $data['LOG']=array();
            foreach($tail['rows'] as $i=>$v)if(self::any(array_slice($v,1,6))){
                $id=$v[6];$data['LOG'][]=array('row'=>$tail['row']+$i,'cells'=>array_slice($v,0,7),
                    'status'=>$v[7],'audio'=>$audio[$id]??null,'history'=>$history[$id]??array(),'photos'=>$photos[$id]??array());
            }
        }
        if($tab==='TEAM'||$tab==='TECH'){
            $data[$tab]=array();
            if(isset($sheets[$tab])){
                $width=$tab==='TEAM'?9:6;$rows=$values[$tab]??array();
                if(!$rows)$rows=array(array_fill(0,$width,''));
                foreach($rows as $i=>$v)if($i===0||self::any(array_slice($v,1,$width-2))){
                    $data[$tab][]=array('row'=>$i+2,'cells'=>$v,'row_key'=>$v[$width-1]!==''?$v[$width-1]:'m:'.$v[1].'|'.$v[$tab==='TEAM'?2:3]);
                }
            }
        }
        return $data;
    }
}
