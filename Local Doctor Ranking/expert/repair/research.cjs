'use strict';
// Offline preparation only. No network, model, corpus mutation or automatic
// candidate attribution. The report contains registry IDs/roles, never names,
// contact details, arbitrary source rows or registration-like numeric values.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const VERSION='research-role-review-v1';
const TRIALS='Hospital + insurance/ISRCTN UK Trials/output/trials_merged_20260209_215240.json';
const LINKS='Hospital + insurance/ISRCTN UK Trials/output/trial_practitioner_links_20260215_212218.json';
const sha=value=>createHash('sha256').update(value).digest('hex');
const https=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}};
const roleOf=row=>String(row.contacts?.[0]?.role||'');
const pi=role=>/(?:^|,\s*)Principal investigator(?:,|$)/i.test(role);
function assess(item){
  const reasons=[];
  if(!/^ISRCTN\d{8}$/.test(item.trialId||'')||!https(item.sourceUrl)||!/^[a-f0-9]{64}$/.test(item.sourceFileSha256||''))reasons.push('missing-source-provenance');
  if(item.matchMethod==='arbitrary-seven-digit-number'||item.ethicsReferenceMatch===true)reasons.push('registration-like-number-is-not-an-identity-field');
  if(item.matchMethod==='institution-only')reasons.push('institution-does-not-establish-trial-participation');
  if(item.matchMethod==='recruitment-status-only')reasons.push('study-status-does-not-establish-personal-availability-or-activity');
  if(typeof item.recordedRole!=='string'||!item.recordedRole.trim()||item.recordedRole.length>160)reasons.push('missing-recorded-role');
  if(item.proposedRole==='Principal investigator'&&!pi(item.recordedRole||''))reasons.push('first-contact-is-not-an-explicit-investigator-role');
  const identity=item.identity||{};
  if(identity.state==='conflict'||identity.state==='ambiguous')reasons.push('unresolved-person-identity');
  if(identity.state!=='reviewed'||identity.reviewed!==true||!['registration-and-independent-profile','independent-profile-and-role'].includes(identity.method)||typeof identity.candidateId!=='string'||!identity.candidateId||!Array.isArray(identity.evidenceUrls)||!identity.evidenceUrls.some(url=>https(url)&&https(url)!==https(item.sourceUrl)))reasons.push('person-identity-not-independently-reviewed');
  if(item.sourceChecked!==true)reasons.push('literal-registry-source-role-not-reviewed');
  return {caseId:item.caseId,trialId:item.trialId,status:reasons.length?'withheld':'eligible-for-reviewed-role-packet',reasons,
    recordedRole:item.recordedRole,proposedRole:item.proposedRole,sourceUrl:item.sourceUrl,sourceFileSha256:item.sourceFileSha256,
    eligibleEvidenceType:pi(item.recordedRole||'')?'research':'professional-background',
    limits:[pi(item.recordedRole||'')?'An explicit registry investigator role does not establish every trial task, authorship or current activity.':'A registry contact role does not establish investigator responsibility or performed research.',
      'Trial conditions, interventions and recruitment status describe the study, not this person\'s clinical practice or availability.'],
    candidateId:reasons.length?null:identity.candidateId};
}
function readFrozen(backup,relative,manifest){
  const record=manifest.files.find(item=>item.path.replace(/\\/g,'/')===relative);
  if(!record)throw Error('A required research source is absent from the frozen manifest.');
  const bytes=fs.readFileSync(path.join(backup,...relative.split('/')));
  if(bytes.length!==record.bytes||sha(bytes)!==record.sha256)throw Error('A research source differs from the frozen manifest.');
  return {data:JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,'')),sha256:record.sha256};
}
function makePack(backup){
  const manifest=JSON.parse(fs.readFileSync(path.join(backup,'backup-manifest.json'),'utf8'));
  const trials=readFrozen(backup,TRIALS,manifest),links=readFrozen(backup,LINKS,manifest),rows=trials.data.trials;
  if(!Array.isArray(rows)||!Array.isArray(links.data))throw Error('Unexpected frozen research schema.');
  const used=new Set(),cases=[];
  const select=(caseId,predicate,extra={})=>{
    const row=rows.find(row=>!used.has(row.isrctn_id)&&predicate(row));if(!row)throw Error('A bounded source case is unavailable: '+caseId);
    used.add(row.isrctn_id);
    const item={caseId,trialId:row.isrctn_id,sourceUrl:'https://www.isrctn.com/'+row.isrctn_id,sourceFileSha256:trials.sha256,sourceField:'contacts[0].role',recordedRole:roleOf(row),proposedRole:roleOf(row),
      sourceChecked:false,identity:{state:'unreviewed',reviewed:false},matchMethod:'recorded-contact-role',...extra};
    cases.push(item);return {row,item};
  };
  const bad=select('ethics-reference-is-not-registration',r=>r.isrctn_id==='ISRCTN35233331',{matchMethod:'arbitrary-seven-digit-number'});
  const link=links.data.find(l=>String(l.trial_id).includes('35233331')&&l.link_type==='gmc_number_match');
  const value=link?.gmc_number==null?'':String(link.gmc_number),ethics=String(bad.row.raw_csv_row?.['Ethics approval(s)']||'');
  if(!value||!ethics.includes(value))throw Error('The known ethics-reference defect was not reproduced.');
  bad.item.ethicsReferenceMatch=true;
  select('public-contact-is-not-pi',r=>roleOf(r)==='Public',{proposedRole:'Principal investigator'});
  select('scientific-contact-is-not-pi',r=>roleOf(r)==='Scientific',{proposedRole:'Principal investigator'});
  select('later-pi-does-not-promote-first-contact',r=>!pi(roleOf(r))&&r.contacts?.slice(1).some(c=>pi(c.role)),{proposedRole:'Principal investigator'});
  select('explicit-pi-needs-person-review',r=>roleOf(r)==='Principal investigator');
  select('combined-scientific-public-pi-needs-person-review',r=>pi(roleOf(r))&&/Public/.test(roleOf(r))&&/Scientific/.test(roleOf(r)));
  select('public-pi-needs-person-review',r=>roleOf(r)==='Public, Principal investigator');
  select('scientific-pi-needs-person-review',r=>roleOf(r)==='Scientific, Principal investigator');
  select('public-scientific-is-contact-only',r=>/Public/.test(roleOf(r))&&/Scientific/.test(roleOf(r))&&!pi(roleOf(r)));
  select('generic-contact-is-not-investigator',r=>roleOf(r)==='Contact',{proposedRole:'Principal investigator'});
  select('institution-is-a-lead-only',r=>!!r.sponsor,{matchMethod:'institution-only'});
  select('recruiting-study-is-not-personal-availability',r=>r.recruitment_status==='Recruiting',{matchMethod:'recruitment-status-only'});
  const assessments=cases.map(assess);
  return {schemaVersion:1,version:VERSION,mode:'offline-source-role-review',sourceFiles:[{path:TRIALS,sha256:trials.sha256},{path:LINKS,sha256:links.sha256}],
    method:'Twelve distinct archived trials selected by exact recorded contact-role shapes and known failure modes. No clinician identity or literal HTML source role has been independently reviewed; derived principal_investigator is never accepted as proof.',
    counts:{cases:cases.length,withheld:assessments.filter(a=>a.status==='withheld').length,eligible:assessments.filter(a=>a.status==='eligible-for-reviewed-role-packet').length},cases,assessments};
}
if(require.main===module){
  try{
    const args=process.argv.slice(2),at=args.indexOf('--source-backup');if(at<0||!args[at+1])throw Error('Pass --source-backup <frozen-source-backup-directory>.');
    const report=makePack(path.resolve(args[at+1]));process.stdout.write(JSON.stringify(report,null,2)+'\n');
  }catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}
}
module.exports={VERSION,assess,makePack};
