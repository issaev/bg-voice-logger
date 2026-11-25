<?php
if (!defined('ABSPATH')) { exit; }

/** #50 synthetic direct LOG writer. Separate opt-in and GAS write fence.
 * Existing operation REST validation is shared by Internet and SMS ingest.
 */
final class BVLOG_Direct_Write {
    public static function fences(){
        $map=defined('BVLOG_DIRECT_WRITE_FENCES')?BVLOG_DIRECT_WRITE_FENCES:array();
        return is_array($map)?$map:array();
    }
    // Fence is independent of enabled state: disabling direct cannot silently
    // route these documents to GAS.
    public static function fenced($doc){
        return is_string($doc)&&array_key_exists($doc,self::fences());
    }
    public static function install(){
        if(self::fences()&&current_user_can('manage_options'))BVLOG_Direct_Write_Ledger::install();
    }
    private static function config($doc){
        $map=self::fences();$rollout=$map[$doc]??'';
        $s=bvlog_settings();$folder=$s['folder_id']??'';$template=$s['template_id']??'';
        if(count($map)>16||!self::fenced($doc)||!BVLOG_Google_Read_Transport::valid_id($doc)||
           !is_string($rollout)||!preg_match('/^[A-Za-z0-9_-]{8,64}$/D',$rollout)||
           !BVLOG_Google_Read_Transport::valid_id($folder)||!BVLOG_Google_Read_Transport::valid_id($template)||
           $folder===$template||$doc===$template||BVLOG_Auth::mode()==='public'||
           !BVLOG_Direct_Read::selected($doc)||!BVLOG_Direct_Write_Ledger::installed()||!BVLOG_Read_Cache::installed())
            throw new BVLOG_Direct_Error('write_configuration');
        // An independent credential file and separate OAuth scope/token cache.
        $c=BVLOG_Google_Read_Transport::credentials(defined('BVLOG_DIRECT_WRITE_SERVICE_ACCOUNT_FILE')?BVLOG_DIRECT_WRITE_SERVICE_ACCOUNT_FILE:'');
        $proof=hash('sha256',BVLOG_Direct_Crypto::json(array('v1',get_current_blog_id(),$s['script_url']??'',
            $folder,$template,$doc,$rollout,$c['fingerprint'])));
        return array('folder'=>$folder,'template'=>$template,'credential'=>$c,'rollout'=>$rollout,
            'proof_key'=>'bvlog_dw_fence_'.substr($proof,0,48));
    }
    private static function ready($doc){
        if(!defined('BVLOG_DIRECT_WRITE_MODE')||!in_array(BVLOG_DIRECT_WRITE_MODE,array('log_pilot','sheet_pilot'),true)||
            BVLOG_Direct_Read::mode()!=='direct'||!BVLOG_Direct_Read::approved($doc,'LOG'))
            throw new BVLOG_Direct_Error('write_disabled');
        $cfg=self::config($doc);$verified=(int)get_option($cfg['proof_key'],0);
        // Staging-only, short-lived proof of the *deployed* GAS fence.
        // Reverify after every backend/configuration change; never alter the
        // GAS fence or roll back while a direct intent can still commit.
        if($verified<=0||$verified>time()||time()-$verified>86400)
            throw new BVLOG_Direct_Error('write_fence_unverified');
        return $cfg;
    }
    public static function sms_ready($doc){
        if(!self::fenced($doc)||!BVLOG_Direct_Read::approved($doc,'INFO'))return false;
        try{self::ready($doc);return true;}catch(Throwable $e){return false;}
    }
    public static function operation($p){
        $doc=$p['doc_id']??'';
        try{
            if(!self::fenced($doc))throw new BVLOG_Direct_Error('scope_denied',403);
            $cfg=self::ready($doc);
            $kind=$p['kind']??'';
            if($kind!=='log'){
                // Only explicitly isolated synthetic docs permit edits. The
                // manual-editor race cannot be solved by a Drive version check.
                $exclusive=defined('BVLOG_DIRECT_WRITE_EXCLUSIVE')?BVLOG_DIRECT_WRITE_EXCLUSIVE:array();
                if(BVLOG_DIRECT_WRITE_MODE!=='sheet_pilot'||!is_array($exclusive)||!in_array($doc,$exclusive,true)||
                   !in_array($kind,array('field','add_row','log_change'),true))
                    throw new BVLOG_Log_Plan_Error('write_unsupported');
            }
            // Normal operation() supplies a server-calculated actor-bound hash;
            // SMS attempt() supplies the same hash only after grant/HMAC checks.
            // No client-provided hash or transport is accepted by operation().
            if(($p['transport']??'')!=='sms'&&!BVLOG_Auth::identity())
                throw new BVLOG_Direct_Error('login_required',401);
            $google=new BVLOG_Google_Log_Write_Transport($cfg,24);
            $authorize=null;
            if(($p['transport']??'')==='sms'){
                if($kind!=='log'||!class_exists('BVLOG_SMS'))throw new BVLOG_Direct_Error('sms_grant',403);
                $authorize=function($transport,$meta)use($p){BVLOG_SMS::authorize_direct($p,$transport,$meta);};
            }
            $ack=BVLOG_Direct_Log_Engine::run($doc,$p,$google,new BVLOG_Direct_Write_Ledger(),
                new BVLOG_Direct_Write_Cache(),new DateTimeImmutable('now',new DateTimeZone('UTC')),$authorize);
            $response=rest_ensure_response($ack+array('write_backend'=>$kind==='log'?'direct_log_v1':'direct_sheet_v1'));
            $response->header('Cache-Control','private, no-store, max-age=0');
            return $response;
        }catch(BVLOG_Sheet_Conflict $e){
            return rest_ensure_response(array('ok'=>false,'code'=>$e->getMessage(),'message'=>'Value or row changed. Refresh before editing.',
                'current'=>$e->current,'row'=>$e->row));
        }catch(BVLOG_Log_Plan_Error $e){
            $code=in_array($e->getMessage(),array('write_review','write_headers','write_shape','log_input','write_unsupported','protected_range','validation_type','validation_choice','sms_conflict'),true)?$e->getMessage():'write_shape';
            return rest_ensure_response(array('ok'=>false,'code'=>$code,
                'message'=>'Direct LOG pilot: '.$code.'. Keep the original operation ID; ask an administrator.'));
        }catch(Throwable $e){
            $code=$e instanceof BVLOG_Direct_Error?$e->getMessage():'write_internal';
            $code=preg_replace('/[^a-z0-9_]/','_',$code);
            return new WP_Error('bvlog_direct_'.$code,'Direct LOG pilot: '.$code.'. Do not create a replacement event.',
                array('status'=>$e instanceof BVLOG_Direct_Error?$e->status:503));
        }
    }
    private static function slots(){return array_keys(self::fences());}
    public static function verify_fence(){
        if(!current_user_can('manage_options'))wp_die('Forbidden','',array('response'=>403));
        check_admin_referer('bvlog_verify_write_fence');
        $slots=self::slots();$slot=isset($_POST['slot'])?absint($_POST['slot']):999;
        $status='fail';$reason='internal';
        try{
            if(!isset($slots[$slot]))throw new BVLOG_Direct_Error('write_configuration');
            $doc=$slots[$slot];$cfg=self::config($doc);
            // A failed re-verification must never leave an old positive proof.
            delete_option($cfg['proof_key']);
            if((int)get_option($cfg['proof_key'],0)!==0)throw new BVLOG_Direct_Error('write_storage');
            // This request acquires the same GAS script lock used by legacy
            // writes, so it cannot acknowledge the fence before those drain.
            $r=BVLOG_API::forward('writer_policy',array('doc_id'=>$doc));
            $data=!is_wp_error($r)&&method_exists($r,'get_data')?$r->get_data():array();
            if(($data['ok']??false)!==true||($data['policy']??'')!=='direct_log_only_v1'||
               ($data['fence_rollout']??'')!==$cfg['rollout'])
                throw new BVLOG_Direct_Error('write_fence_unverified');
            // Confirm Editor access and prepared LOG/OPS schema without mutation.
            $google=new BVLOG_Google_Log_Write_Transport($cfg,20);
            $before=$google->metadata($doc);$google->log_snapshot($doc);
            if($google->metadata($doc)['version']!==$before['version'])throw new BVLOG_Direct_Error('changed_during_read');
            $verified=time();update_option($cfg['proof_key'],$verified,false);
            if((int)get_option($cfg['proof_key'],0)!==$verified)throw new BVLOG_Direct_Error('write_storage');
            $status='ok';$reason='verified';
        }catch(Throwable $e){
            if($e instanceof BVLOG_Direct_Error||$e instanceof BVLOG_Log_Plan_Error){
                $code=$e->getMessage();if(preg_match('/^[a-z0-9_]{1,64}$/D',$code))$reason=$code;
            }
        }
        wp_safe_redirect(add_query_arg(array('page'=>'bvlog','write_fence'=>$status,'write_reason'=>$reason),admin_url('options-general.php')));exit;
    }
    public static function admin_panel(){
        if(!current_user_can('manage_options'))return;
        echo '<h2>Direct LOG writer pilot (#50)</h2>';
        if(!self::fences()){echo '<p>OFF. No direct-write test incidents configured.</p>';return;}
        echo '<p>Prepared synthetic incidents only. LOG append; sheet_pilot additionally permits supported field, row and LOG changes. Do not edit or sort a test document manually while the writer is active. CREATE/media remain outside this direct pilot. Fence verification is required every 24 hours.</p>';
        if(isset($_GET['write_fence']))echo '<p>'.(($_GET['write_fence']==='ok')?'Fence and write preflight verified.':'Fence or write preflight failed: '.esc_html(sanitize_key($_GET['write_reason']??'unknown'))).'</p>';
        foreach(self::slots() as $i=>$doc){
            $state='not ready';$pending='unknown';
            try{self::ready($doc);$state='ready';}catch(Throwable $ignore){}
            try{if(BVLOG_Direct_Write_Ledger::installed())$pending=(string)(new BVLOG_Direct_Write_Ledger())->pending_count($doc);}catch(Throwable $ignore){}
            echo '<p>Write test slot '.($i+1).': '.esc_html($state).'; unresolved dispatches: '.esc_html($pending).'.</p>';
            echo '<form method="post" action="'.esc_url(admin_url('admin-post.php')).'">';
            wp_nonce_field('bvlog_verify_write_fence');
            echo '<input type="hidden" name="action" value="bvlog_verify_write_fence"><input type="hidden" name="slot" value="'.(int)$i.'"><button class="button">Verify GAS fence</button></form>';
        }
        echo '<p>Unresolved dispatch: retry only the original queued operation. Do not clear the ledger or switch writers when a commit is uncertain.</p>';
    }
}
