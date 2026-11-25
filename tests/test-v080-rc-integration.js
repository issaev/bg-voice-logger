// Combined v0.8.3 release-candidate smoke test. No real device, network, or data.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.join(__dirname,'..');
const files={
  app:fs.readFileSync(path.join(root,'assets/app.js'),'utf8'),
  css:fs.readFileSync(path.join(root,'assets/app.css'),'utf8'),
  sw:fs.readFileSync(path.join(root,'assets/sw.js'),'utf8'),
  plugin:fs.readFileSync(path.join(root,'bg-voice-logger.php'),'utf8')
};
const {app,css,sw,plugin}=files;
const markers=[
  'function selectExistingDocument(id)',
  'selectedDocRef.current',
  'selectedDocManualRef.current',
  'function scheduleReadRetry(id,error,automatic)',
  'const READ_RETRY_DELAYS_MS = [5000,15000,30000];',
  'MAX_TRANSIENT_WRITE_ATTEMPTS = 5',
  "const SYNC_TAG = 'bvlog-outbox-v1';",
  'function requestBackgroundSync()',
  "capture:'environment'",
  "className:'bv-brand-title'",
  "h('button',{type:'button',className:'bv-install-btn'",
  "h('button',{type:'button',className:'bv-install-help-close'",
  'async function uploadExistingPhoto(entry,files)'
];
for(const marker of markers)assert.ok(app.includes(marker),'Missing combined feature: '+marker);
assert.ok(app.includes("setDocsError('Избраната акция вече не е налична"));
assert.ok(app.includes("const chosen=docs.find(d=>d.id===selectedDocRef.current && d.id===selectedDoc)"));
assert.ok(!app.includes("onClick:importLegacyQueue},'Импорт на стари записи"));
assert.ok(!app.includes('DB_SCHEMA = 3'),'Queue schema migration would break rollback');
assert.ok(app.includes('const DB_SCHEMA = 2;'));
assert.ok(sw.includes("const BV_LOCK_DB = 'bg-voice-logger-sync-leases-v1';"));
assert.ok(sw.includes('BV_BG_MAX_OPS = 3'));
assert.ok(sw.includes('BV_BG_MAX_PHOTO_BYTES = 4 * 1024 * 1024'));
assert.ok(sw.includes('BV_BG_CHUNK = 262144'));
assert.ok(plugin.includes('self.BVLOG_API_ROOT')&&plugin.includes('self.BVLOG_NONCE_URL'));
assert.ok(!sw.includes('sessionStorage')&&!sw.includes('localStorage'));
assert.ok(css.includes('#bvlog-root .bv-install-btn'));
assert.ok(css.includes('#bvlog-root .bv-header .bv-brand .bv-brand-title'));
assert.ok(plugin.includes('apple-touch-icon'));
// JS build must be the exact digest expected by the shipped PHP plugin.
const m=app.match(/const BVLOG_RUNNING_BUILD = '([^']+)';/);
assert.ok(m);const canonical=app.replace(/const BVLOG_RUNNING_BUILD = '[A-Za-z0-9._-]+';/,
  "const BVLOG_RUNNING_BUILD = '__BUILD_PLACEHOLDER__';");
const expected='0.8.3-'+crypto.createHash('sha256').update(canonical).digest('hex').slice(0,12);
assert.equal(m[1],expected);
console.log('PASS v0.8 RC combined: install + UI + stable selection + bounded retry + SW and rollback-safe queue.');
