<?php
if (!defined('ABSPATH')) { exit; }

class BVLOG_API {
    private static $bridge_request_id = '';

    /** Diagnostic classification only: do not log submitted text or Drive URLs. */
    private static function diagnostic_action($action, $payload) {
        if ($action === 'operation' && is_array($payload)) {
            if (($payload['kind'] ?? '') === 'photo') return 'photo_write';
            if (($payload['kind'] ?? '') === 'audio_part') return 'audio_write';
        }
        return $action;
    }

    /** Return only a safe error category; never store remote URLs or credentials. */
    private static function transport_hint($error, $seconds) {
        if (!is_wp_error($error)) return 'unknown';
        $code = sanitize_key($error->get_error_code());
        $raw = (string)$error->get_error_message();
        $hint = '';
        if (preg_match('/cURL error\s+(\d+)/i', $raw, $m)) $hint = 'curl_' . $m[1];
        if (stripos($raw, 'timed out') !== false || stripos($raw, 'timeout') !== false) $hint .= '_timeout';
        elseif (stripos($raw, 'resolve host') !== false || stripos($raw, 'resolve proxy') !== false) $hint .= '_dns';
        elseif (stripos($raw, 'SSL') !== false || stripos($raw, 'certificate') !== false) $hint .= '_tls';
        return substr($code . ($hint ? ':' . trim($hint, '_') : '') . ':limit_' . (int)$seconds . 's', 0, 100);
    }
    public static function register_routes() {
        register_rest_route('bvlog/v1','/auth/session',array('methods'=>'GET','permission_callback'=>'__return_true','callback'=>array('BVLOG_Auth','session')));
        register_rest_route('bvlog/v1','/auth/google',array('methods'=>'POST','permission_callback'=>'__return_true','callback'=>array('BVLOG_Auth','login')));
        register_rest_route('bvlog/v1','/auth/logout',array('methods'=>'POST','permission_callback'=>'__return_true','callback'=>array('BVLOG_Auth','logout')));
        $opts = array('permission_callback' => array(__CLASS__, 'authorize'));
        register_rest_route('bvlog/v1', '/config', array_merge($opts, array(
            'methods' => 'GET', 'callback' => array(__CLASS__, 'config')
        )));
        register_rest_route('bvlog/v1', '/documents', array(
            array_merge($opts, array('methods' => 'GET', 'callback' => array(__CLASS__, 'documents'))),
            array_merge($opts, array('methods' => 'POST', 'callback' => array(__CLASS__, 'create_document'))),
        ));
        register_rest_route('bvlog/v1', '/document/(?P<id>[A-Za-z0-9_-]+)', array_merge($opts, array(
            'methods' => 'GET', 'callback' => array(__CLASS__, 'document')
        )));
        register_rest_route('bvlog/v1', '/operation', array_merge($opts, array(
            'methods' => 'POST', 'callback' => array(__CLASS__, 'operation')
        )));
        register_rest_route('bvlog/v1', '/audio', array_merge($opts, array(
            'methods' => 'POST', 'callback' => array(__CLASS__, 'audio')
        )));
        register_rest_route('bvlog/v1', '/audio-view', array_merge($opts, array(
            'methods' => 'GET', 'callback' => array(__CLASS__, 'audio_view')
        )));
        register_rest_route('bvlog/v1', '/audio-stream', array_merge($opts, array(
            'methods' => 'GET, HEAD', 'callback' => array(__CLASS__, 'audio_stream')
        )));
        register_rest_route('bvlog/v1', '/photo', array_merge($opts, array(
            'methods' => 'POST', 'callback' => array(__CLASS__, 'photo')
        )));
        register_rest_route('bvlog/v1', '/photo-view', array_merge($opts, array(
            'methods' => 'GET', 'callback' => array(__CLASS__, 'photo_view')
        )));
        register_rest_route('bvlog/v1', '/health', array_merge($opts, array(
            'methods' => 'GET', 'callback' => array(__CLASS__, 'health')
        )));
    }
    /**
     * Anonymous mode is explicitly opt-in at the settings page. A light per-visitor
     * throttle limits accidental floods; this is NOT a replacement for identity.
     */
    public static function authorize($request) {
        $auth=BVLOG_Auth::authorize($request);
        if (is_wp_error($auth)) return $auth;
        // Apply a lightweight rate limit to all guests, including Google operators.
        $identity=BVLOG_Auth::identity();
        if ($identity && ($identity['kind'] ?? '')==='wordpress') return true;
        $route=$request->get_route();
        $method=strtoupper($request->get_method());
        $scope='read';$window=60;$max=120;
        if ($method!=='GET' && preg_match('~/documents$~',$route)){$scope='create';$window=3600;$max=10;}
        elseif ($method!=='GET' && preg_match('~/photo$~',$route)){$scope='media';$window=3600;$max=100;}
        elseif ($method!=='GET'){$scope='write';$window=60;$max=45;}
        $visitor=($identity['sub']??'guest').':'.(string)($_SERVER['REMOTE_ADDR']??'');
        $key='bvlog_rl_'.md5($scope.'|'.$visitor);
        $now=time();$state=get_transient($key);
        if(!is_array($state)||empty($state['until'])||$state['until']<=$now){$state=array('count'=>0,'until'=>$now+$window);}
        if($state['count']>=$max)return new WP_Error('bvlog_rate_limit','Too many requests. Retry shortly.',array('status'=>429));
        $state['count']++;
        set_transient($key,$state,max(1,$state['until']-$now));
        return true;
    }
    public static function config() {
        $s = bvlog_settings();
        return rest_ensure_response(array(
            'configured' => !empty($s['script_url']) && self::secret_present(),
            'current_user' => (BVLOG_Auth::identity()['name'] ?? 'Guest'),
            'timezone' => 'Europe/Sofia',
        ));
    }
    public static function secret_present() {
        return (defined('BVLOG_SHARED_SECRET') && BVLOG_SHARED_SECRET) || get_option('bvlog_shared_secret', false);
    }
    /**
     * Save a sanitized, secret-free diagnostic snapshot for the site administrator.
     * In particular, never persist the POST body or Google's signed redirect URL.
     */
    private static function trace($action, $stage, $started, $http_status = 0, $detail = '') {
        $snapshot = array(
            'time_utc' => gmdate('Y-m-d H:i:s'),
            'request_id' => self::$bridge_request_id,
            'action' => (string)$action,
            'stage' => (string)$stage,
            'elapsed_ms' => (int)round((microtime(true) - $started) * 1000),
            'http_status' => (int)$http_status,
            'detail' => preg_replace('/[^A-Za-z0-9_.:-]/', '_', substr((string)$detail, 0, 100)),
        );
        update_option('bvlog_bridge_diagnostics', $snapshot, false);
        // Preserve terminal outcomes even when a later successful request replaces
        // the last-diagnostics snapshot. Only fixed action/stage/timing metadata.
        $terminal = array('complete','post_transport_error','get_transport_error',
            'invalid_json','invalid_redirect','http_error','not_configured','invalid_endpoint');
        if (in_array($stage, $terminal, true) &&
            in_array($action, array('list','read','operation','create'), true)) {
            $history = get_option('bvlog_bridge_request_history', array());
            if (!is_array($history)) $history = array();
            array_unshift($history, $snapshot);
            update_option('bvlog_bridge_request_history', array_slice($history, 0, 30), false);
        }
        // Keep a short secret-free history for media timings. Do not record
        // payloads, usernames, operational data or signed Google redirect URLs.
        if (in_array($action, array('audio_read','audio_write','photo_read','photo_write'), true) &&
            in_array($stage, array('complete','post_transport_error','get_transport_error',
                'invalid_json','invalid_redirect','http_error','not_configured','invalid_endpoint'), true)) {
            $history = get_option('bvlog_bridge_media_history', array());
            if (!is_array($history)) $history = array();
            array_unshift($history, $snapshot);
            update_option('bvlog_bridge_media_history', array_slice($history, 0, 15), false);
        }
    }

    public static function forward($action, $payload = array()) {
        $started = microtime(true);
        self::$bridge_request_id = substr(str_replace('-', '', wp_generate_uuid4()), 0, 12);
        $diag_action = self::diagnostic_action($action, $payload);
        $s = bvlog_settings();
        $secret = defined('BVLOG_SHARED_SECRET') ? BVLOG_SHARED_SECRET : get_option('bvlog_shared_secret', '');
        if (empty($s['script_url']) || !$secret) {
            self::trace($diag_action, 'not_configured', $started);
            return new WP_Error('bvlog_not_configured', 'Google Apps Script URL or shared secret is missing.', array('status' => 503));
        }
        $target = wp_parse_url($s['script_url']);
        if (!is_array($target) || ($target['scheme'] ?? '') !== 'https' || ($target['host'] ?? '') !== 'script.google.com'
            || !preg_match('~^/macros/s/[A-Za-z0-9_-]+/exec$~', $target['path'] ?? '')) {
            self::trace($diag_action, 'invalid_endpoint', $started);
            return new WP_Error('bvlog_invalid_endpoint', 'Apps Script Web App URL is invalid.', array('status' => 400));
        }

        $body = array(
            'secret' => $secret, 'action' => $action,
            'request_id' => self::$bridge_request_id,
            'folder_id' => $s['folder_id'], 'template_id' => $s['template_id'],
            'payload' => $payload,
        );
        $image_read = ($diag_action === 'photo_read');
        $max_response = ($image_read || $diag_action === 'list') ? 5 * 1024 * 1024 : 1024 * 1024;
        // Explicit budgets protect normal journal writes from long hangs while
        // giving slower Google Drive media calls time to complete.
        $request_timeout = 15;
        $redirect_timeout = 12;
        if ($diag_action === 'read') { $request_timeout = 35; $redirect_timeout = 15; }
        if ($diag_action === 'audio_read') { $request_timeout = 45; $redirect_timeout = 25; }
        elseif ($diag_action === 'photo_read') { $request_timeout = 35; $redirect_timeout = 25; }
        elseif ($diag_action === 'photo_write' || $diag_action === 'audio_write') {
            $request_timeout = 35; $redirect_timeout = 20;
        }
        self::trace($diag_action, 'post_start', $started);
        // Google Apps Script ContentService returns a 302 to a one-time URL.
        // Handle that explicitly, using GET and WITHOUT forwarding credentials.
        $response = wp_remote_post($s['script_url'], array(
            'headers' => array('Content-Type' => 'application/json; charset=utf-8', 'Accept' => 'application/json'),
            'body' => wp_json_encode($body),
            'timeout' => $request_timeout,
            'redirection' => 0,
            'httpversion' => '1.1',
            'sslverify' => true,
            'limit_response_size' => $max_response,
        ));
        if (is_wp_error($response)) {
            self::trace($diag_action, 'post_transport_error', $started, 0, self::transport_hint($response, $request_timeout));
            return new WP_Error('bvlog_transport', 'Google POST failed: ' . $response->get_error_code() . '. See bridge diagnostics in WordPress settings.', array('status' => 424));
        }
        $status = (int)wp_remote_retrieve_response_code($response);
        self::trace($diag_action, 'post_response', $started, $status);

        if (in_array($status, array(301, 302, 303), true)) {
            $location = wp_remote_retrieve_header($response, 'location');
            // Restrict the credential-free follow-up to Google's documented redirect host.
            $parts = is_string($location) ? wp_parse_url($location) : false;
            if (!is_array($parts) || ($parts['scheme'] ?? '') !== 'https'
                || ($parts['host'] ?? '') !== 'script.googleusercontent.com'
                || isset($parts['user']) || isset($parts['pass']) || isset($parts['port'])) {
                self::trace($diag_action, 'invalid_redirect', $started, $status);
                return new WP_Error('bvlog_google_redirect', 'Google returned an unexpected redirect target.', array('status' => 424));
            }
            self::trace($diag_action, 'get_start', $started, $status);
            $response = wp_safe_remote_get($location, array(
                'headers' => array('Accept' => 'application/json'),
                'timeout' => $redirect_timeout,
                'redirection' => 0,
                'httpversion' => '1.1',
                'sslverify' => true,
                'limit_response_size' => $max_response,
            ));
            if (is_wp_error($response)) {
                self::trace($diag_action, 'get_transport_error', $started, 0, self::transport_hint($response, $redirect_timeout));
                return new WP_Error('bvlog_transport', 'Google redirect GET failed: ' . $response->get_error_code() . '. See bridge diagnostics in WordPress settings.', array('status' => 424));
            }
            $status = (int)wp_remote_retrieve_response_code($response);
            self::trace($diag_action, 'get_response', $started, $status);
        }

        $raw = wp_remote_retrieve_body($response);
        if ($status < 200 || $status > 299) {
            self::trace($diag_action, 'http_error', $started, $status);
            return new WP_Error('bvlog_google_http', 'Google bridge returned HTTP ' . $status . '. Check WordPress bridge diagnostics.', array('status' => 424));
        }
        $data = json_decode($raw, true);
        if (!is_array($data)) {
            self::trace($diag_action, 'invalid_json', $started, $status, 'json_' . json_last_error());
            return new WP_Error('bvlog_invalid_json', 'Google response is not JSON. Check bridge diagnostics.', array('status' => 424));
        }
        self::trace($diag_action, 'complete', $started, $status, isset($data['ok']) && !$data['ok'] ? 'google_rejected' : 'ok');
        if (isset($data['ok']) && !$data['ok']) {
            return rest_ensure_response(array(
                'ok' => false,
                'code' => sanitize_key($data['code'] ?? 'google_error'),
                'message' => sanitize_text_field($data['message'] ?? 'Google request failed'),
                'current' => $data['current'] ?? null,
                'row' => $data['row'] ?? null,
            ));
        }
        return rest_ensure_response($data);
    }
    public static function documents() { return self::forward('list'); }
    public static function health() { return self::forward('ping'); }
    public static function create_document($request) {
        $p = (array)$request->get_json_params();
        $type = sanitize_text_field($p['type'] ?? '');
        $place = sanitize_text_field($p['place'] ?? '');
        $date_provided = array_key_exists('incident_date', $p);
        $incident_date = $date_provided && is_string($p['incident_date']) ? trim($p['incident_date']) : '';
        if ($date_provided && (!preg_match('/^\d{4}-\d{2}-\d{2}$/D', $incident_date) ||
            !checkdate((int)substr($incident_date, 5, 2), (int)substr($incident_date, 8, 2), (int)substr($incident_date, 0, 4)))) {
            return new WP_Error('bvlog_invalid_date', 'Invalid incident date (YYYY-MM-DD).', array('status' => 400));
        }
        if (!$type || !$place || (function_exists('mb_strlen') ? mb_strlen($type) : strlen($type)) > 60 || (function_exists('mb_strlen') ? mb_strlen($place) : strlen($place)) > 100) {
            return new WP_Error('bvlog_invalid', 'Action type and location are required (max 60 / 100 characters).', array('status' => 400));
        }
        return self::forward('create', array('type' => $type, 'place' => $place, 'incident_date' => $incident_date, 'create_id' => sanitize_text_field($p['create_id'] ?? '')));
    }
    public static function document($request) {
        return self::forward('read', array('doc_id' => sanitize_text_field($request['id'])));
    }
    private static function operation_author($payload) {
        $identity=BVLOG_Auth::identity();
        if ($identity && ($identity['kind'] ?? '')!=='public') return substr(sanitize_text_field($identity['name'] ?? ''),0,80);
        $name=trim(sanitize_text_field($payload['author']??''));
        return $name!==''?substr($name,0,80):'Guest operator';
    }
    public static function audio_view($request) {
        $doc = sanitize_text_field((string)$request->get_param('doc_id'));
        $id = sanitize_text_field((string)$request->get_param('audio_id'));
        $offset = absint($request->get_param('offset') ?? 0);
        if (!preg_match('/^[A-Za-z0-9_-]{15,200}$/',$doc) || !preg_match('/^[a-f0-9-]{32,50}$/i',$id))
            return new WP_Error('bvlog_audio_ref','Invalid audio reference.',array('status'=>400));
        return self::forward('audio_read',array('doc_id'=>$doc,'audio_id'=>$id,'offset'=>$offset));
    }
    /**
     * Authenticated same-origin native audio playback. A single bounded Range
     * can be served without downloading the entire file to the browser.
     * Every request goes through the existing authorization + folder checks.
     */
    public static function audio_stream($request) {
        $doc = sanitize_text_field((string)$request->get_param('doc_id'));
        $id = sanitize_text_field((string)$request->get_param('audio_id'));
        if (!preg_match('/^[A-Za-z0-9_-]{15,200}$/D',$doc) || !preg_match('/^[a-f0-9-]{32,50}$/iD',$id))
            return new WP_Error('bvlog_audio_ref','Invalid audio reference.',array('status'=>400));
        $range = trim((string)$request->get_header('Range'));
        $head = strtoupper($request->get_method()) === 'HEAD';
        $limit = 524288; $max = 8 * 1024 * 1024;
        $start = 0; $end = $limit - 1; $suffix = 0;
        $base = array('doc_id'=>$doc,'audio_id'=>$id);
        $headers = array('Cache-Control'=>'private, no-store, no-cache, must-revalidate, max-age=0',
            'Pragma'=>'no-cache','Accept-Ranges'=>'bytes','X-Content-Type-Options'=>'nosniff',
            'Cross-Origin-Resource-Policy'=>'same-origin','Referrer-Policy'=>'no-referrer');
        if ($range !== '') {
            if (!preg_match('/^bytes=([0-9]{0,9})-([0-9]{0,9})$/D',$range,$m) ||
                ($m[1]==='' && $m[2]===''))
                return new WP_Error('bvlog_audio_range','Invalid or multiple audio ranges.',array('status'=>416));
            if ($m[1]==='') { $suffix=(int)$m[2]; if($suffix<1)return new WP_Error('bvlog_audio_range','Invalid suffix.',array('status'=>416)); }
            else {
                $start=(int)$m[1];
                $end=$m[2]===''?$start+$limit-1:min((int)$m[2],$start+$limit-1);
                if ($start>=$max || $end<$start)
                    return new WP_Error('bvlog_audio_range','Range not satisfiable.',array('status'=>416));
            }
        }
        $mime_types = array('audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav','audio/x-wav');
        // Suffix/HEAD require authoritative total size; also works with old GAS
        // which ignores meta_only and returns the first chunk.
        if ($head || $suffix) {
            $meta=self::forward('audio_read',array_merge($base,array('offset'=>0,'meta_only'=>true)));
            if(is_wp_error($meta))return $meta;
            $m=$meta->get_data();$size=(int)($m['size']??0);$mime=(string)($m['mime']??'');
            if(empty($m['ok'])||$size<1||$size>$max||!in_array($mime,$mime_types,true))
                return new WP_Error('bvlog_audio_missing','Audio unavailable.',array('status'=>404));
            if($head)return new WP_REST_Response('',200,array_merge($headers,array('Content-Type'=>$mime,'Content-Length'=>(string)$size)));
            $start=max(0,$size-$suffix);$end=min($size-1,$start+$limit-1);
        }
        $result=self::forward('audio_read',array_merge($base,array('offset'=>$start,'length'=>$end-$start+1)));
        if(is_wp_error($result))return $result;
        $data=$result->get_data();
        if(empty($data['ok'])) {
            // Obtain size only for an unsatisfiable range, not on each request.
            if(($data['code']??'')==='audio_size' && $range!==''){
                $meta=self::forward('audio_read',array_merge($base,array('offset'=>0,'meta_only'=>true)));
                if(!is_wp_error($meta)){
                    $m=$meta->get_data();$size=(int)($m['size']??0);
                    if(!empty($m['ok'])&&$size>0&&$size<=$max&&$start>=$size)
                        return new WP_REST_Response(null,416,array_merge($headers,array('Content-Range'=>'bytes */'.$size)));
                }
            }
            return new WP_Error('bvlog_audio_missing','Audio unavailable.',array('status'=>404));
        }
        $size=(int)($data['size']??0);$next=(int)($data['next']??0);$mime=(string)($data['mime']??'');
        $bytes=base64_decode((string)($data['base64']??''),true);
        if($size<1||$size>$max||!in_array($mime,$mime_types,true)||!isset($data['offset'])||
            (int)$data['offset']!==$start||$next<$start||$next>$size||$bytes===false||
            strlen($bytes)!==$next-$start||strlen($bytes)>$limit)
            return new WP_Error('bvlog_audio_invalid','Invalid audio response.',array('status'=>424));
        if($start>=$size)
            return new WP_REST_Response(null,416,array_merge($headers,array('Content-Range'=>'bytes */'.$size)));
        $expected=min($end,$size-1)-$start+1;
        // A legacy GAS response may contain more bytes than requested (e.g. iOS 0-1).
        if(strlen($bytes)<$expected)return new WP_Error('bvlog_audio_invalid','Incomplete audio response.',array('status'=>424));
        $bytes=substr($bytes,0,$expected);
        $headers['Content-Type']=$mime;$headers['Content-Length']=(string)strlen($bytes);
        if($range!==''){
            $headers['Content-Range']='bytes '.$start.'-'.($start+strlen($bytes)-1).'/'.$size;
            return new WP_REST_Response($bytes,206,$headers);
        }
        // No-Range clients can play small files directly; larger files use the
        // existing full-download fallback rather than a misleading truncated 200.
        if(strlen($bytes)!==$size)
            return new WP_Error('bvlog_audio_range_required','Use Range or full audio download.',array('status'=>400));
        return new WP_REST_Response($bytes,200,$headers);
    }
    public static function serve_audio_stream($served,$result,$request,$server) {
        if($served || $request->get_route()!=='/bvlog/v1/audio-stream' ||
            !in_array($result->get_status(),array(200,206),true))return $served;
        $bytes=$result->get_data();
        if(!is_string($bytes))return $served;
        if(strtoupper($request->get_method())!=='HEAD')echo $bytes;
        return true;
    }
    public static function audio($request) {
        $p=(array)$request->get_json_params();
        $id=sanitize_text_field($p['doc_id']??'');$op=sanitize_text_field($p['op_id']??'');
        $target=sanitize_text_field($p['target_id']??'');
        $mime=sanitize_text_field($p['mime']??'');
        $part=isset($p['part_index'])?filter_var($p['part_index'],FILTER_VALIDATE_INT):false;
        $count=isset($p['part_count'])?filter_var($p['part_count'],FILTER_VALIDATE_INT):false;
        $base64=(string)($p['base64']??'');
        if(!preg_match('/^[A-Za-z0-9_-]{15,200}$/',$id)||
           !preg_match('/^[a-f0-9-]{32,50}$/i',$op)||!preg_match('/^[a-f0-9-]{32,50}$/i',$target)||
           !in_array(($p['target_kind']??''),array('log','field'),true)||
           !in_array($mime,array('audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav','audio/x-wav'),true)||
           $part===false||$count===false||$count<1||$count>36||$part<0||$part>=$count||
           !preg_match('/^[A-Za-z0-9+\/=]+$/D',$base64)||strlen($base64)>375000)
            return new WP_Error('bvlog_audio_input','Invalid audio chunk.',array('status'=>400));
        return self::forward('operation',array('kind'=>'audio_part','doc_id'=>$id,'op_id'=>$op,
            'target_id'=>$target,'target_kind'=>sanitize_key($p['target_kind']),
            'mime'=>$mime,'part_index'=>$part,'part_count'=>$count,'base64'=>$base64,
            'field_sheet'=>strtoupper(sanitize_key($p['field_sheet']??'')),
            'field_row'=>absint($p['field_row']??0),
            'field_col'=>strtoupper(sanitize_key($p['field_col']??'')),
            'author'=>self::operation_author($p)));
    }
    public static function photo_view($request) {
        $doc_id = sanitize_text_field((string)$request->get_param('doc_id'));
        $photo_id = sanitize_text_field((string)$request->get_param('photo_id'));
        $variant = $request->get_param('variant') === 'original' ? 'original' : 'preview';
        if (!preg_match('/^[A-Za-z0-9_-]{15,200}$/', $doc_id) ||
            !preg_match('/^[a-f0-9-]{32,50}$/i', $photo_id)) {
            return new WP_Error('bvlog_photo_view_ids', 'Invalid photo reference.', array('status'=>400));
        }
        return self::forward('photo_read', array('doc_id'=>$doc_id,
            'photo_id'=>$photo_id, 'variant'=>$variant));
    }
    public static function photo($request) {
        $p=(array)$request->get_json_params();
        $id=sanitize_text_field($p['doc_id']??'');
        $op=sanitize_text_field($p['op_id']??'');
        $log=sanitize_text_field($p['log_op_id']??'');
        $file=sanitize_file_name($p['filename']??'photo.jpg');
        $mime=sanitize_text_field($p['mime']??'');
        $base64=(string)($p['base64']??'');
        $target_row=absint($p['target_row']??0);
        if(!preg_match('/^[A-Za-z0-9_-]{15,200}$/',$id)||!preg_match('/^[a-f0-9-]{32,50}$/i',$op)
            ||($log!==''&&!preg_match('/^[a-f0-9-]{32,50}$/i',$log)) || ($log===''&&($target_row<3||$target_row>5000))){
            return new WP_Error('bvlog_photo_ids','Photo target identifiers are invalid.',array('status'=>400));
        }
        if(!in_array($mime,array('image/jpeg','image/png','image/webp'),true)){
            return new WP_Error('bvlog_photo_format','Supported image formats: JPEG, PNG, WebP.',array('status'=>400));
        }
        if(!preg_match('/^[A-Za-z0-9+\/=]+$/D',$base64)||strlen($base64)>3400000){
            return new WP_Error('bvlog_photo_size','Compressed image is too large (limit 2.5 MB).',array('status'=>413));
        }
        $bytes=base64_decode($base64,true);
        if($bytes===false||strlen($bytes)<20||strlen($bytes)>2500000){
            return new WP_Error('bvlog_photo_size','Invalid image payload or size.',array('status'=>413));
        }
        // Inspect actual image bytes; do not trust the browser-provided MIME alone.
        $info=@getimagesizefromstring($bytes);
        if(!$info||($info['mime']??'')!==$mime||$info[0]>10000||$info[1]>10000){
            return new WP_Error('bvlog_photo_invalid','Unsupported or invalid image bytes.',array('status'=>400));
        }
        unset($bytes);
        $preview=(string)($p['preview_base64']??'');
        if ($preview!=='' && (!preg_match('/^[A-Za-z0-9+\/=]+$/D',$preview) || strlen($preview)>500000)) {
            return new WP_Error('bvlog_photo_preview','Invalid image preview size.',array('status'=>413));
        }
        if ($preview!=='') {
            $small=base64_decode($preview,true);
            if ($small===false || strlen($small)<20 || strlen($small)>350000 ||
                substr($small,0,3)!=="\xFF\xD8\xFF") {
                return new WP_Error('bvlog_photo_preview','Invalid JPEG preview.',array('status'=>400));
            }
            unset($small);
        }
        return self::forward('operation',array('kind'=>'photo','doc_id'=>$id,'op_id'=>$op,
            'log_op_id'=>$log,'target_row'=>$target_row,
            'expected_time'=>sanitize_text_field($p['expected_time']??''),
            'expected_text'=>sanitize_textarea_field($p['expected_text']??''),
            'filename'=>substr($file,0,100),'mime'=>$mime,'base64'=>$base64,'preview_base64'=>$preview,
            'author'=>self::operation_author($p)));
    }
    public static function operation($request) {
        $p = (array)$request->get_json_params();
        $kind = sanitize_key($p['kind'] ?? '');
        if (!in_array($kind, array('log', 'field', 'add_row', 'log_change'), true)) {
            return new WP_Error('bvlog_kind', 'Unsupported operation.', array('status' => 400));
        }
        $doc_id = sanitize_text_field($p['doc_id'] ?? '');
        $op_id = sanitize_text_field($p['op_id'] ?? '');
        if (!preg_match('/^[A-Za-z0-9_-]{15,200}$/', $doc_id) || !preg_match('/^[a-f0-9-]{32,50}$/i', $op_id)) {
            return new WP_Error('bvlog_input', 'Invalid document or operation ID.', array('status' => 400));
        }
        $body = array('doc_id' => $doc_id, 'op_id' => $op_id, 'kind' => $kind,
            'author' => self::operation_author($p));
        if ($kind === 'log_change') {
            $body['action']=sanitize_key($p['action']??'');
            $body['log_op_id']=sanitize_text_field($p['log_op_id']??'');
            $body['target_row']=absint($p['target_row']??0);
            $body['expected_time']=sanitize_text_field($p['expected_time']??'');
            $body['expected_text']=sanitize_textarea_field($p['expected_text']??'');
            $body['text']=sanitize_textarea_field($p['text']??'');
            $body['force_base']=isset($p['force_base'])?sanitize_textarea_field($p['force_base']):null;
            if(!in_array($body['action'],array('edit','cancel'),true) ||
               ($body['log_op_id']!==''&&!preg_match('/^[a-f0-9-]{32,50}$/i',$body['log_op_id'])) ||
               (!$body['log_op_id']&&($body['target_row']<3||$body['target_row']>5000)) ||
               strlen($body['expected_text'])>5000 || strlen($body['text'])>5000)
                return new WP_Error('bvlog_log_change','Invalid LOG change.',array('status'=>400));
        } elseif ($kind === 'log') {
            $text = sanitize_textarea_field($p['text'] ?? '');
            if (!$text || (function_exists('mb_strlen') ? mb_strlen($text) : strlen($text)) > 3000) { return new WP_Error('bvlog_log', 'Log text is required (max 3000).', array('status' => 400)); }
            $body['text'] = $text;
            $body['source'] = ($p['source'] ?? '') === 'text' ? 'text' : 'voice';
            $body['event_at'] = sanitize_text_field($p['event_at'] ?? '');
        } elseif ($kind === 'field') {
            $sheet = sanitize_key($p['sheet'] ?? '');
            if (!in_array($sheet, array('info', 'team', 'tech'), true)) { return new WP_Error('bvlog_sheet', 'Invalid sheet.', array('status' => 400)); }
            $body['sheet'] = strtoupper($sheet);
            $body['row'] = absint($p['row'] ?? 0);
            $body['col'] = strtoupper(sanitize_text_field($p['col'] ?? ''));
            $body['base'] = sanitize_textarea_field($p['base'] ?? '');
            $body['value'] = sanitize_textarea_field($p['value'] ?? '');
            $body['row_key'] = sanitize_text_field($p['row_key'] ?? '');
            $body['force_base'] = isset($p['force_base']) ? sanitize_textarea_field($p['force_base']) : null;
        } else {
            $sheet = strtoupper(sanitize_key($p['sheet'] ?? ''));
            if (!in_array($sheet, array('TEAM', 'TECH'), true)) { return new WP_Error('bvlog_sheet', 'Invalid sheet.', array('status' => 400)); }
            $body['sheet'] = $sheet;
            $vals = (array)($p['values'] ?? array());
            $body['values'] = array_map('sanitize_text_field', array_slice(array_values($vals), 0, 8));
            if (count(array_filter($body['values'])) === 0) { return new WP_Error('bvlog_values', 'A new row cannot be empty.', array('status' => 400)); }
        }
        return self::forward('operation', $body);
    }
}
