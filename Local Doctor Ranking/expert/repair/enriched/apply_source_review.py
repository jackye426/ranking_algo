"""Apply explicit, source-review-driven corrections to staged proposals.

Repairs Cromwell qualification boundaries from backed-up literal HTML. Does not
change canonical identities, original archives, database rows or live services.
"""
import argparse,ast,hashlib,json,re,shutil,sys
from pathlib import Path
from collections import Counter
from lxml import html
from bs4 import BeautifulSoup
from prepare_sources import load,save,digest,canonical,compatible,issues,hash_value,all_text,EVIDENCE_FIELDS
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from bupa_parser import serialize_nodes

VERSION='source-review-corrections-v2'
def main():
 p=argparse.ArgumentParser();p.add_argument('--private',required=True);p.add_argument('--prepared',required=True);p.add_argument('--cromwell-source',required=True);p.add_argument('--review-actions');p.add_argument('--confirmation-actions');p.add_argument('--output',required=True);args=p.parse_args()
 private=Path(args.private);prepared=Path(args.prepared);source=Path(args.cromwell_source);out=Path(args.output)
 if out.exists():raise ValueError('New immutable output required')
 out.mkdir(parents=True);backup=out/'source-backup';backup.mkdir();backups=[]
 def copy_original(rel):
  origin=source/rel;target=backup/rel;target.parent.mkdir(parents=True,exist_ok=True);before=origin.stat();b=origin.read_bytes();after=origin.stat()
  if (before.st_size,before.st_mtime_ns)!=(after.st_size,after.st_mtime_ns):raise ValueError('Source changed during copy')
  if target.exists():
   if digest(target)!=hashlib.sha256(b).hexdigest():raise ValueError('Conflicting backup source')
   return target,digest(target)
  target.write_bytes(b);h=digest(target)
  if h!=hashlib.sha256(b).hexdigest():raise ValueError('Backup mismatch')
  backups.append({'path':rel.replace('\\','/'),'sha256':h,'bytes':len(b)});return target,h
 meta_file,_=copy_original('cache/html/cache_metadata.json');meta=load(meta_file)
 copy_original('cromwell_profile_parser.py');copy_original('utils/html_cache.py')
 raw=load(private/'baseline/raw.json');byid={x['id']:x for x in raw['rows']};eligible=set(load(private/'replay/eligible-source-ids-v2.json')['sourceRecordIds'])
 packet=load(prepared/'repairs.json');ledger=load(prepared/'review-ledger.json');catalog=load(prepared/'source-catalog.json');outcomes=load(prepared/'processing-outcomes.json');byreview={x['reviewId']:x for x in ledger};decisions=[];new_ledger=[];supp=list(packet.get('suppressions',[]));supkeys={(x['sourceRecordId'],x['field']) for x in supp};patchkeys={(x['sourceRecordId'],x['field']) for x in packet['patches'] if x['field']!='professional_context'}
 reviewed_actions=load(args.review_actions) if args.review_actions else [];reviewed_exclusions={x['reviewId']:x for x in reviewed_actions if x['decision']=='source-bound-professional-only-repair'}
 confirmation_actions=load(args.confirmation_actions) if args.confirmation_actions else [];confirmation_exclusions={x['reviewId']:x for x in confirmation_actions}
 def confirmation_bad(review_id,text,source_sha):
  reviewed=confirmation_exclusions.get(review_id)
  if not reviewed:return None
  if hashlib.sha256(text.encode()).hexdigest()!=reviewed['textSha256'] or source_sha!=reviewed['sourceSha256']:raise ValueError('Confirmation no longer describes this source claim')
  return 'independently-reviewed-confirmation-source-block'
 def suppress(row,field,reason,source_sha,source_field):
  if (row['id'],field) in supkeys or (row['id'],field) in patchkeys:return
  v=row
  for part in field.split('.'):v=v.get(part) if isinstance(v,dict) else None
  if v is None:return
  supkeys.add((row['id'],field));supp.append({'sourceRecordId':row['id'],'field':field,'beforeHash':hash_value(v),'reason':reason,'reviewId':'source-review-supp-'+hashlib.sha256((row['id']+'|'+field).encode()).hexdigest()[:22],'sourceEvidence':[{'snapshotSha256':source_sha,'sourceField':source_field,'sourceRecordId':row['id']}],'approved':True})
 by_source_url={}
 for row in raw['rows']:
  for u in (row.get('profile_urls') or {}).values():
   if canonical(u):by_source_url.setdefault(canonical(u),[]).append(row)
 new_qualification_rows={}
 export_rel='Hospital + insurance/Cromwell/results/consultant_profiles_final_20260215_205717.json';export=load(private/'source-backup'/export_rel);export=export if isinstance(export,list) else export['profiles']
 recovery=[]
 for index,sr in enumerate(export):
  url=canonical(sr.get('profile_url'));matches=by_source_url.get(url,[]);entry={'provider':'Cromwell Hospital','sourceIndex':index,'sourceField':'qualifications','outcome':None};recovery.append(entry)
  if len(matches)!=1:entry['outcome']='no-single-eligible-existing-identity';continue
  row=matches[0];entry['sourceRecordId']=row['id']
  if row['id'] not in eligible:entry['outcome']='identity-held';continue
  if not compatible(sr.get('name'),row.get('name')):entry['outcome']='name-conflict';continue
  cm=meta.get(sr['profile_url']);filename=cm.get('filename') if isinstance(cm,dict) else None
  if not filename or Path(filename).name!=filename:entry['outcome']='missing-safe-cache-reference';continue
  rel='cache/html/'+filename;file,source_sha=copy_original(rel);b=file.read_bytes();doc=html.fromstring(b.decode('utf8'),parser=html.HTMLParser(no_network=True));canon=doc.xpath('//link[@rel="canonical"]/@href');h1=doc.xpath('//h1');nodes=doc.xpath('//p[contains(concat(" ",normalize-space(@class)," ")," consultant-qualifications ")]')
  if len(canon)!=1 or canonical(canon[0])!=url or not h1 or not compatible(''.join(h1[0].itertext()),row['name']):entry['outcome']='html-identity-conflict';continue
  rendered=[serialize_nodes([node]) for node in nodes]
  if not rendered or len({x['text'] for x in rendered})!=1:entry['outcome']='missing-or-conflicting-qualification-paragraph';continue
  parsed=rendered[0];text=parsed['text'];bad=issues(text)
  if not text or bad:entry.update(outcome='unusable-original-qualification',reasons=bad);continue
  independent=BeautifulSoup(b.decode('utf8'),'html.parser').select('p.consultant-qualifications')
  values={' '.join(node.get_text().split()) for node in independent};compared=next(iter(values)) if len(values)==1 else None
  if compared!=' '.join(text.split()):raise ValueError('Cromwell independent parser mismatch')
  review_id='cromwell-qualification-'+hashlib.sha256((row['id']+'|'+source_sha).encode()).hexdigest()[:24];source_file='cromwell-reviewed/'+rel
  prov={'sourceUrl':url,'sourceLabel':'Cromwell Hospital','sourceDate':None,'observedAt':None,'snapshotSha256':source_sha,'parserVersion':VERSION,'reviewId':review_id,'sourceField':'p.consultant-qualifications'}
  new_qualification_rows[row['id']]={'kind':'qualification','text':text,'provenance':prov}
  entry.update(outcome='recovered-literal-qualification-paragraph',reviewId=review_id,sourceSha256=source_sha,independentParserPassed=True)
  new_ledger.append({'sourceRecordId':row['id'],'provider':'Cromwell Hospital','sourceFile':source_file,'sourceIndex':index,'sourceField':'p.consultant-qualifications','sourcePointer':[],'kind':'qualification','reviewId':review_id,'text':text,'sourceSha256':source_sha,'sourceUrl':url,'identityBasis':'existing-canonical-url-export-name-html-canonical-and-html-name','extraction':'cromwell-exact-qualification-paragraph','sourceDate':None,'metadata':None,'humanReviewed':False,'currentPracticeVerified':False})
  catalog.append({'sourceFile':source_file,'sha256':source_sha,'bytes':len(b)})
  if row.get('qualifications')==sr.get('qualifications') and row.get('qualifications'):
   suppress(row,'qualifications','Faulty provider qualification tokenisation replaced by intact source paragraph',source_sha,'p.consultant-qualifications')
 def contamination(text):
  if not re.search(r'[A-Za-z0-9]',text):return 'punctuation-only-empty-evidence'
  if re.search(r'&\s*;',text):return 'malformed-recorded-entity-fragment'
  if re.search(r'\bPersonal\s*:|\b(?:she|he|they)\s+(?:has|have)\s+(?:had\s+)?(?:one|two|three|four|five|six|[1-9])\s+(?:(?:lovely|young|adult|grown(?:-up)?)\s+)?children\b|\b(?:she|he|they)\s+(?:is|are)\s+married\b',text,re.I):return 'unrelated-personal-content'
  if re.search(r'\bfamily life\b|\b(?:grew up|grammar school|was born|she enjoys|he enjoys|her sons|his sons|her daughters|his daughters)\b|\b(?:her|his)\s+(?:one|two|three|four|five|six)\s+(?:sons|daughters)\b|\bmenopause\s+(?:herself|myself)\b',text,re.I):return 'unrelated-personal-history-block'
  if re.search(r'\bplease\s+(?:call|telephone|phone)\b|\b(?:call|telephone|phone)\s+(?:us\s+)?(?:on\s+)?(?:\+44|0)[\d\s()-]{8,}',text,re.I):return 'contact-administration-block'
  if re.search(r'\bHCA is transparent about our relationship\b|\bamount we pay this doctor\b',text,re.I):return 'generic-publisher-relationship-boilerplate'
  if re.search(r'\bpage link\b|\bresearchhere\b',text,re.I):return 'navigation-or-broken-link-content'
  return None
 def suppress_matching(row,text,reason,source_sha,source_field):
  for field in EVIDENCE_FIELDS:
   if field=='about_alternatives':
    for provider,value in (row.get(field) or {}).items():
     if re.fullmatch('[A-Za-z0-9_-]+',provider) and text in all_text(value):suppress(row,field+'.'+provider,reason,source_sha,source_field)
   elif text in all_text(row.get(field)):suppress(row,field,reason,source_sha,source_field)
 # Keep a labelled Research list together; a detached PMID, introduction or
 # meeting mention is not independent evidence of research expertise.
 nuffield_rel='Hospital + insurance/Nuffield Health/data/output/nuffield_consultant_profiles.json';nu=load(private/'source-backup'/nuffield_rel);nu=nu if isinstance(nu,list) else nu['profiles'];nuffield_sha=digest(private/'source-backup'/nuffield_rel)
 research_groups={};research_additions={};research_recovery=[]
 for r in ledger:
  if r['provider']=='Nuffield Health' and r['sourceField']=='related_experience' and r['kind']=='research-interest':research_groups.setdefault((r['sourceRecordId'],r['sourceIndex'],r['sourcePointer'][0]),r)
 for (rid,index,part),r in research_groups.items():
  labelled=nu[index]['related_experience'].split(' | ')[part];label,_,literal=labelled.partition(':')
  if label!='Research':raise ValueError('Research label changed')
  values=ast.literal_eval(literal)
  if not isinstance(values,list) or any(not isinstance(x,str) for x in values):raise ValueError('Unexpected Research source shape')
  text='\n'.join(values);review_id='research-block-'+hashlib.sha256((rid+'|'+str(index)+'|'+str(part)+'|'+text).encode()).hexdigest()[:26];bad=confirmation_bad(review_id,text,nuffield_sha) or contamination(text)
  # URL-only references are not invented authorship; the whole block stays
  # qualified research background. Contact/personal/encoding remains withheld.
  from bupa_parser import MOJIBAKE,CONTACT,PERSONAL
  if MOJIBAKE.search(text) or CONTACT.search(text) or PERSONAL.search(text):bad=bad or 'source-content-not-professional-safe'
  if re.search(r'&(?:amp|lt|gt|quot|apos|nbsp)(?![A-Za-z0-9#;])',text):bad=bad or 'incomplete-recorded-html-entity'
  entry={'sourceRecordId':rid,'provider':'Nuffield Health','sourceIndex':index,'sourceField':'related_experience','sourcePointer':[part],'outcome':'withheld-source-research-block' if bad else 'recovered-whole-research-source-block','reason':bad};research_recovery.append(entry)
  if bad or not text.strip():
   for old in values:suppress_matching(byid[rid],old,'Research source block contains '+str(bad),nuffield_sha,'related_experience:Research')
   continue
  prov={**next(x['provenance'] for p in packet['patches'] if p['sourceRecordId']==rid and p['field']=='professional_context' for x in p['value'] if x['provenance']['reviewId']==r['reviewId']),'parserVersion':VERSION,'reviewId':review_id,'sourceField':'related_experience:Research'}
  research_additions.setdefault(rid,[]).append({'kind':'research-background','text':text,'provenance':prov})
  new_ledger.append({**r,'kind':'research-background','sourcePointer':[part],'reviewId':review_id,'text':text,'sourceSha256':nuffield_sha,'extraction':'labelled-python-string-list-block','sourceSection':'Research'})
 # Audit every original context item: retain, reclassify, recover or withhold.
 contexts={};removed=set();reclassified={};nav_fields={(r['sourceRecordId'],r['provider'],r['sourceField']) for r in ledger if re.search(r'\bpage link\b',r['text'],re.I)}
 for patch in packet['patches']:
  if patch['field']!='professional_context':continue
  target=[];rid=patch['sourceRecordId'];row=byid[rid]
  for item in patch['value']:
   review_id=item['provenance']['reviewId'];record=byreview.get(review_id);decision=None
   bad='navigation-contaminated-source-field' if record and (rid,record['provider'],record['sourceField']) in nav_fields else contamination(item['text'])
   bad=confirmation_bad(review_id,item['text'],item['provenance']['snapshotSha256']) or bad
   if review_id in reviewed_exclusions:
    reviewed=reviewed_exclusions[review_id]
    if hashlib.sha256(item['text'].encode()).hexdigest()!=reviewed['textSha256'] or item['provenance']['snapshotSha256']!=reviewed['sourceSha256']:raise ValueError('Independent review no longer describes this source claim')
    bad='independently-reviewed-nonprofessional-block'
   if record and record['provider']=='Nuffield Health' and record['sourceField']=='related_experience' and record['kind']=='research-interest':decision='superseded-by-source-ordered-research-block';removed.add(review_id)
   elif record and record['provider']=='Cromwell Hospital' and record['kind']=='qualification':
    decision='superseded-by-intact-source-qualification' if rid in new_qualification_rows else 'withheld-provider-qualification-fragments-without-intact-source';removed.add(review_id)
   elif bad:
    decision='withheld-'+bad;removed.add(review_id);suppress_matching(row,item['text'],bad,item['provenance']['snapshotSha256'],item['provenance']['sourceField'])
   elif item['kind']=='biography' and re.search(r'(?:\.{3}|\u2026)\s*$',item['text']):
    decision='withheld-truncated-source-biography';removed.add(review_id)
    # Withhold matching current primary/alternative fragments, not unrelated bios.
    for field in ['about']:
     if row.get(field)==item['text']:suppress(row,field,'Known truncated biography retained in source record',item['provenance']['snapshotSha256'],item['provenance']['sourceField'])
    for provider,text in (row.get('about_alternatives') or {}).items():
     if text==item['text'] and re.fullmatch('[A-Za-z0-9_-]+',provider):suppress(row,'about_alternatives.'+provider,'Known truncated biography retained in source record',item['provenance']['snapshotSha256'],item['provenance']['sourceField'])
   else:
    new_kind='treatment-listing' if record and record['sourceField']=='treatments' else 'professional-body' if item['kind']=='membership' else None
    if new_kind and item['kind']!=new_kind:item={**item,'kind':new_kind};reclassified[review_id]=new_kind;decision='reclassified-source-field-semantics'
    target.append(item)
   if decision:decisions.append({'reviewId':review_id,'sourceRecordId':rid,'outcome':decision,'previousKind':record['kind'] if record else None,'kind':reclassified.get(review_id),'sourceSha256':item['provenance']['snapshotSha256']})
  if rid in new_qualification_rows:target.append(new_qualification_rows.pop(rid))
  target.extend(research_additions.pop(rid,[]))
  contexts[rid]=target
 for rid,item in new_qualification_rows.items():contexts[rid]=[item]
 accepted=[{**r,'kind':reclassified.get(r['reviewId'],r['kind'])} for r in ledger if r['reviewId'] not in removed]+new_ledger
 # Reflection in per-proposal outcomes prevents rejected additions remaining
 # counted as accepted in a preceding preparation report.
 decision_map={d['reviewId']:d for d in decisions}
 for o in outcomes:
  if o.get('reviewId') in decision_map:o.update(finalOutcome=decision_map[o['reviewId']]['outcome'],finalKind=decision_map[o['reviewId']]['kind'])
 outcomes.extend(recovery)
 packet={**packet,'schemaVersion':2,'patches':[p for p in packet['patches'] if p['field']!='professional_context']+[{'sourceRecordId':rid,'field':'professional_context','beforeHash':hash_value(byid[rid].get('professional_context')),'value':value,'approved':True} for rid,value in sorted(contexts.items()) if value],'suppressions':supp}
 report={'schemaVersion':1,'reviewAdapterVersion':VERSION,'inputPacketSha256':digest(prepared/'repairs.json'),'additionalSourceItems':len(accepted),'additionalSourceRows':len({x['sourceRecordId'] for x in accepted}),'additionalKinds':dict(Counter(x['kind'] for x in accepted)),'additionalProviders':dict(Counter(x['provider'] for x in accepted)),'combinedContextItems':sum(map(len,contexts.values())),'combinedContextRows':len(contexts),'suppressions':len(supp),'suppressedSourceRows':len({x['sourceRecordId'] for x in supp}),'reviewDecisions':dict(Counter(x['outcome'] for x in decisions)),'cromwellRecovery':dict(Counter(x['outcome'] for x in recovery)),'backedUpFiles':len(backups),'newIdentities':0,'humanReviewed':False,'changesNotClaimedAsNovelFacts':True}
 final_by_id={x['reviewId']:x for x in accepted};remediation=[]
 for old in reviewed_actions:
  current=final_by_id.get(old['reviewId']);replacement=[]
  if not current:
   replacement=[x for x in accepted if x['sourceRecordId']==old['sourceRecordId'] and ((old['provider']=='Cromwell Hospital' and old['kindAsReviewed']=='qualification' and x['extraction']=='cromwell-exact-qualification-paragraph') or (old['provider']=='Nuffield Health' and old['kindAsReviewed']=='research-interest' and x['extraction']=='labelled-python-string-list-block'))]
  remediation.append({'reviewId':old['reviewId'],'originalDecision':old['decision'],'originalMeaningSupported':old['sourceMeaningSupportedAsStandalone'],'finalDisposition':'retained-with-source-specific-neutral-classification' if current else 'replaced-with-intact-source-context' if replacement else 'withheld','finalKind':current['kind'] if current else None,'sourceBasis':old['sourceSha256'],'replacements':[{'reviewId':x['reviewId'],'kind':x['kind'],'textSha256':hashlib.sha256(x['text'].encode()).hexdigest(),'sourceSha256':x['sourceSha256']} for x in replacement]})
 for name,value in [('repairs.json',packet),('review-ledger.json',accepted),('processing-outcomes.json',outcomes),('source-review-decisions.json',decisions),('source-catalog.json',catalog),('suppression-ledger.json',supp),('cromwell-recovery.json',recovery),('research-block-recovery.json',research_recovery),('first-pass-remediation.json',remediation),('report.json',report)]:save(out/name,value)
 confirmation_remediation=[]
 for old in confirmation_actions:
  if old['reviewId'] in final_by_id:raise ValueError('Known confirmation defect remains accepted')
  matching=[s for s in supp if s['sourceRecordId']==old['sourceRecordId']]
  confirmation_remediation.append({'reviewId':old['reviewId'],'sampleIndex':old['sampleIndex'],'sourceRecordId':old['sourceRecordId'],'originalDecision':old['decision'],'sourceSha256':old['sourceSha256'],'originalTextSha256':old['textSha256'],'finalDisposition':'withheld-source-block','replacement':None,'matchingBaselineExclusions':[{'field':s['field'],'beforeHash':s['beforeHash'],'reviewId':s['reviewId']} for s in matching],'originalFrozenSamplePreserved':True})
 save(out/'confirmation-remediation.json',confirmation_remediation)
 save(backup/'backup-manifest.json',{'sourceRoot':str(source),'purpose':'Original Cromwell source HTML and parser checksum backup on separate disk','files':backups})
 shutil.copyfile(prepared/'phin-activity-reconciliation.json',out/'phin-activity-reconciliation.json')
 print(json.dumps(report),flush=True)
if __name__=='__main__':main()
