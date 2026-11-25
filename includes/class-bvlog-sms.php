<?php
if (!defined('ABSPATH')) { exit; }
/**
 * Experimental SMS transport. Default OFF; synthetic allowlisted incidents only.
 * No personal SMS should leave the handset: a locally filtered gateway is required.
 * Never log raw SMS, signing keys, grants or authorization headers.
 */
class BVLOG_SMS {
    const SCHEMA = 1;
    const MAX_PARTS = 96;
    private static function table() { global $wpdb; return $wpdb->prefix.'bvlog_sms_pilot'; }
    private static function cfg() {
        return defined('BVLOG_SMS_GATEWAYS') && is_array(BVLOG_SMS_GATEWAYS) ? BVLOG_SMS_GATEWAYS : array();
    }
    public static function configured() {
        return defined('BVLOG_SMS_PILOT') && BVLOG_SMS_PILOT === true &&
            defined('BVLOG_SMS_TEST_DOCS') && is_array(BVLOG_SMS_TEST_DOCS) &&
            count(BVLOG_SMS_TEST_DOCS)>0 && BVLOG_Auth::mode()!=='public' && count(self::cfg())>0;
    }
    public static function enabled() {
        return self::configured() && (int)get_option('bvlog_sms_schema',0)===self::SCHEMA;
    }
    public static function test_doc($doc) {
        return self::enabled() && is_string($doc) && preg_match('/^[A-Za-z0-9_-]{15,200}$/D',$doc) &&
            in_array($doc,BVLOG_SMS_TEST_DOCS,true);
    }
    public static function install() {
        if (!self::configured() || !current_user_can('manage_options') || self::enabled()) return;
        global $wpdb;
        $table=self::table();$collation=$wpdb->get_charset_collate();
        $ok=$wpdb->query("CREATE TABLE IF NOT EXISTS $table (
            id char(64) NOT NULL, kind varchar(12) NOT NULL,
            scope_key char(64) NOT NULL, grant_key char(64) NOT NULL,
            payload longtext NOT NULL, digest char(64) NOT NULL,
            status varchar(16) NOT NULL, expires bigint unsigned NOT NULL,
            updated bigint unsigned NOT NULL, PRIMARY KEY(id),
            KEY scope_kind (scope_key,kind), KEY grant_kind (grant_key,kind),
            KEY status_updated (status,updated)
        ) $collation");
        if($ok!==false)update_option('bvlog_sms_schema',self::SCHEMA,false);
    }
    private static function err($code,$status=503) {
        return new WP_Error('bvlog_sms_'.$code,'SMS pilot: '.$code,array('status'=>$status));
    }
    private static function b64($bytes) {return rtrim(strtr(base64_encode($bytes),'+/','-_'),'=');}
    private static function unb64($s) {
        if(!is_string($s)||!preg_match('/^[A-Za-z0-9_-]+$/D',$s))return false;
        $x=base64_decode(strtr($s,'-_','+/'),true);
        return $x!==false&&self::b64($x)===$s?$x:false;
    }
    private static function json($value) {
        $json=json_encode($value,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
        if(!is_string($json))throw new RuntimeException('encoding');
        return $json;
    }
    private static function key($kind,$value) {return hash('sha256',$kind.'|'.$value);}
    private static function get($id) {
        global $wpdb;$table=self::table();
        return $wpdb->get_row($wpdb->prepare("SELECT * FROM $table WHERE id=%s",$id),ARRAY_A);
    }
    private static function payload($row) {
        return is_array($row)?json_decode($row['payload'],true):null;
    }
    /** INSERT IGNORE is atomic by primary key; compare digest on duplicate. */
    private static function put($kind,$id,$scope,$grant,$payload,$status,$expires) {
        global $wpdb;$table=self::table();$body=self::json($payload);$digest=hash('sha256',$body);
        $r=$wpdb->query($wpdb->prepare("INSERT IGNORE INTO $table
            (id,kind,scope_key,grant_key,payload,digest,status,expires,updated)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%d,%d)",
            $id,$kind,$scope,$grant,$body,$digest,$status,$expires,time()));
        if($r===false)throw new RuntimeException('storage');
        $old=self::get($id);
        if(!$old)throw new RuntimeException('storage');
        return hash_equals($old['digest'],$digest);
    }
    private static function status($id,$status) {
        global $wpdb;$table=self::table();
        // A review or retry cannot regress an already acknowledged write.
        if($wpdb->query($wpdb->prepare("UPDATE $table SET status=%s,updated=%d
            WHERE id=%s AND status<>'APPLIED'",$status,time(),$id))===false)
            throw new RuntimeException('storage');
    }
    private static function phone($text) {
        $s=trim((string)$text);
        // Accept a phone-only value, or one unambiguous Bulgarian phone in a
        // dedicated phone/comment+phone column. Never scan unrelated INFO roles.
        if(!preg_match('/^[+0-9().\s-]+$/D',$s)){
            preg_match_all('/(?<![\d+])(?:\+359|00359|0)(?:[ .()-]*\d){9}(?!\d)/u',$s,$matches);
            if(count($matches[0])!==1)return '';
            $s=$matches[0][0];
        }
        $s=preg_replace('/[().\s-]+/','',$s);
        if(substr($s,0,2)==='00')$s='+'.substr($s,2);
        elseif(preg_match('/^0[1-9]\d{8}$/D',$s))$s='+359'.substr($s,1);
        return preg_match('/^\+[1-9]\d{7,14}$/D',$s)?$s:'';
    }
    public static function coordinator($data) {
        $sections=$data['INFO_SECTIONS']??array();
        if(!is_array($sections)||!count($sections))return '';
        // Only the latest INFO block is authoritative; fail on ambiguity.
        $section=end($sections);
        $labels=defined('BVLOG_SMS_COORDINATOR_LABELS')&&is_array(BVLOG_SMS_COORDINATOR_LABELS)?
            BVLOG_SMS_COORDINATOR_LABELS:array('Координатор','Координатор на акцията');
        $matches=array();
        foreach(($section['rows']??array()) as $row) {
            foreach($labels as $label)if(is_string($label)&&preg_match('/^'.preg_quote($label,'/').'$/iu',trim((string)($row['label']??'')))){
                $matches[]=$row;break;
            }
        }
        if(count($matches)!==1)return '';
        $phones=array();
        foreach(($matches[0]['fields']??array()) as $field)if(preg_match('/телефон|phone/iu',(string)($field['header']??''))){
            $phone=self::phone($field['value']??'');if($phone)$phones[]=$phone;
        }
        $phones=array_values(array_unique($phones));
        return count($phones)===1?$phones[0]:'';
    }
    private static function gateway($device) {
        $g=self::cfg()[$device]??null;
        if(!is_array($g)||($g['local_filter_verified']??false)!==true||
           !is_string($g['signing_key']??null)||strlen($g['signing_key'])<32||
           !preg_match('/^\+[1-9]\d{7,14}$/D',(string)($g['phone']??'')))return null;
        return $g;
    }
    private static function grant_key($grant) {
        return hash_hmac('sha256','bvlog-sms-pilot-sender|'.$grant['alias'].'|'.$grant['scope'],wp_salt('auth'),true);
    }
    private static function actor($identity) {
        return (string)($identity['kind']??'').'|'.(string)($identity['sub']??'');
    }
    private static function allowed_actor($grant) {
        if(($grant['kind']??'')==='google'){
            if(BVLOG_Auth::mode()!=='google')return false;
            $s=bvlog_settings();$emails=preg_split('/[,;\s]+/',strtolower((string)($s['google_allowed_emails']??'')));
            return !empty($s['google_allow_any'])||in_array(strtolower((string)$grant['email']),$emails,true);
        }
        if(($grant['kind']??'')==='wordpress'&&preg_match('/^wp:(\d+)$/D',(string)$grant['sub'],$m)){
            $u=get_user_by('id',(int)$m[1]);
            if(!$u)return false;
            return user_can($u,'manage_options')||!!array_intersect((array)$u->roles,
                array_map('trim',explode(',',(string)bvlog_settings()['roles'])));
        }
        return false;
    }
    /** Called only on a successful authorized INFO read, never on public HTML. */
    public static function decorate($result,$doc) {
        if(!self::test_doc($doc)||is_wp_error($result)||!method_exists($result,'get_data'))return $result;
        $out=$result->get_data();
        $fenced=class_exists('BVLOG_Direct_Write')&&BVLOG_Direct_Write::fenced($doc);
        $valid=$fenced?(BVLOG_Direct_Write::sms_ready($doc)&&
            in_array($out['read_meta']['backend']??'',array('sheets_api','server_cache'),true)):
            ($out['backend_version']??'')==='0.8.3';
        if(empty($out['ok'])||!$valid||($out['id']??'')!==$doc||
            !is_array($out['data']['INFO_SECTIONS']??null))return $result;
        $phone=self::coordinator($out['data']);$identity=BVLOG_Auth::identity();
        if(!$phone||!$identity||!in_array($identity['kind']??'',array('google','wordpress'),true))return $result;
        $devices=array();
        foreach(self::cfg() as $id=>$g)if(is_string($id)&&($valid=self::gateway($id))&&$valid['phone']===$phone)$devices[]=$id;
        if(count($devices)!==1)return $result;
        // Daily-issued alias with seven-day validity. The complete scope is
        // stored server-side; aliases never convey a document or user's name.
        $day=intdiv(time(),86400);$scope=self::key('scope',self::json(array($doc,self::actor($identity),$phone,$devices[0],$day)));
        $alias=substr(self::b64(hash_hmac('sha256','bvlog-sms-alias|'.$scope,wp_salt('auth'),true)),0,8);
        $g=array('alias'=>$alias,'scope'=>$scope,'doc_id'=>$doc,'device'=>$devices[0],'phone'=>$phone,
            'kind'=>$identity['kind'],'sub'=>(string)$identity['sub'],'email'=>(string)($identity['email']??''),
            'name'=>BVLOG_API::author_name($identity['name']??''),'expires'=>($day+7)*86400);
        try {
            $id=self::key('grant',$alias);
            if(!self::put('grant',$id,$id,$id,$g,'READY',$g['expires']))return $result; // collision or changed identity: fail closed
            $out['data']['SMS_PILOT']=array('doc_id'=>$doc,'phone'=>$phone,'alias'=>$alias,
                'key'=>self::b64(self::grant_key($g)),'expires'=>$g['expires']);
            $result->set_data($out);
        }catch(Throwable $e){ /* no SMS config; normal INFO remains available */ }
        return $result;
    }
    public static function log_hash($doc,$op,$event,$source,$text,$actor) {
        $time=strtotime((string)$event);
        if($time===false||!is_string($actor)||$actor==='|')return '';
        return hash('sha256',self::json(array($doc,$op,$time,$source,$text,$actor)));
    }
    public static function normal_log_hash($body) {
        $doc=$body['doc_id']??'';
        if(!self::test_doc($doc)&&!(class_exists('BVLOG_Direct_Write')&&BVLOG_Direct_Write::fenced($doc)))return '';
        $identity=BVLOG_Auth::identity();
        if(!$identity||!in_array($identity['kind']??'',array('google','wordpress'),true))return '';
        return self::log_hash($body['doc_id'],$body['op_id'],$body['event_at'],$body['source'],$body['text'],self::actor($identity));
    }
    /** Pure parser: fixed lengths, independent SMS, no untrusted code execution. */
    public static function parse($wire) {
        if(!is_string($wire)||strlen($wire)>640||!preg_match('//u',$wire))return null;
        $lines=explode("\n",$wire,2);
        if(count($lines)!==2||$lines[1]==='')return null;
        $h=$lines[0];
        if(!preg_match('/^DK1([A-Za-z0-9_-]{8})([A-Za-z0-9_-]{22})([0-9a-z]{2})([0-9a-z]{2})([0-9a-z]{6}[TV][A-Za-z0-9_-]{16})?$/D',$h,$m))return null;
        $n=(int)base_convert($m[3],36,10);$total=(int)base_convert($m[4],36,10);
        if($n<1||$total<1||$total>self::MAX_PARTS||$n>$total||($n===1)!==!empty($m[5]))return null;
        $bytes=self::unb64($m[2]);if($bytes===false||strlen($bytes)!==16)return null;
        $hex=bin2hex($bytes);
        $uuid=substr($hex,0,8).'-'.substr($hex,8,4).'-'.substr($hex,12,4).'-'.substr($hex,16,4).'-'.substr($hex,20);
        return array('alias'=>$m[1],'id'=>$m[2],'op_id'=>$uuid,'part'=>$n,'total'=>$total,
            'count36'=>$m[4],'meta'=>$m[5]??'','text'=>$lines[1]);
    }
    private static function grant($alias) {
        $g=self::payload(self::get(self::key('grant',$alias)));
        if(!is_array($g)||($g['alias']??'')!==$alias||($g['expires']??0)<time()||
            !self::test_doc($g['doc_id']??'')||!self::allowed_actor($g))return null;
        $gateway=self::gateway($g['device']);
        return $gateway&&$gateway['phone']===$g['phone']?$g:null;
    }
    private static function verify_gateway($request) {
        if(!self::enabled())return self::err('disabled',403);
        $raw=$request->get_body();
        if(!is_string($raw)||strlen($raw)>8192)return self::err('size',413);
        $ts=(string)$request->get_header('X-Timestamp');$sig=strtolower((string)$request->get_header('X-Signature'));
        if(!preg_match('/^\d{10}$/D',$ts)||!preg_match('/^[a-f0-9]{64}$/D',$sig)||
            (int)$ts>time()+300||(int)$ts<time()-7*86400)return self::err('signature',403);
        $msg=json_decode($raw,true);$device=$msg['deviceId']??'';
        if(!is_string($device)||!preg_match('/^[A-Za-z0-9_-]{1,128}$/D',$device))return self::err('gateway',403);
        $gateway=self::gateway($device);
        if(!$gateway||!hash_equals(hash_hmac('sha256',$raw.$ts,$gateway['signing_key']),$sig))return self::err('signature',403);
        return $msg;
    }
    public static function authorize_gateway($request) {
        $r=self::verify_gateway($request);return is_wp_error($r)?$r:true;
    }
    public static function register_routes() {
        if(!self::enabled())return;
        register_rest_route('bvlog/v1','/sms-ingest',array('methods'=>'POST',
            'permission_callback'=>array(__CLASS__,'authorize_gateway'),'callback'=>array(__CLASS__,'webhook')));
    }
    private static function rate($device) {
        $id='bvlog_sms_rl_'.substr(hash('sha256',$device),0,32);
        $n=(int)get_transient($id);if($n>=300)return false;
        set_transient($id,$n+1,60);return true;
    }
    public static function webhook($request) {
        $msg=self::verify_gateway($request);if(is_wp_error($msg))return $msg;
        if(($msg['event']??'')!=='sms:received')return rest_ensure_response(array('ok'=>true,'status'=>'IGNORED'));
        $wire=$msg['payload']['message']??'';
        // Defense in depth only: local filtering before transmission is mandatory.
        if(!is_string($wire)||strpos($wire,'DK1')!==0)return rest_ensure_response(array('ok'=>true,'status'=>'IGNORED'));
        if(!self::rate($msg['deviceId']))return self::err('rate',429);
        $p=self::parse($wire);if(!$p)return rest_ensure_response(array('ok'=>false,'status'=>'INVALID'));
        try {
            $g=self::grant($p['alias']);
            if(!$g||$g['device']!==$msg['deviceId'])return self::err('grant',403);
            $recipient=$msg['payload']['recipient']??null;
            if(is_string($recipient)&&$recipient!==''&&self::phone($recipient)!==$g['phone'])
                return self::err('recipient',403);
            $scope=self::key('event',$p['alias'].'|'.$p['id']);$grant=self::key('grant',$p['alias']);
            $rid=self::key('receipt',$scope);
            $receipt=array('alias'=>$p['alias'],'id'=>$p['id']);
            $partId=self::key('part',$scope.'|'.$p['part']);
            global $wpdb;$table=self::table();
            if(!self::get($partId)&&(int)$wpdb->get_var($wpdb->prepare(
                "SELECT COUNT(*) FROM $table WHERE grant_key=%s AND kind='part'",$grant))>=12000)return self::err('quota',429);
            if(!self::put('part',$partId,$scope,$grant,$p,'RECEIVED',$g['expires'])){
                self::put('receipt',$rid,$scope,$grant,$receipt,'REVIEW',$g['expires']);
                self::status($rid,'REVIEW');return rest_ensure_response(array('ok'=>false,'status'=>'REVIEW'));
            }
            return self::attempt($p['alias'],$p['id']);
        }catch(Throwable $e){return self::err('storage');}
    }
    /** All acknowledged fragments are durable. Only a complete verified group
     * enters the ordinary globally locked Google operation engine. */
    private static function attempt($alias,$id) {
        $g=self::grant($alias);if(!$g)return self::err('grant',403);
        $scope=self::key('event',$alias.'|'.$id);$grant=self::key('grant',$alias);$rid=self::key('receipt',$scope);
        $old=self::get($rid);
        if(($old['status']??'')==='APPLIED')return rest_ensure_response(array('ok'=>true,'status'=>'SHEETS_CONFIRMED'));
        if(($old['status']??'')==='REVIEW')return rest_ensure_response(array('ok'=>false,'status'=>'REVIEW'));
        global $wpdb;$table=self::table();
        $rows=$wpdb->get_results($wpdb->prepare("SELECT payload FROM $table WHERE scope_key=%s AND kind='part' LIMIT 97",$scope),ARRAY_A);
        if(!is_array($rows))return self::err('storage');
        $parts=array();$totals=array();
        foreach($rows as $row){$p=self::payload($row);if(!is_array($p)||$p['alias']!==$alias||$p['id']!==$id)return self::err('storage');
            $parts[$p['part']]=$p;$totals[$p['total']]=true;}
        $review=function()use($rid,$scope,$grant,$alias,$id,$g){
            self::put('receipt',$rid,$scope,$grant,array('alias'=>$alias,'id'=>$id),'REVIEW',$g['expires']);
            self::status($rid,'REVIEW');return rest_ensure_response(array('ok'=>false,'status'=>'REVIEW'));};
        if(count($totals)>1)return $review();
        if(!isset($parts[1])||count($parts)<$parts[1]['total'])return new WP_REST_Response(array('ok'=>true,'status'=>'PART_STORED'),202);
        $first=$parts[1];$text='';
        for($i=1;$i<=$first['total'];$i++){if(!isset($parts[$i]))return $review();$text.=$parts[$i]['text'];}
        $ts=substr($first['meta'],0,6);$source=substr($first['meta'],6,1);$tag=substr($first['meta'],7);
        $canonical='DK1|'.$alias.'|'.$id.'|'.$ts.'|'.$source.'|'.$first['count36'].'|'.$text;
        if(!hash_equals(self::b64(substr(hash_hmac('sha256',$canonical,self::grant_key($g),true),0,12)),$tag))return $review();
        $event=(int)base_convert($ts,36,10);
        if($event>time()+300||$event<time()-30*86400||$text===''||
            (function_exists('mb_strlen')?mb_strlen($text,'UTF-8'):strlen($text))>3000||
            sanitize_textarea_field($text)!==$text)return $review();
        self::put('receipt',$rid,$scope,$grant,array('alias'=>$alias,'id'=>$id),'RECEIVED',$g['expires']);
        $check=self::get($rid);
        if(($check['status']??'')==='REVIEW')return $review();
        if(($check['status']??'')==='APPLIED')return rest_ensure_response(array('ok'=>true,'status'=>'SHEETS_CONFIRMED'));
        // Legacy incidents retain their verified GAS INFO path. A direct
        // incident checks live INFO inside the same incident writer lock.
        $direct=class_exists('BVLOG_Direct_Write')&&BVLOG_Direct_Write::fenced($g['doc_id']);
        if($direct){
            if(!BVLOG_Direct_Write::sms_ready($g['doc_id']))return self::err('backend');
        }else{
            $info=BVLOG_API::forward('read',array('doc_id'=>$g['doc_id'],'tab'=>'INFO'));
            if(is_wp_error($info)||!method_exists($info,'get_data'))return self::err('google');
            $snapshot=$info->get_data();
            if(empty($snapshot['ok'])||($snapshot['backend_version']??'')!=='0.8.3')return self::err('backend');
            if(self::coordinator($snapshot['data']??array())!==$g['phone'])return $review();
        }
        // Credentials and allowlists might have changed while Google was busy.
        if(!self::grant($alias))return self::err('grant',403);
        $when=gmdate('Y-m-d\TH:i:s\Z',$event);$kind=$source==='T'?'text':'voice';
        $body=array('kind'=>'log','doc_id'=>$g['doc_id'],'op_id'=>$first['op_id'],
            'author'=>$g['name'],'text'=>$text,'source'=>$kind,'event_at'=>$when,'transport'=>'sms',
            'payload_hash'=>self::log_hash($g['doc_id'],$first['op_id'],$when,$kind,$text,self::actor($g)));
        if($direct)$body['sms_alias']=$alias; // server-only authenticated grant reference
        $result=BVLOG_API::forward('operation',$body);
        if(is_wp_error($result)||!method_exists($result,'get_data'))return self::err('google');
        $ack=$result->get_data();
        if(empty($ack['ok'])){
            if(in_array($ack['code']??'',array('sms_conflict','write_review','log_input','bad_id'),true))return $review();
            return self::err('google');
        }
        self::status($rid,'APPLIED');
        return rest_ensure_response(array('ok'=>true,'status'=>'SHEETS_CONFIRMED'));
    }
    /** Internal only: webhook has already authenticated the complete DK1
     * packet. Revalidate the grant and coordinator under the direct SQL
     * incident lock, using live Sheets, never a shared INFO snapshot.
     */
    public static function authorize_direct($p,$google,$meta){
        $doc=$p['doc_id']??'';
        $alias=$p['sms_alias']??'';
        if(!is_string($alias)||!preg_match('/^[A-Za-z0-9_-]{8}$/D',$alias)||
            !self::test_doc($doc)||!BVLOG_Direct_Write::sms_ready($doc))
            throw new BVLOG_Direct_Error('sms_grant',403);
        $g=self::grant($alias);
        if(!$g||$g['doc_id']!==$doc)throw new BVLOG_Direct_Error('sms_grant',403);
        $hash=self::log_hash($doc,$p['op_id'],$p['event_at'],$p['source'],$p['text'],self::actor($g));
        if(!$hash||!hash_equals($hash,$p['payload_hash'])||$g['name']!==$p['author'])
            throw new BVLOG_Log_Plan_Error('sms_conflict');
        $info=$google->read($doc,'INFO',$meta);
        if(($info['ok']??false)!==true||($info['id']??'')!==$doc||
            !is_array($info['data']['INFO_SECTIONS']??null))
            throw new BVLOG_Direct_Error('sms_info');
        if(self::coordinator($info['data'])!==$g['phone'])
            throw new BVLOG_Log_Plan_Error('sms_conflict');
        // Revocation between fetching the snapshot and dispatch is checked again.
        if(!self::grant($alias))throw new BVLOG_Direct_Error('sms_grant',403);
    }

    /** Optional bounded retry of durably received complete packets. WP cron
     * needs actual traffic or a system cron; this is not a delivery guarantee.
     * Do not retry partial groups, REVIEW, or expired grants.
     */
    public static function cron_schedules($schedules){
        $schedules['bvlog_sms_retry_5m']=array('interval'=>300,'display'=>'BG Voice Logger SMS retry (5 min)');
        return $schedules;
    }
    public static function schedule_retry(){
        if(!self::enabled()||!defined('BVLOG_SMS_RETRY_CRON')||BVLOG_SMS_RETRY_CRON!==true)return;
        if(!wp_next_scheduled('bvlog_sms_retry_received'))
            wp_schedule_event(time()+60,'bvlog_sms_retry_5m','bvlog_sms_retry_received');
    }
    public static function retry_received(){
        if(!self::enabled()||!defined('BVLOG_SMS_RETRY_CRON')||BVLOG_SMS_RETRY_CRON!==true)return;
        global $wpdb;$table=self::table();
        $row=$wpdb->get_row($wpdb->prepare("SELECT id,payload FROM $table WHERE kind='receipt'
            AND status='RECEIVED' AND expires>%d AND updated<%d ORDER BY updated ASC LIMIT 1",time(),time()-120),ARRAY_A);
        if(!is_array($row))return;
        $p=self::payload($row);$alias=$p['alias']??'';$id=$p['id']??'';
        if(!is_string($alias)||!preg_match('/^[A-Za-z0-9_-]{8}$/D',$alias)||
            !is_string($id)||!preg_match('/^[A-Za-z0-9_-]{22}$/D',$id))return;
        // Touch timestamp only, never regress REVIEW or APPLIED.
        $n=$wpdb->query($wpdb->prepare("UPDATE $table SET updated=%d WHERE id=%s
            AND status='RECEIVED' AND updated<%d",time(),$row['id'],time()-120));
        if($n!==1)return;
        try{self::attempt($alias,$id);}catch(Throwable $ignore){}
    }
    public static function admin_retry() {
        if(!current_user_can('manage_options')||!self::enabled())wp_die('SMS pilot unavailable');
        check_admin_referer('bvlog_sms_retry');
        $alias=sanitize_text_field(wp_unslash($_POST['alias']??''));$id=sanitize_text_field(wp_unslash($_POST['id']??''));
        if(preg_match('/^[A-Za-z0-9_-]{8}$/D',$alias)&&preg_match('/^[A-Za-z0-9_-]{22}$/D',$id)){
            try{self::attempt($alias,$id);}catch(Throwable $e){}
        }
        wp_safe_redirect(admin_url('options-general.php?page=bvlog'));exit;
    }
    public static function admin_panel() {
        if(!current_user_can('manage_options'))return;
        echo '<h2>SMS fallback pilot (synthetic incidents only)</h2>';
        if(!self::enabled()){echo '<p>Disabled. See docs/UPGRADE_V083_BG.md. No SMS endpoint or grants active.</p>';return;}
        global $wpdb;$table=self::table();
        $rows=$wpdb->get_results("SELECT payload,status,updated FROM $table WHERE kind='receipt' ORDER BY updated DESC LIMIT 30",ARRAY_A);
        echo '<p>Recent complete/review groups; no message text displayed. Incomplete parts are retained for assembly. Review gateway queue after exhausted retries.</p>';
        foreach((array)$rows as $row){
            $p=self::payload($row);
            echo '<p>'.esc_html(substr((string)($p['id']??''),0,22).' | '.$row['status'].' | '.gmdate('c',(int)$row['updated'])).'</p>';
            if($row['status']==='RECEIVED'){
                echo '<form method="post" action="'.esc_url(admin_url('admin-post.php')).'">';
                wp_nonce_field('bvlog_sms_retry');echo '<input type="hidden" name="action" value="bvlog_sms_retry">';
                echo '<input type="hidden" name="alias" value="'.esc_attr($p['alias']).'"><input type="hidden" name="id" value="'.esc_attr($p['id']).'">';
                echo '<button class="button">Retry SMS</button></form>';
            }
        }
    }
}
