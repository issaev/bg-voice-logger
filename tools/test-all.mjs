// Run every regression independently, including after failure. No deployment/network.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const tests=fs.readdirSync(path.join(root,'tests')).filter(x=>/^test-.*\.(js|mjs|php)$/.test(x)).sort().map(x=>'tests/'+x);
if(!process.argv.includes('--regressions-only'))tests.push('tests/known-bugs/repro-issue-48.mjs');
else console.log('KNOWN BUG #48 NOT RUN: --regressions-only explicitly excludes its failing reproduction.');
let failed=0;
for(const file of tests){
 const php=file.endsWith('.php');
 const args=php?['-d','zend.assertions=1','-d','assert.exception=1']:[];
 if(php&&process.env.PHP_EXTENSION_DIR)args.push('-d','extension_dir='+process.env.PHP_EXTENSION_DIR,'-d','extension=openssl');
 args.push(path.join(root,file));
 const r=spawnSync(php?(process.env.PHP_BINARY||'php'):process.execPath,args,{cwd:root,encoding:'utf8',timeout:60000});
 const ok=!r.error&&r.status===0;failed+=!ok;
 console.log((ok?'PASS ':'FAIL ')+file);
 if(!ok)console.log(r.error?.message||'',r.stdout||'',r.stderr||'');
}
console.log(`${tests.length-failed}/${tests.length} passed; ${failed} failed.`);
process.exitCode=failed?1:0;
