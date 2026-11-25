<?php
if (!defined('ABSPATH')) { exit; }

/**
 * One incident writer, plus a durable unique active-doc reservation.
 * A dispatched-but-unconfirmed intent is never retried just because a
 * timeout has passed or a receipt is not yet visible.
 */
final class BVLOG_Direct_Log_Engine {
    public static function run($doc,$payload,$google,$ledger,$cache,$now,$authorize=null){
        $isLog=($payload['kind']??'')==='log';
        $p=$isLog?BVLOG_Direct_Log_Plan::payload($payload):BVLOG_Direct_Sheet_Plan::payload($payload);
        $op=$p['op_id'];$hash=$p['hash'];
        $lock=$ledger->lock($doc);$guard=null;$reserved=false;$uncertain=false;$confirmed=false;
        try{
            $meta=$google->metadata($doc); // live file/folder authorization, even on dedup
            if($authorize!==null)$authorize($google,$meta);
            $old=$ledger->get($doc,$op);
            if($old!==null&&(!BVLOG_Direct_Log_Plan::valid_hash($old['payload_hash']??null)||
                !hash_equals($old['payload_hash'],$hash)))throw new BVLOG_Log_Plan_Error('write_review');
            $snapshot=$isLog?$google->log_snapshot($doc):$google->mutation_snapshot($doc,$payload);
            $receipt=$isLog?BVLOG_Direct_Log_Plan::receipt($snapshot,$op,$hash):BVLOG_Direct_Sheet_Plan::receipt($snapshot,$payload);
            if($receipt!==null){
                // Require a stable authorized snapshot before acknowledging a receipt.
                $after=$google->metadata($doc);
                if($after['version']!==$meta['version'])throw new BVLOG_Direct_Error('changed_during_read');
                if($old!==null&&$old['status']==='DISPATCHING'){
                    $guard=$cache->begin($doc);
                    $ledger->assert_lock($lock);
                    $ledger->confirm($doc,$op,$hash,$receipt);
                }elseif($old!==null&&$old['status']!=='CONFIRMED'){
                    throw new BVLOG_Direct_Error('write_storage');
                }
                return $receipt;
            }
            // Absence of a receipt cannot establish non-commit of a timed-out request.
            if($old!==null){
                if($old['status']==='CONFIRMED')throw new BVLOG_Log_Plan_Error('write_review');
                throw new BVLOG_Direct_Error('write_unknown');
            }
            if($ledger->active($doc)!==null)throw new BVLOG_Direct_Error('write_pending');
            $plan=$isLog?BVLOG_Direct_Log_Plan::build($snapshot,$payload,$now):BVLOG_Direct_Sheet_Plan::build($snapshot,$payload,$now);
            if(!$plan['requests'])throw new BVLOG_Direct_Error('write_shape');
            $guard=$cache->begin($doc);
            $ledger->assert_lock($lock);
            if(!$ledger->reserve($doc,$op,$hash))throw new BVLOG_Direct_Error('write_busy',503);
            $reserved=true;
            // This version check narrows the manual-edit window; it is NOT CAS.
            $after=$google->metadata($doc);
            if($after['version']!==$meta['version'])throw new BVLOG_Direct_Error('changed_during_read');
            $ledger->assert_lock($lock);
            // From this line onwards only a positive Sheets ACK or a matching
            // immutable receipt may release the durable reservation.
            $uncertain=true;
            if($google->append_batch($doc,$plan['requests'])!==true)throw new BVLOG_Direct_Error('write_unknown');
            $ledger->confirm($doc,$op,$hash,$plan['ack']);
            $confirmed=true;$uncertain=false;
            return $plan['ack'];
        }finally{
            try{
                // Only the pre-dispatch path can remove an uncommitted reservation.
                if($reserved&&!$uncertain&&!$confirmed)$ledger->cancel_before_dispatch($doc,$op,$hash);
            }finally{
                try{if($guard!==null)$cache->end($guard,!$uncertain);}
                finally{$ledger->unlock($lock);}
            }
        }
    }
}
