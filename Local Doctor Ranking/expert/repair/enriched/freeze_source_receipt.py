"""Rehash every selected input and its separate-disk backup, read-only."""
import argparse,hashlib,json
from pathlib import Path
from prepare_sources import load,save,digest

def main():
 p=argparse.ArgumentParser();p.add_argument('--private',required=True);p.add_argument('--prepared',required=True);p.add_argument('--archive',required=True);p.add_argument('--output',required=True);a=p.parse_args()
 private=Path(a.private);prepared=Path(a.prepared);archive=Path(a.archive);output=Path(a.output)
 if output.exists():raise ValueError('New immutable receipt required')
 sources={}
 for item in load(prepared/'source-catalog.json'):
  rel=item['sourceFile']
  if rel in sources and sources[rel]!=item['sha256']:raise ValueError('Conflicting source catalog entries')
  sources[rel]=item['sha256']
 roots={}
 for root in [private/'source-backup',private/'source-backup-supplement']:
  for item in load(root/'backup-manifest.json')['files']:roots[item['path'].replace('\\','/')]=root
 results=[]
 for i,(rel,expected) in enumerate(sorted(sources.items())):
  if rel.startswith('cromwell-reviewed/'):
   sub=rel.removeprefix('cromwell-reviewed/');backup=prepared/'source-backup'/sub;original=archive/'Hospital + insurance/Cromwell'/sub
  else:backup=roots[rel]/rel;original=archive/rel
  result={'sourceFile':rel,'expectedSha256':expected,'backupSha256':digest(backup),'originalSha256':digest(original)};result['passed']=result['backupSha256']==result['originalSha256']==expected;results.append(result)
  if (i+1)%2000==0:print(json.dumps({'checked':i+1,'total':len(sources)}),flush=True)
 baseline=private/'baseline/raw.json';packet=load(prepared/'repairs.json');baseline_sha=digest(baseline)
 hashes={f:digest(prepared/f) for f in ['repairs.json','review-ledger.json','suppression-ledger.json','source-catalog.json','processing-outcomes.json','source-review-decisions.json','professional-scope-decisions.json','confirmation-remediation.json','independent-all-source-verification.json','r2-bupa-full-verification.json','inherited-r2-retention.json']}
 report={'schemaVersion':1,'baselineSha256':baseline_sha,'baselineMatchesPacket':baseline_sha==packet['baselineSha256'],'sourceFilesChecked':len(results),'failedSources':sum(not r['passed'] for r in results),'sourceCatalogAggregateSha256':hashlib.sha256(json.dumps(sorted(sources.items()),separators=(',',':')).encode()).hexdigest(),'artifactChecksums':hashes,'results':results,'passed':baseline_sha==packet['baselineSha256'] and all(r['passed'] for r in results),'writesToOriginals':False,'networkAccess':False}
 save(output,report);print(json.dumps({k:v for k,v in report.items() if k not in ['results','artifactChecksums']}))
 if not report['passed']:raise SystemExit(1)
if __name__=='__main__':main()
