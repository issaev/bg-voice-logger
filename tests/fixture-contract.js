// Shared test metadata. Application state is addressed by name, not hook offsets.
const fs=require('fs'),assert=require('assert');
const php=fs.readFileSync(__dirname+'/../bg-voice-logger.php','utf8');
const version=php.match(/Version:\s*([0-9.]+)/)[1];
function slot(source,name){
 const app=source.slice(source.indexOf('  function App('));
 const names=[...app.matchAll(/const \[([A-Za-z][A-Za-z0-9]*),\s*set[A-Za-z0-9]+\]\s*=\s*useState\(/g)].map(x=>x[1]);
 const index=names.indexOf(name);assert(index>=0,'Missing App state '+name);return index;
}
module.exports={version,slot};
