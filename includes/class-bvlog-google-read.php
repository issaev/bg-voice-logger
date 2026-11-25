<?php
if (!defined('ABSPATH')) { exit; }
require_once __DIR__.'/class-bvlog-direct-scope.php';

/** #46: read-only Google API transport, isolated alpha. No browser tokens,
 * no Google mutation methods, no domain-wide delegation, no raw error logging.
 */
final class BVLOG_Direct_Error extends RuntimeException {
    public $status,$scope_reason;
    public function __construct($category,$status=503,$scope_reason=''){parent::__construct($category);$this->status=$status;$this->scope_reason=$scope_reason;}
}
final class BVLOG_Direct_Crypto {
    public static function b64($s){return rtrim(strtr(base64_encode($s),'+/','-_'),'=');}
    private static function unb64($s){return base64_decode(strtr($s,'-_','+/'),true);}
    public static function json($v){
        $s=json_encode($v,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
        if(!is_string($s))throw new BVLOG_Direct_Error('encoding');return $s;
    }
    private static function key(){return hash_hmac('sha256','bvlog-direct-cache-v1',wp_salt('auth'),true);}
    public static function seal($value,$aad){
        if(!function_exists('openssl_encrypt'))throw new BVLOG_Direct_Error('openssl_required');
        $iv=random_bytes(12);$tag='';
        $cipher=openssl_encrypt(self::json($value),'aes-256-gcm',self::key(),OPENSSL_RAW_DATA,$iv,$tag,$aad,16);
        if($cipher===false||strlen($tag)!==16)throw new BVLOG_Direct_Error('cache_encryption');
        return self::b64($iv.$tag.$cipher);
    }
    public static function open($s,$aad){
        if(!is_string($s)||strlen($s)>1600000||!function_exists('openssl_decrypt'))return null;
        $b=self::unb64($s);if($b===false||strlen($b)<29)return null;
        $plain=openssl_decrypt(substr($b,28),'aes-256-gcm',self::key(),OPENSSL_RAW_DATA,substr($b,0,12),substr($b,12,16),$aad);
        return $plain===false?null:json_decode($plain,true);
    }
}
class BVLOG_Google_Read_Transport {
    const SCOPES='https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/drive.metadata.readonly';
    const MAX_BYTES=2097152;
    protected $cfg;
    private $deadline,$token='';
    protected function scopes(){return self::SCOPES;}
    public $metrics=array('drive_calls'=>0,'sheets_calls'=>0,'token_calls'=>0,'drive_ms'=>0,'sheets_ms'=>0,'token_ms'=>0,'response_bytes'=>0);
    public function __construct($cfg,$budget=18){$this->cfg=$cfg;$this->deadline=microtime(true)+$budget;}
    public static function valid_id($s){return BVLOG_Direct_Scope::valid_id($s);}
    public static function credentials($filename){
        if(!is_string($filename)||$filename==='')throw new BVLOG_Direct_Error('credential_file');
        $path=realpath($filename);
        if(!$path||!is_file($path)||!is_readable($path)||filesize($path)>32768)
            throw new BVLOG_Direct_Error('credential_file');
        // Require an actual private file outside both WP and the HTTP document root.
        foreach(array(ABSPATH,$_SERVER['DOCUMENT_ROOT']??'') as $root){
            $root=$root?realpath($root):false;
            if($root&&($path===$root||strpos($path,rtrim($root,DIRECTORY_SEPARATOR).DIRECTORY_SEPARATOR)===0))
                throw new BVLOG_Direct_Error('credential_public_path');
        }
        $raw=file_get_contents($path);$c=json_decode($raw,true);
        if(!is_array($c)||($c['type']??'')!=='service_account'||
            !is_string($c['client_email']??null)||!preg_match('/^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+\.gserviceaccount\.com$/D',$c['client_email'])||
            !is_string($c['private_key']??null)||!function_exists('openssl_sign'))
            throw new BVLOG_Direct_Error('credential_format');
        // Fixed Google token URI and read-only scopes; ignore other URLs in JSON.
        return array('email'=>$c['client_email'],'private_key'=>$c['private_key'],
            'fingerprint'=>hash('sha256',$raw),'kid'=>(string)($c['private_key_id']??''));
    }
    public static function check_metadata($file,$doc,$folder,$template){
        $reason=BVLOG_Direct_Scope::metadata_reason($file,$doc,$folder,$template);
        if($reason!=='')throw new BVLOG_Direct_Error('scope_denied',403,$reason);
        $v=$file['version']??'';
        if(!is_string($v)&&!is_int($v))throw new BVLOG_Direct_Error('drive_version');
        if(!preg_match('/^[0-9]{1,30}$/D',(string)$v))throw new BVLOG_Direct_Error('drive_version');
        return array('version'=>(string)$v,'name'=>$file['name']);
    }
    protected function budget(){
        $left=$this->deadline-microtime(true);
        if($left<1)throw new BVLOG_Direct_Error('read_deadline');
        return min(8,$left);
    }
    private function backoff_key(){return 'bvlog_dr_backoff_'.substr($this->cfg['credential']['fingerprint'],0,32);}
    private function request($kind,$url,$args=array()){
        $wait=(int)get_transient($this->backoff_key());
        if($wait>time())throw new BVLOG_Direct_Error('google_backoff',429);
        $args=array_merge(array('timeout'=>$this->budget(),'redirection'=>0,'sslverify'=>true,
            'httpversion'=>'1.1','limit_response_size'=>self::MAX_BYTES,'headers'=>array('Accept'=>'application/json')),$args);
        $start=microtime(true);$this->metrics[$kind.'_calls']++;
        try{
            $r=$kind==='token'?wp_safe_remote_post($url,$args):wp_safe_remote_get($url,$args);
        }finally{$this->metrics[$kind.'_ms']+=(int)round((microtime(true)-$start)*1000);}
        if(is_wp_error($r))throw new BVLOG_Direct_Error('google_transport');
        $status=(int)wp_remote_retrieve_response_code($r);
        $body=(string)wp_remote_retrieve_body($r);$this->metrics['response_bytes']+=strlen($body);
        if($status===429||$status===503){
            $header=wp_remote_retrieve_header($r,'retry-after');
            $seconds=is_scalar($header)&&ctype_digit((string)$header)?(int)$header:10;
            $seconds=max(2,min(120,$seconds))+random_int(0,3);
            set_transient($this->backoff_key(),time()+$seconds,$seconds);
            throw new BVLOG_Direct_Error('google_backoff',429);
        }
        // Never let GAS fallback bypass an access denial (including revoked account).
        if(in_array($status,array(401,403,404),true)){
            delete_transient($this->token_key());
            throw new BVLOG_Direct_Error('google_access_denied',403);
        }
        if($status!==200)throw new BVLOG_Direct_Error('google_http_'.$status);
        if(strlen($body)>=self::MAX_BYTES){
            if($kind==='sheets')BVLOG_Read_Projection::unsupported();
            throw new BVLOG_Direct_Error('response_size');
        }
        $v=json_decode($body,true);
        if(!is_array($v))throw new BVLOG_Direct_Error('google_json');
        return $v;
    }
    private function token_key(){
        $key='bvlog_dr_token_'.substr($this->cfg['credential']['fingerprint'],0,32);
        // Preserve the legacy read token cache; write-scoped tokens can never
        // be used by the read-only transport, even with the same credentials.
        return $this->scopes()===self::SCOPES?$key:$key.'_'.substr(hash('sha256',$this->scopes()),0,16);
    }
    protected function token(){
        if($this->token!=='')return $this->token;
        $key=$this->token_key();$cached=BVLOG_Direct_Crypto::open(get_transient($key),$key);
        if(is_array($cached)&&($cached['expires']??0)>time()+60&&is_string($cached['token']??null))
            return $this->token=$cached['token'];
        $c=$this->cfg['credential'];$now=time();
        $header=array('alg'=>'RS256','typ'=>'JWT');if($c['kid']!=='')$header['kid']=$c['kid'];
        $claims=array('iss'=>$c['email'],'scope'=>$this->scopes(),'aud'=>'https://oauth2.googleapis.com/token',
            'iat'=>$now-5,'exp'=>$now+3500);
        $unsigned=BVLOG_Direct_Crypto::b64(BVLOG_Direct_Crypto::json($header)).'.'.BVLOG_Direct_Crypto::b64(BVLOG_Direct_Crypto::json($claims));
        $signature='';
        if(!openssl_sign($unsigned,$signature,$c['private_key'],OPENSSL_ALGO_SHA256))
            throw new BVLOG_Direct_Error('credential_signing');
        $token=$this->request('token','https://oauth2.googleapis.com/token',array(
            'headers'=>array('Content-Type'=>'application/x-www-form-urlencoded','Accept'=>'application/json'),
            'body'=>array('grant_type'=>'urn:ietf:params:oauth:grant-type:jwt-bearer','assertion'=>$unsigned.'.'.BVLOG_Direct_Crypto::b64($signature))));
        if(strtolower((string)($token['token_type']??''))!=='bearer'||!is_string($token['access_token']??null)||
            !preg_match('/^[A-Za-z0-9._~+\/=-]{10,8192}$/D',$token['access_token'])||
            !is_numeric($token['expires_in']??null)||$token['expires_in']<120)throw new BVLOG_Direct_Error('google_token');
        $ttl=min(3300,(int)$token['expires_in']-60);$this->token=$token['access_token'];
        // Seal token at rest; no credentials in HTML, JS, diagnostics, or Git.
        set_transient($key,BVLOG_Direct_Crypto::seal(array('token'=>$this->token,'expires'=>time()+$ttl),$key),$ttl);
        return $this->token;
    }
    protected function get($kind,$url,$params,$ranges=array()){
        $query=http_build_query($params,'','&',PHP_QUERY_RFC3986);
        foreach($ranges as $range)$query.='&ranges='.rawurlencode($range);
        return $this->request($kind,$url.'?'.$query,array('headers'=>array('Accept'=>'application/json',
            'Authorization'=>'Bearer '.$this->token())));
    }
    public function metadata($doc){
        $reason=BVLOG_Direct_Scope::document_reason($doc,$this->cfg['template']);
        if($reason!=='')throw new BVLOG_Direct_Error('scope_denied',403,$reason);
        return self::check_metadata($this->get('drive','https://www.googleapis.com/drive/v3/files/'.rawurlencode($doc),
            array('fields'=>'id,name,mimeType,trashed,parents,version','supportsAllDrives'=>'true')),
            $doc,$this->cfg['folder'],$this->cfg['template']);
    }
    private function sheet($doc,$fields,$ranges=array()){
        return $this->get('sheets','https://sheets.googleapis.com/v4/spreadsheets/'.rawurlencode($doc),array('fields'=>$fields),$ranges);
    }
    public function check_sheet_access($doc){
        return BVLOG_Read_Projection::sheets($this->sheet($doc,'spreadsheetId,sheets(properties(title,sheetType,gridProperties(rowCount,columnCount)))'),$doc);
    }
    public function read($doc,$tab,$meta){
        $sheets=$this->check_sheet_access($doc);
        $plan=BVLOG_Read_Projection::plan($sheets,$tab);$values=array();$info=array();
        if($plan['ranges']){
            $raw=$this->get('sheets','https://sheets.googleapis.com/v4/spreadsheets/'.rawurlencode($doc).'/values:batchGet',
                array('valueRenderOption'=>'FORMATTED_VALUE','majorDimension'=>'ROWS'),array_values($plan['ranges']));
            $values=BVLOG_Read_Projection::decode_values($raw,$plan,$doc);
        }
        if($tab==='INFO'){
            $range=BVLOG_Read_Projection::info_range($sheets);
            $raw=$range?$this->sheet($doc,'spreadsheetId,sheets(properties(title),data(startRow,startColumn,rowData(values(formattedValue,userEnteredValue,dataValidation(condition(type,values(userEnteredValue)))))))',array($range)):array();
            $info=BVLOG_Read_Projection::info($raw,$sheets,$doc);
        }elseif($tab==='LOG'){
            $range=BVLOG_Read_Projection::legacy_range($values['LOG']??array());
            if($range)BVLOG_Read_Projection::check_legacy($this->sheet($doc,
                'spreadsheetId,sheets(properties(title),data(startRow,startColumn,rowData(values(formattedValue,userEnteredValue,hyperlink,textFormatRuns(format(link)),userEnteredFormat(textFormat(link))))))',
                array($range)),$doc,$values['LOG']);
        }
        return array('ok'=>true,'id'=>$doc,'name'=>$meta['name'],'url'=>'https://docs.google.com/spreadsheets/d/'.$doc.'/edit',
            'loaded_tabs'=>array($tab),'data'=>BVLOG_Read_Projection::project($tab,$sheets,$values,$info));
    }
}

/** Shared cache is a dedicated non-autoloaded SQL table, not an HTTP/CDN cache.
 * One state row and at most four snapshot rows per document. Every hit still
 * requires live Drive authorization. Epoch/active-writer checks are fresh SQL.
 */
final class BVLOG_Read_Cache {
    const SCHEMA=1;
    public static function table(){global $wpdb;return $wpdb->prefix.'bvlog_read_cache';}
    public static function installed(){return (int)get_option('bvlog_read_cache_schema',0)===self::SCHEMA;}
    public static function install(){
        if(self::installed())return;
        global $wpdb;$table=self::table();$collation=$wpdb->get_charset_collate();
        $ok=$wpdb->query("CREATE TABLE IF NOT EXISTS $table (
          id char(64) NOT NULL, doc_key char(64) NOT NULL, kind varchar(8) NOT NULL,
          generation char(32) NOT NULL, body mediumtext NOT NULL, source_version varchar(32) NOT NULL,
          created bigint unsigned NOT NULL, expires bigint unsigned NOT NULL, updated bigint unsigned NOT NULL,
          PRIMARY KEY(id), KEY document_kind (doc_key,kind,expires), KEY expiry (kind,expires)
        ) $collation");
        if($ok!==false)update_option('bvlog_read_cache_schema',self::SCHEMA,false);
    }
    public static function doc_key($doc){return hash('sha256','bvlog-read-v1|'.get_current_blog_id().'|'.$doc);}
    private static function gen(){return bin2hex(random_bytes(16));}
    public static function cleanup(){
        if(!self::installed())return;
        global $wpdb;$table=self::table();
        $wpdb->query($wpdb->prepare("DELETE FROM $table WHERE kind IN ('cache','writer') AND expires<=%d LIMIT 500",time()));
    }
    private static function row($id){
        global $wpdb;$table=self::table();
        $r=$wpdb->get_row($wpdb->prepare("SELECT * FROM $table WHERE id=%s",$id),ARRAY_A);
        if($wpdb->last_error)throw new BVLOG_Direct_Error('cache_storage');
        return $r;
    }
    public static function state($key){
        global $wpdb;$table=self::table();
        if(!self::row($key)){
            $ok=$wpdb->query($wpdb->prepare("INSERT IGNORE INTO $table
              (id,doc_key,kind,generation,body,source_version,created,expires,updated)
              VALUES (%s,%s,'state',%s,'','',%d,0,%d)",$key,$key,self::gen(),time(),time()));
            if($ok===false)throw new BVLOG_Direct_Error('cache_storage');
        }
        $r=$wpdb->get_row($wpdb->prepare("SELECT s.generation,
          EXISTS(SELECT 1 FROM $table w WHERE w.doc_key=s.doc_key AND w.kind='writer' AND w.expires>%d) AS pending
          FROM $table s WHERE s.id=%s AND s.kind='state'",time(),$key),ARRAY_A);
        if(!is_array($r)||!preg_match('/^[a-f0-9]{32}$/D',$r['generation']??''))
            throw new BVLOG_Direct_Error('cache_storage');
        return array('generation'=>$r['generation'],'pending'=>(bool)$r['pending']);
    }
    private static function rotate($key){
        global $wpdb;$table=self::table();
        if($wpdb->query($wpdb->prepare("UPDATE $table SET generation=%s,updated=%d WHERE id=%s AND kind='state'",
            self::gen(),time(),$key))!==1)throw new BVLOG_Direct_Error('cache_storage');
    }
    public static function begin_write($doc){
        $key=self::doc_key($doc);self::state($key);
        global $wpdb;$table=self::table();$id=hash('sha256',$key.'|writer|'.self::gen());$now=time();
        $ok=$wpdb->query($wpdb->prepare("INSERT INTO $table
          (id,doc_key,kind,generation,body,source_version,created,expires,updated)
          VALUES (%s,%s,'writer','','','',%d,%d,%d)",$id,$key,$now,$now+600,$now));
        if($ok!==1)throw new BVLOG_Direct_Error('cache_storage');
        self::rotate($key);return array('id'=>$id,'key'=>$key);
    }
    public static function clear_direct_writers($key){
        // Only under the fenced incident's SQL writer lock, after reconciliation.
        self::rotate($key);
        global $wpdb;$table=self::table();
        if($wpdb->query($wpdb->prepare("DELETE FROM $table WHERE doc_key=%s AND kind='writer'",$key))===false)
            throw new BVLOG_Direct_Error('cache_storage');
    }
    public static function end_write($guard,$confirmed){
        // On uncertain commit/timeouts, keep the writer marker until expiry.
        // Ordinary reads then use live authorized GAS, never the shared cache.
        self::rotate($guard['key']);
        if($confirmed){
            global $wpdb;$table=self::table();
            if($wpdb->query($wpdb->prepare("DELETE FROM $table WHERE id=%s AND kind='writer'",$guard['id']))===false)
                throw new BVLOG_Direct_Error('cache_storage');
        }
    }
    public static function stable($before,$after){
        return !$before['pending']&&!$after['pending']&&hash_equals($before['generation'],$after['generation']);
    }
    private static function id($key,$tab){return hash('sha256',$key.'|'.$tab);}
    public static function usable($row,$state,$version,$now){
        return is_array($row)&&!$state['pending']&&($row['kind']??'')==='cache'&&
            ($row['generation']??'')===$state['generation']&&($row['source_version']??'')===$version&&
            (int)($row['expires']??0)>$now&&(int)($row['created']??0)<=$now;
    }
    public static function get($key,$tab,$scope,$state,$version){
        $id=self::id($key,$tab);$row=self::row($id);
        if(!self::usable($row,$state,$version,time()))return null;
        $data=BVLOG_Direct_Crypto::open($row['body'],$id.'|'.$scope);
        if(!is_array($data)||($data['scope']??'')!==$scope||!is_array($data['result']??null))return null;
        // Authentication of the serialized body binds both its scope and epoch.
        if(($data['version']??'')!==$version||($data['generation']??'')!==$state['generation']||
            ($data['created']??0)!==(int)$row['created'])return null;
        return array('result'=>$data['result'],'created'=>(int)$row['created']);
    }
    public static function put($key,$tab,$scope,$state,$version,$result,$created,$ttl){
        if($ttl<=0)return;
        $id=self::id($key,$tab);$body=BVLOG_Direct_Crypto::seal(array('scope'=>$scope,'version'=>$version,
            'generation'=>$state['generation'],'created'=>$created,'result'=>$result),$id.'|'.$scope);
        if(strlen($body)>1500000)BVLOG_Read_Projection::unsupported();
        global $wpdb;$table=self::table();
        $ok=$wpdb->query($wpdb->prepare("INSERT INTO $table
            (id,doc_key,kind,generation,body,source_version,created,expires,updated)
            VALUES (%s,%s,'cache',%s,%s,%s,%d,%d,%d)
            ON DUPLICATE KEY UPDATE generation=VALUES(generation),body=VALUES(body),
              source_version=VALUES(source_version),created=VALUES(created),expires=VALUES(expires),updated=VALUES(updated)",
            $id,$key,$state['generation'],$body,$version,$created,$created+$ttl,time()));
        if($ok===false)throw new BVLOG_Direct_Error('cache_storage');
    }
    public static function lock($key){
        global $wpdb;$name='bvlog_r_'.substr($key,0,48);
        if((string)$wpdb->get_var($wpdb->prepare("SELECT GET_LOCK(%s,2)",$name))!=='1')
            throw new BVLOG_Direct_Error('read_busy');
        return $name;
    }
    public static function unlock($name){
        global $wpdb;$wpdb->get_var($wpdb->prepare("SELECT RELEASE_LOCK(%s)",$name));
    }
}
