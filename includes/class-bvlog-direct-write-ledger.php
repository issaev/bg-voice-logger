<?php
if (!defined('ABSPATH')) { exit; }

/** No raw event text, phone numbers, credentials or document IDs in this ledger.
 * Keep receipts indefinitely until an explicit, separately reviewed migration.
 */
final class BVLOG_Direct_Write_Ledger {
    const SCHEMA=1;
    private static function table(){global $wpdb;return $wpdb->prefix.'bvlog_direct_write_ops';}
    public static function installed(){return (int)get_option('bvlog_direct_write_schema',0)===self::SCHEMA;}
    public static function install(){
        if(self::installed())return;
        global $wpdb;$t=self::table();$collation=$wpdb->get_charset_collate();
        $ok=$wpdb->query("CREATE TABLE IF NOT EXISTS $t (
            id char(64) NOT NULL, doc_key char(64) NOT NULL, payload_hash char(64) NOT NULL,
            status varchar(16) NOT NULL, active_doc char(64) NULL DEFAULT NULL,
            ack text NOT NULL, created bigint unsigned NOT NULL, updated bigint unsigned NOT NULL,
            PRIMARY KEY(id), UNIQUE KEY active_doc(active_doc), KEY document_status(doc_key,status)
        ) ENGINE=InnoDB $collation");
        if($ok!==false)update_option('bvlog_direct_write_schema',self::SCHEMA,false);
    }
    private static function doc_key($doc){return hash('sha256','bvlog-write-v1|'.get_current_blog_id().'|'.$doc);}
    private static function id($doc,$op){return hash('sha256',self::doc_key($doc).'|'.$op);}
    private static function failure(){throw new BVLOG_Direct_Error('write_storage');}
    public function lock($doc){
        global $wpdb;$name='bvlog_w_'.substr(self::doc_key($doc),0,48);
        if((string)$wpdb->get_var($wpdb->prepare("SELECT GET_LOCK(%s,3)",$name))!=='1')
            throw new BVLOG_Direct_Error('write_busy');
        return $name;
    }
    public function assert_lock($name){
        global $wpdb;
        if((string)$wpdb->get_var($wpdb->prepare("SELECT IF(IS_USED_LOCK(%s)=CONNECTION_ID(),1,0)",$name))!=='1')
            throw new BVLOG_Direct_Error('write_busy');
    }
    public function unlock($name){
        global $wpdb;
        $wpdb->get_var($wpdb->prepare("SELECT RELEASE_LOCK(%s)",$name));
    }
    public function get($doc,$op){
        global $wpdb;$t=self::table();
        $r=$wpdb->get_row($wpdb->prepare("SELECT id,doc_key,payload_hash,status,active_doc FROM $t WHERE id=%s",self::id($doc,$op)),ARRAY_A);
        if($wpdb->last_error)self::failure();
        if($r===null)return null;
        if(!is_array($r)||$r['doc_key']!==self::doc_key($doc)||
            !in_array($r['status'],array('DISPATCHING','CONFIRMED'),true)||
            ($r['status']==='DISPATCHING'&&$r['active_doc']!==$r['doc_key'])||
            ($r['status']==='CONFIRMED'&&$r['active_doc']!==null))self::failure();
        return $r;
    }
    public function active($doc){
        global $wpdb;$t=self::table();
        $r=$wpdb->get_var($wpdb->prepare("SELECT id FROM $t WHERE active_doc=%s",self::doc_key($doc)));
        if($wpdb->last_error)self::failure();
        return $r;
    }
    public function reserve($doc,$op,$hash){
        global $wpdb;$t=self::table();$key=self::doc_key($doc);$now=time();
        $n=$wpdb->query($wpdb->prepare("INSERT IGNORE INTO $t
            (id,doc_key,payload_hash,status,active_doc,ack,created,updated)
            VALUES (%s,%s,%s,'DISPATCHING',%s,'',%d,%d)",self::id($doc,$op),$key,$hash,$key,$now,$now));
        if($n===false)self::failure();
        return $n===1;
    }
    public function confirm($doc,$op,$hash,$ack){
        if(($ack['ok']??null)!==true)self::failure();
        global $wpdb;$t=self::table();$json=BVLOG_Direct_Crypto::json($ack);
        if(strlen($json)>1024)self::failure();
        $n=$wpdb->query($wpdb->prepare("UPDATE $t SET status='CONFIRMED',active_doc=NULL,ack=%s,updated=%d
            WHERE id=%s AND doc_key=%s AND payload_hash=%s AND status='DISPATCHING' AND active_doc=doc_key",
            $json,time(),self::id($doc,$op),self::doc_key($doc),$hash));
        if($n!==1)self::failure();
    }
    public function cancel_before_dispatch($doc,$op,$hash){
        global $wpdb;$t=self::table();
        $n=$wpdb->query($wpdb->prepare("DELETE FROM $t WHERE id=%s AND doc_key=%s AND payload_hash=%s
            AND status='DISPATCHING' AND active_doc=doc_key",self::id($doc,$op),self::doc_key($doc),$hash));
        if($n!==1)self::failure();
    }
    public function pending_count($doc){
        return $this->active($doc)!==null?1:0;
    }
}

/** Reuse the existing encrypted read-cache writer epoch. */
final class BVLOG_Direct_Write_Cache {
    public function begin($doc){return BVLOG_Read_Cache::begin_write($doc);}
    public function end($guard,$known){
        try{
            BVLOG_Read_Cache::end_write($guard,$known);
            if($known)BVLOG_Read_Cache::clear_direct_writers($guard['key']);
        }
        catch(Throwable $e){
            // Never turn an authoritative Sheets ACK into failure on cache cleanup.
            try{update_option('bvlog_direct_last_guard_error',gmdate('c'),false);}catch(Throwable $ignore){}
        }
    }
}
