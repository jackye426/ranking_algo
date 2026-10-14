"""Offline, source-bound professional-detail reconciliation.

Original archives and baseline are read-only. Outputs must be in a new private
directory. This produces reviewable proposals, never a deployment or DB write.
"""
from __future__ import annotations
import argparse, ast, hashlib, json, math, re, sys, unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
from lxml import html

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from bupa_parser import hash_value, MOJIBAKE, CONTACT, PERSONAL, parse_snapshot, section_nodes, serialize_nodes, collapse
from provider_ownership import make_binding, assess_ownership, coverage as ownership_coverage

VERSION = 'professional-detail-reconciliation-v4'
PARTIAL_ENTITY=re.compile(r'&(?:amp|lt|gt|quot|apos|nbsp)(?![A-Za-z0-9#;])')
SOURCES = [
 ('HCA', 'Hospital + insurance/HCA/results/final/consultant_profiles_jsonld_reparse_cleaned.json', {'about':'biography','qualifications':'qualification','procedures':'recorded-procedure','subspecialties':'clinical-interest'}),
 ('Spire Healthcare', 'Hospital + insurance/Spire Healthcare/results/spire_consultant_profiles_20260215_203653.json', {'about':'biography','qualifications':'qualification','detailed_qualifications':'qualification','professional_memberships':'membership','clinical_interests':'clinical-interest','specialises_in':'clinical-interest','treatments':'recorded-procedure'}),
 ('Circle Health Group', 'Hospital + insurance/Circle Health Group/results/final/consultant_profiles_circle_updated.json', {'description':'biography','qualifications':'qualification','professional_memberships':'membership','clinical_interests':'clinical-interest','treatments':'recorded-procedure','languages':'language'}),
 ('Cromwell Hospital', 'Hospital + insurance/Cromwell/results/consultant_profiles_final_20260215_205717.json', {'about':'biography','qualifications':'qualification','professional_memberships':'membership','clinical_interests':'clinical-interest','subspecialties':'clinical-interest'}),
 ('Nuffield Health', 'Hospital + insurance/Nuffield Health/data/output/nuffield_consultant_profiles.json', {'about':'biography','qualifications':'qualification','treatments':'recorded-procedure'}),
 ('Ramsay Health', 'Hospital + insurance/Ramsay Health/output/ramsay_profiles.jsonl', {'about':'biography','qualifications':'qualification','professional_memberships':'membership','clinical_interests':'clinical-interest','academic_background':'academic-background'}),
 ('British Dietetic Association', 'bda_dietitians_profiles.json', {'bio':'biography','clinical_expertise':'clinical-interest'}),
]
BUPA_HEADINGS={'About me':'biography','Qualifications':'qualification','Additional training':'academic-background','Professional bodies (positions held - last 3 yrs)':'membership','Research interests':'research-interest'}
EVIDENCE_FIELDS=['about','about_alternatives','clinical_interests','areas_of_interest','research_interests','procedures','procedures_completed','professional_memberships','qualifications','detailed_qualifications','professional_experience','teaching_interests']
PHIN='Phin/PHIN Practitioner Data - Procedure Code/production_output/consultants_with_procedures_cleaned.jsonl'

def digest(p):
 with Path(p).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def load(p):return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def save(p,value):Path(p).write_text(json.dumps(value,ensure_ascii=False,allow_nan=False,separators=(',',':')),encoding='utf-8')
def norm(t):return re.sub(r'\s+',' ',unicodedata.normalize('NFKC',str(t))).strip().casefold()
def canonical(v):
 if not isinstance(v,str):return None
 try:
  u=urlsplit(v)
  if u.scheme!='https' or not u.netloc or u.username or u.password:return None
  return urlunsplit((u.scheme,u.netloc.lower(),u.path.rstrip('/'),'',''))
 except ValueError:return None
def tokens(v):
 s=unicodedata.normalize('NFKD',str(v or ''));s=''.join(c for c in s if not unicodedata.combining(c));s=re.sub(r'\([^)]*\)',' ',s.lower()).replace("'",'').replace('-',' ')
 return [w for w in re.findall('[a-z]+',s) if w not in {'mr','mrs','ms','miss','dr','doctor','prof','professor','sir','consultant','associate','frcs','frcp','mbbs','mbchb','phd','mrcs','mrcp'}]
def compatible(a,b):
 a,b=tokens(a),tokens(b)
 return bool(a and b) and (a==b or len(a)>=2 and len(b)>=2 and a[-1]==b[-1] and (a[0]==b[0] or (len(a[0])==1 or len(b[0])==1) and a[0][0]==b[0][0]))
def strings(v,pointer=()):
 if isinstance(v,str):
  if v.strip():yield pointer,v
 elif isinstance(v,list):
  for i,x in enumerate(v):yield from strings(x,pointer+(i,))
 elif isinstance(v,dict):
  # Do not guess a dictionary's medical meaning. Only literal named components.
  for k in ['text','degree','description','qualification','membership','procedure_name','title','name']:
   if isinstance(v.get(k),str) and v[k].strip():yield pointer+(k,),v[k]
def all_text(v):
 if isinstance(v,str):return [v]
 if isinstance(v,list):return sum((all_text(x) for x in v),[])
 if isinstance(v,dict):return sum((all_text(x) for k,x in v.items() if k not in ['sourceUrl','sourceLabel','provenance','repairProvenance']),[])
 return []
def issues(text):
 result=[]
 if MOJIBAKE.search(text):result.append('ambiguous-source-encoding')
 if PARTIAL_ENTITY.search(text):result.append('incomplete-recorded-html-entity')
 if CONTACT.search(text) or re.search(r'https?://|www\.',text,re.I):result.append('contact-or-external-link-content')
 if PERSONAL.search(text):result.append('personal-content')
 if re.search(r'</?[A-Za-z][^>]*>',text):result.append('unrendered-html')
 if len(text)>100000:result.append('oversize')
 return result
def source_rows(file):
 if file.suffix=='.jsonl':
  with file.open(encoding='utf-8-sig') as f:
   for index,line in enumerate(f):
    if not line.strip():yield index,None,'blank-line';continue
    try:yield index,json.loads(line),'parsed'
    except json.JSONDecodeError:yield index,None,'malformed-jsonl'
 else:
  obj=load(file);rows=obj if isinstance(obj,list) else obj.get('profiles',[]) if isinstance(obj,dict) else []
  if not isinstance(rows,list):raise ValueError('Incompatible source collection')
  yield from ((i,x,'parsed') for i,x in enumerate(rows))

def bind_existing_source(source,row,*,provider,rel,index,source_sha,baseline_sha,url,review=None):
 """An existing URL is a lead; only a checked ownership basis admits proposals.

This does not approve evidence, resolve identities, or suppress unsafe baseline
material. Hold proposals remain visible even when new enrichment is rejected.
"""
 binding=make_binding(source,row,provider=provider,source_file=rel,source_index=index,
  source_file_sha256=source_sha,baseline_sha256=baseline_sha,url=url)
 return assess_ownership(source,row,binding,source_file_sha256=source_sha,baseline_sha256=baseline_sha,review=review)

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--private',required=True);ap.add_argument('--output',required=True);ap.add_argument('--ownership-reviews',help='Optional source/baseline-bound professional ownership reviews; never name-only approvals');args=ap.parse_args()
 private=Path(args.private).resolve();out=Path(args.output).resolve()
 if out.exists():raise ValueError('Output must be new')
 rawpath=private/'baseline/raw.json';raw=load(rawpath);baseline_sha=digest(rawpath);rows=raw['rows'];byid={r['id']:r for r in rows}
 eligibility=load(private/'replay/eligible-source-ids-v2.json')
 if eligibility['baselineSha256']!=baseline_sha:raise ValueError('Eligibility baseline mismatch')
 eligible=set(eligibility['sourceRecordIds']);r2=load(private/'context-r2-proposal/repairs.json')
 if r2['baselineSha256']!=baseline_sha:raise ValueError('R2 baseline mismatch')
 patches={(p['sourceRecordId'],p['field']):p for p in r2['patches']};contexts={p['sourceRecordId']:list(p['value']) for p in r2['patches'] if p['field']=='professional_context'}
 byurl=defaultdict(dict)
 for row in rows:
  for d in [row.get('profile_urls'),row.get('urls')]:
   if isinstance(d,dict):
    for value in d.values():
     for v in value if isinstance(value,list) else [value]:
      if canonical(v):byurl[canonical(v)][row['id']]=row
 existing={r['id']:{norm(x) for field in EVIDENCE_FIELDS for x in all_text(patches.get((r['id'],field),{}).get('value',r.get(field)))} for r in rows}
 for rid,items in contexts.items():existing[rid].update(norm(x['text']) for x in items)
 outcomes=[];ledger=[];supp=[];reconcile=[];ownership=[];ownership_reviews={};used_ownership_reviews=set();backup_roots=[private/'source-backup',private/'source-backup-supplement'];manifests={}
 if args.ownership_reviews:
  reviews=load(args.ownership_reviews)
  if not isinstance(reviews,list):raise ValueError('Ownership reviews must be an array')
  for review in reviews:
   b=review.get('binding',{}) if isinstance(review,dict) else {};key=(b.get('provider'),b.get('sourceFile'),b.get('sourceIndex'),b.get('sourceRecordId'))
   if None in key or key in ownership_reviews:raise ValueError('Missing or duplicate ownership review binding')
   ownership_reviews[key]=review
 for root in backup_roots:
  for f in load(root/'backup-manifest.json')['files']:manifests[f['path'].replace('\\','/')]=(root,f)
 source_catalog=[]
 def checked(rel):
  root,entry=manifests[rel];file=root/rel;actual=digest(file)
  if actual!=entry['sha256']:raise ValueError('Source checksum mismatch: '+rel)
  source_catalog.append({'sourceFile':rel,'sha256':actual,'bytes':file.stat().st_size})
  return file,actual
 def add(row,provider,rel,index,field,pointer,text,source_sha,url,basis,kind,source_date=None,metadata=None,extraction='literal-source-field'):
  outcome={'sourceRecordId':row['id'],'provider':provider,'sourceFile':rel,'sourceIndex':index,'sourceField':field,'sourcePointer':list(pointer),'kind':kind}
  outcomes.append(outcome)
  bad=issues(text)
  if bad:outcome.update(outcome='withheld-content-review',reasons=bad);return
  if norm(text) in existing[row['id']] and source_date is None:
   outcome['outcome']='already-represented-exact-text';return
  if not text.strip():outcome['outcome']='empty';return
  review_id='detail-'+hashlib.sha256((row['id']+'|'+rel+'|'+str(index)+'|'+field+'|'+str(pointer)+'|'+text).encode()).hexdigest()[:28]
  provenance={'sourceUrl':url,'sourceLabel':provider,'sourceDate':source_date,'observedAt':None,'snapshotSha256':source_sha,'parserVersion':VERSION,'reviewId':review_id,'sourceField':field}
  item={'kind':kind,'text':text,'provenance':provenance}
  if metadata is not None:item['metadata']=metadata
  items=contexts.setdefault(row['id'],[])
  if any(x['kind']==kind and norm(x['text'])==norm(text) and x['provenance']['sourceUrl']==url and x['provenance'].get('sourceDate')==source_date for x in items):outcome['outcome']='duplicate-source-item';return
  if len(items)>=500:outcome['outcome']='withheld-context-limit';return
  items.append(item);existing[row['id']].add(norm(text));outcome.update(outcome='source-supported-addition',reviewId=review_id)
  ledger.append({**outcome,'text':text,'sourceSha256':source_sha,'sourceUrl':url,'identityBasis':basis,'extraction':extraction,'sourceDate':source_date,'metadata':metadata,'humanReviewed':False,'currentPracticeVerified':False})
 def bind(source,url,provider,rel,index,source_sha):
  matches=list(byurl.get(url,{}).values());record={'provider':provider,'sourceFile':rel,'sourceIndex':index,'outcome':None};outcomes.append(record)
  if len(matches)!=1:record['outcome']='ambiguous-existing-row' if matches else 'no-existing-identity';return None,None
  row=matches[0];record['sourceRecordId']=row['id']
  review=ownership_reviews.get((provider,rel,index,row['id']))
  if review:used_ownership_reviews.add((provider,rel,index,row['id']))
  decision=bind_existing_source(source,row,provider=provider,rel=rel,index=index,source_sha=source_sha,baseline_sha=baseline_sha,url=url,review=review)
  ownership.append(decision);record.update(ownershipDecision=decision['decision'],ownershipBinding=decision['binding'],baselineSafetyReviewRequired=decision['baselineSafetyReviewRequired'],baselineMaterialAutomaticallyRemoved=False,ownershipReasons=decision['reasons'])
  if row['id'] not in eligible:record['outcome']='identity-held';return None,None
  if not decision['mayPrepareSourceProposals']:record['outcome']=decision['decision'];return None,None
  basis=decision['identityBasis']
  record.update(outcome='processed',identityBasis=basis);return row,basis
 for provider,rel,fields in SOURCES:
  file,source_sha=checked(rel)
  for index,source,state in source_rows(file):
   if state!='parsed' or not isinstance(source,dict):outcomes.append({'provider':provider,'sourceFile':rel,'sourceIndex':index,'outcome':state if state!='parsed' else 'incompatible-row'});continue
   url=canonical(source.get('profile_url'));row,basis=bind(source,url,provider,rel,index,source_sha)
   if row is None:continue
   for field,kind in fields.items():
    vals=list(strings(source.get(field)))
    if not vals:outcomes.append({'provider':provider,'sourceRecordId':row['id'],'sourceFile':rel,'sourceIndex':index,'sourceField':field,'outcome':'empty-or-incompatible'});continue
    for pointer,text in vals:add(row,provider,rel,index,field,pointer,text,source_sha,url,basis,kind)
   # Explicit literal profession fields only; specialty/headlines are not professions.
   for field in ['profession','professional_role','professional_type']:
    if isinstance(source.get(field),str):add(row,provider,rel,index,field,(),source[field],source_sha,url,basis,'profession')
   if provider=='Nuffield Health' and isinstance(source.get('related_experience'),str):
    for part_index,part in enumerate(source['related_experience'].split(' | ')):
     label,sep,value=part.partition(':');kind={'Research':'research-interest','Memberships':'membership','Other posts held':'affiliation'}.get(label.strip())
     if not kind:outcomes.append({'provider':provider,'sourceRecordId':row['id'],'sourceIndex':index,'sourceField':'related_experience','outcome':'unrecognised-related-label'});continue
     try:values=ast.literal_eval(value)
     except (SyntaxError,ValueError):outcomes.append({'provider':provider,'sourceRecordId':row['id'],'sourceIndex':index,'sourceField':'related_experience','outcome':'unparseable-related-literal'});continue
     if not isinstance(values,list) or any(not isinstance(v,str) for v in values):continue
     for item_index,text in enumerate(values):add(row,provider,rel,index,'related_experience',(part_index,item_index),text,source_sha,url,basis,kind,extraction='labelled-python-string-list')
  print('Prepared source:',provider,flush=True)
 # Recover source-owned alternative biographies and qualifications from exact Bupa HTML.
 bupa_outcomes=[json.loads(x) for x in (private/'bupa-r1-20261008-v2/row-outcomes.jsonl').open(encoding='utf-8')]
 bupa_urls={}
 for p in r2['patches']:
  if p['field']=='professional_context':
   for item in p['value']:
    if item['provenance']['sourceLabel'].lower().startswith('bupa'):bupa_urls[p['sourceRecordId']]=item['provenance']['sourceUrl']
  elif p.get('provenance',{}).get('sourceLabel','').lower().startswith('bupa'):bupa_urls[p['sourceRecordId']]=p['provenance']['sourceUrl']
 for n,o in enumerate(bupa_outcomes):
  rid=o['sourceRecordId'];row=byid.get(rid)
  if rid not in eligible or row is None:continue
  url=bupa_urls.get(rid)
  if not url:
   outcomes.append({'sourceRecordId':rid,'provider':'Bupa','sourceIndex':o['sourceArrayIndex'],'outcome':'no-independent-typed-url-binding'});continue
  rel='Hospital + insurance/BUPA/data/html_snapshots/'+o['snapshotFile'];file,source_sha=checked(rel)
  if source_sha!=o['snapshotSha256']:raise ValueError('Bupa snapshot drift')
  binary=file.read_bytes();parsed=parse_snapshot(binary)
  if not parsed.get('name') or not compatible(parsed['name'],row['name']):raise ValueError('Reused Bupa identity binding no longer compatible')
  doc=html.fromstring(binary.decode('utf-8'),parser=html.HTMLParser(no_network=True,remove_comments=True))
  for label,kind in BUPA_HEADINGS.items():
   headings=[h for h in doc.xpath('//h4') if collapse(''.join(h.itertext()))==label]
   if len(headings)!=1:outcomes.append({'sourceRecordId':rid,'provider':'Bupa','sourceIndex':o['sourceArrayIndex'],'sourceField':label,'outcome':'missing-or-ambiguous-heading'});continue
   nodes,error=section_nodes(headings[0]);rendered=serialize_nodes(nodes)
   if error or not rendered['checks']['characterConservation'] or not rendered['checks']['boundaryConservation']:outcomes.append({'sourceRecordId':rid,'provider':'Bupa','sourceIndex':o['sourceArrayIndex'],'sourceField':label,'outcome':'unsafe-source-boundaries'});continue
   if not rendered['text']:continue
   add(row,'Bupa',rel,o['sourceArrayIndex'],label,(),rendered['text'],source_sha,url,'frozen-array-snapshot-and-approved-typed-url','biography' if label=='About me' else kind,extraction='exact-html-blocks')
  if n%3000==0:print('Bupa source index:',n,flush=True)
 # PHIN source-response last_updated_all is preserved as source-reported date,
 # not date of activity, observation time, or proof of current practice.
 file,source_sha=checked(PHIN)
 for index,source,state in source_rows(file):
  if state!='parsed' or not isinstance(source,dict):outcomes.append({'provider':'PHIN','sourceIndex':index,'outcome':state});continue
  pid=source.get('id');url=canonical('https://www.phin.org.uk/consultants/'+str(pid)) if isinstance(pid,(str,int)) else None
  row,basis=bind(source,url,'PHIN',PHIN,index,source_sha)
  if row is None:continue
  try:raw_source=json.loads(source.get('raw_data') or '{}')
  except (ValueError,TypeError):raw_source={}
  reported=raw_source.get('last_updated_all');source_date=None
  if isinstance(reported,str) and re.fullmatch(r'\d{2}/\d{2}/\d{4}',reported):
   import datetime
   try:source_date=datetime.datetime.strptime(reported,'%d/%m/%Y').date().isoformat()
   except ValueError:pass
  for field,kind in [('biography_text','biography'),('specialClinicalInterests_text','clinical-interest')]:
   if isinstance(source.get(field),str) and source[field].strip():add(row,'PHIN',PHIN,index,field,(),source[field],source_sha,url,basis,kind,source_date)
  # Activity date may be newer than the generic profile date: do not attach it
  # to procedure counts. Existing activity is reconciled separately below.
  try:procedures=json.loads(source.get('procedures_data') or '[]')
  except (ValueError,TypeError):procedures=[]
  if isinstance(procedures,list):
   for i,p in enumerate(procedures):
    if not isinstance(p,dict):continue
    p_name=p.get('procedure_name');number=p.get('admissions');existing_volumes=row.get('procedure_volumes_phin') or []
    matches=[v for v in existing_volumes if isinstance(v,dict) and str(v.get('procedure_id'))==str(p.get('procedure_id'))]
    reconcile.append({'sourceRecordId':row['id'],'sourceFile':PHIN,'sourceIndex':index,'sourceItemIndex':i,'procedureName':p_name,'sourceAdmissions':number if isinstance(number,(int,float,str)) and not isinstance(number,bool) and (not isinstance(number,float) or math.isfinite(number)) else None,'existingItems':len(matches),'outcome':'preserved-existing-range-or-count' if matches else 'unrepresented-activity-held-until-period-and-range-verification','sourceReportedProfileDate':source_date,'sourceDateNotAppliedToActivity':True})
 print('Prepared PHIN source and activity reconciliation',flush=True)
 # Precise residual damage only. Missing URL / unapproved correction alone is
 # never grounds to suppress a field. Known faulty legacy branch is different.
 for o in bupa_outcomes:
  rid=o['sourceRecordId'];row=byid.get(rid)
  if rid not in eligible or row is None:continue
  for field,f in o.get('fields',{}).items():
   if (rid,field) in patches:continue
   reasons=[]
   if f.get('legacyBranch')=='faulty-character-class' and f.get('beforeHash')==f.get('frozenValueHash') and f.get('status')=='held':reasons.append('confirmed-legacy-character-class-corruption')
   original=row.get(field)
   if any(MOJIBAKE.search(x) or PARTIAL_ENTITY.search(x) for x in all_text(original)):reasons.append('ambiguous-recorded-encoding')
   if any(CONTACT.search(x) for x in all_text(original)):reasons.append('contact-content-in-professional-evidence')
   if reasons and original:
    supp.append({'sourceRecordId':rid,'field':field,'beforeHash':hash_value(original),'reason':'; '.join(reasons),'reviewId':'suppress-'+hashlib.sha256((rid+'|'+field).encode()).hexdigest()[:24],'sourceEvidence':[{'snapshotSha256':o['snapshotSha256'],'sourceField':field,'sourceRecordId':rid}],'approved':True})
 for row in rows:
  if row['id'] not in eligible:continue
  alt=row.get('about_alternatives')
  if not isinstance(alt,dict):continue
  for provider,value in alt.items():
   if not re.fullmatch(r'[A-Za-z0-9_-]+',provider):continue
   if any(MOJIBAKE.search(x) or PARTIAL_ENTITY.search(x) or CONTACT.search(x) for x in all_text(value)):
    supp.append({'sourceRecordId':row['id'],'field':'about_alternatives.'+provider,'beforeHash':hash_value(value),'reason':'ambiguous-recorded-encoding-or-contact-content','reviewId':'suppress-'+hashlib.sha256((row['id']+'|'+provider).encode()).hexdigest()[:24],'sourceEvidence':[{'snapshotSha256':baseline_sha,'sourceField':'about_alternatives.'+provider,'sourceRecordId':row['id']}],'approved':True})
 # Global residual scan catches unsafe primary fields outside Bupa and fields
 # absent from Bupa sections, without selecting a replacement identity.
 suppression_keys={(s['sourceRecordId'],s['field']) for s in supp}
 for row in rows:
  if row['id'] not in eligible:continue
  for field in EVIDENCE_FIELDS:
   if field=='about_alternatives' or (row['id'],field) in suppression_keys or (row['id'],field) in patches:continue
   value=row.get(field)
   if value and any(MOJIBAKE.search(x) or PARTIAL_ENTITY.search(x) or CONTACT.search(x) for x in all_text(value)):
    supp.append({'sourceRecordId':row['id'],'field':field,'beforeHash':hash_value(value),'reason':'ambiguous-recorded-encoding-or-contact-content','reviewId':'suppress-'+hashlib.sha256((row['id']+'|'+field).encode()).hexdigest()[:24],'sourceEvidence':[{'snapshotSha256':baseline_sha,'sourceField':field,'sourceRecordId':row['id']}],'approved':True})
 # Final packet preserves all R2 repairs and context. Expected hashes always
 # refer to the frozen original, not to a moving intermediate file.
 newpatches=[p for p in r2['patches'] if p['field']!='professional_context']
 newpatches += [{'sourceRecordId':rid,'field':'professional_context','beforeHash':hash_value(byid[rid].get('professional_context')),'value':items,'approved':True} for rid,items in sorted(contexts.items())]
 packet={**r2,'schemaVersion':2,'releaseId':'enriched-r3-20261008','patches':newpatches,'suppressions':supp}
 counts=Counter(x['outcome'] for x in outcomes);kinds=Counter(x['kind'] for x in ledger);providers=Counter(x['provider'] for x in ledger)
 report={'schemaVersion':1,'builderVersion':VERSION,'baselineSha256':baseline_sha,'sourceFileCount':len({s['sourceFile'] for s in source_catalog}),'outcomeCount':len(outcomes),'outcomes':dict(counts),'additionalSourceItems':len(ledger),'additionalSourceRows':len({x['sourceRecordId'] for x in ledger}),'additionalKinds':dict(kinds),'additionalProviders':dict(providers),'combinedContextItems':sum(map(len,contexts.values())),'combinedContextRows':len(contexts),'suppressions':len(supp),'suppressedSourceRows':len({x['sourceRecordId'] for x in supp}),'suppressionFields':dict(Counter(x['field'].split('.')[0] for x in supp)),'newIdentities':0,'originalSourcesModified':False,'humanReviewed':False,'changesNotClaimedAsNovelFacts':True,'researchAttributionsAccepted':0,'limitations':['Source-reported PHIN profile dates are not procedure reporting periods or evidence of current practice.','No explicit profession field in inspected eligible provider exports is replaced by a specialty/headline heuristic.','Trial contacts require independent person corroboration; no new research associations are accepted by this builder.','Provider biographies are original stored exports; flattened wording without source boundaries is not reconstructed.']}
 if set(ownership_reviews)-used_ownership_reviews:raise ValueError('Ownership reviews no longer identify selected source rows')
 out.mkdir(parents=True)
 report['ownershipGate']=ownership_coverage(ownership)
 report['limitations'].append('Rejected new enrichment does not remove existing unsafe baseline material: ownership hold proposals require separate identity-group containment before release. Unknown canonical URL/name associations require typed or reviewed professional corroboration; missing identifiers alone are not conflicts.')
 save(out/'ownership-ledger.json',ownership)
 save(out/'ownership-coverage.json',report['ownershipGate'])
 for name,value in [('repairs.json',packet),('review-ledger.json',ledger),('processing-outcomes.json',outcomes),('suppression-ledger.json',supp),('phin-activity-reconciliation.json',reconcile),('source-catalog.json',list({s['sourceFile']:s for s in source_catalog}.values())),('report.json',report)]:save(out/name,value)
 print(json.dumps(report),flush=True)
if __name__=='__main__':main()
