'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const E=require('./public/evidence.js');
const r=(id,kind,label,importance='essential',extra={})=>({id,kind,label,importance,...extra});
const requirements=[r('ct','modality','Cardiac CT'),r('report','activity','Image interpretation'),r('adults','population','Adults'),r('cad','condition','Coronary artery disease'),r('research','research','Diagnostic study evaluation','preferred')];
const brief={requirements};
function evidence(id,text,type='clinical-practice',extra={}){return {id,candidateId:'candidate',sourceRecordId:'record-'+id,text,type,field:'about',dates:{sourceDate:null},sourceUrl:null,...extra};}
function row(requirement,ps,status='documented'){return {requirementId:requirement.id,...requirement,status,note:'Confirm scope and current activity.',evidenceIds:ps.map(p=>p.id),supportingEvidence:ps.map(p=>({evidenceId:p.id,text:p.sourceQuote||p.text,kind:'source-quote',evidenceType:p.type,sourceDate:p.dates?.sourceDate,limits:p.review?.limitations||[]}))};}
function fixture(){
  const fragment=evidence('fragment','The professional profile records cardiac coronary CT experience.','clinical-practice',{sourceQuote:'cardiac coronary CT',reviewedParaphrase:true,attribution:'verified-source',review:{limitations:['Undated profile; current activity needs confirmation.']}}),activity=evidence('activity','I supervise and report adult cardiac/coronary CT.');
  const c={id:'candidate',name:'Fictional professional',evidence:[fragment,activity],requirementMatrix:[row(requirements[0],[fragment,activity]),row(requirements[1],[activity]),row(requirements[2],[activity]),row(requirements[3],[],'unknown'),row(requirements[4],[],'unknown')]};return {c,fragment,activity};
}

test('explicit reporting scope wins over a same-type topic fragment before quote deduplication',()=>{
  const {c,activity}=fixture(),saved=structuredClone(c),proofs=E.cardProofs(c,brief);
  assert.equal(proofs.length,1);assert.equal(proofs[0].support.text,activity.text);assert.equal(proofs[0].match.requirementId,'report');
  assert.deepEqual(new Set(proofs[0].coveredRequirementIds),new Set(['ct','report','adults']));
  assert.equal(E.supportFor(c,c.requirementMatrix[0],brief)[0].support.text,activity.text);
  assert.deepEqual(c,saved,'presentation must not mutate ranking or retained evidence');
});

test('listed disease interest stays visibly distinct from recorded reporting activity',()=>{
  const {c}=fixture(),interest=evidence('interest','coronary heart disease','clinical-interest');c.evidence.push(interest);c.requirementMatrix[3]=row(requirements[3],[interest]);
  const proof=E.cardProofs(c,brief);assert.equal(proof.length,2);assert.equal(proof[1].support.evidenceType,'clinical-interest');
  const cad=E.outcome(c.requirementMatrix[3],c,requirements[3]),report=E.outcome(c.requirementMatrix[1],c,requirements[1]);
  assert.equal(cad.status,'documented');assert.equal(cad.label,'Listed interest');assert.match(cad.note,/does not establish performed clinical work/);
  assert.equal(report.label,'Recorded activity');assert.match(report.note,/current relevance still need confirmation/);
});

test('an additional weaker modality interest does not take the second card slot',()=>{
  const {c}=fixture(),interest=evidence('interest','Cardiac CT','clinical-interest');c.evidence.push(interest);const q=c.requirementMatrix[0];q.evidenceIds.push(interest.id);q.supportingEvidence.push(...row(requirements[0],[interest]).supportingEvidence);
  assert.equal(E.cardProofs(c,brief).length,1);
});

test('a new condition requirement remains visible before a generic population role',()=>{
  const {c}=fixture(),adult=evidence('adult','I am a general adult cardiologist.'),interest=evidence('condition','coronary heart disease','clinical-interest');
  c.evidence.push(adult,interest);c.requirementMatrix[2]=row(requirements[2],[adult]);c.requirementMatrix[3]=row(requirements[3],[interest]);
  const selected=E.cardProofs(c,brief);assert.deepEqual(selected.map(p=>p.match.requirementId),['report','cad']);assert.equal(selected[1].support.evidenceType,'clinical-interest');
});

test('scoped evidence type takes precedence over a broad parent biography type',()=>{
  const p=evidence('mixed','My interests include cardiac CT. I perform knee surgery.');const q=row(requirements[0],[p]);q.supportingEvidence[0].text='My interests include cardiac CT.';q.supportingEvidence[0].evidenceType='clinical-interest';const c={id:'candidate',evidence:[p],requirementMatrix:[q]};
  assert.equal(E.outcome(q,c,requirements[0]).label,'Listed interest');assert.equal(E.cardProofs(c,brief)[0].support.evidenceType,'clinical-interest');
});

test('potential, negative and unknown evidence never becomes positive activity support',()=>{
  const p=evidence('qualification','I do not report cardiac CT.');
  for(const status of ['mismatch','needs-review','unknown']){const q=row(requirements[1],[p],status),c={id:'candidate',evidence:[p],requirementMatrix:[q]};assert.equal(E.cardProofs(c,brief).length,0);assert.notEqual(E.outcome(q,c,requirements[1]).label,'Recorded activity');}
  const p2=evidence('training','I completed training in cardiac CT.','training'),q=row(requirements[0],[p2],'potential'),c={id:'candidate',evidence:[p2],requirementMatrix:[q]};
  assert.equal(E.outcome(q,c,requirements[0]).label,'Potential relevance');assert.match(E.outcome(q,c,requirements[0]).meaning,/does not establish current/);
});

test('historical coauthorship retains reviewed-summary wording, date and every limitation',()=>{
  const p=evidence('study','The recorded author coauthored a 2010 primary-care skin-lesion study protocol.','research',{reviewedParaphrase:true,sourceQuote:'A Fictional Author',dates:{sourceDate:'2010-04-01'},review:{limitations:['Historical coauthorship only.','Not proof of diagnostic study appraisal.']}});
  const q=row(requirements[4],[p],'potential');q.supportingEvidence[0].text=p.text;q.supportingEvidence[0].kind='reviewed-summary';
  const c={id:'candidate',evidence:[p],requirementMatrix:[q]},proof=E.supportFor(c,q,brief)[0];
  assert.equal(proof.support.kind,'reviewed-summary');assert.equal(proof.support.text,p.text);assert.equal(proof.support.sourceDate,'2010-04-01');assert.deepEqual(proof.support.limits,p.review.limitations);assert.equal(proof.evidence.sourceQuote,'A Fictional Author');
  assert.equal(E.outcome(q,c,requirements[4]).label,'Potential relevance');
});

test('all essential gaps and preferences remain separately named, with source qualifications intact',()=>{
  const {c}=fixture();c.requirementMatrix[1]={...c.requirementMatrix[1],status:'potential'};c.requirementMatrix[2]={...c.requirementMatrix[2],status:'unknown'};
  const more=r('current','currentPractice','Current clinical practice'),b={requirements:[...requirements,more,r('context','question','Consequences of errors'),r('exclude','role','Dermatologist','essential',{polarity:'exclude'})]};
  const gaps=E.gaps(c,b);assert.deepEqual(gaps.essential.map(g=>g.label),['Image interpretation','Adults','Coronary artery disease','Current clinical practice']);assert.deepEqual(gaps.preferred.map(g=>g.label),['Diagnostic study evaluation']);assert.ok(gaps.essential.every(g=>g.requirementId&&g.note));assert.equal(gaps.essential[0].status,'potential');
});

test('exclusion outcomes describe restrictions and source negation without positive role claims',()=>{
  const requirement=r('exclude','role','Dermatologist','essential',{polarity:'exclude'});
  for(const status of ['documented','mismatch','unknown']){const value=E.outcome({...requirement,requirementId:requirement.id,status},{id:'candidate',evidence:[]},requirement);assert.equal(value.label,'Role exclusion filter');if(status==='mismatch')assert.match(value.note,/not a positive role claim/);if(status==='unknown')assert.match(value.note,/does not prove absence/);}
});

test('source spans must be owned, present in the matrix and literal retained text',()=>{
  const {c}=fixture(),q=c.requirementMatrix[0];q.supportingEvidence.unshift({evidenceId:'invented',text:'Invented quote',evidenceType:'clinical-practice'});
  q.supportingEvidence.push({...q.supportingEvidence[1],text:'Unstored doctor qualification'});c.evidence.push(evidence('foreign','Foreign doctor claim','clinical-practice',{candidateId:'someone-else'}));q.evidenceIds.push('foreign');q.supportingEvidence.push({evidenceId:'foreign',text:'Foreign doctor claim'});
  assert.deepEqual(E.supportFor(c,q,brief).map(item=>item.support.evidenceId),['activity','fragment']);
});

test('legacy saved evidence without supportingEvidence gets labelled source text, never an inferred source quote',()=>{
  const p=evidence('reviewed','Reviewed historical research description.','research',{reviewedParaphrase:true,sourceQuote:'A name'}),q={requirementId:'research',status:'potential',evidenceIds:[p.id]},c={id:'candidate',evidence:[p],requirementMatrix:[q]};
  const proof=E.supportFor(c,q,brief)[0];assert.equal(proof.support.kind,'reviewed-summary');assert.equal(proof.support.text,p.text);assert.equal(proof.support.sourceQuote,'A name');
});

test('canonical record links target an exact owned-record selection without trusting source URLs',()=>{
  assert.equal(E.recordUrl('candidate','proof','https://demo.example/path'), 'https://demo.example/api/expert/sources/candidate?evidence=proof#evidence-proof');
  const url=new URL(E.recordUrl('a/b','id &fragment','https://demo.example'));assert.equal(url.pathname,'/api/expert/sources/a%2Fb');assert.equal(url.searchParams.get('evidence'),'id &fragment');assert.equal(decodeURIComponent(url.hash),'#evidence-id &fragment');
  assert.equal(E.recordUrl('a','e','javascript:alert(1)'),null);assert.equal(E.recordUrl('a','e','https://user:secret@example.com'),null);assert.equal(E.recordUrl('a','e',undefined),null);
});

test('stored provenance links retain secondary URLs and separate dates, reject unsafe URLs and deduplicate safely',()=>{
  const e=evidence('p','Professional text','clinical-practice',{sourceUrl:'https://example.org/one',sourceLabel:'Provider',dates:{sourceDate:'2018'},sources:[{sourceUrl:'https://example.org/one',sourceRecordId:'another',sourceLabel:'Provider',dates:{sourceDate:'2019'}},{sourceUrl:'https://example.org/two',sourceRecordId:'secondary',sourceLabel:'Publisher',dates:{sourceDate:'2010'}},{sourceUrl:'javascript:alert(1)'},{sourceUrl:'https://user:password@example.org/secret'}]});
  const links=E.sourceLinks(e);assert.equal(links.length,2);assert.equal(links[0].provenance.length,2);assert.equal(links[1].dates.sourceDate,'2010');assert.equal(links[1].sourceRecordId,'secondary');assert.deepEqual(E.sourceLinks(evidence('missing','text')),[]);
});

test('browser export exposes the same pure API as Node without requiring DOM or storage',()=>{
  const context={URL};vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('./public/evidence.js'),'utf8'),context);assert.deepEqual(Object.keys(context.DocMapEvidence),Object.keys(E));assert.equal(context.DocMapEvidence.typeLabel('clinical-interest'),'Listed interest');assert.equal(context.DocMapEvidence.recordUrl('p','e','https://example.org'),E.recordUrl('p','e','https://example.org'));
});
