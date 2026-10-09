"""Prepare an untuned, reproducible source/meaning-review specimen packet."""
import argparse,hashlib,json
from pathlib import Path
from collections import defaultdict,Counter

def load(p):return json.loads(Path(p).read_text(encoding='utf8'))
def main():
 p=argparse.ArgumentParser();p.add_argument('--prepared',required=True);p.add_argument('--output',required=True);p.add_argument('--exclude-records');p.add_argument('--seed',default='meaning-review-v1');args=p.parse_args();prepared=Path(args.prepared);out=Path(args.output)
 if out.exists():raise ValueError('Output must be new')
 ledger=load(prepared/'review-ledger.json');excluded={x['sourceRecordId'] for x in load(args.exclude_records)['items']} if args.exclude_records else set();ledger=[x for x in ledger if x['sourceRecordId'] not in excluded];byrow=defaultdict(list);strata=defaultdict(list)
 for item in ledger:byrow[item['sourceRecordId']].append(item);strata[(item['provider'],item['kind'])].append(item)
 rank=lambda x:hashlib.sha256((args.seed+'|'+x['reviewId']).encode()).hexdigest()
 selected=defaultdict(dict)
 for (provider,kind),items in sorted(strata.items()):
  target=8 if kind in {'biography','research-interest','research-background','academic-background','affiliation'} else 4
  chosen=set()
  for item in sorted(items,key=rank):
   if item['sourceRecordId'] in chosen or len(byrow[item['sourceRecordId']])<2:continue
   selected[item['sourceRecordId']][item['reviewId']]=item;chosen.add(item['sourceRecordId'])
   if len(chosen)>=target:break
 for item in sorted(ledger,key=rank):
  if len(selected)>=200:break
  if len(byrow[item['sourceRecordId']])>=2:selected[item['sourceRecordId']][item['reviewId']]=item
 # A sparse provider must not disappear merely because its recovered people
 # have only one new field. Include those records in addition to the base sample.
 represented={x['provider'] for values in selected.values() for x in values.values()}
 for provider in sorted({x['provider'] for x in ledger}-represented):
  seen=set()
  for item in sorted((x for x in ledger if x['provider']==provider),key=rank):
   if item['sourceRecordId'] in seen:continue
   selected[item['sourceRecordId']][item['reviewId']]=item;seen.add(item['sourceRecordId'])
   if len(seen)==4:break
 for rid,items in selected.items():
  for item in sorted(byrow[rid],key=rank):
   if len(items)>=2:break
   items[item['reviewId']]=item
 claims=[]
 for rid,items in selected.items():
  for item in items.values():
   # The complete stored field or exact HTML section is the supporting excerpt;
   # previous mechanical source verification supplies independent equality.
   source_context={'originalField':item['sourceField'],'explicitSectionHeading':item['sourceField'] if item['extraction']=='exact-html-blocks' else None,'fullSupportingText':item['text'],'sourcePointer':item['sourcePointer'],'sourceFile':item['sourceFile'],'sourceIndex':item['sourceIndex'],'sourceSha256':item['sourceSha256']}
   if item['extraction'] in {'labelled-python-string-list','labelled-python-string-list-block'}:source_context['explicitSectionHeading']={'research-interest':'Research','research-background':'Research','membership':'Memberships','professional-body':'Memberships','affiliation':'Other posts held'}[item['kind']]
   if item['extraction']=='cromwell-exact-qualification-paragraph':source_context['explicitSectionHeading']='Qualifications'
   claims.append({**item,'sourceContext':source_context,'requestedReview':{'sourceSupportsMeaning':None,'typeAppropriate':None,'datesAppropriate':None,'attributionAdequate':None,'decision':None,'reason':None}})
 report={'schemaVersion':1,'selectionVersion':args.seed,'excludedPreviouslyReviewedRecords':len(excluded),'method':'Seeded SHA-256 ordering by provider and kind; oversample biographies, research background, training/background and affiliations; two claims per record where available, plus sparse-provider coverage','records':len(selected),'claims':len(claims),'providers':dict(Counter(x['provider'] for x in claims)),'kinds':dict(Counter(x['kind'] for x in claims)),'sourceDatedClaims':sum(bool(x['sourceDate']) for x in claims),'unavailableRequestedStrata':['No added explicit profession field exists; no headline-based profession inferred.','Population additions are unchanged R2 items, not newly extracted in R3.','No new PHIN ranges or activity counts accepted; existing ranges retained separately.','All new R3 items have original source URLs; there are no null-sourceURL additions.'],'items':claims}
 out.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps({k:v for k,v in report.items() if k!='items'}))
if __name__=='__main__':main()
