<?php
/**
 * Plugin Name: BG Voice Logger
 * Plugin URI: https://example.invalid/bg-voice-logger
 * Description: Field-first voice operations journal for Google Sheets with offline queue and Apps Script bridge.
 * Version: 0.8.2.1
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * Author: BG Voice Logger Project
 * License: GPLv2 or later
 * Text Domain: bg-voice-logger
 */

if (!defined('ABSPATH')) { exit; }

define('BVLOG_VERSION', '0.8.2.1');
define('BVLOG_DIR', plugin_dir_path(__FILE__));
define('BVLOG_URL', plugin_dir_url(__FILE__));

// Content-addressed asset URLs prevent a CDN from reusing an earlier plugin build.
// The file hash is evaluated once per asset per PHP request (not per visitor session).
function bvlog_asset_version($relative_path) {
    static $versions = array();
    if (isset($versions[$relative_path])) { return $versions[$relative_path]; }
    if (!preg_match('~^assets/[A-Za-z0-9_.-]+$~D', $relative_path)) { return BVLOG_VERSION; }
    $path = BVLOG_DIR . $relative_path;
    $digest = is_readable($path) ? @hash_file('sha256', $path) : false;
    $versions[$relative_path] = $digest ? BVLOG_VERSION . '-' . substr($digest, 0, 12) : BVLOG_VERSION;
    return $versions[$relative_path];
}

// Expected build marker is computed from the on-disk JS source with the marker
// normalized. The running marker is embedded in the actual JavaScript payload.
function bvlog_expected_js_build() {
    static $expected = null;
    if ($expected !== null) { return $expected; }
    $file = BVLOG_DIR . 'assets/app.js';
    $source = is_readable($file) ? @file_get_contents($file) : false;
    if ($source === false) { return $expected = BVLOG_VERSION; }
    $pattern = "~const BVLOG_RUNNING_BUILD = '[A-Za-z0-9._-]+';~";
    if (!preg_match($pattern, $source)) { return $expected = BVLOG_VERSION; }
    $canonical = preg_replace($pattern, "const BVLOG_RUNNING_BUILD = '__BUILD_PLACEHOLDER__';", $source, 1);
    return $expected = BVLOG_VERSION . '-' . substr(hash('sha256', $canonical), 0, 12);
}

function bvlog_service_worker_build() {
    static $version = null;
    if ($version !== null) { return $version; }
    $combined = bvlog_asset_version('assets/app.js') . '|' .
        bvlog_asset_version('assets/app.css') . '|' .
        bvlog_asset_version('assets/sw.js');
    return $version = BVLOG_VERSION . '-' . substr(hash('sha256', $combined), 0, 12);
}

require_once BVLOG_DIR . 'includes/class-bvlog-auth.php';
require_once BVLOG_DIR . 'includes/class-bvlog-api.php';
require_once BVLOG_DIR . 'includes/class-bvlog-stt.php';
require_once BVLOG_DIR . 'includes/class-bvlog-admin.php';

function bvlog_defaults() {
    return array(
        'folder_id' => defined('BVLOG_DEFAULT_FOLDER_ID') ? BVLOG_DEFAULT_FOLDER_ID : '',
        'template_id' => defined('BVLOG_DEFAULT_TEMPLATE_ID') ? BVLOG_DEFAULT_TEMPLATE_ID : '',
        'script_url' => '',
        'app_url' => '',
        'roles' => 'administrator,editor',
        'public_access' => 0,
        'auth_mode' => 'google',
        'google_client_id' => '',
        'google_allowed_emails' => '',
        'google_allow_any' => 0,
        'stt_worker_url' => '',
        'stt_mode' => 'cloud',
    );
}
function bvlog_settings() {
    $saved = (array)get_option('bvlog_settings', array());
    // Migration may be enabled by site-local wp-config.php constants.
    // Never include real deployment resource IDs in a public repository.
    if (defined('BVLOG_LEGACY_TEMPLATE_ID') && defined('BVLOG_DEFAULT_TEMPLATE_ID')
        && ($saved['template_id'] ?? '') === BVLOG_LEGACY_TEMPLATE_ID) {
        $saved['template_id'] = BVLOG_DEFAULT_TEMPLATE_ID;
        update_option('bvlog_settings', $saved, false);
    }
    return wp_parse_args($saved, bvlog_defaults());
}
function bvlog_allowed() {
    return BVLOG_Auth::identity() !== null;
}

function bvlog_app_url() {
    $o = bvlog_settings();
    return $o['app_url'] ? esc_url_raw($o['app_url']) : home_url('/');
}

add_action('init', function () {
    if (isset($_GET['bvlog_manifest'])) {
        header('Content-Type: application/manifest+json; charset=UTF-8');
        header('Cache-Control: no-store');
        echo wp_json_encode(array(
            'name' => 'Документ за Координация на Акция', 'short_name' => 'ДКА',
            'id' => wp_parse_url(bvlog_app_url(), PHP_URL_PATH) ?: '/',
            'scope' => wp_parse_url(bvlog_app_url(), PHP_URL_PATH) ?: '/',
            'start_url' => bvlog_app_url(), 'display' => 'standalone',
            'background_color' => '#f1f5f9', 'theme_color' => '#0f355b',
            'icons' => array(
                array('src' => BVLOG_URL . 'assets/icon-192.png', 'sizes' => '192x192', 'type' => 'image/png'),
                array('src' => BVLOG_URL . 'assets/icon-512.png', 'sizes' => '512x512', 'type' => 'image/png'),
            ),
        ));
        exit;
    }
    if (isset($_GET['bvlog_sw'])) {
        header('Content-Type: application/javascript; charset=UTF-8');
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
        header('Pragma: no-cache');
        header('X-Content-Type-Options: nosniff');
        header('Service-Worker-Allowed: /');
        echo 'self.BVLOG_APP_URL = ' . wp_json_encode(bvlog_app_url()) . ';';
        echo 'self.BVLOG_API_ROOT = ' . wp_json_encode(rest_url('bvlog/v1/')) . ';';
        echo 'self.BVLOG_NONCE_URL = ' . wp_json_encode(admin_url('admin-ajax.php?action=bvlog_nonce')) . ';';
        echo 'self.BVLOG_CACHE_ID = ' . wp_json_encode('bgvl-' . bvlog_service_worker_build() . '-assets') . ';';
        echo 'self.BVLOG_REQUIRED_ASSETS = ' . wp_json_encode(array(
            BVLOG_URL . 'assets/app.js?ver=' . rawurlencode(bvlog_asset_version('assets/app.js')),
            BVLOG_URL . 'assets/app.css?ver=' . rawurlencode(bvlog_asset_version('assets/app.css')),
        )) . ';';
        readfile(BVLOG_DIR . 'assets/sw.js');
        exit;
    }
});

add_action('wp_ajax_bvlog_nonce', function () {
    if (!is_user_logged_in() || !bvlog_allowed()) { wp_send_json_error('WordPress session required', 403); }
    wp_send_json_success(array('nonce' => wp_create_nonce('wp_rest')));
});

add_action('template_redirect', function () {
    if (!is_singular()) { return; }
    $post = get_post();
    if ($post && has_shortcode($post->post_content, 'bg_voice_logger')) {
        if (!defined('DONOTCACHEPAGE')) { define('DONOTCACHEPAGE', true); }
        nocache_headers();
    }
}, 1);

add_action('wp_enqueue_scripts', function () {
    if (is_singular()) {
        $post = get_post();
        if ($post && has_shortcode($post->post_content, 'bg_voice_logger')) {
            wp_enqueue_style('bvlog-ui', BVLOG_URL . 'assets/app.css', array(), bvlog_asset_version('assets/app.css'));
        }
    }
});

add_shortcode('bg_voice_logger', function () {
    // The React app displays Google sign-in when no application session exists.
    // REST methods enforce authentication independently of page rendering.
    wp_enqueue_style('bvlog-ui', BVLOG_URL . 'assets/app.css', array(), bvlog_asset_version('assets/app.css'));
    wp_enqueue_script('bvlog-ui', BVLOG_URL . 'assets/app.js', array('wp-element'), bvlog_asset_version('assets/app.js'), true);
    wp_add_inline_script('bvlog-ui', 'window.BVLOG_CONFIG = ' . wp_json_encode(array(
        'api' => esc_url_raw(rest_url('bvlog/v1/')),
        'nonce' => is_user_logged_in() ? wp_create_nonce('wp_rest') : '',
        'nonce_url' => admin_url('admin-ajax.php?action=bvlog_nonce'),
        'sw_url' => add_query_arg(array('bvlog_sw' => '1', 'build' => bvlog_service_worker_build()), home_url('/')),
        'app_url' => bvlog_app_url(),
        'user' => array('id' => get_current_user_id(), 'name' => wp_get_current_user()->display_name),
        'auth_mode' => bvlog_settings()['auth_mode'],
        'google_client_id' => bvlog_settings()['google_client_id'],
        'logo_url' => BVLOG_URL . 'assets/logo-optimized.webp',
        'public_access' => !empty(bvlog_settings()['public_access']),
        'stt_cloud' => BVLOG_STT::configured(),
        'stt_mode' => bvlog_settings()['stt_mode'] ?? 'cloud',
        'plugin_version' => BVLOG_VERSION,
        'expected_build' => bvlog_expected_js_build(),
        'asset_version' => bvlog_asset_version('assets/app.js'),
    )) . ';', 'before');
    return '<div id="bvlog-root" class="bvlog-app" aria-live="polite"><p>BG Voice Logger is loading...</p></div>';
});

add_action('rest_api_init', array('BVLOG_API', 'register_routes'));
add_filter('rest_pre_serve_request', array('BVLOG_API', 'serve_audio_stream'), 10, 4);
add_action('rest_api_init', array('BVLOG_STT', 'register_routes'));
add_action('admin_menu', array('BVLOG_Admin', 'register_menu'));
add_action('admin_post_bvlog_save', array('BVLOG_Admin', 'save'));
add_action('admin_post_bvlog_test', array('BVLOG_Admin', 'test'));

add_action('wp_head', function () {
    if (is_singular()) {
        $post = get_post();
        if ($post && has_shortcode($post->post_content, 'bg_voice_logger')) {
            echo '<link rel="manifest" href="' . esc_url(home_url('/?bvlog_manifest=1')) . '">';
            echo '<meta name="theme-color" content="#0f355b">';
            echo '<meta name="apple-mobile-web-app-capable" content="yes">';
            echo '<meta name="apple-mobile-web-app-title" content="ДКА">';
            echo '<link rel="apple-touch-icon" href="' . esc_url(BVLOG_URL . 'assets/icon-192.png') . '">';
        }
    }
});

// Avoid caching private session information or operational REST responses.
add_filter('rest_pre_serve_request', function($served,$result,$request) {
    if (strpos($request->get_route(), '/bvlog/v1/') === 0 && !headers_sent()) {
        header('Cache-Control: private, no-store, max-age=0');
        header('Pragma: no-cache');
        header('X-Content-Type-Options: nosniff');
    }
    return $served;
}, 10, 3);
