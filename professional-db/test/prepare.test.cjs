'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),P=require('../prepare.cjs'),I=require('../importer.cjs'),{fixture}=require('./fixture.cjs');
test('bounded repair preparation equals whole-packet frozen adapter across batch boundaries',async()=>{
  const root=path.resolve(__dirname,'../.private/prepare-test-'+Date.now());await fs.mkdir(root,{recursive:true});const f=await fixture(root,'test-preparation');
  const checked=await I.preflight(f.bindingFile,f.bindingSha256),expected=checked.adapter.applyRepairs(f.rows,f.packet,{baselineSha256:f.manifest.baseline.sha256,releaseId:f.pin.releaseId}).rows;
  let n=0;for await(const record of P.lines(checked.prepared.preparedFile)){assert.equal(record.ordinal,n);assert.deepEqual(record.projected,I.privacy(expected[n]).row);assert.deepEqual(record.original,I.privacy(f.rows[n]).row);n++;}assert.equal(n,expected.length);assert.equal(checked.prepared.receipt.bindingSha256,f.bindingSha256);
  const file=path.join(root,'envelope.json');await fs.writeFile(file,'{"rows":[{"text":"\\\"nested 😀"}],"readerVersion":1,"fetchedAt":null}');assert.deepEqual(await P.envelope(file,['rows']),{rows:null,readerVersion:1,fetchedAt:null});
  const ndjson=path.join(root,'literal-separators.ndjson'),records=[{text:'CT\u2028MR\u2029No',qualifiers:['negative']},{text:'😀'.repeat(50000)}];await fs.writeFile(ndjson,records.map(v=>JSON.stringify(v)+'\n').join(''));const restored=[];for await(const item of P.lines(ndjson))restored.push(item);assert.deepEqual(restored,records);
});
