<?php
if (!defined('ABSPATH')) { exit; }

/** Google Identity Services sign-in, server-side RS256 JWT validation and app session. */
class BVLOG_Auth {
    const COOKIE = 'bvlog_google_session';
    const CHALLENGE = 'bvlog_login_challenge';
    const TTL = 43200; // 12 hours; no permanent browser bearer tokens.

    private static function settings() { return bvlog_settings(); }
    public static function mode() {
        $s = self::settings();
        // Legacy public access is used ONLY when the administrator selects public mode.
        return in_array(($s['auth_mode'] ?? 'google'), array('google','public','wordpress'), true) ? $s['auth_mode'] : 'google';
    }
    public static function wp_identity() {
        if (!is_user_logged_in()) return null;
        $s=self::settings();
        if (!current_user_can('manage_options')) {
            $roles=(array)wp_get_current_user()->roles;
            $allowed=array_filter(array_map('trim',explode(',', $s['roles'] ?? '')));
            if (!array_intersect($roles,$allowed)) return null;
        }
        $u=wp_get_current_user();
        return array('kind'=>'wordpress','sub'=>'wp:'.$u->ID,'email'=>$u->user_email,'name'=>$u->display_name);
    }
    private static function b64dec($text) {
        if (!is_string($text) || !preg_match('/^[A-Za-z0-9_-]*$/D', $text)) return false;
        return base64_decode(strtr($text, '-_', '+/'), true);
    }
    private static function b64enc($text) { return rtrim(strtr(base64_encode($text), '+/', '-_'), '='); }
    private static function sign($body) { return self::b64enc(hash_hmac('sha256', $body, wp_salt('auth'), true)); }
    private static function cookie_params($expires) {
        return array('expires'=>$expires,'path'=>'/','secure'=>true,'httponly'=>true,'samesite'=>'Lax');
    }
    private static function google_session() {
        $raw=(string)($_COOKIE[self::COOKIE] ?? '');
        if (strlen($raw)>5000 || substr_count($raw,'.')!==1) return null;
        list($body,$mac)=explode('.', $raw, 2);
        if (!hash_equals(self::sign($body),$mac)) return null;
        $payload=json_decode(self::b64dec($body),true);
        if (!is_array($payload)||($payload['exp']??0)<time()||empty($payload['sub'])||empty($payload['csrf'])) return null;
        if (self::mode()!=='google') return null;
        // Revocation in WordPress settings immediately invalidates an existing session.
        $s=self::settings();
        $allowed=array_filter(array_map('trim',preg_split('/[,;\s]+/',strtolower($s['google_allowed_emails']??''))));
        if(empty($s['google_allow_any'])&&!in_array(strtolower($payload['email']??''),$allowed,true))return null;
        return $payload;
    }
    public static function identity() {
        $mode=self::mode();
        if ($mode==='public') return self::wp_identity() ?: array('kind'=>'public','name'=>'','sub'=>'public');
        $id=self::wp_identity();
        return $id ?: ($mode==='google' ? self::google_session() : null);
    }
    public static function csrf() {
        $id=self::identity();
        return $id && ($id['kind']??'')==='google' ? $id['csrf'] : null;
    }
    public static function authorize($request) {
        $identity=self::identity();
        if (!$identity) return new WP_Error('bvlog_login_required','Google login required.',array('status'=>401));
        $method=strtoupper($request->get_method());
        if ($method!=='GET' && ($identity['kind']??'')==='google') {
            $sent=(string)$request->get_header('X-BVLOG-CSRF');
            if (!$sent || !hash_equals((string)$identity['csrf'],$sent)) {
                return new WP_Error('bvlog_bad_csrf','Session verification failed. Refresh and sign in again.',array('status'=>403));
            }
        }
        return true;
    }
    public static function session($request=null) {
        // Background identity checks must not replace the login CSRF cookie.
        // Reuse an existing unexpired browser cookie across foreground tabs.
        $background=$request && (string)$request->get_param('background')==='1';
        $challenge='';
        if (!$background) {
            $existing=(string)($_COOKIE[self::CHALLENGE]??'');
            if (preg_match('/^[a-f0-9]{40}$/D',$existing)) {
                $challenge=$existing;
            } else {
                $challenge=bin2hex(random_bytes(20));
                setcookie(self::CHALLENGE,$challenge,self::cookie_params(time()+600));
            }
        }
        $identity=self::identity();
        return rest_ensure_response(array(
            'authenticated'=>($identity!==null),
            'identity'=>$identity ? array('kind'=>$identity['kind'],'name'=>$identity['name']??'','email'=>$identity['email']??'','sub'=>$identity['sub']??'') : null,
            'csrf'=>self::csrf(), 'login_challenge'=>$challenge,
            'mode'=>self::mode(),
            'google_client_id'=>self::settings()['google_client_id'] ?? ''
        ));
    }
    private static function der_len($len) {
        if ($len<128) return chr($len);
        $b='';while($len>0){$b=chr($len&255).$b;$len>>=8;}
        return chr(0x80|strlen($b)).$b;
    }
    private static function der_int($bytes) {
        $bytes=ltrim($bytes,"\x00");if($bytes==='')$bytes="\x00";
        if(ord($bytes[0])&128)$bytes="\x00".$bytes;
        return "\x02".self::der_len(strlen($bytes)).$bytes;
    }
    private static function rsa_pem($n,$e) {
        $n=self::b64dec($n);$e=self::b64dec($e);
        if ($n===false||$e===false || strlen($n)<128 || strlen($n)>600 || strlen($e)>8) return false;
        $parts=self::der_int($n).self::der_int($e);
        $rsa="\x30".self::der_len(strlen($parts)).$parts;
        $oid="\x30\x0d\x06\x09\x2a\x86\x48\x86\xf7\x0d\x01\x01\x01\x05\x00";
        $bit="\x03".self::der_len(strlen($rsa)+1)."\x00".$rsa;
        $seq="\x30".self::der_len(strlen($oid.$bit)).$oid.$bit;
        return "-----BEGIN PUBLIC KEY-----\n".chunk_split(base64_encode($seq),64,"\n")."-----END PUBLIC KEY-----\n";
    }
    private static function jwks($force=false) {
        if (!$force) { $cached=get_transient('bvlog_google_jwks_v1');if(is_array($cached))return $cached; }
        $r=wp_remote_get('https://www.googleapis.com/oauth2/v3/certs',array('timeout'=>10,'redirection'=>1,'sslverify'=>true));
        if (is_wp_error($r)||wp_remote_retrieve_response_code($r)!==200) return array();
        $raw=json_decode(wp_remote_retrieve_body($r),true);
        $keys=isset($raw['keys'])&&is_array($raw['keys'])?$raw['keys']:array();
        if ($keys) set_transient('bvlog_google_jwks_v1',$keys,HOUR_IN_SECONDS);
        return $keys;
    }
    private static function verify_id_token($jwt,$client_id) {
        if (!is_string($jwt)||strlen($jwt)>12000||substr_count($jwt,'.')!==2||!function_exists('openssl_verify'))return null;
        $segments=explode('.',$jwt);
        $header=json_decode(self::b64dec($segments[0]),true);
        $claims=json_decode(self::b64dec($segments[1]),true);
        $signature=self::b64dec($segments[2]);
        if (!is_array($header)||!is_array($claims)||$signature===false||($header['alg']??'')!=='RS256'||empty($header['kid']))return null;
        $keys=self::jwks();
        for($pass=0;$pass<2;$pass++){
            foreach($keys as $key){
                if (($key['kid']??'')!==$header['kid']||($key['kty']??'')!=='RSA'||!isset($key['n'],$key['e']))continue;
                $pem=self::rsa_pem($key['n'],$key['e']);
                if (!$pem||openssl_verify($segments[0].'.'.$segments[1],$signature,$pem,OPENSSL_ALGO_SHA256)!==1)return null;
                $iss=$claims['iss']??'';
                if (!in_array($iss,array('https://accounts.google.com','accounts.google.com'),true))return null;
                if (($claims['aud']??'')!==$client_id||($claims['exp']??0)<time()||($claims['iat']??0)>time()+120)return null;
                if (empty($claims['sub']) || !preg_match('/^[0-9]{6,40}$/',(string)$claims['sub']))return null;
                if (empty($claims['email']) || !filter_var($claims['email'],FILTER_VALIDATE_EMAIL))return null;
                if (!in_array(($claims['email_verified']??false),array(true,'true',1),true))return null;
                return $claims;
            }
            $keys=self::jwks(true);
        }
        return null;
    }
    public static function login($request) {
        if (self::mode()!=='google')return new WP_Error('bvlog_mode','Google sign-in is disabled.',array('status'=>403));
        $s=self::settings();$client=trim($s['google_client_id']??'');
        if (!preg_match('/^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/',$client))return new WP_Error('bvlog_google_config','Google Client ID is missing or invalid.',array('status'=>503));
        $sent=(string)$request->get_header('X-BVLOG-LOGIN');
        $expected=(string)($_COOKIE[self::CHALLENGE]??'');
        if (!preg_match('/^[a-f0-9]{40}$/D',$sent)||!preg_match('/^[a-f0-9]{40}$/D',$expected)||!hash_equals($expected,$sent))return new WP_Error('bvlog_login_csrf','Refresh the page before signing in.',array('status'=>403));
        $visitor=md5((string)($_SERVER['REMOTE_ADDR']??'guest'));
        $ratekey='bvlog_google_login_'.$visitor;
        $attempts=(int)get_transient($ratekey);
        if($attempts>=12)return new WP_Error('bvlog_login_limited','Too many login attempts. Try again later.',array('status'=>429));
        set_transient($ratekey,$attempts+1,MINUTE_IN_SECONDS);
        $p=(array)$request->get_json_params();
        $claims=self::verify_id_token((string)($p['credential']??''),$client);
        if (!$claims)return new WP_Error('bvlog_google_token','Google identity token verification failed.',array('status'=>401));
        $email=strtolower($claims['email']);
        $allow=array_filter(array_map('trim',preg_split('/[,;\s]+/',strtolower($s['google_allowed_emails']??''))));
        if (empty($s['google_allow_any'])&&!in_array($email,$allow,true))return new WP_Error('bvlog_not_approved','This Google account is not on the approved operator list.',array('status'=>403));
        $profile=array('kind'=>'google','sub'=>(string)$claims['sub'],'email'=>$email,
            'name'=>sanitize_text_field($claims['name']??$email),'csrf'=>bin2hex(random_bytes(24)),
            'exp'=>time()+self::TTL);
        $body=self::b64enc(wp_json_encode($profile));
        setcookie(self::COOKIE,$body.'.'.self::sign($body),self::cookie_params($profile['exp']));
        setcookie(self::CHALLENGE,'',array('expires'=>time()-3600,'path'=>'/','secure'=>true,'httponly'=>true,'samesite'=>'Lax'));
        return rest_ensure_response(array('ok'=>true,'identity'=>array('kind'=>'google','name'=>$profile['name'],'email'=>$email,'sub'=>$profile['sub']),'csrf'=>$profile['csrf']));
    }
    public static function logout($request) {
        $id=self::identity();
        if ($id && ($id['kind']??'')==='google') {
            $sent=(string)$request->get_header('X-BVLOG-CSRF');
            if (!$sent||!hash_equals($id['csrf'],$sent))return new WP_Error('bvlog_bad_csrf','Invalid sign-out request.',array('status'=>403));
            setcookie(self::COOKIE,'',self::cookie_params(time()-3600));
        }
        return rest_ensure_response(array('ok'=>true));
    }
}
