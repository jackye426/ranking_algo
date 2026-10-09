"""Fictional ownership fixtures only; no archived source records or identifiers."""
import copy
import tempfile
import unittest
from pathlib import Path
from provider_ownership import assess_ownership, make_binding, typed_registrations, value_hash, coverage
from prepare_sources import bind_existing_source, source_rows

class ProviderOwnership(unittest.TestCase):
 def setUp(self):
  self.url='https://example.org/people/alex-jones'
  self.source={'name':'Dr Alex Jones','profile_url':self.url,'gmc_number':'1234567','specialty':'Cardiology','about':'Dr Alex Jones is a consultant cardiologist at Example Hospital.','qualifications':['MD']}
  self.target={'id':'fictional-row','name':'Dr Alex Jones','gmc_number':'1234567','specialty':'Cardiology','about':'Dr Alex Jones is a consultant cardiologist at Example Hospital.','qualifications':['MD'],'profile_urls':{'example':self.url}}
  self.file_sha='a'*64;self.baseline_sha='b'*64
 def binding(self):return make_binding(self.source,self.target,provider='Example provider',source_file='source.json',source_index=5,source_file_sha256=self.file_sha,baseline_sha256=self.baseline_sha,url=self.url)
 def run_gate(self,binding=None,review=None):return assess_ownership(self.source,self.target,binding or self.binding(),source_file_sha256=self.file_sha,baseline_sha256=self.baseline_sha,review=review)
 def review(self):
  return {'schemaVersion':1,'decision':'corroborated-existing-owner','reviewId':'fictional-review','reviewer':'source-reviewer','rationale':'The exact professional role and recorded qualification corroborate this existing canonical profile.','binding':self.binding(),'evidence':[
   {'category':'professional-role','sourcePointer':['about'],'baselinePointer':['about'],'sourceValueSha256':value_hash(self.source['about']),'baselineValueSha256':value_hash(self.target['about']),'rationale':'The role and named institution match.'},
   {'category':'qualification','sourcePointer':['qualifications'],'baselinePointer':['qualifications'],'sourceValueSha256':value_hash(self.source['qualifications']),'baselineValueSha256':value_hash(self.target['qualifications']),'rationale':'The recorded qualification matches.'}]}
 def test_same_typed_identity_only_admits_source_review(self):
  result=self.run_gate();self.assertTrue(result['mayPrepareSourceProposals']);self.assertFalse(result['liveRegisterVerified']);self.assertFalse(result['identityOrDataModified'])
 def test_same_initial_and_registration_does_not_rewrite_name(self):
  self.source['name']='Dr A Jones';before=copy.deepcopy(self.target);self.assertTrue(self.run_gate()['mayPrepareSourceProposals']);self.assertEqual(self.target,before)
 def test_different_name_with_same_registration_needs_review(self):
  self.source['name']='Dr Jamie Brown';self.assertEqual(self.run_gate()['decision'],'ownership-review-required')
 def test_conflicting_same_authority_requires_baseline_hold_review(self):
  self.source['gmc_number']='7654321';result=self.run_gate();self.assertEqual(result['decision'],'hold-required');self.assertTrue(result['baselineSafetyReviewRequired']);self.assertFalse(result['baselineMaterialAutomaticallyRemoved'])
 def test_one_matching_authority_does_not_hide_second_conflicting_authority(self):
  self.source['gdc_number']='12345';self.target['gdc_number']='54321';self.assertEqual(self.run_gate()['decision'],'hold-required')
 def test_internal_identifier_conflict_cannot_pass_on_partial_overlap(self):
  self.source['professional_registration']={'GMC':{'number':'7654321'}};result=self.run_gate();self.assertEqual(result['decision'],'hold-required');self.assertEqual(result['internallyConflictingAuthorities'],['GMC'])
 def test_review_cannot_override_recorded_registration_conflict(self):
  self.source['gmc_number']='7654321';self.assertEqual(self.run_gate(review=self.review())['decision'],'hold-required')
 def test_missing_registration_is_unknown_not_conflict(self):
  self.source.pop('gmc_number');result=self.run_gate();self.assertEqual(result['decision'],'ownership-review-required');self.assertFalse(result['baselineSafetyReviewRequired'])
 def test_name_and_url_never_autoapprove(self):
  self.source.pop('gmc_number');self.target.pop('gmc_number');self.assertFalse(self.run_gate()['mayPrepareSourceProposals'])
 def test_non_doctor_same_typed_authority_is_supported(self):
  for row in [self.source,self.target]:row.pop('gmc_number');row.update(professional_registration={'HCPC':{'abbreviation':'HCPC','number':'DT12345'}},specialty='Dietetics',about='I am a dietitian.')
  self.assertTrue(self.run_gate()['mayPrepareSourceProposals'])
 def test_nongmc_corroborated_canonical_profile_has_explicit_review_path(self):
  for row in [self.source,self.target]:row.pop('gmc_number');row.update(specialty='Dietetics',about='I am a dietitian at Example Hospital.',qualifications=['BSc Dietetics'])
  result=self.run_gate(review=self.review());self.assertTrue(result['mayPrepareSourceProposals']);self.assertEqual(result['reviewId'],'fictional-review')
 def test_different_authorities_need_review_not_automatic_conflict(self):
  self.source.pop('gmc_number');self.source['gdc_number']='12345';result=self.run_gate();self.assertEqual(result['decision'],'ownership-review-required');self.assertFalse(result['baselineSafetyReviewRequired'])
 def test_registration_in_memberships_is_not_typed_proof(self):
  self.source.pop('gmc_number');self.source['professional_memberships']='GMC 1234567';self.assertFalse(self.run_gate()['mayPrepareSourceProposals'])
 def test_invalid_identifier_cannot_disappear_behind_valid_identifier(self):
  self.source['gmcNumber']='unknown';result=self.run_gate();self.assertEqual(result['decision'],'ownership-review-required');self.assertTrue(result['registrationLimitations']['source'])
 def test_structured_typed_registration_formats(self):
  regs,invalid=typed_registrations({'professional_registration':[{'body':'General Medical Council','number':'1234567'},{'abbreviation':'HCPC','number':'PH12345'},{'abbreviation':'NMC','number':'12A3456B'}]})
  self.assertEqual(regs,{'GMC':['1234567'],'HCPC':['PH12345'],'NMC':['12A3456B']});self.assertEqual(invalid,[])
 def test_unknown_hcpc_prefix_and_zero_identifiers_are_not_typed_proof(self):
  regs,invalid=typed_registrations({'hcpc_number':'ZZ12345','gmc_number':'0000000'});self.assertEqual(regs,{});self.assertEqual(len(invalid),2)
 def test_explicit_typed_prefixes_and_projection_schema(self):
  regs,invalid=typed_registrations({'gmc_number':'GMC 1234567','hcpc_number':'HCPC: PH 12345','registrations':[{'registration_body':'General Dental Council','identifier':'GDC 12345'}]})
  self.assertEqual(regs,{'GMC':['1234567'],'GDC':['12345'],'HCPC':['PH12345']});self.assertEqual(invalid,[])
 def test_different_authority_prefix_is_not_stripped(self):
  regs,invalid=typed_registrations({'gmc_number':'GDC 1234567','hcpc_number':'GMC PH12345'});self.assertEqual(regs,{});self.assertEqual(len(invalid),2)
 def test_declared_wrong_professional_role_requires_hold_review(self):
  self.source.pop('gmc_number');self.source.update(specialty='Physiotherapy',about='Dr Alex Jones is a senior physiotherapist at Example Hospital.')
  self.target.update(specialty='Orthopaedic surgery',about='Dr Alex Jones is an orthopaedic surgeon at Another Hospital.')
  self.assertEqual(self.run_gate()['decision'],'hold-required')
 def test_wrong_primary_import_not_excused_by_matching_wrong_biography(self):
  self.source.pop('gmc_number');self.source.update(specialty='Orthopaedics',about='Dr Alex Jones is an orthopaedic surgeon at Example Hospital.')
  self.target['about']=self.source['about'];self.assertEqual(self.run_gate()['decision'],'hold-required')
 def test_source_wrong_specialty_label_is_field_review_not_person_hold(self):
  self.source.update(specialty='Gynaecology',about='Dr Alex Jones is a consultant gastroenterologist at Example Hospital.')
  self.target.update(specialty='Gastroenterology',about=self.source['about']);result=self.run_gate();self.assertEqual(result['decision'],'field-review-required');self.assertFalse(result['baselineSafetyReviewRequired'])
 def test_colleague_role_does_not_conflict_with_owner_role(self):
  self.source['about']='My colleague Jamie Brown is a physiotherapist. I am a cardiologist.';self.assertTrue(self.run_gate()['mayPrepareSourceProposals'])
 def test_team_role_is_not_owner_declaration(self):
  self.source['about']='We are a team of physiotherapists.';self.assertEqual(self.run_gate()['professionalRoleSignals']['source']['declared'],[])
 def test_nondoctor_specialty_topic_does_not_become_a_different_profession(self):
  for row in [self.source,self.target]:row.pop('gmc_number');row.update(specialty='Gastroenterology',about='I am a dietitian.')
  self.source.pop('specialty');self.assertEqual(self.run_gate()['decision'],'ownership-review-required');self.assertFalse(self.run_gate()['baselineSafetyReviewRequired'])
 def test_shared_bad_specialty_label_with_matching_biography_is_field_review(self):
  for row in [self.source,self.target]:row.pop('gmc_number');row.update(specialty='Psychology',about='Dr Alex Jones is a dietitian.')
  self.assertEqual(self.run_gate()['decision'],'field-review-required')
 def test_dentist_label_and_qualification_against_ophthalmic_owner_needs_hold(self):
  self.source.pop('gmc_number');self.source.update(specialty='Dentist',about='Professional dental services.',qualifications='BDS')
  self.target.update(specialty='Ophthalmology',about='I am an ophthalmic surgeon.')
  self.assertEqual(self.run_gate()['decision'],'hold-required')
 def test_explicit_named_practice_clause_is_a_role_signal(self):
  self.source.pop('gmc_number');self.source.update(about='Dr Alex Jones has contributed to education alongside his busy practice as a consultant cardiologist.',specialty='Cardiology')
  self.target.update(specialty='Orthopaedics',about='I am an orthopaedic surgeon.')
  self.assertEqual(self.run_gate()['decision'],'hold-required')
 def test_missing_url_is_not_identity_conflict(self):
  self.source.pop('profile_url');self.url=None;result=self.run_gate();self.assertEqual(result['decision'],'ownership-review-required');self.assertFalse(result['baselineSafetyReviewRequired'])
 def test_url_on_other_record_rejected(self):
  self.target['profile_urls']={'example':'https://example.org/other'}
  with self.assertRaisesRegex(ValueError,'Canonical profile'):self.run_gate()
 def test_review_requires_role_or_history_not_names(self):
  r=self.review();r['evidence'][0]['sourcePointer']=['name']
  with self.assertRaisesRegex(ValueError,'professional corroboration'):self.run_gate(review=r)
 def test_repeated_same_evidence_does_not_create_independent_corroboration(self):
  r=self.review();r['evidence'][1]=copy.deepcopy(r['evidence'][0]);r['evidence'][1]['category']='qualification'
  with self.assertRaisesRegex(ValueError,'independent'):self.run_gate(review=r)
 def test_review_hash_drift_rejected(self):
  r=self.review();r['evidence'][0]['sourceValueSha256']='f'*64
  with self.assertRaisesRegex(ValueError,'evidence hash'):self.run_gate(review=r)
 def test_review_cannot_be_reused_for_different_provider_or_index(self):
  for field,value in [('provider','Other'),('sourceIndex',6),('sourceFile','other.json'),('sourceRecordId','other')]:
   r=self.review();r['binding'][field]=value
   with self.assertRaisesRegex(ValueError,'binding drift'):self.run_gate(review=r)
 def test_all_file_and_row_hashes_fail_closed(self):
  for field in ['sourceFileSha256','baselineSha256','sourceRowSha256','baselineRowSha256']:
   b=self.binding();b[field]='f'*64
   with self.assertRaisesRegex(ValueError,'hash mismatch'):self.run_gate(binding=b)
 def test_modified_source_after_binding_rejected(self):
  b=self.binding();self.source['about']='Altered source.'
  with self.assertRaisesRegex(ValueError,'row hash'):self.run_gate(binding=b)
 def test_no_input_mutation_on_success_or_conflict(self):
  for conflicting in [False,True]:
   if conflicting:self.source['gmc_number']='7654321'
   before=copy.deepcopy([self.source,self.target]);self.run_gate();self.assertEqual([self.source,self.target],before)
 def test_prepare_binding_uses_gate(self):
  self.source.pop('gmc_number');r=bind_existing_source(self.source,self.target,provider='Example provider',rel='source.json',index=5,source_sha=self.file_sha,baseline_sha=self.baseline_sha,url=self.url)
  self.assertFalse(r['mayPrepareSourceProposals']);self.assertEqual(r['binding']['sourceRowSha256'],value_hash(self.source))
 def test_malformed_jsonl_keeps_physical_index(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'source.jsonl';p.write_text('{"name":"first"}\nnot json\n\n{"name":"fourth"}\n',encoding='utf-8')
   rows=list(source_rows(p));self.assertEqual([x[0] for x in rows],[0,1,2,3]);self.assertEqual(rows[1][2],'malformed-jsonl');self.assertEqual(rows[3][1]['name'],'fourth')
 def test_coverage_separates_unknown_and_hold(self):
  a=self.run_gate();self.source.pop('gmc_number');b=self.run_gate();self.source['gmc_number']='7654321';c=self.run_gate();r=coverage([a,b,c]);self.assertEqual(r['pairs'],3);self.assertEqual(r['baselineSafetyReviewRequired'],1);self.assertEqual(r['withoutTypedProof'],2)

class SpireSourceNativeRegistration(unittest.TestCase):
 def setUp(self):
  self.source={'name':'Dr Alex Jones','profile_url':'https://www.spirehealthcare.com/spire-example-hospital/consultants/dr-alex-jones-c1234567','gmc_number':None}
  self.target={'id':'fictional-row','name':'Dr Alex Jones','gmc_number':'1234567'}
 def gate(self,provider='Spire Healthcare'):
  self.target['profile_urls']={'Spire':self.source['profile_url']}
  binding=make_binding(self.source,self.target,provider=provider,source_file='source.json',source_index=0,source_file_sha256='a'*64,baseline_sha256='b'*64,url=self.source['profile_url'])
  return assess_ownership(self.source,self.target,binding,source_file_sha256='a'*64,baseline_sha256='b'*64)
 def test_exact_official_c_gmc_and_both_names_corroborate_existing_owner(self):
  before=copy.deepcopy(self.source);r=self.gate();self.assertTrue(r['mayPrepareSourceProposals']);self.assertEqual(r['sourceRegistrations'],{});self.assertIn('official-spire-c-gmc',r['identityBasis']);self.assertFalse(r['liveRegisterVerified']);self.assertEqual(self.source,before)
 def test_matching_url_does_not_invent_absent_baseline_registration(self):
  self.target.pop('gmc_number');r=self.gate();self.assertFalse(r['mayPrepareSourceProposals']);self.assertEqual(r['decision'],'ownership-review-required')
 def test_conflicting_c_suffix_cannot_be_hidden_by_matching_structured_fields(self):
  self.source['gmc_number']='1234567';self.source['profile_url']=self.source['profile_url'].replace('c1234567','c7654321');r=self.gate();self.assertEqual(r['decision'],'hold-required');self.assertIn('spire-profile-baseline-registration-conflict',r['reasons'])
 def test_matching_suffix_does_not_override_conflicting_explicit_source_registration(self):
  self.source['gmc_number']='7654321';self.assertEqual(self.gate()['decision'],'hold-required')
 def test_other_suffixes_are_never_gmc_or_invented_other_authority(self):
  original=self.source['profile_url']
  for suffix in ['p','n','ch']:
   self.source['profile_url']=original.replace('c1234567',suffix+'1234567');r=self.gate();self.assertEqual(r['decision'],'hold-required');self.assertIn('spire-profile-registration-body-conflict',r['reasons'])
  self.target.pop('gmc_number');self.assertEqual(self.gate()['decision'],'ownership-review-required')
 def test_header_must_identify_the_existing_owner(self):
  self.source['name']='Dr Jamie Brown';self.assertEqual(self.gate()['decision'],'ownership-review-required')
 def test_slug_must_identify_both_records(self):
  self.source['profile_url']=self.source['profile_url'].replace('alex-jones','jamie-brown');self.assertEqual(self.gate()['decision'],'ownership-review-required')
 def test_complete_name_with_trailing_nickname_retains_existing_corpus_rule(self):
  self.source['profile_url']=self.source['profile_url'].replace('alex-jones-c','alex-jones-al-c');self.assertTrue(self.gate()['mayPrepareSourceProposals'])
 def test_other_provider_host_ports_and_routes_never_assert_spire_registration(self):
  original=self.source['profile_url']
  for url in [original.replace('spirehealthcare.com','spirehealthcare.com.example.org'),original.replace('www.spirehealthcare.com','www.spirehealthcare.com:443'),original.replace('/consultants/','/news/'),original.replace('https:','http:')]:
   self.source['profile_url']=url;r=self.gate();self.assertFalse(r['mayPrepareSourceProposals']);self.assertIsNone(r['sourceNativeProfileAssertion'])
  self.source['profile_url']=original;self.assertFalse(self.gate(provider='Other provider')['mayPrepareSourceProposals'])
 def test_malformed_number_and_invalid_recorded_field_remain_unresolved(self):
  original=self.source['profile_url']
  for token in ['c123456','c12345678','c0000000']:
   self.source['profile_url']=original.replace('c1234567',token);self.assertFalse(self.gate()['mayPrepareSourceProposals'])
  self.source['profile_url']=original;self.source['hcpc_number']='Current';r=self.gate();self.assertFalse(r['mayPrepareSourceProposals']);self.assertIn('unusable-typed-registration-needs-review',r['reasons'])

class NativeImportOwnership(unittest.TestCase):
 def setUp(self):
  self.base=ProviderOwnership();self.base.setUp();self.base.source.pop('gmc_number');self.base.target.pop('gmc_number')
 def review(self):
  b=self.base.binding()
  return {'schemaVersion':1,'decision':'source-native-import-continuity','reviewId':'native-primary','reviewer':'first-reviewer','rationale':'Exact source row reproduces the immutable original native append; identity persists in the professional baseline. No cross-provider join is claimed.','binding':b,'secondaryReviewer':'second-reviewer','secondaryReviewId':'native-secondary','secondaryReceiptSha256':'c'*64,'nativeImport':{
   **{k:b[k] for k in ['sourceRecordId','sourceIndex','sourceFileSha256','sourceRowSha256','baselineRowSha256']},
   'importer':{'path':'archive/import.py','sha256':'d'*64,'function':'create_unmatched_record'},'originalSource':{'path':'archive/original-source.json','sha256':b['sourceFileSha256'],'rowSha256':b['sourceRowSha256'],'sourceIndex':b['sourceIndex'],'name':self.base.source['name'],'profileUrl':self.base.source['profile_url']},'datedOutput':{'path':'archive/dated-output.json','sha256':'e'*64,'rowSha256':'f'*64,'identity':{'id':self.base.target['id'],'name':self.base.source['name'],'profileUrl':self.base.source['profile_url']}},'professionalProjectionReproduced':True,'crossProviderMatchingExecuted':False,'fieldMeaningApproval':False}}
 def test_native_source_can_recover_own_fields_without_second_provider(self):
  before=copy.deepcopy([self.base.source,self.base.target]);r=self.base.run_gate(review=self.review());self.assertTrue(r['mayPrepareSourceProposals']);self.assertTrue(r['nativeImportContinuityReviewed']);self.assertFalse(r['fieldMeaningApproved']);self.assertEqual(before,[self.base.source,self.base.target])
 def test_prefix_and_equal_biography_without_receipt_are_insufficient(self):
  self.base.target['id']='example_5';self.assertEqual(self.base.run_gate()['decision'],'ownership-review-required')
 def test_native_receipt_cannot_override_same_authority_conflict(self):
  self.base.source['gmc_number']='1234567';self.base.target['gmc_number']='7654321';self.assertEqual(self.base.run_gate(review=self.review())['decision'],'hold-required')
 def test_native_receipt_cannot_override_clearly_different_owner_role(self):
  self.base.source['about']='Dr Alex Jones is a physiotherapist.';self.base.target['about']='Dr Alex Jones is a cardiologist.';self.assertEqual(self.base.run_gate(review=self.review())['decision'],'hold-required')
 def test_native_metadata_error_remains_field_review_without_losing_owned_background(self):
  for r in [self.base.source,self.base.target]:r.update(specialty='Psychology',about='Dr Alex Jones is a dietitian.')
  r=self.base.run_gate(review=self.review());self.assertTrue(r['mayPrepareSourceProposals']);self.assertTrue(r['fieldReviewRequired']);self.assertFalse(r['fieldMeaningApproved'])
 def test_native_invalid_registration_does_not_become_an_identifier(self):
  self.base.source['hcpc_number']='Current';self.base.target['hcpc_number']='Current';r=self.base.run_gate(review=self.review());self.assertTrue(r['mayPrepareSourceProposals']);self.assertEqual(r['sourceRegistrations'],{});self.assertTrue(r['fieldReviewRequired'])
 def test_native_invalid_url_continuity_does_not_create_a_public_link(self):
  self.base.url='not a URL';self.base.source['profile_url']=self.base.url;self.base.target['profile_urls']={'example':self.base.url};r=self.base.run_gate(review=self.review());self.assertTrue(r['mayPrepareSourceProposals']);self.assertFalse(r['canonicalProfileBound']);self.assertTrue(r['fieldReviewRequired']);self.assertIsNone(r['binding']['canonicalProfileUrl'])
 def test_native_source_and_original_identity_binding_fail_closed(self):
  for field,value in [('sourceRecordId','another-row'),('sourceIndex',99),('sourceRowSha256','0'*64),('sourceFileSha256','0'*64),('baselineRowSha256','0'*64)]:
   r=self.review();r['nativeImport'][field]=value
   with self.assertRaisesRegex(ValueError,'binding drift'):self.base.run_gate(review=r)
  for field,value in [('id','another-row'),('name','Dr Jamie Brown'),('profileUrl','https://example.org/another')]:
   r=self.review();r['nativeImport']['datedOutput']['identity'][field]=value
   with self.assertRaises(ValueError):self.base.run_gate(review=r)
 def test_native_receipt_needs_real_hash_shapes_and_independent_secondary(self):
  for descriptor in ['importer','originalSource','datedOutput']:
   r=self.review();r['nativeImport'][descriptor]['sha256']='missing'
   with self.assertRaisesRegex(ValueError,'file receipt'):self.base.run_gate(review=r)
  r=self.review();r['secondaryReviewer']=r['reviewer']
  with self.assertRaisesRegex(ValueError,'independent secondary'):self.base.run_gate(review=r)
 def test_native_review_cannot_approve_fuzzy_matching_or_field_meaning(self):
  for field,value in [('professionalProjectionReproduced',False),('crossProviderMatchingExecuted',True),('fieldMeaningApproval',True)]:
   r=self.review();r['nativeImport'][field]=value
   with self.assertRaises(ValueError):self.base.run_gate(review=r)
 def test_different_selected_export_requires_same_original_named_profile(self):
  r=self.review();r['nativeImport']['originalSource'].update(sha256='9'*64,rowSha256='8'*64,sourceIndex=15)
  self.assertTrue(self.base.run_gate(review=r)['mayPrepareSourceProposals'])
  r['nativeImport']['originalSource']['profileUrl']='https://example.org/another-person'
  with self.assertRaises(ValueError):self.base.run_gate(review=r)

if __name__=='__main__':unittest.main()
