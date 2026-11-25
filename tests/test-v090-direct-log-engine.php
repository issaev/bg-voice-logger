<?php
define('ABSPATH',__DIR__);
require __DIR__.'/../includes/class-bvlog-direct-log-plan.php';
require __DIR__.'/../includes/class-bvlog-direct-log-engine.php';
class BVLOG_Direct_Error extends RuntimeException {
    public $status;
    public function __construct($c,$s=503){parent::__construct($c);$this->status=$s;}
}
class BVLOG_Write_Rejected extends BVLOG_Direct_Error {}
function test($ok,$m){if(!$ok)throw new RuntimeException($m);}
function fails($fn,$code){try{$fn();}catch(RuntimeException $e){test($e->getMessage()===$code,'Expected '.$code.', got '.$e->getMessage());return;}throw new RuntimeException('Missing '.$code);}
final class FakeLedger {
    public $records=array(),$activeId=null,$held=false,$confirmFail=false;
    public function lock($doc){test(!$this->held,'exclusive lock');$this->held=true;return 'lock';}
    public function assert_lock($lock){test($this->held,'lock held');}
    public function unlock($lock){$this->held=false;}
    public function get($doc,$op){return $this->records[$op]??null;}
    public function active($doc){return $this->activeId;}
    public function reserve($doc,$op,$hash){
        if($this->activeId!==null||isset($this->records[$op]))return false;
        $this->records[$op]=array('status'=>'DISPATCHING','payload_hash'=>$hash);$this->activeId=$op;return true;
    }
    public function confirm($doc,$op,$hash,$ack){
        if($this->confirmFail)throw new BVLOG_Direct_Error('write_storage');
        test($this->activeId===$op&&$this->records[$op]['payload_hash']===$hash,'exact reservation');
        $this->records[$op]['status']='CONFIRMED';$this->activeId=null;
    }
    public function cancel_before_dispatch($doc,$op,$hash){
        test($this->activeId===$op,'cancel exact reservation');unset($this->records[$op]);$this->activeId=null;
    }
}
final class FakeCache {
    public $events=array();
    public function begin($doc){$this->events[]='begin';return array('id'=>'guard');}
    public function end($guard,$known){$this->events[]=$known?'known':'unknown';}
}
final class FakeGoogle {
    public $snapshot,$version=1,$metas=0,$posts=0,$mode='success';
    public function __construct(){
        $this->snapshot=array('LOG'=>array('id'=>0,'rows'=>array(array('','','','','','','BVLOG_ID','BVLOG_STATUS'),array('','','','ДАТА: 25.11.2026','','','',''))),
            '__BVLOG_OPS'=>array('id'=>44,'rows'=>array(array('op_id','kind','timestamp','author','result'))));
    }
    public function metadata($doc){
        $this->metas++;
        if($this->mode==='denied')throw new BVLOG_Direct_Error('scope_denied',403);
        if($this->mode==='changed'&&$this->metas===2)$this->version++;
        return array('version'=>(string)$this->version);
    }
    public function log_snapshot($doc){return $this->snapshot;}
    public function append_batch($doc,$requests){
        $this->posts++;
        if($this->mode==='rejected')throw new BVLOG_Write_Rejected('write_rejected_403',403);
        if($this->mode==='lost_before')throw new BVLOG_Direct_Error('write_unknown');
        foreach($requests as $request){
            $a=$request['appendCells'];$tab=$a['sheetId']===0?'LOG':'__BVLOG_OPS';$width=$tab==='LOG'?8:5;
            foreach($a['rows'] as $row){
                $v=array_fill(0,$width,'');
                foreach($row['values'] as $i=>$cell){
                    $u=$cell['userEnteredValue'];$v[$i]=(string)($u['stringValue']??$u['numberValue']);
                }
                $this->snapshot[$tab]['rows'][]=$v;
            }
        }
        $this->version++;
        if($this->mode==='lost_after')throw new BVLOG_Direct_Error('write_unknown');
        return true;
    }
}
$doc='SYNTHETIC_DOCUMENT_0001';$op='550e8400-e29b-41d4-a716-446655440000';
$p=array('kind'=>'log','op_id'=>$op,'payload_hash'=>str_repeat('a',64),'author'=>'Operator','text'=>'Original',
    'event_at'=>'2026-11-25T10:00:00.123Z','source'=>'voice');
$other=array_replace($p,array('op_id'=>'550e8400-e29b-41d4-a716-446655440001','payload_hash'=>str_repeat('b',64)));
$now=new DateTimeImmutable('2026-11-25T12:00:00Z');
$run=function($g,$l,$c,$body)use($doc,$now){return BVLOG_Direct_Log_Engine::run($doc,$body,$g,$l,$c,$now);};
$g=new FakeGoogle();$l=new FakeLedger();$c=new FakeCache();
$a=$run($g,$l,$c,$p);
test($a['ok']&&$g->posts===1&&$l->activeId===null&&$c->events===array('begin','known'),'atomic dispatch and confirmed receipt');
$g->snapshot['LOG']['rows'][2][3]='Manually edited';
$b=$run($g,$l,$c,array_replace($p,array('transport'=>'sms')));
test($b['deduplicated']&&$g->posts===1&&$g->snapshot['LOG']['rows'][2][3]==='Manually edited','Internet/SMS same ID, original hash, preserve edit');
fails(function()use($run,$g,$l,$c,$p){$run($g,$l,$c,array_replace($p,array('payload_hash'=>str_repeat('c',64))));},'write_review');
$g=new FakeGoogle();$l=new FakeLedger();$c=new FakeCache();$g->mode='lost_after';
fails(function()use($run,$g,$l,$c,$p){$run($g,$l,$c,$p);},'write_unknown');
test($l->activeId===$op&&$c->events===array('begin','unknown'),'lost ACK retains barrier and cache guard');
$g->mode='success';$b=$run($g,$l,$c,$p);
test($b['deduplicated']&&$g->posts===1&&$l->activeId===null,'reconcile after commit without replay');
$g=new FakeGoogle();$l=new FakeLedger();$c=new FakeCache();$g->mode='lost_before';
fails(function()use($run,$g,$l,$c,$p){$run($g,$l,$c,$p);},'write_unknown');
$g->mode='success';
fails(function()use($run,$g,$l,$c,$p){$run($g,$l,$c,$p);},'write_unknown');
fails(function()use($run,$g,$l,$c,$other){$run($g,$l,$c,$other);},'write_pending');
test($g->posts===1&&$l->activeId===$op,'missing receipt cannot justify replay or second writer');
$g=new FakeGoogle();$l=new FakeLedger();$c=new FakeCache();$g->mode='changed';
fails(function()use($run,$g,$l,$c,$p){$run($g,$l,$c,$p);},'changed_during_read');
test(!$g->posts&&$l->activeId===null&&$c->events===array('begin','known'),'pre-dispatch version change safely cancels intent');
$g=new FakeGoogle();$l=new FakeLedger();$c=new FakeCache();$l->confirmFail=true;
fails(function()use($run,$g,$l,$c,$p){$run($g,$l,$c,$p);},'write_storage');
test($l->activeId===$op&&$g->posts===1,'DB failure after Google ACK retains barrier');
$l->confirmFail=false;$b=$run($g,$l,$c,$p);
test($b['deduplicated']&&$g->posts===1&&$l->activeId===null,'recover durable receipt after SQL failure');
$g=new FakeGoogle();$l=new FakeLedger();$c=new FakeCache();$g->mode='denied';
fails(function()use($run,$g,$l,$c,$p){$run($g,$l,$c,$p);},'scope_denied');
test(!$g->posts&&!$l->held&&!$c->events,'access denied before any mutation, lock released');
$g=new FakeGoogle();$l=new FakeLedger();$c=new FakeCache();$g->mode='rejected';
fails(function()use($run,$g,$l,$c,$p){$run($g,$l,$c,$p);},'write_rejected_403');
test($l->activeId===null&&!$l->held&&$c->events===array('begin','known'),'explicit atomic rejection releases reservation');
$g->mode='success';test($run($g,$l,$c,$p)['ok']&&$g->posts===2,'retry after proven rejection');
echo "PASS direct LOG engine: duplicate, SMS race surrogate, lost ACK, pending barrier, version, SQL failure, scope and definite rejection\n";
