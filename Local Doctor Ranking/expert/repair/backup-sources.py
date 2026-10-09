"""Copy selected read-only source evidence to a separate disk and verify every copy.
No recovered pipeline code is imported. Destination must be new or empty.
"""
import concurrent.futures, hashlib, json, os, sys, time
from pathlib import Path
ROOT=Path(r'D:\Coding\Practitioner Scraping Pipeline')
OUT=Path(sys.argv[1]).resolve()
if not OUT.is_absolute() or OUT.drive.lower()==ROOT.drive.lower(): raise SystemExit('Use a new directory on a separate disk')
OUT.mkdir(parents=True,exist_ok=True)
if any(OUT.iterdir()): raise SystemExit('Backup destination must be empty')
hospital=ROOT/'Hospital + insurance'
selected=[hospital/'BUPA/html_snapshots']
# Locate the actual Bupa cache rather than assuming a parser working directory.
if not selected[0].exists(): selected[0]=hospital/'BUPA/data/html_snapshots'
if not selected[0].exists(): raise SystemExit('Current Bupa snapshot directory not found')
for relative in [
 'Hospital + insurance/BUPA/scrapers',
 'Hospital + insurance/BUPA/data/output/profiles_v2.jsonl',
 'Hospital + insurance/Practitioner data reconcillation/data/bupa_latest.json',
 'Hospital + insurance/Practitioner data reconcillation/scripts',
 'Hospital + insurance/HCA/results/final/consultant_profiles_jsonld_reparse_cleaned.json',
 'Hospital + insurance/Spire Healthcare/results/spire_consultant_profiles_20260215_203653.json',
 'Hospital + insurance/Circle Health Group/results/final/consultant_profiles_circle_updated.json',
 'Hospital + insurance/Cromwell/results/consultant_profiles_final_20260215_205717.json',
 'Hospital + insurance/Nuffield Health/data/output/nuffield_consultant_profiles.json',
 'Hospital + insurance/Ramsay Health/output/ramsay_profiles.jsonl',
 'Hospital + insurance/ISRCTN UK Trials/output/trials_merged_20260209_215240.json',
 'Hospital + insurance/ISRCTN UK Trials/output/trial_practitioner_links_20260215_212218.json',
 'Hospital + insurance/ISRCTN UK Trials/extract/parser.py',
 'Hospital + insurance/ISRCTN UK Trials/mapping/trial_practitioner.py',
 'POGP/results/pogp_profiles.json','bda_dietitians_profiles.json']:
 p=ROOT/relative
 if not p.exists(): raise SystemExit('Selected source missing: '+str(p))
 selected.append(p)
files=[]
for p in selected:
 files.extend(q for q in p.rglob('*') if q.is_file() and q.suffix in ['.py','.cjs','.js','.html','.json','.jsonl','.csv'] and '__pycache__' not in q.parts) if p.is_dir() else files.append(p)
files=sorted(set(files)); start=time.monotonic()
def copy(p):
 rel=p.relative_to(ROOT); target=OUT/rel; target.parent.mkdir(parents=True,exist_ok=True)
 before=p.stat(); digest=hashlib.sha256()
 with p.open('rb') as src,target.open('xb') as dst:
  while data:=src.read(1024*1024): digest.update(data);dst.write(data)
 after=p.stat()
 if (before.st_size,before.st_mtime_ns)!=(after.st_size,after.st_mtime_ns): raise RuntimeError('Source changed during backup: '+str(rel))
 check=hashlib.file_digest(target.open('rb'),'sha256').hexdigest()
 if check!=digest.hexdigest(): raise RuntimeError('Backup checksum mismatch: '+str(rel))
 return {'path':str(rel),'bytes':before.st_size,'sha256':check,'sourceMtimeNs':before.st_mtime_ns}
manifest=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 for item in pool.map(copy,files):
  manifest.append(item)
  if len(manifest)%5000==0: print('Verified backup files:',len(manifest),flush=True)
result={'schemaVersion':1,'sourceRoot':str(ROOT),'destination':str(OUT),'files':manifest,'count':len(manifest),'bytes':sum(f['bytes'] for f in manifest),'elapsedSeconds':round(time.monotonic()-start,1)}
(OUT/'backup-manifest.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in result.items() if k!='files'}),flush=True)
