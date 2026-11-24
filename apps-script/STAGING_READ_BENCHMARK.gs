/**
 * Private, read-only staging benchmark driver for BG Voice Logger.
 * NOT included in production Code.gs; paste into an editor-only staging
 * Apps Script project alongside either v0.7.2.1 or v0.8.0-A Code.gs.
 * Never run against a live rescue operation.
 *
 * Mandatory Script Properties (set in EACH isolated staging project):
 *   BVLOG_BENCHMARK_ENABLED = STAGING_READ_ONLY
 *   BVLOG_BENCHMARK_VARIANT = base_0721 OR candidate_080a
 *   BVLOG_BENCHMARK_FOLDER_ID = dedicated TEST folder id
 *   BVLOG_BENCHMARK_TEMPLATE_ID = test template id
 *   BVLOG_BENCHMARK_DOC_ID = dedicated synthetic test spreadsheet id
 *
 * The test spreadsheet name MUST start with "BVLOG_BENCHMARK_".
 * No document names, IDs, cell values, secrets, or contents are printed.
 * Run one sample per editor execution. Compare 10+ paired samples per
 * variant; this measures Apps Script only, NOT WordPress HTTP stages.
 */
// Public editor entrypoint; all security checks remain in the private helper.
function runBvlogStagingReadBenchmark() {
  return bvlStageBenchmarkRead_();
}
function bvlStageBenchmarkRead_() {
  const props=PropertiesService.getScriptProperties();
  const property=name=>String(props.getProperty(name)||'');
  if(property('BVLOG_BENCHMARK_ENABLED')!=='STAGING_READ_ONLY')
    throw new Error('Staging benchmark is disabled.');
  const variant=property('BVLOG_BENCHMARK_VARIANT');
  if(!['base_0721','candidate_080a'].includes(variant))
    throw new Error('Select an allowed staging benchmark variant.');
  const folder=property('BVLOG_BENCHMARK_FOLDER_ID');
  const template=property('BVLOG_BENCHMARK_TEMPLATE_ID');
  const doc=property('BVLOG_BENCHMARK_DOC_ID');
  if(!bvlValidId_(folder)||!bvlValidId_(template)||!bvlValidId_(doc)||
    folder===doc||doc===template||folder===template)
    throw new Error('Invalid staging benchmark identifiers.');
  const file=DriveApp.getFileById(doc);
  if(file.isTrashed()||file.getMimeType()!=='application/vnd.google-apps.spreadsheet'||
     !String(file.getName()).startsWith('BVLOG_BENCHMARK_'))
    throw new Error('The target is not a designated staging benchmark spreadsheet.');
  // bvlRead_ independently enforces exact configured folder membership.
  const requestId=Utilities.getUuid().replace(/-/g,'').slice(0,12);
  const started=Date.now();
  let response;
  try{
    response=bvlRead_(folder,template,doc,requestId);
  }catch(ignore){
    const failure={kind:'bvlog_staging_read',variant,status:'exception',
      request_id:requestId,elapsed_ms:Date.now()-started};
    console.log(JSON.stringify(failure));
    throw new Error('Staging read failed; no document details are logged.');
  }
  // Include response serialization, which happens after bvlRead_ in doPost.
  const encoded=JSON.stringify(response);
  const result={kind:'bvlog_staging_read',variant,
    status:response&&response.ok===true?'ok':'rejected',
    request_id:requestId,
    elapsed_ms:Date.now()-started,
    payload_bytes:Utilities.newBlob(encoded).getSize(),
    log_rows:response&&response.data&&Array.isArray(response.data.LOG)?response.data.LOG.length:0};
  console.log(JSON.stringify(result));
  return result;
}
