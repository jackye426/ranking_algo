"""Independent exact-source replay of the enrichment proposal ledger.

Uses a separate HTML parser; JSON field pointers are dereferenced independently.
This is automated source verification, not clinical credential assessment.
"""
from __future__ import annotations
import argparse, ast, hashlib, json, re, sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from bs4 import BeautifulSoup, Tag, NavigableString, Comment
from urllib.parse import urlsplit,urlunsplit
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from verify_bupa_reviews import independently_matches_typed_registration

BLOCKS={'p','div','li','ul','ol','section','blockquote','tr','table','dl','dt','dd'}
def load(path):return json.loads(Path(path).read_text(encoding='utf-8-sig'))
def sha(path):
 with Path(path).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def url(v):
 try:
  u=urlsplit(v)
  return urlunsplit((u.scheme,u.netloc.lower(),u.path.rstrip('/'),'','')) if u.scheme=='https' and not u.username and not u.password else None
 except (ValueError,TypeError):return None
def names(a,b):
 def token(v):
  v=unicodedata.normalize('NFKD',str(v));v=''.join(c for c in v if not unicodedata.combining(c));v=re.sub(r'\([^)]*\)',' ',v.lower()).replace("'",'').replace('-',' ')
  return [x for x in re.findall('[a-z]+',v) if x not in {'mr','mrs','ms','miss','dr','doctor','prof','professor','sir','consultant','associate','frcs','frcp','mbbs','mbchb','phd','mrcs','mrcp'}]
 aa,bb=token(a),token(b)
 return bool(aa and bb) and (aa==bb or len(aa)>1 and len(bb)>1 and aa[-1]==bb[-1] and (aa[0]==bb[0] or (len(aa[0])==1 or len(bb[0])==1) and aa[0][0]==bb[0][0]))
def read_html(binary,label):
 soup=binary if isinstance(binary,BeautifulSoup) else BeautifulSoup(binary.decode('utf8'),'html.parser')
 hs=[h for h in soup.find_all('h4') if ' '.join(h.get_text().split())==label]
 if len(hs)!=1:return None
 nodes=[]
 for node in hs[0].next_siblings:
  if not isinstance(node,Tag):continue
  if re.fullmatch(r'h[1-6]',node.name) or node.find(re.compile(r'^h[1-6]$')):break
  if node.name in {'p','ul','ol','blockquote'}:nodes.append(node)
 lines=[]
 for node in nodes:
  fragment=BeautifulSoup(str(node),'html.parser')
  for x in fragment.find_all(['script','style','noscript']):x.decompose()
  for x in list(fragment.descendants):
   if isinstance(x,Comment):x.extract()
   elif isinstance(x,NavigableString):x.replace_with(re.sub(r'\s+',' ',str(x)))
  for x in fragment.find_all('br'):x.replace_with('\n')
  for x in fragment.find_all(list(BLOCKS)):x.insert_before('\n');x.insert_after('\n')
  lines.extend(' '.join(x.split()) for x in fragment.get_text().split('\n') if x.strip())
 return '\n'.join(lines)
def main():
 p=argparse.ArgumentParser();p.add_argument('--private',required=True);p.add_argument('--prepared',required=True);p.add_argument('--output',required=True);p.add_argument('--all-html',action='store_true');args=p.parse_args()
 private=Path(args.private);prepared=Path(args.prepared);out=Path(args.output)
 if out.exists():raise ValueError('Verification output must be new')
 ledger=load(prepared/'review-ledger.json');catalog={x['sourceFile']:x for x in load(prepared/'source-catalog.json')};raw=load(private/'baseline/raw.json');byid={r['id']:r for r in raw['rows']};eligible=set(load(private/'replay/eligible-source-ids-v2.json')['sourceRecordIds'])
 errors=[];checked=[];cache={};manifest_paths={};by_url=defaultdict(set);html_fields=defaultdict(set)
 for item in ledger:
  if item['extraction'] in {'exact-html-blocks','cromwell-exact-qualification-paragraph'}:html_fields[item['sourceFile']].add(item['sourceField'])
 for row in raw['rows']:
  for mapping in [row.get('profile_urls'),row.get('urls')]:
   if isinstance(mapping,dict):
    for value in mapping.values():
     for v in value if isinstance(value,list) else [value]:
      if url(v):by_url[url(v)].add(row['id'])
 for root in [private/'source-backup',private/'source-backup-supplement']:
  for item in load(root/'backup-manifest.json')['files']:manifest_paths[item['path'].replace('\\','/')]=root
 # Complete JSON item equality review; bounded stratified second-parser HTML
 # review. At least 200 distinct records/400 claims are required, not assumed.
 strata=defaultdict(list)
 for item in ledger:strata[(item['provider'],item['kind'])].append(item)
 selected=set()
 for key,items in sorted(strata.items()):
  for item in sorted(items,key=lambda x:hashlib.sha256(('source-review-v1|'+x['reviewId']).encode()).hexdigest())[:30]:selected.add(item['sourceRecordId'])
 if len(selected)<200:
  for item in sorted(ledger,key=lambda x:hashlib.sha256(('record-review-v1|'+x['sourceRecordId']).encode()).hexdigest()):
   selected.add(item['sourceRecordId'])
   if len(selected)>=200:break
 sample=[x for x in ledger if x['sourceRecordId'] in selected]
 for item in ledger:
  # All non-HTML additions are cheap to verify independently in full.
  if item['extraction']=='exact-html-blocks' and item['sourceRecordId'] not in selected and not args.all_html:continue
  rel=item['sourceFile'];file=prepared/'source-backup'/rel.removeprefix('cromwell-reviewed/') if rel.startswith('cromwell-reviewed/') else manifest_paths[rel]/rel
  if rel not in cache:
   actual=sha(file)
   if actual!=catalog[rel]['sha256']:raise ValueError('Changed original source')
   if file.suffix=='.html':
    soup=BeautifulSoup(file.read_text(encoding='utf8'),'html.parser');br=byid[item['sourceRecordId']];provider_id=re.search(r'/view/(\d+)',item['sourceUrl'],re.I)
    if item['extraction']=='cromwell-exact-qualification-paragraph':
     nodes=soup.select('p.consultant-qualifications');texts={' '.join(n.get_text().split()) for n in nodes};canon=soup.find('link',rel='canonical');cache[rel]={'texts':{'p.consultant-qualifications':next(iter(texts)) if len(texts)==1 else None},'name_matches':bool(soup.h1) and names(soup.h1.get_text(),br['name']),'identity_matches':by_url[url(item['sourceUrl'])]=={item['sourceRecordId']},'url_matches':bool(canon) and url(canon.get('href'))==url(item['sourceUrl'])}
    else:cache[rel]={'texts':{field:read_html(soup,field) for field in html_fields[rel]},'name_matches':bool(soup.h2) and names(soup.h2.get_text(),br['name']),'identity_matches':independently_matches_typed_registration(soup,br),'url_matches':bool(provider_id) and any(re.search(r'/view/'+provider_id[1]+r'(?:[/?]|$)',x.get('href',''),re.I) for x in soup.find_all('a',href=True) if 'printPage=1' in x.get('href',''))}
   elif file.suffix=='.jsonl':
    vals=[]
    for line in file.open(encoding='utf8'):
     try:vals.append(json.loads(line))
     except json.JSONDecodeError:vals.append(None)
    cache[rel]=vals
   else:
    v=load(file);cache[rel]=v if isinstance(v,list) else v['profiles']
  data=cache[rel];matches=True;expected=None;baseline_row=byid[item['sourceRecordId']]
  if item['extraction'] in {'exact-html-blocks','cromwell-exact-qualification-paragraph'}:
   expected=data['texts'][item['sourceField']];name_matches=data['name_matches'];identity_matches=data['identity_matches'];url_matches=data['url_matches']
  else:
   source=data[item['sourceIndex']];value=source[item['sourceField']]
   name_matches=names(source.get('name') or source.get('full_name'),baseline_row['name']);a=str(source.get('gmc_number') or source.get('gmcNumber') or '').strip();b=str(baseline_row.get('gmc_number') or '').strip();identity_matches=not(a and b and a!=b);url_matches=by_url[url(item['sourceUrl'])]=={item['sourceRecordId']}
   if item['extraction']=='labelled-python-string-list-block':
    part=item['sourcePointer'][0];value='\n'.join(ast.literal_eval(value.split(' | ')[part].partition(':')[2]))
   elif item['extraction']=='labelled-python-string-list':
    part,itemindex=item['sourcePointer'];value=ast.literal_eval(value.split(' | ')[part].partition(':')[2])[itemindex]
   else:
    for k in item['sourcePointer']:value=value[k]
   expected=value
   # Source date comes from original PHIN response, not the extraction stamp.
   if item.get('sourceDate'):
    original=json.loads(source['raw_data']).get('last_updated_all','')
    day,month,year=original.split('/');matches=f'{year}-{month}-{day}'==item['sourceDate']
  checks={'exactText':expected==item['text'],'sourceHash':item['sourceSha256']==catalog[rel]['sha256'],'eligibleExistingIdentity':item['sourceRecordId'] in eligible and item['sourceRecordId'] in byid,'compatibleSourceName':name_matches,'registrationDoesNotConflict':identity_matches,'sourceURLMatchesIdentity':url_matches,'sourceDateSemantics':matches,'noInventedActivityMetadata':item.get('metadata') is None}
  result={'reviewId':item['reviewId'],'sourceRecordId':item['sourceRecordId'],'provider':item['provider'],'kind':item['kind'],'checks':checks,'passed':all(checks.values())}
  checked.append(result)
  if not result['passed']:errors.append(result)
 reviewed_records={x['sourceRecordId'] for x in checked};sample_results=[x for x in checked if x['sourceRecordId'] in selected]
 report={'schemaVersion':1,'method':'Independent field-pointer replay and BeautifulSoup HTML block extraction','humanReviewed':False,'clinicalCredentialAssessment':False,'ledgerItems':len(ledger),'checkedItems':len(checked),'checkedDistinctRecords':len(reviewed_records),'stratifiedSampleRecords':len({x['sourceRecordId'] for x in sample_results}),'stratifiedSampleClaims':len(sample_results),'requiredSampleSatisfied':len({x['sourceRecordId'] for x in sample_results})>=200 and len(sample_results)>=400,'failedItems':len(errors),'firstPassSupport':sum(x['passed'] for x in checked)/len(checked) if checked else 0,'sampleProviders':dict(Counter(x['provider'] for x in sample_results)),'sampleKinds':dict(Counter(x['kind'] for x in sample_results)),'results':checked,'failures':errors}
 out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,ensure_ascii=False,separators=(',',':')),encoding='utf8')
 print(json.dumps({k:v for k,v in report.items() if k not in ['results','failures']}))
 if errors or not report['requiredSampleSatisfied']:sys.exit(1)
if __name__=='__main__':main()
