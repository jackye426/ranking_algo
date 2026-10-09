"""Apply professional-only exclusions to source-bound frozen and repaired fields.

Whole fields are withheld; words are never reconstructed. A rejected earlier
repair cannot leave its original unsafe field searchable. Private output only.
"""
import argparse,hashlib,json,re,shutil
from pathlib import Path
from prepare_sources import load,save,digest,hash_value,all_text,EVIDENCE_FIELDS

RULES=[
 ('personal-heading',r'\bPersonal\s*:'),
 ('personal-family-history',r'\bfamily life\b|\b(?:she|he|they)\s+(?:has|have)\s+(?:had\s+)?(?:one|two|three|four|five|six|[1-9])\s+(?:(?:lovely|young|adult|grown(?:-up)?)\s+)?children\b|\b(?:she|he|they)\s+(?:is|are)\s+married\b|\b(?:her|his)\s+(?:one|two|three|four|five|six)\s+(?:sons|daughters)\b'),
 ('personal-upbringing-or-hobbies',r'\b(?:grew up|grammar school|was born|she enjoys|he enjoys|her sons|his sons|her daughters|his daughters)\b'),
 ('personal-health-history',r'\bmenopause\s+(?:herself|myself)\b'),
 ('contact-administration',r'\bplease\s+(?:call|telephone|phone)\b|\b(?:call|telephone|phone)\s+(?:us\s+)?(?:on\s+)?(?:\+44|0)[\d\s()-]{8,}'),
 ('generic-publisher-relationship-boilerplate',r'\bHCA is transparent about our relationship\b|\bamount we pay this doctor\b'),
]
def issue(value):
 for text in all_text(value):
  for label,pattern in RULES:
   if re.search(pattern,text,re.I):return label
 return None
def main():
 p=argparse.ArgumentParser();p.add_argument('--baseline',required=True);p.add_argument('--prepared',required=True);p.add_argument('--output',required=True);args=p.parse_args()
 src=Path(args.prepared);out=Path(args.output)
 if out.exists():raise ValueError('New immutable output required')
 raw=load(args.baseline);packet=load(src/'repairs.json');byid={r['id']:r for r in raw['rows']};baseline_sha=digest(args.baseline)
 patches={(p['sourceRecordId'],p['field']):p for p in packet['patches']};supp={(p['sourceRecordId'],p['field']):p for p in packet['suppressions']};decisions=[];withdraw=set()
 for row in raw['rows']:
  for field in EVIDENCE_FIELDS:
   fields=[field+'.'+k for k in (row.get(field) or {}) if re.fullmatch('[A-Za-z0-9_-]+',k)] if field=='about_alternatives' else [field]
   for key in fields:
    ident=(row['id'],key)
    if ident in supp:continue
    original=row
    for part in key.split('.'):original=original.get(part) if isinstance(original,dict) else None
    patch=patches.get(ident);value=patch['value'] if patch else original;reason=issue(value)
    if not reason:continue
    proof=patch.get('provenance') if patch else None
    source_sha=proof['snapshotSha256'] if proof else baseline_sha
    review_id='professional-scope-'+hashlib.sha256((row['id']+'|'+key+'|'+hash_value(value)).encode()).hexdigest()[:24]
    supp[ident]={'sourceRecordId':row['id'],'field':key,'beforeHash':hash_value(original),'reason':'Whole professional field withheld: '+reason,'reviewId':review_id,'sourceEvidence':[{'snapshotSha256':source_sha,'sourceField':key,'sourceRecordId':row['id']}],'approved':True}
    if patch:withdraw.add(ident)
    decisions.append({'sourceRecordId':row['id'],'field':key,'rule':reason,'reviewId':review_id,'beforeHash':hash_value(original),'evaluatedHash':hash_value(value),'sourceSha256':source_sha,'withdrawnPatchReviewId':proof.get('reviewId') if proof else None,'outcome':'earlier-repair-withdrawn-and-original-field-suppressed' if patch else 'original-field-suppressed'})
 packet['patches']=[p for p in packet['patches'] if (p['sourceRecordId'],p['field']) not in withdraw];packet['suppressions']=list(supp.values())
 shutil.copytree(src,out)
 save(out/'repairs.json',packet);save(out/'suppression-ledger.json',packet['suppressions']);save(out/'professional-scope-decisions.json',decisions)
 report=load(out/'report.json');report['suppressions']=len(supp);report['suppressedSourceRows']=len({x[0] for x in supp});report['professionalScopeFinalization']={'evaluatedBaselineSha256':baseline_sha,'inputPacketSha256':digest(src/'repairs.json'),'newFieldExclusions':len(decisions),'withdrawnEarlierRepairs':len(withdraw),'method':'Whole source-bound field withholding; no text rewriting'};save(out/'report.json',report)
 remediation=load(out/'confirmation-remediation.json')
 for item in remediation:item['matchingBaselineExclusions']=[{'field':s['field'],'beforeHash':s['beforeHash'],'reviewId':s['reviewId']} for s in supp.values() if s['sourceRecordId']==item['sourceRecordId']]
 save(out/'confirmation-remediation.json',remediation)
 print(json.dumps(report))
if __name__=='__main__':main()
