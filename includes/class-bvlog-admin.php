<?php
if (!defined('ABSPATH')) { exit; }
class BVLOG_Admin {
    public static function register_menu() {
        add_options_page('BG Voice Logger', 'BG Voice Logger', 'manage_options', 'bvlog', array(__CLASS__, 'render'));
    }
    public static function save() {
        if (!current_user_can('manage_options')) { wp_die('Not allowed'); }
        check_admin_referer('bvlog_save');
        $input = wp_unslash((array)($_POST['settings'] ?? array()));
        $previous = bvlog_settings();
        $new = array();
        foreach (array('folder_id', 'template_id') as $key) {
            $raw = trim((string)($input[$key] ?? ''));
            if (preg_match('~(?:folders/|spreadsheets/d/)([A-Za-z0-9_-]{15,200})~', $raw, $match)) { $raw = $match[1]; }
            $new[$key] = preg_match('/^[A-Za-z0-9_-]{15,200}$/', $raw) ? $raw : $previous[$key];
        }
        $url = esc_url_raw(trim((string)($input['script_url'] ?? '')));
        $new['script_url'] = strpos($url, 'https://script.google.com/macros/s/') === 0 ? $url : '';
        $new['app_url'] = esc_url_raw(trim((string)($input['app_url'] ?? '')));
        $allowed = array_keys(wp_roles()->roles);
        $requested = array_filter(array_map('trim', explode(',', sanitize_text_field($input['roles'] ?? ''))));
        $new['roles'] = implode(',', array_intersect($allowed, $requested));
        $new['auth_mode'] = in_array(($input['auth_mode'] ?? ''), array('google','wordpress','public'), true) ? $input['auth_mode'] : 'google';
        $client=trim((string)($input['google_client_id']??''));
        $new['google_client_id'] = preg_match('/^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/', $client) ? $client : '';
        $allowed_emails = preg_split('/[,;\s]+/', strtolower((string)($input['google_allowed_emails']??'')));
        $emails=array();
        foreach($allowed_emails as $email){if(is_email($email))$emails[]=$email;}
        $new['google_allowed_emails']=implode("\n",array_unique($emails));
        $new['google_allow_any']=!empty($input['google_allow_any'])?1:0;
        $worker_url = esc_url_raw(trim((string)($input['stt_worker_url'] ?? '')));
        $parts = wp_parse_url($worker_url);
        // Worker URL is admin-configured only, HTTPS, no credentials or query params.
        $new['stt_worker_url'] = $worker_url && is_array($parts) && ($parts['scheme'] ?? '') === 'https'
            && !empty($parts['host']) && empty($parts['user']) && empty($parts['pass'])
            && empty($parts['query']) && empty($parts['fragment'])
            && preg_match('~/stt/transcribe/?$~', $parts['path'] ?? '') ? $worker_url : '';
        $new['stt_mode'] = in_array(($input['stt_mode'] ?? ''), array('cloud','browser'), true)
            ? $input['stt_mode'] : 'cloud';
        // Kept only for older installations; the explicit auth_mode controls access.
        $new['public_access'] = $new['auth_mode']==='public' ? 1 : 0;
        if (!$new['roles']) { $new['roles'] = 'administrator,editor'; }
        update_option('bvlog_settings', $new, false);
        $secret = trim((string)($input['secret'] ?? ''));
        if ($secret && strlen($secret) >= 24 && strlen($secret) <= 256) { update_option('bvlog_shared_secret', $secret, false); }
        if (!empty($input['delete_secret'])) { delete_option('bvlog_shared_secret'); }
        $stt_secret = trim((string)($input['stt_signing_secret'] ?? ''));
        if ($stt_secret && strlen($stt_secret) >= 32 && strlen($stt_secret) <= 256) {
            update_option('bvlog_stt_signing_secret', $stt_secret, false);
        }
        if (!empty($input['delete_stt_secret'])) { delete_option('bvlog_stt_signing_secret'); }
        wp_safe_redirect(add_query_arg(array('page' => 'bvlog', 'updated' => '1'), admin_url('options-general.php'))); exit;
    }
    public static function test() {
        if (!current_user_can('manage_options')) { wp_die('Not allowed'); }
        check_admin_referer('bvlog_test');
        $result = BVLOG_API::forward('ping');
        $ok = !is_wp_error($result) && method_exists($result, 'get_data') && !empty($result->get_data()['ok']);
        wp_safe_redirect(add_query_arg(array('page' => 'bvlog', 'tested' => $ok ? 'ok' : 'fail'), admin_url('options-general.php'))); exit;
    }
    public static function render() {
        if (!current_user_can('manage_options')) { return; }
        $s = bvlog_settings();
        $configured = BVLOG_API::secret_present();
        $nonce = wp_create_nonce('bvlog_test');
        ?>
        <div class="wrap" style="max-width:900px"><h1>Документ за координация на акция - Settings</h1>
        <p>Google Drive and Sheets access uses either the separately deployed Google Apps Script bridge or an explicitly configured direct API test writer. Credentials remain on the server.</p>
        <?php if(class_exists('BVLOG_SMS'))BVLOG_SMS::admin_panel(); ?>
        <?php if(class_exists('BVLOG_Direct_Read'))BVLOG_Direct_Read::admin_panel(); ?>
        <?php if(class_exists('BVLOG_Direct_Write'))BVLOG_Direct_Write::admin_panel(); ?>
        <div class="notice notice-info" style="padding:10px 15px;margin:15px 0;">
          <strong>Frontend build diagnostics (server-side expected values)</strong>
          <p>Plugin: <code><?php echo esc_html(BVLOG_VERSION); ?></code>;
          JS build: <code><?php echo esc_html(bvlog_expected_js_build()); ?></code>;
          JS asset URL version: <code><?php echo esc_html(bvlog_asset_version('assets/app.js')); ?></code>;
          CSS asset URL version: <code><?php echo esc_html(bvlog_asset_version('assets/app.css')); ?></code>;
          Service Worker cache: <code><?php echo esc_html(bvlog_service_worker_build()); ?></code></p>
          <p class="description">The app header shows the actual running JavaScript build.
             In browser Console, <code>window.BVLOG_RUNNING_BUILD</code> reports that build.
             Compare against the JS build above; if it differs, check caching.</p>
        </div>
        <?php if (isset($_GET['updated'])): ?><div class="notice notice-success"><p>Settings saved.</p></div><?php endif; ?>
        <?php if (isset($_GET['tested'])): ?><div class="notice notice-<?php echo $_GET['tested'] === 'ok' ? 'success' : 'error'; ?>"><p><?php echo $_GET['tested'] === 'ok' ? 'Google bridge is reachable.' : 'Google connection failed. Verify Script deployment and shared secret.'; ?></p></div><?php endif; ?>
        <?php
        $trace = (array)get_option('bvlog_bridge_diagnostics', array());
        if (!empty($trace['stage'])) :
        ?>
        <div class="notice notice-info" style="padding: 10px 15px; margin: 15px 0;">
          <strong>Last Google bridge request (no credentials logged)</strong>
          <p style="margin: 7px 0 3px 0;">
            Action: <code><?php echo esc_html($trace['action'] ?? ''); ?></code>;
            Stage: <code><?php echo esc_html($trace['stage'] ?? ''); ?></code>;
            HTTP: <code><?php echo esc_html((string)($trace['http_status'] ?? 0)); ?></code>;
            Time: <code><?php echo esc_html((string)($trace['elapsed_ms'] ?? 0)); ?> ms</code>;
            UTC: <code><?php echo esc_html($trace['time_utc'] ?? ''); ?></code>;
            Detail: <code><?php echo esc_html($trace['detail'] ?? ''); ?></code>
          </p>
          <?php if (!empty($trace['timings'])) : ?>
            <p><code style="white-space:normal;overflow-wrap:anywhere"><?php echo esc_html(wp_json_encode($trace['timings'])); ?></code></p>
          <?php endif; ?>
        </div>
        <?php endif; ?>
        <?php $recent_requests = (array)get_option('bvlog_bridge_request_history', array()); ?>
        <?php if ($recent_requests) : ?>
        <details style="margin:15px 0;">
          <summary><strong>Recent Google list/read/write requests (last 30, sanitized)</strong></summary>
          <table class="widefat striped" style="max-width:1050px;margin-top:8px;">
            <thead><tr><th>UTC</th><th>Request</th><th>Action</th><th>Stage</th><th>Time</th><th>HTTP</th><th>Detail</th></tr></thead>
            <tbody>
            <?php foreach (array_slice($recent_requests, 0, 30) as $item) : ?>
              <tr><td><?php echo esc_html($item['time_utc'] ?? ''); ?></td>
                <td><code><?php echo esc_html($item['request_id'] ?? ''); ?></code></td>
                <td><?php echo esc_html($item['action'] ?? ''); ?></td>
                <td><?php echo esc_html($item['stage'] ?? ''); ?></td>
                <td><?php echo esc_html((string)($item['elapsed_ms'] ?? '')); ?> ms</td>
                <td><?php echo esc_html((string)($item['http_status'] ?? '')); ?></td>
                <td><code><?php echo esc_html($item['detail'] ?? ''); ?></code>
                  <?php if (!empty($item['timings'])) : ?>
                    <details><summary>Timing phases (ms)</summary><code style="white-space:normal;overflow-wrap:anywhere"><?php echo esc_html(wp_json_encode($item['timings'])); ?></code></details>
                  <?php endif; ?></td></tr>
            <?php endforeach; ?>
            </tbody>
          </table>
          <p class="description">Safe request IDs can be matched to Google Apps Script executions after deploying the matching backend. No document names, cell values, media or credentials are logged.</p>
        </details>
        <?php endif; ?>
        <?php $recent_media = (array)get_option('bvlog_bridge_media_history', array()); ?>
        <?php if ($recent_media) : ?>
        <details style="margin:15px 0;">
          <summary><strong>Recent media bridge timings (no credentials or file contents)</strong></summary>
          <table class="widefat striped" style="max-width:1050px;margin-top:8px;">
            <thead><tr><th>UTC</th><th>Request</th><th>Action</th><th>Stage</th><th>Time</th><th>HTTP</th><th>Detail</th></tr></thead>
            <tbody>
              <?php foreach (array_slice($recent_media, 0, 15) as $item) : ?>
              <tr><td><?php echo esc_html($item['time_utc'] ?? ''); ?></td>
                <td><code><?php echo esc_html($item['request_id'] ?? ''); ?></code></td>
                <td><?php echo esc_html($item['action'] ?? ''); ?></td>
                <td><?php echo esc_html($item['stage'] ?? ''); ?></td>
                <td><?php echo esc_html((string)($item['elapsed_ms'] ?? '')); ?> ms</td>
                <td><?php echo esc_html((string)($item['http_status'] ?? '')); ?></td>
                <td><code><?php echo esc_html($item['detail'] ?? ''); ?></code>
                  <?php if (!empty($item['timings'])) : ?>
                    <details><summary>Timing phases (ms)</summary><code style="white-space:normal;overflow-wrap:anywhere"><?php echo esc_html(wp_json_encode($item['timings'])); ?></code></details>
                  <?php endif; ?></td></tr>
              <?php endforeach; ?>
            </tbody>
          </table>
          <p class="description">Only PHP-to-Google bridge timings are measured here. Browser network delay is not included.</p>
        </details>
        <?php endif; ?>
        <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
        <input type="hidden" name="action" value="bvlog_save"><?php wp_nonce_field('bvlog_save'); ?>
        <table class="form-table" role="presentation">
        <tr><th><label for="bv-folder">Working folder ID or URL</label></th><td><input id="bv-folder" name="settings[folder_id]" type="text" class="large-text code" value="<?php echo esc_attr($s['folder_id']); ?>"><p class="description">Existing folder; new operation spreadsheets are copied here.</p></td></tr>
        <tr><th><label for="bv-template">Template spreadsheet ID or URL</label></th><td><input id="bv-template" name="settings[template_id]" type="text" class="large-text code" value="<?php echo esc_attr($s['template_id']); ?>"></td></tr>
        <tr><th><label for="bv-endpoint">Apps Script Web App URL</label></th><td><input id="bv-endpoint" name="settings[script_url]" type="url" class="large-text code" placeholder="https://script.google.com/macros/s/.../exec" value="<?php echo esc_attr($s['script_url']); ?>"><p class="description">Deployment: Execute as you, access Anyone. Use the strong secret below.</p></td></tr>
        <tr><th><label for="bv-secret">Shared secret</label></th><td><input id="bv-secret" name="settings[secret]" type="password" autocomplete="new-password" class="large-text code" placeholder="<?php echo $configured ? 'Configured - leave blank to keep' : 'Paste a strong random secret (24+ characters)'; ?>"><p class="description">Set matching Script Property: BVLOG_SHARED_SECRET. For stronger protection, define BVLOG_SHARED_SECRET in wp-config.php instead of storing in WordPress.</p><label><input type="checkbox" name="settings[delete_secret]" value="1"> Remove stored secret</label></td></tr>
        <tr><th><label for="bv-page">App page URL</label></th><td><input id="bv-page" name="settings[app_url]" type="url" class="large-text" placeholder="https://your-domain.example/voice-log/" value="<?php echo esc_attr($s['app_url']); ?>"><p class="description">Create a WordPress page with shortcode [bg_voice_logger]. PWA uses this URL as its launch page.</p></td></tr>
        <tr><th><label for="bv-auth">Application login mode</label></th><td>
        <select id="bv-auth" name="settings[auth_mode]">
            <option value="google" <?php selected($s['auth_mode'],'google'); ?>>Google sign-in (recommended)</option>
            <option value="wordpress" <?php selected($s['auth_mode'],'wordpress'); ?>>WordPress account only</option>
            <option value="public" <?php selected($s['auth_mode'],'public'); ?>>Anyone without login (unsafe)</option>
        </select>
        <p class="description">Google sign-in creates a separate authenticated app session; visitors do not need WordPress accounts. Both page and REST API are protected. Changing the mode does not clear local offline queues.</p></td></tr>
        <tr><th><label for="bv-google-id">Google OAuth Web Client ID</label></th><td>
        <input id="bv-google-id" name="settings[google_client_id]" type="text" class="large-text code" value="<?php echo esc_attr($s['google_client_id'] ?? ''); ?>" placeholder="123456789-xxxx.apps.googleusercontent.com">
        <p class="description">Google Cloud Console &gt; APIs &amp; Services &gt; Credentials &gt; OAuth client ID, type Web application. Authorized JavaScript origin: <?php echo esc_html(home_url()); ?>. This is a public client ID, not a secret.</p></td></tr>
        <tr><th><label for="bv-allowed">Approved Google emails</label></th><td>
        <textarea id="bv-allowed" name="settings[google_allowed_emails]" class="large-text code" rows="4" placeholder="operator@example.com&#10;team@example.com"><?php echo esc_textarea($s['google_allowed_emails'] ?? ''); ?></textarea>
        <p class="description">One address per line. Only Google accounts with verified email on this list can open the journal unless the option below is enabled.</p>
        <label><input type="checkbox" name="settings[google_allow_any]" value="1" <?php checked(!empty($s['google_allow_any'])); ?>> Allow ANY verified Google account (not recommended for personal/operational records)</label></td></tr>
        <tr><th colspan="2"><h2>Cloud speech-to-text (Groq / Cloudflare)</h2><p>Audio is recorded and queued locally, then sent directly from the browser to a separate Cloudflare Worker. API credentials stay inside the Worker. STT is disabled for anonymous/public app mode.</p></th></tr>
        <tr><th><label for="bv-stt-mode">Transcription mode</label></th><td><select id="bv-stt-mode" name="settings[stt_mode]">
          <option value="cloud" <?php selected($s['stt_mode'] ?? 'cloud','cloud'); ?>>Cloud STT (recommended)</option>
          <option value="browser" <?php selected($s['stt_mode'] ?? 'cloud','browser'); ?>>Browser SpeechRecognition (legacy)</option>
        </select><p class="description">Cloud mode needs the Worker URL and a matching signing secret. If missing, the application still saves audio locally, and does not silently switch to browser recognition.</p></td></tr>
        <tr><th><label for="bv-stt-worker">Cloudflare Worker STT URL</label></th><td><input id="bv-stt-worker" name="settings[stt_worker_url]" type="url" class="large-text code" placeholder="https://your-worker.workers.dev/stt/transcribe" value="<?php echo esc_attr($s['stt_worker_url'] ?? ''); ?>"><p class="description">Exact HTTPS Worker endpoint with /stt/transcribe path. Do not enter a Groq URL.</p></td></tr>
        <tr><th><label for="bv-stt-secret">Worker signing secret</label></th><td><input id="bv-stt-secret" name="settings[stt_signing_secret]" type="password" autocomplete="new-password" class="large-text code" placeholder="<?php echo BVLOG_STT::has_secret() ? 'Configured - leave blank to keep' : 'Paste a separate 32+ character random secret'; ?>"><p class="description">Use the same value for the Cloudflare Worker secret STT_HMAC_SECRET. It is not the Groq API key and must differ from BVLOG_SHARED_SECRET.</p><label><input type="checkbox" name="settings[delete_stt_secret]" value="1"> Remove stored STT signing secret</label></td></tr>
        <tr><th>STT availability</th><td><strong><?php echo BVLOG_STT::configured() ? 'Configured' : 'Not configured'; ?></strong><p class="description">Complete the bundled workers/stt-worker deployment and set Cloudflare Worker secrets. See STT_SETUP_BG.md.</p></td></tr>
        <tr><th>Public access</th><td><p class="description" style="color:#a11"><strong>Warning:</strong> public mode gives anonymous visitors read and write access to action records, names, phone numbers and images. Use Google sign-in with approved emails for real operations.</p></td></tr>
        <tr><th><label for="bv-roles">Allowed WordPress roles</label></th><td><input id="bv-roles" name="settings[roles]" type="text" class="regular-text" value="<?php echo esc_attr($s['roles']); ?>"><p class="description">Comma separated role slugs. Used when public access is disabled; administrators are always permitted.</p></td></tr>
        </table><?php submit_button('Save Settings'); ?></form>
        <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>"><input type="hidden" name="action" value="bvlog_test"><?php wp_nonce_field('bvlog_test'); ?><?php submit_button('Test Google Connection', 'secondary'); ?></form>
        <h2>Setup checklist</h2><ol><li>Open script.google.com, add the bundled <code>apps-script/Code.gs</code> source to a new project.</li><li>Add Script Property <code>BVLOG_SHARED_SECRET</code> with a strong random string.</li><li>Deploy a Web App as the Google user who can edit the folder and template; access: Anyone.</li><li>Paste deployment URL and matching secret here; save and test.</li><li>Create a WordPress page with <code>[bg_voice_logger]</code>, set the App page URL, and open it over HTTPS.</li></ol>
        <p><strong>Important:</strong> Do not use this with publicly writable operation documents. Restrict Google Drive sharing first.</p>
        </div>
        <?php
    }
}
