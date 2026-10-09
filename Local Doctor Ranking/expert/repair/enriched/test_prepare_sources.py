"""Synthetic parser contract cases; no source archives needed."""
import unittest
from prepare_sources import canonical,compatible,strings,issues,hash_value
from verify_sources import read_html
from finalize_professional_scope import issue

class SourceContracts(unittest.TestCase):
 def test_urls_reject_credentials(self):self.assertIsNone(canonical('https://name:secret@example.org/consultant'))
 def test_urls_strip_fragment_not_identity(self):self.assertEqual(canonical('https://example.org/person/?x=1#quote'),'https://example.org/person')
 def test_names_do_not_accept_same_surname_alone(self):self.assertFalse(compatible('Dr Helen Jones','Dr David Jones'))
 def test_initial_matching_does_not_create_identity(self):self.assertTrue(compatible('Dr H Jones','Helen Jones'))
 def test_source_array_positions_preserved(self):self.assertEqual(list(strings(['','CT','MR'])),[((1,),'CT'),((2,),'MR')])
 def test_qualification_year_not_standalone_expertise(self):self.assertEqual(list(strings({'degree':'MRCP','institution':'London','year':'2012'})),[(('degree',),'MRCP')])
 def test_unknown_encoding_withheld(self):self.assertIn('ambiguous-source-encoding',issues('Clinical \ufffd information'))
 def test_contact_not_professional_evidence(self):self.assertIn('contact-or-external-link-content',issues('Contact hello@example.org'))
 def test_partial_entity_not_guessed(self):self.assertIn('incomplete-recorded-html-entity',issues('Ashford &amp'))
 def test_complete_entity_not_withheld_as_partial(self):self.assertNotIn('incomplete-recorded-html-entity',issues('Ashford &amp; St Peters'))
 def test_html_preserves_negation_and_short_modalities(self):
  binary=b'<h4>Clinical</h4><p>No:</p><ul><li>CT</li><li>MR</li></ul><h4>Other</h4><p>Ignore</p>'
  self.assertEqual(read_html(binary,'Clinical'),'No:\nCT\nMR')
 def test_html_preserves_inline_words_and_ranges(self):self.assertEqual(read_html(b'<h4>Training</h4><p>Car<em>dio</em>logy 2001-2004 &amp; &lt;=7</p>','Training'),'Cardiology 2001-2004 & <=7')
 def test_hash_stable_for_key_order(self):self.assertEqual(hash_value({'a':1,'b':2}),hash_value({'b':2,'a':1}))
 def test_personal_health_is_withheld(self):self.assertEqual(issue('Following menopause herself, she trained.'),'personal-health-history')
 def test_clinical_menopause_is_retained(self):self.assertIsNone(issue('Clinical interest in menopause care.'))
 def test_contact_admin_is_withheld(self):self.assertEqual(issue('For appointments please call the clinic.'),'contact-administration')
 def test_born_patient_population_is_not_personal_history(self):self.assertIsNone(issue('Care of babies born prematurely.'))
 def test_generic_transparency_is_not_relationship_claim(self):self.assertEqual(issue('The amount we pay this doctor is described elsewhere.'),'generic-publisher-relationship-boilerplate')
 def test_family_and_hobbies_not_professional_claims(self):self.assertIsNotNone(issue('She enjoys skiing with her three sons.'))
if __name__=='__main__':unittest.main()
