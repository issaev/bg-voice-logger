<?php
// No external Google services are used: cryptographic tests use an ephemeral RSA key.
define('ABSPATH','/tmp/');
define('HOUR_IN_SECONDS',3600);
function bvlog_settings(){return ['auth_mode'=>'google','google_client_id'=>'1234-demo.apps.googleusercontent.com'];}
function get_transient($key){return $GLOBALS['jwk'];}
function set_transient($key,$value,$ttl){}
function wp_salt($key){return 'test-only-random-secret';}
function is_user_logged_in(){return false;}
function wp_remote_get(){throw new Exception('Unexpected live request');}
require __DIR__.'/../includes/class-bvlog-auth.php';
function base64url($str){return rtrim(strtr(base64_encode($str),'+/','-_'),'=');}
$key=openssl_pkey_new(['private_key_type'=>OPENSSL_KEYTYPE_RSA,'private_key_bits'=>2048]);
$details=openssl_pkey_get_details($key);
$GLOBALS['jwk']=[['kid'=>'test-key-1','kty'=>'RSA','n'=>base64url($details['rsa']['n']),'e'=>base64url($details['rsa']['e'])]];
$make=function($aud)use($key){
  $head=base64url(json_encode(['alg'=>'RS256','kid'=>'test-key-1']));
  $body=base64url(json_encode(['aud'=>$aud,'iss'=>'https://accounts.google.com','iat'=>time(),'exp'=>time()+1200,
    'sub'=>'123456789098765432','email'=>'operator@example.com','email_verified'=>true,'name'=>'Rescue Operator']));
  $payload=$head.'.'.$body;
  openssl_sign($payload,$signature,$key,OPENSSL_ALGO_SHA256);
  return $payload.'.'.base64url($signature);
};
$rm=(new ReflectionClass('BVLOG_Auth'))->getMethod('verify_id_token');
$ok=$rm->invoke(null,$make('1234-demo.apps.googleusercontent.com'),'1234-demo.apps.googleusercontent.com');
if(!$ok||$ok['sub']!=='123456789098765432'){fwrite(STDERR,"FAILED good JWT\n");exit(1);}
$wrong=$rm->invoke(null,$make('other-client-id'),'1234-demo.apps.googleusercontent.com');
if($wrong!==null){fwrite(STDERR,"FAILED wrong audience\n");exit(1);}
$token=$make('1234-demo.apps.googleusercontent.com');
$parts=explode('.',$token);$parts[2]=base64url('tampered');
if($rm->invoke(null,implode('.',$parts),'1234-demo.apps.googleusercontent.com')!==null){fwrite(STDERR,"FAILED tampered signature\n");exit(1);}
echo "PASS: Google ID token RS256 cryptography, issuer/audience, signature rejection.\n";
