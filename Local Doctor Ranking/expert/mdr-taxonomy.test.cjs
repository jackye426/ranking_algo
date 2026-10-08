'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const taxonomy=require('./mdr-taxonomy.cjs'),registry=require('./classification-registry.cjs'),data=require('./data/mdr-2017-2185.json');
const range=(prefix,from,to)=>Array.from({length:to-from+1},(_,i)=>prefix+String(from+i).padStart(4,'0'));
const expected=[...range('MDA',101,104),...range('MDA',201,204),...range('MDA',301,318),...range('MDN',1101,1104),...range('MDN',1201,1214),...range('MDS',1001,1014),...range('MDT',2001,2013)];

test('pinned catalogue contains all and only the 71 MDR designation codes',()=>{
  assert.deepEqual(data.nodes.map(n=>n.code),expected);
  assert.deepEqual(taxonomy.getMetadata().familyCounts,{MDA:26,MDN:18,MDS:14,MDT:13});
  assert.equal(createHash('sha256').update(JSON.stringify(data.nodes)).digest('hex'),taxonomy.getMetadata().catalogueSha256);
  assert.equal(taxonomy.getMetadata().sourceSha256,'aaba13eb6865c3e84c3638bb7068471b492093bd8e39a3819d14276315cc44da');
  for(const code of expected){const n=taxonomy.lookup(code);assert.equal(n.system,'MDR');assert.equal(n.family,code.slice(0,3));assert(n.term.length>3);assert(n.source.page>=8&&n.source.page<=23);assert.deepEqual(n.path,[{code,term:n.term}]);}
});

test('source labels and source pages exclude illustrative devices and conditions',()=>{
  assert.equal(taxonomy.lookup('MDA0315').term,'Software');assert.equal(taxonomy.lookup('MDA0315').source.page,12);
  assert.equal(taxonomy.lookup('MDA0201').term,'Active non-implantable imaging devices utilising ionizing radiation');
  assert.equal(taxonomy.lookup('MDA0202').term,'Active non-implantable imaging devices utilising non-ionizing radiation');
  assert.equal(taxonomy.lookup('MDS1005').term,'Devices in sterile condition');
  assert.equal(taxonomy.lookup('MDT2010').term,'Devices manufactured using electronic components including communication devices');
  assert.match(taxonomy.lookup('MDS1009').term,/including devices intended for controlling, monitoring or directly influencing/);
  assert.match(taxonomy.lookup('MDS1004').termRaw,/Council1$/);assert.match(taxonomy.lookup('MDS1004').term,/Council$/);
  assert.match(taxonomy.lookup('MDN1214').term,/other non-active non-implantable devices$/);
  assert(!taxonomy.lookup('MDA0201').term.includes('PET'));assert(!taxonomy.lookup('MDS1005').term.includes('ethylene'));
});

test('cosmetic MDR forms normalize while malformed codes never get repaired',()=>{
  for(const value of ['MDA0315','mda0315',' MDA 0315 ','MDA-0315','mda - 0315','MDA\t0315','MDA\u00a00315'])assert.equal(taxonomy.normalizeCode(value),'MDA0315',value);
  for(const value of ['MDA031','MDA03150','MDA 03 15','MDA--0315','MDA_0315','MDA03I5','MDX0315','MDR0315','MDA0315foo','MDA0315/MDT2010',{},null,315])assert.equal(taxonomy.normalizeCode(value),null,String(value));
  assert.equal(taxonomy.lookup('MDA9999'),null);assert.equal(taxonomy.lookup('IVR1001'),null);
});

test('mixed sets preserve systems, positions, order and deduplicated identity',()=>{
  const message='Use EMDN Z11030692 + mda 0315; MDS-1009 and MDT2010, MDA0315 for coronary disease';
  const d=registry.detectCodes(message);
  assert.deepEqual(d.classifications,[{system:'EMDN',code:'Z11030692'},{system:'MDR',code:'MDA0315'},{system:'MDR',code:'MDS1009'},{system:'MDR',code:'MDT2010'}]);
  assert.equal(d.references.length,5);assert.deepEqual(d.invalidCodes,[]);assert.deepEqual(d.unsupportedCodes,[]);
  for(const r of d.references){assert.equal(message.slice(r.start,r.end),r.input);assert(r.valid);}
  assert.equal(registry.resolveSet(message).nodes.length,4);
  for(const message of ['MDA0315 + V92','V92 + MDA0315','V92 + A01 + MDA0315'])assert.equal(registry.detectCodes(message).classifications.length,message.includes('A01')?3:2,message);
  assert.equal(registry.resolveSet('MDA0315 + E92').valid,false);
});

test('unknown and malformed tokens reject the complete selection atomically',()=>{
  for(const bad of ['MDA9999','MDA031','MDA03150','MDA 03 15','MDA--0315','MDA_0315','MDA0315fake','MDX0315','MDR0315','MDS']){
    const d=registry.resolveSet('Z11030692 + MDA0315 + '+bad);
    assert.equal(d.valid,false,bad);assert.deepEqual(d.classifications,[],bad);assert.deepEqual(d.nodes,[],bad);assert(d.invalidCodes.length,bad);
  }
  assert.equal(registry.detectCodes('MDA 03 15').references[0].input,'MDA 03 15');
  assert.equal(registry.detectCodes('MDA 03 15').references[0].reason,'invalid-format');
  assert.equal(registry.detectCodes('MDA9999').references[0].reason,'not-in-release');
});

test('IVDR-shaped codes are explicitly unsupported and cannot partially apply a mixed set',()=>{
  for(const code of ['IVR1001','IVP 2001','IVS-1001','IVT3001']){
    const d=registry.resolveSet('MDA0315 and '+code);assert.equal(d.valid,false);assert.equal(d.unsupportedCodes.length,1);assert.deepEqual(d.classifications,[]);
    assert.equal(d.references.at(-1).system,'IVDR');assert.equal(d.references.at(-1).reason,'unsupported-system');
  }
});

test('regulation titles and ordinary clinical acronyms never activate designation lookup',()=>{
  for(const message of ['MDR','MDS','MDT','MDR tuberculosis','MDS clinic','MDS EB2 and MDT meeting','MDR 2017/745','IVDR 2017/746','an MDT discussion about vitamin B12 and T2 MRI','a multidrug-resistant infection']){
    const d=registry.detectCodes(message);assert.deepEqual(d.classifications,[],message);assert.deepEqual(d.invalidCodes,[],message);assert.deepEqual(d.unsupportedCodes,[],message);
  }
});

test('explicit system mismatches are errors rather than relabelled classifications',()=>{
  for(const message of ['EMDN MDA0315','MDR Z11030692','IVDR MDA0315']){
    const d=registry.resolveSet(message);assert.equal(d.valid,false,message);assert.equal(d.references[0].reason,'system-mismatch',message);
  }
  assert.equal(registry.lookup({system:'EMDN',code:'MDA0315'}),null);
  assert.equal(registry.lookup({system:'MDR',code:'Z11030692'}),null);
});

test('typed selections are bounded, safe, canonical and atomic',()=>{
  const d=registry.resolveSet([{system:'MDR',code:'mda-0315'},{system:'EMDN',code:'Z11030692'},'MDA 0315']);
  assert(d.valid);assert.equal(d.classifications.length,2);assert.equal(d.nodes[0].code,'MDA0315');
  assert.equal(registry.resolveSet(['MDA0315','nonsense']).valid,false);
  assert.equal(registry.resolveSet(['MDA0315',{system:'IVDR',code:'IVR1001'}]).unsupportedCodes.length,1);
  for(const value of [{system:'__proto__',code:'MDA0315'},{system:'constructor',code:'MDA0315'},{system:{},code:'MDA0315'},null,{},42])assert.equal(registry.lookup(value),null);
  assert.equal(registry.resolveSet(Array(32).fill('MDA0315')).valid,true);
  assert.equal(registry.resolveSet(Array(33).fill('MDA0315')).valid,false);
  assert.equal(registry.resolveSet([]).valid,false);
});

test('catalogue lookup supplies clarification and never manufactures clinical or technical expertise',()=>{
  for(const code of expected){assert.equal(taxonomy.getMapping(code),null);assert.equal(taxonomy.getClarification(code).required,true);}
  assert.equal(taxonomy.getClarification('MDA0315').type,'device-purpose');
  assert.equal(taxonomy.getClarification('MDA0201').type,'clinical-application');
  for(const code of ['MDS1005','MDT2010'])assert.equal(taxonomy.getClarification(code).type,'technical-context');
  assert.equal(registry.getMapping('Z11030692').label,'CT software');
  assert.match(taxonomy.lookup('MDA0315').limitations.join(' '),/not.*evidence/i);
});

test('lookup and metadata are immutable and catalogue identity remains stable',()=>{
  const n=taxonomy.lookup('MDA0315'),meta=taxonomy.getMetadata();assert(Object.isFrozen(n));assert(Object.isFrozen(n.path));assert(Object.isFrozen(meta.limitations));
  assert.throws(()=>{n.term='Invented';});assert.throws(()=>{meta.familyCounts.MDA=0;});
  assert.equal(registry.getMetadata('MDR').taxonomyDigest,meta.catalogueSha256);
  assert.equal(registry.getMetadata('EMDN').taxonomyDigest,require('./emdn-taxonomy.cjs').getMetadata().workbookSha256);
  assert.equal(registry.getMetadata('IVDR'),null);assert.equal(taxonomy.lookup('MDA0315').term,'Software');
});
