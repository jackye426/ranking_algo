"""Revisit the twelve archived registry cases and named repair conflicts.

No contact details are exported. Name similarity is a discovery lead, never
identity approval. This script cannot add research claims to a release.
"""
import argparse,hashlib,json,re,unicodedata
from pathlib import Path
from bs4 import BeautifulSoup
from collections import Counter

def load(p):return json.loads(Path(p).read_text(encoding='utf8'))
def norm(v):return re.sub(r'\s+',' ',str(v or '')).strip()
def name(v):
 v=unicodedata.normalize('NFKD',str(v)).lower();v=re.sub(r'\b(?:mr|mrs|ms|miss|dr|prof|professor|sir)\b',' ',v)
 return re.sub('[^a-z]','',v)
def strings(v):
 if isinstance(v,str):return [v]
 if isinstance(v,list):return sum((strings(x) for x in v),[])
 if isinstance(v,dict):return sum((strings(x) for x in v.values()),[])
 return []
def main():
 p=argparse.ArgumentParser();p.add_argument('--private',required=True);p.add_argument('--prepared',required=True);p.add_argument('--output',required=True);args=p.parse_args()
 private=Path(args.private);prepared=Path(args.prepared);out=Path(args.output)
 if out.exists():raise ValueError('New report required')
 pack=load(Path(__file__).resolve().parent.parent/'research-cases.json');prior=load(private/'research-literal-review/literal-source-review.json');bytrial={x['trialId']:x for x in prior['cases']};baseline=load(private/'baseline/raw.json')['rows'];byname={}
 for row in baseline:byname.setdefault(name(row.get('name')),[]).append(row)
 cases=[]
 for case in pack['cases']:
  trial=case['trialId'];binary=(private/'research-literal-review/source-backup'/(trial+'.html')).read_bytes();sha=hashlib.sha256(binary).hexdigest()
  if sha!=bytrial[trial]['snapshotSha256']:raise ValueError('Archived registry source changed')
  soup=BeautifulSoup(binary,'html.parser');cards=soup.select('.card[id^="contact-"] .card-header');header=cards[0] if cards else None
  recorded_name=norm(header.select_one('strong').get_text(' ',strip=True)) if header and header.select_one('strong') else '';role=norm(header.select_one('em').get_text(' ',strip=True)) if header and header.select_one('em') else ''
  leads=byname.get(name(recorded_name),[]) if recorded_name else []
  corroborated=[]
  for row in leads:
   own='\n'.join(strings({k:row.get(k) for k in ['research_interests','publications','about','about_alternatives']}))
   if trial in own:corroborated.append(row['id'])
  # Even a name + trial-ID coincidence is emitted for review, not approved.
  reasons=['independent-person-and-role-attribution-not-established']
  if case.get('ethicsReferenceMatch'):reasons.insert(0,'ethics-reference-is-not-a-registration')
  if role!=case['recordedRole']:reasons.insert(0,'parser-role-not-recorded-in-source')
  if case.get('matchMethod')=='institution-only':reasons.append('institution-is-discovery-lead-not-participation')
  cases.append({'caseId':case['caseId'],'trialId':trial,'snapshotSha256':sha,'exactRecordedRole':role or None,'literalRoleMatched':role==case['recordedRole'],'exactNameLeadCount':len(leads),'ownRecordTrialReferenceLeadCount':len(corroborated),'candidateIdentityApproved':False,'outcome':'withheld','reasons':reasons,'sourceDate':None,'observedAt':None})
 packet=load(prepared/'repairs.json');patches={(x['sourceRecordId'],x['field']) for x in packet['patches']};supp={(x['sourceRecordId'],x['field']) for x in packet.get('suppressions',[])};holds={x['sourceRecordId'] for x in packet['holds']};outcomes=[json.loads(x) for x in (private/'bupa-r1-20261008-v2/row-outcomes.jsonl').open(encoding='utf8')]
 conflicts=[]
 named={'bupa_10089','bupa_10092','bupa_10012','bupa_6445','bupa_26882','bupa_22318','bupa_13206','bupa_27571'}
 for row in outcomes:
  rid=row['sourceRecordId']
  if rid not in named and not row.get('historicalUrlConflict'):continue
  conflict={'sourceRecordId':rid,'historicalURLConflict':bool(row.get('historicalUrlConflict')),'wholeIdentityHeld':rid in holds,'sourceSnapshotSha256':row['snapshotSha256'],'fields':{}}
  for field,f in row.get('fields',{}).items():conflict['fields'][field]='source-supported-repair' if (rid,field) in patches else 'unsafe-field-excluded' if (rid,field) in supp else 'unchanged-repair-not-approved' if f.get('status')=='held' else 'unchanged'
  if rid in {'bupa_13206','bupa_27571'}:conflict['limitation']='Snapshot belongs to another professional; no replacement or identity reassignment approved.'
  conflicts.append(conflict)
 report={'schemaVersion':1,'researchCases':cases,'researchCounts':{'reviewed':len(cases),'literalRoleMatched':sum(x['literalRoleMatched'] for x in cases),'approvedAttributions':0,'exactNameLeads':sum(x['exactNameLeadCount'] for x in cases),'independentlyCorroboratedAttributions':0},'knownConflictCases':conflicts,'conflictCounts':{'reviewed':len(conflicts),'historicalURLFlags':sum(x['historicalURLConflict'] for x in conflicts),'mandatoryHoldsRetained':all(r in holds for r in ['bupa_6445','bupa_26882','bupa_22318'])},'humanReviewed':False,'sourceBasedReviewOnly':True}
 out.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps({'research':report['researchCounts'],'conflicts':report['conflictCounts']}))
if __name__=='__main__':main()
