<?php
// Isolated WordPress input validation fixture: never calls the remote Apps Script bridge.
define('ABSPATH','/');
class WP_Error { public $code;public $message;public $data;function __construct($code,$message,$data){$this->code=$code;$this->message=$message;$this->data=$data;} }
function sanitize_text_field($v){return trim(strip_tags((string)$v));}
require dirname(__DIR__).'/includes/class-bvlog-api.php';
class MockCreateRequest {private $payload;function __construct($payload){$this->payload=$payload;}function get_json_params(){return $this->payload;} }
$invalid=['2026-02-30','2026-13-01','2024-02-30','2026-1-02','2026-01-03T00:00:00Z','',false,['date'],'<script>alert(1)</script>'];
foreach($invalid as $date){
    $response=BVLOG_API::create_document(new MockCreateRequest(['type'=>'Издирване','place'=>'София','incident_date'=>$date]));
    if(!($response instanceof WP_Error)||$response->code!=='bvlog_invalid_date'||($response->data['status']??0)!==400) throw new Exception('Invalid date was not rejected: '.json_encode($date));
}
$source=file_get_contents(dirname(__DIR__).'/includes/class-bvlog-api.php');
if(strpos($source,"'incident_date' => \$incident_date")===false)throw new Exception('Missing WP to GAS date forwarding');
echo "PASS v0.7.2 PHP: strict calendar input rejection, invalid types, no accidental fallback.\n";
