<?php
/**
 * Short-lived STT upload tickets for the Cloudflare Worker.
 * No audio passes through this PHP endpoint; only a scoped HMAC ticket.
 */
if (!defined('ABSPATH')) { exit; }

class BVLOG_STT {
    const AUDIENCE = 'bg-voice-logger-stt';
    public static function register_routes() {
        register_rest_route('bvlog/v1', '/stt/token', array(
            'methods' => 'POST',
            'permission_callback' => array('BVLOG_API', 'authorize'),
            'callback' => array(__CLASS__, 'token'),
        ));
    }
    public static function secret() {
        return defined('BVLOG_STT_SECRET') && BVLOG_STT_SECRET
            ? BVLOG_STT_SECRET : (string)get_option('bvlog_stt_signing_secret', '');
    }
    public static function has_secret() {
        return strlen(self::secret()) >= 32;
    }
    public static function configured() {
        $settings = bvlog_settings();
        return !empty($settings['stt_worker_url']) && self::has_secret();
    }
    private static function b64url($raw) {
        return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
    }
    public static function token($request) {
        $identity = BVLOG_Auth::identity();
        if (!$identity || !in_array($identity['kind'] ?? '', array('google', 'wordpress'), true)) {
            return new WP_Error('bvlog_stt_login', 'Approved Google or WordPress login is required for cloud transcription.', array('status' => 403));
        }
        $settings = bvlog_settings();
        if (($settings['stt_mode'] ?? 'cloud') !== 'cloud' || !self::configured()) {
            return new WP_Error('bvlog_stt_disabled', 'Cloud transcription is not configured. Audio stays in the local queue.', array('status' => 503));
        }
        $body = (array)$request->get_json_params();
        $op_id = sanitize_text_field($body['op_id'] ?? '');
        $doc_id = sanitize_text_field($body['doc_id'] ?? '');
        if (!preg_match('/^[0-9a-f-]{32,50}$/i', $op_id) || !preg_match('/^[A-Za-z0-9_-]{15,200}$/', $doc_id)) {
            return new WP_Error('bvlog_stt_target', 'Invalid transcription target.', array('status' => 400));
        }
        $sub = (string)($identity['sub'] ?? ('wp:' . get_current_user_id()));
        $user_key = substr(hash('sha256', $sub), 0, 40);
        // Issuance throttling is supplemental to Worker-side limits and nonce replay prevention.
        $minute_key = 'bvlog_stt_min_' . $user_key;
        $day_key = 'bvlog_stt_day_' . $user_key . gmdate('Ymd');
        $per_min = (int)get_transient($minute_key);
        $per_day = (int)get_transient($day_key);
        if ($per_min >= 20 || $per_day >= 500) {
            return new WP_Error('bvlog_stt_rate', 'Speech transcription quota reached; the recording remains on this device.', array('status' => 429));
        }
        set_transient($minute_key, $per_min + 1, MINUTE_IN_SECONDS);
        set_transient($day_key, $per_day + 1, DAY_IN_SECONDS);
        $now = time();
        $issuer = home_url();
        $ticket = array(
            'iss' => rtrim($issuer, '/'), 'aud' => self::AUDIENCE,
            'sub' => $user_key, 'op_id' => $op_id, 'doc_id' => $doc_id,
            'jti' => wp_generate_uuid4(), 'iat' => $now, 'exp' => $now + 150,
        );
        $head = self::b64url(wp_json_encode(array('alg' => 'HS256', 'typ' => 'JWT')));
        $payload = self::b64url(wp_json_encode($ticket));
        $signed = $head . '.' . $payload;
        $signature = self::b64url(hash_hmac('sha256', $signed, self::secret(), true));
        return rest_ensure_response(array(
            'ok' => true, 'token' => $signed . '.' . $signature,
            'endpoint' => esc_url_raw($settings['stt_worker_url']),
            'expires_in' => 150,
        ));
    }
}
