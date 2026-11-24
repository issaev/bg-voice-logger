// Isolated regression for login CSRF recovery; no live Google requests.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../assets/app.js'),'utf8');
const php=fs.readFileSync(path.join(__dirname,'../includes/class-bvlog-auth.php'),'utf8');
const sw=fs.readFileSync(path.join(__dirname,'../assets/sw.js'),'utf8');
const fn=src.slice(src.indexOf('  async function exchangeGoogleCredential('),src.indexOf('  function loadGIS()'));
function bind(cfg,api){return new Function('CFG','api',fn+'\nreturn exchangeGoogleCredential;')(cfg,api);}
(async()=>{
  const cfg={},calls=[];let count=0;
  const exchange=bind(cfg,async (p,m,data)=>{
    calls.push(p);
    if(p==='auth/session')return {login_challenge:(++count===1?'a':'b').repeat(40)};
    assert.equal(data.credential,'test');
    assert.equal(cfg.login_challenge,(count===1?'a':'b').repeat(40));
    if(count===1)throw Object.assign(new Error('race'),{code:'bvlog_login_csrf'});
    return {ok:true};
  });
  assert.deepEqual(await exchange('test'),{ok:true});
  assert.deepEqual(calls,['auth/session','auth/google','auth/session','auth/google']);
  let tries=0;
  await assert.rejects(bind({},async p=>{tries++;if(p==='auth/session')return {login_challenge:'a'.repeat(40)};throw Object.assign(new Error('not allowed'),{code:'bvlog_not_approved'});})('test'),/not allowed/);
  assert.equal(tries,2);
  tries=0;
  await assert.rejects(bind({},async p=>{tries++;if(p==='auth/session')return {login_challenge:'a'.repeat(40)};throw Object.assign(new Error('race'),{code:'bvlog_login_csrf'});})('test'),/бисквитка/);
  assert.equal(tries,4);
  tries=0;
  await assert.rejects(bind({},async p=>{tries++;return {login_challenge:''};})('test'),/защитен код/);
  assert.equal(tries,1);
  assert.ok(sw.includes('auth/session?background=1'));
  assert.ok(php.includes("get_param('background')"));
  assert.ok(php.includes('$challenge=$existing;'));
  assert.ok(php.includes('hash_equals($expected,$sent)'));
  console.log('PASS login challenge refresh, bounded retry, allowlist rejection, background read-only markers');
})().catch(e=>{console.error(e);process.exitCode=1;});
