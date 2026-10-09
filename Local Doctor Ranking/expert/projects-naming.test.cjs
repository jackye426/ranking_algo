'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),P=require('./public/projects.js');
const requirement=(id,label,kind,extra={})=>({id,label,text:label,kind,importance:'focus',...extra});
const cardiac={version:1,requirements:[requirement('ct','Cardiac CT','modality'),requirement('cad','Coronary disease','condition')]};
const skin={version:2,requirements:[requirement('skin','Dermoscopy','modality')]};
const accepted=(name='Assessment 14',brief=cardiac)=>P.setBrief(P.createProject(name),brief,'corpus-v1');

test('first accepted clinical scope names automatic projects without changing stored identity',()=>{
  const p=P.createProject('Assessment 14'),before=structuredClone(p),next=P.setBrief(p,cardiac,'corpus-v1');
  assert.equal(P.projectTitle(next),'Cardiac CT · Coronary disease');assert.equal(next.automaticTitle,'Cardiac CT · Coronary disease');assert.equal(next.name,'Assessment 14');assert.equal(next.nameSource,'automatic');assert.equal(next.id,p.id);assert.deepEqual(p,before);
});

test('later refinement, removed criteria and evidence refresh do not rename accepted work',()=>{
  let p=accepted();for(const brief of [skin,{version:3,requirements:[]},cardiac])p=P.setBrief(p,brief,'corpus-v2');
  assert.equal(P.projectTitle(p),'Cardiac CT · Coronary disease');assert.equal(p.automaticTitle,'Cardiac CT · Coronary disease');
});

test('automatic title survives the 100-version retention boundary',()=>{
  let p=accepted();for(let version=2;version<=105;version++)p=P.setBrief(p,{version,requirements:[requirement('focus-'+version,'Skin topic '+version,'condition')]},'corpus-v1');
  assert.equal(p.briefVersions.length,100);assert.ok(p.briefVersions[0].brief.version>1);assert.equal(P.projectTitle(p),'Cardiac CT · Coronary disease');
});

test('legacy placeholders derive from first retained accepted brief without rewriting a backup',()=>{
  const p=accepted();delete p.nameSource;delete p.automaticTitle;p.activeBrief=skin;p.briefVersions.push({brief:skin,corpusVersion:'corpus-v1'});const before=structuredClone(p);
  assert.equal(P.projectTitle(p),'Cardiac CT · Coronary disease');assert.deepEqual(p,before);assert.deepEqual(JSON.parse(P.exportJSON(p)).project,p);
  const next=P.setBrief(p,skin,'corpus-v1');assert.equal(next.automaticTitle,'Cardiac CT · Coronary disease');assert.equal(next.name,'Assessment 14');
});

test('legacy active brief is a fallback when history is absent',()=>{
  const p=P.createProject('My assessment');delete p.nameSource;p.activeBrief=cardiac;
  assert.equal(P.projectTitle(p),'Cardiac CT · Coronary disease');assert.equal(p.automaticTitle,undefined);
});

test('custom and explicitly chosen placeholder-looking names remain user-owned',()=>{
  for(const name of ['Scarlet pilot','Assessment 14','Assessment14','My assessment','Untitled assessment']){
    const p=P.setBrief(P.createProject(name,{nameSource:'user'}),cardiac,'corpus-v1');assert.equal(P.projectTitle(p),name);assert.equal(p.automaticTitle,undefined);
    const restored=P.importJSON(P.exportJSON(p));assert.equal(P.projectTitle(restored),name);assert.equal(restored.nameSource,'user');
  }
  const legacy=P.createProject('My chosen project');delete legacy.nameSource;assert.equal(P.projectTitle(P.setBrief(legacy,cardiac,'corpus-v1')),'My chosen project');
});

test('rename keeps IDs, evidence, decisions, notes and active scope intact',()=>{
  const p=accepted();p.notes='Private team note';p.events=[{id:'event-1',actor:'user',type:'meeting-recorded'}];p.candidates=[{candidate:{id:'one'},needsReview:false,qualification:'reviewed-by-team',decisions:[{actor:'user',value:'reviewed-by-team'}]}];const before=structuredClone(p),scope=P.scope(p.activeBrief);
  const next=P.renameProject(p,'  Assessment14  ',{actor:'user'});assert.equal(P.projectTitle(next),'Assessment14');assert.equal(next.nameSource,'user');assert.equal(next.id,p.id);assert.equal(P.scope(next.activeBrief),scope);assert.deepEqual(next.candidates,p.candidates);assert.deepEqual(next.events,p.events);assert.equal(next.notes,p.notes);assert.deepEqual(next.briefVersions,p.briefVersions);assert.deepEqual(p,before);
  assert.equal(P.projectTitle(P.setBrief(next,skin,'corpus-v1')),'Assessment14');
});

test('rename rejects invalid names and non-user callers without mutation',()=>{
  const p=accepted(),before=structuredClone(p);for(const name of ['', '   ',null,'x'.repeat(121),'A\nB','A\u0000B'])assert.throws(()=>P.renameProject(p,name,{actor:'user'}),/between 1 and 120/);
  assert.throws(()=>P.renameProject(p,'An AI title',{actor:'ai'}),/Only a user/);assert.equal(P.renameProject(p,'x'.repeat(120)).name.length,120);assert.deepEqual(p,before);
});

test('titles exclude negated roles and administrative requirements and prefer clinical focus',()=>{
  const brief={requirements:[requirement('geo','UK','geography'),requirement('reg','Regulatory approval','regulatory'),requirement('practice','Current practice','currentPractice'),requirement('device','Software','technology'),requirement('q','Find available assessors','question'),requirement('flow','Procurement','workflow'),requirement('no','Dermatologist','role',{polarity:'exclude'}),requirement('optional','Validation research','research',{importance:'preferred'}),...cardiac.requirements]};
  assert.equal(P.projectTitle(accepted('My assessment',brief)),'Cardiac CT · Coronary disease');
  const noTopic=accepted('My assessment',{requirements:brief.requirements.slice(0,7)});assert.equal(noTopic.automaticTitle,undefined);assert.equal(P.projectTitle(noTopic),'My assessment');
});

test('clinical topic generation keeps exact short modalities and bounds long labels',()=>{
  assert.equal(P.projectTitle(accepted('My assessment',{requirements:[requirement('ct','CT','modality'),requirement('mr','MR','modality')]})),'CT · MR');
  assert.equal(P.projectTitle(accepted('My assessment',{requirements:[requirement('x','Requested expertise','activity',{text:'Radioactive brain implants'})]})),'Radioactive brain implants');
  const title=P.projectTitle(accepted('My assessment',{requirements:[requirement('x','A detailed clinically requested topic '.repeat(5),'condition')]}));assert.ok(title.length<=70);assert.ok(title.endsWith('…'));
});

test('pending classification labels are temporary and proposed clinical scope cannot freeze a title',()=>{
  const p=P.createProject('My assessment');p.pendingClarification={proposedBrief:skin,deviceDraft:{classifications:[{code:'MDA0315'},{code:'MDS1009'},{code:'MDT2010'}]}};const before=structuredClone(p);
  assert.equal(P.projectTitle(p),'MDA0315 +2 codes');assert.equal(p.automaticTitle,undefined);assert.deepEqual(p,before);
  assert.equal(P.projectTitle({...accepted(),pendingClarification:p.pendingClarification}),'Cardiac CT · Coronary disease');
  const next=P.setBrief(p,skin,'corpus-v1');assert.equal(P.projectTitle(next),'Dermoscopy');assert.equal(next.automaticTitle,'Dermoscopy');
});

test('JSON import preserves naming metadata, custom names and frozen clinical title',()=>{
  for(const p of [accepted(),P.renameProject(accepted(),'Team shortlist')]){const restored=P.importJSON(P.exportJSON(p));assert.notEqual(restored.id,p.id);assert.equal(restored.importedFrom,p.id);assert.equal(restored.name,p.name);assert.equal(restored.nameSource,p.nameSource);assert.equal(restored.automaticTitle,p.automaticTitle);assert.equal(P.projectTitle(restored),P.projectTitle(p));assert.deepEqual(restored.briefVersions,p.briefVersions);assert.deepEqual(restored.activeBrief,p.activeBrief);}
});

test('optional title metadata is validated without upgrading legacy schema',()=>{
  const p=P.createProject();delete p.nameSource;assert.equal(P.validateProject(p).schema,1);
  for(const fields of [{nameSource:'model'},{automaticTitle:''},{automaticTitle:null},{automaticTitle:'x'.repeat(71)},{automaticTitle:'Bad\nname'}])assert.throws(()=>P.validateProject({...p,...fields}),/naming information/);
  assert.equal(P.validateProject({...p,nameSource:'automatic',automaticTitle:'CT'}).automaticTitle,'CT');
});

test('recent sorting is deterministic, numeric-aware and leaves input order unchanged',()=>{
  const make=(id,name,updatedAt,createdAt=updatedAt)=>({...P.createProject(name,{nameSource:'user'}),id,updatedAt,createdAt});
  const projects=[make('old','Assessment 1','2026-10-01'),make('ten','Assessment 10','2026-10-08'),make('two','Assessment 2','2026-10-08'),make('new-created','Assessment 20','2026-10-08','2026-10-09'),make('invalid','Assessment 3','unknown')],before=projects.map(p=>p.id);
  assert.deepEqual(P.sortProjects(projects).map(p=>p.id),['new-created','two','ten','old','invalid']);assert.deepEqual(projects.map(p=>p.id),before);
  const same=[make('b','Same','2026-10-08'),make('a','Same','2026-10-08')];assert.deepEqual(P.sortProjects(same).map(p=>p.id),['a','b']);
});

test('HTML pack uses escaped display title while JSON preserves original stored name',()=>{
  const p=accepted();assert.match(P.exportHTML(p),/<h1>Cardiac CT · Coronary disease<\/h1>/);assert.equal(JSON.parse(P.exportJSON(p)).project.name,'Assessment 14');
  const named=P.renameProject(p,'<Team & "notes">');const html=P.exportHTML(named);assert.match(html,/<h1>&lt;Team &amp; &quot;notes&quot;&gt;<\/h1>/);assert.doesNotMatch(html,/<h1><Team/);
});
