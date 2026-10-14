"""Offline ownership proposals. This module never merges, edits or publishes records.

Typed identifiers compare only within one authority. Canonical URL/name matches
are discovery leads, not approval. A reviewed non-registration binding must cite
exact source and baseline fields and is invalidated by any file/row change.
"""
from __future__ import annotations
import hashlib
import json
import re
import unicodedata
from collections import Counter, defaultdict
from urllib.parse import urlsplit, urlunsplit

VERSION = 'provider-ownership-v3'
HASH = re.compile(r'^[0-9a-f]{64}$')
AUTHORITIES = {'GMC', 'GDC', 'HCPC', 'NMC'}
ALIASES = {'GENERAL MEDICAL COUNCIL':'GMC', 'GENERAL DENTAL COUNCIL':'GDC',
           'HEALTH AND CARE PROFESSIONS COUNCIL':'HCPC', 'NURSING AND MIDWIFERY COUNCIL':'NMC'}
ROLE_PATTERNS = {
 'physiotherapy':r'physiotherap(?:ist|y)', 'dietetic':r'dietiti(?:an|cs)',
 'dental':r'dentist(?:ry)?|dental surgeon|orthodontist|prosthodontist',
 'ophthalmology':r'ophthalmolog(?:ist|y)|ophthalmic surgeon',
 'orthopaedics':r'orthopaedic(?:s| surgeon)?|orthopedic(?:s| surgeon)?',
 'cardiology':r'cardiolog(?:ist|y)', 'gastroenterology':r'gastroenterolog(?:ist|y)',
 'gynaecology':r'gynaecolog(?:ist|y)|gynecolog(?:ist|y)',
 'radiology':r'radiolog(?:ist|y)', 'dermatology':r'dermatolog(?:ist|y)',
 'psychiatry':r'psychiatr(?:ist|y)', 'psychology':r'psycholog(?:ist|y)',
}
BIO_FIELDS = ('about','description','bio','biography_text')
ROLE_FIELDS = ('profession','professional_role','professional_type','specialty','specialties')

def value_hash(value):
 return hashlib.sha256(json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False).encode('utf-8')).hexdigest()

def canonical_url(value):
 if not isinstance(value,str):return None
 try:
  u=urlsplit(value)
  if u.scheme!='https' or not u.hostname or u.username or u.password:return None
  return urlunsplit(('https',u.netloc.lower(),u.path.rstrip('/'),'',''))
 except ValueError:return None

def name_tokens(value):
 text=unicodedata.normalize('NFKD',str(value or ''))
 text=''.join(c for c in text if not unicodedata.combining(c))
 text=re.sub(r'\([^)]*\)',' ',text.lower()).replace("'",'').replace('-',' ')
 return [x for x in re.findall('[a-z]+',text) if x not in {'dr','mr','mrs','ms','miss','prof','professor','sir','consultant','frcp','frcs','phd','mbbs','mbchb'}]

def compatible_names(a,b):
 a,b=name_tokens(a),name_tokens(b)
 return bool(a and b) and (a==b or len(a)>1 and len(b)>1 and a[-1]==b[-1] and
  (a[0]==b[0] or (len(a[0])==1 or len(b[0])==1) and a[0][0]==b[0][0]))

def typed_registrations(row):
 """Use explicitly typed fields only; never mine biographies or memberships."""
 result=defaultdict(set); invalid=[]
 def add(body,value,pointer):
  if not isinstance(body,str):return
  body=ALIASES.get(body.upper().strip(),body.upper().strip())
  if body not in AUTHORITIES or value in (None,''):return
  token=str(value).strip().upper() if isinstance(value,(str,int)) and not isinstance(value,bool) else ''
  # A prefix within an already typed field is formatting, not a new authority.
  # Never strip a different regulator's prefix or mine free-text numbers.
  token=re.sub(r'^'+re.escape(body)+r'\s*[:#-]?\s*','',token)
  token=re.sub(r'\s+','',token)
  # Same typed format contract as expert/data.cjs normalizeRegistration;
  # format validity does not imply current regulator status.
  patterns={'GMC':r'\d{7}','GDC':r'\d{4,8}','HCPC':r'(?:AS|BS|CH|CS|DT|HAD|OT|ODP|OR|PA|PH|PO|PYL|RA|SL)\d{3,8}','NMC':r'\d{2}[A-Z]\d{4}[A-Z]'}
  if re.fullmatch(patterns[body],token) and not re.fullmatch('0+',token):result[body].add(token)
  else:invalid.append({'authority':body,'pointer':pointer,'reason':'unusable-typed-registration'})
 for field,body in [('gmc_number','GMC'),('gmcNumber','GMC'),('gdc_number','GDC'),('hcpc_number','HCPC'),('nmc_number','NMC')]:add(body,row.get(field),[field])
 regs=row.get('professional_registration')
 if isinstance(regs,dict):
  if 'number' in regs:add(regs.get('abbreviation') or regs.get('body'),regs.get('number'),['professional_registration'])
  else:
   for key,value in regs.items():
    if isinstance(value,dict):add(value.get('abbreviation') or key,value.get('number'),['professional_registration',key])
    elif isinstance(value,(str,int)):add(key,value,['professional_registration',key])
 elif isinstance(regs,list):
  for i,value in enumerate(regs):
   if isinstance(value,dict):add(value.get('abbreviation') or value.get('body'),value.get('number'),['professional_registration',i])
 # The application's professional-only projection uses this explicit schema.
 for i,value in enumerate(row.get('registrations') if isinstance(row.get('registrations'),list) else []):
  if isinstance(value,dict):add(value.get('body') or value.get('registration_body'),value.get('identifier') or value.get('number'),['registrations',i])
 return {k:sorted(v) for k,v in sorted(result.items())},invalid

def spire_profile_assertion(source,target,binding):
 """Corroborate a source-native Spire c-number, never create an identifier.

 Only the official host and named consultant routes are eligible. Other suffixes
 are explicitly NOT interpreted as GMC numbers (nor converted into HCPC/NMC).
 The source header, slug and existing owner must agree independently of digits.
 """
 if binding['provider']!='Spire Healthcare':return None
 url=canonical_url(source.get('profile_url'))
 if not url:return None
 u=urlsplit(url)
 if u.netloc not in {'spirehealthcare.com','www.spirehealthcare.com'}:return None
 m=re.fullmatch(r'/(?:[a-z0-9-]+/)?(?:consultants|consultant-profiles)/([a-z0-9-]+)-(c|ch|p|n)(\d{4,9})',u.path,re.I)
 if not m:return None
 slug,suffix,number=m.groups();source_name=source.get('name') or source.get('full_name')
 def slug_agrees(name):
  a,b=name_tokens(name),name_tokens(slug.replace('-',' '))
  # Mirrors the existing corpus rule for a complete name followed by a
  # nickname in the URL; not arbitrary token containment or surname similarity.
  return compatible_names(name,slug.replace('-',' ')) or len(a)>=2 and b[:len(a)]==a
 return {'sourcePointer':['profile_url'],'sourceValueSha256':value_hash(source['profile_url']),
  'canonicalProfileUrl':url,'suffix':suffix.lower(),'number':number,
  'gmcFormatValid':suffix.lower()=='c' and bool(re.fullmatch(r'\d{7}',number)) and number!='0000000',
  'headerCompatible':compatible_names(source_name,target.get('name')),
  'slugCompatible':slug_agrees(source_name) and slug_agrees(target.get('name')),
  'basis':'official-spire-named-consultant-url-recorded-registration-suffix','liveRegisterVerified':False}

def roles(text):
 return sorted(k for k,pattern in ROLE_PATTERNS.items() if re.search(r'\b(?:'+pattern+r')\b',str(text or ''),re.I))

def role_signals(row):
 """Signals are for review, not a replacement profession or identity field.

Biography signals require a named owner or first-person role declaration.
Specialty labels are recorded separately so a bad label is not a person hold
when both biographies and the target label corroborate the same owner role.
"""
 structured=[]; declared=[]; own=name_tokens(row.get('name') or row.get('full_name'))
 for field in ROLE_FIELDS:
  value=row.get(field)
  if isinstance(value,(str,list)):
   found=roles(value)
   if found:structured.append({'field':field,'roles':found})
 for field in BIO_FIELDS:
  value=row.get(field)
  if not isinstance(value,str):continue
  for sentence in re.split(r'[\n.!?]+(?=\s|[A-Z]|$)',value):
   declaration=re.search(r'^\s*(.{0,100}?)\s+(?:am|is|works as|practises as)\s+(?:an?\s+)?(.{0,100})',sentence,re.I)
   if not declaration:
    declaration=re.search(r'^\s*(.{0,100}?)\s+has\b[^.;]{0,160}\bpractice as\s+(?:an?\s+)?(.{0,100})',sentence,re.I)
   if not declaration:continue
   subject,description=declaration.groups();subject_tokens=name_tokens(subject)
   owner=subject.strip().casefold()=='i' or bool(own and subject_tokens==own)
   if not owner:continue
   # A noun in a later hospital/colleague clause is not the declared role.
   description=re.split(r'\b(?:at|with|for|who|and works)\b|[,;]',description,maxsplit=1,flags=re.I)[0]
   found=roles(description)
   if found:declared.append({'field':field,'roles':found,'passage':sentence.strip()})
 return {'structured':structured,'declared':declared}

def make_binding(source,target,*,provider,source_file,source_index,source_file_sha256,baseline_sha256,url):
 return {'provider':provider,'sourceFile':source_file,'sourceIndex':source_index,'sourceRecordId':target.get('id'),
  'sourceFileSha256':source_file_sha256,'baselineSha256':baseline_sha256,
  'sourceRowSha256':value_hash(source),'baselineRowSha256':value_hash(target),'canonicalProfileUrl':canonical_url(url)}

def _get(row,pointer):
 if not isinstance(pointer,list) or not pointer or len(pointer)>8:raise ValueError('Invalid review evidence pointer')
 value=row
 for part in pointer:
  if isinstance(value,dict) and isinstance(part,str) and part in value:value=value[part]
  elif isinstance(value,list) and isinstance(part,int) and not isinstance(part,bool) and 0<=part<len(value):value=value[part]
  else:raise ValueError('Review evidence pointer does not identify a source value')
 if not isinstance(value,(str,list,dict)) or not value:raise ValueError('Review evidence must be nonempty source content')
 return value

def _review_valid(review,binding,source,target):
 if review is None:return False
 if not isinstance(review,dict) or review.get('schemaVersion')!=1 or review.get('decision') not in {'corroborated-existing-owner','source-native-import-continuity'}:raise ValueError('Invalid ownership review')
 if review.get('binding')!=binding:raise ValueError('Ownership review binding drift')
 if not all(isinstance(review.get(k),str) and review[k].strip() for k in ['reviewId','reviewer','rationale']):raise ValueError('Ownership review needs explicit reviewer and rationale')
 if review['decision']=='source-native-import-continuity':return _native_review_valid(review,binding,source,target)
 evidence=review.get('evidence');categories=set()
 if not isinstance(evidence,list) or len(evidence)<2:raise ValueError('Ownership review needs independent corroborating fields')
 pairs=set()
 for item in evidence:
  if not isinstance(item,dict) or item.get('category') not in {'professional-role','career-history','qualification'}:raise ValueError('Names and URLs alone cannot approve ownership')
  a,b=item.get('sourcePointer'),item.get('baselinePointer')
  if not a or not b or a[0] in {'name','full_name','profile_url'} or b[0] in {'name','profile_urls','urls','id'}:raise ValueError('Review needs professional corroboration')
  if value_hash(_get(source,a))!=item.get('sourceValueSha256') or value_hash(_get(target,b))!=item.get('baselineValueSha256'):raise ValueError('Ownership evidence hash mismatch')
  if not isinstance(item.get('rationale'),str) or not item['rationale'].strip():raise ValueError('Ownership evidence rationale missing')
  pairs.add((tuple(a),tuple(b)));categories.add(item['category'])
 if len(pairs)<2 or not categories.intersection({'career-history','qualification'}):raise ValueError('Insufficient independent role/history corroboration')
 return True

def _native_review_valid(review,binding,source,target):
 """Validate a reviewed append-only origin receipt, never infer it from an ID.

 The reviewers must replay/inspect the referenced immutable import separately.
 This gate validates their exact receipt and live input binding; it does not
 execute archived parsers or claim that a supplied output hash was fetched.
 """
 p=review.get('nativeImport')
 if not isinstance(p,dict):raise ValueError('Native ownership needs an import receipt')
 for field in ['sourceRecordId','sourceIndex','sourceFileSha256','sourceRowSha256','baselineRowSha256']:
  if p.get(field)!=binding[field]:raise ValueError('Native import source binding drift')
 if not isinstance(review.get('secondaryReviewer'),str) or not review['secondaryReviewer'].strip() or review['secondaryReviewer']==review['reviewer']:raise ValueError('Native import needs an independent secondary reviewer')
 if not isinstance(review.get('secondaryReviewId'),str) or not review['secondaryReviewId'].strip() or not HASH.fullmatch(str(review.get('secondaryReceiptSha256',''))):raise ValueError('Native import secondary receipt missing')
 for field in ['importer','originalSource','datedOutput']:
  descriptor=p.get(field)
  if not isinstance(descriptor,dict) or not isinstance(descriptor.get('path'),str) or not descriptor['path'].strip() or not HASH.fullmatch(str(descriptor.get('sha256',''))):raise ValueError('Native import file receipt invalid')
 if not isinstance(p['importer'].get('function'),str) or not p['importer']['function'].strip() or not HASH.fullmatch(str(p['datedOutput'].get('rowSha256',''))):raise ValueError('Native import function/output-row receipt missing')
 origin=p['originalSource']
 if not HASH.fullmatch(str(origin.get('rowSha256',''))) or not isinstance(origin.get('sourceIndex'),int) or isinstance(origin.get('sourceIndex'),bool) or origin['sourceIndex']<0:raise ValueError('Native original source row receipt missing')
 identity=p['datedOutput'].get('identity')
 if not isinstance(identity,dict) or identity.get('id')!=target.get('id'):raise ValueError('Native import original identity mismatch')
 source_name=source.get('name') or source.get('full_name')
 if identity.get('name')!=origin.get('name') or not compatible_names(origin.get('name'),source_name) or not compatible_names(source_name,target.get('name')):raise ValueError('Native import owner name drift')
 # A malformed original URL can still have exact import continuity. It is
 # retained only in the private receipt and never promoted to a usable link.
 if identity.get('profileUrl')!=origin.get('profileUrl'):raise ValueError('Native import original profile key mismatch')
 if canonical_url(origin.get('profileUrl'))!=canonical_url(source.get('profile_url')) or (not canonical_url(origin.get('profileUrl')) and origin.get('profileUrl')!=source.get('profile_url')):raise ValueError('Native selected source does not continue the exact original profile')
 if canonical_url(identity.get('profileUrl'))!=binding['canonicalProfileUrl']:raise ValueError('Native import canonical origin mismatch')
 if p.get('professionalProjectionReproduced') is not True or p.get('crossProviderMatchingExecuted') is not False:raise ValueError('Native import must prove exact unmatched append continuity')
 if p.get('fieldMeaningApproval') is not False:raise ValueError('Native import ownership cannot approve field meaning')
 return True

def assess_ownership(source,target,binding,*,source_file_sha256,baseline_sha256,review=None):
 """Validate immutable inputs and return a proposal decision, never a mutation."""
 if not isinstance(source,dict) or not isinstance(target,dict) or not isinstance(binding,dict):raise ValueError('Ownership inputs must be records')
 required={'provider','sourceFile','sourceIndex','sourceRecordId','sourceFileSha256','baselineSha256','sourceRowSha256','baselineRowSha256','canonicalProfileUrl'}
 if set(binding)!=required:raise ValueError('Incomplete ownership binding')
 for key in ['sourceFileSha256','baselineSha256','sourceRowSha256','baselineRowSha256']:
  if not isinstance(binding[key],str) or not HASH.fullmatch(binding[key]):raise ValueError('Invalid ownership hash')
 if binding['sourceFileSha256']!=source_file_sha256 or binding['baselineSha256']!=baseline_sha256:raise ValueError('Ownership file hash mismatch')
 if binding['sourceRowSha256']!=value_hash(source) or binding['baselineRowSha256']!=value_hash(target):raise ValueError('Ownership row hash mismatch')
 if binding['sourceRecordId']!=target.get('id') or not isinstance(binding['sourceRecordId'],str) or not binding['sourceRecordId']:raise ValueError('Ownership target mismatch')
 if not isinstance(binding['sourceIndex'],int) or isinstance(binding['sourceIndex'],bool) or binding['sourceIndex']<0:raise ValueError('Invalid source index')
 if not all(isinstance(binding[k],str) and binding[k] for k in ['provider','sourceFile']):raise ValueError('Source provider/path missing')
 sr,si=typed_registrations(source);tr,ti=typed_registrations(target)
 spire=spire_profile_assertion(source,target,binding)
 spire_conflicts=[];spire_match=False
 if spire:
  if spire['suffix']!='c' and ('GMC' in sr or 'GMC' in tr):spire_conflicts.append('spire-profile-registration-body-conflict')
  if spire['gmcFormatValid']:
   for side,regs in [('source',sr),('baseline',tr)]:
    if regs.get('GMC') and spire['number'] not in regs['GMC']:spire_conflicts.append('spire-profile-'+side+'-registration-conflict')
   spire_match=spire['number'] in tr.get('GMC',[]) and spire['headerCompatible'] and spire['slugCompatible']
 shared=sorted(set(sr)&set(tr));conflicts=[body for body in shared if set(sr[body]).isdisjoint(tr[body])]
 internal=sorted({body for row in [sr,tr] for body,values in row.items() if len(values)>1})
 matches=[body for body in shared if set(sr[body])&set(tr[body])]
 signals={'source':role_signals(source),'baseline':role_signals(target)}
 union=lambda entries:set(role for entry in entries for role in entry['roles'])
 ss=union(signals['source']['structured']);sd=union(signals['source']['declared']);ts=union(signals['baseline']['structured']);td=union(signals['baseline']['declared'])
 # A non-doctor's specialty may be a condition they cover (e.g. a dietitian's
 # gastroenterology interest), not the profession gastroenterologist.
 if 'GMC' not in tr:
  explicit=[x for x in signals['baseline']['structured'] if x['field'] in {'profession','professional_role','professional_type'}]
  ts=union(explicit) or td
 # An explicit "Dentist" label plus dental qualification is a role signal,
 # not a degree alone establishing current practice or registration.
 qualification=source.get('qualifications')
 if 'dental' in ss and re.search(r'\b(?:BDS|BChD|DDS|DMD)\b',str(qualification or '')):sd.add('dental')
 # Signals alone do not establish a cross-person merge: clear declared source
 # role opposed to the existing target's primary role requires hold review.
 role_conflict=bool(sd and (ts or td) and sd.isdisjoint(ts or td))
 metadata_conflict=bool(ss and sd and ss.isdisjoint(sd) and (sd.intersection(ts or td) or sd.intersection(td) and ss==union(signals['baseline']['structured'])))
 if metadata_conflict:role_conflict=False
 source_url=canonical_url(source.get('profile_url'))
 if source_url is None and binding['provider']=='PHIN' and isinstance(source.get('id'),(str,int)):source_url=canonical_url('https://www.phin.org.uk/consultants/'+str(source['id']))
 urls=set()
 for field in ['profile_urls','urls']:
  group=target.get(field)
  for value in group.values() if isinstance(group,dict) else group if isinstance(group,list) else []:
   for url in value if isinstance(value,list) else [value]:
    if canonical_url(url):urls.add(canonical_url(url))
 bound_url=binding['canonicalProfileUrl'];url_bound=bool(bound_url and bound_url==source_url and bound_url in urls)
 if bound_url is not None and not url_bound:raise ValueError('Canonical profile binding does not identify both records')
 reviewed=_review_valid(review,binding,source,target)
 native_reviewed=reviewed and review['decision']=='source-native-import-continuity'
 name_ok=compatible_names(source.get('name') or source.get('full_name'),target.get('name'))
 reasons=[];decision='ownership-review-required';basis=None
 if conflicts:decision='hold-required';reasons+=['conflicting-recorded-'+body for body in conflicts]
 if internal:decision='hold-required';reasons+=['multiple-recorded-identifiers-for-'+body for body in internal]
 if spire_conflicts:decision='hold-required';reasons+=spire_conflicts
 if role_conflict:decision='hold-required';reasons.append('incompatible-declared-professional-role')
 if decision!='hold-required':
  if native_reviewed:
   decision='eligible-for-source-review';basis='reviewed-source-native-immutable-import-continuity'
   if metadata_conflict:reasons.append('provider-role-label-conflicts-with-corroborating-biography')
   if si or ti:reasons.append('malformed-registration-fields-not-approved-by-native-continuity')
   if not url_bound:reasons.append('native-profile-link-unavailable-not-approved')
  elif metadata_conflict:decision='field-review-required';reasons.append('provider-role-label-conflicts-with-corroborating-biography')
  elif not url_bound:reasons.append('canonical-profile-link-unavailable')
  elif si or ti:reasons.append('unusable-typed-registration-needs-review')
  elif spire and not (spire['headerCompatible'] and spire['slugCompatible']):reasons.append('spire-profile-name-difference-needs-review')
  elif reviewed:decision='eligible-for-source-review';basis='reviewed-canonical-profile-and-professional-corroboration'
  elif spire_match:decision='eligible-for-source-review';basis='official-spire-c-gmc-compatible-source-header-slug-and-baseline-registration'
  elif matches and name_ok:decision='eligible-for-source-review';basis='canonical-profile-compatible-name-and-same-typed-registration'
  elif matches:reasons.append('same-recorded-registration-name-difference-needs-review')
  elif sr and tr and not shared:reasons.append('different-registration-authorities-need-dual-role-review')
  else:reasons.append('canonical-profile-name-is-not-independent-ownership-proof')
 return {'schemaVersion':1,'gateVersion':VERSION,'binding':dict(binding),'decision':decision,'identityBasis':basis,
  'mayPrepareSourceProposals':decision=='eligible-for-source-review','baselineSafetyReviewRequired':decision=='hold-required',
  'baselineMaterialAutomaticallyRemoved':False,'reasons':reasons,'sourceRegistrations':sr,'baselineRegistrations':tr,
  'matchingAuthorities':matches,'conflictingAuthorities':conflicts,'internallyConflictingAuthorities':internal,'registrationLimitations':{'source':si,'baseline':ti},
  'sourceNativeProfileAssertion':spire,
  'fieldReviewRequired':metadata_conflict or bool(si or ti) or bool(native_reviewed and not url_bound),
  'nativeImportContinuityReviewed':bool(native_reviewed),'fieldMeaningApproved':False,
  'professionalRoleSignals':signals,'nameCompatible':name_ok,'canonicalProfileBound':url_bound,
  'reviewId':review.get('reviewId') if reviewed else None,'liveRegisterVerified':False,'identityOrDataModified':False}

def coverage(decisions):
 return {'gateVersion':VERSION,'pairs':len(decisions),'decisions':dict(Counter(x['decision'] for x in decisions)),
  'baselineSafetyReviewRequired':sum(x['baselineSafetyReviewRequired'] for x in decisions),
  'withDeclaredRoleSignals':sum(bool(x['professionalRoleSignals']['source']['declared']) for x in decisions),
  'withStructuredRoleSignals':sum(bool(x['professionalRoleSignals']['source']['structured']) for x in decisions),
  'withoutTypedProof':sum(not x['matchingAuthorities'] and x['identityBasis']!='official-spire-c-gmc-compatible-source-header-slug-and-baseline-registration' for x in decisions),
  'sourceNativeSpireRegistrationProof':sum(x['identityBasis']=='official-spire-c-gmc-compatible-source-header-slug-and-baseline-registration' for x in decisions),
  'reviewedNativeImportContinuity':sum(x.get('nativeImportContinuityReviewed',False) for x in decisions),
  'reviewedProfessionalCorroboration':sum(x['identityBasis']=='reviewed-canonical-profile-and-professional-corroboration' for x in decisions),
  'unknownIsNotConflict':True,'namesAloneApproveNothing':True,'newFactsApproved':0,'identitiesModified':0}
